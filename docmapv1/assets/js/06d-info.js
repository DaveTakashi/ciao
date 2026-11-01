/* =====================================================================
   DocMap 2026 — Informazioni hub: clients, tags, categories, years, places, Multi codes, extra codes, QR overview (stream A: navigation + information)

   1. Top navigation: three main tabs (Archivio, Stampa etichette, Informazioni) and a
      "Funzioni avanzate" menu (<details id="nav-more">) holding Importa, Esporta e Salva,
      Database, Genera con AI, Impostazioni. Menu items stay `.nav [data-a="nav"][data-v=…]`
      buttons, so guides target them as before (a target inside the closed menu opens it,
      see guideResolve/guideNext in 08-guide.js).
   2. View 'info' (old view key 'clients' is migrated to 'info') with sub-tabs (S.infoTab):
      clients · tags · category · year · place · multi · extra · qr.
      Value lists are derived live from the data, nothing new is stored for them:
        tags     binder.tags (comma separated, compared lowercase; "demo" is protected)
        category binder.category + client.category
        year     binder.ref_year + binder.contents_items[].year
        place    binder.company_city + clientPlace(client) ("City (PR)")
        multi    binder.multi_code + client.multi_code
        extra    binder.extra_codes (comma separated)
      Rename / merge (rename onto an existing value) / delete rewrite every binder and client
      that uses the value (undoPoint + undoToast, commit).
   3. New state (all inside S, so localStorage, workspace JSON and the SQLite settings JSON carry it):
        S.infoTab               current sub-tab (UI preference)
        S.settings.catColors    {categoryName: '#RRGGBB'} colour for NEW binders of a category
                                (overrides CAT_COLOR, which is kept in sync by infoApplyCatColors)
        S.settings.qrPreset     sheet preset used by "Ristampa QR" (default 'l7159', 24 per sheet)
        S.printPrev             print settings + print selection saved before a QR reprint
                                {presetId, geometry, geometryModified, contentMode, sel:[ids], at}
      Session only: UI.infoq (search), UI.qrq, UI.qrSel (Set of ids), UI.qrLimit, UI.fInfo
      (archive filter {id, key, label} set by clicking a usage count).
   4. Print: label kind 'Q' (QR + speaking code + short code, any slot size) and content mode 'qr'.
   ===================================================================== */
'use strict';

Object.assign(ICONS, {
  gear:'<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  book:'<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  tag:'<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1"/>',
  calendar:'<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  hash:'<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  layers:'<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  image:'<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  filter:'<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  external:'<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'
});

Object.assign(I18N.it, {
  nav_info:'Informazioni', nav_print_s:'Stampa', nav_info_s:'Info', nav_more:'Funzioni avanzate', nav_more_s:'Avanzate', nav_more_d:'Importa, esporta, database, AI e impostazioni',
  nm_data:'Dati', nm_tools:'Strumenti',
  nd_import:'CSV, JSON, elenco clienti', nd_export:'Backup, CSV, manifest qr7.it', nd_database:'SQLite locale e sessioni', nd_ai:'Prompt per ChatGPT, Claude, Gemini', nd_settings:'Studio, destinazione QR, dati',
  nav_in_menu:'Si trova nel menu ⚙ Funzioni avanzate in alto a destra.', qb_short:'Salva backup', st_dirty_s:'Da esportare', st_ok_s:'Esportato',
  in_h:'Informazioni', in_p:'Tutte le voci usate nei faldoni, in un posto solo. Rinomina o unisci una voce una volta e cambia ovunque: faldoni, clienti, stampa.',
  in_clients:'Clienti', in_tags:'Tag', in_category:'Categorie', in_year:'Anni', in_place:'Luoghi', in_multi:'Codici Multi', in_extra:'Codici extra', in_qr:'QR',
  in_d_tags:'I tag dei faldoni (minuscoli). Il tag "demo" segna i faldoni di esempio e non si modifica.',
  in_d_category:'Le categorie dei faldoni e dell\'anagrafica clienti. Ogni categoria ha una famiglia di colori: ogni cliente riceve una sua sfumatura.',
  in_d_year:'Gli anni di riferimento dei faldoni e gli anni scritti nei contenuti.',
  in_d_place:'Il luogo della ditta nei faldoni e la località dei clienti (es. "Parma (PR)").',
  in_d_multi:'I Codici Multi di faldoni e clienti. Rinominarne uno lo cambia anche sulle etichette da ristampare.',
  in_d_extra:'Protocolli, pratiche e altri codici scritti nei faldoni.',
  in_value:'Voce', in_binders:'Faldoni', in_clients_n:'Clienti', in_color:'Colore', in_search:'Cerca…', in_count:'{n} di {t} voci', in_empty:'Nessuna voce: compare appena un faldone la usa.', in_none:'Nessun risultato.',
  in_rename:'Rinomina', in_merge:'Unisci', in_n_binders:'{n} faldoni', in_n_binder:'1 faldone', in_n_clients:'{n} clienti',
  in_rename_t:'Rinomina "{v}"', in_rename_d:'Cambia {b}{c}. Se scegli una voce che esiste già, le due voci vengono unite.', in_and_clients:' e {n} clienti',
  in_new:'Nuovo nome', in_will_merge:'"{v}" esiste già ({n} faldoni): le due voci verranno unite.', in_same:'È lo stesso nome.',
  in_merge_t:'Unisci "{v}" in…', in_merge_d:'"{v}" sparisce e tutti i suoi faldoni{c} passano alla voce scelta.', in_merge_into:'Unisci in', in_merge_none:'Non ci sono altre voci con cui unire.',
  in_del_d:'Togliere "{v}" da {b}{c}? I faldoni restano, perde solo questa voce. Puoi annullare subito dopo.',
  in_renamed:'"{a}" → "{b}": aggiornati {n} faldoni{c}', in_merged:'"{a}" unita in "{b}": aggiornati {n} faldoni{c}', in_deleted:'"{v}" tolta da {n} faldoni{c}',
  in_demo:'esempi', in_demo_lock:'Il tag "demo" segna i faldoni di esempio: si gestisce dalla barra in Archivio.', in_empty_name:'Scrivi un nome.',
  in_filter:'Filtro', in_filter_off:'Togli filtro', in_back:'Torna a Informazioni', in_show:'Vedi i faldoni in Archivio',
  in_color_t:'Colore della categoria "{v}"', in_color_d:'Colore della barra sull\'etichetta per i faldoni di questa categoria. Con l\'assegnazione Per cliente ogni cliente riceve una sfumatura diversa della famiglia.', in_color_apply:'Applica anche ai {n} faldoni esistenti di questa categoria',
  in_color_reset:'Predefinito', in_color_custom:'Altro colore', in_color_saved:'Colore di "{v}" salvato', in_color_def:'predefinito', in_color_none:'Nessun colore: i nuovi faldoni usano il blu',
  qr_h_sel:'{n} selezionati', qr_sel_vis:'Seleziona tutti', qr_reprint:'Ristampa solo QR', qr_preset:'Foglio', qr_search:'Cerca codice, cliente, codice breve…',
  qr_dest:'Destinazione finale', qr_short:'Codice breve', qr_more:'Mostra altri {n}', qr_svg:'Scarica SVG', qr_png:'Scarica PNG', qr_none_sel:'Seleziona almeno un QR da ristampare.',
  qr_intro:'I QR di tutti i faldoni. Seleziona quelli rovinati o persi e premi "Ristampa solo QR": si apre la stampa con etichette piccole che hanno solo QR, codice parlante e codice breve.',
  qr_rp_toast:'Ristampa QR pronta: {n} etichette su "{p}". Le impostazioni di stampa precedenti sono salvate.', qr_rp_restore:'Ripristina',
  qr_bar:'Stai ristampando solo i QR ({n} faldoni). Le impostazioni precedenti (foglio "{p}", {s} faldoni in coda) sono salvate.', qr_bar_keep:'Tieni queste impostazioni', qr_restored:'Impostazioni di stampa ripristinate',
  cm_qr:'Solo QR (ristampa)', cm_qr_d:'Etichetta piccola con QR, codice parlante e codice breve: per sostituire un QR rovinato. Va bene su qualsiasi formato.',
  cl_prop:'Cliente salvato: aggiornati anche {n} faldoni collegati', cl_saved:'Cliente salvato: {n}'
});
Object.assign(I18N.en, {
  nav_info:'Information', nav_print_s:'Print', nav_info_s:'Info', nav_more:'Advanced tools', nav_more_s:'Advanced', nav_more_d:'Import, export, database, AI and settings',
  nm_data:'Data', nm_tools:'Tools',
  nd_import:'CSV, JSON, client list', nd_export:'Backup, CSV, qr7.it manifest', nd_database:'Local SQLite and sessions', nd_ai:'Prompt for ChatGPT, Claude, Gemini', nd_settings:'Studio, QR destination, data',
  nav_in_menu:'It is in the ⚙ Advanced tools menu at the top right.', qb_short:'Save backup', st_dirty_s:'Not exported', st_ok_s:'Exported',
  in_h:'Information', in_p:'Every value used in your binders, in one place. Rename or merge a value once and it changes everywhere: binders, clients, printing.',
  in_clients:'Clients', in_tags:'Tags', in_category:'Categories', in_year:'Years', in_place:'Places', in_multi:'Multi codes', in_extra:'Extra codes', in_qr:'QR',
  in_d_tags:'Binder tags (lowercase). The "demo" tag marks the sample binders and cannot be edited.',
  in_d_category:'Categories of binders and of the client register. Each category has a colour family: each client gets its own shade.',
  in_d_year:'Reference years of binders and the years written in their contents.',
  in_d_place:'Company place in binders and client towns (e.g. "Parma (PR)").',
  in_d_multi:'Multi codes of binders and clients. Renaming one also changes it on labels you reprint.',
  in_d_extra:'Protocols, case numbers and other codes written in binders.',
  in_value:'Value', in_binders:'Binders', in_clients_n:'Clients', in_color:'Colour', in_search:'Search…', in_count:'{n} of {t} values', in_empty:'No values yet: they appear as soon as a binder uses one.', in_none:'No results.',
  in_rename:'Rename', in_merge:'Merge', in_n_binders:'{n} binders', in_n_binder:'1 binder', in_n_clients:'{n} clients',
  in_rename_t:'Rename "{v}"', in_rename_d:'Changes {b}{c}. If you pick a value that already exists, the two values are merged.', in_and_clients:' and {n} clients',
  in_new:'New name', in_will_merge:'"{v}" already exists ({n} binders): the two values will be merged.', in_same:'Same name.',
  in_merge_t:'Merge "{v}" into…', in_merge_d:'"{v}" disappears and all its binders{c} move to the chosen value.', in_merge_into:'Merge into', in_merge_none:'There are no other values to merge with.',
  in_del_d:'Remove "{v}" from {b}{c}? The binders stay, they only lose this value. You can undo right after.',
  in_renamed:'"{a}" → "{b}": {n} binders updated{c}', in_merged:'"{a}" merged into "{b}": {n} binders updated{c}', in_deleted:'"{v}" removed from {n} binders{c}',
  in_demo:'samples', in_demo_lock:'The "demo" tag marks the sample binders: manage it from the bar in the Archive.', in_empty_name:'Type a name.',
  in_filter:'Filter', in_filter_off:'Clear filter', in_back:'Back to Information', in_show:'Show the binders in the Archive',
  in_color_t:'Colour of category "{v}"', in_color_d:'Colour bar on the label for the binders of this category. With the By client assignment each client gets a different shade of the family.', in_color_apply:'Also apply to the {n} existing binders of this category',
  in_color_reset:'Default', in_color_custom:'Other colour', in_color_saved:'Colour of "{v}" saved', in_color_def:'default', in_color_none:'No colour: new binders use blue',
  qr_h_sel:'{n} selected', qr_sel_vis:'Select all', qr_reprint:'Reprint QR only', qr_preset:'Sheet', qr_search:'Search code, client, short code…',
  qr_dest:'Final destination', qr_short:'Short code', qr_more:'Show {n} more', qr_svg:'Download SVG', qr_png:'Download PNG', qr_none_sel:'Select at least one QR to reprint.',
  qr_intro:'The QR codes of all binders. Select the damaged or lost ones and press "Reprint QR only": printing opens with small labels holding only the QR, speaking code and short code.',
  qr_rp_toast:'QR reprint ready: {n} labels on "{p}". Your previous print settings are saved.', qr_rp_restore:'Restore',
  qr_bar:'You are reprinting QR codes only ({n} binders). Your previous settings (sheet "{p}", {s} binders queued) are saved.', qr_bar_keep:'Keep these settings', qr_restored:'Print settings restored',
  cm_qr:'QR only (reprint)', cm_qr_d:'Small label with QR, speaking code and short code: to replace a damaged QR. Fits any format.',
  cl_prop:'Client saved: {n} linked binders updated too', cl_saved:'Client saved: {n}'
});

