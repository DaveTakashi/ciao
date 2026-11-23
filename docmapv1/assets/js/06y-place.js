/* =====================================================================
   DocMap 2026 — v12.11 «Dove lo metto?» (index.html, after 06v-reminders.js). Roadmap K8.
   Where should a new (or moved) binder go? DocMap looks at where the binders that belong with it already are:

   - same series (same client, category and title, another year) → right next to it (strongest),
   - same client → where that client's binders are,
   - same category and year → with the binders of the same kind and year,
   - same category → with that category.
   Each place gets the best score of its binders plus a little for how many there are. With a capacity set
   (S.settings.place.cap = binders per place, 0 = no limit, Impostazioni › Dove lo metto?) a full place in the
   location tree is replaced by the nearest sibling with room («ripiano accanto, con spazio»); a full place
   written with room / cabinet / shelf codes is kept but marked full.
   Pure part: plSuggest(d, {exclude, extra}) → [{key, kind:'tree'|'codes', loc, label, path, reason, score, count, full}].
   UI: «Dove lo metto?» in the binder form (under the location), used by «Nuovo anno» (06w-newyear.js) for every
   new binder, and plApply(binder, suggestion) to put it there.
   ===================================================================== */
'use strict';

const PL_DEF = {cap:0};
Object.assign(I18N.it, {
  pl_btn:'Dove lo metto?', pl_h:'Dove lo metto?', pl_none:'Nessun suggerimento: scrivi il cliente e la categoria, oppure colloca prima qualche faldone dello stesso cliente.',
  pl_put:'Metti qui', pl_put_ok:'Posizione impostata: {l}', pl_full:'pieno', pl_n:'{n} faldoni qui',
  pl_r_series:'Accanto a {c} ({t}), lo stesso faldone di un altro anno', pl_r_client:'Dove ci sono già {n} faldoni di {w}', pl_r_client1:'Dove c\'è già un faldone di {w}',
  pl_r_catyear:'Con i faldoni «{k}» del {y}', pl_r_cat:'Con gli altri faldoni «{k}»', pl_r_next:'Accanto a {l}, che è pieno: qui c\'è spazio',
  pl_set_h:'Dove lo metto?', pl_set_p:'Quanti faldoni ci stanno in un posto (ripiano o ubicazione)? Serve per non suggerire un posto pieno. 0 = non lo so.', pl_set_cap:'Faldoni per posto',
  pl_why:'Perché: '
});
Object.assign(I18N.en, {
  pl_btn:'Where do I put it?', pl_h:'Where do I put it?', pl_none:'No suggestion: type the client and the category, or place a few binders of the same client first.',
  pl_put:'Put it here', pl_put_ok:'Location set: {l}', pl_full:'full', pl_n:'{n} binders here',
  pl_r_series:'Next to {c} ({t}), the same binder for another year', pl_r_client:'Where {n} binders of {w} already are', pl_r_client1:'Where a binder of {w} already is',
  pl_r_catyear:'With the «{k}» binders of {y}', pl_r_cat:'With the other «{k}» binders', pl_r_next:'Next to {l}, which is full: there is room here',
  pl_set_h:'Where do I put it?', pl_set_p:'How many binders fit in one place (shelf or location)? Used to avoid suggesting a full place. 0 = unknown.', pl_set_cap:'Binders per place',
  pl_why:'Why: '
});

