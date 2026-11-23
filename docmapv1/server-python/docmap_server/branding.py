"""Product brand (white label) for the Python server: reads brand.js, the single source (docs/MARCHIO.md).

Same format and rules as tools/brand.py (the full tool with checks lives there; the server only needs the name and
must also run in an installed studio, where tools/ is not present). Looked up next to the program:
    <repo>/docmapv1/brand.js            (development)
    BASE\\app\\brand.js                  (installed in sede: BASE\\server\\docmap_server → BASE\\app)
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

_RE = re.compile(r"window\.DOCMAP_BRAND\s*=\s*(\{.*\})\s*;?\s*$", re.S)
_NEUTRAL = "Archivio documenti"
_CACHE: dict = {}


def _candidates() -> list[Path]:
    here = Path(__file__).resolve().parent
    out = []
    if os.environ.get("DOCMAP_APP_DIR"):
        out.append(Path(os.environ["DOCMAP_APP_DIR"]) / "brand.js")
    for up in list(here.parents)[:3]:
        out += [up / "brand.js", up / "app" / "brand.js"]
    return out


def brand() -> dict:
    for p in _candidates():
        try:
            st = p.stat()
        except OSError:
            continue
        key = (str(p), st.st_mtime_ns)
        if key not in _CACHE:
            try:
                m = _RE.search(p.read_text(encoding="utf-8").lstrip("﻿"))
                data = json.loads(m.group(1)) if m else {}
            except (OSError, ValueError):
                data = {}
            _CACHE.clear()
            _CACHE[key] = data if isinstance(data, dict) else {}
        return dict(_CACHE[key])
    return {}


def brand_name() -> str:
    n = brand().get("product_name")
    return n.strip() if isinstance(n, str) and n.strip() else _NEUTRAL
