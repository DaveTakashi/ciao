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

   v10 — maximum compatibility (RIPs, Acrobat, old drivers, print shops):
   - PDF 1.4 header + binary comment line, classic xref table with exact
     byte offsets (no object / xref streams), trailer /ID, /Info + XMP.
   - every font embedded (TrueType subset, CIDFontType2 / Identity-H,
     /CIDToGIDMap /Identity, /W, /CIDSet, ToUnicode); no Type3, no images.
   - no transparency at all: no /Group, /SMask, /ca, /CA, blend modes.
     rgba() colours and CSS opacity are flattened over the white sheet
     (the faint MRINK143 cut line becomes a solid light grey).
   - DeviceRGB by default; option S.print.pdfCmyk ("PDF per tipografia")
     writes DeviceCMYK, with black and neutral greys as K only
     (0 0 0 1 k), so text and QR codes print with one ink.
   - page boxes MediaBox = CropBox = TrimBox = BleedBox = A4, /Rotate 0,
     no annotations; /ViewerPreferences /PrintScaling /None (Acrobat opens
     the print dialog at 100 %).
   - strokes at least 0.1 pt; QR modules as one fill of merged rectangles
     (runs per row, equal runs merged across rows) → no hairline seams.
   - page selection / order (S.print.pages) is applied by
     buildLabelSheets(false), so the PDF has exactly the pages a print has.
   ===================================================================== */
const PDF_A4 = [595.2756, 841.8898];
const PDF_FONT_SRC = 'vendor/pdf-fonts.js';
const PDF_WEIGHTS = { sans:[400, 500, 600, 700, 800, 900], mono:[400, 500, 600, 700, 800] };
const PDF_SKEW = 0.25;            // synthetic oblique, same slant as Chrome (no italic face is bundled)
const PDF = { busy:false, fonts:{}, last:null, cmyk:false };
const PDF_MIN_LW = 0.1 / 0.75;    // 0.1 pt in sheet px: thinnest stroke written

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
/* CSS colour → opaque RGB 0..1. Alpha and the element's (inherited) opacity `op` are flattened
   over the white sheet, so the PDF never needs transparency. */
