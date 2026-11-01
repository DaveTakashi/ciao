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
function metaLine(b, fm){
  const loc = b.location_code ? '<span class="lmono" style="font-weight:800;border:' + MM(Math.max(0.18, fm * 0.07)) + ' solid #000;border-radius:' + MM(fm * 0.25) + ';padding:0 ' + MM(fm * 0.3) + ';margin-right:' + MM(fm * 0.35) + '">' + esc(b.location_code) + '</span>' : '';
  const hist = b.archive_state === 'HISTORICAL' ? ' · <b>' + esc(t('l_hist')) + '</b>' : '';
  return '<div class="ln" style="font-size:' + MM(fm) + ';line-height:1.35;color:#000">' + loc + esc(b.category || '') + hist + '</div>';
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
  const rowsHtml = shown.map(it => '<div class="ln" style="line-height:' + LH + '">' + (it.year ? '<b class="lmono" style="font-weight:800;margin-right:' + MM(fs * 0.4) + '">' + esc(it.year) + '</b>' : '') + esc(it.description) + '</div>').join('') +
    (extra ? '<div class="ln" style="line-height:' + LH + ';color:#444;font-style:italic">' + esc(t('l_more', {n:extra})) + '</div>' : '');
  return '<div style="position:absolute;left:' + MM(x) + ';top:' + MM(y) + ';width:' + MM(w) + ';height:' + MM(hAvail) + ';overflow:hidden;font-size:' + MM(fs) + ';display:grid;grid-auto-flow:column;grid-template-rows:repeat(' + rowsPer + ',auto);grid-template-columns:repeat(' + cols + ',minmax(0,1fr));column-gap:' + MM(Math.max(2, fs)) + ';align-content:start;color:#000">' + rowsHtml + '</div>';
}

/** Render one label (kind A, B or U) as HTML positioned inside a w×h slot. */
function renderLabel(kind, b, g, P){
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
      '<span>' + esc(t('l_updated')) + ' <b>' + esc(fmtDate(b.updated_at)) + '</b></span>' + (b.location_code ? '<span class="lmono" style="font-weight:800;color:#000">' + esc(b.location_code) + '</span>' : '') +
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
  return S.binders.filter(b => b.selected_for_print).sort((a, b) => naturalCmp(a.speaking_code, b.speaking_code));
}
function queueItems(){
  const P = S.print, out = [];
  const copies = clamp(parseInt(P.copies, 10) || 1, 1, 50);
  const kinds = P.contentMode === 'pair' ? ['A','B'] : P.contentMode === 'a' ? ['A'] : P.contentMode === 'b' ? ['B'] : ['U'];
  printQueueBinders().forEach(b => { for (let c = 0; c < copies; c++) kinds.forEach(k => out.push({kind:k, b})); });
  return out;
}
function slotCount(){ const g = S.print.geometry; return Math.max(1, (g.cols | 0) * (g.rows | 0)); }
function usedSet(){ const N = slotCount(); return new Set((S.usedSlots[S.print.presetId] || []).filter(i => i >= 0 && i < N)); }
function slotRect(i){
  const g = S.print.geometry, c = i % g.cols, r = Math.floor(i / g.cols);
  return { r, c, x: g.marginLeft + c * (g.w + g.gapX), y: g.marginTop + r * (g.h + g.gapY) };
}
function layoutLabels(){
  const items = queueItems(), N = slotCount(), used = usedSet(), pages = [];
  let idx = 0, p = 0;
  while (idx < items.length && p < 500){
    const slots = [];
    for (let s = 0; s < N && idx < items.length; s++){
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
    for (let s = 0; s < N; s++){
      const R = slotRect(s), item = filled.get(s);
      const isUsed = pi === 0 && L.used.has(s);
      const cls = ['slotbox'];
      if (g.cut) cls.push('cut');
      if (screen && !g.cut) cls.push('diecut-scr');
      if (screen && isUsed) cls.push('used-scr');
      if (!item && !screen && !g.cut) continue;
      inner += '<div class="' + cls.join(' ') + '" data-used="#' + (s + 1) + '" style="left:' + MM(R.x) + ';top:' + MM(R.y) + ';width:' + MM(g.w) + ';height:' + MM(g.h) + ';' + (g.radius ? 'border-radius:' + MM(g.radius) + ';' : '') + '">' +
        (item ? renderLabel(item.kind, item.b, g, P) : '') + '</div>';
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
    const txt = 'Slot #' + (s + 1) + ' (R' + (R.r + 1) + '-C' + (R.c + 1) + ') • ↑ ALTO / TOP ↑ • [X: ' + fmtMM(R.x + ox) + 'mm, Y: ' + fmtMM(R.y + oy) + 'mm]' + (used.has(s) ? ' • ' + t('sl_used') : '');
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
    '<td><div class="rc"><span style="display:inline-block;width:2.2mm;height:4mm;background:' + esc(b.color_hex) + ';vertical-align:-0.6mm;margin-right:1.5mm;border-radius:.5mm"></span>' + esc(b.speaking_code) + '</div><div style="font-size:6.5pt;color:#64748B;margin-top:1mm">' + esc(t('s_' + b.archive_state)) + '</div></td>' +
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
