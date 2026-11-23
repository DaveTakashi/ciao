# Rilascio di una versione DocMap — procedura per gli agenti

Vale per app (26.12.x), server PHP/Python, installatore e hub. Nessun passo si salta; ogni passo è un controllo.

## 1. Prima di scrivere codice

- Parti da `main` aggiornato (`git fetch origin main`), un ramo per thread.
- Leggi `CLAUDE.md`, `STATO.md`, poi il manuale della zona (`AGENTS.md`, `hub/AGENTE-OPERATIVO.md`, …).

## 2. Numeri di versione

| Cosa cambia | Dove si aggiorna |
|---|---|
| App | `APP_VERSION` in `assets/js/02-core.js`, `DM_APP_VERSION` in `server-php/api.php`, versione in `server-python` (stesso 26.12.x) |
| Database locale | `DB_SCHEMA_VERSION` + migrazione additiva in `06-db.js` / `migrate()` in `02-core.js` |
| Database server | `DM_SCHEMA` + migrazione in `api.php` **e** in `server-python` (stessa migrazione, `diff_test.py` lo verifica) |
| Hub | `hub/docmap_hub/__init__.py` (`__version__`), migrazione registro in `registry.py` |
| Installatore | `TOOLS_VERSION` in `installer-windows/docmap_tools.py` |

## 3. Test

1. `bash tools/verifica-veloce.sh` → «tutto OK».
2. Se l'app cambia: suite completa `cd tests && NODE_PATH=$(npm root -g) node suite.js` → 0 fallimenti. Se un test
   fallisce per un errore del test stesso, correggilo **e rilancia la suite intera** prima di dire che è verde.
3. Un test che apre i dati della versione precedente (regola "nessun dato perso", `AGGIORNAMENTI.md`): `tests/upgrade.js`
   lo fa con i rilasci veri; dopo il rilascio aggiorna il suo elenco `FROM` (`docs/TEST.md` §4).
4. Un file di test nuovo va nell'elenco `FAST` di `tests/run.js`; `tools/lint-js.js` e `tools/lint-py.py` a zero problemi.

## 4. Documentazione (nello stesso commit)

- [ ] `CHANGELOG.md`: una riga nella tabella giusta (sposta "Da rilasciare" nella versione).
- [ ] `STATO.md`: versioni (§1), esito dei test (§3), cose non provate (§4), limiti (§5), prossimi passi (§7).
- [ ] Guida di aggiornamento `docs/AGGIORNAMENTO-vX-vY.md` (o `AGGIORNAMENTO-HUB-x.md`): backup, quali file
      sostituire, stessa cartella, controlli, ritorno indietro. Elencala in `docs/INDICE.md` e `docs/AGGIORNAMENTI.md`.
- [ ] Se cambia qualcosa che l'utente vede: `MANUALE-UTENTE.md`, aiuto in app (`07-help.js` / `07b-helpx.js`),
      eventualmente `docs/COLLAUDO-REALE.md` (riga nuova da provare sui dispositivi veri).
- [ ] Se cambia una regola per gli agenti: `CLAUDE.md` / `AGENTS.md` / `hub/AGENTE-OPERATIVO.md` / `docs/HANDOFF_PROMPT.md`.
- [ ] Nomi di zip e cartelle citati nelle guide (es. `DocMap-hub-0.7.zip`) aggiornati.

## 5. Pacchetti per Dave

- App: zip `docmap_vX.Y.zip` in `/mnt/project-files/docmapv1/` (cartella `docmapv1/` + `deploy/` costruito con
  `tools/build_deploy.py`). Il pacchetto completo per Dave è lo zip dell'hub (sotto); i vecchi `DocMap-COMPLETO-*.zip` sono in `vecchie-versioni/`.
- Installatore: `python3 installer-windows/docmap_tools.py pacchetto --out DIR --zip` →
  `/mnt/project-files/docmapv1/python/DocMap-installer-<versione>.zip`.
- Hub (**zip completo per Dave**: hub + app + sito + server + installatore + guide): sempre con
  `python3 docmapv1/tools/crea-zip.py --out DIR` (mai a mano). Lo script mette `INIZIA-QUI.html`, `guide/*.html` e
  `MANIFEST-SHA256.txt`, poi controlla lo zip (integrità, file obbligatori, niente dati/chiavi/`__pycache__`, CRLF nei
  `.bat`, hub estratto e avviato davvero) e scrive `…NON-VALIDO.zip` se qualcosa non va. Il file va in
  `/mnt/project-files/docmapv1/python/` come `DocMap-hub-<versione>.zip`; una guida nuova per l'utente va aggiunta
  all'elenco `GUIDES` dello script.
- **Link nei messaggi a Dave**: allega sempre lo zip appena copiato; se un altro thread pubblica una versione più nuova
  quella vecchia va in `vecchie-versioni/` e il vecchio allegato non si scarica più («impossibile scaricare»): nel
  messaggio indica il nome del file, non solo l'allegato.
- La versione precedente va in `python/vecchie-versioni/` (mai cancellata). Mai dati veri dentro gli zip.

## 6. Chiusura

- Commit con messaggio chiaro, push sul ramo del thread, PR verso `main`, aggiorna la PR.
- Memoria del progetto: una riga con versione, data, numero di test, zip, guida di aggiornamento.
- Messaggio a Dave: cosa cambia per lui, quale zip, quale guida seguire, cosa resta da provare su dispositivi veri.
