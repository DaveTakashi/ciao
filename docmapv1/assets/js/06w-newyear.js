/* =====================================================================
   DocMap 2026 — v12.11 «Nuovo anno in un clic» (index.html, after 06y-place.js). Roadmap K9.
   Every January a studio opens the new binders for its clients: «Fatture 2026» after «Fatture 2025», for each
   client and each kind of binder. DocMap does it in one click:

   - Series (02l-years.js): same client (Codice Multi or name), category and title without the years. The latest
     binder of every series that had a binder last year (or up to N years ago, «serie ferme») gets a new one for
     the target year, unless that year exists already (so pressing twice never doubles anything).
   - The new binder copies client, city, Codice Multi, category, colour, archive, contacts, extra codes; the year
     moves forward everywhere it is written (title, reference year, tags, contents items of that year: «2025:
     Fatture acquisto» → «2026: Fatture acquisto»); new speaking code (next free for the client) and NEW short code
     (never reused); selected for printing; place from «Dove lo metto?» (06y-place.js: next to last year's binder,
     or the sibling with room when it is full) or the same place as last year.
   - Optional: clients of the register with no binder at all get one from a title template («Documenti {anno}»);
     last year's binders go to «Storico».
   - Preview with a tick per binder, then «Crea»: one undo step, logged (binder.newyear), then «Stampa solo
     questi N» puts only the new labels in the print queue. S.settings.newYear holds the options and doneYears.
   - «Oggi» shows «Prepara i faldoni del {anno}» from December to February while there is something to prepare.
   ===================================================================== */
'use strict';

