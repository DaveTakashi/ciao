/* =====================================================================
   DocMap 2026 — v12 (stream Q): statuses / check-out of binders, single documents and boxes — PURE MODEL
   Loaded by index.html (after 02c-locations.js) and by scan.html (after 02c-locations.js). No DOM, no S writes.
   Desktop UI: 06j-status.js · phone UI: 11c-status.js · CSS: assets/css-status.css · contract: docs/MODELLO-DATI.md §17.

   1. Status types — S.settings.statusTypes (absent = SQ_DEFAULT_TYPES), S.settings.statusTypesAt (ISO, LWW for sync)
        { id:        stable slug ('taken', 'returned', … or 'c-xxxx' for custom ones), never reused,
          label:     '' for a built-in type (label from i18n 'sqt_<id>', IT/EN) or the text the user typed,
          color:     '#RRGGBB', icon: one of SQ_ICONS,
          presence:  'in' (in the archive) | 'out' (someone / something has it) | 'missing' | 'neutral' (a note, no movement),
          needs_holder: '' | 'me' (prefilled with the current user) | 'client' (prefilled with the binder's client) | 'entity' (free text, required),
          needs_due_date / needs_note / needs_date: '' | 'optional' | 'required'   (needs_date = "returned ON <date>"),
          returns_to: id of the type suggested first to close this one ('to_client' → 'from_client'), or '',
          quick:     true = big one-tap button, applies_to: ['binder','document','box'], disabled: true = hidden (types are never deleted) }
   2. Status events — S.statusEvents[] (append-only, never edited; also SQLite table status_events and server records
      of type 'status_event'):
        { id:'se-<uuid>', at:ISO (when it was recorded), user, device,
          target_type:'binder'|'document'|'location', target_id (binder id, also for documents; location id for boxes),
          doc_id (contents item id, documents only), status_id (type id; '' for an undo), holder, due_date:'YYYY-MM-DD'|'',
          date:'YYYY-MM-DD'|'' (effective date when it differs from `at`, e.g. "restituito il 3/11"), note,
          via:'scan'|'desktop'|'box'|'bulk'|'verify'|'scanner'|'editor'|'undo', box_id (box the action went through),
          batch_id (one user action on many targets), code (speaking / location code at that time), doc_text (document
          "year: description" at that time), undo_of (id of the event this one cancels, '' otherwise) }
      Local only: `_rx` = [localISO, peerId] when the event arrived from a sync peer (forwarding, like 06f recvAt).
      Current status of a target = its latest event (by at, then id) that is neither an undo nor undone.
   ===================================================================== */
'use strict';

