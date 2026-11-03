# Roadmap

## Phase 0: prototype ✅
Browser app in `prototype/`. Library, lifecycle, PDF reader, highlights, notes with page links, sessions, overview dashboard.

## Phase 1: make the prototype usable day to day
Small changes, no build step.

- [ ] **Export / import** all data as one JSON file (plus PDFs as a zip) so nothing is lost when moving to desktop
- [ ] **arXiv / DOI import**: paste an id, fill title, authors, year, venue (arXiv API, Crossref)
- [ ] **Full-text search** across notes and highlights (simple in-memory index)
- [ ] **Highlight re-anchoring**: store prefix/suffix text and re-find highlights when a PDF is replaced
- [ ] **Click a highlight on the page** to open its comment
- [ ] **Session edit/delete** for mistaken sessions
- [ ] **Outline sidebar** from the PDF's table of contents (`pdf.getOutline()`)
- [ ] Vendor PDF.js locally so the app works offline

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
