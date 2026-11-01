# DocMap 2026 (DM26) — Phygital Archive & Precision Label Studio

Single-file MVP: open `index.html` with a double-click. No server, no install, works offline
(the QR generator is embedded; Inter/JetBrains Mono load from Google Fonts when online and fall back to system fonts offline).

- Data is saved automatically in `localStorage` (`docmap_v26_state`, plus a previous snapshot `docmap_v26_state_prev`).
- Print dialog: Scale 100% / Actual size, Margins: None, headers/footers off.
- Exports: `manifest_qr7_dm26.csv` (qr7.it, `;`), merge into an existing `manifest.csv`, `docmap_full_backup.csv`, `docmap_workspace.json`, printable register.
