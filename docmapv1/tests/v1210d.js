// DocMap v12.10 checks: end of wave 1 — «Oggi» panel per role, undo instead of questions, teaching empty states.
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node v1210d.js
const {chromium} = require('playwright');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const fileUrl = f => 'file://' + path.join(APP, f).replace(/\\/g, '/');
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) passes++; else { fails++; console.log('  ✗ FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 700) : ''); } };
(async () => {
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({viewport:{width:1366, height:900}});
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await p.goto(fileUrl('index.html')); await p.waitForTimeout(1300);
    await p.evaluate(() => { const m = document.querySelector('.modal-f [data-a="modal-btn"]'); if (m) m.click(); S.view = 'archive'; renderAll(); });

    // ---- «Oggi» ----
    ok(await p.evaluate(() => !!$('#fs-card') && !$('#w1-today')), 'Oggi: not shown while «Primi passi» is still on screen');
    await p.click('[data-a="fs-hide"]'); await p.waitForTimeout(200);
    let V = await p.evaluate(() => ({on:!!$('#w1-today'), role:$('#w1-today h2').textContent, acts:$$('#w1-acts [data-w1]').map(x => x.dataset.w1).join(), todo:$$('#w1-todo li').map(li => li.textContent).join('|'),
      after:$('#w1-today').previousElementSibling.className}));
    ok(V.on && /Amministratore/.test(V.role) && V.acts === 'new,find,out,pick,print,sync,backup,trend' && /salvataggio/.test(V.todo) && /page-h/.test(V.after), 'Oggi: under the title, admin actions on the PC, to-dos from the data', V);
    await p.click('#w1-acts [data-w1="find"]'); await p.waitForTimeout(150);
    ok(await p.evaluate(() => !!document.querySelector('.ck-panel, #ck-in, [id^="ck-"]')), 'Oggi: «Cerca ovunque» opens Ctrl+K');
    await p.keyboard.press('Escape'); await p.waitForTimeout(100);
    await p.evaluate(() => { const b0 = S.binders[0], ty = sqTypes(S.settings).find(x => x.presence === 'out'); const e = sqNewEvent({target_type:'binder', target_id:b0.id, code:b0.short_code, status_id:ty.id, holder:'Ada', due_date:'2020-02-02', note:''}); sqEv().push(e); S.picks = [{id:'pk-0123456789abcdef', title:'X', ids:[b0.id], handovers:[], created_at:nowISO(), updated_at:nowISO()}]; persist(); renderAll(); });
    V = await p.evaluate(() => ({todo:$$('#w1-todo li').map(li => li.className + ':' + li.textContent), first:$('#w1-todo li button').dataset.v}));
    ok(/w1-crit:.*rientro/.test(V.todo[0]) && V.first === 'status' && V.todo.some(x => /1 prelievi in corso/.test(x)), 'Oggi: overdue first (opens Stati), open pick lists listed', V);
    await p.click('#w1-todo li button >> nth=0'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => S.view === 'status'), 'Oggi: a to-do takes you where it is solved');
    await p.evaluate(() => { S.view = 'archive'; renderAll(); });
    await p.click('#w1-today [data-a="w1-today"]'); await p.waitForTimeout(100);
    ok(await p.evaluate(() => $('#w1-today').classList.contains('w1-closed') && localStorage.getItem('docmap_today_v1') === '0'), 'Oggi: hide is remembered on this device');
    await p.evaluate(() => renderAll());
    ok(await p.evaluate(() => $('#w1-today').classList.contains('w1-closed')), 'Oggi: stays hidden after a redraw');
    await p.click('#w1-today [data-a="w1-today"]'); await p.waitForTimeout(100);
    // roles (web mode reads the signed-in role)
    const R = await p.evaluate(() => {
      const keep = DocMapVault.isActive, prov = dmProviders, out = {};
      DocMapVault.isActive = () => true;
      ['viewer', 'editor'].forEach(r => { window.dmProviders = () => ({auth:{currentUser:() => ({role:r})}}); out[r] = w1Actions(w1Role()).map(a => a[0]).join(); });
      DocMapVault.isActive = keep; window.dmProviders = prov;
      return out;
    });
    ok(R.viewer === 'find,out,trend' && R.editor === 'new,find,out,pick,print,trend', 'Oggi: viewer only consults, editor works, admin also syncs and backs up', R);

    // ---- undo instead of questions ----
    const n0 = await p.evaluate(() => S.binders.length);
    await p.evaluate(() => { const id = S.binders[1].id; ACTIONS['del']({dataset:{id}}); }); await p.waitForTimeout(150);
    ok(await p.evaluate((n) => S.binders.length === n - 1 && !topModal() && /Annulla/.test($$('.toast').map(x => x.textContent).join()), n0), 'delete one binder: no question, «Annulla» in the message');
    await p.evaluate(() => $$('.toast').filter(x => /Annulla/.test(x.textContent)).pop().querySelector('button').click()); await p.waitForTimeout(200);
    ok(await p.evaluate((n) => S.binders.length === n, n0), 'Annulla brings it back');
    await p.evaluate(() => { S.clients = S.clients || []; S.clients.push({id:'cl-w1', name:'Cliente W1', multi_code:''}); persist(); ACTIONS['cl-del']({dataset:{id:'cl-w1'}}); }); await p.waitForTimeout(150);
    ok(await p.evaluate(() => !S.clients.some(c => c.id === 'cl-w1') && !topModal()), 'delete a client: no question either');
    await p.evaluate(() => { S.view = 'settings'; renderAll(); }); await p.check('#w1-ask'); await p.waitForTimeout(100);
    await p.evaluate(() => { S.view = 'archive'; renderAll(); ACTIONS['del']({dataset:{id:S.binders[1].id}}); }); await p.waitForTimeout(150);
    ok(await p.evaluate(() => S.settings.confirmDeletes === true && !!topModal() && /Sei sicuro/.test(topModal().innerText)), 'Impostazioni › «Chiedi sempre conferma» brings the question back');
    await p.keyboard.press('Escape'); await p.evaluate(() => { S.settings.confirmDeletes = false; persist(); });
    await p.evaluate(() => { S.binders.forEach(b0 => { b0.selected_for_print = true; }); ACTIONS['del-sel'](); }); await p.waitForTimeout(150);
    ok(await p.evaluate(() => !!topModal()), 'deleting several binders still asks');
    await p.keyboard.press('Escape');

    // ---- empty states ----
    await p.evaluate(() => { S.view = 'archive'; renderAll(); srSetQ('zzqqxx', true); }); await p.waitForTimeout(300);
    V = await p.evaluate(() => ({box:!!$('#w1-nores'), txt:($('#w1-nores') || {}).textContent || ''}));
    ok(V.box && /Nessun faldone corrisponde/.test(V.txt) && /filtro/.test(V.txt) && /Crea «zzqqxx»/.test(V.txt), 'no results: says why and offers clear / search everywhere / create', V);
    await p.click('#w1-clear'); await p.waitForTimeout(300);
    ok(await p.evaluate(() => !$('#w1-nores') && UI.q === '' && $$('#arch-results [data-a="del"]').length > 0), 'no results: «Togli ricerca e filtri» brings the list back');
    await p.evaluate(() => { S.statusEvents = []; S.view = 'status'; renderAll(); }); await p.waitForTimeout(200);
    ok(await p.evaluate(() => /Tutto in archivio/.test($('#sq-empty').textContent) && /prelievo/.test($('#sq-empty').textContent) && !!$('#sq-empty [data-v="pick"]')), 'nothing out: explains how a binder goes out, button to pick lists');
    await p.setViewportSize({width:390, height:844}); await p.evaluate(() => { S.view = 'archive'; renderAll(); }); await p.waitForTimeout(200);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone width: no horizontal scroll with «Oggi»');
    ok(errs.length === 0, 'no console errors', errs);
  } catch(e){ console.error(e); fails++; }
  await b.close();
  console.log((fails ? '✗' : 'OK') + ' v12.10 ondata 1 (Oggi, Annulla, stati vuoti): ' + passes + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
})();
