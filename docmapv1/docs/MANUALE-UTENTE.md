# DocMap 2026 — manuale d'uso (passo passo)

> Per chi usa DocMap ogni giorno nello studio. Versione **26.11.1**. Ogni capitolo è una cosa da fare, in passi brevi.
> I nomi tra **grassetto** sono scritti esattamente come sui pulsanti (interfaccia in italiano).
> Descrizione completa di ogni funzione: [`RIFERIMENTO-FUNZIONI.md`](RIFERIMENTO-FUNZIONI.md) · parole: [`GLOSSARIO.md`](GLOSSARIO.md) ·
> prove da fare a mano: [`CHECKLIST-COLLAUDO.md`](CHECKLIST-COLLAUDO.md).

Dove si trovano le cose:

- In alto ci sono tre schede: **Archivio**, **Stampa Etichette**, **Informazioni**.
- Il menu **⚙ Funzioni avanzate** (in alto a destra) ha due gruppi:
  - *Dati*: **Importa**, **Esporta e Salva**, **Database**, **Registro attività**, **Sincronizzazione**;
  - *Strumenti*: **Genera con AI**, **Impostazioni**.
- Il pulsante **?** (o il tasto F1) apre la guida con le 18 azioni guidate. Ogni azione guidata ti accompagna sullo schermo vero.

---

## 1. Prima installazione su un PC

1. Estrai lo zip di DocMap in una cartella fissa, per esempio `C:\DocMap\`. Non aprire i file da dentro lo zip.
2. Apri la cartella `docmapv1` e fai doppio clic su `index.html`.
3. Usa **Chrome** o **Edge**, sempre lo stesso browser e lo stesso profilo. Nel browser conviene un segnalibro alla pagina.
4. Alla schermata "Benvenuto in DocMap 2026" scegli da dove iniziare, oppure **Esploro da solo**.
5. Apri ⚙ Funzioni avanzate › **Impostazioni**:
   - in **Impostazioni Studio** scrivi il nome dello studio;
   - in **Il tuo nome (operatore)** scrivi il tuo nome. Compare nel Registro attività accanto a ogni operazione;
   - controlla il **Modello URL destinazione finale**. Il predefinito è `https://docmap.pr-it.it/studio-de/q/{short_code}`.
6. Apri ⚙ Funzioni avanzate › **Sincronizzazione**. In **Nome del dispositivo** scrivi un nome per questo PC (es. "PC segreteria").
7. I 5 faldoni di esempio (tag `demo`) servono per provare. Quando non servono più, in **Archivio** premi **Nascondi esempi** oppure **Elimina esempi**. **Prima della prima sincronizzazione con il server premi Elimina esempi**: i faldoni di esempio non eliminati (anche se nascosti) vengono caricati sul server come gli altri e arrivano su tutti i dispositivi.
8. Fai subito un primo **Salva backup** (pulsante in alto).

> I dati restano **dentro il browser** di questo PC. Un altro browser o un altro profilo di Chrome vede un archivio
> diverso (vuoto). Se cancelli i dati di navigazione perdi la copia locale: per questo servono i backup (§11) o il
> server (§7).

## 2. Importare l'elenco clienti (un solo file crea clienti e faldoni)

1. Apri **Informazioni** › **Clienti** › **Importa elenco clienti**. Va bene anche trascinare il file nella finestra.
2. Scegli il file dello studio: un CSV con colonne `TIPO;Ditta;Ragione_soc;Indirizzo;Codice_com;Cap;Localita;Provincia;ETS_ENC`, oppure un Excel `.xlsx`.
3. DocMap riconosce l'elenco clienti e mostra **Anteprima elenco clienti**. Abbinamento delle colonne:
   - Ditta → Codice Multi;
   - Ragione_soc → Ragione sociale;
   - Localita (Provincia) → Luogo;
   - ETS_ENC (o TIPO) → Categoria.
4. Controlla gli avvisi:
   - le righe senza ragione sociale e quelle ripetute vengono saltate;
   - "Senza codice Ditta/Multi" è solo un avviso: la riga si importa lo stesso.
