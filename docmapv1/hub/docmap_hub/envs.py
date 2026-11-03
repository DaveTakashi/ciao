"""Environments of an installation: production, staging, demo-*.

* ``web-php``       the PHP deploy on the hosting (SiteGround), updated by FTP/SFTP (deploy.py)
* ``local-python``  a server-python instance on Dave's PC, started by the hub (runner.py)
* ``studio-python`` the server-python installed at the studio (installer-windows), only monitored

Staging and demo environments with real data are ``local-python``: the data
is copied one way (source → local) with server-python's ``sync-remote``
bridge, from any environment that has an API and a token in the vault.
Copying real data onto Dave's PC requires the customer's ``key_escrow``
flag (Dave becomes able to read the data: written consent needed).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import licence as L
from .registry import RegistryError
from .runner import LocalRunner, RunnerError, local_api_url, server_python_dir, server_python_exe
from .vault import Vault, VaultKey


class EnvError(RegistryError):
    pass


def _now_dt() -> datetime:
    return datetime.now(timezone.utc)


def api_url_from(url: str | None) -> str | None:
    """https://host/studio-de/ → https://host/studio-de/server-php/api.php"""
    if not url:
        return None
    u = url.strip()
    if u.endswith("api.php") or u.rstrip("/").endswith("/api"):
        return u
    return u.rstrip("/") + "/server-php/api.php"


