# DocMap — sicurezza: cosa protegge l'MVP e cosa no

> Valido per la 26.12.0 (v12): §1–§5 descrivono il client (dalla v10), §5b il database online (v10.1), §5c il
> registro sincronizzazioni (v11), §5d l'accesso senza PIN e il registro accessi (v12).

> Sintesi onesta. L'MVP crea **le basi** (interfacce, formati, cifratura nel browser); il **sistema di sicurezza vero**
> (login centralizzato, revoca, sincronizzazione, cifratura lato server, audit centrale) lo costruisce il back-end Python
> seguendo `API-CONTRACT.md`. Codice: `assets/js/10-auth.js` (provider, cassaforte, blob), `assets/js/11-scan.js`.

## 1. Le tre modalità

| | `local` (predefinita, `file://`) | `web` statico (`--no-server`) | `web` + `apiBase` (v10.1, predefinito del deploy) |
|---|---|---|---|
| Dove sono i dati | nel browser del PC, **in chiaro** (`localStorage 'docmap_v26_state'`, IndexedDB SQLite) | nel browser di ogni dispositivo, **cifrati** (cassaforte `DocMapVault`) | nel **database condiviso** sul server (`server-php`, cifrato AES-256-GCM) + copia cifrata nella cassaforte di ogni dispositivo |
| Cosa c'è sul server | nulla | **solo il programma** (HTML/JS/CSS), mai dati | programma + `server-php/api.php` + file SQLite (meglio fuori da `public_html`) |
| Login sul PC | no (come prima) | **sì, su ogni pagina** | sì: password della cartella (SiteGround) + PIN del dispositivo; il token del server sta cifrato nella cassaforte |
| Login sul telefono (`scan.html`) | sì (utenti locali) | sì | sì (primo accesso: utente + PIN + codice di accesso) |
| Sincronizzazione | file / pacchetti; **a richiesta con il server** (⚙ Sincronizzazione › Server online) | pacchetti (modulo sync, 06f-sync.js) | **automatica** (06g-server.js) |

## 2. Utenti locali (tutte le modalità)

- Archivio utenti: `localStorage 'docmap_v26_auth'` = `{v:1, users:[…], policy:{sessionMinutes}}`. **Non** finisce nei
  backup JSON, nei CSV né nel file `.sqlite` (scelta voluta: niente credenziali nei file che si scambiano).
- PIN/password: **PBKDF2-HMAC-SHA256, 600 000 iterazioni** (raccomandazione OWASP 2023), sale casuale di 16 byte per
  utente, 32 byte di output, segreto normalizzato NFKC. Formato: `pbkdf2_sha256$600000$<sale b64>$<hash b64>`.
  Confronto a tempo costante; per i nomi utente inesistenti si calcola comunque un hash (niente enumerazione dai tempi).
- Tentativi falliti: `localStorage 'docmap_v26_auth_fail'`, per nome utente (anche inesistente): dopo 3 errori attesa
  15 s, poi 30 s, 60 s … fino a 15 min. È solo un freno: chi controlla il browser può cancellare il contatore.
- Sessione: `sessionStorage 'docmap_v26_session'` `{sid, user_id, exp}` (durata in Impostazioni, predefinita 480 min);
  il ruolo si legge **sempre** dall'archivio utenti, non dalla sessione. Si chiude con "Esci" o chiudendo la scheda.
