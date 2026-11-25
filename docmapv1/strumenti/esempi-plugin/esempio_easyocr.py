"""Example plugin: an extra OCR engine (EasyOCR) without changing the program.

Copy this file into the plugin folder (Settings › AI shows it; default ``%APPDATA%\\DocMapStrumenti\\plugins``,
or ``ai.plugins_dir``), then ``pip install easyocr``. The engine appears in the OCR block («Motore: easyocr»), in
Settings › OCR and in ``python -m docmap_strumenti ai fornitori``; it can go in ``ocr.auto_order``.

Guide: docs/AI-FORNITORI.md §8.
"""

from __future__ import annotations

import importlib.util

from docmap_strumenti import providers as PR
from docmap_strumenti.ocr_engines import OcrEngine, page_image, register_ocr


@register_ocr
class EasyOCR(OcrEngine):
    id, label = "easyocr", "EasyOCR (sul PC, plugin)"
    doc = "pip install easyocr: 80+ lingue, GPU facoltativa."
    _readers: dict = {}

    def available(self, settings):
        return importlib.util.find_spec("easyocr") is not None

    def read(self, path, page, settings, opts):
        if not self.available(settings):
            raise PR.ProviderError("EasyOCR non è installato (pip install easyocr)")
        import easyocr   # optional dependency
        import numpy as np
        langs = tuple(((settings.get("ocr") or {}).get("easyocr_langs") or "it,en").split(","))
        if langs not in self._readers:
            self._readers[langs] = easyocr.Reader(list(langs))
        img = page_image(path, page, int(opts.get("dpi") or 300)).convert("RGB")
        words, confs = [], []
        for box, txt, conf in self._readers[langs].readtext(np.array(img)):
            xs, ys = [p[0] for p in box], [p[1] for p in box]
            words.append({"t": txt, "c": round(float(conf), 3), "x": int(min(xs)), "y": int(min(ys)),
                          "w": int(max(xs) - min(xs)), "h": int(max(ys) - min(ys))})
            confs.append(float(conf))
        words.sort(key=lambda w: (w["y"] // 20, w["x"]))
        return {"text": "\n".join(w["t"] for w in words), "conf": round(sum(confs) / len(confs), 3) if confs else 0.0,
                "by": "easyocr", "words": words, "size": list(img.size)}
