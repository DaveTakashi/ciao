# DocMap · Guida all'installazione in sede (Windows)

> Per Dave e per lo studio. Fase F4 della roadmap. **Gli script non sono ancora stati provati su un vero PC Windows**:
> leggi la sezione 11 prima della prima installazione da un cliente.

Con questa installazione DocMap gira su **un PC dell'ufficio** (il "PC server"). I telefoni e gli altri PC collegati alla
stessa rete (Wi-Fi o cavo) usano DocMap da quel PC. **I dati restano in ufficio**: nessun hosting, nessun servizio esterno.

```
 telefono ─┐                       PC server (C:\DocMap)
 telefono ─┼── Wi-Fi / rete ──▶   https://192.168.1.20:8443/   programma + database (cifrato)
 altro PC ─┘     dello studio      backup CIFRATI ogni giorno in C:\DocMap\backup (+ chiavetta/NAS)
```

> **La regola più importante**: alla fine dell'installazione **stampa il Kit di emergenza** (§7bis) e mettilo in
> cassaforte. Senza la chiave del database e la passphrase dei backup, i dati non si leggono più: né da te, né da noi.

## 1. Requisiti

| Cosa | Dettagli |
|---|---|
| PC server | Windows 10 o 11, sempre acceso durante l'orario di lavoro, collegato alla rete dello studio (meglio via cavo) |
| Permessi | un utente **amministratore** del PC (serve solo per installare e aggiornare) |
| Python | **3.11 o più recente**, installato "per tutti gli utenti" (l'installazione lo controlla e spiega come metterlo) |
| Internet | solo la prima volta, per scaricare i pacchetti Python (fastapi, uvicorn, cryptography), salvo pacchetto con `wheels` (§3) |
| Browser | Chrome o Edge (PC), Chrome (Android), Safari (iPhone) |
| Rete | la rete dell'ufficio impostata su Windows come **rete privata** (l'installazione lo controlla) |
| Consigliato | IP fisso per il PC server (prenotazione DHCP sul router): così l'indirizzo non cambia mai |

## 2. Cosa viene installato

Tutto sta in **`C:\DocMap\`** (cartella fissa):

| Cartella / file | Contenuto | Aggiornamenti |
|---|---|---|
| `app\` | il programma web (index.html, scan.html, assets, vendor, docmap.config.js) | sostituita |
| `server\` | il server Python (`docmap_server`) | sostituita |
| `strumenti\` | gli script (backup, ripristino, kit di emergenza, aggiornamento, licenza, disinstallazione) e questa guida | sostituita |
| `venv\` | l'ambiente Python del server | pacchetti aggiornati |
| `config\config.json` | **chiave AES e codici di accesso**: senza questo file il database non si legge | **mai toccato** |
| `config\backup-passphrase.txt` | passphrase con cui sono cifrati i backup (la usa il backup automatico) | **mai toccato** |
| `config\kit-emergenza\` | il Kit di emergenza (file `.docmap-key` + pagina da stampare) | **mai toccato** |
| `dati\` | `docmap.sqlite` (database cifrato), `licence\`, `instance.json` | **mai toccato** |
| `certificati\` | certificato dello studio (CA) e certificato del server | mai sostituiti (rinnovo automatico del solo certificato del server) |
| `backup\` | `docmap_AAAAMMGG_HHMM.docmap-backup` (cifrati), ultimi 30 | — |
| `log\` | `server.log`, `backup.log`, `verifica-backup.json` | — |
| `impostazioni.json` | porte, nome dello studio, regole dei backup | mai sovrascritto (si aggiungono solo voci nuove) |
| `LEGGIMI-INDIRIZZO.txt`, `INDIRIZZO-QR.html` | l'indirizzo da usare e i QR da stampare | riscritti a ogni avvio |
| `_versioni\` | le ultime 3 versioni sostituite (per tornare indietro) | — |

In Windows vengono creati:

- attività pianificata **"DocMap Server"**: avvia il server all'accensione del PC (anche senza nessuno collegato) e ogni
  5 minuti controlla che sia acceso; gira come `SYSTEM`. Nessun programma aggiuntivo (niente NSSM);
- attività pianificata **"DocMap Backup"**: backup cifrato ogni giorno alle 12:30 (se il PC è spento, appena si accende)
  e, una volta alla settimana, la **verifica** dell'ultimo backup;
- regole del firewall **"DocMap Server (HTTPS)"** (porta 8443) e **"DocMap Certificato (HTTP)"** (porta 8080), solo per le
  reti **private**;
- il certificato dello studio tra le "Autorità di certificazione radice attendibili" **di questo PC**.

Perché HTTPS e un certificato? Il browser permette la cifratura di DocMap (WebCrypto) e la fotocamera solo su pagine
protette. Un indirizzo `http://192.168.…` non basta: per questo l'installazione crea un **certificato dello studio**,
valido solo per indirizzi della rete locale (192.168.x.x, 10.x.x.x, 172.16-31.x.x) e per il nome del PC: non può essere
usato per falsificare siti Internet.

