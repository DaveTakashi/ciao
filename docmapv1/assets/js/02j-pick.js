/* =====================================================================
   DocMap 2026 — v12.10 «Prelievi e consegne» (roadmap wave 2, K1 + K6): pure model shared by index.html and scan.html.

   A pick list ("prelievo") = the binders to take out of the archive for one need (tax audit, a client's request,
   internal work, a lawyer, a due diligence, digitisation, a move, a discard review…), visited along the shortest
   walk through the shelves, then handed over (optionally with a signature) and brought back.

   Nothing here touches the DOM or the state: route, purposes, phone link codec, receipt fingerprint.
   - Route: binders are grouped into STOPS (the place where the hand goes: a box of the location tree, or
     room·cabinet·shelf for the classic position), stops are ordered along the physical order of the archive
     (archive › room › cabinet/aisle › shelf › sector, natural order, Greek shelves α β γ…), with a serpentine
     (boustrophedon) walk: every other aisle / cabinet row is walked backwards, so the walk never goes back to the
     start of a row. Inside a stop, binders follow their speaking code.
   - The phone link carries the list (no server needed): scan.html?pk=<base64url JSON>, version 1.
   - Status events of a pick list carry batch_id = the list id ('pk-…'); a signed hand-over 'dl-…'; a return 'rt-…'.
   ===================================================================== */
'use strict';

const PK_VERSION = 1;
const PK_MAX_ITEMS = 400;          // one list = one trip; a bigger need is split into several lists
const PK_LINK_MAX_ITEMS = 150;     // items carried by a phone link / QR (beyond that the phone works by scanning)
const PK_STOP_S = 40, PK_ITEM_S = 12;   // default walk estimate: seconds per stop and per binder (overridden by measured times)
/* Purposes: the need behind the list. status = the status type recorded when the binders leave the archive
   (02d-status.js ids), holder = who gets them by default ('me' = the operator, 'client' = the binder's client). */
const PK_PURPOSES = [
  {id:'audit',   icon:'bank',   status:'to_entity', holder:'Agenzia delle Entrate', due:30},
  {id:'client',  icon:'user',   status:'to_client', holder:'client',                due:30},
  {id:'work',    icon:'folder', status:'case',      holder:'me',                    due:14},
  {id:'consult', icon:'hand',   status:'taken',     holder:'me',                    due:3},
  {id:'legal',   icon:'bank',   status:'to_entity', holder:'',                      due:60},
  {id:'review',  icon:'bank',   status:'to_entity', holder:'',                      due:30},
  {id:'digital', icon:'bank',   status:'to_entity', holder:'',                      due:30},
  {id:'move',    icon:'hand',   status:'taken',     holder:'me',                    due:7},
  {id:'discard', icon:'flag',   status:'check',     holder:'',                      due:0},
  {id:'other',   icon:'hand',   status:'taken',     holder:'me',                    due:7}
];
Object.assign(I18N.it, {
  pkp_audit:'Verifica fiscale o ispezione', pkp_client:'Richiesta del cliente', pkp_work:'Lavoro interno (pratica, bilancio, dichiarazione)', pkp_consult:'Consultazione veloce',
  pkp_legal:'Contenzioso, avvocato, tribunale', pkp_review:'Revisione, due diligence, perizia', pkp_digital:'Digitalizzazione o scansione', pkp_move:'Trasloco o riordino',
  pkp_discard:'Selezione per lo scarto (da valutare)', pkp_other:'Altro', pk_l_room:'Stanza {v}', pk_l_cab:'Armadio {v}', pk_l_shelf:'Ripiano {v}',
});
Object.assign(I18N.en, {
  pkp_audit:'Tax audit or inspection', pkp_client:'Client request', pkp_work:'Internal work (case, accounts, tax return)', pkp_consult:'Quick look-up',
  pkp_legal:'Litigation, lawyer, court', pkp_review:'Audit, due diligence, appraisal', pkp_digital:'Digitisation or scanning', pkp_move:'Move or reorganisation',
  pkp_discard:'Selection for disposal (to be assessed)', pkp_other:'Other', pk_l_room:'Room {v}', pk_l_cab:'Cabinet {v}', pk_l_shelf:'Shelf {v}',
});
function pkPurpose(id){ return PK_PURPOSES.find(p => p.id === id) || PK_PURPOSES[PK_PURPOSES.length - 1]; }

