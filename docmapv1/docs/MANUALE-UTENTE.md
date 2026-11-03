# DocMap 2026 — manuale d'uso (passo passo)

> Per chi usa DocMap ogni giorno nello studio. Versione **26.12.4**. Ogni capitolo è una cosa da fare, in passi brevi.
> I nomi tra **grassetto** sono scritti esattamente come sui pulsanti (interfaccia in italiano).
> Descrizione completa di ogni funzione: [`RIFERIMENTO-FUNZIONI.md`](RIFERIMENTO-FUNZIONI.md) · parole: [`GLOSSARIO.md`](GLOSSARIO.md) ·
> prove da fare a mano: [`CHECKLIST-COLLAUDO.md`](CHECKLIST-COLLAUDO.md).

Dove si trovano le cose:

- In alto ci sono tre schede: **Archivio**, **Stampa Etichette**, **Informazioni**.
- Il menu **⚙ Funzioni avanzate** (in alto a destra) ha due gruppi:
  - *Dati*: **Importa**, **Esporta e Salva**, **Database**, **Registro attività**, **Sincronizzazione**;
  - *Strumenti*: **Genera con AI**, **Impostazioni**.
- Il pulsante **?** (o il tasto F1) apre la guida con le azioni guidate. Ogni azione guidata ti accompagna sullo schermo vero.

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

Scorciatoie (v12.4), nella scheda di un'ubicazione:
- **Stampa QR: questa e quelle dentro** stampa l'ubicazione e tutte quelle che contiene (armadio, scaffali, scatole);
- **Stampa tutti i QR** (in alto, sopra l'albero) stampa le etichette di tutte le ubicazioni;
- **Striscia: ubicazione + faldoni** apre l'etichettatrice con la scatola e subito dopo i suoi faldoni (§19).

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

### 6.6 Più archivi (v12)
Lo stesso studio può tenere **archivi separati**: per esempio l'archivio corrente, lo storico, un Comune, un secondo
magazzino. Faldoni, ubicazioni, stampa ed esportazioni restano divisi.
1. **Informazioni** › **Archivi** › **Nuovo archivio**: nome, codice breve (es. `ST`) e colore. Premi **Avanti**: parte
   **Configura archivio** (§6.7).
2. I dati di prima stanno tutti in **Archivio principale** (puoi rinominarlo con la matita).
3. Con due o più archivi compare in alto il **selettore**: scegli un archivio oppure **Tutti gli archivi**. Archivio,
   coda di stampa, **Ubicazioni** ed **Esporta e Salva** mostrano solo l'archivio scelto. I faldoni nuovi e le righe
   importate senza archivio finiscono nell'archivio scelto.
4. Spostare faldoni: in **Archivio** spuntali e premi **Archivio…**. Mettere un faldone in una scatola di un altro
   archivio lo sposta anche di archivio.
5. **Unisci in…** sposta tutti i faldoni e le ubicazioni di un archivio in un altro e lo elimina. Un archivio vuoto si
   elimina con il cestino. **Annulla** rimette tutto com'era.
6. CSV ed Excel: la colonna `archive_id` (o `archivio`) accetta il codice (`ST`), il nome o l'id; un nome nuovo crea
   l'archivio. **Esporta e Salva** › **Archivio da esportare** limita manifest, CSV completo e registro a un archivio
   (il backup JSON contiene sempre tutto).

### 6.7 Configura archivio (procedura guidata)
1. **Informazioni** › **Archivi** › **Configura archivio** sulla scheda dell'archivio (oppure il pulsante in
   **Ubicazioni**).
2. Scegli il **modello** più vicino: **Studio** (Stanza › Armadio › Ripiano › Scatola), **Magazzino** (Magazzino ›
   Corsia › Scaffale › Ripiano › Scatola), **Ente / Comune** (Deposito › Scaffale › Palchetto › Faldone-scatola) o
   **Personalizzato** (parti dai livelli attuali).
