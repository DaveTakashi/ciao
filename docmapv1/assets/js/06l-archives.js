/* =====================================================================
   DocMap 2026 — v12 (stream C): "Archivi" — several archives (clusters) per studio, "Configura archivio"
   wizard, per-archive levels, nested association (desktop). Model: 02e-archives.js.

   1. Top-bar switcher (only with more than one archive): S.archiveSel = '' (Tutti gli archivi) | archive id.
      It filters the Archive table, the print queue (binder labels), the location tree of Informazioni ›
      Ubicazioni and its archive filter; new binders, imported rows without an archive and new location roots
      go into it (the default archive with "Tutti").
   2. Informazioni › Archivi (tab 'arch'): cards with counts and level chain; create / edit (name, code, colour,
      description), "Configura archivio", "Unisci in…" (merge: binders + location roots move, the source record
      is deleted → tombstone), delete an empty archive. Archive table: "Archivio…" moves the ticked binders.
   3. "Configura archivio" (WZ): template (Studio / Magazzino / Ente-Comune / Personalizzato) → levels (name,
      prefix, quantity inside each parent, QR yes/no) → preview of codes and label count → creates the tree in
      the archive (kind = level name on every node, so the names also show on the phone and the server),
      saves the levels (archive.levels; the default archive keeps the v11 S.settings.locLevels) and the QR
      levels (archive.qr_levels), then offers to print the labels of the QR levels.
   4. Nested association (desktop association mode, "Annida ubicazioni" switch, off by default = v11):
      a location QR of a higher level (cabinet A1) becomes the anchor; scanning a lower-level location QR (shelf
      S2) that is not inside it asks "Sposta S2 dentro A1?" (button, or scan S2 again to confirm) → locMove.
      Binder QRs go into the most specific active location as in v11.
   5. Exports: Esporta e Salva can limit the qr7 manifest, the full CSV and the register to one archive.
   6. Hooks for other modules: archBinderVisible(b) (05-views filteredBinders), archDbMigrate / archDbSync /
      archDbRead (06-db), search facet provider pushed onto `searchFacetProviders` when that array exists.

   State: S.archives, S.archiveSel, binder.archive_id, location.archive_id. Ephemeral: AR (UI), WZ (wizard).
   SQLite (schema 9, additive, keyed on existence): table archives(id, name, code, color, description, sort,
   levels_json, qr_levels_json, created_at, updated_at); binders.archive_id, locations.archive_id (NULL = default).
   ===================================================================== */
'use strict';

Object.assign(I18N.it, {
  in_arch:'Archivi', in_d_arch:'Archivi separati dello studio (es. corrente, storico, un ente, un secondo magazzino): ogni faldone e ogni albero di ubicazioni appartiene a un archivio.',
  ar_all:'Tutti gli archivi', ar_switch:'Archivio', ar_new:'Nuovo archivio', ar_edit:'Modifica archivio', ar_name:'Nome', ar_name_ph:'es. Archivio storico', ar_code:'Codice breve', ar_code_hint:'1-8 lettere o cifre, es. ST, COM', ar_color:'Colore', ar_desc:'Descrizione', ar_desc_ph:'facoltativa, es. Faldoni chiusi fino al 2020',
  ar_default_badge:'Predefinito', ar_open:'Apri', ar_setup:'Configura archivio', ar_merge:'Unisci in…', ar_del:'Elimina', ar_saved:'Archivio salvato: {n}', ar_created:'Archivio creato: {n}',
  ar_n_binders:'{n} faldoni', ar_n_binder1:'1 faldone', ar_n_locs:'{n} ubicazioni', ar_n_qr:'{n} QR', ar_levels:'Livelli', ar_levels_global:'livelli dello studio', ar_no_tree:'Nessuna ubicazione: usa "Configura archivio".',
  ar_p:'Uno studio può tenere più archivi separati: i dati restano divisi (faldoni, ubicazioni, stampa, esportazioni). Scegli l\'archivio in alto; "Tutti gli archivi" mostra tutto.',
  ar_e_name:'Il nome è obbligatorio.', ar_e_code:'Codice già usato da un altro archivio.', ar_merge_t:'Unisci {n} in un altro archivio', ar_merge_into:'Sposta tutto in', ar_merge_d:'{b} faldoni e {l} ubicazioni passano in "{t}". L\'archivio "{n}" viene eliminato.',
  ar_merged:'Unito "{n}" in "{t}"', ar_del_d:'Eliminare l\'archivio vuoto "{n}"?', ar_deleted:'Archivio eliminato: {n}', ar_not_empty:'L\'archivio contiene dati: usa "Unisci in…".',
  ar_move_btn:'Archivio…', ar_move_t:'Sposta {n} faldoni in un archivio', ar_move_go:'Sposta', ar_moved:'{n} faldoni spostati in "{t}"', ar_moved_out:'{k} tolti dalla loro ubicazione (era di un altro archivio)',
  ar_ed_label:'Archivio', ar_ed_moved_loc:'L\'ubicazione era di un altro archivio: il faldone è stato tolto dalla scatola.', ar_print_only:'Solo l\'archivio {n}', ar_ex_h:'Archivio da esportare', ar_ex_d:'Manifest qr7, CSV completo e registro: tutti gli archivi o solo uno. Il backup JSON contiene sempre tutto.',
  ar_unknown:'Archivio non ancora sincronizzato', ar_facet:'Archivio', ar_root_of:'Archivio {n}', ar_lv_t:'Livelli dell\'archivio {n}', ar_lv_qr:'QR', ar_lv_qr_d:'Etichetta QR su questo livello', ar_lv_studio:'Usa i livelli dello studio',
  ar_lv_p:'Nomi e prefissi dei livelli di questo archivio, dal più grande al più piccolo (1-8). "QR" indica i livelli che ricevono un\'etichetta.', ar_sel_qr:'Seleziona livelli con QR',
  wz_t:'Configura archivio', wz_t_new:'Nuovo archivio', wz_s1:'Modello', wz_s2:'Livelli', wz_s3:'Anteprima', wz_s4:'Fatto', wz_next:'Avanti', wz_back:'Indietro', wz_create:'Crea l\'archivio', wz_tpl_h:'Com\'è fatto l\'archivio?',
  wz_tpl_p:'Scegli il modello più vicino: al passo successivo cambi nomi, prefissi e quantità.', wz_lv_h:'Livelli, quantità e QR', wz_lv_p:'Per ogni livello: quanti elementi dentro ciascuno del livello sopra. Spunta QR dove vuoi un\'etichetta (es. davanti all\'armadio, su ogni scansia, sulle scatole).',
  wz_lv_name:'Livello', wz_lv_prefix:'Prefisso', wz_lv_n:'Quanti', wz_lv_each:'in ogni {l}', wz_lv_first:'in tutto', wz_lv_add:'Aggiungi livello', wz_lv_del:'Togli livello', wz_pv_h:'Ecco cosa verrà creato', wz_pv_total:'{n} ubicazioni', wz_pv_qr:'{n} etichette QR da stampare',
  wz_pv_codes:'Codici, dal primo all\'ultimo', wz_pv_tree:'Primo ramo', wz_pv_none:'Nessuna ubicazione: indica almeno una quantità.', wz_pv_max:'Troppe ubicazioni in una volta (massimo {n}).', wz_pv_exist:'L\'archivio ha già {n} ubicazioni: le nuove si aggiungono con numeri successivi.',
  wz_done_h:'Archivio pronto', wz_done_p:'Create {n} ubicazioni in "{a}". Ora stampa le etichette QR e attaccale: davanti agli armadi, sulle scansie, sulle scatole.', wz_print:'Stampa {n} etichette QR', wz_goto:'Vai alle ubicazioni', wz_close:'Chiudi',
  wz_where:'Archivio', wz_new_arch:'nuovo archivio', an_nest:'Annida ubicazioni', an_nest_d:'Mappa il magazzino: scansiona un armadio, poi le scansie da mettere dentro.', an_ask:'Sposta {c} dentro {p}?', an_ask_hint:'Scansiona di nuovo {c} oppure premi Sì per confermare.',
  an_yes:'Sì, sposta', an_no:'No, apri {c}', an_done:'{c} ora è dentro {p}', an_undo:'Annulla spostamento', an_undone:'{c} rimessa dov\'era', an_anchor:'Contenitore: {c}',
  lg_g_archive:'Archivi', 'lga_archive.create':'Archivio creato', 'lga_archive.edit':'Archivio modificato', 'lga_archive.merge':'Archivi uniti', 'lga_archive.delete':'Archivio eliminato', 'lga_archive.setup':'Archivio configurato', 'lga_binder.archive':'Faldoni spostati di archivio',
  jr_t_archive:'archivio', sv_seed_ar:'{n} archivi', ar_n_arch:'{n} archivi', ar_n_arch1:'1 archivio'
});
Object.assign(I18N.en, {
  in_arch:'Archives', in_d_arch:'Separate archives of the office (e.g. current, historical, a public body, a second warehouse): every binder and every location tree belongs to one archive.',
  ar_all:'All archives', ar_switch:'Archive', ar_new:'New archive', ar_edit:'Edit archive', ar_name:'Name', ar_name_ph:'e.g. Historical archive', ar_code:'Short code', ar_code_hint:'1-8 letters or digits, e.g. ST, COM', ar_color:'Colour', ar_desc:'Description', ar_desc_ph:'optional, e.g. Binders closed until 2020',
  ar_default_badge:'Default', ar_open:'Open', ar_setup:'Set up archive', ar_merge:'Merge into…', ar_del:'Delete', ar_saved:'Archive saved: {n}', ar_created:'Archive created: {n}',
  ar_n_binders:'{n} binders', ar_n_binder1:'1 binder', ar_n_locs:'{n} locations', ar_n_qr:'{n} QR', ar_levels:'Levels', ar_levels_global:'office levels', ar_no_tree:'No locations: use "Set up archive".',
  ar_p:'An office can keep several separate archives: the data stays split (binders, locations, printing, exports). Choose the archive at the top; "All archives" shows everything.',
  ar_e_name:'The name is required.', ar_e_code:'Code already used by another archive.', ar_merge_t:'Merge {n} into another archive', ar_merge_into:'Move everything to', ar_merge_d:'{b} binders and {l} locations move to "{t}". The archive "{n}" is deleted.',
  ar_merged:'Merged "{n}" into "{t}"', ar_del_d:'Delete the empty archive "{n}"?', ar_deleted:'Archive deleted: {n}', ar_not_empty:'The archive holds data: use "Merge into…".',
  ar_move_btn:'Archive…', ar_move_t:'Move {n} binders to an archive', ar_move_go:'Move', ar_moved:'{n} binders moved to "{t}"', ar_moved_out:'{k} taken out of their location (it belonged to another archive)',
  ar_ed_label:'Archive', ar_ed_moved_loc:'The location belonged to another archive: the binder was taken out of the box.', ar_print_only:'Only the archive {n}', ar_ex_h:'Archive to export', ar_ex_d:'qr7 manifest, full CSV and register: all archives or just one. The JSON backup always holds everything.',
  ar_unknown:'Archive not synced yet', ar_facet:'Archive', ar_root_of:'Archive {n}', ar_lv_t:'Levels of the archive {n}', ar_lv_qr:'QR', ar_lv_qr_d:'QR label on this level', ar_lv_studio:'Use the office levels',
  ar_lv_p:'Level names and prefixes of this archive, from the largest to the smallest (1-8). "QR" marks the levels that get a label.', ar_sel_qr:'Select QR levels',
  wz_t:'Set up archive', wz_t_new:'New archive', wz_s1:'Template', wz_s2:'Levels', wz_s3:'Preview', wz_s4:'Done', wz_next:'Next', wz_back:'Back', wz_create:'Create the archive', wz_tpl_h:'What does the archive look like?',
  wz_tpl_p:'Choose the closest template: in the next step you change names, prefixes and quantities.', wz_lv_h:'Levels, quantities and QR', wz_lv_p:'For each level: how many inside each one of the level above. Tick QR where you want a label (e.g. on the cabinet front, on every shelving unit, on the boxes).',
  wz_lv_name:'Level', wz_lv_prefix:'Prefix', wz_lv_n:'How many', wz_lv_each:'in each {l}', wz_lv_first:'in all', wz_lv_add:'Add level', wz_lv_del:'Remove level', wz_pv_h:'This is what will be created', wz_pv_total:'{n} locations', wz_pv_qr:'{n} QR labels to print',
  wz_pv_codes:'Codes, first to last', wz_pv_tree:'First branch', wz_pv_none:'No locations: enter at least one quantity.', wz_pv_max:'Too many locations at once (at most {n}).', wz_pv_exist:'The archive already has {n} locations: the new ones are added with the next numbers.',
  wz_done_h:'Archive ready', wz_done_p:'{n} locations created in "{a}". Now print the QR labels and stick them: on the cabinet fronts, on the shelving units, on the boxes.', wz_print:'Print {n} QR labels', wz_goto:'Go to the locations', wz_close:'Close',
  wz_where:'Archive', wz_new_arch:'new archive', an_nest:'Nest locations', an_nest_d:'Map the warehouse: scan a cabinet, then the shelving units to put inside it.', an_ask:'Move {c} into {p}?', an_ask_hint:'Scan {c} again or press Yes to confirm.',
  an_yes:'Yes, move it', an_no:'No, open {c}', an_done:'{c} is now inside {p}', an_undo:'Undo move', an_undone:'{c} put back where it was', an_anchor:'Container: {c}',
  lg_g_archive:'Archives', 'lga_archive.create':'Archive created', 'lga_archive.edit':'Archive edited', 'lga_archive.merge':'Archives merged', 'lga_archive.delete':'Archive deleted', 'lga_archive.setup':'Archive set up', 'lga_binder.archive':'Binders moved to another archive',
  jr_t_archive:'archive', sv_seed_ar:'{n} archives', ar_n_arch:'{n} archives', ar_n_arch1:'1 archive'
});
if (!ICONS.back) ICONS.back = '<path d="m15 18-6-6 6-6"/>';
if (typeof LOG_GROUPS !== 'undefined' && !LOG_GROUPS.includes('archive')) LOG_GROUPS.push('archive');
if (typeof LOG_FIELD_IT !== 'undefined') Object.assign(LOG_FIELD_IT, {archive_id:'archivio'});
{ const i = INFO_TABS.findIndex(x => x[0] === 'loc'); INFO_TABS.splice(i >= 0 ? i : INFO_TABS.length, 0, ['arch', 'warehouse']); }

