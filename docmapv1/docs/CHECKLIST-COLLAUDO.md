# Checklist di collaudo manuale

> Le prove che la suite automatica (`tests/suite.js`, Chromium headless) **non può** fare: carta, stampanti, telefoni
> veri, hosting vero, più persone. Da fare al primo avvio in studio e dopo ogni aggiornamento importante.
> Versione 26.11.1.
>
> Per ogni riga: spunta, scrivi data e iniziali e annota cosa hai visto. Se una prova fallisce, fermati e annota
> versione (⚙ Impostazioni), browser, dispositivo e una foto o uno screenshot.
> Passi dettagliati delle funzioni: [`MANUALE-UTENTE.md`](MANUALE-UTENTE.md).

Data: ________  Versione: ________  Chi: ________

## 1. Stampante vera con il foglio MRINK143

Preparazione: 2 fogli MRINK143 e 3 fogli di carta normale. Faldoni di prova: i 5 di esempio (tag `demo`) bastano.

- [ ] **Impostazioni del dialogo di stampa**: Scala 100% (o "Dimensioni effettive"), Margini nessuno, intestazioni e
      piè di pagina spenti, tipo carta Etichette, qualità Alta. Annota nome della stampante e del driver: ________
- [ ] **Prova di calibrazione** (**Stampa Prova di Calibrazione (Quasi Bianca)**) su carta normale, sovrapposta in
      controluce a un foglio MRINK143: scostamento orizzontale ____ mm, verticale ____ mm.
- [ ] Inserisci gli offset in **Offset calibrazione X / Y** (passi da 0,5 mm), ristampa la prova: le linee coincidono
      con i bordi delle 4 etichette fisiche entro 0,5 mm.
- [ ] **Verso di lettura (rotazione)**: stampa 8 etichette su carta normale con **Stampa Etichette**. Con il foglio
      girato per leggere, il testo è dritto e il QR è in alto a destra. Se è capovolto: **Ruota a destra (+90°)** (o
      a sinistra) e annota quale vale per questa stampante: ________
- [ ] **Ordine**: le etichette 1 e 2 sono le due metà della prima etichetta fisica (in alto a sinistra), come in anteprima.
- [ ] **Linea di taglio** a metà di ogni etichetta fisica, appena visibile; tagliando con la taglierina le due metà
      sono uguali (74 mm).
- [ ] **Bordi uguali** ("Compensa il bordo non stampabile e il taglio a mano" acceso): dopo il taglio le etichette di
      sinistra, destra, alto e basso hanno lo stesso bordo bianco. Ripeti con la compensazione spenta per confronto.
- [ ] Stampa **su MRINK143 vero** 1 foglio: le etichette sono dentro le fustelle/aree, niente testo tagliato.
- [ ] **Foglio parziale**: segna 3 caselle come **Già usata**, stampa sul foglio già usato: le caselle usate restano
      bianche; dopo la stampa rispondi **Sì, aggiorna mappa** e controlla che la mappa sia avanzata.
- [ ] **QR letti** con 2 telefoni diversi a 20–30 cm: aprono `https://qr7.it/dm26…`.
- [ ] Ripeti la calibrazione per ogni stampante dello studio (gli offset sono per PC/browser).

## 2. PDF aperto in Acrobat

- [ ] **Scarica PDF** con 2 fogli MRINK143 e un foglio parziale; apri il file in **Adobe Acrobat Reader**.
- [ ] Acrobat non segnala errori; Proprietà del documento: pagina 210 × 297 mm, PDF 1.4.
- [ ] Dialogo di stampa di Acrobat: scegli **Dimensioni effettive** (non "Adatta"); stampa su carta normale e
      sovrapponi a MRINK143: stesso allineamento della stampa dal browser.
- [ ] Testo selezionabile e ricercabile (cerca un codice parlante), QR nitidi con lo zoom al 400%.
- [ ] Le caselle già usate del primo foglio sono vuote.
- [ ] **PDF per tipografia (CMYK, nero solo K)**: in Acrobat › Stampa › Avanzate › Anteprima output (Pro) o dalla
      tipografia: testo e QR solo sul canale K.
