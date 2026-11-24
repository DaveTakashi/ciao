// v12.18 (26.12.18) checks (~20 s): the «Strumenti» page of the app (door to the recipes program in strumenti/).
// Pure helpers (link with the key, address that opens a view); ⚙ menu entry for administrators only, hidden and
// refused for a viewer; real Strumenti server started here: status «on» with its version, jobs waiting for review
// with the local key (CORS only on /api/ping and /api/summary), «Open the review» opens #k=…&v=lavori; server
// stopped: clear instructions; the key stays in localStorage only (not in the shared state).
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node v1218.js
'use strict';
const H = require('./lib/harness');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const {spawn} = require('child_process');

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

H.run('v12.18 Strumenti nell\'app', async (t) => {
  t.allowErrors(/ERR_CONNECTION_REFUSED|Failed to load resource|Failed to fetch/);    // the «server stopped» case
  const p = await t.page();
  t.ok(await p.evaluate(() => APP_VERSION === '26.12.18' && typeof viewStrumenti === 'function' && typeof strParseLink === 'function'), 'v12.18 loaded');

  /* ---------------- pure helpers ---------------- */
  const P = await p.evaluate(() => ({
    a: strParseLink('http://127.0.0.1:8091/#k=abc_DEF-1'),
    b: strParseLink('http://localhost:9000/qualcosa?x=1#ricette'),
    c: strParseLink(''), d: strParseLink('ftp://x/'), e: strParseLink('non un indirizzo'),
    f: strParseLink('https://srv.example:8443/#k=a%20b'),
    o1: strOpenUrl({base:'http://127.0.0.1:8091/', key:'k1'}, 'lavori'),
    o2: strOpenUrl({base:'http://127.0.0.1:8091/', key:''}, 'lavori'),
    o3: strOpenUrl({base:'http://127.0.0.1:8091/', key:'k1'}, 'x"y'),
  }));
  t.eq(P.a, {base:'http://127.0.0.1:8091/', key:'abc_DEF-1'}, 'link with the key: address and key');
  t.eq(P.b, {base:'http://localhost:9000/', key:''}, 'link without key: only the address (path and query dropped)');
  t.ok(P.c.base === 'http://127.0.0.1:8091/' && P.d === null && P.e === null, 'empty → default address; other protocols and junk refused', P);
  t.eq(P.f.key, '', 'a key with odd characters is not kept');
  t.ok(P.o1 === 'http://127.0.0.1:8091/#k=k1&v=lavori' && P.o2 === 'http://127.0.0.1:8091/#lavori' && P.o3 === 'http://127.0.0.1:8091/#k=k1', 'open address: key in the fragment, view only if plain', P);

  /* ---------------- menu: administrators only ---------------- */
  const menu = await p.evaluate(() => {
    const r = {};
    r.admin = !!document.querySelector('.nav-menu [data-v="strumenti"]');
    const o = window.w1Role; window.w1Role = () => 'viewer';
    renderTopbarSafe(); r.viewer = !!document.querySelector('.nav-menu [data-v="strumenti"]');
    S.view = 'strumenti'; renderView(); r.denied = !!document.getElementById('st2-denied') && !document.getElementById('st2-link');
    window.w1Role = o; renderTopbarSafe(); r.back = !!document.querySelector('.nav-menu [data-v="strumenti"]');
    r.cfg = NAV_MORE.find(x => x[0] === 'nm_tools')[1].filter(x => x[0] === 'strumenti').length;
    return r;
    function renderTopbarSafe(){ const tb = document.getElementById('topbar'); if (tb && typeof topbarHTML === 'function') tb.innerHTML = topbarHTML(); }
  });
  t.ok(menu.admin && !menu.viewer && menu.denied && menu.back && menu.cfg === 1, 'menu entry for administrators only; a viewer gets «riservato»; entry restored after drawing', menu);

  /* ---------------- server stopped ---------------- */
  const port = await freePort();
  await p.evaluate((port) => { localStorage.setItem('docmap_strumenti', JSON.stringify({base:'http://127.0.0.1:' + port + '/', key:''})); S.view = 'strumenti'; STR.state = 'idle'; renderView(); }, port);
  await p.waitForSelector('#st2-status[data-s="off"]', {timeout:8000});
  t.ok(/AVVIA-STRUMENTI\.bat/.test(await p.textContent('#st2-status')), 'server stopped: says how to start it');

  /* ---------------- real Strumenti server ---------------- */
  const dati = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-app-'));
  const inp = path.join(dati, 'in'); fs.mkdirSync(inp);
  fs.writeFileSync(path.join(inp, 'a.txt'), 'Fattura n. 1'); fs.writeFileSync(path.join(inp, 'b.txt'), 'Fattura n. 2');
  const srv = spawn('python3', ['-m', 'docmap_strumenti', '--dati', dati, 'serve', '--port', String(port)], {cwd:path.join(t.APP, 'strumenti'), stdio:'ignore'});
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++){ await sleep(250); try { up = (await fetch('http://127.0.0.1:' + port + '/api/ping')).ok; } catch (e) { /* not yet */ } }
    t.ok(up, 'Strumenti server started');
    const key = fs.readFileSync(path.join(dati, 'chiave-locale.txt'), 'utf8').trim();
    const rec = {name:'Prova verifica', input:{patterns:['*.txt'], recursive:false}, steps:[{block:'ocr', with:{engine:'text'}}, {block:'review', with:{which:'all'}}]};
    const r = await fetch('http://127.0.0.1:' + port + '/api/jobs', {method:'POST', headers:{'X-Key':key, 'Content-Type':'application/json'},
      body:JSON.stringify({recipe:rec, input_dir:inp, output_dir:path.join(dati, 'out'), name:'Prova verifica'})});
    t.ok(r.ok, 'job created', r.status);
    for (let i = 0; i < 40; i++){ await sleep(250); const s = await (await fetch('http://127.0.0.1:' + port + '/api/summary', {headers:{'X-Key':key}})).json(); if (s.waiting_review) break; }

    // without the key: status only
    await p.click('[data-a="st2-check"]');
    await p.waitForSelector('#st2-status[data-s="on"]', {timeout:8000});
    const txt0 = await p.textContent('#st2-status');
    t.ok(/versione 0\.\d/.test(txt0) && /chiave/.test(txt0) && !(await p.$('#st2-review')), 'running, without key: version and how to add the key', txt0);

    // paste the link with the key (as AVVIA-STRUMENTI.bat opens it)
    await p.fill('#st2-url', 'http://127.0.0.1:' + port + '/#k=' + key);
    await p.click('[data-a="st2-save"]');
    await p.waitForSelector('#st2-review', {timeout:8000});
    const txt = await p.textContent('#st2-status');
    t.ok(/1 lavori aspettano una verifica \(2 documenti/.test(txt) && /Prova verifica/.test(txt) && /da verificare/.test(txt), 'with the key: jobs waiting for review and latest jobs', txt);
    const store = await p.evaluate(() => ({ls:JSON.parse(localStorage.getItem('docmap_strumenti')), state:JSON.stringify(S).includes('docmap_strumenti') || /#k=|"key"/.test(JSON.stringify(S.settings || {})), field:document.getElementById('st2-url').value}));
    t.ok(store.ls.key === key && !store.state && !store.field.includes(key), 'the key stays in localStorage on this PC only (not in the state, not shown)', {state:store.state, field:store.field});

    // «Open the review» → Strumenti page on the jobs view, signed in with the key
    await p.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
    await p.click('[data-a="st2-open"][data-v="lavori"]');
    const opened = await p.evaluate(() => window.__opened);
    t.eq(opened, ['http://127.0.0.1:' + port + '/#k=' + encodeURIComponent(key) + '&v=lavori'], 'open the review: address with the key and the jobs view');
    const p2 = await (await t.browser.newContext()).newPage();
    await p2.goto(opened[0]); await p2.waitForTimeout(1200);
    t.ok(/#lavori$/.test(p2.url()) && !p2.url().includes(key), 'the Strumenti page opens on «Lavori» and removes the key from the address bar', p2.url());

    // saving the address alone keeps the key; «forget» removes it
    await p.click('[data-a="st2-save"]');
    t.eq(await p.evaluate(() => JSON.parse(localStorage.getItem('docmap_strumenti')).key.length > 10), true, 'saving the address again keeps the key');
    await p.click('[data-a="st2-forget"]');
    t.eq(await p.evaluate(() => JSON.parse(localStorage.getItem('docmap_strumenti')).key), '', 'forget the key');

    // help topic and no horizontal scroll on a phone width
    t.ok(await p.evaluate(() => HELP_TOPICS.some(x => x.id === 'strumenti')), 'help topic «strumenti»');
    await p.setViewportSize({width:390, height:800}); await p.waitForTimeout(200);
    t.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll at 390 px');
  } finally {
    srv.kill();
    try { fs.rmSync(dati, {recursive:true, force:true}); } catch (e) { /* temp */ }
  }
});
