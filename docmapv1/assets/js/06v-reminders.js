/* =====================================================================
   DocMap 2026 — v12.10 «Promemoria» (index.html, after 06u-wave1.js). Roadmap K11, Dave's choice n. 6:
   automatic reminders for binders that are out too long.

   - Who has to give something back, computed from the status events (the current state of every binder that is out):
     due within N days («in scadenza»), past the return date («in ritardo»), out for more than M days with no
     return date («fuori da tanto»). Grouped by holder, so one message per person / office.
   - Rules (⚙ › Lavoro › Promemoria › Regole, S.settings.reminders): days before the due date, repeat every N days,
     «fuori da tanto» after M days, desktop notification on/off.
   - Automatic part: when DocMap opens and every hour while it stays open, the reminders that are due today show in
     «Oggi», in a toast once a day and (if allowed) as a system notification. DocMap NEVER sends a message by itself:
     every reminder is a ready text (e-mail, WhatsApp, copy) that a person sends, then «Segnato come inviato».
   - Holder contacts: S.settings.holderContacts {holder name: {email, phone}} (edited here; the client registry is
     used when the holder is a client with the same name). Sent / snoozed: S.reminders {key: {sent:[iso], snooze}},
     key = holder|binder id|event id, so a new exit starts a new reminder history. Both in the backups.
   ===================================================================== */
'use strict';

const RM_DEF = {on:true, before:2, every:7, longOut:30, notify:false};
const RM_DAY_LS = 'docmap_reminders_toast_day';

Object.assign(I18N.it, {
  nav_rem:'Promemoria', nd_rem:'Chi deve riportare faldoni: in scadenza, in ritardo, fuori da tanto, con il messaggio pronto',
  rm_h:'Promemoria di rientro', rm_p:('' + brandName() + ' controlla da solo chi ha faldoni fuori: quelli in scadenza, in ritardo o fuori da tanto. Per ognuno prepara il messaggio; lo mandi tu con un clic (e-mail, WhatsApp o copia) e lo segni come inviato. ' + brandName() + ' non invia nulla da solo.'),
  rm_due_now:'Da sollecitare oggi', rm_later:'Già sollecitati (prossimo promemoria più avanti)', rm_none:'Nessun promemoria: nessun faldone in ritardo, in scadenza o fuori da tanto.',
  rm_k_late:'in ritardo di {d} giorni', rm_k_soon:'rientro entro {d}', rm_k_today:'rientro oggi', rm_k_long:'fuori da {d} giorni senza data di rientro',
  rm_holder_none:'(senza nome di chi lo ha)', rm_n:'{n} faldoni', rm_last:'ultimo sollecito {d}', rm_next:'prossimo il {d}', rm_never:'mai sollecitato',
  rm_mail:'E-mail', rm_wa:'WhatsApp', rm_copy:'Copia il testo', rm_sent:'Segna come inviato', rm_snooze:'Rimanda di {d} giorni', rm_copied:'Testo copiato',
  rm_sent_ok:'Promemoria segnato come inviato a {w}', rm_snoozed:'Rimandato al {d}', rm_contact:'Contatto', rm_c_mail:'e-mail', rm_c_phone:'telefono / WhatsApp',
  rm_subj:'Promemoria restituzione faldoni', rm_hello:'Buongiorno {w},', rm_body_late:'risultano ancora presso di voi questi faldoni, che dovevano rientrare:', rm_body_soon:'vi ricordiamo la restituzione di questi faldoni:',
  rm_body_long:'risultano presso di voi da tempo questi faldoni:', rm_line_due:'rientro previsto il {d}', rm_line_since:'consegnato il {d}', rm_bye:'Grazie, a presto.',
  rm_rules:'Regole', rm_r_on:'Promemoria automatici attivi', rm_r_before:'Avvisa quanti giorni prima della data di rientro', rm_r_every:'Ripeti il sollecito ogni quanti giorni',
  rm_r_long:'Senza data di rientro: avvisa dopo quanti giorni fuori', rm_r_notify:('Notifica di sistema quando apro ' + brandName() + ' (se il browser lo permette)'),
  rm_toast:'{n} promemoria di rientro da mandare oggi', rm_open:'Apri', rm_todo:'{n} promemoria di rientro da mandare', rm_log:'Promemoria di rientro inviato a {w} ({n} faldoni)'
});
Object.assign(I18N.en, {
  nav_rem:'Reminders', nd_rem:'Who has to bring binders back: due soon, late, out for long, with the message ready',
  rm_h:'Return reminders', rm_p:('' + brandName() + ' checks by itself who has binders out: due soon, late or out for a long time. For each one it prepares the message; you send it with one click (e-mail, WhatsApp or copy) and mark it as sent. ' + brandName() + ' never sends anything by itself.'),
  rm_due_now:'To remind today', rm_later:'Already reminded (next reminder later)', rm_none:'No reminders: no binder is late, due soon or out for long.',
  rm_k_late:'{d} days late', rm_k_soon:'due back by {d}', rm_k_today:'due back today', rm_k_long:'out for {d} days with no return date',
  rm_holder_none:'(no holder name)', rm_n:'{n} binders', rm_last:'last reminder {d}', rm_next:'next on {d}', rm_never:'never reminded',
  rm_mail:'E-mail', rm_wa:'WhatsApp', rm_copy:'Copy the text', rm_sent:'Mark as sent', rm_snooze:'Postpone {d} days', rm_copied:'Text copied',
  rm_sent_ok:'Reminder marked as sent to {w}', rm_snoozed:'Postponed to {d}', rm_contact:'Contact', rm_c_mail:'e-mail', rm_c_phone:'phone / WhatsApp',
  rm_subj:'Reminder: binders to return', rm_hello:'Hello {w},', rm_body_late:'these binders are still with you and were due back:', rm_body_soon:'a reminder to return these binders:',
  rm_body_long:'these binders have been with you for a while:', rm_line_due:'due back on {d}', rm_line_since:'handed over on {d}', rm_bye:'Thank you.',
  rm_rules:'Rules', rm_r_on:'Automatic reminders on', rm_r_before:'Warn how many days before the return date', rm_r_every:'Repeat the reminder every how many days',
  rm_r_long:'With no return date: warn after how many days out', rm_r_notify:('System notification when I open ' + brandName() + ' (if the browser allows it)'),
  rm_toast:'{n} return reminders to send today', rm_open:'Open', rm_todo:'{n} return reminders to send', rm_log:'Return reminder sent to {w} ({n} binders)'
});
if (typeof ICONS === 'object' && !ICONS.bell) ICONS.bell = '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>';

