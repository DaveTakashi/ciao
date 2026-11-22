/* =====================================================================
   DocMap 2026 — Guided actions engine
   Not a passive tour: the user performs the real action. Each step
   spotlights one element, blocks clicks elsewhere (with a gentle reminder),
   validates required fields before moving on, follows the element when the
   page scrolls or the view changes, and closing the guide never closes the
   form being filled.

   v10 (stream G):
   - never exits by accident: Esc, the ✕, a second click outside → "Vuoi davvero
     uscire dalla guida?" (Esci / Continua la guida, focus on Continua);
   - clicking a field of another step jumps to that step (guideJumpAt);
   - keyboard: Enter / → next, ← back, Esc asks; step text announced (aria-live);
   - a missing target is skipped gracefully (message + Next goes on);
   - the guide remembers where you left it: "Riprendi la guida" (help panel + toast);
   - starts are counted for the popularity order of the help panel (helpUse).
   ===================================================================== */
Object.assign(I18N.it, {
  g_step:'Passo {n} di {t}', g_next:'Avanti', g_back:'Indietro', g_close:'Esci dalla guida', g_done:'Fatto', g_finish:'Termina',
  g_outside:'La guida è ancora attiva: completa l\'elemento evidenziato. Per uscire usa la ✕ in alto nella scheda.', g_future:'Completa prima i passi precedenti.',
  g_auto:'Il passo avanza da solo quando hai fatto l\'azione.', g_modal:'Rispondi alla finestra aperta, poi la guida riprende.', g_goto:'Vai a {v}', g_wrongview:'Questo passo si trova in "{v}".',
  g_sample:'Usa un esempio', g_continue:'Continua: {g}', g_reopen:'Hai chiuso la scheda: la riapro dal passo giusto.',
  g_anyway:'Premi di nuovo Avanti per proseguire comunque.', g_jump:'Ti ho portato al passo di questo campo.',
  g_exit_t:'Vuoi davvero uscire dalla guida?', g_exit_d:'Puoi riprenderla dallo stesso passo quando vuoi (Guida › Riprendi la guida).', g_exit_ok:'Esci', g_exit_no:'Continua la guida',
  g_missing:'Questo elemento ora non è visibile: premi Avanti per saltare il passo.', g_left:'Guida interrotta al passo {n}. Puoi riprenderla quando vuoi.', g_resume:'Riprendi',
  g_keys:'Invio o → avanti · ← indietro · Esc per uscire'
});
Object.assign(I18N.en, {
  g_step:'Step {n} of {t}', g_next:'Next', g_back:'Back', g_close:'Leave the guide', g_done:'Done', g_finish:'Finish',
  g_outside:'The guide is still active: complete the highlighted element. To leave use the ✕ at the top of the card.', g_future:'Complete the previous steps first.',
  g_auto:'This step moves on by itself once you have done the action.', g_modal:'Answer the open window, then the guide resumes.', g_goto:'Go to {v}', g_wrongview:'This step is in "{v}".',
  g_sample:'Use a sample', g_continue:'Continue: {g}', g_reopen:'You closed the form: reopening it from the right step.',
  g_anyway:'Press Next again to go on anyway.', g_jump:'Moved to the step of this field.',
  g_exit_t:'Do you really want to leave the guide?', g_exit_d:'You can resume it from the same step any time (Help › Resume the guide).', g_exit_ok:'Leave', g_exit_no:'Continue the guide',
  g_missing:'This element is not visible now: press Next to skip the step.', g_left:'Guide stopped at step {n}. You can resume it any time.', g_resume:'Resume',
  g_keys:'Enter or → next · ← back · Esc to leave'
});

const VIEW_LABEL = { archive:'nav_archive', print:'nav_print', info:'nav_info', clients:'nav_info', import:'nav_import', export:'nav_export', ai:'nav_ai', settings:'nav_settings', database:'nav_database' };
// advanced views sit in the "Funzioni avanzate" menu (a <details>): guideResolve opens it, navStepText says where it is
const navStep = (view, title, text) => ({ target:'.nav [data-v="' + view + '"]', title, text:navStepText(view, text), done:() => S.view === view });
const edField = (k) => () => { const el = $('#ed-' + k); return el && el.closest('.field'); };
const edOpen = () => !!(UI.ed && topModal());
const clOpen = () => !!$('#cl-name');
const clField = (k, grid) => () => { const el = $('#cl-' + k); return el && el.closest(grid ? '.grid' : '.field'); };
const locOpen = () => !!(topModal() && topModal()._locate);
const edSavedSince = (c) => { const b = c.id && S.binders.find(x => x.id === c.id); return !!(b && b.updated_at !== c.u); };
const SAMPLE_CSV = 'speaking_code;company_name;category;binder_title;room_code;cabinet_code;shelf_code;sector_code;location_code;archive_state;contents;tags;color_hex;short_code;short_url;final_destination\n' +
  ';Bianchi Impianti S.r.l.;Ordinaria;Fatture e Contabilità IVA;C;1;α;;C1-α;CURRENT;2025: Fatture Acquisto|2025: Fatture Vendita|2025: Liquidazioni IVA;iva,fatture,2025;#2563EB;;;\n' +
  ';Bianchi Impianti S.r.l.;Lavoro;Paghe e Personale;C;1;β;SX;C1-β-SX;CURRENT;2025: Cedolini|2025: Certificazione Unica;paghe,lavoro,2025;#D97706;;;\n';
const sampleImport = {label:'g_sample', fn:() => { const el = $('#im-text'); if (el){ el.value = SAMPLE_CSV; UI.importText = SAMPLE_CSV; } }};
const prSteps = () => [
  { target:'#pr-summary', title:{it:'Coda di stampa', en:'Print queue'}, text:{it:'Qui vedi i faldoni spuntati in Archivio. Se la coda è vuota torna in Archivio e spunta i faldoni (quelli nuovi sono già spuntati).', en:'These are the binders ticked in Archive. If empty, go back to Archive and tick some (new binders are already ticked).'},
    require:() => printQueueBinders().length ? null : {it:'La coda è vuota: spunta almeno un faldone in Archivio.', en:'The queue is empty: tick at least one binder in Archive.'} },
  { target:'.preset-list', title:{it:'Tipo di foglio', en:'Sheet type'}, text:{it:'Scegli il foglio che hai in stampante. Consigliato: MRINK143 (4 etichette A6 da dividere a metà = 8 etichette). Gli altri fogli sono sotto "Altri fogli": "A4 intero" = foglio adesivo unico da tagliare; "Prefustellato" = etichette già fustellate tipo Avery (il codice è sulla confezione).', en:'Pick the sheet in your printer. Recommended: MRINK143 (4 A6 labels cut in half = 8 labels). Other sheets are under "Other sheets": "Full A4" = one adhesive sheet to cut; "Die-cut" = pre-cut Avery-type labels (code on the box).'} },
  { target:() => { const b = $('[data-a="cmode"]'); return b && b.parentElement; }, title:{it:'Cosa stampare', en:'What to print'}, text:{it:'Predefinito sul foglio MRINK143: "Etichetta informazioni (consigliata)", che si legge da lontano: Codice Multi, ragione sociale grandissima, codice parlante e QR. Sotto puoi scegliere quante voci del contenuto stampare e accendere l\'etichetta del contenuto. Le altre scelte: Etichetta completa, Coppia Sdoppiata (Modulo A + Modulo B), solo A, solo B, unificata, Solo QR.', en:'Default on the MRINK143 sheet: "Info label (recommended)", readable from a distance: Multi code, very large company name, speaking code and QR. Below you choose how many contents items to print and can switch on the contents label. Other choices: Complete label, Split Pair (Module A + Module B), A only, B only, unified, QR only.'} }
];

