/* =====================================================================
   DocMap 2026 — Photos (binders and cabinets) and "Where is it?" locator
   Photos live in the local SQLite database (table `photos`), so they are
   saved with the IndexedDB working copy and inside every downloaded
   .sqlite file. JSON / CSV exports stay light and contain no photos.
   ===================================================================== */
const PH = { urls:new Map(), counts:null, markMode:null };
const PH_MAX = 1400;          // long edge in px after resize
const PH_QUALITY = 0.8;       // JPEG quality
const cabKey = (b) => String(b.room_code || '') + String(b.cabinet_code || '');
const phOk = () => !!(DB.ready && !DB.error);

function phList(type, key){
  if (!phOk() || !key) return [];
  return dbQuery('SELECT id, mime, width, height, caption, marks_json, created_at FROM photos WHERE owner_type = ? AND owner_key = ? ORDER BY created_at, id', [type, key])
    .map(r => Object.assign(r, {marks: (() => { try { return JSON.parse(r.marks_json || '{}') || {}; } catch(e){ return {}; } })()}));
}
function phUrl(id){
  if (PH.urls.has(id)) return PH.urls.get(id);
  const st = DB.db.prepare('SELECT data, mime FROM photos WHERE id = ?'); let url = '';
  try { st.bind([id]); if (st.step()){ const r = st.get(); url = URL.createObjectURL(new Blob([r[0]], {type:r[1] || 'image/jpeg'})); } } finally { st.free(); }
  PH.urls.set(id, url);
  return url;
}
/* binder id -> number of photos (one query per render, cached until a photo changes) */
function phCounts(){
  if (PH.counts) return PH.counts;
  PH.counts = {};
  if (phOk()) dbQuery("SELECT owner_key AS k, COUNT(*) AS n FROM photos WHERE owner_type = 'binder' GROUP BY owner_key").forEach(r => { PH.counts[r.k] = r.n; });
  return PH.counts;
}
function phOrphans(){ return phOk() ? dbScalar("SELECT COUNT(*) FROM photos WHERE owner_type = 'binder' AND owner_key NOT IN (SELECT id FROM binders)") || 0 : 0; }
function phTotals(){ return phOk() ? (dbQuery('SELECT COUNT(*) AS n, COALESCE(SUM(length(data)),0) AS bytes FROM photos')[0] || {n:0, bytes:0}) : {n:0, bytes:0}; }

/* Decode, fix orientation, shrink and re-encode as JPEG. HEIC (iPhone) is not decodable by Chrome on Windows. */
async function phPrepare(file){
  let src, w, h;
  try { src = await createImageBitmap(file, {imageOrientation:'from-image'}); w = src.width; h = src.height; }
  catch(e){
    src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('decode')); im.src = URL.createObjectURL(file); });
    w = src.naturalWidth; h = src.naturalHeight;
  }
  const k = Math.min(1, PH_MAX / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(src, 0, 0, cw, ch);
  if (src.close) src.close();
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', PH_QUALITY));
  return { bytes:new Uint8Array(await blob.arrayBuffer()), w:cw, h:ch };
}
async function phAdd(type, key, files){
  if (!phOk()){ toast(t('ph_nodb'), 'warn', 6000); return 0; }
  let n = 0;
  for (const f of Array.from(files || [])){
    if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(f.name)) continue;
    try {
      const p = await phPrepare(f);
      DB.db.run('INSERT INTO photos(id, owner_type, owner_key, mime, data, width, height, caption, marks_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [uuid(), type, key, 'image/jpeg', p.bytes, p.w, p.h, '', '{}', nowISO()]);
      n++;
    } catch(e){ toast(t('ph_bad', {f:f.name}), 'err', 7000); }
  }
  if (n){ PH.counts = null; dbLog('photo_add', type + ':' + key + ' +' + n); await dbPersist(); toast(t('ph_added', {n})); }
  return n;
}
async function phDelete(id){
  DB.db.run('DELETE FROM photos WHERE id = ?', [id]);
  const u = PH.urls.get(id); if (u) URL.revokeObjectURL(u); PH.urls.delete(id);
  PH.counts = null; dbLog('photo_delete', id); await dbPersist();
}
async function phUpdate(id, fields){
  if ('caption' in fields) DB.db.run('UPDATE photos SET caption = ? WHERE id = ?', [fields.caption, id]);
  if ('marks' in fields) DB.db.run('UPDATE photos SET marks_json = ? WHERE id = ?', [JSON.stringify(fields.marks || {}), id]);
  await dbPersist();
}
async function phPurgeOrphans(){
  DB.db.run("DELETE FROM photos WHERE owner_type = 'binder' AND owner_key NOT IN (SELECT id FROM binders)");
  PH.counts = null; dbLog('photo_purge', ''); await dbPersist();
}

