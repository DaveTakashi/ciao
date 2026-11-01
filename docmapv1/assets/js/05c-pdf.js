/* =====================================================================
   DocMap 2026 — "Scarica PDF": a print-ready, vector A4 PDF of the label
   sheets, written in the browser (offline, from file://, no library).

   How it works (generic over every label template):
   1. buildLabelSheets(false) gives the exact HTML the print engine prints
      (same sheets, slots, partial-sheet skipping, offsets, cut lines).
   2. The sheets are laid out in an off-screen stage. CSS transforms (the
      turned labels of MRINK143) are read, then removed, so every element is
      measured unrotated in its own reading frame; the transforms go back
      into the PDF as `cm` matrices around the same content.
   3. A walker turns the DOM into PDF operators: backgrounds, borders and
      outlines as paths, overflow:hidden as clip paths, the QR <svg> as
      vector modules, and text as real text: every character is placed at
      the position the browser gave it (Range.getClientRects), on a baseline
      measured with a probe of the same font/size (not from font tables).
   4. Fonts: static TrueType instances of Inter / JetBrains Mono
      (vendor/pdf-fonts.js, loaded on first use), subset per document and
      embedded as CIDFontType2 / Identity-H with widths and ToUnicode, so
      the text is sharp, selectable and searchable.
   Units: the content stream works in CSS px of the sheet (y down);
   one base matrix maps them to PDF points (1 px = 0.75 pt, A4 = 595.28 ×
   841.89 pt, no scaling).
   ===================================================================== */
const PDF_A4 = [595.2756, 841.8898];
const PDF_FONT_SRC = 'vendor/pdf-fonts.js';
const PDF_WEIGHTS = { sans:[400, 500, 600, 700, 800, 900], mono:[400, 500, 600, 700, 800] };
const PDF_SKEW = 0.25;            // synthetic oblique, same slant as Chrome (no italic face is bundled)
const PDF = { busy:false, fonts:{}, last:null };

Object.assign(I18N.it, {
  pr_pdf:'Scarica PDF', pr_pdf_d:'Scarica un file PDF pronto per la stampa (A4, misure esatte al millimetro), da stampare anche da un altro PC o da una chiavetta.',
  pdf_busy:'Preparazione del PDF… foglio {i} di {n}', pdf_fonts:'Preparazione dei caratteri…',
  pdf_done:'PDF scaricato ({n} fogli). Quando lo stampi scegli Scala 100% / "Dimensioni effettive": non usare "Adatta alla pagina".',
  pdf_err:'Non è stato possibile creare il PDF: {e}', pdf_old:'Questo browser è troppo vecchio per creare il PDF: aggiorna Chrome o Edge.',
  pdf_after_t:'Segnare le caselle come usate?', pdf_after_p:'Quando stamperai questo PDF userai {n} caselle dell\'ultimo foglio. Vuoi segnarle già ora come "già usate"? La prossima stampa ripartirà dalla casella {s}.',
  pdf_after_full:'Il PDF usa completamente l\'ultimo foglio: la mappa del foglio parziale verrà azzerata.'
});
Object.assign(I18N.en, {
  pr_pdf:'Download PDF', pr_pdf_d:'Download a print-ready PDF file (A4, millimetre-exact), to print from another PC or a USB stick.',
  pdf_busy:'Preparing the PDF… sheet {i} of {n}', pdf_fonts:'Preparing the fonts…',
  pdf_done:'PDF downloaded ({n} sheets). When you print it choose Scale 100% / "Actual size": do not use "Fit to page".',
  pdf_err:'Could not create the PDF: {e}', pdf_old:'This browser is too old to create the PDF: please update Chrome or Edge.',
  pdf_after_t:'Mark the slots as used?', pdf_after_p:'When you print this PDF you will use {n} slots of the last sheet. Mark them as "used" now? The next print will start from slot {s}.',
  pdf_after_full:'The PDF uses the whole last sheet: the partial sheet map will be reset.'
});

/* ---------------- small helpers ---------------- */
const pn = (v) => { const r = Math.round(v * 1000) / 1000; return String(r === 0 ? 0 : r); };
const pdfTick = () => new Promise(r => setTimeout(r, 0));
async function pdfPipe(u8, stream){ return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer()); }
const pdfDeflate = (u8) => typeof CompressionStream === 'function' ? pdfPipe(u8, new CompressionStream('deflate')) : Promise.resolve(null);
const pdfInflate = (u8) => pdfPipe(u8, new DecompressionStream('deflate'));
function pdfB64(s){ const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
const pdfHex4 = (n) => ('000' + n.toString(16).toUpperCase()).slice(-4);
function pdfUtf16Hex(s){ let h = 'FEFF'; for (let i = 0; i < s.length; i++) h += pdfHex4(s.charCodeAt(i)); return '<' + h + '>'; }
function pdfColor(str){
  const m = /rgba?\(([^)]+)\)/.exec(str || ''); if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat), a = p.length > 3 ? p[3] : 1;
  if (!(a > 0.004)) return null;
  return p.slice(0, 3).map(v => Math.min(1, Math.max(0, 1 - a + a * v / 255)));   // blended over the white sheet
}
const pdfRGB = (c) => c.map(v => pn(v)).join(' ');

