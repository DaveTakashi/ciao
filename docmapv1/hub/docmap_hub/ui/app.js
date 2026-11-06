/* DocMap Hub 0.4 — client-centric management app (single page, no external assets, no frameworks).
   Talks only to the hub's own /api (same origin, CSRF header on every write). */
(() => {
'use strict';

// ---------------------------------------------------------------------------------------------
// basics
// ---------------------------------------------------------------------------------------------
const S = { session: null, csrf: null, route: [], counts: {} };
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = () => $('#app');

const ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5"/><path d="M16 4.5a3 3 0 010 6M18 14.6c1.7.8 2.8 2.6 3.1 5.4"/>',
  server: '<rect x="3.5" y="4" width="17" height="6.5" rx="1.6"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="1.6"/><path d="M7 7.3h.01M7 16.8h.01"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l2 2M15 8l2 2"/>',
  rocket: '<path d="M5 15c-1 1-1.5 3.5-1.5 5.5 2 0 4.5-.5 5.5-1.5"/><path d="M9 15l-3-3c1.5-4.5 5.5-9 13-9 0 7.5-4.5 11.5-9 13z"/><circle cx="14.5" cy="9.5" r="1.6"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 006 21h12a1.7 1.7 0 001.5-2.5L14 9V3"/><path d="M7 15h10"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="1.6"/><path d="M8 20h8M12 16v4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="1.8"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="1.8"/><path d="M8 11V8a4 4 0 017.5-2"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 014.5 5H9l2 2h8.5A1.5 1.5 0 0121 8.5v9a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5z"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
};
const ic = (n, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

const COLORS = ['#3b6cff', '#7a4dff', '#0f9d76', '#e2672b', '#d43d7a', '#1b8bb4', '#8a6d1f', '#5b6b8c', '#b3402f', '#2f8f3a'];
function avColor(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }
function initials(s) { const w = String(s || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/); return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase(); }
const av = (name, color, cls = 'av') => `<div class="${cls}" style="background:${esc(color || avColor(name))}">${esc(initials(name))}</div>`;

function fmtDate(ts) { if (!ts) return '—'; const d = new Date(ts); return isNaN(d) ? esc(ts) : d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }); }
function fmtDT(ts) { if (!ts) return '—'; const d = new Date(ts); return isNaN(d) ? esc(ts) : d.toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function ago(ts) {
  if (!ts) return 'mai'; const s = (Date.now() - new Date(ts)) / 1000; if (isNaN(s)) return esc(ts);
  if (s < 60) return 'adesso'; if (s < 3600) return `${Math.floor(s / 60)} min fa`; if (s < 86400) return `${Math.floor(s / 3600)} ore fa`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} giorni fa`; return fmtDate(ts);
}

const HEALTH = { ok: ['ok', 'Tutto bene'], warn: ['warn', 'Da guardare'], bad: ['bad', 'Problema'], none: ['none', 'Niente da controllare'] };
const ENV_STATUS = {
  running: ['ok', 'Online'], stopped: ['mut', 'Spento'], unreachable: ['bad', 'Non raggiungibile'], protected: ['warn', 'Protetto (401)'],
  new: ['info', 'Mai controllato'], unknown: ['mut', 'Sconosciuto'], none: ['mut', 'Senza ambiente'],
};
const LIC_STATE = { active: ['ok', 'Attiva'], expiring: ['warn', 'In scadenza'], grace: ['warn', 'In tolleranza'], expired: ['bad', 'Scaduta'], superseded: ['mut', 'Sostituita'], suspended: ['bad', 'Sospesa'], revoked: ['bad', 'Revocata'] };
const CUST_STATUS = { active: 'Attivo', prospect: 'Trattativa', suspended: 'Sospeso', archived: 'Archiviato' };
const pill = (map, k) => { const v = map[k] || ['mut', k || '—']; return `<span class="pill ${v[0]}">${esc(v[1])}</span>`; };
const dot = (h) => `<span class="dot ${esc(h)}" title="${esc((HEALTH[h] || [0, ''])[1])}"></span>`;
function envIcon(e) { return e.kind === 'web-php' ? (e.name === 'staging' ? 'flask' : 'globe') : e.kind === 'studio-python' ? 'building' : 'server'; }
function envHealth(e) { return { running: 'ok', unreachable: 'bad', stopped: e.name === 'production' ? 'bad' : 'none', protected: 'warn', new: 'warn' }[e.status] || 'none'; }

// ---------------------------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------------------------
async function api(path, body) {
  const opt = { credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    opt.method = 'POST';
    opt.headers['Content-Type'] = 'application/json';
    if (S.csrf) opt.headers['X-CSRF'] = S.csrf;
    opt.body = JSON.stringify(body);
  }
  const r = await fetch(path, opt);
  let j; try { j = await r.json(); } catch { j = { error: `Risposta non valida (${r.status})` }; }
  if (r.status === 401 && !path.startsWith('/api/login')) { S.session = null; renderLogin(); throw new Error(j.error || 'Sessione scaduta'); }
  if (!r.ok) throw new Error(j.error || `Errore ${r.status}`);
  return j;
}

// classic pages (vault, deploy, ports) still do the heavy lifting in 0.4: post a real form to them
function classicPost(action, fields) {
  const f = document.createElement('form');
  f.method = 'post'; f.action = action;
  const all = Object.assign({ csrf: S.csrf }, fields);
  for (const [k, v] of Object.entries(all)) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.appendChild(i); }
  document.body.appendChild(f); f.submit();
}

function toast(msg, err) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), err ? 7000 : 3500);
}

// ---------------------------------------------------------------------------------------------
// overlay: modal / drawer / palette
// ---------------------------------------------------------------------------------------------
function closeOverlay() { const o = $('#overlay'); o.className = ''; o.innerHTML = ''; document.removeEventListener('keydown', escClose); }
function escClose(e) { if (e.key === 'Escape') closeOverlay(); }
function openOverlay(inner) {
  const o = $('#overlay'); o.innerHTML = `<div class="scrim"></div>${inner}`; o.className = 'show';
  $('.scrim', o).onclick = closeOverlay; $$('[data-close]', o).forEach((b) => (b.onclick = closeOverlay));
  document.addEventListener('keydown', escClose);
  return o;
}
function modal({ title, body, submit = 'Salva', wide = false, onSubmit, danger = false }) {
  const o = openOverlay(`<form class="modal${wide ? ' wide' : ''}" novalidate>
    <div class="hd"><h2>${esc(title)}</h2><button type="button" class="btn ghost sm x" data-close>${ic('x')}</button></div>
    <div class="bd"><div class="err-box" hidden></div>${body}</div>
    <div class="ft"><button type="button" class="btn ghost" data-close>Annulla</button>${submit ? `<button class="btn ${danger ? 'danger' : 'pri'}" type="submit">${esc(submit)}</button>` : ''}</div></form>`);
  const form = $('form', o); const first = $('input:not([type=hidden]),select,textarea', form); if (first) first.focus();
  form.onsubmit = async (e) => {
    e.preventDefault(); const eb = $('.err-box', form); eb.hidden = true;
    const btn = $('button[type=submit]', form); if (btn) btn.disabled = true;
    try { await onSubmit(formData(form), form); } catch (err) { eb.textContent = err.message; eb.hidden = false; }
    finally { if (btn) btn.disabled = false; }
  };
  return form;
}
function formData(form) {
  const d = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') d[el.name] = el.checked; else d[el.name] = el.value;
  }
  return d;
}
function drawer(title, sub, body, actions = '') {
  const o = openOverlay(`<aside class="drawer"><div class="hd"><div><h2>${title}</h2>${sub ? `<div class="sub" style="color:var(--mut);margin-top:3px">${sub}</div>` : ''}</div>
    <button class="btn ghost sm x" data-close>${ic('x')}</button></div>${actions ? `<div style="padding:12px 20px;border-bottom:1px solid var(--line)" class="btns">${actions}</div>` : ''}<div class="bd">${body}</div></aside>`);
  return $('.drawer', o);
}
const fld = (name, label, { type = 'text', value = '', hint = '', ph = '', req = false, attrs = '' } = {}) =>
  `<div class="f"><label for="f-${name}">${esc(label)}${req ? ' *' : ''}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(ph)}" ${attrs}>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
const sel = (name, label, opts, value = '', hint = '') =>
  `<div class="f"><label for="f-${name}">${esc(label)}</label><select id="f-${name}" name="${name}">${opts.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;

// ---------------------------------------------------------------------------------------------
// login / first setup
// ---------------------------------------------------------------------------------------------
function renderLogin(msg) {
  closeOverlay();
  const s = S.session || {};
  const setup = s.has_keys === false;
  app().className = '';
  app().innerHTML = `<div class="login"><form class="login-card" autocomplete="on">
    <div class="brand"><div class="logo-mark">D</div><div><b>DocMap Hub</b><div style="color:var(--mut);font-size:12px">versione ${esc(s.version || '')}</div></div></div>
    ${setup ? `<p class="lead">Prima configurazione: scegli la passphrase che protegge la chiave di firma delle licenze e la cassaforte. Almeno 12 caratteri. Annotala in un posto sicuro: senza non si recupera.</p>`
            : `<p class="lead">Una sola passphrase apre la chiave di firma e la cassaforte.</p>`}
    <div class="err-box" ${msg ? '' : 'hidden'}>${esc(msg || '')}</div>
    ${fld('passphrase', 'Passphrase', { type: 'password', attrs: 'autocomplete="current-password" required autofocus' })}
    ${setup ? fld('repeat', 'Ripeti la passphrase', { type: 'password', attrs: 'autocomplete="new-password" required' }) : ''}
    ${!setup ? `<details style="margin:-4px 0 12px"><summary style="cursor:pointer;color:var(--mut);font-size:12.5px">La cassaforte ha una passphrase diversa?</summary>
      <div style="margin-top:8px">${fld('vault_passphrase', 'Passphrase della cassaforte', { type: 'password', attrs: 'autocomplete="off"' })}</div></details>` : ''}
    <label class="check"><input type="checkbox" name="remember" ${s.remembered ? 'checked' : ''}> <span><b>Ricorda su questo PC</b><br><span style="color:var(--mut);font-size:12.5px">Windows protegge la passphrase con il tuo account (DPAPI): la prossima volta l'hub si apre senza chiederla. Si toglie da Impostazioni.</span></span></label>
    <button class="btn pri" style="width:100%;justify-content:center;margin-top:16px;padding:10px">${setup ? 'Crea e entra' : 'Entra'}</button>
  </form></div>`;
  const form = $('form', app());
  form.onsubmit = async (e) => {
    e.preventDefault(); const d = formData(form); const btn = $('button', form); btn.disabled = true;
    try {
      const r = await api(setup ? '/api/setup' : '/api/login', d);
      S.csrf = r.csrf; if (r.warning) toast(r.warning, true);
      await boot();
    } catch (err) { renderLogin(err.message); }
  };
}

// ---------------------------------------------------------------------------------------------
// shell
// ---------------------------------------------------------------------------------------------
const NAV = [
  ['', 'Panoramica', 'home'], ['clienti', 'Clienti', 'users'], ['istanze', 'Istanze', 'server'],
  ['licenze', 'Licenze', 'key'], ['deploy', 'Deploy', 'rocket'], ['attivita', 'Attività', 'activity'],
];
function shell() {
  if ($('.shell')) return;
  app().className = '';
  app().innerHTML = `<div class="shell">
    <aside class="side">
      <div class="brand"><div class="logo-mark">D</div><div><b>DocMap Hub</b><small>Gestione clienti e installazioni</small></div></div>
      <a class="btn ai" href="#/nuovo-progetto" style="justify-content:center;margin:0 4px 14px" data-r="nuovo-progetto">${ic('sparkle')} Crea progetto con AI</a>
      <nav id="nav"></nav>
      <div class="sec-t">Sistema</div>
      <nav><a class="nv" data-r="impostazioni" href="#/impostazioni">${ic('gear')}Impostazioni</a>
        <a class="nv" href="/classico">${ic('folder')}Strumenti classici</a></nav>
      <div class="foot"><div class="row" id="vault-state"></div><div class="row">v${esc(S.session.version)}</div>
        <button id="logout">${ic('logout')} Esci</button></div>
    </aside>
    <div class="main">
      <header class="top"><button class="menu-btn" id="menu">${ic('menu')}</button><div class="crumbs" id="crumbs"></div>
        <button class="searchbtn" id="search">${ic('search')}<span>Cerca clienti, siti, licenze…</span><kbd>Ctrl K</kbd></button>
        <button class="btn hide-sm" id="checkall" title="Controlla se tutti i siti e server rispondono">${ic('refresh')} Controlla tutto</button>
      </header>
      <main class="page" id="page"></main>
    </div></div>`;
  $('#nav').innerHTML = NAV.map(([r, t, i]) => `<a class="nv" data-r="${r}" href="#/${r}">${ic(i)}<span>${t}</span><span class="cnt" data-cnt="${r}" hidden></span></a>`).join('');
  $('#logout').onclick = async () => { try { await api('/api/logout', {}); } catch { } S.session = null; S.csrf = null; location.hash = '#/'; await boot(); };
  $('#search').onclick = palette;
  $('#menu').onclick = () => $('.shell').classList.toggle('nav-open');
  $('#checkall').onclick = checkAll;
  paintVaultState();
}
function setCrumbs(parts) {
  $('#crumbs').innerHTML = parts.map((p, i) => (i < parts.length - 1 && p[1] ? `<a href="${p[1]}">${esc(p[0])}</a> <span>/</span>` : `<b>${esc(p[0])}</b>`)).join(' ');
  document.title = `${parts[parts.length - 1][0]} · DocMap Hub`;
}
function setActive(r) {
  $$('.side a.nv').forEach((a) => a.classList.toggle('on', a.dataset.r === r));
  $('.shell').classList.remove('nav-open');
}
function setCounts(k) {
  const m = { clienti: k.customers, istanze: k.envs_down ? k.envs_down : null, licenze: k.licences_expiring || null };
  for (const [r, v] of Object.entries(m)) {
    const el = $(`[data-cnt="${r}"]`); if (!el) continue;
    el.hidden = !v; el.textContent = v || ''; el.classList.toggle('bad', r !== 'clienti');
  }
}
async function checkAll() {
  try {
    const r = await api('/api/check-all', {}); toast('Controllo in corso…');
    await waitJob(r.job); toast('Controllo completato.'); route();
  } catch (e) { toast(e.message, true); }
}
async function waitJob(id, onLine) {
  for (let i = 0; i < 600; i++) {
    const j = await api(`/api/jobs/${id}`); if (onLine) onLine(j);
    if (j.status !== 'running') { if (j.status === 'error') throw new Error(j.error || 'Operazione non riuscita'); return j; }
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error('Operazione troppo lunga: guarda Attività.');
}

// ---------------------------------------------------------------------------------------------
// router
// ---------------------------------------------------------------------------------------------
async function route() {
  if (!S.session || !S.session.logged) return renderLogin();
  shell();
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  S.route = parts;
  const page = $('#page');
  const r = parts[0] || '';
  setActive(r);
  page.innerHTML = '<div class="empty">Caricamento…</div>';
  try {
    if (r === '') await pOverview(page);
    else if (r === 'clienti' && parts[1]) await pCustomer(page, parts[1], parts[2] || 'riepilogo');
    else if (r === 'clienti') await pCustomers(page);
    else if (r === 'istanze') await pInstances(page);
    else if (r === 'licenze') await pLicences(page);
    else if (r === 'deploy') await pDeploys(page);
    else if (r === 'attivita') await pEvents(page);
    else if (r === 'impostazioni') await pSettings(page);
    else if (r === 'nuovo-progetto') await pPipeline(page, parts[1], parts[2]);
    else page.innerHTML = '<div class="empty"><div class="big">Pagina non trovata</div></div>';
  } catch (e) {
    page.innerHTML = `<div class="card"><div class="empty"><div class="big">Non riesco a caricare la pagina</div>${esc(e.message)}</div></div>`;
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { if ($('#overlay')?.classList.contains('show')) closeOverlay(); route(); });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && S.session?.logged) { e.preventDefault(); palette(); }
});

// ---------------------------------------------------------------------------------------------
// Panoramica
// ---------------------------------------------------------------------------------------------
async function pOverview(page) {
  setCrumbs([['Panoramica']]);
  const d = await api('/api/overview'); const k = d.kpi; setCounts(k);
  const kpi = (l, v, s, i) => `<div class="card kpi"><div class="l">${ic(i)}${esc(l)}</div><div class="v">${esc(v)}</div><div class="s">${s}</div></div>`;
  page.innerHTML = `
    <div class="ph"><div><h1>Buongiorno, ecco la situazione</h1><div class="sub">Clienti, installazioni e licenze in un colpo d'occhio.</div></div>
      <div class="btns"><button class="btn" id="new-cust">${ic('plus')} Nuovo cliente</button><a class="btn ai" href="#/nuovo-progetto">${ic('sparkle')} Crea progetto con AI</a></div></div>
    <div class="grid g4 mb">
      ${kpi('Clienti', k.customers, `${k.projects} progetti`, 'users')}
      ${kpi('Siti e server online', `${k.envs_online}/${k.envs}`, k.envs_down ? `<span style="color:var(--bad)">${k.envs_down} non raggiungibili</span>` : 'nessun problema rilevato', 'server')}
      ${kpi('Licenze attive', k.licences_active, k.licences_expiring ? `<span style="color:var(--warn)">${k.licences_expiring} da rinnovare</span>` : 'nessuna in scadenza', 'key')}
      ${kpi('Postazioni PC', k.workstations, `${k.deploys_30d} deploy negli ultimi 30 giorni`, 'monitor')}
    </div>
    <div class="grid g-main">
      <div class="card"><div class="hd"><h3>Da fare</h3><span class="pill mut">${d.alerts.length}</span></div>
        <div class="bd flush">${d.alerts.length ? `<div class="alist">${d.alerts.map((a, i) => `<div class="al" data-i="${i}">${dot(a.level === 'info' ? 'none' : a.level)}<div><b>${esc(a.title)}</b><small>${esc(a.text)}</small></div></div>`).join('')}</div>`
          : `<div class="empty"><div class="big">Tutto in ordine</div>Nessuna licenza in scadenza, nessun sito giù.</div>`}</div></div>
      <div class="card"><div class="hd"><h3>Ultime attività</h3><div class="btns"><a class="btn ghost sm" href="#/attivita">Tutte</a></div></div>
        <div class="bd flush"><div class="feed">${d.events.map(evRow).join('') || '<div class="empty">Nessuna attività</div>'}</div></div></div>
    </div>`;
  $('#new-cust').onclick = newCustomer;
  $$('.al', page).forEach((el) => (el.onclick = () => {
    const a = d.alerts[+el.dataset.i];
    if (a.kind === 'licence') openLicence(a.id); else if (a.kind === 'env') openEnv(a.id); else if (a.kind === 'backup' || a.kind === 'channel') location.hash = '#/impostazioni'; else if (a.kind === 'draft') location.hash = `#/nuovo-progetto/${a.id}/cliente`; else if (a.kind === 'updates') location.hash = '#/deploy'; else if (a.customer_id) location.hash = `#/clienti/${a.customer_id}`;
  }));
}
const evSubj = (ev) => (ev.subject ? ` <span style="color:var(--mut)">· ${esc(ev.subject)}</span>` : ev.entity_id ? ` <span class="tag mono">${esc(String(ev.entity_id).slice(0, 12))}</span>` : '');
const evRow = (ev) => `<div class="ev"><time title="${esc(ev.at)}">${ago(ev.at)}</time><div>${esc(ev.text)}${evSubj(ev)}</div></div>`;