5. Lascia spuntato **Crea anche un faldone per ogni cliente che non ne ha ancora uno (n)** se vuoi anche i faldoni. Ognuno prende Multi, ragione sociale, luogo, categoria e colore, con il contenuto "Archivio 1".
6. Premi **Importa {n} clienti**. Puoi annullare subito dopo con **Annulla**.
7. Reimportare lo stesso file più avanti **aggiorna** i clienti (stesso Codice Multi o stesso nome) senza duplicarli.

> Non mettere mai l'elenco clienti vero in cartelle condivise o allegati: resta sul PC dello studio.

## 3. Creare e modificare i faldoni

### 3.1 Nuovo faldone
1. **Archivio** › **Nuovo Faldone**.
2. Scrivi il cliente. I suggerimenti propongono quelli già presenti. Scegliendo un cliente si compilano Codice Multi, luogo e categoria, e viene proposto il codice parlante successivo (es. BL4).
3. Scrivi titolo, anno e contenuti. Con **Una riga per voce** puoi incollare un elenco, per esempio `2025: Fatture`.
4. Posizione: hai due modi.
   - **Posizione rapida**: scrivi per esempio `A1-β-SX` (stanza, armadio, ripiano, settore). Gli stessi campi uno per uno sono in **Dettagli posizione**.
   - **Ubicazione (scatola)**: scegli una scatola delle Ubicazioni (§6).
5. Premi **Salva** (o Ctrl+S). Se il codice parlante esiste già, DocMap lo segnala e propone il primo libero.

### 3.2 Modificare un faldone
1. In **Archivio** cerca il faldone: codice, cliente, Multi, tag o note.
2. Premi l'icona **Modifica** della riga, cambia i campi e premi **Salva**.
3. Ogni modifica finisce nel **Registro attività** con i campi cambiati (prima → dopo).

### 3.3 Colori dei dorsi
1. Il colore di serie è automatico: ogni categoria ha una famiglia di colori e ogni cliente una sua sfumatura.
2. Per scegliere un colore a mano: nella scheda del faldone clicca un colore. Il colore viene bloccato (🔒) e non cambia più da solo; **Automatico** lo sblocca.
3. **Informazioni** › **Categorie**: clicca il colore di una categoria. Lì scegli lo spettro e puoi aggiungere fino a 10 regole per parola chiave (es. "proloco").
4. ⚙ › **Impostazioni** › **Colori dei dorsi**:
   - scegli la modalità: **Per cliente**, **Per categoria** o **Manuale**;
   - **Ricolora tutti i faldoni (non bloccati)** applica la modalità a tutto l'archivio. Si può annullare.

### 3.4 Modifica massiva (tanti faldoni insieme)
1. **Archivio**. Se serve, filtra prima (ricerca, categoria, ubicazione).
2. Premi **Modifica massiva**: si apre una griglia tipo Excel.
3. Per cambiare una cella: spostati con frecce, Tab e Invio, poi scrivi. Esc annulla la cella.
4. Per cambiare più righe insieme:
   - spuntale (Spazio, oppure Maiusc+clic);
   - scegli l'operazione: **Imposta categoria**, **Aggiungi tag**, **Rimuovi tag**, **Imposta stato**, **Imposta colore** o **Imposta posizione (prefisso)**;
   - premi **Applica a {n} selezionati**. Ctrl+D copia la cella attiva in giù.
5. Le celle cambiate restano gialle finché non premi **Salva modifiche (n)** (o Ctrl+S). Codici doppi o vuoti bloccano il salvataggio.
6. **Annulla tutto** scarta le modifiche in sospeso. **Torna all'archivio** chiude la griglia.

## 4. Stampare le etichette e il PDF

