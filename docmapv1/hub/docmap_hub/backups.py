"""v0.6: automatic backups of the hub itself.

The hub keeps everything that matters (signing keys, registry, vault, issued licences) in its data
folder. ``Hub.backup()`` already writes a consistent zip of it; this module runs it on a schedule
while the hub page is open, keeps the last N automatic copies, optionally copies each one to a
second folder (USB stick, NAS, OneDrive…), and lists/serves the files for download.

Only files named ``docmap-hub-auto-*.zip`` are ever pruned: manual backups
(``run_windows.bat backup``) and the pre-migration registry copies are never removed.
Private keys stay encrypted inside the zip and the vault stays encrypted: without the passphrases a
backup is useless to whoever finds it.
"""

from __future__ import annotations

import re
import shutil
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .registry import RegistryError

AUTO_PREFIX = "docmap-hub-auto-"
NAME_RE = re.compile(r"[\w.-]{1,120}\.(zip|sqlite3|docmap-hub)")
DEFAULTS = {"auto": True, "every_hours": 24, "keep": 14, "copy_dir": ""}
CHECK_EVERY = 15 * 60      # seconds between checks while the page is open
FIRST_CHECK = 20           # first check shortly after start


def _dir(hub) -> Path:
    d = hub.dir / "backups"
    d.mkdir(parents=True, exist_ok=True)
    return d


def config(reg) -> dict:
    g = reg.get_setting
    try:
        every = int(g("backup.every_hours") or DEFAULTS["every_hours"])
    except ValueError:
        every = DEFAULTS["every_hours"]
    try:
        keep = int(g("backup.keep") or DEFAULTS["keep"])
    except ValueError:
        keep = DEFAULTS["keep"]
    return {"auto": (g("backup.auto") or "1") != "0", "every_hours": every, "keep": keep,
            "copy_dir": g("backup.copy_dir") or ""}


def set_config(reg, *, auto=None, every_hours=None, keep=None, copy_dir=None) -> dict:
    if every_hours is not None:
        every_hours = int(every_hours)
        if not 1 <= every_hours <= 24 * 7:
            raise RegistryError("Ogni quante ore: da 1 a 168.")
        reg.set_setting("backup.every_hours", str(every_hours))
    if keep is not None:
        keep = int(keep)
        if not 1 <= keep <= 365:
            raise RegistryError("Quanti backup automatici tenere: da 1 a 365.")
        reg.set_setting("backup.keep", str(keep))
    if copy_dir is not None:
        copy_dir = str(copy_dir).strip()
        if copy_dir and not Path(copy_dir).is_dir():
            raise RegistryError(f"La cartella «{copy_dir}» non esiste (chiavetta non inserita?).")
        reg.set_setting("backup.copy_dir", copy_dir or None)
    if auto is not None:
        reg.set_setting("backup.auto", "1" if auto else "0")
    return config(reg)


