/* =====================================================================
   DocMap 2026 — Activity log ("Registro attività"): what was done, when and by whom (v9, stream L)

   Entry shape (hub-ready, same in memory, workspace JSON and SQLite):
     { id:      uuid,
       at:      ISO timestamp (UTC),
       who:     S.settings.operator, or LOG_DEVICE ('Questo PC') when no operator name is set,
       action:  stable machine id, '<group>.<verb>' (e.g. 'binder.create', 'import.merge', 'print.labels'),
       target:  {type:'binder'|'client'|'info'|'session'|'file', id, code} or null,
       summary: short human text, always Italian (the stored record; the UI translates the action label),
       details: small JSON (e.g. {changed:{field:[old, new]}}, counts, file names),
       source:  'ui' | 'import' | 'ai' | 'restore' }
   Storage:
     - SQLite table activity_log (06-db.js DDL, DB_SCHEMA_VERSION 5): written immediately when the
       database is ready, persisted with the next dbPersist() (debounced).
     - LOG.entries: in-memory mirror (chronological), loaded from SQLite at boot.
     - localStorage 'docmap_v26_log_pending': only the entries not yet saved to IndexedDB (normally
       empty, a few entries at most), so nothing is lost if the tab closes before the SQLite save.
       The log never goes into the state S, so it does not bloat 'docmap_v26_state'.
     - Workspace JSON backups (exportJSON / quickBackup) carry it as the optional key `activity_log`;
       "ripristina tutto" merges it back by id (never removes entries). Sessions do not carry it.
     - Opening another .sqlite merges both logs (union by id).
     - Cap: the newest LOG_CAP = 20 000 entries are kept (older ones are dropped, SQLite and memory).
   Hooks: one-line logAct()/logBinderSave()/logImport() calls in the existing code paths, plus thin
   wrappers installed here around global functions (exports, print, sessions, Informazioni, undo)
   and, on DOMContentLoaded, ACTIONS['pdf-download'] if another module defines it.
   ===================================================================== */
'use strict';

const LOG_CAP = 20000;
const LOG_DEVICE = 'Questo PC';
const LOG_LS = 'docmap_v26_log_pending';
const LOG = { entries:[], pending:[], ready:false, timer:null, n:0, opOld:undefined, undoMark:-1 };
const LOGV = { q:'', act:'', who:'', from:'', to:'', limit:100 };   // view filters (session only)
const LOG_GROUPS = ['binder','import','export','print','info','client','db','settings','undo','demo','backup'];

Object.assign(ICONS, {
  history:'<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>'
});