const RMV = {open:''};
function rmSet(){ const s = Object.assign({}, RM_DEF, S.settings.reminders || {}); ['before', 'every', 'longOut'].forEach(k => { s[k] = Math.max(0, Math.min(365, Math.round(+s[k] || 0))); }); s.every = Math.max(1, s.every); return s; }
function rmState(){ if (!S.reminders || typeof S.reminders !== 'object' || Array.isArray(S.reminders)) S.reminders = {}; return S.reminders; }
const rmDay = (iso) => String(iso || '').slice(0, 10);
function rmAddDays(day, n){ const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function rmDiff(a, b){ return Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 864e5); }   // a − b in days
const rmHolderKey = (h) => String(h || '').trim().toLowerCase();

/** Binders that need a reminder, one row each: {b, ev, kind:'late'|'soon'|'today'|'long', days, key}. Pure on S. */
function rmItems(today){
  const set = rmSet(); if (!set.on) return [];
  today = today || sqToday();
  const ty = sqTypes(S.settings), byId = new Map(S.binders.map(b => [b.id, b])), out = [];
  sqOutRows(sqEv(), ty).forEach(r => {
    if (r.kind !== 'binder' || r.presence !== 'out') return;
    const b = byId.get(r.target_id); if (!b) return;
    const ev = r.ev, due = rmDay(ev.due_date);
    let kind = '', days = 0;
    if (due){
      const d = rmDiff(due, today);
      if (d < 0){ kind = 'late'; days = -d; } else if (d === 0) kind = 'today'; else if (d <= set.before){ kind = 'soon'; days = d; }
    } else {
      const d = rmDiff(today, rmDay(ev.at)); if (set.longOut > 0 && d >= set.longOut){ kind = 'long'; days = d; }
    }
    if (kind) out.push({b, ev, kind, days, due, key:rmHolderKey(ev.holder) + '|' + b.id + '|' + ev.id});
  });
  return out;
}
/** Grouped by holder, with when the group is due: {holder, items, worst, last, next, dueNow}. */
function rmGroups(today){
  today = today || sqToday();
  const set = rmSet(), st = rmState(), map = new Map();
  rmItems(today).forEach(x => { const k = rmHolderKey(x.ev.holder); if (!map.has(k)) map.set(k, {holder:String(x.ev.holder || '').trim(), key:k, items:[]}); map.get(k).items.push(x); });
  const rank = {late:0, today:1, soon:2, long:3};
  return Array.from(map.values()).map(g => {
    g.items.sort((a, b) => rank[a.kind] - rank[b.kind] || b.days - a.days);
    g.worst = g.items[0].kind;
    // last reminder of the group = the latest «sent» among its items; snooze = the latest snooze
    let last = '', snooze = '';
    g.items.forEach(x => { const r = st[x.key]; if (!r) return; (r.sent || []).forEach(s => { if (s > last) last = s; }); if (r.snooze && r.snooze > snooze) snooze = r.snooze; });
    g.last = last;
    const next = [last ? rmAddDays(rmDay(last), set.every) : today, snooze || ''].sort().pop();
    // something new since the last reminder (a binder not reminded yet) → due again now
    const fresh = g.items.some(x => !(st[x.key] && (st[x.key].sent || []).length));
    g.next = fresh && (!snooze || snooze <= today) ? today : next;
    g.dueNow = g.next <= today;
    return g;
  }).sort((a, b) => (b.dueNow - a.dueNow) || rank[a.worst] - rank[b.worst] || a.holder.localeCompare(b.holder));
}
function rmDueCount(){ try { return rmGroups().filter(g => g.dueNow).length; } catch(e){ return 0; } }

