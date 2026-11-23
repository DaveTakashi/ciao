# DocMap Hub: aggiornare alla 0.12 (controllo, backup verificati, ripristino sicuro, situazione clienti)

La 0.12 rende l'hub più sicuro **da aggiornare e da riparare**. Il registro resta allo **schema 4** (nessuna
migrazione), l'app dentro lo zip è la **26.12.10**. Se arrivi da una versione più vecchia leggi prima le guide
`AGGIORNAMENTO-HUB-0.11*.md`: i passi sotto valgono lo stesso, e il registro si aggiorna da solo.

## Cosa cambia per te

| Prima (0.11.2) | Adesso (0.12) |
|---|---|
| Prima di aggiornare dovevi ricordarti di fare un backup | Al **primo avvio di una versione nuova** l'hub fa da solo un backup `docmap-hub-prima-della-<versione>-….zip` (in Impostazioni › Backup si vede come «prima di una nuova versione») e lo scrive in Panoramica |
| Un backup si sperava che fosse buono | Ogni backup, automatico o a mano, viene **controllato subito** (zip integro, registro integro, chiave di firma presente). Pulsante **Verifica** accanto a ogni backup; `run_windows.bat verifica-backup --tutti` |
| Ripristino a mano: estrarre lo zip dentro `%APPDATA%\DocMapHub\` | **`hub\RIPRISTINA-BACKUP.bat`**: mostra i backup, scegli il numero, scrivi SI. I dati di adesso **non si cancellano**: vanno in `backups\prima-del-ripristino-<ora>\`. Rifiuta un backup rovinato e si ferma se la pagina dell'hub è aperta |
| Se qualcosa non andava, «foto e descrizione» | **Controllo dell'hub** (Impostazioni, o `run_windows.bat controllo`): Python, libreria cryptography, cartella dati, spazio su disco, registro, chiave di firma, ultimo backup, seconda cartella, programma completo. Ogni riga dice **cosa fare**. È anche dentro `RACCOGLI-INFO.bat` |
| Registro rovinato = errore incomprensibile | Messaggio chiaro: «il registro non si legge», con il comando per il controllo e quello per il ripristino |
| Vecchia cartella dell'hub avviata per sbaglio: nessun avviso | Panoramica e Controllo dicono «hub più vecchio di quello già usato su questi dati» (funziona lo stesso, niente si rompe) |
| Elenco clienti solo a schermo | **Clienti › Situazione (Excel)**: una riga per sito o server di ogni cliente con versione, «aggiornato», «risponde», piano, scadenza e stato della licenza (`cliente situazione --csv FILE`). Nessuna password dentro |

## Passi (5 minuti)

1. Chiudi l'hub (Ctrl+C nella finestra nera, o chiudila).
2. Tasto destro sullo zip nuovo › Proprietà › **Sblocca** › OK.
3. Estrai **tutto** in `C:\DocMapHub\` (cartella nuova accanto a quella vecchia; la cartella dati
   `%APPDATA%\DocMapHub\` non si tocca).
4. Avvia `hub\run_windows.bat` dalla cartella nuova. La prima volta ricrea `.venv` (serve internet per `cryptography`).
5. In basso a sinistra **v0.12.0**; in Panoramica «Hub aggiornato alla 0.12.0» con il nome del backup appena fatto.
6. Impostazioni › **Controllo dell'hub** › «Controlla adesso»: tutte righe verdi o gialle con «cosa fare».

## Tornare indietro

Avvia di nuovo la cartella della 0.11.2: registro e dati sono gli stessi (schema 4). Panoramica della 0.11.2 non
conosce l'avviso «hub più vecchio», ma funziona. Se vuoi proprio i dati di prima dell'aggiornamento:
`hub\RIPRISTINA-BACKUP.bat` e scegli il backup «prima della 0.12.0».

## Per l'assistenza / l'agente

- `run_windows.bat controllo` (codice di uscita 1 se c'è almeno un errore; `--json` per l'agente).
- `run_windows.bat verifica-backup [nome] [--tutti]`, `run_windows.bat ripristina-backup [nome] [--ultimo] [--si]`.
- I comandi `controllo`, `verifica-backup` e `ripristina-backup` **non aprono il registro** prima di controllarlo:
  funzionano anche quando l'hub non parte.
