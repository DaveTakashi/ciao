# DocMap 2026 — Modello dati e formati

**Questo documento è il contratto tra l'MVP e il sistema Python dello studio.** In caso di dubbio vincono il modello dati e la UX dell'MVP: il sistema Python si allinea a questi nomi, tipi e regole.

Baseline: **v9** — `APP_VERSION '26.9.0'`, schema stato `26.9`, `DB_SCHEMA_VERSION 5` (v9 aggiunge i modelli di etichetta, `print.info`, `print.edge`, il registro attività e lo Scarica PDF; vedi §11).
I campi nuovi della v8 sono segnati **(v8)**; il riepilogo delle differenze dalla v7 è nel §10.

Fonti nel codice: `assets/js/02-core.js` (`normalizeBinder`, `normalizeClient`, `CSV_COLUMNS`, `CI_STATUSES`, `normCiStatus`, `pipeToContents`, `defaultState`, `migrate`), `04-ui.js` (`HEADER_ALIASES`, `binderToCsvRow`, `workspaceJSON`, `csvTemplateHeader`), `06-db.js` (`DB_DDL`, `dbMigrate`, `dbReadWorkspace`), `06b-photos.js`, `06c-clients.js`, `06d-info.js` (`catColors`, `qrPreset`, `printPrev`), `05b-import-map.js` (`importMappings`).

---

## 1. Faldone (`binder`)

Un record per ogni faldone / raccoglitore fisico. Tutti i campi testuali sono stringhe (mai `null` nello stato: vuoto = `''`), con spazi iniziali/finali rimossi.

