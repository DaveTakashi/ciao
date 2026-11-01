/* =====================================================================
   DocMap 2026 — "Modifica massiva" (bulk edit), v10 stream E
   ---------------------------------------------------------------------
   An optional sub-view of Archivio: a dense, spreadsheet-like grid with one
   row per binder (the same binders the archive shows: search, state, room,
   category, Informazioni filter, hideDemo), made for fast categorising.

   - Mode flag: BK.on (ephemeral, never persisted). renderView() shows
     viewBulk() instead of viewArchive() while it is on (hook in 05-views).
   - Changes are STAGED in BK.draft (Map id → {field: newValue}); nothing
     touches S until "Salva modifiche". Dirty cells are highlighted, errors
     (empty / duplicate speaking code, empty client) block the save.
   - Save = undoPoint() + one normalizeBinder() per changed binder + one
     logAct('binder.bulk_edit', …) entry with per-binder changed fields +
     commit() + undoToast(): a single Undo restores everything.
   - Staged steps have their own undo stack (BK.hist, Ctrl+Z in the grid);
     after a save, Ctrl+Z in the grid restores the pre-save state (UNDO).
   - Rendering is windowed: only the rows in view (+ overscan) are in the DOM,
     so 2000+ binders scroll smoothly. Fixed row height BK.rowH.
   - Cell editors reuse the typeahead (taAttach + ED_SOURCES from 04b) so the
     values stay consistent (existing client spelling, categories, tags…).
   - Colour: plain hex/colour input. "Colore automatico" appears only when a
     global colorAssign(binder) → '#RRGGBB' (or applyAutoColor(binder), which
     may mutate the binder copy and/or return a hex) exists at runtime; any
     field it changes on the copy is staged too. After a manual colour,
     colorMarkManual(binder) is called on the copy if it exists.
   Visible columns: S.settings.bulkCols (array of BULK_COLS keys, lazy).
   ===================================================================== */
Object.assign(I18N.it, {
  bk_open:'Modifica massiva', bk_open_d:'Griglia tipo foglio di calcolo per categorizzare e modificare molti faldoni insieme',
  bk_h:'Modifica massiva', bk_p:'Tutti i faldoni dell\'archivio (con i filtri attivi) in una griglia. Frecce, Tab e Invio per muoverti, scrivi per modificare, Esc annulla. Le modifiche restano in sospeso finché non premi Salva.',
  bk_close:'Torna all\'archivio', bk_group:'Raggruppa', bk_group_none:'Nessun gruppo', bk_cols:'Colonne',
  bk_n_rows:'{n} faldoni', bk_sel:'{n} selezionati', bk_sel_all:'Seleziona tutti', bk_sel_none:'Deseleziona',
  bk_sel_hint:'Spunta le righe (Spazio, Maiusc+clic, Maiusc+frecce) per applicare una modifica a più faldoni insieme.',
  bk_op:'Modifica', bk_apply:'Applica a {n} selezionati', bk_fill:'Copia in giù', bk_fill_d:'Copia il valore della cella attiva nelle righe selezionate (Ctrl+D)',
  bk_op_category:'Imposta categoria', bk_op_tag_add:'Aggiungi tag', bk_op_tag_rm:'Rimuovi tag', bk_op_state:'Imposta stato', bk_op_color:'Imposta colore',
  bk_op_color_auto:'Colore automatico', bk_op_loc:'Imposta posizione (prefisso)', bk_op_year:'Imposta anno', bk_op_city:'Imposta luogo',
  bk_op_loc_ph:'es. A1 oppure A1-β', bk_op_auto_d:'Colore assegnato in automatico per cliente e categoria',
  bk_applied:'Modifica applicata a {n} faldoni: ricordati di salvare', bk_nothing:'Nessuna modifica: i valori erano già quelli', bk_need_sel:'Seleziona almeno una riga', bk_need_val:'Scrivi un valore',
  bk_dirty:'{n} faldoni modificati', bk_dirty1:'1 faldone modificato', bk_nf:'{n} campi', bk_nf1:'1 campo', bk_save:'Salva modifiche ({n})', bk_discard:'Annulla tutto', bk_undo:'Annulla ultima',
  bk_errs:'{n} errori da correggere prima di salvare', bk_goto:'Vai', bk_saved:'Modifica massiva salvata: {n} faldoni',
  bk_discard_t:'Annullare le modifiche in sospeso?', bk_discard_d:'{n} faldoni hanno modifiche non salvate. Verranno perse.', bk_discard_ok:'Annulla le modifiche',
  bk_bad_color:'Colore non valido: usa il formato #RRGGBB', bk_undone_step:'Modifica in sospeso annullata', bk_empty:'Nessun faldone con questi filtri.', bk_copied:'Copiato',
  bk_c_speaking_code:'Codice', bk_c_company_name:'Cliente', bk_c_multi_code:'Multi', bk_c_category:'Categoria', bk_c_binder_title:'Titolo', bk_c_ref_year:'Anno',
  bk_c_tags:'Tag', bk_c_company_city:'Luogo', bk_c_location_code:'Posizione', bk_c_archive_state:'Stato', bk_c_color_hex:'Colore', bk_c_extra_codes:'Codici extra',
  bk_c_contacts:'Contatti', bk_c_notes:'Note', bk_c_room_code:'Stanza',
  bk_keys:'Tasti: ↑↓←→ Tab Invio · scrivi o F2 per modificare · Esc annulla · Spazio seleziona · Ctrl+D copia in giù · Ctrl+C/Ctrl+V · Ctrl+Z annulla · Ctrl+S salva',
  'lga_binder.bulk_edit':'Modifica massiva'
});
Object.assign(I18N.en, {
  bk_open:'Bulk edit', bk_open_d:'Spreadsheet-like grid to categorise and edit many binders at once',
  bk_h:'Bulk edit', bk_p:'Every binder in the archive (with the active filters) in one grid. Arrows, Tab and Enter to move, type to edit, Esc cancels. Changes stay pending until you press Save.',
  bk_close:'Back to the archive', bk_group:'Group by', bk_group_none:'No grouping', bk_cols:'Columns',
  bk_n_rows:'{n} binders', bk_sel:'{n} selected', bk_sel_all:'Select all', bk_sel_none:'Clear selection',
  bk_sel_hint:'Tick rows (Space, Shift+click, Shift+arrows) to apply one change to many binders at once.',
  bk_op:'Change', bk_apply:'Apply to {n} selected', bk_fill:'Fill down', bk_fill_d:'Copy the active cell value into the selected rows (Ctrl+D)',
  bk_op_category:'Set category', bk_op_tag_add:'Add tag', bk_op_tag_rm:'Remove tag', bk_op_state:'Set state', bk_op_color:'Set colour',
  bk_op_color_auto:'Automatic colour', bk_op_loc:'Set position (prefix)', bk_op_year:'Set year', bk_op_city:'Set place',
  bk_op_loc_ph:'e.g. A1 or A1-β', bk_op_auto_d:'Colour assigned automatically by client and category',
  bk_applied:'Change applied to {n} binders: remember to save', bk_nothing:'No change: the values were already set', bk_need_sel:'Select at least one row', bk_need_val:'Type a value',
  bk_dirty:'{n} binders changed', bk_dirty1:'1 binder changed', bk_nf:'{n} fields', bk_nf1:'1 field', bk_save:'Save changes ({n})', bk_discard:'Discard all', bk_undo:'Undo last',
  bk_errs:'{n} errors to fix before saving', bk_goto:'Go', bk_saved:'Bulk edit saved: {n} binders',
  bk_discard_t:'Discard the pending changes?', bk_discard_d:'{n} binders have unsaved changes. They will be lost.', bk_discard_ok:'Discard changes',
  bk_bad_color:'Invalid colour: use the #RRGGBB format', bk_undone_step:'Pending change undone', bk_empty:'No binders with these filters.', bk_copied:'Copied',
  bk_c_speaking_code:'Code', bk_c_company_name:'Client', bk_c_multi_code:'Multi', bk_c_category:'Category', bk_c_binder_title:'Title', bk_c_ref_year:'Year',
  bk_c_tags:'Tags', bk_c_company_city:'Place', bk_c_location_code:'Position', bk_c_archive_state:'State', bk_c_color_hex:'Colour', bk_c_extra_codes:'Extra codes',
  bk_c_contacts:'Contacts', bk_c_notes:'Notes', bk_c_room_code:'Room',
  bk_keys:'Keys: ↑↓←→ Tab Enter · type or F2 to edit · Esc cancels · Space selects · Ctrl+D fill down · Ctrl+C/Ctrl+V · Ctrl+Z undo · Ctrl+S save',
  'lga_binder.bulk_edit':'Bulk edit'
});

