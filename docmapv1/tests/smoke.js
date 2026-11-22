// DocMap smoke test (~1 min): the app boots from file://, every main view renders without JS errors,
// a label sheet is built, scan.html loads. Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node smoke.js
// It is NOT a replacement for suite.js (full regression, ~35 min): run that before every release.
const {chromium} = require('playwright');
const path = require('path');
const fileUrl = f => 'file://' + path.resolve(__dirname, '..', f).replace(/\\/g, '/');
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) passes++; else { fails++; console.log('  ✗ FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); } };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport: {width: 1366, height: 768}});
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto(fileUrl('index.html')); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => typeof S === 'object' && typeof APP_VERSION === 'string'), 'app booted');
  console.log('  APP_VERSION', await p.evaluate(() => APP_VERSION));
  await p.evaluate(() => { const m = document.querySelector('.modal-f [data-a="modal-btn"]'); if (m) m.click(); });
  ok(await p.evaluate(() => DB.ready && !DB.error), 'SQLite ready');
  for (const v of ['archive', 'print', 'info', 'import', 'export', 'ai', 'database', 'settings']) {
    await p.evaluate(v => { S.view = v; renderAll(); }, v); await p.waitForTimeout(200);
    ok(await p.evaluate(() => document.querySelector('#view, main, .view') !== null), 'view ' + v + ' rendered');
  }
  ok(await p.evaluate(() => { const r = buildLabelSheets(false); return !!r; }), 'label sheets built');
  await p.evaluate(() => { S.lang = 'en'; renderAll(); S.lang = 'it'; renderAll(); });
  ok(errs.length === 0, 'no JS errors in index.html', errs);
  const q = await ctx.newPage(); const qerrs = [];
  q.on('pageerror', e => qerrs.push('PAGEERR ' + e.message));
  await q.goto(fileUrl('scan.html')); await q.waitForTimeout(1200);
  ok(qerrs.length === 0, 'no JS errors in scan.html', qerrs);
  await b.close();
  console.log(`\nSMOKE: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
