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
  o.mode = o.mode === 'capture' ? 'capture' : 'box';
  o.box_to = Math.max(0, Math.min(INV_MAX, parseInt(o.box_to, 10) || 0));
  o.binder_to = Math.max(0, Math.min(INV_MAX, parseInt(o.binder_to, 10) || 0));
  o.batches = (Array.isArray(o.batches) ? o.batches : []).filter(b => b && typeof b === 'object').map(b => ({id:String(b.id || uuid()), kind:b.kind === 'box' ? 'box' : 'binder',
    from:parseInt(b.from, 10) || 1, to:parseInt(b.to, 10) || 0, at:String(b.at || ''), printed_at:String(b.printed_at || ''), format:String(b.format || '')}));
  o.tags = invNormTags(o.tags);
  o.year_from = invYear(o.year_from); o.year_to = invYear(o.year_to);
  if (o.year_from && o.year_to && o.year_from > o.year_to){ const x = o.year_from; o.year_from = o.year_to; o.year_to = x; }
  o.ai = o.ai !== false;
  o.auto_confirm = Math.max(0.5, Math.min(1, +o.auto_confirm || INV_AUTO_CONFIRM));
  o.notes = String(o.notes || '').slice(0, 2000);
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
function invGrabFrame(src, max, q){
  const w = src.videoWidth || src.width, h = src.videoHeight || src.height; if (!w || !h) return '';
  const k = Math.min(1, (max || 1280) / Math.max(w, h)), cv = document.createElement('canvas');
  cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
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