/** Grid columns. ta = ED_SOURCES key for the typeahead; multi = comma list; hide = hidden by default. */
const BULK_COLS = [
  {k:'speaking_code', w:104, mono:1, req:1},
  {k:'company_name', w:210, ta:'company_name', req:1},
  {k:'multi_code', w:100, ta:'multi_code', mono:1},
  {k:'category', w:140, ta:'category'},
  {k:'binder_title', w:210},
  {k:'ref_year', w:72, ta:'ref_year', mono:1},
  {k:'tags', w:160, ta:'tags', multi:1, joiner:','},
  {k:'company_city', w:130, ta:'company_city'},
  {k:'location_code', w:124, ta:'quickloc', mono:1, loc:1},
  {k:'archive_state', w:118, sel:1},
  {k:'color_hex', w:104, color:1, mono:1},
  {k:'extra_codes', w:140, ta:'extra_codes', multi:1, hide:1},
  {k:'contacts', w:170, ta:'contacts', multi:1, hide:1},
  {k:'notes', w:220, hide:1}
];
const BK_LOC = ['room_code', 'cabinet_code', 'shelf_code', 'sector_code'];
const BK_GROUPS = ['', 'category', 'company_name', 'archive_state', 'room_code'];
const BK = {
  on:false, draft:new Map(), hist:[], sel:new Set(), list:[], rows:[], cur:{r:-1, c:0}, sort:{k:'', dir:1}, group:'',
  edit:null, anchor:-1, op:'category', rowH:34, errs:new Map(), clip:null, savedUndo:null, raf:0, win:[0, 0], qT:0
};
const bulkOn = () => BK.on;
const bkHasAuto = () => typeof window.colorAssign === 'function' || typeof window.applyAutoColor === 'function';

/* ---------------- columns ---------------- */
function bkCols(){
  const keys = Array.isArray(S.settings.bulkCols) ? S.settings.bulkCols : BULK_COLS.filter(c => !c.hide).map(c => c.k);
  const out = BULK_COLS.filter(c => keys.includes(c.k));
  return out.length ? out : BULK_COLS.slice(0, 2);
}

/* ---------------- values: original + staged draft ---------------- */
function bkVal(b, k){
  const d = BK.draft.get(b.id);
  if (k === 'location_code'){ if (!d || !BK_LOC.some(x => x in d)) return b.location_code || ''; return computeLocation(Object.assign({}, b, d)); }
  return d && k in d ? d[k] : (b[k] == null ? '' : b[k]);
}
const bkMerged = (b) => Object.assign({}, b, BK.draft.get(b.id) || {});
function bkIsDirty(b, k){ const d = BK.draft.get(b.id); if (!d) return false; return k === 'location_code' ? BK_LOC.some(x => x in d) : k in d; }
const bkById = (id) => S.binders.find(b => b.id === id);

/** Stage changes as ONE undoable step: [{id, patch:{field:value}}]. Values equal to the saved ones drop out of the draft. */
function bkApply(changes){
  const step = [], seen = new Set();
  let n = 0;
  changes.forEach(({id, patch}) => {
    const b = bkById(id); if (!b) return;
    const prev = BK.draft.get(id);
    const d = Object.assign({}, prev || {});
    let changed = false;
    Object.keys(patch).forEach(k => {
      const v = patch[k] == null ? '' : String(patch[k]);
      const cur = k in d ? d[k] : String(b[k] == null ? '' : b[k]);
      if (v === cur) return;
      changed = true;
      if (v === String(b[k] == null ? '' : b[k])) delete d[k]; else d[k] = v;
    });
    if (!changed) return;
    if (!seen.has(id)){ seen.add(id); step.push({id, prev:prev ? Object.assign({}, prev) : null}); }
    if (Object.keys(d).length) BK.draft.set(id, d); else BK.draft.delete(id);
    n++;
  });
  if (step.length) BK.hist.push(step);
  if (BK.hist.length > 200) BK.hist.shift();
  bkValidate();
  return n;
}
function bkUndoStep(){
  const step = BK.hist.pop(); if (!step) return false;
  step.forEach(({id, prev}) => { if (prev) BK.draft.set(id, prev); else BK.draft.delete(id); });
  bkValidate(); return true;
}

/* ---------------- validation (same rules as the editor) ---------------- */
function bkNextFree(code, selfId){
  code = String(code || '').toUpperCase().replace(/\s+/g, '');
  const m = code.match(/^(.*?)(\d+)$/), pre = m ? m[1] : code;
  const taken = new Set(S.binders.filter(b => b.id !== selfId).map(b => String(bkVal(b, 'speaking_code')).toUpperCase()));
  let max = 0;
  taken.forEach(c => { if (c.startsWith(pre)){ const r = c.slice(pre.length); if (/^\d+$/.test(r)) max = Math.max(max, +r); } });
  let n = max + 1; while (taken.has(pre + n)) n++;
  return pre + n;
}
/** Errors only for staged binders: {id → {field: message}}. Duplicates are checked against the whole archive. */
function bkValidate(){
  BK.errs = new Map();
  if (!BK.draft.size) return BK.errs;
  const count = new Map();
  S.binders.forEach(b => { const c = String(bkVal(b, 'speaking_code')).toUpperCase(); if (c) count.set(c, (count.get(c) || 0) + 1); });
  BK.draft.forEach((d, id) => {
    const b = bkById(id); if (!b) return;
    const e = {};
    if ('speaking_code' in d){
      const c = String(d.speaking_code).toUpperCase();
      if (!c) e.speaking_code = t('e_req_code');
      else if (count.get(c) > 1) e.speaking_code = t('e_dup_code2', {c:bkNextFree(c, id)});
    }
    if ('company_name' in d && !String(d.company_name).trim()) e.company_name = t('e_req_company');
    if (Object.keys(e).length) BK.errs.set(id, e);
  });
  return BK.errs;
}
const bkErrCount = () => { let n = 0; BK.errs.forEach(e => { n += Object.keys(e).length; }); return n; };

