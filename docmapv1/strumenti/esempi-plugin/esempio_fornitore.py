"""Example plugin: an extra AI provider without changing the program.

Two ways, from the simplest:

1. The service speaks the OpenAI «chat completions» protocol (most do: Groq, Together, DeepInfra, Azure, a vLLM of
   yours…): no plugin needed, use the provider ``openai_compatible`` with ``base_url`` in the profile. Or register a
   named variant with its own default address and key name, like ``MioServizio`` below (three lines).
2. The service has its own protocol: subclass ``Provider`` and write ``call`` (see ``EsempioHttp``).

Copy this file into the plugin folder (Settings › AI shows it), restart, and use the new id in a profile:
``"profiles": {"mio": {"provider": "mio_servizio", "model": "…"}}``. Guide: docs/AI-FORNITORI.md §8.
"""

from __future__ import annotations

from docmap_strumenti.ai import (AIError, ChatVariant, Provider, Request, b64, http, json_hint, parse, register_provider,
                                 timeout)


@register_provider
class MioServizio(ChatVariant):
    """Way 1: an OpenAI-compatible service with a default address. The key goes in Settings › AI › Chiavi
    (``ai.keys.mio_servizio``) or in the environment variable DOCMAP_AI_KEY_MIO_SERVIZIO."""
    id, label, family, cloud, needs_key = "mio_servizio", "Il mio servizio (esempio)", "compatibile", True, True
    default_base = "https://api.example.invalid/v1"
    doc = "Esempio di fornitore aggiunto con un plugin."


@register_provider
class EsempioHttp(Provider):
    """Way 2: a service with its own protocol: POST {"prompt", "image"?} → {"text": "<JSON answer>"}."""
    id, label, family, cloud = "esempio_http", "Servizio HTTP (esempio)", "compatibile", False
    default_base = "http://127.0.0.1:9000"
    doc = "Esempio di fornitore con un protocollo proprio."

    def call(self, p: dict, settings: dict, req: Request) -> dict:
        body = {"prompt": req.prompt + json_hint(req.schema), "model": p.get("model") or ""}
        if req.image:
            body["image"] = b64(req.image)
        j = http(self.base(p) + "/leggi", body, {"Authorization": "Bearer " + self.key(p, settings)}, timeout(p))
        if not isinstance(j, dict) or "text" not in j:
            raise AIError("risposta inattesa dal servizio", retry=True)   # retry=True: try the next profile
        return {"model": p.get("model") or "esempio", "result": parse(j["text"]), "usage": {"in": 0, "out": 0}}
