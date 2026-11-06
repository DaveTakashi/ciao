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

def licence_state(row: dict, superseded: set, now: datetime, grace_days: int | None = None,
                  status: str | None = None) -> str:
    """active · expiring (≤30 days) · grace · expired · superseded · suspended · revoked."""
    if row["id"] in superseded:
        return "superseded"
    if status in ("suspended", "revoked"):
        return status
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
    status = {r[0]: r[1] for r in reg.conn.execute(
        "SELECT id, json_extract(licence_json, '$.status') FROM licences")}
    proj = {r[0]: (r[1], r[2]) for r in reg.conn.execute(
        "SELECT i.id, p.id, p.name FROM instances i LEFT JOIN projects p ON p.id=i.project_id")}
    out = []
    for r in rows:
        d = dict(r)
        d["state"] = licence_state(d, superseded, now, grace.get(d["id"]), status.get(d["id"]))
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
        if lc["state"] in ("suspended", "revoked"):
            alerts.append({"level": "info", "kind": "licence", "id": lc["id"], "customer_id": lc["customer_id"],
                           "title": f"Licenza {'sospesa' if lc['state'] == 'suspended' else 'revocata'}: {lc['customer_name']}",
                           "text": lc["instance_label"]})
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
    from . import licensing as LG
    pend = LG.pending(reg) if LG.channel(reg) else []
    if pend:
        alerts.append({"level": "warn", "kind": "channel", "id": None, "customer_id": None,
                       "title": f"Licenze da pubblicare: {len(pend)}",
                       "text": "apri la cassaforte: l'hub le pubblica da solo, oppure Impostazioni → Canale"})
    lerr = getattr(getattr(app, "licence_scheduler", None), "error", None)
    if lerr:
        alerts.append({"level": "bad", "kind": "channel", "id": None, "customer_id": None,
                       "title": "Licenze: operazione automatica non riuscita", "text": lerr})
    from . import backups as B
    bcfg, blast = B.config(reg), B.last_auto_at(app.hub)
    sch_err = getattr(getattr(app, "backup_scheduler", None), "error", None)
    if sch_err:
        alerts.append({"level": "bad", "kind": "backup", "id": None, "customer_id": None,
                       "title": "Backup automatico non riuscito", "text": sch_err})
    elif not bcfg["auto"]:
        alerts.append({"level": "warn", "kind": "backup", "id": None, "customer_id": None,
                       "title": "Backup automatici spenti", "text": "riaccendili da Impostazioni"})
    elif blast and (now - blast).total_seconds() > bcfg["every_hours"] * 3600 * 3:
        alerts.append({"level": "warn", "kind": "backup", "id": None, "customer_id": None,
                       "title": "Backup dell'hub vecchio", "text": "ultimo backup automatico " + blast.strftime("%d/%m/%Y")})
    if not bcfg["copy_dir"]:
        alerts.append({"level": "warn", "kind": "backup", "id": None, "customer_id": None,
                       "title": "I backup dell'hub sono solo su questo PC",
                       "text": "Impostazioni → Backup: scegli una seconda cartella (chiavetta, disco esterno, cloud)"})
    # v0.9: one line per customer still on the way, with the next thing to do
    from . import journey as J
    for c in customers:
        if c.get("status") not in (None, "", "active"):
            continue
        try:
            jr = J.for_customer(app.hub, c["id"], packages=packages_of(app, c["id"]))
        except Exception:  # noqa: BLE001 - never break the overview
            continue
        if jr["next"]:
            alerts.append({"level": "info", "kind": "journey", "id": c["id"], "customer_id": c["id"],
                           "title": f"{c['name']}: {jr['next']['title'].lower()}",
                           "text": f"passo {jr['done'] + 1} di {jr['total']} del percorso"})
    from . import sitesetup as SS
    target = SS.available_version(reg)
    if target:
        old = SS.outdated_sites(app.hub, target)
        if old:
            alerts.append({"level": "info", "kind": "updates", "id": None, "customer_id": None,
                           "title": f"Siti da aggiornare alla {target}: {len(old)}",
                           "text": "Deploy → «Aggiorna tutti i siti»"})
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


