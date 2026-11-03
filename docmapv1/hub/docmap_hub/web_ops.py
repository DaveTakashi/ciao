"""v0.2 pages of the local hub page: Istanze & ambienti, Cassaforte, Deploy, Porte, Stato.

Called by web.py (same server, same login, same CSRF token, 127.0.0.1 only).
Slow operations (start a server, copy data, build + deploy, check-all) run as
*jobs* in a background thread with their own registry connection: the page
answers at once and the job page refreshes itself until the job ends.
"""

from __future__ import annotations

import html
import json
import threading
import time
import traceback
import urllib.parse
import uuid
from datetime import datetime, timezone

from . import health
from .registry import ENV_KINDS
from .vault import KINDS, KIND_IT, Vault, VaultError

NAV = [("/", "Licenze"), ("/envs", "Istanze & ambienti"), ("/vault", "Cassaforte"), ("/deploy", "Deploy"),
       ("/ports", "Porte"), ("/status", "Stato")]
JOB_KEEP = 40
PLAN_MAX_AGE = 1800  # a dry-run is valid for 30 minutes before "Conferma"


def _e(v) -> str:
    return html.escape("" if v is None else str(v), quote=True)


def q(text: str) -> str:
    return urllib.parse.quote(str(text))


# ---------------------------------------------------------------------------
# jobs
# ---------------------------------------------------------------------------

class Job:
    def __init__(self, title: str, kind: str, params: dict):
        self.id = uuid.uuid4().hex[:12]
        self.title, self.kind, self.params = title, kind, params
        self.status = "running"
        self.lines: list[str] = []
        self.result: dict | None = None
        self.error: str | None = None
        self.started = time.time()
        self.finished: float | None = None

    def log(self, msg: str) -> None:
        self.lines.append(f"{datetime.now().strftime('%H:%M:%S')}  {msg}")


class Jobs:
    def __init__(self, app):
        self.app = app
        self.items: dict[str, Job] = {}
        self.lock = threading.Lock()

    def start(self, title: str, kind: str, params: dict, fn) -> Job:
        """``fn(hub, job)`` runs in a thread with its own Hub (own SQLite connection)."""
        from .service import Hub
        job = Job(title, kind, params)
        with self.lock:
            self.items[job.id] = job
            for old in sorted(self.items.values(), key=lambda j: j.started)[:-JOB_KEEP]:
                self.items.pop(old.id, None)

        def run():
            try:
                with Hub(self.app.hub.dir) as h:
                    job.result = fn(h, job) or {}
                job.status = "ok"
            except Exception as exc:  # shown on the job page
                job.error = str(exc)
                job.status = "error"
                job.log("ERRORE: " + str(exc))
                if not getattr(exc, "args", None):
                    job.log(traceback.format_exc(limit=3))
            finally:
                job.finished = time.time()
        threading.Thread(target=run, daemon=True, name=f"hub-job-{job.id}").start()
        return job

    def get(self, jid: str) -> Job | None:
        return self.items.get(jid)


# ---------------------------------------------------------------------------
# page pieces
# ---------------------------------------------------------------------------

def nav(active: str, hidden: str) -> str:
    links = " ".join(f"<a href='{h}' class='{'on' if h == active else ''}'>{_e(t)}</a>" for h, t in NAV)
    return (f"<nav class='top'><div class='links'><b>DocMap Hub</b> {links}</div>"
            f"<form class='inline' method='post' action='/logout'>{hidden}<button class='sec'>Esci</button></form>"
            "</nav>")


def msgs(ok, err) -> str:
    out = ""
    if ok:
        out += f"<div class='msg'>{_e(ok)}</div>"
    if err:
        out += f"<div class='msg err'>Errore: {_e(err)}</div>"
    return out


def options(items, selected=None) -> str:
    return "".join(f"<option value='{_e(v)}'{' selected' if v == selected else ''}>{_e(t)}</option>"
                   for v, t in items)


def env_options(reg, kinds=None) -> str:
    return options([(e["id"], f"{e['customer_name']} · {e['instance_label']} · {e['name']} ({e['kind']})")
                    for e in reg.list_environments() if not kinds or e["kind"] in kinds])


