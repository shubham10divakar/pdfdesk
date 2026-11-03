# PDFDesk: developer guide

This is the working README for the code. The product page is [README.md](README.md), which is also the PyPI description, so keep it user-facing and use absolute image URLs there (`raw.githubusercontent.com/.../main/docs/assets/...`) or the images break on PyPI.

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
npm run dev          # PDFDesk at http://localhost:5173, library in ~/PDFDesk-test (C:\Users\Subham\PDFDesk-test)
npm run dev:static   # prototype/ on a plain static server: browser storage, no library folder
npm run check        # syntax-check prototype/app.js
npm test             # server + store unit tests
```

Development always uses `~/PDFDesk-test` as the library folder, so test data never mixes with the real `~/PDFDesk`. Click the folder path in the sidebar or on the About page to open it in File Explorer.

No `npm install` needed. There are no dependencies. PDF.js and the fonts are vendored in `prototype/vendor/`, so it works offline.

Build the Python package with `python -m build` (outputs to `dist/`).

## Release

1. Bump `__version__` in `pdfdesk/__init__.py` and `VERSION` near the top of `prototype/app.js` (shown on the About page).
2. `python -m build` and test the wheel in a clean venv: `pip install dist/pdfdesk-<v>-py3-none-any.whl && pdfdesk`.
3. `twine check dist/*` (renders the README the way PyPI will), then `twine upload dist/*`.
4. Add the version to `CHANGELOG.md`, then tag the commit: `git tag -a v<v> -m "PDFDesk <v>" && git push origin v<v>`.

The download badges in README.md (pepy.tech, shields.io) show "not found" until the first PyPI upload, then fill in within about a day.

## Tests

```bash
python -m unittest discover -s tests     # library folder + HTTP API (no browser needed)
npm run check                            # syntax of app.js
```

`scripts/e2e/disk-storage.mjs` checks the library on disk end to end (20 checks): it starts two `pdfdesk` processes sharing one folder plus the static server, and drives four isolated headless-Chrome profiles through first run, PDFs on disk, another port, two windows editing at once (including a real notes clash), the server stopping, and moving 0.1.x browser libraries in.

```bash
chrome --headless=new --remote-debugging-port=9337 --user-data-dir=<temp dir> about:blank
node scripts/e2e/disk-storage.mjs 9337 <abs path>/sample-paper.pdf <abs empty work dir>   # from the repo root
```

## End-to-end test: export / import

Runs against the static server (browser mode), since each profile needs its own library. `scripts/e2e/export-import.mjs` drives headless Chrome over the DevTools protocol (Node 22+, no npm packages). It builds a library in one isolated browser profile, exports it, then imports into fresh profiles and checks 18 things: the dialog summary, PDFs rendering after import, no duplicates on re-import, notes merged once, replace, a deflate-compressed zip from another tool, and a bad file being refused.

```bash
node scripts/serve.mjs 5193
chrome --headless=new --remote-debugging-port=9336 --user-data-dir=<temp dir> about:blank
# <work> needs: bad.json (any JSON that isn't an export); deflated.zip is optional (re-zip an export with ZIP_DEFLATED)
node scripts/e2e/export-import.mjs 9336 http://localhost:5193/ <abs path>/sample-paper.pdf <abs work dir>
```

## Screenshots

The images in `docs/assets/` come from `scripts/screenshots/`. It drives headless Chrome over the DevTools protocol, needs no npm packages (Node 22+), and uses `sample-paper.html`, an original sample document, so no third-party PDF is shown.

```bash
# 1. print the sample paper to PDF
chrome --headless --no-pdf-header-footer --print-to-pdf=sample-paper.pdf scripts/screenshots/sample-paper.html
# 2. start the app and a debuggable headless Chrome
python -m pdfdesk --no-browser --port 5190
chrome --headless=new --hide-scrollbars --remote-debugging-port=9333 --user-data-dir=<temp dir> about:blank
# 3. capture (absolute path to the PDF)
node scripts/screenshots/shoot.mjs 9333 http://localhost:5190/ <abs path>/sample-paper.pdf docs/assets
```

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
| Library on disk | Under `pdfdesk`, a folder with library.json, real PDFs and daily backups; any port or browser shows the same library; two windows merge without losing edits; 0.1.x browser libraries move in |
| Export / import | One `.zip` with library.json, PDFs and Markdown notes; small `.json` backup without PDFs; import previews, then merges (never deletes) or replaces after a second confirmation; drop an export to import |
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
  screenshots/    regenerate docs/assets/ (headless Chrome, see Screenshots)
pdfdesk/
  cli.py          the `pdfdesk` command: stdlib server, /api/ for the library, open browser
  store.py        the library folder: library.json, pdfs/, backups (atomic writes, rev checks)
tests/            unittest suite for the server and store
pyproject.toml    package metadata; the wheel bundles prototype/ as pdfdesk/static/
docs/
  assets/         screenshots used by README.md
  vision.md       what we're building and why
  architecture.md how the prototype works + the target desktop architecture
  data-model.md   current JSON shape + proposed SQLite schema
  roadmap.md      phased plan
  decisions.md    decision log (ADR-style)
README.md         product page (also the PyPI description)
DEVELOPMENT.md    this file
CHANGELOG.md      every version's changes
LICENSE           MIT
CLAUDE.md         working context for AI coding assistants
reference/        how v0.1 was made: original idea notes, design skill, single-file build
```

## Where data is stored

- **Under `pdfdesk`:** the library folder (`~/PDFDesk`, or `--data-dir`, or `$PDFDESK_DATA`): `library.json`, `pdfs/<id>.pdf`, `backups/`. UI state stays in the browser (`localStorage["pdfdesk.ui.v1"]`).
- **On a static server (`npm run dev`):** browser storage, as in 0.1.x: `localStorage["researchdesk.v1"]` plus IndexedDB `researchdesk`/`files`. The keys keep the old ResearchDesk name so 0.1.x libraries are found and moved in.

Full details, including the API, merging and security: [docs/architecture.md § Where your data lives](docs/architecture.md#where-your-data-lives) and [docs/disk-storage.md](docs/disk-storage.md). Export/import: [docs/export-import.md](docs/export-import.md).

## License

MIT, see [LICENSE](LICENSE). Bundled third-party code keeps its own licence: PDF.js (Apache-2.0, `prototype/vendor/pdfjs/LICENSE`), fonts (SIL OFL 1.1, `prototype/vendor/fonts/OFL-*.txt`).
