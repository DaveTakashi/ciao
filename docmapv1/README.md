# DocMap 2026 (DM26)

Archivio fisico-digitale: raccoglitori con codice parlante (BL1), posizione sullo scaffale (A1-α), QR statico `https://qr7.it/dm26XXXXXXXX` ed etichette stampate al millimetro. Funziona **offline**, senza server e senza installazioni.

## Avvio rapido in 3 passi

1. Estrai lo zip in una cartella qualsiasi (non aprirlo da dentro lo zip).
2. Fai doppio clic su `index.html`.
3. Usa **Chrome** o **Edge** (Windows 10/11). Firefox e Safari non sono ancora testati.

Al primo avvio parte un breve tour. Il pulsante **?** in alto (o F1) apre la guida con le azioni guidate.

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

## Codice Multi

Il **Codice Multi** è l'identificativo interno che lo studio ha già assegnato al cliente o alla pratica nel gestionale. È facoltativo.

- **Faldone:** c'è un campo accanto al codice parlante. Se scegli un cliente esistente, il codice viene proposto da solo.
- **Ricerca:** puoi scriverlo nella barra di ricerca dell'archivio.
- **Etichette:** compare su tutte, se compilato. Si spegne in Stampa con "Mostra il Codice Multi".
- **CSV e JSON:** colonna `multi_code`, seconda dopo `speaking_code`. Sono riconosciute anche le intestazioni `codice_multi`, `multi` e `codice_interno`. I file vecchi senza questa colonna si importano come prima.
- **Manifest qr7.it:** il formato resta identico. Il Multi viene aggiunto nei tag (`multi-…`), e nel modello di destinazione puoi usare `{multi_code}`.
- **SQLite:** colonna `binders.multi_code` con indice. I file `.sqlite` vecchi vengono aggiornati da soli quando li apri.
- **Prompt AI:** 17 colonne. L'AI copia il Multi esattamente com'è e non lo inventa mai.

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

I più usati, in ordine: **L7160** (21 per foglio, 63,5×38,1), **L7163** (14, 99,1×38,1), **L7165** (8, 99,1×67,7), **L7173** (10, 99,1×57). Ci sono altri formati fustellati e i layout **A4 adesivo intero** (da tagliare), più la geometria personalizzata con "Riempi A4" e "Centra". Font: Inter per il testo e JetBrains Mono per i codici, inclusi nella cartella e quindi uguali su ogni PC.

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

## Cose da fare

- [ ] Prova su stampante reale con i fogli L7160 e A4 intero
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
assets/js/01..09-*.js QR, dati, stampa, interfaccia, SQLite, foto (06b), guida
vendor/sql-wasm.js    sql.js 1.10.3 con WASM incluso
tests/suite.js        test automatici (solo sviluppo)
```

## Test (solo per sviluppatori)

Servono Node.js, `playwright`, `jsqr`, `pngjs` e Python con `pypdfium2`.

```
cd tests && npm i playwright jsqr pngjs && pip install pypdfium2 && node suite.js
```

La suite (331 controlli) apre l'app in Chromium. Controlla tutte le schermate e stampa ogni formato in PDF, leggendo ogni QR uno per uno. Verifica anche import ed export, SQLite, le guide, le prestazioni con 2000 faldoni e i casi limite trovati nella caccia ai bug.