const NY_DEF = {contents:true, place:true, oldHist:false, lookback:1, clients:false, tplTitle:'Documenti {anno}', tplCat:'', doneYears:[]};
Object.assign(I18N.it, {
  nav_ny:'Nuovo anno', nd_ny:'Prepara in un clic i faldoni del nuovo anno per tutti i clienti, con le etichette',
  ny_h:'Nuovo anno in un clic', ny_p:('Per ogni cliente ' + brandName() + ' prende i faldoni dell\'anno scorso (stesso cliente, categoria e titolo) e prepara quelli del nuovo anno: anno aggiornato nel titolo e nel contenuto, codice nuovo, QR nuovo, posto accanto a quello dell\'anno prima. Controlli l\'elenco, togli la spunta a quelli che non servono e premi Crea. Si annulla in un colpo.'),
  ny_year:'Anno da preparare', ny_opts:'Opzioni', ny_o_contents:'Copia il contenuto dell\'anno prima con l\'anno nuovo (es. «2025: Fatture acquisto» → «2026: Fatture acquisto»)',
  ny_o_place:'Posto suggerito da «Dove lo metto?» (accanto all\'anno prima; se il posto è pieno, quello accanto con spazio)', ny_o_hist:'Metti i faldoni dell\'anno prima in «Storico»',
  ny_o_look:'Anche i faldoni fermi da 2 anni (il cliente ha saltato un anno)', ny_o_clients:'Anche i clienti dell\'anagrafica che non hanno ancora nessun faldone', ny_o_tpl:'Titolo per questi clienti', ny_o_tplcat:'Categoria (vuota = quella del cliente)',
  ny_k_new:'faldoni nuovi', ny_k_clients:'clienti', ny_k_done:'già pronti', ny_k_stop:'serie ferme',
  ny_c_client:'Cliente', ny_c_from:'Dall\'anno prima', ny_c_new:'Nuovo faldone', ny_c_place:'Posto', ny_none_src:'nuovo cliente',
  ny_all:'Tutti', ny_nothing:'Nessuno', ny_create:'Crea {n} faldoni del {y}', ny_create1:'Crea 1 faldone del {y}',
  ny_empty_done:'I faldoni del {y} sono già pronti per tutti i clienti.', ny_empty:'Nessun faldone da preparare per il {y}: servono faldoni con un anno (nel titolo, nell\'anno di riferimento o nel contenuto) dell\'anno prima.',
  ny_made:'Creati {n} faldoni del {y}.', ny_made_p:'Sono già selezionati per la stampa. Attaccali sui faldoni nuovi e mettili nel posto indicato.', ny_print:'Stampa solo queste {n} etichette', ny_show:'Mostrali nell\'archivio',
  ny_pq_t:'Mettere in stampa solo i {n} faldoni nuovi?', ny_pq_d:'Ora in stampa ci sono anche {m} altri faldoni selezionati: vengono tolti dalla stampa (restano nell\'archivio).', ny_pq_ok:'Stampa solo i nuovi',
  ny_log:'Nuovo anno {y}: creati {n} faldoni', ny_todo:'Prepara i faldoni del {y}: {n} da creare in un clic', ny_same:'stesso posto dell\'anno prima', ny_noplace:'senza posizione',
  ny_more:'Mostra tutti ({n})'
});
Object.assign(I18N.en, {
  nav_ny:'New year', nd_ny:'Prepare the new year\'s binders for every client in one click, with the labels',
  ny_h:'New year in one click', ny_p:('For every client ' + brandName() + ' takes last year\'s binders (same client, category and title) and prepares the new year\'s: year updated in the title and contents, new code, new QR, place next to last year\'s. Check the list, untick what you do not need and press Create. One undo step.'),
  ny_year:'Year to prepare', ny_opts:'Options', ny_o_contents:'Copy last year\'s contents with the new year («2025: Purchase invoices» → «2026: Purchase invoices»)',
  ny_o_place:'Place suggested by «Where do I put it?» (next to last year; if full, the next one with room)', ny_o_hist:'Move last year\'s binders to «Historical»',
  ny_o_look:'Also series idle for 2 years (the client skipped a year)', ny_o_clients:'Also register clients that have no binder yet', ny_o_tpl:'Title for these clients', ny_o_tplcat:'Category (empty = the client\'s)',
  ny_k_new:'new binders', ny_k_clients:'clients', ny_k_done:'already done', ny_k_stop:'idle series',
  ny_c_client:'Client', ny_c_from:'From last year', ny_c_new:'New binder', ny_c_place:'Place', ny_none_src:'new client',
  ny_all:'All', ny_nothing:'None', ny_create:'Create {n} binders for {y}', ny_create1:'Create 1 binder for {y}',
  ny_empty_done:'The {y} binders are ready for every client.', ny_empty:'Nothing to prepare for {y}: binders need a year (title, reference year or contents) of the year before.',
  ny_made:'{n} binders for {y} created.', ny_made_p:'They are selected for printing. Stick the labels on the new binders and put them where shown.', ny_print:'Print only these {n} labels', ny_show:'Show them in the archive',
  ny_pq_t:'Print only the {n} new binders?', ny_pq_d:'{m} other binders are selected for printing: they leave the print queue (they stay in the archive).', ny_pq_ok:'Print only the new ones',
  ny_log:'New year {y}: {n} binders created', ny_todo:'Prepare the {y} binders: {n} to create in one click', ny_same:'same place as last year', ny_noplace:'no location',
  ny_more:'Show all ({n})'
});
if (typeof ICONS === 'object' && !ICONS.calplus) ICONS.calplus = '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v5M9.5 16.5h5"/>';

const NYV = {year:0, excl:new Set(), made:null, limit:200, plan:null, planSig:''};
function nySet(){
  const s = Object.assign({}, NY_DEF, (S.settings && S.settings.newYear) || {});
  s.lookback = s.lookback >= 2 ? 2 : 1; s.doneYears = Array.isArray(s.doneYears) ? s.doneYears.filter(y => yrOk(+y)).map(Number) : [];
  s.tplTitle = String(s.tplTitle == null ? NY_DEF.tplTitle : s.tplTitle).slice(0, 120); s.tplCat = String(s.tplCat || '').slice(0, 60);
  return s;
}
function nySave(patch){ S.settings.newYear = Object.assign({}, nySet(), patch); NYV.planSig = ''; }
/** Year to prepare by default: next year from October, this year until September. */
function nyDefaultYear(d){ d = d || new Date(); return d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear(); }
const nyYear = () => NYV.year || nyDefaultYear();