/* Pick photos for an owner. The input is created on the fly so `capture` works on phones/tablets. */
function phPick(type, key, after){
  if (!phOk()){ toast(t('ph_nodb'), 'warn', 6000); return; }
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
  inp.addEventListener('change', async () => { const n = await phAdd(type, key, inp.files); if (n && after) after(); });
  inp.click();
}

/* ---------------- Thumbnails ---------------- */
function phThumbsHTML(type, key, opts){
  opts = opts || {};
  if (!phOk()) return '<div class="hint">' + esc(t('ph_nodb')) + '</div>';
  const list = phList(type, key);
  return '<div class="ph-grid">' + list.map(p => '<button type="button" class="ph-th" data-a="ph-open" data-id="' + p.id + '" data-type="' + type + '" data-key="' + esc(key) + '" title="' + esc(p.caption || t('ph_open')) + '"><img src="' + phUrl(p.id) + '" alt="' + esc(p.caption || '') + '" loading="lazy"></button>').join('') +
    '<button type="button" class="ph-add" data-a="ph-add" data-type="' + type + '" data-key="' + esc(key) + '">' + ic('camera') + '<span>' + esc(opts.addLabel || t('ph_add')) + '</span></button></div>';
}
function phRefreshAll(){
  $$('[data-ph-slot]').forEach(el => { el.innerHTML = phThumbsHTML(el.dataset.type, el.dataset.key, {addLabel:el.dataset.label}); });
  if (S.view === 'archive' && !topModal()) renderArchiveResults();
}

/* ---------------- Lightbox ---------------- */
function phOpen(id, type, key){
  const p = phList(type, key).find(x => x.id === id); if (!p) return;
  openModal({ title: type === 'cabinet' ? t('ph_cab_t', {c:key}) : t('ph_t'), size:'xl',
    body:'<div class="ph-big"><img src="' + phUrl(id) + '" alt=""></div><div class="field" style="margin-top:12px"><label for="ph-cap">' + esc(t('ph_caption')) + '</label><input class="inp" id="ph-cap" value="' + esc(p.caption || '') + '" placeholder="' + esc(t('ph_caption_ph')) + '"></div>' +
      '<div class="hint">' + esc(t('ph_size', {w:p.width, h:p.height})) + '</div>',
    buttons:[
      {label:t('delete'), cls:'btn btn-danger', icon:'trash', fn: () => confirmAction({ danger:true, plain:true, okLabel:t('delete'), detail:t('ph_del_d'), onOk: async () => { await phDelete(id); closeModal(true); phRefreshAll(); toast(t('deleted')); } })},
      {label:t('close'), cls:'btn btn-primary', fn: async () => { const v = ($('#ph-cap') || {}).value; if (v !== undefined && v !== (p.caption || '')) await phUpdate(id, {caption:v.trim()}); closeModal(true); phRefreshAll(); }}
    ]});
}