| Campo | Tipo | Obblig. | Significato | Esempio | Colonna CSV | Colonna SQLite |
|---|---|---|---|---|---|---|
| `id` | uuid v4 (stringa) | sì (auto) | identificativo tecnico **stabile**, mai riassegnato | `3f1c…-…` | `id` | `binders.id` PK |
| `speaking_code` | stringa | **sì** | codice parlante, unico, maiuscolo senza spazi (§5.2) | `BL1` | `speaking_code` | `speaking_code` NOT NULL UNIQUE |
| `multi_code` | stringa | no | Codice Multi: id interno del cliente/pratica nel gestionale. **Mai inventato.** Non unico (condiviso dai faldoni dello stesso cliente) | `M-10234` | `multi_code` | `multi_code` (indice) |
| `company_name` | stringa | **sì** | cliente / ragione sociale | `Barbieri Luigi S.r.l.` | `company_name` | `company_name` |
| `company_city` | stringa | no | luogo della ditta, di solito `Città (PR)` | `Parma (PR)` | `company_city` | `company_city` |
| `category` | stringa | no | categoria; suggerite: `Ordinaria, Semplificata, Societario, Lavoro, Dichiarativi, Contenzioso, Privati` (testo libero ammesso) | `Ordinaria` | `category` | `category` |
| `color_hex` | `#RRGGBB` maiuscolo | sì (auto) | colore del dorso; predefinito dalla categoria (§5.6) | `#2563EB` | `color_hex` | `color_hex` |
| `binder_title` | stringa | no (consigliato) | titolo "macro" del faldone | `Fatture e Contabilità IVA` | `binder_title` | `binder_title` |
| `ref_year` | stringa | no | anno di riferimento dei **contenuti** (non la data di creazione); anche intervallo | `2025`, `2020-2024` | `ref_year` | `ref_year` |
| `extra_codes` | stringa | no | altri identificativi (protocolli, n. pratica), separati da virgola. Mai inventati | `INPS 1234567` | `extra_codes` | `extra_codes` |
| `room_code` | stringa | no | stanza: lettera (normalizzata maiuscola se 1–2 lettere) o nome | `A`, `Ufficio 1` | `room_code` | `room_code` |
| `cabinet_code` | stringa | no | armadio | `1` | `cabinet_code` | `cabinet_code` |
| `shelf_code` | stringa | no | ripiano: numero, lettera, greca (α = in alto), emoji, simbolo o nome | `α` | `shelf_code` | `shelf_code` |
| `sector_code` | stringa | no | settore orizzontale `SX` / `CX` / `DX` (o testo) | `SX` | `sector_code` | `sector_code` |
| `shelf_color` | `#RRGGBB` o `''` | no | colore del ripiano (mappa scaffali, "Dov'è?") | `#22C55E` | `shelf_color` | `shelf_color` |
| `location_code` | stringa **derivata** | — | calcolata da stanza/armadio/ripiano/settore (§5.4); in import serve solo se mancano i campi separati | `A1-α`, `B2-β-SX`, `Ufficio 1 · 2-α` | `location_code` | `location_code` |
| `archive_state` | enum | sì (def. `CURRENT`) | `CURRENT` (archivio corrente), `HISTORICAL` (storico), `CHECKED_OUT` (in uso / prelevato) | `CURRENT` | `archive_state` | `archive_state` CHECK |
| `contents_items` | array di `{year, description, status}` | no | documenti contenuti, in ordine (§2) | vedi §2 | `contents` (testo con `\|`) | tabella `contents_items` |
| `tags` | stringa, virgole | no | parole chiave minuscole; il tag `demo` marca i dati di esempio e non si stampa mai | `iva,fatture,2025` | `tags` | `tags` |
| `short_code` | stringa | sì (auto) | codice QR statico, unico, mai riusato (§5.3) | `dm26K8m2P9xL` | `short_code` | `short_code` UNIQUE |
| `short_url` | stringa **derivata** | — | `https://qr7.it/{short_code}` | `https://qr7.it/dm26K8m2P9xL` | `short_url` | `short_url` |
| `final_destination` | URL o `''` | no | destinazione **personalizzata**; vuoto = modello dello studio (§5.5) | `''` | `final_destination` (esporta l'URL **risolto**) | `final_destination` = risolto, `final_destination_custom` = personalizzato |
| `selected_for_print` | booleano | sì (def. `false`; nuovi da editor, duplica e import Merge: `true`) | in coda di stampa | `true` | `selected_for_print` (`1`/`0`) | `selected_for_print` INTEGER 0/1 |
| `created_at` | ISO 8601 UTC | sì (auto) | creazione | `2026-10-31T09:12:44.120Z` | `created_at` | `created_at` |
| `updated_at` | ISO 8601 UTC | sì (auto) | ultima modifica (aggiornato a ogni salvataggio/import) | idem | `updated_at` | `updated_at` |
| `contacts` | stringa, virgole | no | **(v8)** persone coinvolte (referente del cliente, collega incaricato…), testo libero separato da virgole; mai inventate. Non stampato di default | `Mario Rossi, Anna (paghe)` | `contacts` | `contacts` TEXT |
| `notes` | stringa | no | **(v8)** nota libera breve sul faldone. Non stampata di default | `Documento uscito il 12/03 per verifica` | `notes` | `notes` TEXT |

Regole di validazione dell'editor: codice parlante obbligatorio e unico; cliente obbligatorio; short code nel formato `dm26` + 8 alfanumerici e unico. In import una riga senza cliente viene saltata (salvo che aggiorni un faldone esistente per codice parlante).

## 2. Contenuti (`contents_items`)

```json
[{"year": "2025", "description": "Fatture Acquisto Q1-Q4", "status": "archive"},
 {"year": "2024", "description": "Bilancio",               "status": "client"},
 {"year": "",     "description": "Visure camerali",        "status": "in_use"}]
```

- `year`: stringa, facoltativa (`2025`, `2024/25`, `2020-2024`). `description`: stringa.
- `status` **(v8)**: `'archive'` (nel faldone, predefinito) · `'in_use'` (in uso / prelevato) · `'client'` (dato al cliente). Costanti `CI_STATUSES`; `normCiStatus()` normalizza i valori in ingresso (`in uso`, `in_use`, `uso`, `prelevato`, `fuori`, `out`, `checked_out` → `in_use`; `cliente`, `client`, `al cliente`, `dato al cliente` → `client`; tutto il resto, vuoto compreso → `archive`). È indipendente da `archive_state` del faldone: un faldone `CURRENT` può avere voci `client`.
- **Formato testo (CSV, AI):** voci separate da `|`, ciascuna `ANNO: Descrizione` (anno facoltativo). In lettura sono accettati anche gli a capo e i separatori `:` `-` `–` `—` dopo l'anno (regex `^(\d{4}(?:\s*[-/]\s*\d{2,4})?)\s*[:\-–—]\s*(.+)$`).
  Esempio: `2025: Fatture Acquisto Q1-Q4|2025: Liquidazioni IVA|Visure camerali`
- **Stato nel testo (v8)** (`ciText()` / `contentsToPipe()`): una voce non in archivio riceve un suffisso finale tra parentesi quadre, `[in uso]` oppure `[cliente]`; senza suffisso = `archive`. Esempio: `2025: Fatture acquisto|2024: Bilancio [cliente]|2025: F24 [in uso]`. In lettura (`pipeToContents()`, regex `CI_SUFFIX_RE`, senza distinzione maiuscole) sono accettati anche `[al cliente]`, `[dato al cliente]`, `[client]`, `[in use]`, `[in_use]`, `[prelevato]`, `[archivio]`, `[in archivio]`, `[archive]`. Il suffisso viene tolto dalla descrizione. Un file v7 (senza suffissi) si legge con tutte le voci `archive`.
- SQLite: tabella `contents_items(binder_id, position, year, description, status)`; `position` parte da 0; `status TEXT DEFAULT 'archive'`. La colonna `id` è un AUTOINCREMENT **non stabile** (la tabella viene riscritta a ogni sync): identificare una voce con `(binder_id, position)`.
- JSON: ogni voce ha la chiave `status` (sempre presente nello stato e negli export v8).

## 3. Cliente (`client`) — anagrafica

| Campo | Significato | Colonna import (CSV dello studio) | Colonna export `docmap_clienti.csv` | SQLite `clients` |
|---|---|---|---|---|
| `id` | uuid stabile | — | — | `id` PK |
| `multi_code` | Codice Multi (chiave di collegamento con i faldoni) | `Ditta` | `multi_code` | `multi_code` (indice, non unico) |
| `name` | ragione sociale (obbligatoria) | `Ragione_soc` | `ragione_sociale` | `name` NOT NULL |
| `address` | indirizzo | `Indirizzo` | `indirizzo` | `address` |
| `cap` | CAP | `Cap` | `cap` | `cap` |
| `city` | località | `Localita` | `localita` | `city` |
| `province` | sigla provincia | `Provincia` | `provincia` | `province` |
| `type` | tipologia (es. `ENC`) | `TIPO` | `tipo` | `type` |
| `category` | categoria (es. `APS`) | `ETS_ENC` | `categoria` | `category` |
| `notes` | note; il codice comune diventa `Cod. comune E547` | `Codice_com` | `note` | `notes` |

- File di riferimento: `CLIENTI STORICI ELENCO TIPIZZATO.csv` con intestazione `TIPO;Ditta;Ragione_soc;Indirizzo;Codice_com;Cap;Localita;Provincia;ETS_ENC` (esempio inventato in `tests/fixtures/clienti_esempio.csv`). Alias completi in `CLIENT_ALIASES` (06c-clients.js).
- Riconoscimento: un CSV con colonna ragione sociale (`ragione_soc`, `ragione_sociale`, `ragionesociale`, `denominazione`) e senza colonne da faldone è un'anagrafica.
- Chiave di deduplica: `multi_code` (senza distinzione maiuscole) se presente, altrimenti `name`. Reimportare aggiorna, non duplica.
- Dal cliente al faldone (`clientDefaults`): `Ditta → multi_code`, `Ragione_soc → company_name`, `Localita (Provincia) → company_city` (es. `BUSSETO (PR)`), `ETS_ENC` (o `TIPO` se vuoto) `→ category`.
- Collegamento faldone ↔ cliente: oggi **per valore** (`binder.multi_code = client.multi_code` oppure stesso nome, senza distinzione maiuscole). Non c'è una chiave esterna `client_id`.

## 4. Impostazioni, stampa, preset, fogli parziali

### `settings`

| Chiave | Tipo | Default | Note |
|---|---|---|---|
| `studioName` | stringa | `Studio Demo Commercialisti Associati` | intestazione registro |
| `destTemplate` | stringa | `https://docmap.pr-it.it/studio-de/q/{short_code}` | §5.5 |
| `qrEcc` | `L`/`M`/`Q`/`H` | `M` | correzione errore QR |
| `hideDemo` | booleano | assente = `false` | nasconde i faldoni `demo` da elenco, mappa, stampa |
| `shelfType` | `number`/`letter`/`greek`/`emoji`/`symbol`/`text` | assente = `greek` | stile dei pulsanti rapidi del ripiano |
| `catColors` **(v8)** | `{"<categoria>": "#RRGGBB"}` | assente = `{}` | colore dei **nuovi** faldoni della categoria (Informazioni › Categorie); sovrascrive i predefiniti di §5.6 tramite `infoApplyCatColors()` |
| `qrPreset` **(v8)** | id preset | assente = `l7159` | foglio della "Ristampa solo QR"; ammessi `l7159, l7160, l7162, l7163, a4-21, a4-14` o un preset personalizzato, altrimenti `l7159` |
| `importMappings` **(v8)** | `{"<intestazioni normalizzate unite da \|>": {target:'binders'\|'clients', fields:[campo o ''], at:ISO}}` | assente = `{}` | abbinamenti colonne ricordati dall'import Excel/CSV; tenuti gli ultimi 40 |
| `edLocOpen` **(v8)** | booleano | assente = `false` | sezione "Dettagli posizione" dell'editor aperta |
| `operator` **(v9)** | stringa | `''` | nome di chi lavora su questo PC, scritto nel registro attività (`who`); vuoto = `"Questo PC"` (§7.2) |

Le chiavi di `settings` viaggiano nel workspace JSON e nella tabella SQLite `settings` (riga `settings`).

### `print`

| Chiave | Valori / default |
|---|---|
| `presetId` | id di `BUILTIN_PRESETS` o di un preset personalizzato; default `mrink143` |
| `geometry` | `{w, h, cols, rows, marginTop, marginLeft, gapX, gapY, radius, cut, group, turn}` in mm |
| `geometryModified` | `true` se diversa dal preset |
| `padding` | margine interno mm (default 4) |
| `offsetX`, `offsetY` | calibrazione mm (default 0) |
| `contentMode` | **v9:** `info` (etichetta informazioni, default; tipi `I` + `C` se `info.pair`) · `split` (etichetta completa classica) · `pair` · `a` · `b` · `u` · `qr` **(v8)** (solo QR, tipo di etichetta `Q`) |
| `template` | `classic` · `multi` · `bold` · `minimal` (etichetta A) |
| `showMulti` | default `true` |
| `fields` | sovrascritture di `{category, city, multi, url, title, year, contents, tags, extra, location, contacts, notes, date:'created'|'updated'|'none', empty}`; default tutti `true` tranne `contacts:false`, `notes:false` **(v8)**, `date:'created'`, `empty:false` |
| `split` | `{ratio:0.5, rotate:-90 | 90, guides:true}` |
| `qrMode` | `live` · `placeholder` · `none` |
| `showQrUrl` | default `true` |
| `copies` | 1–50 |
| `previewMode` | `labels` · `calib` |
| `pvLandscape`, `advanced` | preferenze di anteprima / pannello |

### Preset (`BUILTIN_PRESETS`, `customPresets`)

```json
{"id":"mrink143","kind":"die","recommended":1,"name":"4 etichette 105×148 (A6) — 8 etichette da dividere · MRINK143",
 "w":105,"h":74,"cols":2,"rows":4,"group":2,"turn":true,"marginTop":0.5,"marginLeft":0,"gapX":0,"gapY":0,"radius":0,"cut":false}
```

`kind`: `die` (fustellato), `full` (A4 adesivo intero, `cut:true`), `custom` (utente, id `custom-<base36>`). Elenco completo in `ARCHITETTURA.md` §5.

### `usedSlots`

`{ "<presetId>": [indici di slot 0-based già usati] }` — indice = `riga × cols + colonna` sul foglio non ruotato (non il numero di lettura). Esempio: `{"mrink143":[6,4]}`.

### Campi di servizio (solo localStorage)

`schema` (26.8), `app` (`DocMap26`), `lang` (`it`/`en`), `view` (`archive`, `print`, `info`, `import`, `export`, `database`, `ai`, `settings`; il vecchio `clients` diventa `info`), `archiveView` (`table`/`map`), `hasUnexportedChanges`, `onboarded`, `lastExportAt`, `lastExportFile`, `lastSavedAt`, e in v8:

- `infoTab`: sotto-scheda di Informazioni, `clients` (predefinita) · `tags` · `category` · `year` · `place` · `multi` · `extra` · `qr`.
- `printPrev`: presente solo durante una "Ristampa solo QR": `{presetId, geometry, geometryModified, contentMode, sel:[id dei faldoni in coda], at:ISO}`, le impostazioni di stampa da ripristinare.

Questi due campi **non** sono nel workspace JSON né nel `.sqlite` (che salvano `settings`, `print`, `usedSlots`, `lang`).

## 5. Identificatori e regole

### 5.1 `id`
UUID v4 (`crypto.randomUUID`). Generato alla creazione, **mai cambiato**: è la chiave per foto (`photos.owner_key`), sincronizzazione futura e riconciliazione. In import viene scartato solo se duplicato nel file o già usato da un altro faldone.

### 5.2 `speaking_code`
- Maiuscolo, senza spazi, **unico** (confronto senza distinzione maiuscole).
- Suggerimento (`suggestSpeakingCode`): iniziali + progressivo per cliente. Iniziali = prima lettera di fino a 3 parole significative, ignorando forme societarie (S.r.l., S.p.A., S.n.c., S.a.s.) e parole vuote (`di, e, della, il, aps, ets, odv, onlus, srl, studio, dott, …`); se resta una sola iniziale si usano le prime 2 lettere; se nessuna, `DM`. Numero = massimo esistente con quel prefisso + 1.
  `Barbieri Luigi S.r.l.` → `BL1, BL2…` · `Rossi Costruzioni S.p.A.` → `RC1` · `Farmacia San Giorgio` → `FSG1`.
- Un duplicato viene rinominato automaticamente all'import (con avviso) e da `ensureIntegrity()`.
- È la chiave di **upsert** dell'import CSV/AI (stesso codice parlante = aggiorna).

### 5.3 `short_code`
- Formato generato: `dm26` + 8 caratteri dall'alfabeto
  `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789` (56 simboli: **esclusi `I O l o 0 1`**), estrazione crittografica senza bias (rejection sampling). ≈ 9,7 × 10¹³ combinazioni.
- Validazione accettata: `^dm26[A-Za-z0-9]{8}$` (più larga, per codici storici/manuali). Un codice non valido o duplicato viene rigenerato.
- **Unico e mai riusato**: è stampato sull'etichetta fisica. Un faldone eliminato non deve cedere il suo codice ad altri (il sistema Python e l'hub devono tenere un registro dei codici emessi).
- `short_url = 'https://qr7.it/' + short_code`. Il QR codifica solo questo URL.

