/* =====================================================================
   DocMap 2026 — v12 (stream A): search UI — desktop archive + phone "Cerca un faldone"

   Engine: 04c-search.js (srchRun / srchParse / srchMark). This file only builds the screens.
   index.html (after 11b-assoc.js, before 09-actions.js):
     · the archive search box understands codes, Codice Multi, short codes, QR URLs, words with typos and the
       operators of srchParse (tag: anno: cat: luogo: stato: cliente: citta: multi: codice: colore: archivio: note:
       contenuto:, -excluded); matches are highlighted; chips show the active operators / filters
     · "Filtri" opens the facets (tag, categoria, anno, posizione, colore, stato, + stream Q status / stream C archive),
       multi-select with counts; "Salva ricerca" / "Ricerche salvate" (S.settings.savedSearches, synced with the shared
       settings: savedSearchesAt newer wins); recent searches stay on this device (localStorage docmap_v26_srch_recent,
       or in memory only in web mode)
     · S.settings.srchNotes === false leaves notes / contacts out of the free-word search
   scan.html: a Search screen (header button and "Cerca un faldone" on the home page): big field, voice dictation
     where the browser has it, quick chips (recent, saved, frequent tags, "Fuori archivio", hook chips), big result
     cards → the binder card (SC.via = 'search' → access_log via). Data: this browser's state (local / web) or the
     server's ?r=pull, cached ENCRYPTED with the vault key in IndexedDB docmap_v26_srch (works offline).
   ===================================================================== */
'use strict';

Object.assign(I18N.it, {
  sr_filters:'Filtri', sr_save:'Salva ricerca', sr_saved:'Ricerche salvate', sr_recent:'Recenti', sr_clear:'Azzera', sr_n:'{n} faldoni', sr_n1:'1 faldone', sr_ms:'{ms} ms',
  sr_fuzzy:'Forse cercavi:', sr_not:'non', sr_ops:'Operatori', sr_ops_d:'Scrivili nella ricerca, anche insieme: tag:iva anno:2024 -tag:2019',
  sr_notes:'Cerca anche in note e contatti', sr_save_t:'Salva la ricerca', sr_save_name:'Nome', sr_save_ph:'es. IVA 2024 fuori archivio', sr_saved_ok:'Ricerca salvata', sr_del:'Elimina',
  sr_none_saved:'Nessuna ricerca salvata.', sr_none_recent:'Nessuna ricerca recente.', sr_more:'Mostra tutti ({n})', sr_less:'Meno', sr_empty_q:'Scrivi qualcosa o scegli un filtro prima di salvare.',
  sr_g_tag:'Tag', sr_g_cat:'Categoria', sr_g_year:'Anno', sr_g_loc:'Posizione', sr_g_color:'Colore', sr_g_state:'Stato', sr_g_status:'Prelievo', sr_g_archive:'Archivio',
  sr_op_tag:'tag:iva', sr_op_anno:'anno:2024 · anno:2020..2024 · anno:>2022', sr_op_cat:'cat:APS', sr_op_luogo:'luogo:B04', sr_op_stato:'stato:fuori · stato:storico', sr_op_cliente:'cliente:rossi',
  sr_op_citta:'citta:modena', sr_op_colore:'colore:rosso', sr_op_neg:'-tag:2019 (escludi)',
  sr_ph_h:'Cerca un faldone', sr_ph_title:'DocMap — Cerca', sr_ph_ph:'Codice, cliente, tag, anno, posizione…', sr_ph_go:'Cerca un faldone', sr_ph_voice:'Detta la ricerca', sr_ph_listen:'Ti ascolto…',
  sr_ph_out:'Fuori archivio', sr_ph_none:'Nessun faldone trovato.', sr_ph_hint:'Scrivi qualche lettera del codice o del cliente, oppure tocca un suggerimento.', sr_ph_more:'Mostra altri',
  sr_ph_loading:'Carico i faldoni…', sr_ph_cached:'Dati salvati sul telefono il {d}', sr_ph_offline:'Senza rete: uso i dati salvati sul telefono il {d}.', sr_ph_err:'Impossibile caricare i faldoni: {m}',
  sr_ph_offline_card:'Senza rete: scheda dalla copia salvata sul telefono (potrebbe non essere aggiornata).', sr_ph_back:'Risultati', sr_ph_back_l:'Torna ai risultati', sr_ph_count:'{n} risultati', sr_ph_count1:'1 risultato', sr_ph_tags:'Tag frequenti',
  sr_g_search:'Cerca', sr_help_t:'Come cerco un faldone (operatori, filtri, ricerche salvate)'
});
Object.assign(I18N.en, {
  sr_filters:'Filters', sr_save:'Save search', sr_saved:'Saved searches', sr_recent:'Recent', sr_clear:'Clear', sr_n:'{n} binders', sr_n1:'1 binder', sr_ms:'{ms} ms',
  sr_fuzzy:'Did you mean:', sr_not:'not', sr_ops:'Operators', sr_ops_d:'Type them in the search, also together: tag:vat year:2024 -tag:2019',
  sr_notes:'Also search notes and contacts', sr_save_t:'Save the search', sr_save_name:'Name', sr_save_ph:'e.g. VAT 2024 checked out', sr_saved_ok:'Search saved', sr_del:'Delete',
  sr_none_saved:'No saved searches.', sr_none_recent:'No recent searches.', sr_more:'Show all ({n})', sr_less:'Less', sr_empty_q:'Type something or pick a filter before saving.',
  sr_g_tag:'Tag', sr_g_cat:'Category', sr_g_year:'Year', sr_g_loc:'Location', sr_g_color:'Colour', sr_g_state:'State', sr_g_status:'Check-out', sr_g_archive:'Archive',
  sr_op_tag:'tag:vat', sr_op_anno:'year:2024 · year:2020..2024 · year:>2022', sr_op_cat:'cat:APS', sr_op_luogo:'loc:B04', sr_op_stato:'state:out · state:historical', sr_op_cliente:'client:rossi',
  sr_op_citta:'city:modena', sr_op_colore:'colour:red', sr_op_neg:'-tag:2019 (exclude)',
  sr_ph_h:'Find a binder', sr_ph_title:'DocMap — Search', sr_ph_ph:'Code, client, tag, year, location…', sr_ph_go:'Find a binder', sr_ph_voice:'Dictate the search', sr_ph_listen:'Listening…',
  sr_ph_out:'Checked out', sr_ph_none:'No binder found.', sr_ph_hint:'Type a few letters of the code or the client, or tap a suggestion.', sr_ph_more:'Show more',
  sr_ph_loading:'Loading binders…', sr_ph_cached:'Data saved on the phone on {d}', sr_ph_offline:'No network: using the data saved on the phone on {d}.', sr_ph_err:'Cannot load the binders: {m}',
  sr_ph_offline_card:'No network: card from the copy saved on the phone (it may be out of date).', sr_ph_back:'Results', sr_ph_back_l:'Back to the results', sr_ph_count:'{n} results', sr_ph_count1:'1 result', sr_ph_tags:'Frequent tags',
  sr_g_search:'Search', sr_help_t:'How do I find a binder (operators, filters, saved searches)'
});
if (typeof ICONS !== 'undefined'){
  if (!ICONS.mic) ICONS.mic = '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/>';
  if (!ICONS.star) ICONS.star = '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>';
  if (!ICONS.filter) ICONS.filter = '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>';
}