/* ---------------- fonts: loading + TrueType parsing + subsetting ---------------- */
function pdfLoadFontScript(){
  return new Promise((res, rej) => {
    if (window.DM_PDF_FONTS) return res();
    const s = document.createElement('script');
    s.src = PDF_FONT_SRC; s.onload = () => window.DM_PDF_FONTS ? res() : rej(new Error('pdf-fonts.js'));
    s.onerror = () => rej(new Error('pdf-fonts.js'));
    document.head.appendChild(s);
  });
}
async function pdfFont(key){
  if (PDF.fonts[key]) return PDF.fonts[key];
  const src = window.DM_PDF_FONTS.fonts[key];
  const F = ttfParse(await pdfInflate(pdfB64(src.b64)));
  F.key = key; PDF.fonts[key] = F;
  return F;
}
function ttfParse(u8){
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), T = {};
  const n = dv.getUint16(4);
  for (let i = 0; i < n; i++){ const o = 12 + i * 16; T[String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3])] = {off:dv.getUint32(o + 8), len:dv.getUint32(o + 12)}; }
  const h = T.head.off, hh = T.hhea.off;
  const F = { u8, dv, T, upm:dv.getUint16(h + 18), bbox:[dv.getInt16(h + 36), dv.getInt16(h + 38), dv.getInt16(h + 40), dv.getInt16(h + 42)],
    locFmt:dv.getInt16(h + 50), asc:dv.getInt16(hh + 4), desc:dv.getInt16(hh + 6), nh:dv.getUint16(hh + 34), ng:dv.getUint16(T.maxp.off + 4) };
  F.cap = T['OS/2'] && T['OS/2'].len >= 90 ? dv.getInt16(T['OS/2'].off + 88) : Math.round(F.asc * 0.7);
  F.adv = new Uint16Array(F.ng);
  for (let g = 0; g < F.ng; g++) F.adv[g] = dv.getUint16(T.hmtx.off + 4 * Math.min(g, F.nh - 1));
  F.w1000 = (g) => Math.round(F.adv[g] * 1000 / F.upm);
  F.loca = new Uint32Array(F.ng + 1);
  for (let g = 0; g <= F.ng; g++) F.loca[g] = F.locFmt ? dv.getUint32(T.loca.off + 4 * g) : dv.getUint16(T.loca.off + 2 * g) * 2;
  // cmap: format 12 (3,10) if present, else format 4 (3,1)/(0,x)
  F.cmap = new Map();
  const c = T.cmap.off, nt = dv.getUint16(c + 2); let best = null;
  for (let i = 0; i < nt; i++){
    const pid = dv.getUint16(c + 4 + i * 8), eid = dv.getUint16(c + 6 + i * 8), off = c + dv.getUint32(c + 8 + i * 8), fmt = dv.getUint16(off);
    if (fmt === 12 && (pid === 3 || pid === 0)) best = {off, fmt};
    else if (fmt === 4 && (pid === 3 && eid === 1 || pid === 0) && !(best && best.fmt === 12)) best = {off, fmt};
  }
  if (best && best.fmt === 12){
    const ng = dv.getUint32(best.off + 12);
    for (let i = 0; i < ng; i++){ const o = best.off + 16 + i * 12, s = dv.getUint32(o), e = dv.getUint32(o + 4), g0 = dv.getUint32(o + 8); for (let cp = s; cp <= e; cp++) F.cmap.set(cp, g0 + cp - s); }
  } else if (best){
    const o = best.off, sc = dv.getUint16(o + 6) / 2, ends = o + 14, starts = ends + sc * 2 + 2, deltas = starts + sc * 2, ros = deltas + sc * 2;
    for (let i = 0; i < sc; i++){
      const e = dv.getUint16(ends + i * 2), s = dv.getUint16(starts + i * 2), d = dv.getInt16(deltas + i * 2), ro = dv.getUint16(ros + i * 2);
      for (let cp = s; cp <= e && cp !== 0xFFFF; cp++){
        let g = 0;
        if (!ro) g = (cp + d) & 0xFFFF;
        else { const ga = ros + i * 2 + ro + (cp - s) * 2; g = dv.getUint16(ga); if (g) g = (g + d) & 0xFFFF; }
        if (g) F.cmap.set(cp, g);
      }
    }
  }
  return F;
}
/* Subset keeping glyph ids (CIDToGIDMap /Identity): unused glyphs become empty, composites keep their parts. */
function ttfSubset(F, used){
  const {dv, u8, T} = F, gl = T.glyf.off, keep = new Set(used); keep.add(0);
  const stack = Array.from(keep);
  while (stack.length){
    const g = stack.pop(), s = F.loca[g], e = F.loca[g + 1];
    if (e <= s || dv.getInt16(gl + s) >= 0) continue;
    let p = gl + s + 10;
    for (;;){
      const fl = dv.getUint16(p), gi = dv.getUint16(p + 2);
      if (!keep.has(gi)){ keep.add(gi); stack.push(gi); }
      p += 4 + (fl & 1 ? 4 : 2) + (fl & 8 ? 2 : fl & 0x40 ? 4 : fl & 0x80 ? 8 : 0);
      if (!(fl & 0x20)) break;
    }
  }
  let size = 0;
  for (let g = 0; g < F.ng; g++) if (keep.has(g)) size += (F.loca[g + 1] - F.loca[g] + 3) & ~3;
  const glyf = new Uint8Array(size), loca = new Uint8Array((F.ng + 1) * 4), ldv = new DataView(loca.buffer);
  let o = 0;
  for (let g = 0; g < F.ng; g++){
    ldv.setUint32(g * 4, o);
    if (!keep.has(g)) continue;
    const s = F.loca[g], e = F.loca[g + 1];
    glyf.set(u8.subarray(gl + s, gl + e), o); o += (e - s + 3) & ~3;
  }
  ldv.setUint32(F.ng * 4, o);
  const tab = (tag) => u8.slice(T[tag].off, T[tag].off + T[tag].len);
  const head = tab('head'), hdv = new DataView(head.buffer);
  hdv.setUint32(8, 0); hdv.setInt16(50, 1);                      // checkSumAdjustment (set below), long loca
  const tables = {head, hhea:tab('hhea'), maxp:tab('maxp'), hmtx:tab('hmtx'), loca, glyf, cmap:tab('cmap')};
  ['OS/2', 'name', 'post'].forEach(tg => { if (T[tg]) tables[tg] = tab(tg); });
  const tags = Object.keys(tables).sort(), nt = tags.length;
  let pow = 1, lg = 0; while (pow * 2 <= nt){ pow *= 2; lg++; }
  let total = 12 + nt * 16; tags.forEach(tg => { total += (tables[tg].length + 3) & ~3; });
  const out = new Uint8Array(total), odv = new DataView(out.buffer);
  odv.setUint32(0, 0x00010000); odv.setUint16(4, nt); odv.setUint16(6, pow * 16); odv.setUint16(8, lg); odv.setUint16(10, nt * 16 - pow * 16);
  const csum = (b) => { const d = new DataView(b.buffer, b.byteOffset, b.byteLength); let s = 0, i = 0; for (; i + 4 <= b.length; i += 4) s = (s + d.getUint32(i)) >>> 0; let last = 0; for (let k = 0; i + k < b.length; k++) last |= b[i + k] << (24 - 8 * k); return (s + last) >>> 0; };
  let off = 12 + nt * 16, headOff = 0;
  tags.forEach((tg, i) => {
    const b = tables[tg], d = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[d + k] = tg.charCodeAt(k);
    odv.setUint32(d + 4, csum(b)); odv.setUint32(d + 8, off); odv.setUint32(d + 12, b.length);
    out.set(b, off); if (tg === 'head') headOff = off;
    off += (b.length + 3) & ~3;
  });
  odv.setUint32(headOff + 8, (0xB1B0AFBA - csum(out)) >>> 0);
  return out;
}