const AR = { exArch:'', export:null, nestLast:null };
const WZ = { st:null };

/* ---------------- helpers ---------------- */
const arLT = (l) => typeof logBT === 'function' ? logBT(l) : null;
function arTarget(a){ return a ? {type:'archive', id:a.id, code:a.code || archName(a)} : null; }
/** 05-views filteredBinders: binder of the archive chosen in the switcher ('' = all). */
function archBinderVisible(b){ const sel = archSelected(); return !sel || binderArchiveId(b) === archKey(sel); }
function archCounts(){
  const c = new Map(); const get = (k) => c.get(k) || c.set(k, {b:0, l:0, roots:0, qr:0}).get(k);
  S.binders.forEach(b => { if (!(S.settings.hideDemo && isDemo(b))) get(binderArchiveId(b)).b++; });
  locArr().forEach(l => { const x = get(archKey(l.archive_id)); x.l++; if (!l.parent_id) x.roots++; });
  return c;
}
function archCountOf(id){ return archCounts().get(archKey(id)) || {b:0, l:0, roots:0, qr:0}; }
/** The stored record of an archive (the virtual default one is created on first edit). */
function archMaterialize(id){
  const k = archKey(id); if (!Array.isArray(S.archives)) S.archives = [];
  let a = S.archives.find(x => x.id === (k || ARCH_DEFAULT_ID));
  if (!a && !k){ a = normalizeArchive(clone(archVirtualDefault())); S.archives.push(a); }
  return a || null;
}
function archTouch(a){ a.updated_at = typeof syNext === 'function' ? syNext(a.updated_at, nowISO()) : nowISO(); }
function archCreate(o){
  o = o || {};
  if (!Array.isArray(S.archives)) S.archives = [];
  const used = new Set(archList().map(a => a.color));
  const name = String(o.name || '').replace(/\s+/g, ' ').trim();
  const a = normalizeArchive({id:uuid(), name, code:archCodeClean(o.code) || archSuggestCode(name), color:normHex(o.color) || ARCH_COLORS.find(c => !used.has(c)) || ARCH_COLORS[archList().length % ARCH_COLORS.length],
    description:o.description || '', sort:archList().length, created_at:nowISO()});
  if (archList().some(x => x.code === a.code)) a.code = archSuggestCode(a.code + '2');
  S.archives.push(a);
  logAct('archive.create', arTarget(a), 'Creato l\'archivio ' + archName(a) + ' (' + a.code + ')', {name:a.name, code:a.code, color:a.color});
  return a;
}
function archSaveFields(id, f){
  const a = archMaterialize(id); if (!a) return null;
  const before = clone(a);
  if ('name' in f) a.name = String(f.name || '').replace(/\s+/g, ' ').trim();
  if ('code' in f) a.code = archCodeClean(f.code) || a.code;
  if ('color' in f) a.color = normHex(f.color) || a.color;
  if ('description' in f) a.description = String(f.description || '').trim();
  const changed = ['name', 'code', 'color', 'description'].filter(k => before[k] !== a[k]);
  if (!changed.length) return a;
  archTouch(a);
  logAct('archive.edit', arTarget(a), 'Modificato l\'archivio ' + archName(a) + ': ' + changed.join(', '), {changed:changed.reduce((o, k) => (o[k] = [before[k], a[k]], o), {})});
  return a;
}
/** Merge src into dst: binders, location roots (their subtree follows) and the levels stay with dst; src is deleted. */
function archMerge(srcId, dstId){
  const src = archById(srcId), dst = archById(dstId), sk = archKey(srcId), dk = archKey(dstId);
  if (!src || !dst || sk === dk || !sk) return null;   // the default archive is never merged away
  const now = nowISO(); let nb = 0, nl = 0;
  S.binders.forEach(b => { if (binderArchiveId(b) === sk || archKey(b.archive_id) === sk){ b.archive_id = dk; b.updated_at = now; nb++; } });
  locArr().forEach(l => { if (archKey(l.archive_id) === sk){ nl++; if (!l.parent_id){ l.archive_id = dk; l.updated_at = now; } } });
  locIntegrity();
  S.archives = S.archives.filter(a => a.id !== sk);
  if (archKey(S.archiveSel) === sk || !archMulti()) S.archiveSel = archMulti() ? (dk || ARCH_DEFAULT_ID) : '';
  logAct('archive.merge', arTarget(dst), 'Unito l\'archivio ' + archName(src) + ' in ' + archName(dst) + ': ' + nb + ' faldoni, ' + nl + ' ubicazioni', {from:{id:src.id, code:src.code, name:archName(src)}, to:{id:dst.id, code:dst.code, name:archName(dst)}, binders:nb, locations:nl});
  return {binders:nb, locations:nl};
}
/** Move binders to an archive. A binder in a box of another archive leaves the box (it cannot be in two archives). */
function archMoveBinders(list, dstId){
  const dk = archKey(dstId), now = nowISO(), moved = [], out = [];
  list.forEach(b => {
    if (binderArchiveId(b) === dk && archKey(b.archive_id) === dk) return;
    const from = binderArchiveId(b);
    if (b.location_id && locById(b.location_id) && locArchiveId(locById(b.location_id)) !== dk){ out.push(b.speaking_code); b.location_id = ''; b.location_code = binderLocCode(b); }
    b.archive_id = dk; b.updated_at = now; moved.push({b, from});
  });
  if (moved.length){ const dst = archById(dk);
    logAct('binder.archive', moved.length === 1 ? logBT(moved[0].b) : arTarget(dst), (moved.length === 1 ? 'Spostato il faldone ' + moved[0].b.speaking_code : 'Spostati ' + moved.length + ' faldoni') + ' nell\'archivio ' + archName(dst) + (out.length ? ' (' + out.length + ' tolti dalla loro ubicazione)' : ''),
      {to:{id:dst.id, code:dst.code}, binders:moved.slice(0, 500).map(m => ({id:m.b.id, code:m.b.speaking_code, from:m.from})), unplaced:out.slice(0, 200)}); }
  return {moved:moved.length, unplaced:out.length};
}
/** Nominal level of a node: the position of its kind among the archive levels, else its depth. */
function archNomLevel(l){
  if (!l) return 0;
  const L = archWithCtx(locArchiveId(l), () => locLevels()), k = String(l.kind || '').trim().toLowerCase();
  const i = k ? L.findIndex(x => x.name.toLowerCase() === k) : -1;
  return i >= 0 ? i : (l.level || 0);
}
function archQrLevelSet(id){ const a = archById(id); return new Set(a && a.qr_levels && a.qr_levels.length ? a.qr_levels : [archWithCtx(id, () => locLevels().length - 1)]); }
/** Run fn with the location index limited to one archive (render of the tree / filters). '' sel = all archives. */
function archScoped(fn, id){
  const sel = id != null ? id : archSelected(); if (!sel && id == null) return fn();
  const k = archKey(sel), keep = LOC_IDX.override, arr = (keep || (Array.isArray(S.locations) ? S.locations : [])).filter(l => archKey(l.archive_id) === k);
  locIndexUse(arr);
  try { return archWithCtx(k, fn); } finally { locIndexUse(keep); }
}
function archDot(a, cls){ return '<span class="ar-dot' + (cls ? ' ' + cls : '') + '" style="background:' + esc(a ? a.color : '#94A3B8') + '" aria-hidden="true"></span>'; }
function archChip(a){ return a ? '<span class="ar-chip" title="' + esc(archName(a)) + '">' + archDot(a) + esc(a.code || archName(a)) + '</span>' : '<span class="ar-chip unk" title="' + esc(t('ar_unknown')) + '">?</span>'; }
function archOptionsHTML(cur, withAll){
  return (withAll ? '<option value=""' + (!cur ? ' selected' : '') + '>' + esc(t('ar_all')) + '</option>' : '') +
    archList().map(a => '<option value="' + esc(a.id) + '"' + (cur && archKey(cur) === archKey(a.id) ? ' selected' : '') + '>' + esc((a.code ? a.code + ' · ' : '') + archName(a)) + '</option>').join('');
}
function archSetSel(id){
  const v = id ? (archKey(id) || ARCH_DEFAULT_ID) : '';
  if (v === String(S.archiveSel || '')) return;
  S.archiveSel = v; UI.fLoc = '';
  if (typeof LUI !== 'undefined' && LUI.sel){ const l = locById(LUI.sel); if (!l || (v && archKey(l.archive_id) !== archKey(v))) LUI.sel = ''; }
  savePrefs(); renderAll();
}