Object.assign(I18N.it, {
  nav_log:'Registro attività', nd_log:'Cosa è stato fatto, quando e da chi',
  lg_h:'Registro attività', lg_p:'Ogni operazione importante resta scritta qui: faldoni creati, modificati o eliminati, import, export e backup, stampe, modifiche in Informazioni e nell\'anagrafica clienti.',
  lg_operator:'Il tuo nome (operatore)', lg_operator_ph:'es. Davide', lg_operator_hint:'Compare nel registro attività accanto a ogni operazione fatta da questo PC.',
  lg_op_ask:'Chi sta lavorando? Scrivi il tuo nome: comparirà accanto a ogni operazione. Senza nome le operazioni vengono registrate come "Questo PC".',
  lg_op_now:'Operatore', lg_device:'Questo PC',
  lg_search:'Cerca nel registro…', lg_all_types:'Tutte le operazioni', lg_all_who:'Tutti', lg_from:'Dal', lg_to:'Al', lg_csv:'Esporta CSV', lg_reset:'Azzera filtri',
  lg_count:'{n} di {t} operazioni', lg_empty:'Il registro è vuoto: le operazioni compariranno qui appena lavori sui faldoni.', lg_none:'Nessuna operazione con questi filtri.',
  lg_more:'Mostra altre {n}', lg_th_when:'Quando', lg_th_who:'Chi', lg_th_what:'Operazione', lg_th_desc:'Descrizione', lg_th_target:'Faldone',
  lg_gone:'Questo faldone non c\'è più nell\'archivio.', lg_cap:'Vengono conservate le ultime {n} operazioni.', lg_exported:'Registro esportato: {f}',
  lg_src_import:'import', lg_src_ai:'AI', lg_src_restore:'ripristino',
  lg_g_binder:'Faldoni', lg_g_import:'Import', lg_g_export:'Export e backup', lg_g_print:'Stampa', lg_g_info:'Informazioni', lg_g_client:'Clienti', lg_g_db:'Database', lg_g_settings:'Impostazioni', lg_g_undo:'Annulla', lg_g_demo:'Esempi', lg_g_backup:'Ripristino',
  'lga_binder.create':'Faldone creato', 'lga_binder.edit':'Faldone modificato', 'lga_binder.duplicate':'Faldone duplicato', 'lga_binder.delete':'Faldone eliminato', 'lga_binder.delete_bulk':'Faldoni eliminati', 'lga_binder.wipe':'Archivio svuotato',
  'lga_demo.delete':'Esempi eliminati', 'lga_demo.load':'Esempi ricaricati', 'lga_undo':'Annullato',
  'lga_import.merge':'Import (unisci)', 'lga_import.replace':'Import (sostituisci)', 'lga_backup.restore':'Backup ripristinato', 'lga_backup.snapshot':'Snapshot ripristinato',
  'lga_client.import':'Import clienti', 'lga_client.create':'Cliente aggiunto', 'lga_client.edit':'Cliente modificato', 'lga_client.delete':'Cliente eliminato',
  'lga_info.rename':'Voce rinominata', 'lga_info.merge':'Voci unite', 'lga_info.delete':'Voce eliminata',
  'lga_export.manifest':'Manifest qr7.it', 'lga_export.csv':'CSV completo', 'lga_export.json':'Workspace JSON', 'lga_export.backup':'Backup', 'lga_export.sqlite':'File .sqlite', 'lga_export.clients':'CSV clienti', 'lga_export.log':'CSV registro', 'lga_export.file':'Export',
  'lga_print.labels':'Stampa etichette', 'lga_print.pdf':'PDF etichette', 'lga_print.register':'Stampa registro', 'lga_print.calibration':'Foglio di prova',
  'lga_db.session_save':'Sessione salvata', 'lga_db.session_restore':'Sessione ripristinata', 'lga_db.session_delete':'Sessione eliminata', 'lga_db.open':'Database aperto',
  'lga_settings.operator':'Operatore cambiato'
});
Object.assign(I18N.en, {
  nav_log:'Activity log', nd_log:'What was done, when and by whom',
  lg_h:'Activity log', lg_p:'Every important operation is recorded here: binders created, edited or deleted, imports, exports and backups, printing, changes in Information and in the client register.',
  lg_operator:'Your name (operator)', lg_operator_ph:'e.g. David', lg_operator_hint:'Shown in the activity log next to every operation made on this PC.',
  lg_op_ask:'Who is working? Type your name: it will appear next to every operation. Without a name operations are recorded as "This PC".',
  lg_op_now:'Operator', lg_device:'This PC',
  lg_search:'Search the log…', lg_all_types:'All operations', lg_all_who:'Everyone', lg_from:'From', lg_to:'To', lg_csv:'Export CSV', lg_reset:'Clear filters',
  lg_count:'{n} of {t} operations', lg_empty:'The log is empty: operations will show up here as soon as you work on binders.', lg_none:'No operation matches these filters.',
  lg_more:'Show {n} more', lg_th_when:'When', lg_th_who:'Who', lg_th_what:'Operation', lg_th_desc:'Description', lg_th_target:'Binder',
  lg_gone:'This binder is no longer in the archive.', lg_cap:'The latest {n} operations are kept.', lg_exported:'Log exported: {f}',
  lg_src_import:'import', lg_src_ai:'AI', lg_src_restore:'restore',
  lg_g_binder:'Binders', lg_g_import:'Import', lg_g_export:'Export & backup', lg_g_print:'Print', lg_g_info:'Information', lg_g_client:'Clients', lg_g_db:'Database', lg_g_settings:'Settings', lg_g_undo:'Undo', lg_g_demo:'Samples', lg_g_backup:'Restore',
  'lga_binder.create':'Binder created', 'lga_binder.edit':'Binder edited', 'lga_binder.duplicate':'Binder duplicated', 'lga_binder.delete':'Binder deleted', 'lga_binder.delete_bulk':'Binders deleted', 'lga_binder.wipe':'Archive emptied',
  'lga_demo.delete':'Samples deleted', 'lga_demo.load':'Samples reloaded', 'lga_undo':'Undone',
  'lga_import.merge':'Import (merge)', 'lga_import.replace':'Import (replace)', 'lga_backup.restore':'Backup restored', 'lga_backup.snapshot':'Snapshot restored',
  'lga_client.import':'Client import', 'lga_client.create':'Client added', 'lga_client.edit':'Client edited', 'lga_client.delete':'Client deleted',
  'lga_info.rename':'Value renamed', 'lga_info.merge':'Values merged', 'lga_info.delete':'Value deleted',
  'lga_export.manifest':'qr7.it manifest', 'lga_export.csv':'Full CSV', 'lga_export.json':'Workspace JSON', 'lga_export.backup':'Backup', 'lga_export.sqlite':'.sqlite file', 'lga_export.clients':'Client CSV', 'lga_export.log':'Log CSV', 'lga_export.file':'Export',
  'lga_print.labels':'Label printing', 'lga_print.pdf':'Label PDF', 'lga_print.register':'Register printing', 'lga_print.calibration':'Test sheet',
  'lga_db.session_save':'Session saved', 'lga_db.session_restore':'Session restored', 'lga_db.session_delete':'Session deleted', 'lga_db.open':'Database opened',
  'lga_settings.operator':'Operator changed'
});

