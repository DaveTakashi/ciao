"""Engines the blocks can call, all swappable from the settings (never from a recipe, which carries no secrets).

* OCR: ``text`` (text already in the file: PDF text layer, TXT, MD, CSV, XLSX, DOCX), ``tesseract`` (local, free),
  ``ai`` (vision model), ``remote`` (an OCR service of yours over HTTP, e.g. a Python server with PaddleOCR / a GPU),
  ``mock`` (tests), ``auto`` (text → tesseract → ai, the first that gives text).
* AI: ``anthropic``, ``openai_compatible`` (OpenAI, Mistral, Azure, OpenRouter, vLLM, LM Studio…), ``ollama`` (local),
  ``mock``. Same JSON answer for all of them.
* HTTP endpoints: named in the settings (``endpoints``), called by the «http» block and by the remote OCR.
"""

from __future__ import annotations

import base64
import io
import json
import os
import re
import shutil
import socket
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

from . import media as M

ANTHROPIC_VERSION = "2026-10-21"
DEFAULT_MODELS = {"anthropic": "claude-haiku-5-5"}


class ProviderError(RuntimeError):
    pass


# -- HTTP helpers --------------------------------------------------------------------------------------------------

def http_json(url: str, body: dict | bytes | None, headers: dict | None = None, timeout: float = 60,
              method: str = "POST") -> tuple[int, dict | None, bytes]:
    if not re.match(r"(?i)https?://\S+\Z", url or ""):
        raise ProviderError(f"indirizzo non valido: {url!r}")
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body, ensure_ascii=False).encode("utf-8")
    h = {"Content-Type": "application/json", "Accept": "application/json", **(headers or {})}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=h, method=method), timeout=timeout) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    except (TimeoutError, socket.timeout):
        raise ProviderError("servizio non raggiungibile (tempo scaduto)") from None
    except (urllib.error.URLError, OSError) as e:
        raise ProviderError(f"servizio non raggiungibile ({getattr(e, 'reason', e)})") from None
    try:
        j = json.loads(raw.decode("utf-8")) if raw else None
    except (ValueError, UnicodeError):
        j = None
    return status, j, raw


def parse_json_text(txt: str):
    """JSON object inside a model answer (```json fences and words around it accepted)."""
    s = (txt or "").strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", s, re.I)
    if m:
        s = m.group(1).strip()
    for cand in (s, s[s.find("{"): s.rfind("}") + 1] if "{" in s else ""):
        if cand:
            try:
                v = json.loads(cand)
                if isinstance(v, dict):
                    return v
            except ValueError:
                pass
    return None


# -- AI ------------------------------------------------------------------------------------------------------------

def ai_enabled(settings: dict) -> bool:
    return (settings.get("ai") or {}).get("provider") in ("anthropic", "openai_compatible", "ollama", "mock")


def image_payload(path: Path, page: int | None = None, max_px: int = 1800) -> tuple[bytes, str]:
    """A page as JPEG bytes small enough for a vision model."""
    img = M.page_image(Path(path), page or 1, dpi=150) if Path(path).suffix.lower() in (".pdf", ".tif", ".tiff", ".gif") \
        else M.open_frames(Path(path))[0]
    img = img.convert("RGB")
    img.thumbnail((max_px, max_px))
    b = io.BytesIO()
    img.save(b, "JPEG", quality=85)
    return b.getvalue(), "image/jpeg"


