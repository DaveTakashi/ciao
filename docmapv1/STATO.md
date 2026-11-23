# STATO di DocMap — fonte unica

> Aggiornato al **2026-11-22**. Chi cambia una versione, un test o una decisione aggiorna questo file nello stesso
> commit. Per ripartire dopo una pausa (persona o agente) si legge questo, poi [`CHANGELOG.md`](CHANGELOG.md).

## 1. Versioni correnti e cosa va con cosa

| Componente | Versione | Dove si legge | Zip per Dave (file del progetto) |
|---|---|---|---|
| App DocMap (PC, web, telefono) | **26.12.10** (v12.10, ondata 2: prelievi con percorso, consegna e rientro firmati, faldone smarrito, andamento e previsioni; fine ondata 1: Oggi, Annulla, stati vuoti) | `APP_VERSION` in `assets/js/02-core.js` | dentro lo zip completo `docmapv1/python/DocMap-hub-0.11.2-app-26.12.10.zip` |
| Database locale (SQLite nel browser) | schema **9** | `DB_SCHEMA_VERSION` in `assets/js/06-db.js` | — |
| Server web PHP (`server-php/api.php`) | 26.12.10 (v12.10: rotta pubblica `finder`, solo GET, solo il contatto del faldone smarrito), schema **3**, licenza con `licence_required`; `setup.php` con cartella per sito e modalità JSON; v12.8: rotte `project`, `photo_put`, `photo`, `ai_spine` | `DM_APP_VERSION`, `DM_SCHEMA` | dentro lo zip dell'app (`deploy/`) |
| Server Python (sede) | pacchetto 1.0.0, parità con PHP 26.12.10 (anche sulla licenza, sull'inventario e su `finder`) | `server-python/docmap_server/__init__.py` | dentro l'installer |
| Strumenti di installazione Windows | 1.2.0 | `TOOLS_VERSION` in `installer-windows/docmap_tools.py` | dentro lo zip completo (`installer-windows/`); i pacchetti per i clienti li fa l'hub (il vecchio `DocMap-installer-26.12.7.zip` è in `vecchie-versioni/`) |
| Hub (PC di Dave) | **0.11.2**, registro schema **4** (modelli cliente) (`registry.py`) | `hub/docmap_hub/__init__.py` | `docmapv1/python/DocMap-hub-0.11.2.zip` (**zip completo**: hub + app + sito + server + installatore + guide; fatto e controllato da `tools/crea-zip.py`) |
| Aggiornatore del PC | con l'app | `AGGIORNA-DOCMAP.bat` + `tools/aggiorna-app.ps1` | dentro lo zip dell'app |

Regola: lo **stesso numero 26.12.x** deve comparire in app, `api.php` e server Python. Il server PHP e quello Python
leggono e scrivono lo stesso `docmap.sqlite` (si passa dall'uno all'altro senza conversione).

## 2. Codice

- Ramo di consolidamento: `claude/project-thread-5qvqr5` (contiene tutto: app v12.6 + server Python + installer + hub 0.8),
  PR #4 verso `main`. Sostituisce le PR a catena #1 (app), #2 (Python), #3 (hub).
- Hub 0.9 + app 26.12.7 (autocritica del hub), hub 0.10/0.10.1 (modelli, Attiva tutto, kit), 0.10.2 (cartelle) e 0.11 (elimina cliente, pacchetto sede pronto, più PC, sposta il sito): ramo `claude/project-thread-acqq2g`, PR #5 sopra la #4.
- App 26.12.8 (Progetti di inventario, indirizzo dei QR configurabile): ramo `claude/project-thread-epf33l` (parte dalla PR #5).
- App 26.12.9 (app installabile PWA, cronometro dei tempi; ondata 0 e prima parte dell'ondata 1): PR #8, unita in `main`.
- App 26.12.10 (ondata 2: funzioni 1, 3, 5, 7 scelte da Dave; fine ondata 1): ramo `claude/project-thread-1dzp8h` ripartito da `main`, PR verso `main`.
- Dopo l'unione: `main` è la versione vera; ogni thread parte da `main`.
- Qualità e CI (lint, test unitari e di aggiornamento, test in parallelo, CI attiva): ramo `claude/project-thread-imzwad` da `main` dopo l'unione della PR #9, PR verso `main`.

## 3. Test

| Cosa | Comando | Durata | Ultimo esito |
|---|---|---|---|
| Verifica veloce (tutto tranne la suite completa) | `bash tools/verifica-veloce.sh` | ~4 min | tutto OK (2026-11-23) |
| Lint JS / Python | `node tools/lint-js.js`, `python3 tools/lint-py.py` (dentro la verifica veloce) | 5 s | 0 problemi (2026-11-23) |
| Test app tutti insieme (smoke, unit, aggiornamento, v12.6 … v12.10) | `cd tests && NODE_PATH=$(npm root -g) node run.js` | ~40 s | 12/12 file OK (2026-11-23) |
| Suite completa app (Playwright) | `cd tests && NODE_PATH=$(npm root -g) node suite.js` | ~35 min | 1376/1376 (2026-11-23, app 26.12.10) |
| CI su GitHub | `.github/workflows/docmap-ci.yml` (= `ci/docmap-ci.yml`) | ~10 min | nella PR «qualità e CI» (unica cartella fuori da `docmapv1/`, da confermare da Dave) |

Come sono fatti i test e come aggiungerne: [`docs/TEST.md`](docs/TEST.md).

### Esito 2026-11-23, qualità e CI (nessuna versione nuova dell'app)

- Nuovi controlli: `tools/lint-js.js` (nomi tra i file di ogni pagina + regole eslint che sono sempre difetti),
  `tools/lint-py.py` (pyflakes, solo difetti veri), `tests/unit.js` 132/132 (funzioni pure v12.10 in due fusi orari),
  `tests/upgrade.js` 28/28 (dati creati dalle vere 26.12.7 e 26.12.9 aperti dalla versione attuale e poi di nuovo dalla
  vecchia), `tests/run.js` (test app in parallelo: ~40 s invece di ~4 min), `tests/lib/harness.js` (aiuto comune).
- Difetti trovati e corretti: e-mail del faldone smarrito che accettava `?cc=` / `&body=` (si poteva aggiungere un
  destinatario al link mailto; ora solo indirizzi semplici e link codificato); 4 testi italiani duplicati nel dizionario
  inglese dell'inventario; una riga morta in `06j-status.js`.

### Esito 2026-11-22, app 26.12.10 (prelievi, consegna firmata, faldone smarrito, previsioni, fine ondata 1)

- Test nuovi, tutti nella verifica veloce: `tests/v1210.js` (prelievi: percorso, link telefono, presa, consegna e rientro
  firmati sul PC e sul telefono in locale, impronta verificata e manomissione vista, backup, Annulla) 43/43;
  `tests/v1210b.js` (faldone smarrito: modello, impostazioni, subset condiviso, telefono locale, web con rotta finta,
  `docmap.config.js`) 16/16; `tests/v1210c.js` (previsioni: stagionalità riconosciuta, tendenza, piatto, storia corta,
  settimane, tempo risparmiato, suggerimenti, capienza, vista) 17/17; `tests/v1210d.js` (Oggi per profilo, Annulla,
  stati vuoti) 18/18; `tests/v1210e.js` (promemoria: gruppi, testo, inviato e Annulla, ripetizione, rinvio,
  contatti, regole, avviso giornaliero, backup) 16/16. Parità PHP ⇄ Python: 9 confronti nuovi sulla rotta `finder`.
- Suite completa 2026-11-23: **1376/1376**. Aggiornati 3 test della suite: eliminare un faldone o un archivio vuoto
  non chiede più conferma (c'è Annulla; con «Chiedi sempre conferma» la domanda torna, provato).
- Provato solo in Chromium: **firma col dito, fotocamera e WhatsApp mai su un telefono vero** (righe D14–D18 di
  `COLLAUDO-REALE.md`). «Offline completo» dell'ondata 1: il giro di prelievo e le firme del telefono funzionano senza
  rete (coda), il resto era già coperto dalla 26.12.9.

### Esito 2026-11-22, app 26.12.9 (app installabile, cronometro)

- `tests/v129.js` (nuovo, in verifica veloce): manifest e icone, `sw.js` registrato su un deploy vero (`build_deploy.py` +
  `php -S`), file del programma in copia, **niente dell'API in copia**, riapertura **senza rete** di `index.html` e di un
  link `/q/<codice>`, aggiornamento visto subito con la rete; da `file://` nessun service worker e nessun errore in console;
  cronometro (scarti, mediana, 9 su 10, limite 300, Azzera, PC ricerca → scheda, «Nuovo faldone» escluso, Informazioni su
  DocMap). `tests/v128.js`: misura del tempo tra due faldoni. Esiti: vedi il commit.
- `tests/v129b.js` (nuovo, in verifica veloce): `css-tokens.css` caricato per primo, tema salvato applicato prima del primo
  disegno, scuro dal sistema o scelto, stampa e fogli di etichette sempre chiari, Impostazioni › Aspetto, Ctrl+K (apre, Esc,
  faldone primo e aperto con Invio + tempo «trovare», pagina, nessun risultato), telefono.
- Provato solo in Chromium: **installazione vera su Android, iPhone e Edge mai provata** (righe D10–D13 di `COLLAUDO-REALE.md`).
- Esito finale 2026-11-22: verifica veloce tutto OK (v129 24/24, v129b 24/24), suite completa **1374 su 1374**.
- Ondata 1 completata nella 26.12.10.

### Esito 2026-11-22, app 26.12.8 (Progetti di inventario)

- Verifica veloce: tutto OK (con il nuovo `tests/v128.js`: modello, PC, telefono in locale e contro `api.php` vero con
  l'AI finta `mock`, pull del PC dal server). Parità PHP ⇄ Python con i nuovi confronti (progetti, etichette, foto, AI).
- `tests/v128.js`: 37/37. Suite completa: **1374/1374** (errors: none). Corretti durante la prova: la barra in alto a
  1366 px ora usa prima le etichette corte (non va più su due righe con la voce «Progetti»), le guide richiudono il menu
  ⚙ quando il passo indica altro, `openapi.yaml` con le 4 rotte nuove.
- Provato solo in Chromium (PC 1366 px, telefono 390 px emulato) con una fotocamera finta: **mai su un telefono vero**.

### 3bis. Esito 2026-11-07, app 26.12.7, hub 0.10.1

- Terzo giro (`AUTOCRITICA-HUB-0.10.md` §4bis): kit rifatto con le copie di config.php riprese dai siti, stop su
  cartelle non vuote, controllo del solo sito attivato, un «Attiva tutto» per cliente. Hub 145 test, verifica veloce OK.

### Esito 2026-11-17, hub 0.11.2 (zip completo)

- Solo zip e documentazione (`INIZIA-QUI`, `DOMANDE-FREQUENTI`, `RACCOGLI-INFO.bat`, `tools/crea-zip.py`); codice
  dell'hub invariato rispetto alla 0.11.1 salvo l'avviso in `run_windows.bat`. Verifica veloce (con il controllo dello
  zip): vedi il commit.

### Esito 2026-11-17, hub 0.11.1 (double check finale)

- Banco di prova nuovo: **Apache 2.4 + PHP 8.3 veri** (mod_rewrite, mod_headers, `.htaccess` attivi come su SiteGround) con HTTPS
  e CA di prova; hub con FTP `local` sulla cartella del sito. Provati davvero: «Attiva tutto», `setup.php`, ponte, «Sposta il sito»
  annidato (`…/studio-prova/` → `…/studio-prova/2026/`), redirect del QR vecchio, accesso dal telefono, «Elimina cliente».
- Corretti: redirect di «Sposta il sito» (prendeva anche la sottocartella del sito nuovo → giro infinito), «Attiva tutto» bloccato
  dopo un primo tentativo fermato al controllo, `/api/events` (pagina Attività) in errore 500, Impostazioni troppo larga sul
  telefono, voci del registro senza nome italiano, avviso «estrai lo zip» nei `.bat`, messaggio chiaro con Python < 3.11,
  `README-DEPLOY.md` / `DEPLOY-MANIFEST.txt` non più leggibili dal web.
- Test: hub 160, server Python 33, installer 76 verdi con **Python 3.11, 3.13 e 3.14**; verifica veloce tutto OK; suite completa 1374/1374.
- Interfaccia: hub su 1366 px, 820 px e 390 px senza scorrimento orizzontale né errori in console; app (accesso, `/q/<codice>`,
  `scan.html`) su PC, iPhone 13/SE e Pixel 7 emulati in Chromium. **Safari vero non provato** (solo emulazione).

### Esito 2026-11-17, hub 0.11.0

- Hub: test nuovi in `test_v103_elimina.py` (elimina cliente) e `test_v11_sposta.py` (sposta il sito con `setup.php`,
  `api.php` e ponte veri su `php -S`; pacchetto della sede con il codice del ponte; postazione online). Installatore:
  `test_bridge_token_file_from_hub`. Nel browser: finestre «Elimina» e «Sposta il sito».
- Non ancora su Windows reale né su SiteGround: righe H1–H5 di `docs/COLLAUDO-REALE.md`.

### Esito 2026-11-06, hub 0.10

- Hub: 142 test (17 nuovi in `test_v10_modelli.py`, con `setup.php` vero). `tools/verifica-veloce.sh`: tutto OK (hub, server Python, installer, smoke app 13/13, v12.6 17/17).
- Nel browser contro PHP 8.3 reale dietro HTTPS, deploy vero: **Nuovo cliente da modello → Attiva tutto → kit** in
  **5 clic** (sito + demo pubblicati, configurati, controllati; kit con lettere e copie di config.php). Riga di
  comando: `cliente da-modello --attiva --kit-out` in un comando.
- L'app non cambia (26.12.7): vale la suite completa qui sotto.

### Esito 2026-11-06, app 26.12.7, hub 0.9

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

- App 26.12.8, **inventario rapido** su telefoni veri (righe D7–D9): velocità reale per faldone, fotocamera e beep su
  iPhone/Android, microfono (Web Speech: Chrome Android sì; Safari iPhone da verificare), lettura AI con una chiave vera
  (mai chiamata davvero: solo il fornitore finto `mock` e un test con la rete simulata).

- Hub 0.11/0.11.1: Safari vero su iPhone e Edge su Windows (provati solo in Chromium emulato); elimina cliente, `INSTALLA-SENZA-DOMANDE.bat`, postazioni online, **Sposta il sito** con il reindirizzamento `.htaccess` su SiteGround (righe H1–H5).
- Hub 0.10 su **SiteGround vero**: hosting predefinito in FTPS, cartella del cliente creata dal deploy, «Attiva tutto», kit stampato (righe C1–C6).

- Installatore e server Python su **Windows** (servizio, HTTPS in LAN con la CA dello studio, backup cifrati).
- Hub su **Windows** (DPAPI di "Ricorda su questo PC", porte, deploy FTP/SFTP).
- Hub 0.9 contro **SiteGround vero**: «Configura il sito» (setup.php in JSON via HTTPS), «Invia ai siti» (FTPS), cartella
  `docmap-data/<sito>` con il `DOCUMENT_ROOT` reale. Provati con PHP 8.3 reale dietro HTTPS sul server di sviluppo.
- Sito su **SiteGround** con la v12.5 (dopo la cancellazione di studio-de del 2026-11-03).
- **Stampante** vera: foglio MRINK143 (8 etichette da dividere), calibrazione, etichettatrici a rotolo.
- **Telefoni** Android e iPhone (accesso ricordato, stati, associazione, offline) e **NFC** (solo Android/Chrome).

## 5. Limiti noti

- App installabile (26.12.9): solo da `https://` (o `localhost`); la sede in HTTP semplice o `file://` non si installa.
  La copia senza rete contiene solo il programma: i dati del server senza rete non ci sono. I tempi misurati restano sul
  dispositivo (nessun invio, nessun riepilogo centrale).

- La licenza è applicata (PHP e Python) **solo con `licence_required`**: i siti del hub 0.8 la attivano da soli con
  `setup.php`; `studio-de` e i siti fatti a mano no. Il PHP legge il canale delle licenze solo durante le richieste
  (al massimo ogni 6 ore), non in background.
- Le foto degli armadi restano solo sul PC. Le foto delle coste (inventario) stanno sul server; senza server restano
  nel browser che le ha scattate (stesso PC in modalità locale).
- Inventario: la lettura AI richiede il server online con `ai_provider` e la chiave; spedisce la foto al fornitore
  dell'AI (serve la nomina GDPR art. 28 e l'informativa al cliente). Senza, si cataloga dalla griglia di revisione.
- Inventario: una seconda scansione della stessa etichetta non sposta il faldone in un'altra scatola (si fa dalla scheda).
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
| D16 | 2026-11-06 | Clienti nuovi da **modelli** (dati del progetto senza identità del cliente) e **hosting predefinito** (un dominio, un FTP, una cartella per cliente); eccezioni nelle maschere | Dave: «nel template e nei default super rapido, poi le personalizzazioni devo poterle fare» |
| D17 | 2026-11-06 | «Attiva tutto» pubblica solo su cartelle vuote; il kit di consegna resta in memoria e non va mai sul disco del hub | velocità senza rischiare un sito in uso né lasciare chiavi del database sul PC |
| D18 | 2026-11-22 | L'indirizzo dei QR è configurabile (`qr7.it` di default); Doc Location è solo il marchio, nessun dominio forzato | Dave: «voglio essere libero, agnostico» |
| D19 | 2026-11-22 | Un progetto di inventario è un archivio con `inv`; etichette = codici brevi normali con il prefisso del progetto; record del telefono con id `inv-<codice>` | niente tipi nuovi da sincronizzare, nessun doppione, QR7 e manifest invariati |
| D20 | 2026-11-23 | CI attiva: l'unico file fuori da `docmapv1/` è `.github/workflows/docmap-ci.yml` (GitHub legge solo lì), copia identica di `ci/docmap-ci.yml` controllata dalla verifica veloce | da confermare da Dave nella PR «qualità e CI» |
| D15 | 2026-11-06 | Dopo ogni cambio di licenza il hub la carica subito sui siti online (FTP); il canale resta per la sede | la sospensione deve valere subito, non al prossimo deploy |

## 7. Prossimi passi (ordine concordato con Dave il 2026-11-06)

1. Consolidamento (questo ramo): CI, `CLAUDE.md`, `STATO.md`, `CHANGELOG.md`, `docs/RILASCIO.md`, collaudo unico.
2. Collaudo reale con Dave (`docs/COLLAUDO-REALE.md`), poi correzioni e FAQ.
3. Primi clienti: licenza applicata dal PHP, indicatore di sincronizzazione, procedura del primo avvio, aggiornatore,
   documenti commerciali.
4. Moduli a pagamento: Conservazione e scarto, Consegna documenti con firma.
5. Hub da centro di controllo: salute istanze, aggiornamenti a ondate (primo passo fatto nella 0.9: «Siti da
   aggiornare»), pannello rivenditore, pagamenti.
6. Dall'autocritica 0.9 e 0.10 (`docs/AUTOCRITICA-HUB-0.10.md` §4): sede senza chiavetta (token del ponte nel
   pacchetto). Fatto nella 0.10: lettere di benvenuto per persona (kit di consegna), modelli cliente, Attiva tutto.

Analisi completa: Claude Doc «DocMap: cosa manca e dove migliorare» (2026-11-06).
Roadmap in vigore (fasi 0–6, cancelli, prezzi, ciclo di revisione ogni 2 settimane): Claude Doc «DocMap: roadmap verso
lo stato dell'arte» (2026-11-06), riassunta in `docs/ROADMAP.md`.
