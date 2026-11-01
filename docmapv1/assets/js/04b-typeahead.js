/* =====================================================================
   DocMap 2026 — Typeahead / autocomplete component + binder editor helpers (v8, stream B)

   1) taAttach(input, opts) — reusable "Ajax-style" autocomplete for any <input>.
      opts.source(query, input) → candidates [{value, count?, meta?, tag?, match?, key?, ...}]
        value  text written into the input       count  usage count (shown as ×N, used for ranking)
        meta   second line (e.g. "Multi M-10234 · Parma (PR)")   tag  small badge when count is 0
        match  text searched (defaults to value) key   companyKey() for exact "same name" matches
      opts.multi  comma-separated field (tags, codes, people): suggestions apply to the token
                  under the caret, tokens already present are excluded. opts.joiner (',' or ', ').
      opts.top    suggestions shown on focus with an empty field (most used first, default 4)
      opts.max    suggestions while typing (default 8)       opts.onPick(item, input)
      Ranking (accent/case-insensitive): same name apart from case/spaces/punctuation, prefix of the
      whole value, prefix of a word, contains; ties by usage count. Keys ↑ ↓ Enter Esc Tab, mouse.
      One shared popup (#ta-pop, role=listbox, position:fixed above modals); the input gets
      role=combobox + aria-activedescendant. Picking writes the value and fires a bubbling "input"
      event, so the normal form handlers (09-actions.js) update the state.

   2) Binder editor helpers (UI.ed = {d, isNew, pipeMode, linesDraft, codeTouched, catTouched}):
      sources for client / Codice Multi / place / category / year / extra codes / tags / rooms /
      cabinets / people / document names / positions; duplicate-spelling guard for companies
      (companyKey); one-click fix for a duplicate speaking code; "Posizione rapida" (parseQuickLocation)
      with recent positions; contents status per item; explicit "one line per item" mode; the
      "Altro" section (contacts, notes); register offer after saving.

   Data model added in v8 (see also 02-core.js / 06-db.js):
     binder.contacts  string, comma-separated people involved (not printed by default)
     binder.notes     string, free note (not printed by default)
     binder.contents_items[i].status  'archive' (default) | 'in_use' | 'client'
       CSV / pipe text: "2025: Fatture [cliente]", "2025: F24 [in uso]" (no suffix = in archive)
   ===================================================================== */
'use strict';

Object.assign(I18N.it, {
  ta_top:'Più usati', ta_used:'Usato {n} volte', ta_register:'anagrafica', ta_hint:'↑ ↓ per scegliere · Invio per confermare · Esc per chiudere',
  ed_quickloc:'Posizione rapida', ed_quickloc_ph:'es. A1-β-SX · B2 3 · Ufficio 1 · 2-α', ed_loc_recent:'Recenti', ed_loc_details:'Dettagli posizione',
  ed_loc_none:'Nessuna posizione: scrivi ad esempio A1-α', ed_loc_used:'Usata {n} volte',
  lp_room:'Stanza', lp_cab:'Armadio', lp_shelf:'Ripiano', lp_sector:'Settore',
  ed_company_same:'Esiste già come «{c}».', ed_company_use:'Usa questa grafia', ed_company_norm:'Grafia uniformata a quella già in archivio: «{c}».',
  e_dup_code2:'Codice già presente: usa {c}', ed_code_fix:'Usa {c}',
  ed_reg_offer:'«{c}» non è nell\'anagrafica clienti', ed_reg_add:'Aggiungi all\'anagrafica', ed_reg_added:'Aggiunto all\'anagrafica clienti: {c}',
  cis_archive:'In archivio', cis_in_use:'In uso', cis_client:'Al cliente', cis_label:'Stato del documento',
  cis_sum_in_use:'{n} in uso', cis_sum_client:'{n} al cliente', l_ci_in_use:'in uso', l_ci_client:'cliente',
  f_lines_hint2:'Una voce per riga, ad esempio "2025: Fatture acquisto". Per una voce fuori dall\'archivio aggiungi in fondo [in uso] oppure [cliente]. Ctrl+Invio conferma, Esc annulla.',
  ed_sec_other:'Altro', ed_other_hint:'Non stampati sull\'etichetta (si possono attivare in Stampa › Campi).',
  f_contacts:'Persone / contatti coinvolti', f_contacts_ph:'es. Mario Rossi, dott.ssa Bianchi', f_contacts_s:'Contatti',
  f_notes:'Note', f_notes_ph:'es. Documento uscito il 12/03 per verifica', l_contacts:'Contatti', l_notes:'Note'
});
Object.assign(I18N.en, {
  ta_top:'Most used', ta_used:'Used {n} times', ta_register:'register', ta_hint:'↑ ↓ to choose · Enter to confirm · Esc to close',
  ed_quickloc:'Quick position', ed_quickloc_ph:'e.g. A1-β-SX · B2 3 · Ufficio 1 · 2-α', ed_loc_recent:'Recent', ed_loc_details:'Position details',
  ed_loc_none:'No position: type e.g. A1-α', ed_loc_used:'Used {n} times',
  lp_room:'Room', lp_cab:'Cabinet', lp_shelf:'Shelf', lp_sector:'Sector',
  ed_company_same:'Already in the archive as “{c}”.', ed_company_use:'Use this spelling', ed_company_norm:'Spelling aligned to the existing one: “{c}”.',
  e_dup_code2:'Code already in use: use {c}', ed_code_fix:'Use {c}',
  ed_reg_offer:'“{c}” is not in the client register', ed_reg_add:'Add to register', ed_reg_added:'Added to the client register: {c}',
  cis_archive:'In archive', cis_in_use:'In use', cis_client:'At client', cis_label:'Document status',
  cis_sum_in_use:'{n} in use', cis_sum_client:'{n} at client', l_ci_in_use:'in use', l_ci_client:'client',
  f_lines_hint2:'One item per line, e.g. "2025: Purchase invoices". For an item not in the archive add [in uso] (in use) or [cliente] (at client) at the end. Ctrl+Enter confirms, Esc cancels.',
  ed_sec_other:'Other', ed_other_hint:'Not printed on the label (can be enabled in Print › Fields).',
  f_contacts:'People / contacts involved', f_contacts_ph:'e.g. Mario Rossi, Ms Bianchi', f_contacts_s:'Contacts',
  f_notes:'Notes', f_notes_ph:'e.g. Document taken out on 12/03 for a check', l_contacts:'Contacts', l_notes:'Notes'
});

