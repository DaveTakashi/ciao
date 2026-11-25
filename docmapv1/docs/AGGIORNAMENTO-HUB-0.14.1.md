# Doc Location Hub: aggiornare alla 0.14.1 (correzioni per il collaudo completo)

La 0.14.1 corregge quello che si è rotto rifacendo **tutto il percorso vero** prima del tuo primo collaudo completo:
hub nuovo, hosting con FTPS, «Nuovo cliente» › **Attiva tutto**, kit, sito, telefono, sede. Il registro resta allo
**schema 4** (nessuna migrazione). Nello zip: app **26.12.19** ([`AGGIORNAMENTO-v12.18-v12.19.md`](AGGIORNAMENTO-v12.18-v12.19.md)),
Strumenti **0.4.0** (invariati), gateway workstation **0.1.1**, strumenti di installazione **1.2.1**.

## Cosa cambia per te

| Prima (0.14.0) | Adesso (0.14.1) |
|---|---|
| **Attiva tutto** su un cliente nuovo, con l'hosting via FTP/FTPS, si fermava subito a «Pubblica il sito demo» con `550 No such file or directory`: la cartella del cliente non veniva creata (l'avviso diceva «verrà creata», ma non succedeva) | La cartella del cliente (e la demo) si crea davvero al primo file; vale anche per SFTP e per «Sposta il sito» in una cartella nuova |
| Il collegamento all'hosting si scopriva sbagliato solo al primo cliente | Impostazioni › Hosting predefinito › **Prova il collegamento**: entra con utente e password e legge la cartella base, senza scrivere niente; dice in chiaro password sbagliata, server irraggiungibile o certificato |
| «Prova gratuita (1 mesi)» | «(1 mese)» |
| Lo zip si chiamava `DocMap-hub-0.14.0.zip` e lo rinominavamo a mano; le guide in `guide\` erano testo grezzo | `DocMap-hub-0.14.1-app-26.12.19-strumenti-0.4.0.zip`, guide formattate; `INIZIA-QUI.html` dice anche Strumenti e gateway |

## Passi (5 minuti)

1. Chiudi l'hub (Ctrl+C nella finestra nera, o chiudila).
2. Tasto destro sullo zip nuovo › Proprietà › **Sblocca** › OK.
3. Estrai **tutto** in una cartella nuova accanto a quella vecchia (la cartella dati `%APPDATA%\DocMapHub\` non si tocca).
4. Avvia `hub\run_windows.bat` dalla cartella nuova. Al primo avvio fa da solo il backup «prima della 0.14.1».
5. In basso a sinistra **v0.14.1**.
6. Impostazioni › Hosting predefinito › **Prova il collegamento**: deve dire «Collegamento riuscito».
7. Deploy › **Siti da aggiornare**: porta i siti alla 26.12.19.

## Se qualcosa va storto

La cartella vecchia è ancora lì: chiudi l'hub nuovo e avvia `hub\run_windows.bat` da quella vecchia. I dati sono gli
stessi (nessuna migrazione). Per i problemi: `hub\RACCOGLI-INFO.bat` e il file che produce.
