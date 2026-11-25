// v12.19 (26.12.19) checks (~10 s): found walking the real path for Dave's first full test (2026-11-25).
// «Prelevati» in the Archive counts a binder taken with the phone («Preso» = status event, v12 movements) and still
// the old check-out (archive_state); «Reinserito» brings it back. The .htaccess rule for q/brand.js is in v129.js.
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node v1219.js
'use strict';
const H = require('./lib/harness');

H.run('v12.19 collaudo completo', async (t) => {
  const p = await t.page();
  t.ok(await p.evaluate(() => APP_VERSION >= '26.12.19' && typeof binderOutCount === 'function'), 'v12.19 loaded');
  const kpi = () => p.evaluate(() => {
    S.view = 'archive'; renderAll();
    const k = $$('#kpis .kpi').find(x => /Prelevati/.test(x.textContent));
    return k ? +k.querySelector('.v').textContent : -1;
  });
  await p.evaluate(() => {
    S.settings.hideDemo = false; S.statusEvents = [];
    S.binders = S.binders.slice(0, 3); S.binders.forEach(b => { delete b.archive_state; });
  });
  t.eq(await kpi(), 0, 'nothing out: 0');
  await p.evaluate(() => {
    const b = S.binders[0], ty = sqTypes(S.settings).find(x => x.presence === 'out');
    sqEv().push(sqNewEvent({target_type: 'binder', target_id: b.id, code: b.short_code, status_id: ty.id, holder: 'segreteria', note: ''}));
  });
  t.eq(await kpi(), 1, '«Preso» from the phone (status event) counted in «Prelevati»');
  await p.evaluate(() => { S.binders[1].archive_state = 'CHECKED_OUT'; });
  t.eq(await kpi(), 2, 'the old check-out still counted');
  await p.evaluate(() => {
    const b = S.binders[0], ty = sqTypes(S.settings).find(x => x.presence === 'in');
    const e = sqNewEvent({target_type: 'binder', target_id: b.id, code: b.short_code, status_id: ty.id, note: ''});
    e.at = new Date(Date.now() + 1000).toISOString(); sqEv().push(e);
  });
  t.eq(await kpi(), 1, '«Reinserito» brings it back');

  // the QR destination of a site published by the hub: its own …/q/{short_code}, never the old pilot default
  const D = await p.evaluate(() => {
    const old = window.DOCMAP_CONFIG;
    window.DOCMAP_CONFIG = {mode: 'web', basePath: '/studio-x/', qrDest: 'https://docmap.example.it/studio-x/q/{short_code}'};
    const r = [migrate({settings: {destTemplate: DEFAULT_DEST}}).settings.destTemplate, migrate({}).settings.destTemplate,
      migrate({settings: {destTemplate: 'https://mio.it/{short_code}'}}).settings.destTemplate];
    window.DOCMAP_CONFIG = {qrDest: 'javascript:alert(1)'};
    r.push(migrate({}).settings.destTemplate === DEFAULT_DEST);
    window.DOCMAP_CONFIG = old;
    return r;
  });
  t.eq(D, ['https://docmap.example.it/studio-x/q/{short_code}', 'https://docmap.example.it/studio-x/q/{short_code}', 'https://mio.it/{short_code}', true],
    'site QR destination: untouched default → this site; a destination chosen by the studio stays; junk ignored');
});
