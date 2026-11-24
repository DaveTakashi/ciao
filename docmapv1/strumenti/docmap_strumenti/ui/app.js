/* Strumenti — browser interface: recipes, preview on one file, jobs, fast manual review, settings.
   Plain JavaScript, no external code (CSP script-src 'self'). Every call carries the key (X-Key). */
'use strict';

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ST = { key: '', info: null, blocks: [], recipes: [], edit: null, editDirty: false, jobs: [], rv: null, timer: 0, preview: null, sample: null };
const KEYS_DEFAULT = {
  next: ['ArrowDown', 'j'], prev: ['ArrowUp', 'k'], certify: ['Enter'], reject: ['x'], undo: ['u'],
  edit: ['e'], zoomIn: ['+', '='], zoomOut: ['-'], zoomFit: ['0'], pageNext: ['PageDown', 'n'], pagePrev: ['PageUp', 'p'],
  help: ['?']
};
const KEY_LABEL = {
  next: 'File successivo', prev: 'File precedente', certify: 'Conferma e vai avanti', reject: 'Escludi dall’uscita',
  undo: 'Annulla l’ultima decisione', edit: 'Correggi il primo campo', zoomIn: 'Ingrandisci', zoomOut: 'Rimpicciolisci',
  zoomFit: 'Adatta', pageNext: 'Pagina dopo', pagePrev: 'Pagina prima', help: 'Mostra i tasti'
};
const STATUS_IT = { queued: 'in coda', running: 'in corso', uploading: 'invio', waiting_review: 'da verificare', done: 'finito', failed: 'non riuscito', cancelled: 'annullato' };
const STATUS_PILL = { queued: '', running: '', uploading: '', waiting_review: 'warn', done: 'ok', failed: 'bad', cancelled: 'bad' };

// ---------------------------------------------------------------------------------------------- basics
function toast(msg, ms) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms || 2600);
}
async function api(path, opt) {
  opt = opt || {};
  const h = { 'X-Key': ST.key };
  let body = opt.body;
  if (body && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) { h['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  Object.assign(h, opt.headers || {});
  const r = await fetch(path, { method: opt.method || (body ? 'POST' : 'GET'), headers: h, body });
  if (opt.raw) { if (!r.ok) throw new Error('HTTP ' + r.status); return r; }
  let j = {};
  try { j = await r.json(); } catch (e) { j = {}; }
  if (r.status === 401) { showLogin(); throw new Error(j.error || 'chiave sbagliata'); }
  if (!r.ok) throw new Error(j.error || ('errore ' + r.status));
  return j;
}
async function imgURL(path) {
  const r = await api(path, { raw: true });
  return URL.createObjectURL(await r.blob());
}
function confCls(c) { return c == null ? '' : (c >= 0.85 ? 'c-hi' : (c >= 0.6 ? 'c-mid' : 'c-lo')); }
function confTxt(c) { return c == null ? '–' : Math.round(c * 100) + '%'; }
function b64(s) { return btoa(unescape(encodeURIComponent(s))); }
function fmtDate(s) { if (!s) return ''; const d = new Date(s); return isNaN(d) ? s : d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }); }
function modal(html) { $('#modal-box').innerHTML = html; $('#modal').hidden = false; return $('#modal-box'); }
function closeModal() { $('#modal').hidden = true; $('#modal-box').innerHTML = ''; }
document.addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

function showLogin() { $('#login').hidden = false; $('#view').hidden = true; }
async function boot() {
  const m = location.hash.match(/k=([^&]+)/);
  if (m) {
    const v = (location.hash.match(/&v=([a-z]+)/) || [])[1];   // the main app may ask for a view: #k=…&v=lavori
    ST.key = decodeURIComponent(m[1]); try { sessionStorage.setItem('dms-key', ST.key); } catch (e) { /* private mode */ }
    history.replaceState(null, '', location.pathname + '#' + (v || 'ricette'));
  }
  if (!ST.key) { try { ST.key = sessionStorage.getItem('dms-key') || ''; } catch (e) { ST.key = ''; } }
  $('#login-go').addEventListener('click', () => { ST.key = $('#login-key').value.trim(); try { sessionStorage.setItem('dms-key', ST.key); } catch (e) { /* */ } boot2(); });
  $('#login-key').addEventListener('keydown', e => { if (e.key === 'Enter') $('#login-go').click(); });
  if (!ST.key) return showLogin();
  boot2();
}
async function boot2() {
  try {
    ST.info = await api('/api/info');
  } catch (e) { $('#login-err').textContent = e.message; return showLogin(); }
  $('#login').hidden = true; $('#view').hidden = false;
  ST.blocks = (await api('/api/blocks')).blocks;
  $('#nav-settings').hidden = !ST.info.admin;
  footer();
  window.addEventListener('hashchange', route);
  route();
  setInterval(pollJobs, 2500);
  pollJobs();
}
function footer() {
  const c = ST.info.credits || {};
  $('#side-foot').innerHTML = `${esc(ST.info.user)}${ST.info.remote_mode ? ' · server remoto' : ''}<br>Crediti del mese: <b>${c.used_month || 0}</b>${c.limit_month != null ? ' / ' + c.limit_month : ''}`;
}
function route() {
  const v = (location.hash.replace('#', '').split('/')[0]) || 'ricette';
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.view === v));
  const arg = location.hash.split('/').slice(1).join('/');
  if (ST.rv && v !== 'verifica') ST.rv = null;
  ({ ricette: viewRecipes, editor: viewEditor, prova: viewPreview, lavori: viewJobs, verifica: viewReview, impostazioni: viewSettings }[v] || viewRecipes)(arg);
}
function go(h) { if (location.hash === '#' + h) route(); else location.hash = h; }

// ---------------------------------------------------------------------------------------------- recipes
async function viewRecipes() {
  const [r, t] = await Promise.all([api('/api/recipes'), api('/api/templates')]);
  ST.recipes = r.recipes;
  const mine = new Set(r.recipes.map(x => x.id));
  $('#view').innerHTML = `
    <div class="row"><div class="grow"><h1>Ricette</h1><p class="sub">Una ricetta mette in fila dei blocchi (leggi, dividi, converti, controlla, smista…). La provi su un file, poi la lanci su intere cartelle.</p></div>
    ${ST.info.admin ? '<button class="btn" id="new-rec">Nuova ricetta</button>' : ''}</div>
    <div class="grid">${r.recipes.map(x => `<div class="card"><h2>${esc(x.name)}</h2><p class="mut">${esc(x.description)}</p>
      <p class="hint">${x.steps} passi · versione ${x.version}${x.updated ? ' · ' + esc(fmtDate(x.updated)) : ''}</p>
      <div class="row"><button class="btn small" data-open="${esc(x.id)}">Apri</button><button class="btn small sec" data-try="${esc(x.id)}">Prova</button>
      ${ST.info.admin ? `<button class="btn small sec" data-run="${esc(x.id)}">Esegui su una cartella</button>` : ''}</div></div>`).join('') || '<p class="mut">Nessuna ricetta: parti da un modello qui sotto.</p>'}</div>
    <h2 style="margin-top:22px">Modelli pronti</h2>
    <div class="grid">${t.templates.map(x => `<div class="card"><h2>${esc(x.name)}</h2><p class="mut">${esc(x.description)}</p>
      <div class="row"><button class="btn small sec" data-tpl="${esc(x.id)}">${mine.has(x.id) ? 'Copia come nuova' : 'Usa questo modello'}</button></div></div>`).join('')}</div>`;
  ST._templates = t.templates;
  $$('[data-open]').forEach(b => b.addEventListener('click', () => go('editor/' + b.dataset.open)));
  $$('[data-try]').forEach(b => b.addEventListener('click', () => go('prova/' + b.dataset.try)));
  $$('[data-run]').forEach(b => b.addEventListener('click', async () => runDialog((await api('/api/recipes/' + b.dataset.run)).recipe)));
  $$('[data-tpl]').forEach(b => b.addEventListener('click', () => {
    const tpl = JSON.parse(JSON.stringify(ST._templates.find(x => x.id === b.dataset.tpl)));
    if (mine.has(tpl.id)) { tpl.id = tpl.id + '-copia'; tpl.name += ' (copia)'; }
    delete tpl.version; ST.edit = tpl; ST.editDirty = true; go('editor/_nuova');
  }));
  const nb = $('#new-rec');
  if (nb) nb.addEventListener('click', () => { ST.edit = { format: 'docmap-ricetta/1', name: 'Nuova ricetta', description: '', input: { patterns: ['*'], recursive: true }, steps: [] }; ST.editDirty = true; go('editor/_nuova'); });
}

