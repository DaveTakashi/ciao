// DocMap upgrade check (~1 min): the rule «nessun dato perso» tested with the REAL previous releases.
// For each old release (taken from git history, nothing to download): the old app is opened from file:// in a fresh
// browser profile, it creates its data (demo binders + changes made like a user would), then the CURRENT app is
// opened in the same profile (same localStorage and IndexedDB, as when Dave replaces the files in C:\DocMap\).
// Checked: every binder with the same id, short_code (printed on the QR!), speaking code, company and place; clients,
// studio name and label sheet kept; the previous state kept as backup (LS_PREV); the SQLite copy readable;
// a JSON backup made by the old release restores in the new one; and going back to the old release still opens the
// data (the «ritorno indietro» of every upgrade guide).
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node upgrade.js [git-ref ...]
//      default refs: the last two releases before this one (see FROM below). Needs the git history (CI: fetch-depth 0).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const {execFileSync} = require('child_process');
const {chromium} = require('playwright');

const APP = path.resolve(__dirname, '..');
const REPO = path.resolve(APP, '..');
// [label, git ref]. Keep the release Dave has installed in the office and the previous one.
const FROM = [['26.12.7 (installata in studio)', 'e34086d'], ['26.12.11', 'b5b2ae9'], ['26.12.12', '492cac8'], ['26.12.13', 'a0dd04a'], ['26.12.14', 'd34999d'], ['26.12.15', '74ed48c'], ['26.12.16', 'ff1145f'], ['26.12.17 (rilascio precedente)', '103875b']];

