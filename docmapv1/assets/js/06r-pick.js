/* =====================================================================
   DocMap 2026 — v12.10 «Prelievi e consegne» on the PC (index.html, after 06q-inventory.js). Model: 02j-pick.js.

   ⚙ Funzioni avanzate › Lavoro › Prelievi (view 'pick'):
   - Nuovo prelievo: why (purpose → status type + default holder + return date), what (client, years, text search,
     category / tag, binders ticked in the Archivio, pasted codes), a live preview with what is already out.
   - The list: the walk through the shelves (stops in physical order, serpentine), the estimated time, progress
     (taken / handed over / back) read from the status events of the list (batch_id = the list id, also from phones).
   - Outputs: printed pick sheet (A4, route order, tick boxes), paper hand-over form, CSV, phone link + QR
     (scan.html?pk=…: the phone ticks the binders off by scanning, then records the statuses and the signature).
   - Signed hand-over on the PC (mouse or touch screen) and return, each with a receipt and a SHA-256 fingerprint.
   Storage: S.picks (this PC, in the backups); the custody chain itself is the status events (synced everywhere).
   S.picks[] = {id:'pk-…', title, purpose, status_id, holder, due_date, note, ids:[binder ids], created_at, updated_at,
     created_by, closed_at, handovers:[{id, at, kind:'out'|'back', recipient, doc, operator, sig, sigHash, hash, items:[{id, code}]}]}
   ===================================================================== */
'use strict';

Object.assign(I18N.it, {
  nav_pick:'Prelievi e consegne', nd_pick:'Prepara i faldoni per una verifica, un cliente, una pratica: percorso, firma, rientro', nm_work:'Lavoro',
  pk_h:'Prelievi e consegne', pk_p:('Un elenco di faldoni da prendere per un motivo preciso: ' + brandName() + ' li mette nell\'ordine del giro tra gli scaffali, li segna come usciti, raccoglie la firma di chi li riceve e controlla il rientro.'),
  pk_new:'Nuovo prelievo', pk_none:'Nessun prelievo ancora. Crea il primo: per esempio i faldoni 2021-2023 di un cliente per una verifica fiscale.',
  pk_open:'In corso', pk_closed:'Chiusi', pk_phone_only:'Consegne firmate dal telefono', pk_back_list:'Tutti i prelievi',
  pk_f_purpose:'Motivo', pk_f_title:'Titolo', pk_f_title_ph:'es. Verifica AdE Rossi Srl 2021-2023', pk_f_holder:'A chi vanno', pk_f_holder_ph:'es. Agenzia delle Entrate, Mario Rossi',
  pk_f_due:'Rientro previsto', pk_f_note:'Nota', pk_f_status:'Stato da registrare all\'uscita', pk_what:'Quali faldoni', pk_f_client:'Cliente (nome o Codice Multi)', pk_f_years:'Anni', pk_f_from:'dal', pk_f_to:'al',
  pk_f_q:'Ricerca libera', pk_f_q_ph:'come nella ricerca dell\'Archivio', pk_f_tag:'Categoria o tag', pk_f_codes:'Codici incollati', pk_f_codes_ph:'Un codice per riga (BL12, dm26…), anche da Excel',
  pk_f_sel:'Aggiungi i faldoni spuntati nell\'Archivio ({n})', pk_found:'{n} faldoni trovati', pk_found0:'Scegli almeno un criterio: cliente, anni, ricerca, categoria, codici o faldoni spuntati.',
  pk_already_out:'già fuori: {s}', pk_noloc:'senza posizione', pk_save:'Crea il prelievo ({n})', pk_cancel:'Annulla', pk_unknown:'Codici non trovati: {c}', pk_too_many:'Al massimo {n} faldoni per prelievo: dividilo in più elenchi.',
  pk_route:'Percorso', pk_route_sum:'{s} tappe · {r} stanze · circa {m}', pk_route_noloc:'Senza posizione (cercali a mano)', pk_stop:'Tappa {n}',
  pk_c_took:'presi', pk_c_out:'fuori ora', pk_c_handed:'consegnati con firma', pk_c_back:'rientrati', pk_c_n:'{a} di {n}',
  pk_a_print:'Stampa la distinta', pk_a_paper:'Modulo di consegna su carta', pk_a_phone:'Spunta col telefono', pk_a_take:'Segna come prelevati', pk_a_sign:'Consegna con firma', pk_a_back:'Rientro', pk_a_csv:'Scarica CSV', pk_a_close:'Chiudi il prelievo', pk_a_reopen:'Riapri', pk_a_del:'Elimina l\'elenco',
  pk_take_done:'{n} faldoni segnati come "{s}"', pk_take_none:'Sono già tutti fuori con questo prelievo.', pk_back_done:'{n} faldoni rientrati', pk_back_none:'Nessun faldone di questo elenco è fuori.',
  pk_del_q:'Eliminare l\'elenco "{t}"? Gli stati registrati (uscite, firme, rientri) restano nella storia dei faldoni.', pk_closed_on:'chiuso il {d}', pk_due_on:'rientro entro il {d}', pk_overdue:'in ritardo',
  pk_sign_h:'Consegna con firma', pk_back_h:'Rientro dei faldoni', pk_sign_who:'Nome e cognome di chi riceve', pk_back_who:'Nome e cognome di chi riconsegna', pk_sign_doc:'Documento (facoltativo)', pk_sign_doc_ph:'es. C.I. AX1234567',
  pk_sign_pad:'Firma qui (mouse, dito o penna)', pk_sign_clear:'Cancella la firma', pk_sign_go:'Registra la consegna', pk_back_go:'Registra il rientro', pk_sign_nosig:'Senza firma (firma su carta)', pk_sign_need:'Scrivi il nome di chi riceve.',
  pk_sign_which:'Faldoni consegnati', pk_back_which:'Faldoni che rientrano', pk_sign_done:'Consegna registrata: {n} faldoni a {w}', pk_back_ok:'Rientro registrato: {n} faldoni', pk_receipt:'Ricevuta', pk_handovers:'Consegne e rientri',
  pk_phone_h:'Spunta col telefono', pk_phone_p:'Inquadra il QR col telefono (o apri il link): il telefono mostra il giro tra gli scaffali e spunta i faldoni man mano che scansioni le loro etichette. Alla fine registra l\'uscita e, se vuoi, la firma di chi li riceve.',
  pk_phone_local:('Il link funziona quando ' + brandName() + ' è aperto dal sito o dalla sede (https): da un file aperto con doppio clic il telefono non lo può aprire.'), pk_phone_copy:'Copia il link', pk_phone_copied:'Link copiato', pk_phone_cut:'Il link porta i primi {n} faldoni del percorso: gli altri il telefono li riconosce lo stesso quando li scansioni.',
  pk_fp_ok:'Firma e ricevuta integre', pk_fp_bad:'Attenzione: l\'impronta non corrisponde', pk_fp_nosig:'Firma non disponibile su questo PC',
  pk_csv_cols:'Tappa;Posizione;Codice;Cliente;Contenuto;Anni;Stato;Uscito;Rientrato', pk_log_new:'Creato il prelievo "{t}" ({n} faldoni)', pk_mine:'Creato da {u} il {d}',
  pk_need_status:'Il tipo di stato "{s}" non esiste più: scegline un altro in Motivo.', pk_from_sel:'Prelievo dai faldoni spuntati', pk_sheet_h:'Distinta di prelievo', pk_sheet_ok:'Preso', pk_sheet_back:'Rientrato',
});
Object.assign(I18N.en, {
  nav_pick:'Pick lists and hand-overs', nd_pick:'Prepare the binders for an audit, a client, a case: route, signature, return', nm_work:'Work',
  pk_h:'Pick lists and hand-overs', pk_p:('A list of binders to take out for one need: ' + brandName() + ' orders them along the walk through the shelves, marks them as out, collects the signature of who receives them and checks they come back.'),
  pk_new:'New pick list', pk_none:'No pick list yet. Create the first one: for example a client\'s 2021-2023 binders for a tax audit.',
  pk_open:'Open', pk_closed:'Closed', pk_phone_only:'Hand-overs signed on a phone', pk_back_list:'All pick lists',
  pk_f_purpose:'Purpose', pk_f_title:'Title', pk_f_title_ph:'e.g. Tax audit Rossi Ltd 2021-2023', pk_f_holder:'Who gets them', pk_f_holder_ph:'e.g. Revenue agency, Mario Rossi',
  pk_f_due:'Expected return', pk_f_note:'Note', pk_f_status:'Status recorded when they leave', pk_what:'Which binders', pk_f_client:'Client (name or Multi code)', pk_f_years:'Years', pk_f_from:'from', pk_f_to:'to',
  pk_f_q:'Free search', pk_f_q_ph:'as in the Archive search', pk_f_tag:'Category or tag', pk_f_codes:'Pasted codes', pk_f_codes_ph:'One code per line (BL12, dm26…), also from Excel',
  pk_f_sel:'Add the binders ticked in the Archive ({n})', pk_found:'{n} binders found', pk_found0:'Choose at least one criterion: client, years, search, category, codes or ticked binders.',
  pk_already_out:'already out: {s}', pk_noloc:'no position', pk_save:'Create the pick list ({n})', pk_cancel:'Cancel', pk_unknown:'Codes not found: {c}', pk_too_many:'At most {n} binders per pick list: split it into several lists.',
  pk_route:'Route', pk_route_sum:'{s} stops · {r} rooms · about {m}', pk_route_noloc:'No position (look for them by hand)', pk_stop:'Stop {n}',
  pk_c_took:'taken', pk_c_out:'out now', pk_c_handed:'handed over with signature', pk_c_back:'returned', pk_c_n:'{a} of {n}',
  pk_a_print:'Print the pick sheet', pk_a_paper:'Paper hand-over form', pk_a_phone:'Tick off with the phone', pk_a_take:'Mark as taken', pk_a_sign:'Hand over with signature', pk_a_back:'Return', pk_a_csv:'Download CSV', pk_a_close:'Close the pick list', pk_a_reopen:'Reopen', pk_a_del:'Delete the list',
  pk_take_done:'{n} binders marked "{s}"', pk_take_none:'They are all out with this pick list already.', pk_back_done:'{n} binders returned', pk_back_none:'No binder of this list is out.',
  pk_del_q:'Delete the list "{t}"? The recorded statuses (out, signatures, returns) stay in the binders\' history.', pk_closed_on:'closed on {d}', pk_due_on:'back by {d}', pk_overdue:'overdue',
  pk_sign_h:'Hand over with signature', pk_back_h:'Return of the binders', pk_sign_who:'Full name of who receives', pk_back_who:'Full name of who returns', pk_sign_doc:'ID document (optional)', pk_sign_doc_ph:'e.g. ID AX1234567',
  pk_sign_pad:'Sign here (mouse, finger or pen)', pk_sign_clear:'Clear the signature', pk_sign_go:'Record the hand-over', pk_back_go:'Record the return', pk_sign_nosig:'No signature (signed on paper)', pk_sign_need:'Write the name of who receives.',
  pk_sign_which:'Binders handed over', pk_back_which:'Binders coming back', pk_sign_done:'Hand-over recorded: {n} binders to {w}', pk_back_ok:'Return recorded: {n} binders', pk_receipt:'Receipt', pk_handovers:'Hand-overs and returns',
  pk_phone_h:'Tick off with the phone', pk_phone_p:'Scan the QR with the phone (or open the link): the phone shows the walk through the shelves and ticks the binders off as you scan their labels. At the end it records them as out and, if you want, the signature of who receives them.',
  pk_phone_local:('The link works when ' + brandName() + ' is opened from the website or the office server (https): from a file opened with a double click the phone cannot open it.'), pk_phone_copy:'Copy the link', pk_phone_copied:'Link copied', pk_phone_cut:'The link carries the first {n} binders of the route: the phone still recognises the others when you scan them.',
  pk_fp_ok:'Signature and receipt intact', pk_fp_bad:'Warning: the fingerprint does not match', pk_fp_nosig:'Signature not available on this PC',
  pk_csv_cols:'Stop;Position;Code;Client;Contents;Years;Status;Out;Returned', pk_log_new:'Created the pick list "{t}" ({n} binders)', pk_mine:'Created by {u} on {d}',
  pk_need_status:'The status type "{s}" no longer exists: choose another Purpose.', pk_from_sel:'Pick list from the ticked binders', pk_sheet_h:'Pick sheet', pk_sheet_ok:'Taken', pk_sheet_back:'Returned',
});
if (typeof ICONS === 'object'){
  Object.assign(ICONS, {
    route:'<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    pen:'<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"/>',
    phone:'<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
    back:ICONS.back || '<path d="m15 18-6-6 6-6"/>'
  });
}
if (typeof NAV_MORE !== 'undefined' && !NAV_MORE.some(g => g[0] === 'nm_work')) NAV_MORE.unshift(['nm_work', [['pick', 'route', 'nav_pick', 'nd_pick']]]);
if (typeof ADV_VIEWS !== 'undefined' && !ADV_VIEWS.includes('pick')) ADV_VIEWS.push('pick');

