/* =====================================================================
   DocMap 2026 — v12 (stream Q): statuses on the desktop (index.html). Model: 02d-status.js. CSS: css-status.css.

   - Archive: status badge in the table and on the shelf map, filter UI.fSq ('' | out | missing | overdue | in | neutral | ty:<id>),
     strip "N fuori archivio" above the table, "Stato…" for the ticked binders (bulk, one batch).
   - Binder form: "Stato" panel (current status, quick buttons, documents, history of the binder and of each document).
   - View 'status' ("Fuori archivio", opened from the archive strip / help): what is out, who has it, since when, due /
     overdue, missing; return checks; CSV exports (current out list, every event).
   - "Modalità stato": pick a status, then scan binder (or box) QR codes one after the other with a USB scanner.
   - Impostazioni › "Stati rapidi": add / edit / reorder / disable types (a type with events is never deleted).
   - Every action appends events to S.statusEvents and writes ONE activity-log line (action status.set | status.bulk |
     status.box | status.verify | status.undo, details.events = the events): the log is also how phone events made in
     local mode reach an open desktop (logMerge wrapper below). Undo = compensating 'undo' events (10 s toast),
     never a snapshot restore (events may already be on the server).
   - Sync: packages carry records.status_events (+ settingsSubset.statusTypes/statusTypesAt), the server gets records of
     type 'status_event' (06g srvPush / srvPackage hooks); merged by id, never conflicts.
   ===================================================================== */
'use strict';

const SQV = { mode:null, dash:{q:'', kind:'', who:'', p:''}, rxPeer:'' };

Object.assign(I18N.it, {
  sq_h:'Fuori archivio', sq_p:'Cosa non è in archivio adesso: chi ce l\'ha, da quando e quando deve rientrare. Regola per tutti: quando prendi un faldone scansionalo e premi "Preso", quando lo rimetti a posto scansionalo e premi "Reinserito".',
  sq_k_out:'Fuori archivio', sq_k_overdue:'In ritardo', sq_k_missing:'Mancanti', sq_k_boxes:'Scatole fuori', sq_k_docs:'Documenti fuori',
  sq_f_all:'Movimenti: tutti', sq_f_out:'Fuori archivio', sq_f_missing:'Mancanti', sq_f_overdue:'In ritardo', sq_f_in:'In archivio', sq_f_neutral:'Da verificare',
  sq_strip:'{n} fuori archivio', sq_strip_over:'{n} in ritardo', sq_strip_miss:'{n} mancanti', sq_open_dash:'Apri "Fuori archivio"', sq_back_arch:'Torna all\'archivio',
  sq_bulk:'Stato…', sq_bulk_t:'Stato di {n} faldoni', sq_sheet_t:'Stato — {c}', sq_more:'Altro…', sq_all_types:'Tutti gli stati', sq_confirm:'Conferma', sq_back:'Indietro', sq_cur:'Adesso',
  sq_done:'{s}: {c}', sq_done_n:'{s}: {n} faldoni', sq_undo:'Annulla', sq_undone_t:'Stato annullato', sq_nothing_sel:'Spunta almeno un faldone.',
  sq_ed_h:'Stato del faldone', sq_hist:'Storico', sq_hist_none:'Nessun movimento registrato.', sq_docs:'Documenti', sq_doc_btn:'Stato…', sq_docs_out:'{n} doc. fuori',
  sq_th_what:'Cosa', sq_th_client:'Cliente', sq_th_status:'Stato', sq_th_holder:'Chi lo ha', sq_th_since:'Da quando', sq_th_due:'Rientro', sq_th_by:'Registrato da', sq_th_act:'',
  sq_none_out:'Tutto in archivio: in questo momento non c\'è niente fuori.', sq_none_f:'Niente con questi filtri.',
  sq_ex_out:'Esporta fuori archivio (CSV)', sq_ex_all:'Esporta tutti i movimenti (CSV)', sq_exported:'Esportato: {f}',
  sq_mode:'Modalità stato (lettore QR)', sq_mode_h:'Modalità stato', sq_mode_p:'Scegli lo stato, poi scansiona i QR dei faldoni uno dopo l\'altro con il lettore USB o Bluetooth (o scrivi il codice e premi Invio). Il QR di una scatola applica lo stato a tutta la scatola.',
  sq_mode_scan:'QR o codice del faldone, poi Invio', sq_mode_on:'Stato: {s}', sq_mode_stop:'Fine', sq_mode_count:'{n} registrati', sq_mode_unknown:'QR sconosciuto: {c}', sq_mode_dup:'{c} è già in questo stato', sq_mode_pick:'1. Scegli lo stato', sq_mode_go:'2. Scansiona',
  sq_q_ph:'Cerca codice, cliente, chi lo ha, nota…', sq_who_all:'Chiunque', sq_kind_all:'Faldoni, documenti e scatole', sq_kind_binder:'Faldoni', sq_kind_document:'Documenti', sq_kind_location:'Scatole',
  sq_verifs:'Verifiche di rientro', sq_verif_row:'{b}: {f} trovati, {m} mancanti, {u} in più', sq_verif_none:'Nessuna verifica di rientro registrata.', sq_verif_csv:'CSV',
  sq_box_all:'Tutta la scatola ({n} faldoni)', sq_box_t:'Stato della scatola {c}', sq_box_btn:'Stato della scatola…',
  sq_se_h:'Stati rapidi (preso, reinserito, dato al Comune…)', sq_se_p:'Gli stati che si possono dare a faldoni, documenti e scatole con due tocchi dal telefono o dal PC. Quelli con "pulsante rapido" compaiono grandi dopo la scansione del QR.',
  sq_se_add:'Aggiungi stato', sq_se_reset:'Ripristina i predefiniti', sq_se_edit:'Modifica', sq_se_up:'Sposta su', sq_se_down:'Sposta giù', sq_se_disabled:'disattivato', sq_se_quick:'pulsante rapido',
  sq_se_t_new:'Nuovo stato', sq_se_t_edit:'Stato: {s}', sq_se_label:'Nome', sq_se_color:'Colore', sq_se_icon:'Icona', sq_se_presence:'Effetto', sq_se_holder:'Chiedi chi lo ha',
  sq_se_h_none:'non chiedere', sq_se_h_me:'chi registra (modificabile)', sq_se_h_client:'il cliente del faldone (modificabile)', sq_se_h_entity:'da scrivere (Comune, ente…)',
  sq_se_due:'Data di rientro', sq_se_note:'Nota', sq_se_date:'Data dell\'evento ("restituito il…")', sq_se_n_none:'no', sq_se_n_opt:'facoltativa', sq_se_n_req:'obbligatoria',
  sq_se_returns:'Per chiuderlo proponi', sq_se_ret_none:'—', sq_se_applies:'Vale per', sq_se_ap_binder:'faldoni', sq_se_ap_document:'documenti', sq_se_ap_box:'scatole', sq_se_enabled:'Attivo',
  sq_se_used:'Usato {n} volte: non si può eliminare, solo disattivare.', sq_se_del:'Elimina', sq_se_saved:'Stati salvati', sq_se_e_label:'Scrivi un nome.', sq_se_reset_d:'Nomi e impostazioni degli stati predefiniti tornano quelli originali; gli stati che hai aggiunto restano.',
  sq_pe_in:'rientra in archivio', sq_pe_out:'esce dall\'archivio', sq_pe_missing:'mancante', sq_pe_neutral:'solo un\'annotazione', sq_sy_events:'{n} movimenti di stato nuovi (preso, reinserito…)',
  lg_g_status:'Stati', 'lga_status.set':'Stato', 'lga_status.bulk':'Stato (più faldoni)', 'lga_status.box':'Stato di una scatola', 'lga_status.verify':'Verifica rientro', 'lga_status.undo':'Stato annullato', 'lga_settings.status_types':'Stati modificati',
  sq_tour:'Stati: preso, reinserito, dato al Comune'
});
Object.assign(I18N.en, {
  sq_h:'Out of the archive', sq_p:'What is not in the archive right now: who has it, since when and when it is due back. Rule for everyone: when you take a binder scan it and press "Taken", when you put it back scan it and press "Put back".',
  sq_k_out:'Out of the archive', sq_k_overdue:'Overdue', sq_k_missing:'Missing', sq_k_boxes:'Boxes out', sq_k_docs:'Documents out',
  sq_f_all:'Movements: all', sq_f_out:'Out of the archive', sq_f_missing:'Missing', sq_f_overdue:'Overdue', sq_f_in:'In the archive', sq_f_neutral:'To be checked',
  sq_strip:'{n} out of the archive', sq_strip_over:'{n} overdue', sq_strip_miss:'{n} missing', sq_open_dash:'Open "Out of the archive"', sq_back_arch:'Back to the archive',
  sq_bulk:'Status…', sq_bulk_t:'Status of {n} binders', sq_sheet_t:'Status — {c}', sq_more:'More…', sq_all_types:'All statuses', sq_confirm:'Confirm', sq_back:'Back', sq_cur:'Now',
  sq_done:'{s}: {c}', sq_done_n:'{s}: {n} binders', sq_undo:'Undo', sq_undone_t:'Status undone', sq_nothing_sel:'Tick at least one binder.',
  sq_ed_h:'Binder status', sq_hist:'History', sq_hist_none:'No movement recorded.', sq_docs:'Documents', sq_doc_btn:'Status…', sq_docs_out:'{n} doc. out',
  sq_th_what:'What', sq_th_client:'Client', sq_th_status:'Status', sq_th_holder:'Who has it', sq_th_since:'Since', sq_th_due:'Due back', sq_th_by:'Recorded by', sq_th_act:'',
  sq_none_out:'Everything is in the archive: nothing is out right now.', sq_none_f:'Nothing matches these filters.',
  sq_ex_out:'Export out of the archive (CSV)', sq_ex_all:'Export every movement (CSV)', sq_exported:'Exported: {f}',
  sq_mode:'Status mode (QR scanner)', sq_mode_h:'Status mode', sq_mode_p:'Pick the status, then scan the binder QR codes one after the other with the USB or Bluetooth scanner (or type the code and press Enter). A box QR applies the status to the whole box.',
  sq_mode_scan:'Binder QR or code, then Enter', sq_mode_on:'Status: {s}', sq_mode_stop:'Done', sq_mode_count:'{n} recorded', sq_mode_unknown:'Unknown QR: {c}', sq_mode_dup:'{c} already has this status', sq_mode_pick:'1. Pick the status', sq_mode_go:'2. Scan',
  sq_q_ph:'Search code, client, holder, note…', sq_who_all:'Anyone', sq_kind_all:'Binders, documents and boxes', sq_kind_binder:'Binders', sq_kind_document:'Documents', sq_kind_location:'Boxes',
  sq_verifs:'Return checks', sq_verif_row:'{b}: {f} found, {m} missing, {u} extra', sq_verif_none:'No return check recorded.', sq_verif_csv:'CSV',
  sq_box_all:'Whole box ({n} binders)', sq_box_t:'Status of box {c}', sq_box_btn:'Box status…',
  sq_se_h:'Quick statuses (taken, put back, given to the council…)', sq_se_p:'The statuses binders, documents and boxes can get with two taps from a phone or the PC. Those marked "quick button" appear large after scanning the QR.',
  sq_se_add:'Add status', sq_se_reset:'Restore the defaults', sq_se_edit:'Edit', sq_se_up:'Move up', sq_se_down:'Move down', sq_se_disabled:'disabled', sq_se_quick:'quick button',
  sq_se_t_new:'New status', sq_se_t_edit:'Status: {s}', sq_se_label:'Name', sq_se_color:'Colour', sq_se_icon:'Icon', sq_se_presence:'Effect', sq_se_holder:'Ask who has it',
  sq_se_h_none:'do not ask', sq_se_h_me:'whoever records it (editable)', sq_se_h_client:'the binder\'s client (editable)', sq_se_h_entity:'to be typed (council, agency…)',
  sq_se_due:'Return date', sq_se_note:'Note', sq_se_date:'Date of the event ("returned on…")', sq_se_n_none:'no', sq_se_n_opt:'optional', sq_se_n_req:'required',
  sq_se_returns:'To close it suggest', sq_se_ret_none:'—', sq_se_applies:'Applies to', sq_se_ap_binder:'binders', sq_se_ap_document:'documents', sq_se_ap_box:'boxes', sq_se_enabled:'Enabled',
  sq_se_used:'Used {n} times: it cannot be deleted, only disabled.', sq_se_del:'Delete', sq_se_saved:'Statuses saved', sq_se_e_label:'Type a name.', sq_se_reset_d:'Names and settings of the built-in statuses go back to the original ones; the statuses you added stay.',
  sq_pe_in:'back in the archive', sq_pe_out:'leaves the archive', sq_pe_missing:'missing', sq_pe_neutral:'just a note', sq_sy_events:'{n} new status movements (taken, put back…)',
  lg_g_status:'Statuses', 'lga_status.set':'Status', 'lga_status.bulk':'Status (several binders)', 'lga_status.box':'Status of a box', 'lga_status.verify':'Return check', 'lga_status.undo':'Status undone', 'lga_settings.status_types':'Statuses edited',
  sq_tour:'Statuses: taken, put back, given to the council'
});
Object.assign(ICONS, { sqflag:SQ_ICONS.flag, sqhand:SQ_ICONS.hand, sqin:SQ_ICONS.in, sqscan:SQ_ICONS.scan });
if (typeof LOG_GROUPS !== 'undefined' && !LOG_GROUPS.includes('status')) LOG_GROUPS.push('status');