/* ---------------- contacts and message ---------------- */
function rmContact(holder){
  const c = (S.settings.holderContacts || {})[rmHolderKey(holder)] || {};
  return {email:String(c.email || '').trim(), phone:String(c.phone || '').trim()};
}
function rmMessage(g){
  const who = g.holder || '';
  const kind = g.items.some(x => x.kind === 'late') ? 'late' : g.items.some(x => x.kind === 'soon' || x.kind === 'today') ? 'soon' : 'long';
  const lines = g.items.map(x => '- ' + x.b.speaking_code + (x.b.company_name ? ' · ' + x.b.company_name : '') + (x.b.binder_title ? ' · ' + x.b.binder_title : '') + ' (' +
    (x.due ? t('rm_line_due', {d:fmtDate(x.due)}) : t('rm_line_since', {d:fmtDate(rmDay(x.ev.at))})) + ')');
  const studio = S.settings.studioName || '';
  return [t('rm_hello', {w:who}).replace(' ,', ','), '', t('rm_body_' + kind), ...lines, '', t('rm_bye'), studio].join('\n').trim();
}
function rmLinks(g){
  const c = rmContact(g.holder), msg = rmMessage(g), out = [];
  out.push({k:'mail', href:'mailto:' + encodeURIComponent(c.email).replace(/%40/g, '@') + '?subject=' + encodeURIComponent(t('rm_subj')) + '&body=' + encodeURIComponent(msg)});
  const ph = c.phone.replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
  out.push({k:'wa', href:'https://wa.me/' + (ph || '') + '?text=' + encodeURIComponent(msg)});
  return out;
}

