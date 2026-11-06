// DocMap v12.6 (26.12.6) checks (~30 s): licence banner + messages and the sync status badge on the PC from file://,
// against a REAL server-php/api.php run by `php -S` with 'licence_required' => true (no licence installed → read-only).
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node v126.js       (needs php 8 with pdo_sqlite)
const {chromium} = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto'), {spawn} = require('child_process');
const APP = path.resolve(__dirname, '..');
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) passes++; else { fails++; console.log('  ✗ FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } };
(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'docmap-v126-'));
  const sp = path.join(work, 'root', 'studio-de', 'server-php'), data = path.join(work, 'data');
  fs.mkdirSync(sp, {recursive:true}); fs.mkdirSync(data);
  for (const f of ['api.php', '.htaccess']) fs.copyFileSync(path.join(APP, 'server-php', f), path.join(sp, f));
  const tok = 'v126-' + crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(path.join(sp, 'config.php'), "<?php\nif (!defined('DOCMAP_API')) { http_response_code(404); exit; }\nreturn ['data_dir' => " + JSON.stringify(data) +
    ", 'aes_key' => '" + crypto.randomBytes(32).toString('base64') + "', 'tokens' => [['user' => 'dave', 'role' => 'admin', 'token_sha256' => '" + crypto.createHash('sha256').update(tok).digest('hex') +
    "']], 'allowed_origins' => ['null'], 'licence_required' => true];\n");
  const port = 18000 + Math.floor(Math.random() * 900);
  const php = spawn('php', ['-S', '127.0.0.1:' + port, '-t', path.join(work, 'root'), path.join(__dirname, 'php-router.php')], {stdio:'ignore'});
  const api = 'http://127.0.0.1:' + port + '/studio-de/server-php/api.php';
  for (let i = 0; i < 50; i++){ try { const r = await fetch(api + '?r=ping'); if (r.ok) break; } catch(e){} await new Promise(r => setTimeout(r, 100)); }
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({viewport:{width:1366, height:768}});
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
    p.on('dialog', d => d.accept());
    await p.goto('file://' + path.join(APP, 'index.html')); await p.waitForTimeout(1200);
    await p.evaluate(() => { const m = document.querySelector('.modal-f [data-a="modal-btn"]'); if (m) m.click(); });
    ok(await p.evaluate(() => APP_VERSION === '26.12.6' && typeof licSet === 'function' && typeof sbLocalHTML === 'function'), 'v12.6 loaded');
    ok(await p.evaluate(() => !document.getElementById('lic-banner') && !document.getElementById('srv-status')), 'no banner and no server badge without a server');

    // banner states (unit level)
    const B = await p.evaluate(() => {
      const r = {};
      licSet({mode:'grace', writable:true, grace_days_left:12, message_it:'Licenza scaduta: restano 12 giorni di tolleranza'}); r.grace = (document.getElementById('lic-banner') || {}).textContent || '';
      r.graceBad = document.getElementById('lic-banner').classList.contains('lic-bad');
      licSet({mode:'full', writable:true, expiring_soon:false}); r.full = !document.getElementById('lic-banner');
      licSet({mode:'read_only', writable:false, message_it:'Licenza sospesa dal fornitore'}); r.ro = document.getElementById('lic-banner').classList.contains('lic-bad') && LIC.blocked;
      renderAll(); r.afterRender = !!document.getElementById('lic-banner');
      r.w = [document.documentElement.scrollWidth, innerWidth];
      S.lang = 'en'; licRender(); r.en = document.getElementById('lic-banner').textContent; S.lang = 'it'; licRender();
      licSet({mode:'full', writable:true}); return r;
    });
    ok(B.grace.includes('12 giorni') && !B.graceBad && B.full && B.ro && B.afterRender && B.w[0] <= B.w[1] + 1, 'banner: grace (amber), full (none), read-only (red), survives renderAll, no h-scroll', B);
    ok(/read-only/.test(B.en), 'banner in English', B.en);

    // real server: local mode "Sincronizza con il server" → licence missing → read-only, Italian message, badge "sola lettura"
    const R = await p.evaluate(async ({api, tok}) => {
      localStorage.setItem('docmap_v26_srv', JSON.stringify({url:api, token:tok})); renderTopbar();
      const r = {badge0:(document.getElementById('srv-status') || {}).textContent || '', local:!!document.querySelector('#srv-status.srv-local')};
      const res = await srvSync();
      r.res = res; r.state = SRV.state; r.err = SRV.err; r.blocked = LIC.blocked; r.mode = LIC.s && LIC.s.mode;
      r.banner = (document.getElementById('lic-banner') || {}).textContent || '';
      r.badge = (document.getElementById('srv-status') || {}).textContent || '';
      try { await new DMServer(api, tok, {simple:true}).call('push', {method:'POST', body:{records:[]}}); r.thrown = false; } catch(e){ r.thrown = true; r.msg = e.message; r.txt = srvErrText(e); r.fix = srvErrFix(e); }
      const pulled = await new DMServer(api, tok, {simple:true}).call('pull'); r.pullOk = !!pulled && Array.isArray(pulled.records);
      return r;
    }, {api, tok});
    ok(R.local && /mai|da inviare/.test(R.badge0), 'PC from file:// with a server: badge in the top bar before the first sync', R.badge0);
    ok(R.res && R.res.error && R.state === 'ro' && R.blocked && R.mode === 'invalid', 'sync with a read-only licence: state "ro", not "Accesso negato"', R);
    ok(/sola lettura/i.test(R.badge) && /Nessuna licenza installata/.test(R.banner), 'badge "Online · sola lettura" + banner with the server sentence', {b:R.badge, ban:R.banner});
    ok(R.thrown && /Nessuna licenza installata/.test(R.msg) && R.txt === R.msg && R.fix === '' && /Nessuna licenza/.test(R.err), 'error message = server message_it, no "fix the token" hint', R);
    ok(R.pullOk, 'reading (pull) still works in read-only');
    ok(errs.length === 0, 'no JS errors', errs);

    // badge: "sincronizzato N min fa" (unit level)
    const A = await p.evaluate(() => [sbAgo(new Date(Date.now() - 30e3).toISOString()), sbAgo(new Date(Date.now() - 5 * 60e3).toISOString()), sbAgo(new Date(Date.now() - 3 * 3600e3).toISOString()), sbAgo(new Date(Date.now() - 4 * 86400e3).toISOString())]);
    ok(A[0] === 'sincronizzato ora' && A[1] === 'sincronizzato 5 min fa' && A[2] === 'sincronizzato 3 h fa' && A[3] === 'sincronizzato 4 g fa', 'relative times', A);

    // "Primi passi" card in the Archivio
    const F = await p.evaluate(async () => {
      S.view = 'archive'; renderAll();
      const r = {card:!!document.getElementById('fs-card'), count0:document.getElementById('fs-count').textContent, ok0:document.querySelectorAll('.fs-step.fs-ok').length};
      S.settings.studioName = 'Studio Rossi'; S.clients.push(normalizeClient({id:'c-fs', name:'Cliente FS'})); S.lastExportAt = nowISO(); renderView();
      r.ok1 = [...document.querySelectorAll('.fs-step.fs-ok')].map(e => e.dataset.fs);
      document.querySelector('[data-a="fs-go"][data-id="create"], [data-a="fs-go"][data-id="binder"]').click(); await new Promise(r => setTimeout(r, 300));
      r.guide = typeof G === 'object' && G.id; if (typeof guideStop === 'function') guideStop(); else if (typeof guideEnd === 'function') guideEnd();
      r.w = [document.documentElement.scrollWidth, innerWidth];
      document.querySelector('[data-a="fs-hide"]').click(); await new Promise(r => setTimeout(r, 100));
      r.hidden = !document.getElementById('fs-card') && S.settings.firstStepsHidden === true;
      S.settings.firstStepsHidden = false; renderView(); r.back = !!document.getElementById('fs-card');
      r.mem = Object.keys(S.settings.firstSteps || {}).sort();
      return r;
    });
    ok(F.card && /0 di 6|1 di 6/.test(F.count0), 'Primi passi card on the first run', F);
    ok(['backup', 'clients', 'studio'].every(x => F.ok1.includes(x)) && F.mem.includes('studio') && F.mem.includes('backup'), 'steps detected from the data and remembered', F);
    ok(F.guide === 'create', '"Guidami" starts the guided tour', F.guide);
    ok(F.hidden && F.back && F.w[0] <= F.w[1] + 1, 'card hides / shows, no h-scroll', F);

    // phone page loads with the module
    const q = await ctx.newPage(); const qe = [];
    q.on('pageerror', e => qe.push(e.message));
    await q.goto('file://' + path.join(APP, 'scan.html')); await q.waitForTimeout(800);
    ok(qe.length === 0 && await q.evaluate(() => typeof licSet === 'function'), 'scan.html loads 06o-licence.js without errors', qe);
    await q.evaluate(() => licSet({mode:'read_only', writable:false, message_it:'Licenza revocata'}));
    ok(await q.evaluate(() => !!document.getElementById('lic-banner')), 'banner on the phone page');
  } finally { await b.close(); php.kill(); fs.rmSync(work, {recursive:true, force:true}); }
  console.log(`\nV12.6: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
