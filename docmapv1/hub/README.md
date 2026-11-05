# DocMap Hub — gestionale di clienti, progetti, installazioni, licenze e deploy (v0.5)

> **Novità 0.5** — la pagina è un **gestionale per cliente** (Panoramica, Clienti → scheda progetto, Istanze, Licenze,
> Deploy, Ctrl+K), con **Crea progetto con AI** (prompt da copiare in qualsiasi AI → JSON `docmap-progetto/1` → maschere
> → conferma), **postazioni** con nome e client scaricabile, **autoinstall web**, passphrase scritta **solo nel browser**
> con **Ricorda su questo PC**. Aggiornamento: [`../docs/AGGIORNAMENTO-HUB-0.3-0.5.md`](../docs/AGGIORNAMENTO-HUB-0.3-0.5.md);
> uso: [`../docs/WIKI-HUB.md`](../docs/WIKI-HUB.md) capitoli 6.0 e 7. Sezione tecnica: §14 qui sotto.

> **Novità 0.3.1** — wiki completa: [`../docs/WIKI-HUB.md`](../docs/WIKI-HUB.md) (anche `WIKI-HUB.html`).
> `accesso-automatico attiva` = la passphrase si scrive una volta sola (anche per il tuo agente, vedi
> [`AGENTE-OPERATIVO.md`](AGENTE-OPERATIVO.md)); `info` = cartella del programma (si sostituisce) e cartella dati (non si
> tocca); deploy: la cartella FTP sbagliata viene riconosciuta e corretta.

Il **hub** è il programma con cui Dave gestisce **tutte** le installazioni DocMap dal suo PC: emette e rinnova le
licenze, tiene in una **cassaforte cifrata** le credenziali di ogni installazione, gestisce per ogni installazione
gli ambienti **production**, **staging** e **demo**, pubblica la web app via **FTPS/SFTP** con backup e ripristino
automatico, assegna le **porte** agli ambienti locali senza mai farle scontrare e mostra lo **stato** di tutto.
Capitoli nuovi della v0.2: §8 Ambienti, §9 Cassaforte, §10 Deploy, §11 Porte, §12 Pannello di stato.
Gira sul PC di Dave (Windows), anche se spesso è spento: le installazioni dei clienti
**verificano la licenza da sole, senza collegarsi al hub** (decisione D4 della ROADMAP).

Cosa fa:

- custodisce la **chiave di firma** Ed25519 (cifrata con una passphrase che conosce solo Dave);
- tiene il **registro** (SQLite) di rivenditori, clienti, installazioni, licenze emesse e il
  registro delle operazioni (chi ha fatto cosa e quando);
- **emette** file di licenza firmati (`*.docmap-licence`) e li **rinnova**;
- (v0.2) **ambienti** production / staging / demo per ogni installazione, **cassaforte** delle credenziali,
  **deploy** FTPS/SFTP sicuro, **porte** automatiche, **pannello di stato**;
- offre una **pagina locale** (`http://127.0.0.1:47823/`; se la porta è occupata il hub prende da solo la successiva libera e la ricorda) per fare tutto dal browser (schede *Licenze*,
  *Istanze & ambienti*, *Cassaforte*, *Deploy*, *Porte*, *Stato*).

Regola d'oro (D5): una licenza **non blocca mai i dati**. Scaduta → 30 giorni di tolleranza
→ poi **sola lettura**: lo studio continua a consultare, stampare ed esportare l'archivio.

> **Nuovo cliente in pochi passi (v0.3)**: guida completa **[`docs/GUIDA-NUOVO-CLIENTE.md`](../docs/GUIDA-NUOVO-CLIENTE.md)**.
> In breve:
>
> 1. una volta: `run_windows.bat init`, `keygen`, `vault init`, `export-public-key --out chiave-pubblica.json`, `backup` (su USB);
> 2. `run_windows.bat cliente nuovo --nome "Studio Rossi" --piva IT… --piano studio --installazioni sede|online|entrambe
>    [--url-online https://docmap.pr-it.it/studio-rossi/ --url-staging … --ftp-host … --ftp-utente … --ftp-cartella …]`
>    (oppure la scheda **Nuovo cliente** della pagina) → in `%APPDATA%\DocMapHub\clienti\studio-rossi\`: pacchetto
>    personale per la sede (licenza + chiave pubblica + nome + modello della sincronizzazione), siti per l'hosting,
>    **scheda cliente** da stampare (senza segreti). Rilanciarlo non crea doppioni; `--rigenera` rifà i pacchetti;
> 3. online: `deploy --env staging` → `setup.php` (aggiungi `ponte-sync,editor`) → token in cassaforte
>    (`cliente token-ponte --salva`) → `promote` → setup.php su production;
> 4. sede: zip su chiavetta → `installa.bat` (licenza automatica, Kit di emergenza, sincronizzazione ogni 10 minuti);
> 5. `cliente scheda --cliente "Studio Rossi" [--con-segreti]`, `cliente elenco`; rinnovi: `licence renew`.

---

## 1. Installazione sul PC di Dave (Windows 10/11)

1. Installa **Python 3.11 o successivo** da <https://www.python.org/downloads/>.
   Durante l'installazione spunta **"Add python.exe to PATH"**.
2. Copia la cartella `docmapv1\hub` dove preferisci (es. `C:\DocMapHub\`), oppure usa
   direttamente quella del repository.
3. Apri la cartella e fai doppio clic su **`run_windows.bat`** una prima volta: crea
   l'ambiente Python (`.venv`) e installa l'unica libreria necessaria (`cryptography`).
   Si chiuderà dicendo che manca la chiave: è normale.
4. Apri il **Prompt dei comandi** nella cartella (nella barra dell'indirizzo di Esplora file
   scrivi `cmd` e premi Invio) ed esegui:

   ```bat
   run_windows.bat init
   run_windows.bat keygen
   ```

   `keygen` chiede una **passphrase** (almeno 10 caratteri, meglio una frase lunga).
   **Scrivila su carta e conservala in un luogo sicuro.** Non viene salvata da nessuna parte.
5. Esporta la chiave pubblica da consegnare al team del server (vedi §6):

   ```bat
   run_windows.bat export-public-key --out chiavi-pubbliche.json
   ```

6. Fai subito il **primo backup** (§5).

Da qui in poi: doppio clic su `run_windows.bat` → chiede la passphrase → si apre il browser
sulla pagina del hub. La pagina risponde **solo da quel PC** (127.0.0.1). Chiudendo la finestra
nera il hub si spegne.

**Dove sono i dati:** `%APPDATA%\DocMapHub` (es. `C:\Users\Dave\AppData\Roaming\DocMapHub`).
Per usare un'altra cartella: variabile d'ambiente `DOCMAP_HUB_DIR` oppure opzione `--dir`.

```
DocMapHub\
  registry.sqlite3          registro (clienti, installazioni, licenze, operazioni)
  keys\keys.json            elenco chiavi (attiva e ritirate) con le chiavi pubbliche
  keys\<id>.key.pem         chiave PRIVATA, cifrata con la passphrase
  keys\<id>.pub.pem         chiave pubblica
  issued\*.docmap-licence   copia di ogni licenza emessa
  backups\*.zip             backup creati con il comando backup
  plans.json                (facoltativo) piani personalizzati: se c'è, vince su quello di serie
  envs\<installazione>\<ambiente>\   (v0.2) ambienti locali: config.json, data\, app\, server.log, sync\
  deploy-backups\…          (v0.2) copia del server fatta PRIMA di ogni deploy (file sostituiti, data\, .htaccess)
  known_hosts               (v0.2) chiavi dei server SFTP già verificate
  _trash\                   (v0.2) ambienti eliminati o demo scadute: spostati qui, mai cancellati
