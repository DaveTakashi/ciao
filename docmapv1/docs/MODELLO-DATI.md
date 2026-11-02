# DocMap 2026 — Modello dati e formati

**Questo documento è il contratto tra l'MVP e il sistema Python dello studio.** In caso di dubbio vincono il modello dati e la UX dell'MVP: il sistema Python si allinea a questi nomi, tipi e regole.

Versione attuale: **26.12.0** (v12) — schema stato `26.9` (invariato dalla v9), `DB_SCHEMA_VERSION 9`, server
`DM_SCHEMA 2`. La v12 aggiunge gli archivi (§15: `archive_id` su faldoni e ubicazioni, colonna CSV in coda). I §1–§9 descrivono i formati di oggi; i campi aggiunti dopo la v7
sono segnati con la versione (**(v8)**, **(v10)**, **(v11)**); i §10–§14 raccontano versione per versione cosa è
cambiato (v8 §10, v9 §11, v10 §12–§13, v10.1 e v11 §13, ubicazioni v11 §14, archivi v12 §15).
**Schemi macchina** (JSON Schema 2020-12, controllati sui file veri): `python/SCHEMI.md` e `python/schema/`.

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
| `color_hex` | `#RRGGBB` maiuscolo | sì (auto) | colore del dorso; automatico per cliente/categoria (§5.6, §12) | `#2563EB` | `color_hex` | `color_hex` |
| `color_locked` **(v10)** | booleano | no (`false`) | `true` = colore scelto a mano: mai cambiato in automatico (§12) | `false` | `color_locked` (`1`/`0`, ultima colonna) | `color_locked INTEGER DEFAULT 0` |
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
| `contents_items` | array di `{id, year, description, status}` | no | documenti contenuti, in ordine (§2) | vedi §2 | `contents` (testo con `\|`) | tabella `contents_items` |
| `tags` | stringa, virgole | no | parole chiave minuscole; il tag `demo` marca i dati di esempio e non si stampa mai | `iva,fatture,2025` | `tags` | `tags` |
| `short_code` | stringa | sì (auto) | codice QR statico, unico, mai riusato (§5.3) | `dm26K8m2P9xL` | `short_code` | `short_code` UNIQUE |
| `short_url` | stringa **derivata** | — | `https://qr7.it/{short_code}` | `https://qr7.it/dm26K8m2P9xL` | `short_url` | `short_url` |
| `final_destination` | URL o `''` | no | destinazione **personalizzata**; vuoto = modello dello studio (§5.5) | `''` | `final_destination` (esporta l'URL **risolto**) | `final_destination` = risolto, `final_destination_custom` = personalizzato |
| `selected_for_print` | booleano | sì (def. `false`; nuovi da editor, duplica e import Merge: `true`) | in coda di stampa | `true` | `selected_for_print` (`1`/`0`) | `selected_for_print` INTEGER 0/1 |
| `created_at` | ISO 8601 UTC | sì (auto) | creazione | `2026-10-31T09:12:44.120Z` | `created_at` | `created_at` |
| `updated_at` | ISO 8601 UTC | sì (auto) | ultima modifica (aggiornato a ogni salvataggio/import) | idem | `updated_at` | `updated_at` |
| `contacts` | stringa, virgole | no | **(v8)** persone coinvolte (referente del cliente, collega incaricato…), testo libero separato da virgole; mai inventate. Non stampato di default | `Mario Rossi, Anna (paghe)` | `contacts` | `contacts` TEXT |
| `notes` | stringa | no | **(v8)** nota libera breve sul faldone. Non stampata di default | `Documento uscito il 12/03 per verifica` | `notes` | `notes` TEXT |
| `location_id` **(v11)** | id di un'ubicazione o `''` | no (`''`) | la scatola / il nodo dell'albero delle ubicazioni in cui sta il faldone (§14); con un valore, `location_code` diventa il percorso dell'ubicazione | `''` | `location_id` (ultima colonna) | `location_id TEXT` |

Regole di validazione dell'editor: codice parlante obbligatorio e unico; cliente obbligatorio; short code nel formato `dm26` + 8 alfanumerici e unico. In import una riga senza cliente viene saltata (salvo che aggiorni un faldone esistente per codice parlante).

## 2. Contenuti (`contents_items`)

```json
[{"id": "ci-3f9a0c12d4e5b6a7", "year": "2025", "description": "Fatture Acquisto Q1-Q4", "status": "archive"},
 {"id": "ci-0b1c2d3e4f5a6b7c", "year": "2024", "description": "Bilancio",               "status": "client"},
 {"id": "ci-9e8d7c6b5a4f3e2d", "year": "",     "description": "Visure camerali",        "status": "in_use"}]
```

- `id` **(v12)**: identificativo stabile del documento (gli stati dei singoli documenti, §17, puntano a lui). Formato
  `ci-` + 16 esadecimali (`CI_ID_RE = /^[A-Za-z0-9._:-]{1,64}$/`). Una voce senza id (dati v10/v11, CSV, AI, modello
  vecchio del telefono) lo riceve da `normalizeBinder()` → `ciEnsureIds()` in modo **deterministico** (hash di id del
  faldone + anno/descrizione + occorrenza): due dispositivi che aggiornano gli stessi dati ottengono gli stessi id e
  `updated_at` non cambia (`syncCanon` ignora gli id). Dopo, l'id resta anche se il testo cambia. Import CSV/AI
  (Sostituisci e Unisci), "Una riga per voce", il telefono e il ripristino dal registro riportano gli id delle voci
  esistenti con `ciCarryIds()` (stesso testo, poi stessa posizione se il numero di voci non cambia). Il formato testo
  (`|`) non porta gli id.

- `year`: stringa, facoltativa (`2025`, `2024/25`, `2020-2024`). `description`: stringa.
- `status` **(v8)**: `'archive'` (nel faldone, predefinito) · `'in_use'` (in uso / prelevato) · `'client'` (dato al cliente). Costanti `CI_STATUSES`; `normCiStatus()` normalizza i valori in ingresso (`in uso`, `in_use`, `uso`, `prelevato`, `fuori`, `out`, `checked_out` → `in_use`; `cliente`, `client`, `al cliente`, `dato al cliente` → `client`; tutto il resto, vuoto compreso → `archive`). È indipendente da `archive_state` del faldone: un faldone `CURRENT` può avere voci `client`.
- **Formato testo (CSV, AI):** voci separate da `|`, ciascuna `ANNO: Descrizione` (anno facoltativo). In lettura sono accettati anche gli a capo e i separatori `:` `-` `–` `—` dopo l'anno (regex `^(\d{4}(?:\s*[-/]\s*\d{2,4})?)\s*[:\-–—]\s*(.+)$`).
  Esempio: `2025: Fatture Acquisto Q1-Q4|2025: Liquidazioni IVA|Visure camerali`
- **Stato nel testo (v8)** (`ciText()` / `contentsToPipe()`): una voce non in archivio riceve un suffisso finale tra parentesi quadre, `[in uso]` oppure `[cliente]`; senza suffisso = `archive`. Esempio: `2025: Fatture acquisto|2024: Bilancio [cliente]|2025: F24 [in uso]`. In lettura (`pipeToContents()`, regex `CI_SUFFIX_RE`, senza distinzione maiuscole) sono accettati anche `[al cliente]`, `[dato al cliente]`, `[client]`, `[in use]`, `[in_use]`, `[prelevato]`, `[archivio]`, `[in archivio]`, `[archive]`. Il suffisso viene tolto dalla descrizione. Un file v7 (senza suffissi) si legge con tutte le voci `archive`.
- SQLite: tabella `contents_items(binder_id, position, year, description, status, item_id)`; `position` parte da 0; `status TEXT DEFAULT 'archive'`; `item_id` **(v12, schema 9)** = l'`id` stabile della voce. La colonna `id` è un AUTOINCREMENT **non stabile** (la tabella viene riscritta a ogni sync): identificare una voce con `item_id` (o, nei file vecchi, con `(binder_id, position)`).
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
| `color_hex` **(v10, facoltativo)** | colore per i faldoni creati dall'import di questo cliente (diventano `color_locked`) | `Colore` (alias `color`, `colore_dorso`…) | — | — (non salvato) |
| `tags` **(v10, facoltativo)** | tag copiati nei faldoni creati dall'import | `Tag` / `Tags` / `Etichette` | — | — (non salvato) |
| `updated_at` **(v10)** | ultima modifica, per la sincronizzazione | — | — | — (non salvato) |

I tre campi facoltativi stanno nello stato, nel workspace JSON e nei pacchetti di sincronizzazione, **non** nella
tabella SQLite `clients`: aprendo un `.sqlite` (o ripristinando una sessione) i clienti tornano senza.

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
| `colorMode` **(v10)** | `company`/`category`/`manual` | `company` (assente in uno stato v9) | assegnazione automatica dei colori dei dorsi (§12) |
| `catFamilies` **(v10)** | `{"<categoria>": "<id famiglia>"}` | assente = `{}` | spettro/famiglia di colori scelta per la categoria in Informazioni › Categorie (§12) |
| `colorRules` **(v10)** | `{"<categoria>": [{id, kw, hex, at}]}` | assente = `{}` | regole colore per parola chiave, max 10 per categoria (§12) |
| `colorSeeds` **(v10)** | `{"<nome>": "<id famiglia>"}` | assente = semi predefiniti APS/ODV/ASD/ETS | spettro proposto alle categorie senza scelta (§12) |
| `colorUpdatedAt` **(v10)** | ISO | assente | ultima modifica delle impostazioni colori (sync) |
| `bulkCols` **(v10)** | array di chiavi colonna (`speaking_code`, `company_name`, `multi_code`, `category`, `binder_title`, `ref_year`, `tags`, `company_city`, `location_code`, `archive_state`, `color_hex`, `extra_codes`, `contacts`, `notes`) | assente = tutte tranne `extra_codes`, `contacts`, `notes` | colonne visibili nella Modifica massiva (preferenza, nessun dato) |
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

`schema` (26.9 dalla v9; 26.8 nella v8), `app` (`DocMap26`), `lang` (`it`/`en`), `view` (`archive`, `print`, `info`, `import`, `export`, `database`, `ai`, `settings`; il vecchio `clients` diventa `info`), `archiveView` (`table`/`map`), `hasUnexportedChanges`, `onboarded`, `lastExportAt`, `lastExportFile`, `lastSavedAt`, e in v8:

- `infoTab`: sotto-scheda di Informazioni, `clients` (predefinita) · `tags` · `category` · `year` · `place` · `multi` · `extra` · `qr`.
- `printPrev`: presente solo durante una "Ristampa solo QR": `{presetId, geometry, geometryModified, contentMode, sel:[id dei faldoni in coda], at:ISO}`, le impostazioni di stampa da ripristinare.

Questi due campi **non** sono nel workspace JSON né nel `.sqlite` (che salvano `settings`, `print`, `usedSlots`, `lang`).

v10 (sincronizzazione, `docs/SYNC.md`): `tombstones` (eliminazioni da propagare `{type, id, code, deletedAt, who}`) e `sync` (`peers`, `lastExportAt`, `lastImportAt`, `lastPeer`, `history`), più `settings.deviceId` / `settings.deviceLabel`. Anche i clienti hanno `updated_at` (solo in localStorage e nei pacchetti di sincronizzazione, non nel `.sqlite`).

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
Dalla v8 l'utente può cambiare o aggiungere colori in Informazioni › Categorie (`settings.catColors`): valgono per i faldoni nuovi e per l'import; i faldoni esistenti cambiano solo se l'utente spunta "Applica anche ai … faldoni esistenti di questa categoria". Il prompt AI elenca sempre i colori predefiniti. **Dalla v10** questi colori sono la prima sfumatura della famiglia della categoria e l'assegnazione automatica è descritta al §12.

### 5.7 `archive_state` in import
Accetta anche `corrente/attivo/active → CURRENT`, `storico/archivio storico/deposito/hist → HISTORICAL`, `prelevato/in uso/fuori/out → CHECKED_OUT`; sconosciuto → `CURRENT`.

### 5.8 `multi_code`
Testo libero; spazi multipli ridotti a uno; maiuscole/minuscole, trattini, barre e zeri iniziali **conservati**. Nel manifest compare come tag `multi-<slug>`.

## 6. Formati CSV

Regole comuni in **export**: delimitatore `;`, a capo `\r\n` (manifest `\n`), campi con `;` `"` o a capo tra virgolette con `""`. Backup e clienti hanno BOM UTF-8 (per Excel) e **protezione formule**: una cella che inizia con `= + - @ TAB CR` riceve un apostrofo iniziale, tolto di nuovo in import.
In **import**: delimitatore rilevato (`;` `,` TAB) o riga `sep=;`; codifica UTF-8 (con/senza BOM), UTF-16 o Windows-1252; intestazioni confrontate dopo `normHeader` (minuscolo, senza accenti, non alfanumerici → `_`) con gli alias di `HEADER_ALIASES` (es. `cliente → company_name`, `codice_multi → multi_code`, `stanza → room_code`, `contenuti → contents_items`, `stato → archive_state`; v8: `contatti`, `contatto`, `persone`, `persone_coinvolte`, `referenti`, `referente`, `contact`, `people → contacts`; `note`, `nota`, `annotazioni`, `annotazione → notes`). Le intestazioni non riconosciute aprono il passo di abbinamento colonne (§6.5).

### 6.1 Backup completo `docmap_full_backup.csv` (30 colonne, in quest'ordine)

```
speaking_code;multi_code;company_name;company_city;category;binder_title;ref_year;room_code;cabinet_code;shelf_code;sector_code;location_code;archive_state;contents;tags;color_hex;short_code;short_url;final_destination;extra_codes;shelf_color;contacts;notes;selected_for_print;id;created_at;updated_at;color_locked;location_id;archive_id
```

**v12:** `archive_id` (archivio del faldone, §15) è aggiunta **in coda**, dopo `location_id`. In export contiene l'id dell'archivio **effettivo** (quello dell'albero dell'ubicazione, se il faldone è in una scatola nota; vuoto = Archivio principale). In import accetta l'id, il **codice** (`ST`) o il **nome** (`Archivio storico`); un nome sconosciuto crea l'archivio al momento dell'importazione. Alias: `archivio`, `id_archivio`, `archivio_id`, `cluster`, `archive`. Un CSV senza la colonna mette le righe nuove nell'archivio scelto in alto (Archivio principale con "Tutti gli archivi").

**v11:** `location_id` (id dell'ubicazione, §14) è aggiunta **in coda**, dopo `color_locked`. Alias in import: `id_ubicazione`, `ubicazione_id`, `id_luogo`. Con `location_id` valorizzato, `location_code` è il percorso dell'ubicazione e in import **non** viene scomposto in stanza/armadio/ripiano (resta com'è se l'ubicazione non è nota su quel PC).

**v10:** `color_locked` (`1`/`0`) è aggiunta **in coda**. Un CSV senza questa colonna si importa come prima; in quel caso un `color_hex` che non è un colore automatico della sua categoria viene considerato scelto a mano (`color_locked = true`), un colore mancante viene assegnato in automatico (§12).

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
short_code;short_url;final_destination;tags;
dm26K8m2P9xL;https://qr7.it/dm26K8m2P9xL;https://docmap.pr-it.it/studio-de/q/dm26K8m2P9xL;docmap26,BL1,multi-m-10234,barbieri-luigi;
```

**v11:** ogni riga, intestazione compresa, termina con `;` (formato richiesto da qr7.it). Il manifest contiene anche **una riga per ogni ubicazione** (§14): `dm26L…;https://qr7.it/dm26L…;<destinazione con {short_code}>;docmap26,location,<codice percorso>;` (es. `docmap26,location,MAG1-A1-S1-R1-B04`). L'unione con «Rimuovi le righe DocMap non più presenti» toglie anche le righe `dm26L…` delle ubicazioni eliminate. L'export e l'unione lo aggiungono sempre alle righe generate; le righe esistenti conservate dall'unione lo ricevono se mancante. In lettura il campo vuoto finale si ignora.

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
| 6 | `binders.color_locked INTEGER DEFAULT 0` (v10, colori, §12) |
| 7 | tabella `locations` + indice `ix_locations_parent`, `binders.location_id` + indice `ix_binders_location` (v11, ubicazioni, §14.4) |
| 8 | `clients.extra_json TEXT`: i campi del cliente oltre le 10 colonne (`color_hex`, `tags`, `updated_at`, …) in JSON (v11.1; prima si perdevano aprendo un file `.sqlite` o una sessione) |
| 9 | `contents_items.item_id TEXT` + tabella `status_events` + indice `ix_status_target` (v12, stati, §17.4) |

DDL corrente (da `06-db.js`, `DB_DDL`; la tabella `locations` è riportata al §14.4):

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
  created_at TEXT, updated_at TEXT,
  color_locked INTEGER DEFAULT 0,    -- v6 (DB_SCHEMA_VERSION 6): 1 = colore scelto a mano
  location_id TEXT);                 -- v7 (v11): locations.id, NULL = nessuna ubicazione
CREATE TABLE IF NOT EXISTS contents_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  binder_id TEXT NOT NULL REFERENCES binders(id) ON DELETE CASCADE,
  position INTEGER, year TEXT, description TEXT,
  status TEXT DEFAULT 'archive',    -- archive | in_use | client
  item_id TEXT);                     -- v9 (v12): id stabile della voce (§2, §15)
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
  address TEXT, cap TEXT, city TEXT, province TEXT, type TEXT, category TEXT, notes TEXT, extra_json TEXT);   -- extra_json: v11.1 (schema 8)
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