### 5.4 `location_code`
`computeLocation(b)` = `[testa, shelf_code, sector_code]` non vuoti uniti da `-`, dove testa = `room_code + cabinet_code` se la stanza è 1–2 lettere e l'armadio 1–3 alfanumerici (`A` + `1` → `A1`), altrimenti `room_code + ' · ' + cabinet_code`.
Esempi: `A1-α`, `B2-β-SX`, `Ufficio 1 · 2-α`. `parseLocation()` fa il percorso inverso in import.

### 5.5 Destinazione finale
`destFor(b)` = `b.final_destination` se non vuoto, altrimenti `renderDest(settings.destTemplate, b)`. Segnaposto (URL-encoded): `{speaking_code} {multi_code} {short_code} {company}` (slug del nome) `{location} {id}`. In import, una destinazione uguale al modello viene svuotata (resta "da modello").

### 5.6 Colori per categoria
`Ordinaria #2563EB · Semplificata #059669 · Societario #7C3AED · Lavoro #D97706 · Dichiarativi #DC2626 · altre #475569` (import) / `#2563EB` (default di `normalizeBinder`).
Dalla v8 l'utente può cambiare o aggiungere colori in Informazioni › Categorie (`settings.catColors`): valgono per i faldoni nuovi e per l'import; i faldoni esistenti cambiano solo se l'utente spunta "Applica anche ai … faldoni esistenti di questa categoria". Il prompt AI elenca sempre i colori predefiniti.

