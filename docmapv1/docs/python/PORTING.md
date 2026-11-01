# Porting di `server-php/api.php` in Python (FastAPI), 1:1

> Per il team Python. Lingua: italiano; identificatori, rotte e campi in inglese come nel codice.
> Riferimento verificato: `server-php/api.php` di DocMap **26.11.1** (`DM_API 'docmap-php'`, `DM_API_VERSION 1`,
> `DM_SCHEMA 2`). Contratto macchina: [`openapi.yaml`](openapi.yaml). Forme dei record: [`SCHEMI.md`](SCHEMI.md) e
> [`schema/`](schema/). Testo umano del contratto: [`../API-CONTRACT.md`](../API-CONTRACT.md).
>
> Ogni affermazione di questo documento sui byte (blob, AAD, indici HMAC, JSON canonico, hash) è controllata da
> [`tools/validate_schemas.py`](tools/validate_schemas.py), che avvia il PHP vero, apre il suo `docmap.sqlite` con Python e
> ricalcola tutto (passo 4). Se cambi qualcosa qui, fallo girare.

**Obiettivo.** Il front-end (PC `index.html`, web app, telefono `scan.html`) non deve accorgersi del cambio: stesse rotte,
stessi parametri, stesso JSON, stessi codici HTTP, stessi `error.code`, stessi hash. Basta cambiare `apiBase` in
`docmap.config.js` del deploy (o l'"Indirizzo del server" sul PC). Il server PHP resta la specifica eseguibile: in caso di
dubbio vince il suo comportamento, non questo testo.

---

## 1. Forma dell'API

| Aspetto | Comportamento PHP da riprodurre |
|---|---|
| Instradamento | **Un solo URL**, rotta in query: `<apiBase>?r=<route>` (es. `…/api.php?r=pull&since=42`). In FastAPI: un handler su quel path che legge `r` e smista; offrire anche `/ping`, `/pull`… è facoltativo. |
| Rotte | `ping` (senza token) · letture `me pull binder location resolve` (viewer), `tokens` (admin), `journal` (editor) · scritture `push patch` (editor), `token_create token_revoke journal_restore` (admin). |
| Ordine dei controlli | `ping` prima di tutto (funziona anche senza config). Poi: config caricata → CORS (`origin` 403) → `OPTIONS` = 204 → rotta sconosciuta = 404 `no_route` (**prima** del token) → scrittura non POST = 405 `method` → metodo diverso da GET/POST = 405 → database (apertura, `key_check`, migrazione) → token / blocco IP / ruolo → rotta. |
| Metodi | Letture: GET **o** POST. Scritture: solo POST. |
| Parametri | `param()` legge **prima il corpo JSON**, poi la query string. Vale per tutte le rotte, letture comprese (il PC da `file://` manda tutto nel corpo). |
| Corpo | Letto come testo e decodificato come JSON **qualunque sia il `Content-Type`** (il PC manda `text/plain;charset=UTF-8`). Vuoto = `{}`. Non oggetto JSON → 400 `bad_json`. Oltre `max_body_mb` MB → 413 `too_large`. |
| Risposte | `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. JSON compatto, UTF-8 non escapato, `/` non escapato. |
| `ETag` | `binder`, `location`, `patch`: header `ETag: "<updated_at>"` (oltre al campo `etag`). |
| Errori | `{"error":{"code","message",…extra}}`. Il 409 ripete `current` e `current_etag` anche **al primo livello**. Nessun percorso di file né messaggio interno nei testi; eccezioni impreviste → 500 `server_error` e dettagli solo nel log. |

### 1.1 Le richieste "semplici" del PC (`file://`)

Il programma sul PC è aperto da `file://` (origine `null`) e deve evitare il preflight CORS. `DMServer.call` in
`assets/js/10-auth.js` (opzione `simple`) manda **sempre** `POST`, `Content-Type: text/plain;charset=UTF-8`, nessun
header personalizzato, e mette nel corpo JSON i parametri della query più `"_token"` e `"_device": {id, name, app}`.
`r` resta nella query. Se l'utente ha compilato la protezione con password della cartella aggiunge
`Authorization: Basic …` (che però rende la richiesta non semplice: serve la risposta al preflight `OPTIONS`, vedi §9.3).

La web app e il telefono (stessa origine) usano invece gli header `X-DocMap-Token`, `X-DocMap-Device`,
`X-DocMap-Device-Name` (URI-encoded), `X-DocMap-App` e `Content-Type: application/json`.

### 1.2 CORS

`cors()`: senza header `Origin` non fa nulla; stessa origine (`Origin` = `http(s)://<Host>`) non fa nulla; altrimenti
l'origine deve essere **esattamente** in `allowed_origins` (setup.php mette `null`, cioè `file://`) o si risponde 403
`origin`. Se ammessa: `Access-Control-Allow-Origin: <origin>`, `Vary: Origin`, `Allow-Methods: GET, POST, OPTIONS`,
`Allow-Headers: Content-Type, X-DocMap-Token, Authorization, If-Match, X-DocMap-Device, X-DocMap-Device-Name, X-DocMap-App`,
`Expose-Headers: ETag, Retry-After`, `Max-Age: 600`. Per `ping` gli errori di config/CORS sono ignorati (risponde comunque).
Non usare il `CORSMiddleware` generico di Starlette senza replicare il 403 `origin`.

### 1.3 Come il client legge gli errori

`DMServer` converte lo stato HTTP: 400/413/422 → `invalid`, 401 → `unauthorized`, 403 → `forbidden`, 404 → `not_found`,
409/412 → `conflict`, 429 → `locked` (attesa da `Retry-After` o `error.retry_in`), rete → `offline`, altro → `server`.
Il messaggio mostrato viene da `error.message`. Quindi **lo stato HTTP conta più del `code`**, ma i test controllano
anche il `code`.

---

## 2. Configurazione

`config.php` è un file PHP che restituisce un array. Il server Python deve leggere gli stessi valori (da un file
`.env`/TOML/YAML, o convertendo `config.php` una volta). Chiavi e predefiniti (`load_config()`):

| Chiave | Predefinito | Note |
|---|---|---|
| `data_dir` | — (obbligatoria) | Cartella scrivibile **fuori dal sito**; contiene `docmap.sqlite`. Mancante → 500 `config`. |
| `aes_key` | — (obbligatoria) | 32 byte casuali in **base64**. Mancante o lunghezza diversa → 500 `config`. È anche la chiave HMAC degli indici. |
| `tokens` | `[]` | Lista di `{user, role, token_sha256}` (setup.php) oppure `{user, role, token}` in chiaro; `disabled => true` lo spegne. L'id esposto è `cfg:<indice nella lista>`. |
| `allowed_origins` | `[]` | Origini CORS ammesse (es. `['null']` per il PC da `file://`). |
| `max_fails` | 5 | Token errati per IP prima del blocco. |
| `lock_seconds` | 60 | Primo blocco; raddoppia (max 900 s). |
| `max_body_mb` | 20 | Corpo massimo. |
| `studio_name` | `''` | Restituito da `me`. |
| `journal_keep_days` | 0 | v11: 0 = registro sincronizzazioni per sempre; N = voci più vecchie di N giorni cancellate (al massimo una volta al giorno, dopo un push). |
| `journal_pulls` | `'changes'` | v11: `changes` (registra i pull che hanno restituito qualcosa o con `since=0`) · `all` · `none`. |

`setup.php` crea `config.php` **senza** `journal_keep_days` e `journal_pulls`: valgono i predefiniti.

---

## 3. Cifratura a riposo

Tutto ciò che può nominare una persona o un cliente è cifrato con **AES-256-GCM**, chiave = `base64_decode(aes_key)`.

### 3.1 Formato del blob (byte per byte)

```
offset 0      1 byte   0x01                (versione del formato)
offset 1     12 byte   IV casuale           (nuovo a ogni scrittura)
offset 13    16 byte   tag GCM
offset 29     n byte   testo cifrato        (stessa lunghezza del testo in chiaro)
```

Il testo in chiaro è il JSON prodotto da `jenc()` (§5.2). Attenzione all'ordine: **il tag sta prima del testo cifrato**,
mentre `cryptography` vuole `ct + tag`:

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os

def enc(key: bytes, plain: str, aad: str) -> bytes:
    iv = os.urandom(12)
    ct_tag = AESGCM(key).encrypt(iv, plain.encode("utf-8"), aad.encode("utf-8"))
    return b"\x01" + iv + ct_tag[-16:] + ct_tag[:-16]

def dec(key: bytes, blob: bytes, aad: str) -> str:
    if len(blob) < 29 or blob[0] != 1:
        raise ValueError("stored payload unreadable")          # PHP: 500 crypto
    iv, tag, ct = blob[1:13], blob[13:29], blob[29:]
    return AESGCM(key).decrypt(iv, ct + tag, aad.encode("utf-8")).decode("utf-8")
```

### 3.2 AAD (dati associati) per ogni colonna cifrata

| Tabella.colonna | AAD | Contenuto in chiaro |
|---|---|---|
| `records.payload` | `records/<type>/<id>` | JSON del record **senza** `updated_at` (sta nella colonna); per una tombstone `{"code": "<codice umano>"}` |
| `settings_shared.json` (key `subset`) | `settings/subset` | JSON delle impostazioni condivise (`settingsSubset`) |
| `activity_log.payload` | `activity/<id>` | JSON della riga del registro attività |
| `meta.v` (k `key_check`) | `meta/key_check` | la stringa `docmap-key-check`; il blob è salvato in **base64** (le altre colonne sono BLOB binari) |
| `sync_journal.meta` | `journal/<jid>` | `{user, device_id, device_name, app_version, operator, ip, extra}` |
| `sync_journal_items.payload` | `journal/<jid>/<n>` | `{code, reason, prev, new, extra}` |

L'AAD lega il blob alla sua riga: copiare un blob su un'altra riga lo rende illeggibile (verificato dal validatore).

### 3.3 `key_check`

Alla prima apertura il PHP scrive in `meta` `key_check = base64(enc('docmap-key-check', 'meta/key_check'))`,
`schema = '1'`, `created_at`. Alle aperture successive decifra `key_check`: se fallisce → 500 `config`
("aes_key does not match the existing database"). Fai lo stesso: protegge da una chiave sbagliata che renderebbe
illeggibile tutto.

### 3.4 Indici HMAC (ricerche senza testo in chiaro)

```python
import hmac, hashlib
def hidx(key: bytes, v: str) -> str | None:
    if v == "":
        return None
    return hmac.new(key, ("docmap-idx/" + v).encode("utf-8"), hashlib.sha256).hexdigest()[:40]   # 40 caratteri esadecimali
```

| Colonna | Valore indicizzato |
|---|---|
| `records.k_short` | binder e location: `short_code` così com'è |
| `records.k_code` | binder: `upper(trim(speaking_code))` · location: `upper(trim(code))` |
| `records.k_cab` | solo binder: `room_code + "\x1f" + cabinet_code` (separatore unit separator, byte 0x1F); `NULL` se entrambi vuoti |
| `sync_journal.k_user` | `"user/" + lower(user)` (utente del token) |
| `sync_journal.k_device` | `"device/" + device_id` |
| `sync_journal_items.k_code` | `upper(trim(code))` del codice umano dell'elemento; `NULL` se vuoto |

Le tombstone hanno `k_short`, `k_code`, `k_cab` a `NULL`. `upper`/`lower` in PHP (`strtoupper`/`strtolower`) toccano
solo l'ASCII: in Python usa una funzione che cambi solo `a-z`/`A-Z` (es. `s.translate(...)`) se vuoi la stessa chiave
anche con lettere accentate.

---

## 4. Database del server (SQLite)

Il PHP usa un file `<data_dir>/docmap.sqlite` con `PRAGMA busy_timeout = 8000`, `journal_mode = WAL`,
`synchronous = NORMAL`. DDL esatto (schema 1 = v10.1):

```sql
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS records (type TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
  who TEXT NOT NULL DEFAULT '', payload BLOB, seq INTEGER NOT NULL DEFAULT 0, k_short TEXT, k_code TEXT, k_cab TEXT, PRIMARY KEY (type, id));
CREATE INDEX IF NOT EXISTS records_seq ON records (seq);
CREATE INDEX IF NOT EXISTS records_short ON records (k_short);
CREATE INDEX IF NOT EXISTS records_code ON records (k_code);
CREATE INDEX IF NOT EXISTS records_cab ON records (k_cab);
CREATE TABLE IF NOT EXISTS changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, at TEXT NOT NULL, device TEXT, who TEXT);
CREATE TABLE IF NOT EXISTS settings_shared (key TEXT PRIMARY KEY, json BLOB, updated_at TEXT NOT NULL, seq INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS activity_log (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, at TEXT, payload BLOB);
CREATE TABLE IF NOT EXISTS auth_fail (k TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tokens (id TEXT PRIMARY KEY, token_sha256 TEXT NOT NULL UNIQUE, user TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT, revoked_at TEXT);
```

Migrazione a schema 2 (v11, `db_migrate()`, additiva e idempotente, sotto `BEGIN IMMEDIATE`, rilegge `meta.schema`
dentro il lock; scrive `meta.schema = '2'` e `meta.migrated_2_at`):

```sql
CREATE TABLE IF NOT EXISTS sync_journal (jid INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, route TEXT NOT NULL, token_id TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '', k_user TEXT, k_device TEXT, n_sent INTEGER NOT NULL DEFAULT 0, n_accepted INTEGER NOT NULL DEFAULT 0,
  n_rejected INTEGER NOT NULL DEFAULT 0, n_conflicts INTEGER NOT NULL DEFAULT 0, n_same INTEGER NOT NULL DEFAULT 0, n_items INTEGER NOT NULL DEFAULT 0,
  seq_from INTEGER, seq_to INTEGER, meta BLOB);
CREATE INDEX IF NOT EXISTS sync_journal_at ON sync_journal (at);
CREATE INDEX IF NOT EXISTS sync_journal_user ON sync_journal (k_user);
CREATE INDEX IF NOT EXISTS sync_journal_device ON sync_journal (k_device);
CREATE TABLE IF NOT EXISTS sync_journal_items (jid INTEGER NOT NULL, n INTEGER NOT NULL, type TEXT NOT NULL, id TEXT NOT NULL, k_code TEXT, action TEXT NOT NULL,
  client_updated_at TEXT, prev_updated_at TEXT, new_updated_at TEXT, prev_hash TEXT, new_hash TEXT, payload BLOB, PRIMARY KEY (jid, n));
CREATE INDEX IF NOT EXISTS sync_journal_items_rec ON sync_journal_items (type, id);
CREATE INDEX IF NOT EXISTS sync_journal_items_code ON sync_journal_items (k_code);
```

Chiavi di `meta`: `key_check`, `schema`, `created_at`, `migrated_2_at`, `journal_pruned_at`.

Significato delle colonne:

- `records`: una riga per `(type, id)`, viva o tombstone (`deleted = 1`, `updated_at` = `deletedAt`). `seq` = ultimo
  `changes.seq` che l'ha toccata; `who` = operatore del push (o utente del token, o `who` della tombstone).
- `changes`: un contatore **globale e crescente** (anche le impostazioni scrivono una riga `type='settings', id='subset'`).
  Il client conserva l'ultimo `seq` ricevuto e chiede `pull?since=<seq>`: i numeri non devono mai diminuire (vedi §8).
- `activity_log.seq`: secondo contatore, per `log_since`.
- `auth_fail.k` = `ip:<REMOTE_ADDR>`; `until` e `at` in secondi Unix.

Puoi tenere questo stesso file SQLite (consigliato all'inizio: §8.1) o un altro database con gli stessi concetti.

---

## 5. JSON canonico e hash

Servono a due cose: decidere se un push è "uguale" (`same`) e firmare le versioni nel registro sincronizzazioni
(`prev_hash`, `new_hash`, `hash` di `patch`). Il client calcola lo **stesso** hash (`jrCanon` + `jrHash` in
`assets/js/06i-journal.js`) e lo confronta: deve coincidere byte per byte.

### 5.1 `canon(v, top=True)`

1. Oggetto (dict): se è vuoto diventa **lista vuota** `[]` (in PHP `{}` e `[]` sono lo stesso array); se le sue chiavi
   sono esattamente `"0","1",…,"n-1"` in quest'ordine è una lista. Altrimenti: chiavi ordinate (ordine dei byte, come
   `ksort` sulle stringhe); **solo al primo livello** si tolgono `updated_at`, `short_url`, `location_code`,
   `selected_for_print` (`DM_CANON_SKIP`); **a ogni livello** si tolgono le chiavi che iniziano con `_`.
2. Lista: resta nell'ordine, ogni elemento canonicalizzato.
3. `null` → `""`; booleani → `"true"` / `"false"`; numeri → testo (`2.5` → `"2.5"`, `3` → `"3"`, `1.0` → `"1"`); stringhe invariate.

```python
CANON_SKIP = ("updated_at", "short_url", "location_code", "selected_for_print")

def canon(v, top=True):
    if isinstance(v, dict):
        if not v:
            return []
        keys = list(v.keys())
        if keys == [str(i) for i in range(len(keys))]:
            return [canon(v[k], False) for k in keys]
        return {k: canon(v[k], False) for k in sorted(v, key=lambda s: s.encode("utf-8"))
                if not (top and k in CANON_SKIP) and not k.startswith("_")}
    if isinstance(v, list):
        return [canon(x, False) for x in v]
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else repr(v)
    return v
```

Casi limite noti (non capitano nei record DocMap, ma documentati): chiavi numeriche in un oggetto annidato (PHP le
converte in interi e `ksort` le confronta come numeri); float con molte cifre (PHP usa `serialize_precision = -1`, come
`repr` di Python). I record DocMap hanno solo stringhe, booleani e liste di oggetti con chiavi testuali.

### 5.2 `jenc()` e hash

`jenc` = `json_encode(…, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE)`: compatto,
UTF-8 diretto, `/` non escapato, **ma U+2028 e U+2029 escapati** come `\u2028` / `\u2029` (PHP lo fa sempre senza
`JSON_UNESCAPED_LINE_TERMINATORS`):

```python
import json, hashlib
def jenc(v) -> str:
    s = json.dumps(v, ensure_ascii=False, separators=(",", ":"))
    return s.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")

def jr_hash(data: dict | None) -> str | None:
    return None if data is None else hashlib.sha256(jenc(canon(data)).encode("utf-8")).hexdigest()

def jr_tomb_hash(type_: str, id_: str, deleted_at: str) -> str:
    return hashlib.sha256(f"deleted:{type_}/{id_}@{deleted_at}".encode("utf-8")).hexdigest()
```

Usa `jenc` anche per i payload cifrati e per la soglia di 256 KB (`DM_MAX_RECORD = 262144` byte di `jenc(data)`).
La suite (sezione J) controlla che `jrCanon` produca
`{"b":"x","e":[],"id":"k","l":["1","a"],"n":"2.5","o":{"a":"\u2028","b":"1"},"t":"true","z":""}` su un esempio misto:
è un buon test unitario anche per la tua `canon`.

---

## 6. Autenticazione, ruoli, blocco per IP

1. Se `auth_fail[ip:<ip>].until > adesso` → 429 `locked`, `retry_in` = secondi rimasti, header `Retry-After` (anche con
   un token giusto). Controllato **prima** del token.
2. Token: `X-DocMap-Token`, altrimenti `Authorization: Bearer <t>` (anche `REDIRECT_HTTP_AUTHORIZATION`), altrimenti
   `"_token"` del corpo JSON. Vuoto → 401 `token_missing` (non conta come errore).
3. `sha256(token)` esadecimale confrontato (tempo costante) con ogni token di config non `disabled` (`token_sha256`
   minuscolo, oppure sha256 di `token` in chiaro); l'**ultimo** che corrisponde vince. Poi la tabella `tokens` con
   `revoked_at IS NULL`. Ruolo sconosciuto → `viewer`. `user` mancante in config → `user<indice>`.
4. Token sconosciuto: `n = n_precedente + 1`; se `n >= max_fails` → `until = adesso + min(900, lock_seconds × 2^min(10, n − max_fails))`,
   altrimenti `until = 0`; 401 `token_invalid` con `left = max(0, max_fails − n)`. Il contatore riparte solo dopo un token giusto.
5. Token giusto: cancella la riga `auth_fail`. Ruolo insufficiente (`viewer 1 < editor 2 < admin 3`) → 403 `forbidden`.

`token_create`: `user` dopo trim deve rispettare `/^[\p{L}\p{N} ._@-]{1,60}$/u` (in Python: modulo `regex`, oppure
`all(ch.isalnum() or ch in " ._@-" for ch in user)`), `role` in `viewer|editor|admin` (predefinito `editor`), altrimenti
422 `invalid`. Token = 24 byte casuali in base64url senza `=` (32 caratteri), id = 8 byte casuali esadecimali
(esposto `db:<16 hex>`), si salva solo lo sha256. `token_revoke` accetta solo `db:<16 hex>` (422 `invalid` per `cfg:…`),
404 se già revocato o assente.

---

## 7. Rotte: regole da riprodurre

Le forme esatte delle risposte sono in `openapi.yaml`; qui le regole di comportamento. Ora del server:
`now_iso()` = UTC con millisecondi troncati, `AAAA-MM-GGThh:mm:ss.mmmZ`. I confronti di tempo sono sempre sugli istanti
(`ts_ms`: data non valida o vuota = 0), mai sul testo, tranne i filtri `from`/`to` di `journal` (testuali su `at`).

### 7.1 `pull` (viewer)

- `since` (default 0), `log_since` (default 0). Tutto in una transazione di lettura.
- Record con `seq > since` ordinati per `seq`, al massimo **2000** (`DM_PULL_PAGE`): se ce ne sono di più `more = true` e
  `seq` = ultimo `seq` restituito; altrimenti `seq = MAX(changes.seq)`.
- Ogni riga viva diventa `{type, id, updated_at, who, data}` con `data` = payload + `id` + `updated_at`; ogni tombstone
  diventa `{type, id, code, deletedAt, who}` (in `tombstones`, mai in `records`).
- `settings`: `{updated_at, data}` solo se `settings_shared.seq > since`, altrimenti `null`.
- `activity_log`: con `log_since = 0` le **ultime** 1000 righe (in ordine crescente), altrimenti le 1000 successive a
  `log_since`; `log_seq` = ultimo seq restituito, oppure `MAX(activity_log.seq)` se la pagina non è piena.
- `counts` solo con `since = 0`: `{records: vivi, tombstones: eliminati}`; altrimenti `null` (il client riconosce il server vuoto).
- Registro (v11): una voce `pull` se `journal_pulls` lo chiede (§2), con un elemento `pull` per record, `pull-delete` per
  tombstone, `pull` per `settings/subset`; `journal_id` nella risposta (`null` se non registrata).

### 7.2 `push` (editor) — last-write-wins per record, una transazione `BEGIN IMMEDIATE`

Corpo: `records[]`, `tombstones[]`, `settings?`, `activity_log?`, `deviceId`, `operator`. `who` dei record = `operator`
(max 80 caratteri) o, se vuoto, l'utente del token. Per **ogni record**, nell'ordine:

1. `type` non in `binder|client|location`, `id` non conforme a `^[A-Za-z0-9._:@-]{1,100}$`, `data` non oggetto, o
   `updated_at` (del record o di `data`) non valido → `rejected` `invalid` (elemento `rejected-invalid` nel registro).
2. `len(jenc(data)) > 262144` → `rejected` `too_large`.
3. `data.id = id`. Se il server ha già la riga: stessa ora **e** viva **e** `jenc(canon(attuale)) == jenc(canon(data))`
   → `same` (nessuna scrittura). Ora in arrivo ≤ ora del server → `rejected` con `reason` `tie` (uguale) o `older`
   (minore), `server_updated_at` e `current` (la copia del server, record o tombstone con `deleted: true`); nel registro
   `conflict` (tie, conta anche in `conflicts`) o `rejected-older`.
4. Altrimenti si scrive con l'`updated_at` **del client** (il server non lo riscrive mai nel push): `create` o `update`
   nel registro, `reason: resurrect` se la riga era una tombstone.

Per ogni **tombstone** (`type`, `id`, `deletedAt`, `code`, `who`): non valida → `invalid`; riga già eliminata con ora ≥
`deletedAt` → `same`; riga viva con ora ≥ `deletedAt` → `rejected` (`tie`/`older`, nel registro reason `tie_delete` /
`older_delete`); altrimenti si scrive la tombstone (payload `{code}`, `who` = `who` della tombstone o l'operatore).
Una tombstone di un record che il server non ha mai visto si scrive comunque (così arriva agli altri dispositivi).

`settings`: applicato se `data` è un oggetto e `updated_at` è più recente di quello salvato (o non ce n'è): riga in
`changes` (`settings/subset`), blob cifrato. `activity_log`: unione per `id` (`INSERT OR IGNORE`, al massimo 5000 per
chiamata, `id` valido richiesto; `at` mancante = ora del server). La voce `push` del registro è scritta **nella stessa
transazione**; poi `jr_prune`. Risposta: `{applied, same, rejected[], settings_applied, logged, seq, server_time, journal_id}`.

Ogni scrittura (`rec_write`) inserisce prima una riga in `changes` (con `device` = `deviceId` del corpo, `who`), poi fa
l'upsert di `records` con quel `seq`, gli indici HMAC e il payload cifrato **senza** `updated_at`.

### 7.3 `binder`, `location`, `resolve` (viewer)

- `binder`: `qr` (`^[A-Za-z0-9_-]{1,40}$`, altrimenti 400) cercato su `k_short`, altrimenti `code` (maiuscolo) su `k_code`;
  solo righe vive, la più recente; 404 `not_found`. `siblings`: fino a 400 faldoni vivi con lo stesso `k_cab` (escluso
  se stesso) → `{speaking_code, shelf_code, sector_code, location_code}`.
- `location`: `id` (prioritario) o `qr` (`k_short`) o `code` (`k_code`). `path` = antenati dalla radice (max 16, si ferma
  a un genitore mancante o a un ciclo), `children` = figli diretti vivi, `binders` = faldoni con `location_id` = id (max
  500 elencati, `count` = totale), entrambi in ordine naturale senza maiuscole (`strnatcasecmp`: in Python per esempio
  `natsort.natsort_keygen(alg=ns.IGNORECASE)`). I figli e i faldoni si trovano **decifrando** tutte le righe del tipo
  (nessun indice su `parent_id` / `location_id`: va bene per l'archivio di uno studio; in Python puoi aggiungere una cache).
- `resolve`: `qr` obbligatorio; se corrisponde a `^dm26L[A-Za-z0-9]{8}$` è un'ubicazione, altrimenti un faldone (`k_short`).
  Risposta = `{type: 'location'|'binder'} + ` la risposta della rotta corrispondente.

### 7.4 `patch` (editor) — il telefono

1. `id` valido e `patch` oggetto, altrimenti 400 `invalid`.
2. Ogni chiave di `patch` deve stare in `DM_MOBILE_FIELDS` (`archive_state, contents_items, room_code, cabinet_code,
   shelf_code, sector_code, notes, tags, location_id, location_code`), altrimenti 422 `field_not_allowed` con `field`
   — controllo fatto **prima** di aprire la transazione.
3. Base = `base_updated_at`, oppure header `If-Match` senza virgolette. `force` = vero se non vuoto.
4. In `BEGIN IMMEDIATE`: faldone assente o eliminato → 404. Se `!force` e base ≠ `updated_at` del server: si scrive
   **e si conferma** la voce di registro (elemento `conflict`, `reason: stale_base`, versione tentata in `new`), poi 409
   `conflict` con `current` (il faldone del server) e `current_etag`.
5. `location_id` presente: `''` → toglie l'ubicazione (`location_code` = quello inviato se stringa, altrimenti `''`);
   altrimenti deve essere un id valido di un'ubicazione viva (422 `invalid_location`, con `location_id` se non trovata)
   e il server **ricalcola** `location_code` = `code` dell'ubicazione. `location_code` senza `location_id` → 422 `field_not_allowed`.
6. Unione campo per campo, `updated_at = max(adesso, attuale + 1 ms)` (sempre crescente), `who` = `operator` o utente.
7. Riga del registro attività: quella proposta in `log` (se oggetto) completata con `id` casuale, `action: binder.edit`,
   `source: mobile`, `who`, `target`, `summary`; poi forzati `at` = nuova ora, `details.patch`, `details.base_updated_at`,
   `details.new_updated_at`, `details.forced`, `details.token_user`.
8. Risposta `{binder, etag, journal_id, hash}` con `hash = jr_hash(payload salvato)` + header `ETag`.

### 7.5 `journal` (editor: solo le proprie voci; admin: tutte) e `journal_restore` (admin)

- `journal`: filtri `user` (solo admin; per un editor è sempre il suo, via `k_user`), `entry` (una voce; con `entry` i
  filtri `from/to/device/route/before` sono ignorati), `from`, `to` (`AAAA-MM-GG` → `T23:59:59.999Z`), `device`
  (`k_device`), `route`, `before` (jid <), `record` (id esatto di un elemento), `code` (`k_code` dell'elemento),
  `limit` 1–200 (default 50). Dalla più recente. Elementi per voce: 500, o 20 000 con `entry` (e solo allora `prev`,
  `new`, `extra`). Con `record`/`code` gli elementi elencati sono solo quelli che corrispondono. `ip` solo per l'admin.
  `entry` inesistente o non visibile → 404.
- `journal_restore {jid, n, version: prev|new}`: 422 se `jid`/`n` ≤ 0 o versione diversa; 404 elemento assente; 422 se il
  tipo non è un record (`settings`) o se la versione è vuota per un elemento `pull`, `pull-delete`, `rejected-invalid`.
  Scrive la versione come **nuova** scrittura con `updated_at = max(adesso, attuale + 1 ms)` (versione vuota = tombstone),
  `who` = utente del token, voce `journal_restore` con `extra.source = {jid, n, version}` ed elemento `restore`
  (`reason: "journal <jid>/<n> <version>"`), riga di registro attività `sync.restore` (`source: sync`).

### 7.6 Il registro sincronizzazioni (scrittura)

Una voce per push, patch (anche la 409), pull registrato, ripristino. Colonne in chiaro: `at`, `route`, `token_id`,
`role`, contatori `n_sent n_accepted n_rejected n_conflicts n_same n_items`, `seq_from`, `seq_to`; `meta` cifrato.
Elementi numerati da 1 nell'ordine in cui sono stati prodotti, con `action` (`create update delete conflict
rejected-older rejected-invalid pull pull-delete restore`), i tre tempi, i due hash in chiaro e il payload cifrato
`{code, reason, prev, new, extra}`. L'identità del dispositivo (`client_info()`): `_device` del corpo, altrimenti gli
header, altrimenti (per l'id) `deviceId` del corpo; caratteri di controllo tolti, tagliati a 100/80/40 caratteri;
mancante → `unknown`. **Mai** usarla per autorizzare.

---

## 8. Migrazione di un `docmap.sqlite` esistente

Lo studio ha già dati sul server PHP. Tre strade, dalla più sicura:

### 8.1 Stesso file, stesso formato (consigliata per il primo rilascio)

Il server Python apre **lo stesso** `docmap.sqlite` con la stessa `aes_key` e scrive nello stesso formato (§3–§5).
Vantaggi: nessuna conversione, `seq` invariati (i client continuano da dove erano), si può tornare al PHP in qualsiasi
momento. Verifica d'avvio: decifra `meta.key_check`; applica la migrazione a schema 2 se `meta.schema` < 2 (stessi
`CREATE … IF NOT EXISTS`); non usare mai `DROP` o `RENAME`.

### 8.2 Conversione in un altro database (es. PostgreSQL)

1. Copia `config.php` e `docmap.sqlite` (a server fermo o con `sqlite3 .backup`, per includere il WAL).
2. Leggi `aes_key` (base64 → 32 byte) e controlla `key_check`.
3. Per ogni riga di `records`: `dec(payload, "records/<type>/<id>")` → JSON; conserva `type`, `id`, `updated_at`,
   `deleted`, `who`, **`seq`**; ricalcola o copia gli indici. Le tombstone restano tombstone (servono agli altri dispositivi).
4. `changes`, `activity_log` (`activity/<id>`), `settings_shared` (`settings/subset`), `tokens` (solo sha256: i codici
   restano validi), `sync_journal` (`journal/<jid>`) e `sync_journal_items` (`journal/<jid>/<n>`) con i loro numeri.
5. **I contatori non devono ripartire da capo.** Ogni client ricorda, per indirizzo del server, l'ultimo `seq` e `log_seq`
   ricevuti (`S.sync.peers['server:<url>']`, `assets/js/06g-server.js`). Se il nuovo server riparte da 1, i client non
   vedono i cambiamenti finché il contatore non supera il vecchio valore. Quindi: copia `seq` e fai ripartire la
   sequenza da `MAX(seq) + 1` (per `changes` e `activity_log`), e mantieni i `jid`.
6. Controllo finale: per ogni record `jr_hash(dati decifrati)` deve restare uguale prima e dopo; `pull?since=0` dal
   vecchio e dal nuovo server deve dare gli stessi record e tombstone (stesso `updated_at`, stesso hash).

### 8.3 Indirizzo nuovo

Se cambia l'URL dell'API il client lo tratta come un **peer nuovo**: al primo "Sincronizza" fa un pull completo
(`since=0`) e, se il server è vuoto, propone "Carica il mio archivio sul server (prima volta)". È una via di riserva
(da un PC aggiornato: pull completo dal vecchio, poi primo caricamento sul nuovo), ma perde il registro attività e il
registro sincronizzazioni del vecchio server: preferisci 8.1 o 8.2.

### 8.4 Cosa NON cambiare

Nessuna modifica a: nomi delle rotte e dei campi, codici di errore, formato dei tempi, regole LWW, `DM_CANON_SKIP`,
calcolo degli hash, formato `dm26`/`dm26L` dei codici QR, chiavi di `localStorage`/IndexedDB del client
(`docmap_v26_state`, `docmap_v26_srv`, `docmap_v26_device`, …). Ogni cambiamento di contratto va concordato con Dave e
fatto insieme al front-end, con una guida `docs/AGGIORNAMENTO-vX-vY.md` (`docs/AGGIORNAMENTI.md`).

---

## 9. Far girare la suite Playwright contro il server Python

La suite (`docmapv1/tests/suite.js`, ~1056 controlli, circa 6 minuti) è la specifica eseguibile. Oggi tre sezioni
avviano il server PHP con il server integrato di PHP:

| Sezione | Cosa prova | Come avvia il server |
|---|---|---|
| `v10.1 W` | deploy, `setup.php`, tutte le rotte v10.1, blocco per IP, web app e telefono contro il server | `php -S 127.0.0.1:<18300 + pid%500> -t tests/shots/srv tests/php-router.php` sul deploy costruito da `tools/build_deploy.py`; `config.php` scritto da `setup.php` |
| `v11 X` | ubicazioni sul server, associazione dal telefono, aggiornamento v10.1 → v11 dello stesso `data_dir` | come W su `tests/shots/srvx`, porta `18900 + pid%500`; parte con l'`api.php` v10.1 (`git show 68ae170:…`) e poi lo sostituisce |
| `v11 J` | registro sincronizzazioni, convergenza di più client, aggiornamento in place, hash | porta `18850 + pid%300`, `config.php` scritto dal test (chiave casuale, token in sha256); legge `docmap.sqlite` con `python3 -c "import sqlite3…"` |

`tests/php-router.php` fa da Apache: applica le regole `Require all denied` dei `.htaccess` del deploy.

### 9.1 Il punto di aggancio (da implementare, non esiste ancora)

Proposta, da concordare con Dave e da aggiungere alla suite in un rilascio futuro (oggi la suite chiama `php` direttamente):

- `DOCMAP_TEST_SERVER_CMD`: comando che avvia il server sotto test, con segnaposto `{port}`, `{root}` (cartella del
  deploy, che contiene `studio-de/server-php/`), `{config}` (percorso di `config.php`). Assente → il comando PHP di oggi.
  Esempio: `uvicorn docmap_api.main:app --host 127.0.0.1 --port {port}` con la variabile `DOCMAP_CONFIG={config}`.
- `DOCMAP_TEST_API_PATH`: percorso dell'API rispetto all'origine (oggi `/studio-de/server-php/api.php`). Il server
  Python deve rispondere a quel path con `?r=<route>` **e** servire i file statici del deploy dalla stessa origine (la
  web app e `scan.html` sono caricati da lì), con le stesse regole di `php-router.php` (403 su `config.php`, `data/`, `.ht*`).
- `DOCMAP_TEST_PORT_BASE` (facoltativo): base delle porte se 18300/18850/18900 sono occupate.

Cosa resta specifico del PHP e va saltato o adattato con il server Python:

- W: `setup.php` (scrittura di `config.php`, rinomina in `setup.php.disabled`, rifiuto della seconda esecuzione): il
  server Python deve offrire un passo di installazione equivalente o la suite deve scrivere la config direttamente come fa J.
- X e J: lo scambio di `api.php` v10.1 → v11 sullo stesso `data_dir` (prova di aggiornamento): con il Python diventa
  "PHP v10.1 → Python sullo stesso `docmap.sqlite`", che è esattamente la prova della migrazione §8.1.
- J: le letture dirette di `docmap.sqlite` (tabelle, colonne, blob cifrati): valgono solo se il Python usa lo stesso
  file (§8.1). Con un altro database servono controlli equivalenti.
- `config.php` con `max_fails => 3`, `lock_seconds => 2` (W) per provare il blocco in pochi secondi.

### 9.2 Prima della suite: il validatore

```
pip install jsonschema referencing pyyaml cryptography
NODE_PATH=docmapv1/tests/node_modules python3 docmapv1/docs/python/tools/validate_schemas.py
```

Oggi il passo 4 avvia `php -S`; per provare il server Python sostituisci in `step_php()` l'avvio del processo (la
funzione `run_routes()` usa solo HTTP e, per i controlli di §3, il file `docmap.sqlite`). Tutti i controlli di forma
(`openapi.yaml`) e di byte (blob, HMAC, hash) devono passare anche con il Python.

### 9.3 Preflight con la protezione a password della cartella

Se lo studio protegge la cartella con HTTP Basic (SiteGround) e il PC manda `Authorization: Basic`, il browser fa un
preflight `OPTIONS` **senza** credenziali: Apache lo deve lasciar passare (in `server-php/.htaccess` ci sono le tre
righe `<If "%{REQUEST_METHOD} == 'OPTIONS'"> Require all granted </If>`, commentate: si attivano solo se serve), e
l'API risponde 204 con gli header CORS. Il server Python (o il proxy davanti) deve fare lo stesso.
