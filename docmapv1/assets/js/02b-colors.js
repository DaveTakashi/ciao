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
   Two levels (v10 follow-up): 1) category → spettro (COLOR_SPECTRA, seeds COLOR_SEEDS_DEFAULT APS/ODV/ASD/ETS,
     overridable as data in S.settings.colorSeeds); 2) keyword rules S.settings.colorRules {cat: [{id, kw, hex, at}]}
     (max COLOR_RULES_MAX per category, first match on company_name + binder_title wins, see colorTextMatches).
     Precedence for unlocked binders: rule → per-company shade / category colour. S.settings.colorUpdatedAt
     (colorTouch) stamps every colour-settings change for sync (colorSyncSubset / colorSyncApply).
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
/* The 8 "spettri colore" a category can be given (Informazioni › Categorie) come first; warm / cool / teal stay
   available as extra families (v10 first round). Shade lists are data: changing one changes the automatic colours. */
const COLOR_FAMILIES = [
  {id:'red',    spectrum:1, it:'Rosso',           en:'Red',               shades:['#DC2626','#732D3D','#B36675','#7E2401','#C1074B','#B36A53','#944A44','#9C051E','#B13C11','#DA3F56']},
  {id:'green',  spectrum:1, it:'Verde',           en:'Green',             shades:['#059669','#374A01','#628202','#13604C','#0F7126','#648656','#596B36','#095119','#377E67','#369034']},
  {id:'blue',   spectrum:1, it:'Azzurro / Blu',   en:'Light blue / Blue', shades:['#2563EB','#313E72','#1B8ABD','#09597D','#6C7DB6','#2429A7','#506097','#267EE8','#064CAB','#056DB1']},
  {id:'yellow', spectrum:1, it:'Giallo',          en:'Yellow',            shades:['#A16207','#989021','#5F5A1F','#A78652','#856C02','#755002','#817D42','#A68008','#8E6E3B','#9A8C52']},
  {id:'orange', spectrum:1, it:'Arancione',       en:'Orange',            shades:['#D97706','#753A24','#876207','#AE6D56','#BA4209','#A77D45','#6D4205','#905A33','#DB632B','#B56116']},
  {id:'violet', spectrum:1, it:'Viola',           en:'Violet',            shades:['#7C3AED','#573160','#92689C','#525890','#4E02A4','#882E9B','#666BD9','#3D357F','#A74BC5','#463FC1']},
  {id:'pink',   spectrum:1, it:'Rosa',            en:'Pink',              shades:['#BE185D','#770973','#A26A9D','#732D3C','#B36674','#B12B9B','#8C4A6D','#C94A8D','#940A59','#692F59']},
  {id:'slate',  spectrum:1, it:'Nero / Grigi',    en:'Black / Greys',     shades:['#475569','#1E1B0A','#787561','#1D1727','#846D74','#3A4D42','#5A493D','#12272E','#617981','#4F4352']},
  {id:'warm',   it:'Caldi (rossi, arancio, ocra)', en:'Warm (reds, oranges, ochres)', shades:['#C2410C','#880033','#A87E24','#BA6C78','#7B4C00','#792B13','#C52940','#B6744B','#CF5F4D','#934956']},
  {id:'cool',   it:'Freddi scuri (blu, verdi scuri)', en:'Cool dark (blues, dark greens)', shades:['#1E3A8A','#02721C','#176A70','#1C4129','#126493','#043F4D','#07684F','#515C80','#005211','#0E4C49']},
  {id:'teal',   it:'Petrolio',        en:'Teal',              shades:['#0E7490','#154D42','#0A8E7A','#15495A','#20716F','#238994','#2A616B','#528296','#4B8074','#0C4C50']}
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
const COLOR_SPECTRA = COLOR_FAMILIES.filter(f => f.spectrum).map(f => f.id);   // the 8 chips of the spectrum selector
/* MVP seed: family of these categories when the user has not chosen one (data: override with S.settings.colorSeeds).
   Matched as a whole word of the folded category name ("APS", "APS Cultura"). */
const COLOR_SEEDS_DEFAULT = {APS:'red', ODV:'green', ASD:'blue', ETS:'yellow'};
const COLOR_RULES_MAX = 10;   // keyword rules per category
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
  co_spec:'Spettro colore', co_spec_more:'Altre famiglie:', co_spec_new:'Nuova categoria "{c}": scegli lo spettro colore',
  co_rules:'Regole colore', co_rules_d:'Se il nome del cliente o il titolo del faldone contiene la parola, il faldone prende quella sfumatura (la prima regola che corrisponde vince). Maiuscole, accenti, spazi e trattini non contano: "proloco" vale anche per "Pro Loco" e "PRO-LOCO".',
  co_rule_add:'Aggiungi regola', co_rule_ok:'Aggiungi', co_rule_ph:'Parola chiave, es. proloco', co_rule_del:'Elimina regola', co_rule_up:'Sposta su', co_rule_down:'Sposta giù',
  co_rule_n:'{n} faldoni', co_rule_n1:'1 faldone', co_rule_count:'{n} di {m} regole', co_rule_max:'Massimo {n} regole per categoria',
  co_rule_e_empty:'Scrivi una parola chiave.', co_rule_e_max:'Massimo {n} regole per categoria.', co_rule_e_dup:'Questa parola chiave c\'è già.',
  co_rule_hit:'Regola "{k}"', co_apply_existing:'Applica ai faldoni esistenti di questa categoria (non bloccati, {n})',
  co_ov_n:'{n} regole in {c} categorie', co_ov_none:'nessuna regola', co_ov_help:'Nessuna regola colore. Apri il colore di una categoria (colonna Colore) e premi "Aggiungi regola": per esempio APS + "proloco" → un rosso preciso per tutte le Pro Loco.',
  co_rules_link_d:'Parole chiave → sfumatura, per categoria', 'lga_settings.color_rules':'Colori categoria',
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
  co_spec:'Colour spectrum', co_spec_more:'Other families:', co_spec_new:'New category "{c}": choose its colour spectrum',
  co_rules:'Colour rules', co_rules_d:'When the client name or the binder title contains the word, the binder takes that shade (the first matching rule wins). Case, accents, spaces and dashes do not matter: "proloco" also matches "Pro Loco" and "PRO-LOCO".',
  co_rule_add:'Add rule', co_rule_ok:'Add', co_rule_ph:'Keyword, e.g. proloco', co_rule_del:'Delete rule', co_rule_up:'Move up', co_rule_down:'Move down',
  co_rule_n:'{n} binders', co_rule_n1:'1 binder', co_rule_count:'{n} of {m} rules', co_rule_max:'At most {n} rules per category',
  co_rule_e_empty:'Type a keyword.', co_rule_e_max:'At most {n} rules per category.', co_rule_e_dup:'This keyword already exists.',
  co_rule_hit:'Rule "{k}"', co_apply_existing:'Apply to the existing binders of this category (not locked, {n})',
  co_ov_n:'{n} rules in {c} categories', co_ov_none:'no rules', co_ov_help:'No colour rules. Open the colour of a category (Colour column) and press "Add rule": e.g. APS + "proloco" → one specific red for every Pro Loco.',
  co_rules_link_d:'Keywords → shade, per category', 'lga_settings.color_rules':'Category colours',
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
/** Seeded family (COLOR_SEEDS_DEFAULT or S.settings.colorSeeds) for a category name, or ''. */
function colorSeedFamily(cat){
  const seeds = colorSettings().colorSeeds && typeof colorSettings().colorSeeds === 'object' ? colorSettings().colorSeeds : COLOR_SEEDS_DEFAULT;
  const words = colorFold(cat).split(' ').filter(Boolean); if (!words.length) return '';
  const k = Object.keys(seeds).find(x => COLOR_FAMILY[seeds[x]] && words.includes(colorFold(x)));
  return k ? seeds[k] : '';
}
/** Family of a category: explicit choice → nearest family of the category colour → seed → default by name. */
function colorFamilyId(cat){
  const own = colorLookup(colorSettings().catFamilies, cat); if (own && COLOR_FAMILY[own]) return own;
  const a = colorAnchor(cat); if (a) return colorNearestFamily(a);
  return colorSeedFamily(cat) || colorFamilyDefault(cat);
}
const colorFamilyName = (id) => { const f = COLOR_FAMILY[id] || COLOR_FAMILY.blue; return S && S.lang === 'en' ? f.en : f.it; };
/** The category colour (category mode, first shade in company mode). */
function colorCategoryHex(cat){
  const a = colorAnchor(cat); if (a) return a;
  if (colorLookup(colorSettings().catFamilies, cat) || colorSeedFamily(cat)) return COLOR_FAMILY[colorFamilyId(cat)].shades[0];
  const def = typeof CAT_COLOR_DEFAULT !== 'undefined' ? CAT_COLOR_DEFAULT : CAT_COLOR;
  const d = normHex(colorLookup(def, cat) || ''); if (d) return d;
  return COLOR_FAMILY[colorFamilyId(cat)].shades[0];
}
/** Shades available to a category: the category colour first, then its family (a near duplicate of a custom anchor is dropped). */
function colorShades(cat){ return colorShadesFor(colorFamilyId(cat), colorCategoryHex(cat)); }
function colorShadesFor(famId, base){
  const fam = (COLOR_FAMILY[famId] || COLOR_FAMILY.blue).shades; base = normHex(base || '') || fam[0];
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
/* ---------------- Keyword rules (second level) ----------------
   S.settings.colorRules = {"<category>": [{id, kw, hex, at}]}, at most COLOR_RULES_MAX per category, in priority
   order (first match wins). Matching: keyword and text are folded (lowercase, no accents, any non-alphanumeric run =
   word break) and the keyword with its spaces removed must equal one word or several CONSECUTIVE words joined
   together: "proloco" matches "Pro Loco", "PRO-LOCO", "Proloco di Busseto", but not "Prolocomotiva" nor "aps" in
   "Capsule" (whole words only). Text = company_name + binder_title. */
const colorKw = (s) => colorFold(s).replace(/ /g, '');
function colorTextMatches(text, kw){
  const k = colorKw(kw); if (!k) return false;
  const w = colorFold(text).split(' ').filter(Boolean);
  for (let i = 0; i < w.length; i++){ let acc = ''; for (let j = i; j < w.length && acc.length < k.length; j++){ acc += w[j]; if (acc === k) return true; } }
  return false;
}
function colorRulesFor(cat){ const r = colorLookup(colorSettings().colorRules, cat); return Array.isArray(r) ? r.filter(x => x && x.kw && normHex(x.hex || '')) : []; }
/** First rule (of `rules`, default the category's) matching the binder's company name or title, or null. */
function colorRuleMatch(b, rules){
  rules = rules || colorRulesFor(b && b.category); if (!rules.length) return null;
  const text = String(b.company_name || '') + ' ' + String(b.binder_title || '');
  return rules.find(r => colorTextMatches(text, r.kw)) || null;
}
/** A shade of `shades` not used by the other rules and not the base (shades[0]). */
function colorRuleFreeShade(shades, rules, exceptId){
  const used = new Set((rules || []).filter(r => r.id !== exceptId).map(r => normHex(r.hex || '')));
  return shades.slice(1).find(c => !used.has(c)) || shades[1] || shades[0];
}
/** Add a rule to a list (pure). Returns {rule} or {error:'empty'|'max'|'dup'}. */
function colorRuleNew(list, shades, kw){
  const k = String(kw || '').replace(/\s+/g, ' ').trim();
  if (!colorKw(k)) return {error:'empty'};
  if (list.length >= COLOR_RULES_MAX) return {error:'max'};
  if (list.some(r => colorKw(r.kw) === colorKw(k))) return {error:'dup'};
  const rule = {id:'cr-' + uuid().slice(0, 8), kw:k, hex:colorRuleFreeShade(shades, list), at:nowISO()};
  list.push(rule); return {rule};
}
/** How many binders of a category each rule colours (first match wins). */
function colorRuleCounts(cat, rules, binders){
  const k = colorKey(cat), out = {};
  (rules || []).forEach(r => { out[r.id] = 0; });
  (binders || S.binders).forEach(b => { if (colorKey(b.category) !== k) return; const r = colorRuleMatch(b, rules); if (r) out[r.id]++; });
  return out;
}
/** Settings-level API (each call stamps colorUpdatedAt; callers commit). */
function colorRulesSet(cat, list){
  const s = S.settings, m = Object.assign({}, s.colorRules || {});
  Object.keys(m).forEach(x => { if (colorKey(x) === colorKey(cat)) delete m[x]; });
  if (list && list.length) m[String(cat).replace(/\s+/g, ' ').trim()] = list.slice(0, COLOR_RULES_MAX).map(r => ({id:r.id, kw:r.kw, hex:normHex(r.hex), at:r.at || nowISO()}));
  s.colorRules = m; colorTouch();
}
function colorRuleAdd(cat, kw){ const list = colorRulesFor(cat).map(r => Object.assign({}, r)); const r = colorRuleNew(list, colorShades(cat), kw); if (r.rule) colorRulesSet(cat, list); return r; }
function colorRuleDelete(cat, id){ colorRulesSet(cat, colorRulesFor(cat).filter(r => r.id !== id)); }
/* Sync (06f-sync.js settingsSubset): the colour block travels as a whole and the side with the newer
   colorUpdatedAt wins (applied only when the user ticks "apply shared settings"). */
function colorSyncSubset(){ const st = S.settings; return {colorMode:colorMode(), catFamilies:clone(st.catFamilies || {}), colorRules:clone(st.colorRules || {}), colorUpdatedAt:st.colorUpdatedAt || ''}; }
function colorSyncApply(ss){
  if (!ss || !ss.colorUpdatedAt) return false;
  const st = S.settings, mine = st.colorUpdatedAt || '';
  if (mine && Date.parse(ss.colorUpdatedAt) <= Date.parse(mine)) return false;
  const safe = (o) => { const r = {}; if (o && typeof o === 'object') Object.keys(o).forEach(k => { if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') r[k] = o[k]; }); return r; };
  if (COLOR_MODES.includes(ss.colorMode)) st.colorMode = ss.colorMode;
  if (ss.catFamilies && typeof ss.catFamilies === 'object'){ const f = safe(ss.catFamilies); Object.keys(f).forEach(k => { if (!COLOR_FAMILY[f[k]]) delete f[k]; }); st.catFamilies = f; }
  if (ss.colorRules && typeof ss.colorRules === 'object'){
    const r = safe(ss.colorRules);
    Object.keys(r).forEach(k => { r[k] = (Array.isArray(r[k]) ? r[k] : []).filter(x => x && x.kw && normHex(x.hex || '')).slice(0, COLOR_RULES_MAX).map(x => ({id:String(x.id || 'cr-' + uuid().slice(0, 8)), kw:String(x.kw).slice(0, 60), hex:normHex(x.hex), at:String(x.at || '')})); if (!r[k].length) delete r[k]; });
    st.colorRules = r;
  }
  st.colorUpdatedAt = ss.colorUpdatedAt;
  if (typeof infoApplyCatColors === 'function') infoApplyCatColors();
  return true;
}
/** Stamp of the last change to the colour settings (sync: last-write-wins on the colour block). */
function colorTouch(){ if (S && S.settings) S.settings.colorUpdatedAt = nowISO(); }

/**
 * Colour for binder b under the current mode (or opts.mode).
 * Precedence (callers skip locked binders): keyword rule → per-company shade ('company') / category colour ('category').
 * binders: the other binders (default S.binders; b itself is skipped by id). opts.index: a prebuilt colorIndex (bulk use).
 */
function colorAssign(b, binders, opts){
  opts = opts || {};
  const mode = opts.mode || colorMode(), cat = b.category, base = colorCategoryHex(cat);
  if (mode === 'manual') return normHex(b.color_hex || '') || base;
  const rules = colorRulesFor(cat), rule = colorRuleMatch(b, rules);
  if (rule) return normHex(rule.hex);
  if (mode === 'category') return base;
  const ck = colorCompanyKey(b); if (!ck) return base;
  const ruleHex = new Set(rules.map(r => normHex(r.hex)));   // shades reserved by keyword rules are not given to other companies
  const shades = (opts.shades || colorShades(cat)).filter(c => !ruleHex.has(c) || c === base);
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
    '<span class="co-lock small" title="' + esc(t('co_locked_t')) + '"' + (locked ? '' : ' hidden') + '>' + coIc('lock') + esc(t('co_locked')) + '</span>' +
    colorEditorExtrasHTML(d);
}

/* ---------------- Spectrum chips + keyword rules UI (Informazioni › Categorie, editor, overview) ---------------- */
/** Chips of the colour spectra (8 big ones) + the extra families (small). action: data-a value; cur: selected family id. */
function colorSpectrumHTML(cur, action, opts){
  opts = opts || {};
  const chip = (f, big) => '<button type="button" class="co-spec' + (big ? ' big' : '') + (f.id === cur ? ' on' : '') + '" data-a="' + action + '" data-f="' + f.id + '" aria-pressed="' + (f.id === cur) + '" title="' + esc(colorFamilyName(f.id)) + '"><span class="co-spec-sw" style="background:' + f.shades[0] + '"></span><span class="co-spec-l">' + esc(colorFamilyName(f.id)) + '</span>' + (big && !opts.compact ? colorStrip(f.id) : '') + '</button>';
  const main = COLOR_FAMILIES.filter(f => f.spectrum), extra = COLOR_FAMILIES.filter(f => !f.spectrum);
  return '<div class="co-specs">' + main.map(f => chip(f, true)).join('') + '</div>' +
    (opts.noExtra ? '' : '<div class="co-specs-x"><span class="small muted">' + esc(t('co_spec_more')) + '</span>' + extra.map(f => chip(f, false)).join('') + '</div>');
}
/** Rules list of the category dialog (draft M.rules). */
function colorRulesHTML(M){
  const shades = colorShadesFor(M.fam, M.cur), counts = colorRuleCounts(M.cat, M.rules);
  const rows = M.rules.map((r, i) => '<div class="co-rule" data-id="' + esc(r.id) + '">' +
    '<span class="co-rule-mv"><button type="button" class="icon-btn" data-a="co-rule-mv" data-id="' + esc(r.id) + '" data-d="-1"' + (i ? '' : ' disabled') + ' aria-label="' + esc(t('co_rule_up')) + '" title="' + esc(t('co_rule_up')) + '">↑</button><button type="button" class="icon-btn" data-a="co-rule-mv" data-id="' + esc(r.id) + '" data-d="1"' + (i < M.rules.length - 1 ? '' : ' disabled') + ' aria-label="' + esc(t('co_rule_down')) + '" title="' + esc(t('co_rule_down')) + '">↓</button></span>' +
    '<span class="co-rule-sw" style="background:' + esc(r.hex) + '"></span><b class="co-rule-kw">' + esc(r.kw) + '</b>' +
    '<span class="co-rule-shades">' + shades.slice(1).map(c => '<button type="button" class="sw xs' + (normHex(r.hex) === c ? ' on' : '') + '" style="background:' + c + '" data-a="co-rule-shade" data-id="' + esc(r.id) + '" data-c="' + c + '" aria-label="' + c + '"></button>').join('') + '</span>' +
    '<span class="small muted co-rule-n">' + esc(t(counts[r.id] === 1 ? 'co_rule_n1' : 'co_rule_n', {n:counts[r.id] || 0})) + '</span>' +
    '<button type="button" class="icon-btn danger" data-a="co-rule-del" data-id="' + esc(r.id) + '" aria-label="' + esc(t('co_rule_del')) + '" title="' + esc(t('co_rule_del')) + '">' + ic('trash') + '</button></div>').join('');
  const full = M.rules.length >= COLOR_RULES_MAX;
  return rows + (M.adding && !full
    ? '<div class="co-rule-add"><input class="inp" id="co-rule-kw" placeholder="' + esc(t('co_rule_ph')) + '" autocomplete="off" maxlength="60"><button type="button" class="btn btn-primary btn-sm" data-a="co-rule-add">' + ic('check') + esc(t('co_rule_ok')) + '</button></div>'
    : '<div class="row" style="gap:8px;align-items:center"><button type="button" class="btn btn-sm" data-a="co-rule-new"' + (full ? ' disabled' : '') + '>' + ic('plus') + esc(t('co_rule_add')) + '</button><span class="small muted">' + esc(full ? t('co_rule_max', {n:COLOR_RULES_MAX}) : t('co_rule_count', {n:M.rules.length, m:COLOR_RULES_MAX})) + '</span></div>');
}
/** Category colour dialog: spectrum + category colour + keyword rules + optional recolour (called by openCatColor, 06d-info.js). */
function colorCatDialog(e){
  const s = S.settings, key = colorKey(e.value);
  const cc = s.catColors || {}, own = Object.keys(cc).find(x => colorKey(x) === key);
  const cf = s.catFamilies || {}, ownF = Object.keys(cf).find(x => colorKey(x) === key);
  const M = UI.coCat = { cat:e.value, fam:colorFamilyId(e.value), famSet:!!ownF, cur:colorCategoryHex(e.value), rules:colorRulesFor(e.value).map(r => Object.assign({}, r)), adding:false, rulesChanged:false };
  const sw = () => Array.from(new Set(COLOR_FAMILY[M.fam].shades.concat(COLORS, SHELF_COLORS))).map(c => '<button type="button" class="sw' + (c === M.cur ? ' on' : '') + '" data-a="info-sw" data-c="' + c + '" style="background:' + c + '" aria-label="' + c + '"></button>').join('');
  M.render = () => {
    const f = $('#info-fams'), w = $('#info-sws'), i = $('#info-col'), r = $('#co-rules');
    if (f) f.innerHTML = colorSpectrumHTML(M.fam, 'co-fam'); if (w) w.innerHTML = sw(); if (i) i.value = M.cur; if (r) r.innerHTML = colorRulesHTML(M);
    const k = $('#co-rule-kw'); if (k) setTimeout(() => k.focus(), 20);
  };
  M.pickFamily = (id) => {
    if (!COLOR_FAMILY[id]) return;
    M.fam = id; M.famSet = true; M.cur = COLOR_FAMILY[id].shades[0];
    const sh = colorShadesFor(M.fam, M.cur); M.rules.forEach((r, i) => { r.hex = sh[1 + (i % (sh.length - 1))]; });   // rules follow the new family, distinct shades
    if (M.rules.length) M.changed();
    M.render();
  };
  M.changed = () => { M.rulesChanged = true; const cb = $('#info-col-all'); if (cb) cb.checked = true; };
  const apply = (fam, hex, rules) => {
    s.catColors = Object.assign({}, cc); if (own) delete s.catColors[own];
    s.catFamilies = Object.assign({}, cf); if (ownF) delete s.catFamilies[ownF];
    if (fam) s.catFamilies[e.value] = fam;
    if (hex && hex !== colorCategoryHex(e.value)) s.catColors[e.value] = hex;   // the category's own colour = family anchor
    colorRulesSet(e.value, rules);
    if (typeof infoApplyCatColors === 'function') infoApplyCatColors();
  };
  const recolor = () => { if ($('#info-col-all') && $('#info-col-all').checked) recolorAll({onlyUnlocked:true, category:e.value, mode:colorMode() === 'manual' ? 'category' : undefined, noUndo:true, noCommit:true, silent:true}); };
  const done = (msg) => {
    if (typeof logAct === 'function') logAct('settings.color_rules', null, 'Colori della categoria ' + e.value + ': famiglia ' + (s.catFamilies[e.value] || colorFamilyId(e.value)) + ', ' + colorRulesFor(e.value).length + ' regole', {category:e.value, family:colorFamilyId(e.value), rules:colorRulesFor(e.value).map(r => r.kw + ' ' + r.hex)});
    closeModal(true); commit(); renderView(); undoToast(msg);
  };
  openModal({ title:t('in_color_t', {v:e.value}), size:'lg',
    body:'<p class="small muted" style="margin-top:0">' + esc(t('in_color_d')) + '</p>' +
      '<div class="lbl" style="margin-bottom:6px">' + esc(t('co_spec')) + helpDot('colors') + '</div><div id="info-fams">' + colorSpectrumHTML(M.fam, 'co-fam') + '</div><div class="hint" style="margin:6px 0 12px">' + esc(t('co_cat_family_d')) + '</div>' +
      '<div class="swatches" id="info-sws">' + sw() + '</div><label class="row small info-custom">' + esc(t('in_color_custom')) + ' <input type="color" id="info-col" value="' + esc(M.cur || '#2563EB') + '" title="#RRGGBB"></label>' +
      '<div class="co-rules-box"><div class="lbl" style="margin:16px 0 4px">' + esc(t('co_rules')) + '</div><div class="hint" style="margin:0 0 8px">' + esc(t('co_rules_d')) + '</div><div id="co-rules">' + colorRulesHTML(M) + '</div></div>' +
      '<label class="chk small" style="margin-top:14px"><input type="checkbox" id="info-col-all">' + esc(t('co_apply_existing', {n:e.nB})) + '</label>',
    buttons:[{label:t('in_color_reset'), cls:'btn btn-ghost', fn: () => {
      undoPoint(); apply('', '', []); recolor(); done(t('in_color_saved', {v:e.value}));
    }}, {label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('save'), cls:'btn btn-primary', icon:'check', fn: () => {
      const hex = normHex($('#info-col').value); if (!hex) return;
      if (M.adding && $('#co-rule-kw') && $('#co-rule-kw').value.trim()) COLOR_ACTIONS['co-rule-add']();
      undoPoint(); apply(M.famSet ? M.fam : '', hex, M.rules); recolor(); done(t('in_color_saved', {v:e.value}));
    }}],
    onClose: () => { UI.coCat = null; } });
}
/** Overview of every category with keyword rules (Informazioni › Categorie, top). */
function colorRulesOverviewHTML(){
  const all = colorSettings().colorRules || {}, cats = Object.keys(all).filter(c => Array.isArray(all[c]) && all[c].length);
  const n = cats.reduce((a, c) => a + all[c].length, 0);
  return '<details class="co-ov card" id="co-rules-ov"' + (UI.coRulesOpen ? ' open' : '') + '><summary><b>' + coIc('palette') + esc(t('co_rules')) + '</b> <span class="small muted">' + esc(n ? t('co_ov_n', {n, c:cats.length}) : t('co_ov_none')) + '</span></summary>' +
    '<div class="co-ov-b">' + (cats.length ? cats.sort((a, b) => a.localeCompare(b, 'it')).map(c => '<div class="co-ov-cat"><button type="button" class="ed-link" data-a="co-cat-open" data-k="' + esc(colorKey(c)) + '"><b>' + esc(c) + '</b></button> <span class="small muted">' + esc(colorFamilyName(colorFamilyId(c))) + '</span><div class="co-ov-rules">' + colorRulesFor(c).map(r => '<span class="co-ov-r"><i style="background:' + esc(r.hex) + '"></i>' + esc(r.kw) + '</span>').join('') + '</div></div>').join('')
      : '<p class="small muted" style="margin:0">' + esc(t('co_ov_help')) + '</p>') + '</div></details>';
}
/** Editor helpers: rule hint and, for a category nobody uses yet, the spectrum chips. */
function colorEditorExtrasHTML(d){
  const cat = String(d.category || '').trim(); let h = '';
  const r = cat && !d.color_locked && colorMode() !== 'manual' ? colorRuleMatch(d) : null;
  if (r) h += '<span class="co-rule-hint small" title="' + esc(t('co_rules')) + '"><i style="background:' + esc(r.hex) + '"></i>' + esc(t('co_rule_hit', {k:r.kw})) + '</span>';
  const k = colorKey(cat), used = cat && (S.binders.some(b => b.id !== d.id && colorKey(b.category) === k) || (S.clients || []).some(c => colorKey(c.category) === k));
  if (cat && !used) h += '<div class="co-ed-spec"><div class="small muted">' + esc(t('co_spec_new', {c:cat})) + '</div>' + colorSpectrumHTML(colorFamilyId(cat), 'ed-spectrum', {compact:true, noExtra:true}) + '</div>';
  return h;
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
    '<div class="row" style="gap:10px;align-items:center"><button class="btn" data-a="co-rules-open">' + coIc('palette') + esc(t('co_rules')) + ' (' + Object.values(colorSettings().colorRules || {}).reduce((a, l) => a + (Array.isArray(l) ? l.length : 0), 0) + ')</button><span class="small muted">' + esc(t('co_rules_link_d')) + '</span></div>' +
    '<div class="row" style="gap:10px;align-items:center"><button class="btn" data-a="co-recolor"' + (mode === 'manual' ? ' disabled' : '') + '>' + ic('refresh') + esc(t('co_recolor')) + '</button>' + (nLocked ? '<span class="small muted">' + coIc('lock') + esc(t('co_n_locked', {n:nLocked})) + '</span>' : '') + '</div>' +
    '<div class="hint">' + esc(mode === 'manual' ? t('co_recolor_manual') : t('co_recolor_d')) + '</div></div>';
}

/* ---------------- Actions ---------------- */
const COLOR_ACTIONS = {
  'co-mode': (el) => {
    const m = el.dataset.m; if (!COLOR_MODES.includes(m) || m === colorMode()) return;
    const old = colorMode(); S.settings.colorMode = m; colorTouch(); commit({dirty:false});
    if (typeof logAct === 'function') logAct('settings.color_mode', null, 'Assegnazione colori: ' + old + ' → ' + m, {from:old, to:m});
    renderView(); toast(t('co_mode_saved', {m:t('co_m_' + m)}));
  },
  'co-recolor': () => recolorAll({onlyUnlocked:true}),
  'co-rules-open': () => { S.view = 'info'; S.infoTab = 'category'; UI.coRulesOpen = true; savePrefs(); renderAll(); const d = $('#co-rules-ov'); if (d) d.scrollIntoView({block:'nearest'}); },
  'co-cat-open': (el) => { if (typeof openCatColor === 'function') openCatColor(el.dataset.k); },
  'co-rule-new': () => { const M = UI.coCat; if (!M) return; M.adding = true; M.render(); },
  'co-rule-add': () => {
    const M = UI.coCat, i = $('#co-rule-kw'); if (!M || !i) return;
    const r = colorRuleNew(M.rules, colorShadesFor(M.fam, M.cur), i.value);
    if (r.error){ toast(t('co_rule_e_' + r.error, {n:COLOR_RULES_MAX}), 'warn'); return; }
    M.adding = false; M.changed(); M.render();
  },
  'co-rule-shade': (el) => { const M = UI.coCat, r = M && M.rules.find(x => x.id === el.dataset.id); if (!r) return; r.hex = el.dataset.c; M.changed(); M.render(); },
  'co-rule-del': (el) => { const M = UI.coCat; if (!M) return; M.rules = M.rules.filter(x => x.id !== el.dataset.id); M.changed(); M.render(); },
  'co-rule-mv': (el) => { const M = UI.coCat; if (!M) return; const i = M.rules.findIndex(x => x.id === el.dataset.id), j = i + (+el.dataset.d); if (i < 0 || j < 0 || j >= M.rules.length) return; const x = M.rules[i]; M.rules[i] = M.rules[j]; M.rules[j] = x; M.changed(); M.render(); },
  'ed-spectrum': (el) => {
    const d = UI.ed && UI.ed.d, cat = d && String(d.category || '').trim(); if (!cat || !COLOR_FAMILY[el.dataset.f]) return;
    const m = Object.assign({}, S.settings.catFamilies || {}); Object.keys(m).forEach(x => { if (colorKey(x) === colorKey(cat)) delete m[x]; });
    m[cat] = el.dataset.f; S.settings.catFamilies = m; colorTouch(); if (typeof infoApplyCatColors === 'function') infoApplyCatColors(); savePrefs(); edAutoColor();
  },
  'ed-color-auto': () => { const d = UI.ed && UI.ed.d; if (!d) return; d.color_locked = false; edAutoColor(); if (typeof edRefreshDerived === 'function') edRefreshDerived(); }
};

/* ---------------- Late registration (ACTIONS, HELP_TOPICS, LOG_FIELD_IT are defined in later files) ---------------- */
document.addEventListener('toggle', (e) => { if (e.target && e.target.id === 'co-rules-ov') UI.coRulesOpen = e.target.open; }, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target && e.target.id === 'co-rule-kw'){ e.preventDefault(); e.stopPropagation(); COLOR_ACTIONS['co-rule-add'](); }
}, true);
document.addEventListener('DOMContentLoaded', () => {
  if (typeof ACTIONS !== 'undefined') Object.assign(ACTIONS, COLOR_ACTIONS);
  if (typeof LOG_FIELD_IT !== 'undefined') LOG_FIELD_IT.color_locked = 'colore bloccato';
  if (typeof HELP_TOPICS === 'undefined') return;
  HELP_TOPICS.push({ id:'colors', guide:null, tags:['archive','label'], related:['info'],
    title:{it:'Colori dei dorsi: spettro, regole colore, clienti e colori bloccati', en:'Spine colours: spectrum, colour rules, clients and locked colours'},
    body:{it:'<p>Ogni faldone ha un colore (la barra sull\'etichetta e il dorso nella mappa). DocMap lo sceglie da solo, in due livelli:</p><ol><li><b>Spettro colore della categoria</b>: Rosso, Verde, Azzurro/Blu, Giallo, Arancione, Viola, Rosa, Nero/Grigi (più tre famiglie miste). Proposte iniziali: <b>APS → Rosso</b>, <b>ODV → Verde</b>, <b>ASD → Azzurro/Blu</b>, <b>ETS → Giallo</b>; si cambiano quando vuoi.</li><li><b>Regole colore</b> (fino a 10 per categoria): una parola chiave → una sfumatura precisa dello spettro. Esempio: categoria APS + "proloco" → tutte le Pro Loco hanno lo stesso rosso. Vale se la parola è nel nome del cliente o nel titolo del faldone; maiuscole, accenti, spazi e trattini non contano ("proloco" = "Pro Loco" = "PRO-LOCO"), ma deve essere una parola intera. Vince la prima regola dell\'elenco: usa le frecce per l\'ordine.</li></ol><p>Senza regola, in modalità <b>Per cliente</b> ogni cliente riceve una sua sfumatura dello spettro (sempre la stessa); <b>Per categoria</b> usa un colore per categoria; <b>Manuale</b> non colora in automatico.</p><p>Ordine: colore <b>bloccato</b> (scelto a mano, 🔒) → regola colore → sfumatura del cliente. Nel modulo del faldone clicca un colore per bloccarlo, <b>Automatico</b> per sbloccarlo.</p><p>Dove: <b>Informazioni › Categorie</b> → clic sul colore di una categoria: spettro, regole (<b>Aggiungi regola</b>, cambia sfumatura, frecce, cestino) e <b>Applica ai faldoni esistenti</b> (non bloccati, si può annullare). In cima alla scheda Categorie c\'è l\'elenco di tutte le <b>Regole colore</b>; in <b>Impostazioni › Colori dei dorsi</b> trovi modalità, il collegamento alle regole e <b>Ricolora tutti i faldoni</b>. Scrivendo una categoria nuova nel modulo del faldone puoi sceglierne subito lo spettro.</p>',
          en:'<p>Every binder has a colour (the bar on the label and the spine in the map). DocMap picks it for you, on two levels:</p><ol><li><b>Category colour spectrum</b>: Red, Green, Light blue/Blue, Yellow, Orange, Violet, Pink, Black/Greys (plus three mixed families). Starting suggestions: <b>APS → Red</b>, <b>ODV → Green</b>, <b>ASD → Light blue/Blue</b>, <b>ETS → Yellow</b>; change them whenever you like.</li><li><b>Colour rules</b> (up to 10 per category): a keyword → one specific shade of the spectrum. Example: category APS + "proloco" → every Pro Loco gets the same red. It applies when the word is in the client name or the binder title; case, accents, spaces and dashes do not matter ("proloco" = "Pro Loco" = "PRO-LOCO"), but it must be a whole word. The first rule in the list wins: use the arrows to reorder.</li></ol><p>Without a rule, in <b>By client</b> mode each client gets its own shade of the spectrum (always the same); <b>By category</b> uses one colour per category; <b>Manual</b> colours nothing automatically.</p><p>Order: <b>locked</b> colour (picked by hand, 🔒) → colour rule → client shade. In the binder form click a colour to lock it, <b>Automatic</b> to unlock it.</p><p>Where: <b>Information › Categories</b> → click a category colour: spectrum, rules (<b>Add rule</b>, change shade, arrows, bin) and <b>Apply to the existing binders</b> (not locked, can be undone). At the top of the Categories tab you find all the <b>Colour rules</b>; <b>Settings › Spine colours</b> has the mode, a link to the rules and <b>Recolour all binders</b>. When you type a new category in the binder form you can pick its spectrum right away.</p>'} });
});

/* Used by the bulk editor (05d-bulk.js) after a colour is set by hand: lock it like the editor does. */
function colorMarkManual(b){ if (b) b.color_locked = true; return b; }