const PK = { open:'', draft:null, pad:null, msg:null, sigCache:new Map() };
window.PK = PK;

/* ---------------- data ---------------- */
function pkList(){ if (!Array.isArray(S.picks)) S.picks = []; return S.picks; }
const pkGet = (id) => pkList().find(p => p.id === id) || null;
const pkB = (id) => S.binders.find(b => b.id === id) || null;
const pkTypes = () => sqTypes(S.settings);
function pkNorm(p){
  p = Object.assign({id:'', title:'', purpose:'other', status_id:'', holder:'', due_date:'', note:'', ids:[], created_at:'', updated_at:'', created_by:'', closed_at:'', handovers:[]}, p || {});
  p.ids = Array.isArray(p.ids) ? p.ids.filter(x => typeof x === 'string').slice(0, PK_MAX_ITEMS) : [];
  p.handovers = Array.isArray(p.handovers) ? p.handovers.filter(h => h && h.id) : [];
  ['title', 'purpose', 'status_id', 'holder', 'due_date', 'note', 'created_at', 'updated_at', 'created_by', 'closed_at'].forEach(k => p[k] = String(p[k] == null ? '' : p[k]));
  return p;
}
function pkBinders(p){ return p.ids.map(pkB).filter(Boolean); }
function pkPerItem(){
  try { const st = typeof dmtStats === 'function' ? dmtStats('find') : null; if (st && st.n >= 5) return Math.max(5, Math.min(90, Math.round(st.median / 1000))); } catch(e){}
  return PK_ITEM_S;
}
function pkProg(p){ return pkProgress(sqEv(), p.ids, p.id, pkTypes()); }
const pkToday = () => sqToday();
function pkAddDays(n){ if (!n) return ''; const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function pkBinderYears(b){
  const ys = new Set(); const add = (v) => { String(v || '').split(/[^0-9]+/).forEach(x => { if (/^(19|20)\d\d$/.test(x)) ys.add(+x); }); };
  add(b.ref_year); (b.contents_items || []).forEach(i => add(i.year));
  return ys;
}
const pkNormTxt = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* ---------------- builder ---------------- */
function pkDraftNew(preset){
  const pu = pkPurpose('audit');
  return Object.assign({purpose:pu.id, title:'', status_id:pu.status, holder:pu.holder === 'me' ? logWho() : pu.holder === 'client' ? '' : pu.holder, due_date:pkAddDays(pu.due), note:'',
    client:'', yFrom:'', yTo:'', q:'', tag:'', codes:'', useSel:false, excl:new Set()}, preset || {});
}
/** Candidate binders for the draft: AND of the filled criteria, plus pasted codes and ticked binders. */
function pkCandidates(d){
  const live = S.binders.filter(b => !(S.settings.hideDemo && typeof isDemo === 'function' && isDemo(b)));
  const crit = !!(d.client.trim() || d.yFrom || d.yTo || d.q.trim() || d.tag.trim());
  let set = [];
  if (crit){
    let L = live;
    if (d.q.trim()){ let ids = null; try { ids = new Set(srchRun(L, d.q, {notes:true}).list.map(b => b.id)); } catch(e){ ids = null; } if (ids) L = L.filter(b => ids.has(b.id)); }
    if (d.client.trim()){ const c = pkNormTxt(d.client.trim()); L = L.filter(b => pkNormTxt(b.company_name).includes(c) || (b.multi_code && pkNormTxt(b.multi_code) === c)); }
    if (d.tag.trim()){ const g = pkNormTxt(d.tag.trim()); L = L.filter(b => pkNormTxt(b.category).includes(g) || pkNormTxt(b.tags).split(/[,;]+/).some(x => x.trim() === g || x.trim().includes(g))); }
    const yf = parseInt(d.yFrom, 10), yt = parseInt(d.yTo, 10);
    if (yf || yt){ const lo = yf || yt, hi = yt || yf; L = L.filter(b => { const ys = pkBinderYears(b); for (const y of ys) if (y >= Math.min(lo, hi) && y <= Math.max(lo, hi)) return true; return false; }); }
    set = L;
  }
  const unknown = [];
  if (d.codes.trim()){
    d.codes.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean).forEach(c => {
      const u = c.toUpperCase(), m = /dm26[A-Za-z0-9]{8}/.exec(c);
      const b = live.find(x => (m && x.short_code === m[0]) || String(x.speaking_code).toUpperCase() === u);
      if (b){ if (!set.includes(b)) set.push(b); } else unknown.push(c);
    });
  }
  if (d.useSel) live.filter(b => b.selected_for_print).forEach(b => { if (!set.includes(b)) set.push(b); });
  return {list:set, unknown, any:crit || !!d.codes.trim() || d.useSel};
}
function pkPurposeOptions(sel){ return PK_PURPOSES.map(p => '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(t('pkp_' + p.id)) + '</option>').join(''); }
function pkStatusOptions(sel){ return sqTypesFor(pkTypes(), 'binder').filter(ty => ty.presence !== 'in').map(ty => '<option value="' + esc(ty.id) + '"' + (ty.id === sel ? ' selected' : '') + '>' + esc(sqTypeLabel(ty)) + '</option>').join(''); }
function pkBuilderHTML(){
  const d = PK.draft, nSel = S.binders.filter(b => b.selected_for_print).length;
  const f = (k, label, ph, type, extra) => '<div class="field"><label for="pk-' + k + '">' + esc(label) + '</label><input class="inp" id="pk-' + k + '" data-pk="' + k + '" type="' + (type || 'text') + '" value="' + esc(d[k]) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + (extra || '') + '></div>';
  return '<div class="pk-build" id="pk-build"><div class="row" style="justify-content:space-between"><h1 style="margin:0">' + esc(t('pk_new')) + '</h1><button class="btn" data-a="pk-cancel" type="button">' + ic('x') + esc(t('pk_cancel')) + '</button></div>' +
    '<div class="g2"><div class="card card-p stack">' +
      '<div class="field"><label for="pk-purpose">' + esc(t('pk_f_purpose')) + '</label><select class="inp" id="pk-purpose" data-pk="purpose">' + pkPurposeOptions(d.purpose) + '</select></div>' +
      f('title', t('pk_f_title'), t('pk_f_title_ph')) + f('holder', t('pk_f_holder'), t('pk_f_holder_ph')) +
      '<div class="g2">' + f('due_date', t('pk_f_due'), '', 'date') + '<div class="field"><label for="pk-status_id">' + esc(t('pk_f_status')) + '</label><select class="inp" id="pk-status_id" data-pk="status_id">' + pkStatusOptions(d.status_id) + '</select></div></div>' +
      f('note', t('pk_f_note'), '') +
    '</div><div class="card card-p stack"><h2 style="margin:0">' + esc(t('pk_what')) + '</h2>' +
      f('client', t('pk_f_client'), '', 'text', ' list="pk-clients" autocomplete="off"') + '<datalist id="pk-clients">' + Array.from(new Set(S.binders.map(b => b.company_name).filter(Boolean))).sort(naturalCmp).slice(0, 400).map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>' +
      '<div class="field"><label>' + esc(t('pk_f_years')) + '</label><div class="row" style="flex-wrap:nowrap;gap:8px"><span class="small muted">' + esc(t('pk_f_from')) + '</span><input class="inp" style="max-width:110px" inputmode="numeric" id="pk-yFrom" data-pk="yFrom" value="' + esc(d.yFrom) + '" placeholder="2021"><span class="small muted">' + esc(t('pk_f_to')) + '</span><input class="inp" style="max-width:110px" inputmode="numeric" id="pk-yTo" data-pk="yTo" value="' + esc(d.yTo) + '" placeholder="2023"></div></div>' +
      f('q', t('pk_f_q'), t('pk_f_q_ph')) + f('tag', t('pk_f_tag'), '') +
      '<div class="field"><label for="pk-codes">' + esc(t('pk_f_codes')) + '</label><textarea class="inp mono small" rows="3" id="pk-codes" data-pk="codes" placeholder="' + esc(t('pk_f_codes_ph')) + '">' + esc(d.codes) + '</textarea></div>' +
      (nSel ? '<label class="chk"><input type="checkbox" data-pk="useSel" id="pk-useSel"' + (d.useSel ? ' checked' : '') + '>' + esc(t('pk_f_sel', {n:nSel})) + '</label>' : '') +
    '</div></div><div class="card card-p" id="pk-prev">' + pkPreviewHTML() + '</div></div>';
}
function pkPreviewHTML(){
  const d = PK.draft, C = pkCandidates(d), types = pkTypes(), ev = sqEv();
  if (!C.any) return '<p class="muted" id="pk-found">' + esc(t('pk_found0')) + '</p>';
  const inc = C.list.filter(b => !d.excl.has(b.id));
  const route = pkRoute(C.list);
  const pos = new Map(route.order.map((id, i) => [id, i]));
  const rows = C.list.slice().sort((a, b) => pos.get(a.id) - pos.get(b.id)).slice(0, 600).map(b => {
    const cur = sqCurrent(ev, 'binder', b.id), pres = sqPresence(cur, types), out = pres === 'out' || pres === 'missing';
    const ys = Array.from(pkBinderYears(b)).sort(); const yr = ys.length ? (ys.length > 1 ? ys[0] + '–' + ys[ys.length - 1] : ys[0]) : '';
    return '<tr class="' + (d.excl.has(b.id) ? 'pk-x' : '') + '"><td><label class="chk"><input type="checkbox" data-pkx="' + esc(b.id) + '"' + (d.excl.has(b.id) ? '' : ' checked') + '></label></td><td class="mono"><b>' + esc(b.speaking_code) + '</b></td><td>' + esc(b.company_name) + '<div class="tiny muted">' + esc(b.binder_title || '') + '</div></td><td class="mono small">' + esc(yr) + '</td>' +
      '<td class="small">' + esc(pkPathText(pkPath(b)) || '—') + (pkPath(b).length ? '' : ' <span class="pk-warn">' + esc(t('pk_noloc')) + '</span>') + '</td><td class="small">' + (out ? '<span class="pk-warn">' + esc(t('pk_already_out', {s:sqHeadline(cur, types)})) + '</span>' : '') + '</td></tr>';
  }).join('');
  const est = pkEstimate(pkRoute(inc), PK_STOP_S, pkPerItem());
  return '<div class="row" style="justify-content:space-between;align-items:center"><div><b id="pk-found">' + esc(t('pk_found', {n:inc.length})) + '</b>' + (inc.length ? ' <span class="muted small">· ' + esc(t('pk_route_sum', {s:route.stops.length, r:route.rooms, m:pkFmtMin(est)})) + '</span>' : '') + '</div>' +
    '<button class="btn btn-primary" data-a="pk-save" id="pk-save" type="button"' + (inc.length && inc.length <= PK_MAX_ITEMS ? '' : ' disabled') + '>' + ic('check') + esc(t('pk_save', {n:inc.length})) + '</button></div>' +
    (inc.length > PK_MAX_ITEMS ? '<div class="warn-box small" style="margin-top:8px">' + ic('alert') + '<div>' + esc(t('pk_too_many', {n:PK_MAX_ITEMS})) + '</div></div>' : '') +
    (C.unknown.length ? '<div class="warn-box small" style="margin-top:8px" id="pk-unknown">' + ic('alert') + '<div>' + esc(t('pk_unknown', {c:C.unknown.slice(0, 20).join(', ') + (C.unknown.length > 20 ? ' …' : '')})) + '</div></div>' : '') +
    (rows ? '<div class="tbl-wrap" style="margin-top:10px;max-height:460px;overflow:auto"><table class="tbl pk-tbl"><tbody>' + rows + '</tbody></table></div>' : '');
}
function pkPreviewRefresh(){ const el = $('#pk-prev'); if (el) el.innerHTML = pkPreviewHTML(); }
function pkSave(){
  const d = PK.draft; if (!d) return;
  const C = pkCandidates(d), inc = C.list.filter(b => !d.excl.has(b.id));
  if (!inc.length || inc.length > PK_MAX_ITEMS) return;
  if (!sqType(pkTypes(), d.status_id)){ toast(t('pk_need_status', {s:d.status_id}), 'warn'); return; }
  const route = pkRoute(inc), now = nowISO();
  const title = d.title.trim() || (t('pkp_' + d.purpose) + (d.client.trim() ? ' · ' + d.client.trim() : '') + (d.yFrom || d.yTo ? ' ' + [d.yFrom, d.yTo].filter(Boolean).join('-') : ''));
  const p = pkNorm({id:'pk-' + uuid().replace(/-/g, '').slice(0, 16), title, purpose:d.purpose, status_id:d.status_id, holder:d.holder.trim(), due_date:d.due_date, note:d.note.trim(), ids:route.order, created_at:now, updated_at:now, created_by:logWho()});
  pkList().unshift(p);
  logAct('pick.create', null, t('pk_log_new', {t:p.title, n:p.ids.length}), {pick:p.id, purpose:p.purpose, count:p.ids.length, ids:p.ids.slice(0, 400)}, 'ui');
  commit();
  PK.draft = null; PK.open = p.id; renderView(); window.scrollTo(0, 0);
}

/* ---------------- list + detail ---------------- */
function pkCardHTML(p){
  const pr = pkProg(p), c = pr.c, pu = pkPurpose(p.purpose), od = p.due_date && !p.closed_at && c.out && p.due_date < pkToday();
  const pct = c.n ? Math.round(100 * c.back / c.n) : 0, pct2 = c.n ? Math.round(100 * c.took / c.n) : 0;
  return '<button type="button" class="pk-card' + (p.closed_at ? ' closed' : '') + '" data-a="pk-open" data-id="' + esc(p.id) + '"><span class="pk-ic">' + ic('route') + '</span><span class="pk-tx"><b>' + esc(p.title) + '</b>' +
    '<small>' + esc(t('pkp_' + pu.id)) + (p.holder ? ' · ' + esc(p.holder) : '') + ' · ' + c.n + ' · ' + esc(t('pk_c_took')) + ' ' + c.took + ' · ' + esc(t('pk_c_back')) + ' ' + c.back +
    (p.closed_at ? ' · ' + esc(t('pk_closed_on', {d:fmtDate(p.closed_at)})) : p.due_date ? ' · ' + esc(t('pk_due_on', {d:sqDayFmt(p.due_date)})) : '') + (od ? ' · <span class="pk-warn">' + esc(t('pk_overdue')) + '</span>' : '') + '</small>' +
    '<span class="pk-bar"><i style="width:' + pct2 + '%"></i><i class="b" style="width:' + pct + '%"></i></span></span></button>';
}
/** Hand-overs signed on phones (batch 'dl-…' / '….dl-…') that are not in a list of this PC. */
function pkPhoneHandovers(onlyForeign){
  const mine = new Set(pkList().map(p => p.id)), g = new Map();
  sqEv().forEach(e => {
    const b = String(e.batch_id || ''); if (e.undo_of || e.target_type !== 'binder' || !/(^|\.)(dl|rt)-/.test(b)) return;
    const head = b.split('.')[0]; if (mine.has(head) && (onlyForeign || pkGet(head).handovers.some(h => b.endsWith(h.id)))) return;
    if (!g.has(b)) g.set(b, {batch:b, at:e.at, holder:e.holder, user:e.user, note:e.note, kind:/(^|\.)rt-/.test(b) ? 'back' : 'out', events:[]});
    g.get(b).events.push(e);
  });
  return Array.from(g.values()).sort((a, b) => a.at < b.at ? 1 : -1);
}
function viewPick(){
  if (PK.draft) return '<div class="stack">' + pkBuilderHTML() + '</div>';
  const p = PK.open ? pkGet(PK.open) : null;
  if (p) return pkDetailHTML(p);
  const L = pkList(), open = L.filter(x => !x.closed_at), closed = L.filter(x => x.closed_at), ph = pkPhoneHandovers(true);
  return '<div class="stack" id="pk-home"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h1 style="margin:0">' + esc(t('pk_h')) + '</h1><p class="muted" style="max-width:760px">' + esc(t('pk_p')) + '</p></div>' +
    '<button class="btn btn-primary btn-lg" data-a="pk-new" id="pk-new" type="button">' + ic('plus') + esc(t('pk_new')) + '</button></div>' +
    (!L.length ? '<div class="card card-p pk-empty"><div class="pk-empty-ic">' + ic('route') + '</div><p>' + esc(t('pk_none')) + '</p><button class="btn btn-primary" data-a="pk-new" type="button">' + ic('plus') + esc(t('pk_new')) + '</button></div>' : '') +
    (open.length ? '<h2>' + esc(t('pk_open')) + '</h2><div class="pk-cards">' + open.map(pkCardHTML).join('') + '</div>' : '') +
    (ph.length ? '<h2>' + esc(t('pk_phone_only')) + '</h2><div class="card card-p"><ul class="pk-hl">' + ph.slice(0, 50).map(h => '<li><b>' + esc(h.holder || '—') + '</b> · ' + esc(fmtDate(h.at, true)) + ' · ' + h.events.length + ' · ' + esc(h.user || '') +
      ' <button class="btn btn-sm" data-a="pk-receipt-ev" data-b="' + esc(h.batch) + '" type="button">' + ic('file') + esc(t('pk_receipt')) + '</button></li>').join('') + '</ul></div>' : '') +
    (closed.length ? '<details class="pk-closed"><summary>' + esc(t('pk_closed')) + ' (' + closed.length + ')</summary><div class="pk-cards">' + closed.map(pkCardHTML).join('') + '</div></details>' : '') + '</div>';
}
function pkDetailHTML(p){
  const bs = pkBinders(p), route = pkRoute(bs), pr = pkProg(p), c = pr.c, rowOf = new Map(pr.rows.map(r => [r.id, r])), types = pkTypes(), ty = sqType(types, p.status_id);
  const est = pkEstimate(route, PK_STOP_S, pkPerItem()), od = p.due_date && !p.closed_at && c.out && p.due_date < pkToday();
  const item = (b) => { const r = rowOf.get(b.id) || {}; const st = r.back ? 'back' : r.took && r.out ? 'out' : r.took ? 'took' : r.out ? 'busy' : '';
    return '<li class="pk-it ' + st + '"><span class="pk-dot" aria-hidden="true">' + (r.back ? ic('check') : r.took ? ic('arrowRight') : '') + '</span><b class="mono">' + esc(b.speaking_code) + '</b><span>' + esc(b.company_name) + (b.binder_title ? ' · ' + esc(b.binder_title) : '') + '</span>' +
      (r.cur && (r.took || r.out) ? '<small>' + esc(sqHeadline(r.cur, types)) + (r.handed ? ' · ' + esc(t('pk_c_handed')) : '') + '</small>' : '') + '</li>'; };
  const byId = new Map(bs.map(b => [b.id, b]));
  const stops = route.stops.map((s, i) => '<li class="pk-stop"><div class="pk-stop-h"><span class="pk-n">' + (i + 1) + '</span><b>' + esc(s.text) + '</b><small>' + s.ids.length + '</small></div><ul>' + s.ids.map(id => item(byId.get(id))).join('') + '</ul></li>').join('') +
    (route.noLoc.length ? '<li class="pk-stop noloc"><div class="pk-stop-h"><span class="pk-n">?</span><b>' + esc(t('pk_route_noloc')) + '</b><small>' + route.noLoc.length + '</small></div><ul>' + route.noLoc.map(id => item(byId.get(id))).join('') + '</ul></li>' : '');
  const hv = p.handovers.slice().reverse().map(h => '<li>' + ic(h.kind === 'back' ? 'arrowRight' : 'pen') + ' <b>' + esc(t(h.kind === 'back' ? 'pk_c_back' : 'pk_c_handed')) + '</b> · ' + esc(h.recipient) + ' · ' + esc(fmtDate(h.at, true)) + ' · ' + h.items.length +
    ' <button class="btn btn-sm" data-a="pk-receipt" data-id="' + esc(p.id) + '" data-h="' + esc(h.id) + '" type="button">' + ic('file') + esc(t('pk_receipt')) + '</button></li>').join('') +
    pkPhoneHandovers(false).filter(x => x.batch.split('.')[0] === p.id).map(h => '<li>' + ic('phone') + ' <b>' + esc(t(h.kind === 'back' ? 'pk_c_back' : 'pk_c_handed')) + '</b> · ' + esc(h.holder || '') + ' · ' + esc(fmtDate(h.at, true)) + ' · ' + h.events.length +
    ' <button class="btn btn-sm" data-a="pk-receipt-ev" data-b="' + esc(h.batch) + '" type="button">' + ic('file') + esc(t('pk_receipt')) + '</button></li>').join('');
  const kpi = (n, k, cls) => '<div class="pk-k ' + (cls || '') + '"><b>' + n + '</b><span>' + esc(k) + '</span></div>';
  return '<div class="stack" id="pk-detail" data-id="' + esc(p.id) + '"><div><button class="btn btn-ghost btn-sm" data-a="pk-list" type="button">' + ic('back') + esc(t('pk_back_list')) + '</button></div>' +
    '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:16px"><div><h1 style="margin:0">' + esc(p.title) + '</h1><div class="muted small">' + esc(t('pkp_' + p.purpose)) + (p.holder ? ' · ' + esc(p.holder) : '') + (ty ? ' · ' + esc(sqTypeLabel(ty)) : '') +
      (p.due_date ? ' · ' + esc(t('pk_due_on', {d:sqDayFmt(p.due_date)})) : '') + (od ? ' · <span class="pk-warn">' + esc(t('pk_overdue')) + '</span>' : '') + (p.closed_at ? ' · ' + esc(t('pk_closed_on', {d:fmtDate(p.closed_at)})) : '') + '</div>' +
      '<div class="tiny muted">' + esc(t('pk_mine', {u:p.created_by || '—', d:fmtDate(p.created_at, true)})) + (p.note ? ' · ' + esc(p.note) : '') + '</div></div>' +
      '<div class="pk-kpis" id="pk-kpis">' + kpi(c.took + '/' + c.n, t('pk_c_took')) + kpi(c.out, t('pk_c_out'), c.out ? 'out' : '') + kpi(c.handed, t('pk_c_handed')) + kpi(c.back, t('pk_c_back'), c.back === c.n && c.n ? 'ok' : '') + '</div></div>' +
    '<div class="pk-acts row">' +
      '<button class="btn btn-primary" data-a="pk-print" data-id="' + esc(p.id) + '" type="button">' + ic('printer') + esc(t('pk_a_print')) + '</button>' +
      '<button class="btn" data-a="pk-phone" data-id="' + esc(p.id) + '" type="button">' + ic('phone') + esc(t('pk_a_phone')) + '</button>' +
      '<button class="btn" data-a="pk-take" data-id="' + esc(p.id) + '" type="button" id="pk-take">' + ic('arrowRight') + esc(t('pk_a_take')) + '</button>' +
      '<button class="btn" data-a="pk-sign" data-id="' + esc(p.id) + '" type="button" id="pk-sign">' + ic('pen') + esc(t('pk_a_sign')) + '</button>' +
      '<button class="btn" data-a="pk-back" data-id="' + esc(p.id) + '" type="button" id="pk-back">' + ic('check') + esc(t('pk_a_back')) + '</button>' +
      '<details class="pk-more"><summary class="btn">' + ic('list') + '…</summary><div class="pk-more-b">' +
        '<button class="btn btn-sm" data-a="pk-paper" data-id="' + esc(p.id) + '" type="button">' + ic('file') + esc(t('pk_a_paper')) + '</button>' +
        '<button class="btn btn-sm" data-a="pk-csv" data-id="' + esc(p.id) + '" type="button">' + ic('download') + esc(t('pk_a_csv')) + '</button>' +
        '<button class="btn btn-sm" data-a="pk-close" data-id="' + esc(p.id) + '" type="button">' + ic('check') + esc(t(p.closed_at ? 'pk_a_reopen' : 'pk_a_close')) + '</button>' +
        '<button class="btn btn-sm btn-danger" data-a="pk-del" data-id="' + esc(p.id) + '" type="button">' + ic('trash') + esc(t('pk_a_del')) + '</button>' +
      '</div></details></div>' +
    '<div class="card card-p"><div class="row" style="justify-content:space-between"><h2 style="margin:0">' + ic('route') + ' ' + esc(t('pk_route')) + '</h2><span class="muted small" id="pk-route-sum">' + esc(t('pk_route_sum', {s:route.stops.length, r:route.rooms, m:pkFmtMin(est)})) + '</span></div>' +
      '<ol class="pk-stops" id="pk-stops">' + stops + '</ol></div>' +
    (hv ? '<div class="card card-p"><h2 style="margin:0 0 8px">' + esc(t('pk_handovers')) + '</h2><ul class="pk-hl" id="pk-hl">' + hv + '</ul></div>' : '') + '</div>';
}
function pkRefresh(){ if (S.view !== 'pick') return; const y = window.scrollY; renderView(); window.scrollTo(0, y); }

/* ---------------- recording ---------------- */
function pkTg(b){ return {target_type:'binder', target_id:b.id, code:b.speaking_code}; }
function pkTake(p){
  const pr = pkProg(p), todo = pr.rows.filter(r => !r.took || r.back).map(r => pkB(r.id)).filter(Boolean);
  if (!todo.length){ toast(t('pk_take_none'), 'warn'); return; }
  const ty = sqType(pkTypes(), p.status_id); if (!ty){ toast(t('pk_need_status', {s:p.status_id}), 'warn'); return; }
  const go = () => {
    const holderFor = (b) => ty.needs_holder === 'client' && !p.holder ? (b.company_name || '') : p.holder || (ty.needs_holder === 'me' ? logWho() : '');
    // one call per holder (client lists give each binder its own client)
    const groups = new Map(); todo.forEach(b => { const h = holderFor(b); if (!groups.has(h)) groups.set(h, []); groups.get(h).push(b); });
    let n = 0;
    groups.forEach((list, h) => { n += sqRecord(list.map(pkTg), ty.id, {holder:h, due_date:p.due_date, note:p.title}, {via:'pick', batch_id:p.id, action:'pick.take', quiet:true}).length; });
    p.updated_at = nowISO(); commit();
    toast(t('pk_take_done', {n, s:sqTypeLabel(ty)}), 'ok');
    pkRefresh();
  };
  if (typeof dmBulkGuard === 'function') dmBulkGuard(todo, t('pk_a_take'), go); else go();
}
/** Binders of the list that can come back (out now, taken by this list or by anyone). */
function pkOutNow(p){ return pkProg(p).rows.filter(r => r.out).map(r => pkB(r.id)).filter(Boolean); }
function pkBackType(cur){
  const types = pkTypes(), pres = sqPresence(cur, types), ct = cur && sqType(types, cur.status_id);
  if (pres === 'missing') return sqType(types, 'found') || sqType(types, 'returned');
  return (ct && ct.returns_to && sqType(types, ct.returns_to)) || sqType(types, 'returned');
}

/* ---------------- signed hand-over / return (PC) ---------------- */
function pkSignOpen(p, kind){
  const back = kind === 'back';
  const list = back ? pkOutNow(p) : (() => { const pr = pkProg(p); const notOut = pr.rows.filter(r => !(r.out && !r.took)).map(r => pkB(r.id)).filter(Boolean); return notOut; })();
  if (back && !list.length){ toast(t('pk_back_none'), 'warn'); return; }
  const who = back ? '' : (p.holder && p.holder !== logWho() ? p.holder : '');
  const body = '<div class="stack pk-sign" id="pk-signbox"><div class="g2"><div class="field"><label for="pk-s-who">' + esc(t(back ? 'pk_back_who' : 'pk_sign_who')) + '</label><input class="inp" id="pk-s-who" value="' + esc(who) + '" autocomplete="off"></div>' +
    '<div class="field"><label for="pk-s-doc">' + esc(t('pk_sign_doc')) + '</label><input class="inp" id="pk-s-doc" placeholder="' + esc(t('pk_sign_doc_ph')) + '" autocomplete="off"></div></div>' +
    '<details class="pk-s-list"><summary>' + esc(t(back ? 'pk_back_which' : 'pk_sign_which')) + ' (' + list.length + ')</summary><div class="pk-s-items">' + list.map(b => '<label class="chk"><input type="checkbox" data-pks="' + esc(b.id) + '" checked><span class="mono">' + esc(b.speaking_code) + '</span> ' + esc(b.company_name) + '</label>').join('') + '</div></details>' +
    '<div class="field"><label>' + esc(t('pk_sign_pad')) + '</label><canvas class="pk-pad" id="pk-pad" width="600" height="200"></canvas><div class="row" style="justify-content:space-between"><button type="button" class="btn btn-sm btn-ghost" data-a="pk-pad-clear">' + ic('x') + esc(t('pk_sign_clear')) + '</button>' +
    '<label class="chk small"><input type="checkbox" id="pk-s-nosig">' + esc(t('pk_sign_nosig')) + '</label></div></div><p class="small muted">' + esc(t(back ? 'pkr_decl_back' : 'pkr_decl_out')) + '</p><div class="pk-s-err small" id="pk-s-err" role="alert"></div></div>';
  openModal({title:t(back ? 'pk_back_h' : 'pk_sign_h'), size:'modal-lg', body, dismissable:false,
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t(back ? 'pk_back_go' : 'pk_sign_go'), cls:'btn btn-primary', icon:'check', fn:() => pkSignGo(p, kind, list)}],
    onMount:() => { setTimeout(() => { const cv = $('#pk-pad'); if (cv) PK.pad = pkPadMount(cv); }, 40); }, onClose:() => { PK.pad = null; }});
}
async function pkSignGo(p, kind, list){
  const back = kind === 'back', who = ($('#pk-s-who') || {}).value || '', doc = ($('#pk-s-doc') || {}).value || '', nosig = !!($('#pk-s-nosig') || {}).checked;
  const err = (k) => { const e = $('#pk-s-err'); if (e) e.textContent = t(k); };
  if (!who.trim()) return err('pk_sign_need');
  const ids = new Set($$('[data-pks]').filter(x => x.checked).map(x => x.dataset.pks)), chosen = list.filter(b => ids.has(b.id));
  if (!chosen.length) return;
  const sig = !nosig && PK.pad && !PK.pad.empty() ? PK.pad.dataUrl() : '';
  const hid = (back ? 'rt-' : 'dl-') + uuid().replace(/-/g, '').slice(0, 12), batch = p.id + '.' + hid;
  const at = nowISO(), sigHash = sig ? await pkSha256Hex(pkDataUrlBytes(sig)) : '';
  const items = chosen.map(b => ({id:b.id, code:b.speaking_code}));
  const rec = {id:batch, at, kind:back ? 'back' : 'out', recipient:who.trim(), doc:doc.trim(), operator:logWho(), sigHash, items};
  rec.hash = await pkSha256Hex(pkReceiptCanon(rec));
  const note = (back ? 'Rientro' : 'Consegna') + (sig ? (back ? ' firmato' : ' firmata') : ' (firma su carta)') + ' da ' + who.trim() + (doc.trim() ? ' · doc ' + doc.trim() : '') + ' · ricevuta ' + rec.hash.slice(0, 16) + (sigHash ? ' · firma ' + sigHash.slice(0, 16) : '');
  closeModal(true);
  let n = 0;
  if (back){
    const groups = new Map(); chosen.forEach(b => { const ty = pkBackType(sqCurrent(sqEv(), 'binder', b.id)); if (!ty) return; if (!groups.has(ty.id)) groups.set(ty.id, []); groups.get(ty.id).push(b); });
    groups.forEach((L, tid) => { n += sqRecord(L.map(pkTg), tid, {holder:'', note, date:sqType(pkTypes(), tid) && sqType(pkTypes(), tid).needs_date ? pkToday() : ''}, {via:'handover', batch_id:batch, action:'custody.return', quiet:true}).length; });
  } else {
    const ty = sqType(pkTypes(), p.status_id); if (!ty){ toast(t('pk_need_status', {s:p.status_id}), 'warn'); return; }
    n = sqRecord(chosen.map(pkTg), ty.id, {holder:who.trim(), due_date:p.due_date, note}, {via:'handover', batch_id:batch, action:'custody.handover', quiet:true}).length;
  }
  p.handovers.push({id:hid, at, kind:rec.kind, recipient:rec.recipient, doc:rec.doc, operator:rec.operator, sig, sigHash, hash:rec.hash, items});
  p.updated_at = nowISO();
  logAct(back ? 'custody.return' : 'custody.handover', null, (back ? 'Rientro' : 'Consegna') + ' "' + p.title + '": ' + n + ' faldoni, ' + who.trim() + (sig ? ' (firmata)' : ''), {pick:p.id, batch, recipient:rec.recipient, doc:rec.doc, hash:rec.hash, sig_hash:sigHash, items}, 'ui');
  commit();
  toast(back ? t('pk_back_ok', {n}) : t('pk_sign_done', {n, w:who.trim()}), 'ok');
  pkRefresh();
  pkPrintReceipt(p, p.handovers[p.handovers.length - 1]);
}
function pkRecItems(items){ return items.map(x => { const b = pkB(x.id); return {id:x.id, code:x.code || (b && b.speaking_code) || '', company:b ? b.company_name : '', title:b ? b.binder_title : ''}; }); }
function pkPrintReceipt(p, h){
  if (!h) return;
  const r = {id:p.id + '.' + h.id, at:h.at, kind:h.kind, recipient:h.recipient, doc:h.doc, operator:h.operator, purpose:p.purpose, title:p.title, due_date:p.due_date, items:pkRecItems(h.items), sig:h.sig, hash:h.hash};
  doPrint('register', '<style>' + PK_RECEIPT_CSS + '</style>' + pkReceiptHTML(r, S.settings.studioName || ''));
}
/** Receipt of a phone hand-over, rebuilt from its status events; the signature from this PC's photo store or the server. */
async function pkReceiptFromEvents(batch){
  const evs = sqEv().filter(e => e.batch_id === batch && e.target_type === 'binder' && !e.undo_of);
  if (!evs.length) return;
  const e0 = evs[0], m = /doc ([^·]+?)\s*(·|$)/.exec(e0.note || ''), rh = /ricevuta ([0-9a-f]{16})/.exec(e0.note || ''), sh = /firma ([0-9a-f]{16})/.exec(e0.note || '');
  const head = batch.split('.')[0], p = pkGet(head), hid = batch.split('.').pop();
  let sig = '';
  if (sh){ const id = 'sig-' + hid; sig = PK.sigCache.get(id) || (typeof ivpPhotoGet === 'function' ? await ivpPhotoGet(id) : '') || ''; if (sig) PK.sigCache.set(id, sig); }
  const kind = /(^|\.)rt-/.test(batch) ? 'back' : 'out';
  const items = evs.map(e => ({id:e.target_id, code:e.code}));
  const holder = kind === 'out' ? e0.holder : (/da (.+?)( ·|$)/.exec(e0.note || '') || [])[1] || '';
  const rec = {id:batch, at:evs.map(e => e.at).sort()[0], kind, recipient:holder, doc:m ? m[1].trim() : '', operator:e0.user, sigHash:sig ? await pkSha256Hex(pkDataUrlBytes(sig)) : '', items};
  rec.hash = await pkSha256Hex(pkReceiptCanon(rec));
  const ok = rh ? rh[1] === rec.hash.slice(0, 16) && (!sh || (rec.sigHash && sh[1] === rec.sigHash.slice(0, 16))) : null;
  const r = Object.assign({}, rec, {purpose:p ? p.purpose : '', title:p ? p.title : '', due_date:e0.due_date, items:pkRecItems(items), sig});
  const badge = ok === true ? '<p style="color:#047857;font-weight:700">✓ ' + esc(t('pk_fp_ok')) + '</p>' : ok === false ? '<p style="color:#B91C1C;font-weight:700">⚠ ' + esc(sh && !sig ? t('pk_fp_nosig') : t('pk_fp_bad')) + '</p>' : '';
  doPrint('register', '<style>' + PK_RECEIPT_CSS + '</style>' + pkReceiptHTML(r, S.settings.studioName || '') + '<div class="pkr">' + badge + '</div>');
  return ok;
}

