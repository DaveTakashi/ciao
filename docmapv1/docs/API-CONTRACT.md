# DocMap — contratto API del database online condiviso (v10.1)

> Stato: **contratto in produzione**. Implementazione di riferimento: `server-php/api.php` (un solo file, PHP 8.0+,
> PDO SQLite + OpenSSL, nessuna dipendenza) pensato per l'hosting condiviso SiteGround (PHP sì, Node/Python no).
> Un servizio Python (FastAPI o altro) può **sostituirlo 1:1**: stesse rotte, stessi JSON, stessi codici HTTP; il
> front-end non cambia (basta puntare `apiBase` al nuovo indirizzo). I nomi dei campi sono quelli di
> `MODELLO-DATI.md` e non vanno cambiati. Il client è in `assets/js/10-auth.js` (`DMServer`, `RemoteDataProvider`,
> `srvSetupDevice`) e `assets/js/06g-server.js` (sincronizzazione). Test eseguibili: blocco `// @@STREAM-W@@` di
> `tests/suite.js` (avvia `php -S` e prova ogni rotta).

## 1. Regole comuni

| Tema | Regola |
|---|---|
| Indirizzo | `apiBase` di `docmap.config.js`, relativo all'app (`server-php/api.php`) o assoluto `https://…`. Rotta nella query: `<apiBase>?r=<rotta>`. Un'implementazione Python può esporre lo stesso schema (`/api?r=pull`) o un proprio URL: conta solo `apiBase`. |
| Trasporto | **HTTPS** obbligatorio in produzione. JSON UTF-8. Letture con `GET` (accettano anche `POST`), scritture solo `POST`. |
| Token | Header **`X-DocMap-Token: <token>`** (principale). Alternative: `Authorization: Bearer <token>`; campo `"_token"` nel corpo JSON (richieste `text/plain` dal programma sul PC aperto da `file://`, per evitare il preflight CORS). **Perché non `Authorization`**: la protezione con password di SiteGround (HTTP Basic) occupa già quell'header e il browser lo invia da solo. |
| Ruoli | `viewer` (legge) < `editor` (scrive: push, patch) < `admin` (anche gestione token). |
| Errori | Sempre `{"error":{"code":"…","message":"…", …}}`; per 409 anche `current` e `current_etag` al primo livello. Nessun percorso del server né messaggio PHP nei testi. |
| Codici HTTP | 400 richiesta malformata · 401 `token_missing` / `token_invalid` · 403 `forbidden` (ruolo) / `origin` (CORS) · 404 `not_found` / `no_route` · 405 metodo · 409 `conflict` · 413 troppo grande · 422 `invalid` / `field_not_allowed` · 429 `locked` + `Retry-After` · 500 `config` (configurazione mancante, messaggio chiaro) / `server_error` |
| Mappatura nel client | `DMError.code`: 401→`unauthorized`, 403→`forbidden`, 404→`not_found`, 409/412→`conflict`, 400/413/422→`invalid`, 429→`locked`, rete assente→`offline`, altro→`server` |
| Date | ISO 8601 UTC con millisecondi (`2026-11-01T10:12:44.120Z`). Confronto **come istante** (non come stringa). |
| Id | `id` creati dai client (UUID), mai riscritti. Tipi di record: `binder`, `client`. |
| CORS | Predefinito: solo stessa origine. `allowed_origins` in `config.php` aggiunge origini; `'null'` = programma sul PC da `file://`. Metodi `GET, POST, OPTIONS`; header `Content-Type, X-DocMap-Token, Authorization, If-Match`; esposti `ETag, Retry-After`. |

## 2. Rotte