/* ---------------- "Where is it?" locator ---------------- */
const SECT = ['SX','CX','DX'];
/* Position of a shelf from the top (α/1/A/first emoji = 1), 0 when the name has no order (free text). */
function shelfSeries(s){ s = String(s || ''); if (/^\d{1,2}$/.test(s)) return 'number'; return ['greek','letter','emoji','symbol'].find(k => SHELF_TYPES[k].includes(k === 'letter' ? s.toUpperCase() : s)) || ''; }
function shelfOrdinal(s){
  const k = shelfSeries(s); if (!k) return 0;
  if (k === 'number') return +s || 0;
  return SHELF_TYPES[k].indexOf(k === 'letter' ? String(s).toUpperCase() : s) + 1;
}
function shelfSeriesList(k, n){ return k === 'number' ? Array.from({length:n}, (_, i) => String(i + 1)) : SHELF_TYPES[k].slice(0, n); }
function locateText(b){
  const parts = [];
  if (b.room_code) parts.push(t('loc_room') + ' ' + b.room_code);
  if (b.cabinet_code) parts.push(t('loc_cab') + ' ' + b.cabinet_code);
  if (b.shelf_code){ const o = shelfOrdinal(b.shelf_code); parts.push(t('loc_shelf') + ' ' + b.shelf_code + (o ? ' (' + t('loc_from_top', {n:o}) + ')' : '')); }
  if (b.sector_code) parts.push(t('loc_sector') + ' ' + ({SX:t('loc_sx'), CX:t('loc_cx'), DX:t('loc_dx')}[b.sector_code] || b.sector_code));
  return parts.join(' · ');
}
/* Schematic of the cabinet: one row per shelf (top shelf first), one column per sector when sectors are used. */
function cabinetSchemaHTML(b){
  const same = S.binders.filter(x => x.room_code === b.room_code && x.cabinet_code === b.cabinet_code);
  const shelves = Array.from(new Set(same.map(x => x.shelf_code).filter(Boolean)));
  // show every shelf from the top down to the lowest one in use (α β γ…, 1 2 3…, A B C…), so the position is obvious
  const series = Array.from(new Set(shelves.map(shelfSeries)));
  const maxG = Math.min(20, Math.max(0, ...shelves.map(shelfOrdinal)));
  const fill = series.length === 1 && series[0] ? shelfSeriesList(series[0], maxG) : [];
  const rows = Array.from(new Set(fill.concat(shelves))).sort((a, c) => (shelfOrdinal(a) || 99) - (shelfOrdinal(c) || 99) || naturalCmp(a, c));
  const shelfCol = {}; same.forEach(x => { if (x.shelf_color && x.shelf_code && !shelfCol[x.shelf_code]) shelfCol[x.shelf_code] = x.shelf_color; });
  if (!rows.length) rows.push('');
  const useSect = same.some(x => x.sector_code);
  const cols = useSect ? SECT : [''];
  const chip = (x) => '<button type="button" class="cs-b' + (x.id === b.id ? ' me' : '') + '" style="--c:' + esc(x.color_hex) + '" data-a="locate" data-id="' + x.id + '" title="' + esc(x.speaking_code + ' — ' + x.company_name + ' — ' + x.binder_title) + '">' + esc(x.speaking_code) + '</button>';
  let h = '<div class="cs" style="--cols:' + cols.length + '">' + (useSect ? '<div></div>' + cols.map(c => '<div class="cs-ch">' + c + '</div>').join('') : '');
  rows.forEach(s => {
    h += '<div class="cs-rl"' + (shelfCol[s] ? ' style="box-shadow:inset 4px 0 0 ' + esc(shelfCol[s]) + '"' : '') + '>' + esc(s || '—') + '</div>';
    cols.forEach(c => {
      const here = same.filter(x => (x.shelf_code || '') === s && (!useSect || (x.sector_code || 'CX') === c || (!x.sector_code && c === 'CX')));
      const hit = (b.shelf_code || '') === s && (!useSect || (b.sector_code || 'CX') === c);
      h += '<div class="cs-cell' + (hit ? ' hit' : '') + '">' + here.sort((a, z) => naturalCmp(a.speaking_code, z.speaking_code)).map(chip).join('') + '</div>';
    });
  });
  return h + '</div>';
}
function cabinetPhotoHTML(b){
  const key = cabKey(b);
  if (!key) return '';
  if (!phOk()) return '<div class="hint">' + esc(t('ph_nodb')) + '</div>';
  const list = phList('cabinet', key);
  if (!list.length) return '<div class="ph-empty">' + ic('camera', 'lg') + '<p>' + esc(t('loc_nophoto', {c:key})) + '</p><button class="btn btn-sm" data-a="ph-add" data-type="cabinet" data-key="' + esc(key) + '">' + ic('camera') + esc(t('ph_add_cab')) + '</button></div>';
  const p = list[0], m = b.shelf_code && p.marks[b.shelf_code + (b.sector_code ? '|' + b.sector_code : '')] || (b.shelf_code && p.marks[b.shelf_code]);
  const marking = PH.markMode && PH.markMode.photo === p.id;
  return '<div class="ph-loc' + (marking ? ' marking' : '') + '" data-a="ph-mark-click" data-id="' + p.id + '" data-bid="' + b.id + '"><img src="' + phUrl(p.id) + '" alt="">' +
      (m ? '<span class="ph-pin" style="left:' + (m.x * 100) + '%;top:' + (m.y * 100) + '%"><i></i><b>' + esc(b.location_code) + '</b></span>' : '') + '</div>' +
    '<div class="row" style="margin-top:8px;justify-content:space-between">' +
      (b.shelf_code ? '<button class="btn btn-sm' + (marking ? ' btn-primary' : '') + '" data-a="ph-mark" data-id="' + p.id + '" data-bid="' + b.id + '">' + ic('crosshair') + esc(marking ? t('loc_mark_now') : (m ? t('loc_mark_move', {s:b.location_code}) : t('loc_mark', {s:b.location_code}))) + '</button>' : '<span></span>') +
      '<span class="row" style="gap:6px">' + (list.length > 1 ? '<span class="small muted">+' + (list.length - 1) + '</span>' : '') +
      '<button class="btn btn-sm" data-a="ph-open" data-id="' + p.id + '" data-type="cabinet" data-key="' + esc(key) + '">' + ic('eye') + esc(t('ph_open')) + '</button>' +
      '<button class="btn btn-sm" data-a="ph-add" data-type="cabinet" data-key="' + esc(key) + '">' + ic('camera') + esc(t('ph_add')) + '</button></span></div>' +
    (!m && b.shelf_code ? '<div class="hint" style="margin-top:6px">' + esc(t('loc_mark_hint')) + '</div>' : '');
}
function locateBodyHTML(b){
  const placed = b.room_code || b.cabinet_code || b.shelf_code;
  return '<div class="loc-head"><span class="code-chip" style="font-size:22px"><span class="bar" style="background:' + esc(b.color_hex) + ';height:26px"></span>' + esc(b.speaking_code) + '</span>' +
      (b.multi_code ? '<span class="multi-tag lg">' + esc(t('f_multi')) + ' ' + esc(b.multi_code) + '</span>' : '') +
      '<span class="loc" style="font-size:20px">' + esc(b.location_code || '—') + '</span>' + stateBadge(b.archive_state) + '</div>' +
    '<div class="small" style="margin:6px 0 14px"><b>' + esc(b.company_name) + '</b> — ' + esc(b.binder_title) + '</div>' +
    (placed ? '<div class="loc-say">' + ic('map') + '<div>' + esc(locateText(b)) + '</div></div>' : '<div class="warn-box">' + ic('alert') + '<div>' + esc(t('loc_none')) + '</div></div>') +
    (placed ? '<div class="loc-grid"><div><div class="lbl" style="margin-bottom:8px">' + esc(t('loc_schema', {c:cabKey(b) || '?'})) + '</div>' + cabinetSchemaHTML(b) + '</div>' +
      '<div><div class="lbl" style="margin-bottom:8px">' + esc(t('loc_photo')) + '</div><div id="loc-photo">' + cabinetPhotoHTML(b) + '</div></div></div>' : '') +
    '<div style="margin-top:16px"><div class="lbl" style="margin-bottom:8px">' + esc(t('ph_binder')) + '</div><div data-ph-slot data-type="binder" data-key="' + b.id + '">' + phThumbsHTML('binder', b.id) + '</div></div>';
}
function openLocate(id){
  const b = S.binders.find(x => x.id === id); if (!b) return;
  PH.markMode = null;
  const cur = topModal();
  if (cur && cur._locate){ cur._locate = id; cur.querySelector('.modal-h h2').textContent = t('loc_t') + ' ' + b.speaking_code; cur.querySelector('.modal-b').innerHTML = locateBodyHTML(b); return; }
  const ov = openModal({ title:t('loc_t') + ' ' + b.speaking_code, size:'xl', body:locateBodyHTML(b), autofocus:false,
    buttons:[{label:t('act_edit'), cls:'btn', icon:'pencil', fn: () => { const bid = topModal()._locate; closeModal(true); openEditor(bid); }}, {label:t('close'), cls:'btn btn-primary', action:'modal-close'}],
    onClose: () => { PH.markMode = null; } });
  ov._locate = id;
}
function locateRefresh(){
  const ov = topModal(); if (!ov || !ov._locate) return;
  const b = S.binders.find(x => x.id === ov._locate); if (!b) return;
  const el = $('#loc-photo'); if (el) el.innerHTML = cabinetPhotoHTML(b);
}