/* ---------------- route ---------------- */
const PK_GREEK = 'αβγδεζηθικλμνξοπρστυφχψω';
const PK_SIDE = {sx:1, s:1, l:1, left:1, sinistra:1, cx:2, c:2, centro:2, center:2, centre:2, dx:3, d:3, r:3, right:3, destra:3};
/** Sort weight of one segment: Greek shelves by alphabet, SX < CX < DX, else natural text. */
function pkSegKey(s){
  s = String(s == null ? '' : s).trim();
  const g = PK_GREEK.indexOf(s.toLowerCase());
  if (s.length === 1 && g >= 0) return {n:g + 1, s:''};
  const side = PK_SIDE[s.toLowerCase()];
  if (side) return {n:side, s:''};
  return {n:null, s};
}
function pkSegCmp(a, b){
  const x = pkSegKey(a), y = pkSegKey(b);
  if (x.n != null && y.n != null) return x.n - y.n;
  if (x.n != null) return -1; if (y.n != null) return 1;
  return naturalCmp(x.s, y.s);
}
/** Path of a binder through the archive: [{seg, sort, label}] from the outside in (the last one = the stop). */
function pkPath(b){
  if (b.location_id && typeof locPath === 'function'){
    const p = locPath(b.location_id);
    if (p.length) return p.map(l => ({seg:String(l.seg || l.name || ''), sort:+l.sort || 0, label:typeof locTitle === 'function' ? locTitle(l) : (l.name || l.seg || ''), id:l.id}));
  }
  const room = String(b.room_code || '').trim(), cab = String(b.cabinet_code || '').trim(), shelf = String(b.shelf_code || '').trim();
  const out = [];
  if (room) out.push({seg:room, sort:0, label:t('pk_l_room', {v:room})});
  if (cab) out.push({seg:cab, sort:0, label:t('pk_l_cab', {v:cab})});
  if (shelf) out.push({seg:shelf, sort:0, label:t('pk_l_shelf', {v:shelf})});
  if (!out.length){
    const code = String(b.location_code || '').trim();
    if (code) code.split(/\s*[-·›/]\s*/).filter(Boolean).forEach(s => out.push({seg:s, sort:0, label:s}));
  }
  return out;
}
/** Human text of a stop (the place), e.g. "Archivio › Stanza A › Armadio 1 › Ripiano β". */
function pkPathText(path){ return path.map(x => x.label).filter(Boolean).join(' › '); }
/**
 * The walk. binders: normalised binders. Returns {stops:[{key, path, text, ids:[binder ids]}], order:[ids], noLoc:[ids], rows, levels}.
 * opts.serpentine (default true): alternate the direction of every other group at depth ≥ 1 (rows / cabinets).
 */
