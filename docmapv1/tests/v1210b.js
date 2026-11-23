// DocMap v12.10 checks: «Faldone smarrito» (lost-item QR). PC settings + live preview + shared settings subset,
// phone page signed out: local mode (this browser), web mode (public route `finder`, mocked), docmap.config.js fallback.
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node v1210b.js
const {chromium} = require('playwright');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const fileUrl = f => 'file://' + path.join(APP, f).replace(/\\/g, '/');
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) passes++; else { fails++; console.log('  ✗ FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 700) : ''); } };
(async () => {
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({viewport:{width:1366, height:900}});
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await p.goto(fileUrl('index.html')); await p.waitForTimeout(1300);
    await p.evaluate(() => { const m = document.querySelector('.modal-f [data-a="modal-btn"]'); if (m) m.click(); });

    // ---- pure model ----
    const M = await p.evaluate(() => {
      const f = fdNorm({on:true, name:'  ', phone:' +39 02 1234 5678 ', email:'bad@', whatsapp:'+39 333 1112222', note:'Ciao'}, false, 'Studio X');
      const L = fdLinks(f, 'dm26K8m2P9xL'), h = Object.fromEntries(L.map(x => [x.k, x.href]));
      return {f, keys:L.map(x => x.k).join(), tel:h.call, wa:h.wa, sms:h.sms, off:fdNorm({on:false, phone:'1'}), empty:fdNorm({on:true, name:'x'}), implicit:!!fdNorm({phone:'1'}, true),
        code:[fdCode('dm26K8m2P9xL'), fdCode('<b>'), fdCode('a b')], xss:fdCardHTML(fdNorm({on:true, name:'<img src=x onerror=alert(1)>', phone:'1'}), '<x>').includes('<img')};
    });
    ok(M.f.name === 'Studio X' && M.f.email === '' && M.f.phone === '+39 02 1234 5678' && M.keys === 'call,wa,sms' && M.tel === 'tel:+390212345678' && /^https:\/\/wa\.me\/393331112222\?text=.*dm26K8m2P9xL/.test(M.wa) && /^sms:\+390212345678\?body=/.test(M.sms),
      'model: trimmed contact, studio name fallback, bad e-mail dropped, tel / WhatsApp / SMS links with the code', M);
    ok(M.off === null && M.empty === null && M.implicit && M.code.join('|') === 'dm26K8m2P9xL||' && !M.xss, 'model: off or no contact → nothing; config needs no switch; only plain codes; escaped HTML', M);

    // ---- PC settings ----
    await p.evaluate(() => { S.view = 'settings'; renderAll(); });
    ok(await p.locator('#fds-set').count() === 1 && !(await p.isChecked('#fds-on')), 'settings: «Faldone smarrito» card, off by default');
    await p.check('#fds-on'); await p.waitForTimeout(100);
    ok(await p.locator('#fds-need').count() === 1, 'settings: on without a contact asks for one');
    await p.fill('#fds-name', 'Studio Demo, segreteria'); await p.fill('#fds-phone', '+39 02 555 0101'); await p.fill('#fds-email', 'archivio@example.test'); await p.fill('#fds-note', 'Via Roma 1, 9-18'); await p.waitForTimeout(150);
    let P = await p.evaluate(() => ({f:S.settings.finder, at:S.settings.finderAt, prev:$('#fds-prev').textContent, btns:$$('#fds-prev .fd-btns a').map(a => a.className.match(/fd-(\w+)/)[1]).join(),
      sub:srvSettingsSubset(), pkg:syncBuildPackage ? !!syncBuildPackage().settingsSubset.finder : null, log:LOG.entries.some(e => e.action === 'settings.finder')}));
    ok(P.f.on === true && P.f.phone === '+39 02 555 0101' && /^\d{4}-/.test(P.at) && /Studio Demo/.test(P.prev) && /dm26K8m2P9xL/.test(P.prev) && P.btns === 'call,sms,mail' && P.log,
      'settings: saved while typing, live preview with the code and the buttons, switch logged', P);
    ok(P.sub.finder && P.sub.finder.email === 'archivio@example.test' && P.sub.finderAt === P.at && P.pkg === true, 'sync: the contact travels in the server settings subset and in the sync packages', P.sub);
    const A = await p.evaluate(() => {
      const keep = clone(S.settings.finder), at = S.settings.finderAt;
      locSyncApply({finder:{on:true, phone:'9', name:'Old'}, finderAt:'2000-01-01T00:00:00.000Z'}); const older = S.settings.finder.phone;
      locSyncApply({finder:{on:true, phone:'7', name:'New', evil:'x'}, finderAt:'2999-01-01T00:00:00.000Z'}); const newer = S.settings.finder;
      S.settings.finder = keep; S.settings.finderAt = at; persist();
      return {older, newer};
    });
    ok(A.older === '+39 02 555 0101' && A.newer.phone === '7' && !('evil' in A.newer), 'sync: newer contact wins, unknown keys dropped', A);
    ok(await p.evaluate(() => { helpEnsure(); HELP.q = 'faldone smarrito'; const r = helpList().map(x => x.id); HELP.q = ''; return r[0] === 'finder'; }), 'help: «faldone smarrito» finds the topic first');
    const code = await p.evaluate(() => S.binders[0].short_code), company = await p.evaluate(() => S.binders[0].company_name);

    // ---- phone, local mode, signed out (same browser: users exist → sign-in view) ----
    await p.evaluate(async () => { await dmProviders().auth.addUser({username:'fd1', display_name:'Fede', role:'viewer', secret:'135791'}); });
    const q = await ctx.newPage(); const qerrs = [];
    q.on('pageerror', e => qerrs.push('PAGEERR ' + e.message)); q.on('console', m => { if (m.type() === 'error') qerrs.push('CONSOLE ' + m.text()); });
    await q.setViewportSize({width:390, height:844});
    await q.goto(fileUrl('scan.html') + '?q=' + code); await q.waitForTimeout(900);
    let V = await q.evaluate((co) => ({view:SC.view, card:!!document.getElementById('fd-card'), text:document.body.textContent, form:!!document.getElementById('sc-enter'),
      first:document.querySelector('#app main').firstElementChild.id, focus:document.activeElement && document.activeElement.id, w:[document.documentElement.scrollWidth, innerWidth],
      hrefs:Array.from(document.querySelectorAll('#fd-card a')).map(a => a.getAttribute('href'))}), company);
    ok(V.view === 'login' && V.card && V.form && V.first === 'fd-card' && V.focus !== 'sc-user' && V.focus !== 'sc-pin' && V.w[0] <= V.w[1] + 1, 'phone signed out: contact card above the sign-in, no keyboard popping up, no h-scroll', V);
    ok(V.text.includes('Studio Demo') && V.text.includes(code) && !V.text.includes(company) && V.hrefs.some(h => h.startsWith('tel:+39025550101')) && V.hrefs.some(h => h.startsWith('mailto:archivio@example.test?subject=') && h.includes(code)),
      'phone signed out: contact and label code, never the client; call and e-mail with the code', V.hrefs);
    await q.fill('#sc-user', 'fd1'); await q.fill('#sc-pin', '135791'); await q.click('#sc-enter'); await q.waitForTimeout(1000);
    ok(await q.evaluate(() => SC.view === 'card' && !document.getElementById('fd-card')), 'phone: staff sign in below as always, the card goes away');
    await q.evaluate(async () => { await SC.P.auth.logout(); });
    await q.goto(fileUrl('scan.html')); await q.waitForTimeout(700);
    ok(await q.evaluate(() => !document.getElementById('fd-card')), 'phone: no code in the address → no card');
    await p.evaluate(() => { S.settings.finder.on = false; S.settings.finderAt = nowISO(); persist(); });
    await q.goto(fileUrl('scan.html') + '?q=' + code); await q.waitForTimeout(700);
    ok(await q.evaluate(() => !document.getElementById('fd-card') && SC.view === 'login'), 'phone: switched off → only the sign-in, as before');

    // ---- docmap.config.js fallback ----
    const c2 = await b.newContext({viewport:{width:390, height:844}});
    await c2.addInitScript(() => { window.DOCMAP_CONFIG = {finder:{name:'Archivio Centrale', whatsapp:'+39 333 0000000'}}; });
    const r = await c2.newPage(); const rerrs = []; r.on('pageerror', e => rerrs.push('PAGEERR ' + e.message));
    await r.goto(fileUrl('scan.html') + '?q=dm26AbCdEfGh'); await r.waitForTimeout(800);
    V = await r.evaluate(() => ({view:SC.view, card:!!document.getElementById('fd-card'), wa:(document.querySelector('#fd-card .fd-wa') || {}).href || '', text:document.body.textContent}));
    ok(V.card && /wa\.me\/393330000000\?text=.*dm26AbCdEfGh/.test(V.wa) && V.text.includes('Archivio Centrale'), 'config fallback: docmap.config.js finder block on a fresh phone (first set-up view)', V);
    await c2.close();

    // ---- web mode: public route `finder` (mocked server, no token sent) ----
    const c3 = await b.newContext({viewport:{width:390, height:844}});
    await c3.addInitScript(() => { window.DOCMAP_CONFIG = {mode:'web', apiBase:'http://127.0.0.1:9/studio/server-php/api.php', studioName:'Studio Web'}; });
    const seen = [];
    await c3.route('http://127.0.0.1:9/**', (rt) => {
      const u = new URL(rt.request().url()); seen.push({r:u.searchParams.get('r'), c:u.searchParams.get('c'), tok:rt.request().headers()['x-docmap-token'] || '', method:rt.request().method()});
      const body = u.searchParams.get('r') === 'finder' ? {ok:true, on:true, code:u.searchParams.get('c'), name:'Studio Web', phone:'+39 06 1', email:'', whatsapp:'', note:''} : {ok:true};
      rt.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(body)});
    });
    const w = await c3.newPage(); const werrs = []; w.on('pageerror', e => werrs.push('PAGEERR ' + e.message));
    await w.goto(fileUrl('scan.html') + '?q=dm26WebCode1'); await w.waitForTimeout(1200);
    V = await w.evaluate(() => ({view:SC.view, card:!!document.getElementById('fd-card'), text:(document.getElementById('fd-card') || {}).textContent || ''}));
    const fq = seen.filter(x => x.r === 'finder');
    ok(V.card && /Studio Web/.test(V.text) && /dm26WebCode1/.test(V.text) && fq.length === 1 && fq[0].c === 'dm26WebCode1' && !fq[0].tok && fq[0].method === 'GET', 'web mode: one GET to the public route, no token, card shown on the first set-up view', {V, seen});
    await c3.close();

    ok(errs.length === 0 && qerrs.length === 0 && rerrs.length === 0 && werrs.length === 0, 'no console errors', errs.concat(qerrs, rerrs, werrs));
  } catch(e){ console.error(e); fails++; }
  await b.close();
  console.log((fails ? '✗' : 'OK') + ' v12.10 faldone smarrito: ' + passes + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
})();