class EnvManager:
    def __init__(self, hub):
        self.hub = hub
        self.reg = hub.registry
        self.vault = Vault(self.reg)
        self.runner = LocalRunner(hub.dir, self.reg)

    # -- create ------------------------------------------------------------
    def add_remote(self, instance: str, name: str, kind: str, url: str, api_url: str | None = None,
                   base_path: str | None = None, slug: str | None = None, domain: str | None = None,
                   studio_name: str | None = None, notes: str | None = None) -> dict:
        if kind not in ("web-php", "studio-python"):
            raise EnvError("Con 'env add' si registrano ambienti remoti (web-php o studio-python); "
                           "per un ambiente sul PC del hub usa 'env create-local'.")
        settings = {}
        if kind == "web-php":
            from urllib.parse import urlsplit
            parts = urlsplit(url or "")
            if parts.scheme not in ("https", "http") or not parts.netloc:
                raise EnvError("Indirizzo non valido: serve l'indirizzo completo dell'app, es. "
                               "https://docmap.pr-it.it/studio-de/")
            settings = {"base_path": base_path or (parts.path if parts.path.endswith("/") else parts.path + "/") or "/",
                        "domain": domain or f"{parts.scheme}://{parts.netloc}",
                        "slug": slug or (parts.path.strip("/").split("/")[-1] or "studio"),
                        "studio_name": studio_name or ""}
        return self.reg.add_environment(instance, name, kind, url=url, api_url=api_url or api_url_from(url),
                                        settings=settings, notes=notes)

    def create_local(self, instance: str, name: str, vk: VaultKey | None, studio_name: str = "",
                     expires_at: str | None = None, build_app: bool = True) -> dict:
        """Register a local-python environment, reserve a port, run setup, store its tokens in the vault."""
        if vk is None:
            raise EnvError("Serve la cassaforte aperta: i codici di accesso del nuovo ambiente vanno custoditi lì.")
        env = self.reg.add_environment(instance, name, "local-python", expires_at=expires_at,
                                       settings={"studio_name": studio_name})
        try:
            self.runner.ports.allocate(env["id"])
            res = self.runner.setup(env, studio_name=studio_name)
        except Exception:
            # setup failed: archive what was created and drop the row
            self._archive_dir(env, "setup-fallito")
            self.reg.delete_environment_row(env["id"], {"reason": "setup failed"})
            raise
        for t in res["tokens"]:
            self.vault.put(vk, env["id"], "admin_token", {"user": t["user"], "role": t["role"], "token": t["token"]},
                           label=t["user"])
        app = None
        if build_app:
            try:
                app = self.runner.build_app(self.reg.get_environment(env["id"]), studio_name)
            except RunnerError as exc:
                app = {"error": str(exc)}
        env = self.reg.update_environment(env["id"], status="stopped",
                                          app_version=(app or {}).get("version") if app else None)
        return {"env": env, "tokens": res["tokens"], "app": app}

    # -- clone -------------------------------------------------------------
    def _side(self, env: dict, vk: VaultKey, label: str, key: str) -> tuple[dict, dict]:
        """Profile side + environment variables carrying its secrets."""
        if env["kind"] == "local-python":
            st = self.runner.status(env)
            if st["state"] != "running":
                st = self.runner.start(env)
            url = st["api_url"]
            tok = self.vault.get(vk, env["id"], "admin_token", "ponte-hub", reason=f"clone-data ({label})",
                                 required=False) or self.vault.get(vk, env["id"], "admin_token", "admin",
                                                                   reason=f"clone-data ({label})")
        else:
            url = env.get("api_url")
            if not url:
                raise EnvError(f"L'ambiente {env['name']} non ha l'indirizzo dell'API (api_url).")
            tok = (self.vault.get(vk, env["id"], "admin_token", "ponte-hub", reason=f"clone-data ({label})",
                                  required=False)
                   or self.vault.get(vk, env["id"], "admin_token", "", reason=f"clone-data ({label})",
                                     required=False))
            if tok is None:
                rows = [s for s in self.vault.list(env_id=env["id"]) if s["kind"] == "admin_token"]
                if not rows:
                    raise EnvError(f"Nella cassaforte manca un codice di accesso (admin_token, ruolo editor o admin) "
                                   f"per l'ambiente {env['name']}.")
                tok = self.vault.get(vk, env["id"], "admin_token", rows[0]["label"], reason=f"clone-data ({label})")
        side = {"label": label, "url": url, "token": "", "token_env": f"DOCMAP_HUB_SYNC_{key.upper()}_TOKEN",
                "basic_user": "", "basic_pass": "", "basic_pass_env": f"DOCMAP_HUB_SYNC_{key.upper()}_BASIC_PASS",
                "ca": "", "insecure_lan": False}
        envv = {side["token_env"]: tok["token"]}
        ba = self.vault.get(vk, env["id"], "basic_auth", reason=f"clone-data ({label})", required=False)
        if ba:
            side["basic_user"] = ba["user"]
            envv[side["basic_pass_env"]] = ba["password"]
        return side, envv

    def _require_escrow(self, cust: dict) -> None:
        if not cust.get("key_escrow"):
            raise EnvError(
                f"Copiare i dati veri di '{cust['name']}' sul PC del hub significa poterli leggere: serve il consenso "
                "del cliente (nomina a responsabile del trattamento) e la custodia attivata con "
                f"customer set --customer \"{cust['name']}\" --key-escrow on")

    def clone_data(self, instance: str, src_name: str, dst_name: str, vk: VaultKey, dry_run: bool = False,
                   timeout: int = 3600) -> dict:
        src = self.reg.get_environment(instance, src_name)
        dst = self.reg.get_environment(instance, dst_name)
        if dst["name"] == "production":
            raise EnvError("clone-data non scrive mai in production: la destinazione deve essere staging o demo-*.")
        if dst["kind"] != "local-python":
            raise EnvError("La destinazione di clone-data deve essere un ambiente local-python (sul PC del hub). "
                           "Per uno staging web-php: crea uno staging locale, provalo, poi usa deploy.")
        if src["id"] == dst["id"]:
            raise EnvError("Origine e destinazione coincidono.")
        self._require_escrow(self.reg.customer_of_env(dst))
        a, env_a = self._side(src, vk, f"{src['name']} ({src['kind']})", "a")
        b, env_b = self._side(dst, vk, f"{dst['name']} (locale)", "b")
        prof_dir = self.runner.env_dir(dst) / "sync"
        prof_dir.mkdir(parents=True, exist_ok=True)
        prof = prof_dir / f"clone-from-{src['name']}.json"
        profile = {"name": f"hub: {src['name']} → {dst['name']}", "a": a, "b": b, "direction": "a-to-b",
                   "sync_settings": True, "sync_activity_log": True}
        tmp = prof.with_suffix(".tmp")
        tmp.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", "utf-8")
        os.replace(tmp, prof)
        sdir = server_python_dir(self.reg)
        cmd = [server_python_exe(self.reg, sdir), "-m", "docmap_server", "sync-remote", str(prof),
               "--direction", "a-to-b", "--json"]
        if dry_run:
            cmd.append("--dry-run")
        r = subprocess.run(cmd, cwd=str(sdir), capture_output=True, text=True, timeout=timeout,
                           env=dict(os.environ, PYTHONIOENCODING="utf-8", **env_a, **env_b))
        try:
            report = json.loads(r.stdout)
        except ValueError:
            report = {"raw": r.stdout[-2000:], "stderr": r.stderr[-2000:]}
        self.reg.log("env.clone_data", "environment", dst["id"],
                     {"from": src["name"], "to": dst["name"], "dry_run": dry_run, "exit": r.returncode})
        if r.returncode == 2:
            errs = report.get("errors") if isinstance(report, dict) else None
            raise EnvError("Copia dei dati non riuscita: " + ("; ".join(map(str, errs)) if errs else
                                                              (r.stderr or r.stdout)[-800:]))
        return {"exit": r.returncode, "report": report, "profile": str(prof), "from": src["name"], "to": dst["name"]}

    # -- demo --------------------------------------------------------------
    def demo_create(self, instance: str, days: int, vk: VaultKey, src_name: str | None = "production",
                    label: str | None = None) -> dict:
        if not (1 <= int(days) <= 90):
            raise EnvError("Durata della demo: da 1 a 90 giorni.")
        inst = self.reg.get_instance(instance)
        name = "demo-" + (label or _now_dt().strftime("%Y%m%d") + "-" + uuid.uuid4().hex[:4]).lower()
        expires = L.format_time(_now_dt() + timedelta(days=int(days)))
        if src_name:
            self.reg.get_environment(inst["id"], src_name)  # must exist
            self._require_escrow(self.reg.get_customer(inst["customer_id"]))
        res = self.create_local(inst["id"], name, vk, expires_at=expires)
        out = {"env": res["env"], "tokens": res["tokens"], "expires_at": expires, "clone": None}
        if src_name:
            try:
                out["clone"] = self.clone_data(inst["id"], src_name, name, vk)
            except Exception:
                self.delete(inst["id"], name, reason="demo-fallita")
                raise
        return out

    # -- delete / purge ----------------------------------------------------
    def _archive_dir(self, env: dict, reason: str) -> str | None:
        d = self.runner.env_dir(env)
        if not d.exists():
            return None
        stamp = _now_dt().strftime("%Y%m%d-%H%M%S")
        dest = self.hub.dir / "_trash" / "envs" / env["instance_id"] / f"{env['name']}-{stamp}-{reason}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(d), str(dest))
        return str(dest)

    def delete(self, instance: str, name: str, *, production: bool = False, confirm: str | None = None,
               reason: str = "eliminato") -> dict:
        env = self.reg.get_environment(instance, name)
        inst = self.reg.get_instance(env["instance_id"])
        if env["name"] == "production":
            if not production or (confirm or "").strip() != (inst["label"] or "").strip():
                raise EnvError("Per eliminare l'ambiente production servono --production e "
                               f"--confirm \"{inst['label']}\" (il nome esatto dell'installazione).")
        if env["kind"] == "local-python":
            try:
                self.runner.stop(env)
            except RunnerError:
                pass
        archived = self._archive_dir(env, reason) if env["kind"] == "local-python" else None
        self.reg.delete_environment_row(env["id"], {"archived_to": archived, "reason": reason})
        return {"env": env, "archived_to": archived,
                "remote_untouched": env["kind"] != "local-python"}

    def purge_expired(self, now: datetime | None = None) -> list[dict]:
        now = now or _now_dt()
        out = []
        for e in self.reg.list_environments():
            if e["expires_at"] and e["name"] != "production" and L.parse_time(e["expires_at"]) <= now:
                out.append(self.delete(e["instance_id"], e["name"], reason="scaduto"))
        return out
