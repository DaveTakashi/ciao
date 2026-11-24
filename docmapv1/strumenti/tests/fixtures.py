"""Sample documents made on the fly (no real data in the repository)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def font(size: int = 40):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf"):
        if Path(f).is_file():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default(size=size)


def page(lines: list[str], size=(1240, 1754), angle: float = 0.0, noise: bool = False) -> Image.Image:
    img = Image.new("L", size, 255)
    d = ImageDraw.Draw(img)
    y = 120
    for ln in lines:
        d.text((100, y), ln, fill=0, font=font(40))
        y += 70
    if noise:
        import random
        rnd = random.Random(1)
        for _ in range(3000):
            d.point((rnd.randrange(size[0]), rnd.randrange(size[1])), fill=0)
    if angle:
        img = img.rotate(angle, fillcolor=255, expand=False)
    return img


def blank(size=(1240, 1754)) -> Image.Image:
    return Image.new("L", size, 255)


def invoice(num: int, client: str = "Rossi Srl", total: str = "1.234,56") -> list[str]:
    return [f"FATTURA N. {num}", "Data 12/03/2024", f"Cliente: {client}", "Partita IVA 01234567897",
            f"Totale EUR {total}"]


def save_tiff(path: Path, pages: list[Image.Image], dpi: int = 300) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    pages[0].save(path, "TIFF", save_all=True, append_images=pages[1:], compression="tiff_lzw", dpi=(dpi, dpi))
    return path


def save_pdf(path: Path, pages: list[Image.Image], dpi: int = 150) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    rgb = [p.convert("RGB") for p in pages]
    rgb[0].save(path, "PDF", save_all=True, append_images=rgb[1:], resolution=float(dpi))
    return path


def text_pdf(path: Path, pages_text: list[list[str]]) -> Path:
    """A digital PDF with a real text layer, written by hand (no extra library): one Helvetica line per string."""
    path.parent.mkdir(parents=True, exist_ok=True)
    objs: list[bytes] = []
    kids = []
    n_pages = len(pages_text)
    # 1 catalog, 2 pages, 3 font, then per page: page object + content stream
    for i, lines in enumerate(pages_text):
        page_no, content_no = 4 + 2 * i, 5 + 2 * i
        kids.append(f"{page_no} 0 R")
        ops = ["BT", "/F1 14 Tf", "60 780 Td", "18 TL"]
        for ln in lines:
            esc = ln.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            ops.append(f"({esc}) Tj T*")
        ops.append("ET")
        stream = "\n".join(ops).encode("latin-1")
        objs.append((page_no, f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> "
                              f"/Contents {content_no} 0 R >>".encode()))
        objs.append((content_no, b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream"))
    objs = [(1, b"<< /Type /Catalog /Pages 2 0 R >>"),
            (2, f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {n_pages} >>".encode()),
            (3, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")] + objs
    objs.sort()
    out = bytearray(b"%PDF-1.4\n")
    offsets = {}
    for no, body in objs:
        offsets[no] = len(out)
        out += f"{no} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    size = max(offsets) + 1
    out += f"xref\n0 {size}\n0000000000 65535 f \n".encode()
    for no in range(1, size):
        out += f"{offsets[no]:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    path.write_bytes(bytes(out))
    return path
