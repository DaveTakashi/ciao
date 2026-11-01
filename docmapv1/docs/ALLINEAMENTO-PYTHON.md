# Allineamento del sistema Python a DocMap

Guida breve per il team Python dello studio, aggiornata alla **v11.1** (`APP_VERSION 26.11.1`, `DB_SCHEMA_VERSION 7`, stato 26.9). Nata con la v8: le note "(v8)" indicano da quando esiste una regola. I JSON Schema dei record sono in [`python/SCHEMI.md`](python/SCHEMI.md); per il server vedi [`python/PORTING.md`](python/PORTING.md). **Regola generale: il modello dati e la UX dell'MVP DocMap sono il riferimento.** Il sistema Python legge e scrive gli stessi campi, con gli stessi nomi e le stesse regole (`MODELLO-DATI.md`). Quando servirà un collegamento in tempo reale si userà l'hub descritto in `HUB-E-API.md` (non ancora implementato).

## 1. Cosa esporta l'MVP

| File | Come ottenerlo in DocMap | Contenuto | Consigliato per |
|---|---|---|---|
| `docmap_AAAAMMGG_HHMM.sqlite` | ⚙ Funzioni avanzate › Database → Scarica | tutto: faldoni, contenuti, clienti, impostazioni, preset, **foto**, sessioni, audit | **sincronizzazione completa** (il più fedele) |
| `docmap_workspace.json` | ⚙ Funzioni avanzate › Esporta e Salva → Sessione completa JSON (o Backup rapido) | faldoni, clienti, impostazioni, stampa, preset, fogli parziali (no foto) | scambio programmatico semplice |
| `docmap_full_backup.csv` | ⚙ Funzioni avanzate › Esporta e Salva → Database completo CSV | faldoni, 29 colonne `;`, BOM UTF-8 | Excel, controlli manuali |
| `docmap_clienti.csv` | Informazioni › Clienti → Esporta | anagrafica | confronto con il gestionale |
| `manifest_qr7_dm26.csv` | ⚙ Funzioni avanzate › Esporta e Salva → Manifest | `short_code;short_url;final_destination;tags;` (ogni riga termina con `;`, v11) | server di redirect qr7.it |

In ingresso DocMap accetta gli stessi formati: CSV (29 colonne dalla v11, 28 v10, 27 v8–v9, 25 v7, oppure 22/20 del modello AI; letto per intestazione, anche in italiano; colonne con altri nomi si abbinano a mano), Excel `.xlsx`, workspace JSON, `.sqlite` (anche v1–v3), e l'anagrafica clienti con intestazione `TIPO;Ditta;Ragione_soc;Indirizzo;Codice_com;Cap;Localita;Provincia;ETS_ENC`.

## 2. Leggere gli export in Python

Solo libreria standard.

### 2.1 SQLite

```python
import sqlite3

def read_docmap_sqlite(path):
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    schema = con.execute("SELECT value FROM meta WHERE key = 'schema_version'").fetchone()[0]
    binders = {r["id"]: dict(r) for r in con.execute("SELECT * FROM binders ORDER BY speaking_code")}
    for b in binders.values():
        b["contents_items"] = []
        b["selected_for_print"] = bool(b["selected_for_print"])
        b["contacts"] = b.get("contacts") or ""; b["notes"] = b.get("notes") or ""   # colonne v8: assenti nei file v1-v3
    has_status = any(c[1] == "status" for c in con.execute("PRAGMA table_info(contents_items)"))   # assente nei file v1-v3
    for r in con.execute("SELECT * FROM contents_items ORDER BY binder_id, position"):
        binders[r["binder_id"]]["contents_items"].append({"year": r["year"] or "", "description": r["description"] or "",
                                                          "status": (r["status"] if has_status else None) or "archive"})
    clients = [dict(r) for r in con.execute("SELECT * FROM clients ORDER BY name")]
    con.close()
    return schema, list(binders.values()), clients

schema, binders, clients = read_docmap_sqlite("docmap_20261101_1000.sqlite")
print(schema, len(binders), "faldoni,", len(clients), "clienti")
```

Note: `binders.final_destination` è l'URL **risolto**, `final_destination_custom` quello personalizzato (vuoto = modello dello studio). Le foto sono in `photos.data` (JPEG):

```python
import pathlib
pathlib.Path("foto").mkdir(exist_ok=True)
con = sqlite3.connect("docmap_20261101_1000.sqlite")
for pid, owner_type, owner_key, data in con.execute("SELECT id, owner_type, owner_key, data FROM photos"):
    pathlib.Path(f"foto/{owner_type}_{owner_key}_{pid}.jpg").write_bytes(data)
```

### 2.2 Workspace JSON

