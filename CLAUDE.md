# Working context for ResearchDesk

Read this first, then `docs/architecture.md` and `docs/roadmap.md`.

## What this is
A local-first research paper workspace: library + PDF reader + notes + reading-session history. The owner is a software engineer and ML researcher who reads many papers and wants a record of his reading over time, not just a file manager.

## Current state
- `prototype/` is a no-build vanilla JS app. `app.js` is one IIFE (~700 lines) organised in sections marked `/* ---------- name ---------- */`: storage, example library (`seed()`), sidebar, overview, library, reader, sessions, panel, markdown (`md()`), selection→highlight, import, events.
- State is one object `S = {papers, ui}` persisted to localStorage via `save()` / `saveSoon()`. PDF blobs go to IndexedDB via the `idb` helper.
- Rendering is string templates + `innerHTML`. Events use one delegated `click` listener keyed on `data-act`.
- The reader keeps runtime state in `R` (pdf handle, scale, current page, live session). `R` is null outside the reader.
- PDF.js 3.11.174 UMD from cdnjs. The worker script is loaded as a normal `<script>`, which sets `globalThis.pdfjsWorker` so PDF.js runs on the main thread. Keep this unless you vendor the worker and serve it same-origin.

- `reference/` holds the original idea notes, the design skill used, and the single-file build. Read `reference/skills/artifact-design/SKILL.md` before changing the UI.

## Conventions
- Colours only through CSS tokens in `styles.css` `:root`, with matching dark values in both dark blocks.
- Fonts: Source Serif 4 (display, notes, paper text), IBM Plex Sans (UI), IBM Plex Mono (numbers, page refs).
- Highlight rects are stored normalised to the page (0–1), so they survive zoom changes.
- Page references in notes match `/\b[pP]p?\.\s?(\d+)/`.
- Copy in the UI: plain, active voice, name things the way a reader would.

## How to run / check
- `npm run dev` → http://localhost:5173
- `npm run check` → syntax check of `app.js`

## Next steps
See `docs/roadmap.md`. Phase 1 items are small and safe to do inside the prototype. Phase 2 is the move to Tauri + React + SQLite; don't start it without agreeing the data model in `docs/data-model.md`.

## Do not
- Add a build step or npm dependencies to `prototype/` (it should stay openable from a static server).
- Store highlights only as rectangles: when adding anchoring, keep text + context too (see decisions.md D-004).
