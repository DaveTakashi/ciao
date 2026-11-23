"""v0.12: «Controllo dell'hub» — one command that says whether this PC, its data and the program are fine.

    run_windows.bat controllo          (also inside RACCOGLI-INFO.bat, and Impostazioni → Controllo dell'hub)

It never changes anything and never needs a passphrase. It must also work when the hub itself would not
start (registry damaged, wrong Python, program folder incomplete), so every check is defensive and the
registry is opened read-only, without migrations.

Each result: ``{"id", "level": "ok"|"warn"|"error", "title", "detail", "fix"}`` (Italian, for Dave).
"""

from __future__ import annotations

import json
import shutil
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from . import __version__, paths
from .branding import brand_name as _bn

LEVELS = ("ok", "warn", "error")
MIN_PY = (3, 11)
FREE_WARN = 500 * 1024 * 1024
FREE_ERROR = 50 * 1024 * 1024
BACKUP_OLD_DAYS = 7


def _r(id_: str, level: str, title: str, detail: str = "", fix: str = "") -> dict:
    return {"id": id_, "level": level, "title": title, "detail": detail, "fix": fix}


def _check_python() -> list[dict]:
    v = sys.version_info
    ver = f"{v.major}.{v.minor}.{v.micro}"
    out = []
    if (v.major, v.minor) < MIN_PY:
        out.append(_r("python", "error", f"Python {ver} è troppo vecchio",
                      "L'hub ha bisogno di Python 3.11 o successivo (consigliato 3.13).",
                      "Installa Python 3.13 da python.org, poi cancella la cartella hub\\.venv e riavvia run_windows.bat."))
    else:
        out.append(_r("python", "ok", f"Python {ver}", sys.executable))
    try:
        import cryptography
        out.append(_r("cryptography", "ok", f"Libreria cryptography {cryptography.__version__}"))
    except ImportError:
        out.append(_r("cryptography", "error", "Manca la libreria cryptography",
                      "Senza di lei l'hub non firma licenze e non apre la cassaforte.",
                      "Cancella la cartella hub\\.venv e riavvia run_windows.bat (la reinstalla da solo)."))
    return out


def _check_data_dir(d: Path) -> list[dict]:
    out = []
    if not d.exists():
        return [_r("data", "warn", "Cartella dati non ancora creata", str(d),
                   "È normale prima del primo avvio: avvia run_windows.bat.")]
    try:
        with tempfile.NamedTemporaryFile(dir=d, prefix=".controllo-", delete=True) as f:
            f.write(b"ok")
        out.append(_r("data", "ok", "Cartella dati scrivibile", str(d)))
    except OSError as exc:
        out.append(_r("data", "error", "Non riesco a scrivere nella cartella dati", f"{d}: {exc}",
                      "Controlla che il disco non sia pieno e che la cartella non sia in sola lettura "
                      "(o bloccata da un antivirus / OneDrive)."))
    try:
        free = shutil.disk_usage(d).free
        mb = free // (1024 * 1024)
        if free < FREE_ERROR:
            out.append(_r("disk", "error", f"Disco quasi pieno: {mb} MB liberi", str(d),
                          "Libera spazio: senza spazio i backup e il registro non si salvano."))
        elif free < FREE_WARN:
            out.append(_r("disk", "warn", f"Poco spazio su disco: {mb} MB liberi", str(d),
                          "Libera almeno 1 GB: i backup automatici ne hanno bisogno."))
        else:
            out.append(_r("disk", "ok", f"Spazio libero: {mb // 1024} GB"))
    except OSError:
        pass
    return out


