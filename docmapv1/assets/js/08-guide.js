/* =====================================================================
   DocMap 2026 — Guided actions engine
   Not a passive tour: the user performs the real action. Each step
   spotlights one element, blocks clicks elsewhere (with a gentle reminder),
   validates required fields before moving on, follows the element when the
   page scrolls or the view changes, and closing the guide never closes the
   form being filled.
   ===================================================================== */
Object.assign(I18N.it, {
  g_step:'Passo {n} di {t}', g_next:'Avanti', g_back:'Indietro', g_close:'Chiudi guida', g_done:'Fatto', g_finish:'Termina',
  g_outside:'La guida è ancora attiva: completa l\'elemento evidenziato oppure chiudi la guida.', g_future:'Completa prima i passi precedenti.',
  g_auto:'Il passo avanza da solo quando hai fatto l\'azione.', g_modal:'Rispondi alla finestra aperta, poi la guida riprende.', g_goto:'Vai a {v}', g_wrongview:'Questo passo si trova in "{v}".',
  g_sample:'Usa un esempio', g_continue:'Continua: {g}', g_reopen:'Hai chiuso la scheda: la riapro dal passo giusto.'
});
Object.assign(I18N.en, {
  g_step:'Step {n} of {t}', g_next:'Next', g_back:'Back', g_close:'Close guide', g_done:'Done', g_finish:'Finish',
  g_outside:'The guide is still active: complete the highlighted element or close the guide.', g_future:'Complete the previous steps first.',
  g_auto:'This step moves on by itself once you have done the action.', g_modal:'Answer the open window, then the guide resumes.', g_goto:'Go to {v}', g_wrongview:'This step is in "{v}".',
  g_sample:'Use a sample', g_continue:'Continue: {g}', g_reopen:'You closed the form: reopening it from the right step.'
});

const VIEW_LABEL = { archive:'nav_archive', print:'nav_print', import:'nav_import', export:'nav_export', ai:'nav_ai', settings:'nav_settings', database:'nav_database' };
const navStep = (view, title, text) => ({ target:'.nav [data-v="' + view + '"]', title, text, done:() => S.view === view });
const edField = (k) => () => { const el = $('#ed-' + k); return el && el.closest('.field'); };
const edOpen = () => !!(UI.ed && topModal());
const SAMPLE_CSV = 'speaking_code;company_name;category;binder_title;room_code;cabinet_code;shelf_code;sector_code;location_code;archive_state;contents;tags;color_hex;short_code;short_url;final_destination\n' +
  ';Bianchi Impianti S.r.l.;Ordinaria;Fatture e Contabilità IVA;C;1;α;;C1-α;CURRENT;2025: Fatture Acquisto|2025: Fatture Vendita|2025: Liquidazioni IVA;iva,fatture,2025;#2563EB;;;\n' +
  ';Bianchi Impianti S.r.l.;Lavoro;Paghe e Personale;C;1;β;SX;C1-β-SX;CURRENT;2025: Cedolini|2025: Certificazione Unica;paghe,lavoro,2025;#D97706;;;\n';

