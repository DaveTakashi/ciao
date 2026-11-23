// DocMap v12.9 (26.12.9) checks (~1 min): installable app (service worker sw.js + manifests + icons) and the stopwatch
// of real working times (02h-timing.js). The PWA part runs against a real web deploy (tools/build_deploy.py) served by
// php -S on 127.0.0.1 (a secure context, like https), including an offline reload.
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node v129.js       (needs php 8)
const {chromium} = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os'), {spawn, execFileSync} = require('child_process');
const APP = path.resolve(__dirname, '..');
const fileUrl = f => 'file://' + path.join(APP, f).replace(/\\/g, '/');
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) passes++; else { fails++; console.log('  ✗ FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'docmap-v129-')), root = path.join(work, 'root'), dep = path.join(root, 'studio-de');
  execFileSync('python3', [path.join(APP, 'tools', 'build_deploy.py'), dep, '--base-path', '/studio-de/', '--slug', 'studio-de', '--no-server'], {stdio:'ignore'});
  const port = 18000 + Math.floor(Math.random() * 900), O = 'http://127.0.0.1:' + port + '/studio-de/';
  const php = spawn('php', ['-S', '127.0.0.1:' + port, '-t', root, path.join(__dirname, 'php-router.php')], {stdio:'ignore'});
  for (let i = 0; i < 50; i++){ try { const r = await fetch(O + 'index.html'); if (r.ok) break; } catch(e){} await sleep(100); }

  // ---- files ----
  const swSrc = fs.readFileSync(path.join(APP, 'sw.js'), 'utf8'), core = fs.readFileSync(path.join(APP, 'assets/js/02-core.js'), 'utf8');
  const swVer = (swSrc.match(/SW_VERSION = '([^']+)'/) || [])[1], appVer = (core.match(/APP_VERSION = '([^']+)'/) || [])[1];
  const APP_V = appVer;
  ok(swVer && swVer === appVer, 'sw.js SW_VERSION = APP_VERSION (a new release replaces the old cache)', [swVer, appVer]);
  const man = ['manifest.webmanifest', 'scan.webmanifest'].map(f => JSON.parse(fs.readFileSync(path.join(APP, f), 'utf8')));
  ok(man[0].start_url === './index.html' && man[1].start_url === './scan.html' && man.every(m => m.scope === './' && m.display === 'standalone' && m.icons.length === 3 &&
    m.icons.every(i => fs.existsSync(path.join(APP, i.src)))) && man.every(m => m.icons.some(i => i.purpose === 'maskable')), 'manifests: PC and phone start pages, icons exist, one maskable', man.map(m => m.start_url));
  ok(['sw.js', 'manifest.webmanifest', 'scan.webmanifest', 'assets/icons/icon-512.png', 'assets/js/02g-pwa.js', 'assets/js/02h-timing.js'].every(f => fs.existsSync(path.join(dep, f))) &&
    /application\/manifest\+json \.webmanifest/.test(fs.readFileSync(path.join(dep, '.htaccess'), 'utf8')), 'build_deploy copies sw.js, manifests, icons; .htaccess types .webmanifest');
  ok(!/api\.php|server-php/.test(swSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'sw.js code (comments aside) never names the API');

  const b = await chromium.launch();
  try {
    // ---- file:// : no service worker, no manifest, no console noise ----
    const ctx = await b.newContext({viewport:{width:1366, height:768}});
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    p.on('dialog', d => d.accept());
    await p.goto(fileUrl('index.html')); await p.waitForTimeout(1300);
    await p.evaluate(() => { const m = document.querySelector('.modal-f [data-a="modal-btn"]'); if (m) m.click(); });
    const F = await p.evaluate(() => ({v:APP_VERSION, allowed:dmPwaAllowed(), man:!!document.querySelector('link[rel="manifest"]'),
      https:dmPwaAllowed({protocol:'https:', hostname:'docmap.example.it'}), lan:dmPwaAllowed({protocol:'http:', hostname:'192.168.1.20'}), lh:dmPwaAllowed({protocol:'http:', hostname:'127.0.0.1'}),
      phone:[dmPwaIsPhonePage('/studio-de/scan.html'), dmPwaIsPhonePage('/studio-de/q/dm26AbCdEfGh'), dmPwaIsPhonePage('/studio-de/index.html'), dmPwaIsPhonePage('/studio-de/')]}));
    ok(F.v === APP_V && F.allowed === false && !F.man, 'file://: no service worker, no manifest link', F);
    ok(F.https === true && F.lan === false && F.lh === true && F.phone.join() === 'true,true,false,false', 'PWA only on https (or localhost); phone manifest on scan.html and /q/<code>', F);

    // ---- stopwatch model ----
    const M = await p.evaluate(() => {
      dmtReset(); const r = {};
      r.rej = [dmtAdd('x', 100), dmtAdd('find', 0), dmtAdd('find', DMT_PAUSE_MS + 1)];
      for (let i = 1; i <= 10; i++) dmtAdd('find', i * 1000, 'test');
      r.st = dmtStats('find'); r.none = dmtStats('catalog');
      r.txt = dmtSummaryText(); r.line = dmtLine(r.st);
      for (let i = 0; i < DMT_MAX + 5; i++) dmtAdd('catalog', 3000);
      r.cap = dmtLoad().length; r.keys = Object.keys(dmtLoad()[0]).sort().join();
      dmtReset(); r.after = dmtLoad().length;
      return r;
    });
    ok(M.rej.join() === 'false,false,false' && M.st.n === 10 && M.st.median === 5000 && M.st.p90 === 9000 && M.st.best === 1000 && M.none.n === 0, 'stopwatch: pauses and junk rejected, median / 9 in 10 (nearest rank)', M);
    ok(/Trovare un faldone: 10 misure · mediana 5,0 s · 9 su 10 entro 9,0 s · obiettivo 15,0 s/.test(M.txt) && /Catalogare un faldone \(inventario\): nessuna misura/.test(M.txt), 'stopwatch: plain summary text in Italian', M.txt);
    ok(M.cap === 300 && M.keys === 'at,dev,k,ms,via' && M.after === 0, 'stopwatch: last 300 samples kept, durations only, reset empties', M);

    // ---- PC: search → open the binder = one «find» sample; an emptied box cancels ----
    await p.evaluate(() => { S.view = 'archive'; renderAll(); });
    const box = p.locator('.card .toolbar input[data-bind="q"]').first();
    await box.fill('es'); await p.waitForTimeout(250);
    await box.fill(''); await p.waitForTimeout(150);
    const cancelled = await p.evaluate(() => !dmtRunning('find'));
    await box.fill('es'); await p.waitForTimeout(400);
    const P = await p.evaluate(() => { const id = (filteredBinders()[0] || S.binders[0]).id; openEditor(id); const s = dmtLoad(); closeModal(); return {s, run:dmtRunning('find')}; });
    ok(cancelled && P.s.length === 1 && P.s[0].k === 'find' && P.s[0].via === 'pc-editor' && P.s[0].ms >= 300 && !P.run, 'PC: search then open the binder = one sample; an emptied box cancels', P);
    const N = await p.evaluate(() => { openEditor(null); const n = dmtLoad().length; closeModal(); return n; });
    ok(N === 1, 'PC: «Nuovo faldone» is not a search result', N);
    // ---- PC: Informazioni su DocMap shows and copies the times ----
    const A = await p.evaluate(() => { hxAboutOpen(); const el = document.querySelector('#hx-about-body #dmt'); const r = {block:!!el, find:(document.getElementById('dmt-find') || {}).textContent || '', sup:hxSupportText()}; return r; });
    ok(A.block && /1 misure|1 misura/.test(A.find) && /Tempi misurati \(PC\)/.test(A.sup) && /Trovare un faldone/.test(A.sup), 'PC: Informazioni su DocMap shows the times; support text includes them', A);
    await p.click('#dmt-reset'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => dmtLoad().length === 0 && /nessuna misura/.test(document.getElementById('dmt-find').textContent)), 'PC: «Azzera» empties the times');
    await p.evaluate(() => closeModal());
    ok(errs.length === 0, 'file:// PC: no console errors', errs);

    // ---- phone page from file:// : «Tempi misurati» under the code box ----
    const q = await ctx.newPage(); const qerrs = [];
    q.on('pageerror', e => qerrs.push('PAGEERR ' + e.message)); q.on('console', m => { if (m.type() === 'error') qerrs.push('CONSOLE ' + m.text()); });
    await q.goto(fileUrl('scan.html')); await q.waitForTimeout(800);
    const Q = await q.evaluate(() => ({html:scFindHTML(), man:!!document.querySelector('link[rel="manifest"]')}));
    ok(/class="sc-dmt"/.test(Q.html) && /Tempi misurati/.test(Q.html) && !Q.man, 'phone: «Tempi misurati» under the code box; no manifest from file://', Q.man);
    ok(qerrs.length === 0, 'file:// phone: no console errors', qerrs);
    await ctx.close();

    // ---- web deploy: install, cache, offline, update ----
    const wctx = await b.newContext({viewport:{width:390, height:844}, isMobile:true, hasTouch:true});
    const w = await wctx.newPage(); const werrs = [];
    w.on('pageerror', e => werrs.push('PAGEERR ' + e.message)); w.on('console', m => { if (m.type() === 'error') werrs.push('CONSOLE ' + m.text()); });
    await w.goto(O + 'index.html'); await w.waitForTimeout(500);
    const reg = await w.evaluate(async () => { const r = await navigator.serviceWorker.ready; return {scope:r.scope, man:(document.querySelector('link[rel="manifest"]') || {}).href || '', apple:!!document.querySelector('link[rel="apple-touch-icon"]')}; });
    ok(reg.scope === O && /\/studio-de\/manifest\.webmanifest$/.test(reg.man) && reg.apple, 'web: service worker active on the app folder; PC manifest + home-screen icon linked', reg);
    await w.reload(); await w.waitForTimeout(600);
    const C = await w.evaluate(async () => {
      const keys = await caches.keys(), c = await caches.open(keys.find(k => k.startsWith('docmap-shell-'))), reqs = (await c.keys()).map(r => new URL(r.url).pathname);
      return {keys, controlled:!!navigator.serviceWorker.controller, reqs};
    });
    const need = ['index.html', 'scan.html', 'docmap.config.js', 'manifest.webmanifest', 'scan.webmanifest', 'assets/js/02-core.js', 'assets/js/11-scan.js', 'assets/css-scan.css', 'vendor/sql-wasm.js', 'assets/icons/icon-512.png', 'assets/icons/icon-maskable-512.png', 'assets/fonts/inter-latin-wght-normal.woff2'];
    ok(C.controlled && C.keys.join() === 'docmap-shell-' + APP_V && need.every(f => C.reqs.includes('/studio-de/' + f)), 'web: page controlled; program files, styles, fonts and icons precached', need.filter(f => !C.reqs.includes('/studio-de/' + f)));
    ok(!C.reqs.some(u => /server-php|api\.php|\/q\//.test(u)), 'web: nothing from the API or the QR route in the cache', C.reqs.filter(u => /server-php|api|\/q\//.test(u)));
    const Ph = await w.evaluate(async (o) => { const m = await (await fetch(o + 'scan.webmanifest')).json(); const r = await fetch(o + m.icons[1].src); return {start:m.start_url, icon:r.status, type:r.headers.get('content-type')}; }, O);
    ok(Ph.start === './scan.html' && Ph.icon === 200 && /image\/png/.test(Ph.type), 'web: phone manifest and icons served', Ph);
    ok(werrs.length === 0, 'web online: no console errors', werrs);

    // offline: the app still opens, also from a QR route; data requests are not answered from the cache
    await wctx.setOffline(true);
    await w.reload(); await w.waitForTimeout(800);
    const Off1 = await w.evaluate(() => ({app:typeof APP_VERSION !== 'undefined' && APP_VERSION, title:document.title}));
    ok(Off1.app === APP_V && /DocMap/.test(Off1.title), 'offline: index.html opens from the cache', Off1);
    await w.goto(O + 'q/dm26AbCdEfGh'); await w.waitForTimeout(800);
    const Off2 = await w.evaluate(async () => ({scan:typeof scBoot === 'function', man:(document.querySelector('link[rel="manifest"]') || {}).getAttribute ? document.querySelector('link[rel="manifest"]').getAttribute('href') : '',
      api:await fetch('server-php/api.php?r=ping').then(() => 'answered', () => 'failed')}));
    ok(Off2.scan && Off2.man === 'scan.webmanifest' && Off2.api === 'failed', 'offline: a QR link opens the phone page; the API is never faked from the cache', Off2);
    await wctx.setOffline(false);

    // update: a new file on the server shows at the next load (network-first, no stale program)
    fs.appendFileSync(path.join(dep, 'docmap.config.js'), '\nwindow.__v129 = 1;\n');
    await w.goto(O + 'index.html'); await w.waitForTimeout(600);
    ok(await w.evaluate(() => window.__v129 === 1), 'online: the server copy wins over the cache (update shows at once)');
    await wctx.close();
  } finally {
    await b.close(); php.kill();
  }
  console.log((fails ? 'FAIL' : 'OK') + ' v12.9: ' + passes + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
