/* =====================================================================
   DocMap 2026 — v11 (stream X): physical location tree, pure model (shared by index.html and scan.html)

   The archive is a tree of places: Magazzino › Armadio › Scansia › Scaffale › Scatola (default names,
   configurable, 1..8 levels). The QR label sits on the box (normally the deepest level, but any node can
   have one): that is a "location QR". Binders point to the box they are in with binder.location_id.

   Location record (S.locations[], SQLite table `locations`, server record type 'location', sync type 'location'):
     id          uuid, never changes
     parent_id   id of the parent node, '' = top level (SQLite: NULL)
     level       0-based depth in the tree (derived from the parent chain by locIntegrity)
     kind        level label for this node, '' = the configured level name (S.settings.locLevels[level])
     name        free name ("Archivio seminterrato"), '' = shown as "<kind> <seg>"
     seg         short segment of the code, unique among siblings ("MAG1", "A2", "B04"); editable
     code        full path code = segments joined by '-' ("MAG1-A2-S3-R1-B04"); DERIVED from the segs
                 (locIntegrity), stored for SQLite / CSV / Python, not "content" for sync (like binder.location_code)
     short_code  'dm26L' + 8 chars (SC_ALPHABET): unique, never reused, printed on the location QR.
                 Binder short codes are 'dm26' + 8 chars (12 chars): a location code is 13 chars and always has
                 the 'L' after dm26, so qr7 rows, /q/<code> routes and scans tell them apart by format alone
                 (LOC_SC_RE vs SC_RE).
     short_url   https://qr7.it/<short_code> (derived)
     notes       free text
     sort        integer order among siblings (0 = natural order by seg)
     created_at / updated_at   ISO times (updated_at drives last-write-wins sync, like binders)

   Binder: location_id ('' = not in a location). When set and known, normalizeBinder writes the location's
   code into binder.location_code (02-core binderLocCode), so search, CSV, labels and "Dov'è?" keep working.
   room_code / cabinet_code / shelf_code / sector_code are left untouched.

   Settings: S.settings.locLevels = [{name, prefix}] (absent/empty = LOC_LEVELS_DEFAULT in the UI language),
   S.settings.locLevelsAt (ISO, newer wins in sync).

   Index: locIndex() caches id → record / children / code; it rebuilds when the S.locations array is
   replaced, its length changes or locTouch() was called (call it after editing a record in place).
   ===================================================================== */
'use strict';

const LOC_SC_RE = /^dm26L[A-Za-z0-9]{8}$/;
const LOC_MAX_DEPTH = 8;
const LOC_LEVELS_DEFAULT = [
  {it:'Magazzino', en:'Warehouse', prefix:'MAG'}, {it:'Armadio', en:'Cabinet', prefix:'A'}, {it:'Scansia', en:'Shelving unit', prefix:'S'},
  {it:'Scaffale', en:'Shelf', prefix:'R'}, {it:'Scatola', en:'Box', prefix:'B'}
];
const LOC_IDX = { arr:null, len:-1, ver:0, built:-1, override:null, byId:new Map(), kids:new Map(), code:new Map(), depth:new Map() };

/** Levels in use: [{name, prefix}] (1..8). Custom names from settings, else the defaults in the UI language. */
function locLevels(settings){
  const st = settings || (typeof S !== 'undefined' && S && S.settings) || {}, lang = (typeof S !== 'undefined' && S && S.lang === 'en') ? 'en' : 'it';
  const cust = Array.isArray(st.locLevels) ? st.locLevels.filter(x => x && typeof x === 'object').slice(0, LOC_MAX_DEPTH) : [];
  if (!cust.length) return LOC_LEVELS_DEFAULT.map(d => ({name:d[lang], prefix:d.prefix}));
  return cust.map((x, i) => ({name:String(x.name || '').trim() || ((LOC_LEVELS_DEFAULT[i] || {})[lang]) || ((lang === 'en' ? 'Level ' : 'Livello ') + (i + 1)),
    prefix:locSegClean(x.prefix) || (LOC_LEVELS_DEFAULT[i] || {}).prefix || 'L' + (i + 1)}));
}
function locLevelName(level, settings){ const L = locLevels(settings); const l = L[Math.min(level, L.length - 1)] || L[L.length - 1]; return level < L.length ? l.name : ((typeof S !== 'undefined' && S && S.lang === 'en') ? 'Level ' : 'Livello ') + (level + 1); }
function locLevelPrefix(level, settings){ const L = locLevels(settings); return (L[level] || {}).prefix || 'L' + (level + 1); }
/** Segment text: uppercase, no spaces, no '-' (the path joiner). */
function locSegClean(v){ return String(v == null ? '' : v).normalize('NFKC').trim().toUpperCase().replace(/\s+/g, '').replace(/-+/g, '.').replace(/[^\p{L}\p{N}._/]/gu, '').slice(0, 16); }

