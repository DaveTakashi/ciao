/* =====================================================================
   DocMap 2026 — Local SQLite database (sql.js / WebAssembly, no server)
   - Working copy kept in IndexedDB (survives reloads, works from file://)
   - Live tables mirror the archive after every change
   - Named sessions (snapshots) stored inside the same .sqlite file
   - Download / open .sqlite files; on Chrome/Edge, link a file on disk
     and save to it automatically (File System Access API)
   ===================================================================== */
const DB_SCHEMA_VERSION = 6;   // 2: binders.multi_code + photos table · 3: place/year/extra codes/shelf colour + clients table · 4: binders.contacts/notes + contents_items.status · 5: activity_log table (06e-log.js) · 6: binders.color_locked (02b-colors.js)
const DB = { SQL:null, db:null, ready:false, error:null, version:'', handle:null, handleName:'', handlePerm:'prompt', lastSync:null, lastFileSave:null, timer:null, busy:false, consoleSql:'', consoleResult:null };
const IDB_NAME = 'docmap_v26_sqlite', IDB_STORE = 'kv';

function idbOpen(){
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('IndexedDB not available'));
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbGet(key){ const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction(IDB_STORE, 'readonly'); const q = tx.objectStore(IDB_STORE).get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbSet(key, val){ const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction(IDB_STORE, 'readwrite'); tx.objectStore(IDB_STORE).put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function idbDel(key){ const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction(IDB_STORE, 'readwrite'); tx.objectStore(IDB_STORE).delete(key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
function b64ToBytes(b64){ const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

const DB_DDL = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS binders(
  id TEXT PRIMARY KEY,
  speaking_code TEXT NOT NULL UNIQUE,
  multi_code TEXT,
  company_name TEXT, company_city TEXT, category TEXT, color_hex TEXT, binder_title TEXT,
  ref_year TEXT, extra_codes TEXT, shelf_color TEXT, contacts TEXT, notes TEXT,
  room_code TEXT, cabinet_code TEXT, shelf_code TEXT, sector_code TEXT, location_code TEXT,
  archive_state TEXT CHECK (archive_state IN ('CURRENT','HISTORICAL','CHECKED_OUT')),
  tags TEXT,
  short_code TEXT UNIQUE, short_url TEXT,
  final_destination TEXT, final_destination_custom TEXT,
  selected_for_print INTEGER DEFAULT 0,
  created_at TEXT, updated_at TEXT,
  color_locked INTEGER DEFAULT 0);   -- v6: 1 = spine colour picked by hand, never recoloured automatically
CREATE TABLE IF NOT EXISTS contents_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  binder_id TEXT NOT NULL REFERENCES binders(id) ON DELETE CASCADE,
  position INTEGER, year TEXT, description TEXT,
  status TEXT DEFAULT 'archive');   -- archive | in_use | client
CREATE INDEX IF NOT EXISTS ix_contents_binder ON contents_items(binder_id);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS label_presets(id TEXT PRIMARY KEY, name TEXT, geometry_json TEXT);
CREATE TABLE IF NOT EXISTS sessions(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, note TEXT,
  created_at TEXT, binder_count INTEGER, workspace_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS photos(
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('binder','cabinet')),
  owner_key TEXT NOT NULL,
  mime TEXT, data BLOB NOT NULL, width INTEGER, height INTEGER,
  caption TEXT, marks_json TEXT, created_at TEXT);
CREATE INDEX IF NOT EXISTS ix_photos_owner ON photos(owner_type, owner_key);
CREATE TABLE IF NOT EXISTS clients(
  id TEXT PRIMARY KEY, multi_code TEXT, name TEXT NOT NULL,
  address TEXT, cap TEXT, city TEXT, province TEXT, type TEXT, category TEXT, notes TEXT);
CREATE INDEX IF NOT EXISTS ix_clients_multi ON clients(multi_code);
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, action TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS activity_log(
  id TEXT PRIMARY KEY, at TEXT NOT NULL, who TEXT, action TEXT NOT NULL,
  target_type TEXT, target_id TEXT, target_code TEXT,
  summary TEXT, details_json TEXT, source TEXT DEFAULT 'ui');   -- not mirrored from S: lives here (+ workspace JSON backups), newest 20000 kept
CREATE INDEX IF NOT EXISTS ix_activity_at ON activity_log(at);
DROP VIEW IF EXISTS v_manifest_qr7;
CREATE VIEW v_manifest_qr7 AS
  SELECT short_code, short_url, final_destination, 'docmap26,' || speaking_code AS tags FROM binders ORDER BY speaking_code;
`;

function dbQuery(sql, params, db){
  db = db || DB.db;
  const st = db.prepare(sql); const rows = [];
  try { if (params) st.bind(params); while (st.step()) rows.push(st.getAsObject()); } finally { st.free(); }
  return rows;
}
function dbScalar(sql, params, db){ const r = dbQuery(sql, params, db)[0]; return r ? r[Object.keys(r)[0]] : null; }
function dbMigrate(db){
  db = db || DB.db;
  db.exec(DB_DDL);
  // additive migrations for databases created by older versions
  const cols = dbQuery('PRAGMA table_info(binders)', null, db).map(r => r.name);
  ['multi_code','company_city','ref_year','extra_codes','shelf_color','contacts','notes'].forEach(c => { if (!cols.includes(c)) db.exec('ALTER TABLE binders ADD COLUMN ' + c + ' TEXT'); });
  if (!cols.includes('color_locked')) db.exec('ALTER TABLE binders ADD COLUMN color_locked INTEGER DEFAULT 0');   // v6
  if (!dbQuery('PRAGMA table_info(contents_items)', null, db).some(r => r.name === 'status')) db.exec("ALTER TABLE contents_items ADD COLUMN status TEXT DEFAULT 'archive'");
  db.exec('CREATE INDEX IF NOT EXISTS ix_binders_multi ON binders(multi_code)');
  db.run("INSERT OR REPLACE INTO meta(key,value) VALUES ('app','DocMap26'),('schema_version',?)", [String(DB_SCHEMA_VERSION)]);
}
function dbLog(action, detail){ try { DB.db.run('INSERT INTO audit_log(at,action,detail) VALUES (?,?,?)', [nowISO(), action, detail || '']); DB.db.run('DELETE FROM audit_log WHERE id <= (SELECT MAX(id) - 500 FROM audit_log)'); } catch(e){} }

async function dbInit(){
  try {
    if (typeof initSqlJs !== 'function' || !window.DM_SQL_WASM_B64) throw new Error('sql.js non caricato (vendor/sql-wasm.js)');
    DB.SQL = await initSqlJs({ wasmBinary: b64ToBytes(window.DM_SQL_WASM_B64) });
    let bytes = null;
    try { bytes = await idbGet('db'); } catch(e){}
    try { DB.db = bytes ? new DB.SQL.Database(new Uint8Array(bytes)) : new DB.SQL.Database(); dbMigrate(); }
    catch(e){ DB.db = new DB.SQL.Database(); dbMigrate(); toast('SQLite: copia locale danneggiata, ricreata dai dati correnti', 'warn', 6000); }
    DB.version = dbScalar('SELECT sqlite_version()');
    try { DB.handle = await idbGet('handle') || null; if (DB.handle){ DB.handleName = DB.handle.name; DB.handlePerm = await DB.handle.queryPermission({mode:'readwrite'}); } } catch(e){ DB.handle = null; }
    DB.ready = true;
    dbSyncFromState('boot');
    await dbPersist();
  } catch(e){
    DB.error = String(e && e.message || e);
    console.error(e);
  }
  if (S && S.view === 'database') renderView();
}

/* Mirror the in-memory state into the live tables (state stays the source of truth). */
function dbSyncFromState(reason){
  if (!DB.ready) return;
  const db = DB.db;
  ensureIntegrity();
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM contents_items; DELETE FROM binders; DELETE FROM settings; DELETE FROM label_presets; DELETE FROM clients;');
    const ins = db.prepare('INSERT INTO binders(id,speaking_code,multi_code,company_name,category,color_hex,binder_title,room_code,cabinet_code,shelf_code,sector_code,location_code,archive_state,tags,short_code,short_url,final_destination,final_destination_custom,selected_for_print,created_at,updated_at,company_city,ref_year,extra_codes,shelf_color,contacts,notes,color_locked) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const ci = db.prepare('INSERT INTO contents_items(binder_id,position,year,description,status) VALUES (?,?,?,?,?)');
    S.binders.forEach(b => {
      ins.run([b.id, b.speaking_code, b.multi_code || null, b.company_name, b.category, b.color_hex, b.binder_title, b.room_code, b.cabinet_code, b.shelf_code, b.sector_code, b.location_code, b.archive_state, b.tags, b.short_code || null, b.short_url, destFor(b), b.final_destination || '', b.selected_for_print ? 1 : 0, b.created_at || '', b.updated_at || '', b.company_city || '', b.ref_year || '', b.extra_codes || '', b.shelf_color || '', b.contacts || '', b.notes || '', b.color_locked ? 1 : 0]);
      b.contents_items.forEach((it, i) => ci.run([b.id, i, it.year, it.description, normCiStatus(it.status)]));
    });
    ins.free(); ci.free();
    const st = db.prepare('INSERT INTO settings(key,value) VALUES (?,?)');
    [['settings', S.settings], ['print', S.print], ['usedSlots', S.usedSlots], ['lang', S.lang]].forEach(([k, v]) => st.run([k, JSON.stringify(v)]));
    st.free();
    const pp = db.prepare('INSERT INTO label_presets(id,name,geometry_json) VALUES (?,?,?)');
    (S.customPresets || []).forEach(p => pp.run([p.id, p.name, JSON.stringify(p)]));
    pp.free();
    const cl = db.prepare('INSERT OR REPLACE INTO clients(id,multi_code,name,address,cap,city,province,type,category,notes) VALUES (?,?,?,?,?,?,?,?,?,?)');
    (S.clients || []).forEach(c => cl.run([c.id, c.multi_code, c.name, c.address, c.cap, c.city, c.province, c.type, c.category, c.notes]));
    cl.free();
    db.run("INSERT OR REPLACE INTO meta(key,value) VALUES ('synced_at',?),('studio',?)", [nowISO(), S.settings.studioName || '']);
    db.exec('COMMIT');
    DB.lastSync = nowISO();
    if (reason && reason !== 'auto') dbLog('sync', reason);
  } catch(e){
    try { db.exec('ROLLBACK'); } catch(e2){}
    console.error('SQLite sync', e);
    toast('SQLite: ' + e.message, 'err', 6000);
  }
}
function dbScheduleSync(){
  if (!DB.ready) return;
  clearTimeout(DB.timer);
  DB.timer = setTimeout(async () => { dbSyncFromState('auto'); await dbPersist(); if (S.view === 'database') dbRefreshStatus(); }, 700);
}
/* Save the working copy to IndexedDB and, if linked and permitted, to the file on disk. */
async function dbPersist(){
  if (!DB.ready) return;
  const bytes = DB.db.export();
  DB.size = bytes.length;
  try { await idbSet('db', bytes); } catch(e){ console.warn('IndexedDB', e); }
  if (DB.handle && DB.handlePerm === 'granted'){
    try { const w = await DB.handle.createWritable(); await w.write(bytes); await w.close(); DB.lastFileSave = nowISO(); }
    catch(e){ DB.handlePerm = 'prompt'; console.warn('file save', e); }
  }
}

/* Read a full workspace object out of any DocMap .sqlite database (live tables). */
function dbReadWorkspace(db){
  const binders = dbQuery('SELECT * FROM binders ORDER BY speaking_code', null, db);
  const items = dbQuery('SELECT * FROM contents_items ORDER BY binder_id, position', null, db);   // SELECT *: files from older versions have no status column
  const byB = {};
  items.forEach(i => (byB[i.binder_id] = byB[i.binder_id] || []).push({year:i.year || '', description:i.description || '', status:normCiStatus(i.status)}));
  const settings = {};
  dbQuery('SELECT key, value FROM settings', null, db).forEach(r => { try { settings[r.key] = JSON.parse(r.value); } catch(e){} });
  let clients = [];
  try { clients = dbQuery('SELECT * FROM clients ORDER BY name', null, db); } catch(e){}
  const presets = dbQuery('SELECT geometry_json FROM label_presets', null, db).map(r => { try { return JSON.parse(r.geometry_json); } catch(e){ return null; } }).filter(Boolean);
  return {
    clients: clients.map(c => ({id:c.id, multi_code:c.multi_code || '', name:c.name || '', address:c.address || '', cap:c.cap || '', city:c.city || '', province:c.province || '', type:c.type || '', category:c.category || '', notes:c.notes || ''})),
    settings: settings.settings, print: settings.print, usedSlots: settings.usedSlots, lang: settings.lang, customPresets: presets,
    binders: binders.map(b => ({ id:b.id, speaking_code:b.speaking_code, multi_code:b.multi_code || '', company_name:b.company_name, company_city:b.company_city || '', ref_year:b.ref_year || '', extra_codes:b.extra_codes || '', shelf_color:b.shelf_color || '', contacts:b.contacts || '', notes:b.notes || '', category:b.category, color_hex:b.color_hex, binder_title:b.binder_title,
      room_code:b.room_code, cabinet_code:b.cabinet_code, shelf_code:b.shelf_code, sector_code:b.sector_code, archive_state:b.archive_state, tags:b.tags,
      short_code:b.short_code, final_destination:b.final_destination_custom || '', selected_for_print: !!b.selected_for_print, color_locked: !!b.color_locked, created_at:b.created_at, updated_at:b.updated_at,
      contents_items: byB[b.id] || [] }))
  };
}
/* Replace the whole working state with a workspace object (from a session or a .sqlite file). */
function applyWorkspaceObject(W){
  S.binders = (W.binders || []).map(normalizeBinder);
  ensureIntegrity();
  if (Array.isArray(W.clients)) S.clients = W.clients.map(normalizeClient);
  if (W.settings) S.settings = Object.assign(defaultState().settings, W.settings);
  if (W.settings && !W.settings.colorMode) colorLockLegacy(S.binders, S.settings);   // pre-v10 workspace: lock hand-picked colours (02b-colors.js)
  if (W.print) S.print = Object.assign(defaultState().print, W.print, {geometry:Object.assign(presetGeo(W.print.presetId, S.customPresets), W.print.geometry || {})});
  if (Array.isArray(W.customPresets)) S.customPresets = W.customPresets;
  if (W.usedSlots && typeof W.usedSlots === 'object') S.usedSlots = W.usedSlots;
  if (W.lang === 'it' || W.lang === 'en') S.lang = W.lang;
}

/* ---------------- Sessions ---------------- */
function dbSessions(){ return DB.ready ? dbQuery('SELECT id, name, note, created_at, binder_count, length(workspace_json) AS size FROM sessions ORDER BY id DESC') : []; }
async function dbSaveSession(name, note){
  if (!DB.ready) return null;
  dbSyncFromState('session');
  DB.db.run('INSERT INTO sessions(name, note, created_at, binder_count, workspace_json) VALUES (?,?,?,?,?)', [name, note || '', nowISO(), S.binders.length, workspaceJSON()]);
  const id = dbScalar('SELECT last_insert_rowid()');
  dbLog('session_save', name);
  await dbPersist();
  return id;
}
function dbSessionWorkspace(id){ const r = dbQuery('SELECT workspace_json FROM sessions WHERE id = ?', [id])[0]; return r ? JSON.parse(r.workspace_json) : null; }
async function dbRestoreSession(id){
  const W = dbSessionWorkspace(id); if (!W) return false;
  applyWorkspaceObject(W);
  dbLog('session_restore', String(id));
  commit(); renderAll();
  return true;
}
async function dbDeleteSession(id){ DB.db.run('DELETE FROM sessions WHERE id = ?', [id]); dbLog('session_delete', String(id)); await dbPersist(); }

/* ---------------- Files ---------------- */
function downloadBytes(name, bytes, mime){
  const blob = new Blob([bytes], {type:mime || 'application/octet-stream'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
async function dbDownload(){
  if (!DB.ready) return;
  dbSyncFromState('download');
  await dbPersist();
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const name = 'docmap_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + '.sqlite';
  downloadBytes(name, DB.db.export(), 'application/x-sqlite3');
  markExported(name); toast(t('ex_done', {f:name}));
}
function dbValidate(db){
  const tables = dbQuery("SELECT name FROM sqlite_master WHERE type='table'", null, db).map(r => r.name);
  return tables.includes('binders') && tables.includes('contents_items');
}
async function dbOpenBytes(bytes, label){
  let db;
  try { db = new DB.SQL.Database(new Uint8Array(bytes)); } catch(e){ toast(t('db_bad_file') + ' ' + e.message, 'err', 6000); return; }
  if (!dbValidate(db)){ db.close(); toast(t('db_bad_file'), 'err', 6000); return; }
  const W = dbReadWorkspace(db);
  const nSessions = dbScalar('SELECT COUNT(*) FROM sessions', null, db) || 0;
  confirmAction({ danger:true, okLabel:t('db_open_ok'), detail:t('db_open_detail', {f:label, n:W.binders.length, s:nSessions, c:S.binders.length}), onOk: async () => {
    undoPoint();
    try { DB.db.close(); } catch(e){}
    DB.db = db; dbMigrate();
    applyWorkspaceObject(W);
    dbLog('open_file', label);
    logAttach(); logAct('db.open', {type:'file', id:'', code:label}, 'Aperto il database ' + label + ' (' + W.binders.length + ' faldoni)', {file:label, binders:W.binders.length, sessions:nSessions}, 'restore');
    commit(); renderAll();
    undoToast(t('db_opened', {n:W.binders.length}));
  }});
}
const fsaSupported = () => typeof window.showSaveFilePicker === 'function';
async function dbLinkFile(){
  if (!fsaSupported()){ toast(t('db_fsa_no'), 'warn', 6000); return; }
  try {
    const h = await window.showSaveFilePicker({ suggestedName:'docmap.sqlite', types:[{description:'SQLite database', accept:{'application/x-sqlite3':['.sqlite','.db']}}] });
    DB.handle = h; DB.handleName = h.name; DB.handlePerm = 'granted';
    try { await idbSet('handle', h); } catch(e){}
    dbSyncFromState('link'); await dbPersist();
    dbLog('link_file', h.name);
    toast(t('db_linked', {f:h.name}), 'ok', 5000); renderView();
  } catch(e){ if (e && e.name !== 'AbortError') toast(String(e.message || e), 'err'); }
}
async function dbOpenLinkedFile(){
  if (typeof window.showOpenFilePicker !== 'function'){ $('#file-sqlite').click(); return; }
  try {
    const [h] = await window.showOpenFilePicker({ types:[{description:'SQLite database', accept:{'application/x-sqlite3':['.sqlite','.db','.sqlite3']}}] });
    const f = await h.getFile();
    const perm = await h.requestPermission({mode:'readwrite'});
    if (perm === 'granted'){ DB.handle = h; DB.handleName = h.name; DB.handlePerm = 'granted'; try { await idbSet('handle', h); } catch(e){} }
    dbOpenBytes(await f.arrayBuffer(), f.name);
  } catch(e){ if (e && e.name !== 'AbortError') toast(String(e.message || e), 'err'); }
}
async function dbReauth(){
  if (!DB.handle) return;
  try { DB.handlePerm = await DB.handle.requestPermission({mode:'readwrite'}); if (DB.handlePerm === 'granted'){ await dbPersist(); toast(t('db_linked', {f:DB.handleName})); } renderView(); } catch(e){ toast(String(e.message || e), 'err'); }
}
async function dbUnlink(){ DB.handle = null; DB.handleName = ''; DB.handlePerm = 'prompt'; try { await idbDel('handle'); } catch(e){} renderView(); }

/* ---------------- Read-only SQL console ---------------- */
const SQL_EXAMPLES = [
  ['db_ex_rooms', "SELECT room_code AS stanza, cabinet_code AS armadio, COUNT(*) AS faldoni\nFROM binders GROUP BY room_code, cabinet_code ORDER BY 1, 2;"],
  ['db_ex_manifest', "SELECT * FROM v_manifest_qr7;"],
  ['db_ex_year', "SELECT b.speaking_code, b.company_name, c.year, c.description\nFROM contents_items c JOIN binders b ON b.id = c.binder_id\nWHERE c.year = '2025' ORDER BY b.speaking_code, c.position;"],
  ['db_ex_multi', "SELECT multi_code AS codice_multi, company_name AS cliente, COUNT(*) AS faldoni,\n       group_concat(speaking_code, ', ') AS codici\nFROM binders WHERE multi_code IS NOT NULL AND multi_code <> ''\nGROUP BY multi_code, company_name ORDER BY multi_code;"],
  ['db_ex_clients', "SELECT c.multi_code AS codice_multi, c.name AS cliente, c.city AS localita, COUNT(b.id) AS faldoni\nFROM clients c LEFT JOIN binders b ON b.multi_code = c.multi_code OR lower(b.company_name) = lower(c.name)\nGROUP BY c.id ORDER BY faldoni, c.name;"],
  ['db_ex_photos', "SELECT b.speaking_code, b.location_code, COUNT(p.id) AS foto\nFROM binders b LEFT JOIN photos p ON p.owner_type = 'binder' AND p.owner_key = b.id\nGROUP BY b.id ORDER BY foto DESC, b.speaking_code;"],
  ['db_ex_out', "SELECT speaking_code, company_name, location_code, updated_at\nFROM binders WHERE archive_state = 'CHECKED_OUT';"]
];
function dbRunConsole(sql){
  const q = String(sql || '').trim().replace(/;+\s*$/, '');
  DB.consoleSql = sql;
  if (!/^(select|with|pragma\s+table_info|explain)\b/i.test(q) || /;\s*\S/.test(q)){ DB.consoleResult = {error:t('db_ro')}; return; }
  // Defence in depth: the regex above is not a parser (e.g. "WITH x AS (...) DELETE ..."), so SQLite itself refuses writes.
  try { DB.db.exec('PRAGMA query_only = ON'); } catch(e){}
  try {
    const res = DB.db.exec(q + '\nLIMIT 500'.repeat(/\blimit\b/i.test(q) || /^pragma|^explain/i.test(q) ? 0 : 1));
    DB.consoleResult = res[0] ? {columns:res[0].columns, values:res[0].values} : {columns:[], values:[]};
  } catch(e){ DB.consoleResult = {error:/readonly|read-only|query_only/i.test(e.message) ? t('db_ro') : e.message}; }
  finally { try { DB.db.exec('PRAGMA query_only = OFF'); } catch(e){} }
}

/* ---------------- View ---------------- */
function dbStats(){
  if (!DB.ready) return null;
  return { binders:dbScalar('SELECT COUNT(*) FROM binders'), items:dbScalar('SELECT COUNT(*) FROM contents_items'), sessions:dbScalar('SELECT COUNT(*) FROM sessions'),
    size: DB.size || 0 };
}
function dbStatusHTML(){
  if (DB.error) return '<div class="danger-box">' + ic('alert') + '<div><b>' + esc(t('db_err')) + '</b><br><span class="small mono">' + esc(DB.error) + '</span></div></div>';
  if (!DB.ready) return '<div class="info-box">' + ic('info') + '<div>' + esc(t('db_loading')) + '</div></div>';
  const st = dbStats();
  return '<div class="grid g4" style="gap:10px">' + [[st.binders, t('k_total')], [st.items, t('db_items')], [st.sessions, t('db_sessions')], [Math.max(1, Math.round(st.size / 1024)) + ' KB', t('db_size')]]
      .map(([v, k]) => '<div class="kpi" style="border:1px solid var(--border);border-radius:10px"><div class="v" style="font-size:22px">' + esc(v) + '</div><div class="k">' + esc(k) + '</div></div>').join('') + '</div>' +
    '<div class="small muted" style="margin-top:10px">SQLite <span class="mono">' + esc(DB.version) + '</span> • ' + esc(t('db_where')) + ' • ' + esc(t('db_last_sync', {d:fmtDate(DB.lastSync, true) || '—'})) + '</div>';
}
function dbRefreshStatus(){ const el = $('#db-status'); if (el) el.innerHTML = dbStatusHTML(); }
function viewDatabase(){
  const sessions = dbSessions();
  const fileBox = !fsaSupported()
    ? '<div class="hint">' + esc(t('db_fsa_no')) + '</div>'
    : DB.handle
      ? '<div class="' + (DB.handlePerm === 'granted' ? 'info-box' : 'warn-box') + ' small">' + ic(DB.handlePerm === 'granted' ? 'check' : 'alert') + '<div><b class="mono">' + esc(DB.handleName) + '</b><br>' + esc(DB.handlePerm === 'granted' ? t('db_linked_ok', {d:fmtDate(DB.lastFileSave, true) || '—'}) : t('db_linked_perm')) +
          '<div class="row" style="margin-top:8px">' + (DB.handlePerm !== 'granted' ? '<button class="btn btn-sm btn-amber" data-a="db-reauth">' + ic('refresh') + esc(t('db_reauth')) + '</button>' : '') + '<button class="btn btn-sm" data-a="db-unlink">' + ic('x') + esc(t('db_unlink')) + '</button></div></div></div>'
      : '<button class="btn btn-lg btn-dark" data-a="db-link">' + ic('link') + esc(t('db_link')) + '</button><div class="hint">' + esc(t('db_link_d')) + '</div>';
  const res = DB.consoleResult;
  const resHTML = !res ? '' : res.error ? '<div class="err-t" style="margin-top:8px">' + esc(res.error) + '</div>'
    : '<div class="tbl-wrap" style="max-height:320px;margin-top:10px;border:1px solid var(--border);border-radius:10px"><table class="tbl"><thead><tr>' + res.columns.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
      (res.values.length ? res.values.map(r => '<tr>' + r.map(v => '<td class="small">' + esc(v) + '</td>').join('') + '</tr>').join('') : '<tr><td class="muted small" colspan="' + Math.max(1, res.columns.length) + '">0</td></tr>') + '</tbody></table></div><div class="tiny muted" style="margin-top:4px">' + res.values.length + ' righe</div>';
  return '<div class="page-h"><div><h1>' + esc(t('db_h')) + helpDot('session') + '</h1><p>' + esc(t('db_p')) + '</p></div>' +
      '<div class="row"><button class="btn btn-lg btn-primary" data-a="db-download"' + (DB.ready ? '' : ' disabled') + '>' + ic('download') + esc(t('db_download')) + '</button></div></div>' +
    '<div class="grid g2">' +
      '<div class="stack" style="gap:16px">' +
        '<div class="card card-p"><h2>' + esc(t('db_status')) + '</h2><div id="db-status" style="margin-top:12px">' + dbStatusHTML() + '</div></div>' +
        '<div class="card card-p stack"><h2>' + esc(t('db_save_h')) + '</h2><p class="card-sub" style="margin:0">' + esc(t('db_save_d')) + '</p>' +
          '<div class="grid g2"><div class="field"><label for="db-session-name">' + esc(t('db_s_name')) + '</label><input class="inp" id="db-session-name" placeholder="' + esc(t('db_s_name_ph')) + '"></div>' +
          '<div class="field"><label for="db-session-note">' + esc(t('db_s_note')) + '</label><input class="inp" id="db-session-note" placeholder="' + esc(t('db_s_note_ph')) + '"></div></div>' +
          '<button class="btn btn-lg btn-primary" data-a="db-save-session"' + (DB.ready ? '' : ' disabled') + '>' + ic('save') + esc(t('db_save_btn')) + '</button></div>' +
        '<div class="card" id="db-sessions"><div class="card-p" style="padding-bottom:10px"><h2>' + esc(t('db_list_h')) + '</h2></div>' +
          (sessions.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>' + esc(t('db_s_name')) + '</th><th>' + esc(t('k_total')) + '</th><th>' + esc(t('db_date')) + '</th><th></th></tr></thead><tbody>' +
            sessions.map(s => '<tr><td class="mono small muted">' + s.id + '</td><td><b>' + esc(s.name) + '</b>' + (s.note ? '<div class="ti">' + esc(s.note) + '</div>' : '') + '</td><td class="mono">' + s.binder_count + '</td><td class="small">' + esc(fmtDate(s.created_at, true)) + '</td>' +
              '<td class="acts"><button class="btn btn-sm" data-a="db-restore" data-id="' + s.id + '">' + ic('rotate') + esc(t('db_restore')) + '</button><button class="icon-btn" data-a="db-session-json" data-id="' + s.id + '" title="JSON">' + ic('braces') + '</button><button class="icon-btn danger" data-a="db-session-del" data-id="' + s.id + '" title="' + esc(t('delete')) + '">' + ic('trash') + '</button></td></tr>').join('') + '</tbody></table></div>'
          : '<div class="empty" style="padding:24px">' + esc(t('db_none')) + '</div>') + '</div>' +
      '</div>' +
      '<div class="stack" style="gap:16px">' +
        (DB.ready ? (() => { const pt = phTotals(), orph = phOrphans(); return '<div class="card card-p stack"><h2>' + ic('camera') + ' ' + esc(t('db_photos')) + helpDot('locate') + '</h2><p class="card-sub" style="margin:0">' + esc(t('db_photos_d', {n:pt.n, s:(pt.bytes / 1048576).toFixed(1) + ' MB'})) + '</p>' + (orph ? '<div class="warn-box small">' + ic('alert') + '<div>' + esc(t('ph_orph', {n:orph})) + '<div style="margin-top:8px"><button class="btn btn-sm" data-a="ph-purge">' + ic('trash') + esc(t('ph_purge')) + '</button></div></div></div>' : '') + '</div>'; })() : '') +
        '<div class="card card-p stack"><h2>' + esc(t('db_file_h')) + '</h2><p class="card-sub" style="margin:0">' + esc(t('db_file_d')) + '</p>' +
          '<div class="row"><button class="btn" data-a="db-download"' + (DB.ready ? '' : ' disabled') + '>' + ic('download') + esc(t('db_download')) + '</button><button class="btn" data-a="db-open"' + (DB.ready ? '' : ' disabled') + '>' + ic('upload') + esc(t('db_open')) + '</button></div>' +
          '<div class="sep" style="margin:4px 0"></div><b>' + esc(t('db_link_h')) + '</b>' + fileBox + '</div>' +
        '<div class="card card-p stack"><h2>' + esc(t('db_console')) + '</h2><p class="card-sub" style="margin:0">' + esc(t('db_console_d')) + '</p>' +
          '<div class="row" style="gap:6px">' + SQL_EXAMPLES.map((e, i) => '<button class="btn btn-sm" data-a="db-example" data-i="' + i + '">' + esc(t(e[0])) + '</button>').join('') + '</div>' +
          '<textarea class="inp mono small" id="db-sql" rows="5" spellcheck="false">' + esc(DB.consoleSql || SQL_EXAMPLES[0][1]) + '</textarea>' +
          '<div class="row"><button class="btn btn-dark" data-a="db-run"' + (DB.ready ? '' : ' disabled') + '>' + ic('arrowRight') + esc(t('db_run')) + '</button></div><div id="db-result">' + resHTML + '</div></div>' +
        '<div class="card card-p"><h2>' + esc(t('db_schema')) + '</h2><div class="codebox" style="max-height:220px;margin-top:10px">binders (id, speaking_code, company_name, category, color_hex, binder_title, room_code, cabinet_code, shelf_code, sector_code, location_code, archive_state, tags, short_code, short_url, final_destination, …)\ncontents_items (binder_id → binders.id, position, year, description, status)\nsessions (id, name, note, created_at, binder_count, workspace_json)\nsettings (key, value JSON) • label_presets • audit_log • activity_log (registro attività) • meta\nVIEW v_manifest_qr7 (short_code, short_url, final_destination, tags)</div></div>' +
      '</div></div>';
}