### 5.7 `archive_state` in import
Accetta anche `corrente/attivo/active → CURRENT`, `storico/archivio storico/deposito/hist → HISTORICAL`, `prelevato/in uso/fuori/out → CHECKED_OUT`; sconosciuto → `CURRENT`.

### 5.8 `multi_code`
Testo libero; spazi multipli ridotti a uno; maiuscole/minuscole, trattini, barre e zeri iniziali **conservati**. Nel manifest compare come tag `multi-<slug>`.

## 6. Formati CSV

Regole comuni in **export**: delimitatore `;`, a capo `\r\n` (manifest `\n`), campi con `;` `"` o a capo tra virgolette con `""`. Backup e clienti hanno BOM UTF-8 (per Excel) e **protezione formule**: una cella che inizia con `= + - @ TAB CR` riceve un apostrofo iniziale, tolto di nuovo in import.
In **import**: delimitatore rilevato (`;` `,` TAB) o riga `sep=;`; codifica UTF-8 (con/senza BOM), UTF-16 o Windows-1252; intestazioni confrontate dopo `normHeader` (minuscolo, senza accenti, non alfanumerici → `_`) con gli alias di `HEADER_ALIASES` (es. `cliente → company_name`, `codice_multi → multi_code`, `stanza → room_code`, `contenuti → contents_items`, `stato → archive_state`; v8: `contatti`, `contatto`, `persone`, `persone_coinvolte`, `referenti`, `referente`, `contact`, `people → contacts`; `note`, `nota`, `annotazioni`, `annotazione → notes`). Le intestazioni non riconosciute aprono il passo di abbinamento colonne (§6.5).

