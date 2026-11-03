# Decision log

Short records of choices made and why. Add new ones at the bottom.

## D-001 · Local-first (2026-11-03)
PDFs, notes and history stay on the user's machine. Sync, if any, comes later and stays optional.
*Why:* research libraries are personal and large; owning the files matters more than multi-device access.

## D-002 · Prototype as a no-build static page (2026-11-03)
Vanilla HTML/CSS/JS, PDF.js (from CDN at first, vendored since D-009), localStorage + IndexedDB.
*Why:* fastest way to test the workflow (lifecycle, sessions, notes) before investing in the desktop stack.

## D-003 · Reading history is the core feature (2026-11-03)
Sessions (pages, active minutes, takeaway) and the reading calendar get first-class UI. Annotation features follow existing tools rather than trying to beat them.
*Why:* it's the gap in Zotero, LiquidText, Readwise and Paperpile.

## D-004 · Highlights store text, not just positions (2026-11-03)
Each highlight keeps the selected text and page-relative rectangles. Desktop version adds prefix/suffix context and the PDF hash.
*Why:* positions break when a PDF is replaced (e.g. a new arXiv version); text lets us re-anchor.

## D-005 · Active time, not open time (2026-11-03)
Sessions count time only while the tab is visible and there was input in the last 3 minutes.
*Why:* wall-clock time would make the stats meaningless.

## D-006 · Target stack: Tauri + React + SQLite (proposed)
Not final. Alternative is staying web-first with the File System Access API.

## D-007 · Name: PDFDesk, shipped on PyPI as `pdfdesk` (2026-11-03)
The project was called ResearchDesk. The product, package and command are now PDFDesk / `pdfdesk`.
The browser storage keys (`localStorage["researchdesk.v1"]`, IndexedDB `researchdesk`) keep the old name on purpose.
*Why:* `pdfdesk` was free on PyPI. Renaming the storage keys would make existing libraries look empty, and nobody sees them.

## D-008 · pip is a long-term distribution channel (2026-11-03)
`0.x` wheels bundle the browser app and a stdlib Python server (no Python dependencies). `1.x` will ship the Tauri app as platform-specific wheels under the same name and command, the way Ruff and uv ship Rust binaries. Native installers (`.msi`, `.dmg`) can sit alongside.
*Why:* the first users already have Python. One name and one command across both stacks means `pip install -U pdfdesk` is the upgrade path.
*Costs:* per-platform CI builds for 1.x; Linux users install WebKitGTK themselves; no Start menu entry from pip; Tauri's own updater is off for pip installs.

## D-009 · Vendor PDF.js and fonts (2026-11-03)
PDF.js 3.11.174 and Latin/Latin Extended subsets of the three fonts live in `prototype/vendor/` with their licences (Apache-2.0, SIL OFL 1.1).
*Why:* a local-first app that needs the internet to open a PDF isn't local-first. Other scripts fall back to system fonts to keep the package small.

## D-010 · Under `pdfdesk`, the library lives on disk (2026-11-03)
The Python server stores the library in a folder (`~/PDFDesk` by default): `library.json`, real PDF files in `pdfs/`, daily backups. The app uses it whenever the server's API answers, and falls back to browser storage on a plain static server.
*Why:* browser storage is per origin and per browser, so another port or browser showed an empty library and clearing site data deleted everything. Export/import only works around that by hand. The folder layout is the one 1.x will use, so 0.2 users already have their data where the desktop app expects it.
*Spec:* [disk-storage.md](disk-storage.md).
