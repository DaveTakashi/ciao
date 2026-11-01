/* =====================================================================
   DocMap 2026 — Precision label engine (all units in millimetres)
   ===================================================================== */
const MM = (n) => r1(n) + 'mm';
const LM = {};   // metrics of the last rendered label per kind (used by the print-quality check)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function qrBox(b, x, y, q, P){
  if (P.qrMode === 'none' || q <= 0) return '';
  if (P.qrMode === 'placeholder'){
    const bw = MM(Math.max(0.25, q * 0.012));
    const tk = (pos, sides) => '<div class="ph-tick" style="' + pos + sides.map(sd => 'border-' + sd + '-width:' + bw).join(';') + '"></div>';
    return '<div class="qr" style="left:' + MM(x) + ';top:' + MM(y) + ';width:' + MM(q) + ';height:' + MM(q) + ';">' +
      tk('left:0;top:0;', ['top','left']) + tk('right:0;top:0;', ['top','right']) +
      tk('left:0;bottom:0;', ['bottom','left']) + tk('right:0;bottom:0;', ['bottom','right']) + '</div>';
  }
  let svg = '';
  try { svg = DMQR.svg(b.short_url || shortUrl(b.short_code), {ecl:S.settings.qrEcc || 'M', quiet:2, fg:'#000'}); } catch(e){ svg = ''; }
  return '<div class="qr" style="left:' + MM(x) + ';top:' + MM(y) + ';width:' + MM(q) + ';height:' + MM(q) + ';">' + svg + '</div>';
}
function qrUrlText(b, x, y, q, fs){
  if (!fs) return '';
  return '<div class="lmono ln" style="position:absolute;left:' + MM(x - 2) + ';width:' + MM(q + 4) + ';top:' + MM(y) + ';font-size:' + MM(fs) + ';line-height:1.2;text-align:center;color:#000;letter-spacing:-.02em">qr7.it/' + esc(b.short_code) + '</div>';
}
/* Codice Multi chip: small "MULTI" caption + bold monospace value. Optional on every label (Print > Content). */
const showMulti = (b) => !!(b.multi_code && S.print.showMulti !== false);
function multiChip(b, fm, big){
  if (!showMulti(b)) return '';
  return '<span style="white-space:nowrap;margin-right:' + MM(fm * 0.45) + '"><span style="font-size:' + MM(fm * (big ? 0.5 : 0.62)) + ';font-weight:800;letter-spacing:.06em;margin-right:' + MM(fm * 0.2) + '">MULTI</span><span class="lmono" style="font-weight:800">' + esc(b.multi_code) + '</span></span>';
}
function metaLine(b, fm, noMulti){
  const loc = b.location_code ? '<span class="lmono" style="font-weight:800;border:' + MM(Math.max(0.18, fm * 0.07)) + ' solid #000;border-radius:' + MM(fm * 0.25) + ';padding:0 ' + MM(fm * 0.3) + ';margin-right:' + MM(fm * 0.35) + '">' + esc(b.location_code) + '</span>' : '';
  const hist = b.archive_state === 'HISTORICAL' ? ' · <b>' + esc(t('l_hist')) + '</b>' : '';
  return '<div class="ln" style="font-size:' + MM(fm) + ';line-height:1.35;color:#000">' + loc + (noMulti ? '' : multiChip(b, fm)) + esc(b.category || '') + hist + '</div>';
}
function contentsBlock(items, x, y, w, hAvail, fMax, opts){
  opts = opts || {};
  const n = items.length;
  if (!n) return '<div style="position:absolute;left:' + MM(x) + ';top:' + MM(y) + ';font-size:' + MM(Math.min(fMax, 2.6)) + ';color:#444;font-style:italic">' + esc(t('no_contents')) + '</div>';
  const LH = 1.22, FMIN = 1.45;
  let cols = 1;
  if (w >= 80 && n >= 5 && hAvail / (n * LH) < fMax * 0.8) cols = 2;
  let rowsPer = Math.ceil(n / cols);
  let fs = Math.min(hAvail / (rowsPer * LH), fMax);
  let shown = items, extra = 0;
  if (fs < FMIN){
    fs = FMIN; const maxRows = Math.max(1, Math.floor(hAvail / (FMIN * LH)));
    const cap = maxRows * cols;
    if (n > cap){ shown = items.slice(0, cap - 1); extra = n - shown.length; }
    rowsPer = Math.ceil((shown.length + (extra ? 1 : 0)) / cols);
  }
  LM.listFs = fs;
  // items not in the binder (given to the client / in use) get a subtle marker: "↗ cliente"
  const away = (it) => it.status === 'client' || it.status === 'in_use' ? '<i style="font-size:.82em;margin-left:' + MM(fs * 0.4) + ';color:#333">↗ ' + esc(t(it.status === 'client' ? 'l_ci_client' : 'l_ci_in_use')) + '</i>' : '';
  const rowsHtml = shown.map(it => '<div class="ln" style="line-height:' + LH + '">' + (it.year ? '<b class="lmono" style="font-weight:800;margin-right:' + MM(fs * 0.4) + '">' + esc(it.year) + '</b>' : '') + esc(it.description) + away(it) + '</div>').join('') +
    (extra ? '<div class="ln" style="line-height:' + LH + ';color:#444;font-style:italic">' + esc(t('l_more', {n:extra})) + '</div>' : '');
  return '<div style="position:absolute;left:' + MM(x) + ';top:' + MM(y) + ';width:' + MM(w) + ';height:' + MM(hAvail) + ';overflow:hidden;font-size:' + MM(fs) + ';display:grid;grid-auto-flow:column;grid-template-rows:repeat(' + rowsPer + ',auto);grid-template-columns:repeat(' + cols + ',minmax(0,1fr));column-gap:' + MM(Math.max(2, fs)) + ';align-content:start;color:#000">' + rowsHtml + '</div>';
}

