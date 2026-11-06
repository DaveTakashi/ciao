# Aggiornare DocMap Hub alla 0.6

Data: 5 novembre 2026. Vale per chi ha l'hub **0.5** e anche per chi è ancora alla **0.3.x** (si passa direttamente
alla 0.6: valgono anche le note della guida [0.3 → 0.5](AGGIORNAMENTO-HUB-0.3-0.5.md)).

## In breve

- **Nessun dato si perde.** Chiavi, cassaforte, clienti e licenze stanno in `%APPDATA%\DocMapHub\` e non vengono
  toccati dalla sostituzione del programma. La 0.6 non cambia il registro: aggiunge solo tre impostazioni dei backup.
- **Pubblichi tutto dal gestionale**: deploy dello staging, deploy della produzione e promozione staging → produzione
  con prova, piano da leggere, conferma, avanzamento passo per passo e ripristino automatico se qualcosa va storto.
- **Cassaforte nel gestionale**: la apri dalla barra laterale; nella scheda del cliente (Accessi, oppure clic su un sito)
  salvi l'accesso FTP, la protezione della cartella e i codici; per **mostrarli** l'hub chiede di nuovo la passphrase.
- **Aggiungi sito o server dal progetto**: sito online, server di sede o ambiente di prova su questo PC, senza passare
  dagli strumenti classici. Avvia e ferma gli ambienti di prova dalla loro scheda.
- **Backup automatici dell'hub**: ogni 24 ore mentre l'hub è aperto (il primo 20 secondi dopo l'avvio), tiene gli
  ultimi 14 e, se vuoi, ne mette una copia anche su chiavetta / NAS / OneDrive. Si scaricano da **Impostazioni**.

## Passi

1. Chiudi l'hub (nella finestra nera premi Ctrl+C).
2. Per scrupolo: `run_windows.bat backup` e copia lo zip sulla chiavetta.
3. Estrai `DocMap-hub-0.6.zip` in una cartella temporanea, apri `DocMap-hub-0.6\` e **copia tutto il suo contenuto dentro
   `C:\DocMapHub\`**, scegliendo **«Sostituisci i file nella destinazione»**. Non cancellare `C:\DocMapHub\hub\.venv\`.
4. Doppio clic su `C:\DocMapHub\hub\run_windows.bat`. Si apre il browser (con «Ricorda su questo PC» entri subito).
5. Controlla: in basso a sinistra **v0.6.0**; in **Impostazioni → Backup dell'hub** dopo un minuto compare il primo
   backup automatico.
6. Consigliato: in **Impostazioni → Backup dell'hub → Impostazioni** scrivi una seconda cartella, per esempio
   `C:\Users\<tu>\OneDrive\DocMap-backup` o la lettera della chiavetta.

## Il deploy dal gestionale, passo per passo

1. Scheda del cliente → **Pubblica** → **Deploy staging** (o clic sul sito → «Deploy»).
   Se la cassaforte è chiusa, l'hub te la fa aprire e riparte da solo.
2. **Prova**: l'hub costruisce il sito e legge cosa c'è sul server. Sul server **non cambia niente**.
3. **Piano**: versione sul server → versione da pubblicare, quanti file caricare, quali sono protetti
   (dati del cliente, `config.php`, `.htaccess` modificati a mano) e quali sono vecchi (elencati, mai cancellati).
4. Spunta «Ho letto il piano» e premi **Conferma e pubblica** (entro 30 minuti; dopo si rifà la prova).
5. L'hub fa **backup del server → caricamento → controllo**. Se il sito non risponde con la versione nuova, rimette da
   solo i file di prima e te lo dice. Puoi chiudere la finestra: il lavoro continua e lo trovi in **Attività**.
6. Provato lo staging: **Prepara la promozione** porta in produzione **esattamente lo stesso codice**.

Il deploy aggiorna **solo il programma** (il "motore"): i dati del cliente sul server non vengono mai toccati.

## Se qualcosa non va (ritorno alla 0.5)

1. Chiudi l'hub.
2. Estrai `DocMap-hub-0.5.zip` (in `python\vecchie-versioni\`) sopra `C:\DocMapHub\` («Sostituisci»).
3. Il registro è lo stesso: la 0.5 ignora le impostazioni dei backup. I backup automatici già fatti restano in
   `%APPDATA%\DocMapHub\backups\`.

## Ripristino dell'hub da un backup

Serve se il PC si rompe o lo cambi.

1. Installa l'hub sul PC nuovo (zip in `C:\DocMapHub\`, `run_windows.bat` una volta) e chiudilo.
2. Apri `%APPDATA%\DocMapHub\` ed estrai lì dentro lo zip del backup (`docmap-hub-auto-…zip` o `docmap-hub-backup-…zip`),
   sostituendo i file: `registry.sqlite3`, cartella `keys\`, cartella `issued\`, `plans.json`, `known_hosts`.
3. Riapri l'hub: entri con la **stessa passphrase** di prima. «Ricorda su questo PC» va riattivato (è legato all'account
   Windows del PC vecchio).

Senza la passphrase un backup non serve: le chiavi e la cassaforte dentro sono cifrate. Tienila separata dal backup.

## Note tecniche

- Nuovo modulo `hub/docmap_hub/backups.py` (impostazioni `backup.auto`, `backup.every_hours`, `backup.keep`,
  `backup.copy_dir`; si cancellano solo i file `docmap-hub-auto-*.zip`, mai i backup a mano né le copie fatte prima di una
  migrazione). Il controllo gira ogni 15 minuti mentre la pagina dell'hub è aperta.
- Nuove API: `POST /api/envs/<id>/deploy-plan`, `POST /api/instances/<id>/promote-plan`, `POST /api/jobs/<id>/confirm`
  (stesse regole della pagina classica: 30 minuti, stesso codice, una sola conferma per piano), `GET|POST /api/envs/<id>/secrets`,
  `…/secrets/reveal` (passphrase di nuovo, registrato nello storico), `…/secrets/delete`, `POST /api/vault/unlock|lock`,
  `POST /api/envs`, `POST /api/envs/local`, `POST /api/envs/<id>/start|stop`, `POST /api/envs/<id>` (indirizzi),
  `GET|POST /api/backups`, `POST /api/backups/now`, download `/scarica/backup/<nome>`.
- Un errore imprevisto in un'API ora risponde con un messaggio (500) invece di chiudere la connessione, ed è registrato
  nello storico (`web.error`).
- Test automatici: 104 (Linux, Python 3.13, compresi FTP/FTPS reali su server di prova). **Non ancora provato su Windows.**
