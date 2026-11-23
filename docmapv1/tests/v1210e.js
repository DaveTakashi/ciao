// DocMap v12.10 checks: «Promemoria» (K11, automatic return reminders): late / due soon / long out, grouped by holder,
// repeat and postpone rules, ready e-mail / WhatsApp text, marked as sent (log, undo, backups), «Oggi», daily toast.
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node v1210e.js
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
    await p.evaluate(() => { const m = document.querySelector('.modal-f [data-a="modal-btn"]'); if (m) m.click(); });

    // out: 2 late with Rossi, 1 due tomorrow with Bianchi, 1 out 40 days without date with Verdi, 1 out 5 days without date (no reminder)
    await p.evaluate(() => {
      const bs = S.binders, ty = sqTypes(S.settings).find(x => x.id === 'taken') || sqTypes(S.settings).find(x => x.presence === 'out');
      const day = (n) => rmAddDays(sqToday(), n);
      const ev = (b, holder, due, ago) => { const e = sqNewEvent({target_type:'binder', target_id:b.id, code:b.short_code, status_id:ty.id, holder, due_date:due, note:''}); e.at = new Date(Date.now() - ago * 864e5).toISOString(); sqEv().push(e); };
      ev(bs[0], 'Studio Rossi', day(-5), 20); ev(bs[1], 'studio rossi ', day(-1), 10); ev(bs[2], 'Bianchi', day(1), 3); ev(bs[3], 'Verdi', '', 40); ev(bs[4], 'Neri', '', 5);
      S.settings.holderContacts = {'studio rossi':{email:'rossi@example.test', phone:'+39 333 1234567'}}; persist();
    });
    let R = await p.evaluate(() => { const G = rmGroups(); return {g:G.map(g => g.holder.trim() + ':' + g.items.map(x => x.kind + x.days).join('/') + ':' + g.dueNow), n:rmDueCount()}; });
    ok(R.g.length === 3 && /^Studio Rossi:late5\/late1:true$/.test(R.g[0]) && R.g.some(x => /^Bianchi:soon1:true/.test(x)) && R.g.some(x => /^Verdi:long40:true/.test(x)) && !R.g.some(x => /Neri/.test(x)) && R.n === 3,
      'groups: late first, same holder whatever the case or spaces, due soon, long out; short exits ignored', R);
    const M = await p.evaluate(() => { const g = rmGroups()[0]; return {msg:rmMessage(g), links:rmLinks(g).map(x => x.href)}; });
    ok(/Buongiorno Studio Rossi,/.test(M.msg) && /dovevano rientrare/.test(M.msg) && M.msg.split('\n').filter(l => l.startsWith('- ')).length === 2 && /^mailto:rossi@example\.test\?subject=/.test(M.links[0]) && /^https:\/\/wa\.me\/393331234567\?text=/.test(M.links[1]),
      'message: greeting, reason, one line per binder; e-mail and WhatsApp with the saved contact', M);

    // view, mark as sent, undo, repeat
    await p.evaluate(() => { S.view = 'reminders'; renderAll(); });
    let V = await p.evaluate(() => ({now:$$('#rm-now .rm-g').length, later:$$('#rm-later .rm-g').length, first:$('#rm-now .rm-g h3').textContent}));
    ok(V.now === 3 && V.later === 0 && V.first === 'Studio Rossi', 'view: 3 holders to remind today, the late one first', V);
    await p.click('#rm-now .rm-g >> nth=0 >> [data-a="rm-sent"]'); await p.waitForTimeout(200);
    V = await p.evaluate(() => ({now:$$('#rm-now .rm-g').length, later:$$('#rm-later .rm-g').length, log:LOG.entries.some(e => e.action === 'reminder.sent' && /Studio Rossi/.test(e.summary)), st:Object.keys(S.reminders).length, next:(rmGroups().find(g => /rossi/i.test(g.holder)) || {}).next, want:rmAddDays(sqToday(), 7)}));
    ok(V.now === 2 && V.later === 1 && V.log && V.st === 2 && V.next === V.want, 'sent: moves to «già sollecitati», next in 7 days, logged', V);
    await p.evaluate(() => { const W = UNDO; UNDO = null; applyWorkspaceObject(W); renderAll(); });
    ok(await p.evaluate(() => !Object.keys(S.reminders).some(k => (S.reminders[k].sent || []).length) && rmDueCount() === 3), 'undo: the reminder is not marked as sent any more');
    await p.evaluate(() => { const g = rmGroups()[0]; ACTIONS['rm-sent']({dataset:{k:g.key}}); });
    // a new binder for the same holder → due again today
    await p.evaluate(() => { const b0 = S.binders[5] || S.binders[4], ty = sqTypes(S.settings).find(x => x.presence === 'out'); const e = sqNewEvent({target_type:'binder', target_id:b0.id, code:b0.short_code, status_id:ty.id, holder:'Studio Rossi', due_date:rmAddDays(sqToday(), -2), note:''}); sqEv().push(e); });
    ok(await p.evaluate(() => rmGroups().find(g => /rossi/i.test(g.holder)).dueNow), 'a new late binder for the same holder brings the reminder back today');
    // postpone
    await p.evaluate(() => { const g = rmGroups().find(x => x.holder === 'Bianchi'); ACTIONS['rm-snooze']({dataset:{k:g.key}}); });
    ok(await p.evaluate(() => { const g = rmGroups().find(x => x.holder === 'Bianchi'); return !g.dueNow && g.next === rmAddDays(sqToday(), 7); }), 'postpone: the holder comes back in 7 days');
    // contacts edited inline
    await p.evaluate(() => { RMV.open = ''; renderView(); });
    await p.locator('[data-rmg="verdi"] summary').click(); await p.fill('[data-rmg="verdi"] [data-rmc="email"]', 'verdi@example.test'); await p.press('[data-rmg="verdi"] [data-rmc="email"]', 'Tab'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => S.settings.holderContacts.verdi.email === 'verdi@example.test' && /mailto:verdi@example\.test/.test($('[data-rmg="verdi"] [data-rml="mail"]').getAttribute('href'))), 'contact typed once, used in the e-mail link');
    // rules
    await p.evaluate(() => { S.settings.reminders = {on:true, before:2, every:7, longOut:60, notify:false}; });
    ok(await p.evaluate(() => !rmGroups().some(g => g.holder === 'Verdi')), 'rules: «fuori da tanto» after 60 days drops a 40-day exit');
    await p.evaluate(() => { S.settings.reminders.on = false; });
    ok(await p.evaluate(() => rmGroups().length === 0 && rmDueCount() === 0), 'rules: switched off → no reminders');
    await p.evaluate(() => { S.settings.reminders = {on:true, before:2, every:7, longOut:30, notify:false}; persist(); });

    // automatic part: «Oggi», daily toast once
    await p.evaluate(() => { S.settings.firstStepsHidden = true; S.view = 'archive'; renderAll(); localStorage.removeItem('docmap_reminders_toast_day'); });
    V = await p.evaluate(() => ({todo:$$('#w1-todo li').map(x => x.textContent).join('|'), n1:rmAutoCheck(), toast:$$('.toast').map(x => x.textContent).join('|')}));
    const n2 = await p.evaluate(() => { const c = $$('.toast').length; rmAutoCheck(); return $$('.toast').length - c; });
    ok(/promemoria di rientro/.test(V.todo) && V.n1 >= 1 && /promemoria di rientro da mandare oggi/.test(V.toast) && n2 === 0, 'automatic: in «Oggi» (after critical items), one toast a day', {V, n2});
    // backups
    const B = await p.evaluate(() => { const j = JSON.parse(workspaceJSON(true)); const keep = clone(S.reminders); S.reminders = {}; applyWorkspaceObject(j); return {inJson:!!j.reminders, back:JSON.stringify(S.reminders) === JSON.stringify(keep)}; });
    ok(B.inJson && B.back, 'backup: the reminder history travels in the workspace JSON', B);
    ok(await p.evaluate(() => { const g = NAV_MORE.find(x => x[0] === 'nm_work'); return g[1].map(x => x[0]).join().startsWith('pick,reminders,insights'); }), 'menu: Lavoro › Prelievi, Promemoria, Andamento');
    ok(await p.evaluate(() => { helpEnsure(); HELP.q = 'sollecito ritardo'; const r = helpList().map(x => x.id); HELP.q = ''; return r[0] === 'reminders'; }), 'help: «sollecito ritardo» finds the topic first');
    await p.setViewportSize({width:390, height:844}); await p.evaluate(() => { S.view = 'reminders'; renderAll(); }); await p.waitForTimeout(200);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone width: no horizontal scroll');
    ok(errs.length === 0, 'no console errors', errs);
  } catch(e){ console.error(e); fails++; }
  await b.close();
  console.log((fails ? '✗' : 'OK') + ' v12.10 promemoria: ' + passes + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
})();
