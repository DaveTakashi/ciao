"""Brand (white label) in the hub.

The product brand has ONE source: ``brand.js`` at the root of the program tree (docs/MARCHIO.md). The hub reads it
with ``tools/brand.py`` found next to it (the same code used by build_deploy.py and crea-zip.py), so there is a single
parser. On top of it the hub layers, for each customer:

    product brand (brand.js)  ←  reseller brand (resellers.branding_json: product_name, logo_url, primary_color,
                                  support_email, … any brand.js field)  ←  customer brand (customers.extra["brand"])

``override_for_env`` is what build_deploy.py receives with ``--brand``: every site and package of a reseller's
customer carries the reseller's name, never the hub owner's.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

_NEUTRAL = {"product_name": "Archivio documenti", "short_name": "Archivio documenti", "hub_name": "Hub",
            "file_prefix": "Archivio", "languages": ["it", "en"], "default_language": "it", "tagline": {"it": "", "en": ""},
            "support_email": "", "website": "", "vendor_name": "Archivio documenti", "mark": "", "logo_url": "",
            "primary_color": ""}
_MOD_CACHE: dict = {}
_LOAD_CACHE: dict = {}


def _root(reg=None) -> Path | None:
    from .runner import docmap_roots   # lazy: this module is imported by registry.py, which runner.py imports
    for r in docmap_roots(reg):
        if (r / "brand.js").is_file() and (r / "tools" / "brand.py").is_file():
            return r
    return None


def brand_module(reg=None):
    """tools/brand.py of the program tree (None when the tree is not found)."""
    r = _root(reg)
    if r is None:
        return None
    p = r / "tools" / "brand.py"
    key = str(p)
    if key not in _MOD_CACHE:
        spec = importlib.util.spec_from_file_location("_docmap_brand_tool", p)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)   # type: ignore[union-attr]
        _MOD_CACHE[key] = mod
    return _MOD_CACHE[key]


def product_brand(reg=None, override: dict | None = None) -> dict:
    """Normalized brand of the program (plus ``override``). Never raises: neutral values when brand.js is missing."""
    try:
        mod = brand_module(reg)
        if mod is not None:
            root = _root(reg)
            key = (str(root), (root / "brand.js").stat().st_mtime_ns, json.dumps(override or {}, sort_keys=True))
            if key not in _LOAD_CACHE:
                if len(_LOAD_CACHE) > 32:
                    _LOAD_CACHE.clear()
                _LOAD_CACHE[key] = mod.load(root, override)
            return json.loads(json.dumps(_LOAD_CACHE[key]))
    except Exception:   # a broken brand.js must never stop the hub; «controllo» reports it
        pass
    b = dict(_NEUTRAL)
    b.update({k: v for k, v in (override or {}).items() if v not in (None, "")})
    return b


def brand_name(reg=None) -> str:
    return product_brand(reg)["product_name"]


def hub_title(reg=None) -> str:
    b = product_brand(reg)
    return f"{b['product_name']} {b.get('hub_name') or 'Hub'}".strip()


def customer_extra(customer: dict) -> dict:
    """extra of a customer row (registry rows carry extra_json; customer_view rows carry extra)."""
    if isinstance(customer.get("extra"), dict):
        return customer["extra"]
    try:
        return json.loads(customer.get("extra_json") or "{}")
    except ValueError:
        return {}


def customer_override(reg, customer: dict | None) -> dict:
    """Brand fields that differ for this customer: reseller brand, then the customer's own (extra.brand)."""
    out: dict = {}
    if not customer:
        return out
    rid = customer.get("reseller_id")
    if rid:
        try:
            out.update({k: v for k, v in (reg.get_reseller(rid).get("branding") or {}).items() if v not in (None, "")})
        except Exception:
            pass
    extra = customer_extra(customer)
    if isinstance(extra.get("brand"), dict):
        out.update({k: v for k, v in extra["brand"].items() if v not in (None, "")})
    return out


def override_for_env(reg, env: dict) -> dict:
    try:
        from .move import customer_of
        return customer_override(reg, customer_of(reg, env))
    except Exception:
        return {}


def brand_for_customer(reg, customer: dict | None) -> dict:
    return product_brand(reg, customer_override(reg, customer))


def brand_for_env(reg, env: dict) -> dict:
    return product_brand(reg, override_for_env(reg, env))


def validate_override(reg, data: dict) -> list[str]:
    """Problems of a reseller / customer brand (empty = good), with the same rules as brand.js."""
    mod = brand_module(reg)
    if mod is None:
        return []
    base = mod.parse((_root(reg) / "brand.js").read_text(encoding="utf-8"))
    bad = [f"«{k}» non va nel marchio: l'indirizzo dei QR si sceglie per installazione" for k in data if k in mod.FORBIDDEN_KEYS]
    return bad + mod.validate(mod.merge(base, data))
