/* =====================================================================
   DocMap 2026 — Client register (anagrafica clienti) and demo data tools
   The studio's client list (e.g. "CLIENTI STORICI ELENCO TIPIZZATO.csv":
   TIPO;Ditta;Ragione_soc;Indirizzo;Codice_com;Cap;Localita;Provincia;ETS_ENC)
   is imported once; new binders are then filled from it:
   Ditta → Codice Multi, Ragione_soc → company, Localita (Provincia) → place,
   ETS_ENC / TIPO → category.
   ===================================================================== */
const CLIENT_ALIASES = {
  multi_code:['ditta','codice_ditta','cod_ditta','multi_code','codice_multi','multi','codice_cliente','cod_cliente','codice'],
  name:['ragione_soc','ragione_sociale','ragionesociale','denominazione','nome','cliente','company_name','azienda','ditta_nome'],
  address:['indirizzo','via','address'],
  cap:['cap','zip','codice_postale'],
  city:['localita','comune','citta','city','company_city','luogo'],
  province:['provincia','prov','pr'],
  type:['tipo','tipologia','type'],
  category:['ets_enc','categoria','category','forma','forma_giuridica'],
  notes:['codice_com','codice_comune','note','notes']
};
const CLIENT_LOOKUP = (() => { const m = {}; Object.keys(CLIENT_ALIASES).forEach(k => CLIENT_ALIASES[k].forEach(a => { m[a] = m[a] || k; })); return m; })();
/* A client list has a company-name column and at least one register column, and no binder-only columns. */
function isClientList(head){
  const n = head.map(normHeader);
  const hasName = n.some(h => ['ragione_soc','ragione_sociale','ragionesociale','denominazione'].includes(h));
  const binderOnly = n.some(h => ['speaking_code','codice_parlante','binder_title','titolo','contents','contenuti','short_code','shelf_code','ripiano'].includes(h));
  return hasName && !binderOnly;
}
function mapClient(raw){
  const o = {};
  Object.keys(raw).forEach(k => {
    const key = CLIENT_ALIASES[k] ? k : CLIENT_LOOKUP[normHeader(k)]; if (!key || o[key]) return;   // field names come from the column-mapping step
    const v = unsafeCell(String(raw[k] == null ? '' : raw[k]).trim()); if (v) o[key] = v;
  });
  if (o.notes && /^[A-Z]\d{3}$/.test(o.notes)) o.notes = 'Cod. comune ' + o.notes;
  return normalizeClient(o);
}
function clientKey(c){ return c.multi_code ? 'm:' + c.multi_code.toLowerCase() : 'n:' + c.name.toLowerCase(); }
function analyzeClients(records){
  const byKey = new Map((S.clients || []).map(c => [clientKey(c), c]));
  const seen = new Set();
  return records.map((raw, idx) => {
    const c = mapClient(raw);
    if (!c.name) return {idx, status:'err', c, w:[t('cl_w_noname')]};
    const k = clientKey(c);
    if (seen.has(k)) return {idx, status:'err', c, w:[t('cl_w_dup')]};
    seen.add(k);
    const match = byKey.get(k) || (S.clients || []).find(x => x.name.toLowerCase() === c.name.toLowerCase());
    return {idx, status:match ? 'upd' : 'new', c, match:match ? match.id : null, w:c.multi_code ? [] : [t('cl_w_nomulti')]};
  });
}
function clientsPreviewHTML(IP){
  const ok = IP.clients.filter(r => r.status !== 'err');
  const badge = (s) => s === 'new' ? '<span class="badge b-new">' + esc(t('im_new')) + '</span>' : s === 'upd' ? '<span class="badge b-upd">' + esc(t('im_upd')) + '</span>' : '<span class="badge b-err">' + esc(t('im_err')) + '</span>';
  return '<div class="card"><div class="toolbar" style="justify-content:space-between"><div><h2 style="margin:0">' + esc(t('cl_prev')) + '</h2><div class="small muted">' + esc(t('cl_prev_d', {n:IP.clients.length})) + '</div></div>' +
    '<div class="row"><span class="badge b-new">' + IP.clients.filter(r => r.status === 'new').length + ' ' + esc(t('im_new')) + '</span><span class="badge b-upd">' + IP.clients.filter(r => r.status === 'upd').length + ' ' + esc(t('im_upd')) + '</span></div></div>' +
    '<div class="info-box small" style="margin:0 16px 12px">' + ic('info') + '<div>' + esc(t('cl_map')) + '</div></div>' +
    '<div class="tbl-wrap" style="max-height:420px"><table class="tbl"><thead><tr><th>#</th><th></th><th>' + esc(t('f_multi')) + '</th><th>' + esc(t('cl_name')) + '</th><th>' + esc(t('f_city')) + '</th><th>' + esc(t('f_category')) + '</th><th>Note</th></tr></thead><tbody>' +
    IP.clients.map(r => '<tr><td class="mono small muted">' + (r.idx + 1) + '</td><td>' + badge(r.status) + '</td><td class="mono">' + esc(r.c.multi_code || '—') + '</td><td><b>' + esc(r.c.name) + '</b><div class="ti">' + esc([r.c.address, r.c.cap].filter(Boolean).join(' · ')) + '</div></td><td>' + esc(clientPlace(r.c)) + '</td><td>' + esc([r.c.type, r.c.category].filter(Boolean).join(' · ')) + '</td><td class="small" style="color:#92400E">' + esc(r.w.join(' • ')) + '</td></tr>').join('') +
    '</tbody></table></div><div class="panel-sec"><button class="btn btn-lg btn-primary" data-a="cl-apply"' + (ok.length ? '' : ' disabled') + '>' + ic('merge') + esc(t('cl_apply', {n:ok.length})) + '</button><div class="hint">' + esc(t('cl_apply_d')) + '</div></div></div>';
}
function applyClientsImport(){
  const IP = UI.importParsed; if (!IP || !IP.clients) return;
  undoPoint();
  let added = 0, updated = 0;
  S.clients = S.clients || [];
  IP.clients.filter(r => r.status !== 'err').forEach(r => {
    if (r.match){ const i = S.clients.findIndex(c => c.id === r.match); if (i >= 0){ S.clients[i] = normalizeClient(Object.assign({}, S.clients[i], r.c, {id:r.match})); updated++; return; } }
    S.clients.push(r.c); added++;
  });
  UI.importParsed = null; UI.importText = '';
  commit();
  undoToast(t('cl_done', {a:added, u:updated}));
  S.view = 'clients'; savePrefs(); renderAll();
}
function clientDefaults(c){
  return { company_name:c.name, multi_code:c.multi_code, company_city:clientPlace(c), category:c.category || c.type || '' };
}
/* Fill the open binder form from a register entry (only empty fields are filled). */
function applyClientToEditor(c){
  const d = UI.ed && UI.ed.d; if (!d) return;
  const v = clientDefaults(c);
  ['multi_code','company_city','category'].forEach(k => { if (!String(d[k] || '').trim() || (k === 'category' && UI.ed.isNew && !UI.ed.catTouched)){ if (v[k]){ d[k] = v[k]; const el = $('#ed-' + k); if (el) el.value = v[k]; } } });
  if (CAT_COLOR[d.category] && UI.ed.isNew){ d.color_hex = CAT_COLOR[d.category]; const sw = $('#ed-swatches'); if (sw) sw.innerHTML = swatchesHTML(d.color_hex); }
}
function newBinderForClient(id){
  const c = (S.clients || []).find(x => x.id === id); if (!c) return;
  const p = clientDefaults(c);
  p.speaking_code = suggestSpeakingCode(c.name);
  if (CAT_COLOR[p.category]) p.color_hex = CAT_COLOR[p.category];
  openEditor(null, p);
  if (UI.ed){ UI.ed.catTouched = true; UI.ed.base = JSON.stringify(UI.ed.d); }
}
function exportClientsCSV(){
  const rows = [['multi_code','ragione_sociale','indirizzo','cap','localita','provincia','tipo','categoria','note']].concat((S.clients || []).slice().sort((a, b) => naturalCmp(a.name, b.name)).map(c => [c.multi_code, c.name, c.address, c.cap, c.city, c.province, c.type, c.category, c.notes].map(safeCell)));
  download('docmap_clienti.csv', '﻿' + toCSV(rows, ';'), 'text/csv');
  toast(t('ex_done', {f:'docmap_clienti.csv'}));
}