const SR_RECENT_LS = 'docmap_v26_srch_recent', SR_PANEL_LS = 'docmap_v26_srch_panel', SR_RECENT_MAX = 8, SR_SAVED_MAX = 50, SR_HL_ROWS = 300;
const SR_IDB = 'docmap_v26_srch', SR_CACHE_KEY = 'cache';
const SR = { facets:{}, last:null, panel:false, more:{}, recentMem:null, recentTimer:null, sortSrc:null, sortCodes:null, sortOut:null,
  ph:{q:'', binders:null, locations:null, settings:null, at:'', loading:false, err:'', offline:false, limit:40, loaded:false, back:null, from:''}, voice:null };

/* ---------------- shared helpers ---------------- */
const srWeb = () => typeof DocMapVault !== 'undefined' && DocMapVault.isActive();
function srRecent(){
  if (SR.recentMem) return SR.recentMem;
  const l = srWeb() ? [] : lsGetJSON(SR_RECENT_LS, []);
  return (SR.recentMem = Array.isArray(l) ? l.filter(x => typeof x === 'string' && x.trim()).slice(0, SR_RECENT_MAX) : []);
}
/** Remember a query (device only; web mode: memory only, never plaintext in localStorage). */
function srAddRecent(q){
  q = String(q || '').trim().slice(0, 120); if (q.length < 2) return;
  const l = srRecent().filter(x => x.toLowerCase() !== q.toLowerCase()); l.unshift(q); SR.recentMem = l.slice(0, SR_RECENT_MAX);
  if (!srWeb()) try { lsSetJSON(SR_RECENT_LS, SR.recentMem); } catch(e){}
}
function srCleanSaved(list){
  return (Array.isArray(list) ? list : []).filter(x => x && typeof x === 'object' && typeof x.q === 'string').slice(0, SR_SAVED_MAX).map(x => {
    const f = {}; if (x.facets && typeof x.facets === 'object') srchFacetGroups().forEach(g => { if (Array.isArray(x.facets[g]) && x.facets[g].length) f[g] = x.facets[g].map(String).slice(0, 50); });
    return {id:String(x.id || uuid()), name:String(x.name || x.q || '').slice(0, 80), q:String(x.q).slice(0, 300), facets:f, at:String(x.at || '')};
  });
}
function srSaved(){ return S && S.settings ? srCleanSaved(S.settings.savedSearches) : []; }
const srNotes = () => !(S && S.settings && S.settings.srchNotes === false);
const srFacetN = (f) => Object.keys(f || {}).reduce((n, g) => n + ((f[g] || []).length), 0);
function srSearchInput(){ return document.querySelector('.card .toolbar input[data-bind="q"]'); }
function srSetQ(q, focus){
  UI.q = String(q || ''); const i = srSearchInput(); if (i){ i.value = UI.q; if (focus){ i.focus(); try { i.setSelectionRange(UI.q.length, UI.q.length); } catch(e){} } }
  renderArchiveResults();
}

/* ---------------- desktop: wrappers ---------------- */
const SR_WRAPPED = new Set();
function srWrap(name, fn){ const o = window[name]; if (typeof o !== 'function' || SR_WRAPPED.has(name)) return false; SR_WRAPPED.add(name); window[name] = fn(o); return true; }
function srInstallDesktop(){
  if (typeof UI === 'undefined' || typeof filteredBinders !== 'function') return;
  /* the base order (natural sort by speaking code) is cached: re-sorting 5 000 binders at every keystroke costs ~40 ms */
  srWrap('sortedBinders', (o) => function(){
    /* valid only while S.binders holds the very same objects (an edited binder may be a new object) with the same codes */
    /* an export limited to one archive (06l-archives.js, AR.export) filters the list: never cache or serve that */
    if (typeof AR !== 'undefined' && AR && AR.export != null) return o.apply(this, arguments);
    const arr = S.binders, src = SR.sortSrc, codes = SR.sortCodes;
    let same = !!(SR.sortOut && src && src.length === arr.length);
    for (let i = 0; same && i < arr.length; i++) same = src[i] === arr[i] && codes[i] === arr[i].speaking_code;
    if (same) return SR.sortOut.slice();
    SR.sortOut = o.apply(this, arguments); SR.sortSrc = arr.slice(); SR.sortCodes = arr.map(b => b.speaking_code);
    return SR.sortOut.slice();
  });
  srWrap('filteredBinders', (o) => function(){
    const q = UI.q || '';
    let base; try { UI.q = ''; base = o.apply(this, arguments); } finally { UI.q = q; }
    if (!q.trim() && !srFacetN(SR.facets) && !SR.panel){ SR.last = null; return base; }
    const r = srchRun(base, q, {facets:SR.facets, notes:srNotes()});
    SR.last = r;
    return r.list;
  });
  srWrap('viewArchive', (o) => function(){
    const h = o.apply(this, arguments), mark = '<div class="toolbar" style="padding-top:0;gap:8px" id="bulkbar">';
    return h.indexOf(mark) >= 0 ? h.replace(mark, '<div class="sr-zone" id="sr-zone"></div>' + mark) : h.replace('<div id="arch-results">', '<div class="sr-zone" id="sr-zone"></div><div id="arch-results">');
  });
  srWrap('renderArchiveResults', (o) => function(){
    const r = o.apply(this, arguments);
    try { srRenderZone(); srHighlight(); } catch(e){ console.warn('search ui', e); }
    return r;
  });
  /* saved searches travel with the shared settings (06f packages + 06g server), newer savedSearchesAt wins */
  srWrap('locSyncSubset', (o) => function(){ return Object.assign(o.apply(this, arguments), {savedSearches:srSaved(), savedSearchesAt:(S.settings && S.settings.savedSearchesAt) || ''}); });
  srWrap('locSyncApply', (o) => function(ss){
    const r = o.apply(this, arguments);
    try {
      if (ss && Array.isArray(ss.savedSearches) && ss.savedSearchesAt && syTs(ss.savedSearchesAt) > syTs(S.settings.savedSearchesAt || '')){
        S.settings.savedSearches = srCleanSaved(ss.savedSearches); S.settings.savedSearchesAt = ss.savedSearchesAt;
      }
    } catch(e){}
    return r;
  });
}
try { SR.panel = localStorage.getItem(SR_PANEL_LS) === '1'; } catch(e){}

