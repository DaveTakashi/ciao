/* =====================================================================
   DocMap 2026 — v12.8 "Progetti di inventario": pure model, shared by index.html (PC) and scan.html (phone).

   A PROJECT is an archive (02e-archives.js) with an `inv` object:
     inv = { prefix:'Kq7P'  4 chars of SC_ALPHABET, unique, never reused (it is inside every printed QR)
             code:'ROSSI24' short code printed on the labels (binder speaking codes are <code>-0001…)
             client:'', status:'open'|'closed', mode:'box' (Scatola → Faldoni) | 'capture' (cattura ora, cataloga dopo)
             box_to:N, binder_to:N   labels generated so far (numbers 1…N), extended by new batches, never shrunk
             batches:[{id, kind:'box'|'binder', from, to, at, printed_at}]
             tags:['Fatture', …] quick tags, year_from / year_to (year bar), ai:true|false, auto_confirm:0.85 }
   Its labels need no record until they are scanned. Codes (same shapes as today, so qr7.it / any resolver, the
   manifest and every old reader keep working):
     box     dm26L + prefix + n   (13 chars = a location short code)
     binder  dm26  + prefix + n   (12 chars = a binder short code)
   n is written with 4 chars in base 56 over SC_ALPHABET (1 … 9 834 495). The server finds the project of a label
   from its prefix (api.php inv_label). Random short codes never fall inside a project prefix (newShortCode guard).

   A scanned binder carries `inv` = { p: project id, st: 'captured' | 'proposed' | 'review' | 'confirmed',
     ph: photo id (server), ai: {…result, model, at}, voice:'', by, dev, at, n, box } and the usual binder fields.
   ===================================================================== */
'use strict';

const INV_ALPHA = SC_ALPHABET;
const INV_LEN = 4, INV_MAX = Math.pow(INV_ALPHA.length, INV_LEN) - 1;
const INV_BIN_RE = /^dm26([A-Za-z0-9]{4})([A-Za-z0-9]{4})$/, INV_LOC_RE = /^dm26L([A-Za-z0-9]{4})([A-Za-z0-9]{4})$/;
const INV_STATES = ['captured', 'proposed', 'review', 'confirmed'];
const INV_DEFAULT_TAGS = ['Fatture', 'Bilanci', 'Paghe', 'F24', 'Contratti', 'Banca', 'Corrispondenza', 'Varie'];
const INV_AUTO_CONFIRM = 0.85;
/* v12.12 working modes (feasibility doc): box = Scatola → Faldoni · capture = cattura ora, cataloga dopo ·
   station = stazione fissa (phone on a stand or PC webcam, hands free) · chain = catena a due persone (A scans, B corrects
   live on the PC). Verification (mode 6) is a screen of the phone available in every mode. */
const INV_MODES = ['box', 'capture', 'station', 'chain'];
/* Label batches: box (location codes) · binder · doc (document inside a binder) · any (jolly: the phone decides at the
   first scan). binder / doc / any share the binder numbering (binder_to), so every one is a normal binder short code. */
const INV_BATCH_KINDS = ['box', 'binder', 'doc', 'any'];

/** n → 4 chars (base 56). */
function invSeqCode(n){
  n = Math.floor(+n || 0); if (n < 0 || n > INV_MAX) throw new Error('inv seq');
  let s = ''; for (let i = 0; i < INV_LEN; i++){ s = INV_ALPHA[n % INV_ALPHA.length] + s; n = Math.floor(n / INV_ALPHA.length); }
  return s;
}
/** 4 chars → n (0 if a char is outside the alphabet). */
function invSeqFrom(s){
  let n = 0; s = String(s || '');
  for (const ch of s){ const k = INV_ALPHA.indexOf(ch); if (k < 0) return 0; n = n * INV_ALPHA.length + k; }
  return n;
}
function invLabelCode(prefix, kind, n){ return (kind === 'box' ? 'dm26L' : 'dm26') + prefix + invSeqCode(n); }
/** A short code of a project label → {kind:'box'|'binder', prefix, n} | null. */
function invParseCode(code){
  const s = String(code || '').trim();
  let m = s.match(INV_LOC_RE); if (m) return {kind:'box', prefix:m[1], n:invSeqFrom(m[2])};
  m = s.match(INV_BIN_RE); if (m) return {kind:'binder', prefix:m[1], n:invSeqFrom(m[2])};
  return null;
}
/** Text read from a QR (URL on qr7.it or any resolver, …/q/<code>, ?q=, bare code) → {type, code} (assocParseCode). */
function invParseScan(text){ return typeof assocParseCode === 'function' ? assocParseCode(text) : {type:'', code:String(text || '').trim()}; }

