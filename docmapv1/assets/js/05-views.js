/* =====================================================================
   DocMap 2026 — Views
   ===================================================================== */
const UI = { q:'', fState:'', fRoom:'', fCat:'', importText:'', importParsed:null, restoreAll:true, prune:false, regSelOnly:false, aiCtx:true, ed:null };
const PX_PER_MM = 96 / 25.4;

/* ---------------- Topbar & banner ---------------- */
function renderTopbar(){
  infoApplyCatColors();   // keep CAT_COLOR in sync with Informazioni › Categorie (runs after every commit and renderAll)
  $('#topbar').innerHTML = topbarHTML();   // 06d-info.js: 3 main tabs + "Funzioni avanzate" menu
}
function renderBanner(){
  let h = '';
  if (otherTabChanged) h += '<div class="banner"><div class="in">' + ic('alert') + '<span>' + esc(t('other_tab')) + '</span><button class="btn btn-sm" data-a="reload">' + ic('refresh') + esc(t('reload')) + '</button></div></div>';
  if (!storageOk) h += '<div class="banner" style="background:#FEE2E2;border-color:#FECACA;color:#7F1D1D"><div class="in">' + ic('alert') + '<span>' + esc(t('storage_fail')) + '</span><button class="btn btn-sm" data-a="quick-backup">' + ic('save') + esc(t('quick_backup')) + '</button></div></div>';
  $('#banner-root').innerHTML = h;
}
function renderView(){
  document.documentElement.lang = S.lang;
  const v = S.view;
  if (v === 'clients'){ S.view = 'info'; S.infoTab = 'clients'; return renderView(); }
  const fn = {archive:viewArchive, print:viewPrint, import:viewImport, export:viewExport, ai:viewAI, database:viewDatabase, settings:viewSettings, info:viewInfo}[v] || viewArchive;
  $('#view').innerHTML = fn();
  if (v === 'print') mountPrint();
  if (v === 'archive') renderArchiveResults();
  if (v === 'info') mountInfo();
}
function renderAll(){ document.body.dataset.drop = t('drop_here'); renderBanner(); renderTopbar(); renderView(); }

