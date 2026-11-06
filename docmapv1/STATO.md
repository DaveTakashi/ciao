# STATO di DocMap — fonte unica

> Aggiornato al **2026-11-06**. Chi cambia una versione, un test o una decisione aggiorna questo file nello stesso
> commit. Per ripartire dopo una pausa (persona o agente) si legge questo, poi [`CHANGELOG.md`](CHANGELOG.md).

## 1. Versioni correnti e cosa va con cosa

| Componente | Versione | Dove si legge | Zip per Dave (file del progetto) |
|---|---|---|---|
| App DocMap (PC, web, telefono) | **26.12.7** (v12.7) | `APP_VERSION` in `assets/js/02-core.js` | `docmapv1/docmap_v12.7.zip` |
| Database locale (SQLite nel browser) | schema **9** | `DB_SCHEMA_VERSION` in `assets/js/06-db.js` | — |
| Server web PHP (`server-php/api.php`) | 26.12.7, schema **3**, licenza con `licence_required`; `setup.php` con cartella per sito e modalità JSON | `DM_APP_VERSION`, `DM_SCHEMA` | dentro lo zip dell'app (`deploy/`) |
| Server Python (sede) | pacchetto 1.0.0, parità con PHP 26.12.7 (anche sulla licenza) | `server-python/docmap_server/__init__.py` | dentro l'installer |
| Strumenti di installazione Windows | 1.2.0 | `TOOLS_VERSION` in `installer-windows/docmap_tools.py` | `docmapv1/python/DocMap-installer-26.12.7.zip` |
| Hub (PC di Dave) | **0.9.0**, registro schema invariato (`registry.py`) | `hub/docmap_hub/__init__.py` | `docmapv1/python/DocMap-hub-0.9.zip` |
| Aggiornatore del PC | con l'app | `AGGIORNA-DOCMAP.bat` + `tools/aggiorna-app.ps1` | dentro lo zip dell'app |

Regola: lo **stesso numero 26.12.x** deve comparire in app, `api.php` e server Python. Il server PHP e quello Python
leggono e scrivono lo stesso `docmap.sqlite` (si passa dall'uno all'altro senza conversione).

## 2. Codice

- Ramo di consolidamento: `claude/project-thread-5qvqr5` (contiene tutto: app v12.6 + server Python + installer + hub 0.8),
  PR #4 verso `main`. Sostituisce le PR a catena #1 (app), #2 (Python), #3 (hub).
- Hub 0.9 + app 26.12.7 (autocritica del hub): ramo `claude/project-thread-acqq2g`, PR sopra la #4.
- Dopo l'unione: `main` è la versione vera; ogni thread parte da `main`.

## 3. Test

| Cosa | Comando | Durata | Ultimo esito |
|---|---|---|---|
| Verifica veloce (tutto tranne la suite completa) | `bash tools/verifica-veloce.sh` | ~4 min | vedi §3bis |
| Suite completa app (Playwright) | `cd tests && NODE_PATH=$(npm root -g) node suite.js` | ~35 min | v12.6: 1374/1374 (2026-11-06) |
| CI su GitHub | `ci/docmap-ci.yml` (attivo solo se copiato in `.github/workflows/`) | — | in attesa del sì di Dave |

### 3bis. Ultimo esito (2026-11-06, app 26.12.7, hub 0.9)

- Verifica veloce: tutto OK — hub 125 (11 nuovi in `test_v09_percorso.py`, con PHP vero), server Python 33, parità
  PHP ⇄ Python 7 gruppi, licenza PHP ⇄ Python 3 gruppi, installatore 75, smoke 13, `tests/v126.js` 17.
- In più: percorso completo «Nuovo cliente → sito di prova → produzione» nel browser contro PHP 8.3 reale dietro HTTPS
  (25 clic, nessun codice copiato a mano) e sospensione/riattivazione della licenza verificata sul sito.
- Suite completa: **1373/1374**; l'unico errore era README e HANDOFF_PROMPT ancora a 26.12.6 (corretti, controllo D rifatto: OK).

### Esito precedente (2026-11-06, app 26.12.6, hub 0.8)

