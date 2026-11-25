# STATO di Doc Location (nome tecnico DocMap) — fonte unica

> Aggiornato al **2026-11-25**. Chi cambia una versione, un test o una decisione aggiorna questo file nello stesso
> commit. Per ripartire dopo una pausa (persona o agente) si legge questo, poi [`CHANGELOG.md`](CHANGELOG.md).

## 1. Versioni correnti e cosa va con cosa

| Componente | Versione | Dove si legge | Zip per Dave (file del progetto) |
|---|---|---|---|
| App Doc Location (PC, web, telefono) | **26.12.19** (v12.19: correzioni dal percorso vero per il collaudo completo, cioè «Prelevati» con i «Preso» del telefono, destinazione dei QR = il sito stesso, niente 404 su `q/brand.js`; prima 26.12.18: ⚙ › Strumenti per l'amministratore, porta verso il programma delle ricette per i documenti; prima 26.12.17: lettura AI con fiducia per campo e campi da controllare, vocabolario dei tag del cliente con tag suggeriti, banco di prova dei fornitori AI; prima 26.12.16: inventario per scatole e faldoni in tutte le modalità, cioè etichette FUORI e DENTRO, faldoni senza etichetta, conteggio a livello scatola, codice leggibile grande o nascosto, foto della scatola con la posizione delle etichette, dati per l'addestramento; prima 26.12.15: raffica di più etichette nella stessa inquadratura, obiettivo del progetto con avanzamento e ora di fine; prima 26.12.14: coda del telefono che riprova da sola e non perde niente anche con la memoria piena, copia di sicurezza importabile sul PC, stima di un lavoro; prima 26.12.13: inventario fasi 3 e 4, cioè stazione fissa, catena a due, verifica scatole, lettore Bluetooth, documenti, modelli, prezzi, report di fine lavoro, AI con qualsiasi fornitore; prima 26.12.12: nuovo nome Doc Location, marchio in un solo file `brand.js`, lingue dal marchio; prima 26.12.11: nuovo anno in un clic, scarto proposto con verbale, «Dove lo metto?», ricerca a voce) | `APP_VERSION` in `assets/js/02-core.js`; marchio: `brand.js` (`docs/MARCHIO.md`) | dentro lo zip completo `docmapv1/python/DocMap-hub-0.14.1-app-26.12.19-strumenti-0.4.0.zip` |
| Database locale (SQLite nel browser) | schema **9** | `DB_SCHEMA_VERSION` in `assets/js/06-db.js` | — |
| Server web PHP (`server-php/api.php`) | 26.12.19 (v12.19 e v12.18: solo il numero; v12.17: `ai_spine` restituisce anche `field_conf` e `prompt_v`; v12.16, v12.15 e v12.14: solo il numero; v12.13: `ai_provider` anche `openai_compatible` / `ollama`, `ai_base_url`, `hints.kind`, `project&detail=1`; v12.12: solo il numero, più `brand.php` che legge il marchio per `setup.php`; v12.11: solo il numero; v12.10: rotta pubblica `finder`, solo GET, solo il contatto del faldone smarrito), schema **3**, licenza con `licence_required`; `setup.php` con cartella per sito e modalità JSON; v12.8: rotte `project`, `photo_put`, `photo`, `ai_spine` | `DM_APP_VERSION`, `DM_SCHEMA` | dentro lo zip dell'app (`deploy/`) |
| Server Python (sede) | pacchetto 1.0.0, parità con PHP 26.12.19 (anche sulla licenza, sull'inventario, sui fornitori AI e su `finder`) | `server-python/docmap_server/__init__.py` | dentro l'installer |
| Strumenti di installazione Windows | 1.2.1 (pacchetto della sede senza `__pycache__`) | `TOOLS_VERSION` in `installer-windows/docmap_tools.py` | dentro lo zip completo (`installer-windows/`); i pacchetti per i clienti li fa l'hub (il vecchio `DocMap-installer-26.12.7.zip` è in `vecchie-versioni/`) |
| Hub (PC di Dave) | **0.14.1** (0.14.1: «Attiva tutto» crea la cartella del cliente via FTP, «Prova il collegamento» dell'hosting; prima 0.14.0: Strumenti nei piani: crediti al mese e server remoto per piano, gettone del server degli Strumenti per cliente con i crediti che seguono la licenza; prima 0.13.0: marchio per rivenditore e cliente, listino unico `plans.json`, preventivi), registro schema **4** (`registry.py`); meta `hub_version` | `hub/docmap_hub/__init__.py` | `docmapv1/python/DocMap-hub-0.14.1-app-26.12.19-strumenti-0.4.0.zip` (**zip completo**: hub + app 26.12.19 + sito + Strumenti + server + installatore + guide; fatto e controllato da `tools/crea-zip.py`) |
| Strumenti (ricette per i documenti) | **0.4.0** (0.4.0: base AI e OCR a moduli, profili cascata e confronto, compiti, PaddleOCR, plugin, `ai confronta`; 0.3.0: AI agnostica con fornitori OpenAI, Gemini, Anthropic, compatibili, vLLM, Ollama e le tue workstation, profili con riserva, alias dei modelli, prova del collegamento; 0.2.0: licenza dell'hub, cioè lavori, «sul server» e crediti del mese decisi dal piano, dati mai bloccati; 0.1.1: `/api/ping` e `/api/summary` per la pagina dell'app; 0.1.0: 20 blocchi, 11 ricette pronte, coda, verifica da tastiera, remoto, crediti; formato `docmap-ricetta/1`) | `strumenti/docmap_strumenti/__init__.py` | dentro lo zip completo (`strumenti/`, avvio `AVVIA-STRUMENTI.bat`) |
| Gateway workstation (sulle macchine con la GPU) | **0.1.1** (0.1.1: `"enabled": false` per un backend, vLLM spento nell'esempio, registro accanto alla configurazione; 0.1.0 nuovo: gettone, coda, nomi dei modelli, stato della GPU davanti a vLLM/Ollama; protocollo `docmap-workstation/1`) | `workstation/docmap_workstation/__init__.py` | dentro lo zip completo (`workstation/`, guida `workstation/README.md`) |
| Aggiornatore del PC | con l'app | `AGGIORNA-DOCMAP.bat` + `tools/aggiorna-app.ps1` | dentro lo zip dell'app |

Regola: lo **stesso numero 26.12.x** deve comparire in app, `api.php` e server Python. Il server PHP e quello Python
leggono e scrivono lo stesso `docmap.sqlite` (si passa dall'uno all'altro senza conversione).

## 2. Codice

- **2026-11-23: tutto è in `main`** (unico ramo vero): PR #9 (app 26.12.10), #10 (qualità e CI), #11 (app 26.12.11),
  #12 (hub 0.12.0), unite con la PR di integrazione del ramo `claude/project-thread-imzwad`. Le PR #1–#8 sono unite o
  chiuse (già incluse). **Ogni thread nuovo parte da `main` aggiornato** e apre la sua PR verso `main`; la CI su GitHub
  deve essere verde prima dell'unione.
- Storia dei rami: consolidamento `claude/project-thread-5qvqr5` (PR #4, app 26.12.6 + server Python + installatore + hub
  0.8); hub 0.9–0.11 `claude/project-thread-acqq2g` (PR #5); app 26.12.8 `claude/project-thread-epf33l` (PR #7); app
  26.12.9–26.12.10 `claude/project-thread-1dzp8h` (PR #8, #9); app 26.12.11 `claude/project-thread-o4rwcv` (PR #11); hub
  0.12.0 `claude/project-thread-4o1oly` (PR #12); qualità e CI `claude/project-thread-imzwad` (PR #10 e integrazione);
  app 26.12.12 + hub 0.13.0 (marchio) `claude/project-thread-m9635a` (PR #15); app 26.12.13 (inventario fasi 3 e 4)
  `claude/project-thread-dvih10` (PR #16), riallineata a `main` dopo la PR #15; app 26.12.14 (inventario più solido)
  di nuovo `claude/project-thread-dvih10` (ripartito da `main` dopo la #16), PR #17 unita il 2026-11-24; app 26.12.15
  (raffica, obiettivo) stesso ramo ripartito da `main` dopo la #17, PR #18 unita il 2026-11-24; app 26.12.16 (scatole e
  faldoni, tutte le modalità) stesso ramo ripartito da `main` dopo la #18, PR #19 unita il 2026-11-24; app 26.12.17
  (fondamenta della lettura AI) stesso ramo ripartito da `main` dopo la #19.

## 3. Test

| Cosa | Comando | Durata | Ultimo esito |
|---|---|---|---|
| Verifica veloce (tutto tranne la suite completa) | `bash tools/verifica-veloce.sh` | ~4 min | tutto OK (2026-11-24, hub 0.14.0 + Strumenti 0.2.0) |
| Lint JS / Python | `node tools/lint-js.js`, `python3 tools/lint-py.py` (dentro la verifica veloce) | 5 s | 0 problemi (2026-11-23) |
| Test app tutti insieme (smoke, unit, aggiornamento, marchio, v12.6 … v12.17) | `cd tests && NODE_PATH=$(npm root -g) node run.js` | ~40 s | 20/20 file OK (2026-11-24) |
| Suite completa app (Playwright) | `cd tests && NODE_PATH=$(npm root -g) node suite.js` | ~35 min | **1376/1376** (2026-11-24, app 26.12.18 + hub 0.14.0 + Strumenti 0.2.0), con il test «J UI: registro del server filtrato per codice» reso stabile (aspetta il ricaricamento invece di 250 ms fissi) |
| CI su GitHub | `.github/workflows/docmap-ci.yml` (= `ci/docmap-ci.yml`), Ubuntu 24.04 | ~5 min | verde sulla PR #10 (2026-11-23); unica cartella fuori da `docmapv1/`, confermata da Dave (D20) |

Come sono fatti i test e come aggiungerne: [`docs/TEST.md`](docs/TEST.md).

### Esito 2026-11-25, collaudo del pacchetto (app 26.12.19, hub 0.14.1, gateway 0.1.1, installatore 1.2.1)

- Richiesta di Dave: «tutto veramente solido e pronto per un mio test completo da inizio a fine». Fatto: zip estratto in
  una cartella vuota e percorso vero rifatto su Linux con **Apache 2.4 + PHP 8.3 + FTPS (pyftpdlib)** come SiteGround:
  hub nuovo, hosting, «Studio grande · sede + online + demo» › Attiva tutto, kit, primo accesso dal PC, import di 3
  clienti con un faldone ciascuno, telefono (Pixel 7 simulato) dal QR `…/q/<codice>` con il codice della segreteria,
  «Preso», pacchetto della sede, Strumenti con Tesseract (fatture TIFF per numero), gateway con un Ollama finto e
  profilo «workstation» degli Strumenti.
- Trovati e corretti: **Attiva tutto fermo su un cliente nuovo** via FTP (`550`, la cartella del sito non si creava:
  `deploy.py`, anche SFTP; test `hub/tests/test_v03_ftp_root.py`); **destinazione dei QR** di un sito nuovo = il vecchio
  pilota `…/studio-de/q/…` (manifest sbagliato: `qrDest` in `docmap.config.js` + `migrate()`); «Prelevati» a 0 dopo
  «Preso» dal telefono; 404 su `q/brand.js`; `__pycache__` nel pacchetto della sede; guide dello zip in testo grezzo
  (mancava `markdown`: ora `crea-zip.py` si rifiuta e la CI la installa); nome dello zip senza Strumenti; esempio del
  gateway con vLLM rosso; registro del gateway nella cartella di avvio; «1 mesi». Nuovo: **Prova il collegamento**
  dell'hosting (`hub/tests/test_v141_collaudo.py`).
- Scheda unica `docs/COLLAUDO-REALE.md` riscritta nell'ordine vero (blocchi 0-12, risultati attesi, tabella dalle righe
  vecchie). Test: `tests/v1219.js` 7/7, `tests/v129.js` 26/26, verifica veloce tutto OK.
- Non provato: Windows, SiteGround, telefoni, stampante, Ollama veri (è la scheda).

### Esito 2026-11-25, Strumenti 0.4.0 (base AI e OCR a moduli, più modelli insieme)

- Richiesta di Dave: «base solida… collegare diversi modelli anche contemporaneamente a seconda della situazione… OCR senza AI… ben documentato, modificabile, espandibile». Fatto: pacchetto `strumenti/docmap_strumenti/ai/` (base, un modulo per famiglia di fornitori, catalogo, router con riserva/cascata/confronto e compiti, plugin), registro OCR `ocr_engines.py` (text, tesseract, paddleocr, remote, ai), `ai_cli.py` (`ai fornitori | profili | prova | confronta`), schede Impostazioni › AI e › OCR rifatte, esempi di plugin. Guida unica `docs/AI-FORNITORI.md` riscritta.
- Test: `strumenti/tests/test_ai_v040.py` (moduli, compiti, cascata, confronto in parallelo, voto per campo, plugin buono e rotto, esempi di plugin, registro OCR con ordine/soglia/motore rotto, `confronta` con testo vero); i test della 0.3.0 passano invariati (nome `ai_registry` mantenuto). Interfaccia provata nel browser (profilo cascata salvato e provato, compito OCR, soglia).
- Dave 2026-11-25: Inkling 2 Mini **gira bene e veloce sulla sua RTX 3060 da 12 GB**: tolti dalla documentazione gli avvisi «servono 32 GB / più lento».
- Non provato: servizi veri, PaddleOCR vero (non installato qui), workstation vera (righe S11–S18 di `COLLAUDO-REALE.md`).

### Esito 2026-11-25, Strumenti 0.3.0 + gateway workstation 0.1.0 (AI agnostica)

- Fatto: registro dei fornitori (`strumenti/docmap_strumenti/ai_registry.py`), pool di workstation (`workstations.py`), gateway (`workstation/`), schede Impostazioni › AI e › Workstation, `/api/ai` e `/api/ai/test`. Test: `strumenti/tests/test_ai_registry.py` (forma della richiesta di ogni fornitore con un server finto, alias, riserva, giri chiusi, segreti mascherati, pool con gateway veri in-process),
  `workstation/tests` (gettone, IP, instradamento per modello, 429 con coda piena, `/dm/v1/read`, ragionamento tolto).
- Ricerca: il modello di Dave è **Inkling 2 Mini** (Thinking Machines Lab, 2026-11-20); «loop» = looped transformer, nessun parametro di chiamata (`docs/AI-FORNITORI.md` §4).
- Non provato: servizi veri (OpenAI, Gemini, Claude), vLLM con Inkling sulla workstation Kubuntu di Dave, più workstation in rete (righe S11–S15 di `COLLAUDO-REALE.md`). Sito e server di sede non cambiano (prossimo passo A in `AI-FORNITORI.md` §5).

### Esito 2026-11-24, hub 0.14.0 + Strumenti 0.2.0 (Strumenti nei piani)

- Test nuovi, nella verifica veloce: `hub/tests/test_v14_strumenti.py` 5/5 (piani con funzioni e crediti; chiave del
  server degli Strumenti solo cifrata, mai nel registro in chiaro; prova del collegamento; gettone contro un **server
  degli Strumenti vero in modalità remota**: piano senza remoto rifiutato, gettone mostrato una volta e non conservato,
  un gettone nuovo annulla il vecchio, sospensione = 0 crediti, riattivazione = crediti del piano, revoca; server non
  raggiungibile detto chiaro; rotte della pagina). `strumenti/tests` 53/53 (nuovo `test_licence.py`: copia identica del
  verificatore, senza licenza come prima, piano che decide modalità e crediti, tetto più basso dello studio, casi
  bloccati, file rifiutati, rotte e blocchi del server, aggiornamento dei crediti di un gettone). Hub e server Python:
  attese dei limiti aggiornate con `strumenti_credits`.
- Suite completa: il test «J UI: registro del server filtrato per codice» ora aspetta che il ricaricamento dopo il
  filtro (250 ms di attesa nel codice) parta e finisca, invece di un'attesa fissa di 250 ms che a volte leggeva prima.
- Non provato: licenza installata negli Strumenti su Windows, server degli Strumenti remoto vero con HTTPS e gettone
  dato dall'hub (righe S8–S10 di `COLLAUDO-REALE.md`). Il consumo dei crediti non torna all'hub.

### Esito 2026-11-24, app 26.12.18 (Strumenti nell'app)

- Test nuovo, nella verifica veloce: `tests/v1218.js` 20/20 (collegamento con la chiave e indirizzo di apertura, voce
  del menu solo per l'amministratore e pagina rifiutata a chi consulta, Strumenti spenti con le istruzioni, server
  Strumenti vero avviato dal test: versione, lavori da verificare con la chiave, «Apri la verifica» sulla vista Lavori
  con la chiave tolta dalla barra degli indirizzi, chiave solo in `localStorage`, dimentica la chiave, aiuto, niente
  scorrimento orizzontale a 390 px). `strumenti/tests` 46/46 (nuovo: ping e riepilogo con CORS solo su quei due).
  `tests/upgrade.js` anche dal rilascio 26.12.17 (103875b). CI: Tesseract installato, il test OCR vero ora gira.

### Esito 2026-11-24, app 26.12.17 (fondamenta della lettura AI)

- Test nuovo, nella verifica veloce: `tests/v1217.js` 40/40 (modello: `field_conf` dal modello, limitata, 0 sui campi
  vuoti, letture vecchie, campi da controllare, stato dopo la lettura, lettura salvata con fornitore e versione del
  prompt, **stessa normalizzazione e stesso schema del server Python**; vocabolario: sinonimi, parole escluse, voce,
  trascrizione, suggerimenti mai con nomi, modelli; banco di prova: punteggio per campo, riepilogo, affidabilità; PC:
  campo incerto → da rivedere, giallo, mai confermato in blocco, scheda vocabolario con salva / aggiungi / escludi, banco
  di prova con un modello locale finto, tutto conservato dopo il ricaricamento; telefono carica lo stesso modello).
  Server Python: nuovo `test_field_conf_v1217`. `tests/upgrade.js` anche dal rilascio 26.12.16 (ff1145f).
- Provato solo con letture finte: **fiducia per campo con un modello vero (i campi gialli sono davvero quelli
  sbagliati?), vocabolario su un archivio vero, banco di prova con l'AI vera mai provati** (righe D40–D42 di
  `COLLAUDO-REALE.md`).

### Esito 2026-11-24, Strumenti 0.1.0 (ricette per i documenti)

- Test nuovi, nella verifica veloce: `strumenti/tests` 45/45 (modelli e filtri dei nomi, ricette e versioni, condizioni,
  ordine naturale dei file, un file rotto non ferma gli altri, prova senza toccare niente, ogni blocco su TIFF/PDF/immagini
  finti, Tesseract vero se installato, coda, verifica con annulla, registro manomesso scoperto, crediti finiti, gettoni,
  server con chiave e Host, cartelle, impostazioni mascherate, cliente remoto limitato ai suoi lavori, lavoro remoto
  completo con verifica dal PC, licenza senza remoto, AI finta openai_compatible e anthropic, servizio esterno).
- Prova nel browser (Playwright): ricette, editor, prova, esecuzione, verifica con Invio, ripresa, risultati; nessun
  errore in console, niente scorrimento orizzontale a 390 px.
- Non provato: Windows vero (`AVVIA-STRUMENTI.bat`, Tesseract per Windows), scansioni vere, server remoto vero (S1–S6).

### Esito 2026-11-24, app 26.12.16 (scatole e faldoni, tutte le modalità)

- Test nuovo, nella verifica veloce: `tests/v1216.js` 29/29 (modello: `inv.plan` con i valori di partenza, due copie per
  le scatole FUORI e DENTRO, codice senza etichetta fuori dal prefisso del progetto, scatola con conteggio, anni, tag e
  foto normalizzati, posizione delle etichette in frazioni, registro dei riconoscitori, report e prezzo con i faldoni
  contati, dati per l'addestramento; PC: scelte del progetto salvate e registrate, stampa con FUORI e DENTRO, codice
  grande più grande del normale, nascosto senza numero; telefono in locale:
  conteggio con − e +, foto della scatola con le etichette prese, faldone senza etichetta con foto, livello scatola con
  tag e anni sulla scatola, niente scorrimento orizzontale; PC: dati della scatola arrivati dal telefono, tabella Scatole,
  report e prezzo con i contati, file per l'addestramento). `tests/upgrade.js` anche dal rilascio 26.12.15 (74ed48c).
- Provato solo in Chromium con una fotocamera finta: **etichette FUORI e DENTRO su scatole vere, foto di una scatola
  aperta vera (quante etichette riconosciute), codice grande letto da lontano, faldoni senza etichetta in un archivio
  vero mai provati** (righe D36–D39 di `COLLAUDO-REALE.md`).

### Esito 2026-11-24, app 26.12.15 (raffica, obiettivo con ora di fine)

- Test nuovo, nella verifica veloce: `tests/v1215.js` 23/23 (modello: avanzamento, minuti in testo, ordine della raffica
  con la scatola prima e due scatole scartate, striscia della costa dentro l'inquadratura, `target`; lettore: ogni codice
  di un'inquadratura una volta sola; PC: obiettivo scritto dalla stima, salvato e registrato, avanzamento nella scheda
  Lavoro anche dopo il telefono; telefono in locale: raffica spenta = un codice, accesa = tre faldoni in ordine nella
  scatola, foto ritagliata, etichette già fatte in silenzio, due scatole rifiutate, ora di fine al ritmo misurato, niente
  scorrimento orizzontale). `tests/upgrade.js` anche dal rilascio 26.12.14 (d34999d).
- Provato solo in Chromium con un lettore finto: **raffica con una fotocamera vera (quante etichette per inquadratura,
  a che distanza), ora di fine su una giornata vera mai provate** (righe D34–D35 di `COLLAUDO-REALE.md`).

### Esito 2026-11-23, app 26.12.14 (inventario più solido, stima del lavoro)

- Test nuovo, nella verifica veloce: `tests/v1214.js` 24/24 (modello: stima da metri e da scatole, input vuoti o sbagliati,
  lettura della copia di sicurezza che scarta record e foto estranei; PC: stima con il ritmo dei progetti passati e
  progetto creato con le etichette giuste; telefono con server finto: 5xx e 429 aspettano con pausa e si svuotano da soli,
  accesso scaduto ferma e riparte con ↻, rifiuto vero segna solo quel faldone, AI abbandonata dopo 3 tentativi, memoria
  piena annulla la scansione e ferma le nuove, poi riparte; pannello dello stato, copia di sicurezza, pulizia delle foto;
  PC: importazione due volte senza doppioni). `tests/upgrade.js` dai rilasci 26.12.7, 26.12.11, 26.12.12, 26.12.13.
- Provato solo in Chromium con rete e memoria simulate: **rete che va e viene su un telefono vero, copia di sicurezza
  passata al PC, stima su uno scaffale vero mai provati** (righe D31–D33 di `COLLAUDO-REALE.md`).

### Esito 2026-11-23, app 26.12.13 (inventario fasi 3 e 4, AI agnostica; codice scritto come 26.12.12 e rinumerato dopo la PR #15)

- Test nuovo, nella verifica veloce: `tests/v1212.js` 50/50 (modello: modalità, lotti doc/jolly, prezzi a tre livelli,
  fatturazione, modelli, verifica, report; PC: modulo con modello e prezzi, lotti, filtro livello, scheda Lavoro, report
  e CSV, salva modello, diretta, Impostazioni › Inventario, AI locale con servizio finto; telefono in locale: stazione,
  documenti dentro il faldone, jolly, foto della pagina, riepilogo scatola, verifica con mancanti / fuori posto / Sposta
  qui, lettore a tastiera veloce sì e scrittura lenta no; server PHP vero: `detail=1`, riga di verifica, AI dal PC con
  `mock`; dati della 26.12.11). Server Python: `test_inventory_ai.py` 7/7 (anche OpenAI-compatibile e Ollama);
  `diff_test.py` con un servizio OpenAI finto locale: PHP e Python mandano la stessa richiesta e danno la stessa risposta.
  `tests/upgrade.js` dai rilasci 26.12.7, 26.12.11, 26.12.12: vedi la verifica veloce.
- Verifica veloce: tutto OK (lint, hub, server Python, parità PHP ⇄ Python, zip, installatore, 15/15 file di test app;
  `v1211.js` legge la versione da `02-core.js`). Suite completa sul codice unito: vedi §3.
- Provato solo in Chromium con fotocamera, lettore e servizi AI finti: **stazione fissa con un supporto vero, lettore
  Bluetooth vero, Ollama vero, chiave AI vera, stampa del report mai provati** (righe D23–D30 di `COLLAUDO-REALE.md`).
### Esito 2026-11-23, app 26.12.12 + hub 0.13.0 (Doc Location, white label, listino)

- Test nuovi: `tests/marchio.js` 27/27 (nome di `brand.js` ovunque; una copia costruita con un altro marchio non mostra
  mai «Doc Location» né «DocMap» nelle viste, nei dizionari, nell'aiuto e sul telefono; colore, sigla, prefisso dei
  file, una sola lingua; `brand.py` rifiuta marchi sbagliati e un dominio dei QR) e `hub/tests/test_v13_marchio.py` 13
  (marchio rivenditore → cliente senza l'identità originale, deploy con il marchio, CLI, API, listino generato,
  preventivi, `plans.json` locale, pacchetti). Lint: regola `brand-literal` (JS e Python).
- Verifica veloce: tutto OK (hub 191, server Python 36, installatore 76, parità PHP ⇄ Python, test app 14/14 file).
  Suite completa: **1376/1376** (errors: none), dopo aver fatto seguire al marchio i controlli su metadati PDF, nomi dei
  file scaricati e «Informazioni su …». Corretto anche il tipo «backup» nel Registro attività per i file `…_workspace_<data>`.
- Non provato: nome nuovo su telefoni veri e app installata (righe G1–G5 di `COLLAUDO-REALE.md`).

### Esito 2026-11-23, qualità e CI (nessuna versione nuova dell'app)

- Nuovi controlli: `tools/lint-js.js` (nomi tra i file di ogni pagina + regole eslint che sono sempre difetti),
  `tools/lint-py.py` (pyflakes, solo difetti veri), `tests/unit.js` 132/132 (funzioni pure v12.10 in due fusi orari),
  `tests/upgrade.js` 28/28 (dati creati dalle vere 26.12.7 e 26.12.9 aperti dalla versione attuale e poi di nuovo dalla
  vecchia), `tests/run.js` (test app in parallelo: ~40 s invece di ~4 min), `tests/lib/harness.js` (aiuto comune).
- Difetti trovati e corretti: e-mail del faldone smarrito che accettava `?cc=` / `&body=` (si poteva aggiungere un
  destinatario al link mailto; ora solo indirizzi semplici e link codificato); 4 testi italiani duplicati nel dizionario
  inglese dell'inventario; una riga morta in `06j-status.js`.

### Esito 2026-11-23, app 26.12.11 (nuovo anno, scarto, dove lo metto, voce)

- Test nuovo, nella verifica veloce: `tests/v1211.js` 49/49 (anni e serie, `yrShift`, frasi a voce → ricerca anche sul
  telefono, «Dove lo metto?» con capienza e albero, scheda «Metti qui», nuovo anno: piano, spunte, crea, stampa solo i
  nuovi, niente doppioni, Annulla, opzioni, Oggi; scarto: regole, esclusi, verbale con impronta, firma richiesta,
  distruzione, codici mai riusati, Annulla, verbale annullato, backup, regole condivise, avviso annuale; microfono finto
  su Archivio e Ctrl+K; dati della 26.12.10). `tests/v1210e.js`: il menu Lavoro ora ha anche Nuovo anno e Scarto.
- Verifica veloce: tutto OK (v1211 49/49). Suite completa 2026-11-23: **1376/1376** (errors: none) dopo aver aggiornato 2
  controlli della suite (il menu ⚙ ha anche Nuovo anno e Scarto; README / INDICE / HANDOFF_PROMPT con 26.12.11).
- Provato solo in Chromium con un riconoscimento vocale finto: **microfono vero, stampa vera del verbale e regole di
  conservazione con un consulente mai provati** (righe D19–D22 di `COLLAUDO-REALE.md`).

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

### Esito 2026-11-23, hub 0.12.0 (aggiornare e riparare senza paura)

- Backup automatico al primo avvio di ogni versione nuova (meta `hub_version`/`hub_version_max`), ogni backup
  controllato subito (`backups.verify`), ripristino sicuro `ripristina-backup` / `hub\RIPRISTINA-BACKUP.bat` (sposta i
  dati di adesso in `backups\prima-del-ripristino-<ora>\`, mai cancella), `controllo` (`doctor.py`) anche con registro
  rovinato, messaggio chiaro su `sqlite3.DatabaseError`, avviso hub più vecchio dei dati, `cliente situazione` /
  Clienti › Situazione (Excel) (`report.py`). Pyflakes pulito sul codice dell'hub.
- Test: hub 178 (18 nuovi in `test_v12_manutenzione.py`: migrazione da ogni schema 1–3, schema più nuovo, versioni,
  backup rovinati, ripristino, CLI, API, CSV). Non provato su Windows: `RIPRISTINA-BACKUP.bat` e lo spostamento delle
  cartelle con file aperti (righe F6–F9 in `COLLAUDO-REALE.md`).

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

- App 26.12.17 (righe D40–D42): campi gialli con un modello vero, vocabolario su un archivio vero, banco di prova con
  l'AI vera.
- App 26.12.16 (righe D36–D39): etichette FUORI e DENTRO su scatole vere, foto della scatola aperta, codice grande
  letto da lontano, faldoni senza etichetta.
- App 26.12.15 (righe D34–D35): raffica con un telefono Android vero e una scatola aperta, ora di fine su una giornata vera.
- App 26.12.14 (righe D31–D33): rete che va e viene durante l'inventario, copia di sicurezza dal telefono al PC, stima
  su uno scaffale vero.
- App 26.12.13 (righe D23–D30): stazione fissa con un supporto vero e velocità a faldone, lettore Bluetooth, catena a due
  con il PC in diretta, verifica di una scatola, documenti, report stampato, Ollama sul PC, chiave AI vera (dopo il legale).

- App 26.12.11 (righe D19–D22): nuovo anno sui dati veri (titoli strani, clienti scritti in modi diversi), «Dove lo metto?»
  sugli scaffali veri, regole di scarto viste da un consulente e verbale stampato, ricerca a voce con un microfono vero.

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

- Scarto (26.12.11): è una **proposta** con regole indicative (non consulenza legale, non conservazione a norma). I verbali
  stanno nel salvataggio del PC e nei backup, non sul server (le regole sì). Un faldone senza anno non viene mai proposto.
- Nuovo anno: le serie si riconoscono da cliente + categoria + titolo senza anni; un cliente scritto in due modi senza
  Codice Multi forma due serie. Ricerca a voce: riconoscimento del browser (può usare un servizio online del browser).

- App installabile (26.12.9): solo da `https://` (o `localhost`); la sede in HTTP semplice o `file://` non si installa.
  La copia senza rete contiene solo il programma: i dati del server senza rete non ci sono. I tempi misurati restano sul
  dispositivo (nessun invio, nessun riepilogo centrale).

- La licenza è applicata (PHP e Python) **solo con `licence_required`**: i siti del hub 0.8 la attivano da soli con
  `setup.php`; `studio-de` e i siti fatti a mano no. Il PHP legge il canale delle licenze solo durante le richieste
  (al massimo ogni 6 ore), non in background.
- Le foto degli armadi restano solo sul PC. Le foto delle coste (inventario) stanno sul server; senza server restano
  nel browser che le ha scattate (stesso PC in modalità locale).
- Inventario: la lettura AI dal telefono richiede il server con `ai_provider`; con un fornitore in cloud la foto esce
  dallo studio (bozze GDPR in `docs/commerciale/`, da far vedere al legale); con `ollama` in sede o il modello locale del
  PC no. Il modello locale del PC legge solo quando lo chiedi (**Leggi con l'AI**), non durante la scansione. Senza AI
  si cataloga dalla griglia di revisione.
- Inventario 26.12.13: prezzi, modelli e modello locale stanno nelle impostazioni di quel PC (backup sì, sincronizzazione
  no); la verifica di una scatola è una riga del registro, non cambia i faldoni da sola (solo **Sposta qui**). Un'app
  26.12.12 o precedente apre i progetti nuovi come *Cattura ora* e i lotti Documenti / Jolly come faldoni. Il lettore Bluetooth è
  riconosciuto dalla velocità dei tasti (meno di 60 ms l'uno dall'altro, poi Invio): un lettore impostato più lento va
  usato nel campo del codice.
- Inventario: una seconda scansione della stessa etichetta non sposta il faldone in un'altra scatola (si fa dalla scheda o
  con **Verifica una scatola › Sposta qui**).
- Aggiornamento del PC con `AGGIORNA-DOCMAP.bat` (mai provato su Windows reale); server e telefoni come prima.
- I documenti commerciali (`docs/commerciale/`) sono bozze: prezzi non validati, testi legali da rivedere.
- Strumenti: dall'app si aprono e si vedono i lavori da verificare (⚙ › Strumenti); dall'hub 0.14 piani, licenza,
  crediti e gettoni del server remoto (il server remoto si accende ancora a mano; il consumo non torna all'hub per la
  fattura); dal sito online il controllo è bloccato
  dal browser (CSP `connect-src 'self'`), resta il pulsante «Apri».

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
| D20 | 2026-11-23 | CI attiva: l'unico file fuori da `docmapv1/` è `.github/workflows/docmap-ci.yml` (GitHub legge solo lì), copia identica di `ci/docmap-ci.yml` controllata dalla verifica veloce | confermato da Dave il 2026-11-23 (eccezione alla regola 1 di `CLAUDE.md`) |
| D21 | 2026-11-23 | Il nome del prodotto sta solo in `brand.js` (prodotto) → marchio del rivenditore → marchio del cliente; nessun nome nel codice (lint `brand-literal`); i nomi tecnici `docmap` restano | Dave: rivendere in white label e cambiare nome «molto rapidamente» |
| D22 | 2026-11-23 | Prezzi solo in `hub/docmap_hub/plans.json` (bozza 39/89/190/99+600/290–590 €/mese, annuale = 10 mesi); prezzi di un cliente = suo preventivo; lingue IT + EN, scelte dal marchio | Dave: «unica fonte di verità per ciascun dato dove ha senso» |
| D23 | 2026-11-23 | Lettura AI agnostica: `ai_provider` = spento · `anthropic` · `openai_compatible` · `ollama` (locale) · `mock`; stesso prompt in app, PHP e Python; l'operatore non aspetta mai l'AI. Le tariffe che chi usa l'app applica ai propri clienti per un inventario (non il listino del software, che resta in `plans.json`, D22) hanno una fonte per livello: `INV_PRICE_DEFAULT` (valori di partenza) < Impostazioni › Inventario < preventivo nel progetto | Dave 2026-11-23: «fai tu, ben documentato, facile da modificare, unica fonte di verità per ciascun dato» |
| D15 | 2026-11-06 | Dopo ogni cambio di licenza il hub la carica subito sui siti online (FTP); il canale resta per la sede | la sospensione deve valere subito, non al prossimo deploy |

## 7. Prossimi passi (ordine concordato con Dave il 2026-11-06)

**Dopo il collaudo completo (proposta 2026-11-25, da confermare con Dave), in ordine:**

1. Correggere le righe ❌ del collaudo (`docs/COLLAUDO-REALE.md`) e farne domande frequenti.
2. **Prova su Windows nella CI** (GitHub `windows-latest`): `run_windows.bat info`, `AVVIA-STRUMENTI.bat info`,
   `installa.ps1` in prova secca, `aggiorna-app.ps1`; oggi nessun `.bat`/`.ps1` gira mai in automatico.
3. **Manifest su qr7.it senza passaggi a mano**: l'hub lo carica da solo (se QR7 ha un'API, decisione aperta) dopo
   Attiva tutto e dopo ogni stampa; oggi è il passo 4.4a della scheda.
4. **Destinazione dei QR anche nel pacchetto della sede** (oggi arriva solo con la sincronizzazione dal sito).
5. `AGGIORNA-DOCMAP.bat` con lo zip completo: copiare solo i file dell'app (oggi copia anche `hub\`, `strumenti\`…).
6. «Prova il collegamento» anche per l'FTP proprio di un cliente e per l'indirizzo della sede; poi i passi A-E di
   `AI-FORNITORI.md` §5 (stessi profili AI nel sito, consumo dei crediti verso l'hub).


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
