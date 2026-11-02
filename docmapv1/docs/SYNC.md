# DocMap 2026 — Sincronizzazione: pacchetti manuali (v10), database online condiviso (v10.1), registro (v11)

Codice: `assets/js/06f-sync.js` (pacchetti), `06g-server.js` (server), `06i-journal.js` (registro) · Test: blocchi
`// @@STREAM-S@@`, `// @@STREAM-W@@`, `// @@STREAM-J@@` in `tests/suite.js` · Aiuto in app: argomento `sync` · JSON Schema del
pacchetto: [`python/schema/sync_package.schema.json`](python/schema/sync_package.schema.json). Versione dell'app: 26.11.1.

> Le sezioni 1–6 descrivono i **pacchetti a file** (nati con la v10, ancora validi come piano B offline). Dalla v10.1
> c'è anche il database online condiviso (§7), dalla v11 le ubicazioni (§7b) e il registro (§9–10).

DocMap gira in due posti:

- **client locale**: `index.html` aperto con doppio clic (`file://`), dati nel browser del PC;
- **web app**: copia statica pubblicata su `https://docmap.pr-it.it/studio-de/`; il server contiene solo il codice, i dati stanno (cifrati) nel browser di chi la usa.

Le due copie dei dati si allineano **a mano**, con un file: *⚙ Funzioni avanzate › Sincronizzazione*.

| Lato | Pulsante export | Pulsante import |
|------|-----------------|-----------------|
| client locale | **Copia export per web app** | **Importa dati dalla web app** |
| web app | **Esporta per il client locale** | **Importa dati da client locale** |

La modalità si riconosce da sola (`syncMode()`): `file://`, `localhost` e `127.0.0.1` = `local`, qualsiasi altro host = `web`. La copia web può forzarla con `window.DM_CONFIG = {mode:'web'}` (o `'local'`) caricato prima degli script.

## 1. Regola di fusione

- Unità di fusione = **record** (faldone o cliente, chiave `id`), non il singolo campo.
- **Vince l'`updated_at` più recente** (stringa ISO confrontata come istante, `Date.parse`). È la regola di Dave: «se faccio una modifica in locale, poi online, poi altre due in locale, vince l'ultima in ordine di tempo».
- Contenuto identico (stessi campi, esclusi `updated_at`, `short_url`, `location_code`, `selected_for_print`) = **invariato**, qualunque sia l'ora.
- Stessa ora ma contenuto diverso = **conflitto** (proposta: tieni locale).
- Record cambiato **da entrambe le parti dopo l'ultima sincronizzazione con quel dispositivo** = **conflitto** (proposta: il più recente). Senza una sincronizzazione precedente con quel dispositivo non c'è base: vale solo la regola del più recente.
- **Eliminazione contro modifica**: se l'altra parte ha eliminato il record ma qui è stato modificato *dopo* l'eliminazione → conflitto, proposta *tieni locale* (il record resta ed è segnalato). Se qui era stato eliminato e dall'altra parte modificato dopo → conflitto, proposta *tieni importato* (il record torna). Eliminazione più recente della modifica → il record viene eliminato.
- `selected_for_print` (coda di stampa) resta quello locale quando un record viene aggiornato.
- Quando scegli *tieni locale* per un record più vecchio (o di pari ora) di quello importato, il suo `updated_at` diventa "adesso", così alla prossima sincronizzazione vince anche dall'altra parte.

L'ordine dipende dagli orologi dei dispositivi: se il pacchetto risulta esportato più di 5 minuti "nel futuro" la revisione lo segnala.

## 2. Tracciamento delle modifiche

`syncTrack()` gira dentro ogni `persist()` (wrapper installato da 06f) e confronta ogni record con la fotografia del salvataggio precedente:

- contenuto cambiato ma `updated_at` uguale → `updated_at = adesso` (copre ogni percorso: scheda, modifica massiva, Informazioni, import, patch da mobile, codice futuro);
- `id` sparito → **tombstone** `{type:'binder'|'client', id, code, deletedAt, who}` in `S.tombstones`;
- `id` ricomparso → la sua tombstone viene tolta;
- i clienti nuovi senza `updated_at` lo ricevono.

