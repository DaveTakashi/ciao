"""Conversion and optimisation: any supported format to any other, and image clean-up for better OCR."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps

from .. import media as M
from ..items import item_vars, render
from ..registry import P, block
from .files import unique_path

TARGETS = ["pdf", "tiff", "png", "jpeg", "webp", "txt", "md", "csv", "xlsx", "json", "jsonl"]


def _ext(fmt: str) -> str:
    return {"tiff": "tif", "jpeg": "jpg"}.get(fmt, fmt)


@block("convert", "Converti", "conversione",
       help="Cambia formato: immagini ⇄ PDF ⇄ TIFF multipagina, PDF → immagini, testo letto → TXT o Markdown, "
            "tabelle CSV ⇄ Excel ⇄ JSON ⇄ Markdown. Il file convertito prosegue nella ricetta.",
       params=[P("to", "choice", "pdf", "Nuovo formato", choices=TARGETS, required=True),
               P("dpi", "int", 300, "Risoluzione (PDF → immagine)", min=50, max=1200),
               P("quality", "int", 85, "Qualità JPEG / WebP", min=10, max=100),
               P("compression", "choice", "auto", "Compressione TIFF", choices=["auto", "group4", "tiff_lzw", "tiff_deflate", "jpeg", "none"]),
               P("one_per_page", "bool", True, "Un file per pagina", "per PNG / JPEG / WebP da un file multipagina"),
               P("sheet", "str", "", "Foglio Excel da leggere", "vuoto = il primo"),
               P("delimiter", "str", ";", "Separatore CSV"),
               P("name", "template", "{name}", "Nome del file convertito")],
       meters=["page"])
def convert(it, p, ctx):
    to = p["to"]
    ext = _ext(to)
    name = render(p["name"], item_vars(it, ctx.vars))
    d = ctx.step_dir() / it.id
    src_kind = it.kind

    def dest(suffix=""):
        return unique_path(d / f"{name}{suffix}.{ext}")

    if to in ("txt", "md"):
        text = it.text
        if not text:
            if src_kind in ("text", "table", "doc", "pdf"):
                text = M.read_text(it.p)
            else:
                raise ValueError("questo file non ha testo: metti prima il passo «Leggi il testo (OCR)»")
        if to == "md" and src_kind == "table":
            body = M.markdown_table(M.read_table(it.p, p["sheet"] or None))
        elif to == "md":
            body = f"# {it.p.stem}\n\n" + text.replace("\f", "\n\n---\n\n")
        else:
            body = text
        out = dest()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(body, "utf-8")
        it.path = str(out)
        return it

    if to in ("csv", "xlsx", "json", "jsonl"):
        if src_kind != "table":
            if to in ("csv", "xlsx") and it.text:     # one line per row, cells split by tab / ; when present
                rows = [r.split("\t") if "\t" in r else r.split(";") for r in it.text.splitlines() if r.strip()]
            else:
                raise ValueError("per CSV / Excel / JSON serve una tabella (CSV, TSV, XLSX, JSON) o del testo letto")
        else:
            rows = M.read_table(it.p, p["sheet"] or None)
        out = M.write_table(rows, dest(), to, p["delimiter"] or ";")
        it.path = str(out)
        return it

    # image-like targets
    if src_kind not in ("image", "pdf"):
        if src_kind == "text" and to == "pdf":
            out = dest()
            text_to_pdf(M.read_text(it.p), out)
            it.path = str(out)
            return it
        raise ValueError(f"non so trasformare un file .{it.ext} in {to}")
    n = M.page_count(it.p)
    if it.ext == "pdf" and to == "pdf":
        out = dest()
        M.pdf_extract_pages(it.p, list(range(1, n + 1)), out)
        it.path = str(out)
        return it
    frames = [M.page_image(it.p, i, p["dpi"]) for i in range(1, n + 1)] if it.ext == "pdf" else M.open_frames(it.p)
    ctx.meter("page", len(frames))
    comp = "" if p["compression"] == "auto" else ("raw" if p["compression"] == "none" else p["compression"])
    if to in ("pdf", "tiff") or len(frames) == 1 or not p["one_per_page"]:
        out = M.save_images(frames, dest(), to, dpi=p["dpi"], quality=p["quality"], compression=comp)
        it.path, it.pages = str(out), (len(frames) if to in ("pdf", "tiff") else 1)
        return it
    out_items = []
    for i, fr in enumerate(frames, 1):
        child = it.child(f"{it.id}-p{i:03d}", it.path, page=i, pages=1)
        o = M.save_images([fr], unique_path(d / f"{name}_p{i:03d}.{ext}"), to, dpi=p["dpi"], quality=p["quality"])
        child.path = str(o)
        out_items.append(child)
    return out_items


def text_to_pdf(text: str, out: Path) -> None:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
    except ImportError:
        raise ValueError("per trasformare testo in PDF serve reportlab (pip install reportlab)") from None
    out.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(out), pagesize=A4)
    w, h = A4
    y = h - 50
    c.setFont("Helvetica", 10)
    for line in text.replace("\f", "\n").splitlines():
        while True:
            chunk, line = line[:100], line[100:]
            if y < 50:
                c.showPage()
                c.setFont("Helvetica", 10)
                y = h - 50
            c.drawString(40, y, chunk)
            y -= 13
            if not line:
                break
    c.save()


# -- image clean-up --------------------------------------------------------------------------------------------

def otsu(gray: Image.Image) -> int:
    hist = np.array(gray.histogram()[:256], dtype=float)
    total = hist.sum()
    if total == 0:
        return 128
    w = np.cumsum(hist)
    mu = np.cumsum(hist * np.arange(256))
    mt = mu[-1]
    with np.errstate(divide="ignore", invalid="ignore"):
        between = (mt * w / total - mu) ** 2 / (w * (total - w))
    between = np.nan_to_num(between)
    return int(np.argmax(between))


def deskew_angle(img: Image.Image, max_angle: float = 6.0, step: float = 0.25) -> float:
    """Angle (degrees) that makes the text lines horizontal: the rotation with the sharpest row profile."""
    g = img.convert("L")
    g.thumbnail((900, 900))
    t = otsu(g)
    a = (np.asarray(g) < t).astype(np.uint8) * 255
    base = Image.fromarray(a)
    best, best_score = 0.0, -1.0
    ang = -max_angle
    while ang <= max_angle + 1e-9:
        r = np.asarray(base.rotate(ang, resample=Image.NEAREST, fillcolor=0), dtype=np.float32)
        rows = r.sum(axis=1)
        score = float(np.var(np.diff(rows)))
        if score > best_score:
            best, best_score = ang, score
        ang += step
    return round(best, 2)


def clean_frame(img: Image.Image, p: dict) -> Image.Image:
    if p["rotate"]:
        img = img.rotate(-p["rotate"], expand=True, fillcolor="white")
    if p["crop"]:
        w, h = img.size
        m = p["crop"]
        img = img.crop((int(w * m), int(h * m), int(w * (1 - m)), int(h * (1 - m))))
    if p["deskew"]:
        ang = deskew_angle(img)
        if abs(ang) >= 0.2:
            img = img.convert("RGB" if img.mode not in ("L", "RGB") else img.mode).rotate(ang, resample=Image.BICUBIC,
                                                                                         expand=True, fillcolor="white")
    if p["grayscale"] or p["bw"] or p["autocontrast"] or p["denoise"]:
        img = img.convert("L")
    if p["autocontrast"]:
        img = ImageOps.autocontrast(img, cutoff=1)
    if p["denoise"]:
        img = img.filter(ImageFilter.MedianFilter(3))
    if p["sharpen"]:
        img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=120, threshold=3))
    if p["bw"]:
        t = otsu(img) if p["bw_threshold"] <= 0 else p["bw_threshold"]
        img = img.point(lambda v: 255 if v > t else 0).convert("1")
    if p["max_px"]:
        img.thumbnail((p["max_px"], p["max_px"]), Image.LANCZOS)
    return img


@block("image", "Migliora le immagini", "conversione",
       help="Prepara le scansioni: raddrizza (storte fino a 6°), ruota, ritaglia i bordi, scala di grigi, bianco e nero "
            "con soglia automatica, contrasto, pulizia dei puntini, nitidezza, riduzione. Migliora molto l'OCR delle "
            "scansioni brutte e riduce il peso dei file.",
       params=[P("deskew", "bool", True, "Raddrizza"),
               P("rotate", "int", 0, "Ruota (gradi, senso orario)", choices=None, min=-360, max=360),
               P("crop", "float", 0.0, "Ritaglia i bordi (frazione)", "0.02 = 2% per lato", min=0, max=0.3),
               P("grayscale", "bool", False, "Scala di grigi"),
               P("bw", "bool", False, "Bianco e nero"),
               P("bw_threshold", "int", 0, "Soglia del bianco e nero", "0 = automatica", min=0, max=255),
               P("autocontrast", "bool", False, "Contrasto automatico"),
               P("denoise", "bool", False, "Togli i puntini"),
               P("sharpen", "bool", False, "Nitidezza"),
               P("max_px", "int", 0, "Lato massimo (pixel)", "0 = come l'originale", min=0),
               P("dpi", "int", 300, "Risoluzione (PDF → immagine)", min=50, max=1200),
               P("to", "choice", "same", "Formato", choices=["same", "tiff", "png", "jpeg", "pdf"])],
       meters=["page"])
def image(it, p, ctx):
    if it.kind not in ("image", "pdf"):
        raise ValueError("non è un'immagine né un PDF")
    n = M.page_count(it.p)
    frames = [M.page_image(it.p, i, p["dpi"]) for i in range(1, n + 1)] if it.ext == "pdf" else M.open_frames(it.p)
    frames = [clean_frame(f, p) for f in frames]
    ctx.meter("page", len(frames))
    to = p["to"]
    if to == "same":
        to = "tiff" if it.ext in ("tif", "tiff", "pdf") and len(frames) > 1 else ("pdf" if it.ext == "pdf" else it.ext)
        to = {"jpg": "jpeg", "gif": "png", "bmp": "png"}.get(to, to)
    if to in ("jpeg", "png") and len(frames) > 1:
        to = "tiff"
    out = M.save_images(frames, unique_path(ctx.step_dir() / it.id / f"{it.p.stem}.{_ext(to)}"), to, dpi=p["dpi"])
    it.path = str(out)
    return it