/* ---------------- desktop: bar, chips, facets ---------------- */
function srChipHTML(label, attrs, cls){ return '<span class="sr-chip' + (cls ? ' ' + cls : '') + '">' + label + '<button type="button" class="sr-chip-x" ' + attrs + ' aria-label="' + esc(t('sr_clear')) + '">' + ic('x') + '</button></span>'; }
function srFacetTitle(g){
  if (g === 'status'){ const h = srchHook('status'); const l = h && h.facetLabel; if (l) return String(typeof l === 'function' ? l() : l); }
  if (g === 'archive'){ const h = srchHook('archive'); const l = h && h.facetLabel; if (l) return String(typeof l === 'function' ? l() : l); }
  return t('sr_g_' + g);
}
function srZoneHTML(){
  const r = SR.last, P = r ? r.parsed : srchParse(UI.q || ''), saved = srSaved();
  const chips = [];
  P.ops.forEach(o => chips.push(srChipHTML((o.neg ? '<i>' + esc(t('sr_not')) + '</i> ' : '') + '<b>' + esc(o.key) + ':</b>' + esc(o.v), 'data-a="sr-op-x" data-raw="' + esc(o.raw) + '"', o.neg ? 'neg' : '')));
  P.terms.filter(x => x.neg).forEach(x => chips.push(srChipHTML('<i>' + esc(t('sr_not')) + '</i> ' + esc(x.v), 'data-a="sr-op-x" data-raw="' + esc('-' + x.v) + '"', 'neg')));
  srchFacetGroups().forEach(g => (SR.facets[g] || []).forEach(k => chips.push(srChipHTML('<b>' + esc(srFacetTitle(g)) + ':</b>' + esc(srchFacetLabel(g, k)), 'data-a="sr-facet" data-g="' + g + '" data-k="' + esc(k) + '"', 'fac'))));
  const n = r ? r.total : null, nf = srFacetN(SR.facets);
  const fz = r && r.fuzzy.length ? '<span class="sr-fuzzy" id="sr-fuzzy">' + esc(t('sr_fuzzy')) + ' ' + r.fuzzy.map(f => f.words.slice(0, 3).map(w => '<button type="button" class="sr-sugg" data-a="sr-fuzzy" data-from="' + esc(f.term) + '" data-to="' + esc(w) + '">' + esc(w) + '</button>').join(' ')).join(' · ') + '</span>' : '';
  return '<div class="sr-bar" id="sr-bar">' +
      '<div class="sr-chips" id="sr-chips">' + chips.join('') + (n != null ? '<span class="sr-count" id="sr-count">' + esc(n === 1 ? t('sr_n1') : t('sr_n', {n})) + '</span>' : '') + fz + '</div>' +
      '<div class="sr-tools">' +
        (chips.length || (UI.q || '').trim() ? '<button type="button" class="btn btn-sm" data-a="sr-clear" id="sr-clear-btn">' + esc(t('sr_clear')) + '</button>' : '') +
        '<button type="button" class="btn btn-sm' + (SR.panel ? ' on' : '') + '" data-a="sr-panel" id="sr-filters-btn" aria-expanded="' + SR.panel + '">' + ic('filter') + esc(t('sr_filters')) + (nf ? ' <span class="sr-n">' + nf + '</span>' : '') + '</button>' +
        '<button type="button" class="btn btn-sm" data-a="sr-save" id="sr-save-btn">' + ic('star') + esc(t('sr_save')) + '</button></div></div>' +
    (saved.length ? '<div class="sr-saved-row" id="sr-saved-row"><span class="tiny muted">' + esc(t('sr_saved')) + '</span>' + saved.slice(0, 8).map(s => '<button type="button" class="sr-saved-chip" data-a="sr-apply" data-id="' + esc(s.id) + '" title="' + esc(s.q) + '">' + ic('star') + esc(s.name) + '</button>').join('') + '</div>' : '') +
    (SR.panel ? '<div class="sr-panel" id="sr-panel">' + srPanelHTML() + '</div>' : '');
}
function srPanelHTML(){
  const r = SR.last, F = r && r.facets ? r.facets : {};
  const groups = srchFacetGroups().filter(g => (F[g] || []).length).map(g => {
    const all = F[g], open = !!SR.more[g], list = open ? all : all.slice(0, 10);
    return '<div class="sr-fg" data-g="' + g + '"><div class="sr-fg-h">' + esc(srFacetTitle(g)) + '</div><div class="sr-fg-l">' +
      list.map(x => '<button type="button" class="sr-fv' + (x.on ? ' on' : '') + '" data-a="sr-facet" data-g="' + g + '" data-k="' + esc(x.k) + '" aria-pressed="' + !!x.on + '">' +
        (g === 'color' ? '<span class="sr-sw" style="background:' + esc(x.k) + '"></span>' : '') + '<span class="sr-fv-l">' + esc(g === 'color' ? x.label : x.label) + '</span><span class="sr-fv-n">' + x.n + '</span></button>').join('') +
      (all.length > 10 ? '<button type="button" class="sr-more" data-a="sr-more" data-g="' + g + '">' + esc(open ? t('sr_less') : t('sr_more', {n:all.length})) + '</button>' : '') + '</div></div>';
  }).join('');
  const ops = ['tag', 'anno', 'cat', 'luogo', 'stato', 'cliente', 'citta', 'colore', 'neg'];
  const rec = srRecent(), saved = srSaved();
  return '<div class="sr-facets">' + groups + '</div>' +
    '<div class="sr-side">' +
      '<div class="sr-sec"><div class="sr-fg-h">' + esc(t('sr_ops')) + '</div><div class="tiny muted">' + esc(t('sr_ops_d')) + '</div><div class="sr-ops">' +
        ops.map(o => { const ex = t('sr_op_' + o).split(' · ')[0].replace(/ \(.*\)$/, ''); return '<button type="button" class="sr-op" data-a="sr-op" data-v="' + esc(ex) + '" title="' + esc(t('sr_op_' + o)) + '">' + esc(t('sr_op_' + o)) + '</button>'; }).join('') + '</div></div>' +
      '<div class="sr-sec"><div class="sr-fg-h">' + esc(t('sr_saved')) + '</div>' + (saved.length ? '<ul class="sr-sl">' + saved.map(s => '<li><button type="button" class="sr-sl-a" data-a="sr-apply" data-id="' + esc(s.id) + '"><b>' + esc(s.name) + '</b><span class="mono">' + esc(s.q) + (srFacetN(s.facets) ? ' +' + srFacetN(s.facets) : '') + '</span></button><button type="button" class="icon-btn danger" data-a="sr-del" data-id="' + esc(s.id) + '" title="' + esc(t('sr_del')) + '">' + ic('trash') + '</button></li>').join('') + '</ul>' : '<div class="tiny muted">' + esc(t('sr_none_saved')) + '</div>') + '</div>' +
      '<div class="sr-sec"><div class="sr-fg-h">' + esc(t('sr_recent')) + '</div>' + (rec.length ? '<div class="sr-ops">' + rec.map(q => '<button type="button" class="sr-op" data-a="sr-recent" data-v="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>' : '<div class="tiny muted">' + esc(t('sr_none_recent')) + '</div>') + '</div>' +
      '<label class="chk small"><input type="checkbox" data-sr-notes' + (srNotes() ? ' checked' : '') + '>' + esc(t('sr_notes')) + '</label>' +
    '</div>';
}
function srRenderZone(){ const z = document.getElementById('sr-zone'); if (z) z.innerHTML = srZoneHTML(); }
/** Highlight the matched words inside the first rows of the table (text nodes only: never touches attributes). */
function srHighlight(){
  const r = SR.last; if (!r || !r.marks.length) return;
  const box = document.getElementById('arch-results'); if (!box) return;
  const rows = box.querySelectorAll('tbody tr');
  for (let i = 0; i < rows.length && i < SR_HL_ROWS; i++){
    rows[i].querySelectorAll('.code-chip, .multi-tag, .co, .ti, .loc, .cnt-list, .sc').forEach(el => {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = []; let n; while ((n = w.nextNode())) nodes.push(n);
      nodes.forEach(tn => { const h = srchMark(tn.nodeValue, r.marks); if (h.indexOf('<mark') < 0) return; const s = document.createElement('span'); s.innerHTML = h; tn.replaceWith(...s.childNodes); });
    });
  }
}
function srToggleFacet(g, k){
  const l = SR.facets[g] = (SR.facets[g] || []).slice(); const i = l.indexOf(k);
  if (i >= 0) l.splice(i, 1); else l.push(k);
  if (!l.length) delete SR.facets[g];
  renderArchiveResults();
}
function srRemoveRaw(raw){
  const q = String(UI.q || ''), i = q.indexOf(raw);
  srSetQ(i >= 0 ? (q.slice(0, i) + q.slice(i + raw.length)).replace(/\s{2,}/g, ' ').trim() : q);
}
function srSaveModal(){
  const q = String(UI.q || '').trim();
  if (!q && !srFacetN(SR.facets)){ toast(t('sr_empty_q'), 'warn'); return; }
  openModal({title:t('sr_save_t'), size:'', body:'<div class="field"><label for="sr-name">' + esc(t('sr_save_name')) + '</label><input class="inp" id="sr-name" maxlength="80" placeholder="' + esc(t('sr_save_ph')) + '" value="' + esc(q.slice(0, 60)) + '"></div>' +
      '<div class="tiny muted mono">' + esc(q) + (srFacetN(SR.facets) ? ' + ' + srFacetN(SR.facets) + ' ' + esc(t('sr_filters').toLowerCase()) : '') + '</div>',
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('sr_save'), cls:'btn btn-primary', icon:'star', fn:() => {
      const name = String((document.getElementById('sr-name') || {}).value || '').trim() || q || t('sr_save');
      const list = srSaved().filter(s => s.name.toLowerCase() !== name.toLowerCase());
      list.unshift({id:uuid(), name:name.slice(0, 80), q, facets:JSON.parse(JSON.stringify(SR.facets)), at:nowISO()});
      S.settings.savedSearches = list.slice(0, SR_SAVED_MAX); S.settings.savedSearchesAt = nowISO();
      commit({dirty:false}); closeModal(); toast(t('sr_saved_ok')); srAddRecent(q); renderArchiveResults();
    }}]});
}
const SR_ACTIONS = {
  'sr-panel': () => { SR.panel = !SR.panel; try { localStorage.setItem(SR_PANEL_LS, SR.panel ? '1' : '0'); } catch(e){} renderArchiveResults(); },
  'sr-facet': (el) => srToggleFacet(el.dataset.g, el.dataset.k),
  'sr-more': (el) => { SR.more[el.dataset.g] = !SR.more[el.dataset.g]; srRenderZone(); },
  'sr-op-x': (el) => srRemoveRaw(el.dataset.raw),
  'sr-clear': () => { SR.facets = {}; srSetQ(''); },
  'sr-op': (el) => { const v = el.dataset.v, q = String(UI.q || '').trim(); srSetQ((q ? q + ' ' : '') + v, true); },
  'sr-fuzzy': (el) => { const from = el.dataset.from, to = el.dataset.to; const q = srchFold(UI.q || ''), i = q.indexOf(from); srSetQ(i >= 0 ? String(UI.q).slice(0, i) + to + String(UI.q).slice(i + from.length) : to, true); },
  'sr-save': () => srSaveModal(),
  'sr-apply': (el) => { const s = srSaved().find(x => x.id === el.dataset.id); if (!s) return; SR.facets = JSON.parse(JSON.stringify(s.facets || {})); srAddRecent(s.q); srSetQ(s.q); },
  'sr-del': (el) => { const l = srSaved().filter(x => x.id !== el.dataset.id); S.settings.savedSearches = l; S.settings.savedSearchesAt = nowISO(); commit({dirty:false}); renderArchiveResults(); },
  'sr-recent': (el) => srSetQ(el.dataset.v, true)
};
document.addEventListener('input', (e) => {
  const el = e.target; if (!el || !el.dataset || el.dataset.bind !== 'q') return;
  clearTimeout(SR.recentTimer); SR.recentTimer = setTimeout(() => srAddRecent(UI.q), 1500);
});
document.addEventListener('change', (e) => {
  const el = e.target; if (!el || !el.matches || !el.matches('[data-sr-notes]')) return;
  S.settings.srchNotes = !!el.checked; savePrefs(); renderArchiveResults();
});

