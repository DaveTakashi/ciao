# Registro di avanzamento (roadmap Python e hub)

> Per ripartire: leggi l'ultima voce, poi [`ROADMAP.md`](ROADMAP.md) §3. Branch di lavoro: `claude/project-thread-iqsptc`
> (nato da `claude/project-thread-cz53ct` = v11.1, commit `32c3485`). Una voce per passo, la più recente in fondo.
> Formato: data e ora UTC · fase · cosa è stato fatto · file · prova eseguita · prossimo passo.

## 2026-11-01 23:50 · F0 · Roadmap

- Fatto: scritti `docs/ROADMAP.md` (fasi F0–F10, cancelli, decisioni D1–D7) e questo registro.
- Ambiente usato: Python 3 con `fastapi 0.162.0`, `uvicorn 0.54.0`, `cryptography 50.0.1`; PHP CLI con `pdo_sqlite` e
  `openssl` (per i test differenziali); Node 22 + Playwright per la suite.
- Prossimo passo: F1, porting di `server-php/api.php` in `server-python/` seguendo `docs/python/PORTING.md`.