function blockOf(name) { return ST.blocks.find(b => b.name === name); }

async function viewEditor(id) {
  if (id && id !== '_nuova' && (!ST.edit || ST.edit.id !== id || !ST.editDirty)) {
    ST.edit = (await api('/api/recipes/' + encodeURIComponent(id))).recipe; ST.editDirty = false;
  }
  if (!ST.edit) return go('ricette');
  renderEditor();
}
function renderEditor(openIdx) {
  const r = ST.edit;
  const ro = !ST.info.admin;
  $('#view').innerHTML = `
    <div class="row"><div class="grow"><h1>${esc(r.name)}</h1><p class="sub">${r.version ? 'Versione ' + r.version + ' · salvare crea la versione ' + (r.version + 1) + ' (le vecchie restano)' : 'Ricetta nuova, non ancora salvata'}</p></div>
      <button class="btn sec" id="ed-json">JSON</button><button class="btn sec" id="ed-try">Prova</button>
      ${ro ? '' : '<button class="btn sec" id="ed-run">Esegui</button><button class="btn" id="ed-save">Salva</button>'}</div>
    <div class="card"><div class="step-b" style="padding:0">
      <div><label>Nome</label><input id="ed-name" value="${esc(r.name)}"></div>
      <div><label>File da prendere</label><input id="ed-pat" value="${esc((r.input && r.input.patterns || ['*']).join(', '))}"><p class="hint">es. *.pdf, *.tif, fattura*.jpg</p></div>
      <div><label><input type="checkbox" id="ed-rec" ${r.input && r.input.recursive === false ? '' : 'checked'}>Anche nelle sottocartelle</label>
        <label>Dove lavora</label><select id="ed-runon">${['local', 'auto', 'remote'].map(x => `<option value="${x}" ${(r.run_on || 'local') === x ? 'selected' : ''}>${{ local: 'su questo PC', auto: 'automatico (grandi lavori al server)', remote: 'sul server remoto' }[x]}</option>`).join('')}</select></div>
      <div class="wide"><label>Descrizione</label><textarea id="ed-desc" style="min-height:44px;font-family:inherit">${esc(r.description || '')}</textarea></div>
    </div></div>
    <div id="ed-steps">${r.steps.map((s, i) => stepHTML(s, i, openIdx === i)).join('')}</div>
    ${ro ? '' : '<button class="btn sec" id="ed-add">+ Aggiungi un passo</button>'}
    <p class="hint" style="margin-top:14px">Variabili nei nomi e nelle cartelle: {name} {ext} {file} {src_name} {src_dir} {parent} {page:03} {n:04} {date} {year} {cls} {tags}, ogni campo letto ({numero}, {cliente}…). Filtri: {cliente|upper} {x|slug} {x|digits} {x|first:4} {x|default:SENZA}.</p>`;
  const bind = (sel, fn) => { const el = $(sel); if (el) el.addEventListener('input', () => { fn(el); ST.editDirty = true; }); };
  bind('#ed-name', el => { r.name = el.value; });
  bind('#ed-desc', el => { r.description = el.value; });
  bind('#ed-pat', el => { r.input = Object.assign(r.input || {}, { patterns: el.value.split(',').map(x => x.trim()).filter(Boolean) }); });
  $('#ed-rec').addEventListener('change', e => { r.input = Object.assign(r.input || {}, { recursive: e.target.checked }); ST.editDirty = true; });
  $('#ed-runon').addEventListener('change', e => { r.run_on = e.target.value; ST.editDirty = true; });
  $$('.step-h').forEach(h => h.addEventListener('click', e => { if (e.target.closest('button,input')) return; h.parentNode.querySelector('.step-b').hidden ^= true; }));
  $$('[data-st]').forEach(b => b.addEventListener('click', () => stepAction(+b.dataset.i, b.dataset.st)));
  $$('[data-p]').forEach(el => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => paramInput(el)));
  $$('[data-en]').forEach(el => el.addEventListener('change', () => { const s = r.steps[+el.dataset.en]; if (el.checked) delete s.enabled; else s.enabled = false; ST.editDirty = true; el.closest('.step').classList.toggle('off', !el.checked); }));
  $('#ed-json').addEventListener('click', jsonDialog);
  $('#ed-try').addEventListener('click', () => { ST.preview = null; go('prova/_modifica'); });
  if (!ro) {
    $('#ed-save').addEventListener('click', saveRecipe);
    $('#ed-run').addEventListener('click', async () => { if (ST.editDirty) { if (!await saveRecipe()) return; } runDialog(ST.edit); });
    $('#ed-add').addEventListener('click', addStepDialog);
  }
}
function stepHTML(s, i, open) {
  const b = blockOf(s.block) || { label: s.block, params: [], help: 'blocco sconosciuto' };
  const w = s.with || {};
  const fields = b.params.map(p => paramHTML(p, w[p.name], i)).join('');
  return `<div class="step ${s.enabled === false ? 'off' : ''}">
    <div class="step-h"><span class="num">${i + 1}</span><span class="title">${esc(s.label || b.label)}</span><span class="mut mono">${esc(s.id || '')}</span>
      <span class="grow"></span><label style="margin:0"><input type="checkbox" data-en="${i}" ${s.enabled === false ? '' : 'checked'}>attivo</label>
      <button class="btn ghost" data-st="up" data-i="${i}" title="Su">↑</button><button class="btn ghost" data-st="down" data-i="${i}" title="Giù">↓</button>
      <button class="btn ghost" data-st="dup" data-i="${i}" title="Duplica">⧉</button><button class="btn ghost" data-st="del" data-i="${i}" title="Togli">✕</button></div>
    <div class="step-b" ${open ? '' : 'hidden'}><p class="hint wide">${esc(b.help)}</p>${fields}
      <div class="wide"><label>Solo per i file con (condizione, facoltativa)</label><input data-p="__when" data-i="${i}" value="${esc(s.when || '')}" placeholder="es. tipo == fattura and pages > 1"></div></div></div>`;
}
function paramHTML(p, v, i) {
  const val = v === undefined ? p.default : v;
  const id = `data-p="${esc(p.name)}" data-i="${i}" data-t="${esc(p.type)}"`;
  let inp;
  if (p.type === 'bool') return `<div><label><input type="checkbox" ${id} ${val ? 'checked' : ''}>${esc(p.label || p.name)}</label>${p.help ? `<p class="hint">${esc(p.help)}</p>` : ''}</div>`;
  if (p.type === 'choice') inp = `<select ${id}>${(p.choices || []).map(c => `<option ${String(val) === String(c) ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
  else if (p.type === 'text' || p.type === 'json' || (p.type === 'template' && p.name === 'to')) {
    const txt = p.type === 'json' ? (val == null ? '' : (typeof val === 'string' ? val : JSON.stringify(val, null, 1))) : (val == null ? '' : val);
    inp = `<textarea ${id}>${esc(txt)}</textarea>`;
  } else if (p.type === 'list' || p.type === 'fields') inp = `<textarea ${id} style="min-height:44px">${esc((val || []).join('\n'))}</textarea>`;
  else inp = `<input ${id} value="${esc(val == null ? '' : val)}" ${p.type === 'int' || p.type === 'float' ? 'inputmode="decimal"' : ''}>`;
  const wide = ['text', 'json', 'list', 'fields'].includes(p.type) || p.type === 'template' || p.type === 'regex';
  return `<div class="${wide ? 'wide' : ''}"><label>${esc(p.label || p.name)}${p.required ? ' *' : ''}</label>${inp}${p.help ? `<p class="hint">${esc(p.help)}</p>` : ''}</div>`;
}
function paramInput(el) {
  const s = ST.edit.steps[+el.dataset.i];
  ST.editDirty = true;
  if (el.dataset.p === '__when') { if (el.value.trim()) s.when = el.value; else delete s.when; return; }
  s.with = s.with || {};
  const t = el.dataset.t;
  let v;
  if (t === 'bool') v = el.checked;
  else if (t === 'int' || t === 'float') v = el.value.trim() === '' ? null : Number(el.value.replace(',', '.'));
  else if (t === 'list' || t === 'fields') v = el.value.split(/\n|,/).map(x => x.trim()).filter(Boolean);
  else if (t === 'json') { try { v = el.value.trim() ? JSON.parse(el.value) : null; el.style.outline = ''; } catch (e) { el.style.outline = '2px solid var(--bad)'; return; } }
  else v = el.value;
  if (v === null || v === '') delete s.with[el.dataset.p]; else s.with[el.dataset.p] = v;
}
function stepAction(i, a) {
  const st = ST.edit.steps;
  if (a === 'up' && i > 0) [st[i - 1], st[i]] = [st[i], st[i - 1]];
  else if (a === 'down' && i < st.length - 1) [st[i + 1], st[i]] = [st[i], st[i + 1]];
  else if (a === 'dup') { const c = JSON.parse(JSON.stringify(st[i])); c.id = (c.id || c.block) + '-2'; st.splice(i + 1, 0, c); }
  else if (a === 'del') st.splice(i, 1);
  ST.editDirty = true; renderEditor();
}
function addStepDialog() {
  const cats = {};
  ST.blocks.forEach(b => { (cats[b.category_label] = cats[b.category_label] || []).push(b); });
  const box = modal(`<h2>Aggiungi un passo</h2><input id="blk-q" placeholder="Cerca un blocco (es. pdf, ocr, rinomina)"><div id="blk-l" style="margin-top:10px"></div>`);
  const draw = q => {
    q = (q || '').toLowerCase();
    $('#blk-l', box).innerHTML = Object.keys(cats).map(c => {
      const bs = cats[c].filter(b => !q || (b.label + ' ' + b.help + ' ' + b.name).toLowerCase().includes(q));
      return bs.length ? `<div class="cat"><h3>${esc(c)}</h3>${bs.map(b => `<button class="blk" data-b="${esc(b.name)}"><b>${esc(b.label)}</b><span>${esc(b.help)}</span></button>`).join('')}</div>` : '';
    }).join('');
    $$('[data-b]', box).forEach(x => x.addEventListener('click', () => {
      const b = blockOf(x.dataset.b);
      let id = b.name, n = 2;
      while (ST.edit.steps.some(s => s.id === id)) id = b.name + '-' + (n++);
      ST.edit.steps.push({ id, block: b.name, with: {} }); ST.editDirty = true; closeModal(); renderEditor(ST.edit.steps.length - 1);
    }));
  };
  draw(''); const q = $('#blk-q', box); q.focus(); q.addEventListener('input', () => draw(q.value));
}
function jsonDialog() {
  const box = modal(`<h2>Ricetta in JSON</h2><p class="hint">Si può copiare, incollare da un'altra installazione o modificare a mano.</p>
    <textarea id="js-t" style="min-height:380px">${esc(JSON.stringify(ST.edit, null, 2))}</textarea>
    <div class="row end" style="margin-top:10px"><span class="err grow" id="js-e"></span><button class="btn sec" id="js-c">Chiudi</button><button class="btn" id="js-a">Applica</button></div>`);
  $('#js-c', box).addEventListener('click', closeModal);
  $('#js-a', box).addEventListener('click', async () => {
    try { const r = JSON.parse($('#js-t', box).value); const v = await api('/api/validate', { body: { recipe: r } }); ST.edit = Object.assign(r, { version: ST.edit.version }); ST.edit.id = v.recipe.id; ST.editDirty = true; closeModal(); renderEditor(); }
    catch (e) { $('#js-e', box).textContent = e.message; }
  });
}
async function saveRecipe() {
  try {
    const r = await api('/api/recipes', { body: { recipe: ST.edit } });
    ST.edit = r.recipe; ST.editDirty = false; toast('Salvata: versione ' + r.recipe.version);
    if (location.hash !== '#editor/' + r.recipe.id) history.replaceState(null, '', '#editor/' + r.recipe.id);
    renderEditor(); return true;
  } catch (e) { toast('Non salvata: ' + e.message, 5000); return false; }
}

// ---------------------------------------------------------------------------------------------- file chooser
function chooseFS(opts) {
  return new Promise(resolve => {
    const box = modal(`<h2>${esc(opts.title)}</h2><div class="row"><input id="fs-p" class="grow" placeholder="percorso"><button class="btn sec small" id="fs-up">↑ Su</button><button class="btn sec small" id="fs-go">Vai</button></div>
      <div class="fs-list" id="fs-l" style="margin-top:8px"></div>
      <div class="row end" style="margin-top:10px"><span class="mut grow" id="fs-s"></span><button class="btn sec" id="fs-x">Annulla</button>${opts.files ? '' : '<button class="btn" id="fs-ok">Scegli questa cartella</button>'}</div>`);
    let cur = opts.start || '';
    const load = async p => {
      try {
        const r = await api('/api/fs?path=' + encodeURIComponent(p || ''));
        cur = r.path; $('#fs-p', box).value = r.path; box._parent = r.parent;
        $('#fs-l', box).innerHTML = r.dirs.map(d => `<div data-d="${esc(d.path)}">📁 ${esc(d.name)}</div>`).join('') +
          (opts.files ? r.files.map(f => `<div data-f="${esc(f.path)}">📄 ${esc(f.name)} <span class="mut">${f.kb} KB</span></div>`).join('') : `<div class="mut" style="cursor:default">${r.files.length} file</div>`);
        $$('[data-d]', box).forEach(x => x.addEventListener('click', () => load(x.dataset.d)));
        $$('[data-f]', box).forEach(x => x.addEventListener('click', () => { closeModal(); resolve(x.dataset.f); }));
      } catch (e) { $('#fs-s', box).textContent = e.message; }
    };
    $('#fs-go', box).addEventListener('click', () => load($('#fs-p', box).value));
    $('#fs-up', box).addEventListener('click', () => load(box._parent || ''));
    $('#fs-x', box).addEventListener('click', () => { closeModal(); resolve(null); });
    const ok = $('#fs-ok', box); if (ok) ok.addEventListener('click', () => { closeModal(); resolve(cur || null); });
    load(cur);
  });
}

// ---------------------------------------------------------------------------------------------- preview
async function viewPreview(id) {
  if (id && id !== '_modifica') { ST.edit = (await api('/api/recipes/' + encodeURIComponent(id))).recipe; ST.editDirty = false; }
  if (!ST.edit) { const r = await api('/api/recipes'); if (r.recipes[0]) ST.edit = (await api('/api/recipes/' + r.recipes[0].id)).recipe; }
  if (!ST.recipes.length) ST.recipes = (await api('/api/recipes')).recipes;
  const r = ST.edit;
  $('#view').innerHTML = `<h1>Prova su un file</h1><p class="sub">La ricetta lavora su una copia: niente viene toccato. Vedi cosa fa ogni passo prima di lanciarla su una cartella intera.</p>
    <div class="card"><div class="row">
      <div class="grow"><label>Ricetta</label><select id="pv-r">${ST.recipes.map(x => `<option value="${esc(x.id)}" ${r && x.id === r.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}${r && !ST.recipes.some(x => x.id === r.id) ? `<option selected value="">${esc(r.name)} (non salvata)</option>` : ''}</select></div>
      <div><label>Fino al passo</label><select id="pv-u"><option value="">tutti</option>${(r ? r.steps : []).map((s, i) => `<option value="${i + 1}">${i + 1}. ${esc(s.label || (blockOf(s.block) || {}).label || s.block)}</option>`).join('')}</select></div></div>
      <div class="row" style="margin-top:10px">
        ${ST.info.admin ? '<button class="btn sec" id="pv-pick">Scegli un file del PC</button>' : ''}
        <label class="btn sec" style="margin:0;color:var(--acc)">Carica un file<input type="file" id="pv-up" hidden></label>
        <span class="grow mono" id="pv-s">${esc(ST.sample ? ST.sample.label : 'nessun file scelto')}</span>
        <button class="btn" id="pv-go" ${ST.sample && r ? '' : 'disabled'}>Prova</button></div></div>
    <div id="pv-res"></div>`;
  $('#pv-r').addEventListener('change', async e => { if (e.target.value) { ST.edit = (await api('/api/recipes/' + e.target.value)).recipe; ST.editDirty = false; } viewPreview('_modifica'); });
  const setSample = s => { ST.sample = s; $('#pv-s').textContent = s.label; $('#pv-go').disabled = !ST.edit; };
  const pick = $('#pv-pick');
  if (pick) pick.addEventListener('click', async () => { const f = await chooseFS({ title: 'Scegli un file di prova', files: true }); if (f) setSample({ sample_path: f, label: f }); });
  $('#pv-up').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    $('#pv-s').textContent = 'invio…';
    try { const r2 = await api('/api/sample', { body: f, headers: { 'X-Name-B64': b64(f.name), 'Content-Type': 'application/octet-stream' } }); setSample({ sample: r2.sample, label: f.name }); }
    catch (err) { $('#pv-s').textContent = err.message; }
  });
  $('#pv-go').addEventListener('click', runPreview);
  if (ST.preview) drawPreview(ST.preview);
}
async function runPreview() {
  const b = { recipe: ST.edit, upto: $('#pv-u').value ? +$('#pv-u').value : null };
  Object.assign(b, ST.sample.sample ? { sample: ST.sample.sample } : { sample_path: ST.sample.sample_path });
  $('#pv-res').innerHTML = '<div class="card">Sto provando…</div>';
  const t0 = Date.now();
  try { ST.preview = await api('/api/preview', { body: b }); ST.preview._ms = Date.now() - t0; drawPreview(ST.preview); }
  catch (e) { $('#pv-res').innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}
function fieldsHTML(f) {
  const ks = Object.keys(f || {});
  if (!ks.length) return '<p class="mut">nessun campo</p>';
  return '<table>' + ks.map(k => { const v = f[k] || {}; return `<tr><td class="mono">${esc(k)}</td><td><b>${esc(v.v)}</b>${v.choices && v.choices.length ? `<div class="alt mut">anche: ${v.choices.map(esc).join(', ')}</div>` : ''}</td><td><span class="conf ${confCls(v.conf)}">${confTxt(v.conf)}</span></td><td class="mut">${esc(v.by)}</td></tr>`; }).join('') + '</table>';
}
function drawPreview(res) {
  const steps = res.steps.map((s, i) => `<tr><td>${i + 1}</td><td>${esc((blockOf(s.block) || {}).label || s.block)} <span class="mut mono">${esc(s.step)}</span></td><td>${s.items}</td><td class="okc">${s.ok}</td><td class="warnc">${s.review}</td><td class="err">${s.error}</td><td class="mut">${s.seconds}s</td></tr>`).join('');
  $('#pv-res').innerHTML = `${res.error ? `<div class="card err">${esc(res.error)}</div>` : ''}
    <div class="card"><h2>Passi</h2><div class="scroll"><table><tr><th>#</th><th>Blocco</th><th>File</th><th>ok</th><th>da verificare</th><th>errori</th><th>tempo</th></tr>${steps}</table></div>
    <p class="hint">Consumo: ${Object.entries(res.meters || {}).map(([k, v]) => esc(k) + ' ' + v).join(' · ') || 'nessuno'} · ${Math.round((res._ms || 0) / 100) / 10} s in tutto</p>
    ${res.outputs.length ? `<h3>File che scriverebbe</h3><pre>${res.outputs.map(esc).join('\n')}</pre>` : ''}</div>
    <div class="items">${res.items.map((it, i) => `<div class="card"><div class="row"><b class="grow">${esc(it.path.split(/[\\/]/).pop())}</b><span class="pill ${it.status === 'ok' ? 'ok' : it.status === 'review' ? 'warn' : it.status === 'error' ? 'bad' : ''}">${esc(it.status)}</span></div>
      <img class="thumb" data-pimg="${i}" alt="">
      ${it.flags.length ? `<div class="flags">${it.flags.map(esc).join('<br>')}</div>` : ''}
      ${it.cls ? `<p>Tipo: <b>${esc(it.cls)}</b></p>` : ''}${it.tags.length ? `<p>Tag: ${it.tags.map(t => `<span class="pill">${esc(t)}</span>`).join(' ')}</p>` : ''}
      ${fieldsHTML(it.fields)}
      ${it.text ? `<details><summary>Testo letto (${confTxt(it.text_conf)}, ${esc(it.text_by)})</summary><pre>${esc(it.text.slice(0, 6000))}</pre></details>` : ''}</div>`).join('')}</div>`;
  $$('[data-pimg]').forEach(async img => {
    const it = res.items[+img.dataset.pimg];
    try { img.src = await imgURL(`/api/preview-file?work=${res.work}&path=${encodeURIComponent(it.path)}&page=1`); } catch (e) { img.remove(); }
  });
}

// ---------------------------------------------------------------------------------------------- run dialog
function runDialog(rec) {
  const modes = ST.info.modes || ['local'];
  const box = modal(`<h2>Esegui «${esc(rec.name)}»</h2>
    <label>Cartella di partenza (i file da lavorare)</label><div class="row"><input id="rn-in" class="grow"><button class="btn sec small" id="rn-inb">Sfoglia</button></div>
    <label>Cartella di arrivo (vuota = dentro il lavoro, da scaricare)</label><div class="row"><input id="rn-out" class="grow"><button class="btn sec small" id="rn-outb">Sfoglia</button></div>
    <label>Nome del lavoro</label><input id="rn-name" value="${esc(rec.name)}">
    <label>Dove lavora</label><select id="rn-on">${['local', 'auto', 'remote'].filter(m => m === 'auto' ? modes.includes('remote') : modes.includes(m)).map(m => `<option value="${m}" ${(rec.run_on || 'local') === m ? 'selected' : ''}>${{ local: 'su questo PC', auto: 'automatico (i lavori grandi al server)', remote: 'sul server remoto' }[m]}</option>`).join('')}</select>
    <p class="hint">I file della cartella di partenza non vengono cambiati (salvo i passi «sposta» o «rinomina gli originali», se li hai messi).</p>
    <div class="row end" style="margin-top:12px"><span class="err grow" id="rn-e"></span><button class="btn sec" id="rn-x">Annulla</button><button class="btn" id="rn-go">Metti in coda</button></div>`);
  $('#rn-inb', box).addEventListener('click', async () => { const p = await chooseFS({ title: 'Cartella di partenza' }); runDialog._keep(box, p, null); });
  $('#rn-outb', box).addEventListener('click', async () => { const p = await chooseFS({ title: 'Cartella di arrivo' }); runDialog._keep(box, null, p); });
  runDialog._rec = rec; runDialog._vals = runDialog._vals || {};
  $('#rn-in', box).value = runDialog._vals.in || ''; $('#rn-out', box).value = runDialog._vals.out || '';
  $('#rn-x', box).addEventListener('click', closeModal);
  $('#rn-go', box).addEventListener('click', async () => {
    try {
      const j = await api('/api/jobs', { body: { recipe_id: rec.id, version: rec.version, input_dir: $('#rn-in', box).value, output_dir: $('#rn-out', box).value, name: $('#rn-name', box).value, run_on: $('#rn-on', box).value } });
      runDialog._vals = {}; closeModal(); toast('Lavoro in coda'); go('lavori/' + j.job.id);
    } catch (e) { $('#rn-e', box).textContent = e.message; }
  });
}
runDialog._keep = (box, inp, out) => {
  // the folder chooser replaced the dialog: reopen it with what was chosen
  const v = runDialog._vals = runDialog._vals || {};
  if (inp) v.in = inp;
  if (out) v.out = out;
  runDialog(runDialog._rec);
};

// ---------------------------------------------------------------------------------------------- jobs
async function pollJobs() {
  if (!ST.info) return;
  try {
    const r = await api('/api/jobs');
    ST.jobs = r.jobs;
    try { const inf = await api('/api/info'); ST.info.credits = inf.credits; footer(); } catch (e) { /* */ }
    const running = r.jobs.filter(j => ['running', 'queued', 'uploading'].includes(j.status)).length;
    const review = r.jobs.filter(j => j.status === 'waiting_review').length;
    const a = $('#nav-running'); a.hidden = !running; a.textContent = running;
    const b = $('#nav-review'); b.hidden = !review; b.textContent = review;
    if (location.hash.startsWith('#lavori')) drawJobs();
  } catch (e) { /* offline for a moment */ }
}
async function viewJobs() { $('#view').innerHTML = '<h1>Lavori</h1><p class="sub">Coda dei lavori, avanzamento e risultati. I lavori fermi alla verifica aspettano una persona.</p><div id="jobs"></div>'; await pollJobs(); drawJobs(); }
function drawJobs() {
  const el = $('#jobs'); if (!el) return;
  const sel = location.hash.split('/')[1];
  el.innerHTML = ST.jobs.length ? ST.jobs.map(j => {
    const p = j.progress || {}, t = j.totals || {};
    const pct = p.total ? Math.round(100 * p.done / p.total) : (j.status === 'done' ? 100 : 0);
    return `<div class="card" ${sel === j.id ? 'style="outline:2px solid var(--acc)"' : ''}><div class="row"><div class="grow"><h2 style="margin:0">${esc(j.name)}</h2>
      <span class="mut">${esc(fmtDate(j.created))} · ${j.mode === 'remote' ? 'sul server remoto' : 'su questo PC'}${j.tenant !== 'local' ? ' · cliente ' + esc(j.tenant) : ''} · ricetta v${j.recipe_version}</span></div>
      <span class="pill ${STATUS_PILL[j.status] || ''}">${esc(STATUS_IT[j.status] || j.status)}</span></div>
      ${['running', 'queued'].includes(j.status) ? `<div class="row" style="margin-top:8px"><div class="bar grow"><i style="width:${pct}%"></i></div><span class="mut">passo ${p.step_index || 0}/${p.steps || '?'} ${esc(p.step || '')} · ${p.done || 0}/${p.total || 0}</span></div>` : ''}
      <p class="hint">${t.items != null ? `${t.items} file · ok ${t.ok || 0} · da verificare ${t.review || 0} · errori ${t.error || 0} · saltati ${t.skip || 0}` : ''} · crediti ${j.credits || 0}${j.error ? ` · <span class="err">${esc(j.error)}</span>` : ''}</p>
      <div class="row">${j.status === 'waiting_review' || (t.review || 0) > 0 ? `<button class="btn small" data-rv="${j.id}">Verifica</button>` : ''}
        ${['waiting_review', 'failed', 'cancelled'].includes(j.status) ? `<button class="btn small sec" data-res="${j.id}">${j.status === 'waiting_review' ? 'Riprendi senza aspettare' : 'Riprova'}</button>` : ''}
        ${['running', 'queued', 'waiting_review'].includes(j.status) ? `<button class="btn small sec" data-can="${j.id}">Annulla</button>` : ''}
        ${j.status === 'done' ? `<button class="btn small sec" data-out="${j.id}">Risultati</button><button class="btn small sec" data-dl="${j.id}">Scarica zip</button>` : ''}
        <span class="grow"></span><span class="mut mono">${esc(j.id)}</span></div></div>`;
  }).join('') : '<div class="card mut">Ancora nessun lavoro. Apri una ricetta e premi «Esegui su una cartella».</div>';
  $$('[data-rv]').forEach(b => b.addEventListener('click', () => go('verifica/' + b.dataset.rv)));
  $$('[data-res]').forEach(b => b.addEventListener('click', async () => { try { await api(`/api/jobs/${b.dataset.res}/resume`, { body: {} }); pollJobs(); } catch (e) { toast(e.message); } }));
  $$('[data-can]').forEach(b => b.addEventListener('click', async () => { await api(`/api/jobs/${b.dataset.can}/cancel`, { body: {} }); pollJobs(); }));
  $$('[data-dl]').forEach(b => b.addEventListener('click', async () => {
    const r = await api(`/api/jobs/${b.dataset.dl}/download`, { raw: true }); const u = URL.createObjectURL(await r.blob());
    const a = document.createElement('a'); a.href = u; a.download = `risultati-${b.dataset.dl}.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 5000);
  }));
  $$('[data-out]').forEach(b => b.addEventListener('click', async () => {
    const r = await api(`/api/jobs/${b.dataset.out}/outputs`);
    const box = modal(`<h2>Risultati</h2>${r.output_dir ? `<p class="mono">${esc(r.output_dir)}</p>` : ''}<pre>${r.files.map(esc).join('\n') || 'nessun file'}</pre><div class="row end"><button class="btn" id="o-x">Chiudi</button></div>`);
    $('#o-x', box).addEventListener('click', closeModal);
  }));
}

