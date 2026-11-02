# DocMap — contratto API del database online condiviso

> Versione dell'app 26.12.1 (v12.1): `api` = `docmap-php`, `version` 1, `schema` 3.
> Nato con la v10.1; la v11 ha aggiunto ubicazioni e registro sincronizzazioni, la v12 il registro accessi (§11:
> rotte `access`, `last_seen`, `seen`, parametro `via`, `me.remember_minutes`). Solo campi e rotte in più, ignorati dai client vecchi.

> Stato: **contratto in produzione**. Implementazione di riferimento: `server-php/api.php` (un solo file, PHP 8.0+,
> PDO SQLite + OpenSSL, nessuna dipendenza) pensato per l'hosting condiviso SiteGround (PHP sì, Node/Python no).
> Un servizio Python (FastAPI o altro) può **sostituirlo 1:1**: stesse rotte, stessi JSON, stessi codici HTTP; il
> front-end non cambia (basta puntare `apiBase` al nuovo indirizzo). I nomi dei campi sono quelli di
> `MODELLO-DATI.md` e non vanno cambiati. Il client è in `assets/js/10-auth.js` (`DMServer`, `RemoteDataProvider`,
> `srvSetupDevice`) e `assets/js/06g-server.js` (sincronizzazione). Test eseguibili: blocco `// @@STREAM-W@@` di
> `tests/suite.js` (avvia `php -S` e prova ogni rotta).
> Versione formale: [`python/openapi.yaml`](python/openapi.yaml) (OpenAPI 3.1), regole interne per il porting in
> [`python/PORTING.md`](python/PORTING.md), JSON Schema dei record in [`python/SCHEMI.md`](python/SCHEMI.md).

## 1. Regole comuni

| Tema | Regola |
|---|---|
| Indirizzo | `apiBase` di `docmap.config.js`, relativo all'app (`server-php/api.php`) o assoluto `https://…`. Rotta nella query: `<apiBase>?r=<rotta>`. Un'implementazione Python può esporre lo stesso schema (`/api?r=pull`) o un proprio URL: conta solo `apiBase`. |
| Trasporto | **HTTPS** obbligatorio in produzione. JSON UTF-8. Letture con `GET` (accettano anche `POST`), scritture solo `POST`. |
| Token | Header **`X-DocMap-Token: <token>`** (principale). Alternative: `Authorization: Bearer <token>`; campo `"_token"` nel corpo JSON (richieste `text/plain` dal programma sul PC aperto da `file://`, per evitare il preflight CORS). **Perché non `Authorization`**: la protezione con password di SiteGround (HTTP Basic) occupa già quell'header e il browser lo invia da solo. |
| Ruoli | `viewer` (legge) < `editor` (scrive: push, patch) < `admin` (anche gestione token). |
| Errori | Sempre `{"error":{"code":"…","message":"…", …}}`; per 409 `current` e `current_etag` sia dentro `error` sia al primo livello. Nessun percorso del server né messaggio PHP nei testi. |
| Codici HTTP | 400 `bad_json` (corpo non è un oggetto JSON) / `invalid` · 401 `token_missing` / `token_invalid` · 403 `forbidden` (ruolo) / `origin` (CORS) · 404 `not_found` / `no_route` · 405 `method` (scrittura non in POST, metodo diverso da GET/POST) · 409 `conflict` · 413 `too_large` · 422 `invalid` / `field_not_allowed` / `invalid_location` · 429 `locked` + `Retry-After` · 500 `config` (configurazione mancante, messaggio chiaro) / `crypto` (cifratura fallita o chiave che non apre i blob) / `server_error` |
| Mappatura nel client | `DMError.code`: 401→`unauthorized`, 403→`forbidden`, 404→`not_found`, 409/412→`conflict`, 400/413/422→`invalid`, 429→`locked`, rete assente→`offline`, altro→`server` |
| Date | ISO 8601 UTC con millisecondi (`2026-11-01T10:12:44.120Z`). Confronto **come istante** (non come stringa). |
| Id | `id` creati dai client (UUID), mai riscritti. Tipi di record: `binder`, `client`, `location` (v11). |
| CORS | Predefinito: solo stessa origine. `allowed_origins` in `config.php` aggiunge origini; `'null'` = programma sul PC da `file://`. Metodi `GET, POST, OPTIONS`; header `Content-Type, X-DocMap-Token, Authorization, If-Match, X-DocMap-Device, X-DocMap-Device-Name, X-DocMap-App`; esposti `ETag, Retry-After`. |
| Dispositivo (v11) | Ogni chiamata del client v11 dichiara chi è: header `X-DocMap-Device: <deviceId>`, `X-DocMap-Device-Name: <nome, URI-encoded>`, `X-DocMap-App: <APP_VERSION>`, oppure nel corpo `text/plain` `"_device":{"id","name","app"}`. Facoltativo: un client v10.1 non lo manda e il registro scrive `unknown` (il `push` usa ancora `deviceId` del corpo). Serve solo al registro (§10), mai all'autorizzazione. |

