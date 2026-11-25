"""``python -m docmap_strumenti ai …``: list providers, profiles and OCR engines, try a profile, compare readers.

    ai fornitori                          providers (with sub-models and aliases) and OCR engines
    ai profili                            profiles, strategies, tasks, plugins
    ai prova PROFILO [--file IMMAGINE]    one call; with an image, an OCR reading
    ai confronta --cartella DIR --con ai:ocr,ai:qualita,ocr:tesseract,ocr:paddleocr [--out risultati.csv] [--max 50]

``confronta`` reads the first page of every image/PDF of the folder with each reader and writes one CSV row per file
and reader (text, confidence, milliseconds, error, similarity to the truth). The truth is optional: a file
``<name>.vero.txt`` next to the document. At the end, per reader: files read, mean confidence, median time, mean
similarity to the truth, and how often each pair of readers agrees (similarity ≥ 0.9).
"""

from __future__ import annotations

import csv
import json
import statistics
import time
from difflib import SequenceMatcher
from pathlib import Path

from . import ai as AI
from . import ocr_engines as OE
from . import providers as PR
from .ai.router import _norm

DOC_EXT = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".pdf", ".webp", ".bmp", ".gif"}


def cmd_fornitori(s: dict) -> int:
    d = AI.describe(s)
    for p in d["providers"]:
        tag = "cloud" if p["cloud"] else "tue macchine"
        print(f"{p['id']:<18} {p['label']:<42} [{tag}]  {p['doc']}")
        if p["aliases"]:
            print(" " * 19 + "alias: " + ", ".join(f"{k}→{v}" for k, v in p["aliases"].items()))
        if p["models"]:
            print(" " * 19 + "modelli noti: " + ", ".join(p["models"]))
    print("\nMotori OCR:")
    for e in OE.describe(s)["engines"]:
        print(f"{e['id']:<18} {e['label']:<42} {'disponibile' if e['available'] else 'non disponibile'}  {e['doc']}")
    print("ordine di «auto»: " + " → ".join(OE.order(s)))
    return 0


def cmd_profili(s: dict) -> int:
    d = AI.describe(s)
    for p in d["profiles"]:
        if p["strategy"] == "cascade":
            what = f"cascata {' → '.join(p['steps'])} (sopra {p['min_conf'] or 0.8} si ferma)"
        elif p["strategy"] == "consensus":
            what = f"confronto tra {', '.join(p['members'])} (d'accordo almeno {p['min_agree'] or 2})"
        else:
            what = f"{p['provider'] or 'spenta'} · {p['resolved_model'] or p['model'] or '-'}"
        fb = f"  riserva: {', '.join(p['fallback']) if isinstance(p['fallback'], list) else p['fallback']}" if p["fallback"] else ""
        print(f"{p['name']:<16} {what}{fb}")
    print("profilo predefinito: " + d["default_profile"])
    if d["tasks"]:
        print("compiti: " + ", ".join(f"{k}→{v}" for k, v in d["tasks"].items()))
    pl = d["plugins"]
    if pl["files"]:
        print(f"plugin ({pl['dir']}): " + ", ".join(f"{f['name']}{'' if f['ok'] else ' ERRORE ' + f['error']}" for f in pl["files"]))
    return 0


def cmd_prova(s: dict, profile: str, file: str | None) -> int:
    try:
        if file:
            r = PR.ocr_ai(Path(file), 1, s, profile)
            print(json.dumps(r, ensure_ascii=False, indent=1)[:4000])
        else:
            r = AI.call(s, "Prova di collegamento. Rispondi con JSON {\"ok\": true, \"confidence\": 1}.", None, None, profile)
            print(json.dumps({k: r.get(k) for k in ("profile", "provider", "model", "ms", "usage", "steps", "members", "attempts", "result")},
                             ensure_ascii=False, indent=1))
    except PR.ProviderError as e:
        print("NON riuscita:", e)
        for a in getattr(e, "attempts", []) or []:
            print("  ·", a)
        return 1
    return 0