/* ---------------- rows: filter → sort → group ---------------- */
function bkBuildRows(){
  const list = filteredBinders();
  const k = BK.sort.k, dir = BK.sort.dir, g = BK.group;
  const ord = list.map((b, i) => ({b, i}));
  if (k || g) ord.sort((x, y) => (g ? naturalCmp(bkVal(x.b, g) || '￿', bkVal(y.b, g) || '￿') : 0) || (k ? dir * naturalCmp(bkVal(x.b, k), bkVal(y.b, k)) : 0) || x.i - y.i);
  BK.list = ord.map(x => x.b);
  const ids = new Set(BK.list.map(b => b.id));
  BK.sel.forEach(id => { if (!ids.has(id)) BK.sel.delete(id); });   // selection follows the filters
  const rows = [];
  let grp = null;
  BK.list.forEach(b => {
    if (g){
      const v = bkVal(b, g);
      if (!grp || v !== grp.g){ grp = {g:v, ids:[]}; rows.push(grp); }
      grp.ids.push(b.id);
    }
    rows.push({b});
  });
  BK.rows = rows;
  if (BK.cur.r >= rows.length || BK.cur.r < 0 || !rows[BK.cur.r] || !rows[BK.cur.r].b) BK.cur.r = rows.findIndex(r => r.b);
  BK.cur.c = clamp(BK.cur.c, 0, bkCols().length - 1);
}

