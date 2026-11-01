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
  ok(man[0] === 'short_code;short_url;final_destination;tags;' && man.length === 7 && man.slice(0, 6).every(l => l.endsWith(';')) && man[1].split(';').length === 5 && man[1].includes('https://docmap.pr-it.it/studio-de/q/dm26'), 'manifest header + rows', man.slice(0, 2));
  const codes = await p.evaluate(() => S.binders.map(b => b.short_code));
  const mm = await p.evaluate(([c0]) => mergeManifest('﻿short_code;short_url;final_destination;tags\r\n1TSE0G;https://qr7.it/1TSE0G;https://x/a;c\r\n' + c0 + ';https://qr7.it/' + c0 + ';https://old;o\r\n' + c0 + ';dup;dup;dup\r\nOliva01;https://qr7.it/Oliva01;https://x/o;olio\r\ndm26Gone2345;https://qr7.it/dm26Gone2345;x;y\r\n', true), [codes[0]]);
  const mlines = mm.text.replace(/^﻿/, '').trim().split('\r\n');
  ok(mm.text.startsWith('﻿') && mlines[1].startsWith('1TSE0G') && mlines[2].startsWith('Oliva01') && mm.updated === 1 && mm.removed === 1 && mlines.length === 1 + 2 + 5 && mlines.every(l => l.endsWith(';')) && mlines.filter(l => l.startsWith(codes[0])).length === 1, 'manifest merge: keeps rows, BOM, CRLF, dedupe, prune', mm);
  const mm2 = await p.evaluate(() => mergeManifest('1TSE0G;https://qr7.it/1TSE0G;https://x;y\n', false));
  ok(mm2.text.split('\n')[0] === 'short_code;short_url;final_destination;tags;' && mm2.text.split('\n')[1].endsWith(';') && mm2.kept === 1, 'manifest without header', mm2);

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
    await p.keyboard.press('Escape');   // v10: Esc asks first ("Vuoi davvero uscire dalla guida?")
    if (await p.isVisible('[data-a="guide-quit"]')) await p.click('[data-a="guide-quit"]');
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
  v = await p.evaluate(() => { const b = S.binders[0]; return {tags:manifestTags(b).includes('multi-m-00777-a'), dest:renderDest('https://x/?m={multi_code}', b) === 'https://x/?m=M-00777%2FA', mm:mergeManifest('', false).text.split('\n')[0] === 'short_code;short_url;final_destination;tags;'}; });
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
  await p.evaluate(() => { S.view = 'import'; renderAll(); $('#im-preview').innerHTML = importPreviewHTML(); const mk = document.getElementById('cl-mkb'); if (mk) mk.checked = false; }); await p.click('[data-a="cl-apply"]'); await p.waitForTimeout(300);
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
  ok(v.main.join() === 'archive,print,info' && v.vis === 3 && v.adv.join() === 'ai,database,export,import,log,settings,sync', 'top bar: exactly 3 main tabs, the rest in the "Funzioni avanzate" menu', v);
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
  await p.evaluate(() => { const mk = document.getElementById('cl-mkb'); if (mk) mk.checked = false; });
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
  ok(v.ids.replace(/,loc$/, '') === 'info,split,pair,a,b,u,qr' && v.k === 'I,S,AB,A,B,U,Q,U' && v.kp === 'IC' && v.rec, 'template registry drives modeKinds (all old modes kept, unknown → U, pair flag → I+C)', v);
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
  ok(v.opts.replace(/,loc$/, '') === 'info,split,pair,a,b,u,qr' && v.on === 'info' && v.rec && v.items === 3 && v.edge && v.pv === 8 && v.help && v.w, 'print panel: templates from the registry, info recommended on MRINK143, its options, edge option in Advanced, outline in preview, help topics', v);
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
  sec('v10 E: Modifica massiva (bulk edit)');
  let Ev;
  const Estart = await p.evaluate(() => {
    while (topModal()) closeModal(true);
    S.lang = 'it'; S.view = 'archive'; S.archiveView = 'table'; UI.q = ''; UI.fState = UI.fRoom = UI.fCat = ''; UI.fInfo = null;
    const taken = S.binders.map(b => b.short_code);
    ['Uno', 'Due', 'Tre', 'Quattro'].forEach((n, i) => { const sc = newShortCode(taken); taken.push(sc); S.binders.push(normalizeBinder({speaking_code:'EBK' + (i + 1), company_name:'Bulk Test ' + n + ' Srl', category:'Ordinaria', binder_title:'Titolo ' + n, tags:'ebk,massiva', room_code:'E', cabinet_code:'1', shelf_code:'α', short_code:sc})); });
    commit(); renderAll(); return nowISO();
  });
  const Ecell = (code, k) => p.evaluate(([code, k]) => { const r = BK.rows.findIndex(x => x.b && x.b.speaking_code === code), c = bkCols().findIndex(x => x.k === k); bkMove(r, c); bkFocusGrid(); return [r, c]; }, [code, k]);
  const Ed = (code) => p.evaluate((code) => { const b = S.binders.find(x => x.speaking_code === code); return Object.assign({}, BK.draft.get(b.id) || {}); }, code);
  Ev = await p.evaluate(() => ({btn:!!document.querySelector('.toolbar #btn-bulk[data-a="bulk-open"]'), on:BK.on}));
  ok(Ev.btn && !Ev.on, 'bulk: "Modifica massiva" button in the archive toolbar, mode off by default', Ev);
  await p.click('#btn-bulk'); await p.waitForTimeout(150);
  Ev = await p.evaluate(() => ({on:BK.on, grid:!!document.querySelector('#bk-grid .bk-tbl'), focus:document.activeElement.id, n:BK.list.length, all:filteredBinders().length, tr:document.querySelectorAll('#bk-body tr.bk-row').length, th:[...document.querySelectorAll('.bk-tbl th[data-k]')].map(x => x.dataset.k).join()}));
  ok(Ev.on && Ev.grid && Ev.focus === 'bk-grid' && Ev.n === Ev.all && Ev.tr === Ev.all && /speaking_code,company_name,multi_code,category/.test(Ev.th) && !/notes/.test(Ev.th), 'bulk: opens a focused grid with every archive binder and the default columns', Ev);
  // filters respected: search box + state filter
  await p.fill('[data-bk-q]', 'Bulk Test'); await p.waitForTimeout(300);
  Ev = await p.evaluate(() => ({n:BK.list.length, codes:BK.list.map(b => b.speaking_code).sort().join(), q:UI.q}));
  ok(Ev.n === 4 && Ev.codes === 'EBK1,EBK2,EBK3,EBK4' && Ev.q === 'Bulk Test', 'bulk: search filter respected (shared with the archive)', Ev);
  await p.selectOption('[data-bk-f="fState"]', 'CHECKED_OUT'); await p.waitForTimeout(100);
  Ev = await p.evaluate(() => BK.list.length);
  ok(Ev === 0 && await p.isVisible('#bk-grid .empty'), 'bulk: state filter respected', Ev);
  await p.selectOption('[data-bk-f="fState"]', ''); await p.waitForTimeout(100);
  // keyboard editing: type → staged, Enter moves down, Esc cancels, arrows move
  await Ecell('EBK1', 'binder_title');
  await p.keyboard.type('Titolo massivo'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  Ev = await p.evaluate(() => ({cur:BK.cur, row:BK.rows[BK.cur.r].b.speaking_code, saved:S.binders.find(b => b.speaking_code === 'EBK1').binder_title, focus:document.activeElement.id, dirty:document.querySelectorAll('#bk-body td.bk-cell.dirty').length, bar:(document.querySelector('#bk-savebar') || {}).textContent}));
  const Ed1 = await Ed('EBK1');
  ok(Ed1.binder_title === 'Titolo massivo' && Ev.saved === 'Titolo Uno' && Ev.row === 'EBK2' && Ev.focus === 'bk-grid' && Ev.dirty === 1 && /Salva modifiche \(1\)/.test(Ev.bar), 'bulk: typing edits the cell, Enter stages it and moves down, saved data untouched', [Ed1, Ev]);
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowRight');
  Ev = await p.evaluate(() => bkCols()[BK.cur.c].k);
  await p.keyboard.type('XYZ'); await p.keyboard.press('Escape'); if (await p.evaluate(() => !!BK.edit)) await p.keyboard.press('Escape'); await p.waitForTimeout(50);
  const Ed2 = await Ed('EBK2');
  ok(Ev === 'ref_year' && !('ref_year' in Ed2) && await p.evaluate(() => !BK.edit && document.activeElement.id === 'bk-grid'), 'bulk: arrows move the cursor, Esc cancels the cell edit', [Ev, Ed2]);
  await p.keyboard.press('F2'); await p.keyboard.press('Control+a'); await p.keyboard.type('2031'); await p.keyboard.press('Tab'); await p.waitForTimeout(50);
  Ev = await p.evaluate(() => bkCols()[BK.cur.c].k);
  ok((await Ed('EBK2')).ref_year === '2031' && Ev === 'tags', 'bulk: F2 edits the current value, Tab commits and moves right', Ev);
  // typeahead in a cell: existing client spelling
  await Ecell('EBK2', 'company_name');
  await p.keyboard.type('barbie'); await p.waitForTimeout(120);
  Ev = await p.evaluate(() => ({vis:!document.querySelector('#ta-pop').hidden, opts:[...document.querySelectorAll('#ta-pop .ta-opt .ta-v')].map(x => x.textContent)}));
  await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  Ev.d = (await Ed('EBK2')).company_name; Ev.edit = await p.evaluate(() => !!BK.edit);
  ok(Ev.vis && Ev.opts[0] === 'Barbieri Luigi S.r.l.' && Ev.d === 'Barbieri Luigi S.r.l.' && !Ev.edit, 'bulk: typeahead in a cell suggests the existing client, Enter picks and commits', Ev);
  await Ecell('EBK3', 'company_name');
  await p.keyboard.type('BARBIERI LUIGI SRL'); await p.keyboard.press('Escape'); await p.waitForTimeout(30);
  Ev = await p.evaluate(() => !!BK.edit);   // first Esc only closes the list
  await p.keyboard.press('Tab'); await p.waitForTimeout(50);
  ok(Ev && (await Ed('EBK3')).company_name === 'Barbieri Luigi S.r.l.', 'bulk: a different spelling of a known client is stored with the existing spelling (no duplicate client)', await Ed('EBK3'));
  await p.keyboard.press('Control+z'); await p.waitForTimeout(50);
  ok(!('company_name' in await Ed('EBK3')), 'bulk: Ctrl+Z undoes the last staged change');
  // selection + apply to selected
  await Ecell('EBK1', 'speaking_code');
  await p.keyboard.press('Space'); await p.keyboard.press('Shift+ArrowDown'); await p.keyboard.press('Shift+ArrowDown'); await p.keyboard.press('Shift+ArrowDown');
  Ev = await p.evaluate(() => ({n:BK.sel.size, bar:document.querySelector('#bk-selbar').textContent, chk:document.querySelectorAll('#bk-body input[data-bk-sel]:checked').length}));
  ok(Ev.n === 4 && Ev.chk === 4 && /4 selezionati/.test(Ev.bar), 'bulk: Space and Shift+arrows select rows', Ev);
  const Eop = async (op, val) => { await p.selectOption('#bk-op', op); await p.waitForTimeout(40); if (val !== undefined){ const tag = await p.evaluate(() => document.querySelector('#bk-op-v').tagName); if (tag === 'SELECT') await p.selectOption('#bk-op-v', val); else await p.fill('#bk-op-v', val); } await p.evaluate(() => taClose()); await p.click('#bk-apply'); await p.waitForTimeout(60); };
  await Eop('category', 'Bulk Cat');
  await Eop('tag_add', 'ebknew');
  await Eop('tag_rm', 'massiva');
  await Eop('state', 'CHECKED_OUT');
  await Eop('loc', 'Z9');
  Ev = await p.evaluate(() => S.binders.filter(b => /^EBK/.test(b.speaking_code)).map(b => ({c:bkVal(b, 'category'), t:bkVal(b, 'tags'), s:bkVal(b, 'archive_state'), l:bkVal(b, 'location_code'), saved:b.category})));
  ok(Ev.every(x => x.c === 'Bulk Cat' && x.t === 'ebk,ebknew' && x.s === 'CHECKED_OUT' && x.l === 'Z9-α' && x.saved === 'Ordinaria'), 'bulk: apply to selected — category, add tag, remove tag, state, position prefix (staged)', Ev);
  Ev = await p.evaluate(() => { const r = {ops:[...document.querySelectorAll('#bk-op option')].map(o => o.value), auto:bkHasAuto()}; return r; });
  ok(Ev.ops.includes('color') && Ev.ops.includes('tag_rm') && Ev.ops.includes('color_auto') === Ev.auto, 'bulk: colour operations ("Colore automatico" only when the colour module provides it)', Ev);
  // fill down (Ctrl+D) from the active cell into the selected rows
  await Ecell('EBK1', 'company_city');
  await p.keyboard.type('Bulkville'); await p.keyboard.press('Enter'); await p.waitForTimeout(40);
  await Ecell('EBK1', 'company_city'); await p.keyboard.press('Control+d'); await p.waitForTimeout(40);
  Ev = await p.evaluate(() => S.binders.filter(b => /^EBK/.test(b.speaking_code)).map(b => bkVal(b, 'company_city')));
  ok(Ev.every(x => x === 'Bulkville'), 'bulk: Ctrl+D copies the active cell into the selected rows', Ev);
  // duplicate speaking code blocked
  await Ecell('EBK4', 'speaking_code');
  await p.keyboard.type('ebk1'); await p.keyboard.press('Enter'); await p.waitForTimeout(60);
  Ev = await p.evaluate(() => ({errs:BK.errs.size, dis:document.querySelector('#bk-save').disabled, msg:document.querySelector('#bk-savebar').textContent, cell:document.querySelectorAll('#bk-body td.bk-cell.err').length, saved:bkSave(), still:S.binders.filter(b => b.speaking_code === 'EBK1').length, cat:S.binders.find(b => b.speaking_code === 'EBK2').category}));
  ok(Ev.errs === 1 && Ev.dis && /EBK4/.test(Ev.msg) && Ev.cell === 1 && Ev.saved === 0 && Ev.still === 1 && Ev.cat === 'Ordinaria', 'bulk: duplicate speaking code is flagged and blocks the save', Ev);
  await p.evaluate(() => bkFocusGrid()); await p.keyboard.press('Control+z'); await p.waitForTimeout(40);
  ok(await p.evaluate(() => BK.errs.size === 0 && !document.querySelector('#bk-save').disabled), 'bulk: undoing the duplicate code clears the error');
  // save: one commit, one log entry, one undo restores
  const Elog0 = await p.evaluate(() => LOG.entries.length);
  await p.click('#bk-save'); await p.waitForTimeout(120);
  Ev = await p.evaluate(() => { const L = S.binders.filter(b => /^EBK/.test(b.speaking_code)); const e = LOG.entries[LOG.entries.length - 1]; return {draft:BK.draft.size, cats:L.map(b => b.category).join(), st:L.map(b => b.archive_state).join(), loc:L.map(b => b.location_code).join(), title:L[0].binder_title, year:L[1].ref_year, tags:L[2].tags, act:e.action, cnt:e.details.count, ch:e.details.binders.find(x => x.code === 'EBK1').changed, sum:e.summary, dirty:S.hasUnexportedChanges, bar:document.querySelector('#bk-savebar').classList.contains('on')}; });
  const Elog1 = await p.evaluate(() => LOG.entries.length);
  ok(Ev.draft === 0 && Ev.cats === 'Bulk Cat,Bulk Cat,Bulk Cat,Bulk Cat' && /^(CHECKED_OUT,?){4}$/.test(Ev.st) && Ev.loc === 'Z9-α,Z9-α,Z9-α,Z9-α' && Ev.title === 'Titolo massivo' && Ev.year === '2031' && Ev.tags === 'ebk,ebknew' && !Ev.bar && Ev.dirty, 'bulk: Save commits every staged change', Ev);
  ok(Elog1 === Elog0 + 1 && Ev.act === 'binder.bulk_edit' && Ev.cnt === 4 && Ev.ch.category[0] === 'Ordinaria' && Ev.ch.category[1] === 'Bulk Cat' && Ev.ch.binder_title[1] === 'Titolo massivo' && /Modifica massiva: 4 faldoni/.test(Ev.sum), 'bulk: one activity-log entry with per-binder changed fields', Ev);
  await p.evaluate(() => bkFocusGrid()); await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  Ev = await p.evaluate(() => { const L = S.binders.filter(b => /^EBK/.test(b.speaking_code)); return {cats:L.map(b => b.category).join(), title:L[0].binder_title, tags:L[2].tags, st:L[3].archive_state, loc:L[0].location_code, on:BK.on, last:LOG.entries[LOG.entries.length - 1].action}; });
  ok(Ev.cats === 'Ordinaria,Ordinaria,Ordinaria,Ordinaria' && Ev.title === 'Titolo Uno' && Ev.tags === 'ebk,massiva' && Ev.st === 'CURRENT' && Ev.loc === 'E1-α' && Ev.on && Ev.last === 'undo', 'bulk: a single undo restores every binder of the bulk save', Ev);
  // sort + group
  await p.click('.bk-tbl th[data-k="binder_title"]'); await p.waitForTimeout(60);
  Ev = await p.evaluate(() => BK.list.map(b => b.binder_title).join('|'));
  await p.click('.bk-tbl th[data-k="binder_title"]'); await p.waitForTimeout(60);
  Ev = [Ev, await p.evaluate(() => BK.list.map(b => b.binder_title).join('|') + '#' + document.querySelector('.bk-tbl th[data-k="binder_title"]').getAttribute('aria-sort'))];
  ok(Ev[0] === 'Titolo Due|Titolo Quattro|Titolo Tre|Titolo Uno' && Ev[1] === 'Titolo Uno|Titolo Tre|Titolo Quattro|Titolo Due#descending', 'bulk: click a header to sort ascending / descending', Ev);
  await p.fill('[data-bk-q]', ''); await p.waitForTimeout(250);
  await p.selectOption('[data-bk-group]', 'category'); await p.waitForTimeout(60);
  Ev = await p.evaluate(() => { const g = BK.rows.filter(r => r.g !== undefined); const ord = g.find(r => r.g === 'Ordinaria'); return {groups:g.length, cats:new Set(BK.list.map(b => b.category)).size, ordN:ord ? ord.ids.length : 0, dom:document.querySelectorAll('#bk-body tr.bk-grp').length}; });
  await p.evaluate(() => { BK.sel.clear(); const r = BK.rows.findIndex(x => x.g === 'Ordinaria'); bkMove(r + 1, 0); bkSelChanged(); document.querySelector('[data-a="bk-grp-sel"][data-r="' + r + '"]').click(); });
  Ev.sel = await p.evaluate(() => BK.sel.size);
  ok(Ev.groups === Ev.cats && Ev.dom >= 1 && Ev.ordN > 4 && Ev.sel === Ev.ordN, 'bulk: group by category with one-click group selection', Ev);
  await p.selectOption('[data-bk-group]', ''); await p.evaluate(() => { BK.sel.clear(); BK.sort = {k:'', dir:1}; bkRefresh(); });
  // column chooser
  await p.click('#bk-cols > summary'); await p.check('[data-bk-col="notes"]'); await p.uncheck('[data-bk-col="multi_code"]'); await p.waitForTimeout(60);
  Ev = await p.evaluate(() => ({th:[...document.querySelectorAll('.bk-tbl th[data-k]')].map(x => x.dataset.k), set:S.settings.bulkCols}));
  ok(Ev.th.includes('notes') && !Ev.th.includes('multi_code') && Ev.set.includes('notes'), 'bulk: column chooser (remembered in S.settings.bulkCols)', Ev);
  await p.evaluate(() => { delete S.settings.bulkCols; savePrefs(); document.querySelector('#bk-cols').open = false; bkRenderTable(); });
  // discard all
  await Ecell('EBK1', 'category'); await p.keyboard.type('Da scartare'); await p.keyboard.press('Enter'); await p.waitForTimeout(40);
  await p.click('[data-a="bk-discard"]'); await p.waitForTimeout(80);
  await p.click('.modal-f .btn-primary'); await p.waitForTimeout(80);
  ok(await p.evaluate(() => BK.draft.size === 0 && S.binders.find(b => b.speaking_code === 'EBK1').category === 'Ordinaria'), 'bulk: "Annulla tutto" discards the pending changes after confirmation');
  // 2000 binders: windowed render
  Ev = await p.evaluate(() => {
    const keep = S.binders, extra = [], taken = keep.map(b => b.short_code);
    for (let i = 0; i < 2000; i++){ const sc = newShortCode(taken); taken.push(sc); extra.push(normalizeBinder({speaking_code:'EPF' + i, company_name:'Perf Bulk ' + (i % 250), category:['Ordinaria', 'Lavoro', 'Societario'][i % 3], binder_title:'Titolo ' + i, tags:'perf,t' + (i % 7), room_code:'P', cabinet_code:String(i % 9), shelf_code:'α', short_code:sc})); }
    S.binders = keep.concat(extra);
    const T = (f) => { const t0 = performance.now(); f(); return Math.round(performance.now() - t0); };
    const r = {};
    r.open = T(() => renderView());
    r.rows = document.querySelectorAll('#bk-body tr.bk-row').length; r.n = BK.list.length;
    const g = document.querySelector('#bk-grid');
    r.scroll = T(() => { g.scrollTop = g.scrollHeight; bkRenderBody(false); });
    r.last = !!document.querySelector('#bk-body tr[data-r="' + (BK.rows.length - 1) + '"]');
    r.sort = T(() => { BK.sort = {k:'company_name', dir:1}; bkRefresh(); });
    r.group = T(() => { BK.group = 'category'; bkRefresh(); });
    r.apply = T(() => { BK.list.forEach(b => BK.sel.add(b.id)); bkApply(BK.list.map(b => ({id:b.id, patch:{category:'X'}}))); bkAfterChange(); });
    r.drafted = BK.draft.size;
    BK.draft.clear(); BK.hist = []; BK.sel.clear(); BK.sort = {k:'', dir:1}; BK.group = ''; bkValidate();
    S.binders = keep; renderView();
    return r;
  });
  console.log('  bulk grid perf', JSON.stringify(Ev));
  ok(Ev.n >= 2004 && Ev.rows < 120 && Ev.last && Ev.open < 1500 && Ev.scroll < 300 && Ev.sort < 1500 && Ev.group < 1500 && Ev.apply < 2500 && Ev.drafted === Ev.n, 'bulk: 2000+ binders — windowed grid (open ' + Ev.open + ' ms, scroll ' + Ev.scroll + ' ms, sort ' + Ev.sort + ' ms, apply-to-all ' + Ev.apply + ' ms)', Ev);
  // English UI + help topic
  await p.evaluate(() => { S.lang = 'en'; renderAll(); });
  Ev = await p.evaluate(() => ({h:document.querySelector('.page-h h1').textContent, th:document.querySelector('.bk-tbl thead').textContent, bar:document.querySelector('#bk-selbar').textContent, help:!!helpTopic('bulk'), btn:document.querySelector('#bk-close').textContent}));
  ok(/Bulk edit/.test(Ev.h) && /Client/.test(Ev.th) && /Category/.test(Ev.th) && /Select all/.test(Ev.bar) && /Back to the archive/.test(Ev.btn) && Ev.help, 'bulk: English UI + help topic "bulk"', Ev);
  await p.evaluate(() => { S.lang = 'it'; renderAll(); });
  // phone width: the grid scrolls, not the page
  await p.setViewportSize({width:390, height:800}); await p.waitForTimeout(150);
  Ev = await p.evaluate(() => { const g = document.querySelector('#bk-grid'); return {w:[document.documentElement.scrollWidth, innerWidth], gs:g.scrollWidth > g.clientWidth, gw:g.getBoundingClientRect().right <= innerWidth + 1}; });
  ok(Ev.w[0] <= Ev.w[1] + 1 && Ev.gs && Ev.gw, 'bulk: no page horizontal scroll at 390 px (the grid scrolls inside)', Ev);
  await p.setViewportSize({width:1366, height:768}); await p.waitForTimeout(100);
  // back to the archive
  await p.click('#bk-close'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => !BK.on && !!document.querySelector('#arch-results .tbl') && !!document.querySelector('#btn-bulk')), 'bulk: "Torna all\'archivio" closes the mode');
  // clean up: test binders, log entries written by this block, view state
  await p.evaluate(async (start) => {
    while (topModal()) closeModal(true);
    BK.on = false; BK.draft.clear(); BK.hist = []; BK.sel.clear(); BK.sort = {k:'', dir:1}; BK.group = ''; BK.savedUndo = null; BK.clip = null;
    UI.q = ''; UI.fState = UI.fRoom = UI.fCat = ''; UI.fInfo = null; delete S.settings.bulkCols; S.lang = 'it';
    S.binders = S.binders.filter(b => !/^EBK\d$/.test(b.speaking_code));
    DB.db.run('DELETE FROM activity_log WHERE at >= ?', [start]); LOG.entries = LOG.entries.filter(e => e.at < start); LOG.pending = []; logSavePending();
    commit(); S.view = 'archive'; renderAll(); dbSyncFromState('t'); await dbPersist();
  }, Estart);

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
  ok(Kv === 'blue,green,violet,orange,red,red,yellow,warm,warm,cool,cool,pink,slate,teal', 'family per category: seeds APS red / ETS yellow, warm for other associations, cool dark for companies', Kv);
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
    r.cols = CSV_COLUMNS.indexOf('color_locked') === 27 && binderToCsvRow(L).length === CSV_COLUMNS.length;   // v11: location_id appended after color_locked
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
  // ---- v10 K2: colour spectra (seeds) + keyword colour rules ----
  sec('v10 K2: colour spectra and keyword colour rules');
  await p.evaluate(() => { let i = 0; while (topModal() && i++ < 5) closeModal(true); S.settings.colorMode = 'company'; S.settings.colorRules = {}; S.lang = 'it'; });
  Kv = await p.evaluate(() => {
    const r = {spectra:COLOR_SPECTRA.join(), names:COLOR_SPECTRA.map(id => COLOR_FAMILY[id].it).join('|'), seeds:['APS','ODV','ASD','ETS','APS Cultura','aps'].map(colorFamilyId).join()};
    S.settings.catFamilies = {APS:'violet'}; r.explicit = colorFamilyId('APS');
    S.settings.catFamilies = {}; S.settings.colorSeeds = {APS:'pink'}; r.seedData = colorFamilyId('APS'); delete S.settings.colorSeeds;
    r.base = colorCategoryHex('ETS') === COLOR_FAMILY.yellow.shades[0];
    return r;
  });
  ok(Kv.spectra === 'red,green,blue,yellow,orange,violet,pink,slate' && Kv.names === 'Rosso|Verde|Azzurro / Blu|Giallo|Arancione|Viola|Rosa|Nero / Grigi', '8 colour spectra (Rosso … Nero/Grigi)', Kv);
  ok(Kv.seeds === 'red,green,blue,yellow,red,red' && Kv.explicit === 'violet' && Kv.seedData === 'pink' && Kv.base, 'seed families APS→Rosso, ODV→Verde, ASD→Blu, ETS→Giallo; a chosen family wins; seeds are data', Kv);
  Kv = await p.evaluate(() => [['Pro Loco Busseto','proloco'], ['PRO-LOCO di Soragna','proloco'], ['Proloco','Pro Loco'], ['Associazione Pro·Loco','proloco'], ['Prolocomotiva srl','proloco'], ['Capsule srl','aps'], ['Società Àlfa','societa alfa'], ['Circolo  ARCI','arci']].map(x => colorTextMatches(x[0], x[1]) ? 1 : 0).join(''));
  ok(Kv === '11110011', 'keyword normalisation: case, accents, spaces and dashes ignored; whole words only', Kv);
  Kv = await p.evaluate(() => {
    const r = {}, sh = colorShades('Ktest');
    const a = colorRuleAdd('Ktest', 'proloco'), b = colorRuleAdd('Ktest', 'circolo');
    r.a = a.rule && sh.slice(1).includes(a.rule.hex) && a.rule.hex !== sh[0]; r.b = b.rule && b.rule.hex !== a.rule.hex && b.rule.hex !== sh[0];
    r.dup = colorRuleAdd('Ktest', 'PRO LOCO').error; r.empty = colorRuleAdd('Ktest', ' - ').error;
    for (let i = 0; i < 8; i++) colorRuleAdd('Ktest', 'kword' + i);
    r.n = colorRulesFor('Ktest').length; r.max = colorRuleAdd('Ktest', 'undicesima').error;
    r.distinct = new Set(colorRulesFor('Ktest').slice(0, 9).map(x => x.hex)).size;
    r.stamp = !!S.settings.colorUpdatedAt;
    colorRulesSet('Ktest', colorRulesFor('Ktest').slice(0, 2));
    return r;
  });
  ok(Kv.a && Kv.b && Kv.dup === 'dup' && Kv.empty === 'empty', 'add rule auto-picks a free shade of the family (not the base, not another rule\'s)', Kv);
  ok(Kv.n === 10 && Kv.max === 'max' && Kv.distinct === 9 && Kv.stamp, 'at most 10 rules per category, distinct shades, colour settings stamped', Kv);
  Kv = await p.evaluate(() => {
    const rule = colorRulesFor('Ktest')[0], mk = (o) => normalizeBinder(Object.assign({category:'Ktest', short_code:newShortCode()}, o));
    const m1 = mk({speaking_code:'KR1', company_name:'Pro-Loco Uno', color_hex:'#111111'}), m2 = mk({speaking_code:'KR2', company_name:'PRO LOCO Due', color_hex:'#222222'});
    const m3 = mk({speaking_code:'KR3', company_name:'Proloco Tre', color_hex:'#333333', color_locked:true}), m4 = mk({speaking_code:'KR4', company_name:'Kappa Ditta 77', binder_title:'Fatture proloco', color_hex:'#444444'});
    const m5 = mk({speaking_code:'KR5', company_name:'Zeta Nuova Ditta', color_hex:'#555555'});
    S.binders.push(m1, m2, m3, m4, m5);
    const r = {rule:rule.hex, a1:colorAssign(m1, S.binders), a4:colorAssign(m4, S.binders), lockedAuto:applyAutoColor(m3), other:colorAssign(m5, S.binders)};
    S.settings.colorMode = 'category'; r.cat = colorAssign(m2, S.binders); S.settings.colorMode = 'company';
    r.otherFree = !colorRulesFor('Ktest').some(x => x.hex === r.other);
    return r;
  });
  ok(Kv.a1 === Kv.rule && Kv.a4 === Kv.rule && Kv.cat === Kv.rule, 'rule match (company name or title) gives the rule shade, in company and category mode', Kv);
  ok(Kv.lockedAuto === false && Kv.otherFree, 'precedence: locked colour kept; other companies never get a rule\'s shade', Kv);
  // Informazioni dialog: rules list, add via UI, apply to existing with undo
  await p.evaluate(() => { S.view = 'info'; S.infoTab = 'category'; UI.infoq = ''; renderAll(); }); await p.waitForTimeout(150);
  ok(await p.evaluate(() => !!document.querySelector('#co-rules-ov') && document.querySelectorAll('#co-rules-ov .co-ov-r').length === 2), 'Informazioni › Categorie: overview of all colour rules');
  await p.click('[data-a="info-color"][data-k="ordinaria"]'); await p.waitForTimeout(150);
  Kv = await p.evaluate(() => ({rows:document.querySelectorAll('#co-rules .co-rule').length, add:!!document.querySelector('#co-rules [data-a="co-rule-new"]'), chips:document.querySelectorAll('#info-fams .co-spec.big').length}));
  ok(Kv.rows === 0 && Kv.add && Kv.chips === 8, 'category without rules: no rule rows, just "Aggiungi regola"; 8 spectrum chips', Kv);
  await p.evaluate(() => closeModal(true));
  await p.click('[data-a="info-color"][data-k="ktest"]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => document.querySelectorAll('#co-rules .co-rule').length === 2 && document.querySelector('#co-rules .co-rule-n').textContent.includes('4')), 'category with rules: rows with shade and match count');
  await p.click('#co-rules [data-a="co-rule-new"]'); await p.fill('#co-rule-kw', 'Zeta Nuova'); await p.press('#co-rule-kw', 'Enter'); await p.waitForTimeout(80);
  Kv = await p.evaluate(() => ({rows:document.querySelectorAll('#co-rules .co-rule').length, checked:$('#info-col-all').checked, hex:UI.coCat.rules[2].hex, used:UI.coCat.rules.slice(0, 2).map(r => r.hex)}));
  ok(Kv.rows === 3 && Kv.checked && !Kv.used.includes(Kv.hex), 'Aggiungi regola in the dialog: new row with a free shade, "apply to existing" offered', Kv);
  await p.click('#co-rules .co-rule:nth-child(3) [data-a="co-rule-mv"][data-d="-1"]'); await p.waitForTimeout(50);
  ok(await p.evaluate(() => UI.coCat.rules[1].kw === 'Zeta Nuova'), 'rules can be reordered');
  await p.locator('.modal-f .btn-primary').last().click(); await p.waitForTimeout(200);
  Kv = await p.evaluate(() => { const g = (c) => S.binders.find(x => x.speaking_code === c); const R = colorRulesFor('Ktest'); return {n:R.length, kw:R[1].kw, k1:g('KR1').color_hex === R[0].hex, k2:g('KR2').color_hex === R[0].hex, k3:g('KR3').color_hex, k4:g('KR4').color_hex === R[0].hex, k5:g('KR5').color_hex === R[1].hex, log:LOG.entries.slice(-3).map(e => e.action).join()}; });
  ok(Kv.n === 3 && Kv.kw === 'Zeta Nuova' && Kv.k1 && Kv.k2 && Kv.k4 && Kv.k5 && Kv.k3 === '#333333', 'saving applies the rules to existing unlocked binders; locked ones untouched', Kv);
  ok(/settings\.color_rules|binder\.recolor/.test(Kv.log), 'colour rules change is logged', Kv);
  Kv = await p.evaluate(() => { const btn = [...document.querySelectorAll('.toast-act')].pop(); btn && btn.click(); return {n:colorRulesFor('Ktest').length, k1:S.binders.find(x => x.speaking_code === 'KR1').color_hex}; });
  ok(Kv.n === 2 && Kv.k1 === '#111111', 'rules change + recolour can be undone', Kv);
  await p.evaluate(() => { S.lang = 'en'; renderAll(); }); await p.waitForTimeout(100);
  await p.click('[data-a="info-color"][data-k="ktest"]'); await p.waitForTimeout(150);
  Kv = await p.evaluate(() => ({t:document.querySelector('.modal').innerText, w:document.documentElement.scrollWidth <= innerWidth + 1}));
  ok(/colour rules/i.test(Kv.t) && /colour spectrum/i.test(Kv.t) && Kv.t.includes('Add rule') && Kv.w, 'colour rules dialog in English', {t:Kv.t.slice(-400), w:Kv.w});
  await p.evaluate(() => { closeModal(true); S.lang = 'it'; renderAll(); });
  // max 10 in the UI
  Kv = await p.evaluate(() => { for (let i = 0; i < 8; i++) colorRuleAdd('Ktest', 'ui' + i); openCatColor('ktest'); const b = document.querySelector('#co-rules [data-a="co-rule-new"]'); const r = {n:document.querySelectorAll('#co-rules .co-rule').length, dis:b && b.disabled}; closeModal(true); colorRulesSet('Ktest', colorRulesFor('Ktest').slice(0, 2)); return r; });
  ok(Kv.n === 10 && Kv.dis === true, 'dialog: "Aggiungi regola" disabled at 10 rules', Kv);
  // editor: rule hint, spectrum for a new category
  Kv = await p.evaluate(() => {
    const r = {}; openEditor(null);
    const co = $('#ed-company_name'); co.value = 'Pro Loco Quattro'; co.dispatchEvent(new Event('input', {bubbles:true}));
    const cat = $('#ed-category'); cat.value = 'Ktest'; cat.dispatchEvent(new Event('input', {bubbles:true}));
    r.rule = UI.ed.d.color_hex === colorRulesFor('Ktest')[0].hex; r.hint = !!document.querySelector('#ed-swatches .co-rule-hint');
    cat.value = 'Knuova categoria'; cat.dispatchEvent(new Event('input', {bubbles:true}));
    r.chips = document.querySelectorAll('#ed-swatches [data-a="ed-spectrum"]').length;
    document.querySelector('#ed-swatches [data-a="ed-spectrum"][data-f="yellow"]').click();
    r.fam = (S.settings.catFamilies || {})['Knuova categoria']; r.col = COLOR_FAMILY.yellow.shades.includes(UI.ed.d.color_hex);
    closeModal(true); delete S.settings.catFamilies['Knuova categoria'];
    return r;
  });
  ok(Kv.rule && Kv.hint, 'editor: the colour follows the keyword rule and says so', Kv);
  ok(Kv.chips === 8 && Kv.fam === 'yellow' && Kv.col, 'editor: a new category can get its spectrum right away', Kv);
  // bulk edit "Colore automatico" path uses the rules (colorAssign)
  ok(await p.evaluate(() => { const b = S.binders.find(x => x.speaking_code === 'KR2'); const m = Object.assign({}, b, {color_locked:false}); return colorAssign(m, S.binders) === colorRulesFor('Ktest')[0].hex; }), 'automatic colour (bulk edit / Automatico) uses the rules');
  // JSON round trip + sync package (newer colour block wins)
  Kv = await p.evaluate(() => {
    const r = {}, W = JSON.parse(workspaceJSON());
    r.json = (W.settings.colorRules.Ktest || []).map(x => x.kw).join() === colorRulesFor('Ktest').map(x => x.kw).join() && !!W.settings.colorUpdatedAt;
    const P = syncBuildPackage({}); const ss = P.settingsSubset;
    r.pkg = ss.colorRules.Ktest.length === 2 && ss.colorMode === 'company' && ss.colorUpdatedAt === S.settings.colorUpdatedAt;
    const old = JSON.parse(JSON.stringify(ss)); old.colorRules = {Ktest:[{id:'x', kw:'vecchia', hex:'#123456'}]}; old.colorUpdatedAt = '2000-01-01T00:00:00Z';
    r.older = colorSyncApply(old) === false && colorRulesFor('Ktest').length === 2;
    const nw = JSON.parse(JSON.stringify(ss)); nw.colorRules = {Ktest:[{id:'y', kw:'nuova', hex:'#654321'}], __proto__x:[]}; nw.catFamilies = {Ktest:'green', Bad:'nope'}; nw.colorUpdatedAt = new Date(Date.now() + 60000).toISOString();
    r.newer = colorSyncApply(nw) === true && colorRulesFor('Ktest')[0].kw === 'nuova' && S.settings.catFamilies.Ktest === 'green' && !('Bad' in S.settings.catFamilies);
    S.settings.colorRules = W.settings.colorRules; S.settings.catFamilies = W.settings.catFamilies || {}; S.settings.colorUpdatedAt = W.settings.colorUpdatedAt;
    return r;
  });
  ok(Kv.json && Kv.pkg, 'colour rules in the JSON backup and in the sync package settings', Kv);
  ok(Kv.older && Kv.newer, 'sync: the newer colour block wins, the older is ignored, invalid families dropped', Kv);
  // Settings link + rename keeps rules
  await p.evaluate(() => { S.view = 'settings'; renderAll(); }); await p.waitForTimeout(100);
  await p.click('[data-a="co-rules-open"]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => S.view === 'info' && S.infoTab === 'category' && document.querySelector('#co-rules-ov').open), 'Settings › Colori dei dorsi links to the colour rules');
  Kv = await p.evaluate(() => { undoPoint(); infoRename('category', 'ktest', 'Ktest Due'); const n = colorRulesFor('Ktest Due').length; const old = colorRulesFor('Ktest').length; return {n, old}; });
  ok(Kv.n === 2 && Kv.old === 0, 'renaming a category keeps its colour rules', Kv);
  await p.evaluate(() => { infoRename('category', 'ktest due', 'Ktest'); UI.coRulesOpen = false; });
  // clean up
  await p.evaluate(() => { const K = JSON.parse(window.__Ksnap); delete window.__Ksnap; S.binders = K.binders.map(normalizeBinder); S.settings = K.settings; S.view = K.view; S.infoTab = K.infoTab; S.lang = K.lang; UI.importParsed = null; infoApplyCatColors(); commit(); renderAll(); });
  ok(await p.evaluate(() => !S.binders.some(b => /^K(C|ED|X|OLD|M|R)\d/.test(b.speaking_code))), 'stream K test data removed');

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

  // @@STREAM-S@@
  sec('v10 S: manual sync local ⇄ web app');
  let Sv;
  const Sstart = await p.evaluate(() => {
    while (topModal()) closeModal(true); S.lang = 'it'; S.view = 'archive'; SYNC.modeOverride = ''; renderAll();
    window.__sOrig = {id:syncDeviceId(), label:S.settings.deviceLabel, binders:clone(S.binders), clients:clone(S.clients || []), tombstones:clone(S.tombstones || []), sync:clone(S.sync), op:S.settings.operator};
    window.__sDev = {};
    // simulate a second installation in the same page: park this device's data, load the other one's
    window.__sSwap = (to) => {
      const cur = syncDeviceId();
      __sDev[cur] = {binders:clone(S.binders), clients:clone(S.clients || []), tombstones:clone(S.tombstones || []), sync:clone(S.sync), label:S.settings.deviceLabel};
      const n = __sDev[to] || {binders:[], clients:[], tombstones:[], sync:null, label:''};
      syncSetDevice(to); S.binders = clone(n.binders); S.clients = clone(n.clients); S.tombstones = clone(n.tombstones); S.sync = n.sync ? clone(n.sync) : null; S.settings.deviceLabel = n.label;
      SYNC.quiet = true; persist(); return cur;
    };
    window.__sWait = (ms) => new Promise(r => setTimeout(r, ms || 12));
    window.__sB = (c) => S.binders.find(b => b.speaking_code === c);
    window.__sImport = async (text, pass, choose) => { const plan = syncAnalyze(await syncParse(text, pass)); if (choose) choose(plan); const c = clone(plan.counts); const d = syncApply(plan); return {c, d, plan}; };
    S.settings.operator = 'Sync Test';
    ['SYA1', 'SYA2', 'SYA3', 'SYA4'].forEach(c => S.binders.push(normalizeBinder({speaking_code:c, company_name:'Sync Test Srl', binder_title:'Base ' + c, short_code:newShortCode(), selected_for_print:false})));
    S.clients.push(normalizeClient({name:'Cliente Sync', multi_code:'SY9'}));
    commit();
    return nowISO();
  });
  // change tracking: every edit bumps updated_at (whatever code path), print selection does not, clients get a time
  Sv = await p.evaluate(async () => {
    const b = __sB('SYA4'), u0 = b.updated_at; await __sWait();
    b.selected_for_print = true; commit(); const u1 = b.updated_at; await __sWait();
    b.tags = 'syncedit'; commit(); const u2 = b.updated_at;   // direct mutation, no explicit bump
    const c = S.clients.find(x => x.name === 'Cliente Sync'), cu0 = c.updated_at; await __sWait(); c.city = 'Parma'; commit();
    await __sWait();
    analyzeImport('speaking_code;company_name;binder_title;updated_at\nSYA4;Sync Test Srl;Titolo da CSV;2001-01-01T00:00:00.000Z'); applyImport('merge');
    const b2 = __sB('SYA4');
    return {same:u1 === u0, bumped:u2 > u0, client:!!cu0 && c.updated_at > cu0, csv:b2.binder_title === 'Titolo da CSV' && b2.updated_at > u2, dev:/^dev-/.test(S.settings.deviceId) && localStorage.getItem(SYNC_DEV_LS) === S.settings.deviceId};
  });
  ok(Sv.same && Sv.bumped && Sv.client && Sv.csv && Sv.dev, 'sync: content edits bump updated_at on every path (direct mutation, client, CSV merge never goes backwards); print selection does not; stable deviceId', Sv);
  await p.evaluate(() => { S.view = 'archive'; renderAll(); });
  // tombstones on delete, removed again by undo
  Sv = await p.evaluate(() => {
    const b = normalizeBinder({speaking_code:'SYT1', company_name:'Tomb Srl', short_code:newShortCode()}); S.binders.push(b); commit();
    undoPoint(); logBinderDelete([b]); S.binders = S.binders.filter(x => x.id !== b.id); commit();
    const tb = S.tombstones.find(x => x.id === b.id);
    const W = UNDO; UNDO = null; applyWorkspaceObject(W); commit();
    const back = !!__sB('SYT1') && !S.tombstones.some(x => x.id === b.id);
    S.binders = S.binders.filter(x => x.id !== b.id); commit();
    const old = {type:'binder', id:'old-x', code:'OLD', deletedAt:new Date(Date.now() - 400 * 86400000).toISOString(), who:'x'}; S.tombstones.push(old); commit();
    return {tb, back, again:S.tombstones.some(x => x.id === b.id), pruned:!S.tombstones.some(x => x.id === 'old-x')};
  });
  ok(Sv.tb && Sv.tb.type === 'binder' && Sv.tb.code === 'SYT1' && Sv.tb.who === 'Sync Test' && !isNaN(new Date(Sv.tb.deletedAt)) && Sv.back && Sv.again && Sv.pruned, 'sync: deleting records a tombstone {type, id, deletedAt, who}; undo removes it; tombstones older than 365 days are pruned', Sv);
  // full round trip A → B and B → A (plain package)
  Sv = await p.evaluate(async () => {
    const A = syncDeviceId(); S.settings.deviceLabel = 'PC studio';
    const e0 = await syncExport({incremental:false, target:''});
    const pk = JSON.parse(e0.text);
    const canon = () => S.binders.map(b => [b.id, syncCanon(b, 'binder'), b.updated_at]).sort().join('|') + '#' + S.clients.map(c => [c.id, syncCanon(c, 'client'), c.updated_at]).sort().join('|');
    const ca = canon();
    __sSwap('dev-web-test'); S.settings.deviceLabel = 'Web app';
    const r = await __sImport(e0.text);
    const cb = canon();
    const peerA = clone(S.sync.peers[A]);
    const f0 = await syncExport({incremental:false, target:A});
    __sSwap(A);
    const r2 = await __sImport(f0.text);
    return {fmt:pk.format, ver:pk.version, src:pk.source, recs:pk.records.binders.length, n:S.binders.length, nc:S.clients.length, c:r.c, same:ca === cb, peerA, c2:r2.c, ack:S.sync.peers['dev-web-test'].ackedAt === pk.exportedAt, A};
  });
  ok(Sv.fmt === 'docmap-sync' && Sv.ver === 1 && Sv.src.deviceId === Sv.A && Sv.src.mode === 'local' && Sv.src.deviceLabel === 'PC studio' && Sv.src.operator === 'Sync Test' && Sv.recs === Sv.n, 'sync: package {format docmap-sync, version 1, source {deviceId, label, mode, operator}, records}', Sv.src);
  ok(Sv.c.new === Sv.n + Sv.nc && Sv.c.conflict === 0 && Sv.same && Sv.peerA.label === 'PC studio' && Sv.peerA.lastImportAt && Sv.peerA.lastSeenRemoteExportAt, 'sync: full export → import on an empty second device gives identical binders and clients (same updated_at); peer bookkeeping', Sv);
  ok(Sv.c2.unchanged === Sv.n + Sv.nc && Sv.c2.new === 0 && Sv.c2.updated === 0 && Sv.ack, 'sync: importing the copy back changes nothing (all unchanged) and records the ack', Sv.c2);
  // Dave's scenario: local edit t1, web edit t2, local edits t3 and t4 → the t4 version wins on both sides
  Sv = await p.evaluate(async () => {
    const A = syncDeviceId(), W = 'dev-web-test';
    __sB('SYA1').binder_title = 'T1 locale'; commit(); await __sWait();
    __sSwap(W); __sB('SYA1').binder_title = 'T2 web'; commit(); const t2 = __sB('SYA1').updated_at; logAct('binder.edit', logBT(__sB('SYA1')), 'Modifica fatta nella web app', {}); await __sWait();
    __sSwap(A); __sB('SYA1').binder_title = 'T3 locale'; commit(); await __sWait(); __sB('SYA1').binder_title = 'T4 locale'; commit(); const t4 = __sB('SYA1').updated_at;
    const e1 = await syncExport({incremental:true, target:W});
    __sSwap(W); const f1 = await syncExport({incremental:true, target:A});
    __sSwap(A); LOG.entries = LOG.entries.filter(e => e.summary !== 'Modifica fatta nella web app');   // the two devices share one page: drop the web entry so the import must bring it
    const inPkg = JSON.parse(f1.text).activity_log.some(e => e.summary === 'Modifica fatta nella web app');
    const ra = await __sImport(f1.text);
    const ca = ra.plan.items.find(i => i.code === 'SYA1');
    const onA = {title:__sB('SYA1').binder_title, u:__sB('SYA1').updated_at, logged:inPkg && LOG.entries.some(e => e.summary === 'Modifica fatta nella web app')};
    __sSwap(W); const rb = await __sImport(e1.text);
    const cb = rb.plan.items.find(i => i.code === 'SYA1');
    const onB = {title:__sB('SYA1').binder_title, u:__sB('SYA1').updated_at};
    __sSwap(A);
    return {t2, t4, onA, onB, ka:ca.kind + '/' + ca.reason + '/' + ca.choice, kb:cb.kind + '/' + cb.reason + '/' + cb.choice, e1n:JSON.parse(e1.text).records.binders.length, f1n:JSON.parse(f1.text).records.binders.length, since:JSON.parse(e1.text).since};
  });
  ok(Sv.onA.title === 'T4 locale' && Sv.onB.title === 'T4 locale' && Sv.onA.u === Sv.t4 && Sv.onB.u === Sv.t4 && Sv.t4 > Sv.t2, 'sync: Dave\'s scenario (local t1, web t2, local t3, t4) → after importing both ways the t4 version wins on both sides', Sv);
  ok(Sv.ka === 'conflict/both/local' && Sv.kb === 'conflict/both/remote' && Sv.onA.logged, 'sync: record changed on both sides since the last sync is a conflict, default = most recent; peer log entries merged', Sv);
  ok(Sv.since && Sv.e1n >= 1 && Sv.e1n < 6 && Sv.f1n === 1, 'sync: "solo modifiche" packages carry only the records changed since the last sync', Sv);
  // incremental after a sync: one edit → exactly one record
  Sv = await p.evaluate(async () => {
    const A = syncDeviceId(), W = 'dev-web-test';
    __sSwap(W); const f = await syncExport({incremental:true, target:A}); __sSwap(A); await __sImport(f.text);   // the web side confirms what it has (ack)
    await __sWait(); __sB('SYA4').notes = 'una nota'; commit();
    const e = JSON.parse((await syncExport({incremental:true, target:W})).text);
    return {b:e.records.binders.map(b => b.speaking_code), c:e.records.clients.length, t:e.tombstones.length, full:e.since === null};
  });
  ok(Sv.b.join() === 'SYA4' && Sv.c === 0 && Sv.t === 0 && !Sv.full, 'sync: incremental package after one edit holds exactly that binder', Sv);
  // deletions travel; deletion vs later edit keeps the edited record (flagged), and back again it is restored
  Sv = await p.evaluate(async () => {
    const A = syncDeviceId(), W = 'dev-web-test';
    __sSwap(W); const r0 = await __sImport((await (async () => { __sSwap(A); const x = await syncExport({incremental:true, target:W}); __sSwap(W); return x; })()).text);   // B catches up (SYA4 notes)
    __sSwap(A); S.binders = S.binders.filter(b => b.speaking_code !== 'SYA2' && b.speaking_code !== 'SYA3'); commit(); await __sWait();
    const e = await syncExport({incremental:true, target:W}); const pk = JSON.parse(e.text);
    __sSwap(W); __sB('SYA3').binder_title = 'Modificato dopo l\'eliminazione'; commit();
    const r = await __sImport(e.text);
    const it3 = r.plan.items.find(i => i.code === 'SYA3'), it2 = r.plan.items.find(i => i.code === 'SYA2');
    const onB = {has2:!!__sB('SYA2'), has3:!!__sB('SYA3'), tomb2:S.tombstones.some(x => x.code === 'SYA2')};
    const f = await syncExport({incremental:true, target:A});
    __sSwap(A); const r2 = await __sImport(f.text);
    const back = r2.plan.items.find(i => i.code === 'SYA3');
    return {tombs:pk.tombstones.map(x => x.code).sort().join(), k2:it2.kind, k3:it3.kind + '/' + it3.reason + '/' + it3.choice, onB, back:back.kind + '/' + back.reason + '/' + back.choice, onA3:(__sB('SYA3') || {}).binder_title, onA2:!!__sB('SYA2'), r0:r0.c.updated};
  });
  ok(Sv.tombs === 'SYA2,SYA3' && Sv.k2 === 'delete' && !Sv.onB.has2 && Sv.onB.tomb2, 'sync: deletions propagate through tombstones', Sv);
  ok(Sv.k3 === 'conflict/deleted_remote/local' && Sv.onB.has3 && Sv.back === 'conflict/deleted_local/remote' && Sv.onA3 === 'Modificato dopo l\'eliminazione' && !Sv.onA2, 'sync: deleted on one side but edited later on the other → the edit is kept and flagged, and restored on the deleting side', Sv);
  // conflicts with per-record choice, through the UI: review screen, side-by-side diff, choice, apply, undo
  const Spkg = await p.evaluate(async () => {
    const A = syncDeviceId(), W = 'dev-web-test';
    __sSwap(W); __sB('SYA1').binder_title = 'Y web'; __sB('SYA4').tags = 'z-web'; commit(); await __sWait();
    const f = await syncExport({incremental:true, target:A, pass:'passphrase-test'});
    __sSwap(A); __sB('SYA1').binder_title = 'Y locale'; __sB('SYA4').tags = 'z-locale'; commit();
    window.__sBefore = {y:__sB('SYA1').binder_title, z:__sB('SYA4').tags, peer:clone(S.sync.peers[W]), hist:S.sync.history.length, n:LOG.entries.length};
    S.view = 'sync'; renderAll(); return f.text;
  });
  await p.fill('#sy-text', Spkg); await p.fill('#sy-ipass', 'passphrase-test');
  await p.click('[data-a="sy-analyze"]'); await p.waitForSelector('#sy-review', {timeout:15000});
  Sv = await p.evaluate(() => ({cards:document.querySelectorAll('#sy-review .sy-conf').length, diff:document.querySelector('#sy-review .sy-diff').textContent, badges:Array.from(document.querySelectorAll('#sy-review [data-syk]')).map(x => x.textContent), choices:SYNC.plan.items.filter(i => i.kind === 'conflict').map(i => i.code + ':' + i.choice).sort().join()}));
  ok(Sv.cards === 2 && /titolo/.test(Sv.diff) && /Y locale/.test(Sv.diff) && /Y web/.test(Sv.diff) && Sv.badges.some(x => /2 conflitti/.test(x)) && Sv.choices === 'SYA1:local,SYA4:local', 'sync review: counts, conflicts with side-by-side diff of the changed fields, default = most recent', Sv);
  await p.screenshot({path:'shots/s_sync_review.png'});
  await p.evaluate(() => { const i = SYNC.plan.items.findIndex(x => x.code === 'SYA1'); document.querySelector('[data-syc="' + i + '"][value="remote"]').click(); });
  Sv = await p.evaluate(() => SYNC.plan.items.filter(i => i.kind === 'conflict').map(i => i.code + ':' + i.choice).sort().join());
  ok(Sv === 'SYA1:remote,SYA4:local', 'sync review: per-record choice "tieni importato"', Sv);
  await p.click('#sy-review [data-a="sy-all-newer"]');
  Sv = await p.evaluate(() => ({c:SYNC.plan.items.filter(i => i.kind === 'conflict').map(i => i.code + ':' + i.choice).sort().join(), r:Array.from(document.querySelectorAll('[data-syc]:checked')).map(x => x.value).join()}));
  ok(Sv.c === 'SYA1:local,SYA4:local' && Sv.r === 'local,local', '"applica a tutti: il più recente" resets every conflict to the newer side', Sv);
  await p.evaluate(() => { const i = SYNC.plan.items.findIndex(x => x.code === 'SYA1'); document.querySelector('[data-syc="' + i + '"][value="remote"]').click(); });
  await p.click('.modal-f .btn-primary'); await p.waitForTimeout(200);
  Sv = await p.evaluate(() => { const W = 'dev-web-test', l = LOG.entries.slice(__sBefore.n);
    return {y:__sB('SYA1').binder_title, z:__sB('SYA4').tags, modal:!!topModal(), imp:l.filter(e => e.action === 'sync.import').map(e => e.source + ':' + e.details.conflicts), conf:l.filter(e => e.action === 'sync.conflict').map(e => e.target.code + ':' + e.details.choice).sort().join(), peer:S.sync.peers[W].lastImportAt !== __sBefore.peer.lastImportAt, hist:S.sync.history.length - __sBefore.hist}; });
  ok(Sv.y === 'Y web' && Sv.z === 'z-locale' && !Sv.modal && Sv.imp.join() === 'sync:2' && Sv.conf === 'SYA1:remote,SYA4:local' && Sv.peer && Sv.hist === 1, 'sync: apply honours the choices, logs sync.import + sync.conflict (source "sync"), updates peer and history', Sv);
  await p.click('#toasts .toast-act >> nth=-1'); await p.waitForTimeout(150);
  Sv = await p.evaluate(() => { const W = 'dev-web-test'; return {y:__sB('SYA1').binder_title, z:__sB('SYA4').tags, peer:JSON.stringify(S.sync.peers[W]) === JSON.stringify(__sBefore.peer), hist:S.sync.history.length === __sBefore.hist, undo:LOG.entries[LOG.entries.length - 1].details.undone_action}; });
  ok(Sv.y === 'Y locale' && Sv.z === 'z-locale' && Sv.peer && Sv.hist && Sv.undo === 'sync.import', 'sync: one Annulla reverts the whole import (records, peer bookkeeping, history)', Sv);
  // encryption
  Sv = await p.evaluate(async () => {
    const e = await syncExport({incremental:false, target:'', pass:'una passphrase lunga'}); const env = JSON.parse(e.text);
    let wrong = ''; try { await syncParse(e.text, 'passphrase sbagliata'); } catch(x){ wrong = x.message; }
    let none = ''; try { await syncParse(e.text, ''); } catch(x){ none = x.message; }
    let tamper = ''; try { const t2 = clone(env); t2.ct = t2.ct.slice(0, 40) + (t2.ct[40] === 'A' ? 'B' : 'A') + t2.ct.slice(41); await syncParse(JSON.stringify(t2), 'una passphrase lunga'); } catch(x){ tamper = x.message; }
    const okp = await syncParse(e.text, 'una passphrase lunga');
    let self = ''; try { syncAnalyze(okp); } catch(x){ self = x.message; }
    return {fmt:env.format, v:env.v, kdf:env.kdf, iv:syUnB64(env.iv).length, salt:syUnB64(env.kdf.salt).length, cipher:env.cipher, keys:Object.keys(env).sort().join(), leak:/Sync Test Srl|Barbieri|Cliente Sync|speaking_code/.test(e.text), wrong, none, tamper, back:okp.records.binders.some(b => b.speaking_code === 'SYA1'), self};
  });
  ok(Sv.fmt === 'docmap-sync-enc' && Sv.v === 1 && Sv.kdf.name === 'PBKDF2' && Sv.kdf.hash === 'SHA-256' && Sv.kdf.iterations >= 210000 && Sv.iv === 12 && Sv.salt === 16 && Sv.cipher === 'AES-256-GCM' && Sv.keys === 'cipher,ct,format,iv,kdf,v', 'sync encryption: AES-256-GCM, PBKDF2-SHA256 ≥ 210k, random salt + iv, wrapper {format docmap-sync-enc, v, kdf, iv, ct}', Sv);
  ok(!Sv.leak && /errata/.test(Sv.wrong) && /cifrato/.test(Sv.none) && /errata/.test(Sv.tamper) && Sv.back, 'sync encryption: ciphertext holds no plaintext names or codes; wrong / missing passphrase and tampered files rejected; right passphrase decrypts', Sv);
  ok(/stesso dispositivo/.test(Sv.self), 'sync: a package from this same device is refused', Sv.self);
  // normal Import view does not merge sync packages; dropping one opens the Sync view
  Sv = await p.evaluate(async () => { const e = await syncExport({incremental:false, target:''}); analyzeImport(e.text); const r = UI.importParsed; UI.importParsed = null; return r; });
  ok(Sv && /Sincronizzazione/.test(Sv.error || ''), 'sync: a sync package pasted in the normal Import view is redirected (no replace/merge)', Sv);
  const SpkF = 'shots/docmap-sync-test.json';
  fs.writeFileSync(SpkF, await p.evaluate(async () => (await syncExport({incremental:false, target:''})).text));
  await p.evaluate(() => { S.view = 'import'; renderAll(); });
  await p.setInputFiles('#file-import', SpkF); await p.waitForTimeout(400);
  Sv = await p.evaluate(() => ({view:S.view, f:SYV.fileName, ta:/docmap-sync/.test(SYV.text) && !!document.querySelector('#sy-text')}));
  ok(Sv.view === 'sync' && Sv.f === 'docmap-sync-test.json' && Sv.ta, 'sync: a sync package chosen in Importa (or dropped) opens the Sync view with the file loaded', Sv);
  // the view: export with passphrase through the buttons (download), queue panel, menu, English, web-mode labels, no h-scroll
  await p.evaluate(() => { S.view = 'sync'; renderAll(); });
  await p.fill('#sy-pass', 'abc'); await p.fill('#sy-pass2', 'abc'); await p.click('[data-a="sy-export"]'); await p.waitForTimeout(100);
  Sv = await p.evaluate(() => document.querySelector('#toasts').textContent);
  ok(/almeno 8/.test(Sv), 'sync export: short passphrase refused', Sv.slice(-120));
  await p.fill('#sy-pass', 'passphrase-ok'); await p.fill('#sy-pass2', 'passphrase-ok');
  const SdlF = await dl('[data-a="sy-export"]');
  Sv = await p.evaluate(() => ({pass:document.querySelector('#sy-pass').value, e:LOG.entries[LOG.entries.length - 1], hist:document.querySelectorAll('#sy-hist tbody tr').length, peers:document.querySelectorAll('#sy-peers tbody tr').length, pending:document.querySelector('#sy-pending').textContent}));
  const SdlJ = JSON.parse(fs.readFileSync(SdlF, 'utf8'));
  ok(/^docmap-sync-pc-studio-\d{8}-\d{6}\.json$/.test(require('path').basename(SdlF)) && SdlJ.format === 'docmap-sync-enc' && Sv.pass === '' && Sv.e.action === 'sync.export' && Sv.e.details.encrypted && Sv.e.source === 'sync', 'sync export button: downloads docmap-sync-<slug>-<timestamp>.json, encrypted, passphrase field cleared, logged', [require('path').basename(SdlF), Sv.e]);
  ok(Sv.hist >= 3 && Sv.peers === 1 && Sv.pending === '0', 'sync queue panel: peers, history, local changes not yet exported', Sv);
  await p.evaluate(() => { const b = __sB('SYA4'); b.notes = 'pending'; commit(); renderView(); });
  Sv = await p.evaluate(() => ({pending:document.querySelector('#sy-pending').textContent, menu:!!document.querySelector('#nav-more [data-v="sync"]'), w:[document.documentElement.scrollWidth, innerWidth], lbl:VIEW_LABEL.sync, help:!!helpTopic('sync'), ex:document.querySelector('[data-a="sy-export"]').closest('.card').querySelector('h2').textContent}));
  ok(Sv.pending === '1' && Sv.menu && Sv.w[0] <= Sv.w[1] + 1 && Sv.lbl === 'nav_sync' && Sv.help && Sv.ex === 'Copia export per web app', 'sync view: in the ⚙ menu, pending counter, help topic, local labels, no h-scroll', Sv);
  await p.screenshot({path:'shots/s_sync.png'});
  Sv = await p.evaluate(() => { SYNC.modeOverride = 'web'; renderView(); const h = Array.from(document.querySelectorAll('.exp-card h2')).map(x => x.textContent); SYNC.modeOverride = ''; return h; });
  ok(Sv[0] === 'Esporta per il client locale' && Sv[1] === 'Importa dati da client locale', 'sync view: web-mode labels', Sv);
  await p.evaluate(() => { S.lang = 'en'; renderAll(); });
  Sv = await p.evaluate(() => ({h:document.querySelector('.page-h h1').textContent, cards:Array.from(document.querySelectorAll('.exp-card h2')).map(x => x.textContent), menu:document.querySelector('#nav-more [data-v="sync"]').textContent, q:document.querySelector('#sy-queue h2').textContent}));
  ok(/^Sync/.test(Sv.h) && Sv.cards[0] === 'Export for the web app' && Sv.cards[1] === 'Import data from the web app' && /Sync/.test(Sv.menu) && /Queue and history/.test(Sv.q), 'sync view: English UI', Sv);
  await p.setViewportSize({width:390, height:800}); await p.waitForTimeout(150);
  Sv = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  ok(Sv[0] <= Sv[1] + 1, 'sync view: no horizontal scroll at phone width', Sv);
  await p.setViewportSize({width:1366, height:768});
  // clean up: original device identity and data, log entries of this block
  await p.evaluate(async (start) => {
    while (topModal()) closeModal(true);
    const o = __sOrig; S.lang = 'it'; syncSetDevice(o.id); S.settings.deviceLabel = o.label; S.settings.operator = o.op;
    S.binders = o.binders; S.clients = o.clients; S.tombstones = o.tombstones; S.sync = o.sync; SYNC.quiet = true; UNDO = null; SYV.text = ''; SYV.target = null; SYV.incr = false;
    DB.db.run('DELETE FROM activity_log WHERE at >= ?', [start]); LOG.entries = LOG.entries.filter(e => e.at < start); LOG.pending = []; logSavePending();
    ['__sOrig', '__sDev', '__sSwap', '__sWait', '__sB', '__sImport', '__sBefore'].forEach(k => { delete window[k]; });
    commit(); S.view = 'archive'; renderAll(); dbSyncFromState('t'); await dbPersist();
  }, Sstart);

  // @@STREAM-G@@
  sec('v10 G: help popularity, favourites, action tags, forgiving search, guided tours');
  const Gsnap = await p.evaluate(() => {
    while (topModal()) closeModal(true); guideStop(); helpClose();
    const st = helpStore(), s = JSON.stringify(st);
    st.usage = {}; st.fav = {}; st.resume = {}; st.sort = {}; helpSave();
    const snap = {s, op:S.settings.operator, lang:S.lang, view:S.view, binders:JSON.stringify(S.binders), clients:JSON.stringify(S.clients || []), sess:dbSessions().map(x => x.id), dirty:S.hasUnexportedChanges, print:JSON.stringify(S.print), used:JSON.stringify(S.usedSlots || {}), infoTab:S.infoTab};
    S.settings.operator = ''; S.lang = 'it'; S.view = 'archive'; renderAll();
    return snap;
  });
  let Gv;
  // default order: the seeded everyday tasks first (topics and guided actions)
  await p.click('[data-a="help-open"]'); await p.waitForTimeout(150);
  Gv = await p.evaluate(() => ({topics:$$('#help-topics .help-item').map(b => b.dataset.id), guides:$$('#help-guides .help-g').map(b => b.dataset.id), sort:($('[data-a="help-sort"].on') || {}).dataset.v,
    titles:['create','print','client-new','import','locate','pdf'].map(id => L(helpTopic(id).title))}));
  ok(Gv.topics.slice(0, 3).join() === 'create,print,client-new' && Gv.guides.slice(0, 3).join() === 'create,print,client' && Gv.sort === 'pop' && Gv.guides.length === 5, 'help: default order is by popularity (create binder, print labels, new client first), top 5 guided actions', Gv);
  ok(Gv.titles.every(x => /^Come /.test(x)) && Gv.titles[0] === 'Come creo un nuovo faldone e la sua etichetta' && Gv.titles[2] === 'Come creo un nuovo cliente', 'help: task-oriented Italian titles', Gv.titles);
  // usage changes the order (counted per installation, decayed)
  await p.click('#help-topics [data-a="help-topic"][data-id="register"]'); await p.waitForTimeout(100);
  await p.click('[data-a="help-back"]'); await p.waitForTimeout(100);
  Gv = await p.evaluate(() => { const c1 = helpUseCount('t:register'); for (let i = 0; i < 14; i++) helpUse('t:register'); renderHelpList(); const top = $$('#help-topics .help-item')[0].dataset.id;
    const st = helpStore(); st.usage['t:register'].t = Date.now() - 120 * 864e5; const old = helpUseCount('t:register'); return {c1, top, old, raw:st.usage['t:register'].n}; });
  ok(Math.abs(Gv.c1 - 1) < 0.01 && Gv.top === 'register' && Math.abs(Gv.old - Gv.raw / 4) < 0.01, 'help: opening topics raises them (usage counted in localStorage, halves every 60 days)', Gv);
  Gv = await p.evaluate(() => { helpUse('g:backup'); helpUse('g:backup'); for (let i = 0; i < 20; i++) helpUse('g:register'); renderHelpList(); const g = $$('#help-guides .help-g').map(b => b.dataset.id); helpStore().usage = {}; helpSave(); renderHelpList(); return {g, back:$$('#help-guides .help-g')[0].dataset.id}; });
  ok(Gv.g[0] === 'register' && Gv.back === 'create', 'help: guided actions follow real usage too', Gv);
  // favourites: star, section on top, sort by favourites / A-Z, separate per operator
  await p.click('#help-topics [data-a="help-fav"][data-k="t:register"]'); await p.waitForTimeout(100);
  await p.click('#help-guides [data-a="help-fav"][data-k="g:print"]'); await p.waitForTimeout(100);
  Gv = await p.evaluate(() => ({fav:helpFavs(), sec:$$('.help-sec')[0].textContent.includes('Preferiti'), favRows:$$('.help-sec')[0].querySelectorAll('.help-row').length, pressed:$('#help-topics [data-a="help-fav"][data-k="t:register"]').getAttribute('aria-pressed'), ls:JSON.parse(localStorage.getItem(HELP_LS)).fav.pc}));
  ok(Gv.fav.join() === 'g:print,t:register' && Gv.sec && Gv.favRows === 2 && Gv.pressed === 'true' && Gv.ls.length === 2, 'help: star adds topics and guided actions to Preferiti (shown on top, saved per installation)', Gv);
  await p.click('[data-a="help-sort"][data-v="fav"]'); await p.waitForTimeout(100);
  Gv = await p.evaluate(() => ({t:$$('#help-topics .help-item')[0].dataset.id, g:$$('#help-guides .help-g')[0].dataset.id}));
  await p.click('[data-a="help-sort"][data-v="az"]'); await p.waitForTimeout(100);
  Gv.az = await p.evaluate(() => { const a = $$('#help-topics .help-item .hi-t').map(x => x.textContent); return a.every((x, i) => !i || a[i - 1].localeCompare(x, 'it', {sensitivity:'base'}) <= 0); });
  await p.click('[data-a="help-sort"][data-v="pop"]'); await p.waitForTimeout(100);
  ok(Gv.t === 'register' && Gv.g === 'print' && Gv.az, 'help: sort by Preferiti puts favourites first, A-Z sorts by title', Gv);
  Gv = await p.evaluate(() => { S.settings.operator = 'Mario Test'; const m0 = helpFavs().length; helpToggleFav('g:backup'); const m1 = helpFavs().join(); S.settings.operator = ''; const pc = helpFavs().join(); S.settings.operator = 'mario test '; const m2 = helpFavs().join(); S.settings.operator = ''; return {m0, m1, pc, m2}; });
  ok(Gv.m0 === 0 && Gv.m1 === 'g:backup' && Gv.pc === 'g:print,t:register' && Gv.m2 === 'g:backup', 'help: favourites are separate per operator name (else per PC)', Gv);
  // action tags: every topic has colour-coded action tags with readable contrast, and a legend
  Gv = await p.evaluate(() => { helpEnsure(); return {acts:HELP_ACTS, bad:HELP_TOPICS.filter(tp => !tp.acts.length || tp.acts.some(a => !HELP_ACTS[a]) || !tp.tags.length).map(tp => tp.id), n:HELP_TOPICS.length,
    btns:$$('#help-filters [data-a="help-act"]').length, chip:getComputedStyle($('#help-topics .hact')).color, legend:!!$('.hf-legend'), keys:['Come fare','Cos\'è','Creare','Modificare','Eliminare','Stampare','Importare / Esportare','Risolvere problemi'].every(k => Object.values(HELP_ACTS).some(a => a.it === k))}; });
  const Glum = (h) => { const c = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const Gcr = Object.values(Gv.acts).map(a => { const [l1, l2] = [Glum(a.c), Glum(a.bg)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); });
  ok(!Gv.bad.length && Gv.n >= 33 && Gv.btns >= 8 && Gv.keys && Gv.legend && new Set(Object.values(Gv.acts).map(a => a.c)).size === Object.keys(Gv.acts).length && Gcr.every(x => x >= 4.5), 'help: action tags (Come fare, Cos\'è, Creare, Modificare, Eliminare, Stampare, Importare/Esportare, Risolvere problemi…) on every topic, distinct colours, contrast ≥ 4.5', {bad:Gv.bad, cr:Gcr.map(x => x.toFixed(1))});
  // tag filters, then search has priority: tags reset and only the tags of the results stay lit
  await p.click('#help-filters [data-a="help-tag"][data-t="print"]'); await p.waitForTimeout(80);
  await p.click('#help-filters [data-a="help-act"][data-t="fix"]'); await p.waitForTimeout(80);
  Gv = await p.evaluate(() => ({tag:HELP.tag, act:HELP.act, ids:$$('#help-topics .help-item').map(b => b.dataset.id), all:helpList().every(tp => tp.tags.includes('print') && tp.acts.includes('fix'))}));
  ok(Gv.tag === 'print' && Gv.act === 'fix' && Gv.ids.length >= 3 && Gv.all && Gv.ids.includes('calib'), 'help: the two filters (topic + action) combine', Gv);
  await p.fill('#help-q', 'QR'); await p.waitForTimeout(120);
  Gv = await p.evaluate(() => ({tag:HELP.tag, act:HELP.act, lit:$$('#help-filters [data-a="help-tag"].lit').map(b => b.dataset.t), litA:$$('#help-filters .hact.lit').length, ai:$('#help-filters [data-a="help-tag"][data-t="ai"]').className, aiVis:$('#help-filters [data-a="help-tag"][data-t="ai"]').checkVisibility(), first:$$('#help-topics .help-item').slice(0, 3).map(b => b.dataset.id), n:$$('#help-topics .help-item').length, focus:document.activeElement.id}));
  ok(Gv.tag === '' && Gv.act === '' && ['label', 'print', 'archive', 'qr'].every(x => Gv.lit.includes(x)) && !Gv.lit.includes('ai') && /nomatch/.test(Gv.ai) && !Gv.aiVis && Gv.litA > 0 && Gv.first.includes('qr-reprint') && Gv.focus === 'help-q', 'help: typing resets the filters; searching "QR" lights Etichette/Stampa/Archivio, never AI', Gv);
  Gv = await p.evaluate(() => { const r = (q) => { HELP.q = q; return helpList().map(x => x.id); };
    const o = {racc:r('raccoglitore').slice(0, 3), arch:r('nuovo archivio').slice(0, 4), ditta:r('nuova ditta').slice(0, 3), azienda:r('azienda').includes('client-new'), stampare:r('stampare')[0], stampa:r('stampa')[0], e1:r('etichetta').join(), e2:r('etichette').join(),
      acc:r('calibrazióne')[0], acc2:r('CALIBRAZIONE')[0], cose:r('cos\'è il codice multi')[0], cqr:r('codice qr').slice(0, 3), excel:r('excel')[0], none:r('zzzqqq').length, en:null};
    S.lang = 'en'; o.en = r('labels printing')[0]; o.enBinder = r('new folder').slice(0, 3); S.lang = 'it'; HELP.q = ''; return o; });
  ok(Gv.racc.includes('create') && Gv.arch.includes('create') && Gv.ditta.includes('client-new') && Gv.azienda && Gv.stampare === 'print' && Gv.stampa === 'print' && Gv.e1 === Gv.e2 && Gv.e1.length > 0 && Gv.acc === 'calib' && Gv.acc2 === 'calib' && Gv.cose === 'multi' && Gv.cqr.includes('qr') && Gv.excel === 'excel' && Gv.none === 0 && Gv.en === 'print' && Gv.enBinder.includes('create'), 'help search: accents, plurals, synonyms (faldone/raccoglitore/archivio, cliente/ditta/azienda, stampa/stampare, QR/codice QR), English', Gv);
  await p.fill('#help-q', ''); await p.waitForTimeout(80);
  await p.fill('#help-q', 'zzzqqq'); await p.waitForTimeout(80);
  ok((await p.innerText('#help-topics')).includes('Nessun argomento') && (await p.$$('#help-filters .btn-tag.lit')).length === 0, 'help: no result → friendly message, no tag lit');
  await p.fill('#help-q', ''); await p.waitForTimeout(80);
  // topic page: star + guided action + new topics
  await p.click('#help-topics [data-a="help-topic"][data-id="client-new"]'); await p.waitForTimeout(100);
  Gv = await p.evaluate(() => ({h:$('.help-title').textContent, star:!!$('.help-title-row [data-a="help-fav"]'), cta:($('.guide-cta [data-a="guide-start"]') || {}).dataset, acts:$$('.help-body > .hi-tags .hact').map(x => x.dataset.act), newT:['edit', 'guide-help', 'client-new'].every(id => { const h = helpTopic(id); return h.body.it.length > 300 && h.body.en.length > 300 && h.guide !== undefined; }), meta:helpTopic('pdf').guide === 'pdf' && /^Come scarico/.test(helpTopic('pdf').title.it)}));
  ok(Gv.h === 'Come creo un nuovo cliente' && Gv.star && Gv.cta && Gv.cta.id === 'client' && Gv.acts.join() === 'how,create' && Gv.newT && Gv.meta, 'help: topic page with star, guided action, action tags; new topics (new client, edit binder, how to use help); topics of other files get titles/tags', Gv);
  await p.evaluate(() => helpClose());
  // a topic registered later by another module, without tags/acts/pop, is handled gracefully
  Gv = await p.evaluate(() => { HELP_TOPICS.push({id:'g-late', title:{it:'Come elimino un foglio di prova', en:'How do I delete a test sheet'}, body:{it:'<p>Prova tardiva</p>', en:'<p>Late test</p>'}});
    helpOpen(); const tp = helpTopic('g-late'); const o = {tags:tp.tags.join(), acts:tp.acts.join(), pop:tp.pop, row:!!$('#help-topics [data-id="g-late"]'), chip:$('#help-filters [data-t="other"]') ? 1 : 0};
    HELP_TOPICS.splice(HELP_TOPICS.indexOf(tp), 1); helpClose(); return o; });
  ok(Gv.tags === 'other' && Gv.acts === 'how,delete' && Gv.pop === 20 && Gv.row && Gv.chip, 'help: topics added later without tags get defaults (tag Altro, actions guessed from the title, popularity 20)', Gv);

  // ---- guided tours: every tour runs start → end in the current UI (target visible or graceful skip)
  Gv = await p.evaluate(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const setv = (sel, v) => { const el = $(sel); if (el){ el.value = v; el.dispatchEvent(new Event('input', {bubbles:true})); } };
    const out = {}, bad = [];
    for (const id of Object.keys(GUIDES)){
      while (topModal()) closeModal(true);
      S.view = 'archive'; UI.q = ''; renderAll(); guideStart(id); await wait(450);
      const log = [];
      for (let k = 0; k < 40 && G.g; k++){
        const st = guideStep();
        if (st.final){ log.push('end'); break; }
        let el = guideResolve(st.target) || guideResolve(st.target);
        if (!el){ await wait(1100); el = guideResolve(st.target); }
        const hint = ($('#g-hint') || {}).textContent || '';
        if (!el){ log.push('skip:' + G.i); if (!hint) bad.push(id + ':' + G.i); }
        if (st.extra) st.extra.fn();
        if (UI.ed && $('#ed-company_name') && !UI.ed.d.company_name) setv('#ed-company_name', 'Guida Test G Srl');
        if ($('#cl-name') && !$('#cl-name').value) setv('#cl-name', 'Cliente Test G');
        if ($('#db-session-name') && !$('#db-session-name').value) setv('#db-session-name', 'Sessione test G');
        if (id === 'find' && st.require && !UI.q){ setv('.card .toolbar input[data-bind="q"]', (filteredBinders()[0] || S.binders[0]).speaking_code); await wait(100); }
        if (id === 'edit' && UI.ed && !UI.ed.isNew && st.guard) setv('#ed-binder_title', 'Titolo test G ' + Date.now());
        if (id === 'partial' && st.require && !usedSet().size){ const s = $('#slotmap .slot'); if (s) s.click(); await wait(100); }
        const i = G.i;
        for (let r = 0; r < 4 && G.g && G.i === i; r++){ guideNext(); await wait(650); }
        if (G.i <= i){ bad.push(id + ' stuck at ' + i + ' ' + G.msg); break; }
        log.push(i);
      }
      out[id] = log.join(' ');
      if (!guideStep() || !guideStep().final) bad.push(id + ' not finished');
      guideStop(); while (topModal()) closeModal(true);
    }
    return {out, bad, n:Object.keys(GUIDES).length, ids:Object.keys(GUIDES).join()};
  });
  ok(!Gv.bad.length && Gv.n >= 14 && ['create','print','pdf','client','find','edit','calib','partial','manifest','ai','session','backup','import','register'].every(id => Gv.ids.split(',').includes(id)), 'guides: all ' + Gv.n + ' tours run start → end in IT (targets incl. ⚙ menu and print Advanced options)', Gv);
  ok(await p.evaluate(() => Object.values(GUIDES).every(g => g.title.it && g.title.en && g.steps.every(s => s.title.it && s.title.en && s.text.it && s.text.en)) && !JSON.stringify(Object.values(GUIDES).map(g => g.steps.map(s => s.text.it))).includes('Etichetta divisa')), 'guides: IT + EN on every step, no outdated label mode names');
  // missing target → graceful skip message, Next goes on
  Gv = await p.evaluate(async () => { S.view = 'archive'; renderAll(); GUIDES.gtest = {title:{it:'Prova', en:'Test'}, steps:[{target:'#non-esiste', title:{it:'A', en:'A'}, text:{it:'a', en:'a'}}, {final:true, title:{it:'B', en:'B'}, text:{it:'b', en:'b'}}]};
    guideStart('gtest'); await new Promise(r => setTimeout(r, 1300)); const h = $('#g-hint').textContent; guideNext(); const i = G.i; guideStop(); delete GUIDES.gtest; return {h, i}; });
  ok(Gv.h === await p.evaluate(() => t('g_missing')) && Gv.i === 1, 'guides: a missing target shows "premi Avanti per saltare" and Next skips it', Gv);
  // never exit by accident: Esc, ✕, clicks outside → question; Continua keeps the step
  await p.evaluate(() => { while (topModal()) closeModal(true); S.view = 'archive'; renderAll(); guideStart('create'); }); await p.waitForTimeout(700);
  await p.click('[data-a="guide-next"]'); await p.waitForTimeout(600);
  await p.evaluate(() => { const d = $$('.g-dot'); d[4].click(); }); await p.waitForTimeout(200);
  Gv = await p.evaluate(() => ({i:G.i, live:$('#g-live').textContent}));
  ok(Gv.i === 4 && Gv.live.includes('Passo 5 di') && Gv.live.includes('Titolo del faldone'), 'guides: the step is announced (aria-live)', Gv);
  await p.evaluate(() => { if (typeof taClose === 'function') taClose(); $('.g-card [data-a="guide-next"]').focus(); });   // (an open typeahead list takes the first Esc)
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  Gv = await p.evaluate(() => ({c:!!$('.g-confirm'), txt:$('.g-confirm') && $('.g-confirm').textContent, f:document.activeElement && document.activeElement.dataset.a, g:!!G.g, ed:!!UI.ed}));
  ok(Gv.c && /Vuoi davvero uscire dalla guida\?/.test(Gv.txt) && /stesso passo/.test(Gv.txt) && Gv.f === 'guide-stay' && Gv.g && Gv.ed, 'guides: Esc asks "Vuoi davvero uscire dalla guida?" with focus on Continua', Gv);
  await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  Gv = await p.evaluate(() => ({c:!!$('.g-confirm'), i:G.i, g:!!G.g, ed:!!UI.ed}));
  ok(!Gv.c && Gv.i === 4 && Gv.g && Gv.ed, 'guides: "Continua la guida" keeps the same step and the form', Gv);
  await p.click('.g-card [data-a="guide-close"]'); await p.waitForTimeout(120);
  const Gx = await p.evaluate(() => !!$('.g-confirm'));
  await p.mouse.click(5, 5); await p.waitForTimeout(100);
  const Gx2 = await p.evaluate(() => !!$('.g-confirm') && !!G.g);
  await p.keyboard.press('Escape'); await p.waitForTimeout(120);
  ok(Gx && Gx2 && await p.evaluate(() => !$('.g-confirm') && G.i === 4), 'guides: the ✕ asks too; a click around the question or Esc keeps the guide');
  await p.mouse.click(4, 400); await p.waitForTimeout(120);
  Gv = await p.evaluate(() => ({msg:G.msg === t('g_outside'), c:!!$('.g-confirm')}));
  await p.mouse.click(4, 400); await p.waitForTimeout(120);
  Gv.c2 = await p.evaluate(() => !!$('.g-confirm') && !!G.g && !!UI.ed);
  await p.click('[data-a="guide-stay"]'); await p.waitForTimeout(100);
  ok(Gv.msg && !Gv.c && Gv.c2 && await p.evaluate(() => G.i === 4 && !$('.g-confirm')), 'guides: a click outside reminds, a second one asks — never exits silently', Gv);
  // clicking a field of another step jumps to it; keyboard arrows
  await p.evaluate(() => $('#ed-tags').scrollIntoView({block:'center'})); await p.waitForTimeout(300);
  const Gtb = await p.evaluate(() => { const r = $('#ed-tags').getBoundingClientRect(); return {x:r.x + 30, y:r.y + r.height / 2}; });
  await p.mouse.click(Gtb.x, Gtb.y); await p.waitForTimeout(250);
  Gv = await p.evaluate(() => ({t:L(guideStep().title), f:document.activeElement.id, c:!!$('.g-confirm'), i:G.i}));
  ok(Gv.t === 'Tag' && Gv.f === 'ed-tags' && !Gv.c, 'guides: clicking the field of another step jumps to that step (no exit question)', Gv);
  const Gi0 = Gv.i;
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(80);
  const Gi1 = await p.evaluate(() => G.i);   // focus is in the field: arrows edit text, the guide does not move
  await p.evaluate(() => document.activeElement.blur()); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(120);
  const Gi2 = await p.evaluate(() => G.i);
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(120);
  const Gi3 = await p.evaluate(() => G.i);
  await p.evaluate(() => document.activeElement.blur()); await p.keyboard.press('Enter'); await p.waitForTimeout(120);
  const Gi4 = await p.evaluate(() => G.i);
  ok(Gi1 === Gi0 && Gi2 === Gi0 + 1 && Gi3 === Gi0 && Gi4 === Gi0 + 1, 'guides: → / Enter next, ← back (not while typing in a field)', [Gi0, Gi1, Gi2, Gi3, Gi4]);
  // leave halfway → "Riprendi la guida" from the same step (toast + help panel)
  await p.keyboard.press('Escape'); await p.waitForTimeout(100); await p.click('[data-a="guide-quit"]'); await p.waitForTimeout(150);
  Gv = await p.evaluate(() => ({g:!!G.g, ed:!!UI.ed, r:guideResumeInfo(), toast:[...document.querySelectorAll('.toast')].some(x => x.textContent.includes('Riprendi'))}));
  ok(!Gv.g && Gv.ed && Gv.r && Gv.r.id === 'create' && Gv.r.i === Gi4 && Gv.toast, 'guides: "Esci" stops the guide, keeps the form and remembers the step', Gv);
  await p.evaluate(() => helpOpen()); await p.waitForTimeout(120);
  Gv = await p.evaluate(() => ({txt:($('.help-resume') || {}).textContent || ''}));
  await p.click('[data-a="guide-resume"]'); await p.waitForTimeout(500);
  Gv.after = await p.evaluate(() => ({id:G.id, i:G.i, help:HELP.open}));
  ok(Gv.txt.includes('Riprendi la guida') && Gv.txt.includes('passo ' + (Gi4 + 1)) && Gv.after.id === 'create' && Gv.after.i === Gi4 && !Gv.after.help, 'guides: "Riprendi la guida" in the help panel restarts from the same step', Gv);
  await p.evaluate(() => { const d = $$('.g-dot'); d[d.length - 1].click(); }); await p.waitForTimeout(150);
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => !G.g && !$('.g-confirm') && !guideResumeInfo()), 'guides: on the final step Esc / Termina just close, nothing left to resume');
  await p.evaluate(() => { while (topModal()) closeModal(true); });
  // English
  await p.evaluate(() => { S.lang = 'en'; S.view = 'archive'; renderAll(); helpOpen(); }); await p.waitForTimeout(120);
  Gv = await p.evaluate(() => ({sort:$('[data-a="help-sort"][data-v="pop"]').textContent, act:$('#help-filters [data-a="help-act"][data-t="how"]').textContent, first:$('#help-topics .hi-t').textContent, g:$('#help-guides .help-g .hi-t').textContent, ph:$('#help-q').placeholder}));
  await p.evaluate(() => { helpClose(); guideStart('client'); }); await p.waitForTimeout(300);
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  Gv.card = await p.evaluate(() => ({h:$('.g-card h4').textContent, q:$('.g-confirm h4').textContent, b:$('[data-a="guide-stay"]').textContent}));
  await p.click('[data-a="guide-quit"]'); await p.waitForTimeout(100);
  ok(Gv.sort === 'Popular' && Gv.act === 'How to' && Gv.first === 'How do I create a new binder and its label?' && /Create a new binder/.test(Gv.g) && /client/.test(Gv.ph) && Gv.card.h === 'Open Information' && /really want to leave/.test(Gv.card.q) && /Continue the guide/.test(Gv.card.b), 'help + guides in English', Gv);
  // clean up: help memory, operator, language, binders/clients/sessions created by the tours
  await p.evaluate(async (snap) => {
    guideStop(); while (topModal()) closeModal(true); helpClose();
    HELP_MEM = JSON.parse(snap.s); helpSave(); HELP.sort = ''; HELP.q = ''; HELP.tag = ''; HELP.act = '';
    S.settings.operator = snap.op; S.lang = snap.lang; S.binders = JSON.parse(snap.binders); S.clients = JSON.parse(snap.clients);
    for (const s of dbSessions()) if (!snap.sess.includes(s.id)) await dbDeleteSession(s.id);
    UI.q = ''; S.print = JSON.parse(snap.print); S.usedSlots = JSON.parse(snap.used); S.infoTab = snap.infoTab; UI.importParsed = null; commit(); S.hasUnexportedChanges = snap.dirty; S.view = 'archive'; renderAll(); dbSyncFromState('t'); await dbPersist();
  }, Gsnap);
  ok(await p.evaluate((n) => S.binders.length === n && !S.binders.some(b => /Test G/.test(b.company_name)) && !(S.clients || []).some(c => c.name === 'Cliente Test G'), JSON.parse(Gsnap.binders).length), 'stream G cleanup: binders, clients and help memory restored');

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
  const Wbuild = () => require('child_process').execFileSync('python3', [require('path').resolve(__dirname, '..', 'tools', 'build_deploy.py'), WDIR, '--studio-name', 'Studio Web Prova', '--no-server']   /* v10.1: static deploy (the server deploy is tested in @@STREAM-W@@) */);
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

  let vX;
  // v10 one-step client import: register + one binder per client, colour column honoured
  sec('v10: client list import also creates binders');
  vX = await p.evaluate(() => {
    const snapB = JSON.stringify(S.binders), snapC = JSON.stringify(S.clients);
    const csv = 'TIPO;Codice Multi;Ragione_soc;Indirizzo;Codice_comune;Cap;Localita;Provincia;ETS_ENC;Colore;Tag\nENC;9901;PRO LOCO TESTVILLE APS;VIA A 1;A001;43100;TESTVILLE;PR;APS;#9C051E;aps,proloco\nENC;9902;ODV TEST SOCCORSO;VIA B 2;A002;43100;TESTVILLE;PR;ODV;;odv\nENC;;ASD SENZA MULTI TEST;VIA C 3;A003;43100;TESTVILLE;PR;ASD;#2563EB;asd';
    UI.imap = null; analyzeImport(csv); const dbgIm = !!UI.imap, dbgFields = UI.imap ? JSON.stringify(UI.imap.fields) : '';
    if (UI.imap) imapConfirm ? imapConfirm() : document.querySelector('[data-a="imap-confirm"]').click();
    const dbgT = UI.importParsed && UI.importParsed.clients ? UI.importParsed.clients.map(x => x.c.tags).join('|') : 'noclients';
    S.view = 'import'; renderAll(); const prev = document.getElementById('im-preview'); if (prev && UI.importParsed && UI.importParsed.clients) prev.innerHTML = importPreviewHTML();
    const mk = document.getElementById('cl-mkb'); const had = !!(mk && mk.checked);
    const n0 = S.binders.length; applyClientsImport();
    const nb = S.binders.filter(b => ['9901','9902'].includes(b.multi_code) || b.company_name === 'ASD SENZA MULTI TEST');
    const r = {had, made:S.binders.length - n0, codes:nb.map(b => b.speaking_code).every(Boolean), pl:(nb.find(b => b.multi_code === '9901') || {}), odv:(nb.find(b => b.multi_code === '9902') || {}), view:S.view};
    analyzeImport(csv); if (UI.imap && document.querySelector('[data-a="imap-confirm"]')) document.querySelector('[data-a="imap-confirm"]').click();
    const again = UI.importParsed && UI.importParsed.clients ? UI.importParsed.clients.filter(x => x.status !== 'err' && !clientHasBinder(x.c)).length : -1;
    S.binders = JSON.parse(snapB); S.clients = JSON.parse(snapC); UI.importParsed = null; UI.imap = null; S.view = 'archive'; commit(); renderAll();
    return Object.assign(r, {again, plCol:r.pl.color_hex, plLock:r.pl.color_locked, odvLock:r.odv.color_locked, items:JSON.stringify(r.pl.contents_items || []), plTags:r.pl.tags, mode:S.settings.colorMode, dbgIm, dbgFields, dbgT});
  });
  ok(vX.had && vX.made === 3 && vX.codes && vX.view === 'archive', 'one import of the client list creates one binder per client (checkbox on by default)', vX);
  ok(vX.plCol === '#9C051E' && vX.plLock === true && vX.odvLock === false && /Archivio 1/.test(vX.items) && vX.plTags === 'aps,proloco', 'colour and tag columns honoured and locked; no colour → automatic; contents "Archivio 1"', {plCol:vX.plCol, plLock:vX.plLock, odvLock:vX.odvLock, items:vX.items, plTags:vX.plTags, odvCol:vX.odv.color_hex, mode:vX.mode, dbgIm:vX.dbgIm, dbgFields:vX.dbgFields, dbgT:vX.dbgT});
  ok(vX.again === 0, 're-importing the same list creates no duplicate binders', vX);

  // @@STREAM-W@@
  sec('v10.1 W: shared online database (server-php/api.php under php -S)');
  {
    const Wcp = require('child_process'), Wpath = require('path');
    let Wphp = ''; try { Wphp = Wcp.execFileSync('php', ['-r', 'echo extension_loaded("pdo_sqlite") && extension_loaded("openssl") ? "ok" : "no";']).toString(); } catch(e){}
    if (Wphp !== 'ok') console.log('  (stream W skipped: php CLI with pdo_sqlite + openssl not installed)');
    else {
      const WR = Wpath.resolve(__dirname, 'shots', 'srv'), WDp = Wpath.join(WR, 'studio-de'), WSP = Wpath.join(WDp, 'server-php');
      Wcp.execFileSync('python3', [Wpath.resolve(__dirname, '..', 'tools', 'build_deploy.py'), WDp, '--studio-name', 'Studio Srv Prova']);
      // a previous run left config.php / setup.php.disabled: park them (never deleted), the build rewrote setup.php
      ['config.php', 'setup.php.disabled'].forEach(f => { const x = Wpath.join(WSP, f); if (fs.existsSync(x)) fs.renameSync(x, x + '.prev-run'); });
      const WDATA = Wpath.resolve(__dirname, 'shots', 'srv-data', String(Date.now()));
      const WPORT = 18300 + (process.pid % 500), WO = 'http://127.0.0.1:' + WPORT, WAPI = WO + '/studio-de/server-php/api.php';
      const Wsrv = Wcp.spawn('php', ['-S', '127.0.0.1:' + WPORT, '-t', WR, Wpath.resolve(__dirname, 'php-router.php')], {stdio:'ignore'});
      const Wsleep = (ms) => new Promise(r => setTimeout(r, ms));
      const Wq = async (route, o) => {
        o = o || {}; const h = Object.assign({}, o.headers || {});
        if (o.token) h['X-DocMap-Token'] = o.token;
        if (o.body !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
        const u = WAPI + '?r=' + route + (o.q ? '&' + new URLSearchParams(o.q).toString() : '');
        const r = await fetch(u, {method:o.method || (o.body !== undefined ? 'POST' : 'GET'), headers:h, body:o.body === undefined ? undefined : (typeof o.body === 'string' ? o.body : JSON.stringify(o.body))});
        let j = null; try { j = await r.json(); } catch(e){}
        return {s:r.status, j, h:r.headers};
      };
      const Wget = async (path) => (await fetch(WO + path)).status;
      let Wv, Wv2, Wup = false;
      for (let i = 0; i < 50 && !Wup; i++){ try { Wup = (await Wq('ping')).s === 200; } catch(e){ await Wsleep(100); } }
      try {
        Wv = await Wq('ping');
        ok(Wup && Wv.j.ok === true && Wv.j.api === 'docmap-php' && /Z$/.test(Wv.j.server_time), 'W: php -S up, ping answers {ok, api, server_time}', Wv.j);
        Wv = await Wq('me', {token:'x'});
        ok(Wv.s === 500 && Wv.j.error.code === 'config' && /setup\.php/.test(Wv.j.error.message) && !/\/home|\/tmp/.test(Wv.j.error.message), 'W: without config.php the API refuses to start with a clear JSON error (no paths)', Wv.j);
        ok(fs.existsSync(Wpath.join(WSP, 'api.php')) && fs.existsSync(Wpath.join(WSP, 'config.sample.php')) && /Require all denied/.test(fs.readFileSync(Wpath.join(WSP, 'data', '.htaccess'), 'utf8')) &&
          /config\.\*\\\.php/.test(fs.readFileSync(Wpath.join(WSP, '.htaccess'), 'utf8')) && /"apiBase": "server-php\/api\.php"/.test(fs.readFileSync(Wpath.join(WDp, 'docmap.config.js'), 'utf8')) &&
          /SiteGround/.test(fs.readFileSync(Wpath.join(WDp, 'README-DEPLOY.md'), 'utf8')) && !fs.existsSync(Wpath.join(WDp, 'server-php', 'config.php')), 'W: deploy ships server-php (api, setup, sample, .htaccess, data/.htaccess), apiBase set, SiteGround README');
        // setup.php: one shot
        fs.mkdirSync(WDATA, {recursive:true});
        let r = await fetch(WO + '/studio-de/server-php/setup.php', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
          body:new URLSearchParams({data_dir:WDATA, users:'dave,admin\nmario,editor\nlucia,viewer', allow_file:'1', studio_name:'Studio Srv Prova'}).toString()});
        const Whtml = await r.text(), WT = {};
        for (const m of Whtml.matchAll(/data-user="([^"]+)" data-role="([^"]+)"><td>[^<]*<\/td><td>[^<]*<\/td><td class="tok">([^<]+)</g)) WT[m[1]] = m[3];
        const Wcfg = fs.existsSync(Wpath.join(WSP, 'config.php')) ? fs.readFileSync(Wpath.join(WSP, 'config.php'), 'utf8') : '';
        ok(r.status === 200 && WT.dave && WT.mario && WT.lucia && /'aes_key' => '[A-Za-z0-9+\/=]{44}'/.test(Wcfg) && !Wcfg.includes(WT.dave) && Wcfg.includes(require('crypto').createHash('sha256').update(WT.dave).digest('hex')) && /'null'/.test(Wcfg),
          'W: setup.php writes config.php (random AES key, token SHA-256 only, file origin allowed) and shows each token once', {status:r.status, users:Object.keys(WT)});
        ok(await Wget('/studio-de/server-php/setup.php') >= 403 && fs.existsSync(Wpath.join(WSP, 'setup.php.disabled')), 'W: setup.php refuses to run again (renamed to setup.php.disabled)');
        // short lock for the rate-limit test
        fs.writeFileSync(Wpath.join(WSP, 'config.php'), Wcfg.replace("'max_fails' => 5", "'max_fails' => 3").replace("'lock_seconds' => 60", "'lock_seconds' => 2"));
        Wv = [await Wget('/studio-de/server-php/config.php'), await Wget('/studio-de/server-php/config.sample.php'), await Wget('/studio-de/server-php/data/index.html'), await Wget('/studio-de/server-php/data/'), await Wget('/studio-de/server-php/.htaccess'), await Wget('/studio-de/server-php/setup.php.disabled')];
        ok(Wv.every(s => s === 403 || s === 404), 'W: config.php, data/, .htaccess and setup.php.disabled are not served (403/404)', Wv);

        // ---- v10 data preserved on upgrade + first sync seeds an EMPTY server (desktop file://) ----
        const Mctx = await b.newContext({viewport:{width:1366, height:768}});
        const Mp = await Mctx.newPage(); Mp.on('pageerror', e => errs.push('W PAGEERR ' + e.message)); Mp.on('dialog', d => d.accept());
        Mp.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('W CONSOLE ' + m.text()); });
        const Wv10 = {schema:26.9, lang:'it', view:'archive', onboarded:true, hasUnexportedChanges:false,
          settings:{studioName:'Studio Vecchio v10', operator:'Dave', colorMode:'category', colorUpdatedAt:'2026-10-20T08:00:00.000Z', catColors:{IVA:'#DC2626'}, deviceId:'dev-v10-pc', deviceLabel:'PC studio'},
          binders:[1, 2, 3, 4, 5, 6, 7].map(i => ({id:'w-v10-b' + i, speaking_code:'WV' + i, company_name:'Zanzibar Segreto ' + i + ' Srl', category:i % 2 ? 'IVA' : 'BILANCI', color_hex:i === 3 ? '#9C051E' : '#2563EB', color_locked:i === 3, short_code:'dm26WvXa' + 'abcd'.charAt(i % 4) + 'Bx' + (i + 1),
            room_code:'A', cabinet_code:'1', shelf_code:'β', contents_items:[{year:'2025', description:'Fatture', status:'archive'}], tags:'v10,prova', created_at:'2026-10-01T08:00:00.000Z', updated_at:'2026-10-0' + i + 'T09:00:00.000Z'})),
          clients:[{id:'w-v10-c1', name:'Zanzibar Segreto 1 Srl', multi_code:'W901', updated_at:'2026-10-02T09:00:00.000Z'}, {id:'w-v10-c2', name:'Cliente Due W', multi_code:'W902', updated_at:'2026-10-03T09:00:00.000Z'}],
          tombstones:[{type:'binder', id:'w-v10-gone', code:'WVX', deletedAt:'2026-10-05T10:00:00.000Z', who:'Dave'}],
          sync:{peers:{}, lastExportAt:null, lastImportAt:null, lastPeer:'', history:[]}};
        await Mp.goto(URL_); await Mp.evaluate((st) => { localStorage.clear(); localStorage.setItem('docmap_v26_state', JSON.stringify(st)); localStorage.setItem('docmap_v26_device', 'dev-v10-pc'); }, Wv10);
        await Mp.reload(); await Mp.waitForTimeout(1500);
        Wv = await Mp.evaluate(() => { while (topModal()) closeModal(true); const b3 = S.binders.find(x => x.id === 'w-v10-b3');
          return {n:S.binders.length, ids:S.binders.map(x => x.id).sort().join(','), cl:(S.clients || []).length, tb:(S.tombstones || []).map(x => x.id).join(','), col:b3 && b3.color_hex, lock:b3 && b3.color_locked, mode:S.settings.colorMode,
            studio:S.settings.studioName, ups:S.binders.map(x => x.updated_at).sort()[0], key:!!localStorage.getItem('docmap_v26_state'), dev:syncDeviceId()}; });
        ok(Wv.n === 7 && Wv.cl === 2 && Wv.tb === 'w-v10-gone' && Wv.col === '#9C051E' && Wv.lock === true && Wv.mode === 'category' && Wv.studio === 'Studio Vecchio v10' && Wv.ups === '2026-10-01T09:00:00.000Z' && Wv.key && Wv.dev === 'dev-v10-pc',
          'W: a v10 state (binders, clients, colour fields, tombstones) opens in v10.1 unchanged (same localStorage key, timestamps kept)', Wv);
        await Mp.evaluate(([url, tok]) => { localStorage.setItem('docmap_v26_srv', JSON.stringify({url, token:tok, basic:''})); S.view = 'sync'; renderAll(); }, [WAPI, WT.dave]);
        await Mp.evaluate(() => document.getElementById('srv-card').scrollIntoView()); await Mp.screenshot({path:Wpath.join(__dirname, 'shots', 'w_desktop_card.png')});
        ok(await Mp.isVisible('#srv-card #srv-sync') && (await Mp.inputValue('#srv-url')) === WAPI, 'W: desktop ⚙ Sincronizzazione shows the "Server online" card (URL, token, Sincronizza con il server)');
        await Mp.click('#srv-sync'); await Mp.waitForTimeout(1500);
        Wv = await Mp.evaluate(() => ({seed:!!document.getElementById('srv-seed'), txt:(document.getElementById('srv-seed') || {}).innerText || ''}));
        ok(Wv.seed && /7 faldoni/.test(Wv.txt) && /2 clienti/.test(Wv.txt) && /1 eliminazion/.test(Wv.txt), 'W: first sync against an EMPTY server asks "Carica il mio archivio sul server (prima volta)" with the counts', Wv);
        await Mp.click('.modal-f .btn-primary'); await Mp.waitForTimeout(2500);
        Wv = await Wq('pull', {token:WT.lucia, q:{since:0}});
        const WvB = Wv.j.records.filter(x => x.type === 'binder'), WvC = Wv.j.records.filter(x => x.type === 'client');
        ok(Wv.s === 200 && WvB.length === 7 && WvC.length === 2 && Wv.j.tombstones.length === 1 && Wv.j.tombstones[0].id === 'w-v10-gone' && WvB.find(x => x.id === 'w-v10-b3').data.color_hex === '#9C051E' && WvB.find(x => x.id === 'w-v10-b3').data.color_locked === true &&
          WvB.find(x => x.id === 'w-v10-b5').updated_at === '2026-10-05T09:00:00.000Z' && Wv.j.settings && Wv.j.settings.data.studioName === 'Studio Vecchio v10' && Wv.j.settings.data.colorMode === 'category',
          'W: the seed uploaded every binder, client, tombstone, the shared settings and the log (timestamps unchanged); pull returns all records', {b:WvB.length, c:WvC.length, t:Wv.j.tombstones.length});
        Wv = await Mp.evaluate(() => { const p = S.sync.peers[Object.keys(S.sync.peers).find(k => k.startsWith('server:'))] || {}; return {mode:p.mode, seq:p.seq, push:!!p.lastPushAt, pend:srvPending(), last:(document.getElementById('srv-last') || {}).textContent, ls:JSON.stringify(S).includes(document.getElementById('srv-token') ? document.getElementById('srv-token').value : 'zz')}; });
        ok(Wv.mode === 'server' && typeof Wv.seq === 'number' && Wv.push && Wv.pend === 0 && Wv.last && Wv.last !== 'mai' && !Wv.ls, 'W: the server is a sync peer S.sync.peers["server:<url>"] (seq, lastPushAt), nothing pending, token never inside S', Wv);

        // ---- API: push / pull, LWW, tombstones ----
        const Wb = (id, code, at, extra) => ({type:'binder', id, updated_at:at, data:Object.assign({id, speaking_code:code, company_name:'Zanzibar Segreto Api', short_code:'dm26Wapi' + code.slice(-4), room_code:'B', cabinet_code:'2', updated_at:at}, extra || {})});
        Wv = await Wq('push', {token:WT.mario, body:{records:[Wb('w-api-1', 'WAP1', '2026-11-01T10:00:00.000Z'), Wb('w-api-2', 'WAP2', '2026-11-01T10:00:00.000Z', {shelf_code:'γ'})], tombstones:[], deviceId:'dev-api', operator:'Api'}});
        ok(Wv.s === 200 && Wv.j.applied === 2 && Wv.j.rejected.length === 0 && Wv.j.seq > 0, 'W: push applies new records, returns {applied, rejected, seq}', Wv.j);
        const Wseq = Wv.j.seq;
        Wv = await Wq('pull', {token:WT.lucia, q:{since:Wseq - 2}});
        ok(Wv.s === 200 && Wv.j.records.length === 2 && Wv.j.records.every(x => x.data.company_name === 'Zanzibar Segreto Api') && Wv.j.seq === Wseq && Wv.j.more === false, 'W: incremental pull since=<seq> returns only the newer changes', {n:Wv.j.records.length, seq:Wv.j.seq});
        Wv = await Wq('push', {token:WT.mario, body:{records:[Wb('w-api-1', 'WAP1', '2026-11-01T09:00:00.000Z', {notes:'vecchia'}), Wb('w-api-2', 'WAP2', '2026-11-01T11:00:00.000Z', {notes:'nuova'}), Wb('w-api-1', 'WAP1', '2026-11-01T10:00:00.000Z')]}});
        ok(Wv.j.applied === 1 && Wv.j.rejected.length === 1 && Wv.j.rejected[0].reason === 'older' && Wv.j.rejected[0].server_updated_at === '2026-11-01T10:00:00.000Z' && Wv.j.rejected[0].current.data.speaking_code === 'WAP1' && Wv.j.same === 1,
          'W: last-write-wins: older rejected (with the server copy), newer applied, identical same-time copy ignored', Wv.j);
        Wv = await Wq('push', {token:WT.mario, body:{records:[Wb('w-api-1', 'WAP1', '2026-11-01T10:00:00.000Z', {notes:'diversa'})]}});
        ok(Wv.j.applied === 0 && Wv.j.rejected[0].reason === 'tie', 'W: same time, different content → server keeps its copy and reports "tie"', Wv.j);
        Wv = await Wq('push', {token:WT.mario, body:{tombstones:[{type:'binder', id:'w-api-2', code:'WAP2', deletedAt:'2026-11-01T10:30:00.000Z'}, {type:'binder', id:'w-api-1', code:'WAP1', deletedAt:'2026-11-01T12:00:00.000Z'}]}});
        Wv2 = await Wq('pull', {token:WT.lucia, q:{since:Wseq}});
        ok(Wv.j.applied === 1 && Wv.j.rejected.length === 1 && Wv.j.rejected[0].id === 'w-api-2' && Wv2.j.tombstones.some(x => x.id === 'w-api-1' && x.deletedAt === '2026-11-01T12:00:00.000Z') && Wv2.j.records.every(x => x.id !== 'w-api-1'),
          'W: tombstones: a deletion newer than the record applies (pulled as tombstone), an older one is rejected', {push:Wv.j, t:Wv2.j.tombstones});
        Wv = await Wq('push', {token:WT.mario, body:{records:[Wb('w-api-1', 'WAP1', '2026-11-01T13:00:00.000Z')]}});
        Wv2 = await Wq('binder', {token:WT.lucia, q:{code:'wap1'}});
        ok(Wv.j.applied === 1 && Wv2.s === 200 && Wv2.j.binder.id === 'w-api-1', 'W: a record newer than its tombstone comes back; GET binder by speaking code (case-insensitive)', Wv2.j);
        Wv = await Wq('push', {token:WT.lucia, body:{records:[Wb('w-api-9', 'WAP9', '2026-11-01T13:00:00.000Z')]}});
        ok(Wv.s === 403 && Wv.j.error.code === 'forbidden', 'W: a viewer token cannot push (403)', Wv.j);
        // ---- binder + patch (scan.html contract) ----
        Wv = await Wq('binder', {token:WT.lucia, q:{qr:'dm26WapiWAP1'}});
        ok(Wv.s === 200 && Wv.j.etag === '2026-11-01T13:00:00.000Z' && /2026-11-01T13:00:00.000Z/.test(Wv.h.get('etag') || '') && Array.isArray(Wv.j.siblings), 'W: GET ?r=binder&qr= returns {binder, etag, siblings} + ETag', Wv.j);
        const WvSib = await Wq('binder', {token:WT.lucia, q:{qr:'dm26WvXaaBx5'}});
        ok(WvSib.s === 200 && WvSib.j.siblings.length === 6 && WvSib.j.siblings.every(x => x.speaking_code && x.shelf_code === 'β'), 'W: siblings = other binders of the same cabinet (HMAC index, no plaintext look-up)', WvSib.j.siblings && WvSib.j.siblings.length);
        Wv = await Wq('patch', {token:WT.mario, body:{id:'w-api-1', patch:{archive_state:'CHECKED_OUT'}, base_updated_at:'2026-11-01T13:00:00.000Z', log:{id:'w-log-1', who:'Mario', action:'binder.edit', source:'mobile', summary:'test'}}});
        const Wet = Wv.j.etag;
        Wv2 = await Wq('patch', {token:WT.mario, body:{id:'w-api-1', patch:{notes:'conflitto'}, base_updated_at:'2026-11-01T13:00:00.000Z'}});
        const Wv3 = await Wq('patch', {token:WT.mario, body:{id:'w-api-1', patch:{company_name:'X'}, base_updated_at:Wet}});
        ok(Wv.s === 200 && Wv.j.binder.archive_state === 'CHECKED_OUT' && Wet > '2026-11-01T13:00:00.000Z' && Wv2.s === 409 && Wv2.j.error.code === 'conflict' && Wv2.j.current.archive_state === 'CHECKED_OUT' && Wv2.j.current_etag === Wet && Wv3.s === 422,
          'W: patch: right base → applied with a new server updated_at; stale base → 409 with the current copy; non-mobile field → 422', {a:Wv.s, b:Wv2.s, c:Wv3.s});
        Wv = await Wq('pull', {token:WT.lucia, q:{since:0, log_since:0}});
        ok(Wv.j.activity_log.some(e => e.id === 'w-log-1' && e.details.new_updated_at === Wet && e.details.token_user === 'mario'), 'W: the patch log entry is stored server-side (activity_log, new_updated_at, token user)');
        // ---- auth ----
        Wv = [await Wq('me'), await Wq('me', {token:'sbagliato'}), await Wq('me', {headers:{Authorization:'Bearer ' + WT.mario}}), await Wq('me', {token:WT.mario})];
        ok(Wv[0].s === 401 && Wv[0].j.error.code === 'token_missing' && Wv[1].s === 401 && Wv[1].j.error.code === 'token_invalid' && Wv[2].s === 200 && Wv[3].j.role === 'editor' && Wv[3].j.user === 'mario',
          'W: token missing / wrong → 401; X-DocMap-Token and Authorization: Bearer both accepted; role from the token', Wv.map(x => x.s));
        Wv = await Wq('me', {headers:{Origin:'https://evil.example'}, token:WT.mario});
        Wv2 = await fetch(WAPI + '?r=me', {method:'POST', headers:{'Content-Type':'text/plain', Origin:'null'}, body:JSON.stringify({_token:WT.mario})});
        ok(Wv.s === 403 && Wv.j.error.code === 'origin' && Wv2.status === 200 && Wv2.headers.get('access-control-allow-origin') === 'null', 'W: CORS: foreign origin refused; file:// (Origin null) allowed when configured, token in a text/plain body', [Wv.s, Wv2.status]);
        // ---- encryption at rest ----
        Wv = fs.readdirSync(WDATA).filter(f => /^docmap\.sqlite/.test(f)).map(f => fs.readFileSync(Wpath.join(WDATA, f)));
        ok(Wv.length >= 1 && Wv.every(buf => !buf.includes('Zanzibar') && !buf.includes('Segreto') && !buf.includes('Studio Vecchio') && !buf.includes('dm26WvXa') && !buf.includes('Fatture')), 'W: the SQLite file (and WAL) holds no plaintext names, codes or contents (AES-256-GCM at rest)', Wv.map(x => x.length));

        // ---- web app with apiBase: phones / browsers edit online ----
        const W1 = await b.newContext({viewport:{width:1366, height:768}}), W1p = await W1.newPage();
        W1p.on('pageerror', e => errs.push('W1 PAGEERR ' + e.message)); W1p.on('dialog', d => d.accept());
        await W1p.goto(WO + '/studio-de/index.html'); await W1p.waitForTimeout(800);
        ok(await W1p.isVisible('#vault-lock #vl-token') && await W1p.evaluate(() => !(S && S.binders)), 'W: web app (apiBase): first run asks device user + PIN + server access code, nothing loaded');
        await W1p.fill('#vl-user', 'mario.tel'); await W1p.fill('#vl-pin', '5732'); await W1p.fill('#vl-pin2', '5732'); await W1p.fill('#vl-token', 'sbagliato'); await W1p.click('#vl-go'); await W1p.waitForTimeout(1200);
        ok(await W1p.evaluate(() => !!document.getElementById('vault-lock') && /non valido|not valid/.test(document.getElementById('vl-err').textContent) && !localStorage.getItem('docmap_v26_auth')), 'W: a wrong access code is refused before any local user is created');
        await new Promise(r => setTimeout(r, 2200));   // the wrong token above counted one failure: let any lock expire
        await W1p.fill('#vl-pin', '5732'); await W1p.fill('#vl-pin2', '5732'); await W1p.fill('#vl-token', WT.mario); await W1p.click('#vl-go'); await W1p.waitForTimeout(3500);
        Wv = await W1p.evaluate(() => { while (topModal()) closeModal(true); return {lock:!!document.getElementById('vault-lock'), n:S.binders.length, codes:S.binders.map(b => b.speaking_code).sort().join(','), role:dmProviders().auth.currentUser().role, st:(document.getElementById('srv-status') || {}).textContent,
          leak:Object.keys(localStorage).some(k => /Zanzibar|WAP1/.test(localStorage.getItem(k) || '')), studio:S.settings.studioName, srvVault:!!localStorage.getItem('docmap_v26_vault_srv')}; });
        ok(!Wv.lock && Wv.n === 9 && /WAP1/.test(Wv.codes) && /WV7/.test(Wv.codes) && !/BL1/.test(Wv.codes) && Wv.role === 'editor' && Wv.studio === 'Studio Vecchio v10' && !Wv.leak && Wv.srvVault,
          'W: after login the web app loads the data from the server (no demo binders), role from the token, cache + token encrypted in the vault', Wv);
        ok(/Online · sincronizzato/.test(Wv.st || ''), 'W: top bar shows "Online · sincronizzato"', Wv.st);
        await W1p.screenshot({path:Wpath.join(__dirname, 'shots', 'w_web_online.png')});
        await W1p.evaluate(() => { const b = S.binders.find(x => x.speaking_code === 'WV2'); b.notes = 'Nota online W1'; commit(); });
        await W1p.waitForTimeout(400);
        const Wst1 = await W1p.evaluate(() => (document.getElementById('srv-status') || {}).textContent);
        await W1p.waitForFunction(() => srvPending() === 0 && !SRV.busy && SRV.state === 'ok', null, {timeout:10000}).catch(() => {});
        Wv = await Wq('binder', {token:WT.lucia, q:{code:'WV2'}});
        ok(/In attesa \(1\)|Sincronizzo/.test(Wst1 || '') && Wv.j.binder.notes === 'Nota online W1', 'W: an edit is pushed automatically after the commit (status "In attesa (1)" meanwhile)', {st:Wst1, notes:Wv.j.binder.notes});
        // second browser (another employee) sees it after its pull
        const W2 = await b.newContext({viewport:{width:1366, height:768}}), W2p = await W2.newPage();
        W2p.on('pageerror', e => errs.push('W2 PAGEERR ' + e.message)); W2p.on('dialog', d => d.accept());
        await W2p.goto(WO + '/studio-de/index.html'); await W2p.waitForTimeout(800);
        await W2p.fill('#vl-user', 'dave.pc2'); await W2p.fill('#vl-pin', '9182'); await W2p.fill('#vl-pin2', '9182'); await W2p.fill('#vl-token', WT.dave); await W2p.click('#vl-go'); await W2p.waitForTimeout(3500);
        Wv = await W2p.evaluate(() => { while (topModal()) closeModal(true); const b = S.binders.find(x => x.speaking_code === 'WV2'); return {notes:b && b.notes, role:dmProviders().auth.currentUser().role}; });
        ok(Wv.notes === 'Nota online W1' && Wv.role === 'admin', 'W: a second browser context sees the change after its pull', Wv);
        await W2p.evaluate(async () => { const b = S.binders.find(x => x.speaking_code === 'WV4'); b.archive_state = 'HISTORICAL'; commit(); await srvSync(); });
        Wv = await W1p.evaluate(async () => { await srvSync(); return S.binders.find(x => x.speaking_code === 'WV4').archive_state; });
        ok(Wv === 'HISTORICAL', 'W: and the other way round (periodic / focus pull = srvSync)', Wv);
        // offline queue + retry
        await W1.setOffline(true);
        Wv = await W1p.evaluate(async () => { const b = S.binders.find(x => x.speaking_code === 'WV6'); b.notes = 'scritta offline'; commit(); const r = await srvSync(); return {r, st:document.getElementById('srv-status').textContent, pend:srvPending(), retry:SRV.retry}; });
        ok(Wv.r.error === 'offline' && /Offline · in attesa \(1\)/.test(Wv.st) && Wv.pend === 1 && Wv.retry >= 1, 'W: offline: the change waits in the encrypted local state, status "Offline · in attesa (1)", retry scheduled', Wv);
        await W1.setOffline(false);
        Wv = await W1p.evaluate(async () => { while (SRV.busy) await new Promise(r => setTimeout(r, 50)); await srvSync(); return {pend:srvPending(), st:document.getElementById('srv-status').textContent}; });
        Wv2 = await Wq('binder', {token:WT.lucia, q:{code:'WV6'}});
        ok(Wv.pend === 0 && /Online/.test(Wv.st) && Wv2.j.binder.notes === 'scritta offline', 'W: back online the queued change is sent', Wv);
        // scan.html in the same session reads / saves through the server
        await W1p.goto(WO + '/studio-de/scan.html?q=dm26WvXaaBx5'); await W1p.waitForTimeout(1500);
        Wv = await W1p.evaluate(() => ({view:SC.view, code:(document.getElementById('sc-code') || {}).textContent, foot:document.querySelector('.sc-foot') ? document.querySelector('.sc-foot').textContent : ''}));
        ok(Wv.view === 'card' && Wv.code === 'WV4' && /database online|online database/.test(Wv.foot), 'W: scan.html (apiBase) reads the binder from the server (GET binder)', Wv);
        await W1p.click('#sc-edit'); await W1p.click('[data-s="state"][data-v="CHECKED_OUT"]'); await W1p.click('#sc-save'); await W1p.waitForTimeout(900);
        Wv = await Wq('binder', {token:WT.lucia, q:{code:'WV4'}});
        Wv2 = await Wq('pull', {token:WT.lucia, q:{since:0, log_since:0}});
        ok(Wv.j.binder.archive_state === 'CHECKED_OUT' && await W1p.evaluate(() => SC.view === 'card') && Wv2.j.activity_log.some(e => e.source === 'mobile' && e.target && e.target.code === 'WV4' && /stato/.test(e.summary)), 'W: scan.html saves via ?r=patch, with a mobile log entry on the server', Wv.j.binder.archive_state);
        await W1p.click('#sc-edit'); await W1p.fill('#sc-notes-in', 'dal telefono');
        await Wq('patch', {token:WT.dave, body:{id:Wv.j.binder.id, patch:{tags:'cambiata,altrove'}, base_updated_at:Wv.j.etag}});
        await W1p.click('#sc-save'); await W1p.waitForTimeout(900);
        ok(await W1p.isVisible('#sc-conflict'), 'W: scan.html: the server copy changed meanwhile → 409 → conflict screen');
        await W1p.click('[data-s="conflict-force"]'); await W1p.waitForTimeout(900);
        Wv = await Wq('binder', {token:WT.lucia, q:{code:'WV4'}});
        ok(Wv.j.binder.notes === 'dal telefono' && Wv.j.binder.tags === 'cambiata,altrove', 'W: "Salva comunque" sends only the phone fields (field merge kept the other change)', Wv.j.binder);
        // a brand-new phone: scan first, set up the device there
        const W3 = await b.newContext({viewport:{width:390, height:844}, isMobile:true}), W3p = await W3.newPage();
        W3p.on('pageerror', e => errs.push('W3 PAGEERR ' + e.message));
        await W3p.goto(WO + '/studio-de/scan.html?q=dm26WvXabBx2'); await W3p.waitForTimeout(800);
        ok(await W3p.evaluate(() => SC.view === 'setup' && !/WV1|Zanzibar/.test(document.getElementById('app').innerHTML)), 'W: new phone: scan.html shows the device set-up (user, PIN, access code), no data');
        await W3p.fill('#sc-user', 'lucia.tel'); await W3p.fill('#sc-pin', '2468'); await W3p.fill('#sc-pin2', '2468'); await W3p.fill('#sc-token', WT.lucia); await W3p.click('#sc-enter'); await W3p.waitForTimeout(2500);
        ok(await W3p.evaluate(() => SC.view === 'card' && document.getElementById('sc-code').textContent === 'WV1' && !document.getElementById('sc-edit') && SC.P.auth.currentUser().role === 'viewer'), 'W: after set-up the phone shows the binder from the server; viewer token → no Modifica button');
        await W3.close(); await W2.close(); await W1.close();

        // ---- desktop: "Sincronizza con il server" with conflict review ----
        Wv = await Mp.evaluate(() => { while (topModal()) closeModal(true); const b = S.binders.find(x => x.speaking_code === 'WV1'); b.notes = 'modifica PC'; commit(); return b.id; });
        await Mp.waitForTimeout(30);
        Wv2 = await Wq('binder', {token:WT.lucia, q:{code:'WV1'}});
        await Wq('push', {token:WT.dave, body:{records:[{type:'binder', id:Wv, updated_at:new Date(Date.now() + 1000).toISOString(), data:Object.assign({}, Wv2.j.binder, {notes:'modifica server'})},
          {type:'binder', id:'w-v10-b7', updated_at:new Date(Date.now() + 1000).toISOString(), data:Object.assign({}, (await Wq('binder', {token:WT.lucia, q:{code:'WV7'}})).j.binder, {notes:'solo server'})}]}});
        await Mp.evaluate(() => { S.view = 'sync'; renderAll(); window.__wSync = srvSync({interactive:true}); });
        await Mp.waitForTimeout(1500);
        Wv2 = await Mp.evaluate(() => ({rv:!!document.getElementById('sy-review'), conf:document.querySelectorAll('.sy-conf').length, txt:(document.getElementById('sy-review') || {}).innerText || ''}));
        await Mp.screenshot({path:Wpath.join(__dirname, 'shots', 'w_desktop_review.png')});
        ok(Wv2.rv && Wv2.conf === 1 && /WV1/.test(Wv2.txt) && /modifica server/.test(Wv2.txt) && /modifica PC/.test(Wv2.txt), 'W: desktop sync: a record changed on both sides since the last server sync opens the 06f conflict review', Wv2);
        await Mp.click('.sy-conf input[value="local"]'); await Mp.click('.modal-f .btn-primary');
        Wv2 = await Mp.evaluate(async () => { const r = await window.__wSync; return {r, wv1:S.binders.find(x => x.speaking_code === 'WV1').notes, wv7:S.binders.find(x => x.speaking_code === 'WV7').notes, wv4:S.binders.find(x => x.speaking_code === 'WV4').archive_state, api:S.binders.some(x => x.speaking_code === 'WAP1')}; });
        Wv = await Wq('binder', {token:WT.lucia, q:{code:'WV1'}});
        ok(Wv2.r && Wv2.r.sent >= 1 && Wv2.wv1 === 'modifica PC' && Wv2.wv7 === 'solo server' && Wv2.wv4 === 'CHECKED_OUT' && Wv2.api && Wv.j.binder.notes === 'modifica PC',
          'W: after the review the PC keeps its choice, receives the server-only changes and pushes the kept version', {r:Wv2.r, wv1:Wv2.wv1, wv7:Wv2.wv7, srv:Wv.j.binder.notes});
        ok(await Mp.evaluate(() => LOG.entries.some(e => e.action === 'sync.server') && LOG.entries.some(e => e.source === 'mobile' && e.target && e.target.code === 'WV4')), 'W: the desktop log has the server sync line and the mobile edits made online');
        // admin: token management
        Wv = await Mp.evaluate(async () => { const c = srvConf(); const x = await srvClient(c).call('token_create', {method:'POST', body:{user:'nuovo', role:'editor'}}); const l = await srvClient(c).call('tokens'); return {x, n:l.items.length}; });
        Wv2 = [(await Wq('me', {token:Wv.x.token})).s];
        await Mp.evaluate(async (id) => srvClient(srvConf()).call('token_revoke', {method:'POST', body:{id}}), Wv.x.id);
        Wv2.push((await Wq('me', {token:Wv.x.token})).s);
        ok(Wv.n === 4 && Wv2[0] === 200 && Wv2[1] === 401, 'W: admin creates a database token (works at once) and revokes it (401 afterwards)', {n:Wv.n, s:Wv2});
        await Mctx.close();
        await Wq('me', {token:WT.mario});   // a success clears the failure counter of this IP
        // ---- rate limit (last: it locks this IP for a moment) ----
        await Wsleep(2100);
        Wv = []; for (let i = 0; i < 4; i++) Wv.push((await Wq('me', {token:'sbagliato-' + i})).s);
        Wv2 = await Wq('me', {token:WT.mario});
        ok(Wv.join(',') === '401,401,401,429' && Wv2.s === 429 && +Wv2.h.get('retry-after') > 0, 'W: wrong tokens are rate-limited per IP (429 + Retry-After, even for a good token while locked)', {s:Wv, after:Wv2.s});
        await Wsleep(2300);
        ok((await Wq('me', {token:WT.mario})).s === 200, 'W: after the lock the good token works again');
      } finally {
        Wsrv.kill();
      }
    }
  }
  // @@STREAM-X@@
  sec('v11 X: location tree (Ubicazioni), location QR labels, association mode');
  {
    const Xpath = require('path'), Xcp = require('child_process');
    let Xv, Xv2;
    const Xsel = await p.evaluate(() => S.binders.filter(b => b.selected_for_print).map(b => b.id));
    await p.evaluate(() => { while (topModal()) closeModal(true); S.lang = 'it'; S.view = 'info'; S.infoTab = 'loc'; renderAll(); });
    Xv = await p.evaluate(() => ({n:(S.locations || []).length, empty:!!document.getElementById('lo-empty-bulk'), tab:!!document.querySelector('.info-tabs [data-v="loc"]'), csv:CSV_COLUMNS[CSV_COLUMNS.length - 1], db:DB_SCHEMA_VERSION,
      w:document.documentElement.scrollWidth <= innerWidth + 1}));
    ok(Xv.n === 0 && Xv.empty && Xv.tab && Xv.csv === 'location_id' && Xv.db === 7 && Xv.w, 'X: Informazioni › Ubicazioni starts empty (no invented locations); CSV ends with location_id; local DB schema 7', Xv);

    // ---- bulk create: 1 warehouse › 2 cabinets › 1 shelving unit › 1 shelf › 4 boxes ----
    await p.click('#lo-empty-bulk'); await p.waitForTimeout(150);
    for (const [i, n] of [[0, 1], [1, 2], [2, 1], [3, 1], [4, 4]]) await p.fill('[data-lo-bk="n"][data-i="' + i + '"]', String(n));
    Xv = await p.evaluate(() => document.getElementById('lo-bulk-prev').innerText);
    await p.screenshot({path:'shots/x_bulk.png'});
    await p.click('.modal-f .btn-primary'); await p.waitForTimeout(200);
    Xv2 = await p.evaluate(() => { const L = S.locations, leaves = L.filter(l => !locChildren(l.id).length);
      return {n:L.length, leaves:leaves.length, codes:leaves.map(l => l.code).sort(naturalCmp), uniq:new Set(L.map(l => l.code)).size, sc:L.every(l => LOC_SC_RE.test(l.short_code) && l.short_url === 'https://qr7.it/' + l.short_code) && new Set(L.map(l => l.short_code)).size === L.length,
        notBinder:L.every(l => !SC_RE.test(l.short_code)) && S.binders.every(b => !LOC_SC_RE.test(b.short_code)), lv:leaves.every(l => l.level === 4), kind:locKind(leaves[0]), path:locPathText(leaves[0].id),
        log:LOG.entries.some(e => e.action === 'location.bulk_create' && e.details.count === 15), checked:LUI.checked.size, tree:document.querySelectorAll('#lo-tree .lt-row').length}; });
    ok(/15/.test(Xv) && Xv2.n === 15 && Xv2.leaves === 8 && Xv2.codes[0] === 'MAG1-A1-S1-R1-B01' && Xv2.codes[7] === 'MAG1-A2-S1-R1-B04' && Xv2.uniq === 15 && Xv2.lv && Xv2.kind === 'Scatola' && Xv2.path === 'Magazzino MAG1 › Armadio A1 › Scansia S1 › Scaffale R1 › Scatola B01' && Xv2.log && Xv2.checked === 8 && Xv2.tree > 3,
      'X: "Crea in serie" builds the hierarchy (15 places, boxes B01..B04, path codes MAG1-A1-S1-R1-B01, logged, boxes ticked for printing)', {prev:Xv, r:Xv2});
    ok(Xv2.sc && Xv2.notBinder, 'X: location short codes are unique dm26L + 8 (qr7.it URL) and never match the binder format dm26 + 8', Xv2);

    // ---- tree CRUD: add, rename, duplicate segment, move, delete + undo ----
    await p.evaluate(() => { LUI.sel = S.locations.find(l => l.code === 'MAG1-A1-S1-R1').id; locRender(); });
    await p.click('#lo-add-child'); await p.waitForTimeout(100);
    Xv = await p.evaluate(() => { const l = locById(LUI.sel); return {code:l.code, lv:l.level, log:LOG.entries[LOG.entries.length - 1].action}; });
    await p.fill('#lo-f-name', 'Scatola bilanci'); await p.press('#lo-f-name', 'Enter'); await p.waitForTimeout(80);
    await p.fill('#lo-f-seg', 'b01'); await p.press('#lo-f-seg', 'Enter'); await p.waitForTimeout(80);
    Xv2 = await p.evaluate(() => { const l = locById(LUI.sel), sib = locChildren(l.parent_id).map(x => x.seg); return {name:l.name, seg:l.seg, uniq:new Set(sib).size === sib.length, tree:document.getElementById('lo-tree').innerText.includes('Scatola bilanci')}; });
    ok(Xv.code === 'MAG1-A1-S1-R1-B05' && Xv.lv === 4 && Xv.log === 'location.create' && Xv2.name === 'Scatola bilanci' && Xv2.seg !== 'B01' && /^B01/.test(Xv2.seg) && Xv2.uniq && Xv2.tree,
      'X: add a box (next free code B05), rename it, a segment already used among siblings stays unique', {Xv, Xv2});
    await p.fill('#lo-f-seg', 'B09'); await p.press('#lo-f-seg', 'Enter'); await p.waitForTimeout(80);
    // test binders (not demo) placed with the old room fields
    const XB = await p.evaluate(() => {
      for (let i = 1; i <= 6; i++) S.binders.push(normalizeBinder({speaking_code:'XL' + i, company_name:'Ubicazioni Prova ' + i + ' Srl', category:'IVA', room_code:'A', cabinet_code:'1', shelf_code:'β', short_code:newShortCode(), created_at:nowISO(), updated_at:nowISO()}));
      ensureIntegrity(); commit();
      const o = {}; S.binders.filter(b => /^XL\d$/.test(b.speaking_code)).forEach(b => { o[b.speaking_code] = {id:b.id, sc:b.short_code}; }); return o; });
    const XL = await p.evaluate(() => { const o = {}; S.locations.forEach(l => { o[l.code] = {id:l.id, sc:l.short_code}; }); return o; });
    // archive: ticked binders → "Ubicazione…" with the location typed
    await p.evaluate(() => { S.binders.forEach(b => { b.selected_for_print = /^XL[123]$/.test(b.speaking_code); }); S.view = 'archive'; UI.q = ''; renderAll(); });
    await p.click('#lo-assign-btn'); await p.waitForTimeout(120);
    await p.fill('#lo-as-q', 'MAG1-A1-S1-R1-B01'); await p.waitForTimeout(60);
    await p.click('.modal-f .btn-primary'); await p.waitForTimeout(150);
    Xv = await p.evaluate((L) => { const bs = S.binders.filter(b => /^XL[123]$/.test(b.speaking_code)); return {ids:bs.every(b => b.location_id === L['MAG1-A1-S1-R1-B01'].id), codes:bs.map(b => b.location_code).join(','), room:bs.every(b => b.room_code === 'A' && b.cabinet_code === '1' && b.shelf_code === 'β'),
      log:LOG.entries.some(e => e.action === 'binder.locate_bulk' && e.details.to && e.details.to.code === 'MAG1-A1-S1-R1-B01' && e.details.via === 'bulk'), row:(document.querySelector('#archive-results') || document.getElementById('view')).innerText.includes('MAG1-A1-S1-R1-B01')}; }, XL);
    ok(Xv.ids && Xv.codes === 'MAG1-A1-S1-R1-B01,MAG1-A1-S1-R1-B01,MAG1-A1-S1-R1-B01' && Xv.room && Xv.log && Xv.row, 'X: archive selection → "Ubicazione…" puts the binders in a box (location_id + location_code, room fields untouched, logged)', Xv);
    // binder editor: typeahead of locations
    await p.evaluate((id) => openEditor(id), XB.XL4.id); await p.waitForTimeout(250);
    await p.click('#ed-locpick'); await p.fill('#ed-locpick', 'A2-S1-R1-B03'); await p.waitForTimeout(150);
    Xv = await p.evaluate(() => [...document.querySelectorAll('.ta-opt')].map(x => x.innerText.split('\n')[0]));
    await p.click('.ta-opt'); await p.waitForTimeout(80);
    Xv2 = await p.evaluate(() => ({path:document.getElementById('lo-ed-path').textContent, d:UI.ed.d.location_id}));
    await p.evaluate(() => saveEditor()); await p.waitForTimeout(150);
    const XedB = await p.evaluate((id) => { const b = S.binders.find(x => x.id === id); return {id:b.location_id, code:b.location_code, log:LOG.entries.some(e => e.action === 'binder.locate' && e.target && e.target.id === id && e.details.via === 'editor' && e.details.to.code === 'MAG1-A2-S1-R1-B03')}; }, XB.XL4.id);
    ok(Xv[0] === 'MAG1-A2-S1-R1-B03' && /Armadio A2/.test(Xv2.path) && XedB.id === XL['MAG1-A2-S1-R1-B03'].id && XedB.code === 'MAG1-A2-S1-R1-B03' && XedB.log, 'X: binder editor: location typeahead → saved location_id + code, logged as binder.locate (editor)', {Xv, Xv2, XedB});
    // archive filter + search, "Dov'è?"
    Xv = await p.evaluate((L) => {
      UI.fLoc = L['MAG1-A1-S1-R1-B01'].id; const a = filteredBinders().map(b => b.speaking_code).sort().join(',');
      UI.fLoc = L['MAG1-A1'].id; const sub = filteredBinders().length;
      UI.fLoc = '__none'; const none = filteredBinders().some(b => /^XL[1-4]$/.test(b.speaking_code));
      UI.fLoc = ''; UI.q = 'MAG1-A2-S1-R1-B03'; const q = filteredBinders().map(b => b.speaking_code).join(','); UI.q = '';
      S.view = 'archive'; renderAll(); const sel = !!document.querySelector('select[data-lo-filter]');
      return {a, sub, none, q, sel}; }, XL);
    ok(Xv.a === 'XL1,XL2,XL3' && Xv.sub === 3 && !Xv.none && Xv.q === 'XL4' && Xv.sel, 'X: archive filter by location (box, subtree, "senza ubicazione") and search by location code', Xv);
    await p.evaluate((id) => openLocate(id), XB.XL1.id); await p.waitForTimeout(200);
    Xv = await p.evaluate(() => ({where:(document.getElementById('lo-where') || {}).innerText || ''}));
    await p.evaluate(() => { while (topModal()) closeModal(true); });
    ok(/Magazzino/i.test(Xv.where) && /MAG1/.test(Xv.where) && /B01/.test(Xv.where) && /Scatola/i.test(Xv.where), '"Dov\'è?" shows the location path (warehouse › … › box)', Xv);
    // move a shelf to the other cabinet: codes of the subtree and of the binders inside follow
    await p.evaluate((L) => { undoPoint(); locMove(L['MAG1-A1-S1-R1'].id, L['MAG1-A2-S1'].id); commit(); }, XL);
    Xv = await p.evaluate((L) => ({code:locById(L['MAG1-A1-S1-R1-B01'].id).code, b:S.binders.find(b => b.speaking_code === 'XL1').location_code, uniq:new Set(S.locations.map(l => l.code)).size === S.locations.length, log:LOG.entries.some(e => e.action === 'location.move')}), XL);
    ok(/^MAG1-A2-S1-R\d+-B01$/.test(Xv.code) && Xv.b === Xv.code && Xv.uniq && Xv.log, 'X: moving a shelf to another cabinet renames the subtree codes and the binders inside follow (codes stay unique)', Xv);
    await p.evaluate(() => { const W = UNDO; if (W){ UNDO = null; applyWorkspaceObject(W); commit(); renderAll(); } });
    // delete a box with binders: confirm, binders lose the location, undo brings everything back
    await p.evaluate((L) => { S.view = 'info'; S.infoTab = 'loc'; LUI.sel = L['MAG1-A1-S1-R1-B01'].id; renderAll(); }, XL);
    await p.click('#lo-del'); await p.waitForTimeout(120);
    Xv = await p.evaluate(() => topModal() ? topModal().innerText : '');
    await p.click('.modal-f .btn-danger-solid'); await p.waitForTimeout(150);
    Xv2 = await p.evaluate((L) => ({gone:!locById(L['MAG1-A1-S1-R1-B01'].id), n:S.locations.length, b:S.binders.filter(b => /^XL[123]$/.test(b.speaking_code)).map(b => b.location_id + '|' + b.location_code).join(','), log:LOG.entries[LOG.entries.length - 1].action}), XL);
    await p.locator('.toast-act').last().click(); await p.waitForTimeout(150);
    const Xund = await p.evaluate((L) => ({back:!!locById(L['MAG1-A1-S1-R1-B01'].id), code:(locById(L['MAG1-A1-S1-R1-B01'].id) || {}).code, b:S.binders.filter(b => /^XL[123]$/.test(b.speaking_code)).every(b => b.location_id === L['MAG1-A1-S1-R1-B01'].id && b.location_code === 'MAG1-A1-S1-R1-B01')}), XL);
    ok(/MAG1-A1-S1-R1-B01/.test(Xv) && /3/.test(Xv) && Xv2.gone && Xv2.n === 15 && Xv2.b === '|A1-β,|A1-β,|A1-β' && Xv2.log === 'location.delete', 'X: delete asks for confirmation, removes the box and frees its binders (old position text comes back)', {Xv, Xv2});
    ok(Xund.back && Xund.code === 'MAG1-A1-S1-R1-B01' && Xund.b, 'X: "Annulla" restores the deleted box and its binders', Xund);

    // ---- CSV / JSON / SQLite round trip ----
    Xv = await p.evaluate(() => {
      const csv = toCSV([CSV_COLUMNS].concat(sortedBinders().filter(b => /^XL\d$/.test(b.speaking_code)).map(b => binderToCsvRow(b).map(safeCell))), ';');
      const keep = S.binders.filter(b => /^XL\d$/.test(b.speaking_code)).map(b => b.location_id + '|' + b.location_code).join(',');
      S.binders.forEach(b => { if (/^XL\d$/.test(b.speaking_code)) { b.location_id = ''; b.location_code = computeLocation(b); } });
      analyzeImport(csv); applyImport('merge');
      const after = S.binders.filter(b => /^XL\d$/.test(b.speaking_code)).map(b => b.location_id + '|' + b.location_code).join(',');
      const room = S.binders.filter(b => /^XL\d$/.test(b.speaking_code)).every(b => b.room_code === 'A' && b.cabinet_code === '1' && b.shelf_code === 'β' && b.sector_code === '');
      const hdr = csv.split(/\r?\n/)[0].split(';'), idx = hdr.indexOf('location_id');
      return {keep, after, room, idx, last:hdr[hdr.length - 1], alias:mapRecord({'ID ubicazione':'abc'}).location_id};
    });
    ok(Xv.keep === Xv.after && /\|MAG1-A1-S1-R1-B01/.test(Xv.after) && Xv.room && Xv.last === 'location_id' && Xv.alias === 'abc', 'X: CSV round trip keeps location_id (last column) and does not turn the location path into room/cabinet/shelf', Xv);
    Xv = await p.evaluate(() => {
      const js = workspaceJSON(true), W = JSON.parse(js);
      const keepL = JSON.stringify(S.locations.map(l => [l.id, l.code, l.short_code, l.parent_id]).sort()), keepB = S.binders.filter(b => /^XL\d$/.test(b.speaking_code)).map(b => b.location_id).join(',');
      S.locations = []; S.binders.forEach(b => { if (/^XL\d$/.test(b.speaking_code)) b.location_id = ''; });
      analyzeImport(js); UI.restoreAll = true; applyImport('merge');
      return {inJson:Array.isArray(W.locations) && W.locations.length === 16, same:JSON.stringify(S.locations.map(l => [l.id, l.code, l.short_code, l.parent_id]).sort()) === keepL, b:S.binders.filter(b => /^XL\d$/.test(b.speaking_code)).map(b => b.location_id).join(',') === keepB};
    });
    ok(Xv.inJson && Xv.same && Xv.b, 'X: JSON workspace round trip (locations array + binder location_id)', Xv);
    Xv = await p.evaluate(async () => {
      dbSyncFromState('t'); await dbPersist();
      const d2 = new DB.SQL.Database(DB.db.export()), W = dbReadWorkspace(d2);
      const cols = dbQuery('PRAGMA table_info(locations)', null, d2).map(r => r.name), bcols = dbQuery('PRAGMA table_info(binders)', null, d2).map(r => r.name);
      const ver = dbScalar("SELECT value FROM meta WHERE key = 'schema_version'", null, d2), nullRoot = dbScalar('SELECT COUNT(*) FROM locations WHERE parent_id IS NULL', null, d2);
      const sL = JSON.stringify(S.locations.map(l => [l.id, l.parent_id, l.code, l.short_code, l.seg, l.level]).sort()), wL = JSON.stringify((W.locations || []).map(l => [l.id, l.parent_id, l.code, l.short_code, l.seg, l.level]).sort());
      const xb = W.binders.filter(b => /^XL\d$/.test(b.speaking_code)).map(b => b.location_id).sort().join(','), sb = S.binders.filter(b => /^XL\d$/.test(b.speaking_code)).map(b => b.location_id).sort().join(',');
      d2.close();
      return {cols:['id', 'parent_id', 'level', 'kind', 'name', 'seg', 'code', 'short_code', 'short_url', 'notes', 'sort', 'created_at', 'updated_at'].every(c => cols.includes(c)), bcol:bcols.includes('location_id'), ver, nullRoot, same:sL === wL, b:xb === sb && /-/.test(xb)};
    });
    ok(Xv.cols && Xv.bcol && Xv.ver === '7' && Xv.nullRoot === 1 && Xv.same && Xv.b, 'X: SQLite round trip (table locations, binders.location_id, schema_version 7, top level parent NULL)', Xv);

    // ---- location QR labels: print engine + Scarica PDF (MRINK143) ----
    const Xleaves = await p.evaluate(() => S.locations.filter(l => !locChildren(l.id).length).map(l => ({id:l.id, code:l.code, url:l.short_url})).sort((a, b) => naturalCmp(a.code, b.code)));
    await p.evaluate(() => { S.view = 'info'; S.infoTab = 'loc'; LUI.checked = new Set(); renderAll(); });
    await p.click('[data-a="lo-sel-leaves"]'); await p.click('#lo-print-sel'); await p.waitForTimeout(400);
    Xv = await p.evaluate(() => { const L = layoutLabels(), html = buildLabelSheets(false).join('');
      return {view:S.view, mode:S.print.contentMode, preset:S.print.presetId, items:L.items, pages:L.pages.length, kinds:[...new Set(queueItems().map(x => x.kind))].join(), loc:(html.match(/class="[^"]*lab-loc/g) || []).length,
        code:html.includes('MAG1-A1-S1-R1-B01'), path:html.includes('Scansia S1'), demo:/\bdemo\b/i.test(html.replace(/<[^>]+>/g, ' ')), sum:(document.getElementById('pr-summary') || {}).innerText || ''}; });
    await p.screenshot({path:'shots/x_print.png'});
    ok(Xv.view === 'print' && Xv.mode === 'loc' && Xv.preset === 'mrink143' && Xv.items === 9 && Xv.pages === 2 && Xv.kinds === 'L' && Xv.loc === 9 && Xv.code && Xv.path && !Xv.demo && /9/.test(Xv.sum),
      'X: "Stampa etichette" of the boxes → print studio with "Etichette ubicazione" (code, path, QR), default sheet MRINK143, never "demo"', Xv);
    {
      const [dl] = await Promise.all([p.waitForEvent('download', {timeout:60000}), p.click('#btn-pdf')]);
      await dl.saveAs('shots/x_loc.pdf'); await p.waitForTimeout(200); await p.evaluate(() => { while (topModal()) closeModal(true); });
      const lay = await p.evaluate(() => { const g = S.print.geometry; return {w:g.w, h:g.h, slots:layoutLabels().pages[0].map(x => Object.assign(slotRect(x.s), {url:x.item.b.short_url}))}; });
      Xcp.execSync('python3 -c "import pypdfium2 as p;d=p.PdfDocument(\'shots/x_loc.pdf\');print(len(d));d[0].render(scale=300/72).to_pil().convert(\'RGBA\').save(\'shots/x_loc.png\')"');
      const png = PNG.sync.read(fs.readFileSync('shots/x_loc.png')), K = 300 / 25.4;
      const got = lay.slots.map(s => {
        const x0 = Math.floor(s.x * K), y0 = Math.floor(s.y * K), W = Math.min(Math.floor(lay.w * K), png.width - x0), H = Math.min(Math.floor(lay.h * K), png.height - y0), d = new Uint8ClampedArray(W * H * 4);
        for (let j = 0; j < H; j++){ const st = ((y0 + j) * png.width + x0) * 4; d.set(png.data.subarray(st, st + W * 4), j * W * 4); }
        for (const f of [2, 1, 4]){ let e = d, w2 = W, h2 = H;
          if (f > 1){ w2 = Math.floor(W / f); h2 = Math.floor(H / f); e = new Uint8ClampedArray(w2 * h2 * 4); for (let j = 0; j < h2; j++) for (let i = 0; i < w2; i++){ const a = ((j * f) * W + i * f) * 4, bb = (j * w2 + i) * 4; e[bb] = d[a]; e[bb + 1] = d[a + 1]; e[bb + 2] = d[a + 2]; e[bb + 3] = 255; } }
          const r = jsQR(e, w2, h2); if (r && r.data) return r.data; }
        return null; });
      ok(fs.readFileSync('shots/x_loc.pdf').subarray(0, 5).toString() === '%PDF-' && got.length === 8 && got.every((g, i) => g === lay.slots[i].url) && got.every(g => /^https:\/\/qr7\.it\/dm26L[A-Za-z0-9]{8}$/.test(g)),
        'X: Scarica PDF of location labels: every QR on the MRINK143 sheet decodes to its location qr7 URL', {got, want:lay.slots.map(s => s.url)});
    }
    await p.click('#lo-pr-back'); await p.waitForTimeout(150);
    ok(await p.evaluate(() => S.print.contentMode !== 'loc' && queueItems().every(x => x.kind !== 'L')), 'X: "Torna alle etichette dei faldoni" leaves the location queue');

    // ---- qr7 manifest: location rows, trailing ';' ----
    Xv = await p.evaluate(() => {
      const rows = [MANIFEST_HEADER].concat(sortedBinders().filter(b => b.short_code).map(manifestRow), locManifestRows()), txt = manifestText(rows);
      const lines = txt.trimEnd().split('\n'), locLines = lines.filter(l => /^dm26L[A-Za-z0-9]{8};/.test(l))   /* anchored: a binder code dm26+8 can start with an L by chance */;
      const l0 = S.locations.find(l => l.code === 'MAG1-A1-S1-R1-B01');
      const m = mergeManifest('short_code;short_url;final_destination;tags;\nOTHER1;https://qr7.it/OTHER1;https://x.example/;foo;\n' + l0.short_code + ';https://qr7.it/' + l0.short_code + ';https://old.example/;old;\ndm26LZzZzZzZz;https://qr7.it/dm26LZzZzZzZz;https://old.example/;gone;\n', true);
      return {n:locLines.length, all:lines.every(l => l.endsWith(';')), row:locLines.find(l => l.startsWith(l0.short_code + ';')), want:l0.short_code + ';https://qr7.it/' + l0.short_code + ';https://docmap.pr-it.it/studio-de/q/' + l0.short_code + ';docmap26,location,MAG1-A1-S1-R1-B01;',
        dest:locDest(l0), merged:m.text, mAll:m.text.trimEnd().split(/\r?\n/).every(l => l.endsWith(';')), mOld:m.text.includes('old.example'), mOther:m.text.includes('OTHER1'), removed:m.removed};
    });
    ok(Xv.n === 16 && Xv.all && Xv.row === Xv.want && Xv.mAll && !Xv.mOld && Xv.mOther && Xv.removed === 1, 'X: qr7 manifest has one row per location (…/q/<short_code>, tags docmap26,location,<code>) and every line ends with ";" (also after a merge)', Xv);

    // ---- desktop association mode with a keyboard-wedge scanner ----
    await p.evaluate((L) => { S.view = 'info'; S.infoTab = 'loc'; LUI.sel = L['MAG1-A2-S1-R1-B02'].id; renderAll(); }, XL);
    await p.click('#lo-assoc-here'); await p.waitForTimeout(120);
    const Xscan = async (txt) => { await p.fill('#la-scan', txt); await p.press('#la-scan', 'Enter'); await p.waitForTimeout(60); return p.evaluate(() => ({msg:(document.getElementById('la-msg') || {}).innerText || '', box:LUI.assoc.loc, focus:document.activeElement && document.activeElement.id})); };
    const Xa = [];
    Xa.push(await Xscan('https://qr7.it/' + XB.XL5.sc));
    Xa.push(await Xscan(XB.XL6.sc));                                          // bare code
    Xa.push(await Xscan('https://qr7.it/' + XB.XL6.sc));                    // same binder again
    Xa.push(await Xscan('https://qr7.it/' + XL['MAG1-A2-S1-R1-B04'].sc));    // next box QR switches
    Xa.push(await Xscan('https://docmap.pr-it.it/studio-de/q/' + XB.XL1.sc)); // final destination URL works too
    Xa.push(await Xscan('nonesiste'));
    Xv = await p.evaluate((B) => { const g = (k) => S.binders.find(b => b.id === B[k].id);
      return {x5:g('XL5').location_code, x6:g('XL6').location_code, x1:g('XL1').location_code, rows:document.querySelectorAll('.la-row').length,
        log:LOG.entries.filter(e => e.action === 'binder.locate' && e.details.via === 'scanner').length, from:(LOG.entries.find(e => e.action === 'binder.locate' && e.target.id === B.XL1.id) || {details:{}}).details,
        dev:(LOG.entries.find(e => e.action === 'binder.locate' && e.details.via === 'scanner') || {details:{}}).details.device}; }, XB);
    await p.screenshot({path:'shots/x_assoc.png'});
    ok(Xa[0].msg.includes('XL5') && Xa[2].msg.includes('già') && Xa[3].box === XL['MAG1-A2-S1-R1-B04'].id && /MAG1-A2-S1-R1-B04/.test(Xa[3].msg) && /non riconosciuto|sconosciut/i.test(Xa[5].msg) && Xa.every(a => a.focus === 'la-scan'),
      'X: desktop association mode (keyboard scanner + Enter): box QR → active box, binder QR → assigned, same binder → "già", next box QR switches, unknown → message, field keeps the focus', Xa);
    ok(Xv.x5 === 'MAG1-A2-S1-R1-B02' && Xv.x6 === 'MAG1-A2-S1-R1-B02' && Xv.x1 === 'MAG1-A2-S1-R1-B04' && Xv.rows === 3 && Xv.log === 3 && Xv.from.from.code === 'MAG1-A1-S1-R1-B01' && Xv.from.to.code === 'MAG1-A2-S1-R1-B04' && Xv.dev && Xv.from.user,
      'X: each scan is in the activity log (binder.locate, from → to, via scanner, device, user)', Xv);
    await p.click('[data-a="la-undo"][data-i="0"]'); await p.waitForTimeout(80);
    Xv = await p.evaluate((B) => ({x1:S.binders.find(b => b.id === B.XL1.id).location_code, undo:LOG.entries[LOG.entries.length - 1].action === 'binder.locate' && LOG.entries[LOG.entries.length - 1].details.via === 'undo', row:!!document.querySelector('.la-row.undone')}), XB);
    ok(Xv.x1 === 'MAG1-A1-S1-R1-B01' && Xv.undo && Xv.row, 'X: undo of a scan puts the binder back in its previous box (logged)', Xv);
    await p.click('#la-stop'); await p.waitForTimeout(60);
    ok(await p.evaluate(() => !LUI.assoc.on && !document.getElementById('la-card')), 'X: Stop ends association mode');
    // offline decoder (vendored jsQR) reads our own QR from file://
    Xv = await p.evaluate(async () => { const url = S.locations[0].short_url, q = DMQR.encode(url, 'M'), k = 8, n = (q.size + 8) * k, cv = document.createElement('canvas');
      cv.width = n; cv.height = n; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, n, n); g.fillStyle = '#000';
      for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.modules[y][x]) g.fillRect((x + 4) * k, (y + 4) * k, k, k);
      return {got:await dmDecodeQRCanvas(cv), want:url, cam:typeof DMCamScanner === 'function', parsed:assocParseCode(url).type}; });
    ok(Xv.got === Xv.want && Xv.cam && Xv.parsed === 'location', 'X: vendored offline QR decoder (vendor/jsqr.js) decodes a location QR from file://', Xv);

    // ---- v10.1 local data (no location fields, DB schema 6) opens unchanged ----
    {
      const Xctx = await b.newContext({viewport:{width:1366, height:768}}), Xp = await Xctx.newPage();
      Xp.on('pageerror', e => errs.push('X PAGEERR ' + e.message)); Xp.on('dialog', d => d.accept());
      const Xst = {schema:26.9, lang:'it', view:'archive', onboarded:true, settings:{studioName:'Studio v10.1', operator:'Dave', deviceId:'dev-x-v101'},
        binders:[1, 2, 3].map(i => ({id:'x-v101-b' + i, speaking_code:'XV' + i, company_name:'Vecchio ' + i + ' Srl', category:'IVA', short_code:'dm26XvOld' + 'abc'.charAt(i - 1) + 'Q' + i, room_code:'A', cabinet_code:String(i), shelf_code:'β', location_code:'A' + i + '-β', created_at:'2026-10-01T08:00:00.000Z', updated_at:'2026-10-02T09:00:00.000Z'})),
        clients:[], tombstones:[], sync:{peers:{}, history:[]}};
      await Xp.goto(URL_); await Xp.evaluate((st) => { localStorage.clear(); localStorage.setItem('docmap_v26_state', JSON.stringify(st)); }, Xst);
      await Xp.reload(); await Xp.waitForTimeout(1500);
      // turn the local SQLite into the v10.1 shape (no locations table, no binders.location_id, schema 6) and reopen
      await Xp.evaluate(async () => { while (topModal()) closeModal(true); const cols = dbQuery('PRAGMA table_info(binders)').map(r => r.name).filter(c => c !== 'location_id');
        DB.db.exec("DROP TABLE IF EXISTS locations; DROP INDEX IF EXISTS ix_binders_location; ALTER TABLE binders RENAME TO x_old_binders; CREATE TABLE binders AS SELECT " + cols.join(', ') + " FROM x_old_binders; DROP TABLE x_old_binders; UPDATE meta SET value = '6' WHERE key = 'schema_version'"); await dbPersist(); });
      Xv2 = await Xp.evaluate(() => ({cols:dbQuery('PRAGMA table_info(binders)').map(r => r.name).includes('location_id'), t:dbScalar("SELECT COUNT(*) FROM sqlite_master WHERE name = 'locations'")}));
      await Xp.reload(); await Xp.waitForTimeout(1500);
      Xv = await Xp.evaluate(() => { while (topModal()) closeModal(true);
        return {n:S.binders.length, codes:S.binders.map(b => b.location_code).join(','), ups:S.binders.map(b => b.updated_at).join(','), loc:Array.isArray(S.locations) && S.locations.length === 0, lid:S.binders.every(b => b.location_id === ''),
          cols:dbQuery('PRAGMA table_info(binders)').map(r => r.name).includes('location_id'), t:dbScalar("SELECT COUNT(*) FROM sqlite_master WHERE name = 'locations'"), ver:dbScalar("SELECT value FROM meta WHERE key = 'schema_version'"), nb:dbScalar('SELECT COUNT(*) FROM binders'), key:!!localStorage.getItem('docmap_v26_state')}; });
      await Xp.evaluate(() => { S.view = 'info'; S.infoTab = 'loc'; renderAll(); });
      ok(!Xv2.cols && Xv2.t === 0 && Xv.n === 3 && Xv.codes === 'A1-β,A2-β,A3-β' && Xv.ups === '2026-10-02T09:00:00.000Z,2026-10-02T09:00:00.000Z,2026-10-02T09:00:00.000Z' && Xv.loc && Xv.lid && Xv.cols && Xv.t === 1 && Xv.ver === '7' && Xv.nb === 3 && Xv.key && await Xp.isVisible('#lo-empty-bulk'),
        'X: v10.1 data (state without location fields, SQLite schema 6) opens unchanged: positions and timestamps kept, DB migrated additively to 7', {before:Xv2, Xv});
      await Xctx.close();
    }
    await p.evaluate((ids) => { S.binders.forEach(b => { b.selected_for_print = ids.includes(b.id); }); S.view = 'archive'; renderAll(); }, Xsel);

    // ---- server: v10.1 api.php data dir → v11 api.php; phone association; sync of locations between two app pages ----
    let Xphp = ''; try { Xphp = Xcp.execFileSync('php', ['-r', 'echo extension_loaded("pdo_sqlite") && extension_loaded("openssl") ? "ok" : "no";']).toString(); } catch(e){}
    let Xold = ''; try { Xold = Xcp.execFileSync('git', ['show', '68ae170:docmapv1/server-php/api.php'], {cwd:__dirname, stdio:['ignore', 'pipe', 'ignore']}).toString(); } catch(e){}
    if (Xphp !== 'ok' || !Xold) console.log('  (stream X server tests skipped: php CLI with pdo_sqlite + openssl or git history not available)');
    else {
      const XR = Xpath.resolve(__dirname, 'shots', 'srvx'), XDp = Xpath.join(XR, 'studio-de'), XSP = Xpath.join(XDp, 'server-php');
      Xcp.execFileSync('python3', [Xpath.resolve(__dirname, '..', 'tools', 'build_deploy.py'), XDp, '--studio-name', 'Studio Ubicazioni']);
      ['config.php', 'setup.php.disabled'].forEach(f => { const x = Xpath.join(XSP, f); if (fs.existsSync(x)) fs.renameSync(x, x + '.prev-run'); });
      const Xnew = fs.readFileSync(Xpath.join(XSP, 'api.php'));
      fs.writeFileSync(Xpath.join(XSP, 'api.php'), Xold);   // start with the v10.1 server
      const XDATA = Xpath.resolve(__dirname, 'shots', 'srvx-data', String(Date.now()));
      const XPORT = 18900 + (process.pid % 500), XO = 'http://127.0.0.1:' + XPORT, XAPI = XO + '/studio-de/server-php/api.php';
      const Xsrv = Xcp.spawn('php', ['-S', '127.0.0.1:' + XPORT, '-t', XR, Xpath.resolve(__dirname, 'php-router.php')], {stdio:'ignore'});
      const Xsleep = (ms) => new Promise(r => setTimeout(r, ms));
      const Xq = async (route, o) => {
        o = o || {}; const h = {};
        if (o.token) h['X-DocMap-Token'] = o.token;
        if (o.body !== undefined) h['Content-Type'] = 'application/json';
        const r = await fetch(XAPI + '?r=' + route + (o.q ? '&' + new URLSearchParams(o.q).toString() : ''), {method:o.body !== undefined ? 'POST' : 'GET', headers:h, body:o.body === undefined ? undefined : JSON.stringify(o.body)});
        let j = null; try { j = await r.json(); } catch(e){}
        return {s:r.status, j};
      };
      let Xup = false; for (let i = 0; i < 50 && !Xup; i++){ try { Xup = (await Xq('ping')).s === 200; } catch(e){ await Xsleep(100); } }
      try {
        fs.mkdirSync(XDATA, {recursive:true});
        const r = await fetch(XO + '/studio-de/server-php/setup.php', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
          body:new URLSearchParams({data_dir:XDATA, users:'dave,admin\nmario,editor\nlucia,viewer', allow_file:'1', studio_name:'Studio Ubicazioni'}).toString()});
        const XT = {}; for (const m of (await r.text()).matchAll(/data-user="([^"]+)" data-role="([^"]+)"><td>[^<]*<\/td><td>[^<]*<\/td><td class="tok">([^<]+)</g)) XT[m[1]] = m[3];
        // v10.1 server: binders pushed by a v10.1 client
        const Xb = (id, code, sc, extra) => ({type:'binder', id, updated_at:'2026-10-20T10:00:00.000Z', data:Object.assign({id, speaking_code:code, company_name:'Server ' + code + ' Srl', category:'IVA', short_code:sc, short_url:'https://qr7.it/' + sc, room_code:'B', cabinet_code:'2', shelf_code:'γ', location_code:'B2-γ', contents_items:[], created_at:'2026-10-01T08:00:00.000Z', updated_at:'2026-10-20T10:00:00.000Z'}, extra || {})});
        const XS = [1, 2, 3, 4].map(i => ({id:'x-srv-b' + i, code:'XS' + i, sc:'dm26XsrvBnd' + i}));
        Xv = await Xq('push', {token:XT.mario, body:{records:XS.map(x => Xb(x.id, x.code, x.sc)), tombstones:[], deviceId:'dev-v101', operator:'v10.1'}});
        Xv2 = await Xq('pull', {token:XT.lucia, q:{since:0}});
        const Xbefore = JSON.stringify((Xv2.j.records || []).map(x => [x.id, x.updated_at, x.data.location_code]).sort());
        ok(Xup && XT.dave && XT.mario && Xv.s === 200 && (Xv2.j.records || []).length === 4, 'X: v10.1 api.php (git 68ae170) running with 4 binders from a v10.1 client', {s:Xv.s, n:(Xv2.j.records || []).length});
        fs.writeFileSync(Xpath.join(XSP, 'api.php'), Xnew);   // upgrade: same data dir, same config.php
        Xv = await Xq('pull', {token:XT.lucia, q:{since:0}});
        Xv2 = await Xq('patch', {token:XT.mario, body:{id:'x-srv-b1', patch:{archive_state:'CHECKED_OUT'}, base_updated_at:'2026-10-20T10:00:00.000Z', log:{id:'x-log-v101', who:'Tel v10.1', action:'binder.edit', source:'mobile', summary:'v10.1 phone'}}});
        ok(Xv.s === 200 && JSON.stringify((Xv.j.records || []).map(x => [x.id, x.updated_at, x.data.location_code]).sort()) === Xbefore && Xv2.s === 200 && Xv2.j.binder.archive_state === 'CHECKED_OUT',
          'X: after switching to the v11 api.php the same data dir serves the v10.1 records unchanged and a v10.1 phone patch still works', {s:Xv.s, p:Xv2.s});
        // desktop A: build a small tree and sync it to the server
        const XA = await b.newContext({viewport:{width:1366, height:768}}), XAp = await XA.newPage();
        XAp.on('pageerror', e => errs.push('XA PAGEERR ' + e.message)); XAp.on('dialog', d => d.accept());
        await XAp.goto(URL_); await XAp.evaluate(([url, tok]) => { localStorage.clear(); localStorage.setItem('docmap_v26_srv', JSON.stringify({url, token:tok, basic:''})); }, [XAPI, XT.dave]);
        await XAp.reload(); await XAp.waitForTimeout(1500);
        const XBox = await XAp.evaluate(() => { S.onboarded = true; while (topModal()) closeModal(true); S.settings.operator = 'Dave PC';
          locBulkCreate('', [{n:1, prefix:'MAG'}, {n:1, prefix:'A'}, {n:1, prefix:'S'}, {n:1, prefix:'R'}, {n:3, prefix:'B', pad:2}]); commit();
          return S.locations.filter(l => !locChildren(l.id).length).sort((a, b) => naturalCmp(a.code, b.code)).map(l => ({id:l.id, code:l.code, sc:l.short_code})); });
        Xv = await XAp.evaluate(async () => { const r = await srvSync({}); return {r, n:S.binders.length, xs:S.binders.filter(b => /^XS/.test(b.speaking_code)).length}; });
        Xv2 = await Xq('pull', {token:XT.lucia, q:{since:0}});
        const XlocRecs = (Xv2.j.records || []).filter(x => x.type === 'location');
        ok(Xv.xs === 4 && XlocRecs.length === 7 && XlocRecs.some(x => x.data.code === 'MAG1-A1-S1-R1-B01' && x.data.short_code === XBox[0].sc), 'X: desktop "Sincronizza con il server" pushes the locations (record type location) and pulls the server binders', {r:Xv, n:XlocRecs.length});
        Xv = [await Xq('resolve', {token:XT.lucia, q:{qr:XBox[0].sc}}), await Xq('resolve', {token:XT.lucia, q:{qr:XS[0].sc}}), await Xq('location', {token:XT.lucia, q:{qr:XBox[0].sc}}), await Xq('location', {token:XT.lucia, q:{qr:'dm26LNoNoNoNo'}})];
        ok(Xv[0].j.type === 'location' && Xv[0].j.location.code === 'MAG1-A1-S1-R1-B01' && Xv[0].j.path.length === 4 && Xv[1].j.type === 'binder' && Xv[1].j.binder.speaking_code === 'XS1' && Xv[2].s === 200 && Xv[2].j.count === 0 && Xv[3].s === 404,
          'X: API routes resolve (location vs binder by short-code format) and location (path, children, binders, count)', Xv.map(x => x.s));
        Xv = [await Xq('patch', {token:XT.mario, body:{id:'x-srv-b2', patch:{location_code:'FINTO'}, base_updated_at:'', force:true}}), await Xq('patch', {token:XT.mario, body:{id:'x-srv-b2', patch:{location_id:'non-esiste'}, base_updated_at:'', force:true}})];
        ok(Xv[0].s === 422 && Xv[1].s === 422, 'X: patch refuses location_code without location_id and an unknown location_id (422)', Xv.map(x => x.s + ' ' + (x.j && x.j.error && x.j.error.code)));

        // phone (editor): open the box QR, start association, open 3 binder QRs, switch box, open a 4th
        const XP = await b.newContext({viewport:{width:390, height:844}, isMobile:true}), XPp = await XP.newPage();
        XPp.on('pageerror', e => errs.push('XP PAGEERR ' + e.message));
        XPp.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('XP CONSOLE ' + m.text()); });
        const Xgo = async (sc) => { await XPp.goto(XO + '/studio-de/scan.html?lang=it&q=' + sc); await XPp.waitForTimeout(900); };
        await Xgo(XBox[0].sc);
        await XPp.fill('#sc-user', 'mario.tel'); await XPp.fill('#sc-pin', '1357'); await XPp.fill('#sc-pin2', '1357'); await XPp.fill('#sc-token', XT.mario); await XPp.click('#sc-enter'); await XPp.waitForTimeout(2500);
        Xv = await XPp.evaluate(() => ({view:SC.view, code:(document.getElementById('sa-code') || {}).textContent, start:!!document.getElementById('sa-start'), path:(document.getElementById('sa-path') || {}).innerText || '', w:document.documentElement.scrollWidth <= innerWidth + 1}));
        await XPp.screenshot({path:'shots/x_phone_loc.png'});
        ok(Xv.view === 'location' && Xv.code === 'MAG1-A1-S1-R1-B01' && Xv.start && /MAG1/.test(Xv.path) && Xv.w, 'X: phone: a location QR shows the box (code, path) with "Avvia associazione qui" for an editor', Xv);
        await XPp.click('#sa-start'); await XPp.waitForTimeout(150);
        Xv = await XPp.evaluate(() => ({banner:!!document.getElementById('sa-banner'), st:JSON.parse(localStorage.getItem('docmap_v26_assoc') || 'null')}));
        ok(Xv.banner && Xv.st && Xv.st.box.code === 'MAG1-A1-S1-R1-B01' && Xv.st.user === 'mario.tel', 'X: phone: association mode on (banner, state stored on this device)', Xv);
        const Xph = [];
        for (const x of XS.slice(0, 3)){ await Xgo(x.sc); Xph.push(await XPp.evaluate(() => ({view:SC.view, lid:SC.rec && SC.rec.binder.location_id, msg:(document.getElementById('sa-msg') || {}).innerText || '', loc:(document.getElementById('sc-loc') || {}).textContent, banner:!!document.getElementById('sa-banner')}))); }
        await XPp.screenshot({path:'shots/x_phone_card.png'});
        ok(Xph.every((x, i) => x.view === 'card' && x.lid === XBox[0].id && x.msg.includes('XS' + (i + 1)) && x.loc === 'MAG1-A1-S1-R1-B01' && x.banner), 'X: phone: each binder QR opened while active is put in the box at once (card shows the new "Dov\'è?")', Xph);
        await Xgo(XBox[1].sc);
        Xv = await XPp.evaluate(() => ({view:SC.view, box:SA.st && SA.st.box.code, msg:(document.getElementById('sa-msg') || {}).innerText || ''}));
        await Xgo(XS[3].sc);
        Xv2 = await XPp.evaluate(() => ({lid:SC.rec.binder.location_id, msg:(document.getElementById('sa-msg') || {}).innerText || ''}));
        ok(Xv.view === 'location' && Xv.box === 'MAG1-A1-S1-R1-B02' && /B02/.test(Xv.msg) && Xv2.lid === XBox[1].id && /XS4/.test(Xv2.msg), 'X: phone: another box QR switches the active box; the next binder goes there', {Xv, Xv2});
        Xv = await Promise.all(XS.map(x => Xq('binder', {token:XT.lucia, q:{qr:x.sc}})));
        Xv2 = await Xq('pull', {token:XT.lucia, q:{since:0, log_since:0}});
        const Xlogs = (Xv2.j.activity_log || []).filter(e => e.action === 'binder.locate');
        ok(Xv.slice(0, 3).every(x => x.j.binder.location_id === XBox[0].id && x.j.binder.location_code === 'MAG1-A1-S1-R1-B01' && x.j.binder.room_code === 'B') && Xv[3].j.binder.location_id === XBox[1].id && Xv[3].j.binder.location_code === 'MAG1-A1-S1-R1-B02',
          'X: server records: the 4 binders carry location_id + location_code of their box (room fields untouched)', Xv.map(x => x.j.binder.location_code));
        ok(Xlogs.length === 4 && Xlogs.every(e => e.source === 'mobile' && e.details.via === 'phone' && e.details.to.id && e.details.device && e.details.user === 'mario.tel') && Xlogs.some(e => e.details.to.code === 'MAG1-A1-S1-R1-B02'),
          'X: server activity log: one binder.locate per assignment (via phone, device, user, from → to)', Xlogs.map(e => e.details && e.details.to && e.details.to.code));
        // undo on the phone, reopening the same QR does not put it back
        await XPp.click('#sa-undo'); await XPp.waitForTimeout(700);
        Xv = await Xq('binder', {token:XT.lucia, q:{qr:XS[3].sc}});
        await Xgo(XS[3].sc);
        Xv2 = await Xq('binder', {token:XT.lucia, q:{qr:XS[3].sc}});
        ok(Xv.j.binder.location_id === '' && Xv.j.binder.location_code === 'B2-γ' && Xv2.j.binder.location_id === '', 'X: phone: "Annulla" sends the binder back (position text restored) and reopening its QR does not re-assign it', {a:Xv.j.binder.location_code, b:Xv2.j.binder.location_id});
        // in-page sequence scanner (typed / keyboard input: same handler as the camera)
        await XPp.click('#sa-seq'); await XPp.waitForTimeout(150);
        const Xtype = async (txt) => { await XPp.fill('#sa-typed', txt); await XPp.press('#sa-typed', 'Enter'); await XPp.waitForTimeout(700); return XPp.evaluate(() => ({view:SC.view, box:SA.st && SA.st.box.code, msg:(document.getElementById('sa-msg') || {}).innerText || '', list:(document.getElementById('sa-seq-list') || {}).innerText || ''})); };
        Xv = [await Xtype('https://qr7.it/' + XBox[2].sc), await Xtype('https://qr7.it/' + XS[3].sc), await Xtype('https://qr7.it/' + XS[3].sc)];
        await XPp.screenshot({path:'shots/x_phone_seq.png'});
        Xv2 = await Xq('binder', {token:XT.lucia, q:{qr:XS[3].sc}});
        ok(Xv[0].view === 'seq' && Xv[0].box === 'MAG1-A1-S1-R1-B03' && /XS4/.test(Xv[1].msg) && /Già registrato/.test(Xv[2].msg) && /B03/.test(Xv[2].list) && /1 faldone/.test(Xv[2].list) && Xv2.j.binder.location_id === XBox[2].id,
          'X: phone "Scansiona in sequenza": box QR switches, binder QR assigns, the same binder again is detected, running list per box', Xv);
        await Xgo(XBox[0].sc);
        Xv = await XPp.evaluate(() => ({n:(document.getElementById('sa-count') || {}).textContent, list:(document.getElementById('sa-binders') || {}).innerText || ''}));
        ok(Xv.n === '3 faldoni' && /XS1/.test(Xv.list) && /XS3/.test(Xv.list) && !/XS4/.test(Xv.list), 'X: phone: the location page lists the binders in the box', Xv);
        await XPp.click('#sa-stop'); await XPp.waitForTimeout(100);
        await Xgo(XS[0].sc);
        Xv = await XPp.evaluate(() => ({st:localStorage.getItem('docmap_v26_assoc'), banner:!!document.getElementById('sa-banner'), view:SC.view}));
        // expiry after 30 minutes without scans
        await XPp.evaluate((bx) => localStorage.setItem('docmap_v26_assoc', JSON.stringify({v:1, user:'mario.tel', box:{id:bx.id, code:bx.code, title:'', path:'', short_code:bx.sc}, at:Date.now() - 31 * 60000, n:0, list:[]})), XBox[1]);
        await Xgo(XS[0].sc);
        Xv2 = await XPp.evaluate(() => ({st:localStorage.getItem('docmap_v26_assoc'), lid:SC.rec.binder.location_id, txt:document.getElementById('app').innerText}));
        ok(Xv.st === null && !Xv.banner && Xv.view === 'card' && Xv2.st === null && Xv2.lid === XBox[0].id && /scaduta/.test(Xv2.txt), 'X: phone: Stop ends association mode; it also expires after 30 minutes without scans', {Xv, lid:Xv2.lid, st:Xv2.st});
        await XP.close();

        // desktop A syncs the phone work; desktop B (second app page) gets the tree; rename + delete travel back
        Xv = await XAp.evaluate(async (bx) => { await srvSync({}); const g = (c) => S.binders.find(b => b.speaking_code === c);
          return {x1:g('XS1').location_id === bx[0].id && g('XS1').location_code === 'MAG1-A1-S1-R1-B01', x4:g('XS4').location_code, log:LOG.entries.some(e => e.action === 'binder.locate' && e.source === 'mobile')}; }, XBox);
        ok(Xv.x1 && Xv.x4 === 'MAG1-A1-S1-R1-B03' && Xv.log, 'X: desktop sync receives the phone assignments (location_id, derived location_code, mobile log lines)', Xv);
        const XB2 = await b.newContext({viewport:{width:1366, height:768}}), XB2p = await XB2.newPage();
        XB2p.on('pageerror', e => errs.push('XB PAGEERR ' + e.message)); XB2p.on('dialog', d => d.accept());
        await XB2p.goto(URL_); await XB2p.evaluate(([url, tok]) => { localStorage.clear(); localStorage.setItem('docmap_v26_srv', JSON.stringify({url, token:tok, basic:''})); }, [XAPI, XT.dave]);
        await XB2p.reload(); await XB2p.waitForTimeout(1500);
        Xv = await XB2p.evaluate(async () => { S.onboarded = true; while (topModal()) closeModal(true); await srvSync({});
          return {n:S.locations.length, codes:S.locations.map(l => l.code).sort(naturalCmp).join(','), x1:(S.binders.find(b => b.speaking_code === 'XS1') || {}).location_code}; });
        ok(Xv.n === 7 && /MAG1-A1-S1-R1-B03/.test(Xv.codes) && Xv.x1 === 'MAG1-A1-S1-R1-B01', 'X: a second app page syncing with the server gets the whole location tree and the binder locations', Xv);
        await XB2p.evaluate(async (bx) => { locSaveFields(bx[0].id, {seg:'B10', name:'Scatola rinominata'}); locAfterChange(); commit(); LUI.sel = bx[2].id; S.view = 'info'; S.infoTab = 'loc'; renderAll(); }, XBox);
        await XB2p.click('#lo-del'); await XB2p.click('.modal-f .btn-danger-solid'); await XB2p.waitForTimeout(100);
        Xv = await XB2p.evaluate(async () => { const r = await srvSync({}); return {r, n:S.locations.length}; });
        Xv2 = await XAp.evaluate(async (bx) => { await srvSync({}); const g = (c) => S.binders.find(b => b.speaking_code === c);
          return {code:(locById(bx[0].id) || {}).code, name:(locById(bx[0].id) || {}).name, gone:!locById(bx[2].id), n:S.locations.length, x1:g('XS1').location_code, x4:g('XS4').location_id + '|' + g('XS4').location_code, tomb:(S.tombstones || []).some(t => t.type === 'location' && t.id === bx[2].id)}; }, XBox);
        ok(Xv.n === 6 && Xv2.code === 'MAG1-A1-S1-R1-B10' && Xv2.name === 'Scatola rinominata' && Xv2.x1 === 'MAG1-A1-S1-R1-B10' && Xv2.gone && Xv2.n === 6 && Xv2.x4 === '|B2-γ' && Xv2.tomb,
          'X: rename and delete of a location travel between the two app pages through the server (binder codes follow, tombstone)', {Xv, Xv2});
        Xv = await Xq('pull', {token:XT.lucia, q:{since:0}});
        ok((Xv.j.tombstones || []).some(t => t.type === 'location' && t.id === XBox[2].id) && (Xv.j.records || []).some(x => x.type === 'location' && x.data.code === 'MAG1-A1-S1-R1-B10'), 'X: the server keeps the location tombstone and the renamed record', {t:(Xv.j.tombstones || []).length});
        await XB2.close(); await XA.close();
      } finally {
        Xsrv.kill();
      }
    }
  }
  // @@STREAM-J@@
  sec('v11 J: push / sync journal, multi-client convergence, v10.1 server upgrade');
  {
    const Jcp = require('child_process'), Jpath = require('path'), Jcrypto = require('crypto');
    const APP_VERSION_J = await p.evaluate(() => APP_VERSION);
    let Jphp = ''; try { Jphp = Jcp.execFileSync('php', ['-r', 'echo extension_loaded("pdo_sqlite") && extension_loaded("openssl") ? "ok" : "no";']).toString(); } catch(e){}
    // ---- local state: a v10.1 state (no syncJournal) loads, the field is added with its default ----
    let Jv, Jv2, Jv3;
    Jv = await p.evaluate(() => { const o = migrate({schema:26.9, settings:{deviceId:'dev-old'}, binders:[{id:'jm1', speaking_code:'JM1', updated_at:'2026-10-01T08:00:00.000Z'}], sync:{peers:{}, history:[]}});
      return {j:Array.isArray(o.syncJournal) && o.syncJournal.length === 0, b:o.binders.length, u:o.binders[0].updated_at, keep:migrate({syncJournal:[{id:'jr-1', at:'2026-11-01T08:00:00.000Z'}, null]}).syncJournal.length}; });
    ok(Jv.j && Jv.b === 1 && Jv.u === '2026-10-01T08:00:00.000Z' && Jv.keep === 1, 'J: a v10.1 state without syncJournal loads unchanged and gets syncJournal = [] (migrate, additive)', Jv);
    Jv = await p.evaluate(async () => {
      const r = {b:'x', n:2.5, t:true, z:null, e:{}, l:[1, 'a'], o:{b:1, a:' '}, _p:1, updated_at:'x', short_url:'u', id:'k'};
      const ci = jrClientInfo(); return {canon:jrJson(jrCanon(r, true)), info:{app:ci.app, name:typeof ci.name}, dev:ci.id === syncDeviceId()};
    });
    ok(Jv.canon === '{"b":"x","e":[],"id":"k","l":["1","a"],"n":"2.5","o":{"a":"\\u2028","b":"1"},"t":"true","z":""}' && Jv.dev && Jv.info.app === APP_VERSION_J && Jv.info.name === 'string', 'J: canonical JSON mirrors api.php canon() (sorted keys, scalars as strings, {} → [], meta / _ keys out, U+2028 escaped); client identity {id, name, app}', Jv);

    if (Jphp !== 'ok') console.log('  (stream J server part skipped: php CLI with pdo_sqlite + openssl not installed)');
    else {
      const JR_ = Jpath.resolve(__dirname, 'shots', 'jsrv'), JDp = Jpath.join(JR_, 'studio-de'), JSP = Jpath.join(JDp, 'server-php');
      Jcp.execFileSync('python3', [Jpath.resolve(__dirname, '..', 'tools', 'build_deploy.py'), JDp, '--studio-name', 'Studio Registro Prova']);
      const JDATA = Jpath.resolve(__dirname, 'shots', 'jsrv-data', String(Date.now())); fs.mkdirSync(JDATA, {recursive:true});
      const JT = {dave:'jtok-admin-' + Jcrypto.randomBytes(9).toString('hex'), mario:'jtok-ed-' + Jcrypto.randomBytes(9).toString('hex'), anna:'jtok-ed2-' + Jcrypto.randomBytes(9).toString('hex'), lucia:'jtok-v-' + Jcrypto.randomBytes(9).toString('hex')};
      const sha = (s) => Jcrypto.createHash('sha256').update(s).digest('hex');
      const Jcfg = (extra) => "<?php\nif (!defined('DOCMAP_API')) { http_response_code(404); exit; }\nreturn ['data_dir' => " + JSON.stringify(JDATA) + ", 'aes_key' => '" + Jcrypto.randomBytes(32).toString('base64') + "',\n  'tokens' => [" +
        [['dave', 'admin'], ['mario', 'editor'], ['anna', 'editor'], ['lucia', 'viewer']].map(([u, r]) => "['user' => '" + u + "', 'role' => '" + r + "', 'token_sha256' => '" + sha(JT[u]) + "']").join(', ') + "],\n  'allowed_origins' => ['null'], 'max_fails' => 50, 'studio_name' => 'Studio Registro Prova'" + (extra || '') + "];\n";
      const JcfgText = Jcfg();
      fs.writeFileSync(Jpath.join(JSP, 'config.php'), JcfgText);
      // the v10.1 API first (same data folder, same key): the data the user has today
      fs.writeFileSync(Jpath.join(JSP, 'api.php'), Jcp.execFileSync('git', ['show', '68ae170:docmapv1/server-php/api.php'], {cwd:Jpath.resolve(__dirname, '..')}));
      const JPORT = 18850 + (process.pid % 300), JO = 'http://127.0.0.1:' + JPORT, JAPI = JO + '/studio-de/server-php/api.php';
      const Jsrv = Jcp.spawn('php', ['-S', '127.0.0.1:' + JPORT, '-t', JR_, Jpath.resolve(__dirname, 'php-router.php')], {stdio:'ignore'});
      const Jsleep = (ms) => new Promise(r => setTimeout(r, ms));
      const Jq = async (route, o) => {
        o = o || {}; const h = Object.assign({}, o.headers || {});
        if (o.token) h['X-DocMap-Token'] = o.token;
        if (o.body !== undefined) h['Content-Type'] = 'application/json';
        const r = await fetch(JAPI + '?r=' + route + (o.q ? '&' + new URLSearchParams(o.q).toString() : ''), {method:o.body !== undefined ? 'POST' : 'GET', headers:h, body:o.body === undefined ? undefined : JSON.stringify(o.body)});
        let j = null; try { j = await r.json(); } catch(e){}
        return {s:r.status, j};
      };
      const Jsql = (q) => JSON.parse(Jcp.execFileSync('python3', ['-c', 'import sqlite3,json,sys; c=sqlite3.connect(sys.argv[1]); print(json.dumps([list(r) for r in c.execute(sys.argv[2])]))', Jpath.join(JDATA, 'docmap.sqlite'), q]).toString());
      let Jup = false; for (let i = 0; i < 50 && !Jup; i++){ try { Jup = (await Jq('ping')).s === 200; } catch(e){ await Jsleep(100); } }
      const Jctxs = [];
      try {
        // ---- 1. v10.1 server with data (pushed by a v10.1 client: no device info) ----
        const JB = (id, code, at, x) => Object.assign({id, speaking_code:code, company_name:'Ornitorinco Riservato ' + code + ' Srl', category:'IVA', short_code:'dm26Jr' + code.slice(-3) + 'Qx', room_code:'R', cabinet_code:'7', shelf_code:'β',
          contents_items:[{year:'2025', description:'Fatture riservate', status:'archive'}], tags:'registro', created_at:'2026-10-01T08:00:00.000Z', updated_at:at}, x || {});
        const Jbase = [JB('j-x', 'JRX', '2026-10-10T09:00:00.000Z'), JB('j-y', 'JRY', '2026-10-11T09:00:00.000Z'), JB('j-z', 'JRZ', '2026-10-12T09:00:00.000Z'), JB('j-w', 'JRW', '2026-10-13T09:00:00.000Z')];
        const Jcl = {id:'j-c1', name:'Ornitorinco Riservato JRX Srl', multi_code:'J901', updated_at:'2026-10-09T09:00:00.000Z'};
        Jv = await Jq('push', {token:JT.mario, body:{records:Jbase.map(b => ({type:'binder', id:b.id, updated_at:b.updated_at, data:b})).concat([{type:'client', id:Jcl.id, updated_at:Jcl.updated_at, data:Jcl}]), tombstones:[{type:'binder', id:'j-gone', code:'JRG', deletedAt:'2026-10-05T10:00:00.000Z'}], deviceId:'dev-v101-pc', operator:'Dave'}});
        const Jv1 = await Jq('ping');
        ok(Jup && Jv.s === 200 && Jv.j.applied === 6 && Jv.j.journal_id === undefined && Jv1.j.schema === undefined && Jsql("SELECT v FROM meta WHERE k='schema'")[0][0] === '1', 'J: v10.1 API (git 68ae170) holds the data of today: schema 1, no journal', {push:Jv.j, ping:Jv1.j});
        // ---- 2. upgrade: replace ONLY api.php (config.php and the data folder stay) ----
        fs.copyFileSync(Jpath.resolve(__dirname, '..', 'server-php', 'api.php'), Jpath.join(JSP, 'api.php'));
        Jv = await Jq('pull', {token:JT.lucia, q:{since:0}});
        const Jtables = Jsql("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(r => r[0]);
        ok(Jv.s === 200 && Jv.j.records.length === 5 && Jv.j.tombstones.length === 1 && Jv.j.records.find(r => r.id === 'j-z').updated_at === '2026-10-12T09:00:00.000Z' && Jv.j.records.find(r => r.id === 'j-x').data.company_name === 'Ornitorinco Riservato JRX Srl' &&
          Jsql("SELECT v FROM meta WHERE k='schema'")[0][0] === '2' && Jtables.includes('sync_journal') && Jtables.includes('sync_journal_items') && Jtables.includes('records') && Jtables.includes('tokens') && (await Jq('ping')).j.schema === 2,
          'J: the new api.php upgrades the v10.1 database IN PLACE on the first request (schema 1 → 2, additive tables), every record / tombstone / time stamp kept', {n:Jv.j.records.length, t:Jtables});
        // a v10.1 client (no device info) keeps working: push + patch, journaled as device "unknown"
        Jv = await Jq('push', {token:JT.mario, body:{records:[{type:'binder', id:'j-old', updated_at:'2026-10-20T09:00:00.000Z', data:JB('j-old', 'JRO', '2026-10-20T09:00:00.000Z')}], tombstones:[], deviceId:'dev-v101-pc'}});
        Jv2 = await Jq('patch', {token:JT.mario, body:{id:'j-old', patch:{archive_state:'CHECKED_OUT'}, base_updated_at:'2026-10-20T09:00:00.000Z', log:{id:'j-v101-log', who:'Tel', action:'binder.edit', source:'mobile', summary:'v10.1'}}});
        Jv3 = await Jq('journal', {token:JT.dave, q:{record:'j-old'}});
        ok(Jv.s === 200 && Jv.j.applied === 1 && Jv2.s === 200 && Jv3.s === 200 && Jv3.j.items.length === 2 && Jv3.j.items.every(e => e.device.name === 'unknown' && e.device.app === 'unknown') && Jv3.j.items.some(e => e.route === 'push' && e.device.id === 'dev-v101-pc') && Jv3.j.items.some(e => e.route === 'patch' && e.records[0].action === 'update'),
          'J: a v10.1 client (no device headers) still pushes and patches; the journal records it as device "unknown" (push keeps its deviceId)', Jv3.j.items.map(e => [e.route, e.device]));

        // ---- 3. desktop A (v10.1 state of today, file://) and desktop B (new PC), both on the server ----
        const Jdesk = async (dev, label, token, state) => {
          const c = await b.newContext({viewport:{width:1366, height:768}, acceptDownloads:true}); Jctxs.push(c);
          const pg = await c.newPage(); pg.on('pageerror', e => errs.push('J ' + dev + ' PAGEERR ' + e.message)); pg.on('dialog', d => d.accept());
          pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('J ' + dev + ' CONSOLE ' + m.text()); });
          await pg.goto(URL_);
          await pg.evaluate(([st, d, url, tok]) => { localStorage.clear(); localStorage.setItem('docmap_v26_state', JSON.stringify(st)); localStorage.setItem('docmap_v26_device', d); localStorage.setItem('docmap_v26_srv', JSON.stringify({url, token:tok, basic:''})); }, [state, dev, JAPI, token]);
          await pg.reload(); await pg.waitForTimeout(1200);
          await pg.evaluate(() => { while (topModal()) closeModal(true); window.__jB = (c) => S.binders.find(x => x.speaking_code === c); window.__jW = (ms) => new Promise(r => setTimeout(r, ms || 15)); window.__jLast = () => S.syncJournal[S.syncJournal.length - 1]; });
          return pg;
        };
        const Jv101 = {schema:26.9, lang:'it', view:'archive', onboarded:true, hasUnexportedChanges:false, settings:{studioName:'Studio Registro Prova', operator:'Dave', colorMode:'category', deviceId:'dev-A', deviceLabel:'PC Ufficio A'},
          binders:Jbase.map(x => JSON.parse(JSON.stringify(x))), clients:[Object.assign({}, Jcl)], tombstones:[{type:'binder', id:'j-gone', code:'JRG', deletedAt:'2026-10-05T10:00:00.000Z', who:'Dave'}], sync:{peers:{}, lastExportAt:null, lastImportAt:null, lastPeer:'', history:[]}};
        const A = await Jdesk('dev-A', 'PC Ufficio A', JT.dave, Jv101);
        const B = await Jdesk('dev-B', 'PC Ufficio B', JT.mario, {schema:26.9, lang:'it', onboarded:true, settings:{operator:'Mario', deviceLabel:'PC Ufficio B', colorMode:'category'}, binders:[], clients:[]});
        Jv = await A.evaluate(() => ({n:S.binders.length, j:Array.isArray(S.syncJournal) && S.syncJournal.length === 0, u:__jB('JRZ').updated_at, label:jrClientInfo().name}));
        ok(Jv.n === 4 && Jv.j && Jv.u === '2026-10-12T09:00:00.000Z' && Jv.label === 'PC Ufficio A', 'J: desktop A opens its v10.1 state unchanged (4 binders, timestamps), empty local journal, device name "PC Ufficio A"', Jv);
        const Jsync = (pg, o) => pg.evaluate(async (oo) => { const r = await srvSync(oo || {}); await JR.last; return r; }, o || {});
        Jv = [await Jsync(A), await Jsync(B)];
        Jv2 = await B.evaluate(() => ({n:S.binders.length, codes:S.binders.map(x => x.speaking_code).sort().join(','), e:__jLast()}));
        ok(!Jv[0].error && !Jv[1].error && Jv2.n === 5 && Jv2.codes === 'JRO,JRW,JRX,JRY,JRZ' && Jv2.e.kind === 'server' && Jv2.e.counts.received >= 5 && Jv2.e.items.filter(i => i.action === 'create').length >= 5 && Jv2.e.device.id === 'dev-B' && Jv2.e.server_journal.length >= 1,
          'J: first syncs: B receives everything; its local journal lists each record (create, took_remote) with the server journal ids', {r:Jv, e:Jv2.e && Jv2.e.counts});

        // ---- S1: A edits X offline, B edits X LATER but syncs EARLIER ----
        await A.evaluate(async () => { __jB('JRX').notes = 'A: prima modifica'; commit(); await __jW(25); });
        await B.evaluate(async () => { __jB('JRX').notes = 'B: modifica dopo'; commit(); });
        await Jsync(B); Jv = await Jsync(A);
        Jv2 = await A.evaluate(() => { const e = __jLast(), it = e.items.find(i => i.code === 'JRX'); return {notes:__jB('JRX').notes, it, kind:e.kind}; });
        Jv3 = await Jq('binder', {token:JT.lucia, q:{code:'JRX'}});
        ok(Jv2.notes === 'B: modifica dopo' && Jv3.j.binder.notes === 'B: modifica dopo' && Jv2.it && Jv2.it.action === 'conflict' && Jv2.it.reason === 'both' && Jv2.it.resolution === 'took_remote' && Jv2.it.how === 'auto' &&
          Jv2.it.fields.some(f => f[0] === 'notes' && f[1] === 'A: prima modifica' && f[2] === 'B: modifica dopo'),
          'J S1: X edited on A, later on B, B syncs first → most recent (B) wins everywhere; A\'s journal shows the conflict, the rule and both values', Jv2.it);
        // ---- S2: deletion vs edit, both orders ----
        await B.evaluate(async () => { __jB('JRZ').notes = 'B modifica Z'; commit(); });
        await Jsync(B);
        await A.evaluate(async () => { await __jW(25); S.binders = S.binders.filter(x => x.speaking_code !== 'JRZ'); commit(); });   // A had not seen B's edit: deletes later
        await Jsync(A); await Jsync(B);
        Jv = await A.evaluate(() => { const e = __jLast(); return {hasZ:!!__jB('JRZ'), inZ:e.items.find(i => i.code === 'JRZ' && i.dir === 'in'), outZ:e.items.find(i => i.code === 'JRZ' && i.dir === 'out')}; });
        Jv2 = await B.evaluate(() => ({hasZ:!!__jB('JRZ'), it:__jLast().items.find(i => i.code === 'JRZ')}));
        Jv3 = await Jq('binder', {token:JT.lucia, q:{code:'JRZ'}});
        ok(!Jv.hasZ && !Jv2.hasZ && Jv3.s === 404 && Jv.inZ && Jv.inZ.action === 'rejected-older' && Jv.outZ && Jv.outZ.action === 'sent-delete' && Jv.outZ.resolution === 'accepted' && Jv2.it && Jv2.it.action === 'delete' && Jv2.it.snapshot && Jv2.it.snapshot.notes === 'B modifica Z',
          'J S2a: B edits Z, A deletes it later → the deletion wins on A, server and B; journals: A "older, ignored" + "deletion sent/accepted", B "deleted" with a full copy of what was removed', {A:Jv, B:Jv2.it && Jv2.it.action});
        await A.evaluate(async () => { S.binders = S.binders.filter(x => x.speaking_code !== 'JRW'); commit(); });
        await Jsync(A);
        await B.evaluate(async () => { await __jW(25); __jB('JRW').notes = 'B la tiene'; commit(); });   // B had not pulled the deletion: edits later
        await Jsync(B); await Jsync(A);
        Jv = await A.evaluate(() => ({w:__jB('JRW') && __jB('JRW').notes, it:__jLast().items.find(i => i.code === 'JRW')}));
        Jv2 = await Jq('journal', {token:JT.dave, q:{code:'JRW', route:'push', device:'dev-B'}});
        ok(Jv.w === 'B la tiene' && Jv.it && Jv.it.action === 'conflict' && Jv.it.reason === 'deleted_local' && Jv.it.resolution === 'took_remote' && Jv2.j.items[0] && Jv2.j.items[0].records.some(r => r.code === 'JRW' && r.action === 'create' && r.reason === 'resurrect'),
          'J S2b: A deletes W, B edits it later → the edit wins (W back on A); server journal: B\'s push "create / resurrect" over the deletion', {A:Jv, srv:Jv2.j.items[0] && Jv2.j.items[0].records});

        // ---- phone (scan.html, web mode with the server): device name, save, conflict, forced ----
        const Pc = await b.newContext({viewport:{width:390, height:844}, isMobile:true}); Jctxs.push(Pc);
        const P = await Pc.newPage(); P.on('pageerror', e => errs.push('J phone PAGEERR ' + e.message));
        await P.goto(JO + '/studio-de/scan.html?q=dm26JrJRYQx'); await P.waitForTimeout(900);
        await P.fill('#sc-user', 'anna.tel'); await P.fill('#sc-pin', '8642'); await P.fill('#sc-pin2', '8642'); await P.fill('#sc-token', JT.anna); await P.click('#sc-enter'); await P.waitForTimeout(2200);
        ok(await P.evaluate(() => SC.view === 'card' && document.getElementById('sc-code').textContent === 'JRY' && !!document.getElementById('jr-ph-open')), 'J phone: scan.html (apiBase) shows the binder and the link "Le mie sincronizzazioni"');
        await P.click('#jr-ph-open'); await P.waitForTimeout(300);
        ok(await P.isVisible('#jr-ph-empty'), 'J phone: empty list before the first save');
        await P.fill('#jr-ph-name', 'Telefono Anna'); await P.click('[data-jr="ph-name"]'); await P.click('[data-jr="ph-back"]'); await P.waitForTimeout(400);
        await P.click('#sc-edit'); await P.fill('#sc-notes-in', 'dal telefono di Anna'); await P.click('#sc-save'); await P.waitForTimeout(900);
        Jv = await Jq('journal', {token:JT.dave, q:{code:'JRY', route:'patch'}});
        ok(Jv.j.items[0] && Jv.j.items[0].device.name === 'Telefono Anna' && /^dev-/.test(Jv.j.items[0].device.id) && Jv.j.items[0].device.app === APP_VERSION_J && Jv.j.items[0].user === 'anna' && Jv.j.items[0].records[0].action === 'update',
          'J phone: the save reaches the server journal with the phone\'s device id, name "Telefono Anna", app version and token user', Jv.j.items[0] && Jv.j.items[0].device);
        // A changes Y meanwhile; the phone saves from its stale card → 409 → conflict screen → "Salva comunque"
        await Jsync(A); await A.evaluate(async () => { __jB('JRY').tags = 'registro,da-A'; commit(); }); await Jsync(A);
        await P.click('#sc-edit'); await P.click('[data-s="state"][data-v="HISTORICAL"]'); await P.click('#sc-save'); await P.waitForTimeout(900);
        const Jconf = await P.isVisible('#sc-conflict');
        await P.click('[data-s="conflict-force"]'); await P.waitForTimeout(900);
        await P.click('#jr-ph-open'); await P.waitForTimeout(400);
        Jv = await P.evaluate(() => ({items:Array.from(document.querySelectorAll('#jr-ph-list .jr-ph-it')).map(li => li.querySelector('.jr-ph-st').className.replace(/.*jr-st-/, '') + ':' + li.querySelector('.jr-ph-code').textContent),
          w:document.documentElement.scrollWidth, vault:!!localStorage.getItem('docmap_v26_vault_journal'), plain:Object.keys(localStorage).some(k => /JRY/.test(localStorage.getItem(k) || ''))}));
        await P.screenshot({path:Jpath.join(__dirname, 'shots', 'j_phone_journal.png')});
        Jv2 = await Jq('journal', {token:JT.dave, q:{code:'JRY', route:'patch'}});
        ok(Jconf && Jv.items.join(',') === 'forced:JRY,conflict:JRY,ok:JRY' && Jv.w <= 390 && Jv.vault && !Jv.plain && Jv2.j.items.length === 3 && Jv2.j.items[1].records[0].action === 'conflict' && Jv2.j.items[1].records[0].reason === 'stale_base' && Jv2.j.items[0].records[0].reason === 'forced',
          'J phone: "Le mie sincronizzazioni" lists saved / refused (changed elsewhere) / saved anyway, encrypted in the vault, no horizontal scroll; the server journal has the refused attempt (stale_base) and the forced save', {ph:Jv, srv:Jv2.j.items.map(e => e.records[0].action + '/' + e.records[0].reason)});
        await Jsync(A); await Jsync(B);

        // ---- S4: clock skew within the warning (B is 90 s ahead) ----
        await B.evaluate(() => { window.__jOrigNow = nowISO; window.nowISO = () => new Date(Date.now() + 90000).toISOString(); });
        await B.evaluate(async () => { __jB('JRX').notes = 'B con orologio avanti'; commit(); });
        await Jsync(B); await Jsync(A);
        Jv = await A.evaluate(async () => { const before = __jB('JRX').updated_at; __jB('JRX').notes = 'A subito dopo'; commit(); const after = __jB('JRX').updated_at; const r = await srvSync({}); await JR.last; return {before, after, r, out:__jLast().items.find(i => i.code === 'JRX' && i.dir === 'out')}; });
        Jv2 = await Jq('binder', {token:JT.lucia, q:{code:'JRX'}});
        ok(Jv.after > Jv.before && Jv.out && Jv.out.resolution === 'accepted' && Jv2.j.binder.notes === 'A subito dopo',
          'J S4 (fix): an edit made on A right after pulling a version stamped by a clock 90 s ahead is stamped LATER than it (syNext) and is accepted, not lost', Jv);
        await B.evaluate(() => { window.nowISO = window.__jOrigNow; });
        await Jsync(B);

        // ---- S5 (fix): a record that reaches A from B by PACKAGE (old time stamp) is forwarded to the server ----
        await B.evaluate(async () => { __jB('JRY').notes = 'B offline, via pacchetto'; commit(); await __jW(30); });
        await A.evaluate(async () => { __jB('JRO').notes = 'A spinge dopo'; commit(); });
        await Jsync(A);   // A's lastPushAt is now later than B's edit of Y
        const JpkgB = await B.evaluate(async () => { const r = await syncExport({incremental:false}); return {text:r.text, name:r.name}; });
        Jv = await A.evaluate(async (pk) => { SYV.fileName = pk.name; const plan = syncAnalyze(await syncParse(pk.text)); syncApply(plan); await JR.last; const e = __jLast(); SYV.fileName = '';
          return {y:__jB('JRY').notes, e:{kind:e.kind, dir:e.dir, file:e.peer.file, sha:e.peer.sha256, it:e.items.find(i => i.code === 'JRY')}, pend:srvPending()}; }, JpkgB);
        await Jsync(A);
        Jv2 = await Jq('binder', {token:JT.lucia, q:{code:'JRY'}});
        ok(Jv.y === 'B offline, via pacchetto' && Jv.pend >= 1 && Jv2.j.binder.notes === 'B offline, via pacchetto' && Jv.e.kind === 'package' && Jv.e.dir === 'import' && Jv.e.file === JpkgB.name && Jv.e.sha === sha(JpkgB.text) && Jv.e.it.action === 'update',
          'J S5 (fix): B → A by package with an OLD time stamp, then A syncs: the record is forwarded to the server (recvAt); the journal names the package file and its SHA-256', {A:Jv, srv:Jv2.j.binder.notes});
        await Jsync(B);

        // ---- convergence: A, B, server (and the phone) hold the same data ----
        const Jcanon = (pg) => pg.evaluate(() => JSON.stringify({b:S.binders.slice().sort((x, y) => x.id < y.id ? -1 : 1).map(x => [x.id, x.updated_at, syncCanon(x, 'binder')]), c:(S.clients || []).slice().sort((x, y) => x.id < y.id ? -1 : 1).map(x => [x.id, syncCanon(x, 'client')]),
          t:(S.tombstones || []).map(x => x.type + ':' + x.id).sort()}));
        const JcA = await Jcanon(A), JcB = await Jcanon(B);
        Jv = await A.evaluate(async (api) => { const r = await srvClient(srvConf()).call('pull', {q:{since:0}});
          const srv = r.records.filter(x => x.type === 'binder').map(x => syncNormRemote(Object.assign({}, x.data, {id:x.id, updated_at:x.updated_at}), 'binder')).sort((x, y) => x.id < y.id ? -1 : 1).map(x => [x.id, x.updated_at, syncCanon(x, 'binder')]);
          const loc = S.binders.slice().sort((x, y) => x.id < y.id ? -1 : 1).map(x => [x.id, x.updated_at, syncCanon(x, 'binder')]);
          return {same:JSON.stringify(srv) === JSON.stringify(loc), n:srv.length, tomb:r.tombstones.map(x => x.id).sort().join(',')}; });
        await P.goto(JO + '/studio-de/scan.html?code=JRX'); await P.waitForTimeout(1200);
        Jv2 = await P.evaluate(() => SC.rec ? SC.rec.binder.notes : SC.view + ' ' + JSON.stringify(SC.msg));
        ok(JcA === JcB && Jv.same && Jv.n === 4 && /j-w/.test(JcA) && JSON.parse(JcA).b.every(x => x[0] !== 'j-z') && Jv.tomb.includes('j-z') && Jv2 === 'A subito dopo',
          'J: after all the asynchronous rounds A, B, the server and the phone converge on identical data (binders, clients, tombstones)', {same:JcA === JcB, srv:Jv, phone:Jv2});

        // ---- server journal API: roles, filters, entry detail, hashes ----
        const Jall = await Jq('journal', {token:JT.dave, q:{limit:200}}), Jmario = await Jq('journal', {token:JT.mario, q:{limit:200, user:'dave'}}), Jview = await Jq('journal', {token:JT.lucia});
        const Jdev = await Jq('journal', {token:JT.dave, q:{device:'dev-A', limit:200}}), Jfuture = await Jq('journal', {token:JT.dave, q:{from:'2099-01-01'}}), Jtoday = await Jq('journal', {token:JT.dave, q:{to:new Date().toISOString().slice(0, 10), limit:1}});
        ok(Jall.s === 200 && Jall.j.items.length > 10 && new Set(Jall.j.items.map(e => e.user)).size >= 3 && Jmario.s === 200 && Jmario.j.items.length > 0 && Jmario.j.items.every(e => e.user === 'mario') && Jview.s === 403 &&
          Jdev.j.items.length > 0 && Jdev.j.items.every(e => e.device.id === 'dev-A' && e.device.name === 'PC Ufficio A') && Jfuture.j.items.length === 0 && Jtoday.j.items.length === 1 && Jtoday.j.more === true && Jtoday.j.next_before > 0,
          'J: GET journal — admin sees every device, an editor only his own entries (user filter ignored), a viewer gets 403; filters device / date range / paging', {all:Jall.j.items.length, mario:Jmario.j.items.length, view:Jview.s, dev:Jdev.j.items.length});
        // the hash A computed for what it sent equals the server's new_hash for the same push
        Jv = await A.evaluate(() => { for (let i = S.syncJournal.length - 1; i >= 0; i--){ const e = S.syncJournal[i], it = e.items.find(x => x.code === 'JRX' && x.dir === 'out' && x.resolution === 'accepted'); if (it) return {hash:it.hash, jids:e.server_journal}; } return null; });
        Jv2 = null;
        for (const jid of (Jv && Jv.jids) || []){ const r = await Jq('journal', {token:JT.dave, q:{entry:jid}}); const it = r.j.items[0].records.find(x => x.code === 'JRX' && x.action === 'update'); if (it){ Jv2 = it; break; } }
        ok(Jv && Jv.hash && Jv2 && Jv2.new_hash === Jv.hash && Jv2.prev && Jv2.new && Jv2.new.notes === 'A subito dopo' && Jv2.prev.notes === 'B con orologio avanti',
          'J: entry detail (admin) returns the decrypted previous / new version; the SHA-256 computed by the client for what it sent equals the server\'s new_hash', {local:Jv && Jv.hash, srv:Jv2 && Jv2.new_hash});
        // encryption at rest: no names, device names or codes in the database files
        Jv = fs.readdirSync(JDATA).filter(f => /^docmap\.sqlite/.test(f)).map(f => fs.readFileSync(Jpath.join(JDATA, f)));
        ok(Jv.length >= 1 && Jv.every(buf => !buf.includes('Ornitorinco') && !buf.includes('PC Ufficio') && !buf.includes('Telefono Anna') && !buf.includes('dal telefono di Anna') && !buf.includes('"JRX"') && !buf.includes('speaking_code') && !buf.includes('anna.tel'))   /* quoted: 3 bare bytes can occur by chance in ciphertext */,
          'J: the journal is encrypted at rest (no names, device names, codes or notes in the SQLite file / WAL)', Jv.map(x => x.length));

        // ---- UI: Registro sincronizzazioni on A (admin): local + server, detail, server restore ----
        await A.evaluate(() => { S.view = 'sync'; renderAll(); document.getElementById('jr-card').scrollIntoView(); });
        await A.waitForTimeout(300);
        Jv = await A.evaluate(() => ({rows:document.querySelectorAll('#jr-tbl tbody tr').length, seg:document.querySelectorAll('#jr-src button').length, w:document.documentElement.scrollWidth}));
        await A.locator('#jr-card').screenshot({path:Jpath.join(__dirname, 'shots', 'j_card_local.png')});
        ok(Jv.rows >= 5 && Jv.seg === 2 && Jv.w <= 1366, 'J UI: ⚙ Sincronizzazione › "Registro sincronizzazioni" lists the local entries; admin sees the "Server" switch', Jv);
        await A.fill('#jr-f-code', 'JRW'); await A.waitForTimeout(400);
        Jv = await A.evaluate(() => document.querySelectorAll('#jr-tbl tbody tr').length);
        await A.fill('#jr-f-code', ''); await A.waitForTimeout(350);
        ok(Jv >= 1 && Jv < await A.evaluate(() => document.querySelectorAll('#jr-tbl tbody tr').length), 'J UI: the binder-code filter narrows the list', Jv);
        await A.click('#jr-src [data-v="srv"]'); await A.waitForFunction(() => !JR.srv.loading && JR.srv.loaded, null, {timeout:8000}).catch(() => {});
        await A.fill('#jr-f-code', 'JRX'); await A.waitForTimeout(250);
        await A.waitForFunction(() => !JR.srv.loading, null, {timeout:8000}).catch(() => {});
        Jv = await A.evaluate(() => ({n:JR.srv.items.length, rows:document.querySelectorAll('#jr-tbl tbody tr').length, txt:(document.getElementById('jr-tbl') || {}).innerText || ''}));
        await A.locator('#jr-card').screenshot({path:Jpath.join(__dirname, 'shots', 'j_card_server.png')});
        ok(Jv.n >= 3 && Jv.rows === Jv.n && /PC Ufficio B/.test(Jv.txt) && /PC Ufficio A/.test(Jv.txt), 'J UI: the server journal (admin) filtered by code shows entries of both PCs with device names', {n:Jv.n});
        // open the entry where B wrote "B con orologio avanti" and restore the version it overwrote
        const JidxB = await A.evaluate(() => JR.rows.findIndex(e => e.route === 'push' && e.device.id === 'dev-B' && e.records.some(r => r.code === 'JRX' && r.action === 'update')));
        await A.click('#jr-tbl tr[data-jrrow="' + JidxB + '"] [data-a="jr-detail"]'); await A.waitForTimeout(700);
        Jv = await A.evaluate(() => ({txt:document.getElementById('jr-detail').innerText, btn:!!document.querySelector('#jr-detail [data-a="jr-restore-srv"][data-v="prev"]')}));
        await A.locator('.overlay .modal').last().screenshot({path:Jpath.join(__dirname, 'shots', 'j_detail_server.png')});
        ok(/B con orologio avanti/.test(Jv.txt) && /PC Ufficio B/.test(Jv.txt) && Jv.btn, 'J UI: server entry detail shows device, field diff before / after and "Ripristina la versione precedente"', Jv.txt.slice(0, 200));
        const JprevNotes = await A.evaluate(() => { const it = JR.srvDetail.records.find(r => r.code === 'JRX' && r.action === 'update'); return it.prev.notes; });
        await A.click('#jr-detail [data-a="jr-restore-srv"][data-v="prev"]'); await A.waitForTimeout(300);
        await A.click('.modal-f .btn-primary'); await A.waitForTimeout(2500);
        while (await A.evaluate(() => !!topModal())) { await A.evaluate(() => closeModal(true)); }
        Jv = await Jq('binder', {token:JT.lucia, q:{code:'JRX'}});
        Jv2 = await Jq('journal', {token:JT.dave, q:{route:'journal_restore'}});
        Jv3 = await A.evaluate(() => ({notes:__jB('JRX').notes, log:LOG.entries.some(e => e.action === 'sync.restore')}));
        ok(Jv.j.binder.notes === JprevNotes && Jv2.j.items.length === 1 && Jv2.j.items[0].records[0].action === 'restore' && Jv2.j.items[0].extra.source.version === 'prev' && Jv3.notes === JprevNotes && Jv3.log,
          'J UI: "Ripristina" (admin, confirmed) writes that version again as a NEW change, journaled (journal_restore) and logged; A receives it at once', {srv:Jv.j.binder.notes, prev:JprevNotes, A:Jv3});
        await Jsync(B);
        ok(await B.evaluate(() => __jB('JRX').notes) === JprevNotes, 'J: B receives the restored version at its next sync (it is the newest write)');
        // local restore: the S1 conflict on A (took B's version) → restore A's own version
        await A.click('#jr-src [data-v="local"]'); await A.fill('#jr-f-code', 'JRX'); await A.waitForTimeout(400);
        const JidxL = await A.evaluate(() => JR.rows.findIndex(e => e.items.some(i => i.code === 'JRX' && i.action === 'conflict' && i.fields.some(f => f[1] === 'A: prima modifica'))));
        await A.click('#jr-tbl tr[data-jrrow="' + JidxL + '"] [data-a="jr-detail"]'); await A.waitForTimeout(300);
        await A.locator('.overlay .modal').last().screenshot({path:Jpath.join(__dirname, 'shots', 'j_detail_local.png')});
        await A.click('#jr-detail [data-a="jr-restore"]'); await A.waitForTimeout(200); await A.click('.modal-f .btn-primary'); await A.waitForTimeout(300);
        Jv = await A.evaluate(async () => { await JR.last; return {notes:__jB('JRX').notes, e:__jLast()}; });
        await Jsync(A); Jv2 = await Jq('binder', {token:JT.lucia, q:{code:'JRX'}});
        ok(Jv.notes === 'A: prima modifica' && Jv.e.kind === 'restore' && Jv.e.items[0].action === 'restore' && Jv2.j.binder.notes === 'A: prima modifica', 'J UI: local "Ripristina questa versione" brings back the version that lost the conflict, as a new change that also reaches the server', {A:Jv.notes, srv:Jv2.j.binder.notes});
        // exports for dispute evidence
        const [Jdl] = await Promise.all([A.waitForEvent('download'), A.click('[data-a="jr-csv"]')]);
        const Jcsv = fs.readFileSync(await Jdl.path(), 'utf8');
        const [Jdl2] = await Promise.all([A.waitForEvent('download'), A.click('[data-a="jr-json"]')]);
        const Jjson = JSON.parse(fs.readFileSync(await Jdl2.path(), 'utf8'));
        const Jlines = Jcsv.replace(/^﻿/, '').trim().split(/\r\n/);
        ok(Jdl.suggestedFilename().endsWith('.csv') && Jlines[0].split(';')[0] === 'source' && Jlines[0].split(';').length === 28 && Jlines.length > 2 && Jlines.slice(1).every(l => /^local;/.test(l)) && Jlines.some(l => /;JRX;/.test(l)) &&
          Jjson.format === 'docmap-sync-journal' && Jjson.entries.length >= 1 && Jjson.device.id === 'dev-A', 'J: export CSV (";" delimited, one row per record) and JSON of the filtered journal', {head:Jlines[0], n:Jlines.length});
        // backups carry the journal; a restored backup merges it back
        Jv = await A.evaluate(() => { const W = JSON.parse(workspaceJSON(true)), Ws = JSON.parse(workspaceJSON(false)); const n = S.syncJournal.length; const keep = clone(S.syncJournal); S.syncJournal = []; jrMerge(W.sync_journal); const ok2 = S.syncJournal.length === n; S.syncJournal = keep; return {inBackup:Array.isArray(W.sync_journal) && W.sync_journal.length === n, notInSession:!('sync_journal' in Ws), ok2}; });
        ok(Jv.inBackup && Jv.notInSession && Jv.ok2, 'J: JSON backups carry sync_journal (sessions do not); restoring merges it back by id', Jv);
        // the local SQLite schema is unchanged (journal lives in S only)
        ok(await A.evaluate(() => DB.ready && !dbQuery("SELECT name FROM sqlite_master WHERE name LIKE '%journal%'").length), 'J: local SQLite schema untouched by the journal (no table, version unchanged)');
      } finally {
        for (const c of Jctxs) { try { await c.close(); } catch(e){} }
        Jsrv.kill();
      }
    }

    // ---- local ⇄ local by package, two desktop pages, NO server: conflicts decided by hand ----
    const Jloc = async (dev) => { const c = await b.newContext({viewport:{width:1366, height:768}, acceptDownloads:true}); const pg = await c.newPage(); pg.on('pageerror', e => errs.push('J ' + dev + ' PAGEERR ' + e.message));
      await pg.goto(URL_); await pg.evaluate((d) => { localStorage.clear(); localStorage.setItem('docmap_v26_device', d); localStorage.setItem('docmap_v26_state', JSON.stringify({schema:26.9, onboarded:true, settings:{deviceLabel:'PC ' + d, operator:d}, binders:[], clients:[]})); }, dev);
      await pg.reload(); await pg.waitForTimeout(900); await pg.evaluate(() => { while (topModal()) closeModal(true); window.__jB = (c) => S.binders.find(x => x.speaking_code === c); window.__jLast = () => S.syncJournal[S.syncJournal.length - 1]; }); return {c, pg}; };
    const JC = await Jloc('dev-C'), JD = await Jloc('dev-D');
    try {
      await JC.pg.evaluate(() => { ['JLA', 'JLB'].forEach(c => S.binders.push(normalizeBinder({speaking_code:c, company_name:'Locale ' + c, short_code:newShortCode()}))); commit(); });
      const Jex = (pg, target) => pg.evaluate(async (tg) => { const r = await syncExport({incremental:!!tg, target:tg || ''}); await JR.last; return {text:r.text, name:r.name}; }, target || '');
      const Jim = (pg, pk, choose) => pg.evaluate(async ([pk, ch]) => { SYV.fileName = pk.name; const plan = syncAnalyze(await syncParse(pk.text)); syncOpenReview(plan);
        if (ch) plan.items.forEach((it, i) => { if (it.kind === 'conflict'){ const r = document.querySelector('[data-syc="' + i + '"][value="' + ch + '"]'); if (r){ r.checked = true; r.dispatchEvent(new Event('change', {bubbles:true})); } } });
        syncApplyFromReview(); await JR.last; return {counts:plan.counts, e:__jLast()}; }, [pk, choose || '']);
      let pk = await Jex(JC.pg); await Jim(JD.pg, pk);   // first exchange both ways: from now on each side knows the other (base for conflicts)
      pk = await Jex(JD.pg, 'dev-C'); await Jim(JC.pg, pk);
      await JC.pg.evaluate(() => { __jB('JLA').notes = 'C'; commit(); });
      await JD.pg.evaluate(async () => { await new Promise(r => setTimeout(r, 25)); __jB('JLA').notes = 'D (più recente)'; __jB('JLB').notes = 'solo D'; commit(); });
      pk = await Jex(JD.pg, 'dev-C');
      Jv = await Jim(JC.pg, pk, 'local');   // C keeps its own (older) version by hand
      const Jit = Jv.e.items.find(i => i.code === 'JLA');
      ok(Jv.counts.conflict === 1 && Jit.action === 'conflict' && Jit.how === 'manual' && Jit.resolution === 'kept_local' && Jv.e.items.find(i => i.code === 'JLB').action === 'update' && Jv.e.peer.file === pk.name && Jv.e.peer.sha256 === require('crypto').createHash('sha256').update(pk.text).digest('hex'),
        'J local⇄local: package D → C, conflict decided BY HAND (kept local): journal "manual", file name + SHA-256 of the package', {it:Jit, file:Jv.e.peer.file});
      pk = await Jex(JC.pg, 'dev-D'); Jv = await Jim(JD.pg, pk);
      const Jcc = await JC.pg.evaluate(() => JSON.stringify(S.binders.map(x => [x.id, x.updated_at, syncCanon(x, 'binder')]).sort())), Jdd = await JD.pg.evaluate(() => JSON.stringify(S.binders.map(x => [x.id, x.updated_at, syncCanon(x, 'binder')]).sort()));
      Jv2 = await JD.pg.evaluate(() => ({a:__jB('JLA').notes, kinds:S.syncJournal.map(e => e.kind + ':' + e.dir).join(',')}));
      ok(Jcc === Jdd && Jv2.a === 'C' && Jv2.kinds === 'package:import,package:export,package:export,package:import', 'J local⇄local: C\'s manual choice travels back (stamped later) and both PCs converge; D\'s journal lists import, export, export, import', Jv2);
    } finally { await JC.c.close(); await JD.c.close(); }
  }
  // @@STREAM-H@@
  sec('v11.1 H: knowledge base, contextual help, i18n completeness, Informazioni su DocMap, a11y');
  {
    let Hv;
    await p.evaluate(() => { guideStop(); while (topModal()) closeModal(true); helpClose(); S.lang = 'it'; HELP.q = ''; HELP.tag = ''; HELP.act = ''; S.view = 'archive'; renderAll(); });
    // ---- new topics: present, bilingual, tagged, findable
    Hv = await p.evaluate(() => { helpEnsure(); const ids = ['first-run', 'server', 'multi-device', 'upgrade', 'scanner', 'troubleshoot', 'about', 'journal'];
      return {miss:ids.filter(id => { const tp = helpTopic(id); return !tp || !(tp.body.it.length > 600 && tp.body.en.length > 600 && tp.title.it && tp.title.en) || tp.acts.some(a => !HELP_ACTS[a]) || tp.tags.some(g => !HELP_TAGS[g]); }),
        tags:['start', 'online'].every(k => HELP_TAGS[k] && HELP_TAGS[k].it && HELP_TAGS[k].en), online:HELP_TOPICS.filter(tp => tp.tags.includes('online')).map(tp => tp.id), start:HELP_TOPICS.filter(tp => tp.tags.includes('start')).map(tp => tp.id),
        rel:helpTopic('sync').related.includes('server') && helpTopic('info').related.includes('locations'), stale:/FastAPI|nessun server/.test(JSON.stringify(HELP_TOPICS.map(tp => tp.body.it)) + t('se_about')),
        nav:/Sincronizzazione/.test(helpTopic('nav').body.it) && /Ubicazioni/.test(helpTopic('info').body.it) && /Registro attività/.test(helpTopic('journal').body.it)}; });
    ok(!Hv.miss.length && Hv.tags && ['server', 'multi-device', 'troubleshoot', 'journal', 'sync', 'mobile'].every(x => Hv.online.includes(x)) && ['first-run', 'upgrade', 'create'].every(x => Hv.start.includes(x)) && Hv.rel && !Hv.stale && Hv.nav,
      'H help: new topics (primo avvio, server, più PC e telefoni, aggiornamento, lettore QR, risoluzione problemi, informazioni) IT+EN, tags "Primi passi" / "Online e sincronizzazione", stale texts fixed', Hv);
    Hv = await p.evaluate(() => { const r = (q) => { HELP.q = q; return helpList().map(x => x.id); }; const o = {};
      [['401', 'troubleshoot'], ['errore 429', 'troubleshoot'], ['non vedo i dati', 'troubleshoot'], ['fotocamera bloccata', 'troubleshoot'], ['pistola', 'scanner'], ['lettore barcode', 'scanner'], ['aggiornare versione', 'upgrade'],
       ['migrazione', 'upgrade'], ['collegare server', 'server'], ['token', 'server'], ['più pc', 'multi-device'], ['contestazione', 'journal'], ['primo avvio', 'first-run'], ['installazione', 'first-run'], ['dati per l\'assistenza', 'about']]
        .forEach(([q, id]) => { o[q] = r(q)[0] === id ? 1 : r(q).slice(0, 3); });
      S.lang = 'en'; [['upgrade', 'upgrade'], ['scan gun', 'scanner'], ['troubleshooting', 'troubleshoot'], ['connect server', 'server'], ['dispute', 'journal']].forEach(([q, id]) => { o['EN ' + q] = r(q)[0] === id ? 1 : r(q).slice(0, 3); });
      S.lang = 'it'; HELP.q = ''; return o; });
    ok(Object.values(Hv).every(x => x === 1), 'H help: the search finds the new topics first (synonyms + hidden keywords: 401, 429, pistola, migrazione, contestazione, scan gun…)', Hv);
    await p.click('[data-a="help-open"]'); await p.waitForTimeout(120);
    await p.click('#help-filters [data-a="help-tag"][data-t="online"]'); await p.waitForTimeout(80);
    Hv = await p.evaluate(() => ({ids:$$('#help-topics .help-item').map(b => b.dataset.id), g:$$('#help-guides .help-g').map(b => b.dataset.id), first:$$('#help-topics .help-item')[0].dataset.id}));
    await p.click('#help-filters [data-a="help-tag"][data-t=""]'); await p.waitForTimeout(80);
    Hv.top = await p.evaluate(() => $$('#help-topics .help-item').slice(0, 3).map(b => b.dataset.id).join());
    ok(['server', 'multi-device', 'troubleshoot', 'journal'].every(x => Hv.ids.includes(x)) && ['server', 'journal'].every(x => Hv.g.includes(x)) && Hv.first === 'troubleshoot' && Hv.top === 'create,print,client-new', 'H help: tag filter "Online e sincronizzazione" lists the online topics and tours by popularity; default order unchanged', Hv);
    await p.click('#help-topics [data-a="help-topic"][data-id="troubleshoot"]'); await p.waitForTimeout(100);
    Hv = await p.evaluate(() => ({dt:$$('.wiki .hx-faq dt').length, rel:$$('.help-body .help-item').map(b => b.dataset.id), use:helpUseCount('t:troubleshoot') > 0, w:[document.documentElement.scrollWidth, innerWidth]}));
    ok(Hv.dt >= 10 && Hv.rel.includes('upgrade') && Hv.use && Hv.w[0] <= Hv.w[1] + 1, 'H help: FAQ page (10+ questions), related topics, usage counted', Hv);
    await p.evaluate(() => helpClose());
    // ---- new tours exist and start on the right view (the G section runs every tour start → end)
    Hv = await p.evaluate(() => ['firstrun', 'server', 'journal'].map(id => { const g = GUIDES[id]; return g && g.steps.length >= 5 && g.steps.every(s => s.title.it && s.title.en && s.text.it && s.text.en) && guideViewAt(g, 1); }));
    ok(Hv.join() === 'settings,sync,sync' && await p.evaluate(() => helpTopic('server').guide === 'server' && helpTopic('journal').guide === 'journal' && helpTopic('first-run').guide === 'firstrun'), 'H tours: firstrun (Impostazioni → nome dispositivo), server, journal linked to their topics', Hv);
    // ---- contextual "?"
    const Hdot = async (sel) => { await p.click(sel); await p.waitForTimeout(80); const id = await p.evaluate(() => HELP.topic); await p.evaluate(() => helpClose()); return id; };
    await p.evaluate(() => { S.view = 'info'; S.infoTab = 'loc'; renderAll(); }); Hv = [await Hdot('.page-h .help-dot')];
    await p.evaluate(() => { S.infoTab = 'qr'; renderAll(); }); Hv.push(await Hdot('.page-h .help-dot'));
    await p.evaluate(() => { S.infoTab = 'tags'; renderAll(); }); Hv.push(await Hdot('.page-h .help-dot'));
    await p.evaluate(() => { S.view = 'sync'; renderAll(); }); Hv.push(await Hdot('.page-h .help-dot'), await Hdot('#srv-card .help-dot'), await Hdot('#jr-card .help-dot'));
    Hv.push(await p.evaluate(() => { const e = $('#jr-empty'); return e ? e.textContent : ''; }));
    await p.evaluate(() => { S.view = 'settings'; renderAll(); }); Hv.push(await Hdot('#hx-about .help-dot'));
    ok(Hv.slice(0, 6).join() === 'locations,qr-reprint,info,sync,server,journal' && (Hv[6] === '' || Hv[6] === await p.evaluate(() => t('hx_jr_empty')) || Hv[6] === await p.evaluate(() => t('jr_none'))) && Hv[7] === 'about',
      'H contextual help: "?" opens the topic of the Informazioni sub-tab (Ubicazioni, QR), Server online, Registro sincronizzazioni, Informazioni su DocMap', Hv);
    // ---- i18n completeness: every t('key') used by the scripts of a page exists in I18N.it and I18N.en
    const Hpath = require('path'), Hroot = Hpath.resolve(__dirname, '..');
    const Hkeys = (page) => { const m = new Map(); const files = [...fs.readFileSync(Hpath.join(Hroot, page), 'utf8').matchAll(/<script src="assets\/js\/([\w.-]+)"/g)].map(x => x[1]);
      for (const f of files){ const s = fs.readFileSync(Hpath.join(Hroot, 'assets', 'js', f), 'utf8'); for (const x of s.matchAll(/(?<![\w.$])t\(\s*'([A-Za-z0-9_.\-]+)'\s*[,)]/g)) if (!m.has(x[1])) m.set(x[1], f); }
      return {files, keys:[...m]}; };
    const HchkI18n = (pg, ks, skip) => pg.evaluate(([ks, skip]) => ({miss:ks.filter(([k]) => !new RegExp(skip).test(k) && (!(k in I18N.it) || !(k in I18N.en))).map(([k, f]) => k + '@' + f),
      onlyIt:Object.keys(I18N.it).filter(k => !(k in I18N.en)), onlyEn:Object.keys(I18N.en).filter(k => !(k in I18N.it))}), [ks, skip]);
    const HkI = Hkeys('index.html'), HkS = Hkeys('scan.html');
    // index.html: sa_ / sc_ keys belong to the phone-only code paths of 06i/11b (they run only when 11-scan.js is loaded)
    Hv = await HchkI18n(p, HkI.keys, '^(sa|sc)_');
    ok(HkI.keys.length > 1000 && HkI.files.includes('07b-helpx.js') && !Hv.miss.length && !Hv.onlyIt.length && !Hv.onlyEn.length, 'H i18n: index.html — every t(\'key\') used in its scripts exists in Italian and English (' + HkI.keys.length + ' keys)', Hv);
    const Hsp = await ctx.newPage(); Hsp.on('pageerror', e => errs.push('H SCAN PAGEERR ' + e.message));
    await Hsp.goto('file://' + Hpath.join(Hroot, 'scan.html').replace(/\\/g, '/')); await Hsp.waitForTimeout(600);
    // scan.html: hx_ keys are read by 06i only when 07b-helpx.js (desktop) defined them
    Hv = await HchkI18n(Hsp, HkS.keys, '^hx_');
    Hv.sy = await Hsp.evaluate(() => [t('sy_mode_server'), t('sy_field')].join('|'));
    await Hsp.close();
    ok(HkS.keys.length > 200 && !Hv.miss.length && !Hv.onlyIt.length && !Hv.onlyEn.length && Hv.sy === 'Server online|Campo', 'H i18n: scan.html — every key exists in IT + EN (fixed: the phone journal showed the raw keys sy_mode_server / sy_field)', Hv);
    // ---- Informazioni su DocMap
    Hv = await p.evaluate(() => ({ver:($('#hx-ver') || {}).textContent, db:($('#hx-db') || {}).textContent, srv:($('#hx-srv') || {}).textContent, dev:($('#hx-dev') || {}).textContent, id:syncDeviceId(), name:syncDeviceLabel(), exp:String(DB_SCHEMA_VERSION),
      w:[document.documentElement.scrollWidth, innerWidth]}));
    ok(Hv.ver === await p.evaluate(() => APP_VERSION) && Hv.db === 'schema ' + Hv.exp && Hv.srv === await p.evaluate(() => t('hx_srv_none')) && Hv.dev.includes(Hv.name) && Hv.dev.includes(Hv.id.slice(0, 12)) && Hv.w[0] <= Hv.w[1] + 1,
      'H about: Impostazioni › Informazioni su DocMap shows version, local DB schema, server state, device name / id', Hv);
    await p.click('#hx-about-btn'); await p.waitForTimeout(150);
    Hv = await p.evaluate(() => ({path:($('#hx-m-path') || {}).textContent || '', docs:$('#hx-about-body').textContent.includes('docs/AGGIORNAMENTI.md'), ping:!!$('#hx-ping'), title:topModal() && topModal().querySelector('.modal-h h2').textContent}));
    ok(/index\.html$/.test(Hv.path) && Hv.docs && !Hv.ping && Hv.title === 'Informazioni su DocMap', 'H about: details modal (program path, upgrade guides; no server check without a server)', Hv);
    await p.evaluate(() => { while (topModal()) closeModal(true); });
    // server configured (fake address + secret token) and a stubbed ping: schema shown, warning for an old server, token never copied
    Hv = await p.evaluate(async () => {
      const keep = localStorage.getItem(SRV_LS), f0 = window.fetch, calls = [];
      localStorage.setItem(SRV_LS, JSON.stringify({url:'https://srv.example.test/studio-de/', token:'SECRET-TOKEN-H-123', basic:'u:PASSWORD-H'}));
      let schema = 1;
      window.fetch = async (u, o) => { calls.push({u:String(u), body:o && o.body || ''}); return new Response(JSON.stringify({ok:true, api:'docmap-php', version:'1.2', schema, server_time:new Date().toISOString(), php:'8.3'}), {status:200, headers:{'Content-Type':'application/json'}}); };
      const o = {};
      try {
        S.view = 'settings'; renderAll(); o.cfg = $('#hx-srv').textContent;
        hxAboutOpen(); o.btn = !!$('#hx-ping'); await hxPing();
        o.srv = $('#hx-m-srv').textContent; o.warn = $('#hx-about-body').textContent.includes(t('hx_srv_old')); o.card = ($('#hx-srv') || {}).textContent; o.cardWarn = !!$('#hx-srv-warn');
        o.url = calls[0] && calls[0].u; o.noTok = calls.every(c => !String(c.body).includes('SECRET'));
        schema = 2; await hxPing(); o.warn2 = $('#hx-about-body').textContent.includes(t('hx_srv_old'));
        const txt = hxSupportText(); o.txt = /26\.11/.test(txt) && txt.includes(syncDeviceId()) && txt.includes('schema 2') && txt.includes('srv.example.test'); o.leak = /SECRET|PASSWORD-H/.test(txt);
      } finally { window.fetch = f0; if (keep == null) localStorage.removeItem(SRV_LS); else localStorage.setItem(SRV_LS, keep); HX.ping = null; HX.pingErr = ''; while (topModal()) closeModal(true); renderAll(); }
      return o; });
    ok(Hv.cfg === await p.evaluate(() => t('hx_srv_cfg')) && Hv.btn && /schema 1/.test(Hv.srv) && /API 1\.2/.test(Hv.srv) && Hv.warn && Hv.cardWarn && /schema 1/.test(Hv.card) && /srv\.example\.test\/studio-de\/server-php\/api\.php\?r=ping/.test(Hv.url) && Hv.noTok && !Hv.warn2 && Hv.txt && !Hv.leak,
      'H about: "Verifica server" pings (no token sent), shows API + schema, warns when the server schema is older; "Copia dati per l\'assistenza" never contains token or password', Hv);
    // ---- archive search: a QR read by a scanner finds its binder
    Hv = await p.evaluate(() => { S.view = 'archive'; renderAll(); const b = filteredBinders()[0]; UI.q = 'https://qr7.it/' + b.short_code; const r = filteredBinders().map(x => x.id); UI.q = ''; renderAll(); return {ok:r.length === 1 && r[0] === b.id}; });
    ok(Hv.ok, 'H scanner: a scanned QR URL in the Archive search finds its binder', Hv);
    // ---- association mode: feedback repeated in a persistent aria-live region; singular "1 faldone qui"
    Hv = await p.evaluate(async () => {
      const snap = {loc:JSON.stringify(S.locations || []), b:JSON.stringify(S.binders)};
      const wait = (ms) => new Promise(r => setTimeout(r, ms)); const o = {};
      try {
        locBulkCreate('', [{n:1, prefix:'HMAG', pad:1}, {n:1, prefix:'HB', pad:2}]); commit();
        const box = S.locations.find(l => l.code === 'HMAG1-HB01'), bin = S.binders.find(b => !b.location_id) || S.binders[0];
        locAssocStart(); await wait(60);
        locAssocInput(box.short_code, 'scanner'); await wait(80); o.sw = $('#hx-live').textContent === LUI.assoc.msg.text;
        locAssocInput('https://qr7.it/' + bin.short_code, 'scanner'); await wait(80);
        o.ok = $('#hx-live').textContent === LUI.assoc.msg.text && LUI.assoc.msg.kind === 'ok'; o.live = $('#hx-live').getAttribute('aria-live'); o.n = ($('#la-n') || {}).textContent;
        locAssocUndo(0); await wait(80); o.undo = $('#hx-live').textContent === LUI.assoc.msg.text;
      } finally { locAssocStop(); S.locations = JSON.parse(snap.loc); S.binders = JSON.parse(snap.b); locTouch(); commit(); S.view = 'archive'; renderAll(); }
      return o; });
    ok(Hv.sw && Hv.ok && Hv.undo && Hv.live === 'polite' && Hv.n === '1 faldone qui', 'H a11y: association feedback announced in a persistent aria-live region; "1 faldone qui" (singular)', Hv);
    // ---- phone width: Impostazioni and Stampa etichette no longer scroll sideways
    await p.setViewportSize({width:390, height:844});
    Hv = {};
    for (const v of ['settings', 'print', 'sync', 'archive']){ await p.evaluate(v => { S.view = v; renderAll(); }, v); await p.waitForTimeout(200); Hv[v] = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); }
    await p.evaluate(() => { S.view = 'info'; S.infoTab = 'loc'; renderAll(); }); await p.waitForTimeout(150); Hv.loc = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await p.screenshot({path:'shots/h_phone_loc.png'});
    await p.setViewportSize({width:1366, height:768});
    await p.evaluate(() => { S.view = 'archive'; renderAll(); });
    ok(Object.values(Hv).every(x => x <= 1), 'H layout: no horizontal scroll at 390×844 in Impostazioni, Stampa, Sincronizzazione, Archivio, Ubicazioni', Hv);
    // ---- English
    Hv = await p.evaluate(() => { S.lang = 'en'; S.view = 'settings'; renderAll(); const o = {h:$('#hx-about-h').textContent, t:L(helpTopic('troubleshoot').title), tag:helpTagLabel('online')}; S.lang = 'it'; S.view = 'archive'; renderAll(); return o; });
    ok(/^About DocMap/.test(Hv.h) && /^Troubleshooting/.test(Hv.t) && Hv.tag === 'Online & sync', 'H English: about panel, topics and tags', Hv);
  }
  console.log('\nerrors:', errs.length ? errs.join('\n') : 'none');
  if (errs.length) fails += errs.length;
  console.log(`\nRESULT: ${passes} passed, ${fails} failed`);
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