### 6.1 Backup completo `docmap_full_backup.csv` (27 colonne, in quest'ordine)

```
speaking_code;multi_code;company_name;company_city;category;binder_title;ref_year;room_code;cabinet_code;shelf_code;sector_code;location_code;archive_state;contents;tags;color_hex;short_code;short_url;final_destination;extra_codes;shelf_color;contacts;notes;selected_for_print;id;created_at;updated_at
```

Righe ordinate per codice parlante (ordinamento naturale). `final_destination` contiene l'URL risolto. `selected_for_print` = `1`/`0`. `contents` include i suffissi di stato (`[in uso]`, `[cliente]`).
**Attenzione (v8):** `contacts` e `notes` sono state inserite **dopo `shelf_color`** (posizioni 22–23), non in coda: rispetto al CSV v7 a 25 colonne, `selected_for_print`, `id`, `created_at`, `updated_at` sono scalate di due posizioni. DocMap importa per intestazione, quindi i file v7 restano validi; chi legge il CSV per posizione deve usare l'intestazione.

### 6.2 Modello AI (22 colonne)

```
speaking_code;multi_code;company_name;category;binder_title;room_code;cabinet_code;shelf_code;sector_code;location_code;archive_state;contents;tags;color_hex;short_code;short_url;final_destination;company_city;ref_year;extra_codes;contacts;notes
```

Generato da `csvTemplateHeader()` e incluso nel prompt di `buildAIPrompt()`, che impone: un solo blocco ```` ```csv ````, esattamente 22 campi per riga (21 `;`), niente `;` nei valori, nessun dato inventato (né persone in `contacts`), `short_code`/`short_url`/`final_destination` preferibilmente vuoti, `multi_code` copiato esattamente o vuoto, `notes` senza a capo; nei contenuti i suffissi `[in uso]` / `[cliente]` per i documenti fuori dal faldone.
**Import senza intestazione** (righe incollate senza la prima riga, `analyzeImport`): ≥ 22 campi → ordine AI v8 seguito da `selected_for_print;id;updated_at`; 20–21 campi → ordine AI v7 (senza `contacts, notes`); 17 campi → ordine v5 (senza `company_city, ref_year, extra_codes`); altre lunghezze < 20 → anche senza `multi_code` (16, ordine pre-Multi). Il percorso dell'import da testo (`imapRouteText`) riconosce come righe AI solo le lunghezze 16, 17, 20, 21, 22, 23; le altre aprono il passo di abbinamento colonne.

### 6.3 Manifest qr7.it `manifest_qr7_dm26.csv`

```
short_code;short_url;final_destination;tags
dm26K8m2P9xL;https://qr7.it/dm26K8m2P9xL;https://docmap.pr-it.it/studio-de/q/dm26K8m2P9xL;docmap26,BL1,multi-m-10234,barbieri-luigi
```

`tags` = `docmap26`, codice parlante, `multi-<slug multi_code>` (se presente), slug del cliente. L'unione con un `manifest.csv` esistente conserva tutte le righe non `dm26`, il delimitatore, il BOM e il fine riga originali.
Nota: la vista SQLite `v_manifest_qr7` usa tag ridotti (`docmap26,<speaking_code>`); il file esportato dall'app è quello di riferimento.

### 6.4 Anagrafica clienti

Import: vedi §3. Export `docmap_clienti.csv`: `multi_code;ragione_sociale;indirizzo;cap;localita;provincia;tipo;categoria;note`.

### 6.5 Excel `.xlsx` e abbinamento colonne (v8)

- `.xlsx` letto offline (`05b-import-map.js`): ogni cella come testo (zeri iniziali e spazi interni conservati, numeri senza artefatti, date `AAAA-MM-GG`, data e ora `AAAA-MM-GG HH:MM`), righe vuote mantenute perché i numeri di riga coincidano con Excel. **Limiti:** celle unite non espanse, formule senza valore salvato lette vuote, `.xls` / `.xlsb` / `.ods` / file protetti non supportati, serve `DecompressionStream` (Chrome/Edge ≥ 103).
- Ogni tabella con intestazioni non standard (xlsx, CSV, celle incollate) passa dal passo **Abbina le colonne** (per CSV standard e array JSON di righe piatte il passo resta apribile a richiesta): riga di intestazione (o "nessuna"), destinazione `binders` / `clients`, per colonna un campo DocMap o "ignora". Più colonne sullo stesso campo vengono unite.
- I record così ottenuti hanno le chiavi dei campi DocMap e seguono la stessa pipeline (`analyzeImportRecords` / `analyzeClients`): anteprima NUOVO / AGGIORNA / ERRORE, Merge o Replace.
- L'abbinamento viene salvato in `settings.importMappings` (§4) e riproposto per un file con le stesse colonne.

## 7. SQLite

File: download `docmap_AAAAMMGG_HHMM.sqlite`, file collegato, oppure copia in IndexedDB. Versione schema in `meta(key='schema_version')`.

| `DB_SCHEMA_VERSION` | Modifiche |
|---|---|
| 1 | binders, contents_items, settings, label_presets, sessions, audit_log, meta, vista manifest |
| 2 | `binders.multi_code` + indice, tabella `photos` |
| 3 | `binders.company_city, ref_year, extra_codes, shelf_color`, tabella `clients` |
| 4 | `binders.contacts`, `binders.notes`, `contents_items.status TEXT DEFAULT 'archive'` (v8) |
| 5 | tabella `activity_log` + indice `ix_activity_at` (v9, registro attività, §7.2) |

DDL corrente (copiata da `06-db.js`, `DB_DDL`):

```sql
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS binders(
  id TEXT PRIMARY KEY,
  speaking_code TEXT NOT NULL UNIQUE,
  multi_code TEXT,
  company_name TEXT, company_city TEXT, category TEXT, color_hex TEXT, binder_title TEXT,
  ref_year TEXT, extra_codes TEXT, shelf_color TEXT, contacts TEXT, notes TEXT,
  room_code TEXT, cabinet_code TEXT, shelf_code TEXT, sector_code TEXT, location_code TEXT,
  archive_state TEXT CHECK (archive_state IN ('CURRENT','HISTORICAL','CHECKED_OUT')),
  tags TEXT,
  short_code TEXT UNIQUE, short_url TEXT,
  final_destination TEXT, final_destination_custom TEXT,
  selected_for_print INTEGER DEFAULT 0,
  created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS contents_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  binder_id TEXT NOT NULL REFERENCES binders(id) ON DELETE CASCADE,
  position INTEGER, year TEXT, description TEXT,
  status TEXT DEFAULT 'archive');   -- archive | in_use | client