Azioni: `binder.create`, `binder.edit`, `binder.duplicate`, `binder.delete`, `binder.delete_bulk`, `binder.wipe`, `undo`, `demo.delete`, `demo.load`, `import.merge`, `import.replace`, `backup.restore`, `backup.snapshot`, `client.import`, `client.create`, `client.edit`, `client.delete`, `info.rename`, `info.merge`, `info.delete`, `export.manifest`, `export.csv`, `export.json`, `export.backup`, `export.sqlite`, `export.clients`, `export.log`, `export.file`, `print.labels`, `print.pdf`, `print.register`, `print.calibration`, `db.session_save`, `db.session_restore`, `db.session_delete`, `db.open`, `settings.operator`, `binder.bulk_edit` (v10, Modifica massiva: `target` = il faldone se è uno solo, altrimenti `null`; `details = {count, fields:[campi], binders:[{id, code, changed:{campo:[vecchio, nuovo]}}]}`). Nuove azioni si aggiungono senza cambiare lo schema.

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
  "version": "26.11.1",
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
    "color_locked": false, "location_id": "",
    "created_at": "2026-10-31T09:12:44.120Z", "updated_at": "2026-10-31T09:12:44.120Z"
  }],
  "clients": [{"id": "…", "multi_code": "8", "name": "APS IL ROSMARINO TEST", "address": "VIA ARGINI 5", "cap": "43037",
               "city": "LESIGNANO DE' BAGNI", "province": "PR", "type": "ENC", "category": "APS", "notes": "Cod. comune E547"}],
  "locations": [],
  "activity_log": [],
  "sync_journal": []
}
```

Chiavi in quest'ordine (`workspaceJSON(withLog)` in 04-ui.js): `app, format, version, exported_at, settings, lang,
print, customPresets, usedSlots, binders, clients, locations` (v11), `activity_log` (v9, solo nei backup) e
`sync_journal` (v11, aggiunta da 06i-journal.js solo se il registro locale non è vuoto). Schema completo:
`python/schema/workspace_backup.schema.json`.

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

## 12. Colori dei dorsi (v10, `assets/js/02b-colors.js`)

**Famiglie** (`COLOR_FAMILIES`, 11 famiglie × 10 sfumature). Gli 8 **spettri colore** proposti per le categorie (`COLOR_SPECTRA`, campo `spectrum:1`): `red` Rosso · `green` Verde · `blue` Azzurro / Blu · `yellow` Giallo · `orange` Arancione · `violet` Viola · `pink` Rosa · `slate` Nero / Grigi; famiglie miste ancora usabili: `warm` Caldi (rossi, arancio, ocra) · `cool` Freddi scuri (blu, verdi scuri) · `teal` Petrolio. Ogni sfumatura ha contrasto ≥ 3:1 con il testo bianco (il dorso nella mappa scaffali scrive in bianco; per questo il Giallo è un giallo ocra/senape) e, dentro la famiglia, una distanza percettiva CIEDE2000 ≥ 7 (distinguibili anche stampate). Le sfumature sono state scelte in OKLCH con una selezione greedy max-min ΔE2000; la prima sfumatura di blu/verde/viola/arancione/rosso è esattamente il colore v9 della categoria. Le liste sono **dati** (non logica): il lato Python può tenerle in tabella.

**Famiglia (spettro) di una categoria** (`colorFamilyId(cat)`, confronto senza maiuscole/spazi doppi):
1. `settings.catFamilies[cat]` se scelta (Informazioni › Categorie, o nel modulo del faldone quando si scrive una categoria nuova);
2. altrimenti, se esiste `settings.catColors[cat]` (colore della categoria, v8), la famiglia più vicina a quel colore;
3. altrimenti il **seme** (`settings.colorSeeds`, predefinito `COLOR_SEEDS_DEFAULT = {APS:'red', ODV:'green', ASD:'blue', ETS:'yellow'}`), confrontato come parola intera del nome della categoria ("APS", "APS Cultura");
4. altrimenti la regola sul nome (`COLOR_CAT_RULES`): Ordinaria → blu, Semplificata → verde, Societario → viola, Lavoro/Paghe → arancione, Dichiarativi/Redditi → rosso, Contenzioso → nero/grigi, Privati/Persone fisiche → petrolio, ENC/SSD/Onlus/associazioni/enti/fondazioni/circoli → caldi, Condominio → rosa, Società/S.r.l./S.p.A./aziende/imprese/ditte → freddi scuri;
5. altrimenti una famiglia stabile scelta con l'hash FNV-1a del nome tra `blue, green, violet, orange, red, teal, pink, slate`.

**Regole colore** (secondo livello, `settings.colorRules`):
```json
"colorRules": {"APS": [{"id": "cr-1a2b3c4d", "kw": "proloco", "hex": "#732D3D", "at": "2026-11-01T10:00:00.000Z"}]}
```
- Al massimo **10 regole per categoria** (`COLOR_RULES_MAX`), in ordine di priorità: vince la **prima** che corrisponde.
- Testo controllato: `company_name + " " + binder_title`.
- Confronto (`colorTextMatches`): parola chiave e testo minuscoli, senza accenti, ogni sequenza non alfanumerica = separatore di parole; la parola chiave senza spazi deve essere uguale a **una parola o a più parole consecutive unite**. Quindi `proloco` corrisponde a "Pro Loco", "PRO-LOCO", "Proloco di Busseto", ma non a "Prolocomotiva"; `aps` non corrisponde a "Capsule" (solo parole intere, per evitare falsi positivi).
- Una regola nuova riceve in automatico una sfumatura libera della famiglia (diversa dal colore base e dalle altre regole); l'utente la cambia dalla striscia della famiglia. Se si cambia lo spettro, le regole passano a sfumature distinte del nuovo spettro.
- La sfumatura di una regola è **condivisa** da tutti i faldoni che corrispondono ("proloco = questo rosso") ed è **riservata**: in modalità Per cliente non viene data ad altre aziende.
- `settings.colorUpdatedAt` (ISO) è aggiornato a ogni modifica di modalità, spettri, colori di categoria o regole: nel pacchetto di sincronizzazione (`settingsSubset`: `colorMode`, `catFamilies`, `colorRules`, `colorUpdatedAt`, oltre a `catColors`) il blocco colori più recente vince per intero (solo se l'utente spunta "Applica anche le impostazioni condivise"); famiglie sconosciute e regole non valide vengono scartate.

**Precedenza per un faldone non bloccato**: `color_locked` (mai toccato) → regola colore della categoria → sfumatura per cliente (modalità `company`) o colore della categoria (modalità `category`). In modalità `manual` nulla cambia in automatico.

**Colore della categoria** (`colorCategoryHex(cat)`): `catColors[cat]` → prima sfumatura della famiglia scelta → predefinito v9 → prima sfumatura della famiglia. Le sfumature disponibili (`colorShades(cat)`) sono il colore della categoria seguito dalla famiglia (un quasi-doppione di un colore personalizzato viene tolto).

**Modalità** `settings.colorMode`:
| Valore | Regola |
|---|---|
| `company` (predefinita) | stesso cliente + stessa categoria → stessa sfumatura (si riusa quella dei faldoni non bloccati del cliente); un cliente nuovo prende la prima sfumatura libera partendo da `FNV-1a(chiaveCliente) mod n` (sondaggio lineare); finita la famiglia, la meno usata. Chiave cliente = ragione sociale normalizzata (`companyKey`, come il controllo doppioni dell'editor), se vuota `multi:<codice Multi>`. |
| `category` | un colore per categoria = `colorCategoryHex` (comportamento v9) |
| `manual` | nessun colore automatico; i nuovi faldoni partono dal colore della categoria |

**Blocco** `binder.color_locked`: diventa `true` quando l'utente sceglie un colore nell'editor (pastiglia o selettore) o importa un colore non automatico; `Automatico` nell'editor lo toglie. I colori bloccati non cambiano con `applyAutoColor`, `recolorAll`, né cambiando cliente o categoria.

**Funzioni pubbliche**: `colorAssign(b, binders, opts)` → `#RRGGBB`; `applyAutoColor(b, binders)` → `true` se cambiato (rispetta blocco e modalità manuale, non salva); `recolorAll({onlyUnlocked:true, category, mode, silent})` → numero di faldoni ricolorati, con `undoPoint()` + voce `binder.recolor` nel registro attività + `undoToast`; `colorPlan(binders, opts)` → `Map(id → hex)` (parte pura, deterministica: clienti in ordine di chiave). Utili anche lato Python: l'algoritmo usa solo FNV-1a, liste fisse e confronti di stringhe, quindi è riproducibile.