- Verifica veloce: tutto OK — hub 114, server Python 33, parità PHP ⇄ Python 306 confronti, **licenza PHP ⇄ Python
  201 confronti**, installatore 75 (anche l'aggiornatore del PC), smoke 13, `tests/v126.js` 17.
- Suite completa: **1374/1374** (errors: none).

## 4. Mai provato su dispositivi veri (bloccante prima di vendere)

Scheda unica da seguire: [`docs/COLLAUDO-REALE.md`](docs/COLLAUDO-REALE.md).

- Installatore e server Python su **Windows** (servizio, HTTPS in LAN con la CA dello studio, backup cifrati).
- Hub su **Windows** (DPAPI di "Ricorda su questo PC", porte, deploy FTP/SFTP).
- Hub 0.9 contro **SiteGround vero**: «Configura il sito» (setup.php in JSON via HTTPS), «Invia ai siti» (FTPS), cartella
  `docmap-data/<sito>` con il `DOCUMENT_ROOT` reale. Provati con PHP 8.3 reale dietro HTTPS sul server di sviluppo.
- Sito su **SiteGround** con la v12.5 (dopo la cancellazione di studio-de del 2026-11-03).
- **Stampante** vera: foglio MRINK143 (8 etichette da dividere), calibrazione, etichettatrici a rotolo.
- **Telefoni** Android e iPhone (accesso ricordato, stati, associazione, offline) e **NFC** (solo Android/Chrome).

## 5. Limiti noti

- La licenza è applicata (PHP e Python) **solo con `licence_required`**: i siti del hub 0.8 la attivano da soli con
  `setup.php`; `studio-de` e i siti fatti a mano no. Il PHP legge il canale delle licenze solo durante le richieste
  (al massimo ogni 6 ore), non in background.
- Le foto degli armadi restano solo sul PC.
- Aggiornamento del PC con `AGGIORNA-DOCMAP.bat` (mai provato su Windows reale); server e telefoni come prima.
- I documenti commerciali (`docs/commerciale/`) sono bozze: prezzi non validati, testi legali da rivedere.

## 6. Decisioni in vigore

Vedi `docs/ROADMAP.md` §5 (D1–D7) e la memoria del progetto. Aggiunte:

| # | Data | Decisione | Perché |
|---|---|---|---|
| D8 | 2026-11-06 | Un solo ramo/PR di consolidamento verso `main`, poi un ramo per thread da `main` | le PR a catena facevano partire i thread dal ramo sbagliato |
| D9 | 2026-11-06 | `tools/verifica-veloce.sh` prima di ogni push; suite completa prima di ogni rilascio e ogni notte in CI | 35 minuti a ogni modifica non sono sostenibili |
| D11 | 2026-11-06 | Controllo licenza nel PHP spento di default; acceso da `setup.php` solo se il sito porta `trusted_keys.json` (siti del hub) | nessuno studio esistente deve finire in sola lettura per un aggiornamento |
| D12 | 2026-11-06 | Il sito del hub porta la licenza corrente in `server-php/`; `api.php` la installa solo se autentica e più recente | SiteGround non ha processi in background: il deploy è il canale sicuro |
| D10 | 2026-11-06 | `STATO.md` + `CHANGELOG.md` sono la fonte unica; i vecchi `PROGRESS*.md` restano come diario | 4 registri separati non dicevano "dove siamo" |
| D13 | 2026-11-06 | `setup.php` lo lancia il hub («Configura il sito»): i codici vanno solo in cassaforte; `config.php` resta nel hub solo con custodia, altrimenti si scarica una volta per il cliente | i codici copiati a mano erano il passo più fragile |
| D14 | 2026-11-06 | Una cartella dati per sito (`docmap-data/<sito>`); il sito nella radice resta su `docmap-data` | più studi sotto lo stesso dominio non devono mai condividere un database |
| D15 | 2026-11-06 | Dopo ogni cambio di licenza il hub la carica subito sui siti online (FTP); il canale resta per la sede | la sospensione deve valere subito, non al prossimo deploy |

## 7. Prossimi passi (ordine concordato con Dave il 2026-11-06)

1. Consolidamento (questo ramo): CI, `CLAUDE.md`, `STATO.md`, `CHANGELOG.md`, `docs/RILASCIO.md`, collaudo unico.
2. Collaudo reale con Dave (`docs/COLLAUDO-REALE.md`), poi correzioni e FAQ.
3. Primi clienti: licenza applicata dal PHP, indicatore di sincronizzazione, procedura del primo avvio, aggiornatore,
   documenti commerciali.
4. Moduli a pagamento: Conservazione e scarto, Consegna documenti con firma.
5. Hub da centro di controllo: salute istanze, aggiornamenti a ondate (primo passo fatto nella 0.9: «Siti da
   aggiornare»), pannello rivenditore, pagamenti.
6. Dall'autocritica 0.9 (`docs/AUTOCRITICA-HUB-0.9.md` §4): sede senza chiavetta (token del ponte nel pacchetto),
   lettera di benvenuto per persona con QR del primo accesso.

Analisi completa: Claude Doc «DocMap: cosa manca e dove migliorare» (2026-11-06).