// ---------------------------------------------------------------------------------------------
// Clienti
// ---------------------------------------------------------------------------------------------
async function pCustomers(page) {
  setCrumbs([['Clienti']]);
  const list = await api('/api/customers');
  let filter = sessionStorage.getItem('hub.cf') || 'all'; let q = '';
  page.innerHTML = `<div class="ph"><div><h1>Clienti</h1><div class="sub">Apri un cliente per vedere progetti, siti, postazioni, licenze e storico.</div></div>
    <div class="btns"><button class="btn" id="new-cust">${ic('plus')} Nuovo cliente</button><a class="btn ai" href="#/nuovo-progetto">${ic('sparkle')} Crea progetto con AI</a></div></div>
    <div class="card"><div class="toolbar"><input type="search" id="q" placeholder="Cerca per nome, P.IVA, città, Codice Multi…">
      <div class="chips">${[['all', 'Tutti'], ['bad', 'Con problemi'], ['expiring', 'In scadenza'], ['prospect', 'Trattative']].map(([v, t]) => `<button class="chip" data-f="${v}">${t}</button>`).join('')}</div></div>
      <div class="tbl-wrap" id="tbl"></div></div>`;
  $('#new-cust').onclick = newCustomer;
  const draw = () => {
    $$('.chip', page).forEach((c) => c.classList.toggle('on', c.dataset.f === filter));
    const rows = list.filter((c) => {
      const hay = [c.name, c.vat_id, c.email, c.extra.city, c.extra.codice_multi, (c.extra.tags || []).join(' ')].join(' ').toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (filter === 'bad') return c.health === 'bad' || c.health === 'warn';
      if (filter === 'expiring') return c.next_expiry_days !== null && c.next_expiry_days <= 30;
      if (filter === 'prospect') return c.status === 'prospect';
      return true;
    });
    $('#tbl').innerHTML = rows.length ? `<table class="t"><thead><tr><th>Cliente</th><th>Stato</th><th class="hide-sm">Piano</th><th class="r hide-sm">Progetti</th><th class="r hide-sm">Siti online</th><th class="r hide-sm">Postazioni</th><th>Prossima scadenza</th></tr></thead><tbody>
      ${rows.map((c) => `<tr class="click" data-id="${esc(c.id)}"><td><div class="cellname">${av(c.name, c.extra.color)}<div><b>${esc(c.name)}</b><small>${esc([c.vat_id, c.extra.city, c.reseller_name && 'via ' + c.reseller_name].filter(Boolean).join(' · ') || '—')}</small></div></div></td>
        <td><div class="btns">${dot(c.health)} ${c.status !== 'active' ? `<span class="pill mut">${esc(CUST_STATUS[c.status] || c.status)}</span>` : esc(HEALTH[c.health][1])}</div></td>
        <td class="hide-sm">${c.plans.map((p) => `<span class="tag">${esc(p)}</span>`).join(' ') || '—'}</td>
        <td class="r hide-sm">${c.projects}</td><td class="r hide-sm">${c.online}/${c.envs}</td><td class="r hide-sm">${c.workstations}</td>
        <td>${c.next_expiry ? `${fmtDate(c.next_expiry)} <small style="color:${c.next_expiry_days < 0 ? 'var(--bad)' : c.next_expiry_days <= 30 ? 'var(--warn)' : 'var(--mut)'}">(${c.next_expiry_days < 0 ? 'scaduta' : c.next_expiry_days + ' gg'})</small>` : '—'}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty"><div class="big">${list.length ? 'Nessun cliente con questi filtri' : 'Ancora nessun cliente'}</div>${list.length ? '' : 'Premi «Nuovo cliente» per iniziare.'}</div>`;
    $$('tr.click', page).forEach((tr) => (tr.onclick = () => (location.hash = `#/clienti/${tr.dataset.id}`)));
  };
  $('#q').oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
  $$('.chip', page).forEach((c) => (c.onclick = () => { filter = c.dataset.f; sessionStorage.setItem('hub.cf', filter); draw(); }));
  draw();
}

