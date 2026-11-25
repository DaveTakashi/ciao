"""HTTP API + the browser interface of the tools (standard library only).

* Local (default): bound to 127.0.0.1, one *local key* (``chiave-locale.txt`` in the data folder) opens everything;
  the browser gets it in the address opened by ``serve`` (``…/#k=<key>``). Foreign ``Host`` headers are refused
  (DNS rebinding) and every call needs the key in a header, so another web page cannot drive the tools.
* Remote (``serve --remote``): also reachable from other PCs; *tenant tokens* (``token crea``) can only send zips,
  follow and review their own jobs and download their results: they never see the server's folders or settings.
  Put it behind HTTPS (``--cert/--key`` or a reverse proxy).
"""

from __future__ import annotations

import base64
import hmac
import json
import mimetypes
import re
import secrets
import shutil
import ssl
import tempfile
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import __version__
from . import engine as E
from . import jobs as J
from . import media as M
from . import providers as PR
from . import recipe as RC
from . import registry as R
from . import remote as RM
from . import licensing as LI
from . import settings as S
from .branding import brand_name

UI_DIR = Path(__file__).with_name("ui")
CSP = ("default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
       "connect-src 'self'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'")
JOB_RE = re.compile(r"[0-9]{8}-[0-9]{6}-[0-9a-f]{6}")
ITEM_RE = re.compile(r"[0-9a-z-]{1,80}")


class HttpError(Exception):
    def __init__(self, status: int, msg: str):
        super().__init__(msg)
        self.status = status


class App:
    def __init__(self, data_dir: Path, remote_mode: bool = False):
        from .paths import ensure
        self.dir = ensure(data_dir)
        self.remote_mode = remote_mode
        self.store = J.Store(self.dir)
        self.recipes = RC.Store(self.dir)
        kf = self.dir / "chiave-locale.txt"
        if not kf.is_file():
            kf.write_text(secrets.token_urlsafe(24), "utf-8")
        self.key = kf.read_text("utf-8").strip()
        s = self.settings()
        self.queue = J.Queue(self.store, self.settings, int(s.get("workers") or 1), remote_runner=RM.run_remote)
        self._seed_templates()

    def settings(self) -> dict:
        return S.effective(self.dir)      # the installed licence decides modes and monthly credits

    def _seed_templates(self) -> None:
        """First start: the example recipes become the user's recipes (never overwritten afterwards)."""
        marker = self.dir / "ricette" / ".modelli-copiati"
        if marker.exists():
            return
        for r in RC.templates():
            if not (self.dir / "ricette" / r["id"]).exists():
                self.recipes.save(r, author="modello")
        marker.write_text("1", "utf-8")


