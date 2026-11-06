# Indice della documentazione DocMap

> Mappa di tutti i documenti di `docmapv1/` (versione **26.12.6**): a cosa serve ognuno, chi lo deve leggere e in che
> ordine. I percorsi sono relativi a `docmapv1/`.

## Per ripartire (tutti)

- [`../STATO.md`](../STATO.md): **dove siamo** — versioni correnti, test, cose non ancora provate, limiti, prossimi passi.
- [`../CHANGELOG.md`](../CHANGELOG.md): tutte le versioni di app, hub, server e installatore in un solo elenco.
- [`COLLAUDO-REALE.md`](COLLAUDO-REALE.md): **la scheda unica** per provare tutto su Windows, SiteGround, stampante e telefoni.
- Agenti: [`../CLAUDE.md`](../CLAUDE.md) (regole fisse) e [`RILASCIO.md`](RILASCIO.md) (procedura di ogni rilascio).

## Chi legge cosa

| Chi | Parte da | Poi |
|---|---|---|
| **Dave / chi usa DocMap in studio** (operatore) | [`MANUALE-UTENTE.md`](MANUALE-UTENTE.md) | [`GLOSSARIO.md`](GLOSSARIO.md), [`RIFERIMENTO-FUNZIONI.md`](RIFERIMENTO-FUNZIONI.md), [`CHECKLIST-COLLAUDO.md`](CHECKLIST-COLLAUDO.md), [`AGGIORNAMENTO-v10-v12.md`](AGGIORNAMENTO-v10-v12.md), [`GUIDA-SINCRONIZZAZIONE.md`](GUIDA-SINCRONIZZAZIONE.md), [`AGGIORNAMENTO-v12.1-v12.2.md`](AGGIORNAMENTO-v12.1-v12.2.md), [`AGGIORNAMENTO-v11.1-v12.md`](AGGIORNAMENTO-v11.1-v12.md) |
| **Chi gestisce il sito su SiteGround** (sistemista) | [`DEPLOY-WEB.md`](DEPLOY-WEB.md) §0 e `README-DEPLOY.md` dentro il deploy | [`MANUALE-UTENTE.md`](MANUALE-UTENTE.md) §7, §11, §12 · [`SICUREZZA.md`](SICUREZZA.md) · [`AGGIORNAMENTI.md`](AGGIORNAMENTI.md) · [`CHECKLIST-COLLAUDO.md`](CHECKLIST-COLLAUDO.md) §3, §7, §8 |
| **Sviluppatore Python** (porting del server, integrazione con il gestionale) | [`HANDOFF_PROMPT.md`](HANDOFF_PROMPT.md) (il prompt completo da incollare) | [`python/PORTING.md`](python/PORTING.md), [`python/openapi.yaml`](python/openapi.yaml), [`python/SCHEMI.md`](python/SCHEMI.md), [`API-CONTRACT.md`](API-CONTRACT.md), [`MODELLO-DATI.md`](MODELLO-DATI.md), [`SYNC.md`](SYNC.md), [`ALLINEAMENTO-PYTHON.md`](ALLINEAMENTO-PYTHON.md) |
| **Agente o sviluppatore del front-end** (JavaScript) | [`../AGENTS.md`](../AGENTS.md) | [`ARCHITETTURA.md`](ARCHITETTURA.md), [`MODELLO-DATI.md`](MODELLO-DATI.md), [`SYNC.md`](SYNC.md), [`AGGIORNAMENTI.md`](AGGIORNAMENTI.md), `tests/suite.js` |

## Ordine di lettura consigliato

1. [`../README.md`](../README.md): cos'è DocMap e come si avvia (2 minuti).
2. [`MANUALE-UTENTE.md`](MANUALE-UTENTE.md): le cose da fare, passo passo.
3. [`GLOSSARIO.md`](GLOSSARIO.md): le parole (faldone, ubicazione, tombstone, token…) con il nome nel codice.
4. Per ruolo (tabella sopra). Per lo sviluppo: `AGENTS.md` → `ARCHITETTURA.md` → `MODELLO-DATI.md` → `SYNC.md` →
   `API-CONTRACT.md` → `python/PORTING.md`.

## Tutti i documenti

### Per chi usa DocMap