| Rotta | Metodo | Ruolo | Richiesta | Risposta 200 |
|---|---|---|---|---|
| `ping` | GET | nessuno | – | `{"ok":true,"api":"docmap-php","version":1,"server_time":"…","php":"8.3"}` (funziona anche senza `config.php`; serve all'avviso di orologio sfasato) |
| `me` | GET | viewer | – | `{"user":"mario","role":"editor","token_id":"cfg:1","studio_name":"…","server_time":"…"}` |
| `pull` | GET | viewer | `since=<seq>` (0 = tutto) · `log_since=<seq>` | vedi §3 |
| `push` | POST | editor | vedi §4 | `{"applied":n,"same":n,"rejected":[…],"settings_applied":bool,"logged":n,"seq":n,"server_time":"…"}` |
| `binder` | GET | viewer | `qr=<short_code>` oppure `code=<speaking_code>` (maiuscole/minuscole indifferenti) | `{"binder":Binder,"etag":"<updated_at>","siblings":[Sibling]}` + header `ETag` · 404 |
| `patch` | POST | editor | vedi §5 | `{"binder":Binder,"etag":"<nuovo updated_at>"}` + `ETag` · 409 · 422 |
| `tokens` | GET | admin | – | `{"items":[{"id":"cfg:0"|"db:…","user","role","source":"config"|"database","created_at"?,"revoked_at"}]}` |
| `token_create` | POST | admin | `{"user":"…","role":"editor"}` | `{"id":"db:…","user","role","token":"<in chiaro, mostrato una volta>"}` |
| `token_revoke` | POST | admin | `{"id":"db:…"}` | `{"ok":true}` (i token di `config.php` si disattivano con `'disabled' => true`) |

`Binder` = l'oggetto di `MODELLO-DATI.md` §1 così come lo invia il client (più `id`, `updated_at`); `Sibling` =
`{speaking_code, shelf_code, sector_code, location_code}` degli altri faldoni dello **stesso armadio** (stanza+armadio).

## 3. `pull` — cambiamenti incrementali

```json
{"seq": 42, "more": false,
 "records": [{"type":"binder","id":"…","updated_at":"…","who":"mario","data":{ /* Binder completo */ }}],
 "tombstones": [{"type":"binder","id":"…","code":"BL2","deletedAt":"…","who":"Davide"}],
 "settings": {"updated_at":"…","data":{"studioName":"…","destTemplate":"…","catColors":{},"colorMode":"…","catFamilies":{},"colorRules":{},"colorUpdatedAt":"…"}} | null,
 "activity_log": [ /* voci del registro (MODELLO-DATI.md §7.2) */ ], "log_seq": 17,
 "counts": {"records":120,"tombstones":3} /* solo con since=0 */, "server_time": "…"}
```

- `seq` è il numero dell'ultimo cambiamento incluso: il client lo rimanda come `since` la volta dopo. Pagine da 2000
  record: con `more:true` si richiama subito con `since=seq`. Tutto in una sola transazione di lettura (istantanea coerente).
- Un record eliminato arriva **solo** come tombstone. `settings` c'è solo se è cambiato dopo `since`.
- Registro: con `log_since=0` arrivano le ultime 1000 voci; poi solo le nuove (`log_seq`).
- `counts` (solo `since=0`) permette al client di riconoscere un **server vuoto** (primo caricamento).

## 4. `push` — last-write-wins per record

```json
{"records":[{"type":"binder","id":"…","updated_at":"2026-11-01T10:00:00.000Z","data":{ /* Binder */ }}],
 "tombstones":[{"type":"binder","id":"…","code":"BL2","deletedAt":"…","who":"Davide"}],
 "settings":{"updated_at":"…","data":{ /* come sopra */ }} | null,
 "activity_log":[ /* voci nuove */ ], "deviceId":"dev-…", "operator":"Davide"}
```

Regole (le stesse di `06f-sync.js`, `SYNC.md` §1), applicate record per record in **una transazione**:

| Situazione sul server | Esito |
|---|---|
| record assente | applicato (`applied`) |
| `updated_at` in arrivo **più recente** | applicato (anche se era eliminato: il record torna) |
| stessa ora e stesso contenuto (canonico, esclusi `updated_at`, `short_url`, `location_code`, `selected_for_print`) | ignorato (`same`) |
| stessa ora, contenuto diverso | **vince il server**, `rejected` con `reason:"tie"` |
| più vecchio | `rejected` con `reason:"older"` |
| tombstone più recente del record | record eliminato (`deleted=1`, `updated_at=deletedAt`) |
| tombstone più vecchia del record vivo | `rejected` `older` |

Ogni elemento di `rejected` = `{"type","id","server_updated_at","reason","current":{…copia del server (record o tombstone)}}`
così il client la applica subito senza un altro pull. `reason:"invalid"` (id/tipo/data non validi) e `"too_large"`
(> 256 KB) non hanno `current`. `settings`: vince l'`updated_at` più recente. `activity_log`: unione per `id`
(una voce non si modifica più). Limite del corpo: `max_body_mb` (20 MB); il client spezza in blocchi da 500 record /
1000 voci di registro.

## 5. `patch` — modifica da telefono (`scan.html`)

```json
{"id":"…","patch":{"archive_state":"CHECKED_OUT","notes":"…"},"base_updated_at":"<etag letto>","force":false,
 "log":{"id":"<uuid>","who":"Mario","action":"binder.edit","source":"mobile","summary":"…","details":{"changed":{"notes":["", "…"]}}},
 "operator":"Mario"}
```

- Campi ammessi (`MOBILE_FIELDS`): `archive_state, contents_items, room_code, cabinet_code, shelf_code, sector_code,
  notes, tags`; qualsiasi altro → **422** `field_not_allowed` (`field`).
- `base_updated_at` (o header `If-Match`) diverso dall'`updated_at` del server e `force` falso → **409**
  `{"error":{"code":"conflict",…},"current":Binder,"current_etag":"…"}`. La pagina mobile mostra "Modificato nel
  frattempo" → **Ricarica** oppure **Salva comunque** (`force:true`: si scrivono solo i campi del telefono, unione per campo).
- Il server scrive solo i campi presenti (unione per campo), mette `updated_at` = ora del server (sempre strettamente
  crescente) e salva la voce di registro con `at`, `details.base_updated_at`, `details.new_updated_at`,
  `details.forced`, `details.token_user` decisi da lui.

## 6. Archiviazione (schema SQLite di riferimento)

File `docmap.sqlite` nella cartella `data_dir` (consigliata **fuori** da `public_html`). WAL, `busy_timeout` 8 s.

```sql
records(type TEXT, id TEXT, updated_at TEXT, deleted INTEGER, who TEXT, payload BLOB, seq INTEGER,
        k_short TEXT, k_code TEXT, k_cab TEXT, PRIMARY KEY(type, id))      -- payload cifrato; k_* = indici HMAC
changes(seq INTEGER PRIMARY KEY AUTOINCREMENT, type, id, updated_at, at, device, who)   -- registro dei cambiamenti (pull incrementale)
settings_shared(key TEXT PRIMARY KEY, json BLOB, updated_at TEXT, seq INTEGER)          -- 'subset', cifrato
activity_log(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, at TEXT, payload BLOB)  -- cifrato
auth_fail(k TEXT PRIMARY KEY, n INTEGER, until INTEGER, at INTEGER)     -- blocco progressivo per IP
tokens(id, token_sha256 UNIQUE, user, role, created_at, created_by, revoked_at)          -- token creati dall'app
meta(k, v)                                                              -- key_check, schema, created_at
```

- **Cifratura a riposo**: AES-256-GCM (`openssl_encrypt`), chiave di 32 byte da `config.php` (`aes_key`, base64),
  IV casuale di 12 byte a ogni scrittura, tag di 16 byte; blob = `0x01 | iv | tag | testo cifrato`; AAD =
  `records/<type>/<id>`, `settings/subset`, `activity/<id>` (un blob non si sposta su un altro record).
  Senza chiave valida l'API **non parte** (500 `config`). `meta.key_check` rileva una chiave sbagliata.
- **Ricerche senza testo in chiaro**: `k_short = HMAC-SHA256(key, 'docmap-idx/'+short_code)`, `k_code` sul codice
  parlante maiuscolo, `k_cab` su stanza+armadio (per i `siblings`). In chiaro restano solo id, tempi, `who`, `deleted`.
- Un servizio Python può tenere lo schema che preferisce (PostgreSQL, cifratura del disco, KMS): conta il JSON delle
  rotte. Per migrare i dati: `pull?since=0` dal PHP → import nel nuovo database (o lettura diretta del file SQLite
  con la stessa chiave: formato del blob qui sopra).

## 7. Autenticazione e limiti

- Token di `config.php` (`tokens[]`: `user`, `role`, `token_sha256`, `disabled?`) + token del database (`tokens`, creati
  da un admin con `token_create`). Si salva **solo** lo SHA-256; confronto a tempo costante (`hash_equals`).
- Token errati: contatore per IP (`auth_fail`); dopo `max_fails` (5) blocco di `lock_seconds` (60 s) che raddoppia a
  ogni ulteriore errore, massimo 15 minuti → **429** con `Retry-After`, anche per un token giusto finché dura il blocco.
  Un token giusto azzera il contatore. Token mancante = 401 senza conteggio. Il client **non** riprova da solo dopo un 401
  (un telefono con token revocato bloccherebbe l'IP dell'ufficio).
- Come il front-end lega il token all'utente: vedi `SICUREZZA.md` §5b (token per dispositivo, cifrato nella cassaforte
  locale e sbloccato dal PIN di quel dispositivo).