/* ---------------- Archive ---------------- */
function stateBadge(s){ const c = s === 'CURRENT' ? 'b-current' : s === 'HISTORICAL' ? 'b-historical' : 'b-out'; return '<span class="badge ' + c + '">' + esc(t('s_' + s)) + '</span>'; }
function filteredBinders(){
  const q = UI.q.trim().toLowerCase();
  return sortedBinders().filter(b => {
    if (S.settings.hideDemo && isDemo(b)) return false;
    if (UI.fState && b.archive_state !== UI.fState) return false;
    if (UI.fRoom && b.room_code !== UI.fRoom) return false;
    if (UI.fCat && b.category !== UI.fCat) return false;
    if (UI.fInfo && !infoMatch(b, UI.fInfo)) return false;   // filter set from Informazioni
    if (!q) return true;
    const hay = [b.speaking_code, b.multi_code, b.company_name, b.company_city, b.ref_year, b.extra_codes, b.category, b.binder_title, b.location_code, b.tags, b.short_code, contentsToPipe(b.contents_items), t('s_' + b.archive_state)].join(' ').toLowerCase();
    return q.split(/\s+/).every(w => hay.indexOf(w) >= 0);
  });
}
function viewArchive(){
  const rooms = Array.from(new Set(S.binders.map(b => b.room_code).filter(Boolean))).sort(naturalCmp);
  const cats = Array.from(new Set(S.binders.map(b => b.category).filter(Boolean))).sort(naturalCmp);
  const sel = (id, all, opts, cur) => '<select class="inp" data-bind="' + id + '"><option value="">' + esc(all) + '</option>' + opts.map(o => '<option value="' + esc(o[0]) + '"' + (cur === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
  return '<div class="page-h"><div><h1>' + esc(t('arch_h')) + helpDot('create') + '</h1><p>' + esc(t('arch_p')) + '</p></div>' +
    '<div class="row"><button class="btn btn-lg btn-primary" data-a="new-binder">' + ic('plus') + esc(t('new_binder')) + '</button></div></div>' +
    demoBarHTML() + infoFilterBarHTML() +
    '<div class="kpis" id="kpis"></div>' +
    '<div class="card"><div class="toolbar">' +
      '<div class="search">' + ic('search') + '<input class="inp" type="search" data-bind="q" value="' + esc(UI.q) + '" placeholder="' + esc(t('search_ph')) + '" aria-label="search"></div>' +
      sel('fState', t('all_states'), STATES.map(s => [s, t('s_' + s)]), UI.fState) +
      sel('fRoom', t('all_rooms'), rooms.map(r => [r, r]), UI.fRoom) +
      sel('fCat', t('all_cats'), cats.map(c => [c, c]), UI.fCat) +
      '<div class="seg"><button data-a="arch-view" data-v="table" class="' + (S.archiveView !== 'map' ? 'on' : '') + '">' + esc(t('view_table')) + '</button><button data-a="arch-view" data-v="map" class="' + (S.archiveView === 'map' ? 'on' : '') + '">' + esc(t('view_map')) + '</button></div>' +
    '</div>' +
    '<div class="toolbar" style="padding-top:0;gap:8px" id="bulkbar"></div>' +
    '<div id="arch-results"></div></div>';
}
function renderArchiveResults(){
  const list = filteredBinders();
  const selN = printQueueBinders().length;
  const kp = $('#kpis');
  const vis = S.settings.hideDemo ? S.binders.filter(b => !isDemo(b)) : S.binders;
  if (kp) kp.innerHTML = [[vis.length, 'k_total'], [new Set(vis.map(b => b.company_name)).size, 'k_clients'], [vis.filter(b => b.archive_state === 'CHECKED_OUT').length, 'k_out'], [selN, 'k_print']]
    .map(([v, k]) => '<div class="card kpi"><div class="v">' + v + '</div><div class="k">' + esc(t(k)) + '</div></div>').join('');
  const bb = $('#bulkbar');
  if (bb) bb.innerHTML = '<button class="btn btn-sm" data-a="sel-all">' + ic('check') + esc(t('sel_all')) + '</button><button class="btn btn-sm" data-a="sel-none">' + esc(t('sel_none')) + '</button>' +
    '<span class="small muted" style="margin:0 6px">' + esc(t('queue_sel', {n:selN})) + '</span>' +
    '<span style="flex:1"></span><button class="btn btn-sm btn-danger" data-a="del-sel"' + (selN ? '' : ' disabled') + '>' + ic('trash') + esc(t('del_sel')) + '</button>' +
    '<button class="btn btn-sm btn-dark" data-a="nav" data-v="print"' + (selN ? '' : ' disabled') + '>' + ic('printer') + esc(t('go_print')) + '</button>';
  const box = $('#arch-results'); if (!box) return;
  if (!S.binders.length){ box.innerHTML = '<div class="empty">' + ic('archive', 'lg') + '<p>' + esc(t('empty_arch')) + '</p><div class="row" style="justify-content:center"><button class="btn btn-primary" data-a="new-binder">' + ic('plus') + esc(t('new_binder')) + '</button><button class="btn" data-a="nav" data-v="import">' + ic('upload') + esc(t('nav_import')) + '</button></div></div>'; return; }
  if (!list.length){ box.innerHTML = '<div class="empty">' + esc(t('no_results')) + '</div>'; return; }
  if (S.archiveView === 'map'){ box.innerHTML = shelfMapHTML(list); return; }
  const pc = phCounts();
  box.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:40px"></th><th>' + esc(t('th_code')) + '</th><th>' + esc(t('th_client')) + '</th><th>' + esc(t('th_loc')) + '</th><th>' + esc(t('th_contents')) + '</th><th>' + esc(t('th_state')) + '</th><th>' + esc(t('th_qr')) + '</th><th></th></tr></thead><tbody>' +
    list.map(b => '<tr class="' + (b.selected_for_print ? 'sel' : '') + '">' +
      '<td><label class="chk" title="' + esc(t('act_toggle_print')) + '"><input type="checkbox" data-a="toggle-print" data-id="' + b.id + '"' + (b.selected_for_print ? ' checked' : '') + '></label></td>' +
      '<td><span class="code-chip"><span class="bar" style="background:' + esc(b.color_hex) + '"></span>' + esc(b.speaking_code) + '</span>' + (b.multi_code ? '<div class="multi-tag" title="' + esc(t('f_multi')) + '">' + esc(b.multi_code) + '</div>' : '') + '</td>' +
      '<td><div class="co">' + esc(b.company_name) + '</div><div class="ti">' + esc(b.binder_title) + (b.category ? ' · ' + esc(b.category) : '') + '</div></td>' +
      '<td>' + (b.location_code ? '<span class="loc">' + esc(b.location_code) + '</span>' : '<span class="muted small">—</span>') + '</td>' +
      '<td><div class="cnt-list">' + (b.contents_items.length ? b.contents_items.slice(0, 2).map(i => (i.year ? '<b>' + esc(i.year) + '</b> ' : '') + esc(i.description)).join('<br>') + (b.contents_items.length > 2 ? '<br><span class="muted">+' + (b.contents_items.length - 2) + '…</span>' : '') : '<span class="muted">' + esc(t('no_contents')) + '</span>') + '</div></td>' +
      '<td>' + stateBadge(b.archive_state) + '</td>' +
      '<td><span class="sc">' + esc(b.short_code) + '</span> <button class="icon-btn" style="width:28px;height:28px" data-a="copy-url" data-id="' + b.id + '" title="' + esc(b.short_url) + '">' + ic('copy') + '</button></td>' +
      '<td class="acts"><button class="icon-btn" data-a="locate" data-id="' + b.id + '" title="' + esc(t('act_locate')) + '">' + ic('pin') + (pc[b.id] ? '<span class="ph-n">' + pc[b.id] + '</span>' : '') + '</button><button class="icon-btn" data-a="show-qr" data-id="' + b.id + '" title="' + esc(t('act_qr')) + '">' + ic('qr') + '</button><button class="icon-btn" data-a="edit" data-id="' + b.id + '" title="' + esc(t('act_edit')) + '">' + ic('pencil') + '</button><button class="icon-btn" data-a="dup" data-id="' + b.id + '" title="' + esc(t('act_dup')) + '">' + ic('copy') + '</button><button class="icon-btn danger" data-a="del" data-id="' + b.id + '" title="' + esc(t('act_del')) + '">' + ic('trash') + '</button></td></tr>').join('') +
    '</tbody></table></div>';
}
function shelfOrder(s){ const o = shelfOrdinal(s); return o ? 'a' + String(o).padStart(3, '0') : 'b' + s; }
function shelfMapHTML(list){
  const rooms = {};
  const unplaced = [];
  list.forEach(b => {
    if (!b.room_code && !b.cabinet_code && !b.shelf_code){ unplaced.push(b); return; }
    const r = b.room_code || '?', c = b.cabinet_code || '?', s = b.shelf_code || '?';
    ((rooms[r] = rooms[r] || {})[c] = rooms[r][c] || {})[s] = (rooms[r][c][s] || []).concat(b);
  });
  const spine = (b) => '<button class="spine ' + (b.archive_state === 'CHECKED_OUT' ? 'out' : '') + '" style="background:' + esc(b.color_hex) + '" data-a="locate" data-id="' + b.id + '" title="' + esc(b.speaking_code + (b.multi_code ? ' [' + b.multi_code + ']' : '') + ' — ' + b.company_name + ' — ' + b.binder_title + (b.sector_code ? ' — ' + b.sector_code : '')) + '">' + esc(b.speaking_code) + '</button>';
  let h = '<div class="map-rooms">';
  Object.keys(rooms).sort(naturalCmp).forEach(r => {
    const cabs = rooms[r];
    const n = Object.values(cabs).reduce((a, c) => a + Object.values(c).reduce((x, y) => x + y.length, 0), 0);
    h += '<div class="room"><div class="room-h"><span>' + esc(r.length > 2 ? r : (S.lang === 'en' ? 'Room ' : 'Stanza ') + r) + '</span><span class="mono small">' + n + '</span></div>';
    Object.keys(cabs).sort(naturalCmp).forEach(c => {
      const nPh = phOk() ? phList('cabinet', r + c).length : 0;
      h += '<div class="cab"><div class="cab-h"><span>' + esc((S.lang === 'en' ? 'Cabinet ' : 'Armadio ') + locHead(r, c)) + '</span><button type="button" class="cab-ph" data-a="' + (nPh ? 'ph-open-cab' : 'ph-add') + '" data-type="cabinet" data-key="' + esc(r + c) + '" title="' + esc(nPh ? t('ph_open') : t('ph_add_cab')) + '">' + ic('camera') + (nPh ? '<b>' + nPh + '</b>' : '') + '</button></div>';
      Object.keys(cabs[c]).sort((a, b) => naturalCmp(shelfOrder(a), shelfOrder(b))).forEach(s => {
        const items = cabs[c][s].slice().sort((a, b) => naturalCmp(({SX:0,CX:1,DX:2})[a.sector_code] ?? 3, ({SX:0,CX:1,DX:2})[b.sector_code] ?? 3) || naturalCmp(a.speaking_code, b.speaking_code));
        const sc = (items.find(x => x.shelf_color) || {}).shelf_color;
        h += '<div class="shelf"><div class="shelf-l"' + (sc ? ' style="box-shadow:inset 4px 0 0 ' + esc(sc) + '"' : '') + '>' + esc(locHead(r, c) + '-' + s) + '</div><div class="shelf-b">' + items.map(spine).join('') + '</div></div>';
      });
      h += '</div>';
    });
    h += '</div>';
  });
  if (unplaced.length) h += '<div class="room"><div class="room-h" style="background:#64748B"><span>' + esc(t('unplaced')) + '</span><span class="mono small">' + unplaced.length + '</span></div><div class="cab"><div class="shelf-b">' + unplaced.map(spine).join('') + '</div></div></div>';
  return h + '</div>';
}

/* ---------------- QR modal ---------------- */
function showQR(b){
  openModal({ title:t('qr_modal') + ' — ' + b.speaking_code, size:'',
    body:'<div style="display:grid;grid-template-columns:240px 1fr;gap:20px;align-items:center"><div style="width:240px;height:240px;border:1px solid var(--border);border-radius:12px;padding:8px">' + DMQR.svg(b.short_url, {ecl:S.settings.qrEcc || 'M'}) + '</div>' +
      '<div class="stack"><div><div class="lbl">' + esc(t('f_short')) + '</div><div class="mono" style="font-size:20px;font-weight:800">' + esc(b.short_code) + '</div></div>' +
      '<div><div class="lbl">' + esc(t('f_shorturl')) + '</div><a class="mono" href="' + esc(b.short_url) + '" target="_blank" rel="noopener">' + esc(b.short_url) + '</a></div>' +
      '<div><div class="lbl">final_destination</div><div class="mono small" style="word-break:break-all">' + esc(destFor(b)) + '</div></div>' +
      '<div class="row"><button class="btn btn-sm" data-a="copy-url" data-id="' + b.id + '">' + ic('copy') + 'URL</button></div></div></div>',
    buttons:[{label:t('close'), cls:'btn', action:'modal-close'}] });
}

/* ---------------- Editor ---------------- */
function openEditor(id, preset){
  const src = id ? S.binders.find(b => b.id === id) : null;
  const d = src ? clone(src) : normalizeBinder(Object.assign({ id:uuid(), short_code:newShortCode(), category:'Ordinaria', color_hex:'#2563EB', archive_state:'CURRENT', selected_for_print:true, contents_items:[{year:'', description:t('arch_n', {n:1})}] }, preset || {}));
  if (!src && !d.speaking_code && d.company_name) d.speaking_code = suggestSpeakingCode(d.company_name);
  UI.ed = { isNew:!src, d, pipeMode:false, base:JSON.stringify(d) };
  const companies = Array.from(new Set(S.binders.map(b => b.company_name).concat((S.clients || []).map(c => c.name)).filter(Boolean))).sort(naturalCmp);
  const multis = Array.from(new Set(S.binders.map(b => b.multi_code).concat((S.clients || []).map(c => c.multi_code)).filter(Boolean))).sort(naturalCmp);
  const cities = Array.from(new Set(S.binders.map(b => b.company_city).concat((S.clients || []).map(clientPlace)).filter(Boolean))).sort(naturalCmp);
  const cats = Array.from(new Set(CATEGORIES.concat(S.binders.map(b => b.category).filter(Boolean))));
  const f = (key, label, extra, attrs) => '<div class="field"><label for="ed-' + key + '">' + esc(label) + '</label><input class="inp ' + (extra || '') + '" id="ed-' + key + '" data-ed="' + key + '" value="' + esc(d[key]) + '" ' + (attrs || '') + '></div>';
  const body = '<div class="edit-grid"><div class="stack">' +
    '<div class="grid g2">' +
      '<div class="field"><label for="ed-speaking_code">' + esc(t('f_speaking')) + '</label><div class="row" style="flex-wrap:nowrap"><input class="inp mono" id="ed-speaking_code" data-ed="speaking_code" value="' + esc(d.speaking_code) + '" style="font-weight:800;font-size:17px;text-transform:uppercase" placeholder="BL1"><button class="btn" data-a="ed-suggest" type="button">' + ic('sparkles') + esc(t('f_suggest')) + '</button></div><div class="err-t" id="err-speaking_code"></div></div>' +
      '<div class="field"><label for="ed-company_name">' + esc(t('f_company')) + '</label><input class="inp" id="ed-company_name" data-ed="company_name" list="dl-companies" value="' + esc(d.company_name) + '" placeholder="Barbieri Luigi S.r.l."><datalist id="dl-companies">' + companies.map(c => '<option value="' + esc(c) + '">').join('') + '</datalist><div class="err-t" id="err-company_name"></div></div>' +
    '</div>' +
    '<div class="grid g2"><div class="field"><label for="ed-multi_code">' + esc(t('f_multi')) + ' <span class="muted" style="font-weight:500;text-transform:none">' + esc(t('optional')) + '</span></label><input class="inp mono" id="ed-multi_code" data-ed="multi_code" list="dl-multi" value="' + esc(d.multi_code) + '" placeholder="M-10234" autocomplete="off"><datalist id="dl-multi">' + multis.map(m => '<option value="' + esc(m) + '">').join('') + '</datalist><div class="hint">' + esc(t('f_multi_d')) + '</div></div>' +
      '<div class="field"><label for="ed-company_city">' + esc(t('f_city')) + ' <span class="muted" style="font-weight:500;text-transform:none">' + esc(t('optional')) + '</span></label><input class="inp" id="ed-company_city" data-ed="company_city" list="dl-cities" value="' + esc(d.company_city) + '" placeholder="Parma (PR)" autocomplete="off"><datalist id="dl-cities">' + cities.map(c => '<option value="' + esc(c) + '">').join('') + '</datalist></div></div>' +
    '<div class="grid g2">' + f('binder_title', t('f_title'), '', 'placeholder="Fatture e Contabilità IVA"') +
      '<div class="field"><label for="ed-category">' + esc(t('f_category')) + '</label><input class="inp" id="ed-category" data-ed="category" list="dl-cats" value="' + esc(d.category) + '"><datalist id="dl-cats">' + cats.map(c => '<option value="' + esc(c) + '">').join('') + '</datalist></div></div>' +
    '<div class="grid g2">' + f('ref_year', t('f_year_ref') + ' ' + t('optional'), 'mono', 'placeholder="2025" maxlength="9"') + f('extra_codes', t('f_extra') + ' ' + t('optional'), 'mono', 'placeholder="' + esc(t('f_extra_ph')) + '"') + '</div>' +
    '<div class="field"><label>' + esc(t('f_color')) + '</label><div class="swatches" id="ed-swatches">' + swatchesHTML(d.color_hex) + '</div></div>' +
    '<div class="grid g4">' + f('room_code', t('f_room'), 'mono', 'placeholder="A"') + f('cabinet_code', t('f_cabinet'), 'mono', 'placeholder="1"') +
      '<div class="field"><label for="ed-shelf_code">' + esc(t('f_shelf')) + '</label><input class="inp mono" id="ed-shelf_code" data-ed="shelf_code" value="' + esc(d.shelf_code) + '" placeholder="' + esc((SHELF_TYPES[S.settings.shelfType || 'greek'] || [])[0] || t('st_text_ph')) + '"><div id="ed-shelf-tools">' + shelfToolsHTML(d) + '</div></div>' +
      '<div class="field"><label for="ed-sector_code">' + esc(t('f_sector')) + '</label><select class="inp mono" id="ed-sector_code" data-ed="sector_code">' + ['', 'SX', 'CX', 'DX'].map(s => '<option' + (d.sector_code === s ? ' selected' : '') + '>' + s + '</option>').join('') + (['', 'SX', 'CX', 'DX'].includes(d.sector_code) ? '' : '<option selected>' + esc(d.sector_code) + '</option>') + '</select></div></div>' +
    '<div class="row"><span class="lbl">' + esc(t('f_location')) + '</span><span class="loc" id="ed-loc" style="font-size:16px">' + esc(computeLocation(d) || '—') + '</span></div>' +
    '<div class="field"><label>' + esc(t('f_state')) + '</label><div class="seg" id="ed-state">' + STATES.map(s => '<button type="button" data-a="ed-state" data-s="' + s + '" class="' + (d.archive_state === s ? 'on' : '') + '">' + esc(t('s_' + s)) + '</button>').join('') + '</div></div>' +
    '<div class="field"><div class="row between"><label class="lbl">' + esc(t('f_contents')) + '</label><label class="chk small"><input type="checkbox" data-a="ed-pipe-toggle">' + esc(t('f_lines')) + '</label></div><div id="ed-contents"></div></div>' +
    f('tags', t('f_tags'), '', 'placeholder="iva,fatture,2025"') +
    '<div class="grid g2"><div class="field"><label for="ed-short_code">' + esc(t('f_short')) + '</label><div class="row" style="flex-wrap:nowrap"><input class="inp mono" id="ed-short_code" data-ed="short_code" value="' + esc(d.short_code) + '" maxlength="12"><button class="btn" type="button" data-a="ed-regen" title="' + esc(t('f_regen')) + '">' + ic('refresh') + '</button></div><div class="err-t" id="err-short_code"></div></div>' +
      '<div class="field"><label>' + esc(t('f_shorturl')) + '</label><div class="inp mono" id="ed-shorturl" style="background:var(--surface-2);display:flex;align-items:center;font-size:13px">' + esc(shortUrl(d.short_code)) + '</div></div></div>' +
    '<div class="field"><label for="ed-final_destination">' + esc(t('f_dest')) + '</label><input class="inp mono small" id="ed-final_destination" data-ed="final_destination" value="' + esc(d.final_destination) + '" placeholder="' + esc(renderDest(S.settings.destTemplate, d)) + '"></div>' +
    '<label class="chk"><input type="checkbox" data-ed="selected_for_print"' + (d.selected_for_print ? ' checked' : '') + '>' + esc(t('f_selprint')) + '</label>' +
    '</div><div><div class="lbl" style="margin-bottom:8px">' + esc(t('preview')) + ' — <span class="mono" style="text-transform:none">' + esc(findPreset(S.print.presetId).name) + '</span></div><div class="prev-box" id="ed-preview"></div><div style="margin-top:16px"><div class="lbl" style="margin-bottom:6px">' + esc(t('ph_binder')) + '</div><div data-ph-slot data-type="binder" data-key="' + d.id + '">' + phThumbsHTML('binder', d.id) + '</div><div class="hint">' + esc(t('ph_hint')) + '</div></div></div></div>';
  openModal({ title: UI.ed.isNew ? t('ed_new') : t('ed_edit') + ' ' + d.speaking_code, size:'xl', body, autofocus:false,
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('save'), cls:'btn btn-primary btn-lg', icon:'save', fn:saveEditor}],
    onMount: () => { renderEdContents(); renderEdPreview(); setTimeout(() => { if (!UI.ed) return; const el = UI.ed.isNew ? $('#ed-company_name') : $('#ed-binder_title'); el && el.focus(); }, 40); },
    beforeClose: () => {
      if (!UI.ed || JSON.stringify(UI.ed.d) === UI.ed.base) return true;
      confirmAction({ plain:true, title:t('ed_discard_t'), detail:t('ed_discard_d'), okLabel:t('ed_discard_ok'), onOk: () => closeModal(true) });
      return false;
    },
    onClose: () => { UI.ed = null; } });
}
function swatchesHTML(cur){
  return COLORS.map(c => '<button type="button" class="sw ' + (cur.toUpperCase() === c ? 'on' : '') + '" style="background:' + c + '" data-a="ed-color" data-c="' + c + '" aria-label="' + c + '"></button>').join('') +
    '<input type="color" value="' + esc(cur) + '" data-ed="color_hex" style="width:44px;height:34px;border:1px solid var(--border-2);border-radius:8px;padding:2px;background:#fff;cursor:pointer" aria-label="custom colour"><span class="mono small muted">' + esc(cur) + '</span>';
}
/* Shelf tools in the binder form: naming style (menu), quick picks in that style, optional shelf colour. */
function shelfToolsHTML(d){
  const ty = S.settings.shelfType || 'greek', picks = SHELF_TYPES[ty] || [];
  return '<div class="shelf-tools"><select class="inp" data-shelftype title="' + esc(t('st_type')) + '" aria-label="' + esc(t('st_type')) + '">' + Object.keys(SHELF_TYPES).map(k => '<option value="' + k + '"' + (k === ty ? ' selected' : '') + '>' + esc(t('st_' + k)) + '</option>').join('') + '</select>' +
    (picks.length ? '<div class="greek">' + picks.slice(0, 8).map(g => '<button type="button" data-a="ed-greek" data-g="' + esc(g) + '" class="' + (d.shelf_code === g ? 'on' : '') + '">' + esc(g) + '</button>').join('') + '</div>' : '') +
    '<div class="shelf-col" title="' + esc(t('st_color')) + '">' + [''].concat(SHELF_COLORS).map(c => '<button type="button" data-a="ed-shelfcol" data-c="' + c + '" class="' + ((d.shelf_color || '') === c ? 'on' : '') + (c ? '' : ' none') + '" style="' + (c ? 'background:' + c : '') + '" aria-label="' + esc(c || t('st_nocolor')) + '"></button>').join('') + '</div></div>';
}
function contentsToLines(items){ return (items || []).map(i => (i.year ? i.year + ': ' : '') + (i.description || '')).filter(x => x.trim()).join('\n'); }
function renderEdContents(){
  const ed = UI.ed, box = $('#ed-contents'); if (!ed || !box) return;
  if (ed.pipeMode){
    box.innerHTML = '<textarea class="inp mono small" data-ed="__pipe" rows="6" placeholder="Archivio 1&#10;2025: Fatture acquisto&#10;2025: Liquidazioni IVA">' + esc(contentsToLines(ed.d.contents_items)) + '</textarea><div class="hint">' + esc(t('f_lines_hint')) + '</div>';
    return;
  }
  box.innerHTML = ed.d.contents_items.map((it, i) => '<div class="ci-row"><input class="inp mono" placeholder="' + esc(t('f_year')) + '" data-ci="year" data-i="' + i + '" value="' + esc(it.year) + '"><input class="inp" placeholder="' + esc(t('f_desc')) + '" data-ci="description" data-i="' + i + '" value="' + esc(it.description) + '"><button type="button" class="icon-btn danger" data-a="ed-ci-del" data-i="' + i + '">' + ic('x') + '</button></div>').join('') +
    '<button type="button" class="btn btn-sm" data-a="ed-ci-add">' + ic('plus') + esc(t('f_add_item')) + '</button>';
}
function labelPreviewHTML(kind, b, maxW, gOver){
  const g = gOver || S.print.geometry, s = Math.min(1, maxW / (g.w * PX_PER_MM));
  return '<div class="lbl-holder" style="width:' + (g.w * PX_PER_MM * s) + 'px;height:' + (g.h * PX_PER_MM * s) + 'px;position:relative;overflow:hidden;' + (g.radius ? 'border-radius:' + (g.radius * PX_PER_MM * s) + 'px' : '') + '">' +
    '<div style="position:absolute;left:0;top:0;width:' + g.w + 'mm;height:' + g.h + 'mm;transform:scale(' + s + ');transform-origin:top left">' + renderLabel(kind, b, g, S.print) + '</div></div>';
}
function renderEdPreview(){
  const ed = UI.ed, box = $('#ed-preview'); if (!ed || !box) return;
  const b = normalizeBinder(Object.assign({}, ed.d, {contents_items:ed.d.contents_items.filter(i => i.year || i.description)}));
  b.updated_at = nowISO();
  const w = Math.max(240, Math.min(440, box.clientWidth - 34 || 400));
  const kinds = Array.from(new Set(modeKinds(S.print.contentMode)));
  const g = S.print.geometry;
  // labels are shown the way they are read on the binder, not as they sit on a turned sheet
  const gUp = frameGeo(g);
  const name = {A:'Modulo A', B:'Modulo B', U:'Unificata', S:t('cm_split')};
  box.innerHTML = kinds.map(k => '<div style="text-align:center"><div class="tiny muted mono" style="margin-bottom:4px">' + esc(name[k] || k) + '</div>' + labelPreviewHTML(k, b, w, gUp) + '</div>').join('');
}
function edRefreshDerived(){
  const d = UI.ed.d;
  const loc = $('#ed-loc'); if (loc) loc.textContent = computeLocation(d) || '—';
  const su = $('#ed-shorturl'); if (su) su.textContent = shortUrl(d.short_code);
  const fd = $('#ed-final_destination'); if (fd) fd.placeholder = renderDest(S.settings.destTemplate, d);
  validateEditor(false);
  clearTimeout(edRefreshDerived._t); edRefreshDerived._t = setTimeout(renderEdPreview, 120);
}
function validateEditor(show){
  const d = UI.ed.d, errs = {};
  const code = String(d.speaking_code || '').trim().toUpperCase();
  if (!code) errs.speaking_code = t('e_req_code');
  else if (S.binders.some(b => b.id !== d.id && b.speaking_code.toUpperCase() === code)) errs.speaking_code = t('e_dup_code');
  if (!String(d.company_name || '').trim()) errs.company_name = t('e_req_company');
  if (!SC_RE.test(d.short_code || '')) errs.short_code = t('e_sc_format');
  else if (allShortCodes(d.id).has(d.short_code)) errs.short_code = t('e_sc_dup');
  ['speaking_code','company_name','short_code'].forEach(k => {
    const el = $('#err-' + k), inp = $('#ed-' + k);
    const visible = show || (k !== 'company_name' && k !== 'speaking_code') || (inp && inp.value);
    if (el) el.textContent = errs[k] && visible ? errs[k] : '';
    if (inp) inp.classList.toggle('err', !!(errs[k] && visible));
  });
  return errs;
}
function saveEditor(){
  const ed = UI.ed; if (!ed) return;
  const errs = validateEditor(true);
  if (Object.keys(errs).length){ const k = Object.keys(errs)[0]; const el = $('#ed-' + k); el && el.focus(); toast(errs[k], 'err'); return; }
  const d = clone(ed.d);
  d.contents_items = d.contents_items.filter(i => String(i.year).trim() || String(i.description).trim());
  d.updated_at = nowISO();
  const b = normalizeBinder(d);
  const doSave = () => {
    const i = S.binders.findIndex(x => x.id === b.id);
    if (i >= 0) S.binders[i] = b; else S.binders.push(b);
    commit(); closeModal(true); toast(t('saved') + ': ' + b.speaking_code);
    renderView();
  };
  doSave();
}