- [ ] Apri lo stesso PDF da un altro PC (chiavetta o e-mail) e stampa: stesso risultato.

## 3. Caricamento su SiteGround

- [ ] `python3 docmapv1/tools/build_deploy.py` senza errori; `DEPLOY-MANIFEST.txt` presente.
- [ ] Directory protetta su `public_html/studio-de/` attiva (il browser chiede utente e password).
- [ ] Caricati **tutti** i file, compresi i `.htaccess` (in Gestione file attiva "mostra file nascosti").
- [ ] Confronta 3 file a caso con gli sha256 di `DEPLOY-MANIFEST.txt` (o la dimensione in byte).
- [ ] `setup.php` eseguito una volta: token copiati, `config.php` scaricato e conservato fuori dal sito; riaprendo
      `setup.php` risponde che non è disponibile.
- [ ] `…/server-php/api.php?r=ping` → `"ok":true`, `"schema":2`, `"features"` con `locations` e (v12) `status_events`.
- [ ] Non raggiungibili (403/404): `…/server-php/config.php`, `…/server-php/data/`, la cartella dati, `…/.htaccess`.
- [ ] `https://docmap.pr-it.it/studio-de/q/<short_code di un faldone>` apre la pagina mobile (dopo il login).
- [ ] Da PC con il programma `file://`: **Prova connessione** dice "Connesso come … (admin)"; se la cartella è
      protetta e il PC non si collega, prova con **Protezione con password della cartella** e le righe `OPTIONS` del
      `.htaccess` (MANUALE §7).
- [ ] **Carica il mio archivio sul server (prima volta)** dal PC principale: i numeri mostrati sono quelli
      dell'archivio.

## 4. Telefoni veri

### 4.1 Android con Chrome
- [ ] La fotocamera del telefono (o Google Lens) apre il QR di un faldone → pagina mobile → **Primo accesso su questo
      telefono** con utente, PIN e codice di accesso editor.
- [ ] La scheda mostra codice, cliente, posizione, contenuti; **Modifica** → cambia una nota → salvato; sul PC dopo
      **Sincronizza con il server** la nota c'è.
- [ ] Ubicazione: inquadra il QR di una scatola → **Avvia associazione qui** → inquadra 3 faldoni → **Stop**; sul PC
      i 3 faldoni sono in quella scatola.
- [ ] **Scansiona in sequenza** → **Accendi fotocamera**: Chrome chiede il permesso, la fotocamera posteriore parte,
      i QR vengono letti senza toccare lo schermo.
- [ ] Permesso negato una volta → la pagina mostra "Fotocamera non disponibile"; riattivandolo dal lucchetto funziona.
- [ ] Modalità aereo: una modifica resta "In attesa"; tolta la modalità aereo parte da sola.