const GUIDES = {
  create: { pop:100, title:{it:'Crea un nuovo faldone e la sua etichetta', en:'Create a new binder and its label'}, steps:[
    navStep('archive', {it:'Apri l\'Archivio', en:'Open the Archive'}, {it:'Clicca "Archivio" nella barra in alto.', en:'Click "Archive" in the top bar.'}),
    { target:'.page-h [data-a="new-binder"]', title:{it:'Nuovo faldone', en:'New binder'}, text:{it:'Clicca "Nuovo Faldone": si apre la scheda.', en:'Click "New Binder": the form opens.'}, done:() => !!(UI.ed && UI.ed.isNew) },
    { target:edField('company_name'), onEnter:(c) => { c.id = UI.ed && UI.ed.d.id; }, guard:() => edOpen() ? null : 1,
      title:{it:'Cliente', en:'Client'}, text:{it:'Scrivi il nome del cliente o della società, ad esempio "Rossi Costruzioni S.p.A.". Se il cliente esiste già, compare nei suggerimenti e si compilano Codice Multi, luogo e categoria.', en:'Type the client or company name, e.g. "Rossi Costruzioni S.p.A.". Existing clients appear as suggestions and fill in Multi code, place and category.'},
      require:() => UI.ed.d.company_name.trim() ? null : {it:'Scrivi prima il nome del cliente.', en:'Type the client name first.'} },
    { target:edField('speaking_code'), guard:() => edOpen() ? null : 1,
      title:{it:'Codice parlante', en:'Speaking code'}, text:{it:'DocMap ha proposto le iniziali + il numero successivo (es. RC2). È il codice grande che leggerai sullo scaffale: puoi cambiarlo.', en:'DocMap suggested initials + next number (e.g. RC2). It is the big code you will read on the shelf: you can change it.'},
      require:() => { const e = validateEditor(true); return e.speaking_code ? {it:e.speaking_code, en:e.speaking_code} : null; } },
    { target:edField('binder_title'), guard:() => edOpen() ? null : 1,
      title:{it:'Titolo del faldone', en:'Binder title'}, text:{it:'Una descrizione breve, ad esempio "Fatture e Contabilità IVA".', en:'A short description, e.g. "Invoices and VAT".'},
      require:() => UI.ed.d.binder_title.trim() ? null : {it:'Il titolo è consigliato (es. "Fatture e Contabilità IVA").', en:'A title is recommended (e.g. "Invoices and VAT").'} },
    { target:() => { const el = $('#ed-multi_code'); return el && el.closest('.grid'); }, guard:() => edOpen() ? null : 1,
      title:{it:'Codice Multi e luogo', en:'Multi code and place'}, text:{it:'Facoltativi. Codice Multi = il vostro codice interno del cliente o della pratica. Luogo = sede della ditta, es. "Parma (PR)". Se il cliente è nell\'anagrafica si compilano da soli.', en:'Optional. Multi code = your internal client/practice id. Place = company town, e.g. "Parma (PR)". Filled automatically for clients in the register.'} },
    { target:() => { const el = $('#ed-ref_year'); return el && el.closest('.grid'); }, guard:() => edOpen() ? null : 1,
      title:{it:'Anno di riferimento e codici extra', en:'Reference year and extra codes'}, text:{it:'Facoltativi. L\'anno si riferisce ai contenuti (es. 2025 o 2020-2024), non alla data di creazione. I codici extra (protocolli, numeri pratica) si possono stampare sull\'etichetta (Stampa › Campi da stampare).', en:'Optional. The year refers to the contents (e.g. 2025 or 2020-2024), not the creation date. Extra codes (protocol, practice numbers) can be printed on the label (Print › Fields to print).'} },
    { target:() => $('#ed-locblock'), guard:() => edOpen() ? null : 1,
      title:{it:'Posizione sullo scaffale', en:'Shelf position'}, text:{it:'Tutto facoltativo. Scrivi la posizione in "Posizione rapida", ad esempio A1-β-SX (stanza A, armadio 1, ripiano β, settore SX), "B2 3" oppure "Ufficio 1 · 2-α", o clicca una posizione recente. In "Dettagli posizione" trovi i singoli campi, il tipo di ripiano (numeri, lettere, greche α β γ, emoji, simboli) e il colore.', en:'All optional. Type the position in "Quick position", e.g. A1-β-SX (room A, cabinet 1, shelf β, sector SX), "B2 3" or "Ufficio 1 · 2-α", or click a recent position. "Position details" has the single fields, the shelf style (numbers, letters, Greek α β γ, emoji, symbols) and colour.'},
      require:() => (UI.ed.d.room_code.trim() || UI.ed.d.shelf_code.trim()) ? null : {it:'Senza posizione il faldone sarà difficile da ritrovare.', en:'Without a position the binder is hard to find.'} },
    { target:() => { const el = $('#ed-contents'); return el && el.closest('.field'); }, guard:() => edOpen() ? null : 1,
      title:{it:'Contenuti del faldone', en:'Binder contents'}, text:{it:'Facoltativo. Parte da "Archivio 1": rinominalo o premi "Aggiungi voce" per "Archivio 2". Con "Una riga per voce" scrivi o incolli l\'elenco, una voce per riga, poi premi "Conferma". Ogni voce ha uno stato: in archivio, in uso oppure dato al cliente.', en:'Optional. It starts from "Archivio 1": rename it or press "Add item" for "Archivio 2". With "One line per item" type or paste the list, one item per line, then press "Confirm". Each item has a status: in archive, in use or given to the client.'} },
    { target:edField('tags'), guard:() => edOpen() ? null : 1,
      title:{it:'Tag', en:'Tags'}, text:{it:'Parole chiave separate da virgola, es. iva,fatture,2025. Servono per cercare; se vuoi si stampano sull\'etichetta (Stampa › Campi da stampare).', en:'Comma-separated keywords, e.g. vat,invoices,2025. Used for searching; optionally printed (Print › Fields to print).'} },
    { target:() => { const el = $('#ed-short_code'); return el && el.closest('.grid'); }, guard:() => edOpen() ? null : 1,
      title:{it:'Codice breve del QR', en:'QR short code'}, text:{it:'DocMap ha già creato un codice unico (dm26…): il QR punta a https://qr7.it/ + questo codice. Non serve cambiarlo; ↻ ne genera un altro.', en:'DocMap already made a unique code (dm26…): the QR points to https://qr7.it/ + this code. No need to change it; ↻ makes a new one.'} },
    { target:edField('final_destination'), guard:() => edOpen() ? null : 1,
      title:{it:'Destinazione finale', en:'Final destination'}, text:{it:'Dove porta il QR dopo qr7.it. Lascialo vuoto per usare il modello dello studio (Impostazioni › modello URL); scrivi un indirizzo solo per un caso particolare.', en:'Where the QR leads after qr7.it. Leave empty to use the studio template (Settings › URL template); type an address only for a special case.'} },
    { target:'#ed-preview', guard:() => edOpen() ? null : 1, title:{it:'Anteprima etichetta', en:'Label preview'}, text:{it:'Ecco come verrà l\'etichetta con il foglio e il contenuto scelti in Stampa etichette (predefinito: etichetta informazioni su MRINK143). Il QR punta già a https://qr7.it/', en:'This is how the label will look with the sheet and content chosen in Print labels (default: info label on MRINK143). The QR already points to https://qr7.it/'}, dyn:() => UI.ed ? UI.ed.d.short_code : '' },
    { target:() => { const m = topModal(); return m && m.querySelector('.modal-f .btn-primary'); }, guard:(c) => (edOpen() || S.binders.some(b => b.id === c.id)) ? null : 1,
      title:{it:'Salva', en:'Save'}, text:{it:'Clicca "Salva" (o Ctrl+S). Il faldone viene salvato e messo in coda di stampa.', en:'Click "Save" (or Ctrl+S). The binder is saved and queued for printing.'}, done:(c) => S.binders.some(b => b.id === c.id) && !UI.ed },
    { final:true, title:{it:'Faldone creato ✓', en:'Binder created ✓'}, text:{it:'Il faldone è nell\'archivio e già spuntato per la stampa. Vuoi stampare subito la sua etichetta?', en:'The binder is in the archive and already ticked for printing. Print its label now?'}, chain:'print' }
  ]},
  print: { pop:96, title:{it:'Stampa le etichette', en:'Print the labels'}, steps:[
    navStep('print', {it:'Apri Stampa etichette', en:'Open Print labels'}, {it:'Clicca "Stampa Etichette" in alto.', en:'Click "Print Labels" at the top.'}),
    ...prSteps(),
    { target:() => { const b = $('[data-a="qmode"]'); return b && b.parentElement; }, title:{it:'QR', en:'QR'}, text:{it:'QR vettoriale = stampato ora. Spazio riservato = lascia un quadrato bianco per un QR adesivo prestampato.', en:'Vector QR = printed now. Reserved space = leaves a white square for a pre-printed QR sticker.'} },
    { target:'#slotmap', title:{it:'Foglio già usato?', en:'Sheet already used?'}, text:{it:'Si trova in "Opzioni avanzate" (la guida l\'ha aperto). Se il foglio ha già etichette staccate, clicca quelle caselle: resteranno vuote. In blu le caselle che verranno stampate.', en:'It is in "Advanced options" (the guide opened it). If the sheet already has peeled labels, click those slots: they stay blank. Blue = slots that will be printed.'} },
    { target:'#pv-scroll', title:{it:'Anteprima millimetrica', en:'Millimetre preview'}, text:{it:'Questa è la pagina reale in scala. Controlla che sia tutto a posto.', en:'This is the real page to scale. Check that everything is right.'} },
    { target:'[data-a="print-labels"]', title:{it:'Stampa', en:'Print'}, text:{it:'Clicca "Stampa Etichette". Nel dialogo imposta Scala 100% (Dimensioni effettive) e Margini: Nessuno. In alternativa "Scarica PDF" crea il file da stampare altrove.', en:'Click "Print Labels". In the dialog set Scale 100% (Actual size) and Margins: None. Or "Download PDF" makes the file to print elsewhere.'}, advanceOn:'click' },
    { final:true, title:{it:'Stampa inviata ✓', en:'Print sent ✓'}, text:{it:'Se la stampa è riuscita conferma l\'aggiornamento della mappa del foglio. Prima volta con questo foglio? Fai la prova di calibrazione.', en:'If printing worked, confirm the sheet map update. First time with this sheet? Run the calibration test.'}, chain:'calib' }
  ]},
  pdf: { pop:84, title:{it:'Scarica il PDF delle etichette', en:'Download the labels as PDF'}, steps:[
    navStep('print', {it:'Apri Stampa etichette', en:'Open Print labels'}, {it:'Clicca "Stampa Etichette" in alto.', en:'Click "Print Labels" at the top.'}),
    ...prSteps(),
    { target:'#btn-pdf', title:{it:'Scarica PDF', en:'Download PDF'}, text:{it:'Clicca "Scarica PDF": ottieni un file A4 con le stesse etichette e misure della stampa, pronto per un altro PC o una chiavetta.', en:'Click "Download PDF": you get an A4 file with the same labels and sizes as printing, ready for another PC or a USB stick.'}, advanceOn:'click' },
    { final:true, title:{it:'PDF pronto ✓', en:'PDF ready ✓'}, text:{it:'Quando lo stampi scegli Scala 100% / "Dimensioni effettive" (mai "Adatta alla pagina") e Margini: Nessuno.', en:'When you print it choose Scale 100% / "Actual size" (never "Fit to page") and Margins: None.'} }
  ]},
  client: { pop:92, title:{it:'Crea un nuovo cliente', en:'Add a new client'}, steps:[
    navStep('info', {it:'Apri Informazioni', en:'Open Information'}, {it:'Clicca "Informazioni" nella barra in alto.', en:'Click "Information" in the top bar.'}),
    { target:'[data-a="info-tab"][data-v="clients"]', title:{it:'Sotto-scheda Clienti', en:'Clients sub-tab'}, text:{it:'Clicca "Clienti": è l\'anagrafica dello studio.', en:'Click "Clients": it is the studio client register.'}, done:() => S.view === 'info' && infoTab() === 'clients' },
    { target:'[data-a="cl-new"]', onEnter:(c) => { c.n = (S.clients || []).length; }, title:{it:'Nuovo cliente', en:'New client'}, text:{it:'Clicca "Nuovo cliente": si apre la scheda.', en:'Click "New client": the form opens.'}, done:() => clOpen() },
    { target:clField('name'), guard:() => clOpen() ? null : 2, title:{it:'Ragione sociale', en:'Company name'}, text:{it:'Scrivi la ragione sociale, ad esempio "APS Il Rosmarino". È l\'unico campo obbligatorio.', en:'Type the company name, e.g. "APS Il Rosmarino". It is the only required field.'},
      require:() => { const el = $('#cl-name'); return el && el.value.trim() ? null : {it:'Scrivi prima la ragione sociale.', en:'Type the company name first.'}; } },
    { target:clField('multi_code'), guard:() => clOpen() ? null : 2, title:{it:'Codice Multi', en:'Multi code'}, text:{it:'Facoltativo: il codice del cliente nel gestionale dello studio. Comparirà sui faldoni e sulle etichette.', en:'Optional: the client code in the studio software. It will show on binders and labels.'} },
    { target:clField('city', true), guard:() => clOpen() ? null : 2, title:{it:'Località e provincia', en:'Town and province'}, text:{it:'Facoltativi, es. Parma e PR: diventano il "Luogo ditta" dei faldoni.', en:'Optional, e.g. Parma and PR: they become the binders\' "Company place".'} },
    { target:clField('type', true), guard:() => clOpen() ? null : 2, title:{it:'Tipo e categoria', en:'Type and category'}, text:{it:'Facoltativi, es. ENC e APS: la categoria passa ai faldoni nuovi del cliente e ne decide il colore.', en:'Optional, e.g. ENC and APS: the category goes to the client\'s new binders and sets their colour.'} },
    { target:() => { const m = topModal(); return clOpen() && m && m.querySelector('.modal-f .btn-primary'); }, onEnter:(c) => { if (c.n == null) c.n = (S.clients || []).length; }, guard:(c) => (clOpen() || (S.clients || []).length > c.n) ? null : 2,
      title:{it:'Salva', en:'Save'}, text:{it:'Clicca "Salva": il cliente entra nell\'anagrafica.', en:'Click "Save": the client joins the register.'}, done:(c) => (S.clients || []).length > c.n && !clOpen() },
    { final:true, title:{it:'Cliente creato ✓', en:'Client created ✓'}, text:{it:'Nella sua riga il pulsante "Nuovo faldone" apre una scheda già compilata. Vuoi creare subito un faldone?', en:'The "New binder" button in its row opens a form already filled in. Create a binder now?'}, chain:'create' }
  ]},
  find: { pop:86, title:{it:'Trova un faldone e il suo scaffale', en:'Find a binder and its shelf'}, steps:[
    navStep('archive', {it:'Apri l\'Archivio', en:'Open the Archive'}, {it:'Clicca "Archivio" nella barra in alto.', en:'Click "Archive" in the top bar.'}),
    { target:() => { const i = $('#arch-results') && $('.card .toolbar input[data-bind="q"]'); return i && i.closest('.search'); }, title:{it:'Cerca', en:'Search'}, text:{it:'Scrivi il codice parlante, il cliente, il Codice Multi, un tag o una voce del contenuto: l\'elenco si filtra mentre scrivi.', en:'Type the speaking code, client, Multi code, a tag or a contents item: the list filters as you type.'},
      require:() => String(UI.q || '').trim() ? null : {it:'Scrivi qualcosa da cercare, ad esempio il nome del cliente.', en:'Type something to search, e.g. the client name.'} },
    { target:'#arch-results', title:{it:'Risultati', en:'Results'}, text:{it:'Ecco i faldoni trovati, con codice, cliente, posizione e contenuti. Puoi filtrare anche per stato, stanza e categoria.', en:'These are the binders found, with code, client, location and contents. You can also filter by state, room and category.'} },
    { target:() => $('#arch-results [data-a="locate"]'), title:{it:'Dov\'è?', en:'Where is it?'}, text:{it:'Premi il segnaposto del faldone: si apre lo schema dell\'armadio con il ripiano giusto evidenziato.', en:'Press the binder\'s pin: the cabinet schematic opens with the right shelf highlighted.'}, done:() => locOpen() },
    { target:() => { const m = topModal(); return locOpen() && m.querySelector('.modal'); }, guard:() => locOpen() ? null : 3, title:{it:'Schema e foto', en:'Schematic and photos'}, text:{it:'Ripiani dall\'alto in basso, settori SX/CX/DX e, se c\'è, la foto dell\'armadio con il segnaposto. Da qui puoi anche aggiungere foto o aprire la scheda con "Modifica".', en:'Shelves top to bottom, sectors SX/CX/DX and, if any, the cabinet photo with the pin. From here you can also add photos or open the form with "Edit".'} },
    { final:true, title:{it:'Faldone trovato ✓', en:'Binder found ✓'}, text:{it:'Chiudi la finestra quando hai finito. Con lo smartphone puoi anche inquadrare il QR dell\'etichetta.', en:'Close the window when done. With a phone you can also scan the label QR.'} }
  ]},
  edit: { pop:82, title:{it:'Modifica un faldone', en:'Edit a binder'}, steps:[
    navStep('archive', {it:'Apri l\'Archivio', en:'Open the Archive'}, {it:'Clicca "Archivio" nella barra in alto.', en:'Click "Archive" in the top bar.'}),
    { target:() => { const b = $('#arch-results [data-a="edit"]'); return b && b.closest('td'); }, title:{it:'Le azioni del faldone', en:'The binder actions'}, text:{it:'In ogni riga: Dov\'è? (segnaposto), Mostra QR, Modifica (matita), Duplica ed Elimina (cestino, chiede conferma e si può annullare).', en:'On each row: Where is it? (pin), Show QR, Edit (pencil), Duplicate and Delete (bin, asks first and can be undone).'} },
    { target:() => $('#arch-results [data-a="edit"]'), title:{it:'Modifica', en:'Edit'}, text:{it:'Clicca la matita: si apre la scheda del faldone.', en:'Click the pencil: the binder form opens.'}, done:() => !!(UI.ed && !UI.ed.isNew) },
    { target:() => { const m = topModal(); return edOpen() && m.querySelector('.modal-b'); }, guard:() => edOpen() ? null : 2, title:{it:'Cambia i campi', en:'Change the fields'}, text:{it:'Cambia quello che serve: cliente, titolo, posizione, contenuti, tag… L\'anteprima dell\'etichetta si aggiorna subito.', en:'Change what you need: client, title, location, contents, tags… The label preview updates at once.'} },
    { target:() => { const m = topModal(); return edOpen() && m.querySelector('.modal-f .btn-primary'); }, guard:(c) => (edOpen() || edSavedSince(c)) ? null : 2,
      onEnter:(c) => { if (UI.ed){ c.id = UI.ed.d.id; const b = S.binders.find(x => x.id === c.id); c.u = b ? b.updated_at : ''; } },
      title:{it:'Salva', en:'Save'}, text:{it:'Clicca "Salva" (o Ctrl+S). Se chiudi senza salvare, DocMap ti chiede prima.', en:'Click "Save" (or Ctrl+S). If you close without saving, DocMap asks first.'}, done:(c) => !UI.ed && edSavedSince(c) },
    { final:true, title:{it:'Faldone aggiornato ✓', en:'Binder updated ✓'}, text:{it:'La modifica è nel Registro attività. Se è cambiato qualcosa che si vede sull\'etichetta, ristampala.', en:'The change is in the Activity log. If something visible on the label changed, reprint it.'}, chain:'print' }
  ]},
  calib: { pop:52, title:{it:'Verifica il foglio con la prova di calibrazione', en:'Check the sheet with the calibration test'}, steps:[
    navStep('print', {it:'Apri Stampa etichette', en:'Open Print labels'}, {it:'Clicca "Stampa Etichette" in alto.', en:'Click "Print Labels" at the top.'}),
    { target:'.preset-list', title:{it:'Il foglio esatto', en:'The exact sheet'}, text:{it:'Seleziona il preset con lo stesso codice della confezione (es. L7163 = 14 etichette 99,1×38,1 mm).', en:'Select the preset with the same code as the box (e.g. L7163 = 14 labels 99.1×38.1 mm).'} },
    { target:'[data-a="pv-mode"][data-v="calib"]', title:{it:'Anteprima della prova', en:'Test preview'}, text:{it:'Clicca "Prova calibrazione" per vederla.', en:'Click "Calibration test" to see it.'}, done:() => S.print.previewMode === 'calib' },
    { target:'#pv-scroll', title:{it:'Cosa stampa', en:'What it prints'}, text:{it:'Solo linee grigio chiaro: croce al centro di ogni etichetta, angoli, "↑ ALTO / TOP" e coordinate in mm. In basso un righello di 50 mm per verificare la scala.', en:'Only light-grey lines: a cross in the centre of each label, corners, "↑ ALTO / TOP" and mm coordinates. At the bottom a 50 mm ruler to check scale.'} },
    { target:'[data-a="print-calib"]', title:{it:'Stampa la prova', en:'Print the test'}, text:{it:'Clicca e stampa su un foglio normale (Scala 100%, Margini Nessuno).', en:'Click and print on plain paper (Scale 100%, Margins None).'}, advanceOn:'click' },
    { target:'#geo-offsets', title:{it:'Correggi lo scostamento', en:'Correct the shift'}, text:{it:'In "Opzioni avanzate" (la guida l\'ha aperto). Sovrapponi la prova al foglio di etichette controluce. Se le croci sono spostate, ad esempio 1 mm a destra, imposta Offset X a −1. In basso = Offset Y negativo. Passi da 0,5 mm.', en:'In "Advanced options" (the guide opened it). Lay the test over the label sheet against the light. If crosses are shifted, e.g. 1 mm right, set Offset X to −1. Lower = negative Offset Y. 0.5 mm steps.'} },
    { final:true, title:{it:'Calibrazione pronta ✓', en:'Calibration ready ✓'}, text:{it:'Gli offset sono salvati e valgono per tutte le stampe e per il PDF. Ora puoi stampare le etichette vere con certezza.', en:'Offsets are saved and apply to every print and to the PDF. Now print the real labels with confidence.'}, chain:'print' }
  ]},
  partial: { pop:54, title:{it:'Riusa un foglio di etichette già iniziato', en:'Reuse a partly used label sheet'}, steps:[
    navStep('print', {it:'Apri Stampa etichette', en:'Open Print labels'}, {it:'Clicca "Stampa Etichette" in alto.', en:'Click "Print Labels" at the top.'}),
    { target:'#slotmap', title:{it:'Segna le caselle staccate', en:'Mark the peeled slots'}, text:{it:'In "Opzioni avanzate" (la guida l\'ha aperto). Clicca le caselle che sul tuo foglio mancano già. Diventano grigie barrate.', en:'In "Advanced options" (the guide opened it). Click the slots already missing on your sheet. They turn grey and struck through.'},
      require:() => usedSet().size ? null : {it:'Clicca almeno una casella già usata.', en:'Click at least one used slot.'} },
    { target:'#pv-scroll', title:{it:'Risultato', en:'Result'}, text:{it:'Nell\'anteprima le caselle usate sono vuote e la stampa parte dalla prima libera.', en:'In the preview used slots are blank and printing starts from the first free one.'} },
    { final:true, title:{it:'Foglio recuperato ✓', en:'Sheet recovered ✓'}, text:{it:'La mappa resta salvata per questo tipo di foglio. Dopo ogni stampa DocMap propone di aggiornarla.', en:'The map stays saved for this sheet type. After each print DocMap offers to update it.'} }
  ]},
  manifest: { pop:46, title:{it:'Esporta il manifest per qr7.it', en:'Export the qr7.it manifest'}, steps:[
    navStep('export', {it:'Apri Esporta e Salva', en:'Open Export & Save'}, {it:'Clicca "Esporta e Salva".', en:'Click "Export & Save".'}),
    { target:'[data-a="ex-manifest"]', title:{it:'Scarica il manifest', en:'Download the manifest'}, text:{it:'Clicca: scarichi manifest_qr7_dm26.csv con le sole righe DocMap (short_code;short_url;final_destination;tags).', en:'Click: you download manifest_qr7_dm26.csv with DocMap rows only (short_code;short_url;final_destination;tags).'}, advanceOn:'click' },
    { target:'[data-a="ex-merge"]', title:{it:'Oppure unisci al manifest del server', en:'Or merge into the server manifest'}, text:{it:'Se sul server c\'è già un manifest.csv con altri link, caricalo qui: DocMap conserva tutte le righe esistenti e aggiunge/aggiorna le dm26 in fondo.', en:'If the server already has a manifest.csv with other links, upload it here: DocMap keeps all existing rows and appends/updates the dm26 ones.'} },
    { final:true, title:{it:'Manifest pronto ✓', en:'Manifest ready ✓'}, text:{it:'Carica il file su qr7.it. Da quel momento ogni QR stampato reindirizza alla sua destinazione finale.', en:'Upload the file to qr7.it. From then on every printed QR redirects to its final destination.'} }
  ]},
  ai: { pop:20, title:{it:'Genera i faldoni con l\'AI', en:'Generate binders with AI'}, steps:[
    navStep('ai', {it:'Apri Genera con AI', en:'Open Generate with AI'}, {it:'Clicca "Genera con AI".', en:'Click "Generate with AI".'}),
    { target:'[data-a="ai-copy"]', title:{it:'Copia il prompt', en:'Copy the prompt'}, text:{it:'Clicca: il prompt completo con lo schema CSV va negli appunti.', en:'Click: the full prompt with the CSV schema goes to the clipboard.'}, advanceOn:'click' },
    { target:'#ai-prompt', title:{it:'Incollalo nell\'AI', en:'Paste it into the AI'}, text:{it:'Incollalo in ChatGPT, Claude o Gemini. In fondo scrivi i tuoi clienti e documenti o allega le foto degli scaffali. L\'AI risponderà con un blocco CSV: copialo.', en:'Paste it into ChatGPT, Claude or Gemini. At the bottom write your clients and documents or attach shelf photos. The AI replies with a CSV block: copy it.'} },
    navStep('import', {it:'Apri Importa', en:'Open Import'}, {it:'Clicca "Importa".', en:'Click "Import".'}),
    { target:'#im-text', title:{it:'Incolla la risposta', en:'Paste the reply'}, text:{it:'Incolla qui il CSV dell\'AI. Non hai ancora la risposta? Usa l\'esempio per provare.', en:'Paste the AI CSV here. No reply yet? Use the sample to try.'}, extra:sampleImport,
      require:() => { const el = $('#im-text'); return el && el.value.trim().length > 20 ? null : {it:'Incolla prima il testo CSV.', en:'Paste the CSV text first.'}; } },
    { target:'[data-a="im-analyze"]', title:{it:'Analizza', en:'Analyse'}, text:{it:'Clicca "Analizza e mostra anteprima".', en:'Click "Analyse and preview".'}, done:() => !!(UI.importParsed && UI.importParsed.rows) },
    { target:'#im-preview', title:{it:'Controlla l\'anteprima', en:'Check the preview'}, text:{it:'NUOVO = verrà aggiunto, AGGIORNA = esiste già quel codice parlante. Le note spiegano cosa ha completato DocMap (codici dm26, codici parlanti).', en:'NEW = will be added, UPDATE = that speaking code exists. Notes explain what DocMap filled in (dm26 codes, speaking codes).'} },
    { target:'[data-a="im-merge"]', title:{it:'Importa', en:'Import'}, text:{it:'Clicca "Aggiungi e Aggiorna": nessun dato esistente viene perso.', en:'Click "Add & Update": no existing data is lost.'}, done:() => UI.importParsed === null && S.view === 'archive' },
    { final:true, title:{it:'Importazione fatta ✓', en:'Import done ✓'}, text:{it:'I nuovi faldoni sono in Archivio, già in coda di stampa.', en:'The new binders are in Archive, already queued for printing.'}, chain:'print' }
  ]},
  session: { pop:18, title:{it:'Salva una sessione nel database', en:'Save a session in the database'}, steps:[
    navStep('database', {it:'Apri Database', en:'Open Database'}, {it:'Clicca "Database".', en:'Click "Database".'}),
    { target:'#db-status', title:{it:'Il database locale', en:'The local database'}, text:{it:'SQLite gira nel browser, senza server. Le tabelle si aggiornano da sole a ogni modifica.', en:'SQLite runs in the browser, no server. Tables update on every change.'}, require:() => DB.ready ? null : {it:'Attendi l\'avvio del motore SQLite.', en:'Wait for the SQLite engine to start.'} },
    { target:() => { const el = $('#db-session-name'); return el && el.closest('.grid'); }, title:{it:'Dai un nome', en:'Give it a name'}, text:{it:'Scrivi un nome riconoscibile, ad esempio "Inventario stanza A — novembre".', en:'Type a recognisable name, e.g. "Room A inventory — November".'},
      require:() => { const el = $('#db-session-name'); return el && el.value.trim() ? null : {it:'Scrivi il nome della sessione.', en:'Type the session name.'}; } },
    { target:'[data-a="db-save-session"]', onEnter:(c) => { c.n = dbSessions().length; }, title:{it:'Salva', en:'Save'}, text:{it:'Clicca "Salva sessione nel database".', en:'Click "Save session to database".'}, done:(c) => dbSessions().length > c.n },
    { target:'#db-sessions', title:{it:'Le tue sessioni', en:'Your sessions'}, text:{it:'Da qui ripristini una sessione quando vuoi (chiede conferma) o la scarichi in JSON.', en:'From here you restore a session any time (asks for confirmation) or download it as JSON.'} },
    { target:'.page-h [data-a="db-download"]', title:{it:'Scarica il file .sqlite', en:'Download the .sqlite file'}, text:{it:'Clicca per scaricare docmap.sqlite: contiene tabelle e sessioni. Conservalo come archivio.', en:'Click to download docmap.sqlite: it holds tables and sessions. Keep it as an archive.'}, advanceOn:'click' },
    { final:true, title:{it:'Sessione salvata ✓', en:'Session saved ✓'}, text:{it:'Su Chrome/Edge puoi anche collegare un file sul disco per il salvataggio automatico.', en:'On Chrome/Edge you can also link a file on disk for automatic saving.'} }
  ]},
  backup: { pop:80, title:{it:'Fai il backup completo dei dati', en:'Make a full backup of your data'}, steps:[
    { target:'.top-right .status', title:{it:'Il semaforo dei dati', en:'The data indicator'}, text:{it:'"Esportato" (verde) = tutto scaricato. "Da esportare" (arancione) = ci sono modifiche salvate solo nel browser: il pulsante "Salva backup" lì accanto (o Ctrl+S) le scarica subito.', en:'"Exported" (green) = everything downloaded. "Not exported" (amber) = changes saved only in the browser: the "Save backup" button next to it (or Ctrl+S) downloads them at once.'} },
    navStep('export', {it:'Apri Esporta e Salva', en:'Open Export & Save'}, {it:'Clicca "Esporta e Salva".', en:'Click "Export & Save".'}),
    { target:'[data-a="ex-json"]', title:{it:'Sessione completa JSON', en:'Full session JSON'}, text:{it:'Clicca: scarichi docmap_workspace.json, copia integrale di tutto. Si reimporta da Importa o Impostazioni.', en:'Click: you download docmap_workspace.json, a full copy of everything. Re-import it from Import or Settings.'}, advanceOn:'click' },
    { final:true, title:{it:'Backup fatto ✓', en:'Backup done ✓'}, text:{it:'Il semaforo è tornato verde. Per un archivio a lungo termine scarica anche il file .sqlite dalla schermata Database.', en:'The indicator is green again. For long-term archiving also download the .sqlite file from Database.'}, chain:'session' }
  ]},
  import: { pop:88, title:{it:'Importa un elenco di faldoni (CSV o JSON)', en:'Import a list of binders (CSV or JSON)'}, steps:[
    navStep('import', {it:'Apri Importa', en:'Open Import'}, {it:'Clicca "Importa".', en:'Click "Import".'}),
    { target:'#dropzone', noAutoClick:true, title:{it:'Carica un file…', en:'Upload a file…'}, text:{it:'Trascina qui un .csv, .xlsx o .json, oppure clicca il riquadro per sceglierlo. Se preferisci incollare il testo premi Avanti.', en:'Drop a .csv, .xlsx or .json here, or click the box to choose it. To paste text instead press Next.'}, done:() => !!(UI.importParsed && UI.importParsed.rows) },
    { target:'#im-text', title:{it:'…oppure incolla il testo', en:'…or paste the text'}, text:{it:'Incolla il CSV o il JSON. Puoi provare con l\'esempio.', en:'Paste CSV or JSON. You can try the sample.'}, extra:sampleImport,
      skipIf:() => !!(UI.importParsed && UI.importParsed.rows),
      require:() => { const el = $('#im-text'); return el && el.value.trim().length > 20 ? null : {it:'Incolla prima il testo.', en:'Paste the text first.'}; } },
    { target:'[data-a="im-analyze"]', skipIf:() => !!(UI.importParsed && UI.importParsed.rows), title:{it:'Analizza', en:'Analyse'}, text:{it:'Clicca "Analizza e mostra anteprima".', en:'Click "Analyse and preview".'}, done:() => !!(UI.importParsed && UI.importParsed.rows) },
    { target:'#im-preview', title:{it:'Anteprima', en:'Preview'}, text:{it:'Controlla le righe. Poi scegli: Aggiungi e Aggiorna (sicuro) o Sostituisci Tutto (chiede conferma).', en:'Check the rows. Then choose: Add & Update (safe) or Replace All (asks for confirmation).'} },
    { target:'[data-a="im-merge"]', title:{it:'Importa', en:'Import'}, text:{it:'Clicca "Aggiungi e Aggiorna".', en:'Click "Add & Update".'}, done:() => UI.importParsed === null && S.view === 'archive' },
    { final:true, title:{it:'Importazione fatta ✓', en:'Import done ✓'}, text:{it:'I faldoni sono in Archivio, già in coda di stampa. Subito dopo compare "Annulla" se vuoi tornare indietro.', en:'The binders are in Archive, already queued for printing. "Undo" appears right after if you want to go back.'} }
  ]},
  register: { pop:34, title:{it:'Stampa il Registro generale', en:'Print the Master Register'}, steps:[
    navStep('export', {it:'Apri Esporta e Salva', en:'Open Export & Save'}, {it:'Clicca "Esporta e Salva".', en:'Click "Export & Save".'}),
    { target:'[data-a="ex-register"]', title:{it:'Apri il registro', en:'Open the register'}, text:{it:'Clicca "Apri Registro e Stampa".', en:'Click "Open Register & Print".'}, advanceOn:'click' },
    { final:true, title:{it:'Registro aperto ✓', en:'Register open ✓'}, text:{it:'Premi "Stampa Registro". Per un PDF scegli "Salva come PDF" nel dialogo di stampa.', en:'Press "Print Register". For a PDF choose "Save as PDF" in the print dialog.'} }
  ]}
};