/* ---------------- Core ---------------- */
function logWho(){ const o = String((S && S.settings && S.settings.operator) || '').trim(); return o || LOG_DEVICE; }
const logCut = (v, n) => { const s = String(v == null ? '' : v); n = n || 300; return s.length > n ? s.slice(0, n) + '…' : s; };
const logBT = (b) => b ? {type:'binder', id:b.id, code:b.speaking_code || ''} : null;
const logBName = (b) => b.speaking_code + (b.company_name ? ' — ' + b.company_name : '');
function logSavePending(){ try { if (LOG.pending.length) localStorage.setItem(LOG_LS, JSON.stringify(LOG.pending)); else localStorage.removeItem(LOG_LS); } catch(e){} }
function logValid(e){ return e && typeof e === 'object' && typeof e.id === 'string' && e.id && typeof e.at === 'string' && !isNaN(new Date(e.at)) && typeof e.action === 'string' && e.action; }
function logNorm(e){
  const tg = e.target && typeof e.target === 'object' ? {type:String(e.target.type || ''), id:String(e.target.id || ''), code:String(e.target.code || '')} : null;
  return {id:e.id, at:e.at, who:String(e.who || LOG_DEVICE), action:e.action, target:tg && tg.type ? tg : null, summary:String(e.summary || ''),
    details:e.details && typeof e.details === 'object' ? e.details : {}, source:['ui','import','ai','restore'].includes(e.source) ? e.source : 'ui'};
}
/** The one logging helper. Never throws. */
function logAct(action, target, summary, details, source){
  try {
    const e = logNorm({id:uuid(), at:nowISO(), who:logWho(), action:String(action), target, summary, details, source});
    LOG.entries.push(e);
    if (LOG.entries.length > LOG_CAP) LOG.entries.splice(0, LOG.entries.length - LOG_CAP);
    LOG.pending.push(e); logSavePending();
    if (logDbInsert([e])) logSchedulePersist();
    return e;
  } catch(err){ console.warn('logAct', err); return null; }
}

/* ---------------- SQLite ---------------- */
function logRow(e){ const tg = e.target || {}; return [e.id, e.at, e.who, e.action, tg.type || '', tg.id || '', tg.code || '', e.summary, JSON.stringify(e.details || {}), e.source || 'ui']; }
function logDbInsert(list, db){
  db = db || (DB.ready && DB.db); if (!db || !list.length) return false;
  try {
    const st = db.prepare('INSERT OR IGNORE INTO activity_log(id,at,who,action,target_type,target_id,target_code,summary,details_json,source) VALUES (?,?,?,?,?,?,?,?,?,?)');
    try { list.forEach(e => st.run(logRow(e))); } finally { st.free(); }
    LOG.n += list.length; if (LOG.n >= 200){ LOG.n = 0; logDbTrim(db); }
    return true;
  } catch(err){ console.warn('activity_log', err); return false; }
}
function logDbTrim(db){ try { db.run('DELETE FROM activity_log WHERE rowid IN (SELECT rowid FROM activity_log ORDER BY at DESC, rowid DESC LIMIT -1 OFFSET ?)', [LOG_CAP]); } catch(e){} }
function logFromRow(r){
  let d = {}; try { d = JSON.parse(r.details_json || '{}'); } catch(e){}
  return logNorm({id:r.id, at:r.at, who:r.who, action:r.action, target:r.target_type ? {type:r.target_type, id:r.target_id, code:r.target_code} : null, summary:r.summary, details:d, source:r.source});
}
function logDbLoad(db){ try { return dbQuery('SELECT * FROM activity_log ORDER BY at, rowid', null, db).map(logFromRow); } catch(e){ return []; } }
/* After the database opens (boot) or is swapped (.sqlite opened): union of the memory log and the file's log. */
function logAttach(){
  if (!DB.ready || !DB.db) return;
  logDbInsert(LOG.entries.concat(LOG.pending));
  logDbTrim(DB.db);
  LOG.entries = logDbLoad(DB.db);
  LOG.ready = true;
}
function logSchedulePersist(){ clearTimeout(LOG.timer); LOG.timer = setTimeout(() => { dbPersist(); }, 800); }
/* Workspace JSON backup / restore */
function logEntriesForBackup(){ return LOG.entries.map(e => ({id:e.id, at:e.at, who:e.who, action:e.action, target:e.target, summary:e.summary, details:e.details, source:e.source})); }
function logMerge(list){
  if (!Array.isArray(list)) return 0;
  const have = new Set(LOG.entries.map(e => e.id));
  const add = list.filter(e => logValid(e) && !have.has(e.id)).map(logNorm);
  if (!add.length) return 0;
  LOG.entries = LOG.entries.concat(add).sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
  if (LOG.entries.length > LOG_CAP) LOG.entries.splice(0, LOG.entries.length - LOG_CAP);
  if (logDbInsert(add)){ logDbTrim(DB.db); logSchedulePersist(); }
  else { LOG.pending = LOG.pending.concat(add); logSavePending(); }
  return add.length;
}
(function logBoot(){
  try { const p = JSON.parse(localStorage.getItem(LOG_LS) || '[]'); if (Array.isArray(p)){ LOG.pending = p.filter(logValid).map(logNorm); LOG.entries = LOG.pending.slice(); } } catch(e){}
})();

