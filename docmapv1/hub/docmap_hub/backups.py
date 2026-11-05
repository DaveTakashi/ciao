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
NAME_RE = re.compile(r"[\w.-]{1,120}\.(zip|sqlite3)")
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
                "migrazione" if f.name.startswith("registro-prima") else "manuale")
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