**Migrazione**: nessun faldone viene ricolorato all'aggiornamento. Uno stato, un workspace JSON o un `.sqlite` senza `settings.colorMode` è "pre-v10": `colorLockLegacy()` blocca i faldoni il cui colore non è automatico (non è una sfumatura della famiglia, né il colore della categoria, né i vecchi predefiniti `#2563EB`/`#475569`). Per ricolorare c'è il pulsante **Impostazioni › Colori dei dorsi › Ricolora tutti i faldoni (non bloccati)** (o, per una categoria, la casella nel dialogo di Informazioni › Categorie).

## 13. Novità v10, v10.1 e v11 (pagine e PDF, database online, registro sincronizzazioni)

### v10.1 — database online (nessuna modifica di schema)

`APP_VERSION '26.10.1'`; schema stato `26.9` e `DB_SCHEMA_VERSION` **invariati**, stesse chiavi di memoria. Novità
solo additive:

| Dove | Campo | Significato |
|---|---|---|
| `S.sync.peers['server:<url>']` | `{mode:'server', seq, logSeq, lastPullAt, lastPushAt, lastLogPushAt, settingsAt, settingsHash, lastSyncAt, …}` | il server come dispositivo di sincronizzazione (`SYNC.md` §7) |
| `localStorage 'docmap_v26_srv'` | `{url, token, basic}` | solo PC `file://`: indirizzo e codice del server (come gli altri dati locali, in chiaro; mai nei backup) |
| `localStorage 'docmap_v26_vault_srv'` | blob cifrato | web + `apiBase`: token del server nella cassaforte del dispositivo |