def make_handler(app: App, allowed_hosts: set[str]):
    class H(BaseHTTPRequestHandler):
        server_version = "Strumenti/" + __version__
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):   # quiet
            return

        # -- plumbing -------------------------------------------------------------------------------------------
        def _send(self, status: int, body: bytes, ctype: str, extra: dict | None = None):
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", CSP)
            self.send_header("X-Frame-Options", "DENY")
            for k, v in {**self._cors(), **(extra or {})}.items():
                self.send_header(k, v)
            if self.command == "POST" and not getattr(self, "_consumed", False):
                self.send_header("Connection", "close")      # unread body: never reuse this connection
                self.close_connection = True
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _json(self, data, status: int = 200):
            self._send(status, json.dumps(data, ensure_ascii=False, default=str).encode("utf-8"), "application/json; charset=utf-8")

        def _file(self, path: Path, ctype: str | None = None, download: str | None = None):
            ctype = ctype or mimetypes.guess_type(str(path))[0] or "application/octet-stream"
            size = path.stat().st_size
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(size))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cache-Control", "no-store")
            if download:
                self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{urllib.parse.quote(download)}")
            self.end_headers()
            with open(path, "rb") as f:
                shutil.copyfileobj(f, self.wfile, 1024 * 1024)

        def _raw_body(self) -> bytes:
            if getattr(self, "_consumed", False):
                return getattr(self, "_raw", b"")
            n = int(self.headers.get("Content-Length") or 0)
            if n > 20 * 1024 * 1024:
                raise HttpError(413, "richiesta troppo grande")
            self._raw = self.rfile.read(n) if n else b""
            self._consumed = True
            return self._raw

        def _body_json(self) -> dict:
            raw = self._raw_body()
            try:
                return json.loads(raw.decode("utf-8")) if raw else {}
            except (ValueError, UnicodeError):
                raise HttpError(400, "JSON non valido") from None

        def _body_to_file(self, dest: Path, max_mb: int) -> int:
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0:
                raise HttpError(411, "manca la dimensione del file")
            if n > max_mb * 1024 * 1024:
                raise HttpError(413, f"file troppo grande (massimo {max_mb} MB)")
            left = n
            self._consumed = True
            with open(dest, "wb") as f:
                while left:
                    b = self.rfile.read(min(left, 1024 * 1024))
                    if not b:
                        raise HttpError(400, "invio interrotto")
                    f.write(b)
                    left -= len(b)
            return n

        def _who(self) -> dict:
            """{"admin": bool, "tenant": str}; raises 401."""
            host = (self.headers.get("Host") or "").split(":")[0].lower()
            if allowed_hosts and host not in allowed_hosts:
                raise HttpError(403, "indirizzo non consentito")
            tok = self.headers.get("X-Key") or ""
            auth = self.headers.get("Authorization") or ""
            if auth.lower().startswith("bearer "):
                tok = auth[7:].strip()
            if tok and hmac.compare_digest(tok, app.key):
                return {"admin": True, "tenant": "local", "user": self.headers.get("X-User") or "amministratore"}
            if app.remote_mode:
                t = app.store.token_check(tok)
                if t:
                    return {"admin": False, "tenant": t["tenant"], "user": self.headers.get("X-User") or t["tenant"],
                            "plan": t.get("plan"), "credits_month": t.get("credits_month")}
            raise HttpError(401, "chiave mancante o sbagliata")

        # The main app (another page: file:// or the studio's site) may ask only two things across origins:
        # /api/ping (no key: is it running, which version) and /api/summary (with the local key: jobs to review).
        CORS_PATHS = ("/api/ping", "/api/summary")

        def _cors(self) -> dict:
            if urllib.parse.urlsplit(self.path).path not in self.CORS_PATHS:
                return {}
            return {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET",
                    "Access-Control-Allow-Headers": "X-Key", "Access-Control-Allow-Private-Network": "true",
                    "Access-Control-Max-Age": "600"}

        def do_OPTIONS(self):
            cors = self._cors()
            if not cors:
                return self._send(404, b"", "text/plain")
            self._send(204, b"", "text/plain", cors)

        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            self._route("GET")

        def do_POST(self):
            self._route("POST")

        def _route(self, method: str):
            try:
                u = urllib.parse.urlsplit(self.path)
                path, q = u.path, dict(urllib.parse.parse_qsl(u.query))
                if method == "GET" and not path.startswith("/api/"):
                    return self._static(path)
                self._consumed = method != "POST"
                if method == "POST" and path not in ("/api/sample", "/api/jobs/upload"):
                    self._raw_body()                              # always read: keep-alive needs a clean stream
                if method == "GET" and path == "/api/ping":
                    return self._ping()
                who = self._who()
                parts = [p for p in path.split("/") if p][1:]   # after "api"
                return self._api(method, parts, q, who)
            except HttpError as e:
                self._json({"error": str(e)}, e.status)
            except (RC.RecipeError, R.ParamError, J.QueueError, E.JobError, RM.RemoteError, PR.ProviderError,
                    M.MediaError, ValueError) as e:
                self._json({"error": str(e)}, 400)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def _ping(self):
            host = (self.headers.get("Host") or "").split(":")[0].lower()
            if allowed_hosts and host not in allowed_hosts:
                raise HttpError(403, "indirizzo non consentito")
            self._json({"ok": True, "app": "docmap-strumenti", "version": __version__, "remote_mode": app.remote_mode})

        def _static(self, path: str):
            host = (self.headers.get("Host") or "").split(":")[0].lower()
            if allowed_hosts and host not in allowed_hosts:
                return self._send(403, b"forbidden", "text/plain")
            name = "index.html" if path in ("/", "/index.html") else path.lstrip("/")
            if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,60}", name):
                return self._send(404, b"not found", "text/plain")
            f = UI_DIR / name
            if not f.is_file():
                return self._send(404, b"not found", "text/plain")
            body = f.read_bytes()
            if name == "index.html":
                body = body.replace(b"{{BRAND}}", brand_name().encode("utf-8")).replace(b"{{VERSION}}", __version__.encode())
            ctype = {"html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8",
                     "css": "text/css; charset=utf-8", "svg": "image/svg+xml"}.get(name.rsplit(".", 1)[-1], "application/octet-stream")
            self._send(200, body, ctype)

        # -- API ------------------------------------------------------------------------------------------------
        def _api(self, m: str, p: list, q: dict, who: dict):
            admin = who["admin"]
            s = app.settings()

            def need_admin():
                if not admin:
                    raise HttpError(403, "riservato all'amministratore di questo PC")

            if p == ["summary"]:
                need_admin()
                jobs = app.store.list(None, 50)
                todo = [j for j in jobs if j["status"] == "waiting_review"]
                short = [{k: j.get(k) for k in ("id", "name", "status", "created", "finished", "progress", "totals", "error")}
                         for j in jobs[:5]]
                return self._json({"version": __version__, "jobs": short, "running": sum(j["status"] in ("queued", "running") for j in jobs),
                                   "waiting_review": len(todo), "review_items": sum(int((j.get("totals") or {}).get("review") or 0) for j in todo),
                                   "credits_month": app.store.used("local")})
            if p == ["info"]:
                used = app.store.used(who["tenant"])
                lim = app.store.limit(who["tenant"], s)
                info = {"version": __version__, "brand": brand_name(), "remote_mode": app.remote_mode, "admin": admin,
                        "tenant": who["tenant"], "user": who["user"], "credits": {"used_month": used, "limit_month": lim,
                                                                                  "costs": app.store.costs(s)},
                        "modes": (s.get("licence") or {}).get("modes") or ["local"],
                        "licence": {k: s["_ent"].get(k) for k in ("enforced", "can_run", "message", "mode", "licence")}}
                if admin:
                    info["engines"] = {"tesseract": bool(PR.tesseract_cmd(s)), "tesseract_langs": PR.tesseract_langs(s),
                                       "pdfium": M.has_pdfium(), "ai": (s.get("ai") or {}).get("provider") or "",
                                       "ai_profiles": sorted(AR_profiles(s)), "workstations": len((s.get("workstations") or {}).get("pool") or []),
                                       "remote": bool((s.get("remote") or {}).get("url")),
                                       "endpoints": sorted((s.get("endpoints") or {}).keys())}
                return self._json(info)
            if p == ["ai"] and m == "GET":
                need_admin()
                from . import ai_registry as AR, workstations as WS
                return self._json({**AR.describe(s), "workstations": WS.status(s, refresh=q.get("refresh") == "1")})
            if p == ["ai", "test"] and m == "POST":
                need_admin()
                from . import ai_registry as AR
                prof = str(self._body_json().get("profile") or "") or None
                try:
                    r = AR.call(s, "Prova di collegamento. Rispondi con JSON {\"ok\": true, \"modello\": \"il tuo nome\"}.", None, None, prof)
                except PR.ProviderError as e:
                    return self._json({"ok": False, "error": str(e), "attempts": getattr(e, "attempts", None)})
                return self._json({"ok": True, **{k: r.get(k) for k in ("provider", "model", "profile", "ms", "usage", "attempts", "workstation")}})
            if p == ["blocks"]:
                return self._json({"blocks": R.catalog()})
            if p == ["templates"]:
                return self._json({"templates": RC.templates()})
            if p == ["validate"] and m == "POST":
                return self._json({"recipe": RC.validate(self._body_json().get("recipe"))})
            if p[:1] == ["recipes"]:
                if m == "GET" and len(p) == 1:
                    return self._json({"recipes": app.recipes.list()})
                if m == "GET" and len(p) == 2:
                    return self._json({"recipe": app.recipes.get(p[1], int(q["v"]) if q.get("v", "").isdigit() else None)})
                if m == "POST" and len(p) == 1:
                    need_admin()
                    return self._json({"recipe": app.recipes.save(self._body_json().get("recipe"), who["user"])})
                if m == "POST" and len(p) == 3 and p[2] == "archive":
                    need_admin()
                    app.recipes.archive(p[1])
                    return self._json({"ok": True})
            if p == ["sample"] and m == "POST":
                name = _b64(self.headers.get("X-Name-B64")) or "campione"
                name = re.sub(r"[^\w.\- ]", "_", Path(name).name)[:120] or "campione"
                d = app.dir / "caricati" / ("prova-" + secrets.token_hex(6))
                d.mkdir(parents=True)
                self._body_to_file(d / name, int(s.get("max_upload_mb") or 2048))
                return self._json({"sample": f"{d.name}/{name}"})
            if p == ["preview"] and m == "POST":
                need_licence(s)
                b = self._body_json()
                rec = b.get("recipe")
                if not rec and b.get("recipe_id"):
                    rec = app.recipes.get(b["recipe_id"])
                sample = self._sample_path(b, admin)
                work = app.dir / "prove" / secrets.token_hex(6)
                res = E.preview(rec, sample, s, work, b.get("upto"))
                res["work"] = work.name
                return self._json(res)
            if p == ["preview-file"]:
                work = q.get("work", "")
                if not re.fullmatch(r"[0-9a-f]{12}", work):
                    raise HttpError(400, "prova sconosciuta")
                base = (app.dir / "prove" / work).resolve()
                f = Path(q.get("path", "")).resolve()
                if not str(f).startswith(str(base)) or not f.is_file():
                    raise HttpError(404, "file non trovato")
                return self._png(f, int(q.get("page") or 1), base / "_cache")
            if p == ["fs"]:
                need_admin()
                return self._json(_browse(q.get("path", ""), s))
            if p == ["settings"]:
                need_admin()
                if m == "POST":
                    return self._json({"settings": S.public(S.save(app.dir, self._body_json().get("settings") or {}))})
                return self._json({"settings": S.public(S.load(app.dir))})
            if p == ["remote", "ping"]:
                need_admin()
                return self._json({"remote": RM.ping(s)})
            if p == ["usage"]:
                return self._json({"usage": app.store.usage(None if admin else who["tenant"])})
            if p == ["licence"]:
                need_admin()
                if m == "POST":
                    try:
                        LI.install(app.dir, S.load(app.dir), self._raw_body(), force=q.get("forza") == "1")
                    except LI.LicenceInstallError as e:
                        raise HttpError(400, str(e)) from None
                    return self._json({"licence": app.settings()["_ent"]})
                return self._json({"licence": s["_ent"]})
            if p == ["tokens"]:
                need_admin()
                if m == "POST":
                    b = self._body_json()
                    if not re.fullmatch(r"[\w.-]{2,60}", str(b.get("tenant") or "")):
                        raise HttpError(400, "nome del cliente non valido")
                    if b.get("revoke"):
                        return self._json({"revoked": app.store.token_revoke(b["tenant"])})
                    if b.get("update"):       # the hub changes the monthly credits of a customer (plan, suspension)
                        cm = b.get("credits_month")
                        n = app.store.token_update(b["tenant"], int(cm) if cm not in (None, "") else None, b.get("plan"))
                        return self._json({"updated": n})
                    cm = b.get("credits_month")
                    tok = app.store.token_create(b["tenant"], b.get("label") or "", b.get("plan") or "",
                                                 int(cm) if cm not in (None, "") else None)
                    return self._json({"token": tok})
                return self._json({"tokens": app.store.tokens()})
            if p == ["audit", "verify"]:
                need_admin()
                ok, n = app.store.audit_verify()
                return self._json({"ok": ok, "rows": n})
            if p[:1] == ["jobs"]:
                return self._jobs(m, p[1:], q, who, s)
            raise HttpError(404, "indirizzo API sconosciuto")

        def _sample_path(self, b: dict, admin: bool) -> Path:
            if b.get("sample"):
                rel = str(b["sample"])
                if not re.fullmatch(r"prova-[0-9a-f]{12}/[^/\\]{1,120}", rel):
                    raise HttpError(400, "file di prova sconosciuto")
                f = app.dir / "caricati" / rel
            elif b.get("sample_path"):
                if not admin:
                    raise HttpError(403, "i percorsi del server sono riservati")
                f = Path(b["sample_path"]).expanduser()
            else:
                raise HttpError(400, "scegli un file di prova")
            if not f.is_file():
                raise HttpError(404, "file di prova non trovato")
            return f

        def _png(self, f: Path, page: int, cache: Path):
            cache.mkdir(parents=True, exist_ok=True)
            key = re.sub(r"[^\w.-]", "_", f"{f.parent.name}_{f.name}_{page}") + ".png"
            c = cache / key
            if not c.is_file() or c.stat().st_mtime < f.stat().st_mtime:
                c.write_bytes(M.thumbnail(f, page))
            return self._file(c, "image/png")

        def _job_for(self, jid: str, who: dict) -> dict:
            if not JOB_RE.fullmatch(jid or ""):
                raise HttpError(404, "lavoro sconosciuto")
            try:
                j = app.store.get(jid)
            except J.QueueError:
                raise HttpError(404, "lavoro sconosciuto") from None
            if not who["admin"] and j["tenant"] != who["tenant"]:
                raise HttpError(404, "lavoro sconosciuto")
            return j

        def _proxy(self, j: dict, sub: str, m: str, body: bytes | None = None):
            s = app.settings()
            tok = (s.get("remote") or {}).get("token") or ""
            u = j["remote_url"]
            path = f"/api/jobs/{j['remote_job']}{sub}"
            if m == "GET" and "/image" in sub:
                r = RM._req(u, path, tok, raw=True)
                with r:
                    data = r.read()
                return self._send(200, data, r.headers.get("Content-Type") or "image/png")
            res = RM._req(u, path, tok, data=body if m == "POST" else None,
                          headers={"Content-Type": "application/json", "X-User": self.headers.get("X-User") or ""})
            return self._json(res)

        def _jobs(self, m: str, p: list, q: dict, who: dict, s: dict):
            admin = who["admin"]
            if not p:
                if m == "GET":
                    return self._json({"jobs": app.store.list(None if admin else who["tenant"])})
                if not admin:
                    raise HttpError(403, "da qui si inviano solo archivi zip (/api/jobs/upload)")
                b = self._body_json()
                rec = b.get("recipe") or app.recipes.get(str(b.get("recipe_id") or ""),
                                                         int(b["version"]) if str(b.get("version") or "").isdigit() else None)
                rec = RC.validate(rec)
                need_licence(s)
                inp = Path(str(b.get("input_dir") or "")).expanduser()
                if not inp.is_dir():
                    raise HttpError(400, "cartella di partenza non trovata")
                out = str(b.get("output_dir") or "").strip()
                if out:
                    o = Path(out).expanduser()
                    if o.resolve() == inp.resolve():
                        raise HttpError(400, "la cartella di arrivo deve essere diversa da quella di partenza")
                    o.mkdir(parents=True, exist_ok=True)
                    out = str(o)
                mode = choose_mode(b.get("run_on") or rec.get("run_on") or "local", s, inp, rec)
                job = app.store.create(rec, str(inp), out, "local", mode, str(b.get("name") or ""), who["user"],
                                       b.get("vars") or {})
                app.queue.poke()
                return self._json({"job": job})
            if p == ["upload"] and m == "POST":
                need_licence(s)
                rec = json.loads(_b64(self.headers.get("X-Recipe-B64")) or "null")
                rec = RC.validate(rec)
                name = _b64(self.headers.get("X-Job-Name")) or rec["name"]
                variables = json.loads(_b64(self.headers.get("X-Vars-B64")) or "{}")
                tmp = Path(tempfile.mkdtemp(prefix="up-", dir=app.dir / "caricati"))
                zp = tmp / "ingresso.zip"
                self._body_to_file(zp, int(s.get("max_upload_mb") or 2048))
                job = app.store.create(rec, "", "", who["tenant"], "local", name, who["user"], variables, status="uploading")
                inp = app.store.job_dir(job["id"]) / "ingresso"
                try:
                    RM.safe_extract(zp, inp, int(s.get("max_upload_mb") or 2048) * 1024 * 1024 * 4)
                finally:
                    shutil.rmtree(tmp, ignore_errors=True)
                app.store.update(job["id"], input_dir=str(inp), status="queued")
                app.queue.poke()
                return self._json({"job": app.store.get(job["id"])})
            j = self._job_for(p[0], who)
            jid = j["id"]
            rest = p[1:]
            remote = j["mode"] == "remote" and j.get("remote_job")
            if not rest and m == "GET":
                return self._json({"job": j})
            if rest == ["cancel"] and m == "POST":
                app.queue.cancel(jid)
                return self._json({"job": app.store.get(jid)})
            if rest == ["resume"] and m == "POST":
                app.queue.resume(jid)
                return self._json({"job": app.store.get(jid)})
            if rest == ["download"]:
                out = Path(j["output_dir"])
                if not out.is_dir():
                    raise HttpError(404, "niente da scaricare")
                tmp = Path(tempfile.mkdtemp(dir=app.store.job_dir(jid)))
                try:
                    zp = RM.zip_dir(out, tmp / "risultati.zip")
                    return self._file(zp, "application/zip", f"risultati-{jid}.zip")
                finally:
                    shutil.rmtree(tmp, ignore_errors=True)
            if rest == ["outputs"]:
                out = Path(j["output_dir"])
                files = [str(f.relative_to(out)).replace("\\", "/") for f in sorted(out.rglob("*")) if f.is_file()][:5000] \
                    if out.is_dir() else []
                return self._json({"output_dir": j["output_dir"] if admin else "", "files": files})
            if rest[:1] == ["items"]:
                if remote:
                    sub = "/" + "/".join(rest) + (("?" + urllib.parse.urlencode(q)) if q else "")
                    return self._proxy(j, sub, m, self._raw_body() if m == "POST" else None)
                if len(rest) == 1:
                    st, items = app.store.items(jid)
                    want = q.get("status") or ""
                    sel = [J._item_view(it) for it in items if not want or it.status == want or
                           (want == "reviewed" and it.meta.get("reviewed_by"))]
                    return self._json({"items": sel[: int(q.get("limit") or 5000)], "totals": E.count(items),
                                       "recipe": {"name": st.get("recipe", {}).get("name"), "steps": st.get("recipe", {}).get("steps")}})
                iid = rest[1]
                if not ITEM_RE.fullmatch(iid):
                    raise HttpError(404, "file sconosciuto")
                st, items = app.store.items(jid)
                it = next((x for x in items if x.id == iid), None)
                if it is None:
                    raise HttpError(404, "file sconosciuto")
                if rest[2:] == ["image"]:
                    f = it.p if it.p.is_file() else (Path(j["input_dir"]) / it.src)
                    if not f.is_file():
                        raise HttpError(404, "immagine non disponibile")
                    page = int(q.get("page") or (it.page if it.ext == "pdf" and it.page and M.page_count(f) >= it.page else 1))
                    return self._png(f, page, app.store.job_dir(jid) / "_anteprime")
                if rest[2:] == [] and m == "GET":
                    return self._json({"item": J._item_view(it)})
                if rest[2:] == [] and m == "POST":
                    b = self._body_json()
                    res = J.review_apply(app.store, jid, iid, str(b.get("action") or ""), who["user"], b.get("fields"),
                                         b.get("cls"), b.get("tags"), str(b.get("note") or ""))
                    return self._json({"item": res})
            if rest == ["audit"]:
                if remote:
                    return self._proxy(j, "/audit", "GET")
                return self._json({"audit": app.store.audit_rows(jid)})
            raise HttpError(404, "indirizzo API sconosciuto")

    return H