NOISE = ("web.start", "web.login", "hub.check_all", "hub.backup")


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
    "hub.backup.auto": "Backup automatico dell'hub", "hub.backup.now": "Backup dell'hub (a mano)",
    "hub.backup.error": "Backup automatico non riuscito", "vault.delete": "Segreto eliminato dalla cassaforte",
    "env.update": "Ambiente modificato", "deploy.ok": "Deploy riuscito",
    "licence.suspend": "Licenza sospesa", "licence.revoke": "Licenza revocata", "licence.reactivate": "Licenza riattivata",
    "licence.modify": "Licenza modificata", "licence.autorenew": "Rinnovo automatico cambiato",
    "licence.autorenew.issue": "Licenza rinnovata in automatico", "licence.publish": "Licenze pubblicate nel canale",
    "licence.publish.error": "Pubblicazione licenze non riuscita", "licence.channel": "Canale delle licenze impostato",
    "hub.export": "Hub esportato (cifrato)", "hub.backup.download": "Backup scaricato", "web.error": "Errore interno della pagina",
    "vault.store": "Segreto salvato in cassaforte", "vault.update": "Segreto aggiornato in cassaforte",
    "site.setup": "Sito configurato dall'hub (codici in cassaforte)", "licence.push": "Licenza inviata ai siti",
    "sites.update": "Aggiornamento di più siti",
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
    from . import journey as J
    pk = packages_of(app, c["id"])
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
        "packages": pk,
        "journey": J.for_customer(app.hub, c["id"], packages=pk),
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
    from . import licensing as LG
    iid = rec["instance_id"]
    ch = LG.channel(reg)
    return {"licence": rec["licence"], "row": row, "history": chain,
            "control": {"status": LG.status_of(rec["licence"]), "revoked": LG.is_revoked(reg, iid),
                        "autorenew": LG.get_autorenew(reg, iid), "update_url": rec["licence"].get("update_url"),
                        "published": LG.published_id(reg, iid) == rec["id"], "channel": bool(ch),
                        "channel_url": ch["base_url"] if ch else None,
                        "is_current": (LG.current(reg, iid) or {}).get("id") == rec["id"],
                        "features_known": list(L.KNOWN_FEATURES)},
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
    return _after_licence(app, res)   # v0.9: the renewal reaches the online sites at once


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
            "result": job.result if job.status == "ok" and job.kind not in PLAN_KINDS else None,
            "plan": plan_view(job), "finished": job.finished}


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


# ---------------------------------------------------------------------------
# v0.6: deploy / promote in the app, vault per environment, environments, backups
# ---------------------------------------------------------------------------

PLAN_KINDS = {"deploy-plan": "deploy-run", "promote-plan": "promote-run"}
SECRET_IT = {"ftp": "Accesso FTP/SFTP", "basic_auth": "Protezione cartella (HTTP Basic)",
             "admin_token": "Token amministratore", "superadmin": "Super-admin",
             "db_config": "Configurazione e chiave del database", "note": "Nota"}


def _opts(body: dict) -> dict:
    return {"insecure_ftp": bool(body.get("insecure_ftp")), "overwrite_htaccess": bool(body.get("overwrite_htaccess"))}


def deploy_plan(app, env_id: str, body: dict) -> dict:
    """Dry run (nothing changes on the server). The result is the plan; confirm it with job_confirm."""
    from . import web_ops as W
    vk = app.need_vault()
    reg = app.hub.registry
    e = reg.get_environment(env_id)
    if e["kind"] != "web-php":
        raise RegistryError("Il deploy vale per i siti online (web-php).")
    params = dict(_opts(body), instance=e["instance_id"], env=e["name"])
    label = reg.get_instance(e["instance_id"])["label"]
    title = f"Piano di deploy: {label} · {ENV_IT.get(e['name'], e['name'])}"
    job = app.jobs.start(title, "deploy-plan", params, lambda h, j: W._job_deploy(h, j, vk, params, True))
    return {"job": job.id}


def promote_plan(app, iid: str, body: dict) -> dict:
    from . import web_ops as W
    vk = app.need_vault()
    inst = app.hub.registry.get_instance(iid)
    params = dict(_opts(body), instance=inst["id"])
    job = app.jobs.start(f"Piano di promozione staging → produzione: {inst['label']}", "promote-plan", params,
                         lambda h, j: W._job_promote(h, j, vk, params, True))
    return {"job": job.id}