```

Su Linux/macOS: `cd docmapv1/hub && pip install cryptography && python3 -m docmap_hub ...`
(dati in `~/.docmap-hub`).

---

## 2. Concetti

| Termine | Cos'è |
|---|---|
| **Cliente** | lo studio che usa DocMap (nome, P.IVA, email) |
| **Installazione** | un server DocMap di un cliente (un PC in studio oggi, il cloud domani). Ha un `instance_id` unico. Ogni cliente ha la sua installazione (single-tenant) |
| **Rivenditore** | un cliente che rivende DocMap ai propri clienti, eventualmente con il **proprio marchio** |
| **Piano** | pacchetto predefinito di limiti e funzioni (`run_windows.bat plans`) |
| **Licenza** | file firmato legato a **una** installazione: piano, scadenza, tolleranza, limiti, funzioni, rivenditore, marchio |

Piani di serie (`docmap_hub/plans.json`, valori modificabili al momento dell'emissione):

| piano | utenti | faldoni | archivi | funzioni |
|---|---|---|---|---|
| `trial` (1 mese, 7 gg tolleranza) | 2 | 300 | 1 | mobile_scan |
| `studio` | 5 | 5.000 | 3 | mobile_scan |
| `studio_pro` | 15 | 20.000 | 10 | mobile_scan, sync_server, status_events, ai_credits |
| `conto_terzi` | 30 | 100.000 | 50 | come studio_pro |
| `appliance` | 10 | 20.000 | 5 | mobile_scan, sync_server, status_events |
| `reseller` | 50 | illimitati | illimitati | tutte + white_label |

Durata predefinita 12 mesi, tolleranza 30 giorni.

---

## 3. Emettere una licenza per un nuovo studio

Dalla pagina: *Nuovo cliente* → *Nuova installazione* → *Emetti licenza* → *Scarica il file*.

Dalla riga di comando:

```bat
run_windows.bat customer add --name "Studio Rossi" --vat IT01234567890 --email info@studiorossi.it
run_windows.bat instance add --customer "Studio Rossi" --label "PC archivio"
run_windows.bat licence issue --instance "PC archivio" --plan studio_pro --out C:\Temp\studio-rossi.docmap-licence
```

- Se il server del cliente ha già generato il suo `instance_id`, registralo con
  `instance add ... --id <instance_id>`; altrimenti il hub ne crea uno e va scritto nella
  configurazione del server (vedi §6).
- Variazioni rispetto al piano: `--users 8`, `--binders -1` (illimitato), `--months 24`,
  `--expires 2027-12-31`, `--grace-days 60`, `--feature ai_credits`, `--no-feature mobile_scan`.
- Invia il file al cliente (email, chiavetta): va caricato dalle impostazioni del server o
  copiato nella sua cartella dati come `licence.docmap-licence`.

Controllare un file: `run_windows.bat licence show C:\percorso\file.docmap-licence`.

### Rinnovo

```bat
run_windows.bat licence renew "PC archivio"            :: o l'id della licenza
run_windows.bat licence renew "PC archivio" --months 24 --plan conto_terzi
```

Il rinnovo crea un **nuovo file**, valido subito, che **prolunga dalla vecchia scadenza** se non è
ancora arrivata (nessun giorno perso), altrimenti da oggi. Limiti e funzioni restano quelli della
licenza precedente, a meno di cambiare piano. Dalla pagina: pulsante *rinnova* sulla riga.

---

## 4. Licenza per il cliente di un rivenditore (white-label)

```bat
run_windows.bat reseller add --name "Rete Studi Srl" --vat IT09876543210 ^
    --product-name "ArchivioFacile" --primary-color "#0a5c8a" --support-email assistenza@retestudi.it