CREATE INDEX IF NOT EXISTS ix_contents_binder ON contents_items(binder_id);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS label_presets(id TEXT PRIMARY KEY, name TEXT, geometry_json TEXT);
CREATE TABLE IF NOT EXISTS sessions(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, note TEXT,
  created_at TEXT, binder_count INTEGER, workspace_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS photos(
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('binder','cabinet')),
  owner_key TEXT NOT NULL,
  mime TEXT, data BLOB NOT NULL, width INTEGER, height INTEGER,
  caption TEXT, marks_json TEXT, created_at TEXT);
CREATE INDEX IF NOT EXISTS ix_photos_owner ON photos(owner_type, owner_key);
CREATE TABLE IF NOT EXISTS clients(
  id TEXT PRIMARY KEY, multi_code TEXT, name TEXT NOT NULL,
  address TEXT, cap TEXT, city TEXT, province TEXT, type TEXT, category TEXT, notes TEXT);
CREATE INDEX IF NOT EXISTS ix_clients_multi ON clients(multi_code);
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, action TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS activity_log(
  id TEXT PRIMARY KEY, at TEXT NOT NULL, who TEXT, action TEXT NOT NULL,
  target_type TEXT, target_id TEXT, target_code TEXT,
  summary TEXT, details_json TEXT, source TEXT DEFAULT 'ui');
CREATE INDEX IF NOT EXISTS ix_activity_at ON activity_log(at);
DROP VIEW IF EXISTS v_manifest_qr7;
CREATE VIEW v_manifest_qr7 AS
  SELECT short_code, short_url, final_destination, 'docmap26,' || speaking_code AS tags FROM binders ORDER BY speaking_code;