/* ---------------- Navigation ---------------- */
const NAV_MAIN = [['archive','archive','nav_archive','nav_archive'], ['print','printer','nav_print','nav_print_s'], ['info','book','nav_info','nav_info_s']];
const NAV_MORE = [
  ['nm_data', [['import','upload','nav_import','nd_import'], ['export','download','nav_export','nd_export'], ['database','database','nav_database','nd_database'], ['log','history','nav_log','nd_log']]],
  ['nm_tools', [['ai','sparkles','nav_ai','nd_ai'], ['settings','sliders','nav_settings','nd_settings']]]
];
const ADV_VIEWS = NAV_MORE.reduce((a, g) => a.concat(g[1].map(x => x[0])), []);
/* Guide texts of steps that open an advanced view mention where the menu is (used by navStep in 08-guide.js). */
function navStepText(view, text){
  if (!ADV_VIEWS.includes(view) || !text) return text;
  return {it:text.it + ' ' + I18N.it.nav_in_menu, en:text.en + ' ' + I18N.en.nav_in_menu};
}
function topbarHTML(){
  const v = S.view, adv = NAV_MORE.reduce((a, g) => a.concat(g[1]), []).find(x => x[0] === v);
  const dirty = S.hasUnexportedChanges;
  const main = NAV_MAIN.map(([k, i, l, s]) => '<button data-a="nav" data-v="' + k + '" class="' + (v === k ? 'on' : '') + '"' + (v === k ? ' aria-current="page"' : '') + '>' + ic(i) + '<span class="nl">' + esc(t(l)) + '</span><span class="ns">' + esc(t(s)) + '</span></button>').join('');
  const menu = NAV_MORE.map(([g, items]) => '<div class="nm-h" role="presentation">' + esc(t(g)) + '</div>' +
    items.map(([k, i, l, d]) => '<button type="button" role="menuitem" data-a="nav" data-v="' + k + '" class="nm-item' + (v === k ? ' on' : '') + '"' + (v === k ? ' aria-current="page"' : '') + '><span class="nm-ic">' + ic(i) + '</span><span class="nm-tx"><b>' + esc(t(l)) + '</b><small>' + esc(t(d)) + '</small></span>' + (v === k ? ic('check') : '') + '</button>').join('')).join('');
  return '<div class="brand"><div class="brand-mark">DM26</div><div class="brand-tx"><div class="brand-t">DocMap 2026</div><div class="brand-s">' + esc(t('brand_s')) + '</div></div></div>' +
    '<nav class="nav" aria-label="Main"><div class="nav-main">' + main + '</div>' +
      '<details class="nav-more' + (adv ? ' on' : '') + '" id="nav-more"><summary class="nav-more-btn" aria-haspopup="menu" aria-expanded="false" title="' + esc(t('nav_more') + ' — ' + t('nav_more_d')) + '">' + ic('gear') + '<span class="nm-l">' + esc(adv ? t(adv[2]) : t('nav_more')) + '</span><span class="nm-s">' + esc(adv ? t(adv[2]) : t('nav_more_s')) + '</span>' + ic('chevron', 'nm-chev') + '</summary>' +
      '<div class="nav-menu" role="menu" aria-label="' + esc(t('nav_more')) + '">' + menu + '</div></details></nav>' +
    '<div class="top-right">' +
      (dirty ? '<div class="savebox"><span class="status warn" title="' + esc(t('st_dirty')) + '"><span class="dot"></span><span class="sb-t">' + esc(t('st_dirty_s')) + '</span></span><button class="sb-btn" data-a="quick-backup" title="' + esc(t('quick_backup')) + ' (Ctrl+S)">' + ic('save') + '<span class="sb-l">' + esc(t('qb_short')) + '</span></button></div>'
             : '<div class="savebox ok"><span class="status ok" title="' + esc(t('st_ok') + (S.lastExportFile ? ' — ' + S.lastExportFile : '')) + '"><span class="dot"></span><span class="sb-t">' + esc(t('st_ok_s')) + '</span></span></div>') +
      '<button class="help-btn" data-a="help-open" title="' + esc(t('help')) + ' (F1)" aria-label="' + esc(t('help')) + '">?</button>' +
      '<div class="lang" role="group" aria-label="Language"><button data-a="lang" data-l="it" class="' + (S.lang === 'it' ? 'on' : '') + '">IT</button><button data-a="lang" data-l="en" class="' + (S.lang === 'en' ? 'on' : '') + '">EN</button></div>' +
    '</div>';
}
/* Menu behaviour: closes on outside click (not on clicks inside the guide card), on Esc and when focus leaves it;
   arrow keys move between items. */
