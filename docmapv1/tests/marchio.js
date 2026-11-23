'use strict';
// White label: the product name, mark, colour, languages and file names come only from brand.js (docs/MARCHIO.md).
// 1) the app as shipped shows the name of brand.js; 2) a copy built with another brand (tools/build_deploy.py --brand)
// shows ONLY that brand, on the PC and on the phone, and no other product name anywhere in the visible text.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const H = require('./lib/harness');

const APP = H.APP;
const OUT = path.join(__dirname, '_marchio');
const LOCAL_CFG = fs.readFileSync(path.join(APP, 'docmap.config.js'), 'utf8');
const parseBrand = (txt) => JSON.parse(txt.slice(txt.indexOf('{', txt.indexOf('DOCMAP_BRAND')), txt.lastIndexOf('}') + 1));
const SHIPPED = parseBrand(fs.readFileSync(path.join(APP, 'brand.js'), 'utf8'));
const OTHER = {product_name: 'Archivio Zeta', short_name: 'Zeta', mark: 'AZ', primary_color: '#0A5C8A', file_prefix: 'ArchivioZeta',
  support_email: 'aiuto@example.test', website: 'https://zeta.example.test', languages: ['it'], default_language: 'it',
  tagline: {it: 'Prova di marchio', en: 'Brand test'}};
// every product name the program ever had: none may be visible under another brand (technical names of files and
// folders such as AGGIORNA-DOCMAP.bat or DocMap-copie keep the internal name on purpose: docs/MARCHIO.md §4)
const OLD_NAMES = /(?<![-\\\/\w])(?:DocMap|Doc Location|DM26)(?![\w-])/;

