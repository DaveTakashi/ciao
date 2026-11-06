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
import json
import re
from pathlib import Path
import hmac
import html
import random
import secrets
import sys
import socket
import threading
import time
import urllib.parse
import webbrowser
from datetime import datetime, timezone
from http import cookies
from http.server import BaseHTTPRequestHandler, HTTPServer

from . import licence as L
from . import web_ops as W
from .keys import KeyError_
from .registry import RegistryError
from .service import Hub

COOKIE = "dmhub_session"
UI_DIR = Path(__file__).with_name("ui")
FONTS_DIR = Path(__file__).resolve().parents[2] / "assets" / "fonts"   # the app's Inter font, if present
STATIC_RE = re.compile(r"[a-z0-9][a-z0-9._-]{0,80}|fonts/[a-z0-9][a-z0-9._-]{0,80}")
SPA_CSP = ("default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
           "font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
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
nav.top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 14px}
nav.top a{margin-right:10px;color:var(--acc);text-decoration:none}nav.top a.on{font-weight:700;text-decoration:underline}
pre{white-space:pre-wrap;word-break:break-all;font:13px ui-monospace,Consolas,monospace;background:var(--bg);
padding:8px;border-radius:6px;border:1px solid var(--line)}textarea{width:100%;padding:6px 8px;border:1px solid var(--line);
border-radius:6px;background:var(--bg);color:var(--fg);font:13px ui-monospace,Consolas,monospace}.mut{color:var(--mut);font-size:13px}
"""


def _e(v) -> str:
    return html.escape("" if v is None else str(v), quote=True)


def _hash(passphrase: str, salt: bytes) -> bytes:
    return hashlib.scrypt(passphrase.encode("utf-8"), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)


class HubWebApp:
    """State of the page. v0.4: it can start *locked* (no passphrase typed in the console): the
    browser login unlocks the signing key and the vault with one passphrase, and "Ricorda su questo
    PC" stores it with Windows DPAPI (``autoaccess``) so the next start opens directly."""

    def __init__(self, hub: Hub, passphrase: str | None = None):
        self.hub = hub
        self.key_id, self.private_key = None, None
        self._salt = secrets.token_bytes(16)
        self._pw_hash = None
        self.sessions: dict[str, dict] = {}
        self.lock = threading.Lock()
        self.port = 0
        self.vault_key = None
        self.jobs = W.Jobs(self)
        if passphrase is not None:
            # Fails with WrongPassphrase/NoActiveKey before the server starts.
            self.unlock(passphrase)

    @property
    def unlocked(self) -> bool:
        return self.private_key is not None

    def has_keys(self) -> bool:
        try:
            return bool(self.hub.keys.active_id)
        except Exception:
            return False

    def first_setup(self, passphrase: str) -> None:
        """Brand-new hub: create the signing key and the vault with the same passphrase, then unlock."""
        from .vault import Vault
        if self.has_keys():
            raise KeyError_("L'hub è già configurato: accedi con la tua passphrase.")
        self.hub.keys.generate(passphrase)
        v = Vault(self.hub.registry)
        if not v.initialized:
            v.init(passphrase)
        self.hub.registry.log("hub.setup", details={"via": "pagina"})
        self.unlock(passphrase)

    def unlock(self, passphrase: str, vault_passphrase: str | None = None) -> None:
        """Open the signing key (raises on a wrong passphrase) and, if it opens, the vault."""
        key_id, priv = self.hub.keys.load_private(passphrase)
        self.key_id, self.private_key = key_id, priv
        self._pw_hash = _hash(passphrase, self._salt)
        # v0.2: vault key in memory if the page passphrase (or DOCMAP_HUB_VAULT_PASSPHRASE) opens it.
        # Revealing a secret always asks the passphrase again.
        from .vault import Vault, vault_passphrase_from_env
        v = Vault(self.hub.registry)
        if v.initialized and self.vault_key is None:
            for cand in (vault_passphrase, vault_passphrase_from_env(), passphrase):
                if cand and v.check(cand):
                    self.vault_key = v.unlock(cand)
                    break

    def need_unlocked(self):
        if not self.unlocked:
            raise L.LicenceError("Hub bloccato: accedi con la passphrase.")

    def need_vault(self):
        from .vault import VaultLocked
        if self.vault_key is None:
            raise VaultLocked("Cassaforte chiusa: aprila dalla pagina Cassaforte.")
        return self.vault_key

    def make_auto_token(self) -> str:
        self._auto = (secrets.token_urlsafe(32), time.time() + 120)
        return self._auto[0]

    def use_auto_token(self, t: str) -> bool:
        tok, exp = getattr(self, "_auto", (None, 0))
        if tok and t and exp > time.time() and hmac.compare_digest(t, tok):
            self._auto = (None, 0)
            return True
        return False

    def check_passphrase(self, p: str) -> bool:
        if self._pw_hash is None:
            return False
        return hmac.compare_digest(_hash(p or "", self._salt), self._pw_hash)

    def login(self, p: str, vault_passphrase: str | None = None) -> bool:
        """Check (or, when locked, unlock with) the passphrase."""
        if self.unlocked:
            ok = self.check_passphrase(p)
            if ok and vault_passphrase and self.vault_key is None:
                self.unlock(p, vault_passphrase)
            return ok
        try:
            self.unlock(p or "", vault_passphrase)
            return True
        except (KeyError_, L.LicenceError, ValueError):
            return False

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
            extra = dict(extra or {})
            self.send_header("Content-Security-Policy", extra.pop(
                "Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; "
                                           "frame-ancestors 'none'; base-uri 'none'"))
            for k, v in extra.items():
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

        def _page(self, title: str, body: str, code=200, refresh: bool = False):
            doc = (f"<!doctype html><html lang='it'><head><meta charset='utf-8'>"
                   f"<meta name='viewport' content='width=device-width,initial-scale=1'>"
                   + ("<meta http-equiv='refresh' content='2'>" if refresh else "")
                   + f"<title>{_e(title)}</title><style>{CSS}</style></head><body><main>{body}</main></body></html>")
            self._send(code, doc.encode("utf-8"))

        def _ops_page(self, sess, path: str, title: str, render, q: dict, *extra):
            hidden = f"<input type='hidden' name='csrf' value='{_e(sess['csrf'])}'>"
            with app.lock:
                body = render(app, hidden, *extra)
            self._page(f"{title} · DocMap Hub", W.nav(path, hidden) + f"<h1>{_e(title)}</h1>"
                       + W.msgs(q.get("ok"), q.get("err")) + body)

        # -- routes --------------------------------------------------------
        def do_GET(self):
            if not self._host_ok():
                return self._send(400, b"Host non consentito", "text/plain; charset=utf-8")
            url = urllib.parse.urlsplit(self.path)
            q = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}
            sess = app.session(self._sid())
            if url.path.startswith("/ui/"):
                return self._static(url.path[len("/ui/"):])
            if url.path.startswith("/api/"):
                return self._api("GET", url.path, q, sess)
            if url.path == "/login":
                return self._spa()
            if url.path == "/auto":
                if app.use_auto_token(q.get("t", "")):
                    sid, _ = app.new_session()
                    return self._redirect("/", {"Set-Cookie": f"{COOKIE}={sid}; HttpOnly; SameSite=Strict; Path=/"})
                return self._redirect("/login")
            if not sess:
                return self._redirect("/login")
            if url.path == "/":
                return self._spa()
            if url.path == "/classico":
                return self._dashboard(sess, q.get("ok"), q.get("err"), q.get("new"))
            if url.path.startswith("/download/"):
                return self._download(url.path[len("/download/"):])
            if url.path.startswith("/scarica/"):
                return self._package(url.path[len("/scarica/"):])
            if url.path.startswith("/clienti/") and url.path.endswith("/scheda"):
                return self._scheda(url.path[len("/clienti/"):-len("/scheda")])
            pages = {"/clienti": ("Nuovo cliente", W.page_clienti), "/envs": ("Istanze & ambienti", W.page_envs), "/vault": ("Cassaforte", W.page_vault),
                     "/deploy": ("Deploy", W.page_deploy), "/ports": ("Porte", W.page_ports),
                     "/status": ("Stato", W.page_status)}
            if url.path in pages:
                return self._ops_page(sess, url.path, pages[url.path][0], pages[url.path][1], q)
            if url.path.startswith("/job/"):
                job = app.jobs.get(url.path[len("/job/"):])
                if not job:
                    return self._redirect("/status?err=" + urllib.parse.quote("Operazione non trovata (scaduta)."))
                hidden = f"<input type='hidden' name='csrf' value='{_e(sess['csrf'])}'>"
                back = {"deploy": "/deploy", "promote": "/deploy", "env": "/envs", "check": "/status", "clienti": "/clienti"}
                active = back.get(job.kind.split("-")[0], "/status")
                return self._page(job.title, W.nav(active, hidden) + W.page_job(app, hidden, job),
                                  refresh=job.status == "running")
            self._send(404, "Pagina non trovata".encode("utf-8"), "text/plain; charset=utf-8")

        def do_POST(self):
            if not self._host_ok():
                return self._send(400, b"Host non consentito", "text/plain; charset=utf-8")
            path = urllib.parse.urlsplit(self.path).path
            if path.startswith("/api/"):
                return self._api("POST", path, {}, app.session(self._sid()))
            f = self._form()
            if path == "/login":
                if app.login(f.get("passphrase", "")):
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
            back = {"env": "/envs", "customer": "/envs", "vault": "/vault", "clienti": "/clienti", "deploy": "/deploy", "promote": "/deploy",
                    "ports": "/ports", "check-all": "/status"}.get(path.strip("/").split("/")[0], "/classico")
            try:
                with app.lock:
                    r = W.action(app, path, f)
                    if r is None:
                        return self._action(path, f)
                if isinstance(r, tuple):
                    hidden = f"<input type='hidden' name='csrf' value='{_e(sess['csrf'])}'>"
                    with app.lock:
                        body = W.page_vault(app, hidden, r[2])
                    return self._page(r[1], W.nav("/vault", hidden) + f"<h1>{_e(r[1])}</h1>" + body)
                return self._redirect(r)
            except (RegistryError, KeyError_, L.LicenceError, ValueError, OSError) as exc:
                return self._redirect(back + "?err=" + urllib.parse.quote(str(exc)))

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
                return self._redirect("/classico?ok=" + urllib.parse.quote(f"Rivenditore aggiunto: {r['name']}"))
            if path == "/customer":
                c = reg.add_customer(f.get("name", ""), f.get("vat") or None, f.get("email") or None,
                                     f.get("reseller") or None)
                return self._redirect("/classico?ok=" + urllib.parse.quote(f"Cliente aggiunto: {c['name']}"))
            if path == "/instance":
                i = reg.add_instance(f.get("customer", ""), f.get("label") or None, f.get("kind") or "onprem",
                                     f.get("instance_id") or None)
                return self._redirect("/classico?ok=" + urllib.parse.quote(f"Installazione registrata: {i['id']}"))
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
                return self._redirect(f"/classico?new={lid}&ok=" + urllib.parse.quote("Licenza emessa."))
            if path == "/renew":
                res = hub.renew_with_key(app.key_id, app.private_key, f.get("ref", ""),
                                         months=int(f["months"]) if f.get("months") else None)
                lid = res["licence"]["licence_id"]
                return self._redirect(f"/classico?new={lid}&ok=" + urllib.parse.quote("Licenza rinnovata."))
            return self._send(404, b"", "text/plain")

        def _scheda(self, slug: str):
            from .onboarding import SLUG_RE
            f = app.hub.dir / "clienti" / slug / "scheda-cliente.html"
            if not SLUG_RE.fullmatch(slug) or not f.is_file():
                return self._send(404, "Scheda non trovata".encode("utf-8"), "text/plain; charset=utf-8")
            self._send(200, f.read_bytes())

        def _download(self, lid: str):
            try:
                rec = app.hub.registry.get_licence(urllib.parse.unquote(lid))
            except RegistryError:
                return self._send(404, "Licenza non trovata".encode("utf-8"), "text/plain; charset=utf-8")
            name = app.hub.licence_filename(rec["licence"])
            app.hub.registry.log("licence.download", "licence", rec["id"])
            self._send(200, rec["file_text"].encode("utf-8"), "application/json; charset=utf-8",
                       {"Content-Disposition": f'attachment; filename="{name}"'})

        def _package(self, rest: str):
            from . import packages
            kind, _, ref = rest.partition("/")
            ref = urllib.parse.unquote(ref)
            try:
                with app.lock:
                    if kind == "postazione":
                        name, data = packages.workstation_zip(app.hub, ref)
                    elif kind == "backup":
                        from . import backups as B
                        f = B.path_of(app.hub, ref)
                        name, data = f.name, f.read_bytes()
                        app.hub.registry.log("hub.backup.download", details={"file": f.name})
                    elif kind in ("sede", "web"):
                        if kind == "sede":
                            f = packages.sede_zip(app.hub, app.hub.registry.get_customer(ref)["id"])
                        else:
                            f = packages.web_zip_path(app.hub, app.hub.registry.get_environment(ref))
                        if not f or not f.is_file():
                            raise RegistryError("Pacchetto non ancora preparato.")
                        name, data = f.name, f.read_bytes()
                        app.hub.registry.log("package.download", kind, ref, {"file": f.name})
                    else:
                        raise RegistryError("Pacchetto sconosciuto.")
            except (RegistryError, OSError) as exc:
                return self._send(404, str(exc).encode("utf-8"), "text/plain; charset=utf-8")
            self._send(200, data, "application/zip", {"Content-Disposition": f'attachment; filename="{name}"'})

        # -- v0.4: the management app (single page) + JSON API --------------------------------------
        def _spa(self):
            body = (UI_DIR / "index.html").read_bytes()
            self._send(200, body, extra={"Content-Security-Policy": SPA_CSP})

        def _static(self, name: str):
            types = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
                     ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png"}
            if not STATIC_RE.fullmatch(name):
                return self._send(404, b"", "text/plain")
            f = (FONTS_DIR / name[len("fonts/"):]) if name.startswith("fonts/") else (UI_DIR / name)
            ext = f.suffix.lower()
            if ext not in types or not f.is_file():
                return self._send(404, b"", "text/plain")
            self._send(200, f.read_bytes(), types[ext], extra={"Cache-Control": "no-cache"})

        def _json(self, code: int, obj, extra=None):
            body = json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8")
            self._send(code, body, "application/json; charset=utf-8", extra=extra)

        def _api(self, method: str, path: str, q: dict, sess):
            from . import api as A
            body: dict = {}
            if method == "POST":
                ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip()
                n = int(self.headers.get("Content-Length") or 0)
                if ctype != "application/json" or n > 2_000_000:
                    return self._json(415, {"error": "Richiesta non valida."})
                try:
                    body = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
                except ValueError:
                    return self._json(400, {"error": "JSON non valido."})
                if not isinstance(body, dict):
                    return self._json(400, {"error": "JSON non valido."})
            # -- no session needed
            if path == "/api/session":
                info = A.session_info(app, bool(sess))
                if sess:
                    info["csrf"] = sess["csrf"]
                return self._json(200, info)
            if method == "POST" and path in ("/api/login", "/api/setup"):
                p = body.get("passphrase") or ""
                vp = body.get("vault_passphrase") or None
                try:
                    with app.lock:
                        if path == "/api/setup":
                            if p != (body.get("repeat") or ""):
                                return self._json(400, {"error": "Le due passphrase non coincidono."})
                            app.first_setup(p)
                            ok = True
                        else:
                            ok = app.login(p, vp)
                except (KeyError_, L.LicenceError, RegistryError, ValueError) as exc:
                    return self._json(400, {"error": str(exc)})
                if not ok:
                    time.sleep(1.0)
                    return self._json(403, {"error": "Passphrase errata."})
                sid, csrf = app.new_session()
                with app.lock:
                    app.hub.registry.log("web.login")
                    if body.get("remember"):
                        try:
                            A.remember(app, {"on": True, "passphrase": p, "vault_passphrase": vp})
                        except Exception as exc:  # login still fine
                            return self._json(200, {"ok": True, "csrf": csrf, "warning": f"Non ricordato: {exc}"},
                                              {"Set-Cookie": f"{COOKIE}={sid}; HttpOnly; SameSite=Strict; Path=/"})
                return self._json(200, {"ok": True, "csrf": csrf},
                                  {"Set-Cookie": f"{COOKIE}={sid}; HttpOnly; SameSite=Strict; Path=/"})
            if not sess:
                return self._json(401, {"error": "Sessione scaduta: accedi di nuovo."})
            if method == "POST" and not hmac.compare_digest(self.headers.get("X-CSRF") or "", sess["csrf"]):
                return self._json(403, {"error": "Richiesta non valida (token)."})
            if method == "POST" and path == "/api/logout":
                app.sessions.pop(self._sid() or "", None)
                return self._json(200, {"ok": True}, {"Set-Cookie": f"{COOKIE}=; Max-Age=0; Path=/"})
            for m, rx, fn in API_ROUTES:
                if m != method:
                    continue
                mt = rx.fullmatch(path)
                if not mt:
                    continue
                args = [urllib.parse.unquote(g) for g in mt.groups()]
                try:
                    with app.lock:
                        if method == "GET":
                            res = fn(app, *args, q) if fn.__code__.co_argcount > 1 + len(args) else fn(app, *args)
                        else:
                            res = fn(app, *args, body) if fn.__code__.co_argcount > 1 + len(args) else fn(app, *args)
                except (RegistryError, KeyError_, L.LicenceError, ValueError, OSError) as exc:
                    return self._json(400, {"error": str(exc)})
                except Exception as exc:  # never drop the connection: the app shows the message
                    app.hub.registry.log("web.error", details={"path": path, "error": repr(exc)[:300]})
                    return self._json(500, {"error": f"Errore interno ({type(exc).__name__}): segnalalo con il registro."})
                return self._json(200, res)
            return self._json(404, {"error": "Operazione sconosciuta."})

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
            parts = [W.nav("/", hidden), "<h1>Licenze</h1>",
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


def _api_routes():
    from . import api as A
    r = re.compile
    return [
        ("POST", r(r"/api/drafts/blank"), A.draft_blank),   # v0.9, before /api/drafts/<id>
        ("GET", r(r"/api/overview"), A.overview),
        ("GET", r(r"/api/customers"), A.customers),
        ("GET", r(r"/api/customers/([\w-]+)"), A.customer_detail),
        ("GET", r(r"/api/instances"), A.instances),
        ("GET", r(r"/api/licences"), A.licences),
        ("GET", r(r"/api/licences/([\w-]+)"), A.licence_detail),
        ("GET", r(r"/api/deploys"), A.deploys),
        ("GET", r(r"/api/events"), A.events),
        ("GET", r(r"/api/search"), lambda app, q: A.search(app, q.get("q", ""))),
        ("GET", r(r"/api/jobs/([\w-]+)"), A.job_view),
        ("POST", r(r"/api/customers"), A.create_customer),
        ("POST", r(r"/api/customers/([\w-]+)"), A.update_customer),
        ("POST", r(r"/api/projects"), A.create_project),
        ("POST", r(r"/api/projects/([\w-]+)"), A.update_project),
        ("POST", r(r"/api/instances"), A.add_instance),
        ("POST", r(r"/api/instances/([\w-]+)/rename"), A.rename_instance),
        ("POST", r(r"/api/workstations"), A.add_workstation),
        ("POST", r(r"/api/workstations/([\w-]+)"), A.update_workstation),
        ("POST", r(r"/api/licences"), A.issue_licence),
        ("POST", r(r"/api/licences/([\w-]+)/renew"), A.renew_licence),
        ("POST", r(r"/api/remember"), A.remember),
        ("POST", r(r"/api/check-all"), lambda app, body: A.check_all_job(app)),
        # v0.5
        ("GET", r(r"/api/pipeline/prompt"), A.pipeline_prompt),
        ("GET", r(r"/api/drafts"), A.drafts),
        ("GET", r(r"/api/drafts/([\w-]+)"), A.draft_get),
        ("POST", r(r"/api/drafts"), A.draft_create),
        ("POST", r(r"/api/drafts/([\w-]+)"), A.draft_update),
        ("POST", r(r"/api/drafts/([\w-]+)/delete"), A.draft_delete),
        ("POST", r(r"/api/drafts/([\w-]+)/confirm"), A.draft_confirm),
        ("POST", r(r"/api/envs/([\w-]+)/package"), A.build_web_job),
        # v0.6
        ("POST", r(r"/api/envs/([\w-]+)/deploy-plan"), A.deploy_plan),
        ("POST", r(r"/api/instances/([\w-]+)/promote-plan"), A.promote_plan),
        ("POST", r(r"/api/jobs/([\w-]+)/confirm"), A.job_confirm),
        ("GET", r(r"/api/envs/([\w-]+)/secrets"), A.env_secrets),
        ("POST", r(r"/api/envs/([\w-]+)/secrets"), A.secret_set),
        ("POST", r(r"/api/envs/([\w-]+)/secrets/reveal"), A.secret_reveal),
        ("POST", r(r"/api/envs/([\w-]+)/secrets/delete"), A.secret_delete),
        ("POST", r(r"/api/vault/unlock"), A.vault_unlock),
        ("POST", r(r"/api/vault/lock"), A.vault_lock),
        ("POST", r(r"/api/envs"), A.env_add),
        ("POST", r(r"/api/envs/local"), A.env_create_local),
        ("POST", r(r"/api/envs/([\w-]+)/start"), A.env_start),
        ("POST", r(r"/api/envs/([\w-]+)/stop"), A.env_stop),
        ("POST", r(r"/api/envs/([\w-]+)"), A.env_update),
        ("GET", r(r"/api/backups"), A.backups_view),
        ("POST", r(r"/api/backups"), A.backups_config),
        ("POST", r(r"/api/backups/now"), A.backup_now),
        # v0.7
        ("POST", r(r"/api/instances/([\w-]+)/licence/(suspend|revoke|reactivate|modify|renew-short)"), A.licence_action),
        ("POST", r(r"/api/instances/([\w-]+)/licence/autorenew"), A.licence_autorenew),
        ("GET", r(r"/api/licence-channel"), A.licence_channel),
        ("POST", r(r"/api/licence-channel"), A.licence_channel_set),
        ("POST", r(r"/api/licence-channel/publish"), A.licence_channel_publish),
        ("POST", r(r"/api/export"), A.hub_export),
        # v0.9
        ("POST", r(r"/api/envs/([\w-]+)/setup"), A.env_setup),
        ("POST", r(r"/api/instances/([\w-]+)/licence/push"), A.licence_push),
        ("GET", r(r"/api/updates"), A.updates),
        ("POST", r(r"/api/updates/run"), A.updates_run),
    ]


API_ROUTES = _api_routes()


# The hub page port: unusual on purpose (nothing common lives there); if busy, the next one, then a random one
# in 47000-48999. The chosen port is remembered (setting "web.port") and tried first next time.
WEB_DEFAULT_PORT = 47823
WEB_SETTING = "web.port"
WEB_RANDOM_RANGE = (47000, 48999)


class _HubHTTPServer(HTTPServer):
    # Windows: SO_REUSEADDR would let us bind over another program's port: never.
    allow_reuse_address = not sys.platform.startswith("win")

    def server_bind(self):
        if sys.platform.startswith("win") and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def web_port_candidates(hub: Hub, port: int | None) -> list[int]:
    from .ports import NEVER
    try:
        remembered = int(hub.registry.get_setting(WEB_SETTING) or 0)
    except ValueError:
        remembered = 0
    first = port or remembered or WEB_DEFAULT_PORT
    seq = [first] + [first + i for i in range(1, 31)]
    if remembered and remembered != first:
        seq.insert(1, remembered)
    if WEB_DEFAULT_PORT not in seq:
        seq.append(WEB_DEFAULT_PORT)
    rnd = random.Random()
    seq += [rnd.randint(*WEB_RANDOM_RANGE) for _ in range(40)]
    out, seen = [], set()
    for p in seq:
        if 1024 <= p <= 65535 and p not in NEVER and p not in seen:
            seen.add(p)
            out.append(p)
    return out


def make_server(hub: Hub, passphrase: str | None, host: str = "127.0.0.1", port: int | None = None) -> HTTPServer:
    if host not in ("127.0.0.1", "localhost"):
        raise ValueError("La pagina dell'hub si apre solo su 127.0.0.1.")
    app = HubWebApp(hub, passphrase)
    if port == 0:  # tests: any free port chosen by the system
        httpd = _HubHTTPServer(("127.0.0.1", 0), make_handler(app))
    else:
        from .ports import is_free
        httpd, tried = None, []
        for cand in web_port_candidates(hub, port):
            if not is_free(cand):
                tried.append(cand)
                continue
            try:
                httpd = _HubHTTPServer(("127.0.0.1", cand), make_handler(app))
                break
            except OSError:
                tried.append(cand)
        if httpd is None:
            raise OSError(f"Nessuna porta libera per la pagina dell'hub (provate {len(tried)}).")
        app.busy_ports = tried
        chosen = httpd.server_address[1]
        if hub.registry.get_setting(WEB_SETTING) != str(chosen):
            hub.registry.set_setting(WEB_SETTING, str(chosen), log=False)
    app.port = httpd.server_address[1]
    httpd.app = app  # type: ignore[attr-defined]
    hub.registry.log("web.start", details={"port": app.port})
    return httpd


def serve(hub: Hub, passphrase: str | None, host: str = "127.0.0.1", port: int | None = None,
          open_browser: bool = True, auto_login: bool = False) -> int:
    httpd = make_server(hub, passphrase, host, port)
    url = f"http://127.0.0.1:{httpd.server_address[1]}/"
    if auto_login and httpd.app.unlocked:  # type: ignore[attr-defined]
        # accesso automatico: one-time link that opens the page already signed in (valid 2 minutes, once)
        url += "auto?t=" + httpd.app.make_auto_token()  # type: ignore[attr-defined]
    busy = getattr(httpd.app, "busy_ports", [])  # type: ignore[attr-defined]
    if busy:
        print(f"Porte occupate da altri programmi: {', '.join(map(str, busy[:10]))}"
              f"{' …' if len(busy) > 10 else ''} → uso la {httpd.server_address[1]} (la ricordo per la prossima volta).")
    print(f"Pagina dell'hub: {url}  (solo da questo PC). Ctrl+C per chiudere.")
    marker = hub.dir / "pagina-hub.txt"
    try:
        marker.write_text(f"http://127.0.0.1:{httpd.server_address[1]}/\n", "utf-8")
    except OSError:
        pass
    from .backups import Scheduler
    sch = Scheduler(hub.dir, httpd.app.lock)  # type: ignore[attr-defined]
    httpd.app.backup_scheduler = sch  # type: ignore[attr-defined]
    sch.start()
    from .licensing import Scheduler as LicenceScheduler
    lsch = LicenceScheduler(httpd.app)  # type: ignore[arg-type]
    httpd.app.licence_scheduler = lsch  # type: ignore[attr-defined]
    lsch.start()
    if open_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nHub chiuso.")
    finally:
        httpd.server_close()
        try:
            marker.unlink()
        except OSError:
            pass
    return 0