const GUIDES = {
  create: { title:{it:'Crea un faldone e la sua etichetta', en:'Create a binder and its label'}, steps:[
    navStep('archive', {it:'Apri l\'Archivio', en:'Open the Archive'}, {it:'Clicca "Archivio" nella barra in alto.', en:'Click "Archive" in the top bar.'}),
    { target:'.page-h [data-a="new-binder"]', title:{it:'Nuovo faldone', en:'New binder'}, text:{it:'Clicca "Nuovo Faldone": si apre la scheda.', en:'Click "New Binder": the form opens.'}, done:() => !!(UI.ed && UI.ed.isNew) },
    { target:edField('company_name'), onEnter:(c) => { c.id = UI.ed && UI.ed.d.id; }, guard:() => edOpen() ? null : 1,
      title:{it:'Cliente', en:'Client'}, text:{it:'Scrivi il nome del cliente o della società, ad esempio "Rossi Costruzioni S.p.A.". Se il cliente esiste già, compare nei suggerimenti.', en:'Type the client or company name, e.g. "Rossi Costruzioni S.p.A.". Existing clients appear as suggestions.'},
      require:() => UI.ed.d.company_name.trim() ? null : {it:'Scrivi prima il nome del cliente.', en:'Type the client name first.'} },
    { target:edField('speaking_code'), guard:() => edOpen() ? null : 1,
      title:{it:'Codice parlante', en:'Speaking code'}, text:{it:'DocMap ha proposto le iniziali + il numero successivo (es. RC2). È il codice grande che leggerai sullo scaffale: puoi cambiarlo.', en:'DocMap suggested initials + next number (e.g. RC2). It is the big code you will read on the shelf: you can change it.'},
      require:() => { const e = validateEditor(true); return e.speaking_code ? {it:e.speaking_code, en:e.speaking_code} : null; } },
    { target:edField('binder_title'), guard:() => edOpen() ? null : 1,
      title:{it:'Titolo del faldone', en:'Binder title'}, text:{it:'Una descrizione breve, ad esempio "Fatture e Contabilità IVA".', en:'A short description, e.g. "Fatture e Contabilità IVA".'},
      require:() => UI.ed.d.binder_title.trim() ? null : {it:'Scrivi il titolo del faldone.', en:'Type the binder title.'} },
    { target:() => { const el = $('#ed-room_code'); return el && el.closest('.grid'); }, guard:() => edOpen() ? null : 1,
      title:{it:'Posizione sullo scaffale', en:'Shelf position'}, text:{it:'Stanza (es. A), armadio (es. 1) e ripiano: usa i pulsanti α β γ (α = ripiano più alto). Il settore SX/CX/DX è facoltativo.', en:'Room (e.g. A), cabinet (e.g. 1) and shelf: use the α β γ buttons (α = top shelf). Sector SX/CX/DX is optional.'},
      require:() => (UI.ed.d.room_code.trim() && UI.ed.d.shelf_code.trim()) ? null : {it:'Compila almeno stanza e ripiano.', en:'Fill in at least room and shelf.'} },
    { target:() => { const el = $('#ed-contents'); return el && el.closest('.field'); }, guard:() => edOpen() ? null : 1,
      title:{it:'Contenuti (Modulo B)', en:'Contents (Module B)'}, text:{it:'Elenca i documenti dentro il faldone: anno + descrizione. "Aggiungi voce" per altre righe.', en:'List the documents in the binder: year + description. "Add item" for more rows.'},
      require:() => UI.ed.d.contents_items.some(i => String(i.description).trim()) ? null : {it:'Scrivi almeno un documento contenuto.', en:'Type at least one document.'} },
    { target:'#ed-preview', guard:() => edOpen() ? null : 1, title:{it:'Anteprima etichetta', en:'Label preview'}, text:{it:'Ecco come verranno le due etichette: Modulo A (cliente, codice, posizione, QR) e Modulo B (contenuti). Il QR punta già a https://qr7.it/' , en:'This is how the two labels will look: Module A (client, code, location, QR) and Module B (contents). The QR already points to https://qr7.it/'}, dyn:() => UI.ed ? UI.ed.d.short_code : '' },
    { target:() => { const m = topModal(); return m && m.querySelector('.modal-f .btn-primary'); }, guard:(c) => (edOpen() || S.binders.some(b => b.id === c.id)) ? null : 1,
      title:{it:'Salva', en:'Save'}, text:{it:'Clicca "Salva". Il faldone viene salvato e messo in coda di stampa.', en:'Click "Save". The binder is saved and queued for printing.'}, done:(c) => S.binders.some(b => b.id === c.id) && !UI.ed },
    { final:true, title:{it:'Faldone creato ✓', en:'Binder created ✓'}, text:{it:'Il faldone è nell\'archivio e già spuntato per la stampa. Vuoi stampare subito la sua etichetta?', en:'The binder is in the archive and already ticked for printing. Print its label now?'}, chain:'print' }
  ]},
  print: { title:{it:'Stampa le etichette', en:'Print the labels'}, steps:[
    navStep('print', {it:'Apri Stampa Etichette', en:'Open Print Labels'}, {it:'Clicca "Stampa Etichette" in alto.', en:'Click "Print Labels" at the top.'}),
    { target:'#pr-summary', title:{it:'Coda di stampa', en:'Print queue'}, text:{it:'Qui vedi i faldoni spuntati in Archivio. Se la coda è vuota torna in Archivio e spunta i faldoni.', en:'These are the binders ticked in Archive. If empty, go back to Archive and tick some.'},
      require:() => printQueueBinders().length ? null : {it:'La coda è vuota: spunta almeno un faldone in Archivio.', en:'The queue is empty: tick at least one binder in Archive.'} },
    { target:'.preset-list', title:{it:'Tipo di foglio', en:'Sheet type'}, text:{it:'Scegli il foglio che hai in stampante. "A4 intero" = foglio adesivo unico da tagliare; "Prefustellato" = etichette già fustellate tipo Avery (il codice è sulla confezione).', en:'Pick the sheet in your printer. "Full A4" = one adhesive sheet to cut; "Die-cut" = pre-cut Avery-type labels (code on the box).'} },
    { target:() => { const b = $('[data-a="cmode"]'); return b && b.parentElement; }, title:{it:'Cosa stampare', en:'What to print'}, text:{it:'"Coppia Sdoppiata" stampa per ogni faldone il Modulo A (da incollare in alto) e il Modulo B (contenuti, sotto). Quando cambiano i contenuti ristampi solo il B.', en:'"Split Pair" prints Module A (stick on top) and Module B (contents, below) for each binder. When contents change you reprint only B.'} },
    { target:() => { const b = $('[data-a="qmode"]'); return b && b.parentElement; }, title:{it:'QR', en:'QR'}, text:{it:'QR vettoriale = stampato ora. Spazio riservato = lascia un quadrato bianco per un QR adesivo prestampato.', en:'Vector QR = printed now. Reserved space = leaves a white square for a pre-printed QR sticker.'} },
    { target:'#slotmap', title:{it:'Foglio già usato?', en:'Sheet already used?'}, text:{it:'Se il foglio ha già etichette staccate, clicca quelle caselle: resteranno vuote. In blu le caselle che verranno stampate.', en:'If the sheet already has peeled labels, click those slots: they stay blank. Blue = slots that will be printed.'} },
    { target:'#pv-scroll', title:{it:'Anteprima millimetrica', en:'Millimetre preview'}, text:{it:'Questa è la pagina reale in scala. Controlla che sia tutto a posto.', en:'This is the real page to scale. Check that everything is right.'} },
    { target:'[data-a="print-labels"]', title:{it:'Stampa', en:'Print'}, text:{it:'Clicca "Stampa Etichette". Nel dialogo imposta Scala 100% (Dimensioni effettive) e Margini: Nessuno.', en:'Click "Print Labels". In the dialog set Scale 100% (Actual size) and Margins: None.'}, advanceOn:'click' },
    { final:true, title:{it:'Stampa inviata ✓', en:'Print sent ✓'}, text:{it:'Se la stampa è riuscita conferma l\'aggiornamento della mappa del foglio. Prima volta con questo foglio? Fai la prova di calibrazione.', en:'If printing worked, confirm the sheet map update. First time with this sheet? Run the calibration test.'}, chain:'calib' }
  ]},
  calib: { title:{it:'Verifica il foglio con la prova quasi bianca', en:'Check the sheet with the near-white test'}, steps:[
    navStep('print', {it:'Apri Stampa Etichette', en:'Open Print Labels'}, {it:'Clicca "Stampa Etichette" in alto.', en:'Click "Print Labels" at the top.'}),
    { target:'.preset-list', title:{it:'Il foglio esatto', en:'The exact sheet'}, text:{it:'Seleziona il preset con lo stesso codice della confezione (es. L7163 = 14 etichette 99,1×38,1 mm).', en:'Select the preset with the same code as the box (e.g. L7163 = 14 labels 99.1×38.1 mm).'} },
    { target:'[data-a="pv-mode"][data-v="calib"]', title:{it:'Anteprima della prova', en:'Test preview'}, text:{it:'Clicca "Prova calibrazione" per vederla.', en:'Click "Calibration test" to see it.'}, done:() => S.print.previewMode === 'calib' },
    { target:'#pv-scroll', title:{it:'Cosa stampa', en:'What it prints'}, text:{it:'Solo linee grigio chiaro: croce al centro di ogni etichetta, angoli, "↑ ALTO / TOP" e coordinate in mm. In basso un righello di 50 mm per verificare la scala.', en:'Only light-grey lines: a cross in the centre of each label, corners, "↑ ALTO / TOP" and mm coordinates. At the bottom a 50 mm ruler to check scale.'} },
    { target:'[data-a="print-calib"]', title:{it:'Stampa la prova', en:'Print the test'}, text:{it:'Clicca e stampa su un foglio normale (Scala 100%, Margini Nessuno).', en:'Click and print on plain paper (Scale 100%, Margins None).'}, advanceOn:'click' },
    { target:'#geo-offsets', title:{it:'Correggi lo scostamento', en:'Correct the shift'}, text:{it:'Sovrapponi la prova al foglio di etichette controluce. Se le croci sono spostate, ad esempio 1 mm a destra, imposta Offset X a −1. In basso = Offset Y negativo. Passi da 0,5 mm.', en:'Lay the test over the label sheet against the light. If crosses are shifted, e.g. 1 mm right, set Offset X to −1. Lower = negative Offset Y. 0.5 mm steps.'} },
    { final:true, title:{it:'Calibrazione pronta ✓', en:'Calibration ready ✓'}, text:{it:'Gli offset sono salvati e valgono per tutte le stampe. Ora puoi stampare le etichette vere con certezza.', en:'Offsets are saved and apply to every print. Now print the real labels with confidence.'}, chain:'print' }
  ]},
  partial: { title:{it:'Riusa un foglio già iniziato', en:'Reuse a partly used sheet'}, steps:[
    navStep('print', {it:'Apri Stampa Etichette', en:'Open Print Labels'}, {it:'Clicca "Stampa Etichette" in alto.', en:'Click "Print Labels" at the top.'}),
    { target:'#slotmap', title:{it:'Segna le caselle staccate', en:'Mark the peeled slots'}, text:{it:'Clicca le caselle che sul tuo foglio mancano già. Diventano grigie barrate.', en:'Click the slots already missing on your sheet. They turn grey and struck through.'},
      require:() => usedSet().size ? null : {it:'Clicca almeno una casella già usata.', en:'Click at least one used slot.'} },
    { target:'#pv-scroll', title:{it:'Risultato', en:'Result'}, text:{it:'Nell\'anteprima le caselle usate sono vuote e la stampa parte dalla prima libera.', en:'In the preview used slots are blank and printing starts from the first free one.'} },
    { final:true, title:{it:'Foglio recuperato ✓', en:'Sheet recovered ✓'}, text:{it:'La mappa resta salvata per questo tipo di foglio. Dopo ogni stampa DocMap propone di aggiornarla.', en:'The map stays saved for this sheet type. After each print DocMap offers to update it.'} }
  ]},
  manifest: { title:{it:'Esporta il manifest per qr7.it', en:'Export the qr7.it manifest'}, steps:[
    navStep('export', {it:'Apri Esporta e Salva', en:'Open Export & Save'}, {it:'Clicca "Esporta e Salva" in alto.', en:'Click "Export & Save" at the top.'}),
    { target:'[data-a="ex-manifest"]', title:{it:'Scarica il manifest', en:'Download the manifest'}, text:{it:'Clicca: scarichi manifest_qr7_dm26.csv con le sole righe DocMap (short_code;short_url;final_destination;tags).', en:'Click: you download manifest_qr7_dm26.csv with DocMap rows only (short_code;short_url;final_destination;tags).'}, advanceOn:'click' },
    { target:'[data-a="ex-merge"]', title:{it:'Oppure unisci al manifest del server', en:'Or merge into the server manifest'}, text:{it:'Se sul server c\'è già un manifest.csv con altri link, caricalo qui: DocMap conserva tutte le righe esistenti e aggiunge/aggiorna le dm26 in fondo.', en:'If the server already has a manifest.csv with other links, upload it here: DocMap keeps all existing rows and appends/updates the dm26 ones.'} },
    { final:true, title:{it:'Manifest pronto ✓', en:'Manifest ready ✓'}, text:{it:'Carica il file su qr7.it (SiteGround). Da quel momento ogni QR stampato reindirizza alla destinazione finale.', en:'Upload the file to qr7.it (SiteGround). From then on every printed QR redirects to its final destination.'} }
  ]},
  ai: { title:{it:'Genera i faldoni con l\'AI', en:'Generate binders with AI'}, steps:[
    navStep('ai', {it:'Apri Genera con AI', en:'Open Generate with AI'}, {it:'Clicca "Genera con AI" in alto.', en:'Click "Generate with AI" at the top.'}),
    { target:'[data-a="ai-copy"]', title:{it:'Copia il prompt', en:'Copy the prompt'}, text:{it:'Clicca: il prompt completo con lo schema CSV va negli appunti.', en:'Click: the full prompt with the CSV schema goes to the clipboard.'}, advanceOn:'click' },
    { target:'#ai-prompt', title:{it:'Incollalo nell\'AI', en:'Paste it into the AI'}, text:{it:'Incollalo in ChatGPT, Claude o Gemini. In fondo scrivi i tuoi clienti e documenti o allega le foto degli scaffali. L\'AI risponderà con un blocco CSV: copialo.', en:'Paste it into ChatGPT, Claude or Gemini. At the bottom write your clients and documents or attach shelf photos. The AI replies with a CSV block: copy it.'} },
    navStep('import', {it:'Apri Importa', en:'Open Import'}, {it:'Clicca "Importa" in alto.', en:'Click "Import" at the top.'}),
    { target:'#im-text', title:{it:'Incolla la risposta', en:'Paste the reply'}, text:{it:'Incolla qui il CSV dell\'AI. Non hai ancora la risposta? Usa l\'esempio per provare.', en:'Paste the AI CSV here. No reply yet? Use the sample to try.'}, extra:{label:'g_sample', fn:() => { const el = $('#im-text'); el.value = SAMPLE_CSV; UI.importText = SAMPLE_CSV; }},
      require:() => { const el = $('#im-text'); return el && el.value.trim().length > 20 ? null : {it:'Incolla prima il testo CSV.', en:'Paste the CSV text first.'}; } },
    { target:'[data-a="im-analyze"]', title:{it:'Analizza', en:'Analyse'}, text:{it:'Clicca "Analizza e mostra anteprima".', en:'Click "Analyse and preview".'}, done:() => !!(UI.importParsed && UI.importParsed.rows) },
    { target:'#im-preview', title:{it:'Controlla l\'anteprima', en:'Check the preview'}, text:{it:'NUOVO = verrà aggiunto, AGGIORNA = esiste già quel codice parlante. Le note spiegano cosa ha completato DocMap (codici dm26, codici parlanti).', en:'NEW = will be added, UPDATE = that speaking code exists. Notes explain what DocMap filled in (dm26 codes, speaking codes).'} },
    { target:'[data-a="im-merge"]', title:{it:'Importa', en:'Import'}, text:{it:'Clicca "Aggiungi e Aggiorna": nessun dato esistente viene perso.', en:'Click "Add & Update": no existing data is lost.'}, done:() => UI.importParsed === null && S.view === 'archive' },
    { final:true, title:{it:'Importazione fatta ✓', en:'Import done ✓'}, text:{it:'I nuovi faldoni sono in Archivio, già in coda di stampa.', en:'The new binders are in Archive, already queued for printing.'}, chain:'print' }
  ]},
  session: { title:{it:'Salva una sessione nel database SQLite', en:'Save a session in the SQLite database'}, steps:[
    navStep('database', {it:'Apri Database', en:'Open Database'}, {it:'Clicca "Database" in alto.', en:'Click "Database" at the top.'}),
    { target:'#db-status', title:{it:'Il database locale', en:'The local database'}, text:{it:'SQLite gira nel browser, senza server. Le tabelle si aggiornano da sole a ogni modifica.', en:'SQLite runs in the browser, no server. Tables update on every change.'}, require:() => DB.ready ? null : {it:'Attendi l\'avvio del motore SQLite.', en:'Wait for the SQLite engine to start.'} },
    { target:() => { const el = $('#db-session-name'); return el && el.closest('.grid'); }, title:{it:'Dai un nome', en:'Give it a name'}, text:{it:'Scrivi un nome riconoscibile, ad esempio "Inventario stanza A — novembre".', en:'Type a recognisable name, e.g. "Room A inventory — November".'},
      require:() => { const el = $('#db-session-name'); return el && el.value.trim() ? null : {it:'Scrivi il nome della sessione.', en:'Type the session name.'}; } },
    { target:'[data-a="db-save-session"]', onEnter:(c) => { c.n = dbSessions().length; }, title:{it:'Salva', en:'Save'}, text:{it:'Clicca "Salva sessione nel database".', en:'Click "Save session to database".'}, done:(c) => dbSessions().length > c.n },
    { target:'#db-sessions', title:{it:'Le tue sessioni', en:'Your sessions'}, text:{it:'Da qui ripristini una sessione quando vuoi (chiede conferma) o la scarichi in JSON.', en:'From here you restore a session any time (asks for confirmation) or download it as JSON.'} },
    { target:'.page-h [data-a="db-download"]', title:{it:'Scarica il file .sqlite', en:'Download the .sqlite file'}, text:{it:'Clicca per scaricare docmap.sqlite: contiene tabelle e sessioni. Conservalo come archivio.', en:'Click to download docmap.sqlite: it holds tables and sessions. Keep it as an archive.'}, advanceOn:'click' },
    { final:true, title:{it:'Sessione salvata ✓', en:'Session saved ✓'}, text:{it:'Su Chrome/Edge puoi anche collegare un file sul disco per il salvataggio automatico.', en:'On Chrome/Edge you can also link a file on disk for automatic saving.'} }
  ]},
  backup: { title:{it:'Fai un backup completo', en:'Make a full backup'}, steps:[
    { target:'.top-right .status', title:{it:'Il semaforo dei dati', en:'The data indicator'}, text:{it:'Verde = tutto esportato. Arancione = ci sono modifiche salvate solo nel browser e non ancora scaricate.', en:'Green = everything exported. Amber = changes saved only in the browser, not yet downloaded.'} },
    navStep('export', {it:'Apri Esporta e Salva', en:'Open Export & Save'}, {it:'Clicca "Esporta e Salva" in alto.', en:'Click "Export & Save" at the top.'}),
    { target:'[data-a="ex-json"]', title:{it:'Sessione completa JSON', en:'Full session JSON'}, text:{it:'Clicca: scarichi docmap_workspace.json, copia integrale di tutto. Si reimporta da Importa o Impostazioni.', en:'Click: you download docmap_workspace.json, a full copy of everything. Re-import it from Import or Settings.'}, advanceOn:'click' },
    { final:true, title:{it:'Backup fatto ✓', en:'Backup done ✓'}, text:{it:'Il semaforo è tornato verde. Per un archivio a lungo termine scarica anche il file .sqlite dalla schermata Database.', en:'The indicator is green again. For long-term archiving also download the .sqlite file from Database.'}, chain:'session' }
  ]},
  import: { title:{it:'Importa un CSV o JSON', en:'Import a CSV or JSON'}, steps:[
    navStep('import', {it:'Apri Importa', en:'Open Import'}, {it:'Clicca "Importa" in alto.', en:'Click "Import" at the top.'}),
    { target:'#dropzone', title:{it:'Carica un file…', en:'Upload a file…'}, text:{it:'Trascina qui un .csv o .json, oppure clicca per sceglierlo. Oppure passa al campo di testo (Avanti).', en:'Drop a .csv or .json here, or click to choose it. Or use the text box (Next).'}, done:() => !!(UI.importParsed && UI.importParsed.rows) },
    { target:'#im-text', title:{it:'…oppure incolla il testo', en:'…or paste the text'}, text:{it:'Incolla il CSV o il JSON. Puoi provare con l\'esempio.', en:'Paste CSV or JSON. You can try the sample.'}, extra:{label:'g_sample', fn:() => { const el = $('#im-text'); el.value = SAMPLE_CSV; UI.importText = SAMPLE_CSV; }},
      skipIf:() => !!(UI.importParsed && UI.importParsed.rows),
      require:() => { const el = $('#im-text'); return el && el.value.trim().length > 20 ? null : {it:'Incolla prima il testo.', en:'Paste the text first.'}; } },
    { target:'[data-a="im-analyze"]', skipIf:() => !!(UI.importParsed && UI.importParsed.rows), title:{it:'Analizza', en:'Analyse'}, text:{it:'Clicca "Analizza e mostra anteprima".', en:'Click "Analyse and preview".'}, done:() => !!(UI.importParsed && UI.importParsed.rows) },
    { target:'#im-preview', title:{it:'Anteprima', en:'Preview'}, text:{it:'Controlla le righe. Poi scegli: Aggiungi e Aggiorna (sicuro) o Sostituisci Tutto (chiede conferma).', en:'Check the rows. Then choose: Add & Update (safe) or Replace All (asks for confirmation).'} },
    { target:'[data-a="im-merge"]', title:{it:'Importa', en:'Import'}, text:{it:'Clicca "Aggiungi e Aggiorna".', en:'Click "Add & Update".'}, done:() => UI.importParsed === null && S.view === 'archive' },
    { final:true, title:{it:'Importazione fatta ✓', en:'Import done ✓'}, text:{it:'I faldoni sono in Archivio.', en:'The binders are in Archive.'} }
  ]},
  register: { title:{it:'Stampa il Registro Generale', en:'Print the Master Register'}, steps:[
    navStep('export', {it:'Apri Esporta e Salva', en:'Open Export & Save'}, {it:'Clicca "Esporta e Salva" in alto.', en:'Click "Export & Save" at the top.'}),
    { target:'[data-a="ex-register"]', title:{it:'Apri il registro', en:'Open the register'}, text:{it:'Clicca "Apri Registro e Stampa".', en:'Click "Open Register & Print".'}, advanceOn:'click' },
    { final:true, title:{it:'Registro aperto ✓', en:'Register open ✓'}, text:{it:'Premi "Stampa Registro". Per un PDF scegli "Salva come PDF" nel dialogo di stampa.', en:'Press "Print Register". For a PDF choose "Save as PDF" in the print dialog.'} }
  ]}
};

