# Schemi JSON dei dati DocMap (per il team Python)

> Base: DocMap **26.11.1** (stato `schema: '26.9'`, SQLite locale `DB_SCHEMA_VERSION 8`, server `DM_SCHEMA 2`).
> Gli schemi sono **JSON Schema 2020-12** in [`schema/`](schema/), si richiamano tra loro con `$ref` relativi al nome del
> file (`"binder.schema.json"`), non hanno `$id` e ammettono campi in più (`additionalProperties: true`), perché un
> lettore vecchio deve ignorare i campi nuovi (regola di `docs/AGGIORNAMENTI.md`).
>
> Sono controllati sui file **veri** prodotti dall'app da [`tools/validate_schemas.py`](tools/validate_schemas.py)
> (vedi in fondo). Spiegazione campo per campo: [`../MODELLO-DATI.md`](../MODELLO-DATI.md). API: [`openapi.yaml`](openapi.yaml).

## 1. I file

| Schema | Cosa descrive | Chi lo scrive nel codice | Dove si trova |
|---|---|---|---|
| [`binder.schema.json`](schema/binder.schema.json) | un faldone (29 campi) | `normalizeBinder()` in `assets/js/02-core.js` | `S.binders`, tabella `binders`, `records.binders` del pacchetto, `data` dei record `binder` del server |
| [`client.schema.json`](schema/client.schema.json) | un cliente dell'anagrafica | `normalizeClient()` in `assets/js/02-core.js` (import: `06c-clients.js`) | `S.clients`, tabella `clients`, record `client` |
| [`location.schema.json`](schema/location.schema.json) | un'ubicazione (nodo dell'albero: magazzino › … › scatola) | `normalizeLocation()` in `assets/js/02c-locations.js` | `S.locations`, tabella `locations`, record `location` |
| [`status_event.schema.json`](schema/status_event.schema.json) | v12: un movimento di stato (preso, reinserito, dato al Comune…) di un faldone, di un documento o di una scatola | `sqNormEvent()` in `assets/js/02d-status.js` | `S.statusEvents`, tabella `status_events`, record `status_event`, `status_events` di backup e pacchetti |
| [`activity_log_entry.schema.json`](schema/activity_log_entry.schema.json) | una riga del Registro attività | `logAct()` / normalizzatore in `assets/js/06e-log.js` | tabella `activity_log`, `activity_log` del backup e del pacchetto, `pull` |
| [`sync_journal_entry.schema.json`](schema/sync_journal_entry.schema.json) | una voce del Registro sincronizzazioni **del dispositivo** | `jrNewEntry()` / `jrAdd()` in `assets/js/06i-journal.js` | `S.syncJournal`, chiave `sync_journal` del backup |
| [`workspace_backup.schema.json`](schema/workspace_backup.schema.json) | il backup completo (`Salva backup`, `docmap_workspace.json`) | `workspaceJSON(true)` in `assets/js/04-ui.js` (+ `sync_journal` da 06i) | file `docmap_workspace_AAAAMMGG_HHMM.json` |
| [`sync_package.schema.json`](schema/sync_package.schema.json) | il pacchetto di sincronizzazione, in chiaro o cifrato | `syncBuildPackage()` / `syncEncrypt()` in `assets/js/06f-sync.js` | file `docmap-sync-<dispositivo>-<AAAAMMGG-hhmmss>.json` |

La voce del registro sincronizzazioni **del server** ha un'altra forma (`JournalEntry` in `openapi.yaml`).

## 2. Regole comuni

- **Id**: stringhe stabili (UUID v4 per faldoni, clienti, ubicazioni; `jr-<uuid>` per le voci del registro locale).
  Mai rigenerarli: il last-write-wins e le tombstone si basano sull'id.
- **Date**: ISO 8601 UTC con millisecondi (`new Date().toISOString()`), confrontate come istanti. `updated_at` cresce
  sempre su ogni modifica (`syNext` in 06f: mai uguale o minore della precedente).
- **Testo vuoto, non null**: i normalizzatori mettono `''` dove manca un valore. Il server tratta `null` come `''` nel
  JSON canonico (PORTING.md §5).