/* ---------------- view ---------------- */
function bkSelHTML(attr, all, opts, cur){
  return '<select class="inp bk-f" ' + attr + '><option value="">' + esc(all) + '</option>' + opts.map(o => '<option value="' + esc(o[0]) + '"' + (cur === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
}
function viewBulk(){
  const rooms = Array.from(new Set(S.binders.map(b => b.room_code).filter(Boolean))).sort(naturalCmp);
  const cats = Array.from(new Set(S.binders.map(b => b.category).filter(Boolean))).sort(naturalCmp);
  const cols = bkCols().map(c => c.k);
  return '<div class="page-h"><div><h1>' + ic('table') + ' ' + esc(t('bk_h')) + helpDot('bulk') + '</h1><p>' + esc(t('bk_p')) + '</p></div>' +
    '<div class="row"><button class="btn" data-a="bulk-close" id="bk-close">' + ic('x') + esc(t('bk_close')) + '</button></div></div>' +
    infoFilterBarHTML() +
    '<div class="card bk-card"><div class="toolbar bk-tools">' +
      '<div class="search">' + ic('search') + '<input class="inp" type="search" data-bk-q value="' + esc(UI.q) + '" placeholder="' + esc(t('search_ph')) + '" aria-label="search"></div>' +
      bkSelHTML('data-bk-f="fState"', t('all_states'), STATES.map(s => [s, t('s_' + s)]), UI.fState) +
      bkSelHTML('data-bk-f="fRoom"', t('all_rooms'), rooms.map(r => [r, r]), UI.fRoom) +
      bkSelHTML('data-bk-f="fCat"', t('all_cats'), cats.map(c => [c, c]), UI.fCat) +
      '<label class="bk-lab">' + esc(t('bk_group')) + '<select class="inp bk-f" data-bk-group>' + BK_GROUPS.map(g => '<option value="' + g + '"' + (BK.group === g ? ' selected' : '') + '>' + esc(g ? t('bk_c_' + g) : t('bk_group_none')) + '</option>').join('') + '</select></label>' +
      '<details class="bk-cols" id="bk-cols"><summary class="btn btn-sm">' + ic('sliders') + esc(t('bk_cols')) + '</summary><div class="bk-cols-pop">' +
        BULK_COLS.map(c => '<label class="chk small"><input type="checkbox" data-bk-col="' + c.k + '"' + (cols.includes(c.k) ? ' checked' : '') + '>' + esc(t('bk_c_' + c.k)) + '</label>').join('') + '</div></details>' +
      '<span class="small muted" id="bk-count"></span>' +
    '</div>' +
    '<div class="bk-selbar" id="bk-selbar"></div>' +
    '<div class="bk-grid" id="bk-grid" tabindex="0" role="grid" aria-label="' + esc(t('bk_h')) + '"></div>' +
    '<div class="bk-keys tiny muted">' + esc(t('bk_keys')) + '</div>' +
    '</div><div class="bk-savebar" id="bk-savebar"></div>';
}
function mountBulk(){
  bkBuildRows(); bkValidate();
  bkRenderTable(); bkRenderSelBar(); bkRenderSaveBar();
  const g = $('#bk-grid');
  if (g){
    g.addEventListener('scroll', bkOnScroll, {passive:true});
    g.addEventListener('keydown', bkGridKey);
    g.addEventListener('mousedown', bkGridMouse);
    g.addEventListener('dblclick', (e) => { const td = e.target.closest('td.bk-cell'); if (td && !BK.edit) bkStartEdit(); });
    g.addEventListener('click', bkGridClick);
  }
}
function bkRenderTable(){
  const g = $('#bk-grid'); if (!g) return;
  const cols = bkCols();
  const W = 40 + cols.reduce((a, c) => a + c.w, 0);
  const allSel = BK.list.length && BK.list.every(b => BK.sel.has(b.id));
  const arrow = (k) => BK.sort.k === k ? (BK.sort.dir > 0 ? ' ▲' : ' ▼') : '';
  g.innerHTML = BK.list.length ? '<table class="bk-tbl" style="width:' + W + 'px"><colgroup><col style="width:40px">' + cols.map(c => '<col style="width:' + c.w + 'px">').join('') + '</colgroup>' +
    '<thead><tr><th class="bk-ck"><input type="checkbox" data-bk-all aria-label="' + esc(t('bk_sel_all')) + '"' + (allSel ? ' checked' : '') + '></th>' +
    cols.map(c => '<th data-a="bk-sort" data-k="' + c.k + '" aria-sort="' + (BK.sort.k === c.k ? (BK.sort.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' + esc(t('bk_c_' + c.k)) + arrow(c.k) + '</th>').join('') + '</tr></thead>' +
    '<tbody id="bk-body"></tbody></table>' : '<div class="empty">' + esc(t('bk_empty')) + '</div>';
  BK.win = [-1, -1];
  bkRenderBody(true);
  const n = $('#bk-count'); if (n) n.textContent = t('bk_n_rows', {n:BK.list.length});
}
function bkCellHTML(b, c, j, r){
  const v = bkVal(b, c.k), er = BK.errs.get(b.id), msg = er && er[c.k];
  const cur = BK.cur.r === r && BK.cur.c === j;
  let inner;
  if (c.sel) inner = v ? '<span class="bk-st st-' + esc(v) + '">' + esc(t('s_' + v)) + '</span>' : '';
  else if (c.color) inner = '<span class="bk-sw" style="background:' + esc(normHex(v) || '#FFFFFF') + '"></span>' + esc(v);
  else inner = esc(v);
  return '<td class="bk-cell' + (c.mono ? ' mono' : '') + (cur ? ' cur' : '') + (bkIsDirty(b, c.k) ? ' dirty' : '') + (msg ? ' err' : '') + '" data-c="' + j + '"' + (msg ? ' title="' + esc(msg) + '"' : '') + (cur ? ' aria-selected="true"' : '') + '>' + inner + '</td>';
}
function bkRowHTML(row, r, cols){
  if (row.g !== undefined){
    const all = row.ids.every(id => BK.sel.has(id));
    return '<tr class="bk-grp" data-r="' + r + '" style="height:' + BK.rowH + 'px"><td colspan="' + (cols.length + 1) + '"><button type="button" class="bk-grp-b" data-a="bk-grp-sel" data-r="' + r + '"><span class="bk-box' + (all ? ' on' : '') + '">' + (all ? ic('check') : '') + '</span><b>' + esc(row.g ? (BK.group === 'archive_state' ? t('s_' + row.g) : row.g) : '—') + '</b><span class="bk-n">' + row.ids.length + '</span></button></td></tr>';
  }
  const b = row.b, sel = BK.sel.has(b.id);
  return '<tr class="bk-row' + (sel ? ' sel' : '') + (BK.draft.has(b.id) ? ' dirty' : '') + '" data-r="' + r + '" data-id="' + b.id + '" style="height:' + BK.rowH + 'px">' +
    '<td class="bk-ck"><input type="checkbox" data-bk-sel data-r="' + r + '"' + (sel ? ' checked' : '') + ' tabindex="-1" aria-label="' + esc(b.speaking_code) + '"></td>' +
    cols.map((c, j) => bkCellHTML(b, c, j, r)).join('') + '</tr>';
}
/** Windowed body: only rows in view plus overscan; spacer rows keep the scroll height. */
function bkRenderBody(force){
  const g = $('#bk-grid'), body = $('#bk-body'); if (!g || !body) return;
  const H = BK.rowH, N = BK.rows.length, head = 38;
  const vh = g.clientHeight || 520;
  const first = Math.max(0, Math.floor((g.scrollTop - head) / H) - 12);
  const last = Math.min(N, first + Math.ceil(vh / H) + 24);
  if (!force && BK.win[0] === first && BK.win[1] === last) return;
  BK.win = [first, last];
  const cols = bkCols(); let h = '';
  if (first > 0) h += '<tr class="bk-sp" style="height:' + (first * H) + 'px"><td colspan="' + (cols.length + 1) + '"></td></tr>';
  for (let r = first; r < last; r++) h += bkRowHTML(BK.rows[r], r, cols);
  if (last < N) h += '<tr class="bk-sp" style="height:' + ((N - last) * H) + 'px"><td colspan="' + (cols.length + 1) + '"></td></tr>';
  body.innerHTML = h;
}
function bkOnScroll(){
  if (BK.raf) return;
  BK.raf = requestAnimationFrame(() => {
    BK.raf = 0;
    if (BK.edit){   // keep the open editor while its cell is on screen; scrolled away → commit it
      const g = $('#bk-grid'), td = BK.edit.inp.closest('td');
      if (g && td && td.isConnected){ const a = td.getBoundingClientRect(), z = g.getBoundingClientRect(); if (a.bottom > z.top && a.top < z.bottom) return; }
      bkCommitEdit(); return;
    }
    bkRenderBody(false);
  });
}
function bkRenderSelBar(){
  const el = $('#bk-selbar'); if (!el) return;
  const n = BK.sel.size, op = BK.op;
  const ops = ['category', 'tag_add', 'tag_rm', 'state', 'color'].concat(bkHasAuto() ? ['color_auto'] : []).concat(['loc', 'year', 'city']);
  if (!ops.includes(op)) BK.op = 'category';
  let val = '';
  if (BK.op === 'state') val = '<select class="inp" id="bk-op-v">' + STATES.map(s => '<option value="' + s + '">' + esc(t('s_' + s)) + '</option>').join('') + '</select>';
  else if (BK.op === 'color') val = '<input type="color" class="bk-color" id="bk-op-v" value="#2563EB" aria-label="' + esc(t('bk_c_color_hex')) + '">';
  else if (BK.op === 'color_auto') val = '<span class="small muted">' + esc(t('bk_op_auto_d')) + '</span>';
  else val = '<input class="inp" id="bk-op-v" autocomplete="off"' + (BK.op === 'loc' ? ' placeholder="' + esc(t('bk_op_loc_ph')) + '"' : '') + '>';
  el.innerHTML = '<span class="bk-seln"><b>' + esc(t('bk_sel', {n})) + '</b></span>' +
    '<button class="btn btn-sm" data-a="bk-sel-all">' + ic('check') + esc(t('bk_sel_all')) + '</button>' +
    '<button class="btn btn-sm" data-a="bk-sel-none"' + (n ? '' : ' disabled') + '>' + esc(t('bk_sel_none')) + '</button>' +
    (n ? '<span class="bk-opbox"><select class="inp" id="bk-op" aria-label="' + esc(t('bk_op')) + '">' + ops.map(o => '<option value="' + o + '"' + (o === BK.op ? ' selected' : '') + '>' + esc(t('bk_op_' + o)) + '</option>').join('') + '</select>' + val +
      '<button class="btn btn-sm btn-primary" data-a="bk-apply" id="bk-apply">' + ic('check') + esc(t('bk_apply', {n})) + '</button>' +
      '<button class="btn btn-sm" data-a="bk-fill" title="' + esc(t('bk_fill_d')) + '">↓ ' + esc(t('bk_fill')) + '</button></span>'
      : '<span class="small muted bk-hint">' + esc(t('bk_sel_hint')) + '</span>');
  const v = $('#bk-op-v');
  if (v && v.tagName === 'INPUT' && v.type !== 'color'){
    const src = {category:ED_SOURCES.category, tag_add:ED_SOURCES.tags, tag_rm:bkSelTags, loc:ED_SOURCES.quickloc, year:ED_SOURCES.ref_year, city:ED_SOURCES.company_city}[BK.op];
    if (src) taAttach(v, {source:src, multi:BK.op === 'tag_add' || BK.op === 'tag_rm', joiner:',', top:8, minWidth:220});
    v.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.defaultPrevented){ e.preventDefault(); bkApplyOp(); } });
  }
}
/** Tags present in the selected rows (source for "Rimuovi tag"). */
function bkSelTags(){ return edCount([].concat(...BK.list.filter(b => BK.sel.has(b.id)).map(b => taTokens(bkVal(b, 'tags')))).filter(x => x.toLowerCase() !== DEMO_TAG)); }
function bkRenderSaveBar(){
  const el = $('#bk-savebar'); if (!el) return;
  const n = BK.draft.size;
  el.classList.toggle('on', n > 0);
  if (!n){ el.innerHTML = ''; return; }
  let f = 0; BK.draft.forEach(d => { f += Object.keys(d).length; });
  const ne = bkErrCount();
  let first = ''; BK.errs.forEach(e => { if (!first) first = Object.values(e)[0]; });
  el.innerHTML = '<div class="bk-save-in">' + ic('pencil') + '<span><b>' + esc(t(n === 1 ? 'bk_dirty1' : 'bk_dirty', {n}) + ' · ' + t(f === 1 ? 'bk_nf1' : 'bk_nf', {n:f})) + '</b>' +
    (ne ? '<span class="bk-errmsg">' + ic('alert') + esc(t('bk_errs', {n:ne})) + ': ' + esc(first) + ' <button class="ed-link" data-a="bk-goto-err">' + esc(t('bk_goto')) + '</button></span>' : '') + '</span>' +
    '<span style="flex:1"></span>' +
    '<button class="btn btn-sm" data-a="bk-undo"' + (BK.hist.length ? '' : ' disabled') + ' title="Ctrl+Z">' + ic('rotate') + esc(t('bk_undo')) + '</button>' +
    '<button class="btn btn-sm btn-danger" data-a="bk-discard">' + ic('x') + esc(t('bk_discard')) + '</button>' +
    '<button class="btn btn-primary" data-a="bk-save" id="bk-save"' + (ne ? ' disabled' : '') + ' title="Ctrl+S">' + ic('save') + esc(t('bk_save', {n})) + '</button></div>';
}
/** Re-render everything below the toolbar (keeps focus in the search box / filters). */
function bkRefresh(rebuild){
  if (rebuild !== false) bkBuildRows();
  bkRenderTable(); bkRenderSelBar(); bkRenderSaveBar();
}
/** After a staged change: rows stay where they are (no re-sort), cells and bars update. */
function bkAfterChange(){ bkRenderBody(true); bkRenderSaveBar(); const all = $('[data-bk-all]'); if (all) all.checked = BK.list.length > 0 && BK.list.every(b => BK.sel.has(b.id)); }

/* ---------------- cursor & navigation ---------------- */
const bkCurRow = () => BK.rows[BK.cur.r] && BK.rows[BK.cur.r].b;
function bkCurTd(){ const g = $('#bk-grid'); return g ? g.querySelector('tr[data-r="' + BK.cur.r + '"] td.bk-cell[data-c="' + BK.cur.c + '"]') : null; }
function bkStepRow(r, d){ let x = r; do { x += d; } while (x >= 0 && x < BK.rows.length && !BK.rows[x].b); return x >= 0 && x < BK.rows.length ? x : r; }
function bkMove(r, c){
  const nc = bkCols().length;
  BK.cur.r = clamp(r, 0, Math.max(0, BK.rows.length - 1)); BK.cur.c = clamp(c, 0, nc - 1);
  if (BK.rows[BK.cur.r] && !BK.rows[BK.cur.r].b) BK.cur.r = bkStepRow(BK.cur.r, 1);
  bkEnsureVisible(); bkRenderBody(true); bkEnsureVisibleX();
}
function bkEnsureVisible(){
  const g = $('#bk-grid'); if (!g) return;
  const head = 38, top = BK.cur.r * BK.rowH, vh = g.clientHeight - head;
  if (top < g.scrollTop) g.scrollTop = top;
  else if (top + BK.rowH > g.scrollTop + vh) g.scrollTop = top + BK.rowH - vh;
}
function bkEnsureVisibleX(){
  const g = $('#bk-grid'), td = bkCurTd(); if (!g || !td) return;
  const l = td.offsetLeft, r = l + td.offsetWidth, ck = 40;
  if (l - ck < g.scrollLeft) g.scrollLeft = Math.max(0, l - ck);
  else if (r > g.scrollLeft + g.clientWidth) g.scrollLeft = r - g.clientWidth;
}
function bkFocusGrid(){ const g = $('#bk-grid'); if (g && document.activeElement !== g) g.focus({preventScroll:true}); }
function bkToggleSel(id, on){ if (on === undefined) on = !BK.sel.has(id); if (on) BK.sel.add(id); else BK.sel.delete(id); }
function bkSelChanged(){ bkRenderBody(true); bkRenderSelBar(); const all = $('[data-bk-all]'); if (all) all.checked = BK.list.length > 0 && BK.list.every(b => BK.sel.has(b.id)); }

function bkGridKey(e){
  if (e.target !== e.currentTarget || BK.edit) return;   // keys inside a cell editor are handled by the editor
  const k = e.key, ctrl = e.ctrlKey || e.metaKey, r = BK.cur.r, c = BK.cur.c, nc = bkCols().length;
  if (r < 0 && BK.rows.length) { BK.cur.r = bkStepRow(-1, 1); }
  const b = bkCurRow();
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  if (ctrl && k.toLowerCase() === 'z'){ stop(); bkUndo(); return; }
  if (ctrl && k.toLowerCase() === 'd'){ stop(); bkFill(); return; }
  if (ctrl && k.toLowerCase() === 'a'){ stop(); BK.list.forEach(x => BK.sel.add(x.id)); bkSelChanged(); return; }
  if (ctrl && k.toLowerCase() === 'c'){ stop(); if (b){ const col = bkCols()[c]; BK.clip = {k:col.k, v:bkVal(b, col.k)}; try { navigator.clipboard && navigator.clipboard.writeText(BK.clip.v).catch(() => {}); } catch(err){} toast(t('bk_copied') + ': ' + (BK.clip.v || '—')); } return; }
  if (ctrl && k.toLowerCase() === 'v'){ stop(); bkPaste(); return; }
  if (ctrl && !['Home', 'End'].includes(k)) return;
  if (k === 'ArrowDown' || k === 'ArrowUp'){
    stop();
    const nr = bkStepRow(BK.cur.r, k === 'ArrowDown' ? 1 : -1);
    if (e.shiftKey){ if (b) BK.sel.add(b.id); const nb = BK.rows[nr] && BK.rows[nr].b; if (nb) BK.sel.add(nb.id); BK.anchor = nr; bkMove(nr, c); bkRenderSelBar(); return; }
    bkMove(nr, c); return;
  }
  if (k === 'ArrowRight'){ stop(); bkMove(BK.cur.r, c + 1); return; }
  if (k === 'ArrowLeft'){ stop(); bkMove(BK.cur.r, c - 1); return; }
  if (k === 'Tab'){ stop(); bkTabMove(e.shiftKey ? -1 : 1); return; }
  if (k === 'Home'){ stop(); bkMove(ctrl ? bkStepRow(-1, 1) : BK.cur.r, 0); return; }
  if (k === 'End'){ stop(); bkMove(ctrl ? bkStepRow(BK.rows.length, -1) : BK.cur.r, nc - 1); return; }
  if (k === 'PageDown' || k === 'PageUp'){ stop(); const g = $('#bk-grid'), step = Math.max(1, Math.floor((g.clientHeight - 38) / BK.rowH) - 1); let nr = BK.cur.r; for (let i = 0; i < step; i++) nr = bkStepRow(nr, k === 'PageDown' ? 1 : -1); bkMove(nr, c); return; }
  if (k === 'Enter' || k === 'F2'){ stop(); if (e.shiftKey && k === 'Enter') bkMove(bkStepRow(BK.cur.r, -1), c); else bkStartEdit(); return; }
  if (k === ' '){ stop(); if (b){ bkToggleSel(b.id); BK.anchor = BK.cur.r; bkSelChanged(); } return; }
  if (k === 'Escape'){ if (BK.sel.size){ stop(); BK.sel.clear(); bkSelChanged(); } return; }
  if (k === 'Delete' || k === 'Backspace'){
    stop(); const col = bkCols()[c]; if (!b || col.sel || col.color || col.req) return;
    if (bkApply([{id:b.id, patch:col.loc ? {room_code:'', cabinet_code:'', shelf_code:'', sector_code:''} : {[col.k]:''}}])) bkAfterChange();
    return;
  }
  if (k.length === 1 && !e.altKey){ stop(); bkStartEdit(k); }
}
function bkTabMove(d){
  const nc = bkCols().length;
  let r = BK.cur.r, c = BK.cur.c + d;
  if (c >= nc){ c = 0; r = bkStepRow(r, 1); } else if (c < 0){ c = nc - 1; r = bkStepRow(r, -1); }
  bkMove(r, c);
}
function bkGridMouse(e){
  const td = e.target.closest('td.bk-cell'); if (!td) return;
  if (BK.edit && td.contains(BK.edit.inp)) return;
  const tr = td.closest('tr[data-r]');
  if (BK.edit) bkCommitEdit();
  BK.cur.r = +tr.dataset.r; BK.cur.c = +td.dataset.c;
  bkRenderBody(true); bkEnsureVisibleX();
  e.preventDefault(); bkFocusGrid();
}
function bkGridClick(e){
  const ck = e.target.closest('input[data-bk-sel]');
  if (ck){
    const r = +ck.dataset.r, row = BK.rows[r]; if (!row || !row.b) return;
    if (e.shiftKey && BK.anchor >= 0){
      const [a, z] = [Math.min(BK.anchor, r), Math.max(BK.anchor, r)];
      for (let i = a; i <= z; i++) if (BK.rows[i] && BK.rows[i].b) BK.sel.add(BK.rows[i].b.id);
    } else bkToggleSel(row.b.id, ck.checked);
    BK.anchor = r; bkSelChanged(); return;
  }
  const all = e.target.closest('input[data-bk-all]');
  if (all){ if (all.checked) BK.list.forEach(b => BK.sel.add(b.id)); else BK.sel.clear(); bkSelChanged(); }
}

/* ---------------- cell editor ---------------- */
function bkStartEdit(initial){
  const b = bkCurRow(), col = bkCols()[BK.cur.c]; if (!b || !col) return;
  bkEnsureVisible(); bkRenderBody(true);
  const td = bkCurTd(); if (!td) return;
  const cur = bkVal(b, col.k);
  let inp;
  if (col.sel){
    inp = document.createElement('select');
    inp.innerHTML = STATES.map(s => '<option value="' + s + '"' + (s === cur ? ' selected' : '') + '>' + esc(t('s_' + s)) + '</option>').join('');
    if (initial){ const hit = STATES.find(s => taFold(t('s_' + s)).startsWith(taFold(initial))); if (hit) inp.value = hit; }
  } else {
    inp = document.createElement('input');
    inp.value = initial != null ? initial : cur;
    inp.spellcheck = false;
  }
  inp.className = 'bk-inp' + (col.mono ? ' mono' : '');
  inp.setAttribute('aria-label', t('bk_c_' + col.k));
  td.textContent = ''; td.classList.add('editing'); td.appendChild(inp);
  BK.edit = {id:b.id, k:col.k, inp, orig:cur};
  if (!col.sel){
    const src = col.color ? bkColorSource : ED_SOURCES[col.ta];
    if (src) taAttach(inp, {source:src, multi:!!col.multi, joiner:col.joiner || ', ', top:8, minWidth:Math.max(220, col.w)});
  }
  inp.addEventListener('keydown', bkEditKey);
  inp.addEventListener('blur', () => { if (BK.edit && BK.edit.inp === inp) bkCommitEdit(); });
  inp.focus({preventScroll:true});
  if (inp.tagName === 'INPUT'){ const n = inp.value.length; try { if (initial != null) inp.setSelectionRange(n, n); else inp.select(); } catch(err){} if (initial != null && inp._ta) taOpen(inp); }
}
function bkColorSource(){
  const l = edCount(S.binders.map(b => b.color_hex)).map(c => Object.assign(c, {mono:true}));
  const known = new Set(l.map(c => c.value.toUpperCase()));
  COLORS.forEach(c => { if (!known.has(c)) l.push({value:c, count:0, mono:true}); });
  return l;
}
function bkEditKey(e){
  const k = e.key;
  if (e.defaultPrevented){   // the typeahead used the key: a single-value pick with Enter also commits the cell
    const col = BK.edit && BULK_COLS.find(c => c.k === BK.edit.k);
    if (k === 'Enter' && col && !col.multi){ bkCommitEdit(); bkMove(bkStepRow(BK.cur.r, 1), BK.cur.c); bkFocusGrid(); }
    return;
  }
  if (k === 'Enter'){ e.preventDefault(); e.stopPropagation(); bkCommitEdit(); bkMove(bkStepRow(BK.cur.r, e.shiftKey ? -1 : 1), BK.cur.c); bkFocusGrid(); }
  else if (k === 'Tab'){ e.preventDefault(); e.stopPropagation(); bkCommitEdit(); bkTabMove(e.shiftKey ? -1 : 1); bkFocusGrid(); }
  else if (k === 'Escape'){ e.preventDefault(); e.stopPropagation(); bkCancelEdit(); }
  else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 's'){ e.preventDefault(); e.stopPropagation(); bkCommitEdit(); bkSave(); }
}
function bkCancelEdit(){ if (!BK.edit) return; BK.edit = null; taClose(); bkRenderBody(true); bkFocusGrid(); }
/** Normalise a typed value the way the editor does. Returns a patch, or null when the value is invalid. */
function bkPatchFor(k, v, b){
  v = String(v == null ? '' : v);
  if (k === 'speaking_code') return {speaking_code:v.toUpperCase().replace(/\s+/g, '')};
  if (k === 'company_name'){ const hit = edFindCompany(v.trim()); return {company_name:hit ? hit.value : v.trim()}; }   // existing spelling wins: no duplicate clients
  if (k === 'tags') return {tags:edTidyList(v, ',')};
  if (k === 'extra_codes' || k === 'contacts') return {[k]:edTidyList(v, ', ')};
  if (k === 'location_code'){ const p = parseQuickLocation(v) || {}; const o = {}; BK_LOC.forEach(x => { o[x] = p[x] || ''; }); return o; }
  if (k === 'archive_state') return STATES.includes(v) ? {archive_state:v} : null;
  if (k === 'color_hex'){ const h = normHex(v); return h ? {color_hex:h} : null; }
  if (k === 'multi_code') return {multi_code:v.trim().replace(/\s+/g, ' ')};
  return {[k]:v.trim()};
}
function bkCommitEdit(){
  const ed = BK.edit; if (!ed) return;
  BK.edit = null; taClose();
  const b = bkById(ed.id);
  if (b){
    const v = ed.inp.value;
    if (v !== ed.orig){
      const patch = bkPatchFor(ed.k, v, b);
      if (!patch) toast(t('bk_bad_color'), 'err');
      else {
        if (ed.k === 'color_hex') bkColorHook(b, patch, 'manual');
        bkApply([{id:b.id, patch}]);
      }
    }
  }
  bkAfterChange();
}
/** Optional hooks from the colour module (02b-colors.js, stream K). Copies any field they change into the patch. */
function bkColorHook(b, patch, how){
  const fn = how === 'auto' ? (window.colorAssign || window.applyAutoColor) : window.colorMarkManual;
  if (typeof fn !== 'function') return patch;
  try {
    const m = Object.assign(bkMerged(b), patch), before = JSON.stringify(m);
    if (how === 'auto' && 'color_locked' in m) m.color_locked = false;   // "Colore automatico" unlocks, like the editor's Automatico
    const r = fn(m, S.binders);
    if (how === 'auto' && typeof r === 'string' && normHex(r)) m.color_hex = normHex(r);
    if (JSON.stringify(m) !== before || how === 'auto') Object.keys(m).forEach(k => { if (typeof m[k] !== 'object' && String(m[k]) !== String(bkVal(b, k))) patch[k] = m[k]; });
  } catch(err){ console.warn('color hook', err); }
  return patch;
}

/* ---------------- multi-row operations ---------------- */
function bkSelected(){ return BK.list.filter(b => BK.sel.has(b.id)); }
function bkApplyOp(){
  const sel = bkSelected(); if (!sel.length){ toast(t('bk_need_sel'), 'warn'); return; }
  const op = BK.op, vEl = $('#bk-op-v'), raw = vEl ? vEl.value : '';
  const tokens = taTokens(raw);
  if (!['state', 'color', 'color_auto'].includes(op) && !raw.trim()){ toast(t('bk_need_val'), 'warn'); vEl && vEl.focus(); return; }
  const changes = sel.map(b => {
    let patch = {};
    if (op === 'category') patch = {category:raw.trim()};
    else if (op === 'year') patch = {ref_year:raw.trim()};
    else if (op === 'city') patch = {company_city:raw.trim()};
    else if (op === 'state') patch = {archive_state:raw};
    else if (op === 'tag_add') patch = {tags:edTidyList(bkVal(b, 'tags') + ',' + tokens.join(','), ',')};
    else if (op === 'tag_rm'){ const rm = new Set(tokens.map(taFold)); patch = {tags:taTokens(bkVal(b, 'tags')).filter(x => !rm.has(taFold(x))).join(',')}; }
    else if (op === 'color'){ const h = normHex(raw); if (!h) return null; patch = bkColorHook(b, {color_hex:h}, 'manual'); }
    else if (op === 'color_auto') patch = bkColorHook(b, {}, 'auto');
    else if (op === 'loc'){ const p = parseQuickLocation(raw) || {}; BK_LOC.forEach(x => { if (p[x]) patch[x] = p[x]; }); }
    return {id:b.id, patch};
  }).filter(Boolean);
  const n = bkApply(changes);
  toast(n ? t('bk_applied', {n}) : t('bk_nothing'), n ? 'ok' : 'warn');
  bkAfterChange(); bkRenderSelBar();
}
/** Ctrl+D: the active cell value goes to the same column of every selected row; with no selection, copy from the row above. */
function bkFill(){
  const b = bkCurRow(), col = bkCols()[BK.cur.c]; if (!b || !col) return;
  let src = b, targets = bkSelected().filter(x => x.id !== b.id);
  if (!targets.length){ const up = BK.rows[bkStepRow(BK.cur.r, -1)]; if (!up || !up.b || up.b === b) return; src = up.b; targets = [b]; }
  const patch = col.loc ? Object.fromEntries(BK_LOC.map(x => [x, bkVal(src, x)])) : {[col.k]:bkVal(src, col.k)};
  if (col.k === 'speaking_code') return;   // unique: never copied
  const n = bkApply(targets.map(x => ({id:x.id, patch:Object.assign({}, patch)})));
  if (n && targets.length > 1) toast(t('bk_applied', {n}));
  bkAfterChange();
}
function bkPaste(){
  const c = BK.clip, b = bkCurRow(), col = bkCols()[BK.cur.c]; if (!c || !b || !col || col.k === 'speaking_code' && BK.sel.size > 1) return;
  const patch = bkPatchFor(col.k, c.v, b); if (!patch) return;
  const targets = BK.sel.size ? bkSelected() : [b];
  bkApply(targets.map(x => ({id:x.id, patch:Object.assign({}, patch)})));
  bkAfterChange();
}

/* ---------------- undo, save, discard ---------------- */
function bkUndo(){
  if (bkUndoStep()){ bkAfterChange(); toast(t('bk_undone_step')); return; }
  if (BK.savedUndo && UNDO === BK.savedUndo){   // nothing pending: undo the last bulk save (same as the toast's Undo)
    const W = UNDO; UNDO = null; BK.savedUndo = null;
    applyWorkspaceObject(W); logUndo(); commit(); renderAll(); toast(t('undone'));
  }
}
function bkSave(){
  if (BK.edit) bkCommitEdit();
  if (!BK.draft.size) return 0;
  bkValidate();
  if (BK.errs.size){ toast(t('bk_errs', {n:bkErrCount()}), 'err'); bkGotoErr(); return 0; }
  undoPoint();
  const items = [], fields = new Set(), at = nowISO();
  BK.draft.forEach((d, id) => {
    const i = S.binders.findIndex(b => b.id === id); if (i < 0) return;
    const old = S.binders[i];
    const nb = normalizeBinder(Object.assign(clone(old), d, {updated_at:at}));
    const ch = logDiff(old, nb), keys = Object.keys(ch);
    if (!keys.length) return;
    keys.forEach(k => fields.add(k));
    S.binders[i] = nb;
    items.push({id, code:nb.speaking_code, changed:ch});
  });
  BK.draft.clear(); BK.hist = []; BK.errs = new Map();
  if (!items.length){ bkRefresh(); return 0; }
  logAct('binder.bulk_edit', items.length === 1 ? logBT(bkById(items[0].id)) : null,
    'Modifica massiva: ' + items.length + (items.length === 1 ? ' faldone' : ' faldoni') + ' (' + Array.from(fields).map(k => LOG_FIELD_IT[k] || k).join(', ') + ')' + ': ' + logCut(items.map(x => x.code).join(', '), 160),
    {count:items.length, fields:Array.from(fields), binders:items});
  commit();
  BK.savedUndo = UNDO;
  bkRefresh();
  undoToast(t('bk_saved', {n:items.length}));
  bkFocusGrid();
  return items.length;
}
function bkGotoErr(){
  let id = null, k = null; BK.errs.forEach((e, i) => { if (!id){ id = i; k = Object.keys(e)[0]; } });
  if (!id) return;
  let r = BK.rows.findIndex(x => x.b && x.b.id === id);
  if (r < 0){ UI.q = ''; UI.fState = UI.fRoom = UI.fCat = ''; UI.fInfo = null; renderView(); r = BK.rows.findIndex(x => x.b && x.b.id === id); }
  let c = bkCols().findIndex(x => x.k === k);
  if (c < 0){ S.settings.bulkCols = bkCols().map(x => x.k).concat([k]); savePrefs(); bkRenderTable(); c = bkCols().findIndex(x => x.k === k); }
  bkMove(r, c); bkFocusGrid();
}
function bkDiscard(after){
  const go = () => { BK.draft.clear(); BK.hist = []; BK.errs = new Map(); if (after) after(); else bkRefresh(false); };
  if (!BK.draft.size) return go();
  confirmAction({plain:true, title:t('bk_discard_t'), detail:t('bk_discard_d', {n:BK.draft.size}), okLabel:t('bk_discard_ok'), onOk:go});
}
function bulkOpen(){
  BK.on = true; BK.sel.clear(); BK.cur = {r:-1, c:0}; BK.anchor = -1; BK.edit = null;
  S.view = 'archive'; renderView(); window.scrollTo(0, 0); bkFocusGrid();
}
function bulkClose(){ bkDiscard(() => { BK.on = false; BK.sel.clear(); BK.edit = null; taClose(); renderView(); }); }

const BULK_ACTIONS = {
  'bulk-open': () => bulkOpen(),
  'bulk-close': () => bulkClose(),
  'bk-sort': (el) => {
    const k = el.dataset.k;
    if (BK.sort.k !== k) BK.sort = {k, dir:1}; else if (BK.sort.dir > 0) BK.sort.dir = -1; else BK.sort = {k:'', dir:1};
    bkRefresh(); bkFocusGrid();
  },
  'bk-sel-all': () => { BK.list.forEach(b => BK.sel.add(b.id)); bkSelChanged(); },
  'bk-sel-none': () => { BK.sel.clear(); bkSelChanged(); },
  'bk-grp-sel': (el) => { const row = BK.rows[+el.dataset.r]; if (!row || !row.ids) return; const all = row.ids.every(id => BK.sel.has(id)); row.ids.forEach(id => bkToggleSel(id, !all)); bkSelChanged(); },
  'bk-apply': () => bkApplyOp(),
  'bk-fill': () => { bkFill(); bkFocusGrid(); },
  'bk-undo': () => { bkUndo(); bkFocusGrid(); },
  'bk-save': () => bkSave(),
  'bk-discard': () => bkDiscard(),
  'bk-goto-err': () => bkGotoErr()
};

/* ---------------- toolbar inputs (own data attributes: the archive's data-bind would re-render the hidden table) ---------------- */
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.hasAttribute && el.hasAttribute('data-bk-q')){ UI.q = el.value; clearTimeout(BK.qT); BK.qT = setTimeout(() => { if (BK.on) bkRefresh(); }, 120); }
});
document.addEventListener('change', (e) => {
  const el = e.target; if (!el.dataset) return;
  if (el.dataset.bkF){ UI[el.dataset.bkF] = el.value; bkRefresh(); }
  else if (el.hasAttribute('data-bk-group')){ BK.group = el.value; bkRefresh(); }
  else if (el.dataset.bkCol){
    const keys = new Set(bkCols().map(c => c.k)); if (el.checked) keys.add(el.dataset.bkCol); else keys.delete(el.dataset.bkCol);
    if (!keys.size){ el.checked = true; return; }
    S.settings.bulkCols = BULK_COLS.filter(c => keys.has(c.k)).map(c => c.k); savePrefs(); bkRenderTable();
  }
  else if (el.id === 'bk-op'){ BK.op = el.value; bkRenderSelBar(); const v = $('#bk-op-v'); if (v) v.focus(); }
});
// Ctrl+S saves the pending bulk changes (before the global "quick backup" shortcut)
document.addEventListener('keydown', (e) => {
  if (!BK.on || S.view !== 'archive' || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's' || !BK.draft.size || (typeof topModal === 'function' && topModal())) return;
  e.preventDefault(); e.stopPropagation(); bkSave();
}, true);
window.addEventListener('beforeunload', (e) => { if (BK.draft.size){ e.preventDefault(); e.returnValue = ''; return ''; } });

