// v12.16 (26.12.16) checks (~30 s): inventory at box level AND binder level, every way of labelling.
// Model (labelling plan, box-level data, shots with the QR positions, recognisers, code for a binder without a label,
// training rows, report with the binders counted by hand); PC (plan in the project form, labels with a big / hidden
// readable code, OUT + IN copies for boxes, boxes card, training export); phone in local mode: box-level project (count,
// tags and years on the box, note), photo of the open box (QR positions saved, labels not captured yet captured at once),
// binder without a label; PC after the phone (boxes card, report, data kept after a reload).
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node v1216.js
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
    ok(await p.evaluate(() => typeof invPlanNorm === 'function' && typeof invRecognize === 'function' && typeof ivxBoxesHTML === 'function'), 'v12.16 loaded');

    /* ---------------- model ---------------- */
    const M = await p.evaluate(() => {
      const r = {};
      r.pl = [invPlanNorm(), invPlanNorm({box:'inout', binder:'none', code:'big', short:false}), invPlanNorm({box:'x', binder:7, code:'tiny'}), normalizeInv({}).plan];
      r.cp = [invPlanCopies({box:'inout'}, 'box'), invPlanCopies({box:'inout'}, 'binder'), invPlanCopies({box:'out'}, 'box')];
      r.bx = [invBoxNorm(), invBoxNorm({count:'12', years:' 2015-2018 ', tags:'A, B', note:'x'}), invBoxNorm({count:-1}), invBoxNorm({count:''}), invBoxNorm({count:0})].map(x => [x.count, x.years, x.tags.join('|'), x.shots.length]);
      r.ct = [invBoxCounted(null, 4), invBoxCounted(10, 4), invBoxCounted(2, 4)];
      r.sh = [invShotNorm(null), invShotNorm({ph:'bad id'}), invShotNorm({ph:'ph-a-1', w:800, h:600, codes:[{c:'dm26AbcdAAAB', x:0.1, y:0.2, w:0.05, h:0.07}, {c:'evil', x:1}, {c:'dm26LAbcdAAAB', x:2, y:-1, w:0.1, h:0.1}]})];
      const m = new Map([['https://qr7.it/dm26AbcdAAAB', {x:80, y:120, width:40, height:40}], ['nonsense', {x:0, y:0, width:5, height:5}], ['https://qr7.it/dm26LAbcdAAAB', {x:400, y:10, width:60, height:60}]]);
      r.sc = invShotCodes(m, 800, 600);
      const shot = {ph:'ph-b-1', w:800, h:600, codes:r.sc};
      r.rg = invRecognize(shot);
      invRecognizerAdd({id:'test-seg', priority:5, run:(s) => s.codes.filter(c => !/^dm26L/.test(c.c)).map(c => ({c:c.c, x:0.08, y:0, w:0.12, h:1, score:0.9}))});
      r.rg2 = invRecognize(shot); r.ids = INV_RECOGNIZERS.map(x => x.id);
      INV_RECOGNIZERS.splice(INV_RECOGNIZERS.findIndex(x => x.id === 'test-seg'), 1);
      r.nl = []; for (let i = 0; i < 30; i++) r.nl.push(invNolabelCode(['Abcd'])); r.nlok = r.nl.every(c => /^dm26[A-Za-z0-9]{8}$/.test(c) && !(invParseCode(c) && invParseCode(c).prefix === 'Abcd'));
      return r;
    });
    ok(JSON.stringify(M.pl[0]) === '{"box":"out","binder":"all","code":"normal","short":true}' && M.pl[1].box === 'inout' && M.pl[1].binder === 'none' && M.pl[1].code === 'big' && M.pl[1].short === false && M.pl[2].box === 'out' && M.pl[2].code === 'normal' && M.pl[3].binder === 'all',
      'labelling plan: defaults, choices, wrong values fall back', M.pl);
    ok(M.cp.join() === '2,1,1', 'two labels for a box labelled inside and outside, one otherwise', M.cp);
    ok(JSON.stringify(M.bx) === JSON.stringify([[null, '', '', 0], [12, '2015-2018', 'A|B', 0], [null, '', '', 0], [null, '', '', 0], [0, '', '', 0]]), 'box data: count by hand (null = not counted, 0 is a count), years, tags', M.bx);
    ok(M.ct.join() === '4,10,4', 'binders of a box: the count by hand, never fewer than the captured ones', M.ct);
    ok(M.sh[0] === null && M.sh[1] === null && M.sh[2].codes.length === 2 && M.sh[2].codes[1].x === 1 && M.sh[2].codes[1].y === 0, 'box photo: only valid photo ids and codes, positions inside 0..1', M.sh[2]);
    ok(M.sc.length === 2 && M.sc[0].c === 'dm26AbcdAAAB' && M.sc[0].x === 0.1 && M.sc[0].y === 0.2 && M.sc[1].c === 'dm26LAbcdAAAB', 'QR positions of a frame become fractions of the photo', M.sc);
    ok(M.rg.length === 1 && M.rg[0].by === 'qr-anchor' && M.rg[0].h === 1 && M.rg2[0].by === 'test-seg' && M.rg2[0].score === 0.9 && M.ids[0] === 'test-seg', 'recognisers: QR strips by default, a better model registered later wins', {rg:M.rg, rg2:M.rg2, ids:M.ids});
    ok(M.nlok && new Set(M.nl).size === 30, 'binder without a label: a normal random code, never in the project range', M.nl.slice(0, 3));

    /* ---------------- PC: plan in the form, labels ---------------- */
    await p.evaluate(() => { S.view = 'inv'; IVP.open = ''; renderAll(); });
    await p.click('#ivp-new'); await p.waitForTimeout(250);
    let E = await p.evaluate(() => ({plan:!!document.getElementById('ivp-plan'), code:(document.getElementById('ivp-pl-code') || {}).value, h:(document.getElementById('ivp-plan-h') || {}).textContent}));
    ok(E.plan && E.code === 'big' && /etichetta della scatola/.test(E.h), 'new project: labelling plan with the big readable code proposed and what it means', E);
    await p.fill('#ivp-name', 'Neri Scatole 2026'); await p.fill('#ivp-nb', '4'); await p.fill('#ivp-nf', '20');
    await p.selectOption('#ivp-pl-box', 'inout'); await p.selectOption('#ivp-pl-bin', 'none'); await p.waitForTimeout(80);
    E = await p.evaluate(() => (document.getElementById('ivp-plan-h') || {}).textContent);
    ok(/FUORI e DENTRO/.test(E) && /quanti faldoni/.test(E), 'the explanation follows the choice', E);
    await p.evaluate(() => { const b = Array.from(document.querySelectorAll('.modal-f button')).find(x => x.classList.contains('btn-primary')); b.click(); }); await p.waitForTimeout(400);
    const P = await p.evaluate(() => { const a = invProjects().find(x => x.name === 'Neri Scatole 2026'); return a ? {id:a.id, plan:a.inv.plan, batches:a.inv.batches.map(b => ({id:b.id, kind:b.kind}))} : null; });
    ok(P && P.plan.box === 'inout' && P.plan.binder === 'none' && P.plan.code === 'big', 'project saved with its plan', P && P.plan);
    const L = await p.evaluate((id) => {
      const a = ivpProj(id), f = {w:60, h:40}, it = {kind:'box', n:1, code:invLabelCode(a.inv.prefix, 'box', 1), num:invNumber(a.inv, 'box', 1)};
      const big = ivpLabelHTML(a, it, f); const keep = a.inv.plan;
      a.inv.plan = invPlanNorm(Object.assign({}, keep, {code:'normal'})); const norm = ivpLabelHTML(a, it, f);
      a.inv.plan = invPlanNorm(Object.assign({}, keep, {code:'hidden', short:false})); const hid = ivpLabelHTML(a, it, f);
      a.inv.plan = keep;
      const fs = (h) => { const m = h.match(/class="ivp-num" style="font-size:([\d.]+)mm/); return m ? +m[1] : 0; };
      return {big:fs(big), norm:fs(norm), hid:/ivp-num/.test(hid), sc:/ivp-sc/.test(hid), scN:/ivp-sc/.test(norm)};
    }, P.id);
    ok(L.big > L.norm && L.norm > 0 && !L.hid && !L.sc && L.scN, 'label: big readable code is bigger, hidden has no readable code, the QR code text can be left out', L);
    const bb = P.batches.find(x => x.kind === 'box');
    await p.evaluate(({id, bid}) => ivpOpenPrint(id, bid), {id:P.id, bid:bb.id}); await p.waitForTimeout(250);
    E = await p.evaluate(() => ({p:(document.getElementById('ivp-pr-p') || {}).textContent, cp:(document.getElementById('ivp-pr-cp') || {}).value, prev:(document.getElementById('ivp-pr-prev') || {}).textContent}));
    ok(E.cp === '2' && /\b8 etichette/.test(E.p) && /FUORI/.test(E.prev), 'printing box labels: two per box (OUT then IN) from the plan', E);
    await p.selectOption('#ivp-pr-cp', '1'); await p.waitForTimeout(100);
    E = await p.evaluate(() => (document.getElementById('ivp-pr-p') || {}).textContent);
    ok(/\b4 etichette/.test(E), 'one label per box when chosen', E);
    await p.selectOption('#ivp-pr-cp', '2'); await p.waitForTimeout(80);
    await p.evaluate(() => { window.__printed = ''; window.__dp = window.doPrint; window.doPrint = async (k, html) => { window.__printed = html; }; });
    await p.evaluate(() => { const b = Array.from(document.querySelectorAll('.modal-f button')).find(x => x.classList.contains('btn-primary')); b.click(); }); await p.waitForTimeout(300);
    E = await p.evaluate((id) => ({labs:(window.__printed.match(/class="ivp-lab"/g) || []).length, out:(window.__printed.match(/FUORI/g) || []).length, inn:(window.__printed.match(/DENTRO/g) || []).length, plan:ivpProj(id).inv.plan.box}), P.id);
    await p.evaluate(() => { window.doPrint = window.__dp; });
    ok(E.labs === 8 && E.out === 4 && E.inn === 4 && E.plan === 'inout', 'printed sheet: 4 boxes × (OUT + IN)', E);

    /* ---------------- phone, local mode: box level ---------------- */
    await p.evaluate(async () => { await dmProviders().auth.addUser({username:'inv6', display_name:'Eva', role:'editor', secret:'112358'}); });
    const q = await ctx.newPage(); const qerrs = [];
    q.on('pageerror', e => qerrs.push('PAGEERR ' + e.message)); q.on('console', m => { if (m.type() === 'error') qerrs.push('CONSOLE ' + m.text()); });
    await q.setViewportSize({width:390, height:844});
    await q.goto(fileUrl('scan.html') + '?inv=' + encodeURIComponent(P.id)); await q.waitForTimeout(600);
    await q.fill('#sc-user', 'inv6'); await q.fill('#sc-pin', '112358'); await q.click('#sc-enter'); await q.waitForTimeout(1200);
    const U = (kind, n) => p.evaluate(({id, kind, n}) => 'https://qr7.it/' + invLabelCode(ivpProj(id).inv.prefix, kind, n), {id:P.id, kind, n});
    const box1 = await U('box', 1), b1 = await U('binder', 1), b2 = await U('binder', 2);
    await q.evaluate(() => {
      const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480; const g = cv.getContext('2d'); g.fillStyle = '#eee'; g.fillRect(0, 0, 640, 480);
      IV.cam = {video:cv, engine:'native', boxes:new Map(), stop(){}, attach(){}};
    });
    await q.evaluate((c) => IV_API.ivHandle(c, 'test'), box1); await q.waitForTimeout(150);
    let V = await q.evaluate(() => ({panel:!!document.getElementById('iv-bxp') && !document.getElementById('iv-bxp').classList.contains('none'), nl:!!document.getElementById('iv-bx-nl'), lvl:(document.getElementById('iv-bx-level') || {}).textContent || '', n:(document.getElementById('iv-bx-n') || {}).value}));
    ok(V.panel && V.nl && /Livello scatola/.test(V.lvl) && V.n === '0', 'phone: the open box has its panel (count, photo, binder without a label)', V);
    const clk = (sel) => q.evaluate((sel) => { const e = document.querySelector(sel); e.scrollIntoView({block:'center'}); e.click(); }, sel);
    for (let i = 0; i < 3; i++){ await clk('[data-s="iv-bx-inc"]'); await q.waitForTimeout(40); }
    await clk('[data-s="iv-bx-dec"]'); await q.waitForTimeout(40);
    await q.evaluate(() => { const i = document.getElementById('iv-bx-n'); i.value = '12'; i.dispatchEvent(new Event('change', {bubbles:true})); }); await q.waitForTimeout(60);
    await q.evaluate(() => { document.querySelector('[data-s="iv-tag"]').click(); }); await q.evaluate(() => { document.querySelectorAll('[data-s="iv-year"]')[3].click(); }); await q.evaluate(() => { document.querySelectorAll('[data-s="iv-year"]')[1].click(); }); await q.waitForTimeout(60);
    await q.evaluate(() => { const i = document.getElementById('iv-bx-note'); i.value = 'Bagnata in fondo'; i.dispatchEvent(new Event('change', {bubbles:true})); }); await q.waitForTimeout(1500);
    V = await q.evaluate(() => { const x = IV_API.ivBoxInv(), j = IV_API.ivOutbox().filter(j => j.kind === 'rec' && j.recs[0]._type === 'location'); return {count:x.count, tags:x.tags, years:x.years, note:x.note, jobs:j.length, last:j.length ? (j[j.length - 1].recs[0].inv || {}).count : null, binders:IV.list.length}; });
    ok(V.count === 12 && V.tags.length === 1 && /^\d{4}-\d{4}$/.test(V.years) && V.note === 'Bagnata in fondo' && V.binders === 0, 'box level: count by hand, tags, years and note go on the box (no binder created)', V);
    // photo of the open box: 2 binder labels + the box label in view
    await q.evaluate(({box1, b1, b2}) => { IV.cam.boxes = new Map([[box1, {x:20, y:20, width:60, height:60}], [b1, {x:200, y:300, width:40, height:40}], [b2, {x:400, y:300, width:40, height:40}]]); }, {box1, b1, b2});
    await clk('#iv-bx-shot'); await q.waitForTimeout(500);
    V = await q.evaluate(async () => { const x = IV_API.ivBoxInv(), s = x.shots[0] || {}; const ph = s.ph ? await IVDB.get(s.ph) : null; return {shots:x.shots.length, codes:(s.codes || []).length, w:s.w, h:s.h, ph:!!(ph && ph.data), list:IV.list.map(y => y.num), msg:IV.msg && IV.msg.text}; });
    ok(V.shots === 1 && V.codes === 3 && V.w === 640 && V.h === 480 && V.ph && V.list.length === 2, 'photo of the open box: saved with the 3 label positions; the 2 binders not captured yet are captured at once', V);
    // binder without a label
    await clk('#iv-bx-nl'); await q.waitForTimeout(200);
    V = await q.evaluate(() => { const x = IV.list[IV.list.length - 1], r = IV_API.ivRecent()[x.code]; return {nl:x.nolabel, code:x.code, num:x.num, rec:r && {sc:r.short_code, loc:r.location_id, nolabel:r.inv.nolabel, ph:!!r.inv.ph, sp:r.speaking_code}, box:IV.box.id, msg:IV.msg.text}; });
    ok(V.nl && /^dm26[A-Za-z0-9]{8}$/.test(V.code) && V.rec.sc === V.code && V.rec.loc === V.box && V.rec.nolabel === 1 && V.rec.ph && /S001\/01/.test(V.rec.sp) && /senza etichetta/.test(V.msg), 'binder without a label: own random code, in the open box, photo of the spine', V);
    V = await q.evaluate(() => (document.getElementById('iv-bx-n') || {}).value);
    ok(V === '12', 'the box keeps its count by hand (12 ≥ 3 captured)', V);
    V = await q.evaluate(() => { const ids = IV_API.ivPhotoIds(IV_API.ivBoxRec()); return {ids, shot:IV_API.ivBoxInv().shots[0].ph}; });
    ok(V.ids.includes(V.shot), 'the box photo travels with the box record', V);
    V = await q.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    ok(V[0] <= V[1] + 1, 'phone: no horizontal scroll', V);
    await q.evaluate(async () => { for (let i = 0; i < 60 && (IV.flushing.rec || IV.flushing.ai || IV_API.ivOutbox().some(j => j.kind === 'rec')); i++){ IV_API.ivFlush('rec'); await new Promise(r => setTimeout(r, 80)); } });
    ok(qerrs.length === 0, 'no JS errors on the phone', qerrs);

    /* ---------------- PC after the phone ---------------- */
    await p.reload(); await p.waitForTimeout(1300);
    await p.evaluate((id) => { S.view = 'inv'; IVP.open = id; renderAll(); }, P.id); await p.waitForTimeout(300);
    E = await p.evaluate((id) => { const a = ivpProj(id), R = invReport(a, S.binders, S.locations, [], S.settings, 120000), row = (document.querySelector('#ivx-boxes tbody tr') || {}).textContent || '';
      const l = S.locations.find(x => x.archive_id === id && x.inv); return {row, counted:R.counted, nolabel:R.nolabel, bins:R.binders, bill:(R.bill.lines.find(x => x.k === 'binder') || {}).qty, loc:l && {count:l.inv.count, shots:(l.inv.shots || []).length, note:l.inv.note}}; }, P.id);
    ok(E.loc && E.loc.count === 12 && E.loc.shots === 1 && E.loc.note === 'Bagnata in fondo', 'PC: the box data arrive from the phone and stay after a reload', E.loc);
    ok(E.bins === 3 && E.nolabel === 1 && E.counted === 12 && E.bill === 12 && /S001/.test(E.row) && /12/.test(E.row), 'PC: boxes card and report count 12 binders (3 captured + 9 counted by hand), billed on 12', E);
    E = await p.evaluate(async (id) => { let out = null; const dl = window.download; window.download = (name, text) => { out = {name, text}; }; const r = await ivxTrainExport(ivpProj(id), {only:false, photos:false}); window.download = dl;
      const rows = out ? out.text.trim().split('\n').map(x => JSON.parse(x)) : []; return {n:r.n, name:out && out.name, kinds:rows.map(x => x.t), shot:rows.find(x => x.t === 'shot'), log:LOG.entries.some(e => e.action === 'inventory.train_export')}; }, P.id);
    ok(E.n === 4 && /addestramento_/.test(E.name) && /\.jsonl$/.test(E.name) && E.kinds.filter(k => k === 'binder').length === 3 && E.shot && E.shot.codes.length === 3 && E.log, 'training data: one row per binder photo + the box photo with the label positions, logged', E);
    E = await p.evaluate((id) => { let n = 0; const a = ivpProj(id); invTrainRows(a, S.binders, S.locations).forEach(r => { if (r.t === 'binder' && r.confirmed) n++; }); return n; }, P.id);
    ok(E === 0, 'nothing confirmed yet: «solo confermati» exports only the box photos', E);
    ok(errs.length === 0, 'no JS errors on the PC', errs);
  } finally { await b.close(); }
  console.log(`\nV12.16: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