/* ---------------- Helpers called from the existing code paths ---------------- */
const LOG_SKIP = ['updated_at','short_url','selected_for_print','created_at'];
const LOG_FIELD_IT = {speaking_code:'codice', multi_code:'Codice Multi', company_name:'cliente', company_city:'luogo', category:'categoria', binder_title:'titolo', ref_year:'anno', extra_codes:'codici extra',
  room_code:'stanza', cabinet_code:'armadio', shelf_code:'ripiano', sector_code:'settore', location_code:'posizione', archive_state:'stato', contents_items:'contenuti', tags:'tag', color_hex:'colore',
  shelf_color:'colore ripiano', short_code:'codice breve', final_destination:'destinazione', contacts:'contatti', notes:'note',
  name:'ragione sociale', address:'indirizzo', cap:'CAP', city:'località', province:'provincia', type:'tipo'};
function logDiff(a, b, skip){
  const ch = {};
  Object.keys(Object.assign({}, a, b)).forEach(k => {
    if ((skip || LOG_SKIP).includes(k) || k.charAt(0) === '_') return;
    let x = a ? a[k] : '', y = b ? b[k] : '';
    if (k === 'contents_items'){ x = contentsToPipe(x || []); y = contentsToPipe(y || []); }
    x = x == null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x);
    y = y == null ? '' : typeof y === 'object' ? JSON.stringify(y) : String(y);
    if (x !== y) ch[k] = [logCut(x), logCut(y)];
  });
  return ch;
}
/** Editor save: old = binder before the save (null for a new one). */
function logBinderSave(old, b){
  if (!old) return logAct('binder.create', logBT(b), 'Creato il faldone ' + logBName(b), {company_name:b.company_name, category:b.category, location_code:b.location_code, short_code:b.short_code});
  const ch = logDiff(old, b), keys = Object.keys(ch);
  if (!keys.length) return null;
  return logAct('binder.edit', logBT(b), 'Modificato il faldone ' + b.speaking_code + ': ' + keys.map(k => LOG_FIELD_IT[k] || k).join(', '), {changed:ch});
}
function logBinderDelete(list, action){
  if (list.length === 1 && action !== 'binder.wipe' && action !== 'demo.delete') return logAct('binder.delete', logBT(list[0]), 'Eliminato il faldone ' + logBName(list[0]), {company_name:list[0].company_name, short_code:list[0].short_code});
  const codes = list.map(b => b.speaking_code);
  const what = {'demo.delete':'Eliminati {n} faldoni di esempio', 'binder.wipe':'Archivio svuotato: eliminati {n} faldoni'}[action] || 'Eliminati {n} faldoni';
  return logAct(action || 'binder.delete_bulk', null, what.replace('{n}', list.length) + (codes.length ? ': ' + logCut(codes.join(', '), 160) : ''), {count:list.length, codes:codes.slice(0, 200)});
}
function logImport(mode, IP, added, updated){
  const W = IP && IP.workspace, restore = !!(W && UI.restoreAll && mode === 'replace');
  const merged = restore ? logMerge(W.activity_log) : 0;
  const errors = IP && IP.rows ? IP.rows.filter(r => r.status === 'err').length : 0;
  const fmt = String((IP && IP.format) || '');
  const src = restore ? 'restore' : fmt.indexOf(t('im_nohdr')) >= 0 ? 'ai' : 'import';
  return logAct(restore ? 'backup.restore' : 'import.' + mode, null,
    (restore ? 'Ripristinato un backup completo' : mode === 'replace' ? 'Import con sostituzione dell\'archivio' : 'Import unito all\'archivio') + ': ' + added + ' nuovi, ' + updated + ' aggiornati' + (errors ? ', ' + errors + ' righe con errori' : ''),
    {mode, added, updated, errors, format:fmt, log_entries_restored:merged || undefined}, src);
}
function logClientSave(old, c, nb){
  if (!old) return logAct('client.create', {type:'client', id:c.id, code:c.multi_code || c.name}, 'Aggiunto il cliente ' + c.name, {name:c.name, multi_code:c.multi_code});
  const ch = logDiff(old, c, ['id']);
  if (!Object.keys(ch).length) return null;
  return logAct('client.edit', {type:'client', id:c.id, code:c.multi_code || c.name}, 'Modificato il cliente ' + c.name + (nb ? ' (aggiornati anche ' + nb + ' faldoni)' : ''), {changed:ch, binders_updated:nb || 0});
}
function logPrintDetails(){
  const P = S.print || {}; let L = {items:0, pages:[]};
  try { L = layoutLabels(); } catch(e){}
  let codes = []; try { codes = printQueueBinders().map(b => b.speaking_code); } catch(e){}
  return {preset:P.presetId, mode:P.contentMode, labels:L.items || 0, sheets:(L.pages || []).length, copies:P.copies || 1, qr:P.qrMode, binders:codes.length, codes:codes.slice(0, 100)};
}
const LOG_EXPORT_KIND = (f) => /^manifest/i.test(f) ? 'export.manifest' : /full_backup\.csv$/i.test(f) ? 'export.csv' : /^docmap_workspace_\d/i.test(f) ? 'export.backup' : /\.json$/i.test(f) ? 'export.json' : /\.sqlite3?$|\.db$/i.test(f) ? 'export.sqlite' : 'export.file';