const navMenu = () => $('#nav-more');
function navMenuClose(focusBtn){ const d = navMenu(); if (d && d.open){ d.open = false; if (focusBtn) $('summary', d).focus(); } }
document.addEventListener('click', (e) => {
  const d = navMenu(); if (!d || !d.open) return;
  if (d.contains(e.target) || (e.target.closest && e.target.closest('#guide-root'))) return;
  d.open = false;
});
document.addEventListener('toggle', (e) => {
  if (e.target && e.target.id === 'nav-more'){ const s = $('summary', e.target); if (s) s.setAttribute('aria-expanded', e.target.open ? 'true' : 'false'); }
}, true);
document.addEventListener('keydown', (e) => {
  const d = navMenu(); if (!d || !d.contains(e.target)) return;
  const items = $$('.nm-item', d), i = items.indexOf(document.activeElement);
  if (e.key === 'Escape' && d.open){ e.preventDefault(); e.stopPropagation(); navMenuClose(true); return; }
  if (['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
    e.preventDefault();
    if (!d.open) d.open = true;
    const n = items.length, j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : e.key === 'ArrowDown' ? (i + 1) % n : (i <= 0 ? n - 1 : i - 1);
    items[j].focus();
  }
}, true);
document.addEventListener('focusout', (e) => {
  const d = navMenu(); if (!d || !d.open || !d.contains(e.target)) return;
  if (e.relatedTarget && !d.contains(e.relatedTarget)) d.open = false;
});

/* ---------------- Category colours ---------------- */
const CAT_COLOR_DEFAULT = Object.assign({}, CAT_COLOR);
/* CAT_COLOR (02-core) is what the binder form uses for new binders: keep it = defaults + the user's choices. */
function infoApplyCatColors(){
  if (!S || !S.settings) return;
  Object.keys(CAT_COLOR).forEach(k => delete CAT_COLOR[k]);
  Object.assign(CAT_COLOR, CAT_COLOR_DEFAULT);
  // v10: a category with a chosen colour family (02b-colors.js) uses the family's first shade, unless it has its own colour
  const fams = S.settings.catFamilies || {};
  Object.keys(fams).forEach(k => { if (COLOR_FAMILY[fams[k]]) CAT_COLOR[k] = COLOR_FAMILY[fams[k]].shades[0]; });
  Object.assign(CAT_COLOR, S.settings.catColors || {});
}

/* ---------------- Value lists ---------------- */
/* kind: csv = comma separated field, single = one value per binder, year = ref_year + contents years.
   client: how the value appears in a client of the register (null = not in clients). */
const INFO_LISTS = {
  tags:     {icon:'tag', kind:'csv', field:'tags', lower:true, joiner:',', client:null},
  category: {icon:'layers', kind:'single', field:'category', client:'category'},
  year:     {icon:'calendar', kind:'year', client:null},
  place:    {icon:'pin', kind:'single', field:'company_city', client:'place'},
  multi:    {icon:'hash', kind:'single', field:'multi_code', client:'multi_code', mono:true},
  extra:    {icon:'braces', kind:'csv', field:'extra_codes', joiner:', ', client:null, mono:true}
};
const INFO_TABS = [['clients','users'], ['tags','tag'], ['category','layers'], ['year','calendar'], ['place','pin'], ['multi','hash'], ['extra','braces'], ['qr','qr']];
const infoKey = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();
const splitCsv = (s) => String(s || '').split(',').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
const infoProtected = (id, key) => id === 'tags' && key === DEMO_TAG;
function binderVals(id, b){
  const L = INFO_LISTS[id];
  if (L.kind === 'csv') return splitCsv(b[L.field]).map(v => L.lower ? v.toLowerCase() : v);
  if (L.kind === 'year') return [b.ref_year].concat((b.contents_items || []).map(i => i.year)).map(v => String(v || '').trim()).filter(Boolean);
  const v = String(b[L.field] || '').trim(); return v ? [v] : [];
}
function clientVals(id, c){
  const L = INFO_LISTS[id]; if (!L.client) return [];
  const v = L.client === 'place' ? clientPlace(c) : String(c[L.client] || '').trim();
  return v ? [v] : [];
}
/* Every value of a list: key → {key, value (most used spelling), nB, nC}. Counts respect "hide samples" like the Archive. */
function infoCollect(id){
  const m = new Map(), spell = {};
  const add = (v, isB) => {
    const k = infoKey(v); if (!k) return;
    let e = m.get(k); if (!e){ e = {key:k, value:v, nB:0, nC:0}; m.set(k, e); spell[k] = {}; }
    spell[k][v] = (spell[k][v] || 0) + 1;
    if (isB) e.nB++; else e.nC++;
  };
  S.binders.forEach(b => {
    if (S.settings.hideDemo && isDemo(b)) return;
    const seen = new Set();   // a binder counts once per value (e.g. the same year in ref_year and contents)
    binderVals(id, b).forEach(v => { const k = infoKey(v); if (!seen.has(k)){ seen.add(k); add(v, true); } });
  });
  (S.clients || []).forEach(c => clientVals(id, c).forEach(v => add(v, false)));
  m.forEach((e, k) => { const s = spell[k]; e.value = Object.keys(s).sort((a, b) => s[b] - s[a] || naturalCmp(a, b))[0]; });
  return Array.from(m.values()).sort((a, b) => (b.nB - a.nB) || (b.nC - a.nC) || naturalCmp(a.value, b.value));
}
/* Rewrite the values of a binder: fn(value) returns the new value, '' to remove it. Returns true when something changed. */
function mapBinderVals(id, b, fn){
  const L = INFO_LISTS[id];
  if (L.kind === 'csv'){
    const vals = binderVals(id, b), seen = new Set(), out = [];
    let ch = false;
    vals.forEach(v => { const n = fn(v); if (n !== v) ch = true; const k = infoKey(n); if (k && !seen.has(k)){ seen.add(k); out.push(n); } });
    if (!ch) return false;   // untouched binders keep their exact text
    b[L.field] = out.join(L.joiner); return true;
  }
  if (L.kind === 'year'){
    let ch = false;
    const ry = String(b.ref_year || '').trim(); if (ry){ const n = fn(ry); if (n !== ry){ b.ref_year = n; ch = true; } }
    (b.contents_items || []).forEach(it => { const y = String(it.year || '').trim(); if (y){ const n = fn(y); if (n !== y){ it.year = n; ch = true; } } });
    return ch;
  }
  const v = String(b[L.field] || '').trim(); if (!v) return false;
  const n = fn(v); if (n === v) return false;
  b[L.field] = n; return true;
}
function mapClientVals(id, c, fn){
  const L = INFO_LISTS[id]; if (!L.client) return false;
  if (L.client === 'place'){
    const v = clientPlace(c); if (!v) return false;
    const n = fn(v); if (n === v) return false;
    const m = String(n).match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    c.city = m ? m[1].trim() : String(n).trim(); c.province = m ? m[2].trim() : '';
    return true;
  }
  const v = String(c[L.client] || '').trim(); if (!v) return false;
  const n = fn(v); if (n === v) return false;
  c[L.client] = n; return true;
}
/* Apply fn to every binder and client of the list. */
function infoRewrite(id, fn){
  let nb = 0, nc = 0;
  S.binders.forEach(b => { if (mapBinderVals(id, b, fn)){ b.updated_at = nowISO(); nb++; } });
  (S.clients || []).forEach(c => { if (mapClientVals(id, c, fn)) nc++; });
  return {nb, nc};
}
function cleanValue(id, v){
  let s = String(v || '').replace(/\s+/g, ' ').trim();
  if (INFO_LISTS[id].kind === 'csv') s = s.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  if (INFO_LISTS[id].lower) s = s.toLowerCase();
  return s;
}
/** Rename (or merge, when newVal matches an existing value) everywhere. Returns {nb, nc, merged}. */
function infoRename(id, key, newVal){
  const nv = cleanValue(id, newVal);
  if (!nv || infoProtected(id, key) || infoProtected(id, infoKey(nv))) return null;
  const merged = infoKey(nv) !== key && infoCollect(id).some(e => e.key === infoKey(nv));
  // a merge adopts the spelling of the value that already exists
  const target = merged ? infoCollect(id).find(e => e.key === infoKey(nv)).value : nv;
  const r = infoRewrite(id, (v) => infoKey(v) === key ? target : v);
  if (id === 'category' && S.settings.catColors){
    const cc = S.settings.catColors, old = Object.keys(cc).find(k => infoKey(k) === key);
    if (old && old !== target){ if (!Object.keys(cc).some(k => infoKey(k) === infoKey(target))) cc[target] = cc[old]; delete cc[old]; }
  }
  if (id === 'category' && S.settings.catFamilies){   // v10 colour family follows the rename (02b-colors.js)
    const cf = S.settings.catFamilies, old = Object.keys(cf).find(k => infoKey(k) === key);
    if (old && old !== target){ if (!Object.keys(cf).some(k => infoKey(k) === infoKey(target))) cf[target] = cf[old]; delete cf[old]; }
  }
  return Object.assign(r, {merged, target});
}
function infoDelete(id, key){
  if (infoProtected(id, key)) return null;
  const r = infoRewrite(id, (v) => infoKey(v) === key ? '' : v);
  if (id === 'category' && S.settings.catColors) Object.keys(S.settings.catColors).forEach(k => { if (infoKey(k) === key) delete S.settings.catColors[k]; });
  if (id === 'category' && S.settings.catFamilies) Object.keys(S.settings.catFamilies).forEach(k => { if (infoKey(k) === key) delete S.settings.catFamilies[k]; });
  return r;
}
/* Archive filter set from a usage count. */
function infoMatch(b, f){
  if (!f) return true;
  if (f.id === 'client'){ const c = (S.clients || []).find(x => x.id === f.key); return !!c && ((c.multi_code && b.multi_code === c.multi_code) || infoKey(b.company_name) === infoKey(c.name)); }
  if (!INFO_LISTS[f.id]) return true;
  return binderVals(f.id, b).some(v => infoKey(v) === f.key);
}
function infoFilterBarHTML(){
  const f = UI.fInfo; if (!f) return '';
  return '<div class="ifilter">' + ic('filter') + '<span>' + esc(t('in_filter')) + ': <b>' + esc(f.label) + '</b></span><span style="flex:1"></span>' +
    '<button class="btn btn-sm" data-a="info-back">' + ic('book') + esc(t('in_back')) + '</button><button class="btn btn-sm" data-a="info-unfilter">' + ic('x') + esc(t('in_filter_off')) + '</button></div>';
}
const nBinders = (n) => n === 1 ? t('in_n_binder') : t('in_n_binders', {n});
const andClients = (n) => n ? t('in_and_clients', {n}) : '';

/* ---------------- View ---------------- */
function infoTab(){ const k = S.infoTab; return INFO_TABS.some(x => x[0] === k) ? k : 'clients'; }
function infoTabCount(k){
  if (k === 'clients') return (S.clients || []).length;
  if (k === 'qr') return qrBinders().length;
  return infoCollect(k).length;
}
function viewInfo(){
  const tab = infoTab();
  return '<div class="page-h"><div><h1>' + esc(t('in_h')) + helpDot('info') + '</h1><p>' + esc(t('in_p')) + '</p></div></div>' +
    '<div class="info-tabs-wrap"><div class="info-tabs" role="tablist" aria-label="' + esc(t('in_h')) + '">' +
      INFO_TABS.map(([k, i]) => '<button role="tab" aria-selected="' + (k === tab) + '" data-a="info-tab" data-v="' + k + '" class="' + (k === tab ? 'on' : '') + '">' + ic(i) + '<span>' + esc(t('in_' + k)) + '</span><span class="it-n">' + infoTabCount(k) + '</span></button>').join('') +
    '</div></div>' +
    '<div class="card info-panel" id="info-panel" role="tabpanel">' + infoPanelHTML(tab) + '</div>';
}
function infoPanelHTML(tab){
  if (tab === 'clients') return clientsPanelHTML();
  if (tab === 'qr') return qrPanelHTML();
  return '<div class="toolbar"><div class="search">' + ic('search') + '<input class="inp" type="search" data-bind="infoq" value="' + esc(UI.infoq || '') + '" placeholder="' + esc(t('in_search')) + '" aria-label="search"></div><span class="small muted" id="info-count"></span></div>' +
    '<div class="info-intro">' + ic(INFO_LISTS[tab].icon) + '<span>' + esc(t('in_d_' + tab)) + '</span></div><div id="info-results"></div>';
}
function mountInfo(){
  const tab = infoTab();
  if (tab === 'clients') renderClientResults();
  else if (tab === 'qr') renderQrResults();
  else renderInfoResults();
}
function renderInfoResults(){
  const box = $('#info-results'); if (!box) return;
  const id = infoTab(), L = INFO_LISTS[id]; if (!L) return;
  const all = infoCollect(id), q = infoKey(UI.infoq);
  const rows = all.filter(e => !q || e.key.indexOf(q) >= 0);
  const c0 = $('#info-count'); if (c0) c0.textContent = all.length ? t('in_count', {n:rows.length, t:all.length}) : '';
  if (!all.length){ box.innerHTML = '<div class="empty">' + ic(L.icon, 'lg') + '<p>' + esc(t('in_empty')) + '</p></div>'; return; }
  if (!rows.length){ box.innerHTML = '<div class="empty">' + esc(t('in_none')) + '</div>'; return; }
  const max = Math.max.apply(null, all.map(e => e.nB)) || 1, hasC = !!L.client, isCat = id === 'category';
  const cc = S.settings.catColors || {};
  box.innerHTML = '<div class="tbl-wrap"><table class="tbl info-tbl"><thead><tr><th>' + esc(t('in_value')) + '</th><th>' + esc(t('in_binders')) + '</th>' + (hasC ? '<th class="hide-sm">' + esc(t('in_clients_n')) + '</th>' : '') + (isCat ? '<th>' + esc(t('in_color')) + '</th>' : '') + '<th></th></tr></thead><tbody>' +
    rows.slice(0, 600).map(e => {
      const lock = infoProtected(id, e.key), k = esc(e.key);
      const val = id === 'tags' ? '<span class="tagpill' + (lock ? ' demo' : '') + '">' + esc(e.value) + '</span>' + (lock ? ' <span class="badge b-historical" title="' + esc(t('in_demo_lock')) + '">' + esc(t('in_demo')) + '</span>' : '')
        : '<span class="iv' + (L.mono ? ' mono' : '') + '">' + esc(e.value) + '</span>';
      const cnt = e.nB ? '<button class="cnt-btn" data-a="info-filter" data-l="' + id + '" data-k="' + k + '" title="' + esc(t('in_show')) + '"><span class="cnt-bar"><span style="width:' + Math.max(4, Math.round(e.nB / max * 100)) + '%"></span></span><b>' + e.nB + '</b>' + ic('arrowRight') + '</button>' : '<span class="muted small">0</span>';
      const col = isCat ? (() => { const hex = colorCategoryHex(e.value), fid = colorFamilyId(e.value); return '<td><button class="swatch-btn" data-a="info-color" data-k="' + k + '" title="' + esc(t('in_color_t', {v:e.value}) + ' — ' + t('co_family_of', {f:colorFamilyName(fid)})) + '"><span class="sw-dot" style="background:' + esc(hex) + '"></span>' + colorStrip(fid, {shades:colorShades(e.value)}) + '<span class="mono small hide-sm">' + esc(hex) + '</span></button></td>'; })() : '';   // family strip: 02b-colors.js
      return '<tr><td>' + val + '</td><td>' + cnt + '</td>' + (hasC ? '<td class="hide-sm">' + (e.nC ? '<span class="mono">' + e.nC + '</span>' : '<span class="muted small">0</span>') + '</td>' : '') + col +
        '<td class="acts">' + (lock ? '' : '<button class="btn btn-sm btn-ghost" data-a="info-rename" data-l="' + id + '" data-k="' + k + '">' + ic('pencil') + '<span class="hide-sm">' + esc(t('in_rename')) + '</span></button><button class="btn btn-sm btn-ghost" data-a="info-merge" data-l="' + id + '" data-k="' + k + '"' + (all.length < 2 ? ' disabled' : '') + '>' + ic('merge') + '<span class="hide-sm">' + esc(t('in_merge')) + '</span></button><button class="icon-btn danger" data-a="info-del" data-l="' + id + '" data-k="' + k + '" title="' + esc(t('act_del')) + '" aria-label="' + esc(t('act_del')) + '">' + ic('trash') + '</button>') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}
function infoEntry(id, key){ return infoCollect(id).find(e => e.key === key); }
function infoDone(r, msgKey, vars){
  commit(); renderView();
  undoToast(t(msgKey, Object.assign({n:r.nb, c:r.nc ? ' · ' + t('in_n_clients', {n:r.nc}) : ''}, vars)));
}
function openInfoRename(id, key){
  const e = infoEntry(id, key); if (!e || infoProtected(id, key)) return;
  const others = infoCollect(id).filter(x => x.key !== key);
  openModal({ title:t('in_rename_t', {v:e.value}),
    body:'<p class="small muted" style="margin-top:0">' + esc(t('in_rename_d', {b:nBinders(e.nB), c:andClients(e.nC)})) + '</p><div class="field"><label for="info-new">' + esc(t('in_new')) + '</label><input class="inp' + (INFO_LISTS[id].mono ? ' mono' : '') + '" id="info-new" list="info-dl" value="' + esc(e.value) + '" autocomplete="off" data-l="' + id + '" data-k="' + esc(key) + '"><datalist id="info-dl">' + others.map(x => '<option value="' + esc(x.value) + '">').join('') + '</datalist></div><div class="info-hint small" id="info-new-hint"></div>',
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('in_rename'), cls:'btn btn-primary', icon:'check', fn: () => {
      const nv = cleanValue(id, $('#info-new').value);
      if (!nv){ toast(t('in_empty_name'), 'err'); return; }
      if (nv === e.value){ closeModal(true); return; }
      undoPoint();
      const r = infoRename(id, key, nv); closeModal(true); if (!r) return;
      infoDone(r, r.merged ? 'in_merged' : 'in_renamed', {a:e.value, b:r.target});
    }}],
    onMount: (ov) => { const i = $('#info-new', ov); setTimeout(() => { i.select(); }, 40); infoRenameHint(i); } });
}
function infoRenameHint(inp){
  const h = $('#info-new-hint'); if (!h || !inp) return;
  const id = inp.dataset.l, key = inp.dataset.k, nv = cleanValue(id, inp.value), k = infoKey(nv);
  const ex = k && k !== key ? infoEntry(id, k) : null;
  h.innerHTML = ex ? '<div class="warn-box small">' + ic('merge') + '<div>' + esc(t('in_will_merge', {v:ex.value, n:ex.nB})) + '</div></div>' : '';
}
function openInfoMerge(id, key){
  const e = infoEntry(id, key); if (!e || infoProtected(id, key)) return;
  const others = infoCollect(id).filter(x => x.key !== key && !infoProtected(id, x.key));
  if (!others.length){ toast(t('in_merge_none'), 'warn'); return; }
  openModal({ title:t('in_merge_t', {v:e.value}),
    body:'<p class="small muted" style="margin-top:0">' + esc(t('in_merge_d', {v:e.value, c:andClients(e.nC)})) + '</p><div class="field"><label for="info-into">' + esc(t('in_merge_into')) + '</label><select class="inp" id="info-into">' + others.map(x => '<option value="' + esc(x.key) + '">' + esc(x.value) + ' — ' + esc(nBinders(x.nB)) + '</option>').join('') + '</select></div>',
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('in_merge'), cls:'btn btn-primary', icon:'merge', fn: () => {
      const into = infoEntry(id, $('#info-into').value); if (!into) return;
      undoPoint();
      const r = infoRename(id, key, into.value); closeModal(true); if (!r) return;
      infoDone(r, 'in_merged', {a:e.value, b:r.target});
    }}] });
}
function askInfoDelete(id, key){
  const e = infoEntry(id, key); if (!e || infoProtected(id, key)) return;
  confirmAction({ danger:true, plain:true, okLabel:t('delete'), detail:t('in_del_d', {v:e.value, b:nBinders(e.nB), c:andClients(e.nC)}), onOk: () => {
    undoPoint();
    const r = infoDelete(id, key); if (!r) return;
    if (UI.fInfo && UI.fInfo.id === id && UI.fInfo.key === key) UI.fInfo = null;
    infoDone(r, 'in_deleted', {v:e.value});
  } });
}
/* Category colour dialog (v10): colour family (02b-colors.js) + the category's own colour + optional recolour.
   Stored: S.settings.catFamilies[cat] when a family is picked (or was already chosen), S.settings.catColors[cat]
   only when the colour differs from what the category gets without it (the family's first shade / v9 default). */