def AR_profiles(s: dict) -> list:
    from . import ai_registry as AR
    return list(AR.profiles(s))


def need_licence(s: dict) -> None:
    """New jobs and previews only with a licence that allows them (never blocks reviews, results or downloads)."""
    ent = s.get("_ent") or {}
    if ent.get("enforced") and not ent.get("can_run"):
        raise HttpError(403, ent.get("message") or "licenza non valida per gli Strumenti")


def choose_mode(run_on: str, s: dict, inp: Path, rec: dict) -> str:
    modes = (s.get("licence") or {}).get("modes") or ["local"]
    rm = s.get("remote") or {}
    if run_on == "remote":
        if "remote" not in modes:
            raise HttpError(403, "la licenza non comprende l'esecuzione remota")
        if not rm.get("url"):
            raise HttpError(400, "server remoto non impostato (Impostazioni › Esecuzione remota)")
        return "remote"
    if run_on == "auto" and rm.get("url") and "remote" in modes:
        if rm.get("always"):
            return "remote"
        try:
            size = sum(f.stat().st_size for f in E.list_inputs(inp, rec["input"]["patterns"], rec["input"]["recursive"]))
        except (OSError, E.JobError):
            size = 0
        if size > float(rm.get("auto_mb") or 200) * 1024 * 1024:
            return "remote"
    if "local" not in modes:
        raise HttpError(403, "la licenza permette solo l'esecuzione remota")
    return "local"


