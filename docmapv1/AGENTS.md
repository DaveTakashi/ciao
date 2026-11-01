# AGENTS.md — DocMap 2026 (DM26)

Operating manual for coding agents (and humans) working on `docmapv1/`.
User-facing docs are Italian (`README.md`, `docs/*.md`); code, identifiers and this file are English.

- Architecture (IT): `docs/ARCHITETTURA.md`
- Data model / file formats — the contract with the Python system (IT): `docs/MODELLO-DATI.md`
- Future online hub & API blueprint, not implemented (IT): `docs/HUB-E-API.md`
- Guide for the Python team (IT): `docs/ALLINEAMENTO-PYTHON.md`
- v10 REST contract for auth + mobile page + blobs (IT): `docs/API-CONTRACT.md` · security model (IT): `docs/SICUREZZA.md` · static web deploy (IT): `docs/DEPLOY-WEB.md`
- Manual sync local ⇄ web app, package format and merge rules (IT): `docs/SYNC.md`

Baseline described here: **v9** (`APP_VERSION = '26.9.0'`, state `schema: 26.9`, `DB_SCHEMA_VERSION = 5`). v9 adds the label template registry `LABEL_TEMPLATES` (03-print.js; default `info`), `S.print.info`, `S.print.edge`, the PDF exporter (05c-pdf.js) and the activity log (06e-log.js, `logAct()`). To add a label template: add an entry to `LABEL_TEMPLATES` (kinds per binder, paired or not, recommended presets, options HTML), a renderer for any new kind in `renderLabel`, i18n keys, and tests; the PDF exporter needs no change because it reads the rendered DOM.
What changed from v7 is summarised in §10.

---

## 1. Hard constraints (never break these)

1. **Runs from `file://` with a double-click on `index.html`.** No server, no build step, no bundler, no `fetch()` of local files.
2. **Classic `<script>` tags only**, no ES modules (`type="module"` fails on `file://`). Every top-level `const`/`function` is a global shared across files; **load order matters**.
3. **Fully offline. No CDN, no external fonts, no remote calls.** Everything third-party is vendored: `vendor/sql-wasm.js` (sql.js 1.10.3 with the WASM inlined as base64 in `window.DM_SQL_WASM_B64`), fonts in `assets/fonts/` (Inter as "DM Inter", JetBrains Mono as "DM Mono", OFL).
4. **Vanilla JS + hand-written CSS.** No frameworks, no npm runtime deps. Target Chrome/Edge on Windows 10/11.
5. **Bilingual UI IT + EN.** Every user-visible string goes through `t('key')` with entries in both `I18N.it` and `I18N.en`. Italian is the primary language and the fallback.
6. **Never print the `demo` tag.** Sample binders carry tag `demo` (`DEMO_TAG`, `isDemo(b)`); label renderers filter it out of printed tags, and `S.settings.hideDemo` hides demo binders from the list, map and print queue.
7. **Never invent a Codice Multi (`multi_code`).** It is the studio's real internal id. Fill it only from user input, the client register, or the same client's existing binders. The AI prompt says the same — keep it that way.
8. **Identifiers are sacred:** `id` (uuid) never changes; `speaking_code` unique and uppercase without spaces; `short_code` unique, `dm26` + 8 chars, never reused for another binder (it is printed on physical QR labels). `ensureIntegrity()` enforces this; the SQLite mirror has `UNIQUE` constraints that would otherwise break every sync.
9. **Print is millimetre-exact.** `@page{size:210mm 297mm;margin:0}`; all label geometry in mm. Do not introduce px units into label rendering.
10. **Data safety:** every destructive action goes through `confirmAction()`, bulk changes call `undoPoint()` before and `undoToast()` after.

## 2. File map and load order

`index.html` loads, in this exact order:

| # | File | Responsibility |
|---|------|----------------|
| 0 | `vendor/sql-wasm.js` | sql.js (`initSqlJs`) + `DM_SQL_WASM_B64` |
| 1 | `assets/js/01-qr.js` | `DMQR` — pure-JS QR encoder → SVG (ISO/IEC 18004, byte mode, ECC L/M/Q/H) |
| 2 | `assets/js/02-core.js` | constants, `I18N` + `t()`, utils (`$`, `esc`, `uuid`, `randChars`…), binder helpers (`normalizeBinder`, `computeLocation`, `pipeToContents`, `suggestSpeakingCode`, `newShortCode`, `ensureIntegrity`, `normalizeClient`, `destFor`/`renderDest`, `manifestTags`), `CSV_COLUMNS`, `BUILTIN_PRESETS`, demo data, `defaultState()`, `migrate()`, `loadState()`, `persist()`, `commit()`, `savePrefs()`, `markExported()` |
| 2b | `assets/js/02b-colors.js` | v10 smart spine colours: `COLOR_FAMILIES`, `COLOR_CAT_RULES`, colour math (`colorContrast`, `colorDeltaE` CIEDE2000, `colorHash` FNV-1a), `colorFamilyId`, `colorShades`, `colorCategoryHex`, `colorAssign`, `applyAutoColor`, `colorPlan`, `recolorAll`, `colorLockLegacy`, editor hooks `edAutoColor`/`edColorLock`/`colorSwatchesHTML`, Settings card `colorSettingsHTML`, `COLOR_ACTIONS`, help topic `colors` (see §12) |
| 3 | `assets/js/03-print.js` | label engine: `renderLabel` (A/B/U), `renderFull` (S, complete label), `renderSlotLabel` (turned sheets), `slotSeq`, `layoutLabels`, `buildLabelSheets`, `buildCalibSheet`, `buildRegisterHTML`, `doPrint`, `printLabels` |
| 4 | `assets/js/04-ui.js` | `ICONS`/`ic()`, `toast`, undo (`undoPoint`/`undoToast`), modal stack (`openModal`/`closeModal`/`confirmAction`), `download`, `copyText`, `readFileText`, CSV (`detectDelim`, `parseCSV`, `toCSV`, `safeCell`/`unsafeCell`), `HEADER_ALIASES`, `mapRecord`, export builders (`binderToCsvRow`, `exportManifest`, `mergeManifest`, `exportFullCSV`, `workspaceJSON`, `quickBackup`), AI prompt (`csvTemplateHeader`, `buildAIPrompt`) |
| 4b | `assets/js/04b-typeahead.js` | typeahead component (`taAttach(input, {source, multi, joiner, top, max, minWidth, onPick})`, `taRank`, shared `#ta-pop` listbox) + binder editor helpers: `ED_SOURCES`, `companyKey` duplicate-spelling guard, `edNextFreeCode` (duplicate speaking code → one-click "+1" fix), "Posizione rapida" (`parseQuickLocation`, `S.settings.edLocOpen`), per-item contents status, "one line per item" mode, "Altro" section (contacts, notes), `EDITOR_ACTIONS` |
| 5 | `assets/js/05-views.js` | `UI` view-state, `renderTopbar` (calls `infoApplyCatColors()` + `topbarHTML()`), `renderView` (view router), `renderAll`, archive + shelf map, binder editor (`openEditor`, `validateEditor`, `saveEditor`), print studio, import (`analyzeImport`, `analyzeImportRecords(records, {format, delim, workspace})`, `applyImport`), export, AI, settings views |
| 5b | `assets/js/05b-import-map.js` | offline `.xlsx` reader (minimal ZIP + `DecompressionStream('deflate-raw')`, OOXML parser), column-mapping step (`UI.imap`, `imapRouteText`, `imapHandleFile`, `imapAutoMap`, `imapConfirm`), remembered mappings in `S.settings.importMappings`, `IMPORT_MAP_ACTIONS`, help topic `excel` |
| 5c | `assets/js/05c-pdf.js` | "Scarica PDF": renders `buildLabelSheets(false)` in an off-screen stage, removes CSS transforms (kept as `cm` matrices), walks the DOM into a vector PDF (backgrounds/borders/outlines as paths, overflow → clip paths, QR `<svg>` as paths, text per character from `Range.getClientRects` on probe-measured baselines), embeds TrueType subsets (CIDFontType2/Identity-H + ToUnicode) from `vendor/pdf-fonts.js` (lazy-loaded; built by `tools/make_pdf_fonts.py`), hand-written PDF writer with FlateDecode via `CompressionStream`; `pdfBuildLabels`, `pdfDownloadLabels`, `PDF.last`, `PDF_ACTIONS` (`pdf-download`), help topic `pdf` |
| 5d | `assets/js/05d-bulk.js` | **v10** "Modifica massiva": spreadsheet-like bulk-edit sub-view of Archivio (`BK` state, `bulkOn()`, `viewBulk`/`mountBulk`, `BULK_COLS`, staged `BK.draft`, `bkApply`/`bkUndoStep`/`bkValidate`/`bkSave`, windowed rendering, `BULK_ACTIONS`, help topic `bulk`); CSS in `assets/css-bulk.css` |
| 6 | `assets/js/06-db.js` | SQLite: `DB_DDL`, `dbMigrate`, `dbInit`, `dbSyncFromState`, `dbPersist` (IndexedDB + linked file), `dbReadWorkspace`, `applyWorkspaceObject`, sessions, `.sqlite` open/download/link, read-only SQL console, `viewDatabase` |
| 6b | `assets/js/06b-photos.js` | photos in SQLite `photos` table, shelf locator "Dov'è?", `PHOTO_ACTIONS` |
| 6c | `assets/js/06c-clients.js` | client register (`CLIENT_ALIASES`, `isClientList`, `mapClient`, import, editor, CSV export, `clientsPanelHTML`/`renderClientResults` shown in Informazioni › Clienti), demo bar, `CLIENT_ACTIONS` |
| 6d | `assets/js/06d-info.js` | top bar (`topbarHTML`, `NAV_MAIN`, `NAV_MORE`, `<details id="nav-more">` "Funzioni avanzate" menu), view `info` (`viewInfo`, `INFO_TABS`, `INFO_LISTS`, `infoRename`/`infoDelete`/merge), category colours (`infoApplyCatColors`), QR overview + "Ristampa solo QR" (`qrReprint`, `qrRestorePrint`, `S.printPrev`), label kind `Q` (`renderQrLabel`), `INFO_ACTIONS`, help topics `nav`, `info`, `qr-reprint` |
| 6e | `assets/js/06e-log.js` | activity log (v9): `logAct(action, target, summary, details, source)`, `LOG` (memory mirror) + SQLite `activity_log`, wrappers around exports/print/sessions/Informazioni/undo, view `log` (`viewLog`, filters `LOGV`, CSV), `S.settings.operator`, help topic `log` |
| 6f | `assets/js/06f-sync.js` | v10 manual sync local ⇄ web app (docs/SYNC.md): change tracking inside `persist()` (`syncTrack`: bumps `updated_at` when content changed without a bump, writes tombstones `S.tombstones` for vanished ids), stable `S.settings.deviceId` (+ localStorage `docmap_v26_device`), package `docmap-sync` v1 (`syncBuildPackage`, `syncExport`), optional AES-256-GCM/PBKDF2 wrapper `docmap-sync-enc` (`syncEncrypt`/`syncDecrypt`), `syncParse` → `syncAnalyze` (review plan: new/updated/unchanged/older/delete/conflict/propagate) → `syncApply` (one undo step, `logAct` source `'sync'`), peer bookkeeping `S.sync`, view `sync` (⚙ menu › Dati, pushed onto `NAV_MORE`), `SYNC_ACTIONS`, help topic `sync`. Wraps `persist`, `undoPoint`, `applyWorkspaceObject`, `analyzeImport`, `renderView`, `handleDroppedFile` |
| 7 | `assets/js/07-help.js` | extra i18n keys, `HELP_TAGS`, `HELP_TOPICS`, help drawer, `helpDot(id)`, onboarding |
| 8 | `assets/js/08-guide.js` | guided-action engine, `GUIDES` |
| 8b | `assets/js/10-auth.js` | v10 provider seams (`dmProviders()`, `DataProvider`/`AuthProvider`/`CryptoProvider`/`BlobStore`, local + remote stubs), `DocMapVault` (web-mode encrypted storage, boot gate), Impostazioni › Utenti e accesso, "Anteprima mobile", live merge of mobile edits, help topic `mobile` — §12 |
| 9 | `assets/js/09-actions.js` | `ACTIONS` map, global event delegation (click/input/change/keydown/drag-drop), file inputs, **boot** (`loadState` → `ensureIntegrity` → `persist` → `renderAll` → `maybeOnboard` → `dbInit`), `window.DocMap` test hook |