- **Record di versioni precedenti**: i file v10.1 non hanno `location_id`, `locations`, `sync_journal`; i v9 non hanno
  `color_locked`. Il client li completa con `normalizeBinder()` all'apertura. Gli schemi descrivono ciò che scrive la
  **v11.1**: per validare un file vecchio, normalizzalo prima (o rendi facoltativi i campi aggiunti dopo).
- **Codici QR**: faldone `short_code` = `dm26` + 8 caratteri alfanumerici, ubicazione = `dm26L` + 8; `short_url` =
  `https://qr7.it/<short_code>`. Il tipo si riconosce dal solo formato (rotta `resolve`).
- **Campi derivati, esclusi dal confronto**: `short_url`, `location_code` (percorso dell'ubicazione), `selected_for_print`
  per i faldoni; `updated_at` sempre. Per le ubicazioni il client esclude anche `code` e `level` (derivati dall'albero),
  il server no (vedi "Differenze note" in fondo).

## 3. Note per ogni schema

### binder
- `contents_items`: lista di `{year, description, status}` con `status` in `archive` (in archivio) · `client` (al
  cliente) · `in_use` (in uso). Il loro `id` interno non è stabile: identificali per `(binder_id, posizione)`.
- `room_code`, `cabinet_code`, `shelf_code`, `sector_code`: posizione "a mano" (stanza, armadio, ripiano, settore),
  indipendente da `location_id`. `location_id` = id di un'ubicazione (di solito una scatola) o `''`; `location_code` è
  il suo percorso, ricalcolato da chi scrive.
- `color_hex` `#RRGGBB`; `color_locked: true` = colore scelto a mano, i ricolori automatici non lo toccano.
- `selected_for_print`: preferenza del dispositivo (coda di stampa), viaggia ma non conta nei conflitti.

### client
- `multi_code` = Codice Multi (id del gestionale dello studio, facoltativo ma unico se presente).
- Campi opzionali `color_hex`, `tags`, `updated_at` (assenti nei clienti creati prima della v10).

### location
- `parent_id` `''` per la radice; `level` 0-based (0 = primo livello, es. Magazzino); `kind` = nome del livello al
  momento della creazione; `seg` = segmento unico tra fratelli (senza spazi né `-`, max 16); `code` = segmenti uniti da
  `-` (`MAG1-A1-S1-R1-B01`), derivato; `sort` per l'ordine manuale.
- Livelli predefiniti (`settings.locLevels`): Magazzino/MAG, Armadio/A, Scansia/S, Scaffale/R, Scatola/B (1–8 livelli).

### activity_log_entry
- `action` del tipo `oggetto.verbo` (`binder.create`, `binder.locate`, `import.clients`, `sync.restore`…); `source` in
  `ui import ai restore mobile sync`; `target` `{type, id, code}` o `null`.
- `details` è un oggetto libero; un oggetto **vuoto** torna dal server PHP come `[]` (in PHP `{}` e `[]` coincidono):
  lo schema accetta entrambi, e un server Python può restituire `{}`.

### sync_journal_entry (registro locale)
- `kind` `server · package · phone · restore`, `dir` `sync · import · export · patch · restore`.
- `items[].action`: ricevuti (`dir: in`) `create · update · delete · tombstone · conflict · rejected-older · restore`;
  inviati (`dir: out`) `sent · sent-delete` (le modifiche dal telefono usano `update`).
- `items[].hash` = SHA-256 del JSON canonico (= `new_hash` del server). `fields` = `[[campo, valore qui, altro valore]]`.
- Limiti: 2000 voci, 300 elementi per voce, 12 000 elementi in tutto (i più vecchi perdono gli elementi: `items_pruned`).

### workspace_backup
- Chiavi: `app` (`DocMap26`), `format` (`docmap_workspace`), `version` (APP_VERSION), `exported_at`, `settings`, `lang`,
  `print`, `customPresets`, `usedSlots`, `binders`, `clients`, `locations`, `activity_log` (solo nei backup),
  `sync_journal` (solo se non vuoto). **Niente foto**: restano nel `.sqlite`.
- `usedSlots` = `{presetId: [indici 0-based delle etichette già usate]}` (fogli parziali).

### sync_package
- In chiaro: `format: docmap-sync`, `version: 1`, `source {deviceId, deviceLabel, mode, operator}`, `since` (`null` =
  pacchetto completo), `target`, `ack`, `records {binders, clients, locations}`, `tombstones`, `settingsSubset`,
  `activity_log`, `counts`. Tombstone `{type, id, code, deletedAt, who}`, tenute 365 giorni, al massimo 5000.
- Cifrato: `{format: docmap-sync-enc, v: 1, kdf {name: PBKDF2, hash: SHA-256, iterations: 310000, salt}, cipher: AES-256-GCM, iv, ct}`;
  chiave = PBKDF2-SHA256(passphrase NFC in UTF-8, salt, iterations) a 256 bit; AAD `docmap-sync-enc/1`; `ct` = testo
  cifrato + tag di 16 byte, base64. Esempio Python in `tools/validate_schemas.py` (`decrypt_package`).

## 4. Usarli in Python

```python
import json
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

SCHEMA_DIR = Path("docmapv1/docs/python/schema").resolve()
registry = Registry().with_resources(
    (f.as_uri(), Resource(contents=json.loads(f.read_text()), specification=DRAFT202012))
    for f in SCHEMA_DIR.glob("*.schema.json"))
v = Draft202012Validator({"$ref": (SCHEMA_DIR / "workspace_backup.schema.json").as_uri()}, registry=registry)
errors = list(v.iter_errors(json.loads(Path("docmap_workspace.json").read_text())))
```

Per generare modelli (Pydantic) puoi usare `datamodel-code-generator --input schema/ --input-file-type jsonschema`;
tieni però i nomi dei campi identici a quelli del JSON (nessun alias "pythonico" nel formato di scambio).

## 5. Il validatore

```
pip install jsonschema referencing pyyaml cryptography          # Python 3.9+
cd docmapv1/tests && npm i playwright && npx playwright install chromium   # se non c'è già (serve anche alla suite)
NODE_PATH=docmapv1/tests/node_modules python3 docmapv1/docs/python/tools/validate_schemas.py
```

1. Controlla che gli 8 schemi e `openapi.yaml` siano validi e che ogni `$ref` si risolva.
2. Lancia [`tools/export_samples.js`](tools/export_samples.js): apre `index.html` in Chromium headless, crea con le
   funzioni dell'app un piccolo archivio inventato (albero di 6 ubicazioni, un cliente, un faldone in una scatola,
   un'eliminazione, un export e un import di pacchetto da un finto secondo PC) e salva `workspace_backup.json`,
   `sync_package.json`, `sync_package_enc.json`, `records.json`. Li valida, decifra in Python il pacchetto cifrato e
   controlla che l'app non scriva campi che gli schemi non descrivono.
3. Confronta le rotte di `api.php` con quelle di `openapi.yaml` (stessi nomi, stesso ruolo minimo, POST solo per le scritture).
4. Se c'è `php`: avvia `api.php` con una config generata, chiama ogni rotta e i casi di errore (400, 401, 403, 404, 405,
   409, 422, 429), valida ogni risposta su `openapi.yaml` e poi apre il `docmap.sqlite` del server per ricalcolare in
   Python blob, AAD, indici HMAC, `key_check`, hash canonici e hash delle tombstone (PORTING.md §3–§5).

Opzioni: `--samples DIR` (tiene i file generati), `--no-browser` (valida i file già in `DIR`), `--no-php`.
Ultimo risultato su 26.11.1: **261 controlli, tutti OK**.

## 6. Differenze note tra client e server (non sono errori di schema)

- **Confronto delle ubicazioni.** Il client esclude dal confronto `updated_at`, `short_url`, `code`, `level`
  (`SYNC_L_SKIP` in 06f); il server usa per tutti i tipi `DM_CANON_SKIP` (`updated_at`, `short_url`, `location_code`,
  `selected_for_print`). Effetto: due copie con la stessa ora che differiscono solo per `code`/`level` sono "uguali" per
  il client ma un `tie` per il server (il push viene rifiutato e il client riceve la copia del server al pull successivo).
  Non perde dati; da tenere identico nel Python per non cambiare gli hash.
- **`{}` contro `[]`** negli oggetti vuoti che passano dal PHP (vedi activity_log_entry).