const G = { id:null, g:null, i:0, ctx:{}, msg:'', raf:0, advancing:false, lastKey:'', els:null, lastScrollEl:null, confirm:false, outsideAt:0, missSince:0, tabbed:false };
function guideStep(){ return G.g && G.g.steps[G.i]; }
function guideResolve(target, noOpen){
  if (!target) return null;
  let el = null;
  try { el = typeof target === 'function' ? target() : $(target); } catch(e){ el = null; }
  if (!el || !el.getBoundingClientRect) return null;
  // a target inside a closed <details> (e.g. print "Advanced options", the ⚙ menu) is opened first
  const d = el.closest && el.closest('details:not([open])');
  if (d){ if (!noOpen) d.open = true; return null; }
  const r = el.getBoundingClientRect();
  return (r.width || r.height) ? el : null;
}
/* the view a step lives in: the most recent nav step before it */
function guideViewAt(g, i){
  for (let k = i; k >= 0; k--){ const s = g.steps[k]; if (typeof s.target === 'string'){ const m = s.target.match(/^\.nav \[data-v="(\w+)"\]/); if (m) return m[1]; } }
  return null;
}
function guideViewFor(){ return G.g ? guideViewAt(G.g, G.i) : null; }

/* ---------- resume point (per operator / per PC, in the help store of 07-help) ---------- */
function guideResumeInfo(){
  const r = helpStore().resume[helpWho()];
  if (!r || !GUIDES[r.id] || !(r.i > 0) || r.i >= GUIDES[r.id].steps.length - 1) return null;
  return r;
}
function guideRemember(){ if (!G.g) return; const st = guideStep(); if (st.final || G.i === 0) return; helpStore().resume[helpWho()] = {id:G.id, i:G.i, at:nowISO()}; helpSave(); }
function guideForget(){ const s = helpStore(); if (s.resume[helpWho()]){ delete s.resume[helpWho()]; helpSave(); } }