/* ---------------- state helpers ---------------- */
function sqEv(){ if (!Array.isArray(S.statusEvents)) S.statusEvents = []; return S.statusEvents; }
const sqTy = () => sqTypes(S.settings);
const sqWho = () => logWho();
const sqDev = () => typeof syncDeviceId === 'function' ? syncDeviceId() : '';
const sqBinder = (id) => S.binders.find(b => b.id === id) || null;
const sqBCur = (b) => sqCurrent(sqEv(), 'binder', b.id);
const sqDocText = (it) => (it.year ? it.year + ': ' : '') + (it.description || '');
/** Worst presence of a binder: its own status, or 'out' / 'missing' when one of its documents is out. */
function sqBinderState(b){
  const ev = sqBCur(b), types = sqTy(), p = sqPresence(ev, types), docs = sqDocCurrents(sqEv(), b.id);
  let dOut = 0, dMiss = 0, dOver = 0; docs.forEach(e => { const q = sqPresence(e, types); if (q === 'out') dOut++; if (q === 'missing') dMiss++; if (sqOverdue(e, types)) dOver++; });
  return {ev, p, dOut, dMiss, overdue:sqOverdue(ev, types) || dOver > 0, out:sqIsOut(p) || dOut + dMiss > 0, missing:p === 'missing' || dMiss > 0, neutral:p === 'neutral'};
}
function sqBinderMatch(b, f){
  if (!f) return true;
  const s = sqBinderState(b);
  if (f === 'out') return s.out;
  if (f === 'missing') return s.missing;
  if (f === 'overdue') return s.overdue;
  if (f === 'in') return !s.out && !s.neutral;
  if (f === 'neutral') return s.neutral;
  if (f.indexOf('ty:') === 0) return !!(s.ev && s.ev.status_id === f.slice(3));
  return true;
}
function sqBadgeHTML(ev, opts){
  opts = opts || {}; const types = sqTy();
  if (!ev) return opts.none ? '<span class="sq-badge p-none">' + sqIc('in') + esc(t('sq_p_none')) + '</span>' : '';
  const ty = sqType(types, ev.status_id), p = sqPresence(ev, types), od = sqOverdue(ev, types);
  return '<span class="sq-badge p-' + p + (od ? ' od' : '') + '" style="--sq:' + esc(ty ? ty.color : '#64748B') + '" title="' + esc(sqHeadline(ev, types) + ' · ' + sqSubline(ev, types) + (ev.note ? ' · ' + ev.note : '')) + '">' +
    sqIc(ty ? ty.icon : 'flag') + '<span>' + esc(opts.full ? sqHeadline(ev, types) : sqTypeLabel(ty || {id:ev.status_id}) + (ev.holder && !opts.short ? ' · ' + ev.holder : '')) + '</span>' + (od ? '<b class="sq-od">!</b>' : '') + '</span>';
}

/* ---------------- recording ---------------- */
/** Append one event per target, log ONE activity line, commit, toast with a 10 s undo.
    targets: [{target_type, target_id, doc_id?, code, doc_text?}] · vals: {holder, due_date, date, note} · opts: {via, box_id, action, quiet} */
function sqRecord(targets, statusId, vals, opts){
  vals = vals || {}; opts = opts || {};
  const types = sqTy(), ty = sqType(types, statusId); if (!ty || !targets.length) return [];
  const batch = targets.length > 1 ? 'sb-' + uuid() : '', list = sqEv(), out = [];
  targets.forEach(tg => {
    const e = sqNewEvent({target_type:tg.target_type, target_id:tg.target_id, doc_id:tg.doc_id || '', status_id:statusId, holder:vals.holder || '', due_date:vals.due_date || '', date:vals.date || '', note:vals.note || '',
      via:opts.via || 'desktop', box_id:opts.box_id || tg.box_id || '', batch_id:batch, code:tg.code || '', doc_text:tg.doc_text || ''}, {user:sqWho(), device:sqDev(), events:list});
    if (e){ list.push(e); out.push(e); }
  });
  list.sort(sqCmp);
  const label = sqTypeLabel(ty), first = out[0], one = out.length === 1;
  const action = opts.action || (one ? 'status.set' : 'status.bulk');
  const what = (e) => e.target_type === 'document' ? (e.code + ' › ' + e.doc_text) : e.target_type === 'location' ? 'scatola ' + e.code : e.code;
  const tgt = one ? (first.target_type === 'location' ? {type:'location', id:first.target_id, code:first.code} : {type:'binder', id:first.target_id, code:first.code}) : (opts.box ? {type:'location', id:opts.box.id, code:opts.box.code} : null);
  logAct(action, tgt, 'Stato "' + label + '"' + (vals.holder ? ' (' + vals.holder + ')' : '') + ': ' + logCut(out.map(what).join(', '), 200) + (out.length > 1 ? ' — ' + out.length + ' oggetti' : '') + ' · ' + t('sq_via_' + (opts.via || 'desktop')),
    {status:statusId, holder:vals.holder || '', due_date:vals.due_date || '', note:vals.note || '', count:out.length, batch_id:batch, via:opts.via || 'desktop', events:out.map(sqRecData)}, 'ui');
  commit();
  if (!opts.quiet) toast(one ? t('sq_done', {s:label, c:what(first)}) : t('sq_done_n', {s:label, n:out.filter(e => e.target_type === 'binder').length || out.length}), 'ok', SQ_UNDO_MS, {label:t('sq_undo'), fn:() => sqUndo(out)});
  return out;
}
/** Compensating events: the log stays append-only. */
function sqUndo(events){
  const list = sqEv(), voided = sqIndex(list).voided, out = [];
  (events || []).forEach(ev => { if (voided.has(ev.id)) return; const u = sqUndoEvent(ev, {user:sqWho(), device:sqDev(), events:list}); if (u){ list.push(u); out.push(u); } });
  if (!out.length) return [];
  list.sort(sqCmp);
  logAct('status.undo', out.length === 1 ? {type:out[0].target_type === 'location' ? 'location' : 'binder', id:out[0].target_id, code:out[0].code} : null, 'Annullato lo stato di ' + logCut(out.map(e => e.code).join(', '), 200), {count:out.length, events:out.map(sqRecData)}, 'ui');
  commit(); toast(t('sq_undone_t'), 'ok'); sqRefresh();
  return out;
}
function sqRefresh(){ if (topModal() && $('#sq-ed')) sqEdRender(); if (S.view === 'status' || S.view === 'archive') renderView(); else if (typeof locRender === 'function' && $('#lo-tree')) locRender(); else renderTopbar(); }
const sqTargetBinder = (b) => ({target_type:'binder', target_id:b.id, code:b.speaking_code});
const sqTargetDoc = (b, it) => ({target_type:'document', target_id:b.id, doc_id:it.id, code:b.speaking_code, doc_text:sqDocText(it)});
const sqTargetLoc = (l) => ({target_type:'location', target_id:l.id, code:l.code || l.seg || ''});