function plSet(){ const s = Object.assign({}, PL_DEF, (S.settings && S.settings.place) || {}); s.cap = Math.max(0, Math.min(10000, Math.round(+s.cap || 0))); return s; }
const plCodes = (b) => [b.room_code, b.cabinet_code, b.shelf_code, b.sector_code].map(x => String(x || '').trim());
/** Place of a binder: the tree location when it has one, else its room / cabinet / shelf / sector codes. '' = nowhere. */
function plKey(b){
  if (b.location_id && (typeof locById !== 'function' || locById(b.location_id))) return 'L:' + b.location_id;
  const c = plCodes(b); return c.some(Boolean) ? 'C:' + c.join('|') : '';
}
function plLabel(key){
  if (key.startsWith('L:')){ const id = key.slice(2), l = typeof locById === 'function' ? locById(id) : null; return {label:l ? l.code : id, path:l && typeof locPathText === 'function' ? locPathText(id) : ''}; }
  const [room_code, cabinet_code, shelf_code, sector_code] = key.slice(2).split('|');
  return {label:computeLocation({room_code, cabinet_code, shelf_code, sector_code}) || '—', path:''};
}
function plLocOf(key){
  if (key.startsWith('L:')) return {location_id:key.slice(2)};
  const [room_code, cabinet_code, shelf_code, sector_code] = key.slice(2).split('|');
  return {location_id:'', room_code, cabinet_code, shelf_code, sector_code};
}
/** Binders per place (live binders + `extra`, e.g. the ones «Nuovo anno» is about to create). */
function plCounts(extra){
  const m = new Map();
  yrLive().concat(extra || []).forEach(b => { const k = plKey(b); if (k) m.set(k, (m.get(k) || 0) + 1); });
  return m;
}
/**
 * Suggested places for binder `d` (best first, at most `max`, default 3).
 * o.exclude: ids not to learn from (the binder itself is always excluded); o.extra: binders not saved yet (they
 * count for fullness and as neighbours).
 */
function plSuggest(d, o){
  o = o || {};
  const max = o.max || 3, set = plSet(), ex = new Set([d.id].concat(o.exclude || []));
  const ck = yrClientKey(d), cat = yrFold(d.category).trim(), sk = yrSeriesKey(d), y = yrMax(d), arch = typeof binderArchiveId === 'function' ? binderArchiveId(d) : '';
  if (!ck && !cat) return [];
  const pool = yrLive().concat(o.extra || []).filter(b => !ex.has(b.id));
  const counts = plCounts(o.extra);
  const P = new Map();   // key → {score, reason, why, n}
  const clientN = new Map();
  pool.forEach(b => { if (ck && yrClientKey(b) === ck){ const k = plKey(b); if (k) clientN.set(k, (clientN.get(k) || 0) + 1); } });
  pool.forEach(b => {
    const k = plKey(b); if (!k) return;
    if (arch && typeof binderArchiveId === 'function' && binderArchiveId(b) !== arch) return;   // never suggest another archive
    const by = yrMax(b), gap = y && by ? Math.abs(by - y) : 5;
    let s = 0, why = null;
    if (sk && yrSeriesKey(b) === sk){ s = 100 - Math.min(gap, 10) * 3; why = ['series', {c:b.speaking_code, t:(b.binder_title || '') + (by && String(b.binder_title || '').indexOf(String(by)) < 0 ? ' ' + by : '')}]; }
    else if (ck && yrClientKey(b) === ck){ const n = clientN.get(k) || 1; s = 70 - Math.min(gap, 10); why = [n > 1 ? 'client' : 'client1', {n, w:b.company_name || b.multi_code}]; }
    else if (cat && yrFold(b.category).trim() === cat){ if (y && by === y){ s = 45; why = ['catyear', {k:b.category, y}]; } else { s = 30 - Math.min(gap, 10); why = ['cat', {k:b.category}]; } }
    if (!s) return;
    const cur = P.get(k) || {score:0, why:null, n:0};
    cur.n++;
    if (s > cur.score){ cur.score = s; cur.why = why; }
    P.set(k, cur);
  });
  let L = Array.from(P.entries()).map(([key, v]) => ({key, score:v.score + Math.min(v.n, 10), why:v.why, count:counts.get(key) || 0}));
  // capacity: a full tree place gives its score to the nearest sibling with room
  if (set.cap > 0){
    const out = [];
    L.forEach(x => {
      x.full = x.count >= set.cap;
      if (!x.full){ out.push(x); return; }
      const alt = x.key.startsWith('L:') ? plSiblingWithRoom(x.key.slice(2), counts, set.cap) : null;
      if (alt){ const lb = plLabel(x.key).label; out.push({key:'L:' + alt, score:x.score - 1, why:['next', {l:lb}], count:counts.get('L:' + alt) || 0, full:false}); }
      out.push(Object.assign({}, x, {score:x.score - 60}));
    });
    const best = new Map(); out.forEach(x => { const c = best.get(x.key); if (!c || x.score > c.score) best.set(x.key, x); });
    L = Array.from(best.values());
  }
  L.sort((a, b) => b.score - a.score || b.count - a.count || naturalCmp(a.key, b.key));
  return L.slice(0, max).map(x => {
    const lb = plLabel(x.key);
    return {key:x.key, kind:x.key.startsWith('L:') ? 'tree' : 'codes', loc:plLocOf(x.key), label:lb.label, path:lb.path, reason:x.why ? t('pl_r_' + x.why[0], x.why[1]) : '', score:x.score, count:x.count, full:!!x.full};
  });
}
/** Nearest sibling (same parent, same level) with fewer than `cap` binders: the next ones first, then the previous. */
function plSiblingWithRoom(id, counts, cap){
  if (typeof locById !== 'function') return '';
  const l = locById(id); if (!l) return '';
  const sib = locChildren(l.parent_id || '').slice().sort(locSegCmp);
  const i = sib.findIndex(x => x.id === id); if (i < 0) return '';
  const order = sib.slice(i + 1).concat(sib.slice(0, i).reverse());
  const hit = order.find(x => (counts.get('L:' + x.id) || 0) < cap && !locChildren(x.id).length);
  return hit ? hit.id : '';
}
/** Put binder `b` (a plain object: editor draft or a binder about to be created) at suggestion `s`. */
function plApply(b, s){
  if (!b || !s) return b;
  if (s.kind === 'tree'){ b.location_id = s.loc.location_id; }
  else { b.location_id = ''; ['room_code', 'cabinet_code', 'shelf_code', 'sector_code'].forEach(k => { b[k] = s.loc[k] || ''; }); }
  b.location_code = binderLocCode(b);
  return b;
}