/* ---------------- view ---------------- */
function rmItemHTML(x){
  const k = x.kind === 'late' ? t('rm_k_late', {d:x.days}) : x.kind === 'today' ? t('rm_k_today') : x.kind === 'soon' ? t('rm_k_soon', {d:fmtDate(x.due)}) : t('rm_k_long', {d:x.days});
  return '<li class="rm-it rm-' + x.kind + '"><b class="mono">' + esc(x.b.speaking_code) + '</b> <span>' + esc([x.b.company_name, x.b.binder_title].filter(Boolean).join(' · ')) + '</span><small>' + esc(k) + '</small></li>';
}
function rmGroupHTML(g){
  const c = rmContact(g.holder), L = rmLinks(g), open = RMV.open === g.key;
  const meta = (g.last ? t('rm_last', {d:sqSince(g.last)}) : t('rm_never')) + (g.dueNow ? '' : ' · ' + t('rm_next', {d:fmtDate(g.next)}));
  return '<article class="card card-p rm-g rm-w-' + g.worst + '" data-rmg="' + esc(g.key) + '"><div class="rm-gh"><div><h3>' + esc(g.holder || t('rm_holder_none')) + '</h3><small class="muted">' + esc(t('rm_n', {n:g.items.length}) + ' · ' + meta) + '</small></div>' +
    '<div class="rm-acts">' + L.map(x => '<a class="btn btn-sm' + (x.k === 'mail' && c.email ? ' btn-primary' : '') + '" href="' + esc(x.href) + '" data-rml="' + x.k + '"' + (x.k === 'wa' ? ' target="_blank" rel="noopener"' : '') + '>' + esc(t('rm_' + x.k)) + '</a>').join('') +
      '<button type="button" class="btn btn-sm" data-a="rm-copy" data-k="' + esc(g.key) + '">' + esc(t('rm_copy')) + '</button>' +
      '<button type="button" class="btn btn-sm btn-dark" data-a="rm-sent" data-k="' + esc(g.key) + '">' + ic('check') + esc(t('rm_sent')) + '</button>' +
      '<button type="button" class="btn btn-sm btn-ghost" data-a="rm-snooze" data-k="' + esc(g.key) + '">' + esc(t('rm_snooze', {d:rmSet().every})) + '</button></div></div>' +
    '<ul class="rm-items">' + g.items.map(rmItemHTML).join('') + '</ul>' +
    '<details class="rm-more"' + (open ? ' open' : '') + '><summary>' + esc(t('rm_contact')) + (c.email || c.phone ? ': ' + esc([c.email, c.phone].filter(Boolean).join(' · ')) : '') + '</summary><div class="g2">' +
      '<div class="field"><label>' + esc(t('rm_c_mail')) + '</label><input class="inp" type="email" data-rmc="email" data-k="' + esc(g.key) + '" value="' + esc(c.email) + '"></div>' +
      '<div class="field"><label>' + esc(t('rm_c_phone')) + '</label><input class="inp" type="tel" data-rmc="phone" data-k="' + esc(g.key) + '" value="' + esc(c.phone) + '"></div></div>' +
      '<pre class="rm-msg">' + esc(rmMessage(g)) + '</pre></details></article>';
}
function viewReminders(){
  const set = rmSet(), G = rmGroups(), now = G.filter(g => g.dueNow), later = G.filter(g => !g.dueNow);
  const num = (k, lbl) => '<div class="field"><label for="rm-' + k + '">' + esc(t(lbl)) + '</label><input class="inp" type="number" min="0" max="365" id="rm-' + k + '" data-rms="' + k + '" value="' + set[k] + '"></div>';
  return '<div class="stack" id="rm-page"><div class="page-h"><h1>' + ic('bell') + esc(t('rm_h')) + helpDot('reminders') + '</h1><p class="muted">' + esc(t('rm_p')) + '</p></div>' +
    (!G.length ? '<div class="empty" id="rm-none">' + ic('check', 'lg') + '<p>' + esc(t(set.on ? 'rm_none' : 'rm_r_on')) + '</p></div>' : '') +
    (now.length ? '<section class="stack" id="rm-now"><h2>' + esc(t('rm_due_now')) + ' (' + now.length + ')</h2>' + now.map(rmGroupHTML).join('') + '</section>' : '') +
    (later.length ? '<section class="stack" id="rm-later"><h2>' + esc(t('rm_later')) + ' (' + later.length + ')</h2>' + later.map(rmGroupHTML).join('') + '</section>' : '') +
    '<details class="card card-p" id="rm-rules"><summary><b>' + esc(t('rm_rules')) + '</b></summary><div class="stack" style="margin-top:10px">' +
      '<label class="chk"><input type="checkbox" data-rms="on"' + (set.on ? ' checked' : '') + '>' + esc(t('rm_r_on')) + '</label>' +
      '<div class="g2">' + num('before', 'rm_r_before') + num('every', 'rm_r_every') + num('longOut', 'rm_r_long') + '</div>' +
      '<label class="chk"><input type="checkbox" data-rms="notify"' + (set.notify ? ' checked' : '') + '>' + esc(t('rm_r_notify')) + '</label></div></details></div>';
}
function rmGroupByKey(k){ return rmGroups().find(g => g.key === k); }
function rmRefresh(){ if (S.view === 'reminders'){ const y = window.scrollY; renderView(); window.scrollTo(0, y); } else renderTopbar(); }

