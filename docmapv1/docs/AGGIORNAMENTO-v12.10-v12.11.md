# DocMap: da 26.12.10 (v12.10) a 26.12.11 (v12.11) — nuovo anno in un clic, scarto proposto, dove lo metto, ricerca a voce

Seconda parte dell'ondata 2 della roadmap «verso lo stato dell'arte» (K9, K2, K8, K7).
**Nessun dato cambia**: nessuna migrazione, nessuna chiave di memoria cambiata, nessuna tabella nuova, **nessuna
rotta nuova sul server** (il server cambia solo il numero di versione).

## Cosa cambia

### 1. Nuovo anno in un clic (⚙ Funzioni avanzate › Lavoro › Nuovo anno)

- DocMap trova le **serie**: faldoni dello stesso cliente (Codice Multi o nome), stessa categoria e stesso titolo
  senza l'anno («Fatture 2025» e «Fatture 2026» sono la stessa serie).
- Per ogni serie che aveva un faldone **l'anno prima** prepara quello nuovo: l'anno va avanti dove è scritto (titolo,
  anno di riferimento, tag, righe del contenuto di quell'anno: «2025: Fatture acquisto» → «2026: Fatture acquisto»),
  codice parlante nuovo (il primo libero del cliente), **QR nuovo** (mai riusato), già selezionato per la stampa,
  **posto accanto** al faldone dell'anno prima (vedi «Dove lo metto?»).
- Anteprima con una spunta per faldone, poi **Crea**: un solo passo, si annulla con **Annulla**, scritto nel Registro
  attività. Poi **Stampa solo queste N etichette**. Premere di nuovo non crea doppioni: un anno già pronto si salta.
- Opzioni: copiare o no il contenuto, anno vecchio in «Storico», serie ferme da 2 anni, clienti dell'anagrafica che
  non hanno ancora faldoni (titolo da modello, es. «Documenti {anno}»). Da dicembre a febbraio il promemoria è in **Oggi**.

### 2. Scarto proposto e verbale (⚙ Funzioni avanzate › Lavoro › Scarto)

- Ogni anno (di serie da gennaio) DocMap propone i faldoni che hanno superato il **tempo di conservazione**, secondo
  le **Regole** dello studio: di serie 10 anni dall'ultimo anno del faldone; atti e libri sociali, verbali, statuti da
  tenere sempre; regola «Lavoro» con la nota sul LUL. Le regole si cambiano (per categoria o per parole del titolo,
  tag, contenuto) e **viaggiano con le impostazioni condivise** (sincronizzazione / server).
- **Non vengono proposti**: faldoni senza anno (elencati a parte per sistemarli), con il tag **non-scartare**
  (es. accertamento in corso), fuori archivio, già in un verbale aperto.
- **Prepara il verbale**: chi approva (obbligatorio), ruolo, note; per un **ente pubblico** anche il numero
  dell'autorizzazione della Soprintendenza archivistica (art. 21 D.Lgs. 42/2004). Il verbale ha numero (2026/1),
  elenco, regole applicate, spazi per le firme e un'**impronta SHA-256**: se viene cambiato dopo, la stampa lo dice.
- **Segna come distrutti** (dopo la distruzione fisica): ditta, numero del certificato, data. I faldoni **escono
  dall'archivio** (anche dal server, come una normale eliminazione) e restano descritti nel verbale; i loro codici e
  QR **non vengono mai riusati**. Si annulla subito con **Annulla**. Un verbale non eseguito si può annullare.
- È una **proposta da verificare**: DocMap non decide lo scarto e non è «conservazione a norma».

### 3. Dove lo metto? (scheda del faldone, sotto la posizione)

- Fino a 3 posti suggeriti con il motivo: accanto allo stesso faldone di un altro anno, dove sono gli altri faldoni
  del cliente, con la stessa categoria e anno. **Metti qui** imposta la posizione nella scheda (non salva da solo).
- **Impostazioni › Dove lo metto?**: quanti faldoni ci stanno in un posto. Un posto pieno non è più il primo: al
  suo posto c'è l'ubicazione accanto (stesso armadio) con spazio.

### 4. Ricerca a voce

- **Microfono** nella ricerca dell'Archivio e in **Cerca ovunque** (Ctrl+K); il telefono lo aveva già e ora capisce
  le frasi allo stesso modo. «Trovami le fatture di Rossi del 2023 fuori archivio» diventa
  `fatture rossi anno:2023 stato:fuori`. Capisce anni in cifre o in parole, «dal 2019 al 2021», «prima del» /
  «dopo il», «fuori archivio», «storico», «tag …», «categoria …», «stanza …», codici scanditi («codice B L tre»).
- Compare solo dove il browser riconosce la voce (Chrome, Edge, Safari). Il riconoscimento è del browser, che può
  inviare l'audio al proprio servizio: DocMap riceve solo il testo.

### Correzioni comprese

- Faldone smarrito: l'e-mail dello studio accetta solo un indirizzo semplice e il link è codificato.
- Dizionario inglese dell'inventario senza testi italiani doppi.

## File nuovi

`assets/js/02l-years.js`, `02m-voice.js`, `06w-newyear.js`, `06x-retention.js`, `06y-place.js`, `06z-voice.js`,
`assets/css-yearly.css`. Cambiano anche `index.html`, `scan.html`, `02-core.js` (versione), `11d-search.js` (voce del
telefono), `sw.js`, `server-php/api.php` e il server Python (solo il numero di versione). Il deploy
(`tools/build_deploy.py`, hub «Invia ai siti») li copia da solo.

## Dati

- Verbali di scarto: `S.disposals` nel salvataggio del PC, anche nei **backup JSON** e nel ripristino (un verbale va
  solo avanti: da eseguire → eseguito / annullato). Ogni verbale contiene la copia completa dei faldoni scartati.
- Impostazioni nuove: `retention` (regole, **condivise**, vince la più recente `rulesAt`), `newYear` (opzioni e anni
  già preparati), `place` (capienza); `newYear` e `place` restano su quel PC.
- PC: chiave nuova `docmap_disposal_toast_year` (solo l'avviso una volta l'anno).
- I faldoni distrutti escono da `S.binders` con la normale lapide di sincronizzazione (`S.tombstones`).

## Passi

1. **Backup** sul PC (Salva backup) come sempre.
2. **PC**: doppio clic su `AGGIORNA-DOCMAP.bat` (oppure estrai lo zip nella **stessa cartella** di prima).
3. **Server web**: come in `AGGIORNARE-IL-SERVER.md`: carica i file **sopra** quelli vecchi, senza cancellare la
   cartella, senza toccare `server-php/config.php` né la cartella dati, senza rieseguire `setup.php`. Con il hub:
   Deploy → «Siti da aggiornare». Controllo: `server-php/api.php?r=ping` → `"app_version":"26.12.11"`.
4. **Telefoni**: riapri la pagina una volta con la rete.
5. Prima del primo scarto: controlla le **Regole** (⚙ › Lavoro › Scarto › Regole) con il consulente dello studio.

## Tornare indietro

Ricarica i file della 26.12.10 (PC: `AGGIORNA-DOCMAP.bat ripristina`). I faldoni creati con «Nuovo anno» restano
normali faldoni. I verbali restano nel salvataggio e vengono ignorati; i faldoni già segnati come distrutti restano
fuori dall'archivio (sono nel verbale e nei backup precedenti). Il server 26.12.10 funziona uguale (nessuna rotta nuova).
