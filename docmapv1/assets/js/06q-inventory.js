/* =====================================================================
   DocMap 2026 — v12.8 "Progetti di inventario" on the desktop (index.html). Model: 02f-inventory.js. Phone: 11f-inventory.js.

   View 'inv' (top bar › Progetti):
     - list of projects (cards with label and progress counts) + "Nuovo progetto";
     - one project: details, label batches ("Genera etichette" extends the numbering, never reuses a number),
       printing of a batch on the sheet chosen in Stampa (QR + big number + SCATOLA / FALDONE + project), qr7 manifest
       of a batch (same CSV as Esporta), "Apri sul telefono" (QR of scan.html?inv=<id>);
     - review grid of the captured binders: spine photo (server route photo, or IndexedDB in local mode), fields
       editable in place, AI proposal and its confidence, Conferma / "Conferma le proposte sicure", Apri scheda.
   A project is an archive record with `inv` (02f): created with archCreate, levels [Scatola], so filters, sync, backups
   and the archive switcher work as for any archive. Changes go through commit() (→ SQLite, server push).
   Also here: Impostazioni › "Indirizzo dei QR" (S.settings.qrBase, default https://qr7.it/), SQLite columns inv_json
   (archives, binders; added only if missing), the merge of phone captures made in local mode (activity-log lines
   inventory.* with details.records → logMerge wrapper).
   ===================================================================== */
'use strict';

const IVP = { open:'', f:'', q:'', lv:'', photos:new Map(), loading:new Set(), sel:new Set() };