function guideStart(id, at){
  if (!GUIDES[id]) return;
  if (HELP.open) helpClose();
  guideStop(true);
  G.id = id; G.g = GUIDES[id]; G.ctx = {}; G.msg = ''; G.confirm = false; G.outsideAt = 0;
  helpUse('g:' + id);
  const root = $('#guide-root');
  root.innerHTML = '<div class="g-mask" data-m="t"></div><div class="g-mask" data-m="b"></div><div class="g-mask" data-m="l"></div><div class="g-mask" data-m="r"></div><div class="g-ring"></div>' +
    '<div class="g-card" role="dialog" aria-modal="false" aria-labelledby="g-h"></div><div class="sr-only" id="g-live" role="status" aria-live="polite"></div><div class="g-confirm-root"></div>';
  G.els = { masks:$$('.g-mask', root), ring:$('.g-ring', root), card:$('.g-card', root), live:$('#g-live', root), confirm:$('.g-confirm-root', root) };
  G.els.masks.forEach(m => {
    m.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); guideOutside(e.clientX, e.clientY); });
    m.addEventListener('wheel', (e) => { const ov = topModal(); (ov || document.scrollingElement).scrollBy(0, e.deltaY); e.preventDefault(); }, {passive:false});
  });
  document.body.classList.add('guide-on');
  let i = Math.max(0, Math.min(+at || 0, G.g.steps.length - 1));
  if (i > 0){ const v = guideViewAt(G.g, i); if (v && S.view !== v){ S.view = v; savePrefs(); renderAll(); } }
  else guideForget();
  guideEnter(i);
  const loop = () => { guideTick(); G.raf = requestAnimationFrame(loop); };
  G.raf = requestAnimationFrame(loop);
}
/* programmatic stop (no question asked): used by guideStart, the final "Termina" and the tests */
function guideStop(silent){
  cancelAnimationFrame(G.raf);
  $('#guide-root').innerHTML = '';
  document.body.classList.remove('guide-on');
  G.id = null; G.g = null; G.els = null; G.confirm = false;
}
function guideFinish(){ guideForget(); guideStop(); }
/* every user way out (Esc, ✕, second click outside) goes through the question */
function guideAskExit(){
  if (!G.g) return;
  const st = guideStep();
  if (st && st.final){ guideFinish(); return; }
  if (G.confirm) return;
  G.confirm = true;
  G.els.confirm.innerHTML = '<div class="g-confirm-back"></div><div class="g-confirm" role="alertdialog" aria-modal="true" aria-labelledby="g-cf-t" aria-describedby="g-cf-d">' +
    '<h4 id="g-cf-t">' + esc(t('g_exit_t')) + '</h4><p id="g-cf-d">' + esc(t('g_exit_d')) + '</p>' +
    '<div class="g-actions"><button class="btn" data-a="guide-quit">' + esc(t('g_exit_ok')) + '</button><span style="flex:1"></span><button class="btn btn-primary" data-a="guide-stay">' + esc(t('g_exit_no')) + ' →</button></div></div>';
  const back = $('.g-confirm-back', G.els.confirm);
  back.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });   // clicking around the question = keep going
  G.els.live.textContent = t('g_exit_t');
  setTimeout(() => { const b = G.els && $('[data-a="guide-stay"]', G.els.confirm); if (b) b.focus(); }, 20);
}
function guideStay(){
  if (!G.els) return;
  G.confirm = false; G.els.confirm.innerHTML = '';
  const b = $('.g-actions .btn-primary', G.els.card); if (b) b.focus();
}
function guideQuit(){
  if (!G.g) return;
  const n = G.i + 1, keep = G.i > 0 && !guideStep().final;
  if (keep) guideRemember(); else guideForget();
  guideStop();
  if (keep) toast(t('g_left', {n}), 'info', 7000, {label:t('g_resume'), fn:() => guideResume()});
}
function guideResume(){ const r = guideResumeInfo(); if (r) guideStart(r.id, r.i); }
/* A click on the dimmed page: on the element of another step of this guide → go to that step;
   otherwise a reminder, and a second click within 4 s asks whether to leave. */
