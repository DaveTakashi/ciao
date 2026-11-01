"""Tiny local admin page for the hub (stdlib ``http.server``).

* Bound to 127.0.0.1 only; requests with a foreign ``Host`` header are
  refused (protects against DNS rebinding).
* The passphrase is asked when the page is started: it decrypts the signing
  key, which stays in memory only. The browser must log in with the same
  passphrase; only a salted scrypt hash of it is kept in memory to check
  the login. Nothing is written to disk.
* Every form carries a per-session CSRF token. No external assets.
"""

from __future__ import annotations

import hashlib
import hmac
import html
import secrets
import threading
import time
import urllib.parse
import webbrowser
from datetime import datetime, timezone
from http import cookies
from http.server import BaseHTTPRequestHandler, HTTPServer

from . import licence as L
from .keys import KeyError_
from .registry import RegistryError
from .service import Hub

COOKIE = "dmhub_session"
SESSION_TTL = 8 * 3600

MODE_IT = {L.MODE_FULL: "valida", L.MODE_GRACE: "in tolleranza",
           L.MODE_READ_ONLY: "sola lettura", L.MODE_INVALID: "non valida"}

CSS = """
:root{--bg:#f6f7f9;--fg:#1d2430;--mut:#5b6575;--card:#fff;--line:#d9dee6;--acc:#0a5c8a;
--ok:#1d7a3a;--warn:#9a6400;--bad:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#14181f;--fg:#e6e9ef;--mut:#9aa4b2;--card:#1c222b;
--line:#2c3440;--acc:#5fb0e0;--ok:#5cc47a;--warn:#e0a84a;--bad:#f08078}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);
font:15px/1.45 system-ui,Segoe UI,sans-serif}main{max-width:1200px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:8px 0 16px}h2{font-size:17px;margin:0 0 10px}
section{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px;margin:0 0 16px;
overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--mut);font-weight:600}code{font:13px ui-monospace,Consolas,monospace}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
label{display:block;margin:6px 0 2px;color:var(--mut);font-size:13px}
input,select{width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);
color:var(--fg);font:inherit}button{margin-top:10px;padding:7px 14px;border:0;border-radius:6px;
background:var(--acc);color:#fff;font:inherit;cursor:pointer}button.sec{background:transparent;
color:var(--acc);border:1px solid var(--acc);margin:0;padding:3px 8px}
.full{color:var(--ok)}.grace{color:var(--warn)}.read_only,.invalid{color:var(--bad)}
.msg{padding:10px 12px;border-radius:6px;margin:0 0 16px;border:1px solid var(--line);background:var(--card)}
.err{border-color:var(--bad);color:var(--bad)}.top{display:flex;justify-content:space-between;align-items:center}
form.inline{display:inline}
"""


def _e(v) -> str:
    return html.escape("" if v is None else str(v), quote=True)


def _hash(passphrase: str, salt: bytes) -> bytes:
    return hashlib.scrypt(passphrase.encode("utf-8"), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)


class HubWebApp:
    def __init__(self, hub: Hub, passphrase: str):
        self.hub = hub
        # Fails with WrongPassphrase/NoActiveKey before the server starts.
        self.key_id, self.private_key = hub.keys.load_private(passphrase)
        self._salt = secrets.token_bytes(16)
        self._pw_hash = _hash(passphrase, self._salt)
        self.sessions: dict[str, dict] = {}
        self.lock = threading.Lock()
        self.port = 0

    def check_passphrase(self, p: str) -> bool:
        return hmac.compare_digest(_hash(p or "", self._salt), self._pw_hash)

    def new_session(self) -> tuple[str, str]:
        sid, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
        self.sessions[sid] = {"csrf": csrf, "exp": time.time() + SESSION_TTL}
        return sid, csrf

    def session(self, sid: str | None) -> dict | None:
        s = self.sessions.get(sid or "")
        if s and s["exp"] > time.time():
            return s
        self.sessions.pop(sid or "", None)
        return None


