# Roadmap

## Phase 0: prototype ✅
Browser app in `prototype/`. Library, lifecycle, PDF reader, highlights, notes with page links, sessions, overview dashboard.

## Phase 1: make the prototype usable day to day
Small changes, no build step.

Done:
- [x] **Library on disk under `pdfdesk`** (0.2.0): `~/PDFDesk/` with library.json, real PDF files and daily backups, so any port or browser shows the same library and clearing browser data deletes nothing. Browser libraries move in automatically. Spec: [disk-storage.md](disk-storage.md), decision D-010
- [x] **Export / import** the whole library as one `.zip` (library.json, PDFs, readable Markdown notes); import merges without deleting. Spec: [export-import.md](export-import.md)
- [x] **Vendor PDF.js and fonts** so the app works offline (D-009)
- [x] **Zoomed pages scroll to both edges** (0.2.2)
- [x] **Collapsible sidebar and notes panel** (`[` and `]`); pages re-fit to the freed width
- [x] **Panel and page link up**: click a highlight card to see it on the page; `p. N` links next to a quoted highlight jump to that highlight; click a highlight on the page to open its card
- [x] **Links in the PDF work** (citations, cross-references, contents pages, web links) with **Back** (button, `Alt+←`, mouse back button)
- [x] **Contents tab** from the PDF's outline: jump to a section (with Back), the current section is marked
- [x] **Session edit/delete** for sessions logged by mistake
- [x] **Search** across notes, highlights and session takeaways from the sidebar; each result opens the right page, highlight or note line
- [x] **Add by arXiv ID or DOI**: details from arXiv / Crossref, arXiv PDFs downloaded into the library folder (needs `pdfdesk`; D-011)
- [x] **Highlight re-anchoring**: highlights keep the text around them; replacing a PDF finds each one again by its text (also when slightly reworded), and any that can't be found are kept and marked
- [x] **Add by link, without the PDF**: link, details (BibTeX from Google Scholar fills them), abstract, tags and notes; a paper page instead of pages, no sessions; attach the PDF later. arXiv/DOI links can be filled in under `pdfdesk`
- [x] **Tag suggestions**: the tag box lists existing tags (most used first, narrowed as you type); keys and mouse; Details and Add by link
- [x] **Abstract** field for every paper, searched by the library search

Still open:
- [ ] **Same text, new colour**: highlighting text that's already highlighted offers to change its colour (with Undo) instead of adding a duplicate; change a highlight's colour from its card
- [ ] **Insert highlights adds only what's new**, not every highlight again
- [ ] **Reference preview on hover**: show the cited reference in a pop-up without jumping
- [ ] **"Last export" date** kept in the library folder rather than per browser
- [ ] Search inside the PDFs' own text (Phase 2 does this with FTS5; in the prototype it would mean indexing every page on import)

## Distribution: pip (`pdfdesk`)
See decisions.md D-008. One package name and one command across both stacks.

- [x] **0.1.0**: wheel bundles `prototype/` + stdlib server; `pdfdesk` opens it at http://localhost:5173
- [x] **0.2.1**: export/import, library on disk, open the folder from the app (on PyPI; 0.1.1 and 0.2.0 were tagged but never published)
- [x] **0.2.2**: zoom scrolling fix (on PyPI)
- [x] **1.0.0**: first stable release; everything in CHANGELOG.md's 1.0.0 entry (on PyPI)
- [ ] **2.x**: platform wheels carrying the Tauri binary (Windows x64, macOS x64 + arm64, Linux x64), built in CI; `pdfdesk` launches the app. Consider pytauri if the backend should be Python
- [ ] 2.x first run: offer to import a 1.x export file (or read the 1.x library folder directly)
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