/* ---------------------------------------------------------------------
   Complete label (default on the MRINK143 sheet). The physical 105×148
   label is cut in half by hand: each half (105×74 on the sheet) is a
   complete, independent label for one binder, read with the sheet turned
   (74 wide × 105 tall): code + QR on top, category, company, place,
   Multi, location, title, year, contents, tags, date, extra codes.
   --------------------------------------------------------------------- */
const DEFAULT_FIELDS = { category:true, city:true, multi:true, url:true, title:true, year:true, contents:true, tags:true, extra:true, location:true, contacts:false, notes:false, date:'created', empty:false };
function pf(k){ const f = Object.assign({}, DEFAULT_FIELDS, S.print.fields || {}); return f[k]; }
/* Reading frame of a slot: on "turned" sheets (MRINK143) labels are read with the sheet rotated. */
function frameGeo(g){ return g.turn ? Object.assign({}, g, {w:g.h, h:g.w, radius:0}) : g; }
const turnDir = (P) => ((P.split || {}).rotate === 90 ? 90 : -90);
/* Render a label inside its slot, rotated when the sheet is read turned. */
function renderSlotLabel(kind, b, g, P){
  if (!g.turn) return renderLabel(kind, b, g, P);
  const f = frameGeo(g);
  const tf = turnDir(P) === -90 ? 'translateY(' + MM(g.h) + ') rotate(-90deg)' : 'translateX(' + MM(g.w) + ') rotate(90deg)';
  return '<div class="lab-turn" style="position:absolute;left:0;top:0;width:' + MM(f.w) + ';height:' + MM(f.h) + ';transform-origin:0 0;transform:' + tf + '">' + renderLabel(kind, b, f, P) + '</div>';
}
/* "Label: ____" placeholder used when empty fields are printed on purpose (Print › Fields). */
function blankField(label, fs, wmm){
  return '<span style="white-space:nowrap">' + esc(label) + ': <span style="display:inline-block;vertical-align:baseline;width:' + MM(wmm || fs * 6) + ';border-bottom:' + MM(Math.max(0.15, fs * 0.06)) + ' solid #000"></span></span>';
}
function renderFull(b, g, P){
  const W = g.w, H = g.h;
  if (W > H * 1.15) return renderLabel('U', b, g, P);        // landscape slot: the unified label fits better
  const E = !!pf('empty');
  const pad = clamp(+P.padding || 0, 0, W / 5), sp = clamp(W * 0.045, 2, 4);
  const x0 = sp + pad, y0 = pad, iw = W - x0 - pad, ih = H - 2 * pad;
  const live = P.qrMode === 'live';
  let html = '<div class="lab"><div class="spine-bar" style="width:' + MM(sp) + ';background:' + esc(b.color_hex) + '"></div>';
  // ---- header: speaking code (left) + QR (right)
  let q = 0, urlFs = 0;
  if (P.qrMode !== 'none'){
    q = Math.min(iw * 0.42, ih * 0.3);
    if (live && pf('url')) urlFs = clamp(q * 0.075, 1.5, 2.2);
    html += qrBox(b, x0 + iw - q, y0, q, P) + qrUrlText(b, x0 + iw - q, y0 + q + urlFs * 0.15, q, urlFs);
  }
  const hdrH = Math.max(q + (urlFs ? urlFs * 1.45 : 0), ih * 0.2);
  const gap = Math.max(2, iw * 0.04), tw = iw - (q ? q + gap : 0);
  const codeLen = Math.max(3, (b.speaking_code || '').length);
  const fc = Math.min(tw / (codeLen * 0.64), hdrH * 0.42, 15);
  const catLen = Math.max(6, (b.category || '').length);
  const fcat = clamp(Math.min(tw / (catLen * 0.66), fc * 0.42), 2.4, 5);
  const fm = clamp(Math.min(fc * 0.3, tw / 11), 2.2, 3.4);
  const chips = [];
  if (pf('multi')){
    if (b.multi_code && S.print.showMulti !== false) chips.push('<span style="white-space:nowrap"><span style="font-size:' + MM(fm * 0.62) + ';font-weight:800;letter-spacing:.08em;margin-right:' + MM(fm * 0.25) + '">MULTI</span><span class="lmono" style="font-weight:800">' + esc(b.multi_code) + '</span></span>');
    else if (E) chips.push(blankField('Multi', fm, tw * 0.45));
  }
  if (pf('location')){
    if (b.location_code) chips.push('<span class="lmono" style="font-weight:800;border:' + MM(Math.max(0.2, fm * 0.07)) + ' solid #000;border-radius:' + MM(fm * 0.25) + ';padding:0 ' + MM(fm * 0.3) + ';white-space:nowrap">' + esc(b.location_code) + '</span>');
    else if (E) chips.push(blankField(t('f_location'), fm, tw * 0.4));
  }
  if (b.archive_state === 'HISTORICAL') chips.push('<b>' + esc(t('l_hist')) + '</b>');
  let cat = '';
  if (pf('category')) cat = b.category ? '<div class="ln" style="font-size:' + MM(fcat) + ';font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-top:' + MM(fc * 0.12) + '">' + esc(b.category) + '</div>'
    : (E ? '<div style="font-size:' + MM(fm) + ';margin-top:' + MM(fc * 0.12) + '">' + blankField(t('f_category'), fm, tw * 0.45) + '</div>' : '');
  html += '<div style="position:absolute;left:' + MM(x0) + ';top:' + MM(y0) + ';width:' + MM(tw) + ';height:' + MM(hdrH) + ';display:flex;flex-direction:column;overflow:hidden;color:#000">' +
    '<span class="code" style="font-size:' + MM(fc) + ';line-height:1">' + esc(b.speaking_code || '—') + '</span>' + cat +
    (chips.length ? '<div style="margin-top:auto;display:flex;flex-wrap:wrap;align-items:center;column-gap:' + MM(fm * 0.6) + ';row-gap:' + MM(fm * 0.25) + ';font-size:' + MM(fm) + ';line-height:1.3">' + chips.join('') + '</div>' : '') + '</div>';
  // ---- company block
  let y = y0 + hdrH + Math.max(1.2, ih * 0.015);
  const name = b.company_name || '';
  const fco = clamp(Math.min(iw / Math.max(12, Math.min(name.length, 26) * 0.56), ih * 0.06), 2.8, 5.4);
  const nameLines = Math.min(2, Math.max(1, Math.ceil(name.length * fco * 0.56 / iw)));
  html += '<div class="cl2" style="position:absolute;left:' + MM(x0) + ';top:' + MM(y) + ';width:' + MM(iw) + ';font-size:' + MM(fco) + ';line-height:1.12;font-weight:800;color:#000">' + esc(name) + '</div>';
  y += nameLines * fco * 1.12 + fco * 0.12;
  const fci = clamp(fco * 0.78, 2.4, 4);
  if (pf('city') && (b.company_city || E)){
    html += '<div class="ln" style="position:absolute;left:' + MM(x0) + ';top:' + MM(y) + ';width:' + MM(iw) + ';font-size:' + MM(fci) + ';line-height:1.2;color:#000">' + (b.company_city ? esc(b.company_city) : blankField(t('f_city'), fci, iw * 0.5)) + '</div>';
    y += fci * 1.25;
  }
  // ---- footer (bottom up): short code, date, tags, extra codes
  const ff = clamp(iw * 0.033, 1.7, 2.4);
  const foot = [];
  if (pf('tags')){ const tg = String(b.tags || '').split(',').map(x => x.trim()).filter(x => x && x.toLowerCase() !== DEMO_TAG); if (tg.length) foot.push('<span>' + esc(tg.map(x => '#' + x).join(' ')) + '</span>'); else if (E) foot.push(blankField(t('f_tags'), ff, iw * 0.35)); }
  if (pf('extra')){ if (b.extra_codes) foot.push('<span class="lmono" style="font-weight:700">' + esc(b.extra_codes) + '</span>'); else if (E) foot.push(blankField(t('f_extra'), ff, iw * 0.35)); }
  const dk = pf('date');
  if (dk && dk !== 'none'){ const d = dk === 'updated' ? b.updated_at : (b.created_at || b.updated_at); if (d) foot.push('<span style="white-space:nowrap">' + esc(t(dk === 'updated' ? 'l_updated' : 'l_created')) + ' <b>' + esc(fmtDate(d)) + '</b></span>'); }
  foot.push('<span class="lmono" style="margin-left:auto;white-space:nowrap">' + esc(b.short_code) + '</span>');
  const footLines = foot.length > 3 ? 2 : 1;
  const footH = ff * 1.35 * footLines;
  html += '<div style="position:absolute;left:' + MM(x0) + ';width:' + MM(iw) + ';top:' + MM(y0 + ih - footH) + ';height:' + MM(footH) + ';font-size:' + MM(ff) + ';line-height:1.35;color:#000;display:flex;flex-wrap:wrap;column-gap:' + MM(ff) + ';align-items:baseline;overflow:hidden;border-top:' + MM(0.15) + ' solid #000">' + foot.join('') + '</div>';
  // ---- optional lines above the footer (off by default, Print › Fields): people/contacts, notes
  const xl = [];
  [['contacts', 'l_contacts'], ['notes', 'l_notes']].forEach(([k, lab]) => { if (pf(k) && (b[k] || E)) xl.push([t(lab), b[k] || '']); });
  let xH = 0;
  if (xl.length){
    const fx = clamp(ff * 1.05, 1.8, 2.6); xH = xl.length * fx * 1.3;
    html += '<div style="position:absolute;left:' + MM(x0) + ';width:' + MM(iw) + ';top:' + MM(y0 + ih - footH - xH - ff * 0.15) + ';height:' + MM(xH) + ';font-size:' + MM(fx) + ';line-height:1.3;color:#000;overflow:hidden">' +
      xl.map(([lab, v]) => '<div class="ln">' + (v ? '<b>' + esc(lab) + ':</b> ' + esc(v) : blankField(lab, fx, iw * 0.6)) + '</div>').join('') + '</div>';
    xH += ff * 0.15;
  }
  // ---- archive part: title + year, then contents
  const yEnd = y0 + ih - footH - xH - ff * 0.4;
  y += Math.max(0.8, ih * 0.01);
  const fh = clamp(Math.min(iw * 0.06, ih * 0.045), 2.6, 4.2);
  const title = pf('title') ? (b.binder_title || '') : '';
  const year = pf('year') ? (b.ref_year || '') : '';
  if (title || year || (E && (pf('title') || pf('year')))){
    html += '<div style="position:absolute;left:' + MM(x0) + ';top:' + MM(y) + ';width:' + MM(iw) + ';height:' + MM(fh * 1.3) + ';display:flex;align-items:baseline;gap:' + MM(fh * 0.4) + ';border-top:' + MM(0.2) + ' solid #000;padding-top:' + MM(fh * 0.12) + ';overflow:hidden;color:#000">' +
      '<span class="ln" style="font-size:' + MM(fh) + ';font-weight:800;min-width:0;flex:1">' + (title ? esc(title) : (E && pf('title') ? blankField(t('f_title_s'), fh * 0.7, iw * 0.4) : '')) + '</span>' +
      (year ? '<span class="lmono" style="font-size:' + MM(fh * 0.78) + ';font-weight:800;border:' + MM(0.2) + ' solid #000;border-radius:' + MM(0.6) + ';padding:0 ' + MM(fh * 0.2) + ';flex:none">' + esc(year) + '</span>' : (E && pf('year') ? '<span style="font-size:' + MM(fh * 0.7) + '">' + blankField(t('f_year'), fh * 0.7, iw * 0.12) + '</span>' : '')) + '</div>';
    y += fh * 1.3 + fh * 0.35;
  }
  const items = (b.contents_items || []).filter(i => i.year || i.description);
  if (pf('contents') && (items.length || E) && yEnd - y > 3) html += contentsBlock(items, x0, y, iw, yEnd - y, Math.min(fh * 0.82, 3.6));
  LM.S = {q, code:fc, minText:Math.min(fm, fci, ff, urlFs || 99, pf('category') && b.category ? fcat : 99)};
  return html + '</div>';
}


