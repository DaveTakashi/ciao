/* =====================================================================
   DocMap 2026 — v12.10, end of wave 1 of the roadmap (index.html, after 06t-insights.js).

   1. «Oggi» (home per ruolo): a compact panel at the top of the Archivio, once «Primi passi» is done or hidden, with what matters today for THIS person
      (viewer / editor / admin: web mode reads the signed-in role, the PC opened from file is the admin) — the
      to-dos from the data (overdue, long out, open pick lists, signed phone hand-overs, backup age, capacity) and
      the 3-6 actions that role uses most. Collapsible, remembered on this device (localStorage docmap_today_v1).
   2. «Annulla» al posto delle conferme: deletions that the undo button fully reverses (one binder, a client, a
      pick list, an empty archive) happen at once with a 9-second «Annulla»; Impostazioni › «Chiedi sempre
      conferma prima di eliminare» brings the question back. Structural or bulk deletions keep their confirmation.
   3. Stati vuoti che insegnano: «no results» in the Archivio says why and offers the way out (clear the filters,
      search everywhere, create the binder); «nothing out» in Stati explains how something goes out.
   ===================================================================== */
'use strict';

const W1_TODAY_LS = 'docmap_today_v1';

Object.assign(I18N.it, {
  w1_today:'Oggi', w1_hi_admin:'Amministratore', w1_hi_editor:'Operatore', w1_hi_viewer:'Consultazione', w1_role:'Profilo: {r}',
  w1_todo_none:'Niente di urgente: archivio in ordine.', w1_todo_open:'{n} prelievi in corso', w1_todo_phone:'{n} consegne firmate dal telefono',
  w1_a_find:'Cerca ovunque', w1_a_out:'Cosa è fuori', w1_a_new:'Nuovo faldone', w1_a_pick:'Nuovo prelievo', w1_a_print:'Stampa etichette', w1_a_sync:'Sincronizza', w1_a_backup:'Backup', w1_a_trend:'Andamento',
  w1_hide:'Nascondi', w1_show:'Mostra «Oggi»',
  w1_ask_h:'Eliminazioni', w1_ask:'Chiedi sempre conferma prima di eliminare', w1_ask_d:'Di solito un faldone, un cliente, un prelievo o un archivio vuoto si eliminano subito e compare «Annulla» per 9 secondi. Spunta per avere di nuovo la domanda «Sei sicuro?». Le eliminazioni di più faldoni o di una posizione con dentro faldoni chiedono sempre conferma.',
  w1_nores_why:'Forse un filtro è ancora attivo, il codice è scritto diversamente o il faldone è in un altro archivio.', w1_clear:'Togli ricerca e filtri', w1_everywhere:'Cerca ovunque (Ctrl+K)', w1_create:'Crea «{q}»',
  w1_out_how:'Un faldone esce quando qualcuno lo prende: dalla sua scheda (Stato) sul PC o sul telefono, oppure con un prelievo, che segna tutti i faldoni insieme e raccoglie la firma.'
});
Object.assign(I18N.en, {
  w1_today:'Today', w1_hi_admin:'Administrator', w1_hi_editor:'Operator', w1_hi_viewer:'Read only', w1_role:'Profile: {r}',
  w1_todo_none:'Nothing urgent: the archive is in order.', w1_todo_open:'{n} pick lists in progress', w1_todo_phone:'{n} signed hand-overs from the phone',
  w1_a_find:'Search everywhere', w1_a_out:'What is out', w1_a_new:'New binder', w1_a_pick:'New pick list', w1_a_print:'Print labels', w1_a_sync:'Sync', w1_a_backup:'Backup', w1_a_trend:'Trends',
  w1_hide:'Hide', w1_show:'Show «Today»',
  w1_ask_h:'Deleting', w1_ask:'Always ask before deleting', w1_ask_d:'Normally one binder, a client, a pick list or an empty archive is deleted at once and «Undo» shows for 9 seconds. Tick to get the «Are you sure?» question back. Deleting several binders or a location with binders inside always asks.',
  w1_nores_why:'Maybe a filter is still on, the code is written differently or the binder is in another archive.', w1_clear:'Clear search and filters', w1_everywhere:'Search everywhere (Ctrl+K)', w1_create:'Create «{q}»',
  w1_out_how:'A binder goes out when someone takes it: from its card (Status) on the PC or the phone, or with a pick list, which marks all of them together and collects the signature.'
});