def ai_json(settings: dict, prompt: str, image: tuple[bytes, str] | None = None, schema: dict | None = None) -> dict:
    """Asks the configured model and returns ``{"model", "result": {…}}``. Raises ProviderError with a clear message."""
    a = settings.get("ai") or {}
    prov = a.get("provider") or ""
    timeout = float(a.get("timeout") or 90)
    if prov == "mock":
        r = a.get("mock_response")
        if callable(r):
            r = r(prompt, image)
        return {"model": "mock", "result": json.loads(json.dumps(r if isinstance(r, dict) else {"text": "testo di prova", "confidence": 0.5}))}
    if prov == "anthropic":
        key = a.get("api_key") or ""
        if not key:
            raise ProviderError("manca la chiave del servizio AI (Impostazioni › AI)")
        model = a.get("model") or DEFAULT_MODELS["anthropic"]
        content = []
        if image:
            content.append({"type": "image", "source": {"type": "base64", "media_type": image[1],
                                                         "data": base64.b64encode(image[0]).decode("ascii")}})
        content.append({"type": "text", "text": prompt})
        req = {"model": model, "max_tokens": int(a.get("max_tokens") or 4000), "messages": [{"role": "user", "content": content}]}
        if schema:
            req["output_config"] = {"format": {"type": "json_schema", "schema": schema}}
        headers = {"x-api-key": key, "anthropic-version": ANTHROPIC_VERSION}
        status, j, _ = http_json((a.get("base_url") or "https://api.anthropic.com").rstrip("/") + "/v1/messages", req, headers, timeout)
        if status < 200 or status >= 300 or not isinstance(j, dict):
            raise ProviderError(_err_msg(j, status))
        if j.get("stop_reason") == "refusal":
            raise ProviderError("il modello ha rifiutato di leggere questo file")
        txt = "".join(b.get("text", "") for b in (j.get("content") or []) if isinstance(b, dict) and b.get("type") == "text")
        r = parse_json_text(txt)
        if r is None:
            raise ProviderError("risposta AI non leggibile")
        return {"model": j.get("model") or model, "result": r}
    if prov in ("openai_compatible", "ollama"):
        base = (a.get("base_url") or ("http://127.0.0.1:11434/v1" if prov == "ollama" else "https://api.openai.com/v1")).rstrip("/")
        model = a.get("model") or ""
        if not model:
            raise ProviderError("manca il nome del modello (Impostazioni › AI)")
        content: list = [{"type": "text", "text": prompt + "\nRispondi SOLO con un oggetto JSON."}]
        if image:
            content.append({"type": "image_url", "image_url": {"url": f"data:{image[1]};base64," + base64.b64encode(image[0]).decode("ascii")}})
        req = {"model": model, "messages": [{"role": "user", "content": content}], "response_format": {"type": "json_object"},
               "max_tokens": int(a.get("max_tokens") or 3000)}
        headers = {"Authorization": "Bearer " + a["api_key"]} if a.get("api_key") else {}
        status, j, _ = http_json(base + "/chat/completions", req, headers, timeout)
        if status < 200 or status >= 300 or not isinstance(j, dict):
            raise ProviderError(_err_msg(j, status))
        ch = j.get("choices") or [{}]
        msg = ch[0].get("message") if isinstance(ch[0], dict) else {}
        r = parse_json_text((msg or {}).get("content") or "")
        if r is None:
            raise ProviderError("risposta AI non leggibile")
        return {"model": j.get("model") or model, "result": r}
    raise ProviderError("AI spenta: sceglila in Impostazioni › AI (Claude, servizio compatibile OpenAI, Ollama locale)")


def _err_msg(j, status) -> str:
    m = j.get("error") if isinstance(j, dict) else None
    m = m.get("message") if isinstance(m, dict) else m
    return "errore del servizio AI" + (f": {str(m)[:200]}" if m else f" (HTTP {status})")


# -- OCR -----------------------------------------------------------------------------------------------------------