/* =====================================================================
   Phone (scan.html): "Cerca un faldone"
   ===================================================================== */
const srPh = () => typeof SC !== 'undefined' && !!SC.P;
async function srIdb(fn, mode){ const db = await idbReq(SR_IDB, ['kv']); try { return await idbDo(db, 'kv', mode || 'readonly', fn); } finally { db.close(); } }
/** Server cache: {v:1, seq, b:{id:data}, l:{id:data}, settings, at} encrypted with the vault key (AES-GCM, AAD 'srch-cache'). */
async function srCacheGet(){
  try {
    if (typeof VAULT === 'undefined' || !VAULT.dek) return null;
    const env = await srIdb(os => os.get(SR_CACHE_KEY)); if (!env) return null;
    const c = JSON.parse(new TextDecoder().decode(await vaultDec(env, 'srch-cache')));
    return c && c.v === 1 && c.b ? c : null;
  } catch(e){ return null; }
}
async function srCachePut(c){ try { if (!VAULT.dek) return; const env = await vaultEnc(new TextEncoder().encode(JSON.stringify(c)), 'srch-cache'); await srIdb(os => os.put(env, SR_CACHE_KEY), 'readwrite'); } catch(e){ console.warn('search cache', e); } }
function srNorm(d){ const b = normalizeBinder(Object.assign({}, d)); b.id = d.id; b.updated_at = d.updated_at; return b; }
function srPhApply(c){
  SR.ph.binders = Object.values(c.b).map(srNorm).sort((a, b) => naturalCmp(a.speaking_code, b.speaking_code));
  SR.ph.locations = Object.values(c.l || {}); SR.ph.settings = c.settings || null; SR.ph.at = c.at || '';
}
/** Load the binders for the phone search: this browser's state, or the server (incremental pull, cached). */
async function srPhLoad(force){
  if (SR.ph.loading) return;
  if (SR.ph.loaded && !force) return;
  SR.ph.loading = true; SR.ph.err = ''; SR.ph.offline = false; srPhRefresh();
  try {
    if (SC.P.server){
      let c = await srCacheGet();
      if (c && !SR.ph.binders) srPhApply(c);
      c = c || {v:1, seq:0, b:{}, l:{}, settings:null, at:''};
      try {
        const cl = new DMServer(dmConfig().apiBase, () => DocMapVault.srvToken());
        for (let i = 0; i < 50; i++){
          const r = await cl.call('pull', {q:{since:c.seq || 0, log_since:9007199254740991}});
          (r.records || []).forEach(x => { if (!x.data) return; if (x.type === 'binder') c.b[x.id] = x.data; else if (x.type === 'location') c.l[x.id] = x.data; });
          (r.tombstones || []).forEach(x => { delete c.b[x.id]; delete c.l[x.id]; });
          if (r.settings && r.settings.data) c.settings = r.settings.data;
          c.seq = r.seq || c.seq;
          if (!r.more) break;
        }
        c.at = nowISO(); srPhApply(c); await srCachePut(c);
      } catch(e){
        if (c.at){ srPhApply(c); SR.ph.offline = e.code === 'offline'; if (!SR.ph.offline) SR.ph.err = e.message || e.code; }
        else throw e;
      }
    } else {
      const {st} = await SC.P.data.readState();
      SR.ph.binders = st ? (st.binders || []).map(b => { const x = normalizeBinder(b); x.id = b.id; x.updated_at = b.updated_at; return x; }).sort((a, b) => naturalCmp(a.speaking_code, b.speaking_code)) : [];
      SR.ph.locations = st && Array.isArray(st.locations) ? st.locations : []; SR.ph.settings = st ? st.settings || null : null; SR.ph.at = '';
    }
    SR.ph.loaded = true;
  } catch(e){ SR.ph.err = e.code === 'offline' ? t('sc_srv_off') : (e.message || e.code || 'error'); }
  SR.ph.loading = false;
  srPhRefresh();
}
function srPhRun(){
  if (!SR.ph.binders) return null;
  if (typeof locIndexUse === 'function' && LOC_IDX.override !== SR.ph.locations) locIndexUse(SR.ph.locations || []);
  const base = SR.ph.binders.filter(b => !(typeof isDemo === 'function' && SR.ph.settings && SR.ph.settings.hideDemo && isDemo(b)));
  return srchRun(base, SR.ph.q, {counts:!String(SR.ph.q).trim(), notes:!(SR.ph.settings && SR.ph.settings.srchNotes === false)});
}
function srPhChips(r){
  const out = [], seen = new Set(), add = (q, label, cls) => { const k = q.toLowerCase(); if (!q || seen.has(k)) return; seen.add(k); out.push('<button type="button" class="sr-pchip' + (cls ? ' ' + cls : '') + '" data-sr="chip" data-q="' + esc(q) + '">' + esc(label || q) + '</button>'); };
  srRecent().slice(0, 4).forEach(q => add(q, q, 'rec'));
  srCleanSaved(SR.ph.settings && SR.ph.settings.savedSearches).slice(0, 4).forEach(s => add(s.q, '★ ' + s.name, 'sav'));
  add('stato:fuori', t('sr_ph_out'), 'out');
  ['status', 'archive'].forEach(k => { const h = srchHook(k), c = h ? srchCall(h, 'chips') : null; (Array.isArray(c) ? c : []).slice(0, 4).forEach(x => x && x.q && add(String(x.q), String(x.label || x.q), 'hook')); });
  if (r && r.facets && r.facets.tag) r.facets.tag.slice(0, 6).forEach(x => add('tag:' + (/\s/.test(x.label) ? '"' + x.label + '"' : x.label), '#' + x.label, 'tag'));
  return out.join('');
}
function srPhCardHTML(b, marks){
  const st = srchStateOf(b), loc = srchLocInfo(b), path = loc.path || b.location_code || '';
  const showSt = st.hook || b.archive_state !== 'CURRENT';
  return '<li><button type="button" class="sr-pc" data-sr="go" data-id="' + esc(b.id) + '" style="--bc:' + esc(b.color_hex || '#2563EB') + '"><span class="sr-pc-bar" aria-hidden="true"></span>' +
    '<span class="sr-pc-top"><b class="sr-pc-code">' + srchMark(b.speaking_code, marks) + '</b>' + (b.multi_code ? '<span class="sr-pc-multi">' + srchMark(b.multi_code, marks) + '</span>' : '') +
      (showSt ? '<span class="sr-pc-st ' + esc(st.cls || '') + '">' + esc(st.label) + '</span>' : '') + '</span>' +
    '<span class="sr-pc-co">' + srchMark(b.company_name, marks) + '</span>' + (b.binder_title ? '<span class="sr-pc-ti">' + srchMark(b.binder_title, marks) + (b.ref_year ? ' · ' + esc(b.ref_year) : '') + '</span>' : '') +
    (path ? '<span class="sr-pc-loc">' + sic('pin') + '<span>' + srchMark(path, marks) + '</span></span>' : '') + '</button></li>';
}
function srPhListHTML(){
  if (!SR.ph.binders) return '<div class="sc-muted sr-ph-msg">' + esc(SR.ph.err ? t('sr_ph_err', {m:SR.ph.err}) : t('sr_ph_loading')) + '</div>';
  const r = srPhRun(), q = String(SR.ph.q || '').trim();
  const meta = (SR.ph.offline ? '<div class="sc-msg warn" role="status">' + sic('alert') + '<span>' + esc(t('sr_ph_offline', {d:fmtDate(SR.ph.at, true)})) + '</span></div>' : '') +
    (SR.ph.err && SR.ph.binders ? '<div class="sc-msg warn">' + sic('alert') + '<span>' + esc(t('sr_ph_err', {m:SR.ph.err})) + '</span></div>' : '');
  const chips = '<div class="sr-pchips" id="sr-ph-chips">' + srPhChips(r) + '</div>';
  if (!q) return meta + chips + '<div class="sc-muted sr-ph-msg">' + esc(t('sr_ph_hint')) + '</div>';
  const list = r.list.slice(0, SR.ph.limit);
  return meta + '<div class="sr-ph-count" id="sr-ph-count">' + esc(r.total === 1 ? t('sr_ph_count1') : t('sr_ph_count', {n:r.total})) + (r.fuzzy.length ? ' · ' + esc(t('sr_fuzzy')) + ' ' + r.fuzzy.map(f => '<button type="button" class="sc-link" data-sr="fz" data-from="' + esc(f.term) + '" data-to="' + esc(f.words[0]) + '">' + esc(f.words[0]) + '</button>').join(' ') : '') + '</div>' +
    (list.length ? '<ul class="sr-pl" id="sr-ph-list">' + list.map(b => srPhCardHTML(b, r.marks)).join('') + '</ul>' : '<div class="sc-card sc-info sr-ph-none">' + esc(t('sr_ph_none')) + '</div>') +
    (r.total > list.length ? '<button type="button" class="sc-btn sc-block" data-sr="more">' + esc(t('sr_ph_more')) + '</button>' : '') + (SR.ph.at && !SR.ph.offline ? '<div class="sc-foot sc-muted">' + esc(t('sr_ph_cached', {d:fmtDate(SR.ph.at, true)})) + '</div>' : '');
}
const srVoiceOk = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
function srPhHTML(){
  return '<main class="sc-main sr-ph" id="sr-ph"><div class="sr-ph-h"><button type="button" class="sc-icon" data-sr="back" aria-label="' + esc(t('sc_back')) + '">' + sic('back') + '</button><h1>' + esc(t('sr_ph_h')) + '</h1></div>' +
    '<form class="sr-ph-form" data-sr="form" role="search" novalidate><label class="sr" for="sr-ph-q">' + esc(t('sr_ph_h')) + '</label><div class="sr-ph-box">' + sic('search') +
      '<input id="sr-ph-q" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="' + esc(t('sr_ph_ph')) + '" value="' + esc(SR.ph.q) + '">' +
      (srVoiceOk() ? '<button type="button" class="sr-mic' + (SR.voice ? ' on' : '') + '" data-sr="mic" id="sr-mic" aria-label="' + esc(SR.voice ? t('sr_ph_listen') : t('sr_ph_voice')) + '">' + sic('mic') + '</button>' : '') + '</div></form>' +
    '<div id="sr-ph-res">' + srPhListHTML() + '</div></main>';
}
function srPhRefresh(){ const el = document.getElementById('sr-ph-res'); if (el && SC.view === 'search') el.innerHTML = srPhListHTML(); }
function srPhShow(push){
  if (!SC.user) return;
  if (SC.view !== 'search') SR.ph.back = {view:SC.view, url:location.href};
  SC.view = 'search'; SC.msg = null; SR.ph.limit = 40;
  if (push !== false){ try { history.pushState({sr:1}, '', location.pathname + location.search + '#cerca'); } catch(e){} }
  scRender();
  srPhLoad(false);
  setTimeout(() => { const i = document.getElementById('sr-ph-q'); if (i && !SR.ph.q) i.focus(); }, 40);
}
function srPhGo(id){
  const b = (SR.ph.binders || []).find(x => x.id === id); if (!b) return;
  srAddRecent(SR.ph.q);
  SC.via = 'search'; SR.ph.from = 'search';
  const url = 'scan.html?' + (b.short_code ? 'q=' + encodeURIComponent(b.short_code) : 'code=' + encodeURIComponent(b.speaking_code));
  try { history.pushState({sr:2}, '', url); } catch(e){}
  SC.params = scParams(); SC.view = 'boot'; scRender(); scRoute();
}
function srPhVoice(){
  const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!R) return;
  if (SR.voice){ try { SR.voice.stop(); } catch(e){} return; }
  const r = new R(); r.lang = S.lang === 'en' ? 'en-GB' : 'it-IT'; r.interimResults = false; r.maxAlternatives = 1;
  r.onresult = (e) => { const txt = String(((e.results[0] || [])[0] || {}).transcript || '').trim(); if (!txt) return; SR.ph.q = txt.replace(/[.。]$/, ''); const i = document.getElementById('sr-ph-q'); if (i) i.value = SR.ph.q; srAddRecent(SR.ph.q); srPhRefresh(); };
  r.onend = r.onerror = () => { SR.voice = null; const m = document.getElementById('sr-mic'); if (m){ m.classList.remove('on'); m.setAttribute('aria-label', t('sr_ph_voice')); } };
  SR.voice = r; try { r.start(); } catch(e){ SR.voice = null; }
  const m = document.getElementById('sr-mic'); if (m){ m.classList.add('on'); m.setAttribute('aria-label', t('sr_ph_listen')); }
}
/** Offline fallback for the card: the binder from the phone's saved copy (server mode). */
async function srPhOfflineRec(){
  if (!SR.ph.binders){ const c = await srCacheGet(); if (c) srPhApply(c); }
  const p = SC.params || {}, l = SR.ph.binders || [];
  const b = p.qr ? l.find(x => x.short_code === p.qr) : p.code ? l.find(x => String(x.speaking_code || '').toUpperCase() === String(p.code).toUpperCase()) : null;
  return b ? {binder:b, etag:b.updated_at, siblings:[], offline:true} : null;
}
function srInstallPhone(){
  if (typeof scRender !== 'function') return;
  srWrap('scRender', (o) => function(){
    if (SC.view === 'search'){
      document.documentElement.lang = S.lang; document.title = t('sr_ph_title');
      document.getElementById('app').innerHTML = scHeader() + srPhHTML();
      return;
    }
    const r = o.apply(this, arguments);
    if (SC.view === 'noqr' && SC.user){ const f = document.querySelector('#app .sc-info .sc-find'); if (f && !document.getElementById('sr-ph-open')) f.insertAdjacentHTML('beforebegin', '<button type="button" class="sc-btn sc-primary sc-block sr-ph-open" data-sr="open" id="sr-ph-open">' + sic('search') + esc(t('sr_ph_go')) + '</button>'); }
    return r;
  });
  srWrap('scHeader', (o) => function(){
    const h = o.apply(this, arguments);
    if (!SC.user || ['login', 'setup', 'token', 'search', 'boot'].includes(SC.view)) return h;
    return h.replace('<button type="button" class="sc-out"', '<button type="button" class="sc-out sr-hbtn" data-sr="open" id="sr-hbtn" aria-label="' + esc(t('sr_g_search')) + '">' + sic('search') + '<span>' + esc(t('sr_g_search')) + '</span></button><button type="button" class="sc-out"');
  });
  srWrap('scCardHTML', (o) => function(){
    const h = o.apply(this, arguments);
    return SR.ph.from === 'search' ? h.replace('<main class="sc-main">', '<main class="sc-main"><button type="button" class="sc-link sr-ph-backl" data-sr="back-res" id="sr-ph-backl">' + sic('back') + esc(t('sr_ph_back_l')) + '</button>') : h;
  });
  srWrap('scRoute', (o) => async function(){
    const r = await o.apply(this, arguments);
    try {
      if (!SC.user){ SR.ph.binders = null; SR.ph.loaded = false; SR.ph.q = ''; SR.ph.from = ''; SC.via = ''; SR.recentMem = srWeb() ? null : SR.recentMem; return r; }
      if (SC.view === 'error' && SC.P.server){
        const rec = await srPhOfflineRec();
        if (rec){ SC.rec = rec; SC.view = 'card'; SC.msg = {kind:'warn', text:t('sr_ph_offline_card')}; scRender(); if (typeof acScanOfflineView === 'function') acScanOfflineView(rec.binder, SC.via || 'nav'); }
      }
      if (location.hash === '#cerca' && ['noqr', 'card', 'notfound'].includes(SC.view)) srPhShow(false);
    } catch(e){ console.warn('search', e); }
    return r;
  });
  if (typeof SC_ICONS !== 'undefined' && !SC_ICONS.mic) SC_ICONS.mic = '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/>';
}
document.addEventListener('click', (e) => {
  if (!srPh()) return;
  const el = e.target.closest && e.target.closest('[data-sr]'); if (!el || el.tagName === 'FORM') return;
  const a = el.dataset.sr;
  if (a === 'open') return srPhShow(true);
  if (a === 'back'){ if (history.state && history.state.sr === 1) return history.back(); const b = SR.ph.back; SC.view = b && b.view && b.view !== 'search' ? b.view : 'noqr'; if (SC.view === 'card' && !SC.rec) return scRoute(); scRender(); return; }
  if (a === 'back-res'){ if (history.state && history.state.sr === 2) return history.back(); SR.ph.from = ''; return srPhShow(true); }
  if (a === 'go') return srPhGo(el.dataset.id);
  if (a === 'chip'){ SR.ph.q = el.dataset.q; const i = document.getElementById('sr-ph-q'); if (i) i.value = SR.ph.q; srAddRecent(SR.ph.q); return srPhRefresh(); }
  if (a === 'fz'){ const q = srchFold(SR.ph.q), i = q.indexOf(el.dataset.from); SR.ph.q = i >= 0 ? SR.ph.q.slice(0, i) + el.dataset.to + SR.ph.q.slice(i + el.dataset.from.length) : el.dataset.to; const inp = document.getElementById('sr-ph-q'); if (inp) inp.value = SR.ph.q; return srPhRefresh(); }
  if (a === 'more'){ SR.ph.limit += 40; return srPhRefresh(); }
  if (a === 'mic') return srPhVoice();
});
document.addEventListener('input', (e) => { if (srPh() && e.target && e.target.id === 'sr-ph-q'){ SR.ph.q = e.target.value; SR.ph.limit = 40; srPhRefresh(); } });
document.addEventListener('submit', (e) => {
  const f = e.target; if (!srPh() || !f || !f.dataset || f.dataset.sr !== 'form') return;
  e.preventDefault(); e.stopImmediatePropagation();
  srAddRecent(SR.ph.q); const i = document.getElementById('sr-ph-q'); if (i) i.blur();
  const r = srPhRun(); if (r && r.total === 1) srPhGo(r.list[0].id);
}, true);
window.addEventListener('popstate', () => {
  if (!srPh() || !SC.user) return;
  if (location.hash === '#cerca'){ SR.ph.from = 'search'; SC.via = ''; return srPhShow(false); }
  SC.via = SR.ph.from === 'search' && SC.view === 'search' ? SC.via : '';
  if (SC.view === 'search') SR.ph.from = '';
  SC.params = scParams(); scRoute();
});