H.run('marchio (white label)', async (t) => {
  // ---------- 1. shipped brand ----------
  const p = await t.page();
  const b1 = await p.evaluate(() => ({name: brandName(), title: document.title, top: (document.querySelector('.brand-t') || {}).textContent,
    mark: (document.querySelector('.brand-mark') || {}).textContent, langs: document.querySelectorAll('[data-a="lang"]').length,
    file: brandFile('workspace', 'json'), stateLang: S.lang}));
  t.eq(b1.name, SHIPPED.product_name, 'brandName() = product_name of brand.js');
  t.ok(b1.title.startsWith(SHIPPED.product_name), 'page title starts with the brand', b1.title);
  t.eq(b1.top, SHIPPED.product_name, 'top bar shows the brand');
  t.eq(b1.mark, SHIPPED.mark, 'mark in the top bar from brand.js');
  t.eq(b1.langs, SHIPPED.languages.length, 'one language button per brand language');
  t.eq(b1.file, SHIPPED.file_prefix + '_workspace.json', 'download names use file_prefix');
  const about = await p.evaluate(() => t('se_about', {v: APP_VERSION}));
  t.ok(about.startsWith(SHIPPED.product_name), 'About text uses the brand', about);

  // ---------- 2. another brand (reseller) ----------
  fs.mkdirSync(OUT, {recursive: true});
  const bf = path.join(OUT, '..', '_marchio-brand.json');
  fs.writeFileSync(bf, JSON.stringify(OTHER));
  execFileSync('python3', [path.join(APP, 'tools/build_deploy.py'), OUT, '--no-server', '--slug', 'zeta', '--base-path', '/', '--brand', bf]);
  fs.writeFileSync(path.join(OUT, 'docmap.config.js'), LOCAL_CFG);   // back to local mode (file://, no login)
  const built = parseBrand(fs.readFileSync(path.join(OUT, 'brand.js'), 'utf8'));
  t.ok(built.product_name === OTHER.product_name && built.website === OTHER.website && built.vendor_name === undefined && built.languages.join() === 'it',
    'build_deploy --brand: reseller fields, nothing of the original vendor', built);
  const man = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.webmanifest'), 'utf8'));
  t.ok(man.short_name === 'Zeta' && man.name.startsWith('Archivio Zeta'), 'installable app manifest carries the reseller name', man.name);

  const z = await t.page('tests/_marchio/index.html');
  const v = await z.evaluate(async () => {
    const seen = [];
    const grab = () => seen.push(document.body.innerText);
    grab();
    for (const view of ['print', 'info', 'archive']) { S.view = view; renderAll(); await new Promise(r => setTimeout(r, 150)); grab(); }
    const keys = Object.keys(I18N.it || {});
    const dict = keys.map(k => t(k)).join('\n');
    return {text: seen.join('\n'), dict, title: document.title, brand: getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(),
      langs: document.querySelectorAll('[data-a="lang"]').length, file: brandFile('etichette_x', 'pdf'), mark: (document.querySelector('.brand-mark') || {}).textContent};
  });
  t.ok(v.title.startsWith('Archivio Zeta — Prova di marchio'), 'reseller title', v.title);
  t.ok(v.text.includes('Archivio Zeta'), 'reseller name visible in the app');
  t.ok(!OLD_NAMES.test(v.text), 'no other product name in the visible text of the views', (v.text.match(new RegExp('.{0,40}(' + OLD_NAMES.source + ').{0,40}')) || [])[0]);
  t.ok(!OLD_NAMES.test(v.dict), 'no other product name in the Italian dictionary', (v.dict.match(new RegExp('.{0,40}(' + OLD_NAMES.source + ').{0,40}')) || [])[0]);
  t.eq(v.brand.toUpperCase(), '#0A5C8A', 'primary_color drives the --brand token');
  t.eq(v.langs, 0, 'one language only: no language switch');
  t.eq(v.mark, 'AZ', 'reseller mark');
  t.eq(v.file, 'ArchivioZeta_etichette_x.pdf', 'reseller file prefix');
  const help = await z.evaluate(() => JSON.stringify(HELP_TOPICS) + JSON.stringify(typeof GUIDES !== 'undefined' ? GUIDES : null) + JSON.stringify(I18N));
  t.ok(!OLD_NAMES.test(help), 'no other product name in help topics, guides and both dictionaries', (help.match(new RegExp('.{0,40}(' + OLD_NAMES.source + ').{0,40}')) || [])[0]);

  const ph = await t.page('tests/_marchio/scan.html', {viewport: {width: 390, height: 844}});
  const sv = await ph.evaluate(() => ({text: document.body.innerText, title: document.title, langs: document.querySelectorAll('[data-s="lang"]').length,
    mark: (document.querySelector('.sc-mark') || {}).textContent}));
  t.ok(sv.title === 'Archivio Zeta' || sv.title.startsWith('Archivio Zeta'), 'phone page title', sv.title);
  t.ok(!OLD_NAMES.test(sv.text), 'phone page: no other product name', sv.text.slice(0, 200));
  t.eq(sv.langs, 0, 'phone page: no language switch with one language');

  // ---------- 3. tools ----------
  const bad = execFileSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(path.join(APP, 'tools'))}); import brand as B, json
print(json.dumps([B.validate({"product_name": ""}), B.validate({"product_name": "X", "qr_base": "https://a"}),
  B.validate({"product_name": "X", "primary_color": "blu"}), B.validate({"product_name": "X", "languages": ["fr"]}),
  B.validate({"product_name": "X", "logo_url": "../../etc/x.png"}), B.validate({"product_name": "X", "support_email": "a@b.it?cc=c@d.it"}),
  B.validate({"product_name": "Doc <b>"}), B.validate(B.parse(open(${JSON.stringify(path.join(APP, 'brand.js'))}).read()))]))`]).toString();
  const r = JSON.parse(bad);
  t.ok(r.slice(0, 7).every(e => e.length > 0), 'brand.py refuses: empty name, QR address in the brand, bad colour, unknown language, logo outside, mail with extras, HTML in the name', r);
  t.eq(r[7], [], 'the shipped brand.js is valid');
  const {findings} = require('../tools/brand-sweep.js');
  t.eq(findings("const a = 'Benvenuto in DocMap', b = 'DocMap26', c = 'X-DocMap-Token', d = `in Doc Location`;").length, 2,
    'lint rule brand-literal: catches the name in a string and in a template, not data formats or headers');
});
