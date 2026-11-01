/* =====================================================================
   DocMap 2026 — UI primitives: icons, toasts, modals, download, clipboard
   ===================================================================== */
const ICONS = {
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  camera:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  pin:'<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  archive:'<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  printer:'<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  sparkles:'<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
  sliders:'<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pencil:'<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash:'<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  copy:'<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  refresh:'<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  qr:'<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
  x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  alert:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  map:'<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/>',
  list:'<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
  crosshair:'<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>',
  file:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  table:'<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
  merge:'<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
  clipboard:'<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  braces:'<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
  grid:'<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  eye:'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  globe:'<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  arrowRight:'<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  rotate:'<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  database:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>'
};
const ic = (n, cls) => '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || '') + '</svg>';

function toast(msg, kind, ms, action){
  kind = kind || 'ok';
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.setAttribute('role', 'status');
  el.innerHTML = ic(kind === 'ok' ? 'check' : kind === 'err' ? 'alert' : kind === 'warn' ? 'alert' : 'info') + '<div>' + esc(msg) + '</div>';
  if (action){
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'toast-act'; btn.textContent = action.label;
    btn.addEventListener('click', () => { el.remove(); action.fn(); });
    el.appendChild(btn);
  }
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, ms || 3200);
}
/* One-level undo for every bulk change (delete, import, session restore, .sqlite open). */
let UNDO = null;
function undoPoint(){ UNDO = clone({binders:S.binders, clients:S.clients || [], settings:S.settings, print:S.print, customPresets:S.customPresets, usedSlots:S.usedSlots, lang:S.lang}); }
function undoToast(msg, kind){
  toast(msg, kind || 'ok', 9000, {label:t('undo'), fn: () => {
    if (!UNDO) return; const W = UNDO; UNDO = null;
    applyWorkspaceObject(W); commit(); renderAll(); toast(t('undone'));
  }});
}

/* Modal stack: each modal is its own overlay so a confirmation can sit above an editor. */
const modalStack = [];
function openModal(o){
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
  ov.style.zIndex = 80 + modalStack.length * 5;
  const btns = (o.buttons || []).map((b, i) => '<button class="' + (b.cls || 'btn') + '" data-a="modal-btn" data-i="' + i + '">' + (b.icon ? ic(b.icon) : '') + esc(b.label) + '</button>').join('');
  ov.innerHTML = '<div class="modal ' + (o.size || '') + '"><div class="modal-h"><h2>' + esc(o.title || '') + '</h2><button class="icon-btn" data-a="modal-close" aria-label="' + esc(t('close')) + '">' + ic('x') + '</button></div>' +
    '<div class="modal-b">' + (o.body || '') + '</div>' + (btns ? '<div class="modal-f">' + btns + '</div>' : '') + '</div>';
  ov._opts = o;
  ov.addEventListener('mousedown', (e) => { if (e.target === ov && o.dismissable !== false) closeModal(); });
  $('#modal-root').appendChild(ov);
  modalStack.push(ov);
  if (o.onMount) o.onMount(ov);
  const first = ov.querySelector('input,select,textarea,.btn-primary,.btn-danger-solid');
  if (first && o.autofocus !== false) setTimeout(() => first.focus(), 30);
  return ov;
}
function closeModal(force){
  const top = topModal();
  if (!top) return;
  // a modal may refuse to close (e.g. the binder editor with unsaved edits asks first)
  if (force !== true && top._opts && top._opts.beforeClose && top._opts.beforeClose() === false) return;
  const ov = modalStack.pop();
  if (ov._opts && ov._opts.onClose) ov._opts.onClose();
  ov.remove();
}
function topModal(){ return modalStack[modalStack.length - 1]; }

