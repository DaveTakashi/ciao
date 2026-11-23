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

import json
import re
import shutil
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .registry import RegistryError
from .branding import brand_name as _bn

AUTO_PREFIX = "docmap-hub-auto-"
UPGRADE_PREFIX = "docmap-hub-prima-della-"   # v0.12: written by the first run of a new hub version
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
                "aggiornamento" if f.name.startswith(UPGRADE_PREFIX) else
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
    # v0.12: a backup nobody can restore is worse than none: check it at once (zip, registry, keys)
    chk = verify(out)
    res["verified"] = chk["ok"]
    res["verify_problems"] = chk["problems"]
    log("Backup controllato: si può ripristinare." if chk["ok"]
        else "ATTENZIONE: il backup appena fatto non supera il controllo: " + "; ".join(chk["problems"]))
    hub.registry.log("hub.backup.auto" if auto else "hub.backup.now",
                     details={k: res[k] for k in ("name", "copied_to", "copy_error", "verified")}
                     | {"removed": len(res["removed"])})
    if not chk["ok"]:
        raise RegistryError("Il backup " + out.name + " non supera il controllo: " + "; ".join(chk["problems"]))
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
        raise RegistryError(f"Non è un'esportazione di {_bn()} Hub.")
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


# ---------------------------------------------------------------------------
# v0.12: check a backup, restore it (hub closed; nothing deleted: the current data is moved aside first)
# ---------------------------------------------------------------------------

ZIP_TOP = ("registry.sqlite3", "plans.json", "known_hosts", "vault-export.json")
ZIP_DIRS = ("keys", "issued")
RESTORE_ASIDE = "prima-del-ripristino-"


def _zip_name_ok(name: str) -> bool:
    if name in ZIP_TOP:
        return True
    parts = name.split("/")
    return len(parts) == 2 and parts[0] in ZIP_DIRS and bool(parts[1]) and ".." not in name and "\\" not in name


def _registry_facts(db: Path) -> dict:
    """Integrity, schema and a few counts of a registry file (opened read-only, never migrated)."""
    import sqlite3
    facts: dict = {"integrity": None, "schema": None, "counts": {}}
    conn = sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True)
    try:
        facts["integrity"] = conn.execute("PRAGMA integrity_check").fetchone()[0]
        try:
            r = conn.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()
            facts["schema"] = int(r[0]) if r else 0
        except sqlite3.Error:
            facts["schema"] = 0
        for t in ("customers", "instances", "licences", "environments", "secrets"):
            try:
                facts["counts"][t] = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            except sqlite3.Error:
                pass
        try:
            r = conn.execute("SELECT value FROM meta WHERE key='hub_version'").fetchone()
            facts["hub_version"] = r[0] if r else None
        except sqlite3.Error:
            facts["hub_version"] = None
    finally:
        conn.close()
    return facts


def verify(path: Path) -> dict:
    """Can this backup be restored? zip CRC, allowed names only, registry integrity, signing keys present.

    Works on ``.zip`` backups and on ``.sqlite3`` registry copies; encrypted ``.docmap-hub`` exports need the
    passphrase and are checked by ``importa-hub``."""
    import sqlite3
    import tempfile
    import zipfile
    from .registry import SCHEMA_VERSION
    path = Path(path)
    res = {"name": path.name, "ok": False, "problems": [], "kind": "zip", "schema": None, "counts": {},
           "keys": 0, "active_key": None, "files": 0, "hub_version": None}
    p = res["problems"]
    if not path.is_file():
        p.append("file non trovato")
        return res
    if path.name.endswith(".docmap-hub"):
        res["kind"] = "esportazione"
        p.append("esportazione cifrata: si controlla e si ripristina con «importa-hub» e la sua passphrase")
        return res
    with tempfile.TemporaryDirectory() as td:
        db = Path(td) / "registry.sqlite3"
        if path.suffix == ".sqlite3":
            res["kind"] = "registro"
            db.write_bytes(path.read_bytes())
        else:
            try:
                with zipfile.ZipFile(path) as z:
                    bad = z.testzip()
                    if bad:
                        p.append(f"file rovinato dentro lo zip: {bad}")
                    names = [n for n in z.namelist() if not n.endswith("/")]
                    res["files"] = len(names)
                    strange = [n for n in names if not _zip_name_ok(n)]
                    if strange:
                        p.append("file che un backup dell'hub non contiene: " + ", ".join(strange[:5]))
                    if "registry.sqlite3" not in names:
                        p.append("manca il registro (registry.sqlite3)")
                    else:
                        db.write_bytes(z.read("registry.sqlite3"))
                    if "keys/keys.json" in names:
                        try:
                            idx = json.loads(z.read("keys/keys.json").decode("utf-8"))
                            res["active_key"] = idx.get("active")
                            keys = idx.get("keys") or []
                            res["keys"] = len(keys) if isinstance(keys, (list, dict)) else 0
                            if res["active_key"] and f"keys/{res['active_key']}.key.pem" not in names:
                                p.append(f"manca la chiave privata attiva ({res['active_key']})")
                        except (ValueError, UnicodeDecodeError):
                            p.append("indice delle chiavi (keys/keys.json) illeggibile")
            except zipfile.BadZipFile:
                p.append("non è uno zip valido (scaricato a metà o rovinato)")
            except OSError as exc:
                p.append(f"non riesco a leggere il file: {exc}")
        if db.exists() and db.stat().st_size:
            try:
                f = _registry_facts(db)
                res.update(schema=f["schema"], counts=f["counts"], hub_version=f.get("hub_version"))
                if f["integrity"] != "ok":
                    p.append(f"registro rovinato ({f['integrity']})")
                if f["schema"] and f["schema"] > SCHEMA_VERSION:
                    p.append(f"registro di un hub più nuovo (schema {f['schema']}, questo hub arriva al "
                             f"{SCHEMA_VERSION}): ripristinalo con l'hub più nuovo")
            except sqlite3.Error as exc:
                p.append(f"il registro non si apre: {exc}")
    res["ok"] = not p
    return res


