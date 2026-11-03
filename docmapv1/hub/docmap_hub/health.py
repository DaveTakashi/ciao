"""Status panel: ping every environment in parallel (with timeouts) and keep
the result in the registry (``status``, ``app_version``, ``last_check``).

The network part (:func:`probe_all`) does not touch the database, so the
web page can run it in a background thread and write the results afterwards
under its lock: the page never waits for a slow or unreachable site.
"""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from . import licence as L
from .runner import LocalRunner, ping, pid_alive
from .vault import Vault, VaultKey


def _now() -> str:
    return L.format_time(datetime.now(timezone.utc))


def targets(hub, vk: VaultKey | None = None) -> list[dict]:
    """What to ping, read from the registry (call with the registry lock held)."""
    vault = Vault(hub.registry)
    runner = LocalRunner(hub.dir, hub.registry)
    out = []
    for e in hub.registry.list_environments():
        t = {"env_id": e["id"], "kind": e["kind"], "api_url": e.get("api_url"), "basic": None, "local": None}
        if e["kind"] == "local-python":
            info = runner._read_pid(e)
            alive = bool(info) and pid_alive(int(info.get("pid", 0)))
            t["local"] = {"alive": alive}
            port = (info or {}).get("port") or e.get("port")
            t["api_url"] = f"http://127.0.0.1:{port}/api" if (alive and port) else None
        elif vk is not None:
            try:
                ba = vault.get(vk, e["id"], "basic_auth", reason="check-all", required=False)
            except Exception:
                ba = None
            if ba:
                t["basic"] = (ba["user"], ba["password"])
        out.append(t)
    return out


def probe_all(tlist: list[dict], timeout: float = 5.0, workers: int = 8) -> dict:
    def one(t):
        if not t["api_url"]:
            if t["local"] is not None:
                return {"ok": False, "error": "spento", "state": "stopped"}
            return {"ok": False, "error": "manca l'indirizzo dell'API", "state": "unknown"}
        r = ping(t["api_url"], timeout=timeout, basic_auth=t["basic"])
        r["state"] = "running" if r["ok"] else ("protected" if r.get("status") == 401 else "unreachable")
        return r
    if not tlist:
        return {}
    with ThreadPoolExecutor(max_workers=max(1, min(workers, len(tlist)))) as ex:
        results = list(ex.map(one, tlist))
    return {t["env_id"]: r for t, r in zip(tlist, results)}


def store_results(hub, results: dict) -> None:
    now = _now()
    for env_id, r in results.items():
        fields = {"status": r["state"], "last_check": now,
                  "last_check_json": json.dumps(r, ensure_ascii=False, sort_keys=True, default=str)}
        if r.get("app_version"):
            fields["app_version"] = r["app_version"]
        try:
            hub.registry.update_environment(env_id, **fields)
        except Exception:
            pass  # environment deleted meanwhile
    hub.registry.log("hub.check_all", details={"checked": len(results),
                                               "ok": sum(1 for r in results.values() if r.get("ok"))})


def check_all(hub, vk: VaultKey | None = None, timeout: float = 5.0) -> dict:
    res = probe_all(targets(hub, vk), timeout=timeout)
    store_results(hub, res)
    return res


def status_rows(hub, now: datetime | None = None) -> list[dict]:
    """One row per environment for the CLI and the page (no network)."""
    now = now or datetime.now(timezone.utc)
    rows = []
    for e in hub.registry.list_environments():
        lic_days = None
        if e.get("licence_expires_at"):
            lic_days = int((L.parse_time(e["licence_expires_at"]) - now).total_seconds() // 86400)
        chk = e.get("last_check_data") or {}
        rows.append({
            "env_id": e["id"], "customer": e["customer_name"], "instance": e["instance_label"],
            "instance_id": e["instance_id"], "env": e["name"], "kind": e["kind"],
            "url": e.get("url"), "api_url": e.get("api_url"), "port": e.get("port"),
            "status": e["status"], "reachable": chk.get("ok"), "error": chk.get("error"),
            "app_version": e.get("app_version"), "deployed_version": e.get("deployed_version"),
            "verified_version": e.get("verified_version"), "last_check": e.get("last_check"),
            "last_deploy_at": e.get("last_deploy_at"), "last_backup_at": e.get("last_backup_at"),
            "licence_expires_at": e.get("licence_expires_at"), "licence_days_left": lic_days,
            "expires_at": e.get("expires_at"), "key_escrow": bool(e.get("key_escrow")),
        })
    return rows
