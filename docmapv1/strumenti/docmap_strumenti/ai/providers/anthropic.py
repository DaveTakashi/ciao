"""Anthropic (Claude), Messages API: native JSON schema (``output_config.format``) and ``effort``."""

from __future__ import annotations

from ..base import AIError, Provider, Request, b64, http, parse, register_provider, timeout
from ..catalogue import resolve_model

ANTHROPIC_VERSION = "2026-10-21"


@register_provider
class Anthropic(Provider):
    id = "anthropic"
    label = "Claude (Anthropic)"
    family = "cloud"
    cloud = True
    needs_key = True
    default_base = "https://api.anthropic.com"
    caps = {"vision": True, "json_schema": True, "effort": True, "reasoning": True}
    doc = "Modelli Claude; alias best / balanced / fast; schema JSON nativo e sforzo (effort)."

    def call(self, p: dict, settings: dict, req: Request) -> dict:
        key = self.key(p, settings)
        if not key:
            raise AIError("manca la chiave di Anthropic (Impostazioni › AI)")
        model = resolve_model(self.id, p.get("model") or "", settings) or "claude-haiku-5-5"
        content = []
        if req.image:
            content.append({"type": "image", "source": {"type": "base64", "media_type": req.image[1], "data": b64(req.image)}})
        content.append({"type": "text", "text": req.prompt})
        body = {"model": model, "max_tokens": int(p.get("max_tokens") or 4000), "messages": [{"role": "user", "content": content}]}
        oc = {}
        if req.schema:
            oc["format"] = {"type": "json_schema", "schema": req.schema}
        if p.get("effort"):
            oc["effort"] = p["effort"]
        if oc:
            body["output_config"] = oc
        if isinstance(p.get("extra_body"), dict):
            body.update(p["extra_body"])
        j = http(self.base(p) + "/v1/messages", body, {"x-api-key": key, "anthropic-version": ANTHROPIC_VERSION}, timeout(p))
        if j.get("stop_reason") == "refusal":
            raise AIError("il modello ha rifiutato di leggere questo file")
        txt = "".join(b.get("text", "") for b in (j.get("content") or []) if isinstance(b, dict) and b.get("type") == "text")
        u = j.get("usage") or {}
        return {"model": j.get("model") or model, "result": parse(txt),
                "usage": {"in": u.get("input_tokens"), "out": u.get("output_tokens")}}