const SQ_PRESENCE = ['in', 'out', 'missing', 'neutral'];
const SQ_APPLIES = ['binder', 'document', 'box'];
const SQ_EV_TARGETS = ['binder', 'document', 'location'];
const SQ_VIA = ['scan', 'desktop', 'box', 'bulk', 'verify', 'scanner', 'editor', 'undo'];
const SQ_NEEDS = ['', 'optional', 'required'];
const SQ_HOLDER = ['', 'me', 'client', 'entity'];
const SQ_ID_RE = /^[A-Za-z0-9._:@-]{1,100}$/;   // = valid_id() of server-php/api.php
const SQ_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SQ_UNDO_MS = 10000;                       // the "Annulla" window after a status action
const SQ_DEFAULT_TYPES = [
  {id:'taken',       color:'#D97706', icon:'hand',   presence:'out',     needs_holder:'me',     needs_due_date:'',         needs_note:'',         needs_date:'',         returns_to:'returned',    quick:true,  applies_to:['binder', 'document', 'box']},
  {id:'returned',    color:'#16A34A', icon:'in',     presence:'in',      needs_holder:'',       needs_due_date:'',         needs_note:'',         needs_date:'',         returns_to:'',            quick:true,  applies_to:['binder', 'document', 'box']},
  {id:'to_client',   color:'#7C3AED', icon:'user',   presence:'out',     needs_holder:'client', needs_due_date:'optional', needs_note:'optional', needs_date:'',         returns_to:'from_client', quick:true,  applies_to:['binder', 'document']},
  {id:'from_client', color:'#16A34A', icon:'in',     presence:'in',      needs_holder:'',       needs_due_date:'',         needs_note:'',         needs_date:'',         returns_to:'',            quick:false, applies_to:['binder', 'document']},
  {id:'case',        color:'#2563EB', icon:'folder', presence:'out',     needs_holder:'me',     needs_due_date:'optional', needs_note:'optional', needs_date:'',         returns_to:'returned',    quick:true,  applies_to:['binder', 'document']},
  {id:'to_entity',   color:'#0E7490', icon:'bank',   presence:'out',     needs_holder:'entity', needs_due_date:'optional', needs_note:'optional', needs_date:'',         returns_to:'from_entity', quick:true,  applies_to:['binder', 'document', 'box']},
  {id:'from_entity', color:'#16A34A', icon:'in',     presence:'in',      needs_holder:'',       needs_due_date:'',         needs_note:'optional', needs_date:'optional', returns_to:'',          quick:false, applies_to:['binder', 'document', 'box']},
  {id:'missing',     color:'#DC2626', icon:'alert',  presence:'missing', needs_holder:'',       needs_due_date:'',         needs_note:'optional', needs_date:'',         returns_to:'found',       quick:false, applies_to:['binder', 'document', 'box']},
  {id:'found',       color:'#16A34A', icon:'search', presence:'in',      needs_holder:'',       needs_due_date:'',         needs_note:'optional', needs_date:'',         returns_to:'',            quick:false, applies_to:['binder', 'document', 'box']},
  {id:'check',       color:'#64748B', icon:'flag',   presence:'neutral', needs_holder:'',       needs_due_date:'',         needs_note:'optional', needs_date:'',         returns_to:'',            quick:false, applies_to:['binder', 'document', 'box']}
];
/* 24×24 stroke icons shared by both pages (desktop ic() and phone sic() sets do not overlap) */
const SQ_ICONS = {
  hand:'<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  in:'<path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  folder:'<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
  bank:'<path d="M3 21h18"/><path d="M5 21V10M9 21V10M15 21V10M19 21V10"/><path d="M12 3 2 8h20Z"/>',
  alert:'<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  flag:'<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 8 2a6 6 0 0 0 3.6-1.2 1 1 0 0 1 1.4.9v9.5a1 1 0 0 1-.4.8A6 6 0 0 1 16 14c-3 0-5-2-8-2a6 6 0 0 0-3.6 1.2"/>',
  check:'<path d="M20 6 9 17l-5-5"/>', clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  box:'<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>', undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  doc:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>', more:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  scan:'<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>', x:'<path d="M18 6 6 18M6 6l12 12"/>'
};
const sqIc = (n, cls) => '<svg class="sq-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (SQ_ICONS[n] || SQ_ICONS.flag) + '</svg>';

