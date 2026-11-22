// DocMap v12.10 checks: «Prelievi e consegne» (pick lists: route, purposes, phone link, take, signed hand-over,
// return, receipt fingerprint, backups, undo) on the PC and on the phone page in local mode (same browser).
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node v1210.js
const {chromium} = require('playwright');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const fileUrl = f => 'file://' + path.join(APP, f).replace(/\\/g, '/');
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) passes++; else { fails++; console.log('  ✗ FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 700) : ''); } };
const draw = async (pg, sel) => { const box = await pg.locator(sel).boundingBox(); await pg.mouse.move(box.x + 20, box.y + box.height / 2); await pg.mouse.down(); for (let i = 0; i < 24; i++) await pg.mouse.move(box.x + 20 + i * 11, box.y + box.height / 2 + Math.sin(i / 2) * 35); await pg.mouse.up(); };
(async () => {
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({viewport:{width:1366, height:900}});
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    p.on('dialog', d => d.accept());
    await p.goto(fileUrl('index.html')); await p.waitForTimeout(1300);
    await p.evaluate(() => { const m = document.querySelector('.modal-f [data-a="modal-btn"]'); if (m) m.click(); window.print = () => {}; });

    // ---- pure model: route ----
    const R = await p.evaluate(() => {
      const mk = (code, room, cab, shelf, sector) => normalizeBinder({speaking_code:code, company_name:'X', room_code:room, cabinet_code:cab, shelf_code:shelf, sector_code:sector || '', short_code:'dm26' + code.padEnd(8, '0').slice(0, 8)});
      const L = [mk('Z1', 'B', '1', 'α'), mk('A1', 'A', '2', 'β'), mk('A2', 'A', '1', 'γ'), mk('A3', 'A', '1', 'α', 'DX'), mk('A4', 'A', '1', 'α', 'SX'), mk('A5', 'A', '2', 'α'), mk('N1', '', '', '')];
      const r = pkRoute(L), r2 = pkRoute(L, {serpentine:false});
      const code = (id) => L.find(b => b.id === id).speaking_code;
      return {order:r.order.map(code).join(), flat:r2.order.map(code).join(), stops:r.stops.length, rooms:r.rooms, noLoc:r.noLoc.map(code), text:r.stops[0].text,
        est:pkEstimate(r, 40, 12), fmt:[pkFmtMin(30), pkFmtMin(3700)], greek:[pkSegCmp('α', 'β') < 0, pkSegCmp('γ', 'β') > 0, pkSegCmp('SX', 'DX') < 0, pkSegCmp('2', '10') < 0]};
    });
    ok(R.flat === 'A4,A3,A2,A5,A1,Z1,N1' && R.order === 'A4,A3,A2,A1,A5,Z1,N1', 'route: physical order (Greek shelves, SX before DX), serpentine reverses every other cabinet, no position last', R);
    ok(R.stops === 5 && R.rooms === 2 && R.noLoc.join() === 'N1' && R.text === 'Stanza A › Armadio 1 › Ripiano α' && R.est === 6 * 40 + 7 * 12 && R.fmt.join() === '1 min,1 h 02 min' && R.greek.every(Boolean), 'route: stops, rooms, estimate, labels', R);
    const C = await p.evaluate(() => {
      const pick = {id:'pk-test1', title:'T', purpose:'audit', status_id:'to_entity', holder:'AdE', due_date:'2027-01-31'};
      const r = pkRoute(S.binders), pl = pkPayload(pick, S.binders, r), enc = pkEncode(pl), dec = pkDecode(enc);
      return {ok:dec && dec.id === 'pk-test1' && dec.items.length === S.binders.length && dec.items[0].s === S.binders.find(b => b.id === r.order[0]).short_code && dec.stops.length === r.stops.length && dec.due_date === '2027-01-31',
        bad:[pkDecode('xx'), pkDecode(pkEncode(Object.assign({}, pl, {id:'nope'}))), pkDecode(pkEncode(Object.assign({}, pl, {v:9})))].every(x => x === null), urlsafe:/^[A-Za-z0-9_-]+$/.test(enc),
        purposes:PK_PURPOSES.every(x => t('pkp_' + x.id) !== 'pkp_' + x.id && sqType(sqTypes(S.settings), x.status)), canon:pkReceiptCanon({id:'a', at:'b', items:[{id:'2', code:'y'}, {id:'1', code:'x'}]}).split('\n').pop()};
    });
    ok(C.ok && C.bad && C.urlsafe && C.purposes && C.canon === '1=x,2=y', 'phone link: encode / decode round trip, invalid links refused; every purpose maps to a status type; canonical receipt text sorted', C);

    // ---- PC: builder ----
    await p.evaluate(() => { S.view = 'pick'; renderAll(); });
    ok(await p.locator('#pk-home .pk-empty').count() === 1, 'empty page explains what a pick list is and offers the first one');
    await p.click('#pk-new'); await p.waitForTimeout(150);
    ok(/Nessun|criterio/.test(await p.locator('#pk-found').textContent()), 'builder: asks for a criterion first');
    await p.fill('#pk-client', 'barbieri'); await p.waitForTimeout(350);
    let B = await p.evaluate(() => ({found:$('#pk-found').textContent, rows:$$('#pk-prev [data-pkx]').length, save:$('#pk-save').disabled, holder:$('#pk-holder').value, st:$('#pk-status_id').value, due:$('#pk-due_date').value}));
    ok(/3 faldoni/.test(B.found) && B.rows === 3 && !B.save && B.holder === 'Agenzia delle Entrate' && B.st === 'to_entity' && /^\d{4}-\d{2}-\d{2}$/.test(B.due), 'builder: client filter, defaults from the purpose (tax audit → council/entity, AdE, +30 days)', B);
    await p.selectOption('#pk-purpose', 'client'); await p.waitForTimeout(150);
    B = await p.evaluate(() => ({st:$('#pk-status_id').value, holder:$('#pk-holder').value}));
    ok(B.st === 'to_client' && B.holder === '', 'builder: changing the purpose changes status and holder', B);
    await p.selectOption('#pk-purpose', 'audit'); await p.fill('#pk-codes', 'RC1\nNOPE77'); await p.waitForTimeout(350);
    B = await p.evaluate(() => ({found:$('#pk-found').textContent, unk:($('#pk-unknown') || {}).textContent || ''}));
    ok(/4 faldoni/.test(B.found) && /NOPE77/.test(B.unk), 'builder: pasted codes added, unknown ones listed', B);
    await p.uncheck('#pk-prev [data-pkx]:first-of-type >> nth=0'); await p.waitForTimeout(250);
    ok(/3 faldoni/.test(await p.locator('#pk-found').textContent()), 'builder: unticking a row removes it');
    await p.check('#pk-prev [data-pkx] >> nth=0'); await p.waitForTimeout(250);
    await p.fill('#pk-title', 'Verifica AdE Barbieri'); await p.click('#pk-save'); await p.waitForTimeout(300);
    const P = await p.evaluate(() => { const x = S.picks[0]; return {id:x.id, n:x.ids.length, title:x.title, detail:!!$('#pk-detail'), stops:$$('#pk-stops .pk-stop').length, log:LOG.entries.some(e => e.action === 'pick.create')}; });
    ok(/^pk-[0-9a-f]{16}$/.test(P.id) && P.n === 4 && P.title === 'Verifica AdE Barbieri' && P.detail && P.stops === 4 && P.log, 'save: list in route order, detail with the stops, activity log', P);

    // ---- take, sign, return ----
    await p.click('#pk-take'); await p.waitForTimeout(300);
    let G = await p.evaluate((id) => { const x = pkGet(id), pr = pkProg(x); const ev = sqEv().filter(e => e.batch_id === id); return {c:pr.c, ev:ev.length, via:ev.every(e => e.via === 'pick' && e.status_id === 'to_entity' && e.holder === 'Agenzia delle Entrate' && e.note === x.title), kpi:$('#pk-kpis').textContent}; }, P.id);
    ok(G.c.took === 4 && G.c.out === 4 && G.ev === 4 && G.via && /4\/4/.test(G.kpi), 'take: one status event per binder with the list id, holder, due date, note', G);
    await p.click('#pk-take'); await p.waitForTimeout(200);
    ok(await p.evaluate((id) => sqEv().filter(e => e.batch_id === id).length, P.id) === 4, 'take twice: nothing recorded again');
    await p.click('#pk-sign'); await p.waitForTimeout(300);
    ok(await p.locator('#pk-pad').count() === 1 && await p.inputValue('#pk-s-who') === 'Agenzia delle Entrate', 'hand-over: signature pad, receiver prefilled from the list');
    await p.fill('#pk-s-who', ''); await p.click('.modal-f .btn-primary'); await p.waitForTimeout(150);
    ok(/nome/i.test(await p.locator('#pk-s-err').textContent()), 'hand-over: the name is required');
    await p.fill('#pk-s-who', 'Dott. Neri (AdE)'); await p.fill('#pk-s-doc', 'Tessera 123'); await draw(p, '#pk-pad');
    await p.click('.modal-f .btn-primary'); await p.waitForTimeout(900);
    G = await p.evaluate(async (id) => {
      const x = pkGet(id), h = x.handovers[0], ev = sqEv().filter(e => e.batch_id === id + '.' + h.id);
      const again = await pkSha256Hex(pkReceiptCanon({id:id + '.' + h.id, at:h.at, kind:h.kind, recipient:h.recipient, doc:h.doc, operator:h.operator, sigHash:await pkSha256Hex(pkDataUrlBytes(h.sig)), items:h.items}));
      return {h:{kind:h.kind, who:h.recipient, doc:h.doc, n:h.items.length, sig:/^data:image\/png;base64,/.test(h.sig), hash:/^[0-9a-f]{64}$/.test(h.hash)}, same:again === h.hash, ev:ev.length, holder:ev.every(e => e.holder === 'Dott. Neri (AdE)' && e.via === 'handover' && e.note.includes(h.hash.slice(0, 16))), c:pkProg(x).c, log:LOG.entries.some(e => e.action === 'custody.handover')};
    }, P.id);
    ok(G.h.kind === 'out' && G.h.who === 'Dott. Neri (AdE)' && G.h.doc === 'Tessera 123' && G.h.n === 4 && G.h.sig && G.h.hash && G.same && G.ev === 4 && G.holder && G.c.handed === 4 && G.log, 'hand-over: signed, receipt fingerprint recomputable, events carry receiver + fingerprint, log line', G);
    await p.click('#pk-back'); await p.waitForTimeout(300);
    await p.fill('#pk-s-who', 'Dott. Neri'); await p.check('#pk-s-nosig'); await p.click('.modal-f .btn-primary'); await p.waitForTimeout(700);
    G = await p.evaluate((id) => { const x = pkGet(id); return {c:pkProg(x).c, h:x.handovers.map(h => h.kind + ':' + (h.sig ? 's' : '-')).join(), cur:x.ids.map(i => sqCurrent(sqEv(), 'binder', i).status_id).join()}; }, P.id);
    ok(G.c.back === 4 && G.c.out === 0 && G.h === 'out:s,back:-' && G.cur === 'from_entity,from_entity,from_entity,from_entity', 'return: back in the archive through the type\'s own return status, unsigned return recorded', G);
    await p.click('#pk-back'); await p.waitForTimeout(200);
    ok(/Nessun faldone/.test(await p.evaluate(() => $$('.toast').map(x => x.textContent).join(' '))), 'return twice: nothing is out');

    // ---- outputs ----
    const O = await p.evaluate((id) => { const x = pkGet(id); let csv = ''; const d0 = window.download; window.download = (n, txt) => { csv = n + '|' + txt; }; pkCsv(x); window.download = d0;
      const sheet = pkSheetHTML(x), url = pkPhoneUrl(x);
      return {csv:csv.split('\r\n').length, head:/^prelievo_pk-.*Tappa;Posizione;Codice/.test(csv.replace(/﻿/, '')), sheet:(sheet.match(/class="st"/g) || []).length, url:/scan\.html\?pk=[A-Za-z0-9_-]+$/.test(url), dec:pkDecode(url.split('pk=')[1]).items.length}; }, P.id);
    ok(O.head && O.csv === 6 && O.sheet === 4 && O.url && O.dec === 4, 'outputs: CSV in route order, pick sheet with one block per stop, phone link', O);
    await p.click('[data-a="pk-phone"]'); await p.waitForTimeout(200);
    ok(await p.locator('#pk-qr svg').count() === 1, 'phone: QR of the link'); await p.evaluate(() => closeModal(true));

    // ---- backups, undo, palette ----
    const W = await p.evaluate((id) => { const j = JSON.parse(workspaceJSON(true)); const keep = clone(S.picks); S.picks = []; applyWorkspaceObject(j); return {inJson:(j.picks || []).length, back:S.picks.length && S.picks[0].id === id && S.picks[0].handovers.length === 2}; }, P.id);
    ok(W.inJson === 1 && W.back, 'backup: the lists travel in the workspace JSON and come back', W);
    await p.evaluate(() => renderView());
    await p.click('.pk-more summary'); await p.click('[data-a="pk-del"]'); await p.waitForTimeout(250);   // no question: «Annulla» (06u-wave1.js)
    ok(await p.evaluate(() => S.picks.length) === 0 && await p.evaluate((id) => sqEv().filter(e => String(e.batch_id).startsWith(id)).length, P.id) === 12, 'delete: the list goes, the statuses stay');
    await p.evaluate(() => { const t0 = $$('.toast button').pop(); if (t0) t0.click(); }); await p.waitForTimeout(250);
    ok(await p.evaluate((id) => S.picks.length === 1 && S.picks[0].id === id, P.id), 'undo brings the deleted list back');
    ok(await p.evaluate(() => ckResults('prelievo').some(x => x.g === 'action' && /prelievo/i.test(x.label))), 'Ctrl+K: «Nuovo prelievo» action');
    ok(await p.evaluate(() => { helpEnsure(); HELP.q = 'verifica fiscale'; const r = helpList().map(x => x.id); HELP.q = ''; return r[0] === 'pick'; }), 'help: «verifica fiscale» finds the pick-list topic first');
    ok(await p.evaluate(() => { const m = NAV_MORE.find(g => g[0] === 'nm_work'); return !!m && m[1][0][0] === 'pick'; }), 'menu: Lavoro › Prelievi e consegne');

    // ---- phone, local mode ----
    await p.evaluate(() => { PK.open = ''; ACTIONS['pk-new'](); }); await p.fill('#pk-client', 'Barbieri'); await p.waitForTimeout(350); await p.click('#pk-save'); await p.waitForTimeout(300);
    const url = await p.evaluate(() => pkPhoneUrl(S.picks[0])), pid = await p.evaluate(() => S.picks[0].id);
    const sc = await p.evaluate(() => S.binders.filter(b => /Barbieri/.test(b.company_name)).map(b => ({s:b.short_code, c:b.speaking_code})));
    const other = await p.evaluate(() => S.binders.find(b => !/Barbieri/.test(b.company_name)).short_code);
    await p.evaluate(async () => { await dmProviders().auth.addUser({username:'pk1', display_name:'Pia', role:'editor', secret:'135791'}); });
    const q = await ctx.newPage(); const qerrs = [];
    q.on('pageerror', e => qerrs.push('PAGEERR ' + e.message)); q.on('console', m => { if (m.type() === 'error') qerrs.push('CONSOLE ' + m.text()); });
    q.on('dialog', d => d.accept());
    await q.setViewportSize({width:390, height:844});
    await q.goto(fileUrl('scan.html') + '?' + url.split('?')[1]); await q.waitForTimeout(600);
    ok(await q.evaluate(() => SC.view === 'login' && !document.body.textContent.includes('Barbieri')), 'phone: signed out, the link shows nothing of the list');
    await q.fill('#sc-user', 'pk1'); await q.fill('#sc-pin', '135791'); await q.click('#sc-enter'); await q.waitForTimeout(1200);
    let V = await q.evaluate(() => ({view:SC.view, n:PKM.a && PKM.a.list.items.length, next:(document.getElementById('pkm-next') || {}).textContent || '', url:location.search, w:[document.documentElement.scrollWidth, innerWidth]}));
    ok(V.view === 'pick' && V.n === 3 && /Stanza A › Armadio 1 › Ripiano α/.test(V.next) && !/pk=/.test(V.url) && V.w[0] <= V.w[1] + 1, 'phone: list opened after sign-in, next stop shown, link removed from the address bar, no h-scroll', V);
    await q.evaluate((c) => PKM_API.pkmHandle('https://qr7.it/' + c), sc[0].s); await q.evaluate((c) => PKM_API.pkmHandle(c), sc[1].c);
    await q.evaluate((c) => PKM_API.pkmHandle('https://qr7.it/' + c), sc[0].s); await q.evaluate((c) => PKM_API.pkmHandle('https://qr7.it/' + c), other); await q.evaluate(() => PKM_API.pkmHandle('ZZZ9'));
    await q.waitForTimeout(300);
    V = await q.evaluate(() => ({f:PKM.a.found.length, x:PKM.a.extra.length, msg:PKM.msg.text, k:document.getElementById('pkm-k').textContent, next:(document.getElementById('pkm-next') || {}).textContent || ''}));
    ok(V.f === 2 && V.x === 1 && /non riconosciuto/.test(V.msg) && /Armadio 2/.test(V.next), 'phone: short code and typed code tick off, duplicate refused, other binder = extra, unknown code', V);
    await q.reload(); await q.waitForTimeout(1000);
    ok(await q.evaluate(() => PKM.a && PKM.a.found.length === 2 && !!document.getElementById('pkm-banner')), 'phone: the list survives a reload (banner to go back)');
    await q.click('#pkm-open'); await q.waitForTimeout(200); await q.click('#pkm-end'); await q.waitForTimeout(200);
    await q.uncheck('#pkm-wx'); await q.click('#pkm-signv'); await q.waitForTimeout(300);
    await q.fill('#pkm-who', 'Ufficio AdE'); await q.fill('#pkm-doc', 'Badge 9'); await q.click('#pkm-go'); await q.waitForTimeout(300);
    ok(/firma/i.test(await q.evaluate(() => PKM.err)), 'phone: the signature is required');
    await draw(q, '#pkm-pad'); await q.click('#pkm-go'); await q.waitForTimeout(1300);
    V = await q.evaluate(() => ({step:PKM.step, n:PKM.rec && PKM.rec.items.length, hash:PKM.rec && PKM.rec.hash, mode:PKM.mode, fp:(document.getElementById('pkm-fp') || {}).textContent}));
    ok(V.step === 'done' && V.n === 2 && /^[0-9a-f]{64}$/.test(V.hash) && V.fp === V.hash && V.mode === 'back', 'phone: hand-over with finger signature, extra left out, receipt fingerprint, list switches to Rientro', V);
    const sigId = await q.evaluate(async () => { const id = 'sig-dl-' + PKM.rec.id.split('.dl-')[1]; const r = await IVDB.get(id); return r && /^data:image\/png/.test(r.data) ? id : ''; });
    ok(!!sigId, 'phone: signature kept in the photo store', sigId);
    // the PC sees the hand-over, rebuilds the receipt and checks the fingerprint
    await p.reload(); await p.waitForTimeout(1400);
    await p.evaluate(() => { const m = document.querySelector('.modal-f [data-a="modal-btn"]'); if (m) m.click(); window.print = () => {}; });
    const X = await p.evaluate(async (pid) => { const ph = pkPhoneHandovers(false).filter(h => h.batch.startsWith(pid)); const okFp = ph.length ? await pkReceiptFromEvents(ph[0].batch) : null; const pr = pkProg(pkGet(pid)).c; const html = $('#print-root') ? $('#print-root').innerHTML : ''; return {n:ph.length, okFp, pr, holder:ph[0] && ph[0].holder}; }, pid);
    ok(X.n === 1 && X.okFp === true && X.pr.took === 2 && X.pr.handed === 2 && X.holder === 'Ufficio AdE', 'PC: the phone hand-over shows on the list, receipt rebuilt, fingerprint and signature verified', X);
    // tampering: a changed note no longer matches
    const T = await p.evaluate(async (pid) => { const ph = pkPhoneHandovers(false).find(h => h.batch.startsWith(pid)); const e = sqEv().find(x => x.batch_id === ph.batch); const keep = e.holder; e.holder = 'Altro'; const r = await pkReceiptFromEvents(ph.batch); e.holder = keep; return r; }, pid);
    ok(T === false, 'PC: a changed receiver breaks the fingerprint');
    // phone: bring them back without signature
    await q.click('[data-s="pkm-again"]'); await q.waitForTimeout(200);
    await q.evaluate((c) => PKM_API.pkmHandle('https://qr7.it/' + c), sc[0].s); await q.evaluate((c) => PKM_API.pkmHandle('https://qr7.it/' + c), sc[1].s); await q.waitForTimeout(200);
    await q.click('#pkm-end'); await q.waitForTimeout(150); await q.click('#pkm-rec0'); await q.waitForTimeout(1000);
    await p.reload(); await p.waitForTimeout(1400);
    ok(await p.evaluate((pid) => { const c = pkProg(pkGet(pid)).c; return c.back === 2 && c.out === 0; }, pid), 'phone: Rientro brings them back on the PC');
    // free hand-over from the home screen
    await q.click('[data-s="pkm-close"]'); await q.waitForTimeout(800);
    await q.evaluate(() => { localStorage.removeItem('docmap_v26_pick_active'); PKM.a = null; SC.view = 'noqr'; scRender(); });
    ok(await q.locator('#pkm-free').count() === 1, 'phone: «Consegna con firma» on the home screen');
    await q.click('#pkm-free'); await q.waitForTimeout(200);
    await q.selectOption('#pkm-purpose', 'client'); await q.waitForTimeout(150);
    await q.evaluate((c) => PKM_API.pkmHandle('https://qr7.it/' + c), other); await q.waitForTimeout(200);
    await q.click('#pkm-end'); await q.waitForTimeout(150);
    ok(await q.locator('#pkm-rec0').count() === 0, 'phone free mode: only the signed hand-over is offered');
    await q.click('#pkm-signv'); await q.waitForTimeout(250); await q.fill('#pkm-who', 'Sig. Verdi'); await draw(q, '#pkm-pad'); await q.click('#pkm-go'); await q.waitForTimeout(1200);
    ok(await q.evaluate(() => PKM.step === 'done' && PKM.rec.items.length === 1 && !localStorage.getItem('docmap_v26_pick_active')), 'phone free mode: signed and closed');
    await p.reload(); await p.waitForTimeout(1400);
    ok(await p.evaluate(() => { const ph = pkPhoneHandovers(true); return ph.length === 1 && ph[0].holder === 'Sig. Verdi' && sqCurrent(sqEv(), 'binder', ph[0].events[0].target_id).status_id === 'to_client'; }), 'PC: a free phone hand-over appears under «Consegne firmate dal telefono» (status to_client)');
    await p.evaluate(() => { S.view = 'pick'; PK.open = ''; PK.draft = null; renderAll(); });
    ok(await p.locator('[data-a="pk-receipt-ev"]').count() >= 1, 'PC: receipt button for phone hand-overs');
    await p.setViewportSize({width:390, height:800}); await p.evaluate(() => { PK.open = S.picks[0].id; renderView(); }); await p.waitForTimeout(200);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'PC view: no horizontal scroll at 390 px');
    ok(!errs.length, 'no console errors (PC)', errs);
    ok(!qerrs.length, 'no console errors (phone)', qerrs);
  } finally { await b.close(); }
  console.log((fails ? '✗' : 'OK') + ' v12.10 prelievi e consegne: ' + passes + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