Il database del server ha un suo schema (`API-CONTRACT.md` §6): i record sono gli stessi oggetti `binder` / `client`
di questo documento, cifrati uno per uno.

### v11 — Registro sincronizzazioni (stream J, nessuna modifica di schema locale)

Schema stato e `DB_SCHEMA_VERSION` del `.sqlite` **invariati**; stesse chiavi di memoria. Novità solo additive:

| Dove | Campo | Significato |
|---|---|---|
| `S.syncJournal` | array di voci, default `[]` (massimo 2 000 voci / 12 000 record) | registro sincronizzazioni locale, forma in `SYNC.md` §9. Uno stato v10.1 senza il campo lo riceve vuoto da `migrate()`; voci senza `id` vengono scartate |
| `S.sync.recvAt` | `{'<type>:<id>': [quando è arrivato qui, peer di provenienza, updated_at ricevuto]}` (massimo 20 000) | per inoltrare i record ricevuti con un'ora vecchia e non segnare falsi conflitti (`SYNC.md` §9); creato da `syncEnsure()` |
| workspace JSON / "Salva backup" | chiave facoltativa `sync_journal` (accanto ad `activity_log`) | il registro locale; al ripristino viene **unito** per `id` (mai sostituito). File senza la chiave = come prima |
| `localStorage 'docmap_v26_vault_journal'` | blob cifrato | `scan.html` web: "Le mie sincronizzazioni" (ultime 200) |
| `localStorage 'docmap_v26_device_label'` | stringa | `scan.html`: nome di questo telefono nel registro |

