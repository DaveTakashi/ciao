# Aggiornare DocMap dalla v10.0 alla v12 in un solo passaggio, senza perdere i dati

Questa guida è per il PC che usa ancora la **v10.0** (26.10.0). Non serve installare prima la v10.1, la v11 e la v11.1:
la v12 (**26.12.0**, v12.1 **26.12.1**, v12.2 **26.12.2**, v12.3 **26.12.3**, v12.4 **26.12.4**, v12.5 **26.12.5**) apre direttamente i dati della v10.0 e li porta avanti da sola. Tutte le migrazioni sono
**automatiche e additive**: si aggiungono campi e tabelle, niente viene rinominato o cancellato.

| Dove | Cosa si aggiunge da solo alla prima apertura | Cosa resta uguale |
|---|---|---|
| PC (browser) | allo stato: `locations`, `syncJournal`, `archives`, `statusEvents` (tutti vuoti); in ogni faldone `location_id` e `archive_id` vuoti (= "Archivio principale") | chiavi di memoria (`docmap_v26_state`, IndexedDB `docmap_v26_sqlite`), faldoni, clienti, colori, foto, registro attività, impostazioni, modelli etichetta |
| Database locale (.sqlite) | schema 6 → 9: tabelle `locations`, `archives`, `status_events`; colonne `binders.location_id`, `binders.archive_id`, `clients.extra_json`, `contents_items.item_id` | tutte le tabelle e colonne esistenti |
| CSV completo | due colonne in fondo: `location_id`, `archive_id` (30 colonne) | ordine e nomi delle colonne esistenti; i CSV della v10 si importano come prima |
| Manifest qr7.it | ogni riga termina con `;` e compaiono le righe delle scatole, se ne crei | stesse colonne e stessi `short_code`: i QR già stampati continuano a funzionare |

Tutto quello che c'è di nuovo (ubicazioni, archivi, stati, ricerca) parte **vuoto**: i faldoni restano dove erano e
finiscono nell'**Archivio principale**, che esiste senza doverlo creare.

## 1. Backup (con la v10.0, prima di toccare qualsiasi file)

