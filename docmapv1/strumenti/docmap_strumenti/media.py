"""Files on disk: pages of PDF and TIFF, images, text and tables. One place for every format detail.

Required: Pillow, pypdf, openpyxl. Optional: pypdfium2 (fast, faithful rendering of PDF pages to images; without it
a scanned page gives back its embedded image, then ``pdftoppm`` is tried), python-docx (text of .docx).
"""

from __future__ import annotations

import csv
import io
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageOps, ImageSequence

import logging

logging.getLogger("pypdf").setLevel(logging.ERROR)   # damaged PDFs are reported per file, not printed
Image.MAX_IMAGE_PIXELS = 400_000_000   # large A0 scans are legitimate here; decompression bombs stay limited


class MediaError(RuntimeError):
    pass


def _pypdf():
    import pypdf
    return pypdf


def has_pdfium() -> bool:
    try:
        import pypdfium2  # noqa: F401
        return True
    except Exception:
        return False


# -- pages -----------------------------------------------------------------------------------------------------

def page_count(path: Path) -> int:
    path = Path(path)
    e = path.suffix.lower()
    if e == ".pdf":
        try:
            return len(_pypdf().PdfReader(str(path)).pages)
        except Exception as ex:
            raise MediaError(f"PDF illeggibile: {ex}") from None
    if e in (".tif", ".tiff", ".gif"):
        with Image.open(path) as im:
            return getattr(im, "n_frames", 1)
    return 1


def open_frames(path: Path) -> list[Image.Image]:
    """Every frame of an image (multipage TIFF / GIF) as independent RGB/L/1 images, EXIF orientation applied."""
    out = []
    with Image.open(path) as im:
        for fr in ImageSequence.Iterator(im):
            f = fr.copy()
            if f.mode not in ("1", "L", "RGB", "RGBA", "CMYK", "LA"):
                f = f.convert("RGB")
            out.append(f)
    if len(out) == 1:
        try:
            out[0] = ImageOps.exif_transpose(out[0])
        except Exception:
            pass
    return out


def render_pdf_page(path: Path, page: int, dpi: int = 200) -> Image.Image:
    """Page (1-based) of a PDF as an image."""
    path = Path(path)
    if has_pdfium():
        import pypdfium2 as pdfium
        doc = pdfium.PdfDocument(str(path))
        try:
            pg = doc[page - 1]
            img = pg.render(scale=dpi / 72).to_pil()
            return img.convert("RGB")
        finally:
            doc.close()
    # a scanned page is usually one big image: take it as it is
    try:
        r = _pypdf().PdfReader(str(path))
        imgs = list(r.pages[page - 1].images)
        if len(imgs) == 1:
            return Image.open(io.BytesIO(imgs[0].data)).copy()
    except Exception:
        pass
    exe = shutil.which("pdftoppm")
    if exe:
        with tempfile.TemporaryDirectory() as td:
            subprocess.run([exe, "-r", str(dpi), "-f", str(page), "-l", str(page), "-png", str(path), str(Path(td) / "p")],
                           check=True, capture_output=True, timeout=300)
            pngs = sorted(Path(td).glob("p*.png"))
            if pngs:
                with Image.open(pngs[0]) as im:
                    return im.copy()
    raise MediaError("per trasformare le pagine PDF in immagini serve pypdfium2 (pip install pypdfium2)")


def page_image(path: Path, page: int = 1, dpi: int = 200) -> Image.Image:
    path = Path(path)
    if path.suffix.lower() == ".pdf":
        return render_pdf_page(path, page, dpi)
    frames = open_frames(path)
    if page < 1 or page > len(frames):
        raise MediaError(f"pagina {page} inesistente (il file ne ha {len(frames)})")
    return frames[page - 1]


def pdf_text(path: Path, page: int | None = None) -> str:
    r = _pypdf().PdfReader(str(path))
    pages = [r.pages[page - 1]] if page else r.pages
    return "\n\f".join((p.extract_text() or "") for p in pages)