3. Per ogni livello: nome, prefisso, **quanti** dentro ciascuno del livello sopra e se riceve un **QR** (davanti
   all'armadio, su ogni scansia, sulle scatole). In basso vedi subito quante ubicazioni ed etichette verranno create.
4. **Anteprima**: primo e ultimo codice (es. `DEP1-S1-P1-F01 … DEP1-S2-P2-F03`), il primo ramo e i totali.
5. **Crea l'archivio**, poi **Stampa N etichette QR**: si stampano solo i livelli con il QR. I livelli valgono per
   quell'archivio (**Ubicazioni** › **Livelli…** li cambia; nell'Archivio principale restano i livelli dello studio).

### 6.8 QR annidati: mappare il magazzino con lo scanner
Per dire "questa scansia sta dentro quell'armadio" senza digitare:
1. **Ubicazioni** › **Modalità associazione** e spunta **Annida ubicazioni**.
2. Scansiona il QR dell'armadio (diventa il **contenitore**), poi il QR di una scansia che non è ancora dentro.
3. DocMap chiede *"Sposta S2 dentro A1?"*: premi **Sì, sposta** oppure scansiona di nuovo la scansia. **No** apre
   soltanto la scansia. **Annulla spostamento** rimette tutto com'era.
4. I faldoni scansionati dopo vanno nell'ubicazione più precisa attiva. Senza la spunta la modalità associazione
   funziona come prima.

### 6.9 Tag NFC (Android) e iPhone
Un tag NFC adesivo può sostituire o affiancare il QR: contiene **lo stesso indirizzo** del QR.
1. **Scrivere il tag** (telefono Android con Chrome, utente che può modificare): apri la pagina del faldone o della
   scatola scansionando il QR, premi **Scrivi su tag NFC** e avvicina il tag al retro del telefono.
2. **Leggere**: su Android premi **Leggi tag NFC**; ogni tag avvicinato apre la sua scheda, e in **Scansiona in
   sequenza** finisce nella scatola attiva come un QR. Su **iPhone** non serve nulla: avvicinando il telefono al tag
   iOS apre l'indirizzo come quando inquadri un QR (Safari non può scrivere i tag).
3. Su PC e iPhone i pulsanti NFC non compaiono. Progetto per varchi RFID futuri: [RFID-NFC.md](RFID-NFC.md).
### 6.10 Stati: preso, reinserito, dato al Comune…
Ogni faldone, ogni singolo documento e ogni scatola può avere uno **stato**: Preso, Reinserito, Dato al cliente,
Restituito dal cliente, Fuori per pratica, Dato al Comune / ente, Restituito dal Comune / ente, Mancante / non trovato,
Ritrovato, Da verificare. DocMap ricorda chi lo ha fatto, quando e da dove.

**La regola per tutto lo studio**: quando prendi un faldone scansiona il QR e premi **Preso**; quando lo rimetti a posto
scansionalo e premi **Reinserito**. Chi lo scansiona dopo vede subito "Preso da Mario · da 2 giorni".

1. **Dal telefono** (già entrato con il tuo utente): inquadra il QR del faldone. In cima c'è il riquadro **Stato** con i
   pulsanti grandi: un tocco per **Preso** o **Reinserito**; per gli stati che chiedono chi lo ha, una data o una nota si
   apre un secondo passo con i dati già pronti → **Conferma**. Per un solo documento tocca il documento nell'elenco
   **Contenuto**. Hai 10 secondi per **Annulla**. Senza rete lo stato resta sul telefono e parte da solo appena torna la
   connessione.
2. **Scatola che esce**: inquadra il QR della scatola → **Applica a tutta la scatola** → per esempio **Dato al Comune /
   ente**, scrivi l'ente, la data di rientro e una nota → **Conferma**. Lo stato va alla scatola e a ogni faldone dentro.
   Dalla v12.1 vale anche per i contenitori: il QR di uno **scaffale** o di un **armadio** porta con sé i faldoni delle
   scatole che contiene (la scritta "compresi quelli nelle scatole interne" lo conferma); la Verifica rientro li aspetta tutti.