def hub_page_open(data_dir: Path, timeout: float = 2.0) -> str | None:
    """URL of the hub page if it is running now for this data folder (the marker alone may be stale)."""
    import urllib.request
    marker = Path(data_dir) / "pagina-hub.txt"
    try:
        url = marker.read_text("utf-8").strip()
    except OSError:
        return None
    if not url.startswith("http://127.0.0.1:"):
        return None
    import urllib.error
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(url, timeout=timeout):
            return url
    except urllib.error.HTTPError:
        return url          # it answered: it is running
    except (OSError, ValueError):
        return None         # nobody there: the marker is left over from a crash


def restore(data_dir: Path, src: Path, *, log=lambda m: None) -> dict:
    """Put a backup back into the hub data folder. The hub page must be closed.

    Nothing is deleted: the registry, keys and issued licences in use now are MOVED to
    ``backups/prima-del-ripristino-<time>/`` first, so a restore can itself be undone by restoring that folder
    by hand. Customer packages (``clienti/``), the remembered sign-in and the settings files stay as they are."""
    import tempfile
    import zipfile
    data_dir = Path(data_dir)
    src = Path(src)
    chk = verify(src)
    if not chk["ok"]:
        raise RegistryError("Questo backup non si può ripristinare: " + "; ".join(chk["problems"]))
    url = hub_page_open(data_dir)
    if url:
        raise RegistryError(f"La pagina dell'hub è aperta ({url}): chiudila (Ctrl+C nella finestra nera) e riprova.")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    aside = data_dir / "backups" / (RESTORE_ASIDE + stamp)
    aside.mkdir(parents=True, exist_ok=False)
    moved = []
    names = ["registry.sqlite3", "registry.sqlite3-wal", "registry.sqlite3-shm", "registry.sqlite3-journal"]
    if chk["kind"] == "zip":
        names += ["keys", "issued", "plans.json", "known_hosts"]
    for n in names:
        cur = data_dir / n
        if cur.exists():
            shutil.move(str(cur), str(aside / n))
            moved.append(n)
    log(f"Dati di adesso messi da parte in {aside} ({', '.join(moved) or 'niente'})")
    try:
        if chk["kind"] == "registro":
            shutil.copy2(src, data_dir / "registry.sqlite3")
            written = 1
        else:
            written = 0
            with tempfile.TemporaryDirectory(dir=data_dir) as td, zipfile.ZipFile(src) as z:
                for name in z.namelist():
                    if name.endswith("/") or not _zip_name_ok(name) or name == "vault-export.json":
                        continue
                    t = Path(td) / name
                    t.parent.mkdir(parents=True, exist_ok=True)
                    t.write_bytes(z.read(name))
                for item in Path(td).iterdir():
                    shutil.move(str(item), str(data_dir / item.name))
                    written += 1
        for sub in ("keys", "issued", "backups"):
            (data_dir / sub).mkdir(parents=True, exist_ok=True)
    except Exception:
        # put back what was there: the hub must never be left half restored
        for n in moved:
            target = data_dir / n
            if target.is_dir():
                shutil.rmtree(target, ignore_errors=True)
            elif target.exists():
                target.unlink()
            shutil.move(str(aside / n), str(target))
        raise
    log(f"Backup rimesso: {src.name}")
    return {"restored": src.name, "aside": str(aside), "moved": moved, "kind": chk["kind"],
            "schema": chk["schema"], "counts": chk["counts"], "active_key": chk["active_key"], "items": written}