Object.assign(I18N.it, {
  nav_inv:'Progetti', nav_inv_s:'Inventario rapido', ivp_h:'Progetti di inventario', ivp_p:'Per gli archivi da inventariare: generi le etichette, le attacchi a scatole e faldoni, poi con il telefono scansioni la scatola e un faldone dopo l\'altro. Foto, beep e lettura della costa sono automatici.',
  ivp_new:'Nuovo progetto', ivp_none:'Nessun progetto. Crea il primo: nome, codice breve per le etichette, tag rapidi e anni.', ivp_open:'Apri', ivp_back:'Tutti i progetti',
  ivp_k_boxes:'Scatole', ivp_k_binders:'Faldoni', ivp_k_gen:'{n} etichette', ivp_k_done:'{n} acquisiti', ivp_k_review:'{n} da rivedere', ivp_k_prop:'{n} proposte', ivp_k_ok:'{n} confermati',
  ivp_st_open:'aperto', ivp_st_closed:'chiuso', ivp_mode_box:'Scatola → faldoni', ivp_mode_capture:'Cattura ora, cataloga dopo',
  ivp_f_name:'Nome del progetto', ivp_f_name_ph:'es. Inventario Rossi S.r.l. 2024', ivp_f_code:'Codice sulle etichette', ivp_f_code_h:'Breve, solo lettere e numeri: le etichette diventano {c}-0001 (faldoni) e {c}-S001 (scatole).',
  ivp_f_client:'Cliente (facoltativo)', ivp_f_client_h:'Se l\'archivio è di un solo cliente, ogni faldone acquisito lo riceve già scritto.', ivp_f_tags:'Tag rapidi (uno per riga)', ivp_f_years:'Anni attesi (barra degli anni sul telefono)', ivp_f_from:'dal', ivp_f_to:'al',
  ivp_f_mode:'Modalità di lavoro', ivp_f_ai:'Lettura della costa con l\'AI (serve il server online con la chiave AI)', ivp_f_auto:'Proposte sicure da una fiducia di', ivp_f_status:'Stato', ivp_f_notes:'Note',
  ivp_f_boxes:'Etichette per scatole da generare subito', ivp_f_binders:'Etichette per faldoni da generare subito', ivp_e_name:'Scrivi il nome del progetto.', ivp_e_code:'Il codice {c} è già usato da un altro progetto.',
  ivp_created:'Progetto creato: {p}', ivp_saved:'Progetto salvato', ivp_edit:'Modifica', ivp_edit_t:'Progetto: {p}', ivp_new_t:'Nuovo progetto di inventario',
  ivp_batches:'Lotti di etichette', ivp_batch_new:'Genera etichette', ivp_batch_t:'Genera altre etichette — {p}', ivp_batch_kind:'Per', ivp_batch_n:'Quante', ivp_batch_hint:'I numeri continuano dall\'ultimo generato: {b} scatole e {f} faldoni finora. Un numero non viene mai riusato.',
  ivp_batch_done:'Generate {n} etichette: {a} – {z}', ivp_batch_row:'{k} {a} – {z} ({n})', ivp_batch_none:'Nessun lotto: genera le prime etichette.', ivp_kind_box:'Scatole', ivp_kind_binder:'Faldoni', ivp_kw_box:'SCATOLA', ivp_kw_binder:'FALDONE',
  ivp_print:'Stampa', ivp_printed:'stampato {d}', ivp_manifest:'Manifest QR7', ivp_print_from:'Inizia dalla posizione del foglio', ivp_print_t:'Stampa etichette {a} – {z}', ivp_print_p:'Foglio: {s} (lo cambi in Stampa). {n} etichette su {p} fogli.', ivp_print_go:'Stampa',
  ivp_phone:'Apri sul telefono', ivp_phone_t:'Inventario sul telefono', ivp_phone_p:'Inquadra il QR con il telefono (o apri l\'indirizzo): si apre la schermata Scatola → Faldoni di questo progetto. Serve un utente con ruolo editor.', ivp_phone_local:'Senza server online il telefono deve essere questo stesso PC (stesso browser): apri l\'indirizzo qui sotto.',
  ivp_grid:'Revisione dei faldoni acquisiti', ivp_grid_none:'Nessun faldone acquisito per ora. Apri il progetto sul telefono e scansiona.', ivp_f_all:'Tutti', ivp_f_review:'Da rivedere', ivp_f_proposed:'Proposte', ivp_f_captured:'Solo acquisiti', ivp_f_confirmed:'Confermati',
  ivp_q_ph:'Cerca numero, ditta, contenuto, tag…', ivp_confirm:'Conferma', ivp_confirmed:'Confermato', ivp_confirm_safe:'Conferma le proposte sicure ({n})', ivp_confirm_sel:'Conferma i selezionati ({n})', ivp_conf_done:'Confermati {n} faldoni', ivp_card:'Apri scheda',
  ivp_s_captured:'Acquisito', ivp_s_proposed:'Proposta', ivp_s_review:'Da rivedere', ivp_s_confirmed:'Confermato', ivp_ai:'AI {c}%', ivp_ai_none:'nessuna lettura AI', ivp_voice:'Voce: {v}', ivp_photo_none:'senza foto', ivp_photo_load:'carico la foto…', ivp_photo_err:'foto non disponibile', ivp_box:'Scatola {b}', ivp_by:'{w} · {d}',
  ivp_fd_company:'Ditta / cliente', ivp_fd_title:'Contenuto', ivp_fd_year:'Anni', ivp_fd_tags:'Tag', ivp_more:'Mostra altri {n}',
  ivp_close:'Chiudi il progetto', ivp_reopen:'Riapri il progetto', ivp_closed_d:'Un progetto chiuso non accetta nuove scansioni dal telefono. I faldoni restano nell\'archivio.',
  ivp_qr_h:'Indirizzo dei QR', ivp_qr_p:'L\'indirizzo davanti al codice in ogni QR stampato. Di predefinito https://qr7.it/ (garanzia QR7). Puoi usare qualsiasi altro servizio o dominio: cambialo PRIMA di stampare, perché vale per tutti i QR (anche le ristampe).', ivp_qr_ex:'Esempio: {u}',
  ivp_qr_bad:'Indirizzo non valido: serve https://… (si usa https://qr7.it/).',
  lg_g_inventory:'Inventario', 'lga_inventory.create':'Progetto creato', 'lga_inventory.edit':'Progetto modificato', 'lga_inventory.batch':'Etichette generate', 'lga_inventory.print':'Etichette dell\'inventario stampate',
  'lga_inventory.capture':'Faldone acquisito (inventario)', 'lga_inventory.box':'Scatola dell\'inventario', 'lga_inventory.undo':'Acquisizione annullata', 'lga_inventory.update':'Faldone aggiornato (inventario)', 'lga_inventory.confirm':'Faldoni confermati',
  'lga_inventory.verify':'Scatola verificata', 'lga_inventory.move':'Faldone spostato (verifica)', 'lga_inventory.ai':'Lettura AI dal PC', 'lga_inventory.template':'Modello di progetto salvato',
  ivp_mode_station:'Stazione fissa', ivp_mode_chain:'Catena a due persone', ivp_mode_h:'Scatola → faldoni: una persona, prima la scatola. Cattura ora: solo QR e foto, si cataloga al PC. Stazione fissa: telefono su un supporto o webcam, mani libere. Catena: una persona scansiona, un\'altra corregge al PC in diretta.',
  ivp_f_doc:'Livello documento: etichette anche sui documenti dentro i faldoni', ivp_f_tpl:'Parti da un modello', ivp_f_tpl_none:'Nessun modello (vuoto)', ivp_tpl_own:'I tuoi modelli', ivp_tpl_std:'Modelli pronti',
  ivp_f_prices:'Prezzi di questo lavoro (€, IVA esclusa)', ivp_f_prices_h:'Vuoto = il prezzo predefinito di Impostazioni › Inventario ({v}). Scrivi un prezzo solo se il preventivo è diverso.',
  ivp_pr_binder:'a faldone', ivp_pr_box:'a scatola', ivp_pr_doc:'a documento', ivp_pr_fixed:'fisso (avvio, trasferta)', ivp_pr_vat:'IVA %',
  ivp_kind_doc:'Documenti', ivp_kind_any:'Jolly', ivp_kw_doc:'DOCUMENTO', ivp_kw_any:'ETICHETTA', ivp_batch_kind_h:'Documenti: per il livello documento. Jolly: diventano faldone o documento alla prima scansione (lo sceglie il telefono).',
  ivp_k_docs:'Documenti', ivp_doc_in:'Documento in {f}', ivp_f_level:'Livello', ivp_lv_all:'Tutto', ivp_lv_binder:'Faldoni', ivp_lv_doc:'Documenti'
});
Object.assign(I18N.en, {
  nav_inv:'Projects', nav_inv_s:'Rapid inventory', ivp_h:'Inventory projects', ivp_p:'For archives to be inventoried: generate the labels, stick them on boxes and binders, then with the phone scan the box and one binder after the other. Photo, beep and reading of the spine are automatic.',
  ivp_new:'New project', ivp_none:'No project yet. Create the first one: name, short code for the labels, quick tags and years.', ivp_open:'Open', ivp_back:'All projects',
  ivp_k_boxes:'Boxes', ivp_k_binders:'Binders', ivp_k_gen:'{n} labels', ivp_k_done:'{n} captured', ivp_k_review:'{n} to review', ivp_k_prop:'{n} proposals', ivp_k_ok:'{n} confirmed',
  ivp_st_open:'open', ivp_st_closed:'closed', ivp_mode_box:'Box → binders', ivp_mode_capture:'Capture now, catalogue later',
  ivp_f_name:'Project name', ivp_f_name_ph:'e.g. Rossi Ltd inventory 2024', ivp_f_code:'Code on the labels', ivp_f_code_h:'Short, letters and digits only: labels become {c}-0001 (binders) and {c}-S001 (boxes).',
  ivp_f_client:'Client (optional)', ivp_f_client_h:'If the archive belongs to one client, every captured binder gets it already written.', ivp_f_tags:'Quick tags (one per line)', ivp_f_years:'Expected years (year bar on the phone)', ivp_f_from:'from', ivp_f_to:'to',
  ivp_f_mode:'Working mode', ivp_f_ai:'AI reading of the spine (needs the online server with the AI key)', ivp_f_auto:'Safe proposals from a confidence of', ivp_f_status:'Status', ivp_f_notes:'Notes',
  ivp_f_boxes:'Box labels to generate now', ivp_f_binders:'Binder labels to generate now', ivp_e_name:'Type the project name.', ivp_e_code:'Code {c} is already used by another project.',
  ivp_created:'Project created: {p}', ivp_saved:'Project saved', ivp_edit:'Edit', ivp_edit_t:'Project: {p}', ivp_new_t:'New inventory project',
  ivp_batches:'Label batches', ivp_batch_new:'Generate labels', ivp_batch_t:'Generate more labels — {p}', ivp_batch_kind:'For', ivp_batch_n:'How many', ivp_batch_hint:'Numbers continue from the last one generated: {b} boxes and {f} binders so far. A number is never reused.',
  ivp_batch_done:'Generated {n} labels: {a} – {z}', ivp_batch_row:'{k} {a} – {z} ({n})', ivp_batch_none:'No batch: generate the first labels.', ivp_kind_box:'Boxes', ivp_kind_binder:'Binders', ivp_kw_box:'BOX', ivp_kw_binder:'BINDER',
  ivp_print:'Print', ivp_printed:'printed {d}', ivp_manifest:'QR7 manifest', ivp_print_from:'Start from sheet position', ivp_print_t:'Print labels {a} – {z}', ivp_print_p:'Sheet: {s} (change it in Print). {n} labels on {p} sheets.', ivp_print_go:'Print',
  ivp_phone:'Open on the phone', ivp_phone_t:'Inventory on the phone', ivp_phone_p:'Frame the QR with the phone (or open the address): the Box → Binders screen of this project opens. A user with the editor role is needed.', ivp_phone_local:'Without the online server the phone must be this same PC (same browser): open the address below.',
  ivp_grid:'Review of the captured binders', ivp_grid_none:'No binder captured yet. Open the project on the phone and scan.', ivp_f_all:'All', ivp_f_review:'To review', ivp_f_proposed:'Proposals', ivp_f_captured:'Captured only', ivp_f_confirmed:'Confirmed',
  ivp_q_ph:'Search number, company, contents, tag…', ivp_confirm:'Confirm', ivp_confirmed:'Confirmed', ivp_confirm_safe:'Confirm the safe proposals ({n})', ivp_confirm_sel:'Confirm the selected ({n})', ivp_conf_done:'{n} binders confirmed', ivp_card:'Open card',
  ivp_s_captured:'Captured', ivp_s_proposed:'Proposal', ivp_s_review:'To review', ivp_s_confirmed:'Confirmed', ivp_ai:'AI {c}%', ivp_ai_none:'no AI reading', ivp_voice:'Voice: {v}', ivp_photo_none:'no photo', ivp_photo_load:'loading the photo…', ivp_photo_err:'photo not available', ivp_box:'Box {b}', ivp_by:'{w} · {d}',
  ivp_fd_company:'Company / client', ivp_fd_title:'Contents', ivp_fd_year:'Years', ivp_fd_tags:'Tags', ivp_more:'Show {n} more',
  ivp_close:'Close the project', ivp_reopen:'Reopen the project', ivp_closed_d:'A closed project accepts no new phone scans. The binders stay in the archive.',
  ivp_qr_h:'QR address', ivp_qr_p:'The address in front of the code in every printed QR. Default https://qr7.it/ (QR7 guarantee). Any other service or domain works: change it BEFORE printing, because it applies to every QR (reprints too).', ivp_qr_ex:'Example: {u}',
  ivp_qr_bad:'Invalid address: https://… is needed (https://qr7.it/ is used).',
  lg_g_inventory:'Inventory', 'lga_inventory.create':'Project created', 'lga_inventory.edit':'Project edited', 'lga_inventory.batch':'Labels generated', 'lga_inventory.print':'Inventory labels printed',
  'lga_inventory.capture':'Binder captured (inventory)', 'lga_inventory.box':'Inventory box', 'lga_inventory.undo':'Capture undone', 'lga_inventory.update':'Binder updated (inventory)', 'lga_inventory.confirm':'Binders confirmed',
  'lga_inventory.verify':'Box checked', 'lga_inventory.move':'Binder moved (check)', 'lga_inventory.ai':'AI reading from the PC', 'lga_inventory.template':'Project template saved',
  ivp_mode_station:'Fixed station', ivp_mode_chain:'Two-person chain', ivp_mode_h:'Box → binders: one person, box first. Capture now: QR and photo only, catalogue on the PC. Fixed station: phone on a stand or webcam, hands free. Chain: one person scans, another corrects live on the PC.',
  ivp_f_doc:'Document level: labels on the documents inside the binders too', ivp_f_tpl:'Start from a template', ivp_f_tpl_none:'No template (empty)', ivp_tpl_own:'Your templates', ivp_tpl_std:'Ready-made templates',
  ivp_f_prices:'Prices of this job (€, VAT excluded)', ivp_f_prices_h:'Empty = the default price of Settings › Inventory ({v}). Type a price only when the quote differs.',
  ivp_pr_binder:'per binder', ivp_pr_box:'per box', ivp_pr_doc:'per document', ivp_pr_fixed:'fixed (start-up, travel)', ivp_pr_vat:'VAT %',
  ivp_kind_doc:'Documents', ivp_kind_any:'Jolly', ivp_kw_doc:'DOCUMENT', ivp_kw_any:'LABEL', ivp_batch_kind_h:'Documents: for the document level. Jolly: they become binder or document at the first scan (chosen on the phone).',
  ivp_k_docs:'Documents', ivp_doc_in:'Document in {f}', ivp_f_level:'Level', ivp_lv_all:'All', ivp_lv_binder:'Binders', ivp_lv_doc:'Documents'
});
if (typeof LOG_GROUPS !== 'undefined' && !LOG_GROUPS.includes('inventory')) LOG_GROUPS.push('inventory');
if (typeof NAV_MAIN !== 'undefined' && !NAV_MAIN.some(x => x[0] === 'inv')) NAV_MAIN.splice(1, 0, ['inv', 'grid', 'nav_inv', 'nav_inv_s']);

