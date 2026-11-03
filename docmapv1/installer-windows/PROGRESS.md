# installer-windows — avanzamento (F4, installazione in sede su Windows)

> Guida per lo studio e per Dave: `GUIDA-INSTALLAZIONE.md`. Cartella fissa `C:\DocMap\`. Nessun file fuori da
> `docmapv1/installer-windows/` è stato modificato (server-python invariato: il lancio in rete locale è in `docmap_tools.py serve`).

## Stato (2026-11-03)

### Backup cifrati e Kit di emergenza (strumenti 1.1.0, 2026-11-03)
- **Backup `.docmap-backup`** (`docmap_tools.py backup`): lo stesso zip di prima (database coerente, config, dati,
  MANIFEST) cifrato con **AES-256-GCM a blocchi da 1 MiB** (costruzione STREAM: nonce = prefisso casuale 7 byte |
  numero del blocco 4 byte | flag "ultimo" 1 byte; AAD = intestazione intera), chiave da **scrypt** (N=2^17, r=8, p=1,
  sale casuale 16 byte) della passphrase dei backup. Intestazione di 58 byte: magic `DOCMAPBK`, versione, kdf, parametri,
  dimensione del blocco, sale, prefisso del nonce, **controllo** = HMAC-SHA256(seconda metà dell'uscita di scrypt,
  intestazione)[:16] → "passphrase sbagliata" distinta da "file danneggiato" senza scrivere niente. Memoria: due blocchi
  (nessun limite di dimensione del database). Blocchi scambiati/tolti, file troncato o allungato, qualsiasi byte
  cambiato → rifiutato. Il file cifrato viene riletto e decifrato per controllo prima di prendere il nome definitivo;
  lo zip in chiaro vive solo in una cartella temporanea dentro `BASE\backup` (ACL solo amministratori). Nessuna opzione
  per fare backup in chiaro (sicuro di default); `esporta-in-chiaro` solo per emergenze, con `--conferma "ESPORTA IN CHIARO"`.
- **Passphrase dei backup**: `BASE\config\backup-passphrase.txt` (codice casuale base32 Crockford, 6×5 caratteri =
  150 bit; creato da `installa.ps1` con `passphrase-backup --crea` o dal primo backup). Prima riga = attuale, righe dopo =
  precedenti (`--nuova`/`--imposta` le conservano; un ripristino con una passphrase di un altro PC la aggiunge), così i
  backup vecchi si aprono sempre. **Decisione: file con ACL (Administrators + SYSTEM), non DPAPI.** Motivo: la passphrase
  protegge le copie dei backup *fuori* dal PC; sul PC sta accanto a `config.json`, che ha già la chiave del database in
  chiaro con le stesse ACL, quindi DPAPI LocalMachine (decifrabile da qualsiasi processo amministratore della macchina)
  non aggiungerebbe protezione reale, mentre legherebbe la passphrase a quell'installazione di Windows (persa con una
  reinstallazione) e non sarebbe provabile su Linux. Il segreto che conta è sul foglio del kit.
- **Kit di emergenza** (`kit-emergenza`, `kit-emergenza.ps1`): file `.docmap-key` (magic `DOCMAPKY`, stesso formato) con
  `config.json` (chiave, data_dir, impronte dei token) + tutte le passphrase dei backup, cifrati con un **codice di
  recupero** nuovo (stesso alfabeto, 150 bit); pagina HTML statica da stampare (niente script né QR) con codice in
  gruppi, passphrase dei backup, impronte (8 caratteri) e istruzioni "cosa fare se". Il codice si scrive con o senza
  trattini, maiuscole/minuscole, 0/O e 1/I/L equivalenti. `config\kit-emergenza.json` tiene le impronte: `stato-kit` dice
  `ok` / `mancante` / `da-rifare` (passphrase o chiave cambiate); il backup lo scrive nel registro e `installa.ps1`
  propone il kit alla fine (sempre alla prima installazione). **`recupera-chiave`** ricostruisce `config.json` (con la
  cartella dati di questo PC), rimette le passphrase, controlla che il database si apra; non sovrascrive una config con
  un'altra chiave senza `--sostituisci` (la vecchia va in `config\_prima-del-recupero_<data>.json`). `installa.ps1`,
  trovando un database senza config, propone il recupero dal kit invece di fermarsi.
- **`verifica-backup`**: decifra l'ultimo backup in una cartella temporanea, zip + MANIFEST + `PRAGMA integrity_check`,
  apre il database con la chiave contenuta nel backup (`meta/key_check` con `docmap_server/crypto.py`, come il server),
  conta i record per tipo e ne decifra fino a 200; dice se la chiave è uguale a quella attuale. Risultato in
  `log\verifica-backup.json`; `backup.ps1` la fa una volta ogni 7 giorni (`--se-scaduta 7`, `-Verifica` = subito) e scrive
  `VERIFICA OK …` / `VERIFICA NON RIUSCITA …` in `log\backup.log` (codice di uscita 6).
- `ripristina.ps1`/`ripristina`: `.docmap-backup` e vecchi `.zip`; prova la passphrase di questo PC, altrimenti la chiede
  (`Read-Host -AsSecureString`, 3 tentativi); passphrase sbagliata o file danneggiato → messaggio in italiano, codice 3/2,
  **niente cambiato**. Segreti solo in variabili d'ambiente (`DOCMAP_PASSPHRASE`, `DOCMAP_CODICE`), mai negli argomenti,
  tolte in `finally` (controllato dal lint). Codici di uscita: 0 ok, 2 errore, 3 passphrase/codice sbagliati, 4 seconda
  copia non riuscita, 6 verifica non riuscita.
- `installa.ps1`: il backup prima di un aggiornamento usa il Python del venv (serve `cryptography`), con ripiego sul
  Python di sistema.
- Prove: `tests/test_backup_cifrati.py` (19 test): dimensioni ai bordi dei blocchi (0, 1, 15, 16, 63, 64, 65, 127, 128,
  129, 640, 643 byte con blocchi da 64), 3 MiB con blocco predefinito, **ogni byte cambiato** rifiutato, troncamento a
  ogni lunghezza, byte aggiunto, blocchi scambiati/tolti/ultimo mancante, passphrase sbagliata (nessun file creato),
  parametri scrypt reali 2^17, forme del codice, file della passphrase (permessi 600 su Linux, `--nuova`, `--imposta`,
  backup vecchi ancora apribili), ripristino con passphrase sbagliata/giusta (dati intatti, niente in chiaro lasciato),
  file cifrato danneggiato, vecchio zip, `esporta-in-chiaro` con/senza conferma, `verifica-backup` (ok, database corrotto,
  file corrotto, salto entro 7 giorni), stato del kit e pagina; **con il server Python vero**: push di 8 record →
  backup → verifica (8 record decifrati) → kit → config e passphrase spostate via → codice sbagliato rifiutato →
  `recupera-chiave` → il server riparte e `pull` restituisce gli stessi record; config con un'altra chiave non
  sovrascritta senza `--sostituisci`.

### Fatto
- `installa.bat` → `installa.ps1` (ExecutionPolicy Bypass, si rilancia da amministratore): Python ≥ 3.11 (non Store;
  spiega come installarlo, offre `winget`), pacchetto (o lo prepara dal repository), backup se è un aggiornamento,
  `C:\DocMap\{app,server,strumenti}` (le versioni sostituite vanno in `_versioni\`, ultime 3), `venv` + `requirements.txt`
  (anche offline da `server\wheels`), `impostazioni.json`, `python -m docmap_server setup` (dati `C:\DocMap\dati`,
  config `C:\DocMap\config\config.json`, codice admin mostrato e salvato in `config\PRIMO-CODICE-ADMIN.txt`),
  `docmap.config.js` (web, `apiBase:"/api"`), certificato, ACL (Admin+SYSTEM) su config/dati/backup/certificati,
  firewall solo profilo **Privato** (avvisa se la rete è Pubblica), attività "DocMap Server" (SYSTEM, all'avvio + controllo
  ogni 5 min, nessun NSSM) e "DocMap Backup" (giornaliera), avvio, `?r=ping`, `LEGGIMI-INDIRIZZO.txt` + `INDIRIZZO-QR.html`.
  Rieseguirlo = aggiornamento (mai `dati`, `config`, certificati, impostazioni); se il ping fallisce torna alla versione precedente.
  Rifiuta di creare una chiave nuova se esiste `dati\docmap.sqlite` senza config.
- **HTTPS in rete locale** (necessario: su `http://192.168.x.x` il browser non dà WebCrypto, quindi il login web di
  DocMap non funzionerebbe): CA dello studio con *name constraints* (solo 10/8, 172.16/12, 192.168/16, 127/8, `.local`,
  `localhost`, nome del PC), certificato del server ≤ 800 giorni (limite iOS 825) rinnovato da solo all'avvio se cambia
  l'IP o scade entro 60 giorni; pagina HTTP sulla porta 8080 per scaricare il certificato (istruzioni Android/iPhone/PC),
  tutto il resto rinviato a HTTPS 8443. Riscritture del `.htaccess` (`/q/<codice>` → `scan.html`, `/q/assets/…`) e header
  di sicurezza sui file statici; le risposte dell'API restano quelle del server.