def _b64(v: str | None) -> str:
    if not v:
        return ""
    try:
        return base64.b64decode(v).decode("utf-8")
    except (ValueError, UnicodeError):
        return ""


def _browse(path: str, s: dict) -> dict:
    """Folders and files of the PC, for choosing input / output folders and a sample file."""
    import os
    import string as _s
    roots = [Path(r) for r in (s.get("roots") or [])]
    if not path:
        if roots:
            dirs = [str(r) for r in roots if r.is_dir()]
        else:
            dirs = [str(Path.home())]
            if os.name == "nt":
                dirs += [f"{d}:\\" for d in _s.ascii_uppercase if Path(f"{d}:\\").exists()]
        return {"path": "", "parent": "", "dirs": [{"name": d, "path": d} for d in dirs], "files": []}
    p = Path(path).expanduser()
    if roots and not any(str(p.resolve()).startswith(str(r.resolve())) for r in roots):
        raise HttpError(403, "cartella fuori da quelle consentite (Impostazioni)")
    if not p.is_dir():
        raise HttpError(404, "cartella non trovata")
    dirs, files = [], []
    try:
        for e in sorted(p.iterdir(), key=lambda x: E.natural_key(x.name)):
            if e.name.startswith("."):
                continue
            try:
                if e.is_dir():
                    dirs.append({"name": e.name, "path": str(e)})
                elif e.is_file() and len(files) < 500:
                    files.append({"name": e.name, "path": str(e), "kb": e.stat().st_size // 1024})
            except OSError:
                continue
    except PermissionError:
        raise HttpError(403, "cartella non leggibile") from None
    parent = str(p.parent) if p.parent != p else ""
    return {"path": str(p), "parent": parent, "dirs": dirs[:2000], "files": files}


def serve(data_dir: Path, host: str = "127.0.0.1", port: int = 8091, remote_mode: bool = False,
          cert: str | None = None, key: str | None = None, open_browser: bool = False, ready=None) -> None:
    app = App(data_dir, remote_mode)
    allowed = set() if remote_mode else {"127.0.0.1", "localhost", "[::1]", "::1"}
    httpd = ThreadingHTTPServer((host, port), make_handler(app, allowed))
    httpd.daemon_threads = True
    scheme = "http"
    if cert and key:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
        scheme = "https"
    app.queue.start()
    real_port = httpd.server_address[1]
    url = f"{scheme}://{'127.0.0.1' if host in ('0.0.0.0', '') else host}:{real_port}/#k={app.key}"
    if ready:
        ready(app, httpd, url)
    else:
        print(f"{brand_name()} · Strumenti {__version__} — {url}", flush=True)
        print("Tieni aperta questa finestra; per chiudere premi Ctrl+C.", flush=True)
    if open_browser:
        import webbrowser
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever(poll_interval=0.3)
    except KeyboardInterrupt:
        pass
    finally:
        app.queue.stop()
        httpd.server_close()
