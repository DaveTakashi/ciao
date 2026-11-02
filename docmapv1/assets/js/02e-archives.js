/* =====================================================================
   DocMap 2026 — v12 (stream C): archives (clusters), pure model (index.html; no DOM here)

   One studio can keep several separate archives ("Archivio principale", "Storico", "Comune di …", a second
   warehouse…): the data is split into clusters. Binders and location trees belong to exactly one archive.

   Archive record (S.archives[], SQLite table `archives`, sync/server record type 'archive'):
     id           uuid, never changes. The default archive has the fixed id ARCH_DEFAULT_ID.
     name         display name ("Archivio storico"); '' only for the default archive (shown as "Archivio principale")
     code         short code, uppercase letters/digits, 1-8 chars ("ST", "COM"): shown in chips and CSV, unique
     color        #RRGGBB, colour of the chip / switcher dot
     description  free text
     sort         integer order (0 = by name); the default archive is always listed first
     levels       [{name, prefix}] per-archive level names (Configura archivio); [] = the studio-wide
                  S.settings.locLevels (v11 setting, still read and written for the default archive)
     qr_levels    [level index…] levels whose nodes get a QR label (wizard: "QR davanti all'armadio, su ogni
                  scansia, sulle scatole"); [] = the deepest level only (v11 behaviour)
     created_at / updated_at   ISO times; updated_at drives last-write-wins sync like every other record

   Membership ("derive, don't stamp"): binder.archive_id and location.archive_id, '' = the default archive.
     - A location belongs to the archive of its ROOT: locIntegrity (wrapped below) copies the root's archive_id
       onto every descendant, like code / level.
     - A binder placed in a known location belongs to that location's archive (binderArchiveId); otherwise to
       binder.archive_id. Desktop moves keep binder.archive_id equal to it.
   The default archive is VIRTUAL until someone edits it: data from v10 / v11 (archive_id absent) lands there
   without rewriting a single record or timestamp, and nothing new is synced until archives are really used.

   Per-archive levels: locLevels() (02c) called WITHOUT settings returns the levels of the archive in context
   (ARCH_CTX.id, else the archive chosen in the top-bar switcher). locKind / locNextSeg use the archive of the
   node / parent. locLevels(settings) with explicit settings is unchanged (v11 dialogs, scan.html).
   ===================================================================== */
'use strict';

const ARCH_DEFAULT_ID = '00000000-0000-4000-8000-0000000a0001';   // fixed: every device derives the same default archive
const ARCH_DEFAULT_AT = '2000-01-01T00:00:00.000Z';               // virtual default record: older than any real edit (LWW)
const ARCH_COLORS = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#DC2626', '#0891B2', '#DB2777', '#475569'];
const ARCH_CTX = { id:null };   // archive whose levels locLevels() returns (null = the switcher's archive)

Object.assign(I18N.it, { ar_default_name:'Archivio principale' });
Object.assign(I18N.en, { ar_default_name:'Main archive' });