let passes = 0, fails = 0;
const ok = (c, n, x) => { if (c) passes++; else { fails++; console.log('  ✗ FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 900) : ''); } return !!c; };
const fileUrl = (dir, f) => 'file://' + path.join(dir, f).replace(/\\/g, '/');

function extract(ref, into){
  fs.mkdirSync(into, {recursive: true});
  // brand.js exists from 26.12.12 on (white label): add it only when that release has it
  const has = (f) => { try { execFileSync('git', ['-C', REPO, 'cat-file', '-e', ref + ':' + f], {stdio:'ignore'}); return true; } catch (e) { return false; } };
  const paths = ['docmapv1/index.html', 'docmapv1/scan.html', 'docmapv1/assets', 'docmapv1/vendor', 'docmapv1/docmap.config.js'].concat(has('docmapv1/brand.js') ? ['docmapv1/brand.js'] : []);
  const tar = execFileSync('git', ['-C', REPO, 'archive', '--format=tar', ref].concat(paths), {maxBuffer: 1 << 28});
  execFileSync('tar', ['-x', '-C', into], {input: tar});
  return path.join(into, 'docmapv1');
}

async function open(ctx, dir, errs){
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto(fileUrl(dir, 'index.html'));
  await p.waitForFunction(() => typeof S === 'object' && typeof APP_VERSION === 'string', null, {timeout: 20000});
  await p.waitForFunction(() => typeof DB === 'undefined' || DB.ready || DB.error, null, {timeout: 20000}).catch(() => {});
  await p.waitForTimeout(800);
  await p.evaluate(() => { const m = document.querySelector('.modal-f [data-a="modal-btn"]'); if (m) m.click(); });
  return p;
}

// What must survive, read the same way from any release.
const SNAP = () => {
  const bs = (S.binders || []).map(b => [b.id, b.short_code, b.speaking_code, b.company_name || '', b.location_code || '', b.multi_code || '', b.binder_title || ''].join('|')).sort();
  const cs = (S.clients || []).map(c => [c.id, c.name || c.company_name || '', c.multi_code || ''].join('|')).sort();
  return {v: APP_VERSION, bs, cs, studio: S.settings.studioName || '', preset: S.print.presetId, dest: S.settings.destTemplate || '', lang: S.lang};
};
const DBCOUNT = () => { try { if (typeof DB === 'undefined' || !DB.db) return -1; const r = DB.db.exec('SELECT COUNT(*) FROM binders'); return r.length ? r[0].values[0][0] : 0; } catch (e) { return -2; } };

(async () => {
  const refs = process.argv.slice(2).length ? process.argv.slice(2).map(r => [r, r]) : FROM;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-upgrade-'));
  const b = await chromium.launch();
  try {
    for (const [label, ref] of refs) {
      let oldDir;
      try { oldDir = extract(ref, path.join(tmp, ref.replace(/[^\w.-]/g, '_'))); }
      catch (e) { ok(false, 'git history available for ' + label + ' (' + ref + '): in CI use fetch-depth: 0', String(e.message).slice(0, 200)); continue; }
      // a persistent profile = the same storage for both releases, like the real PC
      const prof = path.join(tmp, 'profile-' + ref.replace(/[^\w.-]/g, '_'));
      const ctx = await chromium.launchPersistentContext(prof, {viewport: {width: 1366, height: 900}});
      const errsOld = [], errsNew = [], errsBack = [];

      // 1. the old release creates data like a user
      let p = await open(ctx, oldDir, errsOld);
      const before = await p.evaluate(() => {
        S.settings.studioName = 'Studio Prova Aggiornamento';
        if (S.binders[0]) { S.binders[0].company_name = 'Società «Àccentata» & C. s.r.l.'; S.binders[0].binder_title = 'Contabilità 2025 — IVA'; }
        if (Array.isArray(S.clients) && typeof normalizeClient === 'function') S.clients.push(normalizeClient({id: 'cl-upg-1', name: 'Cliente Aggiornamento', multi_code: 'M-UPG-1'}));
        S.print.presetId = S.print.presetId || 'mrink143';
        if (typeof commit === 'function') commit(); else persist();
        return true;
      });
      await p.waitForTimeout(1500);   // the SQLite copy is saved a moment later (dbScheduleSync)
      const oldSnap = await p.evaluate(SNAP);
      const oldBackup = await p.evaluate(() => (typeof workspaceJSON === 'function' ? workspaceJSON(true) : ''));
      const oldDb = await p.evaluate(DBCOUNT);
      await p.close();
      ok(before && oldSnap.bs.length > 0, label + ': the old release created binders', oldSnap.bs.length);
      ok(errsOld.length === 0, label + ': old release without console errors', errsOld);

      // 2. the current release opens the same storage
      p = await open(ctx, APP, errsNew);
      const newSnap = await p.evaluate(SNAP);
      const cur = await p.evaluate(() => APP_VERSION);
      ok(newSnap.v === cur && cur !== oldSnap.v, label + ': the new app is running (' + cur + ')', [oldSnap.v, newSnap.v]);
      ok(JSON.stringify(newSnap.bs) === JSON.stringify(oldSnap.bs), label + ': every binder kept with the same id, short code, speaking code, company, place, Codice Multi, title',
        {missing: oldSnap.bs.filter(x => !newSnap.bs.includes(x)).slice(0, 3), extra: newSnap.bs.filter(x => !oldSnap.bs.includes(x)).slice(0, 3)});
      ok(oldSnap.cs.every(x => newSnap.cs.includes(x)), label + ': every client kept', {old: oldSnap.cs.length, now: newSnap.cs.length});
      ok(newSnap.studio === oldSnap.studio && newSnap.preset === oldSnap.preset && newSnap.lang === oldSnap.lang, label + ': studio name, label sheet and language kept', [oldSnap, newSnap].map(s => [s.studio, s.preset, s.lang]));
      ok(newSnap.dest === oldSnap.dest || /qr7\.it|\{short_code\}|\/q\//.test(newSnap.dest), label + ': QR destination kept (or the documented default migration)', [oldSnap.dest, newSnap.dest]);
      const st = await p.evaluate(() => ({prev: !!localStorage.getItem(LS_PREV), qr: typeof qrBase === 'function' ? qrBase() : (S.settings.qrBase || 'https://qr7.it/'), schema: S.schema}));
      ok(/qr7\.it/.test(st.qr), label + ': QR address still qr7.it by default after the upgrade', st.qr);
      await p.evaluate(() => persist());
      ok(await p.evaluate(() => !!localStorage.getItem(LS_PREV)), label + ': the previous state is kept as backup (LS_PREV) on the first save');
      await p.waitForTimeout(1500);
      const newDb = await p.evaluate(DBCOUNT);
      ok(oldDb < 0 || newDb === oldDb || newDb === newSnap.bs.length, label + ': SQLite copy readable with the same binders', {oldDb, newDb});
      if (oldBackup) {
        const R = await p.evaluate((txt) => { const keep = JSON.stringify(S); try { applyWorkspaceObject(JSON.parse(txt)); const n = S.binders.map(b => b.short_code).sort(); return {ok: true, n}; } catch (e) { return {ok: false, e: String(e)}; } finally { applyWorkspaceObject(JSON.parse(keep)); } }, oldBackup);
        ok(R.ok && JSON.stringify(R.n) === JSON.stringify(oldSnap.bs.map(x => x.split('|')[1]).sort()), label + ': a JSON backup made by the old release restores in the new one', R);
      }
      ok(errsNew.length === 0, label + ': new release without console errors on old data', errsNew);
      await p.close();

      // 3. going back: the old release still opens the data saved by the new one
      p = await open(ctx, oldDir, errsBack);
      const backSnap = await p.evaluate(SNAP);
      ok(JSON.stringify(backSnap.bs) === JSON.stringify(oldSnap.bs), label + ': back to the old release, every binder still there', backSnap.bs.length);
      ok(errsBack.length === 0, label + ': old release opens the new data without console errors', errsBack);
      await p.close();
      await ctx.close();
    }
  } catch (e) { console.error(e); fails++; }
  await b.close();
  try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (e) {}
  console.log((fails ? '✗' : 'OK') + ' aggiornamento dai rilasci precedenti: ' + passes + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
})();