def inst_options(reg) -> str:
    return options([(i["id"], f"{i['customer_name']} · {i['label']}") for i in reg.list_instances()])


def yesno(v) -> str:
    return {True: "<span class='full'>sì</span>", False: "<span class='invalid'>no</span>"}.get(v, "?")


# ---------------------------------------------------------------------------
# pages
# ---------------------------------------------------------------------------

def page_envs(app, hidden: str) -> str:
    reg = app.hub.registry
    rows = []
    for e in reg.list_environments():
        act = ""
        if e["kind"] == "local-python":
            act = (f"<form class='inline' method='post' action='/env/start'>{hidden}"
                   f"<input type='hidden' name='env' value='{_e(e['id'])}'><button class='sec'>avvia</button></form> "
                   f"<form class='inline' method='post' action='/env/stop'>{hidden}"
                   f"<input type='hidden' name='env' value='{_e(e['id'])}'><button class='sec'>ferma</button></form>")
        link = (f"<a href='{_e(e['url'])}' rel='noreferrer'>{_e(e['url'])}</a>"
                if (e.get("url") or "").startswith(("http://127.0.0.1", "https://")) else _e(e.get("url")))
        rows.append(f"<tr><td>{_e(e['customer_name'])}</td><td>{_e(e['instance_label'])}</td>"
                    f"<td><b>{_e(e['name'])}</b></td><td>{_e(e['kind'])}</td><td>{_e(e.get('port') or '')}</td>"
                    f"<td>{_e(e['status'])}</td><td>{_e(e.get('app_version') or '')}</td><td>{link}</td>"
                    f"<td>{_e((e.get('expires_at') or '')[:10])}</td><td>{act}</td></tr>")
    table = ("<section><h2>Ambienti</h2><table><tr><th>cliente</th><th>installazione</th><th>ambiente</th>"
             "<th>tipo</th><th>porta</th><th>stato</th><th>versione</th><th>indirizzo</th><th>scade</th><th></th></tr>"
             + ("".join(rows) or "<tr><td colspan='10'>Nessun ambiente. Aggiungine uno qui sotto.</td></tr>")
             + "</table></section>")
    custs = reg.list_customers()
    esc_rows = "".join(
        f"<tr><td>{_e(c['name'])}</td><td>{'<b>ATTIVA</b>' if c.get('key_escrow') else 'spenta'}</td><td>"
        f"<form class='inline' method='post' action='/customer/escrow'>{hidden}"
        f"<input type='hidden' name='customer' value='{_e(c['id'])}'>"
        f"<input type='hidden' name='on' value='{'0' if c.get('key_escrow') else '1'}'>"
        f"<button class='sec'>{'spegni (elimina le configurazioni custodite)' if c.get('key_escrow') else 'attiva (con consenso scritto)'}"
        f"</button></form></td></tr>" for c in custs)
    io = inst_options(reg)
    forms = (
        "<div class='grid'>"
        f"<section><h2>Registra ambiente remoto</h2><form method='post' action='/env/add'>{hidden}"
        f"<label>Installazione</label><select name='instance' required>{io}</select>"
        "<label>Ambiente</label><select name='name'><option>production</option><option>staging</option></select>"
        "<label>Tipo</label><select name='kind'><option value='web-php'>web-php (sito, deploy FTP)</option>"
        "<option value='studio-python'>studio-python (server in studio)</option></select>"
        "<label>Indirizzo dell'app</label><input name='url' required placeholder='https://docmap.pr-it.it/studio-de/'>"
        "<label>Indirizzo API (vuoto = automatico)</label><input name='api_url'>"
        "<button>Registra</button></form></section>"
        f"<section><h2>Nuovo ambiente sul PC del hub</h2><form method='post' action='/env/create-local'>{hidden}"
        f"<label>Installazione</label><select name='instance' required>{io}</select>"
        "<label>Ambiente</label><select name='name'><option>staging</option><option>production</option></select>"
        "<label>Nome dello studio (facoltativo)</label><input name='studio_name'>"
        "<p class='mut'>Crea configurazione, chiave e codici (custoditi in cassaforte) e riserva una porta libera.</p>"
        "<button>Crea</button></form></section>"
        f"<section><h2>Demo a scadenza</h2><form method='post' action='/env/demo'>{hidden}"
        f"<label>Installazione</label><select name='instance' required>{io}</select>"
        "<label>Giorni</label><input name='days' type='number' min='1' max='90' value='7'>"
        "<label>Copia i dati da</label><select name='src'><option value='production'>production</option>"
        "<option value='staging'>staging</option><option value='none'>nessuno (demo vuota)</option></select>"
        "<p class='mut'>Con dati veri serve la custodia della chiave attiva per il cliente.</p>"
        "<button>Crea demo</button></form></section>"
        f"<section><h2>Copia dati verso staging/demo</h2><form method='post' action='/env/clone'>{hidden}"
        f"<label>Installazione</label><select name='instance' required>{io}</select>"
        "<label>Da</label><input name='src' value='production'><label>A (locale)</label><input name='dst' value='staging'>"
        "<label><input type='checkbox' name='dry_run' value='1' style='width:auto'> solo prova (nulla scritto)</label>"
        "<button>Copia</button></form></section>"
        f"<section><h2>Elimina ambiente</h2><form method='post' action='/env/delete'>{hidden}"
        f"<label>Ambiente</label><select name='env'>{env_options(reg)}</select>"
        "<label>Per production: scrivi il nome esatto dell'installazione</label><input name='confirm'>"
        "<label><input type='checkbox' name='sure' value='1' style='width:auto'> confermo: i dati locali vanno in "
        "_trash, i segreti vengono eliminati, il sito remoto non si tocca</label>"
        "<button>Elimina</button></form>"
        f"<form method='post' action='/env/purge'>{hidden}<button class='sec' style='margin-top:12px'>"
        "Archivia le demo scadute</button></form></section></div>")
    escrow = ("<section><h2>Custodia della chiave (GDPR)</h2><p class='mut'>Spenta (predefinito): l'hub non conserva "
              "config/aes_key del cliente e non copia i suoi dati sul PC del hub.</p><table><tr><th>cliente</th>"
              "<th>custodia</th><th></th></tr>" + (esc_rows or "<tr><td colspan='3'>Nessun cliente</td></tr>")
              + "</table></section>")
    return table + forms + escrow