run_windows.bat customer add --name "Studio Bianchi" --reseller "Rete Studi Srl"
run_windows.bat instance add --customer "Studio Bianchi" --label "PC Bianchi"
run_windows.bat licence issue --instance "PC Bianchi" --plan studio
```

La licenza di Studio Bianchi conterrà `reseller: {id, name}` e il blocco `branding`
(`product_name`, colore, email assistenza, logo) e la funzione `white_label`: il server mostrerà
il marchio del rivenditore. Per l'installazione propria del rivenditore usa il piano `reseller`.
Senza `--product-name` il rivenditore viene solo registrato (nessun marchio personalizzato).

---

## 5. Backup — IMPORTANTISSIMO

**Se perdi la chiave privata o la passphrase non potrai più rinnovare nessuna licenza**:
dovresti creare una chiave nuova e far aggiornare tutti i server dei clienti.

```bat
run_windows.bat backup
run_windows.bat backup --out E:\backup-hub\docmap-hub.zip
```

Il backup contiene registro, chiavi (la privata resta **cifrata**), licenze emesse, piani e (v0.2) la cassaforte
(sempre cifrata, anche come `vault-export.json`) e `known_hosts`. **Non** contiene le cartelle degli ambienti locali
(`envs\`: sono copie di prova, si ricreano) né `deploy-backups\` (copiali a parte se vuoi conservarli).
Regole:

1. fai un backup dopo `keygen` e dopo ogni giornata in cui emetti licenze;
2. tieni **due copie in due luoghi diversi** (chiavetta USB in cassaforte + cloud personale);
3. la **passphrase** va conservata separatamente dal backup (carta, gestore di password);
4. ripristino: copia il contenuto dello zip nella cartella dati (`%APPDATA%\DocMapHub`).

**Cambio chiave** (sospetto di furto, o per prudenza ogni qualche anno):
`run_windows.bat keygen --rotate`. La vecchia chiave resta nel registro come *ritirata*:
le licenze già emesse continuano a valere finché il server ne conosce la chiave pubblica.
Esporta di nuovo `export-public-key` e consegnalo al team del server per il prossimo
aggiornamento.

Il registro delle operazioni: `run_windows.bat log`.

---

## 6. Contratto di integrazione per il server (`server-python/`)

### Il file di licenza

```json
{
  "format": 1,
  "key_id": "dmk20261101-8b60",
  "licence": {
    "licence_id": "uuid", "format": 1,
    "customer": {"name": "Studio Rossi", "vat_id": "IT…", "email": "…"},
    "instance_id": "uuid dell'installazione",
    "plan": "studio_pro",
    "issued_at": "2026-11-01T10:00:00Z", "valid_from": "…Z", "expires_at": "2027-11-01T10:00:00Z",
    "grace_days": 30,
    "limits": {"users": 15, "binders": 20000, "archives": 10},
    "features": ["ai_credits", "mobile_scan", "status_events", "sync_server"],
    "reseller": null, "branding": null,
    "key_id": "dmk20261101-8b60"
  },
  "signature": "base64 della firma Ed25519 di canonical_json(licence)"
}
```

`canonical_json` = JSON con chiavi ordinate, separatori `,` e `:` senza spazi, UTF-8 senza
escape ASCII, niente numeri decimali. Un limite `null` significa illimitato.

### Dove stanno i file sull'installazione

| Cosa | Dove | Note |
|---|---|---|
| verificatore | copia di `hub/docmap_hub/licence.py` nel server (es. `server-python/app/licence.py`) | dipende solo da `cryptography`; non modificarlo nel server, si aggiorna ricopiandolo |
| chiavi pubbliche fidate | **costante nel codice del server** (`TRUSTED_LICENCE_KEYS = {"dmk…": "base64…"}`), presa da `export-public-key` | non leggerle da un file nella cartella dati: chi può scrivere lì potrebbe sostituire la chiave. Un file `public-keys.json` va bene solo per sviluppo/test (`L.load_public_keys_json`) |
| licenza installata | `<cartella dati del server>/licence/licence.docmap-licence` | la precedente si conserva come `licence.prev.docmap-licence` |
| identità dell'installazione | `<cartella dati del server>/instance.json` → `{"instance_id": "…"}` | se manca, il server adotta l'`instance_id` della prima licenza valida installata e lo scrive |

### Come usare `verify()`

```python
import licence as L
st = L.verify(path.read_bytes() if path.exists() else None,
              TRUSTED_LICENCE_KEYS, instance_id=instance_id)   # non solleva mai eccezioni