/* ---------------- text helpers ---------------- */
/** Accent- and case-insensitive form used for matching ("Città" → "citta"). */
function taFold(s){ return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
/** Identity of a company name apart from case, accents, spaces and punctuation ("Rossi S.r.l." = "ROSSI SRL"). */
function companyKey(s){ return taFold(s).replace(/[^a-z0-9Ͱ-Ͽ]+/g, ''); }
const taTokens = (v) => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
/** Clean a comma-separated list: trims, drops empty and duplicate (accent/case-insensitive) entries. */
function edTidyList(v, joiner){ const seen = new Set(); return taTokens(v).filter(x => { const k = taFold(x); if (seen.has(k)) return false; seen.add(k); return true; }).join(joiner || ', '); }

/* =====================================================================
   1) Typeahead component
   ===================================================================== */
const TA = { pop:null, cur:null, items:[], active:-1, q:'', browse:false, navigated:false };
function taEnsurePop(){
  if (TA.pop) return TA.pop;
  const el = document.createElement('div');
  el.id = 'ta-pop'; el.className = 'ta-pop'; el.setAttribute('role', 'listbox'); el.hidden = true;
  el.addEventListener('mousedown', (e) => e.preventDefault());          // keep the focus in the input
  el.addEventListener('click', (e) => { const o = e.target.closest('[data-ta-i]'); if (o) taPick(+o.dataset.taI, 'mouse'); });
  el.addEventListener('mousemove', (e) => { const o = e.target.closest('[data-ta-i]'); if (o && +o.dataset.taI !== TA.active){ TA.active = +o.dataset.taI; taMarkActive(); } });
  document.body.appendChild(el);
  TA.pop = el;
  // the popup follows its input when the page or a modal scrolls; it closes when the input disappears
  window.addEventListener('scroll', () => { if (TA.cur) taPlace(); }, true);
  window.addEventListener('resize', () => { if (TA.cur) taPlace(); });
  new MutationObserver(() => { if (TA.cur && !TA.cur.isConnected) taClose(); }).observe(document.body, {childList:true, subtree:true});
  return el;
}
function taAttach(input, opts){
  if (!input || input._ta) return;
  input._ta = Object.assign({multi:false, joiner:', ', top:4, max:8}, opts || {});
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', 'ta-pop'); input.setAttribute('autocomplete', 'off');
  // empty field: show the most used values at once; filled field: only when asked (click, ↓) or while typing
  input.addEventListener('focus', () => { if (!input.value.trim() || (input._ta.multi && /,\s*$/.test(input.value))) taOpen(input, {browse:true}); });
  input.addEventListener('click', () => { if (TA.cur !== input) taOpen(input, {browse:true}); });
  input.addEventListener('input', () => { if (document.activeElement === input) taOpen(input); });
  input.addEventListener('keydown', taKey);
  input.addEventListener('blur', () => { if (TA.cur === input) taClose(); });
}
/** The text the suggestions apply to: the whole value, or the comma-separated token under the caret. */
function taToken(input){
  const v = input.value;
  if (!input._ta.multi) return {q:v.trim(), start:0, end:v.length};
  const pos = input.selectionStart == null ? v.length : input.selectionStart;
  const start = v.lastIndexOf(',', pos - 1) + 1;
  let end = v.indexOf(',', pos); if (end < 0) end = v.length;
  return {q:v.slice(start, end).trim(), start, end};
}
function taRank(cands, q, o){
  const byUse = (a, b) => (b.count || 0) - (a.count || 0);
  const fq = taFold(q).trim();
  if (!fq) return cands.slice().sort(byUse).slice(0, o.top);     // stable: equal counts keep the source order
  const qk = companyKey(q), cq = fq.replace(/[^a-z0-9Ͱ-Ͽ]+/g, '');
  const out = [];
  cands.forEach((c, i) => {
    const f = taFold(c.match || c.value);
    let s = -1;
    if (c.key && qk && c.key === qk) s = 0;
    else if (f.startsWith(fq)) s = 1;
    else if (f.split(/[\s\-·.,/()'’]+/).some(w => w && w.startsWith(fq))) s = 2;
    else if (f.includes(fq)) s = 3;
    else if (cq.length > 1 && f.replace(/[^a-z0-9Ͱ-Ͽ]+/g, '').includes(cq)) s = 4;
    if (s >= 0) out.push({c, s, i});
  });
  out.sort((a, b) => a.s - b.s || byUse(a.c, b.c) || a.i - b.i);
  return out.slice(0, o.max).map(x => x.c);
}
function taOpen(input, how){
  const o = input._ta; if (!o) return;
  taEnsurePop();
  if (TA.cur && TA.cur !== input) taClose();
  how = how || {};
  if (how.browse) TA.browse = true; else if (TA.cur !== input || !how.keep) TA.browse = false;
  TA.cur = input;
  const tk = taToken(input);
  const q = (TA.browse && !o.multi) ? '' : tk.q;
  let cands = (o.source(q, input) || []).filter(c => c && String(c.value || '').trim());
  if (o.multi){
    const present = new Set(taTokens(input.value.slice(0, tk.start) + input.value.slice(tk.end)).map(taFold));
    cands = cands.filter(c => !present.has(taFold(c.value)));
  }
  TA.items = taRank(cands, q, o);
  TA.q = q; TA.navigated = false;
  TA.active = q && TA.items.length ? 0 : -1;
  if (!TA.items.length){ taHide(); return; }
  taRender();
  TA.pop.hidden = false; input.setAttribute('aria-expanded', 'true');
  taPlace();
}
function taHide(){
  if (TA.pop) TA.pop.hidden = true;
  if (TA.cur){ TA.cur.setAttribute('aria-expanded', 'false'); TA.cur.removeAttribute('aria-activedescendant'); }
}
function taClose(){ taHide(); TA.cur = null; TA.items = []; TA.active = -1; TA.browse = false; }
const taIsOpen = (input) => TA.cur === input && TA.pop && !TA.pop.hidden && TA.items.length > 0;
function taHL(label, q){
  const s = String(label), fq = taFold(q).trim();
  if (!fq) return esc(s);
  const f = taFold(s), i = f.indexOf(fq);
  if (i < 0 || f.length !== s.length) return esc(s);
  return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + fq.length)) + '</mark>' + esc(s.slice(i + fq.length));
}
function taRender(){
  const q = TA.q;
  TA.pop.innerHTML = (q ? '' : '<div class="ta-h">' + esc(t('ta_top')) + '</div>') +
    TA.items.map((c, i) => '<div class="ta-opt' + (i === TA.active ? ' on' : '') + '" role="option" id="ta-opt-' + i + '" data-ta-i="' + i + '" aria-selected="' + (i === TA.active) + '">' +
      '<div class="ta-main"><span class="ta-v' + (c.mono ? ' mono' : '') + '">' + taHL(c.label || c.value, q) + '</span>' + (c.meta ? '<span class="ta-m">' + taHL(c.meta, q) + '</span>' : '') + '</div>' +
      (c.count ? '<span class="ta-n" title="' + esc(t('ta_used', {n:c.count})) + '">×' + c.count + '</span>' : (c.tag ? '<span class="ta-tag">' + esc(c.tag) + '</span>' : '')) + '</div>').join('');
  taMarkActive();
}
function taMarkActive(){
  $$('.ta-opt', TA.pop).forEach((el, i) => { el.classList.toggle('on', i === TA.active); el.setAttribute('aria-selected', String(i === TA.active)); });
  if (!TA.cur) return;
  if (TA.active >= 0){ TA.cur.setAttribute('aria-activedescendant', 'ta-opt-' + TA.active); const el = $('#ta-opt-' + TA.active); if (el) el.scrollIntoView({block:'nearest'}); }
  else TA.cur.removeAttribute('aria-activedescendant');
}
function taPlace(){
  const inp = TA.cur, pop = TA.pop; if (!inp || !pop || pop.hidden) return;
  if (!inp.isConnected){ taClose(); return; }
  const r = inp.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
  if (r.bottom < 0 || r.top > vh){ pop.style.visibility = 'hidden'; return; }
  pop.style.visibility = '';
  const w = Math.min(Math.max(r.width, inp._ta.minWidth || 240), vw - 16);
  pop.style.width = w + 'px';
  pop.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + 'px';
  pop.style.maxHeight = '';
  const natural = Math.min(pop.scrollHeight, 300), below = vh - r.bottom - 10, above = r.top - 10;
  if (natural > below && above > below){ const h = Math.min(natural, above); pop.style.maxHeight = h + 'px'; pop.style.top = (r.top - 4 - h) + 'px'; }
  else { pop.style.maxHeight = Math.max(96, Math.min(300, below)) + 'px'; pop.style.top = (r.bottom + 4) + 'px'; }
}
function taKey(e){
  const inp = e.currentTarget, open = taIsOpen(inp), n = TA.items.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
    e.preventDefault();
    if (!open){ taOpen(inp, {browse:!inp._ta.multi}); if (taIsOpen(inp) && e.key === 'ArrowDown'){ TA.active = 0; TA.navigated = true; taMarkActive(); } return; }
    TA.active = e.key === 'ArrowDown' ? (TA.active + 1) % n : (TA.active <= 0 ? n - 1 : TA.active - 1);
    TA.navigated = true; taMarkActive();
  } else if (e.key === 'Enter'){
    if (open && TA.active >= 0){ e.preventDefault(); e.stopPropagation(); taPick(TA.active, 'enter'); }
    else if (open) taClose();
  } else if (e.key === 'Escape'){
    if (open){ e.preventDefault(); e.stopPropagation(); taClose(); }   // the first Esc closes the list, not the form
  } else if (e.key === 'Tab'){
    if (open && TA.active >= 0 && !e.shiftKey && (TA.navigated || TA.q)) taPick(TA.active, 'tab');
    else taClose();
  }
}
function taPick(i, how){
  const inp = TA.cur, it = TA.items[i]; if (!inp || !it) return;
  const o = inp._ta;
  if (o.multi){
    const tk = taToken(inp), v = inp.value;
    const before = taTokens(v.slice(0, tk.start)), after = taTokens(v.slice(tk.end));
    const sep = o.joiner || ', ';
    inp.value = before.concat([it.value], after).join(sep) + (after.length ? '' : sep);
    const end = inp.value.length; try { inp.setSelectionRange(end, end); } catch(err){}
  } else inp.value = it.value;
  inp.dispatchEvent(new Event('input', {bubbles:true}));
  if (o.onPick) o.onPick(it, inp);
  if (o.multi && how !== 'tab' && document.activeElement === inp) taOpen(inp);
  else taClose();
}

/* =====================================================================
   2) Binder editor
   ===================================================================== */
/** Count values (accent/case-insensitive); the first spelling met wins. */
function edCount(vals, extra){
  const m = new Map();
  vals.forEach(v => { v = String(v == null ? '' : v).trim(); if (!v) return; const k = taFold(v); const e = m.get(k); if (e) e.count++; else m.set(k, Object.assign({value:v, count:1}, extra ? extra(v) : null)); });
  return Array.from(m.values());
}
const edTokenCount = (field, skip) => edCount([].concat(...S.binders.map(b => taTokens(b[field]))).filter(x => !skip || !skip(x)));
/** Every known company: binders (usage count, Multi, place) merged with the client register by companyKey.
    The register spelling wins, otherwise the most used spelling in the archive. */
function edCompanies(){
  const m = new Map();
  const get = (name) => { const k = companyKey(name); if (!k) return null; let e = m.get(k); if (!e){ e = {key:k, count:0, spell:{}, multi:'', city:'', client:null}; m.set(k, e); } return e; };
  S.binders.forEach(b => { const n = String(b.company_name || '').trim(), e = n && get(n); if (!e) return; e.count++; e.spell[n] = (e.spell[n] || 0) + 1; if (!e.multi && b.multi_code) e.multi = b.multi_code; if (!e.city && b.company_city) e.city = b.company_city; });
  (S.clients || []).forEach(c => { const e = c.name && get(c.name); if (!e || e.client) return; e.client = c; if (c.multi_code) e.multi = c.multi_code; if (clientPlace(c)) e.city = e.city || clientPlace(c); });
  return Array.from(m.values()).map(e => {
    const value = e.client ? e.client.name : Object.keys(e.spell).sort((a, b) => e.spell[b] - e.spell[a])[0];
    return {value, key:e.key, count:e.count, client:e.client, multi:e.multi, city:e.city, match:value + ' ' + e.multi,
      meta:[e.multi ? 'Multi ' + e.multi : '', e.city].filter(Boolean).join(' · '), tag:e.count ? '' : t('ta_register')};
  });
}
function edFindCompany(name){ const k = companyKey(name); return k ? edCompanies().find(c => c.key === k) || null : null; }
/** Set one editor field (state + visible input). */
function edSet(k, v){ const d = UI.ed && UI.ed.d; if (!d) return; d[k] = v; const el = $('#ed-' + k); if (el && el.value !== v) el.value = v; }
/** Fill the empty fields from a known company: register entry first, then its latest binder. */
function edFillFromCompany(hit){
  const ed = UI.ed; if (!ed || !hit) return;
  const d = ed.d;
  if (hit.client) applyClientToEditor(hit.client);
  const same = S.binders.filter(b => b.id !== d.id && companyKey(b.company_name) === hit.key).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
  if (same){
    if (!d.multi_code && same.multi_code) edSet('multi_code', same.multi_code);
    if (!d.company_city && same.company_city) edSet('company_city', same.company_city);
    if (ed.isNew && !ed.catTouched && same.category && !hit.client){ edSet('category', same.category); d.color_hex = same.color_hex; const sw = $('#ed-swatches'); if (sw) sw.innerHTML = swatchesHTML(d.color_hex); }
  }
}
/** Company field typed (called by the form input handler). */
function edCompanyInput(el){
  const ed = UI.ed; if (!ed) return;
  const d = ed.d;
  d.company_name = el.value;
  if (ed.isNew && !ed.codeTouched){ d.speaking_code = el.value.trim() ? suggestSpeakingCode(el.value) : ''; const sc = $('#ed-speaking_code'); if (sc) sc.value = d.speaking_code; }
  const hit = edFindCompany(el.value);
  if (hit && ed.isNew) edFillFromCompany(hit);
  edCompanyNote(hit && hit.value !== el.value.trim() ? 'same' : '', hit);
}
function edCompanyNote(kind, hit){
  const n = $('#ed-company-note'); if (!n) return;
  if (kind === 'same') n.innerHTML = ic('info') + '<span>' + esc(t('ed_company_same', {c:hit.value})) + '</span><button type="button" class="ed-link" data-a="ed-company-use">' + esc(t('ed_company_use')) + '</button>';
  else if (kind === 'norm') n.innerHTML = ic('check') + '<span>' + esc(t('ed_company_norm', {c:hit.value})) + '</span>';
  else n.innerHTML = '';
  n.className = 'ed-note' + (kind ? ' on ' + kind : '');
}
/** Replace the typed company with the spelling already used in the archive / register. */
function edCompanyNormalize(){
  const inp = $('#ed-company_name'), hit = inp && edFindCompany(inp.value);
  if (!hit || hit.value === inp.value.trim()) return false;
  inp.value = hit.value; inp.dispatchEvent(new Event('input', {bubbles:true}));
  edCompanyNote('norm', hit);
  return true;
}
/** Next free number for a speaking-code prefix: BL2 taken → BL4 when BL1..BL3 exist. */
function edNextFreeCode(code, selfId){
  code = String(code || '').toUpperCase().replace(/\s+/g, '');
  const m = code.match(/^(.*?)(\d+)$/), pre = m ? m[1] : code;
  const taken = new Set(S.binders.filter(b => b.id !== selfId).map(b => String(b.speaking_code).toUpperCase()));
  let max = 0;
  taken.forEach(c => { if (c.startsWith(pre)){ const r = c.slice(pre.length); if (/^\d+$/.test(r)) max = Math.max(max, +r); } });
  let n = max + 1; while (taken.has(pre + n)) n++;
  return pre + n;
}
function edCodeFixHTML(code, selfId){ const c = edNextFreeCode(code, selfId); return '<button type="button" class="ed-fix" data-a="ed-code-fix" data-c="' + esc(c) + '">' + ic('sparkles') + esc(t('ed_code_fix', {c})) + '</button>'; }

/* ---------------- quick position ---------------- */
const GREEK_NAMES = {alfa:'α', alpha:'α', beta:'β', gamma:'γ', delta:'δ', epsilon:'ε', zeta:'ζ', eta:'η', theta:'θ', teta:'θ'};
/** Lenient position parser: "A1-β-SX", "a1 β sx", "B2 3", "A-1-beta", "A1β", "Ufficio 1 · 2-α", "Ufficio 1 2 α" (known room).
    Returns {room_code, cabinet_code, shelf_code, sector_code} or null for an empty string. */
function parseQuickLocation(str){
  const s = String(str || '').replace(/\s+/g, ' ').trim(); if (!s) return null;
  const strict = parseLocation(s);
  if (strict && strict.room_code && strict.cabinet_code && strict.shelf_code) return edLocTidy(strict);
  const o = {room_code:'', cabinet_code:'', shelf_code:'', sector_code:''};
  let rest = s;
  const dot = s.split(/\s*[·•|]\s*/);
  if (dot.length > 1){ o.room_code = dot[0]; rest = dot.slice(1).join(' '); }
  else {
    // a room name already used in the archive (longest first), typed without the "·"
    const f = taFold(s);
    const room = Array.from(new Set(S.binders.map(b => b.room_code).filter(r => r && r.length > 2))).sort((a, b) => b.length - a.length)
      .find(r => f.startsWith(taFold(r)) && /^(\s|-|$)/.test(s.slice(r.length)));
    if (room){ o.room_code = room; rest = s.slice(room.length); }
  }
  const tk = rest.split(/[\s\-–—\/,;]+/).filter(Boolean);
  if (!o.room_code && tk.length){
    const m = tk[0].match(/^([A-Za-z]{1,2})(\d{1,3})(\D.*)?$/);   // A1, B12, A1β
    if (m){ tk.shift(); o.room_code = m[1]; o.cabinet_code = m[2]; if (m[3]) tk.unshift(m[3]); }
    else o.room_code = tk.shift();
  }
  if (!o.cabinet_code && tk.length) o.cabinet_code = tk.shift();
  if (tk.length) o.shelf_code = tk.shift();
  if (tk.length) o.sector_code = tk.join('-');
  return edLocTidy(o);
}
function edLocTidy(o){
  o = Object.assign({room_code:'', cabinet_code:'', shelf_code:'', sector_code:''}, o);
  Object.keys(o).forEach(k => { o[k] = String(o[k] || '').trim(); });
  if (/^[a-z]{1,2}$/i.test(o.room_code)) o.room_code = o.room_code.toUpperCase();
  if (GREEK_NAMES[o.shelf_code.toLowerCase()]) o.shelf_code = GREEK_NAMES[o.shelf_code.toLowerCase()];
  if (/^(sx|cx|dx)$/i.test(o.sector_code)) o.sector_code = o.sector_code.toUpperCase();
  return o;
}
/** Positions to offer as one-click chips: the 2 most recently used, then the most used (max 4). */
function edLocChoices(){
  const m = new Map();
  S.binders.forEach(b => { const l = b.location_code; if (!l) return; const e = m.get(l) || {l, n:0, at:''}; e.n++; if (String(b.updated_at || '') > e.at) e.at = String(b.updated_at || ''); m.set(l, e); });
  const all = Array.from(m.values());
  const out = [];
  all.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 2).concat(all.slice().sort((a, b) => b.n - a.n || naturalCmp(a.l, b.l))).forEach(e => { if (out.length < 4 && !out.includes(e)) out.push(e); });
  return out;
}
function edLocationHTML(d){
  const f = (key, label, ph) => '<div class="field"><label for="ed-' + key + '">' + esc(label) + '</label><input class="inp mono" id="ed-' + key + '" data-ed="' + key + '" value="' + esc(d[key]) + '" placeholder="' + esc(ph) + '" autocomplete="off"></div>';
  const open = S.settings.edLocOpen ? ' open' : '';
  return '<div class="ed-loc" id="ed-locblock">' +
    '<div class="ed-loc-h"><label for="ed-quickloc" class="lbl">' + esc(t('ed_quickloc')) + '</label><span class="loc' + (computeLocation(d) ? '' : ' hidden') + '" id="ed-loc">' + esc(computeLocation(d) || '—') + '</span></div>' +
    '<div class="ed-ql">' + ic('pin') + '<input class="inp mono" id="ed-quickloc" value="' + esc(computeLocation(d)) + '" placeholder="' + esc(t('ed_quickloc_ph')) + '" autocomplete="off" spellcheck="false"></div>' +
    '<div class="ed-loc-parts" id="ed-loc-parts"></div>' +
    '<div class="ed-loc-chips" id="ed-loc-chips"></div>' +
    '<details class="ed-locdet" id="ed-locdet"' + open + '><summary>' + esc(t('ed_loc_details')) + '</summary><div class="grid g4">' +
      f('room_code', t('f_room'), 'A') + f('cabinet_code', t('f_cabinet'), '1') +
      '<div class="field"><label for="ed-shelf_code">' + esc(t('f_shelf')) + '</label><input class="inp mono" id="ed-shelf_code" data-ed="shelf_code" value="' + esc(d.shelf_code) + '" placeholder="' + esc((SHELF_TYPES[S.settings.shelfType || 'greek'] || [])[0] || t('st_text_ph')) + '"><div id="ed-shelf-tools">' + shelfToolsHTML(d) + '</div></div>' +
      '<div class="field"><label for="ed-sector_code">' + esc(t('f_sector')) + '</label><select class="inp mono" id="ed-sector_code" data-ed="sector_code">' + edSectorOptions(d.sector_code) + '</select></div>' +
    '</div></details></div>';
}
function edSectorOptions(cur){ const base = ['', 'SX', 'CX', 'DX']; return base.map(s => '<option' + (cur === s ? ' selected' : '') + '>' + s + '</option>').join('') + (base.includes(cur) ? '' : '<option selected>' + esc(cur) + '</option>'); }
/** Apply the quick position to the four location fields (live while typing). */
function edQuickLocApply(value){
  const ed = UI.ed; if (!ed) return;
  const p = parseQuickLocation(value) || {room_code:'', cabinet_code:'', shelf_code:'', sector_code:''};
  Object.keys(p).forEach(k => { ed.d[k] = p[k]; });
  ['room_code', 'cabinet_code', 'shelf_code'].forEach(k => { const el = $('#ed-' + k); if (el) el.value = ed.d[k]; });
  const sec = $('#ed-sector_code'); if (sec) sec.innerHTML = edSectorOptions(ed.d.sector_code);
  const st = $('#ed-shelf-tools'); if (st) st.innerHTML = shelfToolsHTML(ed.d);
  edRefreshDerived();
}
/** Keep the quick field, the breakdown and the chips in line with the detailed fields (called by edRefreshDerived). */
function edSyncLoc(){
  const ed = UI.ed; if (!ed) return;
  const d = ed.d, code = computeLocation(d);
  const q = $('#ed-quickloc'); if (q && document.activeElement !== q && q.value !== code) q.value = code;
  const pill = $('#ed-loc'); if (pill) pill.classList.toggle('hidden', !code);
  const parts = $('#ed-loc-parts');
  if (parts){
    const P = [['lp_room', d.room_code], ['lp_cab', d.cabinet_code], ['lp_shelf', d.shelf_code], ['lp_sector', d.sector_code]];
    parts.innerHTML = code ? P.map(([k, v]) => '<span class="ed-part' + (v ? '' : ' empty') + '"><span>' + esc(t(k)) + '</span><b>' + esc(v || '—') + '</b></span>').join('') : '<span class="hint">' + esc(t('ed_loc_none')) + '</span>';
  }
  const chips = $('#ed-loc-chips');
  if (chips){
    const C = edLocChoices();
    chips.innerHTML = C.length ? '<span class="tiny muted">' + esc(t('ed_loc_recent')) + '</span>' + C.map(e => '<button type="button" class="ed-chip' + (e.l === code ? ' on' : '') + '" data-a="ed-loc-chip" data-l="' + esc(e.l) + '" title="' + esc(t('ed_loc_used', {n:e.n})) + '">' + esc(e.l) + '</button>').join('') : '';
  }
}

