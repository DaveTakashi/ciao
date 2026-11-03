"""Local runner: start / stop / status of a ``local-python`` environment.

An environment lives in ``<hub dir>/envs/<instance id>/<env name>/``::

    config.json     created by ``python -m docmap_server setup`` (its own aes_key and tokens)
    data/           docmap.sqlite of this environment
    app/            web app built with tools/build_deploy.py (optional, served with --root)
    server.pid      {"pid", "port", "started_at", "cmd"} while running
    server.log      output of the server
    sync/           profiles of clone-data (no tokens inside: they travel in environment variables)

Where is server-python?  In order: setting ``server_python_dir``
(``settings set server_python_dir C:\\...``), environment variable
``DOCMAP_SERVER_PYTHON``, then the repository layout
``<docmapv1>/server-python`` next to ``hub/``.

Which Python runs it?  Setting ``server_python_exe``, variable
``DOCMAP_SERVER_PYTHON_EXE``, then ``server-python\\.venv\\Scripts\\python.exe``
(created by server-python's own ``run_windows.bat``), then the hub's Python.
That interpreter needs ``fastapi``, ``uvicorn`` and ``cryptography``.
"""

from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .licence import format_time
from .ports import PortManager
from .registry import Registry, RegistryError

HUB_PKG = Path(__file__).resolve().parent
DOCMAPV1 = HUB_PKG.parent.parent            # docmapv1/
ENV_SERVER_DIR = "DOCMAP_SERVER_PYTHON"
ENV_SERVER_EXE = "DOCMAP_SERVER_PYTHON_EXE"
API_PATHS = ("/api", "/server-php/api.php")
IS_WIN = sys.platform.startswith("win")


class RunnerError(RegistryError):
    pass