## 2. Rotte

| Rotta | Metodo | Ruolo | Richiesta | Risposta 200 |
|---|---|---|---|---|
| `ping` | GET | nessuno | – | `{"ok":true,"api":"docmap-php","version":1,"schema":3,"features":["journal","device_info","locations","archives","access_log","status_events"],"server_time":"…","php":"8.3"}` (funziona anche senza `config.php`; serve all'avviso di orologio sfasato) |
| `me` | GET | viewer | – | `{"user":"mario","role":"editor","token_id":"cfg:1","studio_name":"…","server_time":"…","remember_minutes":null}` (v12: `remember_minutes` di `config.php`, §11) |
| `pull` | GET | viewer | `since=<seq>` (0 = tutto) · `log_since=<seq>` | vedi §3 |
| `push` | POST | editor | vedi §4 | `{"applied":n,"same":n,"rejected":[…],"settings_applied":bool,"logged":n,"seq":n,"server_time":"…"}` |
| `binder` | GET | viewer | `qr=<short_code>` oppure `code=<speaking_code>` (maiuscole/minuscole indifferenti) · v12: `via` (§11) | `{"binder":Binder,"etag":"<updated_at>","siblings":[Sibling]}` + header `ETag` · 404 |
| `location` | GET | viewer | v11: `qr=<dm26L…>` oppure `id=<uuid>` oppure `code=<codice percorso>` · v12: `via` | `{"location":Location,"etag":"<updated_at>","path":[Brief],"children":[Brief],"binders":[BinderBrief],"count":n}` · v12.1: anche `"nested_binders":[BinderBrief + location_id, location_code],"nested_count":n` (faldoni delle ubicazioni annidate sotto questa; `binders` resta "direttamente qui") · 404 |
| `resolve` | GET | viewer | v11: `qr=<short_code>` di qualsiasi tipo · v12: `via` | `{"type":"location", …come location}` oppure `{"type":"binder", …come binder}` · 404 |
| `patch` | POST | editor | vedi §5 | `{"binder":Binder,"etag":"<nuovo updated_at>"}` + `ETag` · 409 · 422 |
| `tokens` | GET | admin | – | `{"items":[{"id":"cfg:0"|"db:…","user","role","source":"config"|"database","created_at"?,"revoked_at"}]}` |
| `token_create` | POST | admin | `{"user":"…","role":"editor"}` | `{"id":"db:…","user","role","token":"<in chiaro, mostrato una volta>"}` |
| `token_revoke` | POST | admin | `{"id":"db:…"}` | `{"ok":true}` (i token di `config.php` si disattivano con `'disabled' => true`) |
| `journal` (v11) | GET | editor (solo le proprie voci) · admin (tutte) | filtri, vedi §10 | `{"items":[Entry],"more":bool,"next_before":jid|null,"server_time":"…"}` · viewer → 403 |
| `journal_restore` (v11) | POST | admin | `{"jid":n,"n":n,"version":"prev"|"new"}` | `{"ok":true,"type","id","updated_at","deleted":bool,"journal_id":n,"seq":n}` |
| `access` (v12) | GET | editor (solo le proprie righe) · admin (tutte, con IP) | filtri, vedi §11 | `{"items":[AccessItem],"more":bool,"next_before":aid|null,"server_time":"…"}` · viewer → 403 |
| `last_seen` (v12) | GET | viewer | `type=binder|location` + `id=<id>` oppure `code=<codice>`, `limit` (5, max 20) | `{"items":[{"at","user","via","route","device_name"}],"total":n,"server_time":"…"}` · 400 senza id/code |
| `seen` (v12) | POST | viewer | `{"items":[{"type":"binder","id","code","at","via"}]}` (max 500) | `{"recorded":n,"skipped":n,"server_time":"…"}` · 413 oltre 500 |

Campi aggiunti in v11 (un client v10.1 li ignora): `ping` → `"schema":2,"features":[…]` (v11: `journal`, `device_info`, `locations`; v12: `archives`, `access_log` e schema 3);
`push` e `pull` → `"journal_id":n|null` (voce del registro scritta da quella chiamata); `patch` → `"journal_id"` e
`"hash"` (SHA-256 canonico della versione salvata).

Campi aggiunti in v12 (un client precedente li ignora): `ping` → `"status_events"` in `features`; `binder` e `location`
→ `status_events` e `status_types` (§11).

`Binder` = l'oggetto di `MODELLO-DATI.md` §1 così come lo invia il client (più `id`, `updated_at`); `Sibling` =
`{speaking_code, shelf_code, sector_code, location_code}` degli altri faldoni dello **stesso armadio** (stanza+armadio).

**v11 — ubicazioni.** `Location` = l'oggetto di `MODELLO-DATI.md` §14.1; `Brief` = `{id, code, name, kind, seg, level}`
(`path` = antenati dalla radice, senza il nodo stesso; `children` = figli diretti); `BinderBrief` =
`{id, speaking_code, company_name, binder_title, color_hex, short_code}` dei faldoni con `location_id` = quell'ubicazione
(al massimo 500, `count` = totale). Il server trova un'ubicazione con gli stessi indici HMAC dei faldoni
(`k_short` sul `short_code`, `k_code` sul codice percorso): **nessuna modifica di schema**.

**Risoluzione di `/q/<code>`** (rewrite verso `scan.html`, poi la pagina decide): `dm26L` + 8 caratteri = ubicazione
(`LOC_SC_RE`), qualsiasi altro codice = faldone. `scan.html` chiama `location` o `binder` di conseguenza; `resolve` fa
lo stesso in una chiamata sola per altri client (es. Python).

## 3. `pull` — cambiamenti incrementali

```json
{"seq": 42, "more": false,
 "records": [{"type":"binder","id":"…","updated_at":"…","who":"mario","data":{ /* Binder completo */ }}],
 "tombstones": [{"type":"binder","id":"…","code":"BL2","deletedAt":"…","who":"Davide"}],
 "settings": {"updated_at":"…","data":{"studioName":"…","destTemplate":"…","catColors":{},"colorMode":"…","catFamilies":{},"colorRules":{},"colorUpdatedAt":"…","locLevels":[…],"locLevelsAt":"…"}} | null,
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
  notes, tags` e, dalla v11, `location_id, location_code`; qualsiasi altro → **422** `field_not_allowed` (`field`).
- v11 (modalità associazione): `location_id` deve essere `''` (togli) o l'id di un'ubicazione viva, altrimenti **422**
  `invalid_location`; con un id valido il server **ricalcola** `location_code` dal record dell'ubicazione. `location_code`
  da solo (senza `location_id`) → **422** `field_not_allowed`. Con `location_id:''` il `location_code` inviato (testo di
  stanza/armadio) resta. La voce di registro del telefono ha `action:'binder.locate'` e
  `details:{from:{id,code}, to:{id,code}, via:'phone'|'phone-camera'|'phone-typed'|'undo', device, user}`.
  Il telefono usa `force:true`: la patch tocca solo i campi di ubicazione e il server li unisce al record corrente.
- Un telefono v10.1 (senza questi campi) continua a funzionare uguale.
- `base_updated_at` (o header `If-Match`) diverso dall'`updated_at` del server e `force` falso → **409**
  `{"error":{"code":"conflict","message":…,"current":Binder,"current_etag":"…"},"current":Binder,"current_etag":"…"}`. La pagina mobile mostra "Modificato nel
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
meta(k, v)                                                              -- key_check, schema, created_at, migrated_2_at, migrated_3_at, journal_pruned_at, access_pruned_at
-- v11 (schema 2, creato da db_migrate all'avvio su un database v10.1: solo tabelle nuove, nessun dato toccato)
sync_journal(jid INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, route TEXT, token_id TEXT, role TEXT, k_user TEXT, k_device TEXT,
             n_sent, n_accepted, n_rejected, n_conflicts, n_same, n_items INTEGER, seq_from, seq_to INTEGER, meta BLOB)
             -- meta cifrato (AAD journal/<jid>): {user, device_id, device_name, app_version, operator, ip, extra}
sync_journal_items(jid INTEGER, n INTEGER, type TEXT, id TEXT, k_code TEXT, action TEXT, client_updated_at TEXT,
             prev_updated_at TEXT, new_updated_at TEXT, prev_hash TEXT, new_hash TEXT, payload BLOB, PRIMARY KEY(jid, n))
             -- payload cifrato (AAD journal/<jid>/<n>): {code, reason, prev, new, extra} = versioni complete prima/dopo
-- v12 (schema 3, passo 3 di db_migrate: una tabella nuova, nessun dato toccato; da un database v10.1 si passa 1 → 2 → 3 alla prima richiesta)
access_log(aid INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, received_at TEXT, route TEXT, via TEXT, token_id TEXT, role TEXT,
           k_user TEXT, k_device TEXT, target_type TEXT, target_id TEXT, k_code TEXT, meta BLOB)
           -- indici su at, (target_type, target_id, at), k_user, k_device; meta cifrato (AAD access/<aid>):
           -- {user, device_id, device_name, app_version, code, ip}
```

- **Cifratura a riposo**: AES-256-GCM (`openssl_encrypt`), chiave di 32 byte da `config.php` (`aes_key`, base64),
  IV casuale di 12 byte a ogni scrittura, tag di 16 byte; blob = `0x01 | iv | tag | testo cifrato`; AAD =
  `records/<type>/<id>`, `settings/subset`, `activity/<id>`, `journal/<jid>`, `journal/<jid>/<n>`, `access/<aid>` (un blob non si sposta su un altro record).
  Senza chiave valida l'API **non parte** (500 `config`). `meta.key_check` rileva una chiave sbagliata.
- **Ricerche senza testo in chiaro**: `k_short = HMAC-SHA256(key, 'docmap-idx/'+short_code)` in esadecimale, **primi 40
  caratteri**; `k_code` sul codice parlante maiuscolo e senza spazi ai bordi (per le ubicazioni il codice percorso),
  `k_cab` su `room_code + "\x1f" + cabinet_code` (per i `siblings`). Dettagli e codice Python in `python/PORTING.md` §3. In chiaro restano solo id, tempi, `who`, `deleted`.
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
- **Associazione offline dal telefono**: oggi la modalità associazione sul telefono richiede la rete (una chiamata per scansione); un futuro `POST locate_batch` potrebbe accettare una coda di assegnazioni.
- **Risoluzione QR lato server**: `GET /studio-de/q/{short_code}` → `scan.html` registrando la scansione, senza dati
  prima del login (oggi lo fa il `.htaccess`).

## 10. v11 — registro sincronizzazioni (`journal`, `journal_restore`)

Il server scrive **una voce** (`sync_journal`) per ogni `push`, ogni `patch` (anche la 409: la voce viene salvata
prima della risposta di errore), ogni `pull` con dei cambiamenti (`journal_pulls` di `config.php`: `'changes'`
predefinito = pull che restituiscono qualcosa o pull completi, `'all'`, `'none'`) e ogni `journal_restore`; e **un
elemento** (`sync_journal_items`) per ogni record toccato, nella stessa transazione della scrittura.

| `action` dell'elemento | Quando |
|---|---|
| `create` / `update` | push accettato (`reason:"resurrect"` se il record era eliminato); `patch` riuscita (`reason:"forced"` con `force`); impostazioni condivise (`type:"settings"`, `id:"subset"`) |
| `delete` | tombstone accettata |
| `conflict` | push a parità di ora con contenuto diverso (`reason:"tie"` / `"tie_delete"`); `patch` con base vecchia (`reason:"stale_base"`, 409) |
| `rejected-older` | push più vecchio (`reason:"older"` / `"older_delete"`) |
| `rejected-invalid` | push non valido (`reason:"invalid"` / `"too_large"`) |
| `pull` / `pull-delete` | ciò che il dispositivo ha ricevuto (solo hash, senza versioni) |
| `restore` | `journal_restore` |

I record con contenuto identico (`same`) si contano soltanto (`counts.same`). Per ogni elemento: `client_updated_at`
(ora dichiarata dal client), `prev_updated_at` / `new_updated_at` (sul server prima/dopo), `prev_hash` / `new_hash`
(SHA-256 del JSON canonico di `canon()`; tombstone = `sha256("deleted:<type>/<id>@<deletedAt>")`) e, cifrate,
le **versioni complete** `prev` / `new`.

**`GET ?r=journal`** — parametri facoltativi: `from`, `to` (ISO; una data `AAAA-MM-GG` in `to` vale fino a fine
giornata), `user` (solo admin: un editor vede sempre e solo le proprie voci), `device` (id esatto), `route`
(`push`|`pull`|`patch`|`journal_restore`), `record` (id), `code` (codice esatto, maiuscole indifferenti, via indice
HMAC), `limit` (50, massimo 200), `before` (paginazione: `next_before` della pagina precedente), `entry` (una voce,
con le versioni `prev` / `new` di ogni record). Ordine: dalla più recente.

```json
{"items":[{"jid":12,"at":"…","route":"push","token_id":"cfg:1","role":"editor","user":"mario",
  "device":{"id":"dev-…","name":"PC segreteria","app":"26.11.0"},"operator":"Mario","extra":{…},
  "counts":{"sent":3,"accepted":2,"rejected":1,"conflicts":0,"same":0},"items_total":3,"seq_from":40,"seq_to":42,
  "ip":"…" /* solo admin */,
  "records":[{"n":1,"type":"binder","id":"…","code":"BL2","action":"update","reason":"","client_updated_at":"…",
    "prev_updated_at":"…","new_updated_at":"…","prev_hash":"…","new_hash":"…" /* + prev, new, extra con entry= */}]}],
 "more":false,"next_before":null,"server_time":"…"}
```

**`POST ?r=journal_restore`** (admin) `{"jid","n","version":"prev"|"new"}`: riscrive quella versione del record come
**nuova** scrittura con `updated_at = max(ora del server, updated_at attuale + 1 ms)`, quindi vince al prossimo pull di
ogni client. Una versione vuota (il record non esisteva / era eliminato) diventa una tombstone. Scrive una voce
`journal_restore` con `extra.source = {jid, n, version}` e una riga `sync.restore` nel registro attività. 422 se
l'elemento non ha una versione (`pull`, `pull-delete`, `rejected-invalid`) o il tipo non è di `DM_TYPES`.

**Conservazione**: `journal_keep_days` in `config.php` (0 = per sempre, predefinito); la potatura gira al massimo una
volta al giorno e toglie le voci più vecchie con i loro elementi. **Compatibilità**: un database v10.1 riceve le due
tabelle al primo avvio dell'API v11 (`meta.schema` 1 → 2); un client v10.1 continua a funzionare (i campi nuovi
delle risposte sono ignorati, il dispositivo risulta `unknown`).

## 11. v12 — registro accessi (`access`, `last_seen`, `seen`) e accesso senza PIN

**Cosa si registra.** Una riga di `access_log` per ogni lettura riuscita di `binder`, `location` e `resolve` (una
404 non scrive nulla) e per ogni elemento valido di `seen`. La stessa persona (token), dallo stesso dispositivo, sullo
stesso record e nello stesso modo (`via`) entro `access_dedupe_seconds` (120) = **una riga sola** (un telefono che
ricarica la pagina non riempie il registro). Utente, dispositivo, codice e IP sono cifrati in `meta`; i filtri passano
dagli indici HMAC `k_user` (`'user/' + utente minuscolo`), `k_device` (`'device/' + id`), `k_code` (codice maiuscolo).
La scrittura del registro non fa **mai** fallire la lettura.

**Parametro `via`** di `binder` / `location` / `resolve`: come il client è arrivato al record — `qr` (predefinito),
`search` (predefinito per `binder` senza `qr`), `nav` (dalla scheda / dall'elenco), `nfc` (riservato al tag NFC dello
stream C). Un valore sconosciuto vale il predefinito. Il telefono lo manda da `SC.via` (`'search'` quando il faldone è
aperto dalla schermata Cerca, `'nfc'` quando lo imposta il lettore NFC).

**`GET ?r=access`** (editor: solo le proprie righe; admin: tutte, con `ip`) — filtri facoltativi: `from`, `to` (ISO;
`AAAA-MM-GG` in `to` vale fino a fine giornata), `user` (solo admin), `device` (id esatto), `type` (`binder`|`location`,
422 altrimenti), `target` (alias `id`), `code`, `via`, `route` (`binder`|`location`|`resolve`|`seen`), `limit` (50,
massimo 200), `before` (paginazione con `next_before`). Ordine: dalla riga più recente (`aid` decrescente).

```json
{"items":[{"aid":41,"at":"…","received_at":"…","route":"binder","via":"qr","role":"viewer","token_id":"db:…","user":"lucia",
  "device":{"id":"dev-…","name":"Telefono Lucia","app":"26.12.0"},"target":{"type":"binder","id":"…","code":"BL2"},
  "ip":"…" /* solo admin */}],"more":false,"next_before":null,"server_time":"…"}
```

**`GET ?r=last_seen`** (qualsiasi ruolo): gli ultimi accessi a **un** record, per la scheda («Visto di recente» sul
telefono, «Chi l'ha visto» sul PC): `type` (predefinito `binder`), `id` (alias `target`) oppure `code`, `limit` (5,
massimo 20). Risposta: `items` (`at`, `user`, `via`, `route`, `device_name`, dal più recente) e `total` (tutte le righe
di quel record). Senza IP né id di token: è pensata per essere mostrata a tutti.

**`POST ?r=seen`** (qualsiasi ruolo): visite che il client ha servito **dalla propria copia** (programma sul PC,
telefono senza rete) e manda più tardi. Al massimo 500 elementi (413 `too_large`), `items` obbligatorio (400). Un
elemento con `type` o `id` non validi, `at` nel futuro (oltre 5 minuti) o più vecchio di `access_keep_days` è
saltato (`skipped`). Lo stesso elemento rimandato (stesso token, dispositivo e record, `at` entro
`access_dedupe_seconds`) è registrato una volta sola. `via` predefinito `nav`. Il client manda la coda
(`docmap_v26_seen_queue`, al massimo 500) dopo ogni sincronizzazione e quando torna la rete; una risposta 400 / 403 /
404 (server v11 senza la rotta) scarta la coda senza riprovare.

**Configurazione (`config.php`)**: `access_keep_days` (365; 0 = per sempre; la potatura gira al massimo una volta al
giorno), `access_dedupe_seconds` (120; 0 = ogni lettura), `remember_minutes` (`null` = decide il dispositivo; `0` = PIN
a ogni apertura; `480` = 8 ore; `43200` = 30 giorni; `-1` = finché non si esce o il token viene revocato): minuti di
**inattività** dopo cui il telefono richiede di nuovo il PIN, restituito da `me` e applicato dal client (vedi
`SICUREZZA.md` §5d).

**Compatibilità**: il primo avvio dell'API v12 aggiunge la tabella (`meta.schema` 2 → 3, oppure 1 → 2 → 3 da un
database v10.1), senza toccare i dati. Un client v11 continua a funzionare (non manda `via` né `seen`; le sue letture
sono registrate come `qr` / `search`). Un client v12 su un server v11 riceve 404 `no_route` su `access` / `last_seen` /
`seen` e nasconde i pannelli (`features` senza `access_log`).

## 12. v12 — stati (preso, reinserito, dato al Comune…): record `status_event`

Nessuna nuova rotta e nessuna migrazione del server: i movimenti di stato sono **record del tipo `status_event`**
(aggiunto a `DM_TYPES`) nella tabella `records`, scritti con `push` come gli altri e restituiti da `pull`.
`StatusEvent` = l'oggetto di `MODELLO-DATI.md` §17.2 (schema `docs/python/schema/status_event.schema.json`);
`updated_at` del record = `at` dell'evento. Un evento **non cambia mai** (append-only, un annullamento è un nuovo evento
con `undo_of`), quindi lo stesso id arriva sempre con lo stesso contenuto (`same`).

- **Indici HMAC**: `k_short = HMAC('st/b/<binder id>')` (anche per i documenti del faldone) oppure `HMAC('st/l/<location id>')`;
  `k_code = HMAC('stbox/<box_id>')` quando il movimento è passato da una scatola. Il payload resta cifrato come ogni record.
- **`binder`** aggiunge `status_events` (gli ultimi 200 del faldone e dei suoi documenti, in ordine cronologico) e
  `status_types` (la chiave `statusTypes` delle impostazioni condivise, `null` = stati predefiniti).
- **`location`** aggiunge `status_events` della scatola, dei faldoni che contiene e di quelli usciti con lei (`box_id`),
  al massimo 2000, e `status_types`: il telefono ci costruisce la **Verifica rientro**.
- **Telefono** (`scan.html`): un tocco = `push` con `records:[{type:"status_event",…}]` e una voce di registro
  `activity_log` (`action` `status.set` · `status.box` · `status.verify` · `status.undo`, `source:"mobile"`,
  `details.events` = gli eventi). Un server **precedente** risponde `rejected` `invalid` per i record ma conserva la voce
  di registro: i PC v12 ricavano gli eventi da `details.events` al `pull` del registro, e non mandano record
  `status_event` a un server il cui `ping` non elenca `status_events`.

## 13. v12.1 — scatole annidate nella risposta `location`

- `location` aggiunge due campi, **solo in più** (un client v12 li ignora): `nested_binders` (fino a 1000, ordinati per
  `location_code` e codice parlante; ogni elemento è un BinderBrief con `location_id` e `location_code`) e `nested_count`.
  Contengono i faldoni di **tutte** le ubicazioni sotto quella richiesta (scaffale › scatole, armadio › scansie › scatole),
  esclusa lei stessa; `binders` / `count` restano i faldoni messi direttamente lì.
- Gli eventi `status_events` della risposta comprendono anche i faldoni annidati.
- Il telefono applica "tutta la scatola" e la Verifica rientro a `binders` + `nested_binders`; il PC fa lo stesso con
  `sqBoxBinders` (06j-status.js). Nessun cambio di schema del server (resta 3) né delle feature del ping.