/* ---------------- Clients view ---------------- */
function viewClients(){
  return '<div class="page-h"><div><h1>' + esc(t('cl_h')) + helpDot('clients') + '</h1><p>' + esc(t('cl_p')) + '</p></div>' +
    '<div class="row"><button class="btn" data-a="pick-import">' + ic('upload') + esc(t('cl_import')) + '</button><button class="btn" data-a="cl-export"' + ((S.clients || []).length ? '' : ' disabled') + '>' + ic('download') + esc(t('cl_export')) + '</button><button class="btn btn-primary" data-a="cl-new">' + ic('plus') + esc(t('cl_new')) + '</button></div></div>' +
    '<div class="card"><div class="toolbar"><div class="search">' + ic('search') + '<input class="inp" type="search" data-bind="clq" value="' + esc(UI.clq || '') + '" placeholder="' + esc(t('cl_search')) + '" aria-label="search"></div><span class="small muted" id="cl-count"></span></div><div id="cl-results"></div></div>';
}
function renderClientResults(){
  const box = $('#cl-results'); if (!box) return;
  const list = (S.clients || []);
  if (!list.length){ box.innerHTML = '<div class="empty">' + ic('archive', 'lg') + '<p>' + esc(t('cl_empty')) + '</p><div class="row" style="justify-content:center"><button class="btn btn-primary" data-a="pick-import">' + ic('upload') + esc(t('cl_import')) + '</button></div></div>'; const c = $('#cl-count'); if (c) c.textContent = ''; return; }
  const q = String(UI.clq || '').trim().toLowerCase();
  const nB = {}; S.binders.forEach(b => { const k = (b.multi_code || '') + '|' + b.company_name.toLowerCase(); nB[k] = (nB[k] || 0) + 1; });
  const count = (c) => S.binders.filter(b => (c.multi_code && b.multi_code === c.multi_code) || b.company_name.toLowerCase() === c.name.toLowerCase()).length;
  const rows = list.filter(c => !q || [c.multi_code, c.name, c.city, c.province, c.type, c.category, c.address].join(' ').toLowerCase().indexOf(q) >= 0).sort((a, b) => naturalCmp(a.name, b.name));
  const c0 = $('#cl-count'); if (c0) c0.textContent = t('cl_count', {n:rows.length, t:list.length});
  box.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(t('f_multi')) + '</th><th>' + esc(t('cl_name')) + '</th><th>' + esc(t('f_city')) + '</th><th>' + esc(t('f_category')) + '</th><th>' + esc(t('k_total')) + '</th><th></th></tr></thead><tbody>' +
    rows.slice(0, 500).map(c => { const n = count(c); return '<tr><td class="mono">' + esc(c.multi_code || '—') + '</td><td><b>' + esc(c.name) + '</b><div class="ti">' + esc([c.address, c.cap].filter(Boolean).join(' · ')) + '</div></td><td>' + esc(clientPlace(c)) + '</td><td>' + esc([c.type, c.category].filter(Boolean).join(' · ')) + '</td><td class="mono">' + (n || '<span class="muted">0</span>') + '</td>' +
      '<td class="acts"><button class="btn btn-sm btn-primary" data-a="cl-binder" data-id="' + c.id + '">' + ic('plus') + esc(t('cl_binder')) + '</button><button class="icon-btn" data-a="cl-edit" data-id="' + c.id + '" title="' + esc(t('act_edit')) + '">' + ic('pencil') + '</button><button class="icon-btn danger" data-a="cl-del" data-id="' + c.id + '" title="' + esc(t('act_del')) + '">' + ic('trash') + '</button></td></tr>'; }).join('') +
    '</tbody></table></div>' + (rows.length > 500 ? '<div class="hint" style="padding:12px">' + esc(t('cl_more', {n:rows.length - 500})) + '</div>' : '');
}
function openClientEditor(id){
  const src = id ? (S.clients || []).find(c => c.id === id) : null;
  const c = src ? clone(src) : normalizeClient({});
  const f = (k, lab, ph) => '<div class="field"><label for="cl-' + k + '">' + esc(lab) + '</label><input class="inp' + (k === 'multi_code' ? ' mono' : '') + '" id="cl-' + k + '" value="' + esc(c[k]) + '" placeholder="' + esc(ph || '') + '"></div>';
  openModal({ title: src ? t('cl_edit') : t('cl_new'), size:'',
    body:'<div class="grid g2">' + f('multi_code', t('f_multi'), '8') + f('name', t('cl_name'), 'APS Il Rosmarino') + '</div><div class="grid g2">' + f('address', t('cl_address')) + f('cap', 'CAP') + '</div><div class="grid g2">' + f('city', t('cl_city'), 'Parma') + f('province', t('cl_prov'), 'PR') + '</div><div class="grid g2">' + f('type', t('cl_type'), 'ENC') + f('category', t('f_category'), 'APS') + '</div>' + f('notes', 'Note'),
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('save'), cls:'btn btn-primary', icon:'save', fn: () => {
      const o = {}; Object.keys(c).forEach(k => { const el = $('#cl-' + k); o[k] = el ? el.value : c[k]; });
      const n = normalizeClient(Object.assign(o, {id:c.id}));
      if (!n.name){ toast(t('cl_w_noname'), 'err'); return; }
      S.clients = S.clients || [];
      const i = S.clients.findIndex(x => x.id === n.id); if (i >= 0) S.clients[i] = n; else S.clients.push(n);
      commit(); closeModal(true); renderClientResults(); toast(t('saved') + ': ' + n.name);
    }}] });
}