def page_vault(app, hidden: str, revealed: dict | None = None) -> str:
    reg = app.hub.registry
    v = Vault(reg)
    if not v.initialized:
        return (f"<section><h2>Cassaforte</h2><p>Non ancora creata.</p><form method='post' action='/vault/init'>{hidden}"
                "<label>Passphrase della cassaforte (consigliata: la stessa della chiave di firma)</label>"
                "<input type='password' name='passphrase' required autocomplete='new-password'>"
                "<button>Crea la cassaforte</button></form></section>")
    parts = []
    if app.vault_key is None:
        parts.append(f"<section><h2>Cassaforte chiusa</h2><form method='post' action='/vault/unlock'>{hidden}"
                     "<label>Passphrase della cassaforte</label><input type='password' name='passphrase' required>"
                     "<button>Apri</button></form></section>")
    if revealed:
        parts.append(f"<section><h2>Segreto: {_e(revealed['kind'])} · {_e(revealed['env'])}</h2>"
                     "<p class='mut'>Mostrato una volta, registrato nel registro delle operazioni. Non lasciare la "
                     "pagina aperta.</p><pre>" + _e(json.dumps(revealed["data"], indent=2, ensure_ascii=False))
                     + "</pre></section>")
    rows = "".join(
        f"<tr><td>{_e(s['customer_name'])}</td><td>{_e(s['instance_label'])}</td><td>{_e(s['env_name'])}</td>"
        f"<td>{_e(s['kind'])}</td><td>{_e(s['label'])}</td><td>{_e(s['updated_at'][:16])}</td><td>"
        f"<form class='inline' method='post' action='/vault/reveal'>{hidden}"
        f"<input type='hidden' name='env' value='{_e(s['env_id'])}'><input type='hidden' name='kind' value='{_e(s['kind'])}'>"
        f"<input type='hidden' name='label' value='{_e(s['label'])}'>"
        "<input type='password' name='passphrase' placeholder='passphrase' style='width:140px' required>"
        " <button class='sec'>mostra</button></form></td></tr>" for s in v.list())
    parts.append("<section><h2>Segreti custoditi</h2><table><tr><th>cliente</th><th>installazione</th><th>ambiente</th>"
                 "<th>tipo</th><th>etichetta</th><th>aggiornato</th><th></th></tr>"
                 + (rows or "<tr><td colspan='7'>Nessun segreto</td></tr>") + "</table></section>")
    kinds = options([(k, f"{k} — {KIND_IT[k]}") for k in KINDS])
    parts.append(
        f"<section><h2>Salva un segreto</h2><form method='post' action='/vault/set'>{hidden}"
        f"<div class='grid'><div><label>Ambiente</label><select name='env' required>{env_options(reg)}</select>"
        f"<label>Tipo</label><select name='kind'>{kinds}</select>"
        "<label>Etichetta (facoltativa, es. nome utente)</label><input name='label'></div>"
        "<div><label>Utente / user</label><input name='user' autocomplete='off'>"
        "<label>Password / token</label><input type='password' name='password' autocomplete='new-password'>"
        "<label>FTP: host</label><input name='host'><label>FTP: porta</label><input name='port' type='number'>"
        "<label>FTP: protocollo</label><select name='protocol'><option>ftps</option><option>sftp</option>"
        "<option>ftp</option><option>local</option></select>"
        "<label>FTP: cartella remota</label><input name='remote_path' placeholder='/public_html/studio-de'></div>"
        "<div><label>db_config: contenuto di config.json / config.php (solo con custodia attiva)</label>"
        "<textarea name='content' rows='6'></textarea><label>Nota</label><textarea name='text' rows='3'></textarea>"
        "</div></div><button>Salva cifrato</button></form></section>")
    return "".join(parts)


