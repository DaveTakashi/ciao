# DocMap 2026 (DM26)

Archivio fisico-digitale: raccoglitori con codice parlante (BL1), posizione sullo scaffale (A1-α), QR statico `https://qr7.it/dm26XXXXXXXX` ed etichette stampate al millimetro. Funziona **offline**, senza server e senza installazioni.

## Avvio rapido in 3 passi

1. Estrai lo zip in una cartella qualsiasi (non aprirlo da dentro lo zip).
2. Fai doppio clic su `index.html`.
3. Usa **Chrome** o **Edge** (Windows 10/11). Firefox e Safari non sono ancora testati.

Al primo avvio parte un breve tour. Il pulsante **?** in alto (o F1) apre la guida con le azioni guidate.

## Novità v6 in breve

- **Foglio predefinito MRINK143**: 4 etichette 105×148 per A4, ognuna divisa in 2 moduli da tagliare a mano (8 moduli per foglio).
- **Campi da stampare** accendibili uno per uno, stampa semplice con le cose difficili in **Opzioni avanzate**.
- **Anagrafica clienti** importabile dal vostro CSV (es. `CLIENTI STORICI ELENCO TIPIZZATO.csv`): il faldone nuovo si compila da solo.
- Posizione tutta facoltativa, **stanze con nome** ("Ufficio 1"), **tipo e colore del ripiano**.
- Contenuti con **"Archivio 1"** di partenza e modifica rapida **una riga per voce**.
- Guida libera: **Avanti e Indietro funzionano sempre**, cliccando un altro campo la guida salta al suo passo.
- Faldoni di esempio con tag **demo**, da nascondere o eliminare con un clic.

## Checklist prima della prima stampa

- [ ] Stampa il **foglio di calibrazione** su carta normale e sovrapponilo al foglio di etichette in controluce.
- [ ] Nella finestra di stampa: **Scala 100%** (non "Adatta"), **Margini: nessuno**, intestazioni e piè di pagina **disattivati**.
- [ ] Nelle preferenze stampante: tipo carta **Etichette** e qualità **Alta**.
- [ ] Usa fogli adatti alla stampante (laser o inkjet: non sono intercambiabili).
- [ ] Se serve, correggi gli offset (±0,5 mm) e ristampa la calibrazione.
- [ ] Controlla il riquadro "Qualità di stampa": QR ≥ 15 mm, codice ≥ 6 mm.

## Uso quotidiano