/** Every destructive action passes through here. */
function confirmAction(o){
  // o.plain: a simple question (no "data not exported" warning, no backup prompt)
  const body = '<div class="stack"><div class="' + (o.danger ? 'danger-box' : 'warn-box') + '">' + ic('alert', 'lg') + '<div>' + (o.plain ? '' : '<b>' + esc(t('c_text')) + '</b>') + (o.detail ? '<div' + (o.plain ? '' : ' style="margin-top:6px"') + '>' + esc(o.detail) + '</div>' : '') + '</div></div>' +
    (S.hasUnexportedChanges && !o.plain ? '<div class="info-box">' + ic('info') + '<div class="small">' + esc(t('c_dirty')) + '<div style="margin-top:10px"><button class="btn btn-sm btn-amber" data-a="quick-backup">' + ic('save') + esc(t('quick_backup')) + '</button></div></div></div>' : '') + '</div>';
  openModal({
    title: o.title || t('c_title'), body,
    buttons: [
      {label:t('cancel'), cls:'btn', action:'modal-close'},
      {label:o.okLabel || t('confirm'), cls:o.danger ? 'btn btn-danger-solid' : 'btn btn-primary', icon:o.danger ? 'trash' : 'check', fn: () => { closeModal(); o.onOk && o.onOk(); }}
    ]
  });
}