function openCatColor(key){
  const e = infoEntry('category', key); if (!e) return;
  const cc = S.settings.catColors || {}, own = Object.keys(cc).find(x => infoKey(x) === key);
  const cf = S.settings.catFamilies || {}, ownF = Object.keys(cf).find(x => infoKey(x) === key);
  const M = UI.coCat = { fam:colorFamilyId(e.value), famSet:!!ownF, cur:colorCategoryHex(e.value) };
  const famHTML = () => COLOR_FAMILIES.map(f => '<button type="button" class="co-fambtn' + (f.id === M.fam ? ' on' : '') + '" data-a="co-fam" data-f="' + f.id + '" aria-pressed="' + (f.id === M.fam) + '"><span>' + esc(colorFamilyName(f.id)) + '</span>' + colorStrip(f.id) + '</button>').join('');
  const sw = () => Array.from(new Set(COLOR_FAMILY[M.fam].shades.concat(COLORS, SHELF_COLORS))).map(c => '<button type="button" class="sw' + (c === M.cur ? ' on' : '') + '" data-a="info-sw" data-c="' + c + '" style="background:' + c + '" aria-label="' + c + '"></button>').join('');
  M.pickFamily = (id) => {
    if (!COLOR_FAMILY[id]) return;
    M.fam = id; M.famSet = true; M.cur = COLOR_FAMILY[id].shades[0];
    const f = $('#info-fams'), s = $('#info-sws'), i = $('#info-col');
    if (f) f.innerHTML = famHTML(); if (s) s.innerHTML = sw(); if (i) i.value = M.cur;
  };
  const apply = (fam, hex) => {
    S.settings.catColors = Object.assign({}, cc); if (own) delete S.settings.catColors[own];
    S.settings.catFamilies = Object.assign({}, cf); if (ownF) delete S.settings.catFamilies[ownF];
    if (fam) S.settings.catFamilies[e.value] = fam;
    if (hex && hex !== colorCategoryHex(e.value)) S.settings.catColors[e.value] = hex;   // the category's own colour = family anchor
    infoApplyCatColors();
  };
  const recolor = () => { if ($('#info-col-all') && $('#info-col-all').checked) recolorAll({onlyUnlocked:true, category:e.value, mode:colorMode() === 'manual' ? 'category' : undefined, noUndo:true, noCommit:true, silent:true}); };
  openModal({ title:t('in_color_t', {v:e.value}),
    body:'<p class="small muted" style="margin-top:0">' + esc(t('in_color_d')) + '</p>' +
      '<div class="lbl" style="margin-bottom:6px">' + esc(t('co_family')) + helpDot('colors') + '</div><div class="co-fampick" id="info-fams">' + famHTML() + '</div><div class="hint" style="margin:6px 0 12px">' + esc(t('co_cat_family_d')) + '</div>' +
      '<div class="swatches" id="info-sws">' + sw() + '</div><label class="row small info-custom">' + esc(t('in_color_custom')) + ' <input type="color" id="info-col" value="' + esc(M.cur || '#2563EB') + '" title="#RRGGBB"></label>' +
      '<label class="chk small" style="margin-top:14px"><input type="checkbox" id="info-col-all">' + esc(t('co_cat_recolor', {n:e.nB})) + '</label>',
    buttons:[{label:t('in_color_reset'), cls:'btn btn-ghost', fn: () => {
      undoPoint(); apply('', ''); recolor();
      closeModal(true); commit(); renderView(); undoToast(t('in_color_saved', {v:e.value}));
    }}, {label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('save'), cls:'btn btn-primary', icon:'check', fn: () => {
      const hex = normHex($('#info-col').value); if (!hex) return;
      undoPoint();
      apply(M.famSet ? M.fam : '', hex); recolor();
      closeModal(true); commit(); renderView(); undoToast(t('in_color_saved', {v:e.value}));
    }}],
    onClose: () => { UI.coCat = null; } });
}