## 3. Preparare il pacchetto (Dave, sul PC di sviluppo)

```sh
python3 docmapv1/installer-windows/docmap_tools.py pacchetto --out ../DocMap-installer-26.11.1 --zip
```

Crea la cartella e lo zip con: `installa.bat`, gli script `.ps1`, `docmap_tools.py`, questa guida, `VERSIONE.txt`,
`PACCHETTO-MANIFEST.txt` (sha256), `app\` (dal comando `tools/build_deploy.py --no-server --base-path /`) e `server\`
(`server-python/docmap_server` + `requirements.txt`).

Facoltativo, per installare **senza Internet**: prima del comando metti in `docmapv1/installer-windows/wheels/` i
pacchetti per Windows, per esempio `pip download -r docmapv1/server-python/requirements.txt -d docmapv1/installer-windows/wheels --platform win_amd64 --python-version 3.12 --only-binary=:all:`
(valgono solo per quella versione di Python; se non vanno bene l'installazione li scarica da Internet).

Si può anche lanciare `installa.bat` direttamente da `docmapv1\installer-windows\` in una copia del repository: il
pacchetto viene preparato al volo in una cartella temporanea.

## 4. Installazione passo passo (nello studio)

1. Copia lo zip sul PC server (chiavetta o download), tasto destro › **Estrai tutto…** (per esempio sul Desktop).
2. Apri la cartella estratta e fai **doppio clic su `installa.bat`**.
3. Windows chiede *"Consentire a questa app di apportare modifiche?"* → **Sì** (si apre una finestra blu di PowerShell).
4. La finestra mostra 9 passi. Cosa vedi e cosa rispondi:

| Passo | Cosa vedi | Cosa fai |
|---|---|---|
| 1/9 Python | `[OK] Python trovato: C:\Program Files\Python312\python.exe` | niente. Se manca: segui le istruzioni (o rispondi **s** per installarlo con winget), poi rilancia `installa.bat` |
| 2/9 File | `[OK] Pacchetto: DocMap 26.11.1 · …` | niente |
| 3/9 Backup | "Prima installazione: niente da salvare" (oppure il backup, se è un aggiornamento) | niente |
| 4/9 Programma | `[OK] Programma in C:\DocMap\app…` | niente |
| 5/9 Ambiente Python | qualche minuto la prima volta | attendi |
| 6/9 Studio | *Nome dello studio* e *Nome utente dell'amministratore* | scrivi, per esempio, `Studio Rossi` e `davide` |
|  | il **codice di accesso** dell'amministratore (una riga `davide admin xxxxxxxx…`) | **copialo** in un posto sicuro, poi Invio |
| 7/9 Certificato | `[OK] Certificato dello studio…` | niente |
| 8/9 Firewall | se la rete è "pubblica" chiede di renderla **privata** | rispondi **s** se è la rete dell'ufficio |
| 9/9 Avvio | `[OK] Il server risponde (ping).` | niente |
| Kit di emergenza | *Creo adesso il Kit di emergenza da stampare? [S/n]* | **Invio** (sì): si apre una pagina → **stampala (2 copie)**, poi Invio |

5. Alla fine compaiono l'**indirizzo** (es. `https://192.168.1.20:8443/`) e si apre la pagina con i **QR da stampare**.
   Lo stesso testo resta in `C:\DocMap\LEGGIMI-INDIRIZZO.txt`.