/* ---------------- PDF object writer ---------------- */
function pdfDoc(){ return { objs:[null], ref(){ this.objs.push(null); return this.objs.length - 1; }, set(id, dict, stream){ this.objs[id] = {dict, stream}; } }; }
async function pdfStream(doc, id, dict, bytes){
  const z = bytes.length > 64 ? await pdfDeflate(bytes) : null;
  if (z && z.length < bytes.length) doc.set(id, dict + ' /Filter /FlateDecode', z);
  else doc.set(id, dict, bytes);
}
function pdfSerialize(doc, rootId, infoId){
  const enc = new TextEncoder(), parts = [], offs = [];
  let pos = 0;
  const push = (b) => { if (typeof b === 'string') b = enc.encode(b); parts.push(b); pos += b.length; };
  push('%PDF-1.7\n'); push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
  for (let i = 1; i < doc.objs.length; i++){
    const o = doc.objs[i]; offs[i] = pos;
    if (o.stream){ push(i + ' 0 obj\n<< ' + o.dict + ' /Length ' + o.stream.length + ' >>\nstream\n'); push(o.stream); push('\nendstream\nendobj\n'); }
    else push(i + ' 0 obj\n' + o.dict + '\nendobj\n');
  }
  const xref = pos, n = doc.objs.length;
  let x = 'xref\n0 ' + n + '\n0000000000 65535 f \n';
  for (let i = 1; i < n; i++) x += ('000000000' + offs[i]).slice(-10) + ' 00000 n \n';
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), v => ('0' + v.toString(16)).slice(-2)).join('');
  push(x + 'trailer\n<< /Size ' + n + ' /Root ' + rootId + ' 0 R /Info ' + infoId + ' 0 R /ID [<' + id + '> <' + id + '>] >>\nstartxref\n' + xref + '\n%%EOF\n');
  const out = new Uint8Array(pos); let o = 0; parts.forEach(b => { out.set(b, o); o += b.length; });
  return out;
}
function pdfDate(d){
  const p = (n) => ('0' + n).slice(-2), tz = -d.getTimezoneOffset(), a = Math.abs(tz);
  return 'D:' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + (tz >= 0 ? '+' : '-') + p(Math.floor(a / 60)) + "'" + p(a % 60) + "'";
}

/* ---------------- DOM → display list ---------------- */
// Selectors hidden in print (@media print { … display:none }): screen-only guides never reach the PDF.
function pdfPrintHidden(stage){
  const sels = [];
  const scan = (rules) => { for (const r of rules){
    if (r.media && r.cssRules){ if (/print/.test(r.media.mediaText)) { for (const x of r.cssRules) if (x.selectorText && x.style && x.style.display === 'none') sels.push(x.selectorText); } else if (!/screen/.test(r.media.mediaText)) scan(r.cssRules); }
  } };
  for (const ss of document.styleSheets){ try { scan(ss.cssRules); } catch(e){ /* unreadable sheet */ } }
  // drop selectors that would hide the stage itself (e.g. "body>*:not(#print-root)")
  return sels.filter(s => { try { for (let e = stage; e; e = e.parentElement) if (e.matches(s)) return false; return true; } catch(e){ return false; } }).join(',');
}
const pdfPx = (v) => parseFloat(v) || 0;
function pdfFamily(cs){ return /mono/i.test((cs.fontFamily || '').split(',')[0]) ? 'mono' : 'sans'; }
function pdfWeightKey(fam, w){ const L = PDF_WEIGHTS[fam]; let best = L[0]; L.forEach(x => { if (Math.abs(x - w) < Math.abs(best - w)) best = x; }); return fam + '-' + best; }