/* ---------------- role ---------------- */
function w1Role(){
  try {
    if (window.DocMapVault && DocMapVault.isActive()){ const me = dmProviders().auth.currentUser(); return me && ['admin', 'editor', 'viewer'].includes(me.role) ? me.role : 'viewer'; }
  } catch(e){}
  return 'admin';   // the PC opened from a file: whoever sits there owns the data
}
function w1Open(){ try { return localStorage.getItem(W1_TODAY_LS) !== '0'; } catch(e){ return true; } }
function w1SetOpen(v){ try { localStorage.setItem(W1_TODAY_LS, v ? '1' : '0'); } catch(e){} }

/* ---------------- «Oggi» ---------------- */
function w1Todos(){
  const out = [];
  try {
    if (typeof inSuggestions === 'function'){
      inSuggestions({peak:null, fullMonths:null}).filter(s => s.sev !== 'info' || s.id === 'backup').slice(0, 4)
        .forEach(s => out.push({sev:s.sev, text:s.title, a:s.act ? s.act.a : 'nav', v:s.act ? s.act.v : 'insights'}));
    }
    const open = (S.picks || []).filter(p => !p.closed_at).length;
    if (open) out.push({sev:'info', text:t('w1_todo_open', {n:open}), a:'nav', v:'pick'});
    const ph = typeof pkPhoneHandovers === 'function' ? pkPhoneHandovers(true).length : 0;
    if (ph) out.push({sev:'info', text:t('w1_todo_phone', {n:ph}), a:'nav', v:'pick'});
  } catch(e){ console.warn('today', e); }
  return out;
}
function w1Actions(role){
  const A = [['find', 'search', 'ck-open-w1'], ['out', 'history', 'nav', 'status']];
  if (role !== 'viewer') A.unshift(['new', 'plus', 'new-binder']), A.push(['pick', 'route', 'pk-new'], ['print', 'printer', 'nav', 'print']);
  if (role === 'admin') A.push(['sync', 'refresh', 'nav', 'sync'], ['backup', 'save', 'quick-backup']);
  A.push(['trend', 'trend', 'nav', 'insights']);
  return A;
}
function w1TodayHTML(){
  if (!S.binders.length) return '';
  try { if (typeof fsCardHTML === 'function' && fsCardHTML()) return ''; } catch(e){}   // «Primi passi» first: «Oggi» takes over once it is done or hidden
  const role = w1Role();
  if (!w1Open()) return '<div class="w1-today w1-closed" id="w1-today"><button type="button" class="btn btn-sm btn-ghost" data-a="w1-today" data-on="1">' + ic('sun') + esc(t('w1_show')) + '</button></div>';
  const todos = w1Todos(), icon = {crit:'alert', warn:'alert', info:'info'};
  const d = new Date().toLocaleDateString(S.lang === 'en' ? 'en-GB' : 'it-IT', {weekday:'long', day:'numeric', month:'long'});
  return '<section class="w1-today" id="w1-today" aria-labelledby="w1-h"><div class="w1-head"><h2 id="w1-h">' + ic('sun') + esc(t('w1_today')) + ' <small>' + esc(d) + ' · ' + esc(t('w1_role', {r:t('w1_hi_' + role)})) + '</small></h2>' +
    '<button type="button" class="btn btn-sm btn-ghost" data-a="w1-today" data-on="0">' + esc(t('w1_hide')) + '</button></div>' +
    '<div class="w1-body"><ul class="w1-todo" id="w1-todo">' + (todos.length ? todos.map(x => '<li class="w1-' + x.sev + '"><button type="button" data-a="' + esc(x.a) + '" data-v="' + esc(x.v || '') + '">' + ic(icon[x.sev] || 'info') + '<span>' + esc(x.text) + '</span></button></li>').join('') :
      '<li class="w1-ok">' + ic('check') + '<span>' + esc(t('w1_todo_none')) + '</span></li>') + '</ul>' +
    '<div class="w1-acts" id="w1-acts">' + w1Actions(role).map(a => '<button type="button" class="btn btn-sm" data-w1="' + a[0] + '" data-a="' + a[2] + '"' + (a[3] ? ' data-v="' + a[3] + '"' : '') + '>' + ic(a[1]) + esc(t('w1_a_' + a[0])) + '</button>').join('') + '</div></div></section>';
}