/* ---------------- Demo data ---------------- */
function demoBarHTML(){
  const n = S.binders.filter(isDemo).length; if (!n) return '';
  return '<div class="demo-bar">' + ic('info') + '<span>' + esc(t(S.settings.hideDemo ? 'demo_hidden' : 'demo_shown', {n})) + '</span><span style="flex:1"></span>' +
    '<button class="btn btn-sm" data-a="demo-toggle">' + ic('eye') + esc(t(S.settings.hideDemo ? 'demo_show' : 'demo_hide')) + '</button>' +
    '<button class="btn btn-sm btn-danger" data-a="demo-delete">' + ic('trash') + esc(t('demo_delete')) + '</button></div>';
}

const CLIENT_ACTIONS = {
  'cl-apply': () => applyClientsImport(),
  'cl-binder': (el) => newBinderForClient(el.dataset.id),
  'cl-edit': (el) => openClientEditor(el.dataset.id),
  'cl-new': () => openClientEditor(null),
  'cl-export': () => exportClientsCSV(),
  'cl-del': (el) => { const c = (S.clients || []).find(x => x.id === el.dataset.id); if (!c) return; confirmAction({ danger:true, plain:true, okLabel:t('delete'), detail:t('cl_del_d', {n:c.name}), onOk: () => { undoPoint(); S.clients = S.clients.filter(x => x.id !== c.id); commit(); renderClientResults(); undoToast(t('deleted') + ': ' + c.name); } }); },
  'demo-toggle': () => { S.settings.hideDemo = !S.settings.hideDemo; savePrefs(); renderView(); },
  'demo-delete': () => { const n = S.binders.filter(isDemo).length; confirmAction({ danger:true, okLabel:t('delete'), detail:t('demo_del_d', {n}), onOk: () => { undoPoint(); S.binders = S.binders.filter(b => !isDemo(b)); S.settings.hideDemo = false; commit(); renderView(); undoToast(t('demo_deleted', {n})); } }); }
};