/** Canonical membership value: '' for the default archive (and for '' itself), the id otherwise. */
function archKey(id){ id = String(id == null ? '' : id).trim(); return !id || id === ARCH_DEFAULT_ID ? '' : id; }
function archCodeClean(v){ return String(v == null ? '' : v).normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); }
function normalizeArchive(a){
  const o = Object.assign({ id:'', name:'', code:'', color:'', description:'', sort:0, levels:[], qr_levels:[], created_at:'', updated_at:'' }, a || {});
  ['id', 'name', 'description', 'created_at', 'updated_at'].forEach(k => { o[k] = String(o[k] == null ? '' : o[k]).replace(k === 'description' ? /[ \t]+/g : /\s+/g, ' ').trim(); });
  if (!o.id) o.id = uuid();
  o.code = archCodeClean(o.code);
  o.color = normHex(o.color) || ARCH_COLORS[0];
  o.sort = parseInt(o.sort, 10) || 0;
  const max = typeof LOC_MAX_DEPTH === 'number' ? LOC_MAX_DEPTH : 8;
  o.levels = (Array.isArray(o.levels) ? o.levels : []).filter(x => x && typeof x === 'object').slice(0, max)
    .map(x => ({name:String(x.name || '').replace(/\s+/g, ' ').trim().slice(0, 40), prefix:typeof locSegClean === 'function' ? locSegClean(x.prefix).slice(0, 8) : String(x.prefix || '')}));
  o.qr_levels = Array.from(new Set((Array.isArray(o.qr_levels) ? o.qr_levels : []).map(n => parseInt(n, 10)).filter(n => n >= 0 && n < max))).sort((x, y) => x - y);
  if (!o.created_at) o.created_at = nowISO();
  if (!o.updated_at) o.updated_at = o.created_at;
  return o;
}
/** migrate(): a list of records, valid objects only, one per id. */
function archNormalizeList(list){
  const seen = new Set();
  return (Array.isArray(list) ? list : []).filter(a => a && typeof a === 'object').map(normalizeArchive).filter(a => !seen.has(a.id) && seen.add(a.id));
}
const ARCH_VIRTUAL = { rec:null };
function archVirtualDefault(){ return ARCH_VIRTUAL.rec || (ARCH_VIRTUAL.rec = normalizeArchive({id:ARCH_DEFAULT_ID, name:'', code:'AP', color:'#475569', sort:-1, created_at:ARCH_DEFAULT_AT, updated_at:ARCH_DEFAULT_AT})); }
function archRecords(){ return typeof S !== 'undefined' && S && Array.isArray(S.archives) ? S.archives : []; }
function archDefault(){ return archRecords().find(a => a.id === ARCH_DEFAULT_ID) || archVirtualDefault(); }
function archIsDefault(a){ return !!a && a.id === ARCH_DEFAULT_ID; }
function archName(a){ return !a ? '' : a.name || (archIsDefault(a) ? t('ar_default_name') : a.code || '—'); }
const archCmp = (a, b) => (a.sort || 0) - (b.sort || 0) || naturalCmp(archName(a), archName(b));
/** Every archive, the default one first (virtual when never edited). */
function archList(){ return [archDefault()].concat(archRecords().filter(a => a.id !== ARCH_DEFAULT_ID).slice().sort(archCmp)); }
/** Record of an archive id ('' = default); null for an id not known here (not synced yet). */
function archById(id){ const k = archKey(id); return !k ? archDefault() : archRecords().find(a => a.id === k) || null; }
function archMulti(){ return archList().length > 1; }
/** Archive chosen in the top-bar switcher: '' = all archives (S.archiveSel is '' | ARCH_DEFAULT_ID | id). */
function archSelected(){ const v = typeof S !== 'undefined' && S ? String(S.archiveSel || '') : ''; return v && archById(v) ? v : ''; }
/** Archive where new things go (new binder, new location root): the switcher's archive, the default one for "all". */
function archCurrentId(){ return archKey(archSelected()); }
function archWithCtx(id, fn){ const prev = ARCH_CTX.id; ARCH_CTX.id = archKey(id); try { return fn(); } finally { ARCH_CTX.id = prev; } }

/** Archive of a location = archive of its root. */
function locArchiveId(l){
  if (!l) return '';
  if (typeof locPath !== 'function') return archKey(l.archive_id);
  const p = locPath(l.id); return archKey((p[0] || l).archive_id);
}
/** Effective archive of a binder: the one of its location when it is placed in a known box, else binder.archive_id. */
function binderArchiveId(b){
  if (!b) return '';
  if (b.location_id && typeof locById === 'function'){ const l = locById(b.location_id); if (l) return locArchiveId(l); }
  return archKey(b.archive_id);
}
/** Archive reference typed in a CSV / Excel column (id, code or name, any case) → id key ('' = default), null = unknown. */
function archResolveRef(v){
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); if (!s) return '';
  const low = s.toLowerCase(), list = archList();
  const hit = list.find(a => a.id === s) || list.find(a => a.code && a.code === s.toUpperCase())
    || list.find(a => archName(a).toLowerCase() === low) || (/^(archivio principale|main archive|principale|default)$/i.test(s) ? archDefault() : null);
  return hit ? archKey(hit.id) : null;
}
/** A free short code for a new archive, from its name ("Archivio storico" → "AS", taken → "AS2"). */
function archSuggestCode(name, excludeId){
  const taken = new Set(archList().filter(a => a.id !== excludeId).map(a => a.code));
  const words = String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9]+/).filter(w => w && !/^(di|del|della|dei|de|e|il|lo|la|the|of|and)$/i.test(w));
  let base = archCodeClean(words.length > 1 ? words.slice(0, 3).map(w => w[0]).join('') : (words[0] || 'AR').slice(0, 3)) || 'AR';
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++){ const c = (base.slice(0, 6) + n); if (!taken.has(c)) return c; }
  return base + Date.now() % 100;
}