function pdfRectPath(x, y, w, h, r){
  if (!r || !r.some(v => v > 0.01)) return pn(x) + ' ' + pn(y) + ' ' + pn(w) + ' ' + pn(h) + ' re';
  const k = 0.5523, m = Math.min(w, h) / 2, [a, b, c, d] = r.map(v => Math.max(0, Math.min(v, m)));   // tl tr br bl
  const P = (px, py) => pn(px) + ' ' + pn(py);
  return P(x + a, y) + ' m ' + P(x + w - b, y) + ' l ' + P(x + w - b + b * k, y) + ' ' + P(x + w, y + b - b * k) + ' ' + P(x + w, y + b) + ' c ' +
    P(x + w, y + h - c) + ' l ' + P(x + w, y + h - c + c * k) + ' ' + P(x + w - c + c * k, y + h) + ' ' + P(x + w - c, y + h) + ' c ' +
    P(x + d, y + h) + ' l ' + P(x + d - d * k, y + h) + ' ' + P(x, y + h - d + d * k) + ' ' + P(x, y + h - d) + ' c ' +
    P(x, y + a) + ' l ' + P(x, y + a - a * k) + ' ' + P(x + a - a * k, y) + ' ' + P(x + a, y) + ' c h';
}
function pdfSvgPath(d){
  const tk = String(d || '').match(/[MmLlHhVvZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
  let out = '', x = 0, y = 0, sx = 0, sy = 0, cmd = '', i = 0;
  const num = () => parseFloat(tk[i++]);
  while (i < tk.length){
    if (/[A-Za-z]/.test(tk[i])) cmd = tk[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    if (C === 'Z'){ out += 'h '; x = sx; y = sy; continue; }
    if (C === 'M' || C === 'L'){ const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; if (C === 'M'){ sx = x; sy = y; out += pn(x) + ' ' + pn(y) + ' m '; cmd = rel ? 'l' : 'L'; } else out += pn(x) + ' ' + pn(y) + ' l '; }
    else if (C === 'H'){ const a = num(); x = rel ? x + a : a; out += pn(x) + ' ' + pn(y) + ' l '; }
    else if (C === 'V'){ const b = num(); y = rel ? y + b : b; out += pn(x) + ' ' + pn(y) + ' l '; }
    else i++;
  }
  return out;
}
function pdfRadii(cs){ return ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map(k => pdfPx(cs[k])); }
function pdfDash(style, w){ return style === 'dashed' ? '[' + pn(w * 3) + ' ' + pn(w * 3) + '] 0 d ' : style === 'dotted' ? '[' + pn(w) + ' ' + pn(w) + '] 0 d ' : ''; }
const pdfInv = (m) => { const [a, b, c, d, e, f] = m, det = a * d - b * c; return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]; };
function pdfMapBox(m, bx){
  const pts = [[bx[0], bx[1]], [bx[2], bx[1]], [bx[0], bx[3]], [bx[2], bx[3]]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
}
const pdfMeets = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/* Walk one sheet: returns the display list (strings and text items) in sheet px. */
function pdfWalkSheet(sheet, W){
  const L = [], base = sheet.getBoundingClientRect(), ox = base.left, oy = base.top, rg = W.range;
  const clip = [[-1e6, -1e6, 1e6, 1e6]];        // current clip box in the current local frame
  function text(node, cs){
    const s = node.data; if (!s) return;
    const fam = pdfFamily(cs), size = pdfPx(cs.fontSize); if (!(size > 0)) return;
    const col = pdfColor(cs.color); if (!col) return;
    const tt = cs.textTransform, cb = clip[clip.length - 1], gl = [];
    for (let i = 0; i < s.length;){
      const cp = s.codePointAt(i), n = cp > 0xFFFF ? 2 : 1;
      rg.setStart(node, i); rg.setEnd(node, i + n); i += n;
      const rs = rg.getClientRects(); if (!rs.length) continue;
      let rc = rs[0]; for (const r of rs) if (r.width > rc.width) rc = r;
      let ch = String.fromCodePoint(cp);
      if (/\s/.test(ch)){ if (rc.width < 0.01) continue; ch = ' '; }
      else if (cp === 0xAD || cp === 0x200B) continue;
      if (tt === 'uppercase') ch = ch.toUpperCase(); else if (tt === 'lowercase') ch = ch.toLowerCase();
      const x = rc.left - ox, top = rc.top - oy;
      if (!pdfMeets([x, top, x + rc.width, top + rc.height], cb)) continue;   // fully clipped away
      gl.push({x, top, r:x + rc.width, h:rc.height, ch});
    }
    if (!gl.length) return;
    const pk = cs.fontFamily + '|' + cs.fontWeight + '|' + cs.fontStyle + '|' + size + '|' + cs.lineHeight;
    W.probes.set(pk, {fam:cs.fontFamily, w:cs.fontWeight, st:cs.fontStyle, size, lh:cs.lineHeight});
    const it = {t:'text', fk:pdfWeightKey(fam, +cs.fontWeight || 400), alt:pdfWeightKey(fam === 'mono' ? 'sans' : 'mono', +cs.fontWeight || 400), size, col, skew:/italic|oblique/.test(cs.fontStyle) ? PDF_SKEW : 0, pk, gl};
    W.keys.add(it.fk); W.keys.add(it.alt);
    L.push(it);
  }
  function el(e){
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || (W.hidden && e.matches(W.hidden))) return;
    const R = e.getBoundingClientRect(), x = R.left - ox, y = R.top - oy, w = R.width, h = R.height;
    const vis = cs.visibility === 'visible' && +cs.opacity > 0.01;
    let pops = 0;
    const tf = W.tf.get(e);
    if (tf){
      const o = cs.transformOrigin.split(' ').map(pdfPx), Ox = x + o[0], Oy = y + (o[1] || 0), [a, b, c, d, e2, f] = tf;
      const m = [a, b, c, d, Ox + e2 - a * Ox - c * Oy, Oy + f - b * Ox - d * Oy];
      L.push('q ' + m.map(pn).join(' ') + ' cm'); pops++;
      clip.push(pdfMapBox(pdfInv(m), clip[clip.length - 1]));
    }
    const bb = [x, y, x + w, y + h], cb = clip[clip.length - 1];
    const tag = e.tagName;
    if (vis && w > 0 && h > 0 && pdfMeets(bb, cb)){
      const rad = pdfRadii(cs), bg = pdfColor(cs.backgroundColor);
      if (bg) L.push(pdfRGB(bg) + ' rg ' + pdfRectPath(x, y, w, h, rad) + ' f');
      const sides = ['Top', 'Right', 'Bottom', 'Left'].map(k => ({w:cs['border' + k + 'Style'] === 'none' || cs['border' + k + 'Style'] === 'hidden' ? 0 : pdfPx(cs['border' + k + 'Width']), st:cs['border' + k + 'Style'], c:pdfColor(cs['border' + k + 'Color'])}));
      const same = sides.every(s => s.w === sides[0].w && s.st === sides[0].st && String(s.c) === String(sides[0].c));
      if (same && sides[0].w > 0 && sides[0].c){
        const s = sides[0], hw = s.w / 2;
        L.push('q ' + pdfRGB(s.c) + ' RG ' + pn(s.w) + ' w ' + pdfDash(s.st, s.w) + pdfRectPath(x + hw, y + hw, w - s.w, h - s.w, rad.map(r => r - hw)) + ' S Q');
      } else sides.forEach((s, i) => {
        if (!(s.w > 0) || !s.c) return;
        const hw = s.w / 2, ln = [[x, y + hw, x + w, y + hw], [x + w - hw, y, x + w - hw, y + h], [x, y + h - hw, x + w, y + h - hw], [x + hw, y, x + hw, y + h]][i];
        L.push('q ' + pdfRGB(s.c) + ' RG ' + pn(s.w) + ' w ' + pdfDash(s.st, s.w) + pn(ln[0]) + ' ' + pn(ln[1]) + ' m ' + pn(ln[2]) + ' ' + pn(ln[3]) + ' l S Q');
      });
      const ow = cs.outlineStyle !== 'none' ? pdfPx(cs.outlineWidth) : 0, oc = pdfColor(cs.outlineColor);
      if (ow > 0 && oc){
        const off = pdfPx(cs.outlineOffset) + ow / 2;
        L.push('q ' + pdfRGB(oc) + ' RG ' + pn(ow) + ' w ' + pdfDash(cs.outlineStyle, ow) + pdfRectPath(x - off, y - off, w + 2 * off, h + 2 * off, rad.map(r => r > 0 ? r + off : 0)) + ' S Q');
      }
      if (tag === 'svg' || tag === 'SVG') svg(e, x, y, w, h);
    }
    if (tag === 'svg' || tag === 'SVG' || tag === 'IMG' || tag === 'CANVAS' || tag === 'VIDEO' || tag === 'BR' || tag === 'SCRIPT' || tag === 'STYLE'){ while (pops--) { L.push('Q'); clip.pop(); } return; }
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible'){
      const bl = pdfPx(cs.borderLeftWidth), bt = pdfPx(cs.borderTopWidth), br = pdfPx(cs.borderRightWidth), bbm = pdfPx(cs.borderBottomWidth);
      const c = [x + bl, y + bt, x + w - br, y + h - bbm];
      L.push('q ' + pdfRectPath(c[0], c[1], c[2] - c[0], c[3] - c[1], pdfRadii(cs).map(r => r - Math.max(bl, bt))) + ' W n'); pops++;
      const p = clip[clip.length - 1];
      clip.push([Math.max(p[0], c[0]), Math.max(p[1], c[1]), Math.min(p[2], c[2]), Math.min(p[3], c[3])]);
    }
    const start = L.length;
    for (const ch of e.childNodes){
      if (ch.nodeType === 1) el(ch);
      else if (ch.nodeType === 3 && vis) text(ch, cs);
    }
    // text-overflow: ellipsis (one line) and -webkit-line-clamp (n lines): the browser hides the rest and draws "…"
    const clampN = parseInt(cs.webkitLineClamp, 10);
    if ((cs.textOverflow === 'ellipsis' && cs.overflowX !== 'visible') || clampN > 0){
      const limit = x + w - pdfPx(cs.borderRightWidth) - pdfPx(cs.paddingRight);
      pdfEllipsis(L.slice(start).filter(it => it.t === 'text'), limit, clampN > 0 ? clampN : 0, W);
    }
    while (pops--){ L.push('Q'); clip.pop(); }
  }
  function svg(e, x, y, w, h){
    const vb = (e.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || !(vb[2] > 0 && vb[3] > 0)) return;
    const s = Math.min(w / vb[2], h / vb[3]), tx = x + (w - vb[2] * s) / 2 - vb[0] * s, ty = y + (h - vb[3] * s) / 2 - vb[1] * s;
    let out = '';
    e.querySelectorAll('rect,path').forEach(n => {
      const c = pdfColor(getComputedStyle(n).fill); if (!c) return;
      if (n.tagName === 'rect'){ const a = (k) => parseFloat(n.getAttribute(k)) || 0; out += pdfRGB(c) + ' rg ' + pn(a('x')) + ' ' + pn(a('y')) + ' ' + pn(a('width')) + ' ' + pn(a('height')) + ' re f\n'; }
      else { const p = pdfSvgPath(n.getAttribute('d')); if (p) out += pdfRGB(c) + ' rg ' + p + 'f\n'; }
    });
    if (out) L.push('q ' + pn(s) + ' 0 0 ' + pn(s) + ' ' + pn(tx) + ' ' + pn(ty) + ' cm\n' + out + 'Q');
  }
  el(sheet);
  return L;
}
/* Approximate the browser's ellipsis: cut the glyphs that do not fit and add "…" (with the font of the last kept glyph). */
function pdfEllipsis(items, limit, clampN, W){
  const all = []; items.forEach(it => it.gl.forEach(g => all.push({it, g})));
  if (!all.length) return;
  const lines = [];
  all.forEach(a => { const ln = lines.find(l => Math.abs(l.top - a.g.top) < a.g.h * 0.5); if (ln) ln.a.push(a); else lines.push({top:a.g.top, a:[a]}); });
  lines.sort((p, q) => p.top - q.top);
  let target = null;
  if (clampN){
    if (lines.length > clampN){ lines.slice(clampN).forEach(l => l.a.forEach(a => { a.it.gl = a.it.gl.filter(g => g !== a.g); })); target = lines[clampN - 1]; }
  } else if (all.some(a => a.g.r > limit + 0.5)) target = lines[0];
  if (!target) return;
  const row = target.a.slice().sort((p, q) => p.g.x - q.g.x);
  const ref = row[row.length - 1].it, EF = W.F[ref.fk], eg = EF && EF.cmap.get(0x2026), ew = eg ? EF.w1000(eg) * ref.size / 1000 : ref.size * 0.8;
  while (row.length && (row[row.length - 1].g.r + ew > limit + 0.5 || row[row.length - 1].g.ch === ' ')){ const a = row.pop(); a.it.gl = a.it.gl.filter(g => g !== a.g); }
  // drop anything right of the cut on the target line
  const cutX = row.length ? row[row.length - 1].g.r : (target.a[0] ? target.a[0].g.x : 0);
  target.a.forEach(a => { if (a.g.x >= cutX - 0.01 && !row.includes(a)) a.it.gl = a.it.gl.filter(g => g !== a.g); });
  const host = row.length ? row[row.length - 1].it : target.a[0].it, last = row.length ? row[row.length - 1].g : target.a[0].g;
  host.gl.push({x:cutX, top:last.top, r:cutX + ew, h:last.h, ch:'…', ell:true});
}

/* ---------------- display list → content stream ---------------- */
function pdfEmitText(it, W){
  const asc = W.asc.get(it.pk);
  const F = W.F[it.fk], A = W.F[it.alt], fs = it.size;
  let out = '';
  // runs: consecutive glyphs on the same line (same top) with the same font
  let run = null;
  const flush = () => {
    if (!run || !run.g.length) return;
    const [g0] = run.g, base = g0.top + asc;
    let s = 'BT /' + W.res(run.F) + ' 1 Tf ' + pdfRGB(it.col) + ' rg ' + pn(fs) + ' 0 ' + pn(-fs * it.skew) + ' ' + pn(-fs) + ' ' + pn(g0.x) + ' ' + pn(base) + ' Tm [<';
    let pen = g0.x;
    run.g.forEach(g => {
      if (Math.abs(g.x - pen) > 0.002) s += '> ' + pn(-(g.x - pen) * 1000 / fs) + ' <';
      s += pdfHex4(g.gid); pen = g.x + run.F.w1000(g.gid) * fs / 1000;
    });
    out += s + '>] TJ ET\n';
  };
  it.gl.forEach(g => {
    let x = g.x;
    for (const ch of g.ch){
      const cp = ch.codePointAt(0);
      let Fx = F, gid = F.cmap.get(cp) || 0;
      if (!gid && A){ gid = A.cmap.get(cp) || 0; if (gid) Fx = A; }
      if (!gid) continue;                                             // never draw .notdef boxes
      if (!run || run.F !== Fx || Math.abs(run.top - g.top) > 0.01){ flush(); run = {F:Fx, top:g.top, g:[]}; }
      run.g.push({x, top:g.top, gid});
      W.use(Fx, gid, ch);
      x += Fx.w1000(gid) * fs / 1000;
    }
  });
  flush();
  return out;
}

/* ---------------- main ---------------- */
async function pdfBuildLabels(progress){
  if (typeof DecompressionStream !== 'function') throw new Error(t('pdf_old'));
  progress && progress(t('pdf_fonts'));
  await pdfLoadFontScript();
  const sheetsHtml = buildLabelSheets(false);
  const doc = pdfDoc(), catalog = doc.ref(), pagesId = doc.ref(), resId = doc.ref(), info = doc.ref();
  const pageIds = [];
  const fontRes = new Map();                                            // font key → {name, F, used: Map gid → text}
  const W = { range:document.createRange(), probes:new Map(), asc:new Map(), keys:new Set(), F:{}, tf:new Map(), hidden:'' };
  W.res = (F) => { if (!fontRes.has(F.key)) fontRes.set(F.key, {name:'F' + fontRes.size, F, used:new Map()}); return fontRes.get(F.key).name; };
  W.use = (F, gid, ch) => { W.res(F); const u = fontRes.get(F.key).used; if (!u.has(gid)) u.set(gid, ch); };
  const stage = document.createElement('div');
  stage.id = 'pdf-stage'; stage.setAttribute('aria-hidden', 'true');
  stage.style.cssText = 'position:fixed;left:-30000px;top:0;width:210mm;pointer-events:none;contain:layout style';
  document.body.appendChild(stage);
  W.hidden = pdfPrintHidden(stage);
  const B = 4, n = sheetsHtml.length;
  try {
    for (const k of Object.keys(window.DM_PDF_FONTS.fonts)) W.F[k] = await pdfFont(k);
    for (let i0 = 0; i0 < n; i0 += B){
      progress && progress(t('pdf_busy', {i:Math.min(n, i0 + 1), n}), i0 / n);
      stage.innerHTML = sheetsHtml.slice(i0, i0 + B).join('');
      void stage.offsetHeight;
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      // transforms: remember the matrix, then lay everything out unrotated
      W.tf = new Map();
      const all = stage.querySelectorAll('*'), tfs = [];
      for (const e of all){ const tr = getComputedStyle(e).transform; if (tr && tr !== 'none') tfs.push([e, tr]); }
      tfs.forEach(([e, tr]) => {
        const v = (/matrix(3d)?\(([^)]+)\)/.exec(tr) || [])[2]; if (!v) return;
        const a = v.split(',').map(parseFloat);
        W.tf.set(e, a.length === 16 ? [a[0], a[1], a[4], a[5], a[12], a[13]] : a.slice(0, 6));
        e.style.setProperty('transform', 'none', 'important');
      });
      const lists = Array.from(stage.children).filter(s => s.classList.contains('sheet')).map(s => pdfWalkSheet(s, W));
      // baselines: one probe per font/size/line-height, all laid out at once
      const fresh = Array.from(W.probes).filter(([k]) => !W.asc.has(k));
      if (fresh.length){
        const box = document.createElement('div'); box.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:visible';
        const rows = fresh.map(([k, p]) => {
          const sp = document.createElement('span'), mk = document.createElement('span');
          sp.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;letter-spacing:0;text-transform:none';
          Object.assign(sp.style, {fontFamily:p.fam, fontWeight:p.w, fontStyle:p.st, fontSize:p.size + 'px', lineHeight:p.lh});
          sp.appendChild(document.createTextNode('H')); mk.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
          sp.appendChild(mk); box.appendChild(sp); return [k, sp, mk];
        });
        stage.appendChild(box);
        rows.forEach(([k, sp, mk]) => { W.range.selectNodeContents(sp.firstChild); const r = W.range.getClientRects()[0]; W.asc.set(k, mk.getBoundingClientRect().top - r.top); });
        box.remove();
      }
      for (const L of lists){
        let body = '';
        for (const it of L){
          if (typeof it === 'string') body += it + '\n';
          else if (it.gl.length) body += pdfEmitText(it, W);
        }
        const content = 'q 0.75 0 0 -0.75 0 ' + pn(PDF_A4[1]) + ' cm\n' + body + 'Q\n';
        const cid = doc.ref(), pid = doc.ref();
        await pdfStream(doc, cid, '', new TextEncoder().encode(content));
        doc.set(pid, '<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + pn(PDF_A4[0]) + ' ' + pn(PDF_A4[1]) + '] /Resources ' + resId + ' 0 R /Contents ' + cid + ' 0 R >>');
        pageIds.push(pid);
      }
      await pdfTick();
    }
  } finally { stage.remove(); }
  progress && progress(t('pdf_busy', {i:n, n}), 1);
  // fonts
  const fontDict = [];
  let tagN = 0;
  for (const [key, fr] of fontRes){
    const F = fr.F, gids = Array.from(fr.used.keys()).sort((a, b) => a - b);
    const ttf = ttfSubset(F, gids);
    const sc = 1000 / F.upm, mono = key.startsWith('mono');
    const tag = 'DM' + String.fromCharCode(65 + (tagN >> 8 & 15), 65 + (tagN >> 4 & 15), 65 + (tagN & 15), 65 + (key.length % 26)); tagN++;
    const wt = +key.split('-')[1], wname = {400:'Regular', 500:'Medium', 600:'SemiBold', 700:'Bold', 800:'ExtraBold', 900:'Black'}[wt] || String(wt);
    const base = tag + '+' + (mono ? 'JetBrainsMono' : 'Inter') + '-' + wname;
    const ff = doc.ref(), fd = doc.ref(), cidf = doc.ref(), tu = doc.ref(), t0 = doc.ref();
    await pdfStream(doc, ff, '/Length1 ' + ttf.length, ttf);
    doc.set(fd, '<< /Type /FontDescriptor /FontName /' + base + ' /Flags ' + (mono ? 33 : 32) + ' /FontBBox [' + F.bbox.map(v => Math.round(v * sc)).join(' ') + '] /ItalicAngle 0 /Ascent ' + Math.round(F.asc * sc) + ' /Descent ' + Math.round(F.desc * sc) + ' /CapHeight ' + Math.round(F.cap * sc) + ' /StemV ' + Math.round(50 + wt / 8) + ' /FontWeight ' + wt + ' /FontFile2 ' + ff + ' 0 R >>');
    // widths: runs of consecutive gids
    let wa = '', k = 0;
    while (k < gids.length){ let j = k; while (j + 1 < gids.length && gids[j + 1] === gids[j] + 1) j++; wa += gids[k] + ' [' + gids.slice(k, j + 1).map(g => F.w1000(g)).join(' ') + '] '; k = j + 1; }
    doc.set(cidf, '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /' + base + ' /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ' + fd + ' 0 R /DW ' + F.w1000(0) + ' /W [' + wa + '] /CIDToGIDMap /Identity >>');
    let cm = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
    for (let i = 0; i < gids.length; i += 100){
      const part = gids.slice(i, i + 100);
      cm += part.length + ' beginbfchar\n' + part.map(g => '<' + pdfHex4(g) + '> <' + Array.from(fr.used.get(g)).map(c => { const cp = c.codePointAt(0); return cp > 0xFFFF ? pdfHex4(0xD800 + ((cp - 0x10000) >> 10)) + pdfHex4(0xDC00 + ((cp - 0x10000) & 0x3FF)) : pdfHex4(cp); }).join('') + '>').join('\n') + '\nendbfchar\n';
    }
    cm += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
    await pdfStream(doc, tu, '', new TextEncoder().encode(cm));
    doc.set(t0, '<< /Type /Font /Subtype /Type0 /BaseFont /' + base + ' /Encoding /Identity-H /DescendantFonts [' + cidf + ' 0 R] /ToUnicode ' + tu + ' 0 R >>');
    fontDict.push('/' + fr.name + ' ' + t0 + ' 0 R');
  }
  doc.set(resId, '<< /ProcSet [/PDF /Text] /Font << ' + fontDict.join(' ') + ' >> >>');
  doc.set(pagesId, '<< /Type /Pages /Kids [' + pageIds.map(p => p + ' 0 R').join(' ') + '] /Count ' + pageIds.length + ' >>');
  doc.set(catalog, '<< /Type /Catalog /Pages ' + pagesId + ' 0 R /ViewerPreferences << /PrintScaling /None >> >>');
  const preset = findPreset(S.print.presetId) || {name:S.print.presetId};
  const title = 'DocMap — ' + t('nav_print') + ' — ' + preset.name;
  doc.set(info, '<< /Title ' + pdfUtf16Hex(title) + ' /Producer (DocMap 2026) /Creator (DocMap 2026 ' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '') + ') /CreationDate (' + pdfDate(new Date()) + ') >>');
  return { bytes:pdfSerialize(doc, catalog, info), pages:pageIds.length };
}

