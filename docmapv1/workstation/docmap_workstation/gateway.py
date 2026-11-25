"""The gateway server (stdlib ``ThreadingHTTPServer``). Configuration: ``workstation.json`` (see the example file)."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import API_VERSION, __version__

DEFAULTS = {
    "name": "",                 # shown to the clients (empty = host name)
    "role": "",                 # free label for twin machines: "primaria", "gemella"… (only shown in /dm/v1/health)
    "host": "127.0.0.1",        # 0.0.0.0 only behind a VPN / firewall (README › Sicurezza)
    "port": 8095,
    "tokens": [],               # [{"name": "hub", "sha256": "<hex>", "project": "", "models": []}]: only hashes;
                                # project = label in the log (one gateway serves many projects), models = allowed names (empty = all)
    "allow_ips": [],            # empty = any address that reaches the port; else exact IPs or prefixes ("10.8.0.")
    "max_body_mb": 40,
    "max_waiting": 16,          # requests waiting for a free slot of one backend before answering 429
    "log_file": "",             # JSON Lines access log (no content, only who/what/how long); empty = no log
    "slot_groups": {},          # {"gpu0": 1}: backends on the same GPU share these slots (e.g. Ollama + llama.cpp on one card)
    "backends": [],             # [{"name", "url", "models": {"public": "backend id"}, "max_parallel", "slot_group", "api_key", "timeout", "defaults"}]
}
READ_OCR_PROMPT = ("Trascrivi fedelmente tutto il testo leggibile di questa immagine (stampato, dattiloscritto o a mano), "
                   "riga per riga, senza riassumere né correggere. Rispondi con JSON {\"text\": \"…\", \"confidence\": 0..1}.")
THINK_RE = re.compile(r"<(think|thinking|reasoning)>[\s\S]*?</\1>", re.I)


def hash_token(tok: str) -> str:
    return hashlib.sha256(tok.encode("utf-8")).hexdigest()


def new_token() -> str:
    return "dmws_" + secrets.token_urlsafe(32)


def load_config(path: Path | None) -> dict:
    cfg = json.loads(json.dumps(DEFAULTS))
    if path and Path(path).is_file():
        cfg.update(json.loads(Path(path).read_text("utf-8")))
    if os.environ.get("DMWS_TOKEN"):   # handy for a container: one token from the environment
        cfg["tokens"] = list(cfg["tokens"]) + [{"name": "env", "sha256": hash_token(os.environ["DMWS_TOKEN"])}]
    cfg["name"] = cfg.get("name") or socket.gethostname()
    return cfg


class Backend:
    """One local model server, with its own slots (``max_parallel``) and waiting room."""

    def __init__(self, b: dict):
        self.name = str(b.get("name") or "backend")
        self.url = str(b.get("url") or "").rstrip("/")
        self.models = {str(k): str(v) for k, v in (b.get("models") or {}).items()}
        self.max_parallel = max(1, int(b.get("max_parallel") or 1))
        self.api_key = str(b.get("api_key") or "")
        self.timeout = float(b.get("timeout") or 300)
        self.defaults = b.get("defaults") if isinstance(b.get("defaults"), dict) else {}
        self.group = str(b.get("slot_group") or "")
        self.sem = threading.BoundedSemaphore(self.max_parallel)
        self.lock = threading.Lock()
        self.running = 0
        self.waiting = 0
        self.done = 0
        self.errors = 0

    def chat(self, req: dict) -> tuple[int, dict]:
        if self.url.startswith("mock:"):
            return 200, mock_answer(req, self.url)
        body = json.dumps(req, ensure_ascii=False).encode("utf-8")
        h = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.api_key:
            h["Authorization"] = "Bearer " + self.api_key
        try:
            with urllib.request.urlopen(urllib.request.Request(self.url + "/chat/completions", data=body, headers=h,
                                                               method="POST"), timeout=self.timeout) as r:
                status, raw = r.status, r.read()
        except urllib.error.HTTPError as e:
            status, raw = e.code, e.read()
        except (TimeoutError, socket.timeout):
            return 504, {"error": {"message": f"backend {self.name}: tempo scaduto", "type": "timeout"}}
        except (urllib.error.URLError, OSError) as e:
            return 502, {"error": {"message": f"backend {self.name} non raggiungibile ({getattr(e, 'reason', e)})", "type": "backend_down"}}
        try:
            j = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeError):
            return 502, {"error": {"message": f"backend {self.name}: risposta non JSON", "type": "backend_error"}}
        return status, j if isinstance(j, dict) else {"error": {"message": "risposta non valida"}}


def mock_answer(req: dict, url: str) -> dict:
    """``mock:`` backend for tests and dry runs: answers a JSON object (``mock:slow`` waits 0.3 s, ``mock:think`` adds
    a reasoning block in the text like a local reasoning model without a parser)."""
    if "slow" in url:
        time.sleep(0.3)
    txt = json.dumps({"text": "TESTO DI PROVA", "confidence": 0.8, "ok": True}, ensure_ascii=False)
    if "think" in url:
        txt = "<think>ragionamento…</think>" + txt
    return {"id": "mock", "object": "chat.completion", "model": req.get("model"), "created": int(time.time()),
            "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": txt,
                                                                          "reasoning_content": "ragionamento di prova"}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}}


_GPU_CACHE: dict = {"at": 0.0, "v": []}


def gpus() -> list[dict]:
    """NVIDIA GPUs via ``nvidia-smi`` (cached 10 s); empty list when there is none."""
    if time.monotonic() - _GPU_CACHE["at"] < 10:
        return _GPU_CACHE["v"]
    out: list = []
    exe = shutil.which("nvidia-smi")
    if exe:
        try:
            r = subprocess.run([exe, "--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu",
                                "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=5)
            for line in r.stdout.strip().splitlines():
                c = [x.strip() for x in line.split(",")]
                if len(c) >= 5:
                    out.append({"name": c[0], "mem_used_mb": _int(c[1]), "mem_total_mb": _int(c[2]),
                                "util": _int(c[3]), "temp_c": _int(c[4])})
        except (OSError, subprocess.SubprocessError):
            pass
    _GPU_CACHE.update(at=time.monotonic(), v=out)
    return out


def _int(x):
    try:
        return int(float(x))
    except ValueError:
        return None


class Gateway:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.backends = [Backend(b) for b in cfg.get("backends") or [] if isinstance(b, dict) and b.get("url")]
        self.tokens = [t for t in cfg.get("tokens") or [] if isinstance(t, dict) and t.get("sha256")]
        self.hashes = [(str(t.get("name") or "?"), str(t["sha256"]).lower()) for t in self.tokens]
        groups = cfg.get("slot_groups") or {}
        self.groups = {str(k): threading.BoundedSemaphore(max(1, int(v or 1))) for k, v in groups.items()}
        for b in self.backends:   # a backend naming an undeclared group gets a group of 1 (one GPU, one job)
            if b.group and b.group not in self.groups:
                self.groups[b.group] = threading.BoundedSemaphore(1)
        self.log_lock = threading.Lock()
        self.started = time.time()

    def who(self, header: str) -> dict | None:
        """The token entry ({name, project, models}) of a Bearer header, or None."""
        m = re.match(r"(?i)Bearer\s+(\S+)", header or "")
        if not m:
            return None
        h = hash_token(m.group(1))
        for t in self.tokens:
            if hmac.compare_digest(h, str(t["sha256"]).lower()):
                return {"name": str(t.get("name") or "?"), "project": str(t.get("project") or ""),
                        "models": [str(x) for x in t.get("models") or []]}
        return None

    def allowed(self, who: dict | None, model: str) -> bool:
        return not who or not who.get("models") or model in who["models"]

    def ip_ok(self, ip: str) -> bool:
        allow = self.cfg.get("allow_ips") or []
        return not allow or any(ip == a or (a.endswith((".", ":")) and ip.startswith(a)) for a in allow)

    def route(self, model: str) -> tuple[Backend, str] | None:
        for b in self.backends:
            if model in b.models:
                return b, b.models[model]
        for b in self.backends:   # the backend's own id is accepted too
            if model in b.models.values():
                return b, model
        return None

    def models(self) -> list[str]:
        return [m for b in self.backends for m in b.models]

    def queue(self) -> dict:
        return {"running": sum(b.running for b in self.backends), "waiting": sum(b.waiting for b in self.backends),
                "max_parallel": sum(b.max_parallel for b in self.backends), "max_waiting": int(self.cfg.get("max_waiting") or 16)}

    def health(self) -> dict:
        return {"ok": bool(self.backends), "api": API_VERSION, "version": __version__, "name": self.cfg["name"],
                "role": self.cfg.get("role") or "",
                "uptime_s": int(time.time() - self.started), "models": self.models(), "queue": self.queue(), "gpus": gpus(),
                "backends": [{"name": b.name, "models": list(b.models), "running": b.running, "waiting": b.waiting,
                              "max_parallel": b.max_parallel, "done": b.done, "errors": b.errors} for b in self.backends]}

    def chat(self, req: dict, who: dict | None = None) -> tuple[int, dict, dict]:
        """Routes one chat request: returns (status, answer, extra headers)."""
        model = str(req.get("model") or "")
        if not model and len(self.models()) == 1:
            model = self.models()[0]
        if not self.allowed(who, model):
            return 403, {"error": {"message": f"questo gettone non può usare il modello «{model}»", "type": "forbidden_model"}}, {}
        r = self.route(model)
        if not r:
            return 404, {"error": {"message": f"modello «{model}» non pubblicato su questa workstation", "type": "unknown_model",
                                   "models": self.models()}}, {}
        b, real = r
        with b.lock:
            if b.waiting >= int(self.cfg.get("max_waiting") or 16):
                return 429, {"error": {"message": "workstation occupata, riprova", "type": "busy"}}, {"Retry-After": "5"}
            b.waiting += 1
        got = b.sem.acquire(timeout=b.timeout)
        with b.lock:
            b.waiting -= 1
            if got:
                b.running += 1
        if not got:
            return 429, {"error": {"message": "workstation occupata (attesa troppo lunga)", "type": "busy"}}, {"Retry-After": "10"}
        gsem = self.groups.get(b.group) if b.group else None
        if gsem is not None and not gsem.acquire(timeout=b.timeout):
            with b.lock:
                b.running -= 1
            b.sem.release()
            return 429, {"error": {"message": "GPU occupata da un altro modello, riprova", "type": "busy"}}, {"Retry-After": "10"}
        try:
            body = {**b.defaults, **req, "model": real, "stream": False}
            status, j = b.chat(body)
        finally:
            if gsem is not None:
                gsem.release()
            with b.lock:
                b.running -= 1
                b.done += 1
            b.sem.release()
        if not 200 <= status < 300:
            b.errors += 1
        elif isinstance(j, dict):
            j["model"] = model   # the clients only see the published name
        return status, j, {"X-DM-Workstation": self.cfg["name"], "X-DM-Backend": b.name}

    def read(self, b: dict, who: dict | None = None) -> tuple[int, dict]:
        """``/dm/v1/read``: {task: ocr|json, model?, prompt?, image: {mime, data}, schema?, max_tokens?}."""
        task = b.get("task") or "ocr"
        if task not in ("ocr", "json"):
            return 400, {"error": {"message": "task: ocr | json"}}
        img = b.get("image") if isinstance(b.get("image"), dict) else None
        prompt = str(b.get("prompt") or (READ_OCR_PROMPT if task == "ocr" else ""))
        if not prompt:
            return 400, {"error": {"message": "prompt mancante"}}
        if isinstance(b.get("schema"), dict):
            prompt += "\nRispondi SOLO con un oggetto JSON con queste chiavi: " + ", ".join((b["schema"].get("properties") or {})) + "."
        content: list = [{"type": "text", "text": prompt}]
        if img and img.get("data"):
            content.append({"type": "image_url", "image_url": {"url": f"data:{img.get('mime') or 'image/jpeg'};base64,{img['data']}"}})
        req = {"model": str(b.get("model") or ""), "messages": [{"role": "user", "content": content}],
               "response_format": {"type": "json_object"}, "max_tokens": int(b.get("max_tokens") or 4000)}
        t0 = time.monotonic()
        status, j, _ = self.chat(req, who)
        if not 200 <= status < 300:
            return status, j
        msg = ((j.get("choices") or [{}])[0] or {}).get("message") or {}
        txt = THINK_RE.sub("", str(msg.get("content") or ""))
        if "</think>" in txt:
            txt = txt.rsplit("</think>", 1)[1]
        res = parse_json(txt.strip())
        out = {"model": j.get("model"), "ms": int((time.monotonic() - t0) * 1000), "usage": j.get("usage") or {}}
        if task == "ocr":
            out.update(text=str((res or {}).get("text") or (txt.strip() if res is None else "")),
                       confidence=(res or {}).get("confidence"))
        else:
            if res is None:
                return 502, {"error": {"message": "risposta del modello non leggibile come JSON"}}
            out["result"] = res
        return 200, out

    def log(self, row: dict) -> None:
        f = self.cfg.get("log_file")
        if not f:
            return
        with self.log_lock, open(f, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def parse_json(s: str):
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", s, re.I)
    if m:
        s = m.group(1).strip()
    for cand in (s, s[s.find("{"): s.rfind("}") + 1] if "{" in s else ""):
        try:
            v = json.loads(cand)
            if isinstance(v, dict):
                return v
        except ValueError:
            pass
    return None


def make_handler(gw: Gateway):
    class H(BaseHTTPRequestHandler):
        server_version = "docmap-workstation/" + __version__

        def log_message(self, fmt, *args):
            pass

        def _send(self, status: int, data: dict, extra: dict | None = None):
            raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(raw)

        def _guard(self) -> dict | None:
            if not gw.ip_ok(self.client_address[0]):
                self._send(403, {"error": {"message": "indirizzo non autorizzato", "type": "forbidden"}})
                return None
            who = gw.who(self.headers.get("Authorization", ""))
            if who is None:
                self._send(401, {"error": {"message": "gettone mancante o sbagliato", "type": "unauthorized"}},
                           {"WWW-Authenticate": "Bearer"})
            return who

        def _body(self) -> dict | None:
            n = int(self.headers.get("Content-Length") or 0)
            if n > int(gw.cfg.get("max_body_mb") or 40) * 1024 * 1024:
                self._send(413, {"error": {"message": "richiesta troppo grande", "type": "too_large"}})
                return None
            try:
                b = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
            except (ValueError, UnicodeError):
                b = None
            if not isinstance(b, dict):
                self._send(400, {"error": {"message": "JSON non valido", "type": "invalid"}})
                return None
            return b

        def do_GET(self):
            p = self.path.split("?")[0]
            if p == "/dm/v1/ping":
                return self._send(200, {"ok": True, "api": API_VERSION})
            who = self._guard()
            if who is None:
                return
            if p == "/dm/v1/health":
                h = gw.health()
                h["models"] = [m for m in h["models"] if gw.allowed(who, m)]   # each project sees only its models
                return self._send(200, h)
            if p == "/v1/models":
                return self._send(200, {"object": "list", "data": [{"id": m, "object": "model", "owned_by": gw.cfg["name"]}
                                                                   for m in gw.models() if gw.allowed(who, m)]})
            self._send(404, {"error": {"message": "percorso sconosciuto"}})

        def do_POST(self):
            p = self.path.split("?")[0]
            who = self._guard()
            if who is None:
                return
            b = self._body()
            if b is None:
                return
            t0 = time.monotonic()
            if p == "/v1/chat/completions":
                if b.get("stream"):
                    return self._send(400, {"error": {"message": "stream non supportato dal gateway (usa stream=false)"}})
                status, j, extra = gw.chat(b, who)
            elif p == "/dm/v1/read":
                status, j = gw.read(b, who)
                extra = {"X-DM-Workstation": gw.cfg["name"]}
            else:
                return self._send(404, {"error": {"message": "percorso sconosciuto"}})
            self._send(status, j, extra)
            gw.log({"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "who": who["name"], "project": who["project"],
                    "project_hdr": (self.headers.get("X-DM-Project") or "")[:60], "ip": self.client_address[0], "path": p,
                    "model": b.get("model"), "status": status, "ms": int((time.monotonic() - t0) * 1000),
                    "in": int(self.headers.get("Content-Length") or 0)})

    return H


def serve(cfg: dict, ready=None) -> None:
    gw = Gateway(cfg)
    httpd = ThreadingHTTPServer((cfg["host"], int(cfg["port"])), make_handler(gw))
    httpd.daemon_threads = True
    if ready:
        ready(gw, httpd)
    else:
        print(f"Gateway workstation {__version__} «{cfg['name']}» su http://{cfg['host']}:{httpd.server_address[1]} · "
              f"modelli: {', '.join(gw.models()) or 'nessuno (configura backends)'}", flush=True)
        if not gw.hashes:
            print("ATTENZIONE: nessun gettone configurato, ogni richiesta sarà rifiutata (comando: token-nuovo)", flush=True)
    try:
        httpd.serve_forever(poll_interval=0.3)
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