3. **Scatola che torna**: inquadra il QR della scatola → **Verifica rientro** → scansiona (fotocamera o codice scritto) il
   QR di ogni faldone. Vedi **Trovati**, **Mancano**, **In più**. Premi **Salva la verifica**: i trovati diventano
   restituiti, i mancanti (se lasci la spunta) **Mancante / non trovato**. Poi **Scarica il report (CSV)**.
4. **Dal PC**: nella scheda del faldone c'è il riquadro **Stato del faldone** (pulsanti, documenti, **Storico**). In
   **Archivio**: il filtro **Movimenti: tutti** (Fuori archivio, In ritardo, Mancanti…), il badge nella colonna Stato e
   il pulsante **Stato…** per i faldoni spuntati. In **Informazioni › Ubicazioni** il pulsante **Stato della scatola…**.
5. **Fuori archivio**: quando qualcosa è fuori, in Archivio compare la striscia "N fuori archivio" → **Apri "Fuori
   archivio"**: chi ha cosa, da quando, chi è in ritardo; un tocco per farlo rientrare; **Esporta fuori archivio (CSV)**
   ed **Esporta tutti i movimenti (CSV)**; l'elenco delle **Verifiche di rientro** con il loro CSV.
6. **Lettore USB**: in Fuori archivio premi **Modalità stato (lettore QR)**, scegli lo stato e scansiona un faldone dopo
   l'altro (il QR di una scatola vale per tutta la scatola).
7. **Personalizzare**: **Impostazioni › Stati rapidi**: **Aggiungi stato**, **Modifica** (nome, colore, cosa chiedere,
   pulsante rapido, attivo), frecce per l'ordine. Uno stato già usato non si elimina: si disattiva.

## 7. Server online su SiteGround (una volta sola, chi gestisce il sito)

1. **Prepara i file sul PC**: `python3 docmapv1/tools/build_deploy.py`. Crea la cartella `deploy/studio-de/`.
2. **Non** proteggere `public_html/studio-de/` con Site Tools › Sicurezza › **Directory protette**: il telefono chiederebbe utente e password a ogni QR. I dati sono già protetti dai codici di accesso, dal PIN e dalla cifratura. Se l'avevi messa, toglila dopo aver installato la v12.
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
   - un nome utente e un PIN di questo dispositivo (il pulsante 👁 accanto al campo mostra quello che scrivi; un altro tocco lo nasconde);
   - il **codice di accesso** ricevuto dall'amministratore. È **facoltativo** (v12.4): se non lo hai ancora lascia vuoto e
     aggiungilo dopo da Sincronizzazione › Server online › **Nuovo codice di accesso** (sul telefono compare da solo la
     schermata **Codice di accesso**). Se il codice è sbagliato, quello che hai scritto resta nei campi e puoi
     scegliere **Continua senza codice**.
3. Da quel momento basta il PIN; con **Ricordami su questo dispositivo** (già spuntato) i QR si aprono senza PIN (§15). Lo stato si vede in alto:
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
3. **Server** (guida passo passo: [`AGGIORNARE-IL-SERVER.md`](AGGIORNARE-IL-SERVER.md)):
   - carica il **contenuto** della nuova `deploy/studio-de/` **sopra** la vecchia, sovrascrivendo. **Non cancellare la
     cartella prima**: con lei sparirebbe `server-php/config.php`, la chiave del database;
   - non rieseguire `setup.php` (dalla v12.4 si rifiuta se trova un database già esistente);
   - il database del server si aggiorna da solo alla prima chiamata: non c'è nessun pulsante di migrazione da premere;
   - sul PC: Sincronizzazione › Server online › **Verifica dopo l'aggiornamento**. Dice se i file del server sono della
     versione giusta, se il database è aggiornato, se il codice di accesso va, e confronta i dati del server con quelli
     del PC; se non coincidono premi **Sincronizza ora**.
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

## 14. Cercare un faldone