/** Series of the live binders: key → {last (binder with the highest year), L, years:Set}. */
function nySeries(){
  const M = new Map();
  yrLive().forEach(b => {
    if (typeof isDemo === 'function' && S.settings.hideDemo && isDemo(b)) return;
    const k = yrSeriesKey(b), ys = yrList(b); if (!k || !ys.length) return;
    const L = ys[ys.length - 1], g = M.get(k) || {last:null, L:0, years:new Set()};
    ys.forEach(y => g.years.add(y));
    if (L > g.L || (L === g.L && String(b.updated_at) > String(g.last.updated_at))){ g.L = L; g.last = b; }
    M.set(k, g);
  });
  return M;
}
/** Contents items of the year `L` moved to `Y` (or the undated ones when none carries L). */
function nyContents(src, L, Y){
  const items = (src.contents_items || []);
  const ofL = items.filter(i => yrFromText(i.year).includes(L));
  const base = ofL.length ? ofL : items.filter(i => !String(i.year || '').trim());
  return base.map(i => ({year:i.year ? yrShift(i.year, L, Y) : '', description:i.description, status:'archive'}));
}
function nyNewFrom(src, L, Y, set, taken, scs){
  const nb = {
    id:uuid(), multi_code:src.multi_code, company_name:src.company_name, company_city:src.company_city, category:src.category,
    color_hex:src.color_hex, color_locked:src.color_locked, shelf_color:src.shelf_color, extra_codes:src.extra_codes, contacts:src.contacts,
    binder_title:yrShift(src.binder_title, L, Y), ref_year:src.ref_year ? yrShift(src.ref_year, L, Y) : '', tags:yrShift(src.tags, L, Y),
    contents_items:set.contents ? nyContents(src, L, Y) : [], archive_id:src.archive_id, archive_state:'CURRENT', selected_for_print:true,
    location_id:src.location_id, room_code:src.room_code, cabinet_code:src.cabinet_code, shelf_code:src.shelf_code, sector_code:src.sector_code
  };
  if (yrMax(nb) !== Y) nb.ref_year = String(Y);   // the year must be readable next January too
  return nyFinish(nb, taken, scs);
}
function nyNewForClient(c, Y, set, taken, scs){
  const nb = {id:uuid(), multi_code:c.multi_code, company_name:c.name, company_city:typeof clientPlace === 'function' ? clientPlace(c) : c.city, category:set.tplCat || c.category || c.type || '',
    binder_title:String(set.tplTitle || NY_DEF.tplTitle).replace(/\{anno\}|\{year\}/g, Y), ref_year:String(Y), contents_items:[], archive_id:typeof archCurrentId === 'function' ? archCurrentId() : '', archive_state:'CURRENT', selected_for_print:true};
  if (yrMax(nb) !== Y) nb.ref_year = String(Y);
  return nyFinish(nb, taken, scs);
}
function nyFinish(nb, taken, scs){
  nb.speaking_code = suggestSpeakingCode(nb.company_name || nb.multi_code || 'X', taken); taken.push(nb.speaking_code);
  nb.short_code = newShortCode(scs); scs.push(nb.short_code);
  const o = normalizeBinder(nb);
  if (!o.color_locked && typeof colorAssign === 'function' && typeof colorMode === 'function' && colorMode() !== 'manual'){ try { o.color_hex = colorAssign(o, yrLive()); } catch(e){} }
  return o;
}
/**
 * Plan for year Y: {Y, rows:[{key, src|null, client|null, L, nb, place|null}], done, stopped, clients}. Pure on S
 * (codes are allocated but nothing is saved). o.place false skips «Dove lo metto?» (fast count).
 */