`SYNC.quiet = true` fa solo riallineare la fotografia al prossimo salvataggio (usato dall'applicazione di un pacchetto, che porta i tempi dell'altra parte, e da **Annulla**).
L'import "unisci" (CSV/JSON) non riporta mai indietro `updated_at`: contenuto invariato → resta l'ora attuale; contenuto cambiato con ora del file più vecchia → "adesso".

Tombstone: si tengono le ultime **5 000** (`SYNC_TOMB_CAP`) e si eliminano dopo **365 giorni** (`SYNC_TOMB_DAYS`). Un dispositivo che non si sincronizza da più di un anno deve ripartire da un pacchetto completo (le eliminazioni più vecchie non viaggiano più).

## 3. Stato salvato (in `S`, localStorage)

| Chiave | Contenuto |
|--------|-----------|
| `S.settings.deviceId` | id stabile di questa installazione (`dev-<uuid>`), copiato anche in localStorage `docmap_v26_device`: quella copia vince, così un backup ripristinato da un altro dispositivo non ne clona l'identità |
| `S.settings.deviceLabel` | nome leggibile ("PC studio", "Web app"); vuoto = "Client locale" / "Web app" |
| `S.tombstones` | eliminazioni da propagare (vedi §2) |
| `S.sync.peers[deviceId]` | `{id, label, mode, lastImportAt, lastSeenRemoteExportAt, lastExportAt, ackedAt}` |
| `S.sync.lastExportAt`, `lastImportAt`, `lastPeer` | ultimo export / import / dispositivo usato |
| `S.sync.history` | ultime 50 operazioni `{at, dir:'export'|'import', peer, label, full, since, file?, enc?, counts}` |

Orologi: `lastImportAt`, `lastExportAt`, `ackedAt` sono ore **di questo** dispositivo; `lastSeenRemoteExportAt` è l'`exportedAt` dell'ultimo pacchetto importato da quel dispositivo (ora **sua**). `ackedAt` = fin dove l'altro dispositivo conferma di avere i nostri dati (campo `ack` dei suoi pacchetti).