/* ---------------- model helpers (desktop) ---------------- */
function ivpProj(id){ const a = (S.archives || []).find(x => x.id === id); return invIsProject(a) ? a : null; }
function ivpTarget(a){ return {type:'archive', id:a.id, code:a.inv.code}; }
function ivpTs(prev){ let at = nowISO(); if (prev && at <= prev) at = new Date(Date.parse(prev) + 1).toISOString(); return at; }
function ivpTouch(x){ x.updated_at = ivpTs(x.updated_at); }
function ivpBinders(a){ return S.binders.filter(b => b.archive_id === a.id); }
function ivpState(b){ return b.inv && INV_STATES.includes(b.inv.st) ? b.inv.st : 'confirmed'; }
function ivpSafe(a, b){ const st = ivpState(b); if (st !== 'proposed') return false; const c = b.inv.ai && +b.inv.ai.confidence; return !!(b.inv.voice || (c >= a.inv.auto_confirm)); }
function ivpStats(a){
  const L = ivpBinders(a), by = {captured:0, proposed:0, review:0, confirmed:0}; L.forEach(b => by[ivpState(b)]++);
  const boxes = (S.locations || []).filter(l => l.archive_id === a.id && invParseCode(l.short_code)).length;
  return {binders:L.length, boxes, by, safe:L.filter(b => ivpSafe(a, b)).length, docs:L.filter(b => invLevel(b) === 'doc').length};
}
/** Create a project = an archive (06l archCreate) + inv; optional first batches. */
function ivpCreate(f){
  const a = archCreate({name:f.name, code:f.code});
  a.levels = [{name:S.lang === 'en' ? 'Box' : 'Scatola', prefix:'S'}];
  a.inv = normalizeInv({prefix:invNewPrefix(), code:f.code || invSuggestCode(f.name), client:f.client, mode:f.mode, tags:f.tags, year_from:f.year_from, year_to:f.year_to, ai:f.ai, auto_confirm:f.auto_confirm, notes:f.notes, doc:f.doc, price:f.price, template:f.template});
  archTouch(a);
  logAct('inventory.create', ivpTarget(a), 'Creato il progetto di inventario ' + a.name + ' (' + a.inv.code + ')', {prefix:a.inv.prefix, code:a.inv.code, client:a.inv.client, mode:a.inv.mode});
  if (f.boxes > 0) ivpBatch(a, 'box', f.boxes, true);
  if (f.binders > 0) ivpBatch(a, 'binder', f.binders, true);
  return a;
}
/** New batch of labels: numbers to_+1 … to_+n, never reused. */
function ivpBatch(a, kind, n, quiet){
  n = Math.max(1, Math.min(20000, parseInt(n, 10) || 0));
  kind = INV_BATCH_KINDS.includes(kind) ? kind : 'binder';
  const k = invCounterKey(kind), from = a.inv[k] + 1, to = Math.min(INV_MAX, a.inv[k] + n);
  const b = {id:uuid(), kind, from, to, at:nowISO(), printed_at:'', format:''};
  a.inv[k] = to; a.inv.batches.push(b); archTouch(a);
  logAct('inventory.batch', ivpTarget(a), 'Generate ' + (to - from + 1) + ' etichette (' + invNumber(a.inv, kind, from) + ' – ' + invNumber(a.inv, kind, to) + ') nel progetto ' + a.name, {kind, from, to});
  if (!quiet) toast(t('ivp_batch_done', {n:to - from + 1, a:invNumber(a.inv, kind, from), z:invNumber(a.inv, kind, to)}));
  return b;
}
function ivpConfirm(list, how){
  const now = nowISO(), who = logWho(), done = [];
  list.forEach(b => { if (!b.inv || ivpState(b) === 'confirmed') return; b.inv = Object.assign({}, b.inv, {st:'confirmed', ok_by:who, ok_at:now}); ivpTouch(b); done.push(b); });
  if (!done.length) return 0;
  logAct('inventory.confirm', done.length === 1 ? {type:'binder', id:done[0].id, code:done[0].speaking_code} : null, done.length === 1 ? 'Confermato il faldone ' + done[0].speaking_code : 'Confermati ' + done.length + ' faldoni dell\'inventario', {ids:done.map(b => b.id), codes:done.map(b => b.speaking_code), how:how || 'one'});
  commit();
  return done.length;
}