6. **Kit di emergenza** (§7bis): stampa la pagina che si è aperta, metti i fogli in cassaforte, copia il file
   `C:\DocMap\config\kit-emergenza\DocMap-kit-….docmap-key` su una chiavetta (o mandalo a te stesso per email: è
   cifrato), poi elimina la pagina `.html` dal PC. Non saltare questo passo.
7. Il codice dell'amministratore è anche in `C:\DocMap\config\PRIMO-CODICE-ADMIN.txt` (leggibile solo dagli
   amministratori): dopo averlo copiato, **eliminalo**.
8. Sul PC server apri Chrome o Edge all'indirizzo mostrato → *Primo accesso su questo dispositivo*: nome utente
   (`davide`), un PIN per questo dispositivo e il **codice di accesso**. Dal menu ⚙ Sincronizzazione › Server online ›
   **Codici di accesso** crei i codici per le altre persone.

Opzioni per chi installa da riga di comando:
`installa.bat -NomeStudio "Studio Rossi" -Admin davide -Porta 8443 -NonChiedere`.

## 5. Collegare telefoni e altri PC

**Una volta per dispositivo** (il telefono deve essere sul Wi-Fi dello studio):

1. Inquadra il **QR n. 1** della pagina stampata (oppure apri `http://<indirizzo>:8080/`): si apre la pagina
   *"Certificato dello studio"*.
2. Tocca **Scarica il certificato** e installalo:
   - **Android**: apri il file scaricato, oppure Impostazioni › Sicurezza › Altre impostazioni › *Installa da memoria* ›
     *Certificato CA* (il nome del menu cambia tra le marche: cerca "certificato" nelle Impostazioni) → "Installa comunque";
   - **iPhone/iPad**: scarica con **Safari** → "Consenti" → Impostazioni › *Profilo scaricato* › Installa → poi
     Impostazioni › Generali › Info › *Impostazioni attendibilità certificati* → attiva "DocMap CA …";
   - **altri PC Windows**: apri il file › Installa certificato › *Computer locale* › "Autorità di certificazione radice
     attendibili" (il PC server lo ha già).
3. Inquadra il **QR n. 2** (oppure apri `https://<indirizzo>:8443/`): si apre DocMap → primo accesso con nome
   utente, PIN del dispositivo e codice di accesso ricevuto dall'amministratore. Aggiungi la pagina alla schermata Home.