def page_deploy(app, hidden: str) -> str:
    reg = app.hub.registry
    webenvs = [e for e in reg.list_environments() if e["kind"] == "web-php"]
    rows = "".join(
        f"<tr><td>{_e(d['started_at'][:16])}</td><td>{_e(_env_name(reg, d['env_id']))}</td><td>{_e(d['version'])}</td>"
        f"<td>{'prova' if d['dry_run'] else ''}</td><td>{_e(d['status'])}</td></tr>"
        for d in reg.list_deploys(limit=15))
    stag = "".join(
        f"<li>{_e(e['customer_name'])} · {_e(e['instance_label'])}: staging verificato "
        f"<b>{_e(e.get('verified_version') or 'nessuno')}</b> ({_e((e.get('verified_at') or '')[:16])})</li>"
        for e in webenvs if e["name"] == "staging")
    insts = sorted({(e["instance_id"], f"{e['customer_name']} · {e['instance_label']}") for e in webenvs
                    if e["name"] == "staging"})
    return (
        "<div class='grid'>"
        f"<section><h2>1. Prova (dry-run)</h2><form method='post' action='/deploy/plan'>{hidden}"
        f"<label>Ambiente web-php</label><select name='env' required>{env_options(reg, ['web-php'])}</select>"
        "<label><input type='checkbox' name='overwrite_htaccess' value='1' style='width:auto'> sostituisci anche i "
        ".htaccess modificati a mano</label>"
        "<label><input type='checkbox' name='insecure_ftp' value='1' style='width:auto'> consenti FTP non cifrato "
        "(sconsigliato)</label>"
        "<p class='mut'>Costruisce il deploy e confronta con il server: nulla viene modificato. Dal risultato potrai "
        "confermare (backup → caricamento → controllo, con ripristino automatico se il controllo fallisce).</p>"
        "<button>Prepara il piano</button></form></section>"
        f"<section><h2>Promuovi staging → production</h2><form method='post' action='/promote/plan'>{hidden}"
        f"<label>Installazione</label><select name='instance'>{options(insts)}</select>"
        f"<ul>{stag or '<li>Nessuno staging web-php</li>'}</ul>"
        "<p class='mut'>Pubblica in production solo lo stesso codice verificato su staging.</p>"
        "<button>Prepara il piano</button></form></section></div>"
        "<section><h2>Ultimi deploy</h2><table><tr><th>quando</th><th>ambiente</th><th>versione</th><th></th>"
        "<th>esito</th></tr>" + (rows or "<tr><td colspan='5'>Nessun deploy</td></tr>") + "</table></section>")