def read_one(reader: str, path: Path, s: dict) -> dict:
    kind, _, name = reader.partition(":")
    t0 = time.monotonic()
    try:
        if kind == "ai":
            r = PR.ocr_ai(path, 1, s, name or None)
        elif kind == "ocr":
            e = OE.ENGINES.get(name)
            if not e:
                raise PR.ProviderError(f"motore OCR sconosciuto: {name}")
            r = e.read(path, 1, s, {})
        else:
            raise PR.ProviderError(f"lettore sconosciuto «{reader}» (usa ai:PROFILO o ocr:MOTORE)")
        return {"text": r.get("text") or "", "conf": r.get("conf"), "by": r.get("by"), "ms": int((time.monotonic() - t0) * 1000), "error": ""}
    except PR.ProviderError as e:
        return {"text": "", "conf": None, "by": "", "ms": int((time.monotonic() - t0) * 1000), "error": str(e)[:200]}


def similarity(a: str, b: str) -> float:
    return round(SequenceMatcher(None, _norm(a), _norm(b)).ratio(), 3)


def compare(s: dict, folder: Path, readers: list[str], out: Path | None = None, limit: int = 0) -> dict:
    files = sorted(f for f in Path(folder).iterdir() if f.is_file() and f.suffix.lower() in DOC_EXT)
    if limit:
        files = files[:limit]
    rows, by_file = [], {}
    for f in files:
        truth_f = f.with_name(f.stem + ".vero.txt")
        truth = truth_f.read_text("utf-8") if truth_f.is_file() else None
        for rd in readers:
            r = read_one(rd, f, s)
            r.update(file=f.name, reader=rd, truth_sim=similarity(r["text"], truth) if truth is not None and not r["error"] else None)
            rows.append(r)
            by_file.setdefault(f.name, {})[rd] = r
    summary = {}
    for rd in readers:
        rs = [r for r in rows if r["reader"] == rd]
        ok = [r for r in rs if not r["error"]]
        confs = [r["conf"] for r in ok if isinstance(r["conf"], (int, float))]
        sims = [r["truth_sim"] for r in ok if r["truth_sim"] is not None]
        summary[rd] = {"files": len(rs), "ok": len(ok), "conf_mean": round(sum(confs) / len(confs), 3) if confs else None,
                       "ms_median": int(statistics.median([r["ms"] for r in ok])) if ok else None,
                       "truth_sim_mean": round(sum(sims) / len(sims), 3) if sims else None}
    agree = {}
    for i, a in enumerate(readers):
        for b in readers[i + 1:]:
            pairs = [(v[a], v[b]) for v in by_file.values() if a in v and b in v and not v[a]["error"] and not v[b]["error"]]
            if pairs:
                agree[f"{a} = {b}"] = round(sum(similarity(x["text"], y["text"]) >= 0.9 for x, y in pairs) / len(pairs), 3)
    if out:
        with open(out, "w", newline="", encoding="utf-8-sig") as fh:
            w = csv.writer(fh, delimiter=";")
            w.writerow(["file", "lettore", "motore", "affidabilita", "ms", "somiglianza_al_vero", "errore", "testo"])
            for r in rows:
                w.writerow([r["file"], r["reader"], r["by"], r["conf"], r["ms"], r["truth_sim"], r["error"], r["text"][:2000]])
    return {"files": len(files), "summary": summary, "agreement": agree, "rows": rows}


def cmd_confronta(s: dict, folder: str, readers: str, out: str | None, limit: int) -> int:
    rd = [x.strip() for x in readers.split(",") if x.strip()]
    res = compare(s, Path(folder), rd, Path(out) if out else None, limit)
    print(f"{res['files']} file, {len(rd)} lettori")
    for k, v in res["summary"].items():
        print(f"{k:<24} letti {v['ok']}/{v['files']}  affidabilità media {v['conf_mean']}  tempo mediano {v['ms_median']} ms"
              f"  somiglianza al vero {v['truth_sim_mean'] if v['truth_sim_mean'] is not None else '-'}")
    for k, v in res["agreement"].items():
        print(f"d'accordo {k}: {int(v * 100)}% dei file")
    if out:
        print("dettaglio in", out)
    return 0
