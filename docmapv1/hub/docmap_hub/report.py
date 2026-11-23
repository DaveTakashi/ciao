"""v0.12: «Situazione dei clienti» — one row per site / office server of every customer, for Excel.

    run_windows.bat cliente situazione --csv C:\\Users\\Dave\\Desktop\\clienti.csv
    page: Clienti → «Esporta situazione (Excel)»  (/scarica/situazione-clienti.csv)

Read-only. Columns separated by ``;`` with a UTF-8 BOM so Excel in Italian opens it straight away.
No secrets: no passwords, tokens or keys, only what the registry already shows on screen.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone

from . import licence as L

COLUMNS = [
    ("customer", "Cliente"), ("vat_id", "P.IVA"), ("email", "Email"), ("customer_status", "Stato cliente"),
    ("instance", "Installazione"), ("env", "Sito o server"), ("kind", "Tipo"), ("url", "Indirizzo"),
    ("app_version", "Versione app"), ("up_to_date", "Aggiornato"), ("last_check", "Ultimo controllo"),
    ("check_ok", "Risponde"), ("last_deploy", "Ultimo deploy"), ("plan", "Piano"),
    ("licence_expires", "Scadenza licenza"), ("licence_state", "Stato licenza"),
]
KIND = {"web-php": "sito online", "studio-python": "server in sede", "local-python": "prova sul PC"}
SOON_DAYS = 30


def _day(ts: str | None) -> str:
    return (ts or "")[:10]


def licence_state(lic: dict | None, now: datetime) -> str:
    if not lic:
        return "nessuna"
    st = lic.get("status")
    if st == L.STATUS_REVOKED:
        return "revocata"
    if st == L.STATUS_SUSPENDED:
        return "sospesa"
    try:
        exp = L.parse_time(lic["expires_at"])
    except (KeyError, ValueError, TypeError):
        return "?"
    if exp < now:
        return "scaduta"
    if exp - now <= timedelta(days=SOON_DAYS):
        return f"in scadenza ({(exp - now).days} giorni)"
    return "attiva"


def rows(hub, now: datetime | None = None) -> list[dict]:
    from . import sitesetup as SS
    reg = hub.registry
    now = now or datetime.now(timezone.utc)
    target = SS.available_version(reg)
    old = {s["env_id"] for s in SS.outdated_sites(hub, target, include_staging=True)} if target else set()
    envs_by_inst: dict[str, list[dict]] = {}
    for e in reg.list_environments():
        envs_by_inst.setdefault(e["instance_id"], []).append(e)
    out = []
    for c in reg.list_customers():
        base = {"customer": c["name"], "vat_id": c.get("vat_id") or "", "email": c.get("email") or "",
                "customer_status": c.get("status") or "active"}
        insts = reg.list_instances(c["id"])
        if not insts:
            out.append(dict(base, licence_state="nessuna"))
            continue
        for i in insts:
            rec = reg.latest_licence(i["id"])
            lic = rec["licence"] if rec else None
            lrow = {"instance": i.get("label") or i["id"], "plan": (lic or {}).get("plan", ""),
                    "licence_expires": _day((lic or {}).get("expires_at")), "licence_state": licence_state(lic, now)}
            envs = envs_by_inst.get(i["id"]) or [None]
            for e in envs:
                r = dict(base, **lrow)
                if e:
                    chk = e.get("last_check_data") or {}
                    r.update(env=e["name"], kind=KIND.get(e["kind"], e["kind"]), url=e.get("url") or "",
                             app_version=e.get("app_version") or "",
                             up_to_date=("" if not target or e["kind"] != "web-php" or e["name"].startswith("demo-")
                                         else "no" if e["id"] in old else "sì"),
                             last_check=_day(e.get("last_check")),
                             check_ok=("" if not chk else "sì" if chk.get("ok") else "no"),
                             last_deploy=_day(e.get("last_deploy_at")))
                out.append(r)
    return out


def to_csv(data: list[dict]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";", lineterminator="\r\n")
    w.writerow([label for _, label in COLUMNS])
    for r in data:
        w.writerow([_safe(r.get(k, "")) for k, _ in COLUMNS])
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


def _safe(v) -> str:
    """No formula injection when the file is opened in Excel (a customer called «=HYPERLINK(...)»)."""
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@") else s