function guideOutside(x, y){
  if (!G.els || G.confirm) return;
  if (guideJumpAt(x, y)) return;
  const now = Date.now();
  if (G.outsideAt && now - G.outsideAt < 4000){ G.outsideAt = 0; guideAskExit(); return; }
  G.outsideAt = now;
  guideNudge(t('g_outside'));
}
function guideEnter(i, msg, dir){
  const steps = G.g.steps;
  if (dir < 0){ while (i > 0 && steps[i].skipIf && steps[i].skipIf(G.ctx)) i--; }
  else while (i < steps.length - 1 && steps[i].skipIf && steps[i].skipIf(G.ctx)) i++;
  G.i = i; G.msg = msg || ''; G.advancing = false; G.lastScrollEl = null; G.soft = -1; G.missSince = 0;
  const st = guideStep();
  if (st.onEnter) st.onEnter(G.ctx);
  if (st.final) guideForget(); else guideRemember();
  guideRenderCard(true);
}
/* Next always works: a missing recommended value only warns once (a second click goes on);
   on an "action" step Next performs the highlighted action (e.g. opens the form, navigates). */
function guideNext(){
  const st = guideStep(); if (!st || st.final) return;
  if (st.require && G.soft !== G.i){ const m = st.require(G.ctx); if (m){ G.soft = G.i; guideNudge(L(m) + ' ' + t('g_anyway')); return; } }
  if (st.done && !st.done(G.ctx) && !st.noAutoClick){
    const el = guideResolve(st.target) || guideResolve(st.target);   // the first call may only open a closed menu/<details>
    const btn = el && (el.matches('[data-a]') ? el : null);
    if (btn && !btn.disabled && (!topModal() || topModal().contains(btn))){ btn.click(); return; }
  }
  if (G.i < G.g.steps.length - 1) guideEnter(G.i + 1);
}
function guideBack(){ if (G.g && G.i > 0) guideEnter(G.i - 1, '', -1); }
/* If (x, y) hits the element of another step of this guide, go to that step and let the click reach the field.
   Nav-bar steps are not jump targets (leaving the view is "outside"); steps whose guard fails are skipped. */