def pdf_extract_pages(path: Path, pages: list[int], out: Path) -> Path:
    pypdf = _pypdf()
    r = pypdf.PdfReader(str(path))
    w = pypdf.PdfWriter()
    for n in pages:
        w.add_page(r.pages[n - 1])
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "wb") as f:
        w.write(f)
    return out


def pdf_merge(paths: list[Path], out: Path) -> Path:
    pypdf = _pypdf()
    w = pypdf.PdfWriter()
    for p in paths:
        for pg in pypdf.PdfReader(str(p)).pages:
            w.add_page(pg)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "wb") as f:
        w.write(f)
    return out


def save_images(frames: list[Image.Image], out: Path, fmt: str, dpi: int | None = None, quality: int = 85,
                compression: str = "") -> Path:
    """Saves one or more images: pdf / tiff keep every page; png / jpeg / webp / bmp take the first."""
    fmt = fmt.lower()
    out.parent.mkdir(parents=True, exist_ok=True)
    kw: dict = {}
    if dpi:
        kw["dpi"] = (dpi, dpi)
    if fmt == "pdf":
        fr = [f.convert("RGB") if f.mode not in ("RGB", "L", "1") else f for f in frames]
        fr[0].save(out, "PDF", save_all=True, append_images=fr[1:], resolution=float(dpi or 200))
    elif fmt in ("tif", "tiff"):
        comp = compression or ("group4" if all(f.mode == "1" for f in frames) else "tiff_lzw")
        fr = frames if comp != "group4" else [f.convert("1") for f in frames]
        if comp == "jpeg":
            fr = [f.convert("RGB") for f in fr]
        fr[0].save(out, "TIFF", save_all=True, append_images=fr[1:], compression=comp, **kw)
    elif fmt in ("jpg", "jpeg"):
        frames[0].convert("RGB").save(out, "JPEG", quality=quality, optimize=True, **kw)
    elif fmt == "png":
        frames[0].save(out, "PNG", optimize=True, **kw)
    elif fmt == "webp":
        frames[0].save(out, "WEBP", quality=quality)
    elif fmt == "bmp":
        frames[0].convert("RGB").save(out, "BMP")
    else:
        raise MediaError(f"formato immagine non gestito: {fmt}")
    return out


def thumbnail(path: Path, page: int = 1, max_px: int = 1600) -> bytes:
    """PNG of a page, for the preview and the review screen (text files give a white page with the first lines)."""
    path = Path(path)
    try:
        img = page_image(path, page or 1, dpi=110) if path.suffix.lower() in (".pdf", ".tif", ".tiff", ".gif") \
            else open_frames(path)[0]
    except Exception:
        from PIL import ImageDraw
        img = Image.new("RGB", (900, 1200), "white")
        d = ImageDraw.Draw(img)
        try:
            txt = read_text(path)[:3000]
        except Exception:
            txt = path.name
        y = 20
        for line in txt.splitlines()[:60]:
            d.text((20, y), line[:110], fill="black")
            y += 18
    img = img.convert("RGB") if img.mode not in ("RGB", "L") else img
    img.thumbnail((max_px, max_px))
    b = io.BytesIO()
    img.save(b, "PNG", optimize=False)
    return b.getvalue()


# -- text and tables ---------------------------------------------------------------------------------------------

def read_text(path: Path) -> str:
    path = Path(path)
    e = path.suffix.lower()
    if e == ".pdf":
        return pdf_text(path)
    if e == ".docx":
        try:
            import docx
        except ImportError:
            raise MediaError("per leggere i .docx serve python-docx") from None
        return "\n".join(p.text for p in docx.Document(str(path)).paragraphs)
    if e in (".xlsx", ".xlsm", ".csv", ".tsv", ".json", ".jsonl"):
        rows = read_table(path)
        return "\n".join("\t".join("" if c is None else str(c) for c in r) for r in rows)
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def sniff_delimiter(sample: str) -> str:
    try:
        return csv.Sniffer().sniff(sample, delimiters=";,\t|").delimiter
    except csv.Error:
        return ";" if sample.count(";") >= sample.count(",") else ","


