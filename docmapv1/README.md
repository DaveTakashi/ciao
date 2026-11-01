# DocMap 2026 (DM26)

Archivio fisico-digitale: raccoglitori con codice parlante (BL1), posizione sullo scaffale (A1-α), QR statico `https://qr7.it/dm26XXXXXXXX` ed etichette stampate al millimetro. Funziona **offline**, senza server e senza installazioni.

## Avvio rapido in 3 passi

1. Estrai lo zip in una cartella qualsiasi (non aprirlo da dentro lo zip).
2. Fai doppio clic su `index.html`.
3. Usa **Chrome** o **Edge** (Windows 10/11). Firefox e Safari non sono ancora testati.

Al primo avvio parte un breve tour. Il pulsante **?** in alto (o F1) apre la guida con le azioni guidate.

## Novità v9 in breve

- **Etichetta informazioni** (nuovo modello predefinito su MRINK143): Codice Multi grande, ragione sociale grandissima che va a capo senza spezzare le parole, QR con indirizzo. L'etichetta completa di prima resta come **classica**.
- **Etichetta del contenuto** facoltativa sull'altra metà della stessa etichetta fisica.
- **Bordi uguali**: compensa il bordo non stampabile e il taglio a mano.
- **Scarica PDF**: file pronto per la stampa, da stampare anche da un altro PC al 100%.
- **Registro attività** con il nome di chi ha fatto cosa.

## Novità v8 in breve

- **Barra in alto più semplice:** solo Archivio, Stampa etichette e Informazioni. Import, export, AI, database e impostazioni sono nel menu **⚙ Funzioni avanzate**.
- **Informazioni** (prima "Clienti"): clienti, tag, categorie, anni, luoghi, codici Multi, codici extra e QR. Rinomini o unisci una voce e cambia in tutti i faldoni.
- **Suggerimenti mentre scrivi** per cliente, Multi, luogo, categoria, anno, codici extra e tag, con le 3-4 voci più usate appena entri nel campo. Niente clienti doppi; codice parlante già usato = avviso con il prossimo libero.
- **Stato di ogni documento:** in archivio, in uso, al cliente.
- **Una riga per voce** con pulsante Conferma; **Posizione rapida** in un solo campo (es. `A1-β-SX`) con le posizioni recenti.
- **Contatti e note** del faldone, non stampati se non li accendi.
- **Import diretto da Excel (.xlsx)** con abbinamento colonne da confermare.
- **Ristampa solo QR** su etichette piccole per i QR rovinati.
- Documentazione tecnica in `AGENTS.md` e `docs/` (architettura, modello dati, allineamento con il sistema Python, progetto hub/API).

## Novità v6–v7 in breve