/* ---------------- Print studio ---------------- */
function geoInput(key, label, min, max, step, val, attr){
  return '<div class="geo-row"><span class="lbl">' + esc(label) + '</span><div class="num">' +
    '<button type="button" class="step" data-a="geo-step" data-k="' + key + '" data-d="-' + step + '" aria-label="-">−</button>' +
    '<input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" data-' + attr + '="' + key + '" aria-label="' + esc(label) + '">' +
    '<button type="button" class="step" data-a="geo-step" data-k="' + key + '" data-d="' + step + '" aria-label="+">+</button>' +
    '<input class="inp" type="number" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" data-' + attr + '="' + key + '" aria-label="' + esc(label) + '"></div></div>';
}
function presetThumb(p){
  const sx = 30 / 210, sy = 42 / 297; let h = '';
  for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++)
    h += '<i style="position:absolute;left:' + ((p.marginLeft + c * (p.w + p.gapX)) * sx) + 'px;top:' + ((p.marginTop + r * (p.h + p.gapY)) * sy) + 'px;width:' + Math.max(1, p.w * sx - .6) + 'px;height:' + Math.max(1, p.h * sy - .6) + 'px;background:' + (p.kind === 'full' ? '#DBEAFE' : '#BFDBFE') + ';border-radius:1px"></i>';
  return '<span class="pi">' + h + '</span>';
}
function viewPrint(){
  const P = S.print, g = P.geometry;
  const groups = [['die', t('pr_die')], ['full', t('pr_full')], ['custom', t('pr_custom')]];
  const presetBtn = (p, k) => '<button type="button" class="preset ' + (P.presetId === p.id ? 'on' : '') + '" data-a="preset" data-id="' + p.id + '">' + presetThumb(p) + '<span style="min-width:0;flex:1"><span class="pt">' + (p.recommended ? '<span class="pop rec">✓ ' + esc(t('pr_recommended')) + '</span> ' : p.popular ? '<span class="pop">★ ' + esc(t('pr_popular')) + '</span> ' : '') + esc(p.name) + '</span><br><span class="pd">' + ((p.group | 0) > 1 ? fmtMM(p.w) + '×' + fmtMM(p.h * p.group) + ' mm • ' + p.cols + '×' + (p.rows / p.group) + ' = ' + (p.cols * p.rows / p.group) + ' → ' + esc(t('pr_8mod', {n:p.cols * p.rows, s:fmtMM(p.w) + '×' + fmtMM(p.h)})) : fmtMM(p.w) + '×' + fmtMM(p.h) + ' mm • ' + p.cols + '×' + p.rows + ' = ' + (p.cols * p.rows)) + '</span></span>' + (k === 'custom' ? '<span class="icon-btn danger" data-a="del-preset" data-id="' + p.id + '" title="' + esc(t('g_del_preset')) + '">' + ic('trash') + '</span>' : '') + '</button>';
  const isBasic = (p) => p.recommended || p.popular || p.id === P.presetId;
  const basicPresets = allPresets().filter(isBasic).map(p => presetBtn(p, p.kind || 'custom')).join('');
  const others = groups.map(([k, lab]) => {
    const ps = allPresets().filter(p => (p.kind || 'custom') === k && !isBasic(p));
    if (!ps.length) return '';
    return '<div class="tiny muted" style="font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:6px 0 2px">' + esc(lab) + '</div>' +
      ps.map(p => presetBtn(p, k)).join('');

  }).join('');
  const nOthers = allPresets().filter(p => !isBasic(p)).length;
  const presets = basicPresets + (nOthers ? '<details class="more"><summary>' + esc(t('pr_more', {n:nOthers})) + '</summary>' + others + '</details>' : '');
  const opt = (grp, val, title, desc, cur, full) => '<button type="button" class="opt ' + (cur === val ? 'on ' : '') + (full ? 'full' : '') + '" data-a="' + grp + '" data-v="' + val + '"><b>' + esc(title) + '</b><span>' + esc(desc) + '</span></button>';
  return '<div class="page-h"><div><h1>' + esc(t('pr_h')) + helpDot('print') + '</h1><p>' + esc(t('pr_p')) + '</p></div>' +
    '<div class="row"><button class="btn btn-lg" data-a="print-calib">' + ic('crosshair') + esc(t('pr_calib')) + '</button><button class="btn btn-lg btn-primary" data-a="print-labels" id="btn-print">' + ic('printer') + esc(t('pr_go')) + '</button></div></div>' + qrRestoreBarHTML() +
    '<div class="studio"><div class="card">' +
      '<div class="panel-sec"><h3>' + esc(t('pr_queue')) + '</h3><div id="pr-summary"></div></div>' +
      '<div class="panel-sec"><h3>' + esc(t('pr_sheet')) + '</h3><div class="preset-list">' + presets + '</div></div>' +
      '<div class="panel-sec"><h3>' + esc(t('pr_content')) + helpDot('split') + '</h3><div class="opt-grid">' +
        opt('cmode', 'split', t('cm_split'), t('cm_split_d'), P.contentMode, true) + opt('cmode', 'pair', t('cm_pair'), t('cm_pair_d'), P.contentMode, true) + opt('cmode', 'a', t('cm_a'), t('cm_a_d'), P.contentMode) + opt('cmode', 'b', t('cm_b'), t('cm_b_d'), P.contentMode) + opt('cmode', 'u', t('cm_u'), t('cm_u_d'), P.contentMode, true) + opt('cmode', 'qr', t('cm_qr'), t('cm_qr_d'), P.contentMode, true) +
        '</div><div class="geo-row" style="margin-top:10px"><span class="lbl">' + esc(t('copies')) + '</span><input class="inp" style="width:90px;min-height:38px" type="number" min="1" max="50" step="1" value="' + (P.copies || 1) + '" data-pp="copies"></div></div>' +
      '<div class="panel-sec" id="pr-fields"><h3>' + esc(t('pr_fields')) + helpDot('fields') + '</h3><div class="fld-grid">' +
        [['category','f_category'],['city','f_city'],['multi','f_multi'],['url','qr_url_s'],['title','f_title_s'],['year','f_year_ref'],['contents','f_contents_s'],['tags','f_tags'],['extra','f_extra'],['location','fl_location']].map(([k, lab]) => '<label class="chk small"><input type="checkbox" data-fld="' + k + '"' + (pf(k) ? ' checked' : '') + '>' + esc(t(lab)) + '</label>').join('') +
        '<label class="chk small fld-empty"><input type="checkbox" data-fld="empty"' + (pf('empty') ? ' checked' : '') + '><span><b>' + esc(t('f_empty')) + '</b><br><span class="muted">' + esc(t('f_empty_d')) + '</span></span></label>' +
        '</div><div class="geo-row" style="margin-top:10px"><span class="lbl">' + esc(t('f_date')) + '</span><select class="inp" style="width:auto;min-height:34px;padding:4px 8px" data-fld="date">' + [['created','fd_created'],['updated','fd_updated'],['none','fd_none']].map(([v, lab]) => '<option value="' + v + '"' + (pf('date') === v ? ' selected' : '') + '>' + esc(t(lab)) + '</option>').join('') + '</select></div>' +
        '<div class="hint" style="margin-top:6px">' + esc(t('pr_fields_d')) + '</div></div>' +
      (P.contentMode === 'pair' || P.contentMode === 'a' ? '<div class="panel-sec"><h3>' + esc(t('pr_tpl')) + helpDot('templates') + '</h3><div class="opt-grid">' +
        opt('tpl', 'classic', t('tp_classic'), t('tp_classic_d'), P.template || 'classic') + opt('tpl', 'multi', t('tp_multi'), t('tp_multi_d'), P.template) + opt('tpl', 'bold', t('tp_bold'), t('tp_bold_d'), P.template) + opt('tpl', 'minimal', t('tp_min'), t('tp_min_d'), P.template) +
        '</div><div class="hint" style="margin-top:6px">' + esc(t('tp_note')) + '</div><label class="chk small" style="margin-top:10px"><input type="checkbox" data-pp="showMulti"' + (P.showMulti !== false ? ' checked' : '') + '>' + esc(t('pr_show_multi')) + '</label></div>' : '') +
      '<div class="panel-sec"><h3>' + esc(t('pr_qr')) + '</h3><div class="opt-grid">' +
        opt('qmode', 'live', t('qm_live'), t('qm_live_d'), P.qrMode, true) + opt('qmode', 'placeholder', t('qm_ph'), t('qm_ph_d'), P.qrMode) + opt('qmode', 'none', t('qm_none'), t('qm_none_d'), P.qrMode) +
        '</div><div class="row" style="margin-top:10px;justify-content:space-between"><label class="chk small"><input type="checkbox" data-pp="showQrUrl"' + (P.showQrUrl ? ' checked' : '') + '>' + esc(t('qr_url')) + '</label>' +
        '<label class="small row" style="gap:6px">' + esc(t('qr_ecc')) + ' <select class="inp" style="width:auto;min-height:34px;padding:4px 8px" data-pp="qrEcc">' + ['L','M','Q','H'].map(e => '<option value="' + e + '"' + (S.settings.qrEcc === e ? ' selected' : '') + '>' + esc(t('ecc_' + e)) + '</option>').join('') + '</select></label></div><div class="hint" style="margin-top:6px">' + esc(t('qr_ecc_d')) + '</div></div>' +
      '<div class="panel-sec"><h3>' + esc(t('pr_quality')) + helpDot('design') + '</h3><div id="pr-quality"></div></div>' +
      '<details class="adv" id="pr-adv"' + (P.advanced ? ' open' : '') + '><summary>' + ic('sliders') + esc(t('pr_adv')) + '<span class="tiny muted" style="margin-left:auto;font-weight:500">' + esc(t('pr_adv_d')) + '</span></summary>' +
      '<div class="panel-sec"><div class="row between"><h3 style="margin:0">' + esc(t('pr_geo')) + '</h3><span id="geo-mod">' + (P.geometryModified ? '<span class="badge b-out">' + esc(t('g_modified')) + '</span>' : '') + '</span></div>' +
        '<div style="margin-top:8px">' +
        geoInput('marginTop', t('g_mt'), 0, 80, 0.1, g.marginTop, 'geo') + geoInput('marginLeft', t('g_ml'), 0, 80, 0.1, g.marginLeft, 'geo') +
        geoInput('w', t('g_w'), 10, 210, 0.1, g.w, 'geo') + geoInput('h', t('g_h'), 10, 297, 0.1, g.h, 'geo') +
        geoInput('cols', t('g_cols'), 1, 8, 1, g.cols, 'geo') + geoInput('rows', t('g_rows'), 1, 20, 1, g.rows, 'geo') +
        geoInput('gapX', t('g_gx'), 0, 30, 0.1, g.gapX, 'geo') + geoInput('gapY', t('g_gy'), 0, 30, 0.1, g.gapY, 'geo') +
        geoInput('radius', t('g_rad'), 0, 10, 0.5, g.radius, 'geo') +
        geoInput('padding', t('g_pad'), 0, 12, 0.5, P.padding, 'pp') +
        '<div class="sep" style="margin:10px 0"></div>' +
        '<div id="geo-offsets">' + geoInput('offsetX', t('g_ox'), -10, 10, 0.5, P.offsetX, 'pp') + geoInput('offsetY', t('g_oy'), -10, 10, 0.5, P.offsetY, 'pp') + '</div>' +
        '</div><label class="chk small" style="margin-top:8px"><input type="checkbox" data-pp="cut"' + (g.cut ? ' checked' : '') + '>' + esc(t('g_cut')) + '</label>' +
        '<div class="row" style="margin-top:12px"><button class="btn btn-sm" data-a="geo-fill" title="' + esc(t('g_fill_d')) + '">' + ic('grid') + esc(t('g_fill')) + '</button><button class="btn btn-sm" data-a="geo-center">' + ic('crosshair') + esc(t('g_center')) + '</button></div>' +
        '<div class="row" style="margin-top:8px"><button class="btn btn-sm" data-a="geo-reset">' + ic('rotate') + esc(t('g_reset')) + '</button><button class="btn btn-sm" data-a="geo-save">' + ic('save') + esc(t('g_savepreset')) + '</button></div>' +
        '<div class="geo-warn err-t" id="geo-warn" style="margin-top:8px"></div></div>' +
        '<div class="adv-sub"><h3>' + esc(t('sp_h')) + helpDot('split') + '</h3>' +
          '<div class="geo-row"><span class="lbl">' + esc(t('sp_rot')) + '</span><select class="inp" style="width:auto;min-height:34px;padding:4px 8px" data-sp="rotate"><option value="-90"' + ((P.split || {}).rotate !== 90 ? ' selected' : '') + '>' + esc(t('sp_rot_l')) + '</option><option value="90"' + ((P.split || {}).rotate === 90 ? ' selected' : '') + '>' + esc(t('sp_rot_r')) + '</option></select></div>' +
          '<label class="chk small"><input type="checkbox" data-sp="guides"' + ((P.split || {}).guides !== false ? ' checked' : '') + '>' + esc(t('sp_guides')) + '</label></div>' +
      '<div class="panel-sec"><h3>' + esc(t('pr_slots')) + helpDot('partial') + '</h3><div class="slotmap-wrap"><div class="slotmap" id="slotmap"></div><div class="stack">' +
        '<div class="hint">' + esc(t('sl_hint')) + '</div><div class="small" id="sl-count" style="font-weight:700"></div>' +
        '<button class="btn btn-sm" data-a="slots-free">' + ic('check') + esc(t('sl_all_free')) + '</button>' +
        '<div class="row" style="gap:6px"><span class="small">' + esc(t('sl_start')) + '</span><input class="inp" id="sl-start" type="number" min="1" style="width:76px;min-height:34px;padding:4px 8px" value="1"><button class="btn btn-sm" data-a="slots-start">' + esc(t('sl_apply')) + '</button></div>' +
        '<div class="tiny muted"><span class="slot" style="position:static;display:inline-block;width:14px;height:10px;vertical-align:middle"></span> ' + esc(t('sl_avail')) + ' &nbsp; <span class="slot used" style="position:static;display:inline-block;width:14px;height:10px;vertical-align:middle"></span> ' + esc(t('sl_used')) + ' &nbsp; <span class="slot q" style="position:static;display:inline-block;width:14px;height:10px;vertical-align:middle"></span> ' + esc(t('pv_labels')) + '</div>' +
      '</div></div></div>' +
      '<div class="panel-sec"><div class="info-box small">' + ic('crosshair') + '<div><b>' + esc(t('pr_calib')) + '</b>' + helpDot('calib') + '<br>' + esc(t('pr_calib_d')) + '</div></div></div>' +
      '</details>' +
    '</div>' +
    '<div class="preview-pane card"><div class="toolbar" style="justify-content:space-between;border-bottom:1px solid var(--border)"><div class="seg"><button data-a="pv-mode" data-v="labels" class="' + (P.previewMode !== 'calib' ? 'on' : '') + '">' + ic('eye') + ' ' + esc(t('pv_labels')) + '</button><button data-a="pv-mode" data-v="calib" class="' + (P.previewMode === 'calib' ? 'on' : '') + '">' + ic('crosshair') + ' ' + esc(t('pv_calib')) + '</button></div>' +
      '<div class="seg" title="' + esc(t('pv_rot_d')) + '"><button data-a="pv-rot" data-v="0" class="' + (!P.pvLandscape ? 'on' : '') + '">' + esc(t('pv_portrait')) + '</button><button data-a="pv-rot" data-v="1" class="' + (P.pvLandscape ? 'on' : '') + '">' + ic('rotate') + ' ' + esc(t('pv_landscape')) + '</button></div><div class="sum-line" id="pv-sum"></div></div>' +
      '<div class="preview-scroll" id="pv-scroll"></div></div></div>';
}
let pvObserver = null;
function mountPrint(){
  refreshPrint();
  if (pvObserver) pvObserver.disconnect();
  const sc = $('#pv-scroll');
  if (sc && window.ResizeObserver){ let lastW = 0; pvObserver = new ResizeObserver(() => { if (Math.abs(sc.clientWidth - lastW) > 4){ lastW = sc.clientWidth; renderPrintPreview(); } }); pvObserver.observe(sc); }
}
function refreshPrint(){ renderPrintSummary(); renderSlotMap(); renderPrintPreview(); geoWarn(); renderQuality(); }
function geoWarn(){
  const g = S.print.geometry, el = $('#geo-warn'); if (!el) return;
  const right = g.marginLeft + g.cols * g.w + (g.cols - 1) * g.gapX, bottom = g.marginTop + g.rows * g.h + (g.rows - 1) * g.gapY;
  const msg = [];
  if (right > 210.05) msg.push((S.lang === 'en' ? 'Layout exceeds page width: ' : 'Il layout supera la larghezza del foglio: ') + fmtMM(right) + ' > 210 mm');
  if (bottom > 297.05) msg.push((S.lang === 'en' ? 'Layout exceeds page height: ' : 'Il layout supera l\'altezza del foglio: ') + fmtMM(bottom) + ' > 297 mm');
  const SAFE = 4;
  const pad = +S.print.padding || 0;   // text stays inside the padding, so only content closer than 4 mm to the edge matters
  if (g.marginLeft + pad < SAFE || g.marginTop + pad < SAFE || 210 - right + pad < SAFE || 297 - bottom + pad < SAFE) msg.push(t('g_edge'));
  el.textContent = msg.join(' • ');
}
function renderQuality(){
  const el = $('#pr-quality'); if (!el) return;
  const g = S.print.geometry, P = S.print, b = printQueueBinders()[0] || S.binders[0];
  if (!b){ el.innerHTML = ''; return; }
  const kinds = modeKinds(P.contentMode);
  kinds.forEach(k => renderLabel(k, b, frameGeo(g), P));
  const rows = [];
  const line = (ok, txt) => rows.push('<div class="q-row ' + (ok === true ? 'ok' : ok === 'warn' ? 'warn' : 'bad') + '">' + ic(ok === true ? 'check' : 'alert') + '<span>' + txt + '</span></div>');
  const pt = (mm) => (mm * 72 / 25.4).toFixed(1);
  const qk = kinds.find(k => LM[k] && LM[k].q);
  if (P.qrMode === 'live' && qk){
    const q = LM[qk].q, n = DMQR.encode(b.short_url || shortUrl(b.short_code), S.settings.qrEcc || 'M').size + 4, mod = q / n;
    line(q >= 15 ? true : q >= 12 ? 'warn' : false, esc(t('q_qr', {q:fmtMM(q), m:mod.toFixed(2)})) + (q < 15 ? ' — ' + esc(t('q_qr_small')) : ''));
  }
  const code = Math.min.apply(null, kinds.map(k => LM[k] ? LM[k].code : 99));
  line(code >= 6 ? true : code >= 4 ? 'warn' : false, esc(t('q_code', {s:fmtMM(code), p:pt(code)})));
  const minT = Math.min.apply(null, kinds.map(k => LM[k] ? LM[k].minText : 99));
  line(minT >= 1.8 ? true : minT >= 1.45 ? 'warn' : false, esc(t('q_text', {s:fmtMM(minT), p:pt(minT)})) + (minT < 1.8 ? ' — ' + esc(t('q_text_small')) : ''));
  el.innerHTML = rows.join('') + '<div class="hint" style="margin-top:6px">' + esc(t('q_tip')) + '</div>';
}
function renderPrintSummary(){
  const L = layoutLabels(), q = printQueueBinders(), el = $('#pr-summary');
  if (el) el.innerHTML = q.length
    ? '<div class="row" style="gap:6px">' + q.slice(0, 18).map(b => '<span class="code-chip" style="font-size:13px;border:1px solid var(--border);border-radius:7px;padding:3px 8px 3px 4px"><span class="bar" style="background:' + esc(b.color_hex) + ';height:16px;width:4px"></span>' + esc(b.speaking_code) + '</span>').join('') + (q.length > 18 ? '<span class="muted small">+' + (q.length - 18) + '</span>' : '') + '</div>' +
      '<div class="small" style="margin-top:10px;font-weight:600">' + esc(t('pr_sum', {l:L.items, s:L.pages.length, u:L.skipped})) + '</div><button class="btn btn-sm" style="margin-top:8px" data-a="nav" data-v="archive">' + ic('list') + esc(t('manage_sel')) + '</button>'
    : '<div class="warn-box small">' + ic('alert') + '<div>' + esc(t('pr_none')) + '<div style="margin-top:8px"><button class="btn btn-sm" data-a="nav" data-v="archive">' + ic('archive') + esc(t('nav_archive')) + '</button></div></div></div>';
  const pv = $('#pv-sum');
  if (pv) pv.innerHTML = '<span>' + esc(findPreset(S.print.presetId).name) + '</span><span><b>' + slotCount() + '</b> slot</span>' + (S.print.previewMode === 'calib' ? '' : '<span><b>' + L.items + '</b> ' + esc(t('pv_labels').toLowerCase()) + ' / <b>' + L.pages.length + '</b> ' + (S.lang === 'en' ? 'sheets' : 'fogli') + '</span>');
  const bp = $('#btn-print'); if (bp) bp.disabled = !L.items;
}
function renderSlotMap(){
  const g = S.print.geometry, N = slotCount(), used = usedSet(), box = $('#slotmap'); if (!box) return;
  const L = layoutLabels(); const first = new Set((L.pages[0] || []).map(x => x.s));
  const firstIsPartial = !(L.pages.length && L.used.size >= N);
  let h = '';
  for (let s = 0; s < N; s++){
    const R = slotRect(s);
    const cls = used.has(s) ? 'used' : (firstIsPartial && first.has(s) ? 'q' : '');
    const fs = Math.max(7, Math.min(11, g.h / 297 * 200 * 0.35));
    const no = slotNo(s);
    h += '<button type="button" class="slot ' + cls + '" data-a="slot" data-s="' + s + '" title="#' + no + ' (R' + (R.r + 1) + '-C' + (R.c + 1) + ')" style="left:' + (R.x / 210 * 100) + '%;top:' + (R.y / 297 * 100) + '%;width:' + (g.w / 210 * 100) + '%;height:' + (g.h / 297 * 100) + '%;font-size:' + fs + 'px">' + no + '</button>';
  }
  const k = Math.max(1, g.group | 0);
  if (k > 1 && g.rows % k === 0) for (let pr = 0; pr < g.rows / k; pr++) for (let c = 0; c < g.cols; c++){
    const R = slotRect(pr * k * g.cols + c);
    h += '<i class="slot-phys" style="left:' + (R.x / 210 * 100) + '%;top:' + (R.y / 297 * 100) + '%;width:' + (g.w / 210 * 100) + '%;height:' + ((g.h * k + g.gapY * (k - 1)) / 297 * 100) + '%"></i>';
  }
  box.innerHTML = h;
  const c = $('#sl-count'); if (c) c.textContent = t('sl_count', {a:N - used.size, n:N});
  const st = $('#sl-start'); if (st) st.max = N;
}
function renderPrintPreview(){
  const sc = $('#pv-scroll'); if (!sc) return;
  const land = !!S.print.pvLandscape;
  const avail = Math.max(260, sc.clientWidth - 40), scale = Math.min(1.25, avail / ((land ? 297 : 210) * PX_PER_MM));
  const isCalib = S.print.previewMode === 'calib';
  // landscape view: the sheet is turned so that labels read straight (opposite of the content rotation)
  const W = 210 * PX_PER_MM * scale, H = 297 * PX_PER_MM * scale;
  const tf = !land ? 'scale(' + scale + ')' : turnDir(S.print) === -90 ? 'translateX(' + H + 'px) rotate(90deg) scale(' + scale + ')' : 'translateY(' + W + 'px) rotate(-90deg) scale(' + scale + ')';
  let sheets = isCalib ? [buildCalibSheet()] : buildLabelSheets(true);
  const total = sheets.length, MAX = 8;
  if (sheets.length > MAX) sheets = sheets.slice(0, MAX);
  sc.innerHTML = sheets.map((sh, i) => '<div class="sheet-cap">' + esc(isCalib ? t('pv_calib') : t('pv_sheet', {n:i + 1, t:total})) + '</div><div class="sheet-holder" style="width:' + (land ? H : W) + 'px;height:' + (land ? W : H) + 'px">' + sh.replace('class="sheet"', 'class="sheet" style="transform:' + tf + '"') + '</div>').join('') +
    (total > MAX ? '<div class="small muted">' + esc(t('pv_more', {n:MAX})) + '</div>' : '');
}
function setGeo(key, val, isPP){
  const P = S.print;
  if (val === '' || isNaN(val)) return;
  const v = parseFloat(val);
  if (isPP){
    if (key === 'padding') P.padding = clamp(v, 0, 12);
    if (key === 'offsetX') P.offsetX = clamp(Math.round(v * 2) / 2, -10, 10);
    if (key === 'offsetY') P.offsetY = clamp(Math.round(v * 2) / 2, -10, 10);
  } else {
    const lim = {w:[10,210], h:[10,297], cols:[1,8], rows:[1,20], marginTop:[0,80], marginLeft:[0,80], gapX:[0,30], gapY:[0,30], radius:[0,10]}[key];
    let nv = clamp(v, lim[0], lim[1]); if (key === 'cols' || key === 'rows') nv = Math.round(nv); else nv = Math.round(nv * 100) / 100;
    P.geometry[key] = nv; P.geometryModified = true;
  }
  const cur = isPP ? P[key] : P.geometry[key];
  $$('[data-' + (isPP ? 'pp' : 'geo') + '="' + key + '"]').forEach(el => { if (document.activeElement !== el || el.type === 'range') el.value = cur; });
  const gm = $('#geo-mod'); if (gm) gm.innerHTML = P.geometryModified ? '<span class="badge b-out">' + esc(t('g_modified')) + '</span>' : '';
  savePrefs();
  clearTimeout(setGeo._t); setGeo._t = setTimeout(refreshPrint, 40);
}