Object.assign(I18N.it, {
  sqt_taken:'Preso', sqt_returned:'Reinserito', sqt_to_client:'Dato al cliente', sqt_from_client:'Restituito dal cliente', sqt_case:'Fuori per pratica',
  sqt_to_entity:'Dato al Comune / ente', sqt_from_entity:'Restituito dal Comune / ente', sqt_missing:'Mancante / non trovato', sqt_found:'Ritrovato', sqt_check:'Da verificare',
  sq_p_in:'In archivio', sq_p_out:'Fuori archivio', sq_p_missing:'Mancante', sq_p_neutral:'Da verificare', sq_p_none:'In archivio',
  sq_by_me:'{s} da {h}', sq_by:'{s}: {h}', sq_today:'oggi', sq_yesterday:'ieri', sq_days:'da {n} giorni', sq_since_today:'da oggi', sq_since_yday:'da ieri',
  sq_due:'rientro entro il {d}', sq_overdue:'in ritardo', sq_on:'il {d}', sq_undone:'annullato', sq_undo_of:'Annullato: {s}',
  sq_holder:'Chi lo ha', sq_holder_client:'Cliente', sq_holder_entity:'Comune / ente', sq_due_date:'Rientro previsto entro', sq_date:'In data', sq_note:'Nota', sq_optional:'facoltativo',
  sq_e_holder:'Indica chi lo ha.', sq_e_due:'Indica la data di rientro.', sq_e_note:'Scrivi una nota.', sq_e_date:'Indica la data.',
  sq_csv_at:'quando', sq_csv_user:'chi', sq_csv_target:'oggetto', sq_csv_code:'codice', sq_csv_doc:'documento', sq_csv_status:'stato', sq_csv_presence:'presenza', sq_csv_holder:'chi_lo_ha',
  sq_csv_due:'rientro_entro', sq_csv_date:'in_data', sq_csv_note:'nota', sq_csv_via:'come', sq_csv_box:'scatola', sq_csv_batch:'operazione', sq_csv_since:'da', sq_csv_overdue:'in_ritardo',
  sq_tt_binder:'faldone', sq_tt_document:'documento', sq_tt_location:'scatola', sq_via_scan:'QR telefono', sq_via_desktop:'PC', sq_via_box:'tutta la scatola', sq_via_bulk:'selezione', sq_via_verify:'verifica rientro', sq_via_scanner:'lettore QR', sq_via_editor:'scheda faldone', sq_via_undo:'annulla',
  sq_last_scan:'Ultima scansione: {u}, {w}', sq_last_act:'Ultima azione: {s} · {u}, {w}', sq_yes:'sì', sq_no:'no',
  sq_vf_outcome:'esito', sq_vf_w_found:'trovato', sq_vf_w_missing:'mancante', sq_vf_w_extra:'in più',
  jr_t_status_event:'stato'
});
Object.assign(I18N.en, {
  sqt_taken:'Taken', sqt_returned:'Put back', sqt_to_client:'Given to the client', sqt_from_client:'Returned by the client', sqt_case:'Out for a case',
  sqt_to_entity:'Given to the council / agency', sqt_from_entity:'Returned by the council / agency', sqt_missing:'Missing / not found', sqt_found:'Found again', sqt_check:'To be checked',
  sq_p_in:'In the archive', sq_p_out:'Out of the archive', sq_p_missing:'Missing', sq_p_neutral:'To be checked', sq_p_none:'In the archive',
  sq_by_me:'{s} by {h}', sq_by:'{s}: {h}', sq_today:'today', sq_yesterday:'yesterday', sq_days:'for {n} days', sq_since_today:'since today', sq_since_yday:'since yesterday',
  sq_due:'due back by {d}', sq_overdue:'overdue', sq_on:'on {d}', sq_undone:'undone', sq_undo_of:'Undone: {s}',
  sq_holder:'Who has it', sq_holder_client:'Client', sq_holder_entity:'Council / agency', sq_due_date:'Due back by', sq_date:'On', sq_note:'Note', sq_optional:'optional',
  sq_e_holder:'Say who has it.', sq_e_due:'Give the return date.', sq_e_note:'Write a note.', sq_e_date:'Give the date.',
  sq_csv_at:'when', sq_csv_user:'who', sq_csv_target:'object', sq_csv_code:'code', sq_csv_doc:'document', sq_csv_status:'status', sq_csv_presence:'presence', sq_csv_holder:'holder',
  sq_csv_due:'due_date', sq_csv_date:'on_date', sq_csv_note:'note', sq_csv_via:'via', sq_csv_box:'box', sq_csv_batch:'batch', sq_csv_since:'since', sq_csv_overdue:'overdue',
  sq_tt_binder:'binder', sq_tt_document:'document', sq_tt_location:'box', sq_via_scan:'phone QR', sq_via_desktop:'PC', sq_via_box:'whole box', sq_via_bulk:'selection', sq_via_verify:'return check', sq_via_scanner:'QR scanner', sq_via_editor:'binder form', sq_via_undo:'undo',
  sq_last_scan:'Last scan: {u}, {w}', sq_last_act:'Last action: {s} · {u}, {w}', sq_yes:'yes', sq_no:'no',
  sq_vf_outcome:'outcome', sq_vf_w_found:'found', sq_vf_w_missing:'missing', sq_vf_w_extra:'extra',
  jr_t_status_event:'status'
});