/* ---------------- binder form ---------------- */
const PLV = {list:null};
function plEdHTML(){ return '<div class="pl-ed" id="pl-ed"><button type="button" class="btn btn-sm" data-a="pl-ed" id="pl-ed-btn">' + ic('pin') + esc(t('pl_btn')) + '</button><div id="pl-ed-list" aria-live="polite"></div></div>'; }
function plListHTML(L){
  if (!L.length) return '<p class="hint pl-none">' + esc(t('pl_none')) + '</p>';
  return '<ol class="pl-list">' + L.map((s, i) => '<li class="pl-it' + (s.full ? ' pl-full' : '') + '"><div class="pl-tx"><b class="mono">' + esc(s.label) + '</b>' + (s.path && s.path !== s.label ? ' <span class="muted small">' + esc(s.path) + '</span>' : '') +
    (s.full ? ' <span class="pl-tag">' + esc(t('pl_full')) + '</span>' : '') + '<small>' + esc(s.reason) + (s.count ? ' · ' + esc(t('pl_n', {n:s.count})) : '') + '</small></div>' +
    '<button type="button" class="btn btn-sm' + (i === 0 ? ' btn-primary' : '') + '" data-a="pl-put" data-i="' + i + '">' + esc(t('pl_put')) + '</button></li>').join('') + '</ol>';
}
const PL_ACTIONS = {
  'pl-ed': () => {
    if (!UI.ed) return;
    PLV.list = plSuggest(UI.ed.d);
    const box = $('#pl-ed-list'); if (box) box.innerHTML = plListHTML(PLV.list);
  },
  'pl-put': (el) => {
    const s = PLV.list && PLV.list[+el.dataset.i]; if (!s || !UI.ed) return;
    const d = UI.ed.d;
    if (s.kind === 'tree' && typeof locEditorSet === 'function'){
      locEditorSet(s.loc.location_id);
      const i = $('#ed-locpick'); if (i){ const l = locById(s.loc.location_id); i.value = l ? l.code : ''; }
    } else {
      plApply(d, s);
      ['room_code', 'cabinet_code', 'shelf_code', 'sector_code'].forEach(k => { const i = $('#ed-' + k); if (i) i.value = d[k]; });
      if (typeof locEditorSet === 'function') locEditorSet('');
    }
    if (typeof edRefreshDerived === 'function') edRefreshDerived();
    toast(t('pl_put_ok', {l:s.label}), 'ok');
    const box = $('#pl-ed-list'); if (box) box.innerHTML = '';
    PLV.list = null;
  },
};
if (typeof ACTIONS === 'object') Object.assign(ACTIONS, PL_ACTIONS);
else document.addEventListener('DOMContentLoaded', () => { if (typeof ACTIONS === 'object') Object.assign(ACTIONS, PL_ACTIONS); });
document.addEventListener('change', (e) => {
  const el = e.target; if (!el || !el.dataset || !el.dataset.plSet) return;
  S.settings.place = Object.assign({}, plSet(), {[el.dataset.plSet]:Math.max(0, Math.round(+el.value || 0))}); commit({dirty:false});
});
function plSettingsHTML(){
  return '<div class="card card-p" id="pl-settings"><h3>' + ic('pin') + esc(t('pl_set_h')) + helpDot('place') + '</h3><p class="small muted">' + esc(t('pl_set_p')) + '</p>' +
    '<div class="field" style="max-width:260px"><label for="pl-cap">' + esc(t('pl_set_cap')) + '</label><input class="inp" type="number" min="0" max="10000" id="pl-cap" data-pl-set="cap" value="' + plSet().cap + '"></div></div>';
}

