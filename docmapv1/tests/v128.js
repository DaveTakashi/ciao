// DocMap v12.8 (26.12.8) checks (~1 min): inventory projects ("Progetti") on the PC, the phone screen Scatola → Faldoni
// in local mode (same browser) and against a REAL server-php/api.php (php -S) with the mock AI provider.
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node v128.js       (needs php 8 with pdo_sqlite)
const {chromium} = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto'), {spawn} = require('child_process');
const APP = path.resolve(__dirname, '..');
const fileUrl = f => 'file://' + path.join(APP, f).replace(/\\/g, '/');
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) passes++; else { fails++; console.log('  ✗ FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  // ---- real PHP server with the mock AI provider ----
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'docmap-v128-'));
  const sp = path.join(work, 'root', 'studio-de', 'server-php'), data = path.join(work, 'data');
  fs.mkdirSync(sp, {recursive:true}); fs.mkdirSync(data);
  for (const f of ['api.php', '.htaccess']) fs.copyFileSync(path.join(APP, 'server-php', f), path.join(sp, f));
  const tok = 'v128-' + crypto.randomBytes(8).toString('hex'), vtok = 'v128v-' + crypto.randomBytes(8).toString('hex');
  const h = (s) => crypto.createHash('sha256').update(s).digest('hex');
  fs.writeFileSync(path.join(sp, 'config.php'), "<?php\nif (!defined('DOCMAP_API')) { http_response_code(404); exit; }\nreturn ['data_dir' => " + JSON.stringify(data) +
    ", 'aes_key' => '" + crypto.randomBytes(32).toString('base64') + "', 'tokens' => [['user' => 'dave', 'role' => 'admin', 'token_sha256' => '" + h(tok) + "'], ['user' => 'vera', 'role' => 'viewer', 'token_sha256' => '" + h(vtok) + "']]" +
    ", 'allowed_origins' => ['null'], 'ai_provider' => 'mock'];\n");
  const port = 18000 + Math.floor(Math.random() * 900);
  const php = spawn('php', ['-S', '127.0.0.1:' + port, '-t', path.join(work, 'root'), path.join(__dirname, 'php-router.php')], {stdio:'ignore'});
  const api = 'http://127.0.0.1:' + port + '/studio-de/server-php/api.php';
  for (let i = 0; i < 50; i++){ try { const r = await fetch(api + '?r=ping'); if (r.ok) break; } catch(e){} await sleep(100); }

  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({viewport:{width:1366, height:768}});
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    p.on('dialog', d => d.accept());
    await p.goto(fileUrl('index.html')); await p.waitForTimeout(1300);
    await p.evaluate(() => { const m = document.querySelector('.modal-f [data-a="modal-btn"]'); if (m) m.click(); });
    ok(await p.evaluate(() => APP_VERSION === '26.12.8' && typeof viewInv === 'function' && typeof invLabelCode === 'function'), 'v12.8 loaded');

    // ---- model (02f) ----
    const M = await p.evaluate(() => {
      const r = {};
      r.seq = [invSeqCode(1), invSeqFrom(invSeqCode(1)), invSeqFrom(invSeqCode(123456)), invSeqCode(INV_MAX).length, INV_MAX];
      r.codes = [invLabelCode('Kq7P', 'box', 3), invLabelCode('Kq7P', 'binder', 42)];
      r.parse = [invParseCode(r.codes[0]), invParseCode(r.codes[1]), invParseCode('dm26AbCdEfGh'), invParseCode('x')];
      r.num = [invNumber({code:'rossi 24'}, 'box', 7), invNumber({code:'ROSSI24'}, 'binder', 42)];
      r.sugg = [invSuggestCode('Rossi S.r.l. 2024', []), invSuggestCode('Archivio Comune di Parma', []), invSuggestCode('Rossi 2024', ['ROSSI24'])];
      r.voice = invParseVoice('Fatture acquisti 2019 e banca 2021', {tags:['Fatture', 'Banca', 'Paghe']});
      r.yshort = invYearsIn('fatture dal 15 al 18', {year_from:2010, year_to:2020});
      r.ai = invFieldsFromAi({company:'Rossi', title:'Fatture', year_from:2019, year_to:2021, doc_type:'fatture'}, {company_name:'Già scritto'});
      r.norm = normalizeInv({prefix:'bad!', status:'x', mode:'capture', year_from:2022, year_to:2015, tags:'A; b ;a', future:'kept'});
      return r;
    });
    ok(M.seq[0] === 'AAAB' && M.seq[1] === 1 && M.seq[2] === 123456 && M.seq[3] === 4 && M.seq[4] === 9834495, 'model: base-56 label numbers', M.seq);
    ok(M.codes[0] === 'dm26LKq7PAAAD' && M.codes[1].length === 12 && M.parse[0].kind === 'box' && M.parse[0].n === 3 && M.parse[1].n === 42 && M.parse[1].prefix === 'Kq7P' && M.parse[2].prefix === 'AbCd' && M.parse[3] === null, 'model: label codes are location / binder short codes', M);
    ok(M.num[0] === 'ROSSI24-S007' && M.num[1] === 'ROSSI24-0042', 'model: printed numbers', M.num);
    ok(M.sugg[0] === 'ROSSI24' && M.sugg[1] === 'COMUNE' && M.sugg[2] === 'ROSSI242', 'model: suggested project code', M.sugg);
    ok(M.voice.tags.join() === 'Fatture,Banca' && M.voice.years.join() === '2019,2021' && M.yshort.join() === '2015,2018', 'model: voice → tags + years', M);
    ok(M.ai.company_name === undefined && M.ai.binder_title === 'Fatture' && M.ai.ref_year === '2019-2021' && !('multi_code' in M.ai), 'model: AI fields never overwrite and never set a Codice Multi', M.ai);
    ok(M.norm.prefix === '' && M.norm.status === 'open' && M.norm.mode === 'capture' && M.norm.year_from === 2015 && M.norm.tags.join() === 'A,b' && M.norm.future === 'kept', 'model: normalizeInv cleans and keeps unknown keys', M.norm);

    // ---- desktop: create a project from the form, batches, print, manifest ----
    await p.evaluate(() => { S.view = 'inv'; renderAll(); });
    ok(await p.evaluate(() => !!document.querySelector('.nav-main [data-v="inv"]') && !!document.getElementById('ivp-empty')), 'PC: Progetti in the main nav, empty state');
    await p.click('#ivp-new'); await p.waitForTimeout(150);
    await p.fill('#ivp-name', 'Inventario Rossi S.r.l. 2024'); await p.waitForTimeout(50);
    const code0 = await p.inputValue('#ivp-code');
    await p.fill('#ivp-client', 'Rossi S.r.l.'); await p.fill('#ivp-yf', '2015'); await p.fill('#ivp-yt', '2022');
    await p.fill('#ivp-nb', '3'); await p.fill('#ivp-nf', '10');
    await p.locator('.modal-f .btn-primary').last().click(); await p.waitForTimeout(300);
    const P = await p.evaluate(() => { const a = invProjects()[0]; return a ? {id:a.id, name:a.name, inv:a.inv, levels:a.levels, view:S.view, open:IVP.open, detail:!!document.getElementById('ivp-batch'), log:LOG.entries.filter(e => /^inventory\./.test(e.action)).map(e => e.action)} : null; });
    ok(code0 === 'ROSSI24' && P && P.inv.code === 'ROSSI24' && /^[A-Za-z0-9]{4}$/.test(P.inv.prefix) && P.inv.box_to === 3 && P.inv.binder_to === 10 && P.inv.batches.length === 2 && P.inv.client === 'Rossi S.r.l.' && P.levels[0].name === 'Scatola', 'PC: project created (code suggested, prefix, first batches, levels)', P);
    ok(P && P.open === P.id && P.detail && P.log.join() === 'inventory.create,inventory.batch,inventory.batch', 'PC: project page opens, actions logged', P && P.log);
    const B = await p.evaluate((id) => { const a = ivpProj(id); const b = ivpBatch(a, 'binder', 5, true); commit(); const r = {from:b.from, to:b.to, total:a.inv.binder_to};
      const items = ivpBatchCodes(a, b); r.first = items[0].num; r.codes = items.map(x => x.code);
      r.taken = invCodeTaken(items[0].code); r.free = !invCodeTaken('dm26' + (a.inv.prefix === 'AAAA' ? 'BBBB' : 'AAAA') + 'AAAB');
      let rnd = 0; for (let i = 0; i < 300; i++){ if (invParseCode(newShortCode()).prefix === a.inv.prefix) rnd++; } r.rnd = rnd;
      const sheets = ivpSheets(a, items, 1); r.sheets = sheets.length; r.labs = (sheets.join('').match(/class="ivp-lab"/g) || []).length; r.qr = /<svg/.test(sheets[0]); r.num = sheets[0].includes(items[0].num);
      r.start = (ivpSheets(a, items, slotCount()).length);
      r.url = ivpPhoneUrl(a);
      return r; }, P.id);
    ok(B.from === 11 && B.to === 15 && B.total === 15 && B.first === 'ROSSI24-0011' && B.taken && B.free && B.rnd === 0, 'PC: new batch continues the numbering; project codes are reserved', B);
    ok(B.sheets === 1 && B.labs === 5 && B.qr && B.num && B.start === 2 && /scan\.html\?inv=/.test(B.url), 'PC: label sheets (QR + number), start position, phone URL', B);
    const MF = await p.evaluate((id) => { const a = ivpProj(id), bt = a.inv.batches[0]; let out = null; const d0 = window.download; window.download = (n, txt) => { out = {n, txt}; }; ivpManifest(id, bt.id); window.download = d0; return out; }, P.id);
    ok(MF && /^manifest_qr7_rossi24_S1-3\.csv$/.test(MF.n) && MF.txt.split('\n')[0] === 'short_code;short_url;final_destination;tags;' && MF.txt.split('\n').filter(Boolean).length === 4 && /https:\/\/qr7\.it\/dm26L/.test(MF.txt) && /scatola,ROSSI24-S001;/.test(MF.txt), 'PC: qr7 manifest of a batch', MF);
    // print dialog + print → printed_at
    await p.evaluate((id) => { const a = ivpProj(id); window.print = () => {}; ivpOpenPrint(id, a.inv.batches[0].id); }, P.id); await p.waitForTimeout(150);
    ok(await p.evaluate(() => !!document.querySelector('.ivp-prev .ivp-lab')), 'PC: print dialog shows a label preview');
    await p.locator('.modal-f .btn-primary').last().click(); await p.waitForTimeout(700);
    ok(await p.evaluate((id) => !!ivpProj(id).inv.batches[0].printed_at && LOG.entries.some(e => e.action === 'inventory.print'), P.id), 'PC: printing marks the batch and logs');
    // phone dialog
    await p.click('#ivp-phone'); await p.waitForTimeout(150);
    ok(await p.evaluate(() => !!document.querySelector('#ivp-phone-m svg') && /scan\.html\?inv=/.test(document.getElementById('ivp-phone-url').textContent)), 'PC: "Apri sul telefono" shows QR + link');
    await p.evaluate(() => closeModal(true));
    // settings: QR address agnostic, default qr7.it
    const Q = await p.evaluate(() => { S.view = 'settings'; renderAll(); const r = {field:!!document.getElementById('se-qrbase'), def:shortUrl('dm26AbCdEfGh')};
      S.settings.qrBase = 'https://qr.example.org/r'; r.custom = shortUrl('dm26AbCdEfGh'); S.settings.qrBase = 'ftp://bad'; r.bad = shortUrl('dm26AbCdEfGh'); S.settings.qrBase = ''; r.back = shortUrl('dm26AbCdEfGh'); return r; });
    ok(Q.field && Q.def === 'https://qr7.it/dm26AbCdEfGh' && Q.custom === 'https://qr.example.org/r/dm26AbCdEfGh' && Q.bad === Q.def && Q.back === Q.def, 'settings: QR address configurable, qr7.it default, invalid ignored', Q);
    // SQLite mirror keeps inv
    const D = await p.evaluate(async (id) => { dbSyncFromState('t'); const W = dbReadWorkspace(DB.db); const a = (W.archives || []).find(x => x.id === id); return {inv:a && a.inv && a.inv.prefix, mine:ivpProj(id).inv.prefix}; }, P.id);
    ok(D.inv && D.inv === D.mine, 'SQLite: inv_json survives the mirror', D);

    // ---- phone, local mode (same browser) ----
    await p.evaluate(async () => { await dmProviders().auth.addUser({username:'inv1', display_name:'Ivo', role:'editor', secret:'135791'}); });
    const q = await ctx.newPage(); const qerrs = [];
    q.on('pageerror', e => qerrs.push('PAGEERR ' + e.message)); q.on('console', m => { if (m.type() === 'error') qerrs.push('CONSOLE ' + m.text()); });
    await q.setViewportSize({width:390, height:844});
    await q.goto(fileUrl('scan.html') + '?inv=' + encodeURIComponent(P.id)); await q.waitForTimeout(600);
    await q.fill('#sc-user', 'inv1'); await q.fill('#sc-pin', '135791'); await q.click('#sc-enter'); await q.waitForTimeout(1200);
    let V = await q.evaluate(() => ({view:SC.view, name:(document.getElementById('iv-name') || {}).textContent, tags:document.querySelectorAll('.iv-tag').length, years:document.querySelectorAll('.iv-year').length, nobox:!!document.querySelector('#iv-box.none'), w:[document.documentElement.scrollWidth, innerWidth]}));
    ok(V.view === 'inv' && V.name === 'Inventario Rossi S.r.l. 2024' && V.tags === 8 && V.years === 8 && V.nobox && V.w[0] <= V.w[1] + 1, 'phone: Scatola → Faldoni screen (tags, year bar 2015-2022, no box, no h-scroll)', V);
    const codes = B.codes, boxCode = await p.evaluate((id) => invLabelCode(ivpProj(id).inv.prefix, 'box', 1), P.id);
    const bin1 = await p.evaluate((id) => invLabelCode(ivpProj(id).inv.prefix, 'binder', 1), P.id), bin2 = await p.evaluate((id) => invLabelCode(ivpProj(id).inv.prefix, 'binder', 2), P.id);
    await q.evaluate((c) => IV_API.ivHandle('https://qr7.it/' + c, 'test'), bin1); await q.waitForTimeout(200);
    ok(await q.evaluate(() => /scatola/i.test(IV.msg.text) && IV.list.length === 0), 'phone: a binder before the box is refused in mode box');
    await q.evaluate((c) => IV_API.ivHandle('https://qr7.it/' + c, 'test'), boxCode); await q.waitForTimeout(300);
    // fake camera: a canvas is a valid frame for the photo
    await q.evaluate(() => { const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#000'; g.font = '48px sans-serif'; g.fillText('FATTURE 2019', 40, 240); IV.cam = {video:cv, stop(){}, attach(){}}; });
    await q.evaluate((c) => IV_API.ivHandle(c, 'test'), bin1); await q.waitForTimeout(400);
    await q.evaluate(() => IV_API.ivToggleTag('Fatture')); await q.evaluate(() => IV_API.ivToggleYear(2019));
    await q.evaluate(() => IV_API.ivApplyVoice('fatture acquisti 2019')); await q.waitForTimeout(1700);
    await q.evaluate((c) => IV_API.ivHandle('https://qr7.it/' + c, 'test'), bin1); await q.waitForTimeout(200);
    V = await q.evaluate(() => ({dup:/già/.test(IV.msg.text), box:IV.box && IV.box.code, list:IV.list.length, last:(document.getElementById('iv-last-code') || {}).textContent, q:IV_API.ivOutbox().length}));
    ok(V.dup && V.box === 'ROSSI24-S001' && V.list === 1 && V.last === 'ROSSI24-0001' && V.q === 0, 'phone: box set, binder captured, re-scan refused, outbox empty', V);
    const L = await q.evaluate((pid) => { const st = JSON.parse(localStorage.getItem(LS_KEY)); const b = st.binders.find(x => x.id.startsWith('inv-')), l = (st.locations || []).find(x => x.id.startsWith('inv-'));
      return {b:b && {id:b.id, sc:b.speaking_code, arch:b.archive_id, loc:b.location_id, tags:b.tags, year:b.ref_year, title:b.binder_title, inv:b.inv}, l:l && {id:l.id, code:l.code, arch:l.archive_id}, pid}; }, P.id);
    ok(L.b && L.b.sc === 'ROSSI24-0001' && L.b.arch === P.id && L.b.loc === L.l.id && /Fatture/.test(L.b.tags) && L.b.year === '2019' && L.b.title === 'fatture acquisti 2019' && L.b.inv.st === 'proposed' && L.b.inv.voice && /^ph-/.test(L.b.inv.ph), 'phone (local): binder in the stored state with box, tags, year, voice, photo id', L);
    const ph = await q.evaluate(async (id) => { const r = await IVDB.get(id); return r ? r.data.slice(0, 23) : ''; }, L.b.inv.ph);
    ok(ph === 'data:image/jpeg;base64,', 'phone (local): spine photo in IndexedDB', ph);
    await p.waitForTimeout(600);
    const PC = await p.evaluate((id) => { const a = ivpProj(id); const L = ivpBinders(a); return {n:L.length, st:L[0] && L[0].inv && L[0].inv.st, loc:(S.locations || []).filter(l => l.archive_id === id).length}; }, P.id);
    ok(PC.n === 1 && PC.st === 'proposed' && PC.loc === 1, 'PC: the open desktop merges the phone capture live (log line)', PC);
    // undo within 10 s
    await q.evaluate((c) => IV_API.ivHandle(c, 'test'), bin2); await q.waitForTimeout(300);
    await q.click('#iv-undo'); await q.waitForTimeout(800);
    V = await q.evaluate((c) => { const st = JSON.parse(localStorage.getItem(LS_KEY)); return {gone:!st.binders.some(b => b.short_code === c), tomb:(st.tombstones || []).some(x => x.id === 'inv-' + c), msg:IV.msg.text}; }, bin2);
    ok(V.gone && /Annullato/.test(V.msg), 'phone: undo removes the binder', V);
    ok(qerrs.length === 0, 'no JS errors on the phone (local)', qerrs);
    // review grid on the PC
    await p.evaluate((id) => { S.view = 'inv'; IVP.open = id; renderAll(); }, P.id); await p.waitForTimeout(500);
    const G = await p.evaluate(() => ({items:document.querySelectorAll('.ivp-item').length, img:!!document.querySelector('.ivp-ph img'), safe:!!document.getElementById('ivp-confirm-safe')}));
    ok(G.items === 1 && G.img && G.safe, 'PC: review grid with the spine photo (IndexedDB) and "Conferma le proposte sicure"', G);
    await p.fill('.ivp-item [data-ivf="company_name"]', 'Rossi Mario S.r.l.'); await p.press('.ivp-item [data-ivf="company_name"]', 'Tab');
    await p.click('#ivp-confirm-safe'); await p.waitForTimeout(200);
    const C = await p.evaluate((id) => { const b = ivpBinders(ivpProj(id))[0]; return {co:b.company_name, st:b.inv.st, by:b.inv.ok_by, log:LOG.entries.some(e => e.action === 'inventory.confirm')}; }, P.id);
    ok(C.co === 'Rossi Mario S.r.l.' && C.st === 'confirmed' && C.log, 'PC: inline edit + bulk confirm', C);
    ok(errs.length === 0, 'no JS errors on the PC', errs);

    // ---- phone against the real server (push, photo, mock AI, scanned list, roles) ----
    const R = await q.evaluate(async ({api, tok, pj}) => {
      const r = {};
      const dp = new RemoteDataProvider({apiBase:api}, () => tok); dp.srv = new DMServer(api, tok, {simple:true});
      const proj = Object.assign({}, pj, {inv:Object.assign({}, pj.inv, {ai:true, mode:'capture'})});
      await dp.srv.call('push', {method:'POST', body:{records:[{type:'archive', id:proj.id, updated_at:new Date().toISOString(), data:proj}], tombstones:[]}});
      SC.P.data = dp; IV.list = []; IV.last = null; IV.box = null;
      r.list = (await dp.invList()).map(x => x.id);
      r.open = await IV_API.ivOpen(proj.id); r.scanned0 = IV.scanned.size;
      await IV_API.ivHandle(invLabelCode(proj.inv.prefix, 'binder', 3), 'test');   // capture mode: no box needed, photo from the fake camera
      IV_API.ivApplyVoice('banca 2020');
      for (let i = 0; i < 40 && (IV_API.ivOutbox().length || IV.flushing.rec || IV.flushing.ai); i++) await new Promise(res => setTimeout(res, 150));
      r.left = IV_API.ivOutbox();
      const code = invLabelCode(proj.inv.prefix, 'binder', 3);
      const res = await dp.srv.call('resolve', {q:{qr:code}}); r.srv = {id:res.binder.id, sc:res.binder.speaking_code, st:res.binder.inv && res.binder.inv.st, ai:!!(res.binder.inv && res.binder.inv.ai), tags:res.binder.tags, year:res.binder.ref_year, ph:res.binder.inv && res.binder.inv.ph};
      const photo = await dp.srv.call('photo', {q:{id:r.srv.ph}}); r.photo = photo.mime + ':' + (photo.data || '').length;
      const pg = await dp.invGet(proj.id); r.scanned = pg.scanned.map(x => x.t + ':' + x.c.slice(-4));
      try { await dp.srv.call('resolve', {q:{qr:invLabelCode(proj.inv.prefix, 'binder', 9)}}); r.nf = 'found?'; } catch(e){ r.nf = e.code + ':' + (e.data && e.data.label ? e.data.label.n + '/' + e.data.label.in_range : ''); }
      return r;
    }, {api, tok, pj:await p.evaluate((id) => clone(ivpProj(id)), P.id)});
    ok(R.list.includes(P.id) && R.open && R.left.length === 0, 'phone (server): project listed and opened, outbox drained', R);
    ok(R.srv.id.startsWith('inv-') && R.srv.sc === 'ROSSI24-0003' && R.srv.ai && R.srv.st === 'proposed' && /Banca/.test(R.srv.tags) && R.srv.year === '2020' && /^image\/jpeg:\d{3,}/.test(R.photo), 'phone (server): binder + photo + AI result on the server', R);
    ok(R.scanned.includes('b:AAAD') && /^not_found:9\/true$/.test(R.nf), 'server: scanned labels listed; unused label known to its project', R);
    // an AI reading that arrives after the binder was edited elsewhere never overwrites that edit
    const AI2 = await q.evaluate(async ({api, tok}) => {
      const dp = SC.P.data, proj = IV.proj, code = invLabelCode(proj.inv.prefix, 'binder', 4);
      IV.proj.inv.ai = false; await IV_API.ivHandle(code, 'test'); IV.proj.inv.ai = true;
      for (let i = 0; i < 40 && IV_API.ivOutbox().length; i++) await new Promise(res => setTimeout(res, 150));
      const cur = (await dp.srv.call('resolve', {q:{qr:code}})).binder;
      const ed = Object.assign({}, cur, {company_name:'Modificato sul PC', binder_title:'Titolo del PC'}); const at = new Date(Date.parse(cur.updated_at) + 5000).toISOString(); ed.updated_at = at;
      await dp.srv.call('push', {method:'POST', body:{records:[{type:'binder', id:cur.id, updated_at:at, data:ed}], tombstones:[]}});
      const q0 = IV_API.ivOutbox(); q0.push({id:'t-ai', at:new Date().toISOString(), tries:0, p:proj.id, kind:'ai', code, ph:cur.inv.ph, voice:'paghe 2018', hints:{tags:proj.inv.tags}}); localStorage.setItem(IV_API.IV_OUTBOX_LS, JSON.stringify(q0));
      await IV_API.ivFlush('ai');
      const after = (await dp.srv.call('resolve', {q:{qr:code}})).binder;
      return {co:after.company_name, title:after.binder_title, tags:after.tags, year:after.ref_year, st:after.inv && after.inv.st, ai:!!(after.inv && after.inv.ai), left:IV_API.ivOutbox().length};
    }, {api, tok});
    ok(AI2.co === 'Modificato sul PC' && AI2.title === 'Titolo del PC' && /Paghe/.test(AI2.tags) && AI2.year === '2018' && AI2.ai && AI2.left === 0, 'phone (server): a late AI reading fills only empty fields of the newest server version', AI2);
    // the PC pulls the captures from the server: inv kept, spine photo from the server
    const PL = await p.evaluate(async ({api, tok, pid}) => {
      localStorage.setItem('docmap_v26_srv', JSON.stringify({url:api, token:tok})); renderTopbar();
      await srvSync();
      const L = S.binders.filter(b => b.archive_id === pid && /^inv-/.test(b.id) && b.inv && b.inv.ai);
      const b = L.find(x => x.speaking_code === 'ROSSI24-0003');
      const u = b ? await ivpPhotoGet(b.inv.ph) : '';
      localStorage.removeItem('docmap_v26_srv');
      return {n:L.length, st:b && b.inv.st, photo:String(u || '').slice(0, 23), state:SRV.state};
    }, {api, tok, pid:P.id});
    ok(PL.n >= 2 && PL.st === 'proposed' && PL.photo === 'data:image/jpeg;base64,', 'PC: pull from the server keeps inv; the spine photo comes from the server', PL);
    // viewer cannot capture
    const VW = await q.evaluate(async ({api, vtok, pid}) => { const dp = new RemoteDataProvider({apiBase:api}, () => vtok); dp.srv = new DMServer(api, vtok, {simple:true});
      try { await dp.invPhotoPut({id:'ph-x', mime:'image/jpeg', data:btoa('x'.repeat(100))}); return 'allowed'; } catch(e){ return e.code; } }, {api, vtok, pid:P.id});
    ok(VW === 'forbidden', 'server: a viewer cannot upload photos', VW);
    ok(qerrs.filter(x => !/Failed to load resource: the server responded with a status of 40[34]/.test(x)).length === 0, 'no JS errors on the phone (server; the expected 404 and 403 aside)', qerrs);
  } finally { await b.close(); php.kill(); }
  console.log(`\nV12.8: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
