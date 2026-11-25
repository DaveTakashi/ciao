"""Agnostic AI layer: provider adapters, model catalogue, named profiles and a router with fallbacks.

Design (docs/AI-FORNITORI.md):

* **Adapter** = one wire protocol. ``anthropic`` (Messages API), ``openai`` (OpenAI cloud, Chat Completions),
  ``gemini`` (Google Generative Language API, ``generateContent``), ``openai_compatible`` (any service that speaks the
  OpenAI Chat Completions dialect: Mistral, Azure, OpenRouter, LM Studio…), ``vllm`` and ``ollama`` (same dialect,
  local defaults), ``workstation`` (your own GPU machines through the gateway in ``docmapv1/workstation/``, with a
  pool of addresses, health checks and routing: ``workstations.py``), ``mock`` (tests).
* **Model** = a name the provider understands, or an **alias** from the catalogue (``ai_models.json``: ``best``,
  ``balanced``, ``fast``, ``ocr``…), so a new model generation is one line in a file, never a code change.
* **Profile** = what a block asks for (``predefinito``, ``ocr``, ``veloce``, ``qualita``…): provider + model + options
  + a fallback chain. The old single ``settings["ai"]`` (provider/model/base_url/api_key) is the profile
  ``predefinito``, so existing installations keep working unchanged.

Every adapter returns the same thing: ``{"provider", "model", "result": {…JSON…}, "usage": {"in", "out"}, "ms"}``.
Secrets live only in the settings (``ai.api_key``, ``ai.keys.<provider>``, workstation tokens), never in a recipe.
"""

from __future__ import annotations

import base64
import json
import re
import time
from pathlib import Path

from . import providers as PR

ANTHROPIC_VERSION = "2026-10-21"
CATALOGUE_FILE = Path(__file__).with_name("ai_models.json")
DEFAULT_PROFILE = "predefinito"
RETRY_STATUS = {408, 409, 425, 429, 500, 502, 503, 504, 529}   # worth one more try (same or next provider)


class AIError(PR.ProviderError):
    """An AI call failed. ``retry`` = worth trying the next provider of the chain (busy, down, timeout)."""

    def __init__(self, msg: str, retry: bool = False, status: int = 0):
        super().__init__(msg)
        self.retry = retry
        self.status = status


# -- catalogue ------------------------------------------------------------------------------------------------------

def catalogue() -> dict:
    """``ai_models.json``: per provider, the aliases (role → model id) and what each known model can do."""
    try:
        return json.loads(CATALOGUE_FILE.read_text("utf-8"))
    except (OSError, ValueError):
        return {"providers": {}}


def resolve_model(provider: str, model: str, settings: dict | None = None) -> str:
    """``best`` / ``fast`` / ``ocr``… → the provider's model id (aliases in the settings win over the catalogue).
    An unknown name is returned as it is: it is the real id of the model."""
    m = (model or "").strip()
    user = (((settings or {}).get("ai") or {}).get("aliases") or {}).get(provider) or {}
    cat = ((catalogue().get("providers") or {}).get(provider) or {}).get("aliases") or {}
    for table in (user, cat):
        if m and m in table and table[m]:
            return str(table[m])
    if not m:
        for table in (user, cat):
            if table.get("default"):
                return str(table["default"])
    return m


# -- profiles -------------------------------------------------------------------------------------------------------

def profiles(settings: dict) -> dict:
    """All the profiles of this installation. ``predefinito`` always exists (it is the old single AI setting)."""
    a = settings.get("ai") or {}
    out = {DEFAULT_PROFILE: {k: v for k, v in a.items()
                             if k not in ("profiles", "keys", "aliases", "default_profile", "mock_response") and v not in (None, "")}}
    for name, p in (a.get("profiles") or {}).items():
        if isinstance(p, dict) and re.match(r"^[\w\-]{1,40}$", str(name)):
            out[str(name)] = dict(p)
    return out


def profile(settings: dict, name: str | None) -> dict:
    ps = profiles(settings)
    a = settings.get("ai") or {}
    n = name or a.get("default_profile") or DEFAULT_PROFILE
    if n not in ps:
        n = DEFAULT_PROFILE
    p = dict(ps[n])
    p["_name"] = n
    return p


def chain(settings: dict, name: str | None) -> list[dict]:
    """The profile, then its ``fallback`` profiles (names), without loops; at most 4 tries."""
    out, seen = [], set()
    todo = [name or (settings.get("ai") or {}).get("default_profile") or DEFAULT_PROFILE]
    while todo and len(out) < 4:
        n = todo.pop(0)
        p = profile(settings, n)
        if p["_name"] in seen:
            continue
        seen.add(p["_name"])
        if p.get("provider"):
            out.append(p)
        fb = p.get("fallback") or []
        todo.extend([fb] if isinstance(fb, str) else [x for x in fb if isinstance(x, str)])
    return out


