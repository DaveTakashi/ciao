/* =====================================================================
   DocMap 2026 — v12 (stream A): search engine, shared by the desktop archive (11d-search.js) and the phone (scan.html)

   PURE: no DOM, never writes S. Needs 02-core.js (t, STATES, DEMO_TAG, CI_STATUSES, locHead, esc) at call time and,
   when present, 02c-locations.js (assocParseCode, locById, locPath, locTitle, locBinderIn). Everything optional is
   feature-detected with typeof, so the same file runs on index.html and on scan.html.

   ---- Query language: srchParse(q) ----
     free words            every word must match somewhere (AND), accent-insensitive ("citta" = "città"), case-insensitive
     "two words"           a phrase
     -word                 exclude binders containing the word
     key:value             operator; -key:value excludes. Keys (IT / EN aliases, SRCH_OPS):
                           tag:  anno: (2024 · 2020..2024 · 2020-2024 · >2022 · <2020)  cat:  luogo:  stato:  cliente:
                           citta:  multi:  codice:  colore: (#hex or a colour name: rosso, blu, verde …)  archivio:
                           note:  contenuto:     value in quotes for spaces: cliente:"rossi mario"
     a short code / QR URL (dm26…, https://qr7.it/dm26…, …/q/dm26…) → that binder only (a location code dm26L… →
                           the binders inside it, desktop only)
     An unknown key ("a:b") is just text.

   ---- Ranking: srchRun(binders, q, opts) ----
     For every free word the best field counts: exact field value ×10, start of a word ×6, inside a word ×2, times the
     field weight (SRCH_FIELDS: code 10, Multi 9, short code 8, company 7, tags 5, category / title / year / location /
     extra codes 4, city / contents 3, notes / contacts / other words 1). Typos: a word (letters only, ≥ 4) with NO direct
     hit in the whole set is replaced by the closest words of the archive (Damerau-Levenshtein ≤ 1, ≤ 2 from 7 letters),
     reported in result.fuzzy ("Forse cercavi"). Whole query = speaking code / Codice Multi → that binder first.
     Ties keep the input order (the caller passes the list already sorted, e.g. by speaking code).

   ---- Facets (counts) ----
     opts.facets = {tag:[k…], cat:[k…], year:[k…], loc:[k…], color:[k…], archive:[k…], state:[k…], status:[k…]}: OR inside a
     group, AND between groups. result.facets[group] = [{k, label, n, on}] — n counts the binders that match the query and
     every OTHER group (classic faceted search), so the numbers say what a click would give.

   ---- Hooks for other modules (contract; all optional, feature-detected) ----
     statusSearchHook (stream Q, status / check-out engine) — a global object:
       match(binder, value)  → true | false | null      'stato:<value>' (value folded); null = not mine, built-in rules apply
       statusOf(binder)      → {id, label, cls?} | null  badge on the result cards + facet "status"
       words(binder)         → string                    extra searchable text (e.g. "fuori archivio Mario 12/11")
       values()              → [{id, label}]             optional: order / labels of the "status" facet
       chips()               → [{q, label}]              optional: quick chips on the phone search screen
     archiveSearchHook (stream C, archives / clusters) — same shape:
       match(binder, value) for 'archivio:<value>' · archiveOf(binder) → {id, label} | null (facet "archive") · words(binder)
     Extra operators: Object.assign(SRCH_OPS, {myop:{keys:['chi', 'who'], test(doc, v){ … return bool; }}}).
       doc = {b (the binder), f (folded fields), tags, years, …} — see srchDoc().

   Public: srchFold, srchParse, srchRun, srchDoc, srchMark (highlight HTML), srchDL (distance), SRCH_FIELDS, SRCH_OPS,
           srchFacetLabel, srchStateOf, SRCH (cache + timing of the last run: SRCH.lastMs).
   ===================================================================== */
'use strict';