/* ---------------- types ---------------- */
const sqCut = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n);
const sqHex = (v, d) => { const s = String(v || '').trim().toUpperCase(); return /^#[0-9A-F]{6}$/.test(s) ? s : d; };
function sqSlug(s){ return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32); }
function sqNormType(x, dflt){
  x = x && typeof x === 'object' ? x : {}; const d = dflt || SQ_DEFAULT_TYPES.find(y => y.id === x.id) || {};
  const pick = (k, list, fb) => list.includes(x[k]) ? x[k] : list.includes(d[k]) ? d[k] : fb;
  const ap = Array.isArray(x.applies_to) ? x.applies_to.filter(a => SQ_APPLIES.includes(a)) : (d.applies_to || SQ_APPLIES.slice());
  return { id:sqCut(x.id || d.id, 40), label:sqCut(x.label, 60), color:sqHex(x.color, d.color || '#64748B'), icon:SQ_ICONS[x.icon] ? x.icon : (d.icon || 'flag'),
    presence:pick('presence', SQ_PRESENCE, 'neutral'), needs_holder:pick('needs_holder', SQ_HOLDER, ''), needs_due_date:pick('needs_due_date', SQ_NEEDS, ''),
    needs_note:pick('needs_note', SQ_NEEDS, ''), needs_date:pick('needs_date', SQ_NEEDS, ''), returns_to:sqCut(x.returns_to != null ? x.returns_to : d.returns_to, 40),
    quick:x.quick != null ? !!x.quick : !!d.quick, applies_to:ap.length ? Array.from(new Set(ap)) : ['binder'], disabled:!!x.disabled };
}
function sqDefaultTypes(){ return SQ_DEFAULT_TYPES.map(x => sqNormType(x, x)); }
/** The configured types (settings.statusTypes), or the built-in defaults. Unique ids, order kept. */
function sqTypes(settings){
  const raw = settings && Array.isArray(settings.statusTypes) && settings.statusTypes.length ? settings.statusTypes : null;
  if (!raw) return sqDefaultTypes();
  const seen = new Set(), out = [];
  raw.forEach(x => { const ty = sqNormType(x); if (ty.id && SQ_ID_RE.test(ty.id) && !seen.has(ty.id)){ seen.add(ty.id); out.push(ty); } });
  return out.length ? out : sqDefaultTypes();
}
const sqType = (types, id) => (types || []).find(x => x.id === id) || null;
const sqTypeLabel = (ty) => !ty ? '?' : ty.label || (I18N.it['sqt_' + ty.id] !== undefined ? t('sqt_' + ty.id) : ty.id);
/** Types offered for a target kind ('binder' | 'document' | 'box'), enabled only. */
const sqTypesFor = (types, kind) => (types || []).filter(x => !x.disabled && x.applies_to.includes(kind));