const RM_ACTIONS = {
  'rm-sent': (el) => {
    const g = rmGroupByKey(el.dataset.k); if (!g) return;
    undoPoint(); const st = rmState(), at = nowISO();
    g.items.forEach(x => { const r = st[x.key] = st[x.key] || {sent:[]}; r.sent = (r.sent || []).concat(at).slice(-20); delete r.snooze; });
    logAct('reminder.sent', null, t('rm_log', {w:g.holder || '?', n:g.items.length}), {holder:g.holder, binders:g.items.map(x => x.b.speaking_code)}, 'ui');
    commit(); toast(t('rm_sent_ok', {w:g.holder || '?'}), 'ok'); rmRefresh();
  },
  'rm-snooze': (el) => {
    const g = rmGroupByKey(el.dataset.k); if (!g) return;
    const st = rmState(), until = rmAddDays(sqToday(), rmSet().every);
    g.items.forEach(x => { const r = st[x.key] = st[x.key] || {sent:[]}; r.snooze = until; });
    commit({dirty:false}); toast(t('rm_snoozed', {d:fmtDate(until)}), 'ok'); rmRefresh();
  },
  'rm-copy': async (el) => {
    const g = rmGroupByKey(el.dataset.k); if (!g) return;
    try { await navigator.clipboard.writeText(rmMessage(g)); toast(t('rm_copied'), 'ok'); } catch(e){ RMV.open = g.key; rmRefresh(); }
  },
};
if (typeof ACTIONS === 'object') Object.assign(ACTIONS, RM_ACTIONS);
else document.addEventListener('DOMContentLoaded', () => { if (typeof ACTIONS === 'object') Object.assign(ACTIONS, RM_ACTIONS); });
document.addEventListener('change', (e) => {
  const el = e.target; if (!el || !el.dataset) return;
  if (el.dataset.rms){
    const s = Object.assign({}, RM_DEF, S.settings.reminders || {}), k = el.dataset.rms;
    s[k] = el.type === 'checkbox' ? !!el.checked : Math.max(0, +el.value || 0); S.settings.reminders = s; commit({dirty:false});
    if (k === 'notify' && s.notify && typeof Notification !== 'undefined' && Notification.permission === 'default') { try { Notification.requestPermission(); } catch(e2){} }
    rmRefresh(); const d = $('#rm-rules'); if (d) d.open = true;
  }
  if (el.dataset.rmc){
    const g = rmGroupByKey(el.dataset.k); if (!g || !g.holder) return;
    const all = Object.assign({}, S.settings.holderContacts || {}), k = rmHolderKey(g.holder);
    all[k] = Object.assign({}, all[k] || {}, {[el.dataset.rmc]:String(el.value || '').trim().slice(0, 120)}); S.settings.holderContacts = all;
    RMV.open = k; commit({dirty:false}); rmRefresh();
  }
});

/* ---------------- automatic check: at start and every hour ---------------- */
function rmAutoCheck(){
  try {
    if (!S || !rmSet().on) return 0;
    const n = rmDueCount(); if (!n) return 0;
    const day = sqToday(); let seen = ''; try { seen = localStorage.getItem(RM_DAY_LS) || ''; } catch(e){}
    if (seen === day) return n;
    try { localStorage.setItem(RM_DAY_LS, day); } catch(e){}
    if (typeof toast === 'function') toast(t('rm_toast', {n}), 'warn', 9000, {label:t('rm_open'), fn:() => { S.view = 'reminders'; savePrefs(); renderAll(); }});
    if (rmSet().notify && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible'){
      try { new Notification(('' + brandName()), {body:t('rm_toast', {n}), tag:'docmap-reminders'}); } catch(e){}
    }
    return n;
  } catch(e){ console.warn('reminders', e); return 0; }
}