```

Da chiamare all'avvio, quando si carica una nuova licenza e almeno una volta al giorno
(il risultato cambia con il passare del tempo, non solo con il file).

| `st.mode` | Comportamento dell'app |
|---|---|
| `full` | tutto normale. Se `st.expiring_soon` (≤ 30 giorni) → avviso discreto con `st.message_it` |
| `grace` | **tutto funziona**, banner arancione permanente con `st.message_it` (giorni di tolleranza rimasti: `st.grace_days_left`) |
| `read_only` | banner rosso; **lettura, ricerca, stampa etichette, esportazioni e backup sempre consentiti**; le scritture rispondono `403 {"error":"licence_read_only"}`; la sync può ricevere ma non inviare modifiche |
| `invalid` | **come `read_only`** (mai blocco dei dati); motivo in `st.reasons` (`missing`, `bad_signature`, `unknown_key`, `instance_mismatch`, …) |

- Usare `st.writable` (True in `full`/`grace`) come unico interruttore per le scritture.
- **Limiti:** prima di creare un utente/faldone/archivio,
  `L.check_limits(st, {"users": n_utenti, "binders": n_faldoni, "archives": n_archivi}).can_add("users")`;
  se False → `403 {"error":"licence_limit"}`. Nulla viene mai cancellato o nascosto se si supera
  un limite (es. dopo un passaggio a un piano inferiore): si blocca solo l'aggiunta.
- **Funzioni:** `st.has_feature("sync_server")`, `"mobile_scan"`, `"status_events"`, `"ai_credits"`,
  `"white_label"` abilitano le parti corrispondenti. Con `white_label` usare `st.branding`
  (`product_name`, `primary_color`, `logo_url`, `support_email`) per nome e colori dell'interfaccia.
- **API:** `GET /v1/me` (o `/v1/licence`) restituisce un estratto di `st.to_dict()`:
  `mode`, `writable`, `message_it`, `days_left`, `grace_days_left`, `features`, `limits`, `branding`,
  `licence.customer.name`, `licence.plan`, `licence.expires_at`. Il front-end mostra il banner da qui.
- **Caricare una nuova licenza** (`POST /v1/admin/licence`, solo amministratore): accettarla solo
  se `st.signature_ok` e l'`instance_id` coincide; conservare la precedente come `.prev`.
- Una licenza con `valid_from` nel futuro (oltre 24 ore di tolleranza sull'orologio) dà
  `read_only` con motivo `not_yet_valid`: il server dovrebbe tenere quella attuale finché la nuova
  non è attiva.

---

## 7. Sviluppo

```bash
cd docmapv1/hub
python -m unittest discover -s tests -v
```

I test del deploy FTP/FTPS usano un server FTP locale (`pyftpdlib`, più `pyOpenSSL` per FTPS), che **non** è una
dipendenza del hub: installali in una cartella a parte e indicala con `DOCMAP_HUB_TEST_DEPS`, altrimenti quei test
vengono saltati con un messaggio:

```bash
pip install --target /tmp/hubtestdeps pyftpdlib pyOpenSSL
DOCMAP_HUB_TEST_DEPS=/tmp/hubtestdeps python -m unittest discover -s tests
```

I test degli ambienti locali avviano il vero server-python (servono `fastapi`, `uvicorn`), altrimenti si saltano.

| File | Ruolo |
|---|---|
| `docmap_hub/licence.py` | formato e **verificatore offline standalone** (da copiare nel server) |
| `docmap_hub/keys.py` | chiavi Ed25519, cifratura con passphrase, rotazione, esportazione |
| `docmap_hub/registry.py` | registro SQLite con migrazioni additive (`meta.schema_version`) |
| `docmap_hub/service.py` | emissione, rinnovo, backup (usato da CLI e pagina) |
| `docmap_hub/cli.py` | comandi `python -m docmap_hub …` |
| `docmap_hub/web.py` | pagina locale (solo 127.0.0.1, accesso con la passphrase, token CSRF) |
| `docmap_hub/plans.json` | piani predefiniti |
| `docmap_hub/vault.py` | (v0.2) cassaforte: scrypt + AES-256-GCM, custodia chiave, esportazione |
| `docmap_hub/ports.py` | (v0.2) porte degli ambienti locali (intervallo, prova reale, spostamento automatico) |
| `docmap_hub/runner.py` | (v0.2) avvio/arresto/stato degli ambienti `local-python` (server-python), ping |
| `docmap_hub/envs.py` | (v0.2) ambienti: creazione, copia dati con `sync-remote`, demo, eliminazione, scadenze |
| `docmap_hub/deploy.py` | (v0.2) deploy FTPS/SFTP: piano, backup, caricamento, controllo, ripristino, promote |
| `docmap_hub/health.py` | (v0.2) controllo di tutti gli ambienti e righe del pannello di stato |
| `docmap_hub/web_ops.py` | (v0.2) pagine Istanze & ambienti, Cassaforte, Deploy, Porte, Stato (operazioni lunghe in sottofondo) |

Codici di uscita di `licence verify`: 0 valida, 1 in tolleranza, 2 sola lettura, 3 non valida.
Per automazioni la passphrase può arrivare da `DOCMAP_HUB_PASSPHRASE` o `--passphrase-file`
(da non usare sul PC di tutti i giorni). Mai committare chiavi private o passphrase.

---

## 8. Ambienti: staging, produzione e demo

Ogni installazione (§2) può avere più **ambienti**:

| Ambiente | A cosa serve |
|---|---|
| `production` | quello vero, usato dallo studio |
| `staging` | la prova: qui si prova una nuova versione **prima** di toccare production |
| `demo-…` | una copia temporanea (per esempio per mostrare il programma con i dati veri), con **scadenza** |

E ogni ambiente è di un **tipo**:

| Tipo | Dove gira | Cosa fa il hub |
|---|---|---|
| `web-php` | sul sito (SiteGround), cartella caricata via FTP | deploy FTPS/SFTP (§10), controllo dello stato |
| `local-python` | **sul PC di Dave**, avviato dal hub | crea configurazione e chiave, avvia/ferma il server, porta automatica (§11), copia dei dati |
| `studio-python` | sul PC dello studio (`installer-windows`) | solo controllo dello stato e origine dei dati per staging/demo |

### 8.1 Prima volta: il hub trova il server Python

Gli ambienti `local-python` usano il server di `docmapv1\server-python`. Una volta sola:

```bat
cd C:\percorso\docmapv1\server-python
run_windows.bat --help
cd ..\hub
run_windows.bat server-check
```

Il primo comando crea `server-python\.venv` con FastAPI e uvicorn; `server-check` deve dire **Pronto**.
Il hub cerca server-python nell'ordine: impostazione `server_python_dir`, variabile `DOCMAP_SERVER_PYTHON`, poi la
cartella vicina `..\server-python` (se usi il hub dal repository o dallo zip completo non serve fare nulla). Il
Python usato è `server-python\.venv\Scripts\python.exe` (oppure l'impostazione `server_python_exe`). Esempi:

```bat
run_windows.bat settings set server_python_dir C:\DocMapSviluppo\docmapv1\server-python
run_windows.bat settings set docmap_dir C:\DocMapSviluppo\docmapv1
run_windows.bat settings show
```

(`docmap_dir` serve per trovare `tools\build_deploy.py`, usato da deploy e dalla web app degli ambienti locali.)

### 8.2 Registrare gli ambienti di un'installazione

```bat
run_windows.bat env add --instance "PC Rossi" --name production --kind web-php --url https://docmap.pr-it.it/studio-de/
run_windows.bat env add --instance "PC Rossi" --name staging --kind web-php --url https://docmap.pr-it.it/studio-de-prova/
run_windows.bat env list
```

L'indirizzo dell'API viene ricavato da solo (`…/server-php/api.php`); base path, slug e dominio per il deploy
pure (si cambiano con `env set --base-path … --slug … --domain … --studio-name …`). Per il server in studio:

```bat
run_windows.bat env add --instance "PC Rossi" --name production --kind studio-python --url https://192.168.1.10:8443/ --ca C:\percorso\DocMap-CA-studio.crt
```

**Staging sul sito** = una seconda cartella sullo stesso hosting (es. `public_html/studio-de-prova`, protetta con
password come la vera). Al primo deploy (§10) apri `…/studio-de-prova/server-php/setup.php` e crei utenti e chiave
**di prova**: staging ha la sua configurazione e il suo database, mai quelli di production.

### 8.3 Un ambiente sul PC di Dave (`local-python`)

```bat
run_windows.bat env create-local --instance "PC Rossi" --name staging
run_windows.bat env start --instance "PC Rossi" --name staging
```

`create-local` riserva una porta libera (§11), esegue `python -m docmap_server setup` nella cartella
`envs\<installazione>\staging\` (chiave AES nuova, utenti `admin` e `ponte-hub`), mette i **codici di accesso in
cassaforte** (§9, non vengono stampati) e costruisce la web app. `start` lo avvia e stampa l'indirizzo, es.
`http://127.0.0.1:18400/`: è DocMap completo (app + API), raggiungibile **solo da questo PC**. I codici per entrare:
`vault reveal --instance "PC Rossi" --env staging --kind admin_token --label admin`.