/* ---------------- status sheet (modal): pick a type, fill what it needs ---------------- */
/** ctx: {targets, kind:'binder'|'document'|'box', title, cur (current event, single target), client (binder company), via, box, after()} */
function sqOpenSheet(ctx){
  const types = sqTy();
  SQV.sheet = Object.assign({step:'pick', ty:null, all:false, vals:{}}, ctx);
  openModal({title:ctx.title, size:'', autofocus:false, body:'<div id="sq-sheet" class="sq-sheet"></div>', buttons:[{label:t('close'), cls:'btn', action:'modal-close'}], onMount:() => sqSheetDraw(), onClose:() => { SQV.sheet = null; }});
  void types;
}
function sqSheetDraw(){
  const X = SQV.sheet, box = $('#sq-sheet'); if (!X || !box) return;
  const types = sqTy();
  if (X.step === 'pick'){
    const quick = X.targets.length === 1 ? sqQuickFor(types, X.kind, X.cur, 4) : sqTypesFor(types, X.kind).filter(x => x.quick);
    const list = X.all ? sqTypesFor(types, X.kind) : quick;
    box.innerHTML = (X.cur !== undefined && X.targets.length === 1 ? '<div class="sq-now">' + '<span class="sq-cap">' + esc(t('sq_cur')) + '</span>' + sqBadgeHTML(X.cur, {none:true, full:true}) + (X.cur ? '<span class="muted small">' + esc(sqSubline(X.cur, types)) + '</span>' : '') + '</div>' : '') +
      '<div class="sq-grid">' + list.map(ty => '<button type="button" class="sq-tbtn" data-a="sq-pick" data-id="' + esc(ty.id) + '" style="--sq:' + esc(ty.color) + '">' + sqIc(ty.icon) + '<span>' + esc(sqTypeLabel(ty)) + '</span></button>').join('') +
      (!X.all ? '<button type="button" class="sq-tbtn sq-more" data-a="sq-all">' + sqIc('more') + '<span>' + esc(t('sq_more')) + '</span></button>' : '') + '</div>';
    return;
  }
  const ty = X.ty, n = sqNeeds(ty), v = X.vals;
  const opt = (k) => k === 'optional' ? ' <span class="muted">(' + esc(t('sq_optional')) + ')</span>' : '';
  const holders = sqHolderSuggestions(ty);
  box.innerHTML = '<div class="sq-chosen" style="--sq:' + esc(ty.color) + '">' + sqIc(ty.icon) + '<b>' + esc(sqTypeLabel(ty)) + '</b><button type="button" class="btn btn-sm" data-a="sq-back">' + esc(t('sq_back')) + '</button></div><div class="stack">' +
    (n.holder ? '<div class="field"><label for="sq-holder">' + esc(t(ty.needs_holder === 'client' ? 'sq_holder_client' : ty.needs_holder === 'entity' ? 'sq_holder_entity' : 'sq_holder')) + '</label><input class="inp" id="sq-holder" data-sqf="holder" value="' + esc(v.holder || '') + '" list="sq-holders" autocomplete="off"><datalist id="sq-holders">' + holders.map(h => '<option value="' + esc(h) + '">').join('') + '</datalist></div>' : '') +
    (n.due ? '<div class="field"><label for="sq-due">' + esc(t('sq_due_date')) + opt(n.due) + '</label><input class="inp" type="date" id="sq-due" data-sqf="due_date" value="' + esc(v.due_date || '') + '"></div>' : '') +
    (n.date ? '<div class="field"><label for="sq-date">' + esc(t('sq_date')) + opt(n.date) + '</label><input class="inp" type="date" id="sq-date" data-sqf="date" value="' + esc(v.date || '') + '"></div>' : '') +
    (n.note ? '<div class="field"><label for="sq-note">' + esc(t('sq_note')) + opt(n.note) + '</label><textarea class="inp" id="sq-note" data-sqf="note" rows="2">' + esc(v.note || '') + '</textarea></div>' : '') +
    '<div class="err-t" id="sq-err"></div><button type="button" class="btn btn-primary btn-lg sq-go" data-a="sq-go" id="sq-go">' + ic('check') + esc(t('sq_confirm')) + '</button></div>';
  setTimeout(() => { const f = $('#sq-sheet [data-sqf]'); if (f) f.focus(); }, 30);
}
function sqHolderSuggestions(ty){
  const seen = new Map(), add = (v) => { v = String(v || '').trim(); if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v); };
  if (ty.needs_holder === 'me') add(sqWho());
  if (ty.needs_holder === 'client'){ (SQV.sheet && SQV.sheet.client ? [SQV.sheet.client] : []).forEach(add); (S.clients || []).slice(0, 300).forEach(c => add(c.name)); }
  sqEv().slice().reverse().forEach(e => { const x = sqType(sqTy(), e.status_id); if (x && x.needs_holder === ty.needs_holder && seen.size < 400) add(e.holder); });
  return Array.from(seen.values()).slice(0, 400);
}
function sqDefaults(ty, ctx){
  return {holder:ty.needs_holder === 'me' ? sqWho() : ty.needs_holder === 'client' ? (ctx.client || '') : '', due_date:'', date:ty.needs_date ? sqToday() : '', note:''};
}
function sqSheetPick(id){
  const X = SQV.sheet; if (!X) return;
  const ty = sqType(sqTy(), id); if (!ty) return;
  X.ty = ty; X.vals = sqDefaults(ty, X);
  if (sqNeeds(ty).oneTap) return sqSheetGo();
  X.step = 'form'; sqSheetDraw();
}
function sqSheetGo(){
  const X = SQV.sheet; if (!X || !X.ty) return;
  $$('#sq-sheet [data-sqf]').forEach(el => { X.vals[el.dataset.sqf] = el.value; });
  const err = sqCheck(X.ty, X.vals); if (err){ const e = $('#sq-err'); if (e) e.textContent = t(err); return; }
  const ctx = X; closeModal(true);
  const out = sqRecord(ctx.targets, ctx.ty.id, ctx.vals, {via:ctx.via || 'desktop', box_id:ctx.box ? ctx.box.id : '', box:ctx.box, action:ctx.action});
  if (ctx.after) ctx.after(out); else sqRefresh();
}
/** Entry points */
function sqOpenBinder(id){ const b = sqBinder(id); if (!b) return; sqOpenSheet({targets:[sqTargetBinder(b)], kind:'binder', title:t('sq_sheet_t', {c:b.speaking_code}), cur:sqBCur(b), client:b.company_name, via:topModal() ? 'editor' : 'desktop'}); }
function sqOpenDoc(bid, docId){
  const b = sqBinder(bid), it = b && b.contents_items.find(x => x.id === docId); if (!it) return;
  sqOpenSheet({targets:[sqTargetDoc(b, it)], kind:'document', title:t('sq_sheet_t', {c:b.speaking_code + ' › ' + sqDocText(it)}), cur:sqCurrent(sqEv(), 'document', b.id, it.id), client:b.company_name, via:topModal() ? 'editor' : 'desktop'});
}
function sqOpenBulk(){
  const list = S.binders.filter(b => b.selected_for_print && !(S.settings.hideDemo && isDemo(b)));
  if (!list.length){ toast(t('sq_nothing_sel'), 'warn'); return; }
  sqOpenSheet({targets:list.map(sqTargetBinder), kind:'binder', title:t('sq_bulk_t', {n:list.length}), via:'bulk', action:'status.bulk', client:new Set(list.map(b => b.company_name)).size === 1 ? list[0].company_name : ''});
}
/** v12.1: the binders of a box INCLUDING the boxes nested in it (shelf › boxes, cabinet › shelves › boxes). */
function sqBoxBinders(l){
  if (!l) return [];
  const ids = new Set([l.id].concat(typeof locDescendants === 'function' ? locDescendants(l.id) : []));
  return S.binders.filter(b => b.location_id && ids.has(b.location_id));
}
/** A box (location) and every binder in it or in the boxes nested in it, one batch (action status.box). */
function sqOpenBox(locId){
  const l = typeof locById === 'function' ? locById(locId) : null; if (!l) return;
  const bs = sqBoxBinders(l);
  sqOpenSheet({targets:[sqTargetLoc(l)].concat(bs.map(b => Object.assign(sqTargetBinder(b), {box_id:l.id}))), kind:'box', title:t('sq_box_t', {c:l.code}), cur:sqCurrent(sqEv(), 'location', l.id), via:'box', box:{id:l.id, code:l.code}, action:'status.box'});
}

/* ---------------- binder form panel ---------------- */
function sqEdHTML(){
  const ed = UI.ed; if (!ed || ed.isNew) return '';
  const b = sqBinder(ed.d.id); if (!b) return '';
  const types = sqTy(), cur = sqBCur(b), quick = sqQuickFor(types, 'binder', cur, 3), docs = sqDocCurrents(sqEv(), b.id);
  const hist = sqHistory(sqEv(), 'binder', b.id).concat(...b.contents_items.map(it => sqHistory(sqEv(), 'document', b.id, it.id))).sort((x, y) => sqCmp(y.ev, x.ev)).slice(0, 30);
  const seen = sqLastSeen('binder', b.id, null);
  return '<div class="sq-ed-in"><div class="row between"><div class="lbl">' + esc(t('sq_ed_h')) + helpDot('status') + '</div>' + (seen ? '<span class="tiny muted" id="sq-ed-seen">' + esc(t('sq_last_scan', {u:seen.user, w:sqWhen(seen.at)})) + '</span>' : '') + '</div>' +
    '<div class="sq-ed-now">' + sqBadgeHTML(cur, {none:true, full:true}) + (cur ? '<span class="small muted">' + esc(sqSubline(cur, types)) + '</span>' : '') + '</div>' + (cur && cur.note ? '<div class="small sq-note">' + esc(cur.note) + '</div>' : '') +
    '<div class="sq-ed-q">' + quick.map(ty => '<button type="button" class="btn btn-sm sq-qbtn" data-a="sq-quick" data-id="' + esc(b.id) + '" data-st="' + esc(ty.id) + '" style="--sq:' + esc(ty.color) + '">' + sqIc(ty.icon) + esc(sqTypeLabel(ty)) + '</button>').join('') +
      '<button type="button" class="btn btn-sm" data-a="sq-open" data-id="' + esc(b.id) + '" id="sq-ed-more">' + esc(t('sq_more')) + '</button></div>' +
    (b.contents_items.length ? '<details class="sq-ed-docs"' + (docs.size ? ' open' : '') + '><summary>' + esc(t('sq_docs')) + (docs.size ? ' · ' + docs.size : '') + '</summary><ul>' + b.contents_items.map(it => { const e = docs.get(it.id);
      return '<li><span class="sq-dt">' + esc(sqDocText(it)) + '</span>' + (e ? sqBadgeHTML(e, {short:true}) : '') + '<button type="button" class="btn btn-sm" data-a="sq-doc" data-id="' + esc(b.id) + '" data-doc="' + esc(it.id) + '">' + esc(t('sq_doc_btn')) + '</button></li>'; }).join('') + '</ul></details>' : '') +
    '<details class="sq-ed-hist"><summary>' + esc(t('sq_hist')) + ' (' + hist.length + ')</summary>' + (hist.length ? sqTimelineHTML(hist) : '<div class="muted small">' + esc(t('sq_hist_none')) + '</div>') + '</details></div>';
}
function sqTimelineHTML(hist){
  const types = sqTy();
  return '<ol class="sq-tl">' + hist.map(h => { const e = h.ev, ty = sqType(types, e.status_id);
    return '<li class="' + (h.voided ? 'voided' : '') + (h.undo ? ' undo' : '') + '"><i style="--sq:' + esc(ty ? ty.color : '#94A3B8') + '"></i><div><b>' + esc(h.undo ? t('sq_via_undo') : sqHeadline(e, types)) + '</b>' + (e.target_type === 'document' ? ' <span class="muted">· ' + esc(e.doc_text) + '</span>' : '') +
      (h.voided ? ' <span class="sq-voided">' + esc(t('sq_undone')) + '</span>' : '') + '<div class="tiny muted">' + esc(sqWhen(e.at) + ' · ' + e.user + ' · ' + t('sq_via_' + e.via) + (e.due_date ? ' · ' + t('sq_due', {d:sqDayFmt(e.due_date)}) : '') + (e.date ? ' · ' + t('sq_on', {d:sqDayFmt(e.date)}) : '')) + '</div>' +
      (e.note ? '<div class="small">' + esc(e.note) + '</div>' : '') + '</div></li>'; }).join('') + '</ol>';
}
function sqEdRender(){ const el = $('#sq-ed'); if (el) el.innerHTML = sqEdHTML(); }