const PHOTO_ACTIONS = {
  'locate': (el) => openLocate(el.dataset.id),
  'ph-add': (el) => phPick(el.dataset.type, el.dataset.key, () => { phRefreshAll(); locateRefresh(); }),
  'ph-open': (el, e) => { if (e) e.stopPropagation(); phOpen(el.dataset.id, el.dataset.type, el.dataset.key); },
  'ph-open-cab': (el) => { const l = phList('cabinet', el.dataset.key); if (l[0]) phOpen(l[0].id, 'cabinet', el.dataset.key); },
  'ph-mark': (el) => { PH.markMode = PH.markMode && PH.markMode.photo === el.dataset.id ? null : {photo:el.dataset.id, binder:el.dataset.bid}; locateRefresh(); },
  'ph-mark-click': async (el, e) => {
    if (!PH.markMode || PH.markMode.photo !== el.dataset.id) return;
    const img = el.querySelector('img'), r = img.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp((e.clientY - r.top) / r.height, 0, 1);
    const b = S.binders.find(z => z.id === el.dataset.bid); if (!b) return;
    const p = phList('cabinet', cabKey(b)).find(z => z.id === el.dataset.id); if (!p) return;
    const marks = p.marks; marks[b.shelf_code + (b.sector_code ? '|' + b.sector_code : '')] = {x:Math.round(x * 1000) / 1000, y:Math.round(y * 1000) / 1000};
    await phUpdate(p.id, {marks});
    PH.markMode = null; locateRefresh(); toast(t('loc_marked', {s:b.location_code}));
  },
  'ph-purge': () => confirmAction({ danger:true, okLabel:t('delete'), detail:t('ph_purge_d', {n:phOrphans()}), onOk: async () => { await phPurgeOrphans(); toast(t('deleted')); if (S.view === 'database') renderView(); } })
};