def make_handler(app: HubWebApp):
    class Handler(BaseHTTPRequestHandler):
        server_version = "DocMapHub"
        sys_version = ""

        def log_message(self, fmt, *args):  # quiet console
            pass

        # -- plumbing ------------------------------------------------------
        def _host_ok(self) -> bool:
            host = (self.headers.get("Host") or "").lower()
            return host in {f"127.0.0.1:{app.port}", f"localhost:{app.port}"}

        def _send(self, code: int, body: bytes, ctype="text/html; charset=utf-8", extra=None):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Content-Security-Policy",
                             "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; "
                             "frame-ancestors 'none'; base-uri 'none'")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)

        def _redirect(self, to: str, extra=None):
            h = {"Location": to}
            h.update(extra or {})
            self._send(303, b"", extra=h)

        def _sid(self) -> str | None:
            c = cookies.SimpleCookie(self.headers.get("Cookie") or "")
            return c[COOKIE].value if COOKIE in c else None

        def _form(self) -> dict:
            n = int(self.headers.get("Content-Length") or 0)
            if n > 100_000:
                return {}
            data = self.rfile.read(n).decode("utf-8", "replace")
            return {k: v[0] for k, v in urllib.parse.parse_qs(data, keep_blank_values=True).items()}

        def _page(self, title: str, body: str, code=200):
            doc = (f"<!doctype html><html lang='it'><head><meta charset='utf-8'>"
                   f"<meta name='viewport' content='width=device-width,initial-scale=1'>"
                   f"<title>{_e(title)}</title><style>{CSS}</style></head><body><main>{body}</main></body></html>")
            self._send(code, doc.encode("utf-8"))

        # -- routes --------------------------------------------------------
        def do_GET(self):
            if not self._host_ok():
                return self._send(400, b"Host non consentito", "text/plain; charset=utf-8")
            url = urllib.parse.urlsplit(self.path)
            q = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}
            sess = app.session(self._sid())
            if url.path == "/login":
                return self._login_page()
            if not sess:
                return self._redirect("/login")
            if url.path == "/":
                return self._dashboard(sess, q.get("ok"), q.get("err"), q.get("new"))
            if url.path.startswith("/download/"):
                return self._download(url.path[len("/download/"):])
            self._send(404, "Pagina non trovata".encode("utf-8"), "text/plain; charset=utf-8")

        def do_POST(self):
            if not self._host_ok():
                return self._send(400, b"Host non consentito", "text/plain; charset=utf-8")
            path = urllib.parse.urlsplit(self.path).path
            f = self._form()
            if path == "/login":
                if app.check_passphrase(f.get("passphrase", "")):
                    sid, _ = app.new_session()
                    return self._redirect("/", {"Set-Cookie":
                                                f"{COOKIE}={sid}; HttpOnly; SameSite=Strict; Path=/"})
                time.sleep(1.0)
                return self._login_page("Passphrase errata.", 403)
            sess = app.session(self._sid())
            if not sess:
                return self._redirect("/login")
            if not hmac.compare_digest(f.get("csrf", ""), sess["csrf"]):
                return self._send(403, "Richiesta non valida (token).".encode("utf-8"), "text/plain; charset=utf-8")
            try:
                with app.lock:
                    return self._action(path, f)
            except (RegistryError, KeyError_, L.LicenceError, ValueError) as exc:
                return self._redirect("/?err=" + urllib.parse.quote(str(exc)))

        def _action(self, path: str, f: dict):
            reg, hub = app.hub.registry, app.hub
            if path == "/logout":
                app.sessions.pop(self._sid() or "", None)
                return self._redirect("/login", {"Set-Cookie": f"{COOKIE}=; Max-Age=0; Path=/"})
            if path == "/reseller":
                branding = {"product_name": f["product_name"].strip()} if f.get("product_name", "").strip() else None
                if branding:
                    for k in ("primary_color", "support_email", "logo_url"):
                        if f.get(k, "").strip():
                            branding[k] = f[k].strip()
                r = reg.add_reseller(f.get("name", ""), f.get("vat") or None, f.get("email") or None, branding)
                return self._redirect("/?ok=" + urllib.parse.quote(f"Rivenditore aggiunto: {r['name']}"))
            if path == "/customer":
                c = reg.add_customer(f.get("name", ""), f.get("vat") or None, f.get("email") or None,
                                     f.get("reseller") or None)
                return self._redirect("/?ok=" + urllib.parse.quote(f"Cliente aggiunto: {c['name']}"))
            if path == "/instance":
                i = reg.add_instance(f.get("customer", ""), f.get("label") or None, f.get("kind") or "onprem",
                                     f.get("instance_id") or None)
                return self._redirect("/?ok=" + urllib.parse.quote(f"Installazione registrata: {i['id']}"))
            if path == "/issue":
                kw: dict = {}
                if f.get("months"):
                    kw["months"] = int(f["months"])
                limits = {}
                for k in L.LIMIT_KEYS:
                    if f.get(k, "").strip():
                        v = int(f[k])
                        limits[k] = None if v < 0 else v
                if limits:
                    kw["limits"] = limits
                res = hub.issue_with_key(app.key_id, app.private_key, f.get("instance", ""), f.get("plan", ""), **kw)
                lid = res["licence"]["licence_id"]
                return self._redirect(f"/?new={lid}&ok=" + urllib.parse.quote("Licenza emessa."))
            if path == "/renew":
                res = hub.renew_with_key(app.key_id, app.private_key, f.get("ref", ""),
                                         months=int(f["months"]) if f.get("months") else None)
                lid = res["licence"]["licence_id"]
                return self._redirect(f"/?new={lid}&ok=" + urllib.parse.quote("Licenza rinnovata."))
            return self._send(404, b"", "text/plain")

        def _download(self, lid: str):
            try:
                rec = app.hub.registry.get_licence(urllib.parse.unquote(lid))
            except RegistryError:
                return self._send(404, "Licenza non trovata".encode("utf-8"), "text/plain; charset=utf-8")
            name = app.hub.licence_filename(rec["licence"])
            app.hub.registry.log("licence.download", "licence", rec["id"])
            self._send(200, rec["file_text"].encode("utf-8"), "application/json; charset=utf-8",
                       {"Content-Disposition": f'attachment; filename="{name}"'})

        # -- pages ---------------------------------------------------------
        def _login_page(self, err: str | None = None, code=200):
            body = ("<h1>DocMap Hub</h1>"
                    + (f"<div class='msg err'>{_e(err)}</div>" if err else "")
                    + "<section><form method='post' action='/login'>"
                      "<label for='p'>Passphrase della chiave di firma</label>"
                      "<input id='p' type='password' name='passphrase' autofocus autocomplete='current-password'>"
                      "<button>Entra</button></form></section>")
            self._page("DocMap Hub", body, code)

        def _dashboard(self, sess, ok, err, new):
            reg, hub = app.hub.registry, app.hub
            csrf = _e(sess["csrf"])
            hidden = f"<input type='hidden' name='csrf' value='{csrf}'>"
            now = datetime.now(timezone.utc)
            parts = [f"<div class='top'><h1>DocMap Hub</h1><form class='inline' method='post' action='/logout'>"
                     f"{hidden}<button class='sec'>Esci</button></form></div>",
                     f"<p style='color:var(--mut)'>Cartella dati: <code>{_e(hub.dir)}</code> · "
                     f"chiave attiva <code>{_e(app.key_id)}</code></p>"]
            if ok:
                parts.append(f"<div class='msg'>{_e(ok)}"
                             + (f" <a href='/download/{_e(new)}'>Scarica il file di licenza</a>" if new else "")
                             + "</div>")
            if err:
                parts.append(f"<div class='msg err'>Errore: {_e(err)}</div>")

            # licences
            rows = []
            for l in reg.list_licences():
                rec = reg.get_licence(l["id"])
                st = hub.status_of(rec["file_text"], now=now)
                rows.append(
                    f"<tr><td><code>{_e(l['id'][:8])}</code></td><td>{_e(l['customer_name'])}</td>"
                    f"<td>{_e(l['instance_label'])}</td><td>{_e(l['plan'])}</td><td>{_e(l['expires_at'][:10])}</td>"
                    f"<td class='{_e(st.mode)}'>{_e(MODE_IT[st.mode])}</td><td>{_e(st.days_left)}</td>"
                    f"<td><a href='/download/{_e(l['id'])}'>scarica</a></td>"
                    f"<td><form class='inline' method='post' action='/renew'>{hidden}"
                    f"<input type='hidden' name='ref' value='{_e(l['id'])}'>"
                    f"<button class='sec'>rinnova</button></form></td></tr>")
            parts.append("<section><h2>Licenze emesse</h2><table><tr><th>licenza</th><th>cliente</th>"
                         "<th>installazione</th><th>piano</th><th>scadenza</th><th>stato</th><th>giorni</th>"
                         "<th></th><th></th></tr>" + ("".join(rows) or
                                                     "<tr><td colspan='9'>Nessuna licenza</td></tr>")
                         + "</table></section>")

            insts = reg.list_instances()
            parts.append("<section><h2>Installazioni</h2><table><tr><th>id</th><th>cliente</th><th>nome</th>"
                         "<th>tipo</th><th>scadenza licenza</th></tr>" + ("".join(
                             f"<tr><td><code>{_e(i['id'])}</code></td><td>{_e(i['customer_name'])}</td>"
                             f"<td>{_e(i['label'])}</td><td>{_e(i['kind'])}</td>"
                             f"<td>{_e((i['licence_expires_at'] or 'nessuna')[:10])}</td></tr>" for i in insts)
                             or "<tr><td colspan='5'>Nessuna installazione</td></tr>") + "</table></section>")

            custs = reg.list_customers()
            parts.append("<section><h2>Clienti</h2><table><tr><th>id</th><th>nome</th><th>P.IVA</th>"
                         "<th>email</th><th>rivenditore</th></tr>" + ("".join(
                             f"<tr><td><code>{_e(c['id'])}</code></td><td>{_e(c['name'])}</td>"
                             f"<td>{_e(c['vat_id'])}</td><td>{_e(c['email'])}</td><td>{_e(c['reseller_name'])}</td></tr>"
                             for c in custs) or "<tr><td colspan='5'>Nessun cliente</td></tr>") + "</table></section>")

            ress = reg.list_resellers()
            plans = "".join(f"<option value='{_e(k)}'>{_e(k)} — {_e(v.get('label'))}</option>"
                            for k, v in hub.plans.items())
            inst_opts = "".join(f"<option value='{_e(i['id'])}'>{_e(i['customer_name'])} · {_e(i['label'])}</option>"
                                for i in insts)
            cust_opts = "".join(f"<option value='{_e(c['id'])}'>{_e(c['name'])}</option>" for c in custs)
            res_opts = "<option value=''>(nessuno: vendita diretta)</option>" + "".join(
                f"<option value='{_e(r['id'])}'>{_e(r['name'])}</option>" for r in ress)
            lim_inputs = "".join(f"<label>{_e(k)} (vuoto = dal piano, -1 = illimitato)</label>"
                                 f"<input name='{k}' type='number' min='-1'>" for k in L.LIMIT_KEYS)
            parts.append(
                "<div class='grid'>"
                f"<section><h2>Emetti licenza</h2><form method='post' action='/issue'>{hidden}"
                f"<label>Installazione</label><select name='instance' required>{inst_opts}</select>"
                f"<label>Piano</label><select name='plan'>{plans}</select>"
                "<label>Durata in mesi (vuoto = dal piano)</label><input name='months' type='number' min='1'>"
                f"{lim_inputs}<button>Emetti e firma</button></form></section>"
                f"<section><h2>Nuovo cliente</h2><form method='post' action='/customer'>{hidden}"
                "<label>Nome dello studio</label><input name='name' required>"
                "<label>Partita IVA</label><input name='vat'><label>Email</label><input name='email' type='email'>"
                f"<label>Rivenditore</label><select name='reseller'>{res_opts}</select>"
                "<button>Aggiungi cliente</button></form></section>"
                f"<section><h2>Nuova installazione</h2><form method='post' action='/instance'>{hidden}"
                f"<label>Cliente</label><select name='customer' required>{cust_opts}</select>"
                "<label>Nome (es. PC archivio)</label><input name='label'>"
                "<label>Tipo</label><select name='kind'><option>onprem</option><option>cloud</option>"
                "<option>appliance</option></select>"
                "<label>instance_id già esistente (facoltativo)</label><input name='instance_id'>"
                "<button>Registra</button></form></section>"
                f"<section><h2>Nuovo rivenditore</h2><form method='post' action='/reseller'>{hidden}"
                "<label>Nome</label><input name='name' required><label>Partita IVA</label><input name='vat'>"
                "<label>Email</label><input name='email' type='email'>"
                "<label>Nome commerciale del prodotto (marchio)</label><input name='product_name'>"
                "<label>Colore principale</label><input name='primary_color' placeholder='#0a5c8a'>"
                "<label>Email assistenza</label><input name='support_email' type='email'>"
                "<button>Aggiungi rivenditore</button></form></section></div>")
            self._page("DocMap Hub", "".join(parts))

    return Handler


def make_server(hub: Hub, passphrase: str, host: str = "127.0.0.1", port: int = 8765) -> HTTPServer:
    if host not in ("127.0.0.1", "localhost"):
        raise ValueError("La pagina dell'hub si apre solo su 127.0.0.1.")
    app = HubWebApp(hub, passphrase)
    httpd = HTTPServer(("127.0.0.1", port), make_handler(app))
    app.port = httpd.server_address[1]
    httpd.app = app  # type: ignore[attr-defined]
    hub.registry.log("web.start", details={"port": app.port})
    return httpd


def serve(hub: Hub, passphrase: str, host: str = "127.0.0.1", port: int = 8765,
          open_browser: bool = True) -> int:
    httpd = make_server(hub, passphrase, host, port)
    url = f"http://127.0.0.1:{httpd.server_address[1]}/"
    print(f"Pagina dell'hub: {url}  (solo da questo PC). Ctrl+C per chiudere.")
    if open_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nHub chiuso.")
    finally:
        httpd.server_close()
    return 0
