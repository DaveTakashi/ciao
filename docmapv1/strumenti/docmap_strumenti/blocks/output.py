"""Output blocks: put files into the output folder tree, and write a report."""

from __future__ import annotations

import os
import re
import shutil
from pathlib import Path

from .. import media as M
from ..items import ERROR, PATH_VARS, REVIEW, TemplateError, render
from ..registry import P, block
from .files import unique_path, vars_with_counter


def whole(it) -> bool:
    """The item is still a whole input file (not a page, a segment or a merge): it has an original to copy."""
    return "-" not in it.id and not it.id.startswith("m")


def _inside(base: Path, p: Path) -> bool:
    try:
        p.resolve().relative_to(base.resolve())
        return True
    except ValueError:
        return False


@block("route", "Metti nelle cartelle", "uscita",
       help="Copia (o sposta) ogni file nella cartella di arrivo, con cartelle e nomi fatti di variabili: es. "
            "«{cliente}/{anno}/{tipo}_{numero}.{ext}». Più righe = più copie (clonazione). I file da verificare vanno "
            "in «_da_verificare», così niente finisce nel posto sbagliato.",
       params=[P("to", "template", "{file}", "Dove e con che nome", "una riga per copia; relativo alla cartella di arrivo", required=True),
               P("mode", "choice", "copy", "Copia o sposta", "«sposta» toglie i file dalla cartella di partenza", choices=["copy", "move"]),
               P("file", "choice", "current", "Quale file", "current = quello lavorato dai passi prima, original = l'originale",
                 choices=["current", "original"]),
               P("conflict", "choice", "suffix", "Se il file esiste", choices=["suffix", "skip", "overwrite", "error"]),
               P("review_folder", "str", "_da_verificare", "Cartella dei file da verificare", "vuoto = come gli altri"),
               P("missing", "str", "_senza-valore", "Al posto di una variabile vuota", "vuoto = file a verifica")])
def route(it, p, ctx):
    lines = [x.strip() for x in p["to"].splitlines() if x.strip()]
    base = ctx.output_dir
    written = []
    for i, tpl in enumerate(lines):
        if it.status == REVIEW and p["review_folder"]:
            ext = Path(it.src).suffix.lstrip(".") if p["file"] == "original" and whole(it) else it.ext
            rel = f"{p['review_folder']}/{Path(it.src).stem}" + (f"_p{it.page:03d}" if it.page else "") + f".{ext}"
        else:
            v = vars_with_counter(it, ctx, tpl)
            if p["file"] == "original" and whole(it):
                v.update(ext=Path(it.src).suffix.lower().lstrip("."), file=Path(it.src).name, name=Path(it.src).stem)
            if p["missing"]:
                for name, flt in re.findall(r"\{([A-Za-z_]\w*)([^}]*)\}", tpl):
                    if "default:" not in flt and name not in PATH_VARS and v.get(name) in (None, ""):
                        v[name] = p["missing"]
            try:
                rel = re.sub(r"/+", "/", render(tpl, v).replace("\\", "/")).lstrip("/")
            except TemplateError as e:      # a value is missing: never guess a folder, ask a person
                it.flag(f"cartella non decisa: {e}")
                rel = f"{p['review_folder'] or '_da_verificare'}/{it.p.name}"
        dest = (base / rel)
        if not _inside(base, dest):
            raise ValueError(f"percorso fuori dalla cartella di arrivo: {rel}")
        dest = unique_path(dest, p["conflict"])
        if dest is None:
            it.note(ctx.step, f"già presente, saltato: {rel}")
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        last = i == len(lines) - 1
        src = Path(it.path)
        if p["file"] == "original" and whole(it) and ctx.input_dir:
            src = ctx.input_dir / it.src     # pages, segments and merges have no original of their own
        if p["mode"] == "move" and last and not ctx.preview:
            shutil.move(str(src), str(dest))
            it.path = str(dest)
        else:
            shutil.copy2(src, dest)
        written.append(str(dest))
    it.out.extend(written)
    if written:
        it.meta["out_rel"] = [os.path.relpath(w, base).replace("\\", "/") for w in written]
    return it


DEFAULT_COLS = ["id", "src", "page", "status", "cls", "tags", "text_conf", "out", "flags"]


@block("report", "Report", "uscita", kind="batch",
       help="Scrive un riepilogo (Excel, CSV, JSON o Markdown) con una riga per file: origine, pagine, campi letti con "
            "la loro affidabilità, tipo, tag, dove è finito, cosa va verificato. Utile per controllare un lavoro e per "
            "importare i dati in un gestionale.",
       params=[P("format", "choice", "xlsx", "Formato", choices=["xlsx", "csv", "json", "jsonl", "md"]),
               P("name", "template", "report_{date}_{time}", "Nome del file"),
               P("fields", "fields", [], "Campi", "vuoto = tutti quelli letti"),
               P("conf", "bool", True, "Colonne con l'affidabilità"),
               P("text", "bool", False, "Colonna con il testo letto"),
               P("only", "choice", "all", "Righe", choices=["all", "review", "ok", "errors"])])
def report(items, p, ctx):
    names: list = list(p["fields"])
    if not names:
        for it in items:
            for k in it.fields:
                if k not in names:
                    names.append(k)
    head = DEFAULT_COLS + [x for n in names for x in ([n, n + "_conf"] if p["conf"] else [n])] + (["testo"] if p["text"] else [])
    rows = [head]
    sel = {"all": None, "review": {REVIEW}, "ok": {"ok"}, "errors": {ERROR}}[p["only"]]
    # the report sees every item of the job, also the ones skipped or failed earlier
    everything = getattr(ctx, "all_items", None) or items
    for it in everything:
        if sel and it.status not in sel:
            continue
        r = [it.id, it.src, it.page or "", it.status, it.cls, ", ".join(it.tags),
             "" if it.text_conf is None else it.text_conf, " | ".join(it.meta.get("out_rel") or it.out),
             " | ".join(it.flags)]
        for n in names:
            f = it.fields.get(n) or {}
            r.append(f.get("v", "") if isinstance(f, dict) else "")
            if p["conf"]:
                r.append(f.get("conf", "") if isinstance(f, dict) else "")
        if p["text"]:
            r.append(it.text[:30000])
        rows.append(r)
    ext = p["format"]
    name = render(p["name"], {**ctx.vars, **_now()}) + "." + ext
    dest = unique_path(ctx.output_dir / name)
    M.write_table(rows, dest, ext)
    ctx.reports.append(str(dest))
    return items


def _now() -> dict:
    from datetime import datetime
    n = datetime.now()
    return {"date": n.strftime("%Y-%m-%d"), "time": n.strftime("%H%M%S"), "year": n.strftime("%Y")}