const SRCH_FIELDS = [['code', 10], ['multi', 9], ['short', 8], ['company', 7], ['tags', 5], ['cat', 4], ['title', 4], ['year', 4], ['loc', 4], ['extra', 4],
  ['city', 3], ['contents', 3], ['notes', 1], ['contacts', 1], ['other', 1]];
const SRCH_NOTE_FIELDS = ['notes', 'contacts'];   // left out when opts.notes === false (setting "Cerca anche in note e contatti")
const SRCH = { cache:new Map(), gen:0, vocab:null, vocabGen:-1, vocabN:-1, locSig:'', lastMs:0 };

/* ---------------- folding ---------------- */
const SRCH_DIA = /[̀-ͯ]/g;
/** Lower case, accents removed (NFD), typographic quotes / dashes unified. Keeps punctuation (codes like A1-β-SX). */
function srchFold(s){ return String(s == null ? '' : s).normalize('NFD').replace(SRCH_DIA, '').toLowerCase().replace(/[‘’´`]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, '-'); }
const srchAlnum = (ch) => !!ch && /[\p{L}\p{N}]/u.test(ch);
const srchCompact = (s) => String(s || '').replace(/[^\p{L}\p{N}]+/gu, '');

/* ---------------- hooks ---------------- */
function srchHook(kind){
  try {
    if (kind === 'status') return typeof statusSearchHook !== 'undefined' && statusSearchHook ? statusSearchHook : (window.statusSearchHook || null);
    if (kind === 'archive') return typeof archiveSearchHook !== 'undefined' && archiveSearchHook ? archiveSearchHook : (window.archiveSearchHook || null);
  } catch(e){}
  return null;
}
function srchCall(h, fn, ...a){ try { return h && typeof h[fn] === 'function' ? h[fn](...a) : null; } catch(e){ console.warn('search hook ' + fn, e); return null; } }

/* ---------------- states ---------------- */
/** Built-in words for 'stato:' (folded, no spaces). Contents status words test the documents inside the binder. */
const SRCH_STATE_WORDS = {
  CHECKED_OUT:['fuori', 'fuoriarchivio', 'out', 'prelevato', 'prelevati', 'prelevata', 'prestito', 'uso', 'inuso', 'checked', 'checkedout', 'usato'],
  CURRENT:['corrente', 'correnti', 'current', 'attivo', 'attivi', 'inarchivio', 'archivio', 'dentro'],
  HISTORICAL:['storico', 'storici', 'historical', 'history', 'historic', 'vecchio']
};
const SRCH_CI_WORDS = {client:['cliente', 'client', 'alcliente', 'atclient'], in_use:['uso', 'inuso', 'inuse']};
/** Status shown on result cards: the status hook's (stream Q) when it has one, else the archive state. */
function srchStateOf(b){
  const h = srchHook('status'), s = h ? srchCall(h, 'statusOf', b) : null;
  if (s && s.id) return {id:String(s.id), label:String(s.label || s.id), cls:String(s.cls || ''), hook:true};
  return {id:b.archive_state || 'CURRENT', label:t('s_' + (b.archive_state || 'CURRENT')), cls:'st-' + (b.archive_state || 'CURRENT'), hook:false};
}

/* ---------------- colour names → hue (for colore:) ---------------- */
const SRCH_COLORS = {rosso:[345, 15], red:[345, 15], arancione:[15, 40], orange:[15, 40], giallo:[40, 70], yellow:[40, 70], verde:[70, 165], green:[70, 165],
  azzurro:[165, 205], celeste:[165, 205], cyan:[165, 205], blu:[205, 255], blue:[205, 255], viola:[255, 300], purple:[255, 300], violet:[255, 300], rosa:[300, 345], pink:[300, 345]};
function srchHsl(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim()); if (!m) return null;
  const n = parseInt(m[1], 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return {h:0, s:0, l};
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  return {h, s, l};
}
function srchColorIs(hex, word){
  const v = srchCompact(word);
  if (/^#?[0-9a-f]{3,6}$/i.test(word.trim())) return String(hex || '').toLowerCase().replace('#', '').startsWith(word.trim().toLowerCase().replace('#', ''));
  const c = srchHsl(hex); if (!c) return false;
  if (['grigio', 'grey', 'gray', 'nero', 'black', 'bianco', 'white'].includes(v)) return c.s < 0.15 || c.l < 0.12 || c.l > 0.92;
  const r = SRCH_COLORS[v]; if (!r || c.s < 0.15) return false;
  return r[0] > r[1] ? (c.h >= r[0] || c.h < r[1]) : (c.h >= r[0] && c.h < r[1]);
}

/* ---------------- one binder → search document (cached) ---------------- */
function srchLocInfo(b){
  if (b.location_id && typeof locById === 'function' && typeof locPath === 'function'){
    const l = locById(b.location_id);
    if (l){
      const path = locPath(l.id), title = typeof locTitle === 'function' ? locTitle : (x) => x.name || x.seg || '';
      const top = path.slice(0, 2);
      return {text:path.map(x => title(x) + ' ' + (x.seg || '') + ' ' + (x.code || '')).join(' ') + ' ' + (l.code || '') + ' ' + (l.short_code || ''),
        path:path.map(title).join(' › '), key:'L:' + top.map(x => x.id).join('/'), label:top.map(title).join(' › ') || l.code || ''};
    }
  }
  const head = locHead(b.room_code, b.cabinet_code);
  return {text:[b.room_code, b.cabinet_code, b.shelf_code, b.sector_code].filter(Boolean).join(' '), path:b.location_code || '', key:head ? 'R:' + head : '', label:head};
}
function srchYears(s){ const out = []; String(s || '').replace(/(?:^|\D)((?:19|20)\d\d)(?!\d)/g, (m, y) => { out.push(+y); return m; }); return out; }
/** Cheap signature of everything the document is built from: a changed binder (even mutated in place) is re-indexed. */
function srchSig(b, extra){
  const ci = b.contents_items || [];
  let c = ''; for (let i = 0; i < ci.length; i++){ const x = ci[i]; c += (x.year || '') + '\u0002' + (x.description || '') + '\u0002' + (x.status || '') + '\u0003'; }
  return [b.speaking_code, b.multi_code, b.short_code, b.company_name, b.company_city, b.tags, b.category, b.ref_year, b.binder_title, b.location_code, b.location_id, b.extra_codes,
    b.notes, b.contacts, b.archive_state, b.color_hex, b.room_code, b.cabinet_code, b.shelf_code, b.sector_code, c, extra].join('\u0001');
}
function srchDoc(b){
  const hs = srchHook('status'), ha = srchHook('archive');
  const hw = (hs ? String(srchCall(hs, 'words', b) || '') : '') + '\u0004' + (ha ? String(srchCall(ha, 'words', b) || '') : '');
  /* the hooks' answers are part of the signature: a hook that appears later, or a status / archive that changes, re-indexes */
  const hst = hs ? srchCall(hs, 'statusOf', b) : null, har = ha ? srchCall(ha, 'archiveOf', b) : null;
  const hk = (hst ? String(hst.id) + '\u0005' + String(hst.label || '') : '-') + '\u0004' + (har ? String(har.id) + '\u0005' + String(har.label || '') : '-');
  const sig = srchSig(b, hw + '\u0004' + hk), key = b.id || b.short_code || b.speaking_code;
  const hit = SRCH.cache.get(key);
  if (hit && hit.sig === sig && hit.b === b) return hit;
  const loc = srchLocInfo(b);
  const tagRaw = String(b.tags || '').split(',').map(x => x.trim()).filter(Boolean);
  const ci = b.contents_items || [];
  const years = srchYears(b.ref_year).concat(...ci.map(i => srchYears(i.year)));
  const st = b.archive_state || 'CURRENT';
  const ciSt = new Set(ci.map(i => i.status || 'archive'));
  const other = [t('s_' + st)].concat(ciSt.has('in_use') ? [t('cis_in_use')] : [], ciSt.has('client') ? [t('cis_client')] : [], [hw]).join(' ');
  const code = srchFold(b.speaking_code);
  const d = { b, sig, key,
    f:{code, multi:srchFold(b.multi_code), short:srchFold(b.short_code), company:srchFold(b.company_name), city:srchFold(b.company_city), tags:srchFold(tagRaw.join(', ')),
      cat:srchFold(b.category), title:srchFold(b.binder_title), year:srchFold([b.ref_year].concat(ci.map(i => i.year)).filter(Boolean).join(' ')),
      loc:srchFold([b.location_code, loc.text].join(' ')), extra:srchFold(b.extra_codes), contents:srchFold(ci.map(i => (i.year || '') + ' ' + (i.description || '')).join(' | ')),
      notes:srchFold(b.notes), contacts:srchFold(b.contacts), other:srchFold(other)},
    codeC:srchCompact(code), multiC:srchCompact(srchFold(b.multi_code)),
    tags:tagRaw.map(srchFold), tagRaw, years:Array.from(new Set(years)), state:st, ciSt, color:String(b.color_hex || '').toUpperCase(),
    locKey:loc.key, locLabel:loc.label, locPath:loc.path,
    archive:har, status:hst, words:null };
  SRCH.cache.set(key, d); SRCH.gen++;
  return d;
}
/** Words of a document (for the typo vocabulary). */
function srchDocWords(d){
  if (d.words) return d.words;
  const w = new Set();
  SRCH_FIELDS.forEach(([k]) => { String(d.f[k] || '').split(/[^\p{L}\p{N}]+/u).forEach(x => { if (x.length >= 3 && !/\d/.test(x)) w.add(x); }); });
  return (d.words = Array.from(w));
}

/* ---------------- query parsing ---------------- */
/** Operators. test(doc, value) with value folded and trimmed. keys = aliases (folded, without accents). */
const SRCH_OPS = {
  tag:{keys:['tag', 'tags', 'etichetta'], test:(d, v) => d.tags.some(x => x === v || (v.length >= 2 && x.startsWith(v)))},
  anno:{keys:['anno', 'anni', 'year', 'years', 'y'], test:(d, v) => srchYearTest(d.years, v)},
  cat:{keys:['cat', 'categoria', 'category', 'tipo'], test:(d, v) => !!d.f.cat && (d.f.cat === v || d.f.cat.startsWith(v) || srchCompact(d.f.cat) === srchCompact(v))},
  luogo:{keys:['luogo', 'loc', 'pos', 'posizione', 'ubicazione', 'location', 'dove', 'where', 'stanza', 'room'], test:(d, v) => d.f.loc.indexOf(v) >= 0 || srchCompact(d.f.loc).indexOf(srchCompact(v)) >= 0},
  stato:{keys:['stato', 'state', 'status', 'st'], test:(d, v) => srchStateTest(d, v)},
  cliente:{keys:['cliente', 'client', 'company', 'ditta', 'azienda'], test:(d, v) => d.f.company.indexOf(v) >= 0},
  citta:{keys:['citta', 'city', 'comune', 'paese'], test:(d, v) => d.f.city.indexOf(v) >= 0},
  multi:{keys:['multi', 'codicemulti'], test:(d, v) => !!d.f.multi && (d.f.multi === v || d.multiC === srchCompact(v) || d.f.multi.startsWith(v))},
  codice:{keys:['codice', 'code', 'cod'], test:(d, v) => d.f.code === v || d.codeC === srchCompact(v) || d.f.code.startsWith(v) || d.f.short === v},
  colore:{keys:['colore', 'color', 'colour'], test:(d, v) => srchColorIs(d.color, v)},
  archivio:{keys:['archivio', 'archive'], test:(d, v) => { const h = srchHook('archive'), r = h ? srchCall(h, 'match', d.b, v) : null; if (r === true || r === false) return r; const a = d.archive; return !!(a && (srchFold(a.label).indexOf(v) >= 0 || srchFold(a.id) === v)); }},
  note:{keys:['note', 'notes', 'nota'], test:(d, v) => d.f.notes.indexOf(v) >= 0 || d.f.contacts.indexOf(v) >= 0},
  contenuto:{keys:['contenuto', 'contenuti', 'contents', 'documento', 'doc'], test:(d, v) => d.f.contents.indexOf(v) >= 0}
};
function srchYearTest(years, v){
  if (!years.length) return false;
  let m;
  if ((m = /^(\d{4})\s*(?:\.\.|-|–|\/)\s*(\d{4})$/.exec(v))) { const a = Math.min(+m[1], +m[2]), z = Math.max(+m[1], +m[2]); return years.some(y => y >= a && y <= z); }
  if ((m = /^(>=?|<=?)\s*(\d{4})$/.exec(v))) { const n = +m[2]; return years.some(y => m[1] === '>' ? y > n : m[1] === '>=' ? y >= n : m[1] === '<' ? y < n : y <= n); }
  if ((m = /^(\d{2})$/.exec(v))) return years.some(y => y % 100 === +m[1]);
  return /^\d{4}$/.test(v) && years.includes(+v);
}
function srchStateTest(d, v){
  const h = srchHook('status'), r = h ? srchCall(h, 'match', d.b, v) : null;
  if (r === true || r === false) return r;
  const c = srchCompact(v);
  if (!c) return true;
  const st = STATES.find(s => SRCH_STATE_WORDS[s].includes(c) || srchCompact(srchFold(t('s_' + s))).startsWith(c) || s.toLowerCase().replace(/_/g, '') === c);
  if (st === d.state) return true;
  return Object.keys(SRCH_CI_WORDS).some(k => SRCH_CI_WORDS[k].includes(c) && d.ciSt.has(k));
}
function srchOpKey(k){ const f = srchCompact(srchFold(k)); return Object.keys(SRCH_OPS).find(id => SRCH_OPS[id].keys.includes(f)) || ''; }
/** → {raw, terms:[{v, neg, phrase}], ops:[{op, key, v, neg, raw}], qr:{type, code}|null} — v folded. */
function srchParse(q){
  const raw = String(q == null ? '' : q);
  const out = {raw, terms:[], ops:[], qr:null};
  const s = raw.trim(); if (!s) return out;
  if (typeof assocParseCode === 'function' && (/[:\/]/.test(s) || /^dm26L?[A-Za-z0-9]{8}$/.test(s))){
    const pc = assocParseCode(s);
    if (pc.type === 'binder' || pc.type === 'location'){ out.qr = pc; return out; }
  }
  const re = /(-?)(?:([\p{L}\p{N}_]+):)?(?:"([^"]*)"?|(\S+))/gu; let m;
  while ((m = re.exec(s))){
    const neg = m[1] === '-', key = m[2] || '', val = m[3] != null ? m[3] : m[4] || '', phrase = m[3] != null;
    const op = key ? srchOpKey(key) : '';
    if (key && op){ const v = srchFold(val).trim(); if (v || op === 'stato') out.ops.push({op, key, v, neg, raw:m[0]}); continue; }
    let v = srchFold(key ? key + ':' + val : val).trim();
    if (!phrase) v = v.replace(/^[,;.!?]+|[,;.!?]+$/g, '');
    if (!v || (neg && !v)) continue;
    out.terms.push({v, neg, phrase});
  }
  return out;
}

/* ---------------- typo tolerance ---------------- */
/** Damerau-Levenshtein (optimal string alignment) with an upper bound: returns max + 1 as soon as it is exceeded. */
function srchDL(a, b, max){
  const la = a.length, lb = b.length; if (Math.abs(la - lb) > max) return max + 1;
  let p2 = null, p = new Array(lb + 1), c = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) p[j] = j;
  for (let i = 1; i <= la; i++){
    c[0] = i; let low = i;
    for (let j = 1; j <= lb; j++){
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + cost);
      if (p2 && i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) v = Math.min(v, p2[j - 2] + 1);
      c[j] = v; if (v < low) low = v;
    }
    if (low > max) return max + 1;
    const tmp = p2 || new Array(lb + 1); p2 = p; p = c; c = tmp;
  }
  return p[lb];
}
const srchFuzzyMax = (w) => w.length >= 7 ? 2 : w.length >= 4 ? 1 : 0;
function srchVocab(docs){
  if (SRCH.vocab && SRCH.vocabGen === SRCH.gen && SRCH.vocabN === docs.length) return SRCH.vocab;
  const v = new Map();
  docs.forEach(d => srchDocWords(d).forEach(w => v.set(w, (v.get(w) || 0) + 1)));
  SRCH.vocab = v; SRCH.vocabGen = SRCH.gen; SRCH.vocabN = docs.length;
  return v;
}
/** Closest archive words for a word with no hit (best distance first, then most frequent), at most 4. */
function srchFuzzyWords(term, docs){
  const max = srchFuzzyMax(term); if (!max || /[^\p{L}]/u.test(term)) return [];
  const out = [];
  srchVocab(docs).forEach((n, w) => {
    if (w === term || w.length < term.length - max) return;
    let d = w.length - term.length <= max ? srchDL(term, w, max) : max + 1;
    if (d > max && w.length > term.length) d = srchDL(term, w.slice(0, term.length), max) + 0.5;   // a typo in the first part of a longer word
    if (d <= max + 0.5) out.push({w, d, n});
  });
  return out.sort((a, b) => a.d - b.d || b.n - a.n).slice(0, 4).map(x => x.w);
}

/* ---------------- matching + ranking ---------------- */
function srchFieldScore(s, term){
  const i = s.indexOf(term); if (i < 0) return 0;
  if (s.length === term.length) return 10;
  const startW = i === 0 || !srchAlnum(s.charAt(i - 1)), endW = !srchAlnum(s.charAt(i + term.length));
  return startW ? (endW ? 8 : 6) : 2;
}
function srchTermScore(d, term, fields){
  let best = 0;
  for (let k = 0; k < fields.length; k++){
    const s = d.f[fields[k][0]]; if (!s) continue;
    const sc = srchFieldScore(s, term); if (sc && sc * fields[k][1] > best) best = sc * fields[k][1];
  }
  /* codes typed with or without their dashes / dots / spaces: "m77001" = "M-77001", "bl-1" = "BL1" */
  if (!best){
    const c = srchCompact(term), punct = /[^\p{L}\p{N}\s]/u.test(term);
    if (c && (d.codeC === c || d.multiC === c) && (punct || c.length >= 3)) best = 90;
    else if (c && (punct || c.length >= 4) && (d.codeC.startsWith(c) || (d.multiC && d.multiC.startsWith(c)))) best = 50;
  }
  return best;
}
function srchFacetGroups(){ return ['tag', 'cat', 'year', 'loc', 'color', 'state', 'status', 'archive']; }
/** Facet keys of a document per group (arrays of {k, label}). */
function srchDocFacets(d){
  if (d.fac) return d.fac;
  const o = {tag:d.tagRaw.map((x, i) => ({k:d.tags[i], label:x})).filter(x => x.k !== DEMO_TAG), cat:d.b.category ? [{k:srchFold(d.b.category), label:d.b.category}] : [],
    year:d.years.map(y => ({k:String(y), label:String(y)})), loc:d.locKey ? [{k:d.locKey, label:d.locLabel}] : [], color:d.color ? [{k:d.color, label:d.color}] : [],
    state:[{k:d.state, label:t('s_' + d.state)}], status:d.status && d.status.id ? [{k:String(d.status.id), label:String(d.status.label || d.status.id)}] : [],
    archive:d.archive && d.archive.id ? [{k:String(d.archive.id), label:String(d.archive.label || d.archive.id)}] : []};
  return (d.fac = o);
}
/** Human label of a facet key (chips), from the documents of the last run. */
function srchFacetLabel(group, k){
  if (group === 'state') return t('s_' + k);
  for (const d of SRCH.cache.values()){ const f = srchDocFacets(d)[group]; const x = f && f.find(y => y.k === k); if (x) return x.label; }
  return k;
}
/**
 * Search a list of binders.
 * @param {object[]} binders  candidate binders (already filtered by the caller's own filters, in display order)
 * @param {string} q          query text (srchParse)
 * @param {{facets?:object, notes?:boolean, counts?:boolean, limit?:number}} opts
 * @returns {{list:object[], total:number, hits:Map<string,{score:number}>, marks:string[], parsed:object, fuzzy:{term:string, words:string[]}[], facets:object|null, ms:number}}
 */
function srchRun(binders, q, opts){
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  opts = opts || {};
  const P = srchParse(q), fsel = opts.facets || {};
  const locSig = typeof LOC_IDX !== 'undefined' ? LOC_IDX.ver + ':' + (typeof locArr === 'function' ? locArr().length : 0) : '';
  if (locSig !== SRCH.locSig){ SRCH.cache.clear(); SRCH.locSig = locSig; SRCH.gen++; }
  if (SRCH.cache.size > binders.length * 3 + 2000){ SRCH.cache.clear(); SRCH.gen++; }
  const docs = binders.map(srchDoc);
  const fields = opts.notes === false ? SRCH_FIELDS.filter(f => !SRCH_NOTE_FIELDS.includes(f[0])) : SRCH_FIELDS;
  const marks = [], fuzzy = [];
  // 1. QR / short code → exact
  let pool = docs;
  if (P.qr){
    if (P.qr.type === 'binder') pool = docs.filter(d => d.b.short_code === P.qr.code || d.f.short === srchFold(P.qr.code));
    else pool = docs.filter(d => { const l = typeof locArr === 'function' ? locArr().find(x => x.short_code === P.qr.code) : null; return !!(l && typeof locBinderIn === 'function' && locBinderIn(d.b, l.id)); });
  }
  // 2. operators (AND), exclusions
  if (P.ops.length) pool = pool.filter(d => P.ops.every(o => { const op = SRCH_OPS[o.op]; let r = false; try { r = !!op.test(d, o.v); } catch(e){ r = false; } return o.neg ? !r : r; }));
  P.ops.forEach(o => { if (!o.neg && ['tag', 'cat', 'cliente', 'citta', 'multi', 'codice', 'luogo', 'note', 'contenuto'].includes(o.op) && o.v) marks.push(o.v); });
  const negT = P.terms.filter(x => x.neg), posT = P.terms.filter(x => !x.neg);
  if (negT.length) pool = pool.filter(d => negT.every(x => !srchTermScore(d, x.v, fields)));
  // 3. free words: every word must hit (directly, or through its typo replacements)
  const score = new Map();
  let cand = pool;
  posT.forEach(term => {
    let alts = [term.v];
    let any = cand.some(d => srchTermScore(d, term.v, fields) > 0);
    if (!any && !term.phrase){ const fw = srchFuzzyWords(term.v, pool); if (fw.length){ fuzzy.push({term:term.v, words:fw}); alts = fw; } }
    marks.push(...alts);
    const next = [];
    cand.forEach(d => {
      let best = 0;
      alts.forEach((a, i) => { const s = srchTermScore(d, a, fields) * (a === term.v ? 1 : 0.6 - i * 0.05); if (s > best) best = s; });
      if (best > 0){ next.push(d); score.set(d.key, (score.get(d.key) || 0) + best); }
    });
    cand = next;
  });
  // whole query = a code → first
  const whole = srchFold(P.raw).trim(), wholeC = srchCompact(whole);
  if (posT.length && wholeC) cand.forEach(d => { if (d.codeC === wholeC) score.set(d.key, (score.get(d.key) || 0) + 1000); else if (d.multiC && d.multiC === wholeC) score.set(d.key, (score.get(d.key) || 0) + 800); });
  // 4. facets: OR inside a group, AND between groups; counts per group ignore the group's own selection
  const groups = srchFacetGroups().filter(g => Array.isArray(fsel[g]) && fsel[g].length);
  const sets = {}; groups.forEach(g => sets[g] = new Set(fsel[g]));
  const passG = (d, g) => srchDocFacets(d)[g].some(x => sets[g].has(x.k));
  let facets = null;
  if (opts.counts !== false){
    facets = {};
    const acc = {}; srchFacetGroups().forEach(g => acc[g] = new Map());
    cand.forEach(d => {
      const miss = groups.filter(g => !passG(d, g));
      if (miss.length > 1) return;
      const df = srchDocFacets(d);
      srchFacetGroups().forEach(g => { if (miss.length && miss[0] !== g) return; const seen = new Set(); df[g].forEach(x => { if (seen.has(x.k)) return; seen.add(x.k); const e = acc[g].get(x.k) || {k:x.k, label:x.label, n:0}; e.n++; acc[g].set(x.k, e); }); });
    });
    srchFacetGroups().forEach(g => {
      const on = sets[g] || new Set();
      let arr = Array.from(acc[g].values()).map(x => Object.assign(x, {on:on.has(x.k)}));
      on.forEach(k => { if (!acc[g].has(k)) arr.push({k, label:srchFacetLabel(g, k), n:0, on:true}); });
      arr.sort(g === 'year' ? (a, b) => +b.k - +a.k : g === 'state' ? (a, b) => STATES.indexOf(a.k) - STATES.indexOf(b.k) : (a, b) => (b.on - a.on) || b.n - a.n || naturalCmp(a.label, b.label));
      facets[g] = arr;
    });
  }
  if (groups.length) cand = cand.filter(d => groups.every(g => passG(d, g)));
  // 5. order: score (stable: input order on ties)
  let list = cand;
  if (posT.length){ const pos = new Map(); cand.forEach((d, i) => pos.set(d.key, i)); list = cand.slice().sort((a, b) => (score.get(b.key) || 0) - (score.get(a.key) || 0) || pos.get(a.key) - pos.get(b.key)); }
  const hits = new Map(); list.forEach(d => hits.set(d.b.id, {score:score.get(d.key) || 0}));
  const out = {list:list.map(d => d.b), total:list.length, hits, marks:Array.from(new Set(marks.filter(Boolean))).sort((a, b) => b.length - a.length), parsed:P, fuzzy, facets, ms:0};
  out.ms = SRCH.lastMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  // warm the typo vocabulary while the user reads the results, so the first "Forse cercavi" stays fast
  if (!(SRCH.vocab && SRCH.vocabGen === SRCH.gen && SRCH.vocabN === pool.length) && !SRCH.warm && pool === docs){
    SRCH.warm = setTimeout(() => { SRCH.warm = 0; try { srchVocab(docs); } catch(e){} }, 400);
  }
  return out;
}

/* ---------------- highlighting ---------------- */
/** Escaped HTML of `text` with every occurrence of the (folded) marks wrapped in <mark class="sr-hl">, accent-insensitive. */
function srchMark(text, marks){
  const s = String(text == null ? '' : text);
  if (!s || !marks || !marks.length) return esc(s);
  let f = ''; const map = [];
  for (let i = 0; i < s.length; i++){ const ch = srchFold(s.charAt(i)); for (let k = 0; k < ch.length; k++){ f += ch.charAt(k); map.push(i); } }
  const on = new Uint8Array(s.length); let any = false;
  marks.forEach(m => { if (!m || m.length < 1) return; let p = 0; while ((p = f.indexOf(m, p)) >= 0){ for (let j = map[p]; j <= map[p + m.length - 1]; j++) on[j] = 1; any = true; p += m.length; } });
  if (!any) return esc(s);
  let out = '', open = false;
  for (let i = 0; i < s.length; i++){
    if (on[i] && !open){ out += '<mark class="sr-hl">'; open = true; }
    if (!on[i] && open){ out += '</mark>'; open = false; }
    out += esc(s.charAt(i));
  }
  return out + (open ? '</mark>' : '');
}