| Documento | A cosa serve |
|---|---|
| [`../README.md`](../README.md) | Porta d'ingresso: cos'è, avvio in 3 passi, dove trovare il resto. |
| [`MANUALE-UTENTE.md`](MANUALE-UTENTE.md) | Manuale per compiti: prima installazione, import clienti, faldoni, stampa e PDF, manifest, ubicazioni e associazione, server SiteGround, telefoni, routine di sincronizzazione, registro e contestazioni, backup, aggiornamenti, problemi. |
| [`RIFERIMENTO-FUNZIONI.md`](RIFERIMENTO-FUNZIONI.md) | Descrizione di ogni funzione e schermata (il vecchio README), con le novità per versione come storia. |
| [`GLOSSARIO.md`](GLOSSARIO.md) | Termini italiani, inglesi e nomi nel codice. |
| [`CHECKLIST-COLLAUDO.md`](CHECKLIST-COLLAUDO.md) | Prove manuali che i test automatici non possono fare: stampante vera, PDF in Acrobat, SiteGround, telefoni, lettore USB, giornata con più dispositivi, ripristino, prova di aggiornamento. |

### Pubblicazione, sicurezza, aggiornamenti

| Documento | A cosa serve |
|---|---|
| [`DEPLOY-WEB.md`](DEPLOY-WEB.md) | Costruire la cartella del sito (`tools/build_deploy.py`), installare il database online su SiteGround, instradamento dei QR `/q/<codice>`, nginx, test locale con `php -S`. |
| [`SICUREZZA.md`](SICUREZZA.md) | Cosa è protetto e come (cifratura nel browser e sul server, token, ruoli, limiti), cosa resta da fare. |
| [`AGGIORNAMENTI.md`](AGGIORNAMENTI.md) | La procedura che vale per **ogni** aggiornamento (utente e sviluppatore) e le regole di rilascio senza perdita di dati. |
| [`AGGIORNAMENTO-v12.5-v12.6.md`](AGGIORNAMENTO-v12.5-v12.6.md) | **Guida dalla v12.5 alla v12.6**: Primi passi, stato sync sempre visibile, aggiornatore `AGGIORNA-DOCMAP.bat`, licenza controllata dai siti del hub. |
| [`AGGIORNAMENTO-HUB-0.8.md`](AGGIORNAMENTO-HUB-0.8.md) | DocMap Hub: alla 0.8 (i siti online portano chiave pubblica e licenza: il PHP controlla la licenza). |
| [`commerciale/README.md`](commerciale/README.md) | **Bozze commerciali**: scheda prodotto, listino, condizioni, nomina art. 28 GDPR, garanzia QR 10 anni, copione della demo. |
| [`AGGIORNAMENTO-HUB-0.7.md`](AGGIORNAMENTO-HUB-0.7.md) | DocMap Hub: alla 0.7 (sospendi/riattiva/revoca/modifica licenze, rinnovo automatico, canale delle licenze, esportazione cifrata). |
| [`AGGIORNAMENTO-HUB-0.6.md`](AGGIORNAMENTO-HUB-0.6.md) | DocMap Hub: alla 0.6 da 0.5 o 0.3 (deploy e promozione dal gestionale, cassaforte e accessi, siti e server dal progetto, backup automatici, ripristino). |
| [`AGGIORNAMENTO-HUB-0.3-0.5.md`](AGGIORNAMENTO-HUB-0.3-0.5.md) | DocMap Hub: dalla 0.3 alla 0.5 (nuovo gestionale per cliente, Crea progetto con AI, postazioni, Ricorda su questo PC). |
| [`AGGIORNAMENTO-v10-v10.1.md`](AGGIORNAMENTO-v10-v10.1.md) | Storia: guida dalla v10 alla v10.1 (arrivo del database online). |
| [`AGGIORNAMENTO-v10.1-v11.md`](AGGIORNAMENTO-v10.1-v11.md) | Storia: guida dalla v10.1 alla v11 (ubicazioni, registro sincronizzazioni, schema server 2). |
| [`AGGIORNAMENTO-v10-v12.md`](AGGIORNAMENTO-v10-v12.md) | **Guida diretta dalla v10.0 alla v12** (salta v10.1, v11, v11.1): backup, server facoltativo, stessa cartella, controlli, rollback. |
| [`GUIDA-SINCRONIZZAZIONE.md`](GUIDA-SINCRONIZZAZIONE.md) | **Quale sincronizzazione usare** (server o file) e i passi PC locale ⇄ web app ⇄ telefoni in entrambi i sensi. |
| [`AGGIORNARE-IL-SERVER.md`](AGGIORNARE-IL-SERVER.md) | **Aggiornare il server senza perdere niente**: cosa non toccare (`config.php`, dati), 5 passi, Verifica dopo l'aggiornamento, cosa fare se è andato storto. |
| [`AGGIORNAMENTO-v12.4-v12.5.md`](AGGIORNAMENTO-v12.4-v12.5.md) | **Guida dalla v12.4 alla v12.5**: solo file del programma (selezione che resta, Solo selezionati, ristampa delle sole etichette modificate). |
| [`AGGIORNAMENTO-v12.3-v12.4.md`](AGGIORNAMENTO-v12.3-v12.4.md) | **Guida dalla v12.3 alla v12.4**: codice di accesso facoltativo, 👁 sulle password, verifica del server. |
| [`AGGIORNAMENTO-v12.2-v12.3.md`](AGGIORNAMENTO-v12.2-v12.3.md) | **Guida dalla v12.2 alla v12.3**: solo file del programma (etichettatrici, striscia ubicazione, adesivi piccoli). |
| [`AGGIORNAMENTO-v12.1-v12.2.md`](AGGIORNAMENTO-v12.1-v12.2.md) | **Guida dalla v12.1 alla v12.2**: solo file del programma. |
| [`AGGIORNAMENTO-v12-v12.1.md`](AGGIORNAMENTO-v12-v12.1.md) | **Guida dalla v12 alla v12.1**: solo file del programma e `api.php`, nessuna migrazione. |
| [`AGGIORNAMENTO-v11.1-v12.md`](AGGIORNAMENTO-v11.1-v12.md) | **Guida dalla v11.1 alla v12**: schema locale 9, schema server 3, opzioni nuove di `config.php`. |
| [`AGGIORNAMENTO-v11-v11.1.md`](AGGIORNAMENTO-v11-v11.1.md) | Storia: guida dalla v11 alla v11.1: solo file del programma, nessuna migrazione, niente da fare sul database del server. |

