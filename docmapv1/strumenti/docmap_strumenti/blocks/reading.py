"""Reading blocks: OCR / text of a file, and keyword search in what was read."""

from __future__ import annotations

import difflib
import re
import unicodedata

from .. import media as M
from .. import ocr_engines as OE
from .. import providers as PR
from ..items import REVIEW
from ..registry import P, block

ENGINES = OE.ENGINE_CHOICES   # auto + every registered engine (plugins included): ocr_engines.py


def _mock_text(it, ctx, page) -> str:
    o = ctx.settings.get("ocr") or {}
    if o.get("mock_text") is not None:
        t = o["mock_text"]
        return t(it, page) if callable(t) else str(t)
    # a sidecar text file next to the original («fattura1.tif.txt» or «fattura1.txt»)
    if ctx.input_dir:
        src = (ctx.input_dir / it.src)
        for cand in (src.with_name(src.name + ".txt"), src.with_suffix(".txt")):
            if cand.is_file() and cand != src:
                pages = M.read_text_plain(cand).split("\f")
                n = page or it.page or 1
                return pages[min(n, len(pages)) - 1] if pages else ""
    return ""


def page_text(it, page: int, ctx, engine: str = "auto", lang: str = "", psm: int = 3, dpi: int = 300,
              min_chars: int = 20, profile: str = "") -> tuple[str, dict]:
    """Text of ONE page of the item's file with the chosen engine (registry ``ocr_engines``). Returns (text, info).
    ``auto``: the text inside the file if there is enough, then the engines of ``ocr.auto_order`` that are available;
    with ``ocr.escalate_below`` > 0 the next engine reads again while the confidence stays below it (best kept)."""
    s = ctx.settings
    path = it.p
    if engine in ("", "auto"):   # «auto» in a recipe = the engine chosen in Settings › OCR (itself «auto» by default)
        engine = str((s.get("ocr") or {}).get("engine") or "auto")
    if engine in ("auto", "text") and it.kind in ("pdf", "text", "table", "doc"):
        t = PR.native_text(path, page if it.kind == "pdf" else None)
        if engine == "text" or len(t.strip()) >= min_chars:
            return t, {"conf": 1.0 if t.strip() else 0.0, "by": "text"}
    if engine == "text":
        return "", {"conf": 0.0, "by": "text"}
    if engine == "mock":
        ctx.meter("ocr_page")
        t = _mock_text(it, ctx, page)
        return t, {"conf": float((s.get("ocr") or {}).get("mock_conf", 0.9)), "by": "mock"}
    if it.kind not in ("pdf", "image"):
        return "", {"conf": 0.0, "by": engine}
    opts = {"lang": lang, "psm": psm, "dpi": dpi, "profile": profile}
    if engine != "auto":
        e = OE.ENGINES.get(engine)
        if not e:
            raise ValueError(f"motore OCR sconosciuto: {engine}")
        return _read(e, it, page, ctx, opts)
    cands = [OE.ENGINES[n] for n in OE.order(s) if n != "text" and OE.ENGINES[n].available(s)]
    if not cands:
        raise PR.ProviderError("nessun OCR disponibile: installa Tesseract o configura un servizio o l'AI (Impostazioni)")
    below = float((s.get("ocr") or {}).get("escalate_below") or 0)
    best, tried = None, []
    for e in cands:
        try:
            t, info = _read(e, it, page, ctx, opts)
        except PR.ProviderError as err:
            tried.append(f"{e.id}: {err}")
            if best is None and e is cands[-1]:
                raise PR.ProviderError("; ".join(tried)) from None
            continue
        if best is None or (info.get("conf") or 0) > (best[1].get("conf") or 0):
            best = (t, info)
        if not below or (info.get("conf") is not None and info["conf"] >= below):
            break
    if best is None:
        raise PR.ProviderError("; ".join(tried))
    if len(tried) or below:
        best[1]["tried"] = tried
    return best


def _read(e, it, page, ctx, opts) -> tuple[str, dict]:
    for m in e.meters:
        ctx.meter(m)
    r = e.read(it.p, page, ctx.settings, opts)
    return r.get("text") or "", r


@block("ocr", "Leggi il testo (OCR)", "lettura",
       help="Legge il testo di ogni pagina: prima quello già dentro il file (PDF digitali, Word, Excel, TXT), poi l'OCR "
            "(Tesseract sul PC, un servizio OCR tuo sul server, o un modello AI per dattiloscritti e scansioni difficili). "
            "Salva il testo e la sua affidabilità per i passi dopo.",
       params=[P("engine", "choice", "auto", "Motore", "auto = testo del file → Tesseract → PaddleOCR → servizio → AI (ordine in Impostazioni › OCR)", choices=ENGINES),
               P("lang", "str", "", "Lingue", "es. ita+eng (vuoto = Impostazioni)"),
               P("pages", "str", "all", "Pagine da leggere", "all, 1, 1-2, -1 (ultima)"),
               P("psm", "int", 3, "Disposizione (Tesseract)", "3 = automatica, 6 = un blocco, 11 = testo sparso", min=0, max=13),
               P("dpi", "int", 300, "Risoluzione di lettura", min=100, max=600),
               P("min_chars", "int", 20, "Testo minimo per fidarsi del file", min=0),
               P("min_conf", "float", 0.0, "Affidabilità minima", "sotto questa soglia il file va a verifica (0 = mai)", min=0, max=1),
               P("save_txt", "bool", False, "Salva anche il testo (.txt) accanto"),
               P("profile", "str", "", "Profilo AI (motore AI)", "vuoto = Impostazioni › OCR; es. ocr, confronto")],
       meters=["ocr_page", "ai_call", "http_call"])
