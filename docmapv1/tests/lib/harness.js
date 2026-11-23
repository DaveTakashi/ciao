// DocMap — shared helpers for the Playwright test files (tests/*.js). New test files should use these instead of
// copying the boilerplate: same output format ("✗ FAIL name {details}", last line "OK|✗ <title>: N passed, M failed"),
// same exit code (1 when something failed), console errors collected for every page.
//
//   const H = require('./lib/harness');
//   H.run('v12.11 something', async (t) => {
//     const p = await t.page();                       // index.html from file://, first-run modal closed, errors collected
//     t.ok(await p.evaluate(() => 1 + 1 === 2), 'maths works');
//     t.eq(await p.evaluate(() => pkFmtMin(0)), '1 min', 'short walk');
//   });
//
// t.ok(cond, name, details?)  t.eq(actual, expected, name)  t.page(file?, {viewport, timezoneId, init})  t.browser
// The page's console errors are checked automatically at the end (t.allowErrors(re) to accept an expected one).
'use strict';
const path = require('path');
const {chromium} = require('playwright');

const APP = path.resolve(__dirname, '..', '..');
const fileUrl = (f) => 'file://' + path.join(APP, f).replace(/\\/g, '/');

function short(x, n){ try { return JSON.stringify(x).slice(0, n || 700); } catch (e) { return String(x).slice(0, n || 700); } }

async function run(title, body){
  let passes = 0, fails = 0;
  const pages = [], allowed = [];
  const b = await chromium.launch();
  const t = {
    browser: b, APP, fileUrl,
    ok(c, name, details){ if (c) passes++; else { fails++; console.log('  ✗ FAIL', name, details !== undefined ? short(details) : ''); } return !!c; },
    eq(actual, expected, name){
      const same = short(actual, 1e6) === short(expected, 1e6);
      return t.ok(same, name, same ? undefined : {actual, expected});
    },
    allowErrors(re){ allowed.push(re); },
    async page(file, opts){
      opts = opts || {};
      const ctx = await b.newContext(Object.assign({viewport: {width: 1366, height: 900}}, opts.timezoneId ? {timezoneId: opts.timezoneId} : {}, opts.viewport ? {viewport: opts.viewport} : {}, opts.locale ? {locale: opts.locale} : {}));
      if (opts.init) await ctx.addInitScript(opts.init);
      const p = await ctx.newPage(); const errs = [];
      p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
      p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
      p.on('dialog', d => d.accept());
      await p.goto(fileUrl(file || 'index.html'));
      await p.waitForFunction(() => typeof S === 'object' && typeof APP_VERSION === 'string', null, {timeout: 15000});
      await p.waitForTimeout(opts.settle == null ? 600 : opts.settle);
      await p.evaluate(() => { const m = document.querySelector('.modal-f [data-a="modal-btn"]'); if (m) m.click(); });
      pages.push({p, errs, label: (file || 'index.html') + (opts.timezoneId ? ' @' + opts.timezoneId : '')});
      return p;
    },
  };
  try { await body(t); }
  catch (e) { console.error(e); fails++; }
  pages.forEach(({errs, label}) => {
    const left = errs.filter(e => !allowed.some(re => re.test(e)));
    t.ok(left.length === 0, 'no console errors on ' + label, left);
  });
  await b.close();
  console.log((fails ? '✗' : 'OK') + ' ' + title + ': ' + passes + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
}

module.exports = {run, fileUrl, APP};
