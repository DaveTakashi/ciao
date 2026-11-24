# Doc Location Hub: aggiornare alla 0.14 (Strumenti nei piani: crediti e server remoto)

La 0.14 mette gli **Strumenti** (le ricette per i documenti, `STRUMENTI.md`) dentro i piani e le licenze. Ogni piano
dice se il cliente può usare gli Strumenti sul suo PC, se può mandare lavori al **tuo server remoto** e quanti
**crediti al mese** ha. L'hub dà a ogni installazione un **gettone** per il tuo server degli Strumenti e i crediti di
quel gettone **seguono la licenza** da soli: sospesa, revocata o scaduta = 0 crediti; riattivata = di nuovo quelli
del piano. Il registro resta allo **schema 4** (nessuna migrazione): indirizzo, chiave cifrata e gettoni dati vanno
nelle impostazioni del registro. Gli Strumenti nello zip sono la **0.2.0** (`AGGIORNAMENTO-STRUMENTI-0.2.0.md`).

## Cosa cambia per te

| Prima (0.13) | Adesso (0.14) |
|---|---|
| Gli Strumenti non erano nei piani | Funzioni nuove della licenza: **Strumenti** (lavori sul PC del cliente) e **Strumenti sul server remoto**; limite nuovo **Crediti Strumenti al mese** (vuoto = illimitati) |
| — | Listino (`plans.json`): Prova 500, Studio 2.000, Studio Pro 10.000 + remoto, Conto terzi 50.000 + remoto, In sede 10.000, Rivenditore illimitati + remoto; modulo **Crediti Strumenti in più** (pacchetto da 10.000 al mese) |
| — | Impostazioni › **Server remoto degli Strumenti**: indirizzo e chiave di amministratore (in cassaforte, cifrata), «Prova il collegamento», elenco dei gettoni dati, «Allinea i crediti», Revoca |
| — | Licenza del cliente › **Gettone Strumenti** (solo se il piano comprende il server remoto): il gettone si vede **una volta sola**, da dare al cliente |
| Sospendere una licenza fermava solo i siti | Sospendi, revoca, riattiva, modifica o rinnovo: con la cassaforte aperta l'hub aggiorna subito anche i crediti del gettone sul server degli Strumenti |

Le licenze già emesse **non cambiano**: un cliente vecchio non ha la funzione «Strumenti» finché non rinnovi o
modifichi la licenza. Sugli Strumenti del cliente la licenza vale solo quando la installa (prima, tutto come prima).

## Passi (5 minuti)

1. Chiudi l'hub (Ctrl+C nella finestra nera, o chiudila).
2. Tasto destro sullo zip nuovo › Proprietà › **Sblocca** › OK.
3. Estrai **tutto** in una cartella nuova accanto a quella vecchia (la cartella dati `%APPDATA%\DocMapHub\` non si tocca).
4. Avvia `hub\run_windows.bat` dalla cartella nuova. Al primo avvio fa da solo il backup «prima della 0.14.0».
5. In basso a sinistra **v0.14.0**.
6. Solo se hai (o avrai) un server degli Strumenti per i clienti: sul server avvia
   `python -m docmap_strumenti serve --remote`, poi nell'hub Impostazioni › **Server remoto degli Strumenti** ›
   Imposta: indirizzo (es. `https://strumenti.tuodominio.it`) e chiave (il contenuto di `chiave-locale.txt` nella cartella
   dati di quel server). Premi **Prova il collegamento**.
7. Per un cliente Studio Pro o Conto terzi: apri la sua licenza › **Gettone Strumenti**, copia indirizzo e gettone e
   mandali al cliente (lui li scrive negli Strumenti: Impostazioni › Esecuzione remota).

## Comandi utili

```bat
run_windows.bat strumenti imposta --url https://strumenti.tuodominio.it --chiave
run_windows.bat strumenti prova
run_windows.bat strumenti gettone inst-xxxxxxxx
run_windows.bat strumenti aggiorna
run_windows.bat strumenti stato
run_windows.bat strumenti revoca inst-xxxxxxxx
run_windows.bat licence issue --instance inst-xxxxxxxx --plan studio --strumenti_credits 3000
```

## Tornare indietro

Avvia di nuovo la cartella della 0.13.0: registro e dati sono gli stessi (schema 4). La 0.13 ignora le impostazioni
del server degli Strumenti (restano lì). Le licenze emesse con la 0.14 restano valide anche per i server e i siti già
installati: le funzioni e il limite nuovi sono semplicemente ignorati da chi non li conosce.

## Per l'assistenza / l'agente

- Codice: `hub/docmap_hub/strumenti.py` (chiave con AES-256-GCM, AAD `hub|strumenti|admin_key`; ogni uso nel registro
  attività come `strumenti.key.use`, mai la chiave); rotte `/api/strumenti*` e `/api/instances/<id>/strumenti/*`;
  aggancio in `api._after_licence`.
- `licence.py` ha `strumenti`, `strumenti_remote` e `strumenti_credits`: copia **identica** in
  `server-python/docmap_server/licence_verify.py` e `strumenti/docmap_strumenti/licence_verify.py` (i test lo controllano).
- Test: `hub/tests/test_v14_strumenti.py` (server degli Strumenti vero in modalità remota).
