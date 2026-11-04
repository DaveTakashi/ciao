# DocMap — Nuovo cliente, dall'inizio alla fine

Guida per Dave. Vale per **DocMap 26.12.5 (app v12.5)**, **hub 0.3**, **strumenti di installazione 1.2.0**.
(Per aggiornare uno studio che ha già la v12.4: `docs/AGGIORNAMENTO-v12.4-v12.5.md` — nessuna migrazione dei dati.)

In breve: **un comando sul tuo PC** (`cliente nuovo`) registra il cliente, emette le licenze e prepara tutto quello
che serve in una cartella: il **pacchetto di installazione personale** per il PC del cliente, il **sito** da
caricare sull'hosting e la **scheda cliente** da stampare. Poi: carichi il sito, installi in sede, colleghi i due.

Parole usate:

- **sede** = DocMap installato sul PC del cliente (server Python, `C:\DocMap`, rete locale dell'ufficio);
- **online** = DocMap sul web (sito PHP sull'hosting, es. SiteGround), sul dominio del cliente o sul tuo;
- **hub** = il programma sul tuo PC con cui gestisci licenze, clienti, cassaforte e deploy;
- **cassaforte** = la parte cifrata del hub dove tieni password FTP e codici;
- **token** = codice di accesso di una persona (o del ponte) a un server DocMap: è come una password.

---

## 0. Una volta sola, sul tuo PC

1. Installa **Python 3.11 o più recente** da <https://www.python.org/downloads/> e spunta **"Add python.exe to PATH"**.
2. Estrai lo zip **`DocMap-hub-0.3.zip`** dove vuoi, per esempio `C:\DocMapHub\`. Dentro c'è la cartella completa
   `DocMap-hub-0.3\` (hub, installer, server, sito): il hub la usa per costruire pacchetti e siti, **non spostare le
   sottocartelle**.
3. Apri `DocMap-hub-0.3\hub\`, scrivi `cmd` nella barra dell'indirizzo di Esplora file e premi Invio. Nella finestra:

   ```bat
   run_windows.bat init
   run_windows.bat keygen
   run_windows.bat vault init
   run_windows.bat export-public-key --out chiave-pubblica.json
   run_windows.bat backup
   ```

   - `keygen` chiede la **passphrase della chiave di firma** (almeno 10 caratteri: una frase lunga). Scrivila **su
     carta** e mettila in cassaforte. Senza, non potrai più rinnovare nessuna licenza.
   - `vault init` chiede la passphrase della **cassaforte**: puoi usare la stessa (più comodo) o un'altra.
   - `export-public-key` crea il file della **chiave pubblica**: non è segreto, il hub lo mette da solo nei pacchetti.
   - `backup` crea uno zip in `%APPDATA%\DocMapHub\backups\`: **copialo subito su una chiavetta USB** (e ripetilo dopo
     ogni nuovo cliente). La chiave privata nel backup resta cifrata.
4. Facoltativo: per il deploy via SFTP, `.venv\Scripts\python.exe -m pip install paramiko` (FTPS non serve).

Da qui in poi puoi usare la riga di comando (`run_windows.bat <comando>`) **oppure la pagina del hub**: doppio clic su
`run_windows.bat` → passphrase → si apre il browser; la scheda **Nuovo cliente** fa le stesse cose del comando.

## 1. Creare il cliente: `cliente nuovo`

Scegli cosa ha il cliente:

| Il cliente vuole… | `--installazioni` | Cosa ottiene |
|---|---|---|
| solo il PC in ufficio (dati solo da lui, niente online) | `sede` | pacchetto per il suo PC + licenza |
| solo il sito web | `online` | sito per l'hosting + licenza (per ora la licenza online è solo registrata: il server PHP non la controlla) |
| tutti e due, sincronizzati | `entrambe` | pacchetto + sito + sincronizzazione automatica ogni 10 minuti |

Piani disponibili (`run_windows.bat plans`): `trial`, `studio` (5 utenti, 5000 faldoni), `studio_pro`, `conto_terzi`,
`appliance`, `reseller`.

**Esempio A — solo sede:**

```bat
run_windows.bat cliente nuovo --nome "Studio Rossi" --piva IT01234567890 --email info@studiorossi.it --piano studio
```

**Esempio B — solo online, sul dominio del cliente:**

```bat
run_windows.bat cliente nuovo --nome "Studio Verdi" --piva IT09876543210 --piano studio --installazioni online ^
  --url-online https://archivio.studioverdi.it/ ^
  --ftp-host ftp.studioverdi.it --ftp-utente docmap@studioverdi.it --ftp-cartella /public_html
```

**Esempio C — tutti e due, sul tuo dominio (sottocartella di docmap.pr-it.it) con ambiente di prova:**

```bat
run_windows.bat cliente nuovo --nome "Studio Rossi" --piva IT01234567890 --piano studio --installazioni entrambe ^
  --url-online https://docmap.pr-it.it/studio-rossi/ ^
  --url-staging https://docmap.pr-it.it/studio-rossi-prova/ ^
  --ftp-host ftp.pr-it.it --ftp-utente docmap-rossi@pr-it.it ^
  --ftp-cartella /docmap.pr-it.it/public_html/studio-rossi ^
  --ftp-cartella-staging /docmap.pr-it.it/public_html/studio-rossi-prova
```

Altre opzioni: `--rivenditore "Nome"` (cliente di un rivenditore: la licenza porta il suo marchio), `--custodia-chiave on`
(solo con il **consenso scritto** del cliente: il hub può custodire la chiave del suo database), `--nome-studio` (nome
mostrato nell'app, se diverso). La password FTP viene **chiesta senza mostrarla**.

Il comando chiede la passphrase (firma e, se c'è l'FTP, cassaforte) e prepara la cartella
**`%APPDATA%\DocMapHub\clienti\studio-rossi\`**:

| File | A cosa serve |
|---|---|
| `sede\DocMap-studio-rossi-sede.zip` | **pacchetto personale** da portare sul PC del cliente (licenza, chiave pubblica, nome dello studio, modello della sincronizzazione, questa guida). **Niente segreti dentro** |
| `online\staging\…zip`, `online\production\…zip` (+ cartelle `sito\`) | il sito per l'hosting, già con indirizzo e nome giusti |
| `scheda-cliente.html` | **scheda da stampare**: dati, piano, scadenza, codici installazione, indirizzi, dove sta ogni codice, prossimi passi. Nessun segreto |
| `licenze\` | copia dei file di licenza |
| `chiave-pubblica.json`, `sync-modello.json`, `cliente.json` | usati dal hub e dal pacchetto |

Il comando stampa anche i **codici di installazione** (instance_id): servono solo al hub, li ritrovi nella scheda.

**Rilanciarlo non crea doppioni**: ritrova il cliente (dalla P.IVA, o dal nome), le sue installazioni e la licenza
valida. Con `--rigenera` rifà pacchetto e siti (per esempio dopo un rinnovo o una nuova versione di DocMap): i
vecchi vanno in `clienti\studio-rossi\_trash\`. Altri comandi: `cliente elenco`, `cliente scheda --cliente "Studio Rossi"`.

## 2. Online: hosting, deploy, setup.php

Salta questo capitolo se il cliente ha solo la sede.

1. **Sull'hosting** (SiteGround › Site Tools):
   - dominio del cliente: crea il dominio/sottodominio (es. `archivio.studioverdi.it`) e attiva **SSL (Let's Encrypt)**;
   - tuo dominio: crea le cartelle `public_html/studio-rossi` e `public_html/studio-rossi-prova` sotto `docmap.pr-it.it`;
   - crea un **account FTP dedicato** limitato a quella cartella (non usare il tuo account principale). Se non l'hai
     dato a `cliente nuovo`: `run_windows.bat vault set --instance "Studio Rossi — online" --env production --kind ftp
     --field host=… --field user=… --field password=? --field remote_path=/…`.
   - **non** proteggere la cartella con "Directory protette" (i telefoni non la ricordano).
2. **Prova e pubblica su staging** (se l'hai creato):

   ```bat
   run_windows.bat deploy --instance "Studio Rossi — online" --env staging --dry-run
   run_windows.bat deploy --instance "Studio Rossi — online" --env staging
   ```

   Il hub fa prima un backup di ciò che c'è sul server, carica in FTPS, controlla che risponda e, se no, rimette
   tutto com'era. In alternativa puoi caricare a mano il contenuto dello zip con un programma FTP (FileZilla, in FTPS).
3. **setup.php, una volta per ambiente**: apri `https://…/studio-rossi-prova/server-php/setup.php`.
   - Cartella dati: **fuori** da `public_html` (setup.php la propone). Se nella cartella c'è già un `docmap.sqlite`,
     setup.php **rifiuta** di creare una chiave nuova (protegge i dati esistenti).
   - Persone: una per riga, per esempio

     ```
     davide,admin
     ponte-sync,editor        ← solo se il cliente ha anche la sede (serve alla sincronizzazione)
     mario,editor
     ```

   - setup.php mostra **una sola volta** il token di ogni persona e un pulsante **"Scarica la copia di config.php"**.
     Dove metterli:
     - token di `davide` (admin) → cassaforte: `run_windows.bat vault set --instance "Studio Rossi — online" --env production --kind admin_token --label admin --field token=?`
     - token di `ponte-sync` → `run_windows.bat cliente token-ponte --cliente "Studio Rossi" --salva`
     - token delle altre persone → consegnali a ciascuno (gestore di password)
     - `config.php` scaricato (contiene la **chiave del database**) → al cliente, in un posto sicuro; nel hub solo con
       custodia attiva (`vault set --kind db_config --content-file config.php`).
4. **Controlla**: `…/server-php/api.php?r=ping` risponde `{"ok":true…}`; `…/server-php/config.php` e `…/server-php/data/`
   non si aprono (403/404). Apri l'app, primo accesso con utente, PIN e token. Dal hub: `run_windows.bat check-all`.
5. **Pubblica in production** lo stesso codice provato su staging:

   ```bat
   run_windows.bat promote --instance "Studio Rossi — online" --dry-run
   run_windows.bat promote --instance "Studio Rossi — online"
   ```

   poi **setup.php anche su production** (punto 3: è un database diverso, con i suoi token; salva quelli di
   production). Senza staging: `deploy --env production` e poi setup.php.

## 3. Sede: installazione sul PC del cliente

Cosa porti: una **chiavetta USB** con `sede\DocMap-studio-rossi-sede.zip` (e, se c'è il sito, il token del ponte su
file: `run_windows.bat cliente token-ponte --cliente "Studio Rossi" --esporta E:\token-ponte.txt`), la **scheda
cliente** stampata.

Il PC del cliente: Windows 10/11, sempre acceso in orario d'ufficio, collegato via cavo, possibilmente con **IP fisso**
(impostalo nel router). Serve Internet la prima volta (Python e pacchetti).

1. Copia lo zip sul PC, tasto destro › **Estrai tutto**, doppio clic su **`installa.bat`** › **Sì**.
2. Rispondi alle domande (dettagli in `GUIDA-INSTALLAZIONE.md` §4): il nome dello studio è già proposto; scegli il nome
   dell'amministratore; **copia il codice amministratore** che compare (al cliente, nel suo gestore di password; poi
   elimina `C:\DocMap\config\PRIMO-CODICE-ADMIN.txt`).
3. La licenza si installa **da sola** e alla fine vedi `Stato: VALIDA (full)`.
4. **Kit di emergenza**: rispondi sì, **stampa 2 copie** e lasciale al cliente in cassaforte (codice di recupero +
   passphrase dei backup). Copia il file `.docmap-key` su una chiavetta del cliente. È l'unico modo di recuperare il
   database se il PC si rompe e la custodia è spenta.
5. Se c'è il sito: *"La configuro adesso?"* → vedi §4.
6. **Telefoni**: dal Wi-Fi dell'ufficio, QR n. 1 della pagina che si apre → scarica e installa il **certificato dello
   studio** (Android: Impostazioni › Sicurezza › installa certificato CA; iPhone: Safari → profilo → Impostazioni ›
   Generali › Info › Attendibilità certificati), poi QR n. 2 → primo accesso. Altri PC dell'ufficio: stesso certificato
   in "Autorità di certificazione radice attendibili".
7. Stampa/archivia la **scheda cliente** e annota in agenda la **scadenza della licenza**.

## 4. Collegare sede ⇄ online (sincronizzazione automatica)

Serve solo con `--installazioni entrambe`.

- Alla fine di `installa.bat` (o dopo, con `C:\DocMap\strumenti\configura-sync.ps1`) incolli il **token di
  `ponte-sync`** del sito (o usi `-TokenFile E:\token-ponte.txt`, poi il file viene eliminato). Lo script crea da solo
  un codice `ponte-sync` anche sul server della sede, scrive il profilo in `C:\DocMap\sync\` (solo amministratori), fa
  una **prova senza modifiche**, mostra cosa passerebbe e crea l'attività **"DocMap Sync Web-Locale" ogni 10 minuti**.
- Se uno dei due archivi è vuoto riceve una copia completa. Se **tutti e due** hanno già dati, vengono **fusi** (vince
  la modifica più recente): se uno contiene solo prove, svuotalo prima.
- Controllo: dopo 10 minuti apri `C:\DocMap\sync\ultimo-esito.txt` (nessun errore; la seconda volta "Già allineati").

**Cosa si sincronizza da solo e cosa no**

| | Automatico? |
|---|---|
| App sul PC ⇄ server (modo web, `https://IP:8443/`) | sì, sempre: l'app lavora direttamente sul server |
| Telefoni | sempre tramite un server (in ufficio quello della sede, fuori quello online) |
| Server della sede ⇄ sito online | sì, con il **ponte** ogni 10 minuti: faldoni, clienti, ubicazioni, archivi, movimenti, eliminazioni, impostazioni condivise, registro attività |
| Licenze, utenti e token, registro accessi | **no**: ogni server ha i suoi (le persone che lavorano su tutti e due hanno un token per ciascuno) |
| PC con l'app aperta da file (`index.html`) | solo quando premi Sincronizza (o con la sincronizzazione automatica dell'app) |