```python
import json

with open("docmap_workspace.json", encoding="utf-8") as f:
    ws = json.load(f)
assert ws.get("format") == "docmap_workspace", "non è un workspace DocMap"
print("versione app", ws["version"])
for b in ws["binders"]:
    items = "|".join((i["year"] + ": " if i["year"] else "") + i["description"] for i in b["contents_items"])
    away = [i["description"] for i in b["contents_items"] if i.get("status", "archive") != "archive"]   # v8
    print(b["speaking_code"], b["multi_code"], b["company_name"], b["location_code"], items, b.get("contacts", ""), away)
```

### 2.3 CSV di backup

```python
import csv

def unguard(v):          # DocMap antepone ' alle celle che iniziano con = + - @ (protezione formule Excel)
    return v[1:] if len(v) > 1 and v[0] == "'" and v[1] in "=+-@\t\r" else v

with open("docmap_full_backup.csv", encoding="utf-8-sig", newline="") as f:
    rows = [{k: unguard(v) for k, v in r.items()} for r in csv.DictReader(f, delimiter=";")]

import re
STATUS_RE = re.compile(r"\s*\[\s*(in archivio|archivio|archive|in uso|in use|in_use|prelevato|cliente|al cliente|dato al cliente|client)\s*\]\s*$", re.I)

def norm_status(v):
    s = re.sub(r"[\s\-]+", "_", (v or "").strip().lower())
    if s in ("archive", "in_use", "client"): return s
    if re.fullmatch(r"(al_|dato_al_)?client[ei]?", s): return "client"
    if s in ("in_uso", "in_use", "uso", "prelevato", "fuori", "out", "checked_out"): return "in_use"
    return "archive"

def parse_contents(text):
    out = []
    for part in filter(None, (p.strip() for p in re.split(r"\||\n", text or ""))):
        status = "archive"
        sm = STATUS_RE.search(part)
        if sm:
            status, part = norm_status(sm[1]), part[:sm.start()].strip()
        m = re.match(r"^(\d{4}(?:\s*[-/]\s*\d{2,4})?)\s*[:\-–—]\s*(.+)$", part)
        item = {"year": re.sub(r"\s+", "", m[1]), "description": m[2].strip()} if m else {"year": "", "description": part}
        item["status"] = status
        out.append(item)
    return out

for r in rows:
    r["contents_items"] = parse_contents(r.pop("contents"))
    r["selected_for_print"] = r["selected_for_print"] == "1"
```

### 2.4 Scrivere un CSV che DocMap reimporta

```python
import csv

COLUMNS = ["speaking_code","multi_code","company_name","company_city","category","binder_title","ref_year",
           "room_code","cabinet_code","shelf_code","sector_code","location_code","archive_state","contents","tags",
           "color_hex","short_code","short_url","final_destination","extra_codes","shelf_color","contacts","notes",
           "selected_for_print","id","created_at","updated_at","color_locked","location_id"]   # v10: color_locked · v11: location_id

SUFFIX = {"in_use": " [in uso]", "client": " [cliente]"}
def item_text(i):
    return (i["year"] + ": " if i["year"] else "") + i["description"] + SUFFIX.get(i.get("status", "archive"), "")

def guard(v):
    v = "" if v is None else str(v)
    return "'" + v if v[:1] in ("=", "+", "-", "@", "\t", "\r") else v

with open("da_python.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f, delimiter=";", lineterminator="\r\n")
    w.writerow(COLUMNS)
    for b in binders:
        row = dict(b, contents="|".join(item_text(i) for i in b["contents_items"]),
                   selected_for_print="1" if b["selected_for_print"] else "0",
                   color_locked="1" if b.get("color_locked") else "0")
        w.writerow([guard(row.get(c, "")) for c in COLUMNS])
```

Import in DocMap con **Merge**: le righe con un `speaking_code` esistente aggiornano quel faldone, le altre vengono aggiunte. Le colonne vuote non cancellano i valori esistenti. Lasciare vuoti `short_code`, `short_url` e `final_destination` per i faldoni nuovi: DocMap li genera.

## 3. Tabella di mappatura (da compilare)

Compilate la colonna "Sistema Python" con i nomi della vostra base dati. Le prime tre colonne sono fisse.

