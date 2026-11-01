# Prompt di passaggio: DocMap 2026 MVP → sistema Python

> Copia tutto il testo sotto la linea e incollalo all'agente che ha già costruito il sistema Python di gestione dello studio. Prima estrai lo zip `docmap_v10.zip` in una cartella che l'agente può leggere e indica il percorso al posto di `<CARTELLA_DOCMAP>`. Lo zip contiene `docmapv1/` (l'app con sorgenti, test e documentazione) e `deploy/studio-de/` (la copia pronta da caricare su https://docmap.pr-it.it/studio-de/).

---

Ciao. Ti passo il front-end MVP di **DocMap 2026 (DM26)**, l'archivio fisico-digitale dei faldoni dello studio Dall'Asta. L'ha costruito un altro agente; io (Dave) l'ho provato e approvato come base. Da qui in avanti lo sviluppo lo porti avanti tu, unendolo al sistema Python che hai già creato.

## 1. Cosa ti consegno

La cartella `<CARTELLA_DOCMAP>/docmapv1/` contiene un'app web completa che funziona **offline**, aprendo `index.html` con un doppio clic in Chrome o Edge: nessun server, nessuna build, nessuna dipendenza da Internet.

- **Archivio dei faldoni:**
  - codice parlante (es. BL1), Codice Multi (l'ID interno del gestionale, facoltativo);
  - cliente, luogo, categoria, titolo e anno;
  - contenuti con lo stato di ogni documento: in archivio, in uso o al cliente;
  - tag, contatti e note;
  - posizione sullo scaffale: stanza, armadio, ripiano, settore;
  - colore del dorso;
  - QR statico `https://qr7.it/dm26XXXXXXXX`.
- **Stampa etichette al millimetro:**
  - molti formati, con predefinito MRINK143 (A4 con 4 etichette 105×148 tagliate a metà a mano, cioè 8 etichette);
  - modelli di etichetta in un registro estendibile, con predefinito "Etichetta informazioni";
  - bordi uguali compensati e calibrazione;
  - **Scarica PDF** vettoriale pronto per la stampa, con scelta e ordine delle pagine.
- **Informazioni:** clienti, tag, categorie, anni, luoghi, codici Multi e codici extra. Rinomini o unisci una voce e cambia ovunque.
- **Modifica massiva**, **colori intelligenti** (una famiglia per categoria e una tonalità per azienda) e **registro attività** (chi ha fatto cosa).
- **Import ed export:**
  - CSV, JSON, Excel `.xlsx` con abbinamento delle colonne, database `.sqlite`;
  - anagrafica clienti dal CSV dello studio;
  - prompt per generare dati con un'AI.
- **Versione web e deploy:** `docmap.config.js` sceglie la modalità (`local` / `web` / con `apiBase` i provider remoti). `python3 docmapv1/tools/build_deploy.py` genera `deploy/studio-de/`, con modalità web, `.htaccess`, `404.html` di riserva, `robots.txt` e un esempio nginx. Le istruzioni sono in `docs/DEPLOY-WEB.md`.
- **Indirizzi dei QR:** il QR resta `https://qr7.it/{short_code}` (redirect dinamico del mio sistema qr7.it). La destinazione predefinita, anche nel manifest CSV, è `https://docmap.pr-it.it/studio-de/q/{short_code}`. È la scheda del faldone, visibile **solo dopo il login**: nessun dato è pubblico.
- **Sincronizzazione manuale** (`06f-sync.js`, `docs/SYNC.md`):
  - "Copia export per web app" e "Importa dati da client locale", in entrambe le direzioni;
  - pacchetto JSON, facoltativamente cifrato con passphrase (AES-256-GCM, PBKDF2);
  - vince la modifica più recente per record, in base a `updated_at`;
  - le eliminazioni viaggiano come `tombstones`;
  - prima di applicare c'è una revisione dei conflitti record per record, e i peer sono tracciati in `S.sync`.
- **Pagina mobile `scan.html`:** è la pagina che si apre dopo aver inquadrato il QR. Senza login non mostra nulla; dopo il login mostra la scheda del faldone e un grande pulsante **Modifica**. Login, dati e cifratura passano da interfacce sostituibili (`DataProvider`, `AuthProvider`, `CryptoProvider`, `BlobStore`). Oggi hanno solo un'implementazione locale, volutamente semplice.

Dove sono i dati: stato in `localStorage` (chiave `docmap_v26_state`), database SQLite (sql.js) in IndexedDB, registro attività nella tabella `activity_log`.

## 2. Cosa devi studiare prima di tutto (in quest'ordine)

1. `docmapv1/AGENTS.md`: mappa del codice, convenzioni, ricette per aggiungere campi, viste, modelli di etichetta e test.
2. `docmapv1/docs/ARCHITETTURA.md`: moduli, flusso dei dati, motore di stampa, PDF, registro.
3. `docmapv1/docs/MODELLO-DATI.md`: **il contratto dei dati**: ogni campo del faldone, il CSV (ordine delle colonne), il JSON, lo schema SQLite e le migrazioni.
4. `docmapv1/docs/ALLINEAMENTO-PYTHON.md`: corrispondenza campo per campo con un modello Python, con frammenti di codice pronti.
5. `docmapv1/docs/SYNC.md` e `docmapv1/docs/DEPLOY-WEB.md`: formato del pacchetto di sincronizzazione, regole di unione, pubblicazione statica e routing `/studio-de/q/<codice>`.
6. `docmapv1/docs/API-CONTRACT.md`: il contratto REST che il front-end si aspetta dal server (endpoint, JSON, token Bearer, ETag/If-Match per i conflitti).
7. `docmapv1/docs/SICUREZZA.md`: cosa **non** è sicuro nell'MVP e cosa deve fare il server.
8. `docmapv1/docs/HUB-E-API.md`: il progetto dell'hub online (multi-studio, licenze, feature flag, AI indipendente dal fornitore).
9. `docmapv1/README.md`: il manuale utente in italiano, cioè come lo usa lo studio.
10. `docmapv1/tests/suite.js`: la suite Playwright (centinaia di controlli, tutti verdi). È la specifica eseguibile del comportamento.

Apri anche l'app e provala: crea un faldone, stampa un foglio, scarica il PDF, apri `scan.html?qr=<short_code>` dallo stesso browser.

## 3. Cosa ti chiedo di fare

Usa questo MVP **come front-end** e costruisci dietro di lui la parte di gestione nel tuo sistema Python.

1. **Allinea i modelli:** mappa il modello del faldone, dei clienti, dei contenuti e del registro (MODELLO-DATI.md) sui tuoi modelli Python. Non cambiare i nomi dei campi lato front-end senza una migrazione: il CSV e il JSON sono già usati dallo studio.
2. **Implementa l'API** descritta in `API-CONTRACT.md`, o migliorala aggiornando contratto e front-end insieme. Poi attiva `RemoteDataProvider` e `RemoteAuthProvider` in `assets/js/10-auth.js`: sono già predisposti.
3. **Sincronizzazione:**
   - Oggi è manuale, con un pacchetto e last-write-wins per record (`docs/SYNC.md`). Rendila automatica lato server mantenendo le stesse regole: id stabili (UUID), `updated_at`, `tombstones` per le eliminazioni, conflitti mostrati all'utente.
   - Il registro `activity_log` è la traccia di audit.
   - I `contents_items` vanno identificati per `(binder_id, position)`, perché il loro `id` non è stabile.
   - Il pacchetto manuale deve continuare a funzionare come piano B offline.
4. **Login vero:** OIDC/OAuth2, ruoli viewer, editor e admin (già previsti), sessioni sicure. Quello locale con PIN e PBKDF2 è solo un segnaposto.
5. **Cifratura di tutti i dati:**
   - TLS in transito;
   - cifratura a riposo, con chiavi per studio (envelope encryption);
   - foto, PDF e allegati salvati come **blob cifrati in versione ottimizzata**, per uso tecnico e funzionale, non come archivio a lungo termine (vedi `BlobStore` e SICUREZZA.md). Mai come file in chiaro.
6. **QR e destinazione:**
   - Il QR punta a `https://qr7.it/{short_code}`, che rimanda alla destinazione finale (predefinita `https://studiodallasta.it/docmap/?code={speaking_code}&qr={short_code}`).
   - Pubblica `scan.html` a quell'indirizzo, collegata alla tua API.
   - Il manifest per qr7.it si esporta dall'app (`short_code;short_url;final_destination;tags;` (ogni riga termina con `;`, v11)).
7. **Colori come dati configurabili:** spettri delle categorie (`settings.catFamilies`, semi `colorSeeds`), regole colore per parola chiave (`settings.colorRules`, max 10 per categoria, la prima che corrisponde vince) e modalità (`settings.colorMode`) sono impostazioni dello studio, non codice: salvale e sincronizzale lato server con `colorUpdatedAt` (vince il blocco più recente). L'algoritmo (normalizzazione delle parole chiave, precedenza bloccato → regola → sfumatura per cliente, hash FNV-1a) è in MODELLO-DATI.md §12 ed è riproducibile in Python; le liste di sfumature `COLOR_FAMILIES` sono dati da tenere in tabella.
8. **Analisi e funzioni avanzate:** analisi profonda, ricerca, AI con un'API indipendente dal fornitore, hub multi-utente. Segui HUB-E-API.md come progetto di partenza.

## 3b. Prossima fase già decisa: mappatura delle location con i "QR location"

Nell'MVP la posizione del faldone (stanza, armadio, ripiano, settore) è **facoltativa**: sta nel database e, se si vuole, sull'etichetta. La mappatura completa degli archivi l'ho rimandata a una fase successiva, che ti chiedo di progettare così:

1. **Inizializzazione degli archivi:** una pipeline in cui creo tutti gli ambienti di lavoro: sedi, stanze, armadi, scaffali, scatole. Ogni contenitore ha un genitore, così il contenitore più piccolo sta dentro quello più grande, e ha il suo **QR location** (un nuovo tipo di QR, distinto da quello del faldone, stampabile con lo stesso motore di etichette).
2. **Mappatura veloce con il telefono:**
   - Inquadro un QR location: l'app entra in "ascolto" e assegna a quella location ogni QR di faldone che inquadro dopo.
   - Quando inquadro il QR location successivo, chiude la location precedente (riepilogo: quanti faldoni, eventuali spostamenti da un'altra location) e passa ad ascoltare la nuova.
   - Così mappo in fretta un archivio esistente dopo aver attaccato le etichette.
3. **Flessibilità:** le location devono restare inseribili anche a mano e con import CSV, come oggi (`room_code`, `cabinet_code`, `shelf_code`, `sector_code`, `location_code`). Il modello gerarchico delle location deve restare compatibile con questi campi. Ogni assegnazione va nel registro attività.

## 4. Cosa protegge oggi la versione web e cosa no (da sapere)

La cartella `deploy/studio-de/` è un sito **statico**: sul server c'è solo il programma, **nessun dato**.

- **Dove stanno i dati:** ogni dispositivo li importa dal pacchetto di sincronizzazione e li conserva **cifrati nel browser** (AES-256-GCM, chiave sbloccata dal login locale con PBKDF2). Senza login non si vede nulla.
- **Cosa non c'è ancora:**
  - un vero controllo degli accessi lato server;
  - la revoca a distanza di un utente;
  - utenti condivisi tra dispositivi;
  - la sincronizzazione automatica.
- **Cosa ti chiedo:** sono questi i punti da costruire con il back-end. Quando l'API è pronta, la stessa app passa ai provider remoti impostando `apiBase` in `docmap.config.js`. Dettagli in `docs/SICUREZZA.md`.

## 4b. Dalla v10.1: c'è già un server di riferimento (PHP)

- `docmapv1/server-php/api.php` è l'**implementazione di riferimento attuale** di `docs/API-CONTRACT.md`: un solo file
  PHP 8 + PDO SQLite pensato per l'hosting condiviso SiteGround dello studio (niente Node né Python). La tua API Python
  **la sostituisce 1:1**: stesse rotte (`ping`, `me`, `pull`, `push`, `binder`, `patch`, `tokens`, `token_create`,
  `token_revoke`), stesso JSON, stesse regole (vince il più recente per record, tombstone, `409` con `current`,
  ruoli `viewer` / `editor` / `admin` controllati dal server). Se l'app trova le stesse risposte, non cambia nulla nel
  front-end: basta puntare `apiBase` in `docmap.config.js` all'API Python.
- **Schema del server** (`API-CONTRACT.md` §6): tabelle `meta` (versione, `key_check`), `records` (tipo, id, blob
  cifrato AES-256-GCM con AAD `records/<tipo>/<id>`, `updated_at`, `deleted`, indici HMAC `k_short` / `k_code` /
  `k_cab`), `changes` (sequenza per il pull incrementale, chi e quando), `settings`, `activity`, `tokens`, `auth_fail`.
  Per migrare i dati dal PHP al Python: leggi il database con la chiave di `config.php`, oppure fai un `pull` completo
  con un token admin e poi un `push` verso la nuova API.
- Il front-end tratta il server come un "dispositivo" del motore di sincronizzazione (`docs/SYNC.md` §7, modulo
  `06g-server.js`); la versione web con `apiBase` lavora online con una copia cifrata offline nel browser.
- **Regola per ogni versione futura**: ogni rilascio deve portare con sé un **percorso di aggiornamento che conserva i
  dati** (chiavi di `localStorage` / IndexedDB invariate, migrazioni solo additive, guida `docs/AGGIORNAMENTO-vX-vY.md`
  sul modello di `docs/AGGIORNAMENTO-v10-v10.1.md`) e un test nella suite che apre dati della versione precedente.
  La procedura standard è in `docs/AGGIORNAMENTI.md`.

## 5. Regole da rispettare

- **Non rompere l'uso offline:** l'app deve continuare ad aprirsi con doppio clic e a funzionare senza server. Il server è un'aggiunta, scelta con i provider.
- **Stampa:** non toccare la geometria del motore di stampa senza la suite verde. Le etichette sono state calibrate al millimetro e Dave le stampa davvero.
- **Test:**
  - ogni modifica arriva con i suoi test nella suite (`cd docmapv1/tests && npm i playwright jsqr pngjs && pip install pypdfium2 && node suite.js`);
  - la suite deve restare al 100% verde, con `errors: none`.
- **Dati reali:** l'elenco clienti reale dello studio non va mai messo nel repository o nei test; usa dati inventati.
- **Lingua:** testi per l'utente in italiano, con l'inglese come seconda lingua (i18n già presente con `t()`). Il codice e i commenti possono restare in inglese.
- **Aggiornamenti senza perdita di dati:** vedi §4b e `docs/AGGIORNAMENTI.md`.
- **Documentazione:** aggiorna `AGENTS.md` e `docs/` a ogni cambiamento strutturale. Sono la base di conoscenza per i prossimi agenti.

## 6. Come iniziare

1. Leggi i documenti al punto 2, poi fai girare la suite e annota il risultato.
2. Scrivimi un piano breve:
   - corrispondenza tra il modello DocMap e il tuo modello Python;
   - cosa riusi del tuo sistema;
   - ordine dei lavori: API → login vero → provider remoti → sincronizzazione automatica → cifratura lato server e blob → pubblicazione su docmap.pr-it.it/studio-de/;
   - punti aperti da decidere con me.
3. Procedi a piccoli passi verificabili, ognuno con i test.

Punti già noti da confermare con me:
- **Abbinamento del CSV clienti:** Ditta → Codice Multi, Ragione_soc → nome, Localita (Provincia) → luogo, ETS_ENC → categoria.
- **Prova su stampante reale:** il verso di rotazione su MRINK143 non è stato ancora verificato.

Grazie, Dave.