/* ---------------- Wrappers around existing global functions (installed at load; callers resolve them at call time) ---------------- */
(function logWrap(){
  const wrap = (name, fn) => { const orig = window[name]; if (typeof orig !== 'function') return; window[name] = fn(orig); };
  wrap('markExported', (o) => function(file){ const r = o.apply(this, arguments); logAct(LOG_EXPORT_KIND(String(file || '')), {type:'file', id:'', code:String(file || '')}, 'Scaricato ' + file, {file:String(file || ''), binders:S.binders.length}); return r; });
  wrap('exportClientsCSV', (o) => function(){ const r = o.apply(this, arguments); logAct('export.clients', {type:'file', id:'', code:'docmap_clienti.csv'}, 'Scaricato docmap_clienti.csv (' + (S.clients || []).length + ' clienti)', {file:'docmap_clienti.csv', clients:(S.clients || []).length}); return r; });
  wrap('printLabels', (o) => function(){ const d = logPrintDetails(); if (d.labels) logAct('print.labels', null, 'Stampa di ' + d.labels + ' etichette (' + d.sheets + ' fogli, foglio ' + d.preset + ', contenuto ' + d.mode + ')', d); return o.apply(this, arguments); });
  wrap('printRegister', (o) => function(list){ logAct('print.register', null, 'Stampa del Registro Generale (' + (list || []).length + ' faldoni)', {binders:(list || []).length}); return o.apply(this, arguments); });
  wrap('printCalibration', (o) => function(){ logAct('print.calibration', null, 'Stampa del foglio di prova (' + S.print.presetId + ')', {preset:S.print.presetId}); return o.apply(this, arguments); });
  wrap('dbSaveSession', (o) => async function(name){ const r = await o.apply(this, arguments); if (r) logAct('db.session_save', {type:'session', id:String(r), code:String(name)}, 'Salvata la sessione "' + name + '" (' + S.binders.length + ' faldoni)', {name, binders:S.binders.length}); return r; });
  wrap('dbRestoreSession', (o) => async function(id){ const s = (dbSessions() || []).find(x => x.id === +id); const r = await o.apply(this, arguments); if (r) logAct('db.session_restore', {type:'session', id:String(id), code:s ? s.name : ''}, 'Ripristinata la sessione "' + (s ? s.name : id) + '" (' + S.binders.length + ' faldoni)', {name:s ? s.name : '', binders:S.binders.length}, 'restore'); return r; });
  wrap('dbDeleteSession', (o) => async function(id){ const s = (dbSessions() || []).find(x => x.id === +id); const r = await o.apply(this, arguments); logAct('db.session_delete', {type:'session', id:String(id), code:s ? s.name : ''}, 'Eliminata la sessione "' + (s ? s.name : id) + '"', {name:s ? s.name : ''}); return r; });
  wrap('infoRename', (o) => function(id, key){ const e = infoEntry(id, key); const r = o.apply(this, arguments);
    if (r) logAct(r.merged ? 'info.merge' : 'info.rename', {type:'info', id, code:e ? e.value : key}, (r.merged ? 'Unita la voce "' : 'Rinominata la voce "') + (e ? e.value : key) + '" in "' + r.target + '" (' + (LOG_INFO_IT[id] || id) + ', ' + r.nb + ' faldoni' + (r.nc ? ', ' + r.nc + ' clienti' : '') + ')', {list:id, from:e ? e.value : key, to:r.target, binders:r.nb, clients:r.nc});
    return r; });
  wrap('infoDelete', (o) => function(id, key){ const e = infoEntry(id, key); const r = o.apply(this, arguments);
    if (r) logAct('info.delete', {type:'info', id, code:e ? e.value : key}, 'Eliminata la voce "' + (e ? e.value : key) + '" (' + (LOG_INFO_IT[id] || id) + ', tolta da ' + r.nb + ' faldoni' + (r.nc ? ', ' + r.nc + ' clienti' : '') + ')', {list:id, value:e ? e.value : key, binders:r.nb, clients:r.nc});
    return r; });
  wrap('undoPoint', (o) => function(){ LOG.undoMark = LOG.entries.length; return o.apply(this, arguments); });
  wrap('dbInit', (o) => async function(){ const r = await o.apply(this, arguments); logAttach(); if (LOG.pending.length && DB.ready) await dbPersist(); if (S && S.view === 'log') renderView(); return r; });
  wrap('dbPersist', (o) => async function(){ const n = LOG.ready ? LOG.pending.length : 0; const r = await o.apply(this, arguments); if (n){ LOG.pending.splice(0, n); logSavePending(); } return r; });
})();
const LOG_INFO_IT = {tags:'tag', category:'categorie', year:'anni', place:'luoghi', multi:'Codici Multi', extra:'codici extra'};
function logUndo(){
  const after = LOG.undoMark >= 0 ? LOG.entries.slice(LOG.undoMark).filter(e => !/^(export|print|undo)/.test(e.action)) : [];
  const u = after[0]; LOG.undoMark = -1;
  return logAct('undo', u ? u.target : null, 'Annullata l\'ultima operazione' + (u ? ': ' + u.summary : ''), u ? {undone_id:u.id, undone_action:u.action} : {});
}