(function rmWrap(){
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  if (typeof NAV_MORE !== 'undefined'){ const g = NAV_MORE.find(x => x[0] === 'nm_work'); if (g && !g[1].some(x => x[0] === 'reminders')) g[1].splice(1, 0, ['reminders', 'bell', 'nav_rem', 'nd_rem']); }
  if (typeof ADV_VIEWS !== 'undefined' && !ADV_VIEWS.includes('reminders')) ADV_VIEWS.push('reminders');
  wrap('renderView', (o) => function(){
    if (S.view === 'reminders'){ document.documentElement.lang = S.lang; $('#view').innerHTML = viewReminders(); return; }
    return o.apply(this, arguments);
  });
  // «Oggi»: the reminders to send today come right after the critical to-dos
  wrap('w1Todos', (o) => function(){ const L = o.apply(this, arguments); const n = rmDueCount(); if (n){ const i = L.filter(x => x.sev === 'crit').length; L.splice(i, 0, {sev:'warn', text:t('rm_todo', {n}), a:'nav', v:'reminders'}); } return L; });
  // backups carry the reminder history
  wrap('workspaceJSON', (o) => function(){
    const s = o.apply(this, arguments);
    if (!S.reminders || !Object.keys(S.reminders).length) return s;
    return s.replace(/\n?\}\s*$/, ',\n  "reminders": ' + JSON.stringify(S.reminders) + '\n}');
  });
  wrap('applyWorkspaceObject', (o) => function(W){
    const keep = rmState(), r = o.apply(this, arguments);
    try {
      const inc = W && W.reminders && typeof W.reminders === 'object' ? W.reminders : null;
      if (W && W._rmUndo){ S.reminders = clone(W.reminders || {}); return r; }   // «Annulla»: back to the snapshot
      S.reminders = Object.assign({}, keep);
      if (inc) Object.keys(inc).forEach(k => { const a = S.reminders[k] || {sent:[]}, b = inc[k] || {}; S.reminders[k] = {sent:Array.from(new Set([].concat(a.sent || [], b.sent || []))).sort().slice(-20), snooze:[a.snooze || '', b.snooze || ''].sort().pop() || undefined}; });
    } catch(e){}
    return r;
  });
  wrap('undoPoint', (o) => function(){ const r = o.apply(this, arguments); try { if (typeof UNDO !== 'undefined' && UNDO){ UNDO.reminders = clone(S.reminders || {}); UNDO._rmUndo = true; } } catch(e){} return r; });
})();
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(rmAutoCheck, 2500);
  setInterval(rmAutoCheck, 3600000);
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'reminders')) return;
  HELP_TOPICS.push({ id:'reminders', guide:null, tags:['archive'], pop:50, related:['status', 'pick', 'insights'],
    kw:{it:'promemoria sollecito sollecitare ritardo restituzione rientro scadenza fuori da tanto prestito avviso notifica email whatsapp ricordare', en:'reminder remind late overdue return due out for long loan notification email whatsapp'},
    title:{it:'Come ricordo a chi ha un faldone di riportarlo (promemoria automatici)?', en:'How do I remind people to bring a binder back (automatic reminders)?'},
    body:{it:('<p>Menu <b>⚙ Funzioni avanzate › Lavoro › Promemoria</b>. ' + brandName() + ' controlla da solo, ogni volta che lo apri e ogni ora, chi ha faldoni <b>in ritardo</b>, <b>in scadenza</b> (di serie 2 giorni prima) o <b>fuori da tanto</b> senza data di rientro (di serie 30 giorni), e li raggruppa per persona.</p>') +
      '<p>Per ognuno prepara il messaggio con l\'elenco dei faldoni: <b>E-mail</b>, <b>WhatsApp</b> o <b>Copia il testo</b>, poi <b>Segna come inviato</b>. Il sollecito torna dopo 7 giorni (cambia in <b>Regole</b>) o se quella persona prende altri faldoni; <b>Rimanda</b> lo sposta. I contatti (e-mail, telefono) si scrivono una volta sotto «Contatto».</p>' +
      ('<p>' + brandName() + ' <b>non invia nulla da solo</b>: il messaggio lo mandi tu. I promemoria da mandare compaiono anche in <b>Oggi</b> e in un avviso al primo avvio del giorno; in Regole puoi attivare la notifica di sistema.</p>'),
      en:('<p>Menu <b>⚙ Advanced › Work › Reminders</b>: late, due soon or long-out binders grouped by holder, with a ready e-mail / WhatsApp text, «Mark as sent», repeat every N days, postpone. ' + brandName() + ' never sends anything by itself.</p>')}
  });
});
