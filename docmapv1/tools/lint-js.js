#!/usr/bin/env node
// DocMap — static checks of the app JavaScript (classic scripts, no modules, no bundler).
//
// The app runs from file:// with plain <script> tags, so every top-level declaration of every file is a global shared
// by the whole page. A normal linter cannot know that; this tool reads the <script src> list of each page
// (index.html, scan.html), collects the top-level names each file declares, and then lints every file with those
// names as known globals. It catches, before a test or a user does:
//   - a call to a function that does not exist in that page (typo, renamed function, file missing from scan.html);
//   - a top-level const/let declared twice in the same page (SyntaxError at load: the second file is not run at all);
//   - a top-level function declared twice in the same page without being on the allow-list below (the later file
//     silently replaces the earlier one);
//   - the errors of eslint:recommended that are always bugs (duplicate keys, unreachable code, NaN comparisons, …).
//
// Run:   NODE_PATH=$(npm root -g) node docmapv1/tools/lint-js.js            (needs eslint 9+ installed globally)
//        add --json for a machine-readable report. Exit code 1 when something is wrong.
'use strict';
const fs = require('fs');
const path = require('path');
let Linter, espree;
try { ({Linter} = require('eslint')); espree = require('espree'); }
catch (e) {
  try { const base = path.dirname(require.resolve('eslint/package.json')); ({Linter} = require('eslint')); espree = require(require.resolve('espree', {paths:[base]})); }
  catch (e2) { console.error('lint-js: eslint is not installed (npm install -g eslint), skipped'); process.exit(2); }
}

const APP = path.resolve(__dirname, '..');
const PAGES = ['index.html', 'scan.html'];
const ECMA = 2022;

// Top-level functions that are re-declared on purpose by a later file (the later one is the real one). Keep this
// list short and explained: every entry is a place where load order matters.
const ALLOWED_FUNCTION_OVERRIDES = new Set([
]);

// Browser / runtime globals used by the app beyond the standard browser set.
const EXTRA_GLOBALS = ['initSqlJs', 'DOCMAP_CONFIG', 'NDEFReader', 'BarcodeDetector', 'jsQR', 'qrcode', 'pdfMake'];
// Names read only behind a `typeof X !== 'undefined'` check, for a provider that may or may not exist in the page.
const OPTIONAL_GLOBALS = [
  'searchFacetProviders',   // 06l-archives.js: extension point of the search engine, not defined today
];

function pageScripts(page){
  const html = fs.readFileSync(path.join(APP, page), 'utf8');
  const srcs = []; const re = /<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g; let m;
  while ((m = re.exec(html))) srcs.push(m[1]);
  // inline scripts also declare globals (e.g. the theme bootstrap)
  const inline = []; const ri = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  while ((m = ri.exec(html))) inline.push(m[1]);
  return {srcs, inline};
}

function topLevelNames(code, file){
  let ast;
  try { ast = espree.parse(code, {ecmaVersion: ECMA, sourceType: 'script', loc: true}); }
  catch (e) { return {error: `${file}:${e.lineNumber || '?'}: ${e.message}`, fn: [], lex: [], vars: []}; }
  const fn = [], lex = [], vars = [];
  const idsOf = (pat, out) => {
    if (!pat) return;
    if (pat.type === 'Identifier') out.push(pat.name);
    else if (pat.type === 'ObjectPattern') pat.properties.forEach(p => idsOf(p.type === 'RestElement' ? p.argument : p.value, out));
    else if (pat.type === 'ArrayPattern') pat.elements.forEach(el => idsOf(el && el.type === 'RestElement' ? el.argument : el, out));
    else if (pat.type === 'AssignmentPattern') idsOf(pat.left, out);
  };
  for (const n of ast.body) {
    if (n.type === 'FunctionDeclaration' && n.id) fn.push({name: n.id.name, line: n.loc.start.line});
    else if (n.type === 'ClassDeclaration' && n.id) lex.push({name: n.id.name, line: n.loc.start.line});
    else if (n.type === 'VariableDeclaration') {
      const out = []; n.declarations.forEach(d => idsOf(d.id, out));
      out.forEach(name => (n.kind === 'var' ? vars : lex).push({name, line: n.loc.start.line}));
    }
  }
  // window.foo = … / self.foo = … anywhere in the file also create globals
  const re = /\b(?:window|self|globalThis)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g; let m;
  while ((m = re.exec(code))) vars.push({name: m[1], line: code.slice(0, m.index).split('\n').length});
  return {fn, lex, vars};
}

