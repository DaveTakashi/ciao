# DocMap Hub: aggiornare alla 0.11.2 (zip controllato, «Inizia qui», aiuto)

La 0.11.2 non cambia il funzionamento dell'hub rispetto alla 0.11.1: rende **lo zip** più facile da usare e più
sicuro. L'app resta la **26.12.7** e il registro resta allo **schema 4**: nessuna migrazione.
Se arrivi dalla 0.10.x leggi anche `AGGIORNAMENTO-HUB-0.11.md` e `AGGIORNAMENTO-HUB-0.11.1.md`.

## Cosa cambia per te

| Prima (0.11.1) | Adesso (0.11.2) |
|---|---|
| Lo zip si apriva su una lista di cartelle | **`INIZIA-QUI.html`** in cima: cosa fare, in che ordine, quale guida per cosa |
| Guide solo in testo (`.md`) | Cartella **`guide\`**: le guide principali in HTML, si aprono con un doppio clic |
| Problemi e soluzioni sparsi nelle guide | **`DOMANDE-FREQUENTI`**: i problemi visti davvero (download, SmartScreen, zip non estratto, Python, `build_deploy.py`, passphrase, «Attiva tutto» fermo, sincronizzazione) |
| Per chiedere aiuto: foto e descrizione | **`hub\RACCOGLI-INFO.bat`**: un file sul Desktop con versioni, cartelle, impostazioni e ultime operazioni, senza password né codici |
| `run_windows.bat` aperto da dentro lo zip: errori poco chiari | Messaggio «Prima estrai TUTTO lo zip»; avviso se manca la cartella `tools` accanto a `hub` |
| Zip costruito a mano | Costruito e **controllato** da `tools/crea-zip.py`: integrità, file obbligatori, niente dati o chiavi, a capo Windows nei `.bat`, hub estratto e avviato davvero, `MANIFEST-SHA256.txt` con l'impronta di ogni file |

## Passi (5 minuti)

1. Chiudi il hub. Impostazioni → Backup → «Fai un backup adesso».
2. Tasto destro su `DocMap-hub-0.11.2.zip` › Proprietà › **Sblocca** › OK.
3. Estrai **tutto** in `C:\DocMapHub\` (la cartella dati `%APPDATA%\DocMapHub\` non si tocca).
4. Apri `C:\DocMapHub\DocMap-hub-0.11.2\INIZIA-QUI.html`, poi avvia `hub\run_windows.bat`: in basso a sinistra
   **v0.11.2**.

## Tornare indietro

Rimetti la cartella della 0.11.1: registro e dati sono gli stessi.