def list_backups(hub) -> list[dict]:
    out = []
    for f in _dir(hub).iterdir():
        if not f.is_file() or not NAME_RE.fullmatch(f.name):
            continue
        st = f.stat()
        kind = ("auto" if f.name.startswith(AUTO_PREFIX) else
                "migrazione" if f.name.startswith("registro-prima") else
                "esportazione" if f.name.endswith(".docmap-hub") else "manuale")
        out.append({"name": f.name, "size": st.st_size, "kind": kind,
                    "at": datetime.fromtimestamp(st.st_mtime, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})
    out.sort(key=lambda x: x["at"], reverse=True)
    return out


def path_of(hub, name: str) -> Path:
    if not NAME_RE.fullmatch(name or ""):
        raise RegistryError("Nome del backup non valido.")
    f = _dir(hub) / name
    if not f.is_file():
        raise RegistryError("Backup non trovato.")
    return f


def last_auto_at(hub) -> datetime | None:
    autos = [b for b in list_backups(hub) if b["kind"] == "auto"]
    if not autos:
        return None
    return datetime.strptime(autos[0]["at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def due(hub, now: datetime | None = None) -> bool:
    cfg = config(hub.registry)
    if not cfg["auto"]:
        return False
    last = last_auto_at(hub)
    now = now or datetime.now(timezone.utc)
    return last is None or now - last >= timedelta(hours=cfg["every_hours"])


def run(hub, *, auto: bool = True, log=lambda m: None) -> dict:
    """Write a backup now; for automatic ones also copy to the second folder and prune old ones."""
    cfg = config(hub.registry)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    name = (AUTO_PREFIX if auto else "docmap-hub-backup-") + stamp + ".zip"
    out = hub.backup(_dir(hub) / name)
    log(f"Backup scritto: {out.name} ({out.stat().st_size // 1024} KB)")
    res = {"name": out.name, "size": out.stat().st_size, "copied_to": None, "copy_error": None, "removed": []}
    if cfg["copy_dir"]:
        try:
            dst = Path(cfg["copy_dir"]) / out.name
            shutil.copy2(out, dst)
            res["copied_to"] = str(dst)
            log(f"Copia anche in {dst}")
        except OSError as exc:  # stick not inserted, NAS offline: the local backup is still there
            res["copy_error"] = str(exc)
            log(f"Copia nella seconda cartella non riuscita: {exc}")
    if auto:
        autos = sorted((f for f in _dir(hub).glob(AUTO_PREFIX + "*.zip") if f.is_file()),
                       key=lambda f: f.name, reverse=True)
        for old in autos[cfg["keep"]:]:
            try:
                old.unlink()
                res["removed"].append(old.name)
            except OSError:
                pass
        if res["removed"]:
            log(f"Tolti i backup automatici più vecchi: {len(res['removed'])}")
    hub.registry.log("hub.backup.auto" if auto else "hub.backup.now",
                     details={k: res[k] for k in ("name", "copied_to", "copy_error")} | {"removed": len(res["removed"])})
    return res


class Scheduler:
    """Background thread: while the hub page is open, write the automatic backup when it is due."""

    def __init__(self, data_dir: Path, lock: threading.Lock | None = None):
        self.data_dir = data_dir
        self.lock = lock or threading.Lock()
        self.stop = threading.Event()
        self.last: dict | None = None
        self.error: str | None = None

    def tick(self) -> dict | None:
        from .service import Hub
        with self.lock, Hub(self.data_dir) as h:
            if not due(h):
                return None
            try:
                self.last = run(h, auto=True)
                self.error = None
            except Exception as exc:  # never kill the page because of a backup
                self.error = str(exc)
                h.registry.log("hub.backup.error", details={"error": str(exc)})
                return None
            return self.last

    def start(self) -> threading.Thread:
        def loop():
            wait = FIRST_CHECK
            while not self.stop.wait(wait):
                try:
                    self.tick()
                except Exception as exc:
                    self.error = str(exc)
                wait = CHECK_EVERY
        t = threading.Thread(target=loop, daemon=True, name="hub-backup")
        t.start()
        return t


# ---------------------------------------------------------------------------
# v0.7: whole hub exported in ONE encrypted file (to move it to another PC or to the future server hub)
# ---------------------------------------------------------------------------

EXPORT_MAGIC = b"DOCMAP-HUB-EXPORT/1\n"
EXPORT_EXT = ".docmap-hub"
EXPORT_MIN_PASSPHRASE = 12


def export_encrypted(hub, passphrase: str) -> tuple[str, bytes]:
    """(file name, bytes): the backup zip encrypted with AES-256-GCM, key from scrypt(passphrase)."""
    import base64
    import json
    import os
    import tempfile
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from .vault import KDF_N_LOG2, KDF_P, KDF_R, derive
    if len(passphrase or "") < EXPORT_MIN_PASSPHRASE:
        raise RegistryError(f"La passphrase dell'esportazione deve avere almeno {EXPORT_MIN_PASSPHRASE} caratteri.")
    with tempfile.TemporaryDirectory() as td:
        z = hub.backup(Path(td) / "hub.zip")
        data = z.read_bytes()
    salt, nonce = os.urandom(16), os.urandom(12)
    key = derive(passphrase, salt)
    header = {"kdf": "scrypt", "n_log2": KDF_N_LOG2, "r": KDF_R, "p": KDF_P,
              "salt": base64.b64encode(salt).decode(), "nonce": base64.b64encode(nonce).decode(),
              "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "content": "zip"}
    hb = json.dumps(header, sort_keys=True).encode()
    ct = AESGCM(key).encrypt(nonce, data, EXPORT_MAGIC + hb)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    hub.registry.log("hub.export", details={"size": len(ct)})
    return f"docmap-hub-{stamp}{EXPORT_EXT}", EXPORT_MAGIC + hb + b"\n" + ct


def decrypt_export(blob: bytes, passphrase: str) -> bytes:
    import base64
    import json
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from .vault import derive
    if not blob.startswith(EXPORT_MAGIC):
        raise RegistryError("Non è un'esportazione di DocMap Hub.")
    rest = blob[len(EXPORT_MAGIC):]
    hb, _, ct = rest.partition(b"\n")
    try:
        h = json.loads(hb)
        salt, nonce = base64.b64decode(h["salt"]), base64.b64decode(h["nonce"])
        key = derive(passphrase or "", salt, int(h["n_log2"]), int(h["r"]), int(h["p"]))
        return AESGCM(key).decrypt(nonce, ct, EXPORT_MAGIC + hb)
    except InvalidTag:
        raise RegistryError("Passphrase sbagliata o file danneggiato.")
    except (ValueError, KeyError) as exc:
        raise RegistryError(f"File di esportazione non valido: {exc}")


def import_encrypted(blob: bytes, passphrase: str, data_dir: Path) -> dict:
    """Restore into an EMPTY hub data folder (never over an existing hub)."""
    import io
    import zipfile
    data_dir = Path(data_dir)
    if (data_dir / "registry.sqlite3").exists():
        raise RegistryError(f"In {data_dir} c'è già un hub: l'importazione va fatta in una cartella dati vuota.")
    raw = decrypt_export(blob, passphrase)
    data_dir.mkdir(parents=True, exist_ok=True)
    allowed = ("registry.sqlite3", "plans.json", "known_hosts")
    n = 0
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        for name in z.namelist():
            ok = name in allowed or (name.count("/") == 1 and name.split("/")[0] in ("keys", "issued")
                                     and name.split("/")[1] and ".." not in name)
            if not ok:
                continue
            target = data_dir / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(z.read(name))
            n += 1
    return {"files": n, "data_dir": str(data_dir)}
