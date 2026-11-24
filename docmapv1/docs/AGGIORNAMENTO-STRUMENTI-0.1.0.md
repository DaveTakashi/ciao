# Strumenti 0.1.0 — come si installa (prima versione)

Gli Strumenti sono un **componente nuovo**: non sostituiscono niente. App, sito, server, installatore e hub restano
come sono, con gli stessi dati. Nessuna migrazione, nessun file vecchio da cambiare.

## Cosa fare

1. Scompatta lo zip completo nella solita cartella (per esempio `C:\DocMap\`): accanto a `hub\` c'è ora `strumenti\`.
2. Doppio clic su `strumenti\AVVIA-STRUMENTI.bat`. La prima volta crea `strumenti\.venv` e installa le librerie
   (serve Internet, qualche minuto); poi si apre il browser.
3. (Consigliato) Installa Tesseract con la lingua italiana per leggere le scansioni: [`STRUMENTI.md`](STRUMENTI.md) §1.2.

## Dove stanno i dati

`%APPDATA%\DocMapStrumenti\`: `ricette\` (tutte le versioni), `lavori\`, `caricati\`, `impostazioni.json` (chiavi AI e
gettoni: non mandarlo a nessuno), `strumenti.sqlite` (lavori, crediti, registro), `chiave-locale.txt`. Per una copia di
sicurezza basta copiare questa cartella a programma chiuso.

## Aggiornamenti futuri

Le versioni successive sostituiranno solo `strumenti\` (programma) e lasceranno com'è `%APPDATA%\DocMapStrumenti\`;
il formato delle ricette ha un numero (`docmap-ricetta/1`) e ogni versione nuova saprà leggere le ricette vecchie.

## Per tornare indietro

Basta non avviare gli Strumenti (o cancellare `strumenti\`): il resto non ne dipende.