/* ---------------- events ---------------- */
const sqDay = (v) => { const s = String(v || '').trim().slice(0, 10); return SQ_DAY_RE.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')) ? s : ''; };
/** Normalised copy of an event, or null when it cannot be one (bad id / time / target). */
function sqNormEvent(e){
  if (!e || typeof e !== 'object') return null;
  const id = String(e.id || ''), at = String(e.at || '');
  if (!SQ_ID_RE.test(id) || isNaN(Date.parse(at))) return null;
  const tt = SQ_EV_TARGETS.includes(e.target_type) ? e.target_type : '', tid = String(e.target_id || '');
  if (!tt || !SQ_ID_RE.test(tid)) return null;
  const undo = SQ_ID_RE.test(String(e.undo_of || '')) ? String(e.undo_of) : '';
  const o = { id, at:new Date(Date.parse(at)).toISOString(), user:sqCut(e.user, 80), device:sqCut(e.device, 100), target_type:tt, target_id:tid,
    doc_id:tt === 'document' ? sqCut(e.doc_id, 64) : '', status_id:undo ? '' : sqCut(e.status_id, 40), holder:sqCut(e.holder, 120), due_date:sqDay(e.due_date), date:sqDay(e.date),
    note:String(e.note == null ? '' : e.note).slice(0, 1000), via:SQ_VIA.includes(e.via) ? e.via : 'desktop', box_id:SQ_ID_RE.test(String(e.box_id || '')) ? String(e.box_id) : '',
    batch_id:SQ_ID_RE.test(String(e.batch_id || '')) ? String(e.batch_id) : '', code:sqCut(e.code, 100), doc_text:sqCut(e.doc_text, 200), undo_of:undo };
  if (tt === 'document' && !o.doc_id) return null;
  if (!undo && !o.status_id) return null;
  if (Array.isArray(e._rx) && e._rx.length === 2) o._rx = [String(e._rx[0]), String(e._rx[1])];
  return o;
}
const sqCmp = (a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
/** Normalised, de-duplicated (by id, first one wins), chronological list. */
function sqNormEvents(list){
  const seen = new Set(), out = [];
  (Array.isArray(list) ? list : []).forEach(x => { const e = sqNormEvent(x); if (e && !seen.has(e.id)){ seen.add(e.id); out.push(e); } });
  return out.sort(sqCmp);
}
/** Union by id into `into` (array, in place, kept chronological). Returns the events actually added. */
function sqMergeEvents(into, list, rx){
  const have = new Set(into.map(e => e.id)), add = [];
  (Array.isArray(list) ? list : []).forEach(x => { const e = sqNormEvent(x); if (e && !have.has(e.id)){ if (rx) e._rx = rx; have.add(e.id); add.push(e); } });
  if (add.length){ into.push(...add); into.sort(sqCmp); }
  return add;
}
/** Event copy for the outside world (server, packages): no local-only keys. */
function sqRecData(e){ const o = {}; Object.keys(e).forEach(k => { if (k.charAt(0) !== '_') o[k] = e[k]; }); return o; }
const sqKey = (tt, id, doc) => tt === 'document' ? 'd:' + id + ':' + doc : (tt === 'location' ? 'l:' : 'b:') + id;
const sqEvKey = (e) => sqKey(e.target_type, e.target_id, e.doc_id);
/** Index of a chronological event list: Map key → {list (chronological), cur (current event or null)}. Cached per array. */
const SQ_IDX = { arr:null, n:-1, last:'', map:null };
function sqIndex(events){
  events = events || [];
  const last = events.length ? events[events.length - 1].id : '';
  if (SQ_IDX.arr === events && SQ_IDX.n === events.length && SQ_IDX.last === last) return SQ_IDX.map;
  const map = new Map(), voided = new Set();
  events.forEach(e => { if (e.undo_of) voided.add(e.undo_of); });
  events.forEach(e => { const k = sqEvKey(e); let x = map.get(k); if (!x){ x = {list:[], cur:null}; map.set(k, x); } x.list.push(e); if (!e.undo_of && !voided.has(e.id)) x.cur = e; });
  map.voided = voided;
  SQ_IDX.arr = events; SQ_IDX.n = events.length; SQ_IDX.last = last; SQ_IDX.map = map;
  return map;
}
function sqCurrent(events, tt, id, doc){ const x = sqIndex(events).get(sqKey(tt, id, doc)); return x ? x.cur : null; }
/** Newest first, every event of the target with `voided` (undone) and `undo` flags. */
function sqHistory(events, tt, id, doc){
  const m = sqIndex(events), x = m.get(sqKey(tt, id, doc)); if (!x) return [];
  return x.list.slice().reverse().map(e => ({ev:e, voided:m.voided.has(e.id), undo:!!e.undo_of}));
}
/** All document histories of a binder: Map doc_id → current event. */
function sqDocCurrents(events, binderId){
  const out = new Map(), p = 'd:' + binderId + ':';
  sqIndex(events).forEach((x, k) => { if (k.indexOf(p) === 0 && x.cur) out.set(k.slice(p.length), x.cur); });
  return out;
}
/** 'in' | 'out' | 'missing' | 'neutral' | 'none' (no event: assumed in the archive). */
function sqPresence(ev, types){ if (!ev) return 'none'; const ty = sqType(types, ev.status_id); return ty ? ty.presence : 'neutral'; }
const sqToday = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const sqIsOut = (p) => p === 'out' || p === 'missing';
function sqOverdue(ev, types, today){ return !!(ev && ev.due_date && sqPresence(ev, types) === 'out' && ev.due_date < (today || sqToday())); }
/** Next time stamp for a target: never equal to or before its latest event (two taps in the same millisecond). */
function sqNextAt(events, key){
  const x = sqIndex(events).get(key), last = x && x.list.length ? x.list[x.list.length - 1].at : '';
  let at = nowISO(); if (last && at <= last) at = new Date(Date.parse(last) + 1).toISOString();
  return at;
}
/** A new event (normalised). o: {target_type, target_id, doc_id, status_id, holder, due_date, date, note, via, box_id, batch_id, code, doc_text, undo_of};
    ctx: {user, device, events (to order after the target's latest event)}. */
function sqNewEvent(o, ctx){
  ctx = ctx || {};
  const e = Object.assign({}, o, {id:'se-' + uuid(), user:ctx.user || o.user || '', device:ctx.device || o.device || ''});
  e.at = ctx.events ? sqNextAt(ctx.events, sqKey(o.target_type, o.target_id, o.doc_id)) : nowISO();
  return sqNormEvent(e);
}
/** Undo event for `ev` (same target, status_id '', undo_of = ev.id). */
function sqUndoEvent(ev, ctx){ return sqNewEvent({target_type:ev.target_type, target_id:ev.target_id, doc_id:ev.doc_id, undo_of:ev.id, via:'undo', box_id:ev.box_id, batch_id:ev.batch_id, code:ev.code, doc_text:ev.doc_text}, ctx); }
/** Which fields the type asks for, and whether one tap is enough (nothing to ask beyond the prefilled "me"). */
function sqNeeds(ty){
  const n = {holder:ty.needs_holder, due:ty.needs_due_date, note:ty.needs_note, date:ty.needs_date};
  n.oneTap = (ty.needs_holder === '' || ty.needs_holder === 'me') && !ty.needs_due_date && !ty.needs_note && !ty.needs_date;
  return n;
}
/** Validation of the form values for a type: returns an i18n key of the first problem, or ''. */
function sqCheck(ty, v){
  if (ty.needs_holder === 'entity' && !String(v.holder || '').trim()) return 'sq_e_holder';
  if (ty.needs_due_date === 'required' && !sqDay(v.due_date)) return 'sq_e_due';
  if (ty.needs_note === 'required' && !String(v.note || '').trim()) return 'sq_e_note';
  if (ty.needs_date === 'required' && !sqDay(v.date)) return 'sq_e_date';
  return '';
}
/** Quick buttons for the current status: in the archive → the quick "out" types; out / missing → how it comes back. */
function sqQuickFor(types, kind, cur, max){
  const list = sqTypesFor(types, kind), p = sqPresence(cur, types), out = [];
  const add = (ty) => { if (ty && !ty.disabled && ty.applies_to.includes(kind) && !out.includes(ty) && (!cur || ty.id !== cur.status_id)) out.push(ty); };
  if (sqIsOut(p)){
    const ct = sqType(types, cur.status_id);
    if (ct && ct.returns_to) add(sqType(types, ct.returns_to));
    list.filter(x => x.quick && x.presence === 'in').forEach(add);
    if (p === 'missing') list.filter(x => x.presence === 'in').forEach(add);
  } else list.filter(x => x.quick && x.presence !== 'in').forEach(add);
  return out.slice(0, max || 3);
}

/* ---------------- texts ---------------- */
function sqDaysAgo(iso){ const d = new Date(iso), n = new Date(); if (isNaN(d)) return 0; const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()), b = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); return Math.round((b - a) / 864e5); }
function sqSince(iso){ const n = sqDaysAgo(iso); return n <= 0 ? t('sq_since_today') : n === 1 ? t('sq_since_yday') : t('sq_days', {n}); }
function sqWhen(iso){
  const d = new Date(iso); if (isNaN(d)) return '';
  const n = sqDaysAgo(iso), hm = d.toLocaleTimeString(S && S.lang === 'en' ? 'en-GB' : 'it-IT', {hour:'2-digit', minute:'2-digit'});
  return n === 0 ? t('sq_today') + ' ' + hm : n === 1 ? t('sq_yesterday') + ' ' + hm : fmtDate(iso, true);
}
const sqDayFmt = (day) => day ? fmtDate(day + 'T12:00:00') : '';
/** "Preso da Mario" / "Dato al cliente: Rossi Srl" / "Reinserito". */
function sqHeadline(ev, types){
  if (!ev) return t('sq_p_none');
  const ty = sqType(types, ev.status_id), s = ty ? sqTypeLabel(ty) : ev.status_id;
  if (!ev.holder) return s;
  return t(ty && ty.needs_holder === 'me' ? 'sq_by_me' : 'sq_by', {s, h:ev.holder});
}
/** "da 2 giorni · rientro entro il 12/11/2026 (in ritardo)" */
function sqSubline(ev, types){
  if (!ev) return '';
  const p = [sqSince(ev.date ? ev.date + 'T12:00:00' : ev.at)];
  if (ev.date) p.push(t('sq_on', {d:sqDayFmt(ev.date)}));
  if (ev.due_date && sqPresence(ev, types) === 'out') p.push(t('sq_due', {d:sqDayFmt(ev.due_date)}) + (sqOverdue(ev, types) ? ' (' + t('sq_overdue') + ')' : ''));
  return p.join(' · ');
}
/** "Ultima scansione" from stream A's access log when present (feature-detected), else null.
    Hooks: window.dmAccessLast(kind, id) → {user, at, via} | null (sync), or the server response fields
    last_scan / last_view / access.last of the binder / location record. */
