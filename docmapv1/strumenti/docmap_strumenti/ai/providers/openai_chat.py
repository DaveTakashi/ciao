"""Everything that speaks the OpenAI Chat Completions dialect, as one module with sub-modules (variants):

* ``openai``            OpenAI cloud: ``max_completion_tokens`` (its reasoning models refuse ``max_tokens``), JSON schema,
                        ``reasoning_effort``
* ``openai_compatible`` any compatible service (Azure, Together, Groq… with ``base_url``)
* ``mistral``           Mistral cloud (api.mistral.ai)
* ``openrouter``        OpenRouter (many models behind one key)
* ``vllm``              vLLM server of yours (default ``127.0.0.1:8000``)
* ``ollama``            Ollama (default ``127.0.0.1:11434``)
* ``lmstudio``          LM Studio (default ``127.0.0.1:1234``)
* ``llamacpp``          llama.cpp ``llama-server`` (default ``127.0.0.1:8080``)

A new compatible service is one more ``ChatVariant`` subclass (or a plugin: docs/AI-FORNITORI.md §7).
The workstation provider reuses ``request()`` and ``answer()``.
"""

from __future__ import annotations

from ..base import AIError, Provider, Request, b64, http, json_hint, parse, register_provider, timeout
from ..catalogue import resolve_model


def request(p: dict, settings: dict, provider: str, req: Request, strict_openai: bool = False) -> tuple[dict, str]:
    """Body of a Chat Completions call + the real model id."""
    model = resolve_model(provider, p.get("model") or "", settings)
    if not model:
        raise AIError("manca il nome del modello (Impostazioni › AI)")
    content: list = [{"type": "text", "text": req.prompt + json_hint(req.schema)}]
    if req.image:
        content.append({"type": "image_url", "image_url": {"url": f"data:{req.image[1]};base64,{b64(req.image)}"}})
    body: dict = {"model": model, "messages": [{"role": "user", "content": content}]}
    if p.get("system"):
        body["messages"].insert(0, {"role": "system", "content": str(p["system"])})
    limit = int(p.get("max_tokens") or 3000)
    if strict_openai:
        body["max_completion_tokens"] = limit
        body["response_format"] = ({"type": "json_schema", "json_schema": {"name": "risposta", "schema": req.schema, "strict": False}}
                                   if req.schema else {"type": "json_object"})
        if p.get("effort"):
            body["reasoning_effort"] = p["effort"]
    else:
        body["max_tokens"] = limit
        if p.get("json_mode", True):
            body["response_format"] = {"type": "json_object"}
    for k in ("temperature", "top_p", "seed"):
        if isinstance(p.get(k), (int, float)):
            body[k] = p[k]
    if isinstance(p.get("extra_body"), dict):   # model-specific switches (e.g. chat_template_kwargs for vLLM)
        body.update(p["extra_body"])
    return body, model


def answer(j: dict, model: str) -> dict:
    ch = j.get("choices") or [{}]
    msg = (ch[0].get("message") if isinstance(ch[0], dict) else None) or {}
    if isinstance(msg.get("refusal"), str) and msg["refusal"]:
        raise AIError("il modello ha rifiutato di leggere questo file")
    # reasoning models served by vLLM (--reasoning-parser) or Ollama keep the reasoning apart
    # (reasoning_content / reasoning): only `content` is the answer
    u = j.get("usage") or {}
    return {"model": j.get("model") or model, "result": parse(msg.get("content") or ""),
            "usage": {"in": u.get("prompt_tokens"), "out": u.get("completion_tokens")}}


class ChatVariant(Provider):
    strict_openai = False
    caps = {"vision": True, "json_schema": False, "effort": False, "reasoning": False}

    def call(self, p: dict, settings: dict, req: Request) -> dict:
        key = self.key(p, settings)
        if self.needs_key and not key:
            raise AIError(f"manca la chiave di {self.label} (Impostazioni › AI)")
        body, model = request(p, settings, self.id, req, self.strict_openai)
        headers = {"Authorization": "Bearer " + key} if key else {}
        if isinstance(p.get("headers"), dict):
            headers.update({str(k): str(v) for k, v in p["headers"].items()})
        base = self.base(p)
        if not base:
            raise AIError(f"manca l'indirizzo del servizio per {self.label} (Impostazioni › AI)")
        return answer(http(base + "/chat/completions", body, headers, timeout(p)), model)


@register_provider
class OpenAI(ChatVariant):
    id, label, family, cloud, needs_key = "openai", "OpenAI", "cloud", True, True
    default_base = "https://api.openai.com/v1"
    strict_openai = True
    caps = {"vision": True, "json_schema": True, "effort": True, "reasoning": True}
    doc = "OpenAI nativo: max_completion_tokens, schema JSON, reasoning_effort."


@register_provider
class OpenAICompatible(ChatVariant):
    id, label, family, cloud = "openai_compatible", "Compatibile OpenAI (indirizzo a scelta)", "compatibile", True
    key_name = "openai_compatible"
    default_base = "https://api.openai.com/v1"
    doc = "Qualsiasi servizio compatibile OpenAI: Azure, Together, Groq… con il suo indirizzo."


@register_provider
class Mistral(ChatVariant):
    id, label, family, cloud, needs_key = "mistral", "Mistral", "cloud", True, True
    default_base = "https://api.mistral.ai/v1"
    doc = "Mistral La Plateforme (compatibile OpenAI)."


@register_provider
class OpenRouter(ChatVariant):
    id, label, family, cloud, needs_key = "openrouter", "OpenRouter", "cloud", True, True
    default_base = "https://openrouter.ai/api/v1"
    doc = "Molti modelli dietro una sola chiave (nomi tipo «fornitore/modello»)."


@register_provider
class VLLM(ChatVariant):
    id, label, family = "vllm", "vLLM (server tuo)", "locale"
    default_base = "http://127.0.0.1:8000/v1"
    caps = {"vision": True, "json_schema": False, "effort": False, "reasoning": True}
    doc = "vLLM: avvialo con --reasoning-parser per i modelli che ragionano."


@register_provider
class Ollama(ChatVariant):
    id, label, family = "ollama", "Ollama", "locale"
    default_base = "http://127.0.0.1:11434/v1"
    doc = "Ollama sul PC o in rete (modelli GGUF)."


@register_provider
class LMStudio(ChatVariant):
    id, label, family = "lmstudio", "LM Studio", "locale"
    default_base = "http://127.0.0.1:1234/v1"
    doc = "LM Studio (server locale compatibile OpenAI)."


@register_provider
class LlamaCpp(ChatVariant):
    id, label, family = "llamacpp", "llama.cpp (llama-server)", "locale"
    default_base = "http://127.0.0.1:8080/v1"
    doc = "llama-server di llama.cpp (modelli GGUF)."