function guideJumpAt(x, y){
  if (!G.els) return false;
  G.els.masks.forEach(m => m.style.pointerEvents = 'none'); G.els.ring.style.pointerEvents = 'none';
  const hit = document.elementFromPoint(x, y);
  G.els.masks.forEach(m => m.style.pointerEvents = ''); G.els.ring.style.pointerEvents = '';
  if (!hit || hit.closest('#guide-root')) return false;
  const steps = G.g.steps, modal = topModal();
  let best = -1, bestEl = null;
  for (let k = 0; k < steps.length; k++){
    const s = steps[k];
    if (k === G.i || s.final || !s.target) continue;
    if (typeof s.target === 'string' && s.target.indexOf('.nav') === 0) continue;
    if (s.guard){ let g = null; try { g = s.guard(G.ctx); } catch(e){ g = 0; } if (g !== null && g !== undefined) continue; }
    const el = guideResolve(s.target, true);
    if (!el || !el.contains(hit) || (modal && !modal.contains(el))) continue;
    if (!bestEl || bestEl.contains(el)){ best = k; bestEl = el; }   // the innermost matching element wins
  }
  if (best < 0) return false;
  guideEnter(best, t('g_jump'));
  setTimeout(() => {
    const f = hit.closest('input,textarea,select,button,[tabindex]') || bestEl.querySelector('input,textarea,select');
    if (!f) return;
    f.focus();
    if (f.tagName === 'BUTTON' || f.type === 'checkbox' || f.type === 'radio') f.click();
  }, 30);
  return true;
}
function guideNudge(msg){
  if (!G.els) return;
  G.msg = msg; guideRenderCard();
  G.els.live.textContent = msg;
  const c = G.els.card; c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
}
function guideRenderCard(announce){
  if (!G.els) return;
  const st = guideStep(), n = G.g.steps.length;
  const hadFocus = G.els.card.contains(document.activeElement) || document.activeElement === document.body || !document.activeElement;
  const dots = G.g.steps.map((s, k) => '<button class="g-dot ' + (k < G.i ? 'done' : k === G.i ? 'cur' : '') + '" data-a="guide-dot" data-i="' + k + '" aria-label="' + esc(t('g_step', {n:k + 1, t:n}) + ': ' + L(s.title)) + '"' + (k === G.i ? ' aria-current="step"' : '') + '></button>').join('');
  const chain = st.chain && GUIDES[st.chain];
  G.els.card.innerHTML = '<div class="g-top"><span class="g-kicker">' + ic('sparkles') + esc(L(G.g.title)) + '</span><button class="icon-btn" data-a="guide-close" title="' + esc(t('g_close')) + ' (Esc)" aria-label="' + esc(t('g_close')) + '">' + ic('x') + '</button></div>' +
    '<div class="g-dots">' + dots + '<span class="g-count">' + esc(t('g_step', {n:G.i + 1, t:n})) + '</span></div>' +
    '<h4 id="g-h">' + esc(L(st.title)) + '</h4><p>' + esc(L(st.text)) + (st.dyn ? '<span class="mono">' + esc(st.dyn()) + '</span>' : '') + '</p>' +
    '<div class="g-hint" id="g-hint"></div>' +
    (G.msg ? '<div class="g-msg">' + ic('alert') + '<span>' + esc(G.msg) + '</span></div>' : '') +
    '<div class="g-actions">' +
      (G.i > 0 && !st.final ? '<button class="btn btn-sm btn-ghost" data-a="guide-back">← ' + esc(t('g_back')) + '</button>' : '<span></span>') +
      '<span style="flex:1"></span>' +
      (st.extra ? '<button class="btn btn-sm" data-a="guide-extra">' + esc(t(st.extra.label)) + '</button>' : '') +
      (st.final ? (chain ? '<button class="btn btn-sm" data-a="guide-chain" data-id="' + st.chain + '">' + esc(t('g_continue', {g:L(chain.title)})) + '</button>' : '') + '<button class="btn btn-sm btn-primary" data-a="guide-finish">' + ic('check') + esc(t('g_finish')) + '</button>'
        : '<button class="btn btn-sm btn-primary" data-a="guide-next"' + ((st.done || st.advanceOn) ? ' title="' + esc(t('g_auto')) + '"' : '') + '>' + esc(t('g_next')) + ' →</button>') +
    '</div><div class="g-keys">' + esc(t('g_keys')) + '</div>';
  G.lastKey = '';
  if (announce) G.els.live.textContent = t('g_step', {n:G.i + 1, t:n}) + '. ' + L(st.title) + '. ' + L(st.text);
  if (hadFocus && !G.confirm){ const b = $('.g-actions .btn-primary', G.els.card); if (b) b.focus({preventScroll:true}); }
}
function guideTick(){
  const st = guideStep(); if (!st || !G.els) return;
  if (st.guard && !G.confirm){ const back = st.guard(G.ctx); if (back !== null && back !== undefined && back !== G.i){ guideEnter(back, t('g_reopen')); return; } }
  const el = st.final ? null : guideResolve(st.target);
  const modal = topModal();
  const blockedByModal = modal && el && !modal.contains(el);
  const free = st.final || !el || blockedByModal;
  const hint = $('#g-hint', G.els.card);
  let hintTxt = '';
  if (!st.final && !el){
    const v = (typeof st.target === 'string' && st.target.indexOf('.nav') === 0) ? null : guideViewFor();
    if (v && S.view !== v) hintTxt = '<button class="btn btn-sm btn-dark" data-a="guide-goview" data-v="' + v + '">' + esc(t('g_goto', {v:t(VIEW_LABEL[v] || 'nav_' + v)})) + '</button>';
    else {
      // graceful skip: the target is not on screen (and no view to go to) → say so; Next skips the step
      if (!G.missSince) G.missSince = Date.now();
      if (Date.now() - G.missSince > 900 && !modal) hintTxt = '<span class="tiny g-miss">' + esc(t('g_missing')) + '</span>';
    }
  } else { G.missSince = 0; if (blockedByModal) hintTxt = '<span class="tiny">' + esc(t('g_modal')) + '</span>'; }
  if (hint && hint.dataset.k !== hintTxt){ hint.innerHTML = hintTxt; hint.dataset.k = hintTxt; }
  const vw = window.innerWidth, vh = window.innerHeight, [mt, mb, ml, mr] = G.els.masks;
  if (free){
    G.els.masks.forEach(m => m.style.display = 'none'); G.els.ring.style.display = 'none';
  } else {
    if (G.lastScrollEl !== el){ G.lastScrollEl = el; const r0 = el.getBoundingClientRect(); if (r0.top < 70 || r0.bottom > vh - 20) el.scrollIntoView({block:'center', behavior:'smooth'}); }
    const r = el.getBoundingClientRect(), p = 6;
    const x1 = Math.max(0, r.left - p), y1 = Math.max(0, r.top - p), x2 = Math.min(vw, r.right + p), y2 = Math.min(vh, r.bottom + p);
    const set = (m, l, tp, w, h) => { m.style.display = 'block'; m.style.left = l + 'px'; m.style.top = tp + 'px'; m.style.width = Math.max(0, w) + 'px'; m.style.height = Math.max(0, h) + 'px'; };
    set(mt, 0, 0, vw, y1); set(mb, 0, y2, vw, vh - y2); set(ml, 0, y1, x1, y2 - y1); set(mr, x2, y1, vw - x2, y2 - y1);
    const ring = G.els.ring; ring.style.display = 'block'; ring.style.left = x1 + 'px'; ring.style.top = y1 + 'px'; ring.style.width = (x2 - x1) + 'px'; ring.style.height = (y2 - y1) + 'px';
  }
  // card placement
  const c = G.els.card, cw = c.offsetWidth, ch = c.offsetHeight, gap = 14;
  let x, y;
  if (free || !el){ x = vw - cw - 20; y = vh - ch - 20; }
  else {
    const r = el.getBoundingClientRect();
    if (r.right + gap + cw < vw - 10){ x = r.right + gap; y = r.top; }
    else if (r.bottom + gap + ch < vh - 10){ x = r.left; y = r.bottom + gap; }
    else if (r.top - gap - ch > 10){ x = r.left; y = r.top - gap - ch; }
    else if (r.left - gap - cw > 10){ x = r.left - gap - cw; y = r.top; }
    else { x = vw - cw - 20; y = vh - ch - 20; }
  }
  x = Math.max(10, Math.min(vw - cw - 10, x)); y = Math.max(10, Math.min(vh - ch - 10, y));
  const key = Math.round(x) + ',' + Math.round(y);
  if (key !== G.lastKey){ c.style.left = Math.round(x) + 'px'; c.style.top = Math.round(y) + 'px'; G.lastKey = key; }
  // completion
  if (!G.advancing && !G.confirm && st.done && st.done(G.ctx)){
    G.advancing = true;
    setTimeout(() => { if (G.g && guideStep() === st) guideEnter(Math.min(G.i + 1, G.g.steps.length - 1)); }, 350);
  }
}
/* advanceOn:'click' — advance after the real click on the spotlighted element has run */
document.addEventListener('click', (e) => {
  const st = guideStep(); if (!st || st.advanceOn !== 'click' || G.confirm) return;
  const el = guideResolve(st.target);
  if (el && el.contains(e.target)){ const i = G.i; setTimeout(() => { if (G.g && G.i === i) guideEnter(i + 1); }, 120); }
}, true);

