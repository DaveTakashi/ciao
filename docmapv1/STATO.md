# STATO di DocMap — fonte unica

> Aggiornato al **2026-11-06**. Chi cambia una versione, un test o una decisione aggiorna questo file nello stesso
> commit. Per ripartire dopo una pausa (persona o agente) si legge questo, poi [`CHANGELOG.md`](CHANGELOG.md).

## 1. Versioni correnti e cosa va con cosa

| Componente | Versione | Dove si legge | Zip per Dave (file del progetto) |
|---|---|---|---|
| App DocMap (PC, web, telefono) | **26.12.5** (v12.5) | `APP_VERSION` in `assets/js/02-core.js` | `docmapv1/docmap_v12.5.zip`, `docmapv1/DocMap-COMPLETO-26.12.5.zip` |
| Database locale (SQLite nel browser) | schema **9** | `DB_SCHEMA_VERSION` in `assets/js/06-db.js` | — |
| Server web PHP (`server-php/api.php`) | 26.12.5, schema **3** | `DM_APP_VERSION`, `DM_SCHEMA` | dentro lo zip dell'app (`deploy/`) |
| Server Python (sede) | pacchetto 1.0.0, parità con PHP 26.12.5 | `server-python/docmap_server/__init__.py` | dentro l'installer |
| Strumenti di installazione Windows | 1.2.0 | `TOOLS_VERSION` in `installer-windows/docmap_tools.py` | `docmapv1/python/DocMap-installer-26.12.5.zip` |
| Hub (PC di Dave) | **0.7.0**, registro schema in `registry.py` | `hub/docmap_hub/__init__.py` | `docmapv1/python/DocMap-hub-0.7.zip` |

Regola: lo **stesso numero 26.12.x** deve comparire in app, `api.php` e server Python. Il server PHP e quello Python
leggono e scrivono lo stesso `docmap.sqlite` (si passa dall'uno all'altro senza conversione).

## 2. Codice

- Ramo di consolidamento: `claude/project-thread-5qvqr5` (contiene tutto: app v12.5 + server Python + installer + hub 0.7),
  PR verso `main`. Sostituisce le PR a catena #1 (app), #2 (Python), #3 (hub).
- Dopo l'unione: `main` è la versione vera; ogni thread parte da `main`.

## 3. Test

| Cosa | Comando | Durata | Ultimo esito |
|---|---|---|---|
| Verifica veloce (tutto tranne la suite completa) | `bash tools/verifica-veloce.sh` | ~3 min | 2026-11-06: tutto OK (hub 112, server 33, parità PHP⇄Python 7/306 confronti, installer 70, smoke 13) |
| Suite completa app (Playwright) | `cd tests && NODE_PATH=$(npm root -g) node suite.js` | ~35 min | v12.5: 1374/1374 |
| CI su GitHub | `ci/docmap-ci.yml` (attivo solo se copiato in `.github/workflows/`) | — | in attesa del sì di Dave |

## 4. Mai provato su dispositivi veri (bloccante prima di vendere)

Scheda unica da seguire: [`docs/COLLAUDO-REALE.md`](docs/COLLAUDO-REALE.md).

- Installatore e server Python su **Windows** (servizio, HTTPS in LAN con la CA dello studio, backup cifrati).
- Hub su **Windows** (DPAPI di "Ricorda su questo PC", porte, deploy FTP/SFTP).
- Sito su **SiteGround** con la v12.5 (dopo la cancellazione di studio-de del 2026-11-03).
- **Stampante** vera: foglio MRINK143 (8 etichette da dividere), calibrazione, etichettatrici a rotolo.
- **Telefoni** Android e iPhone (accesso ricordato, stati, associazione, offline) e **NFC** (solo Android/Chrome).

## 5. Limiti noti

- Il server **PHP registra la licenza ma non la applica** (sospendere o revocare dall'hub non ha effetto sui siti web).
  Il server Python la applica solo con `licence_required`.
- Le foto degli armadi restano solo sul PC.
- Nessun aggiornamento automatico: si sostituiscono i file seguendo la guida della versione.

## 6. Decisioni in vigore

Vedi `docs/ROADMAP.md` §5 (D1–D7) e la memoria del progetto. Aggiunte:

| # | Data | Decisione | Perché |
|---|---|---|---|
| D8 | 2026-11-06 | Un solo ramo/PR di consolidamento verso `main`, poi un ramo per thread da `main` | le PR a catena facevano partire i thread dal ramo sbagliato |
| D9 | 2026-11-06 | `tools/verifica-veloce.sh` prima di ogni push; suite completa prima di ogni rilascio e ogni notte in CI | 35 minuti a ogni modifica non sono sostenibili |
| D10 | 2026-11-06 | `STATO.md` + `CHANGELOG.md` sono la fonte unica; i vecchi `PROGRESS*.md` restano come diario | 4 registri separati non dicevano "dove siamo" |

## 7. Prossimi passi (ordine concordato con Dave il 2026-11-06)

1. Consolidamento (questo ramo): CI, `CLAUDE.md`, `STATO.md`, `CHANGELOG.md`, `docs/RILASCIO.md`, collaudo unico.
2. Collaudo reale con Dave (`docs/COLLAUDO-REALE.md`), poi correzioni e FAQ.
3. Primi clienti: licenza applicata dal PHP, indicatore di sincronizzazione, procedura del primo avvio, aggiornatore,
   documenti commerciali.
4. Moduli a pagamento: Conservazione e scarto, Consegna documenti con firma.
5. Hub da centro di controllo: salute istanze, aggiornamenti a ondate, pannello rivenditore, pagamenti.

Analisi completa: Claude Doc «DocMap: cosa manca e dove migliorare» (2026-11-06).
