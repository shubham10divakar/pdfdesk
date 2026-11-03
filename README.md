# PDFDesk

A local-first workspace for reading research papers. It treats each PDF as something that moves through a reading lifecycle, and keeps a history of *how* you read it: sessions, pages, time, highlights and notes.

Think Zotero's library + a PDF reader + a notebook + a reading log, in one window.

> **Status:** v0.1 prototype. A single-page browser app (HTML/CSS/JS, no build step). Data lives in the browser's localStorage and IndexedDB. The plan is to move to a Tauri + React + SQLite desktop app, shipped through the same `pdfdesk` package. See [docs/roadmap.md](docs/roadmap.md).

## Install

Requires Python 3.9+. No other dependencies.

```bash
pip install pdfdesk          # or a local wheel: pip install dist/pdfdesk-0.1.0-py3-none-any.whl
pdfdesk                      # starts PDFDesk and opens http://localhost:5173
pdfdesk --no-browser         # just start the server
pdfdesk --help
```

Your library is stored in the browser you open it in, for the address `localhost:5173`. Use the same browser and the default port, or it will look empty. Uninstalling the package does not delete your library.

## Develop

Requires Node 18+ (or use `python -m pdfdesk` from the repo root).

```bash
npm run dev          # serves prototype/ at http://localhost:5173
npm run check        # syntax-check prototype/app.js
```

No `npm install` needed. There are no dependencies. PDF.js and the fonts are vendored in `prototype/vendor/`, so it works offline.

Build the Python package with `python -m build` (outputs to `dist/`).

Alternative without Node: `cd prototype && python -m http.server 5173`.

## What works today

| Area | Features |
|---|---|
| Library | Import PDFs (button or drag-drop), title/author from PDF metadata, search, tags, status filters |
| Lifecycle | Inbox → Planned → Reading → Paused → Completed → Revisit. Opening a paper moves it to Reading. Reaching the last page prompts for Completed or Revisit |
| Reader | PDF.js rendering with a text layer, lazy page rendering, zoom, page jump, bookmarks, resume at last page, `j`/`k` or arrow keys to change page, `b` to bookmark |
| Highlights | Select text → 4 colours with meanings (yellow key idea, green method/result, blue definition, pink question). Optional comment per highlight. Click to jump back |
| Notes | Per-paper Markdown notes. `p. 12` becomes a link to that page. "Insert highlights" pulls highlights into notes with page refs. "Cite p. N" inserts the current page |
| Sessions | Active reading time (pauses after 3 min idle or when the tab is hidden), page range covered, optional takeaway note. Auto-logged when you leave a paper |
| Overview | Stats, continue-reading list, 17-week reading heatmap with streak, up-next queue with target dates, daily revision queue of past highlights, reading log |

Example papers are seeded on first run so the UI is not empty. Remove them from the sidebar ("Remove examples").

## Repo layout

```
prototype/
  index.html      page shell
  vendor/         PDF.js 3.11.174 and fonts, with licences
  styles.css      design tokens (light/dark) + all styles
  app.js          the whole app: state, storage, views, reader, sessions
scripts/
  serve.mjs       zero-dependency static server (Node, for development)
pdfdesk/
  cli.py          the `pdfdesk` command: stdlib server + open browser
pyproject.toml    package metadata; the wheel bundles prototype/ as pdfdesk/static/
docs/
  vision.md       what we're building and why
  architecture.md how the prototype works + the target desktop architecture
  data-model.md   current JSON shape + proposed SQLite schema
  roadmap.md      phased plan
  decisions.md    decision log (ADR-style)
CLAUDE.md         working context for AI coding assistants
reference/        how v0.1 was made: original idea notes, design skill, single-file build
```

## Where data is stored (prototype)

- `localStorage["researchdesk.v1"]` holds papers, notes, highlights, sessions and UI state as one JSON blob.
- IndexedDB database `researchdesk`, store `files`, holds the PDF blobs keyed by paper id.

The keys keep the project's old name (ResearchDesk) so existing libraries aren't lost.

Clearing site data for `localhost:5173` wipes everything. There is no export yet; it's on the roadmap.

## License

Not chosen yet. Bundled third-party code keeps its own licence: PDF.js (Apache-2.0, `prototype/vendor/pdfjs/LICENSE`), fonts (SIL OFL 1.1, `prototype/vendor/fonts/OFL-*.txt`).