def _env_name(reg, env_id):
    try:
        e = reg.get_environment(env_id)
        return f"{reg.get_instance(e['instance_id'])['label']} · {e['name']}"
    except Exception:
        return env_id


def page_ports(app, hidden: str) -> str:
    from .ports import PortManager
    pm = PortManager(app.hub.registry)
    a, b = pm.range
    rows = "".join(
        f"<tr><td>{r['port']}</td><td>{_e(r['instance_label'])}</td><td>{_e(r['env_name'])}</td><td>{_e(r['status'])}</td>"
        f"<td>{'libera' if r['free_now'] else 'in uso'}</td><td>{_e(r['reserved_at'][:16])}</td></tr>"
        for r in pm.list())
    return (f"<section><h2>Porte riservate (intervallo {a}-{b})</h2><p class='mut'>«in uso» è normale per un ambiente "
            "avviato; se è spento e la porta è in uso, al prossimo avvio l'ambiente si sposta da solo.</p>"
            "<table><tr><th>porta</th><th>installazione</th><th>ambiente</th><th>stato</th><th>adesso</th>"
            "<th>riservata</th></tr>" + (rows or "<tr><td colspan='6'>Nessuna porta riservata</td></tr>")
            + "</table></section>"
            f"<section><h2>Intervallo</h2><form method='post' action='/ports/range'>{hidden}"
            f"<div class='grid'><div><label>Da</label><input name='start' type='number' value='{a}'></div>"
            f"<div><label>A</label><input name='end' type='number' value='{b}'></div></div>"
            "<button>Salva</button></form></section>")


def page_status(app, hidden: str) -> str:
    rows = []
    for r in health.status_rows(app.hub):
        lic = (r["licence_expires_at"] or "nessuna")[:10]
        if r["licence_days_left"] is not None:
            cls = "full" if r["licence_days_left"] > 30 else ("grace" if r["licence_days_left"] >= 0 else "invalid")
            lic = f"<span class='{cls}'>{_e(lic)} ({r['licence_days_left']} gg)</span>"
        rows.append(f"<tr><td>{_e(r['customer'])}</td><td>{_e(r['instance'])}</td><td><b>{_e(r['env'])}</b></td>"
                    f"<td>{_e(r['kind'])}</td><td>{_e(r['status'])}</td><td>{yesno(r['reachable'])}"
                    f"{' · ' + _e(r['error']) if r['error'] else ''}</td><td>{_e(r['app_version'] or '')}</td>"
                    f"<td>{lic}</td><td>{_e((r['last_backup_at'] or '')[:16])}</td>"
                    f"<td>{_e((r['last_check'] or '')[:16])}</td></tr>")
    running = [j for j in app.jobs.items.values() if j.kind == "check-all" and j.status == "running"]
    btn = ("<p class='mut'>Controllo in corso…</p>" if running else
           f"<form method='post' action='/check-all'>{hidden}<button>Controlla tutto adesso</button></form>")
    return ("<section><h2>Stato di tutte le installazioni</h2>" + btn +
            "<table><tr><th>cliente</th><th>installazione</th><th>ambiente</th><th>tipo</th><th>stato</th>"
            "<th>raggiungibile</th><th>versione</th><th>licenza</th><th>ultimo backup</th><th>ultimo controllo</th></tr>"
            + ("".join(rows) or "<tr><td colspan='10'>Nessun ambiente</td></tr>") + "</table></section>")