/* ---------------- help topic ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined') return;
  HELP_TOPICS.push({ id:'bulk', guide:null, tags:['archive'], related:['info', 'log'],
    title:{it:'Modifica massiva: categorizzare tanti faldoni insieme', en:'Bulk edit: categorise many binders at once'},
    body:{it:'<p>In <b>Archivio</b> premi <b>Modifica massiva</b>: si apre una griglia tipo foglio di calcolo con una riga per faldone (rispetta ricerca e filtri dell\'archivio).</p><ul><li><b>Muoversi</b>: frecce, Tab, Invio, Pag su/giù. <b>Modificare</b>: scrivi direttamente, oppure Invio/F2 o doppio clic. Esc annulla la cella. I suggerimenti propongono i valori già usati (ad es. la grafia esatta del cliente), così non nascono doppioni.</li><li><b>Più righe insieme</b>: spunta le righe (Spazio, Maiusc+clic, Maiusc+frecce, Ctrl+A o il riquadro del gruppo) e scegli <b>Imposta categoria</b>, <b>Aggiungi/Rimuovi tag</b>, <b>Imposta stato</b>, <b>Imposta colore</b>, <b>Imposta posizione (prefisso)</b>… poi <b>Applica</b>. <b>Ctrl+D</b> copia il valore della cella attiva nelle righe selezionate.</li><li><b>Ordina</b> cliccando l\'intestazione di colonna; <b>Raggruppa</b> per categoria, cliente, stato o stanza; scegli le <b>Colonne</b> da vedere.</li><li>Le modifiche restano <b>in sospeso</b> (celle evidenziate) finché non premi <b>Salva modifiche</b> (o Ctrl+S). Ctrl+Z annulla l\'ultima modifica in sospeso; <b>Annulla tutto</b> le scarta. Codici parlanti doppi o vuoti bloccano il salvataggio.</li><li>Il salvataggio è un\'unica operazione: si annulla in un colpo dal messaggio <b>Annulla</b> ed è scritta nel Registro attività con i campi cambiati per ogni faldone.</li></ul>',
          en:'<p>In <b>Archive</b> press <b>Bulk edit</b>: a spreadsheet-like grid opens with one row per binder (it follows the archive search and filters).</p><ul><li><b>Move</b>: arrows, Tab, Enter, Page up/down. <b>Edit</b>: just type, or Enter/F2 or double-click. Esc cancels the cell. Suggestions offer the values already in use (e.g. the exact client spelling), so no duplicates appear.</li><li><b>Many rows at once</b>: tick rows (Space, Shift+click, Shift+arrows, Ctrl+A or the group box) and choose <b>Set category</b>, <b>Add/Remove tag</b>, <b>Set state</b>, <b>Set colour</b>, <b>Set position (prefix)</b>… then <b>Apply</b>. <b>Ctrl+D</b> copies the active cell value into the selected rows.</li><li><b>Sort</b> by clicking a column header; <b>Group by</b> category, client, state or room; pick the <b>Columns</b> to show.</li><li>Changes stay <b>pending</b> (highlighted cells) until you press <b>Save changes</b> (or Ctrl+S). Ctrl+Z undoes the last pending change; <b>Discard all</b> drops them. Duplicate or empty speaking codes block the save.</li><li>Saving is a single operation: one <b>Undo</b> from the message restores everything, and it is written to the Activity log with the changed fields of each binder.</li></ul>'} });
});