/* ---------------- top bar switcher ---------------- */
function archSwitcherHTML(){
  if (!archMulti()) return '';
  const sel = archSelected(), a = sel ? archById(sel) : null, tip = t('ar_switch') + ': ' + (a ? archName(a) : t('ar_all'));
  // the native <select> lies transparent over a compact face (dot + code; the name too on wide screens)
  return '<label class="ar-sw' + (a ? ' on' : '') + '" id="ar-sw" title="' + esc(tip) + '"' + (a ? ' style="--ar:' + esc(a.color) + '"' : '') + '>' + (a ? archDot(a) : ic('layers')) +
    (a ? '<b class="ar-sw-code mono">' + esc(a.code || '·') + '</b><span class="ar-sw-name">' + esc(archName(a)) + '</span>' : '<span class="ar-sw-name">' + esc(t('ar_all')) + '</span>') +
    '<select data-arch-switch="1" id="ar-sw-sel" aria-label="' + esc(t('ar_switch')) + '">' + archOptionsHTML(sel, true) + '</select>' + ic('chevron', 'ar-sw-chev') + '</label>';
}

/* ---------------- Informazioni › Archivi ---------------- */
function archLevelChain(a){
  const own = archOwnLevels(a.id), L = own ? own : locLevels(S.settings), qr = archQrLevelSet(a.id);
  return '<div class="ar-chain">' + L.map((x, i) => '<span class="ar-lv' + (qr.has(i) ? ' qr' : '') + '">' + esc(x.name) + (qr.has(i) ? ic('qr') : '') + '</span>').join(ic('chevr', 'ar-sep')) + (own ? '' : '<span class="muted tiny">· ' + esc(t('ar_levels_global')) + '</span>') + '</div>';
}
function archPanelHTML(){
  const C = archCounts(), list = archList(), sel = archSelected();
  return '<div class="toolbar ar-tools"><button class="btn btn-primary" data-a="ar-new" id="ar-new">' + ic('plus') + esc(t('ar_new')) + '</button>' +
      '<button class="btn" data-a="ar-setup" data-id="' + esc(archCurrentId() || ARCH_DEFAULT_ID) + '" id="ar-setup-cur">' + ic('layers') + esc(t('ar_setup')) + '</button><span class="tb-sp"></span>' +
      '<span class="small muted">' + esc(list.length === 1 ? t('ar_n_arch1') : t('ar_n_arch', {n:list.length})) + '</span></div>' +
    '<div class="info-intro">' + ic('warehouse') + '<span>' + esc(t('ar_p')) + '</span></div>' +
    '<div class="ar-grid" id="ar-grid">' + list.map(a => {
      const c = C.get(archKey(a.id)) || {b:0, l:0, roots:0}, isDef = archIsDefault(a), cur = sel && archKey(sel) === archKey(a.id);
      return '<article class="ar-card' + (cur ? ' cur' : '') + '" style="--ar:' + esc(a.color) + '" data-arch="' + esc(a.id) + '">' +
        '<div class="ar-c-h">' + archDot(a, 'lg') + '<div class="ar-c-t"><h3>' + esc(archName(a)) + '</h3><div class="ar-c-sub"><span class="ar-code mono">' + esc(a.code || '—') + '</span>' + (isDef ? '<span class="badge">' + esc(t('ar_default_badge')) + '</span>' : '') + '</div></div>' +
          '<button class="icon-btn" data-a="ar-edit" data-id="' + esc(a.id) + '" title="' + esc(t('ar_edit')) + '" aria-label="' + esc(t('ar_edit')) + '">' + ic('pencil') + '</button></div>' +
        (a.description ? '<p class="ar-c-d">' + esc(a.description) + '</p>' : '') +
        '<div class="ar-stats"><span><b>' + c.b + '</b> ' + esc(c.b === 1 ? t('ar_n_binder1').replace(/^1 /, '') : t('ar_n_binders', {n:''}).trim()) + '</span><span><b>' + c.l + '</b> ' + esc(t('ar_n_locs', {n:''}).trim()) + '</span></div>' +
        (c.l ? archLevelChain(a) : '<div class="ar-empty small muted">' + esc(t('ar_no_tree')) + '</div>') +
        '<div class="ar-acts"><button class="btn btn-sm' + (cur ? ' btn-dark' : '') + '" data-a="ar-open" data-id="' + esc(a.id) + '">' + ic('archive') + esc(t('ar_open')) + '</button>' +
          '<button class="btn btn-sm btn-primary" data-a="ar-setup" data-id="' + esc(a.id) + '">' + ic('layers') + esc(t('ar_setup')) + '</button>' +
          (isDef ? '' : '<span class="tb-sp"></span><button class="btn btn-sm" data-a="ar-merge" data-id="' + esc(a.id) + '">' + ic('merge') + esc(t('ar_merge')) + '</button>' +
            (c.b || c.l ? '' : '<button class="icon-btn danger" data-a="ar-del" data-id="' + esc(a.id) + '" title="' + esc(t('ar_del')) + '" aria-label="' + esc(t('ar_del')) + '">' + ic('trash') + '</button>')) + '</div></article>';
    }).join('') + '</div>';
}
function archRender(){ if (S.view === 'info' && infoTab() === 'arch'){ const p = $('#info-panel'); if (p) p.innerHTML = archPanelHTML(); const n = $('.info-tabs [data-v="arch"] .it-n'); if (n) n.textContent = archList().length; } }

/* ---------------- dialogs: edit / new, merge, move ---------------- */
function archOpenEdit(id){
  const a = id ? archById(id) : null, isNew = !a;
  const d = {name:a ? a.name : '', code:a ? a.code : '', color:a ? a.color : (ARCH_COLORS.find(c => !archList().some(x => x.color === c)) || ARCH_COLORS[1]), description:a ? a.description : ''};
  const sw = () => ARCH_COLORS.map(c => '<button type="button" class="sw' + (c === d.color ? ' on' : '') + '" data-a="ar-color" data-c="' + c + '" style="background:' + c + '" aria-label="' + c + '"></button>').join('');
  openModal({title:isNew ? t('ar_new') : t('ar_edit'), body:'<div class="stack" id="ar-form">' +
      '<div class="grid g2"><div class="field"><label for="ar-f-name">' + esc(t('ar_name')) + '</label><input class="inp" id="ar-f-name" value="' + esc(a ? archName(a) : '') + '" placeholder="' + esc(t('ar_name_ph')) + '" autocomplete="off"><div class="err-t" id="ar-e-name"></div></div>' +
      '<div class="field"><label for="ar-f-code">' + esc(t('ar_code')) + '</label><input class="inp mono" id="ar-f-code" value="' + esc(d.code) + '" maxlength="8" autocomplete="off" spellcheck="false" style="text-transform:uppercase"><div class="hint">' + esc(t('ar_code_hint')) + '</div><div class="err-t" id="ar-e-code"></div></div></div>' +
      '<div class="field"><label>' + esc(t('ar_color')) + '</label><div class="swatches" id="ar-f-color">' + sw() + '</div></div>' +
      '<div class="field"><label for="ar-f-desc">' + esc(t('ar_desc')) + '</label><input class="inp" id="ar-f-desc" value="' + esc(d.description) + '" placeholder="' + esc(t('ar_desc_ph')) + '"></div></div>',
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:isNew ? t('wz_next') : t('save'), cls:'btn btn-primary', icon:isNew ? 'chevr' : 'save', fn:() => {
      const name = $('#ar-f-name').value.trim(), code = archCodeClean($('#ar-f-code').value) || archSuggestCode(name, a && a.id), desc = $('#ar-f-desc').value;
      $('#ar-e-name').textContent = ''; $('#ar-e-code').textContent = '';
      if (!name && !(a && archIsDefault(a))){ $('#ar-e-name').textContent = t('ar_e_name'); return; }
      if (archList().some(x => x.code === code && (!a || x.id !== a.id))){ $('#ar-e-code').textContent = t('ar_e_code'); return; }
      closeModal(true);
      if (isNew){ archWizardOpen(null, {name, code, color:d.color, description:desc}); return; }
      archSaveFields(a.id, {name:archIsDefault(a) && name === t('ar_default_name') ? a.name : name, code, color:d.color, description:desc}); commit(); renderAll(); toast(t('ar_saved', {n:archName(archById(a.id))}));
    }}],
    onMount:() => {
      const box = $('#ar-f-color'); box.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; e.stopPropagation(); d.color = b.dataset.c; box.innerHTML = sw(); });
      const n = $('#ar-f-name'), c = $('#ar-f-code'); let touched = !!(a && a.code);
      c.addEventListener('input', () => { touched = true; }); n.addEventListener('input', () => { if (!touched) c.value = archSuggestCode(n.value, a && a.id); });
      setTimeout(() => n.focus(), 30);
    }});
}
function archOpenMerge(id){
  const src = archById(id); if (!src || archIsDefault(src)) return;
  const c = archCountOf(id), others = archList().filter(a => a.id !== src.id);
  let to = archKey(others[0].id);
  const detail = () => t('ar_merge_d', {b:c.b, l:c.l, t:archName(archById(to)), n:archName(src)});
  openModal({title:t('ar_merge_t', {n:archName(src)}), body:'<div class="stack"><div class="field"><label for="ar-merge-to">' + esc(t('ar_merge_into')) + '</label><select class="inp" id="ar-merge-to">' + others.map(a => '<option value="' + esc(a.id) + '">' + esc((a.code ? a.code + ' · ' : '') + archName(a)) + '</option>').join('') + '</select></div><div class="warn-box small">' + ic('alert') + '<div id="ar-merge-d">' + esc(detail()) + '</div></div></div>',
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('ar_merge').replace('…', ''), cls:'btn btn-primary', icon:'merge', fn:() => {
      undoPoint(); const dst = archById(to), r = archMerge(src.id, to); closeModal(true); if (!r) return;
      commit(); renderAll(); undoToast(t('ar_merged', {n:archName(src), t:archName(dst)}));
    }}],
    onMount:() => { const s = $('#ar-merge-to'); s.addEventListener('change', () => { to = archKey(s.value); $('#ar-merge-d').textContent = detail(); }); }});
}
function archDelete(id){
  const a = archById(id); if (!a || archIsDefault(a)) return;
  const c = archCountOf(id); if (c.b || c.l){ toast(t('ar_not_empty'), 'warn'); return archOpenMerge(id); }
  confirmAction({plain:true, danger:true, okLabel:t('ar_del'), detail:t('ar_del_d', {n:archName(a)}), onOk:() => {
    undoPoint();
    S.archives = S.archives.filter(x => x.id !== a.id);
    if (archKey(S.archiveSel) === a.id || !archMulti()) S.archiveSel = '';
    logAct('archive.delete', arTarget(a), 'Eliminato l\'archivio vuoto ' + archName(a) + ' (' + a.code + ')', {name:a.name, code:a.code});
    commit(); renderAll(); undoToast(t('ar_deleted', {n:archName(a)}));
  }});
}
function archOpenMove(ids){
  const list = S.binders.filter(b => ids.includes(b.id)); if (!list.length) return;
  let to = archCurrentId() || '';
  openModal({title:t('ar_move_t', {n:list.length}), body:'<div class="stack"><div class="ar-pick" id="ar-pick" role="radiogroup">' + archList().map(a => '<label class="ar-opt"><input type="radio" name="ar-to" value="' + esc(a.id) + '"' + (archKey(a.id) === to ? ' checked' : '') + '>' + archDot(a) + '<b>' + esc(archName(a)) + '</b><span class="mono muted">' + esc(a.code) + '</span></label>').join('') + '</div>' +
      '<div class="small muted">' + list.slice(0, 12).map(b => esc(b.speaking_code)).join(', ') + (list.length > 12 ? ' …' : '') + '</div></div>',
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('ar_move_go'), cls:'btn btn-primary', icon:'move', fn:() => {
      const r0 = $('#ar-pick input:checked'); to = archKey(r0 ? r0.value : to);
      undoPoint(); const r = archMoveBinders(list, to); closeModal(true); commit(); renderView();
      undoToast(t('ar_moved', {n:r.moved, t:archName(archById(to))}) + (r.unplaced ? ' · ' + t('ar_moved_out', {k:r.unplaced}) : ''));
    }}]});
}

