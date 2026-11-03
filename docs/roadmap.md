# Roadmap

## Phase 0: prototype ✅
Browser app in `prototype/`. Library, lifecycle, PDF reader, highlights, notes with page links, sessions, overview dashboard.

## Phase 1: make the prototype usable day to day
Small changes, no build step.

- [x] **Library on disk under `pdfdesk`** (0.2.0): `~/PDFDesk/` with library.json + real PDF files + daily backups, so any port or browser shows the same library and clearing browser data deletes nothing. Browser libraries move in automatically. Spec: [disk-storage.md](disk-storage.md), decision D-010
- [x] **Export / import** the whole library as one `.zip` (library.json + PDFs + readable Markdown notes); import merges without deleting. Spec: [export-import.md](export-import.md). **Do this next:** it must ship in a 0.x release before 1.x, or 0.x users lose their library when they upgrade. It also rescues data stranded on another port or browser
- [ ] **arXiv / DOI import**: paste an id, fill title, authors, year, venue (arXiv API, Crossref)
- [ ] **Full-text search** across notes and highlights (simple in-memory index)
- [ ] **Highlight re-anchoring**: store prefix/suffix text and re-find highlights when a PDF is replaced
- [ ] **Click a highlight on the page** to open its comment
- [ ] **Session edit/delete** for mistaken sessions
- [ ] **Outline sidebar** from the PDF's table of contents (`pdf.getOutline()`)
- [x] Vendor PDF.js and fonts locally so the app works offline (D-009)

## Distribution: pip (`pdfdesk`)
See decisions.md D-008. One package name and one command across both stacks.

- [x] **0.1.0**: wheel bundles `prototype/` + stdlib server; `pdfdesk` opens it at http://localhost:5173
- [ ] Publish 0.x to PyPI (MIT licence chosen; needs a PyPI account and an API token)
- [ ] **0.2.1**: export/import + library on disk + open the folder from the app (tagged; publish to PyPI)
- [ ] **1.x**: platform wheels carrying the Tauri binary (Windows x64, macOS x64 + arm64, Linux x64), built in CI; `pdfdesk` launches the app. Consider pytauri if the backend should be Python
- [ ] 1.x first run: offer to import a 0.x export file
- [ ] Optional native installers (`.msi`, `.dmg`) alongside pip

## Phase 2: desktop app (Tauri + React + SQLite)
- [ ] Scaffold `app/` with Tauri 2 + Vite + React + TS
- [ ] SQLite schema from `docs/data-model.md`, migrations
- [ ] Managed library folder with content-hashed PDFs; optional watched "drop" folder
- [ ] Port views: overview, library, reader, panel
- [ ] Importer for the Phase 1 JSON export
- [ ] Focus-based session tracking (window focus + input), not just tab visibility
- [ ] FTS5 search over PDF text, notes, highlights

## Phase 3: research features
- [ ] Paper links (builds-on / compares / contradicts) and a simple graph view
- [ ] Spaced revision queue (review intervals instead of daily rotation)
- [ ] Weekly reading report
- [ ] Zotero import (read `zotero.sqlite` + storage folder)
- [ ] AI: summarise my highlights + session notes into a structured note, every line linked to a page

## Open questions
- Keep a single note per paper, or allow multiple notes (e.g. per section)?
- Should Revisit be a status, or a flag that can sit on top of Completed?
- Sync: none, a user-chosen folder (Dropbox/OneDrive), or something custom?
