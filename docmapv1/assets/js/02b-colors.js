/* =====================================================================
   DocMap 2026 — smart spine colours (v10, stream K)

   Model (see docs/MODELLO-DATI.md §"Colori dei dorsi" and AGENTS.md §12):
     - COLOR_FAMILIES: 10 hand-checked palettes ("famiglie") of 10 print-safe shades each.
       Every shade has white-text contrast >= 3:1 (spine labels in the shelf map draw white text
       on the colour) and the shades of a family are at least ΔE2000 7 apart (distinct on paper).
       They were picked offline in OKLCH (lightness 0.38–0.66, chroma <= 0.22, sRGB gamut) with a
       greedy max-min CIEDE2000 selection, anchored on the historical category colours, so the
       first shade of blue / green / violet / orange / red is exactly the v9 CAT_COLOR value.
     - A category belongs to one family:
         S.settings.catFamilies {categoryName: familyId}   explicit choice (Informazioni › Categorie)
         S.settings.catColors   {categoryName: '#RRGGBB'}  the category's own colour (v8): it is the
                                family's anchor (first shade) and, without an explicit family, picks
                                the nearest family
         COLOR_CAT_RULES        defaults by name: Ordinaria → blu, Semplificata → verdi, Societario →
                                viola, Lavoro → arancio, Dichiarativi → rossi, Contenzioso → grigi,
                                Privati → petrolio, APS / ETS / ENC / ODV / ASD / associazioni / enti →
                                caldi, Condominio → magenta, società / aziende / imprese → freddi scuri;
                                any other name → a stable family chosen by hash of the name.
     - S.settings.colorMode (how binders get their colour automatically):
         'company'  (default) every company gets its own shade inside its category's family: same
                    company + same category → same shade; different companies in a category get
                    different shades until the family is exhausted (then the least used shade).
                    Deterministic: the first candidate is FNV-1a(companyKey) mod n, linear probing.
         'category' one colour per category (the v9 behaviour, = colorCategoryHex()).
         'manual'   nothing is coloured automatically; new binders start from the category colour.
     - binder.color_locked (boolean): true when the user picked the colour by hand (editor swatch,
       colour picker, import column). Locked colours are never changed by applyAutoColor/recolorAll
       nor by company/category edits. "Automatico" in the editor unlocks.
   Public API (used by the editor, Informazioni, import, bulk edit and future Python/hub code):
     colorAssign(b, binders, opts)  → '#RRGGBB' for b under the current (or opts.mode) mode
     applyAutoColor(b, binders)     → true if b.color_hex changed (respects lock and 'manual')
     recolorAll(opts)               → n; opts {onlyUnlocked:true, category:null, mode, silent}
                                      undoPoint + logAct('binder.recolor') + undoToast
     colorPlan(binders, opts)       → Map(id → hex), the pure part of recolorAll
     colorFamilyId(cat), colorShades(cat), colorCategoryHex(cat), colorIsAuto(b), colorLockLegacy(list, settings)
     colorContrast(a, b), colorDeltaE(a, b) (CIEDE2000), colorHash(s)
   Migration: existing binders are NOT recoloured on upgrade. A state / workspace / .sqlite without
   S.settings.colorMode is "pre-v10": colorLockLegacy() locks every binder whose colour is not an
   automatic one (not a shade of its family / its category colour), so a later "Ricolora" keeps the
   user's hand-picked colours.
   ===================================================================== */
'use strict';