(function plWrap(){
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  wrap('edLocationHTML', (o) => function(){ return o.apply(this, arguments) + plEdHTML(); });
  wrap('openEditor', (o) => function(){ PLV.list = null; return o.apply(this, arguments); });
  wrap('viewSettings', (o) => function(){ return o.apply(this, arguments) + plSettingsHTML(); });
})();
document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'place')) return;
  HELP_TOPICS.push({ id:'place', guide:null, tags:['archive'], pop:46, related:['locations', 'newyear'],
    kw:{it:'dove lo metto posizione suggerita collocare sistemare scaffale ripiano accanto vicino spazio pieno capienza', en:'where put place suggestion locate shelf next to room full capacity'},
    title:{it:'Come so dove mettere un faldone nuovo («Dove lo metto?»)?', en:'How do I know where to put a new binder («Where do I put it?»)?'},
    body:{it:'<p>Nella scheda del faldone, sotto la posizione, premi <b>Dove lo metto?</b>. DocMap guarda dove sono già i faldoni che vanno con lui e ti propone fino a 3 posti, ognuno con il motivo:</p><ul>' +
      '<li><b>accanto allo stesso faldone di un altro anno</b> (stesso cliente, categoria e titolo: ad es. «Fatture 2025» per «Fatture 2026»);</li><li>dove sono gli <b>altri faldoni dello stesso cliente</b>;</li><li>con i faldoni della <b>stessa categoria e dello stesso anno</b>, poi della stessa categoria.</li></ul>' +
      '<p><b>Metti qui</b> imposta la posizione (ubicazione dell\'albero o stanza / armadio / ripiano / settore). Non sposta niente da solo: salva la scheda come sempre.</p>' +
      '<p>Se in <b>Impostazioni › Dove lo metto?</b> scrivi quanti faldoni ci stanno in un posto, un posto pieno non viene più proposto per primo: al suo posto DocMap propone l\'ubicazione accanto (stesso armadio) che ha ancora spazio. <b>Nuovo anno in un clic</b> usa lo stesso calcolo per ogni faldone nuovo.</p>',
      en:'<p>In the binder form, under the location, press <b>Where do I put it?</b>: up to 3 places, each with the reason (next to the same binder of another year, where the client\'s other binders are, with the same category and year). <b>Put it here</b> sets the location. With a capacity in Settings, a full place is replaced by the sibling location with room.</p>'}
  });
});