function invCodeClean(v){ return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); }
/** Printed number of a label: ROSSI24-S007 (box) · ROSSI24-0042 (binder). Also the binder speaking code. */
function invNumber(inv, kind, n){
  const c = invCodeClean(inv && inv.code) || 'INV';
  return kind === 'box' ? c + '-S' + String(n).padStart(3, '0') : c + '-' + String(n).padStart(4, '0');
}
function invNormTags(v){
  const a = Array.isArray(v) ? v : String(v || '').split(/[,;\n]/);
  const out = []; a.forEach(x => { x = String(x || '').replace(/\s+/g, ' ').trim().slice(0, 40); if (x && !out.some(y => y.toLowerCase() === x.toLowerCase())) out.push(x); });
  return out.slice(0, 24);
}
function invYear(v){ v = parseInt(v, 10); return v >= 1800 && v <= 2200 ? v : 0; }
/** Default + cleaned inv object (keeps unknown keys: later versions may add some). */
function normalizeInv(i){
  const o = Object.assign({prefix:'', code:'', client:'', status:'open', mode:'box', box_to:0, binder_to:0, batches:[], tags:INV_DEFAULT_TAGS.slice(),
    year_from:0, year_to:0, ai:true, auto_confirm:INV_AUTO_CONFIRM, notes:''}, i || {});
  o.prefix = /^[A-Za-z0-9]{4}$/.test(o.prefix) ? o.prefix : '';
  o.code = invCodeClean(o.code);
  o.client = String(o.client || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  o.status = o.status === 'closed' ? 'closed' : 'open';
  o.mode = INV_MODES.includes(o.mode) ? o.mode : 'box';
  o.doc = o.doc === true;   // v12.12: document level (labels of documents inside a binder)
  o.price = invPriceNorm(o.price);   // v12.12: prices of this quote; null fields = the defaults of Impostazioni
  o.template = String(o.template || '').slice(0, 60);
  o.box_to = Math.max(0, Math.min(INV_MAX, parseInt(o.box_to, 10) || 0));
  o.binder_to = Math.max(0, Math.min(INV_MAX, parseInt(o.binder_to, 10) || 0));
  o.batches = (Array.isArray(o.batches) ? o.batches : []).filter(b => b && typeof b === 'object').map(b => ({id:String(b.id || uuid()), kind:INV_BATCH_KINDS.includes(b.kind) ? b.kind : 'binder',
    from:parseInt(b.from, 10) || 1, to:parseInt(b.to, 10) || 0, at:String(b.at || ''), printed_at:String(b.printed_at || ''), format:String(b.format || '')}));
  o.tags = invNormTags(o.tags);
  o.year_from = invYear(o.year_from); o.year_to = invYear(o.year_to);
  if (o.year_from && o.year_to && o.year_from > o.year_to){ const x = o.year_from; o.year_from = o.year_to; o.year_to = x; }
  o.ai = o.ai !== false;
  o.auto_confirm = Math.max(0.5, Math.min(1, +o.auto_confirm || INV_AUTO_CONFIRM));
  o.notes = String(o.notes || '').slice(0, 2000);
  o.target = Math.max(0, Math.min(INV_MAX, parseInt(o.target, 10) || 0));   // v12.15: expected binders (+ documents) of the job, 0 = none
  return o;
}
function invIsProject(a){ return !!(a && a.inv && typeof a.inv === 'object' && /^[A-Za-z0-9]{4}$/.test(a.inv.prefix || '')); }
/** Projects among the archives of S (PC). */
function invProjects(){ return (typeof S !== 'undefined' && S && Array.isArray(S.archives) ? S.archives : []).filter(invIsProject); }
function invPrefixes(){ return new Set(invProjects().map(a => a.inv.prefix)); }
function invByPrefix(p){ return invProjects().find(a => a.inv.prefix === p) || null; }
/** Is this random short code inside a project range? (newShortCode / newLocShortCode reroll it) */
function invCodeTaken(code){
  const x = invParseCode(code); if (!x) return false;
  return invPrefixes().has(x.prefix);
}
/** A prefix no project uses and no existing short code starts with (so a project label never equals an old code). */
function invNewPrefix(extraTaken){
  const used = new Set(extraTaken || []); invPrefixes().forEach(p => used.add(p));
  const st = typeof S !== 'undefined' && S ? S : {};
  (st.binders || []).forEach(b => { const c = String(b.short_code || ''); if (/^dm26[A-Za-z0-9]{8}$/.test(c)) used.add(c.slice(4, 8)); });
  (st.locations || []).forEach(l => { const c = String(l.short_code || ''); if (/^dm26L[A-Za-z0-9]{8}$/.test(c)) used.add(c.slice(5, 9)); });
  for (let i = 0; i < 2000; i++){ const p = randChars(INV_LEN); if (!used.has(p)) return p; }
  throw new Error('no free project prefix');
}
/** Suggested project code from its name: ROSSI SRL 2024 → ROSSI24 (letters of the first word + last 2 digits of a year). */
function invSuggestCode(name, taken){
  const w = String(name || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const y = (String(name || '').match(/\b(19|20)(\d\d)\b/) || [])[2] || '';
  let base = ((w.find(x => /[A-Z]/.test(x) && !/^(SRL|SPA|SNC|SAS|STUDIO|ARCHIVIO|INVENTARIO|DI|DEL|DELLA)$/.test(x)) || w[0] || 'INV').replace(/[0-9]/g, '').slice(0, 8) || 'INV') + y;
  base = base.slice(0, 10);
  const tk = new Set((taken || invProjects().map(a => a.inv.code)).map(invCodeClean));
  let c = base, i = 2; while (tk.has(c)){ c = base.slice(0, 9) + i; i++; }
  return c;
}

/** Kind of the binder-shaped label n: the last batch that covers it (binder | doc | any); 'binder' when none does. */
function invBatchKind(inv, n){
  const L = (inv && Array.isArray(inv.batches) ? inv.batches : []).filter(b => b.kind !== 'box' && n >= b.from && n <= b.to);
  return L.length ? L[L.length - 1].kind : 'binder';
}
/** Counter of a batch kind: boxes have their own numbers, the other kinds share the binder numbers. */
function invCounterKey(kind){ return kind === 'box' ? 'box_to' : 'binder_to'; }
/** Level of a scanned binder record: 'doc' for documents, else 'binder'. */
function invLevel(b){ return b && b.inv && b.inv.lvl === 'doc' ? 'doc' : 'binder'; }

/* ---------------- v12.12 prices of an inventory job (single source: Impostazioni; a project may override them) ---------------- */
/* Indicative list prices in euro, VAT excluded. They are only defaults: each quote can change them on its project. */
const INV_PRICE_DEFAULT = {binder:1.2, box:2.5, doc:0.4, fixed:0, vat:22};
const INV_PRICE_KEYS = ['binder', 'box', 'doc', 'fixed', 'vat'];
function invPriceNum(v){ if (v === null || v === undefined || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) && n >= 0 && n <= 1e6 ? Math.round(n * 10000) / 10000 : null; }
/** {binder, box, doc, fixed, vat} with null where not set (null = use the default). */
function invPriceNorm(p){ const o = {}; p = p && typeof p === 'object' ? p : {}; INV_PRICE_KEYS.forEach(k => { o[k] = invPriceNum(p[k]); }); return o; }
/** Studio defaults (S.settings.invPrices) over the built-in ones. */
function invPriceDefaults(settings){
  const s = invPriceNorm(settings && settings.invPrices), o = {};
  INV_PRICE_KEYS.forEach(k => { o[k] = s[k] !== null ? s[k] : INV_PRICE_DEFAULT[k]; });
  return o;
}
/** Effective prices of a project: its own where set, else the studio defaults. */
function invPrices(inv, settings){
  const d = invPriceDefaults(settings), p = invPriceNorm(inv && inv.price), o = {};
  INV_PRICE_KEYS.forEach(k => { o[k] = p[k] !== null ? p[k] : d[k]; });
  return o;
}
/** Billing lines: quantities × unit prices (cents rounded), VAT on the total. */
function invBill(q, prices){
  const r2 = (x) => Math.round(x * 100) / 100, lines = [];
  [['binder', q.binders || 0], ['box', q.boxes || 0], ['doc', q.docs || 0]].forEach(([k, n]) => { if (n > 0) lines.push({k, qty:n, unit:prices[k], total:r2(n * prices[k])}); });
  if (prices.fixed > 0) lines.push({k:'fixed', qty:1, unit:prices.fixed, total:r2(prices.fixed)});
  const net = r2(lines.reduce((s, l) => s + l.total, 0)), vat = r2(net * prices.vat / 100);
  return {lines, net, vat, gross:r2(net + vat), vatPct:prices.vat};
}

/* ---------------- v12.12 project templates (by kind of client) ---------------- */
/* Built-in templates; the studio can save its own (S.settings.invTemplates, same shape). years = how many years back. */
const INV_TEMPLATES = [
  {id:'commercialista', it:'Studio commercialista', en:'Accounting firm', mode:'box', years:10, doc:false, tags:['Fatture', 'Bilanci', 'Paghe', 'F24', 'Dichiarazioni', 'Contratti', 'Banca', 'Corrispondenza']},
  {id:'ente', it:'Comune o ente pubblico', en:'Municipality or public body', mode:'capture', years:30, doc:false, tags:['Delibere', 'Determine', 'Protocollo', 'Contratti', 'Tributi', 'Anagrafe', 'Edilizia', 'Personale']},
  {id:'legale', it:'Studio legale', en:'Law firm', mode:'box', years:15, doc:true, tags:['Pratiche', 'Atti', 'Sentenze', 'Corrispondenza', 'Parcelle', 'Contratti', 'Perizie', 'Varie']},
  {id:'azienda', it:'Azienda', en:'Company', mode:'box', years:10, doc:false, tags:['Fatture', 'Contabilità', 'Personale', 'Contratti', 'Acquisti', 'Vendite', 'Qualità', 'Banca']},
  {id:'condominio', it:'Amministratore di condominio', en:'Building manager', mode:'box', years:10, doc:false, tags:['Verbali', 'Bilanci', 'Fatture', 'Contratti', 'Manutenzioni', 'Assicurazioni', 'Corrispondenza', 'Varie']},
  {id:'trasloco', it:'Trasloco o liberazione locali', en:'Move or clearance', mode:'station', years:20, doc:false, tags:['Fatture', 'Contratti', 'Personale', 'Tecnico', 'Corrispondenza', 'Da scartare', 'Da conservare', 'Varie']}
];
function invTplNorm(x){
  x = x && typeof x === 'object' ? x : {};
  return {id:String(x.id || '').slice(0, 60), it:String(x.it || x.name || '').slice(0, 80), en:String(x.en || x.it || x.name || '').slice(0, 80), mode:INV_MODES.includes(x.mode) ? x.mode : 'box',
    years:Math.max(0, Math.min(200, parseInt(x.years, 10) || 0)), doc:x.doc === true, tags:invNormTags(x.tags), ai:x.ai !== false, auto_confirm:Math.max(0.5, Math.min(1, +x.auto_confirm || INV_AUTO_CONFIRM)), price:invPriceNorm(x.price), custom:x.custom === true};
}
/** Built-in + studio templates (studio ones first). */
function invTemplates(settings){
  const own = (settings && Array.isArray(settings.invTemplates) ? settings.invTemplates : []).map(x => Object.assign(invTplNorm(x), {custom:true})).filter(x => x.id && x.it);
  return own.concat(INV_TEMPLATES.map(invTplNorm));
}
/** Fields of the project form from a template (year bar: the last N years up to `year`). */
function invTplFields(tp, year){
  tp = invTplNorm(tp); year = year || new Date().getFullYear();
  return {mode:tp.mode, doc:tp.doc, tags:tp.tags.slice(), year_from:tp.years ? year - tp.years : 0, year_to:tp.years ? year : 0, ai:tp.ai, auto_confirm:tp.auto_confirm, price:tp.price, template:tp.id};
}
/** A project → a studio template (no client, no labels, no numbers). */
function invTplFromProject(a, name){
  const i = normalizeInv(a && a.inv), span = i.year_from && i.year_to ? i.year_to - i.year_from : 0;
  return invTplNorm({id:'own-' + uuid().slice(0, 8), it:name, en:name, mode:i.mode, years:span, doc:i.doc, tags:i.tags, ai:i.ai, auto_confirm:i.auto_confirm, price:i.price, custom:true});
}

/* ---------------- v12.12 verification of a box (mode 6) ---------------- */
/** expected: codes the data puts in the box · seen: codes read now · where: code → box code of a binder elsewhere.
    → {found[], missing[], misplaced[{c, from}], unknown[]} (codes in reading order). */
function invVerify(expected, seen, where){
  const E = new Set(expected || []), S2 = [], out = {found:[], missing:[], misplaced:[], unknown:[]};
  (seen || []).forEach(c => { if (!S2.includes(c)) S2.push(c); });
  S2.forEach(c => { if (E.has(c)) out.found.push(c); else if (where && where[c]) out.misplaced.push({c, from:where[c]}); else out.unknown.push(c); });
  (expected || []).forEach(c => { if (!S2.includes(c)) out.missing.push(c); });
  return out;
}

/* ---------------- v12.12 end-of-job report (pure: the PC view and the tests use it) ---------------- */
function invMedian(a){ const v = a.slice().sort((x, y) => x - y); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : 0; }
/** Gaps between consecutive captures of the same operator (a gap over pauseMs is a pause, not work). */
function invGaps(ats, pauseMs){
  const t2 = ats.map(x => Date.parse(x)).filter(x => isFinite(x)).sort((x, y) => x - y), g = [];
  for (let i = 1; i < t2.length; i++){ const d = t2[i] - t2[i - 1]; if (d > 0 && d <= pauseMs) g.push(d); }
  return g;
}
/** a: project (archive with inv) · binders, locations: of this project · logs: activity-log lines · settings: for the prices. */
function invReport(a, binders, locations, logs, settings, pauseMs){
  const i = normalizeInv(a && a.inv), P = pauseMs || 120000;
  const B = (binders || []).filter(b => b && b.archive_id === (a && a.id));
  const docs = B.filter(b => invLevel(b) === 'doc'), bins = B.filter(b => invLevel(b) !== 'doc');
  const boxes = (locations || []).filter(l => l && l.archive_id === (a && a.id) && invParseCode(l.short_code) && invParseCode(l.short_code).kind === 'box');
  const st = {captured:0, proposed:0, review:0, confirmed:0};
  B.forEach(b => { const s = b.inv && INV_STATES.includes(b.inv.st) ? b.inv.st : 'confirmed'; st[s]++; });
  const ats = B.map(b => (b.inv && b.inv.at) || b.created_at || '').filter(Boolean).sort();
  // per box: binders inside + years
  const perBox = boxes.map(l => {
    const L = bins.filter(b => b.location_id === l.id), ys = [];
    L.forEach(b => (String(b.ref_year || '').match(/\b(1[89]|2[01])\d\d\b/g) || []).forEach(y => ys.push(+y)));
    return {id:l.id, code:l.name || l.code || l.short_code, n:L.length, y0:ys.length ? Math.min(...ys) : 0, y1:ys.length ? Math.max(...ys) : 0};
  }).sort((x, y) => naturalCmpSafe(x.code, y.code));
  // per operator
  const ops = {};
  B.forEach(b => { const w = (b.inv && b.inv.by) || '—'; (ops[w] = ops[w] || {who:w, n:0, docs:0, review:0, ats:[]}); ops[w].n++; if (invLevel(b) === 'doc') ops[w].docs++; if (b.inv && b.inv.st === 'review') ops[w].review++; if (b.inv && b.inv.at) ops[w].ats.push(b.inv.at); });
  const operators = Object.values(ops).map(o => { const g = invGaps(o.ats, P), s = o.ats.slice().sort(); return {who:o.who, n:o.n, docs:o.docs, review:o.review, median_ms:Math.round(invMedian(g)), first:s[0] || '', last:s[s.length - 1] || ''}; })
    .sort((x, y) => y.n - x.n || String(x.who).localeCompare(String(y.who)));
  const allGaps = []; Object.values(ops).forEach(o => invGaps(o.ats, P).forEach(g => allGaps.push(g)));
  // AI
  const read = B.filter(b => b.inv && b.inv.ai && typeof b.inv.ai === 'object');
  const conf = read.map(b => +b.inv.ai.confidence || 0);
  // labels
  const scannedBin = B.length, unusedBin = Math.max(0, i.binder_to - scannedBin), unusedBox = Math.max(0, i.box_to - boxes.length);
  const printed = i.batches.filter(b => b.printed_at).reduce((s, b) => s + (b.to - b.from + 1), 0);
  // verifications (mode 6) from the activity log
  const ver = (logs || []).filter(e => e && e.action === 'inventory.verify' && e.details && e.details.project === (a && a.id)).map(e => ({at:e.at, who:e.who, box:e.details.box || '', expected:e.details.expected || 0, found:e.details.found || 0, missing:(e.details.missing || []).length, misplaced:(e.details.misplaced || []).length}))
    .sort((x, y) => String(y.at).localeCompare(String(x.at)));
  const prices = invPrices(i, settings);
  const bill = invBill({binders:bins.length, boxes:boxes.length, docs:docs.length}, prices);
  return {name:(a && a.name) || i.code, code:i.code, client:i.client, mode:i.mode, status:i.status, first:ats[0] || '', last:ats[ats.length - 1] || '',
    binders:bins.length, docs:docs.length, boxes:boxes.length, states:st, perBox, operators, median_ms:Math.round(invMedian(allGaps)),
    ai:{read:read.length, avg:conf.length ? Math.round(100 * conf.reduce((s, x) => s + x, 0) / conf.length) / 100 : 0, review:st.review, models:Array.from(new Set(read.map(b => b.inv.ai.model || '').filter(Boolean)))},
    labels:{box:i.box_to, binder:i.binder_to, printed, unusedBox, unusedBin}, verifications:ver, prices, bill};
}
function naturalCmpSafe(x, y){ return typeof naturalCmp === 'function' ? naturalCmp(String(x), String(y)) : String(x).localeCompare(String(y), undefined, {numeric:true}); }

/* ---------------- v12.12 AI reading: prompt + normalisation shared with the servers ---------------- */
/* invAiPrompt / invAiNorm are the same text and rules as ai_prompt / ai_norm in server-php/api.php and server-python
   (tests/v1212.js compares them): the PC uses them to ask a LOCAL model directly (Impostazioni › Lettura AI su questo PC). */
const INV_AI_KINDS = ['spine', 'doc', 'page'];
function invAiHints(h){
  h = h && typeof h === 'object' ? h : {};
  const tags = []; (Array.isArray(h.tags) ? h.tags : []).forEach(x => { x = String(x == null ? '' : x).trim().slice(0, 40); if (x !== '' && !tags.includes(x) && tags.length < 40) tags.push(x); });
  const yr = (v) => { v = parseInt(v, 10) || 0; return v >= 1800 && v <= 2200 ? v : 0; };
  return {tags, year_from:yr(h.year_from), year_to:yr(h.year_to), client:String(h.client == null ? '' : h.client).trim().slice(0, 120), kind:INV_AI_KINDS.includes(h.kind) ? h.kind : 'spine'};
}
function invAiPrompt(voice, hints){
  const what = hints.kind === 'doc' ? "La foto mostra la prima pagina di un documento d'archivio con un'etichetta QR.\n"
    : hints.kind === 'page' ? "La foto mostra la prima pagina o l'interno di un faldone d'archivio (la costa era vuota).\n"
    : "La foto mostra la costa (il dorso) di un faldone o di una scatola d'archivio con un'etichetta QR.\n";
  const where = hints.kind === 'spine' ? "Leggi solo quello che e' scritto sulla costa, a mano o a stampa; ignora il QR e i testi stampati sull'etichetta QR.\n"
    : "Leggi intestazione, oggetto, date e nomi principali; ignora il QR e i testi stampati sull'etichetta QR.\n";
  let p = "Sei un archivista. " + what + where
    + "Campi: company = ditta, cliente o persona se scritta; title = contenuto in poche parole come scritto (es. \"Fatture acquisti\");\n"
    + "year_from / year_to = anni indicati (0 se mancano, uguali se c'e' un solo anno); doc_type = tipo di documenti in una o due parole;\n"
    + "tags = solo tra questi, se corrispondono: " + (hints.tags.length ? hints.tags.join(', ') : '(nessuno)') + ";\n"
    + "notes = altre scritte utili; text = trascrizione fedele di tutto il testo leggibile della costa;\n"
    + "confidence = quanto sei sicuro della lettura, da 0 a 1; empty_spine = true se sulla costa non c'e' nulla di leggibile.\n"
    + "Non inventare: se non leggi un campo lascialo vuoto (0 per gli anni).";
  if (hints.client !== '') p += "\nL'archivio appartiene al cliente: " + hints.client + '.';
  if (hints.year_from || hints.year_to) p += "\nGli anni attesi sono tra " + (hints.year_from || '?') + ' e ' + (hints.year_to || '?') + '.';
  if (voice !== '') p += "\nL'operatore ha detto a voce: \"" + voice + "\". Le sue parole valgono piu' della foto.";
  return p;
}
/** Extra instruction for the OpenAI-compatible providers (no JSON schema everywhere: JSON mode + the list of keys). */
const INV_AI_JSON_HINT = "\nRispondi solo con un oggetto JSON con queste chiavi: company, title, year_from, year_to, doc_type, tags, notes, text, confidence, empty_spine.";
/** Text answer of a model → object (accepts ```json fences and text around the object). */
function invAiParseText(txt){
  let s = String(txt || '').trim();
  const f = s.match(/```(?:json)?\s*([\s\S]*?)```/i); if (f) s = f[1].trim();
  try { const v = JSON.parse(s); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch(e){}
  const a = s.indexOf('{'), z = s.lastIndexOf('}');
  if (a >= 0 && z > a) try { const v = JSON.parse(s.slice(a, z + 1)); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch(e){}
  return null;
}
function invAiNorm(r, hints){
  r = r && typeof r === 'object' ? r : {};
  const cut = (v, n) => Array.from(String(v == null || typeof v === 'object' ? '' : typeof v === 'boolean' ? (v ? '1' : '') : v).replace(/[\x00-\x1F\x7F]/g, '')).slice(0, n).join('').trim();
  const yr = (v) => { v = (typeof v === 'number' || (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v))) ? Math.trunc(+v) : 0; return v >= 1800 && v <= 2200 ? v : 0; };
  let yf = yr(r.year_from), yt = yr(r.year_to);
  if (yf && !yt) yt = yf; if (yt && !yf) yf = yt; if (yf > yt){ const x = yf; yf = yt; yt = x; }
  const tags = []; (Array.isArray(r.tags) ? r.tags : []).forEach(x => { if (typeof x !== 'string') return; hints.tags.forEach(h => { if (x.trim().toLowerCase() === h.toLowerCase() && !tags.includes(h)) tags.push(h); }); });
  let cf = (typeof r.confidence === 'number' || (typeof r.confidence === 'string' && r.confidence.trim() !== '' && isFinite(+r.confidence))) ? +r.confidence : 0; cf = Math.round(Math.max(0, Math.min(1, cf)) * 100) / 100;
  return {company:cut(r.company, 120), title:cut(r.title, 160), year_from:yf, year_to:yt, doc_type:cut(r.doc_type, 60), tags, notes:cut(r.notes, 300), text:cut(r.text, 500), confidence:cf, empty_spine:!!r.empty_spine};
}

/* ---------------- phone helpers: voice + years ---------------- */
/** Years named in a sentence: "fatture 2019 2021" → [2019, 2021]; "dal 15 al 18" with a project range → [2015, 2018]. */
function invYearsIn(text, inv){
  const s = String(text || ''); const ys = (s.match(/\b(19|20)\d\d\b/g) || []).map(Number);
  if (!ys.length && inv && (inv.year_from || inv.year_to)){
    const lo = inv.year_from || inv.year_to, hi = inv.year_to || inv.year_from, cent = Math.floor(lo / 100) * 100;
    (s.match(/\b(?:anno|anni|dal|al|del|fino|'|’)\s*(\d\d)\b/gi) || []).forEach(m => { const v = cent + Number(m.slice(-2)); if (v >= lo - 1 && v <= hi + 1) ys.push(v); });
  }
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
}
/** Dictated words → quick tags named in them (case/accents ignored) + years + the rest as free text. */
function invParseVoice(text, inv){
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  const fold = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const fs = fold(s), tags = [];
  ((inv && inv.tags) || []).forEach(tg => { const f = fold(tg); if (f && new RegExp('(^|[^a-z0-9])' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(fs)) tags.push(tg); });
  return {text:s, tags, years:invYearsIn(s, inv)};
}
/** Binder fields from an AI result (+ what the operator added), never inventing a Codice Multi. */
function invFieldsFromAi(r, cur){
  r = r || {}; cur = cur || {};
  const o = {};
  if (r.company && !cur.company_name) o.company_name = r.company;
  if (r.title && !cur.binder_title) o.binder_title = String(r.title).slice(0, 160);
  if (r.year_from && !cur.ref_year) o.ref_year = r.year_to && r.year_to !== r.year_from ? r.year_from + '-' + r.year_to : String(r.year_from);
  if (r.doc_type && !cur.category) o.category = String(r.doc_type).slice(0, 60);
  return o;
}
function invTagsJoin(a, b){ return invNormTags([].concat(String(a || '').split(','), b || [])).join(', '); }
/** A spine photo from a video / canvas → JPEG data URL, long side ≤ max px (default 1280), quality q. */
function invGrabFrame(src, max, q, crop){
  const W = src.videoWidth || src.width, H = src.videoHeight || src.height; if (!W || !H) return '';
  const c = crop && crop.w > 0 && crop.h > 0 ? crop : {x:0, y:0, w:W, h:H}, w = c.w, h = c.h;   // v12.15: crop = the spine of one binder in a burst
  const k = Math.min(1, (max || 1280) / Math.max(w, h)), cv = document.createElement('canvas');
  cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  cv.getContext('2d').drawImage(src, c.x, c.y, w, h, 0, 0, cv.width, cv.height);
  try { return cv.toDataURL('image/jpeg', q || 0.72); } catch(e){ return ''; }
}

/* ---------------- records + photos shared by the phone (11f) and the desktop (06q) ---------------- */
/** Record data without the local markers (_type: 'binder' | 'location' travels only inside the app). */
function invRecData(d){ const o = Object.assign({}, d); delete o._type; delete o.selected_for_print; return o; }
/** Upsert records (newest wins) and apply tombstones into a stored state object (local mode, desktop merge). */
function invApplyRecords(st, records, tombs){
  let n = 0;
  (records || []).forEach(d => {
    const key = d._type === 'location' ? 'locations' : 'binders'; if (!Array.isArray(st[key])) st[key] = [];
    const o = invRecData(d), i = st[key].findIndex(x => x.id === o.id);
    if (i >= 0 && String(st[key][i].updated_at || '') >= String(o.updated_at || '')) return;
    if (i >= 0) st[key][i] = Object.assign({}, st[key][i], o); else st[key].push(o);
    if (Array.isArray(st.tombstones)) st.tombstones = st.tombstones.filter(x => !(x.id === o.id && x.type === (d._type === 'location' ? 'location' : 'binder')));
    n++;
  });
  (tombs || []).forEach(x => {
    const key = x.type === 'location' ? 'locations' : 'binders'; if (!Array.isArray(st[key])) return;
    const i = st[key].findIndex(y => y.id === x.id);
    if (i >= 0 && String(st[key][i].updated_at || '') <= String(x.deletedAt || '')){ st[key].splice(i, 1); n++; if (!Array.isArray(st.tombstones)) st.tombstones = []; st.tombstones.push({type:x.type, id:x.id, code:x.code || '', deletedAt:x.deletedAt, who:x.who || ''}); }
  });
  return n;
}

/* Spine photos on this browser: IndexedDB docmap_v26_inv, store 'photos', key = photo id, value {id, mime, data (data URL),
   at, binder_id, project, sent}. The phone keeps them until they are uploaded (and, in local mode, for the desktop). */
const IV_IDB = 'docmap_v26_inv';
/* ---------------- photos store (IndexedDB, shared with the desktop page in local mode) ---------------- */
const IVDB = {
  open(){
    return new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') return rej(new Error('indexedDB'));
      const rq = indexedDB.open(IV_IDB, 1);
      rq.onupgradeneeded = () => { const db = rq.result; if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos'); };
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
  },
  async run(mode, fn){
    const db = await this.open();
    try { return await new Promise((res, rej) => { const tx = db.transaction('photos', mode), os = tx.objectStore('photos'); const r = fn(os); tx.oncomplete = () => res(r && 'result' in r ? r.result : undefined); tx.onerror = () => rej(tx.error); }); }
    finally { db.close(); }
  },
  put(id, v){ return this.run('readwrite', os => os.put(v, id)); },
  get(id){ return this.run('readonly', os => os.get(id)); },
  del(id){ return this.run('readwrite', os => os.delete(id)); }
};
window.IVDB = IVDB;


/* ---------------- v12.14 quick estimate of a job (K3: quote before the inventory) ---------------- */
/* Pure: from what you can see on site (metres of shelf, or boxes) to binders, labels, hours, days and price.
   q = {metres, perMetre, boxes, perBox, docsPerBinder, secPerBinder, people, setupHours, hoursPerDay, spare}
   The seconds per binder default to the studio's own measured pace (invPaceHistory), else INV_EST_DEFAULT.sec. */
const INV_EST_DEFAULT = {perMetre:12, perBox:8, sec:8, people:1, setupHours:1, hoursPerDay:6.5, spare:10};
function invEstimate(q, prices){
  q = q && typeof q === 'object' ? q : {};
  const num = (v, d, lo, hi) => { v = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(v) && v >= lo ? Math.min(hi, v) : d; };
  const D = INV_EST_DEFAULT;
  const metres = num(q.metres, 0, 0, 100000), perMetre = num(q.perMetre, D.perMetre, 1, 100);
  const boxes = Math.round(num(q.boxes, 0, 0, 1000000)), perBox = num(q.perBox, D.perBox, 1, 200);
  const binders = Math.round(metres * perMetre + boxes * perBox);
  const docs = Math.round(binders * num(q.docsPerBinder, 0, 0, 500));
  const sec = num(q.secPerBinder, D.sec, 1, 600), people = Math.max(1, Math.round(num(q.people, D.people, 1, 50)));
  const setup = num(q.setupHours, D.setupHours, 0, 1000), perDay = num(q.hoursPerDay, D.hoursPerDay, 1, 24), spare = num(q.spare, D.spare, 0, 100);
  // documents take about a third of a binder's time each (one scan, no box)
  const workH = (binders * sec + docs * sec / 3) / 3600 / people;
  const work = binders || docs || boxes, hours = work ? Math.round((workH + setup) * 10) / 10 : 0, days = work ? Math.max(0.5, Math.ceil(hours / perDay * 2) / 2) : 0;
  const boxEst = boxes || (binders ? Math.ceil(binders / perBox) : 0);
  const labels = {binder:Math.ceil(binders * (1 + spare / 100)), box:Math.ceil(boxEst * (1 + spare / 100)), doc:Math.ceil(docs * (1 + spare / 100))};
  const bill = prices ? invBill({binders, boxes:boxEst, docs}, prices) : null;
  return {binders, boxes:boxEst, docs, sec, people, hours, days, labels, bill, perHourBinders:sec ? Math.round(3600 / sec * people) : 0};
}
/** The studio's measured pace: median of the medians of past projects with at least `min` binders (ms), or 0. */
function invPaceHistory(projects, binders, logs, settings, min){
  const v = [];
  (projects || []).forEach(a => { const r = invReport(a, binders, [], logs || [], settings || {}, 120000); if (r.binders >= (min || 20) && r.median_ms > 0) v.push(r.median_ms); });
  return v.length ? Math.round(invMedian(v)) : 0;
}

/* ---------------- v12.14 rescue file: what a phone has not sent yet, carried to the PC by hand ---------------- */
/* {format:'docmap-inv-rescue', v:1, at, device, who, project:{id, code, name}, recs:[record…], photos:{id:dataURL}}.
   Records keep their deterministic ids (inv-<short code>), so importing twice, or after the phone did send, never
   duplicates anything: the newer updated_at wins. */
const INV_RESCUE_FORMAT = 'docmap-inv-rescue';
function invRescueParse(text){
  let j; try { j = JSON.parse(String(text || '')); } catch(e){ return null; }
  if (!j || j.format !== INV_RESCUE_FORMAT || !Array.isArray(j.recs)) return null;
  const recs = j.recs.filter(r => r && typeof r === 'object' && /^inv-[A-Za-z0-9]+$/.test(String(r.id || '')) && (r._type === 'binder' || r._type === 'location'));
  const photos = {}; Object.keys(j.photos || {}).forEach(k => { const v = j.photos[k]; if (/^ph-[A-Za-z0-9-]+$/.test(k) && typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(v)) photos[k] = v; });
  return {at:String(j.at || ''), device:String(j.device || ''), who:String(j.who || ''), project:j.project && typeof j.project === 'object' ? {id:String(j.project.id || ''), code:String(j.project.code || ''), name:String(j.project.name || '')} : {id:'', code:'', name:''}, recs, photos};
}

/* ---------------- v12.15: progress towards the expected total ---------------- */
/** done / target with the time left at the measured pace (median ms between two binders) and the clock time it ends.
    Never breaks: no target → null; no pace yet → no ETA. */
function invProgress(target, done, paceMs, nowMs){
  target = Math.max(0, parseInt(target, 10) || 0); done = Math.max(0, parseInt(done, 10) || 0);
  if (!target) return null;
  const left = Math.max(0, target - done), pct = Math.min(100, Math.round(done / target * 100));
  const ms = paceMs > 0 && left ? Math.round(left * paceMs) : 0, now = nowMs || Date.now();
  return {target, done, left, pct, over:done > target ? done - target : 0, ms, at:ms ? new Date(now + ms).toISOString() : '', mins:ms ? Math.max(1, Math.round(ms / 60000)) : 0};
}
/** «2 h 15 min» / «40 min» (it) — «2 h 15 min» / «40 min» (en): same short form. */
function invMinsText(m){ m = Math.max(0, Math.round(m || 0)); const h = Math.floor(m / 60), r = m % 60; return h ? h + ' h' + (r ? ' ' + r + ' min' : '') : r + ' min'; }
/** v12.15 burst: order of the codes read in one frame (boxes first, then binders in label order); several box labels in
    the same frame are ambiguous and dropped (the binders still count). Returns {codes, boxes_dropped}. */
function invBurstOrder(texts){
  const seen = new Set(), boxes = [], rest = [];
  (texts || []).forEach(tx => { const v = String(tx || '').trim(); if (!v || seen.has(v)) return; seen.add(v);
    const p = typeof invParseScan === 'function' ? invParseScan(v) : null, x = p && invParseCode(p.code);
    if (x && x.kind === 'box') boxes.push(v); else rest.push({v, n:x ? x.n : Infinity}); });
  rest.sort((a, b) => a.n - b.n);
  const codes = (boxes.length === 1 ? boxes : []).concat(rest.map(r => r.v));
  return {codes, boxes_dropped:boxes.length > 1 ? boxes.length : 0};
}
/** v12.15 burst: the spine of one binder in a frame with several = a vertical strip around its QR (full height,
    about twice the QR width, at least 12% of the frame), inside the frame. box = DOMRect-like of the QR. */
function invBurstCrop(box, W, H){
  if (!box || !(W > 0) || !(H > 0) || !(box.width > 0)) return null;
  const cx = box.x + box.width / 2, sw = Math.min(W, Math.max(box.width * 2.2, W * 0.12));
  const x = Math.max(0, Math.min(W - sw, cx - sw / 2));
  return {x:Math.round(x), y:0, w:Math.round(sw), h:Math.round(H)};
}
