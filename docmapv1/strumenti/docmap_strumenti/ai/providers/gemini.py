"""Google Gemini, native ``generateContent`` (JSON answer through ``responseMimeType``; «thought» parts dropped)."""

from __future__ import annotations

from ..base import AIError, Provider, Request, b64, http, json_hint, parse, register_provider, timeout
from ..catalogue import resolve_model


@register_provider
class Gemini(Provider):
    id = "gemini"
    label = "Google Gemini"
    family = "cloud"
    cloud = True
    needs_key = True
    default_base = "https://generativelanguage.googleapis.com/v1beta"
    caps = {"vision": True, "json_schema": False, "effort": False, "reasoning": True}
    doc = "Gemini nativo (generateContent); il nome del modello va scritto nel profilo o in un alias."

    def call(self, p: dict, settings: dict, req: Request) -> dict:
        key = self.key(p, settings)
        if not key:
            raise AIError("manca la chiave di Gemini (Impostazioni › AI)")
        model = resolve_model(self.id, p.get("model") or "", settings)
        if not model:
            raise AIError("manca il nome del modello Gemini (Impostazioni › AI)")
        parts: list = [{"text": req.prompt + json_hint(req.schema)}]
        if req.image:
            parts.append({"inline_data": {"mime_type": req.image[1], "data": b64(req.image)}})
        gc: dict = {"responseMimeType": "application/json", "maxOutputTokens": int(p.get("max_tokens") or 4000)}
        for k, g in (("temperature", "temperature"), ("top_p", "topP"), ("seed", "seed")):
            if isinstance(p.get(k), (int, float)):
                gc[g] = p[k]
        if isinstance(p.get("generation_config"), dict):
            gc.update(p["generation_config"])
        body = {"contents": [{"role": "user", "parts": parts}], "generationConfig": gc}
        if p.get("system"):
            body["systemInstruction"] = {"parts": [{"text": str(p["system"])}]}
        name = model if model.startswith("models/") else "models/" + model
        j = http(f"{self.base(p)}/{name}:generateContent", body, {"x-goog-api-key": key}, timeout(p))
        cands = j.get("candidates") or []
        if not cands:
            raise AIError("il modello non ha risposto (" + str((j.get("promptFeedback") or {}).get("blockReason") or "vuoto") + ")")
        c0 = cands[0] if isinstance(cands[0], dict) else {}
        if c0.get("finishReason") in ("SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST"):
            raise AIError("il modello ha rifiutato di leggere questo file")
        txt = "".join(x.get("text", "") for x in ((c0.get("content") or {}).get("parts") or [])
                      if isinstance(x, dict) and not x.get("thought"))
        u = j.get("usageMetadata") or {}
        return {"model": j.get("modelVersion") or model, "result": parse(txt),
                "usage": {"in": u.get("promptTokenCount"), "out": u.get("candidatesTokenCount")}}