/* ---------------- "Fuori archivio" view ---------------- */
function sqRowsAll(){
  const types = sqTy(), rows = sqOutRows(sqEv(), types, {neutral:true}), byId = new Map(S.binders.map(b => [b.id, b]));
  return rows.map(r => {
    const b = r.kind === 'location' ? null : byId.get(r.target_id), l = r.kind === 'location' && typeof locById === 'function' ? locById(r.target_id) : null;
    const it = b && r.doc_id ? b.contents_items.find(x => x.id === r.doc_id) : null;
    return Object.assign(r, {b, l, code:b ? b.speaking_code : l ? l.code : r.ev.code, company:b ? b.company_name : l ? (typeof locPathText === 'function' ? locPathText(l.id) : '') : '', doc:it ? sqDocText(it) : r.ev.doc_text,
      gone:!b && !l, demo:!!(b && isDemo(b))});
  }).filter(r => !(S.settings.hideDemo && r.demo));
}
function sqDashFiltered(){
  const D = SQV.dash, q = D.q.trim().toLowerCase();
  return sqRowsAll().filter(r => (!D.kind || r.kind === D.kind) && (!D.who || r.ev.holder === D.who) &&
    (!D.p || (D.p === 'overdue' ? r.overdue : D.p === 'out' ? sqIsOut(r.presence) : r.presence === D.p)) &&
    (!q || [r.code, r.company, r.doc, r.ev.holder, r.ev.note, r.ev.user, r.ty ? sqTypeLabel(r.ty) : ''].join(' ').toLowerCase().indexOf(q) >= 0));
}
function viewStatus(){
  const D = SQV.dash, all = sqRowsAll(), outs = all.filter(r => sqIsOut(r.presence)), rows = sqDashFiltered(), types = sqTy();
  const who = Array.from(new Set(all.map(r => r.ev.holder).filter(Boolean))).sort(naturalCmp);
  const kp = [[outs.filter(r => r.kind === 'binder').length, 'sq_k_out', 'out'], [outs.filter(r => r.kind === 'document').length, 'sq_k_docs', 'out'], [outs.filter(r => r.kind === 'location').length, 'sq_k_boxes', 'out'], [all.filter(r => r.overdue).length, 'sq_k_overdue', 'overdue'], [all.filter(r => r.presence === 'missing').length, 'sq_k_missing', 'missing']];
  const sel = (k, all_, opts) => '<select class="inp" data-sqd="' + k + '" aria-label="' + esc(all_) + '"><option value="">' + esc(all_) + '</option>' + opts.map(o => '<option value="' + esc(o[0]) + '"' + (D[k] === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
  return '<div class="page-h"><div><h1>' + esc(t('sq_h')) + helpDot('status') + '</h1><p>' + esc(t('sq_p')) + '</p></div><div class="row"><button class="btn" data-a="nav" data-v="archive">' + ic('archive') + esc(t('sq_back_arch')) + '</button>' +
      '<button class="btn btn-primary" data-a="sq-mode" id="sq-mode-btn">' + sqIc('scan') + esc(t('sq_mode')) + '</button></div></div>' +
    '<div class="kpis sq-kpis" id="sq-kpis">' + kp.map(([v, k, f]) => '<button type="button" class="card kpi sq-kpi' + (v && (f === 'overdue' || f === 'missing') ? ' alarm' : '') + '" data-a="sq-dash-p" data-v="' + f + '"><div class="v">' + v + '</div><div class="k">' + esc(t(k)) + '</div></button>').join('') + '</div>' +
    '<div class="card"><div class="toolbar"><div class="search">' + ic('search') + '<input class="inp" type="search" data-sqd="q" value="' + esc(D.q) + '" placeholder="' + esc(t('sq_q_ph')) + '" aria-label="search"></div>' +
      sel('p', t('sq_f_all'), [['out', t('sq_f_out')], ['overdue', t('sq_f_overdue')], ['missing', t('sq_f_missing')], ['neutral', t('sq_f_neutral')]]) +
      sel('kind', t('sq_kind_all'), [['binder', t('sq_kind_binder')], ['document', t('sq_kind_document')], ['location', t('sq_kind_location')]]) +
      sel('who', t('sq_who_all'), who.map(w => [w, w])) +
      '<span style="flex:1"></span><button class="btn btn-sm" data-a="sq-csv-out" id="sq-csv-out">' + ic('download') + esc(t('sq_ex_out')) + '</button><button class="btn btn-sm" data-a="sq-csv-all" id="sq-csv-all">' + ic('download') + esc(t('sq_ex_all')) + '</button></div>' +
      '<div id="sq-dash-rows">' + sqDashRowsHTML(rows, all.length) + '</div></div>' +
    '<div class="card card-p" style="margin-top:16px" id="sq-verifs"><h2>' + esc(t('sq_verifs')) + '</h2>' + sqVerifsHTML() + '</div>';
  void types;
}
function sqDashRowsHTML(rows, total){
  if (!total) return '<div class="empty" id="sq-empty">' + sqIc('in', 'lg') + '<p>' + esc(t('sq_none_out')) + '</p></div>';
  if (!rows.length) return '<div class="empty">' + esc(t('sq_none_f')) + '</div>';
  const types = sqTy();
  return '<div class="tbl-wrap"><table class="tbl sq-tbl"><thead><tr><th>' + esc(t('sq_th_what')) + '</th><th>' + esc(t('sq_th_client')) + '</th><th>' + esc(t('sq_th_status')) + '</th><th>' + esc(t('sq_th_since')) + '</th><th>' + esc(t('sq_th_due')) + '</th><th>' + esc(t('sq_th_by')) + '</th><th></th></tr></thead><tbody>' +
    rows.map(r => { const e = r.ev, back = sqQuickFor(types, r.kind === 'location' ? 'box' : r.kind, e, 1)[0];
      return '<tr class="' + (r.overdue ? 'sq-row-od' : '') + '" data-sqk="' + esc(r.key) + '"><td><span class="code-chip">' + (r.b ? '<span class="bar" style="background:' + esc(r.b.color_hex) + '"></span>' : sqIc(r.kind === 'location' ? 'box' : 'doc')) + esc(r.code) + '</span>' +
        (r.kind === 'document' ? '<div class="ti">' + sqIc('doc') + esc(r.doc) + '</div>' : r.kind === 'location' ? '<div class="ti">' + esc(t('sq_tt_location')) + '</div>' : '') + '</td>' +
        '<td><div class="co">' + esc(r.company) + '</div></td><td>' + sqBadgeHTML(e) + (e.note ? '<div class="tiny muted sq-note">' + esc(e.note) + '</div>' : '') + '</td>' +
        '<td class="small">' + esc(sqSince(e.date ? e.date + 'T12:00:00' : e.at)) + '<div class="tiny muted">' + esc(fmtDate(e.at, true)) + '</div></td>' +
        '<td class="small">' + (e.due_date ? esc(sqDayFmt(e.due_date)) + (r.overdue ? ' <b class="sq-od-t">' + esc(t('sq_overdue')) + '</b>' : '') : '—') + '</td><td class="small">' + esc(e.user) + '<div class="tiny muted">' + esc(t('sq_via_' + e.via)) + '</div></td>' +
        '<td class="acts">' + (back && !r.gone ? '<button class="btn btn-sm sq-qbtn" data-a="sq-row-quick" data-k="' + esc(r.key) + '" data-st="' + esc(back.id) + '" style="--sq:' + esc(back.color) + '">' + sqIc(back.icon) + esc(sqTypeLabel(back)) + '</button>' : '') +
          (!r.gone ? '<button class="btn btn-sm" data-a="sq-row-open" data-k="' + esc(r.key) + '">' + esc(t('sq_more')) + '</button>' : '') + (r.b ? '<button class="icon-btn" data-a="edit" data-id="' + esc(r.b.id) + '" title="' + esc(t('act_edit')) + '">' + ic('pencil') + '</button>' : '') + '</td></tr>'; }).join('') +
    '</tbody></table></div>';
}
function sqRowCtx(key){ return sqRowsAll().find(r => r.key === key) || null; }
function sqRowOpen(key, statusId){
  const r = sqRowCtx(key); if (!r) return;
  if (r.kind === 'location'){ if (statusId) return sqQuickApply({targets:[sqTargetLoc(r.l)].concat(sqBoxBinders(r.l).filter(b => sqIsOut(sqPresence(sqBCur(b), sqTy())) && (sqBCur(b) || {}).box_id === r.l.id).map(b => Object.assign(sqTargetBinder(b), {box_id:r.l.id}))), kind:'box', box:{id:r.l.id, code:r.l.code}, via:'box', action:'status.box'}, statusId); return sqOpenBox(r.l.id); }
  if (r.kind === 'document'){ if (statusId) return sqQuickApply({targets:[sqTargetDoc(r.b, r.b.contents_items.find(x => x.id === r.doc_id))], kind:'document', client:r.b.company_name, title:t('sq_sheet_t', {c:r.code + ' › ' + r.doc}), cur:r.ev}, statusId); return sqOpenDoc(r.b.id, r.doc_id); }
  if (statusId) return sqQuickApply({targets:[sqTargetBinder(r.b)], kind:'binder', client:r.b.company_name, title:t('sq_sheet_t', {c:r.code}), cur:r.ev}, statusId);
  sqOpenBinder(r.b.id);
}
/** One tap when the type needs nothing, else the sheet opened on its form. */
function sqQuickApply(ctx, statusId){
  const ty = sqType(sqTy(), statusId); if (!ty) return;
  if (sqNeeds(ty).oneTap){ sqRecord(ctx.targets, ty.id, sqDefaults(ty, ctx), {via:ctx.via || (topModal() ? 'editor' : 'desktop'), box_id:ctx.box ? ctx.box.id : '', box:ctx.box, action:ctx.action}); sqRefresh(); return; }
  sqOpenSheet(Object.assign({title:ctx.title || sqTypeLabel(ty)}, ctx)); SQV.sheet.ty = ty; SQV.sheet.vals = sqDefaults(ty, ctx); SQV.sheet.step = 'form'; sqSheetDraw();
}
function sqVerifsHTML(){
  const L = (typeof LOG !== 'undefined' ? LOG.entries : []).filter(e => e.action === 'status.verify').slice(-30).reverse();
  if (!L.length) return '<div class="muted small" id="sq-verif-none">' + esc(t('sq_verif_none')) + '</div>';
  return '<ul class="sq-verif">' + L.map(e => { const d = e.details || {};
    return '<li><span class="small">' + esc(fmtDate(e.at, true) + ' · ' + e.who) + '</span><b>' + esc(t('sq_verif_row', {b:(e.target && e.target.code) || '', f:(d.found || []).length, m:(d.missing || []).length, u:(d.unexpected || []).length})) + '</b>' +
      ((d.missing || []).length ? '<span class="sq-miss small">' + esc((d.missing || []).map(x => x.code).join(', ')) + '</span>' : '') + '<button class="btn btn-sm" data-a="sq-verif-csv" data-id="' + esc(e.id) + '">' + ic('download') + esc(t('sq_verif_csv')) + '</button></li>'; }).join('') + '</ul>';
}
/** CSV of a return check from its log line (also what the phone downloads). */
function sqVerifCsv(d){ return sqVerifyCsv(d); }
function sqStamp(){ const d = new Date(), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()); }
function sqCsvOut(){
  const rows = [[t('sq_csv_target'), t('sq_csv_code'), t('sq_th_client'), t('sq_csv_doc'), t('sq_csv_status'), t('sq_csv_presence'), t('sq_csv_holder'), t('sq_csv_since'), t('sq_csv_due'), t('sq_csv_overdue'), t('sq_csv_note'), t('sq_csv_user'), t('sq_csv_via')]];
  sqDashFiltered().forEach(r => rows.push([t('sq_tt_' + r.kind), r.code, r.company, r.kind === 'document' ? r.doc : '', r.ty ? sqTypeLabel(r.ty) : r.ev.status_id, t('sq_p_' + r.presence), r.ev.holder, r.ev.date || r.ev.at, r.ev.due_date, r.overdue ? t('sq_yes') : t('sq_no'), r.ev.note, r.ev.user, t('sq_via_' + r.ev.via)]));
  const name = 'docmap_fuori_archivio_' + sqStamp() + '.csv'; download(name, sqCsv(rows), 'text/csv'); logAct('export.file', {type:'file', id:'', code:name}, 'Export CSV "Fuori archivio": ' + (rows.length - 1) + ' righe', {file:name, rows:rows.length - 1}); toast(t('sq_exported', {f:name}));
}
function sqCsvAll(){
  const name = 'docmap_stati_' + sqStamp() + '.csv', boxCode = (id) => { const l = typeof locById === 'function' ? locById(id) : null; return l ? l.code : ''; };
  download(name, sqEventsCsv(sqEv(), sqTy(), boxCode), 'text/csv'); logAct('export.file', {type:'file', id:'', code:name}, 'Export CSV di tutti i movimenti di stato: ' + sqEv().length, {file:name, rows:sqEv().length}); toast(t('sq_exported', {f:name}));
}

/* ---------------- "Modalità stato" (USB / Bluetooth scanner) ---------------- */
function sqModeOpen(){
  SQV.mode = {ty:null, vals:{}, list:[], msg:null};
  openModal({title:t('sq_mode_h'), size:'lg', autofocus:false, body:'<div id="sq-mode" class="sq-mode"></div>', buttons:[{label:t('sq_mode_stop'), cls:'btn btn-primary', action:'modal-close'}], onMount:() => sqModeDraw(), onClose:() => { SQV.mode = null; sqRefresh(); }});
}
function sqModeDraw(){
  const M = SQV.mode, box = $('#sq-mode'); if (!M || !box) return;
  const types = sqTypesFor(sqTy(), 'binder');
  const ty = M.ty, n = ty ? sqNeeds(ty) : null;
  box.innerHTML = '<p class="small muted">' + esc(t('sq_mode_p')) + '</p><div class="lbl">' + esc(t('sq_mode_pick')) + '</div><div class="sq-grid sm">' + types.map(x => '<button type="button" class="sq-tbtn' + (ty && ty.id === x.id ? ' on' : '') + '" data-a="sq-mode-ty" data-id="' + esc(x.id) + '" style="--sq:' + esc(x.color) + '">' + sqIc(x.icon) + '<span>' + esc(sqTypeLabel(x)) + '</span></button>').join('') + '</div>' +
    (ty ? '<div class="grid g2 sq-mode-f">' + (n.holder ? '<div class="field"><label for="sqm-holder">' + esc(t('sq_holder')) + '</label><input class="inp" id="sqm-holder" data-sqm="holder" value="' + esc(M.vals.holder || '') + '"></div>' : '') +
        (n.due ? '<div class="field"><label for="sqm-due">' + esc(t('sq_due_date')) + '</label><input class="inp" type="date" id="sqm-due" data-sqm="due_date" value="' + esc(M.vals.due_date || '') + '"></div>' : '') +
        (n.date ? '<div class="field"><label for="sqm-date">' + esc(t('sq_date')) + '</label><input class="inp" type="date" id="sqm-date" data-sqm="date" value="' + esc(M.vals.date || '') + '"></div>' : '') +
        (n.note ? '<div class="field"><label for="sqm-note">' + esc(t('sq_note')) + '</label><input class="inp" id="sqm-note" data-sqm="note" value="' + esc(M.vals.note || '') + '"></div>' : '') + '</div>' +
      '<div class="lbl" style="margin-top:12px">' + esc(t('sq_mode_go')) + '</div><div class="sq-mode-scan"><span class="sq-dot" style="--sq:' + esc(ty.color) + '">' + sqIc(ty.icon) + '</span><input class="inp mono" id="sq-scan" autocomplete="off" spellcheck="false" placeholder="' + esc(t('sq_mode_scan')) + '"></div>' +
      '<div id="sq-mode-msg" aria-live="polite">' + (M.msg ? '<div class="sq-mmsg ' + esc(M.msg.kind) + '">' + esc(M.msg.text) + '</div>' : '') + '</div>' +
      '<div class="small" style="margin-top:8px"><b id="sq-mode-n">' + esc(t('sq_mode_count', {n:M.list.filter(x => !x.undone).length})) + '</b></div><ul class="sq-mode-list" id="sq-mode-list">' + M.list.slice().reverse().slice(0, 40).map(x => '<li class="' + (x.undone ? 'undone' : '') + '"><span class="mono"><b>' + esc(x.code) + '</b></span><span class="muted small">' + esc(x.label) + '</span>' + (x.undone ? '' : '<button class="icon-btn" data-a="sq-mode-undo" data-i="' + M.list.indexOf(x) + '" title="' + esc(t('sq_undo')) + '">' + sqIc('undo') + '</button>') + '</li>').join('') + '</ul>' : '');
  setTimeout(() => { const i = $('#sq-scan'); if (i) i.focus(); }, 30);
}
function sqModeInput(raw){
  const M = SQV.mode; if (!M || !M.ty) return;
  $$('#sq-mode [data-sqm]').forEach(el => { M.vals[el.dataset.sqm] = el.value; });
  const err = sqCheck(M.ty, M.vals); if (err){ M.msg = {kind:'err', text:t(err)}; return sqModeDraw(); }
  const p = assocParseCode(raw), types = sqTy();
  let targets = [], label = '', box = null;
  if (p.type === 'location'){
    const l = (S.locations || []).find(x => x.short_code === p.code);
    if (l){ targets = [sqTargetLoc(l)].concat(sqBoxBinders(l).map(b => Object.assign(sqTargetBinder(b), {box_id:l.id}))); label = t('sq_tt_location') + ' ' + l.code; box = {id:l.id, code:l.code}; }
  } else if (p.type === 'binder' || p.type === 'text'){
    const b = S.binders.find(x => p.type === 'binder' ? x.short_code === p.code : String(x.speaking_code).toUpperCase() === p.code);
    if (b){ const cur = sqBCur(b); if (cur && cur.status_id === M.ty.id && (cur.holder || '') === (M.vals.holder || '')){ M.msg = {kind:'warn', text:t('sq_mode_dup', {c:b.speaking_code})}; if (typeof dmScanFeedback === 'function') dmScanFeedback('warn'); return sqModeDraw(); }
      targets = [sqTargetBinder(b)]; label = b.company_name; }
  }
  if (!targets.length){ M.msg = {kind:'err', text:t('sq_mode_unknown', {c:String(raw).slice(0, 60)})}; if (typeof dmScanFeedback === 'function') dmScanFeedback('warn'); return sqModeDraw(); }
  const out = sqRecord(targets, M.ty.id, M.vals, {via:'scanner', box_id:box ? box.id : '', box, action:box ? 'status.box' : 'status.set', quiet:true});
  M.list.push({code:box ? box.code : targets[0].code, label, events:out, undone:false});
  M.msg = {kind:'ok', text:t('sq_done', {s:sqTypeLabel(M.ty), c:box ? box.code : targets[0].code})};
  if (typeof dmScanFeedback === 'function') dmScanFeedback('ok');
  void types; sqModeDraw();
}

/* ---------------- archive integration ---------------- */
function sqFilterSelectHTML(){
  const types = sqTy(), f = UI.fSq || '';
  const o = [['out', t('sq_f_out')], ['overdue', t('sq_f_overdue')], ['missing', t('sq_f_missing')], ['in', t('sq_f_in')], ['neutral', t('sq_f_neutral')]].concat(types.filter(x => !x.disabled).map(x => ['ty:' + x.id, '· ' + sqTypeLabel(x)]));
  return '<select class="inp sq-fsel" data-sq-filter="1" id="sq-filter" aria-label="' + esc(t('sq_f_all')) + '"><option value="">' + esc(t('sq_f_all')) + '</option>' + o.map(([v, l]) => '<option value="' + esc(v) + '"' + (f === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>';
}
function sqStripHTML(){
  const rows = sqRowsAll(), out = rows.filter(r => sqIsOut(r.presence)), od = rows.filter(r => r.overdue).length, miss = rows.filter(r => r.presence === 'missing').length;
  if (!out.length) return '';
  return '<div class="sq-strip' + (od || miss ? ' alarm' : '') + '" id="sq-strip">' + sqIc('hand') + '<span><b>' + esc(t('sq_strip', {n:out.length})) + '</b>' + (od ? ' · <b class="sq-od-t">' + esc(t('sq_strip_over', {n:od})) + '</b>' : '') + (miss ? ' · <b class="sq-od-t">' + esc(t('sq_strip_miss', {n:miss})) + '</b>' : '') + '</span>' +
    '<button class="btn btn-sm" data-a="nav" data-v="status" id="sq-strip-open">' + esc(t('sq_open_dash')) + '</button></div>';
}
function sqDecorateArchive(){
  const box = $('#arch-results'); if (!box) return;
  const st = $('#sq-strip-slot'); if (st) st.innerHTML = sqStripHTML();
  $$('#arch-results input[data-a="toggle-print"][data-id]').forEach(cb => {
    const b = sqBinder(cb.dataset.id), tr = cb.closest('tr'); if (!b || !tr) return;
    const s = sqBinderState(b), td = tr.children[5]; if (!td) return;
    const h = (s.ev ? sqBadgeHTML(s.ev) : '') + (s.dOut + s.dMiss ? '<span class="sq-badge p-out sm" title="' + esc(t('sq_docs_out', {n:s.dOut + s.dMiss})) + '">' + sqIc('doc') + esc(t('sq_docs_out', {n:s.dOut + s.dMiss})) + '</span>' : '');
    if (h) td.insertAdjacentHTML('beforeend', '<div class="sq-cell">' + h + '</div>');
  });
  $$('#arch-results .spine[data-id]').forEach(sp => { const b = sqBinder(sp.dataset.id); if (!b) return; const s = sqBinderState(b); if (s.out || s.neutral){ sp.classList.add('sq-sp', s.missing ? 'sq-sp-miss' : s.out ? 'sq-sp-out' : 'sq-sp-chk'); if (s.ev) sp.title += ' — ' + sqHeadline(s.ev, sqTy()); } });
  const bb = $('#bulkbar'); if (bb && !$('#sq-bulk-btn')){
    const n = S.binders.filter(b => b.selected_for_print && !(S.settings.hideDemo && isDemo(b))).length;
    const del = bb.querySelector('[data-a="del-sel"]');
    const btn = document.createElement('button'); btn.className = 'btn btn-sm'; btn.id = 'sq-bulk-btn'; btn.dataset.a = 'sq-bulk'; btn.disabled = !n; btn.innerHTML = sqIc('hand') + esc(t('sq_bulk'));
    if (del) bb.insertBefore(btn, del); else bb.appendChild(btn);
  }
}

/* ---------------- settings: status types ---------------- */
function sqTypeUse(){ const m = {}; sqEv().forEach(e => { if (e.status_id) m[e.status_id] = (m[e.status_id] || 0) + 1; }); return m; }
function sqSettingsHTML(){
  const types = sqTy(), use = sqTypeUse();
  return '<div class="card card-p stack" style="margin-top:16px" id="sq-settings"><div class="row between"><h2>' + esc(t('sq_se_h')) + helpDot('status') + '</h2><div class="row"><button class="btn btn-sm" data-a="sq-se-reset">' + ic('refresh') + esc(t('sq_se_reset')) + '</button><button class="btn btn-sm btn-primary" data-a="sq-se-add" id="sq-se-add">' + ic('plus') + esc(t('sq_se_add')) + '</button></div></div>' +
    '<p class="card-sub" style="margin:0">' + esc(t('sq_se_p')) + '</p><ul class="sq-types" id="sq-types">' + types.map((ty, i) => '<li class="' + (ty.disabled ? 'off' : '') + '" data-sq-type="' + esc(ty.id) + '"><span class="sq-dot" style="--sq:' + esc(ty.color) + '">' + sqIc(ty.icon) + '</span>' +
      '<span class="sq-tn"><b>' + esc(sqTypeLabel(ty)) + '</b><small>' + esc(t('sq_pe_' + ty.presence)) + (ty.quick ? ' · ' + t('sq_se_quick') : '') + (ty.disabled ? ' · ' + t('sq_se_disabled') : '') + (use[ty.id] ? ' · ' + use[ty.id] + '×' : '') + '</small></span>' +
      '<button class="icon-btn" data-a="sq-se-move" data-i="' + i + '" data-d="-1" title="' + esc(t('sq_se_up')) + '"' + (i ? '' : ' disabled') + '>↑</button><button class="icon-btn" data-a="sq-se-move" data-i="' + i + '" data-d="1" title="' + esc(t('sq_se_down')) + '"' + (i < types.length - 1 ? '' : ' disabled') + '>↓</button>' +
      '<button class="btn btn-sm" data-a="sq-se-edit" data-id="' + esc(ty.id) + '">' + ic('pencil') + esc(t('sq_se_edit')) + '</button></li>').join('') + '</ul></div>';
}
function sqSaveTypes(list, msg){
  S.settings.statusTypes = list.map(x => sqNormType(x)); S.settings.statusTypesAt = nowISO();
  logAct('settings.status_types', null, 'Stati rapidi modificati (' + list.length + ' stati)', {types:list.map(x => x.id)});
  commit(); renderView(); if (msg) toast(msg);
}
function sqTypeForm(id){
  const types = sqTy(), ty = id ? sqType(types, id) : sqNormType({id:'', presence:'out', quick:true, color:'#0EA5E9', icon:'flag'}), use = sqTypeUse()[id] || 0;
  const optSel = (k, list, lab) => '<select class="inp" data-sqt="' + k + '">' + list.map(v => '<option value="' + esc(v[0]) + '"' + (ty[k] === v[0] ? ' selected' : '') + '>' + esc(v[1]) + '</option>').join('') + '</select>';
  const needs = [['', t('sq_se_n_none')], ['optional', t('sq_se_n_opt')], ['required', t('sq_se_n_req')]];
  const body = '<div class="stack sq-tform" id="sq-tform"><div class="grid g2"><div class="field"><label for="sqt-label">' + esc(t('sq_se_label')) + '</label><input class="inp" id="sqt-label" data-sqt="label" value="' + esc(sqTypeLabel(id ? ty : {id:'', label:''}) === '?' ? '' : (id ? sqTypeLabel(ty) : '')) + '"></div>' +
      '<div class="field"><label>' + esc(t('sq_se_color')) + ' · ' + esc(t('sq_se_icon')) + '</label><div class="row" style="flex-wrap:nowrap"><input type="color" class="inp sq-color" data-sqt="color" value="' + esc(ty.color) + '">' + optSel('icon', Object.keys(SQ_ICONS).filter(k => !['x', 'more', 'undo', 'check'].includes(k)).map(k => [k, k])) + '</div></div></div>' +
    '<div class="grid g2"><div class="field"><label>' + esc(t('sq_se_presence')) + '</label>' + optSel('presence', SQ_PRESENCE.map(p => [p, t('sq_pe_' + p)])) + '</div><div class="field"><label>' + esc(t('sq_se_holder')) + '</label>' + optSel('needs_holder', SQ_HOLDER.map(h => [h, t('sq_se_h_' + (h || 'none'))])) + '</div></div>' +
    '<div class="grid g3"><div class="field"><label>' + esc(t('sq_se_due')) + '</label>' + optSel('needs_due_date', needs) + '</div><div class="field"><label>' + esc(t('sq_se_note')) + '</label>' + optSel('needs_note', needs) + '</div><div class="field"><label>' + esc(t('sq_se_date')) + '</label>' + optSel('needs_date', needs) + '</div></div>' +
    '<div class="grid g2"><div class="field"><label>' + esc(t('sq_se_returns')) + '</label>' + optSel('returns_to', [['', t('sq_se_ret_none')]].concat(types.filter(x => x.id !== ty.id && x.presence === 'in').map(x => [x.id, sqTypeLabel(x)]))) + '</div>' +
      '<div class="field"><label>' + esc(t('sq_se_applies')) + '</label><div class="row">' + SQ_APPLIES.map(a => '<label class="chk small"><input type="checkbox" data-sqt-ap="' + a + '"' + (ty.applies_to.includes(a) ? ' checked' : '') + '>' + esc(t('sq_se_ap_' + a)) + '</label>').join('') + '</div></div></div>' +
    '<div class="row"><label class="chk"><input type="checkbox" data-sqt-b="quick"' + (ty.quick ? ' checked' : '') + '>' + esc(t('sq_se_quick')) + '</label><label class="chk"><input type="checkbox" data-sqt-b="enabled"' + (!ty.disabled ? ' checked' : '') + '>' + esc(t('sq_se_enabled')) + '</label></div>' +
    (use ? '<div class="hint">' + esc(t('sq_se_used', {n:use})) + '</div>' : '') + '<div class="err-t" id="sqt-err"></div></div>';
  const save = () => {
    const v = (k) => ($('#sq-tform [data-sqt="' + k + '"]') || {}).value || '';
    const label = v('label').trim(); if (!label){ $('#sqt-err').textContent = t('sq_se_e_label'); return; }
    const o = Object.assign({}, ty, {color:v('color').toUpperCase(), icon:v('icon'), presence:v('presence'), needs_holder:v('needs_holder'), needs_due_date:v('needs_due_date'), needs_note:v('needs_note'), needs_date:v('needs_date'), returns_to:v('returns_to'),
      applies_to:$$('#sq-tform [data-sqt-ap]').filter(c => c.checked).map(c => c.dataset.sqtAp), quick:$('#sq-tform [data-sqt-b="quick"]').checked, disabled:!$('#sq-tform [data-sqt-b="enabled"]').checked});
    o.label = id && SQ_DEFAULT_TYPES.some(d => d.id === id) && label === t('sqt_' + id) ? ty.label : label;   // a built-in name left as is stays translated
    if (!o.applies_to.length) o.applies_to = ['binder'];
    const list = types.slice();
    if (id) list[list.findIndex(x => x.id === id)] = o;
    else { let nid = 'c-' + (sqSlug(label) || 'stato'); while (list.some(x => x.id === nid)) nid += '-' + Math.random().toString(36).slice(2, 5); o.id = nid; list.push(o); }
    closeModal(true); sqSaveTypes(list, t('sq_se_saved'));
  };
  const btns = [{label:t('cancel'), cls:'btn', action:'modal-close'}];
  if (id && !use && !SQ_DEFAULT_TYPES.some(d => d.id === id)) btns.unshift({label:t('sq_se_del'), cls:'btn btn-danger', icon:'trash', fn:() => confirmAction({plain:true, title:t('sq_se_del'), detail:sqTypeLabel(ty), onOk:() => { while (topModal()) closeModal(true); sqSaveTypes(types.filter(x => x.id !== id), t('sq_se_saved')); }})});
  btns.push({label:t('save'), cls:'btn btn-primary', icon:'save', fn:save});
  openModal({title:id ? t('sq_se_t_edit', {s:sqTypeLabel(ty)}) : t('sq_se_t_new'), size:'lg', body, autofocus:false, buttons:btns, onMount:() => { const i = $('#sqt-label'); if (i) i.focus(); }});
}

/* ---------------- sync: packages and server ---------------- */
function sqSyncSubset(){ return Array.isArray(S.settings.statusTypes) && S.settings.statusTypes.length ? {statusTypes:clone(S.settings.statusTypes), statusTypesAt:S.settings.statusTypesAt || ''} : {}; }
function sqSyncApply(ss){
  if (!ss || !Array.isArray(ss.statusTypes) || !ss.statusTypes.length || !ss.statusTypesAt) return;
  if (syTs(ss.statusTypesAt) <= syTs(S.settings.statusTypesAt || '')) return;
  S.settings.statusTypes = ss.statusTypes.filter(x => x && typeof x === 'object').slice(0, 60).map(x => sqNormType(syncClean(x)));
  S.settings.statusTypesAt = ss.statusTypesAt;
}
/** Events new for a peer since `since`: recorded after it, or received from ANOTHER peer after it (forwarding). */
function sqChangedSince(since, exclude){
  const s = since ? syTs(since) : 0, future = s > Date.now() + 5000;
  return sqEv().filter(e => !since || future || syTs(e.at) > s || (e._rx && e._rx[1] !== exclude && syTs(e._rx[0]) > s));
}
(function sqWrap(){
  const wrap = (name, fn) => { const orig = window[name]; if (typeof orig !== 'function') return; window[name] = fn(orig); };
  // archive: filter, toolbar select, strip, badges, bulk button; view router; topbar
  wrap('filteredBinders', (o) => function(){ const r = o.apply(this, arguments); return UI.fSq ? r.filter(b => sqBinderMatch(b, UI.fSq)) : r; });
  wrap('viewArchive', (o) => function(){
    let h = o.apply(this, arguments);
    const k = h.indexOf('<div class="seg"><button data-a="arch-view"'); if (k > 0) h = h.slice(0, k) + sqFilterSelectHTML() + h.slice(k);
    const j = h.indexOf('<div class="kpis" id="kpis">'); if (j > 0) h = h.slice(0, j) + '<div id="sq-strip-slot"></div>' + h.slice(j);
    return h;
  });
  wrap('renderArchiveResults', (o) => function(){ const r = o.apply(this, arguments); try { sqDecorateArchive(); } catch(e){ console.warn('status', e); } return r; });
  wrap('renderView', (o) => function(){
    if (S && S.view === 'status'){ document.documentElement.lang = S.lang; $('#view').innerHTML = viewStatus(); return; }
    return o.apply(this, arguments);
  });
  wrap('topbarHTML', (o) => function(){ const h = o.apply(this, arguments); return S.view === 'status' ? h.replace('data-a="nav" data-v="archive" class=""', 'data-a="nav" data-v="archive" class="on"') : h; });
  wrap('viewSettings', (o) => function(){ return o.apply(this, arguments) + sqSettingsHTML(); });
  // Ubicazioni (06h): status of the selected box + "Stato della scatola…" (the box and every binder in it, nested boxes included — v12.1)
  wrap('locDetailHTML', (o) => function(){
    const h = o.apply(this, arguments), l = typeof LUI !== 'undefined' && typeof locById === 'function' ? locById(LUI.sel) : null; if (!l) return h;
    const k = h.indexOf('<span class="tb-sp"></span>'); if (k < 0) return h;
    const cur = sqCurrent(sqEv(), 'location', l.id);
    return h.slice(0, k) + (cur ? sqBadgeHTML(cur) : '') + '<button class="btn btn-sm" data-a="sq-box" data-id="' + esc(l.id) + '" id="sq-box-btn">' + sqIc('hand') + esc(t('sq_box_btn')) + '</button>' + h.slice(k);
  });
  // binder form: status panel in the right column
  wrap('edEnhance', (o) => function(){
    const r = o.apply(this, arguments);
    try { if (UI.ed && !UI.ed.isNew && !$('#sq-ed')){ const prev = $('#ed-preview'), col = prev && prev.parentElement; if (col) col.insertAdjacentHTML('beforeend', '<div class="sq-ed" id="sq-ed">' + sqEdHTML() + '</div>'); } } catch(e){ console.warn('status', e); }
    return r;
  });
  // sync packages (06f)
  wrap('syncBuildPackage', (o) => function(opts){
    const pkg = o.apply(this, arguments);
    try { const ev = sqChangedSince(pkg.since, (opts && opts.target) || '').map(sqRecData); pkg.records.status_events = ev; pkg.counts.status_events = ev.length; Object.assign(pkg.settingsSubset, sqSyncSubset()); } catch(e){ console.warn('status', e); }
    return pkg;
  });
  wrap('syncAnalyze', (o) => function(pkg){
    const plan = o.apply(this, arguments);
    try { const have = new Set(sqEv().map(e => e.id)); plan.statusEvents = sqNormEvents(pkg && pkg.records && pkg.records.status_events).filter(e => !have.has(e.id)); plan.counts.status_events = plan.statusEvents.length; } catch(e){ plan.statusEvents = []; }
    return plan;
  });
  wrap('syncApply', (o) => function(plan, opts){
    const prevRx = SQV.rxPeer; SQV.rxPeer = plan && plan.peer ? plan.peer.id : prevRx;
    let r; try { r = o.apply(this, arguments); } finally { SQV.rxPeer = prevRx; }
    try {
      const add = sqMergeEvents(sqEv(), plan.statusEvents || (plan.pkg && plan.pkg.records && plan.pkg.records.status_events) || [], [nowISO(), plan.peer.id]);
      if (plan.applySettings && plan.pkg && plan.pkg.settingsSubset) sqSyncApply(plan.pkg.settingsSubset);
      if (r) r.status_events = add.length;
      if (add.length || plan.applySettings){ SYNC.quiet = true; persist(); }
    } catch(e){ console.warn('status', e); }
    return r;
  });
  wrap('syncReviewHTML', (o) => function(plan){ const h = o.apply(this, arguments); const n = plan && plan.statusEvents ? plan.statusEvents.length : 0; return n ? '<div class="info-box small" id="sq-sy-line">' + sqIc('hand') + '<div>' + esc(t('sq_sy_events', {n})) + '</div></div>' + h : h; });
  // shared online database (06g): what to push, pending count, settings subset
  wrap('srvChanges', (o) => function(peer){
    const ch = o.apply(this, arguments);
    try { ch.status_events = sqSrvOk() ? sqChangedSince(peer.lastPushAt, peer.id).filter(e => SRV.known.get('status_event:' + e.id) !== e.at) : []; } catch(e){ ch.status_events = []; }
    return ch;
  });
  // log lines pulled from the server carry their events too (details.events): mark them as received from it
  wrap('srvApplyPlan', (o) => function(conf){ const prev = SQV.rxPeer; SQV.rxPeer = conf && conf.url ? 'server:' + conf.url : prev; try { return o.apply(this, arguments); } finally { SQV.rxPeer = prev; } });
  wrap('srvPending', (o) => function(){
    const n = o.apply(this, arguments);
    try { const conf = srvConf(); const peer = conf && S.sync && S.sync.peers && S.sync.peers['server:' + conf.url]; if (peer) return n + srvChanges(peer).status_events.length; } catch(e){}
    return n;
  });
  wrap('srvSettingsSubset', (o) => function(){ return Object.assign(o.apply(this, arguments), sqSyncSubset()); });
  // backups / restore / .sqlite: the history travels with the data, merged by id (never dropped)
  wrap('workspaceJSON', (o) => function(withLog){
    const s = o.apply(this, arguments);
    if (!withLog || !S || !sqEv().length) return s;
    return s.replace(/\n\}\s*$/, ',\n  "status_events": ' + JSON.stringify(sqEv().map(sqRecData)) + '\n}');
  });
  wrap('logImport', (o) => function(mode, IP){
    try { const W = IP && IP.workspace; if (W && Array.isArray(W.status_events) && UI.restoreAll && mode === 'replace') sqMergeEvents(sqEv(), W.status_events); } catch(e){}
    return o.apply(this, arguments);
  });
  // phone events in local mode arrive as activity-log lines (10-auth mobileLiveMerge → logMerge): their events join S
  wrap('logMerge', (o) => function(list){
    const r = o.apply(this, arguments);
    try {
      if (!S || !Array.isArray(list)) return r;
      const evs = []; list.forEach(e => { if (e && /^status\./.test(e.action) && e.details && Array.isArray(e.details.events)) evs.push(...e.details.events); });
      if (evs.length){ const add = sqMergeEvents(sqEv(), evs, [nowISO(), SQV.rxPeer || 'mobile']); if (add.length && !SQV.rxPeer){ sqClearBanner(); persist(); if (typeof renderAll === 'function' && !topModal()) renderAll(); else sqRefresh(); } }
    } catch(e){ console.warn('status', e); }
    return r;
  });
})();
/** An older server (ping without "status_events") would reject the records: the events then travel only inside
    the activity-log lines (details.events), which every server version stores and returns. */
function sqSrvOk(){ return !(typeof SRV !== 'undefined' && Array.isArray(SRV.features) && !SRV.features.includes('status_events')); }
/** The phone (local mode) rewrote the stored state only to add events: no need for the "reload" banner. */
function sqClearBanner(){
  if (!otherTabChanged) return;
  try {
    const o = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); if (!o || !Array.isArray(o.binders)) return;
    const sig = (bs) => bs.map(b => b.id + '@' + b.updated_at).sort().join('|');
    if (o.binders.length === S.binders.length && sig(o.binders) === sig(S.binders)){ otherTabChanged = false; renderBanner(); }
  } catch(e){}
}

/* ---------------- actions & events ---------------- */
const SQ_ACTIONS = {
  'sq-pick': (el) => sqSheetPick(el.dataset.id),
  'sq-all': () => { if (SQV.sheet){ SQV.sheet.all = true; sqSheetDraw(); } },
  'sq-back': () => { if (SQV.sheet){ SQV.sheet.step = 'pick'; SQV.sheet.ty = null; sqSheetDraw(); } },
  'sq-go': () => sqSheetGo(),
  'sq-open': (el) => sqOpenBinder(el.dataset.id),
  'sq-doc': (el) => sqOpenDoc(el.dataset.id, el.dataset.doc),
  'sq-quick': (el) => { const b = sqBinder(el.dataset.id); if (b) sqQuickApply({targets:[sqTargetBinder(b)], kind:'binder', client:b.company_name, title:t('sq_sheet_t', {c:b.speaking_code}), cur:sqBCur(b)}, el.dataset.st); },
  'sq-bulk': () => sqOpenBulk(),
  'sq-box': (el) => sqOpenBox(el.dataset.id),
  'sq-row-quick': (el) => sqRowOpen(el.dataset.k, el.dataset.st),
  'sq-row-open': (el) => sqRowOpen(el.dataset.k, ''),
  'sq-dash-p': (el) => { SQV.dash.p = SQV.dash.p === el.dataset.v ? '' : el.dataset.v; renderView(); },
  'sq-csv-out': () => sqCsvOut(),
  'sq-csv-all': () => sqCsvAll(),
  'sq-verif-csv': (el) => { const e = (LOG.entries || []).find(x => x.id === el.dataset.id); if (!e) return; const name = 'docmap_verifica_' + slugify((e.target && e.target.code) || 'scatola') + '_' + sqStamp() + '.csv'; download(name, sqVerifCsv(e.details || {}), 'text/csv'); toast(t('sq_exported', {f:name})); },
  'sq-mode': () => sqModeOpen(),
  'sq-mode-ty': (el) => { const M = SQV.mode; if (!M) return; M.ty = sqType(sqTy(), el.dataset.id); M.vals = sqDefaults(M.ty, {}); M.msg = null; sqModeDraw(); },
  'sq-mode-undo': (el) => { const M = SQV.mode, x = M && M.list[+el.dataset.i]; if (!x || x.undone) return; sqUndo(x.events); x.undone = true; sqModeDraw(); },
  'sq-se-add': () => sqTypeForm(''),
  'sq-se-edit': (el) => sqTypeForm(el.dataset.id),
  'sq-se-move': (el) => { const list = sqTy(), i = +el.dataset.i, j = i + (+el.dataset.d); if (j < 0 || j >= list.length) return; const x = list[i]; list[i] = list[j]; list[j] = x; sqSaveTypes(list); },
  'sq-se-reset': () => confirmAction({plain:true, title:t('sq_se_reset'), detail:t('sq_se_reset_d'), onOk:() => { const cur = sqTy(), def = sqDefaultTypes(); sqSaveTypes(def.concat(cur.filter(x => !def.some(d => d.id === x.id))), t('sq_se_saved')); }})
};
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.sqFilter){ UI.fSq = el.value; renderArchiveResults(); return; }
  if (el.dataset && el.dataset.sqd && el.dataset.sqd !== 'q'){ SQV.dash[el.dataset.sqd] = el.value; renderView(); }
});
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.sqd === 'q'){ SQV.dash.q = el.value; const box = $('#sq-dash-rows'); if (box) box.innerHTML = sqDashRowsHTML(sqDashFiltered(), sqRowsAll().length); }
  if (el.dataset && el.dataset.sqm && SQV.mode) SQV.mode.vals[el.dataset.sqm] = el.value;
});
document.addEventListener('keydown', (e) => {
  const el = e.target;
  if (el && el.id === 'sq-scan' && (e.key === 'Enter' || e.key === 'Tab')){ e.preventDefault(); const v = el.value; el.value = ''; if (v.trim()) sqModeInput(v); return; }
  if (el && el.dataset && el.dataset.sqf && e.key === 'Enter' && el.tagName === 'INPUT'){ e.preventDefault(); sqSheetGo(); }
});
document.addEventListener('DOMContentLoaded', () => {
  Object.assign(ACTIONS, SQ_ACTIONS);
  if (typeof VIEW_LABEL !== 'undefined') VIEW_LABEL.status = 'sq_h';
  HELP_TOPICS.push({ id:'status', guide:'status', tags:['archive', 'qr'], acts:['how', 'edit'], pop:80, related:['mobile', 'locations', 'log'],
    title:{it:'Come segno che un faldone è preso, reinserito o dato al Comune?', en:'How do I mark a binder as taken, put back or given to the council?'},
    body:{
      it:'<p>Ogni faldone, ogni singolo documento e ogni scatola può avere uno <b>stato</b>: <b>Preso</b>, <b>Reinserito</b>, <b>Dato al cliente</b>, <b>Restituito dal cliente</b>, <b>Fuori per pratica</b>, <b>Dato al Comune / ente</b> (fino al… con nota), <b>Restituito dal Comune / ente</b> (il…), <b>Mancante / non trovato</b>, <b>Ritrovato</b>, <b>Da verificare</b>. Così DocMap sa sempre chi ha cosa.</p>' +
        '<p><b>La regola per tutto lo studio</b>: quando prendi un faldone scansiona il QR e premi <b>Preso</b>; quando lo rimetti a posto scansionalo e premi <b>Reinserito</b>. Chi lo scansiona dopo vede subito "Preso da Mario · da 2 giorni".</p><ol>' +
        '<li><b>Dal telefono</b> (dopo il login, una volta sola): inquadra il QR → in cima alla scheda ci sono i pulsanti grandi. Un tocco per "Preso" e "Reinserito"; per gli stati che chiedono chi lo ha, una data o una nota c\'è un secondo tocco con i dati già pronti. Per un solo documento tocca il documento nell\'elenco. Hai 10 secondi per annullare.</li>' +
        '<li><b>Scatole</b>: inquadra il QR della scatola → <b>Applica a tutta la scatola</b> (es. "Dato al Comune fino al…" con una nota). Quando torna premi <b>Verifica rientro</b> e scansiona i QR dei faldoni che contiene: vedi trovati e mancanti, e alla fine DocMap segna i trovati come restituiti e (se confermi) i mancanti come mancanti. Il report resta nel registro e si scarica in CSV.</li>' +
        '<li><b>Dal PC</b>: nella scheda del faldone c\'è il riquadro <b>Stato del faldone</b> con lo storico; in Archivio il filtro per stato e il pulsante <b>Stato…</b> per i faldoni spuntati; <b>Modalità stato</b> per il lettore USB (scegli lo stato, poi scansiona un faldone dopo l\'altro).</li>' +
        '<li><b>Fuori archivio</b>: cosa è fuori, chi ce l\'ha, da quando, chi è <b>in ritardo</b> e cosa manca; esporti tutto in CSV.</li></ol>' +
        '<p>Gli stati si personalizzano in <b>Impostazioni › Stati rapidi</b> (nome, colore, cosa chiedere, pulsante rapido). Ogni movimento è registrato con chi, quando e da dove e si sincronizza con il server e con i pacchetti.</p>',
      en:'<p>Every binder, every single document and every box can have a <b>status</b>: <b>Taken</b>, <b>Put back</b>, <b>Given to the client</b>, <b>Returned by the client</b>, <b>Out for a case</b>, <b>Given to the council / agency</b> (until… with a note), <b>Returned by the council / agency</b> (on…), <b>Missing / not found</b>, <b>Found again</b>, <b>To be checked</b>. So DocMap always knows who has what.</p>' +
        '<p><b>The rule for the whole office</b>: when you take a binder scan its QR and press <b>Taken</b>; when you put it back scan it and press <b>Put back</b>. Whoever scans it next sees "Taken by Mario · for 2 days" at once.</p><ol>' +
        '<li><b>From a phone</b> (signed in once): point at the QR → the big buttons are on top of the page. One tap for "Taken" and "Put back"; statuses that ask who has it, a date or a note take a second tap with the values already filled in. For a single document tap the document in the list. You have 10 seconds to undo.</li>' +
        '<li><b>Boxes</b>: scan the box QR → <b>Apply to the whole box</b> (e.g. "Given to the council until…" with a note). When it comes back press <b>Return check</b> and scan the QR of the binders inside: you see found and missing ones, and at the end DocMap marks the found ones as returned and (if you confirm) the missing ones as missing. The report stays in the log and downloads as CSV.</li>' +
        '<li><b>On the PC</b>: the binder form has the <b>Binder status</b> panel with the history; in Archive the status filter and the <b>Status…</b> button for the ticked binders; <b>Status mode</b> for the USB scanner (pick the status, then scan one binder after the other).</li>' +
        '<li><b>Out of the archive</b>: what is out, who has it, since when, what is <b>overdue</b> and what is missing; export everything as CSV.</li></ol>' +
        '<p>Statuses are customised in <b>Settings › Quick statuses</b> (name, colour, what to ask, quick button). Every movement is recorded with who, when and from where, and syncs with the server and with packages.</p>'
    }});
  if (typeof GUIDES !== 'undefined') GUIDES.status = { pop:60, title:{it:'Stati: preso, reinserito, dato al Comune', en:'Statuses: taken, put back, given to the council'}, steps:[
    { target:'.nav [data-v="archive"]', title:{it:'Apri l\'Archivio', en:'Open the Archive'}, text:{it:'Clicca "Archivio" nella barra in alto.', en:'Click "Archive" in the top bar.'}, done:() => S.view === 'archive' },
    { target:() => $('#sq-filter'), title:{it:'Filtro per stato', en:'Status filter'}, text:{it:'Qui vedi solo i faldoni fuori archivio, in ritardo, mancanti o con uno stato preciso. Il loro stato compare anche nella colonna "Stato".', en:'Show only the binders out of the archive, overdue, missing or with one status. Their status also shows in the "State" column.'}, noAutoClick:true },
    { target:() => $('#sq-bulk-btn') || $('#bulkbar'), title:{it:'Stato di più faldoni', en:'Status of several binders'}, text:{it:'Spunta i faldoni e premi "Stato…": per esempio "Dato al cliente" per tutti in un colpo.', en:'Tick the binders and press "Status…": for example "Given to the client" for all of them at once.'}, noAutoClick:true },
    { target:() => $('#sq-strip-open') || $('#bulkbar'), title:{it:'Fuori archivio', en:'Out of the archive'}, text:{it:'Quando qualcosa è fuori, qui c\'è il riepilogo e il pulsante per aprire "Fuori archivio": chi ha cosa, da quando, chi è in ritardo.', en:'When something is out, the summary and the button that opens "Out of the archive" are here: who has what, since when, what is overdue.'}, noAutoClick:true },
    { target:() => $('.nav [data-v="archive"]'), title:{it:'Dal telefono', en:'From a phone'}, text:{it:'Sul telefono: inquadra il QR del faldone, premi "Preso"; quando lo rimetti a posto, di nuovo il QR e "Reinserito". Per una scatola: "Applica a tutta la scatola" e, al ritorno, "Verifica rientro".', en:'On the phone: scan the binder QR, press "Taken"; when you put it back, the QR again and "Put back". For a box: "Apply to the whole box" and, when it comes back, "Return check".'}, noAutoClick:true },
    { final:true, title:{it:'Pronto ✓', en:'Ready ✓'}, text:{it:'Gli stati si personalizzano in Impostazioni › Stati rapidi. Ogni movimento è nel Registro attività e si sincronizza.', en:'Statuses are customised in Settings › Quick statuses. Every movement is in the Activity log and syncs.'} }
  ]};
});

/* v12 stream C integration (feature-detected): when the global scan dispatcher exists (11e-nfc.js: onTagScanned → TAG_SCAN_HANDLERS),
   QR / NFC / USB-scanner reads go to the open "Modalità stato" first (only while a status is chosen). */
function sqTagReg(){
  try { if (typeof TAG_SCAN_HANDLERS !== 'undefined' && Array.isArray(TAG_SCAN_HANDLERS) && !TAG_SCAN_HANDLERS.some(h => h && h.id === 'status'))
    TAG_SCAN_HANDLERS.unshift({id:'status', active:() => !!(SQV.mode && SQV.mode.ty), handle:(code) => { sqModeInput(String(code || '')); return true; }}); } catch(e){}
}
sqTagReg(); document.addEventListener('DOMContentLoaded', sqTagReg);