/* ---------------- views ---------------- */
function viewInv(){ const a = IVP.open && ivpProj(IVP.open); return a ? ivpDetailHTML(a) : ivpListHTML(); }
function ivpListHTML(){
  const L = invProjects().slice().sort((x, y) => (x.inv.status === 'closed') - (y.inv.status === 'closed') || naturalCmp(x.name, y.name));
  return '<div class="page-h"><div><h1>' + esc(t('ivp_h')) + helpDot('inventory') + '</h1><p>' + esc(t('ivp_p')) + '</p></div><div class="row">' + (typeof ivxEstButtonHTML === 'function' ? ivxEstButtonHTML() : '') + '<button class="btn btn-primary" data-a="ivp-new" id="ivp-new">' + ic('plus') + esc(t('ivp_new')) + '</button></div></div>' +
    (L.length ? '<div class="ivp-cards" id="ivp-cards">' + L.map(a => {
      const s = ivpStats(a), i = a.inv;
      return '<article class="card card-p ivp-card' + (i.status === 'closed' ? ' closed' : '') + '" data-id="' + esc(a.id) + '"><div class="row between"><h2>' + archDot(a) + esc(a.name || i.code) + '</h2><span class="ivp-badge ' + esc(i.status) + '">' + esc(t('ivp_st_' + i.status)) + '</span></div>' +
        '<div class="small muted">' + esc([i.code, i.client, t('ivp_mode_' + i.mode)].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="ivp-kpis"><div><b>' + s.boxes + '</b> / ' + i.box_to + '<small>' + esc(t('ivp_k_boxes')) + '</small></div><div><b>' + s.binders + '</b> / ' + i.binder_to + '<small>' + esc(t('ivp_k_binders')) + '</small></div>' +
          '<div class="' + (s.by.review ? 'warn' : '') + '"><b>' + s.by.review + '</b><small>' + esc(t('ivp_f_review')) + '</small></div><div><b>' + s.by.confirmed + '</b><small>' + esc(t('ivp_f_confirmed')) + '</small></div></div>' +
        ivpBar(s, i) + '<div class="row"><button class="btn btn-sm btn-primary" data-a="ivp-open" data-id="' + esc(a.id) + '">' + esc(t('ivp_open')) + '</button><button class="btn btn-sm" data-a="ivp-phone" data-id="' + esc(a.id) + '">' + ic('qr') + esc(t('ivp_phone')) + '</button></div></article>';
    }).join('') + '</div>' : '<div class="card empty" id="ivp-empty">' + ic('grid', 'lg') + '<p>' + esc(t('ivp_none')) + '</p><button class="btn btn-primary" data-a="ivp-new">' + ic('plus') + esc(t('ivp_new')) + '</button></div>');
}
function ivpBar(s, i){
  const tot = Math.max(1, i.binder_to, s.binders), w = (n) => (100 * n / tot).toFixed(1) + '%';
  return '<div class="ivp-bar" aria-hidden="true"><span class="c" style="width:' + w(s.by.confirmed) + '"></span><span class="p" style="width:' + w(s.by.proposed) + '"></span><span class="r" style="width:' + w(s.by.review) + '"></span><span class="a" style="width:' + w(s.by.captured) + '"></span></div>';
}
function ivpDetailHTML(a){
  const i = a.inv, s = ivpStats(a);
  const kind = (k) => t('ivp_kind_' + (INV_BATCH_KINDS.includes(k) ? k : 'binder'));
  const batches = i.batches.length ? '<table class="tbl ivp-batches"><tbody>' + i.batches.slice().reverse().map(b => '<tr><td>' + esc(t('ivp_batch_row', {k:kind(b.kind), a:invNumber(i, b.kind, b.from), z:invNumber(i, b.kind, b.to), n:b.to - b.from + 1})) + '</td><td class="small muted">' + esc(fmtDate(b.at)) + (b.printed_at ? ' · ' + esc(t('ivp_printed', {d:fmtDate(b.printed_at)})) : '') + '</td>' +
      '<td class="acts"><button class="btn btn-sm" data-a="ivp-print" data-id="' + esc(a.id) + '" data-b="' + esc(b.id) + '">' + ic('printer') + esc(t('ivp_print')) + '</button><button class="btn btn-sm" data-a="ivp-manifest" data-id="' + esc(a.id) + '" data-b="' + esc(b.id) + '">' + ic('download') + esc(t('ivp_manifest')) + '</button></td></tr>').join('') + '</tbody></table>'
    : '<div class="small muted">' + esc(t('ivp_batch_none')) + '</div>';
  return '<div class="page-h"><div><h1>' + archDot(a) + esc(a.name || i.code) + ' <span class="ivp-badge ' + esc(i.status) + '">' + esc(t('ivp_st_' + i.status)) + '</span>' + helpDot('inventory') + '</h1><p>' + esc([i.code, i.client, t('ivp_mode_' + i.mode), i.ai ? 'AI' : ''].filter(Boolean).join(' · ')) + '</p></div>' +
      '<div class="row"><button class="btn" data-a="ivp-list">' + ic('list') + esc(t('ivp_back')) + '</button><button class="btn" data-a="ivp-edit" data-id="' + esc(a.id) + '" id="ivp-edit">' + ic('pencil') + esc(t('ivp_edit')) + '</button>' +
      '<button class="btn btn-primary" data-a="ivp-phone" data-id="' + esc(a.id) + '" id="ivp-phone">' + ic('qr') + esc(t('ivp_phone')) + '</button></div></div>' +
    '<div class="grid g2 ivp-top"><div class="card card-p"><div class="row between"><h2>' + esc(t('ivp_batches')) + '</h2><button class="btn btn-sm btn-primary" data-a="ivp-batch" data-id="' + esc(a.id) + '" id="ivp-batch">' + ic('plus') + esc(t('ivp_batch_new')) + '</button></div>' + batches + '</div>' +
      '<div class="card card-p"><div class="ivp-kpis big"><div><b>' + s.boxes + '</b> / ' + i.box_to + '<small>' + esc(t('ivp_k_boxes')) + '</small></div><div><b>' + s.binders + '</b> / ' + i.binder_to + '<small>' + esc(t('ivp_k_binders')) + '</small></div>' +
        '<div class="' + (s.by.review ? 'warn' : '') + '"><b>' + s.by.review + '</b><small>' + esc(t('ivp_f_review')) + '</small></div><div><b>' + s.by.proposed + '</b><small>' + esc(t('ivp_f_proposed')) + '</small></div><div><b>' + s.by.confirmed + '</b><small>' + esc(t('ivp_f_confirmed')) + '</small></div></div>' +
        (i.doc || s.docs ? '<div class="small muted">' + esc(t('ivp_k_docs')) + ': <b>' + s.docs + '</b></div>' : '') + ivpBar(s, i) + '</div></div>' +
    (typeof ivpProHTML === 'function' ? ivpProHTML(a) : '') +
    '<div class="card" style="margin-top:16px"><div class="toolbar"><h2 style="margin:0 8px 0 0">' + esc(t('ivp_grid')) + '</h2><div class="search">' + ic('search') + '<input class="inp" type="search" data-ivq="1" id="ivp-q" value="' + esc(IVP.q) + '" placeholder="' + esc(t('ivp_q_ph')) + '"></div>' +
      (i.doc || s.docs ? '<div class="seg" id="ivp-level">' + [['', 'ivp_lv_all'], ['binder', 'ivp_lv_binder'], ['doc', 'ivp_lv_doc']].map(([v, k]) => '<button data-a="ivp-lv" data-v="' + v + '" class="' + (IVP.lv === v ? 'on' : '') + '">' + esc(t(k)) + '</button>').join('') + '</div>' : '') +
      '<div class="seg" id="ivp-filter">' + [['', 'ivp_f_all'], ['review', 'ivp_f_review'], ['proposed', 'ivp_f_proposed'], ['captured', 'ivp_f_captured'], ['confirmed', 'ivp_f_confirmed']].map(([v, k]) => '<button data-a="ivp-f" data-v="' + v + '" class="' + (IVP.f === v ? 'on' : '') + '">' + esc(t(k)) + ' <span class="muted">' + (v ? s.by[v] : s.binders) + '</span></button>').join('') + '</div>' +
      '<span style="flex:1"></span>' + (typeof ivpAiButtonHTML === 'function' ? ivpAiButtonHTML(a) : '') + (s.safe ? '<button class="btn btn-sm btn-primary" data-a="ivp-confirm-safe" data-id="' + esc(a.id) + '" id="ivp-confirm-safe">' + ic('check') + esc(t('ivp_confirm_safe', {n:s.safe})) + '</button>' : '') +
      '<button class="btn btn-sm" data-a="ivp-confirm-sel" data-id="' + esc(a.id) + '" id="ivp-confirm-sel"' + (IVP.sel.size ? '' : ' disabled') + '>' + ic('check') + esc(t('ivp_confirm_sel', {n:IVP.sel.size})) + '</button></div>' +
      '<div id="ivp-grid">' + ivpGridHTML(a) + '</div></div>';
}
function ivpRows(a){
  const q = IVP.q.trim().toLowerCase();
  return ivpBinders(a).filter(b => (!IVP.f || ivpState(b) === IVP.f) && (!IVP.lv || invLevel(b) === IVP.lv) && (!q || [b.speaking_code, b.company_name, b.binder_title, b.ref_year, b.tags, b.notes, b.inv && b.inv.voice, b.inv && b.inv.ai && b.inv.ai.text].join(' ').toLowerCase().includes(q)))
    .sort((x, y) => ((x.inv && x.inv.n) || 0) - ((y.inv && y.inv.n) || 0) || naturalCmp(x.speaking_code, y.speaking_code));
}
function ivpGridHTML(a){
  const rows = ivpRows(a); if (!ivpBinders(a).length) return '<div class="empty" id="ivp-grid-none">' + esc(t('ivp_grid_none')) + '</div>';
  if (!rows.length) return '<div class="empty">' + esc(t('sq_none_f')) + '</div>';
  const lim = IVP.lim || 60, show = rows.slice(0, lim);
  const inp = (b, k, lab) => '<label class="ivp-fd"><span>' + esc(t(lab)) + '</span><input class="inp inp-sm" data-ivf="' + k + '" data-id="' + esc(b.id) + '" value="' + esc(b[k] || '') + '"></label>';
  return '<div class="ivp-grid">' + show.map(b => {
    const i = b.inv || {}, st = ivpState(b), ai = i.ai || null, loc = b.location_id && typeof locById === 'function' ? locById(b.location_id) : null;
    return '<div class="ivp-item st-' + st + '" data-id="' + esc(b.id) + '"><div class="ivp-ph" data-ivph="' + esc(i.ph || '') + '" data-a="ivp-photo" data-id="' + esc(b.id) + '">' + ivpPhotoHTML(i.ph) + '</div>' +
      '<div class="ivp-body"><div class="row between"><label class="ivp-sel"><input type="checkbox" data-ivsel="' + esc(b.id) + '"' + (IVP.sel.has(b.id) ? ' checked' : '') + '> <b class="mono">' + esc(b.speaking_code) + '</b></label><span class="ivp-st st-' + st + '">' + esc(t('ivp_s_' + st)) + '</span></div>' +
        '<div class="tiny muted">' + esc([i.lvl === 'doc' ? t('ivp_doc_in', {f:i.folder || i.parent || ''}) : '', loc ? t('ivp_box', {b:loc.name || loc.code}) : (i.box ? t('ivp_box', {b:i.box}) : ''), ai ? t('ivp_ai', {c:Math.round((+ai.confidence || 0) * 100)}) : (i.ph ? t('ivp_ai_none') : ''), i.by ? t('ivp_by', {w:i.by, d:fmtDate(i.at || b.created_at, true)}) : ''].filter(Boolean).join(' · ')) + '</div>' +
        (i.voice ? '<div class="tiny ivp-voice">' + esc(t('ivp_voice', {v:i.voice})) + '</div>' : '') + (ai && ai.text ? '<div class="tiny muted ivp-ocr" title="' + esc(ai.text) + '">“' + esc(ai.text.slice(0, 140)) + '”</div>' : '') +
        inp(b, 'company_name', 'ivp_fd_company') + inp(b, 'binder_title', 'ivp_fd_title') + '<div class="row">' + inp(b, 'ref_year', 'ivp_fd_year') + inp(b, 'tags', 'ivp_fd_tags') + '</div>' +
        '<div class="row"><button class="btn btn-sm' + (st === 'confirmed' ? '' : ' btn-primary') + '" data-a="ivp-confirm" data-id="' + esc(b.id) + '"' + (st === 'confirmed' ? ' disabled' : '') + '>' + ic('check') + esc(st === 'confirmed' ? t('ivp_confirmed') : t('ivp_confirm')) + '</button><button class="btn btn-sm" data-a="edit" data-id="' + esc(b.id) + '">' + ic('pencil') + esc(t('ivp_card')) + '</button></div></div></div>';
  }).join('') + '</div>' + (rows.length > lim ? '<div style="text-align:center;padding:12px"><button class="btn" data-a="ivp-more">' + esc(t('ivp_more', {n:rows.length - lim})) + '</button></div>' : '');
}
function ivpPhotoHTML(ph){
  if (!ph) return '<div class="ivp-ph-none">' + ic('camera') + '<small>' + esc(t('ivp_photo_none')) + '</small></div>';
  const u = IVP.photos.get(ph);
  if (u === false) return '<div class="ivp-ph-none">' + ic('alert') + '<small>' + esc(t('ivp_photo_err')) + '</small></div>';
  return u ? '<img src="' + esc(u) + '" alt="" loading="lazy">' : '<div class="ivp-ph-none"><small>' + esc(t('ivp_photo_load')) + '</small></div>';
}
/** Spine photos: this browser's IndexedDB first (local mode / the PC that captured), then the server. */
async function ivpPhotoGet(ph){
  if (IVP.photos.has(ph)) return IVP.photos.get(ph);
  try { const r = typeof IVDB !== 'undefined' ? await IVDB.get(ph) : null; if (r && r.data){ IVP.photos.set(ph, r.data); return r.data; } } catch(e){}
  const conf = typeof srvConf === 'function' ? srvConf() : null;
  if (!conf){ IVP.photos.set(ph, false); return false; }
  try { const r = await srvClient(conf).call('photo', {q:{id:ph}}); const u = 'data:' + (r.mime || 'image/jpeg') + ';base64,' + r.data; IVP.photos.set(ph, u); return u; }
  catch(e){ if (e.code !== 'offline') IVP.photos.set(ph, false); return false; }
}
function ivpMountPhotos(){
  const els = $$('[data-ivph]').filter(el => el.dataset.ivph && !IVP.photos.has(el.dataset.ivph) && !IVP.loading.has(el.dataset.ivph));
  let k = 0;
  const next = async () => {
    const el = els[k++]; if (!el) return;
    const ph = el.dataset.ivph; IVP.loading.add(ph);
    await ivpPhotoGet(ph); IVP.loading.delete(ph);
    $$('[data-ivph="' + ph + '"]').forEach(x => { x.innerHTML = ivpPhotoHTML(ph); });
    return next();
  };
  for (let i = 0; i < 4; i++) next();
}
function ivpRefresh(){ if (S.view !== 'inv') return; const y = window.scrollY; renderView(); window.scrollTo(0, y); }
function ivpGridRefresh(){ const a = ivpProj(IVP.open), g = $('#ivp-grid'); if (a && g){ g.innerHTML = ivpGridHTML(a); ivpMountPhotos(); } }

/* ---------------- modals ---------------- */
function ivpFormHTML(a){
  const i = a ? a.inv : normalizeInv({}), nm = a ? a.name : '', code = a ? i.code : '';
  const opt = (v, k, cur) => '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + esc(t(k)) + '</option>';
  const tpls = invTemplates(S.settings), own = tpls.filter(x => x.custom), std = tpls.filter(x => !x.custom), tn = (x) => esc(S.lang === 'en' ? x.en : x.it);
  const tplSel = a ? '' : '<div class="field"><label for="ivp-tpl">' + esc(t('ivp_f_tpl')) + '</label><select class="inp" id="ivp-tpl"><option value="">' + esc(t('ivp_f_tpl_none')) + '</option>' +
    (own.length ? '<optgroup label="' + esc(t('ivp_tpl_own')) + '">' + own.map(x => '<option value="' + esc(x.id) + '">' + tn(x) + '</option>').join('') + '</optgroup>' : '') +
    '<optgroup label="' + esc(t('ivp_tpl_std')) + '">' + std.map(x => '<option value="' + esc(x.id) + '">' + tn(x) + '</option>').join('') + '</optgroup></select></div>';
  const def = invPriceDefaults(S.settings), pr = invPriceNorm(i.price);
  const prices = '<div class="field"><label>' + esc(t('ivp_f_prices')) + '</label><div class="ivp-prices" id="ivp-prices">' + INV_PRICE_KEYS.map(k => '<label class="ivp-pr"><span class="small">' + esc(t('ivp_pr_' + k)) + '</span><input class="inp inp-sm" id="ivp-pr-' + k + '" inputmode="decimal" value="' + (pr[k] === null ? '' : esc(String(pr[k]).replace('.', S.lang === 'en' ? '.' : ','))) + '" placeholder="' + esc(fmtMoneyPlain(def[k])) + '"></label>').join('') + '</div>' +
    '<div class="hint">' + esc(t('ivp_f_prices_h', {v:'€ ' + fmtMoneyPlain(def.binder) + ' / ' + t('ivp_pr_binder')})) + '</div></div>';
  return '<div class="stack" id="ivp-form">' + tplSel + '<div class="field"><label for="ivp-name">' + esc(t('ivp_f_name')) + '</label><input class="inp" id="ivp-name" value="' + esc(nm) + '" placeholder="' + esc(t('ivp_f_name_ph')) + '"></div>' +
    '<div class="grid g2"><div class="field"><label for="ivp-code">' + esc(t('ivp_f_code')) + '</label><input class="inp mono" id="ivp-code" value="' + esc(code) + '" maxlength="12"' + (a && a.inv.batches.length ? ' readonly' : '') + '><div class="hint" id="ivp-code-h">' + esc(t('ivp_f_code_h', {c:code || 'ROSSI24'})) + '</div></div>' +
      '<div class="field"><label for="ivp-client">' + esc(t('ivp_f_client')) + '</label><input class="inp" id="ivp-client" value="' + esc(i.client) + '" list="ivp-clients"><datalist id="ivp-clients">' + (S.clients || []).slice(0, 500).map(c => '<option value="' + esc(c.company_name || c.name || '') + '">').join('') + '</datalist><div class="hint">' + esc(t('ivp_f_client_h')) + '</div></div></div>' +
    '<div class="grid g2"><div class="field"><label for="ivp-tags">' + esc(t('ivp_f_tags')) + '</label><textarea class="inp" id="ivp-tags" rows="6">' + esc(i.tags.join('\n')) + '</textarea></div><div class="stack">' +
      '<div class="field"><label>' + esc(t('ivp_f_years')) + '</label><div class="row"><span class="small">' + esc(t('ivp_f_from')) + '</span><input class="inp inp-sm" id="ivp-yf" type="number" min="1800" max="2200" value="' + (i.year_from || '') + '" style="width:90px"><span class="small">' + esc(t('ivp_f_to')) + '</span><input class="inp inp-sm" id="ivp-yt" type="number" min="1800" max="2200" value="' + (i.year_to || '') + '" style="width:90px"></div></div>' +
      '<div class="field"><label for="ivp-mode">' + esc(t('ivp_f_mode')) + '</label><select class="inp" id="ivp-mode" title="' + esc(t('ivp_mode_h')) + '">' + INV_MODES.map(m => opt(m, 'ivp_mode_' + m, i.mode)).join('') + '</select><div class="hint">' + esc(t('ivp_mode_h')) + '</div></div>' +
      '<label class="row small"><input type="checkbox" id="ivp-doc"' + (i.doc ? ' checked' : '') + '> ' + esc(t('ivp_f_doc')) + '</label>' +
      '<label class="row small"><input type="checkbox" id="ivp-ai"' + (i.ai ? ' checked' : '') + '> ' + esc(t('ivp_f_ai')) + '</label>' +
      '<div class="field"><label for="ivp-auto">' + esc(t('ivp_f_auto')) + '</label><select class="inp inp-sm" id="ivp-auto">' + [0.7, 0.8, 0.85, 0.9, 0.95].map(v => '<option value="' + v + '"' + (Math.abs(i.auto_confirm - v) < 0.001 ? ' selected' : '') + '>' + Math.round(v * 100) + '%</option>').join('') + '</select></div></div></div>' +
    (a ? '<div class="field"><label for="ivp-status">' + esc(t('ivp_f_status')) + '</label><select class="inp" id="ivp-status">' + opt('open', 'ivp_st_open', i.status) + opt('closed', 'ivp_st_closed', i.status) + '</select><div class="hint">' + esc(t('ivp_closed_d')) + '</div></div>'
       : '<div class="grid g2"><div class="field"><label for="ivp-nb">' + esc(t('ivp_f_boxes')) + '</label><input class="inp" id="ivp-nb" type="number" min="0" max="20000" value="50"></div><div class="field"><label for="ivp-nf">' + esc(t('ivp_f_binders')) + '</label><input class="inp" id="ivp-nf" type="number" min="0" max="20000" value="500"></div></div>') +
    prices + '<div class="field"><label for="ivp-notes">' + esc(t('ivp_f_notes')) + '</label><textarea class="inp" id="ivp-notes" rows="2">' + esc(i.notes) + '</textarea></div><div class="err-t small" id="ivp-err"></div></div>';
}
function ivpFormRead(){
  const v = (id) => ($('#' + id) || {}).value || '';
  return {name:v('ivp-name').replace(/\s+/g, ' ').trim(), code:invCodeClean(v('ivp-code')), client:v('ivp-client'), tags:invNormTags(v('ivp-tags').split('\n')), year_from:invYear(v('ivp-yf')), year_to:invYear(v('ivp-yt')),
    mode:v('ivp-mode'), ai:!!($('#ivp-ai') || {}).checked, auto_confirm:+v('ivp-auto') || INV_AUTO_CONFIRM, status:v('ivp-status') || 'open', notes:v('ivp-notes'), boxes:parseInt(v('ivp-nb'), 10) || 0, binders:parseInt(v('ivp-nf'), 10) || 0,
    doc:!!($('#ivp-doc') || {}).checked, price:invPriceNorm(INV_PRICE_KEYS.reduce((o, k) => (o[k] = v('ivp-pr-' + k), o), {})), template:v('ivp-tpl')};
}
function ivpOpenForm(id){
  const a = id ? ivpProj(id) : null;
  openModal({title:a ? t('ivp_edit_t', {p:a.name}) : t('ivp_new_t'), size:'lg', body:ivpFormHTML(a),
    onMount:(ov) => { const n = ov.querySelector('#ivp-name'), c = ov.querySelector('#ivp-code'); let touched = !!(a && a.inv.code);
      const tp = ov.querySelector('#ivp-tpl');
      if (tp) tp.addEventListener('change', () => { const x = invTemplates(S.settings).find(y => y.id === tp.value); if (x) ivpTplFill(ov, invTplFields(x)); });
      if (c) c.addEventListener('input', () => { touched = true; c.value = invCodeClean(c.value); const h = ov.querySelector('#ivp-code-h'); if (h) h.textContent = t('ivp_f_code_h', {c:c.value || 'ROSSI24'}); });
      if (n && c && !c.readOnly) n.addEventListener('input', () => { if (!touched){ c.value = invSuggestCode(n.value); const h = ov.querySelector('#ivp-code-h'); if (h) h.textContent = t('ivp_f_code_h', {c:c.value || 'ROSSI24'}); } }); },
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:a ? t('save') : t('ivp_new'), cls:'btn btn-primary', icon:'check', fn:() => {
      const f = ivpFormRead(), err = $('#ivp-err');
      if (!f.name){ if (err) err.textContent = t('ivp_e_name'); return; }
      f.code = f.code || invSuggestCode(f.name);
      if (invProjects().some(x => x !== a && x.inv.code === f.code)){ if (err) err.textContent = t('ivp_e_code', {c:f.code}); return; }
      if (a){
        const before = clone(a.inv);
        archSaveFields(a.id, {name:f.name});
        Object.assign(a.inv, normalizeInv(Object.assign({}, a.inv, {code:a.inv.batches.length ? a.inv.code : f.code, client:f.client, tags:f.tags, year_from:f.year_from, year_to:f.year_to, mode:f.mode, ai:f.ai, auto_confirm:f.auto_confirm, status:f.status, notes:f.notes, doc:f.doc, price:f.price})));
        archTouch(a);
        const ch = ['code', 'client', 'tags', 'year_from', 'year_to', 'mode', 'ai', 'auto_confirm', 'status', 'notes', 'doc', 'price'].filter(k => JSON.stringify(before[k]) !== JSON.stringify(a.inv[k]));
        if (ch.length) logAct('inventory.edit', ivpTarget(a), 'Modificato il progetto ' + a.name + ': ' + ch.join(', '), {changed:ch.reduce((o, k) => (o[k] = [before[k], a.inv[k]], o), {})});
        commit(); closeModal(true); toast(t('ivp_saved'));
      } else {
        const p = ivpCreate(f); commit(); closeModal(true); IVP.open = p.id; toast(t('ivp_created', {p:p.name}));
      }
      if (S.view !== 'inv'){ S.view = 'inv'; renderAll(); } else ivpRefresh();
    }}]});
}
/** Fills the project form from a template (only the fields a template has). */
function ivpTplFill(ov, f){
  const set = (id, v) => { const el = ov.querySelector('#' + id); if (el) el.value = v; };
  set('ivp-tags', f.tags.join('\n')); set('ivp-yf', f.year_from || ''); set('ivp-yt', f.year_to || ''); set('ivp-mode', f.mode); set('ivp-auto', String(f.auto_confirm));
  const d = ov.querySelector('#ivp-doc'); if (d) d.checked = !!f.doc; const ai = ov.querySelector('#ivp-ai'); if (ai) ai.checked = f.ai !== false;
  INV_PRICE_KEYS.forEach(k => set('ivp-pr-' + k, f.price && f.price[k] !== null && f.price[k] !== undefined ? String(f.price[k]) : ''));
}
/** 1234.5 → "1.234,50" (it) / "1,234.50" (en), no currency sign. */
function fmtMoneyPlain(n){ try { return Number(n || 0).toLocaleString(S.lang === 'en' ? 'en-GB' : 'it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}); } catch(e){ return Number(n || 0).toFixed(2); } }
function ivpOpenBatch(id){
  const a = ivpProj(id); if (!a) return;
  openModal({title:t('ivp_batch_t', {p:a.name}), body:'<div class="stack" id="ivp-bt"><p class="small">' + esc(t('ivp_batch_hint', {b:a.inv.box_to, f:a.inv.binder_to})) + '</p>' +
      '<div class="field"><label>' + esc(t('ivp_batch_kind')) + '</label><div class="seg" id="ivp-bt-kind"><button type="button" data-k="binder" class="on">' + esc(t('ivp_kind_binder')) + '</button><button type="button" data-k="box">' + esc(t('ivp_kind_box')) + '</button>' +
        (a.inv.doc ? '<button type="button" data-k="doc">' + esc(t('ivp_kind_doc')) + '</button><button type="button" data-k="any">' + esc(t('ivp_kind_any')) + '</button>' : '') + '</div>' + (a.inv.doc ? '<div class="hint">' + esc(t('ivp_batch_kind_h')) + '</div>' : '') + '</div>' +
      '<div class="field"><label for="ivp-bt-n">' + esc(t('ivp_batch_n')) + '</label><input class="inp" id="ivp-bt-n" type="number" min="1" max="20000" value="200"></div></div>',
    onMount:(ov) => { ov.querySelectorAll('#ivp-bt-kind button').forEach(b => b.addEventListener('click', () => { ov.querySelectorAll('#ivp-bt-kind button').forEach(x => x.classList.toggle('on', x === b)); })); },
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('ivp_batch_new'), cls:'btn btn-primary', icon:'plus', fn:() => {
      const k = ($('#ivp-bt-kind .on') || {dataset:{k:'binder'}}).dataset.k, n = parseInt(($('#ivp-bt-n') || {}).value, 10) || 0; if (n < 1) return;
      const b = ivpBatch(a, k, n); commit(); closeModal(true); ivpRefresh(); ivpOpenPrint(a.id, b.id);
    }}]});
}
function ivpPhoneUrl(a){
  const tail = 'scan.html?inv=' + encodeURIComponent(a.id);
  try { if (typeof dmConfig === 'function' && dmConfig().mode === 'web') return new URL(tail, location.href).href; } catch(e){}
  const tpl = String(S.settings.destTemplate || '');
  if (/^https?:\/\//.test(tpl)){ const i = tpl.indexOf('/q/'); if (i > 0) return tpl.slice(0, i) + '/' + tail; const j = tpl.indexOf('scan.html'); if (j > 0) return tpl.slice(0, j) + tail; }
  return location.href.replace(/[#?].*$/, '').replace(/[^\/]*$/, '') + tail;
}
function ivpOpenPhone(id){
  const a = ivpProj(id); if (!a) return;
  const url = ivpPhoneUrl(a), local = !/^https?:/.test(url);
  openModal({title:t('ivp_phone_t'), body:'<div class="stack ivp-phone" id="ivp-phone-m"><p>' + esc(t('ivp_phone_p')) + '</p>' + (local ? '<div class="info-box small">' + ic('info') + '<div>' + esc(t('ivp_phone_local')) + '</div></div>' : '') +
      '<div class="ivp-phone-qr">' + DMQR.svg(url, {ecl:'M', quiet:2, fg:'#000'}) + '</div><a class="mono small" id="ivp-phone-url" href="' + esc(url) + '" target="_blank" rel="noopener" style="word-break:break-all">' + esc(url) + '</a></div>',
    buttons:[{label:t('close'), cls:'btn btn-primary', action:'modal-close'}]});
}

/* ---------------- printing + manifest ---------------- */
function ivpBatchCodes(a, b){ const out = []; for (let n = b.from; n <= b.to; n++) out.push({kind:b.kind, n, code:invLabelCode(a.inv.prefix, b.kind, n), num:invNumber(a.inv, b.kind, n)}); return out; }
/** One inventory label in a reading frame f (mm): QR + big number + SCATOLA / FALDONE + project (+ client). */
function ivpLabelHTML(a, it, f){
  const pad = Math.max(1.5, Math.min(4, Math.min(f.w, f.h) * 0.06)), land = f.w >= f.h * 1.15;
  const q = land ? Math.min(f.h - 2 * pad, f.w * 0.46) : Math.min(f.w - 2 * pad, f.h * 0.52);
  const tw = land ? f.w - q - 3 * pad : f.w - 2 * pad, th = land ? f.h - 2 * pad : f.h - q - 3 * pad;
  const big = Math.max(2.2, Math.min(th * 0.34, tw / (it.num.length * 0.6))), kw = Math.max(1.6, Math.min(big * 0.42, th * 0.16)), sm = Math.max(1.5, Math.min(kw * 0.95, th * 0.13));
  const svg = DMQR.svg(shortUrl(it.code), {ecl:S.settings.qrEcc || 'M', quiet:1, fg:'#000'});
  const txt = '<div style="position:absolute;' + (land ? 'left:' + MM(q + 2 * pad) + ';top:' + MM(pad) : 'left:' + MM(pad) + ';top:' + MM(q + 2 * pad)) + ';width:' + MM(tw) + ';height:' + MM(th) + ';display:flex;flex-direction:column;justify-content:center;overflow:hidden;font-family:\'DM Inter\',Arial,sans-serif;color:#000">' +
    '<div style="font-size:' + MM(kw) + ';font-weight:800;letter-spacing:.12em">' + esc(t('ivp_kw_' + (INV_BATCH_KINDS.includes(it.kind) ? it.kind : 'binder'))) + '</div>' +
    '<div class="ivp-num" style="font-size:' + MM(big) + ';font-weight:800;line-height:1.05;white-space:nowrap;font-family:\'DM Mono\',monospace">' + esc(it.num) + '</div>' +
    '<div style="font-size:' + MM(sm) + ';font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(a.name || a.inv.code) + '</div>' +
    (a.inv.client ? '<div style="font-size:' + MM(sm * 0.9) + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(a.inv.client) + '</div>' : '') +
    '<div style="font-size:' + MM(Math.max(1.3, sm * 0.7)) + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:\'DM Mono\',monospace">' + esc(it.code) + '</div></div>';
  return '<div class="ivp-lab" data-code="' + esc(it.code) + '" style="position:absolute;left:0;top:0;width:' + MM(f.w) + ';height:' + MM(f.h) + ';background:#fff"><div style="position:absolute;left:' + MM(pad) + ';top:' + MM(pad) + ';width:' + MM(q) + ';height:' + MM(q) + '">' + svg + '</div>' + txt + '</div>';
}
function ivpSlotHTML(a, it, g){
  const f = frameGeo(g), inner = ivpLabelHTML(a, it, f);
  if (!g.turn) return inner;
  const tf = turnDir(S.print) === -90 ? 'translateY(' + MM(g.h) + ') rotate(-90deg)' : 'translateX(' + MM(g.w) + ') rotate(90deg)';
  return '<div class="lab-turn" style="position:absolute;left:0;top:0;width:' + MM(f.w) + ';height:' + MM(f.h) + ';transform-origin:0 0;transform:' + tf + '">' + inner + '</div>';
}
function ivpSheets(a, items, start){
  const g = S.print.geometry, N = slotCount(), seq = slotSeq(), pages = [];
  let idx = 0, first = true;
  while (idx < items.length && pages.length < 2000){
    let inner = '';
    for (let n = first ? Math.max(0, Math.min(N - 1, start - 1)) : 0; n < N && idx < items.length; n++){
      const s = seq[n], R = slotRect(s);
      inner += '<div class="slotbox' + (g.cut ? ' cut' : '') + '" style="left:' + MM(R.x) + ';top:' + MM(R.y) + ';width:' + MM(g.w) + ';height:' + MM(g.h) + ';' + (g.radius ? 'border-radius:' + MM(g.radius) + ';' : '') + '">' + ivpSlotHTML(a, items[idx++], g) + '</div>';
    }
    pages.push(sheetWrap(inner)); first = false;
  }
  return pages;
}
function ivpOpenPrint(id, bid){
  const a = ivpProj(id), b = a && a.inv.batches.find(x => x.id === bid); if (!b) return;
  const items = ivpBatchCodes(a, b), N = slotCount(), preset = findPreset(S.print.presetId);
  const pages = (st) => Math.ceil((items.length + Math.max(0, st - 1)) / N);
  openModal({title:t('ivp_print_t', {a:items[0].num, z:items[items.length - 1].num}), body:'<div class="stack" id="ivp-pr"><p class="small" id="ivp-pr-p">' + esc(t('ivp_print_p', {s:preset ? preset.name : S.print.presetId, n:items.length, p:pages(1)})) + '</p>' +
      '<div class="field"><label for="ivp-pr-from">' + esc(t('ivp_print_from')) + '</label><input class="inp inp-sm" id="ivp-pr-from" type="number" min="1" max="' + N + '" value="1" style="width:90px"></div>' +
      '<div class="ivp-pr-prev">' + ivpLabelPreview(a, items[0]) + '</div></div>',
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('ivp_print_go'), cls:'btn btn-primary', icon:'printer', fn:async () => {
      const st = Math.max(1, Math.min(N, parseInt(($('#ivp-pr-from') || {}).value, 10) || 1));
      closeModal(true);
      await doPrint('labels', ivpSheets(a, items, st).join(''));
      b.printed_at = nowISO(); b.format = S.print.presetId; archTouch(a);
      logAct('inventory.print', ivpTarget(a), 'Stampate ' + items.length + ' etichette dell\'inventario ' + a.name + ' (' + items[0].num + ' – ' + items[items.length - 1].num + ')', {batch:b.id, preset:S.print.presetId, from:b.from, to:b.to, kind:b.kind});
      commit(); ivpRefresh();
    }}]});
}
function ivpLabelPreview(a, it){
  const f = frameGeo(S.print.geometry), k = Math.min(1, 90 / Math.max(f.w, f.h));
  return '<div class="ivp-prev" style="width:' + MM(f.w * k) + ';height:' + MM(f.h * k) + '"><div style="transform:scale(' + k + ');transform-origin:0 0;position:relative;width:' + MM(f.w) + ';height:' + MM(f.h) + '">' + ivpLabelHTML(a, it, f) + '</div></div>';
}
function ivpManifest(id, bid){
  const a = ivpProj(id), b = a && a.inv.batches.find(x => x.id === bid); if (!b) return;
  const tag = (it) => ['docmap26', 'inventario', slugify(a.inv.code), {box:'scatola', doc:'documento', any:'jolly'}[it.kind] || 'faldone', it.num].filter(Boolean).join(',');
  const rows = [MANIFEST_HEADER].concat(ivpBatchCodes(a, b).map(it => [it.code, shortUrl(it.code), renderDest(S.settings.destTemplate, {short_code:it.code, speaking_code:it.num, id:'inv-' + it.code}), tag(it)]));
  const name = 'manifest_qr7_' + slugify(a.inv.code) + '_' + (b.kind === 'box' ? 'S' : 'F') + b.from + '-' + b.to + '.csv';
  download(name, manifestText(rows), 'text/csv'); toast(t('ex_done', {f:name}));
}

/* ---------------- SQLite: inv_json columns (added once, only if missing) ---------------- */
function ivpDbMigrate(db){
  ['archives', 'binders'].forEach(tb => { try { if (!dbQuery('PRAGMA table_info(' + tb + ')', null, db).some(r => r.name === 'inv_json')) db.exec('ALTER TABLE ' + tb + ' ADD COLUMN inv_json TEXT'); } catch(e){} });
}
function ivpDbSync(db){
  try {
    ivpDbMigrate(db);
    const ua = db.prepare('UPDATE archives SET inv_json = ? WHERE id = ?'); (S.archives || []).forEach(a => { if (a.inv) ua.run([JSON.stringify(a.inv), a.id]); }); ua.free();
    const ub = db.prepare('UPDATE binders SET inv_json = ? WHERE id = ?'); S.binders.forEach(b => { if (b.inv) ub.run([JSON.stringify(b.inv), b.id]); }); ub.free();
  } catch(e){ console.warn('inv db', e); }
}
function ivpDbRead(db, W){
  const map = (tb) => { try { if (!dbQuery('PRAGMA table_info(' + tb + ')', null, db).some(r => r.name === 'inv_json')) return null; return new Map(dbQuery('SELECT id, inv_json FROM ' + tb + ' WHERE inv_json IS NOT NULL', null, db).map(r => [r.id, r.inv_json])); } catch(e){ return null; } };
  const put = (list, m) => { if (!m || !Array.isArray(list)) return; list.forEach(x => { const j = m.get(x.id); if (j) try { const v = JSON.parse(j); if (v && typeof v === 'object') x.inv = v; } catch(e){} }); };
  put(W.archives, map('archives')); put(W.binders, map('binders'));
}

/* ---------------- actions + events ---------------- */
const IVP_ACTIONS = {
  'ivp-new': () => ivpOpenForm(''),
  'ivp-open': (el) => { IVP.open = el.dataset.id; IVP.f = ''; IVP.q = ''; IVP.lv = ''; IVP.sel = new Set(); IVP.lim = 60; S.view = 'inv'; renderAll(); window.scrollTo(0, 0); },
  'ivp-list': () => { IVP.open = ''; renderView(); window.scrollTo(0, 0); },
  'ivp-edit': (el) => ivpOpenForm(el.dataset.id),
  'ivp-batch': (el) => ivpOpenBatch(el.dataset.id),
  'ivp-print': (el) => ivpOpenPrint(el.dataset.id, el.dataset.b),
  'ivp-manifest': (el) => ivpManifest(el.dataset.id, el.dataset.b),
  'ivp-phone': (el) => ivpOpenPhone(el.dataset.id),
  'ivp-f': (el) => { IVP.f = el.dataset.v || ''; IVP.lim = 60; ivpRefresh(); },
  'ivp-lv': (el) => { IVP.lv = el.dataset.v || ''; IVP.lim = 60; ivpRefresh(); },
  'ivp-more': () => { IVP.lim = (IVP.lim || 60) + 120; ivpGridRefresh(); },
  'ivp-confirm': (el) => { const b = S.binders.find(x => x.id === el.dataset.id); if (b && ivpConfirm([b], 'one')){ IVP.sel.delete(b.id); ivpRefresh(); } },
  'ivp-confirm-safe': (el) => { const a = ivpProj(el.dataset.id); if (!a) return; const n = ivpConfirm(ivpBinders(a).filter(b => ivpSafe(a, b)), 'safe'); if (n) toast(t('ivp_conf_done', {n})); ivpRefresh(); },
  'ivp-confirm-sel': (el) => { const a = ivpProj(el.dataset.id); if (!a) return; const n = ivpConfirm(ivpBinders(a).filter(b => IVP.sel.has(b.id)), 'selected'); IVP.sel = new Set(); if (n) toast(t('ivp_conf_done', {n})); ivpRefresh(); },
  'ivp-photo': async (el) => { const b = S.binders.find(x => x.id === el.dataset.id), ph = b && b.inv && b.inv.ph, u = ph && IVP.photos.get(ph); if (!u) return;
    const u2 = b.inv.ph2 ? await ivpPhotoGet(b.inv.ph2) : '';   // v12.12: second photo (first page)
    openModal({title:b.speaking_code, size:'lg', body:'<div class="ivp-big"><img src="' + esc(u) + '" alt="">' + (u2 ? '<img src="' + esc(u2) + '" alt="" style="margin-top:8px">' : '') + '</div>' + (b.inv.ai && b.inv.ai.text ? '<p class="small muted">“' + esc(b.inv.ai.text) + '”</p>' : ''), buttons:[{label:t('close'), cls:'btn btn-primary', action:'modal-close'}]}); }
};
if (typeof ACTIONS === 'object') Object.assign(ACTIONS, IVP_ACTIONS);
else document.addEventListener('DOMContentLoaded', () => { if (typeof ACTIONS === 'object') Object.assign(ACTIONS, IVP_ACTIONS); });
document.addEventListener('change', (e) => {
  const el = e.target; if (!el || !el.dataset) return;
  if (el.dataset.ivf){
    const b = S.binders.find(x => x.id === el.dataset.id); if (!b) return;
    const k = el.dataset.ivf, v = String(el.value || '').replace(/\s+/g, ' ').trim(); if (String(b[k] || '') === v) return;
    const before = b[k]; b[k] = k === 'tags' ? invNormTags(v.split(',')).join(', ') : v; ivpTouch(b);
    logAct('binder.edit', {type:'binder', id:b.id, code:b.speaking_code}, 'Modificato il faldone ' + b.speaking_code + ' (revisione inventario): ' + k, {changed:{[k]:[before, b[k]]}, via:'inventory'});
    commit();
  }
  if (el.dataset.ivsel){ if (el.checked) IVP.sel.add(el.dataset.ivsel); else IVP.sel.delete(el.dataset.ivsel); const btn = $('#ivp-confirm-sel'); if (btn){ btn.disabled = !IVP.sel.size; btn.innerHTML = ic('check') + esc(t('ivp_confirm_sel', {n:IVP.sel.size})); } }
});
document.addEventListener('input', (e) => { const el = e.target; if (el && el.dataset && el.dataset.ivq){ IVP.q = el.value; IVP.lim = 60; ivpGridRefresh(); } });

/* ---------------- Impostazioni › Indirizzo dei QR ---------------- */
function ivpQrSettingsHTML(){
  const v = String(S.settings.qrBase || ''), ok = !v || /^https?:\/\/[^\s]+$/i.test(v);
  return '<div class="card card-p stack" style="margin-top:16px" id="ivp-qr-set"><h2>' + esc(t('ivp_qr_h')) + '</h2><p class="small muted">' + esc(t('ivp_qr_p')) + '</p>' +
    '<div class="field"><input class="inp mono small" id="se-qrbase" data-set="qrBase" value="' + esc(v) + '" placeholder="' + esc(QR_BASE_DEFAULT) + '"><div class="hint" id="se-qrbase-h">' + esc(ok ? t('ivp_qr_ex', {u:shortUrl('dm26K8m2P9xL')}) : t('ivp_qr_bad')) + '</div></div></div>';
}
document.addEventListener('input', (e) => { const el = e.target; if (el && el.id === 'se-qrbase'){ const h = $('#se-qrbase-h'), v = el.value.trim(); if (h) h.textContent = !v || /^https?:\/\/[^\s]+$/i.test(v) ? t('ivp_qr_ex', {u:shortUrl('dm26K8m2P9xL')}) : t('ivp_qr_bad'); } });

/* ---------------- wrappers ---------------- */
(function ivpWrap(){
  const wrap = (name, fn) => { const orig = window[name]; if (typeof orig !== 'function') return; window[name] = fn(orig); };
  wrap('renderView', (o) => function(){
    if (S.view === 'inv'){ document.documentElement.lang = S.lang; $('#view').innerHTML = viewInv(); ivpMountPhotos(); return; }
    return o.apply(this, arguments);
  });
  wrap('viewSettings', (o) => function(){ return o.apply(this, arguments) + ivpQrSettingsHTML(); });
  wrap('archDbMigrate', (o) => function(db){ const r = o.apply(this, arguments); ivpDbMigrate(db); return r; });
  wrap('archDbSync', (o) => function(db){ const r = o.apply(this, arguments); ivpDbSync(db); return r; });
  wrap('archDbRead', (o) => function(db, W){ const r = o.apply(this, arguments); ivpDbRead(db, W); return r; });
  // phone captures in local mode (same browser): activity-log lines inventory.* carry the records
  wrap('logMerge', (o) => function(list){
    const r = o.apply(this, arguments);
    try {
      if (!S || !Array.isArray(list)) return r;
      let n = 0;
      list.forEach(e => { if (e && /^inventory\./.test(e.action) && e.details && (Array.isArray(e.details.records) || Array.isArray(e.details.tombstones))) n += invApplyRecords(S, e.details.records || [], e.details.tombstones || []); });
      if (n){
        S.binders = S.binders.map(b => b.inv ? Object.assign(normalizeBinder(b), {id:b.id, created_at:b.created_at, updated_at:b.updated_at, inv:b.inv}) : b);
        if (typeof locTouch === 'function') locTouch();
        if (typeof sqClearBanner === 'function') sqClearBanner();
        persist(); if (typeof renderAll === 'function' && !topModal()) renderAll();
      }
    } catch(e){ console.warn('inventory', e); }
    return r;
  });
})();

document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined') return;
  HELP_TOPICS.push({ id:'inventory', guide:null, tags:['start'], related:['print', 'server', 'calib'],
    kw:{it:'inventario progetti etichette scatole faldoni telefono scansione rapida foto costa ai voce tag anni revisione conferma lotti qr7 indirizzo qr', en:'inventory projects labels boxes binders phone rapid scan photo spine ai voice tags years review confirm batches qr address'},
    title:{it:'Progetti di inventario: etichette, telefono, revisione', en:'Inventory projects: labels, phone, review'},
    body:{it:'<p>Per inventariare un archivio di cui non conosci il contenuto. <b>Progetti › Nuovo progetto</b>: nome, codice breve (le etichette diventano ' + HX_K('ROSSI24-0001') + ' per i faldoni e ' + HX_K('ROSSI24-S001') + ' per le scatole), tag rapidi, anni attesi.</p>' +
      '<ol><li><b>Genera etichette</b>: un lotto di scatole o di faldoni. I numeri continuano sempre: puoi stamparne altre quando finiscono, un numero non torna mai.</li>' +
      '<li><b>Stampa</b>: sul foglio scelto in Stampa (prima fai il foglio di prova). <b>Manifest QR7</b> scarica il CSV da caricare su QR7 o sul tuo servizio di QR.</li>' +
      '<li>Attacca le etichette, poi <b>Apri sul telefono</b>: scansiona il QR della scatola, poi un faldone dopo l\'altro con la costa ben visibile. A ogni faldone: beep, foto, faldone creato. Tocca i tag e gli anni, o tieni premuto il microfono e detta ("fatture acquisti 2019"). <b>Annulla</b> entro 10 secondi.</li>' +
      '<li>Con il server online e la lettura AI accesa, la foto della costa viene letta in pochi secondi: ditta, contenuto, anni e tag proposti. Le proposte con fiducia alta sono <b>sicure</b>; le altre vanno in <b>Da rivedere</b>.</li>' +
      '<li><b>Revisione</b> sul PC: correggi nei campi, <b>Conferma</b> uno per uno o <b>Conferma le proposte sicure</b> tutte insieme.</li></ol>' +
      '<p>Senza rete il telefono tiene tutto in coda e lo invia da solo quando torna la connessione. L\'indirizzo dentro i QR si sceglie in <b>Impostazioni › Indirizzo dei QR</b> (di predefinito https://qr7.it/).</p>',
      en:'<p>To inventory an archive whose contents you do not know. <b>Projects › New project</b>: name, short code (labels become ' + HX_K('ROSSI24-0001') + ' for binders and ' + HX_K('ROSSI24-S001') + ' for boxes), quick tags, expected years.</p>' +
      '<ol><li><b>Generate labels</b>: a batch of boxes or binders. Numbers always continue: print more when they run out, a number never comes back.</li>' +
      '<li><b>Print</b>: on the sheet chosen in Print (do the test sheet first). <b>QR7 manifest</b> downloads the CSV to upload to QR7 or your QR service.</li>' +
      '<li>Stick the labels, then <b>Open on the phone</b>: scan the box QR, then one binder after the other with the spine in view. For each binder: beep, photo, binder created. Tap tags and years, or hold the microphone and dictate ("purchase invoices 2019"). <b>Undo</b> within 10 seconds.</li>' +
      '<li>With the online server and AI reading on, the spine photo is read in a few seconds: company, contents, years and tags proposed. High-confidence proposals are <b>safe</b>; the others go to <b>To review</b>.</li>' +
      '<li><b>Review</b> on the PC: fix the fields, <b>Confirm</b> one by one or <b>Confirm the safe proposals</b> all at once.</li></ol>' +
      '<p>Without network the phone keeps everything in a queue and sends it by itself when the connection is back. The address inside the QR codes is chosen in <b>Settings › QR address</b> (default https://qr7.it/).</p>'} });
});
