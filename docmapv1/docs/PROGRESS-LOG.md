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

## 2026-11-02 00:40 · F1 · Server Python 1:1 (cancello superato)

- Fatto: `server-python/` (pacchetto `docmap_server`): tutte le rotte di `api.php`, stessa cifratura, stessi hash, stesso
  `docmap.sqlite`; legge `config.php` senza eseguirlo o `config.json`; `python -m docmap_server setup` = `setup.php`;
  serve anche i file del deploy con le regole di `php-router.php`; aggancio licenza `docmap_server/licence.py` (oggi `full`).
- Commit fino a 5fff7e3. Guida: `server-python/README.md` (con le differenze note dal PHP); dettagli in `server-python/PROGRESS.md`.
- Prove (rifatte dal coordinatore): `python3 docmapv1/server-python/tests/diff_test.py` → 5 test OK (149 coppie di
  richieste identiche, database identici dopo decifratura, passaggio PHP⇄Python sulla stessa cartella dati, blocco IP,
  aggiornamento di un database v10.1); `NODE_PATH=/opt/node22/lib/node_modules python3 docmapv1/server-python/tests/validate_python.py`
  → "all checks passed".
- Differenze note: `ping` risponde `"php": "Python 3.x"`; date relative PHP (`now`, `@123`) rifiutate; nomi troncati a
  metà lettera accentata salvati con U+FFFD (JSON identico).
- Prossimo passo: integrazione licenze (F3) e suite Playwright W/X/J contro Python (F2) senza modificare `tests/suite.js`.

## 2026-11-02 01:30 · F3 + F2 · Licenze nel server e suite contro Python

- Fatto (F3): `server-python/docmap_server/licence_verify.py` = copia identica di `hub/docmap_hub/licence.py` (un test lo
  controlla); `licence.py` applica la licenza **solo se** la config ha `"licence_required": true` (le installazioni
  esistenti non cambiano comportamento). In sola lettura le scritture rispondono 403 `licence_read_only`; oltre i limiti
  403 `licence_limit` (faldoni nuovi nel push, utenti in `token_create`); stato in `me` e `ping`; comandi
  `python -m docmap_server licence install <file>` e `licence status`. Chiavi fidate: costante `TRUSTED_LICENCE_KEYS`
  (vuota finché Dave non esporta la sua chiave pubblica dall'hub).
- Fatto (F2): opzione `--php-layout`, shim `server-python/tests/php-shim/php` e `tests/run_suite_python.sh`: la suite
  intera gira contro Python senza toccare `tests/suite.js`. Risultati in `server-python/SUITE-RESULTS.md`.
- Commit: 20574fd, 9fe919d, 4d02363.
- Prove: `test_licence.py` 9 OK e `diff_test.py` 5 OK (rifatte dal coordinatore); validatore "all checks passed";
  suite: PHP 1093/1093, Python 1093/1093 (W, X, J verdi; solo `setup.php` e l'api.php v10.1 storico passano ancora dal
  PHP vero). Tutto-Python: 1092/1093, l'unico errore è atteso (la prova "server v10.1 crea schema 1" non ha senso se il
  "vecchio server" è Python v11).
- Prossimo passo: F4 installazione in sede su Windows (provare `run_windows.bat` di `hub/` e `server-python/` su un PC
  vero, servizio Windows, backup automatico), poi F5 quando la v12 cambia `api.php`.