def enabled(settings: dict, name: str | None = None) -> bool:
    return any(p.get("provider") in ADAPTERS for p in chain(settings, name))


# -- shared helpers -------------------------------------------------------------------------------------------------

THINK_RE = re.compile(r"<(think|thinking|reasoning)>[\s\S]*?</\1>", re.I)


def clean_answer(txt: str) -> str:
    """Text of a reasoning model without its reasoning (``<think>…</think>``): local models (vLLM without a reasoning
    parser, llama.cpp, some Ollama builds) put it in the answer itself."""
    t = THINK_RE.sub("", txt or "")
    if "</think>" in t:   # an opening tag cut by the chat template: keep what follows the last closing one
        t = t.rsplit("</think>", 1)[1]
    return t.strip()


def _key(p: dict, settings: dict, provider: str) -> str:
    return p.get("api_key") or ((settings.get("ai") or {}).get("keys") or {}).get(provider) or ""


def _http(url: str, body: dict, headers: dict, timeout: float) -> dict:
    try:
        status, j, _ = PR.http_json(url, body, headers, timeout)
    except PR.ProviderError as e:
        raise AIError(str(e), retry=True) from None
    if status < 200 or status >= 300 or not isinstance(j, dict):
        raise AIError(PR._err_msg(j, status), retry=status in RETRY_STATUS, status=status)
    return j


def _parse(txt: str) -> dict:
    r = PR.parse_json_text(clean_answer(txt))
    if r is None:
        raise AIError("risposta AI non leggibile", retry=True)
    return r


def _b64(image) -> str:
    return base64.b64encode(image[0]).decode("ascii")


def _json_hint(schema: dict | None) -> str:
    if not schema:
        return "\nRispondi SOLO con un oggetto JSON."
    return "\nRispondi SOLO con un oggetto JSON con queste chiavi: " + ", ".join((schema.get("properties") or {}).keys()) + "."


# -- adapters -------------------------------------------------------------------------------------------------------

def call_anthropic(p: dict, settings: dict, prompt: str, image, schema) -> dict:
    key = _key(p, settings, "anthropic")
    if not key:
        raise AIError("manca la chiave di Anthropic (Impostazioni › AI)")
    model = resolve_model("anthropic", p.get("model") or "", settings) or "claude-haiku-5-5"
    content = []
    if image:
        content.append({"type": "image", "source": {"type": "base64", "media_type": image[1], "data": _b64(image)}})
    content.append({"type": "text", "text": prompt})
    req = {"model": model, "max_tokens": int(p.get("max_tokens") or 4000), "messages": [{"role": "user", "content": content}]}
    oc = {}
    if schema:
        oc["format"] = {"type": "json_schema", "schema": schema}
    if p.get("effort"):
        oc["effort"] = p["effort"]
    if oc:
        req["output_config"] = oc
    headers = {"x-api-key": key, "anthropic-version": ANTHROPIC_VERSION}
    j = _http((p.get("base_url") or "https://api.anthropic.com").rstrip("/") + "/v1/messages", req, headers,
              float(p.get("timeout") or 90))
    if j.get("stop_reason") == "refusal":
        raise AIError("il modello ha rifiutato di leggere questo file")
    txt = "".join(b.get("text", "") for b in (j.get("content") or []) if isinstance(b, dict) and b.get("type") == "text")
    u = j.get("usage") or {}
    return {"model": j.get("model") or model, "result": _parse(txt),
            "usage": {"in": u.get("input_tokens"), "out": u.get("output_tokens")}}


CHAT_BASES = {"openai": "https://api.openai.com/v1", "ollama": "http://127.0.0.1:11434/v1",
              "vllm": "http://127.0.0.1:8000/v1", "openai_compatible": "https://api.openai.com/v1"}


