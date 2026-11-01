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
  ok(await p.evaluate(() => S.settings.destTemplate.startsWith('https://studiodallasta.it/')), 'default destination on studiodallasta.it');
  ok(await p.evaluate(() => S.binders.length === 5 && new Set(S.binders.map(b => b.short_code)).size === 5 && S.binders.every(b => /^dm26[A-HJ-NP-Za-km-np-z2-9]{8}$/.test(b.short_code))), 'demo data + unambiguous dm26 codes');

  sec('views at 1366x768 (no horizontal scroll)');
  for (const v of ['archive','print','import','export','ai','database','settings']){
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
  for (const pr of presets) for (const m of ['pair','a','b','u']) for (const q of ['live','placeholder','none']){
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
  const ps = await p.evaluate(() => { S.print.presetId = 'l7160'; S.print.geometry = geoFromPreset(BUILTIN_PRESETS[0]); S.print.contentMode = 'pair'; S.usedSlots = {l7160:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]}; const L = layoutLabels(); const r = {pages:L.pages.length, first:L.pages[0][0].s}; S.usedSlots = {l7160:[0,1,2]}; const L2 = layoutLabels(); r.first2 = L2.pages[0][0].s; S.usedSlots = {}; return r; });
  ok(ps.pages === 1 && ps.first === 0 && ps.first2 === 3, 'partial sheet: full-used first sheet skipped, start after used', ps);

  sec('QR decode on printed PDFs (every slot, A4 300 dpi)');
  for (const pr of presets){
    for (const m of ['a','u']){
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
  await p.evaluate(() => { document.getElementById('print-root').innerHTML = ''; S.print.presetId = 'l7160'; S.print.geometry = geoFromPreset(BUILTIN_PRESETS[0]); S.print.contentMode = 'pair'; savePrefs(); });

  sec('calibration + register + quality box');
  const cal = await p.evaluate(() => { S.print.offsetX = 1.5; const h = buildCalibSheet(); S.print.offsetX = 0; return {slots:(h.match(/Slot #/g) || []).length, x:h.includes('X: 8.7mm'), nan:h.includes('NaN')}; });
  ok(cal.slots === 21 && cal.x && !cal.nan, 'calibration sheet has 21 slots and offset in coordinates', cal);
  ok(await p.evaluate(() => { const h = buildRegisterHTML(sortedBinders()); return (h.match(/<svg/g) || []).length === S.binders.length; }), 'register has one QR per binder');
  await p.evaluate(() => { S.view = 'print'; renderAll(); }); await p.waitForTimeout(300);
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
  ok(await p.evaluate(() => UI.importParsed && UI.importParsed.rows[0].p.company_name === 'Città Perché Srl'), 'Windows-1252 CSV decoded', await p.evaluate(() => UI.importParsed && UI.importParsed.rows[0].p));
  fs.writeFileSync('shots/utf16.txt', Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('cliente\tripiano\r\nGreco Srl\tγ\r\n', 'utf16le')]));
  await p.setInputFiles('#file-import', 'shots/utf16.txt'); await p.waitForTimeout(400);
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
  ok(man[0] === 'short_code;short_url;final_destination;tags' && man.length === 7 && man[1].split(';').length === 4 && man[1].includes('https://studiodallasta.it/'), 'manifest header + rows', man.slice(0, 2));
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

  console.log('\nerrors:', errs.length ? errs.join('\n') : 'none');
  if (errs.length) fails += errs.length;
  console.log(`\nRESULT: ${passes} passed, ${fails} failed`);
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