def _check_registry(d: Path) -> tuple[list[dict], dict]:
    from .registry import DB_NAME, SCHEMA_VERSION
    db = d / DB_NAME
    facts: dict = {}
    if not db.exists():
        return [_r("registry", "warn", "Registro non ancora creato", str(db),
                   "È normale prima del primo avvio.")], facts
    try:
        conn = sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True, timeout=5)
        try:
            integ = conn.execute("PRAGMA integrity_check").fetchone()[0]
            meta = {}
            try:
                meta = dict(conn.execute("SELECT key, value FROM meta").fetchall())
            except sqlite3.Error:
                pass
            for t in ("customers", "instances", "environments", "licences"):
                try:
                    facts[t] = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                except sqlite3.Error:
                    facts[t] = None
            try:
                facts["settings"] = dict(conn.execute("SELECT key, value FROM settings").fetchall())
            except sqlite3.Error:
                facts["settings"] = {}
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return [_r("registry", "error", "Il registro non si apre", f"{db}: {exc}",
                   "Ripristina l'ultimo backup buono: run_windows.bat ripristina-backup")], facts
    out = []
    if integ != "ok":
        out.append(_r("registry", "error", "Registro rovinato", f"integrity_check: {integ}",
                      "Chiudi l'hub e ripristina l'ultimo backup buono: run_windows.bat ripristina-backup"))
    else:
        n = facts.get("customers")
        out.append(_r("registry", "ok", "Registro integro",
                      f"{n if n is not None else '?'} clienti, {facts.get('environments') or 0} siti/server, "
                      f"{facts.get('licences') or 0} licenze emesse"))
    try:
        schema = int(meta.get("schema_version") or 0)
    except ValueError:
        schema = 0
    facts["schema"] = schema
    if schema > SCHEMA_VERSION:
        out.append(_r("schema", "error", f"Dati di un hub più nuovo (schema {schema}, questo hub arriva al {SCHEMA_VERSION})",
                      "Stai usando una versione dell'hub più vecchia di quella che ha già aggiornato i dati.",
                      "Usa la cartella dell'hub più nuova (quella con il numero più alto)."))
    elif schema and schema < SCHEMA_VERSION:
        out.append(_r("schema", "warn", f"Registro allo schema {schema}: si aggiorna al {SCHEMA_VERSION} al prossimo avvio",
                      "Prima dell'aggiornamento l'hub fa da solo una copia del registro."))
    else:
        out.append(_r("schema", "ok", f"Schema del registro {schema or SCHEMA_VERSION}"))
    last, top = meta.get("hub_version"), meta.get("hub_version_max")
    from .service import version_tuple
    if top and version_tuple(__version__) < version_tuple(top):
        out.append(_r("version", "warn", f"Hub {__version__} più vecchio di quello già usato ({top})",
                      "Funziona (le migrazioni sono solo aggiunte), ma le cose nuove della " + top + " qui non ci sono.",
                      "Avvia la cartella dell'hub " + top + " o più nuova."))
    else:
        out.append(_r("version", "ok", f"{_bn()} Hub {__version__}",
                      f"versione precedente su questi dati: {last}" if last and last != __version__ else ""))
    return out, facts


def _check_keys(d: Path) -> list[dict]:
    idx_path = d / "keys" / "keys.json"
    if not idx_path.exists():
        return [_r("keys", "warn", "Nessuna chiave di firma", "Senza chiave non si emettono licenze.",
                   "Al primo accesso la pagina dell'hub la crea; oppure: run_windows.bat keygen")]
    try:
        idx = json.loads(idx_path.read_text("utf-8"))
    except (OSError, ValueError) as exc:
        return [_r("keys", "error", "Indice delle chiavi illeggibile", f"{idx_path}: {exc}",
                   "Ripristina l'ultimo backup buono: run_windows.bat ripristina-backup")]
    act = idx.get("active")
    if not act:
        return [_r("keys", "warn", "Nessuna chiave di firma attiva", "", "run_windows.bat keygen")]
    if not (d / "keys" / f"{act}.key.pem").exists():
        return [_r("keys", "error", f"Manca il file della chiave attiva {act}", str(d / "keys"),
                   "Ripristina l'ultimo backup buono: run_windows.bat ripristina-backup")]
    return [_r("keys", "ok", f"Chiave di firma {act}", f"{len(idx.get('keys') or [])} chiavi in tutto")]


