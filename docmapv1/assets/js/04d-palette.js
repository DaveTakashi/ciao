/* =====================================================================
   DocMap 2026 — v12.9 «Cerca ovunque» (Ctrl+K / ⌘K, and the 🔍 button in the top bar). PC only (index.html).
   One box for everything: binders (same engine as the archive search, 04c srchRun), clients, pages and actions.
   ↑ ↓ to move, Enter to open, Esc to close. Opening a binder stops the «find» stopwatch (02h-timing.js).
   Nothing is stored: the palette only calls functions that already exist (openEditor, quickBackup, nav, …).
   ===================================================================== */
'use strict';
const CK = {open:false, q:'', items:[], sel:0, back:null};
Object.assign(I18N.it, {
  ck_btn:'Cerca ovunque', ck_ph:'Cerca un faldone, un cliente, una pagina o un\'azione…', ck_hint:'↑ ↓ per scegliere · Invio per aprire · Esc per chiudere',
  ck_g_binder:'Faldoni', ck_g_client:'Clienti', ck_g_page:'Pagine', ck_g_action:'Azioni', ck_none:'Nessun risultato per «{q}».',
  ck_a_new:'Nuovo faldone', ck_a_backup:'Salva backup', ck_a_about:('Informazioni su ' + brandName()), ck_a_help:'Aiuto', ck_a_print_sel:'Stampa le etichette in coda',
  ck_a_theme:'Tema: {t}', ck_client_d:'mostra i suoi faldoni nell\'Archivio', ck_go:'Vai a',
});
Object.assign(I18N.en, {
  ck_btn:'Search everywhere', ck_ph:'Search a binder, a client, a page or an action…', ck_hint:'↑ ↓ to choose · Enter to open · Esc to close',
  ck_g_binder:'Binders', ck_g_client:'Clients', ck_g_page:'Pages', ck_g_action:'Actions', ck_none:'No result for «{q}».',
  ck_a_new:'New binder', ck_a_backup:'Save backup', ck_a_about:('About ' + brandName()), ck_a_help:'Help', ck_a_print_sel:'Print the queued labels',
  ck_a_theme:'Theme: {t}', ck_client_d:'show their binders in the Archive', ck_go:'Go to',
});