function pkRoute(binders, opts){
  opts = opts || {};
  const serp = opts.serpentine !== false;
  const root = {kids:new Map(), ids:[], seg:'', sort:0};
  const noLoc = [];
  const byId = new Map();
  (binders || []).forEach(b => {
    if (!b || !b.id || byId.has(b.id)) return; byId.set(b.id, b);
    const path = pkPath(b);
    if (!path.length){ noLoc.push(b.id); return; }
    let n = root;
    path.forEach(p => {
      const k = p.seg + '\u0001' + (p.id || '');
      if (!n.kids.has(k)) n.kids.set(k, {kids:new Map(), ids:[], seg:p.seg, sort:p.sort, label:p.label, path:null});
      n = n.kids.get(k);
    });
    n.path = path; n.ids.push(b.id);
  });
  // inside a stop: left → right (sector SX CX DX), then the speaking code
  const codeCmp = (a, b) => { const x = byId.get(a), y = byId.get(b); return pkSegCmp(x.location_id ? '' : x.sector_code || '', y.location_id ? '' : y.sector_code || '') || naturalCmp(x.speaking_code || '', y.speaking_code || ''); };
  const kidCmp = (a, b) => (a.sort || 0) - (b.sort || 0) || pkSegCmp(a.seg, b.seg) || naturalCmp(a.label || '', b.label || '');
  const stops = [];
  let flip = false;   // serpentine: flips every time we enter a new group at depth ≥ 1
  const walk = (n, depth, rev) => {
    if (n.ids.length) stops.push({key:pkPathText(n.path), path:n.path, text:pkPathText(n.path), ids:n.ids.slice().sort(codeCmp)});
    let kids = Array.from(n.kids.values()).sort(kidCmp);
    if (rev) kids = kids.reverse();
    kids.forEach(k => {
      // the direction of the children of k: forward at the top level (archives, rooms), then alternate per row
      let r = false;
      if (serp && depth >= 1 && k.kids.size){ r = flip; flip = !flip; }
      walk(k, depth + 1, r);
    });
  };
  walk(root, 0, false);
  const order = stops.reduce((a, s) => a.concat(s.ids), []).concat(noLoc.slice().sort(codeCmp));
  const rooms = new Set(stops.map(s => s.path.length ? s.path[0].seg : ''));
  return {stops, order, noLoc, rooms:rooms.size};
}
/** Seconds for the walk: stops × per stop + binders × per binder. perItem from the measured "find" median when given. */
function pkEstimate(route, perStop, perItem){
  const st = route.stops.length + (route.noLoc.length ? route.noLoc.length : 0);
  const n = route.order.length;
  return Math.round(st * (perStop || PK_STOP_S) + n * (perItem || PK_ITEM_S));
}
function pkFmtMin(sec){ const m = Math.max(1, Math.round(sec / 60)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; }

/* ---------------- the list carried to the phone ---------------- */
function pkB64e(s){ const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function pkB64d(s){ s = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return new TextDecoder().decode(b); }
/** Compact payload: {v, id, t (title), p (purpose), s (status id), h (holder), d (due date), i:[[short code, speaking code, company, stop index]], w:[stop texts]} */
function pkPayload(pick, binders, route){
  const byId = new Map(binders.map(b => [b.id, b]));
  const w = [], wi = new Map(), i = [];
  route.stops.forEach(s => { wi.set(s.key, w.length); w.push(s.text); });
  const stopOf = new Map(); route.stops.forEach(s => s.ids.forEach(id => stopOf.set(id, wi.get(s.key))));
  route.order.slice(0, PK_LINK_MAX_ITEMS).forEach(id => { const b = byId.get(id); if (b && b.short_code) i.push([b.short_code, b.speaking_code || '', String(b.company_name || '').slice(0, 40), stopOf.has(id) ? stopOf.get(id) : -1]); });
  return {v:PK_VERSION, id:pick.id, t:String(pick.title || '').slice(0, 80), p:pick.purpose || 'other', s:pick.status_id || '', h:String(pick.holder || '').slice(0, 120), d:pick.due_date || '', i, w, n:route.order.length};
}
function pkEncode(payload){ return pkB64e(JSON.stringify(payload)); }
/** Decoded and checked list, or null. */
function pkDecode(s){
  let o = null;
  try { o = JSON.parse(pkB64d(s)); } catch(e){ return null; }
  if (!o || o.v !== PK_VERSION || !/^pk-[A-Za-z0-9._:@-]{1,96}$/.test(String(o.id || '')) || !Array.isArray(o.i)) return null;
  const w = Array.isArray(o.w) ? o.w.map(x => String(x || '').slice(0, 200)) : [];
  const items = o.i.filter(x => Array.isArray(x) && /^[A-Za-z0-9_-]{1,40}$/.test(String(x[0] || ''))).slice(0, PK_MAX_ITEMS)
    .map(x => ({s:String(x[0]), c:String(x[1] || '').slice(0, 40), n:String(x[2] || '').slice(0, 60), w:Number.isInteger(x[3]) && x[3] >= 0 && x[3] < w.length ? x[3] : -1}));
  return {id:String(o.id), title:String(o.t || '').slice(0, 80), purpose:PK_PURPOSES.some(p => p.id === o.p) ? o.p : 'other', status_id:String(o.s || '').slice(0, 40), holder:String(o.h || '').slice(0, 120),
    due_date:/^\d{4}-\d{2}-\d{2}$/.test(String(o.d || '')) ? o.d : '', items, stops:w, total:+o.n || items.length};
}

/* ---------------- progress from the status events ---------------- */
/** For each binder id of a list: its current status event and whether it left / came back within this list.
    events: all status events (chronological), ids: binder ids, batch: the list id. */
function pkProgress(events, ids, batch, types){
  const idx = typeof sqIndex === 'function' ? sqIndex(events) : null;
  const want = new Set(ids), took = new Set(), back = new Set(), handed = new Set();
  (events || []).forEach(e => {
    if (!want.has(e.target_id) || e.target_type !== 'binder' || e.undo_of || (idx && idx.voided && idx.voided.has(e.id))) return;
    const b = String(e.batch_id || '');
    if (b === batch || b.indexOf(batch + '.') === 0){
      const ty = typeof sqType === 'function' ? sqType(types, e.status_id) : null;
      if (ty && ty.presence === 'in') back.add(e.target_id); else took.add(e.target_id);
      if (/\.dl-/.test(b)) handed.add(e.target_id);
    }
  });
  const rows = ids.map(id => {
    const cur = typeof sqCurrent === 'function' ? sqCurrent(events, 'binder', id) : null;
    const pres = cur && typeof sqPresence === 'function' ? sqPresence(cur, types) : 'in';
    return {id, cur, presence:pres, took:took.has(id), back:back.has(id) && pres !== 'out', handed:handed.has(id), out:pres === 'out' || pres === 'missing'};
  });
  const c = {n:rows.length, took:rows.filter(r => r.took).length, out:rows.filter(r => r.took && r.out).length, back:rows.filter(r => r.back).length, handed:rows.filter(r => r.handed).length};
  return {rows, c};
}

/* ---------------- signed hand-over: fingerprint ---------------- */
async function pkSha256Hex(text){
  try {
    const d = await crypto.subtle.digest('SHA-256', typeof text === 'string' ? new TextEncoder().encode(text) : text);
    return Array.from(new Uint8Array(d)).map(x => x.toString(16).padStart(2, '0')).join('');
  } catch(e){ return ''; }
}
/** Canonical text of a hand-over: what was given, to whom, when, and the signature bytes' digest. */
function pkReceiptCanon(r){
  return ['docmap-handover-v1', r.id, r.at, r.kind || 'out', r.recipient || '', r.doc || '', r.operator || '', r.sigHash || '', (r.items || []).map(x => x.id + '=' + (x.code || '')).sort().join(',')].join('\n');
}
function pkDataUrlBytes(u){ const m = /^data:[^;]+;base64,(.*)$/.exec(String(u || '')); if (!m) return null; const bin = atob(m[1]); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; }

/* ---------------- signature pad (PC mouse / touch screen, phone finger) ---------------- */
/** Mount on a <canvas>. Returns {clear(), empty(), dataUrl()} — the PNG is cropped to the ink, black on white. */
function pkPadMount(cv){
  const ctx = cv.getContext('2d'); let ink = false, last = null, minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  const fit = () => { const r = cv.getBoundingClientRect(), d = Math.min(3, window.devicePixelRatio || 1); cv.width = Math.max(10, Math.round(r.width * d)); cv.height = Math.max(10, Math.round(r.height * d)); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0B1B3F'; ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, r.width, r.height); };
  fit();
  const pos = (e) => { const r = cv.getBoundingClientRect(); return {x:e.clientX - r.left, y:e.clientY - r.top, p:e.pressure && e.pointerType === 'pen' ? e.pressure : 0.5}; };
  const grow = (p) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); };
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch(x){} last = pos(e); grow(last); ctx.beginPath(); ctx.arc(last.x, last.y, 1.1, 0, Math.PI * 2); ctx.fillStyle = '#0B1B3F'; ctx.fill(); ink = true; cv.dispatchEvent(new CustomEvent('pk-ink')); });
  cv.addEventListener('pointermove', (e) => { if (!last) return; e.preventDefault(); const p = pos(e); ctx.lineWidth = 1.6 + p.p * 2.2; ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); grow(p); last = p; });
  const up = () => { last = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', up);
  return {
    clear(){ ink = false; minX = minY = 1e9; maxX = maxY = -1; fit(); cv.dispatchEvent(new CustomEvent('pk-ink')); },
    empty(){ return !ink || (maxX - minX < 12 && maxY - minY < 12); },
    dataUrl(){
      if (!ink) return '';
      const d = cv.width / cv.getBoundingClientRect().width || 1, pad = 8;
      const x = Math.max(0, Math.floor((minX - pad) * d)), y = Math.max(0, Math.floor((minY - pad) * d));
      const w = Math.min(cv.width - x, Math.ceil((maxX - minX + pad * 2) * d)), h = Math.min(cv.height - y, Math.ceil((maxY - minY + pad * 2) * d));
      const k = Math.min(1, 600 / Math.max(w, 1)), o = document.createElement('canvas'); o.width = Math.max(1, Math.round(w * k)); o.height = Math.max(1, Math.round(h * k));
      const c2 = o.getContext('2d'); c2.fillStyle = '#FFFFFF'; c2.fillRect(0, 0, o.width, o.height); c2.drawImage(cv, x, y, w, h, 0, 0, o.width, o.height);
      return o.toDataURL('image/png');
    }
  };
}