/* Keyboard while a guide is on (window capture: runs before the app's document handlers).
   Esc asks (or answers "continue" when the question is open); Enter / → next and ← back when the focus
   is not in a field; Esc that closes a typeahead list, the "one line per item" box or the ⚙ menu is left to them. */
const guideEditable = (el) => !!(el && el.closest && el.closest('input,textarea,select,[contenteditable="true"]'));
window.addEventListener('keydown', (e) => {
  if (!G.g) return;
  const tg = e.target, inCard = G.els && G.els.card.contains(tg), inConfirm = G.els && G.els.confirm.contains(tg);
  if (e.key === 'Escape'){
    if (G.confirm){ e.preventDefault(); e.stopImmediatePropagation(); guideStay(); return; }
    if (tg && tg.id === 'ed-lines') return;
    if (tg && tg._ta && typeof taIsOpen === 'function' && taIsOpen(tg)) return;
    const menu = $('#nav-more'); if (menu && menu.open && menu.contains(tg)) return;
    e.preventDefault(); e.stopImmediatePropagation(); guideAskExit(); return;
  }
  if (G.confirm){
    if (e.key === 'Tab'){ const bs = $$('button', G.els.confirm); if (bs.length){ e.preventDefault(); const j = bs.indexOf(document.activeElement); bs[(j + (e.shiftKey ? bs.length - 1 : 1)) % bs.length].focus(); } }
    else if (!inConfirm && e.key !== 'Enter'){ e.preventDefault(); e.stopImmediatePropagation(); }
    return;
  }
  if (e.key === 'Tab'){ G.tabbed = true; return; }
  if (e.ctrlKey || e.metaKey || e.altKey || guideEditable(tg)) return;
  const free = !tg || tg === document.body || tg === document.documentElement || inCard;
  if (!free || (topModal() && topModal().contains(tg))) return;
  const onButton = tg && tg.closest && tg.closest('button,a,summary');
  if ((e.key === 'ArrowRight' || (e.key === 'Enter' && !onButton)) && !guideStep().final){ e.preventDefault(); e.stopImmediatePropagation(); guideNext(); }
  else if (e.key === 'Enter' && !onButton && guideStep().final){ e.preventDefault(); e.stopImmediatePropagation(); guideFinish(); }
  else if (e.key === 'ArrowLeft'){ e.preventDefault(); e.stopImmediatePropagation(); guideBack(); }
}, true);
/* Tab must not walk into the dimmed page: focus that lands outside the spotlight, the card and the open
   question goes back to the card (programmatic focus, e.g. a form opening on its first field, is left alone). */