def _now() -> str:
    return format_time(datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# locating server-python and the tools
# ---------------------------------------------------------------------------

def server_python_dir(reg: Registry | None = None) -> Path:
    cands = []
    if reg is not None and reg.get_setting("server_python_dir"):
        cands.append(Path(reg.get_setting("server_python_dir")))
    if os.environ.get(ENV_SERVER_DIR):
        cands.append(Path(os.environ[ENV_SERVER_DIR]))
    cands.append(DOCMAPV1 / "server-python")
    for c in cands:
        if (c / "docmap_server" / "__main__.py").is_file():
            return c.resolve()
    raise RunnerError("Cartella server-python non trovata. Indicala con: "
                      "settings set server_python_dir C:\\percorso\\docmapv1\\server-python")


def server_python_exe(reg: Registry | None = None, server_dir: Path | None = None) -> str:
    if reg is not None and reg.get_setting("server_python_exe"):
        return reg.get_setting("server_python_exe")
    if os.environ.get(ENV_SERVER_EXE):
        return os.environ[ENV_SERVER_EXE]
    if server_dir is not None:
        for c in (server_dir / ".venv" / "Scripts" / "python.exe", server_dir / ".venv" / "bin" / "python"):
            if c.is_file():
                return str(c)
    return sys.executable


def build_deploy_script(reg: Registry | None = None) -> Path:
    cands = []
    if reg is not None and reg.get_setting("docmap_dir"):
        cands.append(Path(reg.get_setting("docmap_dir")) / "tools" / "build_deploy.py")
    cands.append(DOCMAPV1 / "tools" / "build_deploy.py")
    for c in cands:
        if c.is_file():
            return c.resolve()
    raise RunnerError("tools/build_deploy.py non trovato. Indica la cartella docmapv1 con: "
                      "settings set docmap_dir C:\\percorso\\docmapv1")


def check_server_python(reg: Registry | None = None) -> dict:
    """Is the server runnable? (folder found, interpreter has fastapi/uvicorn/cryptography)."""
    d = server_python_dir(reg)
    exe = server_python_exe(reg, d)
    r = subprocess.run([exe, "-c", "import fastapi, uvicorn, cryptography; print('ok')"], cwd=str(d),
                       capture_output=True, text=True, timeout=60)
    ok = r.returncode == 0 and "ok" in r.stdout
    return {"server_python_dir": str(d), "python": exe, "ok": ok,
            "error": None if ok else (r.stderr.strip().splitlines() or ["?"])[-1]}


def app_version_of(api_php: Path) -> str | None:
    try:
        m = re.search(r"DM_APP_VERSION\s*=\s*'([^']+)'", api_php.read_text("utf-8", "replace"))
    except OSError:
        return None
    return m.group(1) if m else None


def run_build_deploy(target: Path, *, base_path: str = "/", slug: str = "studio", domain: str = "http://127.0.0.1",
                     studio_name: str = "", reg: Registry | None = None, timeout: int = 300) -> dict:
    script = build_deploy_script(reg)
    cmd = [sys.executable, str(script), str(target), "--base-path", base_path or "/", "--slug", slug or "studio",
           "--domain", domain or "http://127.0.0.1"]
    if studio_name:
        cmd += ["--studio-name", studio_name]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RunnerError("Costruzione del deploy non riuscita: " + (r.stderr or r.stdout).strip()[-500:])
    return {"target": target, "version": app_version_of(target / "server-php" / "api.php"),
            "output": r.stdout.strip()}


# ---------------------------------------------------------------------------
# health
# ---------------------------------------------------------------------------

def ping(api_url: str, timeout: float = 3.0, basic_auth: tuple[str, str] | None = None,
         cafile: str | None = None) -> dict:
    """GET <api_url>?r=ping → {"ok", "app_version", "status", "error", "ms"}. Never raises."""
    import base64
    import ssl
    url = api_url + ("&" if "?" in api_url else "?") + "r=ping"
    req = urllib.request.Request(url, headers={"User-Agent": "docmap-hub/0.2", "Accept": "application/json"})
    if basic_auth:
        tok = base64.b64encode(f"{basic_auth[0]}:{basic_auth[1]}".encode()).decode()
        req.add_header("Authorization", "Basic " + tok)
    ctx = ssl.create_default_context(cafile=cafile) if url.startswith("https:") else None
    t0 = time.monotonic()
    out = {"ok": False, "app_version": None, "status": None, "error": None, "ms": None}
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            body = resp.read(65536)
            out["status"] = resp.status
            data = json.loads(body.decode("utf-8", "replace"))
            out["ok"] = bool(data.get("ok"))
            out["app_version"] = data.get("app_version")
            out["schema"] = data.get("schema")
            if data.get("licence"):
                out["licence"] = data["licence"]
    except urllib.error.HTTPError as e:
        out["status"] = e.code
        out["error"] = ("protetto da password (401): serve basic_auth nella cassaforte" if e.code == 401
                        else f"HTTP {e.code}")
    except (urllib.error.URLError, OSError, ValueError) as e:
        reason = getattr(e, "reason", e)
        out["error"] = f"non raggiungibile: {reason}"
    out["ms"] = int((time.monotonic() - t0) * 1000)
    return out


def local_api_url(port: int) -> str:
    return f"http://127.0.0.1:{port}/api"


# ---------------------------------------------------------------------------
# processes
# ---------------------------------------------------------------------------

def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if IS_WIN:
        r = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH", "/FO", "CSV"], capture_output=True, text=True)
        return f'"{pid}"' in r.stdout
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    # zombie (child not reaped yet) counts as dead
    try:
        with open(f"/proc/{pid}/stat", "r") as fh:
            return fh.read().split(")")[-1].split()[0] != "Z"
    except OSError:
        return True


def kill_tree(pid: int, timeout: float = 10.0) -> None:
    if IS_WIN:
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
    else:
        try:
            os.killpg(pid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                return
    end = time.monotonic() + timeout
    while time.monotonic() < end and pid_alive(pid):
        time.sleep(0.1)
    if pid_alive(pid) and not IS_WIN:
        try:
            os.killpg(pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass


class LocalRunner:
    def __init__(self, hub_dir: Path, registry: Registry, ports: PortManager | None = None):
        self.hub_dir = Path(hub_dir)
        self.reg = registry
        self.ports = ports or PortManager(registry)

    def env_dir(self, env: dict) -> Path:
        return self.hub_dir / "envs" / env["instance_id"] / env["name"]

    def _require_local(self, env: dict) -> None:
        if env["kind"] != "local-python":
            raise RunnerError(f"L'ambiente {env['name']} è di tipo {env['kind']}: si avvia solo un ambiente "
                              "local-python (sul PC del hub).")

    # -- setup -------------------------------------------------------------
    def setup(self, env: dict, studio_name: str = "", users: list[str] | None = None) -> dict:
        """Run ``docmap_server setup`` for the environment; returns the tokens shown once."""
        self._require_local(env)
        d = self.env_dir(env)
        d.mkdir(parents=True, exist_ok=True)
        cfg = d / "config.json"
        if cfg.exists():
            raise RunnerError(f"L'ambiente ha già una configurazione: {cfg}")
        sdir = server_python_dir(self.reg)
        users = users or ["admin,admin", "ponte-hub,editor"]
        cmd = [server_python_exe(self.reg, sdir), "-m", "docmap_server", "setup", "--config", str(cfg),
               "--data-dir", str((d / "data").resolve())]
        for u in users:
            cmd += ["--user", u]
        if studio_name:
            cmd += ["--studio-name", studio_name]
        r = subprocess.run(cmd, cwd=str(sdir), capture_output=True, text=True, timeout=120,
                           env=dict(os.environ, PYTHONIOENCODING="utf-8"))
        if r.returncode != 0:
            raise RunnerError("Setup del server non riuscito: " + (r.stderr or r.stdout).strip()[-500:])
        tokens = parse_setup_tokens(r.stdout)
        if not tokens:
            raise RunnerError("Setup eseguito ma non ho trovato i codici di accesso nell'output.")
        self.reg.log("env.setup", "environment", env["id"], {"config": str(cfg), "users": [t["user"] for t in tokens]})
        return {"config": cfg, "tokens": tokens}

    def build_app(self, env: dict, studio_name: str = "") -> dict:
        self._require_local(env)
        d = self.env_dir(env)
        res = run_build_deploy(d / "app", base_path="/", slug=re.sub(r"[^a-z0-9-]", "-", env["name"])[:40] or "studio",
                               domain="http://127.0.0.1", studio_name=studio_name, reg=self.reg)
        return res

    # -- pid file ----------------------------------------------------------
    def _pid_file(self, env: dict) -> Path:
        return self.env_dir(env) / "server.pid"

    def _read_pid(self, env: dict) -> dict | None:
        try:
            return json.loads(self._pid_file(env).read_text("utf-8"))
        except (OSError, ValueError):
            return None

    # -- status ------------------------------------------------------------
    def status(self, env: dict, timeout: float = 2.0) -> dict:
        self._require_local(env)
        info = self._read_pid(env)
        port = (info or {}).get("port") or env.get("port")
        alive = bool(info) and pid_alive(int(info.get("pid", 0)))
        hp = ping(local_api_url(port), timeout=timeout) if (alive and port) else None
        if alive and hp and hp["ok"]:
            state = "running"
        elif alive:
            state = "unhealthy"
        else:
            state = "stopped"
        return {"state": state, "pid": (info or {}).get("pid") if alive else None, "port": port,
                "app_version": (hp or {}).get("app_version"), "api_url": local_api_url(port) if port else None,
                "ping": hp, "configured": (self.env_dir(env) / "config.json").exists()}

    # -- start / stop ------------------------------------------------------
    def start(self, env: dict, wait: float = 30.0, attempts: int = 3) -> dict:
        self._require_local(env)
        d = self.env_dir(env)
        cfg = d / "config.json"
        if not cfg.exists():
            raise RunnerError("L'ambiente non è configurato (manca config.json): crealo con env create-local.")
        st = self.status(env)
        if st["state"] == "running":
            return dict(st, already=True, moved_from=None)
        if st["state"] == "unhealthy" and st["pid"]:
            kill_tree(int(st["pid"]))
        sdir = server_python_dir(self.reg)
        exe = server_python_exe(self.reg, sdir)
        moved_first = None
        last_err = ""
        for attempt in range(attempts):
            port, moved = self.ports.ensure(env["id"])
            moved_first = moved_first or moved
            cmd = [exe, "-m", "docmap_server", "serve", "--config", str(cfg), "--host", "127.0.0.1",
                   "--port", str(port)]
            for p in API_PATHS:
                cmd += ["--api-path", p]
            if (d / "app" / "index.html").exists():
                cmd += ["--root", str(d / "app")]
            log = open(d / "server.log", "ab")
            log.write(f"\n--- {_now()} avvio sulla porta {port}\n".encode())
            log.flush()
            kw: dict = {}
            if IS_WIN:
                kw["creationflags"] = (getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x200)
                                       | getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000))
            else:
                kw["start_new_session"] = True
            proc = subprocess.Popen(cmd, cwd=str(sdir), stdout=log, stderr=subprocess.STDOUT,
                                    stdin=subprocess.DEVNULL, env=dict(os.environ, PYTHONIOENCODING="utf-8"), **kw)
            log.close()
            info = {"pid": proc.pid, "port": port, "started_at": _now(), "cmd": cmd}
            tmp = self._pid_file(env).with_suffix(".tmp")
            tmp.write_text(json.dumps(info, indent=1), "utf-8")
            os.replace(tmp, self._pid_file(env))
            end = time.monotonic() + wait
            ok = None
            while time.monotonic() < end:
                if proc.poll() is not None:
                    break
                hp = ping(local_api_url(port), timeout=1.0)
                if hp["ok"]:
                    ok = hp
                    break
                time.sleep(0.25)
            if ok:
                url = local_api_url(port)
                self.reg.update_environment(env["id"], log_action="env.start", status="running", port=port,
                                            api_url=url, url=f"http://127.0.0.1:{port}/",
                                            app_version=ok.get("app_version"), last_check=_now())
                return {"state": "running", "pid": proc.pid, "port": port, "api_url": url,
                        "app_version": ok.get("app_version"), "moved_from": moved_first, "already": False}
            # failed: maybe someone grabbed the port between probe and bind → try another port
            if proc.poll() is None:
                kill_tree(proc.pid)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
            last_err = self.log_tail(env, 15)
            if "address already in use" in last_err.lower() or "10048" in last_err or "errno 98" in last_err.lower():
                continue
            break
        self.reg.update_environment(env["id"], log_action="env.start_failed", status="error")
        raise RunnerError("Il server dell'ambiente non è partito. Ultime righe del log:\n" + last_err)

    def stop(self, env: dict) -> dict:
        self._require_local(env)
        info = self._read_pid(env)
        was = False
        if info and pid_alive(int(info.get("pid", 0))):
            kill_tree(int(info["pid"]))
            was = True
        try:
            self._pid_file(env).unlink()
        except OSError:
            pass
        self.reg.update_environment(env["id"], log_action="env.stop" if was else None, status="stopped")
        return {"stopped": was}

    def log_tail(self, env: dict, n: int = 20) -> str:
        try:
            lines = (self.env_dir(env) / "server.log").read_text("utf-8", "replace").splitlines()
        except OSError:
            return ""
        return "\n".join(lines[-n:])


def parse_setup_tokens(stdout: str) -> list[dict]:
    """Tokens printed once by ``docmap_server setup`` (table after the header line)."""
    out, in_table = [], False
    for line in stdout.splitlines():
        if line.startswith("Persona") and "Ruolo" in line:
            in_table = True
            continue
        if in_table:
            parts = line.split()
            if len(parts) >= 3 and parts[1] in ("admin", "editor", "viewer"):
                out.append({"user": parts[0], "role": parts[1], "token": parts[-1]})
    return out
