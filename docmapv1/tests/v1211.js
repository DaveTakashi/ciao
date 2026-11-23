// DocMap v12.11 checks: «Nuovo anno in un clic» (K9), «Scarto proposto» + verbale (K2), «Dove lo metto?» (K8),
// «Ricerca a voce» (K7): pure models, views, undo, backups, shared settings, «Oggi», phone voice, old data.
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node v1211.js
const {chromium} = require('playwright');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const fileUrl = f => 'file://' + path.join(APP, f).replace(/\\/g, '/');
const APP_VERSION_NOW = (require('fs').readFileSync(path.join(APP, 'assets/js/02-core.js'), 'utf8').match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) passes++; else { fails++; console.log('  ✗ FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 900) : ''); } };
// fake speech recognition: says what window.__say holds
const FAKE_SPEECH = () => {
  window.__said = 0;
  window.webkitSpeechRecognition = function(){ const r = this; r.start = () => setTimeout(() => { window.__said++; r.onresult && r.onresult({results:[[{transcript:window.__say || ''}]]}); r.onend && r.onend(); }, 30); r.stop = () => { r.onend && r.onend(); }; };
  window.SpeechRecognition = window.webkitSpeechRecognition;
};
(async () => {
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({viewport:{width:1366, height:900}});
    await ctx.addInitScript(FAKE_SPEECH);
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await p.goto(fileUrl('index.html')); await p.waitForTimeout(1300);
    await p.evaluate(() => { const m = document.querySelector('.modal-f [data-a="modal-btn"]'); if (m) m.click(); });

    /* ---------- years and series ---------- */
    let R = await p.evaluate(() => ({
      a:yrFromText('2024-25').join(), b:yrFromText('anni 2019/2021 e 1999').join(), c:yrFromText('12345 20250 2300').join(),
      list:yrList({ref_year:'2024', contents_items:[{year:'2022', description:'x'}, {year:'', description:'y'}]}).join(),
      s1:yrShift('Fatture 2025', 2025, 2026), s2:yrShift('IVA 2025-26', 2025, 2026), s3:yrShift('2024/2025', 2025, 2026), s4:yrShift('Via Roma 2025 n. 12', 2024, 2025), s5:yrShift('2025-2026', 2025, 2026),
      k1:yrSeriesKey({multi_code:'M-1', category:'Ordinaria', binder_title:'Fatture 2025'}) === yrSeriesKey({multi_code:'m-1 ', category:'ordinaria', binder_title:'Fatture  2026'}),
      k2:yrClientKey({company_name:'Rossi S.r.l.'}) === yrClientKey({company_name:'rossi srl'}), k3:yrClientKey({}) === ''
    }));
    ok(R.a === '2024,2025' && R.b === '2019,2021,1999' && R.c === '' && R.list === '2022,2024', 'years: ranges, two-digit ends, no false years', R);
    ok(R.s1 === 'Fatture 2026' && R.s2 === 'IVA 2026-27' && R.s3 === '2025/2026' && R.s4 === 'Via Roma 2025 n. 12' && R.s5 === '2026-2027', 'yrShift: the year moves forward in every written form, other numbers untouched', R);
    ok(R.k1 && R.k2 && R.k3, 'series and client keys: Codice Multi / name, years out of the title');

    /* ---------- voice parsing ---------- */
    R = await p.evaluate(() => [
      'Trovami le fatture di Rossi del 2023 fuori archivio', 'paghe dal 2019 al 2021', 'codice B L tre', 'cerca duemilaventitré bilancio', 'dov\'è il faldone di Bianchi prima del 2015',
      'mostrami i faldoni storici dopo il 2020', 'tag iva categoria APS', 'where is the Rossi binder from 2020 to 2022', 'b l 3', 'faldoni in stanza B', 'millenovecentonovantotto contratti', ''
    ].map(x => vsParse(x).q));
    ok(R[0] === 'fatture rossi stato:fuori anno:2023' && R[1] === 'paghe anno:2019..2021' && R[2] === 'bl3' && R[3] === 'bilancio anno:2023' && R[4] === 'bianchi anno:<2015' &&
      R[5] === 'anno:>2020 stato:storico' && R[6] === 'tag:iva cat:aps' && R[7] === 'rossi anno:2020..2022' && R[8] === 'bl3' && R[9] === 'luogo:b' && R[10] === 'contratti anno:1998' && R[11] === '',
      'voice: sentences become the search language (years in words, ranges, status, tag, category, spelled codes)', R);
    R = await p.evaluate(() => { const r = srchRun(S.binders, vsParse('il faldone delle paghe di Barbieri del 2025').q); return r.list.map(x => x.speaking_code).join(); });
    ok(R === 'BL3', 'voice: the parsed query finds the right binder', R);

    /* ---------- «Dove lo metto?» ---------- */
    R = await p.evaluate(() => {
      const b0 = S.binders.find(x => x.speaking_code === 'BL1');
      const d = normalizeBinder({company_name:b0.company_name, multi_code:b0.multi_code, category:b0.category, binder_title:'Fatture e Contabilità IVA 2026', ref_year:'2026'});
      const L = plSuggest(d); const none = plSuggest(normalizeBinder({}));
      return {first:L[0] && L[0].label, why:L[0] && L[0].reason, n:L.length, none:none.length, other:L.slice(1).map(x => x.reason).join('|')};
    });
    ok(R.first === 'A1-α' && /Accanto a BL1/.test(R.why), 'place: the same binder of last year comes first, with the reason', R);
    ok(R.n >= 2 && /faldon/.test(R.other) && R.none === 0, 'place: other places of the same client follow; nothing for an empty binder', R);
    // tree locations + capacity: full shelf → the sibling with room
    R = await p.evaluate(() => {
      const room = locCreate('', {seg:'Z', name:'Stanza Z'}); const cab = locCreate(room.id, {seg:'1'}); const s1 = locCreate(cab.id, {seg:'1'}), s2 = locCreate(cab.id, {seg:'2'});
      const mk = (code, y, loc) => { const x = normalizeBinder({speaking_code:code, company_name:'Zeta Spa', multi_code:'Z-9', category:'Ordinaria', binder_title:'Fatture ' + y, ref_year:String(y), location_id:loc, short_code:newShortCode()}); S.binders.push(x); return x; };
      mk('ZS1', 2023, s1.id); mk('ZS2', 2024, s1.id); mk('ZS3', 2025, s1.id); persist();
      const d = normalizeBinder({company_name:'Zeta Spa', multi_code:'Z-9', category:'Ordinaria', binder_title:'Fatture 2026', ref_year:'2026'});
      const free = plSuggest(d)[0];
      S.settings.place = {cap:3};
      const L = plSuggest(d);
      S.settings.place = {cap:0};
      return {free:free.loc.location_id === s1.id, full:L[0].loc.location_id === s2.id && /pieno/.test(L[0].reason), fullMarked:L.some(x => x.loc.location_id === s1.id && x.full), s1:s1.id, s2:s2.id};
    });
    ok(R.free && R.full && R.fullMarked, 'place: a full shelf (capacity 3) gives way to the next one with room in the same cabinet', R);
    // editor: button, list, «Metti qui» sets the location in the form
    await p.evaluate(() => { openEditor(null, {company_name:'Zeta Spa', multi_code:'Z-9', category:'Ordinaria', binder_title:'Fatture 2026', ref_year:'2026'}); });
    await p.waitForTimeout(250);
    await p.click('#pl-ed-btn'); await p.waitForTimeout(100);
    R = await p.evaluate(() => ({n:$$('#pl-ed-list .pl-it').length, txt:($('#pl-ed-list') || {}).textContent || ''}));
    ok(R.n >= 1 && /Accanto a ZS3/.test(R.txt), 'editor: «Dove lo metto?» lists the suggestions with the reason', R);
    await p.click('#pl-ed-list [data-a="pl-put"] >> nth=0'); await p.waitForTimeout(200);
    R = await p.evaluate(() => ({loc:UI.ed.d.location_id, want:(S.locations.find(l => l.seg === '1' && locById(l.parent_id) && locById(l.parent_id).seg === '1' && locPath(l.id)[0].seg === 'Z') || {}).id, pill:($('#ed-loc') || {}).textContent}));
    ok(R.loc && R.loc === R.want && R.pill, '«Metti qui» puts the location into the form', R);
    await p.evaluate(() => closeModal(true));

    /* ---------- Nuovo anno ---------- */
    await p.evaluate(() => { S.binders = S.binders.filter(x => !/^ZS/.test(x.speaking_code)); persist(); });
    R = await p.evaluate(() => {
      const P = nyPlan(2026);
      return {rows:P.rows.map(r => [r.src.speaking_code, r.nb.speaking_code, r.nb.binder_title, r.nb.ref_year, r.nb.short_code, r.nb.location_code || computeLocation(r.nb), r.nb.selected_for_print, (r.nb.contents_items || []).map(i => i.year + ':' + i.description).join('|')].join(' ~ ')),
        done:P.done, src:S.binders.find(x => x.speaking_code === 'BL1').contents_items.map(i => i.year + ':' + i.description).join('|'), codes:new Set(P.rows.map(r => r.nb.short_code)).size === P.rows.length && P.rows.every(r => !S.binders.some(x => x.short_code === r.nb.short_code))};
    });
    ok(R.rows.length === 4 && !R.rows.some(x => /^RC1/.test(x)), 'new year: one new binder per series active last year (RC1, last year 2023, is idle)', R);
    const bl = R.rows.find(x => /^BL1 /.test(x)) || '';
    ok(/^BL1 ~ BL4 ~ /.test(bl) && /~ 2026 ~ /.test(bl) && /~ A1-α ~ true/.test(bl) && /2026:/.test(bl) && !/2025:/.test(bl.split(' ~ ').pop()), 'new year: next free code, year moved forward, same place as last year, selected for printing, contents of the year', {bl, src:R.src});
    ok(R.codes, 'new year: new short codes, all different, never an existing one');
    // view, untick one, create, undo, idempotent
    await p.evaluate(() => { NYV.year = 2026; S.view = 'newyear'; renderAll(); });
    R = await p.evaluate(() => ({rows:$$('#ny-tbl tbody tr').length, btn:$('#ny-create').textContent, kpi:$('#ny-kpis').textContent}));
    ok(R.rows === 4 && /Crea 4 faldoni del 2026/.test(R.btn), 'new year view: preview table and button', R);
    await p.locator('#ny-tbl tbody tr >> nth=3 >> input[type=checkbox]').uncheck(); await p.waitForTimeout(150);
    ok(/Crea 3 faldoni/.test(await p.textContent('#ny-create')), 'untick: the count follows');
    const n0 = await p.evaluate(() => S.binders.length);
    await p.click('#ny-create'); await p.waitForTimeout(250);
    R = await p.evaluate(() => ({n:S.binders.length, made:!!$('#ny-made'), log:LOG.entries.some(e => e.action === 'binder.newyear'), done:nySet().doneYears.join(), sel:S.binders.filter(x => x.selected_for_print && yrMax(x) === 2026).length}));
    ok(R.n === n0 + 3 && R.made && R.log && R.done === '2026' && R.sel === 3, 'create: 3 binders added, logged, year marked done, selected for printing', R);
    await p.evaluate(() => { S.binders.forEach(x => { if (yrMax(x) !== 2026) x.selected_for_print = true; }); });
    await p.click('#ny-print'); await p.waitForTimeout(250);
    R = await p.evaluate(() => ({v:S.view, modal:!!$('.modal')}));
    if (R.modal){ await p.click('.modal-f .btn-primary'); await p.waitForTimeout(250); }
    R = await p.evaluate(() => ({v:S.view, q:printQueueBinders().map(x => yrMax(x)).join()}));
    ok(R.v === 'print' && R.q === '2026,2026,2026', '«Stampa solo queste 3 etichette»: only the new labels in the print queue (after asking)', R);
    R = await p.evaluate(() => { const P = nyPlan(2026); return {n:P.rows.length, done:P.done}; });
    ok(R.n === 1 && R.done === 3, 'pressing again never doubles: only the unticked series is left', R);
    await p.evaluate(() => { const W = UNDO; UNDO = null; applyWorkspaceObject(W); commit(); renderAll(); });
    ok(await p.evaluate((n0) => S.binders.length === n0 && !S.binders.some(x => yrMax(x) === 2026), n0), 'undo: the new binders are gone in one step');
    // options: old year to Storico, clients without binders, lookback 2
    R = await p.evaluate(() => {
      S.clients = (S.clients || []).concat([normalizeClient({name:'Nuova Cliente Srl', multi_code:'M-777', city:'Parma', category:'Ordinaria'})]);
      nySave({oldHist:true, clients:true, tplTitle:'Documenti {anno}', lookback:2}); NYV.planSig = '';
      const P = nyPlan(2026), nc = P.rows.find(r => !r.src);
      const made = nyCreate(P);
      const r = {rows:P.rows.length, rc1:P.rows.some(r => r.src && r.src.speaking_code === 'RC1'), nc:nc && nc.nb.binder_title + '|' + nc.nb.multi_code + '|' + nc.nb.speaking_code, hist:S.binders.find(x => x.speaking_code === 'BL1').archive_state, made:made.length};
      const W = UNDO; UNDO = null; applyWorkspaceObject(W); nySave({oldHist:false, clients:false, lookback:1, doneYears:[]}); commit();
      return r;
    });
    ok(R.nc === 'Documenti 2026|M-777|NC1' && R.hist === 'HISTORICAL' && !R.rc1 && R.made === R.rows, 'options: register clients without binders get one from the template, last year to Storico', R);
    // «Oggi» from December to February
    R = await p.evaluate(() => ({dec:(nyTodo(new Date(2025, 11, 10)) || {}).year, jan:(nyTodo(new Date(2026, 0, 10)) || {}).text || '', jun:nyTodo(new Date(2026, 5, 10))}));
    ok(R.dec === 2026 && /Prepara i faldoni del 2026/.test(R.jan) && R.jun === null, '«Oggi»: «Prepara i faldoni del 2026» from December to February only', R);

    /* ---------- Scarto ---------- */
    R = await p.evaluate(() => {
      const mk = (o) => { const x = normalizeBinder(Object.assign({short_code:newShortCode(), speaking_code:suggestSpeakingCode(o.company_name)}, o)); S.binders.push(x); return x; };
      mk({company_name:'Vecchia Srl', category:'Ordinaria', binder_title:'Fatture 2012', ref_year:'2012', room_code:'C', cabinet_code:'1', shelf_code:'α'});
      mk({company_name:'Vecchia Srl', category:'Ordinaria', binder_title:'Fatture 2013', ref_year:'2013'});
      mk({company_name:'Vecchia Srl', category:'Ordinaria', binder_title:'Fatture 2016', ref_year:'2016'});
      mk({company_name:'Vecchia Srl', category:'Societario', binder_title:'Verbali assemblee', ref_year:'2001'});
      mk({company_name:'Vecchia Srl', category:'Ordinaria', binder_title:'Libro soci', ref_year:'2005'});
      mk({company_name:'Vecchia Srl', category:'Ordinaria', binder_title:'Fatture 2011', ref_year:'2011', tags:'non-scartare'});
      mk({company_name:'Vecchia Srl', category:'Lavoro', binder_title:'Paghe', ref_year:'2014'});
      mk({company_name:'Senza Anno', category:'Ordinaria', binder_title:'Varie'});
      const out = mk({company_name:'Vecchia Srl', category:'Ordinaria', binder_title:'Fatture 2010', ref_year:'2010'});
      sqEv().push(sqNewEvent({target_type:'binder', target_id:out.id, code:out.speaking_code, status_id:'taken', holder:'Mario', note:''}));
      persist();
      const P = rtProposal(2026);
      return {prop:P.prop.map(x => x.b.binder_title + ':' + x.until).join('|'), noyear:P.noyear.map(x => x.company_name).join(), blocked:P.blocked.map(x => x.b.binder_title + '=' + x.why).join('|'), keepSoc:P.keep};
    });
    ok(R.prop === 'Fatture 2012:2022|Fatture 2013:2023|Paghe:2024', 'disposal: past retention proposed (10 years from the last year, the Lavoro rule too); 2016 still kept', R);
    ok(/Fatture 2011=bloccato/.test(R.blocked) && /Fatture 2010=fuori archivio/.test(R.blocked) && R.noyear === 'Senza Anno' && R.keepSoc >= 3, 'disposal: hold tag and binders out are left out, no year listed apart, Societario / libro soci always kept', R);
    R = await p.evaluate(() => { S.settings.retention = Object.assign({}, rtSet(), {defYears:5}); const a = rtProposal(2026).prop.length; S.settings.retention.defYears = 10; delete S.settings.retention.rules; return a; });
    ok(R === 4, 'rules: a shorter general rule (5 years) proposes the 2016 binder too', R);
    // view → prepare the record
    await p.evaluate(() => { RTV.year = 2026; S.view = 'disposal'; renderAll(); });
    R = await p.evaluate(() => ({rows:$$('#rt-tbl tbody tr').length, btn:$('#rt-make').textContent, warn:!!$('#rt-page .warn-box'), noyear:!!$('#rt-noyear'), blocked:!!$('#rt-blocked')}));
    ok(R.rows === 3 && /\(3 faldoni\)/.test(R.btn) && R.warn && R.noyear && R.blocked, 'disposal view: proposal, warning, no year and left-out lists', R);
    await p.locator('#rt-tbl tbody tr >> nth=2 >> input[type=checkbox]').uncheck(); await p.waitForTimeout(120);
    await p.click('#rt-make'); await p.waitForTimeout(200);
    await p.fill('#rt-f-appr', ''); await p.click('.modal-f .btn-primary'); await p.waitForTimeout(120);
    ok(/chi approva/.test(await p.textContent('#rt-f-err')), 'record: the approver is required');
    await p.fill('#rt-f-appr', 'Dott. Mario Bianchi'); await p.fill('#rt-f-role', 'Titolare'); await p.click('.modal-f .btn-primary'); await p.waitForTimeout(400);
    R = await p.evaluate(async () => { const d = S.disposals[0]; return {n:dsNum(d), items:d.items.map(x => x.binder_title).join(), hash:/^[0-9a-f]{64}$/.test(d.hash), ok:await dsVerify(d), st:dsStatus(d), log:LOG.entries.some(e => e.action === 'disposal.prepare'), again:rtProposal(2026).prop.length, card:!!$('[data-ds="' + d.id + '"]')}; });
    ok(R.n === '2026/1' && R.items === 'Fatture 2012,Fatture 2013' && R.hash && R.ok && R.st === 'approved' && R.log && R.again === 1 && R.card, 'record 2026/1: snapshot of the 2 ticked binders, SHA-256 verified, logged; they leave the proposal', R);
    R = await p.evaluate(async () => { const d = S.disposals[0], keep = d.approver; d.approver = 'Altro'; const bad = await dsVerify(d); d.approver = keep; const html = dsPrintHTML(d, true); return {bad, html:/Verbale 2026\/1/.test(html) && /Dott\. Mario Bianchi/.test(html) && /Fatture 2012/.test(html) && /impronta verificata/.test(html) && /Non è conservazione a norma/.test(html)}; });
    ok(R.bad === false && R.html, 'record: a change after preparation breaks the fingerprint; printed text has number, approver, list, disclaimer', R);
    // execute
    const gone = await p.evaluate(() => { const d = S.disposals[0]; return d.items.map(x => x.short_code); });
    await p.click('[data-a="rt-exec"]'); await p.waitForTimeout(200);
    await p.fill('#rt-x-who', 'Macero Rossi'); await p.fill('#rt-x-cert', 'C-55'); await p.click('.modal-f .btn-danger-solid'); await p.waitForTimeout(300);
    R = await p.evaluate((gone) => { const d = S.disposals[0]; return {st:dsStatus(d), left:S.binders.filter(x => gone.includes(x.short_code)).length, tomb:Object.keys(S.tombstones || {}).length || (S.tombstones || []).length, log:LOG.entries.some(e => e.action === 'disposal.execute'), who:d.destroyer + '|' + d.certificate,
      reuse:gone.every(c => allShortCodes().has(c)), sp:suggestSpeakingCode('Vecchia Srl')}; }, gone);
    ok(R.st === 'executed' && R.left === 0 && R.log && R.who === 'Macero Rossi|C-55', 'executed: the binders leave the archive, destroyer and certificate recorded, logged', R);
    ok(R.reuse && !['VS1', 'VS2'].includes(R.sp), 'executed: their short codes and speaking codes are never reused', R);
    await p.evaluate(() => { const W = UNDO; UNDO = null; applyWorkspaceObject(W); commit(); renderAll(); });
    ok(await p.evaluate((gone) => S.binders.filter(x => gone.includes(x.short_code)).length === 2 && dsStatus(S.disposals[0]) === 'approved', gone), 'undo of the execution: binders back, record to carry out again');
    // cancel the record
    await p.evaluate(() => { S.view = 'disposal'; renderAll(); });
    await p.click('[data-a="rt-cancel"]'); await p.waitForTimeout(150); await p.click('.modal-f .btn-primary'); await p.waitForTimeout(200);
    R = await p.evaluate(() => ({st:dsStatus(S.disposals[0]), back:rtProposal(2026).prop.length}));
    ok(R.st === 'cancelled' && R.back === 3, 'cancelled record: its binders are proposed again', R);
    // backups, merge, shared settings
    R = await p.evaluate(() => {
      const j = JSON.parse(workspaceJSON(true)); const keep = clone(S.disposals);
      S.disposals = []; applyWorkspaceObject(j);
      const back = JSON.stringify(S.disposals) === JSON.stringify(keep);
      rtSave({defYears:7}); const ss = locSyncSubset();
      S.settings.retention = Object.assign({}, S.settings.retention, {defYears:10, rulesAt:'2000-01-01T00:00:00Z'});
      locSyncApply(ss);
      return {inJson:Array.isArray(j.disposals) && j.disposals.length === 1, back, sub:!!ss.retention, applied:rtSet().defYears};
    });
    ok(R.inJson && R.back && R.sub && R.applied === 7, 'backups carry the records; the rules travel with the shared settings (newer wins)', R);
    await p.evaluate(() => { rtSave({defYears:10}); commit(); });
    // «Oggi» + yearly toast
    R = await p.evaluate(() => ({jan:rtDue(new Date(2026, 0, 15)), feb:(rtSet().month = 3, null)}));
    R = await p.evaluate(() => { const a = rtDue(new Date(2026, 0, 15)); S.settings.retention.month = 3; const b2 = rtDue(new Date(2026, 1, 15)); S.settings.retention.month = 1; return {a:a && a.n, b:b2}; });
    ok(R.a === 3 && R.b === null, '«Oggi»: the proposal shows from the rule month on', R);
    R = await p.evaluate(() => { localStorage.removeItem('docmap_disposal_toast_year'); const c = $$('.toast').length; const jan = new Date(new Date().getFullYear(), 0, 20); const n0 = rtAutoCheck(new Date(new Date().getFullYear(), 5, 20)); const c0 = $$('.toast').length; const n1 = rtAutoCheck(jan); const c1 = $$('.toast').length; rtAutoCheck(jan); return {n0, n1, none:c0 - c, first:c1 - c0, second:$$('.toast').length - c1}; });
    ok(R.n0 === 0 && R.none === 0 && R.n1 >= 1 && R.first === 1 && R.second === 0, 'yearly toast: only in the rule month (January), once', R);
    // rules editor in the view
    await p.evaluate(() => { RTV.rulesOpen = true; renderView(); });
    await p.click('[data-a="rt-rule-add"]'); await p.waitForTimeout(120);
    const nr = await p.evaluate(() => $$('#rt-rtbl tbody tr').length);
    await p.fill('#rt-rtbl tbody tr >> nth=' + (nr - 1) + ' >> [data-rt-rf="cat"]', 'Semplificata'); await p.press('#rt-rtbl tbody tr >> nth=' + (nr - 1) + ' >> [data-rt-rf="cat"]', 'Tab'); await p.waitForTimeout(150);
    ok(await p.evaluate(() => rtSet().rules.some(r => r.cat === 'Semplificata' && r.years === 10) && !!rtSet().rulesAt), 'rules editor: add a rule, type a category');
    await p.click('[data-a="rt-rule-reset"]'); await p.waitForTimeout(100);

    /* ---------- voice on the PC ---------- */
    await p.evaluate(() => { S.view = 'archive'; renderAll(); window.__say = 'trovami le paghe di Barbieri del 2025'; });
    ok(await p.evaluate(() => !!$('.search .vs-mic')), 'mic button in the Archivio search (browser with speech recognition)');
    await p.click('.search .vs-mic'); await p.waitForTimeout(300);
    R = await p.evaluate(() => ({q:UI.q, rows:filteredBinders().map(x => x.speaking_code).join(), toast:$$('.toast').map(x => x.textContent).join('|')}));
    ok(R.q === 'paghe barbieri anno:2025' && R.rows === 'BL3' && /Ho capito/.test(R.toast), 'spoken search runs in the archive with «Ho capito … → cerco …»', R);
    await p.evaluate(() => { window.__say = 'codice B L due'; ckOpen(); });
    await p.waitForTimeout(100);
    await p.click('#ck .vs-mic'); await p.waitForTimeout(300);
    R = await p.evaluate(() => ({v:($('#ck-q') || {}).value, first:CK.items[0] && (CK.items[0].label || CK.items[0].title || JSON.stringify(CK.items[0]).slice(0, 80))}));
    ok(R.v === 'bl2' && /BL2/.test(JSON.stringify(R.first)), 'Ctrl+K: the mic fills the box and the binder comes first', R);
    await p.evaluate(() => ckClose());

    /* ---------- menu, help, phone width ---------- */
    ok(await p.evaluate(() => { const g = NAV_MORE.find(x => x[0] === 'nm_work'); const ids = g[1].map(x => x[0]); return ids.includes('newyear') && ids.includes('disposal'); }), 'menu: Lavoro › Nuovo anno, Scarto');
    R = await p.evaluate(() => { helpEnsure(); const q = (s) => { HELP.q = s; const r = helpList().map(x => x.id); HELP.q = ''; return r[0]; }; return [q('nuovo anno faldoni'), q('scarto verbale'), q('dove lo metto'), q('cerca a voce')]; });
    ok(R.join() === 'newyear,disposal,place,voice', 'help: the four topics are found', R);
    for (const v of ['newyear', 'disposal']){
      await p.setViewportSize({width:390, height:844}); await p.evaluate((v) => { S.view = v; renderAll(); }, v); await p.waitForTimeout(150);
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone width: no horizontal scroll (' + v + ')');
    }
    await p.setViewportSize({width:1366, height:900});
    await p.evaluate(() => { S.lang = 'en'; S.view = 'disposal'; renderAll(); });
    ok(await p.evaluate(() => /Disposal proposal/.test($('#rt-page h1').textContent)), 'English texts');
    await p.evaluate(() => { S.lang = 'it'; savePrefs(); });
    ok(errs.length === 0, 'no console errors (PC)', errs);

    /* ---------- old data (26.12.10 state without the new keys) ---------- */
    const p2 = await ctx.newPage(); const errs2 = [];
    p2.on('pageerror', e => errs2.push('PAGEERR ' + e.message)); p2.on('console', m => { if (m.type() === 'error') errs2.push('CONSOLE ' + m.text()); });
    await p2.goto(fileUrl('index.html')); await p2.waitForTimeout(900);
    await p2.evaluate(() => { const st = JSON.parse(localStorage.getItem('docmap_v26_state')); delete st.disposals; delete st.settings.retention; delete st.settings.newYear; delete st.settings.place; st.app = 'DocMap26'; localStorage.setItem('docmap_v26_state', JSON.stringify(st)); });
    await p2.reload(); await p2.waitForTimeout(1300);
    R = await p2.evaluate(() => ({n:S.binders.length, plan:nyPlan(nyDefaultYear()).rows.length >= 0, prop:rtProposal(2026).prop.length, ds:dsList().length, set:rtSet().defYears, cap:plSet().cap, ver:APP_VERSION}));
    ok(R.n > 5 && R.ds === 0 && R.set === 10 && R.cap === 0 && R.ver === APP_VERSION_NOW, 'old data: opens with defaults (no records, 10 years, no capacity)', R);
    ok(errs2.length === 0, 'no console errors (old data)', errs2);
    await p2.close();

    /* ---------- phone: dictated search through the parser ---------- */
    const ph = await ctx.newPage(); const errs3 = [];
    ph.on('pageerror', e => errs3.push('PAGEERR ' + e.message));
    await ph.setViewportSize({width:390, height:844});
    await ph.goto(fileUrl('scan.html')); await ph.waitForTimeout(1200);
    R = await ph.evaluate(() => ({fn:typeof vsParse, q:vsParse('dov\'è il faldone delle fatture di Barbieri del 2025').q}));
    ok(R.fn === 'function' && R.q === 'fatture barbieri anno:2025', 'phone page: the same parser is loaded', R);
    ok(errs3.length === 0, 'no console errors (phone)', errs3);
  } catch(e){ console.error(e); fails++; }
  await b.close();
  console.log((fails ? '✗' : 'OK') + ' v12.11 nuovo anno, scarto, dove lo metto, voce: ' + passes + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
})();