def job_confirm(app, jid: str, body: dict) -> dict:
    """Run the real deploy of a plan seen in the last 30 minutes, with the exact same code (code hash)."""
    import time
    from . import web_ops as W
    vk = app.need_vault()
    plan = app.jobs.get(jid)
    if (not plan or plan.kind not in PLAN_KINDS or plan.status != "ok"
            or time.time() - (plan.finished or 0) > W.PLAN_MAX_AGE):
        raise RegistryError("Piano scaduto o non valido: rifai la prova e conferma entro 30 minuti.")
    if not body.get("sure"):
        raise RegistryError("Spunta «ho letto il piano» per confermare.")
    if not ((plan.result or {}).get("plan") or {}).get("upload"):
        raise RegistryError("Niente da caricare: il server è già aggiornato.")
    if getattr(plan, "confirmed_by", None):
        raise RegistryError("Questo piano è già stato confermato: guarda l'avanzamento in Attività.")
    params = plan.params
    if plan.kind == "deploy-plan":
        job = app.jobs.start(plan.title.replace("Piano di deploy", "Deploy"), "deploy-run", params,
                             lambda h, j: W._job_deploy(h, j, vk, params, False))
    else:
        job = app.jobs.start(plan.title.replace("Piano di promozione", "Promozione"), "promote-run", params,
                             lambda h, j: W._job_promote(h, j, vk, params, False))
    plan.confirmed_by = job.id
    return {"job": job.id}


def plan_view(job) -> dict | None:
    """What the app shows for a finished plan: counts, short lists, validity."""
    import time
    from . import web_ops as W
    if job.kind not in PLAN_KINDS or job.status != "ok":
        return None
    r = job.result or {}
    p = r.get("plan") or {}
    left = int(W.PLAN_MAX_AGE - (time.time() - (job.finished or 0)))
    return {"version": r.get("version"), "remote_version": r.get("remote_version"),
            "remote_file_count": r.get("remote_file_count", 0), "root_note": r.get("root_note"),
            "upload": p.get("upload", [])[:300], "upload_count": len(p.get("upload", [])),
            "unchanged_count": len(p.get("unchanged", [])), "protected": p.get("protected", []),
            "obsolete": p.get("obsolete", [])[:100], "obsolete_count": len(p.get("obsolete", [])),
            "valid_seconds": max(0, left), "confirmed_job": getattr(job, "confirmed_by", None)}


def env_secrets(app, env_id: str) -> dict:
    from .vault import Vault
    reg = app.hub.registry
    e = reg.get_environment(env_id)
    v = Vault(reg)
    cust = reg.get_customer(e["customer_id"]) if e.get("customer_id") else {}
    return {"vault": ("open" if app.vault_key is not None else "closed") if v.initialized else "none",
            "key_escrow": bool(cust.get("key_escrow")),
            "items": [{"kind": s["kind"], "kind_it": SECRET_IT.get(s["kind"], s["kind"]), "label": s.get("label") or "",
                       "updated_at": s.get("updated_at")} for s in v.list(env_id=e["id"])]}


def secret_set(app, env_id: str, body: dict) -> dict:
    from .vault import Vault
    from .web_ops import _secret_from_form
    vk = app.need_vault()
    kind = _str(body, "kind")
    if kind not in SECRET_IT:
        raise RegistryError("Tipo di segreto sconosciuto.")
    r = Vault(app.hub.registry).put(vk, env_id, kind, _secret_from_form(kind, body), _str(body, "label"))
    return {"kind": r["kind"], "fields": r["fields"]}


def secret_reveal(app, env_id: str, body: dict) -> dict:
    """Shown only after typing the vault passphrase again; every reveal goes into the history."""
    import time
    from .vault import Vault, VaultError
    v = Vault(app.hub.registry)
    try:
        vk = v.unlock(body.get("passphrase") or "")
    except VaultError:
        time.sleep(1.0)
        raise RegistryError("Passphrase della cassaforte sbagliata.")
    e = app.hub.registry.get_environment(env_id)
    data = v.get(vk, e["id"], _str(body, "kind"), _str(body, "label"), reason="reveal (gestionale)")
    return {"data": data}


def secret_delete(app, env_id: str, body: dict) -> dict:
    from .vault import Vault
    app.need_unlocked()
    if not body.get("sure"):
        raise RegistryError("Conferma l'eliminazione.")
    ok = Vault(app.hub.registry).delete(env_id, _str(body, "kind"), _str(body, "label"))
    if not ok:
        raise RegistryError("Segreto non trovato.")
    return {"ok": True}


