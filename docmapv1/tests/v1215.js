// v12.15 (26.12.15) checks (~25 s): a faster inventory.
// Model (invProgress, invMinsText, invBurstOrder, invBurstCrop, target in normalizeInv); camera scanner with several codes
// per frame (each code once while it stays in view); PC (target filled by «Stima un lavoro», saved with the project,
// progress in the Lavoro card); phone in local mode: burst of several labels in one frame (box first, binders in label
// order, the photo is the strip of each spine), labels still in view are silent, two boxes in one frame are refused,
// burst off keeps one code per frame, progress bar with the time left at the measured pace.
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node v1215.js
const {chromium} = require('playwright');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const fileUrl = f => 'file://' + path.join(APP, f).replace(/\\/g, '/');
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) passes++; else { fails++; console.log('  ✗ FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 900) : ''); } };
(async () => {
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({viewport:{width:1366, height:900}});
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    p.on('dialog', d => d.accept());
    await p.goto(fileUrl('index.html')); await p.waitForTimeout(1300);
    await p.evaluate(() => { const m = document.querySelector('.modal-f [data-a="modal-btn"]'); if (m) m.click(); });
    ok(await p.evaluate(() => typeof invProgress === 'function' && typeof invBurstOrder === 'function' && typeof ivxProgressHTML === 'function'), 'v12.15 loaded');

    /* ---------------- model ---------------- */
    const M = await p.evaluate(() => {
      const now = Date.parse('2026-11-24T09:00:00Z'), r = {};
      r.none = invProgress(0, 10, 8000, now); r.a = invProgress(300, 120, 8000, now); r.b = invProgress('300', '320', 8000, now); r.c = invProgress(300, 300, 0, now); r.d = invProgress(50, 5, 0, now);
      r.mt = [invMinsText(24), invMinsText(60), invMinsText(135), invMinsText(0)];
      const pf = 'Abcd', L = (k, n) => 'https://qr7.it/' + invLabelCode(pf, k, n);
      r.o1 = invBurstOrder([L('binder', 3), L('box', 1), L('binder', 1), L('binder', 3), '', L('binder', 2)]).codes.map(x => invParseCode(invParseScan(x).code)).map(x => x.kind + x.n);
      r.o2 = invBurstOrder([L('box', 1), L('box', 2), L('binder', 1)]);
      r.cr = [invBurstCrop({x:10, y:10, width:30, height:30}, 320, 240), invBurstCrop({x:300, y:0, width:20, height:20}, 320, 240), invBurstCrop(null, 320, 240), invBurstCrop({x:0, y:0, width:0}, 320, 240)];
      r.t = [normalizeInv({target:'250'}).target, normalizeInv({target:'-4'}).target, normalizeInv({}).target];
      return r;
    });
    ok(M.none === null && M.a.left === 180 && M.a.pct === 40 && M.a.mins === 24 && M.a.at === '2026-11-24T09:24:00.000Z' && M.b.over === 20 && M.b.pct === 100 && M.b.left === 0 && M.c.left === 0 && !M.c.at && M.d.mins === 0,
      'progress: done / target, time left at the pace, over the target, no pace → no ETA', M);
    ok(M.mt.join('|') === '24 min|1 h|2 h 15 min|0 min', 'minutes as text', M.mt);
    ok(M.o1.join() === 'box1,binder1,binder2,binder3' && M.o2.boxes_dropped === 2 && M.o2.codes.length === 1, 'burst order: the box first, binders in label order, no duplicates; two boxes in a frame are dropped', {o1:M.o1, o2:M.o2});
    ok(M.cr[0].w === 66 && M.cr[0].h === 240 && M.cr[0].x === 0 && M.cr[1].x + M.cr[1].w === 320 && M.cr[2] === null && M.cr[3] === null, 'burst photo: a strip around the QR, inside the frame', M.cr);
    ok(M.t.join() === '250,0,0', 'target in the project (additive field, 0 = none)', M.t);

    /* ---------------- camera scanner: several codes per frame ---------------- */
    const SCN = await p.evaluate(() => {
      const got = []; const s = new DMCamScanner({dedupeMs:4000, onCodes:(f) => got.push(f.slice())});
      s.emitAll(['A', 'B']); s.emitAll(['A', 'B', 'C']); s.emitAll([]); s.emitAll(['A']);
      return got;
    });
    ok(JSON.stringify(SCN) === '[["A","B"],["C"]]', 'scanner: each code of a frame once while it stays in view', SCN);

    /* ---------------- PC: target from the estimate, progress card ---------------- */
    await p.evaluate(() => { S.view = 'inv'; IVP.open = ''; renderAll(); });
    await p.click('#ivx-est'); await p.waitForTimeout(200);
    await p.fill('#ivx-m', '25'); await p.waitForTimeout(100);
    await p.evaluate(() => { const b = Array.from(document.querySelectorAll('.modal-f button')).find(x => /Crea il progetto/.test(x.textContent)); b.click(); }); await p.waitForTimeout(300);
    let E = await p.evaluate(() => ({tg:(document.getElementById('ivp-tg') || {}).value}));
    ok(E.tg === '300', '«Crea il progetto con questi numeri» also writes the expected binders', E);
    await p.fill('#ivp-name', 'Verdi Raffica 2026'); await p.fill('#ivp-nb', '5'); await p.fill('#ivp-nf', '40');
    await p.evaluate(() => { const b = Array.from(document.querySelectorAll('.modal-f button')).find(x => x.classList.contains('btn-primary')); b.click(); }); await p.waitForTimeout(400);
    const P = await p.evaluate(() => { const a = invProjects().find(x => x.name === 'Verdi Raffica 2026'); return a ? {id:a.id, target:a.inv.target} : null; });
    ok(P && P.target === 300, 'project saved with its target', P);
    await p.evaluate((id) => { IVP.open = id; renderAll(); }, P.id); await p.waitForTimeout(200);
    E = await p.evaluate(() => (document.getElementById('ivx-prog') || {}).textContent || '');
    ok(/0 di 300 faldoni previsti · 0%/.test(E), 'Lavoro card: progress towards the target', E);
    // edit: the target changes and is logged
    await p.evaluate((id) => ivpOpenForm(id), P.id); await p.waitForTimeout(200);
    await p.fill('#ivp-tg', '40');
    await p.evaluate(() => { const b = Array.from(document.querySelectorAll('.modal-f button')).find(x => x.classList.contains('btn-primary')); b.click(); }); await p.waitForTimeout(300);
    E = await p.evaluate((id) => ({t:ivpProj(id).inv.target, log:LOG.entries.some(e => e.action === 'inventory.edit' && /target/.test(e.summary))}), P.id);
    ok(E.t === 40 && E.log, 'editing the target is saved and logged', E);

    /* ---------------- phone, local mode: burst ---------------- */
    await p.evaluate(async () => { await dmProviders().auth.addUser({username:'inv5', display_name:'Ada', role:'editor', secret:'135790'}); });
    const q = await ctx.newPage(); const qerrs = [];
    q.on('pageerror', e => qerrs.push('PAGEERR ' + e.message)); q.on('console', m => { if (m.type() === 'error') qerrs.push('CONSOLE ' + m.text()); });
    await q.setViewportSize({width:390, height:844});
    await q.goto(fileUrl('scan.html') + '?inv=' + encodeURIComponent(P.id)); await q.waitForTimeout(600);
    await q.fill('#sc-user', 'inv5'); await q.fill('#sc-pin', '135790'); await q.click('#sc-enter'); await q.waitForTimeout(1200);
    const U = (kind, n) => p.evaluate(({id, kind, n}) => 'https://qr7.it/' + invLabelCode(ivpProj(id).inv.prefix, kind, n), {id:P.id, kind, n});
    const box1 = await U('box', 1), box2 = await U('box', 2), bs = []; for (let i = 1; i <= 8; i++) bs.push(await U('binder', i));
    await q.evaluate(() => {
      const cv = document.createElement('canvas'); cv.width = 320; cv.height = 240; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 320, 240);
      IV.cam = {video:cv, engine:'native', boxes:new Map(), stop(){}, attach(){}};
    });
    const frame = (list) => q.evaluate((list) => { IV.cam.boxes = new Map(list.map((v, i) => [v, {x:10 + i * 60, y:20, width:30, height:30}])); return IV_API.ivCodes(list); }, list);
    let V = await q.evaluate(() => ({prog:(document.getElementById('iv-prog') || {}).textContent || '', burst:!!document.getElementById('iv-burst')}));
    ok(/0 di 40 previsti/.test(V.prog) && V.burst, 'phone: progress towards the target and the burst switch', V);
    // burst off: one code per frame, as before
    await frame([box1, bs[0], bs[1]]); await q.waitForTimeout(150);
    V = await q.evaluate(() => ({n:IV.list.length, box:IV.box && IV.box.code}));
    ok(V.n === 0 && /S001/.test(V.box || ''), 'burst off: only the first code of the frame (here the box)', V);
    await q.evaluate(() => { const c = document.getElementById('iv-burst'); c.scrollIntoView({block:'center'}); c.click(); }); await q.waitForTimeout(150);
    V = await q.evaluate(() => ({on:IV.burst, pref:Object.values(JSON.parse(localStorage.getItem('docmap_v26_inv_prefs') || '{}')).some(x => x.burst === true), h:(document.getElementById('iv-burst-h') || {}).textContent || ''}));
    ok(V.on && V.pref && /fila di coste/.test(V.h), 'burst on: remembered on the phone, with a hint', V);
    await frame([bs[2], bs[0], box1, bs[1]]); await q.waitForTimeout(250);
    V = await q.evaluate(() => ({nums:IV.list.map(x => x.num), msg:IV.msg && IV.msg.text, box:IV.list.map(x => x.box), sizes:null}));
    ok(V.nums.join() === 'VERDIRAFFICA-0001,VERDIRAFFICA-0002,VERDIRAFFICA-0003'.replace(/VERDIRAFFICA/g, V.nums[0] ? V.nums[0].split('-')[0] : 'X') && V.box.every(x => /S001/.test(x)) && /3 faldoni in una volta/.test(V.msg),
      'burst: three binders from one frame, in label order, in the box of the frame', V);
    const W = await q.evaluate(async () => Promise.all(IV.list.map(x => new Promise(r => { if (!x.thumb) return r(0); const i = new Image(); i.onload = () => r(i.naturalWidth + 'x' + i.naturalHeight); i.onerror = () => r(-1); i.src = x.thumb; }))));
    ok(W.filter(Boolean).every(w => w === '66x240'), 'burst photo: each binder keeps the strip of its own spine', W);
    // the same labels still in view: silent, nothing new
    await q.evaluate(() => { IV.msg = null; });
    await frame([bs[0], bs[1], bs[2], bs[3]]); await q.waitForTimeout(250);
    V = await q.evaluate(() => ({n:IV.list.length, msg:IV.msg && IV.msg.text, kind:IV.msg && IV.msg.kind, q:IV_API.ivOutbox().filter(j => j.kind === 'rec').length}));
    ok(V.n === 4 && V.kind === 'ok' && !/già/.test(V.msg || ''), 'labels already done in the frame are silent; the new one is captured', V);
    // two boxes in a frame: refused, binders still captured
    await frame([box1, box2, bs[4]]); await q.waitForTimeout(250);
    V = await q.evaluate(() => ({n:IV.list.length, box:IV.box && IV.box.code, warned:/Più scatole/.test((document.getElementById('iv-flash') || {}).textContent || '') || /Più scatole/.test(JSON.stringify(IV.msg))}));
    ok(V.n === 5 && /S001/.test(V.box || ''), 'two boxes in one frame: the box does not change, the binder is captured', V);
    // progress with the measured pace
    await q.evaluate(() => { IV.pace = [8000, 8000, 8000]; IV_API.ivProgHTML && (document.getElementById('iv-prog').outerHTML = IV_API.ivProgHTML()); });
    V = await q.evaluate(() => (document.getElementById('iv-prog') || {}).textContent || '');
    ok(/5 di 40 previsti · 13%/.test(V) && /mancano circa 5 min/.test(V) && /fine verso le \d\d:\d\d/.test(V), 'phone progress: time left and end time at the measured pace', V);
    V = await q.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    ok(V[0] <= V[1] + 1, 'phone: no horizontal scroll', V);
    ok(qerrs.length === 0, 'no JS errors on the phone', qerrs);

    /* ---------------- PC: progress after the phone ---------------- */
    await q.evaluate(async () => { for (let i = 0; i < 40 && (IV.flushing.rec || IV.flushing.ai); i++) await new Promise(r => setTimeout(r, 50)); });
    await p.reload(); await p.waitForTimeout(1300);
    await p.evaluate((id) => { S.view = 'inv'; IVP.open = id; renderAll(); }, P.id); await p.waitForTimeout(300);
    E = await p.evaluate(() => (document.getElementById('ivx-prog') || {}).textContent || '');
    ok(/5 di 40 faldoni previsti · 13%/.test(E), 'Lavoro card counts the binders captured on the phone', E);
    ok(errs.length === 0, 'no JS errors on the PC', errs);
  } finally { await b.close(); }
  console.log(`\nV12.15: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