function sqLastSeen(kind, id, rec){
  try { if (typeof window.dmAccessLast === 'function'){ const r = window.dmAccessLast(kind, id); if (r && r.at) return {user:String(r.user || r.who || ''), at:r.at, via:String(r.via || '')}; } } catch(e){}
  const x = rec && (rec.last_scan || rec.last_view || (rec.access && rec.access.last));
  return x && x.at ? {user:String(x.user || x.who || ''), at:x.at, via:String(x.via || '')} : null;
}

/* ---------------- reports (pure) ---------------- */
/** Everything not in the archive now: [{key, kind:'binder'|'document'|'location', target_id, doc_id, ev, ty, presence, overdue}]. */
function sqOutRows(events, types, opts){
  opts = opts || {}; const today = sqToday(), out = [];
  sqIndex(events).forEach((x, k) => {
    const ev = x.cur; if (!ev) return;
    const pr = sqPresence(ev, types);
    if (!(sqIsOut(pr) || (opts.neutral && pr === 'neutral'))) return;
    out.push({key:k, kind:ev.target_type, target_id:ev.target_id, doc_id:ev.doc_id, ev, ty:sqType(types, ev.status_id), presence:pr, overdue:sqOverdue(ev, types, today)});
  });
  return out.sort((a, b) => (b.overdue - a.overdue) || (a.presence === 'missing' ? -1 : 0) - (b.presence === 'missing' ? -1 : 0) || sqCmp(a.ev, b.ev));
}
/** Binders expected back in a box: those assigned to it + those whose current event went out with that box. */
function sqVerifyExpected(boxId, inBox, events, types){
  const m = new Map();
  (inBox || []).forEach(b => m.set(b.id, {id:b.id, code:b.speaking_code || b.code || '', company:b.company_name || '', short_code:b.short_code || ''}));
  sqIndex(events).forEach(x => { const ev = x.cur; if (ev && ev.target_type === 'binder' && ev.box_id === boxId && sqIsOut(sqPresence(ev, types)) && !m.has(ev.target_id)) m.set(ev.target_id, {id:ev.target_id, code:ev.code, company:'', short_code:''}); });
  return Array.from(m.values()).sort((a, b) => naturalCmp(a.code, b.code));
}
/** CSV text (';', UTF-8 BOM, formula guard) — the phone page has no 04-ui toCSV. */
function sqCsv(rows){
  const cell = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n') + '\r\n';
}
/** CSV of a return check: d = details of its 'status.verify' log line {found, missing, unexpected: [{id, code}]}. Shared by both pages. */
function sqVerifyCsv(d){
  d = d || {}; const rows = [[t('sq_vf_outcome'), t('sq_csv_code'), 'id']];
  [['found', 'sq_vf_w_found'], ['missing', 'sq_vf_w_missing'], ['unexpected', 'sq_vf_w_extra']].forEach(([k, w]) => (Array.isArray(d[k]) ? d[k] : []).forEach(x => rows.push([t(w), x && x.code, x && x.id])));
  return sqCsv(rows);
}
const SQ_CSV_HEAD = ['sq_csv_at', 'sq_csv_user', 'sq_csv_target', 'sq_csv_code', 'sq_csv_doc', 'sq_csv_status', 'sq_csv_presence', 'sq_csv_holder', 'sq_csv_due', 'sq_csv_date', 'sq_csv_note', 'sq_csv_via', 'sq_csv_box', 'sq_csv_batch'];
/** One CSV row per event (chronological). boxCode(id) → code of a box id (optional). */
function sqEventsCsv(events, types, boxCode){
  const rows = [SQ_CSV_HEAD.map(k => t(k)).concat(['event_id', 'undo_of'])];
  (events || []).forEach(e => { const ty = sqType(types, e.status_id);
    rows.push([e.at, e.user, t('sq_tt_' + e.target_type), e.code, e.doc_text, e.undo_of ? t('sq_via_undo') : sqTypeLabel(ty || {id:e.status_id}), e.undo_of ? '' : t('sq_p_' + sqPresence(e, types)), e.holder, e.due_date, e.date, e.note, t('sq_via_' + e.via),
      e.box_id ? (boxCode ? boxCode(e.box_id) : '') || e.box_id : '', e.batch_id, e.id, e.undo_of]); });
  return sqCsv(rows);
}
