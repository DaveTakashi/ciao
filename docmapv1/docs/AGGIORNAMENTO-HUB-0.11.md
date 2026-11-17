# DocMap Hub: aggiornare alla 0.11 (elimina cliente, sede più veloce, più PC, sposta il sito)

La 0.11 nasce dalla prima installazione vera di Dave. L'app resta la **26.12.7**: siti, PC e telefoni non cambiano.
Il registro resta allo **schema 4**: nessuna migrazione.

## Cosa cambia per te

| Prima (0.10) | Adesso (0.11) |
|---|---|
| Un cliente non si poteva togliere | Scheda del cliente → **Elimina**: backup del hub prima, poi via cliente, progetti, installazioni, licenze, postazioni e codici. Siti online e server in sede **non si toccano** (wiki 6.15) |
| Sede: `installa.bat` con le domande + token del ponte portato a parte su file | Postazioni → **Scarica il pacchetto della sede**: dentro c'è già il codice del ponte. Sul PC: **`INSTALLA-SENZA-DOMANDE.bat`** e basta (wiki 6.16) |
| Le postazioni aprivano solo il server della sede (PC sempre acceso) | Con il sito online le postazioni aprono **il sito online** (il riferimento); se c'è la sede, un secondo collegamento «DocMap (ufficio)». Il PC della sede **può essere spento** |
| Cambiare dominio o cartella del sito: a mano | Sito → **Sposta il sito**: nuovo dominio o cartella anche a più livelli, dati copiati, codici nuovi, vecchio indirizzo che rimanda al nuovo, kit di consegna e `aggiorna-ponte` per la sede (wiki 6.17) |
| Guide: «il PC deve restare sempre acceso» | Corretto: vale solo nel modello **solo sede** |

Comandi nuovi: `cliente elimina`, `cliente sposta-sito` (wiki §8).

## Passi (5 minuti)

1. Chiudi il hub. Impostazioni → Backup → «Fai un backup adesso» (o `run_windows.bat backup`).
2. Estrai **tutto** `DocMap-hub-0.11.0.zip` in `C:\DocMapHub\` (sostituisci i file; la cartella dati
   `%APPDATA%\DocMapHub\` non si tocca). Tieni insieme `hub`, `tools`, `installer-windows`, `server-python`.
3. Avvia `hub\run_windows.bat`: in basso a sinistra **v0.11.0**.
4. Se vuoi ripartire da zero con un cliente di prova: scheda del cliente → **Elimina**, poi ricrealo da modello.
5. **Pacchetti già scaricati** (sede e postazioni) con la 0.10: funzionano ancora; riscaricali per avere
   `INSTALLA-SENZA-DOMANDE.bat` e il collegamento al sito online.

## Dati e sicurezza

- **Nessun dato si sposta** con l'aggiornamento: registro, cassaforte e licenze restano come sono.
- **Elimina cliente** fa sempre un backup prima; le cartelle del cliente vanno in `_trash` (niente si cancella dal disco).
  Per tornare indietro: ripristina quel backup (wiki 6.13).
- Il **codice del ponte** nel pacchetto della sede è aggiunto solo allo zip scaricato (mai salvato sul disco del hub) e
  l'installazione lo cancella dal PC della sede dopo averlo messo nella configurazione cifrata.
- **Sposta il sito** non cancella il sito vecchio e pubblica solo in una cartella **vuota**. Prima di cambiare qualcosa
  salva in cassaforte una nota con indirizzo, FTP e codici di prima: finché i dati non sono copiati si può **annullare**
  e tutto torna come prima. Se si ferma, si **riprende** dallo stesso punto. Le etichette (qr7.it) non cambiano.
- I codici nuovi del sito spostato sono **diversi**: consegna il kit nuovo a tutte le persone.

## Tornare indietro

Rimetti la cartella del programma della 0.10.2: il registro è lo stesso (schema 4). Gli spostamenti finiti restano
validi (la 0.10.2 vede il nuovo indirizzo); uno spostamento rimasto a metà va finito o annullato con la 0.11.
