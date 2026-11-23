# CLAUDE.md — regole fisse per gli agenti su DocMap

Leggi questo file per primo, poi [`STATO.md`](STATO.md) (dove siamo) e il manuale tecnico adatto alla zona che tocchi.

## Regole che non si discutono

1. **Lavora solo dentro `docmapv1/`** del repository `DaveTakashi/ciao` (repo di test). L'unica eccezione autorizzata
   va chiesta a Dave e scritta in `STATO.md`. Eccezione in vigore: `.github/workflows/docmap-ci.yml` (CI, decisione D20).
2. **Nessun dato perso, mai.** Migrazioni solo additive, chiavi di memoria (`localStorage`, IndexedDB) invariate,
   backup prima di ogni aggiornamento, guida di aggiornamento per ogni rilascio (`docs/AGGIORNAMENTI.md`).
3. **Lingua**: Dave scrive in italiano; documenti per l'utente in italiano semplice; codice e commenti in inglese.
4. **Niente `rm` né comandi che chiedono approvazione** a Dave senza motivo (Windows + Chrome/Edge; perde tempo).
5. **Mai dati veri nel repository** (l'elenco clienti dello studio sta solo in `/mnt/project-files/docmapv1/dati-studio/`).
6. **Mai inventare un Codice Multi**, mai riusare uno `short_code` (`dm26` + 8): è stampato sui QR fisici.
7. **I QR puntano a `https://qr7.it/{short_code}` di default** (garanzia 10 anni di QR7), ma l'indirizzo è
   **configurabile** (Impostazioni › Indirizzo dei QR, `S.settings.qrBase` / `DOCMAP_CONFIG.qrBase`). Dave 2026-11-22: Doc Location
   è solo il marchio, mai forzare un dominio nei QR; il codice resta agnostico.
8. **Mai force-push**; un ramo per thread, PR verso `main`.

## Dove sta cosa

| Zona | Cartella | Manuale tecnico | Test |
|---|---|---|---|
| App (PC + telefono, `file://`) | `index.html`, `scan.html`, `assets/` | [`AGENTS.md`](AGENTS.md) | `tests/smoke.js` (1 min), `tests/suite.js` (35 min) |
| Server web PHP (SiteGround) | `server-php/` | `docs/API-CONTRACT.md`, `docs/SICUREZZA.md` | `server-python/tests/diff_test.py` |
| Server Python (sede, porting 1:1) | `server-python/` | `server-python/README.md`, `docs/python/PORTING.md` | `python3 -m unittest discover -s tests` |
| Hub (PC di Dave: clienti, licenze, deploy) | `hub/` | `hub/AGENTE-OPERATIVO.md`, `docs/WIKI-HUB.md` | idem, dentro `hub/` |
| Installatore Windows | `installer-windows/` | `installer-windows/GUIDA-INSTALLAZIONE.md` | idem, dentro `installer-windows/` |

## Prima di ogni push

```bash
bash docmapv1/tools/verifica-veloce.sh      # ~4 min: lint JS/Python, sintassi, hub, server, parità PHP⇄Python, installer, test app
```

I test app si lanciano anche da soli o tutti insieme in ~40 s (`cd docmapv1/tests && NODE_PATH=$(npm root -g) node run.js`).
Un file di test nuovo usa `tests/lib/harness.js` e va nell'elenco `FAST` di `tests/run.js`: vedi [`docs/TEST.md`](docs/TEST.md).
La CI su GitHub (`.github/workflows/docmap-ci.yml`, copia identica di `ci/docmap-ci.yml`) fa la stessa verifica a ogni push.

Prima di un **rilascio** anche la suite completa: `cd docmapv1/tests && NODE_PATH=$(npm root -g) node suite.js`.
Se `api.php` cambia, il server Python va riallineato nello stesso rilascio (il PHP è la specifica).

## Rilascio (ogni versione)

Segui [`docs/RILASCIO.md`](docs/RILASCIO.md) (lo zip per Dave si fa solo con `tools/crea-zip.py`): versione, test, guida di aggiornamento, `CHANGELOG.md`, `STATO.md`,
`docs/INDICE.md`, zip nei file del progetto, memoria del progetto.

## Documentazione sempre aggiornata

Ogni modifica visibile all'utente aggiorna nello stesso commit: aiuto in app (`07-help.js` / `07b-helpx.js`),
`docs/MANUALE-UTENTE.md`, `CHANGELOG.md`; ogni modifica di stato o versione aggiorna `STATO.md`.
