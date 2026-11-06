# DocMap: da 26.12.6 (v12.6) a 26.12.7 (v12.7)

Cambia **solo** il server web (`server-php/setup.php`) e il numero di versione. App, telefoni, dati locali e database
del server: **nessuna migrazione**.

## Cosa cambia

- `setup.php` propone una **cartella dati per ogni sito** (`docmap-data/<nome-del-sito>` accanto a `public_html`).
  Prima tutti i siti di uno stesso dominio ricevevano la stessa proposta `docmap-data`: il secondo sito trovava il
  database del primo e si bloccava (o, se il primo non l'aveva ancora creato, due siti avrebbero usato lo stesso file).
  Un sito nella radice del dominio continua a ricevere `docmap-data`.
- `setup.php` risponde anche in JSON (`?format=json`): serve al hub 0.9 per configurare il sito da solo e mettere i
  codici in cassaforte. La pagina normale nel browser è uguale a prima.
- Se un sito in sottocartella non ha `config.php` ma nella vecchia cartella comune c'è un database, `setup.php` lo dice
  (potrebbe essere il tuo: rimetti `config.php`).

## Passi

Uguali a `AGGIORNARE-IL-SERVER.md`: carica i file **sopra** quelli vecchi senza cancellare la cartella, non toccare
`server-php/config.php` né la cartella dati, non rieseguire `setup.php` (si è già disattivato). Con il hub 0.9: Deploy →
«Siti da aggiornare». PC: `AGGIORNA-DOCMAP.bat`. Telefoni: si aggiornano aprendo l'app.

Controllo: `server-php/api.php?r=ping` → `"app_version":"26.12.7"`.

## Tornare indietro

Ricarica i file della 26.12.6. I dati non cambiano.
