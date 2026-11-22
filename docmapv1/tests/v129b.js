// DocMap v12.9 (26.12.9) wave 1 "qualità percepita" checks (~30 s): design tokens (css-tokens.css), dark theme
// (system or forced, screen only: printing stays light), the theme switch (02i-theme.js) on PC and phone,
// and «Cerca ovunque» Ctrl+K (04d-palette.js).
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node v129b.js
const {chromium} = require('playwright');
const path = require('path'), fs = require('fs');
const APP = path.resolve(__dirname, '..');
const fileUrl = f => 'file://' + path.join(APP, f).replace(/\\/g, '/');
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) passes++; else { fails++; console.log('  ✗ FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } };
(async () => {
  // ---- files: tokens loaded first, no stray light hex outside tokens / paper / print ----
  const idx = fs.readFileSync(path.join(APP, 'index.html'), 'utf8'), scan = fs.readFileSync(path.join(APP, 'scan.html'), 'utf8');
  const firstCss = h => (h.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/) || [])[1];
  ok(firstCss(idx) === 'assets/css-tokens.css' && firstCss(scan) === 'assets/css-tokens.css', 'css-tokens.css is the first stylesheet on PC and phone', [firstCss(idx), firstCss(scan)]);
  ok([idx, scan].every(h => h.indexOf('docmap_theme') > 0 && h.indexOf('docmap_theme') < h.indexOf('css-tokens.css')), 'saved theme applied in <head> before the first stylesheet (no flash)');
  ok(/04d-palette\.js/.test(idx) && !/04d-palette\.js/.test(scan) && [idx, scan].every(h => /02i-theme\.js/.test(h)), 'palette on PC only, theme script on both');
  const tok = fs.readFileSync(path.join(APP, 'assets/css-tokens.css'), 'utf8');
  ok(/@media screen and \(prefers-color-scheme:dark\)\{\s*:root:not\(\[data-theme="light"\]\)/.test(tok) && /@media screen\{\s*:root\[data-theme="dark"\]/.test(tok), 'dark tokens: system or forced, screen only');

  const b = await chromium.launch();
  const open = async (file, opts) => {
    const ctx = await b.newContext(Object.assign({viewport:{width:1366, height:800}}, opts || {}));
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') p.errs.push('CONSOLE ' + m.text()); });
    p.on('dialog', d => d.accept());
    await p.goto(fileUrl(file)); await p.waitForTimeout(1300);
    await p.evaluate(() => { const m = document.querySelector('.modal-f [data-a="modal-btn"]'); if (m) m.click(); });
    await p.waitForTimeout(200); return p;
  };
  const bg = (p) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  try {
    // ---- light (default) ----
    const L = await open('index.html');
    ok(await bg(L) === 'rgb(248, 250, 252)', 'light: page background from --bg', await bg(L));
    // ---- system dark ----
    const D = await open('index.html', {colorScheme:'dark'});
    const dk = await D.evaluate(() => ({bg:getComputedStyle(document.body).backgroundColor, text:getComputedStyle(document.body).color, top:getComputedStyle(document.querySelector('.topbar')).backgroundColor}));
    ok(dk.bg === 'rgb(11, 17, 32)' && dk.text === 'rgb(241, 245, 249)', 'system dark: dark background, light text', dk);
    await D.emulateMedia({media:'print'});
    const pr = await bg(D);
    ok(pr === 'rgb(248, 250, 252)' || pr === 'rgba(0, 0, 0, 0)' || pr === 'rgb(255, 255, 255)', 'printing stays light even with a dark system', pr);
    await D.emulateMedia({media:'screen'});
    // forced light wins over a dark system
    await D.evaluate(() => dmThemeSet('light')); await D.waitForTimeout(100);
    ok(await bg(D) === 'rgb(248, 250, 252)' && await D.evaluate(() => localStorage.getItem('docmap_theme')) === 'light', 'forced light wins over the dark system and is remembered');
    await D.evaluate(() => dmThemeSet('')); await D.waitForTimeout(100);
    ok(await bg(D) === 'rgb(11, 17, 32)' && await D.evaluate(() => !document.documentElement.hasAttribute('data-theme') && localStorage.getItem('docmap_theme') === null), 'automatic: back to the system');
    ok(!D.errs.length, 'no console errors (dark)', D.errs);

    // ---- theme switch in Impostazioni, survives reload ----
    await L.evaluate(() => { S.view = 'settings'; renderAll(); }); await L.waitForTimeout(200);
    ok(await L.locator('#se-theme [data-dm-theme]').count() === 3, 'Impostazioni › Aspetto: three choices', await L.locator('#se-theme [data-dm-theme]').count());
    await L.click('#se-theme [data-dm-theme="dark"]'); await L.waitForTimeout(150);
    ok(await bg(L) === 'rgb(11, 17, 32)', 'click «Scuro» turns the PC dark', await bg(L));
    await L.reload(); await L.waitForTimeout(1200);
    ok(await L.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark' && await bg(L) === 'rgb(11, 17, 32)', 'dark kept after reload');
    // labels (paper) keep a white background in dark mode
    await L.evaluate(() => { const m = document.querySelector('.modal-f [data-a="modal-btn"]'); if (m) m.click(); S.view = 'print'; renderAll(); }); await L.waitForTimeout(500);
    const paper = await L.evaluate(() => { const s = document.querySelector('.sheet'); return s ? getComputedStyle(s).backgroundColor : 'none'; });
    ok(paper === 'rgb(255, 255, 255)', 'label sheet stays white in dark mode', paper);
    await L.evaluate(() => dmThemeSet(''));

    // ---- palette Ctrl+K ----
    await L.evaluate(() => { S.view = 'archive'; renderAll(); dmtReset(); }); await L.waitForTimeout(200);
    ok(await L.locator('.topbar [data-ck-open]').count() === 1, 'top bar has the 🔍 button');
    await L.keyboard.press('Control+k'); await L.waitForTimeout(200);
    const P0 = await L.evaluate(() => ({open:CK.open, focus:document.activeElement && document.activeElement.id, groups:[...document.querySelectorAll('.ck-g')].map(g => g.textContent)}));
    ok(P0.open && P0.focus === 'ck-q' && P0.groups.includes('Pagine') && P0.groups.includes('Azioni'), 'Ctrl+K opens with focus in the box, pages and actions listed', P0);
    await L.keyboard.press('Escape'); await L.waitForTimeout(100);
    ok(await L.evaluate(() => !CK.open && !document.getElementById('ck')), 'Esc closes');
    const code = await L.evaluate(() => S.binders[0].speaking_code);
    await L.click('.topbar [data-ck-open]'); await L.waitForTimeout(150);
    await L.keyboard.type(code); await L.waitForTimeout(200);
    const P1 = await L.evaluate(() => ({first:CK.items[0] && CK.items[0].g, label:CK.items[0] && CK.items[0].label}));
    ok(P1.first === 'binder' && P1.label.indexOf(code) === 0, 'typing a code: the binder comes first', P1);
    await L.keyboard.press('Enter'); await L.waitForTimeout(300);
    const P2 = await L.evaluate(() => ({ed:!!(UI.ed && UI.ed.d), code:UI.ed && UI.ed.d.speaking_code, n:dmtLoad().filter(x => x.k === 'find').length}));
    ok(P2.ed && P2.code === code && P2.n === 1, 'Enter opens the binder and records one «find» time', P2);
    await L.keyboard.press('Escape'); await L.waitForTimeout(200);
    await L.keyboard.press('Control+k'); await L.waitForTimeout(100); await L.keyboard.type('zzqqxx nessuno'); await L.waitForTimeout(150);
    ok(await L.locator('.ck-none').count() === 1, 'no result: a plain message');
    await L.keyboard.press('Escape');
    await L.keyboard.press('Control+k'); await L.waitForTimeout(100); await L.keyboard.type('stampa etich'); await L.waitForTimeout(150);
    await L.keyboard.press('Enter'); await L.waitForTimeout(300);
    ok(await L.evaluate(() => S.view) === 'print', 'a page can be opened from the palette', await L.evaluate(() => S.view));
    ok(!L.errs.length, 'no console errors (PC)', L.errs);

    // ---- phone ----
    const Ph = await open('scan.html', {viewport:{width:390, height:844}, colorScheme:'dark'});
    const ph = await Ph.evaluate(() => ({bg:getComputedStyle(document.body).backgroundColor, sw:(scFindHTML().match(/data-dm-theme=/g) || []).length, ck:typeof ckOpen}));
    ok(ph.bg !== 'rgb(255, 255, 255)' && ph.sw === 3 && ph.ck === 'undefined', 'phone: dark from the system, theme switch present, no palette', ph);
    ok(!Ph.errs.length, 'no console errors (phone)', Ph.errs);
  } finally { await b.close(); }
  console.log((fails ? '✗' : 'OK') + ' v12.9 ondata 1 (tema, colori, Ctrl+K): ' + passes + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