| Campo DocMap | Tipo / regola | Obblig. | Sistema Python (tabella.colonna) | Note / trasformazione |
|---|---|---|---|---|
| `id` | UUID, stabile | sì | | |
| `speaking_code` | maiuscolo, unico | sì | | |
| `multi_code` | testo esatto, mai inventato | no | | = `Ditta` del gestionale? |
| `company_name` | testo | sì | | |
| `company_city` | `Città (PR)` | no | | |
| `category` | testo (elenco suggerito) | no | | |
| `binder_title` | testo | no | | |
| `ref_year` | `2025` / `2020-2024` | no | | |
| `extra_codes` | testo, virgole | no | | |
| `room_code` / `cabinet_code` / `shelf_code` / `sector_code` | testo | no | | |
| `location_code` | derivato | — | | non salvare: ricalcolare |
| `shelf_color`, `color_hex` | `#RRGGBB` | no | | |
| `archive_state` | `CURRENT` / `HISTORICAL` / `CHECKED_OUT` | sì | | |
| `contents_items[].year`, `.description` | testo, ordinati | no | | chiave `(binder_id, position)` |
| `contents_items[].status` | `archive` (default) / `in_use` / `client`; CSV: suffisso `[in uso]` / `[cliente]` in `contents` (nessun suffisso = `archive`); JSON: chiave `status`; SQLite: `contents_items.status TEXT DEFAULT 'archive'` | no | | indipendente da `archive_state` del faldone |
| `contacts` | testo, nomi separati da virgola; CSV: colonna `contacts` (dopo `shelf_color`); JSON: `binders[].contacts`; SQLite: `binders.contacts TEXT` | no | | non una lista strutturata; mai inventare nomi |
| `notes` | testo libero breve; CSV: colonna `notes` (dopo `contacts`); JSON: `binders[].notes`; SQLite: `binders.notes TEXT` | no | | evitare `;` e a capo se si scrive il CSV a mano |
| `tags` | testo, virgole | no | | escludere `demo` |
| `short_code` | `dm26` + 8, unico, mai riusato | sì | | |
| `final_destination` | URL o vuoto | no | | vuoto = modello |
| `selected_for_print` | booleano | sì | | probabilmente non serve al gestionale |
| `created_at`, `updated_at` | ISO 8601 UTC | sì | | |
| `client.multi_code` … `client.notes` | vedi `MODELLO-DATI.md` §3 | | | |

## 4. Regole di andata e ritorno

1. **Gli `id` sono stabili.** Non generarne di nuovi per faldoni che esistono già; per i nuovi usare UUID v4 (`uuid.uuid4()`).
2. **`speaking_code` unico** (senza distinzione maiuscole), maiuscolo, senza spazi. È la chiave di upsert dell'import CSV: due righe con lo stesso codice = stesso faldone.
3. **`short_code` mai riusato.** È stampato su un'etichetta fisica. Non riassegnare il codice di un faldone eliminato; tenere un registro dei codici emessi. Per generarne uno compatibile:
   ```python
   import secrets
   ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"   # senza I O l o 0 1
   def new_short_code(taken):
       while True:
           c = "dm26" + "".join(secrets.choice(ALPHABET) for _ in range(8))
           if c not in taken:
               return c
   ```
   Meglio ancora: lasciarlo vuoto e farlo generare a DocMap.
4. **`multi_code` mai inventato**: solo dal gestionale o dall'utente.
5. **`updated_at`** va aggiornato a ogni modifica (ISO UTC, es. `datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")`). Servirà alla sincronizzazione per campo.
6. **Campi derivati** (`location_code`, `short_url`, destinazione risolta) si ricalcolano, non si modificano a mano.
7. **Non togliere colonne** né cambiare l'ordine del CSV a 29 colonne; leggere e scrivere **per intestazione** (in v8 `contacts`, `notes` sono state inserite dopo `shelf_color`, quindi le colonne successive sono scalate rispetto al CSV v7 a 25 colonne). DocMap ignora le colonne che non conosce.
8. Dati di esempio: i faldoni con tag `demo` non sono dati reali, escluderli.
9. **Stato delle voci** (v8): scrivere il suffisso `[in uso]` / `[cliente]` solo per le voci fuori dal faldone; DocMap legge anche `[al cliente]`, `[client]`, `[in use]`, `[prelevato]`, `[archivio]`. Nel `.sqlite` usare la colonna `status`, non il suffisso.

## 5. Proporre modifiche al modello

1. Aprite una richiesta (issue o messaggio a Dave) con: campo, tipo, obbligatorietà, esempio, perché serve, chi lo compila (utente / Python / AI), se va stampato in etichetta.
2. La modifica entra **prima nell'MVP** (checklist in `../AGENTS.md` §4: modello, CSV, alias, SQLite con migrazione, prompt AI, editor, stampa, ricerca, aiuto, test) e in `MODELLO-DATI.md`.
3. Solo dopo il rilascio il sistema Python si allinea. Le modifiche sono sempre **additive**: nuove colonne (in coda, dopo l'ultima esistente: oggi `location_id`), nessuna rinomina, i vecchi file continuano a importare.