### 4.1 Stampa normale su MRINK143
1. In **Archivio** spunta i faldoni da stampare (casella "Includi in stampa") oppure usa **Seleziona tutti (filtrati)**. Poi premi **Vai alla stampa**.
2. In **Stampa Etichette**:
   - sezione **1 · Foglio e preset**: il foglio predefinito è MRINK143. Sono 4 etichette fisiche 105×148 per ogni A4, con 2 etichette per faldone da separare con la taglierina, quindi 8 per foglio;
   - sezione **3 · Contenuto etichette**: il modello consigliato è "Etichetta informazioni";
   - in **Campi da stampare** accendi solo quello che vuoi vedere.
3. Premi **Stampa Etichette**. Nella finestra del browser imposta:
   - **Scala 100%** (o "Dimensioni effettive"), mai "Adatta";
   - **Margini: nessuno**;
   - intestazioni e piè di pagina disattivati.
4. A stampa finita DocMap chiede **Aggiornare la mappa del foglio parziale?**:
   - **Sì, aggiorna mappa** se il foglio è uscito bene;
   - **No, lascia così** se la stampa è andata male.

### 4.2 Scarica PDF (stampare da un altro PC)
1. In **Stampa Etichette** premi **Scarica PDF**: esce un file come `DocMap_etichette_mrink143_AAAA-MM-GG.pdf`.
2. Stampalo da qualunque PC con **Scala 100% / Dimensioni effettive**. Non usare mai "Adatta alla pagina".
3. Dopo il download DocMap chiede se segnare come usate le caselle dell'ultimo foglio (**Segnare le caselle come usate?**).
4. Nel riquadro **Pagine** puoi scegliere quali fogli stampare (es. `1-3,5`) e l'ordine inverso.
5. **PDF per tipografia (CMYK, nero solo K)** serve solo per la tipografia: lascialo spento in ufficio.

### 4.3 Fogli già usati in parte
1. Apri **Opzioni avanzate** › **5 · Recupero fogli parziali**.
2. Clicca le caselle già staccate: diventano **Già usata**. La stampa parte dalla prima disponibile.
3. **Segna tutte disponibili** azzera la mappa quando metti un foglio nuovo.
4. Su MRINK143 puoi segnare anche una sola metà di un'etichetta fisica.

### 4.4 Calibrazione (se le etichette escono spostate)
1. Premi **Stampa Prova di Calibrazione (Quasi Bianca)** e stampala su carta normale, con le impostazioni del §4.1.
2. Sovrapponi il foglio al foglio di etichette in controluce. Misura di quanti millimetri sono spostate le linee, in orizzontale e in verticale.
3. In **Opzioni avanzate** › **2 · Geometria (mm) e calibrazione** correggi **Offset calibrazione X** e **Offset calibrazione Y** a passi di 0,5 mm.
4. Ristampa la prova finché le linee coincidono. Gli offset valgono anche per il PDF.
5. Testo capovolto su MRINK143: apri **Opzioni avanzate** › **Verso di lettura e linea di taglio** e scegli l'altra rotazione, **Ruota a sinistra (−90°)** o **Ruota a destra (+90°)**.
6. Bordini bianchi diversi tra le etichette: in **Bordi uguali su tutte le etichette** lascia acceso "Compensa il bordo non stampabile e il taglio a mano".

### 4.5 Prima prova su una stampante vera
La checklist completa (allineamento, rotazione, bordi, PDF in Acrobat) è in [`CHECKLIST-COLLAUDO.md`](CHECKLIST-COLLAUDO.md) §1–§2.
In breve:
1. Fai prima una prova su carta normale.
2. Nelle preferenze della stampante scegli tipo carta **Etichette** e qualità **Alta**.
3. Controlla il riquadro "Controllo qualità di stampa": QR di almeno 15 mm, codice di almeno 6 mm.
4. Solo alla fine stampa sul foglio di etichette.

## 5. Manifest per qr7.it

Il QR stampato contiene `https://qr7.it/dm26XXXXXXXX`. Il sistema qr7.it deve sapere dove mandare ogni codice: glielo dice il manifest.