/* ---------------- per-archive levels (replaces "Livelli…" of Ubicazioni) ---------------- */
function archOpenLevels(id){
  const k = archKey(id != null ? id : archCurrentId()), a = archById(k), isDef = !k;
  const own = archOwnLevels(k), qr = archQrLevelSet(k);
  let rows = (own || locLevels(S.settings)).map((x, i) => ({name:x.name, prefix:x.prefix, qr:qr.has(i)}));
  const draw = () => { const b = $('#ar-lv'); if (!b) return; b.innerHTML = rows.map((x, i) => '<div class="ar-lv-r"><span class="lo-lv-n">' + (i + 1) + '</span><input class="inp" data-ar-lv="name" data-i="' + i + '" value="' + esc(x.name) + '" aria-label="' + esc(t('lo_lv_name')) + '"><input class="inp mono" data-ar-lv="prefix" data-i="' + i + '" value="' + esc(x.prefix) + '" maxlength="8" aria-label="' + esc(t('lo_lv_prefix')) + '">' +
      '<label class="chk ar-qr" title="' + esc(t('ar_lv_qr_d')) + '"><input type="checkbox" data-ar-lv="qr" data-i="' + i + '"' + (x.qr ? ' checked' : '') + '>' + esc(t('ar_lv_qr')) + '</label>' +
      '<button type="button" class="icon-btn danger" data-ar-lvdel="' + i + '"' + (rows.length < 2 ? ' disabled' : '') + ' aria-label="' + esc(t('lo_del')) + '">' + ic('trash') + '</button></div>').join('') +
    '<div class="row"><button type="button" class="btn btn-sm" data-ar-lvadd="1"' + (rows.length >= LOC_MAX_DEPTH ? ' disabled' : '') + '>' + ic('plus') + esc(t('lo_lv_add')) + '</button><button type="button" class="btn btn-sm" data-ar-lvreset="1">' + ic('refresh') + esc(isDef ? t('lo_lv_reset') : t('ar_lv_studio')) + '</button></div>'; };
  openModal({title:t('ar_lv_t', {n:archName(a)}), size:'lg', body:'<div class="stack"><p class="hint">' + esc(t('ar_lv_p')) + '</p><div class="ar-lv-h"><span></span><span>' + esc(t('lo_lv_name')) + '</span><span>' + esc(t('lo_lv_prefix')) + '</span><span>' + esc(t('ar_lv_qr')) + '</span><span></span></div><div class="stack" id="ar-lv"></div></div>',
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('save'), cls:'btn btn-primary', icon:'save', fn:() => {
      const L = rows.map((x, i) => ({name:String(x.name || '').trim() || t('lo_lv_n', {n:i + 1}), prefix:locSegClean(x.prefix) || 'L' + (i + 1)}));
      archSaveLevels(k, rows === null ? null : L, rows.map((x, i) => x.qr ? i : -1).filter(i => i >= 0));
      commit({dirty:false}); closeModal(true); if (typeof locRender === 'function') locRender(); archRender(); toast(t('lo_lv_saved'));
    }}],
    onMount:() => {
      draw(); const b = $('#ar-lv');
      b.addEventListener('input', (e) => { const el = e.target, x = rows[+el.dataset.i]; if (!x || !el.dataset.arLv) return; if (el.dataset.arLv === 'qr') x.qr = el.checked; else x[el.dataset.arLv] = el.value; });
      b.addEventListener('click', (e) => {
        const del = e.target.closest('[data-ar-lvdel]'), add = e.target.closest('[data-ar-lvadd]'), rs = e.target.closest('[data-ar-lvreset]');
        if (del && rows.length > 1){ rows.splice(+del.dataset.arLvdel, 1); draw(); }
        else if (add && rows.length < LOC_MAX_DEPTH){ rows.push({name:t('lo_lv_n', {n:rows.length + 1}), prefix:'L' + (rows.length + 1), qr:false}); draw(); }
        else if (rs){ rows = (isDef ? locLevels({}) : locLevels(S.settings)).map((x, i, all) => ({name:x.name, prefix:x.prefix, qr:i === all.length - 1})); draw(); }
      });
    }});
}
/** Levels of an archive. Default archive: the v11 setting S.settings.locLevels (+ locLevelsAt, synced as before);
    other archives: archive.levels ([] when equal to the office levels). qr: level indices with a QR label. */
function archSaveLevels(id, L, qr){
  const k = archKey(id);
  const sig = (arr) => (arr || []).map(x => x.name + '|' + x.prefix).join();
  let changed = false;
  if (!k){
    const before = JSON.stringify(S.settings.locLevels || null), def = sig(locLevels({}));
    S.settings.locLevels = sig(L) === def ? [] : L;
    if (JSON.stringify(S.settings.locLevels) !== before){ S.settings.locLevelsAt = nowISO(); changed = true; }
  }
  const a = archById(k);
  const own = k ? (sig(L) === sig(locLevels(S.settings)) ? [] : L) : (a && a.levels) || [];
  const qrNorm = (qr || []).slice().sort((x, y) => x - y), qrDef = [L.length - 1];
  const qrStore = qrNorm.join() === qrDef.join() ? [] : qrNorm;
  if (k ? (sig(a.levels) !== sig(own) || (a.qr_levels || []).join() !== qrStore.join()) : (a.qr_levels || []).join() !== qrStore.join()){
    const r = archMaterialize(k); r.levels = own; r.qr_levels = qrStore; archTouch(r); changed = true;
  }
  if (changed) logAct('location.levels', arTarget(archById(k)), 'Livelli dell\'archivio ' + archName(archById(k)) + ': ' + L.map((x, i) => x.name + ' (' + x.prefix + ')' + (qrNorm.includes(i) ? ' [QR]' : '')).join(' › '), {archive:k || ARCH_DEFAULT_ID, levels:L, qr_levels:qrNorm});
  return changed;
}