### 4.2 iPhone con Safari
- [ ] Come 4.1 con la fotocamera di iOS e Safari (non un'app di terze parti).
- [ ] **Scansiona in sequenza** con Safari: la lettura dei QR funziona anche senza BarcodeDetector (lettore interno).
- [ ] Dopo aver chiuso e riaperto Safari basta il PIN; dopo "Esci" serve di nuovo il PIN.
- [ ] Una foto del faldone fatta con l'iPhone in formato "Più compatibile" (JPG) si carica.

## 5. Lettore USB che scrive come una tastiera (PC)

- [ ] In un blocco note il lettore scrive il contenuto del QR seguito da Invio (es. `https://qr7.it/dm26…`), con
      tastiera italiana (nessun carattere sbagliato come `-` → `'`).
- [ ] **Informazioni › Ubicazioni › Modalità associazione** → campo **Lettore QR / codice + Invio**: QR di una scatola
      → "Ubicazione attiva"; 5 QR di faldoni di fila senza toccare il mouse → tutti assegnati; QR di un'altra scatola →
      cambio scatola; **Annulla** sull'ultimo → torna dov'era.
- [ ] Un QR non DocMap → messaggio "Codice non riconosciuto", nessuna modifica.
- [ ] Webcam del PC: **Webcam** → il browser chiede il permesso → lettura dei QR; **Spegni webcam**.

## 6. Una giornata di sincronizzazione con due PC e un telefono

Persone: A sul PC 1, B sul PC 2, C con il telefono. Tutti con nome operatore / nome dispositivo impostati.

- [ ] Mattina: PC 1 e PC 2 **Sincronizza con il server**; stessi numeri di faldoni e clienti.
- [ ] A crea un faldone nuovo, B ne modifica un altro, C sposta un terzo faldone in una scatola dal telefono.
- [ ] PC 1 e PC 2 sincronizzano: tutti e tre i cambiamenti sono su entrambi.
- [ ] **Conflitto voluto**: A e B modificano lo stesso faldone (campi diversi) senza sincronizzare; A sincronizza, poi
      B sincronizza → B vede la revisione con il conflitto; sceglie **Tieni importato** o **Tieni locale**; dopo un'altra
      sincronizzazione i due PC sono uguali.
- [ ] **Eliminazione**: A elimina un faldone di prova e sincronizza; B sincronizza → sparito anche da B.
- [ ] **Registro sincronizzazioni** (admin, fonte **Server (tutti)**): filtra per il codice del faldone del
      conflitto → si vedono le due voci, chi e da quale PC; **Differenze** chiare; **Esporta CSV** si apre in Excel.
- [ ] **Ripristina questa versione** (admin) sulla versione persa → dopo la sincronizzazione entrambi i PC hanno quella
      versione.
- [ ] Il telefono in **Le mie sincronizzazioni** mostra il suo spostamento come "salvato".
- [ ] Orologio: sposta di 5 minuti l'ora di un PC → compare l'avviso dell'orologio; rimetti l'ora automatica.
- [ ] Fine giornata: **Salva backup** su entrambi i PC.

## 7. Ripristino da backup

Da fare su un PC di prova o con un profilo di Chrome separato (i dati di un profilo non toccano gli altri).

- [ ] Annota numero di faldoni, clienti, ubicazioni e una foto di un faldone.
- [ ] **Salva backup** (JSON) e **Scarica docmap.sqlite**.
- [ ] **Svuota area di lavoro** (Impostazioni) → archivio vuoto.
- [ ] **Ripristina da backup JSON** con l'opzione "Ripristina anche impostazioni, preset e mappa fogli" → stessi numeri,
      stesse impostazioni di stampa e mappa del foglio parziale; le **foto non ci sono** (normale).
- [ ] **Database › Apri file .sqlite › Apri e sostituisci** con il `.sqlite` → ci sono anche le foto.
- [ ] Server: su una copia di prova (o in locale con `php -S`, `DEPLOY-WEB.md` §4) rimetti `docmap.sqlite*` e
      `config.php` del backup → `ping` OK e i dati si leggono; con un `config.php` diverso l'API risponde 500 `config`
      ("aes_key does not match"): la chiave giusta è indispensabile.

## 8. Prova generale di un aggiornamento (dry-run)

Prima di aggiornare lo studio, prova tutto su una copia.

- [ ] Copia la cartella `docmapv1` di un PC in una cartella di prova e usa un **profilo di Chrome nuovo**; importa
      lì il backup JSON (e il `.sqlite`) di quel PC.
- [ ] Server di prova: cartella separata su SiteGround (es. `studio-de-prova/`) con una **copia** della cartella dati
      e di `config.php` (oppure `php -S` in locale).
- [ ] Segui la guida `docs/AGGIORNAMENTO-vX-vY.md` della versione: prima il server di prova, poi la copia del PC.
- [ ] `ping` risponde il nuovo `schema`; versione nuova in ⚙ Impostazioni; stessi numeri di faldoni, clienti,
      ubicazioni; un paio di faldoni e foto aperti; **Sincronizza con il server** senza conflitti inattesi.
- [ ] Un telefono puntato al server di prova funziona.
- [ ] **Rollback**: rimetti la versione vecchia del programma sopra la copia → i dati si aprono ancora.
- [ ] Solo dopo: aggiorna lo studio vero (server → PC → telefoni) e cancella le copie di prova (dati veri!).