function renderLabel(kind, b, g, P){
  if (kind === 'S') return renderFull(b, g, P);
  if (kind === 'Q') return renderQrLabel(b, g, P);   // QR-only label (06d-info.js)
  const w = g.w, h = g.h, pad = clamp(+P.padding || 0, 0, Math.min(w, h) / 4);
  const spine = clamp(Math.min(w, h) * 0.07, 1.6, 5);
  const x0 = spine + pad, y0 = pad, iw = Math.max(5, w - x0 - pad), ih = Math.max(5, h - 2 * pad);
  const portrait = h > w * 1.15;
  const radius = g.radius ? 'border-radius:' + MM(g.radius) + ';' : '';
  let html = '<div class="lab" style="' + radius + '"><div class="spine-bar" style="width:' + MM(spine) + ';background:' + esc(b.color_hex) + '"></div>';
  const code = esc(b.speaking_code || '—');
  const codeLen = Math.max(3, (b.speaking_code || '').length);
  const live = P.qrMode === 'live';

  if (kind === 'A'){
    let q = 0, urlFs = 0, qx = 0, qy = 0;
    if (P.qrMode !== 'none'){
      q = portrait ? Math.min(iw * 0.62, ih * 0.42) : Math.min(ih, iw * 0.42);
      if (P.showQrUrl && live){ urlFs = Math.min(q / 12.5, 2.4); if (urlFs < 1.15) urlFs = 0; }
      const urlH = urlFs ? urlFs * 1.35 : 0;
      if (!portrait) q = Math.min(q, ih - urlH);
      qx = x0 + iw - q;
      qy = portrait ? y0 + ih - q - urlH : y0 + (ih - q - urlH) / 2;
      html += qrBox(b, qx, qy, q, P) + qrUrlText(b, qx, qy + q + urlFs * 0.1, q, urlFs);
    }
    const gap = Math.max(1.5, pad * 0.9);
    const tw = portrait ? iw : iw - (q ? q + gap : 0);
    const th = portrait ? ih - (q ? q + (urlFs ? urlFs * 1.35 : 0) + gap : 0) : ih;
    const tpl = P.template || 'classic';
    const box = (inner) => '<div style="position:absolute;left:' + MM(x0) + ';top:' + MM(y0) + ';width:' + MM(tw) + ';height:' + MM(th) + ';display:flex;flex-direction:column;overflow:hidden">' + inner + '</div>';
    const locChip = (fs) => b.location_code ? '<span class="lmono" style="font-weight:800;font-size:' + MM(fs) + ';border:' + MM(Math.max(0.2, fs * 0.07)) + ' solid #000;border-radius:' + MM(fs * 0.22) + ';padding:0 ' + MM(fs * 0.25) + ';white-space:nowrap">' + esc(b.location_code) + '</span>' : '';
    if (tpl === 'multi' && showMulti(b)){
      // Codice Multi first: internal management code as the main key, speaking code second
      const mLen = Math.max(4, b.multi_code.length);
      const fmc = Math.min(th * 0.3, tw / (mLen * 0.64), 22);
      const fcap = Math.max(1.4, Math.min(fmc * 0.3, 2.6));
      const fc2 = Math.min(th * 0.17, tw / (codeLen * 0.62) * 0.6, 11);
      const fco = Math.min(th * 0.1, 6), fm = fco * 0.82;
      LM.A = {q, code:Math.max(fmc, fc2), minText:Math.min(fcap, fco, fm, urlFs || 99), url:urlFs};
      html += box('<div style="font-size:' + MM(fcap) + ';font-weight:800;letter-spacing:.12em;color:#000">CODICE MULTI</div>' +
        '<div class="code lmono" style="font-size:' + MM(fmc) + ';margin-bottom:' + MM(fmc * 0.06) + '">' + esc(b.multi_code) + '</div>' +
        '<div class="ln" style="display:flex;align-items:baseline;gap:' + MM(fc2 * 0.35) + ';border-top:' + MM(0.15) + ' solid #000;padding-top:' + MM(fc2 * 0.12) + '"><span class="code" style="font-size:' + MM(fc2) + ';flex:none">' + code + '</span><span class="ln" style="font-size:' + MM(fco) + ';font-weight:800;min-width:0">' + esc(b.company_name) + '</span></div>' +
        '<div class="ln" style="font-size:' + MM(fco * 0.86) + ';color:#000">' + esc(b.binder_title) + '</div>' +
        '<div style="margin-top:auto">' + metaLine(b, fm, true) + '</div>');
      return html + '</div>';
    }
    if (tpl === 'bold'){
      // Big code readable from 3-4 m on the shelf, position chip, little else
      const fc = Math.min(th * 0.55, tw / (codeLen * 0.6), 40);
      const fl = Math.min(th * 0.15, fc * 0.38, 8);
      const fs = Math.min(th * 0.1, fc * 0.26, 5);
      LM.A = {q, code:fc, minText:Math.min(fs, urlFs || 99), url:urlFs};
      html += box('<div class="code" style="font-size:' + MM(fc) + ';line-height:.95">' + code + '</div>' +
        '<div class="ln" style="font-size:' + MM(fs) + ';font-weight:800;margin-top:' + MM(fs * 0.2) + '">' + esc(b.company_name) + '</div>' +
        '<div style="margin-top:auto;display:flex;align-items:center;gap:' + MM(fl * 0.4) + ';flex-wrap:wrap">' + locChip(fl) + (showMulti(b) ? '<span style="font-size:' + MM(fs) + '">' + multiChip(b, fs) + '</span>' : '') + '</div>');
      return html + '</div>';
    }
    if (tpl === 'minimal'){
      // Essential: code, client, Multi + position. No title, no category.
      const fc = Math.min(th * 0.4, tw / (codeLen * 0.62), 30);
      const fco = Math.min(th * 0.13, fc * 0.45, 7);
      const fm = fco * 0.85;
      LM.A = {q, code:fc, minText:Math.min(fco, fm, urlFs || 99), url:urlFs};
      html += box('<div class="code" style="font-size:' + MM(fc) + '">' + code + '</div>' +
        '<div class="ln" style="font-size:' + MM(fco) + ';font-weight:700">' + esc(b.company_name) + '</div>' +
        '<div class="ln" style="margin-top:auto;font-size:' + MM(fm) + ';display:flex;align-items:center;gap:' + MM(fm * 0.5) + '">' + locChip(fm) + multiChip(b, fm) + '</div>');
      return html + '</div>';
    }
    const fc = Math.min(th * 0.34, tw / (codeLen * 0.62), 28);
    const fco = Math.min(th * 0.115, fc * 0.5, 7.5);
    const ft = fco * 0.84, fm = fco * 0.8;
    LM.A = {q, code:fc, minText:Math.min(ft, fm, urlFs || 99), url:urlFs};
    html += '<div style="position:absolute;left:' + MM(x0) + ';top:' + MM(y0) + ';width:' + MM(tw) + ';height:' + MM(th) + ';display:flex;flex-direction:column;overflow:hidden">' +
      '<div class="code" style="font-size:' + MM(fc) + ';margin-bottom:' + MM(fc * 0.08) + '">' + code + '</div>' +
      '<div class="cl2" style="font-size:' + MM(fco) + ';font-weight:800;margin-bottom:' + MM(fco * 0.15) + '">' + esc(b.company_name) + '</div>' +
      '<div class="ln" style="font-size:' + MM(ft) + ';color:#000;font-weight:500">' + esc(b.binder_title) + '</div>' +
      '<div style="margin-top:auto">' + metaLine(b, fm) + '</div></div>';
  }
  else if (kind === 'B'){
    const fh = Math.min(ih * 0.15, iw * 0.075, 5.4);
    const ff = Math.max(1.3, fh * 0.55);
    const headH = fh * 1.3;
    html += '<div style="position:absolute;left:' + MM(x0) + ';top:' + MM(y0) + ';width:' + MM(iw) + ';height:' + MM(headH) + ';display:flex;align-items:baseline;gap:' + MM(fh * 0.4) + ';border-bottom:' + MM(0.15) + ' solid #000;overflow:hidden">' +
      '<span class="code" style="font-size:' + MM(fh) + '">' + code + '</span>' +
      '<span style="font-size:' + MM(fh * 0.5) + ';font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#000">' + esc(t('l_contents')) + '</span>' +
      '<span class="ln" style="font-size:' + MM(fh * 0.56) + ';margin-left:auto;font-weight:700;color:#000;min-width:0">' + esc(b.company_name) + '</span></div>';
    const listTop = y0 + headH + fh * 0.3;
    const footH = ff * 1.35;
    const la = ih - headH - fh * 0.3 - footH - ff * 0.25;
    html += contentsBlock(b.contents_items, x0, listTop, iw, la, Math.min(fh * 0.78, 4.4));
    LM.B = {q:0, code:fh, minText:Math.min(ff, LM.listFs || 99)};
    html += '<div class="ln" style="position:absolute;left:' + MM(x0) + ';width:' + MM(iw) + ';top:' + MM(y0 + ih - footH) + ';font-size:' + MM(ff) + ';line-height:1.35;color:#000;display:flex;gap:' + MM(ff) + '">' +
      (showMulti(b) ? '<span>' + multiChip(b, ff) + '</span>' : '') + '<span>' + esc(t('l_updated')) + ' <b>' + esc(fmtDate(b.updated_at)) + '</b></span>' + (b.location_code ? '<span class="lmono" style="font-weight:800;color:#000">' + esc(b.location_code) + '</span>' : '') +
      '<span class="lmono" style="margin-left:auto">' + esc(b.short_code) + '</span></div>';
  }
  else { // Unified
    let q = 0, urlFs = 0;
    if (P.qrMode !== 'none'){
      q = portrait ? Math.min(iw * 0.42, ih * 0.26) : Math.min(ih, iw * 0.3);
      if (P.showQrUrl && live){ urlFs = Math.min(q / 12.5, 2.2); if (urlFs < 1.15) urlFs = 0; }
      if (!portrait) q = Math.min(q, ih - (urlFs ? urlFs * 1.35 : 0));
    }
    const urlH = urlFs ? urlFs * 1.35 : 0;
    const gap = Math.max(1.5, pad * 0.9);
    const tw = portrait ? iw : iw - (q ? q + gap : 0);
    const th1 = portrait ? ih * 0.3 : ih * 0.44;
    const fc = Math.min(th1 * 0.62, tw * 0.42 / (codeLen * 0.62), 22);
    const fco = Math.min(th1 * 0.24, 6.5), fm = fco * 0.8;
    if (q){
      const qx = x0 + iw - q, qy = portrait ? y0 + ih - q - urlH : y0 + (ih - q - urlH) / 2;
      html += qrBox(b, qx, qy, q, P) + qrUrlText(b, qx, qy + q + urlFs * 0.1, q, urlFs);
    }
    html += '<div style="position:absolute;left:' + MM(x0) + ';top:' + MM(y0) + ';width:' + MM(tw) + ';height:' + MM(th1) + ';display:flex;gap:' + MM(fc * 0.3) + ';align-items:flex-start;overflow:hidden;border-bottom:' + MM(0.15) + ' solid #000">' +
      '<div class="code" style="font-size:' + MM(fc) + ';flex:none">' + code + '</div>' +
      '<div style="min-width:0;flex:1;display:flex;flex-direction:column;height:100%">' +
        '<div class="cl2" style="font-size:' + MM(fco) + ';font-weight:800">' + esc(b.company_name) + '</div>' +
        '<div class="ln" style="font-size:' + MM(fco * 0.82) + ';color:#000">' + esc(b.binder_title) + '</div>' +
        '<div style="margin-top:auto">' + metaLine(b, fm) + '</div></div></div>';
    const ly = y0 + th1 + Math.max(0.8, fco * 0.25);
    const lw = portrait ? (q ? iw - q - gap : iw) : tw;
    const lh = ih - th1 - Math.max(0.8, fco * 0.25) - fm * 1.5;
    html += contentsBlock(b.contents_items, x0, ly, lw, lh, Math.min(fco * 0.82, 4.2));
    LM.U = {q, code:fc, minText:Math.min(fm * 0.85, LM.listFs || 99, urlFs || 99)};
    html += '<div class="ln" style="position:absolute;left:' + MM(x0) + ';width:' + MM(lw) + ';top:' + MM(y0 + ih - fm * 1.35) + ';font-size:' + MM(fm * 0.85) + ';color:#444">' + esc(t('l_updated')) + ' ' + esc(fmtDate(b.updated_at)) + ' · <span class="lmono">' + esc(b.short_code) + '</span></div>';
  }
  return html + '</div>';
}

