"""v0.10.3: «Elimina cliente» — remove a customer and everything the hub keeps for him, safely.

What it does, in order:
1. checks that the exact customer name was typed (the only confirmation; the page shows what goes away first);
2. writes a hub backup (the whole registry, vault included): the deletion can always be undone by restoring it;
3. local servers of the customer are stopped and their data moved to ``_trash`` (never deleted);
4. removes from the registry: sites/servers (with their vault secrets and ports), workstations, licences,
   installations, projects and the customer; the events stay (audit trail) plus one ``customer.delete`` event;
5. moves the customer's folder ``clienti/<slug>`` (packages, sheets) to ``_trash/clienti/``.

What it never does: touch an online site, a server at the customer's office or a licence already delivered. Those keep
working until their licence expires (``preview`` lists them so Dave can revoke first if needed).
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from . import licence as L
from .registry import RegistryError


class RemovalError(RegistryError):
    pass


def _norm(s: str | None) -> str:
    return " ".join((s or "").split()).casefold()


def _envs(reg, cid: str) -> list[dict]:
    return [e for e in reg.list_environments() if e["customer_id"] == cid]


def preview(hub, cid: str) -> dict:
    """What «Elimina cliente» would remove, and what stays out there."""
    reg = hub.registry
    cust = reg.get_customer(cid)
    envs = _envs(reg, cust["id"])
    insts = reg.list_instances(cust["id"])
    now = datetime.now(timezone.utc)
    lics = [l for i in insts for l in reg.list_licences(i["id"])]
    live = [l for l in lics if l.get("expires_at") and L.parse_time(l["expires_at"]) > now]
    wss = [w for w in reg.list_workstations() if w.get("customer_id") == cust["id"]]
    online = [{"name": e["name"], "url": e.get("url") or "", "published": bool(e.get("deployed_version"))}
              for e in envs if e["kind"] == "web-php"]
    secrets = sum(reg.conn.execute("SELECT COUNT(*) FROM secrets WHERE env_id=?", (e["id"],)).fetchone()[0]
                  for e in envs)
    return {"customer": {"id": cust["id"], "name": cust["name"]},
            "projects": len(reg.list_projects(cust["id"])), "installations": len(insts), "environments": len(envs),
            "workstations": len(wss), "licences": len(lics), "secrets": secrets,
            "online": online, "live_licences": [{"plan": l["plan"], "expires_at": l["expires_at"],
                                                 "instance": l.get("instance_label")} for l in live],
            "has_sede": any(i.get("kind") == "onprem" for i in insts)}


def _client_dir(hub, cid: str) -> Path | None:
    root = hub.dir / "clienti"
    if not root.is_dir():
        return None
    for f in root.glob("*/cliente.json"):
        try:
            if json.loads(f.read_text("utf-8")).get("customer_id") == cid:
                return f.parent
        except (OSError, ValueError):
            continue
    return None


def delete_customer(hub, cid: str, *, confirm_name: str, backup: bool = True, log=lambda m: None) -> dict:
    from . import backups
    from .envs import EnvManager
    from .sitesetup import SETUP_DONE_PREFIX
    reg = hub.registry
    cust = reg.get_customer(cid)
    if _norm(confirm_name) != _norm(cust["name"]):
        raise RemovalError(f"Per eliminare scrivi esattamente il nome del cliente: «{cust['name']}».")
    pv = preview(hub, cust["id"])
    res = {"customer": cust["name"], "backup": None, "trash": None, "summary": pv}
    if backup:
        b = backups.run(hub, auto=False, log=log)
        res["backup"] = b["name"]
        log(f"Backup prima di eliminare: {b['name']}")
    em = EnvManager(hub)
    for e in _envs(reg, cust["id"]):
        inst = reg.get_instance(e["instance_id"])
        if e["kind"] == "local-python":
            em.delete(e["instance_id"], e["name"], production=True, confirm=inst["label"], reason="cliente-eliminato")
        else:
            reg.delete_environment_row(e["id"], {"reason": "cliente eliminato", "remote_untouched": True})
        reg.set_setting(SETUP_DONE_PREFIX + e["id"], None, log=False)
        log(f"Tolto dal hub: {e['name']} ({e.get('url') or e['kind']})")
    pids = [p["id"] for p in reg.list_projects(cust["id"])]
    with reg.conn:
        for pid in pids:
            reg.conn.execute("DELETE FROM workstations WHERE project_id=?", (pid,))
        iids = [r[0] for r in reg.conn.execute("SELECT id FROM instances WHERE customer_id=?", (cust["id"],))]
        for iid in iids:
            reg.conn.execute("DELETE FROM workstations WHERE instance_id=?", (iid,))
        reg.conn.execute("DELETE FROM licences WHERE customer_id=?", (cust["id"],))
        reg.conn.execute("DELETE FROM instances WHERE customer_id=?", (cust["id"],))
        reg.conn.execute("DELETE FROM projects WHERE customer_id=?", (cust["id"],))
        reg.conn.execute("DELETE FROM customers WHERE id=?", (cust["id"],))
        reg.log("customer.delete", "customer", cust["id"],
                {"name": cust["name"], "backup": res["backup"],
                 "removed": {k: pv[k] for k in ("projects", "installations", "environments", "workstations",
                                                 "licences", "secrets")},
                 "online_untouched": [o["url"] for o in pv["online"]]}, commit=False)
    cdir = _client_dir(hub, cust["id"])
    if cdir is not None:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        dst = hub.dir / "_trash" / "clienti" / f"{cdir.name}-{stamp}"
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(cdir), str(dst))
        res["trash"] = str(dst)
        log(f"Cartella del cliente spostata in {dst}")
    log(f"Cliente «{cust['name']}» eliminato dal hub.")
    return res