/* ---------------- receipt (printed on the PC, downloaded on the phone) ---------------- */
Object.assign(I18N.it, {
  pkr_h_out:'Ricevuta di consegna', pkr_h_back:'Ricevuta di rientro', pkr_studio:'Studio', pkr_when:'Data e ora', pkr_to:'Ricevuto da', pkr_from:'Riconsegnato da', pkr_doc:'Documento di identità',
  pkr_by:'Consegnato da', pkr_for:'Motivo', pkr_list:'Faldoni ({n})', pkr_code:'Codice', pkr_client:'Cliente', pkr_title:'Contenuto', pkr_sig:'Firma', pkr_nosig:'firma su carta',
  pkr_decl_out:'Dichiaro di ricevere i faldoni elencati, completi e in buono stato, e di custodirli fino alla restituzione.', pkr_decl_back:'Dichiaro di restituire allo studio i faldoni elencati.',
  pkr_fp:'Impronta della ricevuta (SHA-256)', pkr_fp_d:'Calcolata su elenco, persone, data e firma: se uno di questi cambia, l\'impronta non corrisponde più.', pkr_due:'Da restituire entro {d}', pkr_due_k:'Da restituire entro', pkr_sign_here:'Firma',
});
Object.assign(I18N.en, {
  pkr_h_out:'Hand-over receipt', pkr_h_back:'Return receipt', pkr_studio:'Office', pkr_when:'Date and time', pkr_to:'Received by', pkr_from:'Returned by', pkr_doc:'ID document',
  pkr_by:'Handed over by', pkr_for:'Purpose', pkr_list:'Binders ({n})', pkr_code:'Code', pkr_client:'Client', pkr_title:'Contents', pkr_sig:'Signature', pkr_nosig:'signature on paper',
  pkr_decl_out:'I declare that I receive the listed binders, complete and in good condition, and that I keep them until they are returned.', pkr_decl_back:'I declare that I return the listed binders to the office.',
  pkr_fp:'Receipt fingerprint (SHA-256)', pkr_fp_d:'Computed on the list, the people, the date and the signature: if any of them changes, the fingerprint no longer matches.', pkr_due:'To be returned by {d}', pkr_due_k:'To be returned by', pkr_sign_here:'Signature',
});
/** r: {id, at, kind 'out'|'back', recipient, doc, operator, purpose, title, due_date, items:[{id, code, company, title}], sig (data URL or ''), hash}; studio: name. */
function pkReceiptHTML(r, studio){
  const back = r.kind === 'back', when = (() => { try { return new Date(r.at).toLocaleString(S.lang === 'en' ? 'en-GB' : 'it-IT', {dateStyle:'medium', timeStyle:'short'}); } catch(e){ return r.at; } })();
  const row = (k, v) => v ? '<tr><th>' + esc(k) + '</th><td>' + esc(v) + '</td></tr>' : '';
  return ('<div class="pkr"><div class="pkr-h"><div><div class="pkr-k">' + brandName() + ' · ') + esc(studio || '') + '</div><h1>' + esc(t(back ? 'pkr_h_back' : 'pkr_h_out')) + '</h1>' + (r.title ? '<div class="pkr-t">' + esc(r.title) + '</div>' : '') + '</div>' +
    '<div class="pkr-id mono">' + esc(r.id) + '</div></div>' +
    '<table class="pkr-m">' + row(t('pkr_when'), when) + row(t(back ? 'pkr_from' : 'pkr_to'), r.recipient) + row(t('pkr_doc'), r.doc) + row(t('pkr_by'), r.operator) +
      row(t('pkr_for'), r.purpose ? t('pkp_' + r.purpose) : '') + (r.due_date && !back ? row(t('pkr_due_k'), r.due_date) : '') + '</table>' +
    '<h2>' + esc(t('pkr_list', {n:(r.items || []).length})) + '</h2><table class="pkr-l"><thead><tr><th>#</th><th>' + esc(t('pkr_code')) + '</th><th>' + esc(t('pkr_client')) + '</th><th>' + esc(t('pkr_title')) + '</th></tr></thead><tbody>' +
    (r.items || []).map((x, i) => '<tr><td>' + (i + 1) + '</td><td class="mono"><b>' + esc(x.code || '') + '</b></td><td>' + esc(x.company || '') + '</td><td>' + esc(x.title || '') + '</td></tr>').join('') + '</tbody></table>' +
    '<p class="pkr-decl">' + esc(t(back ? 'pkr_decl_back' : 'pkr_decl_out')) + '</p>' +
    '<div class="pkr-sig"><div class="pkr-sig-k">' + esc(t('pkr_sig')) + ' — ' + esc(r.recipient || '') + '</div>' + (r.sig ? '<img alt="" src="' + esc(r.sig) + '">' : '<div class="pkr-line"></div><div class="pkr-sig-k">' + esc(t('pkr_nosig')) + '</div>') + '</div>' +
    (r.hash ? '<div class="pkr-fp"><b>' + esc(t('pkr_fp')) + '</b><div class="mono">' + esc(r.hash) + '</div><small>' + esc(t('pkr_fp_d')) + '</small></div>' : '') + '</div>';
}
/** Paper styles of the receipt (literal colours: it is paper in both themes); also inlined in the phone's download. */
const PK_RECEIPT_CSS = '.pkr{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#000;background:#fff;font-size:10pt;line-height:1.35;max-width:190mm;margin:0 auto}' +
  '.pkr h1{font-size:17pt;margin:0}.pkr h2{font-size:11pt;margin:5mm 0 2mm}.pkr-h{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5pt solid #000;padding-bottom:3mm;margin-bottom:3mm}' +
  '.pkr-k{font-size:8pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1D4ED8}.pkr-t{font-weight:600}.pkr-id{font-size:7.5pt;color:#333}' +
  '.pkr table{border-collapse:collapse;width:100%}.pkr-m th{text-align:left;width:42mm;font-weight:600;color:#333;padding:1mm 0;vertical-align:top}.pkr-m td{padding:1mm 0}' +
  '.pkr-l th,.pkr-l td{border-bottom:.5pt solid #999;padding:1.2mm 1.5mm;text-align:left;vertical-align:top;font-size:9pt}.pkr-l th{border-bottom:1pt solid #000;font-size:8pt;text-transform:uppercase;letter-spacing:.04em}' +
  '.pkr-l tr{break-inside:avoid}.pkr-decl{margin:5mm 0 3mm;font-style:italic}.pkr-sig{border:.6pt solid #000;border-radius:2mm;padding:2mm 3mm;min-height:30mm;break-inside:avoid}.pkr-sig img{max-height:32mm;max-width:100%;display:block;margin-top:1mm}' +
  '.pkr-sig-k{font-size:8pt;color:#333}.pkr-line{border-bottom:.6pt solid #000;height:20mm;margin-bottom:1mm}.pkr-fp{margin-top:4mm;font-size:8pt;break-inside:avoid}.pkr-fp .mono{font-family:ui-monospace,Consolas,monospace;word-break:break-all;font-size:8pt}.pkr-fp small{display:block;color:#444}' +
  '.pkr .mono{font-family:ui-monospace,Consolas,monospace}';
