// DocMap v12.10 checks: «Andamento e previsioni» (time saved, weekly activity, forecasting models with backtest,
// archive capacity, data-based suggestions). Pure model + PC view.
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node v1210c.js
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

    // ---- pure: forecasting ----
    const F = await p.evaluate(() => {
      const seas = Array.from({length:40}, (_, i) => 10 + [0, 6, 2, -4][i % 4]);
      const trend = Array.from({length:30}, (_, i) => 5 + 2 * i + (i % 2 ? 0.4 : -0.4));
      const flat = Array.from({length:20}, () => 7);
      const fs = inForecast(seas, 8), ft = inForecast(trend, 4), ff = inForecast(flat, 3), fd = inForecast([9, 8, 6, 3, 1, 0, 0, 0, 0, 0], 6);
      return {seas:{m:fs.model, mm:fs.m, next:fs.pts.slice(0, 4).map(x => Math.round(x.v)), mae:fs.mae, skill:fs.skill, tried:fs.tried.map(x => x.id + (x.m || '')).join()},
        trend:{m:ft.model, v1:ft.pts[0].v, band:ft.pts[3].hi - ft.pts[3].lo >= ft.pts[0].hi - ft.pts[0].lo},
        flat:{v:ff.pts.map(x => x.v), mae:ff.mae}, short:inForecast([1, 2, 3], 4), neg:fd.pts.every(x => x.v >= 0 && x.lo >= 0),
        label:inModelLabel(fs)};
    });
    ok(F.seas.m === 'snaive' || F.seas.m === 'hw', 'forecast: a 4-week cycle is recognised (seasonal model wins the backtest)', F.seas);
    ok(F.seas.next.join() === '10,16,12,6' && F.seas.mae < 0.5 && F.seas.skill > 0.5 && ['naive', 'mean', 'lin', 'ses', 'holt', 'snaive4', 'hw4', 'snaive13', 'hw13'].every(x => F.seas.tried.split(',').includes(x)) && /4/.test(F.label), 'forecast: the cycle continues, error and skill vs the simplest method, every model tried', F);
    ok(['lin', 'holt', 'hw'].includes(F.trend.m) && Math.abs(F.trend.v1 - 65) < 2 && F.trend.band, 'forecast: a steady growth picks a model with a trend, the band widens with the horizon', F.trend);
    ok(F.flat.v.every(v => v === 7) && F.flat.mae === 0 && F.short === null && F.neg, 'forecast: flat stays flat, too little history → none, never below zero', F);
    const W = await p.evaluate(() => {
      const now = new Date(2026, 10, 18, 12);   // Wednesday 18 Nov 2026
      const w = inWeekly(['2026-11-16T09:00:00', '2026-11-09T10:00:00', '2026-11-15T23:00:00', '2026-11-02T08:00:00', '2025-01-01T00:00:00', 'bad'], 4, now);
      return {ys:w.ys, labels:w.labels, cur:w.current, first:inFirstActive([0, 0, 3, 1])};
    });
    ok(W.ys.join() === '0,0,1,2' && W.labels[3] === '2026-11-09' && W.cur === '2026-11-16' && W.first === 2, 'weeks: Monday-based, only complete weeks, the current week left out', W);

    // ---- data: views, statuses, time saved ----
    const D = await p.evaluate(() => {
      const bs = S.binders, now = Date.now(); let k = 0;
      for (let w = 20; w >= 1; w--) for (let i = 0; i < 3; i++){ const bb = bs[(k++) % bs.length]; LOG.entries.push({id:'tv' + k, at:new Date(now - w * 7 * 864e5 - i * 864e5).toISOString(), action:'view.binder', target:{type:'binder', id:bb.id, code:bb.speaking_code}, who:'t'}); }
      // same binder twice the same day = one consultation
      const lastE = LOG.entries[LOG.entries.length - 1]; LOG.entries.push({id:'tv-dup', at:new Date(Date.parse(lastE.at) + 60000).toISOString(), action:'view.binder', target:{type:'binder', id:lastE.target.id}, who:'t'});
      const finds = inFindDates().length;
      S.settings.insights = {findMin:6, catMin:3, hourly:40, capacity:0};
      localStorage.setItem(DMT_LS, JSON.stringify([]));
      const sv = inSaved(inSet(), inFindDates(), inNewDates(), null, null);
      return {finds, sv:{min:sv.min, nf:sv.nf, nb:sv.nb, fMeas:sv.fMeas}, nb:bs.length};
    });
    ok(D.finds === 60 && D.sv.nf === 60 && D.sv.nb === D.nb && D.sv.fMeas === 1 && Math.abs(D.sv.min - (60 * 5 + D.nb * 2)) < 1e-9, 'time saved: one consultation per binder per day, (6 − 1) min each + (3 − 1) per new binder when nothing is measured yet', D);
    // overdue + long out + old years + no position
    await p.evaluate(() => {
      const bs = S.binders, ty = sqTypes(S.settings), out = ty.find(x => x.presence === 'out' && x.id === 'taken') || ty.find(x => x.presence === 'out');
      const ev = (b, due, daysAgo) => { const e = sqNewEvent({target_type:'binder', target_id:b.id, code:b.short_code, status_id:out.id, holder:'Mario', due_date:due, note:''}); e.at = new Date(Date.now() - daysAgo * 864e5).toISOString(); sqEv().push(e); };
      ev(bs[0], '2020-01-31', 50); ev(bs[1], '', 45);
      bs[2].ref_year = '2009'; bs[2].contents_items = []; bs[3].location_code = ''; bs[3].location_id = ''; bs[3].room_code = ''; bs[3].cabinet_code = ''; bs[3].shelf_code = '';
      S.settings.insights.capacity = bs.length + 2;
      for (let m = 9; m >= 1; m--) for (let i = 0; i < 2; i++) bs.push(Object.assign(normalizeBinder({speaking_code:'GR' + m + i, company_name:'Crescita', short_code:'dm26GR' + m + i + 'xxxx'.slice(0, 4)}), {created_at:new Date(new Date().getFullYear(), new Date().getMonth() - m, 10).toISOString()}));
      persist();
    });
    const G = await p.evaluate(() => { const c = inCompute(); return {sg:c.sugg.map(s => s.id + ':' + s.sev), od:(c.sugg.find(s => s.id === 'overdue') || {}).detail, keep:(c.sugg.find(s => s.id === 'keep') || {}).title, full:c.full, grow:c.grow && c.grow.model, size:c.size.ys.slice(-3)}; });
    ok(G.sg[0] === 'overdue:crit' && G.sg.includes('longout:warn') && G.sg.includes('noloc:warn') && /2009/.test(G.keep || '') && /BL|dm26|RC|FS/i.test(G.od || ''), 'suggestions: overdue first, long out, no position, years past the 10-year period (to check)', G);
    ok(G.full && G.full.now === true && G.sg.includes('full:crit'), 'capacity: already reached → said plainly and suggested', G);
    await p.evaluate(() => { S.settings.insights.capacity = S.binders.length + 6; persist(); });
    const H = await p.evaluate(() => { const c = inCompute(); return {full:c.full, model:c.grow && c.grow.model}; });
    ok(H.full && H.full.months >= 2 && H.full.months <= 6 && !!H.model, 'capacity: monthly growth forecast gives the month the archive is full', H);

    // ---- view ----
    await p.evaluate(() => { S.view = 'insights'; renderAll(); });
    let V = await p.evaluate(() => ({tiles:$$('#in-saved .in-tile').length, sugg:$$('#in-sg li').length, charts:$$('.in-chart svg').length, fc:($('#in-s-finds') || {}).textContent || '', first:($('#in-sg li') || {}).dataset.sg, full:($('#in-s-size') || {}).textContent || ''}));
    ok(V.tiles === 4 && V.sugg >= 4 && V.charts >= 2 && /Prossime 4 settimane/.test(V.fc) && /Modello:/.test(V.fc) && V.first === 'overdue' && /pieno verso/.test(V.full), 'view: 4 time-saved tiles, suggestions, charts with forecast and model, capacity date', V);
    await p.hover('#in-s-finds .in-hit >> nth=10'); await p.waitForTimeout(100);
    ok(await p.evaluate(() => { const tp = $('#in-s-finds .in-tip'); return !tp.hidden && /Reale|Previsto/.test(tp.textContent); }), 'chart: hover shows the week and the value');
    await p.click('.in-how summary'); await p.fill('#in-findMin', '10'); await p.press('#in-findMin', 'Tab'); await p.waitForTimeout(250);
    V = await p.evaluate(() => ({set:S.settings.insights.findMin, open:$('.in-how').open, all:$$('#in-saved .in-tile b')[2].textContent}));
    ok(V.set === 10 && V.open && /h$/.test(V.all), 'settings: your minutes change the totals at once', V);
    ok(await p.evaluate(() => { const g = NAV_MORE.find(x => x[0] === 'nm_work'); return g && g[1].some(x => x[0] === 'insights') && ADV_VIEWS.includes('insights'); }), 'menu: Lavoro › Andamento e previsioni');
    ok(await p.evaluate(() => { helpEnsure(); HELP.q = 'tempo risparmiato previsioni'; const r = helpList().map(x => x.id); HELP.q = ''; return r[0] === 'insights'; }), 'help: «tempo risparmiato previsioni» finds the topic first');
    await p.setViewportSize({width:390, height:844}); await p.waitForTimeout(200);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone width: no horizontal scroll');
    await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await p.waitForTimeout(100);
    ok(await p.evaluate(() => getComputedStyle($('.in-tile')).backgroundColor !== 'rgb(255, 255, 255)'), 'dark theme: the tiles follow the tokens');
    ok(errs.length === 0, 'no console errors', errs);
  } catch(e){ console.error(e); fails++; }
  await b.close();
  console.log((fails ? '✗' : 'OK') + ' v12.10 andamento e previsioni: ' + passes + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
})();