/* ---------------- "Configura archivio" wizard ---------------- */
function wzRowsFromTemplate(tid, archId){
  const tp = archTemplate(tid), lang = S.lang === 'en' ? 'en' : 'it';
  if (tp && tp.levels) return tp.levels.map(x => ({name:x[lang], prefix:x.prefix, n:x.n, qr:!!x.qr}));
  const L = archWithCtx(archId || '', () => locLevels()), qr = archQrLevelSet(archId || '');
  return L.map((x, i) => ({name:x.name, prefix:x.prefix, n:i === 0 ? 1 : i === L.length - 1 ? 10 : 2, qr:qr.has(i)}));
}
function archWizardOpen(archId, newArch){
  const k = archId != null ? archKey(archId) : null;
  const has = k != null && archScoped(() => locArr().length, k || ARCH_DEFAULT_ID);
  WZ.st = {step:1, arch:k, isNew:k == null, nw:newArch || null, tpl:has ? 'custom' : 'studio', rows:null, made:[], existing:has || 0};
  WZ.st.rows = wzRowsFromTemplate(WZ.st.tpl, k || '');
  openModal({title:WZ.st.isNew ? t('wz_t_new') : t('wz_t') + ' · ' + archName(archById(k)), size:'lg', body:'<div id="wz" class="wz"></div>', autofocus:false, onMount:wzRender, onClose:() => { WZ.st = null; }});
}
function wzActive(){ const W = WZ.st; if (!W) return null; return W.rows.slice(0, Math.max(0, W.rows.findIndex(r => !(r.n > 0)) < 0 ? W.rows.length : W.rows.findIndex(r => !(r.n > 0)))); }
function wzCounts(){
  const rows = wzActive() || []; let mult = 1, total = 0, qr = 0; const per = [];
  rows.forEach(r => { mult *= r.n; total += mult; if (r.qr) qr += mult; per.push(mult); });
  return {rows, total, qr, per};
}
/** Example codes (first and last leaf) and the first branch, as they will be created. */
function wzExamples(){
  const W = WZ.st, rows = wzActive() || []; if (!rows.length) return {first:'', last:'', branch:[]};
  const pad = (i) => i === rows.length - 1 ? 2 : 1;
  const root0 = archWithCtx(W.arch || '', () => locNextSeg('', 0, rows[0].prefix, 1));
  const m = root0.match(/(\d+)$/), start = m ? +m[1] : 1, rp = locSegClean(rows[0].prefix);
  const seg = (i, k) => i === 0 ? rp + String(start + k) : locSegClean(rows[i].prefix) + String(k + 1).padStart(pad(i), '0');
  const first = rows.map((r, i) => seg(i, 0)), last = rows.map((r, i) => seg(i, Math.max(0, r.n - 1)));
  return {first:first.join('-'), last:last.join('-'), branch:rows.map((r, i) => ({name:r.name, seg:seg(i, 0), n:r.n, qr:r.qr}))};
}
function wzStepsHTML(){
  const W = WZ.st, names = ['wz_s1', 'wz_s2', 'wz_s3', 'wz_s4'];
  return '<ol class="wz-steps" aria-label="' + esc(t('wz_t')) + '">' + names.map((n, i) => '<li class="' + (W.step === i + 1 ? 'on' : W.step > i + 1 ? 'done' : '') + '"' + (W.step === i + 1 ? ' aria-current="step"' : '') + '><span class="wz-n">' + (W.step > i + 1 ? ic('check') : i + 1) + '</span><span>' + esc(t(n)) + '</span></li>').join('') + '</ol>';
}
function wzBodyHTML(){
  const W = WZ.st, lang = S.lang === 'en' ? 'en' : 'it';
  if (W.step === 1){
    const a = W.isNew ? null : archById(W.arch);
    return '<div class="wz-where">' + (W.isNew ? archDot({color:W.nw.color}) + '<b>' + esc(W.nw.name) + '</b><span class="mono muted">' + esc(W.nw.code) + '</span><span class="badge">' + esc(t('wz_new_arch')) + '</span>' : archDot(a) + '<b>' + esc(archName(a)) + '</b><span class="mono muted">' + esc(a.code) + '</span>') + '</div>' +
      '<h3 class="wz-h">' + esc(t('wz_tpl_h')) + '</h3><p class="hint">' + esc(t('wz_tpl_p')) + '</p>' +
      '<div class="wz-tpls" role="radiogroup">' + ARCH_TEMPLATES.map(tp => {
        const chain = tp.levels ? tp.levels.map(x => x[lang]) : (archWithCtx(W.arch || '', () => locLevels())).map(x => x.name);
        return '<button type="button" role="radio" aria-checked="' + (W.tpl === tp.id) + '" class="wz-tpl' + (W.tpl === tp.id ? ' on' : '') + '" data-a="wz-tpl" data-t="' + tp.id + '" id="wz-tpl-' + tp.id + '"><span class="wz-tpl-ic">' + ic(tp.icon) + '</span><b>' + esc(tp.name[lang]) + '</b><small>' + esc(tp.desc[lang]) + '</small>' +
          '<span class="wz-chain">' + chain.map(esc).join(' › ') + '</span></button>';
      }).join('') + '</div>';
  }
  if (W.step === 2){
    return '<h3 class="wz-h">' + esc(t('wz_lv_h')) + '</h3><p class="hint">' + esc(t('wz_lv_p')) + '</p>' +
      '<div class="wz-lv"><div class="wz-lv-h"><span></span><span>' + esc(t('wz_lv_name')) + '</span><span>' + esc(t('wz_lv_prefix')) + '</span><span>' + esc(t('wz_lv_n')) + '</span><span>' + esc(t('ar_lv_qr')) + '</span><span></span></div>' +
      W.rows.map((r, i) => '<div class="wz-lv-r"><span class="wz-lv-i" style="--d:' + i + '">' + (i + 1) + '</span>' +
        '<input class="inp" data-wz="name" data-i="' + i + '" value="' + esc(r.name) + '" aria-label="' + esc(t('wz_lv_name') + ' ' + (i + 1)) + '">' +
        '<input class="inp mono" data-wz="prefix" data-i="' + i + '" value="' + esc(r.prefix) + '" maxlength="8" aria-label="' + esc(t('wz_lv_prefix')) + '">' +
        '<span class="wz-n-wrap"><input class="inp mono" type="number" min="0" max="999" data-wz="n" data-i="' + i + '" value="' + r.n + '" aria-label="' + esc(t('wz_lv_n') + ' ' + r.name) + '"><small>' + esc(i ? t('wz_lv_each', {l:(W.rows[i - 1].name || '').toLowerCase()}) : t('wz_lv_first')) + '</small></span>' +
        '<label class="chk wz-qr" title="' + esc(t('ar_lv_qr_d')) + '"><input type="checkbox" data-wz="qr" data-i="' + i + '"' + (r.qr ? ' checked' : '') + ' aria-label="' + esc(t('ar_lv_qr_d') + ': ' + r.name) + '">' + ic('qr') + '</label>' +
        '<button type="button" class="icon-btn danger" data-a="wz-del" data-i="' + i + '"' + (W.rows.length < 2 ? ' disabled' : '') + ' aria-label="' + esc(t('wz_lv_del')) + '">' + ic('trash') + '</button></div>').join('') + '</div>' +
      '<div class="row"><button type="button" class="btn btn-sm" data-a="wz-add"' + (W.rows.length >= LOC_MAX_DEPTH ? ' disabled' : '') + '>' + ic('plus') + esc(t('wz_lv_add')) + '</button></div><div id="wz-live" class="wz-live" aria-live="polite">' + wzLiveHTML() + '</div>';
  }
  if (W.step === 3){
    const c = wzCounts(), ex = wzExamples();
    return '<h3 class="wz-h">' + esc(t('wz_pv_h')) + '</h3>' + (W.existing ? '<div class="info-box small">' + ic('info') + '<div>' + esc(t('wz_pv_exist', {n:W.existing})) + '</div></div>' : '') +
      (!c.total ? '<div class="warn-box small">' + ic('alert') + '<div>' + esc(t('wz_pv_none')) + '</div></div>' : c.total > LOC_BULK_MAX ? '<div class="danger-box small">' + ic('alert') + '<div>' + esc(t('wz_pv_max', {n:LOC_BULK_MAX})) + '</div></div>' : '') +
      '<div class="wz-kpis"><div class="wz-kpi"><b id="wz-total">' + c.total + '</b><span>' + esc(t('wz_pv_total', {n:''}).trim()) + '</span></div><div class="wz-kpi qr"><b id="wz-qr">' + c.qr + '</b><span>' + esc(t('wz_pv_qr', {n:''}).trim()) + '</span></div></div>' +
      '<div class="wz-pv-grid"><div><div class="lbl">' + esc(t('wz_pv_tree')) + '</div><ul class="wz-tree" id="wz-tree">' + ex.branch.map((x, i) => '<li style="--d:' + i + '"><span class="mono">' + esc(x.seg) + '</span><span>' + esc(x.name) + '</span><span class="muted tiny">× ' + x.n + '</span>' + (x.qr ? '<span class="wz-qr-b">' + ic('qr') + 'QR</span>' : '') + '</li>').join('') + '</ul></div>' +
      '<div><div class="lbl">' + esc(t('wz_pv_codes')) + '</div><div class="codebox wz-codes" id="wz-codes">' + esc(ex.first) + (ex.last && ex.last !== ex.first ? '\n…\n' + esc(ex.last) : '') + '</div>' +
      '<div class="wz-per">' + c.rows.map((r, i) => '<span>' + esc(c.per[i] + ' × ' + r.name.toLowerCase()) + (r.qr ? ' ' + ic('qr') : '') + '</span>').join('') + '</div></div></div>';
  }
  const leafIds = W.qrIds || [];
  return '<div class="wz-done"><div class="wz-done-ic">' + ic('check') + '</div><h3>' + esc(t('wz_done_h')) + '</h3><p>' + esc(t('wz_done_p', {n:W.made.length, a:archName(archById(W.arch))})) + '</p>' +
    '<div class="row" style="justify-content:center">' + (leafIds.length ? '<button class="btn btn-lg btn-primary" data-a="wz-print" id="wz-print">' + ic('printer') + esc(t('wz_print', {n:leafIds.length})) + '</button>' : '') +
    '<button class="btn btn-lg" data-a="wz-goto" id="wz-goto">' + ic('box') + esc(t('wz_goto')) + '</button></div></div>';
}
function wzLiveHTML(){ const c = wzCounts(); return c.total ? '<span>' + esc(t('wz_pv_total', {n:c.total})) + '</span> · <span>' + esc(t('wz_pv_qr', {n:c.qr})) + '</span>' : '<span class="muted">' + esc(t('wz_pv_none')) + '</span>'; }
function wzFootHTML(){
  const W = WZ.st, c = wzCounts();
  if (W.step === 4) return '<div class="wz-foot"><span class="tb-sp"></span><button class="btn" data-a="modal-close">' + esc(t('wz_close')) + '</button></div>';
  return '<div class="wz-foot">' + (W.step > 1 ? '<button class="btn" data-a="wz-back" id="wz-back">' + ic('back') + esc(t('wz_back')) + '</button>' : '<button class="btn" data-a="modal-close">' + esc(t('cancel')) + '</button>') + '<span class="tb-sp"></span>' +
    (W.step < 3 ? '<button class="btn btn-primary" data-a="wz-next" id="wz-next"' + (W.step === 2 && !c.total ? ' disabled' : '') + '>' + esc(t('wz_next')) + ic('chevr') + '</button>'
      : '<button class="btn btn-primary btn-lg" data-a="wz-create" id="wz-create"' + (!c.total || c.total > LOC_BULK_MAX ? ' disabled' : '') + '>' + ic('layers') + esc(t('wz_create')) + '</button>') + '</div>';
}
function wzRender(){ const b = $('#wz'); if (!b || !WZ.st) return; b.innerHTML = wzStepsHTML() + '<div class="wz-body">' + wzBodyHTML() + '</div>' + wzFootHTML(); }
/** Create the tree of the wizard. Roots get the next free numbers (never mixed with another archive's roots). */
function wzCreate(){
  const W = WZ.st, rows = wzActive(); if (!rows || !rows.length) return;
  undoPoint();
  let a = W.isNew ? archCreate(W.nw) : archById(W.arch); if (!a) return;
  const k = archKey(a.id), made = [], qrIds = [];
  const L = W.rows.map((r, i) => ({name:String(r.name || '').trim() || t('lo_lv_n', {n:i + 1}), prefix:locSegClean(r.prefix) || 'L' + (i + 1)}));
  archSaveLevels(k, L, W.rows.map((r, i) => r.qr ? i : -1).filter(i => i >= 0));
  archWithCtx(k, () => {
    const go = (pid, i) => {
      const r = rows[i]; if (!r) return;
      const name = L[i].name, pre = L[i].prefix, pad = i === rows.length - 1 ? 2 : 1;
      for (let n = 0; n < r.n && made.length < LOC_BULK_MAX; n++){
        let node;
        if (!pid) node = locCreate('', {seg:locNextSeg('', 0, pre, 1), kind:name, archive_id:k});
        else { const seg = pre + String(n + 1).padStart(pad, '0'); node = locChildren(pid).find(c => c.seg === seg) || null; if (!node) node = locCreate(pid, {seg, kind:name}); else { if (!node.kind) node.kind = name; } }
        if (!made.includes(node)) made.push(node);
        if (r.qr) qrIds.push(node.id);
        go(node.id, i + 1);
      }
    };
    go('', 0);
  });
  locAfterChange();
  logAct('archive.setup', arTarget(a), 'Configurato l\'archivio ' + archName(a) + ': ' + made.length + ' ubicazioni (' + L.slice(0, rows.length).map(x => x.name).join(' › ') + ')' + (made.length ? ' ' + made[0].code + ' … ' + made[made.length - 1].code : ''),
    {archive:k || ARCH_DEFAULT_ID, template:W.tpl, rows:rows.map((r, i) => ({level:i, name:L[i].name, prefix:L[i].prefix, n:r.n, qr:!!r.qr})), count:made.length, qr_labels:qrIds.length, codes:made.slice(0, 200).map(x => x.code)});
  if (archMulti()) S.archiveSel = k || ARCH_DEFAULT_ID;
  commit();
  W.arch = k; W.isNew = false; W.made = made; W.qrIds = qrIds; W.step = 4;
  if (typeof LUI !== 'undefined'){ LUI.checked = new Set(qrIds); if (made[0]){ LUI.sel = made[0].id; LUI.open.add(made[0].id); } }
  wzRender(); renderTopbar();
  if (S.view === 'info') renderView();
}