function nyPlan(Y, o){
  o = o || {}; Y = +Y || nyYear();
  const set = Object.assign(nySet(), o.set || {}), M = nySeries(), rows = [], taken = [], scs = [];
  let done = 0, stopped = 0;
  M.forEach((g, key) => {
    if (g.years.has(Y)){ done++; return; }
    if (g.L >= Y) return;
    if (g.L < Y - set.lookback){ if (g.L >= Y - 3) stopped++; return; }
    rows.push({key, src:g.last, client:null, L:g.L});
  });
  if (set.clients && Array.isArray(S.clients)){
    const have = new Set(yrLive().map(yrClientKey).filter(Boolean));
    S.clients.forEach(c => {
      const k = yrClientKey({multi_code:c.multi_code, company_name:c.name}); if (!k || have.has(k)) return;
      have.add(k); rows.push({key:'client|' + k, src:null, client:c, L:0});
    });
  }
  rows.sort((a, b) => naturalCmp((a.src ? a.src.company_name : a.client.name) || '', (b.src ? b.src.company_name : b.client.name) || '') || naturalCmp(a.src ? a.src.speaking_code : '', b.src ? b.src.speaking_code : ''));
  if (o.count) return {Y, n:rows.length, done, stopped};
  const made = [];
  rows.forEach(r => {
    r.nb = r.src ? nyNewFrom(r.src, r.L, Y, set, taken, scs) : nyNewForClient(r.client, Y, set, taken, scs);
    r.place = null;
    if (set.place && typeof plSuggest === 'function'){
      const L = plSuggest(r.nb, {extra:made, max:1});
      if (L.length){ r.place = L[0]; plApply(r.nb, L[0]); }
    }
    if (!r.place && r.src) r.place = binderLocCode(r.nb) ? {same:true, label:binderLocCode(r.nb), reason:t('ny_same')} : null;
    made.push(r.nb);
  });
  return {Y, rows, done, stopped, clients:new Set(rows.map(r => yrClientKey(r.nb))).size};
}
function nyPlanCached(){
  const sig = nyYear() + '|' + S.binders.length + '|' + (S.lastSavedAt || '') + '|' + JSON.stringify(nySet());
  if (!NYV.plan || NYV.planSig !== sig){ NYV.plan = nyPlan(nyYear()); NYV.planSig = sig; }
  return NYV.plan;
}
/** Create the ticked binders of the plan. Returns the new binders. */
function nyCreate(plan, excl){
  excl = excl || new Set();
  const rows = plan.rows.filter(r => !excl.has(r.key)); if (!rows.length) return [];
  const set = nySet();
  undoPoint();
  const out = [];
  rows.forEach(r => { S.binders.push(r.nb); out.push(r.nb); if (set.oldHist && r.src && r.src.archive_state === 'CURRENT') r.src.archive_state = 'HISTORICAL'; });
  ensureIntegrity();
  nySave({doneYears:Array.from(new Set(set.doneYears.concat(plan.Y))).sort()});
  logAct('binder.newyear', null, t('ny_log', {y:plan.Y, n:out.length}), {year:plan.Y, binders:out.slice(0, 500).map(b => ({id:b.id, code:b.speaking_code, short:b.short_code, loc:b.location_code})), oldHist:!!set.oldHist}, 'ui');
  commit();
  return out;
}
function nyPrintOnly(ids){
  ids = new Set(ids.filter(id => S.binders.some(b => b.id === id))); if (!ids.size) return;
  const others = S.binders.filter(b => b.selected_for_print && !ids.has(b.id)).length;
  const go = () => { S.binders.forEach(b => { b.selected_for_print = ids.has(b.id); }); S.view = 'print'; commit({dirty:false}); renderAll(); window.scrollTo(0, 0); };
  if (!others) return go();
  confirmAction({plain:true, title:t('ny_pq_t', {n:ids.size}), detail:t('ny_pq_d', {n:ids.size, m:others}), okLabel:t('ny_pq_ok'), onOk:go});
}