def chat_request(p: dict, settings: dict, provider: str, prompt: str, image, schema) -> tuple[dict, str]:
    """Body of an OpenAI Chat Completions call + the model id. Shared by openai / compatible / vllm / ollama /
    workstation (the gateway speaks the same dialect)."""
    model = resolve_model(provider, p.get("model") or "", settings)
    if not model:
        raise AIError("manca il nome del modello (Impostazioni › AI)")
    content: list = [{"type": "text", "text": prompt + _json_hint(schema)}]
    if image:
        content.append({"type": "image_url", "image_url": {"url": f"data:{image[1]};base64,{_b64(image)}"}})
    req: dict = {"model": model, "messages": [{"role": "user", "content": content}]}
    limit = int(p.get("max_tokens") or 3000)
    if provider == "openai":
        # OpenAI cloud: max_completion_tokens (max_tokens is refused by its reasoning models) and strict JSON schema
        req["max_completion_tokens"] = limit
        req["response_format"] = ({"type": "json_schema", "json_schema": {"name": "risposta", "schema": schema, "strict": False}}
                                  if schema else {"type": "json_object"})
        if p.get("effort"):
            req["reasoning_effort"] = p["effort"]
    else:
        req["max_tokens"] = limit
        req["response_format"] = {"type": "json_object"}
    for k in ("temperature", "top_p"):
        if isinstance(p.get(k), (int, float)):
            req[k] = p[k]
    if isinstance(p.get("extra_body"), dict):   # model-specific switches (e.g. chat_template_kwargs for vLLM)
        req.update(p["extra_body"])
    return req, model


def chat_answer(j: dict, model: str) -> dict:
    ch = j.get("choices") or [{}]
    msg = (ch[0].get("message") if isinstance(ch[0], dict) else None) or {}
    if isinstance(msg.get("refusal"), str) and msg["refusal"]:
        raise AIError("il modello ha rifiutato di leggere questo file")
    # reasoning models served by vLLM (--reasoning-parser) or Ollama keep the reasoning in a separate field
    # (reasoning_content / reasoning): only `content` is the answer
    u = j.get("usage") or {}
    return {"model": j.get("model") or model, "result": _parse(msg.get("content") or ""),
            "usage": {"in": u.get("prompt_tokens"), "out": u.get("completion_tokens")}}


def call_chat(p: dict, settings: dict, prompt: str, image, schema, provider: str) -> dict:
    base = (p.get("base_url") or CHAT_BASES.get(provider) or CHAT_BASES["openai"]).rstrip("/")
    key = _key(p, settings, provider)
    if provider == "openai" and not key:
        raise AIError("manca la chiave di OpenAI (Impostazioni › AI)")
    req, model = chat_request(p, settings, provider, prompt, image, schema)
    headers = {"Authorization": "Bearer " + key} if key else {}
    j = _http(base + "/chat/completions", req, headers, float(p.get("timeout") or 90))
    return chat_answer(j, model)


GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"


def call_gemini(p: dict, settings: dict, prompt: str, image, schema) -> dict:
    """Google Gemini, native ``generateContent`` (JSON answer through ``responseMimeType``)."""
    key = _key(p, settings, "gemini")
    if not key:
        raise AIError("manca la chiave di Gemini (Impostazioni › AI)")
    model = resolve_model("gemini", p.get("model") or "", settings)
    if not model:
        raise AIError("manca il nome del modello Gemini (Impostazioni › AI)")
    parts: list = [{"text": prompt + _json_hint(schema)}]
    if image:
        parts.append({"inline_data": {"mime_type": image[1], "data": _b64(image)}})
    gc: dict = {"responseMimeType": "application/json", "maxOutputTokens": int(p.get("max_tokens") or 4000)}
    for k, g in (("temperature", "temperature"), ("top_p", "topP")):
        if isinstance(p.get(k), (int, float)):
            gc[g] = p[k]
    req = {"contents": [{"role": "user", "parts": parts}], "generationConfig": gc}
    base = (p.get("base_url") or GEMINI_BASE).rstrip("/")
    name = model if model.startswith("models/") else "models/" + model
    j = _http(f"{base}/{name}:generateContent", req, {"x-goog-api-key": key}, float(p.get("timeout") or 90))
    cands = j.get("candidates") or []
    if not cands:
        raise AIError("il modello non ha risposto (" + str((j.get("promptFeedback") or {}).get("blockReason") or "vuoto") + ")")
    c0 = cands[0] if isinstance(cands[0], dict) else {}
    if c0.get("finishReason") in ("SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST"):
        raise AIError("il modello ha rifiutato di leggere questo file")
    txt = "".join(x.get("text", "") for x in ((c0.get("content") or {}).get("parts") or [])
                  if isinstance(x, dict) and not x.get("thought"))
    u = j.get("usageMetadata") or {}
    return {"model": j.get("modelVersion") or model, "result": _parse(txt),
            "usage": {"in": u.get("promptTokenCount"), "out": u.get("candidatesTokenCount")}}