// eslint:recommended rules that point at real bugs. Style rules and no-unused-vars are left out on purpose: the
// code base exports functions to other files through the global scope, so "unused" is often "used elsewhere".
const RULES = {
  'no-undef': ['error', {typeof: false}],
  'no-dupe-keys': 'error', 'no-dupe-args': 'error', 'no-duplicate-case': 'error', 'no-dupe-else-if': 'error',
  'no-dupe-class-members': 'error', 'no-unreachable': 'error', 'no-unsafe-finally': 'error', 'no-unsafe-negation': 'error',
  'use-isnan': 'error', 'valid-typeof': 'error', 'no-func-assign': 'error', 'no-const-assign': 'error',
  'no-class-assign': 'error', 'no-self-assign': 'error', 'no-compare-neg-zero': 'error', 'no-invalid-regexp': 'error',
  'no-empty-character-class': 'error', 'no-sparse-arrays': 'error', 'getter-return': 'error', 'no-setter-return': 'error',
  'no-obj-calls': 'error', 'no-loss-of-precision': 'error', 'no-unsafe-optional-chaining': 'error',
  'no-async-promise-executor': 'error', 'no-new-native-nonconstructor': 'error', 'no-unused-labels': 'error',
  'no-constant-binary-expression': 'error', 'no-shadow-restricted-names': 'error', 'no-delete-var': 'error',
  'no-octal': 'error', 'no-with': 'error', 'no-debugger': 'error', 'for-direction': 'error', 'no-redeclare': ['error', {builtinGlobals: false}],
};

function browserGlobals(){
  // the 'globals' package ships with eslint; fall back to a hand list if it cannot be found
  try {
    const base = path.dirname(require.resolve('eslint/package.json'));
    const g = require(require.resolve('globals', {paths: [base]}));
    return Object.assign({}, g.browser, g.es2021);
  } catch (e) {
    const out = {}; Object.getOwnPropertyNames(globalThis).forEach(k => { out[k] = 'readonly'; });
    ['window','document','navigator','location','localStorage','sessionStorage','indexedDB','fetch','alert','confirm',
     'prompt','atob','btoa','crypto','performance','history','screen','requestAnimationFrame','cancelAnimationFrame',
     'getComputedStyle','matchMedia','innerWidth','innerHeight','scrollTo','open','close','print','Blob','File',
     'FileReader','URL','URLSearchParams','Image','HTMLElement','Element','Node','Event','CustomEvent','KeyboardEvent',
     'MouseEvent','DOMParser','XMLSerializer','MutationObserver','ResizeObserver','IntersectionObserver','TextEncoder',
     'TextDecoder','AbortController','Headers','Request','Response','FormData','caches','self','Worker','WebSocket',
     'BroadcastChannel','CSS','devicePixelRatio','visualViewport','queueMicrotask','structuredClone',
     'Notification','NodeFilter','createImageBitmap','ImageData','OffscreenCanvas','HTMLCanvasElement','HTMLInputElement',
     'HTMLVideoElement','MediaRecorder','SpeechRecognition','webkitSpeechRecognition','DataTransfer','ClipboardItem',
     'PointerEvent','TouchEvent','DOMException','Path2D','scrollX','scrollY','pageXOffset','pageYOffset','top','parent',
     'frames','name','status','origin','isSecureContext','onerror','addEventListener','removeEventListener',
     'dispatchEvent','setTimeout','clearTimeout','setInterval','clearInterval','getSelection','customElements',
     'MessageChannel','ServiceWorker','Option','Audio','AudioContext','webkitAudioContext','CompressionStream',
     'DecompressionStream','ReadableStream','WritableStream','TransformStream','Intl','WebAssembly'].forEach(k => { out[k] = 'readonly'; });
    return out;
  }
}

