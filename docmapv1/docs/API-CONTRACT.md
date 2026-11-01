# DocMap — contratto REST per il back-end Python (v10)

> Stato: **contratto di riferimento**. Il front-end MVP lo implementa già lato client nelle classi
> `RemoteAuthProvider` e `RemoteDataProvider` (`assets/js/10-auth.js`), che oggi **non vengono mai usate**:
> si attivano con `docmap.config.js` → `{mode:'web', apiBase:'https://…'}` (oppure `mode:'remote'`).
> I nomi dei campi sono quelli di `MODELLO-DATI.md` e non vanno cambiati. Il progetto generale dell'hub è in
> `HUB-E-API.md`; questo file fissa solo ciò che serve alla pagina mobile e al login.

## 1. Regole comuni

| Tema | Regola |
|---|---|
| Base | `{apiBase}/v1/…` (es. `https://docmap.pr-it.it/api/v1`). Solo **HTTPS**. JSON UTF-8. |
| Autenticazione | `Authorization: Bearer <access_token>` su tutte le rotte tranne `/v1/auth/*` e `/v1/public/*`. |
| Concorrenza | Ogni faldone ha un **ETag** = `"<version>"` (intero del server) o, in mancanza, `updated_at`. Le scritture mandano `If-Match: <etag>`; se il record è cambiato → **412** con il record corrente. |
| Errori | Corpo sempre `{"error": {"code": "…", "message": "…", "field": "…?", "current": {…}?, "current_etag": "…"?}}` |
| Codici HTTP | 400 richiesta malformata · 401 token mancante/scaduto · 403 ruolo insufficiente · 404 non trovato · 409/412 conflitto · 422 validazione · 429 troppi tentativi (`Retry-After` in secondi) · 5xx errore server |
| Mappatura nel client | `DMError.code`: 401→`unauthorized`, 403→`forbidden`, 404→`not_found`, 409/412→`conflict`, 422→`invalid`, 429→`locked`, rete assente→`offline` |
| Date | ISO 8601 UTC (`2026-11-01T10:12:44.120Z`). `updated_at` lo decide **il server** a ogni scrittura. |
| Id | `id` UUID creati dal client, mai riscritti. `short_code` globale e immutabile (è stampato sul QR). |

## 2. Autenticazione (`AuthProvider`)

Il client chiama:

| Metodo | Percorso | Corpo | Risposta |
|---|---|---|---|
| POST | `/v1/auth/token` | `{"grant_type":"password","username":"…","password":"…"}` | `200 {"access_token","token_type":"Bearer","expires_in":3600,"refresh_token"?, "user":{"id","username","display_name","role"}}` · `401` credenziali errate · `429` con `Retry-After` |
| POST | `/v1/auth/logout` | – | `204` (revoca il token) |
| GET | `/v1/me` | – | `{"user":{…}, "features":{…}}` |
| POST | `/v1/auth/refresh` | `{"refresh_token"}` | come `/token` (facoltativo) |

- Ruoli usati dal front-end: `viewer` (sola lettura), `editor` (modifica da mobile), `admin` (anche utenti). L'hub può
  averne di più (`HUB-E-API.md` §3): il server traduce verso questi tre nel campo `user.role`.
- **Consigliato**: OIDC (Authorization Code + PKCE) con un IdP (Keycloak, Entra ID, Google Workspace…). In quel caso
  `/v1/auth/token` resta come scambio codice→token del proprio back-end e `RemoteAuthProvider.login()` va sostituito
  con il redirect OIDC: l'interfaccia (`login · logout · currentUser · getToken · onChange · can`) non cambia.
- Il server deve: hash Argon2id (o PBKDF2 ≥ 600 000), blocco progressivo per utente **e** per IP, 2FA per `admin`,
  token brevi (≤ 1 h) + refresh ruotati, revoca immediata, audit di ogni login (riuscito o no).
- Migrazione degli utenti locali dell'MVP: formato `pbkdf2_sha256$600000$<salt b64>$<hash b64>`
  (`hashlib.pbkdf2_hmac('sha256', secret.encode('utf-8'), base64.b64decode(salt), 600000, 32)`, segreto
  normalizzato NFKC). Si possono importare e far rigenerare al primo login.

## 3. Faldoni per la pagina mobile (`DataProvider`)

| Metodo | Percorso | Uso | Risposta |
|---|---|---|---|
| GET | `/v1/public/context` | nome dello studio mostrato **prima** del login (nessun dato di faldoni) | `{"studioName":"…","lang":"it"}` |
| GET | `/v1/binders/by-short/{short_code}` | QR scansionato | `200 {"binder":Binder,"siblings":[Sibling]}` + `ETag` · `404` |
| GET | `/v1/binders/by-code/{speaking_code}` | ricerca manuale | come sopra |
| PATCH | `/v1/binders/{id}` | modifica da mobile | vedi sotto |
| GET | `/v1/binders/{id}/cabinet-photo` | "Dov'è?" | `{"url":"<URL firmato, scade in 5 min>","mark":{"x":0.7,"y":0.4}|null,"caption":"…"}` · `404` |
| GET | `/v1/activity?target_id={id}&limit=20` | ultime modifiche | `{"items":[ActivityEntry]}` (forma di `MODELLO-DATI.md` §7.2) |

