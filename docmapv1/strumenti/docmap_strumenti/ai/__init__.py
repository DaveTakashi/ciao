"""Agnostic AI layer of the tools (docs/AI-FORNITORI.md).

* ``base``        Provider base class, Request, AIError, registry ``PROVIDERS`` / ``register_provider``, helpers
* ``providers/``  one module per provider family: ``anthropic``, ``openai_chat`` (openai, openai_compatible, mistral,
                  openrouter, vllm, ollama, lmstudio, llamacpp), ``gemini``, ``local`` (workstation, mock)
* ``catalogue``   model aliases and capabilities (``ai_models.json`` + settings)
* ``router``      profiles, routing by task, strategies single / cascade / consensus, ``call()``
* ``plugins``     extra providers and OCR engines from a folder, without changing the program
"""

from __future__ import annotations

from . import providers as _builtin  # noqa: F401  (registers the built-in providers)
from .base import (PROVIDERS, RETRY_STATUS, AIError, Provider, Request, b64, clean_answer, http, json_hint, parse,
                   register_provider, timeout)
from .catalogue import aliases, catalogue, models, resolve_model
from .providers.openai_chat import ChatVariant
from .providers.openai_chat import answer as chat_answer
from .providers.openai_chat import request as chat_request
from .router import (DEFAULT_PROFILE, STRATEGIES, call, chain, confidence, enabled, merge, pick, profile,
                     profiles)

__all__ = ["PROVIDERS", "RETRY_STATUS", "AIError", "Provider", "Request", "b64", "clean_answer", "http", "json_hint",
           "parse", "register_provider", "timeout", "ChatVariant", "aliases", "catalogue", "models", "resolve_model", "chat_answer",
           "chat_request", "DEFAULT_PROFILE", "STRATEGIES", "call", "chain", "confidence", "enabled", "merge", "pick",
           "profile", "profiles", "describe"]


def describe(settings: dict) -> dict:
    """For the settings screen, ``/api/ai`` and ``ai fornitori``: providers with their known models, profiles (never
    secrets), tasks, plugins."""
    from . import plugins
    ps = []
    for n, p in profiles(settings).items():
        st = p.get("strategy") or "single"
        prov = PROVIDERS.get(p.get("provider") or "")
        ps.append({"name": n, "strategy": st, "provider": p.get("provider") or "", "model": p.get("model") or "",
                   "resolved_model": resolve_model(prov.id, p.get("model") or "", settings) if prov else "",
                   "steps": p.get("steps") or [], "members": p.get("members") or [], "fallback": p.get("fallback") or [],
                   "min_conf": p.get("min_conf"), "min_agree": p.get("min_agree"),
                   "cloud": bool(prov and prov.cloud), "has_key": bool(prov and prov.key(p, settings)),
                   "known_provider": bool(prov) or st != "single"})
    a = settings.get("ai") or {}
    return {"providers": [{**v.describe(), "aliases": aliases(k, settings), "models": models(k, settings)}
                          for k, v in PROVIDERS.items()],
            "profiles": ps, "default_profile": a.get("default_profile") or DEFAULT_PROFILE,
            "tasks": a.get("tasks") or {}, "strategies": list(STRATEGIES), "plugins": plugins.loaded()}
