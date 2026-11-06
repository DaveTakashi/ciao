# Aggiornare DocMap dalla v11 alla v11.1 senza perdere i dati

La v11.1 (**26.11.1**) cambia **solo i file del programma**: aiuto in app più completo (argomenti e visite guidate
nuove), il blocco **Informazioni su DocMap** in Impostazioni › Dati e sicurezza, la ricerca dell'Archivio che trova un
faldone anche incollando o scansionando l'indirizzo del suo QR, correzioni e la documentazione nuova
([`INDICE.md`](INDICE.md), [`MANUALE-UTENTE.md`](MANUALE-UTENTE.md)).

**Una sola migrazione, automatica e additiva:** il database locale passa dallo schema 7 allo schema 8 aggiungendo la colonna `clients.extra_json`, che conserva colore, tag e data di modifica dei clienti anche nel file `.sqlite` (prima si perdevano aprendo un `.sqlite` o una sessione salvata). Nessun dato esistente viene toccato. Non cambiano:

| Dove | Resta uguale |
|---|---|
| PC (browser) | chiavi di memoria (`docmap_v26_state`, IndexedDB `docmap_v26_sqlite`, `docmap_v26_srv`, cassaforte), stato schema 26.9, faldoni, clienti, ubicazioni, foto, registri |
| Database locale (.sqlite) | tutte le tabelle e colonne esistenti (si aggiunge solo `clients.extra_json`, schema 7 → 8) |
| Server (`docmap.sqlite`) | schema 2, contratto API (`docmap-php`, versione 1), `config.php`, chiave, token: **niente da fare sul database** |
| CSV, JSON, pacchetti, manifest | stesse colonne (29), stessi campi, stesso formato |

Un PC v11 e un PC v11.1 lavorano insieme con lo stesso server senza problemi.

## 1. Backup (con la v11, prima di toccare qualsiasi file)

1. Su ogni PC: **Sincronizza con il server** (se lo usi), poi **Salva backup** e ⚙ Funzioni avanzate › Database ›
   **File .sqlite** (contiene le foto). Conserva i file fuori dalla cartella di DocMap.
2. Annota il **numero di faldoni, clienti e ubicazioni**.
3. Copia da parte la cartella `docmapv1` di ogni PC (es. `docmapv1-v11-vecchia`).
4. Se usi il server: scarica per sicurezza una copia di `server-php/config.php` e della cartella dati (`docmap.sqlite*`).
   Non verranno toccati, ma è la regola di ogni aggiornamento (`AGGIORNAMENTI.md`).

## 2. Server (facoltativo ma consigliato)

Il database e `api.php` non hanno nulla da migrare. Ricaricare il sito serve solo a dare ai **telefoni e ai browser**
le pagine nuove:

1. `python3 docmapv1/tools/build_deploy.py`, poi carica **il contenuto** di `deploy/studio-de/` sopra
   `public_html/studio-de/`, sovrascrivendo.
2. **Non cancellare** la cartella prima (`server-php/config.php` non è nel deploy e deve restare), **non toccare** la
   cartella dati, **non rieseguire** `setup.php`.
3. Prova `https://docmap.pr-it.it/studio-de/server-php/api.php?r=ping`: `"ok":true`, `"schema":2`.

## 3. Ogni PC

1. Chiudi tutte le schede di DocMap.
2. Copia i file della nuova `docmapv1` **sopra quelli vecchi, nella stessa cartella**, con lo stesso browser.
3. Riapri `index.html` e controlla:
   - ⚙ › Impostazioni › Dati e sicurezza › **Informazioni su DocMap**: versione **26.11.1**, schema del database
     locale 8 (aggiornato da solo dal 7) e, se usi il server, schema del server 2 (pulsante **Verifica server**);
   - numero di faldoni, clienti e ubicazioni uguale a quello annotato; apri un paio di faldoni e una foto;
   - **Sincronizza con il server**: nessun "primo caricamento", il server ha già i tuoi dati.
4. Se qualcosa non torna, **non lavorare** e vai al §5.

## 4. Telefoni

Ricarica la pagina: il telefono prende la versione nuova dal server (§2). Utente, PIN e codice di accesso restano.

## 5. Tornare indietro (rollback)

- **PC**: chiudi DocMap, rimetti i file di `docmapv1-v11-vecchia` nella stessa cartella e riapri `index.html`. I dati
  sono gli stessi: la v11 ignora la colonna in più `clients.extra_json`. Se mancano dati, ⚙ Impostazioni › **Ripristina da backup JSON** o il
  `.sqlite` del §1.
- **Server**: ricarica i file della v11 sopra `public_html/studio-de/` (sempre senza toccare `config.php` e la
  cartella dati).

## 6. Per chi sviluppa

Regole generali in [`AGGIORNAMENTI.md`](AGGIORNAMENTI.md). Prima del rilascio fai la prova a secco di
[`CHECKLIST-COLLAUDO.md`](CHECKLIST-COLLAUDO.md) §8. Il blocco `@@STREAM-V@@` verifica la migrazione 7 → 8 di un file `.sqlite` v11. La suite (`tests/suite.js`) continua ad aprire uno stato v10.1 e
a sostituire `api.php` v10.1 (commit `68ae170`) sulla stessa cartella dati; il blocco `@@STREAM-D@@` controlla che
la documentazione resti allineata al codice.