/* ---------------- DB hooks (06-db.js) ---------------- */
function archDbMigrate(db){
  db.exec('CREATE TABLE IF NOT EXISTS archives(id TEXT PRIMARY KEY, name TEXT, code TEXT, color TEXT, description TEXT, sort INTEGER DEFAULT 0, levels_json TEXT, qr_levels_json TEXT, created_at TEXT, updated_at TEXT)');   // v9 (v12)
  if (!dbQuery('PRAGMA table_info(binders)', null, db).some(r => r.name === 'archive_id')) db.exec('ALTER TABLE binders ADD COLUMN archive_id TEXT');   // NULL = default archive
  if (!dbQuery('PRAGMA table_info(locations)', null, db).some(r => r.name === 'archive_id')) db.exec('ALTER TABLE locations ADD COLUMN archive_id TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS ix_binders_archive ON binders(archive_id); CREATE INDEX IF NOT EXISTS ix_locations_archive ON locations(archive_id)');
}
function archDbSync(db){
  db.exec('DELETE FROM archives');
  const ins = db.prepare('INSERT OR REPLACE INTO archives(id,name,code,color,description,sort,levels_json,qr_levels_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
  archList().forEach(a => ins.run([a.id, a.name || '', a.code || '', a.color || '', a.description || '', a.sort | 0, a.levels && a.levels.length ? JSON.stringify(a.levels) : null, a.qr_levels && a.qr_levels.length ? JSON.stringify(a.qr_levels) : null, a.created_at || '', a.updated_at || '']));
  ins.free();
  const ub = db.prepare('UPDATE binders SET archive_id = ? WHERE id = ?');
  S.binders.forEach(b => { const k = binderArchiveId(b); if (k) ub.run([k, b.id]); });
  ub.free();
  const ul = db.prepare('UPDATE locations SET archive_id = ? WHERE id = ?');
  (S.locations || []).forEach(l => { const k = archKey(l.archive_id); if (k) ul.run([k, l.id]); });
  ul.free();
}
function archDbRead(db, W){
  const has = (tb) => dbQuery("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [tb], db).length > 0;
  const col = (tb, c) => has(tb) && dbQuery('PRAGMA table_info(' + tb + ')', null, db).some(r => r.name === c);
  if (has('archives')){
    W.archives = dbQuery('SELECT * FROM archives', null, db).filter(r => !(r.id === ARCH_DEFAULT_ID && r.updated_at === ARCH_DEFAULT_AT))   // the virtual default row is not data
      .map(r => { const j = (s) => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch(e){ return []; } };
        return {id:r.id, name:r.name || '', code:r.code || '', color:r.color || '', description:r.description || '', sort:r.sort | 0, levels:j(r.levels_json), qr_levels:j(r.qr_levels_json), created_at:r.created_at || '', updated_at:r.updated_at || ''}; });
  }
  if (col('binders', 'archive_id')){ const m = new Map(dbQuery('SELECT id, archive_id FROM binders', null, db).map(r => [r.id, r.archive_id || ''])); (W.binders || []).forEach(b => { b.archive_id = m.get(b.id) || ''; }); }
  if (Array.isArray(W.locations) && col('locations', 'archive_id')){ const m = new Map(dbQuery('SELECT id, archive_id FROM locations', null, db).map(r => [r.id, r.archive_id || ''])); W.locations.forEach(l => { l.archive_id = m.get(l.id) || ''; }); }
}

/* ---------------- wrappers around globals (installed at load; callers resolve them at call time) ---------------- */
(function archWrap(){
  const wrap = (name, fn) => { const orig = window[name]; if (typeof orig !== 'function') return; window[name] = fn(orig); };
  wrap('topbarHTML', (o) => function(){ const h = o.apply(this, arguments), sw = archSwitcherHTML(); return sw ? h.replace('<div class="top-right">', '<div class="top-right">' + sw) : h; });
  wrap('infoPanelHTML', (o) => function(tab){ return tab === 'arch' ? archPanelHTML() : o.apply(this, arguments); });
  wrap('mountInfo', (o) => function(){ if (infoTab() === 'arch') return; return o.apply(this, arguments); });
  wrap('infoTabCount', (o) => function(k){ return k === 'arch' ? archList().length : o.apply(this, arguments); });
  // JSON / .sqlite workspace, undo: archives before the tree and the binders
  wrap('applyWorkspaceObject', (o) => function(W){ if (W && Array.isArray(W.archives)) S.archives = archNormalizeList(W.archives); const r = o.apply(this, arguments); if (S.archiveSel && !archById(S.archiveSel)) S.archiveSel = ''; return r; });
  // CSV / Excel: archive column = id, code or name; an unknown name becomes a new archive at import time
  wrap('mapRecord', (o) => function(raw){
    const p = o.apply(this, arguments);
    if ('archive_id' in p){ const k = archResolveRef(p.archive_id); if (k == null){ p._archive_new = String(p.archive_id).replace(/\s+/g, ' ').trim().slice(0, 60); p.archive_id = ''; } else p.archive_id = k; }
    return p;
  });
  wrap('applyImport', (o) => function(mode){
    const IP = UI.importParsed, before = clone(S.archives || []), cur = archCurrentId();
    if (IP && IP.rows){
      if (IP.workspace && Array.isArray(IP.workspace.archives)){
        const inc = archNormalizeList(IP.workspace.archives);
        if (mode === 'replace' && UI.restoreAll) S.archives = inc;
        else { inc.forEach(a => { const i = S.archives.findIndex(x => x.id === a.id); if (i < 0) S.archives.push(a); else if (String(a.updated_at) > String(S.archives[i].updated_at || '')) S.archives[i] = a; }); }
      }
      const byName = new Map();
      IP.rows.forEach(r => {
        const p = r.p; if (!p || r.status === 'err') return;
        if (p._archive_new){ const nm = p._archive_new, key = nm.toLowerCase(); let k = byName.get(key); if (k == null){ const ex = archResolveRef(nm); k = ex != null ? ex : archKey(archCreate({name:nm}).id); byName.set(key, k); } p.archive_id = k; }
        delete p._archive_new;
        if (r.status === 'new' && !('archive_id' in p) && cur && !IP.workspace) p.archive_id = cur;   // rows without an archive go into the archive shown at the top
      });
    }
    const res = o.apply(this, arguments);
    if (typeof UNDO !== 'undefined' && UNDO) UNDO.archives = before;   // undo also removes the archives created by this import
    return res;
  });
  wrap('openEditor', (o) => function(id, preset){ if (!id) preset = Object.assign({archive_id:archCurrentId()}, preset || {}); return o.call(this, id, preset); });
  wrap('edLocationHTML', (o) => function(d){
    const h = o.apply(this, arguments); if (!archMulti()) return h;
    return '<div class="field ar-ed" id="ar-ed"><label for="ed-archive_id">' + ic('warehouse') + esc(t('ar_ed_label')) + '</label><select class="inp" id="ed-archive_id" data-ed="archive_id">' + archOptionsHTML(binderArchiveId(d) || ARCH_DEFAULT_ID, false) + '</select></div>' + h;
  });
  // editor save: the location wins unless the archive was changed by hand (then the binder leaves a box of another archive)
  wrap('saveEditor', (o) => function(){
    const ed = UI.ed, d = ed && ed.d;
    if (d){
      d.archive_id = archKey(d.archive_id);
      const l = d.location_id ? locById(d.location_id) : null;
      if (l && locArchiveId(l) !== d.archive_id){
        let base = {}; try { base = JSON.parse(ed.base); } catch(e){}
        if (d.archive_id !== binderArchiveId(base) && (base.location_id || '') === d.location_id){ d.location_id = ''; d.location_code = binderLocCode(d); setTimeout(() => toast(t('ar_ed_moved_loc'), 'warn', 6000), 0); }
        else d.archive_id = locArchiveId(l);
      }
    }
    return o.apply(this, arguments);
  });
  // placing a binder in a box also puts it in the box's archive (binder.archive_id follows, like location_code)
  wrap('locAssign', (o) => function(binders, locId){
    const to = locId ? locById(locId) : null;
    if (locId && !to) return o.apply(this, arguments);
    (binders || []).forEach(b => { if ((b.location_id || '') !== (locId || '')) b.archive_id = to ? locArchiveId(to) : binderArchiveId(b); });
    return o.apply(this, arguments);
  });
  wrap('locCreate', (o) => function(parentId, x){ if (!parentId && !(x && 'archive_id' in x)) x = Object.assign({archive_id:archKey(ARCH_CTX.id != null ? ARCH_CTX.id : archCurrentId())}, x || {}); return o.call(this, parentId, x); });
  // "Crea in serie" at the top level: roots of this archive only, numbers never shared with another archive's roots
  wrap('locBulkCreate', (o) => function(parentId, rows){
    if (parentId || !rows || !rows[0] || !(rows[0].n > 0)) return o.apply(this, arguments);
    const k = archCurrentId(), r0 = rows[0], pre = locSegClean(r0.prefix), made = [];
    for (let i = 0; i < r0.n && made.length < LOC_BULK_MAX; i++){
      const want = pre + String((r0.from || 1) + i).padStart(r0.pad || 1, '0');
      let root = locChildren('').find(c => c.seg === want && archKey(c.archive_id) === k);
      if (!root){ const clash = locChildren('').some(c => c.seg === want); root = locCreate('', {seg:clash ? locNextSeg('', 0, pre, r0.pad || 1) : want, archive_id:k}); made.push(root); }
      locIntegrity();
      if (rows.length > 1) made.push(...o.call(this, root.id, rows.slice(1)));
    }
    locAfterChange();
    return made;
  });
  // the tree, its filters and the leaf selection show the archive chosen at the top
  wrap('locPanelHTML', (o) => function(){
    const h = archScoped(() => o.apply(this, arguments)), cur = archById(archCurrentId());
    const wz = '<button class="btn" data-a="ar-setup" data-id="' + esc(archCurrentId() || ARCH_DEFAULT_ID) + '" id="lo-setup">' + ic('layers') + esc(t('ar_setup')) + '</button>';
    let out = h.replace('<button class="btn" data-a="lo-levels" id="lo-levels">', wz + '<button class="btn" data-a="lo-levels" id="lo-levels">');
    out = out.replace('<button class="btn btn-primary" data-a="lo-bulk" data-id="" id="lo-empty-bulk">', '<button class="btn btn-primary btn-lg" data-a="ar-setup" data-id="' + esc(archCurrentId() || ARCH_DEFAULT_ID) + '" id="lo-empty-setup">' + ic('layers') + esc(t('ar_setup')) + '</button><button class="btn" data-a="lo-bulk" data-id="" id="lo-empty-bulk">');
    const q = archQrLevelSet(archCurrentId()), a = archById(archCurrentId());
    if (a && a.qr_levels && a.qr_levels.length) out = out.replace('<button class="btn btn-sm" data-a="lo-sel-none">', '<button class="btn btn-sm" data-a="ar-sel-qr" id="ar-sel-qr">' + ic('qr') + esc(t('ar_sel_qr')) + '</button><button class="btn btn-sm" data-a="lo-sel-none">');
    if (archMulti() && cur && archSelected()) out = '<div class="ar-scope">' + archDot(cur) + '<b>' + esc(archName(cur)) + '</b><span class="mono muted">' + esc(cur.code) + '</span></div>' + out;
    void q; return out;
  });
  wrap('locTreeHTML', (o) => function(){
    const h = archScoped(() => o.apply(this, arguments));
    if (!archMulti() || archSelected()) return h;
    // "Tutti gli archivi": a dot with the archive colour on every top-level row
    return h.replace(/(<div class="lt-row[^"]*" style="--d:0" data-lid="([^"]+)">[\s\S]*?<span class="lt-tx">)/g, (m, all, id) => { const l = locById(id), a = l ? archById(l.archive_id) : null; return all.replace('<span class="lt-tx">', archDot(a, 'lt-ar') + '<span class="lt-tx">'); });
  });
  wrap('locFilterSelectHTML', (o) => function(){ return archScoped(() => o.apply(this, arguments)); });
  wrap('locDetailHTML', (o) => function(){
    const h = o.apply(this, arguments); if (!archMulti() || typeof LUI === 'undefined') return h;
    const l = locById(LUI.sel); if (!l) return h;
    return h.replace('<div class="lo-kind">', archChip(archById(locArchiveId(l))) + '<div class="lo-kind">');
  });
  // print queue: the binder labels of the archive shown at the top
  wrap('printQueueBinders', (o) => function(){ const r = o.apply(this, arguments); return archSelected() ? r.filter(archBinderVisible) : r; });
  wrap('renderPrintSummary', (o) => function(){
    const r = o.apply(this, arguments); const sel = archSelected(), el = $('#pr-summary');
    if (sel && archMulti() && el && S.print.contentMode !== 'loc' && !el.querySelector('.ar-only')){ const a = archById(sel); el.insertAdjacentHTML('afterbegin', '<div class="ar-only">' + archDot(a) + esc(t('ar_print_only', {n:archName(a)})) + '</div>'); }
    return r;
  });
  // exports limited to one archive (Esporta e Salva › Archivio da esportare)
  wrap('sortedBinders', (o) => function(){ const r = o.apply(this, arguments); return AR.export != null ? r.filter(b => binderArchiveId(b) === AR.export) : r; });
  wrap('locManifestRows', (o) => function(){ return AR.export != null ? archScoped(() => o.apply(this, arguments), AR.export || ARCH_DEFAULT_ID) : o.apply(this, arguments); });
  ['exportManifest', 'exportFullCSV', 'openRegister'].forEach(n => wrap(n, (o) => function(){ AR.export = AR.exArch && archById(AR.exArch) ? archKey(AR.exArch) : null; try { return o.apply(this, arguments); } finally { AR.export = null; } }));
  wrap('viewExport', (o) => function(){
    const h = o.apply(this, arguments); if (!archMulti()) return h;
    const box = '<div class="card card-p ar-ex" id="ar-ex"><div class="row" style="flex-wrap:wrap;gap:12px;align-items:center">' + ic('warehouse') + '<div style="flex:1;min-width:220px"><b>' + esc(t('ar_ex_h')) + '</b><div class="hint">' + esc(t('ar_ex_d')) + '</div></div>' +
      '<select class="inp" data-ar-export="1" id="ar-ex-sel" aria-label="' + esc(t('ar_ex_h')) + '" style="max-width:320px">' + archOptionsHTML(AR.exArch, true) + '</select></div></div>';
    return h.replace('<div class="grid g2">', box + '<div class="grid g2">');
  });
  wrap('renderArchiveResults', (o) => function(){
    const r = o.apply(this, arguments);
    const bb = $('#bulkbar'); if (bb && archMulti() && !$('#ar-move-btn')){
      const n = S.binders.filter(b => b.selected_for_print && !(S.settings.hideDemo && isDemo(b)) && archBinderVisible(b)).length;
      const ref = bb.querySelector('[data-a="del-sel"]');
      const btn = document.createElement('button'); btn.className = 'btn btn-sm'; btn.id = 'ar-move-btn'; btn.dataset.a = 'ar-move-open'; btn.disabled = !n; btn.innerHTML = ic('warehouse') + esc(t('ar_move_btn'));
      if (ref) bb.insertBefore(btn, ref); else bb.appendChild(btn);
    }
    return r;
  });
  // nested association: the association card gets the switch and the question
  wrap('locAssocHTML', (o) => function(){
    let h = o.apply(this, arguments); const A = LUI.assoc, anc = A.anchor && locById(A.anchor), ask = A.nestAsk, al = ask && locById(ask.id), ap = ask && locById(ask.parent);
    const sw = '<div class="an-row"><label class="chk an-sw" title="' + esc(t('an_nest_d')) + '"><input type="checkbox" id="an-nest" data-an-nest="1"' + (A.nest ? ' checked' : '') + '>' + esc(t('an_nest')) + '</label>' +
      (A.nest && anc ? '<span class="an-anchor" id="an-anchor">' + ic('layers') + esc(t('an_anchor', {c:anc.code})) + '</span>' : '<span class="hint">' + esc(t('an_nest_d')) + '</span>') + '</div>';
    const q = al && ap ? '<div class="an-ask" id="an-ask" role="alertdialog" aria-label="' + esc(t('an_ask', {c:locTitle(al), p:locTitle(ap)})) + '"><div class="an-ask-t">' + ic('move') + '<div><b>' + esc(t('an_ask', {c:al.code, p:ap.code})) + '</b><div class="hint">' + esc(t('an_ask_hint', {c:al.seg})) + '</div></div></div>' +
      '<div class="row"><button class="btn btn-primary" data-a="an-yes" id="an-yes">' + ic('check') + esc(t('an_yes')) + '</button><button class="btn" data-a="an-no" id="an-no">' + esc(t('an_no', {c:al.seg})) + '</button></div></div>' : '';
    const u = AR.nestLast && !AR.nestLast.undone && A.msg && A.msg.kind === 'ok' && A.msg.nest ? '<button class="btn btn-sm" data-a="an-undo" id="an-undo">' + ic('undo') + esc(t('an_undo')) + '</button>' : '';
    h = h.replace('<div class="la-video', sw + q + '<div class="la-video');
    if (u) h = h.replace(/(<div class="la-msg ok" id="la-msg" role="status">[\s\S]*?<\/span>)/, '$1' + u);
    return h;
  });
  wrap('locAssocInput', (o) => function(text, via){
    const A = LUI.assoc, p = assocParseCode(text), raw = String(text || '').trim();
    const ci = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
    let L = null;
    if (p.type === 'location') L = locArr().find(l => l.short_code === p.code) || locArr().find(l => ci(l.short_code, p.code));
    else if (p.type === 'text' && !S.binders.some(b => b.speaking_code === p.code)) L = locArr().find(l => l.code.toUpperCase() === p.code) || null;
    const ask = A.nestAsk; A.nestAsk = null;
    if (ask && L && L.id === ask.id) return archNestDo(ask);   // the same location QR again = yes
    if (!A.nest || !raw || !L){ const r = o.apply(this, arguments); if (A.nest && r && r.kind === 'switch' && r.loc && !A.anchor) A.anchor = r.loc.id; return r; }
    const anc = A.anchor ? locById(A.anchor) : null;
    if (!anc || anc.id === L.id){ A.anchor = L.id; return o.apply(this, arguments); }
    if (locDescendants(anc.id).includes(L.id)) return o.apply(this, arguments);   // already inside: becomes the active (most specific) location
    if (locDescendants(L.id).includes(anc.id) || archNomLevel(L) <= archNomLevel(anc)){ A.anchor = L.id; return o.apply(this, arguments); }
    A.nestAsk = {id:L.id, parent:anc.id, via:via || 'scanner'};
    A.msg = null;   // the question card is the message
    if (typeof locBeep === 'function') locBeep('switch');
    locAssocRender();
    return {kind:'ask', loc:L, parent:anc};
  });
})();
/** Yes to "Sposta S2 dentro A1?": move, the moved node becomes the active location, one undo step. */
function archNestDo(ask){
  const A = LUI.assoc, l = locById(ask.id), parent = locById(ask.parent); if (!l || !parent) return {kind:'unknown'};
  const from = l.parent_id || '';
  undoPoint();
  locMove(l.id, parent.id);
  A.nestAsk = null; A.loc = l.id; A.anchor = parent.id;
  AR.nestLast = {id:l.id, from, parent:parent.id, undone:false};
  A.msg = {kind:'ok', text:t('an_done', {c:l.seg, p:parent.code}), nest:true};
  if (typeof locBeep === 'function') locBeep(true);
  locAssocRender(); locRenderTree();
  return {kind:'nest', loc:l, parent};
}
function archNestUndo(){
  const x = AR.nestLast; if (!x || x.undone) return;
  const l = locById(x.id); if (!l) return;
  locMove(l.id, x.from && locById(x.from) ? x.from : '');
  x.undone = true; LUI.assoc.msg = {kind:'warn', text:t('an_undone', {c:l.code})};
  locAssocRender(); locRenderTree();
}

/* ---------------- search facet (stream A's search engine, when present) ---------------- */
function archFacetProvider(){
  return { id:'archive', label:() => t('ar_facet'), visible:() => archMulti(),
    values:(list) => { const c = new Map(); (list || S.binders).forEach(b => { const k = binderArchiveId(b); c.set(k, (c.get(k) || 0) + 1); }); return archList().map(a => ({value:archKey(a.id) || ARCH_DEFAULT_ID, label:archName(a), code:a.code, color:a.color, count:c.get(archKey(a.id)) || 0})); },
    match:(b, v) => binderArchiveId(b) === archKey(v),
    text:(b) => { const a = archById(binderArchiveId(b)); return a ? archName(a) + ' ' + a.code : ''; } };
}

/* ---------------- actions & events ---------------- */
const ARCH_ACTIONS = {
  'ar-new': () => archOpenEdit(null),
  'ar-edit': (el) => archOpenEdit(el.dataset.id),
  'ar-open': (el) => { S.archiveSel = archMulti() ? (archKey(el.dataset.id) || ARCH_DEFAULT_ID) : ''; UI.fLoc = ''; S.view = 'archive'; savePrefs(); renderAll(); },
  'ar-setup': (el) => { while (topModal()) closeModal(true); archWizardOpen(archKey(el.dataset.id)); },
  'ar-merge': (el) => archOpenMerge(el.dataset.id),
  'ar-del': (el) => archDelete(el.dataset.id),
  'ar-move-open': () => archOpenMove(S.binders.filter(b => b.selected_for_print && !(S.settings.hideDemo && isDemo(b)) && archBinderVisible(b)).map(b => b.id)),
  'ar-sel-qr': () => { const k = archCurrentId(), q = archQrLevelSet(k); LUI.checked = new Set(locArr().filter(l => archKey(l.archive_id) === k && q.has(archNomLevel(l))).map(l => l.id)); locRender(); },
  'lo-levels': () => archOpenLevels(archCurrentId()),
  'lo-sel-leaves': () => { LUI.checked = new Set(archScoped(() => locArr().filter(l => !locChildren(l.id).length).map(l => l.id))); locRender(); },
  'wz-tpl': (el) => { const W = WZ.st; if (!W) return; W.tpl = el.dataset.t; W.rows = wzRowsFromTemplate(W.tpl, W.arch || ''); wzRender(); },
  'wz-next': () => { const W = WZ.st; if (!W) return; if (W.step === 2 && !wzCounts().total) return; W.step = Math.min(3, W.step + 1); wzRender(); },
  'wz-back': () => { const W = WZ.st; if (!W) return; W.step = Math.max(1, W.step - 1); wzRender(); },
  'wz-add': () => { const W = WZ.st; if (!W || W.rows.length >= LOC_MAX_DEPTH) return; const i = W.rows.length; W.rows.push({name:t('lo_lv_n', {n:i + 1}), prefix:'L' + (i + 1), n:1, qr:false}); W.tpl = 'custom'; wzRender(); },
  'wz-del': (el) => { const W = WZ.st; if (!W || W.rows.length < 2) return; W.rows.splice(+el.dataset.i, 1); W.tpl = 'custom'; wzRender(); },
  'wz-create': () => wzCreate(),
  'wz-print': () => { const ids = (WZ.st && WZ.st.qrIds || []).filter(id => locById(id)); while (topModal()) closeModal(true); if (ids.length) locPrintStart(ids); },
  'wz-goto': () => { const id = WZ.st && WZ.st.made[0] && WZ.st.made[0].id; while (topModal()) closeModal(true); if (id) LUI.sel = id; S.view = 'info'; S.infoTab = 'loc'; savePrefs(); renderAll(); },
  'an-yes': () => { const ask = LUI.assoc.nestAsk; if (ask) archNestDo(ask); },
  'an-no': () => { const ask = LUI.assoc.nestAsk, l = ask && locById(ask.id); LUI.assoc.nestAsk = null; if (!l) return locAssocRender(); LUI.assoc.anchor = l.id; locAssocInput(l.short_code, ask.via); },
  'an-undo': () => archNestUndo()
};
document.addEventListener('change', (e) => {
  const el = e.target; if (!el || !el.dataset) return;
  if (el.dataset.archSwitch){ archSetSel(el.value); return; }
  if (el.dataset.arExport){ AR.exArch = el.value; return; }
  if (el.dataset.anNest && typeof LUI !== 'undefined'){ LUI.assoc.nest = el.checked; LUI.assoc.nestAsk = null; LUI.assoc.anchor = el.checked ? LUI.assoc.loc || '' : ''; locAssocRender(); }
});
document.addEventListener('input', (e) => {
  const el = e.target; if (!el || !el.dataset || !el.dataset.wz || !WZ.st) return;
  const r = WZ.st.rows[+el.dataset.i]; if (!r) return;
  const k = el.dataset.wz;
  if (k === 'qr') r.qr = el.checked;
  else if (k === 'n') r.n = Math.max(0, Math.min(999, parseInt(el.value, 10) || 0));
  else if (k === 'prefix') r.prefix = locSegClean(el.value).slice(0, 8);
  else r.name = el.value;
  if (k !== 'qr' && k !== 'n') WZ.st.tpl = 'custom';
  const live = $('#wz-live'); if (live) live.innerHTML = wzLiveHTML();
  const nx = $('#wz-next'); if (nx) nx.disabled = !wzCounts().total;
  if (k === 'name'){ const sm = $$('.wz-n-wrap small'); sm.forEach((s, i) => { if (i) s.textContent = t('wz_lv_each', {l:(WZ.st.rows[i - 1].name || '').toLowerCase()}); }); }
});
document.addEventListener('DOMContentLoaded', () => {
  Object.assign(ACTIONS, ARCH_ACTIONS);
  if (typeof INFO_TAB_HELP !== 'undefined') INFO_TAB_HELP.arch = 'archives';
  if (typeof searchFacetProviders !== 'undefined' && Array.isArray(searchFacetProviders) && !searchFacetProviders.some(x => x && x.id === 'archive')) searchFacetProviders.push(archFacetProvider());   // stream A search engine
  HELP_TOPICS.push({ id:'archives', guide:'archives', tags:['archive', 'qr', 'label'], acts:['how', 'create'], pop:54, related:['locations', 'nfc', 'qr'],
    kw:{it:'cluster più archivi magazzini storico comune ente configura procedura guidata livelli modello', en:'cluster several archives warehouses historical public body set up wizard levels template'},
    title:{it:'Come tengo più archivi separati e configuro un archivio?', en:'How do I keep several separate archives and set one up?'},
    body:{
      it:'<p><b>Più archivi.</b> In <b>Informazioni › Archivi</b> crei archivi separati per lo stesso studio (es. <i>Corrente</i>, <i>Storico</i>, <i>Comune di …</i>, un secondo magazzino): ogni faldone e ogni albero di ubicazioni appartiene a un archivio. I dati di prima finiscono da soli in <b>Archivio principale</b>. Con più archivi compare in alto il selettore: scegli un archivio oppure <b>Tutti gli archivi</b>. Archivio, coda di stampa, Ubicazioni ed esportazioni seguono la scelta; i faldoni nuovi e le righe importate senza archivio vanno nell\'archivio scelto.</p>' +
        '<p>Per spostare faldoni: spuntali in Archivio e premi <b>Archivio…</b>. <b>Unisci in…</b> sposta tutto un archivio in un altro. Nel CSV la colonna <span class="kbd">archive_id</span> (o <span class="kbd">archivio</span>) accetta id, codice o nome: un nome nuovo crea l\'archivio.</p>' +
        '<p><b>Configura archivio.</b> La procedura guidata ti fa scegliere un modello (<b>Studio</b>: Stanza › Armadio › Ripiano › Scatola; <b>Magazzino</b>: Magazzino › Corsia › Scaffale › Ripiano › Scatola; <b>Ente / Comune</b>: Deposito › Scaffale › Palchetto › Faldone-scatola; <b>Personalizzato</b>), poi per ogni livello nome, prefisso, quanti dentro ciascuno e se riceve un QR (davanti all\'armadio, su ogni scansia, sulle scatole). Vedi l\'anteprima dei codici, crei l\'albero e stampi subito le etichette.</p>' +
        '<p><b>Annida ubicazioni.</b> In Modalità associazione attiva <b>Annida ubicazioni</b>: scansiona il QR di un armadio, poi il QR di una scansia che non è ancora dentro: DocMap chiede <i>"Sposta S2 dentro A1?"</i> (premi Sì o scansiona di nuovo la scansia). I faldoni scansionati vanno nell\'ubicazione più precisa attiva.</p>',
      en:'<p><b>Several archives.</b> In <b>Information › Archives</b> you create separate archives for the same office (e.g. <i>Current</i>, <i>Historical</i>, <i>Town of …</i>, a second warehouse): every binder and every location tree belongs to one archive. Existing data lands in <b>Main archive</b> by itself. With more than one archive a switcher appears at the top: choose an archive or <b>All archives</b>. Archive, print queue, Locations and exports follow the choice; new binders and imported rows without an archive go into the chosen archive.</p>' +
        '<p>To move binders: tick them in Archive and press <b>Archive…</b>. <b>Merge into…</b> moves a whole archive into another. In CSV files the column <span class="kbd">archive_id</span> (or <span class="kbd">archivio</span>) takes id, code or name: a new name creates the archive.</p>' +
        '<p><b>Set up archive.</b> The wizard lets you choose a template (<b>Office</b>: Room › Cabinet › Shelf › Box; <b>Warehouse</b>: Warehouse › Aisle › Rack › Shelf › Box; <b>Public body</b>: Depot › Rack › Shelf board › Box file; <b>Custom</b>), then for each level name, prefix, how many inside each and whether it gets a QR (on the cabinet front, on every shelving unit, on the boxes). You see a preview of the codes, create the tree and print the labels right away.</p>' +
        '<p><b>Nest locations.</b> In Association mode switch on <b>Nest locations</b>: scan a cabinet QR, then the QR of a shelving unit that is not inside it yet: DocMap asks <i>"Move S2 into A1?"</i> (press Yes or scan the unit again). Scanned binders go into the most specific active location.</p>'
    }});
  if (typeof GUIDES !== 'undefined') GUIDES.archives = { pop:52, title:{it:'Crea un archivio e configuralo', en:'Create an archive and set it up'}, steps:[
    { target:'.nav [data-v="info"]', title:{it:'Apri Informazioni', en:'Open Information'}, text:{it:'Clicca "Informazioni" nella barra in alto.', en:'Click "Information" in the top bar.'}, done:() => S.view === 'info' },
    { target:'.info-tabs [data-v="arch"]', title:{it:'Archivi', en:'Archives'}, text:{it:'Apri la scheda "Archivi": qui ci sono gli archivi separati dello studio.', en:'Open the "Archives" tab: the separate archives of the office live here.'}, done:() => S.view === 'info' && infoTab() === 'arch' },
    { target:() => $('#ar-new') || $('#info-panel'), title:{it:'Nuovo archivio', en:'New archive'}, text:{it:'"Nuovo archivio": nome, codice breve (es. ST) e colore. Poi parte "Configura archivio".', en:'"New archive": name, short code (e.g. ST) and colour. Then "Set up archive" starts.'}, noAutoClick:true },
    { target:() => $('#ar-grid [data-a="ar-setup"]') || $('#info-panel'), title:{it:'Configura archivio', en:'Set up archive'}, text:{it:'Scegli un modello (Studio, Magazzino, Ente/Comune o Personalizzato), quanti elementi per livello e dove va il QR. Vedi l\'anteprima dei codici e crei tutto in un colpo.', en:'Choose a template (Office, Warehouse, Public body or Custom), how many per level and where the QR goes. You see the code preview and create everything at once.'}, noAutoClick:true },
    { target:() => $('#ar-grid') || $('#info-panel'), title:{it:'Le schede degli archivi', en:'The archive cards'}, text:{it:'Ogni scheda mostra faldoni, ubicazioni e livelli. "Apri" porta all\'Archivio filtrato; "Unisci in…" sposta tutto in un altro archivio.', en:'Each card shows binders, locations and levels. "Open" goes to the filtered Archive; "Merge into…" moves everything to another archive.'} },
    { final:true, title:{it:'Più archivi ✓', en:'Several archives ✓'}, text:{it:'Con due o più archivi compare in alto il selettore: Archivio, stampa, Ubicazioni ed esportazioni seguono l\'archivio scelto.', en:'With two or more archives the switcher appears at the top: Archive, printing, Locations and exports follow the chosen archive.'} }
  ]};
});
