# Prompt di passaggio: DocMap 2026 → sistema Python

> Copia tutto il testo sotto la linea e incollalo all'agente che ha già costruito il sistema Python di gestione dello
> studio. Prima metti a sua disposizione la cartella dell'ultima versione (oggi **26.12.5, v12.5**: lo zip del rilascio
> estratto, oppure il repository) e scrivi il percorso al posto di `<CARTELLA_DOCMAP>`. La cartella contiene
> `docmapv1/` (app, server PHP, test, documentazione); `deploy/studio-de/` (la copia da caricare su
> https://docmap.pr-it.it/studio-de/) si rigenera con `python3 docmapv1/tools/build_deploy.py`.

---

Ciao. Ti passo **DocMap 2026 (DM26)**, l'archivio fisico-digitale dei faldoni dello studio Dall'Asta, versione
**26.12.5 (v12.5)**. L'ha costruito un altro agente; io (Dave) l'ho provato e lo uso. Da qui lo sviluppo lo porti
avanti tu, unendolo al sistema Python che hai già creato. Questo testo basta per partire: tutto il resto è nei file
indicati, che sono la fonte di verità (se un documento e il codice non coincidono, vince il codice e la suite di test).

## 1. Cosa ti consegno

Nella cartella `<CARTELLA_DOCMAP>/docmapv1/`:

- **Il programma** (`index.html`): app web completa che funziona **offline** con un doppio clic in Chrome o Edge,
  senza build né Internet. Archivio dei faldoni (codice parlante es. `BL1`, Codice Multi, cliente, categoria, anno,
  contenuti con stato, tag, contatti, note, posizione stanza/armadio/ripiano/settore, colore del dorso, QR statico
  `https://qr7.it/dm26XXXXXXXX`), stampa etichette al millimetro (predefinito MRINK143) e **Scarica PDF** vettoriale,
  Informazioni (clienti, tag, categorie, anni, luoghi), modifica massiva, colori intelligenti, registro attività,
  import/export CSV, JSON, Excel, `.sqlite`, manifest per qr7.it.
- **Ubicazioni (v11)**: albero Magazzino › Armadio › Scansia › Scaffale › Scatola con QR propri (`dm26L` + 8 caratteri),
  etichette, e **modalità associazione** (inquadro la scatola, poi i faldoni che ci metto dentro) sul PC (lettore USB o
  webcam) e sul telefono.
- **La pagina del telefono** (`scan.html`): si apre scansionando il QR; senza login non mostra nulla.
- **Il server di riferimento** (`server-php/api.php`, un solo file PHP 8 + PDO SQLite + OpenSSL, più `setup.php`): il
  database online condiviso, oggi in produzione su SiteGround. Dati cifrati a riposo (AES-256-GCM), token con ruoli
  `viewer` < `editor` < `admin`, sincronizzazione last-write-wins per record con tombstone, modifica da telefono con
  ETag e 409, **registro sincronizzazioni** con ripristino delle versioni.
- **Sincronizzazione a pacchetti** (`06f-sync.js`): file JSON (facoltativamente cifrato) tra PC, il piano B offline.
- **La suite** `tests/suite.js`: circa 1050 controlli Playwright, la specifica eseguibile.

Dove sono i dati nel browser: stato in `localStorage` (`docmap_v26_state`), database SQLite (sql.js) in IndexedDB
(`docmap_v26_sqlite`, archivio `kv`; elenco completo delle chiavi in `MODELLO-DATI.md`); con il server, i dispositivi web tengono una copia cifrata nel browser.

## 2. Cosa studiare (in quest'ordine)

Parti dalla mappa: **`docmapv1/docs/INDICE.md`** (chi legge cosa, tutti i documenti). Poi, per il tuo lavoro:

1. `docmapv1/docs/python/PORTING.md`: **come riscrivere `api.php` in FastAPI 1:1**: forma dell'API e ordine dei
   controlli, configurazione, formato del blob cifrato e AAD, indici HMAC, schema SQLite esatto, JSON canonico e hash
   (con codice Python), LWW, tombstone, `patch`, registro, migrazione del `docmap.sqlite` di produzione, come far girare
   la suite contro un server Python.
2. `docmapv1/docs/python/openapi.yaml`: OpenAPI 3.1 di ogni rotta, parametro, ruolo (`x-docmap-role`) ed errore.
3. `docmapv1/docs/python/SCHEMI.md` e `docmapv1/docs/python/schema/*.schema.json`: JSON Schema di faldone, cliente,
   ubicazione, voce del registro attività, voce del registro sincronizzazioni, backup, pacchetto.
4. `docmapv1/docs/python/tools/validate_schemas.py`: controlla schemi e OpenAPI sui file veri prodotti dall'app e sul
   server PHP vero. **Usalo anche contro il tuo server** (vedi PORTING §9).
5. `docmapv1/docs/API-CONTRACT.md`: lo stesso contratto in prosa; `docmapv1/docs/SYNC.md` (regole di unione, server
   come peer, registro, contestazioni); `docmapv1/docs/MODELLO-DATI.md` (ogni campo, CSV, JSON, SQLite del client,
   migrazioni); `docmapv1/docs/ALLINEAMENTO-PYTHON.md` (dataclass e CSV in Python).
6. `docmapv1/docs/SICUREZZA.md`: cosa è protetto oggi e cosa resta da fare; `docmapv1/docs/AGGIORNAMENTI.md`: le regole
   di rilascio senza perdita di dati.
7. `docmapv1/AGENTS.md` e `docmapv1/docs/ARCHITETTURA.md` se tocchi il front-end; `docmapv1/docs/MANUALE-UTENTE.md` per
   sapere come lo studio lo usa davvero; `docmapv1/docs/GLOSSARIO.md` per le parole.
8. `docmapv1/docs/HUB-E-API.md`: progetto (non implementato) dell'hub multi-studio, licenze, AI.

Apri anche l'app e provala; avvia `php -S 127.0.0.1:8000` nella cartella `docmapv1/` e prova `server-php/setup.php`.

## 3. Il contratto che non devi rompere (riassunto)

- **Rotte** (`<apiBase>?r=<rotta>`; letture GET, scritture solo POST): `ping`, `me`, `pull`, `push`, `binder`,
  `location`, `resolve`, `patch`, `tokens`, `token_create`, `token_revoke`, `journal`, `journal_restore`. `ping` risponde
  `{"ok":true,"api":"docmap-php","version":1,"schema":3,"features":["journal","device_info","locations","archives","access_log","status_events"],…}`.
- **Token**: header `X-DocMap-Token` (anche `Authorization: Bearer` o `"_token"` nel corpo `text/plain` del PC aperto da
  `file://`). Non usare `Authorization` come unico canale: la password di cartella di SiteGround (HTTP Basic) lo occupa.
- **Errori**: sempre `{"error":{"code","message",…}}` con i codici HTTP e i `code` di `openapi.yaml`; 409 con `current`
  e `current_etag`; 429 con `Retry-After`.
- **Sincronizzazione**: il client manda gli `updated_at` decisi da lui e il server **non li riscrive** nel `push` (solo
  `patch` e `journal_restore` usano l'ora del server, sempre strettamente crescente). Ogni PC ricorda la posizione
  (`seq`, `log_seq`) per indirizzo del server: se migri i dati **conserva i numeri di sequenza** o cambia indirizzo
  (PORTING §8).
- **Hash del registro**: `sha256` del JSON canonico (PORTING §5) deve coincidere **byte per byte** con quello del PHP e
  del client (`jrCanon` in `06i-journal.js`).
- **Nomi dei campi**: quelli di `MODELLO-DATI.md`; il CSV e il JSON sono già usati dallo studio. Nessun cambio senza
  migrazione e senza aggiornare front-end e contratto insieme.
- **Indirizzi dei QR**: il QR resta `https://qr7.it/{short_code}` (redirect dinamico del mio sistema qr7.it); la
  destinazione predefinita, anche nel manifest, è `https://docmap.pr-it.it/studio-de/q/{short_code}`, risolta dal
  `.htaccess` verso `scan.html` (`dm26L…` = ubicazione, altro = faldone). Il manifest
  (`short_code;short_url;final_destination;tags;`) ha ogni riga che termina con `;`.

## 4. Cosa ti chiedo di fare

1. **Porta il server in Python 1:1** seguendo `python/PORTING.md`: stesse rotte, stesso JSON, stessi codici. Primo
   rilascio sullo **stesso file `docmap.sqlite`** con la stessa chiave (PORTING §8.1), così nessun dispositivo deve
   ricominciare. Fai passare `validate_schemas.py` e poi la suite contro il tuo server (il punto di aggancio da
   aggiungere alla suite è descritto in PORTING §9.1).
2. **Allinea i modelli** (`ALLINEAMENTO-PYTHON.md`, schemi JSON): faldone, cliente, ubicazione, contenuti, registri.
   I `contents_items` si identificano per `(binder_id, position)`: il loro `id` non è stabile.
3. **Login vero**: OIDC/OAuth2 o password Argon2id, token brevi + refresh, 2FA per `admin`, revoca immediata
   (`API-CONTRACT.md` §9: `RemoteAuthProvider` in `assets/js/10-auth.js` è predisposto). Oggi i token sono per
   dispositivo, creati dall'admin, salvati come SHA-256.
4. **Cifratura**: TLS; cifratura a riposo con chiavi per studio (envelope/KMS); foto, PDF e allegati come **blob
   cifrati in versione ottimizzata** (`BlobStore`, `SICUREZZA.md`), mai file in chiaro, non archivio a lungo termine.
5. **Ubicazioni**: registro dei codici `dm26L` emessi (mai riusati) accanto a quello dei `dm26`; associazione dal
   telefono anche offline (`locate_batch`, `API-CONTRACT.md` §9); risoluzione `/q/<code>` lato server con registrazione
   della scansione; inventario (scatole vuote, faldoni senza ubicazione).
6. **Colori come dati**: `settings.catFamilies`, `settings.colorRules`, `settings.colorMode` con `colorUpdatedAt`
   (vince il blocco più recente); algoritmo in `MODELLO-DATI.md` §12, riproducibile in Python.
7. **Funzioni avanzate**: ricerca, analisi, AI indipendente dal fornitore, hub multi-studio (`HUB-E-API.md`).

## 5. Regole da rispettare

- **Non rompere l'uso offline**: l'app deve aprirsi con doppio clic e funzionare senza server; il pacchetto manuale
  resta il piano B.
- **Aggiornamenti senza perdita di dati**: ogni rilascio segue `docs/AGGIORNAMENTI.md` (chiavi di memoria invariate,
  migrazioni solo additive, guida `docs/AGGIORNAMENTO-vX-vY.md`, test che apre i dati della versione precedente,
  prova a secco di `docs/CHECKLIST-COLLAUDO.md` §8). Ordine: server, poi PC, poi telefoni.
- **Stampa**: non toccare la geometria del motore di stampa senza la suite verde; Dave stampa davvero.
- **Test**: ogni modifica con i suoi test; `cd docmapv1/tests && npm i playwright jsqr pngjs && pip install pypdfium2 &&
  node suite.js` (servono anche PHP 8 con `pdo_sqlite` e `openssl`); deve finire con `0 failed` ed `errors: none`.
- **Dati reali**: l'elenco clienti dello studio non va mai nel repository o nei test; usa dati inventati.
- **Lingua**: testi per l'utente in italiano, inglese come seconda lingua (`t()`); codice e commenti anche in inglese.
- **Documentazione**: aggiorna `AGENTS.md`, `docs/INDICE.md` e i documenti toccati a ogni cambiamento strutturale.

## 6. Come iniziare

1. Leggi `INDICE.md` e i documenti del punto 2, fai girare la suite e `validate_schemas.py`, annota i risultati.
2. Scrivimi un piano breve: corrispondenza tra il modello DocMap e il tuo; cosa riusi del tuo sistema; ordine dei lavori
   (API 1:1 sullo stesso database → suite verde contro Python → login vero → blob cifrati → funzioni nuove); punti aperti.
3. Procedi a piccoli passi verificabili, ognuno con i test.

Punti noti da confermare con me:
- **Abbinamento del CSV clienti**: Ditta → Codice Multi, Ragione_soc → nome, Localita (Provincia) → luogo, ETS_ENC →
  categoria.
- **Prove manuali** ancora da spuntare (stampante vera, Acrobat, telefoni, SiteGround): `docs/CHECKLIST-COLLAUDO.md`.

Grazie, Dave.