const COLOR_MODES = ['company', 'category', 'manual'];
const COLOR_FAMILIES = [
  {id:'warm',   it:'Caldi (rossi, arancio, ocra)', en:'Warm (reds, oranges, ochres)', shades:['#C2410C','#880033','#A87E24','#BA6C78','#7B4C00','#792B13','#C52940','#B6744B','#CF5F4D','#934956']},
  {id:'red',    it:'Rossi',              en:'Reds',             shades:['#DC2626','#732D3D','#B36675','#7E2401','#C1074B','#B36A53','#944A44','#9C051E','#B13C11','#DA3F56']},
  {id:'orange', it:'Arancio e ocra',     en:'Oranges & ochres', shades:['#D97706','#753A24','#876207','#AE6D56','#BA4209','#A77D45','#6D4205','#905A33','#DB632B','#B56116']},
  {id:'pink',   it:'Magenta',            en:'Magentas',         shades:['#BE185D','#770973','#A26A9D','#732D3C','#B36674','#B12B9B','#8C4A6D','#C94A8D','#940A59','#692F59']},
  {id:'violet', it:'Viola',              en:'Violets',          shades:['#7C3AED','#573160','#92689C','#525890','#4E02A4','#882E9B','#666BD9','#3D357F','#A74BC5','#463FC1']},
  {id:'blue',   it:'Blu',                en:'Blues',            shades:['#2563EB','#313E72','#1B8ABD','#09597D','#6C7DB6','#2429A7','#506097','#267EE8','#064CAB','#056DB1']},
  {id:'cool',   it:'Freddi scuri (blu, verdi scuri)', en:'Cool dark (blues, dark greens)', shades:['#1E3A8A','#02721C','#176A70','#1C4129','#126493','#043F4D','#07684F','#515C80','#005211','#0E4C49']},
  {id:'teal',   it:'Petrolio',           en:'Teals',            shades:['#0E7490','#154D42','#0A8E7A','#15495A','#20716F','#238994','#2A616B','#528296','#4B8074','#0C4C50']},
  {id:'green',  it:'Verdi',              en:'Greens',           shades:['#059669','#374A01','#628202','#13604C','#0F7126','#648656','#596B36','#095119','#377E67','#369034']},
  {id:'slate',  it:'Grigi',              en:'Greys',            shades:['#475569','#787561','#493A2D','#846D74','#2F4238','#443847','#617981','#55695D','#645C55','#717386']}
];
const COLOR_FAMILY = {}; COLOR_FAMILIES.forEach(f => { COLOR_FAMILY[f.id] = f; });
/* Unknown category names get one of these, by hash (mixed families are only chosen on purpose). */
const COLOR_HASH_FAMILIES = ['blue','green','violet','orange','red','teal','pink','slate'];
/* Default family by category name (folded: lowercase, no accents, punctuation → space). First match wins. */
const COLOR_CAT_RULES = [
  [/^ordinari/, 'blue'], [/^semplificat/, 'green'], [/societari/, 'violet'], [/lavoro|paghe|personale/, 'orange'],
  [/dichiarativ|redditi/, 'red'], [/contenzios/, 'slate'], [/privat|persone fisiche|^pf$/, 'teal'],
  [/\b(aps|ets|enc|odv|asd|ssd|onlus|ente|enti|associazion\w*|terzo settore|no ?profit|non profit|fondazion\w*|circol\w*|pro loco|parrocchi\w*|cooperativ\w* social\w*)\b/, 'warm'],
  [/condomin/, 'pink'],
  [/\b(societa|srl|s r l|spa|s p a|snc|sas|azienda|aziende|impres\w*|ditt\w*|company|companies|business)\b/, 'cool']
];
const CO = { tmp:null };   // tmp: settings object used while migrating (S is not set yet)