/* ---------------- Queue & layout ---------------- */
function printQueueBinders(){
  return S.binders.filter(b => b.selected_for_print && !(S.settings.hideDemo && isDemo(b))).sort((a, b) => naturalCmp(a.speaking_code, b.speaking_code));
}
const modeKinds = (m) => m === 'split' ? ['S'] : m === 'pair' ? ['A','B'] : m === 'a' ? ['A'] : m === 'b' ? ['B'] : m === 'qr' ? ['Q'] : ['U'];
function queueItems(){
  const P = S.print, out = [];
  const copies = clamp(parseInt(P.copies, 10) || 1, 1, 50);
  const kinds = modeKinds(P.contentMode);
  printQueueBinders().forEach(b => { for (let c = 0; c < copies; c++) kinds.forEach(k => out.push({kind:k, b})); });
  return out;
}
function slotCount(){ const g = S.print.geometry; return Math.max(1, (g.cols | 0) * (g.rows | 0)); }
function usedSet(){ const N = slotCount(); const u = new Set((S.usedSlots[S.print.presetId] || []).filter(i => i >= 0 && i < N)); return u.size >= N ? new Set() : u; } // a fully used sheet is not a partial sheet
function slotRect(i){
  const g = S.print.geometry, c = i % g.cols, r = Math.floor(i / g.cols);
  return { r, c, x: g.marginLeft + c * (g.w + g.gapX), y: g.marginTop + r * (g.h + g.gapY) };
}
/* Fill order of the slots. On sheets whose physical labels are cut into `group` printed labels
   (MRINK143: 2 per 105×148 label) the order goes physical label by physical label, both halves first. */
