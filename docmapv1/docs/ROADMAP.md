# Roadmap DocMap: dall'MVP a Python, hub e vendita

> Stato al 2026-11-02. Scritta dopo l'audit del layer Python «ArchivioSmartHub» e le risposte di Dave del 2026-11-01.
> Documento di strategia completo (perché, prezzi, architettura): Claude Doc «DocMap: strategia Python, architettura e
> business». Avanzamento passo per passo: [`PROGRESS-LOG.md`](PROGRESS-LOG.md) (**leggilo per ripartire**).

## 1. La decisione

**Python cresce dall'MVP.** L'interfaccia resta quella dell'MVP (`index.html`, `scan.html`, web app). Il server Python
nasce come **porting 1:1 di `server-php/api.php`** sullo **stesso `docmap.sqlite`** (PORTING §8.1), poi diventa il
motore dell'installazione in sede e, più avanti, del VPS. L'audit di ArchivioSmartHub conferma: modello dati diverso
(id interi, nessuna sync, nessuna cifratura compatibile, short code riassegnabili), quindi **non** lo si estende.

Da ArchivioSmartHub si tiene solo come riferimento: `cleaning.py` (pulizia anagrafiche), forse `pdf_engine.py`, il
generatore di short code (affiancato da un registro dei codici emessi). Si scartano: UI, `database.py`, `sync_ftp.py`,
PIN condiviso, `field_schema.py`.

## 2. Vincoli emersi dalle risposte di Dave

| Tema | Risposta di Dave | Conseguenza |
|---|---|---|
| Codice Python | non su GitHub, fatto con Claude Code; basta l'audit | si riparte in `docmapv1/server-python/` |
| Primo mercato | studi commercialisti (molti, prezzo basso) **e** archiviazione conto terzi; un cliente vuole rivendere il software | il white-label/rivenditore entra presto (licenze con campo `reseller`, marchio configurabile) |
| VPS in UE | sì, ma non nella prima fase | fase 1: PHP su SiteGround resta in produzione; Python gira **su PC Windows** (installazione in sede) |
| Hub | per ora sul PC di Dave | hub locale (`docmapv1/hub/`), senza servizi esterni; il server privato con IP pubblico solo più avanti |
| Cloud o sede | accettano il cloud, ma "i dati restano qui" vende | prodotto principale = installazione in sede + backup cifrato; cloud come opzione |
| QR7 | dominio e servizio di Dave (SRL), qr7.it, qr-7.com e altri 6-7 domini | garanzia QR 10 anni firmabile dalla SRL; il risolutore resta separato dall'hub |

## 3. Fasi

Ogni fase ha un **cancello**: non si passa alla successiva finché non è vero.

