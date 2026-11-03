# Decision log

Short records of choices made and why. Add new ones at the bottom.

## D-001 · Local-first (2026-11-03)
PDFs, notes and history stay on the user's machine. Sync, if any, comes later and stays optional.
*Why:* research libraries are personal and large; owning the files matters more than multi-device access.

## D-002 · Prototype as a no-build static page (2026-11-03)
Vanilla HTML/CSS/JS, PDF.js from CDN, localStorage + IndexedDB.
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
