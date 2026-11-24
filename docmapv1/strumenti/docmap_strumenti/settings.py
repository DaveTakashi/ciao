"""Settings of a worker (``impostazioni.json`` in the data folder). Secrets live only here, never in a recipe."""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path

DEFAULTS: dict = {
    "threads": 2,                       # files processed at the same time by heavy blocks (OCR, AI, conversion)
    "workers": 1,                       # jobs run at the same time
    "ocr": {"engine": "auto", "lang": "ita+eng", "tesseract_cmd": "", "remote_endpoint": "", "timeout": 300},
    "ai": {"provider": "", "model": "", "base_url": "", "api_key": "", "timeout": 90},
    "endpoints": {},                    # name -> {"url", "token", "timeout", "max_mb"}
    "remote": {"url": "", "token": "", "auto_mb": 200, "always": False, "poll_s": 3},
    "credits": {"costs": {}, "local_month": None},
    "licence": {"modes": ["local", "remote"]},   # what the licence of this installation allows
    "roots": [],                        # folders the browser may browse (empty = the user's home and drives)
    "shortcuts": {},                    # review keys chosen by the user (the screen has the defaults)
    "max_upload_mb": 2048,
}
SECRET_KEYS = {("ai", "api_key"), ("remote", "token")}
MASK = "••••••"


def path(data_dir: Path) -> Path:
    return Path(data_dir) / "impostazioni.json"


def _deep(a: dict, b: dict) -> dict:
    out = copy.deepcopy(a)
    for k, v in (b or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict) and k != "endpoints":
            out[k] = _deep(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def load(data_dir: Path) -> dict:
    p = path(data_dir)
    try:
        user = json.loads(p.read_text("utf-8")) if p.is_file() else {}
    except ValueError:
        user = {}
    s = _deep(DEFAULTS, user)
    # environment variables win (handy on a server): DOCMAP_AI_API_KEY, DOCMAP_REMOTE_TOKEN
    if os.environ.get("DOCMAP_AI_API_KEY"):
        s["ai"]["api_key"] = os.environ["DOCMAP_AI_API_KEY"]
    if os.environ.get("DOCMAP_REMOTE_TOKEN"):
        s["remote"]["token"] = os.environ["DOCMAP_REMOTE_TOKEN"]
    return s


def save(data_dir: Path, new: dict) -> dict:
    """Merges ``new`` into the saved settings; a masked secret («••••••») keeps the saved value."""
    p = path(data_dir)
    try:
        cur = json.loads(p.read_text("utf-8")) if p.is_file() else {}
    except ValueError:
        cur = {}
    new = copy.deepcopy(new or {})
    for a, b in SECRET_KEYS:
        if isinstance(new.get(a), dict) and new[a].get(b) == MASK:
            new[a][b] = (cur.get(a) or {}).get(b, "")
    for name, ep in (new.get("endpoints") or {}).items():
        if isinstance(ep, dict) and ep.get("token") == MASK:
            ep["token"] = ((cur.get("endpoints") or {}).get(name) or {}).get("token", "")
    merged = _deep(cur, new)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(".impostazioni.tmp")
    tmp.write_text(json.dumps(merged, ensure_ascii=False, indent=2), "utf-8")
    os.replace(tmp, p)
    return load(data_dir)


def public(s: dict) -> dict:
    """Settings for the browser: secrets masked."""
    out = copy.deepcopy(s)
    for a, b in SECRET_KEYS:
        if out.get(a, {}).get(b):
            out[a][b] = MASK
    for ep in (out.get("endpoints") or {}).values():
        if isinstance(ep, dict) and ep.get("token"):
            ep["token"] = MASK
    return out


def effective(data_dir: Path) -> dict:
    """Settings as the engine must apply them: the installed licence (if any) decides the run modes and the monthly
    credits of this PC (``licensing.entitlements``); ``_ent`` keeps the whole answer. Never saved."""
    from . import licensing
    s = load(data_dir)
    ent = licensing.entitlements(Path(data_dir), s)
    if ent["enforced"]:
        s.setdefault("licence", {})["modes"] = ent["modes"]
        s.setdefault("credits", {})["local_month"] = ent["credits_month"]
    s["_ent"] = ent
    return s