function normalizeLocation(l){
  const o = Object.assign({ id:'', parent_id:'', level:0, kind:'', name:'', seg:'', code:'', short_code:'', short_url:'', notes:'', sort:0, created_at:'', updated_at:'' }, l || {});
  ['id', 'parent_id', 'kind', 'name', 'code', 'short_code', 'notes', 'created_at', 'updated_at'].forEach(k => { o[k] = String(o[k] == null ? '' : o[k]).replace(k === 'notes' ? /[ \t]+/g : /\s+/g, ' ').trim(); });
  if (!o.id) o.id = uuid();
  if (o.parent_id === o.id) o.parent_id = '';
  o.level = Math.max(0, Math.min(LOC_MAX_DEPTH - 1, parseInt(o.level, 10) || 0));
  o.sort = parseInt(o.sort, 10) || 0;
  o.seg = locSegClean(o.seg);
  o.short_url = o.short_code ? shortUrl(o.short_code) : '';
  if (!o.created_at) o.created_at = nowISO();
  if (!o.updated_at) o.updated_at = o.created_at;
  return o;
}

/* ---------------- index ---------------- */
function locIndexUse(arr){ LOC_IDX.override = arr || null; LOC_IDX.built = -1; }
function locTouch(){ LOC_IDX.ver++; }
function locArr(){ return LOC_IDX.override || (typeof S !== 'undefined' && S && Array.isArray(S.locations) ? S.locations : []); }
const locSegCmp = (a, b) => (a.sort || 0) - (b.sort || 0) || naturalCmp(a.seg || '', b.seg || '') || naturalCmp(a.name || '', b.name || '');
function locIndex(){
  const arr = locArr(), X = LOC_IDX;
  if (arr === X.arr && arr.length === X.len && X.built === X.ver) return X;
  X.arr = arr; X.len = arr.length; X.built = X.ver;
  X.byId = new Map(); X.kids = new Map(); X.code = new Map(); X.depth = new Map();
  arr.forEach(l => { if (l && l.id && !X.byId.has(l.id)) X.byId.set(l.id, l); });
  X.byId.forEach(l => { const p = l.parent_id && X.byId.has(l.parent_id) && !locIsCycle(X.byId, l) ? l.parent_id : ''; if (!X.kids.has(p)) X.kids.set(p, []); X.kids.get(p).push(l); });
  X.kids.forEach(list => list.sort(locSegCmp));
  const walk = (pid, prefix, d) => (X.kids.get(pid) || []).forEach(l => { const c = prefix ? prefix + '-' + (l.seg || '?') : (l.seg || '?'); X.code.set(l.id, c); X.depth.set(l.id, d); walk(l.id, c, d + 1); });
  walk('', '', 0);
  return X;
}
function locIsCycle(byId, l){ const seen = new Set([l.id]); let p = l.parent_id; while (p){ if (seen.has(p)) return true; seen.add(p); const n = byId.get(p); if (!n) return false; p = n.parent_id; } return false; }
function locById(id){ return id ? locIndex().byId.get(id) || null : null; }
function locChildren(id){ return locIndex().kids.get(id || '') || []; }
/** Full path code of a location id, or null when the id is not in the tree. */
function locCodeFor(id){ if (!id) return null; const X = locIndex(); return X.code.has(id) ? X.code.get(id) : null; }
function locDepth(id){ const X = locIndex(); return X.depth.has(id) ? X.depth.get(id) : 0; }
/** Root → node list of records. */
function locPath(id){ const out = [], X = locIndex(), seen = new Set(); let n = X.byId.get(id); while (n && !seen.has(n.id)){ seen.add(n.id); out.unshift(n); n = n.parent_id ? X.byId.get(n.parent_id) : null; } return out; }
function locKind(l){ return l.kind || locLevelName(l.level || 0); }
function locTitle(l){ return l.name || (locKind(l) + ' ' + (l.seg || '')).trim(); }
function locPathText(id, sep){ return locPath(id).map(locTitle).join(sep || ' › '); }
/** Every descendant id (not the node itself). */
function locDescendants(id){ const out = []; const go = (p) => locChildren(p).forEach(c => { out.push(c.id); go(c.id); }); go(id); return out; }
function locLeafLevel(){ return locLevels().length - 1; }

