"""Brand (white label): the product name comes only from brand.js, read with tools/brand.py of the program tree."""

from __future__ import annotations

import importlib.util
from pathlib import Path

_NEUTRAL = "Archivio documenti"
_CACHE: dict = {}


def _root() -> Path | None:
    here = Path(__file__).resolve()
    for r in here.parents:
        if (r / "brand.js").is_file() and (r / "tools" / "brand.py").is_file():
            return r
    return None


def brand() -> dict:
    if "b" not in _CACHE:
        b = {"product_name": _NEUTRAL}
        try:
            r = _root()
            if r is not None:
                spec = importlib.util.spec_from_file_location("_docmap_brand_tool_s", r / "tools" / "brand.py")
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)   # type: ignore[union-attr]
                b = mod.load(r)
        except Exception:   # a broken brand.js never stops the tools
            pass
        _CACHE["b"] = b
    return _CACHE["b"]


def brand_name() -> str:
    return brand().get("product_name") or _NEUTRAL
