# DocMap — sicurezza: cosa protegge l'MVP e cosa no (v10.1)

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
- **Audit centrale** completo: oggi il server tiene il registro attività inviato dai client e `changes` (chi/quando per
  ogni scrittura), non un log degli accessi in sola lettura né firme anti-manomissione.
- Foto e allegati **non** passano dal server (restano nel SQLite di ogni PC).
- Ordine delle modifiche = orologi dei dispositivi (`updated_at` dei client, tranne `patch` che usa l'ora del server):
  l'app avvisa se l'orologio differisce di oltre 2 minuti.
- `allowed_origins: ['null']` accetta qualunque pagina `file://` o sandbox: il token resta comunque necessario.

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
