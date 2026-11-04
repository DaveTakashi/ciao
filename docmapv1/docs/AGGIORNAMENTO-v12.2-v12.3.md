# Aggiornare DocMap dalla v12.2 alla v12.3 senza perdere i dati

La v12.3 (**26.12.3**) cambia **solo i file del programma**: nessuna migrazione, `api.php` e il database del server sono
uguali alla v12.2. Novità, tutte nella stampa:

- **Etichettatrice / rotolo** (manuale §19.1): nastri e rotoli Brother P-touch e QL, Dymo, Zebra, Epson, Niimbot,
  Phomemo, con la ricerca libera dei formati (marca, sigla, misura); QR + campo a scelta; una etichetta per pagina o
  striscia continua;
- **striscia ubicazione**: la scatola e subito dopo tutti i suoi faldoni, in ordine;
- stampa dei QR delle ubicazioni più comoda: **questa e quelle dentro**, **tutti i QR**;
- **adesivi piccoli** su A4 (6 fogli Avery nuovi), ricerca nei fogli, modello **Solo QR** con il campo a scelta
  (manuale §19.2).

| Dove | Cosa cambia |
|---|---|
| PC e telefoni | niente nei dati: stesse chiavi di memoria, stato 26.9, database locale schema 9. Le scelte dell'etichettatrice si salvano con le impostazioni di stampa (`print.tape`, `print.qrText`, `print.qrText2`) |
| Server | niente: stesso `api.php`, schema 3 |
| CSV, JSON, manifest | invariati |

Chi è ancora sulla **v10.0** segue direttamente [`AGGIORNAMENTO-v10-v12.md`](AGGIORNAMENTO-v10-v12.md) con lo zip v12.3.

## Passi

1. **Backup** come sempre ([`AGGIORNAMENTI.md`](AGGIORNAMENTI.md)): **Sincronizza con il server**, **Salva backup**,
   **File .sqlite**; copia da parte la cartella `docmapv1` (es. `docmapv1-v12.2-vecchia`).
2. **Server** (facoltativo, per avere la stessa versione online): carica il contenuto di `deploy/studio-de/` sopra
   `public_html/studio-de/`, senza toccare `config.php` e la cartella dati; `api.php?r=ping` → `"schema":3`.
3. **PC**: copia la nuova `docmapv1` sopra la vecchia nella stessa cartella; **Informazioni su DocMap** → **26.12.3**.
   Stesso numero di faldoni, clienti e ubicazioni di prima.
4. **Telefoni**: ricarica la pagina.

## Tornare indietro

Rimetti i file della v12.2. Le impostazioni nuove della stampa vengono ignorate; nessun dato da ripristinare.

## Per chi sviluppa

Modulo `assets/js/06n-tape.js` (+ `assets/css-tape.css`): catalogo `TAPE_FORMATS`, `tapeSearch`, `tapeItems`,
`tapeLayout`, `tapePages`, `tapePrintHTML` (pagine con `@page` nominate, in mm). Test: blocco `@@STREAM-V123@@` di
`tests/suite.js` (ricerca, ordine della striscia, pagine, PDF con QR letti). Nessuna modifica al contratto API.