def ocr(it, p, ctx):
    from .pages import parse_ranges
    total = M.page_count(it.p) if it.kind in ("pdf", "image") else 1
    pages = parse_ranges(p["pages"], total)
    texts, confs, bys = [], [], set()
    words = None
    for n in pages:
        ctx.check()
        t, info = page_text(it, n, ctx, p["engine"], p["lang"], p["psm"], p["dpi"], p["min_chars"], p.get("profile") or "")
        texts.append(t)
        if info.get("conf") is not None:
            confs.append(float(info["conf"]))
        bys.add(info.get("by", ""))
        if words is None and info.get("words"):
            words = {"page": n, "size": info.get("size"), "words": info["words"][:4000]}
    it.text = "\n\f".join(texts)
    it.text_conf = round(sum(confs) / len(confs), 3) if confs else None
    it.text_by = ",".join(sorted(b for b in bys if b))
    it.pages = it.pages or total
    if words:
        it.meta["words"] = words
    if p["min_conf"] and (it.text_conf or 0) < p["min_conf"]:
        it.flag(f"testo poco leggibile ({int((it.text_conf or 0) * 100)}%)")
    if not it.text.strip():
        it.flag("nessun testo letto")
    if p["save_txt"]:
        out = ctx.step_dir() / it.id / (it.p.stem + ".txt")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(it.text, "utf-8")
        it.meta["txt"] = str(out)
    return it


def fold(s: str) -> str:
    """Lower case without accents (so «Città» matches «citta»)."""
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def find_keyword(text: str, kw: str, whole: bool = True, fuzzy: float = 0.0) -> list[tuple[int, int, float]]:
    """Occurrences of ``kw`` in ``text`` (accents and case ignored), as (start, end, score)."""
    t, k = fold(text), fold(kw).strip()
    if not k:
        return []
    pat = (r"(?<!\w)" + re.escape(k) + r"(?!\w)") if whole else re.escape(k)
    hits = [(m.start(), m.end(), 1.0) for m in re.finditer(pat, t)]
    if hits or fuzzy <= 0 or len(k) < 4:
        return hits
    n = len(k.split())
    toks = [(m.start(), m.end()) for m in re.finditer(r"\w+", t)]
    for i in range(len(toks) - n + 1):
        a, b = toks[i][0], toks[i + n - 1][1]
        r = difflib.SequenceMatcher(None, t[a:b], k).ratio()
        if r >= fuzzy:
            hits.append((a, b, round(r, 3)))
    return hits


@block("search", "Cerca parole", "lettura",
       help="Cerca parole o frasi nel testo letto (maiuscole e accenti non contano; con «Tolleranza» trova anche parole "
            "lette male dall'OCR). Salva quali ha trovato, con il pezzo di testo intorno, e può aggiungerle come tag.",
       params=[P("keywords", "list", [], "Parole da cercare", "una per riga o separate da virgola", required=True),
               P("mode", "choice", "any", "Basta", choices=["any", "all"]),
               P("whole_word", "bool", True, "Parola intera"),
               P("fuzzy", "float", 0.0, "Tolleranza errori OCR", "0 = esatta, 0.85 = trova «fatlura» per «fattura»", min=0, max=1),
               P("field", "field", "trovate", "Campo con le parole trovate"),
               P("add_tags", "bool", False, "Aggiungi come tag"),
               P("on_miss", "choice", "keep", "Se non trova", choices=["keep", "skip", "review"])])
def search(it, p, ctx):
    found, ctxs, best = [], [], []
    for kw in p["keywords"]:
        hits = find_keyword(it.text, kw, p["whole_word"], p["fuzzy"])
        if hits:
            found.append(kw)
            a, b, sc = max(hits, key=lambda h: h[2])
            best.append(sc)
            ctxs.append({"kw": kw, "n": len(hits), "score": sc, "ctx": it.text[max(0, a - 60): b + 60].replace("\n", " ")})
    ok = bool(found) if p["mode"] == "any" else len(found) == len(p["keywords"])
    it.set_field(p["field"], ", ".join(found), round(min(best), 3) if best else (1.0 if not found else None), "search")
    it.meta.setdefault("matches", []).extend(ctxs)
    if p["add_tags"]:
        for kw in found:
            if kw not in it.tags:
                it.tags.append(kw)
    if not ok:
        if p["on_miss"] == "skip":
            it.status = "skip"
        elif p["on_miss"] == "review":
            it.flag("parole non trovate", REVIEW)
    return it