// ---------------------------------------------------------------------------------------------- review
function keymap() {
  const user = (ST.info && ST.info.shortcuts) || ST.shortcuts || {};
  const m = {};
  Object.keys(KEYS_DEFAULT).forEach(a => { (user[a] && user[a].length ? user[a] : KEYS_DEFAULT[a]).forEach(k => { m[k] = a; }); });
  return m;
}
async function viewReview(jid) {
  if (!jid) {
    await pollJobs();
    const js = ST.jobs.filter(j => j.status === 'waiting_review' || (j.totals || {}).review > 0);
    $('#view').innerHTML = `<h1>Verifica</h1><p class="sub">Qui una persona guarda solo i file incerti: conferma, corregge o assegna un valore, con i tasti.</p>
      ${js.length ? js.map(j => `<div class="card row"><div class="grow"><b>${esc(j.name)}</b><br><span class="mut">${(j.totals || {}).review || 0} da verificare · ${esc(fmtDate(j.created))}</span></div><button class="btn" data-j="${j.id}">Inizia</button></div>`).join('') : '<div class="card mut">Niente da verificare.</div>'}`;
    $$('[data-j]').forEach(b => b.addEventListener('click', () => go('verifica/' + b.dataset.j)));
    return;
  }
  if (ST.info.admin && !ST.shortcuts) { try { ST.shortcuts = ((await api('/api/settings')).settings.shortcuts) || {}; } catch (e) { ST.shortcuts = {}; } }
  const r = await api(`/api/jobs/${jid}/items?status=review`);
  const done = await api(`/api/jobs/${jid}/items?status=reviewed`);
  const job = (await api('/api/jobs/' + jid)).job;
  ST.rv = { jid, job, items: r.items, done: done.items.filter(x => x.status !== 'review'), i: 0, zoom: 0, page: 1, t0: Date.now(), times: [], img: {} };
  drawReview();
}
function rvCur() { return ST.rv.items[ST.rv.i]; }
function drawReview() {
  const R = ST.rv;
  const it = rvCur();
  const left = R.items.length, done = R.done.length;
  const avg = R.times.length ? R.times.reduce((a, b) => a + b, 0) / R.times.length : 0;
  $('#view').innerHTML = `<div class="row"><h1 class="grow">${esc(R.job.name)}</h1>
      <span class="mut">${done} fatti · ${left} da fare${avg ? ` · ${(avg / 1000).toFixed(1)} s a file · fine tra ~${Math.ceil(avg * left / 60000)} min` : ''}</span>
      <button class="btn sec small" id="rv-keys">Tasti <span class="keys">?</span></button>
      ${R.job.status === 'waiting_review' ? `<button class="btn ${left ? 'sec' : ''} small" id="rv-resume">${left ? 'Riprendi il lavoro (gli altri restano segnati)' : 'Riprendi il lavoro'}</button>` : ''}</div>
    ${it ? `<div class="rv"><div class="rv-list" id="rv-list">${R.items.map((x, i) => `<div data-ix="${i}" class="${i === R.i ? 'on' : ''}">${esc(x.src.split('/').pop())}${x.page ? ' · p.' + x.page : ''}<small>${esc((x.flags || [])[0] || '')}</small></div>`).join('')}</div>
      <div class="rv-img" id="rv-img"><img id="rv-pic" alt=""></div>
      <div class="rv-side" id="rv-side"></div></div>` : `<div class="card"><h2>Finito 👍</h2><p>Nessun file da verificare in questo lavoro.</p>${R.job.status === 'waiting_review' ? '<p>Premi «Riprendi il lavoro» per completare i passi che restano.</p>' : ''}</div>`}`;
  const rs = $('#rv-resume'); if (rs) rs.addEventListener('click', async () => { try { await api(`/api/jobs/${R.jid}/resume`, { body: {} }); toast('Lavoro ripreso'); go('lavori/' + R.jid); } catch (e) { toast(e.message); } });
  $('#rv-keys').addEventListener('click', keysHelp);
  if (!it) return;
  $$('[data-ix]').forEach(d => d.addEventListener('click', () => { R.i = +d.dataset.ix; R.page = 1; drawReview(); }));
  const li = $('[data-ix].on'); if (li) li.scrollIntoView({ block: 'nearest' });
  drawSide(it); loadImg(it);
}
function drawSide(it) {
  const R = ST.rv;
  const cfg = (it.meta && it.meta.review) || {};
  const fields = (cfg.fields && cfg.fields.length ? cfg.fields : Object.keys(it.fields || {}));
  const choices = cfg.choices || [], tags = cfg.tags || [];
  $('#rv-side').innerHTML = `<div class="card">
    ${cfg.instructions ? `<p>${esc(cfg.instructions)}</p>` : ''}
    ${(it.flags || []).length ? `<div class="flags">${it.flags.map(esc).join('<br>')}</div>` : ''}
    <form id="rv-f" autocomplete="off">${fields.map((k, n) => { const f = (it.fields || {})[k] || {}; const alts = (f.choices || []).concat((f.alt || []).map(a => a.v)).filter(v => v !== '' && v != null && v !== f.v);
      return `<label>${esc(k)} <span class="conf ${confCls(f.conf)}">${confTxt(f.conf)}</span> <span class="mut">${esc(f.by || '')}</span></label>
      <input data-fk="${esc(k)}" value="${esc(f.v == null ? '' : f.v)}" ${n === 0 ? 'id="rv-first"' : ''}>
      ${alts.length ? `<div class="alt">${alts.slice(0, 5).map(a => `<button type="button" class="btn sec" data-alt="${esc(k)}" data-v="${esc(a)}">${esc(a)}</button>`).join('')}</div>` : ''}`; }).join('')}
    <label>Campo nuovo</label><div class="row"><input id="rv-nk" placeholder="nome" style="width:40%"><input id="rv-nv" placeholder="valore" class="grow"></div>
    </form>
    ${choices.length ? `<h3>${esc(cfg.choice_field || 'Valore')}</h3><div class="choices">${choices.map((c, n) => `<button class="btn sec small ${String(((it.fields || {})[cfg.choice_field] || {}).v || it.cls) === c ? 'on' : ''}" data-ch="${n}"><span class="keys">${n + 1}</span> ${esc(c)}</button>`).join('')}</div>` : ''}
    ${tags.length ? `<h3>Tag</h3><div class="choices">${tags.map((t, n) => `<button class="btn sec small ${(it.tags || []).includes(t) ? 'on' : ''}" data-tg="${n}"><span class="keys">⇧${n + 1}</span> ${esc(t)}</button>`).join('')}</div>` : ''}
    <label>Nota</label><input id="rv-note" placeholder="facoltativa">
    <div class="row" style="margin-top:12px"><button class="btn ok grow" id="rv-ok">Conferma <span class="keys">Invio</span></button><button class="btn bad" id="rv-no">Escludi <span class="keys">x</span></button><button class="btn sec" id="rv-undo">↶ <span class="keys">u</span></button></div>
    <p class="hint">${esc(it.src)}${it.page ? ' · pagina ' + it.page : ''} · testo ${confTxt(it.text_conf)} ${esc(it.text_by || '')}</p>
    ${it.text ? `<details><summary>Testo letto</summary><pre>${esc(it.text.slice(0, 8000))}</pre></details>` : ''}</div>`;
  $$('[data-alt]').forEach(b => b.addEventListener('click', () => { $(`[data-fk="${CSS.escape(b.dataset.alt)}"]`).value = b.dataset.v; }));
  $$('[data-ch]').forEach(b => b.addEventListener('click', () => assignChoice(+b.dataset.ch)));
  $$('[data-tg]').forEach(b => b.addEventListener('click', () => toggleTag(+b.dataset.tg)));
  $('#rv-ok').addEventListener('click', () => decide('certify'));
  $('#rv-no').addEventListener('click', () => decide('reject'));
  $('#rv-undo').addEventListener('click', undoLast);
  $('#rv-f').addEventListener('submit', e => { e.preventDefault(); decide('certify'); });
  R.dirtyTags = null;
}
async function loadImg(it) {
  const R = ST.rv, key = it.id + '#' + R.page;
  const pic = $('#rv-pic');
  if (!R.img[key]) { try { R.img[key] = await imgURL(`/api/jobs/${R.jid}/items/${encodeURIComponent(it.id)}/image${R.page > 1 ? '?page=' + R.page : ''}`); } catch (e) { R.img[key] = ''; } }
  if (rvCur() !== it || !pic) return;
  pic.src = R.img[key];
  applyZoom();
  // prefetch the next one: the reviewer never waits for an image
  const nx = R.items[R.i + 1];
  if (nx && !R.img[nx.id + '#1']) imgURL(`/api/jobs/${R.jid}/items/${encodeURIComponent(nx.id)}/image`).then(u => { R.img[nx.id + '#1'] = u; }).catch(() => {});
}
function applyZoom() {
  const pic = $('#rv-pic'), box = $('#rv-img'); if (!pic || !box) return;
  const z = ST.rv.zoom;
  if (!z) { pic.style.width = '100%'; pic.style.height = 'auto'; }
  else { pic.style.width = (100 * z) + '%'; }
}
function collect() {
  const f = {};
  $$('[data-fk]').forEach(el => { f[el.dataset.fk] = el.value.trim(); });
  const nk = $('#rv-nk') && $('#rv-nk').value.trim();
  if (nk) f[nk] = $('#rv-nv').value.trim();
  return f;
}
async function decide(action, extra) {
  const R = ST.rv, it = rvCur(); if (!it) return;
  const body = Object.assign({ action, fields: action === 'reject' ? {} : collect(), note: ($('#rv-note') || {}).value || '' }, extra || {});
  if (R.dirtyTags) body.tags = R.dirtyTags;
  try {
    const res = await api(`/api/jobs/${R.jid}/items/${encodeURIComponent(it.id)}`, { body });
    if (action === 'set') { R.items[R.i] = res.item; drawSide(res.item); return; }
    R.times.push(Date.now() - R.t0); R.t0 = Date.now();
    R.done.push(res.item); R.items.splice(R.i, 1); R.last = res.item.id;
    if (R.i >= R.items.length) R.i = Math.max(0, R.items.length - 1);
    R.page = 1; drawReview();
  } catch (e) { toast(e.message, 4000); }
}
async function undoLast() {
  const R = ST.rv; const id = R.last || (R.done[R.done.length - 1] || {}).id; if (!id) return toast('Niente da annullare');
  try {
    const res = await api(`/api/jobs/${R.jid}/items/${encodeURIComponent(id)}`, { body: { action: 'undo' } });
    R.done = R.done.filter(x => x.id !== id);
    if (res.item.status === 'review') { R.items.splice(R.i, 0, res.item); }
    R.last = null; toast('Annullato'); drawReview();
  } catch (e) { toast(e.message); }
}
function assignChoice(n) {
  const it = rvCur(); const cfg = (it.meta && it.meta.review) || {}; const c = (cfg.choices || [])[n]; if (c == null) return;
  const extra = {};
  if (cfg.choice_field) { const el = $(`[data-fk="${CSS.escape(cfg.choice_field)}"]`); if (el) el.value = c; else extra.fields = Object.assign(collect(), { [cfg.choice_field]: c }); }
  else extra.cls = c;
  decide('certify', extra);
}
function toggleTag(n) {
  const R = ST.rv, it = rvCur(); const cfg = (it.meta && it.meta.review) || {}; const t = (cfg.tags || [])[n]; if (t == null) return;
  const cur = R.dirtyTags || (it.tags || []).slice();
  const i = cur.indexOf(t); if (i >= 0) cur.splice(i, 1); else cur.push(t);
  R.dirtyTags = cur;
  const b = $(`[data-tg="${n}"]`); if (b) b.classList.toggle('on', i < 0);
}
function keysHelp() {
  const m = {}; Object.entries(keymap()).forEach(([k, a]) => { (m[a] = m[a] || []).push(k); });
  const box = modal(`<h2>Tasti della verifica</h2><table>${Object.keys(KEY_LABEL).map(a => `<tr><td>${esc(KEY_LABEL[a])}</td><td>${(m[a] || []).map(k => `<span class="keys">${esc(k)}</span>`).join(' ')}</td></tr>`).join('')}
    <tr><td>Valore rapido (tipo, classe…)</td><td><span class="keys">1</span> … <span class="keys">9</span></td></tr><tr><td>Tag rapido</td><td><span class="keys">Maiusc</span>+<span class="keys">1</span> … <span class="keys">9</span></td></tr>
    <tr><td>Esci da un campo</td><td><span class="keys">Esc</span></td></tr></table>${ST.info.admin ? '<p class="hint">Si cambiano in Impostazioni › Tasti della verifica.</p>' : ''}<div class="row end"><button class="btn" id="k-x">Chiudi</button></div>`);
  $('#k-x', box).addEventListener('click', closeModal);
}
document.addEventListener('keydown', e => {
  if (!ST.rv || !location.hash.startsWith('#verifica/') || !$('#modal').hidden) return;
  const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (inField) {
    if (e.key === 'Escape') { document.activeElement.blur(); e.preventDefault(); }
    else if (e.key === 'Enter' && document.activeElement.tagName === 'INPUT' && document.activeElement.closest('#rv-side')) { e.preventDefault(); decide('certify'); }
    return; // Enter inside a field = confirm with the values written
  }
  const R = ST.rv;
  if (/^[1-9]$/.test(e.key) || (e.shiftKey && /^Digit[1-9]$/.test(e.code))) {
    const n = +(e.code.startsWith('Digit') ? e.code.slice(5) : e.key) - 1;
    if (e.shiftKey) toggleTag(n); else assignChoice(n);
    e.preventDefault(); return;
  }
  const a = keymap()[e.key];
  if (!a) return;
  e.preventDefault();
  if (a === 'next') { if (R.i < R.items.length - 1) { R.i++; R.page = 1; drawReview(); } }
  else if (a === 'prev') { if (R.i > 0) { R.i--; R.page = 1; drawReview(); } }
  else if (a === 'certify') decide('certify');
  else if (a === 'reject') decide('reject');
  else if (a === 'undo') undoLast();
  else if (a === 'edit') { const f = $('#rv-first'); if (f) { f.focus(); f.select(); } }
  else if (a === 'zoomIn') { R.zoom = (R.zoom || 1) * 1.25; applyZoom(); }
  else if (a === 'zoomOut') { R.zoom = Math.max(0.3, (R.zoom || 1) / 1.25); applyZoom(); }
  else if (a === 'zoomFit') { R.zoom = 0; applyZoom(); }
  else if (a === 'pageNext') { R.page++; loadImg(rvCur()); }
  else if (a === 'pagePrev') { if (R.page > 1) { R.page--; loadImg(rvCur()); } }
  else if (a === 'help') keysHelp();
});

