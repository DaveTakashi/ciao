# DocMap 2026 — Sincronizzazione manuale client locale ⇄ web app (v10)

Codice: `assets/js/06f-sync.js` · Test: blocco `// @@STREAM-S@@` in `tests/suite.js` · Aiuto in app: argomento `sync`.

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
  "format": "docmap-sync", "version": 1, "app": "DocMap26", "appVersion": "26.9.0",
  "exportedAt": "2026-11-01T10:00:00.000Z",
  "source": {"deviceId": "dev-…", "deviceLabel": "PC studio", "mode": "local", "operator": "Davide"},
  "since": null,
  "target": "dev-…",
  "ack": {"dev-…": "2026-10-30T18:00:00.000Z"},
  "records": {"binders": [ /* faldoni completi, stessi campi del workspace JSON */ ], "clients": [ /* clienti + updated_at */ ]},
  "tombstones": [{"type": "binder", "id": "…", "code": "BL2", "deletedAt": "…", "who": "Davide"}],
  "settingsSubset": {"studioName": "…", "destTemplate": "…", "catColors": {}, "colorMode": "company", "catFamilies": {}, "colorRules": {}, "colorUpdatedAt": "…"},
  "activity_log": [ /* voci del registro attività, stesso formato del workspace JSON */ ],
  "counts": {"binders": 0, "clients": 0, "tombstones": 0, "log": 0}
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

## 7. Per il back-end Python

Il formato è pensato per diventare l'API di sync: `POST /sync/push` = un pacchetto `docmap-sync` (anche cifrato end-to-end), `GET /sync/pull?since=` = un pacchetto con i record successivi. Il server può applicare la stessa regola (record-level LWW su `updated_at`, tombstone con `deletedAt`) o fare solo da casella postale cifrata. Campi da conservare lato server: `updated_at` dei record, tabella `tombstones(type, id, code, deleted_at, who)`, `device(id, label, mode)` e, per ogni coppia di dispositivi, l'ultima conferma (`ack`).
