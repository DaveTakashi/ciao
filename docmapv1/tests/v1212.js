// v12.12 (26.12.12) checks (~1 min): rapid inventory phases 3 and 4.
// Model (modes, batch kinds, prices, templates, verification, report, AI prompt = server prompt), PC (template in the
// form, prices, document labels, Impostazioni › Inventario, report + CSV, live panel, AI from the PC with a LOCAL model
// and with the server), phone in local mode (document level, jolly labels, box summary, first-page photo, Bluetooth
// scanner, fixed station, box verification with move and capture) and against a REAL server-php/api.php (detail=1,
// verification, mock AI from the PC). Old data: a 26.12.11 project keeps working.
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node v1212.js       (needs php 8 with pdo_sqlite, python 3)
const {chromium} = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto'), {spawn, execFileSync} = require('child_process');
const APP = path.resolve(__dirname, '..');
const fileUrl = f => 'file://' + path.join(APP, f).replace(/\\/g, '/');
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) passes++; else { fails++; console.log('  ✗ FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 900) : ''); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  // ---- real PHP server with the mock AI provider ----
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'docmap-v1212-'));
  const sp = path.join(work, 'root', 'studio-de', 'server-php'), data = path.join(work, 'data');
  fs.mkdirSync(sp, {recursive:true}); fs.mkdirSync(data);
  for (const f of ['api.php', '.htaccess']) fs.copyFileSync(path.join(APP, 'server-php', f), path.join(sp, f));
  const tok = 'v1212-' + crypto.randomBytes(8).toString('hex');
  const h = (s) => crypto.createHash('sha256').update(s).digest('hex');
  fs.writeFileSync(path.join(sp, 'config.php'), "<?php\nif (!defined('DOCMAP_API')) { http_response_code(404); exit; }\nreturn ['data_dir' => " + JSON.stringify(data) +
    ", 'aes_key' => '" + crypto.randomBytes(32).toString('base64') + "', 'tokens' => [['user' => 'dave', 'role' => 'admin', 'token_sha256' => '" + h(tok) + "']]" +
    ", 'allowed_origins' => ['null'], 'ai_provider' => 'mock'];\n");
  const port = 18000 + Math.floor(Math.random() * 900);
  const php = spawn('php', ['-S', '127.0.0.1:' + port, '-t', path.join(work, 'root'), path.join(__dirname, 'php-router.php')], {stdio:'ignore'});
  const api = 'http://127.0.0.1:' + port + '/studio-de/server-php/api.php';
  for (let i = 0; i < 50; i++){ try { const r = await fetch(api + '?r=ping'); if (r.ok) break; } catch(e){} await sleep(100); }

  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({viewport:{width:1366, height:900}});
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    p.on('dialog', d => d.accept());
    await p.goto(fileUrl('index.html')); await p.waitForTimeout(1300);
    await p.evaluate(() => { const m = document.querySelector('.modal-f [data-a="modal-btn"]'); if (m) m.click(); });
    ok(await p.evaluate(() => typeof invReport === 'function' && typeof ivpProHTML === 'function' && typeof ivqAiRun === 'function'), 'v12.12 loaded');

    /* ---------------- model ---------------- */
    const M = await p.evaluate(() => {
      const r = {};
      r.norm = normalizeInv({mode:'station', doc:true, price:{binder:'1,5', box:'', vat:'x'}, batches:[{kind:'doc', from:1, to:3}, {kind:'any', from:4, to:5}, {kind:'weird', from:6, to:6}]});
      r.old = normalizeInv({mode:'capture'}); r.bad = normalizeInv({mode:'nope'});
      r.kinds = [1, 4, 6, 9].map(n => invBatchKind(r.norm, n));
      r.counter = [invCounterKey('box'), invCounterKey('doc'), invCounterKey('any')];
      r.p0 = invPrices({}, {}); r.p1 = invPrices({price:{binder:2}}, {invPrices:{binder:1, box:3, vat:10}});
      r.bill = invBill({binders:120, boxes:4, docs:10}, {binder:1.2, box:2.5, doc:0.4, fixed:50, vat:22});
      r.tpls = invTemplates({invTemplates:[{id:'own-1', it:'Mio', tags:['A'], mode:'chain', years:5}]}).map(x => x.id + ':' + x.mode + (x.custom ? '*' : ''));
      r.tf = invTplFields(INV_TEMPLATES.find(x => x.id === 'legale'), 2026);
      r.tp = invTplFromProject({inv:{mode:'chain', tags:['X', 'Y'], year_from:2010, year_to:2020, doc:true, price:{binder:3}, client:'Segreto'}}, 'Il mio');
      r.ver = invVerify(['a', 'b', 'c'], ['b', 'x', 'y', 'b', 'a'], {x:'S002'});
      r.prompt = invAiPrompt('fatture 2019', invAiHints({tags:['Fatture', 'Bilanci'], year_from:2015, year_to:2022, client:'Rossi è', kind:'doc'}));
      r.prompt0 = invAiPrompt('', invAiHints({}));
      r.parse = [invAiParseText('```json\n{"a":1}\n```'), invAiParseText('Ecco {"b":2} fine'), invAiParseText('[1]'), invAiParseText('no')];
      r.ai = invAiNorm({company:' Rossi\u0001 ', year_from:'2021', year_to:2019, tags:['fatture', 'Altro', 3], confidence:'0.876', empty_spine:0, title:true}, invAiHints({tags:['Fatture']}));
      return r;
    });
    ok(M.norm.mode === 'station' && M.norm.doc === true && M.norm.price.binder === 1.5 && M.norm.price.box === null && M.norm.price.vat === null && M.norm.batches.map(x => x.kind).join() === 'doc,any,binder' && M.old.mode === 'capture' && M.bad.mode === 'box' && M.old.doc === false, 'model: modes, document level, prices, batch kinds normalised', M.norm);
    ok(M.kinds.join() === 'doc,any,binder,binder' && M.counter.join() === 'box_to,binder_to,binder_to', 'model: kind of a label from its batch; documents and jolly share the binder numbers', M);
    ok(M.p0.binder === 1.2 && M.p0.vat === 22 && M.p1.binder === 2 && M.p1.box === 3 && M.p1.vat === 10 && M.p1.doc === 0.4, 'prices: built-in < studio defaults < project quote', [M.p0, M.p1]);
    ok(M.bill.net === 208 && M.bill.vat === 45.76 && M.bill.gross === 253.76 && M.bill.lines.length === 4, 'billing: lines, VAT, total', M.bill);
    ok(M.tpls[0] === 'own-1:chain*' && M.tpls.includes('commercialista:box') && M.tpls.includes('ente:capture') && M.tf.doc && M.tf.year_from === 2011 && M.tf.tags.includes('Atti') && M.tp.years === 10 && M.tp.doc && M.tp.price.binder === 3 && !('client' in M.tp), 'templates: studio first, ready ones, fields, a project becomes a template without its client', M);
    ok(M.ver.found.join() === 'b,a' && M.ver.missing.join() === 'c' && M.ver.misplaced.length === 1 && M.ver.misplaced[0].from === 'S002' && M.ver.unknown.join() === 'y', 'verification: found, missing, misplaced, unknown', M.ver);
    ok(M.parse[0].a === 1 && M.parse[1].b === 2 && M.parse[2] === null && M.parse[3] === null, 'AI answer parsing (fences, text around, not a list)', M.parse);
    ok(M.ai.company === 'Rossi' && M.ai.year_from === 2019 && M.ai.year_to === 2021 && M.ai.tags.join() === 'Fatture' && M.ai.confidence === 0.88 && M.ai.empty_spine === false && M.ai.title === '1', 'AI normalisation (same rules as the servers)', M.ai);
    // the prompt of the PC = the prompt of the servers (Python port, itself compared with api.php by diff_test.py)
    const py = (code) => execFileSync('python3', ['-c', 'import sys, json; sys.path.insert(0, ' + JSON.stringify(path.join(APP, 'server-python')) + '); from docmap_server import api\n' + code], {encoding:'utf8'});
    const pyPrompt = JSON.parse(py('print(json.dumps([api.ai_prompt("fatture 2019", api.ai_hints({"tags": ["Fatture", "Bilanci"], "year_from": 2015, "year_to": 2022, "client": "Rossi è", "kind": "doc"})), api.ai_prompt("", api.ai_hints({})), api.DM_AI_JSON_HINT]))'));
    ok(pyPrompt[0] === M.prompt && pyPrompt[1] === M.prompt0 && pyPrompt[2] === await p.evaluate(() => INV_AI_JSON_HINT), 'AI prompt of the PC = prompt of the servers (spine and document)', {js:M.prompt.slice(0, 200), py:pyPrompt[0].slice(0, 200)});
    const pyNorm = JSON.parse(py('print(json.dumps(api.ai_norm({"company": " Rossi\\u0001 ", "year_from": "2021", "year_to": 2019, "tags": ["fatture", "Altro", 3], "confidence": "0.876", "empty_spine": 0}, api.ai_hints({"tags": ["Fatture"]}))))'));
    const jsNorm = await p.evaluate(() => invAiNorm({company:' Rossi\u0001 ', year_from:'2021', year_to:2019, tags:['fatture', 'Altro', 3], confidence:'0.876', empty_spine:0}, invAiHints({tags:['Fatture']})));
    ok(JSON.stringify(pyNorm) === JSON.stringify(jsNorm), 'AI normalisation of the PC = servers', {py:pyNorm, js:jsNorm});

    /* ---------------- PC: project from a template, prices, document labels ---------------- */
    await p.evaluate(() => { S.view = 'inv'; renderAll(); });
    await p.click('#ivp-new'); await p.waitForTimeout(150);
    await p.selectOption('#ivp-tpl', 'legale'); await p.waitForTimeout(50);
    const F = await p.evaluate(() => ({tags:$('#ivp-tags').value.split('\n'), doc:$('#ivp-doc').checked, mode:$('#ivp-mode').value, yf:+$('#ivp-yf').value, modes:Array.from($('#ivp-mode').options).map(o => o.value).join(), prices:$$('#ivp-prices input').length}));
    ok(F.tags.includes('Sentenze') && F.doc && F.mode === 'box' && F.yf === new Date().getFullYear() - 15 && F.modes === 'box,capture,station,chain' && F.prices === 5, 'PC form: template fills tags, years, document level; 4 modes; 5 price fields', F);
    await p.fill('#ivp-name', 'Verdi Legale 2026'); await p.fill('#ivp-nb', '3'); await p.fill('#ivp-nf', '6'); await p.fill('#ivp-pr-binder', '1,80');
    await p.locator('.modal-f .btn-primary').last().click(); await p.waitForTimeout(300);
    const P = await p.evaluate(() => { const a = invProjects()[0]; return {id:a.id, inv:a.inv}; });
    ok(P.inv.doc && P.inv.template === 'legale' && P.inv.price.binder === 1.8 && P.inv.price.box === null && P.inv.code === 'VERDI26', 'PC: project created from the template with its own binder price', P.inv);
    // document + jolly batches (their labels say DOCUMENTO / ETICHETTA and use binder codes)
    await p.click('#ivp-batch'); await p.waitForTimeout(150);
    const kinds = await p.evaluate(() => $$('#ivp-bt-kind button').map(x => x.dataset.k).join());
    await p.click('#ivp-bt-kind [data-k="doc"]'); await p.fill('#ivp-bt-n', '4');
    await p.locator('.modal-f .btn-primary').last().click(); await p.waitForTimeout(250);
    await p.evaluate(() => closeModal(true));
    const BT = await p.evaluate((id) => { const a = ivpProj(id); const j = ivpBatch(a, 'any', 3, true); commit();
      const d = a.inv.batches.find(x => x.kind === 'doc'); const items = ivpBatchCodes(a, d), sh = ivpSheets(a, items, 1).join('');
      const it2 = ivpBatchCodes(a, j); return {doc:[d.from, d.to], any:[j.from, j.to], to:a.inv.binder_to, docWord:sh.includes('DOCUMENTO'), anyWord:ivpSheets(a, it2, 1).join('').includes('ETICHETTA'), code:items[0].code.length, k7:invBatchKind(a.inv, 7), k11:invBatchKind(a.inv, 11)}; }, P.id);
    ok(kinds === 'binder,box,doc,any' && BT.doc.join() === '7,10' && BT.any.join() === '11,13' && BT.to === 13 && BT.docWord && BT.anyWord && BT.code === 12 && BT.k7 === 'doc' && BT.k11 === 'any', 'PC: document and jolly batches continue the binder numbering, printed DOCUMENTO / ETICHETTA', {kinds, BT});
    // Impostazioni › Inventario: default prices (single source) + local AI
    await p.evaluate(() => { S.view = 'settings'; renderAll(); });
    const ST = await p.evaluate(() => ({card:!!$('#ivq-set'), prices:$$('[data-ivq-price]').length, ai:!!$('#ivq-ai-url')}));
    await p.fill('[data-ivq-price="box"]', '3,5'); await p.press('[data-ivq-price="box"]', 'Tab');
    await p.check('#ivq-ai-on'); await p.waitForTimeout(50);
    const ST2 = await p.evaluate((id) => ({def:S.settings.invPrices.box, eff:invPrices(ivpProj(id).inv, S.settings), ai:S.settings.invAi}), P.id);
    ok(ST.card && ST.prices === 5 && ST.ai && ST2.def === 3.5 && ST2.eff.box === 3.5 && ST2.eff.binder === 1.8 && ST2.ai.on && ST2.ai.url === 'http://127.0.0.1:11434/v1', 'Impostazioni › Inventario: studio prices feed every project without its own; local AI switched on', ST2);

    /* ---------------- phone, local mode ---------------- */
    await p.evaluate(async () => { await dmProviders().auth.addUser({username:'inv2', display_name:'Ivo', role:'editor', secret:'135791'}); });
    const q = await ctx.newPage(); const qerrs = [];
    q.on('pageerror', e => qerrs.push('PAGEERR ' + e.message)); q.on('console', m => { if (m.type() === 'error') qerrs.push('CONSOLE ' + m.text()); });
    await q.setViewportSize({width:390, height:844});
    await q.goto(fileUrl('scan.html') + '?inv=' + encodeURIComponent(P.id)); await q.waitForTimeout(600);
    await q.fill('#sc-user', 'inv2'); await q.fill('#sc-pin', '135791'); await q.click('#sc-enter'); await q.waitForTimeout(1200);
    const code = (kind, n) => p.evaluate(({id, kind, n}) => invLabelCode(ivpProj(id).inv.prefix, kind, n), {id:P.id, kind, n});
    const C = {box1:await code('box', 1), box2:await code('box', 2), b1:await code('binder', 1), b2:await code('binder', 2), b3:await code('binder', 3), d7:await code('binder', 7), d8:await code('binder', 8), j11:await code('binder', 11), b4:await code('binder', 4), b5:await code('binder', 5)};
    let V = await q.evaluate(() => ({view:SC.view, folder:!!document.getElementById('iv-folder'), verifyBtn:!!document.getElementById('iv-verify-b'), w:[document.documentElement.scrollWidth, innerWidth]}));
    ok(V.view === 'inv' && V.folder && V.verifyBtn && V.w[0] <= V.w[1] + 1, 'phone: document bar + "Verifica una scatola", no h-scroll', V);
    await q.evaluate(() => { const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#000'; g.font = '48px sans-serif'; g.fillText('CONTRATTI 2020', 40, 240); IV.cam = {video:cv, stop(){}, attach(){}}; });
    const H = (c) => q.evaluate((c) => IV_API.ivHandle('https://qr7.it/' + c, 'test'), c);
    await H(C.d7); await q.waitForTimeout(150);
    V = await q.evaluate(() => ({msg:IV.msg.text, n:IV.list.length}));
    ok(/Prima il faldone/.test(V.msg) && V.n === 0, 'phone: a document label without an open binder is refused', V);
    await H(C.box1); await H(C.b1); await q.waitForTimeout(150);
    V = await q.evaluate(() => ({folder:IV.folder && IV.folder.code, bar:(document.querySelector('#iv-folder b') || {}).textContent}));
    ok(V.folder === 'VERDI26-0001' && V.bar === 'VERDI26-0001', 'phone: a new binder opens itself for its documents', V);
    await H(C.d7); await H(C.d8); await q.waitForTimeout(150);
    await q.evaluate(() => { IV.jolly = 'doc'; }); await H(C.j11); await q.waitForTimeout(150);
    let L = await q.evaluate(() => { const st = JSON.parse(localStorage.getItem(LS_KEY)); return st.binders.filter(b => /^inv-/.test(b.id)).map(b => ({sc:b.speaking_code, lvl:b.inv.lvl || '', parent:b.inv.parent || '', loc:b.location_id, folder:b.inv.folder || ''})); });
    const dl = L.filter(x => x.lvl === 'doc');
    ok(L.length === 4 && dl.length === 3 && dl.every(x => x.parent === 'inv-' + C.b1 && x.loc === 'inv-' + C.box1 && x.folder === 'VERDI26-0001'), 'phone: documents (and a jolly chosen as document) inside the open binder, in its box', L);
    V = await q.evaluate(() => ({n:(document.querySelector('#iv-folder small') || {}).textContent, msg:IV.msg.text}));
    ok(/3 documenti/.test(V.n) && /Documento VERDI26-0011 in VERDI26-0001/.test(V.msg), 'phone: binder bar counts its documents', V);
    // re-scan of a binder already captured re-opens it; a new box closes it and says what the last box held
    await q.evaluate(() => { IV.jolly = 'binder'; IV.folder = null; }); await H(C.b1); await q.waitForTimeout(100);
    V = await q.evaluate(() => ({folder:IV.folder && IV.folder.code, msg:IV.msg.text}));
    ok(V.folder === 'VERDI26-0001' && /Faldone aperto/.test(V.msg), 'phone: scanning a captured binder opens it again', V);
    await H(C.b2); await q.waitForTimeout(100); await q.evaluate(() => IV_API.ivToggleYear(2018)); await q.waitForTimeout(50);
    await H(C.box2); await q.waitForTimeout(150);
    V = await q.evaluate(() => ({msg:IV.msg.text, folder:IV.folder}));
    ok(/Chiusa VERDI26-S001: 2 faldoni, anni 2018/.test(V.msg) && /VERDI26-S002/.test(V.msg) && V.folder === null, 'phone: new box → summary of the box just closed, open binder closed', V);
    // first-page photo
    await H(C.b3); await q.waitForTimeout(100);
    await q.click('#iv-page'); await q.waitForTimeout(1600);
    V = await q.evaluate(async (c) => { const st = JSON.parse(localStorage.getItem(LS_KEY)); const b = st.binders.find(x => x.short_code === c); const ph = b && b.inv.ph2 ? await IVDB.get(b.inv.ph2) : null; return {ph2:b && b.inv.ph2, data:ph ? ph.data.slice(0, 23) : ''}; }, C.b3);
    ok(/^ph-.*-p/.test(V.ph2 || '') && V.data === 'data:image/jpeg;base64,', 'phone: "Foto della prima pagina" keeps a second photo of the binder', V);
    // Bluetooth / USB scanner: fast keys outside a field + Enter
    await q.evaluate((c) => { document.activeElement && document.activeElement.blur(); const txt = 'https://qr7.it/' + c; for (const ch of txt) document.dispatchEvent(new KeyboardEvent('keydown', {key:ch, bubbles:true})); document.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true})); }, C.b4);
    await q.waitForTimeout(300);
    V = await q.evaluate(() => ({last:IV.last && IV.last.speaking_code, via:IV.list[IV.list.length - 1].via}));
    ok(V.last === 'VERDI26-0004' && V.via === 'phone-hid', 'phone: Bluetooth scanner (keyboard wedge) captures without touching the screen', V);
    // slow typing outside a field is not a reading
    await q.evaluate(async (c) => { for (const ch of c){ document.dispatchEvent(new KeyboardEvent('keydown', {key:ch, bubbles:true})); await new Promise(r => setTimeout(r, 90)); } document.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true})); }, C.b5);
    await q.waitForTimeout(200);
    ok(await q.evaluate(() => IV.last.speaking_code === 'VERDI26-0004'), 'phone: slow typing is not taken as a scanner reading');

    /* ---------------- phone: box verification (local) ---------------- */
    await q.click('#iv-verify-b'); await q.waitForTimeout(400);
    V = await q.evaluate(() => ({on:!!IV.verify, load:IV.verify && IV.verify.loading, map:IV.verify && IV.verify.map.size, p:!!document.getElementById('iv-verify')}));
    ok(V.on && !V.load && V.map >= 7 && V.p, 'verify: project list loaded (with boxes), verification card', V);
    await H(C.b1); await q.waitForTimeout(80);
    ok(await q.evaluate(() => /Prima la scatola/.test(IV.msg.text)), 'verify: binder before the box refused');
    await H(C.box1); await H(C.b1); await H(C.b1); await H(C.b4); await H(C.b5); await H(C.d7); await q.waitForTimeout(200);
    V = await q.evaluate(() => { const r = IV_API.ivVerifyResult(); return {exp:IV.verify.expected.length, found:r.found.length, missing:r.missing.length, mis:r.misplaced.map(x => x.from), unk:r.unknown.length, k:(document.getElementById('iv-vk') || {}).textContent}; });
    ok(V.exp === 2 && V.found === 1 && V.missing === 1 && V.mis.join() === 'VERDI26-S002' && V.unk === 1 && /1 \/ 2/.test(V.k), 'verify: box S001 expects 2 binders; 1 found, 1 missing, 1 misplaced (in S002), 1 not inventoried; documents not counted', V);
    await q.click('[data-s="iv-v-move"]'); await q.waitForTimeout(400);
    await q.click('[data-s="iv-v-cap"]'); await q.waitForTimeout(500);
    V = await q.evaluate((c) => { const st = JSON.parse(localStorage.getItem(LS_KEY)); const r = IV_API.ivVerifyResult(); const b4 = st.binders.find(x => x.short_code === c.b4), b5 = st.binders.find(x => x.short_code === c.b5);
      return {b4:b4 && b4.location_id, b5:b5 && b5.location_id, found:r.found.length, mis:r.misplaced.length, unk:r.unknown.length, exp:IV.verify.expected.length}; }, C);
    ok(V.b4 === 'inv-' + C.box1 && V.b5 === 'inv-' + C.box1 && V.found === 3 && V.mis === 0 && V.unk === 0 && V.exp === 4, 'verify: "Sposta qui" moves the binder, "Acquisisci qui" captures it in this box', V);
    await q.click('#iv-verify-close'); await q.waitForTimeout(600);
    V = await q.evaluate(() => ({msg:IV.msg.text, box:IV.verify.box}));
    ok(/Verifica VERDI26-S001: 3 su 4 trovati, 1 mancanti/.test(V.msg) && V.box === null, 'verify: closing says the result', V);
    await q.click('#iv-verify-exit'); await q.waitForTimeout(150);
    ok(await q.evaluate(() => !IV.verify && !!document.getElementById('iv-box')), 'verify: back to the inventory');
    await q.waitForTimeout(700);
    // PC merges the captures, the documents and the verification line
    await p.evaluate((id) => { S.view = 'inv'; IVP.open = id; renderAll(); }, P.id); await p.waitForTimeout(500);
    const PC = await p.evaluate((id) => { const a = ivpProj(id), L = ivpBinders(a); return {n:L.length, docs:L.filter(b => invLevel(b) === 'doc').length, ver:$$('#ivq-ver li').length, verTxt:($('#ivq-ver li') || {}).textContent, lv:!!$('#ivp-level'), moved:L.find(b => b.speaking_code === 'VERDI26-0004').location_id}; }, P.id);
    ok(PC.n === 8 && PC.docs === 3 && PC.ver === 1 && /S001: 3 su 4 trovati/.test(PC.verTxt) && /1 mancanti/.test(PC.verTxt) && PC.lv && PC.moved === 'inv-' + C.box1, 'PC: phone work merged live (documents, move, verification listed)', PC);
    await p.click('#ivp-level [data-v="doc"]'); await p.waitForTimeout(150);
    ok(await p.evaluate(() => $$('.ivp-item').length === 3 && /Documento in VERDI26-0001/.test($('.ivp-item').textContent)), 'PC: level filter shows the documents and their binder');
    await p.click('#ivp-level [data-v=""]'); await p.waitForTimeout(100);
    ok(qerrs.length === 0, 'no JS errors on the phone (local)', qerrs);

    /* ---------------- PC: AI from the PC with a LOCAL model (fake OpenAI-compatible service) ---------------- */
    const AI = await p.evaluate(async (id) => {
      const a = ivpProj(id), seen = [];
      S.settings.invAi = {on:true, url:'http://127.0.0.1:11434/v1', model:'qwen2.5vl:7b'};
      const f0 = window.fetch;
      window.fetch = async (url, o) => { const body = JSON.parse(o.body); seen.push({url, model:body.model, img:(body.messages[0].content[1] || {}).type || '', kind:/prima pagina di un documento/.test(body.messages[0].content[0].text) ? 'doc' : /costa era vuota/.test(body.messages[0].content[0].text) ? 'page' : 'spine'});
        return new Response(JSON.stringify({model:'qwen2.5vl:7b', choices:[{message:{content:'```json\n{"company":"Verdi Avv.","title":"Causa Bianchi","year_from":2018,"tags":["atti"],"confidence":0.93}\n```'}}]}), {status:200, headers:{'Content-Type':'application/json'}}); };
      const n0 = ivqAiTodo(a).length; S.view = 'inv'; IVP.open = id; renderAll();
      const btn = !!$('#ivq-ai-btn');
      try { await ivqAiRun(id); } finally { window.fetch = f0; }
      const L = ivpBinders(a), done = L.filter(b => b.inv.ai && b.inv.ai.via === 'pc');
      const b2 = L.find(b => b.speaking_code === 'VERDI26-0002');
      return {n0, btn, seen:seen.length, url:seen[0] && seen[0].url, img:seen.every(x => x.img === 'image_url'), kinds:Array.from(new Set(seen.map(x => x.kind))).sort().join(), done:done.length, left:ivqAiTodo(a).length,
        b2:{co:b2.company_name, t:b2.binder_title, y:b2.ref_year, tags:b2.tags, st:b2.inv.st, prov:b2.inv.ai.provider}, log:LOG.entries.some(e => e.action === 'inventory.ai')};
    }, P.id);
    ok(AI.btn && AI.n0 >= 6 && AI.seen === AI.n0 && AI.url === 'http://127.0.0.1:11434/v1/chat/completions' && AI.img && AI.kinds === 'doc,page,spine' && AI.done === AI.n0 && AI.left === 0 && AI.log, 'PC: "Leggi con l\'AI" with a local model reads every photo (spine, document, first page)', AI);
    ok(AI.b2.co === 'Verdi Avv.' && AI.b2.t === 'Causa Bianchi' && AI.b2.y === '2018' && /Atti/.test(AI.b2.tags) && AI.b2.st === 'proposed' && AI.b2.prov === 'local', 'PC: local AI fills the empty fields (the year typed on the phone stays), safe proposal', AI.b2);

    /* ---------------- PC: report + CSV, template, live ---------------- */
    const R = await p.evaluate((id) => { const a = ivpProj(id); const r = ivqReport(a); return {binders:r.binders, docs:r.docs, boxes:r.boxes, perBox:r.perBox.map(x => x.code + ':' + x.n), ops:r.operators.map(o => o.who + ':' + o.n), ver:r.verifications.length, bill:r.bill, unused:r.labels.unusedBin, ai:r.ai.read}; }, P.id);
    ok(R.binders === 5 && R.docs === 3 && R.boxes === 2 && R.perBox.join() === 'VERDI26-S001:4,VERDI26-S002:1' && R.ops.join() === 'Ivo:8' && R.ver === 1 && R.unused === 5 && R.ai === 8, 'report: binders, documents, boxes, per box, operators, verifications, unused labels', R);
    ok(R.bill.lines.map(l => l.k + ':' + l.qty + 'x' + l.unit).join() === 'binder:5x1.8,box:2x3.5,doc:3x0.4' && R.bill.net === 17.2 && R.bill.gross === 20.98, 'report: billing with the project price (binder) and the studio defaults (box, document)', R.bill);
    await p.click('#ivq-report'); await p.waitForTimeout(250);
    const RM = await p.evaluate(() => ({h:($('#ivq-r h1') || {}).textContent, tables:$$('#ivq-r table').length, total:/20,98/.test($('#ivq-r').textContent)}));
    let csv = null; await p.evaluate(() => { window.__dl = window.download; window.download = (n, t2) => { window.__csv = {n, t:t2}; }; });
    await p.locator('.modal-f .btn').nth(1).click(); await p.waitForTimeout(100);
    csv = await p.evaluate(() => { window.download = window.__dl; return window.__csv; });
    ok(/Report di fine lavoro — Verdi Legale 2026/.test(RM.h) && RM.tables >= 4 && RM.total && csv && /_report_inventario_verdi26\.csv$/.test(csv.n) && /fattura;totale;;;;20,98/.test(csv.t) && /operatore;Ivo;8;3;/.test(csv.t), 'report: modal (print layout) and CSV download', {RM, csv:csv && csv.t.slice(0, 300)});
    await p.evaluate(() => closeModal(true));
    await p.click('#ivq-tpl'); await p.waitForTimeout(150); await p.fill('#ivq-tpl-n', 'Studi legali con documenti'); await p.locator('.modal-f .btn-primary').last().click(); await p.waitForTimeout(150);
    const TP = await p.evaluate(() => ({own:invTemplates(S.settings).filter(x => x.custom).map(x => x.it + ':' + x.mode + ':' + x.doc + ':' + x.price.binder), client:JSON.stringify(S.settings.invTemplates).includes('Verdi 2026')}));
    ok(TP.own.join() === 'Studi legali con documenti:box:true:1.8' && !TP.client, 'PC: "Salva come modello" keeps the setup, not the client', TP);
    await p.click('#ivq-live'); await p.waitForTimeout(400);
    const LV = await p.evaluate(() => ({card:!!$('#ivq-live-card'), rows:$$('.ivq-row').length, inputs:$$('.ivq-row [data-ivf]').length, timer:!!IVQ.liveTimer}));
    ok(LV.card && LV.rows === 8 && LV.inputs === 32 && LV.timer, 'PC live: the newest captures with editable fields, refreshing', LV);
    await p.evaluate(() => { S.view = 'archive'; renderAll(); }); await p.waitForTimeout(100);
    ok(await p.evaluate(() => !IVQ.live && !IVQ.liveTimer), 'PC live: leaving the project stops the refresh');

    /* ---------------- fixed station and chain on the phone ---------------- */
    await p.evaluate((id) => { const a = ivpProj(id); a.inv.mode = 'station'; archTouch(a); commit(); }, P.id);
    await q.reload(); await q.waitForTimeout(1500);
    await q.evaluate(() => { const cv = document.createElement('canvas'); cv.width = 320; cv.height = 240; IV.cam = {video:cv, stop(){}, attach(){}}; IV_API.ivHandle('nonsense', 'test'); });
    await q.waitForTimeout(60);
    V = await q.evaluate(() => ({station:!!document.querySelector('.iv-main.iv-station'), more:!!document.querySelector('details#iv-more .iv-tags'), hint:/Stazione fissa/.test((document.getElementById('iv-mode-hint') || {}).textContent || ''), burst:!!document.querySelector('.iv-burst.err')}));
    ok(V.station && V.more && V.hint && V.burst, 'phone station mode: big camera, controls folded, screen flash readable from a distance', V);
    ok(qerrs.length === 0, 'no JS errors on the phone (station)', qerrs);

    /* ---------------- against the real server: detail=1, verification, AI from the PC ---------------- */
    const SV = await q.evaluate(async ({api, tok, pj}) => {
      const r = {};
      const dp = new RemoteDataProvider({apiBase:api}, () => tok); dp.srv = new DMServer(api, tok, {simple:true});
      const proj = Object.assign({}, pj, {inv:Object.assign({}, pj.inv, {mode:'box', ai:true})});
      await dp.srv.call('push', {method:'POST', body:{records:[{type:'archive', id:proj.id, updated_at:new Date().toISOString(), data:proj}], tombstones:[]}});
      SC.P.data = dp; IV.list = []; IV.last = null; IV.box = null; IV.folder = null;
      localStorage.removeItem(IV_API.IV_OUTBOX_LS);
      await IV_API.ivOpen(proj.id);
      const c = (k, n) => invLabelCode(proj.inv.prefix, k, n);
      await IV_API.ivHandle(c('box', 3), 't'); await IV_API.ivHandle(c('binder', 20), 't'); await IV_API.ivHandle(c('binder', 21), 't');   // 20, 21 beyond binder_to → refused
      r.range = /oltre/.test(IV.msg.text);
      for (let i = 0; i < 40 && IV_API.ivOutbox().length; i++) await new Promise(res => setTimeout(res, 150));
      await IV_API.ivHandle(c('binder', 5), 't'); await IV_API.ivHandle(c('binder', 6), 't');
      for (let i = 0; i < 60 && (IV_API.ivOutbox().length || IV.flushing.rec || IV.flushing.ai); i++) await new Promise(res => setTimeout(res, 150));
      const det = await dp.invGet(proj.id, {detail:true}); r.det = det.scanned.filter(x => x.t === 'b').map(x => x.n + '@' + (x.l || '').slice(-4) + (x.d ? 'D' : '')).sort();
      const plain = await dp.invGet(proj.id); r.plain = plain.scanned.some(x => 'l' in x);
      await IV_API.ivVerifyStart(); await IV_API.ivVerifyBox(c('box', 3), 3); await IV_API.ivVerifyScan(c('binder', 6), 6, 't');
      const vr = IV_API.ivVerifyResult(); r.ver = {exp:IV.verify.expected.length, found:vr.found.length, missing:vr.missing.length};
      IV_API.ivVerifyClose(false); IV.verify = null;
      for (let i = 0; i < 40 && IV_API.ivOutbox().length; i++) await new Promise(res => setTimeout(res, 150));
      const pull = await dp.srv.call('pull', {q:{since:0}}); r.log = (pull.activity_log || []).filter(e => e.action === 'inventory.verify').map(e => e.details.found + '/' + e.details.expected);
      r.left = IV_API.ivOutbox().length;
      return r;
    }, {api, tok, pj:await p.evaluate((id) => clone(ivpProj(id)), P.id)});
    ok(SV.range && SV.det.length >= 2 && SV.det.some(x => /VERDI26-0005@AAAD/.test(x)) && !SV.plain, 'server: detail=1 gives box and number of each binder (plain call unchanged)', SV);
    ok(SV.ver.exp === 2 && SV.ver.found === 1 && SV.ver.missing === 1 && SV.log.includes('1/2') && SV.left === 0, 'server: verification on the phone and its log line on the server', SV);
    // PC: AI from the PC through the server (mock), a photo only on this PC goes with the request
    const SA = await p.evaluate(async ({api, tok, pid}) => {
      localStorage.setItem('docmap_v26_srv', JSON.stringify({url:api, token:tok}));
      const a = ivpProj(pid), b = ivpBinders(a).find(x => x.speaking_code === 'VERDI26-0002');
      b.inv = Object.assign({}, b.inv, {ai:null, st:'captured', voice:'contratti 2016'}); b.binder_title = ''; ivpTouch(b);
      const cv = document.createElement('canvas'); cv.width = 80; cv.height = 60; const u = cv.toDataURL('image/jpeg', 0.7);
      await IVDB.put(b.inv.ph2 || b.inv.ph, {id:b.inv.ph2 || b.inv.ph, mime:'image/jpeg', data:u});
      await ivqAiRun(pid);
      localStorage.removeItem('docmap_v26_srv');
      return {prov:b.inv.ai && b.inv.ai.provider, model:b.inv.ai && b.inv.ai.model, title:b.binder_title, st:b.inv.st};
    }, {api, tok, pid:P.id});
    ok(SA.prov === 'mock' && SA.model === 'mock' && SA.title === 'contratti 2016' && SA.st === 'proposed', 'PC: "Leggi con l\'AI" through the server (photo sent along when the server does not have it)', SA);

    /* ---------------- old data: a 26.12.11 project (no mode extras, no prices) ---------------- */
    const OLD = await p.evaluate(() => { const a = archCreate({name:'Vecchio', code:'OLD'}); a.inv = normalizeInv({prefix:invNewPrefix(), code:'OLD', mode:'box', batches:[{id:'x', kind:'binder', from:1, to:5}], binder_to:5}); archTouch(a); commit();
      const r = invReport(a, S.binders, S.locations, LOG.entries, S.settings, 120000); S.view = 'inv'; IVP.open = a.id; renderAll(); return {k:invBatchKind(a.inv, 3), doc:a.inv.doc, price:invPrices(a.inv, S.settings).binder, bill:r.bill.net, page:!!$('#ivq-report')}; });
    ok(OLD.k === 'binder' && OLD.doc === false && OLD.price === 1.2 && OLD.bill === 0 && OLD.page, 'old 26.12.11 project: works unchanged, studio prices, empty bill', OLD);
    ok(errs.filter(x => !/status of 404/.test(x)).length === 0, 'no JS errors on the PC (the expected 404 of a photo the server does not have aside)', errs);
    ok(qerrs.filter(x => !/Failed to load resource: the server responded with a status of 40[34]/.test(x)).length === 0, 'no JS errors on the phone (server)', qerrs);
  } finally { await b.close(); php.kill(); }
  console.log(`\nV12.12: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
