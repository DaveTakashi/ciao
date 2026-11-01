// DocMap full regression suite — run: node suite.js
const {chromium} = require('playwright');
const fs = require('fs'), {PNG} = require('pngjs'), jsQR = require('jsqr');
const URL_ = 'file://' + require('path').resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
fs.mkdirSync('shots', {recursive:true});
let fails = 0, passes = 0;
const ok = (cond, name, extra) => { if (cond){ passes++; } else { fails++; console.log('  ✗ FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } };
const sec = (n) => console.log('\n== ' + n);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:1366, height:768}, acceptDownloads:true});
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto(URL_); await p.waitForTimeout(1500);

  sec('boot');
  ok(await p.isVisible('.ob-card'), 'onboarding shown on first run');
  await p.click('.modal-f [data-a="modal-btn"]');
  ok(await p.evaluate(() => S.onboarded === true), 'onboarding flag saved');
  await p.evaluate(() => document.fonts.ready);
  ok(await p.evaluate(() => document.fonts.check('700 16px "DM Inter"') && document.fonts.check('800 16px "DM Mono"') && [...document.fonts].some(f => f.family.includes('DM Inter') && f.status === 'loaded')), 'bundled fonts load from file://');
  ok(await p.evaluate(() => DB.ready && !DB.error), 'SQLite ready', await p.evaluate(() => DB.error));
  ok(await p.evaluate(() => S.settings.destTemplate === 'https://docmap.pr-it.it/studio-de/q/{short_code}'), 'default destination on docmap.pr-it.it/studio-de/q/ (v10)');
  ok(await p.evaluate(() => S.binders.length === 5 && new Set(S.binders.map(b => b.short_code)).size === 5 && S.binders.every(b => /^dm26[A-HJ-NP-Za-km-np-z2-9]{8}$/.test(b.short_code))), 'demo data + unambiguous dm26 codes');

  sec('views at 1366x768 (no horizontal scroll)');
  for (const v of ['archive','print','info','import','export','ai','database','settings']){
    await p.evaluate(v => { S.view = v; renderAll(); }, v); await p.waitForTimeout(250);
    const w = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    ok(w[0] <= w[1] + 1, 'no h-scroll in ' + v, w);
    await p.screenshot({path:'shots/s_' + v + '.png'});
  }
  await p.evaluate(() => { S.lang = 'en'; renderAll(); });
  ok((await p.innerText('.nav')).includes('Print Labels'), 'English UI');
  await p.evaluate(() => { S.lang = 'it'; renderAll(); });

  sec('print engine: every preset × mode × QR mode');
  const presets = await p.evaluate(() => BUILTIN_PRESETS.map(x => x.id));
  for (const pr of presets) for (const m of ['pair','a','b','u','split']) for (const q of ['live','placeholder','none']){
    const r = await p.evaluate(([pr, m, q]) => {
      const P = BUILTIN_PRESETS.find(x => x.id === pr); S.print.presetId = pr; S.print.geometry = geoFromPreset(P); S.print.contentMode = m; S.print.qrMode = q; S.usedSlots = {};
      const L = layoutLabels(); const sheets = buildLabelSheets(false);
      const N = P.cols * P.rows, per = m === 'pair' ? 2 : 1;
      const right = P.marginLeft + P.cols * P.w + (P.cols - 1) * P.gapX, bottom = P.marginTop + P.rows * P.h + (P.rows - 1) * P.gapY;
      return {items:L.items, pages:L.pages.length, sheets:sheets.length, expect:Math.ceil(5 * per / N), fits: right <= 210.01 && bottom <= 297.01, nan: sheets.join('').includes('NaN')};
    }, [pr, m, q]);
    ok(r.pages === r.expect && r.sheets === r.expect && r.fits && !r.nan, `layout ${pr}/${m}/${q}`, r);
  }
  // partial sheet
  const ps = await p.evaluate(() => { S.print.presetId = 'l7160'; S.print.geometry = geoFromPreset(findPreset('l7160')); S.print.contentMode = 'pair'; S.usedSlots = {l7160:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]}; const L = layoutLabels(); const r = {pages:L.pages.length, first:L.pages[0][0].s}; S.usedSlots = {l7160:[0,1,2]}; const L2 = layoutLabels(); r.first2 = L2.pages[0][0].s; S.usedSlots = {}; return r; });
  ok(ps.pages === 1 && ps.first === 0 && ps.first2 === 3, 'partial sheet: full-used first sheet skipped, start after used', ps);

  sec('QR decode on printed PDFs (every slot, A4 300 dpi)');
  for (const pr of presets){
    for (const m of ['a','u','split']){
      const info = await p.evaluate(([pr, m]) => {
        const P = BUILTIN_PRESETS.find(x => x.id === pr); S.print.presetId = pr; S.print.geometry = geoFromPreset(P); S.print.contentMode = m; S.print.qrMode = 'live'; S.print.offsetX = 0; S.print.offsetY = 0;
        document.getElementById('page-style').textContent = '@page{size:210mm 297mm;margin:0mm}';
        document.getElementById('print-root').innerHTML = buildLabelSheets(false)[0];
        const L = layoutLabels();
        return {slots:L.pages[0].map(x => Object.assign(slotRect(x.s), {url:x.item.b.short_url})), w:P.w, h:P.h};
      }, [pr, m]);
      await p.emulateMedia({media:'print'});
      const pdf = await p.pdf({width:'210mm', height:'297mm', printBackground:true, preferCSSPageSize:true});
      await p.emulateMedia({media:'screen'});
      fs.writeFileSync('shots/q.pdf', pdf);
      require('child_process').execSync('python3 -c "import pypdfium2 as p;d=p.PdfDocument(\'shots/q.pdf\');d[0].render(scale=300/72).to_pil().convert(\'RGBA\').save(\'shots/q.png\')"');
      const png = PNG.sync.read(fs.readFileSync('shots/q.png')), k = png.width / 210;
      let good = 0;
      for (const s of info.slots){
        const x0 = Math.floor(s.x * k), y0 = Math.floor(s.y * k), w = Math.floor(info.w * k), h = Math.floor(info.h * k);
        const d = new Uint8ClampedArray(w * h * 4);
        for (let j = 0; j < h; j++){ const st = ((y0 + j) * png.width + x0) * 4; d.set(png.data.subarray(st, st + w * 4), j * w * 4); }
        let r = jsQR(d, w, h);
        // jsQR's binariser can miss very large modules (QR > 40 mm at 300 dpi); a phone camera sees them smaller, so retry at 1/2 and 1/4 scale.
        for (const f of [2, 4]){ if (r && r.data === s.url) break; const W = Math.floor(w / f), H = Math.floor(h / f), e = new Uint8ClampedArray(W * H * 4);
          for (let j = 0; j < H; j++) for (let i = 0; i < W; i++){ const a = ((j * f) * w + i * f) * 4, b = (j * W + i) * 4; e[b] = d[a]; e[b+1] = d[a+1]; e[b+2] = d[a+2]; e[b+3] = 255; }
          r = jsQR(e, W, H); }
        if (r && r.data === s.url) good++;
      }
      ok(good === info.slots.length, `QR decode ${pr}/${m}: ${good}/${info.slots.length}`);
    }
  }
  await p.evaluate(() => { document.getElementById('print-root').innerHTML = ''; S.print.presetId = 'l7160'; S.print.geometry = geoFromPreset(findPreset('l7160')); S.print.contentMode = 'pair'; savePrefs(); });

  sec('calibration + register + quality box');
  const cal = await p.evaluate(() => { S.print.offsetX = 1.5; const h = buildCalibSheet(); S.print.offsetX = 0; return {slots:(h.match(/Slot #/g) || []).length, x:h.includes('X: 8.7mm'), nan:h.includes('NaN')}; });
  ok(cal.slots === 21 && cal.x && !cal.nan, 'calibration sheet has 21 slots and offset in coordinates', cal);
  ok(await p.evaluate(() => { const h = buildRegisterHTML(sortedBinders()); return (h.match(/<svg/g) || []).length === S.binders.length; }), 'register has one QR per binder');
  await p.evaluate(() => { S.view = 'print'; S.print.advanced = true; renderAll(); }); await p.waitForTimeout(300);
  ok((await p.innerText('#pr-quality')).includes('QR'), 'quality box rendered', await p.innerText('#pr-quality'));
  await p.click('[data-a="geo-fill"]'); await p.waitForTimeout(150);
  const fill = await p.evaluate(() => { const g = S.print.geometry; return [g.marginLeft, g.marginTop, g.marginLeft + g.cols * g.w + (g.cols - 1) * g.gapX, g.marginTop + g.rows * g.h + (g.rows - 1) * g.gapY]; });
  ok(fill[0] >= 5 && fill[1] >= 5 && fill[2] <= 205.01 && fill[3] <= 292.01, 'Fill A4 keeps 5 mm safe margin', fill);
  await p.click('[data-a="geo-reset"]');

  sec('import variants');
  const imp = async (text) => p.evaluate((text) => { analyzeImport(text); const IP = UI.importParsed; return IP.error ? {error:IP.error} : {n:IP.rows.length, ok:IP.rows.filter(r => r.status !== 'err').length, rows:IP.rows.map(r => ({s:r.status, p:r.p, w:r.w}))}; }, text);
  let r = await imp('speaking_code,company_name,binder_title,location_code,contents\nZZ1,"Acme, S.r.l.","Titolo; con punto e virgola",C3-δ-DX,"2024: A|2025: B ""quote"""\n');
  ok(r.ok === 1 && r.rows[0].p.company_name === 'Acme, S.r.l.' && r.rows[0].p.shelf_code === 'δ' && r.rows[0].p.sector_code === 'DX' && r.rows[0].p.contents_items[1].description === 'B "quote"', 'comma CSV with quotes + location parse', r);
  r = await imp('﻿cliente;titolo;stanza;armadio;ripiano;stato;contenuti\r\nNuovo Cliente Srl;Fatture;D;1;β;prelevato;2025: X\r\n\r\n');
  ok(r.ok === 1 && r.rows[0].p.archive_state === 'CHECKED_OUT' && r.rows[0].p.speaking_code === 'NC1' && /^dm26/.test(r.rows[0].p.short_code), 'Italian headers + BOM + CRLF + auto codes', r);
  r = await imp('Here you go:\n```csv\nspeaking_code;company_name;category\nAB1;Alfa Beta;Ordinaria\nAB1;Alfa Beta;Ordinaria\n```\nThanks');
  ok(r.ok === 2 && r.rows[0].p.speaking_code !== r.rows[1].p.speaking_code, 'AI fenced block + duplicate code in file', r);
  r = await imp('speaking_code\tcompany_name\nTB1\tTab Co\n');
  ok(r.ok === 1 && r.rows[0].p.company_name === 'Tab Co', 'tab-delimited (Excel Unicode text)', r);
  r = await imp('[{"speaking_code":"JS1","company_name":"Json Co","contents_items":[{"year":"2025","description":"Doc"}]}]');
  ok(r.ok === 1 && r.rows[0].p.contents_items[0].year === '2025', 'JSON array', r);
  r = await imp('{bad json'); ok(!!r.error, 'bad JSON gives an error, no crash');
  r = await imp('solo una riga'); ok(!!r.error, 'single line gives an error, no crash');
  r = await imp('speaking_code;company_name;short_code\nBL1;Barbieri Luigi S.r.l.;dm26XXXXXXXX\n');
  const bl1sc = await p.evaluate(() => S.binders.find(b => b.speaking_code === 'BL1').short_code);
  ok(r.rows[0].s === 'upd', 'existing code → update', r);
  r = await imp('speaking_code;company_name;short_code\nQQ1;Q Co;' + bl1sc + '\n');
  ok(r.rows[0].p.short_code !== bl1sc && r.rows[0].w.length, 'short code collision regenerated', r);
  r = await imp('company_name;color_hex\nColor Co;notacolor\n');
  ok(/^#[0-9A-F]{6}$/i.test(r.rows[0].p.color_hex || '#000000') , 'invalid color handled', r);
  // Windows-1252 file through the real file input
  fs.writeFileSync('shots/ansi.csv', Buffer.from('cliente;titolo\r\nCitt\xe0 Perch\xe9 Srl;Fatture e Contabilit\xe0\r\n', 'latin1'));
  await p.evaluate(() => { S.view = 'import'; renderAll(); });
  await p.setInputFiles('#file-import', 'shots/ansi.csv'); await p.waitForTimeout(400);
  await p.click('[data-a="imap-confirm"]'); await p.waitForTimeout(200);   // v8: CSV files go through the column-mapping step
  ok(await p.evaluate(() => UI.importParsed && UI.importParsed.rows[0].p.company_name === 'Città Perché Srl'), 'Windows-1252 CSV decoded', await p.evaluate(() => UI.importParsed && UI.importParsed.rows[0].p));
  fs.writeFileSync('shots/utf16.txt', Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('cliente\tripiano\r\nGreco Srl\tγ\r\n', 'utf16le')]));
  await p.setInputFiles('#file-import', 'shots/utf16.txt'); await p.waitForTimeout(400);
  await p.click('[data-a="imap-confirm"]'); await p.waitForTimeout(200);   // v8: CSV files go through the column-mapping step
  ok(await p.evaluate(() => UI.importParsed && UI.importParsed.rows[0].p.shelf_code === 'γ'), 'UTF-16 (Excel Unicode) decoded with Greek letters');
  await p.evaluate(() => { UI.importParsed = null; });

  sec('round trips');
  const snap = () => p.evaluate(() => JSON.stringify(sortedBinders().map(b => [b.speaking_code, b.company_name, b.category, b.binder_title, b.location_code, b.archive_state, contentsToPipe(b.contents_items), b.tags, b.color_hex, b.short_code, b.final_destination])));
  const before = await snap();
  await p.evaluate(() => { S.view = 'export'; renderAll(); });
  const dl = async (sel) => { const [d] = await Promise.all([p.waitForEvent('download'), p.click(sel)]); const f = 'shots/' + d.suggestedFilename(); await d.saveAs(f); return f; };
  const csvF = await dl('[data-a="ex-csv"]');
  ok(await p.evaluate(() => S.hasUnexportedChanges === false), 'export clears dirty flag');
  const csvTxt = fs.readFileSync(csvF, 'utf8');
  await p.evaluate((t) => { analyzeImport(t); applyImport('replace'); }, csvTxt);
  const afterCsv = await snap();
  ok(afterCsv === before, 'CSV backup → replace import is lossless', [before.slice(0,400), afterCsv.slice(0,400)]);
  await p.evaluate(() => { S.view = 'export'; renderAll(); });
  const jsonF = await dl('[data-a="ex-json"]');
  await p.evaluate((t) => { S.binders = []; analyzeImport(t); applyImport('replace'); }, fs.readFileSync(jsonF, 'utf8'));
  ok(await snap() === before, 'JSON workspace round trip is lossless');
  await p.evaluate(() => { S.view = 'export'; renderAll(); });
  const manF = await dl('[data-a="ex-manifest"]');
  const man = fs.readFileSync(manF, 'utf8').split('\n');
  ok(man[0] === 'short_code;short_url;final_destination;tags' && man.length === 7 && man[1].split(';').length === 4 && man[1].includes('https://docmap.pr-it.it/studio-de/q/dm26'), 'manifest header + rows', man.slice(0, 2));
  const codes = await p.evaluate(() => S.binders.map(b => b.short_code));
  const mm = await p.evaluate(([c0]) => mergeManifest('﻿short_code;short_url;final_destination;tags\r\n1TSE0G;https://qr7.it/1TSE0G;https://x/a;c\r\n' + c0 + ';https://qr7.it/' + c0 + ';https://old;o\r\n' + c0 + ';dup;dup;dup\r\nOliva01;https://qr7.it/Oliva01;https://x/o;olio\r\ndm26Gone2345;https://qr7.it/dm26Gone2345;x;y\r\n', true), [codes[0]]);
  const mlines = mm.text.replace(/^﻿/, '').trim().split('\r\n');
  ok(mm.text.startsWith('﻿') && mlines[1].startsWith('1TSE0G') && mlines[2].startsWith('Oliva01') && mm.updated === 1 && mm.removed === 1 && mlines.length === 1 + 2 + 5 && mlines.filter(l => l.startsWith(codes[0])).length === 1, 'manifest merge: keeps rows, BOM, CRLF, dedupe, prune', mm);
  const mm2 = await p.evaluate(() => mergeManifest('1TSE0G;https://qr7.it/1TSE0G;https://x;y\n', false));
  ok(mm2.text.split('\n')[0] === 'short_code;short_url;final_destination;tags' && mm2.kept === 1, 'manifest without header', mm2);

  sec('SQLite');
  await p.evaluate(() => { S.view = 'database'; renderAll(); }); await p.waitForTimeout(500);
  await p.fill('#db-session-name', 'Suite'); await p.click('[data-a="db-save-session"]'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => dbSessions().length >= 1), 'session saved');
  ok(await p.evaluate(() => dbScalar('SELECT COUNT(*) FROM binders') === S.binders.length && dbScalar('SELECT COUNT(*) FROM contents_items') === S.binders.reduce((a, b) => a + b.contents_items.length, 0)), 'live tables mirror state');
  const sq = await dl('.page-h [data-a="db-download"]');
  await p.evaluate(() => { S.binders = S.binders.slice(0, 1); commit(); });
  await p.setInputFiles('#file-sqlite', sq); await p.waitForTimeout(500);
  await p.click('.overlay .btn-danger-solid'); await p.waitForTimeout(500);
  ok(await snap() === before, '.sqlite download → open restores everything');
  await p.evaluate(() => { S.binders = []; commit(); }); await p.waitForTimeout(100);
  await p.evaluate(async () => { await dbRestoreSession(dbSessions()[0].id); });
  ok(await snap() === before, 'session restore');
  await p.evaluate(() => { dbRunConsole('DELETE FROM binders'); }); ok(await p.evaluate(() => !!DB.consoleResult.error), 'console blocks writes');
  await p.evaluate(() => { dbRunConsole('SELECT * FROM v_manifest_qr7'); }); ok(await p.evaluate(() => DB.consoleResult.values.length === S.binders.length), 'console SELECT works');
  await p.evaluate(() => { S.binders.push(normalizeBinder({speaking_code:'PZ1', company_name:'Persist', short_code:newShortCode()})); commit(); }); await p.waitForTimeout(1200);
  await p.reload(); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => S.binders.some(b => b.speaking_code === 'PZ1') && dbScalar("SELECT COUNT(*) FROM binders WHERE speaking_code='PZ1'") === 1), 'state + SQLite survive reload');
  await p.evaluate(() => { S.binders = S.binders.filter(b => b.speaking_code !== 'PZ1'); commit(); });

  sec('guided actions (scripted end-to-end)');
  await p.evaluate(() => { S.view = 'archive'; renderAll(); guideStart('ai'); }); await p.waitForTimeout(400);
  await p.click('.nav [data-v="ai"]').catch(() => {}); await p.waitForTimeout(300);
  await p.click('[data-a="ai-copy"]'); await p.waitForTimeout(300);
  await p.click('[data-a="guide-next"]'); await p.waitForTimeout(200);
  await p.click('.nav [data-v="import"]'); await p.waitForTimeout(500);
  await p.click('[data-a="guide-next"]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => !!G.msg), 'guide blocks Next when field empty');
  await p.click('[data-a="guide-extra"]'); await p.click('[data-a="guide-next"]'); await p.waitForTimeout(200);
  await p.click('[data-a="im-analyze"]'); await p.waitForTimeout(600);
  await p.click('[data-a="guide-next"]'); await p.waitForTimeout(300);
  await p.click('[data-a="im-merge"]'); await p.waitForTimeout(800);
  ok(await p.evaluate(() => G.g && G.g.steps[G.i].final && S.binders.some(b => b.company_name === 'Bianchi Impianti S.r.l.')), 'AI guide completes and imports', await p.evaluate(() => [G.i, G.msg]));
  await p.keyboard.press('Escape');
  for (const g of Object.keys(await p.evaluate(() => GUIDES))){
    await p.evaluate(g => guideStart(g), g); await p.waitForTimeout(250);
    ok(await p.evaluate(() => !!document.querySelector('.g-card h4')), 'guide starts: ' + g);
    await p.keyboard.press('Escape');
  }
  // help search
  await p.click('[data-a="help-open"]'); await p.fill('#help-q', 'calibr'); await p.waitForTimeout(100);
  ok((await p.$$('#help-list .help-item')).length >= 1, 'help search');
  await p.keyboard.press('Escape');

  sec('performance with 2000 binders');
  const perf = await p.evaluate(async () => {
    const extra = []; const taken = [];
    for (let i = 0; i < 2000; i++){ const sc = newShortCode(taken); taken.push(sc); extra.push(normalizeBinder({speaking_code:'PF' + i, company_name:'Perf Company ' + (i % 300), binder_title:'Titolo ' + i, room_code:'P', cabinet_code:String(i % 9), shelf_code:GREEK[i % 5], contents_items:'2025: Doc A|2024: Doc B|2023: Doc C', short_code:sc, selected_for_print:i < 300})); }
    const keep = S.binders; S.binders = keep.concat(extra);
    const T = (f) => { const t0 = performance.now(); f(); return Math.round(performance.now() - t0); };
    const r = {};
    S.view = 'archive'; r.archive = T(() => renderAll());
    r.search = T(() => { UI.q = 'company 12'; renderArchiveResults(); }); UI.q = '';
    S.archiveView = 'map'; r.map = T(() => renderArchiveResults()); S.archiveView = 'table';
    S.view = 'print'; r.print = T(() => renderAll());
    r.sheets = T(() => buildLabelSheets(false));
    r.sync = T(() => dbSyncFromState('perf'));
    const t0 = performance.now(); await dbPersist(); r.persist = Math.round(performance.now() - t0);
    r.save = T(() => persist());
    r.csv = T(() => toCSV([CSV_COLUMNS].concat(sortedBinders().map(binderToCsvRow)), ';'));
    S.binders = keep; commit(); S.view = 'archive'; renderAll();
    return r;
  });
  console.log('  timings ms', JSON.stringify(perf));
  ok(perf.archive < 1500 && perf.print < 4000 && perf.sync < 1500 && perf.search < 800, 'performance acceptable', perf);

  sec('safety');
  ok(await p.evaluate(() => { S.hasUnexportedChanges = true; const e = new Event('beforeunload', {cancelable:true}); window.dispatchEvent(e); return e.defaultPrevented; }), 'beforeunload guard active when dirty');
  await p.evaluate(() => { S.view = 'archive'; renderAll(); }); await p.waitForTimeout(200);
  await p.click('[data-a="del"] >> nth=0'); await p.waitForTimeout(200);
  ok((await p.innerText('.overlay')).includes('Sei sicuro?'), 'delete asks confirmation');
  await p.keyboard.press('Escape');
  // XSS: names are escaped
  await p.evaluate(() => { S.binders.push(normalizeBinder({speaking_code:'XS1', company_name:'<img src=x onerror="window.__x=1">', short_code:newShortCode()})); renderAll(); S.view = 'print'; renderAll(); });
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => !window.__x), 'HTML in names is escaped');
  await p.evaluate(() => { S.binders = S.binders.filter(b => b.speaking_code !== 'XS1'); commit(); });

  sec('v4 hardening (bug hunt regressions)');
  await p.evaluate(() => { S.view = 'archive'; renderAll(); });
  let h = await p.evaluate(() => { analyzeImport('sep=;\nspeaking_code;company_name\nSP1;Sep Co'); return UI.importParsed; });
  ok(!h.error && h.rows[0].status === 'new' && h.rows[0].p.speaking_code === 'SP1', 'Excel "sep=;" first line is understood', h);
  h = await p.evaluate(() => { analyzeImport('HL1;Header Less;Lavoro\nHL2;Header Less;Lavoro'); return UI.importParsed; });
  ok(!h.error && h.rows.length === 2 && h.rows.every(r => r.status === 'new') && h.rows[1].p.category === 'Lavoro', 'rows without header use the standard column order', h);
  h = await p.evaluate(async () => {
    const before = S.binders.length;
    analyzeImport('speaking_code;company_name;id\nDI1;Dup Id;same-id\nDI2;Dup Id;same-id'); applyImport('merge');
    await new Promise(r => setTimeout(r, 1200));
    return {ids:new Set(S.binders.map(b => b.id)).size === S.binders.length, n:S.binders.length - before, db:dbScalar('SELECT COUNT(*) FROM binders') === S.binders.length};
  });
  ok(h.ids && h.n === 2 && h.db, 'duplicate ids in a file never break the SQLite mirror', h);
  ok(await p.evaluate(() => { const f = S.binders.length; S.binders.push(normalizeBinder(clone(S.binders[0]))); const n = ensureIntegrity(); const okk = n >= 2 && new Set(S.binders.map(b => b.id)).size === f + 1 && new Set(S.binders.map(b => b.speaking_code)).size === f + 1 && new Set(S.binders.map(b => b.short_code)).size === f + 1; S.binders.pop(); return okk; }), 'integrity guard fixes duplicate id, speaking code and short code');
  h = await p.evaluate(() => {
    const n0 = dbScalar('SELECT COUNT(*) FROM audit_log');
    dbRunConsole("WITH x AS (SELECT 1) INSERT INTO audit_log(action) SELECT 'x' FROM x -- limit");
    const r1 = DB.consoleResult; dbRunConsole('SELECT speaking_code FROM binders -- note');
    return {err:!!r1.error, same:dbScalar('SELECT COUNT(*) FROM audit_log') === n0, sel:(DB.consoleResult.values || []).length};
  });
  ok(h.err && h.same && h.sel > 0, 'SQL console is truly read-only (CTE write refused), trailing comments OK', h);
  h = await p.evaluate(() => {
    const b = S.binders[0], keep = [b.company_name, b.tags]; b.company_name = '=HYPERLINK("http://x")'; b.tags = '@sum,-1';
    const csv = toCSV([CSV_COLUMNS].concat(sortedBinders().map(x => binderToCsvRow(x).map(safeCell))), ';');
    analyzeImport(csv); const p0 = UI.importParsed.rows.find(r => r.p.speaking_code === b.speaking_code).p;
    b.company_name = keep[0]; b.tags = keep[1]; UI.importParsed = null;
    return {guarded:csv.includes("'=HYPERLINK") && !/[;\n"]=HYPERLINK/.test(csv), back:p0.company_name === '=HYPERLINK("http://x")' && p0.tags === '@sum,-1'};
  });
  ok(h.guarded && h.back, 'CSV backup blocks Excel formulas and the round trip stays lossless', h);
  h = await p.evaluate(() => { const n = S.binders.length; undoPoint(); S.binders = []; commit(); undoToast('x'); const btn = [...document.querySelectorAll('.toast-act')].pop(); btn.click(); return S.binders.length === n; });
  ok(h, 'undo restores the archive after a bulk change');
  await p.evaluate(() => { S.view = 'archive'; renderAll(); openEditor(S.binders[0].id); });
  await p.waitForTimeout(200);
  await p.fill('#ed-binder_title', 'Titolo modificato non salvato');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => modalStack.length === 2 && !!UI.ed), 'Esc on an edited binder asks before discarding');
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => modalStack.length === 1 && !!UI.ed), 'cancelling the question keeps the editor open');
  await p.evaluate(() => closeModal(true));
  await p.evaluate(() => openEditor(S.binders[0].id)); await p.waitForTimeout(150);
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => modalStack.length === 0), 'Esc on an untouched binder closes at once');
  ok(await p.evaluate(() => { const id = S.print.presetId, keep = S.usedSlots[id]; S.usedSlots[id] = Array.from({length:slotCount()}, (_, i) => i); const L = layoutLabels(); S.usedSlots[id] = keep; return L.pages[0].length > 0 && L.pages[0][0].s === 0; }), 'a sheet marked fully used is treated as a fresh sheet');
  h = await p.evaluate(() => { const e = new Event('drop', {bubbles:true, cancelable:true}); Object.defineProperty(e, 'dataTransfer', {value:{types:['Files'], files:[]}}); document.body.dispatchEvent(e); return e.defaultPrevented; });
  ok(h, 'a file dropped anywhere never navigates away from the app');
  ok(await p.evaluate(() => normalizeBinder({speaking_code:'x1', room_code:'b', cabinet_code:'2', shelf_code:'γ'}).location_code === 'B2-γ'), 'room code normalised to upper case');

  sec('v5: Codice Multi, templates, photos, locator');
  await p.evaluate(() => { closeModal(true); closeModal(true); S.view = 'archive'; renderAll(); });
  let v = await p.evaluate(() => {
    const b = S.binders[0]; b.multi_code = 'M-00777/A'; commit();
    const csv = toCSV([CSV_COLUMNS].concat(sortedBinders().map(x => binderToCsvRow(x).map(safeCell))), ';');
    analyzeImport(csv); const r = UI.importParsed.rows.find(x => x.p.speaking_code === b.speaking_code); UI.importParsed = null;
    analyzeImport(workspaceJSON()); const j = UI.importParsed.rows.find(x => x.p.speaking_code === b.speaking_code); UI.importParsed = null;
    return {csvCol:CSV_COLUMNS[1] === 'multi_code', csv:r && r.p.multi_code, json:j && j.p.multi_code};
  });
  ok(v.csvCol && v.csv === 'M-00777/A' && v.json === 'M-00777/A', 'Codice Multi survives CSV and JSON round trips (leading zeros, slash)', v);
  v = await p.evaluate(() => { analyzeImport('Codice;Codice Multi;Cliente\nCM1;00123;Cliente Multi'); return UI.importParsed.rows[0].p; });
  ok(v.multi_code === '00123' && v.company_name === 'Cliente Multi', 'Italian header "Codice Multi" recognised', v);
  v = await p.evaluate(() => { analyzeImport('BL9;Barbieri Luigi;Lavoro'); const a = UI.importParsed.rows[0].p; analyzeImport('ZZ7;M-1;Zeta Srl;Lavoro;T;A;1;α;;A1-α;CURRENT;2025: X;;;;;'); const c = UI.importParsed.rows[0].p; UI.importParsed = null; return {a, c}; });
  ok(v.a.company_name === 'Barbieri Luigi' && !v.a.multi_code && v.c.multi_code === 'M-1' && v.c.company_name === 'Zeta Srl', 'headerless rows: old 16-col and new 17-col orders', v);
  v = await p.evaluate(() => { const pr = buildAIPrompt(true); return {hdr:pr.includes('speaking_code;multi_code;company_name'), n:pr.includes('exactly 22 fields'), rule:pr.includes('Never invent it'), ctx:pr.includes('Codice Multi (reuse it')}; });
  ok(v.hdr && v.n && v.rule && v.ctx, 'AI prompt: multi_code column, 22 fields, never invented, known codes in context', v);
  v = await p.evaluate(() => { const b = S.binders[0]; return {tags:manifestTags(b).includes('multi-m-00777-a'), dest:renderDest('https://x/?m={multi_code}', b) === 'https://x/?m=M-00777%2FA', mm:mergeManifest('', false).text.split('\n')[0] === 'short_code;short_url;final_destination;tags'}; });
  ok(v.tags && v.dest && v.mm, 'manifest: Multi in tags, {multi_code} placeholder, header unchanged', v);
  v = await p.evaluate(async () => { dbSyncFromState('t'); const ws = dbReadWorkspace(DB.db); const n = dbScalar("SELECT COUNT(*) FROM binders WHERE multi_code = 'M-00777/A'"); return {n, ws:ws.binders.find(b => b.multi_code === 'M-00777/A') ? 1 : 0}; });
  ok(v.n === 1 && v.ws === 1, 'SQLite: binders.multi_code stored and read back', v);
  v = await p.evaluate(() => {
    const old = new DB.SQL.Database();
    old.exec("CREATE TABLE binders(id TEXT PRIMARY KEY, speaking_code TEXT NOT NULL UNIQUE, company_name TEXT, category TEXT, color_hex TEXT, binder_title TEXT, room_code TEXT, cabinet_code TEXT, shelf_code TEXT, sector_code TEXT, location_code TEXT, archive_state TEXT, tags TEXT, short_code TEXT UNIQUE, short_url TEXT, final_destination TEXT, final_destination_custom TEXT, selected_for_print INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT); INSERT INTO binders(id, speaking_code) VALUES ('x','OLD1');");
    dbMigrate(old); const cols = dbQuery('PRAGMA table_info(binders)', null, old).map(r => r.name); const ph = dbQuery("SELECT name FROM sqlite_master WHERE name = 'photos'", null, old).length; old.close();
    return {cols:cols.includes('multi_code'), ph};
  });
  ok(v.cols && v.ph === 1, 'old .sqlite files are upgraded (multi_code column + photos table)', v);
  v = await p.evaluate(() => {
    const out = {}; const b = S.binders[0];
    for (const tp of ['classic','multi','bold','minimal']){ S.print.template = tp; for (const pid of ['l7160','l7163','l7165','l4760','a4-21']){ const g = geoFromPreset(findPreset(pid)); const h = renderLabel('A', b, g, S.print); out[tp + pid] = !h.includes('NaN') && h.includes('<svg') && (tp === 'classic' || tp === 'bold' || h.includes('M-00777/A')) && LM.A.q > 0; } }
    S.print.template = 'classic'; S.print.showMulti = false; const off = !renderLabel('A', b, S.print.geometry, S.print).includes('M-00777/A') && !renderLabel('B', b, S.print.geometry, S.print).includes('M-00777/A'); S.print.showMulti = true;
    const on = renderLabel('B', b, S.print.geometry, S.print).includes('M-00777/A') && renderLabel('U', b, S.print.geometry, S.print).includes('M-00777/A');
    return {all:Object.values(out).every(Boolean), out, off, on};
  });
  ok(v.all && v.off && v.on, 'every template renders on every size; Multi on A/B/U and can be switched off', v);
  v = await p.evaluate(() => { const reg = buildRegisterHTML(sortedBinders()); return reg.includes('M M-00777/A'); });
  ok(v, 'register shows the Codice Multi');
  // QR still decodes with the dense templates
  for (const tp of ['multi','bold','minimal']){
    const info = await p.evaluate((tp) => { S.print.template = tp; S.print.presetId = 'l7160'; S.print.geometry = geoFromPreset(findPreset('l7160')); S.print.contentMode = 'a'; S.print.qrMode = 'live'; S.usedSlots = {}; S.binders.forEach(b => b.selected_for_print = true);
      document.getElementById('print-root').innerHTML = buildLabelSheets(false)[0]; const L = layoutLabels(); const P = S.print.geometry;
      return {slots:L.pages[0].map(x => Object.assign(slotRect(x.s), {url:x.item.b.short_url})), w:P.w, h:P.h}; }, tp);
    await p.emulateMedia({media:'print'}); const pdf = await p.pdf({width:'210mm', height:'297mm', printBackground:true, preferCSSPageSize:true}); await p.emulateMedia({media:'screen'});
    fs.writeFileSync('shots/q.pdf', pdf);
    require('child_process').execSync('python3 -c "import pypdfium2 as p;d=p.PdfDocument(\'shots/q.pdf\');d[0].render(scale=300/72).to_pil().convert(\'RGBA\').save(\'shots/q.png\')"');
    const png = PNG.sync.read(fs.readFileSync('shots/q.png')), k = png.width / 210; let good = 0;
    for (const s of info.slots){ const x0 = Math.floor(s.x * k), y0 = Math.floor(s.y * k), w = Math.floor(info.w * k), h = Math.floor(info.h * k); const d = new Uint8ClampedArray(w * h * 4);
      for (let j = 0; j < h; j++){ const st = ((y0 + j) * png.width + x0) * 4; d.set(png.data.subarray(st, st + w * 4), j * w * 4); } const r = jsQR(d, w, h); if (r && r.data === s.url) good++; }
    ok(good === info.slots.length, 'QR decode with template ' + tp + ': ' + good + '/' + info.slots.length);
  }
  await p.evaluate(() => { document.getElementById('print-root').innerHTML = ''; S.print.template = 'classic'; S.print.contentMode = 'pair'; savePrefs(); });
  v = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const x = c.getContext('2d'); x.fillStyle = '#c84'; x.fillRect(0, 0, 3000, 2000);
    const bl = await new Promise(r => c.toBlob(r, 'image/png')); const f = new File([bl], 'big.png', {type:'image/png'});
    const b = S.binders.find(z => z.room_code && z.shelf_code);
    const n1 = await phAdd('binder', b.id, [f]); const n2 = await phAdd('cabinet', cabKey(b), [f]);
    const bad = await phAdd('binder', b.id, [new File([new Uint8Array([1,2,3])], 'x.jpg', {type:'image/jpeg'})]);
    const ph = phList('binder', b.id)[0];
    return {n1, n2, bad, w:ph.width, h:ph.height, mime:ph.mime, count:phCounts()[b.id], id:b.id, cab:cabKey(b)};
  });
  ok(v.n1 === 1 && v.n2 === 1 && v.bad === 0 && v.w === 1400 && v.h === 933 && v.mime === 'image/jpeg' && v.count === 1, 'photos: resized to 1400 px JPEG, unreadable files rejected, counted', v);
  await p.evaluate(() => { S.view = 'archive'; S.archiveView = 'table'; renderAll(); });
  ok(await p.locator('.ph-n').count() >= 1, 'archive row shows the photo count');
  await p.evaluate((id) => openLocate(id), v.id); await p.waitForTimeout(200);
  ok(await p.evaluate(() => !!document.querySelector('.cs-cell.hit .cs-b.me') && !!document.querySelector('.ph-loc img') && /Ripiano/.test(document.querySelector('.loc-say').textContent)), 'locator: shelf cell highlighted, cabinet photo shown, position in words');
  await p.click('[data-a="ph-mark"]'); const bb = await p.locator('.ph-loc img').boundingBox();
  await p.mouse.click(bb.x + bb.width * 0.25, bb.y + bb.height * 0.75); await p.waitForTimeout(300);
  v = await p.evaluate((cab) => { const ph = phList('cabinet', cab)[0]; return {marks:ph.marks, pin:!!document.querySelector('.ph-pin')}; }, v.cab);
  ok(v.pin && Object.values(v.marks).some(m => Math.abs(m.x - 0.25) < 0.02 && Math.abs(m.y - 0.75) < 0.02), 'locator: clicking the photo stores the shelf mark and shows the pin', v);
  await p.evaluate(() => closeModal(true));
  v = await p.evaluate(async () => { await dbPersist(); const bytes = DB.db.export(); const d2 = new DB.SQL.Database(bytes); const n = dbScalar('SELECT COUNT(*) FROM photos', null, d2); d2.close(); return n; });
  ok(v >= 2, 'photos are inside the downloadable .sqlite', v);
  v = await p.evaluate(async () => { const id = S.binders[S.binders.length - 1].id; await phAdd('binder', id, [new File([await new Promise(r => { const c = document.createElement('canvas'); c.width = c.height = 50; c.toBlob(r, 'image/jpeg'); })], 'o.jpg', {type:'image/jpeg'})]);
    S.binders = S.binders.filter(b => b.id !== id); commit(); dbSyncFromState('t'); const o = phOrphans(); await phPurgeOrphans(); return {o, after:phOrphans()}; });
  ok(v.o === 1 && v.after === 0, 'orphan photos detected and purged on request', v);
  await p.evaluate(() => { S.view = 'archive'; S.archiveView = 'map'; renderAll(); });
  ok(await p.evaluate(() => document.querySelectorAll('.spine[data-a="locate"]').length > 0 && document.querySelectorAll('.cab-ph').length > 0), 'shelf map: spines open the locator, cabinets have a photo button');
  await p.evaluate(() => { S.archiveView = 'table'; renderAll(); });


  sec('v6: MRINK143 split label, fields, clients, demo, shelves, guide');
  v = await p.evaluate(() => { const d = defaultState(); const m = migrate(Object.assign(defaultState(), {schema:26.1, print:Object.assign(defaultState().print, {presetId:'l7160', contentMode:'pair', padding:1.5})})); const m2 = migrate(Object.assign(defaultState(), {schema:26.6, print:Object.assign(defaultState().print, {presetId:'l7163', contentMode:'pair'})}));
    return {dp:d.print.presetId, dm:d.print.contentMode, first:BUILTIN_PRESETS[0].id, mp:m.print.presetId, mm:m.print.contentMode, m2p:m2.print.presetId, m2m:m2.print.contentMode}; });
  ok(v.dp === 'mrink143' && v.dm === 'info' && v.first === 'mrink143', 'default sheet MRINK143 + info label (v9)', v);
  ok(v.mp === 'mrink143' && v.mm === 'info' && v.m2p === 'l7163' && v.m2m === 'pair', 'migration switches old workspaces to MRINK143 once (v9: info label), later choices are kept', v);
  v = await p.evaluate(() => { const P = findPreset('mrink143'), g = geoFromPreset(P); return {fits:P.marginLeft + P.cols * P.w <= 210 && P.marginTop + P.rows * P.h <= 297.01, n:P.cols * P.rows, w:P.w, h:P.h, group:g.group, turn:g.turn, name:P.name}; });
  ok(v.fits && v.n === 8 && v.w === 105 && v.h === 74 && v.group === 2 && v.turn && /8 etichette da dividere/.test(v.name), 'MRINK143: 4 physical 105×148 labels = 8 printed 105×74 labels', v);
  v = await p.evaluate(() => {
    S.binders = S.binders.concat([normalizeBinder({speaking_code:'TS1', company_name:'Test Split S.r.l.', company_city:'Parma (PR)', category:'Ordinaria', binder_title:'Titolo split', ref_year:'2024', extra_codes:'Prot. 77', tags:'iva', multi_code:'M-1', short_code:'dm26TestAbCd', room_code:'Ufficio 1', cabinet_code:'2', shelf_code:'3', contents_items:[{year:'2024', description:'Voce uno'}], selected_for_print:true})]); commit();
    S.print.presetId = 'mrink143'; S.print.geometry = geoFromPreset(findPreset('mrink143')); S.print.contentMode = 'split'; S.print.qrMode = 'live'; S.print.fields = {}; S.print.split = {rotate:-90, guides:true}; S.usedSlots = {};
    const q = printQueueBinders().length, L = layoutLabels(), sh = buildLabelSheets(false), g = S.print.geometry;
    const b = S.binders.find(x => x.speaking_code === 'TS1'), html = renderSlotLabel('S', b, g, S.print), fr = frameGeo(g);
    const first = L.pages[0].map(x => x.s).slice(0, 2);
    return {q, pages:L.pages.length, expect:Math.ceil(q / 8), perPage:L.pages[0].length, cuts:(sh[0].match(/class="cut-line"/g) || []).length, rot:html.includes('rotate(-90deg)'), frame:[fr.w, fr.h], first, sameLabel:Math.floor(first[0] / 4) === Math.floor(first[1] / 4) && first[0] % 2 === first[1] % 2,
      has:['TS1', 'ordinaria', 'Test Split', 'Parma (PR)', 'M-1', 'Titolo split', '2024', 'Prot. 77', '#iva', 'Voce uno', '>qr7.it/dm26TestAbCd', 'Ufficio 1'].filter(x => !html.toLowerCase().includes(x.toLowerCase())), demoTag:renderSlotLabel('S', S.binders.find(isDemo), g, S.print).includes('#demo'), qr:(html.match(/<svg/g) || []).length};
  });
  ok(v.pages === v.expect && v.perPage === Math.min(8, v.q) && v.cuts >= 2 && v.cuts <= 4 && v.rot && v.frame.join('x') === '74x105', '8 complete labels per sheet, read turned (74×105), one faint cut line per used physical label', v);
  ok(v.sameLabel, 'labels 1 and 2 are the two halves of the same physical label', v.first);
  ok(!v.has.length && !v.demoTag && v.qr === 1, 'complete label: own QR + code, category, company, place, Multi, location, title, year, extra codes, tags, contents, URL (never the demo tag)', v);
  v = await p.evaluate(() => { const b = S.binders.find(x => x.speaking_code === 'TS1'), g = S.print.geometry;
    S.print.split = {rotate:90, guides:false}; const r = renderSlotLabel('S', b, g, S.print); const sh = buildLabelSheets(false)[0];
    S.print.fields = {category:false, city:false, multi:false, url:false, year:false, extra:false, tags:false, contents:false, location:false, date:'none'}; const off = renderSlotLabel('S', b, g, S.print);
    S.print.fields = {date:'updated'}; const upd = renderSlotLabel('S', b, g, S.print);
    S.print.fields = {}; S.print.split = {rotate:-90, guides:true};
    return {r90:r.includes('rotate(90deg)'), noCut:!sh.includes('class="cut-line"'), off:['Ordinaria', 'Parma (PR)', 'M-1', '>qr7.it/dm26', 'Prot. 77', '#iva', 'Voce uno', '2024', 'Ufficio 1', t('l_created')].filter(x => off.includes(x)), code:off.includes('TS1'), upd:upd.includes(t('l_updated'))}; });
  ok(v.r90 && v.noCut, 'options: +90° rotation and cut line off', v);
  ok(!v.off.length && v.code && v.upd, 'field toggles hide each field (speaking code always printed), date can be creation/update/none', v);
  v = await p.evaluate(() => { const b = normalizeBinder({speaking_code:'EM1', company_name:'Vuota Srl', short_code:'dm26EmptyAbC'}), g = S.print.geometry;
    const hide = renderSlotLabel('S', b, g, S.print); S.print.fields = {empty:true}; const show = renderSlotLabel('S', b, g, S.print); S.print.fields = {};
    return {hide:/[A-Za-zà]+: <span/.test(hide), show:['Multi: ', t('f_city') + ': ', t('f_category') + ': ', t('f_extra') + ': '].filter(x => !show.includes(x))}; });
  ok(!v.hide && !v.show.length, 'empty optional fields are skipped by default ("Field:" never printed with nothing after); the flag prints "Field: ____"', v);
  v = await p.evaluate(() => { S.print.contentMode = 'pair'; const L = layoutLabels(); const a = L.pages[0][0], b = L.pages[0][1]; const r = {k:[a.item.kind, b.item.kind], same:a.item.b.id === b.item.b.id, s:[a.s, b.s]}; const h = renderSlotLabel('A', a.item.b, S.print.geometry, S.print); r.rot = h.includes('rotate(-90deg)'); S.print.contentMode = 'split'; return r; });
  ok(v.k.join('') === 'AB' && v.same && Math.abs(v.s[0] - v.s[1]) === 2 && v.rot, 'Split Pair on MRINK143: A and B of a binder on the same physical label, same reading direction', v);
  v = await p.evaluate(() => { S.usedSlots = {mrink143:[slotSeq()[0]]}; const L = layoutLabels(); const r = {first:L.pages[0][0].s, skipped:L.skipped, seq2:slotSeq()[1]}; S.usedSlots = {}; return r; });
  ok(v.first === v.seq2 && v.skipped === 1, 'partial sheet works per printed half: a used half is skipped, its twin is used', v);
  v = await p.evaluate(() => { const m = migrate(Object.assign(defaultState(), {schema:26.6, usedSlots:{mrink143:[1]}, print:Object.assign(defaultState().print, {presetId:'mrink143', geometry:{w:105, h:148, cols:2, rows:2, marginTop:0.5, marginLeft:0, gapX:0, gapY:0, radius:0, cut:false}})}));
    const m2 = migrate(Object.assign(defaultState(), {schema:26.6, print:Object.assign(defaultState().print, {presetId:'l7160', geometry:geoFromPreset(findPreset('l7160'))})}));
    return {h:m.print.geometry.h, rows:m.print.geometry.rows, used:m.usedSlots.mrink143.length, g2:[m2.print.geometry.group, m2.print.geometry.turn]}; });
  ok(v.h === 74 && v.rows === 4 && v.used === 0 && v.g2[0] === 1 && v.g2[1] === false, 'v6 → v7 migration resets the MRINK143 geometry and slot map; other sheets stay unturned', v);
  await p.evaluate(() => { S.view = 'print'; S.print.advanced = false; renderAll(); }); await p.waitForTimeout(300);
  v = await p.evaluate(() => { const c = document.querySelector('#pv-scroll .cut-line'); const cs = c && getComputedStyle(c); const a = cs ? (cs.borderTopColor.match(/rgba?\(([^)]+)\)/) || [])[1] : ''; const alpha = a && a.split(',').length === 4 ? +a.split(',')[3] : 1;
    return {alpha, adv:!!document.querySelector('#pr-adv') && !document.querySelector('#pr-adv').open, inAdv:['#slotmap', '#geo-offsets'].every(s => document.querySelector(s) && document.querySelector(s).closest('#pr-adv')), fields:document.querySelectorAll('#pr-fields [data-fld]').length, rec:!!document.querySelector('.preset.on .pop.rec')}; });
  ok(v.alpha > 0 && v.alpha <= 0.2, 'cut line is barely visible (low opacity)', v);
  ok(v.adv && v.inAdv && v.fields >= 10 && v.rec, 'print studio: basic panel, geometry/partial sheets/calibration under a closed "Advanced options", recommended preset badged', v);
  await p.screenshot({path:'shots/v6_print.png'});
  await p.click('[data-a="pv-rot"][data-v="1"]'); await p.waitForTimeout(250);
  v = await p.evaluate(() => { const h = document.querySelector('#pv-scroll .sheet-holder'), sh = h.querySelector('.sheet'); return {land:S.print.pvLandscape, wide:h.offsetWidth > h.offsetHeight, rot:/rotate\(90deg\)/.test(sh.style.transform), nums:[...document.querySelectorAll('#slotmap .slot')].map(x => +x.textContent).sort((a, b) => a - b).join(','), phys:document.querySelectorAll('#slotmap .slot-phys').length}; });
  ok(v.land && v.wide && v.rot, 'landscape preview turns the sheet so labels read straight', v);
  ok(v.nums === '1,2,3,4,5,6,7,8' && v.phys === 4, 'slot map: 8 printed labels grouped in 4 physical labels', v);
  await p.screenshot({path:'shots/v7_landscape.png'});
  await p.click('[data-a="pv-rot"][data-v="0"]'); await p.waitForTimeout(150);
  // shelves and rooms
  v = await p.evaluate(() => ({o:[shelfOrdinal('3'), shelfOrdinal('C'), shelfOrdinal('γ'), shelfOrdinal('🟨'), shelfOrdinal('Alto')], h1:locHead('Ufficio 1', '2'), h2:locHead('a', '1'), loc:computeLocation({room_code:'Ufficio 1', cabinet_code:'2', shelf_code:'3', sector_code:'SX'}), p:JSON.stringify(parseLocation('Ufficio 1 · 2-3-SX')), room:normalizeBinder({room_code:'b'}).room_code, room2:normalizeBinder({room_code:'Ufficio 1'}).room_code}));
  ok(JSON.stringify(v.o) === '[3,3,3,3,0]' && v.h1 === 'Ufficio 1 · 2' && v.h2 === 'a1' && v.loc === 'Ufficio 1 · 2-3-SX' && v.p.includes('"room_code":"Ufficio 1"') && v.room === 'B' && v.room2 === 'Ufficio 1', 'shelf styles (numbers, letters, Greek, emoji, free text) and named rooms', v);
  v = await p.evaluate(() => { openEditor(null); const sel = document.querySelector('[data-shelftype]'); sel.value = 'number'; sel.dispatchEvent(new Event('change', {bubbles:true}));
    const picks = [...document.querySelectorAll('#ed-shelf-tools [data-a="ed-greek"]')].map(x => x.textContent).slice(0, 3).join('');
    document.querySelector('#ed-shelf-tools [data-a="ed-shelfcol"][data-c="#22C55E"]').click();
    const c0 = UI.ed.d.contents_items.map(i => i.description).join('|'); document.querySelector('[data-a="ed-ci-add"]').click(); const c1 = UI.ed.d.contents_items.map(i => i.description).join('|');
    const r = {picks, col:UI.ed.d.shelf_color, c0, c1}; S.settings.shelfType = 'greek'; closeModal(true); return r; });
  ok(v.picks === '123' && v.col === '#22C55E' && v.c0 === 'Archivio 1' && v.c1 === 'Archivio 1|Archivio 2', 'editor: shelf style menu, shelf colour, contents default "Archivio 1" + "Aggiungi voce" → "Archivio 2"', v);
  // clients register
  const csv = fs.readFileSync(__dirname + '/fixtures/clienti_esempio.csv', 'utf8');
  v = await p.evaluate((csv) => { analyzeImport(csv); const IP = UI.importParsed; return {isC:!!IP.clients, n:IP.clients.length, st:IP.clients.map(r => r.status).join(','), c0:IP.clients[0].c, place:clientPlace(IP.clients[0].c)}; }, csv);
  ok(v.isC && v.n === 5 && v.st === 'new,new,new,err,err' && v.c0.multi_code === '8' && v.c0.name === 'APS IL ROSMARINO TEST' && v.c0.category === 'APS' && v.place === "LESIGNANO DE' BAGNI (PR)", 'client CSV recognised (Ditta→Multi, Ragione_soc→name, Localita (Provincia)→place, ETS_ENC→category), duplicates and nameless rows flagged', v);
  await p.evaluate(() => { S.view = 'import'; renderAll(); $('#im-preview').innerHTML = importPreviewHTML(); }); await p.click('[data-a="cl-apply"]'); await p.waitForTimeout(300);
  v = await p.evaluate(() => ({view:S.view, n:S.clients.length, rows:document.querySelectorAll('#cl-results tbody tr').length}));
  ok(v.view === 'info' && v.n === 3 && v.rows === 3, 'clients imported into the register view', v);
  v = await p.evaluate((csv) => { analyzeImport(csv); return UI.importParsed.clients.map(r => r.status).join(','); }, csv);
  ok(v === 'upd,upd,upd,err,err', 're-importing the same list updates instead of duplicating', v);
  await p.evaluate(() => { UI.importParsed = null; });
  await p.fill('[data-bind="clq"]', 'busseto'); await p.waitForTimeout(150);
  ok(await p.locator('#cl-results tbody tr').count() === 1, 'client search');
  await p.click('#cl-results [data-a="cl-binder"]'); await p.waitForTimeout(300);
  v = await p.evaluate(() => { const d = UI.ed.d; return [d.company_name, d.multi_code, d.company_city, d.category, d.speaking_code]; });
  ok(v[0] === 'HAND2HAND APS TEST' && v[1] === '16' && v[2] === 'BUSSETO (PR)' && v[3] === 'APS' && /^[A-Z]+\d+$/.test(v[4]), 'new binder from a client is pre-filled', v);
  await p.evaluate(() => closeModal(true));
  v = await p.evaluate(() => { openEditor(null); const i = $('#ed-company_name'); i.value = 'APS IL ROSMARINO TEST'; i.dispatchEvent(new Event('input', {bubbles:true})); const r = [UI.ed.d.multi_code, UI.ed.d.company_city]; closeModal(true); return r; });
  ok(v[0] === '8' && v[1] === "LESIGNANO DE' BAGNI (PR)", 'typing a known client name fills Multi code and place', v);
  // new columns: CSV, AI prompt, SQLite, workspace
  v = await p.evaluate(() => { const b = S.binders.find(x => x.speaking_code === 'TS1'); const row = binderToCsvRow(b); return {len:row.length, cols:CSV_COLUMNS.length, city:row[CSV_COLUMNS.indexOf('company_city')], year:row[CSV_COLUMNS.indexOf('ref_year')], extra:row[CSV_COLUMNS.indexOf('extra_codes')], hdr:csvTemplateHeader().split(';').length}; });
  ok(v.len === v.cols && v.city === 'Parma (PR)' && v.year === '2024' && v.extra === 'Prot. 77' && v.hdr === 22, 'full CSV and AI template carry place, reference year and extra codes', v);
  v = await p.evaluate(() => { analyzeImport('BX9;M-9;Bix Srl;Ordinaria;Bilancio;A;1;α;;A1-α;CURRENT;2025: Doc;iva;#2563EB;;;;Parma (PR);2025;Prot. 9'); const r = UI.importParsed.rows[0].p; UI.importParsed = null; return [r.company_city, r.ref_year, r.extra_codes, r.multi_code]; });
  ok(v.join('|') === 'Parma (PR)|2025|Prot. 9|M-9', 'headerless 20-field AI rows map the new columns', v);
  v = await p.evaluate(() => { analyzeImport('speaking_code;company_name;luogo;anno;codici_extra\nZZ1;Zeta;Fidenza (PR);2023;P-1'); const r = UI.importParsed.rows[0].p; UI.importParsed = null; return [r.company_city, r.ref_year, r.extra_codes]; });
  ok(v.join('|') === 'Fidenza (PR)|2023|P-1', 'Italian column names for the new fields', v);
  v = await p.evaluate(async () => { dbSyncFromState('t'); await dbPersist(); const d2 = new DB.SQL.Database(DB.db.export()); const W = dbReadWorkspace(d2); const nC = dbScalar('SELECT COUNT(*) FROM clients', null, d2); const ver = dbScalar("SELECT value FROM meta WHERE key='schema_version'", null, d2); d2.close();
    const b = W.binders.find(x => x.speaking_code === 'TS1'); return {nC, ver, wc:W.clients.length, city:b.company_city, year:b.ref_year, extra:b.extra_codes, json:JSON.parse(workspaceJSON()).clients.length}; });
  ok(v.nC === 3 && +v.ver >= 5 && v.wc === 3 && v.city === 'Parma (PR)' && v.year === '2024' && v.extra === 'Prot. 77' && v.json === 3, 'SQLite schema >= 5 (v9 activity_log; v4: clients table + new binder columns), also in the workspace JSON', v);
  v = await p.evaluate(() => { const d = new DB.SQL.Database(); d.exec("CREATE TABLE binders(id TEXT PRIMARY KEY, speaking_code TEXT NOT NULL UNIQUE, company_name TEXT, category TEXT, color_hex TEXT, binder_title TEXT, room_code TEXT, cabinet_code TEXT, shelf_code TEXT, sector_code TEXT, location_code TEXT, archive_state TEXT, tags TEXT, short_code TEXT UNIQUE, short_url TEXT, final_destination TEXT, final_destination_custom TEXT, selected_for_print INTEGER, created_at TEXT, updated_at TEXT)"); dbMigrate(d); const c = dbQuery('PRAGMA table_info(binders)', null, d).map(r => r.name); d.close(); return ['multi_code','company_city','ref_year','extra_codes','shelf_color'].every(x => c.includes(x)); });
  ok(v, 'old .sqlite files are migrated (new columns added)');
  // demo data
  v = await p.evaluate(() => { const n = S.binders.filter(isDemo).length; S.settings.hideDemo = true; const vis = filteredBinders().filter(isDemo).length, q = printQueueBinders().filter(isDemo).length; S.settings.hideDemo = false; return {n, vis, q, allTagged:defaultState().binders.every(isDemo)}; });
  ok(v.n > 0 && v.vis === 0 && v.q === 0 && v.allTagged, 'demo binders are tagged "demo" and hidden from list and print queue on request', v);
  await p.evaluate(() => { S.view = 'archive'; S.archiveView = 'table'; renderAll(); });
  ok(await p.isVisible('.demo-bar'), 'archive shows the demo bar');
  await p.click('[data-a="demo-delete"]'); await p.waitForTimeout(150); await p.locator('.modal-f .btn-danger-solid').last().click(); await p.waitForTimeout(300);
  v = await p.evaluate(() => ({demo:S.binders.filter(isDemo).length, mine:S.binders.some(b => b.speaking_code === 'TS1'), bar:!!document.querySelector('.demo-bar')}));
  ok(v.demo === 0 && v.mine && !v.bar, 'delete demo binders keeps the user binders', v);
  await p.click('.toast-act'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => S.binders.filter(isDemo).length > 0 && S.clients.length === 3), 'demo delete can be undone (clients kept)');
  // guide: free navigation
  await p.evaluate(() => { S.view = 'archive'; renderAll(); guideStart('create'); }); await p.waitForTimeout(700);
  await p.click('[data-a="guide-next"]'); await p.waitForTimeout(600);
  v = await p.evaluate(() => ({i:G.i, ed:!!UI.ed}));
  ok(v.ed && v.i === 2, 'guide: Next on an action step performs it (opens the form)', v);
  await p.click('[data-a="guide-next"]'); await p.waitForTimeout(150); const i1 = await p.evaluate(() => G.i);
  await p.click('[data-a="guide-next"]'); await p.waitForTimeout(150); const i2 = await p.evaluate(() => G.i);
  ok(i1 === 2 && i2 === 3, 'guide: a missing value warns once, the second Next goes on', [i1, i2]);
  await p.evaluate(() => $('#ed-tags').scrollIntoView({block:'center'})); await p.waitForTimeout(300);
  const tb = await p.evaluate(() => { const r = $('#ed-tags').getBoundingClientRect(); return {x:r.x + 30, y:r.y + r.height / 2}; });
  await p.mouse.click(tb.x, tb.y); await p.waitForTimeout(250);
  v = await p.evaluate(() => ({t:L(guideStep().title), f:document.activeElement && document.activeElement.id}));
  ok(v.t === 'Tag' && v.f === 'ed-tags', 'guide: clicking another field jumps to its step and focuses it', v);
  await p.mouse.click(4, 400); await p.waitForTimeout(150);
  ok(await p.evaluate(() => G.msg === t('g_outside') && !!UI.ed), 'guide: clicking outside still says the guide is active (form stays open)');
  await p.click('[data-a="guide-back"]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => L(guideStep().title).startsWith('Contenuti')), 'guide: Back always works');
  await p.evaluate(() => { const d = $$('.g-dot'); d[d.length - 2].click(); }); await p.waitForTimeout(150);
  ok(await p.evaluate(() => G.i === G.g.steps.length - 2), 'guide: any step can be reached from the dots');
  ok(await p.evaluate(() => ['Codice Multi', 'Tag', 'Codice breve', 'Destinazione'].every(w => G.g.steps.some(s => L(s.title).includes(w)))), 'create guide covers Multi/place, tags, short code and final destination');
  await p.evaluate(() => { guideStop(); closeModal(true); S.print.advanced = false; S.view = 'print'; renderAll(); guideStart('partial'); }); await p.waitForTimeout(900);
  ok(await p.evaluate(() => $('#pr-adv').open), 'guide opens "Advanced options" when its step is inside');
  await p.evaluate(() => { guideStop(); S.view = 'archive'; renderAll(); });
  // ===== v8 stream A (navigation + Informazioni + QR overview) — add tests below this line =====
  // @@STREAM-A@@
  sec('v8 A: navigation, Informazioni, QR reprint');
  // top bar: 3 main tabs, everything else in the "Funzioni avanzate" menu
  v = await p.evaluate(() => ({main:[...document.querySelectorAll('.nav .nav-main [data-a="nav"]')].map(b => b.dataset.v), adv:[...document.querySelectorAll('#nav-more [data-a="nav"]')].map(b => b.dataset.v).sort(), vis:[...document.querySelectorAll('.nav [data-a="nav"]')].filter(b => b.checkVisibility()).length}));
  ok(v.main.join() === 'archive,print,info' && v.vis === 3 && v.adv.join() === 'ai,database,export,import,log,settings', 'top bar: exactly 3 main tabs, the rest in the "Funzioni avanzate" menu', v);
  for (const view of ['import', 'export', 'database', 'ai', 'settings']){
    await p.click('#nav-more summary'); await p.waitForTimeout(120);
    await p.click('#nav-more [data-v="' + view + '"]'); await p.waitForTimeout(200);
    const r = await p.evaluate(() => ({view:S.view, open:$('#nav-more').open, on:$('#nav-more').classList.contains('on'), item:!!$('#nav-more .nm-item.on[data-v="' + S.view + '"]')}));
    ok(r.view === view && !r.open && r.on && r.item, 'gear menu opens and navigates to ' + view + ' (shown as active)', r);
  }
  await p.focus('#nav-more summary'); await p.keyboard.press('Enter'); await p.waitForTimeout(80); await p.keyboard.press('ArrowDown');
  v = await p.evaluate(() => ({open:$('#nav-more').open, f:document.activeElement.dataset.v}));
  await p.keyboard.press('Escape'); await p.waitForTimeout(80);
  let vA2 = await p.evaluate(() => ({open:$('#nav-more').open, f:document.activeElement.tagName}));
  ok(v.open && v.f === 'import' && !vA2.open && vA2.f === 'SUMMARY', 'menu works from the keyboard (Enter, arrows, Esc back to the button)', [v, vA2]);
  await p.click('#nav-more summary'); await p.waitForTimeout(80); await p.mouse.click(700, 600); await p.waitForTimeout(80);
  ok(!(await p.evaluate(() => $('#nav-more').open)), 'menu closes on an outside click');
  for (const w of [1180, 390]){
    await p.setViewportSize({width:w, height:800}); await p.evaluate(() => { S.view = 'info'; renderAll(); }); await p.waitForTimeout(200);
    const r = await p.evaluate(() => ({sw:document.documentElement.scrollWidth, iw:innerWidth, h:document.querySelector('.topbar').offsetHeight}));
    ok(r.sw <= r.iw + 1 && r.h < 130, 'top bar fits at ' + w + 'px', r);
    await p.screenshot({path:'shots/a_top_' + w + '.png'});
  }
  await p.setViewportSize({width:1366, height:768});
  // view key migration
  v = await p.evaluate(() => { const m = migrate(Object.assign(JSON.parse(JSON.stringify(S)), {view:'clients'})); S.view = 'clients'; renderAll(); return [m.view, m.infoTab, S.view, !!$('#cl-results')]; });
  ok(v.join() === 'info,clients,info,true', 'old view "clients" migrates to "info" (client register sub-tab)', v);
  // every sub-tab renders
  for (const tab of ['clients', 'tags', 'category', 'year', 'place', 'multi', 'extra', 'qr']){
    await p.click('.info-tabs [data-v="' + tab + '"]'); await p.waitForTimeout(150);
    const r = await p.evaluate(() => ({tab:S.infoTab, rows:document.querySelectorAll('#info-panel tbody tr').length, sw:document.documentElement.scrollWidth, iw:innerWidth}));
    ok(r.tab === tab && r.rows > 0 && r.sw <= r.iw + 1, 'Informazioni › ' + tab + ' renders', r);
  }
  await p.screenshot({path:'shots/a_info_qr.png'});
  ok(await p.evaluate(() => { const y = infoCollect('year').map(e => e.key), pl = infoCollect('place').map(e => e.key), m = infoCollect('multi').find(e => e.key === '8'); return y.includes('2025') && y.includes('2019') && pl.includes('parma (pr)') && pl.includes('busseto (pr)') && m && m.nC === 1; }), 'lists merge binder and client values (years from contents, client places and Multi codes)');
  // tags: rename, merge, delete, undo
  await p.click('.info-tabs [data-v="tags"]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => !document.querySelector('[data-a="info-rename"][data-k="demo"]') && !!document.querySelector('.tagpill.demo')), 'the "demo" tag is shown, marked and protected');
  const tagN = (k) => p.evaluate((k) => S.binders.filter(b => b.tags.split(',').map(x => x.trim().toLowerCase()).includes(k)).length, k);
  const nF = await tagN('fatture');
  await p.click('[data-a="info-rename"][data-k="fatture"]'); await p.fill('#info-new', 'Fatturazione'); await p.locator('.modal-f .btn-primary').last().click(); await p.waitForTimeout(200);
  ok(nF > 0 && await tagN('fatture') === 0 && await tagN('fatturazione') === nF && await p.evaluate(() => !!document.querySelector('[data-a="info-rename"][data-k="fatturazione"]')), 'tag rename applies to every binder (lowercase) and the list updates live', nF);
  const n25 = await tagN('2025'), nIva = await tagN('iva'), both = await p.evaluate(() => S.binders.filter(b => /(^|,)iva(,|$)/.test(b.tags) && /(^|,)2025(,|$)/.test(b.tags)).length);
  await p.click('[data-a="info-rename"][data-k="iva"]'); await p.fill('#info-new', '2025'); await p.waitForTimeout(80);
  ok(await p.isVisible('#info-new-hint .warn-box'), 'renaming onto an existing tag warns that they will be merged');
  await p.locator('.modal-f .btn-primary').last().click(); await p.waitForTimeout(200);
  v = await p.evaluate(() => S.binders.map(b => b.tags.split(',')).filter(a => a.filter(x => x === '2025').length > 1).length);
  ok(await tagN('iva') === 0 && await tagN('2025') === n25 + nIva - both && v === 0, 'merge = rename onto an existing tag (no duplicates in a binder)', [n25, nIva, both]);
  await p.click('.toast-act'); await p.waitForTimeout(250);
  ok(await tagN('iva') === nIva && await tagN('2025') === n25, 'merge can be undone');
  await p.evaluate(() => { S.view = 'info'; S.infoTab = 'tags'; renderAll(); }); await p.waitForTimeout(100);
  const nPaghe = await tagN('paghe');
  await p.click('[data-a="info-del"][data-k="paghe"]'); await p.waitForTimeout(100); await p.locator('.modal-f .btn-danger-solid').last().click(); await p.waitForTimeout(200);
  ok(await tagN('paghe') === 0 && await p.evaluate(() => S.binders.some(b => b.speaking_code === 'BL3')), 'tag delete removes it from binders (binders stay)');
  await p.click('.toast-act'); await p.waitForTimeout(250);
  ok(nPaghe > 0 && await tagN('paghe') === nPaghe, 'tag delete can be undone', nPaghe);
  // usage count → archive filter
  await p.evaluate(() => { S.view = 'info'; S.infoTab = 'category'; renderAll(); }); await p.waitForTimeout(100);
  await p.click('[data-a="info-filter"][data-k="ordinaria"]'); await p.waitForTimeout(200);
  v = await p.evaluate(() => ({view:S.view, bar:!!document.querySelector('.ifilter'), n:filteredBinders().length, exp:S.binders.filter(b => b.category === 'Ordinaria').length, rows:document.querySelectorAll('#arch-results tbody tr').length}));
  ok(v.view === 'archive' && v.bar && v.n === v.exp && v.rows === v.exp, 'clicking a count opens the Archive filtered by that value', v);
  await p.click('[data-a="info-unfilter"]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => !UI.fInfo && !document.querySelector('.ifilter') && filteredBinders().length === S.binders.length), 'archive filter can be cleared');
  // category colour for new binders
  await p.evaluate(() => { S.view = 'info'; S.infoTab = 'category'; renderAll(); }); await p.waitForTimeout(100);
  await p.click('[data-a="info-color"][data-k="lavoro"]'); await p.waitForTimeout(100);
  await p.click('#info-sws [data-c="#DB2777"]'); await p.locator('.modal-f .btn-primary').last().click(); await p.waitForTimeout(200);
  v = await p.evaluate(() => { openEditor(null); const i = $('#ed-category'); i.value = 'Lavoro'; i.dispatchEvent(new Event('input', {bubbles:true})); const c = UI.ed.d.color_hex; closeModal(true); return {c, set:S.settings.catColors.Lavoro, old:S.binders.find(b => b.speaking_code === 'BL3').color_hex, db:JSON.parse(workspaceJSON()).settings.catColors.Lavoro}; });
  ok(v.c === '#DB2777' && v.set === '#DB2777' && v.old === '#D97706' && v.db === '#DB2777', 'category colour is used for new binders, existing ones untouched, saved in the workspace', v);
  // client rename propagates to its binders
  await p.evaluate(() => { S.binders.push(normalizeBinder({speaking_code:'HH1', company_name:'HAND2HAND APS TEST', multi_code:'16', company_city:'BUSSETO (PR)', short_code:newShortCode()})); commit(); S.view = 'info'; S.infoTab = 'clients'; UI.clq = ''; renderAll(); });
  await p.click('#cl-results tr:has-text("HAND2HAND") [data-a="cl-edit"]'); await p.waitForTimeout(150);
  await p.fill('#cl-name', 'HAND2HAND APS NUOVO'); await p.fill('#cl-multi_code', '160'); await p.locator('.modal-f .btn-primary').last().click(); await p.waitForTimeout(200);
  v = await p.evaluate(() => { const b = S.binders.find(x => x.speaking_code === 'HH1'); return [b.company_name, b.multi_code, S.clients.some(c => c.name === 'HAND2HAND APS NUOVO' && c.multi_code === '160')]; });
  ok(v.join() === 'HAND2HAND APS NUOVO,160,true', 'editing a client name / Multi code updates its binders too', v);
  await p.click('.toast-act'); await p.waitForTimeout(250);
  v = await p.evaluate(() => { const b = S.binders.find(x => x.speaking_code === 'HH1'); return [b.company_name, b.multi_code, S.clients.some(c => c.name === 'HAND2HAND APS TEST')]; });
  ok(v.join() === 'HAND2HAND APS TEST,16,true', 'client edit with linked binders can be undone', v);
  v = await p.evaluate(() => { undoPoint(); const r = infoRename('multi', '16', 'M-16'); commit(); return {r, b:S.binders.find(x => x.speaking_code === 'HH1').multi_code, c:S.clients.find(c => c.name === 'HAND2HAND APS TEST').multi_code}; });
  ok(v.r.nb === 1 && v.r.nc === 1 && v.b === 'M-16' && v.c === 'M-16', 'renaming a Multi code changes binders and clients', v);
  v = await p.evaluate(() => { const r = infoRename('place', 'busseto (pr)', 'Busseto (PR)'); const c = S.clients.find(c => c.name === 'HAND2HAND APS TEST'); return [r.nb, r.nc, c.city, c.province, S.binders.find(x => x.speaking_code === 'HH1').company_city]; });
  ok(v.join() === '1,1,Busseto,PR,Busseto (PR)', 'renaming a place splits it back into client town + province', v);
  // QR overview and reprint
  const prevPrint = await p.evaluate(() => ({preset:S.print.presetId, mode:S.print.contentMode, sel:S.binders.filter(b => b.selected_for_print).map(b => b.id).sort().join()}));
  await p.evaluate(() => { S.view = 'info'; S.infoTab = 'qr'; UI.qrq = ''; UI.qrSel = new Set(); renderAll(); }); await p.waitForTimeout(200);
  v = await p.evaluate(() => ({rows:document.querySelectorAll('#qr-results tbody tr').length, n:S.binders.length, svg:document.querySelectorAll('#qr-results .qr-thumb svg').length, dis:$('#qr-reprint').disabled}));
  ok(v.rows === v.n && v.svg === v.n && v.dis, 'QR tab lists every binder with its QR; reprint disabled with nothing selected', v);
  await p.click('#qr-all'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => UI.qrSel.size === S.binders.length), 'QR tab: select all');
  await p.click('#qr-all'); await p.fill('[data-bind="qrq"]', 'BL'); await p.waitForTimeout(100);
  await p.click('#qr-all'); await p.waitForTimeout(100);
  const picked = await p.evaluate(() => Array.from(UI.qrSel).sort().join());
  await p.click('#qr-reprint'); await p.waitForTimeout(400);
  v = await p.evaluate(() => ({view:S.view, mode:S.print.contentMode, preset:S.print.presetId, q:printQueueBinders().map(b => b.id).sort().join(), bar:!!document.querySelector('.qr-bar'), opt:!!document.querySelector('.opt.on[data-a="cmode"][data-v="qr"]'), prev:!!S.printPrev, kinds:queueItems().map(i => i.kind).join('')}));
  ok(v.view === 'print' && v.mode === 'qr' && v.preset === 'l7159' && v.q === picked && v.bar && v.opt && v.prev && /^Q+$/.test(v.kinds) && picked.split(',').length === 3, 'reprint opens the print studio with QR-only labels of the selected binders on a small sheet', v);
  await p.screenshot({path:'shots/a_qr_print.png'});
  const info = await p.evaluate(() => {
    document.getElementById('page-style').textContent = '@page{size:210mm 297mm;margin:0mm}';
    document.getElementById('print-root').innerHTML = buildLabelSheets(false)[0];
    const g = S.print.geometry; return {slots:layoutLabels().pages[0].map(x => Object.assign(slotRect(x.s), {url:x.item.b.short_url})), w:g.w, h:g.h, q:LM.Q && LM.Q.q};
  });
  await p.emulateMedia({media:'print'}); const pdfQ = await p.pdf({width:'210mm', height:'297mm', printBackground:true, preferCSSPageSize:true}); await p.emulateMedia({media:'screen'});
  fs.writeFileSync('shots/q.pdf', pdfQ);
  require('child_process').execSync('python3 -c "import pypdfium2 as p;d=p.PdfDocument(\'shots/q.pdf\');d[0].render(scale=300/72).to_pil().convert(\'RGBA\').save(\'shots/q.png\')"');
  {
    const png = PNG.sync.read(fs.readFileSync('shots/q.png')), k = png.width / 210; let good = 0;
    for (const s of info.slots){
      const x0 = Math.floor(s.x * k), y0 = Math.floor(s.y * k), w = Math.floor(info.w * k), h = Math.floor(info.h * k), d = new Uint8ClampedArray(w * h * 4);
      for (let j = 0; j < h; j++){ const st = ((y0 + j) * png.width + x0) * 4; d.set(png.data.subarray(st, st + w * 4), j * w * 4); }
      const r = jsQR(d, w, h); if (r && r.data === s.url) good++;
    }
    ok(good === info.slots.length && info.q >= 20, `QR-only labels decode on the printed PDF: ${good}/${info.slots.length} (QR ${info.q} mm)`);
  }
  await p.evaluate(() => { document.getElementById('print-root').innerHTML = ''; });
  v = await p.evaluate(() => ['mrink143', 'l7165', 'a4-5s'].map(id => { const g = frameGeo(geoFromPreset(findPreset(id))); renderLabel('Q', S.binders[0], g, S.print); return LM.Q.q > 10 && LM.Q.code > 3; }));
  ok(v.every(Boolean), 'QR-only label fits any slot (tall, wide, strip)', v);
  await p.click('[data-a="qr-restore"]'); await p.waitForTimeout(250);
  v = await p.evaluate(() => ({preset:S.print.presetId, mode:S.print.contentMode, sel:S.binders.filter(b => b.selected_for_print).map(b => b.id).sort().join(), prev:!!S.printPrev, bar:!!document.querySelector('.qr-bar')}));
  ok(v.preset === prevPrint.preset && v.mode === prevPrint.mode && v.sel === prevPrint.sel && !v.prev && !v.bar, 'previous print settings and selection are restored', [v, prevPrint]);
  // guides still reach views inside the menu
  await p.evaluate(() => { S.view = 'archive'; renderAll(); guideStart('backup'); }); await p.waitForTimeout(300);
  await p.click('[data-a="guide-next"]'); await p.waitForTimeout(400);
  v = await p.evaluate(() => ({open:$('#nav-more').open, ring:getComputedStyle(document.querySelector('.g-ring')).display, txt:L(guideStep().text)}));
  await p.click('[data-a="guide-next"]'); await p.waitForTimeout(400);
  vA2 = await p.evaluate(() => ({view:S.view, i:G.i}));
  ok(v.open && v.ring === 'block' && v.txt.includes('Funzioni avanzate') && vA2.view === 'export' && vA2.i === 2, 'guide: a step inside the closed menu opens it, Next navigates', [v, vA2]);
  await p.evaluate(() => { guideStop(); S.view = 'archive'; renderAll(); });
  // help topics
  ok(await p.evaluate(() => ['nav', 'info', 'qr-reprint'].every(id => { const h = helpTopic(id); return h && h.title.it && h.title.en && h.body.it.length > 200 && h.body.en.length > 200; }) && helpTopic('clients').body.it.includes('Informazioni')), 'help topics for the new navigation, Informazioni and QR reprint (IT + EN)');
  await p.evaluate(() => { S.lang = 'en'; S.view = 'info'; S.infoTab = 'tags'; renderAll(); });
  ok((await p.innerText('.nav')).includes('Information') && (await p.innerText('#info-panel')).includes('Rename'), 'Informazioni in English');
  await p.evaluate(() => { S.lang = 'it'; S.view = 'archive'; renderAll(); });
  // restore the values renamed above so later blocks see the original fixtures
  await p.evaluate(() => { infoRename('tags', 'fatturazione', 'fatture'); infoRename('multi', 'm-16', '16'); infoRename('place', 'busseto (pr)', 'BUSSETO (PR)'); commit(); });

  // ----------------------------------------------------------------------

  // ===== v8 stream B (binder editor: typeahead, contents status, quick location, contacts/notes) =====
  // @@STREAM-B@@
  sec('v8 B: binder editor (typeahead, duplicates, contents status, quick position, contacts/notes)');
  {
    const taState = () => p.evaluate(() => { const pop = $('#ta-pop'); return {open:!!pop && !pop.hidden, opts:$$('#ta-pop .ta-opt').map(o => o.querySelector('.ta-v').textContent), meta:$$('#ta-pop .ta-opt').map(o => (o.querySelector('.ta-m') || {}).textContent || ''), active:document.activeElement && document.activeElement.getAttribute('aria-activedescendant'), head:!!$('#ta-pop .ta-h')}; });
    const edNew = async () => { await p.evaluate(() => { while (topModal()) closeModal(true); S.view = 'archive'; renderAll(); openEditor(null); }); await p.waitForTimeout(250); };
    await edNew();
    // 1. typeahead: most used values on focus, filtering, keyboard
    let v = await taState();
    const topCo = await p.evaluate(() => edCompanies().sort((a, b) => b.count - a.count)[0].value);
    ok(v.open && v.head && v.opts.length >= 1 && v.opts.length <= 4 && v.opts[0] === topCo, 'typeahead: focusing the empty client field shows the most used clients (max 4)', v);
    ok(await p.evaluate(() => $('#ed-company_name').getAttribute('role') === 'combobox' && $('#ed-company_name').getAttribute('aria-expanded') === 'true' && $('#ta-pop').getAttribute('role') === 'listbox' && $$('#ta-pop [role="option"]').length > 0 && !document.querySelector('#ed-company_name[list], datalist')), 'typeahead: combobox/listbox roles, no native datalist left');
    ok(await p.evaluate(() => +getComputedStyle($('#ta-pop')).zIndex > +topModal().style.zIndex), 'typeahead popup sits above the editor modal');
    await p.keyboard.type('ross'); await p.waitForTimeout(120);
    v = await taState();
    ok(v.opts[0] === 'Rossi Costruzioni S.p.A.' && v.meta[0].includes('M-20871') && v.active === 'ta-opt-0' && !v.head, 'typeahead: filters while typing, first match active, Multi code in the row', v);
    v = await p.evaluate(() => taRank([{value:'Acitta Srl', count:9}, {value:'Città Perché Srl', count:0}, {value:'Zeta', count:3}], 'CITTA', {top:4, max:8}).map(c => c.value));
    ok(v.join('|') === 'Città Perché Srl|Acitta Srl', 'typeahead ranking: accent/case-insensitive, prefix before contains', v);
    await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    v = await p.evaluate(() => { const d = UI.ed.d; return {c:d.company_name, m:d.multi_code, city:d.company_city, cat:d.category, code:d.speaking_code, open:!$('#ta-pop').hidden}; });
    ok(v.c === 'Rossi Costruzioni S.p.A.' && v.m === 'M-20871' && v.city === 'Fidenza (PR)' && v.cat === 'Societario' && v.code === 'RC2' && !v.open, 'Enter picks the suggestion: client, Multi, place, category and next speaking code filled', v);
    await p.fill('#ed-company_name', ''); await p.keyboard.type('a'); await p.waitForTimeout(100);
    await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(60);
    v = await taState();
    ok(v.opts.length > 2 && v.active === 'ta-opt-1', 'keyboard ↓ ↓ ↑ moves the active option (aria-activedescendant)', v);
    await p.keyboard.press('Escape'); await p.waitForTimeout(80);
    ok(await p.evaluate(() => $('#ta-pop').hidden && !!UI.ed && !!topModal()), 'Esc closes the suggestions, not the form');
    // 2. client from the register (no binders yet): Multi + place + category; meta shows Multi and city
    await edNew();
    await p.keyboard.type('hand2'); await p.waitForTimeout(120);
    v = await taState();
    ok(v.opts[0] === 'HAND2HAND APS TEST' && v.meta[0].includes('16') && v.meta[0].includes('BUSSETO'), 'register client suggested with Multi code and city', v);
    await p.click('#ta-pop .ta-opt'); await p.waitForTimeout(120);
    v = await p.evaluate(() => { const d = UI.ed.d; return [d.company_name, d.multi_code, d.company_city, d.category, /^[A-Z]+\d+$/.test(d.speaking_code)]; });
    ok(v.join('|') === 'HAND2HAND APS TEST|16|BUSSETO (PR)|APS|true', 'mouse pick of a register client fills Multi, place, category and code', v);
    // Codice Multi → client
    await edNew();
    await p.focus('#ed-multi_code'); await p.keyboard.type('M-208'); await p.waitForTimeout(120); await p.keyboard.press('Enter'); await p.waitForTimeout(120);
    v = await p.evaluate(() => [UI.ed.d.multi_code, UI.ed.d.company_name, UI.ed.d.company_city]);
    ok(v.join('|') === 'M-20871|Rossi Costruzioni S.p.A.|Fidenza (PR)', 'choosing a known Codice Multi fills the client', v);
    // 3. multi-value tags: suggestions for the current token, present tokens excluded
    await p.fill('#ed-tags', ''); await p.keyboard.type('iva,fat'); await p.waitForTimeout(120);
    v = await taState();
    ok(v.opts.includes('fatture') && !v.opts.includes('iva'), 'tags: suggestions apply to the current token', v);
    await p.keyboard.press('Enter'); await p.waitForTimeout(120);
    v = await p.evaluate(() => ({val:$('#ed-tags').value, d:UI.ed.d.tags, opts:$$('#ta-pop .ta-v').map(x => x.textContent), open:!$('#ta-pop').hidden}));
    ok(v.val === 'iva,fatture,' && v.d === 'iva,fatture,' && v.open && !v.opts.includes('iva') && !v.opts.includes('fatture') && !v.opts.includes('demo'), 'tags: pick appends the token and keeps suggesting the others (never "demo")', v);
    // 4. duplicate company spelling → existing spelling on blur
    await p.fill('#ed-company_name', ''); await p.keyboard.type('ROSSI  costruzioni spa'); await p.waitForTimeout(100);
    ok(await p.evaluate(() => $('#ed-company-note').textContent.includes('Rossi Costruzioni S.p.A.')), 'same company typed differently: note shows the existing spelling');
    await p.evaluate(() => taClose()); await p.focus('#ed-binder_title'); await p.waitForTimeout(100);
    v = await p.evaluate(() => [UI.ed.d.company_name, $('#ed-company_name').value, $('#ed-company-note').classList.contains('norm')]);
    ok(v[0] === 'Rossi Costruzioni S.p.A.' && v[1] === v[0] && v[2], 'company spelling normalised on blur', v);
    // 5. duplicate speaking code: inline message + one-click fix
    await p.fill('#ed-speaking_code', 'BL1'); await p.waitForTimeout(80);
    const nextBL = await p.evaluate(() => edNextFreeCode('BL1'));
    v = await p.evaluate(() => ({t:$('#err-speaking_code').textContent, btn:!!$('#err-speaking_code [data-a="ed-code-fix"]'), save:!!validateEditor(true).speaking_code}));
    ok(v.t.startsWith('Codice già presente: usa ' + nextBL) && v.btn && v.save && /^BL\d+$/.test(nextBL) && nextBL !== 'BL1', 'duplicate speaking code: "Codice già presente: usa BLn" and saving blocked', [v, nextBL]);
    await p.click('#err-speaking_code [data-a="ed-code-fix"]'); await p.waitForTimeout(80);
    v = await p.evaluate(() => [UI.ed.d.speaking_code, $('#ed-speaking_code').value, $('#err-speaking_code').textContent, validateEditor(true).speaking_code || '']);
    ok(v[0] === nextBL && v[1] === nextBL && !v[2] && !v[3], 'one-click fix uses the next free number', v);
    // 6. quick position
    v = await p.evaluate(() => [['A1-β-SX', 'A|1|β|SX'], ['b2 3', 'B|2|3|'], ['Ufficio 1 · 2-α', 'Ufficio 1|2|α|'], ['a-1-beta dx', 'A|1|β|DX'], ['A1β', 'A|1|β|'], ['  C3   γ  ', 'C|3|γ|'], ['Archivio 4 2', 'Archivio|4|2|']]
      .map(([s, exp]) => { const r = parseQuickLocation(s); const got = [r.room_code, r.cabinet_code, r.shelf_code, r.sector_code].join('|'); return got === exp ? '' : s + ' → ' + got; }).filter(Boolean).concat(parseQuickLocation('') === null ? [] : ['empty']));
    ok(!v.length, 'quick position parses A1-β-SX, b2 3, "Ufficio 1 · 2-α", a-1-beta dx, A1β…', v);
    await p.evaluate(() => { S.binders.push(normalizeBinder({speaking_code:'QLR1', company_name:'Room Name Test', room_code:'Sala Riunioni', cabinet_code:'2', shelf_code:'α', short_code:newShortCode()})); });
    v = await p.evaluate(() => { const r = parseQuickLocation('sala riunioni 3 β'); return [r.room_code, r.cabinet_code, r.shelf_code].join('|'); });
    ok(v === 'Sala Riunioni|3|β', 'quick position recognises a known room name typed without "·"', v);
    await p.evaluate(() => { S.binders = S.binders.filter(b => b.speaking_code !== 'QLR1'); });
    await p.fill('#ed-quickloc', 'c3 γ sx'); await p.waitForTimeout(150);
    v = await p.evaluate(() => { const d = UI.ed.d; return {d:[d.room_code, d.cabinet_code, d.shelf_code, d.sector_code].join('|'), room:$('#ed-room_code').value, sec:$('#ed-sector_code').value, loc:$('#ed-loc').textContent, parts:$('#ed-loc-parts').textContent}; });
    ok(v.d === 'C|3|γ|SX' && v.room === 'C' && v.sec === 'SX' && v.loc === 'C3-γ-SX' && v.parts.includes('Armadio3'), 'typing the quick position fills Stanza/Armadio/Ripiano/Settore live', v);
    await p.evaluate(() => taClose()); await p.focus('#ed-binder_title'); await p.waitForTimeout(60);
    ok(await p.evaluate(() => $('#ed-quickloc').value === 'C3-γ-SX'), 'quick position shows the normalised code after leaving the field');
    v = await p.evaluate(() => { const c = $('#ed-loc-chips [data-a="ed-loc-chip"]'); if (!c) return null; const l = c.dataset.l; c.click(); return [l, computeLocation(UI.ed.d), $('#ed-quickloc').value, $$('#ed-loc-chips .ed-chip').length]; });
    ok(v && v[0] === v[1] && v[2] === v[0] && v[3] >= 1 && v[3] <= 4, 'recent/most used position chips fill the position in one click', v);
    v = await p.evaluate(() => { const det = $('#ed-locdet'); const was = det.open; det.open = true; return {was, field:!!det.querySelector('#ed-room_code') && !!det.querySelector('#ed-shelf-tools')}; });
    await p.waitForTimeout(80);
    ok(v.field && await p.evaluate(() => S.settings.edLocOpen === true), 'detailed position fields live under "Dettagli posizione" (open state remembered)', v);
    await p.evaluate(() => { $('#ed-locdet').open = false; }); await p.waitForTimeout(60);
    // 7. contents status + line mode
    await p.evaluate(() => { UI.ed.d.contents_items = [{year:'2025', description:'Fatture acquisto', status:'archive'}, {year:'2024', description:'Bilancio', status:'archive'}]; renderEdContents(); });
    v = await p.evaluate(() => { const s = $$('#ed-contents [data-cist]'); s[1].value = 'client'; s[1].dispatchEvent(new Event('change', {bubbles:true})); return {st:UI.ed.d.contents_items.map(i => i.status).join(','), cls:$$('#ed-contents .ci-row')[1].className, sum:$('#ed-ci-sum').textContent, opts:$$('option', s[0]).map(o => o.textContent).join('/')}; });
    ok(v.st === 'archive,client' && v.cls.includes('st-client') && v.sum.includes('1 al cliente') && v.opts === 'In archivio/In uso/Al cliente', 'contents row status control (in archivio / in uso / al cliente)', v);
    await p.click('[data-a="ed-lines"]'); await p.waitForTimeout(80);
    v = await p.evaluate(() => ({val:$('#ed-lines').value, ok:!!$('[data-a="ed-lines-ok"]'), cancel:!!$('[data-a="ed-lines-cancel"]'), hint:$('#ed-contents .hint').textContent, btnHidden:$('#ed-lines-btn').classList.contains('hidden')}));
    ok(v.val === '2025: Fatture acquisto\n2024: Bilancio [cliente]' && v.ok && v.cancel && v.hint.includes('[cliente]') && v.btnHidden, '"Una riga per voce": textarea with hint, Conferma and Annulla', v);
    await p.fill('#ed-lines', 'scrap'); await p.click('[data-a="ed-lines-cancel"]'); await p.waitForTimeout(80);
    v = await p.evaluate(() => ({n:$$('#ed-contents .ci-row').length, pipe:contentsToPipe(UI.ed.d.contents_items)}));
    ok(v.n === 2 && v.pipe === '2025: Fatture acquisto|2024: Bilancio [cliente]', 'Annulla leaves the rows unchanged', v);
    await p.click('[data-a="ed-lines"]'); await p.waitForTimeout(60);
    await p.fill('#ed-lines', '2025: Fatture acquisto\n2024: Bilancio [cliente]\n2025: F24 [in uso]\nNuova voce'); await p.click('[data-a="ed-lines-ok"]'); await p.waitForTimeout(80);
    v = await p.evaluate(() => ({rows:$$('#ed-contents .ci-row').length, st:UI.ed.d.contents_items.map(i => i.status).join(','), pipe:UI.ed.pipeMode}));
    ok(v.rows === 4 && v.st === 'archive,client,in_use,archive' && v.pipe === false, 'Conferma converts lines back into rows and keeps statuses', v);
    // 8. contacts / notes, save, register offer
    await p.fill('#ed-company_name', 'Stato Prova Srl'); await p.evaluate(() => taClose());
    await p.fill('#ed-speaking_code', 'SPZ1');
    await p.fill('#ed-contacts', 'Giulia Verdi'); await p.evaluate(() => taClose());
    await p.fill('#ed-notes', 'Documento uscito il 12/03');
    await p.evaluate(() => { $('#ed-tags').value = 'prova, prova,  stato,'; $('#ed-tags').dispatchEvent(new Event('input', {bubbles:true})); });
    await p.click('.overlay .modal-f .btn-primary'); await p.waitForTimeout(250);
    v = await p.evaluate(() => { const b = S.binders.find(x => x.speaking_code === 'SPZ1'); return b && {c:b.contacts, n:b.notes, tags:b.tags, st:b.contents_items.map(i => i.status).join(','), ed:!!UI.ed, toast:[...document.querySelectorAll('.toast')].map(x => x.textContent).join(' ¦ ')}; });
    ok(v && v.c === 'Giulia Verdi' && v.n === 'Documento uscito il 12/03' && v.tags === 'prova,stato' && v.st === 'archive,client,in_use,archive' && !v.ed, 'binder saved with contacts, notes, tidy tags and item statuses', v);
    ok(v && v.toast.includes('non è nell\'anagrafica'), 'saving a company missing from the register offers to add it', v && v.toast);
    await p.evaluate(() => { const b = [...document.querySelectorAll('.toast-act')].find(x => x.textContent === t('ed_reg_add')); b && b.click(); }); await p.waitForTimeout(100);
    v = await p.evaluate(() => (S.clients.find(c => c.name === 'Stato Prova Srl') || {}).name);
    ok(v === 'Stato Prova Srl', 'one click adds the company to the client register', v);
    v = await p.evaluate(() => { UI.q = 'giulia'; const a = filteredBinders().map(b => b.speaking_code); UI.q = 'uscito 12/03'; const n = filteredBinders().map(b => b.speaking_code); UI.q = ''; return [a.join(','), n.join(',')]; });
    ok(v[0] === 'SPZ1' && v[1] === 'SPZ1', 'contacts and notes are searchable in the archive', v);
    ok(await p.evaluate(() => { S.view = 'archive'; renderAll(); const r = [...document.querySelectorAll('#arch-results tr')].find(tr => tr.textContent.includes('SPZ1')); return !!r && r.textContent.includes('1 al cliente') && r.textContent.includes('1 in uso'); }), 'archive row summarises items not in the archive');
    // 9. persistence: CSV, JSON, SQLite
    v = await p.evaluate(() => { const b = S.binders.find(x => x.speaking_code === 'SPZ1'); const row = binderToCsvRow(b); const i = (k) => CSV_COLUMNS.indexOf(k); return {len:row.length, cols:CSV_COLUMNS.length, order:CSV_COLUMNS.slice(i('shelf_color'), i('shelf_color') + 4).join(','), c:row[i('contacts')], n:row[i('notes')], cnt:row[i('contents')]}; });
    ok(v.len === v.cols && v.order === 'shelf_color,contacts,notes,selected_for_print' && v.c === 'Giulia Verdi' && v.n === 'Documento uscito il 12/03' && v.cnt === '2025: Fatture acquisto|2024: Bilancio [cliente]|2025: F24 [in uso]|Nuova voce', 'CSV: contacts/notes columns after shelf_color, status suffix in contents', v);
    v = await p.evaluate(() => { const csv = toCSV([CSV_COLUMNS].concat([binderToCsvRow(S.binders.find(x => x.speaking_code === 'SPZ1')).map(safeCell)]), ';'); analyzeImport(csv); const r = UI.importParsed.rows[0].p; UI.importParsed = null; return {c:r.contacts, n:r.notes, st:r.contents_items.map(i => i.status).join(','), d:r.contents_items.map(i => i.description).join(',')}; });
    ok(v.c === 'Giulia Verdi' && v.n === 'Documento uscito il 12/03' && v.st === 'archive,client,in_use,archive' && v.d === 'Fatture acquisto,Bilancio,F24,Nuova voce', 'CSV round trip keeps contacts, notes and item statuses', v);
    v = await p.evaluate(() => { analyzeImport('cliente;contatti;note;contenuti\nZeta Srl;Anna Neri;Uscito;2025: A [al cliente]|2024: B [in use]|C [archivio]'); const r = UI.importParsed.rows[0].p; UI.importParsed = null; return [r.contacts, r.notes, r.contents_items.map(i => i.status + ':' + i.description).join(',')]; });
    ok(v.join('|') === 'Anna Neri|Uscito|client:A,in_use:B,archive:C', 'Italian headers contatti/note and status suffix variants', v);
    v = await p.evaluate(() => { const W = JSON.parse(workspaceJSON()); const b = W.binders.find(x => x.speaking_code === 'SPZ1'); const back = normalizeBinder(b); return {st:b.contents_items.map(i => i.status).join(','), c:b.contacts, back:back.contents_items.map(i => i.status).join(','), n:back.notes}; });
    ok(v.st === 'archive,client,in_use,archive' && v.c === 'Giulia Verdi' && v.back === v.st && v.n === 'Documento uscito il 12/03', 'JSON workspace keeps status per item, contacts and notes', v);
    v = await p.evaluate(async () => { dbSyncFromState('t'); const d2 = new DB.SQL.Database(DB.db.export()); const W = dbReadWorkspace(d2); const cols = dbQuery('PRAGMA table_info(contents_items)', null, d2).map(r => r.name); const bcols = dbQuery('PRAGMA table_info(binders)', null, d2).map(r => r.name); const n = dbScalar("SELECT COUNT(*) FROM contents_items WHERE status = 'client'", null, d2); d2.close(); const b = W.binders.find(x => x.speaking_code === 'SPZ1'); return {cols:cols.includes('status'), bcols:bcols.includes('contacts') && bcols.includes('notes'), n, st:b.contents_items.map(i => i.status).join(','), c:b.contacts, no:b.notes}; });
    ok(v.cols && v.bcols && v.n >= 1 && v.st === 'archive,client,in_use,archive' && v.c === 'Giulia Verdi' && v.no === 'Documento uscito il 12/03', 'SQLite: contents_items.status + binders.contacts/notes round trip', v);
    v = await p.evaluate(() => { const d = new DB.SQL.Database(); d.exec('CREATE TABLE binders(id TEXT PRIMARY KEY, speaking_code TEXT NOT NULL UNIQUE, company_name TEXT); CREATE TABLE contents_items(id INTEGER PRIMARY KEY AUTOINCREMENT, binder_id TEXT, position INTEGER, year TEXT, description TEXT); CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT); CREATE TABLE label_presets(id TEXT PRIMARY KEY, name TEXT, geometry_json TEXT)'); d.exec("INSERT INTO binders VALUES ('x1','OLD1','Old'); INSERT INTO contents_items(binder_id,position,year,description) VALUES ('x1',0,'2020','Vecchio')"); const before = dbReadWorkspace(d).binders[0].contents_items[0].status; dbMigrate(d); const c = dbQuery('PRAGMA table_info(contents_items)', null, d).some(r => r.name === 'status') && dbQuery('PRAGMA table_info(binders)', null, d).some(r => r.name === 'notes'); d.close(); return {before, c}; });
    ok(v.before === 'archive' && v.c, 'old .sqlite without status/contacts/notes: readable and migrated', v);
    // 10. printing: contacts/notes off by default, printed when toggled; marker for items away
    v = await p.evaluate(() => { const b = S.binders.find(x => x.speaking_code === 'SPZ1'); S.print.fields = {}; const g = {w:74, h:105, radius:0}; const off = renderLabel('S', b, g, S.print); S.print.fields = {contacts:true, notes:true}; const on = renderLabel('S', b, g, S.print); S.print.fields = {contacts:true, empty:true}; const empty = renderLabel('S', Object.assign({}, b, {contacts:''}), g, S.print); S.print.fields = {}; return {off:off.includes('Giulia Verdi') || off.includes('uscito il'), on:on.includes('Giulia Verdi') && on.includes('Documento uscito il 12/03'), empty:empty.includes('Contatti:'), mark:off.includes('↗ cliente') && off.includes('↗ in uso'), defs:DEFAULT_FIELDS.contacts === false && DEFAULT_FIELDS.notes === false}; });
    ok(!v.off && v.on && v.empty && v.mark && v.defs, 'label: contacts/notes not printed by default, printed when toggled (empty placeholder too); subtle ↗ marker for items away', v);
    v = await p.evaluate(() => { S.view = 'print'; renderAll(); const c = $('[data-fld="contacts"]'), n = $('[data-fld="notes"]'); const r = {c:!!c && !c.checked, n:!!n && !n.checked}; S.view = 'archive'; renderAll(); return r; });
    ok(v.c && v.n, '"Campi da stampare" has Contacts and Notes toggles, off by default', v);
    // 11. AI prompt: 22 columns; headerless 22-field rows
    v = await p.evaluate(() => { const pr = buildAIPrompt(true); const hdr = csvTemplateHeader().split(';'); const rows = pr.split('\n').filter(l => /^(BL4|VR1);/.test(l)); return {n:hdr.length, last:hdr.slice(-2).join(','), rule:pr.includes('exactly 22 fields (21 semicolons)'), rows:rows.map(r => r.split(';').length), st:pr.includes('[cliente]')}; });
    ok(v.n === 22 && v.last === 'contacts,notes' && v.rule && v.rows.length === 2 && v.rows.every(x => x === 22) && v.st, 'AI prompt: 22 columns ending with contacts;notes, examples have 22 fields', v);
    v = await p.evaluate(() => { analyzeImport('BX9;M-9;Bix Srl;Ordinaria;Bilancio;A;1;α;;A1-α;CURRENT;2025: Doc [cliente];iva;#2563EB;;;;Parma (PR);2025;Prot. 9;Anna Neri;Nota x'); const r = UI.importParsed.rows[0].p; analyzeImport('BX8;M-8;Bax Srl;Ordinaria;Bilancio;A;1;α;;A1-α;CURRENT;2025: Doc;iva;#2563EB;;;;Parma (PR);2025;Prot. 8'); const r20 = UI.importParsed.rows[0].p; UI.importParsed = null; return [r.contacts, r.notes, r.extra_codes, r.contents_items[0].status, r20.extra_codes, r20.contacts || ''].join('|'); });
    ok(v === 'Anna Neri|Nota x|Prot. 9|client|Prot. 8|', 'headerless 22-field rows import contacts/notes; 20-field rows still work', v);
    // cleanup: leave the shared state as found
    await p.evaluate(() => { while (topModal()) closeModal(true); S.binders = S.binders.filter(b => b.speaking_code !== 'SPZ1'); S.clients = S.clients.filter(c => c.name !== 'Stato Prova Srl'); delete S.settings.edLocOpen; S.print.fields = {}; commit(); S.view = 'archive'; renderAll(); });
  }

  // ----------------------------------------------------------------------

  // ===== v8 stream C (Excel import + column mapping) =====
  // @@STREAM-C@@
  sec('v8 C: Excel import + column mapping');
  require('child_process').execFileSync('python3', [__dirname + '/fixtures/make_xlsx.py', __dirname + '/shots']);
  await p.evaluate(() => { UI.importParsed = null; UI.imap = null; S.lang = 'it'; S.view = 'import'; renderAll(); });
  // raw OOXML reader: stored + deflated entries, empty first sheet, inline/rich/formula strings, styles, gaps
  await p.setInputFiles('#file-import', 'shots/stream_c_raw.xlsx'); await p.waitForTimeout(700);
  v = await p.evaluate(() => ({sheet:UI.imap.sheet, names:UI.imap.sheets.map(s => s.name).join('|'), rows:UI.imap.sheets[1].rows, hr:UI.imap.headerRow}));
  ok(v.sheet === 1 && v.names === 'Vuoto|Dati & prove' && v.hr === 0, 'xlsx: sheets listed, first non-empty sheet preselected, header row found', v);
  ok(JSON.stringify(v.rows) === JSON.stringify([['cliente','codice','','note'],[],['Rich Text  Srl','007','43037','riga1\nriga2'],['Formula Srl','2024-03-15','0.3',''],['  spazi  ','2023-12-31','12.5%','TRUE','','2024-03-15'],['Über; "Q"','123456789012345670000','-12.5']]),
    'xlsx reader: rich text without phonetic runs, inner spaces kept, "000" format → 007, no float artefacts, dates (custom, built-in, Italian long) → YYYY-MM-DD, %, booleans, errors empty, gaps filled, _x000D_ unescaped', v.rows);
  // client register like the studio's file (title row above the header, Dave's columns)
  await p.setInputFiles('#file-import', 'shots/stream_c_clienti_faldoni.xlsx'); await p.waitForTimeout(700);
  v = await p.evaluate(() => ({t:UI.imap.target, hr:UI.imap.headerRow, f:UI.imap.fields.join(','), row:UI.imap.sheets[0].rows[3], n:document.querySelectorAll('#imap .imap-row[data-col]').length, sheets:document.querySelectorAll('#imap-sheet option').length, open:UI.imap.open, ip:UI.importParsed}));
  ok(v.t === 'clients' && v.hr === 2 && v.f === 'type,multi_code,name,address,notes,cap,city,province,category,' && v.open && v.ip === null, 'client sheet: header under a title row detected, register target and TIPO/Ditta/Ragione_soc/… mapping guessed, unknown date column ignored', v);
  ok(JSON.stringify(v.row) === JSON.stringify(['ENC','007','APS L\'ÀNCORA "Blu"; sede àèìòù','VIA ROMA 1;\nINT. 2 "B"','E547','43037',"LESIGNANO DE' BAGNI",'PR','APS','2024-03-15']), 'xlsx cells exact: leading zeros, apostrophes, quotes, semicolons, line break, accents, numeric CAP, date', v.row);
  ok(v.n === 10 && v.sheets === 2, 'mapping screen: one row per column, sheet picker for 2 sheets', v);
  v = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  ok(v[0] <= v[1] + 1, 'mapping screen: no horizontal scroll at 1366', v);
  await p.evaluate(() => $('#imap').scrollIntoView()); await p.screenshot({path:'shots/c_map_clients.png'});
  await p.setViewportSize({width:390, height:800}); await p.waitForTimeout(200);
  v = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  ok(v[0] <= v[1] + 1, 'mapping screen: no horizontal scroll at phone width', v);
  await p.screenshot({path:'shots/c_map_phone.png'});
  await p.setViewportSize({width:1366, height:768}); await p.waitForTimeout(200);
  await p.click('[data-a="imap-confirm"]'); await p.waitForTimeout(300);
  v = await p.evaluate(() => { const C = UI.importParsed.clients; return {st:C.map(r => r.status).join(','), c:C.map(r => r.c), place:clientPlace(C[0].c), saved:Object.keys(S.settings.importMappings || {}).length, bar:!!document.querySelector('.imap-bar [data-a="imap-edit"]')}; });
  ok(v.st === 'new,new,new' && v.c[0].multi_code === '007' && v.c[0].name === 'APS L\'ÀNCORA "Blu"; sede àèìòù' && v.c[0].address === 'VIA ROMA 1; INT. 2 "B"' && v.c[0].cap === '43037' && v.place === "LESIGNANO DE' BAGNI (PR)" && v.c[0].notes === 'Cod. comune E547' && v.c[0].category === 'APS' && v.c[1].multi_code === '116' && v.c[2].multi_code === '0042' && v.c[2].name === 'CIRCOLO VERDE ODV',
    'confirm → client preview with exact values (non-breaking space normalised)', v);
  ok(v.saved >= 1 && v.bar, 'mapping remembered in S.settings.importMappings, preview offers "Modifica abbinamento colonne"', v);
  await p.click('[data-a="cl-apply"]'); await p.waitForTimeout(300);
  v = await p.evaluate(() => ({view:S.view, n:S.clients.length, c:S.clients.find(c => c.multi_code === '007')}));
  ok(v.view === 'info' && v.n === 6 && v.c && v.c.name === 'APS L\'ÀNCORA "Blu"; sede àèìòù', 'client import via xlsx adds the clients to the register', v);
  // re-import the same file: remembered mapping, one click; change a mapping → different result
  await p.evaluate(() => { S.view = 'import'; renderAll(); });
  await p.setInputFiles('#file-import', 'shots/stream_c_clienti_faldoni.xlsx'); await p.waitForTimeout(700);
  v = await p.evaluate(() => ({rem:UI.imap.remembered, how:UI.imap.how.filter(Boolean).every(h => h === 'saved'), info:!!document.querySelector('.imap-info.saved')}));
  ok(v.rem && v.how && v.info, 'same columns again: remembered mapping reapplied', v);
  await p.selectOption('[data-imap-col="4"]', ''); await p.waitForTimeout(100);
  await p.selectOption('[data-imap-col="9"]', 'notes'); await p.waitForTimeout(100);
  v = await p.evaluate(() => ({f:UI.imap.fields[4] + '|' + UI.imap.fields[9], how:UI.imap.how[9], off:document.querySelector('.imap-row[data-col="4"]').classList.contains('off')}));
  ok(v.f === '|notes' && v.how === 'user' && v.off, 'changing a select updates the mapping (ignored column greyed out)', v);
  await p.click('[data-a="imap-confirm"]'); await p.waitForTimeout(300);
  v = await p.evaluate(() => UI.importParsed.clients.map(r => r.status + ':' + r.c.notes).join(','));
  ok(v === 'upd:2024-03-15,upd:2023-12-31,upd:', 'changed mapping changes the result (date column → notes, re-import updates)', v);
  await p.click('[data-a="imap-edit"]'); await p.waitForTimeout(200);
  await p.click('[data-a="imap-target"][data-v="binders"]'); await p.waitForTimeout(200);
  v = await p.evaluate(() => ({t:UI.imap.target, f:UI.imap.fields, opts:[...document.querySelectorAll('[data-imap-col="0"] option')].map(o => o.value)}));
  ok(v.t === 'binders' && v.f[2] === 'company_name' && v.f[6] === 'company_city' && v.opts.includes('binder_title') && v.opts.includes('contents_items') && v.opts.includes(''), 'switching target to binders re-maps with binder fields (data-driven list)', v);
  // binder sheet: Italian headers in another order, unknown column, guesses from values
  await p.selectOption('#imap-sheet', '1'); await p.waitForTimeout(200);
  v = await p.evaluate(() => ({t:UI.imap.target, f:UI.imap.fields.join(','), how:UI.imap.how.join(',')}));
  ok(v.t === 'binders' && v.f === 'binder_title,company_name,,contents_items,ref_year,color_hex,short_code,room_code,cabinet_code,shelf_code,multi_code' && v.how === 'exact,fuzzy,,fuzzy,exact,value,value,exact,exact,exact,exact', 'binder sheet: exact, similar-name and value-based guesses (#RRGGBB → colour, dm26 → short code), "Peso kg" ignored', v);
  await p.evaluate(() => $('#imap').scrollIntoView()); await p.screenshot({path:'shots/c_map_binders.png'});
  await p.selectOption('[data-imap-col="4"]', ''); await p.click('[data-a="imap-confirm"]'); await p.waitForTimeout(200);
  const y1 = await p.evaluate(() => UI.importParsed.rows[0].p.ref_year || '');
  await p.click('[data-a="imap-edit"]'); await p.selectOption('[data-imap-col="4"]', 'ref_year'); await p.click('[data-a="imap-confirm"]'); await p.waitForTimeout(200);
  v = await p.evaluate(() => UI.importParsed.rows.map(r => [r.status, r.p.ref_year, r.p.contents_items.length].join(':')).join(','));
  ok(y1 === '' && v === 'new:2024:3,new:2023:1', 'ignoring / re-mapping a column changes the preview', [y1, v]);
  await p.screenshot({path:'shots/c_preview.png'});
  await p.click('[data-a="im-merge"]'); await p.waitForTimeout(400);
  const xb = () => p.evaluate(() => { const b = S.binders.find(x => x.short_code === 'dm26Abc234Xy'); return b && {co:b.company_name, ti:b.binder_title, c:b.contents_items.map(i => (i.year ? i.year + ': ' : '') + i.description), m:b.multi_code, loc:b.location_code, col:b.color_hex, y:b.ref_year}; });
  v = await xb();
  ok(v && v.co === 'L\'Officina "Due"; S.r.l. àèìòù' && v.ti === 'Fatture e IVA' && v.c.join('|') === '2024: Fatture acquisto|2024: F24|Liquidazioni' && v.m === '007' && v.loc === 'Ufficio 1 · 2-β' && v.col === '#2563EB' && v.y === '2024', 'binder import via xlsx: binders created, line breaks and pipes → contents items, special characters exact', v);
  // special characters survive the full CSV backup → re-import
  await p.evaluate(() => { S.view = 'export'; renderAll(); });
  const cF = await dl('[data-a="ex-csv"]');
  v = await p.evaluate((txt) => { analyzeImport(txt); const r = UI.importParsed.rows.find(x => x.p.short_code === 'dm26Abc234Xy'); applyImport('merge'); return r && {s:r.status, co:r.p.company_name, c:contentsToPipe(r.p.contents_items)}; }, fs.readFileSync(cF, 'utf8'));
  const v2 = await xb();
  ok(v && v.s === 'upd' && v.co === 'L\'Officina "Due"; S.r.l. àèìòù' && v.c === '2024: Fatture acquisto|2024: F24|Liquidazioni' && JSON.stringify(v2.c) === JSON.stringify(['2024: Fatture acquisto','2024: F24','Liquidazioni']) && v2.co === v.co, 'special characters preserved through CSV export → re-import', [v, v2]);
  // DocMap's own CSV (standard header) skips the mapping but can be re-mapped
  await p.evaluate(() => { S.view = 'import'; renderAll(); });
  await p.setInputFiles('#file-import', cF); await p.waitForTimeout(500);
  v = await p.evaluate(() => ({rows:!!(UI.importParsed && UI.importParsed.rows), std:UI.imap && UI.imap.standard, open:UI.imap && UI.imap.open, link:!!document.querySelector('.imap-bar [data-a="imap-edit"]')}));
  ok(v.rows && v.std && !v.open && v.link, 'standard DocMap CSV: straight to the preview with a "Modifica abbinamento colonne" link', v);
  await p.click('.imap-bar [data-a="imap-edit"]'); await p.waitForTimeout(200);
  v = await p.evaluate(() => ({open:!!document.querySelector('#imap'), how:UI.imap.how.filter(Boolean).length, n:UI.imap.fields.length, sc:UI.imap.fields.includes('short_code') && UI.imap.fields.includes('contents_items')}));
  ok(v.open && v.how === v.n && v.sc, 'edit link opens the mapping with every standard column recognised', v);
  await p.click('[data-a="imap-cancel"]'); await p.waitForTimeout(150);
  // text pasted from Excel (tab separated, quoted multi-line cell) and the client CSV pasted
  v = await p.evaluate(() => { imapAnalyzeText('Ragione sociale\tTitolo\tContenuti\n"Neri & C.; s.a.s."\tIVA\t"2024: A\n2025: B"\n'); const a = {open:UI.imap.open, t:UI.imap.target, f:UI.imap.fields.join(',')}; imapConfirm(); const r = UI.importParsed.rows[0].p; return Object.assign(a, {co:r.company_name, n:r.contents_items.length}); });
  ok(v.open && v.t === 'binders' && v.f === 'company_name,binder_title,contents_items' && v.co === 'Neri & C.; s.a.s.' && v.n === 2, 'pasted Excel cells (TSV) go through the mapping; multi-line cell → 2 contents items', v);
  await p.fill('#im-text', fs.readFileSync(__dirname + '/fixtures/clienti_esempio.csv', 'utf8')); await p.click('[data-a="im-analyze"]'); await p.waitForTimeout(200);
  v = await p.evaluate(() => ({open:UI.imap.open, t:UI.imap.target, vis:!!document.querySelector('#imap')}));
  ok(v.open && v.t === 'clients' && v.vis, 'pasted client CSV opens the mapping as client register', v);
  v = await p.evaluate(() => { imapAnalyzeText('[{"speaking_code":"JQ1","company_name":"Json Q","contents_items":[{"year":"2025","description":"Doc"}]}]'); return {rows:UI.importParsed.rows.length, kind:UI.imap && UI.imap.kind, open:UI.imap && UI.imap.open, c:UI.imap && UI.imap.sheets[0].rows[1][2]}; });
  ok(v.rows === 1 && v.kind === 'json' && v.open === false && v.c === '2025: Doc', 'JSON skips the mapping (map 1:1) but can still be re-mapped', v);
  // .xls → clear message
  await p.setInputFiles('#file-import', 'shots/stream_c_old.xls'); await p.waitForTimeout(400);
  v = await p.evaluate(() => ({e:UI.importParsed && UI.importParsed.error, box:(document.querySelector('#im-preview .danger-box') || {}).textContent || ''}));
  ok(/\.xlsx/.test(v.e) && /CSV/.test(v.e) && v.box.includes('.xls'), '.xls gives a clear "save as .xlsx or CSV" message', v);
  // English + help
  await p.evaluate(() => { S.lang = 'en'; imapAnalyzeText('Ragione sociale;Titolo\nX;Y'); renderAll(); });
  v = await p.evaluate(() => ({h:(document.querySelector('#imap h2') || {}).textContent, help:!!helpTopic('excel'), accept:$('#file-import').accept}));
  ok(/Match the columns/.test(v.h) && v.help && v.accept.includes('.xlsx'), 'English mapping screen, Excel help topic, .xlsx accepted by the file picker', v);
  await p.evaluate(() => { S.lang = 'it'; UI.imap = null; UI.importParsed = null; UI.importText = ''; S.view = 'archive'; renderAll(); });

  // @@STREAM-T@@
  sec('v9 stream T: info label template, template registry, edge compensation');
  await p.evaluate(() => { window.__Tprint = clone(S.print); window.__TusedSlots = clone(S.usedSlots); window.__Tsel = S.binders.filter(b => b.selected_for_print).map(b => b.id);
    S.binders.forEach(b => b.selected_for_print = false);
    const mk = (o) => normalizeBinder(Object.assign({selected_for_print:true, color_hex:'#DC2626'}, o));
    S.binders = S.binders.concat([
      mk({speaking_code:'TAPS1', multi_code:'10877', company_name:'ASSOCIAZIONE DI PROMOZIONE SOCIALE CIRCOLO RICREATIVO CULTURALE SAN PANCRAZIO PARMENSE', company_city:'San Pancrazio (PR)', category:'APS', binder_title:'Rendiconto', ref_year:'2025', room_code:'A', cabinet_code:'3', shelf_code:'2', contents_items:'2025: Prima nota|2025: Rendiconto per cassa|2024: Verbali', tags:'aps,ets', short_code:'dm26TapsAbCd'}),
      mk({speaking_code:'TNM1', company_name:'Neri Mario', category:'Semplificata', contents_items:'2025: 730', tags:'730', short_code:'dm26TnmXyZab'}),
      mk({speaking_code:'TBL1', multi_code:'M-55501', company_name:'Barbieri-Lanfranchi Costruzioni Edili S.r.l.', category:'Ordinaria', contents_items:'2025: A|2025: B|2025: C', short_code:'dm26TblQwErt'}),
      mk({speaking_code:'TFS1', multi_code:'9', company_name:'Farmacia San Giorgio', category:'Ordinaria', short_code:'dm26TfsHjKmn'})]);
    ensureIntegrity(); commit();
    S.print.presetId = 'mrink143'; S.print.geometry = geoFromPreset(findPreset('mrink143')); S.print.geometryModified = false; S.print.contentMode = 'info'; S.print.info = {items:2, pair:false};
    S.print.qrMode = 'live'; S.print.fields = {}; S.print.split = {ratio:0.5, rotate:-90, guides:true}; S.print.edge = {outer:4, cut:1, byPreset:{}}; S.print.copies = 1; S.print.padding = 4; S.print.offsetX = 0; S.print.offsetY = 0; S.usedSlots = {}; });
  // migration + defaults
  v = await p.evaluate(() => { const d = defaultState(); const old = (pr, m, sc) => migrate(Object.assign(defaultState(), {schema:sc, print:Object.assign(defaultState().print, {presetId:pr, geometry:geoFromPreset(findPreset(pr)), contentMode:m})})).print.contentMode;
    return {d:d.print.contentMode, ds:d.schema, info:JSON.stringify(d.print.info), edge:d.print.edge.outer + '/' + d.print.edge.cut, m1:old('mrink143', 'split', 26.8), m2:old('mrink143', 'split', 26.9), m3:old('l7160', 'split', 26.8), m4:old('mrink143', 'pair', 26.8), sch:migrate(defaultState()).schema}; });
  ok(v.d === 'info' && v.ds === 26.9 && v.info === '{"items":2,"pair":false}' && v.edge === '4/1' && v.sch === 26.9, 'v9 defaults: info label, items 2, pair off, edge 4/1 mm, schema 26.9', v);
  ok(v.m1 === 'info' && v.m2 === 'split' && v.m3 === 'split' && v.m4 === 'pair', 'migration < 26.9 switches MRINK143 + classic to the info label once; later choices and other sheets kept', v);
  // registry
  v = await p.evaluate(() => ({ids:LABEL_TEMPLATES.map(x => x.id).join(), k:['info','split','pair','a','b','u','qr','zz'].map(m => modeKinds(m).join('')).join(','), kp:modeKinds('info', Object.assign({}, S.print, {info:{pair:true}})).join(''), rec:tplRecommended(labelTemplate('info'), 'mrink143') && !tplRecommended(labelTemplate('split'), 'mrink143')}));
  ok(v.ids === 'info,split,pair,a,b,u,qr' && v.k === 'I,S,AB,A,B,U,Q,U' && v.kp === 'IC' && v.rec, 'template registry drives modeKinds (all old modes kept, unknown → U, pair flag → I+C)', v);
  // classic label unchanged when edge compensation is off
  v = await p.evaluate(() => { const b = S.binders.find(x => x.speaking_code === 'TBL1'), g = S.print.geometry;
    S.print.edge = {outer:4, cut:1, byPreset:{mrink143:false}}; const off = renderSlotLabel('S', b, g, S.print), ref = renderLabel('S', b, frameGeo(g), S.print);
    S.print.edge = {outer:4, cut:1, byPreset:{}}; const on = renderSlotLabel('S', b, g, S.print);
    return {same:off === '<div class="lab-turn" style="position:absolute;left:0;top:0;width:74mm;height:105mm;transform-origin:0 0;transform:translateY(74mm) rotate(-90deg)">' + ref + '</div>', full:ref === renderFull(b, frameGeo(g), S.print), edge:on.includes('lab-edge'), name:t('cm_split')}; });
  ok(v.same && v.full && v.edge && v.name === 'Etichetta completa (classica)', 'classic complete label still available and byte-identical with edge compensation off', v);
  // info label content, rendered in the DOM at real size
  const tMount = async (pr, extra) => p.evaluate(([pr, extra]) => {
    const P = findPreset(pr); S.print.presetId = pr; S.print.geometry = geoFromPreset(P); Object.assign(S.print, extra || {});
    let box = document.getElementById('t-mount'); if (!box){ box = document.createElement('div'); box.id = 't-mount'; box.style.cssText = 'position:absolute;left:-2400px;top:0'; document.body.appendChild(box); }
    const sheets = buildLabelSheets(false); box.innerHTML = sheets[0] || '';
    const labs = [...box.querySelectorAll('.ilab')].filter(l => l.querySelector('.ilab-mid')).map(l => {
      const co = l.querySelector('.ilab-co'), mid = l.querySelector('.ilab-mid');
      let breaksOk = true, lines = 0;
      if (co && co.firstChild){ const tx = co.firstChild, s = tx.textContent, r = document.createRange();
        const c = (i) => { r.setStart(tx, i); r.setEnd(tx, i + 1); const q = r.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; };
        let dir = null, prev = null; lines = s.trim() ? 1 : 0;
        for (let i = 0; i < s.length; i++){ if (s[i] === ' ') continue; const cur = c(i);
          if (prev){ if (!dir){ const dx = cur[0] - prev[1][0], dy = cur[1] - prev[1][1], n = Math.hypot(dx, dy) || 1; dir = [dx / n, dy / n]; }
            const fw = (cur[0] - prev[1][0]) * dir[0] + (cur[1] - prev[1][1]) * dir[1];
            if (fw < 0){ lines++; if (!(s[i - 1] === ' ' || s[prev[0]] === '-')) breaksOk = false; } }
          prev = [i, cur]; } }
      const midR = mid.getBoundingClientRect(), coR = co ? co.getBoundingClientRect() : null;
      const over = co ? (co.scrollWidth > co.clientWidth + 1 || co.offsetHeight > mid.clientHeight + 1) : false;
      return {name:co ? co.textContent : '', fs:co ? parseFloat(co.style.fontSize) : 0, lines, breaksOk, over, val:(l.querySelector('.ilab-val') || {}).textContent, cap:(l.querySelector('.ilab-cap') || {}).textContent, cat:(l.querySelector('.ilab-catline') || {}).textContent || '', items:l.querySelectorAll('.ilab-item').length, html:l.outerHTML, kind:'I', midH:midR.height, coH:coR ? coR.height : 0};
    });
    const cl = box.querySelectorAll('.ilab-chead').length;
    return {labs, nan:sheets.join('').includes('NaN'), pages:sheets.length, cl};
  }, [pr, extra]);
  let tr = await tMount('mrink143');
  const tL = (n) => tr.labs.find(l => l.name.startsWith(n)) || {};
  const aps = tL('ASSOCIAZIONE'), nm = tL('Neri'), bl = tL('Barbieri'), fs1 = tL('Farmacia');
  ok(aps.val === '10877' && /multi/i.test(aps.cap) && /APS/.test(aps.cat) && aps.cat.includes('TAPS1'), 'info label: big Codice Multi top-left with "MULTI" caption, category · speaking code under it', aps);
  ok(nm.val === 'TNM1' && /codice/i.test(nm.cap) && !nm.cat.includes('TNM1') && /Semplificata/i.test(nm.cat), 'info label: no Multi → speaking code in the big spot ("CODICE"), not repeated below', nm);
  v = await p.evaluate(() => { const b = S.binders.find(x => x.speaking_code === 'TAPS1'), h = renderLabel('I', b, frameGeo(S.print.geometry), S.print); return {n:(h.replace(/<svg[\s\S]*?<\/svg>/g, '').match(/dm26TapsAbCd/g) || []).length, url:h.includes('>qr7.it/dm26TapsAbCd<'), svg:(h.match(/<svg/g) || []).length, big:LM.I.code, co:LM.I.co}; });
  ok(v.n === 1 && v.url && v.svg === 1, 'info label: QR + URL under it, no bare short-code text', v);
  ok(v.big >= 7 && aps.fs >= 4 && fs1.fs > aps.fs && fs1.fs >= 8, 'info label: Multi digits large, company name auto-fitted large (short names bigger)', {big:v.big, aps:aps.fs, fs:fs1.fs});
  ok(tr.labs.every(l => l.breaksOk) && aps.lines >= 3 && bl.breaksOk, 'company name wraps only at spaces / after hyphens, never mid-word', tr.labs.map(l => [l.name.slice(0, 20), l.lines, l.breaksOk]));
  ok(!aps.over && !tr.labs.some(l => l.over) && !tr.nan, 'long company name (APS … SAN PANCRAZIO PARMENSE) fits its box without overflow', aps);
  v = [];
  for (const n of [0, 1, 2]){ tr = await tMount('mrink143', {info:{items:n, pair:false}}); v.push(tL('ASSOCIAZIONE').items); }
  ok(v.join() === '0,1,2', 'contents items at the bottom: 0 / 1 / 2', v);
  v = await p.evaluate(() => { S.print.fields = {multi:false, category:false, tags:false, date:'none'}; const b = S.binders.find(x => x.speaking_code === 'TAPS1'), h = renderLabel('I', b, frameGeo(S.print.geometry), S.print); S.print.fields = {}; return {multi:h.includes('10877'), cat:h.includes('>APS<'), tag:h.includes('#aps'), date:h.includes(t('l_created')), code:h.includes('TAPS1')}; });
  ok(!v.multi && !v.cat && !v.tag && !v.date && v.code, 'info label respects the field toggles (Multi, category, tags, date)', v);
  // pair flag: info + contents on the two halves of the same physical label
  v = await p.evaluate(() => { S.print.presetId = 'mrink143'; S.print.geometry = geoFromPreset(findPreset('mrink143')); S.print.info = {items:2, pair:true}; S.usedSlots = {};
    const L = layoutLabels(), a = L.pages[0][0], c = L.pages[0][1], s = [a.s, c.s];
    const r = {k:a.item.kind + c.item.kind, same:a.item.b.id === c.item.b.id, phys:Math.floor(s[0] / 4) === Math.floor(s[1] / 4) && s[0] % 2 === s[1] % 2, items:L.items, q:printQueueBinders().length};
    const hc = renderLabel('C', c.item.b, frameGeo(S.print.geometry), S.print); r.c = hc.includes(t('l_updated_long')) && (c.item.b.contents_items || []).every(i => hc.includes(esc(i.description)));
    S.usedSlots = {mrink143:[slotSeq()[0]]}; const L2 = layoutLabels(); r.skipTwin = L2.pages[0][0].s === slotSeq()[2] && L2.pages[0][1].s === slotSeq()[3];
    S.usedSlots = {}; S.print.info = {items:2, pair:false}; return r; });
  ok(v.k === 'IC' && v.same && v.phys && v.items === 2 * v.q && v.c, 'flag "also print the contents label": info + contents (full list, update date) on the two halves of one physical label', v);
  ok(v.skipTwin, 'a pair never straddles two physical labels (half-used label is skipped)', v);
  // edge compensation: identical, centred content boxes on all 8 slots
  v = await p.evaluate(() => { S.print.presetId = 'mrink143'; S.print.geometry = geoFromPreset(findPreset('mrink143')); S.print.copies = 3; S.usedSlots = {};
    const box = document.getElementById('t-mount'); const sh = buildLabelSheets(true)[0]; box.innerHTML = sh;
    const res = [...box.querySelectorAll('.slotbox')].filter(sb => sb.querySelector('.lab')).map(sb => { const a = sb.getBoundingClientRect(), l = sb.querySelector('.lab').getBoundingClientRect(); return [l.left - a.left, a.right - l.right, l.top - a.top, a.bottom - l.bottom].map(x => Math.round(x * 25.4 / 96 * 10) / 10); });
    const outline = (sh.match(/edge-safe-scr/g) || []).length, printed = buildLabelSheets(false)[0].includes('edge-safe-scr');
    S.print.copies = 1; box.innerHTML = '';
    return {n:res.length, same:res.every(r => r.join() === res[0].join()), sym:res.every(r => Math.abs(r[0] - r[1]) < 0.15 && Math.abs(r[2] - r[3]) < 0.15), r0:res[0], outline, printed, defs:[edgeDefaultOn(geoFromPreset(findPreset('mrink143'))), edgeDefaultOn(geoFromPreset(findPreset('a4-8'))), edgeDefaultOn(geoFromPreset(findPreset('l7160')))]}; });
  ok(v.n === 8 && v.same && v.sym && v.r0[0] >= 3.9 && v.r0[2] >= 4.9, 'edge compensation: same centred safe area on all 8 MRINK143 slots (4 mm + 1 mm cut on the hand-cut sides)', v);
  ok(v.outline === 8 && !v.printed && v.defs.join() === 'true,true,false', 'safe area outline on screen only; default on for hand-cut sheets, off for die-cut', v);
  // QR decode on printed PDFs (info label)
  for (const pr of ['mrink143', 'l7160', 'l7163', 'a4-8']){
    const info = await p.evaluate((pr) => {
      const P = findPreset(pr); S.print.presetId = pr; S.print.geometry = geoFromPreset(P); S.print.contentMode = 'info'; S.print.qrMode = 'live'; S.usedSlots = {};
      document.getElementById('page-style').textContent = '@page{size:210mm 297mm;margin:0mm}';
      document.getElementById('print-root').innerHTML = buildLabelSheets(false)[0];
      return {slots:layoutLabels().pages[0].map(x => Object.assign(slotRect(x.s), {url:x.item.b.short_url})), w:P.w, h:P.h};
    }, pr);
    await p.emulateMedia({media:'print'});
    const pdf = await p.pdf({width:'210mm', height:'297mm', printBackground:true, preferCSSPageSize:true});
    await p.emulateMedia({media:'screen'});
    fs.writeFileSync('shots/q.pdf', pdf);
    require('child_process').execSync('python3 -c "import pypdfium2 as p;d=p.PdfDocument(\'shots/q.pdf\');d[0].render(scale=300/72).to_pil().convert(\'RGBA\').save(\'shots/q.png\')"');
    const png = PNG.sync.read(fs.readFileSync('shots/q.png')), k = png.width / 210;
    let good = 0;
    for (const s of info.slots){
      const x0 = Math.floor(s.x * k), y0 = Math.floor(s.y * k), w = Math.floor(info.w * k), h = Math.floor(info.h * k);
      const d = new Uint8ClampedArray(w * h * 4);
      for (let j = 0; j < h; j++){ const st = ((y0 + j) * png.width + x0) * 4; d.set(png.data.subarray(st, st + w * 4), j * w * 4); }
      let r = jsQR(d, w, h);
      for (const f of [2, 4]){ if (r && r.data === s.url) break; const W = Math.floor(w / f), H = Math.floor(h / f), e = new Uint8ClampedArray(W * H * 4);
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++){ const a = ((j * f) * w + i * f) * 4, bb = (j * W + i) * 4; e[bb] = d[a]; e[bb+1] = d[a+1]; e[bb+2] = d[a+2]; e[bb+3] = 255; }
        r = jsQR(e, W, H); }
      if (r && r.data === s.url) good++;
    }
    ok(good === info.slots.length && good > 0, `T: QR decode info label ${pr}: ${good}/${info.slots.length}`);
  }
  await p.evaluate(() => { document.getElementById('print-root').innerHTML = ''; });
  // every preset × info (± contents label) renders without overflow
  const tBad = [];
  for (const pr of await p.evaluate(() => BUILTIN_PRESETS.map(x => x.id))) for (const pair of [false, true]){
    const r = await tMount(pr, {info:{items:2, pair}});
    const over = r.labs.filter(l => l.over || !l.breaksOk || (l.name && l.fs < 1.6));
    if (r.nan || over.length || !r.labs.length || (pair && !r.cl && r.pages < 2)) /* one-label sheets: contents label on the next sheet */ tBad.push({pr, pair, nan:r.nan, n:r.labs.length, over:over.map(l => [l.name.slice(0, 24), l.fs])});
  }
  ok(!tBad.length, 'every preset × info label (with and without contents label): no overflow, no mid-word break, no NaN', tBad);
  // UI: registry-driven choices, options, edge panel, help
  await p.evaluate(() => { S.print.presetId = 'mrink143'; S.print.geometry = geoFromPreset(findPreset('mrink143')); S.print.info = {items:2, pair:false}; S.view = 'print'; S.print.advanced = true; renderAll(); }); await p.waitForTimeout(300);
  v = await p.evaluate(() => ({opts:[...document.querySelectorAll('[data-a="cmode"]')].map(x => x.dataset.v).join(), on:(document.querySelector('.opt.on[data-a="cmode"]') || {}).dataset.v, rec:!!document.querySelector('[data-a="cmode"][data-v="info"] .tpl-rec'), items:document.querySelectorAll('[data-a="tpl-info-items"]').length, edge:!!document.querySelector('#pr-adv #edge-box [data-a="edge-on"]:checked'), pv:document.querySelectorAll('#pv-scroll .edge-safe-scr').length, help:!!helpTopic('edge') && !!helpTopic('infolabel'), w:document.documentElement.scrollWidth <= innerWidth + 1}));
  ok(v.opts === 'info,split,pair,a,b,u,qr' && v.on === 'info' && v.rec && v.items === 3 && v.edge && v.pv === 8 && v.help && v.w, 'print panel: templates from the registry, info recommended on MRINK143, its options, edge option in Advanced, outline in preview, help topics', v);
  await p.screenshot({path:'shots/t_print_panel.png'});
  await p.click('[data-a="tpl-info-items"][data-v="1"]'); await p.waitForTimeout(100);
  await p.click('[data-a="tpl-info-pair"]'); await p.waitForTimeout(250);
  v = await p.evaluate(() => ({info:JSON.stringify(S.print.info), kinds:queueItems().slice(0, 2).map(i => i.kind).join('')}));
  await p.click('#edge-box [data-a="edge-on"]'); await p.waitForTimeout(150);
  await p.fill('[data-edge="outer"]', '5').catch(() => {});
  v.edge = await p.evaluate(() => ({on:edgeOn(), by:S.print.edge.byPreset.mrink143, pv:document.querySelectorAll('#pv-scroll .edge-safe-scr').length}));
  ok(v.info === '{"items":1,"pair":true}' && v.kinds === 'IC' && v.edge.on === false && v.edge.by === false && v.edge.pv === 0, 'options work: items, contents label flag, edge on/off per sheet', v);
  await p.click('#edge-box [data-a="edge-on"]'); await p.waitForTimeout(100);
  await p.fill('[data-edge="outer"]', '5'); await p.dispatchEvent('[data-edge="outer"]', 'change'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => S.print.edge.outer === 5 && edgeInsetSheet(S.print.geometry, S.print).x === 5 && edgeInsetSheet(S.print.geometry, S.print).y === 6), 'edge border value changes the safe area');
  await p.evaluate(() => { S.lang = 'en'; renderAll(); });
  ok(await p.evaluate(() => (document.querySelector('[data-a="cmode"][data-v="info"]') || {}).textContent.includes('Info label (recommended)') && (document.querySelector('[data-a="cmode"][data-v="split"]') || {}).textContent.includes('Complete label (classic)')), 'English template names');
  await p.evaluate(() => { S.lang = 'it'; renderAll(); });
  // performance: 2000 binders, info label, distinct long names
  v = await p.evaluate(() => { const keep = S.binders, taken = keep.map(b => b.short_code), extra = [];
    for (let i = 0; i < 2000; i++){ const sc = newShortCode(taken); taken.push(sc); extra.push(normalizeBinder({speaking_code:'TP' + i, multi_code:String(10000 + i), company_name:'Studio Associato Numero ' + i + ' di Prova Lunga S.r.l.', category:'Ordinaria', contents_items:'2025: A|2024: B', short_code:sc, selected_for_print:true})); }
    keep.forEach(b => b.selected_for_print = false); S.binders = keep.concat(extra); FIT.cache.clear();
    S.print.edge = {outer:4, cut:1, byPreset:{}}; S.print.info = {items:2, pair:false};
    const t0 = performance.now(); const sh = buildLabelSheets(false); const ms = Math.round(performance.now() - t0);
    const t1 = performance.now(); buildLabelSheets(false); const ms2 = Math.round(performance.now() - t1);
    S.binders = keep; return {ms, ms2, sheets:sh.length}; });
  ok(v.sheets === 250 && v.ms < 15000 && v.ms2 < v.ms, '2000 info labels (2000 different names) built in ' + v.ms + ' ms, cached rebuild ' + v.ms2 + ' ms', v);
  // clean up
  await p.evaluate(() => { S.binders = S.binders.filter(b => !/^T(APS|NM|BL|FS)1$/.test(b.speaking_code)); const sel = new Set(window.__Tsel); S.binders.forEach(b => b.selected_for_print = sel.has(b.id));
    S.print = window.__Tprint; S.usedSlots = window.__TusedSlots; const m = document.getElementById('t-mount'); if (m) m.remove(); delete window.__Tprint; delete window.__TusedSlots; delete window.__Tsel; commit(); S.view = 'archive'; renderAll(); });

  // @@STREAM-P@@
  // ===== v9 stream P ("Scarica PDF": vector A4 PDF written in the browser) =====
  sec('Scarica PDF');
  {
    const cp = require('child_process');
    fs.writeFileSync('shots/p_pdf.py', [
      'import sys, json, pypdfium2 as pd',
      'src, pre, dpi = sys.argv[1], sys.argv[2], int(sys.argv[3])',
      'd = pd.PdfDocument(src); out = {"pages": len(d), "sizes": [], "text": []}',
      'for i in range(len(d)):',
      '    pg = d[i]; out["sizes"].append(list(pg.get_size())); out["text"].append(pg.get_textpage().get_text_range())',
      '    if dpi: pg.render(scale=dpi / 72).to_pil().convert("RGBA").save("%s_%d.png" % (pre, i))',
      'print(json.dumps(out))'].join('\n'));
    const pdfInfo = (file, pre, dpi) => JSON.parse(cp.execSync('python3 shots/p_pdf.py ' + file + ' ' + pre + ' ' + (dpi || 0), {maxBuffer:1 << 26}).toString());
    const K = 300 / 25.4;   // px per mm at 300 dpi (both PDFs are rendered at the same scale, independent of their page box)
    // decode the QR inside each slot rectangle; returns {data, cx, cy} with the QR centre in mm
    const pDecode = (png, slots, w, h) => slots.map(s => {
      const x0 = Math.floor(s.x * K), y0 = Math.floor(s.y * K), W = Math.min(Math.floor(w * K), png.width - x0), H = Math.min(Math.floor(h * K), png.height - y0);
      const d = new Uint8ClampedArray(W * H * 4);
      for (let j = 0; j < H; j++){ const st = ((y0 + j) * png.width + x0) * 4; d.set(png.data.subarray(st, st + W * 4), j * W * 4); }
      for (const f of [1, 2, 4]){
        let e = d, w2 = W, h2 = H;
        if (f > 1){ w2 = Math.floor(W / f); h2 = Math.floor(H / f); e = new Uint8ClampedArray(w2 * h2 * 4);
          for (let j = 0; j < h2; j++) for (let i = 0; i < w2; i++){ const a = ((j * f) * W + i * f) * 4, b = (j * w2 + i) * 4; e[b] = d[a]; e[b+1] = d[a+1]; e[b+2] = d[a+2]; e[b+3] = 255; } }
        const r = jsQR(e, w2, h2);
        if (r && r.data){ const L = r.location, c = [L.topLeftCorner, L.topRightCorner, L.bottomLeftCorner, L.bottomRightCorner];
          return {data:r.data, cx:s.x + c.reduce((a, q) => a + q.x, 0) / 4 * f / K, cy:s.y + c.reduce((a, q) => a + q.y, 0) / 4 * f / K}; }
      }
      return {data:null};
    });
    const pSetup = (pr, m, extra) => p.evaluate(([pr, m, extra]) => {
      closeModal(true); const P = findPreset(pr); S.print.presetId = pr; S.print.geometry = geoFromPreset(P); S.print.geometryModified = false; S.print.contentMode = m; S.print.qrMode = 'live';
      Object.assign(S.print, extra || {}); S.view = 'print'; renderAll();
    }, [pr, m, extra]);
    const pLayout = () => p.evaluate(() => { const g = S.print.geometry; return {w:g.w, h:g.h, pages:layoutLabels().pages.map(pg => pg.map(x => Object.assign(slotRect(x.s), {s:x.s, url:x.item.b.short_url, x:slotRect(x.s).x + (+S.print.offsetX || 0), y:slotRect(x.s).y + (+S.print.offsetY || 0)})))}; });
    const pDownload = async (file) => {
      const [dl] = await Promise.all([p.waitForEvent('download', {timeout:60000}), p.click('#btn-pdf')]);
      await dl.saveAs(file); await p.waitForTimeout(150); return dl.suggestedFilename();
    };
    const pBrowserPrint = async (file) => {
      await p.evaluate(() => { document.getElementById('page-style').textContent = '@page{size:210mm 297mm;margin:0mm}'; document.getElementById('print-root').innerHTML = buildLabelSheets(false).join(''); });
      await p.emulateMedia({media:'print'}); fs.writeFileSync(file, await p.pdf({width:'210mm', height:'297mm', printBackground:true, preferCSSPageSize:true})); await p.emulateMedia({media:'screen'});
      await p.evaluate(() => { document.getElementById('print-root').innerHTML = ''; });
    };
    const pPrev = await p.evaluate(() => ({print:JSON.parse(JSON.stringify(S.print)), used:JSON.parse(JSON.stringify(S.usedSlots)), sel:S.binders.filter(b => b.selected_for_print).map(b => b.id), n:S.binders.length}));
    await p.evaluate(() => { S.binders.forEach(b => { b.selected_for_print = !isDemo(b) || !S.settings.hideDemo; }); });
    const pCases = [
      ['mrink143', 'split', {offsetX:1.2, offsetY:-0.6}, {mrink143:[0, 1]}],   // turned labels, calibration offsets, partial sheet
      ['l7160', 'a', {offsetX:0, offsetY:0}, {}],
      ['l7165', 'u', {offsetX:0, offsetY:0}, {}],
      ['l7159', 'qr', {offsetX:0, offsetY:0}, {}]
    ];
    for (const [pr, m, off, used] of pCases){
      await pSetup(pr, m, off); await p.evaluate((u) => { S.usedSlots = u; renderAll(); }, used);
      const lay = await pLayout();
      const name = await pDownload('shots/p_' + pr + '.pdf');
      ok(/^DocMap_etichette_[A-Za-z0-9_-]+_\d{4}-\d{2}-\d{2}\.pdf$/.test(name) && name.includes(pr), `PDF ${pr}: file name ${name}`);
      const after = await p.evaluate(() => ({modal:!!(topModal() && topModal().textContent.includes(t('pdf_after_t'))), toast:[...document.querySelectorAll('.toast')].some(x => x.textContent.includes('100%')), last:PDF.last}));
      ok(after.modal && after.toast, `PDF ${pr}: toast "stampa al 100%" + question about used slots`, after);
      await p.evaluate(() => closeModal(true));
      ok(fs.readFileSync('shots/p_' + pr + '.pdf').subarray(0, 8).toString() === '%PDF-1.4', `PDF ${pr}: PDF header (1.4, maximum compatibility)`);
      const inf = pdfInfo('shots/p_' + pr + '.pdf', 'shots/p_' + pr, 300);
      ok(inf.pages === lay.pages.length && inf.sizes.every(s => Math.abs(s[0] - 595.276) < 0.01 && Math.abs(s[1] - 841.89) < 0.01), `PDF ${pr}: ${inf.pages} page(s), exact A4 in points`, inf.sizes);
      await pBrowserPrint('shots/p_' + pr + '_print.pdf');
      pdfInfo('shots/p_' + pr + '_print.pdf', 'shots/p_' + pr + '_print', 300);
      const mine = pDecode(PNG.sync.read(fs.readFileSync('shots/p_' + pr + '_0.png')), lay.pages[0], lay.w, lay.h);
      const ref = pDecode(PNG.sync.read(fs.readFileSync('shots/p_' + pr + '_print_0.png')), lay.pages[0], lay.w, lay.h);
      const good = mine.filter((q, i) => q.data === lay.pages[0][i].url).length;
      ok(good === lay.pages[0].length && good > 0, `PDF ${pr}/${m}: every QR decodes in slot order ${good}/${lay.pages[0].length}`, mine.map(q => q.data));
      const dmax = Math.max(...mine.map((q, i) => q.data && ref[i].data ? Math.hypot(q.cx - ref[i].cx, q.cy - ref[i].cy) : 99));
      console.log(`  PDF ${pr}/${m}: ${after.last.bytes} bytes, ${after.last.ms} ms, QR centre offset vs browser print max ${dmax.toFixed(3)} mm`);
      ok(dmax < 0.5, `PDF ${pr}: QR centres match the browser print within 0.5 mm (max ${dmax.toFixed(3)} mm)`);
      if (pr === 'mrink143'){
        const txt = inf.text.join('\n');
        ok(txt.includes('Contabilità') && /α/.test(txt) && /β/.test(txt) && txt.includes('Barbieri Luigi S.r.l.'), 'PDF text is real, extractable text (accents, Greek shelf letters, company names)', txt.slice(0, 200));
        ok(!lay.pages[0].some(s => s.s === 0 || s.s === 1), 'PDF skips the used slots of the partial sheet like the print does');
        const raw = fs.readFileSync('shots/p_' + pr + '.pdf').toString('latin1');
        ok(/\/FontFile2/.test(raw) && /\/ToUnicode/.test(raw) && /\/CIDFontType2/.test(raw) && /\/Identity-H/.test(raw) && /\/Producer \(DocMap 2026\)/.test(raw) && /\/CreationDate \(D:\d{14}/.test(raw) && /\/FlateDecode/.test(raw), 'PDF embeds subset TrueType fonts (Identity-H + ToUnicode), metadata and compressed streams');
        ok(after.last.bytes < 200000, `PDF size for one MRINK143 sheet: ${after.last.bytes} bytes`);
        try { cp.execSync('qpdf --check shots/p_' + pr + '.pdf', {stdio:'pipe'}); ok(true, 'qpdf --check'); } catch(e){ if (e.status === 127 || /not found|ENOENT/.test(String(e.message))) console.log('  (qpdf not installed: skipped)'); else ok(false, 'qpdf --check', String(e.stdout || e.message).slice(0, 300)); }
      }
    }
    // used-slot question: "yes" records the consumed slots exactly like the print path
    await pSetup('mrink143', 'split', {offsetX:0, offsetY:0}); await p.evaluate(() => { S.usedSlots = {}; renderAll(); });
    const pExp = await p.evaluate(() => { const L = layoutLabels(), last = L.pages[L.pages.length - 1].map(x => x.s); return last.length >= slotCount() ? '' : last.sort((a, b) => a - b).join(); });
    await pDownload('shots/p_used.pdf');
    await p.locator('.modal-f .btn-primary').last().click(); await p.waitForTimeout(150);
    let pv = await p.evaluate(() => (S.usedSlots.mrink143 || []).join());
    ok(pv === pExp, 'after the PDF, "Sì, aggiorna mappa" marks the slots consumed on the last sheet', [pv, pExp]);
    // 200 binders: fast, with progress, every QR on the first and last sheet decodes
    pv = await p.evaluate(() => { S.usedSlots = {}; const base = S.binders.filter(b => !isDemo(b) || !S.settings.hideDemo);
      for (let i = 0; S.binders.filter(b => b.selected_for_print).length < 200; i++){ const x = normalizeBinder(clone(base[i % base.length])); x.id = uuid(); x.speaking_code = 'PZ' + i; x.short_code = newShortCode(); x.short_url = shortUrl(x.short_code); x.selected_for_print = true; x.tags = 'ptest'; S.binders.push(x); }
      ensureIntegrity(); renderAll(); return printQueueBinders().length; });
    const lay200 = await pLayout();
    let seenProgress = false;
    const pWatch = setInterval(async () => { try { if (await p.evaluate(() => !!document.getElementById('pdf-progress'))) seenProgress = true; } catch(e){} }, 100);
    await pDownload('shots/p_200.pdf'); clearInterval(pWatch);
    await p.evaluate(() => closeModal(true));
    const last200 = await p.evaluate(() => PDF.last);
    ok(pv === 200 && last200.pages === 25 && last200.ms < 8000, `200 binders → 25 sheets in ${last200.ms} ms, ${last200.bytes} bytes`, last200);
    console.log(`  PDF 200 binders: ${last200.pages} pages, ${last200.bytes} bytes, ${last200.ms} ms`);
    ok(seenProgress, 'progress shown for a big PDF');
    const inf200 = pdfInfo('shots/p_200.pdf', 'shots/p_200', 0);
    ok(inf200.pages === 25, 'PDF with 200 binders opens with 25 pages');
    cp.execSync('python3 -c "import pypdfium2 as pd;d=pd.PdfDocument(\'shots/p_200.pdf\');[d[i].render(scale=300/72).to_pil().convert(\'RGBA\').save(\'shots/p_200_%d.png\' % i) for i in (0, 24)]"');
    let good200 = 0, tot200 = 0;
    for (const i of [0, 24]){ const q = pDecode(PNG.sync.read(fs.readFileSync('shots/p_200_' + i + '.png')), lay200.pages[i], lay200.w, lay200.h); tot200 += q.length; good200 += q.filter((x, j) => x.data === lay200.pages[i][j].url).length; }
    ok(good200 === tot200 && tot200 === 16, `200 binders: QR on the first and last sheet decode in order ${good200}/${tot200}`);
    // help + English + restore
    ok(await p.evaluate(() => { const h = helpTopic('pdf'); return !!(h && h.body.it.includes('100%') && h.body.en.includes('Actual size')); }) && (await p.innerText('#btn-pdf')).includes('Scarica PDF'), 'help topic "pdf" (IT + EN) and the Scarica PDF button');
    await p.evaluate(() => { S.lang = 'en'; renderAll(); });
    ok((await p.innerText('#btn-pdf')).includes('Download PDF'), 'Download PDF button in English');
    await p.evaluate((prev) => { S.lang = 'it'; S.binders = S.binders.filter(b => b.tags !== 'ptest'); S.binders.forEach(b => { b.selected_for_print = prev.sel.includes(b.id); });
      S.print = prev.print; S.usedSlots = prev.used; savePrefs(); commit(); S.view = 'archive'; renderAll(); }, pPrev);
    ok(await p.evaluate((n) => S.binders.length === n, pPrev.n), 'PDF tests leave the archive and print settings as they were');
  }

  // @@STREAM-L@@
  sec('v9 L: activity log');
  let Lv;
  const Lstart = await p.evaluate(() => { while (topModal()) closeModal(true); S.lang = 'it'; S.settings.operator = ''; S.view = 'archive'; renderAll(); return nowISO(); });
  // create + edit through the editor
  Lv = await p.evaluate(() => {
    openEditor(null); Object.assign(UI.ed.d, {company_name:'Log Test Srl', speaking_code:'LGT1', category:'Ordinaria', tags:'lgtag'}); saveEditor();
    const b = S.binders.find(x => x.speaking_code === 'LGT1'), c = LOG.entries[LOG.entries.length - 1];
    openEditor(b.id); UI.ed.d.binder_title = 'Titolo dal log'; UI.ed.d.room_code = 'ZL'; saveEditor();
    const e = LOG.entries[LOG.entries.length - 1];
    openEditor(b.id); saveEditor();   // no change → no entry
    while (topModal()) closeModal(true);
    return {id:b.id, c, e, last:LOG.entries[LOG.entries.length - 1].id};
  });
  ok(Lv.c.action === 'binder.create' && Lv.c.who === 'Questo PC' && Lv.c.target.id === Lv.id && Lv.c.target.code === 'LGT1' && Lv.c.source === 'ui' && /LGT1/.test(Lv.c.summary) && /^[0-9a-f-]{36}$/.test(Lv.c.id) && !isNaN(new Date(Lv.c.at)), 'log: binder create → entry {id, at, who "Questo PC", action, target, summary, source}', Lv.c);
  ok(Lv.e.action === 'binder.edit' && Lv.e.details.changed.binder_title[1] === 'Titolo dal log' && Lv.e.details.changed.room_code[1] === 'ZL' && !('updated_at' in Lv.e.details.changed) && Lv.last === Lv.e.id, 'log: binder edit records changed fields old → new; saving without changes adds nothing', Lv.e);
  // operator name from Settings
  await p.evaluate(() => { S.view = 'settings'; renderAll(); });
  await p.fill('#se-operator', 'Dave Test'); await p.press('#se-operator', 'Tab'); await p.waitForTimeout(100);
  Lv = await p.evaluate(() => ({op:S.settings.operator, e:LOG.entries[LOG.entries.length - 1]}));
  ok(Lv.op === 'Dave Test' && Lv.e.action === 'settings.operator' && Lv.e.who === 'Dave Test' && Lv.e.details.to === 'Dave Test' && Lv.e.details.from === '', 'log: operator name set in Settings is logged and used as "who"', Lv);
  // single delete (confirm), bulk delete, undo
  await p.evaluate(() => { S.view = 'archive'; renderAll(); ACTIONS['del']({dataset:{id:S.binders.find(x => x.speaking_code === 'LGT1').id}}); });
  await p.click('.modal-f .btn-danger-solid'); await p.waitForTimeout(100);
  Lv = await p.evaluate(() => ({e:LOG.entries[LOG.entries.length - 1], gone:!S.binders.some(x => x.speaking_code === 'LGT1')}));
  ok(Lv.gone && Lv.e.action === 'binder.delete' && Lv.e.who === 'Dave Test' && Lv.e.target.code === 'LGT1', 'log: single delete by the operator', Lv);
  await p.evaluate(() => { S.binders.forEach(b => b.selected_for_print = false); ['LGB1','LGB2','LGB3'].forEach(c => S.binders.push(normalizeBinder({speaking_code:c, company_name:'Bulk Log', selected_for_print:true, short_code:newShortCode()}))); commit(); renderView(); ACTIONS['del-sel'](); });
  await p.click('.modal-f .btn-danger-solid'); await p.waitForTimeout(100);
  Lv = await p.evaluate(() => LOG.entries[LOG.entries.length - 1]);
  ok(Lv.action === 'binder.delete_bulk' && Lv.details.count === 3 && Lv.details.codes.join(',') === 'LGB1,LGB2,LGB3' && Lv.target === null, 'log: bulk delete logs the count and codes', Lv);
  await p.click('#toasts .toast-act >> nth=-1'); await p.waitForTimeout(100);
  Lv = await p.evaluate(() => ({e:LOG.entries[LOG.entries.length - 1], back:S.binders.filter(b => /^LGB/.test(b.speaking_code)).length}));
  ok(Lv.back === 3 && Lv.e.action === 'undo' && Lv.e.details.undone_action === 'binder.delete_bulk', 'log: undo is logged with the operation it reverted', Lv);
  // import + Informazioni rename + client register
  Lv = await p.evaluate(() => { analyzeImport('speaking_code;company_name;tags\nLGI1;Import Log Srl;lgtag'); applyImport('merge'); return LOG.entries[LOG.entries.length - 1]; });
  ok(Lv.action === 'import.merge' && Lv.source === 'import' && Lv.details.added === 1 && Lv.details.updated === 0, 'log: import logs counts with source "import"', Lv);
  Lv = await p.evaluate(() => { undoPoint(); const r = infoRename('tags', 'lgtag', 'lgtag2'); return {r, e:LOG.entries[LOG.entries.length - 1]}; });
  ok(Lv.r && Lv.e.action === 'info.rename' && Lv.e.details.from === 'lgtag' && Lv.e.details.to === 'lgtag2' && Lv.e.details.binders === 1 && Lv.e.details.list === 'tags', 'log: Informazioni rename logs list, old → new and count', Lv);
  Lv = await p.evaluate(() => { const c = normalizeClient({name:'Cliente Log', multi_code:'LG9'}); logClientSave(null, c, 0); S.clients.push(c); const old = clone(c); c.city = 'Parma'; logClientSave(old, c, 0); return LOG.entries.slice(-2).map(e => e.action + ':' + JSON.stringify(e.details.changed || {})); });
  ok(Lv[0] === 'client.create:{}' && Lv[1] === 'client.edit:{"city":["","Parma"]}', 'log: client register create / edit', Lv);
  // print (dialog stubbed) and generic PDF hook
  Lv = await p.evaluate(async () => { const o = window.print; window.print = () => {}; S.binders.forEach(b => b.selected_for_print = /^LG/.test(b.speaking_code)); await printLabels(); window.print = o; while (topModal()) closeModal(true); return {e:LOG.entries[LOG.entries.length - 1], pdf:typeof ACTIONS['pdf-download'] !== 'function' || !!ACTIONS['pdf-download']._logged}; });
  ok(Lv.e.action === 'print.labels' && Lv.e.details.labels > 0 && Lv.e.details.preset && Lv.e.details.mode && Lv.e.details.codes.includes('LGI1') && Lv.pdf, 'log: printing logs preset, content mode and number of labels; PDF button hooked when present', Lv);
  // exports and SQLite
  await p.evaluate(() => { S.view = 'export'; renderAll(); });
  await dl('[data-a="ex-csv"]');
  Lv = await p.evaluate(() => LOG.entries[LOG.entries.length - 1]);
  ok(Lv.action === 'export.csv' && Lv.details.file === 'docmap_full_backup.csv', 'log: export logged with file name', Lv);
  Lv = await p.evaluate(async () => { await dbPersist(); const d2 = new DB.SQL.Database(DB.db.export()); const ver = dbScalar("SELECT value FROM meta WHERE key='schema_version'", null, d2); const n = dbScalar('SELECT COUNT(*) FROM activity_log', null, d2); const r = dbQuery("SELECT * FROM activity_log WHERE action = 'binder.edit' ORDER BY at DESC LIMIT 1", null, d2)[0]; d2.close();
    const d3 = new DB.SQL.Database(); d3.exec('CREATE TABLE binders(id TEXT PRIMARY KEY, speaking_code TEXT); CREATE TABLE contents_items(id INTEGER PRIMARY KEY, binder_id TEXT)'); dbMigrate(d3); const has = dbQuery("SELECT name FROM sqlite_master WHERE name='activity_log'", null, d3).length; d3.close();
    return {ver, n, mem:LOG.entries.length, pend:LOG.pending.length, code:r && r.target_code, det:r && JSON.parse(r.details_json).changed.room_code[1], who:r && r.who, has}; });
  ok(+Lv.ver >= 5 && Lv.n === Lv.mem && Lv.pend === 0 && Lv.code === 'LGT1' && Lv.det === 'ZL' && Lv.who === 'Questo PC' && Lv.has === 1, 'log: SQLite schema >= 5, activity_log table mirrors memory, old databases get the table', Lv);
  await p.evaluate(() => { S.view = 'database'; renderAll(); });
  const LsqF = await dl('[data-a="db-download"]');
  Lv = await p.evaluate((b64) => { const d = new DB.SQL.Database(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); const n = dbScalar("SELECT COUNT(*) FROM activity_log WHERE action IN ('binder.create','binder.delete_bulk','info.rename')", null, d); d.close(); return n; }, fs.readFileSync(LsqF).toString('base64'));
  ok(Lv >= 3, 'log: downloaded .sqlite carries the activity log', Lv);
  // survives a reload
  const Lids = await p.evaluate(async () => { await dbPersist(); return LOG.entries.map(e => e.id); });
  await p.reload(); await p.waitForTimeout(1500);
  Lv = await p.evaluate(() => ({ready:LOG.ready, ids:LOG.entries.map(e => e.id), op:S.settings.operator}));
  ok(Lv.ready && Lids.every(id => Lv.ids.includes(id)) && Lv.op === 'Dave Test', 'log: survives a reload (SQLite in IndexedDB), operator kept', {n:Lv.ids.length, m:Lids.length});
  // JSON backup round trip (+ older backup without the log)
  Lv = await p.evaluate(() => {
    const J = JSON.parse(workspaceJSON(true)), sess = JSON.parse(workspaceJSON());
    const ids = J.activity_log.map(e => e.id);
    LOG.entries = []; DB.db.exec('DELETE FROM activity_log');
    analyzeImport(JSON.stringify(J)); UI.restoreAll = true; applyImport('replace');
    const back = ids.every(id => LOG.entries.some(e => e.id === id)), last = LOG.entries[LOG.entries.length - 1];
    const n1 = LOG.entries.length; delete J.activity_log;
    analyzeImport(JSON.stringify(J)); applyImport('replace');
    const last2 = LOG.entries[LOG.entries.length - 1];
    return {inJ:ids.length > 5, sess:!('activity_log' in sess), back, a:last.action, src:last.source, restored:last.details.log_entries_restored, n2:LOG.entries.length - n1, a2:last2.action, r2:last2.details.log_entries_restored, db:dbScalar('SELECT COUNT(*) FROM activity_log') === LOG.entries.length};
  });
  ok(Lv.inJ && Lv.sess && Lv.back && Lv.a === 'backup.restore' && Lv.src === 'restore' && Lv.restored > 5 && Lv.db, 'log: workspace JSON backup carries activity_log (sessions do not) and restoring it brings the entries back', Lv);
  ok(Lv.n2 === 1 && Lv.a2 === 'backup.restore' && Lv.r2 === undefined, 'log: older JSON backups without activity_log still import', Lv);
  // CSV export: formula guard, ';', BOM
  Lv = await p.evaluate(() => { const e = logAct('binder.edit', null, '=HYPERLINK("http://x")', {x:'+1'}); const c = logCSV([e]); return {bom:c.charCodeAt(0) === 0xFEFF, hdr:c.slice(1).split('\r\n')[0], guard:c.includes("'=HYPERLINK") && !/;=HYPERLINK/.test(c)}; });
  ok(Lv.bom && Lv.hdr.startsWith('date;who;action;operation;') && Lv.guard, 'log: CSV export uses ";" + BOM and escapes formulas', Lv);
  // the view: render, filters, click → editor, CSV download, English, no h-scroll
  await p.evaluate(() => { S.settings.operator = ''; S.view = 'log'; renderAll(); });
  Lv = await p.evaluate(() => ({rows:document.querySelectorAll('#lg-results tbody tr').length, ask:!!document.querySelector('#lg-op-ask'), menu:!!document.querySelector('#nav-more [data-v="log"]'), w:[document.documentElement.scrollWidth, innerWidth]}));
  ok(Lv.rows > 5 && Lv.ask && Lv.menu && Lv.w[0] <= Lv.w[1] + 1, 'log view: in the ⚙ menu, renders newest first, asks for a name when none is set, no h-scroll', Lv);
  await p.screenshot({path:'shots/l_log.png'});
  await p.selectOption('[data-lg="act"]', 'info'); await p.waitForTimeout(100);
  Lv = await p.evaluate(() => Array.from(document.querySelectorAll('#lg-results tbody tr .lg-b')).map(x => x.className));
  ok(Lv.length >= 1 && Lv.every(c => c.includes('lg-info')), 'log view: filter by operation type', Lv);
  await p.evaluate(() => ACTIONS['log-reset']());
  await p.selectOption('[data-lg="who"]', 'Dave Test'); await p.waitForTimeout(100);
  Lv = await p.evaluate(() => Array.from(document.querySelectorAll('#lg-results tbody tr td:nth-child(2)')).map(x => x.textContent));
  ok(Lv.length >= 3 && Lv.every(x => x === 'Dave Test'), 'log view: filter by operator', Lv.length);
  await p.evaluate(() => ACTIONS['log-reset']());
  await p.fill('[data-lg="q"]', 'LGT1'); await p.waitForTimeout(100);
  Lv = await p.evaluate(() => ({n:document.querySelectorAll('#lg-results tbody tr').length, all:Array.from(document.querySelectorAll('#lg-results tbody tr')).every(r => r.textContent.includes('LGT1'))}));
  ok(Lv.n >= 3 && Lv.all, 'log view: text filter', Lv);
  const Ltoday = await p.evaluate(() => logDay(nowISO()));
  await p.evaluate(() => ACTIONS['log-reset']());
  await p.fill('[data-lg="from"]', '2001-01-01'); await p.fill('[data-lg="to"]', '2001-12-31'); await p.waitForTimeout(100);
  Lv = await p.evaluate(() => ({none:!!document.querySelector('#lg-results .empty'), f:LOGV.from + '|' + LOGV.to}));
  await p.fill('[data-lg="from"]', '2001-01-01'); await p.fill('[data-lg="to"]', Ltoday); await p.waitForTimeout(100);
  const Lv2 = await p.evaluate(() => document.querySelectorAll('#lg-results tbody tr').length);
  ok(Lv.none && Lv.f === '2001-01-01|2001-12-31' && Lv2 > 5, 'log view: date range filter', [Lv, Lv2]);
  await p.evaluate(() => ACTIONS['log-reset']());
  await p.fill('#lg-op', 'Anna'); await p.press('#lg-op', 'Tab'); await p.waitForTimeout(100);
  Lv = await p.evaluate(() => ({op:S.settings.operator, ask:!!document.querySelector('#lg-op-ask'), first:(document.querySelector('#lg-results tbody tr td:nth-child(2)') || {}).textContent}));
  ok(Lv.op === 'Anna' && !Lv.ask && Lv.first === 'Anna', 'log view: inline operator field, change shown at the top', Lv);
  Lv = await p.evaluate(() => { const b = S.binders.find(x => x.speaking_code === 'LGI1'); logAct('binder.edit', logBT(b), 'Prova apertura', {}); renderView(); document.querySelector('#lg-results [data-a="log-open"][data-id="' + b.id + '"]').click(); const r = {open:!!(UI.ed && UI.ed.d.id === b.id)}; while (topModal()) closeModal(true); return r; });
  ok(Lv.open, 'log view: clicking a binder entry opens that binder', Lv);
  const LcsvF = await dl('[data-a="log-csv"]');
  const Lcsv = fs.readFileSync(LcsvF, 'utf8');
  ok(/^docmap_registro_attivita_\d{8}_\d{4}\.csv$/.test(require('path').basename(LcsvF)) && Lcsv.split('\r\n').length > 6 && Lcsv.includes(';binder.delete_bulk;'), 'log view: CSV download', LcsvF);
  await p.evaluate(() => { S.lang = 'en'; renderAll(); });
  Lv = await p.evaluate(() => ({h:document.querySelector('.page-h h1').textContent, th:document.querySelector('#lg-results thead').textContent, menu:document.querySelector('#nav-more [data-v="log"]').textContent, help:!!helpTopic('log'), lbl:VIEW_LABEL.log, se:I18N.en.lg_operator}));
  ok(/Activity log/.test(Lv.h) && /When/.test(Lv.th) && /Activity log/.test(Lv.menu) && Lv.help && Lv.lbl === 'nav_log' && !!Lv.se, 'log view: English UI + help topic "log"', Lv);
  await p.setViewportSize({width:390, height:800}); await p.waitForTimeout(150);
  Lv = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  ok(Lv[0] <= Lv[1] + 1, 'log view: no horizontal scroll at phone width', Lv);
  await p.setViewportSize({width:1366, height:768});
  // clean up: test binders/clients, operator, log entries written by this block
  await p.evaluate(async (start) => {
    while (topModal()) closeModal(true);
    S.lang = 'it'; S.settings.operator = ''; Object.assign(LOGV, {q:'', act:'', who:'', from:'', to:'', limit:100});
    S.binders = S.binders.filter(b => !/^LG[TBI]\d$/.test(b.speaking_code)); S.clients = (S.clients || []).filter(c => c.name !== 'Cliente Log');
    S.binders.forEach(b => b.selected_for_print = true);
    DB.db.run('DELETE FROM activity_log WHERE at >= ?', [start]); LOG.entries = LOG.entries.filter(e => e.at < start); LOG.pending = []; logSavePending();
    commit(); S.view = 'archive'; renderAll(); dbSyncFromState('t'); await dbPersist();
  }, Lstart);

  // ----------------------------------------------------------------------

  // @@STREAM-E@@

  // @@STREAM-K@@
  sec('v10 K: smart spine colours (families, per-client shades, locks)');
  await p.evaluate(() => { let i = 0; while (topModal() && i++ < 5) closeModal(true); });
  await p.evaluate(() => { window.__Ksnap = JSON.stringify({binders:S.binders, settings:S.settings, view:S.view, infoTab:S.infoTab, lang:S.lang}); S.lang = 'it'; S.settings.catColors = {}; S.settings.catFamilies = {}; S.settings.colorMode = 'company'; infoApplyCatColors(); });
  let Kv = await p.evaluate(() => {
    const bad = []; let minCR = 99, minDE = 99, minDEo = 99;
    COLOR_FAMILIES.forEach(f => {
      if (f.shades.length < 8 || f.shades.length > 12) bad.push(f.id + ':size');
      if (new Set(f.shades).size !== f.shades.length) bad.push(f.id + ':dup');
      f.shades.forEach((c, i) => { if (!/^#[0-9A-F]{6}$/.test(c)) bad.push(c); minCR = Math.min(minCR, colorContrast(c, '#FFFFFF')); f.shades.forEach((d, j) => { if (j > i) minDE = Math.min(minDE, colorDeltaE(c, d)); }); });
    });
    const anchors = ['Ordinaria','Semplificata','Societario','Lavoro','Dichiarativi'].every(c => COLOR_FAMILY[colorFamilyId(c)].shades[0] === CAT_COLOR_DEFAULT[c] && colorCategoryHex(c) === CAT_COLOR_DEFAULT[c]);
    return {bad, minCR:+minCR.toFixed(2), minDE:+minDE.toFixed(1), anchors, n:COLOR_FAMILIES.length, bw:colorDeltaE('#000000', '#FFFFFF'), same:colorDeltaE('#2563EB', '#2563EB'), cw:colorContrast('#000000', '#FFFFFF'), h:colorHash('a')};
  });
  ok(Kv.n >= 8 && !Kv.bad.length && Kv.minCR >= 3 && Kv.minDE >= 7, 'colour families: 8–12 distinct print-safe shades each, white text contrast ≥ 3:1, ΔE2000 ≥ 7 within a family', Kv);
  ok(Kv.anchors, 'the first shade of each default family is the v9 category colour', Kv);
  ok(Math.abs(Kv.bw - 100) < 0.5 && Kv.same === 0 && Math.abs(Kv.cw - 21) < 0.01 && Kv.h === 0xe40c292c, 'colour math: CIEDE2000, WCAG contrast and FNV-1a reference values', Kv);
  Kv = await p.evaluate(() => ['Ordinaria','Semplificata','Societario','Lavoro','Dichiarativi','APS','ETS Cultura','Associazione sportiva','ENC','Società di capitali','Aziende','Condominio','Contenzioso','Privati'].map(c => colorFamilyId(c)).join());
  ok(Kv === 'blue,green,violet,orange,red,warm,warm,warm,warm,cool,cool,pink,slate,teal', 'family per category: warm for APS/ETS/ENC/associations, cool dark for companies', Kv);
  Kv = await p.evaluate(() => { const a = colorFamilyId('Pratiche varie Kx'), b = colorFamilyId('pratiche  varie kx'); return {a, b, ok:COLOR_HASH_FAMILIES.includes(a)}; });
  ok(Kv.a === Kv.b && Kv.ok, 'unknown categories get a stable family (case/space insensitive)', Kv);
  // per-company shades inside a category
  Kv = await p.evaluate(() => {
    const mk = (co, i) => normalizeBinder({speaking_code:'KC' + i, company_name:co, category:'Ktest', short_code:newShortCode(), color_hex:''});
    const fam = colorShades('Ktest'), out = [];
    for (let i = 0; i < 12; i++){ const b = mk('Kappa Ditta ' + i, i); b.color_hex = colorAssign(b, S.binders); S.binders.push(b); out.push(b.color_hex); }
    const same = mk('Kappa Ditta 3', 'S'); const sameHex = colorAssign(same, S.binders);
    const again = mk('Kappa Ditta 3', 'S2'); const twice = [colorAssign(again, S.binders), colorAssign(again, S.binders)];
    const spelled = mk('KAPPA DITTA  3', 'S3');
    return {fam:fam.length, first10:new Set(out.slice(0, 10)).size, inFam:out.every(c => fam.includes(c)), shared:out.slice(0, 10).includes(out[10]), sameHex, three:out[3], twice, spelled:colorAssign(spelled, S.binders)};
  });
  ok(Kv.fam === 10 && Kv.first10 === 10 && Kv.inFam && Kv.shared, 'different companies of a category get different shades of its family until the family is exhausted', Kv);
  ok(Kv.sameHex === Kv.three && Kv.twice[0] === Kv.three && Kv.twice[1] === Kv.three && Kv.spelled === Kv.three, 'same company → same shade (deterministic, spelling-insensitive)', Kv);
  Kv = await p.evaluate(() => { const b = S.binders.find(x => x.speaking_code === 'KC0'); const other = normalizeBinder({speaking_code:'KX1', company_name:'Kappa Ditta 0', category:'Lavoro', short_code:newShortCode()}); return {c:colorAssign(other, S.binders), fam:colorShades('Lavoro').includes(colorAssign(other, S.binders)), b:b.color_hex}; });
  ok(Kv.fam, 'the same company in another category takes a shade of that category\'s family', Kv);
  // lock + recolorAll + undo + log
  Kv = await p.evaluate(() => {
    const L = S.binders.find(x => x.speaking_code === 'KC1'); L.color_hex = '#123456'; L.color_locked = true;
    const U = S.binders.find(x => x.speaking_code === 'KC2'); U.color_hex = '#654321';
    const auto = applyAutoColor(L);
    const nLog = LOG.entries.length;
    const n = recolorAll({onlyUnlocked:true});
    const e = LOG.entries[LOG.entries.length - 1];
    return {auto, n, L:L.color_hex, U:U.color_hex, uFam:colorShades('Ktest').includes(U.color_hex), log:e && e.action, logged:LOG.entries.length > nLog};
  });
  ok(Kv.auto === false && Kv.L === '#123456' && Kv.n >= 1 && Kv.uFam && Kv.log === 'binder.recolor', 'recolorAll recolours unlocked binders, keeps locked ones, writes the activity log', Kv);
  Kv = await p.evaluate(() => { const btn = [...document.querySelectorAll('.toast-act')].pop(); btn && btn.click(); return S.binders.find(x => x.speaking_code === 'KC2').color_hex; });
  ok(Kv === '#654321', 'recolorAll can be undone', Kv);
  Kv = await p.evaluate(() => { const plan1 = [...colorPlan(S.binders)].join(), plan2 = [...colorPlan(S.binders)].join(); return {same:plan1 === plan2}; });
  ok(Kv.same, 'recolour plan is deterministic', Kv);
  // editor: live colour on company / category change, swatches, lock, "Automatico"
  Kv = await p.evaluate(() => {
    const r = {};
    openEditor(null);
    const co = $('#ed-company_name'); co.value = 'Kappa Ditta 5'; co.dispatchEvent(new Event('input', {bubbles:true}));
    const cat = $('#ed-category'); cat.value = 'Ktest'; cat.dispatchEvent(new Event('input', {bubbles:true}));
    r.live = UI.ed.d.color_hex; r.exp = S.binders.find(x => x.speaking_code === 'KC5').color_hex;
    r.auto = !!document.querySelector('#ed-swatches .co-auto.on'); r.famFirst = [...document.querySelectorAll('#ed-swatches .co-fam .sw')].map(s => s.dataset.c).join() === colorShades('Ktest').join();
    cat.value = 'Lavoro'; cat.dispatchEvent(new Event('input', {bubbles:true})); r.lav = colorShades('Lavoro').includes(UI.ed.d.color_hex);
    document.querySelector('#ed-swatches .co-others .sw').click(); r.locked = UI.ed.d.color_locked === true; r.picked = UI.ed.d.color_hex; r.lockShown = !document.querySelector('#ed-swatches .co-lock').hidden && !document.querySelector('#ed-swatches .co-auto.on');
    cat.value = 'Ktest'; cat.dispatchEvent(new Event('input', {bubbles:true})); r.kept = UI.ed.d.color_hex === r.picked;
    co.value = 'Kappa Ditta 7'; co.dispatchEvent(new Event('input', {bubbles:true})); r.kept2 = UI.ed.d.color_hex === r.picked;
    document.querySelector('#ed-swatches [data-a="ed-color-auto"]').click(); r.unlocked = UI.ed.d.color_locked === false && UI.ed.d.color_hex === S.binders.find(x => x.speaking_code === 'KC7').color_hex;
    document.querySelector('#ed-swatches .co-fam .sw:nth-child(3)').click();
    $('#ed-speaking_code').value = 'KED1'; $('#ed-speaking_code').dispatchEvent(new Event('input', {bubbles:true}));
    saveEditor();
    const b = S.binders.find(x => x.speaking_code === 'KED1'); r.saved = !!b && b.color_locked === true && b.color_hex === colorShades('Ktest')[2];
    return r;
  });
  ok(Kv.live === Kv.exp && Kv.auto && Kv.famFirst, 'editor: colour follows company + category live, family shades shown first with "Automatico"', Kv);
  ok(Kv.lav && Kv.locked && Kv.lockShown && Kv.kept && Kv.kept2, 'editor: picking a swatch locks the colour, later company/category edits keep it', Kv);
  ok(Kv.unlocked && Kv.saved, 'editor: "Automatico" unlocks, the lock is saved with the binder', Kv);
  Kv = await p.evaluate(() => {
    const b = S.binders.find(x => x.speaking_code === 'KED1'); openEditor(b.id);
    const cat = $('#ed-category'); cat.value = 'Dichiarativi'; cat.dispatchEvent(new Event('input', {bubbles:true})); const kept = UI.ed.d.color_hex === b.color_hex; closeModal(true);
    const u = S.binders.find(x => x.speaking_code === 'KC4'); openEditor(u.id);
    const c2 = $('#ed-category'); c2.value = 'Dichiarativi'; c2.dispatchEvent(new Event('input', {bubbles:true})); const moved = colorShades('Dichiarativi').includes(UI.ed.d.color_hex); closeModal(true);
    return {kept, moved};
  });
  ok(Kv.kept && Kv.moved, 'editing an existing binder: locked colour kept, unlocked colour follows the new category', Kv);
  // category mode = v9 behaviour; manual mode
  Kv = await p.evaluate(() => {
    S.settings.colorMode = 'category';
    const r = ['Ordinaria','Semplificata','Societario','Lavoro','Dichiarativi'].map(c => colorAssign(normalizeBinder({company_name:'Kappa Ditta 1', category:c}), S.binders) === CAT_COLOR_DEFAULT[c]);
    openEditor(null); const co = $('#ed-company_name'); co.value = 'Kappa Ditta 9'; co.dispatchEvent(new Event('input', {bubbles:true})); const cat = $('#ed-category'); cat.value = 'Societario'; cat.dispatchEvent(new Event('input', {bubbles:true})); const ed = UI.ed.d.color_hex; closeModal(true);
    S.settings.colorMode = 'manual';
    const keep = colorAssign(normalizeBinder({company_name:'X', category:'Lavoro', color_hex:'#112233'}), S.binders);
    const auto = applyAutoColor(S.binders.find(x => x.speaking_code === 'KC3'));
    S.settings.colorMode = 'company';
    return {all:r.every(Boolean), ed, keep, auto};
  });
  ok(Kv.all && Kv.ed === '#7C3AED', 'category mode: one colour per category (v9 behaviour)', Kv);
  ok(Kv.keep === '#112233' && Kv.auto === false, 'manual mode: nothing is recoloured automatically', Kv);
  // Settings › Colori
  await p.evaluate(() => { S.view = 'settings'; renderAll(); }); await p.waitForTimeout(150);
  Kv = await p.evaluate(() => ({card:!!document.querySelector('#co-settings'), modes:document.querySelectorAll('#co-mode [data-a="co-mode"]').length, strips:document.querySelectorAll('#co-settings .co-strip').length, w:document.documentElement.scrollWidth <= innerWidth + 1}));
  ok(Kv.card && Kv.modes === 3 && Kv.strips >= 10 && Kv.w, 'Settings: colour section with mode, families preview, no h-scroll', Kv);
  await p.click('#co-mode [data-m="category"]'); await p.waitForTimeout(100);
  Kv = await p.evaluate(() => ({m:S.settings.colorMode, on:document.querySelector('#co-mode .on').dataset.m, log:LOG.entries[LOG.entries.length - 1].action}));
  ok(Kv.m === 'category' && Kv.on === 'category' && Kv.log === 'settings.color_mode', 'Settings: colour mode switch saved and logged', Kv);
  await p.click('#co-mode [data-m="manual"]'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => document.querySelector('[data-a="co-recolor"]').disabled), 'Settings: recolour disabled in manual mode');
  await p.click('#co-mode [data-m="company"]'); await p.waitForTimeout(100);
  Kv = await p.evaluate(() => { const U = S.binders.find(x => x.speaking_code === 'KC2'); U.color_hex = '#654321'; commit(); renderView(); return true; });
  await p.click('[data-a="co-recolor"]'); await p.waitForTimeout(150);
  Kv = await p.evaluate(() => ({c:S.binders.find(x => x.speaking_code === 'KC2').color_hex, L:S.binders.find(x => x.speaking_code === 'KC1').color_hex}));
  ok(Kv.c !== '#654321' && Kv.L === '#123456', 'Settings: "Ricolora tutti" recolours unlocked binders only', Kv);
  await p.evaluate(() => { S.lang = 'en'; renderAll(); }); await p.waitForTimeout(100);
  ok((await p.innerText('#co-settings')).includes('Spine colours'), 'Settings colour section in English');
  await p.evaluate(() => { S.lang = 'it'; renderAll(); });
  // Informazioni › Categorie: family choice + recolour with undo
  await p.evaluate(() => { S.view = 'info'; S.infoTab = 'category'; UI.infoq = ''; renderAll(); }); await p.waitForTimeout(150);
  ok(await p.evaluate(() => !!document.querySelector('[data-a="info-color"][data-k="ktest"] .co-strip')), 'Informazioni › Categorie shows the family strip');
  await p.click('[data-a="info-color"][data-k="ktest"]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => document.querySelectorAll('#info-fams [data-a="co-fam"]').length === COLOR_FAMILIES.length), 'category colour dialog lists the families');
  await p.click('#info-fams [data-f="warm"]'); await p.waitForTimeout(80);
  Kv = await p.evaluate(() => ({col:$('#info-col').value.toUpperCase(), first:document.querySelector('#info-sws .sw').dataset.c, w0:COLOR_FAMILY.warm.shades[0], on:document.querySelector('#info-fams .on').dataset.f}));
  ok(Kv.col === Kv.w0 && Kv.first === Kv.w0 && Kv.on === 'warm', 'family pick previews its shades', Kv);
  await p.check('#info-col-all'); await p.locator('.modal-f .btn-primary').last().click(); await p.waitForTimeout(200);
  Kv = await p.evaluate(() => {
    const ks = S.binders.filter(b => b.category === 'Ktest'), warm = COLOR_FAMILY.warm.shades;
    return {fam:S.settings.catFamilies.Ktest, anchor:S.settings.catColors.Ktest, unl:ks.filter(b => !b.color_locked).every(b => warm.includes(b.color_hex)), L:ks.find(b => b.speaking_code === 'KC1').color_hex, distinct:new Set(ks.filter(b => !b.color_locked).slice(0, 8).map(b => b.color_hex)).size};
  });
  ok(Kv.fam === 'warm' && !Kv.anchor && Kv.unl && Kv.L === '#123456' && Kv.distinct >= 7, 'Informazioni: choosing a family recolours the unlocked binders of the category in that family', Kv);
  Kv = await p.evaluate(() => { const btn = [...document.querySelectorAll('.toast-act')].pop(); btn && btn.click(); const ks = S.binders.filter(b => b.category === 'Ktest'); return {fam:(S.settings.catFamilies || {}).Ktest || '', warm:ks.filter(b => COLOR_FAMILY.warm.shades.includes(b.color_hex)).length, n:ks.length}; });
  ok(!Kv.fam && Kv.warm < Kv.n / 2, 'Informazioni family change can be undone', Kv);
  // JSON / CSV / SQLite round trip of the lock flag
  Kv = await p.evaluate(async () => {
    const r = {};
    const L = S.binders.find(x => x.speaking_code === 'KC1');
    r.cols = CSV_COLUMNS[CSV_COLUMNS.length - 1] === 'color_locked' && binderToCsvRow(L).length === CSV_COLUMNS.length;
    const W = JSON.parse(workspaceJSON()); r.json = W.binders.find(x => x.speaking_code === 'KC1').color_locked === true && W.binders.find(x => x.speaking_code === 'KC2').color_locked === false;
    const csv = toCSV([CSV_COLUMNS].concat(['KC1','KC2'].map(c => binderToCsvRow(S.binders.find(x => x.speaking_code === c)).map(safeCell))), ';');
    analyzeImport(csv); const rows = UI.importParsed.rows; r.csv = rows[0].p.color_locked === true && rows[1].p.color_locked === false && rows[0].p.color_hex === '#123456';
    // older CSV (no color_locked column): hand-picked colours are locked, automatic ones are not
    analyzeImport('speaking_code;company_name;category;color_hex\nKOLD1;Kold Uno;Ordinaria;#123456\nKOLD2;Kold Due;Ordinaria;#2563EB\nKOLD3;Kold Tre;Ktest;\n');
    const o = UI.importParsed.rows; r.old = o.length === 3 && o[0].p.color_locked === true && !o[1].p.color_locked && colorShades('Ktest').includes(o[2].p.color_hex) && !o[2].p.color_locked;
    UI.importParsed = null;
    // SQLite
    dbSyncFromState('test'); const WS = dbReadWorkspace(DB.db);
    r.sql = WS.binders.find(x => x.speaking_code === 'KC1').color_locked === true && WS.binders.find(x => x.speaking_code === 'KC2').color_locked === false;
    r.col = dbQuery('PRAGMA table_info(binders)').some(c => c.name === 'color_locked') && DB_SCHEMA_VERSION >= 6;
    const d = new DB.SQL.Database(); d.exec("CREATE TABLE binders(id TEXT PRIMARY KEY, speaking_code TEXT NOT NULL UNIQUE, company_name TEXT, category TEXT, color_hex TEXT, binder_title TEXT, room_code TEXT, cabinet_code TEXT, shelf_code TEXT, sector_code TEXT, location_code TEXT, archive_state TEXT, tags TEXT, short_code TEXT UNIQUE, short_url TEXT, final_destination TEXT, final_destination_custom TEXT, selected_for_print INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT)");
    dbMigrate(d); r.migr = dbQuery('PRAGMA table_info(binders)', null, d).some(c => c.name === 'color_locked'); d.close();
    // pre-v10 state: hand-picked colours locked on upgrade, nothing recoloured
    const m = migrate({schema:26.9, settings:{}, binders:[{speaking_code:'KM1', category:'Ordinaria', color_hex:'#123456'}, {speaking_code:'KM2', category:'Ordinaria', color_hex:'#2563EB'}, {speaking_code:'KM3', category:'Lavoro', color_hex:'#D97706'}]});
    r.mig = m.binders.map(b => b.color_locked + b.color_hex).join() === 'true#123456,false#2563EB,false#D97706' && m.settings.colorMode === 'company';
    const m2 = migrate({schema:26.9, settings:{colorMode:'company'}, binders:[{speaking_code:'KM1', category:'Ordinaria', color_hex:'#123456'}]});
    r.mig2 = m2.binders[0].color_locked === false;
    return r;
  });
  ok(Kv.cols && Kv.json, 'color_locked: appended CSV column, saved in workspace JSON', Kv);
  ok(Kv.csv && Kv.old, 'color_locked: CSV round trip; older CSV without the column imports (hand-picked colours locked, missing ones automatic)', Kv);
  ok(Kv.sql && Kv.col && Kv.migr, 'color_locked: SQLite column, round trip and additive migration of old databases', Kv);
  ok(Kv.mig && Kv.mig2, 'upgrade from v9: colours unchanged, hand-picked ones locked', Kv);
  // help topic
  ok(await p.evaluate(() => HELP_TOPICS.some(h => h.id === 'colors' && h.body.it && h.body.en)), 'help topic "colors" (IT + EN)');
  // clean up
  await p.evaluate(() => { const K = JSON.parse(window.__Ksnap); delete window.__Ksnap; S.binders = K.binders.map(normalizeBinder); S.settings = K.settings; S.view = K.view; S.infoTab = K.infoTab; S.lang = K.lang; UI.importParsed = null; infoApplyCatColors(); commit(); renderAll(); });
  ok(await p.evaluate(() => !S.binders.some(b => /^K(C|ED|X|OLD|M)/.test(b.speaking_code))), 'stream K test data removed');

  // @@STREAM-R@@
  // ===== v10 stream R (PDF maximum compatibility + page selection / order for print and PDF) =====
  sec('v10 R: PDF compatibility + Pagine');
  {
    const cp = require('child_process'), zlib = require('zlib');
    const RK = 300 / 25.4;
    fs.writeFileSync('shots/r_pdf.py', [
      'import sys, json, pypdfium2 as pd',
      'src, pre, dpi = sys.argv[1], sys.argv[2], int(sys.argv[3])',
      'd = pd.PdfDocument(src); out = {"pages": len(d), "text": []}',
      'for i in range(len(d)):',
      '    pg = d[i]; out["text"].append(pg.get_textpage().get_text_range())',
      '    if dpi: pg.render(scale=dpi / 72).to_pil().convert("RGBA").save("%s_%d.png" % (pre, i))',
      'try:',
      '    import pikepdf',
      '    q = pikepdf.open(src); out["pikepdf"] = [str(x) for x in q.check_pdf_syntax()] if hasattr(q, "check_pdf_syntax") else [str(x) for x in q.check()]',
      'except ImportError: out["pikepdf"] = None',
      'print(json.dumps(out))'].join('\n'));
    fs.writeFileSync('shots/r_cmp.py', [
      'import sys, json, numpy as np, pypdfium2 as pd',
      'from numpy.lib.stride_tricks import sliding_window_view',
      'def ren(f): return np.asarray(pd.PdfDocument(f)[0].render(scale=300 / 72).to_pil().convert("L"), dtype=np.int16)',
      'a, b = ren(sys.argv[1]), ren(sys.argv[2]); h, w = min(a.shape[0], b.shape[0]), min(a.shape[1], b.shape[1]); a = a[:h, :w]; b = b[:h, :w]',
      'ink = ((a < 200) | (b < 200)).sum(); big = np.abs(a - b) > 96',
      'near = np.min(np.abs(sliding_window_view(np.pad(b, 1, mode="edge"), (3, 3)) - a[:, :, None, None]), axis=(2, 3)) > 96',
      'print(json.dumps({"page": float(big.mean()), "ink": float(big.sum() / max(1, ink)), "ink1px": float(near.sum() / max(1, ink))}))'].join('\n'));
    const rInfo = (file, pre, dpi) => JSON.parse(cp.execSync('python3 shots/r_pdf.py ' + file + ' ' + pre + ' ' + (dpi || 0), {maxBuffer:1 << 26}).toString());
    const rDecode = (png, slots, w, h) => slots.map(s => {
      const x0 = Math.floor(s.x * RK), y0 = Math.floor(s.y * RK), W = Math.min(Math.floor(w * RK), png.width - x0), H = Math.min(Math.floor(h * RK), png.height - y0);
      const d = new Uint8ClampedArray(W * H * 4);
      for (let j = 0; j < H; j++){ const st = ((y0 + j) * png.width + x0) * 4; d.set(png.data.subarray(st, st + W * 4), j * W * 4); }
      for (const f of [1, 2, 4]){
        let e = d, w2 = W, h2 = H;
        if (f > 1){ w2 = Math.floor(W / f); h2 = Math.floor(H / f); e = new Uint8ClampedArray(w2 * h2 * 4);
          for (let j = 0; j < h2; j++) for (let i = 0; i < w2; i++){ const a = ((j * f) * W + i * f) * 4, b = (j * w2 + i) * 4; e[b] = d[a]; e[b+1] = d[a+1]; e[b+2] = d[a+2]; e[b+3] = 255; } }
        const r = jsQR(e, w2, h2);
        if (r && r.data){ const L = r.location, c = [L.topLeftCorner, L.topRightCorner, L.bottomLeftCorner, L.bottomRightCorner];
          return {data:r.data, cx:s.x + c.reduce((a, q) => a + q.x, 0) / 4 * f / RK, cy:s.y + c.reduce((a, q) => a + q.y, 0) / 4 * f / RK}; }
      }
      return {data:null};
    });
    const rDownload = async (file) => {
      const [dl] = await Promise.all([p.waitForEvent('download', {timeout:60000}), p.click('#btn-pdf')]);
      await dl.saveAs(file); await p.waitForTimeout(150);
      return p.evaluate(() => { const m = !!(topModal() && topModal().textContent.includes(t('pdf_after_t'))); while (topModal()) closeModal(true); return {modal:m, last:PDF.last}; });
    };
    const rBrowserPrint = async (file) => {
      await p.evaluate(() => { document.getElementById('page-style').textContent = '@page{size:210mm 297mm;margin:0mm}'; document.getElementById('print-root').innerHTML = buildLabelSheets(false).join(''); });
      await p.emulateMedia({media:'print'}); fs.writeFileSync(file, await p.pdf({width:'210mm', height:'297mm', printBackground:true, preferCSSPageSize:true})); await p.emulateMedia({media:'screen'});
      await p.evaluate(() => { document.getElementById('print-root').innerHTML = ''; });
    };
    // slots (with calibration offsets) of every ORIGINAL page
    const rLayout = () => p.evaluate(() => { const g = S.print.geometry, ox = +S.print.offsetX || 0, oy = +S.print.offsetY || 0;
      return {w:g.w, h:g.h, pages:layoutLabels().pages.map(pg => pg.map(x => ({s:x.s, url:x.item.b.short_url, code:x.item.b.speaking_code, x:slotRect(x.s).x + ox, y:slotRect(x.s).y + oy})))}; });
    const rSetup = (pr, m, extra) => p.evaluate(([pr, m, extra]) => {
      while (topModal()) closeModal(true); const P = findPreset(pr); S.print.presetId = pr; S.print.geometry = geoFromPreset(P); S.print.geometryModified = false; S.print.contentMode = m; S.print.qrMode = 'live';
      S.print.offsetX = 0; S.print.offsetY = 0; S.print.pages = {sel:'all', reverse:false, order:null, sig:''}; S.print.pdfCmyk = false; S.usedSlots = {};
      Object.assign(S.print, extra || {}); S.view = 'print'; renderAll();
    }, [pr, m, extra]);
    const rPrev = await p.evaluate(() => ({print:JSON.parse(JSON.stringify(S.print)), used:JSON.parse(JSON.stringify(S.usedSlots)), sel:S.binders.filter(b => b.selected_for_print).map(b => b.id), n:S.binders.length, lang:S.lang}));
    await p.evaluate(() => { S.binders.forEach(b => { b.selected_for_print = !isDemo(b) || !S.settings.hideDemo; }); });

    // ---- 1. structure of the PDF (raw file) + QR vs browser print, 3 presets ----
    const rCases = [['mrink143', 'info', {}], ['l7160', 'info', {}], ['l7163', 'u', {}]];
    for (const [pr, m, extra] of rCases){
      await rSetup(pr, m, extra);
      const lay = await rLayout(), file = 'shots/r_' + pr + '.pdf';
      const dl = await rDownload(file);
      const raw = fs.readFileSync(file), s = raw.toString('latin1');
      if (pr === 'mrink143'){
        ok(s.startsWith('%PDF-1.4\n%') && raw.subarray(10, 14).every(c => c >= 128), 'PDF: header %PDF-1.4 + binary comment line');
        const sx = +/startxref\s+(\d+)\s+%%EOF\s*$/.exec(s)[1], xm = /^xref\n0 (\d+)\n/.exec(s.slice(sx));
        let badOff = xm ? 0 : 99; const n = xm ? +xm[1] : 0, body = s.slice(sx + (xm ? xm[0].length : 0));
        for (let i = 1; i < n; i++){ const e = body.slice(i * 20, i * 20 + 20); if (!/^\d{10} 00000 n \n$/.test(e) || !s.startsWith(i + ' 0 obj', +e.slice(0, 10))) badOff++; }
        ok(xm && badOff === 0 && n > 10 && body.startsWith('0000000000 65535 f \n'), 'PDF: classic xref table, every byte offset exact (' + n + ' objects)', badOff);
        ok(!/\/ObjStm|\/Type\s*\/XRef/.test(s), 'PDF: no object streams / xref streams');
        ok(/trailer\n<< \/Size \d+ \/Root \d+ 0 R \/Info \d+ 0 R \/ID \[<[0-9a-f]{32}> <[0-9a-f]{32}>\] >>/.test(s), 'PDF: trailer with /ID and /Info');
        ok(/\/ViewerPreferences << \/PrintScaling \/None/.test(s), 'PDF: /PrintScaling /None (Acrobat defaults to 100%)');
        ok(/\/Type \/Metadata \/Subtype \/XML/.test(s) && s.includes('<x:xmpmeta') && s.includes('<pdf:Producer>DocMap 2026</pdf:Producer>') && /\/ModDate \(D:\d{14}/.test(s), 'PDF: XMP metadata + /Info dates');
        ok(!/\/SMask|\/Group|\/BM\s|\/Annots|\/AcroForm|\/JavaScript|\/ExtGState/.test(s) && !/\/(ca|CA)\s+0?\.\d/.test(s), 'PDF: no transparency (SMask/Group/ca/CA), no annotations, forms or scripts');
        const nT0 = (s.match(/\/Subtype \/Type0/g) || []).length, nFF = (s.match(/\/FontFile2 \d+ 0 R/g) || []).length, nCid = (s.match(/\/CIDToGIDMap \/Identity/g) || []).length, nTU = (s.match(/\/ToUnicode \d+ 0 R/g) || []).length, nSet = (s.match(/\/CIDSet \d+ 0 R/g) || []).length;
        ok(nT0 > 0 && nT0 === nFF && nT0 === nCid && nT0 === nTU && nT0 === nSet && /\/W \[/.test(s) && /\/BaseFont \/[A-Z]{6}\+Inter-/.test(s) && !/\/Type3/.test(s), `PDF: all ${nT0} fonts embedded (FontFile2 + CIDToGIDMap + W + CIDSet + ToUnicode, subset tags)`, [nT0, nFF, nCid, nTU, nSet]);
        const box = /\/MediaBox \[0 0 595\.276 841\.89\] \/CropBox \[0 0 595\.276 841\.89\] \/BleedBox \[0 0 595\.276 841\.89\] \/TrimBox \[0 0 595\.276 841\.89\] \/Rotate 0/;
        ok(box.test(s) && (s.match(/\/Type \/Page /g) || []).length === (s.match(/\/TrimBox \[0 0 595\.276 841\.89\]/g) || []).length, 'PDF: MediaBox = CropBox = BleedBox = TrimBox = A4, Rotate 0 on every page');
        // content streams: no hairlines, line widths >= 0.1 pt (sheet px * 0.75)
        const streams = []; const re = /<< ([^>]*?)\/Length (\d+) >>\nstream\n/g; let mm;
        while ((mm = re.exec(s))){ const st = mm.index + mm[0].length, b = raw.subarray(st, st + +mm[2]); if (/Length1|Subtype|CIDSet/.test(mm[1])) continue; try { streams.push(/FlateDecode/.test(mm[1]) ? zlib.inflateSync(b).toString('latin1') : b.toString('latin1')); } catch(e){} }
        const cont = streams.filter(x => /\bcm\n/.test(x) || / Tm \[/.test(x)).join('\n'), lws = (cont.match(/(?:^|\s)([\d.]+) w(?=\s)/g) || []).map(x => parseFloat(x));
        ok(cont.length > 1000 && lws.length > 0 && Math.min(...lws) * 0.75 >= 0.0999, 'PDF: every stroke at least 0.1 pt (min ' + (Math.min(...lws) * 0.75).toFixed(3) + ' pt)', lws.slice(0, 5));
        ok(/re \d+ \d+ \d+ (?:[2-9]|\d\d+) re/.test(cont) && !/re f\n0 0 0 rg [^\n]*re f\n0 0 0 rg/.test(cont), 'PDF: QR modules merged into multi-row rectangles in one fill');
        ok(/0\.8\d+ 0\.8\d+ 0\.8\d+ RG/.test(cont), 'PDF: faint MRINK143 cut line flattened to a solid light grey (no alpha)');
      }
      const inf = rInfo(file, 'shots/r_' + pr, 300);
      ok(inf.pikepdf === null || inf.pikepdf.length === 0, `PDF ${pr}: qpdf/pikepdf syntax check clean`, inf.pikepdf);
      if (inf.pikepdf === null) console.log('  (pikepdf not installed: qpdf check skipped)');
      await rBrowserPrint('shots/r_' + pr + '_print.pdf'); rInfo('shots/r_' + pr + '_print.pdf', 'shots/r_' + pr + '_print', 300);
      const mine = rDecode(PNG.sync.read(fs.readFileSync('shots/r_' + pr + '_0.png')), lay.pages[0], lay.w, lay.h);
      const ref = rDecode(PNG.sync.read(fs.readFileSync('shots/r_' + pr + '_print_0.png')), lay.pages[0], lay.w, lay.h);
      const good = mine.filter((q, i) => q.data === lay.pages[0][i].url).length;
      const dmax = Math.max(...mine.map((q, i) => q.data && ref[i].data ? Math.hypot(q.cx - ref[i].cx, q.cy - ref[i].cy) : 99));
      const cmp = JSON.parse(cp.execSync('python3 shots/r_cmp.py shots/r_' + pr + '_print.pdf shots/r_' + pr + '.pdf').toString());
      console.log(`  PDF ${pr}/${m}: ${dl.last.bytes} bytes, QR centre max delta vs browser print ${dmax.toFixed(3)} mm, pixel diff ${(cmp.page * 100).toFixed(2)}% of page / ${(cmp.ink * 100).toFixed(1)}% of ink (${(cmp.ink1px * 100).toFixed(2)}% of ink with 1 px tolerance)`);
      ok(good === lay.pages[0].length && good > 0, `PDF ${pr}/${m}: every QR decodes ${good}/${lay.pages[0].length}`, mine.map(q => q.data));
      ok(dmax < 0.3, `PDF ${pr}/${m}: QR centres within 0.3 mm of the browser print (${dmax.toFixed(3)} mm)`);
      ok(cmp.ink1px < 0.06 && cmp.page < 0.04, `PDF ${pr}/${m}: renders like the browser print (pixel diff ${(cmp.ink1px * 100).toFixed(2)}% of ink at 1 px tolerance)`, cmp);
    }

    // ---- 2. K-only black option ----
    await rSetup('mrink143', 'info', {pdfCmyk:false});
    ok(await p.isVisible('#pr-pages [data-a="pdf-cmyk"]'), 'Pagine panel: "PDF per tipografia" checkbox');
    await p.click('#pr-pages [data-a="pdf-cmyk"]');
    ok(await p.evaluate(() => S.print.pdfCmyk === true), 'CMYK option stored in S.print.pdfCmyk');
    const rLayK = await rLayout();
    const rk = await rDownload('shots/r_cmyk.pdf');
    {
      const raw = fs.readFileSync('shots/r_cmyk.pdf'), s = raw.toString('latin1'), streams = [];
      const re = /<< ([^>]*?)\/Length (\d+) >>\nstream\n/g; let mm;
      while ((mm = re.exec(s))){ const st = mm.index + mm[0].length, b = raw.subarray(st, st + +mm[2]); if (/Length1|CIDSet/.test(mm[1])) continue; try { streams.push(/FlateDecode/.test(mm[1]) ? zlib.inflateSync(b).toString('latin1') : b.toString('latin1')); } catch(e){} }
      const cont = streams.filter(x => / Tm \[/.test(x)).join('\n');
      const texts = cont.match(/BT \/F\d+ 1 Tf [^\n]*? Tm/g) || [];
      ok(rk.last.pages >= 1 && cont.length > 1000 && !/\s(rg|RG)\s/.test(cont), 'CMYK PDF: no DeviceRGB operators left', (cont.match(/[^\n]{0,30} rg\s/) || [''])[0]);
      ok(texts.length > 10 && texts.filter(x => / 0 0 0 1 k /.test(x)).length >= texts.length * 0.6 && /0 0 0 1 k \d+ \d+ \d+ \d+ re/.test(cont), 'CMYK PDF: black text and QR modules are K-only 0/0/0/100', texts.slice(0, 3));
      ok(/<pdf:Keywords>DocMap, DM26, CMYK<\/pdf:Keywords>/.test(s), 'CMYK PDF: tagged CMYK in the metadata');
      rInfo('shots/r_cmyk.pdf', 'shots/r_cmyk', 300);
      const q = rDecode(PNG.sync.read(fs.readFileSync('shots/r_cmyk_0.png')), rLayK.pages[0], rLayK.w, rLayK.h);
      ok(q.every((x, i) => x.data === rLayK.pages[0][i].url), 'CMYK PDF: every QR decodes', q.map(x => x.data));
    }
    await p.evaluate(() => { S.print.pdfCmyk = false; savePrefs(); });

    // ---- 3. page selection / order: print DOM + PDF ----
    // 20 test binders only → MRINK143 info (8 per sheet) = 3 sheets (8, 8, 4)
    await p.evaluate(() => { S.binders.forEach(b => b.selected_for_print = false); const base = S.binders[0];
      for (let i = 0; i < 20; i++){ const x = normalizeBinder(clone(base)); x.id = uuid(); x.speaking_code = 'RP' + String(i).padStart(2, '0'); x.short_code = newShortCode(); x.short_url = shortUrl(x.short_code); x.tags = 'rtest'; x.selected_for_print = true; S.binders.push(x); }
      ensureIntegrity(); commit(); });
    await rSetup('mrink143', 'info');
    let rL = await rLayout();
    // multi-sheet job: the browser print must not lose the bottom row of turned labels (Chrome fragmented them before v10) and the PDF must match it
    await rBrowserPrint('shots/r_multi_print.pdf'); await rDownload('shots/r_multi.pdf');
    {
      const a = rInfo('shots/r_multi_print.pdf', 'x', 0), b = rInfo('shots/r_multi.pdf', 'x', 0), cnt = (txt) => (txt.match(/Creata/g) || []).length;
      ok(a.pages === 3 && b.pages === 3 && rL.pages.every((pg, i) => cnt(a.text[i]) === pg.length && cnt(b.text[i]) === pg.length), 'multi-sheet MRINK143 job: every label complete on every sheet, in the browser print and in the PDF', [a.text.map(cnt), b.text.map(cnt)]);
    }
    ok(rL.pages.length === 3 && await p.evaluate(() => (document.getElementById('pg-count') || {}).textContent || '') === '3 fogli in questa stampa', 'Pagine panel shows the number of sheets (3)');
    // which original pages, in which order, are in an output (via the QR aria-labels in the sheets)
    const rOut = (sheets) => sheets.map(h => { const urls = (h.match(/aria-label="QR ([^"]+)"/g) || []).map(x => x.slice(15, -1)); const key = urls.slice().sort().join(); return rL.pages.findIndex(pg => pg.map(x => x.url).sort().join() === key) + 1; });   // sheets list slots in physical order
    const rPrintDom = () => p.evaluate(async () => { let got = null; const o = window.print; window.print = () => { got = [...document.querySelectorAll('#print-root .sheet')].map(x => x.outerHTML); }; await printLabels(); window.print = o; const modal = !!topModal(); while (topModal()) closeModal(true); return {got, modal}; });
    const rType = async (v) => { await p.fill('#pg-sel', v); await p.dispatchEvent('#pg-sel', 'change'); await p.waitForTimeout(60); };
    await rType('2');
    let rv = await p.evaluate(() => ({cfg:S.print.pages, n:buildLabelSheets(false).length}));
    ok(rv.cfg.sel === '2' && rv.cfg.sig && rv.n === 1, 'page selection "2": one sheet', rv);
    let rp = await rPrintDom();
    ok(rp.got && rOut(rp.got).join() === '2' && !rp.modal, 'print "2": only sheet 2 goes to the printer, no partial-sheet question (last sheet not printed)', rp.got && rOut(rp.got));
    ok((await p.innerText('#pv-scroll')).includes('Foglio 2'), 'preview shows the selected sheet with its original number');
    await rType('3,1'); rp = await rPrintDom();
    ok(rOut(rp.got).join() === '1,3' && rp.modal, 'range "3,1" = sheets 1 and 3 in sheet order; last sheet printed → partial-sheet question', rOut(rp.got));
    await rType('2-'); rp = await rPrintDom();
    ok(rOut(rp.got).join() === '2,3', 'range "2-" = sheets 2 to the end', rOut(rp.got));
    await rType('1-9');
    ok(await p.evaluate(() => !!document.querySelector('#pr-pages .err-t')) && rOut(await p.evaluate(() => buildLabelSheets(false))).join() === '1,2,3', 'range beyond the last sheet: warning, existing sheets kept');
    await rType('7');
    rv = await p.evaluate(async () => { const o = window.print; let called = false; window.print = () => { called = true; }; await printLabels(); window.print = o; return {called, empty:!!document.getElementById('pg-empty'), toast:[...document.querySelectorAll('.toast')].some(x => x.textContent.includes(t('pg_none')))}; });
    ok(!rv.called && rv.empty && rv.toast, 'no existing page selected: print refused with a message', rv);
    await p.click('#pr-pages [data-a="pg-all"]');
    await p.click('#pr-pages [data-a="pg-rev"]'); rp = await rPrintDom();
    ok(rOut(rp.got).join() === '3,2,1' && await p.evaluate(() => S.print.pages.reverse === true && !S.print.pages.sig), 'reverse order: 3,2,1', rOut(rp.got));
    await p.click('#pr-pages [data-a="pg-rev"]');
    // custom order with the page list: sheet 3 first, then sheet 1 down → 3,2,1 ... then 1 first → 1,3,2
    await p.evaluate(() => { const d = document.getElementById('pg-det'); if (d) d.open = true; });
    ok(await p.evaluate(() => document.querySelectorAll('#pr-pages .pg-row').length === 3 && document.querySelectorAll('#pr-pages .pg-row .pg-th i.f').length === 20), 'page list: 3 rows with mini thumbnails (20 filled slots)');
    ok((await p.innerText('#pr-pages .pg-row[data-p="2"]')).includes('RP16'), 'page list shows which binders are on each sheet');
    await p.click('#pr-pages .pg-row[data-p="2"] [data-a="pg-first"]');
    ok(await p.evaluate(() => S.print.pages.order.join()) === '3,1,2', 'pg-first: sheet 3 moved first');
    await p.click('#pr-pages .pg-row[data-p="0"] [data-a="pg-down"]');
    ok(await p.evaluate(() => S.print.pages.order.join()) === '3,2,1', 'pg-down: sheet 1 moved down');
    await p.click('#pr-pages .pg-row[data-p="1"] [data-a="pg-up"]');
    rp = await rPrintDom();
    ok(rOut(rp.got).join() === '2,3,1', 'custom order 2,3,1 reaches the printer', rOut(rp.got));
    await p.click('#pr-pages .pg-row[data-p="2"] [data-a="pg-tick"]');   // untick sheet 3
    rp = await rPrintDom();
    ok(rOut(rp.got).join() === '2,1' && await p.evaluate(() => S.print.pages.sel) === '1-2', 'unticking sheet 3 in the list: selection "1-2" keeps the custom order', rOut(rp.got));
    // the PDF follows the same selection and order, combined with reverse: 1,2 reversed from 2,1
    await p.click('#pr-pages [data-a="pg-rev"]');
    const rpd = await rDownload('shots/r_pages.pdf');
    const rpi = rInfo('shots/r_pages.pdf', 'shots/r_pages', 300);
    const rq = [0, 1].map(i => rDecode(PNG.sync.read(fs.readFileSync('shots/r_pages_' + i + '.png')), rL.pages[i], rL.w, rL.h));
    ok(rpi.pages === 2 && rpd.last.pages === 2 && rq[0].every((x, j) => x.data === rL.pages[0][j].url) && rq[1].every((x, j) => x.data === rL.pages[1][j].url), 'PDF with selection 1-2 + custom order + reverse: pages = sheet 1, sheet 2 with their QR codes', [rpi.pages, rq.map(q => q.map(x => x.data && x.data.slice(-6)))]);
    ok(rpi.text[0].includes('RP00') && rpi.text[1].includes('RP08') && !rpi.text.join().includes('RP16'), 'PDF text per page matches the chosen sheets');
    ok(!rpd.modal, 'PDF without the last sheet: no partial-sheet question');
    await p.click('#pr-pages [data-a="pg-reset"]');
    ok(await p.evaluate(() => JSON.stringify(pagesCfg()) === JSON.stringify({sel:'all', reverse:false, order:null, sig:''}) && buildLabelSheets(false).length === 3), 'reset: all pages, natural order');

    // ---- 4. partial sheet + reordering ----
    await p.evaluate(() => { S.usedSlots = {mrink143:[0, 1]}; refreshPrint(); });
    const rLP = await rLayout(); rL = rLP;   // rOut() now matches against the partial-sheet layout
    ok(rLP.pages.length === 3 && rLP.pages[0].length === 6 && !rLP.pages[0].some(x => x.s === 0 || x.s === 1), 'partial sheet: sheet 1 skips the 2 used slots');
    await p.evaluate(() => { const d = document.getElementById('pg-det'); if (d) d.open = true; });
    await p.click('#pr-pages .pg-row[data-p="1"] [data-a="pg-first"]');   // order 2,1,3: the partial sheet now prints second
    rv = await p.evaluate(() => { const sh = buildLabelSheets(false), lab = (h) => { const d = document.createElement('div'); d.innerHTML = h; return [...d.querySelectorAll('.slotbox')].filter(x => x.children.length).length; };
      return {n:sh.map(lab), warn:(document.getElementById('pg-partial-warn') || {}).textContent || '', badge:!!document.querySelector('.pg-row[data-p="0"] .badge')}; });
    ok(rv.n.join() === '8,6,6' && /2°/.test(rv.warn) && rv.badge, 'reordered: the partial sheet keeps its skipped slots (8,6,6 labels) and the panel says it comes out 2nd', rv);
    rp = await rPrintDom();
    ok(rOut(rp.got).join() === '2,1,3' && rp.modal, 'print with the partial sheet moved: all sheets printed, last sheet included → partial-sheet question');
    await p.evaluate(() => { S.print.pages = {sel:'2-3', reverse:false, order:null, sig:pageSig(layoutLabels())}; refreshPrint(); });
    ok(await p.evaluate(() => ((document.querySelector('#pr-pages .info-box') || {}).textContent || '').includes(t('pg_partial_x'))), 'partial sheet not selected: notice that the partial map stays');
    await p.evaluate(() => { S.usedSlots = {}; S.print.pages = {sel:'all', reverse:false, order:null, sig:''}; savePrefs(); refreshPrint(); });

    // ---- 5. queue changes invalidate the selection (with a notice); reverse survives ----
    await rType('2'); await p.click('#pr-pages [data-a="pg-rev"]');
    await p.evaluate(() => { S.binders.filter(b => b.tags === 'rtest').slice(0, 9).forEach(b => b.selected_for_print = false); commit(); S.view = 'print'; renderAll(); });
    rv = await p.evaluate(() => ({cfg:pagesCfg(), notice:!!document.getElementById('pg-notice'), n:buildLabelSheets(false).length, pages:layoutLabels().pages.length}));
    ok(rv.cfg.sel === 'all' && !rv.cfg.order && rv.cfg.reverse === true && rv.notice && rv.n === rv.pages && rv.pages === 2, 'queue changed: selection reset with a notice, reverse kept', rv);
    rv = await p.evaluate(() => { S.print.pages = {sel:'1', reverse:false, order:[2, 1], sig:'stale'}; return labelPageOrder().join(); });
    ok(rv === '0,1', 'a stale selection / order is never applied (natural order until reset)', rv);
    await p.evaluate(() => { S.print.pages = {sel:'all', reverse:false, order:null, sig:''}; savePrefs(); });

    // ---- 6. English UI, help, layout ----
    await p.evaluate(() => { S.lang = 'en'; renderAll(); });
    rv = await p.evaluate(() => ({h:document.getElementById('pr-pages-sec').innerText, w:[document.documentElement.scrollWidth, innerWidth]}));
    ok(/pages/i.test(rv.h) && /Reverse order/.test(rv.h) && /Only pages/.test(rv.h) && /PDF for print shops/.test(rv.h) && /2 sheets in this print/.test(rv.h), 'Pagine panel in English', rv.h.slice(0, 200));
    ok(rv.w[0] <= rv.w[1] + 1, 'print view with the Pages panel: no horizontal scroll', rv.w);
    ok(await p.evaluate(() => { const a = helpTopic('pages'), b = helpTopic('pdf'); return !!(a && b && a.body.it.includes('Foglio parziale') && a.body.en.includes('Reverse order') && b.body.it.includes('CMYK') && b.body.en.includes('PDF 1.4') && helpTopic('print').related.includes('pages')); }), 'help topics "pages" (new) and "pdf" (updated), IT + EN');
    // clean up
    await p.evaluate((prev) => { while (topModal()) closeModal(true); S.lang = prev.lang; S.binders = S.binders.filter(b => b.tags !== 'rtest'); S.binders.forEach(b => { b.selected_for_print = prev.sel.includes(b.id); });
      S.print = prev.print; S.usedSlots = prev.used; PDF.pgNotice = false; PDF.pgOpen = false; savePrefs(); commit(); S.view = 'archive'; renderAll(); }, rPrev);
    ok(await p.evaluate((n) => S.binders.length === n && !S.binders.some(b => b.tags === 'rtest'), rPrev.n), 'stream R tests leave the archive and print settings as they were');
  }

  // @@STREAM-M@@
  sec('v10 stream M: mobile scan page, local login, provider seams, encrypted blobs');
  const Mstart = await p.evaluate(() => nowISO());
  const MSCAN = 'file://' + require('path').resolve(__dirname, '..', 'scan.html').replace(/\\/g, '/');
  await p.evaluate(() => { ['docmap_v26_auth', 'docmap_v26_auth_fail', 'docmap_v26_scan_lang', 'docmap_v26_scan_user', 'docmap_v26_scan_outbox'].forEach(k => localStorage.removeItem(k)); });
  const Mb = await p.evaluate(async () => {
    const b = normalizeBinder({speaking_code:'MT1', short_code:newShortCode(), company_name:'Mobiletest Zeta S.r.l.', multi_code:'M-99001', category:'Ordinaria', binder_title:'Faldone di prova mobile',
      room_code:'A', cabinet_code:'3', shelf_code:'β', archive_state:'CURRENT', contents_items:'2025: Fatture Zeta|2025: Registri Zeta [in uso]', tags:'zeta,prova', notes:''});
    b.updated_at = '2026-01-01T10:00:00.000Z';
    S.binders.push(b); commit(); dbSyncFromState('t'); await dbPersist();
    return {id:b.id, qr:b.short_code, upd:b.updated_at};
  });
  const Mp = await ctx.newPage();
  Mp.on('pageerror', e => errs.push('MOBILE PAGEERR ' + e.message)); Mp.on('console', m => { if (m.type() === 'error') errs.push('MOBILE CONSOLE ' + m.text()); });
  await Mp.setViewportSize({width:390, height:844});
  const Murl = MSCAN + '?code=MT1&qr=' + Mb.qr;
  await Mp.goto(Murl); await Mp.waitForTimeout(500);
  const Mnoscroll = async (name) => { const w = await Mp.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(w[0] <= w[1] + 1, 'scan: no horizontal scroll at 390×844 — ' + name, w); };
  let Mv = await Mp.evaluate(() => ({txt:document.body.innerText, html:document.getElementById('app').innerHTML, form:!!document.querySelector('form[data-s="login-form"]'), view:SC.view}));
  ok(Mv.view === 'nousers' && /Nessun utente configurato: crea un utente in DocMap › Impostazioni › Utenti e accesso/.test(Mv.txt) && !Mv.form, 'scan: no users → setup message, no login form', Mv.view);
  ok(!/MT1|Mobiletest|M-99001|Zeta/.test(Mv.html), 'scan: no users → no binder data in the DOM');
  ok(/Studio Demo/.test(Mv.txt), 'scan: studio name shown logged out');
  // desktop: Impostazioni › Utenti e accesso
  await p.evaluate(() => { S.view = 'settings'; renderAll(); });
  Mv = await p.evaluate(() => ({card:!!document.querySelector('#au-card'), none:!!document.querySelector('#au-card .warn-box'), help:!!helpTopic('mobile')}));
  ok(Mv.card && Mv.none && Mv.help, 'settings: "Utenti e accesso" section with empty-state warning + help topic mobile', Mv);
  await p.click('#au-card [data-a="au-add"]'); await p.waitForTimeout(100);
  await p.fill('#au-f-user', 'MTest'); await p.fill('#au-f-name', 'Marta Test'); await p.selectOption('#au-f-role', 'editor');
  await p.fill('#au-f-pin', '246810'); await p.fill('#au-f-pin2', '246811');
  await p.locator('.modal-f .btn-primary').last().click(); await p.waitForTimeout(150);
  ok((await p.textContent('#au-f-err')).length > 3 && await p.evaluate(() => !localStorage.getItem('docmap_v26_auth')), 'settings: mismatched PIN refused');
  await p.fill('#au-f-pin2', '246810'); await p.locator('.modal-f .btn-primary').last().click(); await p.waitForTimeout(900);
  Mv = await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('docmap_v26_auth') || '{}'); const u = (st.users || [])[0] || {}; return {n:(st.users || []).length, user:u.username, role:u.role, hash:u.password_hash, row:!!document.querySelector('#au-card tr[data-uid]'), modal:!!topModal(), log:LOG.entries.some(e => e.action === 'settings.user_add')}; });
  ok(Mv.n === 1 && Mv.user === 'mtest' && Mv.role === 'editor' && Mv.row && !Mv.modal && Mv.log, 'settings: user created (normalised username, role, listed, logged)', Mv);
  ok(/^pbkdf2_sha256\$600000\$[A-Za-z0-9+\/]{22}==\$[A-Za-z0-9+\/]{43}=$/.test(Mv.hash || ''), 'auth: PBKDF2-SHA256 hash format, 600 000 iterations, salt + hash', Mv.hash);
  Mv = await p.evaluate(async () => { const st = JSON.parse(localStorage.getItem('docmap_v26_auth')); const u = st.users[0]; return {ok:await authVerifySecret('246810', u.password_hash), bad:await authVerifySecret('246811', u.password_hash), diff:(await authHashSecret('246810', 1000)) !== (await authHashSecret('246810', 1000))}; });
  ok(Mv.ok && !Mv.bad && Mv.diff, 'auth: verify right/wrong secret, per-user random salt', Mv);
  // the open scan page notices the new user and shows the login form, still without data
  await Mp.waitForTimeout(400);
  Mv = await Mp.evaluate(() => ({view:SC.view, html:document.getElementById('app').innerHTML}));
  ok(Mv.view === 'login' && !/MT1|Mobiletest|M-99001|Zeta|A3-β/.test(Mv.html), 'scan: logged out → login form only, no binder data (not even the code)', Mv.view);
  await Mnoscroll('login');
  await Mp.fill('#sc-user', 'mtest'); await Mp.fill('#sc-pin', '111111'); await Mp.click('#sc-enter'); await Mp.waitForTimeout(900);
  Mv = await Mp.evaluate(() => ({view:SC.view, err:document.getElementById('sc-login-err').textContent, fail:JSON.parse(localStorage.getItem('docmap_v26_auth_fail') || '{}').mtest, pin:document.getElementById('sc-pin').value}));
  ok(Mv.view === 'login' && /non corretti/.test(Mv.err) && Mv.fail && Mv.fail.n === 1 && Mv.pin === '', 'scan: wrong PIN refused, counter 1, PIN field cleared', Mv);
  Mv = await Mp.evaluate(async () => { const A = dmProviders().auth, r = []; for (let i = 0; i < 2; i++){ try { await A.login('mtest', '999999'); r.push('in'); } catch(e){ r.push(e.code + ':' + ((e.data && e.data.retry_in) || 0)); } }
    let right; try { await A.login('mtest', '246810'); right = 'in'; } catch(e){ right = e.code; } return {r, right, lock:A.lockInfo('mtest')}; });
  ok(Mv.r[0].startsWith('unauthorized') && /^locked:1[45]$/.test(Mv.r[1]) && Mv.right === 'locked' && Mv.lock.retry_in > 0, 'auth: backoff after 3 failures, even the right PIN waits', Mv);
  await Mp.fill('#sc-user', 'mtest'); await Mp.fill('#sc-pin', '246810'); await Mp.click('#sc-enter'); await Mp.waitForTimeout(300);
  ok(/Troppi tentativi/.test(await Mp.textContent('#sc-login-err')) && await Mp.evaluate(() => SC.view === 'login'), 'scan: locked message with countdown');
  await Mp.evaluate(() => { const f = JSON.parse(localStorage.getItem('docmap_v26_auth_fail')); f.mtest.until = Date.now() - 1; localStorage.setItem('docmap_v26_auth_fail', JSON.stringify(f)); });
  await Mp.fill('#sc-pin', '246810'); await Mp.click('#sc-enter'); await Mp.waitForTimeout(1200);
  Mv = await Mp.evaluate(() => ({view:SC.view, txt:document.body.innerText, edit:!!document.querySelector('#sc-edit'), code:(document.querySelector('#sc-code') || {}).textContent, loc:(document.querySelector('#sc-loc') || {}).textContent,
    chips:Array.from(document.querySelectorAll('#sc-items .sc-ci')).map(x => x.textContent), fail:JSON.parse(localStorage.getItem('docmap_v26_auth_fail') || '{}').mtest, ss:sessionStorage.getItem('docmap_v26_session')}));
  ok(Mv.view === 'card' && Mv.code === 'MT1' && /Mobiletest Zeta S\.r\.l\./.test(Mv.txt) && /M-99001/.test(Mv.txt) && Mv.loc === 'A3-β' && /Ripiano β \(2° dall'alto\)/.test(Mv.txt), 'scan: right PIN → binder card (code, Multi, company, location + hint)', Mv);
  ok(Mv.chips.join('|') === 'In archivio|In uso' && Mv.edit && /Ultima modifica/.test(Mv.txt) && !Mv.fail, 'scan: contents with status chips, big edit button for editor, counter reset', Mv.chips);
  ok(Mv.ss && !/246810/.test(Mv.ss) && /"exp":\d+/.test(Mv.ss), 'auth: session in sessionStorage with expiry, no secret inside');
  await Mnoscroll('card');
  // no plaintext PIN anywhere in web storage or IndexedDB
  Mv = await Mp.evaluate(async () => {
    const all = []; for (let i = 0; i < localStorage.length; i++) all.push(localStorage.getItem(localStorage.key(i))); for (let i = 0; i < sessionStorage.length; i++) all.push(sessionStorage.getItem(sessionStorage.key(i)));
    const dbBytes = await new Promise(res => { const r = indexedDB.open('docmap_v26_sqlite', 1); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('db'); q.onsuccess = () => res(q.result); }; });
    const s = new TextDecoder('latin1').decode(dbBytes);
    return {ls:all.some(v => String(v).includes('246810')), db:s.includes('246810') || s.includes('pbkdf2_sha256')};
  });
  ok(!Mv.ls && !Mv.db, 'auth: no plaintext PIN in localStorage/sessionStorage, no credentials in the SQLite file', Mv);
  // viewer: no edit button
  await p.evaluate(async () => { await dmProviders().auth.addUser({username:'mview', display_name:'Vera', role:'viewer', secret:'135790'}); });
  await Mp.click('[data-s="logout"]'); await Mp.waitForTimeout(200);
  ok(await Mp.evaluate(() => SC.view === 'login' && !/MT1/.test(document.getElementById('app').innerHTML) && !sessionStorage.getItem('docmap_v26_session')), 'scan: logout clears the session and the data');
  await Mp.fill('#sc-user', 'mview'); await Mp.fill('#sc-pin', '135790'); await Mp.click('#sc-enter'); await Mp.waitForTimeout(1000);
  Mv = await Mp.evaluate(() => ({view:SC.view, edit:!!document.querySelector('#sc-edit'), ro:!!document.querySelector('.sc-ro'), can:dmProviders().auth.can('edit')}));
  ok(Mv.view === 'card' && !Mv.edit && Mv.ro && !Mv.can, 'scan: viewer sees the card without the edit button', Mv);
  Mv = await Mp.evaluate(() => { const s = JSON.parse(sessionStorage.getItem('docmap_v26_session')); const st = JSON.parse(localStorage.getItem('docmap_v26_auth')); s.role = 'admin'; sessionStorage.setItem('docmap_v26_session', JSON.stringify(s)); return dmProviders().auth.currentUser().role; });
  ok(Mv === 'viewer', 'auth: role always read from the user store, not from the session object', Mv);
  await Mp.click('[data-s="logout"]'); await Mp.waitForTimeout(150);
  await Mp.fill('#sc-user', 'mtest'); await Mp.fill('#sc-pin', '246810'); await Mp.click('#sc-enter'); await Mp.waitForTimeout(1000);
  // editor edits state, item status, location, notes, tags
  await Mp.click('#sc-edit'); await Mp.waitForTimeout(150);
  ok(await Mp.evaluate(() => SC.view === 'edit' && document.querySelectorAll('[data-s="state"]').length === 3 && document.querySelectorAll('[data-s="ci"]').length === 6), 'scan: mobile edit form (state, item status)');
  await Mnoscroll('edit');
  await Mp.click('[data-s="state"][data-v="CHECKED_OUT"]'); await Mp.click('[data-s="ci"][data-i="0"][data-v="client"]'); await Mp.click('[data-s="ci"][data-i="1"][data-v="archive"]');
  await Mp.fill('#sc-quick', 'b2 gamma dx'); await Mp.waitForTimeout(50);
  Mv = await Mp.evaluate(() => ({prev:document.getElementById('sc-quick-prev').textContent, room:SC.draft.room_code, shelf:SC.draft.shelf_code, sec:SC.draft.sector_code}));
  ok(Mv.prev === 'B2-γ-DX' && Mv.room === 'B' && Mv.shelf === 'γ' && Mv.sec === 'DX', 'scan: quick position parsed like the desktop (b2 gamma dx → B2-γ-DX)', Mv);
  await Mp.fill('#sc-notes-in', 'Portato in sala riunioni'); await Mp.fill('#sc-tags-in', 'zeta, prova, riunione');
  const Mdesk0 = await p.evaluate((id) => S.binders.find(b => b.id === id).updated_at, Mb.id);
  await Mp.click('#sc-save'); await Mp.waitForTimeout(600);
  Mv = await Mp.evaluate(() => ({view:SC.view, msg:(document.querySelector('.sc-msg.ok') || {}).textContent, loc:(document.querySelector('#sc-loc') || {}).textContent, notes:(document.querySelector('#sc-notes') || {}).textContent}));
  ok(Mv.view === 'card' && /Salvato/.test(Mv.msg || '') && Mv.loc === 'B2-γ-DX' && Mv.notes === 'Portato in sala riunioni', 'scan: save → success feedback, card updated', Mv);
  Mv = await p.evaluate((id) => { const b = S.binders.find(x => x.id === id); return {st:b.archive_state, loc:b.location_code, ci:b.contents_items.map(i => i.status).join(','), notes:b.notes, tags:b.tags, upd:b.updated_at, banner:otherTabChanged}; }, Mb.id);
  ok(Mv.st === 'CHECKED_OUT' && Mv.loc === 'B2-γ-DX' && Mv.ci === 'client,archive' && Mv.tags === 'zeta,prova,riunione' && Mv.upd > Mdesk0 && !Mv.banner, 'desktop: open app merges the mobile edit live (no reload banner)', Mv);
  await p.reload(); await p.waitForTimeout(1800);
  Mv = await p.evaluate((id) => { const b = S.binders.find(x => x.id === id); const e = LOG.entries.filter(x => x.source === 'mobile' && x.target && x.target.id === id);
    const row = DB.ready ? dbQuery("SELECT source, who, action FROM activity_log WHERE target_id = ? AND source = 'mobile'", [id]) : [];
    return {st:b.archive_state, loc:b.location_code, notes:b.notes, ci:b.contents_items.map(i => i.status).join(','), upd:b.updated_at, n:e.length, act:e[0] && e[0].action, who:e[0] && e[0].who, keys:e[0] ? Object.keys(e[0].details.changed).sort().join(',') : '', base:e[0] && e[0].details.base_updated_at, row:row.length, rowSrc:row[0] && row[0].source}; }, Mb.id);
  ok(Mv.st === 'CHECKED_OUT' && Mv.loc === 'B2-γ-DX' && Mv.notes === 'Portato in sala riunioni' && Mv.ci === 'client,archive' && Mv.upd > Mb.upd, 'desktop after reload: mobile changes persisted, updated_at bumped', Mv);
  ok(Mv.n === 1 && Mv.act === 'binder.edit' && Mv.who === 'Marta Test' && Mv.keys === 'archive_state,cabinet_code,contents_items,location_code,notes,room_code,sector_code,shelf_code,tags' && Mv.base === Mb.upd && Mv.row === 1 && Mv.rowSrc === 'mobile', 'desktop: activity log entry source "mobile" with diff (memory + SQLite)', Mv);
  await p.evaluate(() => { S.view = 'log'; renderAll(); });
  ok(/mobile/.test(await p.textContent('#lg-results')), 'log view shows the "mobile" source');
  // conflict: the desktop changes the same binder while the phone is editing
  await Mp.click('#sc-edit'); await Mp.waitForTimeout(100);
  await p.evaluate((id) => { const b = S.binders.find(x => x.id === id); b.notes = 'Cambiato dal PC'; b.updated_at = nowISO(); commit(); }, Mb.id);
  await Mp.waitForTimeout(300);
  ok(await Mp.evaluate(() => SC.stale === true && /appena cambiato/.test(document.body.innerText)), 'scan: edit form warns that the binder changed elsewhere');
  await Mp.fill('#sc-notes-in', 'Nota dal telefono'); await Mp.click('#sc-save'); await Mp.waitForTimeout(300);
  Mv = await Mp.evaluate(() => ({view:SC.view, conflict:!!document.querySelector('#sc-conflict'), txt:(document.querySelector('#sc-conflict') || {}).textContent || ''}));
  ok(Mv.view === 'edit' && Mv.conflict && /note/.test(Mv.txt), 'scan: conflict detected (etag = updated_at), changed fields listed', Mv);
  ok(await p.evaluate((id) => S.binders.find(x => x.id === id).notes === 'Cambiato dal PC', Mb.id), 'conflict: the desktop change is not overwritten');
  await Mp.click('[data-s="conflict-reload"]'); await Mp.waitForTimeout(300);
  ok(await Mp.evaluate(() => SC.view === 'card' && document.getElementById('sc-notes').textContent === 'Cambiato dal PC'), 'conflict → reload shows the desktop version');
  await Mp.click('#sc-edit'); await Mp.waitForTimeout(100);
  await p.evaluate((id) => { const b = S.binders.find(x => x.id === id); b.tags = 'zeta,dal-pc'; b.updated_at = nowISO(); commit(); }, Mb.id);
  await Mp.waitForTimeout(200);
  await Mp.click('[data-s="state"][data-v="CURRENT"]'); await Mp.click('#sc-save'); await Mp.waitForTimeout(300);
  ok(await Mp.evaluate(() => !!document.querySelector('#sc-conflict')), 'conflict again (desktop changed tags)');
  await Mp.click('[data-s="conflict-force"]'); await Mp.waitForTimeout(400);
  Mv = await p.evaluate((id) => { const b = S.binders.find(x => x.id === id); const st = JSON.parse(localStorage.getItem(LS_KEY)).binders.find(x => x.id === id); return {st:b.archive_state, tags:b.tags, sst:st.archive_state, stags:st.tags, forced:LOG.entries.some(e => e.source === 'mobile' && e.details && e.details.forced)}; }, Mb.id);
  ok(Mv.st === 'CURRENT' && Mv.tags === 'zeta,dal-pc' && Mv.sst === 'CURRENT' && Mv.stags === 'zeta,dal-pc' && Mv.forced, 'conflict → "save anyway" writes only the patched fields (desktop tags kept)', Mv);
  // cabinet photo with the shelf highlighted (06b-photos data, read-only from the phone)
  await p.evaluate(async (id) => {
    const cv = document.createElement('canvas'); cv.width = 200; cv.height = 300; const cx = cv.getContext('2d'); cx.fillStyle = '#8B5CF6'; cx.fillRect(0, 0, 200, 300);
    const bl = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.8)); const bytes = new Uint8Array(await bl.arrayBuffer());
    DB.db.run('INSERT INTO photos(id, owner_type, owner_key, mime, data, width, height, caption, marks_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', ['mt-photo', 'cabinet', 'B2', 'image/jpeg', bytes, 200, 300, 'Armadio B2', JSON.stringify({'γ|DX':{x:0.7, y:0.4}}), nowISO()]);
    await dbPersist();
  }, Mb.id);
  await Mp.reload(); await Mp.waitForTimeout(1800);
  Mv = await Mp.evaluate(() => { const img = document.querySelector('#sc-photo img'), pin = document.querySelector('#sc-photo .sc-pinm'); return {img:!!img && img.naturalWidth === 200, pin:pin ? pin.style.left + ' ' + pin.style.top + ' ' + pin.textContent : '', view:SC.view}; });
  ok(Mv.view === 'card' && Mv.img && Mv.pin === '70% 40% B2-γ-DX', 'scan: "Dov\'è?" shows the cabinet photo with the shelf marked (session survives reload)', Mv);
  // unknown QR + manual search
  await Mp.goto(MSCAN + '?qr=dm26ZZZZZZZZ'); await Mp.waitForTimeout(500);
  Mv = await Mp.evaluate(() => ({view:SC.view, txt:document.body.innerText, logout:!!document.querySelector('#sc-notfound [data-s="logout"]')}));
  ok(Mv.view === 'notfound' && /Faldone non trovato/.test(Mv.txt) && Mv.logout && !/MT1/.test(Mv.txt), 'scan: unknown QR → "Faldone non trovato" with logout', Mv.view);
  await Mp.fill('#sc-find', 'mt1'); await Mp.press('#sc-find', 'Enter'); await Mp.waitForTimeout(400);
  ok(await Mp.evaluate(() => SC.view === 'card' && document.getElementById('sc-code').textContent === 'MT1' && /code=MT1/.test(location.search)), 'scan: search by speaking code from the not-found page');
  // English
  await Mp.click('[data-s="lang"][data-l="en"]'); await Mp.waitForTimeout(100);
  Mv = await Mp.evaluate(() => ({lang:document.documentElement.lang, txt:document.body.innerText, fab:document.getElementById('sc-edit').textContent}));
  ok(Mv.lang === 'en' && /Where is it\?/i.test(Mv.txt) && /Contents/i.test(Mv.txt) && Mv.fab === 'Edit' && /Sign out/.test(Mv.txt), 'scan: English UI', Mv.fab);
  await Mp.click('#sc-edit'); await Mp.waitForTimeout(100);
  ok(/Binder state/i.test(await Mp.innerText('body')) && /At client/.test(await Mp.innerText('body')), 'scan: English edit form');
  await Mp.click('[data-s="cancel"]'); await Mp.click('[data-s="lang"][data-l="it"]'); await Mp.waitForTimeout(100);
  // session expiry
  Mv = await Mp.evaluate(() => { const s = JSON.parse(sessionStorage.getItem('docmap_v26_session')); s.exp = Date.now() - 1000; sessionStorage.setItem('docmap_v26_session', JSON.stringify(s)); scCheckSession(); return new Promise(r => setTimeout(() => r({view:SC.view, html:document.getElementById('app').innerHTML}), 200)); });
  ok(Mv.view === 'login' && !/MT1/.test(Mv.html), 'auth: expired session → back to login, data removed', Mv.view);
  // desktop: "Anteprima mobile" in the QR window and in the binder form
  await p.evaluate(() => { S.view = 'archive'; renderAll(); });
  Mv = await p.evaluate((id) => { const b = S.binders.find(x => x.id === id); showQR(b); const r = {qr:!!document.querySelector('.overlay [data-a="mob-preview"]'), url:mobPreviewUrl(b)}; closeModal(true); openEditor(id); r.ed = !!document.querySelector('.modal-f .ed-mob'); closeModal(true); openEditor(); r.edNew = !!document.querySelector('.modal-f .ed-mob'); closeModal(true); return r; }, Mb.id);
  ok(Mv.qr && Mv.ed && !Mv.edNew && Mv.url === 'scan.html?code=MT1&qr=' + Mb.qr, 'desktop: "Anteprima mobile" in QR window and binder form (not for a new binder)', Mv);
  await p.evaluate((id) => showQR(S.binders.find(x => x.id === id)), Mb.id);
  const [Mpop] = await Promise.all([ctx.waitForEvent('page'), p.click('.overlay [data-a="mob-preview"]')]);
  await Mpop.waitForLoadState(); await Mpop.waitForTimeout(300);
  ok(/scan\.html\?code=MT1&qr=/.test(Mpop.url()) && await Mpop.evaluate(() => SC.view === 'login'), 'desktop: mobile preview opens scan.html in a new tab (login required)', Mpop.url());
  await Mpop.close(); await p.evaluate(() => { while (topModal()) closeModal(true); });
  // desktop: edit + delete a user from the settings
  await p.evaluate(() => { S.view = 'settings'; renderAll(); });
  const Muid = await p.evaluate(() => dmProviders().auth.listUsers().find(u => u.username === 'mview').id);
  await p.click('#au-card [data-a="au-edit"][data-id="' + Muid + '"]'); await p.waitForTimeout(100);
  await p.selectOption('#au-f-role', 'editor'); await p.fill('#au-f-pin', '97531'); await p.fill('#au-f-pin2', '97531');
  await p.locator('.modal-f .btn-primary').last().click(); await p.waitForTimeout(700);
  Mv = await p.evaluate(async (id) => { const u = dmProviders().auth.store().users.find(x => x.id === id); return {role:u.role, pin:await authVerifySecret('97531', u.password_hash)}; }, Muid);
  ok(Mv.role === 'editor' && Mv.pin, 'settings: edit user role + new PIN', Mv);
  await p.click('#au-card [data-a="au-del"][data-id="' + Muid + '"]'); await p.waitForTimeout(100); await p.locator('.modal-f .btn-danger-solid').last().click(); await p.waitForTimeout(150);
  ok(await p.evaluate(() => dmProviders().auth.listUsers().length === 1 && document.querySelectorAll('#au-card tr[data-uid]').length === 1), 'settings: delete user (with confirmation)');
  await p.evaluate(() => { S.lang = 'en'; renderAll(); });
  ok(/Users & access/.test(await p.textContent('#au-card h2')), 'settings: English "Users & access"');
  await p.evaluate(() => { S.lang = 'it'; renderAll(); });
  // BlobStore + CryptoProvider round trip
  Mv = await Mp.evaluate(async () => {
    const P = dmProviders(), plain = 'SEGRETO-DOCMAP-' + 'x'.repeat(40);
    const meta = await P.blobs.putBlob(new TextEncoder().encode(plain), {content_type:'text/plain', owner_type:'binder', owner_key:'mt', name:'nota.txt'});
    const raw = new Uint8Array(await P.blobs.rawBlob(meta.id));
    const got = await P.blobs.getBlob(meta.id), txt = await got.blob.text();
    const kek = await P.crypto.kek();
    const tampered = (async () => { try { await P.crypto.decrypt(meta.envelope, raw, 'another-id'); return false; } catch(e){ return true; } })();
    const list = await P.blobs.listBlobs({owner_key:'mt'});
    await P.blobs.deleteBlob(meta.id);
    return {enc:meta.encrypted, alg:meta.envelope.alg, kw:meta.envelope.kw, size:raw.length === plain.length + 16, differs:!new TextDecoder('latin1').decode(raw).includes('SEGRETO'), same:txt === plain, sha:meta.sha256.length === 64, policy:meta.policy,
      ext:kek.key.extractable, aad:await tampered, listed:list.length === 1, gone:(await P.blobs.getBlob(meta.id)) === null};
  });
  ok(Mv.enc && Mv.alg === 'A256GCM' && Mv.kw === 'A256KW' && Mv.size && Mv.differs && Mv.same && Mv.sha && Mv.policy === 'working-copy', 'BlobStore: AES-256-GCM envelope, stored bytes ≠ plaintext, decrypts back', Mv);
  ok(Mv.ext === false && Mv.aad && Mv.listed && Mv.gone, 'BlobStore: workspace key non-extractable, AAD binds blob id, list + delete', Mv);
  Mv = await Mp.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 3000; cv.height = 2000; const cx = cv.getContext('2d'); cx.fillStyle = '#0a0'; cx.fillRect(0, 0, 3000, 2000);
    const png = await new Promise(r => cv.toBlob(r, 'image/png'));
    const P = dmProviders(), meta = await P.blobs.putBlob(png, {owner_type:'cabinet', owner_key:'mt', name:'foto.png'});
    const got = await P.blobs.getBlob(meta.id), bm = await createImageBitmap(got.blob); const r = {ct:meta.content_type, w:bm.width, h:bm.height, enc:meta.encrypted};
    await P.blobs.deleteBlob(meta.id);
    let big; try { await P.blobs.putBlob(new Uint8Array(BLOB_POLICY.pdfMaxBytes + 1), {content_type:'application/pdf'}); big = 'stored'; } catch(e){ big = e.code + ':' + e.message; }
    r.big = big; return r;
  });
  ok(Mv.ct === 'image/jpeg' && Mv.w === 1400 && Mv.h === 933 && Mv.enc && Mv.big === 'invalid:too_large', 'BlobStore: photos re-encoded ≤1400 px JPEG (working copy), oversize PDF refused', Mv);
  ok(await p.evaluate(() => typeof RemoteDataProvider === 'function' && typeof RemoteAuthProvider === 'function' && dmProviders().mode === 'local' && (() => { try { dmProviders({mode:'remote', apiBase:'http://x'}); return false; } catch(e){ return e.code === 'config'; } })()), 'providers: local by default, remote stub requires an https apiBase');
  await p.evaluate(() => { DM_PROVIDERS = null; dmProviders(); });
  // clean up
  await Mp.close();
  await p.evaluate(async ([id, start]) => {
    while (topModal()) closeModal(true);
    ['docmap_v26_auth', 'docmap_v26_auth_fail', 'docmap_v26_scan_lang', 'docmap_v26_scan_user', 'docmap_v26_scan_outbox'].forEach(k => localStorage.removeItem(k));
    S.binders = S.binders.filter(b => b.id !== id);
    DB.db.run("DELETE FROM photos WHERE id = 'mt-photo'");
    DB.db.run('DELETE FROM activity_log WHERE at >= ?', [start]); LOG.entries = LOG.entries.filter(e => e.at < start); LOG.pending = []; logSavePending();
    S.lang = 'it'; S.view = 'archive'; commit(); renderAll(); dbSyncFromState('t'); await dbPersist();
    await new Promise(r => { const q = indexedDB.deleteDatabase('docmap_v26_blobs'); q.onsuccess = q.onerror = q.onblocked = r; });
  }, [Mb.id, Mstart]);
  ok(await p.evaluate((id) => !S.binders.some(b => b.id === id) && !localStorage.getItem('docmap_v26_auth') && !LOG.entries.some(e => e.source === 'mobile'), Mb.id), 'stream M: test data cleaned up');
  // destination default (v10: pilot web app, path routing) + migration of the old default only
  Mv = await p.evaluate(() => ({def:DEFAULT_DEST, cur:S.settings.destTemplate, old:migrate({schema:26.9, settings:{destTemplate:'https://studiodallasta.it/docmap/?code={speaking_code}&qr={short_code}'}}).settings.destTemplate,
    custom:migrate({schema:26.9, settings:{destTemplate:'https://example.it/x/{speaking_code}'}}).settings.destTemplate, ex:renderDest(DEFAULT_DEST, {short_code:'dm26AbCdEfGh'})}));
  ok(Mv.def === 'https://docmap.pr-it.it/studio-de/q/{short_code}' && Mv.cur === Mv.def && Mv.old === Mv.def && Mv.custom === 'https://example.it/x/{speaking_code}' && Mv.ex === 'https://docmap.pr-it.it/studio-de/q/dm26AbCdEfGh', 'destination: default docmap.pr-it.it/studio-de/q/{short_code}, old default migrated, custom kept', Mv);
  // QR route resolution on a static host
  const Rp = await ctx.newPage(); await Rp.goto(MSCAN); await Rp.waitForTimeout(200);
  Mv = await Rp.evaluate(() => { const r = (pathname, search, hash) => { const x = scResolveRoute({pathname, search:search || '', hash:hash || ''}); return x.qr + '|' + x.code; }; return [
    r('/studio-de/q/dm26AbCdEfGh'), r('/studio-de/q/dm26AbCdEfGh/'), r('/studio-de/scan.html', '?q=dm26AbCdEfGh'), r('/studio-de/scan.html', '?qr=dm26AbCdEfGh&code=BL1'), r('/studio-de/scan.html', '', '#/q/dm26AbCdEfGh'), r('/studio-de/scan.html', '?code=BL1'), r('/studio-de/scan.html', '?q=<x>')]; });
  await Rp.close();
  ok(Mv.join(' ') === 'dm26AbCdEfGh| dm26AbCdEfGh| dm26AbCdEfGh| dm26AbCdEfGh|BL1 dm26AbCdEfGh| |BL1 |', 'scan routing: /q/<code> path, ?q=, ?qr=, #/q/, ?code=, invalid code ignored', Mv);
  // web deploy (tools/build_deploy.py) opened in a fresh browser profile: login required everywhere, data encrypted at rest
  const WDIR = require('path').resolve(__dirname, 'shots', 'deploy', 'studio-de');
  const Wbuild = () => require('child_process').execFileSync('python3', [require('path').resolve(__dirname, '..', 'tools', 'build_deploy.py'), WDIR, '--studio-name', 'Studio Web Prova']);
  Wbuild();
  const Wf = (f) => fs.existsSync(require('path').join(WDIR, f)) ? fs.readFileSync(require('path').join(WDIR, f), 'utf8') : null;
  const Wex = (f) => fs.existsSync(require('path').join(WDIR, f));
  Mv = {cfg:Wf('docmap.config.js'), ht:Wf('.htaccess'), e404:Wf('404.html'), rob:Wf('robots.txt'), rd:Wf('README-DEPLOY.md'), man:Wf('DEPLOY-MANIFEST.txt')};
  ok(/"mode": "web"/.test(Mv.cfg || '') && /Object\.freeze/.test(Mv.cfg) && /"basePath": "\/studio-de\/"/.test(Mv.cfg) && Wex('index.html') && Wex('scan.html') && Wex('vendor/sql-wasm.js') && !Wex('tests') && !Wex('tools') && !Wex('docs'), 'deploy: web config (frozen), app files, no tests/tools/docs', Mv.cfg);
  ok(/RewriteRule \^q\/\(\[A-Za-z0-9_-\]\{1,40\}\)\/\?\$ scan\.html/.test(Mv.ht || '') && /RewriteBase \/studio-de\//.test(Mv.ht) && /Content-Security-Policy/.test(Mv.ht) && /ErrorDocument 404 \/studio-de\/404\.html/.test(Mv.ht), 'deploy: .htaccess rewrite /studio-de/q/* → scan.html + security headers');
  ok(/scan\.html\?q=/.test(Mv.e404 || '') && Mv.rob === 'User-agent: *\nDisallow: /\n' && /docmap\.pr-it\.it\/studio-de\//.test(Mv.rd || '') && Mv.man.split('\n').filter(Boolean).length > 40 && Wex('nginx-docmap.conf.example'), 'deploy: 404.html fallback, robots Disallow, README-DEPLOY, nginx example, sha256 manifest');
  Wbuild();
  ok(Wf('DEPLOY-MANIFEST.txt') === Mv.man, 'deploy: build is deterministic (same manifest twice)');
  const Wctx = await b.newContext({viewport:{width:1366, height:768}});
  const Wp = await Wctx.newPage();
  Wp.on('pageerror', e => errs.push('WEB PAGEERR ' + e.message)); Wp.on('console', m => { if (m.type() === 'error') errs.push('WEB CONSOLE ' + m.text()); }); Wp.on('dialog', d => d.accept());
  const WURL = 'file://' + WDIR.replace(/\\/g, '/') + '/';
  await Wp.goto(WURL + 'index.html'); await Wp.waitForTimeout(700);
  Mv = await Wp.evaluate(() => ({lock:!!document.querySelector('#vault-lock form[data-vl="setup"]'), view:document.getElementById('view').innerHTML.length, top:document.getElementById('topbar').innerHTML.length, S:!!(S && S.binders), studio:/Studio Web Prova/.test(document.body.innerText)}));
  ok(Mv.lock && Mv.view === 0 && Mv.top === 0 && !Mv.S && Mv.studio, 'web mode: first run → set-up screen, nothing rendered, no state loaded', Mv);
  await Wp.fill('#vl-user', 'Dave'); await Wp.fill('#vl-name', 'Davide'); await Wp.fill('#vl-pin', '8642'); await Wp.fill('#vl-pin2', '8642');
  await Wp.click('#vl-go'); await Wp.waitForTimeout(2500);
  Mv = await Wp.evaluate(() => { while (topModal()) closeModal(true); return {lock:!!document.getElementById('vault-lock'), n:S.binders.length, db:DB.ready, btn:!!document.getElementById('vl-lockbtn'), user:dmProviders().auth.currentUser()}; });
  ok(!Mv.lock && Mv.n === 5 && Mv.db && Mv.btn && Mv.user && Mv.user.role === 'admin', 'web mode: first admin created, vault unlocked, app booted', Mv);
  const Wqr = await Wp.evaluate(async () => { const b = S.binders.find(x => x.speaking_code === 'BL2'); b.notes = 'Nota cifrata WEBX'; commit(); dbSyncFromState('t'); await dbPersist(); await DocMapVault.flush(); return b.short_code; });
  Mv = await Wp.evaluate(async () => {
    const all = []; for (let i = 0; i < localStorage.length; i++) all.push(localStorage.key(i) + '=' + localStorage.getItem(localStorage.key(i)));
    const rec = await new Promise(res => { const r = indexedDB.open('docmap_v26_sqlite', 1); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('db'); q.onsuccess = () => res(q.result); }; });
    const u = JSON.parse(localStorage.getItem('docmap_v26_auth')).users[0];
    return {plainKey:!!localStorage.getItem('docmap_v26_state') || !!localStorage.getItem('docmap_v26_log_pending'), leak:all.some(v => /Barbieri|WEBX|8642/.test(v)), vault:!!localStorage.getItem('docmap_v26_vault'),
      dbEnc:!!(rec && rec.vault && rec.ct), dbLeak:rec && rec.ct ? new TextDecoder('latin1').decode(rec.ct).includes('Barbieri') : true, wrap:!!(u.vault && u.vault.wrapped && u.vault.salt)};
  });
  ok(!Mv.plainKey && !Mv.leak && Mv.vault && Mv.dbEnc && !Mv.dbLeak && Mv.wrap, 'web mode: state, log and SQLite encrypted at rest (no plaintext data or PIN in storage)', Mv);
  await Wp.reload(); await Wp.waitForTimeout(2000);
  ok(await Wp.evaluate(() => !document.getElementById('vault-lock') && S.binders.find(x => x.speaking_code === 'BL2').notes === 'Nota cifrata WEBX'), 'web mode: reload in the same tab resumes the session and decrypts the data');
  await Wp.goto(WURL + 'scan.html?q=' + Wqr); await Wp.waitForTimeout(1500);
  Mv = await Wp.evaluate(() => ({view:SC.view, code:(document.getElementById('sc-code') || {}).textContent}));
  ok(Mv.view === 'card' && Mv.code === 'BL2', 'web mode: scan.html?q= in the same session shows the binder from the vault', Mv);
  await Wp.click('#sc-edit'); await Wp.click('[data-s="state"][data-v="HISTORICAL"]'); await Wp.click('#sc-save'); await Wp.waitForTimeout(700);
  await Wp.goto(WURL + 'index.html'); await Wp.waitForTimeout(2000);
  Mv = await Wp.evaluate(() => ({st:S.binders.find(x => x.speaking_code === 'BL2').archive_state, log:LOG.entries.some(e => e.source === 'mobile' && e.target && e.target.code === 'BL2')}));
  ok(Mv.st === 'HISTORICAL' && Mv.log, 'web mode: mobile edit saved in the vault, seen by the desktop with its log entry', Mv);
  await Wp.evaluate(() => { while (topModal()) closeModal(true); }); await Wp.click('#vl-lockbtn'); await Wp.waitForTimeout(1500);
  Mv = await Wp.evaluate(() => ({lock:!!document.querySelector('#vault-lock form[data-vl="login"]'), view:document.getElementById('view').innerHTML.length, S:!!(S && S.binders), ss:sessionStorage.length, leak:/BL2|Barbieri/.test(document.body.innerHTML)}));
  ok(Mv.lock && Mv.view === 0 && !Mv.S && Mv.ss === 0 && !Mv.leak, 'web mode: "Esci" locks the vault → login screen, no data in the page', Mv);
  await Wp.fill('#vl-user', 'dave'); await Wp.fill('#vl-pin', '1111'); await Wp.click('#vl-go'); await Wp.waitForTimeout(900);
  ok(await Wp.evaluate(() => !!document.getElementById('vault-lock') && /non corretti|Wrong/.test(document.getElementById('vl-err').textContent)), 'web mode: wrong PIN keeps the vault locked');
  const Wp2 = await Wctx.newPage();
  await Wp2.goto(WURL + 'scan.html#/q/' + Wqr); await Wp2.waitForTimeout(600);
  ok(await Wp2.evaluate(() => SC.view === 'login' && SC.params.qr.length === 12 && !/BL2|Barbieri/.test(document.getElementById('app').innerHTML)), 'web mode: scan page in a new tab requires login (#/q/ route), no data');
  await Wp2.close();
  await Wp.fill('#vl-user', 'dave'); await Wp.fill('#vl-pin', '8642'); await Wp.click('#vl-go'); await Wp.waitForTimeout(2500);
  ok(await Wp.evaluate(() => !document.getElementById('vault-lock') && S.binders.find(x => x.speaking_code === 'BL2').archive_state === 'HISTORICAL'), 'web mode: right PIN unlocks the data again');
  ok(await Wp.evaluate(() => { const P = dmProviders().auth; try { P.removeUser(P.listUsers()[0].id); return false; } catch(e){ return e.message === 'last_admin'; } }), 'web mode: the last administrator cannot be removed (vault would be unreadable)');
  await Wctx.close();

  console.log('\nerrors:', errs.length ? errs.join('\n') : 'none');
  if (errs.length) fails += errs.length;
  console.log(`\nRESULT: ${passes} passed, ${fails} failed`);
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