function slotSeq(){
  const g = S.print.geometry, N = slotCount(), k = Math.max(1, g.group | 0);
  if (k < 2 || g.rows % k) return Array.from({length:N}, (_, i) => i);
  const out = [];
  if (g.turn){
    // turned sheet: follow the reading order of the turned sheet (left to right, top to bottom),
    // so label 1 and 2 are the left and right half of the first physical label as you read them
    const cols = Array.from({length:g.cols}, (_, i) => i), rows = Array.from({length:g.rows}, (_, i) => i);
    if (turnDir(S.print) === -90) cols.forEach(c => rows.slice().reverse().forEach(r => out.push(r * g.cols + c)));
    else cols.reverse().forEach(c => rows.forEach(r => out.push(r * g.cols + c)));
    return out;
  }
  for (let pr = 0; pr < g.rows / k; pr++) for (let c = 0; c < g.cols; c++) for (let j = 0; j < k; j++) out.push((pr * k + j) * g.cols + c);
  return out;
}
const slotNo = (s) => slotSeq().indexOf(s) + 1;
function layoutLabels(){
  const items = queueItems(), N = slotCount(), used = usedSet(), pages = [], seq = slotSeq();
  let idx = 0, p = 0;
  while (idx < items.length && p < 500){
    const slots = [];
    for (let n = 0; n < N && idx < items.length; n++){
      const s = seq[n];
      if (p === 0 && used.has(s)) continue;
      slots.push({s, item:items[idx++]});
    }
    if (slots.length || p > 0) pages.push(slots);
    p++;
  }
  return { pages, items:items.length, skipped: items.length ? used.size : 0, used };
}