## 8. Configurazione del client

```js
// docmap.config.js (generato da tools/build_deploy.py; --no-server = apiBase null)
window.DOCMAP_CONFIG = Object.freeze({ mode:'web', basePath:'/studio-de/', apiBase:'server-php/api.php', studioSlug:'studio-de', studioName:'' });
```

`dmProviders()`: `mode:'web'` + `apiBase` → `LocalAuthProvider` (cassaforte del dispositivo) + `RemoteDataProvider`
(questo contratto); `mode:'web'` senza `apiBase` → provider locali cifrati; `mode:'local'` → MVP da `file://`, con
sincronizzazione a richiesta verso il server (⚙ Sincronizzazione › Server online). `apiBase` deve essere un percorso del
sito, `https://…` o `http://127.0.0.1|localhost` (test). Se l'API sta su un'altra origine, aggiungerla a `connect-src`
nella CSP del `.htaccess` generato.

## 9. Estensioni previste (non ancora implementate)

- **Login centrale** (`mode:'remote'`, `RemoteAuthProvider`): `POST /v1/auth/token` (password Argon2id o OIDC
  Authorization Code + PKCE), token brevi + refresh, 2FA per `admin`, revoca immediata. Il token ottenuto si usa con le
  stesse rotte di questo contratto. Migrazione degli utenti locali: hash `pbkdf2_sha256$600000$<salt b64>$<hash b64>`
  (`hashlib.pbkdf2_hmac('sha256', secret.encode('utf-8'), base64.b64decode(salt), 600000, 32)`, segreto NFKC).
- **Allegati cifrati** (`BlobStore`): `POST blobs` (multipart: `meta` JSON `BlobMeta` + byte già cifrati dal client),
  `GET blobs&id=` (byte o URL firmato a scadenza breve), `GET blobs&owner_type=&owner_key=`, `POST blob_delete`.
  `BlobMeta = {id, owner_type, owner_key, name, content_type, size, orig_size, sha256, encrypted, envelope, policy:'working-copy', created_at}`.
  Politica: copia di lavoro ottimizzata (foto ≤ 1400 px JPEG, PDF ≤ 15 MB), **non** archiviazione a lungo termine.
  Oggi le foto degli armadi restano nel file SQLite di ogni PC e **non** viaggiano con il server.
- **Foto "Dov'è?" da telefono**: `GET cabinet_photo&binder=<id>` → `{url, mark:{x,y}|null, caption}`.
- **Risoluzione QR lato server**: `GET /studio-de/q/{short_code}` → `scan.html` registrando la scansione, senza dati
  prima del login (oggi lo fa il `.htaccess`).
