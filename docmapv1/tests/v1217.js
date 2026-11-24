// v12.17 (26.12.17) checks (~25 s): the missing foundations of the AI reading (docs/RICONOSCIMENTO.md §5).
// Model: one versioned shape for every reading (field_conf, prompt_v, provider), fields to check, state after a reading,
// same prompt / normalisation as the Python server; tag vocabulary of the client (synonyms, excluded words, voice,
// suggested new tags, never names); test bench (score of a reading against a confirmed binder, summary, calibration).
// PC: a reading with a doubtful field goes to review, yellow in the grid, never confirmed in bulk; vocabulary card
// (save, suggestion → tag, suggestion → excluded); test bench with a local model (run kept, history, log); scan.html loads.
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node v1217.js
const {chromium} = require('playwright');
const path = require('path');
const {execFileSync} = require('child_process');
const APP = path.resolve(__dirname, '..');
const fileUrl = f => 'file://' + path.join(APP, f).replace(/\\/g, '/');
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) passes++; else { fails++; console.log('  ✗ FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 900) : ''); } };
const py = (code) => execFileSync('python3', ['-c', 'import sys, json; sys.path.insert(0, ' + JSON.stringify(path.join(APP, 'server-python')) + '); from docmap_server import api\n' + code], {encoding:'utf8'});
(async () => {
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({viewport:{width:1366, height:900}});
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    p.on('dialog', d => d.accept());
    await p.goto(fileUrl('index.html')); await p.waitForTimeout(1300);
    await p.evaluate(() => { const m = document.querySelector('.modal-f [data-a="modal-btn"]'); if (m) m.click(); });
    ok(await p.evaluate(() => typeof invAiStamp === 'function' && typeof invVocabSuggest === 'function' && typeof ivyAiHTML === 'function' && INV_AI_PROMPT_V === 2), 'v12.17 loaded');

    /* ---------------- model: one shape for every reading ---------------- */
    const RAW = {company:'Rossi Srl', title:'Fatture acquisti', year_from:2019, year_to:2019, doc_type:'', tags:['iva', 'Altro'], confidence:0.9, field_conf:{company:0.95, title:'0.8', years:0.4, doc_type:0.9, tags:7}};
    const HINTS = {tags:['Fatture', 'IVA', 'iva']};
    const M = await p.evaluate(({RAW, HINTS}) => {
      const r = {}, h = invAiHints(HINTS);
      r.n = invAiNorm(RAW, h);
      r.n0 = invAiNorm({company:'X', title:'', confidence:0.7}, h);
      r.prompt = /field_conf = quanto sei sicuro di ogni campo/.test(invAiPrompt('', h)) && /field_conf, empty_spine/.test(INV_AI_JSON_HINT);
      r.old = invAiFieldConf({company:'A', title:'B', year_from:2001, tags:[], confidence:0.8});
      r.d = [invAiDoubts(r.n), invAiDoubts({company:'A', confidence:0.5}), invAiDoubts({company:'A', confidence:0.9})];
      r.st = [invAiState(r.n, 0.85, '', 'captured'), invAiState(Object.assign({}, r.n, {field_conf:{company:0.95, title:0.9, years:0.9, doc_type:0, tags:0.9}}), 0.85, '', 'captured'),
        invAiState(r.n, 0.85, 'detto a voce', 'captured'), invAiState(r.n, 0.85, '', 'confirmed'), invAiState({confidence:0.99, empty_spine:true}, 0.85, '', '')];
      r.stamp = invAiStamp(r.n, {provider:'anthropic', model:'m1', prompt_v:2, ms:1200}, {via:'pc'});
      r.stamp1 = invAiStamp(r.n0, {model:'old'});
      return r;
    }, {RAW, HINTS});
    ok(M.n.field_conf.company === 0.95 && M.n.field_conf.title === 0.8 && M.n.field_conf.years === 0.4 && M.n.field_conf.doc_type === 0 && M.n.field_conf.tags === 1, 'reading: confidence of each field from the model, clamped, 0 for an empty field', M.n.field_conf);
    ok(M.n0.field_conf.company === 0.7 && M.n0.field_conf.title === 0 && M.n0.field_conf.years === 0 && M.prompt, 'reading without field_conf: the overall figure on the filled fields; prompt and JSON hint ask for it', M.n0);
    ok(M.old.company === 0.8 && M.old.title === 0.8 && M.old.years === 0.8 && M.old.tags === 0 && M.old.doc_type === 0, 'readings saved before v12.17 get a field confidence too', M.old);
    ok(M.d[0].join() === 'years' && M.d[1].join() === 'company' && M.d[2].length === 0, 'fields to check: filled and below 60%', M.d);
    ok(M.st.join() === 'review,proposed,proposed,confirmed,review', 'state: a doubtful field → review; voice wins; confirmed stays; empty spine → review', M.st);
    ok(M.stamp.provider === 'anthropic' && M.stamp.model === 'm1' && M.stamp.prompt_v === 2 && M.stamp.ms === 1200 && M.stamp.via === 'pc' && M.stamp.at && M.stamp.field_conf.years === 0.4 && M.stamp1.prompt_v === 1,
      'saved reading: who read it, model, prompt version (1 for old servers), time', M.stamp);
    // same normalisation and prompt as the servers (Python port; diff_test.py compares it with api.php)
    const pyN = JSON.parse(py('print(json.dumps([api.ai_norm(' + JSON.stringify(RAW) + ', api.ai_hints(' + JSON.stringify(HINTS) + ')), api.ai_norm({"company": "X", "title": "", "confidence": 0.7}, api.ai_hints(' + JSON.stringify(HINTS) + ')), api.DM_AI_PROMPT_V, api.ai_schema()["required"]]))'));
    ok(JSON.stringify(pyN[0]) === JSON.stringify(M.n) && JSON.stringify(pyN[1]) === JSON.stringify(M.n0) && pyN[2] === 2 && pyN[3].includes('field_conf'), 'PC normalisation = servers (field_conf, prompt version, schema)', {py:pyN[0], js:M.n});
    const mock = JSON.parse(py('import os, tempfile\nprint(json.dumps(api.ai_norm(api.ai_mock("fatture 2019", api.ai_hints({"tags": ["Fatture"]})), api.ai_hints({"tags": ["Fatture"]}))))'));
    ok(mock.field_conf && mock.field_conf.years === 0.9 && mock.field_conf.company === 0, 'test provider of the servers answers with field_conf too', mock);

    /* ---------------- model: tag vocabulary ---------------- */
    const V = await p.evaluate(() => {
      const r = {}, inv = normalizeInv({tags:['Fatture', 'Bilanci'], vocab:{syn:[{tag:'IVA', words:'iva, I.V.A., imposta valore aggiunto, IVA, Imposta  Valore Aggiunto'}, {tag:'Fatture', words:['fatt.', 'fatture']}, {tag:'', words:'x'}], stop:'Varie, documenti,  ,'}});
      r.v = inv.vocab;
      r.txt = invVocabText(inv.vocab); r.back = JSON.stringify(invVocabParse(r.txt, inv.vocab.stop)) === JSON.stringify(inv.vocab);
      r.map = invVocabMapTags(['i.v.a.', 'varie', 'FATTURE', 'Bilanci', 'sconosciuto', 'Imposta  valore aggiunto'], inv);
      r.find = invVocabFind('Dichiarazione I.V.A. 2019 e fatt. passive', inv);
      r.hint = invVocabHintTags(inv);
      r.ai = invAiTags({tags:['iva'], text:'BILANCI 2018 - varie', title:''}, inv);
      r.voice = invParseVoice('fatture e imposta valore aggiunto 2020', inv);
      r.fold = [invFold('Contabilità'), invFold("I.V.A."), invFold('  dell’anno  ')];
      const bs = ['Cespiti ammortamenti 2019', 'Registro cespiti', 'cespiti 2021', 'Rossi Mario cespiti'].map((tx, i) => ({company_name:i === 3 ? 'Rossi Mario' : '', binder_title:'', inv:{ai:{text:tx, title:'Varie mario', company:''}}}));
      bs.push({company_name:'', binder_title:'', inv:{ai:{text:'iva iva iva', title:'', company:''}}});
      r.sugg = invVocabSuggest(bs, inv);
      r.tpl = invTplFromProject({inv}, 'Con vocabolario').vocab.syn.length;
      r.tplf = invTplFields(invTplNorm({it:'x', vocab:inv.vocab})).vocab.syn.length;
      return r;
    });
    ok(V.v.syn.length === 2 && V.v.syn[0].words.join('|') === 'imposta valore aggiunto' && V.v.syn[1].words.join('|') === 'fatt.' && V.v.stop.join() === 'varie,documenti', 'vocabulary normalised: one entry per tag, spellings that only differ by case / dots / spaces kept once, excluded words folded', V.v);
    ok(V.back && V.txt.split('\n')[0] === 'IVA = imposta valore aggiunto', 'vocabulary text form for the PC editor (and back)', V.txt);
    ok(V.map.join() === 'IVA,Fatture,Bilanci', 'words → canonical tags (synonyms, case, dots, spaces); unknown and excluded words dropped', V.map);
    ok(V.find.includes('IVA') && V.find.includes('Fatture') && V.find.length === 2, 'tags named as whole words in a transcription', V.find);
    ok(V.hint.slice(0, 3).join() === 'Fatture,Bilanci,IVA' && V.hint.includes('imposta valore aggiunto') && V.hint.includes('fatt.') && V.hint.length <= 40, 'tags sent to the AI: canonical first, then synonyms (max 40)', V.hint);
    ok(V.ai.join() === 'IVA,Bilanci', 'tags of a reading: the model\'s choice + the transcription, canonical, excluded words never', V.ai);
    ok(V.voice.tags.includes('Fatture') && V.voice.tags.includes('IVA') && V.voice.years[0] === 2020, 'voice: a synonym said aloud becomes its tag', V.voice);
    ok(V.fold.join('|') === 'contabilita|iva|dellanno', 'same word whatever accents, case, dots and apostrophes', V.fold);
    ok(V.sugg.length === 1 && V.sugg[0].w === 'cespiti' && V.sugg[0].n === 4, 'suggested new tags: words on ≥3 binders; never names, excluded words, short words or tags already there', V.sugg);
    ok(V.tpl === 2 && V.tplf === 2, 'templates carry the vocabulary', V);

    /* ---------------- model: test bench ---------------- */
    const B = await p.evaluate(() => {
      const inv = normalizeInv({tags:['Fatture', 'IVA'], vocab:{syn:[{tag:'IVA', words:['iva']}]}});
      const truth = {company_name:'Rossi Srl', binder_title:'Fatture acquisti 2019', ref_year:'2019', category:'', tags:'Fatture, IVA'};
      const s1 = invBenchScore(truth, {company:'ROSSI S.R.L.', title:'fatture acquisti', year_from:2019, year_to:2019, doc_type:'', tags:['iva', 'Fatture']}, inv);
      const s2 = invBenchScore(truth, {company:'Bianchi', title:'Contratti', year_from:2018, year_to:2019, doc_type:'Fatture', tags:['Fatture']}, inv);
      const s3 = invBenchScore({company_name:'', binder_title:'', ref_year:'2010-2012', category:'', tags:''}, {company:'', title:'', year_from:2010, year_to:2012, doc_type:'', tags:[]}, inv);
      const sum = invBenchSummary([{score:s1, conf:0.95, ms:900}, {score:s2, conf:0.9, ms:2100}, {score:s3, conf:0.5, ms:1500}], 0.85);
      const lst = invBenchListNorm([{at:'x', n:'3', ok:1, acc:{company:2, title:'0.5', years:null}, calib:-1}].concat(Array.from({length:20}, () => ({n:1}))));
      return {s1, s2, s3, sum, lst:lst.length, first:invBenchListNorm([{n:'3', acc:{company:2, title:'0.5', years:null}, calib:-1}])[0]};
    });
    ok(B.s1.company === true && B.s1.title === true && B.s1.years === true && B.s1.doc_type === null && B.s1.tags === true, 'bench: a right reading (case, dots, synonyms do not matter)', B.s1);
    ok(B.s2.company === false && B.s2.title === false && B.s2.years === false && B.s2.doc_type === false && B.s2.tags === false, 'bench: a wrong reading, field by field', B.s2);
    ok(B.s3.years === true && B.s3.company === null && B.s3.tags === null, 'bench: fields neither side has are not counted', B.s3);
    ok(B.sum.n === 3 && B.sum.ok === 2 && B.sum.acc.company === 0.5 && B.sum.acc.years === 0.67 && B.sum.ms === 1500 && B.sum.calib === 0.5, 'bench summary: accuracy per field, all right, median time, reliability of the confident readings', B.sum);
    ok(B.lst === 12 && B.first.n === 3 && B.first.acc.company === 1 && B.first.acc.title === 0.5 && B.first.acc.years === null && B.first.calib === 0, 'bench runs normalised and capped', B);

    /* ---------------- PC: project, readings, grid ---------------- */
    await p.evaluate(() => { S.view = 'inv'; IVP.open = ''; renderAll(); });
    await p.click('#ivp-new'); await p.waitForTimeout(250);
    await p.fill('#ivp-name', 'Verdi AI 2026'); await p.fill('#ivp-nb', '2'); await p.fill('#ivp-nf', '10');
    await p.evaluate(() => { const b = Array.from(document.querySelectorAll('.modal-f button')).find(x => x.classList.contains('btn-primary')); b.click(); }); await p.waitForTimeout(400);
    const P = await p.evaluate(() => { const a = invProjects().find(x => x.name === 'Verdi AI 2026'); return a ? {id:a.id} : null; });
    ok(!!P, 'project created');
    let E = await p.evaluate((id) => {
      const a = ivpProj(id); a.inv.tags = invNormTags(['Fatture', 'IVA', 'Bilanci']);
      a.inv.vocab = invVocabNorm({syn:[{tag:'IVA', words:['imposta valore aggiunto']}]});
      const mk = (n, o) => { const code = invLabelCode(a.inv.prefix, 'binder', n); const x = normalizeBinder(Object.assign({id:'inv-' + code, short_code:code, speaking_code:invNumber(a.inv, 'binder', n), archive_id:id, inv:{ph:'ph-t-' + n, at:new Date(Date.now() - (20 - n) * 60000).toISOString(), st:'captured', n}}, o)); S.binders.push(x); return x; };
      const b1 = mk(1, {}), b2 = mk(2, {});
      for (let n = 3; n <= 7; n++) mk(n, {company_name:'Verdi Srl', binder_title:'Fatture acquisti ' + (2010 + n), ref_year:String(2010 + n), tags:'Fatture, IVA', inv:{ph:'ph-t-' + n, at:new Date(Date.now() - (20 - n) * 60000).toISOString(), st:'confirmed', n,
        ai:{text:'Verdi cespiti fatture ' + (2010 + n), title:'Fatture acquisti', company:'Verdi'}}});
      ivqAiApply(a, b1, {provider:'local', model:'m', prompt_v:2, result:invAiNorm({company:'Verdi Srl', title:'Rimborso I.V.A.', year_from:2019, confidence:0.95, tags:['iva'], field_conf:{company:0.97, title:0.9, years:0.35, tags:0.9}}, invAiHints({tags:invVocabHintTags(a.inv)}))});
      ivqAiApply(a, b2, {provider:'local', model:'m', prompt_v:2, result:invAiNorm({company:'Verdi Srl', title:'Bilancio', year_from:2020, confidence:0.95, text:'BILANCI 2020', field_conf:{company:0.97, title:0.9, years:0.9, tags:0.9}}, invAiHints({tags:invVocabHintTags(a.inv)}))});
      commit(); IVP.open = id; renderAll();
      return {s1:b1.inv.st, s2:b2.inv.st, t1:b1.tags, t2:b2.tags, pv:b1.inv.ai.prompt_v, pr:b1.inv.ai.provider, fc:b1.inv.ai.field_conf.years, safe:[ivpSafe(a, b1), ivpSafe(a, b2)]};
    }, P.id);
    ok(E.s1 === 'review' && E.s2 === 'proposed' && E.pv === 2 && E.pr === 'local' && E.fc === 0.35, 'PC reading: doubtful years → review, sure → proposal; provider and prompt version kept', E);
    ok(E.t1 === 'IVA' && E.t2 === 'Bilanci', 'PC reading: «iva» → IVA, «BILANCI» in the transcription → Bilanci', E);
    ok(E.safe[0] === false && E.safe[1] === true, 'a doubtful binder is never confirmed in bulk', E.safe);
    await p.waitForTimeout(200);
    E = await p.evaluate((id) => { const rb = S.binders.find(b => b.archive_id === id && b.inv.st === 'review'), it = rb && document.querySelector('.ivp-item[data-id="' + rb.id + '"]');
      const d = it && it.querySelector('.ivp-doubt input'); return {it:!!it, f:d && d.dataset.ivf, txt:it && (it.querySelector('.ivp-doubts') || {}).textContent, n:document.querySelectorAll('.ivp-doubt').length}; }, P.id);
    ok(E.it && E.f === 'ref_year' && /Da controllare: anni/.test(E.txt) && E.n === 1, 'review grid: the doubtful field is yellow with «Da controllare»', E);

    /* ---------------- PC: vocabulary card ---------------- */
    await p.evaluate(() => { IVP.tab = 'pro'; ivpRefresh(); }); await p.waitForTimeout(150);
    E = await p.evaluate(() => ({card:!!document.getElementById('ivy-card'), syn:(document.getElementById('ivy-syn') || {}).value, sugg:Array.from(document.querySelectorAll('#ivy-sugg .ivy-chip b')).map(x => x.textContent)}));
    if (!E.card){ await p.evaluate(() => { const tb = Array.from(document.querySelectorAll('[data-a="ivp-tab"]')).find(x => /strument|tool|pro/i.test(x.dataset.tab || x.textContent)); if (tb) tb.click(); }); await p.waitForTimeout(200);
      E = await p.evaluate(() => ({card:!!document.getElementById('ivy-card'), syn:(document.getElementById('ivy-syn') || {}).value, sugg:Array.from(document.querySelectorAll('#ivy-sugg .ivy-chip b')).map(x => x.textContent)})); }
    ok(E.card && /^IVA = imposta valore aggiunto/.test(E.syn) && E.sugg.includes('cespiti') && !E.sugg.includes('verdi'), 'Strumenti: vocabulary card with the synonyms and the suggested new tags (never the company name)', E);
    await p.fill('#ivy-syn', 'IVA = imposta valore aggiunto, i.v.a.\nContratti = contr., contratto'); await p.fill('#ivy-stop', 'Varie, Archivio');
    await p.click('#ivy-save'); await p.waitForTimeout(250);
    E = await p.evaluate((id) => { const a = ivpProj(id); return {syn:a.inv.vocab.syn.map(x => x.tag + ':' + x.words.join('/')), stop:a.inv.vocab.stop, tags:a.inv.tags, log:LOG.entries.some(e => e.action === 'inventory.vocab')}; }, P.id);
    ok(E.syn.join() === 'IVA:imposta valore aggiunto,Contratti:contr./contratto' && E.stop.join() === 'varie,archivio' && E.tags.includes('Contratti') && E.log, 'vocabulary saved: synonyms, excluded words, its tags join the quick tags of the phone, logged', E);
    await p.click('#ivy-sugg [data-a="ivy-add"][data-w="cespiti"]'); await p.waitForTimeout(250);
    E = await p.evaluate((id) => { const a = ivpProj(id); return {tags:a.inv.tags, syn:a.inv.vocab.syn.map(x => x.tag), sugg:Array.from(document.querySelectorAll('#ivy-sugg .ivy-chip b')).map(x => x.textContent)}; }, P.id);
    ok(E.tags.includes('Cespiti') && E.syn.includes('Cespiti') && !E.sugg.includes('cespiti'), 'a suggestion becomes a tag with one click', E);
    E = await p.evaluate((id) => { ivySkip(id, 'acquisti'); const a = ivpProj(id); return a.inv.vocab.stop; }, P.id);
    ok(E.includes('acquisti'), 'a suggestion can be excluded for good', E);

    /* ---------------- PC: test bench with a local model ---------------- */
    E = await p.evaluate(() => ({none:!!document.getElementById('ivy-b-noai'), go:!!document.getElementById('ivy-go')}));
    ok(E.none && !E.go, 'test bench: says what is missing when there is no AI', E);
    await p.evaluate(() => {
      window.__calls = 0; window.__years = [2013, 1999, 2016];
      window.ivqAiLocal = () => ({url:'http://127.0.0.1:9', model:'prova-vl'});
      window.ivqAiLocalCall = async (conf, u, voice, hints) => { window.__calls++; const n = window.__calls;
        return {enabled:true, provider:'local', model:conf.model, prompt_v:INV_AI_PROMPT_V, ms:800 + n * 100, result:invAiNorm({company:'Verdi Srl', title:'Fatture acquisti', year_from:window.__years[n - 1], confidence:0.9, tags:['fatture', 'iva']}, invAiHints(hints))}; };
      ivpRefresh();
    }); await p.waitForTimeout(150);
    E = await p.evaluate(() => ({go:!!document.getElementById('ivy-go'), src:Array.from(document.querySelectorAll('#ivy-src option')).map(o => o.value), n:(document.getElementById('ivy-n') || {}).value}));
    ok(E.go && E.src.join() === 'local' && E.n === '5', 'test bench ready: the local model, 5 confirmed binders', E);
    await p.fill('#ivy-n', '3'); await p.click('#ivy-go');
    await p.waitForFunction(() => !IVY.run && ivpProj(invProjects().find(x => x.name === 'Verdi AI 2026').id).inv.bench.length === 1, null, {timeout:8000}).catch(() => {});
    E = await p.evaluate((id) => { const a = ivpProj(id), r = a.inv.bench[0] || {}, bs = S.binders.filter(b => b.archive_id === id && b.inv.st === 'confirmed');
      return {r, calls:window.__calls, hist:(document.querySelector('#ivy-hist tbody tr') || {}).textContent || '', log:LOG.entries.some(e => e.action === 'inventory.bench'), untouched:bs.every(b => !b.inv.ai || !b.inv.ai.model)}; }, P.id);
    ok(E.calls === 3 && E.r.n === 3 && E.r.ok === 2 && E.r.acc.company === 1 && E.r.acc.years === 0.67 && E.r.acc.tags === 1 && E.r.provider === 'local' && E.r.model === 'prova-vl' && E.r.prompt_v === 2,
      'test bench: 3 binders spread over the project read again; 2 of 3 all right (one wrong year)', E.r);
    ok(/prova-vl/.test(E.hist) && /67%/.test(E.hist) && E.log && E.untouched, 'test bench: run kept in the history, logged, no binder changed', E);
    await p.reload(); await p.waitForTimeout(1300);
    E = await p.evaluate((id) => { const a = ivpProj(id); return {bench:a.inv.bench.length, vocab:a.inv.vocab.syn.length, st:S.binders.filter(b => b.archive_id === id && b.inv.st === 'review').length}; }, P.id);
    ok(E.bench === 1 && E.vocab === 3 && E.st === 1, 'vocabulary, bench runs and states survive a reload', E);
    ok(errs.length === 0, 'no JS errors on the PC', errs);

    /* ---------------- phone page loads the same model ---------------- */
    const q = await ctx.newPage(); const qerrs = [];
    q.on('pageerror', e => qerrs.push('PAGEERR ' + e.message));
    await q.setViewportSize({width:390, height:844});
    await q.goto(fileUrl('scan.html') + '?inv=' + encodeURIComponent(P.id)); await q.waitForTimeout(800);
    E = await q.evaluate(() => ({f:typeof invAiStamp === 'function' && typeof invAiState === 'function' && typeof invVocabHintTags === 'function', v:INV_AI_PROMPT_V}));
    ok(E.f && E.v === 2 && qerrs.length === 0, 'phone page: same reading model, no JS errors', {E, qerrs});
  } finally { await b.close(); }
  console.log(`\nV12.17: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