Il registro **non** è nel `.sqlite` (nessuna tabella nuova sul PC); per conservarlo: backup JSON o Esporta CSV/JSON.
Sul server: tabelle `sync_journal` e `sync_journal_items` (`API-CONTRACT.md` §6, §10), `meta.schema` = 2.

### v10 — Pagine e PDF (stream R)

| Dove | Campo | Significato |
|---|---|---|
| `S.print.pages` | `{sel:'all', reverse:false, order:null, sig:''}` | Quali fogli escono e in che ordine, per Stampa, Scarica PDF e anteprima. `sel`: `'all'` oppure numeri / intervalli dei fogli originali (`'2'`, `'1-3,5'`, `'4-'`; `'none'` = nessuno); è un insieme, l'ordine lo decidono `order` e `reverse`. `order`: permutazione dei fogli 1..n oppure `null` (naturale). `reverse`: dall'ultimo al primo. `sig`: impronta dei fogli quando la scelta è stata fatta; se la coda cambia i fogli, `sel` e `order` vengono ignorati e azzerati con un avviso (`reverse` resta). Creato quando serve, nessuna migrazione. |
| `S.print.pdfCmyk` | booleano, default `false` | "PDF per tipografia": Scarica PDF scrive colori DeviceCMYK, nero e grigi solo K (0/0/0/100). |

Foglio parziale: le caselle già usate (`S.usedSlots`) si saltano sempre sul **foglio originale 1**, anche se l'ordine lo sposta; il pannello indica in che posizione esce. Se l'ultimo foglio non è stampato, DocMap non propone di aggiornare la mappa del foglio parziale.

## 14. Ubicazioni (v11, stream X — `assets/js/02c-locations.js`, `06h-locations.js`)