function ckNorm(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function ckMatch(text, q){ if (!q) return true; const n = ckNorm(text); return ckNorm(q).split(/\s+/).filter(Boolean).every(w => n.includes(w)); }
function ckGo(view){ S.view = view; if (typeof savePrefs === 'function') savePrefs(); renderAll(); window.scrollTo(0, 0); }
function ckPages(){
  const L = [];
  (typeof NAV_MAIN !== 'undefined' ? NAV_MAIN : []).forEach(([k, i, l]) => L.push({k, i, l}));
  (typeof NAV_MORE !== 'undefined' ? NAV_MORE : []).forEach(([, items]) => items.forEach(([k, i, l]) => L.push({k, i, l})));
  if (typeof viewStatus === 'function' && typeof I18N.it.sq_h === 'string') L.push({k:'status', i:'list', l:'sq_h'});
  return L.map(p => ({g:'page', icon:p.i, label:t(p.l), sub:t('ck_go'), run:() => ckGo(p.k)}));
}
function ckActions(){
  const A = [
    {icon:'plus', label:t('ck_a_new'), run:() => { if (S.view !== 'archive') ckGo('archive'); openEditor(null); }},
    {icon:'save', label:t('ck_a_backup'), run:() => quickBackup()},
    {icon:'printer', label:t('ck_a_print_sel'), run:() => ckGo('print')},
    {icon:'info', label:t('ck_a_about'), run:() => { if (typeof hxAboutOpen === 'function') hxAboutOpen(); }},
    {icon:'info', label:t('ck_a_help'), run:() => { if (typeof helpOpen === 'function') helpOpen(); }},
  ];
  if (typeof dmThemeSet === 'function') DM_THEMES.forEach(v => A.push({icon:'sliders', label:t('ck_a_theme', {t:t(v ? 'th_' + v : 'th_auto')}), run:() => dmThemeSet(v)}));
  return A.map(a => Object.assign({g:'action'}, a));
}
/** Results for a query: binders first (best search score), then clients, pages, actions. */
function ckResults(q){
  q = String(q || '').trim();
  const out = [];
  if (q){
    let list = [];
    try { list = typeof srchRun === 'function' ? srchRun(S.binders, q, {notes:false}).list : S.binders.filter(b => ckMatch([b.speaking_code, b.company_name, b.binder_title, b.short_code].join(' '), q)); }
    catch(e){ list = []; }
    list.slice(0, 8).forEach(b => out.push({g:'binder', icon:'archive', label:b.speaking_code + ' · ' + (b.company_name || ''), sub:[b.binder_title, b.ref_year, b.location_code].filter(Boolean).join(' · '), id:b.id, run:() => openEditor(b.id)}));
    (S.clients || []).filter(c => ckMatch([c.name, c.multi_code, c.city].join(' '), q)).slice(0, 5)
      .forEach(c => out.push({g:'client', icon:'users', label:c.name + (c.multi_code ? ' · ' + c.multi_code : ''), sub:t('ck_client_d'), run:() => { ckGo('archive'); if (typeof srSetQ === 'function') srSetQ(c.name, true); else { UI.q = c.name; renderAll(); } }}));
  }
  ckPages().concat(ckActions()).filter(x => ckMatch(x.label, q)).slice(0, q ? 6 : 20).forEach(x => out.push(x));
  return out;
}
function ckListHTML(){
  if (!CK.items.length) return '<div class="ck-none">' + esc(t('ck_none', {q:CK.q})) + '</div>';
  let g = '', h = '';
  CK.items.forEach((x, i) => {
    if (x.g !== g){ g = x.g; h += '<div class="ck-g" role="presentation">' + esc(t('ck_g_' + g)) + '</div>'; }
    h += '<button type="button" class="ck-it' + (i === CK.sel ? ' on' : '') + '" role="option" id="ck-it-' + i + '" data-ck="' + i + '" aria-selected="' + (i === CK.sel) + '">' +
      '<span class="ck-ic">' + ic(x.icon || 'search') + '</span><span class="ck-tx"><b>' + esc(x.label) + '</b>' + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</span></button>';
  });
  return h;
}
function ckRender(){
  const l = document.getElementById('ck-list'); if (!l) return;
  l.innerHTML = ckListHTML();
  const q = document.getElementById('ck-q'); if (q) q.setAttribute('aria-activedescendant', CK.items.length ? 'ck-it-' + CK.sel : '');
  const on = document.getElementById('ck-it-' + CK.sel); if (on && on.scrollIntoView) on.scrollIntoView({block:'nearest'});
}
function ckOpen(){
  if (CK.open) return ckClose();
  CK.open = true; CK.q = ''; CK.sel = 0; CK.items = ckResults(''); CK.back = document.activeElement;
  const el = document.createElement('div'); el.className = 'ck-back'; el.id = 'ck';
  el.innerHTML = '<div class="ck-box" role="dialog" aria-modal="true" aria-label="' + esc(t('ck_btn')) + '">' +
    '<div class="ck-in">' + ic('search') + '<input id="ck-q" type="search" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="ck-list" placeholder="' + esc(t('ck_ph')) + '"><kbd>Esc</kbd></div>' +
    '<div class="ck-list" id="ck-list" role="listbox"></div><div class="ck-hint">' + esc(t('ck_hint')) + '</div></div>';
  document.body.appendChild(el); ckRender();
  setTimeout(() => { const q = document.getElementById('ck-q'); if (q) q.focus(); }, 0);
}
function ckClose(){
  CK.open = false; const el = document.getElementById('ck'); if (el) el.remove();
  if (CK.back && CK.back.focus && document.contains(CK.back)) try { CK.back.focus(); } catch(e){}
}
function ckRun(i){ const x = CK.items[i]; if (!x) return; ckClose(); try { x.run(); } catch(e){ console.warn('palette', e); } }

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k'){ e.preventDefault(); e.stopPropagation(); ckOpen(); return; }
  if (!CK.open) return;
  if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); ckClose(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); const n = CK.items.length; if (n){ CK.sel = (CK.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; ckRender(); } return; }
  if (e.key === 'Enter' && e.target && e.target.id === 'ck-q'){ e.preventDefault(); ckRun(CK.sel); }
}, true);
document.addEventListener('input', (e) => { if (!e.target || e.target.id !== 'ck-q') return; CK.q = e.target.value; CK.sel = 0; CK.items = ckResults(CK.q); ckRender(); });
document.addEventListener('click', (e) => {
  if (!CK.open){ const b = e.target.closest && e.target.closest('[data-ck-open]'); if (b){ e.preventDefault(); ckOpen(); } return; }
  const it = e.target.closest && e.target.closest('[data-ck]'); if (it){ ckRun(+it.dataset.ck); return; }
  if (e.target.id === 'ck') ckClose();
});
/* the 🔍 button, left of «?» in the top bar */
document.addEventListener('DOMContentLoaded', () => {
  const o = window.topbarHTML; if (typeof o !== 'function' || o.__ck) return;
  const w = function(){ const h = o.apply(this, arguments);
    return h.replace('<button class="help-btn"', '<button class="help-btn ck-btn" type="button" data-ck-open="1" title="' + esc(t('ck_btn')) + ' (Ctrl+K)" aria-label="' + esc(t('ck_btn')) + ' (Ctrl+K)">' + ic('search') + '</button><button class="help-btn"'); };
  w.__ck = true; window.topbarHTML = w;
  const tb = document.getElementById('topbar');   // only redraw a bar already drawn (web mode before sign-in draws nothing)
  if (tb && tb.innerHTML.trim() && typeof renderTopbar === 'function') try { renderTopbar(); } catch(e){}
});

