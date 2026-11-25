"""``python3 -m docmap_workstation serve|token-nuovo|controlla [--config workstation.json]``."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from . import __version__
from . import gateway as G


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="docmap_workstation", description=f"Gateway workstation {__version__}")
    ap.add_argument("comando", choices=["serve", "token-nuovo", "controlla"])
    ap.add_argument("--config", default=os.environ.get("DMWS_CONFIG", "workstation.json"))
    ap.add_argument("--nome", default="", help="token-nuovo: chi userà il gettone (es. hub, strumenti-studio)")
    ap.add_argument("--port", type=int, default=0)
    ap.add_argument("--progetto", default="", help="token-nuovo: progetto che lo usa (solo un'etichetta nel registro)")
    ap.add_argument("--modelli", default="", help="token-nuovo: modelli permessi, separati da virgola (vuoto = tutti)")
    a = ap.parse_args(argv)
    cfg_path = Path(a.config)
    if a.comando == "token-nuovo":
        raw = json.loads(cfg_path.read_text("utf-8")) if cfg_path.is_file() else {}
        tok = G.new_token()
        entry = {"name": a.nome or "client", "sha256": G.hash_token(tok)}
        if a.progetto:
            entry["project"] = a.progetto
        if a.modelli:
            entry["models"] = [x.strip() for x in a.modelli.split(",") if x.strip()]
        raw.setdefault("tokens", []).append(entry)
        tmp = cfg_path.with_name("." + cfg_path.name + ".tmp")
        tmp.write_text(json.dumps(raw, ensure_ascii=False, indent=2), "utf-8")
        os.replace(tmp, cfg_path)
        print("Gettone (copialo ora: nel file resta solo la sua impronta):")
        print(tok)
        return 0
    cfg = G.load_config(cfg_path)
    if a.port:
        cfg["port"] = a.port
    if a.comando == "controlla":
        gw = G.Gateway(cfg)
        ok = True
        for b in gw.backends:
            st, j = b.chat({"model": next(iter(b.models.values()), ""), "max_tokens": 16, "stream": False,
                            "messages": [{"role": "user", "content": "Rispondi solo: ok"}]})
            good = 200 <= st < 300
            ok &= good
            print(f"{'OK ' if good else 'NO '} {b.name} ({b.url}) modelli {', '.join(b.models)}"
                  + ("" if good else f" → {json.dumps(j, ensure_ascii=False)[:200]}"))
        print("GPU:", ", ".join(f"{g['name']} {g['mem_used_mb']}/{g['mem_total_mb']} MB" for g in G.gpus()) or "nessuna trovata")
        if not gw.hashes:
            print("Nessun gettone: crea il primo con  python3 -m docmap_workstation token-nuovo --nome hub")
        return 0 if ok and gw.backends else 1
    G.serve(cfg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