function lintPage(page){
  const {srcs, inline} = pageScripts(page);
  const problems = [];
  const files = [];
  srcs.forEach(src => {
    const rel = src.split('?')[0];
    const abs = path.join(APP, rel);
    if (!fs.existsSync(abs)) { problems.push({page, file: rel, line: 0, rule: 'missing-file', msg: `${page} loads ${rel}, which does not exist`}); return; }
    if (rel.startsWith('vendor/')) { files.push({rel, code: null, vendor: true, abs}); return; }
    files.push({rel, code: fs.readFileSync(abs, 'utf8'), abs});
  });
  inline.forEach((code, i) => files.push({rel: `${page}#inline${i + 1}.js`, code}));

  // 1. collect every global declared by the page and look for clashes between files
  const globals = Object.assign({}, browserGlobals());
  EXTRA_GLOBALS.concat(OPTIONAL_GLOBALS).forEach(g => { globals[g] = 'writable'; });
  const seenLex = new Map(), seenFn = new Map();
  files.forEach(f => {
    if (f.vendor) {
      // vendor files are minified: only take the names they put on window/globalThis
      const code = fs.readFileSync(f.abs, 'utf8');
      const re = /\b(?:window|self|globalThis)\.([A-Za-z_$][\w$]*)\s*=/g; let m;
      while ((m = re.exec(code))) globals[m[1]] = 'writable';
      if (/initSqlJs/.test(code)) globals.initSqlJs = 'writable';
      return;
    }
    const t = topLevelNames(f.code, f.rel);
    if (t.error) { problems.push({page, file: f.rel, line: 0, rule: 'parse', msg: t.error}); return; }
    f.names = t;
    t.lex.forEach(d => {
      const prev = seenLex.get(d.name) || seenFn.get(d.name);
      if (prev) problems.push({page, file: f.rel, line: d.line, rule: 'duplicate-global', msg: `top-level "${d.name}" already declared in ${prev.file}:${prev.line} — the page stops loading this file (SyntaxError)`});
      else seenLex.set(d.name, {file: f.rel, line: d.line});
      globals[d.name] = 'writable';
    });
    t.fn.forEach(d => {
      const prevL = seenLex.get(d.name);
      if (prevL) problems.push({page, file: f.rel, line: d.line, rule: 'duplicate-global', msg: `function "${d.name}" clashes with const/let in ${prevL.file}:${prevL.line} (SyntaxError at load)`});
      const prev = seenFn.get(d.name);
      if (prev && prev.file !== f.rel && !ALLOWED_FUNCTION_OVERRIDES.has(d.name))
        problems.push({page, file: f.rel, line: d.line, rule: 'function-override', msg: `function "${d.name}" replaces the one in ${prev.file}:${prev.line} (later file wins). Rename it, or add it to ALLOWED_FUNCTION_OVERRIDES with a reason`});
      seenFn.set(d.name, {file: f.rel, line: d.line});
      globals[d.name] = 'writable';
    });
    t.vars.forEach(d => { globals[d.name] = 'writable'; });
  });

  return {page, files, globals, problems};
}

// 2. lint each file. A file loaded by several pages (shared model files, the search UI, …) may reach names that
// exist only in one of them, behind a runtime check of the page: it is linted with the union of those pages' globals.
// A file loaded by one page only must find every name in that page.
function lintFiles(collected){
  const byFile = new Map();
  collected.forEach(c => c.files.forEach(f => {
    if (f.vendor || !f.names) return;
    const e = byFile.get(f.rel) || {f, globals: {}, pages: []};
    Object.assign(e.globals, c.globals); e.pages.push(c.page); byFile.set(f.rel, e);
  }));
  const linter = new Linter({configType: 'flat'});
  const problems = [];
  byFile.forEach(({f, globals, pages}) => {
    const config = [{files: ['**/*.js'], languageOptions: {ecmaVersion: ECMA, sourceType: 'script', globals}, rules: RULES,
      linterOptions: {reportUnusedDisableDirectives: 'off'}}];
    linter.verify(f.code, config, {filename: f.rel}).forEach(m => {
      problems.push({page: pages.join('+'), file: f.rel, line: m.line, rule: m.ruleId || 'parse', msg: m.message});
    });
  });
  return problems;
}