def read_table(path: Path, sheet: str | None = None) -> list[list]:
    """Rows (first row = header) of a CSV / TSV / XLSX / JSON (list of objects or of lists) / JSONL file."""
    path = Path(path)
    e = path.suffix.lower()
    if e in (".xlsx", ".xlsm"):
        import openpyxl
        wb = openpyxl.load_workbook(str(path), read_only=True, data_only=True)
        try:
            ws = wb[sheet] if sheet and sheet in wb.sheetnames else wb.worksheets[0]
            rows = [list(r) for r in ws.iter_rows(values_only=True)]
        finally:
            wb.close()
        while rows and all(c in (None, "") for c in rows[-1]):
            rows.pop()
        return rows
    if e in (".json", ".jsonl"):
        txt = read_text_plain(path)
        data = [json.loads(line) for line in txt.splitlines() if line.strip()] if e == ".jsonl" else json.loads(txt)
        if isinstance(data, dict):
            data = data.get("rows") or data.get("items") or [data]
        if data and isinstance(data[0], dict):
            keys: list = []
            for d in data:
                for k in d:
                    if k not in keys:
                        keys.append(k)
            return [keys] + [[d.get(k) for k in keys] for d in data]
        return [list(r) if isinstance(r, list) else [r] for r in data]
    txt = read_text_plain(path)
    delim = "\t" if e == ".tsv" else sniff_delimiter(txt[:4000])
    return [r for r in csv.reader(io.StringIO(txt), delimiter=delim)]


def read_text_plain(path: Path) -> str:
    raw = Path(path).read_bytes()
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1")


def write_table(rows: list[list], out: Path, fmt: str, delimiter: str = ";") -> Path:
    fmt = fmt.lower()
    out.parent.mkdir(parents=True, exist_ok=True)
    if fmt in ("xlsx", "xlsm"):
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        for r in rows:
            ws.append([_cell(c) for c in r])
        if rows:
            ws.freeze_panes = "A2"
            for i, col in enumerate(zip(*[r + [""] * (len(rows[0]) - len(r)) for r in rows[:200]]), 1):
                width = min(60, max(8, max(len(str(c or "")) for c in col) + 2))
                ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = width
        wb.save(str(out))
    elif fmt in ("csv", "tsv"):
        with open(out, "w", newline="", encoding="utf-8-sig") as f:
            csv.writer(f, delimiter="\t" if fmt == "tsv" else delimiter).writerows(rows)
    elif fmt == "json":
        head = [str(h) for h in rows[0]] if rows else []
        data = [dict(zip(head, r)) for r in rows[1:]]
        out.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str), "utf-8")
    elif fmt == "jsonl":
        head = [str(h) for h in rows[0]] if rows else []
        out.write_text("".join(json.dumps(dict(zip(head, r)), ensure_ascii=False, default=str) + "\n" for r in rows[1:]), "utf-8")
    elif fmt in ("md", "markdown"):
        out.write_text(markdown_table(rows), "utf-8")
    else:
        raise MediaError(f"formato tabella non gestito: {fmt}")
    return out


def _cell(c):
    if c is None or isinstance(c, (int, float, bool)):
        return c
    s = str(c)
    return "'" + s if s[:1] in ("=", "+", "-", "@") and not s[1:2].isdigit() else s   # no formulas from data


def markdown_table(rows: list[list]) -> str:
    if not rows:
        return ""
    w = max(len(r) for r in rows)
    rows = [[("" if c is None else str(c)).replace("|", "\\|").replace("\n", " ") for c in r] + [""] * (w - len(r)) for r in rows]
    out = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * w]
    out += ["| " + " | ".join(r) + " |" for r in rows[1:]]
    return "\n".join(out) + "\n"
