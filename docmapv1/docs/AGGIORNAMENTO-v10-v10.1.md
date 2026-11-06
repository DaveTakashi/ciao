# Aggiornare DocMap dalla v10 alla v10.1 senza perdere i dati

La v10.1 **non cambia il modo in cui i dati sono salvati** sul PC: stesse chiavi del browser (`docmap_v26_state`,
IndexedDB), nessuna modifica di schema. Quindi i faldoni, i clienti, le foto, il registro e le impostazioni della v10
si riaprono così come sono. La procedura serve a esserne sicuri e ad avere sempre una via di ritorno.

## 1. Prima di tutto: il backup (sul PC con la v10)

1. Apri DocMap v10 come sempre (doppio clic su `index.html`).
2. Premi **Salva backup** (Backup rapido, file JSON) e conservalo in una cartella sicura, fuori da quella di DocMap.
3. Consigliato anche: ⚙ Funzioni avanzate › Database › **File .sqlite** › scarica il database completo (contiene anche
   le foto e le sessioni).
4. Annota quanti faldoni hai (in **Archivio** il numero dei faldoni, oppure in **Informazioni**) e quanti clienti.
5. Fai una copia dell'intera cartella `docmapv1` attuale (es. `docmapv1-v10-vecchia`): servirà per tornare indietro.

## 2. Sostituire i file **nello stesso percorso**

1. Chiudi tutte le schede di DocMap nel browser.
2. Estrai la nuova versione e copia i file della nuova `docmapv1` **sopra quelli vecchi, nella stessa cartella**
   (stesso percorso sul disco, es. `C:\Studio\docmapv1\`). Accetta di sostituire i file.
3. Non cambiare cartella, nome della cartella o browser: il browser conserva i dati delle pagine `file://` e usando lo
   stesso percorso e lo stesso browser ritrovi tutto senza dover importare nulla.

## 3. Riaprire e controllare

1. Doppio clic su `index.html` (stesso browser di prima: Chrome o Edge).
2. In ⚙ Funzioni avanzate › **Impostazioni** (in fondo) la versione deve essere **26.10.1**.
3. Controlla che il **numero di faldoni** e di clienti sia quello annotato al punto 1.4. Apri un paio di faldoni e
   una foto.
4. Se qualcosa non torna: **non lavorare**, vai al §6 (tornare indietro) oppure ripristina il backup JSON
   (⚙ Funzioni avanzate › Impostazioni › **Ripristina da backup JSON**).

## 4. Configurare il server (una volta)

Se il database online non è ancora installato sul sito, segui prima `DEPLOY-WEB.md` §0 (o il `README-DEPLOY.md` del
deploy): protezione della cartella su SiteGround, caricamento, `server-php/setup.php`, codici di accesso.

Poi sul PC: ⚙ Funzioni avanzate › **Sincronizzazione** › riquadro **Server online**:

- **Indirizzo**: quello dell'app, es. `https://docmap.pr-it.it/studio-de/` (DocMap aggiunge `server-php/api.php`).
- **Codice di accesso**: il token **admin** creato da `setup.php`.
- Se la cartella è protetta con password: utente e password della protezione.
- **Salva** → **Prova connessione** (deve dire che il server risponde e chi sei).

## 5. Prima sincronizzazione

1. Premi **Sincronizza con il server**.
2. Con il server **vuoto** DocMap mostra la finestra **"Carica il mio archivio sul server (prima volta)"** con quanti
   faldoni, clienti, eliminazioni, righe di registro e impostazioni invierà. Controlla i numeri e conferma.
   Tutto viene caricato con le sue date originali; sul PC non cambia nulla.
3. Se il server **ha già dei dati** (per esempio caricati da un altro PC) non c'è caricamento in blocco: vale la
   fusione normale (vince la modifica più recente di ogni faldone; se lo stesso faldone è cambiato da entrambe le
   parti scegli tu nella revisione).
4. Apri l'app da un telefono con un codice *editor*: deve mostrare lo stesso numero di faldoni.
5. Le foto restano solo sul PC: continua a fare i backup `.sqlite`.

## 6. Tornare indietro (rollback)

- **Sul PC**: chiudi DocMap, rimetti i file della copia `docmapv1-v10-vecchia` **nella stessa cartella** e riapri
  `index.html`. Poiché la v10.1 non ha cambiato il formato dei dati, la v10 li riapre (ignora semplicemente le
  informazioni sul server). Se mancano dati, ripristina il backup JSON del §1.
- **Sul server**: puoi lasciare `server-php/` dov'è (senza codice di accesso non si usa) oppure caricare il deploy
  v10 con `build_deploy.py --no-server`. Il database resta nella cartella dati: conservane una copia insieme a
  `config.php` (senza la chiave il database non si legge).
- Le modifiche fatte dai telefoni dopo l'aggiornamento stanno sul server: prima di tornare indietro fai un'ultima
  **Sincronizza con il server** dal PC, così le hai anche in locale.