/* ---------------- contents (Modulo B) ---------------- */
const ciStatus = (it) => CI_STATUSES.includes(it && it.status) ? it.status : 'archive';
function edRenderContents(){
  const ed = UI.ed, box = $('#ed-contents'); if (!ed || !box) return;
  const btn = $('#ed-lines-btn'); if (btn) btn.classList.toggle('hidden', !!ed.pipeMode);
  if (ed.pipeMode){
    box.innerHTML = '<div class="ed-lines"><textarea class="inp mono small" id="ed-lines" rows="7" spellcheck="false" placeholder="Archivio 1&#10;2025: Fatture acquisto&#10;2025: Liquidazioni IVA [in uso]">' + esc(ed.linesDraft || '') + '</textarea>' +
      '<div class="hint">' + esc(t('f_lines_hint2')) + '</div>' +
      '<div class="row ed-lines-act"><button type="button" class="btn btn-sm btn-primary" data-a="ed-lines-ok">' + ic('check') + esc(t('confirm')) + '</button><button type="button" class="btn btn-sm" data-a="ed-lines-cancel">' + esc(t('cancel')) + '</button></div></div>';
    edCiSummary();
    return;
  }
  box.innerHTML = ed.d.contents_items.map((it, i) => { const st = ciStatus(it); return '<div class="ci-row st-' + st + '"><input class="inp mono" placeholder="' + esc(t('f_year')) + '" data-ci="year" data-i="' + i + '" value="' + esc(it.year) + '"><input class="inp" placeholder="' + esc(t('f_desc')) + '" data-ci="description" data-i="' + i + '" value="' + esc(it.description) + '">' +
    '<select class="inp ci-st" data-cist data-i="' + i + '" aria-label="' + esc(t('cis_label')) + '" title="' + esc(t('cis_label')) + '">' + CI_STATUSES.map(s => '<option value="' + s + '"' + (s === st ? ' selected' : '') + '>' + esc(t('cis_' + s)) + '</option>').join('') + '</select>' +
    '<button type="button" class="icon-btn danger" data-a="ed-ci-del" data-i="' + i + '" aria-label="' + esc(t('delete')) + '">' + ic('x') + '</button></div>'; }).join('') +
    '<button type="button" class="btn btn-sm" data-a="ed-ci-add">' + ic('plus') + esc(t('f_add_item')) + '</button>';
  $$('[data-ci="description"]', box).forEach(inp => taAttach(inp, {source:edDescSource, minWidth:300}));
  edCiSummary();
}
function ciCounts(items){ const c = {in_use:0, client:0}; (items || []).forEach(it => { const s = ciStatus(it); if (c[s] !== undefined) c[s]++; }); return c; }
function ciChips(items){ const c = ciCounts(items); return ['in_use', 'client'].filter(k => c[k]).map(k => '<span class="ci-chip st-' + k + '">' + esc(t('cis_sum_' + k, {n:c[k]})) + '</span>').join(''); }
function edCiSummary(){ const el = $('#ed-ci-sum'); if (el && UI.ed) el.innerHTML = ciChips(UI.ed.d.contents_items); }
/** Archive list: small "2 al cliente · 1 in uso" line under the contents. */
function ciSummaryHTML(b){ const h = ciChips(b.contents_items); return h ? '<div class="ci-sum">' + h + '</div>' : ''; }
/** Search words for the archive filter (e.g. "cliente" finds binders with documents at the client). */
function ciSearchWords(b){ const c = ciCounts(b.contents_items); return (c.in_use ? t('cis_in_use') + ' ' + CI_SUFFIX.in_use + ' ' : '') + (c.client ? t('cis_client') + ' ' + CI_SUFFIX.client : ''); }
function edLinesOpen(){ const ed = UI.ed; if (!ed) return; ed.linesDraft = contentsToLines(ed.d.contents_items); ed.pipeMode = true; renderEdContents(); const ta = $('#ed-lines'); if (ta){ ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }
/** "Conferma": lines → rows. Status comes from the [in uso] / [cliente] suffix shown in the text, so unchanged lines keep theirs. */
function edLinesApply(){
  const ed = UI.ed; if (!ed || !ed.pipeMode) return;
  const ta = $('#ed-lines'), txt = ta ? ta.value : (ed.linesDraft || '');
  ed.d.contents_items = String(txt).split('\n').map(l => l.trim()).filter(Boolean).map(l => pipeToContents(l.replace(/\|/g, '/'))[0]).filter(Boolean);
  ed.pipeMode = false; ed.linesDraft = '';
  renderEdContents(); edRefreshDerived();
}
function edLinesCancel(){ const ed = UI.ed; if (!ed) return; ed.pipeMode = false; ed.linesDraft = ''; renderEdContents(); }

/* ---------------- "Altro" section ---------------- */
function edOtherHTML(d){
  return '<div class="ed-other"><div class="ed-sec-h"><span class="lbl">' + esc(t('ed_sec_other')) + '</span><span class="hint">' + esc(t('ed_other_hint')) + '</span></div>' +
    '<div class="grid g2"><div class="field"><label for="ed-contacts">' + esc(t('f_contacts')) + '</label><input class="inp" id="ed-contacts" data-ed="contacts" value="' + esc(d.contacts || '') + '" placeholder="' + esc(t('f_contacts_ph')) + '" autocomplete="off"></div>' +
    '<div class="field"><label for="ed-notes">' + esc(t('f_notes')) + '</label><textarea class="inp" id="ed-notes" data-ed="notes" rows="2" placeholder="' + esc(t('f_notes_ph')) + '">' + esc(d.notes || '') + '</textarea></div></div></div>';
}

/* ---------------- suggestion sources ---------------- */
function edDescSource(){ const def = new RegExp('^' + String(t('arch_n', {n:'X'})).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('X', '\\d+') + '$', 'i'); return edCount([].concat(...S.binders.map(b => b.contents_items.map(i => i.description)))).filter(c => !def.test(c.value)); }
const ED_SOURCES = {
  company_name: () => edCompanies(),
  multi_code: () => {
    const m = new Map();
    const add = (code, company, n) => { code = String(code || '').trim(); if (!code) return; const k = taFold(code); const e = m.get(k) || {value:code, count:0, company:'', mono:true}; e.count += n; if (!e.company && company) e.company = company; m.set(k, e); };
    S.binders.forEach(b => add(b.multi_code, b.company_name, 1));
    (S.clients || []).forEach(c => add(c.multi_code, c.name, 0));
    return Array.from(m.values()).map(e => Object.assign(e, {meta:e.company, match:e.value + ' ' + e.company, tag:e.count ? '' : t('ta_register')}));
  },
  company_city: () => { const l = edCount(S.binders.map(b => b.company_city)); const known = new Set(l.map(c => taFold(c.value))); (S.clients || []).map(clientPlace).forEach(p => { if (p && !known.has(taFold(p))){ known.add(taFold(p)); l.push({value:p, count:0}); } }); return l; },
  category: () => { const l = edCount(S.binders.map(b => b.category)); const known = new Set(l.map(c => taFold(c.value))); CATEGORIES.concat((S.clients || []).map(c => c.category)).forEach(c => { if (c && !known.has(taFold(c))){ known.add(taFold(c)); l.push({value:c, count:0}); } }); return l; },
  ref_year: () => { const l = edCount(S.binders.map(b => b.ref_year)).map(c => Object.assign(c, {mono:true})); const y = new Date().getFullYear(); [y, y - 1].forEach(v => { if (!l.some(c => c.value === String(v))) l.push({value:String(v), count:0, mono:true}); }); return l; },
  extra_codes: () => edTokenCount('extra_codes'),
  tags: () => edTokenCount('tags', (x) => x.toLowerCase() === DEMO_TAG),
  contacts: () => edTokenCount('contacts'),
  room_code: () => edCount(S.binders.map(b => b.room_code)).map(c => Object.assign(c, {mono:true})),
  cabinet_code: () => { const room = UI.ed && UI.ed.d.room_code; const list = S.binders.filter(b => !room || b.room_code === room); return edCount((list.length ? list : S.binders).map(b => b.cabinet_code)).map(c => Object.assign(c, {mono:true})); },
  quickloc: () => edCount(S.binders.map(b => b.location_code)).map(c => Object.assign(c, {mono:true}))
};

/** Wire the open editor: typeaheads, quick position, company spelling guard (called from openEditor onMount). */
function edEnhance(){
  if (!UI.ed) return;
  const att = (k, o) => taAttach($('#ed-' + k), Object.assign({source:ED_SOURCES[k]}, o || {}));
  att('company_name', {minWidth:320, onPick:(it) => { const hit = edFindCompany(it.value); if (hit) edFillFromCompany(hit); edCompanyNote('', null); }});
  att('multi_code', {minWidth:280, onPick:(it) => {
    const d = UI.ed.d, ci = $('#ed-company_name');
    if (it.company && !String(d.company_name || '').trim() && ci){ ci.value = it.company; ci.dispatchEvent(new Event('input', {bubbles:true})); edFillFromCompany(edFindCompany(it.company)); }
  }});
  att('company_city'); att('category', {top:8}); att('ref_year');
  att('extra_codes', {multi:true}); att('tags', {multi:true, joiner:','}); att('contacts', {multi:true});
  att('room_code', {minWidth:160}); att('cabinet_code', {minWidth:160});
  att('quickloc', {top:6, minWidth:260});
  const q = $('#ed-quickloc');
  if (q){
    q.addEventListener('input', () => edQuickLocApply(q.value));
    q.addEventListener('blur', () => { if (UI.ed) q.value = computeLocation(UI.ed.d); });
  }
  const ci = $('#ed-company_name');
  if (ci) ci.addEventListener('blur', () => { if (UI.ed) edCompanyNormalize(); });
  const mc = $('#ed-multi_code');
  if (mc) mc.addEventListener('blur', () => {   // a known Multi code typed in full fills an empty client
    const d = UI.ed && UI.ed.d; if (!d || String(d.company_name || '').trim() || !mc.value.trim()) return;
    const it = ED_SOURCES.multi_code().find(c => taFold(c.value) === taFold(mc.value.trim()));
    if (it && it.company && ci){ ci.value = it.company; ci.dispatchEvent(new Event('input', {bubbles:true})); edFillFromCompany(edFindCompany(it.company)); }
  });
  edSyncLoc();
}
/** Before validation on save: apply pending line-mode text, tidy comma lists, use the existing company spelling. */
function edBeforeSave(ed){
  if (ed.pipeMode) edLinesApply();
  const d = ed.d;
  d.tags = edTidyList(d.tags, ','); d.extra_codes = edTidyList(d.extra_codes, ', '); d.contacts = edTidyList(d.contacts, ', ');
  const hit = edFindCompany(d.company_name);
  if (hit && hit.value !== String(d.company_name).trim()) edSet('company_name', hit.value);
  taClose();
}
/** "Saved" toast; for a company missing from the client register it offers (once per company) to add it. */
function edSavedToast(b, ed){
  taClose();
  const key = companyKey(b.company_name);
  const inReg = (S.clients || []).some(c => companyKey(c.name) === key);
  let before = {}; try { before = JSON.parse(ed.base); } catch(e){}
  UI.regSkip = UI.regSkip || new Set();
  if (key && !inReg && (ed.isNew || companyKey(before.company_name) !== key) && !UI.regSkip.has(key)){
    UI.regSkip.add(key);
    toast(t('saved') + ': ' + b.speaking_code + ' · ' + t('ed_reg_offer', {c:b.company_name}), 'ok', 9000, {label:t('ed_reg_add'), fn:() => edAddToRegister(b)});
    return;
  }
  toast(t('saved') + ': ' + b.speaking_code);
}
function edAddToRegister(b){
  S.clients = S.clients || [];
  if (S.clients.some(c => companyKey(c.name) === companyKey(b.company_name))) return;
  const m = String(b.company_city || '').match(/^(.*?)\s*\(([A-Za-z]{2})\)\s*$/);
  S.clients.push(normalizeClient({name:b.company_name, multi_code:b.multi_code, city:m ? m[1] : b.company_city, province:m ? m[2].toUpperCase() : '', category:b.category}));
  commit(); toast(t('ed_reg_added', {c:b.company_name}));
  if (S.view === 'clients') renderView();
}

const EDITOR_ACTIONS = {
  'ed-lines': () => edLinesOpen(),
  'ed-lines-ok': () => edLinesApply(),
  'ed-lines-cancel': () => edLinesCancel(),
  'ed-code-fix': (el) => { const ed = UI.ed; if (!ed) return; ed.codeTouched = true; edSet('speaking_code', el.dataset.c); edRefreshDerived(); const i = $('#ed-speaking_code'); if (i) i.focus(); },
  'ed-loc-chip': (el) => { const q = $('#ed-quickloc'); if (q) q.value = el.dataset.l; edQuickLocApply(el.dataset.l); },
  'ed-company-use': () => { edCompanyNormalize(); }
};
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.hasAttribute && el.hasAttribute('data-cist') && UI.ed){
    const it = UI.ed.d.contents_items[+el.dataset.i]; if (!it) return;
    it.status = normCiStatus(el.value);
    const row = el.closest('.ci-row'); if (row) row.className = 'ci-row st-' + it.status;
    edCiSummary(); edRefreshDerived();
  }
});
document.addEventListener('input', (e) => { if (e.target.id === 'ed-lines' && UI.ed) UI.ed.linesDraft = e.target.value; });
document.addEventListener('keydown', (e) => {
  if (e.target.id !== 'ed-lines' || !UI.ed) return;
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); edLinesApply(); }
  else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); edLinesCancel(); }
}, true);
document.addEventListener('toggle', (e) => { if (e.target && e.target.id === 'ed-locdet'){ S.settings.edLocOpen = e.target.open; savePrefs(); } }, true);