Object.assign(I18N.it, {
  co_h:'Colori dei dorsi', co_p:'Ogni categoria ha una famiglia di colori armoniosi; ogni cliente riceve in automatico una sfumatura diversa della sua famiglia. Un colore scelto a mano resta bloccato.',
  co_mode:'Assegnazione automatica', co_m_company:'Per cliente', co_m_category:'Per categoria', co_m_manual:'Manuale',
  co_md_company:'Stesso cliente → stesso colore; clienti diversi della stessa categoria → sfumature diverse della famiglia.',
  co_md_category:'Un solo colore per categoria (come nelle versioni precedenti).',
  co_md_manual:'Nessun colore automatico: i nuovi faldoni partono dal colore della categoria, il resto lo scegli tu.',
  co_families:'Famiglie di colori', co_cats:'Categorie e famiglie', co_recolor:'Ricolora tutti i faldoni (non bloccati)',
  co_recolor_d:'Applica la regola scelta ai faldoni esistenti. I colori scelti a mano (bloccati) non cambiano. Si può annullare.',
  co_recolor_manual:'In modalità Manuale non si ricolora in automatico.',
  co_recolored:'{n} faldoni ricolorati', co_recolored1:'1 faldone ricolorato', co_none:'Nessun faldone da ricolorare: i colori sono già quelli automatici.',
  co_mode_saved:'Assegnazione colori: {m}',
  co_auto:'Automatico', co_auto_t:'Colore automatico: segue cliente e categoria', co_locked:'Scelto a mano', co_locked_t:'Colore bloccato: non cambia in automatico. Clicca "Automatico" per sbloccarlo.',
  co_family:'Famiglia', co_family_of:'Famiglia: {f}', co_others:'Altri colori', co_n_locked:'{n} bloccati',
  co_cat_family_d:'Scegli la famiglia di colori della categoria: ogni cliente avrà una sfumatura diversa di questa famiglia. Il primo colore è quello della categoria.',
  co_cat_recolor:'Ricolora i {n} faldoni di questa categoria (non bloccati)',
  'lga_binder.recolor':'Faldoni ricolorati', 'lga_settings.color_mode':'Assegnazione colori'
});
Object.assign(I18N.en, {
  co_h:'Spine colours', co_p:'Each category has a family of harmonious colours; each client automatically gets a different shade of its family. A colour you pick by hand stays locked.',
  co_mode:'Automatic assignment', co_m_company:'By client', co_m_category:'By category', co_m_manual:'Manual',
  co_md_company:'Same client → same colour; different clients of the same category → different shades of the family.',
  co_md_category:'One colour per category (as in previous versions).',
  co_md_manual:'No automatic colours: new binders start from the category colour, the rest is up to you.',
  co_families:'Colour families', co_cats:'Categories and families', co_recolor:'Recolour all binders (not locked)',
  co_recolor_d:'Applies the chosen rule to existing binders. Colours picked by hand (locked) do not change. Can be undone.',
  co_recolor_manual:'In Manual mode nothing is recoloured automatically.',
  co_recolored:'{n} binders recoloured', co_recolored1:'1 binder recoloured', co_none:'Nothing to recolour: colours are already the automatic ones.',
  co_mode_saved:'Colour assignment: {m}',
  co_auto:'Automatic', co_auto_t:'Automatic colour: follows client and category', co_locked:'Picked by hand', co_locked_t:'Locked colour: it never changes automatically. Click "Automatic" to unlock it.',
  co_family:'Family', co_family_of:'Family: {f}', co_others:'Other colours', co_n_locked:'{n} locked',
  co_cat_family_d:'Choose the colour family of this category: each client gets a different shade of it. The first colour is the category colour.',
  co_cat_recolor:'Recolour the {n} binders of this category (not locked)',
  'lga_binder.recolor':'Binders recoloured', 'lga_settings.color_mode':'Colour assignment'
});

