"""File blocks: filter, rename."""

from __future__ import annotations

import csv
import re
import shutil
from pathlib import Path

from .. import recipe as RC
from ..items import SKIP, item_vars, render
from ..registry import P, block


def vars_with_counter(it, ctx, tpl: str, extra: dict | None = None) -> dict:
    v = item_vars(it, {**ctx.vars, **(extra or {})})
    for name in re.findall(r"\{(n|n_\w+)(?::[^}|]*)?(?:\|[^}]*)?\}", tpl or ""):
        if name not in v:
            v[name] = ctx.counter(name)
    return v


def unique_path(p: Path, policy: str = "suffix") -> Path | None:
    if not p.exists() or policy == "overwrite":
        return p
    if policy == "skip":
        return None
    if policy == "error":
        raise FileExistsError(f"esiste già: {p.name}")
    n = 2
    while True:
        q = p.with_name(f"{p.stem} ({n}){p.suffix}")
        if not q.exists():
            return q
        n += 1


@block("filter", "Filtra", "file",
       help="Tiene solo i file che servono: per estensione, dimensione, nome o condizione. Gli altri si saltano.",
       params=[P("ext", "list", [], "Estensioni da tenere", "es. pdf, tif, tiff (vuoto = tutte)"),
               P("name_regex", "regex", "", "Nome che contiene", "espressione regolare sul nome del file"),
               P("min_kb", "int", 0, "Dimensione minima (KB)", min=0),
               P("max_kb", "int", 0, "Dimensione massima (KB)", "0 = nessun limite", min=0),
               P("when", "str", "", "Condizione", "es. pages > 1, text ~ (?i)fattura, numero is empty"),
               P("invert", "bool", False, "Al contrario", "tiene quelli che NON corrispondono"),
               P("drop", "bool", False, "Togli dall'elenco", "invece di segnarli come saltati")])
def filter_(it, p, ctx):
    ok = True
    if p["ext"]:
        ok = it.ext in [e.lower().lstrip(".") for e in p["ext"]]
    if ok and p["name_regex"]:
        ok = re.search(p["name_regex"], it.p.name, re.I) is not None
    size = it.meta.get("size") or (it.p.stat().st_size if it.p.exists() else 0)
    if ok and p["min_kb"]:
        ok = size >= p["min_kb"] * 1024
    if ok and p["max_kb"]:
        ok = size <= p["max_kb"] * 1024
    if ok and p["when"]:
        ok = RC.matches(it, p["when"])
    if p["invert"]:
        ok = not ok
    if ok:
        return it
    if p["drop"]:
        return None
    it.status = SKIP
    it.note(ctx.step, "saltato dal filtro")
    return it


@block("rename", "Rinomina", "file",
       help="Dà un nuovo nome al file con variabili ({numero}, {src_name}, {page:03}, {n:04}, {date}…). "
            "Di solito lavora su una copia; «Rinomina gli originali» cambia i file nella cartella di partenza "
            "e scrive l'elenco vecchio → nuovo per tornare indietro.",
       params=[P("to", "template", "{name}", "Nuovo nome (senza estensione)", required=True),
               P("keep_ext", "bool", True, "Tieni l'estensione"),
               P("in_place", "bool", False, "Rinomina gli originali", "solo nei lavori veri, mai nella prova"),
               P("conflict", "choice", "suffix", "Se il nome esiste", choices=["suffix", "skip", "overwrite", "error"])])
def rename(it, p, ctx):
    name = render(p["to"], vars_with_counter(it, ctx, p["to"]))
    if p["keep_ext"] and it.ext:
        name += "." + it.ext
    if p["in_place"] and not ctx.preview and Path(it.path) == (ctx.input_dir / it.src).resolve():
        dest = unique_path(it.p.with_name(name), p["conflict"])
        if dest is None:
            it.note(ctx.step, "nome già usato: lasciato com'era")
            return it
        old = it.p
        old.rename(dest)
        ctx.job_dir.mkdir(parents=True, exist_ok=True)
        log = ctx.job_dir / "rinominati.csv"
        new_file = not log.exists()
        with open(log, "a", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f, delimiter=";")
            if new_file:
                w.writerow(["vecchio", "nuovo"])
            w.writerow([str(old), str(dest)])
        it.path = str(dest)
        it.src = str(dest.relative_to(ctx.input_dir.resolve())).replace("\\", "/")
        it.out.append(str(dest))
        return it
    dest = unique_path(ctx.step_dir() / it.id / name, "suffix")
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(it.path, dest)
    it.path = str(dest)
    return it