- **Nuovo faldone:** archivio, poi "Nuovo faldone". Codice parlante, short code e posizione si compilano quasi da soli.
- **Import:** trascina un CSV, JSON o `.sqlite` ovunque nella finestra, oppure incolla il testo (anche la risposta dell'AI con il blocco ```csv).
- **Annulla:** dopo un'eliminazione, un import, il ripristino di una sessione o l'apertura di un `.sqlite` compare "Annulla" per alcuni secondi.
- **Scorciatoie:** `F1` guida, `Ctrl+S` salva il faldone aperto (o fa il backup rapido), `Esc` chiude guida, aiuto o finestra. Se il faldone ha modifiche non salvate, `Esc` chiede conferma.

## Etichetta divisa MRINK143 (predefinita)

Il foglio **MRINK143** è un A4 con **4 etichette 105×148 mm** (formato A6, 2×2, senza spazi tra le etichette). DocMap legge ogni etichetta **in orizzontale** (148×105) e la divide in **due moduli** che tagli a mano lungo la linea centrale: da ogni foglio escono 4 etichette fisiche e **8 moduli**.

| Modulo | Cosa contiene |
|---|---|
| **Principale** (sopra) | Codice parlante grande in alto a sinistra, categoria grande, ragione sociale, luogo della ditta, Codice Multi, posizione, QR in alto a destra con l'URL piccolo sotto, banda colorata del dorso. |
| **Archivio** (sotto) | Descrizione/titolo, anno di riferimento, contenuti, tag, data (creazione o aggiornamento) e codici extra, più il codice parlante e lo short code per riconoscerlo. |

- La **linea di taglio** è un tratteggio grigio chiarissimo (opacità bassa): si vede appena da vicino. Si toglie in Opzioni avanzate.
- Il testo è ruotato di **−90°**: il foglio entra in verticale nella stampante e l'etichetta si legge in orizzontale. Se la tua stampante gira il foglio al contrario scegli **+90°** in Opzioni avanzate › Divisione dei moduli. Lì puoi anche cambiare l'altezza del modulo principale (30–70%).
- Fogli parziali: in Opzioni avanzate › mappa del foglio clicca le etichette già usate, la stampa parte dalla prima libera.
- Gli altri fogli (L7160, L7163…) restano disponibili sotto **"Altri fogli"**, con i contenuti "Coppia sdoppiata", "Solo A", "Solo B" e "Unificata".

### Campi da stampare (Stampa › Campi da stampare)

Il **codice parlante** c'è sempre. Si possono accendere o spegnere: categoria, luogo ditta, Codice Multi, URL piccolo sotto il QR, descrizione/titolo, anno di riferimento, contenuti, tag, codici extra, posizione e la data (creazione, aggiornamento o nessuna). Un campo vuoto non lascia buchi. Il tag `demo` non viene mai stampato.

### Stampa: base e Opzioni avanzate

La colonna di sinistra mostra solo coda di stampa, foglio (con il consigliato in evidenza), contenuto, campi, QR e qualità. **Opzioni avanzate** (riquadro richiudibile, resta come l'hai lasciato) contiene geometria del foglio, offset e margine interno, divisione dei moduli, recupero dei fogli parziali e calibrazione. Le guide lo aprono da sole quando serve.

## Anagrafica clienti

Nella scheda **Clienti** importi l'elenco clienti dello studio, ad esempio `CLIENTI STORICI ELENCO TIPIZZATO.csv` con intestazione `TIPO;Ditta;Ragione_soc;Indirizzo;Codice_com;Cap;Localita;Provincia;ETS_ENC`. DocMap riconosce da solo che è un elenco clienti (non faldoni) e mostra l'anteprima prima di importare.

| Colonna del file | Campo DocMap |
|---|---|
| `Ditta` | Codice Multi |
| `Ragione_soc` | Ragione sociale |
| `Localita` + `Provincia` | Luogo ditta, es. `BUSSETO (PR)` |
| `ETS_ENC` (se vuoto `TIPO`) | Categoria, es. `APS` |
| `Indirizzo`, `Cap`, `Codice_com` | Dettagli del cliente |

- Scrivendo la ragione sociale in un faldone nuovo, Codice Multi, luogo e categoria si compilano da soli. Dalla tabella clienti c'è anche il pulsante **Nuovo faldone**.
- Reimportare lo stesso file **aggiorna** i clienti (stesso codice Ditta o stesso nome) senza duplicarli. Le righe senza ragione sociale o ripetute vengono segnalate e saltate; quelle senza codice Ditta si importano con un avviso.
- L'anagrafica è nel backup JSON, nella tabella `clients` del database SQLite e si esporta in CSV.

## Posizione, stanze e ripiani

- Tutti i campi della posizione sono **facoltativi**.
- **Stanza**: una lettera (`A`) o un nome (`Ufficio 1`). Con un nome la posizione diventa `Ufficio 1 · 2-α`.
- **Ripiano**: menu a tendina con lo stile (numeri 1 2 3, lettere A B C, greche α β γ, emoji, simboli o nome libero). I pulsanti rapidi seguono lo stile.
- **Colore del ripiano**: facoltativo, appare come striscia colorata nella Mappa Scaffali e nello schema "Dov'è?".
- **Contenuti**: partono da "Archivio 1"; "Aggiungi voce" crea "Archivio 2" e così via. Con **"Una riga per voce"** scrivi o incolli l'elenco, una voce per riga (l'anno è facoltativo: `2025: Fatture`).
- Nuovi campi del faldone: **luogo ditta**, **anno di riferimento** (si riferisce ai contenuti, non alla data di creazione) e **codici extra** (protocolli, numeri pratica).

## Dati di esempio

I 5 faldoni di esempio hanno il tag `demo`. Finché esistono, in Archivio compare una barra con **Nascondi esempi** (spariscono da elenco, mappa, conteggi e coda di stampa ma restano salvati) ed **Elimina esempi** (si può annullare subito). I tuoi faldoni non vengono toccati.

## Codice Multi

Il **Codice Multi** è l'identificativo interno che lo studio ha già assegnato al cliente o alla pratica nel gestionale. È facoltativo.

- **Faldone:** c'è un campo accanto al codice parlante. Se scegli un cliente esistente, il codice viene proposto da solo.
- **Ricerca:** puoi scriverlo nella barra di ricerca dell'archivio.
- **Etichette:** compare su tutte, se compilato. Si spegne in Stampa con "Mostra il Codice Multi".
- **CSV e JSON:** colonna `multi_code`, seconda dopo `speaking_code`. Sono riconosciute anche le intestazioni `codice_multi`, `multi` e `codice_interno`. I file vecchi senza questa colonna si importano come prima.
- **Manifest qr7.it:** il formato resta identico. Il Multi viene aggiunto nei tag (`multi-…`), e nel modello di destinazione puoi usare `{multi_code}`.
- **SQLite:** colonna `binders.multi_code` con indice. I file `.sqlite` vecchi vengono aggiornati da soli quando li apri.
- **Prompt AI:** 20 colonne (dalla v6 anche `company_city`, `ref_year`, `extra_codes` in fondo). L'AI copia il Multi esattamente com'è e non lo inventa mai. I CSV a 17 colonne della v5 si importano ancora.

## Template etichetta (Stampa, sezione 3)

| Template | Quando usarlo |
|---|---|
| **Classico** | Codice parlante grande, cliente, titolo, Multi, posizione e categoria. Va bene quasi sempre. |
| **Codice Multi in evidenza** | Per chi cerca i faldoni con il codice del gestionale. Se un faldone non ha il Multi, usa il Classico. |
| **Codice gigante** | Per scaffali alti o lontani: si legge a 3-4 m. Ideale su L7163, L7165 e sui dorsi. |
| **Essenziale** | Solo codice, cliente, Multi e posizione. Pulito, adatto alle etichette piccole (L7160). |

Il template cambia l'etichetta frontale. L'etichetta dei contenuti e quella unificata mostrano comunque il Multi nel piè di pagina.

## Foto e "Dov'è?"

- Nell'archivio, l'icona **segnaposto** di un faldone apre **"Dov'è?"**. Lo stesso succede cliccando un dorso nella Mappa Scaffali.
- "Dov'è?" mostra lo schema dell'armadio (α in cima, settori SX/CX/DX) con il ripiano giusto **evidenziato e lampeggiante**, più la posizione scritta a parole.
- **Foto dell'armadio:** premi "Segna" e clicca il punto del ripiano sulla foto. Da quel momento compare un segnaposto rosso per tutti i faldoni di quel ripiano.
- **Foto del faldone:** si aggiungono dalla scheda del faldone o da "Dov'è?". Da telefono o tablet puoi scattarle direttamente.
- Le foto vengono ridotte a 1400 px in JPEG (circa 150-300 KB l'una) e salvate nel database locale e nel `.sqlite` scaricato. **Non sono nei backup JSON/CSV:** per conservarle scarica il `.sqlite`.

## Formati etichette

Predefinito: **MRINK143** (4 per foglio, 105×148, 8 moduli). Poi i più usati, in ordine: **L7160** (21 per foglio, 63,5×38,1), **L7163** (14, 99,1×38,1), **L7165** (8, 99,1×67,7), **L7173** (10, 99,1×57). Ci sono altri formati fustellati e i layout **A4 adesivo intero** (da tagliare), più la geometria personalizzata con "Riempi A4" e "Centra". Font: Inter per il testo e JetBrains Mono per i codici, inclusi nella cartella e quindi uguali su ogni PC.

## Dati e backup

- I dati stanno nel browser (localStorage + database SQLite in IndexedDB). Puoi anche collegare un file `.sqlite` sul disco.
- **Attenzione:** se cancelli i dati di navigazione, perdi la copia locale. Tutte le copie di DocMap aperte da `file://` sullo stesso PC condividono gli stessi dati.
- Fai spesso "Backup rapido" (JSON) oppure scarica il `.sqlite`.
- Il CSV di backup è protetto dalle formule di Excel: le celle che iniziano con `= + - @` ricevono un apostrofo, che DocMap toglie da solo quando reimporti il file.
- CSV: separatore `;`. Excel va bene in UTF-8, UTF-16 o ANSI (Windows-1252): la codifica viene riconosciuta da sola.
- Manifest qr7.it: `short_code;short_url;final_destination;tags`. La destinazione predefinita è `https://studiodallasta.it/docmap/?code={speaking_code}&qr={short_code}` e si cambia nelle Impostazioni.

## Problemi comuni

| Problema | Soluzione |
|---|---|
| Le etichette escono spostate di 1-2 mm | Stampa la calibrazione e correggi gli offset (passi da 0,5 mm). Controlla che la scala sia 100%. |
| Le etichette si rimpiccioliscono | Nella stampa scegli "Margini: nessuno" e disattiva "Adatta alla pagina". |
| Accenti o lettere greche strane dopo l'import | Il file era ANSI: DocMap lo segnala. Da Excel salva come "CSV UTF-8". |
| L'import dice "nessuna riga valida" | Serve almeno una colonna con il nome del cliente (`company_name` o `cliente`). |
| Il QR non si legge | Nel riquadro "Qualità di stampa" il QR deve essere almeno 15 mm. Usa la modalità "solo QR" o un formato più grande. |
| Ho cancellato per errore | Premi subito "Annulla". Più tardi: Database, poi ripristina una sessione, oppure reimporta l'ultimo backup JSON. |
| Una foto non si carica | Le foto HEIC di iPhone non si aprono in Chrome su Windows. Imposta la fotocamera su "Più compatibile" (JPG) o usa una foto PNG/JPG. |
| "Il motore SQLite non si è avviato" | Apri `index.html` dalla cartella estratta, non da dentro lo zip. |
| Sull'etichetta divisa il testo è capovolto | In Opzioni avanzate › Divisione dei moduli scegli l'altra rotazione (+90° / −90°). |
| La linea di taglio non cade a metà | Controlla Scala 100% e Margini nessuno; se serve correggi gli offset con la calibrazione. |
| L'elenco clienti viene letto come faldoni | Deve esserci la colonna `Ragione_soc` (o `ragione_sociale`) e nessuna colonna da faldone come `speaking_code`. |

## Cose da fare

- [ ] Prova su stampante reale con il foglio MRINK143 (verso di rotazione e linea di taglio), poi L7160 e A4 intero
- [ ] Test su Firefox e Safari
- [ ] Pagina di atterraggio su studiodallasta.it/docmap
- [ ] Redirect dinamico su qr7.it collegato al manifest
- [ ] Fase multi-utente con server (FastAPI) e sincronizzazione
- [ ] Foto in un file separato (ZIP) per backup JSON completi
- [ ] Undo a più livelli (oggi annulla solo l'ultima operazione di massa)

## Struttura

```
index.html            apertura con doppio clic
assets/docmap.css     stile
assets/fonts/         Inter e JetBrains Mono (licenza OFL)
assets/js/01..09-*.js QR, dati, stampa, interfaccia, SQLite, foto (06b), clienti (06c), guida
vendor/sql-wasm.js    sql.js 1.10.3 con WASM incluso
tests/suite.js        test automatici (solo sviluppo)
tests/fixtures/       piccolo elenco clienti di prova (dati inventati)
```

## Test (solo per sviluppatori)

Servono Node.js, `playwright`, `jsqr`, `pngjs` e Python con `pypdfium2`.

```
cd tests && npm i playwright jsqr pngjs && pip install pypdfium2 && node suite.js
```

La suite (452 controlli) apre l'app in Chromium. Controlla tutte le schermate e stampa ogni formato in PDF, leggendo ogni QR uno per uno. Verifica anche import ed export, SQLite, le guide, le prestazioni con 2000 faldoni e i casi limite trovati nella caccia ai bug. Dalla v6 controlla anche etichetta divisa, campi, anagrafica clienti, dati demo, ripiani e la guida libera.