function customerForm(c = {}) {
  const x = c.extra || {};
  return `<div class="frow">${fld('name', 'Ragione sociale', { value: c.name, req: true, attrs: 'required' })}${fld('vat_id', 'Partita IVA / C.F.', { value: c.vat_id })}</div>
    <div class="frow">${fld('email', 'Email', { type: 'email', value: c.email })}${fld('x_pec', 'PEC', { value: x.pec })}</div>
    <div class="frow">${fld('x_contact', 'Referente', { value: x.contact })}${fld('x_phone', 'Telefono', { value: x.phone })}</div>
    <div class="frow">${fld('x_address', 'Indirizzo', { value: x.address })}${fld('x_city', 'Città', { value: x.city })}</div>
    <div class="frow">${fld('x_codice_multi', 'Codice Multi', { value: x.codice_multi })}${fld('x_sdi', 'Codice SDI', { value: x.sdi })}</div>
    <div class="frow">${sel('status', 'Stato', Object.entries(CUST_STATUS), c.status || 'active')}${fld('x_color', 'Colore', { type: 'color', value: x.color || avColor(c.name || 'x'), attrs: 'style="height:38px;padding:3px"' })}</div>
    ${fld('x_tags', 'Etichette (separate da virgola)', { value: (x.tags || []).join(', '), ph: 'commercialista, pilota, Pro' })}
    <div class="f"><label for="f-notes">Note</label><textarea id="f-notes" name="notes" rows="3" style="font-family:inherit;font-size:14px">${esc(c.notes || '')}</textarea></div>`;
}
function customerPayload(d) {
  const extra = {};
  for (const [k, v] of Object.entries(d)) if (k.startsWith('x_')) extra[k.slice(2)] = k === 'x_tags' ? v.split(',').map((t) => t.trim()).filter(Boolean) : v.trim();
  return { name: d.name, vat_id: d.vat_id, email: d.email, notes: d.notes, status: d.status, extra };
}
// v0.9: «Nuovo cliente» opens the same guided masks as «Crea progetto con AI», starting empty (no AI needed)
function newCustomer() {
  const o = modal({
    title: 'Nuovo cliente', submit: 'Avanti: percorso guidato',
    body: `<p class="note" style="margin-top:0">Ti guido in 6 passi (cliente, licenza, sito online, sede, persone, conferma). Alla fine l'hub crea licenze, pacchetti e siti, e la scheda del cliente ti dice ogni volta il prossimo passo.</p>
      ${fld('name', 'Ragione sociale', { req: true, attrs: 'required autofocus' })}${fld('vat_id', 'Partita IVA / C.F.', { hint: 'Serve a ritrovarlo: rifare il percorso non crea doppioni.' })}
      <div class="f"><label>Cosa avrà il cliente</label>
        <label class="check"><input type="checkbox" name="i_online" checked> <span><b>Sito online</b> (su hosting, raggiungibile anche dai telefoni fuori ufficio)</span></label>
        <label class="check"><input type="checkbox" name="i_sede"> <span><b>Server in sede</b> (un PC dello studio; con il sito si sincronizzano da soli)</span></label></div>
      <p style="margin:6px 0 0;font-size:12.5px"><a href="#" id="only-registry">Solo anagrafica, senza installazioni</a> · <a href="#/nuovo-progetto">Ho già il JSON dell'AI</a></p>`,
    onSubmit: async (d) => {
      const inst = [d.i_sede && 'sede', d.i_online && 'online'].filter(Boolean);
      if (!inst.length) throw new Error('Scegli almeno sito online o server in sede (oppure «Solo anagrafica»).');
      const r = await api('/api/drafts/blank', { name: d.name, vat_id: d.vat_id, installazioni: inst });
      closeOverlay(); S.draft = null; location.hash = `#/nuovo-progetto/${r.id}/cliente`;
    },
  });
  const a = $('#only-registry', o); if (a) a.onclick = (e) => { e.preventDefault(); closeOverlay(); newCustomerRegistry(); };
}
function newCustomerRegistry() {
  modal({
    title: 'Nuovo cliente (solo anagrafica)', submit: 'Crea cliente', wide: true,
    body: `<p class="note" style="margin-top:0">Per una trattativa o un cliente senza installazioni. Quando serve, il percorso guidato («Nuovo cliente» con la stessa P.IVA) completa questo cliente senza doppioni.</p>${customerForm()}${fld('project_name', 'Nome del progetto', { ph: 'DocMap <nome del cliente>' })}`,
    onSubmit: async (d) => {
      const p = customerPayload(d); p.project_name = d.project_name;
      const r = await api('/api/customers', p); closeOverlay(); toast('Cliente creato.'); location.hash = `#/clienti/${r.id}`;
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Scheda cliente
// ---------------------------------------------------------------------------------------------
const CTABS = [['riepilogo', 'Riepilogo'], ['postazioni', 'Postazioni'], ['pubblica', 'Pubblica'], ['licenze', 'Licenze'], ['accessi', 'Accessi'], ['storico', 'Storico'], ['dati', 'Dati']];
async function pCustomer(page, id, tab) {
  const d = await api(`/api/customers/${encodeURIComponent(id)}`);
  const c = d.customer; S.cust = d;
  setCrumbs([['Clienti', '#/clienti'], [c.name]]);
  const envs = d.projects.flatMap((p) => p.instances.flatMap((i) => i.envs));
  const wss = d.projects.flatMap((p) => p.workstations).filter((w) => w.status !== 'revoked');
  const curLic = d.licences.filter((l) => l.state !== 'superseded');
  const counts = { postazioni: wss.length, pubblica: envs.length, licenze: curLic.length, accessi: d.secrets.length };
  const x = c.extra || {};
  page.innerHTML = `
    <div class="ph">${av(c.name, x.color, 'avatar')}<div><h1>${esc(c.name)}</h1>
      <div class="sub">${[c.vat_id && 'P.IVA ' + esc(c.vat_id), x.city && esc(x.city), c.reseller_name && 'rivenditore ' + esc(c.reseller_name), c.email && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`].filter(Boolean).join(' · ') || 'Nessun dato anagrafico'}</div>
      <div class="btns" style="margin-top:6px">${dot(d.health)} <span style="color:var(--mut)">${esc(HEALTH[d.health][1])}</span>${c.status !== 'active' ? ` <span class="pill mut">${esc(CUST_STATUS[c.status])}</span>` : ''}${(x.tags || []).map((t) => ` <span class="tag">${esc(t)}</span>`).join('')}</div></div>
      <div class="btns"><button class="btn" id="edit-c">${ic('edit')} Modifica</button><button class="btn pri" id="new-p">${ic('plus')} Nuovo progetto</button></div></div>
    <nav class="tabs">${CTABS.map(([t, l]) => `<a href="#/clienti/${esc(c.id)}/${t}" class="${t === tab ? 'on' : ''}">${l}${counts[t] ? `<span class="cnt">${counts[t]}</span>` : ''}</a>`).join('')}</nav>
    <div id="tab"></div>`;
  $('#edit-c').onclick = () => editCustomer(c);
  $('#new-p').onclick = () => newProject(c);
  const el = $('#tab');
  ({ riepilogo: tSummary, postazioni: tWorkstations, pubblica: tPublish, licenze: tLicences, accessi: tSecrets, storico: tHistory, dati: tData }[tab] || tSummary)(el, d);
}
function editCustomer(c) {
  modal({
    title: `Modifica ${c.name}`, wide: true, body: customerForm(c),
    onSubmit: async (d) => { await api(`/api/customers/${c.id}`, customerPayload(d)); closeOverlay(); toast('Salvato.'); route(); },
  });
}
function newProject(c) {
  modal({
    title: 'Nuovo progetto', submit: 'Crea progetto',
    body: `<p class="note" style="margin-top:0">Un progetto raggruppa sito online, staging, server di sede e postazioni di un cliente. Di solito ne basta uno; creane altri per sedi o società diverse.</p>${fld('name', 'Nome del progetto', { req: true, attrs: 'required', ph: 'Archivio sede di Milano' })}`,
    onSubmit: async (d) => { await api('/api/projects', { customer_id: c.id, name: d.name }); closeOverlay(); toast('Progetto creato.'); route(); },
  });
}

function tSummary(el, d) {
  if (!d.projects.length) { el.innerHTML = `<div class="card"><div class="empty"><div class="big">Nessun progetto</div>Crea un progetto per registrare siti, server e postazioni.</div></div>`; return; }
  el.innerHTML = `${journeyCard(d.journey)}<div class="grid g-main"><div>${d.projects.map((p) => projectBlock(p)).join('')}</div>
    <div><div class="card mb"><div class="hd"><h3>Licenze</h3><div class="btns"><a class="btn ghost sm" href="#/clienti/${esc(d.customer.id)}/licenze">Gestisci</a></div></div><div class="bd flush">${licMini(d.licences.filter((l) => l.state !== 'superseded'))}</div></div>
    <div class="card"><div class="hd"><h3>Ultime attività</h3></div><div class="bd flush"><div class="feed">${d.events.slice(0, 8).map(evRow).join('') || '<div class="empty">Nessuna attività</div>'}</div></div></div></div></div>`;
  bindNodes(el, d); bindJourney(el, d);
}
// v0.9: «Percorso del cliente» — what is done and the ONE next thing to do, with its button
const JACT = { deploy: 'Pubblica', promote: 'Pubblica in produzione', setup: 'Configura il sito', check: 'Controlla adesso', tab: 'Apri', env: 'Apri' };
function journeyCard(j) {
  if (!j || !j.total) return '';
  const pct = Math.round((100 * j.done) / j.total);
  return `<div class="card mb journey"><div class="hd"><h3>${j.complete ? 'Percorso completato' : 'Percorso del cliente'}</h3><span class="pill ${j.complete ? 'ok' : 'info'}">${j.done} di ${j.total}</span></div>
    <div class="bd"><div class="jbar"><span style="width:${pct}%"></span></div>
    ${j.next ? `<div class="jnext"><div><small>Prossimo passo</small><b>${esc(j.next.title)}</b>${j.next.hint ? `<p>${esc(j.next.hint)}</p>` : ''}</div>${j.next.action ? `<button class="btn pri" data-jact="${esc(j.next.id)}">${ic(j.next.action.do === 'setup' ? 'key' : j.next.action.do === 'check' ? 'refresh' : 'rocket')} ${esc(JACT[j.next.action.do] || 'Apri')}</button>` : ''}</div>` : '<div class="note" style="background:var(--ok-soft);color:var(--ok)">Tutto fatto: il cliente è operativo. Da qui in poi: rinnovi e aggiornamenti dalla Panoramica.</div>'}
    <details ${j.complete ? '' : 'open'}><summary>Tutti i passi</summary><ol class="jsteps">${j.steps.map((s) => `<li class="${s.done ? 'done' : s === j.next || (j.next && s.id === j.next.id) ? 'cur' : ''}"><span>${s.done ? '✓' : '○'}</span><div><b>${esc(s.title)}</b>${!s.done && s.hint ? `<small>${esc(s.hint)}</small>` : ''}</div>${!s.done && s.action && !(j.next && s.id === j.next.id) ? `<button class="btn ghost sm" data-jact="${esc(s.id)}">${esc(JACT[s.action.do] || 'Apri')}</button>` : ''}</li>`).join('')}</ol></details></div></div>`;
}
function bindJourney(el, d) {
  const j = d.journey; if (!j) return;
  $$('[data-jact]', el).forEach((b) => (b.onclick = () => {
    const st = j.steps.find((x) => x.id === b.dataset.jact); const a = st && st.action; if (!a) return;
    const envs = d.projects.flatMap((p) => p.instances.flatMap((i) => i.envs));
    const env = envs.find((e) => e.id === a.env_id);
    if (a.do === 'deploy') return runPlan('env', a.env_id, env ? `${env.instance_label} · ${env.name_it}` : '');
    if (a.do === 'promote') return runPlan('promote', a.instance_id, '');
    if (a.do === 'setup') return siteSetup(a.env_id, env ? `${env.instance_label} · ${env.name_it}` : '');
    if (a.do === 'check') return checkAll();
    if (a.do === 'env') return openEnv(a.env_id);
    if (a.do === 'tab') location.hash = `#/clienti/${d.customer.id}/${a.tab}`;
  }));
}
// v0.9: the hub runs setup.php and puts every access code in the vault
async function siteSetup(envId, label) {
  const o = modal({
    title: `Configura il sito${label ? ': ' + label : ''}`, submit: 'Configura adesso', wide: true,
    body: `<p style="margin-top:0">L'hub apre da solo <span class="mono">setup.php</span> del sito: crea il database (in una cartella tutta sua, fuori dal sito), la chiave e un codice di accesso per ogni persona, e mette i codici <b>direttamente in cassaforte</b>. Non devi copiare niente.</p>
      <ul style="margin:0 0 12px;padding-left:18px;color:var(--fg2);font-size:13px"><li><b>admin</b>: il tuo codice da amministratore</li><li><b>ponte-sync</b>: solo se il cliente ha anche il server in sede (sincronizzazione)</li><li>le persone previste nel progetto</li></ul>
      <div class="f"><label for="f-people">Altre persone (facoltativo): una per riga, <span class="mono">nome,ruolo</span></label><textarea id="f-people" name="people" rows="3" placeholder="mario,editor&#10;segreteria,viewer" style="font-family:ui-monospace,monospace;font-size:13px"></textarea><div class="hint">Ruoli: admin, editor, viewer. Altre persone si aggiungono poi dall'app.</div></div>
      <div class="note">La chiave del database (<span class="mono">config.php</span>) resta nell'hub solo se il cliente ha autorizzato la custodia; altrimenti alla fine la scarichi una volta e la consegni al cliente.</div>`,
    onSubmit: async (f) => {
      const r = await withVault(() => api(`/api/envs/${envId}/setup`, { people: f.people || '' }));
      closeOverlay();
      const jm = jobModal('Configurazione del sito', '<p class="note" style="margin-top:0">In corso…</p>');
      try {
        const j = await waitJob(r.job, showLog(jm)); const res = j.result || {};
        $('#jm-det', jm).open = false;
        $('#jm-body', jm).innerHTML = `<div class="okbox">${ic('key')}<div><b>Sito configurato</b><small>${(res.people || []).length === 1 ? '1 codice di accesso' : (res.people || []).length + ' codici di accesso'} in cassaforte: ${(res.people || []).map((p) => esc(p.user)).join(', ')}</small></div></div>
          ${res.config_php ? `<div class="note warn mt"><b>Scarica adesso la copia di config.php</b> e consegnala al cliente (chiavetta o gestore di password): contiene la chiave del database e l'hub non la conserva. Senza copia, se il file sul server si perde, i dati online non si leggono più.</div>
            <div class="btns mt"><button class="btn pri" id="dl-cfg">${ic('download')} Scarica config.php</button></div>` : '<div class="note mt">Chiave del database custodita in cassaforte (custodia autorizzata).</div>'}
          <p style="color:var(--mut);font-size:12.5px">Codici delle persone: scheda del cliente → <b>Accessi</b> (si mostrano con la passphrase, e ogni lettura resta nel registro).</p>`;
        const dl = $('#dl-cfg', jm); if (dl) dl.onclick = () => { download(res.config_name || 'config.php', atob(res.config_php), 'application/octet-stream'); dl.textContent = 'Scaricato'; };
        toast('Sito configurato.'); route();
      } catch (e) { $('#jm-body', jm).innerHTML = ''; jmError(jm, e.message); }
    },
  });
  return o;
}
async function pushReport(jobId) {
  try {
    const j = await waitJob(jobId); const sites = (j.result || {}).sites || [];
    const ok = sites.filter((x) => x.ok); const ko = sites.filter((x) => !x.ok);
    const MODE_IT = { full: 'valida', grace: 'in tolleranza', read_only: 'sola lettura', invalid: 'non valida' };
    if (ok.length) toast('Licenza già in vigore sui siti: ' + ok.map((x) => `${x.env} (${MODE_IT[x.mode] || 'inviata'})`).join(', '));
    if (ko.length) toast('Non inviata a: ' + ko.map((x) => `${x.env}: ${x.error}`).join('; '), true);
  } catch (e) { toast(e.message, true); }
}
function projectBlock(p) {
  const nodes = [];
  for (const i of p.instances) {
    for (const e of i.envs) {
      nodes.push(`<div class="node" data-env="${esc(e.id)}"><div class="nt"><span class="ic">${ic(envIcon(e))}</span>${esc(e.name_it)}${e.kind === 'studio-python' ? ' · sede' : ''}${dot(envHealth(e))}</div>
        <div class="nm"><span>${esc(i.label)}</span>${e.url ? `<span class="mono">${esc(e.url.replace(/^https?:\/\//, ''))}</span>` : ''}<span>${esc(ENV_STATUS[e.status]?.[1] || e.status)}${e.app_version ? ' · v' + esc(e.app_version) : ''}</span></div></div>`);
    }
    if (!i.envs.length) nodes.push(`<div class="node" data-inst="${esc(i.id)}"><div class="nt"><span class="ic">${ic('server')}</span>${esc(i.label)}${dot('none')}</div><div class="nm"><span>Installazione senza ambienti</span>${i.licence ? `<span>Licenza ${esc(i.licence.plan)}</span>` : ''}</div></div>`);
  }
  const ws = p.workstations.filter((w) => w.status !== 'revoked');
  nodes.push(`<div class="node" data-ws="${esc(p.id)}"><div class="nt"><span class="ic">${ic('monitor')}</span>Postazioni${dot(ws.length ? 'ok' : 'none')}</div><div class="nm"><span>${ws.length ? ws.map((w) => esc(w.name)).join(', ') : 'Nessuna postazione'}</span></div></div>`);
  if (p.instances.length) nodes.push(`<div class="node add" data-addenv="${esc(p.id)}">${ic('plus')} Aggiungi sito o server</div>`);
  nodes.push(`<div class="node add" data-addinst="${esc(p.id)}">${ic('plus')} Aggiungi installazione</div>`);
  return `<div class="proj"><div class="proj-h">${dot(p.health)}<h3>${esc(p.name)}</h3>${p.status !== 'active' ? `<span class="pill mut">${esc(p.status)}</span>` : ''}
    <button class="btn ghost sm" data-editp="${esc(p.id)}" style="margin-left:auto">${ic('edit')} Rinomina</button></div><div class="pmap">${nodes.join('')}</div></div>`;
}
function bindNodes(el, d) {
  $$('[data-env]', el).forEach((n) => (n.onclick = () => openEnv(n.dataset.env)));
  $$('[data-ws]', el).forEach((n) => (n.onclick = () => (location.hash = `#/clienti/${d.customer.id}/postazioni`)));
  $$('[data-inst]', el).forEach((n) => (n.onclick = () => (location.hash = `#/clienti/${d.customer.id}/licenze`)));
  $$('[data-addinst]', el).forEach((n) => (n.onclick = () => addInstance(d, n.dataset.addinst)));
  $$('[data-addenv]', el).forEach((n) => (n.onclick = () => addEnvironment(d, (d.projects.find((p) => p.id === n.dataset.addenv)?.instances[0] || {}).id)));
  $$('[data-editp]', el).forEach((b) => (b.onclick = () => {
    const p = d.projects.find((x) => x.id === b.dataset.editp);
    modal({ title: 'Rinomina progetto', body: fld('name', 'Nome', { value: p.name, attrs: 'required' }) + sel('status', 'Stato', [['active', 'Attivo'], ['paused', 'In pausa'], ['archived', 'Archiviato']], p.status),
      onSubmit: async (f) => { await api(`/api/projects/${p.id}`, f); closeOverlay(); route(); } });
  }));
}
function addInstance(d, pid) {
  modal({
    title: 'Aggiungi installazione', submit: 'Registra',
    body: `<p class="note" style="margin-top:0">Un'installazione è ciò che riceve una licenza: il sito online, il server di sede o un PC isolato. Dopo averla registrata aggiungi i suoi siti o server (produzione, staging) con «Aggiungi sito o server».</p>
      ${fld('label', 'Nome', { req: true, attrs: 'required', ph: 'Sito online, Server sede, PC archivio…' })}
      ${sel('kind', 'Tipo', [['onprem', 'In sede (on-premise)'], ['cloud', 'Online (cloud)'], ['appliance', 'Appliance']])}`,
    onSubmit: async (f) => { await api('/api/instances', { project_id: pid, label: f.label, kind: f.kind }); closeOverlay(); toast('Installazione registrata.'); route(); },
  });
}
function licMini(lics) {
  if (!lics.length) return '<div class="empty">Nessuna licenza</div>';
  return `<div class="alist">${lics.map((l) => `<div class="al" data-lic="${esc(l.id)}">${dot(LIC_STATE[l.state][0] === 'mut' ? 'none' : LIC_STATE[l.state][0])}<div><b>${esc(l.plan)} · ${esc(l.instance_label)}</b><small>scade ${fmtDate(l.expires_at)}${l.days_left !== null ? ` (${l.days_left < 0 ? 'scaduta' : l.days_left + ' giorni'})` : ''}</small></div></div>`).join('')}</div>`;
}

function tWorkstations(el, d) {
  const hasSede = d.projects.some((p) => p.instances.some((i) => i.role === 'sede'));
  const pk = d.packages || {};
  const sede = hasSede ? `<div class="card mb"><div class="hd"><span style="color:var(--acc)">${ic('building')}</span><h3>Server di sede (il primo PC)</h3><div class="btns">${pk.sede ? `<a class="btn pri sm" href="/scarica/sede/${esc(d.customer.id)}">${ic('download')} Scarica l'installer (${Math.round(pk.sede.size / 1048576 * 10) / 10} MB)</a>` : ''}</div></div>
    <div class="bd" style="color:var(--fg2)">${pk.sede ? `Installer personalizzato con licenza e chiave pubblica: <span class="mono">${esc(pk.sede.name)}</span>. Va sul PC che fa da server; poi le postazioni qui sotto si collegano a lui.` : 'Installer non ancora preparato: confermalo da «Crea progetto con AI» con «Prepara subito i pacchetti», oppure da Strumenti classici, Nuovo cliente guidato.'}</div></div>` : '';
  el.innerHTML = sede + d.projects.map((p) => {
    const ws = p.workstations;
    return `<div class="card mb"><div class="hd"><h3>${esc(p.name)}</h3><div class="btns"><button class="btn pri sm" data-addws="${esc(p.id)}">${ic('plus')} Aggiungi postazione</button></div></div>
      <div class="bd flush">${ws.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Postazione</th><th>Etichetta</th><th>Stato</th><th>Client</th><th>Creata</th><th></th></tr></thead><tbody>
      ${ws.map((w) => `<tr><td><div class="cellname"><div class="av" style="background:var(--acc-soft);color:var(--acc)">${ic('monitor')}</div><div><b>${esc(w.name)}</b><small class="mono">${esc(w.id)}</small></div></div></td>
        <td>${w.tag ? `<span class="tag">${esc(w.tag)}</span>` : '—'}</td><td>${w.status === 'revoked' ? '<span class="pill bad">Revocata</span>' : '<span class="pill ok">Attiva</span>'}</td>
        <td>${w.built_at ? `generato ${ago(w.built_at)}` : '<span style="color:var(--mut)">da generare</span>'}</td><td>${fmtDate(w.created_at)}</td>
        <td class="r"><div class="btns" style="justify-content:flex-end">${w.status !== 'revoked' ? `<button class="btn sm" data-editws="${esc(w.id)}">${ic('edit')}</button><a class="btn sm pri" href="/scarica/postazione/${esc(w.id)}" data-dl="1">${ic('download')} ${w.built_at ? 'Scarica di nuovo' : 'Genera e scarica client'}</a>` : ''}</div></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty"><div class="big">Nessuna postazione</div>Aggiungi i PC dello studio con un nome riconoscibile, es. «PC Luigi» o «Sala studio».</div>`}</div></div>`;
  }).join('');
  $$('[data-dl]', el).forEach((a) => a.addEventListener('click', () => setTimeout(route, 1500)));
  $$('[data-addws]', el).forEach((b) => (b.onclick = () => modal({
    title: 'Nuova postazione', submit: 'Aggiungi',
    body: `${fld('name', 'Nome', { req: true, attrs: 'required', ph: 'PC Luigi' })}${fld('tag', 'Etichetta', { ph: 'Sala studio, Reception, Portatile…' })}`,
    onSubmit: async (f) => { await api('/api/workstations', { project_id: b.dataset.addws, name: f.name, tag: f.tag }); closeOverlay(); toast('Postazione aggiunta.'); route(); },
  })));
  $$('[data-editws]', el).forEach((b) => (b.onclick = () => {
    const w = d.projects.flatMap((p) => p.workstations).find((x) => x.id === b.dataset.editws);
    const f = modal({
      title: `Postazione ${w.name}`,
      body: `${fld('name', 'Nome', { value: w.name, attrs: 'required' })}${fld('tag', 'Etichetta', { value: w.tag || '' })}
        <div class="note warn">Revoca: la postazione resta nello storico ma non si possono più generare client per lei. Usala per un PC dismesso o rubato.</div>
        <div style="margin-top:10px"><button type="button" class="btn danger sm" id="revoke">Revoca postazione</button></div>`,
      onSubmit: async (v) => { await api(`/api/workstations/${w.id}`, v); closeOverlay(); route(); },
    });
    $('#revoke', f).onclick = async () => { if (!confirm(`Revocare «${w.name}»?`)) return; await api(`/api/workstations/${w.id}`, { revoke: true }); closeOverlay(); toast('Postazione revocata.'); route(); };
  }));
}

function tPublish(el, d) {
  const envs = d.projects.flatMap((p) => p.instances.flatMap((i) => i.envs.map((e) => Object.assign({ project: p.name }, e))));
  const web = envs.filter((e) => e.kind === 'web-php');
  el.innerHTML = `
    <div class="card mb"><div class="hd"><h3>Siti e server</h3><div class="btns"><button class="btn sm" id="addenv" ${d.projects.some((p) => p.instances.length) ? '' : 'disabled'}>${ic('plus')} Aggiungi sito o server</button></div></div><div class="bd flush">${envs.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Ambiente</th><th>Indirizzo</th><th>Stato</th><th>Versione</th><th>Ultimo deploy</th><th></th></tr></thead><tbody>
      ${envs.map((e) => `<tr class="click" data-env="${esc(e.id)}"><td><div class="cellname"><div class="av" style="background:var(--acc-soft);color:var(--acc)">${ic(envIcon(e))}</div><div><b>${esc(e.name_it)}</b><small>${esc(e.instance_label)} · ${esc(e.kind_it)}</small></div></div></td>
        <td class="mono">${e.url ? esc(e.url) : '—'}</td><td>${pill(ENV_STATUS, e.status)}</td><td>${esc(e.app_version || e.deployed_version || '—')}</td><td>${e.last_deploy_at ? ago(e.last_deploy_at) : 'mai'}</td>
        <td class="r"><div class="btns" style="justify-content:flex-end">${e.kind === 'web-php' ? `${(d.packages?.web || {})[e.id] ? `<a class="btn sm" href="/scarica/web/${esc(e.id)}" title="Pacchetto da caricare a mano (senza FTP)">${ic('download')} Autoinstall</a>` : `<button class="btn sm" data-pack="${esc(e.id)}" title="Costruisce lo zip del sito da caricare a mano">${ic('download')} Prepara autoinstall</button>`}<button class="btn pri sm" data-plan="${esc(e.id)}">${ic('rocket')} ${e.name === 'production' ? 'Deploy produzione' : 'Deploy staging'}</button>` : ''}</div></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty"><div class="big">Nessun sito o server</div>Aggiungi il sito online o il server di sede con «Aggiungi sito o server».</div>'}</div></div>
    ${web.some((e) => e.name === 'staging') && web.some((e) => e.name === 'production') ? `<div class="card mb"><div class="hd"><h3>Promuovi staging → produzione</h3></div><div class="bd"><p style="margin-top:0;color:var(--fg2)">In produzione va solo la stessa versione già verificata sullo staging. Prima vedi il piano (nessun file toccato), poi confermi.</p>
      ${[...new Set(web.map((e) => e.instance_id))].map((iid) => { const s = web.find((e) => e.instance_id === iid && e.name === 'staging'); const p = web.find((e) => e.instance_id === iid && e.name === 'production'); return s && p ? `<button class="btn pri" data-promote="${esc(iid)}">${ic('rocket')} Prepara la promozione di ${esc(s.instance_label)}</button>` : ''; }).join(' ')}</div></div>` : ''}
    <div class="card"><div class="hd"><h3>Ultimi deploy</h3></div><div class="bd flush">${deployTable(d.deploys)}</div></div>`;
  $$('tr.click', el).forEach((tr) => (tr.onclick = (e) => { if (!e.target.closest('button')) openEnv(tr.dataset.env); }));
  $$('[data-plan]', el).forEach((b) => (b.onclick = () => { const e = envs.find((x) => x.id === b.dataset.plan); runPlan('env', e.id, `${e.instance_label} · ${e.name_it}`); }));
  const ae = $('#addenv', el); if (ae) ae.onclick = () => addEnvironment(d);
  $$('[data-pack]', el).forEach((b) => (b.onclick = async () => {
    b.disabled = true; b.textContent = 'Preparo…';
    try { const r = await api(`/api/envs/${b.dataset.pack}/package`, {}); await waitJob(r.job); toast('Autoinstall pronto: premi «Autoinstall» per scaricarlo.'); route(); }
    catch (e) { toast(e.message, true); b.disabled = false; b.textContent = 'Prepara autoinstall'; }
  }));
  $$('[data-promote]', el).forEach((b) => (b.onclick = () => runPlan('promote', b.dataset.promote, (web.find((e) => e.instance_id === b.dataset.promote) || {}).instance_label)));
}
function deployTable(list) {
  if (!list.length) return '<div class="empty">Nessun deploy</div>';
  const st = { ok: ['ok', 'Riuscito'], done: ['ok', 'Riuscito'], running: ['info', 'In corso'], error: ['bad', 'Fallito'], failed: ['bad', 'Fallito'], rolled_back: ['warn', 'Ripristinato'], dry_run: ['mut', 'Prova'] };
  return `<div class="tbl-wrap"><table class="t"><thead><tr><th>Quando</th><th>Dove</th><th>Versione</th><th>Tipo</th><th>Esito</th></tr></thead><tbody>${list.map((x) => `<tr><td>${fmtDT(x.started_at)}</td><td>${x.customer_id ? `<a href="#/clienti/${esc(x.customer_id)}/pubblica">${esc(x.env_label)}</a>` : esc(x.env_label)}</td><td>${esc(x.version || '—')}</td><td>${x.dry_run ? 'prova' : 'reale'}</td><td>${pill(st, x.status)}</td></tr>`).join('')}</tbody></table></div>`;
}

function tLicences(el, d) {
  const insts = d.projects.flatMap((p) => p.instances.map((i) => [i.id, `${p.name} · ${i.label}`]));
  el.innerHTML = `<div class="card"><div class="hd"><h3>Licenze</h3><div class="btns"><button class="btn pri sm" id="issue" ${insts.length ? '' : 'disabled'}>${ic('plus')} Emetti licenza</button></div></div>
    <div class="bd flush">${licTable(d.licences, false)}</div></div>`;
  bindLicTable(el);
  $('#issue').onclick = () => issueLicence(insts, d.plans);
}
function issueLicence(insts, plans) {
  modal({
    title: 'Emetti licenza', submit: 'Firma ed emetti',
    body: `${sel('instance_id', 'Installazione', insts)}${sel('plan', 'Piano', Object.entries(plans || {}).map(([k, v]) => [k, `${v} (${k})`]), 'studio')}
      ${fld('months', 'Durata in mesi', { type: 'number', hint: 'Vuoto = durata del piano.', attrs: 'min="1" max="120"' })}
      <div class="frow">${fld('l_users', 'Utenti', { type: 'number', attrs: 'min="-1"' })}${fld('l_binders', 'Faldoni', { type: 'number', attrs: 'min="-1"' })}</div>
      ${fld('l_archives', 'Archivi', { type: 'number', attrs: 'min="-1"', hint: 'Limiti vuoti = quelli del piano; -1 = illimitato.' })}`,
    onSubmit: async (f) => {
      const r = await api('/api/licences', { instance_id: f.instance_id, plan: f.plan, months: f.months, limits: { users: f.l_users, binders: f.l_binders, archives: f.l_archives } });
      closeOverlay(); toast('Licenza emessa e firmata.'); await route(); openLicence(r.id);
    },
  });
}
function licTable(list, withCustomer) {
  if (!list.length) return '<div class="empty"><div class="big">Nessuna licenza</div></div>';
  return `<div class="tbl-wrap"><table class="t"><thead><tr>${withCustomer ? '<th>Cliente</th>' : ''}<th>Installazione</th><th>Piano</th><th>Stato</th><th>Scadenza</th><th>Limiti</th><th></th></tr></thead><tbody>
    ${list.map((l) => `<tr class="click" data-lic="${esc(l.id)}">${withCustomer ? `<td><div class="cellname">${av(l.customer_name)}<div><b>${esc(l.customer_name)}</b></div></div></td>` : ''}
      <td>${esc(l.instance_label)}<small style="display:block;color:var(--mut)">${esc(l.project_name || '')}</small></td><td><span class="tag">${esc(l.plan)}</span></td><td>${pill(LIC_STATE, l.state)}</td>
      <td>${fmtDate(l.expires_at)}${l.state !== 'superseded' && l.days_left !== null ? ` <small style="color:var(--mut)">(${l.days_left < 0 ? 'da ' + (-l.days_left) + ' gg' : l.days_left + ' gg'})</small>` : ''}</td>
      <td style="color:var(--fg2);font-size:13px">${l.limits ? Object.entries(l.limits).map(([k, v]) => `${({ users: 'utenti', binders: 'faldoni', archives: 'archivi' })[k] || k} ${v === null ? '∞' : v}`).join(' · ') : '—'}</td>
      <td class="r"><a class="btn sm" href="/download/${esc(l.id)}" title="Scarica il file di licenza">${ic('download')}</a></td></tr>`).join('')}</tbody></table></div>`;
}
function bindLicTable(el) { $$('[data-lic]', el).forEach((tr) => (tr.onclick = (e) => { if (!e.target.closest('a')) openLicence(tr.dataset.lic); })); }

function tSecrets(el, d) {
  const envName = {}; d.projects.forEach((p) => p.instances.forEach((i) => i.envs.forEach((e) => (envName[e.id] = `${i.label} · ${e.name_it}`))));
  const KIND = { ftp: 'Accesso FTP/SFTP', basic_auth: 'Protezione cartella', admin_token: 'Token amministratore', superadmin: 'Super-admin', db_config: 'Configurazione e chiave', note: 'Nota', bridge_token: 'Token del ponte di sincronizzazione' };
  const envs = d.projects.flatMap((p) => p.instances.flatMap((i) => i.envs));
  const vs = S.session?.vault;
  el.innerHTML = `<div class="card mb"><div class="hd"><h3>Accessi e segreti in cassaforte</h3><div class="btns">${vs !== 'open' ? `<button class="btn sm" id="vopen">${ic('unlock')} ${vs === 'none' ? 'Crea' : 'Apri'} la cassaforte</button>` : '<span class="pill ok">Cassaforte aperta</span>'}</div></div>
    <div class="bd flush">${envs.length ? `<table class="t"><thead><tr><th>Ambiente</th><th>Cosa c'è</th><th></th></tr></thead><tbody>${envs.map((e) => { const ss = d.secrets.filter((s) => s.env_id === e.id); return `<tr class="click" data-env="${esc(e.id)}"><td><b>${esc(envName[e.id])}</b><small style="display:block;color:var(--mut)">${esc(e.kind_it)}</small></td>
      <td>${ss.length ? ss.map((s) => `<span class="tag">${esc(KIND[s.kind] || s.kind)}${s.label ? ' · ' + esc(s.label) : ''}</span>`).join(' ') : `<span style="color:var(--mut)">niente${e.kind === 'web-php' ? ': manca l\'accesso FTP per il deploy' : ''}</span>`}</td>
      <td class="r"><button class="btn sm">Gestisci</button></td></tr>`; }).join('')}</tbody></table>`
      : '<div class="empty">Nessun sito o server: aggiungili dalla scheda Pubblica.</div>'}</div></div>
    <div class="note">I segreti non si vedono mai qui: per mostrarne uno l'hub chiede di nuovo la passphrase e lo registra nello storico. Custodia della chiave del cliente: <b>${d.customer.key_escrow ? 'attiva' : 'spenta'}</b>.</div>`;
  $$('tr[data-env]', el).forEach((tr) => (tr.onclick = () => openEnv(tr.dataset.env)));
  const vo = $('#vopen', el); if (vo) vo.onclick = async () => { await unlockVault(); route(); };
}
function tHistory(el, d) {
  el.innerHTML = `<div class="card"><div class="hd"><h3>Storico del cliente</h3></div><div class="bd flush"><div class="feed">${d.events.map((ev) => `<div class="ev"><time title="${esc(ev.at)}">${fmtDT(ev.at)}</time><div>${esc(ev.text)}${evSubj(ev)}</div></div>`).join('') || '<div class="empty">Nessuna attività</div>'}</div></div></div>`;
}
function tData(el, d) {
  const c = d.customer, x = c.extra || {};
  const row = (k, v) => `<dt>${esc(k)}</dt><dd>${v ? esc(v) : '<span style="color:var(--mut)">—</span>'}</dd>`;
  el.innerHTML = `<div class="grid g2"><div class="card"><div class="hd"><h3>Anagrafica</h3><div class="btns"><button class="btn sm" id="ed">${ic('edit')} Modifica</button></div></div><div class="bd"><dl class="kv">
    ${row('Ragione sociale', c.name)}${row('Partita IVA', c.vat_id)}${row('Email', c.email)}${row('PEC', x.pec)}${row('Referente', x.contact)}${row('Telefono', x.phone)}
    ${row('Indirizzo', [x.address, x.city].filter(Boolean).join(', '))}${row('Codice Multi', x.codice_multi)}${row('Codice SDI', x.sdi)}${row('Stato', CUST_STATUS[c.status])}${row('Rivenditore', c.reseller_name)}</dl></div></div>
    <div class="card"><div class="hd"><h3>Note e sistema</h3></div><div class="bd"><p style="white-space:pre-wrap;margin-top:0">${esc(c.notes || 'Nessuna nota.')}</p><dl class="kv">${row('ID', c.id)}${row('Creato', fmtDT(c.created_at).replace(/&amp;/g, '&'))}${row('Progetti', String(d.projects.length))}</dl></div></div></div>`;
  $('#ed').onclick = () => editCustomer(c);
}

// ---------------------------------------------------------------------------------------------
// drawers: environment, licence
// ---------------------------------------------------------------------------------------------
async function openEnv(id) {
  const all = await api('/api/instances'); const e = all.find((x) => x.id === id);
  if (!e) return toast('Ambiente non trovato.', true);
  const deps = (await api('/api/deploys')).filter((x) => x.env_label && x.env_label.startsWith(e.instance_label) && x.customer_id === e.customer_id).slice(0, 8);
  const row = (k, v) => `<dt>${esc(k)}</dt><dd>${v}</dd>`;
  const acts = [];
  if (e.url && /^https?:\/\//.test(e.url)) acts.push(`<a class="btn sm" href="${esc(e.url)}" target="_blank" rel="noreferrer">${ic('ext')} Apri</a>`);
  if (e.kind === 'web-php') acts.push(`<button class="btn sm" data-a="setup" title="setup.php lanciato dall'hub: database e codici in cassaforte">${ic('key')} Configura</button>`);
  if (e.kind === 'web-php') acts.push(`<button class="btn pri sm" data-a="plan">${ic('rocket')} ${e.name === 'production' ? 'Deploy produzione' : 'Deploy ' + esc(e.name_it.toLowerCase())}</button>`);
  if (e.kind === 'local-python') acts.push(`<button class="btn sm" data-a="start">${ic('play')} Avvia</button><button class="btn sm" data-a="stop">${ic('stop')} Ferma</button>`);
  acts.push(`<button class="btn sm" data-a="check">${ic('refresh')} Controlla</button>`);
  if (e.kind !== 'local-python') acts.push(`<button class="btn sm" data-a="edit">${ic('edit')} Indirizzi</button>`);
  const dr = drawer(`${esc(e.name_it)} · ${esc(e.instance_label)}`, `<a href="#/clienti/${esc(e.customer_id)}">${esc(e.customer_name)}</a>${e.project_name ? ' · ' + esc(e.project_name) : ''}`,
    `<div class="sect"><h4>Stato</h4><dl class="kv">${row('Stato', pill(ENV_STATUS, e.status))}${e.error ? row('Dettaglio', esc(e.error)) : ''}${row('Ultimo controllo', ago(e.last_check))}
      ${row('Versione', esc(e.app_version || '—'))}${row('Verificata su staging', esc(e.verified_version || '—'))}${row('Ultimo deploy', ago(e.last_deploy_at))}${row('Ultimo backup', ago(e.last_backup_at))}</dl></div>
    <div class="sect"><h4>Configurazione</h4><dl class="kv">${row('Tipo', esc(e.kind_it))}${row('Indirizzo', e.url ? `<span class="mono">${esc(e.url)}</span>` : '—')}${row('API', e.api_url ? `<span class="mono">${esc(e.api_url)}</span>` : 'automatica')}
      ${e.port ? row('Porta', esc(e.port)) : ''}${e.base_path ? row('Cartella sul sito', `<span class="mono">${esc(e.base_path)}</span>`) : ''}${e.expires_at ? row('Scade', fmtDate(e.expires_at)) : ''}${row('ID', `<span class="mono">${esc(e.id)}</span>`)}</dl></div>
    <div class="sect"><h4>Licenza</h4>${e.licence ? `<div class="al" data-lic="${esc(e.licence.id)}" style="border:1px solid var(--line);border-radius:8px">${dot(LIC_STATE[e.licence.state][0])}<div><b>${esc(e.licence.plan)}</b><small>${esc(LIC_STATE[e.licence.state][1])}${e.licence.days_left !== null ? ' · ' + e.licence.days_left + ' giorni' : ''}</small></div></div>` : '<span style="color:var(--mut)">Nessuna licenza per questa installazione.</span>'}</div>
    <div class="sect"><h4>Accessi in cassaforte</h4><div id="env-sec"><div style="color:var(--mut)">Carico…</div></div></div>
    ${e.kind === 'web-php' ? `<div class="sect"><h4>Cosa aggiorna il deploy</h4><p style="margin:0;color:var(--fg2);font-size:13px">Solo il programma (il motore). I dati del cliente, <span class="mono">config.php</span> e i .htaccess modificati a mano restano dove sono; prima di ogni caricamento l'hub fa il backup del server e, se il controllo finale fallisce, rimette da solo i file di prima.</p></div>` : ''}
    <div class="sect"><h4>Deploy recenti</h4>${deployTable(deps)}</div>`, acts.join(''));
  secretsSection($('#env-sec', dr), e);
  $$('[data-lic]', dr).forEach((x) => (x.onclick = () => openLicence(x.dataset.lic)));
  $$('[data-a]', dr).forEach((b) => (b.onclick = async () => {
    const a = b.dataset.a;
    if (a === 'plan') { closeOverlay(); return runPlan('env', e.id, `${e.instance_label} · ${e.name_it}`); }
    if (a === 'setup') { closeOverlay(); return siteSetup(e.id, `${e.instance_label} · ${e.name_it}`); }
    if (a === 'start' || a === 'stop') return envJob(e, a);
    if (a === 'edit') { closeOverlay(); return editEnvironment(e); }
    if (a === 'check') { closeOverlay(); await checkAll(); }
  }));
}
async function openLicence(id) {
  const d = await api(`/api/licences/${encodeURIComponent(id)}`); const l = d.licence, r = d.row, c = d.control || {};
  const row = (k, v) => `<dt>${esc(k)}</dt><dd>${v}</dd>`;
  const MODE = { full: ['ok', 'Valida'], grace: ['warn', 'In tolleranza'], read_only: ['bad', 'Sola lettura'], invalid: ['bad', 'Non valida'] };
  const FEAT = { sync_server: 'Server condiviso', mobile_scan: 'Scansione da telefono', status_events: 'Stati e movimenti', ai_credits: 'Crediti AI', white_label: 'Marchio del rivenditore' };
  const pub = !c.channel ? '<span style="color:var(--mut)">canale non impostato: il file va consegnato a mano</span>'
    : !c.update_url ? '<span class="pill warn">senza indirizzo del canale</span> <small style="color:var(--mut)">riemettila con «Modifica» → Salva</small>'
      : c.published ? '<span class="pill ok">pubblicata</span> <small style="color:var(--mut)">il server la scarica da solo entro 6 ore</small>' : '<span class="pill warn">da pubblicare</span>';
  const ar = c.autorenew;
  const cur = c.is_current && r.state !== 'superseded';
  const acts = [`<a class="btn sm" href="/download/${esc(l.licence_id)}">${ic('download')} Scarica</a>`];
  if (cur) acts.push(`<button class="btn sm" data-x="push" title="Carica questa licenza sui siti online dell'installazione (FTP)">${ic('rocket')} Invia ai siti</button>`);
  if (cur && c.status === 'active') acts.push(`<button class="btn pri sm" data-x="renew">${ic('refresh')} Rinnova</button>`, `<button class="btn sm" data-x="modify">${ic('edit')} Modifica</button>`, `<button class="btn sm" data-x="suspend">${ic('lock')} Sospendi</button>`);
  if (cur && c.status !== 'active') acts.push(`<button class="btn pri sm" data-x="reactivate">${ic('unlock')} Riattiva</button>`);
  if (cur && c.status !== 'revoked') acts.push(`<button class="btn ghost sm" data-x="revoke" style="color:var(--bad)">Revoca</button>`);
  const dr = drawer(`Licenza ${esc(l.plan)}`, `<a href="#/clienti/${esc(r.customer_id)}/licenze">${esc(l.customer.name)}</a> · ${esc(r.instance_label || '')}`,
    `${c.status !== 'active' ? `<div class="note warn" style="margin-bottom:12px"><b>${c.status === 'revoked' ? 'Licenza revocata' : 'Licenza sospesa'}.</b> L'installazione è in sola lettura: i dati restano consultabili ed esportabili. ${c.status === 'revoked' ? 'Rinnovi e rinnovo automatico sono bloccati finché non la riattivi.' : 'Con «Riattiva» torna come prima.'}</div>` : ''}
    <div class="sect"><h4>Stato</h4><dl class="kv">${row('Stato', pill(LIC_STATE, r.state))}${row('Verifica firma', pill(MODE, d.verify.mode))}${row('Valida dal', fmtDate(l.valid_from))}${row('Scade il', c.status === 'active' ? fmtDate(l.expires_at) : `${fmtDate((l.resume || {}).expires_at)} <small style="color:var(--mut)">(alla riattivazione)</small>`)}${row('Tolleranza', esc(c.status === 'active' ? l.grace_days : (l.resume || {}).grace_days) + ' giorni')}</dl></div>
    <div class="sect"><h4>Consegna al server</h4><dl class="kv">${row('Canale', pub)}${c.update_url ? row('Indirizzo', `<span class="mono" style="font-size:12px;word-break:break-all">${esc(c.update_url)}</span>`) : ''}</dl></div>
    <div class="sect"><h4>Rinnovo automatico</h4><p style="margin:0 0 8px;color:var(--fg2);font-size:13px">${ar ? `<span class="pill ok">Attivo</span> licenze da ${ar.days} giorni, rinnovate quando ne mancano ${ar.renew_before}${ar.until ? `, fino al ${fmtDate(ar.until)}` : ''}. Se lo spegni o sospendi, l'installazione va in sola lettura da sola alla fine del periodo (più la tolleranza).` : '<span class="pill mut">Spento</span> Con licenze brevi rinnovate dall\'hub hai il controllo anche senza raggiungere il cliente.'}</p>
      ${cur && c.status === 'active' ? `<button class="btn sm" data-x="autorenew">${ic('refresh')} ${ar ? 'Modifica o spegni' : 'Attiva'}</button>` : ''}</div>
    <div class="sect"><h4>Limiti e funzioni</h4><dl class="kv">${Object.entries(l.limits || {}).map(([k, v]) => row(({ users: 'Utenti', binders: 'Faldoni', archives: 'Archivi' })[k] || k, v === null ? 'illimitati' : esc(v))).join('')}
      ${row('Funzioni', (l.features || []).map((f) => `<span class="tag">${esc(FEAT[f] || f)}</span>`).join(' ') || '—')}${l.reseller ? row('Rivenditore', esc(l.reseller.name)) : ''}</dl></div>
    <div class="sect"><h4>Storia di questa installazione</h4>${d.history.map((h) => `<div class="al" data-lic="${esc(h.id)}" style="padding:8px 0">${dot(LIC_STATE[h.state][0] === 'mut' ? 'none' : LIC_STATE[h.state][0])}<div><b>${esc(h.plan)}${h.id === l.licence_id ? ' (questa)' : ''}</b><small>emessa ${fmtDT(h.issued_at)} · ${esc(LIC_STATE[h.state][1])}${h.state !== 'suspended' && h.state !== 'revoked' ? ` · fino al ${fmtDate(h.expires_at)}` : ''}</small></div></div>`).join('')}</div>
    <div class="sect"><h4>Tecnico</h4><dl class="kv">${row('ID', `<span class="mono">${esc(l.licence_id)}</span>`)}${row('Installazione', `<span class="mono">${esc(l.instance_id)}</span>`)}${row('Chiave di firma', `<span class="mono">${esc(l.key_id)}</span>`)}${row('File', `<span class="mono">${esc(d.filename)}</span>`)}</dl></div>`,
    acts.join(''));
  $$('[data-lic]', dr).forEach((x) => (x.onclick = () => { if (x.dataset.lic !== l.licence_id) openLicence(x.dataset.lic); }));
  const iid = l.instance_id;
  const done = async (res, msg) => {
    closeOverlay(); toast(msg);
    if (res.push_job) await pushReport(res.push_job);
    else if (!S.session.vault || S.session.vault !== 'open') toast('Cassaforte chiusa: se ci sono siti online, la licenza arriva con il prossimo deploy o dal canale. Per subito: apri la cassaforte e premi «Invia ai siti».', true);
    if (res.publish_job) { try { await waitJob(res.publish_job); toast('Pubblicata nel canale: il server la scarica da solo.'); } catch (e) { toast(e.message, true); } }
    await route(); if (res.id) openLicence(res.id);
  };
  const act = (a, body) => api(`/api/instances/${iid}/licence/${a}`, body || {});
  $$('[data-x]', dr).forEach((b) => (b.onclick = () => {
    const x = b.dataset.x;
    if (x === 'push') return (async () => { try { const r = await withVault(() => api(`/api/instances/${iid}/licence/push`, {})); toast('Invio in corso…'); await pushReport(r.job); } catch (e) { toast(e.message, true); } })();
    if (x === 'renew') return modal({
      title: 'Rinnova o estendi la licenza', submit: 'Firma il rinnovo',
      body: `<p class="note" style="margin-top:0">La nuova licenza vale subito e si somma alla scadenza attuale se non è ancora passata. Puoi anche cambiare piano.</p>
        ${fld('months', 'Mesi in più', { type: 'number', value: '12', attrs: 'min="1" max="120"' })}
        ${sel('plan', 'Piano', [['', `Stesso piano (${l.plan})`]].concat(Object.entries(S.cust?.plans || {}).map(([k, v]) => [k, `${v} (${k})`])))}`,
      onSubmit: async (f) => { const n = await api(`/api/licences/${l.licence_id}/renew`, f); closeOverlay(); toast('Licenza rinnovata.'); if (n.push_job) await pushReport(n.push_job); await route(); openLicence(n.id); },
    });
    if (x === 'modify') {
      const lim = l.limits || {}; const v = (k) => (lim[k] === null || lim[k] === undefined ? '' : String(lim[k]));
      return modal({
        title: 'Modifica la licenza', submit: 'Firma la modifica',
        body: `<p class="note" style="margin-top:0">L'hub emette una nuova licenza con le stesse date e le modifiche qui sotto; quella attuale viene sostituita. Limiti vuoti = illimitati.</p>
          <div class="frow">${fld('l_users', 'Utenti', { type: 'number', value: v('users'), attrs: 'min="0"' })}${fld('l_binders', 'Faldoni', { type: 'number', value: v('binders'), attrs: 'min="0"' })}${fld('l_archives', 'Archivi', { type: 'number', value: v('archives'), attrs: 'min="0"' })}</div>
          <div class="frow">${fld('expires_at', 'Scadenza', { type: 'date', value: String(l.expires_at).slice(0, 10) })}${fld('grace_days', 'Giorni di tolleranza', { type: 'number', value: String(l.grace_days), attrs: 'min="0" max="365"' })}</div>
          <div class="f"><label>Funzioni</label>${c.features_known.map((f) => `<label class="check"><input type="checkbox" name="feat_${f}" ${(l.features || []).includes(f) ? 'checked' : ''}> <span>${esc(FEAT[f] || f)}</span></label>`).join('')}</div>`,
        onSubmit: async (f) => {
          const lim2 = {}; for (const k of ['users', 'binders', 'archives']) lim2[k] = f['l_' + k] === '' ? -1 : f['l_' + k];
          const feats = c.features_known.filter((k) => f['feat_' + k]);
          await done(await act('modify', { limits: lim2, features: feats, expires_at: f.expires_at !== String(l.expires_at).slice(0, 10) ? f.expires_at : '', grace_days: f.grace_days }), 'Licenza modificata.');
        },
      });
    }
    if (x === 'suspend') return modal({
      title: 'Sospendi la licenza', submit: 'Sospendi', danger: true,
      body: `<p style="margin-top:0">L'installazione passa in <b>sola lettura</b> appena riceve la nuova licenza: i <b>siti online</b> subito (l'hub la carica via FTP, con la cassaforte aperta), il <b>server in sede</b> dal canale entro 6 ore o installandola a mano. I dati non si perdono: si consultano, si stampano e si esportano. Con «Riattiva» torna come prima, con la stessa scadenza.</p>${fld('reason', 'Motivo (resta solo nello storico dell\'hub)', { ph: 'es. fattura non pagata' })}`,
      onSubmit: async (f) => done(await act('suspend', f), 'Licenza sospesa.'),
    });
    if (x === 'revoke') return modal({
      title: 'Revoca la licenza', submit: 'Revoca', danger: true,
      body: `<p style="margin-top:0">Per la fine del contratto: sola lettura, rinnovo automatico spento, rinnovi bloccati. Si può annullare con «Riattiva».</p>${fld('reason', 'Motivo (solo nello storico)')}<label class="check"><input type="checkbox" name="sure"> <span>Confermo la revoca</span></label>`,
      onSubmit: async (f) => done(await act('revoke', f), 'Licenza revocata.'),
    });
    if (x === 'reactivate') return modal({
      title: 'Riattiva la licenza', submit: 'Riattiva',
      body: `<p style="margin-top:0">Torna valida con la scadenza di prima (${fmtDate((l.resume || {}).expires_at)}). Se nel frattempo è passata, indica di quanti mesi prolungarla.</p>${fld('months', 'Mesi in più (facoltativo)', { type: 'number', attrs: 'min="1" max="120"' })}`,
      onSubmit: async (f) => done(await act('reactivate', f), 'Licenza riattivata.'),
    });
    if (x === 'autorenew') {
      const form = modal({
        title: 'Rinnovo automatico', submit: 'Salva',
        body: `<label class="check"><input type="checkbox" name="on" ${ar || !ar ? 'checked' : ''}> <span>Rinnova da solo con licenze brevi</span></label>
          <div class="frow mt">${fld('days', 'Durata di ogni licenza (giorni)', { type: 'number', value: String(ar?.days || 35), attrs: 'min="7" max="366"' })}${fld('renew_before', 'Rinnova quando mancano (giorni)', { type: 'number', value: String(ar?.renew_before || 10), attrs: 'min="1"' })}</div>
          ${fld('until', 'Fino al (facoltativo, es. fine contratto)', { type: 'date', value: ar?.until ? String(ar.until).slice(0, 10) : '' })}
          ${ar ? '' : '<label class="check"><input type="checkbox" name="now" checked> <span>Passa subito a una licenza breve (sostituisce quella attuale)</span></label>'}
          <div class="note mt">L'hub rinnova mentre è aperto e sbloccato e pubblica la licenza nel canale. Se l'hub resta chiuso a lungo, l'installazione usa i giorni di tolleranza: tienilo in conto nella durata.</div>`,
        onSubmit: async (f) => {
          const res = await api(`/api/instances/${iid}/licence/autorenew`, { on: f.on, days: f.days, renew_before: f.renew_before, until: f.until, now: !!f.now });
          await done(res, f.on ? 'Rinnovo automatico attivo.' : 'Rinnovo automatico spento.');
        },
      });
      return form;
    }
  }));
}

// ---- settings: licence channel + encrypted export --------------------------------------------
async function channelCard(box) {
  let d; try { d = await api('/api/licence-channel'); } catch (e) { box.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
  const ch = d.channel; const rows = d.rows || [];
  const pend = rows.filter((r) => r.update_url && !r.published).length, noUrl = rows.filter((r) => !r.update_url && r.status === 'active').length;
  box.innerHTML = `<p style="margin-top:0;color:var(--fg2)">L'hub mette ogni licenza firmata in una cartella del <b>tuo</b> sito (<span class="mono">licenze/</span>, indirizzi non indovinabili, nessun dato segreto). Ogni server DocMap la scarica da solo ogni 6 ore e la installa solo se è più recente: così sospensioni, riattivazioni, nuovi limiti e rinnovi automatici arrivano senza toccare il PC del cliente.</p>
    ${ch ? `<dl class="kv"><dt>Sito del canale</dt><dd>${esc(ch.label)}</dd><dt>Indirizzo</dt><dd class="mono">${esc(ch.base_url)}</dd><dt>Licenze</dt><dd>${rows.filter((r) => r.published).length} pubblicate · ${pend} da pubblicare${noUrl ? ` · ${noUrl} senza indirizzo (emesse prima del canale)` : ''}</dd></dl>` : '<p><span class="pill mut">Non impostato</span> Le licenze si consegnano a mano.</p>'}
    ${d.error ? `<div class="note warn">${esc(d.error)}</div>` : ''}
    <div class="btns mt"><button class="btn sm" id="ch-set">${ic('globe')} ${ch ? 'Cambia sito' : 'Imposta il canale'}</button>${ch ? `<button class="btn pri sm" id="ch-pub">${ic('rocket')} Pubblica adesso${noUrl ? ' (e aggiungi l\'indirizzo)' : ''}</button>` : ''}</div>`;
  $('#ch-set', box).onclick = () => {
    if (!d.envs.length) return toast('Registra prima un sito online (web-php) con l\'accesso FTP: per esempio il tuo sito, come cliente «interno».', true);
    modal({
      title: 'Canale delle licenze', submit: 'Salva',
      body: `${sel('env_id', 'Sito che ospita la cartella licenze/', [['', '— nessuno (consegna a mano) —']].concat(d.envs.map((e) => [e.id, `${e.label} (${e.url || 'senza indirizzo'})`])), ch?.env_id || '')}
        <div class="note">Scegli un sito tuo, sempre online (es. docmap.pr-it.it). Servono il suo accesso FTP in cassaforte. Le licenze emesse da ora in poi conterranno l'indirizzo; per quelle già emesse usa «Pubblica adesso».</div>`,
      onSubmit: async (f) => { await api('/api/licence-channel', f); closeOverlay(); toast('Canale salvato.'); channelCard(box); },
    });
  };
  const pb = $('#ch-pub', box); if (pb) pb.onclick = async () => {
    pb.disabled = true;
    try { const r = await withVault(() => api('/api/licence-channel/publish', { reissue: noUrl > 0 })); const j = await waitJob(r.job); toast(`Pubblicate: ${j.result?.published ?? 0}`); } catch (e) { toast(e.message, true); }
    channelCard(box);
  };
}
function exportHub() {
  modal({
    title: 'Esporta tutto l\'hub (cifrato)', submit: 'Esporta',
    body: `<p class="note" style="margin-top:0">Un solo file <span class="mono">.docmap-hub</span> con chiavi, registro, clienti, licenze e cassaforte, cifrato con una passphrase che scegli adesso (almeno 12 caratteri). Serve per spostare l'hub su un PC nuovo o, domani, sul server: <span class="mono">run_windows.bat importa-hub FILE</span>.</p>
      ${fld('passphrase', 'Passphrase dell\'esportazione', { type: 'password', attrs: 'required autocomplete="new-password"' })}${fld('again', 'Ripeti', { type: 'password', attrs: 'required autocomplete="new-password"' })}
      <div class="note warn">Senza questa passphrase il file non si apre: annotala separata dal file.</div>`,
    onSubmit: async (f, form) => {
      const r = await api('/api/export', f);
      $('.bd', form).innerHTML = `<div class="okbox"><div><b>Esportazione pronta</b><small>${esc(r.name)} · ${Math.round(r.size / 1024)} KB</small></div></div><p class="mt"><a class="btn pri" href="/scarica/backup/${encodeURIComponent(r.name)}">${ic('download')} Scarica il file</a></p>`;
      const sb = $('button[type=submit]', form); if (sb) sb.remove(); const cb = $('.ft .btn.ghost', form); if (cb) cb.textContent = 'Chiudi';
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Pipeline 1: Crea progetto con AI
// ---------------------------------------------------------------------------------------------
const STEPS = [
  ['cliente', 'Cliente', ['cliente']],
  ['progetto', 'Progetto e licenza', ['progetto', 'licenza']],
  ['online', 'Online e FTP', ['online']],
  ['sede', 'Sede e postazioni', ['sede', 'postazioni']],
  ['utenti', 'Utenti e archivi', ['utenti_iniziali', 'archivi', 'domande_aperte']],
  ['riepilogo', 'Riepilogo e conferma', []],
];
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { } ta.remove(); return ok;
  }
}
function download(name, text, type = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
async function pPipeline(page, draftId, step) {
  if (!S.pp) S.pp = await api('/api/pipeline/prompt');
  if (draftId) return pDraft(page, draftId, step || 'cliente');
  setCrumbs([['Crea progetto con AI']]);
  const drafts = (await api('/api/drafts')).filter((d) => d.status !== 'confirmed');
  page.innerHTML = `<div class="ph"><div><h1>${ic('sparkle')} Crea progetto con AI</h1><div class="sub">Funziona con qualsiasi AI (Claude, ChatGPT, Gemini, un modello locale o un agente con accesso ai tuoi file). L'hub non chiama nessuna AI e le password non passano mai dall'AI.</div></div></div>
    <div class="grid g2">
      <div class="card"><div class="hd"><span class="pill info">1</span><h3>Copia il prompt e parla con l'AI</h3></div><div class="bd">
        <p style="margin-top:0;color:var(--fg2)">Il prompt contiene il contesto di DocMap, le regole, i piani di licenza, il <b>modello JSON completo</b> e un esempio. Incollalo in una chat nuova: l'AI ti fa le domande e alla fine ti dà il JSON pronto.</p>
        <div class="btns"><button class="btn ai" id="copy">${ic('sparkle')} Copia prompt per l'AI</button><button class="btn" id="dl-tpl">${ic('download')} Modello JSON</button><button class="btn ghost" id="show">Vedi il prompt</button></div>
        <textarea id="ptxt" rows="14" readonly hidden style="margin-top:12px">${esc(S.pp.prompt)}</textarea></div></div>
      <div class="card"><div class="hd"><span class="pill info">2</span><h3>Incolla il JSON e genera la bozza</h3></div><div class="bd">
        <div class="err-box" id="perr" hidden></div>
        <textarea id="pjson" rows="12" placeholder='Incolla qui la risposta dell&#39;AI (anche tutto il messaggio: trovo io il JSON).'></textarea>
        <div class="btns" style="margin-top:12px"><button class="btn pri" id="gen">${ic('sparkle')} Genera bozza</button><button class="btn ghost" id="ex">Prova con l'esempio</button></div></div></div>
    </div>
    <div class="card mt"><div class="hd"><h3>Bozze in corso</h3><span class="pill mut">${drafts.length}</span></div><div class="bd flush">
      ${drafts.length ? `<div class="alist">${drafts.map((d) => `<div class="al" data-d="${esc(d.id)}">${dot('warn')}<div><b>${esc(d.title || 'Senza titolo')}</b><small>aggiornata ${ago(d.updated_at)}</small></div></div>`).join('')}</div>` : '<div class="empty">Nessuna bozza aperta.</div>'}</div></div>`;
  $('#copy').onclick = async () => toast((await copyText(S.pp.prompt)) ? 'Prompt copiato: incollalo in una nuova chat con l\'AI.' : 'Copia non riuscita: usa «Vedi il prompt» e copia a mano.', false);
  $('#dl-tpl').onclick = () => download('docmap-progetto-modello.json', JSON.stringify(S.pp.template, null, 2));
  $('#show').onclick = () => { const t = $('#ptxt'); t.hidden = !t.hidden; };
  $('#ex').onclick = () => { $('#pjson').value = JSON.stringify(S.pp.example, null, 2); };
  $('#gen').onclick = async () => {
    const eb = $('#perr'); eb.hidden = true;
    try { const d = await api('/api/drafts', { text: $('#pjson').value }); S.draft = d; toast('Bozza generata: controlla le maschere.'); location.hash = `#/nuovo-progetto/${d.id}/cliente`; }
    catch (e) { eb.textContent = e.message; eb.hidden = false; }
  };
  $$('[data-d]', page).forEach((el) => (el.onclick = () => (location.hash = `#/nuovo-progetto/${el.dataset.d}/cliente`)));
}

const getP = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setP(o, path, v) { const ks = path.split('.'); let a = o; ks.slice(0, -1).forEach((k) => (a = a[k])); a[ks[ks.length - 1]] = v; }
function pf(path, label, { type = 'text', hint = '', ph = '', full = false } = {}) {
  const v = getP(S.draft.data, path);
  return `<div class="f"${full ? ' style="grid-column:1/-1"' : ''} data-wrap="${esc(path)}"><label>${esc(label)}</label><input data-p="${esc(path)}" data-t="${type}" type="${type === 'int' ? 'number' : type}" value="${esc(v ?? '')}" placeholder="${esc(ph)}">${hint ? `<div class="hint">${hint}</div>` : ''}<div class="hint perr" style="color:var(--bad)"></div></div>`;
}
function psel(path, label, opts, hint = '') {
  const v = getP(S.draft.data, path);
  return `<div class="f" data-wrap="${esc(path)}"><label>${esc(label)}</label><select data-p="${esc(path)}">${opts.map(([k, t]) => `<option value="${esc(k)}"${String(k) === String(v) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>${hint ? `<div class="hint">${hint}</div>` : ''}<div class="hint perr" style="color:var(--bad)"></div></div>`;
}
function issuesFor(prefixes) {
  const c = S.draft.check, m = (x) => prefixes.some((p) => x.path === p || x.path.startsWith(p + '.'));
  return { e: c.errors.filter(m), w: c.warnings.filter(m) };
}
async function pDraft(page, id, step) {
  if (!S.draft || S.draft.id !== id) S.draft = await api(`/api/drafts/${encodeURIComponent(id)}`);
  const D = S.draft;
  setCrumbs([['Crea progetto con AI', '#/nuovo-progetto'], [D.title || 'Bozza']]);
  const confirmed = D.status === 'confirmed';
  page.innerHTML = `<div class="ph"><div><h1>${esc(D.title || 'Bozza')}</h1><div class="sub">Percorso guidato · salvato da solo a ogni modifica · ${confirmed ? '<span class="pill ok">Confermata</span>' : '<span class="pill warn">Da confermare</span>'}</div></div>
      <div class="btns"><button class="btn ghost" id="dl">${ic('download')} Esporta JSON</button>${confirmed && D.result ? `<a class="btn pri" href="#/clienti/${esc(D.result.customer_id)}">Apri il cliente</a>` : `<button class="btn danger" id="del">Elimina bozza</button>`}</div></div>
    <div class="grid" style="grid-template-columns:240px minmax(0,1fr);align-items:start" id="dgrid">
      <div class="card"><div class="bd flush" id="stepper"></div></div>
      <div class="card"><div class="hd"><h3 id="st-title"></h3><div class="btns" id="st-badges"></div></div><div class="bd" id="st-body"></div>
        <div class="ft" style="display:flex;gap:8px;justify-content:space-between;padding:12px 16px;border-top:1px solid var(--line);background:var(--panel2);border-radius:0 0 10px 10px"><button class="btn" id="prev">Indietro</button><button class="btn pri" id="next">Avanti</button></div></div>
    </div>`;
  if (window.innerWidth < 820) $('#dgrid').style.gridTemplateColumns = '1fr';
  $('#dl').onclick = () => download(`${(D.title || 'progetto').replace(/[^\w-]+/g, '-')}.json`, JSON.stringify(D.data, null, 2));
  const del = $('#del'); if (del) del.onclick = async () => { if (!confirm('Eliminare questa bozza?')) return; await api(`/api/drafts/${D.id}/delete`, {}); S.draft = null; location.hash = '#/nuovo-progetto'; };
  const idx = Math.max(0, STEPS.findIndex((s) => s[0] === step));
  const drawStepper = () => {
    $('#stepper').innerHTML = `<div class="alist">${STEPS.map(([k, t, pre], i) => {
      const is = issuesFor(pre); const st = is.e.length ? 'bad' : is.w.length ? 'warn' : 'ok';
      return `<a class="al" href="#/nuovo-progetto/${esc(D.id)}/${k}" style="text-decoration:none;color:inherit;${i === idx ? 'background:var(--acc-soft)' : ''}">${k === 'riepilogo' ? dot(S.draft.check.errors.length ? 'bad' : 'ok') : dot(st)}<div><b>${i + 1}. ${esc(t)}</b><small>${k === 'riepilogo' ? (S.draft.check.errors.length ? S.draft.check.errors.length + ' da correggere' : 'pronto') : is.e.length ? is.e.length + ' errori' : is.w.length ? is.w.length + ' avvisi' : 'ok'}</small></div></a>`;
    }).join('')}</div>`;
  };
  const markErrors = () => {
    $$('[data-wrap]', page).forEach((w) => { const p = w.dataset.wrap; const e = S.draft.check.errors.find((x) => x.path === p); const pe = $('.perr', w); if (pe) pe.textContent = e ? e.msg : ''; });
    const pre = STEPS[idx][2]; const is = issuesFor(pre);
    $('#st-badges').innerHTML = (is.e.length ? `<span class="pill bad">${is.e.length} errori</span>` : '') + (is.w.length ? `<span class="pill warn">${is.w.length} avvisi</span>` : '');
    const box = $('#st-issues'); if (box) box.innerHTML = is.e.concat(is.w).filter((x) => !$(`[data-wrap="${CSS.escape(x.path)}"]`, page)).map((x) => `<div class="note ${is.e.includes(x) ? '' : 'warn'}" style="margin-bottom:6px${is.e.includes(x) ? ';background:var(--bad-soft);color:var(--bad)' : ''}">${esc(x.msg)}</div>`).join('');
    drawStepper();
  };
  let timer;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try { const r = await api(`/api/drafts/${D.id}`, { data: S.draft.data }); S.draft.check = r.check; S.draft.title = r.title; markErrors(); }
      catch (e) { toast(e.message, true); }
    }, 350);
  };
  const bind = () => {
    if (confirmed) $$('input,select,textarea', $('#st-body')).forEach((el) => { if (!el.dataset.keep) el.disabled = true; });
    $$('[data-p]', page).forEach((el) => {
      el.oninput = el.onchange = () => {
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (el.dataset.t === 'int') v = el.value === '' ? null : parseInt(el.value, 10);
        if (el.dataset.t === 'list') v = el.value.split(',').map((x) => x.trim()).filter(Boolean);
        setP(S.draft.data, el.dataset.p, v); save();
      };
    });
  };
  const d = S.draft.data;
  const body = $('#st-body'); $('#st-title').textContent = `${idx + 1}. ${STEPS[idx][1]}`;
  const listRows = (key, cols, empty) => {
    const rows = d[key];
    return `<div class="tbl-wrap"><table class="t"><thead><tr>${cols.map((c) => `<th>${esc(c[1])}</th>`).join('')}<th></th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr>${cols.map(([k, , opts]) => `<td>${opts ? `<select data-p="${key}.${i}.${k}">${opts.map(([v, t]) => `<option value="${v}"${r[k] === v ? ' selected' : ''}>${t}</option>`).join('')}</select>` : `<input data-p="${key}.${i}.${k}" value="${esc(r[k] || '')}">`}</td>`).join('')}
        <td class="r"><button class="btn ghost sm" data-rm="${key}.${i}" title="Togli">${ic('x')}</button></td></tr>`).join('') || `<tr><td colspan="${cols.length + 1}" style="color:var(--mut)">${esc(empty)}</td></tr>`}</tbody></table></div>
      <button class="btn sm" style="margin-top:8px" data-add="${key}">${ic('plus')} Aggiungi</button>`;
  };
  const k = STEPS[idx][0];
  if (k === 'cliente') {
    body.innerHTML = `<div class="frow">${pf('cliente.ragione_sociale', 'Ragione sociale *')}${pf('cliente.partita_iva', 'Partita IVA / C.F.')}</div>
      <div class="frow">${pf('cliente.email', 'Email')}${pf('cliente.pec', 'PEC')}</div><div class="frow">${pf('cliente.referente', 'Referente')}${pf('cliente.telefono', 'Telefono')}</div>
      <div class="frow">${pf('cliente.indirizzo', 'Indirizzo')}${pf('cliente.citta', 'Città')}</div><div class="frow">${pf('cliente.provincia', 'Provincia')}${pf('cliente.codice_sdi', 'Codice SDI')}</div>
      <div class="frow">${pf('cliente.codice_multi', 'Codice Multi')}${psel('cliente.stato', 'Stato', [['active', 'Cliente attivo'], ['prospect', 'Trattativa']])}</div>
      <div class="frow">${psel('cliente.rivenditore', 'Rivenditore', [['', 'Nessuno (vendita diretta)']].concat((S.pp.resellers || []).map((r) => [r, r])))}${pf('cliente.colore', 'Colore (#RRGGBB)', { ph: '#2f5bea' })}</div>
      <div class="f" data-wrap="cliente.etichette"><label>Etichette (separate da virgola)</label><input data-p="cliente.etichette" data-t="list" value="${esc((d.cliente.etichette || []).join(', '))}"></div>
      <div class="f"><label>Note</label><textarea data-p="cliente.note" rows="3" style="font-family:inherit;font-size:14px">${esc(d.cliente.note)}</textarea></div><div id="st-issues"></div>`;
  } else if (k === 'progetto') {
    const inst = d.progetto.installazioni;
    body.innerHTML = `<div class="frow">${pf('progetto.nome', 'Nome del progetto', { ph: 'DocMap Studio Rossi' })}${pf('progetto.nome_studio', 'Nome mostrato nell\'app e sulle etichette')}</div>
      <div class="f" data-wrap="progetto.installazioni"><label>Installazioni</label><div class="btns">
        <label class="check"><input type="checkbox" data-inst="sede" ${inst.includes('sede') ? 'checked' : ''}> <span><b>Sede</b>: server su un PC dello studio</span></label>
        <label class="check"><input type="checkbox" data-inst="online" ${inst.includes('online') ? 'checked' : ''}> <span><b>Online</b>: sito web su hosting</span></label></div><div class="hint perr" style="color:var(--bad)"></div></div>
      <label class="check" style="margin-bottom:14px"><input type="checkbox" data-p="progetto.custodia_chiave" ${d.progetto.custodia_chiave ? 'checked' : ''}> <span><b>Custodia della chiave</b> del cliente nell'hub (solo con il suo consenso scritto)</span></label>
      <h4 style="margin:6px 0 10px">Licenza</h4>
      <div class="frow">${psel('licenza.piano', 'Piano', Object.entries(S.pp.plans).map(([kk, v]) => [kk, `${v} (${kk})`]))}${pf('licenza.mesi', 'Durata in mesi', { type: 'int', hint: 'Vuoto = durata del piano.' })}</div>
      <div class="frow">${pf('licenza.limiti.utenti', 'Utenti', { type: 'int' })}${pf('licenza.limiti.faldoni', 'Faldoni', { type: 'int' })}</div>
      ${pf('licenza.limiti.archivi', 'Archivi', { type: 'int', hint: 'Limiti vuoti = quelli del piano; -1 = illimitato.' })}
      <div class="f"><label>Note del progetto</label><textarea data-p="progetto.note" rows="2" style="font-family:inherit;font-size:14px">${esc(d.progetto.note)}</textarea></div><div id="st-issues"></div>`;
    $$('[data-inst]', body).forEach((cb) => (cb.onchange = () => { const s = new Set(d.progetto.installazioni); cb.checked ? s.add(cb.dataset.inst) : s.delete(cb.dataset.inst); d.progetto.installazioni = ['sede', 'online'].filter((x) => s.has(x)); save(); }));
  } else if (k === 'online') {
    const on = d.progetto.installazioni.includes('online');
    body.innerHTML = `${on ? '' : '<div class="note warn mb">L\'installazione online non è scelta (passo 2): questi dati verranno ignorati.</div>'}
      <div class="frow">${pf('online.indirizzo', 'Indirizzo del sito (produzione)', { ph: 'https://docmap.pr-it.it/studio-rossi/' })}${pf('online.staging', 'Indirizzo dello staging (prova)', { ph: 'https://docmap.pr-it.it/studio-rossi-prova/' })}</div>
      <h4 style="margin:6px 0 10px">Accesso FTP <span style="font-weight:400;color:var(--mut)">(vuoto = scarichi l'autoinstall web e carichi tu)</span></h4>
      <div class="frow">${psel('online.ftp.protocollo', 'Protocollo', [['ftps', 'FTPS (consigliato)'], ['sftp', 'SFTP'], ['ftp', 'FTP senza cifratura']])}${pf('online.ftp.host', 'Host', { ph: 'ftp.tuohosting.it' })}</div>
      <div class="frow">${pf('online.ftp.utente', 'Utente')}${pf('online.ftp.porta', 'Porta', { type: 'int', hint: 'Vuoto = standard.' })}</div>
      <div class="frow">${pf('online.ftp.cartella', 'Cartella del sito', { ph: '/studio-rossi/' })}${pf('online.ftp.cartella_staging', 'Cartella dello staging', { ph: '/studio-rossi-prova/' })}</div>
      <div class="note">La password FTP la scrivi nel passo «Riepilogo e conferma»: va dritta in cassaforte e non resta nella bozza.</div><div id="st-issues" style="margin-top:10px"></div>`;
  } else if (k === 'sede') {
    const se = d.progetto.installazioni.includes('sede');
    body.innerHTML = `${se ? '' : '<div class="note warn mb">L\'installazione in sede non è scelta (passo 2).</div>'}
      <div class="frow">${pf('sede.pc_server', 'PC che fa da server', { ph: 'PC Segreteria' })}${pf('sede.indirizzo', 'Indirizzo del server in rete (se già noto)', { ph: 'https://192.168.1.20:8443/', hint: 'Serve ai client delle postazioni; si può aggiungere dopo.' })}</div>
      <h4 style="margin:10px 0 8px">Postazioni</h4><p style="margin:0 0 8px;color:var(--mut);font-size:13px">Gli altri PC dello studio: per ognuno potrai scaricare un client che lo collega al server.</p>
      ${listRows('postazioni', [['nome', 'Nome'], ['etichetta', 'Etichetta']], 'Nessuna postazione.')}<div id="st-issues" style="margin-top:10px"></div>`;
  } else if (k === 'utenti') {
    body.innerHTML = `<h4 style="margin:0 0 8px">Utenti iniziali</h4>${listRows('utenti_iniziali', [['nome', 'Nome'], ['email', 'Email'], ['ruolo', 'Ruolo', [['admin', 'Amministratore'], ['editor', 'Operatore'], ['viewer', 'Sola lettura']]]], 'Nessun utente.')}
      <h4 style="margin:18px 0 8px">Archivi</h4>${listRows('archivi', [['nome', 'Nome'], ['note', 'Dove si trova']], 'Nessun archivio.')}
      <h4 style="margin:18px 0 8px">Domande aperte</h4>${d.domande_aperte.length ? `<ul style="margin:0;padding-left:18px">${d.domande_aperte.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : '<span style="color:var(--mut)">Nessuna.</span>'}
      <div class="note mt">Utenti e archivi sono salvati nel progetto come piano di avvio. Nell'hub 0.5 li crei tu al primo accesso (o con setup.php); la creazione a distanza arriva con la gestione utenti remota.</div><div id="st-issues"></div>`;
  } else {
    const c = S.draft.check, ftp = d.progetto.installazioni.includes('online') && d.online.ftp.host;
    body.innerHTML = `${c.errors.length ? `<div class="err-box">Da correggere prima di confermare:<ul style="margin:6px 0 0;padding-left:18px">${c.errors.map((x) => `<li><b>${esc(x.path)}</b>: ${esc(x.msg)}</li>`).join('')}</ul></div>` : '<div class="note mb" style="background:var(--ok-soft);color:var(--ok)">Tutto pronto: nessun errore.</div>'}
      ${c.warnings.length ? `<div class="note warn mb"><ul style="margin:0;padding-left:18px">${c.warnings.map((x) => `<li>${esc(x.msg)}</li>`).join('')}</ul></div>` : ''}
      <dl class="kv" style="margin-bottom:18px"><dt>Cliente</dt><dd><b>${esc(d.cliente.ragione_sociale)}</b> ${esc(d.cliente.partita_iva)}</dd><dt>Progetto</dt><dd>${esc(d.progetto.nome || '—')}</dd>
        <dt>Installazioni</dt><dd>${d.progetto.installazioni.map((x) => `<span class="tag">${esc(x)}</span>`).join(' ') || '—'}</dd><dt>Licenza</dt><dd>${esc(S.pp.plans[d.licenza.piano] || d.licenza.piano)}${d.licenza.mesi ? ` · ${esc(d.licenza.mesi)} mesi` : ''}</dd>
        ${d.progetto.installazioni.includes('online') ? `<dt>Sito</dt><dd class="mono">${esc(d.online.indirizzo)}${d.online.staging ? `<br>${esc(d.online.staging)} (staging)` : ''}</dd><dt>Pubblicazione</dt><dd>${ftp ? `FTP ${esc(d.online.ftp.protocollo)} su ${esc(d.online.ftp.host)}` : 'autoinstall web (nessun FTP)'}</dd>` : ''}
        <dt>Postazioni</dt><dd>${d.postazioni.map((p) => esc(p.nome)).join(', ') || '—'}</dd><dt>Utenti</dt><dd>${d.utenti_iniziali.length}</dd><dt>Archivi</dt><dd>${d.archivi.map((a) => esc(a.nome)).join(', ') || '—'}</dd></dl>
      ${confirmed ? `<div class="note" style="background:var(--ok-soft);color:var(--ok)">Bozza confermata: il cliente è stato creato.</div>` : `
      ${ftp ? fld('ftp_password', 'Password FTP (va in cassaforte, non nella bozza)', { type: 'password', attrs: 'data-keep="1" autocomplete="off"' }) : ''}
      <label class="check mb"><input type="checkbox" id="build" checked data-keep="1"> <span><b>Prepara subito i pacchetti</b>: installer del server di sede e sito online (qualche minuto). Puoi farlo anche dopo.</span></label>
      <button class="btn ai" id="go" ${c.errors.length ? 'disabled' : ''} style="padding:12px 20px;font-size:15px">${ic('sparkle')} Conferma e crea il progetto</button>
      <pre class="log mt" id="jlog" hidden></pre>`}`;
    const go = $('#go');
    if (go) go.onclick = async () => {
      go.disabled = true; const log = $('#jlog'); log.hidden = false; log.textContent = 'Avvio…';
      try {
        const r = await api(`/api/drafts/${D.id}/confirm`, { ftp_password: ($('#f-ftp_password') || {}).value || '', build: $('#build').checked });
        const j = await waitJob(r.job, (jj) => { log.textContent = jj.lines.join('\n'); log.scrollTop = log.scrollHeight; });
        toast('Progetto creato.'); S.draft = null; location.hash = `#/clienti/${j.result.customer_id}`;
      } catch (e) { toast(e.message, true); log.textContent += `\n\nERRORE: ${e.message}`; go.disabled = false; }
    };
  }
  $$('[data-rm]', body).forEach((b) => (b.onclick = () => { const [key, i] = b.dataset.rm.split('.'); d[key].splice(+i, 1); save(); pDraft(page, id, step); }));
  $$('[data-add]', body).forEach((b) => (b.onclick = () => {
    const key = b.dataset.add; d[key].push(key === 'postazioni' ? { nome: '', etichetta: '' } : key === 'archivi' ? { nome: '', note: '' } : { nome: '', email: '', ruolo: 'editor' });
    pDraft(page, id, step);
  }));
  bind(); markErrors();
  $('#prev').disabled = idx === 0; $('#next').hidden = idx === STEPS.length - 1;
  $('#prev').onclick = () => (location.hash = `#/nuovo-progetto/${D.id}/${STEPS[idx - 1][0]}`);
  $('#next').onclick = () => (location.hash = `#/nuovo-progetto/${D.id}/${STEPS[idx + 1][0]}`);
}

// ---------------------------------------------------------------------------------------------
// global lists
// ---------------------------------------------------------------------------------------------
async function pInstances(page) {
  setCrumbs([['Istanze']]);
  const list = await api('/api/instances');
  let filter = 'all', q = '';
  page.innerHTML = `<div class="ph"><div><h1>Istanze</h1><div class="sub">Tutti i siti online, gli staging, i server di sede e gli ambienti sul tuo PC.</div></div>
    <div class="btns"><button class="btn" id="ca">${ic('refresh')} Controlla tutto</button><a class="btn" href="/envs">${ic('plus')} Registra ambiente</a></div></div>
    <div class="card"><div class="toolbar"><input type="search" id="q" placeholder="Cerca cliente, indirizzo, installazione…"><div class="chips">
      ${[['all', 'Tutte'], ['production', 'Produzione'], ['staging', 'Staging'], ['studio-python', 'Sede'], ['down', 'Non raggiungibili']].map(([v, t]) => `<button class="chip" data-f="${v}">${t}</button>`).join('')}</div></div><div id="tbl"></div></div>`;
  $('#ca').onclick = checkAll;
  const draw = () => {
    $$('.chip', page).forEach((c) => c.classList.toggle('on', c.dataset.f === filter));
    const rows = list.filter((e) => {
      if (q && ![e.customer_name, e.instance_label, e.url, e.project_name].join(' ').toLowerCase().includes(q)) return false;
      if (filter === 'production' || filter === 'staging') return e.name === filter;
      if (filter === 'studio-python') return e.kind === 'studio-python';
      if (filter === 'down') return e.status === 'unreachable';
      return true;
    });
    $('#tbl').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Cliente</th><th>Ambiente</th><th>Indirizzo</th><th>Stato</th><th>Versione</th><th>Licenza</th><th>Controllo</th></tr></thead><tbody>
      ${rows.map((e) => `<tr class="click" data-env="${esc(e.id || '')}" data-c="${esc(e.customer_id)}"><td><div class="cellname">${av(e.customer_name)}<div><b>${esc(e.customer_name)}</b><small>${esc(e.project_name || '')}</small></div></div></td>
        <td><div class="cellname"><span style="color:var(--acc)">${ic(envIcon(e))}</span><div><b>${esc(e.name_it)}</b><small>${esc(e.instance_label)}</small></div></div></td>
        <td class="mono" style="max-width:260px;overflow:hidden;text-overflow:ellipsis">${esc(e.url || (e.port ? '127.0.0.1:' + e.port : '—'))}</td><td>${pill(ENV_STATUS, e.status)}</td><td>${esc(e.app_version || '—')}</td>
        <td>${e.licence ? pill(LIC_STATE, e.licence.state) : '<span style="color:var(--mut)">—</span>'}</td><td>${e.last_check ? ago(e.last_check) : '—'}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty"><div class="big">Nessuna istanza</div></div>`;
    $$('tr.click', page).forEach((tr) => (tr.onclick = () => (tr.dataset.env ? openEnv(tr.dataset.env) : (location.hash = `#/clienti/${tr.dataset.c}`))));
  };
  $('#q').oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
  $$('.chip', page).forEach((c) => (c.onclick = () => { filter = c.dataset.f; draw(); }));
  draw();
}
async function pLicences(page) {
  setCrumbs([['Licenze']]);
  const list = await api('/api/licences');
  let filter = 'current', q = '';
  page.innerHTML = `<div class="ph"><div><h1>Licenze</h1><div class="sub">Ogni licenza è firmata dall'hub e funziona anche offline. Clic per i dettagli, il rinnovo e la storia.</div></div></div>
    <div class="card"><div class="toolbar"><input type="search" id="q" placeholder="Cerca cliente o piano…"><div class="chips">
      ${[['current', 'In vigore'], ['expiring', 'Da rinnovare'], ['expired', 'Scadute'], ['suspended', 'Sospese o revocate'], ['all', 'Tutte (anche sostituite)']].map(([v, t]) => `<button class="chip" data-f="${v}">${t}</button>`).join('')}</div></div><div id="tbl"></div></div>`;
  const draw = () => {
    $$('.chip', page).forEach((c) => c.classList.toggle('on', c.dataset.f === filter));
    const rows = list.filter((l) => {
      if (q && ![l.customer_name, l.plan, l.instance_label].join(' ').toLowerCase().includes(q)) return false;
      if (filter === 'current') return l.state !== 'superseded';
      if (filter === 'expiring') return l.state === 'expiring' || l.state === 'grace';
      if (filter === 'expired') return l.state === 'expired';
      if (filter === 'suspended') return l.state === 'suspended' || l.state === 'revoked';
      return true;
    });
    $('#tbl').innerHTML = licTable(rows, true); bindLicTable(page);
  };
  $('#q').oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
  $$('.chip', page).forEach((c) => (c.onclick = () => { filter = c.dataset.f; draw(); }));
  draw();
}
async function pDeploys(page) {
  setCrumbs([['Deploy']]);
  const list = await api('/api/deploys');
  page.innerHTML = `<div class="ph"><div><h1>Deploy e aggiornamenti</h1><div class="sub">Ogni pubblicazione: prima la prova, poi il backup, poi il caricamento e il controllo, con ripristino automatico se qualcosa non va.</div></div>
    <div class="btns"><a class="btn" href="/deploy">${ic('rocket')} Nuovo deploy (strumento classico)</a></div></div>
    <div class="card mb" id="upd"><div class="bd" style="color:var(--mut)">Controllo le versioni…</div></div>
    <div class="card">${deployTable(list)}</div>`;
  updatesCard($('#upd', page));
}
// v0.9: every online site behind this hub's version, updated one after the other (stop at the first failure)
async function updatesCard(box) {
  let u; try { u = await api('/api/updates'); } catch (e) { box.innerHTML = `<div class="bd"><div class="note warn">${esc(e.message)}</div></div>`; return; }
  if (!u.target) { box.innerHTML = '<div class="bd"><div class="note warn">Non trovo la cartella di DocMap accanto all\'hub: non so quale versione pubblicare.</div></div>'; return; }
  if (!u.sites.length) { box.innerHTML = `<div class="hd"><h3>Aggiornamenti</h3><span class="pill ok">tutti alla ${esc(u.target)}</span></div><div class="bd" style="color:var(--fg2)">Tutti i siti di produzione sono già alla versione di questo hub (o non sono mai stati controllati: premi «Controlla tutto»).</div>`; return; }
  box.innerHTML = `<div class="hd"><h3>Siti da aggiornare alla ${esc(u.target)}</h3><span class="pill warn">${u.sites.length}</span></div><div class="bd">
    <p style="margin-top:0;color:var(--fg2)">Uno dopo l'altro, con il solito deploy: backup del server, caricamento, controllo e ritorno automatico alla versione di prima se il sito non risponde. <b>Al primo errore mi fermo</b> e gli altri restano come sono. Prima prova la nuova versione su uno staging.</p>
    <div class="tbl-wrap"><table class="t"><thead><tr><th><input type="checkbox" id="u-all" checked></th><th>Cliente</th><th>Sito</th><th>Versione adesso</th></tr></thead><tbody>
    ${u.sites.map((x) => `<tr><td><input type="checkbox" data-u="${esc(x.env_id)}" checked></td><td>${esc(x.customer)}</td><td class="mono">${esc(x.url || '')}</td><td>${esc(x.version || 'sconosciuta')}</td></tr>`).join('')}</tbody></table></div>
    <div class="btns mt"><button class="btn pri" id="u-go">${ic('rocket')} Aggiorna i siti scelti</button></div></div>`;
  $('#u-all', box).onchange = (e) => $$('[data-u]', box).forEach((c) => (c.checked = e.target.checked));
  $('#u-go', box).onclick = async () => {
    const ids = $$('[data-u]', box).filter((c) => c.checked).map((c) => c.dataset.u);
    if (!ids.length) return toast('Nessun sito scelto.', true);
    if (!confirm(`Aggiornare ${ids.length} siti alla ${u.target}?`)) return;
    let r; try { r = await withVault(() => api('/api/updates/run', { env_ids: ids })); } catch (e) { return toast(e.message, true); }
    const jm = jobModal(`Aggiornamento di ${ids.length} siti`, '<p class="note" style="margin-top:0">Puoi chiudere: il lavoro continua e lo trovi in Attività.</p>');
    try {
      const j = await waitJob(r.job, showLog(jm)); const res = j.result || {};
      $('#jm-body', jm).innerHTML = res.failed ? `<div class="err-box">Fermo a <b>${esc(res.failed.label)}</b>: ${esc(res.failed.error)}. Aggiornati: ${res.done.length}; non toccati: ${res.skipped.length}.</div>`
        : `<div class="okbox">${ic('rocket')}<div><b>Aggiornati ${res.done.length} siti</b><small>tutti rispondono con la ${esc(u.target)}</small></div></div>`;
    } catch (e) { jmError(jm, e.message); }
    route();
  };
}
async function pEvents(page) {
  setCrumbs([['Attività']]);
  const list = await api('/api/events');
  page.innerHTML = `<div class="ph"><div><h1>Attività</h1><div class="sub">Tutto ciò che è successo nell'hub, in ordine.</div></div></div>
    <div class="card"><div class="feed">${list.map((ev) => `<div class="ev"><time>${fmtDT(ev.at)}</time><div>${esc(ev.text)}${evSubj(ev)}</div></div>`).join('') || '<div class="empty">Nessuna attività</div>'}</div></div>`;
}
async function pSettings(page) {
  setCrumbs([['Impostazioni']]);
  S.session = await api('/api/session'); S.csrf = S.session.csrf || S.csrf;
  const s = S.session; const theme = localStorageGet('hub.theme') || 'auto';
  page.innerHTML = `<div class="ph"><div><h1>Impostazioni</h1><div class="sub">Accesso, cassaforte, aspetto e strumenti avanzati.</div></div></div>
    <div class="grid g2">
      <div class="card"><div class="hd"><h3>${ic('shield')} Accesso su questo PC</h3></div><div class="bd">
        <p style="margin-top:0">${s.remembered ? '<span class="pill ok">Attivo</span> L\'hub si apre senza chiedere la passphrase su questo account Windows.' : '<span class="pill mut">Spento</span> L\'hub chiede la passphrase a ogni avvio.'}</p>
        <p style="color:var(--mut);font-size:13px">La passphrase viene cifrata da Windows (DPAPI) con il tuo account: copiata su un altro PC o usata da un altro utente non funziona. Chiunque usi il tuo account Windows però può aprire l'hub: tienilo protetto da password.</p>
        <div class="btns">${s.remembered ? `<button class="btn danger" id="forget">Non ricordare più</button>` : `<button class="btn pri" id="remember">Ricorda su questo PC</button>`}</div></div></div>
      <div class="card"><div class="hd"><h3>${ic('lock')} Cassaforte</h3></div><div class="bd">
        <p style="margin-top:0">${s.vault === 'open' ? '<span class="pill ok">Aperta</span> Le password FTP e i codici sono disponibili per deploy e controlli.' : s.vault === 'closed' ? '<span class="pill warn">Chiusa</span> Aprila per fare deploy e controlli protetti.' : '<span class="pill mut">Non creata</span>'}</p>
        <div class="btns">${s.vault === 'open' ? '<button class="btn" id="vlock">Chiudi la cassaforte</button>' : `<button class="btn pri" id="vunlock">${s.vault === 'none' ? 'Crea la cassaforte' : 'Apri la cassaforte'}</button>`}<a class="btn ghost" href="/vault">Strumenti avanzati (cambio passphrase, esporta)</a></div></div></div>
      <div class="card" style="grid-column:1/-1"><div class="hd"><h3>${ic('key')} Canale delle licenze</h3></div><div class="bd" id="ch-box">Carico…</div></div>
      <div class="card" style="grid-column:1/-1"><div class="hd"><h3>${ic('download')} Backup dell'hub</h3><div class="btns"><button class="btn sm" id="exp-hub">${ic('lock')} Esporta tutto l'hub (cifrato)</button></div></div><div class="bd" id="bk-box">Carico…</div></div>
      <div class="card"><div class="hd"><h3>${ic('moon')} Aspetto</h3></div><div class="bd">${sel('theme', 'Tema', [['auto', 'Automatico (come Windows)'], ['light', 'Chiaro'], ['dark', 'Scuro']], theme)}</div></div>
      <div class="card"><div class="hd"><h3>${ic('folder')} Strumenti classici</h3></div><div class="bd"><p style="margin-top:0;color:var(--fg2)">Le pagine della versione 0.3, ancora disponibili mentre il nuovo gestionale le assorbe.</p>
        <div class="btns"><a class="btn sm" href="/clienti">Nuovo cliente guidato</a><a class="btn sm" href="/envs">Istanze &amp; ambienti</a><a class="btn sm" href="/deploy">Deploy</a><a class="btn sm" href="/ports">Porte</a><a class="btn sm" href="/status">Stato</a><a class="btn sm" href="/classico">Licenze (classico)</a></div></div></div>
      <div class="card"><div class="hd"><h3>Informazioni</h3></div><div class="bd"><dl class="kv"><dt>Versione</dt><dd>${esc(s.version)}</dd><dt>Chiave di firma</dt><dd class="mono">${esc(s.key_id || '—')}</dd><dt>Cartella dati</dt><dd class="mono">${esc(s.data_dir || '')}</dd></dl></div></div>
    </div>`;
  backupsCard($('#bk-box')); channelCard($('#ch-box')); $('#exp-hub').onclick = exportHub;
  const vu = $('#vunlock'); if (vu) vu.onclick = async () => { await unlockVault(); route(); };
  const vl = $('#vlock'); if (vl) vl.onclick = async () => { await api('/api/vault/lock', {}); S.session.vault = 'closed'; paintVaultState(); toast('Cassaforte chiusa.'); route(); };
  const t = $('#f-theme'); t.onchange = () => { localStorageSet('hub.theme', t.value); applyTheme(); };
  const fg = $('#forget'); if (fg) fg.onclick = async () => { await api('/api/remember', { on: false }); toast('Fatto: la passphrase non è più ricordata.'); route(); };
  const rm = $('#remember'); if (rm) rm.onclick = () => modal({
    title: 'Ricorda su questo PC', submit: 'Ricorda',
    body: `${fld('passphrase', 'Passphrase', { type: 'password', attrs: 'required autocomplete="current-password"' })}${fld('vault_passphrase', 'Passphrase della cassaforte (solo se diversa)', { type: 'password' })}`,
    onSubmit: async (f) => { await api('/api/remember', Object.assign({ on: true }, f)); closeOverlay(); toast('Ricordata: al prossimo avvio entri direttamente.'); route(); },
  });
}
function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { } }
function applyTheme() { const t = localStorageGet('hub.theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }

// ---------------------------------------------------------------------------------------------
// command palette (Ctrl+K)
// ---------------------------------------------------------------------------------------------
const COMMANDS = [
  ['Vai alla Panoramica', '#/', 'home'], ['Vai ai Clienti', '#/clienti', 'users'], ['Vai alle Istanze', '#/istanze', 'server'],
  ['Vai alle Licenze', '#/licenze', 'key'], ['Vai ai Deploy', '#/deploy', 'rocket'], ['Impostazioni', '#/impostazioni', 'gear'],
  ['Crea progetto con AI', '#/nuovo-progetto', 'sparkle'], ['Nuovo cliente', 'new-customer', 'plus'], ['Controlla tutti i siti', 'check-all', 'refresh'],
];
function palette() {
  const o = openOverlay(`<div class="palette"><input id="pq" placeholder="Cerca un cliente, un sito, una postazione, una licenza… o un comando" autocomplete="off"><div class="res" id="pres"></div><div class="hint">↑↓ per scegliere · Invio per aprire · Esc per chiudere</div></div>`);
  const inp = $('#pq', o), res = $('#pres', o); let items = [], idx = 0, timer;
  const TY = { customer: 'Cliente', project: 'Progetto', env: 'Ambiente', workstation: 'Postazione', licence: 'Licenza', cmd: 'Comando' };
  const TI = { customer: 'users', project: 'folder', env: 'globe', workstation: 'monitor', licence: 'key' };
  const draw = () => {
    res.innerHTML = items.map((it, i) => `<div class="it${i === idx ? ' on' : ''}" data-i="${i}">${ic(it.icon || TI[it.type] || 'search')}<div><b>${esc(it.title)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div><span class="ty">${TY[it.type] || ''}</span></div>`).join('') || '<div class="hint">Nessun risultato</div>';
    $$('.it', res).forEach((el) => (el.onclick = () => go(items[+el.dataset.i])));
  };
  const cmds = (q) => COMMANDS.filter(([t]) => !q || t.toLowerCase().includes(q)).map(([t, a, i]) => ({ type: 'cmd', title: t, action: a, icon: i }));
  const go = (it) => {
    if (!it) return; closeOverlay();
    if (it.type === 'cmd') { if (it.action === 'new-customer') return newCustomer(); if (it.action === 'check-all') return checkAll(); location.hash = it.action; return; }
    if (it.type === 'customer' || it.type === 'project') location.hash = `#/clienti/${it.customer_id}`;
    else if (it.type === 'workstation') location.hash = `#/clienti/${it.customer_id}/postazioni`;
    else if (it.type === 'licence') openLicence(it.id);
    else if (it.type === 'env') { location.hash = `#/clienti/${it.customer_id}`; setTimeout(() => openEnv(it.id), 250); }
  };
  inp.oninput = () => {
    clearTimeout(timer); const q = inp.value.trim().toLowerCase();
    timer = setTimeout(async () => { let found = []; if (q.length >= 2) { try { found = await api(`/api/search?q=${encodeURIComponent(q)}`); } catch { } } items = found.concat(cmds(q)).slice(0, 30); idx = 0; draw(); }, 120);
  };
  inp.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, items.length - 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { go(items[idx]); e.preventDefault(); }
  };
  items = cmds(''); draw(); inp.focus();
}

// ---------------------------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------
// v0.6: vault in the app, deploy/promote with plan → confirm → progress, secrets, environments, backups
// ---------------------------------------------------------------------------------------------
const SECRET_KIND = { ftp: 'Accesso FTP/SFTP', basic_auth: 'Protezione cartella (HTTP Basic)', admin_token: 'Token amministratore', superadmin: 'Super-admin', db_config: 'Configurazione e chiave del database', note: 'Nota', bridge_token: 'Token del ponte di sincronizzazione' };
const isVaultErr = (e) => /cassaforte chiusa|cassaforte aperta|vault/i.test(e.message || '');

function unlockVault() {
  return new Promise((resolve) => {
    const creating = S.session && S.session.vault === 'none';
    modal({
      title: creating ? 'Crea la cassaforte' : 'Apri la cassaforte', submit: creating ? 'Crea e apri' : 'Apri',
      body: `<p class="note" style="margin-top:0">${creating
        ? 'La cassaforte custodisce password FTP, codici e chiavi dei clienti, cifrati con una passphrase solo tua (almeno 10 caratteri). Annotala in un posto sicuro: se la perdi i segreti non si recuperano.'
        : 'Servono le password FTP e i codici salvati. Resta aperta finché non chiudi l\'hub o premi «Chiudi la cassaforte».'}</p>
        ${fld('passphrase', 'Passphrase della cassaforte', { type: 'password', attrs: 'required autocomplete="current-password"' })}${creating ? fld('again', 'Ripeti la passphrase', { type: 'password', attrs: 'required autocomplete="new-password"' }) : ''}`,
      onSubmit: async (f) => {
        await api('/api/vault/unlock', f);
        if (S.session) S.session.vault = 'open';
        closeOverlay(); toast(creating ? 'Cassaforte creata e aperta.' : 'Cassaforte aperta.'); paintVaultState(); resolve(true);
      },
    });
  });
}
async function withVault(fn) {
  try { return await fn(); } catch (e) {
    if (!isVaultErr(e)) throw e;
    closeOverlay(); await unlockVault(); return fn();
  }
}
function paintVaultState() {
  const el = $('#vault-state'); if (!el || !S.session) return;
  const vs = S.session.vault;
  el.innerHTML = vs === 'open' ? `${ic('unlock')} Cassaforte aperta` : vs === 'closed' ? `${ic('lock')} <a href="#" id="vs-open" style="color:#ffb86b">Cassaforte chiusa: apri</a>` : `${ic('lock')} <a href="#" id="vs-open" style="color:#ffb86b">Crea la cassaforte</a>`;
  const a = $('#vs-open', el); if (a) a.onclick = (ev) => { ev.preventDefault(); unlockVault(); };
}

// ---- deploy / promote ------------------------------------------------------------------------
const DSTEPS = [['plan', 'Prova'], ['ok', 'Conferma'], ['backup', 'Backup del server'], ['upload', 'Caricamento'], ['check', 'Controllo']];
function stepper(cur, failed) {
  const idx = DSTEPS.findIndex((s) => s[0] === cur);
  return `<ol class="stepper">${DSTEPS.map(([k, t], i) => `<li class="${i < idx ? 'done' : i === idx ? (failed ? 'fail' : 'cur') : ''}"><span>${i + 1}</span>${esc(t)}</li>`).join('')}</ol>`;
}
function stepOf(lines) {
  const t = lines.join('\n');
  if (/Controllo (fallito|https?:)|Caricati \d+ file/.test(t)) return 'check';
  if (/caricati \d+\/|Caricati|Errore durante il caricamento/.test(t)) return 'upload';
  if (/Backup del server/.test(t)) return 'backup';
  return 'backup';
}
function jobModal(title, intro) {
  const o = openOverlay(`<div class="modal wide"><div class="hd"><h2>${esc(title)}</h2><button type="button" class="btn ghost sm x" data-close>${ic('x')}</button></div>
    <div class="bd"><div id="jm-steps"></div><div class="err-box" hidden></div><div id="jm-body">${intro || ''}</div>
    <details id="jm-det" open><summary>Registro</summary><pre class="log" id="jm-log">Avvio…</pre></details></div>
    <div class="ft" id="jm-ft"><button type="button" class="btn ghost" data-close>Chiudi</button></div></div>`);
  return o;
}
const showLog = (o) => (j) => { const l = $('#jm-log', o); if (!l) return; l.textContent = j.lines.join('\n') || 'Avvio…'; l.scrollTop = l.scrollHeight; };
function jmError(o, msg) { const eb = $('.err-box', o); eb.textContent = msg; eb.hidden = false; }

async function runPlan(kind, ref, label) {
  const url = kind === 'promote' ? `/api/instances/${ref}/promote-plan` : `/api/envs/${ref}/deploy-plan`;
  let r; try { r = await withVault(() => api(url, {})); } catch (e) { return toast(e.message, true); }
  const o = jobModal(kind === 'promote' ? `Promozione staging → produzione${label ? ': ' + label : ''}` : `Deploy${label ? ': ' + label : ''}`,
    `<p class="note" style="margin-top:0">Prova in corso: l'hub costruisce il sito, legge cosa c'è sul server e prepara il piano. <b>Sul server non cambia niente.</b></p>`);
  $('#jm-steps', o).innerHTML = stepper('plan');
  let j; try { j = await waitJob(r.job, showLog(o)); } catch (e) { $('#jm-steps', o).innerHTML = stepper('plan', true); $('#jm-body', o).innerHTML = ''; return jmError(o, e.message); }
  renderPlan(o, j, kind);
}
function renderPlan(o, j, kind) {
  const p = j.plan; if (!p) return jmError(o, 'Piano non disponibile.');
  const fl = (arr) => arr.map((i) => `<li><code>${esc(i.path)}</code> <span style="color:var(--mut)">${esc(i.why)}</span></li>`).join('');
  $('#jm-steps', o).innerHTML = stepper('ok');
  $('#jm-det', o).open = false;
  $('#jm-body', o).innerHTML = `
    <div class="vflow"><div><small>Sul server adesso</small><b>${esc(p.remote_version || 'sconosciuta')}</b></div><span class="arr">→</span><div><small>Da pubblicare</small><b>${esc(p.version || '?')}</b></div></div>
    ${p.root_note ? `<div class="note warn mt">${esc(p.root_note)}</div>` : ''}
    <div class="stats3 mt"><div><b>${p.upload_count}</b><small>file da caricare</small></div><div><b>${p.unchanged_count}</b><small>già uguali</small></div><div><b>${p.protected.length}</b><small>protetti, mai toccati</small></div></div>
    <div class="note mt">Si aggiorna <b>solo il programma</b>. I dati del cliente (<span class="mono">server-php/data</span>), <span class="mono">config.php</span> e i .htaccess modificati a mano non vengono toccati e niente viene cancellato. Prima di caricare l'hub scarica un backup del server; se dopo il caricamento il sito non risponde con la versione nuova, <b>rimette da solo i file di prima</b>.</div>
    ${kind === 'promote' ? '<div class="note mt">In produzione va esattamente il codice già provato sullo staging: se nel frattempo è cambiato, l\'hub si ferma.</div>' : ''}
    <details class="mt"><summary>File da caricare (${p.upload_count})</summary><ul class="files">${fl(p.upload)}</ul></details>
    ${p.protected.length ? `<details><summary>Protetti (${p.protected.length})</summary><ul class="files">${fl(p.protected)}</ul></details>` : ''}
    ${p.obsolete_count ? `<details><summary>Sul server ma non più nel programma, non cancellati (${p.obsolete_count})</summary><ul class="files">${p.obsolete.map((x) => `<li><code>${esc(x)}</code></li>`).join('')}</ul></details>` : ''}
    ${p.upload_count ? `<label class="check mt"><input type="checkbox" id="jm-sure"> <span>Ho letto il piano: procedi con backup, caricamento e controllo. <span style="color:var(--mut)">(Valido ancora ${Math.max(1, Math.floor(p.valid_seconds / 60))} minuti.)</span></span></label>` : '<div class="note mt"><b>Niente da caricare:</b> il server è già aggiornato.</div>'}`;
  if (!p.upload_count) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'btn pri'; b.innerHTML = `${ic('rocket')} Conferma e pubblica`; b.disabled = true;
  $('#jm-ft', o).appendChild(b);
  $('#jm-sure', o).onchange = (e) => (b.disabled = !e.target.checked);
  b.onclick = () => confirmPlan(o, j.id, b);
}
async function confirmPlan(o, jid, b) {
  b.disabled = true; $('.err-box', o).hidden = true;
  let r; try { r = await api(`/api/jobs/${jid}/confirm`, { sure: true }); } catch (e) { b.disabled = false; return jmError(o, e.message); }
  b.remove();
  $('#jm-body', o).innerHTML = '<p class="note" style="margin-top:0">Pubblicazione in corso. Puoi chiudere questa finestra: il lavoro continua e lo trovi in Attività.</p>';
  $('#jm-det', o).open = true; $('#jm-steps', o).innerHTML = stepper('backup');
  const log = showLog(o);
  try {
    const j = await waitJob(r.job, (jj) => { log(jj); const st = $('#jm-steps', o); if (st) st.innerHTML = stepper(stepOf(jj.lines)); });
    const res = j.result || {};
    $('#jm-steps', o).innerHTML = stepper('check').replace('class="cur"', 'class="done"');
    $('#jm-body', o).innerHTML = `<div class="okbox">${ic('rocket')}<div><b>Pubblicato: versione ${esc(res.version || '')}</b><small>${(res.uploaded || []).length} file caricati · il sito risponde con la versione nuova${res.config_php_untouched === false ? ' · ATTENZIONE: config.php risulta cambiato' : ''}</small></div></div>${res.backup_dir ? `<p style="color:var(--mut);font-size:12.5px">Backup del server prima del caricamento: <span class="mono">${esc(res.backup_dir)}</span></p>` : ''}`;
    toast('Deploy riuscito.');
  } catch (e) {
    $('#jm-steps', o).innerHTML = stepper(/ripristin/i.test(e.message) ? 'check' : 'upload', true);
    $('#jm-body', o).innerHTML = '';
    jmError(o, e.message);
  }
  route();
}

// ---- secrets of an environment ---------------------------------------------------------------
function secretFields(kind, cur = {}) {
  if (kind === 'ftp') return `<div class="frow">${sel('protocol', 'Protocollo', [['ftps', 'FTPS (consigliato)'], ['sftp', 'SFTP'], ['ftp', 'FTP senza cifratura']], cur.protocol || 'ftps')}${fld('port', 'Porta', { type: 'number', ph: '21', value: cur.port || '' })}</div>
    ${fld('host', 'Server FTP', { req: true, ph: 'ftp.studio.it', value: cur.host || '' })}<div class="frow">${fld('user', 'Utente', { req: true, value: cur.user || '' })}${fld('password', 'Password', { type: 'password', req: true, attrs: 'autocomplete="new-password"' })}</div>
    ${fld('remote_path', 'Cartella sul server', { ph: '/public_html/docmap', value: cur.remote_path || '', hint: 'La cartella dove sta (o andrà) il sito, vista dall\'FTP.' })}`;
  if (kind === 'basic_auth' || kind === 'superadmin') return `<div class="frow">${fld('user', 'Utente', { req: true })}${fld('password', 'Password', { type: 'password', req: true, attrs: 'autocomplete="new-password"' })}</div>`;
  if (kind === 'admin_token') return `${fld('user', 'Utente', { value: 'admin' })}${fld('password', 'Token', { type: 'password', req: true })}`;
  if (kind === 'db_config') return `<div class="f"><label>Contenuto di config.php / config.json</label><textarea name="content" rows="8" class="mono"></textarea></div>`;
  return `<div class="f"><label>Testo</label><textarea name="text" rows="5"></textarea></div>`;
}
function addSecret(env, kind, after) {
  const kinds = Object.entries(SECRET_KIND).filter(([k]) => k !== 'bridge_token');
  const f = modal({
    title: `Salva in cassaforte · ${env.name_it}`, submit: 'Salva cifrato',
    body: `${sel('kind', 'Cosa', kinds, kind || (env.kind === 'web-php' ? 'ftp' : 'admin_token'))}${fld('label', 'Etichetta (facoltativa)', { ph: 'es. nome utente o «secondario»' })}<div id="sf"></div>
      <div class="note">Viene cifrato con la passphrase della cassaforte. Non compare mai in chiaro nel gestionale: per rivederlo l'hub chiede di nuovo la passphrase.</div>`,
    onSubmit: async (v) => { await withVault(() => api(`/api/envs/${env.id}/secrets`, v)); closeOverlay(); toast('Salvato in cassaforte.'); if (after) after(); },
  });
  const paint = () => ($('#sf', f).innerHTML = secretFields($('#f-kind', f).value));
  $('#f-kind', f).onchange = paint; paint();
}
function revealSecret(env, s) {
  modal({
    title: `Mostra: ${SECRET_KIND[s.kind] || s.kind}`, submit: 'Mostra',
    body: `<p class="note warn" style="margin-top:0">Per sicurezza la passphrase della cassaforte si scrive di nuovo ogni volta. La visualizzazione resta nello storico.</p>${fld('passphrase', 'Passphrase della cassaforte', { type: 'password', attrs: 'required autocomplete="current-password"' })}`,
    onSubmit: async (f, form) => {
      const r = await api(`/api/envs/${env.id}/secrets/reveal`, { kind: s.kind, label: s.label, passphrase: f.passphrase });
      const rows = Object.entries(r.data || {}).map(([k, v]) => `<dt>${esc(k)}</dt><dd class="mono" style="word-break:break-all">${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</dd>`).join('');
      $('.bd', form).innerHTML = `<dl class="kv">${rows}</dl><p class="note warn mt">Chiudi questa finestra appena hai finito: si cancella anche dallo schermo.</p>`;
      const sb = $('button[type=submit]', form); if (sb) sb.remove(); const cb = $('.ft .btn.ghost', form); if (cb) cb.textContent = 'Chiudi';
    },
  });
}
async function secretsSection(box, env) {
  let d; try { d = await api(`/api/envs/${env.id}/secrets`); } catch (e) { box.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
  const repaint = () => secretsSection(box, env);
  box.innerHTML = `${d.items.length ? `<div class="alist">${d.items.map((s, i) => `<div class="al" style="cursor:default">${ic('key')}<div style="flex:1"><b>${esc(s.kind_it)}${s.label ? ` <span class="tag">${esc(s.label)}</span>` : ''}</b><small>aggiornato ${ago(s.updated_at)}</small></div>
      <div class="btns"><button class="btn sm" data-rv="${i}">Mostra</button><button class="btn sm" data-ed="${i}" title="Sostituisci">${ic('edit')}</button><button class="btn ghost sm" data-del="${i}" title="Elimina">${ic('x')}</button></div></div>`).join('')}</div>`
    : `<div class="empty" style="padding:14px 0">Niente in cassaforte per questo ambiente.${env.kind === 'web-php' ? ' Salva l\'accesso FTP per poter fare il deploy.' : ''}</div>`}
    <div class="btns mt"><button class="btn sm pri" data-add>${ic('plus')} Aggiungi</button>${d.vault !== 'open' ? `<button class="btn sm" data-open>${ic('unlock')} Apri la cassaforte</button>` : ''}</div>`;
  $('[data-add]', box).onclick = () => addSecret(env, null, () => openEnv(env.id));
  const ob = $('[data-open]', box); if (ob) ob.onclick = async () => { await unlockVault(); openEnv(env.id); };
  $$('[data-rv]', box).forEach((b) => (b.onclick = () => revealSecret(env, d.items[+b.dataset.rv])));
  $$('[data-ed]', box).forEach((b) => (b.onclick = () => { const s = d.items[+b.dataset.ed]; addSecret(env, s.kind, () => openEnv(env.id)); }));
  $$('[data-del]', box).forEach((b) => (b.onclick = async () => {
    const s = d.items[+b.dataset.del];
    if (!confirm(`Eliminare «${s.kind_it}» dalla cassaforte? Senza, il deploy di questo ambiente non funziona.`)) return;
    try { await api(`/api/envs/${env.id}/secrets/delete`, { kind: s.kind, label: s.label, sure: true }); toast('Eliminato.'); repaint(); } catch (e) { toast(e.message, true); }
  }));
}

// ---- environments ----------------------------------------------------------------------------
function addEnvironment(d, inst) {
  const insts = d.projects.flatMap((p) => p.instances.map((i) => [i.id, `${p.name} · ${i.label}`]));
  const f = modal({
    title: 'Aggiungi sito o server', submit: 'Aggiungi',
    body: `${sel('instance_id', 'Installazione', insts, inst || '')}
      ${sel('type', 'Che cosa', [['web-php', 'Sito online (hosting PHP, es. SiteGround)'], ['studio-python', 'Server nello studio del cliente'], ['local-python', 'Ambiente di prova su questo PC']], 'web-php')}
      <div id="envf"></div>`,
    onSubmit: async (v) => {
      if (v.type === 'local-python') {
        const r = await withVault(() => api('/api/envs/local', { instance_id: v.instance_id, name: v.name, studio_name: v.studio_name }));
        closeOverlay(); const o = jobModal('Nuovo ambiente su questo PC'); try { await waitJob(r.job, showLog(o)); $('#jm-body', o).innerHTML = '<div class="okbox"><div><b>Ambiente creato</b><small>I codici di accesso sono in cassaforte. Avvialo dalla sua scheda.</small></div></div>'; } catch (e) { jmError(o, e.message); }
        return route();
      }
      const r = await api('/api/envs', { instance_id: v.instance_id, kind: v.type, name: v.name, url: v.url, api_url: v.api_url, base_path: v.base_path, studio_name: v.studio_name });
      closeOverlay(); toast('Aggiunto. Ora salva l\'accesso in cassaforte.'); await route(); openEnv(r.id);
    },
  });
  const paint = () => {
    const t = $('#f-type', f).value;
    $('#envf', f).innerHTML = t === 'local-python'
      ? `${sel('name', 'Nome', [['staging', 'staging'], ['demo-1', 'demo-1'], ['production', 'production']], 'staging')}${fld('studio_name', 'Nome dello studio mostrato nell\'app')}<div class="note">L'hub prepara un server DocMap su una porta libera di questo PC, con i codici di accesso custoditi in cassaforte. Serve per provare o fare demo.</div>`
      : `${sel('name', 'Ruolo', [['production', 'Produzione (quello vero)'], ['staging', 'Staging (prova)']], 'production')}
        ${fld('url', 'Indirizzo', { req: true, ph: t === 'web-php' ? 'https://www.studio.it/docmap/' : 'https://192.168.1.20:8443/' })}
        ${t === 'web-php' ? `${fld('api_url', 'Indirizzo dell\'API (facoltativo)', { ph: 'https://www.studio.it/docmap/server-php/api.php', hint: 'Vuoto = calcolato dall\'indirizzo. Serve al controllo dopo il deploy.' })}${fld('base_path', 'Cartella nel sito (facoltativa)', { ph: '/docmap/' })}` : ''}
        ${fld('studio_name', 'Nome dello studio mostrato nell\'app')}`;
  };
  $('#f-type', f).onchange = paint; paint();
}
function editEnvironment(e) {
  modal({
    title: `Indirizzi · ${e.name_it}`,
    body: `${fld('url', 'Indirizzo', { value: e.url || '' })}${fld('api_url', 'Indirizzo dell\'API', { value: e.api_url || '', hint: 'Usato per il controllo dopo il deploy.' })}`,
    onSubmit: async (v) => { await api(`/api/envs/${e.id}`, v); closeOverlay(); toast('Salvato.'); route(); },
  });
}
async function envJob(e, what) {
  try {
    if (what === 'stop') { await api(`/api/envs/${e.id}/stop`, {}); toast('Ambiente fermato.'); return openEnv(e.id); }
    const r = await api(`/api/envs/${e.id}/start`, {}); toast('Avvio in corso…');
    const j = await waitJob(r.job); toast(`In esecuzione: ${j.result?.url || ''}`); openEnv(e.id);
  } catch (err) { toast(err.message, true); }
}

// ---- backups ---------------------------------------------------------------------------------
async function backupsCard(box) {
  let d; try { d = await api('/api/backups'); } catch (e) { box.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
  const c = d.config; const KB = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const KIND = { auto: 'automatico', manuale: 'a mano', migrazione: 'prima di un aggiornamento', esportazione: 'esportazione cifrata' };
  box.innerHTML = `<p style="margin-top:0">${c.auto ? `<span class="pill ok">Attivi</span> Ogni ${c.every_hours} ore mentre l'hub è aperto, tengo gli ultimi ${c.keep}.` : '<span class="pill warn">Spenti</span> Nessun backup automatico.'} Ultimo automatico: <b>${d.last_auto ? ago(d.last_auto) : 'mai'}</b>.</p>
    ${d.error ? `<div class="note warn">Ultimo tentativo non riuscito: ${esc(d.error)}</div>` : ''}
    ${c.copy_dir ? `<p style="color:var(--fg2);font-size:13px">Copia anche in <span class="mono">${esc(c.copy_dir)}</span></p>` : '<p style="color:var(--mut);font-size:13px">Consiglio: imposta una seconda cartella (chiavetta, NAS, OneDrive) così il backup sopravvive anche a un guasto del PC.</p>'}
    <div class="btns"><button class="btn pri sm" id="bk-now">${ic('download')} Fai un backup adesso</button><button class="btn sm" id="bk-cfg">${ic('gear')} Impostazioni</button></div>
    <div class="tbl-wrap mt"><table class="t"><thead><tr><th>File</th><th>Tipo</th><th>Quando</th><th>Dimensione</th><th></th></tr></thead><tbody>
    ${d.items.slice(0, 12).map((b) => `<tr><td class="mono" style="font-size:12px">${esc(b.name)}</td><td>${esc(KIND[b.kind] || b.kind)}</td><td>${ago(b.at)}</td><td>${KB(b.size)}</td><td class="r"><a class="btn sm" href="/scarica/backup/${encodeURIComponent(b.name)}" title="Scarica">${ic('download')}</a></td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">Ancora nessun backup</div></td></tr>'}</tbody></table></div>
    <p style="color:var(--mut);font-size:12.5px">Cartella: <span class="mono">${esc(d.folder)}</span>. Le chiavi e la cassaforte restano cifrate dentro il backup: senza le passphrase non servono a nessuno. Per ripristinare segui la guida «Ripristino dell'hub».</p>`;
  $('#bk-now', box).onclick = async (ev) => { ev.target.disabled = true; try { const r = await api('/api/backups/now', {}); const j = await waitJob(r.job); toast(`Backup fatto: ${j.result?.name || ''}`); } catch (e) { toast(e.message, true); } backupsCard(box); };
  $('#bk-cfg', box).onclick = () => modal({
    title: 'Backup automatici', body: `<label class="check"><input type="checkbox" name="auto" ${c.auto ? 'checked' : ''}> <span>Fai i backup automatici</span></label>
      <div class="frow mt">${fld('every_hours', 'Ogni quante ore', { type: 'number', value: c.every_hours, attrs: 'min="1" max="168"' })}${fld('keep', 'Quanti tenerne', { type: 'number', value: c.keep, attrs: 'min="1" max="365"' })}</div>
      ${fld('copy_dir', 'Copia anche in questa cartella (facoltativo)', { value: c.copy_dir, ph: 'E:\\Backup-DocMap  oppure  C:\\Users\\Dave\\OneDrive\\DocMap', hint: 'Se la chiavetta non è inserita il backup resta comunque sul PC e la copia si salta.' })}`,
    onSubmit: async (v) => { await api('/api/backups', v); closeOverlay(); toast('Salvato.'); backupsCard(box); },
  });
}

async function boot() {
  applyTheme();
  try { S.session = await api('/api/session'); } catch (e) { app().innerHTML = `<div class="boot">Hub non raggiungibile: ${esc(e.message)}</div>`; return; }
  if (S.session.csrf) S.csrf = S.session.csrf;
  if (!S.session.logged) return renderLogin();
  if (location.pathname !== '/') history.replaceState(null, '', '/' + location.hash);
  route();
}
boot();
})();
