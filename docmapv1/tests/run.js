// DocMap — runs several Playwright test files at the same time and prints one summary.
//   cd docmapv1/tests && NODE_PATH=$(npm root -g) node run.js smoke.js unit.js v1210.js …
//   no file names = every fast test (FAST below, the same list as tools/verifica-veloce.sh).
//   DM_JOBS=1 runs them one after the other (slow machine, or to read the output live).
// Each file still runs on its own (`node v1210.js`); this only saves time: the outputs are printed whole, in order,
// as each file finishes, and the exit code is 1 when any file failed.
'use strict';
const {spawn} = require('child_process');
const os = require('os');
const path = require('path');

const FAST = ['smoke.js', 'unit.js', 'upgrade.js', 'marchio.js', 'v126.js', 'v128.js', 'v129.js', 'v129b.js', 'v1210.js', 'v1210b.js', 'v1210c.js', 'v1210d.js', 'v1210e.js', 'v1211.js', 'v1212.js', 'v1214.js', 'v1215.js', 'v1216.js', 'v1217.js', 'v1218.js'];
const files = process.argv.slice(2).length ? process.argv.slice(2) : FAST;
const jobs = Math.max(1, +process.env.DM_JOBS || Math.min(4, Math.max(1, os.cpus().length - 1)));

const results = new Array(files.length);
let next = 0, printed = 0;
const t0 = Date.now();

function flush(){
  while (printed < files.length && results[printed]) {
    const r = results[printed++];
    console.log('\n== ' + r.file + ' (' + (r.ms / 1000).toFixed(0) + ' s)');
    process.stdout.write(r.out.split('\n').filter(l => l.trim()).map(l => '  ' + l).join('\n') + '\n');
    if (r.code !== 0) console.log('  ✗ FAILED: ' + r.file + ' (exit ' + r.code + ')');
  }
}
function start(i){
  const file = files[i], t = Date.now();
  let out = '';
  const ch = spawn(process.execPath, [path.join(__dirname, file)], {cwd: __dirname, env: process.env});
  ch.stdout.on('data', d => { out += d; });
  ch.stderr.on('data', d => { out += d; });
  return new Promise(res => ch.on('close', code => { results[i] = {file, code: code == null ? 1 : code, out, ms: Date.now() - t}; flush(); res(); }));
}
async function worker(){ while (next < files.length) await start(next++); }

(async () => {
  await Promise.all(Array.from({length: Math.min(jobs, files.length)}, worker));
  const bad = results.filter(r => r.code !== 0);
  console.log('\n' + (bad.length ? '✗' : 'OK') + ' run.js: ' + (files.length - bad.length) + '/' + files.length + ' files OK in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s (' + jobs + ' at a time)' +
    (bad.length ? ' — failed: ' + bad.map(r => r.file).join(', ') : ''));
  process.exit(bad.length ? 1 : 0);
})();