def _check_backups(d: Path, settings: dict) -> list[dict]:
    from . import backups as B
    bdir = d / "backups"
    out = []
    files = []
    if bdir.is_dir():
        files = sorted((f for f in bdir.iterdir() if f.is_file() and B.NAME_RE.fullmatch(f.name)
                        and f.suffix == ".zip"), key=lambda f: f.stat().st_mtime, reverse=True)
    auto_on = (settings.get("backup.auto") or "1") != "0"
    if not files:
        out.append(_r("backup", "warn", "Ancora nessun backup dell'hub", "",
                      "Impostazioni → Backup → «Fai un backup adesso» (o run_windows.bat backup)."))
    else:
        newest = files[0]
        age = (datetime.now(timezone.utc).timestamp() - newest.stat().st_mtime) / 86400
        chk = B.verify(newest)
        if not chk["ok"]:
            out.append(_r("backup", "error", f"L'ultimo backup non si può ripristinare ({newest.name})",
                          "; ".join(chk["problems"]), "Fai subito un backup nuovo e controllalo."))
        elif age > BACKUP_OLD_DAYS:
            out.append(_r("backup", "warn", f"Ultimo backup di {int(age)} giorni fa", newest.name,
                          "Apri la pagina dell'hub (i backup automatici girano mentre è aperta) o fai un backup adesso."))
        else:
            out.append(_r("backup", "ok", "Ultimo backup controllato: si può ripristinare",
                          f"{newest.name} ({'oggi' if age < 1 else f'{int(age)} giorni fa'})"))
    if not auto_on:
        out.append(_r("backup-auto", "warn", "Backup automatici spenti", "", "Impostazioni → Backup → riaccendili."))
    copy_dir = settings.get("backup.copy_dir") or ""
    if not copy_dir:
        out.append(_r("backup-copy", "warn", "I backup sono solo su questo PC",
                      "Se il disco si rompe, chiavi e cassaforte sono perse.",
                      "Impostazioni → Backup → seconda cartella (chiavetta, disco esterno, OneDrive)."))
    elif not Path(copy_dir).is_dir():
        out.append(_r("backup-copy", "warn", "La seconda cartella dei backup non c'è adesso", copy_dir,
                      "Inserisci la chiavetta / collega il disco: la copia riprende da sola."))
    else:
        out.append(_r("backup-copy", "ok", "Seconda copia dei backup", copy_dir))
    return out


def _check_program(settings: dict) -> list[dict]:
    from . import runner
    out = []
    try:
        script = runner.build_deploy_script(_SettingsReg(settings))  # type: ignore[arg-type]
        root = script.parent.parent
        app_v = _app_version(root)
        out.append(_r("program", "ok", f"Programma {_bn()} completo accanto all'hub",
                      f"{root}" + (f" · app {app_v}" if app_v else "")))
    except Exception as exc:  # noqa: BLE001 - RunnerError or anything odd: report, do not crash
        out.append(_r("program", "warn", "Non trovo tools\\build_deploy.py",
                      str(exc).splitlines()[0],
                      "Estrai di nuovo TUTTO lo zip e avvia hub\\run_windows.bat da lì (serve per pubblicare i siti)."))
    for k in ("installer_dir", "docmap_dir", "server_python_dir"):
        v = settings.get(k)
        if v and not Path(v).exists():
            out.append(_r("setting-" + k, "warn", f"L'impostazione {k} punta a una cartella che non c'è più", v,
                          f"run_windows.bat settings unset {k}"))
    return out


class _SettingsReg:
    """Just enough of Registry for runner.docmap_roots (read-only settings)."""

    def __init__(self, settings: dict):
        self._s = settings

    def get_setting(self, key, default=None):
        return self._s.get(key, default)


def _app_version(root: Path) -> str | None:
    import re
    try:
        txt = (root / "assets" / "js" / "02-core.js").read_text("utf-8", "replace")
    except OSError:
        return None
    m = re.search(r"APP_VERSION\s*=\s*['\"]([^'\"]+)['\"]", txt)
    return m.group(1) if m else None


def run(data_dir=None) -> dict:
    """All checks. Never raises for a problem it can describe."""
    d = paths.resolve(data_dir)
    results: list[dict] = []
    results += _check_python()
    results += _check_data_dir(d)
    reg_results, facts = _check_registry(d)
    results += reg_results
    results += _check_keys(d)
    settings = facts.get("settings") or {}
    results += _check_backups(d, settings)
    results += _check_program(settings)
    worst = max((LEVELS.index(r["level"]) for r in results), default=0)
    return {"version": __version__, "data_dir": str(d), "level": LEVELS[worst], "results": results,
            "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "counts": {lv: sum(1 for r in results if r["level"] == lv) for lv in LEVELS}}


def text_report(rep: dict) -> str:
    mark = {"ok": "OK       ", "warn": "ATTENZIONE", "error": "ERRORE   "}
    lines = [f"Controllo dell'hub {rep['version']} — dati in {rep['data_dir']}", ""]
    for r in rep["results"]:
        lines.append(f"[{mark[r['level']]}] {r['title']}" + (f" — {r['detail']}" if r["detail"] else ""))
        if r["fix"] and r["level"] != "ok":
            lines.append(f"             cosa fare: {r['fix']}")
    c = rep["counts"]
    lines += ["", {"ok": "Tutto a posto.", "warn": f"Da guardare: {c['warn']} (nessun errore).",
                   "error": f"ERRORI: {c['error']}, da guardare: {c['warn']}."}[rep["level"]]]
    return "\n".join(lines)
