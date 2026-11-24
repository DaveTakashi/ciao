"""Command line of the tools.

    python -m docmap_strumenti serve [--open]                    the browser interface on this PC (127.0.0.1:8091)
    python -m docmap_strumenti serve --remote --host 0.0.0.0     worker for other PCs (tenant tokens, HTTPS advised)
    python -m docmap_strumenti blocchi                           the block catalogue
    python -m docmap_strumenti ricette                           saved recipes
    python -m docmap_strumenti importa ricetta.json              save a recipe (new version if it exists)
    python -m docmap_strumenti prova RICETTA FILE                run a recipe on one file and show what each step did
    python -m docmap_strumenti esegui RICETTA --da IN --a OUT    run a recipe on a folder, here, now
    python -m docmap_strumenti token crea --cliente rossi --crediti 5000
    python -m docmap_strumenti consumi | registro | info
RICETTA is a saved recipe id or a .json file.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import __version__
from . import engine as E
from . import jobs as J
from . import media as M
from . import providers as PR
from . import recipe as RC
from . import registry as R
from . import settings as S
from .branding import brand_name
from .paths import ensure


def _recipe(arg: str, data_dir: Path) -> dict:
    p = Path(arg)
    if p.suffix.lower() == ".json" and p.is_file():
        return RC.validate(json.loads(p.read_text("utf-8")))
    try:
        return RC.Store(data_dir).get(arg)
    except RC.RecipeError:
        for t in RC.templates():
            if t["id"] == arg:
                return t
        raise


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except (OSError, ValueError):
            pass
    ap = argparse.ArgumentParser(prog="python -m docmap_strumenti",
                                 description=f"{brand_name()} · Strumenti {__version__}: ricette di elaborazione file")
    ap.add_argument("--dati", help="cartella dei dati (predefinita: %%APPDATA%%\\DocMapStrumenti)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sv = sub.add_parser("serve", help="avvia l'interfaccia nel browser")
    sv.add_argument("--host", default="127.0.0.1")
    sv.add_argument("--port", type=int, default=8091)
    sv.add_argument("--remote", action="store_true", help="accetta lavori da altri PC con i gettoni dei clienti")
    sv.add_argument("--cert")
    sv.add_argument("--key")
    sv.add_argument("--open", action="store_true", help="apri il browser")
    sub.add_parser("url", help="indirizzo dell'interfaccia con la chiave locale")
    sub.add_parser("blocchi", help="elenco dei blocchi")
    sub.add_parser("ricette", help="ricette salvate")
    sub.add_parser("modelli", help="ricette di esempio comprese")
    im = sub.add_parser("importa", help="salva una ricetta da un file JSON")
    im.add_argument("file")
    ex = sub.add_parser("esporta", help="scrive una ricetta in JSON")
    ex.add_argument("ricetta")
    pv = sub.add_parser("prova", help="prova una ricetta su un file")
    pv.add_argument("ricetta")
    pv.add_argument("file")
    pv.add_argument("--json", action="store_true")
    ru = sub.add_parser("esegui", help="esegue una ricetta su una cartella (senza interfaccia)")
    ru.add_argument("ricetta")
    ru.add_argument("--da", required=True, help="cartella di partenza")
    ru.add_argument("--a", required=True, help="cartella di arrivo")
    ru.add_argument("--remoto", action="store_true", help="manda il lavoro al server remoto delle Impostazioni")
    tk = sub.add_parser("token", help="gettoni dei clienti per il server remoto")
    tks = tk.add_subparsers(dest="tcmd", required=True)
    tc = tks.add_parser("crea")
    tc.add_argument("--cliente", required=True)
    tc.add_argument("--crediti", type=int, help="crediti al mese (vuoto = senza limite)")
    tc.add_argument("--piano", default="")
    tc.add_argument("--nota", default="")
    tks.add_parser("elenco")
    tr = tks.add_parser("revoca")
    tr.add_argument("--cliente", required=True)
    sub.add_parser("consumi", help="crediti usati per cliente e mese")
    sub.add_parser("registro", help="controlla che il registro delle verifiche non sia stato modificato")
    sub.add_parser("info", help="motori disponibili su questo PC")
    a = ap.parse_args(argv)
    d = ensure(a.dati)

    if a.cmd == "serve":
        from .server import serve
        serve(d, a.host, a.port, a.remote, a.cert, a.key, a.open)
        return 0
    if a.cmd == "url":
        from .server import App
        app = App(d)
        print(f"http://127.0.0.1:8091/#k={app.key}")
        return 0
    if a.cmd == "blocchi":
        for b in R.catalog():
            print(f"{b['category_label']:<30} {b['name']:<12} {b['label']}")
        return 0
    if a.cmd == "ricette":
        for r in RC.Store(d).list():
            print(f"{r['id']:<36} v{r['version']:<4} {r['steps']} passi  {r['name']}")
        return 0
    if a.cmd == "modelli":
        for r in RC.templates():
            print(f"{r['id']:<36} {len(r['steps'])} passi  {r['name']}")
        return 0
    if a.cmd == "importa":
        r = RC.Store(d).save(json.loads(Path(a.file).read_text("utf-8")), "riga di comando")
        print(f"salvata {r['id']} versione {r['version']}")
        return 0
    if a.cmd == "esporta":
        print(json.dumps(_recipe(a.ricetta, d), ensure_ascii=False, indent=2))
        return 0
    s = S.load(d)
    if a.cmd == "prova":
        res = E.preview(_recipe(a.ricetta, d), Path(a.file), s)
        if a.json:
            print(json.dumps(res, ensure_ascii=False, indent=1, default=str))
            return 0 if not res["error"] else 1
        for st in res["steps"]:
            print(f"· {st['step']:<22} {st['block']:<12} {st['items']} file  ok {st['ok']}  verifica {st['review']}  "
                  f"errori {st['error']}  ({st['seconds']} s)")
        for it in res["items"]:
            fields = ", ".join(f"{k}={v.get('v')!r} ({int((v.get('conf') or 0) * 100)}%)" for k, v in it["fields"].items())
            print(f"  {it['id']} {it['status']:<6} {Path(it['path']).name}  {fields}  {' · '.join(it['flags'])}")
        for o in res["outputs"]:
            print(f"  → {o}")
        if res["error"]:
            print("ERRORE:", res["error"])
            return 1
        return 0
    if a.cmd == "esegui":
        rec = _recipe(a.ricetta, d)
        store = J.Store(d)
        if a.remoto:
            from . import remote as RM
            job = store.create(rec, str(Path(a.da).resolve()), str(Path(a.a).resolve()), "local", "remote")
            import threading
            RM.run_remote(store, job, s, threading.Event())
        else:
            job = store.create(rec, str(Path(a.da).resolve()), str(Path(a.a).resolve()))
            q = J.Queue(store, lambda: s)
            store.update(job["id"], status="running")
            q.run_job(job["id"])
        j = store.get(job["id"])
        print(f"lavoro {j['id']}: {j['status']}  {j['totals']}  crediti {j['credits']}  {j['error'] or ''}")
        if j["status"] == "waiting_review":
            print("Ci sono file da verificare: apri l'interfaccia (serve --open) › Verifica.")
        return 0 if j["status"] in ("done", "waiting_review") else 1
    if a.cmd == "token":
        st = J.Store(d)
        if a.tcmd == "crea":
            tok = st.token_create(a.cliente, a.nota, a.piano, a.crediti)
            print(f"gettone per {a.cliente} (mostrato solo ora, conservalo): {tok}")
        elif a.tcmd == "elenco":
            for t in st.tokens():
                print(f"{t['tenant']:<24} {t['plan'] or '-':<12} crediti/mese {t['credits_month'] if t['credits_month'] is not None else '∞':<8} "
                      f"{t['created']} {'REVOCATO ' + t['revoked'] if t['revoked'] else ''}")
        else:
            print(f"revocati: {st.token_revoke(a.cliente)}")
        return 0
    if a.cmd == "consumi":
        for u in J.Store(d).usage():
            print(f"{u['month']} {u['tenant']:<24} {u['kind']:<10} {u['qty']:>8} → {u['credits']:>8} crediti")
        return 0
    if a.cmd == "registro":
        ok, n = J.Store(d).audit_verify()
        print(("registro integro" if ok else f"REGISTRO MODIFICATO alla riga {n}") + f" ({n} righe controllate)")
        return 0 if ok else 1
    if a.cmd == "info":
        print(f"Strumenti {__version__} · dati in {d}")
        print(f"Tesseract: {PR.tesseract_cmd(s) or 'non installato'}  lingue: {', '.join(PR.tesseract_langs(s)) or '-'}")
        print(f"PDF → immagini (pypdfium2): {'sì' if M.has_pdfium() else 'no'}")
        print(f"AI: {(s.get('ai') or {}).get('provider') or 'spenta'}   server remoto: {(s.get('remote') or {}).get('url') or '-'}")
        return 0
    return 2