def vault_unlock(app, body: dict) -> dict:
    import time
    from .vault import Vault, VaultError
    v = Vault(app.hub.registry)
    try:
        if not v.initialized:
            if (body.get("passphrase") or "") != (body.get("again") or ""):
                raise RegistryError("Le due passphrase non coincidono.")
            app.vault_key = v.init(body.get("passphrase") or "")
            return {"vault": "open", "created": True}
        app.vault_key = v.unlock(body.get("passphrase") or "")
    except VaultError as exc:
        time.sleep(1.0)
        raise RegistryError(str(exc))
    return {"vault": "open"}


def vault_lock(app, body: dict) -> dict:
    app.vault_key = None
    return {"vault": "closed"}


def env_add(app, body: dict) -> dict:
    """Register a remote environment (site online / studio server) on an existing installation."""
    from .envs import EnvManager
    kind = _str(body, "kind") or "web-php"
    url = _str(body, "url")
    if not url:
        raise RegistryError("Scrivi l'indirizzo, es. https://www.studio.it/docmap/")
    e = EnvManager(app.hub).add_remote(_str(body, "instance_id"), _str(body, "name") or "production", kind, url,
                                       _str(body, "api_url") or None, base_path=_str(body, "base_path") or None,
                                       studio_name=_str(body, "studio_name") or None)
    return {"id": e["id"], "name": e["name"]}


def env_create_local(app, body: dict) -> dict:
    from . import web_ops as W
    vk = app.need_vault()
    inst, name, sn = _str(body, "instance_id"), _str(body, "name") or "staging", _str(body, "studio_name")
    app.hub.registry.get_instance(inst)
    job = app.jobs.start(f"Nuovo ambiente sul PC: {name}", "env-create", {},
                         lambda h, j: W._job_create_local(h, j, vk, inst, name, sn))
    return {"job": job.id}


def env_start(app, env_id: str, body: dict) -> dict:
    from . import web_ops as W
    e = app.hub.registry.get_environment(env_id)
    if e["kind"] != "local-python":
        raise RegistryError("Si avviano da qui solo gli ambienti sul PC dell'hub.")
    job = app.jobs.start(f"Avvio {e['name']}", "env-start", {}, lambda h, j: W._job_start(h, j, env_id))
    return {"job": job.id}


def env_stop(app, env_id: str, body: dict) -> dict:
    from .runner import LocalRunner
    reg = app.hub.registry
    e = reg.get_environment(env_id)
    if e["kind"] != "local-python":
        raise RegistryError("Si fermano da qui solo gli ambienti sul PC dell'hub.")
    LocalRunner(app.hub.dir, reg).stop(e)
    return {"ok": True}


def env_update(app, env_id: str, body: dict) -> dict:
    """Edit address / API address / notes of an environment (not its name or kind)."""
    reg = app.hub.registry
    e = reg.get_environment(env_id)
    fields = {}
    for k in ("url", "api_url"):
        if k in body:
            v = _str(body, k)
            if v and not v.startswith(("http://", "https://")):
                raise RegistryError("Gli indirizzi iniziano con http:// o https://")
            fields[k] = v or None
    if not fields:
        return {"ok": True}
    reg.update_environment(e["id"], log_action="env.update", **fields)
    return {"ok": True}


def backups_view(app) -> dict:
    from . import backups as B
    hub = app.hub
    last = B.last_auto_at(hub)
    sch = getattr(app, "backup_scheduler", None)
    return {"config": B.config(hub.registry), "items": B.list_backups(hub)[:60],
            "last_auto": last.strftime("%Y-%m-%dT%H:%M:%SZ") if last else None,
            "due": B.due(hub), "error": getattr(sch, "error", None), "folder": str(hub.dir / "backups")}


def backups_config(app, body: dict) -> dict:
    from . import backups as B
    app.need_unlocked()
    B.set_config(app.hub.registry, auto=body.get("auto") if "auto" in body else None,
                 every_hours=body.get("every_hours") or None, keep=body.get("keep") or None,
                 copy_dir=body.get("copy_dir") if "copy_dir" in body else None)
    return backups_view(app)


def backup_now(app, body: dict) -> dict:
    from . import backups as B
    app.need_unlocked()
    job = app.jobs.start("Backup dell'hub", "hub-backup", {}, lambda h, j: B.run(h, auto=False, log=j.log))
    return {"job": job.id}


