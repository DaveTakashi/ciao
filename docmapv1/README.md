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
- Guida libera: **Avanti e Indietro funzionano sempre**, cliccando un altro campo la guida salta al suo passo (v10: vedi "Guida e azioni guidate").
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
- Manifest qr7.it: `short_code;short_url;final_destination;tags;` (ogni riga termina con `;`, v11). La destinazione predefinita (v10) è `https://docmap.pr-it.it/studio-de/q/{short_code}` e si cambia nelle Impostazioni.

## Colori dei dorsi (v10)

I colori dei faldoni ora si scelgono da soli, in modo armonioso. Ogni categoria ha una **famiglia di colori** (per esempio colori **caldi** — rossi, arancio, ocra — per APS, ETS e associazioni, **freddi scuri** — blu e verdi scuri — per le aziende, blu per l'Ordinaria, verdi per la Semplificata) e, con l'assegnazione **Per cliente** (predefinita), ogni cliente riceve in automatico una sua sfumatura della famiglia: tutti i faldoni dello stesso cliente nella stessa categoria hanno lo stesso colore, clienti diversi hanno sfumature diverse. Nella scheda del faldone il colore cambia mentre scrivi cliente e categoria; se clicchi un colore diventa **scelto a mano** (🔒) e non cambia più da solo, mentre **Automatico** lo sblocca. In **Informazioni › Categorie** scegli la famiglia di ogni categoria (con la striscia dei colori) e puoi ricolorarne i faldoni; in **Impostazioni › Colori dei dorsi** scegli la modalità (Per cliente, Per categoria come prima, Manuale) e trovi **Ricolora tutti i faldoni (non bloccati)**, che si può annullare. Aggiornando, i colori esistenti non cambiano: quelli scelti a mano vengono bloccati.

**Spettro colore e regole colore.** Ogni categoria ha uno **spettro colore** tra Rosso, Verde, Azzurro/Blu, Giallo, Arancione, Viola, Rosa e Nero/Grigi (all'inizio APS → Rosso, ODV → Verde, ASD → Azzurro/Blu, ETS → Giallo; si cambia quando vuoi, anche subito nel modulo del faldone quando scrivi una categoria nuova). Dentro ogni categoria puoi aggiungere fino a **10 regole colore**: una parola chiave → una sfumatura precisa. Esempio: APS + "proloco" → tutte le Pro Loco hanno lo stesso rosso. La parola vale se compare nel nome del cliente o nel titolo del faldone, senza badare a maiuscole, accenti, spazi o trattini ("proloco" = "Pro Loco" = "PRO-LOCO"), ma solo come parola intera; vince la prima regola dell'elenco. Le regole si gestiscono in **Informazioni › Categorie** (clic sul colore della categoria: Aggiungi regola, cambia sfumatura, frecce per l'ordine, cestino, "Applica ai faldoni esistenti" annullabile); in cima alla scheda c'è l'elenco di tutte le regole, raggiungibile anche da Impostazioni › Colori dei dorsi. Un colore bloccato (scelto a mano) vince sempre sulle regole.

## Modifica massiva (v10)

In **Archivio** il pulsante **Modifica massiva** apre una griglia tipo Excel con tutti i faldoni (rispetta ricerca e filtri), una riga per faldone: codice, cliente, Multi, categoria, titolo, anno, tag, luogo, posizione, stato e colore (con **Colonne** aggiungi codici extra, contatti e note). Ti muovi con frecce, Tab e Invio, scrivi direttamente per modificare (i suggerimenti propongono i valori già usati, così il cliente resta scritto sempre uguale), Esc annulla. Per categorizzare in fretta: **ordina** cliccando l'intestazione, **raggruppa** per categoria o cliente, spunta più righe (Spazio, Maiusc+clic, oppure il riquadro del gruppo) e usa **Imposta categoria**, **Aggiungi/Rimuovi tag**, **Imposta stato**, **Imposta colore** o **Imposta posizione**; **Ctrl+D** copia la cella nelle righe selezionate. Le modifiche restano in giallo, in sospeso, finché non premi **Salva modifiche** (o Ctrl+S): codici doppi o vuoti bloccano il salvataggio, **Annulla tutto** le scarta, e dopo il salvataggio un solo **Annulla** ripristina tutto. Ogni salvataggio finisce nel Registro attività con i campi cambiati per ogni faldone.

## Registro attività

Nel menu **⚙ Funzioni avanzate › Registro attività** trovi l'elenco di tutto quello che è stato fatto, dal più recente: faldoni creati, modificati (con i campi cambiati, prima → dopo), duplicati ed eliminati, operazioni annullate, import, export e backup, stampe e PDF delle etichette, modifiche in Informazioni e nell'anagrafica clienti, sessioni e file del database. Per sapere **chi** ha fatto cosa scrivi il tuo nome in **Impostazioni › Il tuo nome (operatore)** (o in cima al registro); senza nome le operazioni risultano fatte da "Questo PC". Puoi cercare per testo, tipo di operazione, persona e date, cliccare il codice di un faldone per aprirlo ed esportare le righe in CSV per Excel. Il registro sta nel database SQLite (anche nel `.sqlite` scaricato) e nei backup JSON; restano le ultime 20.000 operazioni.

## Telefono, login e versione web (v10)

- **Dopo la scansione del QR** si apre la pagina mobile del faldone (`scan.html`). Senza login non mostra nessun dato,
  nemmeno il codice: solo il nome dello studio e il modulo di accesso. Dopo il login: codice grande, Multi, cliente,
  **Dov'è?** (con la foto dell'armadio e il ripiano segnato, se c'è), contenuti con lo stato, ultima modifica.
- Chi **può modificare** tocca il grande pulsante tondo **Modifica**: stato del faldone, stato di ogni documento
  (in archivio / in uso / al cliente), posizione rapida (es. `B2-γ-DX`), note e tag. Se intanto il faldone è stato
  cambiato dal PC, il telefono avvisa e chiede se ricaricare o salvare comunque. Ogni modifica va nel **Registro
  attività** con la fonte **mobile**.
- **Utenti**: in ⚙ Funzioni avanzate › **Impostazioni › Utenti e accesso** (nome utente, PIN o password, ruolo
  *Solo lettura* / *Può modificare* / *Amministratore*). Il PIN è salvato solo come impronta PBKDF2. Sul PC, in locale,
  il programma continua a funzionare senza login. **Anteprima mobile** (finestra QR e scheda del faldone) apre la
  pagina del telefono in una nuova scheda.
- **Destinazione predefinita dei QR**: `https://docmap.pr-it.it/studio-de/q/{short_code}` (se non l'avevi cambiata).
- **Versione web** (`https://docmap.pr-it.it/studio-de/`): `python3 docmapv1/tools/build_deploy.py` crea la cartella
  `deploy/studio-de/` da caricare. Sul server c'è solo il programma; i dati restano **cifrati nel browser** di ogni
  dispositivo e si aprono con il login (ogni dispositivo crea il suo amministratore al primo accesso e importa i dati
  dal pacchetto di sincronizzazione). Dettagli: `docs/DEPLOY-WEB.md`, `docs/SICUREZZA.md`, `docs/API-CONTRACT.md`.
- Limiti del sito statico (`--no-server`): utenti e dati valgono solo nel browser dove sono stati creati; PIN perso
  da tutti gli amministratori = dati di quel browser da reimportare. Con il database online (v10.1, sotto) i dati
  stanno sul server e i codici di accesso si revocano a distanza.

## Sincronizzazione PC ⇄ web app (v10)

DocMap funziona sia sul PC (doppio clic su `index.html`) sia come web app su **https://docmap.pr-it.it/studio-de/**. Per ora le due copie dei dati si allineano a mano da **⚙ Funzioni avanzate › Sincronizzazione**: sul PC premi **Copia export per web app** (la prima volta "Tutto l'archivio", poi "Solo modifiche dall'ultima sincronizzazione"), scrivi una passphrase (consigliato: il file viene cifrato AES-256 e la passphrase non viene mai salvata) e scarica il file; nella web app premi **Importa dati da client locale**, scegli il file, scrivi la passphrase e **Analizza**. Al contrario è uguale: **Esporta per il client locale** nella web app e **Importa dati dalla web app** sul PC. Prima di applicare vedi quanti faldoni e clienti sono nuovi, aggiornati, invariati, più vecchi (ignorati), eliminati e in conflitto. Regola: per ogni faldone vince la modifica **più recente in ordine di tempo**, da qualunque lato sia stata fatta; se lo stesso faldone è cambiato da entrambe le parti dopo l'ultima sincronizzazione vedi i campi diversi affiancati e scegli "Tieni locale" / "Tieni importato" (o "Applica a tutti: il più recente"). Anche le eliminazioni viaggiano; un faldone eliminato da una parte ma modificato dopo dall'altra resta ed è segnalato. Tutto si annulla con un clic su **Annulla** e finisce nel registro attività. Sotto trovi la coda: modifiche locali non ancora esportate, dispositivi conosciuti e cronologia. Dettagli tecnici: `docs/SYNC.md`.

## Database online condiviso (v10.1)

Dalla v10.1 la versione web può avere un **database condiviso** sul server dello studio (SiteGround, PHP): i
dipendenti aprono l'app dal telefono o dal browser, scansionano un QR e **modificano direttamente online**; il PC
in ufficio resta com'è (offline, doppio clic su `index.html`) e si allinea quando vuoi.

- **Sul server**: la cartella `server-php/` (creata da `tools/build_deploy.py` dentro `deploy/studio-de/`). Si
  installa una volta con `server-php/setup.php` (genera la chiave di cifratura e i **codici di accesso**). I dati
  sono cifrati (AES-256-GCM) nel file SQLite, che è meglio tenere fuori da `public_html`. Passo passo:
  `README-DEPLOY.md` nel deploy e `docs/DEPLOY-WEB.md` §0.
- **Telefoni e browser**: al primo accesso nome utente, PIN di questo dispositivo e codice di accesso. Poi basta il
  PIN. In alto lo stato: *Online · sincronizzato*, *In attesa (N)*, *Offline · in attesa (N)*. Senza rete le
  modifiche restano sul dispositivo (cifrate) e partono da sole quando torna la connessione.
- **PC**: ⚙ Funzioni avanzate › Sincronizzazione › **Server online** → indirizzo e codice → **Sincronizza con il
  server**. La prima volta, con il server vuoto, DocMap chiede **"Carica il mio archivio sul server (prima volta)"**
  e mostra quanti faldoni e clienti invierà. Se lo stesso faldone è cambiato su entrambi i lati vedi la revisione
  dei conflitti, come con i pacchetti.
- **Aggiornare dalla v10 senza perdere nulla**: segui `docs/AGGIORNAMENTO-v10-v10.1.md` (prima il backup, poi i nuovi
  file **nella stessa cartella**). La procedura generale per le versioni future è in `docs/AGGIORNAMENTI.md`.
- Le foto restano sul PC (non passano dal server).

## Luoghi e associazione (v11)

**Informazioni › Ubicazioni** è la mappa dell'archivio fisico: magazzino › armadio › scansia › scaffale › scatola
(nomi e numero di livelli in **Livelli…**). Si chiama "Ubicazioni" perché la scheda "Luoghi" elenca già le località
delle ditte.

1. **Programma la struttura**: **Crea in serie…** crea tutto in un colpo (es. 1 magazzino, 2 armadi, 1 scansia,
   4 scaffali, 20 scatole B01…B20 per scaffale). Puoi poi aggiungere, rinominare, spostare o eliminare (con Annulla).
2. **Stampa i QR delle scatole**: spunta le scatole (o **Seleziona ultimo livello**) → **Stampa etichette**: si apre
   Stampa etichette con codice grande, percorso e QR (foglio MRINK143 o un altro preset; c'è anche **Scarica PDF**).
   Ricordati di esportare il manifest qr7: contiene anche le righe delle ubicazioni.
3. **Associa i faldoni**: **Modalità associazione** (o **Avvia associazione qui** su una scatola). Con un lettore QR
   USB/Bluetooth (o la webcam) scansiona il QR della scatola, poi i QR dei faldoni che contiene, poi la scatola
   successiva e così via. Ogni passaggio finisce nel Registro attività e si può annullare.
4. **Dal telefono** (versione online): inquadra con la fotocamera il QR della scatola, premi **Avvia associazione qui**
   e inquadra i faldoni uno dopo l'altro; un altro QR di scatola cambia scatola. **Scansiona in sequenza** fa lo stesso
   senza uscire dalla pagina. **Stop** termina (si chiude da sola dopo 30 minuti senza scansioni).

In Archivio: filtro **Tutte le ubicazioni** e pulsante **Ubicazione…** per i faldoni spuntati; nella scheda faldone il
campo **Ubicazione (scatola)** con i suggerimenti; **Dov'è?** mostra il percorso completo. Le ubicazioni si
sincronizzano con il server e con i pacchetti come i faldoni.

## Registro sincronizzazioni (v11)

Ogni sincronizzazione (server, pacchetti tra PC, salvataggi dal telefono) lascia una traccia: **chi**, **quando**, da
**quale dispositivo** e cosa è successo a **ogni faldone** (nuovo, aggiornato, più vecchio e ignorato, conflitto e come
è stato deciso). Si apre da ⚙ Funzioni avanzate › Sincronizzazione › **Registro sincronizzazioni**: filtri per data,
utente, dispositivo e codice; nel dettaglio il confronto campo per campo e **Ripristina questa versione**; **Esporta
CSV** / **JSON** per conservare la prova. Con il server collegato un admin vede il registro di tutti, un editor solo il
suo. Sul telefono: **Le mie sincronizzazioni**. Dai un nome al PC in ⚙ Sincronizzazione (es. "PC segreteria"): compare
nel registro. Passo passo per una contestazione: `docs/SYNC.md` §10. I dati v10.1 (sul PC e sul server) restano
validi: il server aggiunge da solo le sue tabelle del registro al primo avvio.

## Guida e azioni guidate (v10)

Il pulsante **?** in alto (o **F1**) apre la guida. In cima ci sono le cose che si fanno più spesso: *Come creo un nuovo faldone*, *Come stampo le etichette*, *Come creo un nuovo cliente*, *Come importo un elenco*, *Come trovo un faldone*, *Come scarico il PDF*; poi l'ordine si adatta a quello che usate davvero su questo PC. Puoi ordinare anche per **Preferiti** (stella ☆ accanto a un argomento o a un'azione guidata; con il nome operatore in Impostazioni ognuno ha i suoi) o **A-Z**. Due file di etichette aiutano a filtrare: grigie per l'**argomento** (Stampa, Etichette, Clienti…) e colorate per **cosa vuoi fare** (Come fare, Cos'è, Creare, Modificare, Eliminare, Stampare, Importare/Esportare, Trovare, Risolvere problemi). Appena scrivi nella ricerca i filtri si azzerano e restano accese solo le etichette dei risultati; la ricerca capisce accenti, plurali e sinonimi (faldone/raccoglitore/archivio, cliente/ditta/azienda, stampa/stampare, QR/codice QR). Le **14 azioni guidate** (nuovo faldone, stampa, PDF, nuovo cliente, trova, modifica, calibrazione, foglio già usato, manifest, AI, sessione, backup, import, registro) non si chiudono mai per sbaglio: Esc, la ✕ o un secondo clic fuori chiedono "Vuoi davvero uscire dalla guida?" (Continua è il pulsante evidenziato); cliccando un campo di un altro passo la guida salta a quel passo; Invio o → avanti, ← indietro. Se esci a metà, la guida ricorda il passo: trovi **Riprendi la guida** in cima alla guida.

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
- [x] Pagina di atterraggio del QR (`scan.html`, v10) e pubblicazione su docmap.pr-it.it/studio-de
- [ ] Redirect dinamico su qr7.it collegato al manifest
- [x] Database online condiviso con sincronizzazione (v10.1, `server-php`)
- [ ] Back-end Python (FastAPI) con account utente sul server, al posto di `server-php` (stesso contratto)
- [ ] Foto in un file separato (ZIP) per backup JSON completi
- [ ] Undo a più livelli (oggi annulla solo l'ultima operazione di massa)

## Struttura

```
index.html            apertura con doppio clic
scan.html             pagina mobile dopo la scansione del QR (v10: 10-auth.js, 11-scan.js, css-scan.css)
docmap.config.js      modalità local (predefinita) o web; tools/build_deploy.py crea la cartella per il sito
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