/* ---------------- Colour math (sRGB, WCAG contrast, CIE Lab D65, CIEDE2000) ---------------- */
function colorRgb(hex){ const h = normHex(hex) || '#000000'; return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }
function colorLum(hex){ const l = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; const [r, g, b] = colorRgb(hex).map(l); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
/** WCAG 2 contrast ratio (1..21). */
function colorContrast(a, b){ const x = colorLum(a), y = colorLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function colorLab(hex){
  const l = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const [r, g, b] = colorRgb(hex).map(l);
  const f = (t) => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
/** CIEDE2000 colour difference (about 2 = just noticeable, > 7 = clearly different on paper). */
function colorDeltaE(c1, c2){
  const [L1, a1, b1] = colorLab(c1), [L2, a2, b2] = colorLab(c2), rad = Math.PI / 180, p7 = (x) => Math.pow(x, 7);
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2, G = 0.5 * (1 - Math.sqrt(p7(Cb) / (p7(Cb) + p7(25))));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hp = (b, a) => { if (!b && !a) return 0; const h = Math.atan2(b, a) / rad; return h < 0 ? h + 360 : h; };
  const h1p = hp(b1, a1p), h2p = hp(b2, a2p), dL = L2 - L1, dC = C2p - C1p;
  let dh = 0; if (C1p * C2p){ dh = h2p - h1p; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh * rad / 2), Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hb = h1p + h2p; if (C1p * C2p){ if (Math.abs(h1p - h2p) > 180) hb = hb < 360 ? (hb + 360) / 2 : (hb - 360) / 2; else hb /= 2; }
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.20 * Math.cos((4 * hb - 63) * rad);
  const dTh = 30 * Math.exp(-Math.pow((hb - 275) / 25, 2)), RC = 2 * Math.sqrt(p7(Cbp) / (p7(Cbp) + p7(25)));
  const SL = 1 + 0.015 * Math.pow(Lb - 50, 2) / Math.sqrt(20 + Math.pow(Lb - 50, 2)), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T, RT = -Math.sin(2 * dTh * rad) * RC;
  return Math.sqrt(Math.pow(dL / SL, 2) + Math.pow(dC / SC, 2) + Math.pow(dH / SH, 2) + RT * (dC / SC) * (dH / SH));
}
/** FNV-1a 32-bit (stable across sessions, browsers and the Python side). */
function colorHash(s){ let h = 0x811c9dc5; s = String(s || ''); for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }

/* ---------------- Keys and settings ---------------- */
const colorSettings = () => CO.tmp || (S && S.settings) || {};
const colorMode = () => { const m = colorSettings().colorMode; return COLOR_MODES.includes(m) ? m : 'company'; };
/** Category key: same rule as Informazioni (infoKey): spaces collapsed, trimmed, lowercase. */
const colorKey = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();
const colorFold = (v) => colorKey(v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** Company identity: folded company name (same rule as the editor's duplicate-spelling guard), else the Codice Multi. */
function colorCompanyKey(b){
  const n = String(b && b.company_name || '');
  const k = typeof companyKey === 'function' ? companyKey(n) : colorFold(n).replace(/ /g, '');
  if (k) return k;
  const m = String(b && b.multi_code || '').replace(/\s+/g, '').toLowerCase();
  return m ? 'multi:' + m : '';
}
function colorLookup(map, cat){ map = map || {}; const k = colorKey(cat); if (!k) return null; const own = Object.keys(map).find(x => colorKey(x) === k); return own == null ? null : map[own]; }
/** The category's own colour chosen in Informazioni (v8 S.settings.catColors), if any. */
const colorAnchor = (cat) => normHex(colorLookup(colorSettings().catColors, cat) || '') || '';
function colorNearestFamily(hex){
  let best = 'blue', bd = Infinity;
  COLOR_FAMILIES.forEach(f => f.shades.forEach(s => { const d = colorDeltaE(hex, s); if (d < bd){ bd = d; best = f.id; } }));
  return best;
}
/** Family suggested by the category name alone (ignores the user's choices). */
function colorFamilyDefault(cat){
  const f = colorFold(cat); if (!f) return 'slate';
  const r = COLOR_CAT_RULES.find(x => x[0].test(f)); if (r) return r[1];
  return COLOR_HASH_FAMILIES[colorHash(f) % COLOR_HASH_FAMILIES.length];
}
/** Family of a category: explicit choice → nearest family of the category colour → default by name. */
function colorFamilyId(cat){
  const own = colorLookup(colorSettings().catFamilies, cat); if (own && COLOR_FAMILY[own]) return own;
  const a = colorAnchor(cat); if (a) return colorNearestFamily(a);
  return colorFamilyDefault(cat);
}
const colorFamilyName = (id) => { const f = COLOR_FAMILY[id] || COLOR_FAMILY.blue; return S && S.lang === 'en' ? f.en : f.it; };
/** The category colour (category mode, first shade in company mode). */
function colorCategoryHex(cat){
  const a = colorAnchor(cat); if (a) return a;
  if (colorLookup(colorSettings().catFamilies, cat)) return COLOR_FAMILY[colorFamilyId(cat)].shades[0];
  const def = typeof CAT_COLOR_DEFAULT !== 'undefined' ? CAT_COLOR_DEFAULT : CAT_COLOR;
  const d = normHex(colorLookup(def, cat) || ''); if (d) return d;
  return COLOR_FAMILY[colorFamilyId(cat)].shades[0];
}
/** Shades available to a category: the category colour first, then its family (a near duplicate of a custom anchor is dropped). */
function colorShades(cat){
  const base = colorCategoryHex(cat), fam = COLOR_FAMILY[colorFamilyId(cat)].shades;
  if (fam.includes(base)) return [base].concat(fam.filter(c => c !== base));
  let ni = -1, nd = 8; fam.forEach((c, i) => { const d = colorDeltaE(base, c); if (d < nd){ nd = d; ni = i; } });
  return [base].concat(fam.filter((c, i) => i !== ni));
}
/** True when a binder's colour looks automatic (a shade of its family, its category colour or an old default). */
function colorIsAuto(b){
  const h = normHex(b && b.color_hex || ''); if (!h) return true;
  if (h === '#2563EB' || h === '#475569') return true;   // v9 fallbacks (normalizeBinder / import)
  const def = typeof CAT_COLOR_DEFAULT !== 'undefined' ? CAT_COLOR_DEFAULT : CAT_COLOR;
  return colorShades(b.category).includes(h) || h === normHex(colorLookup(def, b.category) || '');
}
/** Pre-v10 data: lock the colours that were evidently chosen by hand. settings: the settings that come with the data. */
function colorLockLegacy(list, settings){
  const prev = CO.tmp; CO.tmp = settings || colorSettings();
  let n = 0;
  try { (list || []).forEach(b => { if (!b.color_locked && !colorIsAuto(b)){ b.color_locked = true; n++; } }); }
  finally { CO.tmp = prev; }
  return n;
}

/* ---------------- Assignment ---------------- */
/* Index of the colours in use, per category key:
     byCo  companyKey → Map(hex → count) of UNLOCKED binders (what "same company → same colour" reuses)
     used  hex → Set(companyKey) of ALL binders (what other companies must avoid) */
function colorIndex(binders, excludeId){
  const idx = new Map();
  (binders || []).forEach(b => { if (b && (!excludeId || b.id !== excludeId)) colorIndexAdd(idx, b); });
  return idx;
}
function colorIndexAdd(idx, b){
  const h = normHex(b.color_hex || ''); if (!h) return;
  const kc = colorKey(b.category), ck = colorCompanyKey(b);
  let g = idx.get(kc); if (!g){ g = {byCo:new Map(), used:new Map()}; idx.set(kc, g); }
  if (!g.used.has(h)) g.used.set(h, new Set()); g.used.get(h).add(ck);
  if (ck && !b.color_locked){ let m = g.byCo.get(ck); if (!m){ m = new Map(); g.byCo.set(ck, m); } m.set(h, (m.get(h) || 0) + 1); }
}
/**
 * Colour for binder b under the current mode (or opts.mode).
 * binders: the other binders (default S.binders; b itself is skipped by id). opts.index: a prebuilt colorIndex (bulk use).
 */
function colorAssign(b, binders, opts){
  opts = opts || {};
  const mode = opts.mode || colorMode(), cat = b.category, base = colorCategoryHex(cat);
  if (mode === 'manual') return normHex(b.color_hex || '') || base;
  if (mode === 'category') return base;
  const ck = colorCompanyKey(b); if (!ck) return base;
  const shades = opts.shades || colorShades(cat);
  const idx = opts.index || colorIndex(binders || (S && S.binders) || [], b.id);
  const g = idx.get(colorKey(cat)) || {byCo:new Map(), used:new Map()};
  // 1. same company, same category: reuse its (automatic) shade, the most used one
  const mine = g.byCo.get(ck);
  if (mine){ let best = null, bn = 0; mine.forEach((n, h) => { if (shades.includes(h) && n > bn){ bn = n; best = h; } }); if (best) return best; }
  // 2. first free shade from the company's hash; all taken → the least used one
  const n = shades.length, h0 = colorHash(ck) % n;
  let best = shades[h0], bu = Infinity;
  for (let i = 0; i < n; i++){
    const c = shades[(h0 + i) % n], s = g.used.get(c), u = s ? s.size - (s.has(ck) ? 1 : 0) : 0;
    if (u === 0) return c;
    if (u < bu){ bu = u; best = c; }
  }
  return best;
}
/** Give b its automatic colour (no commit). Returns true when the colour changed. */
function applyAutoColor(b, binders, opts){
  if (!b || b.color_locked || (colorMode() === 'manual' && !(opts && opts.mode))) return false;
  const h = colorAssign(b, binders, opts);
  if (!h || h === b.color_hex) return false;
  b.color_hex = h; b.updated_at = nowISO();
  return true;
}
/**
 * Pure plan for a recolour: Map(id → new hex) for the targets whose colour changes.
 * opts: {onlyUnlocked (default true), category (name or key: only that category), mode}
 * Targets are recoloured from scratch: companies in alphabetical key order, avoiding the colours of
 * the binders that are not recoloured (locked ones, other categories are irrelevant).
 */
function colorPlan(binders, opts){
  opts = opts || {};
  const mode = opts.mode || colorMode(), only = opts.onlyUnlocked !== false, kc = opts.category != null ? colorKey(opts.category) : null;
  const isT = (b) => (!only || !b.color_locked) && (kc == null || colorKey(b.category) === kc);
  const targets = binders.filter(isT), plan = new Map();
  if (mode === 'manual') return plan;
  const idx = colorIndex(binders.filter(b => !isT(b))), shadesBy = new Map();
  const sortKey = (b) => colorKey(b.category) + '\u0001' + colorCompanyKey(b) + '\u0001' + String(b.speaking_code || '');
  targets.slice().sort((a, b) => sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0).forEach(b => {
    const k = colorKey(b.category); if (!shadesBy.has(k)) shadesBy.set(k, colorShades(b.category));
    const h = colorAssign(b, null, {mode, index:idx, shades:shadesBy.get(k)});
    const v = Object.assign({}, b, {color_hex:h, color_locked:false}); colorIndexAdd(idx, v);
    if (h !== b.color_hex) plan.set(b.id, h);
  });
  return plan;
}
/** Recolour existing binders (default: all unlocked ones) with undo and an activity-log entry. Returns the number changed. */
function recolorAll(opts){
  opts = opts || {};
  const mode = opts.mode || colorMode();
  if (mode === 'manual'){ if (!opts.silent) toast(t('co_recolor_manual'), 'warn'); return 0; }
  const plan = colorPlan(S.binders, Object.assign({}, opts, {mode}));
  if (!plan.size){ if (!opts.silent) toast(t('co_none')); return 0; }
  if (!opts.noUndo) undoPoint();
  const now = nowISO();
  S.binders.forEach(b => { if (plan.has(b.id)){ b.color_hex = plan.get(b.id); b.updated_at = now; } });
  if (typeof logAct === 'function') logAct('binder.recolor', null, 'Ricolorati ' + plan.size + ' faldoni (modalità ' + mode + (opts.category ? ', categoria ' + opts.category : '') + ')', {mode, n:plan.size, category:opts.category || '', onlyUnlocked:opts.onlyUnlocked !== false});
  if (opts.noCommit) return plan.size;
  commit();
  if (typeof renderView === 'function') renderView();
  if (!opts.silent){ const msg = plan.size === 1 ? t('co_recolored1') : t('co_recolored', {n:plan.size}); if (opts.noUndo) toast(msg); else undoToast(msg); }
  return plan.size;
}

/* ---------------- Binder editor ---------------- */
/** Recompute the editor's colour after a company / category change (unless locked or manual mode). */
function edAutoColor(){
  const ed = UI.ed; if (!ed) return;
  const d = ed.d;
  if (!d.color_locked && colorMode() !== 'manual') d.color_hex = colorAssign(d, S.binders);
  else if (!d.color_locked && ed.isNew && !normHex(d.color_hex || '')) d.color_hex = colorCategoryHex(d.category);
  const sw = $('#ed-swatches'); if (sw) sw.innerHTML = swatchesHTML(d.color_hex);
}
/** The user picked a colour by hand in the editor: lock it. */
function edColorLock(){
  const d = UI.ed && UI.ed.d; if (!d) return;
  d.color_locked = true;
  const sw = $('#ed-swatches'); if (!sw) return;
  const a = sw.querySelector('.co-auto'); if (a) a.classList.remove('on');
  const l = sw.querySelector('.co-lock'); if (l) l.hidden = false;
}
const CO_ICONS = {
  lock:'<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  palette:'<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.56-2.5 5.56-5.55C21.97 6.01 17.46 2 12 2z"/>'
};
const coIc = (n, cls) => { if (typeof ICONS !== 'undefined' && !ICONS[n] && CO_ICONS[n]) ICONS[n] = CO_ICONS[n]; return ic(n, cls); };
/** Swatches of the binder editor: "Automatico", the family's shades, other colours, custom picker. */
function colorSwatchesHTML(cur, d){
  d = d || (UI.ed && UI.ed.d) || {};
  cur = String(normHex(cur || '') || '#2563EB');
  const fam = colorShades(d.category), mode = colorMode(), locked = !!d.color_locked;
  const sw = (c, cls) => '<button type="button" class="sw' + (cls || '') + (cur === c ? ' on' : '') + '" style="background:' + c + '" data-a="ed-color" data-c="' + c + '" aria-label="' + c + '" title="' + c + '"></button>';
  const others = Array.from(new Set(COLORS.concat(SHELF_COLORS))).filter(c => !fam.includes(c));
  return (mode !== 'manual' ? '<button type="button" class="co-auto' + (locked ? '' : ' on') + '" data-a="ed-color-auto" title="' + esc(t('co_auto_t')) + '">' + ic('sparkles') + esc(t('co_auto')) + '</button>' : '') +
    '<span class="co-fam" title="' + esc(t('co_family_of', {f:colorFamilyName(colorFamilyId(d.category))})) + '">' + fam.map(c => sw(c)).join('') + '</span>' +
    '<span class="co-others" title="' + esc(t('co_others')) + '">' + others.map(c => sw(c, ' sm')).join('') + '</span>' +
    '<input type="color" value="' + esc(cur) + '" data-ed="color_hex" style="width:44px;height:34px;border:1px solid var(--border-2);border-radius:8px;padding:2px;background:#fff;cursor:pointer" aria-label="custom colour"><span class="mono small muted">' + esc(cur) + '</span>' +
    '<span class="co-lock small" title="' + esc(t('co_locked_t')) + '"' + (locked ? '' : ' hidden') + '>' + coIc('lock') + esc(t('co_locked')) + '</span>';
}

/* ---------------- Settings › Colori ---------------- */
function colorStrip(id, opts){
  opts = opts || {};
  const f = COLOR_FAMILY[id]; if (!f) return '';
  const shades = opts.shades || f.shades;
  return '<span class="co-strip' + (opts.big ? ' big' : '') + '" aria-hidden="true">' + shades.map(c => '<i style="background:' + c + '"></i>').join('') + '</span>';
}
function colorCategories(){
  const m = new Map();
  const add = (v) => { const k = colorKey(v); if (k && !m.has(k)) m.set(k, String(v).replace(/\s+/g, ' ').trim()); };
  S.binders.forEach(b => add(b.category)); (S.clients || []).forEach(c => add(c.category));
  Object.keys(colorSettings().catFamilies || {}).forEach(add);
  return Array.from(m.values()).sort((a, b) => a.localeCompare(b, 'it'));
}
function colorSettingsHTML(){
  const mode = colorMode(), cats = colorCategories(), nLocked = S.binders.filter(b => b.color_locked).length;
  return '<div class="card card-p stack co-card" id="co-settings" style="margin-top:16px"><div><h2>' + coIc('palette') + esc(t('co_h')) + helpDot('colors') + '</h2><p class="small muted" style="margin:4px 0 0">' + esc(t('co_p')) + '</p></div>' +
    '<div class="field"><label>' + esc(t('co_mode')) + '</label><div class="seg" id="co-mode">' + COLOR_MODES.map(m => '<button type="button" data-a="co-mode" data-m="' + m + '" class="' + (m === mode ? 'on' : '') + '">' + esc(t('co_m_' + m)) + '</button>').join('') + '</div><div class="hint">' + esc(t('co_md_' + mode)) + '</div></div>' +
    (cats.length ? '<div class="field"><label>' + esc(t('co_cats')) + '</label><div class="co-cats">' + cats.map(c => { const fid = colorFamilyId(c); return '<div class="co-cat"><span class="sw-dot" style="background:' + esc(colorCategoryHex(c)) + '"></span><b>' + esc(c) + '</b><span class="small muted">' + esc(colorFamilyName(fid)) + '</span>' + colorStrip(fid, {shades:colorShades(c)}) + '</div>'; }).join('') + '</div></div>' : '') +
    '<details class="co-fams"><summary class="small">' + esc(t('co_families')) + ' (' + COLOR_FAMILIES.length + ')</summary><div class="co-cats">' + COLOR_FAMILIES.map(f => '<div class="co-cat"><b>' + esc(colorFamilyName(f.id)) + '</b>' + colorStrip(f.id) + '</div>').join('') + '</div></details>' +
    '<div class="row" style="gap:10px;align-items:center"><button class="btn" data-a="co-recolor"' + (mode === 'manual' ? ' disabled' : '') + '>' + ic('refresh') + esc(t('co_recolor')) + '</button>' + (nLocked ? '<span class="small muted">' + coIc('lock') + esc(t('co_n_locked', {n:nLocked})) + '</span>' : '') + '</div>' +
    '<div class="hint">' + esc(mode === 'manual' ? t('co_recolor_manual') : t('co_recolor_d')) + '</div></div>';
}

/* ---------------- Actions ---------------- */
const COLOR_ACTIONS = {
  'co-mode': (el) => {
    const m = el.dataset.m; if (!COLOR_MODES.includes(m) || m === colorMode()) return;
    const old = colorMode(); S.settings.colorMode = m; commit({dirty:false});
    if (typeof logAct === 'function') logAct('settings.color_mode', null, 'Assegnazione colori: ' + old + ' → ' + m, {from:old, to:m});
    renderView(); toast(t('co_mode_saved', {m:t('co_m_' + m)}));
  },
  'co-recolor': () => recolorAll({onlyUnlocked:true}),
  'ed-color-auto': () => { const d = UI.ed && UI.ed.d; if (!d) return; d.color_locked = false; edAutoColor(); if (typeof edRefreshDerived === 'function') edRefreshDerived(); }
};

/* ---------------- Late registration (ACTIONS, HELP_TOPICS, LOG_FIELD_IT are defined in later files) ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof ACTIONS !== 'undefined') Object.assign(ACTIONS, COLOR_ACTIONS);
  if (typeof LOG_FIELD_IT !== 'undefined') LOG_FIELD_IT.color_locked = 'colore bloccato';
  if (typeof HELP_TOPICS === 'undefined') return;
  HELP_TOPICS.push({ id:'colors', guide:null, tags:['archive','label'], related:['info'],
    title:{it:'Colori dei dorsi: famiglie, clienti e colori bloccati', en:'Spine colours: families, clients and locked colours'},
    body:{it:'<p>Ogni faldone ha un colore (la barra sull\'etichetta e il dorso nella mappa). DocMap lo sceglie da solo, in modo armonioso:</p><ul><li>ogni <b>categoria</b> ha una <b>famiglia</b> di 10 colori (es. <b>Caldi</b> rossi/arancio/ocra per APS, ETS e associazioni, <b>Freddi scuri</b> blu e verdi scuri per le aziende, <b>Blu</b> per l\'Ordinaria, <b>Verdi</b> per la Semplificata…);</li><li>in modalità <b>Per cliente</b> (predefinita) ogni cliente riceve una sfumatura diversa della famiglia, sempre la stessa per tutti i suoi faldoni di quella categoria;</li><li><b>Per categoria</b>: un solo colore per categoria, come prima; <b>Manuale</b>: nessun colore automatico.</li></ul><p>Nel modulo del faldone il colore cambia da solo quando cambi cliente o categoria. Se clicchi un colore lo <b>blocchi</b> (🔒 Scelto a mano): non cambierà più in automatico. Clicca <b>Automatico</b> per sbloccarlo.</p><p>In <b>Informazioni › Categorie</b> scegli la famiglia di ogni categoria e puoi ricolorarne i faldoni. In <b>Impostazioni › Colori dei dorsi</b> scegli la modalità e trovi <b>Ricolora tutti i faldoni (non bloccati)</b>. Ricolorare si può sempre annullare e non tocca i colori bloccati. Aggiornando da una versione precedente i colori esistenti non cambiano: quelli scelti a mano vengono bloccati.</p>',
          en:'<p>Every binder has a colour (the bar on the label and the spine in the map). DocMap picks it for you, harmoniously:</p><ul><li>each <b>category</b> has a <b>family</b> of 10 colours (e.g. <b>Warm</b> reds/oranges/ochres for APS, ETS and associations, <b>Cool dark</b> blues and dark greens for companies, <b>Blues</b> for Ordinaria, <b>Greens</b> for Semplificata…);</li><li>in <b>By client</b> mode (default) each client gets a different shade of the family, always the same for all its binders of that category;</li><li><b>By category</b>: one colour per category, as before; <b>Manual</b>: no automatic colours.</li></ul><p>In the binder form the colour follows the client and category as you type. Clicking a colour <b>locks</b> it (🔒 Picked by hand): it no longer changes automatically. Click <b>Automatic</b> to unlock it.</p><p>In <b>Information › Categories</b> choose the family of each category and recolour its binders. In <b>Settings › Spine colours</b> choose the mode and use <b>Recolour all binders (not locked)</b>. Recolouring can always be undone and never touches locked colours. When upgrading from an earlier version existing colours do not change: hand-picked ones are locked.</p>'} });
});
