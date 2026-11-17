# DocMap · Domande frequenti e problemi

Raccolta dei problemi incontrati davvero (installazioni di prova e prima installazione di Dave) con la soluzione.
Prima di tutto, per qualsiasi problema: **`hub\RACCOGLI-INFO.bat`** (vedi l'ultima sezione).

## Scaricare e installare

**«Impossibile scaricare» dalla chat o dalla Libreria.**
Il file era stato sostituito da una versione più nuova (le vecchie vanno in `python/vecchie-versioni/`). Prendi
sempre lo zip con il numero più alto nella cartella `python/` dei file del progetto: è l'unico «attuale».
Se il problema resta, scaricalo con un altro browser (Chrome o Edge) o da un altro PC e portalo con una chiavetta.

**Windows dice «Windows ha protetto il PC» (SmartScreen) aprendo un `.bat`.**
I file arrivano da Internet. Prima di estrarre: tasto destro sullo zip › Proprietà › **Sblocca** › OK, poi estrai di
nuovo. In alternativa, sull'avviso: **Ulteriori informazioni › Esegui comunque**.

**«Prima estrai TUTTO lo zip».**
Hai fatto doppio clic su un `.bat` dentro lo zip: Windows copia solo quel file in una cartella temporanea. Tasto destro
sullo zip › **Estrai tutto…**, poi avvia il `.bat` dalla cartella estratta.

**«Python 3.11 o successivo non trovato» / «Python troppo vecchio».**
Installa Python 3.13 da python.org spuntando **«Add python.exe to PATH»**. Poi nella cartella `hub` cancella la
sottocartella `.venv` (se c'è) e riavvia `run_windows.bat`: la ricrea con il Python nuovo.

## Hub

**«tools/build_deploy.py non trovato» quando pubblichi un sito.**
La cartella `hub` è stata copiata da sola. Estrai di nuovo **tutto** lo zip in `C:\DocMapHub\` e avvia
`hub\run_windows.bat` da lì. Se vuoi tenere l'hub dove sta: `run_windows.bat settings set docmap_dir <cartella che
contiene tools>`. Il messaggio di errore elenca le cartelle dove l'hub ha cercato.

**Ho cancellato la cartella dell'hub ma non mi chiede più la passphrase.**
È normale: il programma e i dati sono in due posti diversi. I dati (chiavi, cassaforte, clienti) sono in
`%APPDATA%\DocMapHub\`, e con «Ricorda su questo PC» la passphrase è salvata in modo protetto da Windows. Per
cambiare la passphrase della cassaforte: nella cartella `hub` apri il prompt dei comandi e scrivi
`run_windows.bat vault change-passphrase` (chiede la nuova due volte e aggiorna anche «Ricorda su questo PC»). Poi fai
un backup.

**Voglio ripartire da zero con un cliente.**
Scheda del cliente › **Elimina** › scrivi il nome. L'hub fa prima un backup completo (il nome compare alla fine): per
tornare indietro ripristini quel backup. Il sito online e il server in sede non vengono toccati.

**«Attiva tutto» si è fermato.**
Leggi il passo e il motivo nella finestra. I casi più comuni: SSL del dominio non ancora attivo (attendi qualche
minuto e premi di nuovo **Attiva tutto**: riprende da dove si era fermato), FTP con password o cartella sbagliata
(Impostazioni › Hosting predefinito), cartella sul server non vuota (l'hub non sovrascrive mai un sito: scegli
un'altra cartella o svuotala tu).

**La pagina dell'hub non si apre / porta occupata.**
L'hub sceglie da solo una porta libera e la scrive nella finestra nera. `run_windows.bat info` dice anche l'indirizzo.

**Ho perso il kit di consegna.**
Scheda del cliente › **Kit di consegna**: si rifà quando vuoi, le copie di `config.php` vengono riprese dai siti.

## Sede, più PC e sito online

**Il PC dell'ufficio deve restare sempre acceso?**
No, se il cliente ha il sito online: il **riferimento è il sito online** e PC e telefoni lavorano lì anche a PC spento.
Il server dell'ufficio tiene una copia allineata e alla riaccensione recupera tutto. Deve restare acceso in orario di
lavoro **solo** nel modello «solo sede» (senza sito online).

**Come collego un secondo o terzo PC?**
Scheda del cliente › Postazioni › aggiungi una postazione per ogni PC › scarica il suo pacchetto. Sul PC: estrai e
doppio clic su `collega-questo-pc.bat` (non servono permessi di amministratore). Compare il collegamento «DocMap -
<studio>» al sito online; se c'è la sede anche «DocMap (ufficio)».

**La sincronizzazione sede ⇄ sito non va.**
Sul PC della sede apri `C:\DocMap\sync\ultimo-esito.txt`. Per rifare il collegamento:
`C:\DocMap\strumenti\configura-sync.ps1 -TokenFile <file con il codice del ponte>` (il codice si riprende dall'hub:
`run_windows.bat cliente token-ponte --cliente "<nome>" --esporta E:\token-ponte.txt`).

## Siti e domini

**Voglio comprare `docmap.it` e spostare i siti.**
Si può fare quando vuoi: clic sul sito › **Sposta il sito**. I dati vengono copiati, il vecchio indirizzo rimanda al
nuovo e le etichette stampate (che puntano a `qr7.it`) restano valide. Dopo lo spostamento consegna i codici nuovi
del kit; se c'è la sede lancia `aggiorna-ponte\AGGIORNA-PONTE.bat` sul suo PC.

**Le etichette già stampate funzionano ancora dopo un cambio?**
Sì. Ogni QR è `https://qr7.it/<codice>`: cambia solo dove qr7.it manda, il codice resta quello.

## Chiedere aiuto

1. Doppio clic su **`hub\RACCOGLI-INFO.bat`**: crea `DocMap-info-per-assistenza.txt` sul Desktop con versione di
   Windows e Python, cartelle, impostazioni dell'hub e ultime 30 operazioni. **Non contiene password né codici.**
2. Fai una **foto o uno screenshot** del messaggio di errore (finestra nera compresa).
3. Manda i due file in chat dicendo cosa stavi facendo.

Non mandare mai: la passphrase, il contenuto del kit di consegna, `config.php`, i file `.docmap-key` o i backup.