1. Apri DocMap v10.0 e premi **Salva backup** (file JSON).
2. ⚙ Funzioni avanzate › Database › **File .sqlite**: contiene anche le foto degli armadi.
3. Conserva i due file **fuori** dalla cartella di DocMap (es. su una chiavetta o in `Documenti\DocMap-backup\`).
4. Annota il **numero di faldoni e di clienti** (si vedono in Archivio e in Clienti).
5. Copia da parte l'intera cartella del programma, es. `C:\DocMap\docmapv1` → `C:\DocMap\docmapv1-v10-vecchia`.

## 2. Il server online (solo se lo hai già installato)

La v10.0 non usa il server. Se **non** hai mai caricato `deploy/studio-de/` su SiteGround, salta questo paragrafo: il
server si installa più avanti con la guida [`DEPLOY-WEB.md`](DEPLOY-WEB.md) (e manuale §7), direttamente in v12.

Se invece hai già un server v10.1 o v11 online, aggiornalo **prima** del PC:

1. Scarica una copia della cartella dati (`docmap-data/`, tutti i file `docmap.sqlite*`) e di
   `public_html/studio-de/server-php/config.php`.
2. Dallo zip v12 carica **il contenuto** di `deploy/studio-de/` sopra `public_html/studio-de/`, sovrascrivendo.
   **Non cancellare** la cartella prima, **non toccare** la cartella dati, **non rieseguire** `setup.php`.
3. Apri `https://docmap.pr-it.it/studio-de/server-php/api.php?r=ping`: deve rispondere `"ok":true`, `"schema":3` e
   fra le `features` anche `archives`, `access_log`, `status_events`. Il server ha aggiunto da solo le tabelle nuove
   (registro sincronizzazioni, registro accessi).

**Dopo** l'aggiornamento del server, togli la protezione della cartella se l'avevi messa (Site Tools › Sicurezza ›
**Directory protette** › elimina quella di `studio-de`): con la v12 i telefoni restano collegati da soli e la password
di SiteGround verrebbe chiesta di nuovo a ogni QR. I dati restano protetti da codici di accesso, PIN e cifratura.

## 3. Aggiornare il PC

1. Chiudi tutte le schede di DocMap.
2. Estrai lo zip v12 e copia i file della nuova `docmapv1` **sopra quelli vecchi, nella stessa cartella**
   (es. `C:\DocMap\docmapv1\`), accettando di sostituire. **Non cambiare** percorso, nome della cartella o browser: è lì
   che Chrome / Edge tengono i dati.
3. Riapri `index.html` con lo stesso browser.
4. Controlla:
   - ⚙ › Impostazioni › Dati e sicurezza › **Informazioni su DocMap**: versione **26.12.5** (o 26.12.0 … 26.12.4 se installi una v12 precedente), database locale schema **9**;
   - numero di faldoni e clienti uguale a quello annotato; apri un paio di faldoni e una foto;
   - in alto non compare il selettore degli archivi (c'è un solo archivio): è normale.
5. Fai subito un nuovo **Salva backup**, questa volta della v12.
6. Se qualcosa non torna, **non lavorare** e vai al §6.

## 4. Telefoni

Solo con il server (§2): basta riaprire o ricaricare la pagina. Al primo accesso si può spuntare
**Ricordami su questo dispositivo**, così il telefono non chiede il PIN a ogni scansione (manuale §15).

## 5. Prime cose da provare con la v12

Tutte spiegate nel [`MANUALE-UTENTE.md`](MANUALE-UTENTE.md) e nell'aiuto **?** dentro il programma:

1. **Cercare** (manuale §14): una sola casella, accetta errori di battitura e filtri come `stato:fuori`,
   `cliente:rossi`, `anno:2020..2024`, `archivio:<nome>`.
2. **Stati** (manuale §6.10): dalla scheda di un faldone o dopo una scansione, in due tocchi: preso, reinserito, dato al
   cliente, dato al Comune fino al…, mancante. **Fuori archivio** elenca tutto quello che non è al suo posto.
3. **Ubicazioni** (manuale §6): magazzino › armadio › scansia › scaffale › scatola, QR delle scatole, modalità
   associazione; con una scatola si può fare uscita e **verifica al rientro** (dice cosa manca).
4. **Più archivi** e **Configura archivio** (manuale §6.6–6.7), QR annidati e tag NFC (manuale §6.8–6.9).
5. Dopo aver creato le scatole, **esporta di nuovo il manifest** e caricalo su qr7.it.

## 6. Tornare indietro (rollback)

- **PC**:
  1. Chiudi DocMap e rimetti i file di `docmapv1-v10-vecchia` **nella stessa cartella**.
  2. Riapri `index.html`. La v10.0 ignora i campi nuovi; faldoni, clienti e foto restano.
  3. Se mancano dati, ⚙ Impostazioni › **Ripristina da backup JSON** con il file del §1, oppure apri il `.sqlite` del §1.
- **Server**: ricarica i file della versione precedente sopra `public_html/studio-de/` (senza toccare `config.php` e la
  cartella dati). Il database con lo schema 3 resta leggibile: le versioni vecchie ignorano le tabelle nuove. In caso
  estremo rimetti la copia di `docmap.sqlite*` del §2.
- **Nota**: dopo il rollback stati, archivi e ubicazioni non si vedono più. Restano salvati e ricompaiono quando torni
  alla v12.

## 7. Per chi sviluppa

Regole generali in [`AGGIORNAMENTI.md`](AGGIORNAMENTI.md); prova a secco in [`CHECKLIST-COLLAUDO.md`](CHECKLIST-COLLAUDO.md) §8.
Il blocco `@@STREAM-C@@` di `tests/suite.js` installa la **vera v10.0** (commit `34ff0d1`), ci mette dei dati, copia
sopra la v12 nella stessa cartella e controlla che faldoni, colori e date restino e che le funzioni nuove partano vuote
ma funzionanti. `@@STREAM-A@@` aggiorna un database server v11 (schema 2 → 3), `@@STREAM-Q@@` le migrazioni degli
stati (schema locale 9), `@@STREAM-V12@@` i collegamenti fra stati, archivi, ricerca e registro accessi.