/* ---------------- per-archive levels (wraps 02c-locations.js) ---------------- */
/** Level list of an archive: its own levels, or null = the studio-wide setting. */
function archOwnLevels(id){ const a = archById(id); return a && a.levels && a.levels.length ? a.levels : null; }
const _archLocLevelsBase = locLevels;
locLevels = function(settings){
  if (settings) return _archLocLevelsBase(settings);
  const lv = archOwnLevels(ARCH_CTX.id != null ? ARCH_CTX.id : archCurrentId());
  return lv ? _archLocLevelsBase({locLevels:lv}) : _archLocLevelsBase();
};
/** Level names of a node come from the archive of the node. */
locKind = function(l){ return l.kind || archWithCtx(locArchiveId(l), () => locLevelName(l.level || 0)); };
const _archLocNextSegBase = locNextSeg;
locNextSeg = function(parentId, level, prefix, pad){
  const p = parentId && typeof locById === 'function' ? locById(parentId) : null;
  return archWithCtx(p ? locArchiveId(p) : (ARCH_CTX.id != null ? ARCH_CTX.id : archCurrentId()), () => _archLocNextSegBase(parentId, level, prefix, pad));
};
/** locIntegrity also derives archive_id of every node from its root (returns the number of fixes, as before). */
const _archLocIntegrityBase = locIntegrity;
locIntegrity = function(list){
  let fixed = _archLocIntegrityBase(list);
  list = list || (typeof S !== 'undefined' && S ? S.locations : []) || [];
  const byId = new Map(list.map(l => [l.id, l])), memo = new Map();
  const rootArch = (l) => { if (memo.has(l.id)) return memo.get(l.id); const seen = new Set(); let n = l; while (n.parent_id && byId.has(n.parent_id) && !seen.has(n.id)){ seen.add(n.id); n = byId.get(n.parent_id); } const a = archKey(n.archive_id); memo.set(l.id, a); return a; };
  list.forEach(l => { const a = rootArch(l); if ((l.archive_id || '') !== a){ l.archive_id = a; fixed++; } });
  if (typeof locTouch === 'function') locTouch();
  return fixed;
};

/* ---------------- "Configura archivio" templates ---------------- */
/* n = how many inside each node of the level above (first level: how many to create), qr = gets a QR label. */
const ARCH_TEMPLATES = [
  {id:'studio', icon:'archive', name:{it:'Studio', en:'Office'}, desc:{it:'Stanze, armadi, ripiani e scatole dello studio.', en:'Rooms, cabinets, shelves and boxes of the office.'},
    levels:[{it:'Stanza', en:'Room', prefix:'ST', n:1, qr:false}, {it:'Armadio', en:'Cabinet', prefix:'A', n:2, qr:true}, {it:'Ripiano', en:'Shelf', prefix:'R', n:4, qr:true}, {it:'Scatola', en:'Box', prefix:'B', n:3, qr:true}]},
  {id:'warehouse', icon:'warehouse', name:{it:'Magazzino', en:'Warehouse'}, desc:{it:'Un deposito grande: corsie, scaffali, ripiani e scatole.', en:'A large storage: aisles, racks, shelves and boxes.'},
    levels:[{it:'Magazzino', en:'Warehouse', prefix:'MAG', n:1, qr:false}, {it:'Corsia', en:'Aisle', prefix:'C', n:2, qr:true}, {it:'Scaffale', en:'Rack', prefix:'S', n:3, qr:true}, {it:'Ripiano', en:'Shelf', prefix:'R', n:4, qr:false}, {it:'Scatola', en:'Box', prefix:'B', n:4, qr:true}]},
  {id:'public', icon:'layers', name:{it:'Ente / Comune', en:'Public body'}, desc:{it:'Deposito d\'archivio con scaffali, palchetti e faldoni-scatola.', en:'Records depot with racks, shelf boards and box files.'},
    levels:[{it:'Deposito', en:'Depot', prefix:'DEP', n:1, qr:false}, {it:'Scaffale', en:'Rack', prefix:'S', n:4, qr:true}, {it:'Palchetto', en:'Shelf board', prefix:'P', n:5, qr:false}, {it:'Faldone-scatola', en:'Box file', prefix:'F', n:6, qr:true}]},
  {id:'custom', icon:'sliders', name:{it:'Personalizzato', en:'Custom'}, desc:{it:'Parti dai livelli attuali e cambia nomi, prefissi e quantità.', en:'Start from the current levels and change names, prefixes and quantities.'}, levels:null}
];
function archTemplate(id){ return ARCH_TEMPLATES.find(x => x.id === id) || null; }
