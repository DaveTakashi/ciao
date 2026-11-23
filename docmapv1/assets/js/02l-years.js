/* =====================================================================
   DocMap 2026 — v12.11 shared pure helpers for the yearly work (index.html, after 02k-finder.js):
   «Nuovo anno in un clic» (06w-newyear.js), «Scarto proposto» (06x-retention.js), «Dove lo metto?» (06y-place.js).

   - Years of a binder: every 4-digit year in ref_year (2024 · 2024-2025 · 2024/25 · 2024-25) and in the years of
     its contents items. yrList(b) sorted, yrMax(b) = the last one (0 when none).
   - Client key: Codice Multi when present (never invented, only compared), otherwise the folded company name.
   - Series: binders of the same client, category and title once the years are taken out of the title
     ("Fatture 2025" and "Fatture 2026" are the same series). One series = one binder per year.
   - yrShift(text, from, to): replaces the year `from` with `to` inside a text (titles, tags, ref_year, contents),
     also in the forms 2025-26 / 2025/2026, without touching other numbers.
   ===================================================================== */
'use strict';

const YR_MIN = 1900, YR_MAX = 2199;
const yrOk = (y) => y >= YR_MIN && y <= YR_MAX;
/** Years written in a text: 2024 · 2024-2025 · 2024/25 · 2024-25 (two digits after a full year = same century). */
function yrFromText(s){
  const out = [], str = String(s == null ? '' : s);
  const re = /(^|[^\d])((?:19|20|21)\d{2})(?:\s*[-\/–]\s*(\d{4}|\d{2}))?(?!\d)/g;
  let m;
  while ((m = re.exec(str))){
    const a = +m[2]; if (yrOk(a)) out.push(a);
    if (m[3]){ let b = +m[3]; if (m[3].length === 2) b = Math.floor(a / 100) * 100 + b; if (yrOk(b) && b >= a && b - a <= 50) out.push(b); }
  }
  return out;
}
function yrList(b){
  if (!b) return [];
  const set = new Set(yrFromText(b.ref_year));
  (b.contents_items || []).forEach(i => yrFromText(i && i.year).forEach(y => set.add(y)));
  return Array.from(set).sort((x, y) => x - y);
}
const yrMax = (b) => { const l = yrList(b); return l.length ? l[l.length - 1] : 0; };
const yrMin = (b) => { const l = yrList(b); return l.length ? l[0] : 0; };
const yrFold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Client of a binder: Codice Multi first (compared, never created), else the company name without spaces / accents. */
function yrClientKey(b){
  const m = String((b && b.multi_code) || '').trim().toLowerCase();
  if (m) return 'm:' + m.replace(/\s+/g, '');
  const c = yrFold(b && b.company_name).replace(/[^a-z0-9Ͱ-Ͽ]+/g, '');
  return c ? 'c:' + c : '';
}
/** Title without its years and punctuation: the "kind" of binder inside a client. */
function yrTitleKey(title){
  return yrFold(title).replace(/(^|[^\d])((?:19|20|21)\d{2})(?:\s*[-\/–]\s*(?:\d{4}|\d{2}))?(?!\d)/g, '$1 ').replace(/\b(anno|year)\b/g, ' ').replace(/[^a-z0-9Ͱ-Ͽ]+/g, ' ').trim();
}
function yrSeriesKey(b){ const c = yrClientKey(b); return c ? c + '|' + yrFold(b.category).trim() + '|' + yrTitleKey(b.binder_title) : ''; }
/** Replace the year `from` with `to` in a text (2025 → 2026, 2025-26 → 2026-27, 2025/2026 → 2026/2027). */
function yrShift(s, from, to){
  const str = String(s == null ? '' : s); if (!from || !to || from === to) return str;
  const d = to - from;
  return str.replace(/(^|[^\d])((?:19|20|21)\d{2})(?:(\s*[-\/–]\s*)(\d{4}|\d{2}))?(?!\d)/g, (all, pre, a, sep, b) => {
    const A = +a;
    if (!b) return A === from ? pre + to : all;
    let B = +b; const two = b.length === 2; if (two) B = Math.floor(A / 100) * 100 + B;
    if (A !== from && B !== from) return all;
    const nb = B + d;
    return pre + (A + d) + sep + (two ? String(nb % 100).padStart(2, '0') : nb);
  });
}
/** Live binders (not removed by a disposal): S.binders itself. Kept as a function so later modules can filter. */
function yrLive(){ return (typeof S !== 'undefined' && S && Array.isArray(S.binders)) ? S.binders : []; }