/* ---------------- view ---------------- */
function nyRowHTML(r){
  const on = !NYV.excl.has(r.key), s = r.src, n = r.nb;
  const yrs = (b) => { const l = yrList(b); return l.length ? (l[0] === l[l.length - 1] ? String(l[0]) : l[0] + '–' + l[l.length - 1]) : ''; };
  const place = r.place ? '<b class="mono">' + esc(r.place.label || t('ny_noplace')) + '</b>' + (r.place.reason ? '<small class="muted">' + esc(r.place.reason) + '</small>' : '') : '<span class="muted">' + esc(t('ny_noplace')) + '</span>';
  return '<tr class="' + (on ? '' : 'ny-off') + '" data-nyk="' + esc(r.key) + '"><td><input type="checkbox" data-ny-row="' + esc(r.key) + '"' + (on ? ' checked' : '') + ' aria-label="' + esc(n.speaking_code) + '"></td>' +
    '<td><b>' + esc(n.company_name || '—') + '</b>' + (n.multi_code ? '<small class="mono muted">' + esc(n.multi_code) + '</small>' : '') + '</td>' +
    '<td>' + (s ? '<span class="mono">' + esc(s.speaking_code) + '</span> <span>' + esc(s.binder_title) + '</span><small class="muted">' + esc([s.category, yrs(s)].filter(Boolean).join(' · ')) + '</small>' : '<span class="muted">' + esc(t('ny_none_src')) + '</span>') + '</td>' +
    '<td><span class="mono ny-new">' + esc(n.speaking_code) + '</span> <span>' + esc(n.binder_title) + '</span><small class="muted">' + esc([n.category, yrs(n)].filter(Boolean).join(' · ')) + '</small></td>' +
    '<td class="ny-place">' + place + '</td></tr>';
}
function viewNewYear(){
  const set = nySet(), Y = nyYear(), now = new Date().getFullYear();
  const head = '<div class="page-h"><h1>' + ic('calplus') + esc(t('ny_h')) + helpDot('newyear') + '</h1><p class="muted">' + esc(t('ny_p')) + '</p></div>';
  if (NYV.made && NYV.made.y === Y){
    const ids = NYV.made.ids.filter(id => S.binders.some(b => b.id === id));
    if (ids.length) return '<div class="stack" id="ny-page">' + head + '<div class="card card-p ny-made" id="ny-made"><div class="ok-box">' + ic('check', 'lg') + '<div><b>' + esc(t('ny_made', {n:ids.length, y:Y})) + '</b><p class="small">' + esc(t('ny_made_p')) + '</p></div></div>' +
      '<div class="row" style="gap:8px;margin-top:12px"><button class="btn btn-primary" data-a="ny-print" id="ny-print">' + ic('printer') + esc(t('ny_print', {n:ids.length})) + '</button><button class="btn" data-a="ny-show">' + ic('search') + esc(t('ny_show')) + '</button></div></div></div>';
    NYV.made = null;
  }
  const P = nyPlanCached(), on = P.rows.filter(r => !NYV.excl.has(r.key)).length;
  const yrOpt = [now - 1, now, now + 1].concat(Y < now - 1 || Y > now + 1 ? [Y] : []).map(y => '<option value="' + y + '"' + (y === Y ? ' selected' : '') + '>' + y + '</option>').join('');
  const chk = (k, lbl, v) => '<label class="chk"><input type="checkbox" data-ny-set="' + k + '"' + (v ? ' checked' : '') + '>' + esc(t(lbl)) + '</label>';
  const kpi = (v, k) => '<div class="card kpi"><div class="v">' + v + '</div><div class="k">' + esc(t(k)) + '</div></div>';
  const rows = P.rows.slice(0, NYV.limit);
  return '<div class="stack" id="ny-page">' + head +
    '<div class="card card-p stack"><div class="row" style="gap:16px;align-items:flex-end;flex-wrap:wrap"><div class="field" style="min-width:160px"><label for="ny-year">' + esc(t('ny_year')) + '</label><select class="inp" id="ny-year" data-ny-year>' + yrOpt + '</select></div></div>' +
      '<details class="ny-opts" id="ny-opts"' + (NYV.optsOpen ? ' open' : '') + '><summary><b>' + esc(t('ny_opts')) + '</b></summary><div class="stack" style="margin-top:8px">' +
        chk('contents', 'ny_o_contents', set.contents) + chk('place', 'ny_o_place', set.place) + chk('oldHist', 'ny_o_hist', set.oldHist) + chk('lookback', 'ny_o_look', set.lookback >= 2) + chk('clients', 'ny_o_clients', set.clients) +
        (set.clients ? '<div class="g2"><div class="field"><label for="ny-tpl">' + esc(t('ny_o_tpl')) + '</label><input class="inp" id="ny-tpl" data-ny-text="tplTitle" value="' + esc(set.tplTitle) + '"></div><div class="field"><label for="ny-tplcat">' + esc(t('ny_o_tplcat')) + '</label><input class="inp" id="ny-tplcat" data-ny-text="tplCat" value="' + esc(set.tplCat) + '"></div></div>' : '') +
      '</div></details></div>' +
    '<div class="kpis" id="ny-kpis">' + kpi(P.rows.length, 'ny_k_new') + kpi(P.clients, 'ny_k_clients') + kpi(P.done, 'ny_k_done') + kpi(P.stopped, 'ny_k_stop') + '</div>' +
    (!P.rows.length ? '<div class="card empty" id="ny-empty">' + ic('check', 'lg') + '<p>' + esc(t(P.done ? 'ny_empty_done' : 'ny_empty', {y:Y})) + '</p></div>' :
      '<div class="card"><div class="toolbar"><div class="row" style="gap:8px"><button class="btn btn-sm" data-a="ny-all">' + esc(t('ny_all')) + '</button><button class="btn btn-sm" data-a="ny-none">' + esc(t('ny_nothing')) + '</button></div>' +
        '<button class="btn btn-primary" data-a="ny-create" id="ny-create"' + (on ? '' : ' disabled') + '>' + ic('plus') + esc(t(on === 1 ? 'ny_create1' : 'ny_create', {n:on, y:Y})) + '</button></div>' +
      '<div class="tbl-wrap"><table class="tbl ny-tbl" id="ny-tbl"><thead><tr><th></th><th>' + esc(t('ny_c_client')) + '</th><th>' + esc(t('ny_c_from')) + '</th><th>' + esc(t('ny_c_new')) + '</th><th>' + esc(t('ny_c_place')) + '</th></tr></thead><tbody>' + rows.map(nyRowHTML).join('') + '</tbody></table></div>' +
      (P.rows.length > rows.length ? '<div class="toolbar"><button class="btn btn-sm" data-a="ny-more">' + esc(t('ny_more', {n:P.rows.length})) + '</button></div>' : '') + '</div>') +
    '</div>';
}
function nyRefresh(){ if (S.view !== 'newyear') return; const y = window.scrollY; renderView(); window.scrollTo(0, y); }