def tesseract_cmd(settings: dict) -> str | None:
    o = settings.get("ocr") or {}
    c = o.get("tesseract_cmd") or shutil.which("tesseract")
    if not c:
        for p in (r"C:\Program Files\Tesseract-OCR\tesseract.exe", r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"):
            if Path(p).is_file():
                return p
    return c if c and (Path(c).is_file() or shutil.which(c)) else None


def tesseract_langs(settings: dict) -> list[str]:
    c = tesseract_cmd(settings)
    if not c:
        return []
    try:
        r = subprocess.run([c, "--list-langs"], capture_output=True, text=True, timeout=20)
        return [x.strip() for x in r.stdout.splitlines()[1:] if x.strip()]
    except (OSError, subprocess.SubprocessError):
        return []


def ocr_tesseract(img, settings: dict, lang: str = "", psm: int = 3) -> dict:
    c = tesseract_cmd(settings)
    if not c:
        raise ProviderError("Tesseract non è installato (vedi docs/STRUMENTI.md › OCR)")
    o = settings.get("ocr") or {}
    lang = lang or o.get("lang") or "ita+eng"
    avail = set(tesseract_langs(settings))
    if avail:
        keep = [x for x in lang.split("+") if x in avail]
        lang = "+".join(keep) or ("eng" if "eng" in avail else sorted(avail)[0])
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "p.png"
        img.convert("L").save(p, "PNG", dpi=(300, 300))
        try:
            # one thread per Tesseract: the engine already runs several files at once (OpenMP inside would fight)
            env = {**os.environ, "OMP_THREAD_LIMIT": "1"}
            r = subprocess.run([c, str(p), "stdout", "-l", lang, "--psm", str(psm), "tsv"], capture_output=True,
                               timeout=int(o.get("timeout") or 300), env=env)
        except subprocess.TimeoutExpired:
            raise ProviderError("Tesseract: tempo scaduto") from None
        if r.returncode != 0:
            raise ProviderError("Tesseract: " + r.stderr.decode("utf-8", "replace").strip()[-200:])
    lines: dict = {}
    confs = []
    words = []
    for row in r.stdout.decode("utf-8", "replace").splitlines()[1:]:
        cols = row.split("\t")
        if len(cols) < 12 or not cols[11].strip():
            continue
        try:
            conf = float(cols[10])
        except ValueError:
            continue
        key = (int(cols[2]), int(cols[3]), int(cols[4]))
        lines.setdefault(key, []).append(cols[11])
        if conf >= 0:
            confs.append(conf)
            words.append({"t": cols[11], "c": round(conf / 100, 3), "x": int(cols[6]), "y": int(cols[7]),
                          "w": int(cols[8]), "h": int(cols[9])})
    text = "\n".join(" ".join(v) for _, v in sorted(lines.items()))
    return {"text": text, "conf": round(sum(confs) / len(confs) / 100, 3) if confs else 0.0, "by": f"tesseract:{lang}",
            "words": words, "size": list(img.size)}


AI_OCR_PROMPT = ("Trascrivi fedelmente tutto il testo leggibile di questa pagina (dattiloscritto, stampato o scritto a mano), "
                 "riga per riga, senza riassumere né correggere. Rispondi con JSON {\"text\": \"…\", \"confidence\": 0..1}.")


def ocr_ai(path: Path, page: int | None, settings: dict) -> dict:
    r = ai_json(settings, AI_OCR_PROMPT, image_payload(path, page))
    res = r["result"]
    conf = res.get("confidence")
    return {"text": str(res.get("text") or ""), "conf": float(conf) if isinstance(conf, (int, float)) else None,
            "by": "ai:" + str(r["model"])}


def endpoint(settings: dict, name: str) -> dict:
    eps = settings.get("endpoints") or {}
    ep = eps.get(name)
    if not isinstance(ep, dict) or not ep.get("url"):
        raise ProviderError(f"servizio «{name}» non configurato (Impostazioni › Servizi esterni)")
    return ep


def call_endpoint(settings: dict, name: str, payload: dict, file: Path | None = None) -> dict:
    """POST JSON ``{…payload, "file": {name, mime, data(base64)}}`` to a named endpoint; the answer must be JSON."""
    ep = endpoint(settings, name)
    body = dict(payload)
    if file is not None:
        raw = Path(file).read_bytes()
        if len(raw) > int(ep.get("max_mb") or 50) * 1024 * 1024:
            raise ProviderError("file troppo grande per il servizio")
        body["file"] = {"name": Path(file).name, "data": base64.b64encode(raw).decode("ascii")}
    headers = {"Authorization": "Bearer " + ep["token"]} if ep.get("token") else {}
    status, j, _ = http_json(ep["url"], body, headers, float(ep.get("timeout") or 120))
    if status < 200 or status >= 300 or not isinstance(j, dict):
        raise ProviderError(f"servizio «{name}»: " + _err_msg(j, status).replace("errore del servizio AI", "errore"))
    return j


def ocr_remote(path: Path, page: int | None, settings: dict, lang: str) -> dict:
    name = (settings.get("ocr") or {}).get("remote_endpoint") or "ocr"
    j = call_endpoint(settings, name, {"op": "ocr", "page": page, "lang": lang}, path)
    return {"text": str(j.get("text") or ""), "conf": j.get("conf"), "by": "remote:" + name, "words": j.get("words") or []}


def native_text(path: Path, page: int | None) -> str:
    p = Path(path)
    e = p.suffix.lower()
    if e == ".pdf":
        return M.pdf_text(p, page)
    if e in (".txt", ".md", ".markdown", ".log", ".csv", ".tsv", ".xlsx", ".xlsm", ".json", ".jsonl", ".docx"):
        return M.read_text(p)
    return ""