/* ---------------- printed pick sheet, paper form, CSV, phone link ---------------- */
function pkSheetHTML(p){
  const bs = pkBinders(p), route = pkRoute(bs), byId = new Map(bs.map(b => [b.id, b])), est = pkEstimate(route, PK_STOP_S, pkPerItem());
  const ys = (b) => { const y = Array.from(pkBinderYears(b)).sort(); return y.length ? (y.length > 1 ? y[0] + '–' + y[y.length - 1] : String(y[0])) : ''; };
  let n = 0;
  const rows = (ids) => ids.map(id => { const b = byId.get(id); n++; return '<tr><td>' + n + '</td><td class="ck"></td><td class="mono"><b>' + esc(b.speaking_code) + '</b>' + (b.multi_code ? '<br><small>M ' + esc(b.multi_code) + '</small>' : '') + '</td><td>' + esc(b.company_name) + '<br><small>' + esc(b.binder_title || '') + '</small></td><td class="mono">' + esc(ys(b)) + '</td><td class="ck"></td></tr>'; }).join('');
  const block = (title, ids, i) => '<tr class="st"><td colspan="6"><b>' + (i != null ? esc(t('pk_stop', {n:i + 1})) + ' · ' : '') + esc(title) + '</b> <small>(' + ids.length + ')</small></td></tr>' + rows(ids);
  return ('<div class="pkr pks"><div class="pkr-h"><div><div class="pkr-k">' + brandName() + ' · ') + esc(S.settings.studioName || '') + '</div><h1>' + esc(t('pk_sheet_h')) + '</h1><div class="pkr-t">' + esc(p.title) + '</div></div>' +
    '<div class="pkr-id">' + esc(t('pkp_' + p.purpose)) + (p.holder ? '<br>' + esc(p.holder) : '') + (p.due_date ? '<br>' + esc(t('pk_due_on', {d:sqDayFmt(p.due_date)})) : '') + '<br>' + esc(fmtDate(nowISO(), true)) + '<br>' + esc(t('pk_route_sum', {s:route.stops.length, r:route.rooms, m:pkFmtMin(est)})) + '</div></div>' +
    '<table class="pkr-l"><thead><tr><th>#</th><th>' + esc(t('pk_sheet_ok')) + '</th><th>' + esc(t('pkr_code')) + '</th><th>' + esc(t('pkr_client')) + '</th><th>' + esc(t('pk_f_years')) + '</th><th>' + esc(t('pk_sheet_back')) + '</th></tr></thead><tbody>' +
    route.stops.map((s, i) => block(s.text, s.ids, i)).join('') + (route.noLoc.length ? block(t('pk_route_noloc'), route.noLoc, null) : '') + '</tbody></table></div>';
}
const PK_SHEET_CSS = '.pks .ck{width:9mm;border:.6pt solid #000!important}.pks tr.st td{background:#EEF2F7;border-bottom:1pt solid #000;padding-top:2mm}.pks small{color:#333}';
function pkCsv(p){
  const bs = pkBinders(p), route = pkRoute(bs), byId = new Map(bs.map(b => [b.id, b])), pr = pkProg(p), rowOf = new Map(pr.rows.map(r => [r.id, r])), types = pkTypes();
  const rows = [t('pk_csv_cols').split(';')];
  const add = (label, txt, ids) => ids.forEach(id => { const b = byId.get(id), r = rowOf.get(id) || {}; const y = Array.from(pkBinderYears(b)).sort();
    rows.push([String(label), txt, b.speaking_code, b.company_name, b.binder_title, y.join(' '), r.cur ? sqHeadline(r.cur, types) : '', r.took ? 'X' : '', r.back ? 'X' : ''].map(v => safeCell(v))); });
  route.stops.forEach((s, i) => add(i + 1, s.text, s.ids)); if (route.noLoc.length) add('?', t('pk_route_noloc'), route.noLoc);
  download('prelievo_' + p.id + '.csv', '\ufeff' + toCSV(rows, ';'), 'text/csv;charset=utf-8');
}
function pkPhoneUrl(p){
  const bs = pkBinders(p), tail = 'scan.html?pk=' + pkEncode(pkPayload(p, bs, pkRoute(bs)));
  try { if (typeof dmConfig === 'function' && dmConfig().mode === 'web') return new URL(tail, location.href).href; } catch(e){}
  const tpl = String(S.settings.destTemplate || '');
  if (/^https?:\/\//.test(tpl)){ const i = tpl.indexOf('/q/'); if (i > 0) return tpl.slice(0, i) + '/' + tail; const j = tpl.indexOf('scan.html'); if (j > 0) return tpl.slice(0, j) + tail; }
  return location.href.replace(/[#?].*$/, '').replace(/[^\/]*$/, '') + tail;
}
function pkPhoneOpen(p){
  const url = pkPhoneUrl(p), local = location.protocol === 'file:' && !/^https?:/.test(url);
  let qr = ''; try { qr = DMQR.svg(url, {ecl:'L', quiet:2, fg:'#000'}); } catch(e){ qr = ''; }
  openModal({title:t('pk_phone_h'), body:'<div class="stack"><p>' + esc(t('pk_phone_p')) + '</p>' + (local ? '<div class="warn-box small">' + ic('alert') + '<div>' + esc(t('pk_phone_local')) + '</div></div>' : '') +
    (p.ids.length > PK_LINK_MAX_ITEMS ? '<div class="info-box small">' + ic('info') + '<div>' + esc(t('pk_phone_cut', {n:PK_LINK_MAX_ITEMS})) + '</div></div>' : '') +
    (qr ? '<div class="pk-qr" id="pk-qr">' + qr + '</div>' : '') + '<input class="inp mono small" readonly id="pk-url" value="' + esc(url) + '"></div>',
    buttons:[{label:t('pk_phone_copy'), cls:'btn btn-primary', icon:'copy', fn:() => { copyText(url); toast(t('pk_phone_copied'), 'ok'); }}, {label:t('close'), cls:'btn', action:'modal-close'}]});
}

/* ---------------- actions ---------------- */
const PK_ACTIONS = {
  'pk-new': () => { PK.draft = pkDraftNew(); PK.open = ''; if (S.view !== 'pick'){ S.view = 'pick'; savePrefs(); renderAll(); } else renderView(); window.scrollTo(0, 0); setTimeout(() => { const el = $('#pk-client'); if (el) el.focus(); }, 30); },
  'pk-cancel': () => { PK.draft = null; renderView(); },
  'pk-save': () => pkSave(),
  'pk-list': () => { PK.open = ''; renderView(); window.scrollTo(0, 0); },
  'pk-open': (el) => { PK.open = el.dataset.id; PK.draft = null; renderView(); window.scrollTo(0, 0); },
  'pk-print': (el) => { const p = pkGet(el.dataset.id); if (p) doPrint('register', '<style>' + PK_RECEIPT_CSS + PK_SHEET_CSS + '</style>' + pkSheetHTML(p)); },
  'pk-paper': (el) => { const p = pkGet(el.dataset.id); if (!p) return; const r = {id:p.id, at:nowISO(), kind:'out', recipient:p.holder, doc:'', operator:logWho(), purpose:p.purpose, title:p.title, due_date:p.due_date, items:pkRecItems(p.ids.map(id => ({id}))), sig:'', hash:''}; doPrint('register', '<style>' + PK_RECEIPT_CSS + '</style>' + pkReceiptHTML(r, S.settings.studioName || '')); },
  'pk-phone': (el) => { const p = pkGet(el.dataset.id); if (p) pkPhoneOpen(p); },
  'pk-take': (el) => { const p = pkGet(el.dataset.id); if (p) pkTake(p); },
  'pk-sign': (el) => { const p = pkGet(el.dataset.id); if (p) pkSignOpen(p, 'out'); },
  'pk-back': (el) => { const p = pkGet(el.dataset.id); if (p) pkSignOpen(p, 'back'); },
  'pk-pad-clear': () => { if (PK.pad) PK.pad.clear(); },
  'pk-csv': (el) => { const p = pkGet(el.dataset.id); if (p) pkCsv(p); },
  'pk-close': (el) => { const p = pkGet(el.dataset.id); if (!p) return; p.closed_at = p.closed_at ? '' : nowISO(); p.updated_at = nowISO(); logAct(p.closed_at ? 'pick.close' : 'pick.reopen', null, (p.closed_at ? 'Chiuso' : 'Riaperto') + ' il prelievo "' + p.title + '"', {pick:p.id}, 'ui'); commit(); pkRefresh(); },
  'pk-del': (el) => { const p = pkGet(el.dataset.id); if (!p) return; confirmAction({danger:true, plain:true, undoable:true, detail:t('pk_del_q', {t:p.title}), okLabel:t('pk_a_del'), onOk:() => {
    undoPoint(); const i = pkList().indexOf(p); if (i >= 0) pkList().splice(i, 1); logAct('pick.delete', null, 'Eliminato l\'elenco di prelievo "' + p.title + '"', {pick:p.id}, 'ui'); commit(); PK.open = ''; renderView(); undoToast(t('pk_a_del')); }}); },
  'pk-receipt': (el) => { const p = pkGet(el.dataset.id); if (p) pkPrintReceipt(p, p.handovers.find(h => h.id === el.dataset.h)); },
  'pk-receipt-ev': (el) => pkReceiptFromEvents(el.dataset.b),
};
if (typeof ACTIONS === 'object') Object.assign(ACTIONS, PK_ACTIONS);
else document.addEventListener('DOMContentLoaded', () => { if (typeof ACTIONS === 'object') Object.assign(ACTIONS, PK_ACTIONS); });

document.addEventListener('input', (e) => {
  const el = e.target; if (!el || !el.dataset || !PK.draft) return;
  const k = el.dataset.pk; if (!k) return;
  if (k === 'useSel') PK.draft.useSel = el.checked; else PK.draft[k] = el.value;
  if (k === 'purpose'){
    const pu = pkPurpose(el.value), d = PK.draft;
    d.status_id = sqType(pkTypes(), pu.status) ? pu.status : d.status_id; d.holder = pu.holder === 'me' ? logWho() : pu.holder === 'client' ? '' : pu.holder; d.due_date = pkAddDays(pu.due);
    ['status_id', 'holder', 'due_date'].forEach(f => { const x = $('#pk-' + f); if (x) x.value = d[f]; });
  }
  if (['client', 'yFrom', 'yTo', 'q', 'tag', 'codes', 'useSel'].includes(k)){ clearTimeout(PK.tm); PK.tm = setTimeout(pkPreviewRefresh, 160); }
});
document.addEventListener('change', (e) => {
  const el = e.target; if (!el || !el.dataset) return;
  if (el.dataset.pk && PK.draft && (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date')) el.dispatchEvent(new Event('input', {bubbles:true}));
  if (el.dataset.pkx && PK.draft){ if (el.checked) PK.draft.excl.delete(el.dataset.pkx); else PK.draft.excl.add(el.dataset.pkx); pkPreviewRefresh(); }
});

/* ---------------- wrappers: view, backups, palette ---------------- */
(function pkWrap(){
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  wrap('renderView', (o) => function(){
    if (S.view === 'pick'){ document.documentElement.lang = S.lang; $('#view').innerHTML = viewPick(); return; }
    return o.apply(this, arguments);
  });
  wrap('undoPoint', (o) => function(){ const r = o.apply(this, arguments); try { if (UNDO && Array.isArray(S.picks)) UNDO.picks = clone(S.picks); } catch(e){} return r; });
  wrap('workspaceJSON', (o) => function(){
    const s = o.apply(this, arguments);
    if (!S || !Array.isArray(S.picks) || !S.picks.length) return s;
    return s.replace(/\n?\}\s*$/, ',\n  "picks": ' + JSON.stringify(S.picks) + '\n}');
  });
  wrap('applyWorkspaceObject', (o) => function(W){
    const keep = Array.isArray(S.picks) ? S.picks.slice() : [];
    const r = o.apply(this, arguments);
    try {
      const inc = W && Array.isArray(W.picks) ? W.picks.map(pkNorm).filter(p => /^pk-/.test(p.id)) : [];
      const m = new Map(keep.map(p => [p.id, p]));
      inc.forEach(p => { const x = m.get(p.id); if (!x || String(p.updated_at) > String(x.updated_at)) m.set(p.id, p); });
      S.picks = Array.from(m.values()).sort((a, b) => a.created_at < b.created_at ? 1 : -1);
    } catch(e){ console.warn('picks', e); }
    return r;
  });
  // 04d-palette loads after this file: wrap its action list once the page is ready
  const ckWrap = () => { if (typeof ckActions === 'function' && !ckActions.pk) { wrap('ckActions', (o) => { const f = function(){ return [{g:'action', icon:'route', label:t('pk_new'), run:() => PK_ACTIONS['pk-new']()}].concat(o.apply(this, arguments)); }; f.pk = 1; return f; }); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ckWrap); else ckWrap();
})();

/* ---------------- help ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'pick')) return;
  HELP_TOPICS.push({ id:'pick', guide:null, tags:['archive'], pop:80, related:['status', 'locations', 'mobile'],
    kw:{it:'prelievo prelevare verifica fiscale ispezione agenzia entrate guardia finanza richiesta cliente avvocato tribunale revisione due diligence percorso giro scaffali ordine distinta consegna firma ricevuta rientro restituzione custodia catena verbale', en:'pick list take out tax audit inspection client request lawyer court due diligence route walk shelves order sheet hand over signature receipt return custody chain'},
    title:{it:'Come preparo i faldoni per una verifica o un cliente (prelievo, firma, rientro)?', en:'How do I prepare binders for an audit or a client (pick list, signature, return)?'},
    body:{it:'<p>Menu <b>⚙ Funzioni avanzate › Prelievi e consegne › Nuovo prelievo</b> (o Ctrl+K, «prelievo»).</p><ol>' +
      '<li><b>Motivo</b>: verifica fiscale, richiesta del cliente, pratica interna, avvocato, revisione, digitalizzazione, trasloco, scarto… Sceglie da solo lo stato da registrare, a chi vanno e la data di rientro (puoi cambiarli).</li>' +
      '<li><b>Quali faldoni</b>: cliente, anni (dal–al), ricerca libera, categoria o tag, codici incollati da Excel, faldoni spuntati nell\'Archivio. L\'anteprima mostra quelli già fuori e quelli senza posizione; togli la spunta a quelli che non servono.</li>' +
      ('<li><b>Percorso</b>: ' + brandName() + ' mette i faldoni nell\'ordine del giro tra gli scaffali (stanza, armadio o corsia, ripiano, scatola), a serpentina, e stima il tempo. <b>Stampa la distinta</b> con le caselle da spuntare, o <b>Spunta col telefono</b>: il telefono legge i QR e spunta da solo.</li>') +
      '<li><b>Segna come prelevati</b> registra l\'uscita; <b>Consegna con firma</b> fa firmare chi li riceve (mouse, dito o penna) e stampa la ricevuta con l\'impronta SHA-256; <b>Rientro</b> li fa tornare «in archivio», anche con firma.</li></ol>' +
      '<p>Tutto resta nella storia di ogni faldone (Stato), anche se elimini l\'elenco. La firma e la ricevuta sono una prova interna dello studio, non una firma digitale qualificata.</p>',
      en:'<p>Menu <b>⚙ Advanced tools › Pick lists and hand-overs › New pick list</b> (or Ctrl+K, "pick").</p><ol>' +
      '<li><b>Purpose</b>: tax audit, client request, internal case, lawyer, audit, digitisation, move, disposal… It picks the status to record, who gets them and the return date (you can change them).</li>' +
      '<li><b>Which binders</b>: client, years (from–to), free search, category or tag, codes pasted from Excel, binders ticked in the Archive. The preview shows those already out and those without a position; untick what you do not need.</li>' +
      ('<li><b>Route</b>: ' + brandName() + ' orders the binders along the walk through the shelves (room, cabinet or aisle, shelf, box), serpentine, and estimates the time. <b>Print the pick sheet</b> with tick boxes, or <b>Tick off with the phone</b>: the phone reads the QR codes and ticks them itself.</li>') +
      '<li><b>Mark as taken</b> records them as out; <b>Hand over with signature</b> has the receiver sign (mouse, finger or pen) and prints the receipt with its SHA-256 fingerprint; <b>Return</b> brings them back "in the archive", with a signature too.</li></ol>' +
      '<p>Everything stays in each binder\'s history (Status), even if you delete the list. The signature and the receipt are internal evidence of the office, not a qualified electronic signature.</p>'} });
});