/* ---------------- Sheets ---------------- */
function sheetWrap(inner){
  const P = S.print;
  return '<div class="sheet"><div style="position:absolute;left:' + MM(+P.offsetX || 0) + ';top:' + MM(+P.offsetY || 0) + ';width:210mm;height:297mm">' + inner + '</div></div>';
}
function buildLabelSheets(screen){
  const g = S.print.geometry, P = S.print, L = layoutLabels(), N = slotCount();
  const pages = L.pages.length ? L.pages : (screen ? [[]] : []);
  return pages.map((slots, pi) => {
    let inner = '';
    const filled = new Map(slots.map(x => [x.s, x.item]));
    const k = Math.max(1, g.group | 0), grouped = k > 1 && g.rows % k === 0;
    for (let s = 0; s < N; s++){
      const R = slotRect(s), item = filled.get(s);
      const isUsed = pi === 0 && L.used.has(s);
      const cls = ['slotbox'];
      if (g.cut) cls.push('cut');
      if (screen && !g.cut && !grouped) cls.push('diecut-scr');
      if (screen && isUsed) cls.push('used-scr');
      if (!item && !screen && !g.cut) continue;
      inner += '<div class="' + cls.join(' ') + '" data-used="#' + slotNo(s) + '" style="left:' + MM(R.x) + ';top:' + MM(R.y) + ';width:' + MM(g.w) + ';height:' + MM(g.h) + ';' + (g.radius ? 'border-radius:' + MM(g.radius) + ';' : '') + '">' +
        (item ? renderSlotLabel(item.kind, item.b, g, P) : '') + '</div>';
    }
    if (grouped){
      // physical labels (outline on screen only) and the barely visible cut line between their printed halves
      const guides = (P.split || {}).guides !== false;
      for (let pr = 0; pr < g.rows / k; pr++) for (let c = 0; c < g.cols; c++){
        const top = slotRect(pr * k * g.cols + c), ids = Array.from({length:k}, (_, j) => (pr * k + j) * g.cols + c);
        if (screen) inner += '<div class="phys-scr" style="left:' + MM(top.x) + ';top:' + MM(top.y) + ';width:' + MM(g.w) + ';height:' + MM(g.h * k + g.gapY * (k - 1)) + '"></div>';
        if (!guides || !(screen || ids.some(i => filled.has(i)))) continue;
        for (let j = 1; j < k; j++) inner += '<div class="cut-line" style="left:' + MM(top.x) + ';top:' + MM(top.y + j * (g.h + g.gapY) - g.gapY / 2) + ';width:' + MM(g.w) + '"></div>';
      }
    }
    return sheetWrap(inner);
  });
}
function buildCalibSheet(){
  const g = S.print.geometry, P = S.print, N = slotCount(), used = usedSet();
  const HL = '#D1D5DB', TX = '#CBD5E1', LW = 0.09; // 0.25pt ≈ 0.088mm
  const line = (x, y, w, h, c) => '<div style="position:absolute;left:' + MM(x) + ';top:' + MM(y) + ';width:' + MM(w) + ';height:' + MM(h) + ';background:' + (c || HL) + '"></div>';
  const cross = (cx, cy, L) => line(cx - L / 2, cy - LW / 2, L, LW) + line(cx - LW / 2, cy - L / 2, LW, L);
  let inner = '';
  const preset = findPreset(P.presetId);
  const ox = +P.offsetX || 0, oy = +P.offsetY || 0;
  const head = 'DocMap 2026 • ' + (S.lang === 'en' ? 'CALIBRATION TEST' : 'PROVA DI CALIBRAZIONE') + ' • ' + preset.name + (S.print.geometryModified ? ' (' + t('g_modified') + ')' : '') + ' • Offset X ' + fmtMM(ox) + ' / Y ' + fmtMM(oy) + ' mm • ↑ ALTO / TOP ↑';
  inner += '<div class="calib-t" style="left:0;width:210mm;top:3.2mm;text-align:center;font-size:1.9mm">' + esc(head) + '</div>';
  [[5,5],[205,5],[5,292],[205,292],[105,148.5]].forEach(([x, y]) => { inner += cross(x, y, 6); });
  // 50 mm scale bar (verifies 100% scale)
  const bx = 80, by = 293.2;
  inner += line(bx, by, 50, LW);
  for (let i = 0; i <= 10; i++) inner += line(bx + i * 5 - LW / 2, by - (i % 2 ? 0.8 : 1.6), LW, i % 2 ? 0.8 : 1.6);
  inner += '<div class="calib-t" style="left:' + MM(bx + 52) + ';top:' + MM(by - 1.6) + ';font-size:1.6mm">50 mm — ' + (S.lang === 'en' ? 'check scale 100%' : 'verifica scala 100%') + '</div>';
  for (let s = 0; s < N; s++){
    const R = slotRect(s), w = g.w, h = g.h;
    const txt = 'Slot #' + slotNo(s) + ' (R' + (R.r + 1) + '-C' + (R.c + 1) + ') • ↑ ALTO / TOP ↑ • [X: ' + fmtMM(R.x + ox) + 'mm, Y: ' + fmtMM(R.y + oy) + 'mm]' + (used.has(s) ? ' • ' + t('sl_used') : '');
    const fs = clamp((w - 4) / (txt.length * 0.6), 1.1, 1.9);
    let si = '<div style="position:absolute;inset:0;border:' + MM(LW) + ' solid ' + HL + ';' + (g.radius ? 'border-radius:' + MM(g.radius) + ';' : '') + '"></div>';
    const k = Math.min(3, Math.min(w, h) * 0.12), m = 1.5;
    // corner L marks
    si += line(m, m, k, LW) + line(m, m, LW, k);
    si += line(w - m - k, m, k, LW) + line(w - m - LW, m, LW, k);
    si += line(m, h - m - LW, k, LW) + line(m, h - m - k, LW, k);
    si += line(w - m - k, h - m - LW, k, LW) + line(w - m - LW, h - m - k, LW, k);
    // centre crosshair + square
    const cx = w / 2, cy = h / 2, L = Math.min(8, Math.min(w, h) * 0.25), sq = Math.min(2.4, L * 0.3);
    si += cross(cx, cy, L);
    si += '<div style="position:absolute;left:' + MM(cx - sq / 2) + ';top:' + MM(cy - sq / 2) + ';width:' + MM(sq) + ';height:' + MM(sq) + ';border:' + MM(LW) + ' solid ' + HL + '"></div>';
    si += '<div class="calib-t" style="left:0;width:' + MM(w) + ';top:' + MM(m + k + 0.3) + ';text-align:center;font-size:' + MM(fs) + '">' + esc(txt) + '</div>';
    si += '<div class="calib-t" style="left:0;width:' + MM(w) + ';top:' + MM(cy - L / 2 - Math.min(5, h * 0.14) - 0.5) + ';text-align:center;font-size:' + MM(Math.min(5, h * 0.14)) + ';color:#E2E8F0;line-height:1">↑</div>';
    si += '<div class="calib-t" style="left:0;width:' + MM(w) + ';top:' + MM(h - m - fs * 1.6) + ';text-align:center;font-size:' + MM(fs * 0.9) + '">' + fmtMM(w) + ' × ' + fmtMM(h) + ' mm</div>';
    inner += '<div class="slotbox" style="left:' + MM(R.x) + ';top:' + MM(R.y) + ';width:' + MM(w) + ';height:' + MM(h) + '">' + si + '</div>';
  }
  return sheetWrap(inner);
}