/* ---------------- Import ---------------- */
function viewImport(){
  return '<div class="page-h"><div><h1>' + esc(t('im_h')) + helpDot('import') + '</h1><p>' + esc(t('im_p')) + '</p></div><div class="row"><button class="btn" data-a="nav" data-v="ai">' + ic('sparkles') + esc(t('nav_ai')) + '</button></div></div>' +
    '<div class="grid g2"><div class="card card-p"><div class="dropzone" id="dropzone" data-a="pick-import" tabindex="0">' + ic('upload', 'lg') + '<div style="font-weight:700;margin-top:8px">' + esc(t('im_drop')) + '</div><div class="hint">.csv (; , tab) • .json (workspace / array)</div></div></div>' +
    '<div class="card card-p"><div class="field"><label for="im-text">' + esc(t('im_paste')) + '</label><textarea class="inp mono small" id="im-text" data-bind="importText" rows="7" placeholder="' + esc(t('im_paste_ph')) + '">' + esc(UI.importText) + '</textarea></div>' +
    '<div class="row" style="margin-top:10px"><button class="btn" data-a="im-clip">' + ic('clipboard') + esc(t('im_clip')) + '</button><button class="btn btn-primary" data-a="im-analyze">' + ic('eye') + esc(t('im_analyze')) + '</button><button class="btn" data-a="im-clear">' + ic('x') + esc(t('im_clear')) + '</button></div></div></div>' +
    '<div id="im-preview" style="margin-top:16px">' + importPreviewHTML() + '</div>';
}
function analyzeImport(text){
  let s = String(text || '').replace(/^﻿/, '').trim();
  if (!s){ UI.importParsed = null; return; }
  const fence = s.match(/```[a-zA-Z]*\s*\n([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  let records = [], format = 'CSV', delim = '', workspace = null, headerless = false;
  if (/^[\[{]/.test(s)){
    format = 'JSON';
    let obj; try { obj = JSON.parse(s); } catch(e){ UI.importParsed = {error:'JSON: ' + e.message}; return; }
    if (Array.isArray(obj)) records = obj;
    else if (obj && Array.isArray(obj.binders)){ records = obj.binders; workspace = obj; format = 'JSON workspace'; }
    else if (obj && Array.isArray(obj.rows)) records = obj.rows;
    else if (obj && Array.isArray(obj.data)) records = obj.data;
    else if (obj && typeof obj === 'object') records = [obj];
  } else {
    // Excel "sep=;" hint line
    const sep = s.match(/^sep=(.)\s*\r?\n/i);
    if (sep) s = s.slice(sep[0].length);
    delim = sep ? sep[1] : detectDelim(s);
    const rows = parseCSV(s, delim).filter(r => r.some(c => String(c).trim()));
    let head = rows.length ? rows[0].map(h => h.trim()) : [];
    // Client register (anagrafica clienti, e.g. the studio's CLIENTI STORICI list) instead of binders
    if (rows.length > 1 && isClientList(head)){
      const recs = rows.slice(1).map(r => { const o = {}; head.forEach((h, i) => { o[h] = r[i] != null ? r[i] : ''; }); return o; });
      UI.importParsed = {clients:analyzeClients(recs), format:'CSV anagrafica clienti', delim}; return;
    }
    // No recognisable header (e.g. rows pasted without the first line): assume the standard AI/template column order.
    if (rows.length && rows[0].length >= 2 && !head.some(h => ALIAS_LOOKUP[normHeader(h)])){ head = csvTemplateHeader().split(';').concat(['selected_for_print','id','updated_at']); if (rows[0].length < 20){ head = head.filter(h => !['company_city','ref_year','extra_codes'].includes(h)); if (rows[0].length !== 17) head = head.filter(h => h !== 'multi_code'); } // short rows: v5 order (17 fields) or the order before the Codice Multi column
      rows.unshift(head); headerless = true; }
    if (rows.length < 2){ UI.importParsed = {error:t('im_none')}; return; }
    records = rows.slice(1).map(r => { const o = {}; head.forEach((h, i) => { o[h] = r[i] != null ? r[i] : ''; }); return o; });
  }
  const plannedCodes = [], plannedSC = [], byCode = new Map(S.binders.map(b => [b.speaking_code.toUpperCase(), b]));
  const seenInFile = new Set(), idsInFile = new Set();
  const rows = [];
  records.forEach((raw, idx) => {
    const p = mapRecord(raw), w = [];
    if (!p.company_name && !(p.speaking_code && byCode.has(p.speaking_code))){ rows.push({idx, status:'err', p, w:[t('im_w_skip')]}); return; }
    if (!p.speaking_code){ p.speaking_code = suggestSpeakingCode(p.company_name, plannedCodes); w.push(t('im_w_code')); }
    if (seenInFile.has(p.speaking_code)){ const old = p.speaking_code; p.speaking_code = suggestSpeakingCode(p.company_name || old, plannedCodes.concat(Array.from(seenInFile))); w.push(old + ' → ' + p.speaking_code); }
    seenInFile.add(p.speaking_code); plannedCodes.push(p.speaking_code);
    const match = byCode.get(p.speaking_code) || null;
    // short code
    const taken = allShortCodes(match ? match.id : null);
    plannedSC.forEach(x => taken.add(x));
    if (p.short_code && !SC_RE.test(p.short_code)){ delete p.short_code; }
    if (p.short_code && taken.has(p.short_code)){ delete p.short_code; w.push(t('im_w_sc_dup')); }
    if (!p.short_code){
      if (match && match.short_code && !plannedSC.includes(match.short_code)) p._keepSC = match.short_code;
      else { p.short_code = newShortCode(plannedSC); w.push(t('im_w_sc')); }
    }
    plannedSC.push(p.short_code || p._keepSC);
    if (p.color_hex && !normHex(p.color_hex)){ delete p.color_hex; w.push(t('im_w_color')); }
    else if (!p.color_hex && !match){ p.color_hex = CAT_COLOR[p.category] || '#475569'; }
    if (p.id && (idsInFile.has(p.id) || S.binders.some(b => b.id === p.id && (!match || b.id !== match.id)))) delete p.id;
    if (p.id) idsInFile.add(p.id);
    rows.push({idx, status: match ? 'upd' : 'new', p, w, match: match ? match.id : null});
  });
  UI.importParsed = { rows, format: headerless ? format + ' ' + t('im_nohdr') : format, delim, workspace };
}
function importPreviewHTML(){
  const IP = UI.importParsed;
  if (!IP) return '';
  if (IP.error) return '<div class="danger-box">' + ic('alert') + '<div>' + esc(IP.error) + '</div></div>';
  if (IP.clients) return clientsPreviewHTML(IP);
  const ok = IP.rows.filter(r => r.status !== 'err');
  const nNew = IP.rows.filter(r => r.status === 'new').length, nUpd = IP.rows.filter(r => r.status === 'upd').length, nErr = IP.rows.length - ok.length;
  const badge = (s) => s === 'new' ? '<span class="badge b-new">' + esc(t('im_new')) + '</span>' : s === 'upd' ? '<span class="badge b-upd">' + esc(t('im_upd')) + '</span>' : '<span class="badge b-err">' + esc(t('im_err')) + '</span>';
  return '<div class="card"><div class="toolbar" style="justify-content:space-between"><div><h2 style="margin:0">' + esc(t('im_prev')) + '</h2><div class="small muted">' + esc(t('im_rows', {n:IP.rows.length})) + ' • ' + esc(t('im_detect', {f:IP.format, d:IP.delim === '\t' ? 'TAB' : (IP.delim || '—')})) + '</div></div>' +
    '<div class="row"><span class="badge b-new">' + nNew + ' ' + esc(t('im_new')) + '</span><span class="badge b-upd">' + nUpd + ' ' + esc(t('im_upd')) + '</span>' + (nErr ? '<span class="badge b-err">' + nErr + ' ' + esc(t('im_err')) + '</span>' : '') + '</div></div>' +
    '<div class="tbl-wrap" style="max-height:420px"><table class="tbl"><thead><tr><th>#</th><th></th><th>' + esc(t('th_code')) + '</th><th>' + esc(t('th_client')) + '</th><th>' + esc(t('th_loc')) + '</th><th>' + esc(t('th_contents')) + '</th><th>short_code</th><th>Note</th></tr></thead><tbody>' +
    IP.rows.map(r => { const p = r.p, loc = computeLocation(p); return '<tr><td class="mono small muted">' + (r.idx + 1) + '</td><td>' + badge(r.status) + '</td><td><span class="code-chip"><span class="bar" style="background:' + esc(normHex(p.color_hex) || '#CBD5E1') + '"></span>' + esc(p.speaking_code || '—') + '</span>' + (p.multi_code ? '<div class="multi-tag">' + esc(p.multi_code) + '</div>' : '') + '</td>' +
      '<td><div class="co">' + esc(p.company_name || '') + '</div><div class="ti">' + esc(p.binder_title || '') + (p.category ? ' · ' + esc(p.category) : '') + '</div></td><td>' + (loc ? '<span class="loc">' + esc(loc) + '</span>' : '') + '</td>' +
      '<td class="cnt-list">' + (p.contents_items ? esc(t('items_n', {n:p.contents_items.length})) : '') + '</td><td class="sc">' + esc(p.short_code || p._keepSC || '') + '</td><td class="small" style="color:#92400E">' + esc(r.w.join(' • ')) + '</td></tr>'; }).join('') +
    '</tbody></table></div>' +
    '<div class="panel-sec">' + (IP.workspace ? '<label class="chk" style="margin-bottom:14px"><input type="checkbox" data-bind="restoreAll"' + (UI.restoreAll ? ' checked' : '') + '>' + esc(t('im_restore_all')) + '</label>' : '') +
    '<div class="grid g2"><div class="stack"><button class="btn btn-lg btn-primary" data-a="im-merge"' + (ok.length ? '' : ' disabled') + '>' + ic('merge') + esc(t('im_merge')) + '</button><div class="hint">' + esc(t('im_merge_d')) + '</div></div>' +
    '<div class="stack"><button class="btn btn-lg btn-danger" data-a="im-replace"' + (ok.length ? '' : ' disabled') + '>' + ic('refresh') + esc(t('im_replace')) + '</button><div class="hint">' + esc(t('im_replace_d')) + '</div></div></div></div></div>';
}
function applyImport(mode){
  const IP = UI.importParsed; if (!IP || !IP.rows) return;
  undoPoint();
  const rows = IP.rows.filter(r => r.status !== 'err');
  let added = 0, updated = 0;
  const now = nowISO();
  const strip = (p) => { const o = clone(p); const keep = o._keepSC; delete o._keepSC; return [o, keep]; };
  if (mode === 'replace'){
    const old = new Map(S.binders.map(b => [b.id, b]));
    S.binders = rows.map(r => {
      const [p, keep] = strip(r.p);
      const base = r.match ? {id:r.match, short_code:keep || old.get(r.match).short_code, created_at:old.get(r.match).created_at} : {};
      const b = normalizeBinder(Object.assign({updated_at:now}, base, p));
      if (!b.short_code) b.short_code = keep || newShortCode();
      b.short_url = shortUrl(b.short_code);
      r.match ? updated++ : added++;
      return b;
    });
    if (IP.workspace && UI.restoreAll){
      const W = IP.workspace;
      if (W.settings) S.settings = Object.assign(defaultState().settings, W.settings);
      if (W.print) S.print = Object.assign(defaultState().print, W.print, {geometry:Object.assign(presetGeo((W.print || {}).presetId, W.customPresets || S.customPresets), (W.print || {}).geometry || {})});
      if (Array.isArray(W.customPresets)) S.customPresets = W.customPresets;
      if (W.usedSlots && typeof W.usedSlots === 'object') S.usedSlots = W.usedSlots;
      if (Array.isArray(W.clients)) S.clients = W.clients.map(normalizeClient);
      if (W.lang === 'it' || W.lang === 'en') S.lang = W.lang;
      // workspace JSON keeps original timestamps
      rows.forEach((r, i) => { if (r.p.updated_at) S.binders[i].updated_at = r.p.updated_at; });
    }
  } else {
    rows.forEach(r => {
      const [p, keep] = strip(r.p);
      if (r.match){
        const i = S.binders.findIndex(b => b.id === r.match);
        const cur = S.binders[i];
        delete p.id;
        const merged = Object.assign({}, cur, p, {updated_at: p.updated_at || now});
        if (!p.short_code) merged.short_code = keep || cur.short_code;
        S.binders[i] = normalizeBinder(merged); updated++;
      } else {
        S.binders.push(normalizeBinder(Object.assign({updated_at:now, selected_for_print:true}, p))); added++;
      }
    });
  }
  // A final_destination identical to the studio template is the default, not a custom override:
  // keep it empty so a future template change still applies (CSV backups export the resolved URL).
  S.binders.forEach(b => { if (b.final_destination && b.final_destination === renderDest(S.settings.destTemplate, b)) b.final_destination = ''; });
  ensureIntegrity();
  UI.importParsed = null; UI.importText = '';
  commit();
  undoToast(t('im_done', {a:added, u:updated}));
  S.view = 'archive'; UI.q = ''; savePrefs(); renderAll();
}

/* ---------------- Export ---------------- */
function viewExport(){
  const card = (n, title, desc, inner) => '<div class="card card-p exp-card"><div class="row" style="flex-wrap:nowrap;align-items:flex-start"><div class="exp-n">' + n + '</div><div><h2>' + esc(title) + '</h2><p class="card-sub" style="margin:4px 0 0">' + esc(desc) + '</p></div></div>' + inner + '</div>';
  const sample = sortedBinders().slice(0, 3).filter(b => b.short_code);
  const manPrev = [MANIFEST_HEADER.join(';')].concat(sample.map(b => manifestRow(b).join(';'))).join('\n');
  return '<div class="page-h"><div><h1>' + esc(t('ex_h')) + helpDot('manifest') + '</h1><p>' + esc(t('ex_p')) + '</p></div><div class="small muted">' + esc(S.lastExportAt ? t('ex_last', {d:fmtDate(S.lastExportAt, true)}) + ' • ' + (S.lastExportFile || '') : t('ex_never')) + '</div></div>' +
    '<div class="grid g2">' +
    card(1, t('ex1'), t('ex1_d'), '<div class="codebox" style="max-height:150px">' + esc(manPrev) + (S.binders.length > 3 ? '\n…' : '') + '</div><button class="btn btn-lg btn-primary" data-a="ex-manifest">' + ic('download') + esc(t('ex1_btn')) + '</button>' +
      '<div class="sep" style="margin:4px 0"></div><div><b>' + esc(t('ex1_merge')) + '</b><div class="hint" style="margin-top:4px">' + esc(t('ex1_merge_d')) + '</div></div>' +
      '<label class="chk small"><input type="checkbox" data-bind="prune"' + (UI.prune ? ' checked' : '') + '>' + esc(t('ex1_prune')) + '</label><button class="btn btn-lg btn-dark" data-a="ex-merge">' + ic('merge') + esc(t('ex1_merge_btn')) + '</button>') +
    '<div class="stack" style="gap:16px">' +
      card(2, t('ex2'), t('ex2_d'), '<button class="btn btn-lg btn-primary" data-a="ex-csv">' + ic('table') + esc(t('ex2_btn')) + '</button>') +
      card(3, t('ex3'), t('ex3_d'), '<button class="btn btn-lg btn-primary" data-a="ex-json">' + ic('braces') + esc(t('ex3_btn')) + '</button>') +
      card(4, t('ex4'), t('ex4_d'), '<label class="chk small"><input type="checkbox" data-bind="regSelOnly"' + (UI.regSelOnly ? ' checked' : '') + '>' + esc(t('ex_sel_only')) + '</label><button class="btn btn-lg btn-dark" data-a="ex-register">' + ic('file') + esc(t('ex4_btn')) + '</button>') +
    '</div></div>';
}
function openRegister(){
  const list = UI.regSelOnly ? printQueueBinders() : sortedBinders();
  openModal({ title:t('reg_t'), size:'lg', body:'<div class="reg-screen">' + buildRegisterHTML(list) + '</div>',
    buttons:[{label:t('close'), cls:'btn', action:'modal-close'}, {label:t('reg_print'), cls:'btn btn-primary', icon:'printer', fn:() => printRegister(list)}] });
}

/* ---------------- AI ---------------- */
function viewAI(){
  const prompt = buildAIPrompt(UI.aiCtx);
  return '<div class="page-h"><div><h1>' + esc(t('ai_h')) + helpDot('ai') + '</h1><p>' + esc(t('ai_p')) + '</p></div></div>' +
    '<div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1.4fr)"><div class="stack">' +
      '<div class="card card-p stack"><button class="btn btn-lg btn-primary btn-block" data-a="ai-copy" style="min-height:64px;font-size:17px">' + ic('clipboard', 'lg') + esc(t('ai_copy')) + '</button>' +
      '<button class="btn btn-block" data-a="ai-copy-tpl">' + ic('table') + esc(t('ai_copy_tpl')) + '</button>' +
      '<label class="chk small"><input type="checkbox" data-bind="aiCtx"' + (UI.aiCtx ? ' checked' : '') + '>' + esc(t('ai_ctx')) + '</label></div>' +
      '<div class="card card-p"><ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px">' + t('ai_steps').map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
      '<button class="btn btn-dark" style="margin-top:16px" data-a="nav" data-v="import">' + ic('arrowRight') + esc(t('ai_go_import')) + '</button></div></div>' +
    '<div class="card card-p"><div class="codebox" id="ai-prompt" style="max-height:640px">' + esc(prompt) + '</div></div></div>';
}

/* ---------------- Settings ---------------- */
function viewSettings(){
  let kb = 0; try { kb = Math.round(((localStorage.getItem(LS_KEY) || '').length + (localStorage.getItem(LS_PREV) || '').length) * 2 / 1024); } catch(e){}
  const ex = S.binders[0] || normalizeBinder({speaking_code:'BL1', short_code:'dm26K8m2P9xL', company_name:'Barbieri Luigi S.r.l.'});
  return '<div class="page-h"><div><h1>' + esc(t('se_h')) + helpDot('backup') + '</h1><p>' + esc(t('se_p')) + '</p></div></div>' +
    '<div class="grid g2"><div class="card card-p stack">' +
      '<div class="field"><label for="se-studio">' + esc(t('se_studio')) + '</label><input class="inp" id="se-studio" data-set="studioName" value="' + esc(S.settings.studioName) + '"></div>' +
      '<div class="field"><label for="se-dest">' + esc(t('se_dest')) + '</label><input class="inp mono small" id="se-dest" data-set="destTemplate" value="' + esc(S.settings.destTemplate) + '"><div class="hint">' + esc(t('se_dest_hint')) + '</div>' +
        '<div class="small" style="margin-top:6px">' + esc(t('se_dest_prev')) + ' (' + esc(ex.speaking_code) + '): <span class="mono" id="se-dest-prev" style="word-break:break-all">' + esc(renderDest(S.settings.destTemplate, ex)) + '</span></div></div>' +
      '<button class="btn" data-a="se-apply-dest">' + ic('link') + esc(t('se_apply_dest')) + '</button>' +
      '<div class="field"><label>' + esc(t('se_lang')) + '</label><div class="seg"><button data-a="lang" data-l="it" class="' + (S.lang === 'it' ? 'on' : '') + '">🇮🇹 Italiano</button><button data-a="lang" data-l="en" class="' + (S.lang === 'en' ? 'on' : '') + '">🇬🇧 English</button></div></div>' +
    '</div><div class="card card-p stack"><h2>' + esc(t('se_data')) + '</h2><div class="small muted">' + esc(t('se_storage', {k:kb})) + '</div>' +
      '<button class="btn" data-a="quick-backup">' + ic('save') + esc(t('quick_backup')) + '</button>' +
      '<button class="btn" data-a="pick-restore">' + ic('upload') + esc(t('se_restore')) + '</button>' +
      '<button class="btn" data-a="se-prev">' + ic('rotate') + esc(t('se_prev_restore')) + '</button>' +
      '<button class="btn" data-a="se-demo">' + ic('refresh') + esc(t('se_demo')) + '</button>' +
      '<button class="btn btn-danger" data-a="se-wipe">' + ic('trash') + esc(t('se_wipe')) + '</button>' +
      '<div class="sep"></div><div class="tiny muted">' + esc(t('se_about', {v:APP_VERSION})) + '<br>localStorage: <span class="mono">' + LS_KEY + '</span></div></div></div>';
}