document.addEventListener('focusin', (e) => {
  if (!G.g || !G.els || !G.tabbed) return;
  G.tabbed = false;
  const tg = e.target; if (!tg || G.els.card.contains(tg) || G.els.confirm.contains(tg)) return;
  if (G.confirm){ const b = $('[data-a="guide-stay"]', G.els.confirm); if (b) b.focus(); return; }
  const st = guideStep(), el = st.final ? null : guideResolve(st.target, true);
  if (!el) return;   // free step: the whole page is usable
  if (el.contains(tg) || (topModal() && topModal().contains(el) && topModal().contains(tg))) return;
  const b = $('.g-actions .btn-primary', G.els.card); if (b) b.focus();
});

const GUIDE_ACTIONS = {
  'guide-close': () => guideAskExit(),
  'guide-quit': () => guideQuit(),
  'guide-stay': () => guideStay(),
  'guide-finish': () => guideFinish(),
  'guide-next': () => guideNext(),
  'guide-back': () => guideBack(),
  'guide-resume': () => guideResume(),
  'guide-forget': () => { guideForget(); if (HELP.open) renderHelp(); }
};
document.addEventListener('DOMContentLoaded', () => { if (typeof ACTIONS !== 'undefined') Object.assign(ACTIONS, GUIDE_ACTIONS); });