```bat
run_windows.bat env status --instance "PC Rossi" --name staging
run_windows.bat env stop --instance "PC Rossi" --name staging
```

Il server di un ambiente resta acceso anche se chiudi la finestra del hub: fermalo con `env stop`.

### 8.4 Staging con i dati veri (copia da production)

```bat
run_windows.bat customer set --customer "Studio Rossi" --key-escrow on
run_windows.bat vault set --instance "PC Rossi" --env production --kind admin_token --label ponte-hub --field user=ponte-hub --field token=?
run_windows.bat env clone-data --instance "PC Rossi" --from production --to staging --dry-run
run_windows.bat env clone-data --instance "PC Rossi" --from production --to staging
```

- La copia usa il ponte `sync-remote` di server-python (vedi `server-python\GUIDA-SYNC-WEB-LOCALE.md`) in **una sola
  direzione** (production → staging): **production non viene mai modificata**, e la destinazione non può mai essere
  production. Serve un codice di accesso di production con ruolo *Può modificare* (creato dall'app: Codici di
  accesso › Nuovo codice, persona `ponte-hub`) salvato in cassaforte; se la cartella del sito è protetta da password,
  anche `--kind basic_auth`.
- Il profilo del ponte (`envs\…\staging\sync\clone-from-production.json`) **non contiene codici**: il hub li passa
  al ponte in memoria.
- Copiare i dati veri sul PC di Dave significa poterli leggere: per questo serve la **custodia attivata** per quel
  cliente (§9.3), cioè il suo consenso scritto.

### 8.5 Demo a scadenza

```bat
run_windows.bat env demo create --instance "PC Rossi" --days 7
run_windows.bat env demo create --instance "PC Rossi" --days 3 --from none --label fiera
run_windows.bat env purge-expired
```

`demo create` crea `demo-<data>-<codice>` (o `demo-fiera`), con porta, configurazione e dati copiati da production
(`--from none` = demo vuota). Alla scadenza `env purge-expired` la ferma, libera la porta, elimina i suoi segreti e
**sposta** la cartella in `_trash\envs\…` (non cancella niente: si svuota a mano quando vuoi). Conviene lanciarlo ogni
giorno (Utilità di pianificazione: `run_windows.bat env purge-expired`).

### 8.6 Eliminare un ambiente

```bat
run_windows.bat env delete --instance "PC Rossi" --name staging
run_windows.bat env delete --instance "PC Rossi" --name production --production --confirm "PC Rossi"
```

Chiede conferma (`si`). Per **production** servono `--production` e il nome **esatto** dell'installazione. Un
ambiente `web-php`/`studio-python` viene solo tolto dal registro (con i suoi segreti): **il sito o il server remoto
non vengono toccati**. Un ambiente locale viene fermato e la sua cartella spostata in `_trash`.

---

## 9. Cassaforte delle credenziali (e GDPR)

### 9.1 Cosa custodisce

Per ogni ambiente:

| Tipo (`--kind`) | Contenuto |
|---|---|
| `ftp` | host, porta, utente, password, protocollo `ftps` (predefinito) / `sftp` / `ftp`, cartella remota (`remote_path`); facoltativo `cafile` per un certificato privato |
| `admin_token` | codice di accesso di un utente (etichetta = nome utente, es. `admin`, `ponte-hub`) |
| `superadmin` | credenziali superadmin (utente e password) |
| `basic_auth` | utente e password della cartella protetta del sito |
| `db_config` | `config.json` / `config.php` del server, **con la `aes_key`** — solo con custodia attiva (§9.3) |
| `note` | nota libera |

### 9.2 Come si usa

```bat
run_windows.bat vault init
run_windows.bat vault set --instance "PC Rossi" --env production --kind ftp --field host=ftp.docmap.pr-it.it --field user=dave@docmap.pr-it.it --field password=? --field remote_path=/docmap.pr-it.it/public_html/studio-de
run_windows.bat vault set --instance "PC Rossi" --env production --kind basic_auth --field user=studio --field password=?
run_windows.bat vault list
run_windows.bat vault reveal --instance "PC Rossi" --env production --kind ftp --reason "verifica accesso"
```

`password=?` fa scrivere la password **senza mostrarla** (non resta nella cronologia del Prompt).
`vault list` non mostra mai i segreti; `reveal` richiede **ogni volta** la passphrase e scrive nel registro delle
operazioni chi/quando/perché (mai il segreto). Nella pagina: scheda *Cassaforte*, pulsante *mostra* con la passphrase.

