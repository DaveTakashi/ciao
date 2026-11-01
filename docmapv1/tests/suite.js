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
  for (const v of ['archive','print','clients','import','export','ai','database','settings']){
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
  v = await p.evaluate(() => { const pr = buildAIPrompt(true); return {hdr:pr.includes('speaking_code;multi_code;company_name'), n:pr.includes('exactly 20 fields'), rule:pr.includes('Never invent it'), ctx:pr.includes('Codice Multi (reuse it')}; });
  ok(v.hdr && v.n && v.rule && v.ctx, 'AI prompt: multi_code column, 20 fields, never invented, known codes in context', v);
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
  ok(v.dp === 'mrink143' && v.dm === 'split' && v.first === 'mrink143', 'default sheet MRINK143 + split label', v);
  ok(v.mp === 'mrink143' && v.mm === 'split' && v.m2p === 'l7163' && v.m2m === 'pair', 'migration switches old workspaces to MRINK143 once, later choices are kept', v);
  v = await p.evaluate(() => { const P = findPreset('mrink143'); return {fits:P.marginLeft + P.cols * P.w <= 210 && P.marginTop + P.rows * P.h <= 297, n:P.cols * P.rows, w:P.w, h:P.h}; });
  ok(v.fits && v.n === 4 && v.w === 105 && v.h === 148, 'MRINK143 geometry: 4 × 105×148 on A4', v);
  v = await p.evaluate(() => {
    S.binders = S.binders.concat([normalizeBinder({speaking_code:'TS1', company_name:'Test Split S.r.l.', company_city:'Parma (PR)', category:'Ordinaria', binder_title:'Titolo split', ref_year:'2024', extra_codes:'Prot. 77', tags:'iva', multi_code:'M-1', short_code:'dm26TestAbCd', room_code:'Ufficio 1', cabinet_code:'2', shelf_code:'3', contents_items:[{year:'2024', description:'Voce uno'}], selected_for_print:true})]); commit();
    S.print.presetId = 'mrink143'; S.print.geometry = geoFromPreset(findPreset('mrink143')); S.print.contentMode = 'split'; S.print.qrMode = 'live'; S.print.fields = {}; S.print.split = {ratio:0.5, rotate:-90, guides:true}; S.usedSlots = {};
    const q = printQueueBinders().length, L = layoutLabels(), sh = buildLabelSheets(false);
    const html = renderLabel('S', S.binders.find(b => b.speaking_code === 'TS1'), S.print.geometry, S.print);
    return {q, pages:L.pages.length, expect:Math.ceil(q / 4), perPage:L.pages[0].length, cuts:(sh[0].match(/cut-guide/g) || []).length, rot:html.includes('rotate(-90deg)'),
      has:['TS1', 'ORDINARIA'.toLowerCase(), 'Test Split', 'Parma (PR)', 'M-1', 'Titolo split', '2024', 'Prot. 77', '#iva', 'Voce uno', '>qr7.it/dm26TestAbCd'].filter(x => !html.toLowerCase().includes(x.toLowerCase())), demoTag:renderLabel('S', S.binders.find(isDemo), S.print.geometry, S.print).includes('#demo')};
  });
  ok(v.pages === v.expect && v.perPage === Math.min(4, v.q) && v.cuts === v.perPage && v.rot, 'split: 4 labels (8 modules) per sheet, one faint cut line each, rotated −90°', v);
  ok(!v.has.length && !v.demoTag, 'split label prints code, category, company, place, Multi, title, year, extra codes, tags, contents, URL (never the demo tag)', v);
  v = await p.evaluate(() => { const b = S.binders.find(x => x.speaking_code === 'TS1'), g = S.print.geometry;
    S.print.split = {ratio:0.5, rotate:90, guides:false}; const r = renderLabel('S', b, g, S.print);
    S.print.fields = {category:false, city:false, multi:false, url:false, year:false, extra:false, tags:false, contents:false, date:'none'}; const off = renderLabel('S', b, g, S.print);
    S.print.fields = {date:'updated'}; const upd = renderLabel('S', b, g, S.print);
    S.print.fields = {}; S.print.split = {ratio:0.5, rotate:-90, guides:true};
    return {r90:r.includes('rotate(90deg)'), noCut:!r.includes('cut-guide'), off:['Ordinaria', 'Parma (PR)', 'M-1', '>qr7.it/dm26', 'Prot. 77', '#iva', 'Voce uno', '2024', t('l_created')].filter(x => off.includes(x)), code:off.includes('TS1'), upd:upd.includes(t('l_updated'))}; });
  ok(v.r90 && v.noCut, 'split options: +90° rotation and cut line off', v);
  ok(!v.off.length && v.code && v.upd, 'field toggles hide each field (speaking code always printed), date can be creation/update/none', v);
  await p.evaluate(() => { S.view = 'print'; S.print.advanced = false; renderAll(); }); await p.waitForTimeout(300);
  v = await p.evaluate(() => { const c = document.querySelector('#pv-scroll .cut-guide'); const cs = c && getComputedStyle(c); const a = cs ? (cs.borderTopColor.match(/rgba?\(([^)]+)\)/) || [])[1] : ''; const alpha = a && a.split(',').length === 4 ? +a.split(',')[3] : 1;
    return {alpha, adv:!!document.querySelector('#pr-adv') && !document.querySelector('#pr-adv').open, inAdv:['#slotmap', '#geo-offsets'].every(s => document.querySelector(s) && document.querySelector(s).closest('#pr-adv')), fields:document.querySelectorAll('#pr-fields [data-fld]').length, rec:!!document.querySelector('.preset.on .pop.rec')}; });
  ok(v.alpha > 0 && v.alpha <= 0.2, 'cut line is barely visible (low opacity)', v);
  ok(v.adv && v.inAdv && v.fields >= 10 && v.rec, 'print studio: basic panel, geometry/partial sheets/calibration under a closed "Advanced options", recommended preset badged', v);
  await p.screenshot({path:'shots/v6_print.png'});
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
  ok(v.view === 'clients' && v.n === 3 && v.rows === 3, 'clients imported into the register view', v);
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
  ok(v.len === v.cols && v.city === 'Parma (PR)' && v.year === '2024' && v.extra === 'Prot. 77' && v.hdr === 20, 'full CSV and AI template carry place, reference year and extra codes', v);
  v = await p.evaluate(() => { analyzeImport('BX9;M-9;Bix Srl;Ordinaria;Bilancio;A;1;α;;A1-α;CURRENT;2025: Doc;iva;#2563EB;;;;Parma (PR);2025;Prot. 9'); const r = UI.importParsed.rows[0].p; UI.importParsed = null; return [r.company_city, r.ref_year, r.extra_codes, r.multi_code]; });
  ok(v.join('|') === 'Parma (PR)|2025|Prot. 9|M-9', 'headerless 20-field AI rows map the new columns', v);
  v = await p.evaluate(() => { analyzeImport('speaking_code;company_name;luogo;anno;codici_extra\nZZ1;Zeta;Fidenza (PR);2023;P-1'); const r = UI.importParsed.rows[0].p; UI.importParsed = null; return [r.company_city, r.ref_year, r.extra_codes]; });
  ok(v.join('|') === 'Fidenza (PR)|2023|P-1', 'Italian column names for the new fields', v);
  v = await p.evaluate(async () => { dbSyncFromState('t'); await dbPersist(); const d2 = new DB.SQL.Database(DB.db.export()); const W = dbReadWorkspace(d2); const nC = dbScalar('SELECT COUNT(*) FROM clients', null, d2); const ver = dbScalar("SELECT value FROM meta WHERE key='schema_version'", null, d2); d2.close();
    const b = W.binders.find(x => x.speaking_code === 'TS1'); return {nC, ver, wc:W.clients.length, city:b.company_city, year:b.ref_year, extra:b.extra_codes, json:JSON.parse(workspaceJSON()).clients.length}; });
  ok(v.nC === 3 && v.ver === '3' && v.wc === 3 && v.city === 'Parma (PR)' && v.year === '2024' && v.extra === 'Prot. 77' && v.json === 3, 'SQLite schema 3: clients table + new binder columns, also in the workspace JSON', v);
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
  console.log('\nerrors:', errs.length ? errs.join('\n') : 'none');
  if (errs.length) fails += errs.length;
  console.log(`\nRESULT: ${passes} passed, ${fails} failed`);
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