/* ---------------- empty states ---------------- */
function w1Clear(){
  Object.keys(UI).forEach(k => { if (/^f[A-Z]/.test(k)){ if (typeof UI[k] === 'boolean') UI[k] = false; else if (typeof UI[k] === 'string') UI[k] = ''; } });
  if (typeof srSetQ === 'function') srSetQ('', true); else UI.q = '';
  if (typeof S.archiveSel === 'string' && typeof archMulti === 'function' && archMulti()) S.archiveSel = '';
  savePrefs(); renderAll();
}
function w1NoResultsHTML(){
  const q = String(UI.q || '').trim();
  return '<div class="empty w1-nores" id="w1-nores">' + ic('search', 'lg') + '<p><b>' + esc(t('no_results')) + '</b></p><p class="small muted">' + esc(t('w1_nores_why')) + '</p>' +
    '<div class="row" style="justify-content:center;flex-wrap:wrap"><button type="button" class="btn btn-sm" data-a="w1-clear" id="w1-clear">' + ic('x') + esc(t('w1_clear')) + '</button>' +
    (typeof ckOpen === 'function' ? '<button type="button" class="btn btn-sm" data-a="ck-open-w1">' + ic('search') + esc(t('w1_everywhere')) + '</button>' : '') +
    (q && w1Role() !== 'viewer' ? '<button type="button" class="btn btn-sm btn-primary" data-a="new-binder">' + ic('plus') + esc(t('w1_create', {q:q.slice(0, 40)})) + '</button>' : '') + '</div></div>';
}

/* ---------------- actions, wrappers ---------------- */
const W1_ACTIONS = {
  'w1-today': (el) => { w1SetOpen(el.dataset.on === '1'); const box = $('#w1-today'); if (box) box.outerHTML = w1TodayHTML(); },
  'w1-clear': () => w1Clear(),
  'ck-open-w1': () => { if (typeof ckOpen === 'function') ckOpen(); },
};
if (typeof ACTIONS === 'object') Object.assign(ACTIONS, W1_ACTIONS);
else document.addEventListener('DOMContentLoaded', () => { if (typeof ACTIONS === 'object') Object.assign(ACTIONS, W1_ACTIONS); });
document.addEventListener('change', (e) => { const el = e.target; if (el && el.id === 'w1-ask'){ S.settings.confirmDeletes = !!el.checked; commit({dirty:false}); } });

(function w1Wrap(){
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  if (!ICONS.sun) ICONS.sun = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  // undo instead of a question, for deletions the undo button fully reverses (callers pass undoable:true)
  wrap('confirmAction', (o) => function(opts){
    if (opts && opts.undoable && !(S.settings && S.settings.confirmDeletes)){ if (opts.onOk) opts.onOk(); return; }
    return o.apply(this, arguments);
  });
  wrap('viewSettings', (o) => function(){
    return o.apply(this, arguments) + '<div class="card card-p stack" style="margin-top:16px" id="w1-ask-card"><h2>' + esc(t('w1_ask_h')) + '</h2>' +
      '<label class="chk"><input type="checkbox" id="w1-ask"' + (S.settings.confirmDeletes ? ' checked' : '') + '>' + esc(t('w1_ask')) + '</label><div class="hint">' + esc(t('w1_ask_d')) + '</div></div>';
  });
  // «Oggi» right under the page title of the Archivio (above «Primi passi» and the filters)
  wrap('viewArchive', (o) => function(){
    const h = o.apply(this, arguments);
    try {
      const card = w1TodayHTML(); if (!card) return h;
      const m = h.match(/^<div class="page-h">[\s\S]*?data-a="new-binder"[\s\S]*?<\/div><\/div>/);
      return m ? m[0] + card + h.slice(m[0].length) : card + h;
    } catch(e){ console.warn('today', e); return h; }
  });
  wrap('renderArchiveResults', (o) => function(){
    const r = o.apply(this, arguments);
    try {
      const box = $('#arch-results'), em = box && box.querySelector(':scope > .empty');
      if (em && S.binders.length && em.textContent.trim() === t('no_results')) em.outerHTML = w1NoResultsHTML();
    } catch(e){ console.warn('empty', e); }
    return r;
  });
  wrap('sqDashRowsHTML', (o) => function(rows, total){
    const h = o.apply(this, arguments);
    if (total) return h;
    return h.replace('</p></div>', '</p><p class="small muted w1-how">' + esc(t('w1_out_how')) + '</p><div class="row" style="justify-content:center"><button type="button" class="btn btn-sm" data-a="nav" data-v="pick">' + ic('route') + esc(t('nav_pick')) + '</button></div></div>');
  });
})();