1. ⚙ › **Esporta e Salva** › **Scarica manifest_qr7_dm26.csv**. È un file con:
   - intestazione `short_code;short_url;final_destination;tags;`;
   - ogni riga che termina con `;`;
   - una riga per faldone e una per ogni ubicazione (tag `docmap26,location,<codice>`).
2. Se hai già un `manifest.csv` con altri codici (es. 1TSE0G):
   - premi **Carica manifest.csv e unisci**. Le righe che non sono dm26 restano; le dm26 vengono aggiornate o aggiunte;
   - con **Rimuovi le righe dm26 non più presenti in DocMap** spariscono quelle dei faldoni eliminati.
3. Carica il file su qr7.it.
4. Rifallo ogni volta che crei nuovi faldoni o scatole, o cambi la destinazione.

## 6. Ubicazioni, etichette delle scatole e modalità associazione

### 6.1 Creare la struttura
1. **Informazioni** › **Ubicazioni**.
2. **Livelli…**: controlla nomi e prefissi. I predefiniti sono Magazzino/MAG, Armadio/A, Scansia/S, Scaffale/R e Scatola/B, da 1 a 8 livelli.
3. Archivio vuoto: premi **Crea la struttura**. Altrimenti **Crea in serie…**.
4. Indica quanti elementi creare per ogni livello, per esempio 1 magazzino, 2 armadi, 1 scansia, 4 scaffali e 20 scatole. Premi **Crea**.
5. I codici si formano da soli (es. `MAG1-A1-S1-R1-B01`). Su ogni nodo puoi:
   - rinominare;
   - **Sposta…**;
   - **Elimina**: i faldoni restano in archivio, senza ubicazione.

### 6.2 Stampare i QR delle scatole
1. Spunta le scatole, oppure premi **Seleziona ultimo livello**.
2. Premi **Stampa etichette**. Si apre **Stampa Etichette** con le etichette ubicazione: codice grande, percorso e QR.
3. Stampa o **Scarica PDF** come al §4.
4. Premi **Torna alle etichette dei faldoni** per tornare ai faldoni.
5. Riesporta il manifest (§5): contiene anche le scatole.

### 6.3 Associare i faldoni alle scatole dal PC (lettore USB o webcam)
1. **Informazioni** › **Ubicazioni** › **Modalità associazione**. In alternativa premi **Avvia associazione qui** su una scatola.
2. Con un **lettore QR USB/Bluetooth** che scrive come una tastiera: clicca nel campo **Lettore QR / codice + Invio** e scansiona.
3. Con la **webcam**: premi **Webcam** e inquadra i QR.
4. Scansiona prima il QR della scatola, che diventa l'"Ubicazione attiva". Poi scansiona i QR dei faldoni che contiene. Il QR della scatola successiva cambia scatola.
5. Ogni passaggio finisce nel Registro attività. **Annulla** rimette il faldone dov'era.
6. Premi **Termina** quando hai finito.

### 6.4 Associare dal telefono (versione online)
1. Con la fotocamera del telefono inquadra il QR della scatola: si apre la pagina dell'ubicazione.
2. Premi **Avvia associazione qui**.
3. Ora inquadra i QR dei faldoni uno dopo l'altro: ogni faldone finisce in quella scatola. Il QR di un'altra scatola cambia scatola.
4. In alternativa premi **Scansiona in sequenza** e poi **Accendi fotocamera**: scansioni tutto senza uscire dalla pagina.
5. Premi **Stop** per finire. L'associazione si chiude da sola dopo 30 minuti senza scansioni.
6. Serve un codice di accesso che **può modificare** (ruolo editor o admin).

### 6.5 Ubicazione di molti faldoni dall'archivio
1. In **Archivio** spunta i faldoni.
2. Premi **Ubicazione…**, scegli la scatola e premi **Assegna**.
3. Il filtro **Tutte le ubicazioni** / **Senza ubicazione** mostra cosa manca.

## 7. Server online su SiteGround (una volta sola, chi gestisce il sito)

