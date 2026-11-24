"""Control blocks: checks (double / triple reading, validators, uniqueness) and the manual review gate."""

from __future__ import annotations

import re
from collections import Counter

from .. import recipe as RC
from .. import validators as V
from ..items import ERROR, REVIEW, SKIP
from ..registry import P, block


def _same(a, b) -> bool:
    na = re.sub(r"[\s.\-_/]", "", str(a or "")).lower().lstrip("0")
    nb = re.sub(r"[\s.\-_/]", "", str(b or "")).lower().lstrip("0")
    return na == nb and na != ""


@block("check", "Controlla", "controllo", kind="batch",
       help="Controlla i campi prima di usarli: obbligatori, affidabilità minima, regole (partita IVA, codice fiscale, "
            "IBAN, data, intervallo, formato), letture doppie o triple che devono coincidere (es. regola e AI, due "
            "motori OCR: se coincidono il valore è sicuro, se no va a verifica), valori che non si devono ripetere.",
       params=[P("required", "fields", [], "Campi obbligatori"),
               P("min_conf", "float", 0.0, "Affidabilità minima dei campi", "0.8 = 80%", min=0, max=1),
               P("rules", "json", None, "Regole per campo", "JSON {\"piva\": \"piva\", \"numero\": \"range:1-99999\", \"data\": \"date\"}"),
               P("agree", "list", [], "Letture da confrontare", "una per riga: numero=numero_ai o numero=numero_2=numero_3"),
               P("vote_into", "str", "", "Valore finale in", "con le letture da confrontare: campo dove scrivere il valore scelto"),
               P("unique", "fields", [], "Campi da non ripetere", "es. numero (due file con lo stesso numero vanno a verifica)"),
               P("on_fail", "choice", "review", "Se il controllo non passa", choices=["review", "error", "skip", "keep"])])
def check(items, p, ctx):
    agree_problems: dict[int, list] = {}
    for it in items:                       # first the double / triple readings: they decide the values
        agree_problems[id(it)] = _agree(it, p)
    seen: dict[str, Counter] = {f: Counter() for f in p["unique"]}
    for it in items:
        for f in p["unique"]:
            v = it.value(f, "")
            if v not in (None, ""):
                seen[f][str(v)] += 1
    for it in items:
        problems = []
        for f in p["required"]:
            if it.value(f, "") in (None, ""):
                problems.append(f"{f}: manca")
        if p["min_conf"]:
            for f, fv in it.fields.items():
                if isinstance(fv, dict) and not fv.get("certified") and fv.get("conf") is not None and fv.get("v") not in (None, "") \
                        and fv.get("conf") < p["min_conf"] and (not p["required"] or f in p["required"]):
                    problems.append(f"{f}: poco sicuro ({int(fv['conf'] * 100)}%)")
        for f, rule in (p["rules"] or {}).items():
            v = it.value(f, "")
            if v in (None, ""):
                continue
            for r in rule if isinstance(rule, list) else [rule]:
                ok, why = V.validate(r, v)
                if not ok:
                    problems.append(f"{f}: {why}")
        problems += agree_problems[id(it)]
        for f in p["unique"]:
            v = it.value(f, "")
            if v not in (None, "") and seen[f][str(v)] > 1:
                problems.append(f"{f} «{v}» ripetuto in {seen[f][str(v)]} file")
        if problems:
            it.meta["check"] = problems
            if p["on_fail"] == "review":
                for pr in problems:
                    it.flag(pr, REVIEW)
            elif p["on_fail"] == "error":
                it.status = ERROR
                it.flags.extend(problems)
            elif p["on_fail"] == "skip":
                it.status = SKIP
                it.flags.extend(problems)
            else:
                it.meta["check_warnings"] = problems
    return items


@block("review", "Verifica a mano", "controllo", kind="batch",
       help="Ferma il lavoro e manda a una persona i file da guardare (quelli segnati dai passi prima, quelli che "
            "rispettano una condizione, o tutti). Nella schermata Verifica si va avanti e indietro con i tasti, si "
            "conferma, si corregge o si assegna un valore con un tasto; poi il lavoro riparte dal passo dopo.",
       params=[P("which", "choice", "flagged", "Quali file", choices=["flagged", "when", "all"]),
               P("when", "str", "", "Condizione", "per «when»: es. conf.numero < 0.9 or tipo == altro"),
               P("fields", "fields", [], "Campi da mostrare", "vuoto = tutti"),
               P("choices", "list", [], "Valori rapidi", "assegnati con i tasti 1…9, es. fattura, nota, F24"),
               P("choice_field", "field", "", "Campo dei valori rapidi", "es. tipo"),
               P("tags", "list", [], "Tag rapidi", "con i tasti Maiusc+1…9"),
               P("instructions", "text", "", "Istruzioni per chi verifica")])
def review(items, p, ctx):
    cond = RC.parse_condition(p["when"]) if p["which"] == "when" and p["when"] else None
    for it in items:
        need = (p["which"] == "all") or (p["which"] == "flagged" and it.status == REVIEW) or \
               (cond is not None and RC.matches(it, cond)) or (it.status == REVIEW and p["which"] != "all")
        if not need:
            continue
        it.status = REVIEW
        it.meta["gate"] = ctx.step
        it.meta["reviewed"] = False
        it.meta["review"] = {"fields": p["fields"], "choices": p["choices"], "choice_field": p["choice_field"],
                             "tags": p["tags"], "instructions": p["instructions"]}
    return items


def _agree(it, p) -> list:
    problems = []
    for spec in p["agree"]:
        names = [x.strip() for x in re.split(r"[=,]", spec) if x.strip()]
        vals = [it.value(n, "") for n in names]
        present = [(n, v) for n, v in zip(names, vals) if v not in (None, "")]
        target = p["vote_into"] or names[0]
        if len(present) < 2:
            problems.append(f"{'/'.join(names)}: letture insufficienti per il confronto")
            continue
        groups: list[list] = []
        for n, v in present:
            for g in groups:
                if _same(g[0][1], v):
                    g.append((n, v))
                    break
            else:
                groups.append([(n, v)])
        groups.sort(key=len, reverse=True)
        win = groups[0]
        share = len(win) / len(names)
        if len(win) == len(present) and len(present) == len(names):
            it.set_field(target, win[0][1], 0.99, "check:" + "+".join(n for n, _ in win))
        elif len(win) > len(present) / 2 and len(names) >= 3:
            it.set_field(target, win[0][1], round(0.6 + 0.3 * share, 3), "check:maggioranza",
                         choices=[g[0][1] for g in groups[1:]])
            problems.append(f"{target}: letture diverse, scelta la maggioranza")
        else:
            it.set_field(target, win[0][1], 0.4, "check:disaccordo", choices=[g[0][1] for g in groups[1:]])
            problems.append(f"{target}: letture diverse ({' / '.join(str(g[0][1]) for g in groups)})")
    return problems