- Ruoli: `viewer` vede, `editor` modifica da mobile, `admin` gestisce gli utenti (in modalità web). **Sul PC i ruoli
  non limitano ancora le funzioni** (chi entra usa tutta l'app): da fare nel back-end / nelle viste.

## 3. Cassaforte cifrata (modalità `web`)

- **DEK**: chiave AES-256-GCM casuale del browser. Non viene mai scritta in chiaro.
- **KEK per utente**: PBKDF2-SHA256(PIN, sale proprio, 600 000) → AES-KW 256; `user.vault = {salt, iter, wrapped}`
  contiene la DEK avvolta. Il login verifica l'hash e poi **sblocca** la DEK. Nuovo utente o nuovo PIN = la DEK
  viene avvolta di nuovo (serve essere già dentro, come amministratore).
- Cifrati con la DEK (AES-GCM, IV casuale da 12 byte, AAD = nome della chiave): stato `docmap_v26_vault` (+ `_prev`),
  registro attività in sospeso `docmap_v26_vault_log`, database SQLite in IndexedDB (con foto e sessioni).
  In modalità web **non esistono** `docmap_v26_state` né `docmap_v26_log_pending` in chiaro (verificato dai test).
- Sessione della scheda: la DEK è avvolta da una chiave **non estraibile** salvata in IndexedDB
  (`docmap_v26_keys`, `session:<sid>`); la copia avvolta e la scadenza stanno in `sessionStorage`. Ricaricare la
  scheda non chiede di nuovo il PIN; "Esci" cancella entrambe e ricarica la pagina sulla schermata di accesso.
- Da disconnessi la pagina non decifra nulla e non mostra nulla (né l'archivio, né il codice del QR, né il nome
  reale dello studio: sulla schermata di accesso compare solo `studioName` di `docmap.config.js`).
- Almeno un amministratore attivo deve restare: senza, la cassaforte non si aprirebbe più (il programma lo impedisce).
  PIN dimenticato da tutti → i dati di quel browser non si recuperano: si azzerano e si reimportano dal pacchetto.
- Interfaccia per altri moduli (es. import del pacchetto sync): `window.DocMapVault` →
  `isActive() · isUnlocked() · loadState() · saveState(obj) · flush() · lock()`. Il desktop non deve chiamarla: in
  modalità web `persist()` e `loadState()` di `02-core.js` passano già dalla cassaforte, quindi un import che finisce
  con `commit()` viene salvato cifrato.

## 4. Allegati: `CryptoProvider` + `BlobStore`

- Cifratura a busta (envelope): una DEK AES-256-GCM **per ogni allegato**, avvolta (AES-KW) da una chiave di area di
  lavoro (KEK) **non estraibile** in IndexedDB `docmap_v26_keys` (`workspace`). Busta: `{v, alg:'A256GCM', kw:'A256KW',
  kid, iv, wrapped_dek}`; l'`id` del blob è usato come AAD (un blob non si può scambiare con un altro); `sha256` del
  contenuto in chiaro verificato a ogni lettura.
- `LocalBlobStore` (IndexedDB `docmap_v26_blobs`, store `meta` + `data`): gli allegati sono **blob**, mai file sciolti.
  Politica "copia di lavoro per manutenzione tecnica e funzionale, **non** archiviazione a lungo termine": foto
  ridisegnate a ≤ 1400 px JPEG q 0,8 (dati EXIF/GPS rimossi), PDF tali e quali fino a 15 MB, altro fino a 10 MB.
- Le foto di oggi (`06b-photos.js`, tabella SQLite `photos`) **non** sono ancora passate al BlobStore, per non
  rompere i dati esistenti. Migrazione prevista: `phAdd` → `dmProviders().blobs.putBlob(file, {owner_type, owner_key})`
  e in `photos` solo `blob_id` + `marks_json`; `phUrl` → `getBlob(id)` → `URL.createObjectURL`. In modalità web le
  foto sono comunque cifrate, perché il database SQLite intero lo è.
- Sul server: la KEK diventa una chiave **per tenant** in un KMS/HSM (rotazione, revoca), i byte stanno in object
  storage con cifratura lato server in più; URL firmati a scadenza breve; nessun nome file leggibile.

## 5. Cosa NON è sicuro nell'MVP (da sapere)

1. **Modalità local**: dati e log in chiaro nel profilo del browser; chi usa il PC li vede. Gli utenti locali
   proteggono solo la pagina mobile da sguardi casuali su un dispositivo condiviso.
2. **XSS = tutto perso**: uno script iniettato nella pagina potrebbe usare la chiave sbloccata. Difese: tutto il testo
   passa da `esc()`, nessuna libreria esterna, CSP rigida nel deploy (`.htaccess`: `default-src 'self'`).
3. Chi ha accesso al profilo del browser **durante** una sessione aperta può leggere i dati (la chiave di sessione è
   nel profilo). Chiudere la scheda o "Esci" chiude la sessione.
4. PIN corti si indovinano offline in fretta se qualcuno copia `localStorage` (l'hash è lento ma un PIN di 4 cifre ha
   10 000 combinazioni). Per i dispositivi web usare **password lunghe**.
5. Niente revoca a distanza: un utente cancellato su un dispositivo resta sugli altri; un telefono perso con una
   sessione aperta resta aperto fino alla scadenza.
6. Gli export che l'utente scarica (CSV, JSON, `.sqlite`, PDF) e il file `.sqlite` collegato su disco sono in chiaro:
   sono azioni volute dall'utente. Il pacchetto sync può essere cifrato con passphrase (modulo 06f-sync.js).
7. "Ripristina snapshot precedente" (Impostazioni) in modalità web non usa la copia `_prev` cifrata (si usa il backup).

## 5b. v10.1 — database online condiviso (`server-php`) — cosa protegge oggi

Livelli, dall'esterno verso l'interno:

1. **HTTPS** (certificato SiteGround, "HTTPS forzato") + header di sicurezza del `.htaccess` (CSP `default-src 'self'`,
   HSTS, nosniff, no-referrer, noindex).
2. **Protezione con password della cartella** (SiteGround › Directory protette, HTTP Basic): chi non ha utente e
   password non scarica nemmeno il programma né raggiunge l'API. Il browser la chiede una volta per dispositivo.
3. **Token dell'app** per ogni persona/dispositivo (`X-DocMap-Token`), con ruolo `viewer` / `editor` / `admin` controllato
   **dal server** su ogni rotta (un viewer non può scrivere). Sul server solo lo SHA-256 (`config.php` o tabella
   `tokens`); revoca immediata dei token creati dall'app (`token_revoke`). Blocco progressivo per IP dopo 5 token
   errati (429 + `Retry-After`, fino a 15 minuti).
   **Scelta per il front-end**: il token si inserisce **una volta per dispositivo** insieme a un utente e a un PIN
   *locali*; il token viene verificato (`?r=me`) e salvato **cifrato** nella cassaforte del dispositivo
   (`localStorage 'docmap_v26_vault_srv'`, AES-GCM con la DEK sbloccata dal PIN). Ai login successivi basta il PIN.
   Il ruolo nell'app viene dal token, non dall'utente locale. Desktop `file://`: URL e token in
   `localStorage 'docmap_v26_srv'` in chiaro, come tutti i dati della modalità locale (mai nei backup/CSV/.sqlite).
4. **Cifratura a riposo** di ogni record, impostazione e riga di registro: AES-256-GCM con IV casuale e tag, AAD legato
   al record; ricerche con indici HMAC (nessun codice o nome in chiaro nel file). Senza chiave l'API non parte; una
   chiave diversa da quella del database viene rifiutata (`meta.key_check`). I test verificano che nel file `.sqlite`
   (e nel WAL) non compaiano nomi, codici o contenuti.
5. **Cartella dei dati non raggiungibile dal web**: consigliata fuori da `public_html`; se dentro, `server-php/data/`
   ha `.htaccess` "Require all denied" + `index.html`; `server-php/.htaccess` nega `config*.php`, `*.sqlite*`,
   `*.disabled`, `.ht*`; `config.php` restituisce 404 anche se eseguito direttamente. `setup.php` gira **una volta**
   (rifiuta se esiste `config.php` e si rinomina `setup.php.disabled`).
6. Errori sempre in JSON senza percorsi o messaggi PHP (`display_errors` off; dettagli solo nel log PHP).
   CORS: solo stessa origine, più `null` (programma sul PC) se scelto in `setup.php`.

**Cosa manca ancora** (da fare con il back-end Python o in una versione successiva):

- **Account utente sul server** con password/OIDC e 2FA (oggi: token per dispositivo + PIN locale; chi ha il token
  e la password della cartella può usare l'API). Revoca dei token di `config.php` solo a mano (`'disabled' => true`).
- **Rotazione della chiave** AES (oggi una sola chiave per tutto il database; cambiarla richiede di ricifrare: non c'è
  ancora uno strumento) e chiave fuori dal web server (KMS/HSM). Chi legge `config.php` legge tutto.
- **Audit centrale** completo: oggi il server tiene il registro attività inviato dai client, `changes` (chi/quando per
  ogni scrittura) e dalla v11 il registro sincronizzazioni (sotto), non un log degli accessi in sola lettura né firme
  anti-manomissione (un admin con accesso al file può cancellare righe; gli hash servono a confrontare le versioni,
  non a sigillare il registro).
- Foto e allegati **non** passano dal server (restano nel SQLite di ogni PC).
- Ordine delle modifiche = orologi dei dispositivi (`updated_at` dei client, tranne `patch` che usa l'ora del server):
  l'app avvisa se l'orologio differisce di oltre 2 minuti.
- `allowed_origins: ['null']` accetta qualunque pagina `file://` o sandbox: il token resta comunque necessario.

## 5c. v11 — registro sincronizzazioni: cosa contiene e come è protetto

Il registro esiste per risolvere le contestazioni, quindi contiene **dati personali e copie dei record**:

| Dove | Contenuto | Protezione |
|---|---|---|
| server `sync_journal` | ora, rotta, id del token, ruolo, conteggi, sequenze **in chiaro**; utente, operatore, id/nome del dispositivo, versione dell'app, IP **cifrati** (AES-256-GCM, AAD `journal/<jid>`) | indici `k_user` / `k_device` = HMAC (nessun nome in chiaro) |
| server `sync_journal_items` | tipo, id, azione, tempi, SHA-256 **in chiaro**; codice, motivo e **versioni complete prima/dopo** cifrati (AAD `journal/<jid>/<n>`) | indice `k_code` = HMAC del codice maiuscolo |
| PC `S.syncJournal` | voci con codici, campi diversi e copie dei record eliminati | come il resto dei dati locali: in chiaro nel browser del PC; nei backup JSON (`sync_journal`) |
| telefono | ultime 200 voci "Le mie sincronizzazioni" | cassaforte cifrata (`docmap_v26_vault_journal`, DEK del PIN); niente registro se la cassaforte non è sbloccata |

- **Chi legge**: rotta `journal` solo con token `editor` (vede **solo le proprie** voci, filtro imposto dal server) o
  `admin` (tutte, più l'IP). Un `viewer` riceve 403. `journal_restore` solo `admin`. I test verificano che nel file
  `.sqlite` non compaiano nomi, codici o nomi di dispositivo del registro.
- **Gli hash in chiaro** sono SHA-256 del JSON canonico: non rivelano il contenuto, ma due record identici hanno lo
  stesso hash (chi ha il file può vedere *che* un record è tornato a una versione precedente).
- **IP**: salvato cifrato e mostrato solo agli admin; è un dato personale (GDPR): tenerlo per il tempo che serve.
- **Conservazione**: `journal_keep_days` in `config.php` (0 = per sempre). Consigliato 365–730 giorni per uno studio.
  La potatura gira al massimo una volta al giorno. Sul PC il registro si ferma a 2 000 voci / 12 000 record (si
  tolgono i più vecchi); esportarlo in CSV/JSON se va conservato più a lungo.
- **Dimensione** sul server: per ogni record cambiato circa 2 volte la dimensione del record (versione prima + dopo,
  cifrate) + circa 250 byte; per ogni sincronizzazione circa 400 byte. Con 50 modifiche al giorno su faldoni da 2 KB
  sono circa 70 MB in 300 giorni lavorativi. I pull registrano solo id e hash.
- **Dispositivo dichiarato**: id, nome e versione arrivano dal client (header `X-DocMap-Device*` o `_device`) e **non**
  sono una prova: chi ha il token può dichiarare un altro nome. L'identità certa resta il **token** (`token_id`, utente
  del token), che il server decide da solo.

## 5d. v12 — accesso senza PIN ("Ricordami su questo dispositivo") e registro accessi

**Perché.** La fotocamera del telefono apre ogni QR in una **scheda nuova**: la chiave della cassaforte sbloccata
vive solo in `sessionStorage` (§3), quindi fino alla v11.1 ogni QR chiedeva il PIN. Con «Ricordami su questo
dispositivo» (casella sotto il PIN, **attiva di predefinito**, solo in modalità `web`) l'accesso vale per il
dispositivo, non per la scheda.

**Come è fatto** (`assets/js/06k-access.js`):

| Dove | Cosa | Protezione |
|---|---|---|
| IndexedDB `docmap_v26_keys` › `keys` › `remember:<rid>` | `{kw, mk}`: una chiave AES-KW 256 e una HMAC-SHA256 | **non estraibili** (`extractable:false`): il browser non le fa uscire, nemmeno verso lo script della pagina |
| localStorage `docmap_v26_remember` | `{v:1, rid, user_id, created_at, last_at, pwfp, wrapped, mac}`: la DEK avvolta con `kw`, l'impronta del PIN (`pwfp` = primi 128 bit di SHA-256 dell'hash del PIN), la data dell'ultimo uso | `mac` = HMAC con `mk` di tutti i campi: un `last_at` spostato in avanti a mano non vale |
| localStorage `docmap_v26_remember_policy` | minuti di inattività ammessi, l'ultimo letto dal server (`me.remember_minutes`) | — (solo una preferenza) |

Il PIN **non** viene mai salvato, né in chiaro né avvolto; nemmeno il token del server esce dalla cassaforte cifrata.
Una scheda nuova legge il record, verifica il `mac`, controlla l'inattività e l'utente (esiste, è attivo, `pwfp`
uguale), svolge la DEK e apre la cassaforte come dopo il PIN. Ogni uso aggiorna `last_at` (al massimo una volta al
minuto).

**Quando si torna al PIN.** Inattività oltre la politica (predefinito **30 giorni**; `remember_minutes` in
`config.php` vince su quella del dispositivo: `0` = PIN a ogni apertura, `480` = 8 ore, `43200` = 30 giorni, `-1` =
mai); «Esci»; «Dimentica questo dispositivo» in Utenti e accesso; utente disattivato o eliminato, PIN cambiato;
**token revocato**: qualsiasi 401 del server con il token di questo dispositivo cancella record e chiave.

**Modello delle minacce (onesto).**

- **Telefono perso o rubato sbloccato** (o lasciato sul tavolo): chi lo prende vede i faldoni **fino alla scadenza
  per inattività o alla revoca**. Rimedio: l'admin revoca il token di quel dispositivo (⚙ Sincronizzazione › Server
  online › token): al primo contatto col server il telefono dimentica l'accesso. Senza rete il telefono mostra la
  copia salvata (cifrata con la stessa DEK) finché la politica non scade. Per i dispositivi condivisi: politica
  `0` (PIN sempre) oppure togliere la spunta.
- **Telefono bloccato** (codice / impronta del sistema): DocMap non aggiunge protezione oltre a quella del sistema; i
  dati restano cifrati sul disco come in §3.
- **Copia dei file del browser** (backup, malware senza accesso alla pagina): il record in `localStorage` da solo non
  serve; la chiave `kw` sta nell'archivio chiavi del browser come oggetto non estraibile. Chi riesce a eseguire codice
  **nella pagina** (XSS) può però usarla mentre la pagina è aperta: per questo la CSP del `.htaccess` resta stretta e
  l'app non carica script esterni.
- **Più persone sullo stesso telefono**: il record è di un utente solo; un login diverso lo sostituisce.
- **Il programma sul PC da `file://`** non ha login e non cambia.
- **iPhone / Safari**: Safari cancella localStorage e IndexedDB di un sito non aperto per 7 giorni (salvo app aggiunta
  alla schermata Home). Su iPhone quindi, dopo una settimana senza usare DocMap, si rifà il **primo accesso** (nome,
  PIN e codice di accesso), qualunque sia la politica. Da verificare sul telefono vero (`CHECKLIST-COLLAUDO.md`).

**Registro accessi.** Il server scrive chi ha aperto quale faldone / ubicazione, quando e come (`via`: `qr`, `search`,
`nav`, `nfc`) nella tabella `access_log` (schema 3, `API-CONTRACT.md` §11):

| Dove | Contenuto | Protezione |
|---|---|---|
| server `access_log` | ora, rotta, `via`, id del token, ruolo, tipo e id del record **in chiaro**; utente, id/nome del dispositivo, versione dell'app, codice, IP **cifrati** (AES-256-GCM, AAD `access/<aid>`) | `k_user` / `k_device` / `k_code` = indici HMAC |
| PC: registro attività | `view.binder` (gruppo Visite): codice, `via`, dispositivo; al massimo una voce per faldone per operatore ogni 10 minuti | come il resto del registro |
| PC / telefono: coda `docmap_v26_seen_queue` | id, codice, ora delle visite da mandare con `seen` | in chiaro nel browser (solo id e codici, nessun dato del faldone) |

- **Chi legge**: `access` solo `editor` (le proprie righe) e `admin` (tutte, con IP); `last_seen` qualsiasi ruolo, ma
  senza IP né id del token (è ciò che mostra la scheda: «Visto di recente», «Chi l'ha visto»).
- **Conservazione**: `access_keep_days` (predefinito 365, potatura al massimo una volta al giorno). L'IP è un dato
  personale (GDPR): informare i collaboratori che le aperture dei faldoni sono registrate.
- **Dichiarato dal client**: `via`, dispositivo e (per `seen`) l'ora della visita arrivano dal client e non sono una
  prova; certi restano il token e l'ora di ricezione (`received_at`), che il server decide da solo.

## 6. Cosa deve fare il back-end Python

- Autenticazione reale: OIDC (o password Argon2id) + 2FA per gli amministratori, token brevi e revocabili, blocco
  progressivo per utente e IP, gestione centrale di utenti e ruoli (`API-CONTRACT.md` §2).
- TLS ovunque (HSTS), CSP, header di sicurezza (già nel `.htaccess` generato).
- Cifratura a riposo del database e dello storage, chiavi per tenant in KMS, backup cifrati con prove di ripristino.
- Autorizzazione per ruolo **lato server** su ogni rotta (`viewer` non può fare PATCH), campi ammessi da mobile.
- Audit centrale: le righe `activity_log` (anche `source:'mobile'`) arrivano con il push di sincronizzazione e non si
  modificano più (`HUB-E-API.md` §10).
- Allegati: politica "copia di lavoro" anche lato server, conservazione limitata, cancellazione verificabile.
- GDPR: lo studio è titolare, il fornitore responsabile (art. 28), hosting UE, registro dei trattamenti.
