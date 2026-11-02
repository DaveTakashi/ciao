# Glossario DocMap

> Le parole di DocMap in italiano, con il termine inglese e il nome usato nel codice (campo, funzione, file). Utile
> allo studio per parlare la stessa lingua e al team Python per trovare la cosa giusta nel codice. Versione 26.11.1.

| Termine (IT) | Inglese | Nel codice | Significato |
|---|---|---|---|
| **Faldone** | binder | `S.binders`, tabella `binders`, record server `binder`, `normalizeBinder()` (02-core.js) | Il raccoglitore fisico e la sua scheda: codice, cliente, contenuti, posizione, QR, colore. Schema: `docs/python/schema/binder.schema.json`. |
| **Codice parlante** | speaking code | `speaking_code` | Codice leggibile e unico del faldone, di solito iniziali del cliente + numero (es. `BL1`). Scritto grande sull'etichetta. Unico nell'archivio (un doppione viene rinominato da import e sincronizzazione). |
| **Codice Multi** | Multi code | `multi_code` (faldone e cliente) | L'identificativo che il gestionale dello studio dà al cliente (colonna `Ditta` dell'elenco clienti). Facoltativo. |
| **Short code** / codice breve | short code | `short_code` | Il codice dentro il QR: `dm26` + 8 caratteri per un faldone, `dm26L` + 8 per un'ubicazione. Non cambia mai. |
| **Short URL** | short URL | `short_url` | `https://qr7.it/<short_code>`: l'indirizzo stampato nel QR. Derivato dal short code. |
| **Destinazione finale** | final destination | `final_destination`, `settings.destTemplate`, `DEFAULT_DEST` | Dove qr7.it manda chi scansiona: predefinita `https://docmap.pr-it.it/studio-de/q/{short_code}` (la scheda del faldone, dopo il login). |
| **Manifest** | manifest | `manifestRow()` / `manifestText()` (04-ui.js), `MANIFEST_HEADER`, file `manifest_qr7_dm26.csv` | Il CSV per qr7.it: `short_code;short_url;final_destination;tags;`, ogni riga termina con `;`, una riga per faldone e per ubicazione. |
| **Cliente** / anagrafica | client / client register | `S.clients`, tabella `clients`, record `client`, `normalizeClient()` | La ditta o persona dello studio. Il faldone ne copia nome, Multi, luogo e categoria. |
| **Categoria** | category | `category` | Tipo di cliente o regime (es. APS, ETS, Ordinaria). Decide la famiglia di colori. |
| **Colore del dorso** | spine colour | `color_hex`, `color_locked`, `settings.colorMode`, `catFamilies`, `colorRules` | Colore della barra sull'etichetta. Automatico (per cliente o categoria) o bloccato a mano (`color_locked: true`). |
| **Contenuti** / voci | contents items | `contents_items[]` `{id, year, description, status}` | L'elenco dei documenti nel faldone; `status` `archive` (in archivio) · `in_use` (in uso) · `client` (al cliente). |
| **Stato del faldone** | archive state | `archive_state` | Stato complessivo del faldone (es. in archivio, prelevato). |
| **Stato** (preso, reinserito…) / movimento | status / status event | `S.statusEvents[]`, tabella `status_events`, record `status_event` (02d-status.js) | v12: ogni movimento di un faldone, di un documento o di una scatola (chi, quando, chi lo ha, rientro, nota). Si aggiunge e non si modifica mai; lo stato attuale è l'ultimo movimento. |
| **Stati rapidi** / tipo di stato | status types | `settings.statusTypes`, `statusTypesAt` | v12: l'elenco personalizzabile degli stati (nome, colore, presenza in/fuori/mancante/nota, cosa chiedere, pulsante rapido). |
| **Fuori archivio** | out of the archive | vista `status` (06j-status.js), presenza `out` / `missing` | v12: cosa non è in archivio adesso, chi ce l'ha, da quando, chi è in ritardo. |
| **Verifica rientro** | return check | `status.verify` (11c-status.js), localStorage `docmap_v26_status_verify` | v12: al ritorno di una scatola si scansionano i faldoni che contiene; trovati e mancanti finiscono nel registro e in un CSV. |
| **Id del documento** | document id | `contents_items[].id`, `ciEnsureIds()`, `ciCarryIds()` | v12: identificativo stabile di una voce del contenuto, a cui puntano gli stati dei singoli documenti. |
| **Posizione** | position | `room_code`, `cabinet_code`, `shelf_code`, `sector_code`, `computeLocation()` | Stanza, armadio, ripiano, settore scritti a mano (es. `A1-β-SX`). Indipendente dall'ubicazione. |
| **Ubicazione** | location | `S.locations`, tabella `locations`, record `location`, `normalizeLocation()` (02c-locations.js) | Un nodo dell'albero dell'archivio fisico: magazzino › armadio › scansia › scaffale › scatola. Ha un suo QR (`dm26L…`). |
| **Scatola** | box | ultimo livello di `settings.locLevels` (predefinito prefisso `B`) | L'ubicazione dove di solito si mettono i faldoni e si attacca il QR. |
| **Livelli** | levels | `settings.locLevels` `[{name, prefix}]`, `locLevelsAt` | Nomi e prefissi dei livelli dell'albero (1–8). |
| **Segmento** | segment | `seg` | Il pezzo di codice di un'ubicazione (es. `B04`), unico tra i fratelli. |
| **Codice percorso** | path code | `code` (ubicazione), `location_code` (faldone) | I segmenti dalla radice uniti da `-` (es. `MAG1-A2-S3-R1-B04`). Derivato: si ricalcola, non si scrive a mano. |
| **Ubicazione del faldone** | binder location | `location_id` | Id dell'ubicazione in cui si trova il faldone (`''` = nessuna). |
| **Modalità associazione** | association mode | `06h-locations.js` (PC), `11b-assoc.js` (telefono), localStorage `docmap_v26_assoc` | Scansioni il QR di una scatola e poi quelli dei faldoni: ogni faldone viene messo in quella scatola. Sul telefono scade dopo 30 minuti senza scansioni. Ogni passaggio è una riga `binder.locate`. |
| **Etichetta** / foglio / preset | label / sheet / preset | `BUILTIN_PRESETS` (02-core.js), `S.customPresets`, `S.print`, `03-print.js` | Il formato del foglio (predefinito **MRINK143**: 4 etichette fisiche 105×148, 8 etichette per A4) e la geometria in mm. |
| **Foglio parziale** / casella già usata | partial sheet / used slot | `S.usedSlots[presetId]` | Le caselle già staccate da un foglio: la stampa le salta. |
| **Calibrazione** / offset | calibration / offset | `S.print.offsetX` / `offsetY` (etichette `g_ox`, `g_oy`) | Correzione in mm dello spostamento della stampante. |
| **Modello etichetta** | label template | `contentMode` (`info`, `split`, `pair`, `a`, `b`, `u`, `qr`, `loc`), `LABEL_TEMPLATES` | Cosa c'è sull'etichetta. Predefinito "Etichetta informazioni" (`info`); `loc` = etichette delle ubicazioni. |
| **Registro attività** | activity log | `LOG.entries`, tabella `activity_log`, `logAct()` (06e-log.js) | *Cosa* è stato fatto nel programma e da chi: creato, modificato (prima → dopo), stampato, importato… Fino a 20 000 righe. |
| **Operatore** | operator | `S.settings.operator` | Il nome di chi lavora su quel PC; compare nel registro attività e come `who` delle modifiche. |
| **Registro sincronizzazioni** | sync journal | `S.syncJournal` (06i-journal.js); sul server tabelle `sync_journal` + `sync_journal_items`, rotte `journal`, `journal_restore` | *Cosa è passato* tra i dispositivi: ogni scambio (server, pacchetto, telefono, ripristino), con l'esito per ogni record, le versioni e le impronte SHA-256. Serve per le contestazioni. |
| **Impronta** (hash) | hash | `jrHash()` / `jr_hash()`, `new_hash`, `prev_hash` | SHA-256 del JSON canonico di una versione: due versioni con la stessa impronta sono uguali. |
| **JSON canonico** | canonical JSON | `jrCanon()` (06i) / `canon()` (api.php) | Il record con le chiavi ordinate, senza i campi derivati (`updated_at`, `short_url`, `location_code`, `selected_for_print`, `_…`), valori come testo. Base dell'impronta e del confronto "uguale". |
| **Sincronizzazione** | sync | `06f-sync.js` (pacchetti), `06g-server.js` (server) | Allineare le copie dei dati tra PC, web app, telefoni e server. |
| **Pacchetto** di sincronizzazione | sync package | `syncBuildPackage()`, formato `docmap-sync` / `docmap-sync-enc` | Il file che si scambia senza server, facoltativamente cifrato con passphrase. Schema: `sync_package.schema.json`. |
| **Peer** / dispositivo conosciuto | peer | `S.sync.peers[...]` | L'altro lato di una sincronizzazione (un altro PC, la web app o il server `server:<url>`), con i suoi tempi di ultimo scambio e, per il server, l'ultimo `seq`. |
| **Id dispositivo** / nome del dispositivo | device id / device name | `S.settings.deviceId` (`dev-<uuid>`), localStorage `docmap_v26_device`, `deviceLabel`; header `X-DocMap-Device`, `X-DocMap-Device-Name` | Chi ha fatto lo scambio, nel registro sincronizzazioni. Non serve mai ad autorizzare. |
| **LWW** — vince il più recente | last-write-wins | `updated_at`, `syNext()`, `r_push()` | Regola di unione: per ogni record vince la versione con l'`updated_at` più recente. Stessa ora e contenuto diverso = conflitto (`tie`). |
| **Conflitto** | conflict | `kind: 'conflict'` (06f), `reason: tie`, 409 `conflict` (patch) | Lo stesso record è cambiato su due lati dopo l'ultimo scambio (o con la stessa ora): si decide nella revisione (**Tieni locale** / **Tieni importato**). |
| **Tombstone** (lapide) | tombstone | `S.tombstones[]` `{type, id, code, deletedAt, who}`; sul server riga `records` con `deleted = 1` | Il segno che un record è stato eliminato, perché l'eliminazione arrivi anche agli altri dispositivi. Tenuta 365 giorni (massimo 5000). |
| **updated_at** | updated at | `updated_at` | Ora (UTC, millisecondi) dell'ultima modifica del record. Cresce sempre. |
| **Server online** / database condiviso | shared online database | `server-php/api.php`, `docmap.sqlite` nella cartella dati | Il database dello studio su SiteGround, cifrato (AES-256-GCM). Il PC si sincronizza quando lo chiedi, telefoni e web app da soli. |
| **Codice di accesso** (token) | access token | header `X-DocMap-Token`, `config.php` `tokens`, tabella `tokens` | La chiave personale di una persona o di un telefono verso il server. Si crea e si revoca (admin). Il server ne tiene solo l'impronta SHA-256. |
| **Ruolo** | role | `viewer` · `editor` · `admin` (`DM_ROLES`); in locale *Solo lettura* · *Può modificare* · *Amministratore* | Cosa può fare un codice: leggere; leggere e modificare (e vedere le proprie sincronizzazioni); tutto (codici, registro di tutti, ripristino sul server). |
| **PIN del dispositivo** | device PIN | `DocMapVault`, `docmap_v26_vault*` (10-auth.js) | Protegge la copia cifrata dei dati in quel browser (web app e telefono). Non è il codice di accesso. |
| **Cassaforte** | vault | `DocMapVault` | La copia dei dati cifrata nel browser della web app / del telefono. |
| **Seq** / sequenza | sequence | `changes.seq`, `pull?since=` | Numero crescente di ogni cambiamento sul server: il client chiede "tutto dopo il numero X". |
| **Backup** | backup | `workspaceJSON(true)` → `docmap_workspace_AAAAMMGG_HHMM.json` | Copia completa in JSON (senza foto). Le foto sono solo nel `.sqlite`. |
| **Sessione** (database) | session | tabella `sessions` | Un'istantanea dell'archivio salvata dentro il database locale (**Salva sessione nel database**). |
| **Snapshot precedente** | previous snapshot | localStorage `docmap_v26_state_prev` | L'ultimo stato prima di un ripristino o di un import: **Ripristina snapshot precedente**. |
| **Dati di esempio** | demo data | tag `demo`, `isDemo()` | I 5 faldoni di prova: si nascondono o si eliminano con un clic. |
| **Pagina mobile** | mobile page | `scan.html`, `11-scan.js` | La pagina che si apre scansionando un QR: scheda del faldone o dell'ubicazione dopo il login. |
| **Modifica massiva** | bulk edit | `05d-bulk.js` | Griglia tipo Excel per cambiare molti faldoni insieme. |
| **Informazioni** | info hub | `06d-info.js` | Le voci usate nei faldoni (clienti, tag, categorie, anni, luoghi, Multi, codici extra, QR, ubicazioni) da rinominare o unire. |
| **Luogo** (ditta) | company city | `company_city` | La località della ditta (es. `PARMA (PR)`). Non è l'ubicazione del faldone. |