def call_workstation(p: dict, settings: dict, prompt: str, image, schema) -> dict:
    from . import workstations as WS
    req, model = chat_request(p, settings, "workstation", prompt, image, schema)
    return WS.call_chat(settings, req, model, p)


def call_mock(p: dict, settings: dict, prompt: str, image, schema) -> dict:
    r = p.get("mock_response", (settings.get("ai") or {}).get("mock_response"))
    if callable(r):
        r = r(prompt, image)
    if isinstance(r, Exception):
        raise r
    return {"model": p.get("model") or "mock",
            "result": json.loads(json.dumps(r if isinstance(r, dict) else {"text": "testo di prova", "confidence": 0.5})),
            "usage": {"in": 0, "out": 0}}


ADAPTERS = {
    "anthropic": call_anthropic,
    "openai": lambda p, s, pr, im, sc: call_chat(p, s, pr, im, sc, "openai"),
    "gemini": call_gemini,
    "openai_compatible": lambda p, s, pr, im, sc: call_chat(p, s, pr, im, sc, "openai_compatible"),
    "vllm": lambda p, s, pr, im, sc: call_chat(p, s, pr, im, sc, "vllm"),
    "ollama": lambda p, s, pr, im, sc: call_chat(p, s, pr, im, sc, "ollama"),
    "workstation": call_workstation,
    "mock": call_mock,
}
PROVIDER_LABELS = {
    "anthropic": "Claude (Anthropic)", "openai": "OpenAI", "gemini": "Google Gemini",
    "openai_compatible": "compatibile OpenAI (Mistral, Azure, OpenRouter, LM Studio…)", "vllm": "vLLM (server tuo)",
    "ollama": "Ollama sul PC", "workstation": "Le mie workstation (gateway)", "mock": "finta (solo prove)",
}
CLOUD = {"anthropic", "openai", "gemini", "openai_compatible"}   # data leaves your machines (GDPR art. 28)


# -- router ---------------------------------------------------------------------------------------------------------

def call(settings: dict, prompt: str, image=None, schema: dict | None = None, profile_name: str | None = None) -> dict:
    """Asks the profile (then its fallbacks) and returns ``{"provider", "model", "profile", "result", "usage", "ms",
    "attempts"}``. A provider that is busy, down or slow passes the turn to the next one; any other error stops."""
    steps = chain(settings, profile_name)
    if not steps:
        raise AIError("AI spenta: sceglila in Impostazioni › AI")
    attempts, last = [], None
    for p in steps:
        prov = p.get("provider") or ""
        fn = ADAPTERS.get(prov)
        if not fn:
            attempts.append({"profile": p["_name"], "provider": prov, "error": "fornitore sconosciuto"})
            continue
        t0 = time.monotonic()
        try:
            r = fn(p, settings, prompt, image, schema)
        except AIError as e:
            attempts.append({"profile": p["_name"], "provider": prov, "error": str(e)[:200], "ms": int((time.monotonic() - t0) * 1000)})
            last = e
            if not e.retry:
                break
            continue
        except PR.ProviderError as e:   # raised by helpers shared with the OCR code
            attempts.append({"profile": p["_name"], "provider": prov, "error": str(e)[:200]})
            last = e
            break
        r.update({"provider": r.get("provider") or prov, "profile": p["_name"], "ms": int((time.monotonic() - t0) * 1000),
                  "attempts": attempts})
        return r
    err = (AIError("nessun fornitore AI ha risposto: " + "; ".join(f"{a['profile']} ({a['provider']}): {a['error']}" for a in attempts))
           if len(attempts) > 1 else (last or AIError("AI non disponibile")))
    err.attempts = attempts
    raise err


def describe(settings: dict) -> dict:
    """For the settings screen and ``/api/ai``: providers, profiles (secrets never included), catalogue aliases."""
    ps = []
    for n, p in profiles(settings).items():
        prov = p.get("provider") or ""
        ps.append({"name": n, "provider": prov, "model": p.get("model") or "",
                   "resolved_model": resolve_model(prov, p.get("model") or "", settings) if prov else "",
                   "fallback": p.get("fallback") or [], "cloud": prov in CLOUD,
                   "has_key": bool(_key(p, settings, prov))})
    cat = catalogue().get("providers") or {}
    return {"providers": [{"id": k, "label": v, "cloud": k in CLOUD, "aliases": (cat.get(k) or {}).get("aliases") or {}}
                          for k, v in PROVIDER_LABELS.items()],
            "profiles": ps, "default_profile": (settings.get("ai") or {}).get("default_profile") or DEFAULT_PROFILE}
