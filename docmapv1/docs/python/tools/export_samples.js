/* DocMap — export REAL sample files from the app, for the JSON Schema check (docs/python/tools/validate_schemas.py).

   Opens docmapv1/index.html from file:// in headless Chromium (Playwright), builds a small archive with the app's
   own functions (a location tree, a client, a binder placed in a box, one deletion, one package export and one
   package import from a fake second device) and writes what the app itself produces:

     workspace_backup.json     workspaceJSON(true)          = "Salva backup" (with activity_log and sync_journal)
     sync_package.json         syncBuildPackage({})         = full sync package (plain)
     sync_package_enc.json     syncEncrypt(...)             = the same package with a passphrase
     records.json              {binder, client, location, status_event, activity_log_entry, sync_journal_entry} single samples

   Usage:  node export_samples.js <output folder>
   Needs the npm package "playwright" with Chromium (the test suite uses the same: see docs/python/PORTING.md §8).
   Nothing is written outside the output folder; the browser profile is a temporary one. */
'use strict';
const path = require('path'), fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('playwright not found: run with NODE_PATH pointing at a node_modules that has it (e.g. docmapv1/tests/node_modules)'); process.exit(2); }

const OUT = path.resolve(process.argv[2] || '.');
const APP = path.resolve(__dirname, '..', '..', '..', 'index.html');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('file://' + APP);
  await page.waitForFunction(() => window.S && Array.isArray(S.binders) && typeof syncBuildPackage === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const res = await page.evaluate(async () => {
    S.onboarded = true; try { closeModal(true); } catch (e) {}
    S.settings.operator = 'Schema Test';
    S.settings.deviceLabel = 'PC schema';
    // a small location tree: MAG1 › A1 › S1 › R1 › B01, B02 (created with the app's model functions)
    const now = nowISO();
    const mag = normalizeLocation({ seg: 'MAG1', name: 'Archivio di prova', created_at: now });
    const arm = normalizeLocation({ seg: 'A1', parent_id: mag.id, created_at: now });
    const sca = normalizeLocation({ seg: 'S1', parent_id: arm.id, created_at: now });
    const rip = normalizeLocation({ seg: 'R1', parent_id: sca.id, created_at: now });
    const b01 = normalizeLocation({ seg: 'B01', parent_id: rip.id, created_at: now, notes: 'scatola 1' });
    const b02 = normalizeLocation({ seg: 'B02', parent_id: rip.id, created_at: now });
    S.locations = [mag, arm, sca, rip, b01, b02];
    locIntegrity();
    // a client and a binder placed in box B01 (invented data)
    S.clients.push(normalizeClient({ multi_code: 'T-0001', name: 'Prova Schemi S.r.l.', address: 'Via Inventata 1', cap: '43100', city: 'PARMA', province: 'PR', type: 'SRL', category: 'Ordinaria' }));
    const b = normalizeBinder({ speaking_code: 'PS1', multi_code: 'T-0001', company_name: 'Prova Schemi S.r.l.', company_city: 'PARMA (PR)', category: 'Ordinaria',
      binder_title: 'Contabilità', ref_year: '2025', contents_items: '2025: Fatture acquisto|2024: Bilancio [cliente]|Visure [in uso]', tags: 'iva,2025',
      contacts: 'Mario Prova', notes: 'nota di prova', short_code: newShortCode(), location_id: b01.id, selected_for_print: true });
    S.binders.push(b);
    logAct('binder.create', { type: 'binder', id: b.id, code: b.speaking_code }, 'Creato il faldone PS1 (schema test)', {}, 'ui');
    // v12: status events (binder, one document, the box) recorded with the app's own function
    sqRecord([sqTargetBinder(b)], 'to_entity', { holder: 'Comune di Prova', due_date: '2030-01-31', note: 'pratica di prova' }, { quiet: true });
    sqRecord([sqTargetDoc(b, b.contents_items[0])], 'to_client', { holder: 'Prova Schemi S.r.l.' }, { quiet: true });
    sqRecord([sqTargetLoc(b01)], 'check', { note: 'da controllare' }, { quiet: true });
    commit();
    // one deletion (tombstone) of a demo binder
    const demo = S.binders.find(x => isDemo(x));
    if (demo) { S.binders = S.binders.filter(x => x !== demo); commit(); }
    // a package export (journal entry kind package / export)
    await syncExport({});
    // a package import from a fake second device: one binder changed there later (journal entry kind package / import)
    const pkg = JSON.parse(JSON.stringify(syncBuildPackage({})));
    pkg.source.deviceId = 'dev-schema-peer'; pkg.source.deviceLabel = 'PC peer';
    const t2 = new Date(Date.now() + 60000).toISOString();
    pkg.records.binders.forEach(x => { if (x.speaking_code === 'PS1') { x.binder_title = 'Contabilità (dal peer)'; x.updated_at = t2; } });
    pkg.exportedAt = t2;
    const plan = syncAnalyze(pkg);
    syncApply(plan);
    await JR.last;
    await new Promise(r => setTimeout(r, 300));
    const workspace = JSON.parse(workspaceJSON(true));
    const full = syncBuildPackage({});
    const enc = await syncEncrypt(JSON.stringify(full), 'passphrase-di-prova-123');
    const one = (a) => a && a.length ? a[a.length - 1] : null;
    return {
      workspace, full, enc,
      records: {
        binder: S.binders.find(x => x.speaking_code === 'PS1'),
        client: S.clients.find(x => x.multi_code === 'T-0001'),
        location: S.locations.find(x => x.seg === 'B01'),
        status_event: S.statusEvents[0],
        activity_log_entry: one(LOG.entries),
        sync_journal_entry: one(S.syncJournal)
      },
      info: { app: APP_VERSION, binders: S.binders.length, locations: S.locations.length, journal: S.syncJournal.length, log: LOG.entries.length, planKinds: plan.items.map(i => i.kind) }
    };
  });
  fs.writeFileSync(path.join(OUT, 'workspace_backup.json'), JSON.stringify(res.workspace, null, 2));
  fs.writeFileSync(path.join(OUT, 'sync_package.json'), JSON.stringify(res.full, null, 1));
  fs.writeFileSync(path.join(OUT, 'sync_package_enc.json'), JSON.stringify(res.enc));
  fs.writeFileSync(path.join(OUT, 'records.json'), JSON.stringify(res.records, null, 2));
  await browser.close();
  console.log(JSON.stringify({ out: OUT, info: res.info, pageErrors: errors }));
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