def page_job(app, hidden: str, job: Job) -> str:
    st = {"running": "in corso…", "ok": "<span class='full'>completato</span>",
          "error": "<span class='invalid'>non riuscito</span>"}[job.status]
    out = [f"<section><h2>{_e(job.title)}</h2><p>Stato: {st}</p><pre>" + _e("\n".join(job.lines[-200:]))
           + "</pre></section>"]
    r = job.result or {}
    if job.status == "ok" and job.kind in ("deploy-plan", "promote-plan"):
        p = r.get("plan") or {}
        items = "".join(f"<li><code>{_e(i['path'])}</code> — {_e(i['why'])}</li>" for i in p.get("upload", [])[:200])
        prot = "".join(f"<li><code>{_e(i['path'])}</code> — {_e(i['why'])}</li>" for i in p.get("protected", []))
        obs = "".join(f"<li><code>{_e(o)}</code></li>" for o in p.get("obsolete", [])[:50])
        out.append(f"<section><h2>Piano: {_e(r.get('remote_version') or '?')} → {_e(r.get('version'))}</h2>"
                   f"<p>Da caricare: <b>{len(p.get('upload', []))}</b> · invariati {len(p.get('unchanged', []))}</p>"
                   f"<ul>{items}</ul>" + (f"<h2>Protetti (non toccati)</h2><ul>{prot}</ul>" if prot else "")
                   + (f"<h2>Sul server ma non più nel programma (NON cancellati)</h2><ul>{obs}</ul>" if obs else ""))
        if p.get("upload"):
            action = "/deploy/run" if job.kind == "deploy-plan" else "/promote/run"
            out.append(f"<form method='post' action='{action}'>{hidden}<input type='hidden' name='job' value='{job.id}'>"
                       "<label><input type='checkbox' name='sure' value='1' style='width:auto' required> ho letto il "
                       "piano: procedi con backup, caricamento e controllo</label><button>Conferma il deploy</button>"
                       "</form>")
        else:
            out.append("<p>Niente da caricare: il server è già aggiornato.</p>")
        out.append("</section>")
    elif job.status == "ok" and r:
        out.append("<section><h2>Risultato</h2><pre>" + _e(json.dumps(r, indent=1, ensure_ascii=False,
                                                                      default=str)[:20000]) + "</pre></section>")
    return "".join(out)


# ---------------------------------------------------------------------------
# actions (POST). Each returns (redirect_location) or a tuple ("page", title, html)
# ---------------------------------------------------------------------------

def _secret_from_form(kind: str, f: dict) -> dict:
    g = lambda k: (f.get(k) or "").strip()  # noqa: E731
    if kind == "ftp":
        return {"host": g("host"), "port": g("port") or None, "user": g("user"), "password": f.get("password") or "",
                "protocol": g("protocol") or "ftps", "remote_path": g("remote_path")}
    if kind in ("basic_auth", "superadmin"):
        return {"user": g("user"), "password": f.get("password") or ""}
    if kind == "admin_token":
        return {"user": g("user") or "admin", "token": f.get("password") or ""}
    if kind == "db_config":
        return {"content": f.get("content") or "", "format": "php" if "<?php" in (f.get("content") or "") else "json"}
    return {"text": f.get("text") or ""}