/* ---------------- codes ---------------- */
function allLocShortCodes(){ const s = new Set(); locArr().forEach(l => { if (l.short_code) s.add(l.short_code); }); return s; }
function newLocShortCode(extra){
  const taken = allLocShortCodes(); (extra || []).forEach(x => taken.add(x));
  let c; do { c = 'dm26L' + randChars(8); } while (taken.has(c));
  return c;
}
/** Next free segment among the children of parentId for a level: prefix + number (deepest level: 2 digits). */
function locNextSeg(parentId, level, prefix, pad){
  prefix = locSegClean(prefix != null ? prefix : locLevelPrefix(level));
  pad = pad != null ? pad : (level >= locLeafLevel() ? 2 : 1);
  const used = new Set(locChildren(parentId).map(c => c.seg));
  let max = 0; used.forEach(s => { const m = s.match(new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '(\\d+)$')); if (m) max = Math.max(max, +m[1]); });
  let n = max + 1, seg; do { seg = prefix + String(n).padStart(pad, '0'); n++; } while (used.has(seg));
  return seg;
}
/** Integrity: unique ids, valid parents (missing / cyclic → top level), level = depth, unique non-empty
    segment among siblings, valid unique short code, derived code + short_url. Returns the number of fixes. */
function locIntegrity(list){
  list = list || (typeof S !== 'undefined' && S ? (S.locations = Array.isArray(S.locations) ? S.locations : []) : []);
  let fixed = 0; const ids = new Set(), byId = new Map();
  list.forEach(l => { if (!l.id || ids.has(l.id)){ l.id = uuid(); fixed++; } ids.add(l.id); byId.set(l.id, l); });
  list.forEach(l => { if (l.parent_id && (!byId.has(l.parent_id) || locIsCycle(byId, l))){ l.parent_id = ''; fixed++; } });
  const kids = new Map(); list.forEach(l => { const p = l.parent_id || ''; if (!kids.has(p)) kids.set(p, []); kids.get(p).push(l); });
  const scs = new Set();
  const walk = (pid, prefix, d) => {
    const segs = new Set();
    (kids.get(pid) || []).slice().sort(locSegCmp).forEach(l => {
      if (l.level !== Math.min(d, LOC_MAX_DEPTH - 1)){ l.level = Math.min(d, LOC_MAX_DEPTH - 1); fixed++; }
      let s = locSegClean(l.seg) || locLevelPrefix(l.level) + '1';
      if (segs.has(s)){ let n = 2; while (segs.has(s + '.' + n)) n++; s = s + '.' + n; }
      if (s !== l.seg){ l.seg = s; fixed++; }
      segs.add(s);
      if (!LOC_SC_RE.test(l.short_code || '') || scs.has(l.short_code)){ l.short_code = newLocShortCode(Array.from(scs)); fixed++; }
      scs.add(l.short_code); l.short_url = shortUrl(l.short_code);
      const c = prefix ? prefix + '-' + s : s; l.code = c;
      walk(l.id, c, d + 1);
    });
  };
  walk('', '', 0);
  locTouch();
  return fixed;
}

/* ---------------- scans: QR text → code ---------------- */
/** What a scanned / typed text points to: {type:'location'|'binder'|'text'|'', code}. Works with the qr7 URL
    (https://qr7.it/<code>), the final destination (…/q/<code>, ?q=<code>), the bare code and with keyboard-wedge
    scanners on another keyboard layout (separators are mangled, the code letters are not). */
function assocParseCode(text){
  const s = String(text == null ? '' : text).trim();
  if (!s) return {type:'', code:''};
  let m = s.match(/(?:^|[^A-Za-z0-9])(dm26L[A-Za-z0-9]{8})(?![A-Za-z0-9])/);
  if (m) return {type:'location', code:m[1]};
  m = s.match(/(?:^|[^A-Za-z0-9])(dm26[A-Za-z0-9]{8})(?![A-Za-z0-9])/);
  if (m) return {type:'binder', code:m[1]};
  if (/^[^\s]{1,40}$/.test(s) && !/[:\/?#=]/.test(s)) return {type:'text', code:s.toUpperCase()};
  return {type:'', code:''};
}
/** Destination URL of a location QR (the studio template with {short_code}; same family as binders). */
function locDest(l, tpl){
  tpl = tpl || (typeof S !== 'undefined' && S && S.settings && S.settings.destTemplate) || '';
  return renderDest(tpl, {short_code:l.short_code, speaking_code:l.code, id:l.id, multi_code:'', company_name:'', room_code:'', cabinet_code:'', shelf_code:'', sector_code:''});
}
function locManifestTags(l){ return ['docmap26', 'location', l.code].filter(Boolean).join(','); }