/* ---------------- install, help topic + tour ---------------- */
srInstallDesktop();
srInstallPhone();
if (typeof SC !== 'undefined' && !('via' in SC)) SC.via = '';   // how the next binder read was reached: '' | 'search' | 'nfc' (stream C) → access_log via
document.addEventListener('DOMContentLoaded', () => {
  srInstallDesktop();
  if (typeof ACTIONS !== 'undefined') Object.assign(ACTIONS, SR_ACTIONS);
  if (typeof HELP_TOPICS === 'undefined') return;
  HELP_TOPICS.push({ id:'search', guide:'search', tags:['archive'], acts:['how', 'find'], pop:70, related:['remember', 'access', 'mobile'],
    title:{it:'Come cerco un faldone (operatori, filtri, ricerche salvate)', en:'How do I find a binder (operators, filters, saved searches)'},
    body:{it:'<p>La casella di ricerca dell\'<b>Archivio</b> capisce quasi tutto: codice parlante (<span class="kbd">BL1</span>), Codice Multi, codice corto o URL del QR letto da un lettore, cliente, città, tag, categoria, anno, contenuti, posizione e (se vuoi) note e contatti. Non servono accenti né maiuscole, e un errore di battitura viene corretto (<b>Forse cercavi</b>).</p><ul>' +
        '<li><b>Operatori</b>, anche insieme: <span class="kbd">tag:iva</span> <span class="kbd">anno:2024</span> (<span class="kbd">anno:2020..2024</span>, <span class="kbd">anno:&gt;2022</span>) <span class="kbd">cat:APS</span> <span class="kbd">luogo:B04</span> <span class="kbd">stato:fuori</span> <span class="kbd">cliente:rossi</span> <span class="kbd">colore:rosso</span>; un meno davanti esclude: <span class="kbd">-tag:2019</span>. Ogni operatore attivo diventa un\'etichetta con la ✕ per toglierlo.</li>' +
        '<li><b>Filtri</b> apre i gruppi (tag, categoria, anno, posizione, colore, stato…) con il numero di faldoni: puoi sceglierne più di uno; i numeri dicono quanti ne troveresti.</li>' +
        '<li><b>Salva ricerca</b> le dà un nome: la ritrovi in <b>Ricerche salvate</b> sopra l\'elenco e, con la sincronizzazione, sugli altri dispositivi. Le <b>Recenti</b> restano solo su questo dispositivo.</li>' +
        '<li>Sul <b>telefono</b> tocca <b>Cerca</b> in alto (o «Cerca un faldone» nella pagina iniziale): campo grande, dettatura a voce se il telefono la offre, suggerimenti rapidi («Fuori archivio», tag frequenti, ricerche recenti) e schede grandi da toccare. Funziona anche senza rete con i dati salvati sul telefono.</li></ul>',
      en:'<p>The <b>Archive</b> search box understands almost everything: speaking code (<span class="kbd">BL1</span>), Multi code, short code or QR URL read by a scanner, client, city, tags, category, year, contents, location and (if you want) notes and contacts. No accents or capitals needed, and a typo is corrected (<b>Did you mean</b>).</p><ul>' +
        '<li><b>Operators</b>, also together: <span class="kbd">tag:vat</span> <span class="kbd">year:2024</span> (<span class="kbd">year:2020..2024</span>, <span class="kbd">year:&gt;2022</span>) <span class="kbd">cat:APS</span> <span class="kbd">loc:B04</span> <span class="kbd">state:out</span> <span class="kbd">client:rossi</span> <span class="kbd">colour:red</span>; a minus in front excludes: <span class="kbd">-tag:2019</span>. Every active operator becomes a chip with a ✕ to remove it.</li>' +
        '<li><b>Filters</b> opens the groups (tag, category, year, location, colour, state…) with the number of binders: pick more than one; the numbers say how many you would get.</li>' +
        '<li><b>Save search</b> gives it a name: find it in <b>Saved searches</b> above the list and, with sync, on the other devices. <b>Recent</b> searches stay on this device only.</li>' +
        '<li>On the <b>phone</b> tap <b>Search</b> at the top (or «Find a binder» on the home page): big field, voice dictation where the phone offers it, quick suggestions («Checked out», frequent tags, recent searches) and big cards to tap. It also works without network from the data saved on the phone.</li></ul>'} });
  if (typeof GUIDES !== 'undefined' && typeof navStep === 'function') GUIDES.search = { pop:64, title:{it:'Cerca con operatori, filtri e ricerche salvate', en:'Search with operators, filters and saved searches'}, steps:[
    navStep('archive', {it:'Apri l\'Archivio', en:'Open the Archive'}, {it:'Clicca "Archivio" nella barra in alto.', en:'Click "Archive" in the top bar.'}),
    { target:() => { const i = srSearchInput(); return i && i.closest('.search'); }, title:{it:'Una casella per tutto', en:'One box for everything'}, text:{it:'Scrivi codice, cliente, tag, anno o posizione. Puoi usare operatori come tag:iva anno:2024 oppure escludere con -tag:2019.', en:'Type code, client, tag, year or location. You can use operators like tag:vat year:2024 or exclude with -tag:2019.'} },
    { target:'#sr-filters-btn', title:{it:'Filtri', en:'Filters'}, text:{it:'"Filtri" apre i gruppi con i conteggi: tag, categoria, anno, posizione, colore, stato. Puoi sceglierne più di uno.', en:'"Filters" opens the groups with counts: tag, category, year, location, colour, state. Pick more than one.'} },
    { target:'#sr-save-btn', title:{it:'Salva la ricerca', en:'Save the search'}, text:{it:'Dai un nome alla ricerca: comparirà tra le Ricerche salvate, anche sugli altri dispositivi sincronizzati.', en:'Name the search: it shows up among the Saved searches, also on the other synced devices.'} },
    { final:true, title:{it:'Pronto ✓', en:'Ready ✓'}, text:{it:'Sul telefono trovi la stessa ricerca nel pulsante "Cerca" in alto.', en:'On the phone the same search is behind the "Search" button at the top.'} }
  ]};
});
