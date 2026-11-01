# DocMap 2026 (DM26) — Phygital Archive & Precision Label Studio

Open `index.html` with a double-click. No server, no install, works offline. You can zip the whole `docmapv1/` folder and copy it to any PC.

```
docmapv1/
  index.html            entry point (dashboard)
  assets/docmap.css     design system + millimetre print engine styles
  assets/js/01-qr.js    embedded SVG QR encoder (byte mode, ECC L/M/Q/H)
  assets/js/02-core.js  i18n IT/EN, data model, localStorage persistence
  assets/js/03-print.js label layouts, sheets, calibration sheet, register
  assets/js/04-ui.js    modals, toasts, CSV, exports, manifest merge, AI prompt
  assets/js/05-views.js screens
  assets/js/06-db.js    local SQLite (sql.js/WASM): live tables, sessions, .sqlite files
  assets/js/07-help.js  "?" help drawer, tagged topics, mini wiki, onboarding
  assets/js/08-guide.js guided actions engine + 10 guided actions
  assets/js/09-actions.js event wiring + boot
  vendor/sql-wasm.js    sql.js 1.10.3 (MIT) with the .wasm embedded as base64, so it loads from file://
```

Scripts are classic `<script src>` tags (not ES modules) on purpose: modules and `fetch()` are blocked on `file://`.

## Data
- Working state: `localStorage` key `docmap_v26_state` (+ previous snapshot `docmap_v26_state_prev`).
- SQLite: working copy in IndexedDB (`docmap_v26_sqlite`), mirrored from the state after every change. Tables: `binders`, `contents_items`, `sessions`, `settings`, `label_presets`, `audit_log`, `meta`, view `v_manifest_qr7`.
- Download/open `.sqlite` files anywhere; on Chrome/Edge you can link a file on disk for automatic saving (File System Access API).
- Exports: `manifest_qr7_dm26.csv` (qr7.it, `;`), merge into an existing `manifest.csv`, `docmap_full_backup.csv`, `docmap_workspace.json`, printable register.

QR codes always encode `https://qr7.it/{short_code}` (static), the qr7.it server does the dynamic redirect.

Print dialog: Scale 100% / Actual size, Margins: None, headers/footers off.
