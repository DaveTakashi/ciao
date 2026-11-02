/* =====================================================================
   DocMap 2026 (DM26) — 06n-tape.js (v12.3)
   Label printers with tape or rolls (Brother P-touch / QL, Dymo, Zebra, Niimbot, Epson…) next to the A4 sheets:
     • TAPE_FORMATS: catalogue of common tapes / rolls / die-cut labels; tapeSearch() looks for a free text
       (brand, name, standard, "62x100", "24 mm", "rotolo"…) in it AND in the A4 sheet presets;
     • sources: binders selected for print, a location with the ones inside it, or the "location strip":
       location label + every binder in it (nested boxes too), in order, one after the other;
     • each label: QR + one or two fields chosen by the user (code, title, company, Codice Multi, location…);
     • output: one page per label (die-cut / cut after each label) or one continuous strip (long tape);
       pages are sized in mm with named @page rules, optionally turned by 90° for the drivers that feed portrait.
   State: S.print.tape (saved with the print settings). The print view shows a switch "Fogli A4 | Etichettatrice".
   Pure helpers (tapeSearch, tapeItems, tapeLayout) are used by tests/suite.js.
   ===================================================================== */
'use strict';

/* across = height of the label across the feed (tape width), along = length in the feed direction (0 = continuous,
   the length follows the text). pa = printable height across (indicative, the driver decides: adjustable). */
const TAPE_FORMATS = [
  // Brother P-touch TZe (laminated tape, continuous)
  {id:'tze-6',  brand:'Brother', series:'P-touch TZe', name:'Nastro TZe 6 mm',  across:6,  along:0, pa:4.5,  kw:'ptouch p-touch pt-p710bt pt-h110 pt-e550w laminato'},
  {id:'tze-9',  brand:'Brother', series:'P-touch TZe', name:'Nastro TZe 9 mm',  across:9,  along:0, pa:7,    kw:'ptouch p-touch pt-p710bt pt-h110 pt-e550w laminato'},
  {id:'tze-12', brand:'Brother', series:'P-touch TZe', name:'Nastro TZe 12 mm', across:12, along:0, pa:9.5,  kw:'ptouch p-touch pt-p710bt pt-h110 pt-e550w laminato'},
  {id:'tze-18', brand:'Brother', series:'P-touch TZe', name:'Nastro TZe 18 mm', across:18, along:0, pa:15.5, kw:'ptouch p-touch pt-p710bt pt-e550w laminato'},
  {id:'tze-24', brand:'Brother', series:'P-touch TZe', name:'Nastro TZe 24 mm', across:24, along:0, pa:18,   kw:'ptouch p-touch pt-p710bt pt-e550w pt-p750w laminato', rec:1},
  {id:'tze-36', brand:'Brother', series:'P-touch TZe', name:'Nastro TZe 36 mm', across:36, along:0, pa:27,   kw:'ptouch p-touch pt-p900w pt-p950nw laminato'},
  // Brother QL (DK rolls)
  {id:'dk-22205', brand:'Brother', series:'QL DK', name:'DK-22205 continuo 62 mm',  across:62,  along:0, pa:58,  turn:1, kw:'ql-800 ql-820nwb ql-700 ql-1110 rotolo carta continua'},
  {id:'dk-22210', brand:'Brother', series:'QL DK', name:'DK-22210 continuo 29 mm',  across:29,  along:0, pa:25.5, turn:1, kw:'ql-800 ql-820nwb ql-700 rotolo carta continua'},
  {id:'dk-22225', brand:'Brother', series:'QL DK', name:'DK-22225 continuo 38 mm',  across:38,  along:0, pa:34.5, turn:1, kw:'ql-800 ql-820nwb ql-700 rotolo carta continua'},
  {id:'dk-22214', brand:'Brother', series:'QL DK', name:'DK-22214 continuo 12 mm',  across:12,  along:0, pa:10,  turn:1, kw:'ql-800 ql-700 rotolo carta continua'},
  {id:'dk-22243', brand:'Brother', series:'QL DK', name:'DK-22243 continuo 102 mm', across:102, along:0, pa:98,  turn:1, kw:'ql-1100 ql-1110nwb rotolo carta continua largo'},
  {id:'dk-11201', brand:'Brother', series:'QL DK', name:'DK-11201 indirizzi 29×90',   across:29, along:90,  turn:1, kw:'ql-800 ql-700 fustellate indirizzo standard'},
  {id:'dk-11209', brand:'Brother', series:'QL DK', name:'DK-11209 indirizzi piccole 29×62', across:29, along:62, turn:1, kw:'ql-800 ql-700 fustellate indirizzo'},
  {id:'dk-11208', brand:'Brother', series:'QL DK', name:'DK-11208 indirizzi grandi 38×90', across:38, along:90, turn:1, kw:'ql-800 ql-700 fustellate indirizzo'},
  {id:'dk-11202', brand:'Brother', series:'QL DK', name:'DK-11202 spedizione 62×100', across:62, along:100, turn:1, kw:'ql-800 ql-700 fustellate spedizione'},
  {id:'dk-11204', brand:'Brother', series:'QL DK', name:'DK-11204 multiuso 17×54',     across:17, along:54,  turn:1, kw:'ql-800 ql-700 fustellate multiuso'},
  {id:'dk-11203', brand:'Brother', series:'QL DK', name:'DK-11203 cartelle 17×87',     across:17, along:87,  turn:1, kw:'ql-800 ql-700 fustellate cartelle archivio dorso'},
  {id:'dk-11221', brand:'Brother', series:'QL DK', name:'DK-11221 quadrate 23×23',     across:23, along:23,  turn:1, kw:'ql-800 ql-700 fustellate quadrate piccole'},
  // Dymo LabelWriter (die-cut rolls)
  {id:'dymo-99010', brand:'Dymo', series:'LabelWriter', name:'99010 indirizzi 28×89',        across:28, along:89,  turn:1, kw:'labelwriter 450 550 4xl s0722370 fustellate indirizzo'},
  {id:'dymo-99012', brand:'Dymo', series:'LabelWriter', name:'99012 indirizzi grandi 36×89', across:36, along:89,  turn:1, kw:'labelwriter 450 550 s0722400 fustellate indirizzo'},
  {id:'dymo-11354', brand:'Dymo', series:'LabelWriter', name:'11354 multiuso 32×57',         across:32, along:57,  turn:1, kw:'labelwriter 450 550 s0722540 fustellate multiuso'},
  {id:'dymo-11355', brand:'Dymo', series:'LabelWriter', name:'11355 multiuso 19×51',         across:19, along:51,  turn:1, kw:'labelwriter 450 550 s0722550 fustellate multiuso'},
  {id:'dymo-11352', brand:'Dymo', series:'LabelWriter', name:'11352 indirizzo mittente 25×54', across:25, along:54, turn:1, kw:'labelwriter 450 550 s0722520 fustellate'},
  {id:'dymo-11353', brand:'Dymo', series:'LabelWriter', name:'11353 multiuso 13×25',         across:13, along:25,  turn:1, kw:'labelwriter 450 550 s0722530 fustellate piccole'},
  {id:'dymo-99017', brand:'Dymo', series:'LabelWriter', name:'99017 cartelle sospese 12×50',  across:12, along:50,  turn:1, kw:'labelwriter 450 550 s0722460 fustellate cartelle archivio'},
  {id:'dymo-99014', brand:'Dymo', series:'LabelWriter', name:'99014 spedizione 54×101',       across:54, along:101, turn:1, kw:'labelwriter 450 550 s0722430 fustellate spedizione'},
  {id:'dymo-s0904980', brand:'Dymo', series:'LabelWriter 4XL', name:'S0904980 spedizione 104×159', across:104, along:159, turn:1, kw:'labelwriter 4xl 5xl 1744907 fustellate spedizione'},
  // Dymo LabelManager D1 (tape)
  {id:'d1-9',  brand:'Dymo', series:'D1', name:'Nastro D1 9 mm',  across:9,  along:0, pa:6.5, kw:'labelmanager 280 420p 500ts nastro'},
  {id:'d1-12', brand:'Dymo', series:'D1', name:'Nastro D1 12 mm', across:12, along:0, pa:9,   kw:'labelmanager 160 280 420p 500ts nastro'},
  {id:'d1-19', brand:'Dymo', series:'D1', name:'Nastro D1 19 mm', across:19, along:0, pa:15,  kw:'labelmanager 420p 500ts nastro'},
  {id:'d1-24', brand:'Dymo', series:'D1', name:'Nastro D1 24 mm', across:24, along:0, pa:18,  kw:'labelmanager 500ts nastro'},
  // Epson LabelWorks (LK tape)
  {id:'lk-12', brand:'Epson', series:'LabelWorks LK', name:'Nastro LK 12 mm', across:12, along:0, pa:9,  kw:'lw-c410 lw-z5000 nastro'},
  {id:'lk-18', brand:'Epson', series:'LabelWorks LK', name:'Nastro LK 18 mm', across:18, along:0, pa:14, kw:'lw-c610 lw-z5000 nastro'},
  {id:'lk-24', brand:'Epson', series:'LabelWorks LK', name:'Nastro LK 24 mm', across:24, along:0, pa:18, kw:'lw-c610 lw-z5000 nastro'},
  {id:'lk-36', brand:'Epson', series:'LabelWorks LK', name:'Nastro LK 36 mm', across:36, along:0, pa:28, kw:'lw-z5000 nastro'},
  // Zebra / thermal transfer & direct thermal rolls (also TSC, Honeywell, Brother TD)
  {id:'zb-102x152', brand:'Zebra', series:'Rotolo termico', name:'Etichette 102×152 (4×6")', across:102, along:152, turn:1, kw:'zd420 zd421 gk420 tsc honeywell brother td-4 spedizione 4x6'},
  {id:'zb-102x102', brand:'Zebra', series:'Rotolo termico', name:'Etichette 102×102 (4×4")', across:102, along:102, turn:1, kw:'zd420 gk420 tsc honeywell 4x4 quadrate'},
  {id:'zb-102x51',  brand:'Zebra', series:'Rotolo termico', name:'Etichette 102×51 (4×2")',  across:51,  along:102, turn:1, kw:'zd420 gk420 tsc honeywell 4x2 magazzino'},
  {id:'zb-76x51',   brand:'Zebra', series:'Rotolo termico', name:'Etichette 76×51 (3×2")',   across:51,  along:76,  turn:1, kw:'zd420 gk420 tsc honeywell 3x2'},
  {id:'zb-100x50',  brand:'Zebra', series:'Rotolo termico', name:'Etichette 100×50',         across:50,  along:100, turn:1, kw:'zd420 gk420 tsc honeywell godex magazzino scaffale'},
  {id:'zb-57x32',   brand:'Zebra', series:'Rotolo termico', name:'Etichette 57×32 (2,25×1,25")', across:32, along:57, turn:1, kw:'zd410 zd420 tsc honeywell prezzi codici a barre'},
  {id:'zb-51x25',   brand:'Zebra', series:'Rotolo termico', name:'Etichette 51×25 (2×1")',   across:25,  along:51,  turn:1, kw:'zd410 zd420 tsc honeywell codici a barre piccole'},
  {id:'zb-38x25',   brand:'Zebra', series:'Rotolo termico', name:'Etichette 38×25 (1,5×1")', across:25,  along:38,  turn:1, kw:'zd410 tsc honeywell piccole'},
  {id:'zb-25x25',   brand:'Zebra', series:'Rotolo termico', name:'Etichette 25×25 (1×1")',   across:25,  along:25,  turn:1, kw:'zd410 tsc honeywell quadrate piccole qr'},
  // Pocket Bluetooth printers (print the PDF from their app)
  {id:'nb-50x30', brand:'Niimbot', series:'B1 / B21 / B3S', name:'Etichette 50×30', across:30, along:50, turn:1, kw:'niimbot phomemo m110 m220 marklife bluetooth tascabile'},
  {id:'nb-40x30', brand:'Niimbot', series:'B1 / B21 / B3S', name:'Etichette 40×30', across:30, along:40, turn:1, kw:'niimbot phomemo m110 m220 marklife bluetooth tascabile'},
  {id:'nb-50x20', brand:'Niimbot', series:'B1 / B21 / B3S', name:'Etichette 50×20', across:20, along:50, turn:1, kw:'niimbot phomemo m110 bluetooth tascabile'},
  {id:'nb-30x15', brand:'Niimbot', series:'D11 / D110', name:'Etichette 30×15', across:15, along:30, turn:1, kw:'niimbot d11 d110 d101 phomemo d30 bluetooth tascabile piccole'},
  {id:'nb-12x40', brand:'Niimbot', series:'D11 / D110', name:'Etichette 12×40', across:12, along:40, turn:1, kw:'niimbot d11 d110 phomemo d30 bluetooth tascabile cavi'},
  {id:'ph-40x30', brand:'Phomemo', series:'M110 / M120', name:'Etichette 40×30', across:30, along:40, turn:1, kw:'phomemo m110 m120 m200 bluetooth tascabile'}
];
const TAPE_MAX_PAGE = 900;   // mm: a continuous strip is split in pages of at most this length (drivers limit ~1 m)
const TAPE_FIELDS_B = ['code', 'title', 'company', 'multi', 'short', 'loc', 'none'];
const TAPE_FIELDS_L = ['code', 'seg', 'name', 'path', 'short', 'none'];
const TAPE_DEFAULTS = {on:false, fmt:'tze-24', len:0, pa:0, src:'sel', locId:'', sub:true, main:'code', second:'company', lmain:'code', lsecond:'name', out:'pages', turn:'auto', cuts:true, gap:2, copies:1, qr:true, q:''};

