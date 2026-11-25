"""Building blocks shared by every AI provider module: the error, the request, the provider base class, the registry
and the small helpers (HTTP, JSON answer, reasoning removal). A provider module only imports from here."""

from __future__ import annotations

import base64
import re
from dataclasses import dataclass, field

from .. import providers as PR

RETRY_STATUS = {408, 409, 425, 429, 500, 502, 503, 504, 529}   # worth trying the next provider of the chain


class AIError(PR.ProviderError):
    """An AI call failed. ``retry`` = worth trying the next provider/profile (busy, down, timeout, model unfit)."""

    def __init__(self, msg: str, retry: bool = False, status: int = 0):
        super().__init__(msg)
        self.retry = retry
        self.status = status
        self.attempts: list = []


@dataclass
class Request:
    """What a block asks: a prompt, maybe one image ``(bytes, mime)``, maybe a JSON schema of the answer, and the task
    (``ocr``, ``extract``, ``classify``, ``analyze``) used by the routing rules."""
    prompt: str
    image: tuple | None = None
    schema: dict | None = None
    task: str = ""
    meta: dict = field(default_factory=dict)


class Provider:
    """Base class of a provider module. Subclasses set the class attributes and implement ``call``.

    ``call(p, settings, req)`` receives the profile ``p`` (provider, model, base_url, api_key, timeout, max_tokens,
    effort, temperature, top_p, extra_body… whatever the profile holds), the settings and the Request; it returns
    ``{"model", "result": {…}, "usage": {"in", "out"}}`` or raises AIError (``retry=True`` when another provider may
    succeed)."""

    id = ""
    label = ""
    family = ""             # group shown in the settings: cloud, compatibile, locale, workstation, prove
    cloud = False           # documents leave your machines (GDPR art. 28)
    needs_key = False
    key_name = ""           # name in ai.keys (default: id)
    default_base = ""
    caps = {"vision": True, "json_schema": False, "effort": False, "reasoning": False}
    doc = ""                # one line for the settings and for `ai fornitori`

    def call(self, p: dict, settings: dict, req: Request) -> dict:   # pragma: no cover - abstract
        raise NotImplementedError

    # helpers for subclasses
    def key(self, p: dict, settings: dict) -> str:
        return p.get("api_key") or ((settings.get("ai") or {}).get("keys") or {}).get(self.key_name or self.id) or ""

    def base(self, p: dict) -> str:
        return (p.get("base_url") or self.default_base).rstrip("/")

    def describe(self) -> dict:
        return {"id": self.id, "label": self.label, "family": self.family, "cloud": self.cloud,
                "needs_key": self.needs_key, "key_name": self.key_name or self.id, "default_base": self.default_base,
                "caps": dict(self.caps), "doc": self.doc}


PROVIDERS: dict[str, Provider] = {}


def register_provider(prov) -> Provider:
    """Adds (or replaces) a provider. Accepts a class or an instance; usable as a class decorator."""
    obj = prov() if isinstance(prov, type) else prov
    if not obj.id or not re.match(r"^[a-z][a-z0-9_]{1,40}$", obj.id):
        raise ValueError(f"id di fornitore non valido: {obj.id!r}")
    PROVIDERS[obj.id] = obj
    return prov


# -- helpers --------------------------------------------------------------------------------------------------------

THINK_RE = re.compile(r"<(think|thinking|reasoning)>[\s\S]*?</\1>", re.I)


def clean_answer(txt: str) -> str:
    """Text of a reasoning model without its reasoning (``<think>…</think>``): local models (vLLM without a reasoning
    parser, llama.cpp, some Ollama builds) put it in the answer itself."""
    t = THINK_RE.sub("", txt or "")
    if "</think>" in t:   # an opening tag cut by the chat template: keep what follows the last closing one
        t = t.rsplit("</think>", 1)[1]
    return t.strip()


def http(url: str, body: dict, headers: dict, timeout: float) -> dict:
    try:
        status, j, _ = PR.http_json(url, body, headers, timeout)
    except PR.ProviderError as e:
        raise AIError(str(e), retry=True) from None
    if status < 200 or status >= 300 or not isinstance(j, dict):
        raise AIError(PR._err_msg(j, status), retry=status in RETRY_STATUS, status=status)
    return j


def parse(txt: str) -> dict:
    r = PR.parse_json_text(clean_answer(txt))
    if r is None:
        raise AIError("risposta AI non leggibile", retry=True)
    return r


def b64(image) -> str:
    return base64.b64encode(image[0]).decode("ascii")


def json_hint(schema: dict | None) -> str:
    if not schema:
        return "\nRispondi SOLO con un oggetto JSON."
    return "\nRispondi SOLO con un oggetto JSON con queste chiavi: " + ", ".join((schema.get("properties") or {}).keys()) + "."


def timeout(p: dict, default: float = 90) -> float:
    return float(p.get("timeout") or default)