L'archivio fisico è un **albero di luoghi**: Magazzino › Armadio › Scansia › Scaffale › Scatola (nomi e prefissi
configurabili, da 1 a 8 livelli). Il QR attaccato al contenitore (di solito la scatola, l'ultimo livello) è un
**QR ubicazione**. Il faldone indica la scatola in cui si trova con `binder.location_id`.

### 14.1 Ubicazione (`location`) — `S.locations[]`, tabella SQLite `locations`, record server di tipo `location`

| Campo | Tipo | Regole |
|---|---|---|
| `id` | testo (uuid) | mai cambiato |
| `parent_id` | testo | id del genitore; `''` = livello più alto (in SQLite `NULL`) |
| `level` | intero | profondità 0-based, **derivata** dalla catena dei genitori |
| `kind` | testo | nome del livello per questo nodo; `''` = nome configurato (v12: `archive.levels[level]` del suo archivio, altrimenti `settings.locLevels[level]`). "Configura archivio" lo scrive su ogni nodo creato |
| `name` | testo | nome libero (es. "Archivio seminterrato"); vuoto = mostrato come `<kind> <seg>` |
| `seg` | testo | segmento del codice (`MAG1`, `A2`, `B04`): maiuscolo, senza spazi né `-`, max 16, **unico tra fratelli** (un doppione diventa `B04.2`) |
| `code` | testo | codice percorso = segmenti uniti da `-` (`MAG1-A2-S3-R1-B04`); **derivato** dai `seg` (si modifica cambiando i segmenti); salvato per SQLite/CSV/Python, non è "contenuto" per la sincronizzazione |
| `short_code` | testo | `dm26L` + 8 caratteri dell'alfabeto dei faldoni, unico, mai riusato, stampato nel QR |
| `short_url` | testo | `https://qr7.it/<short_code>` (derivato) |
| `notes` | testo | note libere |
| `sort` | intero | ordine tra fratelli (0 = ordine naturale per `seg`) |
| `archive_id` | testo | **(v12)** archivio dell'albero (§15); `''` = Archivio principale. Si imposta sul nodo radice; per gli altri nodi è **derivato** (sempre quello della radice, `locIntegrity`) |
| `created_at`, `updated_at` | ISO | `updated_at` guida il last-write-wins come per i faldoni |

**Faldone o ubicazione?** Il codice dei faldoni è `dm26` + 8 (12 caratteri, `SC_RE`); quello delle ubicazioni
`dm26L` + 8 (13 caratteri, `LOC_SC_RE = /^dm26L[A-Za-z0-9]{8}$/`). Il generatore dei faldoni non produce mai codici di
13 caratteri, quindi righe del manifest, rotta `/q/<code>` e scansioni distinguono i due tipi **dal solo formato**
(`assocParseCode()`): nessuna chiamata a qr7.it.

### 14.2 Faldone

- `location_id` (nuovo, `''` = nessuna ubicazione). Quando è valorizzato e l'ubicazione è nota, `normalizeBinder`
  scrive in `location_code` il **codice percorso** dell'ubicazione (`binderLocCode()` in 02-core): ricerca, CSV,
  etichette e "Dov'è?" continuano a funzionare. Se l'ubicazione non è nota su quel dispositivo, `location_code`
  resta quello salvato.
- `room_code`, `cabinet_code`, `shelf_code`, `sector_code` **non vengono toccati**: togliendo l'ubicazione,
  `location_code` torna al testo calcolato da questi campi.
- `location_code` non è contenuto di sincronizzazione (rinominare una scatola non "modifica" i faldoni dentro).

### 14.3 Impostazioni

`settings.locLevels` = `[{name, prefix}]` (vuoto/assente = predefiniti nella lingua dell'interfaccia: Magazzino/MAG,
Armadio/A, Scansia/S, Scaffale/R, Scatola/B — EN Warehouse, Cabinet, Shelving unit, Shelf, Box), `settings.locLevelsAt`
(ISO, il più recente vince in sincronizzazione; viaggiano nel sottoinsieme impostazioni di pacchetti e server).

### 14.4 SQLite (`DB_SCHEMA_VERSION 7`, migrazione solo additiva)

```sql
ALTER TABLE binders ADD COLUMN location_id TEXT;                -- + INDEX ix_binders_location
CREATE TABLE IF NOT EXISTS locations(
  id TEXT PRIMARY KEY, parent_id TEXT, level INTEGER, kind TEXT, name TEXT, seg TEXT, code TEXT,
  short_code TEXT UNIQUE, short_url TEXT, notes TEXT, sort INTEGER, created_at TEXT, updated_at TEXT);
CREATE INDEX IF NOT EXISTS ix_locations_parent ON locations(parent_id);
```

Un database v6 (v10.1) si apre e riceve tabella e colonna; `dbReadWorkspace` di un file senza `locations` restituisce
`locations: undefined` e lo stato in memoria resta com'è.

### 14.5 Workspace JSON, pacchetti, server

- Workspace JSON: chiave `locations` (array). Ripristino completo → sostituisce l'albero; unione → per `id`, il più recente vince.
- Pacchetto `docmap-sync`: `records.locations` + `counts.locations`, tombstone `{type:'location', id, code, deletedAt}`.
- Server: record `{type:'location', id, updated_at, deleted, data:<ubicazione>}` cifrato come gli altri (`API-CONTRACT.md`).

### 14.6 Registro attività

| Azione | Dettagli |
|---|---|
| `location.create` / `location.bulk_create` / `location.edit` / `location.move` / `location.delete` / `location.levels` | codice, genitore, campi cambiati, conteggi |
| `binder.locate` | `{from:{id, code}, to:{id, code}, via, device, user}`; `via` = `scanner` · `camera` · `manual` · `editor` · `bulk` · `undo` (PC) oppure `phone` · `phone-camera` · `phone-typed` · `phone-nfc` (v12) · `undo` (telefono, `source: 'mobile'`); v12 sul PC anche `nfc` |
| `binder.locate_bulk` | più faldoni nella stessa ubicazione (`codes`, `to`, `via`) |

### 14.7 Memoria del telefono (scan.html)

`localStorage 'docmap_v26_assoc'` = modalità associazione attiva su quel dispositivo
`{v:1, user, box:{id, code, title, path, short_code}, startedAt, at, n, list:[…]}` (scade dopo 30 minuti senza
scansioni); `localStorage 'docmap_v26_scan_device'` = id del telefono per il registro (`phone-xxxxxxxx`).


## 15. Archivi (v12, stream C — `assets/js/02e-archives.js`, `06l-archives.js`, `11e-nfc.js`)

Uno studio può tenere **più archivi separati** (cluster): archivio corrente, storico, un ente/Comune, un secondo
magazzino. Ogni faldone e ogni albero di ubicazioni appartiene a **un** archivio. I dati precedenti alla v12 non
hanno nessun `archive_id` e stanno tutti nell'**Archivio principale**: niente da migrare, niente da timbrare.

### 15.1 Archivio (`archive`) — `S.archives[]`, tabella SQLite `archives`, record server di tipo `archive`

| Campo | Tipo | Regole |
|---|---|---|
| `id` | testo (uuid) | mai cambiato. L'**Archivio principale** ha l'id fisso `00000000-0000-4000-8000-0000000a0001` |
| `name` | testo | nome mostrato; `''` solo per l'archivio principale (= "Archivio principale" / "Main archive") |
| `code` | testo | codice breve `A-Z0-9`, max 8, unico tra gli archivi (`AP` per il principale); accettato dalla colonna CSV `archive_id` |
| `color` | `#RRGGBB` | colore dell'archivio (selettore, schede, pallini) |
| `description` | testo | facoltativa |
| `sort` | intero | ordine negli elenchi (il principale è sempre primo) |
| `levels` | `[{name, prefix}]` | livelli **di questo archivio** (1–8, dal più grande al più piccolo); `[]` = livelli dello studio `settings.locLevels` |
| `qr_levels` | `[intero]` | livelli 0-based che ricevono un'etichetta QR (davanti all'armadio, sulle scansie, sulle scatole); `[]` = solo l'ultimo livello |
| `created_at`, `updated_at` | ISO | `updated_at` guida il last-write-wins |

**Archivio principale virtuale.** Finché nessuno lo modifica, l'archivio principale **non** è un record
(`S.archives` resta `[]`, nessun pacchetto o server riceve nulla): `archList()` lo aggiunge in memoria con
`updated_at = 2000-01-01T00:00:00.000Z`. Diventa un record (stesso id fisso) alla prima modifica (nome, colore,
livelli QR). I suoi livelli restano **sempre** `settings.locLevels` + `settings.locLevelsAt` (v11), così un PC v11
continua a leggerli.

### 15.2 Faldone e ubicazione

- `binder.archive_id` (`''` = principale). **Archivio effettivo** (`binderArchiveId`): se il faldone è in
  un'ubicazione nota vince l'archivio di quell'albero; altrimenti `archive_id`. Mettere un faldone in una scatola
  aggiorna anche `archive_id`; spostarlo in un altro archivio lo toglie da una scatola dell'archivio vecchio.
- `location.archive_id`: impostato sulla radice, derivato sui figli. Gli alberi sono **per archivio**: il selettore
  mostra solo l'albero dell'archivio scelto. I `seg` delle radici restano unici **tra tutti** gli archivi (i codici
  percorso, e quindi `location_code`, non si confondono mai).