function tapeOpts(){ const o = Object.assign({}, TAPE_DEFAULTS, (S.print && S.print.tape) || {}); o.copies = clamp(parseInt(o.copies, 10) || 1, 1, 20); o.gap = clamp(+o.gap || 0, 0, 20); o.len = clamp(+o.len || 0, 0, 500); o.pa = clamp(+o.pa || 0, 0, 120); return o; }
function tapeSet(patch){ S.print.tape = Object.assign(tapeOpts(), patch || {}); savePrefs(); }
function tapeFmt(id){ return TAPE_FORMATS.find(f => f.id === id) || TAPE_FORMATS.find(f => f.rec) || TAPE_FORMATS[0]; }
function tapeIsCont(f){ return !(f.along > 0); }
function tapeFmtDims(f){ return tapeIsCont(f) ? fmtMM(f.across) + ' mm · ' + t('tap_cont') : fmtMM(f.across) + '×' + fmtMM(f.along) + ' mm'; }

/* ---------------- free-text search over tapes + A4 sheets ---------------- */
function tapeNorm(s){ return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/(\d),(\d)/g, '$1.$2').replace(/(\d)\s*[x×*]\s*(?=\d)/g, '$1x').replace(/(\d)\s*mm\b/g, '$1'); }
/* Search entries: {id, src:'tape'|'a4', name, brand, std, dims:[mm…], text, ref} */
function tapeCatalog(){
  const tapes = TAPE_FORMATS.map(f => ({id:f.id, src:'tape', brand:f.brand, std:f.series, name:f.name, dims:[f.across, f.along, f.pa].filter(x => x > 0), cont:tapeIsCont(f), ref:f,
    text:tapeNorm([f.brand, f.series, f.name, f.id, f.kw, tapeIsCont(f) ? 'continuo nastro rotolo continuous tape roll ' + f.across + ' ' + f.across + 'mm' : 'fustellate rotolo die-cut roll ' + f.across + 'x' + f.along + ' ' + f.along + 'x' + f.across].join(' '))}));
  const sheets = (typeof allPresets === 'function' ? allPresets() : []).map(p => ({id:p.id, src:'a4', brand:/avery/i.test(p.name) ? 'Avery' : /mrink/i.test(p.name) ? 'MRINK' : '', std:'A4', name:p.name, dims:[p.w, p.h * Math.max(1, p.group | 0)], ref:p,
    text:tapeNorm([p.name, p.id, 'a4 foglio fogli sheet ' + (p.kind === 'full' ? 'adesivo intero da tagliare' : 'fustellate'), p.w + 'x' + p.h, p.h + 'x' + p.w, (p.cols * p.rows) + ' etichette', 'herma tico apli'].join(' '))}));
  return tapes.concat(sheets);
}
/** Ranked matches for a free text: every word must be found; numbers also match a size within ±0.6 mm. */
function tapeSearch(q, limit){
  const cat = tapeCatalog(), words = tapeNorm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return cat.filter(e => e.src === 'tape').slice(0, limit || 400);
  const out = [];
  cat.forEach(e => {
    let score = 0;
    for (const w of words){
      const m = /^(\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?$/.exec(w);
      if (m){
        const a = +m[1], b = m[2] != null ? +m[2] : null, near = (x, y) => Math.abs(x - y) <= 0.6;
        const ok = b == null ? e.dims.some(d => near(d, a)) : (e.dims.length >= 2 && ((near(e.dims[0], a) && near(e.dims[1], b)) || (near(e.dims[0], b) && near(e.dims[1], a))));
        if (ok){ score += b == null ? 3 : 6; continue; }
        if (e.text.includes(w)){ score += 1; continue; }
        return;
      }
      const i = e.text.indexOf(w);
      if (i < 0) return;
      score += (i === 0 || e.text[i - 1] === ' ' ? 2 : 1);
    }
    if (e.ref && (e.ref.rec || e.ref.recommended)) score += 0.5;
    out.push({e, score});
  });
  return out.sort((x, y) => y.score - x.score || (x.e.src === y.e.src ? 0 : x.e.src === 'tape' ? -1 : 1)).slice(0, limit || 400).map(x => x.e);
}

/* ---------------- items: what goes on the tape ---------------- */
function tapeLocOrder(rootId, sub){
  if (typeof locArr !== 'function') return [];
  if (rootId && !locById(rootId)) return [];
  if (!rootId) { const out = []; const go = (p) => locChildren(p).forEach(c => { out.push(c); go(c.id); }); go(''); return out; }
  return [locById(rootId)].concat(sub ? locDescendants(rootId).map(locById).filter(Boolean) : []);
}
function tapeBinderText(b, f){
  switch (f){
    case 'code': return b.speaking_code || '';
    case 'title': return b.binder_title || '';
    case 'company': return b.company_name || '';
    case 'multi': return b.multi_code ? 'MULTI ' + b.multi_code : '';
    case 'short': return 'qr7.it/' + (b.short_code || '');
    case 'loc': { const l = b.location_id && typeof locById === 'function' ? locById(b.location_id) : null; return l ? l.code : ''; }
    default: return '';
  }
}
function tapeLocText(l, f){
  switch (f){
    case 'code': return l.code || '';
    case 'seg': return l.seg || l.code || '';
    case 'name': return l.name || locKind(l) || '';
    case 'path': return locPathText(l.id);
    case 'short': return 'qr7.it/' + (l.short_code || '');
    default: return '';
  }
}
function tapeBinderItem(b, o){ return {kind:'b', id:b.id, url:b.short_url || shortUrl(b.short_code), main:tapeBinderText(b, o.main) || b.speaking_code || '—', second:o.second === o.main ? '' : tapeBinderText(b, o.second), color:b.color_hex || '#000'}; }
function tapeLocItem(l, o){ return {kind:'l', id:l.id, url:l.short_url || shortUrl(l.short_code), main:tapeLocText(l, o.lmain) || l.code, second:o.lsecond === o.lmain ? '' : tapeLocText(l, o.lsecond), cap:String(locKind(l) || '').toUpperCase()}; }
/** Ordered list of labels for the current options. 'strip' = each location followed by the binders it holds. */
function tapeItems(o){
  o = o || tapeOpts();
  const out = [], rep = (it) => { for (let i = 0; i < o.copies; i++) out.push(it); };
  if (o.src === 'sel'){ printQueueBinders().forEach(b => rep(tapeBinderItem(b, o))); return out; }
  const locs = tapeLocOrder(o.locId, o.sub !== false);
  if (o.src === 'locs'){ locs.forEach(l => rep(tapeLocItem(l, o))); return out; }
  locs.forEach(l => {   // 'strip'
    out.push(tapeLocItem(l, o));
    S.binders.filter(b => b.location_id === l.id && !(S.settings.hideDemo && isDemo(b))).sort((a, b) => naturalCmp(a.speaking_code, b.speaking_code)).forEach(b => out.push(tapeBinderItem(b, o)));
  });
  return out;
}

/* ---------------- geometry ---------------- */
function tapeTextW(text, fs, mono, bold){
  const html = '<span style="font-weight:' + (bold ? 800 : 600) + '">' + esc(text) + '</span>', cls = mono ? 'lmono' : 'ln';
  const pr = typeof fitProbe === 'function' ? fitProbe() : null;
  if (pr){ pr.innerHTML = '<div class="' + cls + '" style="display:inline-block;white-space:nowrap;font-size:10mm;line-height:1">' + html + '</div>'; const wp = pr.firstChild.getBoundingClientRect().width; if (wp) return wp / PXMM * fs / 10; }
  return String(text).length * fs * (mono ? 0.62 : 0.56);
}
const tapeMonoField = (it, o) => it.kind === 'l' ? ['code', 'seg', 'short'].includes(o.lmain) : ['code', 'short', 'multi'].includes(o.main);
/** Label size in the reading frame (W along the feed, H across) and the inner metrics of one item. */
function tapeCellGeo(it, f, o){
  const H = o.pa > 0 ? Math.min(o.pa, f.across) : (f.pa || f.across);
  const pad = clamp(H * 0.07, 0.5, 3), ih = H - 2 * pad;
  const q = o.qr ? ih : 0, gap = q ? clamp(H * 0.08, 0.8, 3) : 0;
  const capH = it.kind === 'l' ? ih * 0.2 : 0;
  const fm = (ih - capH) * (it.second ? 0.46 : 0.6), fs = fm * 0.62;
  const mono = tapeMonoField(it, o);
  const natural = Math.max(tapeTextW(it.main, fm, mono, true), it.second ? tapeTextW(it.second, fs, false, false) : 0, capH ? tapeTextW(it.cap, capH * 0.72, false, true) + capH : 0);
  const bar = it.kind === 'l' ? clamp(H * 0.12, 1, 4) : 0;
  let W;
  if (!tapeIsCont(f)) W = f.along;
  else if (o.len > 0) W = o.len;
  else W = clamp(pad + bar + q + gap + natural + pad * 1.6, H, 200);
  return {W, H, pad, q, gap, fm, fs, capH, bar, mono, natural};
}
/** Pages to print: [{w, h, cells:[{it, x, g}]}] in the reading frame (w along the feed). */
function tapeLayout(items, o){
  o = o || tapeOpts(); const f = tapeFmt(o.fmt), cont = tapeIsCont(f);
  const geos = items.map(it => tapeCellGeo(it, f, o));
  if (o.out === 'strip' && cont){
    const pages = []; let cur = null;
    items.forEach((it, i) => {
      const g = geos[i], need = g.W + (cur && cur.cells.length ? o.gap : 0);
      if (!cur || (cur.cells.length && cur.w + need > TAPE_MAX_PAGE)){ cur = {w:0, h:f.across, cells:[]}; pages.push(cur); }
      const x = cur.cells.length ? cur.w + o.gap : 0;
      cur.cells.push({it, x, y:(f.across - g.H) / 2, g}); cur.w = x + g.W;
    });
    return pages;
  }
  // one label per page (page = whole tape width, the printable band centred); on continuous tape all labels get the
  // length of the longest one, so every page has the same size
  const Wmax = geos.reduce((m, g) => Math.max(m, g.W), 0);
  return items.map((it, i) => { const g = Object.assign({}, geos[i]); if (cont) g.W = Wmax; return {w:g.W, h:f.across, cells:[{it, x:0, y:(f.across - g.H) / 2, g}]}; });
}
function tapeTurned(o){ const f = tapeFmt(o.fmt); return o.turn === 'yes' || (o.turn === 'auto' && !!f.turn); }
/** Smallest QR module in mm (for the quality hint): phones read ≥ 0.33 mm well, < 0.25 mm badly. */
function tapeModuleMM(pages){
  let min = Infinity;
  pages.forEach(p => p.cells.forEach(c => { if (!c.g.q) return; let n = 29; try { n = DMQR.encode(c.it.url, S.settings.qrEcc || 'M').size; } catch(e){} min = Math.min(min, c.g.q / (n + 2)); }));
  return min === Infinity ? 0 : min;
}

/* ---------------- rendering ---------------- */
function tapeCellHTML(c, o){
  const it = c.it, g = c.g, H = g.H, x0 = g.pad + g.bar;
  let h = '<div class="tp-cell' + (it.kind === 'l' ? ' tp-loc' : '') + '" style="left:' + MM(c.x) + ';top:' + MM(c.y || 0) + ';width:' + MM(g.W) + ';height:' + MM(H) + '">';
  if (g.bar) h += '<div class="tp-bar" style="width:' + MM(g.bar) + '"></div>';
  if (g.q){ let svg = ''; try { svg = DMQR.svg(it.url, {ecl:S.settings.qrEcc || 'M', quiet:1, fg:'#000'}); } catch(e){} h += '<div class="tp-qr" style="left:' + MM(x0) + ';top:' + MM(g.pad) + ';width:' + MM(g.q) + ';height:' + MM(g.q) + '">' + svg + '</div>'; }
  const tx = x0 + g.q + g.gap, tw = Math.max(2, g.W - tx - g.pad);
  const k = Math.min(1, tw / Math.max(0.1, g.natural));   // fixed length shorter than the text: shrink to fit
  h += '<div class="tp-tx" style="left:' + MM(tx) + ';top:' + MM(g.pad) + ';width:' + MM(tw) + ';height:' + MM(H - 2 * g.pad) + '">' +
    (g.capH ? '<div class="tp-cap" style="font-size:' + MM(g.capH * 0.72 * k) + ';height:' + MM(g.capH) + '">' + esc(it.cap) + '</div>' : '') +
    '<div class="tp-main' + (g.mono ? ' lmono' : '') + '" style="font-size:' + MM(g.fm * k) + '">' + esc(it.main) + '</div>' +
    (it.second ? '<div class="tp-sec" style="font-size:' + MM(g.fs * k) + '">' + esc(it.second) + '</div>' : '') + '</div>';
  return h + '</div>';
}
function tapePageInner(p, o){
  const cuts = o.cuts && p.cells.length > 1 ? p.cells.slice(1).map(c => '<div class="tp-cut" style="left:' + MM(c.x - o.gap / 2) + '"></div>').join('') : '';
  return '<div class="tp-strip" style="width:' + MM(p.w) + ';height:' + MM(p.h) + '">' + p.cells.map(c => tapeCellHTML(c, o)).join('') + cuts + '</div>';
}
/** Printable pages: [{w, h, html}] in PAGE coordinates (turned by 90° when the driver feeds portrait). */
function tapePages(o){
  o = o || tapeOpts();
  const L = tapeLayout(tapeItems(o), o), turn = tapeTurned(o);
  return L.map(p => turn
    ? {w:p.h, h:p.w, html:'<div class="tp-turn" style="left:' + MM(p.h) + ';width:' + MM(p.w) + ';height:' + MM(p.h) + '">' + tapePageInner(p, o) + '</div>'}
    : {w:p.w, h:p.h, html:tapePageInner(p, o)});
}
function tapePrintHTML(pages){
  const sizes = [], css = [];
  const html = pages.map(p => {
    const key = r1(p.w) + 'x' + r1(p.h); let i = sizes.indexOf(key);
    if (i < 0){ i = sizes.length; sizes.push(key); css.push('@page tp' + i + '{size:' + MM(p.w) + ' ' + MM(p.h) + ';margin:0}.tp-page.tp' + i + '{page:tp' + i + '}'); }
    return '<div class="tp-page tp' + i + '" style="width:' + MM(p.w) + ';height:' + MM(p.h) + '">' + p.html + '</div>';
  }).join('');
  const first = pages[0] ? '@page{size:' + MM(pages[0].w) + ' ' + MM(pages[0].h) + ';margin:0}' : '';
  return {css:first + css.join(''), html};
}
async function tapePrint(){
  const o = tapeOpts(), pages = tapePages(o);
  if (!pages.length){ toast(t('tap_none'), 'warn'); return; }
  const P = tapePrintHTML(pages), ps = $('#page-style'), root = $('#print-root');
  ps.textContent = P.css; root.innerHTML = P.html;
  const cleanup = () => { root.innerHTML = ''; ps.textContent = '@page{size:210mm 297mm;margin:0mm}'; window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  await new Promise(res => setTimeout(() => { try { window.print(); } finally { setTimeout(() => { cleanup(); res(); }, 300); } }, 60));
  if (typeof logAct === 'function') try { logAct('print.tape', null, t('tap_logged', {n:pages.length, f:tapeFmt(o.fmt).name}), {pages:pages.length, format:o.fmt, source:o.src, output:o.out}); } catch(e){}
}

/* ---------------- view ---------------- */
function tapeModeSwitch(on){
  return '<div class="seg tp-mode" role="group" aria-label="' + esc(t('tap_mode')) + '" id="tp-mode">' +
    '<button type="button" data-a="tp-mode" data-v="0" class="' + (on ? '' : 'on') + '">' + ic('printer') + esc(t('tap_mode_a4')) + '</button>' +
    '<button type="button" data-a="tp-mode" data-v="1" class="' + (on ? 'on' : '') + '" id="tp-mode-tape">' + ic('tag') + esc(t('tap_mode_tape')) + '</button></div>';
}
function tapeFmtListHTML(q){
  const cur = tapeOpts().fmt, res = tapeSearch(q, 60);
  if (!res.length) return '<div class="muted small tp-empty">' + esc(t('tap_fmt_none')) + '</div>';
  return res.map(e => '<button type="button" class="tp-fmt' + (e.src === 'tape' && e.id === cur ? ' on' : '') + '" data-a="tp-fmt" data-src="' + e.src + '" data-id="' + esc(e.id) + '">' +
    '<span class="tp-fmt-k ' + (e.src === 'a4' ? 'a4' : e.cont ? 'cont' : 'die') + '">' + esc(e.src === 'a4' ? 'A4' : e.cont ? t('tap_k_cont') : t('tap_k_die')) + '</span>' +
    '<span class="tp-fmt-t"><b>' + esc((e.brand ? e.brand + ' · ' : '') + e.name) + '</b><span class="muted">' + esc(e.src === 'a4' ? t('tap_a4_hint') : e.std + ' · ' + tapeFmtDims(e.ref)) + '</span></span></button>').join('');
}
function tapeSelect(id, val, opts){ return '<select class="inp" id="' + id + '" data-tp="' + id.replace(/^tp-/, '') + '">' + opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>'; }
function tapeViewHTML(){
  const o = tapeOpts(), f = tapeFmt(o.fmt), cont = tapeIsCont(f), nLoc = typeof locArr === 'function' ? locArr().length : 0;
  const items = tapeItems(o), pages = tapeLayout(items, o), mod = tapeModuleMM(pages);
  const locOpts = [['', t('tap_loc_all')]].concat(tapeLocOrder('', true).map(l => [l.id, ' '.repeat(Math.min(l.level, 6) * 2) + l.code + (l.name ? ' · ' + l.name : '')]));
  const fb = TAPE_FIELDS_B.map(k => [k, t('tap_f_' + k)]), fl = TAPE_FIELDS_L.map(k => [k, t('tap_fl_' + k)]);
  const srcBtn = (v, lab, dis) => '<button type="button" data-a="tp-src" data-v="' + v + '" class="' + (o.src === v ? 'on' : '') + '"' + (dis ? ' disabled' : '') + '>' + esc(lab) + '</button>';
  const len = pages.reduce((s, p) => s + p.w, 0);
  const qual = !o.qr ? '' : mod < 0.25 ? '<div class="q-row bad">' + ic('alert') + '<span>' + esc(t('tap_q_bad', {m:fmtMM(r1(mod * 100) / 100)})) + '</span></div>'
    : mod < 0.33 ? '<div class="q-row warn">' + ic('alert') + '<span>' + esc(t('tap_q_warn', {m:fmtMM(r1(mod * 100) / 100)})) + '</span></div>'
    : '<div class="q-row ok">' + ic('check') + '<span>' + esc(t('tap_q_ok', {m:fmtMM(r1(mod * 100) / 100)})) + '</span></div>';
  return '<div class="page-h"><div><h1>' + esc(t('tap_h')) + helpDot('tape') + '</h1><p>' + esc(t('tap_p')) + '</p></div>' +
      '<div class="row"><button class="btn btn-lg btn-primary" data-a="tp-print" id="tp-print"' + (items.length ? '' : ' disabled') + '>' + ic('printer') + esc(t('tap_go', {n:items.length})) + '</button></div></div>' +
    tapeModeSwitch(true) +
    '<div class="tp-studio"><div class="card tp-side">' +
      '<div class="panel-sec"><h3>1 · ' + esc(t('tap_fmt_h')) + '</h3>' +
        '<div class="tp-cur" id="tp-cur"><b>' + esc(f.brand + ' · ' + f.name) + '</b><span class="muted">' + esc(f.series + ' · ' + tapeFmtDims(f)) + '</span></div>' +
        '<div class="search tp-q">' + ic('search') + '<input class="inp" type="search" id="tp-q" value="' + esc(o.q) + '" placeholder="' + esc(t('tap_q_ph')) + '" aria-label="' + esc(t('tap_q_ph')) + '" autocomplete="off"></div>' +
        '<div class="tp-fmts" id="tp-fmts">' + tapeFmtListHTML(o.q) + '</div>' +
        '<div class="grid g2 tp-dims">' +
          (cont ? '<div class="field"><label for="tp-len">' + esc(t('tap_len')) + '</label><input class="inp" type="number" min="0" max="500" step="1" id="tp-len" data-tp="len" value="' + (o.len || 0) + '"><span class="hint">' + esc(t('tap_len_d')) + '</span></div>' : '') +
          '<div class="field"><label for="tp-pa">' + esc(t('tap_pa')) + '</label><input class="inp" type="number" min="0" max="120" step="0.5" id="tp-pa" data-tp="pa" value="' + (o.pa || 0) + '"><span class="hint">' + esc(t('tap_pa_d', {v:fmtMM(f.pa || f.across)})) + '</span></div></div></div>' +
      '<div class="panel-sec"><h3>2 · ' + esc(t('tap_src_h')) + '</h3><div class="seg tp-srcs" role="group">' +
        srcBtn('sel', t('tap_src_sel', {n:printQueueBinders().length})) + srcBtn('locs', t('tap_src_locs'), !nLoc) + srcBtn('strip', t('tap_src_strip'), !nLoc) + '</div>' +
        '<div class="hint" id="tp-src-d">' + esc(t('tap_src_' + o.src + '_d')) + '</div>' +
        (o.src !== 'sel' ? '<div class="field"><label for="tp-locId">' + esc(t('tap_loc')) + '</label>' + tapeSelect('tp-locId', o.locId, locOpts) + '</div>' +
          (o.locId ? '<label class="chk small"><input type="checkbox" data-a="tp-sub"' + (o.sub !== false ? ' checked' : '') + '><span>' + esc(t('tap_sub')) + '</span></label>' : '') : '') +
        (o.src !== 'strip' ? '<div class="geo-row"><span class="lbl">' + esc(t('copies')) + '</span><input class="inp" style="width:90px" type="number" min="1" max="20" step="1" id="tp-copies" data-tp="copies" value="' + o.copies + '"></div>' : '') + '</div>' +
      '<div class="panel-sec"><h3>3 · ' + esc(t('tap_txt_h')) + '</h3>' +
        (o.src !== 'locs' ? '<div class="grid g2"><div class="field"><label for="tp-main">' + esc(t('tap_main_b')) + '</label>' + tapeSelect('tp-main', o.main, fb.filter(x => x[0] !== 'none')) + '</div>' +
          '<div class="field"><label for="tp-second">' + esc(t('tap_second')) + '</label>' + tapeSelect('tp-second', o.second, fb) + '</div></div>' : '') +
        (o.src !== 'sel' ? '<div class="grid g2"><div class="field"><label for="tp-lmain">' + esc(t('tap_main_l')) + '</label>' + tapeSelect('tp-lmain', o.lmain, fl.filter(x => x[0] !== 'none')) + '</div>' +
          '<div class="field"><label for="tp-lsecond">' + esc(t('tap_second')) + '</label>' + tapeSelect('tp-lsecond', o.lsecond, fl) + '</div></div>' : '') +
        '<label class="chk small"><input type="checkbox" data-a="tp-qr"' + (o.qr ? ' checked' : '') + '><span>' + esc(t('tap_qr')) + '</span></label></div>' +
      '<div class="panel-sec"><h3>4 · ' + esc(t('tap_out_h')) + '</h3>' +
        (cont ? '<div class="seg" role="group"><button type="button" data-a="tp-out" data-v="pages" class="' + (o.out !== 'strip' ? 'on' : '') + '">' + esc(t('tap_out_pages')) + '</button><button type="button" data-a="tp-out" data-v="strip" class="' + (o.out === 'strip' ? 'on' : '') + '" id="tp-out-strip">' + esc(t('tap_out_strip')) + '</button></div>' +
          '<div class="hint">' + esc(t(o.out === 'strip' ? 'tap_out_strip_d' : 'tap_out_pages_d')) + '</div>' +
          (o.out === 'strip' ? '<div class="geo-row"><span class="lbl">' + esc(t('tap_gap')) + '</span><input class="inp" style="width:90px" type="number" min="0" max="20" step="0.5" id="tp-gap" data-tp="gap" value="' + o.gap + '"></div><label class="chk small"><input type="checkbox" data-a="tp-cuts"' + (o.cuts ? ' checked' : '') + '><span>' + esc(t('tap_cuts')) + '</span></label>' : '')
          : '<div class="hint">' + esc(t('tap_out_die_d')) + '</div>') +
        '<div class="field"><label for="tp-turn">' + esc(t('tap_turn')) + '</label>' + tapeSelect('tp-turn', o.turn, [['auto', t('tap_turn_auto', {v:f.turn ? t('tap_turn_yes') : t('tap_turn_no')})], ['no', t('tap_turn_no')], ['yes', t('tap_turn_yes')]]) + '<span class="hint">' + esc(t('tap_turn_d')) + '</span></div></div>' +
    '</div><div class="card tp-main-card"><div class="tp-pv-h"><b id="tp-sum">' + esc(t('tap_sum', {n:items.length, p:pages.length, l:fmtMM(Math.round(len))})) + '</b>' +
        (o.src === 'strip' ? '<span class="muted small">' + esc(t('tap_strip_note')) + '</span>' : '') + '</div>' + qual +
      '<div class="tp-pv" id="tp-pv">' + (items.length ? tapePreviewHTML(pages, o) : '<div class="empty small">' + esc(t(o.src === 'sel' ? 'tap_empty_sel' : 'tap_empty_loc')) + '</div>') + '</div>' +
      '<div class="hint tp-tips">' + t('tap_tips') + '</div></div></div>';
}
const TAPE_PV_MAX = 60;   // pages drawn in the preview (the print has them all)
function tapePreviewHTML(pages, o){
  const z = clamp(56 / Math.max(10, pages[0] ? pages[0].h : 24), 1.2, 3.6);   // ~56 mm on screen for the tape height
  return '<div class="tp-pv-in" style="zoom:' + r1(z) + '">' + pages.slice(0, TAPE_PV_MAX).map((p, i) => '<div class="tp-pv-pg" title="' + (i + 1) + '">' + tapePageInner(p, o) + '</div>').join('') + '</div>' +
    (pages.length > TAPE_PV_MAX ? '<div class="muted small">+' + (pages.length - TAPE_PV_MAX) + '</div>' : '');
}
function tapeRerender(focusId){
  const y = window.scrollY, side = $('.tp-side'), sy = side ? side.scrollTop : 0;
  renderView(); window.scrollTo(0, y);
  const s2 = $('.tp-side'); if (s2) s2.scrollTop = sy;
  if (focusId){ const el = document.getElementById(focusId); if (el){ el.focus(); if (el.setSelectionRange && el.type === 'search') try { el.setSelectionRange(el.value.length, el.value.length); } catch(e){} } }
}
/** Opens the tape studio, optionally with a source ('sel' | 'locs' | 'strip') and a location. */
function tapeOpen(patch){ tapeSet(Object.assign({on:true}, patch || {})); S.view = 'print'; renderAll(); window.scrollTo(0, 0); }

/* ---------------- hooks into the print view ---------------- */
(function(){
  if (typeof window.viewPrint !== 'function') return;
  const orig = window.viewPrint, origMount = window.mountPrint;
  window.viewPrint = function(){
    if (tapeOpts().on) return tapeViewHTML();
    const h = orig.apply(this, arguments);
    const i = h.indexOf('<div class="studio">');
    return i < 0 ? h : h.slice(0, i) + tapeModeSwitch(false) + h.slice(i);
  };
  window.mountPrint = function(){ if (tapeOpts().on) return; return origMount.apply(this, arguments); };
})();

const TAPE_ACTIONS = {
  'tp-mode': (el) => { tapeSet({on:el.dataset.v === '1'}); renderView(); },
  'tp-fmt': (el) => {
    if (el.dataset.src === 'a4'){ const p = findPreset(el.dataset.id); S.print.presetId = p.id; S.print.geometry = geoFromPreset(p); S.print.geometryModified = false; tapeSet({on:false}); renderView(); toast(t('tap_a4_set', {n:p.name}), 'ok'); return; }
    const f = tapeFmt(el.dataset.id); tapeSet({fmt:f.id, out:tapeIsCont(f) ? tapeOpts().out : 'pages'}); tapeRerender();
  },
  'tp-src': (el) => { tapeSet({src:el.dataset.v}); tapeRerender(); },
  'tp-out': (el) => { tapeSet({out:el.dataset.v}); tapeRerender(); },
  'tp-sub': (el) => { tapeSet({sub:!!el.checked}); tapeRerender(); },
  'tp-qr': (el) => { tapeSet({qr:!!el.checked}); tapeRerender(); },
  'tp-cuts': (el) => { tapeSet({cuts:!!el.checked}); tapeRerender(); },
  'tp-print': () => tapePrint(),
  'tp-open': (el) => tapeOpen(el.dataset.src ? {src:el.dataset.src, locId:el.dataset.id || '', sub:true} : null)
};
if (typeof document !== 'undefined'){
  let qt = 0;
  document.addEventListener('input', (e) => {
    const el = e.target; if (!el || el.id !== 'tp-q') return;
    S.print.tape = Object.assign(tapeOpts(), {q:el.value});
    clearTimeout(qt); qt = setTimeout(() => { savePrefs(); const box = $('#tp-fmts'); if (box) box.innerHTML = tapeFmtListHTML(el.value); }, 90);
  });
  document.addEventListener('change', (e) => {
    const el = e.target; if (!el || !el.dataset || !el.dataset.tp) return;
    const k = el.dataset.tp, num = ['len', 'pa', 'gap', 'copies'].includes(k);
    tapeSet({[k]:num ? (parseFloat(el.value) || 0) : el.value}); tapeRerender();
  });
  document.addEventListener('DOMContentLoaded', () => { if (typeof ACTIONS !== 'undefined') Object.assign(ACTIONS, TAPE_ACTIONS); });
}

/* ---------------- help topic ---------------- */
if (typeof HELP_TOPICS !== 'undefined' && Array.isArray(HELP_TOPICS) && !HELP_TOPICS.some(x => x.id === 'tape')){
  HELP_TOPICS.push({ id:'tape', guide:null, tags:['label', 'qr'], acts:['how', 'print'], pop:40, related:['print', 'locations'],
    title:{it:'Come stampo con un\'etichettatrice a nastro o a rotolo (Brother, Dymo, Zebra…)?', en:'How do I print with a tape or roll label printer (Brother, Dymo, Zebra…)?'},
    body:{
      it:'<ol><li><b>Stampa etichette</b> › in alto <b>Etichettatrice / rotolo</b>.</li>' +
        '<li><b>Formato</b>: scrivi nella ricerca marca, nome, sigla o misura (es. <span class="kbd">24 mm</span>, <span class="kbd">62x100</span>, <span class="kbd">dk-11201</span>, <span class="kbd">dymo 99012</span>, <span class="kbd">zebra 4x6</span>). Compaiono anche i fogli A4: sceglierne uno torna alla stampa su fogli.</li>' +
        '<li><b>Cosa stampare</b>: i faldoni spuntati per la stampa, un\'ubicazione con quelle che contiene, oppure la <b>striscia ubicazione</b>: l\'etichetta della scatola (o scaffale) e subito dopo tutti i faldoni che contiene, in ordine, anche quelli delle scatole interne.</li>' +
        '<li><b>Testo</b>: accanto al QR scegli il campo principale (codice, titolo, ragione sociale, Codice Multi, ubicazione, qr7.it/…) e una seconda riga facoltativa.</li>' +
        '<li><b>Uscita</b>: una pagina per etichetta (la stampante taglia dopo ognuna) oppure <b>striscia continua</b> con le linee di taglio. Se nell\'anteprima di stampa del browser l\'etichetta esce di traverso, cambia <b>Orientamento della pagina</b>.</li>' +
        '<li>Nella finestra di stampa scegli la stampante e il formato carta uguale a quello scelto qui, margini <b>Nessuno</b>, scala <b>100%</b>. Con le stampanti tascabili Bluetooth (Niimbot, Phomemo) scegli <b>Salva come PDF</b> e stampa il PDF dalla loro app.</li></ol>' +
        '<p>Il riquadro sopra l\'anteprima dice se il QR è abbastanza grande: con moduli sotto 0,25 mm (nastri da 6-9 mm) il telefono fatica a leggerlo.</p>',
      en:'<ol><li><b>Print labels</b> › at the top <b>Label printer / roll</b>.</li>' +
        '<li><b>Format</b>: type brand, name, code or size in the search (e.g. <span class="kbd">24 mm</span>, <span class="kbd">62x100</span>, <span class="kbd">dk-11201</span>, <span class="kbd">dymo 99012</span>, <span class="kbd">zebra 4x6</span>). A4 sheets are listed too: picking one goes back to sheet printing.</li>' +
        '<li><b>What to print</b>: the binders ticked for printing, a location with the ones inside it, or the <b>location strip</b>: the box (or shelf) label followed by all the binders it holds, in order, nested boxes included.</li>' +
        '<li><b>Text</b>: next to the QR choose the main field (code, title, company, Codice Multi, location, qr7.it/…) and an optional second line.</li>' +
        '<li><b>Output</b>: one page per label (the printer cuts after each one) or a <b>continuous strip</b> with cut lines. If the browser print preview shows the label sideways, change <b>Page orientation</b>.</li>' +
        '<li>In the print dialog pick the printer and the same paper size chosen here, margins <b>None</b>, scale <b>100%</b>. With pocket Bluetooth printers (Niimbot, Phomemo) choose <b>Save as PDF</b> and print the PDF from their app.</li></ol>' +
        '<p>The box above the preview says whether the QR is large enough: with modules below 0.25 mm (6-9 mm tapes) phones struggle to read it.</p>'
    }});
}

if (typeof I18N !== 'undefined'){
  Object.assign(I18N.it, {
    tap_mode:'Tipo di stampa', tap_mode_a4:'Fogli A4', tap_mode_tape:'Etichettatrice / rotolo',
    tap_h:'Etichettatrice e rotoli', tap_p:'Nastri e rotoli di etichette (Brother, Dymo, Zebra, Epson, Niimbot…): QR + testo a scelta, anche in striscia continua con l\'ubicazione e i faldoni che contiene.',
    tap_go:'Stampa {n} etichette', tap_none:'Niente da stampare: scegli i faldoni o un\'ubicazione.', tap_logged:'Stampa su etichettatrice: {n} pagine ({f})',
    tap_fmt_h:'Formato', tap_q_ph:'Cerca: marca, nome, sigla o misura (es. 24 mm, 62x100, dk-11201, dymo, zebra 4x6, A4)', tap_fmt_none:'Nessun formato trovato. Prova con una misura (es. 29x90) o una marca.',
    tap_cont:'continuo', tap_k_cont:'Nastro', tap_k_die:'Fustellate', tap_a4_hint:'Foglio A4: torna alla stampa su fogli con questo formato',
    tap_a4_set:'Formato foglio scelto: {n}', tap_len:'Lunghezza etichetta (mm)', tap_len_d:'0 = automatica, segue il testo',
    tap_pa:'Altezza stampabile (mm)', tap_pa_d:'0 = quella tipica ({v} mm). Cambiala se la stampante taglia il bordo.',
    tap_src_h:'Cosa stampare', tap_src_sel:'Faldoni selezionati ({n})', tap_src_locs:'Ubicazioni', tap_src_strip:'Striscia ubicazione',
    tap_src_sel_d:'I faldoni spuntati per la stampa in Archivio, in ordine di codice.',
    tap_src_locs_d:'Le etichette QR delle ubicazioni: quella scelta e, se vuoi, tutte quelle che contiene.',
    tap_src_strip_d:'L\'ubicazione e subito dopo tutti i faldoni che contiene, in ordine; poi la successiva (scatole interne comprese).',
    tap_loc:'Ubicazione', tap_loc_all:'Tutte le ubicazioni', tap_sub:'Comprese quelle che contiene (scatole interne…)',
    tap_txt_h:'Testo accanto al QR', tap_main_b:'Faldoni: campo principale', tap_main_l:'Ubicazioni: campo principale', tap_second:'Seconda riga', tap_qr:'Stampa il QR',
    tap_f_code:'Codice faldone', tap_f_title:'Titolo', tap_f_company:'Ragione sociale', tap_f_multi:'Codice Multi', tap_f_short:'Indirizzo qr7.it/…', tap_f_loc:'Ubicazione', tap_f_none:'— nessuna —',
    tap_fl_code:'Codice completo', tap_fl_seg:'Codice breve (es. B04)', tap_fl_name:'Nome', tap_fl_path:'Percorso', tap_fl_short:'Indirizzo qr7.it/…', tap_fl_none:'— nessuna —',
    tap_out_h:'Uscita', tap_out_pages:'Una per pagina', tap_out_strip:'Striscia continua',
    tap_out_pages_d:'Ogni etichetta è una pagina: la stampante la taglia (o la stacchi) dopo ognuna.',
    tap_out_strip_d:'Tutte di seguito su un\'unica striscia lunga (divisa in pagine da 90 cm al massimo), con linee di taglio.',
    tap_out_die_d:'Etichette fustellate: una per pagina, della misura dell\'etichetta.',
    tap_gap:'Spazio fra etichette (mm)', tap_cuts:'Linee di taglio tra un\'etichetta e l\'altra',
    tap_turn:'Orientamento della pagina', tap_turn_auto:'Automatico ({v})', tap_turn_no:'orizzontale, come il nastro', tap_turn_yes:'ruotata di 90°',
    tap_turn_d:'Se nell\'anteprima di stampa del browser l\'etichetta esce di traverso o tagliata, prova l\'altro orientamento.',
    tap_sum:'{n} etichette · pagine: {p} · {l} mm di nastro', tap_strip_note:'Le etichette delle ubicazioni hanno la barra nera a sinistra.',
    tap_empty_sel:'Nessun faldone spuntato per la stampa: spuntali in Archivio oppure scegli un\'ubicazione.', tap_empty_loc:'Nessuna ubicazione (o nessun faldone) da stampare qui.',
    tap_q_ok:'QR ben leggibile (modulo {m} mm).', tap_q_warn:'QR piccolo (modulo {m} mm): leggibile da vicino, meglio un nastro più alto.', tap_q_bad:'QR troppo piccolo (modulo {m} mm): il telefono faticherà a leggerlo. Usa un nastro da 12 mm o più, o togli il QR.',
    tap_tips:'Nella finestra di stampa: stampante e formato carta uguali a quelli scelti qui, margini <b>Nessuno</b>, scala <b>100%</b>. Stampanti tascabili Bluetooth: <b>Salva come PDF</b> e stampa dalla loro app. Prima volta: stampa una sola etichetta di prova.',
    tap_open:'Etichettatrice / striscia', lo_print_tree:'Stampa QR: questa e quelle dentro ({n})', lo_print_all:'Stampa tutti i QR ({n})', lo_strip:'Striscia: ubicazione + faldoni'
  });
  Object.assign(I18N.en, {
    tap_mode:'Print type', tap_mode_a4:'A4 sheets', tap_mode_tape:'Label printer / roll',
    tap_h:'Label printers and rolls', tap_p:'Label tapes and rolls (Brother, Dymo, Zebra, Epson, Niimbot…): QR + a text of your choice, also as a continuous strip with the location and the binders it holds.',
    tap_go:'Print {n} labels', tap_none:'Nothing to print: choose binders or a location.', tap_logged:'Label printer job: {n} pages ({f})',
    tap_fmt_h:'Format', tap_q_ph:'Search: brand, name, code or size (e.g. 24 mm, 62x100, dk-11201, dymo, zebra 4x6, A4)', tap_fmt_none:'No format found. Try a size (e.g. 29x90) or a brand.',
    tap_cont:'continuous', tap_k_cont:'Tape', tap_k_die:'Die-cut', tap_a4_hint:'A4 sheet: back to sheet printing with this format',
    tap_a4_set:'Sheet format chosen: {n}', tap_len:'Label length (mm)', tap_len_d:'0 = automatic, follows the text',
    tap_pa:'Printable height (mm)', tap_pa_d:'0 = the usual one ({v} mm). Change it if the printer cuts the edge.',
    tap_src_h:'What to print', tap_src_sel:'Selected binders ({n})', tap_src_locs:'Locations', tap_src_strip:'Location strip',
    tap_src_sel_d:'The binders ticked for printing in Archive, by code.',
    tap_src_locs_d:'The QR labels of the locations: the chosen one and, if you want, all those inside it.',
    tap_src_strip_d:'The location followed by all the binders it holds, in order; then the next one (nested boxes included).',
    tap_loc:'Location', tap_loc_all:'All locations', tap_sub:'Including those inside it (nested boxes…)',
    tap_txt_h:'Text next to the QR', tap_main_b:'Binders: main field', tap_main_l:'Locations: main field', tap_second:'Second line', tap_qr:'Print the QR',
    tap_f_code:'Binder code', tap_f_title:'Title', tap_f_company:'Company name', tap_f_multi:'Codice Multi', tap_f_short:'qr7.it/… address', tap_f_loc:'Location', tap_f_none:'— none —',
    tap_fl_code:'Full code', tap_fl_seg:'Short code (e.g. B04)', tap_fl_name:'Name', tap_fl_path:'Path', tap_fl_short:'qr7.it/… address', tap_fl_none:'— none —',
    tap_out_h:'Output', tap_out_pages:'One per page', tap_out_strip:'Continuous strip',
    tap_out_pages_d:'Each label is a page: the printer cuts it (or you tear it) after each one.',
    tap_out_strip_d:'All in a row on one long strip (split in pages of at most 90 cm), with cut lines.',
    tap_out_die_d:'Die-cut labels: one per page, the size of the label.',
    tap_gap:'Space between labels (mm)', tap_cuts:'Cut lines between labels',
    tap_turn:'Page orientation', tap_turn_auto:'Automatic ({v})', tap_turn_no:'landscape, like the tape', tap_turn_yes:'turned by 90°',
    tap_turn_d:'If the browser print preview shows the label sideways or cut, try the other orientation.',
    tap_sum:'{n} labels · pages: {p} · {l} mm of tape', tap_strip_note:'Location labels have the black bar on the left.',
    tap_empty_sel:'No binder ticked for printing: tick them in Archive or choose a location.', tap_empty_loc:'No location (or no binder) to print here.',
    tap_q_ok:'QR easy to read (module {m} mm).', tap_q_warn:'Small QR (module {m} mm): readable up close, a taller tape is better.', tap_q_bad:'QR too small (module {m} mm): phones will struggle. Use a 12 mm tape or wider, or turn the QR off.',
    tap_tips:'In the print dialog: same printer and paper size as chosen here, margins <b>None</b>, scale <b>100%</b>. Pocket Bluetooth printers: <b>Save as PDF</b> and print from their app. First time: print a single test label.',
    tap_open:'Label printer / strip', lo_print_tree:'Print QR: this one and those inside ({n})', lo_print_all:'Print all QR codes ({n})', lo_strip:'Strip: location + binders'
  });
}

/* ---------------- A4 sheets: "Solo QR" template with a field of your choice (small stickers for documents) ----------------
   S.print.qrText: 'std' (code + qr7.it/short, as before) or a field of TAPE_FIELDS_B; S.print.qrText2: optional second line. */
const QRT_FIELDS = ['std'].concat(TAPE_FIELDS_B.filter(k => k !== 'none'));
(function(){
  if (typeof window.renderQrLabel !== 'function') return;
  const orig = window.renderQrLabel;
  window.renderQrLabel = function(b, g, P){
    const f = P && P.qrText && P.qrText !== 'std' && QRT_FIELDS.includes(P.qrText) ? P.qrText : '';
    if (!f) return orig.apply(this, arguments);
    const w = g.w, h = g.h, pad = clamp(+P.padding || 0, 0, Math.min(w, h) / 5);
    const x0 = pad, y0 = pad, iw = Math.max(4, w - 2 * pad), ih = Math.max(4, h - 2 * pad);
    const radius = g.radius ? 'border-radius:' + MM(g.radius) + ';' : '';
    const main = tapeBinderText(b, f) || b.speaking_code || '—';
    const f2 = P.qrText2 && P.qrText2 !== 'none' && P.qrText2 !== f ? P.qrText2 : '', sec = f2 ? tapeBinderText(b, f2) : '';
    const wide = iw >= ih * 1.2;
    let q, qx, qy, tx, ty, tw, th;
    if (wide){ q = P.qrMode === 'none' ? 0 : Math.min(ih, iw * 0.5); const gap = q ? clamp(ih * 0.08, 0.8, 3) : 0; qx = x0; qy = y0 + (ih - q) / 2; tx = x0 + q + gap; ty = y0; tw = iw - q - gap; th = ih; }
    else { q = P.qrMode === 'none' ? 0 : Math.min(iw, ih * 0.62); qx = x0 + (iw - q) / 2; qy = y0; tx = x0; ty = y0 + q + (q ? 0.8 : 0); tw = iw; th = ih - q - (q ? 0.8 : 0); }
    const mono = ['code', 'short', 'multi'].includes(f);
    const hMain = th * (sec ? 0.66 : 1);
    const fm = fitWrap(main, tw, hMain, Math.min(hMain * 0.62, 14), 1, mono ? 'lmono' : 'lw', 1.05).fs * 0.96;   // 'lw': no nowrap, so the probe wraps like the label
    const fs = sec ? fitLine(esc(sec), tw, Math.min(th * 0.26, fm * 0.7), 1, 'ln').fs : 0;
    LM.Q = {q, code:fm, minText:sec ? Math.min(fm, fs) : fm};
    return '<div class="lab" style="' + radius + '">' + (q ? qrBox(b, qx, qy, q, P) : '') +
      '<div style="position:absolute;left:' + MM(tx) + ';top:' + MM(ty) + ';width:' + MM(tw) + ';height:' + MM(th) + ';display:flex;flex-direction:column;justify-content:center;overflow:hidden;color:#000;' + (wide ? '' : 'text-align:center;') + '">' +
        '<div class="' + (mono ? 'lmono' : '') + '" style="font-size:' + MM(fm) + ';line-height:1.05;font-weight:800;letter-spacing:-.02em;overflow:hidden;word-break:normal;overflow-wrap:anywhere">' + esc(main) + '</div>' +
        (sec ? '<div class="ln" style="font-size:' + MM(fs) + ';line-height:1.15;font-weight:600;margin-top:' + MM(fs * 0.2) + '">' + esc(sec) + '</div>' : '') + '</div></div>';
  };
  const T = typeof labelTemplate === 'function' ? labelTemplate('qr') : null;
  if (T && !T.options) T.options = (P) => {
    const sel = (k, v, list) => '<select class="inp" data-qrt="' + k + '" id="qrt-' + k + '" style="min-height:36px">' + list.map(x => '<option value="' + x + '"' + (v === x ? ' selected' : '') + '>' + esc(t(x === 'std' ? 'qrt_std' : 'tap_f_' + x)) + '</option>').join('') + '</select>';
    const v1 = QRT_FIELDS.includes(P.qrText) ? P.qrText : 'std';
    return '<div class="tpl-opts" id="qrt-opts"><div class="field"><label for="qrt-qrText">' + esc(t('qrt_main')) + '</label>' + sel('qrText', v1, QRT_FIELDS) + '</div>' +
      (v1 !== 'std' ? '<div class="field" style="margin-top:6px"><label for="qrt-qrText2">' + esc(t('tap_second')) + '</label>' + sel('qrText2', P.qrText2 || 'none', TAPE_FIELDS_B) + '</div>' : '') +
      '<div class="hint" style="margin-top:4px">' + esc(t('qrt_d')) + '</div></div>';
  };
})();
if (typeof document !== 'undefined') document.addEventListener('change', (e) => {
  const el = e.target; if (!el || !el.dataset || !el.dataset.qrt) return;
  S.print[el.dataset.qrt] = el.value; savePrefs();
  if (typeof tplRerender === 'function') tplRerender(); else renderView();
});

/* ---------------- A4 sheets: free-text filter on the sheet list ---------------- */
(function(){
  if (typeof window.viewPrint !== 'function') return;
  const prev = window.viewPrint;
  window.viewPrint = function(){
    const h = prev.apply(this, arguments);
    if (tapeOpts().on) return h;
    const k = h.indexOf('<div class="preset-list">');
    return k < 0 ? h : h.slice(0, k) + '<div class="search pr-pq">' + ic('search') + '<input class="inp" type="search" id="pr-pq" placeholder="' + esc(t('tap_pq_ph')) + '" aria-label="' + esc(t('tap_pq_ph')) + '" autocomplete="off"></div><div class="hint tap-pq-none" id="pr-pq-none" hidden>' + esc(t('tap_pq_none')) + '</div>' + h.slice(k);
  };
})();
/** Shows only the sheet presets that match the text (words, sizes like 38x21 or 25.4). */
function presetFilter(q){
  const words = tapeNorm(q).split(/\s+/).filter(Boolean), list = $('.preset-list'); if (!list) return 0;
  let shown = 0;
  const hits = words.length ? new Set(tapeSearch(q, 999).filter(e => e.src === 'a4').map(e => e.id)) : null;
  list.querySelectorAll('.preset').forEach(btn => { const ok = !hits || hits.has(btn.dataset.id); btn.hidden = !ok; if (ok) shown++; });
  const more = list.querySelector('details.more'); if (more && words.length) more.open = true;
  list.querySelectorAll('details.more > div.tiny').forEach(d => { d.hidden = !!words.length; });
  const none = $('#pr-pq-none'); if (none) none.hidden = !(words.length && !shown);
  return shown;
}
if (typeof document !== 'undefined') document.addEventListener('input', (e) => { const el = e.target; if (el && el.id === 'pr-pq') presetFilter(el.value); });

if (typeof I18N !== 'undefined'){
  Object.assign(I18N.it, { qrt_main:'Testo accanto al QR', qrt_std:'Codice + qr7.it/… (come prima)', qrt_d:'Per adesivi piccoli sui documenti: QR e il campo che scegli. Con i fogli da 65 o 189 etichette usa un campo corto (codice, Codice Multi).',
    tap_pq_ph:'Cerca foglio: nome, sigla, misura (es. L7651, 38x21, 65 etichette)', tap_pq_none:'Nessun foglio A4 trovato. Per nastri e rotoli usa "Etichettatrice / rotolo" qui sopra.' });
  Object.assign(I18N.en, { qrt_main:'Text next to the QR', qrt_std:'Code + qr7.it/… (as before)', qrt_d:'For small stickers on documents: QR and the field you choose. With 65 or 189-label sheets use a short field (code, Codice Multi).',
    tap_pq_ph:'Search sheet: name, code, size (e.g. L7651, 38x21, 65 labels)', tap_pq_none:'No A4 sheet found. For tapes and rolls use "Label printer / roll" above.' });
}