Sul PC c'è **una sola casella di ricerca**, in cima all'**Archivio**. Scrivi come ti viene: maiuscole, accenti e un
errore di battitura non contano.

1. Scrivi una parte del nome del cliente, del codice, della città, di un tag o di un anno: `barbieri`, `BL2`,
   `castello 2024`. Devono esserci **tutte** le parole. Le parole trovate sono evidenziate in giallo nella tabella.
2. Hai sbagliato a scrivere? DocMap trova lo stesso il faldone e mostra **Forse cercavi: …**: tocca la parola giusta
   per correggere la ricerca.
3. Per restringere usa le **parole chiave** (compaiono come etichette sotto la casella; la ✕ di un'etichetta la toglie):

   | Scrivi | Trova |
   |---|---|
   | `tag:iva` · `-tag:2019` | con il tag iva · senza il tag 2019 |
   | `anno:2024` · `anno:2020..2022` · `anno:>2023` | quell'anno · un intervallo · dopo il 2023 |
   | `cat:aps` · `cliente:"rossi mario"` · `citta:perugia` | categoria · cliente · città |
   | `luogo:B04` · `colore:rosso` · `codice:bl2` · `multi:M-77001` | posizione · colore del dorso · codice · Codice Multi |
   | `stato:fuori` · `stato:storico` · `stato:cliente` | prelevati · storici · con documenti dal cliente |
   | `contenuto:bilancio` · `note:geometra` | dentro i contenuti · nelle note e nei contatti |
   | `-parola` · `"frase esatta"` | esclude una parola · cerca le parole in quell'ordine |

   Puoi anche incollare il link di un QR (`https://qr7.it/dm26…` o `…/q/dm26…`) o leggerlo con il lettore: compare
   subito quel faldone.
4. **Filtri**: apre i gruppi (tag, categoria, anno, ubicazione, colore, stato) con il numero di faldoni di ogni
   voce. Tocca le voci che ti servono: dentro un gruppo vale una qualsiasi, tra gruppi diversi valgono tutte.
5. **☆ Salva ricerca**: dai un nome (es. "IVA 2024 da archiviare"). Le ricerche salvate compaiono sotto la casella e
   arrivano agli altri PC con la sincronizzazione (impostazioni condivise). Le **ricerche recenti** sono nel pannello
   Filtri e restano su questo PC.
6. Nel pannello Filtri puoi togliere le note e i contatti dalla ricerca (**Cerca anche in note e contatti**).

Sul **telefono** (versione online): tocca la lente 🔍 in alto, oppure **Cerca un faldone** se non hai inquadrato un QR.

1. Scrivi o tocca il microfono 🎤 per dettare. Le scorciatoie sotto la casella (**Fuori archivio**, ricerche recenti,
   tag più usati) fanno la ricerca con un tocco.
2. I risultati sono schede grandi con codice, cliente e posizione; tocca una scheda per aprire il faldone.
   **Torna ai risultati** riporta alla ricerca.
3. Senza rete la ricerca funziona lo stesso sulla copia salvata (cifrata) nel telefono; compare "Senza rete".

L'azione guidata **Cerca con operatori, filtri e ricerche salvate** (pulsante **?**) mostra tutto questo sullo schermo vero.

**Sul telefono con più archivi** (v12.1): nella schermata **Cerca** c'è un pulsante per ogni archivio (es. *Storico*)
e ogni risultato porta la sigla del suo archivio; `stato:fuori` comprende anche i faldoni dati al cliente, al Comune o
presi con gli stati rapidi.

## 15. Accesso senza PIN sul telefono ("Ricordami su questo dispositivo")

1. Al primo accesso (e a ogni accesso con il PIN) sotto il PIN c'è **Ricordami su questo dispositivo**, già spuntato.
2. Con la spunta, i QR inquadrati dopo aprono il faldone **subito, senza PIN**.
3. Il PIN viene chiesto di nuovo:
   - dopo **30 giorni** senza usare DocMap su quel telefono (o il tempo scelto dall'amministratore);
   - se tocchi **Esci**;
   - se l'amministratore revoca il codice di accesso di quel telefono o cambia il tuo PIN.
4. Telefono condiviso o che resta in giro? Togli la spunta: il PIN servirà a ogni QR.
5. **Telefono perso o rubato**: avvisa subito l'amministratore, che revoca il codice di accesso di quel telefono
   (⚙ › **Sincronizzazione** › **Server online** › codici di accesso). Al primo contatto con il server il telefono
   dimentica l'accesso. Fino ad allora chi ha il telefono **sbloccato** può vedere i faldoni.
6. Amministratore: in ⚙ › **Impostazioni** › **Utenti e accesso** › **Accesso senza PIN su questo dispositivo** scegli
   dopo quanto tempo chiedere di nuovo il PIN (**Chiedi sempre il PIN**, **8 ore**, **30 giorni**, **Mai**) e
   **Dimentica questo dispositivo**. Per tutti i telefoni insieme: `remember_minutes` in `config.php` sul server
   (`0` = sempre il PIN, `480` = 8 ore, `43200` = 30 giorni, `-1` = mai); vince su quella del dispositivo.

## 16. Chi l'ha visto (registro accessi)

Serve a rispondere a "chi ha preso in mano il faldone BL4?" o "quando l'ha guardato il collega?".

1. **Sul PC**: apri la scheda di un faldone. In fondo c'è **Chi l'ha visto**: le aperture fatte su questo PC e, con il
   server online, **Carica dal server** mostra chi lo ha aperto da telefoni e altri PC (persona, quando, come: QR,
   Ricerca, Scheda, NFC).
2. **Sul telefono**: la scheda del faldone mostra **Visto di recente** (le ultime aperture).
3. **Tutti gli accessi**: ⚙ › **Sincronizzazione** › riquadro **Accessi**. Scegli **Questo PC**, **Server (tutti)**
   (amministratore, con l'IP) o **Server (le mie)** (editor) e filtra per date, persona, faldone e modo. **Altri**
   carica le righe più vecchie.
4. Le aperture dal PC sono anche nel **Registro attività** (gruppo **Visite**, una riga per faldone ogni 10 minuti).
5. Il server tiene il registro per 365 giorni (`access_keep_days` in `config.php`). È un dato personale: informa i
   collaboratori che le aperture dei faldoni vengono registrate.

## 17. Ruoli e permessi (chi può fare cosa)

Ogni persona o dispositivo ha un **codice di accesso** con uno di tre ruoli. Il ruolo lo decide il **server** a ogni
richiesta, non il telefono.

| Ruolo | Telefono e web app | Sul PC | Amministrazione |
|---|---|---|---|
| **viewer** (sola lettura) | vede faldoni, ubicazioni, stati, ricerca | — | — |
| **editor** | in più modifica faldoni, dà gli stati, associa alle scatole, fa la verifica rientro | sincronizza (manda e riceve) | vede solo i **propri** accessi |
| **admin** | tutto quello dell'editor + il link **Gestione completa** sul telefono (apre la web app intera) | sincronizza, carica l'archivio la prima volta | crea e revoca i codici (⚙ Sincronizzazione › **Codici di accesso**), vede tutti gli accessi e il registro sincronizzazioni |

- Il **PC locale** (`file://`) non ha login: chi usa quel PC è il "proprietario" dell'archivio locale. Il ruolo conta
  quando sincronizza con il server, tramite il codice inserito.
- **Consiglio**: un codice **admin** per te, **editor** per chi lavora in archivio, **viewer** per chi deve solo
  consultare. Se un telefono si perde, revoca il suo codice: al QR successivo non vede più nulla.
- Un livello sopra l'admin (super-admin di più studi o di più clienti) arriverà con l'hub delle licenze e la versione
  Python; oggi ogni studio ha i suoi admin.

## 18. Azioni su molti faldoni insieme

Quando un'azione tocca **10 o più faldoni** (stato a una selezione, ubicazione a una selezione, salvataggio della
modifica in blocco) DocMap chiede conferma e dice quanti sono, i primi codici e se hai selezionato **tutto
l'archivio**. Sotto i 10 parte subito e resta il pulsante **Annulla** per qualche secondo.

## 19. Etichettatrici a nastro e a rotolo, adesivi piccoli (v12.4)

### 19.1 Etichettatrice (Brother P-touch / QL, Dymo, Zebra, Epson, Niimbot…)
1. **Stampa Etichette** › in alto **Etichettatrice / rotolo** (per tornare: **Fogli A4**).
2. **1 · Formato**: scrivi nella ricerca quello che sai del nastro o del rotolo: marca, nome, sigla o misura, per
   esempio `24 mm`, `62x100`, `dk-11201`, `dymo 99012`, `zebra 4x6`, `niimbot 50x30`. Le misure valgono in tutti e due
   i sensi (`100x62` = `62x100`) e con la virgola (`38,1x21,2`). Nella stessa ricerca compaiono anche i fogli A4: se ne
   scegli uno torni alla stampa su fogli con quel formato.
   - Nastro continuo: **Lunghezza etichetta** 0 = segue il testo, oppure un numero fisso in mm.
   - **Altezza stampabile**: 0 = quella tipica del nastro; abbassala se la stampante taglia il bordo.
3. **2 · Cosa stampare**:
   - **Faldoni selezionati**: quelli spuntati per la stampa in Archivio;
   - **Ubicazioni**: un'ubicazione e, se vuoi, tutte quelle che contiene;
   - **Striscia ubicazione**: l'etichetta della scatola (o dello scaffale) e subito dopo tutti i faldoni che contiene, in
     ordine di codice, poi la scatola successiva. Le etichette delle ubicazioni hanno la barra nera a sinistra.
4. **3 · Testo accanto al QR**: scegli il campo principale (codice, titolo, ragione sociale, Codice Multi, ubicazione,
   indirizzo qr7.it/…) e una seconda riga facoltativa. Puoi anche togliere il QR.
5. **4 · Uscita**: **Una per pagina** (la stampante taglia dopo ogni etichetta) o **Striscia continua** (tutte di
   seguito, con le linee di taglio; oltre 90 cm continua in una pagina nuova). **Orientamento della pagina**:
   automatico; se nell'anteprima di stampa del browser l'etichetta esce di traverso o tagliata, prova l'altro.
6. **Stampa**: nella finestra del browser scegli la stampante e lo stesso formato carta, margini **Nessuno**, scala
   **100%**. La prima volta stampa una sola etichetta di prova.
7. Stampanti tascabili Bluetooth (Niimbot, Phomemo): scegli **Salva come PDF** e stampa il PDF dalla loro app.

Il riquadro sopra l'anteprima dice se il QR è leggibile: con i nastri da 6-9 mm il QR è troppo piccolo per il
telefono, usa almeno 12 mm (meglio 18-24 mm).

### 19.2 Adesivi piccoli per i documenti su fogli A4
1. **Stampa Etichette** › **1 · Foglio e preset**: nella casella di ricerca scrivi la sigla o la misura (es. `L7651`,
   `38x21`, `65 etichette`). Fogli nuovi: Avery L7651 (65 da 38,1×21,2), L7658 (189 da 25,4×10), L4732 (80 da
   35,6×16,9), L7636 (48 da 45,7×21,2), L7654 (40 da 45,7×25,4), L7157 (33 da 64×24,3).
2. **3 · Contenuto etichette** › **Solo QR** › **Testo accanto al QR**: lascia "Codice + qr7.it/…" oppure scegli un
   campo (titolo, ragione sociale, Codice Multi…) e una seconda riga.
3. Con questi fogli nuovi fai prima una **Stampa prova di calibrazione**: le misure vengono dai modelli dei produttori
   e una stampante può spostarle di 1-2 mm (si corregge con gli offset).

