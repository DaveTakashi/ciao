"""OCR engines as a registry, like the AI providers: one class per engine, chosen by name, extendable with plugins.

Built-in engines:

| id | what | where it runs |
|---|---|---|
| ``text``      | text already inside the file (digital PDF, Word, Excel, TXT…): no OCR at all | this PC |
| ``tesseract`` | Tesseract (free, many languages, word boxes) | this PC |
| ``paddleocr`` | PaddleOCR, if the ``paddleocr`` package is installed (strong on scans; GPU optional) | this PC |
| ``remote``    | an OCR service of yours over HTTP (``ocr.remote_endpoint``, contract in docs/STRUMENTI.md §2.5) | your server |
| ``ai``        | any AI profile (``ocr.ai_profile``, default ``ocr``): vision models, your workstation, consensus… | per profile |
| ``mock``      | test text (sidecar ``.txt`` files) | tests |

``auto`` tries ``ocr.auto_order`` (default text → tesseract → paddleocr → remote → ai) and keeps the first engine that
is available; with ``ocr.escalate_below`` > 0 it goes on to the next engine while the confidence is below that value
and keeps the best reading (cascade: Tesseract first, AI only for the hard pages).

Every engine returns ``{"text", "conf" (0..1 or None), "by", "words"?: [{t, c, x, y, w, h}], "size"?: [w, h]}``.
"""

from __future__ import annotations

from pathlib import Path

from . import media as M
from . import providers as PR

AUTO_ORDER = ["text", "tesseract", "paddleocr", "remote", "ai"]


class OcrEngine:
    """Base class. ``kinds``: item kinds the engine reads (``image``/``pdf`` = pictures of pages)."""
    id = ""
    label = ""
    local = True            # documents stay on this PC / your machines
    meters = ("ocr_page",)  # credits consumed per page
    kinds = ("pdf", "image")
    doc = ""

    def available(self, settings: dict) -> bool:
        return True

    def read(self, path: Path, page: int, settings: dict, opts: dict) -> dict:   # pragma: no cover - abstract
        raise NotImplementedError

    def describe(self, settings: dict) -> dict:
        return {"id": self.id, "label": self.label, "local": self.local, "available": bool(self.available(settings)),
                "doc": self.doc}


ENGINES: dict[str, OcrEngine] = {}
# the recipe block offers these names (list shared with blocks/reading.py, so plugins appear in it too)
ENGINE_CHOICES: list[str] = ["auto"]


def register_ocr(engine) -> OcrEngine:
    """Adds (or replaces) an OCR engine. Accepts a class or an instance; usable as a class decorator."""
    obj = engine() if isinstance(engine, type) else engine
    if not obj.id or obj.id == "auto":
        raise ValueError(f"id di motore OCR non valido: {obj.id!r}")
    ENGINES[obj.id] = obj
    if obj.id not in ENGINE_CHOICES:
        ENGINE_CHOICES.append(obj.id)
    return engine


def _image(path: Path, page: int, dpi: int):
    p = Path(path)
    return M.page_image(p, page, dpi) if p.suffix.lower() == ".pdf" or M.page_count(p) > 1 else M.open_frames(p)[0]


page_image = _image   # public name for plugins: the picture of one page of an image/PDF file


@register_ocr
class TextLayer(OcrEngine):
    id, label = "text", "Testo già nel file"
    meters = ()
    kinds = ("pdf", "text", "table", "doc")
    doc = "PDF digitali, Word, Excel, TXT: nessun OCR, affidabilità 1."

    def read(self, path, page, settings, opts):
        t = PR.native_text(path, page if Path(path).suffix.lower() == ".pdf" else None)
        return {"text": t, "conf": 1.0 if t.strip() else 0.0, "by": "text"}