const NY_ACTIONS = {
  'ny-create': () => {
    const P = nyPlanCached(), Y = P.Y;
    const made = nyCreate(P, NYV.excl); if (!made.length) return;
    NYV.made = {y:Y, ids:made.map(b => b.id)}; NYV.excl = new Set(); NYV.planSig = '';
    renderAll(); window.scrollTo(0, 0);
    undoToast(t('ny_made', {n:made.length, y:Y}));
  },
  'ny-print': () => { if (NYV.made) nyPrintOnly(NYV.made.ids); },
  'ny-show': () => { if (!NYV.made) return; UI.q = 'anno:' + NYV.made.y; S.view = 'archive'; NYV.made = null; savePrefs(); renderAll(); },
  'ny-all': () => { NYV.excl = new Set(); nyRefresh(); },
  'ny-none': () => { NYV.excl = new Set(nyPlanCached().rows.map(r => r.key)); nyRefresh(); },
  'ny-more': () => { NYV.limit += 1000; nyRefresh(); },
};
if (typeof ACTIONS === 'object') Object.assign(ACTIONS, NY_ACTIONS);
else document.addEventListener('DOMContentLoaded', () => { if (typeof ACTIONS === 'object') Object.assign(ACTIONS, NY_ACTIONS); });
document.addEventListener('change', (e) => {
  const el = e.target; if (!el || !el.dataset) return;
  if (el.dataset.nyRow != null){ const k = el.dataset.nyRow; if (el.checked) NYV.excl.delete(k); else NYV.excl.add(k); nyRefresh(); return; }
  if (el.dataset.nyYear != null){ NYV.year = +el.value || 0; NYV.excl = new Set(); NYV.planSig = ''; nyRefresh(); return; }
  if (el.dataset.nySet){ const k = el.dataset.nySet; nySave({[k]:k === 'lookback' ? (el.checked ? 2 : 1) : !!el.checked}); commit({dirty:false}); NYV.optsOpen = true; nyRefresh(); return; }
  if (el.dataset.nyText){ nySave({[el.dataset.nyText]:String(el.value || '').trim()}); commit({dirty:false}); NYV.optsOpen = true; nyRefresh(); }
});