/* ---------------- Register ---------------- */
function buildRegisterHTML(list){
  const c = t('reg_cols');
  const rows = list.map(b => '<tr>' +
    '<td><div class="rc"><span style="display:inline-block;width:2.2mm;height:4mm;background:' + esc(b.color_hex) + ';vertical-align:-0.6mm;margin-right:1.5mm;border-radius:.5mm"></span>' + esc(b.speaking_code) + '</div>' + (b.multi_code ? '<div class="mono" style="font-size:7pt;font-weight:700;margin-top:.8mm">M ' + esc(b.multi_code) + '</div>' : '') + '<div style="font-size:6.5pt;color:#64748B;margin-top:1mm">' + esc(t('s_' + b.archive_state)) + '</div></td>' +
    '<td><span class="rl">' + esc(b.location_code || '—') + '</span></td>' +
    '<td><b>' + esc(b.company_name) + '</b><br><span style="color:#334155">' + esc(b.binder_title) + '</span>' + (b.category ? '<br><span style="font-size:6.8pt;color:#64748B">' + esc(b.category) + (b.tags ? ' • ' + esc(b.tags) : '') + '</span>' : '') + '</td>' +
    '<td>' + (b.contents_items.length ? '<ul>' + b.contents_items.map(i => '<li>' + (i.year ? '<b class="mono">' + esc(i.year) + '</b> ' : '') + esc(i.description) + '</li>').join('') + '</ul>' : '<span style="color:#94A3B8">—</span>') + '</td>' +
    '<td><div class="rq">' + (b.short_code ? DMQR.svg(b.short_url, {ecl:S.settings.qrEcc || 'M', quiet:1, fg:'#000'}) : '') + '</div></td>' +
    '<td><span class="mono" style="font-size:7.5pt;font-weight:700">' + esc(b.short_code) + '</span></td>' +
    '<td><a class="ru" href="' + esc(b.short_url) + '">' + esc(b.short_url) + '</a></td></tr>').join('');
  return '<div class="reg"><div class="rh"><div><div style="font-size:8pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#2563EB">DocMap 2026 • DM26</div><h1>' + esc(t('reg_t')) + '</h1><div style="font-size:10pt;font-weight:600">' + esc(S.settings.studioName) + '</div></div>' +
    '<div class="m">' + esc(t('reg_gen', {d:fmtDate(nowISO(), true)})) + '<br>' + esc(t('reg_tot', {n:list.length})) + '</div></div>' +
    '<table><thead><tr><th style="width:15mm">' + c[0] + '</th><th style="width:17mm">' + c[1] + '</th><th>' + c[2] + '</th><th>' + c[3] + '</th><th style="width:19mm">' + c[4] + '</th><th style="width:21mm">' + c[5] + '</th><th style="width:28mm">' + c[6] + '</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<div class="foot"><span>DocMap 2026 — Phygital Archive & Precision Label Studio</span><span>' + esc(S.settings.studioName) + '</span></div></div>';
}