La v11.1 (26.11.1) non cambia dati, chiavi di memoria, schema del database né contratto dell'API: backup, poi i file
nuovi nello stesso percorso (prima il sito, poi i PC, poi i telefoni), controllo, eventuale ritorno alla cartella vecchia.

### Tecnica: front-end e dati

| Documento | A cosa serve |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | Guida per agenti e sviluppatori: regole, mappa dei file, convenzioni, ricette (campo nuovo, vista, modello etichetta, test), versioni. |
| [`ARCHITETTURA.md`](ARCHITETTURA.md) | Moduli, ordine di caricamento, flusso dei dati, motore di stampa, PDF, registro, sincronizzazione, ubicazioni. |
| [`MODELLO-DATI.md`](MODELLO-DATI.md) | Il contratto dei dati: ogni campo, CSV (ordine delle colonne), JSON, schema SQLite locale e migrazioni, chiavi di memoria. |
| [`SYNC.md`](SYNC.md) | Sincronizzazione: pacchetti, regole di unione (LWW, tombstone, conflitti), server come peer, registro sincronizzazioni. |
| [`API-CONTRACT.md`](API-CONTRACT.md) | Il contratto REST del server (`server-php/api.php`), in italiano. |

### Tecnica: per il team Python

| Documento | A cosa serve |
|---|---|
| [`HANDOFF_PROMPT.md`](HANDOFF_PROMPT.md) | Il prompt autosufficiente da incollare all'agente Python. |
| [`python/PORTING.md`](python/PORTING.md) | Riscrivere `api.php` in FastAPI 1:1: blob AES-256-GCM, AAD, indici HMAC, JSON canonico e hash, LWW, tombstone, registro, migrazione del `docmap.sqlite`, suite contro un server Python. |
| [`python/openapi.yaml`](python/openapi.yaml) | OpenAPI 3.1 di ogni rotta, parametro, ruolo, errore. |
| [`python/SCHEMI.md`](python/SCHEMI.md) + [`python/schema/`](python/schema/) | JSON Schema di faldone, cliente, ubicazione, riga di registro attività, voce del registro sincronizzazioni, backup, pacchetto. |
| [`python/tools/validate_schemas.py`](python/tools/validate_schemas.py) | Controlla schemi e OpenAPI sui file veri dell'app (Chromium) e sul server PHP vero. |
| [`ALLINEAMENTO-PYTHON.md`](ALLINEAMENTO-PYTHON.md) | Corrispondenza campo per campo con modelli Python (dataclass, CSV). |
| [`HUB-E-API.md`](HUB-E-API.md) | Progetto (non implementato) dell'hub multi-studio: licenze, feature flag, AI. |

### Nel codice e nel deploy

| File | A cosa serve |
|---|---|
| `tests/suite.js` | La specifica eseguibile: circa 1050 controlli Playwright (circa 6 minuti). |
| `server-php/config.sample.php` | Le chiavi di `config.php` commentate. |
| `deploy/studio-de/README-DEPLOY.md` | Generato da `tools/build_deploy.py`: caricamento passo passo per SiteGround. |
| `deploy/studio-de/DEPLOY-MANIFEST.txt` | SHA-256 di ogni file del deploy. |