/* help topic: dark theme and «Cerca ovunque» */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'look')) return;
  HELP_TOPICS.push({ id:'look', guide:null, tags:['start'], related:['app-install', 'about'],
    kw:{it:'tema scuro chiaro notte aspetto colori ctrl+k cerca ovunque scorciatoia tastiera comandi lente', en:'dark light theme night look colours ctrl+k search everywhere shortcut keyboard commands'},
    title:{it:'Tema scuro e Cerca ovunque (Ctrl+K)', en:'Dark theme and Search everywhere (Ctrl+K)'},
    body:{it:('<p><b>Tema scuro</b>: ' + brandName() + ' segue il tema del sistema. Per sceglierlo a mano: <b>Impostazioni › Aspetto</b> (Automatico, Chiaro, Scuro); sul telefono la riga <b>Aspetto</b> sotto «Tempi misurati». Vale solo per questo dispositivo. Etichette, anteprime e stampe restano sempre chiare.</p>') +
      '<p><b>Cerca ovunque</b>: premi <b>Ctrl+K</b> (⌘K sul Mac) o la lente 🔍 in alto. Scrivi un codice, un cliente, una pagina («stampa») o un\'azione («backup», «nuovo faldone», «tema»). ↑ ↓ per scegliere, Invio per aprire, Esc per chiudere.</p>' +
      '<p><button class="btn btn-sm" data-ck-open="1" type="button">Prova Cerca ovunque</button></p>',
      en:('<p><b>Dark theme</b>: ' + brandName() + ' follows the system theme. To choose it: <b>Settings › Appearance</b> (Automatic, Light, Dark); on the phone the <b>Appearance</b> row under «Measured times». It applies to this device only. Labels, previews and printing always stay light.</p>') +
      '<p><b>Search everywhere</b>: press <b>Ctrl+K</b> (⌘K on a Mac) or the 🔍 at the top. Type a code, a client, a page («print») or an action («backup», «new binder», «theme»). ↑ ↓ to choose, Enter to open, Esc to close.</p>' +
      '<p><button class="btn btn-sm" data-ck-open="1" type="button">Try Search everywhere</button></p>'} });
});