function download(name, text, mime){
  const blob = new Blob([text], {type:(mime || 'text/plain') + ';charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
async function copyText(text){
  let ok = false;
  try { if (navigator.clipboard && window.isSecureContext !== false){ await navigator.clipboard.writeText(text); ok = true; } } catch(e){}
  if (!ok){
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch(e){ ok = false; }
    ta.remove();
  }
  toast(ok ? t('copied') : t('copy_fail'), ok ? 'ok' : 'warn');
  return ok;
}
/* Read a text file whatever Windows produced it with: UTF-8 (with/without BOM), UTF-16 (Excel "Unicode text") or Windows-1252 (Excel "CSV"). */
function readFileText(file){
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(r.error);
    r.onload = () => {
      const u = new Uint8Array(r.result);
      try {
        if (u[0] === 0xFF && u[1] === 0xFE) return res(new TextDecoder('utf-16le').decode(u.subarray(2)));
        if (u[0] === 0xFE && u[1] === 0xFF) return res(new TextDecoder('utf-16be').decode(u.subarray(2)));
        try { return res(new TextDecoder('utf-8', {fatal:true}).decode(u).replace(/^\uFEFF/, '')); }
        catch(e){ readFileText.lastAnsi = true; return res(new TextDecoder('windows-1252').decode(u)); }
      } catch(e){ rej(e); }
    };
    readFileText.lastAnsi = false;
    r.readAsArrayBuffer(file);
  });
}

/* =====================================================================
   CSV
   ===================================================================== */
function detectDelim(text){
  const first = (String(text).split(/\r?\n/).find(l => l.trim()) || '');
  const cnt = (ch) => { let n = 0, q = false; for (const c of first){ if (c === '"') q = !q; else if (!q && c === ch) n++; } return n; };
  const c = {';':cnt(';'), ',':cnt(','), '\t':cnt('\t')};
  const best = Object.keys(c).sort((a, b) => c[b] - c[a])[0];
  return c[best] > 0 ? best : ';';
}
function parseCSV(text, delim){
  const rows = []; let row = [], f = '', q = false, i = 0;
  const s = String(text).replace(/^﻿/, '');
  while (i < s.length){
    const c = s[i];
    if (q){
      if (c === '"'){ if (s[i + 1] === '"'){ f += '"'; i += 2; continue; } q = false; i++; continue; }
      f += c; i++; continue;
    }
    if (c === '"' && f === ''){ q = true; i++; continue; }
    if (c === delim){ row.push(f); f = ''; i++; continue; }
    if (c === '\r'){ i++; continue; }
    if (c === '\n'){ row.push(f); rows.push(row); row = []; f = ''; i++; continue; }
    f += c; i++;
  }
  if (f !== '' || row.length){ row.push(f); rows.push(row); }
  return rows;
}
function csvField(v, delim){
  const s = String(v == null ? '' : v);
  return (s.includes(delim) || s.includes('"') || s.includes('\n') || s.includes('\r')) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/* Spreadsheet formula injection guard (OWASP): a cell starting with = + - @ is run as a formula by Excel.
   Used for the full backup that people open in Excel; import strips the guard again so the round trip is lossless. */
const FORMULA_RE = /^[=+\-@\t\r]/;
const safeCell = (v) => { const s = String(v == null ? '' : v); return FORMULA_RE.test(s) ? "'" + s : s; };
const unsafeCell = (s) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);
function toCSV(rows, delim){ return rows.map(r => r.map(v => csvField(v, delim)).join(delim)).join('\r\n') + '\r\n'; }

const HEADER_ALIASES = {
  speaking_code:['speaking_code','codice_parlante','codice','code','speaking','cod'],
  multi_code:['multi_code','codice_multi','multi','cod_multi','codicemulti','multicode','id_multi','multi_id','codice_interno','id_interno','cod_interno','rif_multi'],
  company_name:['company_name','cliente','client','company','ragione_sociale','azienda','nome_cliente'],
  company_city:['company_city','luogo','sede','citta','comune','localita','city','place','luogo_ditta'],
  category:['category','categoria','pratica'],
  ref_year:['ref_year','anno','anno_riferimento','anno_rif','esercizio','year','reference_year'],
  extra_codes:['extra_codes','codici_extra','altri_codici','codici_aggiuntivi','extra','protocollo'],
  shelf_color:['shelf_color','colore_ripiano','shelf_colour'],
  binder_title:['binder_title','titolo','title','titolo_faldone','faldone','descrizione_faldone','oggetto'],
  room_code:['room_code','stanza','room','zona','zone'],
  cabinet_code:['cabinet_code','armadio','cabinet','mobile'],
  shelf_code:['shelf_code','ripiano','shelf','mensola'],
  sector_code:['sector_code','settore','sector','lato'],
  location_code:['location_code','posizione','location','coordinata','coordinate','collocazione'],
  archive_state:['archive_state','stato','state','status','stato_archivio'],
  contents_items:['contents','contents_items','contenuti','contenuto','documenti','items'],
  tags:['tags','tag','parole_chiave','keywords'],
  color_hex:['color_hex','colore','color','colour'],
  short_code:['short_code','shortcode','codice_qr','qr_code','qr'],
  short_url:['short_url','shorturl','url_breve','link'],
  final_destination:['final_destination','destinazione','destination','url_destinazione'],
  selected_for_print:['selected_for_print','stampa','print','selezionato'],
  id:['id','uuid'],
  created_at:['created_at','creato','data_creazione'],
  updated_at:['updated_at','aggiornato','data_aggiornamento']
};
const ALIAS_LOOKUP = (() => { const m = {}; Object.keys(HEADER_ALIASES).forEach(k => HEADER_ALIASES[k].forEach(a => m[a] = k)); return m; })();
const normHeader = (h) => String(h || '').replace(/^﻿/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
function normState(v){
  const s = String(v || '').trim().toLowerCase().replace(/[\s\-\/]+/g, '_');
  if (!s) return '';
  if (/^(historical|storico|archivio_storico|hist|deposito)$/.test(s)) return 'HISTORICAL';
  if (/^(checked_out|checkedout|out|prelevato|in_uso|inuso|in_uso_prelevato|fuori)$/.test(s) || s.indexOf('preleva') >= 0) return 'CHECKED_OUT';
  if (/^(current|corrente|archivio_corrente|attivo|active)$/.test(s)) return 'CURRENT';
  return STATES.includes(String(v).toUpperCase()) ? String(v).toUpperCase() : 'CURRENT';
}
function truthy(v){ return /^(1|true|si|sì|yes|y|x|vero)$/i.test(String(v || '').trim()); }

/* Turn one raw record (any header naming) into a partial binder containing only provided fields. */
function mapRecord(raw){
  const o = {};
  Object.keys(raw || {}).forEach(k => {
    const key = ALIAS_LOOKUP[normHeader(k)] || (HEADER_ALIASES[k] ? k : null);
    if (!key) return;
    const v = raw[k];
    if (v == null) return;
    if (key === 'contents_items'){
      const arr = pipeToContents(typeof v === 'string' ? unsafeCell(v.trim()) : v);
      if (arr.length) o.contents_items = arr;
      return;
    }
    if (key === 'selected_for_print'){ if (String(v).trim() !== '' || typeof v === 'boolean') o.selected_for_print = typeof v === 'boolean' ? v : truthy(v); return; }
    const s = unsafeCell(String(v).trim());
    if (s !== '') o[key] = s;
  });
  if (o.archive_state) o.archive_state = normState(o.archive_state);
  if (o.speaking_code) o.speaking_code = o.speaking_code.toUpperCase().replace(/\s+/g, '');
  if (!o.room_code && !o.cabinet_code && !o.shelf_code && o.location_code){
    const p = parseLocation(o.location_code); if (p) Object.keys(p).forEach(k => { if (p[k]) o[k] = p[k]; });
  }
  delete o.location_code;
  if (!o.short_code && o.short_url){ const m = o.short_url.match(/dm26[A-Za-z0-9]{8}/); if (m) o.short_code = m[0]; }
  delete o.short_url;
  return o;
}

/* ---------------- Export builders ---------------- */
function binderToCsvRow(b){
  return [b.speaking_code, b.multi_code, b.company_name, b.company_city, b.category, b.binder_title, b.ref_year, b.room_code, b.cabinet_code, b.shelf_code, b.sector_code, b.location_code, b.archive_state,
    contentsToPipe(b.contents_items), b.tags, b.color_hex, b.short_code, b.short_url, destFor(b), b.extra_codes, b.shelf_color, b.selected_for_print ? '1' : '0', b.id, b.created_at, b.updated_at];
}
function sortedBinders(){ return S.binders.slice().sort((a, b) => naturalCmp(a.speaking_code, b.speaking_code)); }
function manifestRow(b){ return [b.short_code, b.short_url, destFor(b), manifestTags(b)]; }
const MANIFEST_HEADER = ['short_code','short_url','final_destination','tags'];
function exportManifest(){
  const rows = [MANIFEST_HEADER].concat(sortedBinders().filter(b => b.short_code).map(manifestRow));
  const name = 'manifest_qr7_dm26.csv';
  download(name, toCSV(rows, ';').replace(/\r\n/g, '\n'), 'text/csv');
  markExported(name); toast(t('ex_done', {f:name}));
}
function mergeManifest(text, prune){
  const bom = text.charCodeAt(0) === 0xFEFF;
  let src = bom ? text.slice(1) : text;
  const eol = src.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const lines = src.split(/\r?\n/);
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  let header = lines.length ? lines[0] : MANIFEST_HEADER.join(';');
  let delim = ';';
  let cols = parseCSV(header, delim)[0] || [];
  if (cols.length < 2){ const d = detectDelim(header); if (d !== ';'){ delim = d; cols = parseCSV(header, delim)[0] || []; } }
  let normCols = cols.map(normHeader);
  let body = lines.slice(1);
  if (!normCols.includes('short_code')){
    // file without a header: keep all lines, use the standard header
    body = lines.slice(0); header = MANIFEST_HEADER.join(delim); normCols = MANIFEST_HEADER.slice();
  }
  const sIdx = Math.max(0, normCols.indexOf('short_code'));
  const ours = new Map();
  sortedBinders().filter(b => b.short_code).forEach(b => {
    const val = {short_code:b.short_code, short_url:b.short_url, final_destination:destFor(b), tags:manifestTags(b)};
    ours.set(b.short_code, normCols.map(c => csvField(val[c] != null ? val[c] : '', delim)).join(delim));
  });
  const out = [header]; let kept = 0, updated = 0, removed = 0;
  const seenOurs = new Set();
  body.forEach(line => {
    if (!line.trim()){ out.push(line); return; }
    const f = (parseCSV(line, delim)[0] || [])[sIdx] || '';
    const code = f.trim();
    if (ours.has(code)){ if (!seenOurs.has(code)){ updated++; seenOurs.add(code); } return; }
    if (prune && /^dm26[A-Za-z0-9]{8}$/.test(code)){ removed++; return; }
    out.push(line); kept++;
  });
  ours.forEach(row => out.push(row));
  return { text:(bom ? '﻿' : '') + out.join(eol) + eol, kept, updated, added:ours.size - updated, removed };
}
function exportFullCSV(){
  const rows = [CSV_COLUMNS].concat(sortedBinders().map(b => binderToCsvRow(b).map(safeCell)));
  const name = 'docmap_full_backup.csv';
  download(name, '﻿' + toCSV(rows, ';'), 'text/csv');
  markExported(name); toast(t('ex_done', {f:name}));
}
function workspaceJSON(){
  return JSON.stringify({ app:'DocMap26', format:'docmap_workspace', version:APP_VERSION, exported_at:nowISO(),
    settings:S.settings, lang:S.lang, print:S.print, customPresets:S.customPresets, usedSlots:S.usedSlots, binders:S.binders, clients:S.clients || [] }, null, 2);
}
function exportJSON(){
  const name = 'docmap_workspace.json';
  download(name, workspaceJSON(), 'application/json');
  markExported(name); toast(t('ex_done', {f:name}));
}
function quickBackup(){
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const name = 'docmap_workspace_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + '.json';
  download(name, workspaceJSON(), 'application/json');
  markExported(name); toast(t('ex_done', {f:name}));
  $$('.overlay [data-a="quick-backup"]').forEach(b => { b.disabled = true; });
}

/* ---------------- AI prompt ---------------- */
function csvTemplateHeader(){ return 'speaking_code;multi_code;company_name;category;binder_title;room_code;cabinet_code;shelf_code;sector_code;location_code;archive_state;contents;tags;color_hex;short_code;short_url;final_destination;company_city;ref_year;extra_codes'; }
function buildAIPrompt(includeCtx){
  const F = '```';
  const codes = sortedBinders().map(b => b.speaking_code);
  const byPrefix = {};
  codes.forEach(c => { const m = c.match(/^([A-Z]+)(\d+)$/); if (m) byPrefix[m[1]] = Math.max(byPrefix[m[1]] || 0, +m[2]); });
  const clients = Array.from(new Set(S.binders.map(b => b.company_name + ' → ' + initialsOf(b.company_name)))).slice(0, 60);
  const L = [];
  L.push('###################################################################');
  L.push('### PART 1 — SYSTEM INSTRUCTIONS FOR THE AI (DocMap 2026 / DM26) ###');
  L.push('###################################################################');
  L.push('');
  L.push('ROLE: You are a meticulous archival data-entry assistant for an Italian accounting firm (studio commercialista / CPA firm). Convert the user\'s notes, lists or photos (PART 2, written in Italian) into rows for "DocMap 2026", a physical-digital archive of binders (faldoni / cartelle).');
  L.push('');
  L.push('OUTPUT RULES (MANDATORY — follow exactly):');
  L.push('1. Reply with EXACTLY ONE fenced code block labelled csv and NOTHING ELSE: no greeting, no explanation, no notes before or after the block.');
  L.push('2. Delimiter: semicolon ( ; ). Encoding: UTF-8. The FIRST line must be this exact header, unchanged:');
  L.push(csvTemplateHeader());
  L.push('3. Every row must have exactly 20 fields (19 semicolons). Keep empty fields empty (e.g. ";;").');
  L.push('4. One row per physical binder. Never merge two binders into one row and never split one binder into two rows.');
  L.push('5. Never use a semicolon inside a value (replace it with a comma). Do not wrap values in quotes. No line breaks inside values.');
  L.push('6. Do not invent clients, documents or locations that the user did not provide or that are not visible in the photos. If a field is unknown, leave it empty.');
  L.push('');
  L.push('FIELD RULES:');
  L.push('- speaking_code: client initials + progressive number per client. Initials = first letter of up to 3 significant words, ignoring legal forms (S.r.l., S.p.A., S.n.c., S.a.s.) and words like "di", "e", "della". Examples: "Barbieri Luigi S.r.l." → BL1, BL2, BL3; "Rossi Costruzioni S.p.A." → RC1; "Farmacia San Giorgio" → FSG1. Uppercase, no spaces, unique.');
  L.push('- multi_code: the studio\'s internal "Codice Multi" (identifier already assigned to the client or to the practice in the management software). Copy it EXACTLY as written (keep letters, digits, dashes, slashes, leading zeros). Never invent it: leave empty if the user did not give it. Binders of the same client/practice usually share the same multi_code.');
  L.push('- company_name: full client / company name exactly as the user wrote it.');
  L.push('- company_city: place of the client (town, optionally with province in brackets, e.g. "Parma (PR)"). Leave empty if unknown.');
  L.push('- category: choose the closest of: ' + CATEGORIES.join(', ') + '.');
  L.push('- binder_title: short macro title of the binder in Italian (e.g. "Fatture e Contabilità IVA", "Bilancio e Dichiarativi", "Paghe e Personale").');
  L.push('- room_code: room letter or name exactly as the user calls it (A, B, "Ufficio 1", "Archivio"…). cabinet_code: cabinet number (1, 2, 3…). All location fields are optional: leave empty what is not known.');
  L.push('- shelf_code: shelf identifier as the user uses it: numbers (1, 2, 3), letters (A, B), Greek letters from the top down (α, β, γ, δ, ε), an emoji, a symbol or a short name. Default suggestion: Greek letters.');
  L.push('- sector_code: optional horizontal sector: SX (left), CX (centre), DX (right). Leave empty if unknown.');
  L.push('- location_code: room_code + cabinet_code + "-" + shelf_code, plus "-" + sector_code when present. Examples: A1-α, B2-β-SX. With a room name use "Ufficio 1 · 2-α". You can also leave it empty: DocMap computes it.');
  L.push('- archive_state: CURRENT (archivio corrente), HISTORICAL (archivio storico), CHECKED_OUT (in uso / prelevato). Default: CURRENT.');
  L.push('- contents: the documents inside the binder, pipe-separated, each as "YEAR: Description" (year optional). Example: 2025: Fatture Acquisto Q1-Q4|2025: Liquidazioni IVA|2024: Bilancio d\'esercizio. If nothing is known, leave empty.');
  L.push('- tags: comma-separated lowercase keywords without spaces (e.g. iva,fatture,bilancio,2025).');
  L.push('- color_hex: by category → Ordinaria #2563EB, Semplificata #059669, Lavoro #D97706, Societario #7C3AED, Dichiarativi #DC2626, any other #475569.');
  L.push('- short_code: PREFERABLY LEAVE EMPTY — DocMap generates a unique code automatically. If you fill it, it must be "dm26" + exactly 8 characters from A-Z a-z 2-9, excluding I O l o (example: dm26K8m2P9xL), unique in the file.');
  L.push('- short_url: leave empty if short_code is empty, otherwise https://qr7.it/{short_code}.');
  L.push('- final_destination: leave EMPTY (DocMap fills it from the studio template).');
  L.push('- ref_year: optional reference year of the contents (e.g. 2025, or a range like 2020-2024). Not the creation date.');
  L.push('- extra_codes: optional other identifiers printed on the archive part of the label (protocol numbers, practice numbers…), comma-separated. Never invent them.');
  L.push('');
  if (includeCtx && codes.length){
    L.push('EXISTING ARCHIVE CONTEXT (do NOT reuse these speaking codes; continue numbering after them):');
    L.push('- Codes already in use: ' + codes.join(', '));
    L.push('- Next free numbers: ' + Object.keys(byPrefix).sort().map(p => p + (byPrefix[p] + 1)).join(', '));
    L.push('- Known clients → initials: ' + clients.join('; '));
    const multis = Array.from(new Set(S.binders.filter(b => b.multi_code).map(b => b.company_name + ' → ' + b.multi_code))).slice(0, 60);
    if (multis.length) L.push('- Known clients → Codice Multi (reuse it for new binders of the same client): ' + multis.join('; '));
    L.push('');
  }
  L.push('EXAMPLE OF A VALID REPLY (format only — use the user\'s real data):');
  L.push(F + 'csv');
  L.push(csvTemplateHeader());
  L.push('BL4;M-10234;Barbieri Luigi S.r.l.;Ordinaria;Banche e Finanziamenti;A;1;γ;;A1-γ;CURRENT;2025: Estratti conto bancari|2025: Contratti di finanziamento;banche,finanziamenti,2025;#2563EB;;;;Parma (PR);2025;');
  L.push('VR1;;Verdi Rita;Privati;Dichiarazioni Personali;B;3;α;SX;B3-α-SX;HISTORICAL;2023: Modello 730|2024: Modello 730|2024: Spese mediche;730,privati,dichiarazioni;#475569;;;;;2023-2024;');
  L.push(F);
  L.push('');
  L.push('');
  L.push('===================================================================');
  L.push('🇮🇹 INSERISCI QUI SOTTO LE INFORMAZIONI, LE FOTO O L\'ELENCO DEI FALDONI DA GENERARE:');
  L.push('(Specifica: Nomi clienti, Codice Multi se lo conosci, documenti contenuti, stanze/armadi ed eventuali allegati)');
  L.push('===================================================================');
  L.push('[Scrivi o incolla qui le tue note e allega le foto degli scaffali/documenti...]');
  L.push('');
  return L.join('\n');
}
