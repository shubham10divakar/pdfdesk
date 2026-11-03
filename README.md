# ResearchDesk

A local-first workspace for reading research papers. It treats each PDF as something that moves through a reading lifecycle, and keeps a history of *how* you read it: sessions, pages, time, highlights and notes.

Think Zotero's library + a PDF reader + a notebook + a reading log, in one window.

> **Status:** v0.1 prototype. A single-page browser app (HTML/CSS/JS, no build step). Data lives in the browser's localStorage and IndexedDB. The plan is to move to a Tauri + React + SQLite desktop app. See [docs/roadmap.md](docs/roadmap.md).

## Run it

Requires Node 18+.

```bash
npm run dev          # serves prototype/ at http://localhost:5173
npm run check        # syntax-check prototype/app.js
```

No `npm install` needed. There are no dependencies. PDF.js and fonts load from CDNs, so you need to be online.

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
  styles.css      design tokens (light/dark) + all styles
  app.js          the whole app: state, storage, views, reader, sessions
scripts/
  serve.mjs       zero-dependency static server
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

Clearing site data for `localhost:5173` wipes everything. There is no export yet; it's on the roadmap.

## License

Not chosen yet.
