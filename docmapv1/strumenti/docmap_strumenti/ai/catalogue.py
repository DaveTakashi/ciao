"""Model catalogue: aliases (role → real model id) and what each known model can do, per provider.

Sources, the later ones win: ``ai_models.json`` shipped with the program, then ``ai.aliases`` / ``ai.models`` in the
settings (so an installation can follow a new model generation without a new release)."""

from __future__ import annotations

import json
from pathlib import Path

CATALOGUE_FILE = Path(__file__).resolve().parent.parent / "ai_models.json"
_CACHE: dict = {}


def catalogue() -> dict:
    if "c" not in _CACHE:
        try:
            _CACHE["c"] = json.loads(CATALOGUE_FILE.read_text("utf-8"))
        except (OSError, ValueError):
            _CACHE["c"] = {"providers": {}}
    return _CACHE["c"]


def _prov(provider: str) -> dict:
    return (catalogue().get("providers") or {}).get(provider) or {}


def aliases(provider: str, settings: dict | None = None) -> dict:
    out = dict(_prov(provider).get("aliases") or {})
    out.update((((settings or {}).get("ai") or {}).get("aliases") or {}).get(provider) or {})
    return {k: v for k, v in out.items() if v}


def models(provider: str, settings: dict | None = None) -> dict:
    """Known models (sub-modules) of a provider: id → capabilities (vision, json_schema, effort, reasoning…)."""
    out = {k: dict(v) for k, v in (_prov(provider).get("models") or {}).items()}
    for k, v in ((((settings or {}).get("ai") or {}).get("models") or {}).get(provider) or {}).items():
        out[k] = {**out.get(k, {}), **(v if isinstance(v, dict) else {})}
    return out


def resolve_model(provider: str, model: str, settings: dict | None = None) -> str:
    """``best`` / ``fast`` / ``ocr``… → the provider's model id. An unknown name is returned as it is: it is the real
    id of the model. Empty → the provider's ``default`` alias, if any."""
    m = (model or "").strip()
    al = aliases(provider, settings)
    seen = set()
    while m in al and m not in seen:   # an alias may point to another alias
        seen.add(m)
        m = str(al[m])
    if not m and al.get("default"):
        return resolve_model(provider, al["default"], settings)
    return m


def caps(provider: str, model: str, settings: dict | None = None, base: dict | None = None) -> dict:
    """Capabilities of one model: the provider's defaults overridden by what the catalogue knows of the model."""
    c = dict(base or {})
    c.update(models(provider, settings).get(model) or {})
    return c