CSS: `assets/docmap.css` (main) + `css-info.css` (top bar, Informazioni), `css-editor.css` (typeahead, editor), `css-import.css` (column mapping), loaded in that order.
Tests: `tests/suite.js`, `tests/fixtures/clienti_esempio.csv` (fake data only).

A file may only use globals from files loaded **before** it at parse time; at call time everything is loaded. Late files extend earlier ones with `Object.assign(I18N.it, {...})`, `Object.assign(ACTIONS, PHOTO_ACTIONS, CLIENT_ACTIONS, IMPORT_MAP_ACTIONS, EDITOR_ACTIONS, INFO_ACTIONS)` (09-actions). Help topics added by 06d/05b are pushed onto `HELP_TOPICS` on `DOMContentLoaded`, because `HELP_TOPICS` is defined later (07-help).

## 3. State and data flow

- **Single source of truth: the global `S`** (also `window.S`), shape from `defaultState()` in `02-core.js`. Some keys are created lazily by the module that owns them: `S.infoTab`, `S.printPrev`, `S.settings.catColors`, `S.settings.qrPreset`, `S.settings.importMappings`, `S.settings.edLocOpen`. Ephemeral view state lives in `UI` (05-views; v8 adds `UI.infoq`, `UI.qrq`, `UI.qrSel`, `UI.qrLimit`, `UI.fInfo`, `UI.imap`), `DB` (06-db), `PH`, `HELP`, `G`, `TA` (typeahead).
- Flow of a data change:

```
mutate S  →  commit()                     (marks S.hasUnexportedChanges = true)
          →  persist()                    (localStorage 'docmap_v26_state'; previous copy in 'docmap_v26_state_prev')
          →  dbScheduleSync()  (700 ms)   →  dbSyncFromState(): ensureIntegrity + full rewrite of live tables
                                           →  dbPersist(): IndexedDB 'docmap_v26_sqlite'/kv 'db' (+ linked .sqlite file)
          →  renderTopbar()
exports (CSV / JSON / manifest / .sqlite download) → markExported(file) clears the dirty flag
```

- `savePrefs()` = persist without marking dirty (UI/print preferences). `commit({dirty:false})` for settings.
- SQLite is a **mirror**, rebuilt from `S` (DELETE + INSERT), except **photos** and **sessions**, which live only in SQLite.
- Loading a `.sqlite` or a session: `dbReadWorkspace(db)` → `applyWorkspaceObject(W)` → `commit()` → `renderAll()`.
- Rendering is string-based (`innerHTML`); always escape user data with `esc()`.
- Events: elements declare `data-a="action-name"`; one delegated click handler calls `ACTIONS[name](el, e)`. Inputs use `data-bind` (UI state), `data-ed` (editor field → `UI.ed.d[key]`), `data-ci` (content item), `data-geo`/`data-pp`/`data-fld`/`data-sp` (print), `data-set` (settings).

