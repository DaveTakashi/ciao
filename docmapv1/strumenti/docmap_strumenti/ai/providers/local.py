"""Your own machines (workstation pool through the gateway) and the fake provider for tests."""

from __future__ import annotations

import json

from ..base import Provider, Request, register_provider
from .openai_chat import request


@register_provider
class Workstation(Provider):
    id = "workstation"
    label = "Le mie workstation (gateway)"
    family = "workstation"
    caps = {"vision": True, "json_schema": False, "effort": False, "reasoning": True}
    doc = "Le tue macchine con la GPU: la più libera che ha il modello, salto di quelle spente (Impostazioni › Workstation)."

    def call(self, p: dict, settings: dict, req: Request) -> dict:
        from ... import workstations as WS
        body, model = request(p, settings, self.id, req)
        return WS.call_chat(settings, body, model, p)


@register_provider
class Mock(Provider):
    id = "mock"
    label = "Finta (solo prove)"
    family = "prove"
    doc = "Risposta finta configurabile (mock_response) per i test."

    def call(self, p: dict, settings: dict, req: Request) -> dict:
        r = p.get("mock_response", (settings.get("ai") or {}).get("mock_response"))
        if callable(r):
            r = r(req.prompt, req.image)
        if isinstance(r, Exception):
            raise r
        return {"model": p.get("model") or "mock",
                "result": json.loads(json.dumps(r if isinstance(r, dict) else {"text": "testo di prova", "confidence": 0.5})),
                "usage": {"in": 0, "out": 0}}