/* ---------------- QR overview & reprint ---------------- */
const QR_PRESETS = ['l7159','l7160','l7162','l7163','a4-21','a4-14'];
const qrPresetId = () => QR_PRESETS.concat((S.customPresets || []).map(p => p.id)).includes(S.settings.qrPreset) ? S.settings.qrPreset : 'l7159';
/* Compact option text: "24 × 63,5×33,9 mm · L7159" (custom presets keep their name). */
function qrPresetLabel(p){
  if (!BUILTIN_PRESETS.includes(p)) return p.name;
  const code = (p.name.match(/\((?:Avery )?([A-Z]\d{4})/) || [])[1] || (p.kind === 'full' ? 'A4' : p.id.toUpperCase());
  const n = (v) => String(+(+v).toFixed(1)).replace('.', ',');
  return (p.cols * p.rows) + ' × ' + n(p.w) + '×' + n(p.h) + ' mm' + (code ? ' · ' + code : '');
}
function qrBinders(){ return sortedBinders().filter(b => !(S.settings.hideDemo && isDemo(b))); }
function qrFiltered(){
  const q = infoKey(UI.qrq);
  return qrBinders().filter(b => !q || q.split(' ').every(w => [b.speaking_code, b.company_name, b.multi_code, b.short_code, b.binder_title].join(' ').toLowerCase().indexOf(w) >= 0));
}
function qrSel(){ if (!(UI.qrSel instanceof Set)) UI.qrSel = new Set(); return UI.qrSel; }
function qrPanelHTML(){
  const pid = qrPresetId();
  return '<div class="toolbar"><div class="search">' + ic('search') + '<input class="inp" type="search" data-bind="qrq" value="' + esc(UI.qrq || '') + '" placeholder="' + esc(t('qr_search')) + '" aria-label="search"></div>' +
    '<label class="small row qr-preset" style="gap:6px">' + esc(t('qr_preset')) + ' <select class="inp" data-qrpreset="1">' + QR_PRESETS.map(id => findPreset(id)).concat(S.customPresets || []).map(p => '<option value="' + esc(p.id) + '"' + (p.id === pid ? ' selected' : '') + ' title="' + esc(p.name) + '">' + esc(qrPresetLabel(p)) + '</option>').join('') + '</select></label>' +
    '<button class="btn btn-primary" data-a="qr-reprint" id="qr-reprint">' + ic('printer') + esc(t('qr_reprint')) + ' <span id="qr-n" class="qr-n"></span></button></div>' +
    '<div class="info-intro">' + ic('qr') + '<span>' + esc(t('qr_intro')) + '</span></div>' +
    '<div class="toolbar qr-selbar"><label class="chk small"><input type="checkbox" data-a="qr-sel-all" id="qr-all">' + esc(t('qr_sel_vis')) + '</label><span class="small muted" id="qr-count"></span></div>' +
    '<div id="qr-results"></div>';
}
function renderQrResults(){
  const box = $('#qr-results'); if (!box) return;
  const list = qrFiltered(), sel = qrSel(), lim = UI.qrLimit || 120;
  // drop selections of binders that no longer exist
  Array.from(sel).forEach(id => { if (!S.binders.some(b => b.id === id)) sel.delete(id); });
  const n = sel.size, cnt = $('#qr-count'), qn = $('#qr-n'), btn = $('#qr-reprint'), all = $('#qr-all');
  if (cnt) cnt.textContent = t('qr_h_sel', {n}) + ' · ' + list.length + ' / ' + qrBinders().length;
  if (qn) qn.textContent = n ? '(' + n + ')' : '';
  if (btn) btn.disabled = !n;
  if (all){ const vis = list.filter(b => sel.has(b.id)).length; all.checked = !!list.length && vis === list.length; all.indeterminate = vis > 0 && vis < list.length; }
  if (!list.length){ box.innerHTML = '<div class="empty">' + esc(t('no_results')) + '</div>'; return; }
  const ecl = S.settings.qrEcc || 'M';
  box.innerHTML = '<div class="tbl-wrap"><table class="tbl qr-tbl"><thead><tr><th style="width:40px"></th><th>QR</th><th>' + esc(t('th_code')) + '</th><th>' + esc(t('th_client')) + '</th><th>' + esc(t('qr_short')) + '</th><th class="hide-sm">' + esc(t('qr_dest')) + '</th><th></th></tr></thead><tbody>' +
    list.slice(0, lim).map(b => { let svg = ''; try { svg = DMQR.svg(b.short_url || shortUrl(b.short_code), {ecl, quiet:1}); } catch(e){}
      const dest = destFor(b);
      return '<tr class="' + (sel.has(b.id) ? 'sel' : '') + '"><td><label class="chk"><input type="checkbox" data-a="qr-sel" data-id="' + b.id + '"' + (sel.has(b.id) ? ' checked' : '') + ' aria-label="' + esc(b.speaking_code) + '"></label></td>' +
        '<td><button class="qr-thumb" data-a="show-qr" data-id="' + b.id + '" title="' + esc(t('act_qr')) + '">' + svg + '</button></td>' +
        '<td><span class="code-chip"><span class="bar" style="background:' + esc(b.color_hex) + '"></span>' + esc(b.speaking_code) + '</span>' + (b.multi_code ? '<div class="multi-tag">' + esc(b.multi_code) + '</div>' : '') + '</td>' +
        '<td><div class="co">' + esc(b.company_name) + '</div><div class="ti">' + esc(b.binder_title) + '</div></td>' +
        '<td><span class="sc">' + esc(b.short_code) + '</span><div class="ti"><a href="' + esc(b.short_url) + '" target="_blank" rel="noopener">' + esc(String(b.short_url).replace(/^https:\/\//, '')) + '</a></div></td>' +
        '<td class="hide-sm"><a class="qr-dest" href="' + esc(dest) + '" target="_blank" rel="noopener" title="' + esc(dest) + '">' + esc(dest.replace(/^https?:\/\//, '')) + '</a></td>' +
        '<td class="acts"><button class="icon-btn" data-a="copy-url" data-id="' + b.id + '" title="' + esc(b.short_url) + '">' + ic('copy') + '</button><button class="icon-btn" data-a="qr-dl" data-f="svg" data-id="' + b.id + '" title="' + esc(t('qr_svg')) + '">' + ic('download') + '</button><button class="icon-btn" data-a="qr-dl" data-f="png" data-id="' + b.id + '" title="' + esc(t('qr_png')) + '">' + ic('image') + '</button></td></tr>'; }).join('') +
    '</tbody></table></div>' + (list.length > lim ? '<div class="row" style="justify-content:center;padding:14px"><button class="btn btn-sm" data-a="qr-more">' + esc(t('qr_more', {n:Math.min(120, list.length - lim)})) + '</button></div>' : '');
}
function qrDownload(id, fmt){
  const b = S.binders.find(x => x.id === id); if (!b) return;
  const svg = DMQR.svg(b.short_url || shortUrl(b.short_code), {ecl:S.settings.qrEcc || 'M', quiet:4, fg:'#000'});
  const name = 'qr_' + b.speaking_code + '_' + b.short_code;
  if (fmt === 'svg'){ download(name + '.svg', svg.replace('<svg ', '<svg width="512" height="512" '), 'image/svg+xml'); return; }
  const img = new Image(), c = document.createElement('canvas'); c.width = c.height = 1024;
  img.onload = () => {
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, 1024, 1024);
    c.toBlob((blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '.png'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }, 'image/png');
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
/** Set up the print studio for QR-only labels of the selected binders. The previous print settings and
    selection are kept in S.printPrev (once: a second reprint does not overwrite them) and can be restored. */
function qrReprint(ids){
  ids = (ids || Array.from(qrSel())).filter(id => S.binders.some(b => b.id === id));
  if (!ids.length){ toast(t('qr_none_sel'), 'warn'); return; }
  const P = S.print;
  if (!S.printPrev) S.printPrev = { presetId:P.presetId, geometry:clone(P.geometry), geometryModified:!!P.geometryModified, contentMode:P.contentMode, sel:S.binders.filter(b => b.selected_for_print).map(b => b.id), at:nowISO() };
  const keep = new Set(ids);
  S.binders.forEach(b => { b.selected_for_print = keep.has(b.id); });
  const pid = qrPresetId(), pr = findPreset(pid);
  P.presetId = pr.id; P.geometry = geoFromPreset(pr); P.geometryModified = false; P.contentMode = 'qr'; P.previewMode = 'labels';
  if (P.qrMode !== 'live') P.qrMode = 'live';
  S.view = 'print'; savePrefs(); renderAll(); window.scrollTo(0, 0);
  toast(t('qr_rp_toast', {n:ids.length, p:qrPresetLabel(pr)}), 'ok', 9000, {label:t('qr_rp_restore'), fn: qrRestorePrint});
}
function qrRestorePrint(){
  const R = S.printPrev; if (!R) return;
  const P = S.print;
  P.presetId = findPreset(R.presetId).id; P.geometry = Object.assign(presetGeo(P.presetId, S.customPresets), R.geometry || {}); P.geometryModified = !!R.geometryModified; P.contentMode = R.contentMode || 'split';
  const sel = new Set(R.sel || []);
  S.binders.forEach(b => { b.selected_for_print = sel.has(b.id); });
  delete S.printPrev;
  savePrefs(); if (S.view === 'print') renderView(); toast(t('qr_restored'));
}
/* Info bar shown on top of the print studio while a QR reprint is set up (called from viewPrint). */
function qrRestoreBarHTML(){
  const R = S.printPrev; if (!R) return '';
  return '<div class="qr-bar">' + ic('qr') + '<span class="qb-t">' + esc(t('qr_bar', {n:printQueueBinders().length, p:qrPresetLabel(findPreset(R.presetId)), s:(R.sel || []).length})) + '</span>' +
    '<span class="qb-b"><button class="btn btn-sm" data-a="qr-keep">' + esc(t('qr_bar_keep')) + '</button><button class="btn btn-sm btn-dark" data-a="qr-restore">' + ic('rotate') + esc(t('qr_rp_restore')) + '</button></span></div>';
}

/* ---------------- Print: QR-only label (kind 'Q') ---------------- */
/* Fits any slot: landscape slots put the QR left and codes right, tall slots put the codes under the QR. */
function renderQrLabel(b, g, P){
  const w = g.w, h = g.h, pad = clamp(+P.padding || 0, 0, Math.min(w, h) / 5);
  const spine = clamp(Math.min(w, h) * 0.05, 1.2, 3);
  const x0 = spine + pad, y0 = pad, iw = Math.max(5, w - x0 - pad), ih = Math.max(5, h - 2 * pad);
  const radius = g.radius ? 'border-radius:' + MM(g.radius) + ';' : '';
  const code = esc(b.speaking_code || '—'), codeLen = Math.max(3, (b.speaking_code || '').length);
  const sc = b.short_code || '', scLen = Math.max(12, sc.length);
  let html = '<div class="lab" style="' + radius + '"><div class="spine-bar" style="width:' + MM(spine) + ';background:' + esc(b.color_hex) + '"></div>';
  const wide = iw >= ih * 1.25;
  let q, qx, qy, tx, ty, tw, th;
  if (wide){
    q = P.qrMode === 'none' ? 0 : Math.min(ih, iw * 0.52);
    const gap = q ? Math.max(1.2, pad * 0.6) : 0;
    qx = x0; qy = y0 + (ih - q) / 2; tx = x0 + q + gap; ty = y0; tw = iw - q - gap; th = ih;
  } else {
    q = P.qrMode === 'none' ? 0 : Math.min(iw, ih * 0.66);
    qx = x0 + (iw - q) / 2; qy = y0; tx = x0; ty = y0 + q + (q ? 1 : 0); tw = iw; th = ih - q - (q ? 1 : 0);
  }
  if (q) html += qrBox(b, qx, qy, q, P);
  const fc = Math.max(1.6, Math.min(th * (wide ? 0.36 : 0.5), tw / (codeLen * 0.62), 16));
  const fu = Math.max(1.2, Math.min(fc * 0.42, tw / (scLen * 0.62), 3.4));   // short code on its own line, "qr7.it/" above it
  const fco = Math.max(1.2, Math.min(fc * 0.42, 3.2));
  LM.Q = {q, code:fc, minText:Math.min(fu, fco)};
  html += '<div style="position:absolute;left:' + MM(tx) + ';top:' + MM(ty) + ';width:' + MM(tw) + ';height:' + MM(th) + ';display:flex;flex-direction:column;justify-content:center;overflow:hidden;' + (wide ? '' : 'text-align:center;') + '">' +
    '<div class="code" style="font-size:' + MM(fc) + ';line-height:1.02">' + code + '</div>' +
    '<div class="lmono" style="font-size:' + MM(fu * 0.8) + ';line-height:1.1;margin-top:' + MM(fu * 0.35) + ';color:#000">qr7.it/</div>' +
    '<div class="lmono ln" style="font-size:' + MM(fu) + ';line-height:1.15;font-weight:700;letter-spacing:-.02em;color:#000">' + esc(sc) + '</div>' +
    (th > fc + fu * 3.4 + fco * 1.2 ? '<div class="ln" style="font-size:' + MM(fco) + ';font-weight:600;margin-top:' + MM(fco * 0.35) + ';color:#000">' + esc(b.company_name) + '</div>' : '') +
    '</div>';
  return html + '</div>';
}

/* ---------------- Actions & input ---------------- */
const INFO_ACTIONS = {
  'info-tab': (el) => { S.infoTab = el.dataset.v; UI.infoq = ''; savePrefs(); renderView(); },
  'info-filter': (el) => {
    const id = el.dataset.l, key = el.dataset.k;
    let label;
    if (id === 'client'){ const c = (S.clients || []).find(x => x.id === key); if (!c) return; label = t('in_clients') + ' · ' + c.name; }
    else { const e = infoEntry(id, key); label = t('in_' + id) + ' · ' + (e ? e.value : key); }
    UI.fInfo = {id, key, label}; UI.q = ''; UI.fState = ''; UI.fRoom = ''; UI.fCat = '';
    S.view = 'archive'; S.archiveView = 'table'; savePrefs(); renderAll(); window.scrollTo(0, 0);
  },
  'info-unfilter': () => { UI.fInfo = null; renderView(); },
  'info-back': () => { UI.fInfo = null; S.view = 'info'; savePrefs(); renderAll(); },
  'info-rename': (el) => openInfoRename(el.dataset.l, el.dataset.k),
  'info-merge': (el) => openInfoMerge(el.dataset.l, el.dataset.k),
  'info-del': (el) => askInfoDelete(el.dataset.l, el.dataset.k),
  'info-color': (el) => openCatColor(el.dataset.k),
  'co-fam': (el) => { const M = UI.coCat; if (M && M.pickFamily) M.pickFamily(el.dataset.f); },   // family choice in the category colour dialog
  'info-sw': (el) => { const i = $('#info-col'); if (i) i.value = el.dataset.c; $$('#info-sws .sw').forEach(s => s.classList.toggle('on', s === el)); },
  'qr-sel': (el) => { const s = qrSel(); if (el.checked) s.add(el.dataset.id); else s.delete(el.dataset.id); renderQrResults(); },
  'qr-sel-all': (el) => { const s = qrSel(); qrFiltered().forEach(b => { if (el.checked) s.add(b.id); else s.delete(b.id); }); renderQrResults(); },
  'qr-more': () => { UI.qrLimit = (UI.qrLimit || 120) + 120; renderQrResults(); },
  'qr-dl': (el) => qrDownload(el.dataset.id, el.dataset.f),
  'qr-reprint': () => qrReprint(),
  'qr-restore': () => qrRestorePrint(),
  'qr-keep': () => { delete S.printPrev; savePrefs(); renderView(); }
};
document.addEventListener('input', (e) => {
  const el = e.target, k = el.dataset && el.dataset.bind;
  if (k === 'infoq'){ UI.infoq = el.value; renderInfoResults(); }
  else if (k === 'qrq'){ UI.qrq = el.value; UI.qrLimit = 120; renderQrResults(); }
  else if (el.id === 'info-new') infoRenameHint(el);
  else if (el.id === 'info-col') $$('#info-sws .sw').forEach(s => s.classList.toggle('on', s.dataset.c === el.value.toUpperCase()));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'info-new'){ e.preventDefault(); const b = topModal() && topModal().querySelector('.modal-f .btn-primary'); if (b) b.click(); }
});
document.addEventListener('change', (e) => {
  if (e.target.dataset && e.target.dataset.qrpreset){ S.settings.qrPreset = e.target.value; savePrefs(); }
});

/* ---------------- Help topics (HELP_TOPICS is defined later, in 07-help.js) ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined') return;
  const cl = HELP_TOPICS.find(x => x.id === 'clients');
  if (cl){
    cl.body.it = cl.body.it.replace('Nella scheda <b>Clienti</b>', 'In <b>Informazioni › Clienti</b>');
    cl.body.en = cl.body.en.replace('In the <b>Clients</b> tab', 'In <b>Information › Clients</b>');
    cl.related = (cl.related || []).concat(['info']);
  }
  HELP_TOPICS.push(
    { id:'nav', guide:null, tags:['archive'], related:['info','backup'],
      title:{it:'Dove trovo Importa, Esporta, Database, AI e Impostazioni?', en:'Where are Import, Export, Database, AI and Settings?'},
      body:{it:'<p>La barra in alto ha solo le tre schede di tutti i giorni: <b>Archivio</b>, <b>Stampa etichette</b> e <b>Informazioni</b>.</p><p>Le altre funzioni sono nel menu <b>⚙ Funzioni avanzate</b>, subito a destra delle schede:</p><ul><li><b>Dati</b>: Importa (CSV, JSON, elenco clienti), Esporta e Salva (backup, CSV, manifest qr7.it), Database (SQLite e sessioni).</li><li><b>Strumenti</b>: Genera con AI, Impostazioni.</li></ul><p>Quando sei in una di queste schermate il pulsante del menu ne mostra il nome ed è evidenziato. Il menu si apre anche da tastiera (Invio, frecce su/giù, Esc per chiudere). A destra restano sempre il semaforo dei dati con <b>Salva backup</b>, il pulsante <b>?</b> della guida e la lingua IT/EN.</p>',
            en:'<p>The top bar only holds the three everyday tabs: <b>Archive</b>, <b>Print labels</b> and <b>Information</b>.</p><p>Everything else is in the <b>⚙ Advanced tools</b> menu, right next to the tabs:</p><ul><li><b>Data</b>: Import (CSV, JSON, client list), Export &amp; Save (backup, CSV, qr7.it manifest), Database (SQLite and sessions).</li><li><b>Tools</b>: Generate with AI, Settings.</li></ul><p>While you are in one of these screens the menu button shows its name and is highlighted. The menu also works from the keyboard (Enter, up/down arrows, Esc to close). On the right you always have the data indicator with <b>Save backup</b>, the <b>?</b> help button and the IT/EN language switch.</p>'} },
    { id:'info', guide:null, tags:['archive'], related:['clients','qr-reprint','multi'],
      title:{it:'Informazioni: clienti, tag, categorie, anni, luoghi e codici', en:'Information: clients, tags, categories, years, places and codes'},
      body:{it:'<p>La scheda <b>Informazioni</b> raccoglie tutte le voci usate nei faldoni, divise in sotto-schede: <b>Clienti</b>, <b>Tag</b>, <b>Categorie</b>, <b>Anni</b>, <b>Luoghi</b>, <b>Codici Multi</b>, <b>Codici extra</b> e <b>QR</b>.</p><ul><li>Ogni voce mostra quanti faldoni la usano (le più usate in alto). Clicca il numero per vedere quei faldoni in Archivio, filtrati.</li><li><b>Rinomina</b> cambia la voce ovunque: in tutti i faldoni e nell\'anagrafica clienti. Se scrivi un nome che esiste già, le due voci vengono <b>unite</b> (anche con il pulsante <b>Unisci</b>).</li><li><b>Elimina</b> toglie la voce dai faldoni, che restano.</li><li>Ogni modifica si annulla subito dal messaggio in basso (<b>Annulla</b>).</li><li>I tag sono sempre minuscoli; il tag <span class="kbd">demo</span> dei faldoni di esempio non si modifica.</li><li>In <b>Categorie</b> scegli il colore usato per i nuovi faldoni di quella categoria e, se vuoi, lo applichi a quelli esistenti.</li><li>In <b>Clienti</b>: cambiando la ragione sociale o il Codice Multi di un cliente si aggiornano anche i suoi faldoni.</li></ul>',
            en:'<p>The <b>Information</b> tab gathers every value used in your binders, in sub-tabs: <b>Clients</b>, <b>Tags</b>, <b>Categories</b>, <b>Years</b>, <b>Places</b>, <b>Multi codes</b>, <b>Extra codes</b> and <b>QR</b>.</p><ul><li>Each value shows how many binders use it (most used first). Click the number to see those binders in the Archive, filtered.</li><li><b>Rename</b> changes the value everywhere: in all binders and in the client register. Typing a name that already exists <b>merges</b> the two values (the <b>Merge</b> button does the same).</li><li><b>Delete</b> removes the value from the binders, which stay.</li><li>Every change can be undone right away from the message at the bottom (<b>Undo</b>).</li><li>Tags are always lowercase; the <span class="kbd">demo</span> tag of the sample binders cannot be edited.</li><li>In <b>Categories</b> you choose the colour used for new binders of that category and, if you like, apply it to the existing ones.</li><li>In <b>Clients</b>: changing a client\'s company name or Multi code also updates its binders.</li></ul>'} },
    { id:'qr-reprint', guide:null, tags:['qr','print','label'], related:['info','split'],
      title:{it:'Ristampare solo i QR rovinati', en:'Reprint only damaged QR codes'},
      body:{it:'<p>In <b>Informazioni › QR</b> vedi i QR di tutti i faldoni con codice parlante, codice breve qr7.it e destinazione finale. Puoi scaricare un singolo QR in SVG o PNG.</p><ol><li>Cerca e spunta i faldoni da ristampare (o <b>Seleziona tutti</b>).</li><li>Scegli il <b>Foglio</b> di etichette piccole (predefinito: 24 etichette 63,5×33,9, Avery L7159).</li><li>Premi <b>Ristampa solo QR</b>: si apre Stampa etichette con il contenuto <b>Solo QR</b> (QR + codice parlante + codice breve) e in coda solo quei faldoni.</li></ol><p>Le impostazioni di stampa di prima (foglio, contenuto e faldoni in coda) restano salvate: una barra in cima alla stampa ti permette di <b>Ripristinarle</b> quando hai finito. Il contenuto <b>Solo QR</b> si sceglie anche a mano in Stampa etichette › Contenuto etichette e va bene su qualsiasi formato.</p>',
            en:'<p>In <b>Information › QR</b> you see the QR codes of all binders with speaking code, qr7.it short code and final destination. You can download a single QR as SVG or PNG.</p><ol><li>Search and tick the binders to reprint (or <b>Select all</b>).</li><li>Pick the small-label <b>Sheet</b> (default: 24 labels 63.5×33.9, Avery L7159).</li><li>Press <b>Reprint QR only</b>: Print labels opens with the <b>QR only</b> content (QR + speaking code + short code) and only those binders queued.</li></ol><p>Your previous print settings (sheet, content and queued binders) stay saved: a bar on top of the print studio lets you <b>Restore</b> them when you are done. The <b>QR only</b> content can also be chosen by hand in Print labels › Label content and fits any format.</p>'} }
  );
});
