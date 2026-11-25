"""Page blocks: split a multipage PDF / TIFF into pages, cut it into documents (segments), merge files together."""

from __future__ import annotations

import re
from pathlib import Path

from PIL import ImageStat

from .. import media as M
from ..ocr_engines import ENGINE_CHOICES
from ..items import item_vars, render
from ..registry import P, block
from .files import unique_path

FORMATS = ["same", "pdf", "tiff", "png", "jpeg"]


def parse_ranges(spec: str, total: int) -> list[int]:
    """``all`` · ``1-3,5`` · ``-2`` (last two) · ``odd`` / ``even`` · ``2-`` (from 2 to the end)."""
    spec = (spec or "all").strip().lower()
    if spec in ("all", "tutte", "*", ""):
        return list(range(1, total + 1))
    if spec in ("odd", "dispari"):
        return list(range(1, total + 1, 2))
    if spec in ("even", "pari"):
        return list(range(2, total + 1, 2))
    if re.fullmatch(r"-\d+", spec):
        return list(range(max(1, total - int(spec[1:]) + 1), total + 1))
    out = []
    for part in spec.split(","):
        part = part.strip()
        m = re.fullmatch(r"(\d+)?\s*-\s*(\d+)?", part)
        if m:
            a = int(m.group(1) or 1)
            b = int(m.group(2) or total)
            out += list(range(a, min(b, total) + 1))
        elif part.isdigit():
            if 1 <= int(part) <= total:
                out.append(int(part))
        elif part:
            raise ValueError(f"pagine «{part}» non capite")
    return out


def _target(it, fmt: str) -> str:
    if fmt != "same":
        return "tif" if fmt == "tiff" else ("jpg" if fmt == "jpeg" else fmt)
    return "pdf" if it.ext == "pdf" else ("tif" if it.ext in ("tif", "tiff") else it.ext)


def write_pages(it, pages: list[int], out: Path, fmt: str, dpi: int) -> Path:
    """Pages of the item's file into ONE file of format ``fmt`` (pdf / tif / png / jpg)."""
    if it.ext == "pdf" and fmt == "pdf":
        return M.pdf_extract_pages(it.p, pages, out)
    frames = [M.page_image(it.p, n, dpi) for n in pages] if it.ext == "pdf" else \
        [f for i, f in enumerate(M.open_frames(it.p), 1) if i in pages]
    return M.save_images(frames, out, fmt, dpi=dpi)


@block("split_pages", "Dividi in pagine", "pagine",
       help="Un PDF o TIFF multipagina diventa un file per pagina (o solo le pagine scelte). Ogni pagina prosegue da sola "
            "nella ricetta con la variabile {page}.",
       params=[P("pages", "str", "all", "Pagine", "all, 1-3,5, -2 (ultime due), odd, even"),
               P("format", "choice", "same", "Formato delle pagine", choices=FORMATS),
               P("dpi", "int", 300, "Risoluzione (PDF → immagine)", min=50, max=1200),
               P("name", "template", "{src_name}_p{page:03}", "Nome di ogni pagina")],
       meters=["page"])
def split_pages(it, p, ctx):
    total = M.page_count(it.p)
    sel = parse_ranges(p["pages"], total)
    if total <= 1 and sel == [1] and p["format"] == "same":
        it.page, it.pages = it.page or 1, 1
        return it
    fmt = _target(it, p["format"])
    out = []
    for n in sel:
        ctx.check()
        child = it.child(f"{it.id}-p{n:03d}", it.path, page=n, pages=1)
        name = render(p["name"], item_vars(child, ctx.vars)) + "." + fmt
        dest = unique_path(ctx.step_dir() / it.id / name)
        write_pages(it, [n], dest, fmt, p["dpi"])
        child.path = str(dest)
        child.meta = {**it.meta, "parent_pages": total}
        ctx.meter("page")
        out.append(child)
    return out


def is_blank(img, threshold: float = 0.999, margin: float = 0.06) -> bool:
    """True when (almost) every pixel inside the margins is white, after removing scanner dust."""
    from PIL import ImageFilter
    g = img.convert("L")
    w, h = g.size
    g = g.crop((int(w * margin), int(h * margin), int(w * (1 - margin)), int(h * (1 - margin))))
    g.thumbnail((900, 900))
    g = g.filter(ImageFilter.MedianFilter(3))
    dark = sum(g.histogram()[:160])
    total = g.size[0] * g.size[1]
    return total > 0 and (1 - dark / total) >= threshold and ImageStat.Stat(g).mean[0] > 200


@block("segment", "Dividi in documenti", "pagine",
       help="Taglia un file con tanti documenti dentro (es. un PDF scansionato di 300 pagine con 80 fatture) in documenti "
            "separati: ogni N pagine, a ogni pagina bianca di separazione, dove compare una parola o una regola "
            "(es. «Fattura n.»), oppure quando cambia un valore letto (es. il numero fattura).",
       params=[P("by", "choice", "keyword", "Come tagliare", choices=["every", "blank", "keyword", "value_change"]),
               P("every", "int", 1, "Ogni quante pagine", min=1),
               P("pattern", "regex", "", "Parola o regola che apre un documento",
                 "per «keyword»: la pagina che la contiene inizia un documento; per «value_change»: il gruppo (…) è il valore"),
               P("blank_threshold", "float", 0.999, "Quanto bianca (pagina vuota)", "0.999 = meno di un punto nero su mille", min=0.9, max=1),
               P("drop_separators", "bool", True, "Togli le pagine bianche di separazione"),
               P("engine", "choice", "auto", "Lettura del testo", choices=ENGINE_CHOICES),
               P("format", "choice", "same", "Formato dei documenti", choices=FORMATS),
               P("dpi", "int", 300, "Risoluzione (PDF → immagine)", min=50, max=1200),
               P("field", "field", "", "Salva il valore in un campo", "per «value_change»: es. numero"),
               P("name", "template", "{src_name}_doc{seg:03}", "Nome di ogni documento")],
       meters=["page", "ocr_page"])