1. **Prepara i file sul PC**: `python3 docmapv1/tools/build_deploy.py`. Crea la cartella `deploy/studio-de/`.
2. In SiteGround apri Site Tools › Sicurezza › **Directory protette** e proteggi `public_html/studio-de/` con utente e password.
3. Carica **il contenuto** di `deploy/studio-de/` in `public_html/studio-de/`, compresi i file `.htaccess`.
4. Apri **una sola volta** `https://docmap.pr-it.it/studio-de/server-php/setup.php` e compila:
   - "Cartella del database": meglio fuori da `public_html`, per esempio `/home/customer/www/docmap.pr-it.it/docmap-data`;
   - "Persone che useranno DocMap": una per riga, `nome,ruolo`, con ruolo `admin`, `editor` o `viewer`;
   - lascia spuntato "Consenti la sincronizzazione dal programma sul PC";
   - premi **Genera chiave e token**.
5. **Copia subito i codici di accesso** (token) mostrati: si vedono una volta sola. Scarica anche una copia di `config.php` e tienila al sicuro, fuori dal sito: senza quella chiave il database non si legge. `setup.php` si disattiva da solo.
6. Prova:
   - `…/server-php/api.php?r=ping` deve rispondere `"ok":true` e `"schema":2`;
   - `…/server-php/config.php` deve dare un errore 403 o 404.
7. **Ruoli**:
   - `viewer` (sola lettura);
   - `editor` (può modificare, vede solo le proprie sincronizzazioni);
   - `admin` (tutto, compresi i codici di accesso e il ripristino dal registro del server).
8. **Primo caricamento dal PC principale**:
   - ⚙ › **Sincronizzazione** › **Server online**: in **Indirizzo del server** scrivi `https://docmap.pr-it.it/studio-de/server-php/api.php`; in **Codice di accesso (token)** il token admin;
   - premi **Salva**, poi **Prova connessione**, poi **Sincronizza con il server**;
   - prima di tutto, se non l'hai già fatto, in **Archivio** premi **Elimina esempi** (§1.7): altrimenti i faldoni di esempio finiscono sul server;
   - il server è vuoto: conferma **Carica il mio archivio sul server (prima volta)**.
9. **Nuovi codici e revoche** (admin):
   - ⚙ › **Sincronizzazione** › **Server online** › **Codici di accesso**;
   - **Nuovo codice** crea un codice. Copialo subito: non viene più mostrato;
   - **Revoca** disattiva un codice: il telefono o la persona non entra più.
10. Se la cartella è protetta con password e dal PC la sincronizzazione viene bloccata:
    - compila **Protezione con password della cartella (facoltativa)** nella scheda Server online;
    - attiva le tre righe commentate per `OPTIONS` in `server-php/.htaccess`.

Dettagli tecnici: [`DEPLOY-WEB.md`](DEPLOY-WEB.md) e il `README-DEPLOY.md` dentro il deploy.

## 8. Telefoni e altri computer (primo accesso)

1. Sul telefono apri `https://docmap.pr-it.it/studio-de/`, oppure inquadra il QR di un faldone. Entra con la password della cartella, se c'è.
2. Compare **Primo accesso su questo telefono** se hai aperto un QR, oppure **Primo accesso su questo dispositivo** se hai aperto l'indirizzo dell'app. Inserisci:
   - un nome utente e un PIN di questo dispositivo;
   - il **codice di accesso** ricevuto dall'amministratore.
3. Da quel momento basta il PIN. Lo stato si vede in alto:
   - "Online · sincronizzato";
   - "In attesa (N)": modifiche da inviare;
   - "Offline · in attesa (N)";
   - "Online · sola lettura" con un codice viewer;
   - "Accesso negato": codice revocato.