// ---------------------------------------------------------------------------------------------- settings
async function viewSettings(tab) {
  if (!ST.info.admin) return go('ricette');
  tab = tab || 'lettura';
  const s = (await api('/api/settings')).settings;
  const info = await api('/api/info');
  const tabs = { lettura: 'OCR', ai: 'AI', servizi: 'Servizi esterni', remoto: 'Esecuzione remota', crediti: 'Crediti e clienti', tasti: 'Tasti della verifica', sistema: 'Sistema' };
  $('#view').innerHTML = `<h1>Impostazioni</h1><p class="sub">Valgono per questo PC (o per questo server). Le chiavi restano qui, mai nelle ricette.</p>
    <div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${esc(v)}</button>`).join('')}</div><div class="card" id="st-b"></div>
    <div class="row end"><span class="grow mut" id="st-m"></span><button class="btn" id="st-save">Salva</button></div>`;
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => go('impostazioni/' + b.dataset.tab)));
  const e = info.engines || {};
  const B = $('#st-b');
  const inp = (path, label, val, hint, type) => `<div><label>${esc(label)}</label><input data-s="${path}" ${type ? `type="${type}"` : ''} value="${esc(val == null ? '' : val)}">${hint ? `<p class="hint">${esc(hint)}</p>` : ''}</div>`;
  const sel = (path, label, val, opts) => `<div><label>${esc(label)}</label><select data-s="${path}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(val) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  if (tab === 'lettura') B.innerHTML = `<p>Tesseract: ${e.tesseract ? `<b class="okc">installato</b> (lingue: ${esc((e.tesseract_langs || []).join(', '))})` : '<b class="err">non installato</b> — vedi la guida per installarlo (gratuito)'} · PDF → immagini: ${e.pdfium ? '<b class="okc">sì</b>' : '<b class="warnc">serve pypdfium2</b>'}</p>
    <div class="step-b" style="padding:0">${sel('ocr.engine', 'Motore predefinito', s.ocr.engine, [['auto', 'automatico'], ['tesseract', 'Tesseract sul PC'], ['remote', 'servizio OCR remoto'], ['ai', 'modello AI']])}
    ${inp('ocr.lang', 'Lingue', s.ocr.lang, 'es. ita+eng')}${inp('ocr.tesseract_cmd', 'Percorso di Tesseract', s.ocr.tesseract_cmd, 'vuoto = cercalo da solo')}
    ${inp('ocr.remote_endpoint', 'Servizio OCR remoto', s.ocr.remote_endpoint, 'nome di un servizio esterno (scheda Servizi esterni)')}${inp('threads', 'File insieme', s.threads, 'quanti file lavorare in parallelo (2-4 su un PC normale)')}</div>`;
  if (tab === 'ai') B.innerHTML = `<div class="step-b" style="padding:0">${sel('ai.provider', 'Fornitore', s.ai.provider, [['', 'spenta'], ['anthropic', 'Claude (Anthropic)'], ['openai_compatible', 'compatibile OpenAI (OpenAI, Mistral, Azure, OpenRouter, vLLM, LM Studio…)'], ['ollama', 'Ollama sul PC'], ['mock', 'finta (solo prove)']])}
    ${inp('ai.model', 'Modello', s.ai.model, 'vuoto = claude-haiku-5-5 per Claude; obbligatorio per gli altri')}${inp('ai.base_url', 'Indirizzo del servizio', s.ai.base_url, 'solo per compatibile OpenAI / Ollama')}
    ${inp('ai.api_key', 'Chiave', s.ai.api_key, 'resta su questo PC', 'password')}${inp('ai.timeout', 'Attesa massima (secondi)', s.ai.timeout)}</div>
    <p class="hint">Mandare documenti a un servizio AI esterno richiede la nomina a sub-responsabile (GDPR art. 28): con Ollama tutto resta sul PC.</p>`;
  if (tab === 'servizi') {
    const eps = s.endpoints || {};
    B.innerHTML = `<p>Servizi tuoi (per esempio un server Python con un OCR potente o un controllo anagrafico), usati dal blocco «Servizio esterno» e dall'OCR remoto. Ricevono JSON con il file in base64 e rispondono JSON (vedi la guida).</p>
      <table id="ep-t"><tr><th>Nome</th><th>Indirizzo</th><th>Chiave</th><th>Attesa (s)</th><th></th></tr>${Object.entries(eps).map(([n, v]) => epRow(n, v)).join('')}</table><button class="btn sec small" id="ep-add" style="margin-top:8px">+ Servizio</button>`;
    $('#ep-add').addEventListener('click', () => { $('#ep-t').insertAdjacentHTML('beforeend', epRow('', {})); bindEp(); });
    bindEp();
  }
  if (tab === 'remoto') B.innerHTML = `<p>Un PC leggero può mandare i lavori a un server (il tuo hub o un server centrale con gli Strumenti avviati con <code>serve --remote</code>). Licenza di questo PC: ${esc((info.modes || []).join(' + '))}.</p>
    <div class="step-b" style="padding:0">${inp('remote.url', 'Indirizzo del server', s.remote.url, 'es. https://strumenti.miostudio.it')}${inp('remote.token', 'Gettone di questo cliente', s.remote.token, 'dato da chi gestisce il server', 'password')}
    ${inp('remote.auto_mb', 'Automatico: al server sopra (MB)', s.remote.auto_mb)}<div><label><input type="checkbox" data-s="remote.always" ${s.remote.always ? 'checked' : ''}>In automatico, sempre al server</label></div></div>
    <button class="btn sec" id="rm-ping" style="margin-top:10px">Prova il collegamento</button> <span id="rm-r"></span>`;
  if (tab === 'crediti') {
    const [u, t] = await Promise.all([api('/api/usage'), api('/api/tokens')]);
    const costs = Object.assign({ page: 0, ocr_page: 1, ai_call: 10, http_call: 1 }, (s.credits || {}).costs || {});
    B.innerHTML = `<h2>Costo in crediti</h2><div class="step-b" style="padding:0">${Object.entries(costs).map(([k, v]) => inp('credits.costs.' + k, { page: 'pagina lavorata', ocr_page: 'pagina letta con OCR', ai_call: 'chiamata AI', http_call: 'chiamata a un servizio' }[k] || k, v)).join('')}
      ${inp('credits.local_month', 'Limite mensile di questo PC', s.credits.local_month, 'vuoto = nessun limite')}</div>
      <h2 style="margin-top:16px">Gettoni dei clienti (server remoto)</h2><table><tr><th>Cliente</th><th>Piano</th><th>Crediti/mese</th><th>Creato</th><th></th></tr>${t.tokens.map(x => `<tr><td>${esc(x.tenant)}</td><td>${esc(x.plan || '')}</td><td>${x.credits_month == null ? '∞' : x.credits_month}</td><td>${esc(fmtDate(x.created))}</td><td>${x.revoked ? '<span class="pill bad">revocato</span>' : `<button class="btn small sec" data-rvk="${esc(x.tenant)}">Revoca</button>`}</td></tr>`).join('')}</table>
      <div class="row" style="margin-top:8px"><input id="tk-c" placeholder="cliente (es. studio-rossi)" style="width:200px"><input id="tk-n" placeholder="crediti al mese" style="width:150px"><input id="tk-p" placeholder="piano" style="width:120px"><button class="btn sec small" id="tk-go">Crea gettone</button></div><p id="tk-r" class="mono"></p>
      <h2 style="margin-top:16px">Consumi</h2><table><tr><th>Mese</th><th>Cliente</th><th>Cosa</th><th>Quantità</th><th>Crediti</th></tr>${u.usage.map(x => `<tr><td>${esc(x.month)}</td><td>${esc(x.tenant)}</td><td>${esc(x.kind)}</td><td>${x.qty}</td><td>${x.credits}</td></tr>`).join('')}</table>`;
    $('#tk-go').addEventListener('click', async () => { try { const r = await api('/api/tokens', { body: { tenant: $('#tk-c').value, credits_month: $('#tk-n').value, plan: $('#tk-p').value } }); $('#tk-r').textContent = 'Gettone (copialo ora, non si rivede): ' + r.token; } catch (er) { $('#tk-r').textContent = er.message; } });
    $$('[data-rvk]').forEach(b => b.addEventListener('click', async () => { await api('/api/tokens', { body: { tenant: b.dataset.rvk, revoke: true } }); go('impostazioni/crediti'); }));
  }
  if (tab === 'tasti') {
    const sc = s.shortcuts || {};
    B.innerHTML = `<p>Clicca un tasto e premi quello che vuoi usare (anche più di uno, separati da virgola nel campo).</p><table>${Object.keys(KEYS_DEFAULT).map(a => `<tr><td>${esc(KEY_LABEL[a])}</td><td><input data-key="${a}" value="${esc((sc[a] && sc[a].length ? sc[a] : KEYS_DEFAULT[a]).join(', '))}"></td></tr>`).join('')}</table>
      <p class="hint">1…9 assegnano i valori rapidi e Maiusc+1…9 i tag: sono fissi. <button class="btn small sec" id="k-def">Ripristina i tasti di partenza</button></p>`;
    $$('[data-key]').forEach(el => el.addEventListener('keydown', ev => { if (ev.key === 'Tab') return; ev.preventDefault(); const k = ev.key === ' ' ? 'Space' : ev.key; if (k === 'Backspace') { el.value = ''; return; } const cur = el.value.split(',').map(x => x.trim()).filter(Boolean); if (!cur.includes(k)) cur.push(k); el.value = cur.slice(-2).join(', '); }));
    $('#k-def').addEventListener('click', () => { $$('[data-key]').forEach(el => { el.value = KEYS_DEFAULT[el.dataset.key].join(', '); }); });
  }
  if (tab === 'sistema') {
    const au = await api('/api/audit/verify');
    B.innerHTML = `<p>Versione ${esc(info.version)} · ${info.remote_mode ? 'server remoto (accetta lavori dai clienti)' : 'solo questo PC'}</p>
      <p>Registro delle verifiche: ${au.ok ? `<b class="okc">integro</b> (${au.rows} decisioni, ognuna legata alla precedente)` : `<b class="err">modificato alla riga ${au.rows}</b>`}</p>
      <div class="step-b" style="padding:0">${inp('workers', 'Lavori insieme', s.workers, 'quanti lavori della coda girano insieme (vale al prossimo avvio)')}${inp('max_upload_mb', 'File caricato al massimo (MB)', s.max_upload_mb)}
      <div class="wide"><label>Cartelle sfogliabili</label><textarea data-s="roots" data-list="1" style="min-height:50px">${esc((s.roots || []).join('\n'))}</textarea><p class="hint">una per riga; vuoto = la cartella dell'utente e i dischi</p></div></div>`;
  }
  const rp = $('#rm-ping'); if (rp) rp.addEventListener('click', async () => { $('#rm-r').textContent = '…'; try { await saveSettings(true); const r = await api('/api/remote/ping'); $('#rm-r').innerHTML = `<b class="okc">collegato</b> · versione ${esc(r.remote.version)} · cliente ${esc(r.remote.tenant)} · crediti usati ${esc((r.remote.credits || {}).used_month)}`; } catch (er) { $('#rm-r').innerHTML = `<span class="err">${esc(er.message)}</span>`; } });
  $('#st-save').addEventListener('click', () => saveSettings(false));
}
function epRow(n, v) { return `<tr data-ep><td><input data-e="name" value="${esc(n)}"></td><td><input data-e="url" value="${esc(v.url || '')}"></td><td><input data-e="token" type="password" value="${esc(v.token || '')}"></td><td><input data-e="timeout" value="${esc(v.timeout || 120)}" style="width:80px"></td><td><button class="btn ghost" data-epx>✕</button></td></tr>`; }
function bindEp() { $$('[data-epx]').forEach(b => { b.onclick = () => b.closest('tr').remove(); }); }
async function saveSettings(quiet) {
  const out = {};
  const set = (path, v) => { const ks = path.split('.'); let o = out; ks.slice(0, -1).forEach(k => { o = o[k] = o[k] || {}; }); o[ks[ks.length - 1]] = v; };
  $$('[data-s]').forEach(el => {
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.list) v = el.value.split('\n').map(x => x.trim()).filter(Boolean);
    else if (typeof v === 'string' && /^(threads|workers|max_upload_mb|remote\.auto_mb|ai\.timeout|credits\.)/.test(el.dataset.s)) v = v.trim() === '' ? null : Number(v);
    set(el.dataset.s, v);
  });
  if ($('#ep-t')) { out.endpoints = {}; $$('[data-ep]').forEach(tr => { const g = k => $(`[data-e="${k}"]`, tr).value.trim(); if (g('name')) out.endpoints[g('name')] = { url: g('url'), token: g('token'), timeout: Number(g('timeout')) || 120 }; }); }
  if ($('[data-key]')) { out.shortcuts = {}; $$('[data-key]').forEach(el => { out.shortcuts[el.dataset.key] = el.value.split(',').map(x => x.trim()).filter(Boolean); }); ST.shortcuts = out.shortcuts; }
  try { await api('/api/settings', { body: { settings: out } }); if (!quiet) toast('Impostazioni salvate'); } catch (e) { toast(e.message, 4000); throw e; }
}

boot();