**La passphrase**: di serie è **la stessa della chiave di firma** (`keygen`), così la pagina apre la cassaforte con il
login. Se ne vuoi una diversa, sceglila a `vault init`; per la pagina imposta la variabile `DOCMAP_HUB_VAULT_PASSPHRASE`
o aprila dalla scheda *Cassaforte*. Cambio: `vault change-passphrase`.

**Come è protetta**: chiave AES-256 ricavata dalla passphrase con **scrypt** (N=2^15, r=8, p=1, sale casuale);
ogni segreto è cifrato con **AES-256-GCM** (nonce casuale) e legato alla sua riga (ambiente|tipo|etichetta): copiato
su un'altra riga non si decifra. La passphrase non viene mai salvata. Nel file `registry.sqlite3` non c'è nulla di
leggibile.

**Backup**: `run_windows.bat backup` include la cassaforte (dentro il registro e anche come `vault-export.json`,
sempre cifrata). Per portarla su un altro PC/hub: `vault export --out file.json` e, sull'altro hub, `vault import
file.json` (chiede la passphrase di origine; gli ambienti si riconoscono dall'id dell'installazione e dal nome).

### 9.3 Custodia della chiave (key escrow) e GDPR

Chi possiede la `aes_key` di un'installazione **può leggere tutti i dati dello studio**. Per questo ogni cliente ha
l'interruttore **custodia della chiave**, **spento di serie**. Finché è spento il hub:

- **rifiuta** di custodire `db_config` e qualunque segreto che contenga `aes_key`;
- prima di un deploy registra di `config.php` solo **dimensione e impronta** (per verificare che il deploy non lo
  tocchi), senza conservarne il contenuto;
- **non copia** i dati veri dello studio sul PC di Dave (`clone-data`, demo con dati).

Si attiva solo con il **consenso scritto** del cliente (contratto/nomina di Dave a responsabile del trattamento,
art. 28 GDPR), quando lo studio vuole che Dave possa recuperare la chiave per lui:

```bat
run_windows.bat customer set --customer "Studio Rossi" --key-escrow on
run_windows.bat customer set --customer "Studio Rossi" --key-escrow off --purge
```

Spegnendola, `--purge` elimina dalla cassaforte le configurazioni già custodite. Con la custodia attiva il PC di Dave
contiene dati leggibili: disco cifrato (BitLocker), account Windows con password, backup del hub cifrati e in luogo
sicuro.

---

## 10. Deploy FTP/SFTP sicuro

### 10.1 Il comando

```bat
run_windows.bat deploy --instance "PC Rossi" --env staging --dry-run
run_windows.bat deploy --instance "PC Rossi" --env staging
```

Cosa succede, nell'ordine:

1. **costruisce** la web app con `tools\build_deploy.py` in una cartella temporanea (base path, slug, dominio e
   nome dello studio dell'ambiente);
2. **legge il server**: elenco dei file e `DEPLOY-MANIFEST.txt` (le impronte sha256 dell'ultimo deploy) → mostra il
   **piano**: file nuovi/modificati da caricare, file protetti, file obsoleti. Con `--dry-run` si ferma qui;
3. chiede conferma (`si`; `--yes` per non chiederla) e fa **prima il backup** in
   `deploy-backups\<installazione>\<ambiente>\<data-ora>\`: ogni file che sta per essere sostituito (`before\`),
   tutta la cartella `server-php\data\` (`data\`), i `.htaccess`, e `backup.json` con il riepilogo;
4. **carica** solo i file cambiati (nome temporaneo `.dmtmp` e poi rinomina; il manifest per ultimo);
5. **controlla** `…/server-php/api.php?r=ping`: deve rispondere con la **stessa versione** appena costruita (5
   tentativi). Se no → **ripristino automatico** dei file precedenti, e il comando lo dice chiaramente.

**Mai toccati**: `server-php/config.php` (non è nel pacchetto), i file già presenti in `server-php/data/`,
`server-php/setup.php` quando `config.php` esiste già (setup fatto: non si riapre), i `.htaccess` modificati a mano
sul server (si sostituiscono solo con `--overwrite-htaccess`). Il deploy **non cancella mai** file sul server: gli
obsoleti vengono solo elencati.

### 10.2 Promuovere staging → production

```bat
run_windows.bat deploy --instance "PC Rossi" --env staging
REM ... provi lo staging nel browser ...
run_windows.bat promote --instance "PC Rossi" --dry-run
run_windows.bat promote --instance "PC Rossi"
```

`promote` pubblica in production **esattamente** il codice verificato su staging (stessa versione e stessa impronta
del codice, esclusi i file che dipendono dall'indirizzo come `docmap.config.js` e `.htaccess`). Se nel frattempo il
codice è cambiato, rifiuta: rifai il deploy su staging e riprova.

### 10.3 Protocolli

| Protocollo | Quando | Note |
|---|---|---|
| `ftps` (predefinito) | SiteGround e quasi tutti gli hosting | FTP con TLS esplicito, certificato verificato, canale dati cifrato, TLS ≥ 1.2 |
| `sftp` | se l'hosting dà accesso SSH (SiteGround: Site Tools › Dev › SSH) | serve `paramiko` (vedi `requirements.txt`). La prima volta il hub mostra l'impronta del server: controllala e ripeti con `--trust-host-key` |
| `ftp` | **sconsigliato**: password e file in chiaro | rifiutato, salvo `--insecure-ftp` |

Dalla pagina: scheda *Deploy* → *Prepara il piano* (prova) → leggi il piano → spunta e *Conferma il deploy*. Il deploy
confermato deve pubblicare lo stesso codice della prova (entro 30 minuti), altrimenti chiede di rifarla.

---

## 11. Porte

Gli ambienti `local-python` girano sul PC di Dave, ognuno su una porta diversa.

- Le porte vengono da un intervallo, di serie **18400-18999** (`ports set-range 20000 20999` per cambiarlo).
- Ogni porta riservata è scritta nel registro e il database **impedisce** che due ambienti abbiano la stessa porta.
- Una porta è libera solo se nessuno la sta usando e si può aprire su 127.0.0.1 e 0.0.0.0 (e ::1 / :: con IPv6). Le
  porte usate da altri programmi vengono saltate.
- **All'avvio** (`env start`), se nel frattempo un altro programma ha preso la porta dell'ambiente, il hub la
  **sposta da solo** su una libera, lo dice e lo scrive nel registro (`port.move`). Se la porta viene presa proprio
  nell'istante dell'avvio, riprova su un'altra.
- Eliminando un ambiente (o alla scadenza di una demo) la porta torna libera.

```bat
run_windows.bat ports list
run_windows.bat ports check 18400
run_windows.bat ports set-range 18400 18999
```

---

## 12. Pannello di stato

```bat
run_windows.bat check-all
run_windows.bat status
run_windows.bat status --json
```

`check-all` interroga **tutti** gli ambienti in parallelo (`?r=ping`, timeout 5 secondi ciascuno: un sito lento non
blocca gli altri) e salva l'esito; `status` mostra per ogni installazione e ambiente: stato, raggiungibile sì/no (e
perché), versione, scadenza della licenza con i giorni rimasti, ultimo backup fatto dal hub (prima di un deploy) e
ultimo controllo. Se le cartelle dei siti sono protette da password, `check-all` usa le `basic_auth` della cassaforte
quando la passphrase è disponibile (`DOCMAP_HUB_PASSPHRASE`); altrimenti un sito protetto risulta "protetto (401)",
che vuol dire comunque raggiungibile.

Nella pagina: scheda *Stato* → *Controlla tutto adesso*: il controllo gira in sottofondo e la pagina non si blocca.

## 13. Nuovo cliente (`cliente nuovo`, v0.3)

| Comando | Cosa fa |
|---|---|
| `cliente nuovo --nome … --piano … [--piva] [--email] [--rivenditore] [--custodia-chiave on] --installazioni sede\|online\|entrambe [--url-online] [--url-staging] [--url-sede] [--ftp-protocollo ftps\|sftp] [--ftp-host --ftp-utente --ftp-password ? --ftp-porta --ftp-cartella --ftp-cartella-staging] [--nome-studio] [--rigenera] [--senza-pacchetti] [--con-segreti]` | cliente (ritrovato da P.IVA o nome), installazioni `<nome> — sede` / `<nome> — online`, ambienti (sede: production studio-python; online: production + staging web-php), FTP in cassaforte, licenze (solo se non ce n'è una valida), poi `clienti/<slug>/`: `sede/DocMap-<slug>-sede.zip` (installer-windows `pacchetto --chiave-pubblica --licenza --nome-studio --sync-modello`), `online/<env>/sito` + zip (tools/build_deploy.py, invocato e mai modificato), `scheda-cliente.html`, `licenze/`, `chiave-pubblica.json`, `sync-modello.json`, `cliente.json`, la guida |
| `cliente scheda --cliente X [--con-segreti]` | rifà la scheda stampabile; con `--con-segreti` (passphrase della cassaforte) scrive a parte `scheda-cliente-CON-SEGRETI.html` (permessi 0600, registrato nel log) |
| `cliente token-ponte --cliente X --salva \| --esporta FILE` | token di `ponte-sync` mostrato da setup.php → cassaforte; esportato su file nuovo (0600, mai sovrascritto) per `configura-sync.ps1 -TokenFile` |
| `cliente elenco` | clienti, installazioni, prima scadenza, cartella |
| `settings set installer_dir …` | dove sta `installer-windows` (predefinito: accanto a `hub/`) |

Non fatto (da fare a mano, vedi la guida §5): più sedi per lo stesso cliente con `cliente nuovo`.


---

## 14. Gestionale e Pipeline 1 (v0.4–0.5)

**Registro (schema 3, migrazione additiva con copia in `backups/` prima di aggiornare):** `projects` (gruppo di
installazioni di un cliente; ogni installazione ha `project_id`, le vecchie vanno nel progetto «DocMap <cliente>»),
`workstations` (postazioni con nome/etichetta, stato `active|revoked`, `built_at`), `drafts` (bozze della pipeline, mai
segreti), `customers.extra_json` (pec, referente, telefono, indirizzo, città, provincia, sdi, codice_multi, tags, color)
e `customers.status` (`active|prospect|suspended|archived`).

**Pagina:** `docmap_hub/ui/` (index.html, app.js, app.css; nessun framework, nessuna risorsa esterna; CSP
`script-src 'self'`). `GET /` serve l'app; `/classico` è la pagina licenze della 0.3; le altre pagine 0.3 restano.
L'app parla con `/api/...` (`docmap_hub/api.py`): sessione con cookie HttpOnly SameSite=Strict, ogni POST JSON con
intestazione `X-CSRF`, controllo dell'Host come prima. Login: `POST /api/login` (sblocca chiave e cassaforte con la stessa
passphrase, `remember` = salva con `autoaccess`), `POST /api/setup` (hub nuovo). Avvio senza passphrase in console:
`web` sblocca solo con variabile d'ambiente / `--passphrase-file` / accesso automatico.

**Pipeline 1 (`docmap_hub/pipeline.py`):** `build_prompt()` (contesto, regole, piani, `TEMPLATE`, `EXAMPLE`),
`extract_json()` (JSON nudo, blocco ```json o messaggio intero), `normalize()` (forma del modello, chiavi sconosciute
scartate), `strip_secrets()` (password FTP vere tolte dalla bozza), `validate()` (errori bloccanti + avvisi, incluso
«cliente già esistente»), `to_request()` → `ClienteNuovo` (con `licenza_kw` per mesi/limiti), `apply_extras()`
(anagrafica, nome e dati del progetto, postazioni). Conferma = job in sottofondo con `Onboarding.run`.