`Binder` = esattamente l'oggetto di `MODELLO-DATI.md` (come `normalizeBinder`), con `contents_items` array di
`{year, description, status}`; il server può aggiungere `version`, `tenant_id`, `deleted_at`.
`Sibling` = `{speaking_code, shelf_code, sector_code, location_code}` degli altri faldoni dello **stesso armadio**
(serve alle "posizioni rapide"); il server li filtra per i permessi dell'utente.

### PATCH `/v1/binders/{id}`

```http
PATCH /v1/binders/8d0c2f0e-… HTTP/1.1
Authorization: Bearer eyJ…
If-Match: "12"
Content-Type: application/json

{"patch": {"archive_state": "CHECKED_OUT",
           "contents_items": [{"year":"2025","description":"Fatture Acquisto Q1-Q4","status":"client"}],
           "room_code": "B", "cabinet_code": "2", "shelf_code": "γ", "sector_code": "DX",
           "notes": "Portato in sala riunioni", "tags": "iva,fatture"},
 "source": "mobile"}
```

- Campi ammessi da mobile (`MOBILE_FIELDS`): `archive_state, contents_items, room_code, cabinet_code, shelf_code,
  sector_code, notes, tags`. Qualsiasi altro campo → `422 {"error":{"code":"field_not_allowed","field":"…"}}`.
  Il server ricalcola `location_code` (`computeLocation`) e normalizza come `normalizeBinder`.
- Solo i campi presenti in `patch` vengono scritti (merge per campo, mai sostituzione del record).
- `200 {"binder": Binder}` + nuovo `ETag`.
- `412 {"error":{"code":"conflict","current":Binder,"current_etag":"\"13\""}}` se `If-Match` non corrisponde.
  La pagina mobile mostra "Modificato nel frattempo" e lascia scegliere: **Ricarica** oppure **Salva comunque**
  (nuovo PATCH senza `If-Match`, consentito solo a `editor`/`admin`; il server lo registra con `forced:true`).
- Ogni PATCH riuscito crea una riga di audit: `{action:"binder.edit", source:"mobile", who:<user_id>,
  details:{changed:{campo:[prima,dopo]}, base_etag, new_etag, forced}}` — la stessa forma che l'MVP scrive oggi
  in locale (`10-auth.js`, `LocalDataProvider.saveBinderPatch`).
- `403` se il ruolo è `viewer`.

### Offline

Se la rete manca, la pagina mobile mette la modifica in coda (`localStorage 'docmap_v26_scan_outbox'`:
`[{id, binder_id, patch, etag, at}]`) e la rimanda all'evento `online` con lo stesso `If-Match`. Un `412` in quel
momento viene scartato (vince il server) e l'utente lo vede alla prossima apertura.

## 4. Allegati cifrati (`BlobStore`)

| Metodo | Percorso | Corpo / risposta |
|---|---|---|
| POST | `/v1/blobs` | `multipart/form-data`: `meta` (JSON `BlobMeta` senza `id`) + `data` (byte **già cifrati** dal client se `encrypted:true`) → `201 {"id","url"?}` |
| GET | `/v1/blobs/{id}` | `302` verso URL firmato a scadenza breve, oppure i byte con `Content-Type: application/octet-stream` |
| GET | `/v1/blobs?owner_type=&owner_key=` | `{"items":[BlobMeta]}` |
| DELETE | `/v1/blobs/{id}` | `204` |

`BlobMeta = {id, owner_type:'binder'|'cabinet'|'client'|…, owner_key, name, content_type, size, orig_size, sha256,
encrypted, envelope:{v,alg:'A256GCM',kw:'A256KW',kid,iv,wrapped_dek}|null, policy:'working-copy', created_at}`.
Politica: copia di lavoro ottimizzata per la **manutenzione tecnica e funzionale, non per l'archiviazione a lungo
termine** (foto ≤ 1400 px JPEG, PDF ≤ 15 MB, altri ≤ 10 MB). Lato server: object storage cifrato (SSE-KMS) **in più**
della cifratura del client, chiavi per tenant, mai file con nome leggibile su disco. Dettagli in `SICUREZZA.md` §4.

## 5. Risoluzione dei QR

`https://qr7.it/{short_code}` → 302 → destinazione finale. Predefinita (v10):
`https://docmap.pr-it.it/studio-de/q/{short_code}` (`DEFAULT_DEST` in `02-core.js`). La pagina `scan.html` legge il codice da
`…/q/{short_code}` (riscrittura del server), `?q=`, `?qr=`, `#/q/` e `?code=` (codice parlante). Con il back-end
la stessa URL può essere servita da FastAPI (`GET /studio-de/q/{short_code}` → `scan.html`), registrando la scansione
(`HUB-E-API.md` §5) **senza** mostrare dati prima del login.

## 6. Configurazione del client

```js
// docmap.config.js (caricato per primo da index.html e scan.html)
window.DOCMAP_CONFIG = { mode:'web', basePath:'/studio-de/', apiBase:'https://docmap.pr-it.it/api', studioSlug:'studio-de', studioName:'Studio …' };
```

`dmProviders()` sceglie: `apiBase` presente → `RemoteAuthProvider` + `RemoteDataProvider`; altrimenti provider
locali (in `mode:'web'` con la cassaforte cifrata `DocMapVault`). CORS: se l'API è su un'altra origine, consentire
solo l'origine dell'app, metodi `GET, POST, PATCH, DELETE`, header `Authorization, Content-Type, If-Match`, esporre `ETag`.
Ricordarsi di aggiungere l'origine dell'API a `connect-src` nella CSP (`.htaccess` generato da `tools/build_deploy.py`).