/* ---------------- Print driver ---------------- */
function doPrint(kind, html){
  const ps = $('#page-style');
  ps.textContent = kind === 'register' ? '@page{size:210mm 297mm;margin:10mm 10mm 12mm 10mm}' : '@page{size:210mm 297mm;margin:0mm}';
  const root = $('#print-root');
  root.innerHTML = html;
  const cleanup = () => { root.innerHTML = ''; ps.textContent = '@page{size:210mm 297mm;margin:0mm}'; window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  // allow layout before opening the dialog
  return new Promise(res => setTimeout(() => { try { window.print(); } finally { setTimeout(() => { cleanup(); res(); }, 300); } }, 60));
}
async function printLabels(){
  const L = layoutLabels();
  if (!L.items){ toast(t('pr_none'), 'warn'); return; }
  await doPrint('labels', buildLabelSheets(false).join(''));
  // Offer to update the partial-sheet map with the consumed slots of the last sheet
  const N = slotCount();
  const last = L.pages[L.pages.length - 1] || [];
  const base = L.pages.length === 1 ? new Set(L.used) : new Set();
  last.forEach(x => base.add(x.s));
  const full = base.size >= N;
  let nextFree = 1; for (let i = 0; i < N; i++){ if (!base.has(i)){ nextFree = i + 1; break; } }
  openModal({
    title: t('after_print_t'),
    body: '<p style="margin:0">' + (full ? esc(t('after_print_full')) : esc(t('after_print_p', {n:last.length, s:nextFree}))) + '</p>',
    buttons: [
      {label:t('no_thanks'), cls:'btn', action:'modal-close'},
      {label:t('yes_update'), cls:'btn btn-primary', icon:'check', fn: () => {
        S.usedSlots[S.print.presetId] = full ? [] : Array.from(base).sort((a, b) => a - b);
        savePrefs(); closeModal(); if (S.view === 'print') renderView();
      }}
    ]
  });
}
function printCalibration(){ doPrint('calib', buildCalibSheet()); }
function printRegister(list){ doPrint('register', buildRegisterHTML(list)); }