```

Più, da `dbMigrate()`: `CREATE INDEX IF NOT EXISTS ix_binders_multi ON binders(multi_code)`, `ALTER TABLE binders ADD COLUMN … TEXT` per le colonne mancanti nei file vecchi (`multi_code, company_city, ref_year, extra_codes, shelf_color, contacts, notes`) e `ALTER TABLE contents_items ADD COLUMN status TEXT DEFAULT 'archive'`. Nei file migrati le colonne aggiunte stanno in fondo alla tabella: leggere sempre per nome.
In lettura `dbReadWorkspace()` usa `SELECT *` su `contents_items` (i file v1–v3 non hanno `status`) e normalizza lo stato con `normCiStatus()`.

Contenuto delle tabelle di servizio:

- `meta`: `app = DocMap26`, `schema_version`, `synced_at` (ISO), `studio` (nome studio).
- `settings`: 4 righe, valore JSON — `settings` (comprese le chiavi v8 `catColors`, `qrPreset`, `importMappings`, `edLocOpen`), `print`, `usedSlots`, `lang`.
- `label_presets`: preset personalizzati, `geometry_json` = oggetto preset completo.
- `sessions.workspace_json`: stesso formato del workspace JSON (§8).
- `audit_log`: ultime ~500 operazioni tecniche del database (`sync`, `session_save`, `session_restore`, `open_file`, `link_file`, `photo_add`, …). Non è il registro attività per l'utente (§7.2).

Semantica: le tabelle `binders`, `contents_items`, `settings`, `label_presets`, `clients` sono uno **specchio** riscritto per intero dallo stato a ogni sincronizzazione. `photos`, `sessions` e `activity_log` sono persistenti e vivono solo qui (`activity_log` anche nei backup JSON). Le foto non hanno chiave esterna: `phOrphans()` conta quelle di faldoni eliminati.

### 7.1 Foto (`photos`)

| Colonna | Significato |
|---|---|
| `id` | uuid |
| `owner_type` | `binder` o `cabinet` |
| `owner_key` | `binders.id` per un faldone; `room_code + cabinet_code` (es. `A1`) per un armadio |
| `mime`, `data` | `image/jpeg`, JPEG ridotto a 1400 px sul lato lungo, qualità 0,8 |
| `width`, `height` | pixel dopo il ridimensionamento |
| `caption` | didascalia |
| `marks_json` | solo foto di armadio: posizione dei ripiani sulla foto, `{"<shelf>|<sector>": {"x":0.412,"y":0.233}}` o `{"<shelf>": …}`, coordinate normalizzate 0–1 |
| `created_at` | ISO |

Le foto **non** sono nei CSV né nel JSON: solo nel `.sqlite`.

### 7.2 Registro attività (`activity_log`, v9)

Una riga per ogni operazione importante fatta dall'utente (modulo `06e-log.js`, helper `logAct(action, target, summary, details, source)`). Pensato già per l'hub multiutente (`HUB-E-API.md`): stessi campi, `id` uuid unico, nessun riferimento a rowid.

| Colonna | Campo JSON | Significato |
|---|---|---|
| `id` | `id` | uuid dell'operazione |
| `at` | `at` | ISO 8601 UTC |
| `who` | `who` | `settings.operator` (nome scritto in Impostazioni); se vuoto `"Questo PC"` |
| `action` | `action` | id stabile `<gruppo>.<verbo>`, vedi sotto |
| `target_type`, `target_id`, `target_code` | `target: {type, id, code}` o `null` | oggetto toccato: `binder` (id + codice parlante), `client` (id + Codice Multi o nome), `info` (lista + voce), `session`, `file` (nome file) |
| `summary` | `summary` | testo breve in italiano, es. `Modificato il faldone BL1: stanza, titolo` |
| `details_json` | `details` | JSON piccolo: `{"changed":{"campo":["vecchio","nuovo"]}}` per le modifiche (testi tagliati a 300 caratteri), conteggi (`count`, `added`, `updated`, `errors`), `codes`, `file`, `preset`, `mode`, `labels`, `sheets` |
| `source` | `source` | `ui` · `import` · `ai` (righe AI senza intestazione) · `restore` (backup, snapshot, sessione, `.sqlite` aperto) |

Azioni: `binder.create`, `binder.edit`, `binder.duplicate`, `binder.delete`, `binder.delete_bulk`, `binder.wipe`, `undo`, `demo.delete`, `demo.load`, `import.merge`, `import.replace`, `backup.restore`, `backup.snapshot`, `client.import`, `client.create`, `client.edit`, `client.delete`, `info.rename`, `info.merge`, `info.delete`, `export.manifest`, `export.csv`, `export.json`, `export.backup`, `export.sqlite`, `export.clients`, `export.log`, `export.file`, `print.labels`, `print.pdf`, `print.register`, `print.calibration`, `db.session_save`, `db.session_restore`, `db.session_delete`, `db.open`, `settings.operator`. Nuove azioni si aggiungono senza cambiare lo schema.

Regole:

- Vengono conservate le **ultime 20 000** operazioni (`LOG_CAP`); le più vecchie si cancellano (SQLite e memoria).
- Il registro **non** è nello stato `S` né in `localStorage['docmap_v26_state']`: in memoria (`LOG.entries`), in SQLite e, solo per le righe non ancora salvate in IndexedDB, in `localStorage['docmap_v26_log_pending']` (di solito vuoto).
- Aprendo un altro `.sqlite` o ripristinando un backup JSON i due registri si **uniscono** per `id`: nessuna riga viene tolta. Le sessioni non contengono il registro.
- Export CSV dal registro: `docmap_registro_attivita_AAAAMMGG_HHMM.csv`, `;`, BOM UTF-8, protezione formule; colonne `date;who;action;operation;target_type;target_code;summary;details;source;at;id`.

## 8. Workspace JSON (`docmap_workspace.json`)

```json
{
  "app": "DocMap26",
  "format": "docmap_workspace",
  "version": "26.9.0",
  "exported_at": "2026-11-01T10:00:00.000Z",
  "settings": {"studioName": "…", "destTemplate": "https://docmap.pr-it.it/studio-de/q/{short_code}", "qrEcc": "M", "catColors": {}, "qrPreset": "l7159"},
  "lang": "it",
  "print": {"presetId": "mrink143", "geometry": {"w":105,"h":74,"cols":2,"rows":4,"marginTop":0.5,"marginLeft":0,"gapX":0,"gapY":0,"radius":0,"cut":false,"group":2,"turn":true}, "contentMode": "info", "info": {"items": 2, "pair": false}, "edge": {"outer": 4, "cut": 1, "byPreset": {}}, "…": "…"},
  "customPresets": [],
  "usedSlots": {"mrink143": []},
  "binders": [{
    "id": "8d0c2f0e-5b7a-4a51-9a1e-0f3c6d2b7e11", "speaking_code": "BL1", "multi_code": "M-10234",
    "company_name": "Barbieri Luigi S.r.l.", "company_city": "Parma (PR)", "ref_year": "2025", "extra_codes": "",
    "shelf_color": "", "category": "Ordinaria", "color_hex": "#2563EB", "binder_title": "Fatture e Contabilità IVA",
    "room_code": "A", "cabinet_code": "1", "shelf_code": "α", "sector_code": "", "location_code": "A1-α",
    "archive_state": "CURRENT",
    "contents_items": [{"year": "2025", "description": "Fatture Acquisto Q1-Q4", "status": "archive"},
                       {"year": "2025", "description": "F24 Versamenti", "status": "in_use"}],
    "tags": "iva,fatture,2025", "short_code": "dm26K8m2P9xL", "short_url": "https://qr7.it/dm26K8m2P9xL",
    "final_destination": "", "contacts": "Mario Rossi", "notes": "", "selected_for_print": true,
    "created_at": "2026-10-31T09:12:44.120Z", "updated_at": "2026-10-31T09:12:44.120Z"
  }],
  "clients": [{"id": "…", "multi_code": "8", "name": "APS IL ROSMARINO TEST", "address": "VIA ARGINI 5", "cap": "43037",
               "city": "LESIGNANO DE' BAGNI", "province": "PR", "type": "ENC", "category": "APS", "notes": "Cod. comune E547"}]
}
```

- `binders[].final_destination` è la destinazione **personalizzata** (vuoto = modello), a differenza del CSV.
- L'import JSON accetta anche un array di faldoni, `{rows:[…]}`, `{data:[…]}` o un singolo oggetto; con il workspace completo può ripristinare anche impostazioni, stampa, preset, fogli e clienti.
- Lo stato in `localStorage['docmap_v26_state']` ha la stessa struttura più i campi di servizio (§4: `schema`, `view`, `infoTab`, `printPrev`, …).
- Un workspace v7 si importa senza modifiche: mancano `contacts`, `notes` e `status`, che diventano `''`, `''` e `'archive'`.
- v9: i backup ("Esporta workspace JSON", "Salva backup") hanno in più la chiave facoltativa `activity_log` (array di righe come in §7.2). I file senza questa chiave si importano come prima; con "ripristina tutto" + Sostituisci le righe vengono unite al registro esistente. `settings.operator` (stringa, vuota per default) è il nome dell'operatore.

## 9. Sessioni

Una sessione è una riga di `sessions` con `name`, `note`, `created_at`, `binder_count` e `workspace_json` (il workspace JSON completo al momento del salvataggio, senza foto). Il ripristino sostituisce tutto lo stato (con undo).

## 10. Novità della v8 rispetto alla v7

| Novità | Modello | CSV | JSON | SQLite |
|---|---|---|---|---|
| Contatti del faldone | `binder.contacts` stringa, nomi separati da virgola (non una lista strutturata) | colonna `contacts` (dopo `shelf_color`) | `binders[].contacts` | `binders.contacts TEXT` |
| Note | `binder.notes` stringa | colonna `notes` (dopo `contacts`) | `binders[].notes` | `binders.notes TEXT` |
| Stato della voce di contenuto | `contents_items[].status` ∈ `archive` \| `in_use` \| `client`, default `archive`, indipendente da `archive_state` | suffisso `[in uso]` / `[cliente]` nel testo `contents` | `contents_items[].status` | `contents_items.status TEXT DEFAULT 'archive'` |
| Import Excel e abbinamento colonne | `.xlsx` offline + passo di abbinamento; stesso `analyzeImportRecords` a valle | — | — | — |
| Abbinamenti ricordati | `settings.importMappings` (max 40) | — | in `settings` | riga `settings` |
| Hub Informazioni | vista `info`, sotto-schede in `infoTab`; liste calcolate, **rinomina / unisci / elimina in blocco** con annulla | — | `infoTab` non esportato | — |
| Colori per categoria | `settings.catColors` | — | in `settings` | riga `settings` |
| Ristampa solo QR | `print.contentMode = 'qr'` (etichetta `Q`), `settings.qrPreset`, `printPrev` | — | `qrPreset` in `settings`; `printPrev` non esportato | riga `settings` / `print` |
| Menu ⚙ Funzioni avanzate | nessun impatto sul modello | — | — | — |

Versioni: `APP_VERSION 26.8.0`, schema stato `26.8` (unico passo di `migrate()`: `view:'clients'` → `view:'info'` + `infoTab:'clients'`), `DB_SCHEMA_VERSION 4` (migrazione additiva in `dbMigrate()`).
Non implementato in v8: contatti come lista strutturata (`{name, role, phone, email}`), note stampate nel Registro Generale, stato delle voci nel Registro Generale, chiave esterna `client_id` tra faldone e cliente.
Per i campi futuri: aggiungerli **in coda** a `CSV_COLUMNS` (dopo `updated_at`), con alias, `ALTER TABLE` additivo, bump di schema e prompt AI. Checklist completa in `../AGENTS.md` §4.


## 11. Novità v9 (APP_VERSION 26.9.0, schema stato 26.9, DB 5)

| Dove | Campo | Significato |
|---|---|---|
| `S.print.contentMode` | `'info'` (nuovo default) | Modello "Etichetta informazioni": Multi grande (o codice parlante con didascalia CODICE), categoria · codice, ragione sociale adattata allo spazio e mai spezzata a metà parola, QR + URL, prime voci, tag e data. Registro dei modelli: `LABEL_TEMPLATES` in 03-print.js. |
| `S.print.info` | `{items:0..2, pair:false}` | `items` = prime voci del contenuto stampate in fondo; `pair` = stampa anche l'etichetta del contenuto (tipo `C`) sull'altra metà della stessa etichetta fisica. |
| `S.print.edge` | `{outer:4, cut:1, byPreset:{[presetId]:bool}}` | Bordi uguali: ogni etichetta stampa dentro la stessa area sicura centrata (inset = max(padding, outer) + `cut` sui lati tagliati a mano). Acceso di default sui fogli tagliati a mano (MRINK143), spento sui fustellati. |
| `S.settings.operator` | stringa | Nome dell'operatore scritto nel registro attività (vuoto → "Questo PC"). |
| SQLite `activity_log` | vedi §7.2 | Registro attività, ultime 20 000 voci, anche nel backup JSON (`activity_log`). |

Migrazione `migrate()` 26.9: se il preset è `mrink143` e la modalità era `split`, passa una volta a `info`. Lo Scarica PDF (05c-pdf.js, font in `vendor/pdf-fonts.js`) non aggiunge campi: costruisce il PDF dall'HTML di `buildLabelSheets(false)`.