- **Sync (v10, 06f-sync.js)**: never set `updated_at` backwards and never remove a binder/client without going through `S.binders`/`S.clients` + `persist()`: `syncTrack()` (inside `persist`) bumps `updated_at` for records whose content changed and writes a tombstone for every vanished id. Set `SYNC.quiet = true` before a persist that must not bump or tombstone (bulk restore that carries its own timestamps). State: `S.tombstones`, `S.sync`, `S.settings.deviceId`, `S.settings.deviceLabel`. Contract: `docs/SYNC.md`.

## 4. Recipe: add a binder field end-to-end

Example: new field `foo`. Touch every item; the suite will catch most misses.

1. **Model** — `normalizeBinder()` (02-core): default value, include in the trim list, normalise.
2. **Full CSV** — add `'foo'` to `CSV_COLUMNS` and the value at the **same index** in `binderToCsvRow()` (04-ui). Never reorder existing columns (old files must still import by header). Note: v8 inserted `contacts, notes` after `shelf_color` (not at the very end), so code that reads the backup CSV by position must use the header; prefer appending after `updated_at` for future fields.
3. **Import aliases** — `HEADER_ALIASES.foo = ['foo', 'italian_name', …]` (04-ui). Header matching uses `normHeader()` (lowercase, accents stripped, non-alnum → `_`). Special parsing goes in `mapRecord()`.
4. **SQLite** — add the column to `DB_DDL` `CREATE TABLE binders`; in `dbMigrate()` add it to the `ALTER TABLE … ADD COLUMN` list for old DBs; add it to the `INSERT` column list **and** values in `dbSyncFromState()`; read it back in `dbReadWorkspace()`; bump `DB_SCHEMA_VERSION` with a comment. Update the schema codebox in `viewDatabase()` if relevant.
5. **AI prompt** — append to `csvTemplateHeader()` (keep it in sync with the "exactly N fields" rule and the two example rows in `buildAIPrompt()`), add a FIELD RULES line. Then fix **headerless import** in `analyzeImport()` (05-views): it guesses the column order from the row length (today ≥ 22 = v8 order, 20–21 = v7 order without `contacts, notes`, 17 = v5, other < 20 = pre-Multi); add the new length, and the list of lengths in `imapRouteText()` (05b, `aiRows`).
6. **Editor** — field in `openEditor()` (`data-ed="foo"`, `id="ed-foo"`), validation in `validateEditor()` if needed; the generic `input` handler stores `d[k] = el.value`.
7. **Print** — if printable: add to `DEFAULT_FIELDS` (03-print), render in `renderFull()` (and A/B/U if relevant) via `pf('foo')`, toggle in the print view's "fields" panel (`data-fld`), respect `pf('empty')` (blank `Field: ____` only when the user asks). `contacts`/`notes` are the v8 example: `DEFAULT_FIELDS.contacts = false`, `notes = false`, rendered only in `renderFull()`.
   Also consider: a typeahead source in `ED_SOURCES` (04b) and, if the value is a reusable list, an `INFO_LISTS` entry (06d).
8. **Search** — add to the haystack in `filteredBinders()` (05-views).
9. **Register / manifest / destination** — `buildRegisterHTML()`; `renderDest()` placeholder only if useful.
10. **Help** — mention in the relevant `HELP_TOPICS` entry (07-help) and in `README.md` (Italian); update a guide step in `GUIDES` if the editor flow changes.
11. **Docs** — `docs/MODELLO-DATI.md` (field table, CSV order, DDL).
12. **Migration** — if old states need a value, add a guarded step in `migrate()` and bump `schema`.
13. **Tests** — round trip CSV → import → equal, JSON, `.sqlite` download/open, AI headerless import, label render without `NaN`.

## 5. Recipes: view, action, help topic, guide, i18n key

- **View**: write `viewFoo()` returning HTML; add `foo:viewFoo` to the router map in `renderView()`; add it to the top bar in 06d-info: `NAV_MAIN` (`[view, icon, labelKey, shortLabelKey]`, only for everyday views — today Archivio, Stampa etichette, Informazioni) or a group of `NAV_MORE` (`[view, icon, labelKey, descKey]`, the ⚙ "Funzioni avanzate" menu; `ADV_VIEWS` and `navStepText()` follow automatically); add `foo:'nav_foo'` to `VIEW_LABEL` (08-guide); post-render hooks go in `renderView()`. Add `'foo'` to the "no h-scroll" view list in the suite.
- **Informazioni sub-tab**: add `[id, icon]` to `INFO_TABS` and, for a value list derived from binders/clients, an `INFO_LISTS[id] = {icon, kind:'csv'|'single'|'year', field, client, lower?, joiner?, mono?}` entry plus `in_<id>` / `in_d_<id>` i18n keys; rename/merge/delete then work through `infoRewrite()`.
- **Action**: `<button data-a="foo-do" data-id="…">`, then `ACTIONS['foo-do'] = (el, e) => {…}` (or a module-level `FOO_ACTIONS` merged in 09-actions with `Object.assign(ACTIONS, …)`). Mutations end with `commit()` + a re-render; destructive ones use `confirmAction()` + `undoPoint()`/`undoToast()`.
- **Help topic**: push `{ id, guide:'guideId'|null, tags:[keys of HELP_TAGS], related:[ids], title:{it,en}, body:{it,en} }` to `HELP_TOPICS`; link it in the UI with `helpDot('id')`.
- **Guide**: add to `GUIDES` `{ title:{it,en}, steps:[…] }`; step fields: `target` (selector or fn), `title`, `text`, `done()` auto-advance, `require()` soft validation (returns `{it,en}` message), `guard`, `onEnter`, `skipIf`, `advanceOn:'click'`, `final:true`. Use `navStep(view, title, text)` for navigation. Users perform the real action; closing the guide never closes a form.
- **i18n key**: add to both `I18N.it` and `I18N.en` (02-core or an `Object.assign(I18N.xx, …)` block in the module). Use `{var}` placeholders: `t('key', {var})`.

