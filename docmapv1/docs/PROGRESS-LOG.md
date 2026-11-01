# Registro di avanzamento (roadmap Python e hub)

> Per ripartire: leggi l'ultima voce, poi [`ROADMAP.md`](ROADMAP.md) §3. Branch di lavoro: `claude/project-thread-iqsptc`
> (nato da `claude/project-thread-cz53ct` = v11.1, commit `32c3485`). Una voce per passo, la più recente in fondo.
> Formato: data e ora UTC · fase · cosa è stato fatto · file · prova eseguita · prossimo passo.

## 2026-11-01 23:50 · F0 · Roadmap

- Fatto: scritti `docs/ROADMAP.md` (fasi F0–F10, cancelli, decisioni D1–D7) e questo registro.
- Ambiente usato: Python 3 con `fastapi 0.162.0`, `uvicorn 0.54.0`, `cryptography 50.0.1`; PHP CLI con `pdo_sqlite` e
  `openssl` (per i test differenziali); Node 22 + Playwright per la suite.
- Prossimo passo: F1, porting di `server-php/api.php` in `server-python/` seguendo `docs/python/PORTING.md`.

## 2026-11-02 00:05 · F3 · Hub locale v0.1

- Fatto: `hub/` (pacchetto `docmap_hub`): verificatore `licence.py` (Ed25519, JSON canonico, modi `full` / `grace` /
  `read_only` / `invalid`, mai blocco), chiavi cifrate con rotazione, registro SQLite con migrazioni additive, CLI in
  italiano (`init`, `keygen`, `customer`, `reseller`, `instance`, `licence issue/renew/verify`, `backup`, `web`), pagina
  locale su 127.0.0.1, piani in `plans.json` (trial, studio, studio_pro, conto_terzi, appliance, reseller).
- Commit: 327a7dc, a77429f, c7e27e5. Guida: `hub/README.md` (§6 = contratto di integrazione col server).
- Prova: `cd docmapv1/hub && python -m unittest discover -s tests` → 39 test OK (Linux, Python 3.13). Non ancora provato su Windows.
- Prossimo passo: integrare `licence.py` nel server Python (dopo F1), chiave pubblica come costante, licenza in
  `<data_dir>/licence/licence.docmap-licence`, scritture → 403 `licence_read_only` quando in sola lettura.