function pdfColor(str, op){
  const m = /rgba?\(([^)]+)\)/.exec(str || ''); if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
  const a = (p.length > 3 ? p[3] : 1) * (op == null ? 1 : op);   // getComputedStyle always gives decimal alpha
  if (!(a > 0.004)) return null;
  return p.slice(0, 3).map(v => Math.min(1, Math.max(0, 1 - a + a * v / 255)));   // blended over the white sheet
}
const pdfRGB = (c) => c.map(v => pn(v)).join(' ');
/* RGB → DeviceCMYK for the print-shop option: neutral colours (black, greys) become K only. */
function pdfCMYK(c){
  const [r, g, b] = c;
  if (Math.max(r, g, b) - Math.min(r, g, b) < 0.012){ const k = 1 - (r + g + b) / 3; return [0, 0, 0, k < 0.004 ? 0 : k > 0.996 ? 1 : k]; }
  const k = 1 - Math.max(r, g, b); if (k >= 0.999) return [0, 0, 0, 1];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k];
}
const pdfFillOp = (c) => PDF.cmyk ? pdfCMYK(c).map(pn).join(' ') + ' k' : pdfRGB(c) + ' rg';
const pdfStrokeOp = (c) => PDF.cmyk ? pdfCMYK(c).map(pn).join(' ') + ' K' : pdfRGB(c) + ' RG';
const pdfLW = (w) => pn(Math.max(PDF_MIN_LW, w)) + ' w';

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
  push('%PDF-1.4\n'); push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
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
function pdfXmlEsc(s){ return String(s).replace(/[<>&"']/g, c => ({'<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;'})[c]); }
function pdfIsoDate(d){ const p = (n) => ('0' + n).slice(-2), tz = -d.getTimezoneOffset(), a = Math.abs(tz); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + (tz >= 0 ? '+' : '-') + p(Math.floor(a / 60)) + ':' + p(a % 60); }
function pdfXmp(o){
  const iso = pdfIsoDate(o.now), id = 'uuid:' + (typeof uuid === 'function' ? uuid() : Date.now());
  return '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/">\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/">\n' +
    '<dc:format>application/pdf</dc:format>\n<dc:title><rdf:Alt><rdf:li xml:lang="x-default">' + pdfXmlEsc(o.title) + '</rdf:li></rdf:Alt></dc:title>\n' +
    (o.author ? '<dc:creator><rdf:Seq><rdf:li>' + pdfXmlEsc(o.author) + '</rdf:li></rdf:Seq></dc:creator>\n' : '') +
    '<xmp:CreateDate>' + iso + '</xmp:CreateDate>\n<xmp:ModifyDate>' + iso + '</xmp:ModifyDate>\n<xmp:MetadataDate>' + iso + '</xmp:MetadataDate>\n<xmp:CreatorTool>' + pdfXmlEsc(o.creator) + '</xmp:CreatorTool>\n' +
    '<pdf:Producer>DocMap 2026</pdf:Producer>\n<pdf:Keywords>DocMap, DM26, ' + (o.cmyk ? 'CMYK' : 'RGB') + '</pdf:Keywords>\n<pdf:Trapped>False</pdf:Trapped>\n<xmpMM:DocumentID>' + id + '</xmpMM:DocumentID>\n<xmpMM:InstanceID>' + id + '</xmpMM:InstanceID>\n' +
    '</rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>\n' + ' '.repeat(1024) + '\n<?xpacket end="w"?>';
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
/* QR paths from DMQR.svg are only "M x y h w v1 h-w z" rectangles (one per run of dark modules in a row).
   Merge equal runs of consecutive rows into taller rectangles and write them as `re` in ONE fill:
   fewer edges, no anti-alias seams between rows. Returns null for any other path (generic parser then). */
function pdfQrRects(d){
  const src = String(d || ''), re = /M(\d+) (\d+)h(\d+)v1h-\3z/g;
  let m, len = 0; const open = new Map(), out = [];       // key "x,w" → rect currently growing
  while ((m = re.exec(src))){
    if (m.index !== len) return null;
    len = re.lastIndex;
    const x = +m[1], y = +m[2], w = +m[3], k = x + ',' + w, r = open.get(k);
    if (r && r.y + r.h === y) r.h++;
    else { const n = {x, y, w, h:1}; open.set(k, n); out.push(n); }
  }
  if (!out.length || len !== src.length) return null;
  return out.map(r => r.x + ' ' + r.y + ' ' + r.w + ' ' + r.h + ' re').join(' ') + ' ';
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
  function text(node, cs, op){
    const s = node.data; if (!s) return;
    const fam = pdfFamily(cs), size = pdfPx(cs.fontSize); if (!(size > 0)) return;
    const col = pdfColor(cs.color, op); if (!col) return;
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
  function el(e, op0){
    const cs = getComputedStyle(e);
    const op = (op0 == null ? 1 : op0) * (+cs.opacity >= 0 ? +cs.opacity : 1);   // CSS opacity, flattened into the colours
    if (cs.display === 'none' || (W.hidden && e.matches(W.hidden))) return;
    const R = e.getBoundingClientRect(), x = R.left - ox, y = R.top - oy, w = R.width, h = R.height;
    const vis = cs.visibility === 'visible' && op > 0.01;
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
      const rad = pdfRadii(cs), bg = pdfColor(cs.backgroundColor, op);
      if (bg) L.push(pdfFillOp(bg) + ' ' + pdfRectPath(x, y, w, h, rad) + ' f');
      const sides = ['Top', 'Right', 'Bottom', 'Left'].map(k => ({w:cs['border' + k + 'Style'] === 'none' || cs['border' + k + 'Style'] === 'hidden' ? 0 : pdfPx(cs['border' + k + 'Width']), st:cs['border' + k + 'Style'], c:pdfColor(cs['border' + k + 'Color'], op)}));
      const same = sides.every(s => s.w === sides[0].w && s.st === sides[0].st && String(s.c) === String(sides[0].c));
      if (same && sides[0].w > 0 && sides[0].c){
        const s = sides[0], hw = s.w / 2;
        L.push('q ' + pdfStrokeOp(s.c) + ' ' + pdfLW(s.w) + ' ' + pdfDash(s.st, s.w) + pdfRectPath(x + hw, y + hw, w - s.w, h - s.w, rad.map(r => r - hw)) + ' S Q');
      } else sides.forEach((s, i) => {
        if (!(s.w > 0) || !s.c) return;
        const hw = s.w / 2, ln = [[x, y + hw, x + w, y + hw], [x + w - hw, y, x + w - hw, y + h], [x, y + h - hw, x + w, y + h - hw], [x + hw, y, x + hw, y + h]][i];
        L.push('q ' + pdfStrokeOp(s.c) + ' ' + pdfLW(s.w) + ' ' + pdfDash(s.st, s.w) + pn(ln[0]) + ' ' + pn(ln[1]) + ' m ' + pn(ln[2]) + ' ' + pn(ln[3]) + ' l S Q');
      });
      const ow = cs.outlineStyle !== 'none' ? pdfPx(cs.outlineWidth) : 0, oc = pdfColor(cs.outlineColor, op);
      if (ow > 0 && oc){
        const off = pdfPx(cs.outlineOffset) + ow / 2;
        L.push('q ' + pdfStrokeOp(oc) + ' ' + pdfLW(ow) + ' ' + pdfDash(cs.outlineStyle, ow) + pdfRectPath(x - off, y - off, w + 2 * off, h + 2 * off, rad.map(r => r > 0 ? r + off : 0)) + ' S Q');
      }
      if (tag === 'svg' || tag === 'SVG') svg(e, x, y, w, h, op);
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
      if (ch.nodeType === 1) el(ch, op);
      else if (ch.nodeType === 3 && vis) text(ch, cs, op);
    }
    // text-overflow: ellipsis (one line) and -webkit-line-clamp (n lines): the browser hides the rest and draws "…"
    const clampN = parseInt(cs.webkitLineClamp, 10);
    if ((cs.textOverflow === 'ellipsis' && cs.overflowX !== 'visible') || clampN > 0){
      const limit = x + w - pdfPx(cs.borderRightWidth) - pdfPx(cs.paddingRight);
      pdfEllipsis(L.slice(start).filter(it => it.t === 'text'), limit, clampN > 0 ? clampN : 0, W);
    }
    while (pops--){ L.push('Q'); clip.pop(); }
  }
  function svg(e, x, y, w, h, op){
    const vb = (e.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || !(vb[2] > 0 && vb[3] > 0)) return;
    const s = Math.min(w / vb[2], h / vb[3]), tx = x + (w - vb[2] * s) / 2 - vb[0] * s, ty = y + (h - vb[3] * s) / 2 - vb[1] * s;
    let out = '';
    e.querySelectorAll('rect,path').forEach(n => {
      const ncs = getComputedStyle(n), c = pdfColor(ncs.fill, op * (+ncs.fillOpacity >= 0 ? +ncs.fillOpacity : 1) * (+ncs.opacity >= 0 ? +ncs.opacity : 1)); if (!c) return;
      if (n.tagName === 'rect'){ const a = (k) => parseFloat(n.getAttribute(k)) || 0; out += pdfFillOp(c) + ' ' + pn(a('x')) + ' ' + pn(a('y')) + ' ' + pn(a('width')) + ' ' + pn(a('height')) + ' re f\n'; }
      else { const d = n.getAttribute('d'), p = pdfQrRects(d) || pdfSvgPath(d); if (p) out += pdfFillOp(c) + ' ' + p + 'f\n'; }
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
    let s = 'BT /' + W.res(run.F) + ' 1 Tf ' + pdfFillOp(it.col) + ' ' + pn(fs) + ' 0 ' + pn(-fs * it.skew) + ' ' + pn(-fs) + ' ' + pn(g0.x) + ' ' + pn(base) + ' Tm [<';
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
  PDF.cmyk = !!S.print.pdfCmyk;
  const sheetsHtml = buildLabelSheets(false);                         // respects S.print.pages (selection / order)
  if (!sheetsHtml.length) throw new Error(t('pg_none'));
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
        const box = '[0 0 ' + pn(PDF_A4[0]) + ' ' + pn(PDF_A4[1]) + ']';   // every box = the A4 sheet: nothing to crop, trim or bleed
        doc.set(pid, '<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox ' + box + ' /CropBox ' + box + ' /BleedBox ' + box + ' /TrimBox ' + box + ' /Rotate 0 /Resources ' + resId + ' 0 R /Contents ' + cid + ' 0 R >>');
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
    const ff = doc.ref(), fd = doc.ref(), cidf = doc.ref(), tu = doc.ref(), t0 = doc.ref(), cset = doc.ref();
    await pdfStream(doc, ff, '/Length1 ' + ttf.length, ttf);
    // /CIDSet: one bit per CID present in the subset (CID = GID, Identity)
    const bits = new Uint8Array((gids[gids.length - 1] >> 3) + 1); bits[0] |= 0x80; gids.forEach(g => { bits[g >> 3] |= 0x80 >> (g & 7); });
    await pdfStream(doc, cset, '', bits);
    // Flags: 32 = Nonsymbolic (Latin text), + 1 = FixedPitch for the mono face; synthetic oblique is drawn with Tm, not flagged
    doc.set(fd, '<< /Type /FontDescriptor /FontName /' + base + ' /Flags ' + (mono ? 33 : 32) + ' /FontBBox [' + F.bbox.map(v => Math.round(v * sc)).join(' ') + '] /ItalicAngle 0 /Ascent ' + Math.round(F.asc * sc) + ' /Descent ' + Math.round(F.desc * sc) + ' /CapHeight ' + Math.round(F.cap * sc) + ' /StemV ' + Math.round(50 + wt / 8) + ' /FontWeight ' + wt + ' /FontFile2 ' + ff + ' 0 R /CIDSet ' + cset + ' 0 R >>');
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
  const preset = findPreset(S.print.presetId) || {name:S.print.presetId};
  const title = 'DocMap — ' + t('nav_print') + ' — ' + preset.name, now = new Date(), when = pdfDate(now);
  const author = String((S.settings && S.settings.studioName) || ''), creator = 'DocMap 2026 ' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '');
  // XMP (uncompressed, as most validators expect) mirrors /Info
  const meta = doc.ref();
  doc.set(meta, '/Type /Metadata /Subtype /XML', new TextEncoder().encode(pdfXmp({title, author, creator, now, pages:pageIds.length, cmyk:PDF.cmyk})));
  doc.set(catalog, '<< /Type /Catalog /Pages ' + pagesId + ' 0 R /Metadata ' + meta + ' 0 R /PageLayout /SinglePage /Lang (' + (S.lang === 'en' ? 'en-GB' : 'it-IT') + ') /ViewerPreferences << /PrintScaling /None /DisplayDocTitle true >> >>');
  doc.set(info, '<< /Title ' + pdfUtf16Hex(title) + (author ? ' /Author ' + pdfUtf16Hex(author) : '') + ' /Subject ' + pdfUtf16Hex(t('pdf_subject', {n:pageIds.length})) + ' /Keywords (DocMap, DM26, ' + (PDF.cmyk ? 'CMYK' : 'RGB') + ') /Producer (DocMap 2026) /Creator (' + creator + ') /CreationDate (' + when + ') /ModDate (' + when + ') /Trapped /False >>');
  return { bytes:pdfSerialize(doc, catalog, info), pages:pageIds.length, cmyk:PDF.cmyk };
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
/* Same "partial sheet" question the print path asks (printLabels in 03-print);
   skipped when the page selection left the last sheet of the job out. */
function pdfAskUsedSlots(L){
  if (!labelPageOrder(L).includes(L.pages.length - 1)) return;
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
  pagesCheck(true);
  const L = layoutLabels();
  if (!L.items){ toast(t('pr_none'), 'warn'); return; }
  if (!labelPageOrder(L).length){ toast(t('pg_none'), 'warn'); return; }
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

/* =====================================================================
   v10 — "Pagine": which sheets to print / export and in which order.
   Core rules (state S.print.pages, labelPageOrder, pageSelParse, pageSig)
   are in 03-print.js; here: the Stampa panel section, actions, notice.
   Partial sheet: the used-slot skip belongs to ORIGINAL sheet 1 (it is the
   one printed on the partially used paper). Reordering keeps it on that
   sheet; the panel tells the user at which position of the job it comes
   out, so the partially used paper can be put in the tray at that point.
   ===================================================================== */
Object.assign(I18N.it, {
  pg_h:'Pagine', pg_count:'{n} fogli in questa stampa', pg_count1:'1 foglio in questa stampa', pg_out:'Escono: {s}',
  pg_all:'Tutte', pg_sel:'Solo le pagine', pg_sel_ph:'es. 1-3,5', pg_sel_d:'Numeri dei fogli separati da virgola, intervalli con il trattino (1-3). Vuoto o "Tutte" = tutti i fogli.',
  pg_rev:'Ordine inverso (dall\'ultimo al primo)', pg_rev_d:'Utile con le stampanti che fanno uscire i fogli a faccia in su: alla fine la pila è già in ordine.',
  pg_list:'Ordine e anteprima dei fogli', pg_sheet:'Foglio {n}', pg_up:'Sposta su', pg_down:'Sposta giù', pg_first:'Stampa per primo', pg_first_s:'Prima',
  pg_reset:'Ripristina: tutte, in ordine', pg_pos:'{n}°', pg_skip:'non stampato', pg_partial:'foglio parziale',
  pg_none:'Nessuna pagina selezionata: controlla il campo "Pagine" nel pannello Stampa.', pg_bad:'Alcuni numeri non esistono: ci sono solo {n} fogli.',
  pg_reset_n:'La coda di stampa è cambiata: la scelta delle pagine e il loro ordine sono stati azzerati (si stampano tutte, in ordine).',
  pg_partial_w:'Il foglio 1 va stampato sul foglio già usato in parte (caselle saltate). Con quest\'ordine esce per {k}°: metti il foglio già usato in quella posizione nel cassetto.',
  pg_partial_x:'Il foglio 1 (quello per il foglio già usato in parte) non viene stampato: la mappa del foglio parziale resta com\'è.',
  pg_last_x:'L\'ultimo foglio non viene stampato: dopo la stampa DocMap non aggiornerà la mappa del foglio parziale.',
  pg_more:'… e altri {n} fogli (usa il campo "Solo le pagine")',
  pg_cmyk:'PDF per tipografia (CMYK, nero solo K)', pg_cmyk_d:'Scarica PDF scrive i colori in CMYK: testo nero, QR e grigi con il solo inchiostro nero (0/0/0/100). Lascialo spento per la stampa in ufficio.',
  pdf_subject:'Etichette DocMap, {n} fogli A4, stampa al 100%'
});
Object.assign(I18N.en, {
  pg_h:'Pages', pg_count:'{n} sheets in this print', pg_count1:'1 sheet in this print', pg_out:'Output: {s}',
  pg_all:'All', pg_sel:'Only pages', pg_sel_ph:'e.g. 1-3,5', pg_sel_d:'Sheet numbers separated by commas, ranges with a dash (1-3). Empty or "All" = every sheet.',
  pg_rev:'Reverse order (last to first)', pg_rev_d:'Useful with printers that deliver face up: the stack ends up in order.',
  pg_list:'Order and preview of the sheets', pg_sheet:'Sheet {n}', pg_up:'Move up', pg_down:'Move down', pg_first:'Print first', pg_first_s:'First',
  pg_reset:'Reset: all, in order', pg_pos:'#{n}', pg_skip:'not printed', pg_partial:'partial sheet',
  pg_none:'No page selected: check the "Pages" field in the Print panel.', pg_bad:'Some numbers do not exist: there are only {n} sheets.',
  pg_reset_n:'The print queue changed: the page selection and order were reset (all pages, in order).',
  pg_partial_w:'Sheet 1 must be printed on the partially used paper sheet (skipped slots). With this order it comes out #{k}: put the partially used sheet at that position in the tray.',
  pg_partial_x:'Sheet 1 (the one for the partially used paper sheet) is not printed: the partial sheet map stays as it is.',
  pg_last_x:'The last sheet is not printed: after printing DocMap will not update the partial sheet map.',
  pg_more:'… and {n} more sheets (use the "Only pages" field)',
  pg_cmyk:'PDF for print shops (CMYK, K-only black)', pg_cmyk_d:'Download PDF writes CMYK colours: black text, QR codes and greys use black ink only (0/0/0/100). Keep it off for office printing.',
  pdf_subject:'DocMap labels, {n} A4 sheets, print at 100%'
});
const PG_LIST_MAX = 120;   // rows in the page list (bigger jobs: use the range field)
/* 1-based numbers → compact "1-3,5" */
function pageSelString(nums){
  const a = Array.from(new Set(nums)).sort((x, y) => x - y), out = [];
  for (let i = 0; i < a.length; i++){ let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++; out.push(j > i ? a[i] + '-' + a[j] : String(a[i])); i = j; }
  return out.join(',');
}
/* Current state for the current layout: stale sel/order (queue changed) read as natural. */
function pagesNow(){
  const L = layoutLabels(), n = L.pages.length, c = pagesCfg(), fresh = !c.sig || c.sig === pageSig(L);
  return { L, n, c, fresh, order:fresh && pageOrderValid(c.order, n) ? c.order.slice() : Array.from({length:n}, (_, i) => i + 1), sel:fresh ? pageSelParse(c.sel, n) : {set:null, bad:false} };
}
/* Stale selection / order (the queue changed the pages) → reset with a notice. Returns true if it reset. */
function pagesCheck(withToast){
  const c = pagesCfg();
  if (!c.sig || (c.sel === 'all' && !c.order)) return false;
  if (c.sig === pageSig(layoutLabels())) return false;
  S.print.pages = {sel:'all', reverse:c.reverse, order:null, sig:''};
  savePrefs(); PDF.pgNotice = true;
  if (withToast) toast(t('pg_reset_n'), 'warn', 7000);
  return true;
}
function pagesSet(patch){
  const N = pagesNow();
  const nx = Object.assign({reverse:N.c.reverse, sel:N.fresh ? N.c.sel : 'all', order:N.fresh ? N.c.order : null}, patch);
  if (nx.order && (!pageOrderValid(nx.order, N.n) || nx.order.every((v, i) => v === i + 1))) nx.order = null;
  nx.sel = String(nx.sel == null ? 'all' : nx.sel).trim() || 'all';
  nx.sig = (nx.sel !== 'all' || nx.order) ? pageSig(N.L) : '';
  S.print.pages = nx; PDF.pgNotice = false; savePrefs();
  if (typeof refreshPrint === 'function' && $('#pr-pages')) refreshPrint();
}
/* Mini sheet: slots coloured by binder, used slots of the partial sheet hatched. */
function pageThumb(L, pi){
  const g = S.print.geometry, N = slotCount(), filled = new Map((L.pages[pi] || []).map(x => [x.s, x.item.b]));
  let h = '';
  for (let s = 0; s < N; s++){
    const R = slotRect(s), b = filled.get(s), used = pi === 0 && L.used.has(s);
    h += '<i class="' + (used ? 'u' : b ? 'f' : '') + '" style="left:' + r1(R.x / 2.1) + '%;top:' + r1(R.y / 2.97) + '%;width:' + r1(g.w / 2.1) + '%;height:' + r1(g.h / 2.97) + '%' + (b ? ';background:' + esc(b.color_hex || '#94A3B8') : '') + '"></i>';
  }
  return '<span class="pg-th" aria-hidden="true">' + h + '</span>';
}
function pagesPanelHTML(){
  const N = pagesNow(), {L, n, c} = N;
  if (!n) return '<div class="hint">' + esc(t('pr_none')) + '</div>';
  const ord = labelPageOrder(L), pos = new Map(ord.map((pi, k) => [pi, k + 1])), partial = L.used.size > 0;
  const custom = N.fresh && pageOrderValid(c.order, n);
  const outTxt = ord.length === n && !c.reverse && !custom ? t('pg_all') : ord.slice(0, 14).map(i => i + 1).join(', ') + (ord.length > 14 ? ' …' : '');
  let h = '<div class="pg-top"><b id="pg-count">' + esc(n === 1 ? t('pg_count1') : t('pg_count', {n})) + '</b><span class="tiny muted" id="pg-out">' + esc(t('pg_out', {s:outTxt})) + '</span></div>';
  if (PDF.pgNotice) h += '<div class="warn-box small pg-msg" id="pg-notice">' + ic('alert') + '<div>' + esc(t('pg_reset_n')) + '</div></div>';
  h += '<div class="row pg-sel-row"><button type="button" class="btn btn-sm' + (N.sel.set ? '' : ' btn-primary') + '" data-a="pg-all">' + esc(t('pg_all')) + '</button>' +
    '<label class="small row" style="gap:6px;flex:1;min-width:160px">' + esc(t('pg_sel')) + ' <input class="inp mono" id="pg-sel" style="flex:1;min-width:80px;min-height:34px;padding:4px 8px" placeholder="' + esc(t('pg_sel_ph')) + '" value="' + esc(N.sel.set ? c.sel : '') + '" title="' + esc(t('pg_sel_d')) + '"></label></div>';
  if (N.sel.bad) h += '<div class="err-t small">' + esc(t('pg_bad', {n})) + '</div>';
  if (!ord.length) h += '<div class="err-t small" id="pg-empty">' + esc(t('pg_none')) + '</div>';
  h += '<label class="chk small"><input type="checkbox" data-a="pg-rev"' + (c.reverse ? ' checked' : '') + '><span>' + esc(t('pg_rev')) + '<br><span class="muted">' + esc(t('pg_rev_d')) + '</span></span></label>';
  if (partial){
    const k = pos.get(0);
    if (!k) h += '<div class="info-box small pg-msg">' + ic('info') + '<div>' + esc(t('pg_partial_x')) + '</div></div>';
    else if (k !== 1) h += '<div class="warn-box small pg-msg" id="pg-partial-warn">' + ic('alert') + '<div>' + esc(t('pg_partial_w', {k})) + '</div></div>';
  }
  if (ord.length && !pos.has(n - 1)) h += '<div class="hint pg-msg">' + esc(t('pg_last_x')) + '</div>';
  const open = custom || (N.sel.set && n > 1) || PDF.pgOpen;
  h += '<details class="pg-det" id="pg-det"' + (open ? ' open' : '') + '><summary>' + ic('list') + ' ' + esc(t('pg_list')) + '</summary><div class="pg-list">';
  N.order.slice(0, PG_LIST_MAX).forEach((p1, k) => {
    const pi = p1 - 1, codes = Array.from(new Set((L.pages[pi] || []).map(x => x.item.b.speaking_code))), on = pos.has(pi);
    h += '<div class="pg-row' + (on ? '' : ' off') + '" data-p="' + pi + '"><input type="checkbox" data-a="pg-tick" data-p="' + pi + '"' + (on ? ' checked' : '') + ' aria-label="' + esc(t('pg_sheet', {n:p1})) + '">' + pageThumb(L, pi) +
      '<span class="pg-tx"><span><b>' + esc(t('pg_sheet', {n:p1})) + '</b>' + (pi === 0 && partial ? ' <span class="badge b-out">' + esc(t('pg_partial')) + '</span>' : '') + '</span>' +
      '<span class="pg-codes mono" title="' + esc(codes.join(', ')) + '">' + esc(codes.slice(0, 6).join(', ') + (codes.length > 6 ? ' +' + (codes.length - 6) : '')) + '</span></span>' +
      '<span class="pg-pos">' + esc(on ? t('pg_pos', {n:pos.get(pi)}) : t('pg_skip')) + '</span>' +
      '<span class="pg-btns"><button type="button" class="icon-btn" data-a="pg-first" data-p="' + pi + '" title="' + esc(t('pg_first')) + '"' + (k === 0 ? ' disabled' : '') + '>' + esc(t('pg_first_s')) + '</button>' +
      '<button type="button" class="icon-btn" data-a="pg-up" data-p="' + pi + '" title="' + esc(t('pg_up')) + '" aria-label="' + esc(t('pg_up')) + '"' + (k === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button type="button" class="icon-btn" data-a="pg-down" data-p="' + pi + '" title="' + esc(t('pg_down')) + '" aria-label="' + esc(t('pg_down')) + '"' + (k === n - 1 ? ' disabled' : '') + '>↓</button></span></div>';
  });
  if (n > PG_LIST_MAX) h += '<div class="tiny muted">' + esc(t('pg_more', {n:n - PG_LIST_MAX})) + '</div>';
  h += '</div><button type="button" class="btn btn-sm" data-a="pg-reset" style="margin-top:8px">' + ic('rotate') + esc(t('pg_reset')) + '</button></details>';
  h += '<div class="sep" style="margin:10px 0"></div><label class="chk small"><input type="checkbox" data-a="pdf-cmyk"' + (S.print.pdfCmyk ? ' checked' : '') + '><span><b>' + esc(t('pg_cmyk')) + '</b><br><span class="muted">' + esc(t('pg_cmyk_d')) + '</span></span></label>';
  return h;
}
/* Called by refreshPrint() (05-views). */
function renderPagesPanel(){
  const box = $('#pr-pages'); if (!box) return;
  pagesCheck(false);
  const det = $('#pg-det'); if (det) PDF.pgOpen = det.open;
  const a = document.activeElement, keep = a && a.id === 'pg-sel' ? {v:a.value, s:a.selectionStart} : null;
  box.innerHTML = pagesPanelHTML();
  if (keep){ const i = $('#pg-sel'); if (i){ i.value = keep.v; i.focus(); try { i.setSelectionRange(keep.s, keep.s); } catch(e){} } }
}
function pagesMove(pi, how){
  const o = pagesNow().order, k = o.indexOf(pi + 1); if (k < 0) return;
  o.splice(k, 1);
  o.splice(how === 'first' ? 0 : how === 'up' ? Math.max(0, k - 1) : Math.min(o.length, k + 1), 0, pi + 1);
  PDF.pgOpen = true;
  pagesSet({order:o});
}
const PAGE_ACTIONS = {
  'pg-all': () => pagesSet({sel:'all'}),
  'pg-rev': (el) => pagesSet({reverse:!!el.checked}),
  'pg-tick': (el) => {
    const N = pagesNow(), cur = N.sel.set || new Set(Array.from({length:N.n}, (_, i) => i)), pi = +el.dataset.p;
    if (el.checked) cur.add(pi); else cur.delete(pi);
    PDF.pgOpen = true;
    pagesSet({sel:cur.size === N.n ? 'all' : cur.size ? pageSelString(Array.from(cur, i => i + 1)) : 'none'});
  },
  'pg-up': (el) => pagesMove(+el.dataset.p, 'up'),
  'pg-down': (el) => pagesMove(+el.dataset.p, 'down'),
  'pg-first': (el) => pagesMove(+el.dataset.p, 'first'),
  'pg-reset': () => { PDF.pgOpen = false; pagesSet({sel:'all', order:null, reverse:false}); },
  'pdf-cmyk': (el) => { S.print.pdfCmyk = !!el.checked; savePrefs(); }
};
if (typeof document !== 'undefined') document.addEventListener('change', (e) => {
  const el = e.target; if (!el || el.id !== 'pg-sel') return;
  pagesSet({sel:el.value.trim() || 'all'});
});
/* compact styles of the section (kept here so the module is self-contained) + one print fix:
   in a multi-sheet print, Chrome fragments the UNROTATED layout box of turned labels (MRINK143:
   74×105 mm frame in a 105×74 mm slot) at the page end, so the bottom row of every sheet but the
   last lost about a third of its content. `contain:strict` makes each sheet a closed box that is
   never split; found by the v10 PDF ↔ print comparison (tests, stream R). */
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
  const st = document.createElement('style'); st.id = 'css-pages';
  st.textContent = '@media print{#print-root .sheet{contain:strict}}' +
    '.pg-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:8px}' +
    '.pg-sel-row{gap:8px;margin-bottom:8px;flex-wrap:wrap}.pg-msg{margin:8px 0}' +
    '.pg-det{margin-top:8px}.pg-det>summary{cursor:pointer;font-weight:600;font-size:13px;display:flex;align-items:center;gap:6px}' +
    '.pg-list{display:flex;flex-direction:column;gap:4px;margin-top:8px;max-height:340px;overflow:auto;padding-right:2px}' +
    '.pg-row{display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:8px;padding:4px 6px;background:#fff}' +
    '.pg-row.off{opacity:.55}' +
    '.pg-th{position:relative;flex:none;width:30px;height:42px;border:1px solid var(--border-2,#CBD5E1);border-radius:2px;background:#fff}' +
    '.pg-th i{position:absolute;display:block;box-sizing:border-box;border:1px solid #E2E8F0;border-radius:1px}.pg-th i.f{border-color:rgba(15,23,42,.25)}' +
    '.pg-th i.u{background:repeating-linear-gradient(45deg,#CBD5E1 0 2px,#fff 2px 4px)}' +
    '.pg-tx{flex:1;min-width:0;display:flex;flex-direction:column;font-size:12.5px;line-height:1.3}' +
    '.pg-codes{font-size:11px;color:var(--muted,#64748B);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.pg-pos{font-size:11.5px;font-weight:700;color:var(--accent,#2563EB);white-space:nowrap}.pg-row.off .pg-pos{color:var(--muted,#64748B);font-weight:500}' +
    '.pg-btns{display:flex;gap:2px;flex:none}.pg-btns .icon-btn{min-width:28px;font-size:12px;font-weight:700}';
  document.head.appendChild(st);
});

/* ---------------- help topics (HELP_TOPICS is defined later, in 07-help.js) ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined') return;
  const pr = HELP_TOPICS.find(x => x.id === 'print');
  if (pr) pr.related = (pr.related || []).concat(['pdf', 'pages']);
  const pa = HELP_TOPICS.find(x => x.id === 'partial');
  if (pa) pa.related = (pa.related || []).concat(['pages']);
  HELP_TOPICS.push({ id:'pdf', guide:null, tags:['print', 'label'], related:['print', 'pages', 'calib', 'partial'],
    title:{it:'Scarica PDF: stampare da un altro PC, da una chiavetta o in tipografia', en:'Download PDF: print from another PC, a USB stick or a print shop'},
    body:{
      it:'<p>Il pulsante <b>Scarica PDF</b> (in <b>Stampa etichette</b>, accanto a Stampa) crea un file PDF pulito, già pronto per la stampa, con le stesse etichette, lo stesso foglio e le stesse misure della stampa diretta. Non serve Internet.</p><ul><li>Il foglio è <b>A4 esatto</b>, le misure sono al millimetro: rispetta i margini, gli offset di calibrazione, le etichette girate di MRINK143, il foglio parziale (le caselle già usate restano vuote) e la scelta delle <b>Pagine</b> (quali fogli e in che ordine).</li><li>Testi e QR sono <b>vettoriali</b>: nitidi a qualsiasi risoluzione; il testo si può cercare e copiare.</li><li><b>Massima compatibilità</b>: PDF 1.4 classico, caratteri incorporati, nessuna trasparenza (le linee di taglio chiare sono un grigio pieno), nessun commento o modulo. Si apre e si stampa con Acrobat, Edge, Chrome, i driver delle stampanti e i programmi delle tipografie.</li><li>Il PDF chiede ad Acrobat di proporre già la <b>scala 100%</b>.</li><li><b>PDF per tipografia</b> (casella nel riquadro Pagine): i colori sono scritti in CMYK e il nero (testo, QR, grigi) usa solo l\'inchiostro nero K (0/0/0/100). Per la stampa in ufficio lascialo spento.</li></ul><p><b>Quando lo stampi</b> scegli <b>Scala 100%</b> / <b>Dimensioni effettive</b>. Non usare <b>Adatta alla pagina</b> o <b>Riduci</b>: le etichette non combacerebbero più con il foglio.</p><p>Dopo il download DocMap chiede se segnare come "già usate" le caselle dell\'ultimo foglio, come dopo una stampa (solo se l\'ultimo foglio è nel PDF).</p>',
      en:'<p>The <b>Download PDF</b> button (in <b>Print labels</b>, next to Print) creates a clean, print-ready PDF file with the same labels, sheet and measurements as direct printing. No Internet needed.</p><ul><li>The page is <b>exact A4</b>, millimetre-accurate: margins, calibration offsets, the turned labels of MRINK143, the partial sheet (used slots stay empty) and the <b>Pages</b> choice (which sheets, in which order) are all respected.</li><li>Text and QR codes are <b>vector</b>: sharp at any resolution; the text can be searched and copied.</li><li><b>Maximum compatibility</b>: classic PDF 1.4, embedded fonts, no transparency (the faint cut lines are a solid light grey), no comments or forms. It opens and prints in Acrobat, Edge, Chrome, printer drivers and print-shop software.</li><li>The PDF asks Acrobat to offer <b>100% scale</b> by default.</li><li><b>PDF for print shops</b> (checkbox in the Pages box): colours are written in CMYK and black (text, QR, greys) uses black ink K only (0/0/0/100). Keep it off for office printing.</li></ul><p><b>When you print it</b> choose <b>Scale 100%</b> / <b>Actual size</b>. Do not use <b>Fit to page</b> or <b>Shrink</b>: the labels would no longer match the sheet.</p><p>After the download DocMap asks whether to mark the slots of the last sheet as "used", just like after printing (only if the last sheet is in the PDF).</p>'
    } });
  HELP_TOPICS.push({ id:'pages', guide:null, tags:['print', 'label'], related:['print', 'pdf', 'partial'],
    title:{it:'Pagine: quali fogli stampare e in che ordine', en:'Pages: which sheets to print and in which order'},
    body:{
      it:'<p>Nel riquadro <b>Pagine</b> di <b>Stampa etichette</b> vedi quanti fogli produce la stampa e decidi quali uscire e in che ordine. Vale sia per <b>Stampa</b> sia per <b>Scarica PDF</b>, e l\'anteprima mostra già il risultato.</p><ul><li><b>Tutte</b>: tutti i fogli, in ordine (normale).</li><li><b>Solo le pagine</b>: scrivi i numeri dei fogli, ad esempio <code>2</code>, <code>1-3,5</code> o <code>4-</code> (dal 4 alla fine). Utile per ristampare un foglio venuto male.</li><li><b>Ordine inverso</b>: dall\'ultimo al primo, per le stampanti che fanno uscire i fogli a faccia in su.</li><li><b>Ordine e anteprima dei fogli</b>: ogni foglio ha una miniatura con le caselle colorate dei faldoni e i loro codici; spunta o togli i fogli, spostali con ↑ ↓ o con <b>Prima</b> per stamparne uno per primo.</li></ul><p><b>Foglio parziale.</b> Se hai segnato caselle già usate, è il <b>foglio 1</b> a saltarle: deve finire sul foglio di etichette già usato in parte. Se cambi l\'ordine, il foglio 1 resta quello con le caselle saltate e DocMap ti dice in che posizione esce, così metti il foglio già usato in quel punto del cassetto. Se il foglio 1 non viene stampato, la mappa del foglio parziale non cambia; se non stampi l\'ultimo foglio, dopo la stampa DocMap non propone di aggiornarla.</p><p>Se la coda di stampa cambia (altri faldoni, altro foglio, altre copie) i fogli non sono più gli stessi: la scelta e l\'ordine si azzerano con un avviso. L\'ordine inverso resta, è una scelta della stampante.</p>',
      en:'<p>In the <b>Pages</b> box of <b>Print labels</b> you see how many sheets the print produces and choose which ones come out and in which order. It applies to both <b>Print</b> and <b>Download PDF</b>, and the preview already shows the result.</p><ul><li><b>All</b>: every sheet, in normal order.</li><li><b>Only pages</b>: type the sheet numbers, e.g. <code>2</code>, <code>1-3,5</code> or <code>4-</code> (4 to the end). Handy to reprint a sheet that came out wrong.</li><li><b>Reverse order</b>: last to first, for printers that deliver face up.</li><li><b>Order and preview of the sheets</b>: each sheet has a thumbnail with the binders\' coloured slots and their codes; tick or untick sheets, move them with ↑ ↓ or <b>First</b> to print one first.</li></ul><p><b>Partial sheet.</b> If you marked used slots, <b>sheet 1</b> skips them: it must go on the partially used label sheet. If you change the order, sheet 1 stays the one with the skipped slots and DocMap tells you at which position it comes out, so you put the partially used sheet at that point in the tray. If sheet 1 is not printed the partial sheet map does not change; if the last sheet is not printed DocMap does not offer to update it after printing.</p><p>If the print queue changes (other binders, another sheet type, other copies) the sheets are no longer the same: the choice and order are reset with a notice. Reverse order stays, it is a printer setting.</p>'
    } });
});