## 6. Running the tests

Requirements: Node.js, `playwright` (Chromium), `jsqr`, `pngjs`; Python 3 with `pypdfium2` (used to rasterise printed PDFs at 300 dpi for QR decoding).

```bash
cd docmapv1/tests
npm i playwright jsqr pngjs && npx playwright install chromium
pip install pypdfium2
node suite.js            # exit code 0 = all passed; screenshots in tests/shots/
```

The suite opens `index.html` via `file://` in Chromium and checks every view (no horizontal scroll at 1366×768, IT/EN), every preset × content mode × QR mode, QR decode on every printed slot, import/export round trips, SQLite, guides, 2000-binder performance and past bug cases. It prints `RESULT: N passed, M failed`. Page errors and console errors count as failures. v8 streams add tests under the `// @@STREAM-A@@`, `@@STREAM-B@@`, `@@STREAM-C@@` anchors.

## 7. Coding conventions

- 2-space indent, single quotes, semicolons, `'use strict'` (02-core). Compact one-line helpers are normal in this codebase; match the surrounding style.
- Globals: `UPPER_SNAKE` constants, `camelCase` functions; module prefixes (`db*`, `ph*`, `guide*`, `help*`, `cl-*` action names).
- HTML built by string concatenation; **every** dynamic value through `esc()`. Icons via `ic('name')`.
- Data keys are English `snake_case` and match CSV/SQLite column names. UI strings never hard-coded (except tiny bilingual inline cases already present).
- Imports are tolerant (aliases, delimiters `; , TAB`, UTF-8/UTF-16/Windows-1252, ```` ```csv ```` fences, Excel `sep=` line); exports are strict (fixed column order, `;`, UTF-8 BOM for Excel, formula guard `safeCell`).
- Keep functions pure where possible (`normalizeBinder`, `computeLocation`, `renderLabel` return values, no DOM writes).
- No new dependencies. If one is unavoidable, vendor it under `vendor/` with its licence and no network access.

## 8. Versioning

| What | Where | Bump when |
|------|-------|-----------|
| `APP_VERSION` (`'26.9.0'`) | 02-core | every release; written into workspace JSON `version` |
| State schema (`26.9`) | `defaultState().schema` and the final `o.schema = …` in `migrate()` | state shape or defaults change; add a guarded step `if (!(st && st.schema >= 26.x)) {…}` |
| `DB_SCHEMA_VERSION` (`5`) | 06-db | SQLite DDL changes; add an additive migration in `dbMigrate()` (never drop columns), note the change in the comment |
| `LS_KEY` (`docmap_v26_state`) | 02-core | never (would orphan users' data) |

Migrations must be **idempotent and additive**: old JSON, CSV (17/16-column) and `.sqlite` files must keep importing.

## 9. Commits

- The integrator commits; feature agents work in their own worktrees and do not push unless asked. Test anchors `// @@STREAM-A@@`, `@@STREAM-B@@`, `@@STREAM-C@@` in `tests/suite.js` mark where each v8 stream's tests live.
- Subject: `DocMap vN: short summary` (or `DocMap vN scaffolding: …`). Body: `- ` bullets of user-visible changes, then tests count (e.g. "suite at 459 checks").
- End with the attribution trailers given in the session (e.g. `Co-Authored-By: …`, `Claude-Session: …`).
- Update `README.md` (Italian, user-facing) and the relevant `docs/` file in the same commit as the behaviour change.

## 10. What v8 added (v7 → v8)

- **Navigation**: three main tabs (Archivio, Stampa etichette, Informazioni) + ⚙ "Funzioni avanzate" menu (`<details id="nav-more">`) with Importa, Esporta e Salva, Database (group "Dati") and Genera con AI, Impostazioni (group "Strumenti"). Menu items are still `.nav [data-a="nav"][data-v=…]` buttons; guides open the menu when a step targets an item inside it.
- **View `info`** replaces `clients`: `migrate()` and `renderView()` turn `view:'clients'` into `view:'info'` + `S.infoTab = 'clients'`. Sub-tabs `clients, tags, category, year, place, multi, extra, qr`. Value lists are computed live (nothing new stored); rename / merge / delete rewrite binders and clients with `undoPoint()` + `undoToast()`; the `demo` tag is protected. Clicking a usage count sets `UI.fInfo` and filters the Archive.
- **Category colours**: `S.settings.catColors {name: '#RRGGBB'}`; `infoApplyCatColors()` mutates `CAT_COLOR` (defaults + user choices) on every `renderTopbar()`.
- **QR reprint**: Informazioni › QR, preset `S.settings.qrPreset` (default `l7159`, choices `l7159, l7160, l7162, l7163, a4-21, a4-14` + custom presets), content mode `'qr'` → label kind `'Q'` (`renderQrLabel`). Previous print state saved once in `S.printPrev = {presetId, geometry, geometryModified, contentMode, sel, at}` and restorable.
- **Binder fields** `contacts` (comma-separated people) and `notes` (free text), both strings, not printed by default. **Contents item `status`** `'archive' | 'in_use' | 'client'` (helpers `CI_STATUSES`, `CI_SUFFIX`, `normCiStatus`, `ciText` in 02-core); in pipe/CSV text a suffix `[in uso]` / `[cliente]`, none = archive.
- **CSV**: `CSV_COLUMNS` 27 columns (`contacts, notes` after `shelf_color`); AI template 22 columns. **SQLite** v4: `binders.contacts`, `binders.notes`, `contents_items.status TEXT DEFAULT 'archive'`.
- **Editor**: typeahead on client, Codice Multi, place, category, year, extra codes, tags, contacts, room, cabinet, quick position and content descriptions; duplicate company-spelling guard, duplicate speaking code "+1" fix, "Posizione rapida", per-item status, "Altro" section.
- **Import**: `.xlsx` (offline) and column-mapping step for every non-standard table, with remembered mappings (`S.settings.importMappings`, 40 most recent layouts). Known limits: merged cells are not expanded, formulas without a cached value are empty, `.xls`/`.xlsb`/`.ods` and password-protected files are refused, `.xlsx` needs `DecompressionStream` (Chrome/Edge ≥ 103).

Field-level details and file formats: `docs/MODELLO-DATI.md`.

## 11. Don'ts

- Don't add `type="module"`, `import`/`export`, `fetch()` of local files, CDNs, web fonts, analytics or any network call.
- Don't add frameworks, TypeScript, build steps or npm runtime deps.
- Don't rename or reorder existing `CSV_COLUMNS`, manifest header (`short_code;short_url;final_destination;tags`), SQLite columns, `LS_KEY` or state keys.
- Don't regenerate or reuse an existing `short_code` silently; don't change `id`s on import/merge.
- Don't invent `multi_code`, clients, documents or locations (in code, demo data or AI prompts).
- Don't print the `demo` tag or demo binders when `hideDemo` is on.
- Don't use px in label/print geometry; don't change `@page` margins for labels.
- Don't write user strings in only one language; don't bypass `esc()`.
- Don't make destructive actions without `confirmAction` + undo.
- Don't store photos in localStorage/JSON (they live in SQLite only).
- Don't commit real client data; fixtures must be invented.

## 12. Spine colour model (v10, `02b-colors.js`)

- **Data**: `binder.color_hex` (as before) + `binder.color_locked` (boolean, v10; CSV: last column of `CSV_COLUMNS`, `1`/`0`; SQLite: `binders.color_locked INTEGER DEFAULT 0`, `DB_SCHEMA_VERSION 6`; JSON: plain key). Settings: `S.settings.colorMode` (`'company'` default | `'category'` | `'manual'`), `S.settings.catFamilies {category: familyId}` (new), `S.settings.catColors` (v8, now the family *anchor*).
- **Families**: `COLOR_FAMILIES` (10 × 10 shades, white-text contrast ≥ 3:1, ΔE2000 ≥ 7 within a family; the first shade of blue/green/violet/orange/red equals the v9 `CAT_COLOR` default). Never edit a shade casually: the suite checks contrast and distance; generate new ones in OKLCH and re-check.
- **Rules**: category → family = `catFamilies` → nearest family of `catColors[cat]` → `COLOR_CAT_RULES` by name → FNV-1a hash of the name. `colorAssign(b, binders)` in `'company'` mode: same company (`companyKey`) + same category → same shade; otherwise first free shade from `FNV-1a(companyKey) mod n`, least used when exhausted. `'category'` = `colorCategoryHex(cat)` (v9 behaviour). `'manual'` = keep.
- **Locks**: anything the user picks by hand sets `color_locked = true`; auto code (`applyAutoColor`, `recolorAll`, editor company/category changes, bulk edit) must never overwrite a locked colour. Call `applyAutoColor(b)` after changing `company_name`/`category` programmatically (it does not commit); use `recolorAll(opts)` for user-visible recolours (undo + `logAct('binder.recolor')`).
- **Hooks in other files** (one line each): `normalizeBinder` (02-core), `migrate()` legacy lock, `HEADER_ALIASES`/`mapRecord`/`binderToCsvRow` (04-ui), `openEditor`/`swatchesHTML`/`analyzeImportRecords`/`viewSettings` (05-views), `edCompanyInput`/`edFillFromCompany` (04b), `applyClientToEditor` (06c), `infoApplyCatColors`/`openCatColor`/rename-delete of `catFamilies` (06d), DDL/`dbMigrate`/sync/read/`applyWorkspaceObject` (06-db), `ed-color`/`color_hex`/`category` input handlers (09-actions), `IMAP_LABELS`/`IMAP_TECH` (05b).
- **Upgrade**: never recolour existing binders automatically; data without `settings.colorMode` is pre-v10 and goes through `colorLockLegacy()` (locks non-automatic colours). Details and the exact algorithm (useful to reproduce in Python): `docs/MODELLO-DATI.md` §12.

## v10 stream R — PDF compatibility and page selection

- **Page selection / order** (print, PDF and preview): state `S.print.pages = {sel:'all'|'1-3,5', reverse:false, order:null|[3,1,2…], sig:''}` (created lazily, no migration; `pagesCfg()` normalises). Core in 03-print.js: `pageSelParse(sel, n)` (set semantics; `'none'` = nothing), `pageOrderValid`, `pageSig(L)` (hash of binder ids per page), `labelPageOrder(L)` → ORIGINAL 0-based page indices in output order (custom order → selection filter → reverse). `buildLabelSheets(screen)` returns sheets in that order, so every consumer (print, PDF, preview) follows it. The page index passed to the renderer stays the original one: the used-slot skip of the partial sheet always stays on original sheet 1. `printLabels()` / `pdfAskUsedSlots()` skip the "update partial map" question when the last sheet is not in the job.
- **Stale selection**: `sig` records the layout the choice was made for; if the queue changes the pages, `labelPageOrder` ignores `sel`/`order` and `pagesCheck()` (05c) resets them with a notice (`reverse` is kept).
- **UI** (05c-pdf.js): `pagesPanelHTML()` / `renderPagesPanel()` (called by `refreshPrint()`), section `#pr-pages-sec` in `viewPrint()`, `PAGE_ACTIONS` (`pg-all`, `pg-rev`, `pg-tick`, `pg-up`, `pg-down`, `pg-first`, `pg-reset`, `pdf-cmyk`), `#pg-sel` change handler, styles injected as `<style id="css-pages">`, help topics `pages` (new) and `pdf` (updated).
- **PDF writer guarantees** (keep them when touching 05c): `%PDF-1.4` + binary line, classic xref, trailer `/ID`, `/Info` + XMP, fonts embedded (FontFile2, CIDToGIDMap /Identity, /W, /CIDSet, ToUnicode), no transparency (alpha and CSS opacity are flattened with `pdfColor(css, op)`), all page boxes = A4, `/Rotate 0`, no annotations, `/PrintScaling /None`, strokes >= 0.1 pt (`pdfLW`), QR as merged rectangles in one fill (`pdfQrRects`). Colour operators go through `pdfFillOp` / `pdfStrokeOp`; `S.print.pdfCmyk` switches them to DeviceCMYK with neutral colours as K only (`pdfCMYK`).

## 13. v10: mobile page, provider seams, web mode (stream M)

- **Config** `docmap.config.js` (classic script, loaded first by `index.html` and `scan.html`): `window.DOCMAP_CONFIG =
  {mode:'local'|'web', basePath, apiBase, studioSlug, studioName}`. `dmConfig()` reads it with defaults.
  `local` = unchanged MVP. `web` without `apiBase` = static upload: login on every page, data encrypted in the browser.
  `web` with `apiBase` (or `mode:'remote'`) = Remote providers (`docs/API-CONTRACT.md`).
- **`scan.html`** + `assets/js/11-scan.js` + `assets/css-scan.css`: the page after scanning a QR. Loads only
  `02-core.js`, `10-auth.js`, `11-scan.js` (no desktop modules); sets a light `S = {lang, settings}` for `t()`/`fmtDate()`.
  Route: `?q=` · `?qr=` · `…/q/<code>` (path, `<base>` fixed by an inline head script) · `#/q/<code>` · `?code=`
  (`scResolveRoute`). Views in `SC.view`: `nousers | login | noqr | notfound | card | edit` (+ `nocrypto`, `error`).
  Logged out renders no binder data at all. Editors get the round "Modifica" button → `MOBILE_FIELDS`
  (`archive_state, contents_items, room_code, cabinet_code, shelf_code, sector_code, notes, tags`).
- **Providers** (`10-auth.js`, JSDoc interfaces at each class): `dmProviders()` → `{mode, cfg, auth, data, crypto, blobs}`.
  `LocalDataProvider.saveBinderPatch(id, patch, {etag, user, force})` re-reads the stored state, checks
  `updated_at === etag` (else `DMError('conflict', {current})`), applies only the patched fields (`mobileApplyPatch`,
  normalised, `updated_at` strictly increasing), writes `LS_KEY` (+ `LS_PREV`) or the vault, and appends an activity-log
  entry `{action:'binder.edit', source:'mobile', details:{changed, patch, base_updated_at, new_updated_at, user_id, forced}}`
  to `docmap_v26_log_pending` (or the vault log). 06e-log accepts `source:'mobile'`. The open desktop applies the same
  patch live (`mobileLiveMerge`, storage event) when its copy of the binder is unchanged; otherwise the reload banner stays.
- **Auth**: users in `localStorage 'docmap_v26_auth'` (not in S, backups, CSV or SQLite), hash
  `pbkdf2_sha256$600000$salt$hash`, backoff counters `docmap_v26_auth_fail`, session `sessionStorage 'docmap_v26_session'`.
  Desktop UI: `authSettingsHTML()` appended to `viewSettings()`, actions `au-add`, `au-edit`, `au-del`, `mob-preview`, `vl-lock`
  (`AUTH_ACTIONS`, merged on DOMContentLoaded). Log actions `settings.user_add|user_edit|user_delete`.
- **Web-mode vault** `window.DocMapVault` (`isActive · isUnlocked · loadState · saveState · flush · lock · gateBoot`):
  `02-core.js` `loadState()`/`persist()` route through it, `09-actions.js` boot is `dmBoot()` behind
  `DocMapVault.gateBoot(dmBoot)`, `idbGet/idbSet('db')` and `logSavePending` are wrapped here. Storage keys:
  `docmap_v26_vault`, `_vault_prev`, `_vault_log`, `sessionStorage 'docmap_v26_vault_session'`, IndexedDB `docmap_v26_keys`.
  A sync import (06f-sync.js) just mutates `S` and calls `commit()`: it is stored encrypted automatically.
- **BlobStore**: IndexedDB `docmap_v26_blobs`; photos (06b) are **not** migrated yet — see `docs/SICUREZZA.md` §4.
- **Deploy**: `python3 tools/build_deploy.py [TARGET] [--base-path /studio-de/]` → static folder (default
  `../deploy/studio-de/`) with web config, `.htaccess`, `404.html`, `robots.txt`, nginx example, `README-DEPLOY.md`, manifest.
- **DB schema**: no DDL from this stream (`DB_SCHEMA_VERSION` 6 comes from `color_locked`, §12). Users and blobs are deliberately not in the SQLite file.
- **Destination default**: `DEFAULT_DEST = 'https://docmap.pr-it.it/studio-de/q/{short_code}'`; the v9 default is in
  `OLD_DEFAULT_DESTS` and is replaced by `migrate()` only when unchanged.

## v10 E — Bulk edit ("Modifica massiva", `05d-bulk.js`)

- **Entry**: button `#btn-bulk` (`data-a="bulk-open"`) in the archive toolbar. Mode flag `BK.on` (ephemeral, never persisted; not an `S.archiveView` value). `renderView()` renders `viewBulk()` + `mountBulk()` instead of `viewArchive()` while `bulkOn()` is true; "Torna all'archivio" (`bulk-close`) leaves it (asks before discarding pending changes).
- **Rows** = `filteredBinders()` (same search / state / room / category / Informazioni filter / hideDemo as the archive; the bulk toolbar writes the same `UI.q`, `UI.fState`, `UI.fRoom`, `UI.fCat`), then sort (`BK.sort {k, dir}`, header click) and group (`BK.group`: `'' | category | company_name | archive_state | room_code`). `BK.rows` mixes `{b}` and `{g, ids}` (group header) rows.
- **Columns**: `BULK_COLS` (`k`, width, `ta` = `ED_SOURCES` key, `multi`, `sel`, `color`, `loc`, `req`, `hide`). Visible set in `S.settings.bulkCols` (lazy, array of keys; absent = every column without `hide`). The `location_code` column edits `room_code/cabinet_code/shelf_code/sector_code` through `parseQuickLocation()`.
- **Staged changes**: `BK.draft: Map(id → {field: value})`; `bkApply([{id, patch}])` is one undoable step (`BK.hist`, Ctrl+Z); values equal to the saved ones drop out. `bkValidate()` → `BK.errs` (empty / duplicate speaking code across the whole archive, empty client; same messages as the editor) blocks `bkSave()`. Company names typed in a cell are replaced by the existing spelling (`edFindCompany`).
- **Save** (`bkSave`): `undoPoint()` → `normalizeBinder(old + draft)` per binder → `logAct('binder.bulk_edit', target|null, summary, {count, fields, binders:[{id, code, changed:logDiff}]})` → `commit()` → `undoToast()`. Ctrl+Z in the grid after a save restores the `UNDO` snapshot (same as the toast).
- **Rendering**: fixed row height `BK.rowH` (34 px), only the rows in view + overscan are in the DOM (`bkRenderBody`), spacer rows keep the scroll height; 2000 binders open in well under a second. The grid (`#bk-grid`) is the only element that scrolls horizontally.
- **Keyboard** (grid has focus): arrows, Tab/Shift+Tab, Home/End, PgUp/PgDn, Enter/F2 or typing edits, Esc cancels (in an editor) or clears the selection, Space selects, Shift+↑/↓ extends the selection, Ctrl+A all, Ctrl+D fill down into the selected rows, Ctrl+C / Ctrl+V (internal clipboard), Delete clears, Ctrl+Z undo, Ctrl+S save (captured before the global quick-backup shortcut while changes are pending).
- **Apply to selected** ops: `category`, `tag_add`, `tag_rm`, `state`, `color`, `color_auto` (only if the colour module exposes one), `loc` (position prefix: only the parts typed are set), `year`, `city`.
- **Colour hooks (interface expected from 02b-colors.js)**: `colorAssign(binder, binders) → '#RRGGBB'` or `applyAutoColor(binder, binders)` (may mutate the copy and/or return a hex) for "Colore automatico"; optional `colorMarkManual(binder)` after a manual colour. Any field they change on the copy is staged too. Without them only the plain colour input is shown.
- To add a column: append to `BULK_COLS`, add `bk_c_<key>` in IT + EN, extend `bkPatchFor()` if the value needs normalising.

