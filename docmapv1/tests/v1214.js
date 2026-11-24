// v12.14 (26.12.14) checks (~30 s): a more solid inventory + quick estimate of a job.
// Model (invEstimate, invPaceHistory, invRescueParse); PC (estimate modal, «Crea il progetto» pre-filled, import of a phone
// rescue copy twice without duplicates, newer copy wins); phone in local mode with a stubbed server: busy server and
// timeouts wait with a growing pause instead of stopping, an expired sign-in waits for the next sign-in, a refusal stops
// only that job, the AI gives up after 3 tries without blocking, a full phone memory stops new captures instead of losing
// them, photos already on the server are pruned from the phone (newest kept), health panel, rescue file.
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node v1214.js
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
    ok(await p.evaluate(() => typeof invEstimate === 'function' && typeof ivxOpenEstimate === 'function' && typeof ivxRescueApply === 'function'), 'v12.14 loaded');

    /* ---------------- model ---------------- */
    const M = await p.evaluate(() => {
      const pr = {binder:1.2, box:2.5, doc:0.4, fixed:50, vat:22};
      const r = {};
      r.a = invEstimate({metres:10, perMetre:12, secPerBinder:8, people:1, setupHours:1, hoursPerDay:6.5, spare:10}, pr);
      r.b = invEstimate({boxes:'40', perBox:'8', docsPerBinder:'2', secPerBinder:'6', people:2}, pr);
      r.z = invEstimate({}, pr); r.bad = invEstimate({metres:'-3', perMetre:'x', secPerBinder:'0'}, null);
      r.rp = [invRescueParse('nope'), invRescueParse('{"format":"x","recs":[]}'), invRescueParse(JSON.stringify({format:'docmap-inv-rescue', v:1, recs:[{id:'inv-abc', _type:'binder'}, {id:'evil', _type:'binder'}, {id:'inv-x', _type:'client'}],
        photos:{'ph-abc-1':'data:image/jpeg;base64,AAAA', 'bad id':'data:image/jpeg;base64,AAAA', 'ph-x':'javascript:alert(1)'}, project:{id:'p1', code:'C', name:'N'}}))];
      return r;
    });
    ok(M.a.binders === 120 && M.a.boxes === 15 && M.a.hours === 1.3 && M.a.days === 0.5 && M.a.labels.binder === 132 && M.a.labels.box === 17 && M.a.bill.net === 231.5 && M.a.bill.gross === 282.43 && M.a.perHourBinders === 450,
      'estimate: 10 m × 12 = 120 binders, 15 boxes, hours with setup, labels with 10% spare, price from the prices', M.a);
    ok(M.b.binders === 320 && M.b.docs === 640 && M.b.boxes === 40 && M.b.hours === 1.4 && M.b.perHourBinders === 1200 && M.z.binders === 0 && M.z.days === 0 && M.bad.binders === 0 && M.bad.sec === 8 && M.bad.bill === null,
      'estimate: boxes × binders, documents at a third of the time, two people; empty or wrong input never breaks', {b:M.b, z:M.z, bad:M.bad});
    ok(M.rp[0] === null && M.rp[1] === null && M.rp[2].recs.length === 1 && Object.keys(M.rp[2].photos).join() === 'ph-abc-1' && M.rp[2].project.id === 'p1', 'rescue file: only inventory records and image photos are accepted', M.rp[2]);

    /* ---------------- PC: estimate ---------------- */
    await p.evaluate(() => { S.view = 'inv'; IVP.open = ''; renderAll(); });
    await p.click('#ivx-est'); await p.waitForTimeout(200);
    await p.fill('#ivx-m', '25'); await p.waitForTimeout(100);
    let E = await p.evaluate(() => ({kpi:document.querySelectorAll('#ivx-out .kpi').length, txt:(document.getElementById('ivx-out') || {}).textContent || '', lab:(document.getElementById('ivx-labels') || {}).textContent, hint:(document.getElementById('ivx-sec-h') || {}).textContent}));
    ok(E.kpi >= 6 && /300/.test(E.txt) && /330 per i faldoni/.test(E.lab) && /valore di partenza 8/.test(E.hint), 'PC: «Stima un lavoro» computes as you type (25 m → 300 binders, 330 labels), starting pace when nothing was measured', E);
    await p.evaluate(() => { const b = Array.from(document.querySelectorAll('.modal-f button')).find(x => /Crea il progetto/.test(x.textContent)); b.click(); }); await p.waitForTimeout(300);
    E = await p.evaluate(() => ({nf:(document.getElementById('ivp-nf') || {}).value, nb:(document.getElementById('ivp-nb') || {}).value, form:!!document.getElementById('ivp-form')}));
    ok(E.form && E.nf === '330' && E.nb === '42', '«Crea il progetto con questi numeri» opens the new project with the labels to generate', E);
    await p.fill('#ivp-name', 'Bianchi Stima 2026'); await p.evaluate(() => { const b = Array.from(document.querySelectorAll('.modal-f button')).find(x => /Nuovo progetto|Crea/.test(x.textContent) && x.classList.contains('btn-primary')); b.click(); }); await p.waitForTimeout(400);
    const P = await p.evaluate(() => { const a = invProjects().find(x => x.name === 'Bianchi Stima 2026'); return a ? {id:a.id, inv:a.inv} : null; });
    ok(P && P.inv.binder_to === 330 && P.inv.box_to === 42, 'project created with 330 binder and 42 box labels', P && {b:P.inv.binder_to, s:P.inv.box_to});

    /* ---------------- phone, local mode, stubbed server ---------------- */
    await p.evaluate(async () => { await dmProviders().auth.addUser({username:'inv4', display_name:'Ugo', role:'editor', secret:'246810'}); });
    const q = await ctx.newPage(); const qerrs = [];
    q.on('pageerror', e => qerrs.push('PAGEERR ' + e.message)); q.on('console', m => { if (m.type() === 'error') qerrs.push('CONSOLE ' + m.text()); });
    await q.setViewportSize({width:390, height:844});
    await q.goto(fileUrl('scan.html') + '?inv=' + encodeURIComponent(P.id)); await q.waitForTimeout(600);
    await q.fill('#sc-user', 'inv4'); await q.fill('#sc-pin', '246810'); await q.click('#sc-enter'); await q.waitForTimeout(1200);
    const code = (kind, n) => p.evaluate(({id, kind, n}) => invLabelCode(ivpProj(id).inv.prefix, kind, n), {id:P.id, kind, n});
    const C = {box1:await code('box', 1), b:[]}; for (let i = 1; i <= 8; i++) C.b.push(await code('binder', i));
    // stub: the "server" answers what the test decides
    await q.evaluate(() => {
      const real = SC.P.data; window.__real = real; window.__mode = 'ok'; window.__calls = 0; window.__ai = 'ok';
      const fail = (c) => { const e = new DMError(c, c === 'invalid' ? 'bad record' : c); if (c === 'locked') e.data = {retry_in:7}; throw e; };
      SC.P.data = Object.assign(Object.create(Object.getPrototypeOf(real)), real, {
        invPush: async function(){ window.__calls++; if (window.__mode !== 'ok') fail(window.__mode); return real.invPush.apply(real, arguments); },
        invPhotoPut: async function(){ if (window.__mode !== 'ok') fail(window.__mode); return {id:arguments[0].id}; },   // pretends the server has it (not local)
        invAi: async function(){ if (window.__ai !== 'ok') fail(window.__ai); return {enabled:true, model:'m', result:{title:'Letto', confidence:0.9}}; },
        invGetBinder: async function(){ return null; }
      });
      IV.proj.inv.ai = true;
      const cv = document.createElement('canvas'); cv.width = 320; cv.height = 240; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 320, 240); IV.cam = {video:cv, stop(){}, attach(){}};
    });
    const H = (c) => q.evaluate((c) => IV_API.ivHandle('https://qr7.it/' + c, 'test'), c);
    const settle = () => q.evaluate(async () => { for (let i = 0; i < 40 && (IV.flushing.rec || IV.flushing.ai); i++) await new Promise(r => setTimeout(r, 50)); await new Promise(r => setTimeout(r, 80)); });
    const Q = () => q.evaluate(() => IV_API.ivOutbox().map(j => ({k:j.kind, wait:!!j.wait, next:j.next ? Math.round((j.next - Date.now()) / 1000) : 0, err:j.err || '', tries:j.tries})));

    // 1. busy server (5xx) → waits with a pause, nothing marked as failed
    await q.evaluate(() => { window.__mode = 'server'; });
    await H(C.box1); await H(C.b[0]); await settle();
    let J = await Q();
    ok(J.length >= 2 && J.every(j => !j.err) && J.some(j => j.wait && j.next >= 3) && /attesa di rete|in invio/.test(await q.evaluate(() => document.getElementById('iv-q').textContent)), 'busy server: jobs wait with a pause (no permanent error)', J);
    // retry after the pause with the server back → everything sent
    await q.evaluate(() => { window.__mode = 'ok'; const qq = IV_API.ivOutbox(); qq.forEach(j => { if (j.next) j.next = Date.now() - 1; }); localStorage.setItem(IV_API.IV_OUTBOX_LS, JSON.stringify(qq)); IV_API.ivWake(); });
    await settle(); await settle();
    J = await Q();
    ok(J.length === 0, 'after the pause the queue empties by itself (records and AI)', J);
    // 2. 429 with Retry-After → pause at least that long
    await q.evaluate(() => { window.__mode = 'locked'; }); await H(C.b[1]); await settle();
    J = await Q(); ok(J.some(j => j.wait && j.next >= 6), 'too many requests: waits at least the Retry-After seconds', J);
    // 3. expired sign-in → waits, warning, restarts with «Riprova»
    await q.evaluate(() => { window.__mode = 'unauthorized'; const qq = IV_API.ivOutbox().map(j => { delete j.wait; delete j.next; return j; }); localStorage.setItem(IV_API.IV_OUTBOX_LS, JSON.stringify(qq)); IV_API.ivFlush('rec'); });
    await settle();
    let V = await q.evaluate(() => ({auth:IV.auth, warn:(document.getElementById('iv-q-warn') || {}).textContent || '', err:IV_API.ivOutbox().some(j => j.err)}));
    ok(V.auth && /Accesso scaduto/.test(V.warn) && !V.err, 'expired sign-in: the queue waits and says so, nothing is lost', V);
    await q.evaluate(() => { window.__mode = 'ok'; document.querySelector('[data-s="iv-retry"]').click(); }); await settle(); await settle();
    V = await q.evaluate(() => ({auth:IV.auth, n:IV_API.ivOutbox().filter(j => j.kind !== 'ai').length})); ok(!V.auth && V.n === 0, '«↻» after signing in sends the queue', V);
    // 4. a real refusal stops only that job
    await q.evaluate(() => { window.__mode = 'invalid'; }); await H(C.b[2]); await settle();
    J = await Q(); ok(J.some(j => j.k === 'rec' && j.err === 'bad record'), 'a refused record is marked with its reason (manual retry)', J);
    await q.evaluate(() => { window.__mode = 'ok'; document.querySelector('[data-s="iv-retry"]').click(); }); await settle(); await settle();
    // 5. the AI gives up after 3 tries, never blocks
    await q.evaluate(() => { window.__ai = 'server'; }); await H(C.b[3]); await settle();
    for (let i = 0; i < 3; i++){ await q.evaluate(() => { const qq = IV_API.ivOutbox(); qq.forEach(j => { if (j.next) j.next = Date.now() - 1; }); localStorage.setItem(IV_API.IV_OUTBOX_LS, JSON.stringify(qq)); IV_API.ivWake(); }); await settle(); }
    V = await q.evaluate((c) => ({q:IV_API.ivOutbox().length, ai:(IV.list.find(x => x.code === c) || {}).ai, sent:(IV.list.find(x => x.code === c) || {}).sent}), C.b[3]);
    ok(V.q === 0 && V.ai === 'fail' && V.sent, 'AI failing 3 times: the reading is dropped, the binder is saved', V);
    await q.evaluate(() => { window.__ai = 'ok'; });

    // 6. phone memory full: a capture is refused instead of being lost
    await q.evaluate((k) => { const orig = Storage.prototype.setItem; window.__origSet = orig; Storage.prototype.setItem = function(key, v){ if (key === k) throw new DOMException('full', 'QuotaExceededError'); return orig.call(this, key, v); }; }, await q.evaluate(() => IV_API.IV_OUTBOX_LS));
    await q.evaluate(() => { window.__mode = 'offline'; }); await H(C.b[4]); await settle();
    V = await q.evaluate(() => ({full:IV.full, msg:IV.msg && IV.msg.text, warn:(document.getElementById('iv-q-warn') || {}).textContent || ''}));
    ok(V.full && /Memoria del telefono piena/.test(V.msg) && /piena/.test(V.warn), 'memory full: clear message, no silent loss', V);
    const before = await q.evaluate(() => IV.list.length);
    await H(C.b[5]); await settle();
    V = await q.evaluate(() => ({n:IV.list.length, msg:IV.msg.text}));
    ok(V.n === before && /piena/.test(V.msg), 'memory full: new captures stop', V);
    await q.evaluate(() => { Storage.prototype.setItem = window.__origSet; IV.full = false; window.__mode = 'offline'; });
    await H(C.b[5]); await settle();
    V = await q.evaluate(() => ({n:IV.list.length, full:IV.full, q:IV_API.ivOutbox().filter(j => j.kind === 'rec').length}));
    ok(V.n === before + 1 && !V.full && V.q >= 1, 'memory back: captures go on (queued while offline)', V);

    // 7. health panel and rescue file
    await q.click('#iv-q-t'); await q.waitForTimeout(100);
    V = await q.evaluate(() => ({rows:document.querySelectorAll('#iv-health dt').length, btn:!!document.getElementById('iv-rescue'), w:[document.documentElement.scrollWidth, innerWidth]}));
    ok(V.rows === 5 && V.btn && V.w[0] <= V.w[1] + 1, 'tapping the queue status opens the health panel (queue, oldest, memory, rescue copy)', V);
    const R = await q.evaluate(async () => { let name = ''; const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function(){ name = this.download; }; const d = await IV_API.ivRescueSave(); HTMLAnchorElement.prototype.click = orig; return {d, name}; });
    const unsent = R.d.recs.filter(x => x._type === 'binder').map(x => x.short_code);
    ok(R.d.format === 'docmap-inv-rescue' && unsent.includes(C.b[5]) && Object.keys(R.d.photos).length >= 1 && /_inventario_/.test(R.name) && /\.json$/.test(R.name), 'rescue copy: the binders not sent, with their photos, file named from the brand', {n:R.d.recs.length, ph:Object.keys(R.d.photos).length, name:R.name});

    // 8. photos the server has are pruned (newest 30 kept)
    V = await q.evaluate(async () => {
      for (let i = 0; i < 45; i++) await IVDB.put('ph-t-' + i, {id:'ph-t-' + i, data:'data:image/jpeg;base64,AA', sent:true});
      for (let i = 0; i < 45; i++) IV_API.ivPhotoSent('ph-t-' + i);
      await new Promise(r => setTimeout(r, 200));
      const left = []; for (let i = 0; i < 45; i++) if (await IVDB.get('ph-t-' + i)) left.push(i);
      return {left:left.length, first:left[0], kept:JSON.parse(localStorage.getItem(IV_API.IV_SENT_LS)).length};
    });
    ok(V.left <= 40 && V.left >= 30 && V.first >= 5 && V.kept <= 40, 'photos already on the server: only the newest stay on the phone', V);
    ok(qerrs.length === 0, 'no JS errors on the phone', qerrs);

    /* ---------------- PC: import the rescue copy (twice) ---------------- */
    const text = JSON.stringify(R.d);
    const I = await p.evaluate(async ({id, text, sc}) => {
      const a = ivpProj(id), r = {};
      S.binders = S.binders.filter(b => b.short_code !== sc);   // as if the phone never sent it
      const d = ivxRescueLoad(a, text, null); r.first = await ivxRescueApply(a, d);
      r.second = await ivxRescueApply(a, ivxRescueLoad(a, text, null));
      const nd = JSON.parse(text); nd.recs.forEach(x => { if (x.short_code === sc){ x.binder_title = 'Corretto dopo'; x.updated_at = new Date(Date.now() + 60000).toISOString(); } });
      r.third = await ivxRescueApply(a, ivxRescueLoad(a, JSON.stringify(nd), null));
      const b = S.binders.find(x => x.short_code === sc); r.b = b && {t:b.binder_title, arch:b.archive_id === a.id, ph:b.inv && b.inv.ph};
      r.n = S.binders.filter(x => x.short_code === sc).length;
      r.ph = b && b.inv.ph ? !!(await IVDB.get(b.inv.ph)) : false;
      r.other = ivxRescueLoad(invProjects().find(x => x.id !== a.id) || {id:'zz'}, text, null);
      r.log = LOG.entries.some(e => e.action === 'inventory.rescue');
      return r;
    }, {id:P.id, text, sc:C.b[5]});
    ok(I.first.added >= 1 && I.second.added === 0 && I.second.updated === 0 && I.third.updated >= 1 && I.n === 1 && I.b.t === 'Corretto dopo' && I.b.arch && I.ph && I.log && I.other === null,
      'PC import: new records added with photos, a second import adds nothing, a newer copy updates, other projects refused', I);
    await p.evaluate((id) => { IVP.open = id; renderAll(); }, P.id); await p.waitForTimeout(200);
    await p.click('#ivx-imp'); await p.waitForTimeout(150);
    V = await p.evaluate(() => ({modal:!!document.getElementById('ivx-pick')})); ok(V.modal, 'PC: «Importa dal telefono» in the Lavoro card');
    ok(errs.length === 0, 'no JS errors on the PC', errs);
  } finally { await b.close(); }
  console.log(`\nV12.14: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