/** «Oggi»: December to February, while the year has something to prepare. */
function nyTodo(d){
  d = d || new Date(); const m = d.getMonth(); if (!(m === 11 || m <= 1)) return null;
  const Y = nyDefaultYear(d); if (nySet().doneYears.includes(Y)) return null;
  const n = nyPlan(Y, {count:true}).n;
  return n ? {sev:'info', text:t('ny_todo', {y:Y, n}), a:'nav', v:'newyear', year:Y, n} : null;
}

(function nyWrap(){
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  if (typeof NAV_MORE !== 'undefined'){ const g = NAV_MORE.find(x => x[0] === 'nm_work'); if (g && !g[1].some(x => x[0] === 'newyear')) g[1].push(['newyear', 'calplus', 'nav_ny', 'nd_ny']); }
  if (typeof ADV_VIEWS !== 'undefined' && !ADV_VIEWS.includes('newyear')) ADV_VIEWS.push('newyear');
  wrap('renderView', (o) => function(){
    if (S.view === 'newyear'){ document.documentElement.lang = S.lang; $('#view').innerHTML = viewNewYear(); return; }
    return o.apply(this, arguments);
  });
  wrap('w1Todos', (o) => function(){ const L = o.apply(this, arguments); try { const x = nyTodo(); if (x) L.push(x); } catch(e){} return L; });
})();
document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'newyear')) return;
  HELP_TOPICS.push({ id:'newyear', guide:null, tags:['archive', 'label'], pop:62, related:['place', 'disposal', 'print'],
    kw:{it:'nuovo anno gennaio faldoni nuovi anno nuovo tutti i clienti etichette nuove apertura esercizio duplicare copia anno prossimo', en:'new year january new binders all clients new labels duplicate copy next year'},
    title:{it:'Come preparo in un clic i faldoni del nuovo anno per tutti i clienti?', en:'How do I prepare the new year\'s binders for every client in one click?'},
    body:{it:('<p>Menu <b>⚙ Funzioni avanzate › Lavoro › Nuovo anno</b>. ' + brandName() + ' cerca, per ogni cliente, i faldoni dell\'anno prima: stesso cliente (Codice Multi o nome), stessa categoria e stesso titolo senza l\'anno. Per ognuno prepara quello nuovo:</p><ul>') +
      '<li>l\'anno va avanti dove è scritto: titolo («Fatture 2025» → «Fatture 2026»), anno di riferimento, tag e righe del contenuto di quell\'anno;</li><li>codice parlante nuovo (il primo libero del cliente) e <b>QR nuovo</b> (un codice stampato non si riusa mai);</li>' +
      '<li>il posto accanto al faldone dell\'anno prima (con <b>Dove lo metto?</b>: se quel posto è pieno, quello accanto con spazio);</li><li>già selezionato per la stampa.</li></ul>' +
      '<p>Controlla l\'elenco, togli la spunta a quelli che non servono e premi <b>Crea</b>. Poi <b>Stampa solo queste N etichette</b>. Tutto si annulla in un colpo con <b>Annulla</b>; premere di nuovo non crea doppioni (un anno già pronto viene saltato).</p>' +
      '<p><b>Opzioni</b>: copiare o no il contenuto, anno vecchio in Storico, serie ferme da 2 anni, clienti dell\'anagrafica che non hanno ancora faldoni (con un titolo come «Documenti {anno}»). Da dicembre a febbraio il promemoria compare anche in <b>Oggi</b>.</p>',
      en:'<p>Menu <b>⚙ Advanced › Work › New year</b>: for each series (same client, category and title without the year) last year\'s binder gets a new one with the year moved forward, a new code and QR, the place next to last year\'s, selected for printing. Untick what you do not need, press <b>Create</b>, then <b>Print only these labels</b>. One undo step; a year already done is skipped.</p>'}
  });
});
