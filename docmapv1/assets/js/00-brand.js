/* =====================================================================
   Brand (white label), loaded right after brand.js in the <head> of index.html and scan.html.
   brand.js is the single source (docs/MARCHIO.md); this file only normalizes it and applies it:
     BRAND                 normalized brand object (same fields and neutral defaults as tools/brand.py)
     brandName()           product name for any visible text (never write a product name in a string: lint rule)
     brandTagline(lang)    one-line description, in the interface language
     brandCopyright()      «© 2026 Vendor» from the brand template
     brandFile(base, ext)  download file name with the brand prefix, e.g. brandFile('backup', 'json')
   Colours: an empty primary_color keeps the palette of css-tokens.css; a colour #RRGGBB derives every --brand-* token
   for the light and the dark theme. Printing keeps the light values (css-tokens.css rule).
   ===================================================================== */
const BRAND = (function(){
  const D = { product_name:'Archivio documenti', short_name:'', mark:'', edition:'', tagline:{it:'', en:''}, logo_url:'',
    primary_color:'', vendor_name:'', vendor_legal:'', vendor_vat:'', vendor_address:'', website:'', support_email:'',
    support_phone:'', privacy_url:'', terms_url:'', copyright:'', hub_name:'Hub', file_prefix:'', languages:['it', 'en'],
    default_language:'it' };
  const SUPPORTED = ['it', 'en'];
  const src = (typeof window !== 'undefined' && window.DOCMAP_BRAND && typeof window.DOCMAP_BRAND === 'object') ? window.DOCMAP_BRAND : {};
  const b = Object.assign({}, D);
  Object.keys(src).forEach(k => {
    const v = src[k];
    if (v === null || v === undefined || k === 'qr_base' || k === 'qrBase') return;
    if (k === 'tagline') b.tagline = Object.assign({}, D.tagline, typeof v === 'string' ? {it:v, en:v} : v);
    else b[k] = v;
  });
  if (!String(b.product_name || '').trim()) b.product_name = D.product_name;
  b.short_name = b.short_name || b.product_name;
  b.file_prefix = b.file_prefix || String(b.product_name).replace(/[^A-Za-z0-9]+/g, '') || 'Archivio';
  b.vendor_name = b.vendor_name || b.product_name;
  b.languages = (Array.isArray(b.languages) ? b.languages : []).filter(l => SUPPORTED.indexOf(l) >= 0);
  if (!b.languages.length) b.languages = ['it'];
  if (b.languages.indexOf(b.default_language) < 0) b.default_language = b.languages[0];
  if (!/^#[0-9a-fA-F]{6}$/.test(String(b.primary_color || ''))) b.primary_color = '';
  b.mark = String(b.mark || '').slice(0, 4);
  return Object.freeze(b);
})();

function brandName(){ return BRAND.product_name; }
function brandTagline(lang){
  const t = BRAND.tagline || {};
  return t[lang || (typeof S !== 'undefined' && S && S.lang) || BRAND.default_language] || t[BRAND.default_language] || '';
}
function brandCopyright(){
  return String(BRAND.copyright || '').replace('{year}', String(new Date().getFullYear())).replace('{vendor}', BRAND.vendor_name);
}
function brandMark(){
  if (BRAND.mark) return BRAND.mark;
  const w = String(BRAND.product_name).split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : String(BRAND.product_name).slice(0, 2)).toUpperCase();
}
/* Logo (logo_url) or the text mark, as HTML for the brand box of the top bar, the sign-in card and the phone. */
function brandMarkHtml(cls, tag){
  const e = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]);
  const t = tag || 'span';
  if (BRAND.logo_url) return '<' + t + ' class="' + e(cls) + ' brand-logo" aria-hidden="true"><img src="' + e(BRAND.logo_url) + '" alt=""></' + t + '>';
  return '<' + t + ' class="' + e(cls) + '" aria-hidden="true">' + e(brandMark()) + '</' + t + '>';
}
function brandFile(base, ext){ return BRAND.file_prefix + '_' + base + (ext ? '.' + ext : ''); }

/* Colour tokens from primary_color (no-op when empty). */
function brandColorCss(hex){
  if (!/^#[0-9a-fA-F]{6}$/.test(String(hex || ''))) return '';
  const rgb = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16));
  const mix = (to, w) => '#' + rgb.map((c, i) => Math.round(c + (to[i] - c) * w).toString(16).padStart(2, '0')).join('').toUpperCase();
  const W = [255, 255, 255], K = [0, 0, 0];
  const light = '--brand:' + hex + ';--brand-strong:' + mix(K, .15) + ';--brand-ink:' + mix(K, .5) + ';--brand-weak:' + mix(W, .92) +
    ';--brand-line:' + mix(W, .7) + ';--accent-ring:rgba(' + rgb.join(',') + ',.24);';
  const dark = '--brand:' + mix(W, .35) + ';--brand-strong:' + mix(W, .15) + ';--brand-ink:' + mix(W, .7) + ';--brand-weak:' + mix(K, .7) +
    ';--brand-line:' + mix(K, .45) + ';--accent-ring:rgba(' + rgb.join(',') + ',.35);';
  return ':root{' + light + '}' +
    '@media screen and (prefers-color-scheme:dark){:root:not([data-theme="light"]){' + dark + '}}' +
    '@media screen{:root[data-theme="dark"]{' + dark + '}}';
}

(function brandApply(){
  if (typeof document === 'undefined') return;
  try {
    const css = brandColorCss(BRAND.primary_color);
    if (css){ const st = document.createElement('style'); st.id = 'brand-colors'; st.textContent = css; document.head.appendChild(st); }
    const page = /scan\.html/i.test(location.pathname) ? 'phone' : 'pc';
    const tag = brandTagline(BRAND.default_language);
    document.title = page === 'phone' || !tag ? BRAND.product_name : BRAND.product_name + ' — ' + tag;
  } catch(e){ /* the brand must never stop the program */ }
})();