# ---------------------------------------------------------------------------
# v0.7: licence control (suspend / reactivate / revoke / modify / auto-renew), channel, encrypted export
# ---------------------------------------------------------------------------

def _after_licence(app, res: dict) -> dict:
    """Publish at once when the channel is set and the vault is open (else the scheduler / Panoramica say it)."""
    from . import licensing as LG
    from . import sitesetup as SS
    out = {"id": res["licence"]["licence_id"], "publish_job": None, "push_job": None}
    reg = app.hub.registry
    vk, iid = app.vault_key, res["licence"]["instance_id"]
    if vk is None:
        return out
    # v0.9: straight to the online sites of this installation (FTP), so a suspension or a renewal is in force at once
    if any(e["kind"] == "web-php" for e in reg.list_environments(iid)):
        job = app.jobs.start("Licenza inviata ai siti", "licence-push", {},
                             lambda h, j: {"sites": SS.push_licence(h, vk, iid, log=j.log)})
        out["push_job"] = job.id
    if LG.channel(reg) and res["licence"].get("update_url"):
        job = app.jobs.start("Pubblicazione della licenza", "licence-publish", {},
                             lambda h, j: LG.publish(h, vk, [iid], log=j.log))
        out["publish_job"] = job.id
    return out


def licence_action(app, iid: str, action: str, body: dict) -> dict:
    from . import licensing as LG
    app.need_unlocked()
    k = (app.key_id, app.private_key)
    if action == "suspend":
        res = LG.suspend(app.hub, *k, iid, reason=_str(body, "reason"))
    elif action == "revoke":
        if not body.get("sure"):
            raise RegistryError("Spunta la conferma per revocare.")
        res = LG.suspend(app.hub, *k, iid, revoke=True, reason=_str(body, "reason"))
    elif action == "reactivate":
        res = LG.reactivate(app.hub, *k, iid, months=int(body["months"]) if body.get("months") else None)
    elif action == "modify":
        lim = _limits(body)
        exp = None
        if body.get("expires_at"):
            exp = datetime.fromisoformat(str(body["expires_at"])[:10]).replace(tzinfo=timezone.utc, hour=23, minute=59)
        feats = body.get("features")
        cur = (LG.current(app.hub.registry, iid) or {}).get("licence") or {}
        add = rem = ()
        if isinstance(feats, list):
            have = set(cur.get("features") or [])
            add, rem = [f for f in feats if f not in have], [f for f in have if f not in feats]
        res = LG.modify(app.hub, *k, iid, limits=lim, add_features=add, remove_features=rem, expires_at=exp,
                        grace_days=int(body["grace_days"]) if str(body.get("grace_days") or "").strip() else None)
    elif action == "renew-short":
        res = LG.renew_short(app.hub, *k, iid)
    else:
        raise RegistryError("Azione sconosciuta.")
    return _after_licence(app, res)


def licence_autorenew(app, iid: str, body: dict) -> dict:
    from . import licensing as LG
    app.need_unlocked()
    reg = app.hub.registry
    iid = reg.get_instance(iid)["id"]
    if not body.get("on"):
        LG.set_autorenew(reg, iid, None)
        return {"autorenew": None}
    pol = LG.set_autorenew(reg, iid, {"days": body.get("days") or 35, "renew_before": body.get("renew_before") or 10,
                                      "until": body.get("until") or None})
    out = {"autorenew": pol, "id": None, "publish_job": None}
    if body.get("now"):
        out.update(_after_licence(app, LG.renew_short(app.hub, app.key_id, app.private_key, iid, allow_shorter=True)))
    return out


def licence_channel(app) -> dict:
    from . import licensing as LG
    reg = app.hub.registry
    ch = LG.channel(reg)
    sch = getattr(app, "licence_scheduler", None)
    envs = [{"id": e["id"], "label": f"{e['customer_name']} · {e['instance_label']} · {e['name']}", "url": e.get("url")}
            for e in reg.list_environments() if e["kind"] == "web-php"]
    return {"channel": ch, "rows": LG.channel_view(reg) if ch else [], "envs": envs,
            "error": getattr(sch, "error", None), "vault": app.vault_key is not None}


def licence_channel_set(app, body: dict) -> dict:
    from . import licensing as LG
    app.need_unlocked()
    LG.set_channel(app.hub.registry, _str(body, "env_id") or None)
    return licence_channel(app)


