# Doc Location Hub: aggiornare alla 0.13 (marchio per rivenditore e cliente, listino unico, preventivi)

La 0.13 porta il nuovo nome **Doc Location** e il **white label**: ogni rivenditore e ogni cliente può avere il suo
nome, sigla, logo, colore e contatti, e l'hub li scrive in ogni sito e pacchetto. I prezzi stanno in **un solo file**
(`plans.json`) e ogni cliente può avere il suo **preventivo**. Il registro resta allo **schema 4** (nessuna
migrazione): marchio e preventivo vanno nei campi «extra» del cliente, che c'erano già. L'app dentro lo zip è la
**26.12.12** (guida `AGGIORNAMENTO-v12.11-v12.12.md`). Guida completa: `MARCHIO.md`.

## Cosa cambia per te

| Prima (0.12) | Adesso (0.13) |
|---|---|
| Il nome DocMap era scritto nel programma | Il nome viene da `brand.js` (prodotto) → marchio del **rivenditore** → marchio del **cliente**. Titolo, barra laterale e accesso dell'hub mostrano il nome del prodotto |
| Un cliente vedeva sempre DocMap | Scheda del cliente › **Marchio e prezzo** › Modifica: nome, sigla, colore, sito, e-mail… Ai siti online arriva con «Siti da aggiornare»; i pacchetti nuovi (sede, postazioni, autoinstall) lo hanno già |
| Rivenditore: marchio solo nella licenza | `marchio imposta --rivenditore "Rivendo" --nome "Archivi Rivendo" …`: vale per tutti i suoi clienti. Quando il nome cambia **nulla dell'identità originale passa** (sito, e-mail, logo di Doc Location) |
| Prezzi in un documento a parte | **Listino**: `hub/docmap_hub/plans.json` (piani, moduli, servizi, regole); `run_windows.bat listino` lo mostra. Una copia in `%APPDATA%\DocMapHub\plans.json` cambia i prezzi sul tuo PC senza toccare il programma |
| Sconti annotati a mano | **Preventivo** del cliente: piano, mensile/annuale, sconto % oppure canone concordato, moduli, avvio, note, validità. Se il listino cambia, chi non ha un canone concordato segue il listino |

## Passi (5 minuti)

1. Chiudi l'hub (Ctrl+C nella finestra nera, o chiudila).
2. Tasto destro sullo zip nuovo › Proprietà › **Sblocca** › OK.
3. Estrai **tutto** in `C:\DocMapHub\` (cartella nuova accanto a quella vecchia; la cartella dati
   `%APPDATA%\DocMapHub\` non si tocca: i nomi tecnici restano, vedi `MARCHIO.md` §4).
4. Avvia `hub\run_windows.bat` dalla cartella nuova. Al primo avvio fa da solo il backup «prima della 0.13.0».
5. In basso a sinistra **v0.13.0** e il nome **Doc Location Hub**.
6. Apri un cliente › **Marchio e prezzo**: «marchio del prodotto» e il prezzo di listino del piano Studio.
7. Quando vuoi portare il nuovo nome ai siti online: Deploy › **Siti da aggiornare**.

## Comandi utili

```bat
run_windows.bat marchio mostra --cliente "Studio Rossi"
run_windows.bat marchio imposta --cliente "Studio Rossi" --nome "Archivio Rossi" --sigla AR --colore "#0A5C8A"
run_windows.bat marchio imposta --cliente "Studio Rossi" --azzera
run_windows.bat listino
run_windows.bat cliente preventivo "Studio Rossi" --piano studio_pro --sconto 10 --moduli retention
```

## Tornare indietro

Avvia di nuovo la cartella della 0.12.0: registro e dati sono gli stessi (schema 4). La 0.12 ignora marchio e
preventivo salvati nel cliente (restano lì per quando torni alla 0.13). Se vuoi proprio i dati di prima:
`hub\RIPRISTINA-BACKUP.bat` e scegli il backup «prima della 0.13.0».

## Per l'assistenza / l'agente

- Regola: mai un nome di prodotto in una stringa (`from .branding import brand_name as _bn`); `tools/lint-py.py` lo controlla.
- Test: `hub/tests/test_v13_marchio.py`; `docs/commerciale/LISTINO.md` si rigenera con `listino --md` e un test lo confronta.