| # | Fase | Contenuto | Cancello | Stato |
|---|---|---|---|---|
| F0 | Roadmap e registro | questo file, `PROGRESS-LOG.md`, aggiornamento del documento di strategia | documenti nel repository | fatto |
| F1 | **Server Python 1:1** | `server-python/` (FastAPI + Uvicorn + `cryptography`): tutte le rotte di `API-CONTRACT.md`, stessa cifratura, stessi hash, stesso `docmap.sqlite`, legge `config.php` esistente o `config.json` | test differenziali PHP ⇄ Python verdi + `validate_schemas.py` verde contro Python | in corso |
| F2 | Aggancio della suite | variabile `DOCMAP_TEST_SERVER=python` che fa girare le sezioni W/X/J della suite contro Python (PORTING §9.1) | sezioni W, X, J verdi con Python | **fatto** con lo shim `server-python/tests/php-shim` (suite.js non modificata); aggancio nativo `DOCMAP_TEST_SERVER_CMD` da concordare con il thread della suite |
| F3 | **Hub locale + licenze** | `hub/`: chiavi Ed25519 sul PC di Dave, emissione licenze firmate (piano, scadenza, limiti, funzioni, rivenditore, marchio), registro istanze, pagina locale; verifica nel server Python (tolleranza 30 giorni, poi sola lettura, **mai blocco dei dati**) | licenza emessa dall'hub accettata dal server; scaduta → sola lettura; manomessa → rifiutata | **fatto** su Linux (hub 39 test, server 9 test); da provare su Windows; manca la chiave pubblica di produzione in `TRUSTED_LICENCE_KEYS` |
| F4 | Installazione in sede (Windows) | script di avvio e servizio Windows, cartella fissa `C:\DocMap\`, backup cifrato automatico, guida | Dave installa su un PC di prova seguendo solo la guida | **scritto** in `installer-windows/` (37 test su Linux); mai eseguito su Windows; backup non ancora cifrati |
| F5 | Allineamento v12 | portare in Python le modifiche server della v12 (stati/eventi, login persistente, ubicazioni annidate, ricerca) appena il thread v12 le rilascia | suite v12 verde contro Python | in attesa della v12 |
| F6 | Primi clienti | 3-5 studi + il cliente rivenditore; istanze create a mano con licenza dall'hub | almeno 3 paganti | da fare |
| F7 | Hub v1 | aggiornamenti firmati a ondate con rollback, battito delle istanze, backup cifrati raccolti, pannello rivenditore | aggiornare 10 istanze con un comando; ripristino di prova riuscito | da fare |
| F8 | Pagamenti e crediti AI | rinnovo in app (pagamento ospitato tipo Stripe Checkout → licenza nuova), fattura elettronica SDI, gateway AI con crediti prepagati e ricarico | primo rinnovo pagato senza intervento manuale | da fare |
| F9 | VPS UE e cloud | hub e istanze cloud su VPS (o sul server privato di Dave) | migrazione dell'hub senza perdita | futuro |
| F10 | NFC e RFID | NFC = stesso URL qr7.it (funziona già); RFID come sorgente di eventi | solo su richiesta di un cliente che lo finanzia | futuro |

## 4. Regole di lavoro (valgono per ogni fase)

1. Lavorare solo in `docmapv1/` del repository `DaveTakashi/ciao`.
2. **Non toccare i file del thread v12** mentre la v12 è in corso: `index.html`, `scan.html`, `assets/`, `server-php/`,
   `tests/suite.js` (salvo l'aggancio F2, minimo e separato). Il Python vive in `server-python/` e `hub/`.
3. Il PHP resta la specifica: in caso di dubbio vince il suo comportamento (PORTING, introduzione).
4. Nessun dato perso: migrazioni solo additive, backup prima di ogni aggiornamento, guida di aggiornamento per ogni rilascio.
5. Ogni passo finisce con una riga in `PROGRESS-LOG.md` (cosa, file, test, prossimo passo).
6. Dipendenze minime e installabili su Windows senza compilatore: `fastapi`, `uvicorn`, `cryptography`.

## 5. Decisioni prese senza chiedere (da confermare con Dave)

| # | Decisione | Perché |
|---|---|---|
| D1 | Cartelle `server-python/` (pacchetto `docmap_server`) e `hub/` (pacchetto `docmap_hub`) dentro `docmapv1/` | regola "solo docmapv1"; separati dai file della v12 |
| D2 | Il server Python usa lo stesso `docmap.sqlite` e lo stesso formato di cifratura del PHP | permette PHP → Python senza conversione e il ritorno indietro |
| D3 | Il server Python serve anche i file statici del deploy (web app, `scan.html`) con le regole di `php-router.php` | una sola origine per web app e API, come su SiteGround |
| D4 | Licenze firmate Ed25519, file JSON leggibile + firma; verifica offline | l'hub è sul PC di Dave e spesso spento: le istanze non devono dipendere da lui |
| D5 | Licenza scaduta o assente → sola lettura dopo 30 giorni di tolleranza, mai blocco | la fiducia dello studio vale più del canone perso |
| D6 | Il campo `reseller` e il blocco `branding` sono nella licenza fin da subito | il primo cliente rivenditore è già presente |
| D7 | Test differenziali: stesse richieste a PHP e Python, risposte confrontate | prova di equivalenza più forte di test scritti a mano, senza toccare `tests/suite.js` |