- Livelli per archivio: `locLevels()` senza argomenti restituisce i livelli dell'archivio "di contesto"
  (l'archivio del nodo, o quello scelto in alto); `locLevels(S.settings)` resta il comportamento v11.

### 15.3 Stato e preferenze

`S.archives` (array, dati) e `S.archiveSel` (preferenza del PC: `''` = "Tutti gli archivi", altrimenti l'id;
non viaggia in pacchetti né sul server).

### 15.4 SQLite (`DB_SCHEMA_VERSION 9`, migrazione solo additiva, basata sull'esistenza di tabelle e colonne)

```sql
CREATE TABLE IF NOT EXISTS archives(id TEXT PRIMARY KEY, name TEXT, code TEXT, color TEXT, description TEXT,
  sort INTEGER DEFAULT 0, levels_json TEXT, qr_levels_json TEXT, created_at TEXT, updated_at TEXT);
ALTER TABLE binders ADD COLUMN archive_id TEXT;     -- se manca · NULL = Archivio principale · INDEX ix_binders_archive
ALTER TABLE locations ADD COLUMN archive_id TEXT;   -- se manca · INDEX ix_locations_archive
```

`binders.archive_id` contiene l'archivio effettivo. La tabella `archives` contiene anche la riga dell'archivio
principale (virtuale o no): chi legge con Python trova sempre tutti gli archivi, con nome e codice.
`dbReadWorkspace` ignora la riga virtuale (`updated_at` = 2000-01-01).

### 15.5 Workspace JSON, pacchetti, server

- Workspace JSON: chiave `archives` (array; assente nei file vecchi = solo l'archivio principale). Ripristino completo
  → sostituisce; unione → per `id`, il più recente vince.
- Pacchetto `docmap-sync`: `records.archives` + `counts.archives`, tombstone `{type:'archive', id, code, deletedAt}`
  (unione o eliminazione di un archivio).
- Server: record `{type:'archive', …, data:<archivio>}` nella tabella generica `records` (nessuna migrazione del
  server; `ping` → `features` contiene `archives`). Un server v11 rifiuta i record `archive` come tipo sconosciuto
  (il resto della sincronizzazione continua): aggiornare `api.php` insieme all'app.

### 15.6 Registro attività

| Azione | Dettagli |
|---|---|
| `archive.create` / `archive.edit` / `archive.delete` | `{name, code, color}` / `{changed:{campo:[prima, dopo]}}` |
| `archive.merge` | `{from:{id, code, name}, to:{…}, binders, locations}` |
| `archive.setup` | "Configura archivio": `{archive, template, rows:[{level, name, prefix, n, qr}], count, qr_labels, codes}` |
| `binder.archive` | faldoni spostati di archivio: `{to:{id, code}, binders:[{id, code, from}], unplaced:[codici tolti dalla scatola]}` |
| `location.levels` | v12 anche per archivio: `{archive, levels, qr_levels}` |

### 15.7 Tag NFC e RFID

Un tag NFC contiene **lo stesso URL** del QR (`short_url`, record NDEF `url`): nessun id nuovo, `short_code` resta
l'unica identità di faldoni e ubicazioni. Lettura e scrittura in `11e-nfc.js` (Web NFC, Chrome Android); ogni tag
letto passa da `onTagScanned(testo, via)` con `via` = `qr` · `nfc` · `keyboard`. Progetto per varchi RFID:
[`RFID-NFC.md`](RFID-NFC.md).

## 16. Novità v12 (stream A: ricerca, accesso senza PIN, registro accessi)

Nessuna modifica dello schema locale (`DB_SCHEMA_VERSION` invariato) né delle colonne CSV. Server: schema 3,
tabella `access_log` (`API-CONTRACT.md` §6 e §11).

### 16.1 Impostazioni (`settings`, nel workspace JSON e nella riga SQLite `settings`)

| Chiave | Tipo | Default | Note |
|---|---|---|---|
| `savedSearches` | `[{id, name, q, facets:{gruppo:[chiavi]}, at}]` (max 50) | assente = `[]` | ricerche salvate (Archivio › ☆ Salva ricerca); viaggiano nelle impostazioni condivise (`settingsSubset` del pacchetto e del server) |
| `savedSearchesAt` | ISO | assente | ultima modifica della lista: vince la più recente, tutta intera |
| `srchNotes` | booleano | assente = `true` | `false` = le parole libere non cercano in note e contatti |

### 16.2 Ricerca (`assets/js/04c-search.js`)

Operatori (alias IT/EN, maiuscole e accenti indifferenti): `tag:` · `anno:` (`2024`, `2020..2022`, `>2023`, `<2020`, `24`) ·
`cat:` · `luogo:` · `stato:` (`corrente`, `storico`, `fuori`, `cliente`, … più gli stati dello stream Q tramite
`statusSearchHook`) · `cliente:` · `citta:` · `multi:` · `codice:` · `colore:` (nome o `#hex`) · `archivio:` (stream C,
`archiveSearchHook`) · `note:` · `contenuto:`; `-parola` / `-tag:x` esclude; `"frase esatta"`. Una chiave sconosciuta
vale come testo. Un codice breve, un URL `qr7.it/…` o `…/q/…` porta a quel faldone (o ai faldoni di quell'ubicazione).
Parole con un errore di battitura (distanza di Damerau-Levenshtein 1–2 secondo la lunghezza) → «Forse cercavi».
Facce (filtri): `tag`, `cat`, `year`, `loc`, `color`, `state`, `status`, `archive` — OR dentro un gruppo, AND tra gruppi.

Ganci per gli altri moduli (facoltativi, cercati a ogni ricerca):
`window.statusSearchHook = {match(b, v) → true|false|null, statusOf(b) → {id, label}|null, words(b) → stringa}` e
`window.archiveSearchHook = {match(b, v), archiveOf(b) → {id, label}|null, words(b)}`.

### 16.3 Memoria del browser

| Chiave | Contenuto | Dove |
|---|---|---|
| `localStorage 'docmap_v26_srch_recent'` | ultime 8 ricerche (solo `file://`; in modalità web restano in memoria) | PC |
| `localStorage 'docmap_v26_srch_panel'` | pannello Filtri aperto | PC |
| IndexedDB `docmap_v26_srch` › `kv` › `cache` | copia dei faldoni per la ricerca sul telefono, **cifrata** con la DEK della cassaforte (AAD `srch-cache`) | telefono (web + server) |
| `localStorage 'docmap_v26_remember'` | accesso ricordato `{v, rid, user_id, created_at, last_at, pwfp, wrapped, mac}` | web (`SICUREZZA.md` §5d) |
| IndexedDB `docmap_v26_keys` › `keys` › `remember:<rid>` | `{kw, mk}` chiavi non estraibili | web |
| `localStorage 'docmap_v26_remember_policy'` | minuti di inattività dal server (`me.remember_minutes`) | web |
| `localStorage 'docmap_v26_view_seen'` | `{"<id faldone>|<operatore>": ms}`: limita `view.binder` a una voce ogni 10 minuti | PC |
| `localStorage 'docmap_v26_seen_queue'` | visite da mandare con `POST seen` (max 500) `[{type, id, code, at, via}]` | PC e telefono con server |

Politica del dispositivo (⚙ Utenti e accesso › Accesso senza PIN): `policy.rememberMinutes` (0, 480, 43200, -1;
predefinito 43200) nell'archivio utenti locale `localStorage 'docmap_v26_auth'`; `remember_minutes` del server vince.

### 16.4 Registro attività

| Azione | Dettagli |
|---|---|
| `view.binder` (gruppo `view`, «Visite») | `{via, device}`; `via` = `nav` (scheda aperta dall'elenco) · `search` (aperta da una ricerca); al massimo una voce per faldone per operatore ogni 10 minuti |

## 17. Stati: preso, reinserito, dato al Comune… (v12, stream Q — `assets/js/02d-status.js`, `06j-status.js`, `11c-status.js`)

Uno **stato** dice dov'è adesso un faldone, un singolo documento o una scatola (location): chi ce l'ha, da quando,
quando deve tornare. Gli stati sono **eventi** che si aggiungono e non si modificano mai: lo stato attuale di un oggetto è
il suo ultimo evento. Sono un livello in più: non cambiano `archive_state` del faldone né `contents_items[].status`.

### 17.1 Tipi di stato — `S.settings.statusTypes` (impostazioni condivise)

Assente o vuoto = i 10 predefiniti (`SQ_DEFAULT_TYPES`). Ogni tipo:

| Campo | Valori | Significato |
|---|---|---|
| `id` | slug stabile (`taken`, `returned`, … o `c-…` per quelli aggiunti) | mai riusato; un tipo con eventi non si elimina, si disattiva |
| `label` | testo | `''` per un tipo predefinito (nome tradotto IT/EN da `sqt_<id>`) |
| `color`, `icon` | `#RRGGBB`, una chiave di `SQ_ICONS` | |
| `presence` | `in` · `out` · `missing` · `neutral` | in archivio · fuori (qualcuno ce l'ha) · mancante · solo un'annotazione |
| `needs_holder` | `''` · `me` · `client` · `entity` | chi ce l'ha: non chiesto · chi registra (modificabile) · il cliente del faldone · testo obbligatorio (Comune, ente) |
| `needs_due_date`, `needs_note`, `needs_date` | `''` · `optional` · `required` | rientro previsto · nota · data effettiva ("restituito il…") |
| `returns_to` | id di un tipo `in` | il tipo proposto per primo per chiudere questo (es. `to_client` → `from_client`) |
| `quick` | bool | pulsante grande a un tocco |
| `applies_to` | `binder` · `document` · `box` | dove si può usare |
| `disabled` | bool | nascosto nelle scelte, lo storico resta |

Predefiniti: `taken` Preso (out, chi registra) · `returned` Reinserito (in) · `to_client` Dato al cliente (out, cliente,
rientro e nota facoltativi) · `from_client` Restituito dal cliente (in) · `case` Fuori per pratica (out) · `to_entity`
Dato al Comune / ente (out, ente obbligatorio, rientro e nota) · `from_entity` Restituito dal Comune / ente (in, data) ·
`missing` Mancante / non trovato · `found` Ritrovato (in) · `check` Da verificare (neutral).
`S.settings.statusTypesAt` (ISO) = ultima modifica: nei pacchetti e sul server vince la lista più recente
(`settingsSubset.statusTypes` / `statusTypesAt`, come `locLevels`).

### 17.2 Evento — `S.statusEvents[]`, tabella `status_events`, record server `status_event`

`{id:'se-<uuid>', at, user, device, target_type:'binder'|'document'|'location', target_id, doc_id, status_id, holder,
due_date:'AAAA-MM-GG'|'', date:'AAAA-MM-GG'|'', note, via, box_id, batch_id, code, doc_text, undo_of}`
(schema: `docs/python/schema/status_event.schema.json`).

- `target_id` = id del faldone (anche per un documento, con `doc_id` = `contents_items[].id`) o della scatola.
- `via`: `scan` (telefono) · `desktop` · `box` (tutta la scatola) · `bulk` (faldoni spuntati) · `verify` (verifica
  rientro) · `scanner` (lettore USB, "Modalità stato") · `editor` (scheda del faldone) · `undo`.
- `batch_id`: uguale per tutti gli eventi di una stessa azione su più oggetti. `code` / `doc_text`: codice e testo del
  documento in quel momento, per i report anche se poi cambiano.
- **Annulla** (10 s) = nuovo evento con `status_id:''` e `undo_of:<id>`: l'evento annullato resta nello storico, barrato.
- **Stato attuale** = ultimo evento del bersaglio (per `at`, poi `id`) che non è un annullamento né annullato
  (`sqCurrent`). **In ritardo** = presenza `out` e `due_date` < oggi. Nessun evento = in archivio.
- Solo locale: `_rx = [ora locale, peer]` su un evento ricevuto da un altro dispositivo (serve a inoltrarlo, come `recvAt`).

### 17.3 Viaggio dei dati

- **Backup JSON**: chiave `status_events` (solo se ci sono eventi), unita per `id` al ripristino (mai sostituita).
- **Pacchetti** (06f): `records.status_events` = eventi registrati o ricevuti da un altro peer dopo `since`; si
  aggiungono per `id`, senza LWW e senza duplicati.
- **Server**: record `status_event` (API-CONTRACT §11). Un server senza `"status_events"` nel `ping` non riceve record:
  gli eventi viaggiano comunque nelle voci di registro (`details.events`).
- **Telefono in locale** (stesso browser del PC): scrive `statusEvents` nello stato salvato e una voce di registro in
  `docmap_v26_log_pending`; il PC aperto la unisce subito (senza l'avviso "modificato in un'altra scheda").

### 17.4 SQLite (`DB_SCHEMA_VERSION 9`, migrazione solo additiva, basata sull'esistenza di tabella e colonne)

```sql
ALTER TABLE contents_items ADD COLUMN item_id TEXT;          -- se manca
CREATE TABLE IF NOT EXISTS status_events(id TEXT PRIMARY KEY, at TEXT, user TEXT, device TEXT, target_type TEXT, target_id TEXT,
  doc_id TEXT, status_id TEXT, holder TEXT, due_date TEXT, date TEXT, note TEXT, via TEXT, box_id TEXT, batch_id TEXT, code TEXT,
  doc_text TEXT, undo_of TEXT);
CREATE INDEX IF NOT EXISTS ix_status_target ON status_events(target_type, target_id);
```

Un file `.sqlite` aperto o importato **aggiunge** i suoi eventi a quelli presenti (unione per `id`).

### 17.5 Registro attività

| Azione | Dettagli |
|---|---|
| `status.set` · `status.bulk` · `status.box` | `{status, holder, due_date, note, count, batch_id, via, events:[StatusEvent]}` |
| `status.verify` | `{box:{id, code}, found:[{id, code}], missing:[…], unexpected:[…], batch_id, marked_missing, events}` (report della verifica rientro, scaricabile in CSV) |
| `status.undo` | `{count, events}` |
| `settings.status_types` | `{types:[id]}` |

Il CSV "Esporta tutti i movimenti" ha una riga per evento (`quando;chi;oggetto;codice;documento;stato;presenza;chi_lo_ha;
rientro_entro;in_data;nota;come;scatola;operazione;event_id;undo_of`); "Esporta fuori archivio" una riga per oggetto
fuori. Le colonne del CSV dei faldoni (§6.1) **non cambiano**.

### 17.6 Memoria del telefono (scan.html)

`localStorage 'docmap_v26_scan_status_outbox'` = stati registrati senza rete (modalità server), inviati in ordine al
ritorno della connessione `[{id, events, entry, at}]`; `localStorage 'docmap_v26_status_verify'` = verifica rientro in
corso `{v:1, user, box:{id, code, short_code}, startedAt, at, expected:[{id, code, company, short_code}], found:[id],
extra:[{id, code}]}` (scade dopo 4 ore senza scansioni).