Dettagli, conflitti ed errori: `GUIDA-SYNC-WEB-LOCALE.md`.

## 5. Altre installazioni dello stesso cliente

- **Un altro PC o un telefono dello stesso ufficio**: **non** è un'altra installazione. Apre l'indirizzo della sede
  (`https://IP:8443/`) con il certificato installato e il **suo** token, creato dall'amministratore in DocMap
  (⚙ › Sincronizzazione › Server online › Codici di accesso). Rientra nei limiti utenti del piano.
- **Un'altra sede o filiale** con un suo PC server: è una nuova installazione dello stesso cliente. Oggi `cliente
  nuovo` gestisce una sede e un sito per cliente: per la seconda sede registra a mano `instance add --customer "Studio
  Rossi" --label "Studio Rossi — Milano"` e `licence issue --instance … --plan …`, poi prepara il pacchetto con
  `installer-windows\docmap_tools.py pacchetto --chiave-pubblica …\chiave-pubblica.json --licenza <file> --nome-studio …`.
  Ogni sede ha il suo database; per tenerle allineate si usa il sito online come centro (un ponte per sede).
- **Cliente di un rivenditore**: `reseller add --name … --product-name …` una volta, poi `cliente nuovo … --rivenditore
  "Nome"`. Tutto il resto è uguale.