def licence_channel_publish(app, body: dict) -> dict:
    from . import licensing as LG
    vk = app.need_vault()
    app.need_unlocked()
    reissue = bool(body.get("reissue"))
    k = (app.key_id, app.private_key)

    def run(h, job):
        if reissue:  # licences issued before the channel existed: same content, now with the address inside
            for r in LG.channel_view(h.registry):
                if not r["update_url"] and r["status"] == "active":
                    LG.modify(h, *k, r["instance_id"])
                    job.log(f"Riemessa con l'indirizzo del canale: {r['customer_name']} · {r['instance_label']}")
        return LG.publish(h, vk, log=job.log)
    job = app.jobs.start("Pubblicazione delle licenze", "licence-publish", {}, run)
    return {"job": job.id}


def hub_export(app, body: dict) -> dict:
    from . import backups as B
    app.need_unlocked()
    if (body.get("passphrase") or "") != (body.get("again") or ""):
        raise RegistryError("Le due passphrase non coincidono.")
    name, data = B.export_encrypted(app.hub, body.get("passphrase") or "")
    (app.hub.dir / "backups" / name).write_bytes(data)
    return {"name": name, "size": len(data)}


# ---------------------------------------------------------------------------
# v0.9: site set-up by the hub, licence to the sites, update every site, new customer without AI
# ---------------------------------------------------------------------------

def env_setup(app, env_id: str, body: dict) -> dict:
    from . import sitesetup as SS
    vk = app.need_vault()
    env = app.hub.registry.get_environment(env_id)
    if env["kind"] != "web-php":
        raise RegistryError("La configurazione automatica vale solo per i siti online.")
    extra = []
    for line in str(body.get("people") or "").splitlines():
        p = [x.strip() for x in line.split(",")]
        if p and p[0]:
            extra.append((p[0], (p[1] if len(p) > 1 else "editor").lower()))

    def run(h, job):
        r = SS.setup_site(h, vk, env_id, extra_people=extra, log=job.log)
        if r.get("config_php"):
            r["config_name"] = f"config-{env['name']}.php"
        return r
    job = app.jobs.start(f"Configura il sito ({env['name']})", "site-setup", {}, run)
    return {"job": job.id}


def licence_push(app, iid: str, body: dict) -> dict:
    from . import sitesetup as SS
    vk = app.need_vault()
    iid = app.hub.registry.get_instance(iid)["id"]
    job = app.jobs.start("Licenza inviata ai siti", "licence-push", {},
                         lambda h, j: {"sites": SS.push_licence(h, vk, iid, log=j.log)})
    return {"job": job.id}


def updates(app) -> dict:
    from . import sitesetup as SS
    target = SS.available_version(app.hub.registry)
    return {"target": target, "sites": SS.outdated_sites(app.hub, target) if target else [],
            "vault": app.vault_key is not None}


def updates_run(app, body: dict) -> dict:
    from . import sitesetup as SS
    vk = app.need_vault()
    ids = [str(x) for x in (body.get("env_ids") or []) if str(x).strip()]
    if not ids:
        raise RegistryError("Nessun sito scelto.")
    job = app.jobs.start(f"Aggiorna {len(ids)} siti", "sites-update", {},
                         lambda h, j: SS.update_sites(h, vk, ids, log=j.log))
    return {"job": job.id}


def draft_blank(app, body: dict) -> dict:
    """«Nuovo cliente»: the same guided masks as «Crea progetto con AI», starting empty (no AI needed)."""
    import copy as _copy
    import json as _json
    from . import pipeline as P
    name = _str(body, "name")
    if not name:
        raise RegistryError("Scrivi la ragione sociale.")
    d = _copy.deepcopy(P.TEMPLATE)
    d["cliente"]["ragione_sociale"] = name
    d["cliente"]["partita_iva"] = _str(body, "vat_id")
    d["progetto"]["nome"] = f"DocMap {name}"
    d["progetto"]["nome_studio"] = name
    inst = body.get("installazioni")
    if isinstance(inst, list):
        d["progetto"]["installazioni"] = [x for x in ("sede", "online") if x in inst]
    d["online"]["ftp"]["password"] = ""
    d["postazioni"] = []
    d["utenti_iniziali"] = []
    d["archivi"] = []
    return draft_create(app, {"text": _json.dumps(d, ensure_ascii=False)})
