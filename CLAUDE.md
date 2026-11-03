# Working context for PDFDesk

(Formerly ResearchDesk. Product, PyPI package and command are `pdfdesk`; browser storage keys keep the old name, see decisions.md D-007.)

Read this first, then `DEVELOPMENT.md`, `docs/architecture.md` (incl. "Where your data lives") and `docs/roadmap.md`. Export/import is specified in `docs/export-import.md`; build to that spec.

`README.md` is the product page and the PyPI description: user-facing copy only, absolute image URLs. Developer detail goes in `DEVELOPMENT.md`. When a user-visible feature changes, update both.

## What this is
A local-first research paper workspace: library + PDF reader + notes + reading-session history. The owner is a software engineer and ML researcher who reads many papers and wants a record of his reading over time, not just a file manager.

## Current state
- `prototype/` is a no-build vanilla JS app. `app.js` is one IIFE (~1000 lines) organised in sections marked `/* ---------- name ---------- */`: storage, example library (`seed()`), sidebar, overview, library, reader, sessions, panel, markdown (`md()`), selection→highlight, import, export / import, events.
- State is one object `S = {papers, ui}` persisted via `save()` / `saveSoon()`; PDFs go through the `idb` helper. Two backends behind those (see architecture.md § Where your data lives): under `pdfdesk` the library folder via `/api/` (`pdfdesk/store.py`), on a static server localStorage + IndexedDB. Never write to localStorage/IndexedDB directly for library data; go through `save()` and `idb`. `boot()` at the bottom of `app.js` picks the backend.
- Rendering is string templates + `innerHTML`. Events use one delegated `click` listener keyed on `data-act`.
- The reader keeps runtime state in `R` (pdf handle, scale, current page, live session). `R` is null outside the reader.
- PDF.js 3.11.174 UMD and the fonts are vendored in `prototype/vendor/` (no CDN, works offline). The worker script is loaded as a normal `<script>`, which sets `globalThis.pdfjsWorker` so PDF.js runs on the main thread.
- `pdfdesk/` is the Python package: `cli.py` serves the app with the stdlib on 127.0.0.1:5173. The wheel bundles `prototype/` as `pdfdesk/static/` at build time (hatchling `force-include` in `pyproject.toml`); there is no second copy in the repo.

- The About page (`aboutHTML()`, data in `AUTHOR` and `FEATURES` in `app.js`) lists every feature. When a feature is added or changed, update `FEATURES` there and README.md.

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
- `python -m pdfdesk --data-dir <temp>` → same app via the Python server with a throwaway library folder (don't test against your real `~/PDFDesk`)
- `python -m unittest discover -s tests` → server + store tests; e2e scripts in `scripts/e2e/` (see DEVELOPMENT.md)
- `python -m build` → wheel + sdist in `dist/`; bump `__version__` in `pdfdesk/__init__.py`

## Next steps
See `docs/roadmap.md`. Phase 1 items are small and safe to do inside the prototype. Phase 2 is the move to Tauri + React + SQLite; don't start it without agreeing the data model in `docs/data-model.md`.

## Do not
- Add a build step or npm dependencies to `prototype/` (it should stay openable from a static server).
- Add Python dependencies to `pdfdesk` 0.x; the stdlib is enough.
- Loosen the server's Host/Origin checks or answer CORS preflights: they are what stops other websites reading or writing the library.
- Rename the browser storage keys (`researchdesk.v1`, IndexedDB `researchdesk`): 0.1.x libraries are found and moved into the folder by those names.
- Store highlights only as rectangles: when adding anchoring, keep text + context too (see decisions.md D-004).