const G = { id:null, g:null, i:0, ctx:{}, msg:'', raf:0, advancing:false, lastKey:'', els:null, lastScrollEl:null };
function guideStep(){ return G.g && G.g.steps[G.i]; }
function guideResolve(target){
  if (!target) return null;
  const el = typeof target === 'function' ? target() : $(target);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return (r.width || r.height) ? el : null;
}
function guideStart(id){
  if (!GUIDES[id]) return;
  if (HELP.open) helpClose();
  guideStop(true);
  G.id = id; G.g = GUIDES[id]; G.ctx = {}; G.msg = '';
  const root = $('#guide-root');
  root.innerHTML = '<div class="g-mask" data-m="t"></div><div class="g-mask" data-m="b"></div><div class="g-mask" data-m="l"></div><div class="g-mask" data-m="r"></div><div class="g-ring"></div><div class="g-card" role="dialog" aria-live="polite"></div>';
  G.els = { masks:$$('.g-mask', root), ring:$('.g-ring', root), card:$('.g-card', root) };
  G.els.masks.forEach(m => {
    m.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); guideNudge(t('g_outside')); });
    m.addEventListener('wheel', (e) => { const ov = topModal(); (ov || document.scrollingElement).scrollBy(0, e.deltaY); e.preventDefault(); }, {passive:false});
  });
  document.body.classList.add('guide-on');
  guideEnter(0);
  const loop = () => { guideTick(); G.raf = requestAnimationFrame(loop); };
  G.raf = requestAnimationFrame(loop);
}
function guideStop(silent){
  cancelAnimationFrame(G.raf);
  $('#guide-root').innerHTML = '';
  document.body.classList.remove('guide-on');
  G.id = null; G.g = null; G.els = null;
}
function guideEnter(i, msg){
  const steps = G.g.steps;
  while (i < steps.length - 1 && steps[i].skipIf && steps[i].skipIf(G.ctx)) i++;
  G.i = i; G.msg = msg || ''; G.advancing = false; G.lastScrollEl = null;
  const st = guideStep();
  if (st.onEnter) st.onEnter(G.ctx);
  guideRenderCard();
}
function guideNext(){
  const st = guideStep(); if (!st) return;
  if (st.require){ const m = st.require(G.ctx); if (m){ guideNudge(L(m)); return; } }
  if (G.i < G.g.steps.length - 1) guideEnter(G.i + 1);
}
function guideNudge(msg){
  if (!G.els) return;
  G.msg = msg; guideRenderCard();
  const c = G.els.card; c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
}
function guideRenderCard(){
  if (!G.els) return;
  const st = guideStep(), n = G.g.steps.length;
  const dots = G.g.steps.map((s, k) => '<button class="g-dot ' + (k < G.i ? 'done' : k === G.i ? 'cur' : '') + '" data-a="guide-dot" data-i="' + k + '" aria-label="' + (k + 1) + '"></button>').join('');
  const manual = !st.final && !st.done && !st.advanceOn;
  const chain = st.chain && GUIDES[st.chain];
  G.els.card.innerHTML = '<div class="g-top"><span class="g-kicker">' + ic('sparkles') + esc(L(G.g.title)) + '</span><button class="icon-btn" data-a="guide-close" title="' + esc(t('g_close')) + '" aria-label="' + esc(t('g_close')) + '">' + ic('x') + '</button></div>' +
    '<div class="g-dots">' + dots + '<span class="g-count">' + esc(t('g_step', {n:G.i + 1, t:n})) + '</span></div>' +
    '<h4>' + esc(L(st.title)) + '</h4><p>' + esc(L(st.text)) + (st.dyn ? '<span class="mono">' + esc(st.dyn()) + '</span>' : '') + '</p>' +
    '<div class="g-hint" id="g-hint"></div>' +
    (G.msg ? '<div class="g-msg">' + ic('alert') + '<span>' + esc(G.msg) + '</span></div>' : '') +
    '<div class="g-actions">' +
      (G.i > 0 && !st.final ? '<button class="btn btn-sm btn-ghost" data-a="guide-back">' + esc(t('g_back')) + '</button>' : '<span></span>') +
      '<span style="flex:1"></span>' +
      (st.extra ? '<button class="btn btn-sm" data-a="guide-extra">' + esc(t(st.extra.label)) + '</button>' : '') +
      (st.final ? (chain ? '<button class="btn btn-sm" data-a="guide-chain" data-id="' + st.chain + '">' + esc(t('g_continue', {g:L(chain.title)})) + '</button>' : '') + '<button class="btn btn-sm btn-primary" data-a="guide-close">' + ic('check') + esc(t('g_finish')) + '</button>'
        : manual ? '<button class="btn btn-sm btn-primary" data-a="guide-next">' + esc(t('g_next')) + ' →</button>' : '<span class="tiny muted">' + esc(t('g_auto')) + '</span>') +
    '</div>';
  G.lastKey = '';
}
function guideTick(){
  const st = guideStep(); if (!st || !G.els) return;
  if (st.guard){ const back = st.guard(G.ctx); if (back !== null && back !== undefined && back !== G.i){ guideEnter(back, t('g_reopen')); return; } }
  const el = st.final ? null : guideResolve(st.target);
  const modal = topModal();
  const blockedByModal = modal && el && !modal.contains(el);
  const free = st.final || !el || blockedByModal;
  const hint = $('#g-hint', G.els.card);
  let hintTxt = '';
  if (!st.final && !el){
    const v = (typeof st.target === 'string' && st.target.indexOf('.nav') === 0) ? null : guideViewFor(st);
    hintTxt = v && S.view !== v ? '<button class="btn btn-sm btn-dark" data-a="guide-goview" data-v="' + v + '">' + esc(t('g_goto', {v:t(VIEW_LABEL[v])})) + '</button>' : '';
  } else if (blockedByModal) hintTxt = '<span class="tiny">' + esc(t('g_modal')) + '</span>';
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
  if (!G.advancing && st.done && st.done(G.ctx)){
    G.advancing = true;
    setTimeout(() => { if (G.g && guideStep() === st) guideEnter(Math.min(G.i + 1, G.g.steps.length - 1)); }, 350);
  }
}
function guideViewFor(st){
  // find the most recent nav step before the current one to know which view the target lives in
  for (let k = G.i; k >= 0; k--){ const s = G.g.steps[k]; if (typeof s.target === 'string'){ const m = s.target.match(/^\.nav \[data-v="(\w+)"\]/); if (m) return m[1]; } }
  return null;
}
/* advanceOn:'click' — advance after the real click on the spotlighted element has run */
document.addEventListener('click', (e) => {
  const st = guideStep(); if (!st || st.advanceOn !== 'click') return;
  const el = guideResolve(st.target);
  if (el && el.contains(e.target)){ const i = G.i; setTimeout(() => { if (G.g && G.i === i) guideEnter(i + 1); }, 120); }
}, true);