def action(app, path: str, f: dict):
    """Handle a v0.2 POST. Returns a redirect target, ("page", title, body) or None if not ours."""
    from .envs import EnvManager
    from .ports import PortManager
    reg = app.hub.registry
    if path == "/env/add":
        e = EnvManager(app.hub).add_remote(f.get("instance", ""), f.get("name", ""), f.get("kind", ""),
                                           f.get("url", "").strip(), f.get("api_url", "").strip() or None)
        return "/envs?ok=" + q(f"Ambiente registrato: {e['name']} ({e['kind']}). Ora salva le credenziali in Cassaforte.")
    if path == "/env/create-local":
        vk = app.need_vault()
        inst, name, sn = f.get("instance", ""), f.get("name", "staging"), f.get("studio_name", "")
        job = app.jobs.start(f"Nuovo ambiente locale {name}", "env-create", {},
                             lambda h, j: _job_create_local(h, j, vk, inst, name, sn))
        return f"/job/{job.id}"
    if path in ("/env/start", "/env/stop"):
        env_id = f.get("env", "")
        reg.get_environment(env_id)
        if path == "/env/stop":
            from .runner import LocalRunner
            LocalRunner(app.hub.dir, reg).stop(reg.get_environment(env_id))
            return "/envs?ok=" + q("Ambiente fermato.")
        job = app.jobs.start("Avvio ambiente", "env-start", {}, lambda h, j: _job_start(h, j, env_id))
        return f"/job/{job.id}"
    if path == "/env/clone":
        vk = app.need_vault()
        inst, src, dst, dry = f.get("instance", ""), f.get("src", ""), f.get("dst", ""), bool(f.get("dry_run"))
        job = app.jobs.start(f"Copia dati {src} → {dst}", "env-clone", {},
                             lambda h, j: EnvManager(h).clone_data(inst, src, dst, vk, dry_run=dry))
        return f"/job/{job.id}"
    if path == "/env/demo":
        vk = app.need_vault()
        inst, days = f.get("instance", ""), int(f.get("days") or 7)
        src = None if f.get("src") in ("", "none") else f.get("src")
        job = app.jobs.start("Nuova demo", "env-demo", {},
                             lambda h, j: _clean(EnvManager(h).demo_create(inst, days, vk, src)))
        return f"/job/{job.id}"
    if path == "/env/delete":
        e = reg.get_environment(f.get("env", ""))
        if not f.get("sure"):
            raise VaultError("Spunta la conferma per eliminare l'ambiente.")
        r = EnvManager(app.hub).delete(e["instance_id"], e["name"], production=e["name"] == "production",
                                       confirm=f.get("confirm"))
        return "/envs?ok=" + q(f"Ambiente {e['name']} eliminato." + (f" Dati in {r['archived_to']}." if r["archived_to"] else ""))
    if path == "/env/purge":
        r = EnvManager(app.hub).purge_expired()
        return "/envs?ok=" + q(f"Demo scadute archiviate: {len(r)}.")
    if path == "/customer/escrow":
        on = f.get("on") == "1"
        if not on:
            Vault(reg).purge_escrow(f.get("customer", ""))
        c = reg.set_key_escrow(f.get("customer", ""), on)
        return "/envs?ok=" + q(f"{c['name']}: custodia della chiave {'attiva' if on else 'spenta'}.")
    if path == "/vault/init":
        app.vault_key = Vault(reg).init(f.get("passphrase", ""))
        return "/vault?ok=" + q("Cassaforte creata.")
    if path == "/vault/unlock":
        app.vault_key = Vault(reg).unlock(f.get("passphrase", ""))
        return "/vault?ok=" + q("Cassaforte aperta.")
    if path == "/vault/set":
        vk = app.need_vault()
        kind = f.get("kind", "")
        r = Vault(reg).put(vk, f.get("env", ""), kind, _secret_from_form(kind, f), f.get("label", ""))
        return "/vault?ok=" + q(f"Segreto salvato: {r['kind']} ({', '.join(r['fields'])}).")
    if path == "/vault/reveal":
        v = Vault(reg)
        try:
            vk = v.unlock(f.get("passphrase", ""))  # always re-entered
        except VaultError:
            time.sleep(1.0)
            raise
        env = reg.get_environment(f.get("env", ""))
        data = v.get(vk, env["id"], f.get("kind", ""), f.get("label", ""), reason="reveal (pagina web)")
        return ("page", "Cassaforte", {"kind": f.get("kind"), "env": f"{_env_name(reg, env['id'])}", "data": data})
    if path in ("/deploy/plan", "/promote/plan"):
        vk = app.need_vault()
        opts = {"insecure_ftp": bool(f.get("insecure_ftp")), "overwrite_htaccess": bool(f.get("overwrite_htaccess"))}
        if path == "/deploy/plan":
            e = reg.get_environment(f.get("env", ""))
            params = dict(opts, instance=e["instance_id"], env=e["name"])
            title = f"Piano di deploy: {_env_name(reg, e['id'])}"
            job = app.jobs.start(title, "deploy-plan", params, lambda h, j: _job_deploy(h, j, vk, params, True))
        else:
            params = dict(opts, instance=f.get("instance", ""))
            job = app.jobs.start("Piano di promozione staging → production", "promote-plan", params,
                                 lambda h, j: _job_promote(h, j, vk, params, True))
        return f"/job/{job.id}"
    if path in ("/deploy/run", "/promote/run"):
        vk = app.need_vault()
        plan = app.jobs.get(f.get("job", ""))
        want = "deploy-plan" if path == "/deploy/run" else "promote-plan"
        if (not plan or plan.kind != want or plan.status != "ok" or not f.get("sure")
                or time.time() - (plan.finished or 0) > PLAN_MAX_AGE):
            raise VaultError("Piano scaduto o non valido: rifai la prova (dry-run) e conferma entro 30 minuti.")
        params = plan.params
        if path == "/deploy/run":
            job = app.jobs.start(plan.title.replace("Piano di deploy", "Deploy"), "deploy-run", params,
                                 lambda h, j: _job_deploy(h, j, vk, params, False))
        else:
            job = app.jobs.start("Promozione staging → production", "promote-run", params,
                                 lambda h, j: _job_promote(h, j, vk, params, False))
        return f"/job/{job.id}"
    if path == "/ports/range":
        a, b = PortManager(reg).set_range(int(f.get("start") or 0), int(f.get("end") or 0))
        return "/ports?ok=" + q(f"Intervallo delle porte: {a}-{b}.")
    if path == "/check-all":
        tl = health.targets(app.hub, app.vault_key)  # (already under the page lock)
        job = app.jobs.start("Controllo di tutte le installazioni", "check-all", {},
                             lambda h, j: _job_check(h, j, tl))
        return f"/job/{job.id}"
    return None