4. Dare un nome al telefono: nella pagina del telefono, sezione **Le mie sincronizzazioni**, campo "Nome di questo telefono".
5. Per modificare un faldone dal telefono:
   - inquadra il QR del faldone e tocca **Modifica**;
   - puoi cambiare stato, stato dei documenti, posizione, note e tag (l'ubicazione si cambia con la modalità associazione, §6.4);
   - se intanto qualcuno l'ha cambiato altrove, il telefono avvisa: **Ricarica (perdo le mie modifiche)** oppure **Salva comunque le mie modifiche**.

## 9. Routine quotidiana con più PC e telefoni

**Telefoni e web app** si sincronizzano da soli: inviano ogni modifica subito e controllano il server ogni minuto, quando tornano in primo piano e quando torna la rete.

**PC (programma aperto da `index.html`)** si sincronizzano solo quando lo chiedi.

1. **Al mattino, prima di lavorare**: ⚙ › **Sincronizzazione** › **Sincronizza con il server**. Ricevi le modifiche fatte dagli altri.
2. **Durante il giorno**: sincronizza dopo ogni blocco di lavoro importante, per esempio dopo un import o una modifica massiva, e prima di stampare etichette di faldoni toccati da altri.
3. **Se lo stesso faldone è cambiato su due PC**, compare la revisione:
   - per ogni conflitto scegli **Tieni locale** o **Tieni importato**;
   - **Applica a tutti: il più recente** vince la modifica più recente nel tempo.
4. **A fine giornata**: **Sincronizza con il server**, poi **Salva backup** (§11).
5. **Orologi giusti**: l'ordine delle modifiche dipende dall'ora di ogni dispositivo. Se compare l'avviso che l'orologio differisce dal server, sistema data e ora (§13).
6. **Senza server** (o se il server non risponde), usa i pacchetti:
   - sul PC che manda: **Copia export per web app** (o **Esporta per il client locale** dalla web app), con **Tutto l'archivio** la prima volta e poi **Solo modifiche dall'ultima sincronizzazione**;
   - spunta **Cifra con passphrase (consigliato)** e comunica la passphrase a voce;
   - sull'altro lato: **Importa dati da client locale** / **Importa dati dalla web app**, scegli il file e premi **Analizza**.

## 10. Registro sincronizzazioni e contestazioni

Serve a rispondere a domande come "chi ha cambiato il faldone BL4 e quando?" o "perché la mia modifica non c'è?".

1. ⚙ › **Sincronizzazione** › riquadro **Registro sincronizzazioni** in fondo alla pagina.
2. Scegli la fonte:
   - **Questo dispositivo**;
   - **Server (tutti)**, solo per l'admin;
   - **Server (le mie)**, per l'editor.
3. Filtra per **Dal**, **Al**, **Utente**, **Dispositivo** e **Codice faldone**.
4. Apri la voce giusta. Vedi chi, quando, da quale dispositivo e con quale versione del programma. Per ogni faldone vedi cosa è successo (nuovo, aggiornato, più vecchio e ignorato, conflitto, rifiutato) e le **Differenze** campo per campo.
5. **Procedura per una contestazione**:
   1. annota il codice del faldone e il giorno;
   2. filtra il registro per **Codice faldone** e date, e trova la voce in cui il faldone è cambiato;
   3. guarda le **Differenze** (Prima / Dopo, oppure "Tentata (rifiutata)") e l'impronta SHA-256 delle versioni;
   4. **Esporta CSV** o **Esporta JSON** per conservare la prova;
   5. per tornare a una versione premi **Ripristina questa versione**. È una nuova modifica con l'ora di adesso: arriva agli altri dispositivi alla prossima sincronizzazione. Sul server lo può fare solo l'admin;
   6. guarda anche il **Registro attività** (⚙ › **Registro attività**): mostra le operazioni fatte nel programma, con il nome dell'operatore.
6. Sul telefono: **Le mie sincronizzazioni** elenca i salvataggi di quel telefono con l'esito del server.

Differenza tra i due registri: il **Registro attività** dice *cosa è stato fatto* (creato, modificato, stampato…). Il
**Registro sincronizzazioni** dice *cosa è passato tra i dispositivi* e come sono stati decisi i conflitti.

## 11. Backup: cosa, quando, dove

| Cosa | Come | Quando (consiglio) | Dove tenerlo |
|---|---|---|---|
| Backup JSON (faldoni, clienti, ubicazioni, impostazioni, registro attività, registro sincronizzazioni) | pulsante **Salva backup** in alto, oppure ⚙ › **Esporta e Salva** › **Scarica docmap_workspace.json** | ogni giorno a fine lavoro e prima di import, modifica massiva o aggiornamento | cartella di rete o chiavetta, **fuori** dalla cartella di DocMap; tieni almeno le ultime 30 copie |
| Database completo con le **foto** | ⚙ › **Database** › **Scarica docmap.sqlite** (oppure **Collega un file .sqlite sul PC** per il salvataggio automatico) | ogni settimana e prima di ogni aggiornamento | come sopra |
| CSV completo (per Excel) | ⚙ › **Esporta e Salva** › **Scarica docmap_full_backup.csv** | quando serve un elenco leggibile | dove serve |
| Server online | da SiteGround (Gestione file o FTP) scarica la cartella dati (`docmap.sqlite`, `docmap.sqlite-wal`, `docmap.sqlite-shm`) e `config.php` | ogni settimana e prima di ogni aggiornamento del server | fuori dal sito, in un posto protetto: chi ha `config.php` ha la chiave |

Per ripristinare (prova a farlo almeno una volta: [`CHECKLIST-COLLAUDO.md`](CHECKLIST-COLLAUDO.md) §7):

- **Backup JSON**:
  1. ⚙ › **Impostazioni** › **Ripristina da backup JSON**;
  2. scegli il file;
  3. con l'opzione "Ripristina anche impostazioni, preset e mappa fogli" torna tutto;
  4. scegli **Sostituisci Tutto (Replace)** o **Aggiungi e Aggiorna (Merge/Upsert)**.
- **Database .sqlite**: ⚙ › **Database** › **Apri file .sqlite** › **Apri e sostituisci**.
- **Annullare un'operazione appena fatta**: **Annulla** (compare per alcuni secondi). Per l'ultimo stato prima di un ripristino: **Ripristina snapshot precedente** in Impostazioni.

## 12. Aggiornare DocMap a una versione nuova

Segui sempre la guida della versione (`docs/AGGIORNAMENTO-vX-vY.md`) e le regole generali in [`AGGIORNAMENTI.md`](AGGIORNAMENTI.md). In breve:

1. **Backup**: con la versione vecchia fai **Sincronizza con il server**, **Salva backup** e **Scarica docmap.sqlite** su ogni PC. Annota il numero di faldoni e clienti. Scarica anche la copia dal server (§11).
2. **Prima il server, poi i PC, poi i telefoni.**
3. **Server**:
   - carica la nuova cartella `deploy/studio-de/` sopra la vecchia, senza cancellare `server-php/config.php` né la cartella dati;
   - non rieseguire `setup.php`;
   - prova `api.php?r=ping`.
4. **PC**:
   - chiudi DocMap e copia i nuovi file **sopra quelli vecchi, nella stessa cartella**, con lo stesso browser;
   - riapri `index.html`;
   - controlla la versione in ⚙ › **Impostazioni** e il numero di faldoni e clienti.
5. **Telefoni**: ricarica la pagina.
6. Se qualcosa non torna, non lavorare:
   - rimetti la cartella vecchia nello stesso posto;
   - se serve, ripristina il backup.

## 13. Problemi e domande frequenti

| Problema | Cosa fare |
|---|---|
| **Non vedo i miei dati** (archivio vuoto o vecchio) | Stai usando un altro browser, un altro profilo di Chrome o una finestra in incognito: i dati stanno nel browser dove li hai inseriti. Riapri con quel browser. Se hai cancellato i dati di navigazione, ripristina l'ultimo backup (§11) o fai **Sincronizza con il server**. Sul telefono ogni browser ha la sua copia: dopo il primo accesso i dati arrivano dal server. |
| Due cartelle di DocMap sullo stesso PC mostrano gli stessi dati | È normale con Chrome ed Edge: tutte le copie aperte da `file://` nello stesso profilo condividono i dati. Per un archivio separato serve un altro profilo del browser. |
| **La fotocamera non parte** sul telefono | Apri la pagina dall'indirizzo `https://…` (non da un file). Quando il browser chiede il permesso premi Consenti. Se l'hai negato, riattivalo: su Chrome Android dal lucchetto accanto all'indirizzo, Autorizzazioni, Fotocamera; su iPhone in Impostazioni › Safari › Fotocamera. In alternativa usa la fotocamera del telefono per aprire i QR uno per uno. |
| **La webcam non parte** sul PC | Consenti la fotocamera dall'icona nella barra dell'indirizzo. Se non va, usa un lettore QR USB nel campo **Lettore QR / codice + Invio**. |
| Il lettore USB non scrive nel campo | Clicca prima nel campo. Il lettore deve essere impostato come tastiera italiana con "Invio" dopo il codice. Prova a scansionare in un blocco note: deve uscire `https://qr7.it/dm26…` o `dm26…`. |
| **"Accesso negato"** o errore 401 | Il codice di accesso è sbagliato o è stato revocato. Chiedine uno nuovo all'amministratore (**Nuovo codice**) e inseriscilo in **Codice di accesso (token)** (PC) o al primo accesso (telefono). |
| **"Troppi codici errati da questa rete"** (429) | Dopo 5 codici sbagliati dalla stessa rete il server blocca per 60 secondi, poi per un tempo doppio a ogni nuovo errore, fino a 15 minuti. Il blocco vale anche per i codici giusti. Aspetta il tempo indicato e inserisci il codice corretto. |
| **Avviso "l'orologio di questo dispositivo differisce di N minuti dal server"** | L'ordine delle modifiche dipende dall'ora: correggi data, ora e fuso orario del PC o del telefono (meglio con l'impostazione automatica), poi sincronizza di nuovo. L'avviso compare oltre i 2 minuti di differenza. |
| **Conflitti** in revisione | Lo stesso faldone è cambiato su due dispositivi dopo l'ultima sincronizzazione. Guarda i campi diversi e scegli **Tieni locale** o **Tieni importato**, oppure **Applica a tutti: il più recente**. Le web app decidono da sole: vince il più recente; a parità vince il server. Tutto finisce nel Registro sincronizzazioni (§10). |
| La mia modifica dal telefono è stata "rifiutata: cambiato altrove" | Qualcuno l'ha cambiato mentre lo guardavi. Scegli **Ricarica (perdo le mie modifiche)** e rifai la modifica, oppure **Salva comunque le mie modifiche**: vengono scritti solo i campi del telefono, il resto del faldone resta com'è sul server. |
| Un faldone eliminato è ricomparso | Su un altro dispositivo era stato modificato **dopo** l'eliminazione: vince la modifica più recente. Il Registro sincronizzazioni lo mostra. |
| Le etichette escono spostate o rimpicciolite | Scala 100%, margini nessuno, poi la calibrazione (§4.4). |
| "Il motore SQLite non si è avviato" | Apri `index.html` dalla cartella estratta, non da dentro lo zip. |
| **I faldoni di esempio** (tag `demo`) sono sul server e su tutti i telefoni | Non erano stati eliminati prima della prima sincronizzazione. Elimina gli esempi da un PC (**Elimina esempi** in Archivio) e sincronizza: l'eliminazione arriva a tutti. |
| Che versione ho? Il server risponde? | ⚙ › Impostazioni › Dati e sicurezza › **Informazioni su DocMap**: versione, schema del database locale e del server, nome del dispositivo, **Verifica server**. **Copia dati per l'assistenza** copia questi dati (senza il codice di accesso) da incollare in un messaggio. |
| Ho l'indirizzo di un QR (`https://qr7.it/dm26…` o `…/q/dm26…`) e voglio il faldone | Incollalo o scansionalo nella ricerca dell'**Archivio**: trova il suo faldone. |

Altri problemi di stampa e import: [`RIFERIMENTO-FUNZIONI.md`](RIFERIMENTO-FUNZIONI.md) › "Problemi comuni".
