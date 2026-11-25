"""Pool of your own GPU workstations (the gateway in ``docmapv1/workstation/`` runs on each of them).

Settings (``impostazioni.json``)::

    "workstations": {
      "pool": [{"name": "kubuntu-1", "url": "http://10.8.0.2:8095", "token": "…", "weight": 1, "enabled": true}],
      "health_s": 30,     # how old a health check may be before it is repeated
      "down_s": 60,       # a workstation that failed is skipped for this long
      "timeout": 180      # seconds for one reading
    }

Routing: only enabled workstations that answer the health check and publish the requested model; among them the one
with the lowest load (``(running + waiting + calls in flight from here) / max_parallel / weight``). A workstation that is
busy (429), down or slow is marked down for ``down_s`` and the next one is tried. A profile can pin workstations by name
(``"workstations": ["kubuntu-1"]``). Protocol: docs/WORKSTATION-API.md.
"""

from __future__ import annotations

import threading
import time

from . import providers as PR

_LOCK = threading.Lock()
_STATE: dict = {}      # url -> {"at", "ok", "info", "down_until", "inflight", "error"}


def pool(settings: dict) -> list[dict]:
    ws = settings.get("workstations") or {}
    out = []
    for i, w in enumerate(ws.get("pool") or []):
        if isinstance(w, dict) and str(w.get("url") or "").strip():
            out.append({"name": str(w.get("name") or f"ws{i + 1}"), "url": str(w["url"]).strip().rstrip("/"),
                        "token": w.get("token") or "", "weight": float(w.get("weight") or 1) or 1.0,
                        "enabled": w.get("enabled", True) is not False})
    return out


def _st(url: str) -> dict:
    return _STATE.setdefault(url, {"at": 0.0, "ok": False, "info": {}, "down_until": 0.0, "inflight": 0, "error": ""})


def _hdr(w: dict) -> dict:
    return {"Authorization": "Bearer " + w["token"]} if w.get("token") else {}


def check(w: dict, timeout: float = 5) -> dict:
    """``GET /dm/v1/health`` of one workstation → its state (also stored for the routing)."""
    t0 = time.monotonic()
    try:
        status, j, _ = PR.http_json(w["url"] + "/dm/v1/health", None, _hdr(w), timeout, method="GET")
        ok = 200 <= status < 300 and isinstance(j, dict) and bool(j.get("ok"))
        err = "" if ok else (PR._err_msg(j, status).replace("errore del servizio AI", "errore"))
        info = j if isinstance(j, dict) else {}
    except PR.ProviderError as e:
        ok, err, info = False, str(e), {}
    with _LOCK:
        s = _st(w["url"])
        s.update({"at": time.monotonic(), "ok": ok, "info": info, "error": err, "ms": int((time.monotonic() - t0) * 1000)})
        if ok:
            s["down_until"] = 0.0
        return dict(s)


def status(settings: dict, refresh: bool = False) -> list[dict]:
    """Every workstation of the pool with its last health check (for the settings screen and ``/api/ai``)."""
    out = []
    for w in pool(settings):
        s = check(w) if refresh or not _st(w["url"])["at"] else dict(_st(w["url"]))
        info = s.get("info") or {}
        out.append({"name": w["name"], "url": w["url"], "enabled": w["enabled"], "ok": s["ok"], "error": s.get("error", ""),
                    "ms": s.get("ms"), "models": info.get("models") or [], "queue": info.get("queue") or {},
                    "gpus": info.get("gpus") or [], "version": info.get("version") or "", "name_remote": info.get("name") or "",
                    "role": info.get("role") or ""})
    return out


def _load(s: dict, w: dict) -> float:
    q = (s.get("info") or {}).get("queue") or {}
    cap = max(1, int(q.get("max_parallel") or 1))
    return (int(q.get("running") or 0) + int(q.get("waiting") or 0) + s.get("inflight", 0)) / cap / w["weight"]


def candidates(settings: dict, model: str, pin: list | None = None) -> list[dict]:
    ws = settings.get("workstations") or {}
    fresh = float(ws.get("health_s") or 30)
    now = time.monotonic()
    out = []
    for w in pool(settings):
        if not w["enabled"] or (pin and w["name"] not in pin):
            continue
        s = _st(w["url"])
        if s["down_until"] > now:
            continue
        if now - s["at"] > fresh:
            s = check(w)
        if not s["ok"]:
            continue
        models = (s.get("info") or {}).get("models") or []
        names = {m if isinstance(m, str) else str((m or {}).get("id") or "") for m in models}
        if models and model not in names:
            continue
        out.append((_load(s, w), w))
    out.sort(key=lambda x: x[0])
    return [w for _, w in out]


def _down(w: dict, settings: dict, err: str) -> None:
    with _LOCK:
        s = _st(w["url"])
        s["down_until"] = time.monotonic() + float((settings.get("workstations") or {}).get("down_s") or 60)
        s["ok"] = False
        s["error"] = err


def call_chat(settings: dict, req: dict, model: str, p: dict) -> dict:
    """Sends an OpenAI-style chat request to the best workstation, then to the next ones if it is busy or down."""
    from .ai import AIError, RETRY_STATUS, chat_answer
    pin = p.get("workstations") if isinstance(p.get("workstations"), list) else None
    cands = candidates(settings, model, pin)
    if not cands:
        raise AIError("nessuna workstation disponibile con il modello «" + model + "» (Impostazioni › Workstation)", retry=True)
    timeout = float(p.get("timeout") or (settings.get("workstations") or {}).get("timeout") or 180)
    errors = []
    for w in cands[:3]:
        with _LOCK:
            _st(w["url"])["inflight"] += 1
        try:
            status, j, _ = PR.http_json(w["url"] + "/v1/chat/completions", req, _hdr(w), timeout)
        except PR.ProviderError as e:
            _down(w, settings, str(e))
            errors.append(f"{w['name']}: {e}")
            continue
        finally:
            with _LOCK:
                _st(w["url"])["inflight"] -= 1
        if 200 <= status < 300 and isinstance(j, dict):
            r = chat_answer(j, model)
            r["workstation"] = w["name"]
            return r
        msg = PR._err_msg(j, status)
        if status in RETRY_STATUS:
            _down(w, settings, msg)
            errors.append(f"{w['name']}: {msg}")
            continue
        raise AIError(f"workstation {w['name']}: {msg}", status=status)
    raise AIError("workstation non disponibili: " + "; ".join(errors), retry=True)


def reset() -> None:
    """Forget every health check (tests, or after changing the settings)."""
    with _LOCK:
        _STATE.clear()