def segment(it, p, ctx):
    from .reading import page_text
    total = M.page_count(it.p)
    groups: list[dict] = []
    cur: dict | None = None
    for n in range(1, total + 1):
        ctx.check()
        start, drop, value = False, False, None
        if p["by"] == "every":
            start = (n - 1) % p["every"] == 0
        elif p["by"] == "blank":
            if is_blank(M.page_image(it.p, n, 100), p["blank_threshold"]):
                if p["drop_separators"]:
                    cur = None
                    continue
                drop = True
            start = cur is None
        else:
            if not p["pattern"]:
                raise ValueError("serve la parola o regola che apre un documento")
            txt, _ = page_text(it, n, ctx, p["engine"])
            m = re.search(p["pattern"], txt, re.I | re.M)
            if p["by"] == "keyword":
                start = m is not None or cur is None
            else:
                value = (m.group(1) if m and m.groups() else (m.group(0) if m else None))
                value = value.strip() if value else None
                start = cur is None or (value is not None and value != cur.get("value"))
        if start or cur is None:
            cur = {"pages": [], "value": value}
            groups.append(cur)
        if not drop or not p["drop_separators"]:
            cur["pages"].append(n)
        if drop:
            cur = None
    groups = [g for g in groups if g["pages"]]
    fmt = _target(it, p["format"])
    out = []
    for i, g in enumerate(groups, 1):
        child = it.child(f"{it.id}-s{i:03d}", it.path, page=g["pages"][0], pages=len(g["pages"]))
        child.group = f"{it.id}-s{i:03d}"
        child.meta = {**it.meta, "vars": {**(it.meta.get("vars") or {}), "seg": i, "segs": len(groups)},
                      "pages_of_src": g["pages"]}
        if p["field"] and g["value"] is not None:
            child.set_field(p["field"], g["value"], 0.9, "segment")
        name = render(p["name"], item_vars(child, ctx.vars)) + "." + fmt
        dest = unique_path(ctx.step_dir() / it.id / name)
        write_pages(it, g["pages"], dest, fmt, p["dpi"])
        child.path = str(dest)
        child.text = ""
        ctx.meter("page", len(g["pages"]))
        out.append(child)
    return out


@block("merge", "Unisci", "pagine", kind="batch",
       help="Unisce in un solo file (PDF o TIFF multipagina) i file con la stessa chiave, es. tutte le pagine con lo "
            "stesso {numero} o tutti i file della stessa cartella ({src_dir}).",
       params=[P("key", "template", "{src_dir}", "Chiave per raggruppare", "es. {numero}, {cliente}-{anno}, {src_name}"),
               P("format", "choice", "pdf", "Formato del file unito", choices=["pdf", "tiff"]),
               P("order", "choice", "name", "Ordine delle pagine", choices=["name", "page", "input"]),
               P("dpi", "int", 300, "Risoluzione", min=50, max=1200),
               P("name", "template", "{key}", "Nome del file unito")],
       meters=["page"])
def merge(items, p, ctx):
    from ..engine import natural_key
    groups: dict[str, list] = {}
    for it in items:
        k = render(p["key"], item_vars(it, ctx.vars), path_safe=False) if p["key"] else "tutto"
        groups.setdefault(k or "senza-chiave", []).append(it)
    out = []
    fmt = "tif" if p["format"] == "tiff" else "pdf"
    for k, grp in groups.items():
        ctx.check()
        if p["order"] == "name":
            grp = sorted(grp, key=lambda i: natural_key(i.src + f"#{i.page or 0:05d}"))
        elif p["order"] == "page":
            grp = sorted(grp, key=lambda i: (i.page or 0, natural_key(i.src)))
        first = grp[0]
        child = first.child(f"m{len(out) + 1:05d}", first.path, page=None, group=k)
        child.meta = {**first.meta, "merged": [i.src + (f"#p{i.page}" if i.page else "") for i in grp],
                      "vars": {**(first.meta.get("vars") or {}), "key": k}}
        name = render(p["name"], item_vars(child, {**ctx.vars, "key": k})) + "." + fmt
        dest = unique_path(ctx.step_dir() / name)
        if fmt == "pdf" and all(i.ext == "pdf" for i in grp):
            M.pdf_merge([i.p for i in grp], dest)
        else:
            frames = []
            for i in grp:
                n = M.page_count(i.p)
                frames += [M.page_image(i.p, x, p["dpi"]) for x in range(1, n + 1)]
            M.save_images(frames, dest, fmt, dpi=p["dpi"])
        child.path = str(dest)
        child.pages = M.page_count(dest)
        child.text = "\n\f".join(i.text for i in grp if i.text)
        for i in grp[1:]:       # fields of later pages fill the gaps of the first one
            for fk, fv in i.fields.items():
                child.fields.setdefault(fk, fv)
            for t in i.tags:
                if t not in child.tags:
                    child.tags.append(t)
            if i.status == "review":
                for fl in i.flags:
                    child.flag(fl)
        ctx.meter("page", child.pages or 0)
        out.append(child)
    return out