- `backup.ps1` + `docmap_tools.py backup`: API di backup di SQLite **in un solo passo** (a piccoli passi, con un altro
  processo che scrive di continuo, la copia ricominciava all'infinito: visto nei test), `PRAGMA integrity_check`,
  `journal_mode=DELETE` nella copia, zip `docmap_AAAAMMGG_HHMM[_N].zip` con config, impostazioni, licenza, instance.json e
  `MANIFEST.json` (sha256, righe per tabella); ultimi 30; seconda destinazione facoltativa (USB/NAS) con propria ritenzione,
  errore lì = backup principale comunque fatto (codice 4) e scritto in `log\backup.log`.
- `ripristina.ps1` + `ripristina`: verifica (CRC, MANIFEST, percorsi, integrità), conferma scrivendo RIPRISTINA, copia di
  lavoro dello zip (il backup preventivo potrebbe toglierlo per la ritenzione), backup dello stato attuale, stop, dati
  attuali in `dati\_prima-del-ripristino_<data>\`, se la chiave è diversa rimette anche la config (con `data_dir` locale),
  in caso di errore rimette i dati di prima; riavvio e ping.
- `aggiorna.ps1 -Pacchetto <zip|cartella>`: controllo → backup → stop → sostituzione → pip → riavvio → ping 90 s →
  ritorno automatico alla versione precedente (anche se un passo intermedio va in errore).
- `disinstalla.ps1`: ultimo backup, toglie attività, regole firewall e (chiedendo) il certificato; non cancella nulla e
  dice dove sono dati, config e backup. `licenza.ps1`: `licence install|status` del server.
- `docmap_tools.py pacchetto --out DIR [--zip]`: `build_deploy.py --no-server --base-path /` + server + script + guida +
  `VERSIONE.txt` + `PACCHETTO-MANIFEST.txt`.
- Script `.ps1` in UTF-8 **con BOM** e CRLF (`.gitattributes`), solo sintassi di Windows PowerShell 5.1.

### Prove (Linux, 2026-11-02)
- `python3 -m unittest discover -s docmapv1/installer-windows/tests` → **Ran 37 tests, OK (skipped=1)** con Python 3.13
  (lo skip è il parser `pwsh`, non disponibile); 27 test di `docmap_tools` OK anche con Python 3.11 (venv + requirements.txt).
  Coprono: impostazioni (predefiniti, BOM, valori errati, aggiunta chiavi senza sovrascrivere), nomi e ritenzione dei
  backup, backup con scritture continue in WAL (3 backup coerenti), seconda destinazione e suo errore, zip manomessi/estranei/
  con `..`, ripristino (stessa chiave, chiave diversa, errore a metà → dati rimessi), riscritture e header ASGI, certificati
  (creazione, nessun cambio, cambio IP, rinnovo, name constraints, verifica TLS con `ssl` di Python e rifiuto di un'altra CA),
  **server completo** (pacchetto → `C:\DocMap` finta → `setup` → `serve` in un altro processo: ping HTTPS verificato con la CA,
  app, `/q/<codice>`, `docmap.config.js`, `.htaccess` 403, API `me` con token e origine, 401 con token errato, pagina del
  certificato e rinvio 302 con l'Host del telefono, backup a server acceso), pacchetto e zip.
- Lint PowerShell (`tests/test_powershell_lint.py`, 10 test): BOM/CRLF, parentesi e stringhe, niente sintassi PS7, comandi
  sconosciuti (refusi), sottocomandi di `docmap_tools` esistenti, elenco file del pacchetto coerente.
- Server invariato, prove richieste verdi: `diff_test.py` 5 OK, `test_licence.py` 9 OK, `validate_python.py` "all checks passed".
- `pwsh`: scaricabile da GitHub ma l'esecuzione del binario scaricato è stata negata dal sistema di permessi della sessione:
  il test `test_pwsh_parser` parte da solo dove `pwsh` è installato.

### Da fare / non provato
- **Esecuzione reale su Windows 10/11** di tutti i `.ps1` (attività pianificate, firewall, icacls, elevazione, winget,
  `Get-CimInstance` per fermare anche il secondo processo del `python.exe` del venv, trigger con ripetizione di 3650 giorni).
- Certificato dello studio su telefoni veri (Android/Chrome, iPhone/Safari) e Chrome/Edge di altri PC; name constraints.
- Backup su NAS con utente SYSTEM; installazione offline con `wheels`.
- Su Windows: `Read-Host -AsSecureString`, variabili d'ambiente verso il Python del venv, ACL ereditate da
  `backup-passphrase.txt` e `config\kit-emergenza\`, stampa della pagina del kit dal browser predefinito.
- Parser `pwsh` sugli script (basta installare PowerShell 7 e rilanciare i test).

### Prossimo passo
Dave prova su un PC Windows di prova seguendo solo `GUIDA-INSTALLAZIONE.md` (cancello F4): installazione, telefono
Android + iPhone, riavvio del PC, backup alle 12:30, `ripristina.ps1`, `aggiorna.ps1` con un pacchetto nuovo,
`disinstalla.ps1`. Annotare qui ogni differenza.

## Comandi di prova

```sh
python3 -m unittest discover -s docmapv1/installer-windows/tests -v      # 58 test (19 in test_backup_cifrati.py)
python3 docmapv1/installer-windows/docmap_tools.py pacchetto --out ../DocMap-installer-prova --zip
# server invariato:
python3 docmapv1/server-python/tests/diff_test.py
python3 docmapv1/server-python/tests/test_licence.py
NODE_PATH=/opt/node22/lib/node_modules python3 docmapv1/server-python/tests/validate_python.py
```

## Registro
- 2026-11-02 · prima stesura degli script, `docmap_tools.py`, guida (commit e8555d3).
- 2026-11-02 · 27 test di `docmap_tools`; backup SQLite in un passo solo (commit 9a35589).
- 2026-11-03 · strumenti 1.1.0: backup cifrati `.docmap-backup`, passphrase dei backup, Kit di emergenza
  (`kit-emergenza.ps1`, `recupera-chiave`), `verifica-backup` settimanale, `esporta-in-chiaro`; 58 test (19 nuovi) OK
  con Python 3.13 e con Python 3.11 (venv + requirements.txt).
- 2026-11-02 · lint PowerShell, ping senza proxy, correzioni (cast della versione di Python, argomenti vuoti in PS 5.1,
  cartella corrente prima di spostare `strumenti`, database senza config), PROGRESS completo.