- **Foglio predefinito MRINK143**: 4 etichette fisiche 105×148 per A4, ognuna con 2 etichette complete da separare con la taglierina (8 per foglio). Anteprima verticale o orizzontale.
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
- **Import:** trascina un file Excel `.xlsx`, CSV, JSON o `.sqlite` ovunque nella finestra, oppure incolla il testo (anche la risposta dell'AI con il blocco ```csv).
- **Annulla:** dopo un'eliminazione, un import, il ripristino di una sessione o l'apertura di un `.sqlite` compare "Annulla" per alcuni secondi.
- **Scorciatoie:** `F1` guida, `Ctrl+S` salva il faldone aperto (o fa il backup rapido), `Esc` chiude guida, aiuto o finestra. Se il faldone ha modifiche non salvate, `Esc` chiede conferma.

## Etichetta informazioni e bordi uguali (v9)

In **Stampa etichette › Contenuto etichette** i modelli sono ora un elenco di *template*. Il nuovo predefinito per il foglio MRINK143 è l'**Etichetta informazioni (consigliata)**: in alto a sinistra il **Codice Multi** grande (scritta piccola "MULTI"; se manca, il codice parlante con la scritta "CODICE"), sotto categoria e codice parlante, a destra il QR con l'indirizzo qr7.it/… sotto (il codice breve da solo non si stampa più). La **ragione sociale** è grandissima: DocMap sceglie la dimensione più grande che entra, andando a capo solo tra una parola e l'altra, mai a metà parola. Seguono luogo e posizione, titolo e anno, le prime **0, 1 o 2 voci del contenuto** (di serie 2), tag e data. Con **Stampa anche l'etichetta del contenuto** (spento di serie) ogni faldone riceve anche una seconda etichetta con tutto il contenuto e la data di aggiornamento, sull'altra metà della stessa etichetta fisica 105×148. L'etichetta di prima resta disponibile come **Etichetta completa (classica)**, identica.

In **Opzioni avanzate › Bordi uguali su tutte le etichette** c'è la **compensazione dei bordi**: la stampante non stampa i ~4 mm vicino al bordo del foglio e il taglio a mano sposta di circa 1 mm, quindi le etichette staccate a sinistra, al centro e a destra avrebbero bordi bianchi diversi. Acceso, ogni etichetta lascia lo stesso spazio bianco su tutti i lati (bordo 4 mm + taglio 1 mm, modificabili): tutte uguali e centrate. Di serie è acceso sui fogli da tagliare a mano (MRINK143, A4 adesivo intero) e spento sui prefustellati; in anteprima un tratteggio azzurro mostra l'area stampata.

## Foglio MRINK143: 8 etichette complete (predefinito)

Il foglio **MRINK143** è un A4 con **4 etichette fisiche 105×148 mm** (formato A6, 2×2, senza spazi). Ogni etichetta fisica contiene **2 etichette stampate complete**, una per faldone, che separi con la taglierina lungo la linea a metà: da ogni foglio escono **8 etichette da 105×74 mm**.

- Ogni etichetta si legge con il foglio girato (74 di larghezza × 105 di altezza). In alto il **codice parlante** a sinistra e il **QR** a destra con l'URL piccolo sotto. Poi categoria, Codice Multi e posizione; ragione sociale e luogo; titolo con anno di riferimento; contenuti. In fondo tag, codici extra, data e short code.
- **Ordine di stampa:** per etichetta fisica. La 1 e la 2 sono le due metà della prima etichetta fisica, la 3 e la 4 della seconda, e così via, nell'ordine in cui le leggi a foglio girato.
- La **linea di taglio** è un tratteggio grigio chiarissimo (opacità bassa): si vede appena da vicino. Si toglie in Opzioni avanzate.
- **Anteprima:** di base è **verticale**, come il foglio entra in stampante. Il pulsante **Orizzontale** sopra l'anteprima gira solo la vista, per leggere le etichette dritte. La stampa non cambia.
- Il testo è ruotato di **−90°**. Se la tua stampante gira il foglio al contrario scegli **+90°** in Opzioni avanzate › Verso di lettura e linea di taglio.
- **Tutti i contenuti seguono lo stesso verso.** Con "Coppia Sdoppiata" il Modulo A va sopra e il Modulo B sotto nella stessa etichetta fisica; anche "Solo A", "Solo B" e "Unificata" usano il foglio girato.
- **Fogli parziali:** la mappa del foglio ha 8 caselle raggruppate nelle 4 etichette fisiche. Puoi segnare come usata anche una sola metà: la stampa userà l'altra.
- Gli altri fogli (L7160, L7163…) restano disponibili sotto **"Altri fogli"**.

### Campi da stampare (Stampa › Campi da stampare)

Il **codice parlante** c'è sempre. Si possono accendere o spegnere: categoria, luogo ditta, Codice Multi, URL piccolo sotto il QR, descrizione/titolo, anno di riferimento, contenuti, tag, codici extra, posizione e la data (creazione, aggiornamento o nessuna). Un campo vuoto non lascia buchi e **non stampa mai "Voce:" seguita dal nulla**. Se invece vuoi lo spazio da compilare a mano, accendi **Stampa anche i campi vuoti**: comparirà "Voce: ____". Il tag `demo` non viene mai stampato.

### Stampa: base e Opzioni avanzate

La colonna di sinistra mostra solo coda di stampa, foglio (con il consigliato in evidenza), contenuto, campi, QR e qualità. **Opzioni avanzate** (riquadro richiudibile, resta come l'hai lasciato) contiene geometria del foglio, offset e margine interno, verso di lettura e linea di taglio, recupero dei fogli parziali e calibrazione. Le guide lo aprono da sole quando serve.

### Scarica PDF (stampare da un altro PC o da una chiavetta)

In **Stampa etichette**, accanto a "Stampa Etichette", il pulsante **Scarica PDF** crea un file PDF pulito e già pronto per la stampa, senza passare dal dialogo di stampa e senza Internet. Contiene esattamente le stesse etichette della stampa diretta: foglio A4 esatto, misure al millimetro, offset di calibrazione, etichette girate di MRINK143, linee di taglio e caselle già usate del foglio parziale lasciate vuote. Testi e QR sono vettoriali (nitidi a qualsiasi risoluzione) e il testo si può cercare e copiare. Il file si chiama ad esempio `DocMap_etichette_mrink143_2026-11-01.pdf`: copialo su una chiavetta o mandalo per e-mail e stampalo da qualsiasi PC scegliendo **Scala 100% / Dimensioni effettive** (mai "Adatta alla pagina"). Dopo il download DocMap chiede, come dopo una stampa, se segnare come usate le caselle dell'ultimo foglio.

## Importazione da Excel

In **⚙ › Importa** puoi trascinare direttamente un file Excel **.xlsx** (non serve più salvarlo in CSV): DocMap lo legge offline, anche aperto con doppio clic. Se il file ha più fogli scegli quello giusto; titoli e righe vuote sopra la tabella vengono saltati. Prima dell'anteprima compare il passo **Abbina le colonne**: per ogni colonna del file vedi l'intestazione, alcuni valori di esempio e il campo DocMap proposto (dai nomi delle colonne, anche simili, e dai valori: codici dm26, colori #RRGGBB, anni, CAP, province). Correggi i menu se serve, scegli se importare **Faldoni** o **Anagrafica clienti** e premi **Conferma abbinamento**. L'abbinamento viene ricordato, quindi reimportare lo stesso file richiede un solo clic. Lo stesso passo vale per i CSV e per le celle copiate da Excel e incollate; i CSV di DocMap e i JSON vanno diretti all'anteprima, con il link «Modifica abbinamento colonne». Testi e caratteri speciali restano identici (apostrofi come LESIGNANO DE' BAGNI, virgolette, punto e virgola, accenti, zeri iniziali come 007, a capo nelle celle); le date diventano AAAA-MM-GG e nella colonna Contenuti ogni riga o ogni «|» diventa una voce. I vecchi file .xls vanno prima salvati come .xlsx o CSV. Limiti: le celle unite non vengono espanse, le formule senza valore salvato arrivano vuote, serve Chrome/Edge 103 o successivo.

## Barra in alto e Informazioni

La barra in alto ha tre schede: **Archivio**, **Stampa etichette** e **Informazioni**. Importa, Esporta e Salva, Database, Genera con AI e Impostazioni sono nel menu **⚙ Funzioni avanzate** accanto alle schede (si apre anche da tastiera; la schermata avanzata aperta è evidenziata).

**Informazioni** raccoglie in sotto-schede tutte le voci usate nei faldoni: Clienti, Tag, Categorie, Anni, Luoghi, Codici Multi, Codici extra e QR. Ogni voce mostra quanti faldoni la usano (clic sul numero = Archivio filtrato). **Rinomina** cambia la voce in tutti i faldoni e clienti; rinominare su una voce esistente la **unisce**; **Elimina** la toglie dai faldoni. Tutto è annullabile. In Categorie si sceglie il colore dei nuovi faldoni della categoria. In **QR** si selezionano i QR rovinati e **Ristampa solo QR** apre la stampa con etichette piccole (QR + codice parlante + codice breve, foglio predefinito Avery L7159 da 24), conservando le impostazioni di stampa precedenti da ripristinare con un clic.

## Anagrafica clienti

In **Informazioni › Clienti** importi l'elenco clienti dello studio, ad esempio `CLIENTI STORICI ELENCO TIPIZZATO.csv` con intestazione `TIPO;Ditta;Ragione_soc;Indirizzo;Codice_com;Cap;Localita;Provincia;ETS_ENC`. DocMap riconosce da solo che è un elenco clienti (non faldoni) e mostra l'anteprima prima di importare.

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

## Scheda faldone: suggerimenti, posizione rapida, stato dei documenti (v8)

- **Suggerimenti mentre scrivi**: cliente, Codice Multi, luogo, categoria, anno, codici extra, tag, stanza, armadio, persone e descrizioni dei contenuti propongono i valori già usati (i più usati appena entri nel campo vuoto, poi filtrati mentre scrivi, senza badare a maiuscole e accenti). Frecce ↑ ↓, Invio per scegliere, Esc per chiudere. Nei campi con più valori (tag, codici extra, persone) il suggerimento vale per la voce dopo l'ultima virgola.
- **Cliente**: scegliendo un cliente dell'anagrafica o già in archivio si compilano Codice Multi, luogo e categoria e viene proposto il codice parlante successivo (es. BL4). Scegliendo un Codice Multi noto si compila il cliente.
- **Niente doppioni**: se scrivi un cliente già presente con un'altra grafia (`ROSSI COSTRUZIONI SPA`) viene usata quella esistente (`Rossi Costruzioni S.p.A.`). Se il cliente non è in anagrafica, dopo il salvataggio un pulsante propone di aggiungerlo. Un codice parlante già usato mostra "Codice già presente: usa BL4" con il pulsante per correggerlo; il salvataggio resta bloccato finché il codice non è unico.
- **Posizione rapida**: scrivi `A1-β-SX`, `B2 3`, `a-1-beta dx` o `Ufficio 1 · 2-α` e stanza, armadio, ripiano e settore si compilano da soli; sotto ci sono le posizioni recenti/più usate da cliccare. I singoli campi, lo stile e il colore del ripiano sono in **Dettagli posizione**.
- **Stato di ogni documento (Modulo B)**: *in archivio* (predefinito), *in uso* (prelevato) oppure *al cliente*. In archivio compare un riepilogo ("1 al cliente"); sull'etichetta un piccolo segno "↗ cliente" / "↗ in uso".
  Nel CSV, nel testo "una riga per voce" e nel prompt AI il formato resta `ANNO: Descrizione`; un documento fuori archivio ha un suffisso: `2024: Bilancio [cliente]`, `2025: F24 [in uso]`. Senza suffisso il documento è in archivio. In JSON il campo è `status` (`archive` / `in_use` / `client`); in SQLite la colonna `contents_items.status`.
- **Una riga per voce**: apre il testo con l'elenco; **Conferma** lo trasforma di nuovo in righe (gli stati restano grazie ai suffissi), **Annulla** lascia tutto com'era.
- **Altro**: *persone / contatti coinvolti* (separati da virgola) e *note* (es. "Documento uscito il 12/03"). Si cercano dall'archivio e **non si stampano**, a meno di accenderli in Stampa › Campi ("Contatti", "Note"). Colonne CSV `contacts` e `notes` (dopo `shelf_color`; intestazioni riconosciute anche `contatti`, `persone`, `referenti`, `note`, `annotazioni`).

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
- **Prompt AI:** 22 colonne (dalla v6 anche `company_city`, `ref_year`, `extra_codes`, dalla v8 `contacts`, `notes` in fondo). Le righe senza intestazione a 22, 20, 17 o 16 campi si importano tutte. L'AI copia il Multi esattamente com'è e non lo inventa mai. I CSV a 17 colonne della v5 si importano ancora.

## Template etichetta (Stampa, sezione 3)

| Template | Quando usarlo |
|---|---|
| **Classico** | Codice parlante grande, cliente, titolo, Multi, posizione e categoria. Va bene quasi sempre. |
| **Codice Multi in evidenza** | Per chi cerca i faldoni con il codice del gestionale. Se un faldone non ha il Multi, usa il Classico. |
| **Codice gigante** | Per scaffali alti o lontani: si legge a 3-4 m. Ideale su L7163, L7165 e sui dorsi. |
| **Essenziale** | Solo codice, cliente, Multi e posizione. Pulito, adatto alle etichette piccole (L7160). |

Il template cambia l'etichetta frontale. L'etichetta dei contenuti e quella unificata mostrano comunque il Multi nel piè di pagina.

## Pagine e Scarica PDF (v10)

Nel riquadro **Pagine** di *Stampa etichette* vedi quanti fogli produce la stampa e scegli quali stampare (**Tutte**, oppure ad esempio `2` o `1-3,5`), l'**ordine inverso** per le stampanti che fanno uscire i fogli a faccia in su, e l'ordine dei fogli con le miniature (↑ ↓ e **Prima**). La scelta vale sia per **Stampa** sia per **Scarica PDF** e l'anteprima la mostra subito. Se hai un foglio già usato in parte, è sempre il *foglio 1* a saltare le caselle usate: se lo sposti, DocMap ti dice in che posizione esce, così metti il foglio già usato in quel punto del cassetto. Se cambi la coda di stampa, la scelta si azzera con un avviso. Il **PDF** è ora a massima compatibilità (PDF 1.4 classico, caratteri incorporati, nessuna trasparenza, A4 esatto, Acrobat propone già la scala 100%); con la casella **PDF per tipografia** i colori sono in CMYK e il nero di testi e QR usa solo l'inchiostro nero.

## Foto e "Dov'è?"

- Nell'archivio, l'icona **segnaposto** di un faldone apre **"Dov'è?"**. Lo stesso succede cliccando un dorso nella Mappa Scaffali.
- "Dov'è?" mostra lo schema dell'armadio (α in cima, settori SX/CX/DX) con il ripiano giusto **evidenziato e lampeggiante**, più la posizione scritta a parole.
- **Foto dell'armadio:** premi "Segna" e clicca il punto del ripiano sulla foto. Da quel momento compare un segnaposto rosso per tutti i faldoni di quel ripiano.
- **Foto del faldone:** si aggiungono dalla scheda del faldone o da "Dov'è?". Da telefono o tablet puoi scattarle direttamente.
- Le foto vengono ridotte a 1400 px in JPEG (circa 150-300 KB l'una) e salvate nel database locale e nel `.sqlite` scaricato. **Non sono nei backup JSON/CSV:** per conservarle scarica il `.sqlite`.

## Formati etichette

Predefinito: **MRINK143** (4 etichette fisiche 105×148 = 8 etichette 105×74). Poi i più usati, in ordine: **L7160** (21 per foglio, 63,5×38,1), **L7163** (14, 99,1×38,1), **L7165** (8, 99,1×67,7), **L7173** (10, 99,1×57). Ci sono altri formati fustellati e i layout **A4 adesivo intero** (da tagliare), più la geometria personalizzata con "Riempi A4" e "Centra". Font: Inter per il testo e JetBrains Mono per i codici, inclusi nella cartella e quindi uguali su ogni PC.

## Dati e backup

- I dati stanno nel browser (localStorage + database SQLite in IndexedDB). Puoi anche collegare un file `.sqlite` sul disco.
- **Attenzione:** se cancelli i dati di navigazione, perdi la copia locale. Tutte le copie di DocMap aperte da `file://` sullo stesso PC condividono gli stessi dati.
- Fai spesso "Backup rapido" (JSON) oppure scarica il `.sqlite`.
- Il CSV di backup è protetto dalle formule di Excel: le celle che iniziano con `= + - @` ricevono un apostrofo, che DocMap toglie da solo quando reimporti il file.
- CSV: separatore `;`. Excel va bene in UTF-8, UTF-16 o ANSI (Windows-1252): la codifica viene riconosciuta da sola.
- Manifest qr7.it: `short_code;short_url;final_destination;tags`. La destinazione predefinita è `https://studiodallasta.it/docmap/?code={speaking_code}&qr={short_code}` e si cambia nelle Impostazioni.

## Registro attività

Nel menu **⚙ Funzioni avanzate › Registro attività** trovi l'elenco di tutto quello che è stato fatto, dal più recente: faldoni creati, modificati (con i campi cambiati, prima → dopo), duplicati ed eliminati, operazioni annullate, import, export e backup, stampe e PDF delle etichette, modifiche in Informazioni e nell'anagrafica clienti, sessioni e file del database. Per sapere **chi** ha fatto cosa scrivi il tuo nome in **Impostazioni › Il tuo nome (operatore)** (o in cima al registro); senza nome le operazioni risultano fatte da "Questo PC". Puoi cercare per testo, tipo di operazione, persona e date, cliccare il codice di un faldone per aprirlo ed esportare le righe in CSV per Excel. Il registro sta nel database SQLite (anche nel `.sqlite` scaricato) e nei backup JSON; restano le ultime 20.000 operazioni.

## Problemi comuni

| Problema | Soluzione |
|---|---|
| Le etichette escono spostate di 1-2 mm | Stampa la calibrazione e correggi gli offset (passi da 0,5 mm). Controlla che la scala sia 100%. |
| Le etichette si rimpiccioliscono | Nella stampa scegli "Margini: nessuno" e disattiva "Adatta alla pagina". |
| Accenti o lettere greche strane dopo l'import | Il file era ANSI: DocMap lo segnala. Da Excel salva come "CSV UTF-8". |
| L'import dice "nessuna riga valida" | Serve almeno una colonna con il nome del cliente (`company_name` o `cliente`). |
| Quale livello di correzione QR scelgo? | **M** (predefinito) va bene quasi sempre. **L** fa quadratini più grandi, utile se il QR è piccolo. **Q** o **H** reggono graffi e sporco ma fanno quadratini più piccoli: usali solo con QR di almeno 20 mm. |
| Il QR non si legge | Nel riquadro "Qualità di stampa" il QR deve essere almeno 15 mm. Usa la modalità "solo QR" o un formato più grande. |
| Ho cancellato per errore | Premi subito "Annulla". Più tardi: Database, poi ripristina una sessione, oppure reimporta l'ultimo backup JSON. |
| Una foto non si carica | Le foto HEIC di iPhone non si aprono in Chrome su Windows. Imposta la fotocamera su "Più compatibile" (JPG) o usa una foto PNG/JPG. |
| "Il motore SQLite non si è avviato" | Apri `index.html` dalla cartella estratta, non da dentro lo zip. |
| Su MRINK143 il testo è capovolto | In Opzioni avanzate › Verso di lettura scegli l'altra rotazione (+90° / −90°). |
| La linea di taglio non cade a metà | Controlla Scala 100% e Margini nessuno; se serve correggi gli offset con la calibrazione. |
| Il file Excel non si apre | Serve un `.xlsx` (non `.xls`) e Chrome o Edge aggiornati. In alternativa salva come CSV UTF-8. |
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
assets/docmap.css     stile (più css-info, css-editor, css-import per le parti v8)
assets/fonts/         Inter e JetBrains Mono (licenza OFL)
assets/js/01..09-*.js QR, dati, stampa, interfaccia, SQLite, foto (06b), clienti (06c), Informazioni (06d),
                      suggerimenti dell'editor (04b), import Excel (05b), guida
vendor/sql-wasm.js    sql.js 1.10.3 con WASM incluso
vendor/pdf-fonts.js   caratteri per "Scarica PDF" (Inter e JetBrains Mono statici, OFL; rigenerabili con tools/make_pdf_fonts.py)
tests/suite.js        test automatici (solo sviluppo)
tests/fixtures/       piccolo elenco clienti di prova e generatore .xlsx (dati inventati)
AGENTS.md, docs/      documentazione tecnica per sviluppatori e agenti AI
```

## Test (solo per sviluppatori)

Servono Node.js, `playwright`, `jsqr`, `pngjs` e Python con `pypdfium2`.

```
cd tests && npm i playwright jsqr pngjs && pip install pypdfium2 && node suite.js
```

La suite (oltre 650 controlli) apre l'app in Chromium. Controlla tutte le schermate e stampa ogni formato in PDF, leggendo ogni QR uno per uno. Verifica anche import ed export, SQLite, le guide, le prestazioni con 2000 faldoni e i casi limite trovati nella caccia ai bug. Dalla v6–v7 controlla anche le 8 etichette di MRINK143, la vista orizzontale, i campi vuoti, campi, anagrafica clienti, dati demo, ripiani e la guida libera. Dalla v8 anche menu e Informazioni, ristampa solo QR, suggerimenti dell'editor, stato dei documenti, posizione rapida, contatti e note, import Excel. Dalla v9 anche l'etichetta informazioni, i bordi uguali, lo Scarica PDF (QR letti dal PDF scaricato) e il registro attività.
