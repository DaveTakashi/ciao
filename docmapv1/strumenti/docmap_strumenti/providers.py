"""Engines the blocks can call, all swappable from the settings (never from a recipe, which carries no secrets).

* OCR: ``text`` (text already in the file: PDF text layer, TXT, MD, CSV, XLSX, DOCX), ``tesseract`` (local, free),
  ``ai`` (vision model), ``remote`` (an OCR service of yours over HTTP, e.g. a Python server with PaddleOCR / a GPU),
  ``mock`` (tests), ``auto`` (text → tesseract → ai, the first that gives text).
* AI: ``anthropic``, ``openai``, ``gemini``, ``openai_compatible`` (Mistral, Azure, OpenRouter, LM Studio…), ``vllm``,
  ``ollama`` (local), ``workstation`` (your GPU machines), ``mock``, with named profiles and fallbacks
  (package ``ai``). Same JSON answer for all of them.
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

def ai_enabled(settings: dict, profile: str | None = None, task: str = "") -> bool:
    from . import ai
    return ai.enabled(settings, profile, task)


def image_payload(path: Path, page: int | None = None, max_px: int = 1800) -> tuple[bytes, str]:
    """A page as JPEG bytes small enough for a vision model."""
    img = M.page_image(Path(path), page or 1, dpi=150) if Path(path).suffix.lower() in (".pdf", ".tif", ".tiff", ".gif") \
        else M.open_frames(Path(path))[0]
    img = img.convert("RGB")
    img.thumbnail((max_px, max_px))
    b = io.BytesIO()
    img.save(b, "JPEG", quality=85)
    return b.getvalue(), "image/jpeg"


def ai_json(settings: dict, prompt: str, image: tuple[bytes, str] | None = None, schema: dict | None = None,
            profile: str | None = None, task: str = "") -> dict:
    """Asks the right AI profile (named one → ``ai.tasks[task]`` → default → ``predefinito``) and returns
    ``{"model", "result": {…}, "provider", "profile", "usage", "ms", "attempts"}``. Raises ProviderError with a clear
    message. Providers, profiles, cascade, consensus, plugins: package ``ai`` (docs/AI-FORNITORI.md)."""
    from . import ai
    return ai.call(settings, prompt, image, schema, profile, task)


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


def ocr_ai(path: Path, page: int | None, settings: dict, profile: str | None = None) -> dict:
    # the step's profile, else ocr.ai_profile, else ai.tasks["ocr"], else a profile named «ocr», else the default AI
    prof = profile or (settings.get("ocr") or {}).get("ai_profile") or None
    r = ai_json(settings, AI_OCR_PROMPT, image_payload(path, page), profile=prof, task="ocr")
    res = r["result"]
    conf = res.get("confidence")
    return {"text": str(res.get("text") or ""), "conf": float(conf) if isinstance(conf, (int, float)) else None,
            "by": "ai:" + str(r["model"]), "profile": r.get("profile"), "provider": r.get("provider")}


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