@register_ocr
class Tesseract(OcrEngine):
    id, label = "tesseract", "Tesseract (sul PC)"
    doc = "Gratuito, molte lingue, posizione delle parole."

    def available(self, settings):
        return bool(PR.tesseract_cmd(settings))

    def read(self, path, page, settings, opts):
        return PR.ocr_tesseract(_image(path, page, int(opts.get("dpi") or 300)), settings, opts.get("lang") or "",
                                int(opts.get("psm") if opts.get("psm") is not None else 3))


@register_ocr
class PaddleOCR(OcrEngine):
    id, label = "paddleocr", "PaddleOCR (sul PC, se installato)"
    doc = "pip install paddleocr (e paddlepaddle): forte sulle scansioni, GPU facoltativa."
    _inst: dict = {}

    def available(self, settings):
        import importlib.util
        return importlib.util.find_spec("paddleocr") is not None

    def _ocr(self, lang: str):
        if lang not in self._inst:
            from paddleocr import PaddleOCR as _P   # optional dependency
            self._inst[lang] = _P(lang=lang)
        return self._inst[lang]

    def read(self, path, page, settings, opts):
        if not self.available(settings):
            raise PR.ProviderError("PaddleOCR non è installato (pip install paddleocr)")
        import numpy as np
        o = settings.get("ocr") or {}
        lang = o.get("paddle_lang") or "it"
        img = _image(path, page, int(opts.get("dpi") or 300)).convert("RGB")
        res = self._ocr(lang).ocr(np.array(img))
        lines, words, confs = [], [], []
        for block in res or []:
            for item in block or []:
                try:
                    box, (txt, conf) = item[0], item[1]
                except (TypeError, ValueError, IndexError):
                    continue
                xs, ys = [pt[0] for pt in box], [pt[1] for pt in box]
                lines.append((min(ys), min(xs), txt))
                confs.append(float(conf))
                words.append({"t": txt, "c": round(float(conf), 3), "x": int(min(xs)), "y": int(min(ys)),
                              "w": int(max(xs) - min(xs)), "h": int(max(ys) - min(ys))})
        text = "\n".join(t for _, _, t in sorted(lines))
        return {"text": text, "conf": round(sum(confs) / len(confs), 3) if confs else 0.0, "by": f"paddleocr:{lang}",
                "words": words, "size": list(img.size)}


@register_ocr
class Remote(OcrEngine):
    id, label, local = "remote", "Servizio OCR tuo (HTTP)", True
    meters = ("ocr_page", "http_call")
    doc = "Un tuo server OCR (es. sulla workstation): Impostazioni › OCR › servizio remoto."

    def available(self, settings):
        o = settings.get("ocr") or {}
        return bool(o.get("remote_endpoint") and (settings.get("endpoints") or {}).get(o["remote_endpoint"]))

    def read(self, path, page, settings, opts):
        return PR.ocr_remote(path, page, settings, opts.get("lang") or "")


@register_ocr
class AI(OcrEngine):
    id, label, local = "ai", "Modello AI (profilo)", False
    meters = ("ocr_page", "ai_call")
    doc = "Qualsiasi profilo AI: modello con la vista, la tua workstation, cascata o confronto tra modelli."

    def available(self, settings):
        return PR.ai_enabled(settings, task="ocr")

    def read(self, path, page, settings, opts):
        return PR.ocr_ai(path, page, settings, opts.get("profile") or None)


@register_ocr
class Mock(OcrEngine):
    id, label = "mock", "Finto (solo prove)"
    doc = "Testo dai file .txt accanto agli originali."

    def read(self, path, page, settings, opts):   # the block reads the sidecar itself (it knows the input folder)
        raise PR.ProviderError("il motore finto si usa solo dal blocco OCR")


def order(settings: dict) -> list[str]:
    o = settings.get("ocr") or {}
    got = [e for e in (o.get("auto_order") or AUTO_ORDER) if e in ENGINES and e not in ("auto", "mock")]
    return got or AUTO_ORDER


def describe(settings: dict) -> dict:
    return {"engines": [e.describe(settings) for e in ENGINES.values()], "auto_order": order(settings),
            "escalate_below": float((settings.get("ocr") or {}).get("escalate_below") or 0)}