/* ---------------- View ---------------- */
const logLabel = (a) => { const k = 'lga_' + a; return I18N.it[k] ? t(k) : a; };
const logWhoLabel = (w) => w === LOG_DEVICE ? t('lg_device') : w;
function logDay(iso){ const d = new Date(iso); if (isNaN(d)) return ''; const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
const LOG_HAY = new WeakMap();
function logHay(e){ let h = LOG_HAY.get(e); if (!h){ h = [e.summary, e.action, logLabel(e.action), e.who, e.target ? e.target.code : '', JSON.stringify(e.details || {})].join(' ').toLowerCase(); LOG_HAY.set(e, h); } return h; }
/** Newest first. */
function logFiltered(){
  const q = String(LOGV.q || '').trim().toLowerCase().split(/\s+/).filter(Boolean), out = [];
  for (let i = LOG.entries.length - 1; i >= 0; i--){
    const e = LOG.entries[i];
    if (LOGV.act && e.action.split('.')[0] !== LOGV.act) continue;
    if (LOGV.who && e.who !== LOGV.who) continue;
    if (LOGV.from || LOGV.to){ const d = logDay(e.at); if ((LOGV.from && d < LOGV.from) || (LOGV.to && d > LOGV.to)) continue; }
    if (q.length){ const h = logHay(e); if (!q.every(w => h.indexOf(w) >= 0)) continue; }
    out.push(e);
  }
  return out;
}
function logDetailsHTML(e){
  const d = e.details || {};
  if (d.changed && typeof d.changed === 'object'){
    return '<ul class="lg-ch">' + Object.keys(d.changed).slice(0, 12).map(k => { const v = d.changed[k] || []; return '<li><b>' + esc(LOG_FIELD_IT[k] || k) + '</b>: <span class="lg-old">' + esc(logCut(v[0], 80) || '—') + '</span> → <span>' + esc(logCut(v[1], 80) || '—') + '</span></li>'; }).join('') + '</ul>';
  }
  return '';
}
function logRowHTML(e){
  const tg = e.target, b = tg && tg.type === 'binder' ? S.binders.find(x => x.id === tg.id) : null;
  const grp = e.action.split('.')[0];
  const tcell = tg && tg.type === 'binder' ? '<button class="btn btn-sm btn-ghost lg-open" data-a="log-open" data-id="' + esc(tg.id) + '" title="' + esc(b ? t('act_edit') : t('lg_gone')) + '"' + (b ? '' : ' style="opacity:.6"') + '><span class="mono">' + esc(tg.code) + '</span></button>'
    : tg && tg.code ? '<span class="small muted mono">' + esc(logCut(tg.code, 40)) + '</span>' : '';
  return '<tr data-log="' + esc(e.id) + '"><td class="small" style="white-space:nowrap">' + esc(fmtDate(e.at, true)) + '</td><td class="small"><b>' + esc(logWhoLabel(e.who)) + '</b></td>' +
    '<td><span class="badge lg-b lg-' + esc(grp) + '">' + esc(logLabel(e.action)) + '</span>' + (e.source !== 'ui' ? ' <span class="tiny muted">' + esc(t('lg_src_' + e.source)) + '</span>' : '') + '</td>' +
    '<td class="small" style="min-width:220px">' + esc(e.summary) + logDetailsHTML(e) + '</td><td>' + tcell + '</td></tr>';
}
function logResultsHTML(){
  if (!LOG.entries.length) return '<div class="empty">' + ic('history', 'lg') + '<p>' + esc(t('lg_empty')) + '</p></div>';
  const list = logFiltered();
  if (!list.length) return '<div class="empty">' + esc(t('lg_none')) + '</div>';
  const lim = LOGV.limit || 100;
  return '<div class="tbl-wrap"><table class="tbl lg-tbl"><thead><tr><th>' + esc(t('lg_th_when')) + '</th><th>' + esc(t('lg_th_who')) + '</th><th>' + esc(t('lg_th_what')) + '</th><th>' + esc(t('lg_th_desc')) + '</th><th>' + esc(t('lg_th_target')) + '</th></tr></thead><tbody>' +
    list.slice(0, lim).map(logRowHTML).join('') + '</tbody></table></div>' +
    (list.length > lim ? '<div class="row" style="justify-content:center;padding:14px"><button class="btn btn-sm" data-a="log-more">' + esc(t('lg_more', {n:Math.min(100, list.length - lim)})) + '</button></div>' : '');
}
function renderLogResults(){
  const box = $('#lg-results'); if (box) box.innerHTML = logResultsHTML();
  const c = $('#lg-count'); if (c) c.textContent = LOG.entries.length ? t('lg_count', {n:logFiltered().length, t:LOG.entries.length}) : '';
}
function logOperatorHTML(){
  const op = String(S.settings.operator || '').trim();
  const inp = '<input class="inp" id="lg-op" data-set="operator" value="' + esc(op) + '" placeholder="' + esc(t('lg_operator_ph')) + '" aria-label="' + esc(t('lg_operator')) + '" style="max-width:260px" autocomplete="name">';
  return op ? '<div class="row small" style="gap:8px;margin-bottom:12px"><span class="muted">' + esc(t('lg_op_now')) + ':</span>' + inp + '</div>'
    : '<div class="info-box small" id="lg-op-ask" style="margin-bottom:12px">' + ic('info') + '<div style="flex:1"><div>' + esc(t('lg_op_ask')) + '</div><div class="row" style="gap:8px;margin-top:8px"><label for="lg-op"><b>' + esc(t('lg_operator')) + '</b></label>' + inp + '</div></div></div>';
}
function viewLog(){
  const whos = Array.from(new Set(LOG.entries.map(e => e.who))).sort(naturalCmp);
  const groups = LOG_GROUPS.filter(g => LOG.entries.some(e => e.action.split('.')[0] === g) || g === LOGV.act);
  const sel = (k, opts) => '<select class="inp" data-lg="' + k + '" aria-label="' + k + '">' + opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (LOGV[k] === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>';
  return '<div class="page-h"><div><h1>' + esc(t('lg_h')) + helpDot('log') + '</h1><p>' + esc(t('lg_p')) + '</p></div>' +
      '<div class="row"><button class="btn" data-a="log-csv"' + (LOG.entries.length ? '' : ' disabled') + '>' + ic('download') + esc(t('lg_csv')) + '</button></div></div>' +
    logOperatorHTML() +
    '<div class="card"><div class="toolbar" style="flex-wrap:wrap">' +
      '<div class="search">' + ic('search') + '<input class="inp" type="search" data-lg="q" value="' + esc(LOGV.q) + '" placeholder="' + esc(t('lg_search')) + '" aria-label="search"></div>' +
      sel('act', [['', t('lg_all_types')]].concat(groups.map(g => [g, t('lg_g_' + g)]))) +
      sel('who', [['', t('lg_all_who')]].concat(whos.map(w => [w, logWhoLabel(w)]))) +
      '<label class="small row" style="gap:4px">' + esc(t('lg_from')) + ' <input class="inp" type="date" data-lg="from" value="' + esc(LOGV.from) + '" style="width:auto"></label>' +
      '<label class="small row" style="gap:4px">' + esc(t('lg_to')) + ' <input class="inp" type="date" data-lg="to" value="' + esc(LOGV.to) + '" style="width:auto"></label>' +
      (LOGV.q || LOGV.act || LOGV.who || LOGV.from || LOGV.to ? '<button class="btn btn-sm btn-ghost" data-a="log-reset">' + ic('x') + esc(t('lg_reset')) + '</button>' : '') +
      '<span class="small muted" id="lg-count">' + (LOG.entries.length ? esc(t('lg_count', {n:logFiltered().length, t:LOG.entries.length})) : '') + '</span></div>' +
    '<div id="lg-results">' + logResultsHTML() + '</div>' +
    '<div class="tiny muted" style="padding:10px 16px">' + esc(t('lg_cap', {n:LOG_CAP.toLocaleString(S.lang === 'en' ? 'en-GB' : 'it-IT')})) + '</div></div>' +
    '<style>.lg-ch{margin:4px 0 0;padding-left:16px;color:var(--muted,#64748B);font-size:12px}.lg-ch .lg-old{text-decoration:line-through;opacity:.75}.lg-tbl td{vertical-align:top}.lg-b{white-space:nowrap}.lg-b.lg-binder{background:#EFF6FF;color:#1D4ED8;border-color:#BFDBFE}.lg-b.lg-import,.lg-b.lg-backup{background:#ECFDF5;color:#047857;border-color:#A7F3D0}.lg-b.lg-export,.lg-b.lg-db{background:#F5F3FF;color:#6D28D9;border-color:#DDD6FE}.lg-b.lg-print{background:#FFF7ED;color:#C2410C;border-color:#FED7AA}.lg-b.lg-undo,.lg-b.lg-demo{background:#FEF2F2;color:#B91C1C;border-color:#FECACA}</style>';
}

/* CSV of the filtered entries: same rules as the other exports (';', UTF-8 BOM, formula guard). */
function logCSV(list){
  const rows = [['date','who','action','operation','target_type','target_code','summary','details','source','at','id']].concat((list || logFiltered()).map(e =>
    [fmtDate(e.at, true), e.who, e.action, logLabel(e.action), e.target ? e.target.type : '', e.target ? e.target.code : '', e.summary, JSON.stringify(e.details || {}), e.source, e.at, e.id].map(safeCell)));
  return '﻿' + toCSV(rows, ';');
}
function logExportCSV(){
  const list = logFiltered();
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const name = 'docmap_registro_attivita_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + '.csv';
  download(name, logCSV(list), 'text/csv');
  logAct('export.log', {type:'file', id:'', code:name}, 'Scaricato il registro attività (' + list.length + ' operazioni)', {file:name, rows:list.length});
  toast(t('lg_exported', {f:name}));
  renderLogResults();
}

const LOG_ACTIONS = {
  'log-open': (el) => { const b = S.binders.find(x => x.id === el.dataset.id); if (b) openEditor(b.id); else toast(t('lg_gone'), 'warn'); },
  'log-more': () => { LOGV.limit = (LOGV.limit || 100) + 100; renderLogResults(); },
  'log-reset': () => { Object.assign(LOGV, {q:'', act:'', who:'', from:'', to:'', limit:100}); renderView(); },
  'log-csv': () => logExportCSV()
};
document.addEventListener('input', (e) => {
  const k = e.target.dataset && e.target.dataset.lg;
  if (k === 'q'){ LOGV.q = e.target.value; LOGV.limit = 100; renderLogResults(); }
});
document.addEventListener('change', (e) => {
  const el = e.target, k = el.dataset && el.dataset.lg;
  if (k && k !== 'q'){ LOGV[k] = el.value; LOGV.limit = 100; renderView(); return; }
  if (el.dataset && el.dataset.set === 'operator'){
    const nv = String(S.settings.operator || '').trim(), old = String(LOG.opOld == null ? '' : LOG.opOld).trim();
    S.settings.operator = nv; LOG.opOld = nv;
    if (nv === old) return;
    savePrefs();
    logAct('settings.operator', null, nv ? 'Operatore impostato: ' + nv + (old ? ' (prima: ' + old + ')' : '') : 'Nome operatore tolto (prima: ' + old + ')', {from:old, to:nv});
    if (S.view === 'log'){ if (!old !== !nv) renderView(); else renderLogResults(); }
  }
});
document.addEventListener('focusin', (e) => { if (e.target.dataset && e.target.dataset.set === 'operator') LOG.opOld = S.settings.operator || ''; });

/* ---------------- Late registration (ACTIONS, HELP_TOPICS, VIEW_LABEL are defined in later files) ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof ACTIONS !== 'undefined'){
    Object.assign(ACTIONS, LOG_ACTIONS);
    // PDF download (another module): log it generically, whatever its implementation
    const pdf = ACTIONS['pdf-download'];
    if (typeof pdf === 'function' && !pdf._logged){
      ACTIONS['pdf-download'] = function(){ const d = logPrintDetails(); logAct('print.pdf', null, 'Scaricato il PDF di ' + d.labels + ' etichette (' + d.sheets + ' fogli, foglio ' + d.preset + ', contenuto ' + d.mode + ')', d); return pdf.apply(this, arguments); };
      ACTIONS['pdf-download']._logged = true;
    }
  }
  if (typeof VIEW_LABEL !== 'undefined') VIEW_LABEL.log = 'nav_log';
  if (typeof HELP_TOPICS === 'undefined') return;
  HELP_TOPICS.push({ id:'log', guide:null, tags:['safety','db'], related:['backup','nav'],
    title:{it:'Registro attività: cosa è stato fatto e da chi', en:'Activity log: what was done and by whom'},
    body:{it:'<p>Il <b>Registro attività</b> (menu <b>⚙ Funzioni avanzate › Dati</b>) tiene nota di ogni operazione importante: faldoni creati, modificati (con i campi cambiati, prima → dopo), duplicati ed eliminati, <b>Annulla</b>, import ed export, backup, stampe e PDF delle etichette, rinomina / unione / eliminazione in <b>Informazioni</b>, modifiche all\'anagrafica clienti, sessioni e file del database.</p><ul><li><b>Chi</b>: scrivi il tuo nome in <b>Impostazioni</b> (o in cima al registro). Senza nome le operazioni sono registrate come <b>Questo PC</b>.</li><li>Filtra per testo, tipo di operazione, persona e date; clicca il codice di un faldone per aprirlo.</li><li><b>Esporta CSV</b> scarica le righe filtrate (separatore <span class="kbd">;</span>, si apre in Excel).</li><li>Il registro è salvato nel database SQLite locale (anche nel file <span class="kbd">.sqlite</span> scaricato) e nei backup JSON; vengono conservate le ultime 20.000 operazioni.</li></ul>',
          en:'<p>The <b>Activity log</b> (menu <b>⚙ Advanced tools › Data</b>) records every important operation: binders created, edited (with the changed fields, before → after), duplicated and deleted, <b>Undo</b>, imports and exports, backups, label printing and PDFs, rename / merge / delete in <b>Information</b>, client register changes, database sessions and files.</p><ul><li><b>Who</b>: type your name in <b>Settings</b> (or at the top of the log). Without a name operations are recorded as <b>This PC</b>.</li><li>Filter by text, operation type, person and dates; click a binder code to open it.</li><li><b>Export CSV</b> downloads the filtered rows (separator <span class="kbd">;</span>, opens in Excel).</li><li>The log is kept in the local SQLite database (also in the downloaded <span class="kbd">.sqlite</span> file) and in JSON backups; the latest 20,000 operations are kept.</li></ul>'} });
});