Queste chiavi non sono nel workspace JSON né nel `.sqlite` (il `.sqlite` non ha `clients.updated_at`: dopo l'apertura di un `.sqlite` i clienti hanno ora vuota = "molto vecchia").

## 4. Pacchetto `docmap-sync` (versione 1)

Nome file: `docmap-sync-<slug del nome dispositivo>-<AAAAMMGG-hhmmss>.json`.

```json
{
  "format": "docmap-sync", "version": 1, "app": "DocMap26", "appVersion": "26.11.1",
  "exportedAt": "2026-11-01T10:00:00.000Z",
  "source": {"deviceId": "dev-…", "deviceLabel": "PC studio", "mode": "local", "operator": "Davide"},
  "since": null,
  "target": "dev-…",
  "ack": {"dev-…": "2026-10-30T18:00:00.000Z"},
  "records": {"binders": [ /* faldoni completi, stessi campi del workspace JSON */ ], "clients": [ /* clienti + updated_at */ ], "locations": [ /* v11: ubicazioni */ ]},
  "tombstones": [{"type": "binder", "id": "…", "code": "BL2", "deletedAt": "…", "who": "Davide"}],
  "settingsSubset": {"studioName": "…", "destTemplate": "…", "catColors": {}, "colorMode": "company", "catFamilies": {}, "colorRules": {}, "colorUpdatedAt": "…", "locLevels": [ /* v11 */ ], "locLevelsAt": "…"},
  "activity_log": [ /* voci del registro attività, stesso formato del workspace JSON */ ],
  "counts": {"binders": 0, "clients": 0, "locations": 0, "tombstones": 0, "log": 0}
}
```

- `since = null`: pacchetto **completo** (tutti i record, tutte le tombstone).
- "**Solo modifiche dall'ultima sincronizzazione**": `since` = `ackedAt` del destinatario, altrimenti il nostro `lastExportAt` verso di lui, altrimenti il nostro ultimo export in assoluto; il pacchetto contiene i record con `updated_at > since` e le tombstone con `deletedAt > since`. Scelta prudente: se un pacchetto non è mai stato importato, il successivo rimanda anche quei record (sull'altro lato risultano "invariati").
- `activity_log`: voci successive a `since` (o all'ultima conferma/export verso il destinatario; tutte se mai sincronizzato). All'import si uniscono per `id` (`logMerge`).
- `settingsSubset` si applica solo se nella revisione spunti "Applica anche le impostazioni condivise" (predefinito: no). Il blocco colori (`colorMode`, `catFamilies`, `colorRules`) si applica per intero solo se il suo `colorUpdatedAt` è più recente di quello locale (last-write-wins sul blocco; vedi MODELLO-DATI.md §12).
- Chiavi sconosciute sono ignorate; record senza `id` scartati; chiavi `__proto__`/`constructor`/`prototype` rimosse.

### 4.1 Pacchetto cifrato `docmap-sync-enc`

```json
{"format": "docmap-sync-enc", "v": 1,
 "kdf": {"name": "PBKDF2", "hash": "SHA-256", "iterations": 310000, "salt": "<base64 16 byte>"},
 "cipher": "AES-256-GCM", "iv": "<base64 12 byte>", "ct": "<base64 testo cifrato + tag 128 bit>"}
```

- WebCrypto (`crypto.subtle`, disponibile anche da `file://` in Chrome/Edge). Chiave AES-256 derivata dalla passphrase (NFC, UTF-8) con PBKDF2-SHA256, ≥ 210 000 iterazioni (oggi 310 000; all'import si accettano 100 000 – 10 000 000), sale e IV casuali per ogni file, AAD = `docmap-sync-enc/1`.
- In chiaro c'è solo l'involucro: nessun nome, codice o metadato del dispositivo.
- Passphrase: minimo 8 caratteri, **mai salvata** (né in `S` né in localStorage); i campi vengono svuotati dopo l'uso. Passphrase errata o file alterato → "Passphrase errata o file danneggiato".
- Il pulsante "Copia negli appunti" funziona fino a 2 MB, oltre scarica il file.

## 5. Import: revisione e applicazione

1. `syncParse(text, pass)` → decifra se serve, controlla `format`/`version`.
2. `syncAnalyze(pkg)` → piano: per ogni record `kind` ∈ `new` · `updated` (il loro è più recente) · `unchanged` · `older` (più vecchio del locale, ignorato) · `delete` · `conflict` (`reason` ∈ `both`, `tie`, `deleted_remote`, `deleted_local`) · `propagate` (tombstone di un record che qui non c'è già più: viene solo ricordata). Un pacchetto creato dallo stesso dispositivo viene rifiutato.
3. Schermata di **revisione**: conteggi, avvisi (orologio, codice parlante già usato da un altro faldone → `ensureIntegrity()` lo rinomina), per ogni conflitto i campi diversi affiancati (Questo dispositivo | Importato) con *Tieni locale* / *Tieni importato*, e il pulsante **Applica a tutti: il più recente**.
4. `syncApply(plan)` in **un solo passo annullabile** (`undoPoint()` salva anche `S.sync` e `S.tombstones`): aggiorna record, tombstone, contabilità del dispositivo, cronologia; scrive nel registro `sync.import` (riepilogo) e un `sync.conflict` per ogni conflitto deciso (`source:'sync'`), poi unisce il registro dell'altra parte.

Un pacchetto di sincronizzazione incollato o trascinato nella normale vista **Importa** non viene mai unito con le regole "unisci/sostituisci": la vista Importa avvisa, e un file `.json` trascinato apre direttamente Sincronizzazione.

## 6. Coda (vista Sincronizzazione)

- **Modifiche locali non ancora esportate**: record e tombstone più recenti del nostro ultimo export.
- **Non ancora confermate da \<dispositivo\>**: più recenti di `ackedAt` (o dell'ultimo export verso di lui).
- Tabella dei dispositivi conosciuti (ultimo import, ultimo export, conferma) e cronologia delle ultime operazioni.

## 7. v10.1 — il server come dispositivo (`06g-server.js`)

Il database online (`server-php/api.php`, contratto in `API-CONTRACT.md`) è **un altro peer** dello stesso motore:
`S.sync.peers['server:<url dell'API>']` con `mode:'server'`. Ogni `pull` diventa un pacchetto `docmap-sync`
(`source.deviceId = 'server:<url>'`, `exportedAt` = ora del server) e passa da `syncAnalyze` → `syncApply`: stesse regole
(vince il più recente per record, tombstone, conflitti "modificato da entrambe le parti" quando il record è cambiato qui
dopo l'ultima sincronizzazione con il server **e** sul server dopo l'ultimo pull).

| Campo del peer server | Significato |
|---|---|
| `seq`, `logSeq` | cursori del pull incrementale (record / registro) |
| `lastPullAt`, `lastImportAt` | ora (di questo dispositivo) dell'ultimo pull applicato |
| `lastSeenRemoteExportAt` | `server_time` dell'ultimo pull (ora **del server**) |
| `lastPushAt` = `ackedAt` | inizio dell'ultimo push riuscito: la "coda" è tutto ciò che ha `updated_at` / `deletedAt` successivo |
| `lastLogPushAt` | idem per il registro attività |
| `settingsAt`, `settingsHash` | ultima versione delle impostazioni condivise ricevuta / inviata |
| `lastSyncAt` | fine dell'ultimo ciclo completo |

Nessuna nuova chiave di stato né colonna SQLite: tutto vive in `S.sync`, che esisteva già (v10). In memoria
(`SRV.known`) il client ricorda la versione che il server ha di ogni record, per non rimandargli ciò che ha appena ricevuto.

**Web app con `apiBase` (automatica)**: dopo lo sblocco della cassaforte pull + push; ogni `commit()` programma un push
(1,5 s), pull ogni 60 s, al ritorno del focus e all'evento `online`. Conflitti: vince il più recente, a parità di ora
quello del server (nessuna finestra). Offline: le modifiche restano nello stato cifrato e ripartono con attesa
crescente (5 s, 10 s … max 5 min). Un 401 (token revocato) ferma i tentativi automatici. Stato in alto: "Online ·
sincronizzato", "In attesa (N)", "Offline · in attesa (N)", "Accesso negato". I pull automatici non scrivono una riga di
riepilogo nel registro (`syncApply(plan, {quiet:true})`: niente annulla, niente `sync.import`).

**PC (`file://`, a richiesta)**: ⚙ Sincronizzazione › **Server online** → indirizzo (anche solo quello dell'app:
`server-php/api.php` viene aggiunto), codice di accesso, facoltativi utente/password della protezione della cartella →
**Sincronizza con il server**: ping (avviso se l'orologio differisce di oltre 2 minuti) → `me` → pull di tutte le pagine
→ se ci sono conflitti la **stessa revisione** dei pacchetti (Tieni locale / Tieni importato) → push. Annullando la
revisione non si invia nulla. **Primo collegamento con il server vuoto**: finestra "Carica il mio archivio sul server
(prima volta)" con i conteggi (faldoni, clienti, eliminazioni, righe di registro, impostazioni) → conferma → si carica
tutto con i propri `updated_at` (nessun dato cambia sul PC). Con il server già popolato vale la fusione normale.
Riga di registro `sync.server`. Richieste "semplici" (`POST text/plain`, token nel corpo) per evitare il preflight CORS:
`config.php` deve avere `allowed_origins => ['null']` (opzione di `setup.php`). I file restano come alternativa.

## 7b. v11 — ubicazioni (tipo di record `location`)

Le ubicazioni (`S.locations`, `MODELLO-DATI.md` §14) passano dagli **stessi** percorsi generici dei faldoni e dei
clienti: `syncTrack` (tombstone quando un'ubicazione sparisce), `syncChangedSince`, pacchetto (`records.locations`,
`counts.locations`), `syncAnalyze` / `syncApply` (vince il più recente per record, conflitti nella stessa revisione),
`srvChanges` / `srvPush` (`type:'location'`) e pull dal server. Il diario delle sincronizzazioni (stream J) le vede
quindi senza codice in più.

- Esclusi dal confronto del contenuto (`SYNC_L_SKIP`): `updated_at`, `short_url`, `code`, `level` (derivati dall'albero).
  Spostare un nodo aggiorna `updated_at` di tutto il sottoalbero, così gli altri dispositivi ricalcolano insieme codici e livelli.
- Faldoni: `location_id` è contenuto (un'assegnazione è una modifica del faldone, LWW); `location_code` no (è in
  `SYNC_B_SKIP`): dopo ogni import `locIntegrity()` e il ricalcolo di `location_code` dei faldoni.
- Impostazioni condivise: `locLevels` + `locLevelsAt` nel sottoinsieme (vince il più recente).
- Eliminare un'ubicazione libera i faldoni che conteneva (i faldoni cambiano e si sincronizzano come tali).
- Telefono: la modalità associazione scrive con `patch` (`API-CONTRACT.md` §5); il PC riceve i faldoni aggiornati e
  le righe `binder.locate` al pull successivo.

## 7c. v12 — archivi (tipo di record `archive`)

Gli archivi (`S.archives`, `MODELLO-DATI.md` §15) seguono gli stessi percorsi generici: `syncTrack` (tombstone quando
un archivio sparisce: unione "Unisci in…" o eliminazione), `syncChangedSince`, pacchetto (`records.archives`,
`counts.archives`), `syncAnalyze` / `syncApply` (LWW per record; gli archivi si applicano **prima** di ubicazioni e
faldoni), `srvChanges` / `srvPush` (`type:'archive'`), pull dal server e registro sincronizzazioni.

- Escluso dal confronto: solo `updated_at` (`SYNC_A_SKIP`). `levels` e `qr_levels` sono contenuto.
- L'**Archivio principale** non viaggia finché non viene modificato (è virtuale, `MODELLO-DATI.md` §15.1): due PC
  appena aggiornati non si scambiano nulla di nuovo. I suoi livelli restano `settings.locLevels` (sottoinsieme
  impostazioni, come in v11).
- `binder.archive_id` e `location.archive_id` sono contenuto (LWW del faldone / dell'ubicazione). `archive_id` dei
  nodi non radice è derivato dalla radice: quando la radice cambia archivio, `syncTrack` vede il sottoalbero cambiato e
  ne aggiorna `updated_at`, quindi i figli viaggiano insieme alla radice.
- Un record di un archivio che questo PC non conosce ancora (ordine di arrivo) resta valido: il faldone mostra un
  archivio "non ancora sincronizzato" finché arriva il record.
- **Server v11 e app v12**: un `api.php` vecchio rifiuta i record `archive` come `invalid` (gli altri passano).
  Aggiornare `server-php/api.php` insieme all'app (`ping` → `features` contiene `archives`).

## 8. Per il back-end Python

Il formato è pensato per diventare l'API di sync: `POST /sync/push` = un pacchetto `docmap-sync` (anche cifrato end-to-end), `GET /sync/pull?since=` = un pacchetto con i record successivi. Il server può applicare la stessa regola (record-level LWW su `updated_at`, tombstone con `deletedAt`) o fare solo da casella postale cifrata. Campi da conservare lato server: `updated_at` dei record, tabella `tombstones(type, id, code, deleted_at, who)`, `device(id, label, mode)` e, per ogni coppia di dispositivi, l'ultima conferma (`ack`).

## 9. v11 — Registro sincronizzazioni (journal di push e sync)

Codice: `assets/js/06i-journal.js` (client), `server-php/api.php` (server, tabelle `sync_journal` +
`sync_journal_items`) · Test: blocco `// @@STREAM-J@@` di `tests/suite.js` · Aiuto in app: argomento `journal`.

Ogni scambio di dati lascia una traccia **per record**: chi, quando, da quale dispositivo (id, nome, versione
dell'app), con quale esito e con quale versione del record. Tre registri con la stessa forma:

| Registro | Dove vive | Chi lo scrive |
|---|---|---|
| **locale** | `S.syncJournal` (localStorage, come il resto di `S`; nei backup JSON come `sync_journal`; **non** nel `.sqlite`) | import ed export di pacchetti (06f), sincronizzazione con il server (06g), ripristini locali |
| **del telefono** | cassaforte cifrata `docmap_v26_vault_journal` (solo `scan.html` in modalità web, a cassaforte sbloccata) | ogni salvataggio diretto dal telefono (`patch`) |
| **del server** | `sync_journal` / `sync_journal_items` nel `docmap.sqlite`, cifrati | ogni `push`, ogni `patch` (anche quelle respinte con 409), i `pull` che restituiscono qualcosa, i ripristini |

**Voce locale** (le più recenti in fondo; massimo 2 000 voci, 300 record per voce, 12 000 record in tutto):
`{id, at, kind:'server'|'package'|'phone'|'restore', dir:'sync'|'import'|'export'|'patch'|'restore', auto, ok, error,
peer:{id,label,mode,url?,file?,sha256?,bytes?,enc?}, device:{id,name,app}, user, role, counts:{sent, received, accepted,
rejected, conflicts, created, updated, deleted, ignored}, server_journal:[jid…], items:[…], items_total}`.
Ogni `item`: `{type, id, code, dir:'in'|'out', action, resolution, how, reason, local_updated_at, remote_updated_at,
hash, fields?:[[campo, qui, altro]], snapshot?}`. Il tipo è libero (`binder`, `client`, `settings` e i tipi futuri,
per esempio `location`): il registro non ha un elenco chiuso.

- `action`: `create` · `update` · `delete` · `tombstone` · `conflict` · `rejected-older` · `sent` · `sent-delete` · `restore`.
- `resolution`: `took_remote` · `kept_local` · `accepted` · `rejected-older` · `conflict` · `rejected-invalid` · `queued` · `forced`.
- `how` (solo conflitti): `auto` (regola "vince il più recente", senza finestra), `confirmed` (proposta accettata nella
  revisione), `manual` (scelta cambiata a mano).
- `hash` = SHA-256 del JSON canonico della versione tenuta/inviata (chiavi ordinate, senza `updated_at`, `short_url`,
  `location_code`, `selected_for_print`, campi `_*`, valori scalari come stringhe): per un record inviato è **identico**
  al `new_hash` del server, così le due tracce si confrontano. Una tombstone ha `sha256("deleted:<type>/<id>@<deletedAt>")`.
- `fields` = i campi diversi (conflitti, aggiornamenti, ripristini); `snapshot` = il record prima di un'eliminazione:
  la versione persa si può sempre rimettere.
- Un file di pacchetto è registrato con nome, dimensione e SHA-256 del testo (`peer.file/bytes/sha256`).
- Non si registrano: le sincronizzazioni automatiche della web app che non hanno spostato nulla e gli errori
  automatici (riprovati da soli). Quelle a richiesta si registrano sempre, anche se falliscono.

**Identità del dispositivo** su ogni chiamata al server (`DMServer.call`): header `X-DocMap-Device`,
`X-DocMap-Device-Name` (URI-encoded), `X-DocMap-App`, oppure `"_device":{id,name,app}` nel corpo `text/plain` del PC
(`file://`). `id` = `S.settings.deviceId`, `name` = `S.settings.deviceLabel` (modificabile in ⚙ Sincronizzazione),
`app` = `APP_VERSION`. Il telefono usa `docmap_v26_device` / `docmap_v26_device_label` di localStorage. Un client v10.1
non manda nulla: il server registra `unknown` (per il `push` usa ancora il `deviceId` del corpo).

**Interfaccia** (⚙ Sincronizzazione, riquadro *Registro sincronizzazioni*): filtri per data (dal/al), utente,
dispositivo, codice faldone; sorgente *Questo dispositivo* oppure *Server (tutti)* (admin) / *Server (le mie)* (editor),
visibile solo con il server collegato; dettaglio con l'esito di ogni record e il **confronto campo per campo**;
pulsante **Ripristina questa versione**; **Esporta CSV** (separatore `;`, BOM UTF-8, 28 colonne, una riga per record) ed
**Esporta JSON** (`{format:'docmap-sync-journal', version:1, …}`). Sul telefono: *Le mie sincronizzazioni* (ultime 200).

**Ripristino**:
- *locale*: rimette la versione che **non** aveva vinto (o lo `snapshot` prima di un'eliminazione) con `updated_at` =
  adesso (e comunque dopo la versione attuale e dopo un'eventuale tombstone), scrive `sync.restore` nel registro
  attività e una voce `restore` nel registro sincronizzazioni; alla prossima sincronizzazione vince ovunque. Si annulla
  con **Annulla**.
- *server* (solo admin): `journal_restore {jid, n, version:'prev'|'new'}` riscrive quella versione sul server come
  nuova scrittura (`updated_at = max(ora del server, attuale + 1 ms)`), poi il PC si sincronizza subito.

**Regole del motore corrette in v11** (pacchetti e server; nessun cambiamento di formato):
1. `syNext(prev, now) = max(now, prev + 1 ms)`: una modifica fatta su una versione arrivata da un dispositivo con
   l'orologio avanti riceve comunque un `updated_at` **successivo** (prima poteva risultare più vecchia e perdere).
   Vale per `syncTrack`, per *tieni locale* e per le tombstone.
2. `S.sync.recvAt['type:id'] = [quando è arrivato qui, da quale peer, quale updated_at]`: un record ricevuto da un
   pacchetto o dal server con un `updated_at` vecchio viene comunque **inoltrato** agli altri dispositivi (prima un
   faldone arrivato dal PC A non passava mai al server tramite il PC B). Massimo 20 000 voci.
3. Nessun falso conflitto "modificato da entrambe le parti" quando la versione locale è proprio quella ricevuta da
   (o accettata da) quell'altro dispositivo.
4. Se `lastPushAt` o l'ultimo export risultano **nel futuro** (orologio corretto all'indietro) si manda tutto invece
   di niente.
5. Il ramo del push con record rifiutati usa il `server_time` del server (prima usava l'ora del PC).

## 10. Come risolvere una contestazione

Esempio: «Martedì ho spostato il faldone BL123 nell'armadio 4, oggi è di nuovo nell'armadio 2. Chi l'ha cambiato?»

1. **Apri il registro**: ⚙ Funzioni avanzate › Sincronizzazione › *Registro sincronizzazioni*. Con il server
   collegato scegli **Server (tutti)** (serve un codice admin; un editor vede solo le proprie sincronizzazioni).
2. **Filtra**: scrivi `BL123` in *Codice faldone* e, se serve, il periodo (*Dal* / *Al*). Restano solo le
   sincronizzazioni che hanno toccato quel faldone, la più recente in alto.
3. **Leggi le righe**: per ognuna vedi quando, chi (utente del codice di accesso e operatore), da quale dispositivo
   (nome, id, versione dell'app) e l'esito (*accettato*, *più vecchio, ignorato*, *conflitto*, *ripristinato*…).
4. **Apri il dettaglio** della riga sospetta: il confronto mostra campo per campo la versione **prima** e **dopo**
   (per esempio `shelf_code: 4 → 2`). Per i conflitti c'è anche *come* è stato deciso: in automatico (vince il più
   recente), confermato nella revisione o scelto a mano.
5. **Controlla il registro dell'altro dispositivo**, se serve: ogni voce locale riporta lo SHA-256 della versione
   inviata, uguale al `new_hash` del server. Se coincidono, quella versione è partita proprio da lì.
6. **Rimetti la versione giusta**: nel dettaglio premi **Ripristina questa versione**. Diventa la modifica più
   recente e alla prossima sincronizzazione arriva su tutti i dispositivi. Anche il ripristino resta nel registro
   (azione *ripristinato*) e nel registro attività (`sync.restore`).
7. **Conserva la prova**: **Esporta CSV** (si apre in Excel) o **Esporta JSON** con i filtri attivi, e allegalo alla
   segnalazione.

Se il faldone non compare nel registro del server, la modifica non è mai arrivata: cercala nel registro locale del
PC (*Questo dispositivo*) o sul telefono (*Le mie sincronizzazioni*). Un orologio sbagliato si riconosce dagli orari:
l'app avvisa quando un dispositivo differisce dal server di oltre 2 minuti.
