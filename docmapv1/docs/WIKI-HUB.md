# Wiki di DocMap Hub

Vale per **hub 0.3.1**, **DocMap 26.12.5 (app v12.5)** e **strumenti di installazione 1.2.0**. Data: 3 novembre 2026.

È scritta per due lettori:

- **Dave**: ogni capitolo dice cosa fare, in che ordine e cosa aspettarsi.
- **Il suo agente AI**: tutti i comandi sono scritti per intero, con gli ingressi e le uscite attese; le regole operative
  sono al capitolo 9 (e, in breve, in `hub/AGENTE-OPERATIVO.md`).

Per il percorso del primo cliente c'è anche `GUIDA-NUOVO-CLIENTE.md`. Questa wiki la completa con tutte le
funzioni del hub.

---

## Indice

1. [Cos'è il hub e dove stanno le cose](#1-cose-il-hub-e-dove-stanno-le-cose)
2. [Prima installazione](#2-prima-installazione)
3. [Aggiornare il hub senza perdere chiavi e cassaforte](#3-aggiornare-il-hub-senza-perdere-chiavi-e-cassaforte)
4. [Accesso automatico: una sola passphrase, mai più richieste](#4-accesso-automatico-una-sola-passphrase-mai-piu-richieste)
5. [Le parole del hub](#5-le-parole-del-hub)
6. [Ricette passo per passo](#6-ricette-passo-per-passo)
7. [La pagina web del hub](#7-la-pagina-web-del-hub)
8. [Tutti i comandi](#8-tutti-i-comandi)
9. [Per l'agente AI: regole operative](#9-per-lagente-ai-regole-operative)
10. [Problemi comuni](#10-problemi-comuni)
11. [Cosa non è ancora provato](#11-cosa-non-e-ancora-provato)

---

## 1. Cos'è il hub e dove stanno le cose

Il hub è il programma, sul **tuo** PC, che:

- emette e rinnova le **licenze** firmate dei clienti;
- tiene il **registro** di clienti, installazioni, ambienti (production, staging, demo) e rivenditori;
- custodisce nella **cassaforte** cifrata password FTP, token e (solo con consenso) le chiavi dei database;
- prepara per ogni cliente il **pacchetto di installazione** per il suo PC e il **sito** per l'hosting;
- **pubblica** il sito via FTPS/SFTP (con prova, backup, controllo e ritorno indietro automatico);
- controlla lo **stato** di tutte le installazioni.

I server dei clienti **non dipendono** dal hub: le licenze si verificano offline. Se il tuo PC è spento, i clienti
lavorano lo stesso.

### Programma e dati sono in due posti diversi

| Cosa | Dove | Negli aggiornamenti |
|---|---|---|
| **Programma** | la cartella dove hai estratto lo zip, es. `C:\DocMapHub\` (sottocartelle `hub\`, `installer-windows\`, `server-python\`, `server-php\`, `assets\`, `tools\`, …) | si sostituisce |
| **Dati** | `%APPDATA%\DocMapHub\` (sul tuo utente Windows; scrivi `%APPDATA%\DocMapHub` nella barra di Esplora file) | **non si tocca mai** |

Dentro i dati:

| Percorso | Contenuto |
|---|---|
| `keys\` | la chiave di firma (privata, cifrata con la passphrase) e le chiavi pubbliche |
| `registry.sqlite3` | registro: clienti, installazioni, ambienti, licenze emesse, cassaforte (cifrata), registro operazioni |
| `issued\` | i file di licenza emessi |
| `clienti\<nome>\` | quello che prepara `cliente nuovo`: pacchetti, siti, scheda cliente |
| `deploy-backups\` | copie di ciò che c'era sul server prima di ogni deploy |
| `backups\` | gli zip di `backup` |
| `accesso-automatico.json` | solo se attivi l'accesso automatico (capitolo 4) |

Il comando `run_windows.bat info` ti mostra in ogni momento le due cartelle, la versione e la chiave attiva.

---

## 2. Prima installazione

1. Installa **Python 3.11 o più recente** da <https://www.python.org/downloads/>, spuntando **"Add python.exe to PATH"**.
2. Estrai lo zip in `C:\DocMapHub\` (o dove vuoi). Non spostare le sottocartelle: il hub le usa per costruire pacchetti e siti.
3. Apri `C:\DocMapHub\hub\`, scrivi `cmd` nella barra dell'indirizzo, Invio. Poi:

```bat
run_windows.bat init
run_windows.bat keygen
run_windows.bat vault init
run_windows.bat accesso-automatico attiva
run_windows.bat export-public-key --out chiave-pubblica.json
run_windows.bat backup
```

- La prima volta `run_windows.bat` crea l'ambiente Python in `hub\.venv` (serve Internet, un minuto).
- `keygen` chiede la passphrase della chiave di firma (almeno 10 caratteri). **Scrivila su carta.**
- `vault init` chiede la passphrase della cassaforte: **usa la stessa** (così ne hai una sola).
- `accesso-automatico attiva` (facoltativo, capitolo 4): da qui in poi nessun comando chiede più la passphrase.
- `backup` crea uno zip in `%APPDATA%\DocMapHub\backups\`: **copialo su una chiavetta USB**.

Uscita attesa di `keygen`: `Chiave creata: <key_id>`. Di `backup`: il percorso dello zip.

---

## 3. Aggiornare il hub senza perdere chiavi e cassaforte

Le chiavi, la cassaforte e i clienti sono in `%APPDATA%\DocMapHub\`, **non** nella cartella del programma. Per questo
aggiornare è sicuro: sostituire la cartella del programma non tocca mai i dati.

**Ogni volta che ricevi un hub nuovo (es. da 0.3 a 0.3.1):**

1. Chiudi la pagina del hub (finestra nera: Ctrl+C) e ogni comando in corso.
2. `run_windows.bat backup` e copia lo zip sulla chiavetta (per scrupolo).
3. Estrai il nuovo zip in una cartella temporanea, apri la cartella `DocMap-hub-0.3.1\` e **copia tutto il suo
   contenuto dentro `C:\DocMapHub\`**, scegliendo **«Sostituisci i file nella destinazione»**.
   - Non cancellare `C:\DocMapHub\hub\.venv\` (l'ambiente Python: se lo cancelli si ricrea da solo, serve Internet).
   - Il file `chiave-pubblica.json` che avevi esportato può restare: non è segreto.
4. Controlla: `run_windows.bat info` → deve dire `DocMap Hub 0.3.1` e mostrare la stessa chiave attiva di prima.
5. Se `info` segnala un'impostazione che punta a una cartella che non esiste più (`installer_dir`, `docmap_dir`,
   `server_python_dir`), toglila: `run_windows.bat settings set installer_dir ""`.

In alternativa puoi estrarre la versione nuova in una cartella nuova (es. `C:\DocMapHub-0.3.1\`) e usare quella: i dati
sono gli stessi perché stanno in `%APPDATA%`. La prima volta ricrea `.venv`.

**Cosa non fare mai:** cancellare `%APPDATA%\DocMapHub\`, oppure lanciare `keygen --rotate` "per sicurezza" (crea una
chiave nuova: le licenze vecchie restano valide, ma i pacchetti nuovi avranno una chiave pubblica diversa).

**Ripristino da backup** (PC nuovo o rotto): installa il hub (capitolo 2, solo i punti 1–2), estrai lo zip di backup
dentro `%APPDATA%\DocMapHub\` (crea la cartella se non c'è), poi `run_windows.bat info`. Le cartelle `clienti\` non
sono nel backup: si rifanno con `cliente nuovo … --rigenera`.

---

## 4. Accesso automatico: una sola passphrase, mai più richieste

Di base il hub chiede la passphrase a ogni comando che firma una licenza o apre la cassaforte. Con l'**accesso
automatico** la chiedi **una volta** e il hub se la ricorda su questo PC. Vale per te, per la pagina web e per il tuo
agente.

```bat
run_windows.bat accesso-automatico attiva
run_windows.bat accesso-automatico stato
run_windows.bat accesso-automatico disattiva
```

- `attiva` chiede la passphrase della chiave di firma e la controlla. Se la cassaforte ha una passphrase diversa,
  chiede anche quella (una volta sola).
- Dove la salva: `%APPDATA%\DocMapHub\accesso-automatico.json`, **cifrata con Windows (DPAPI)** per il tuo utente: il
  file non serve a niente copiato su un altro PC o letto da un altro utente Windows.
- La pagina web si apre già dentro, senza schermata della passphrase.
- Le variabili d'ambiente `DOCMAP_HUB_PASSPHRASE` / `DOCMAP_HUB_VAULT_PASSPHRASE` e `--passphrase-file`, se presenti,
  hanno la precedenza.

**Due passphrase → una sola.** Se all'inizio ne hai scelte due diverse:

```bat
run_windows.bat vault change-passphrase
```

Come nuova passphrase scrivi quella della chiave di firma. L'accesso automatico si aggiorna da solo.

**Il rischio, in chiaro.** Chiunque usi il tuo account Windows (o un programma che gira come te, compreso il tuo
agente) può firmare licenze e leggere la cassaforte senza scrivere niente. Le chiavi restano cifrate sul disco e nei
backup; spegnendo l'accesso automatico il file viene eliminato. Va bene su un PC tuo, con password di Windows e disco
cifrato (BitLocker). Non attivarlo su un PC condiviso.

L'unica cosa che chiede ancora la conferma è **mostrare** un segreto nella pagina web (pulsante «mostra»), e solo lì.

---

## 5. Le parole del hub

| Parola | Significato | Esempio |
|---|---|---|
| **cliente** | lo studio o l'azienda che paga | STUDIO ERMETE DALL'ASTA |
| **installazione** (instance) | un server DocMap del cliente; ha un codice `instance_id` e una licenza | "STUDIO ERMETE DALL'ASTA — sede", "… — online" |
| **sede** | installazione sul PC del cliente (server Python, `C:\DocMap`) | |
| **online** | installazione sul web (sito PHP sull'hosting) | `https://docmap.pr-it.it/studio-de/` |
| **ambiente** | una copia di un'installazione: `production` (quella vera), `staging` (prova), `demo-…` (a scadenza) | |
| **tipo di ambiente** | `web-php` (sito con deploy FTP), `studio-python` (server in sede, solo controllo), `local-python` (server avviato sul tuo PC dal hub) | |
| **licenza** | file `.docmap-licence` firmato: cliente, piano, scadenza, limiti, funzioni, rivenditore, marchio | |
| **piano** | modello di licenza: `trial`, `studio`, `studio_pro` (Pro), `conto_terzi`, `appliance`, `reseller` (`plans` li mostra) | |
| **tolleranza** | giorni dopo la scadenza in cui tutto funziona ancora (30); poi **sola lettura**, mai dati bloccati | |
| **cassaforte** (vault) | segreti cifrati: `ftp`, `admin_token`, `superadmin`, `basic_auth`, `db_config`, `note` | |
| **custodia della chiave** | il hub tiene anche la chiave del database del cliente; spenta di base, solo con consenso scritto | |
| **token del ponte** | codice dell'utente `ponte-sync` che sincronizza sede ⇄ online | |
| **rivenditore** | chi rivende DocMap con il suo marchio | |

Piani (valori predefiniti):

| Piano | Mesi | Utenti | Faldoni | Archivi | Funzioni |
|---|---|---|---|---|---|
| `trial` | 1 | 2 | 300 | 1 | mobile_scan |
| `studio` | 12 | 5 | 5.000 | 3 | mobile_scan |
| `studio_pro` | 12 | 15 | 20.000 | 10 | mobile_scan, sync_server, status_events, ai_credits |
| `conto_terzi` | 12 | 30 | 100.000 | 50 | come Pro |
| `appliance` | 12 | 10 | 20.000 | 5 | mobile_scan, sync_server, status_events |
| `reseller` | 12 | 50 | illimitati | illimitati | come Pro + white_label |

---

## 6. Ricette passo per passo

Tutti i comandi si lanciano da `C:\DocMapHub\hub\` come `run_windows.bat <comando>`. Un agente può usare anche
`.venv\Scripts\python.exe -m docmap_hub <comando>` (stesso risultato). I nomi con spazi vanno tra virgolette.
Dove serve `--instance` puoi scrivere il nome completo (es. `"STUDIO ERMETE DALL'ASTA — online"`, con il trattino lungo)
**oppure le prime cifre del codice** mostrato da `instance list` (es. `--instance a2a6383d`): per un agente è più sicuro
il codice.

### 6.1 Cliente nuovo con sede e online (il caso del pilota)

```bat
run_windows.bat cliente nuovo --nome "STUDIO ERMETE DALL'ASTA" --piva IT01234567890 --email info@esempio.it ^
  --piano studio_pro --installazioni entrambe ^
  --url-online https://docmap.pr-it.it/studio-de/ ^
  --ftp-protocollo ftps --ftp-host gnldm1123.siteground.biz --ftp-utente docmap@pr-it.it ^
  --ftp-cartella /studio-de/
```

- La password FTP viene chiesta senza mostrarla (un agente la passa con la variabile `DOCMAP_HUB_FTP_PASSWORD`).
- `--url-staging … --ftp-cartella-staging …` aggiunge l'ambiente di prova. **Lo staging deve avere una cartella sua**
  (es. `/studio-de-prova/`), mai la stessa di production.
- La cartella FTP si scrive **come la vede l'account FTP**: se in SiteGround l'account ha "Percorso Home"
  `/docmap.pr-it.it/public_html/`, la cartella `public_html/studio-de` per lui è `/studio-de/`.

Uscita: elenco di cosa è stato creato e i percorsi in `%APPDATA%\DocMapHub\clienti\studio-ermete-dall-asta\`:

| File | A cosa serve |
|---|---|
| `sede\DocMap-<slug>-sede.zip` | pacchetto per il PC del cliente (licenza e chiave pubblica dentro, niente segreti) |
| `online\production\…zip` e cartella `sito\` | il sito da caricare |
| `scheda-cliente.html` | scheda da stampare (niente segreti) |
| `licenze\` | copie dei file di licenza |
| `sync-modello.json`, `cliente.json`, `chiave-pubblica.json` | usati da pacchetti e hub |

Rilanciare lo stesso comando **non crea doppioni** (ritrova il cliente dalla P.IVA). `--rigenera` rifà pacchetti e siti
(i vecchi vanno in `_trash\`). Poi segui 6.4 (deploy), 6.6 (token del ponte) e la guida di installazione in sede.

### 6.2 Solo sede o solo online

- Solo sede: `cliente nuovo --nome … --piano … --installazioni sede` (niente URL né FTP).
- Solo online: `cliente nuovo --nome … --piano … --installazioni online --url-online … --ftp-…`.

### 6.3 Correggere i dati FTP di un ambiente

Un segreto si **sostituisce** riscrivendolo per intero:

```bat
run_windows.bat vault set --instance "STUDIO ERMETE DALL'ASTA — online" --env production --kind ftp ^
  --field protocol=ftps --field host=gnldm1123.siteground.biz --field port=21 ^
  --field user=docmap@pr-it.it --field password=? --field remote_path=/studio-de/
```

`password=?` la chiede senza mostrarla. Controllo: `run_windows.bat vault list`. Dalla pagina web: scheda
**Cassaforte** › «Salva un segreto».

### 6.4 Pubblicare il sito (deploy)

Sempre in due tempi: **prova**, poi **esecuzione**.

```bat
run_windows.bat deploy --instance "STUDIO ERMETE DALL'ASTA — online" --env production --dry-run
run_windows.bat deploy --instance "STUDIO ERMETE DALL'ASTA — online" --env production --yes
```

Cosa leggere nella prova:

- `Sul server: N file, versione X`: se N è 0 e la versione è "sconosciuta" ma il sito esiste, **la cartella FTP è
  sbagliata** (vedi 10.1). Il hub prova da solo a correggerla e lo scrive con "ATTENZIONE".
- `Da caricare / invariati / protetti / obsoleti (non cancellati)`.

Cosa fa l'esecuzione: backup dei file che sostituisce e di `server-php/data/` in `deploy-backups\`; caricamento con
file temporanei e rinomina; controllo `api.php?r=ping` con la versione nuova; se il controllo fallisce rimette i file
di prima. **Non cancella mai niente** sul server, **non tocca** `config.php`, i dati e i `.htaccess` modificati a mano
(salvo `--overwrite-htaccess`).

Dopo il primo deploy di un sito nuovo: apri `…/server-php/setup.php` (capitolo 6.6).

### 6.5 Staging e promozione

```bat
run_windows.bat deploy --instance "<installazione online>" --env staging --dry-run
run_windows.bat deploy --instance "<installazione online>" --env staging --yes
rem prova il sito di staging nel browser, poi:
run_windows.bat promote --instance "<installazione online>" --dry-run
run_windows.bat promote --instance "<installazione online>" --yes
```

`promote` pubblica in production **esattamente** il codice verificato su staging (se nel frattempo è cambiato, si
rifiuta). Staging e production sono due database diversi: `setup.php` va fatto su tutti e due.

### 6.6 Token del ponte (sincronizzazione sede ⇄ online)

Il token del ponte lo crea **il sito online**:

- **sito nuovo**: in `setup.php`, nell'elenco persone, aggiungi la riga `ponte-sync,editor`; setup.php mostra una volta
  il token di ogni persona;
- **sito già configurato** (config.php presente): nell'app online, da amministratore, ⚙ › Sincronizzazione ›
  Server online › Codici di accesso → nuovo codice, nome `ponte-sync`, ruolo editor.

Poi:

```bat
run_windows.bat cliente token-ponte --cliente "STUDIO ERMETE DALL'ASTA" --salva
run_windows.bat cliente token-ponte --cliente "STUDIO ERMETE DALL'ASTA" --esporta E:\token-ponte.txt
```

`--salva` lo chiede (o lo legge da `DOCMAP_HUB_BRIDGE_TOKEN`) e lo mette in cassaforte; `--esporta` lo scrive su
chiavetta per l'installazione in sede (`installa.bat` lo legge e poi il file va cancellato). Il token del lato sede lo
crea l'installer da solo. Da lì la sincronizzazione gira ogni 10 minuti.

### 6.7 Rinnovare una licenza o cambiare piano

```bat
run_windows.bat licence list
run_windows.bat licence renew <id-installazione-o-licenza>
run_windows.bat licence renew <id-installazione-o-licenza> --plan conto_terzi --months 24
```

Il file nuovo è in `%APPDATA%\DocMapHub\issued\`. Al cliente: in sede
`C:\DocMap\strumenti\licenza.ps1 -File <file>` (il server lo vede subito). Emissione libera con limiti su misura:

```bat
run_windows.bat licence issue --instance "<installazione>" --plan studio_pro --users 20 --feature white_label
```

Controllo di un file: `licence show <file>` / `licence verify <file>` (uscita 0 = valida, 1 = tolleranza,
2 = sola lettura, 3 = non valida).

### 6.8 Altre installazioni dello stesso cliente

- Altro PC o telefono **dello stesso ufficio**: nessuna installazione nuova, usa il server della sede con il suo token.
- **Seconda sede** con un suo server:

```bat
run_windows.bat instance add --customer "STUDIO ERMETE DALL'ASTA" --label "STUDIO ERMETE DALL'ASTA — Milano"
run_windows.bat licence issue --instance "STUDIO ERMETE DALL'ASTA — Milano" --plan studio_pro --out C:\temp\milano.docmap-licence
```

poi il pacchetto: `python ..\installer-windows\docmap_tools.py pacchetto --out C:\temp\DocMap-milano --zip
--chiave-pubblica chiave-pubblica.json --licenza C:\temp\milano.docmap-licence --nome-studio "…"`.

### 6.9 Rivenditore

```bat
run_windows.bat reseller add --name "Archivi Srl" --product-name "ArchiviSmart" --primary-color #0a5c8a --support-email help@archivi.it
run_windows.bat cliente nuovo --nome "Cliente del rivenditore" --piano studio --installazioni sede --rivenditore "Archivi Srl"
```

La licenza porta nome prodotto e colori del rivenditore.

### 6.10 Demo a scadenza e ambienti locali sul tuo PC

```bat
run_windows.bat server-check
run_windows.bat env create-local --instance "<installazione>" --name staging
run_windows.bat env start --instance "<installazione>" --name staging
run_windows.bat env demo create --instance "<installazione>" --days 14 --from staging
run_windows.bat env purge-expired
```

Le porte si assegnano da sole nell'intervallo 18400–18999 (mai due uguali; se una è occupata il hub sposta l'ambiente
su un'altra): `ports list`, `ports check 18400`, `ports set-range 18400 18999`.

### 6.11 Controllare tutto

```bat
run_windows.bat status
run_windows.bat check-all
run_windows.bat log --limit 50
run_windows.bat cliente elenco
```

`status` mostra per ogni ambiente: stato, raggiungibile, versione, scadenza licenza, ultimo backup.

### 6.12 Nuova versione di DocMap a tutti i clienti

1. Aggiorna il hub (capitolo 3): la nuova app è dentro.
2. Siti: per ognuno `deploy --dry-run`, poi `--yes` (o staging + `promote`).
3. Sedi: `cliente nuovo … --rigenera` (stessi dati) per un pacchetto nuovo, poi sul PC del cliente
   `C:\DocMap\strumenti\aggiorna.ps1 -Pacchetto <zip>` (backup, sostituzione, controllo, ritorno automatico se non va).

### 6.13 Backup del hub

`run_windows.bat backup` dopo ogni cliente nuovo o rinnovo, e copia su USB. Contiene chiavi (cifrate), registro,
licenze emesse, cassaforte (cifrata). Non contiene `clienti\` (si rigenera) né l'accesso automatico.

---

## 7. La pagina web del hub

Doppio clic su `C:\DocMapHub\hub\run_windows.bat` → si apre `http://127.0.0.1:8765/` (solo da questo PC). Con
l'accesso automatico entri direttamente.

| Scheda | Cosa fai |
|---|---|
| **Licenze** | clienti, installazioni, emissione e rinnovo licenze, scarica i file |
| **Nuovo cliente** | come `cliente nuovo`, con un modulo |
| **Istanze & ambienti** | ambienti production/staging/demo, crea/avvia/ferma ambienti locali, copia dati |
| **Cassaforte** | salva segreti (FTP, token, …), elenco, «mostra» (chiede conferma) |
| **Deploy** | 1) prova (dry-run) → piano con «Conferma il deploy» in alto → 2) esecuzione; promozione da staging |
| **Porte** | porte assegnate agli ambienti locali |
| **Stato** | tutte le installazioni, controllo immediato |

La prova del deploy **non cambia niente** sul server: il caricamento parte solo con «Conferma il deploy», entro 30 minuti
dalla prova.

---

## 8. Tutti i comandi

Forma: `run_windows.bat [--dir CARTELLA] [--passphrase-file FILE] <comando> [opzioni]`.
Codici di uscita: `0` riuscito, `1` errore (messaggio su stderr che inizia con "Errore:"), `2` comando incompleto.

| Comando | Cosa fa | Opzioni principali |
|---|---|---|
| `init` | crea cartella dati e registro | |
| `info` | versione, cartelle programma/dati, chiave attiva, impostazioni rotte | |
| `accesso-automatico attiva\|disattiva\|stato` | ricorda/dimentica le passphrase su questo PC | |
| `keygen` | crea la chiave di firma | `--rotate` |
| `keys list` | elenca le chiavi | |
| `export-public-key` | chiave pubblica per i server | `--out`, `--format json\|base64\|pem` |
| `plans` | piani e valori | |
| `reseller add\|list` | rivenditori | `--name`, `--product-name`, `--primary-color`, `--logo-url`, `--support-email` |
| `customer add\|list\|set` | clienti | `--name`, `--vat`, `--email`, `--reseller`; `set --key-escrow on\|off [--purge]` |
| `instance add\|list` | installazioni | `--customer`, `--label`, `--kind onprem\|cloud\|appliance`, `--id` |
| `licence issue` | emette | `--instance`, `--plan`, `--months`/`--expires`, `--users/--binders/--archives`, `--feature`, `--no-feature`, `--out` |
| `licence renew` | rinnova | `<installazione o licenza>`, `--months`, `--plan`, `--out` |
| `licence list\|show\|verify` | elenco / contenuto / verifica | `--instance`, `--json` |
| `cliente nuovo` | cliente in un passo | vedi 6.1; `--rigenera`, `--senza-pacchetti`, `--con-segreti`, `--url-sede`, `--nome-studio`, `--custodia-chiave` |
| `cliente scheda` | rifà la scheda | `--cliente`, `--con-segreti` |
| `cliente token-ponte` | token del ponte | `--cliente`, `--salva`, `--esporta FILE` |
| `cliente elenco` | clienti e cartelle | |
| `vault init\|status\|list` | cassaforte | `list --instance` |
| `vault set` | salva/sostituisce un segreto | `--instance --env --kind`, `--label`, `--field nome=valore`, `--json-file`, `--content-file` |
| `vault reveal` | mostra un segreto (registrato) | `--instance --env --kind --label --reason` |
| `vault delete` | elimina | `--yes` |
| `vault change-passphrase` | nuova passphrase | `DOCMAP_HUB_VAULT_NEW_PASSPHRASE` |
| `vault export\|import` | copia cifrata | `--out` / `file --overwrite` |
| `env list\|add\|set` | ambienti | `--instance --name --kind web-php\|studio-python --url --api-url --studio-name` |
| `env create-local\|start\|stop\|status` | ambienti sul PC del hub | `--instance --name` |
| `env clone-data` | copia dati verso un ambiente locale | `--from --to --dry-run` |
| `env demo create` | demo a scadenza | `--days --from --label` |
| `env purge-expired` | ferma le demo scadute (dati in `_trash`) | |
| `env delete` | elimina un ambiente (il sito remoto non si tocca) | `--yes`, per production `--production --confirm "<nome>"` |
| `ports list\|check\|set-range` | porte | |
| `deploy` | pubblica un sito | `--instance --env`, `--dry-run`, `--yes`, `--overwrite-htaccess`, `--trust-host-key` (SFTP) |
| `promote` | staging → production | `--instance`, `--dry-run`, `--yes` |
| `status` | stato di tutto | `--json` |
| `check-all` | ping di tutti gli ambienti | `--timeout`, `--no-secrets` |
| `settings show\|set` | impostazioni | `installer_dir`, `docmap_dir`, `server_python_dir`, `server_python_exe`, `ports.range` |
| `server-check` | server-python pronto? | |
| `log` | registro operazioni | `--limit` |
| `backup` | zip di sicurezza | `--out` |
| `web` | pagina locale | `--port`, `--no-browser` |

Variabili d'ambiente utili: `DOCMAP_HUB_DIR` (cartella dati), `DOCMAP_HUB_PASSPHRASE`, `DOCMAP_HUB_VAULT_PASSPHRASE`,
`DOCMAP_HUB_FTP_PASSWORD`, `DOCMAP_HUB_BRIDGE_TOKEN`, `DOCMAP_HUB_VAULT_NEW_PASSPHRASE`, `DOCMAP_HUB_NO_AUTO=1`
(ignora l'accesso automatico).

---

## 9. Per l'agente AI: regole operative

Un agente (Claude Code o simile) che lavora sul PC di Dave può fare **tutto** quello che fa Dave con il hub, purché:

1. **Accesso automatico attivo** (`accesso-automatico stato` → ATTIVO). Se è spento, chiedi a Dave di attivarlo: non
   chiedergli la passphrase in chat e non scriverla in file.
2. Lavora da `C:\DocMapHub\hub\` con `run_windows.bat <comando>` (o `.venv\Scripts\python.exe -m docmap_hub`).
   Nessun comando deve restare in attesa di input: usa `--yes` dove previsto, `DOCMAP_HUB_FTP_PASSWORD` e
   `DOCMAP_HUB_BRIDGE_TOKEN` per i segreti nuovi, e mai `password=?` (chiede da tastiera).
3. **Prima la prova**: `deploy` e `promote` sempre con `--dry-run` prima; leggi `Sul server: N file, versione X` e
   procedi con `--yes` solo se il piano è sensato (N > 0 per un sito esistente, nessun "ATTENZIONE").
4. **Mai cancellare**: niente `vault delete`, `env delete`, `keygen --rotate`, `customer set --purge` senza richiesta
   esplicita di Dave. Niente operazioni su `%APPDATA%\DocMapHub\` a mano.
5. **Mai mostrare segreti** in chat o nei log: niente `vault reveal`, `cliente scheda --con-segreti` se Dave non lo chiede.
6. Dopo ogni cliente nuovo, rinnovo o modifica alla cassaforte: `run_windows.bat backup` e dillo a Dave (va copiato su USB).
7. Controlla l'esito con il codice di uscita (0 = ok) e rileggi lo stato con `status` / `cliente elenco` / `licence list`.
8. Le cose fuori dal hub non le fa il hub: creare cartelle, SSL e account FTP su SiteGround, lanciare `setup.php`,
   installare in sede (`installa.bat` sul PC del cliente). Spiegale a Dave passo per passo.

**Flusso tipo "nuovo cliente con sede e online" per l'agente:**

```bat
run_windows.bat accesso-automatico stato
run_windows.bat plans
set DOCMAP_HUB_FTP_PASSWORD=<password fornita da Dave>
run_windows.bat cliente nuovo --nome "<Nome>" --piva <PIVA> --piano studio_pro --installazioni entrambe --url-online https://docmap.pr-it.it/<slug>/ --ftp-protocollo ftps --ftp-host gnldm1123.siteground.biz --ftp-utente <utente> --ftp-cartella /<slug>/
set DOCMAP_HUB_FTP_PASSWORD=
run_windows.bat deploy --instance "<Nome> — online" --env production --dry-run
run_windows.bat deploy --instance "<Nome> — online" --env production --yes
rem Dave apre setup.php e ti dà il token ponte-sync:
set DOCMAP_HUB_BRIDGE_TOKEN=<token>
run_windows.bat cliente token-ponte --cliente "<Nome>" --salva
run_windows.bat cliente token-ponte --cliente "<Nome>" --esporta E:\token-ponte.txt
set DOCMAP_HUB_BRIDGE_TOKEN=
run_windows.bat backup
```

Poi consegna a Dave: percorso di `sede\…-sede.zip`, `scheda-cliente.html`, e i passi in sede.

---

## 10. Problemi comuni

### 10.1 Il deploy dice "? → 26.12.5" e "Sul server: 0 file" ma il sito esiste

La cartella FTP è scritta come la vede il pannello, non come la vede l'account FTP. In SiteGround guarda
"Gestisci account FTP" › "Percorso Home": se è `/docmap.pr-it.it/public_html/`, la cartella del sito per quell'account
è `/studio-de/`. Dalla 0.3.1 il hub se ne accorge e usa da solo il percorso giusto (riga "ATTENZIONE"), ma correggi
la cassaforte (6.3).

### 10.2 "FTP: accesso rifiutato" / "server non raggiungibile"

Utente o password sbagliati, o porta/protocollo: SiteGround usa FTPS esplicito sulla porta 21. Ricontrolla con
FileZilla ("Richiede FTP esplicito su TLS").

### 10.3 "Dopo il caricamento il server non risponde con la versione …" (ritorno indietro)

L'indirizzo dell'ambiente (`api_url`) non corrisponde alla cartella caricata, oppure PHP dà errore. Apri
`<url>server-php/api.php?r=ping` nel browser. Correggi con `env set --instance … --name production --url …`.

### 10.4 Il deploy ha caricato in una cartella sbagliata

Il hub non cancella mai: elimina tu la cartella sbagliata dal File Manager dell'hosting.

### 10.5 Licenza "NON VALIDA" in sede

Il pacchetto non aveva la chiave pubblica (pacchetto generico) o la licenza è per un'altra installazione. Usa il
pacchetto personale di `cliente nuovo`, oppure `licence show <file> --instance-id <id>`.

### 10.6 La pagina del hub chiede ancora la passphrase

Accesso automatico spento o file illeggibile (creato da un altro utente Windows): `accesso-automatico attiva`.

### 10.7 Porta occupata

`ports list` mostra chi la usa; `env start` sposta da solo l'ambiente su una porta libera.

---

## 11. Cosa non è ancora provato

Provato con test automatici su Linux (hub 79 test, compresi FTP e FTPS reali su un server di prova). **Non ancora** su:
Windows reale (accesso automatico con DPAPI, pagina del hub, `installa.bat`, sincronizzazione automatica),
deploy FTPS verso SiteGround, telefoni con il certificato dello studio. La licenza del sito online viene emessa ma il
server PHP non la controlla ancora.