// Files under assets/js that no page loads are dead code or a forgotten <script> tag.
function orphanFiles(){
  const loaded = new Set();
  PAGES.forEach(p => pageScripts(p).srcs.forEach(s => loaded.add(s.split('?')[0])));
  return fs.readdirSync(path.join(APP, 'assets/js')).filter(f => f.endsWith('.js') && !loaded.has('assets/js/' + f))
    .map(f => ({page: '-', file: 'assets/js/' + f, line: 0, rule: 'orphan-file', msg: 'not loaded by index.html nor scan.html'}));
}

// Files that run on their own (not part of a page's script list): linted alone with the browser / worker globals.
const STANDALONE = [
  {file: 'sw.js', extra: ['clients', 'skipWaiting', 'registration', 'importScripts', 'ExtendableEvent', 'FetchEvent']},
  {file: 'hub/docmap_hub/ui/app.js', extra: []},
];
function lintStandalone(){
  const linter = new Linter({configType: 'flat'}); const problems = [];
  STANDALONE.forEach(({file, extra}) => {
    const abs = path.join(APP, file); if (!fs.existsSync(abs)) return;
    const globals = Object.assign({}, browserGlobals()); extra.forEach(g => { globals[g] = 'readonly'; });
    const config = [{files: ['**/*.js'], languageOptions: {ecmaVersion: ECMA, sourceType: 'script', globals}, rules: RULES}];
    linter.verify(fs.readFileSync(abs, 'utf8'), config, {filename: file}).forEach(m =>
      problems.push({page: '-', file, line: m.line, rule: m.ruleId || 'parse', msg: m.message}));
  });
  return problems;
}

const results = PAGES.map(lintPage);
// a problem in a shared file shows up once per page: report it once
const seen = new Set(); const all = [];
results.concat([{problems: lintFiles(results)}, {problems: lintStandalone()}]).forEach(r => r.problems.forEach(p => {
  const k = `${p.file}:${p.line}:${p.rule}:${p.msg}`; if (seen.has(k)) return; seen.add(k); all.push(p);
}));
orphanFiles().forEach(p => all.push(p));
// White label: a product name written inside a string of the app (use brandName(), tools/brand-sweep.js fixes it).
(function brandLiterals(){
  const {findings} = require('./brand-sweep.js');
  fs.readdirSync(path.join(APP, 'assets/js')).filter(f => f.endsWith('.js') && f !== '00-brand.js').forEach(f => {
    const src = fs.readFileSync(path.join(APP, 'assets/js', f), 'utf8');
    try { findings(src).forEach(x => all.push({page: '-', file: 'assets/js/' + f, line: src.slice(0, x.node.range[0]).split('\n').length,
      rule: 'brand-literal', msg: 'product name written in a string: use brandName() (run tools/brand-sweep.js)'})); } catch(e){ /* parse errors are reported above */ }
  });
})();

if (process.argv.includes('--json')) { console.log(JSON.stringify({problems: all}, null, 1)); process.exit(all.length ? 1 : 0); }
all.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line).forEach(p =>
  console.log(`  ✗ ${p.file}:${p.line}  [${p.rule}]  ${p.msg}${p.page !== '-' && !p.file.startsWith(p.page) && !p.page.includes('+') ? '  (' + p.page + ')' : ''}`));
results.forEach(r => console.log(`  ${r.page}: ${r.files.length} scripts`));
console.log(all.length ? `✗ lint-js: ${all.length} problems` : 'OK lint-js: no problems');
process.exit(all.length ? 1 : 0);