def _clean(d: dict) -> dict:
    """Never show tokens in a job result."""
    d = dict(d)
    if "tokens" in d:
        d["tokens"] = [{"user": t["user"], "role": t["role"], "token": "(in cassaforte)"} for t in d["tokens"]]
    return d


def _job_create_local(h, job, vk, inst, name, studio_name):
    from .envs import EnvManager
    job.log("Configuro il server (setup), riservo la porta, costruisco la web app…")
    r = EnvManager(h).create_local(inst, name, vk, studio_name)
    job.log(f"Creato: porta {r['env'].get('port')}. Codici custoditi in cassaforte.")
    return _clean({"env": r["env"]["name"], "port": r["env"].get("port"), "tokens": r["tokens"],
                   "app": {k: str(v) for k, v in (r.get("app") or {}).items() if k != "output"}})


def _job_start(h, job, env_id):
    from .runner import LocalRunner
    e = h.registry.get_environment(env_id)
    job.log(f"Avvio {e['name']}…")
    r = LocalRunner(h.dir, h.registry).start(e)
    if r.get("moved_from"):
        job.log(f"Porta {r['moved_from']} occupata da un altro programma: spostato sulla {r['port']}.")
    job.log(f"In esecuzione: http://127.0.0.1:{r['port']}/ (versione {r.get('app_version')})")
    return {"url": f"http://127.0.0.1:{r['port']}/", "port": r["port"], "moved_from": r.get("moved_from")}


def _job_deploy(h, job, vk, params, dry):
    from .deploy import deploy
    r = deploy(h, vk, params["instance"], params["env"], dry_run=dry, insecure_ftp=params["insecure_ftp"],
               overwrite_htaccess=params["overwrite_htaccess"], log=job.log,
               expect_code_hash=None if dry else params.get("code_hash"))
    if dry:
        params["code_hash"] = r.get("code_hash")  # the confirmed deploy must publish this exact code
    return r


def _job_promote(h, job, vk, params, dry):
    from .deploy import promote
    r = promote(h, vk, params["instance"], dry_run=dry, insecure_ftp=params["insecure_ftp"],
                overwrite_htaccess=params["overwrite_htaccess"], log=job.log,
                expect_code_hash=None if dry else params.get("code_hash"))
    if dry:
        params["code_hash"] = r.get("code_hash")
    return r


def _job_check(h, job, tl):
    job.log(f"Controllo {len(tl)} ambienti (timeout 5 s ciascuno, in parallelo)…")
    res = health.probe_all(tl, timeout=5)
    health.store_results(h, res)
    ok = sum(1 for r in res.values() if r.get("ok"))
    job.log(f"Rispondono {ok} su {len(res)}.")
    return {"checked": len(res), "ok": ok}


__all__ = ["NAV", "Jobs", "action", "page_envs", "page_vault", "page_deploy", "page_ports", "page_status",
           "page_job", "nav", "msgs", "ENV_KINDS"]