function pdfFileName(){
  const d = new Date(), p = (n) => ('0' + n).slice(-2);
  return 'DocMap_etichette_' + String(S.print.presetId || 'custom').replace(/[^A-Za-z0-9_-]+/g, '-') + '_' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '.pdf';
}
function pdfProgressUI(){
  let el = null;
  return {
    set(msg, f){
      if (!el){ el = document.createElement('div'); el.id = 'pdf-progress'; el.setAttribute('role', 'status');
        el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:200;background:var(--text,#0F172A);color:#fff;padding:12px 18px;border-radius:12px;font-size:14px;box-shadow:0 10px 30px -10px rgba(15,23,42,.5);min-width:260px';
        document.body.appendChild(el); }
      el.innerHTML = esc(msg) + (f != null ? '<div style="height:4px;background:rgba(255,255,255,.25);border-radius:2px;margin-top:8px"><div style="height:4px;border-radius:2px;background:#60A5FA;width:' + Math.round(f * 100) + '%"></div></div>' : '');
    },
    done(){ if (el) el.remove(); el = null; }
  };
}
/* Same "partial sheet" question the print path asks (printLabels in 03-print). */
function pdfAskUsedSlots(L){
  const N = slotCount(), last = L.pages[L.pages.length - 1] || [];
  const base = L.pages.length === 1 ? new Set(L.used) : new Set();
  last.forEach(x => base.add(x.s));
  const full = base.size >= N;
  let nextFree = 1; for (let i = 0; i < N; i++){ if (!base.has(i)){ nextFree = i + 1; break; } }
  openModal({
    title:t('pdf_after_t'),
    body:'<p style="margin:0">' + esc(full ? t('pdf_after_full') : t('pdf_after_p', {n:last.length, s:nextFree})) + '</p>',
    buttons:[
      {label:t('no_thanks'), cls:'btn', action:'modal-close'},
      {label:t('yes_update'), cls:'btn btn-primary', icon:'check', fn:() => {
        S.usedSlots[S.print.presetId] = full ? [] : Array.from(base).sort((a, b) => a - b);
        savePrefs(); closeModal(); if (S.view === 'print') renderView();
      }}
    ]
  });
}
async function pdfDownloadLabels(){
  if (PDF.busy) return;
  const L = layoutLabels();
  if (!L.items){ toast(t('pr_none'), 'warn'); return; }
  PDF.busy = true;
  const ui = pdfProgressUI(), t0 = performance.now();
  try {
    const r = await pdfBuildLabels(L.pages.length > 2 ? (m, f) => ui.set(m, f) : null);
    const name = pdfFileName(), blob = new Blob([r.bytes], {type:'application/pdf'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    PDF.last = {name, bytes:r.bytes.length, pages:r.pages, ms:Math.round(performance.now() - t0)};
    ui.done();
    toast(t('pdf_done', {n:r.pages}), 'ok', 9000);
    pdfAskUsedSlots(L);
  } catch(e){
    ui.done(); console.warn('PDF', e);
    toast(t('pdf_err', {e:(e && e.message) || String(e)}), 'err', 9000);
  } finally { PDF.busy = false; }
}

const PDF_ACTIONS = { 'pdf-download': () => pdfDownloadLabels() };

/* ---------------- help topic (HELP_TOPICS is defined later, in 07-help.js) ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined') return;
  const pr = HELP_TOPICS.find(x => x.id === 'print');
  if (pr) pr.related = (pr.related || []).concat(['pdf']);
  HELP_TOPICS.push({ id:'pdf', guide:null, tags:['print', 'label'], related:['print', 'calib', 'partial'],
    title:{it:'Scarica PDF: stampare da un altro PC o da una chiavetta', en:'Download PDF: print from another PC or a USB stick'},
    body:{
      it:'<p>Il pulsante <b>Scarica PDF</b> (in <b>Stampa etichette</b>, accanto a Stampa) crea un file PDF pulito, già pronto per la stampa, con le stesse etichette, lo stesso foglio e le stesse misure della stampa diretta. Non serve Internet.</p><ul><li>Il foglio è <b>A4 esatto</b>, le misure sono al millimetro: rispetta i margini, gli offset di calibrazione, le etichette girate di MRINK143 e il foglio parziale (le caselle già usate restano vuote).</li><li>Testi e QR sono <b>vettoriali</b>: nitidi a qualsiasi risoluzione; il testo si può cercare e copiare.</li><li>Puoi copiarlo su una chiavetta o mandarlo per e-mail e stamparlo da qualunque PC.</li></ul><p><b>Quando lo stampi</b> scegli <b>Scala 100%</b> / <b>Dimensioni effettive</b>. Non usare <b>Adatta alla pagina</b> o <b>Riduci</b>: le etichette non combacerebbero più con il foglio.</p><p>Dopo il download DocMap chiede se segnare come "già usate" le caselle dell\'ultimo foglio, come dopo una stampa.</p>',
      en:'<p>The <b>Download PDF</b> button (in <b>Print labels</b>, next to Print) creates a clean, print-ready PDF file with the same labels, sheet and measurements as direct printing. No Internet needed.</p><ul><li>The page is <b>exact A4</b>, millimetre-accurate: margins, calibration offsets, the turned labels of MRINK143 and the partial sheet (used slots stay empty) are all respected.</li><li>Text and QR codes are <b>vector</b>: sharp at any resolution; the text can be searched and copied.</li><li>Copy it to a USB stick or e-mail it and print it from any PC.</li></ul><p><b>When you print it</b> choose <b>Scale 100%</b> / <b>Actual size</b>. Do not use <b>Fit to page</b> or <b>Shrink</b>: the labels would no longer match the sheet.</p><p>After the download DocMap asks whether to mark the slots of the last sheet as "used", just like after printing.</p>'
    } });
});
