# Aggiornare DocMap dalla v12 alla v12.1 senza perdere i dati

La v12.1 (**26.12.1**) cambia **solo i file del programma e `api.php`**, senza migrazioni:

- **scatole annidate**: lo stato dato a uno scaffale o a un armadio (e la Verifica rientro) comprende anche i faldoni
  delle scatole che contiene, sul PC e sul telefono;
- **archivi sul telefono**: la ricerca del telefono conosce gli archivi (un pulsante per archivio, filtro `archivio:`,
  sigla sui risultati) e gli stati rapidi (`stato:fuori` comprende "dato al cliente", "dato al Comune"…);
- guida senza la protezione cartella di SiteGround, lista delle prove essenziali in
  [`CHECKLIST-COLLAUDO.md`](CHECKLIST-COLLAUDO.md) §0.

| Dove | Cosa cambia |
|---|---|
| PC e telefoni | niente nei dati: stesse chiavi di memoria, stato 26.9, database locale schema 9 |
| Server | `api.php`: la risposta `location` aggiunge `nested_binders` e `nested_count` (solo in più). Schema 3 invariato, nessuna tabella nuova |
| CSV, JSON, manifest | invariati (30 colonne) |

Chi è ancora sulla **v10.0** segue direttamente [`AGGIORNAMENTO-v10-v12.md`](AGGIORNAMENTO-v10-v12.md) con lo zip v12.1.

## 1. Backup

Come sempre ([`AGGIORNAMENTI.md`](AGGIORNAMENTI.md)): **Sincronizza con il server**, **Salva backup** e **File .sqlite** su
ogni PC; copia da parte la cartella `docmapv1` (es. `docmapv1-v12-vecchia`); sul server una copia di `config.php` e della
cartella dati.

## 2. Server

1. Carica **il contenuto** di `deploy/studio-de/` sopra `public_html/studio-de/`, sovrascrivendo. Non cancellare la
   cartella, non toccare la cartella dati, non rieseguire `setup.php`.
2. `…/server-php/api.php?r=ping`: `"ok":true`, `"schema":3`.
3. Se c'è ancora la protezione cartella di SiteGround su `studio-de`, toglila (Site Tools › Sicurezza › Directory protette).

## 3. Ogni PC

Chiudi DocMap, copia la nuova `docmapv1` sopra la vecchia nella stessa cartella, riapri `index.html`: **Informazioni su
DocMap** mostra **26.12.1**. Numero di faldoni e clienti uguale a prima.

## 4. Telefoni

Ricarica la pagina. La prima ricerca dopo l'aggiornamento scarica di nuovo tutto una volta (per avere archivi e stati),
poi torna incrementale.

## 5. Tornare indietro

Rimetti i file della v12 (PC e server). Nessun dato da ripristinare: la v12 ignora i campi nuovi della risposta.

## 6. Per chi sviluppa

Contratto: [`API-CONTRACT.md`](API-CONTRACT.md) §13 e `docs/python/openapi.yaml` (`LocationResponse`). Il server Python
deve aggiungere gli stessi due campi. Test: blocco `@@STREAM-V121@@` (sezione A di `tests/suite.js`) e `@@STREAM-V12@@`.