Se un dispositivo non installa il certificato, il browser mostra "La connessione non è privata": si può proseguire con
*Avanzate › Procedi*, ma è sconsigliato (l'avviso torna e alcune funzioni potrebbero non andare; non provato).

**QR dei faldoni**: in DocMap › Impostazioni › **Destinazione finale** scrivi l'indirizzo riportato in
`LEGGIMI-INDIRIZZO.txt` alla voce "Destinazione dei QR" (es. `https://192.168.1.20:8443/q/{short_code}`) e riesporta il
manifest qr7.it. Il telefono, leggendo un QR, passa da qr7.it (serve Internet) e poi apre DocMap in ufficio.

**DocMap sul PC aperto da file (`index.html`)**: ⚙ Sincronizzazione › Server online → indirizzo
`https://<indirizzo>:8443/api` e il proprio codice di accesso.

**Se l'indirizzo cambia** (router nuovo, IP diverso): riavvia il PC server. All'avvio il certificato del server si
rinnova da solo con il nuovo IP e `LEGGIMI-INDIRIZZO.txt` si aggiorna; i telefoni **non** devono reinstallare il
certificato dello studio, ma va aggiornato l'indirizzo (segnalibro, Destinazione finale dei QR). Per evitarlo: IP fisso.

## 6. Licenza

Quando Dave consegna il file `nome-studio.docmap-licence`:

```bat
powershell -ExecutionPolicy Bypass -File C:\DocMap\strumenti\licenza.ps1 -File "C:\Users\...\nome-studio.docmap-licence"
```

che equivale a:

```bat
cd /d C:\DocMap\server
C:\DocMap\venv\Scripts\python.exe -m docmap_server licence install "C:\...\nome-studio.docmap-licence" --config C:\DocMap\config\config.json
```

Senza `-File` mostra lo stato (`licence status`). Il server vede la licenza nuova senza riavvio. Il controllo della
licenza è attivo solo se `config.json` contiene `"licence_required": true` (vedi `server-python/README.md`, "Licenza"):
le installazioni senza quella voce funzionano come oggi. La licenza sta in `C:\DocMap\dati\licence\` ed è inclusa nei
backup; gli aggiornamenti non la toccano.

## 7. Backup e ripristino

**Automatico**: ogni giorno alle 12:30 (attività "DocMap Backup") in
`C:\DocMap\backup\docmap_AAAAMMGG_HHMM.docmap-backup`. Si tengono gli **ultimi 30**.

Ogni backup è **cifrato** (AES-256-GCM, chiave ricavata dalla *passphrase dei backup* con scrypt): senza la passphrase
il file è illeggibile, quindi si può tenere **ovunque** — chiavetta, NAS, disco esterno, cloud — senza rischi per i dati.
Dentro (dopo averlo decifrato) c'è lo stesso zip di sempre:

- `docmap.sqlite`: copia **coerente** fatta con l'API di backup di SQLite (anche con il server acceso e qualcuno che
  lavora), controllata con `PRAGMA integrity_check`;
- `config/config.json` (la chiave del database), `impostazioni.json`, `dati/licence/…`, `dati/instance.json`;
- `MANIFEST.json`: data, PC, sha256 di ogni file, numero di righe per tabella.

Lo zip in chiaro esiste solo per un attimo in una cartella temporanea dentro `C:\DocMap\backup` (solo amministratori);
prima di dare il nome definitivo al file cifrato, il backup lo **rilegge e lo decifra** per controllo.

**La passphrase dei backup** viene creata dall'installazione (30 caratteri casuali, es. `7KQ2M-H9TXA-…`) e sta in
`C:\DocMap\config\backup-passphrase.txt`, leggibile solo da Amministratori e `SYSTEM` (l'utente con cui gira il backup).
Sta anche sul foglio del **Kit di emergenza** (§7bis): è quello che serve per aprire un backup su un altro PC.
Comandi (da PowerShell come amministratore, `py = C:\DocMap\venv\Scripts\python.exe`, `tools = C:\DocMap\strumenti\docmap_tools.py`):

| Cosa | Comando |
|---|---|
| vedere la passphrase | `py tools passphrase-backup --mostra` |
| generarne una nuova | `py tools passphrase-backup --nuova` (le vecchie restano nel file: i backup già fatti si aprono ancora) |
| usarne una scelta da voi (min. 12 caratteri) | `$env:DOCMAP_PASSPHRASE='...'; py tools passphrase-backup --imposta` |

Dopo aver cambiato la passphrase **rifai e ristampa il Kit di emergenza**: il backup giornaliero lo ricorda nel registro.

**Verifica settimanale**: una volta alla settimana il backup giornaliero apre l'ultimo backup in una cartella temporanea,
controlla zip e MANIFEST, fa `PRAGMA integrity_check`, apre il database **con la chiave contenuta nel backup**, decifra
davvero fino a 200 record e li conta per tipo. Il risultato va in `C:\DocMap\log\backup.log`:

```
2026-11-08 12:31:02 VERIFICA OK docmap_20261108_1230.docmap-backup (backup del 2026-11-08T12:30:00): integrita ok, chiave ok, record letti e decifrati 200; record per tipo: binder 1840, client 312, location 95
2026-11-15 12:31:05 VERIFICA NON RIUSCITA (codice 6): Errore: File danneggiato o manomesso (blocco 3 non autentico): non si può usare.
```

Come leggerlo: **`VERIFICA OK`** = quel backup si ripristina davvero; i numeri per tipo devono essere simili a quelli
che vedi in DocMap (faldoni = `binder`, clienti = `client`, posizioni = `location`). **`VERIFICA NON RIUSCITA`** = quel
backup non va bene: lancia subito `backup.ps1 -Verifica` (nuovo backup e nuova verifica); se fallisce ancora, controlla
il disco e chiama Dave. *"chiave nessun controllo"* = il database non ha ancora dati scritti dal server (installazione
nuova). L'ultimo esito completo è anche in `C:\DocMap\log\verifica-backup.json`. Per verificare subito:
`backup.ps1 -Verifica`, oppure `py tools verifica-backup [--file <backup>]`.

**Seconda copia (chiavetta USB o NAS)**: in `C:\DocMap\impostazioni.json` scrivi per esempio
`"seconda_destinazione": "E:\\BackupDocMap"` (nota le doppie barre) e, se vuoi, `"seconda_da_tenere": 30`. Se la
chiavetta non è collegata il backup principale si fa lo stesso e `log\backup.log` lo segnala. Per un NAS usa il
percorso di rete `\\\\NAS\\cartella`: il backup gira come utente `SYSTEM`, quindi la cartella del NAS deve accettare
l'account del computer (da verificare caso per caso; altrimenti chiavetta USB). Anche la copia è cifrata.
Altre voci: `"backup_da_tenere"` (30) e `"ora_backup"` (`"12:30"`; dopo averla cambiata rilancia `installa.bat` per
aggiornare l'attività).

**Backup a mano**: `C:\DocMap\strumenti\backup.ps1` (tasto destro › *Esegui con PowerShell*).

**Ripristino**: `C:\DocMap\strumenti\ripristina.ps1` (tasto destro › *Esegui con PowerShell*), oppure con un file preciso:

```bat
powershell -ExecutionPolicy Bypass -File C:\DocMap\strumenti\ripristina.ps1 -Zip "E:\BackupDocMap\docmap_20261102_1230.docmap-backup"
```

Mostra gli ultimi backup (cifrati e vecchi `.zip`), decifra e controlla quello scelto, chiede di scrivere
**RIPRISTINA**, fa un backup dello stato attuale, ferma il server, sposta i dati attuali in
`C:\DocMap\dati\_prima-del-ripristino_<data>\` (non si cancella niente), rimette il database del backup, riavvia e prova
il server. Se la chiave del backup è diversa da quella attuale (per esempio ripristino su un PC nuovo) rimette anche la
configurazione del backup, con i codici di accesso di allora.

- **Passphrase**: se il backup è stato cifrato su questo PC non chiede niente. Se viene da un altro PC (o da prima di un
  cambio di passphrase non più nel file) chiede la **passphrase dei backup** — è sul foglio del Kit di emergenza,
  riquadro 2. Si può scrivere con o senza trattini, maiuscole o minuscole. **Passphrase sbagliata = nulla viene
  cambiato** (3 tentativi). Dopo il ripristino la passphrase viene ricordata su questo PC.
- **Vecchi backup `.zip`** (fatti prima della versione 1.1 degli strumenti): si ripristinano come prima, senza passphrase.
  Contengono la chiave in chiaro: quando non servono più, eliminali (o tienili in cassaforte).
- **Emergenza (zip in chiaro)**: se qualcuno deve aprire il backup senza DocMap (es. un tecnico), si può ricavare lo zip
  non cifrato: `py tools esporta-in-chiaro <file.docmap-backup> --out D:\backup-in-chiaro.zip` (chiede di scrivere
  `ESPORTA IN CHIARO`). Quello zip contiene database **e chiave**: chi lo ha legge tutto. Cancellalo appena possibile.

**PC nuovo o rotto**: vedi §7ter.

## 7bis. Kit di emergenza (non perdere MAI la chiave)

Il database è cifrato con la chiave `aes_key` di `config\config.json`; i backup con la passphrase dei backup. Esistono
**solo su questo PC**. Se il PC si rompe e non le hai da parte, database e backup sono persi per sempre: nessuno (nemmeno
Dave) li può aprire. Il Kit di emergenza serve a non perderle mai. Sono due cose:

| | Cos'è | Dove tenerlo |
|---|---|---|
| **Foglio stampato** | codice di recupero (6 gruppi di 5 caratteri), passphrase dei backup, impronte, istruzioni | **cassaforte** (2 copie, in due posti diversi se puoi). Non fotografarlo, non mandarlo per email |
| **File `DocMap-kit-….docmap-key`** | `config.json` (chiave, cartella dati, impronte dei codici di accesso) + passphrase dei backup, **cifrati con il codice di recupero** | ovunque: chiavetta dei backup, NAS, email a te stesso. Senza il codice è illeggibile |

**Crearlo**: l'installazione lo propone alla fine (rispondi sì). Oppure in qualsiasi momento:
`C:\DocMap\strumenti\kit-emergenza.ps1` (tasto destro › *Esegui con PowerShell*). Si apre la pagina: **stampala**,
copia il file `.docmap-key` (in `C:\DocMap\config\kit-emergenza\`) su una chiavetta, poi lascia che lo script elimini
la pagina dal PC.

**Quando rifarlo**: se cambi la passphrase dei backup, se un ripristino o un recupero cambiano la chiave, o se hai
perso il foglio. Il backup giornaliero scrive nel registro `ATTENZIONE: Kit di emergenza mancante / da-rifare` finché
non lo rifai; anche `installa.bat` lo ricorda. Ogni foglio riporta le **impronte** (8 caratteri) di chiave e
passphrase: se non coincidono con quelle che mostra lo script, il foglio è vecchio. Un kit nuovo non rende inutile
quello vecchio finché la chiave non cambia, ma tieni solo l'ultimo.

**Recuperare la chiave dal kit** (il database c'è ma `config.json` è perso o sbagliato):

```bat
powershell -ExecutionPolicy Bypass -File C:\DocMap\strumenti\kit-emergenza.ps1 -Recupera -Kit "E:\DocMap-kit-20261103_101500.docmap-key"
```

Chiede il **codice di recupero** (riquadro 1; maiuscole/minuscole, trattini, 0/O e 1/I/L non contano), ricostruisce
`config.json` con la cartella dati di questo PC, rimette le passphrase dei backup, controlla che il database si apra con
la chiave recuperata e riavvia il server. Se c'è già una configurazione con un'altra chiave chiede di scrivere
**SOSTITUISCI** (quella attuale viene conservata in `config\_prima-del-recupero_<data>.json`). Codice sbagliato = nulla
cambia. Anche `installa.bat`, se trova un database senza configurazione, propone di recuperare la chiave dal kit.

## 7ter. Cosa succede se…

| Situazione | Cosa serve | Cosa fai |
|---|---|---|
| **Il PC si rompe / viene rubato**, i backup sono su chiavetta o NAS | un backup `.docmap-backup` + la **passphrase dei backup** (foglio, riquadro 2) | installa DocMap sul PC nuovo (`installa.bat`), poi `ripristina.ps1 -Zip <ultimo backup>` e scrivi la passphrase quando la chiede. Il backup contiene la chiave: tutto torna come prima, anche i codici di accesso. Poi crea un kit nuovo |
| Il PC si rompe, **hai il foglio ma non ricordi dove sono i backup** | — | senza un backup o il disco del vecchio PC i dati non ci sono: per questo la seconda destinazione (chiavetta/NAS) è importante |
| Il disco del vecchio PC si legge ancora (database in `C:\DocMap\dati`) ma non c'è `config.json` | il file `.docmap-key` + il **codice di recupero** (riquadro 1) | copia la cartella `dati` sul PC nuovo in `C:\DocMap\dati`, lancia `installa.bat`: trova il database senza configurazione e propone il recupero dal kit |
| **Hai perso la passphrase dei backup**, il PC funziona | niente | è ancora nel file `config\backup-passphrase.txt`: `py tools passphrase-backup --mostra`, poi crea e stampa un kit nuovo |
| Hai perso la passphrase **e** il PC | il file `.docmap-key` + il codice di recupero | sul PC nuovo, dopo `installa.bat`: `kit-emergenza.ps1 -Recupera` (rimette chiave e passphrase), poi `ripristina.ps1` con l'ultimo backup: non chiede più la passphrase |
| Hai perso foglio, file `.docmap-key` **e** PC | — | i backup cifrati non si possono aprire. Nessuno può farlo: è il prezzo della cifratura. Per questo il kit va stampato il primo giorno |
| Hai perso solo il foglio | il PC funzionante | crea subito un kit nuovo (`kit-emergenza.ps1`) e distruggi le copie vecchie se le ritrovi |
| Il foglio è finito in mani sbagliate | il PC funzionante | `py tools passphrase-backup --nuova`, poi un kit nuovo. I backup vecchi restano apribili con la passphrase vecchia: spostali in un posto sicuro o eliminali |

**Che sicurezza c'è?** Backup: AES-256-GCM (lo stesso algoritmo usato per il database), autenticato blocco per blocco
(un byte cambiato, un blocco tolto o un file troncato vengono riconosciuti e il ripristino si rifiuta), chiave ricavata
con scrypt (N=2^17, r=8, p=1: ~0,5 s e 128 MB per ogni tentativo, quindi indovinare una passphrase casuale di 150 bit è
impossibile). Passphrase e codice di recupero non passano mai sulla riga di comando (solo variabili d'ambiente del
processo) e non vengono scritti nel registro. Dettagli tecnici del formato in `docmap_tools.py` e in `PROGRESS.md`.

## 8. Aggiornamento

Con il nuovo pacchetto (zip) preparato da Dave:

```bat
powershell -ExecutionPolicy Bypass -File C:\DocMap\strumenti\aggiorna.ps1 -Pacchetto "C:\Users\...\Downloads\DocMap-installer-26.12.zip"
```

Passi: controllo del pacchetto → conferma → **backup** → stop del server → la versione attuale va in `C:\DocMap\_versioni\`
→ nuovi `app`, `server`, `strumenti` (mai `dati`, `config`, licenza, certificati, impostazioni) → pacchetti Python →
riavvio → prova `?r=ping` per 90 secondi. **Se il server non risponde, rimette da solo la versione di prima** e lo dice.

In alternativa: estrai il nuovo zip e fai doppio clic su `installa.bat` (stesso risultato: riconosce l'installazione,
fa il backup e non tocca dati né configurazione). Prima di ogni aggiornamento leggi le note della versione
(`docs/AGGIORNAMENTO-vX-vY.md`): l'ordine è sempre server prima, poi PC e telefoni.

## 9. Disinstallazione

`C:\DocMap\strumenti\disinstalla.ps1` (tasto destro › *Esegui con PowerShell*): fa un ultimo backup (cifrato), toglie le due
attività pianificate, le regole del firewall e (se confermi) il certificato dello studio da questo PC. **Non cancella
nulla** in `C:\DocMap\`: alla fine mostra dove sono database, configurazione e backup. Per reinstallare basta
`installa.bat`, che ritrova tutto.

## 10. Problemi

| Sintomo | Cosa fare |
|---|---|
| `installa.bat` si chiude subito | tasto destro › *Esegui come amministratore*; se ancora nulla: apri PowerShell e lancia `powershell -ExecutionPolicy Bypass -File .\installa.ps1` per vedere il messaggio |
| "Python 3.11 o più recente non trovato" | installa Python da python.org con "Add python.exe to PATH" e "Install for all users" (§1); **non** quello di Microsoft Store |
| "Installazione dei pacchetti Python non riuscita" | serve Internet la prima volta (o un proxy aziendale che lo blocca): riprova con Internet, oppure prepara il pacchetto con `wheels` (§3) |
| Il telefono non apre la pagina | il telefono è sul Wi-Fi dello studio (non su quello ospiti, non in 4G)? la rete del PC è "privata"? Prova dal PC server: `https://127.0.0.1:8443/` |
| "La connessione non è privata" | il certificato dello studio non è installato su quel dispositivo (§5), oppure l'indirizzo è cambiato: riavvia il PC server |
| Funziona sul PC server ma non dagli altri | Windows Defender Firewall › Impostazioni avanzate › Regole connessioni in entrata: devono esserci le regole "DocMap" attive per il profilo Privato. Un antivirus con firewall proprio va configurato a parte |
| Il server non parte | apri `C:\DocMap\log\server.log` (ultime righe). Utilità di pianificazione › "DocMap Server" › *Esegui*. Porta occupata da un altro programma: cambia `"porta"` in `impostazioni.json` e rilancia `installa.bat` |
| Prova dello stato | `C:\DocMap\venv\Scripts\python.exe C:\DocMap\strumenti\docmap_tools.py ping` → `"ok": true` |
| Backup non fatto | `C:\DocMap\log\backup.log`; Utilità di pianificazione › "DocMap Backup" › *Esegui* |
| "Manca il pacchetto 'cryptography'" | i backup cifrati usano il Python del server: rilancia `installa.bat` (reinstalla i pacchetti nel venv) |
| `VERIFICA NON RIUSCITA` nel registro | §7, "Verifica settimanale": `backup.ps1 -Verifica`; se fallisce ancora controlla il disco |
| "Passphrase dei backup sbagliata" | è sul foglio del Kit di emergenza (riquadro 2); sul PC originale: `passphrase-backup --mostra` (§7) |
| `ATTENZIONE: Kit di emergenza mancante` | `kit-emergenza.ps1`, stampa la pagina (§7bis) |
| L'IP cambia spesso | chiedi a chi gestisce il router una prenotazione DHCP (IP fisso) per il PC server |
| Il PC ha più schede di rete (Wi-Fi + cavo, VPN) | in `impostazioni.json` metti `"indirizzo_preferito": "192.168.1.20"` e riavvia il PC |
| Codice dell'amministratore perso | un altro admin crea un nuovo codice da DocMap (Codici di accesso). Se non c'è nessun altro admin: chiedi a Dave |

Registro delle versioni sostituite: `C:\DocMap\_versioni\`. Le copie più vecchie di 3 aggiornamenti vanno in
`_versioni\_da-eliminare\` e si possono cancellare a mano.

## 11. Cosa NON è ancora provato

Scritto e controllato su Linux (nessun Windows disponibile durante lo sviluppo). In particolare **non è stato provato**:

- l'esecuzione reale di `installa.ps1`, `aggiorna.ps1`, `ripristina.ps1`, `backup.ps1`, `disinstalla.ps1`,
  `licenza.ps1`, `kit-emergenza.ps1` su Windows 10/11 (Windows PowerShell 5.1): attività pianificate, firewall, `icacls`, richiesta di
  amministratore, ricerca di Python, `winget`;
- che l'attività "DocMap Server" (utente `SYSTEM`, `python.exe` del venv) parta davvero all'avvio e che lo stop fermi
  anche il secondo processo Python del venv;
- il certificato dello studio su telefoni veri (Android con Chrome, iPhone con Safari) e su Chrome/Edge di altri PC,
  compresi i "name constraints" della CA;
- la seconda destinazione dei backup su NAS con l'utente `SYSTEM`;
- l'installazione offline con `wheels`;
- la richiesta della passphrase / del codice di recupero (`Read-Host -AsSecureString`) e il passaggio con variabile
  d'ambiente al Python del venv; i permessi del file `backup-passphrase.txt` ereditati dalla cartella `config`;
- la pagina del Kit di emergenza aperta e stampata dal browser predefinito di Windows.

Provato su Linux (vedi `PROGRESS.md`): backup coerente mentre il server scrive, ritenzione, ripristino con copia di
sicurezza, backup cifrati (formato, manomissioni, passphrase sbagliata, blocchi), Kit di emergenza con il server vero
(config persa → recuperata → il server riapre il database), verifica settimanale, verifica degli zip, certificati (creazione, rinnovo al cambio di IP, verifica TLS), server HTTPS completo
(programma, riscrittura `/q/<codice>`, API con `?r=ping`, pagina del certificato in HTTP), preparazione del pacchetto,
controlli di sintassi di base sugli script PowerShell.

**Prima installazione da un cliente**: Dave la prova su un PC Windows di prova seguendo solo questa guida (cancello
della fase F4) e annota in `PROGRESS.md` cosa non torna.

## 12. Riferimento rapido

| Cosa | Dove / comando |
|---|---|
| Indirizzo | `C:\DocMap\LEGGIMI-INDIRIZZO.txt`, QR in `C:\DocMap\INDIRIZZO-QR.html` |
| Porte | 8443 (HTTPS: programma + API `/api`), 8080 (HTTP: solo pagina del certificato) — `impostazioni.json` |
| Attività | "DocMap Server", "DocMap Backup" (Utilità di pianificazione) |
| Firewall | gruppo "DocMap", solo profilo Privato |
| Strumenti | `C:\DocMap\strumenti\` (`backup.ps1`, `ripristina.ps1`, `kit-emergenza.ps1`, `aggiorna.ps1`, `licenza.ps1`, `disinstalla.ps1`) |
| Comandi Python | `C:\DocMap\venv\Scripts\python.exe C:\DocMap\strumenti\docmap_tools.py <comando>` (`ping`, `backup`, `elenco-backup`, `verifica-zip`, `verifica-backup`, `passphrase-backup`, `kit-emergenza`, `stato-kit`, `recupera-chiave`, `esporta-in-chiaro`, `indirizzi`, `pagina-indirizzo`, `cert`) |
| Codici di uscita | 0 ok · 2 errore · 3 passphrase/codice sbagliati (nulla cambiato) · 4 seconda copia non riuscita · 6 verifica non riuscita |
