"""JSON API behind the v0.4 management app (``/api/...``).

Every function takes the web app (``app.hub``, ``app.key_id``/``app.private_key`` when unlocked,
``app.vault_key``) and returns plain JSON-able data. The web layer handles login, CSRF, the lock and
errors; nothing here touches HTTP. Secrets never leave through this module (the vault is only
listed: which kinds are stored, never their content).
"""

from __future__ import annotations

from datetime import datetime, timezone

from . import __version__
from . import licence as L
from .registry import RegistryError

KIND_IT = {"web-php": "Sito online (PHP)", "local-python": "Server sul PC del hub",
           "studio-python": "Server di sede"}
ENV_IT = {"production": "Produzione", "staging": "Staging"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _days_left(ts: str | None, now: datetime) -> int | None:
    if not ts:
        return None
    try:
        return int((L.parse_time(ts) - now).total_seconds() // 86400)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# view helpers
# ---------------------------------------------------------------------------

def licence_state(row: dict, superseded: set, now: datetime, grace_days: int | None = None) -> str:
    """active · expiring (≤30 days) · grace · expired · superseded."""
    if row["id"] in superseded:
        return "superseded"
    left = _days_left(row["expires_at"], now)
    if left is None:
        return "expired"
    if left >= 0:
        return "expiring" if left <= 30 else "active"
    g = grace_days if grace_days is not None else L.DEFAULT_GRACE_DAYS
    return "grace" if -left <= g else "expired"


def _licences(reg, now: datetime, where_instance: str | None = None) -> list[dict]:
    rows = reg.list_licences(where_instance) if where_instance else reg.list_licences()
    superseded = {r[0] for r in reg.conn.execute("SELECT supersedes FROM licences WHERE supersedes IS NOT NULL")}
    grace = {r[0]: r[1] for r in reg.conn.execute(
        "SELECT id, json_extract(licence_json, '$.grace_days') FROM licences")}
    limits = {r[0]: r[1] for r in reg.conn.execute(
        "SELECT id, json_extract(licence_json, '$.limits') FROM licences")}
    proj = {r[0]: (r[1], r[2]) for r in reg.conn.execute(
        "SELECT i.id, p.id, p.name FROM instances i LEFT JOIN projects p ON p.id=i.project_id")}
    out = []
    for r in rows:
        d = dict(r)
        d["state"] = licence_state(d, superseded, now, grace.get(d["id"]))
        d["days_left"] = _days_left(d["expires_at"], now)
        d["limits"] = _json(limits.get(d["id"]))
        d["project_id"], d["project_name"] = proj.get(d["instance_id"], (None, None))
        out.append(d)
    return out


def _json(v):
    import json
    try:
        return json.loads(v) if isinstance(v, str) else v
    except ValueError:
        return None


def env_view(e: dict, now: datetime) -> dict:
    chk = e.get("last_check_data") or {}
    return {
        "id": e["id"], "instance_id": e["instance_id"], "instance_label": e.get("instance_label"),
        "customer_id": e.get("customer_id"), "customer_name": e.get("customer_name"),
        "name": e["name"], "name_it": ENV_IT.get(e["name"], e["name"].replace("demo-", "Demo ")),
        "kind": e["kind"], "kind_it": KIND_IT.get(e["kind"], e["kind"]),
        "url": e.get("url"), "api_url": e.get("api_url"), "port": e.get("port"), "status": e["status"],
        "reachable": chk.get("ok"), "error": chk.get("error"),
        "app_version": e.get("app_version"), "deployed_version": e.get("deployed_version"),
        "verified_version": e.get("verified_version"), "last_check": e.get("last_check"),
        "last_deploy_at": e.get("last_deploy_at"), "last_backup_at": e.get("last_backup_at"),
        "expires_at": e.get("expires_at"), "expires_days": _days_left(e.get("expires_at"), now),
        "base_path": (e.get("settings") or {}).get("base_path"),
    }


def _health(envs: list[dict], lics: list[dict]) -> str:
    """ok · warn · bad · none — worst of environments and current licences."""
    level = 0
    for e in envs:
        if e["status"] in ("unreachable",) or (e["name"] == "production" and e["status"] == "stopped"):
            level = max(level, 2)
        elif e["status"] in ("new", "unknown", "protected"):
            level = max(level, 1)
    for lc in lics:
        if lc["state"] == "expired":
            level = max(level, 2)
        elif lc["state"] in ("grace", "expiring"):
            level = max(level, 1)
    if not envs and not lics:
        return "none"
    return ("ok", "warn", "bad")[level]


def _current(lics: list[dict]) -> list[dict]:
    return [x for x in lics if x["state"] != "superseded"]


# ---------------------------------------------------------------------------
# reads
# ---------------------------------------------------------------------------

def session_info(app, logged: bool) -> dict:
    from . import autoaccess
    from .vault import Vault
    v = Vault(app.hub.registry)
    return {
        "version": __version__, "logged": logged, "unlocked": app.unlocked,
        "key_id": app.key_id if logged else None,
        "has_keys": app.has_keys(),
        "vault": ("open" if app.vault_key is not None else "closed") if v.initialized else "none",
        "remembered": autoaccess.path(app.hub.dir).exists(),
        "data_dir": str(app.hub.dir) if logged else None,
    }


def overview(app) -> dict:
    reg, now = app.hub.registry, _now()
    envs = [env_view(e, now) for e in reg.list_environments()]
    lics = _current(_licences(reg, now))
    customers = reg.list_customers()
    alerts = []
    for lc in lics:
        if lc["state"] in ("expiring", "grace", "expired"):
            txt = {"expiring": f"scade tra {lc['days_left']} giorni", "grace": "scaduta, in tolleranza",
                   "expired": "scaduta"}[lc["state"]]
            alerts.append({"level": "bad" if lc["state"] == "expired" else "warn", "kind": "licence",
                           "id": lc["id"], "customer_id": lc["customer_id"],
                           "title": f"Licenza {lc['plan']} di {lc['customer_name']}", "text": txt})
    for e in envs:
        if e["status"] == "unreachable":
            alerts.append({"level": "bad", "kind": "env", "id": e["id"], "customer_id": e["customer_id"],
                           "title": f"{e['name_it']} di {e['customer_name']} non raggiungibile",
                           "text": e.get("error") or "controlla il sito"})
        elif e["status"] == "new":
            alerts.append({"level": "info", "kind": "env", "id": e["id"], "customer_id": e["customer_id"],
                           "title": f"{e['name_it']} di {e['customer_name']} mai controllato",
                           "text": "premi 'Controlla tutto' per verificarlo"})
        if e["expires_days"] is not None and e["expires_days"] < 0:
            alerts.append({"level": "warn", "kind": "env", "id": e["id"], "customer_id": e["customer_id"],
                           "title": f"Demo scaduta: {e['customer_name']}", "text": "archiviala da Istanze"})
    for d in reg.list_drafts("draft"):
        alerts.append({"level": "info", "kind": "draft", "id": d["id"], "customer_id": None,
                       "title": f"Bozza da confermare: {d.get('title') or 'senza titolo'}",
                       "text": "aperta il " + d["updated_at"][:10]})
    order = {"bad": 0, "warn": 1, "info": 2}
    alerts.sort(key=lambda a: order[a["level"]])
    deploys = reg.list_deploys(limit=200)
    return {
        "kpi": {
            "customers": len(customers),
            "projects": len(reg.list_projects()),
            "envs": len(envs),
            "envs_online": sum(1 for e in envs if e["status"] == "running"),
            "envs_down": sum(1 for e in envs if e["status"] == "unreachable"),
            "licences_active": sum(1 for x in lics if x["state"] in ("active", "expiring")),
            "licences_expiring": sum(1 for x in lics if x["state"] in ("expiring", "grace")),
            "workstations": len([w for w in reg.list_workstations() if w["status"] != "revoked"]),
            "deploys_30d": sum(1 for d in deploys if not d["dry_run"]
                               and (_days_left(d["started_at"], now) or 0) >= -30),
        },
        "alerts": alerts[:40],
        "events": [_event_view(ev, _names(reg)) for ev in reg.events(60) if ev["action"] not in NOISE][:15],
    }


def _names(reg) -> dict:
    """entity id -> readable name, to write 'Licenza emessa · Studio Rossi' instead of a bare id."""
    n: dict = {}
    for r in reg.conn.execute("SELECT id, name FROM customers"):
        n[r[0]] = r[1]
    for r in reg.conn.execute("SELECT p.id, p.name FROM projects p"):
        n[r[0]] = r[1]
    for r in reg.conn.execute("SELECT i.id, i.label || ' · ' || c.name FROM instances i JOIN customers c ON c.id=i.customer_id"):
        n[r[0]] = r[1]
    for r in reg.conn.execute("SELECT e.id, i.label || ' ' || e.name || ' · ' || c.name FROM environments e "
                              "JOIN instances i ON i.id=e.instance_id JOIN customers c ON c.id=i.customer_id"):
        n[r[0]] = r[1]
    for r in reg.conn.execute("SELECT l.id, l.plan || ' · ' || c.name FROM licences l JOIN customers c ON c.id=l.customer_id"):
        n[r[0]] = r[1]
    for r in reg.conn.execute("SELECT w.id, w.name FROM workstations w"):
        n[r[0]] = r[1]
    for r in reg.conn.execute("SELECT id, coalesce(title, 'bozza') FROM drafts"):
        n[r[0]] = r[1]
    return n


def _event_view(ev: dict, names: dict | None = None) -> dict:
    subj = (names or {}).get(ev.get("entity_id") or "")
    return {"id": ev["id"], "at": ev["at"], "action": ev["action"], "entity": ev.get("entity"),
            "entity_id": ev.get("entity_id"), "subject": subj, "text": describe_event(ev)}


NOISE = ("web.start", "web.login", "hub.check_all")


ACTION_IT = {
    "customer.add": "Cliente creato", "customer.update": "Cliente modificato",
    "customer.key_escrow": "Custodia della chiave cambiata", "reseller.add": "Rivenditore creato",
    "project.add": "Progetto creato", "project.update": "Progetto modificato",
    "instance.add": "Installazione registrata", "instance.move": "Installazione spostata di progetto",
    "instance.rename": "Installazione rinominata", "licence.issue": "Licenza emessa",
    "licence.renew": "Licenza rinnovata", "licence.download": "Licenza scaricata",
    "env.add": "Ambiente registrato", "env.delete": "Ambiente eliminato", "env.start": "Ambiente avviato",
    "env.stop": "Ambiente fermato", "deploy.run": "Deploy eseguito", "deploy.rollback": "Ripristino automatico",
    "hub.check_all": "Controllo di tutti gli ambienti", "hub.backup": "Backup dell'hub",
    "vault.put": "Segreto salvato in cassaforte", "vault.reveal": "Segreto mostrato",
    "workstation.add": "Postazione aggiunta", "workstation.update": "Postazione modificata",
    "workstation.build": "Client della postazione generato", "workstation.revoke": "Postazione revocata",
    "draft.add": "Bozza AI creata", "draft.delete": "Bozza AI eliminata", "draft.confirm": "Bozza AI confermata",
    "web.start": "Pagina dell'hub aperta", "web.login": "Accesso alla pagina", "web.remember": "Accesso ricordato su questo PC",
    "web.forget": "Accesso ricordato rimosso", "setting.set": "Impostazione cambiata",
    "onboarding.run": "Cliente nuovo preparato",
}


def describe_event(ev: dict) -> str:
    return ACTION_IT.get(ev["action"], ev["action"])


def customers(app) -> list[dict]:
    reg, now = app.hub.registry, _now()
    envs = [env_view(e, now) for e in reg.list_environments()]
    lics = _current(_licences(reg, now))
    projects = reg.list_projects()
    wss = reg.list_workstations()
    out = []
    for c in reg.list_customers():
        c = reg.customer_view(c)
        ce = [e for e in envs if e["customer_id"] == c["id"]]
        cl = [x for x in lics if x["customer_id"] == c["id"]]
        nxt = min((x["expires_at"] for x in cl), default=None)
        out.append({
            "id": c["id"], "name": c["name"], "vat_id": c.get("vat_id"), "email": c.get("email"),
            "status": c.get("status") or "active", "reseller_name": c.get("reseller_name"),
            "extra": c["extra"], "created_at": c["created_at"],
            "projects": sum(1 for p in projects if p["customer_id"] == c["id"]),
            "envs": len(ce), "online": sum(1 for e in ce if e["status"] == "running"),
            "workstations": sum(1 for w in wss if w["customer_id"] == c["id"] and w["status"] != "revoked"),
            "plans": sorted({x["plan"] for x in cl}), "next_expiry": nxt,
            "next_expiry_days": _days_left(nxt, now), "health": _health(ce, cl),
        })
    return out


def customer_detail(app, cid: str) -> dict:
    reg, now = app.hub.registry, _now()
    c = reg.customer_view(reg.get_customer(cid))
    if c.get("reseller_id"):
        c["reseller_name"] = reg.get_reseller(c["reseller_id"])["name"]
    insts = reg.list_instances(c["id"])
    envs = [env_view(e, now) for e in reg.list_environments() if e["customer_id"] == c["id"]]
    all_lics = [x for x in _licences(reg, now) if x["customer_id"] == c["id"]]
    from .vault import Vault
    secrets = Vault(reg).list()
    projects = []
    for p in reg.list_projects(c["id"]):
        pi = [i for i in insts if i.get("project_id") == p["id"]]
        pids = {i["id"] for i in pi}
        pe = [e for e in envs if e["instance_id"] in pids]
        pl = [x for x in all_lics if x["instance_id"] in pids]
        projects.append({
            "id": p["id"], "name": p["name"], "status": p["status"], "notes": p.get("notes"),
            "created_at": p["created_at"], "data": p["data"],
            "instances": [{
                "id": i["id"], "label": i["label"], "kind": i["kind"], "notes": i.get("notes"),
                "role": _role(i, envs),
                "envs": [e for e in pe if e["instance_id"] == i["id"]],
                "licence": next((x for x in _current(pl) if x["instance_id"] == i["id"]), None),
            } for i in pi],
            "workstations": reg.list_workstations(p["id"]),
            "health": _health(pe, _current(pl)),
        })
    env_ids = {e["id"] for e in envs}
    ids = [c["id"]] + [p["id"] for p in projects] + [i["id"] for i in insts] + list(env_ids) \
        + [x["id"] for x in all_lics] + [w["id"] for p in projects for w in p["workstations"]]
    deploys = [d for d in reg.list_deploys(limit=500) if d["env_id"] in env_ids][:30]
    envname = {e["id"]: f"{e['instance_label']} · {e['name_it']}" for e in envs}
    for d in deploys:
        d["env_label"] = envname.get(d["env_id"], d["env_id"])
        d.pop("details_json", None)
    return {
        "customer": {k: c.get(k) for k in ("id", "name", "vat_id", "email", "notes", "status", "reseller_id",
                                            "reseller_name", "created_at", "key_escrow")} | {"extra": c["extra"]},
        "projects": projects,
        "licences": all_lics,
        "deploys": deploys,
        "secrets": [{"env_id": s["env_id"], "kind": s["kind"], "label": s.get("label"), "updated_at": s.get("updated_at")}
                    for s in secrets if s["env_id"] in env_ids],
        "events": [_event_view(ev, _names(reg)) for ev in reg.events_for(ids, 60)],
        "health": _health(envs, _current(all_lics)),
        "plans": {k: v.get("label", k) for k, v in app.hub.plans.items()},
        "packages": packages_of(app, c["id"]),
    }


def _role(inst: dict, envs: list[dict]) -> str:
    n = (inst.get("notes") or "")
    if "onboarding:sede" in n:
        return "sede"
    if "onboarding:online" in n:
        return "online"
    kinds = {e["kind"] for e in envs if e["instance_id"] == inst["id"]}
    if "web-php" in kinds:
        return "online"
    if kinds & {"studio-python", "local-python"}:
        return "sede"
    return "altro"


def instances(app) -> list[dict]:
    reg, now = app.hub.registry, _now()
    proj = {r[0]: (r[1], r[2]) for r in reg.conn.execute(
        "SELECT i.id, p.id, p.name FROM instances i LEFT JOIN projects p ON p.id=i.project_id")}
    lic = {x["instance_id"]: x for x in _current(_licences(reg, now))}
    out = []
    for e in reg.list_environments():
        v = env_view(e, now)
        v["project_id"], v["project_name"] = proj.get(e["instance_id"], (None, None))
        lc = lic.get(e["instance_id"])
        v["licence"] = {"id": lc["id"], "plan": lc["plan"], "state": lc["state"],
                        "days_left": lc["days_left"]} if lc else None
        out.append(v)
    # instances without any environment (e.g. a workstation-only install)
    with_env = {e["instance_id"] for e in out}
    for i in reg.list_instances():
        if i["id"] in with_env:
            continue
        lc = lic.get(i["id"])
        p = proj.get(i["id"], (None, None))
        out.append({"id": None, "instance_id": i["id"], "instance_label": i["label"],
                    "customer_id": i["customer_id"], "customer_name": i["customer_name"],
                    "project_id": p[0], "project_name": p[1], "name": None, "name_it": "Senza ambiente",
                    "kind": i["kind"], "kind_it": "Installazione " + i["kind"], "status": "none",
                    "licence": {"id": lc["id"], "plan": lc["plan"], "state": lc["state"],
                                "days_left": lc["days_left"]} if lc else None})
    return out


def licences(app) -> list[dict]:
    return _licences(app.hub.registry, _now())


def licence_detail(app, lid: str) -> dict:
    reg, now = app.hub.registry, _now()
    rec = reg.get_licence(lid)
    rows = {x["id"]: x for x in _licences(reg, now)}
    row = rows.get(rec["id"], {})
    chain = [x for x in rows.values() if x["instance_id"] == rec["instance_id"]]
    st = L.verify(rec["file_text"], app.hub.keys.public_keys(), instance_id=rec["instance_id"], now=now)
    return {"licence": rec["licence"], "row": row, "history": chain,
            "verify": {"mode": st.mode, "signature_ok": st.signature_ok, "reasons": list(st.reasons)},
            "filename": app.hub.licence_filename(rec["licence"])}


def deploys(app) -> list[dict]:
    reg, now = app.hub.registry, _now()
    envs = {e["id"]: env_view(e, now) for e in reg.list_environments()}
    out = []
    for d in reg.list_deploys(limit=200):
        e = envs.get(d["env_id"])
        d = dict(d)
        d.pop("details_json", None)
        d.update({"env_label": f"{e['instance_label']} · {e['name_it']}" if e else d["env_id"],
                  "customer_id": e["customer_id"] if e else None,
                  "customer_name": e["customer_name"] if e else None})
        out.append(d)
    return out


def events(app, limit: int = 200) -> list[dict]:
    names = _names(app.hub.registry)
    return [_event_view(ev, names) for ev in app.hub.registry.events(limit)]


def search(app, q: str) -> list[dict]:
    q = (q or "").strip().lower()
    if len(q) < 2:
        return []
    reg, out = app.hub.registry, []

    def hit(*vals):
        return any(q in (v or "").lower() for v in vals)
    for c in reg.list_customers():
        c = reg.customer_view(c)
        if hit(c["name"], c.get("vat_id"), c.get("email"), c["extra"].get("codice_multi"), c["extra"].get("city")):
            out.append({"type": "customer", "id": c["id"], "title": c["name"],
                        "sub": " · ".join(x for x in (c.get("vat_id"), c["extra"].get("city")) if x), "customer_id": c["id"]})
    for p in reg.list_projects():
        if hit(p["name"]):
            out.append({"type": "project", "id": p["id"], "title": p["name"], "sub": p["customer_name"],
                        "customer_id": p["customer_id"]})
    for e in reg.list_environments():
        if hit(e["instance_label"], e.get("url"), e["name"], e["customer_name"] if q in e["name"] else ""):
            out.append({"type": "env", "id": e["id"], "title": f"{e['instance_label']} · {ENV_IT.get(e['name'], e['name'])}",
                        "sub": e.get("url") or e["customer_name"], "customer_id": e["customer_id"]})
    for w in reg.list_workstations():
        if hit(w["name"], w.get("tag")):
            out.append({"type": "workstation", "id": w["id"], "title": w["name"], "sub": w["project_name"],
                        "customer_id": w["customer_id"]})
    for x in reg.list_licences():
        if x["id"].lower().startswith(q) or hit(x["plan"]) and hit(x["customer_name"]):
            out.append({"type": "licence", "id": x["id"], "title": f"Licenza {x['plan']}",
                        "sub": f"{x['customer_name']} · scade {x['expires_at'][:10]}", "customer_id": x["customer_id"]})
    return out[:30]


# ---------------------------------------------------------------------------
# writes (the web layer checks login + CSRF and holds the lock)
# ---------------------------------------------------------------------------

def _str(body: dict, k: str) -> str:
    v = body.get(k)
    return v.strip() if isinstance(v, str) else ""


def create_customer(app, body: dict) -> dict:
    reg = app.hub.registry
    c = reg.add_customer(_str(body, "name"), _str(body, "vat_id") or None, _str(body, "email") or None,
                         _str(body, "reseller") or None, _str(body, "notes") or None)
    if isinstance(body.get("extra"), dict) or body.get("status"):
        reg.update_customer(c["id"], **({"extra": body["extra"]} if isinstance(body.get("extra"), dict) else {}),
                            **({"status": body["status"]} if body.get("status") else {}))
    pname = _str(body, "project_name") or f"DocMap {c['name']}"
    p = reg.add_project(c["id"], pname)
    return {"id": c["id"], "project_id": p["id"]}


def update_customer(app, cid: str, body: dict) -> dict:
    fields = {k: body[k] for k in ("name", "vat_id", "email", "notes", "status", "reseller") if k in body}
    if isinstance(body.get("extra"), dict):
        fields["extra"] = body["extra"]
    c = app.hub.registry.update_customer(cid, **fields)
    return {"id": c["id"]}


def create_project(app, body: dict) -> dict:
    p = app.hub.registry.add_project(_str(body, "customer_id"), _str(body, "name"), _str(body, "notes") or None)
    return {"id": p["id"]}


def update_project(app, pid: str, body: dict) -> dict:
    fields = {k: body[k] for k in ("name", "notes", "status") if k in body}
    p = app.hub.registry.update_project(pid, **fields)
    return {"id": p["id"]}


def add_instance(app, body: dict) -> dict:
    reg = app.hub.registry
    p = reg.get_project(_str(body, "project_id"))
    i = reg.add_instance(p["customer_id"], _str(body, "label") or None, _str(body, "kind") or "onprem",
                         project=p["id"])
    return {"id": i["id"]}


def rename_instance(app, iid: str, body: dict) -> dict:
    return {"id": app.hub.registry.rename_instance(iid, _str(body, "label"))["id"]}


def add_workstation(app, body: dict) -> dict:
    w = app.hub.registry.add_workstation(_str(body, "project_id"), _str(body, "name"), _str(body, "tag") or None,
                                         _str(body, "instance_id") or None, _str(body, "notes") or None)
    return {"id": w["id"]}


def update_workstation(app, wid: str, body: dict) -> dict:
    fields = {k: (body[k] or None) if k != "name" else body[k] for k in ("name", "tag", "notes") if k in body}
    if body.get("revoke"):
        fields.update(status="revoked", revoked_at=L.format_time(_now()))
        w = app.hub.registry.update_workstation(wid, log_action="workstation.revoke", **fields)
    else:
        w = app.hub.registry.update_workstation(wid, **fields)
    return {"id": w["id"]}


def _limits(body: dict) -> dict | None:
    lim = {}
    for k in L.LIMIT_KEYS:
        v = body.get("limits", {}).get(k) if isinstance(body.get("limits"), dict) else None
        if v in (None, ""):
            continue
        v = int(v)
        lim[k] = None if v < 0 else v
    return lim or None


def issue_licence(app, body: dict) -> dict:
    app.need_unlocked()
    kw: dict = {}
    if body.get("months"):
        kw["months"] = int(body["months"])
    lim = _limits(body)
    if lim:
        kw["limits"] = lim
    res = app.hub.issue_with_key(app.key_id, app.private_key, _str(body, "instance_id"), _str(body, "plan"), **kw)
    return {"id": res["licence"]["licence_id"]}


def renew_licence(app, lid: str, body: dict) -> dict:
    app.need_unlocked()
    res = app.hub.renew_with_key(app.key_id, app.private_key, lid,
                                 months=int(body["months"]) if body.get("months") else None,
                                 plan=_str(body, "plan") or None)
    return {"id": res["licence"]["licence_id"]}


def remember(app, body: dict) -> dict:
    """Turn 'Ricorda su questo PC' on (needs the passphrase again) or off."""
    from . import autoaccess
    reg = app.hub.registry
    if not body.get("on"):
        removed = autoaccess.remove(app.hub.dir)
        reg.log("web.forget")
        return {"remembered": False, "removed": removed}
    p = body.get("passphrase") or ""
    if not app.check_passphrase(p):
        raise RegistryError("Passphrase errata.")
    vp = body.get("vault_passphrase") or None
    info = autoaccess.save(app.hub.dir, p, vp if vp and vp != p else None)
    reg.log("web.remember", details={"method": info["method"]})
    return {"remembered": True, "method": info["method"]}


def check_all_job(app) -> dict:
    from .health import probe_all, store_results, targets
    tl = targets(app.hub, app.vault_key)

    def run(h, job):
        res = probe_all(tl)
        with app.lock:
            store_results(h, res)
        ok = sum(1 for r in res.values() if r.get("ok"))
        job.log(f"Ambienti controllati: {len(res)}, raggiungibili: {ok}.")
        return {"checked": len(res), "ok": ok}
    job = app.jobs.start("Controllo di tutti gli ambienti", "check-all", {}, run)
    return {"job": job.id}


def job_view(app, jid: str) -> dict:
    job = app.jobs.get(jid)
    if not job:
        raise RegistryError("Operazione non trovata (scaduta).")
    return {"id": job.id, "title": job.title, "kind": job.kind, "status": job.status,
            "lines": list(job.lines)[-200:], "error": job.error,
            "result": job.result if job.status == "ok" else None}


# ---------------------------------------------------------------------------
# v0.5: Pipeline 1 (drafts) and packages
# ---------------------------------------------------------------------------

def pipeline_prompt(app) -> dict:
    from . import pipeline as P
    return {"prompt": P.build_prompt(app.hub), "template": P.TEMPLATE, "example": P.EXAMPLE, "format": P.FORMAT,
            "plans": {k: v.get("label", k) for k, v in app.hub.plans.items()},
            "resellers": [r["name"] for r in app.hub.registry.list_resellers()]}


def drafts(app) -> list[dict]:
    return app.hub.registry.list_drafts()


def draft_get(app, did: str) -> dict:
    from . import pipeline as P
    return P.draft_view(app.hub, app.hub.registry.get_draft(did))


def draft_create(app, body: dict) -> dict:
    from . import pipeline as P
    return P.create_draft(app.hub, body.get("text") or "")


def draft_update(app, did: str, body: dict) -> dict:
    from . import pipeline as P
    if not isinstance(body.get("data"), dict):
        raise RegistryError("Dati della bozza mancanti.")
    return P.update_draft(app.hub, did, body["data"])


def draft_delete(app, did: str, body: dict) -> dict:
    app.hub.registry.delete_draft(did)
    return {"ok": True}


def draft_confirm(app, did: str, body: dict) -> dict:
    """Validate now (errors at once), then run onboarding + extras as a background job."""
    from . import pipeline as P
    from .onboarding import Onboarding
    app.need_unlocked()
    reg = app.hub.registry
    rec = reg.get_draft(did)
    if rec["status"] == "confirmed" and not body.get("again"):
        raise RegistryError("Bozza già confermata: apri il cliente.")
    d = P.normalize(rec["data"])
    chk = P.validate(app.hub, d)
    if chk["errors"]:
        raise RegistryError("Correggi prima: " + "; ".join(f"{x['path']}: {x['msg']}" for x in chk["errors"][:4]))
    pw = body.get("ftp_password") or ""
    req = P.to_request(d, pw)
    if req.ftp and not pw:
        raise RegistryError("Scrivi la password FTP (passo Online) oppure togli l'host FTP per usare l'autoinstall web.")
    req.validate(app.hub)
    vk = app.need_vault() if req.ftp else None
    key = (app.key_id, app.private_key)
    build = bool(body.get("build", True))

    def run(h, job):
        job.log("Creo cliente, progetto, installazioni, ambienti e licenze…")
        rep = Onboarding(h, log=job.log).run(req, key=key, vk=vk, build=build)
        for x in rep["created"]:
            job.log("+ " + x)
        for x in rep["reused"]:
            job.log("= " + x + " (già presente)")
        for x in P.apply_extras(h, d, rep, did):
            job.log("+ " + x)
        h.registry.save_draft(d, draft_id=did, title=P.title_of(d), status="confirmed",
                              result={"customer_id": rep["customer_id"], "project_id": rep.get("project_id"),
                                      "dir": rep.get("dir")})
        h.registry.log("draft.confirm", "draft", did, {"customer_id": rep["customer_id"]})
        job.log("Fatto.")
        return {"customer_id": rep["customer_id"], "project_id": rep.get("project_id")}
    job = app.jobs.start(f"Crea progetto: {P.title_of(d)}", "clienti-pipeline", {}, run)
    return {"job": job.id}


def build_web_job(app, env_id: str, body: dict) -> dict:
    from . import packages
    app.hub.registry.get_environment(env_id)
    job = app.jobs.start("Prepara autoinstall web", "env-package", {},
                         lambda h, j: {"file": str(packages.build_web_zip(h, env_id, log=j.log))})
    return {"job": job.id}


def packages_of(app, cid: str) -> dict:
    from . import packages
    reg = app.hub.registry
    c = reg.get_customer(cid)
    out = {"sede": None, "web": {}}
    if any(i.get("notes") == "onboarding:sede" for i in reg.list_instances(c["id"])):
        z = packages.sede_zip(app.hub, c["id"])
        out["sede"] = {"name": z.name, "size": z.stat().st_size} if z else None
    for e in reg.list_environments():
        if e["customer_id"] == c["id"] and e["kind"] == "web-php":
            zp = packages.web_zip_path(app.hub, e)
            out["web"][e["id"]] = {"name": zp.name, "size": zp.stat().st_size,
                                   "built_at": L.format_time(datetime.fromtimestamp(zp.stat().st_mtime, timezone.utc))} if zp.is_file() else None
    return out