Non c'è nulla da "copiare" tra installazioni: la chiave pubblica è la stessa per tutti i tuoi clienti e il hub la mette
da solo in ogni pacchetto.

## 6. Dove sta ogni codice

| Codice | Dove è custodito | Chi lo ha | Se si perde |
|---|---|---|---|
| Chiave di firma (privata) + passphrase | hub: `%APPDATA%\DocMapHub\keys\` (cifrata) + backup su USB; passphrase su carta | solo Dave | niente rinnovi né licenze nuove: con il backup e la passphrase si recupera; senza, nuova chiave (`keygen --rotate`) e nuovi pacchetti a tutti |
| Chiave pubblica | nei pacchetti (`trusted_keys.json`) e in `chiave-pubblica.json` | tutti (non è segreta) | si riesporta dal hub |
| File di licenza | sede: `C:\DocMap\dati\licence\` (nei backup); copia nel hub | cliente e Dave | si riscarica dal hub (`licence list`, pagina Licenze) |
| Chiave del database (sede) | `C:\DocMap\config\config.json` (solo amministratori) + Kit di emergenza + backup cifrati; hub solo con custodia | cliente | con il Kit di emergenza (`kit-emergenza.ps1 -Recupera`); senza Kit né custodia: **dati illeggibili** |
| Chiave del database (online) | `server-php/config.php` sull'hosting + copia scaricata da setup.php; hub solo con custodia | cliente (e hosting) | dalla copia di config.php; senza: dati online illeggibili (la sede, se sincronizzata, ha comunque i dati) |
| Codice amministratore (sede/online) | gestore di password del cliente; online anche in cassaforte | cliente, Dave | un altro amministratore ne crea uno nuovo e revoca il vecchio; se non resta nessun amministratore, Dave aggiunge un codice in `config.json` (sede) / `config.php` (online) |
| Superadmin (se usato) | cassaforte (`--kind superadmin`) | Dave | si reimposta |
| Accesso FTP | cassaforte del hub | Dave | si cambia la password dall'hosting e si risalva |
| Passphrase dei backup (sede) | `C:\DocMap\config\backup-passphrase.txt` + foglio del Kit | cliente | dal foglio del Kit; i backup vecchi restano leggibili con quella vecchia |
| Codice di recupero del Kit | solo sul foglio stampato | cliente | rifare il Kit (`kit-emergenza.ps1`) finché il PC funziona |
| Token del ponte (`ponte-sync`) | online: cassaforte del hub; in sede: `C:\DocMap\sync\sync-profile.json` (solo amministratori) | Dave | revocalo sul sito, creane uno nuovo, `cliente token-ponte --salva`, poi `configura-sync.ps1` |
| Passphrase della cassaforte | su carta | solo Dave | i segreti custoditi non si leggono più (i server dei clienti funzionano lo stesso) |

## 7. Rinnovi e aggiornamenti

- **Rinnovo licenza** (il hub mostra le scadenze in `status` e nella pagina Licenze):
  `run_windows.bat licence renew "Studio Rossi — sede"` → nuovo file in `issued\` → al cliente (email o chiavetta) →
  in sede `C:\DocMap\strumenti\licenza.ps1 -File <file>` (il server lo vede subito). Scaduta: 30 giorni di tolleranza,
  poi **sola lettura** (mai dati bloccati).
- **Nuova versione del sito**: estrai il nuovo zip del hub, poi `deploy --env staging`, prova, `promote`. config.php,
  dati e setup già fatto non vengono mai toccati.
- **Nuova versione in sede**: `run_windows.bat cliente nuovo …(stessi dati)… --rigenera` per un pacchetto personale
  nuovo (o un pacchetto generico: le chiavi pubbliche già installate restano), poi sul PC del cliente
  `C:\DocMap\strumenti\aggiorna.ps1 -Pacchetto <zip>`: backup, sostituzione, prova, e ritorno automatico alla versione
  precedente se non risponde. Dalla v12.4 alla v12.5 non ci sono migrazioni (`docs/AGGIORNAMENTO-v12.4-v12.5.md`).
- Dopo ogni cliente nuovo o rinnovo: `run_windows.bat backup` e copia su USB.

## 8. Cosa non è ancora provato davvero

Tutto quanto sopra è provato su Linux con test automatici (hub, installer, server), **non** ancora su:

- Windows reale: `installa.bat` con il pacchetto personale (licenza automatica, permessi `icacls` della cartella
  `C:\DocMap`, `configura-sync.ps1`, attività "DocMap Sync Web-Locale" come SYSTEM, inserimento del token nascosto);
- hosting reale: `deploy`/`promote` FTPS verso SiteGround con i siti preparati da `cliente nuovo`, setup.php sul
  sottodominio del cliente;
- telefoni reali con il certificato dello studio; il ponte contro il sito vero (fai sempre prima la prova);
- la pagina **Nuovo cliente** del hub su Windows (provata solo su Linux).

Primo cliente: fallo prima su un PC di prova e con un sottodominio di prova, seguendo questa guida passo passo, e
annota ogni differenza.