**Pacchetti (`docmap_hub/packages.py`):** `/scarica/postazione/<id>` (zip generato al volo: `collega-questo-pc.bat/.ps1`,
`postazione.json`, `LEGGIMI.txt`), `/scarica/sede/<cliente>` (installer costruito dall'onboarding),
`/scarica/web/<ambiente>` (sito + `LEGGIMI-AUTOINSTALL.txt`, costruito con `POST /api/envs/<id>/package`).

**Test:** `tests/test_v04_manager.py`, `tests/test_v05_pipeline.py` (totale 97 con i precedenti).

## 15. Pubblicare e gestire dal gestionale (v0.6)

**Deploy e promozione.** `POST /api/envs/<id>/deploy-plan` e `POST /api/instances/<id>/promote-plan` avviano la prova
(job `deploy-plan` / `promote-plan`, stessa funzione della pagina classica). `GET /api/jobs/<id>` restituisce `plan`
(versioni, conteggi, elenchi corti, `valid_seconds`). `POST /api/jobs/<id>/confirm {"sure": true}` avvia il deploy vero
solo se il piano è riuscito, ha file da caricare, ha meno di 30 minuti e non è già stato confermato; il codice deve essere
identico (code hash) a quello della prova. Backup del server, caricamento, controllo e ripristino automatico sono quelli
di `deploy.py` (§10).

**Cassaforte.** `POST /api/vault/unlock` (crea la cassaforte se non esiste: `passphrase` + `again`), `POST /api/vault/lock`.
`GET /api/envs/<id>/secrets` elenca solo tipo/etichetta/data; `POST /api/envs/<id>/secrets` salva (stessi campi della
pagina classica); `…/secrets/reveal` richiede **sempre** la passphrase (1 s di attesa se sbagliata, evento `vault.reveal`);
`…/secrets/delete` richiede `sure`.

**Ambienti.** `POST /api/envs` (web-php o studio-python: `instance_id`, `name`, `url`, `api_url`, `base_path`,
`studio_name`), `POST /api/envs/local` (job, codici in cassaforte), `POST /api/envs/<id>/start|stop` (solo local-python),
`POST /api/envs/<id>` (`url`, `api_url`).

**Backup automatici (`docmap_hub/backups.py`).** Impostazioni `backup.auto` (1/0), `backup.every_hours` (24),
`backup.keep` (14), `backup.copy_dir`. `Scheduler` parte con `web` (primo controllo dopo 20 s, poi ogni 15 min) e usa il
lock della pagina. Nomi `docmap-hub-auto-<data>.zip`; si cancellano solo questi, oltre il numero da tenere. `GET|POST
/api/backups`, `POST /api/backups/now`, download `/scarica/backup/<nome>` (nome controllato, solo `.zip`/`.sqlite3` in
`backups\`). Avviso in Panoramica se l'ultimo tentativo è fallito, se sono spenti o se l'ultimo è più vecchio di 3 periodi.

**Errori.** Un'eccezione imprevista in un'API risponde 500 con un messaggio e scrive `web.error` nello storico.

**Test:** `tests/test_v06_ops.py` (totale 104).

## 16. Controllo delle licenze a distanza (v0.7)

**Formato.** Campi facoltativi della licenza: `status` (`active|suspended|revoked`; sospesa/revocata = `read_only` con
motivo `suspended`/`revoked`), `resume` (date e tolleranza da ripristinare), `update_url` (http(s), firmato). I verificatori
precedenti ignorano i campi: per questo una licenza sospesa/revocata ha anche `expires_at` nel passato e `grace_days` 0.
`issued_at` è strettamente crescente per installazione (`licensing._derive`).

**`docmap_hub/licensing.py`.** `suspend(…, revoke=False)`, `reactivate(…, months=None)`, `modify(limits, add/remove
features, expires_at, grace_days)`, `set_autorenew`/`renew_short(allow_shorter)`/`autorenew_due`, canale
(`set_channel(env web-php)`, `token_for`, `update_url`, `channel_view`, `pending`, `publish` → `licenze/<token>.docmap-licence`
+ `index.html` + `.htaccess` via `deploy.open_remote`), `Scheduler` (ogni 30 min con hub sbloccato: rinnovi dovuti e
pubblicazione se la cassaforte è aperta). Impostazioni: `licence.channel`, `licence.token.<iid>`, `licence.published.<iid>`,
`licence.autorenew.<iid>`, `licence.revoked.<iid>`. `Registry.latest_licence` = la più recente **non sostituita**.
`renew_with_key` rifiuta una licenza revocata e riattiva una sospesa (tolleranza da `resume`).

**Server Python (`server-python/docmap_server/licence.py`).** `check_candidate` (firma, installazione, mai più vecchia:
`issued_at` minore → rifiutata, salvo `--force`), `install_bytes`, `update_url` (config `licence_update_url` o campo
firmato), `fetch_update` (64 KB max, timeout 20 s, mai eccezioni), `start_updater` (dentro `serve`: dopo 60 s e ogni 6 h,
solo con `licence_required`). CLI `licence update`, `licence install --force`.

**Esportazione.** `backups.export_encrypted` (zip di `Hub.backup` cifrato scrypt + AES-256-GCM, intestazione
`DOCMAP-HUB-EXPORT/1` autenticata), `decrypt_export`, `import_encrypted` (solo cartella dati vuota; solo
`registry.sqlite3`, `plans.json`, `known_hosts`, `keys/*`, `issued/*`). CLI `esporta-hub`, `importa-hub`.

**API.** `POST /api/instances/<id>/licence/{suspend|revoke|reactivate|modify|renew-short}`,
`POST /api/instances/<id>/licence/autorenew`, `GET|POST /api/licence-channel`, `POST /api/licence-channel/publish`
(`reissue` = riemette con l'indirizzo le licenze emesse prima del canale), `POST /api/export`. Dopo ogni azione la licenza
è pubblicata subito se canale e cassaforte lo permettono (`publish_job`).

**Test:** `tests/test_v07_licences.py` (totale 112); server: `server-python/tests/test_licence_channel.py`.
