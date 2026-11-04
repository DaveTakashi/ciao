# Aggiornare DocMap dalla v10.1 alla v11 senza perdere i dati

La v11 aggiunge **Ubicazioni** (magazzino › armadio › scansia › scaffale › scatola, QR delle scatole, modalità
associazione), il **Registro sincronizzazioni** e il manifest con `;` in fondo a ogni riga. Nessun dato esistente viene
cambiato o tolto:

| Dove | Cosa cambia da solo alla prima apertura | Cosa resta uguale |
|---|---|---|
| PC (browser) | allo stato si aggiungono `locations: []`, `syncJournal: []` e, in ogni faldone, `location_id` vuoto | chiavi di memoria (`docmap_v26_state`, IndexedDB, `docmap_v26_srv`, vault), faldoni, clienti, foto, registro attività, impostazioni |
| Database locale (.sqlite) | schema 6 → 7: tabella nuova `locations`, colonna nuova `binders.location_id` | tutte le tabelle e colonne esistenti |
| Server (`docmap.sqlite`) | schema 1 → 2 alla prima chiamata: tabelle nuove `sync_journal`, `sync_journal_items` | record, token, `config.php`, chiave di cifratura |
| CSV completo | una colonna in fondo, `location_id` | ordine e nomi delle colonne esistenti; i CSV vecchi si importano come prima |

**Ordine giusto: prima il server, poi i PC, poi i telefoni.** Un PC o telefono v10.1 funziona con il server v11, ma
un PC v11 con il server ancora v10.1 non può inviare le ubicazioni.

## 1. Backup (con la v10.1, prima di toccare qualsiasi file)

1. Su **ogni PC**: apri DocMap e premi **Sincronizza con il server**, così il server ha tutto.
2. Su **ogni PC**: **Salva backup** (file JSON) e ⚙ Funzioni avanzate › Database › **File .sqlite** (contiene anche
   le foto, che non vanno sul server). Conserva i file fuori dalla cartella di DocMap.
3. Annota per ogni PC il **numero di faldoni e di clienti**.
4. Copia da parte la cartella `docmapv1` di ogni PC (es. `docmapv1-v10.1-vecchia`).
5. **Sul server** (SiteGround › Gestione file o FTP): scarica una copia di
   - la cartella dati (quella scelta in `setup.php`, di solito `docmap-data/` fuori da `public_html`), con **tutti**
     i file `docmap.sqlite`, `docmap.sqlite-wal`, `docmap.sqlite-shm`;
   - `public_html/studio-de/server-php/config.php` (contiene la chiave: senza di lui il database non si legge).

## 2. Aggiornare il server

1. Estrai lo zip v11. La cartella da caricare è `deploy/studio-de/`.
2. Carica **il contenuto** di `deploy/studio-de/` sopra `public_html/studio-de/`, **sovrascrivendo** i file
   (compresi i `.htaccess`, che ora permettono la fotocamera nella pagina).
   - **Non cancellare** la cartella prima di caricare: `server-php/config.php` non è nello zip e deve restare.
   - **Non toccare** la cartella dati e **non rieseguire** `setup.php` (resta disattivato).
3. Apri `https://docmap.pr-it.it/studio-de/server-php/api.php?r=ping`: deve rispondere `"ok":true` e
   `"schema":2`. Il server ha aggiunto da solo le tabelle del registro.
4. Controlla che `…/server-php/config.php` dia ancora 403 o 404.

## 3. Aggiornare ogni PC

1. Chiudi tutte le schede di DocMap.
2. Copia i file della nuova `docmapv1` **sopra quelli vecchi, nella stessa cartella** (es. `C:\DocMap\docmapv1\`),
   accettando di sostituire. Non cambiare percorso, nome della cartella o browser: è lì che il browser tiene i dati.
3. Riapri `index.html` con lo stesso browser (Chrome o Edge).
4. Controlla:
   - ⚙ Funzioni avanzate › Impostazioni: versione **26.11.0**;
   - numero di faldoni e clienti uguale a quello annotato;
   - apri un paio di faldoni e una foto;
   - ⚙ Sincronizzazione: il server è ancora configurato.
5. In ⚙ Sincronizzazione dai un **nome al PC** (es. "PC segreteria"): comparirà nel Registro sincronizzazioni.
6. Premi **Sincronizza con il server**. Non c'è un nuovo "primo caricamento": il server ha già i tuoi dati.
7. Se qualcosa non torna, **non lavorare** e vai al §6.

## 4. Telefoni

Basta riaprire la pagina (o ricaricarla): il telefono prende da solo la nuova versione dal server. Utente, PIN e codice
di accesso restano validi.

## 5. Prime cose da fare con la v11

1. **Informazioni › Ubicazioni › Livelli…**: controlla i nomi dei livelli (predefiniti Magazzino, Armadio, Scansia,
   Scaffale, Scatola).
2. **Crea in serie…**: crea la struttura (es. 20 scatole B01–B20 per scaffale).
3. Seleziona le scatole (**Seleziona ultimo livello**), poi **Stampa etichette** o **Scarica PDF**.
4. **Esporta di nuovo il manifest** e caricalo su qr7.it: ora contiene anche le righe delle scatole, e ogni riga
   termina con `;`.
5. **Modalità associazione**:
   - sul PC, con un lettore QR USB o Bluetooth o con la webcam;
   - sul telefono, inquadrando il QR della scatola e premendo **Avvia associazione qui**.

## 6. Tornare indietro (rollback)

- **PC**:
  1. Fai prima una **Sincronizza con il server**, se puoi.
  2. Chiudi DocMap e rimetti i file di `docmapv1-v10.1-vecchia` **nella stessa cartella**.
  3. Riapri `index.html`. La v10.1 ignora i campi nuovi e i tuoi faldoni restano.
  4. Se mancano dati, ripristina il backup JSON (⚙ Impostazioni › **Ripristina da backup JSON**) o il `.sqlite`.
- **Server**:
  1. Ricarica i file della v10.1 sopra `public_html/studio-de/`.
  2. Il database con lo schema 2 resta leggibile dalla v10.1, che ignora le tabelle del registro.
  3. In caso estremo rimetti nella cartella dati la copia di `docmap.sqlite*` salvata al §1.5.
- **Nota**: dopo il rollback ubicazioni e associazioni non si vedono più. Restano salvate e ricompaiono quando torni
  alla v11.

## 7. Per chi sviluppa

Le regole generali sono in `AGGIORNAMENTI.md`. I test che lo garantiscono sono in `tests/suite.js`:

| Sezione | Cosa verifica |
|---|---|
| `@@STREAM-X@@` | uno stato v10.1 con database schema 6 si apre con posizioni e date invariate |
| `@@STREAM-J@@` e `@@STREAM-X@@` | `api.php` v10.1 (commit `68ae170`) viene sostituito dalla v11 sulla stessa cartella dati senza perdere record |
| `@@STREAM-J@@` | un client v10.1 lavora con il server v11 |
