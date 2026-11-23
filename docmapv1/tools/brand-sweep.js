#!/usr/bin/env node
// Replaces a product name written inside JavaScript strings with a call to brandName() (assets/js/00-brand.js).
// Comments, identifiers (DocMapVault) and data formats ('DocMap26' in exports and saved state) are left alone.
//
//   NODE_PATH=$(npm root -g) node docmapv1/tools/brand-sweep.js [--check] [file.js …]     (default: assets/js/*.js)
//
// --check only reports (exit 1 if something is found); tools/lint-js.js runs the same check as rule «brand-literal».
// Use it after merging a branch that still wrote the name by hand: it fixes the strings in place.
'use strict';
const fs = require('fs');
const path = require('path');
let espree;
try { espree = require('espree'); }
catch (e) { const base = path.dirname(require.resolve('eslint/package.json')); espree = require(require.resolve('espree', {paths:[base]})); }

// Names that must never be written in a visible string (old and current product names). 'DocMap26' is a data format.
// Not matched: HTTP headers (X-DocMap-Token), folder names (C:\\DocMap, DocMap-copie), identifiers and 'DocMap26'.
const NAMES = /(?<![-\\/A-Za-z0-9_])(?:DocMap 2026|Doc Location 2026|DocMap|Doc Location)(?![0-9A-Za-z_-])/g;
const APP = path.resolve(__dirname, '..');

function findings(src){
  const ast = espree.parse(src, {ecmaVersion: 2022, range: true, sourceType: 'script'});
  const out = [];
  (function walk(n, parent, key){
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'Literal' && typeof n.value === 'string' && !(parent && parent.type === 'Property' && key === 'key' && !parent.computed)) {
      NAMES.lastIndex = 0;
      if (NAMES.test(n.raw)) out.push({kind: 'lit', node: n});
    } else if (n.type === 'TemplateElement') {
      NAMES.lastIndex = 0;
      if (NAMES.test(n.value.raw)) out.push({kind: 'tpl', node: n});
    }
    for (const k of Object.keys(n)) {
      if (k === 'parent') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && walk(c, n, k));
      else if (v && typeof v.type === 'string') walk(v, n, k);
    }
  })(ast, null, null);
  return out;
}

function replacement(f, src){
  const [a, b] = f.node.range;
  const raw = src.slice(a, b);
  if (f.kind === 'tpl') return raw.replace(NAMES, '${brandName()}');
  const q = raw[0], body = raw.slice(1, -1);
  const parts = body.split(NAMES);
  const pieces = [];
  parts.forEach((p, i) => { if (p) pieces.push(q + p + q); if (i < parts.length - 1) pieces.push('brandName()'); });
  if (pieces[0] === 'brandName()') pieces.unshift("''");   // keep string concatenation even when the name comes first
  return '(' + pieces.join(' + ') + ')';
}

function sweep(file, check){
  const src = fs.readFileSync(file, 'utf8');
  const fs_ = findings(src);
  if (!fs_.length) return 0;
  if (check) {
    fs_.forEach(f => { const line = src.slice(0, f.node.range[0]).split('\n').length; console.log(`  ✗ ${path.relative(APP, file)}:${line} product name written in a string`); });
    return fs_.length;
  }
  let out = src;
  fs_.sort((x, y) => y.node.range[0] - x.node.range[0]).forEach(f => {
    // template elements: range covers the quasi plus its delimiters; replace only the raw text inside
    if (f.kind === 'tpl') {
      const [a, b] = f.node.range; const seg = out.slice(a, b); const i = seg.indexOf(f.node.value.raw);
      out = out.slice(0, a + i) + f.node.value.raw.replace(NAMES, '${brandName()}') + out.slice(a + i + f.node.value.raw.length);
    } else {
      out = out.slice(0, f.node.range[0]) + replacement(f, out) + out.slice(f.node.range[1]);
    }
  });
  espree.parse(out, {ecmaVersion: 2022, sourceType: 'script'});   // never write a file that does not parse
  fs.writeFileSync(file, out);
  console.log(`  ${path.relative(APP, file)}: ${fs_.length} string(s)`);
  return fs_.length;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  let files = args.filter(a => !a.startsWith('--'));
  if (!files.length) files = fs.readdirSync(path.join(APP, 'assets/js')).filter(f => f.endsWith('.js') && f !== '00-brand.js').map(f => path.join(APP, 'assets/js', f));
  let n = 0;
  for (const f of files) n += sweep(path.resolve(f), check);
  console.log(check ? (n ? `${n} string(s) with a product name` : 'no product name in strings') : `replaced ${n} string(s)`);
  process.exit(check && n ? 1 : 0);
}
module.exports = {findings, NAMES};
