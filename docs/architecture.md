# Architecture

## 1. Prototype (today)

```
index.html ─┬─ styles.css      tokens + layout
            ├─ pdf.js (vendor) rendering + text layer
            └─ app.js
                 ├─ S (state)  ──save()──▶ localStorage "researchdesk.v1"
                 ├─ idb        ──────────▶ IndexedDB "researchdesk"/files (PDF blobs)
                 ├─ views      renderSide / homeHTML / libHTML / renderPanel
                 ├─ reader     R runtime: openReader → loadDoc → buildPages → renderPage
                 ├─ sessions   1s ticker, idle detection, endSession()
                 ├─ export/import  zipBlob / zipIndex / zipRead, exportLibrary, readImport, applyImport
                 └─ events     delegated click on [data-act], input, keydown, selection
```

### Reader pipeline
1. `openReader(id)` ends any running session, sets status to Reading if needed, creates `R`, renders the reader shell.
2. `loadDoc` reads the blob from IndexedDB, opens it with PDF.js, measures page 1 to get `baseW/baseH`.
3. `buildPages` creates an empty `.page` div per page at the computed scale and observes each with an `IntersectionObserver` (900px margin).
4. `renderPage(n)` draws the canvas (DPR-aware, capped at 2×), then the text layer, then highlights. A generation counter `R.gen` discards renders that finish after a zoom or resize.
5. Scrolling updates `R.current` (page at 30% of viewport height), which updates `lastPage`, `maxPage`, the live session and the toolbar.

Example papers have no PDF; `sampleHTML()` draws page 1 as HTML (selectable) and later pages as placeholder lines.

### Highlights
On `mouseup`/`touchend`, the selection range's client rects are converted to page-relative fractions and merged per line (`mergeRects`). Picking a colour stores `{page, color, text, rects, comment}`. `drawHighlights(n)` paints them in `.hl-layer` with `mix-blend-mode: multiply`, below the transparent text layer so selection still works.

### Sessions
A 1-second ticker adds to `R.session.active` only if the tab is visible and there was input in the last 3 minutes. `endSession(note)` writes a record if at least 1 minute passed, the page range changed, or a note was given. It runs on leaving the reader, opening another paper, "Log session", and `pagehide`.

### Where your data lives

Importing a PDF **copies** it into the browser. The original file is never moved, renamed or changed.

| What | Where | Key |
|---|---|---|
| The PDF copy | IndexedDB (the browser's database for large files) | database `researchdesk`, store `files`, keyed by paper id |
| Everything else: title, authors, status, highlights, notes, sessions, bookmarks, UI state | localStorage | one JSON blob under `researchdesk.v1` (shape in data-model.md) |

Import calls `idb.put(id, file)` (`importFiles` in `app.js`); opening a paper reads the blob back with `idb.get(id)`. That is why papers are still there after a restart.

On disk this sits in the browser profile, not in a folder you can browse. For Chrome on Windows:

```
%LOCALAPPDATA%\Google\Chrome\User Data\Default\IndexedDB\http_localhost_5173.indexeddb.leveldb\
%LOCALAPPDATA%\Google\Chrome\User Data\Default\IndexedDB\http_localhost_5173.indexeddb.blob\
```

Edge uses the same layout under `Microsoft\Edge\User Data`. These are the browser's internal database files, not `.pdf` files.

What follows from this:
- **Per browser and per address.** Chrome and Edge each have their own library; `localhost:5173` and `localhost:8080` are separate libraries.
- **Clearing site data deletes the library,** PDF copies included. The originals are safe; highlights, notes and history are not.
- **Each PDF is stored twice:** the original plus the browser's copy.
- **Export to get it out.** Export/import (below) writes the whole library to one file you own. In 1.x, PDFs live in a normal library folder and everything else in a SQLite file (section 2).

### Export and import
Full spec and the reasons behind it: [export-import.md](export-import.md). Code: the `export / import` section of `app.js`.

```
Export library ─▶ exportLibrary(true)
                   papers (no examples) ─┬─▶ library.json        S.papers as JSON + format header
                   idb.get(id) per PDF ──┼─▶ pdfs/<id>.pdf      the stored copy, byte for byte
                   paperMarkdown(p) ─────┼─▶ notes/<slug>.md    notes + highlights, for people
                                         └─▶ README.txt
                   zipBlob(files) ─▶ <a download> pdfdesk-export-YYYY-MM-DD.zip
Export without PDFs ─▶ exportLibrary(false) ─▶ pdfdesk-backup-YYYY-MM-DD.json (library.json only)

Import library / drop a .zip or .json
  ─▶ readImport(file)    zipIndex reads the central directory; zipRead extracts one entry
                         (stored, or deflate via DecompressionStream). Validates format + version.
  ─▶ showImportDialog    summary: papers new / already here, PDFs, highlights, sessions
  ─▶ applyImport(replace)
        replace: idb.del every paper, S.papers = []
        per paper: PDF ─▶ idb.putStrict (stops and reports if the browser refuses)
                   new id ─▶ added;  known id ─▶ mergeInto(cur, inc)
  ─▶ save(), renderAll(), toast with counts
```

- **Zip without dependencies.** `zipBlob` writes a "stored" zip (PDFs are already compressed) with CRC-32 and UTF-8 names; about 80 lines with the reader. No ZIP64, so one export is limited to 4 GB and 65,535 files; past that the user is told to export without PDFs.
- **Merge never loses data.** Highlights and sessions are unioned by `id`, tags and bookmarks unioned, different notes appended under `--- Imported <date> ---` (once, even on repeated imports), and the reading position comes from whichever copy was opened last. Only "Replace my library" deletes, after a second confirmation that offers to export first.
- **Paper ids are kept** across export and import; that is what makes re-importing and merging safe. `cleanPaper` gives every imported paper all the fields the app reads, so a hand-edited or older file can't break rendering.
- **`idb.putStrict`** is the one storage call that reports failure. The normal `idb.put` swallows errors (fine for single PDFs), but import must know when the browser refuses a file so it can stop and say how far it got.
- **Memory:** export reads every PDF into memory once to compute its CRC. Fine for hundreds of papers; streaming is a 1.x concern.
- Tested end to end by `scripts/e2e/export-import.mjs` (headless Chrome, three isolated browser profiles).

### Known limitations
- All state in one localStorage blob (~5 MB limit); fine for hundreds of papers, not thousands.
- Highlight positions depend on the exact PDF file. Replacing a PDF drops highlight positions (text is kept).
- No full-text search inside PDFs.
- Single global `innerHTML` re-renders; acceptable at this size.

## 2. Target: desktop app

| Layer | Choice | Why |
|---|---|---|
| Shell | Tauri 2 | Small binary, Rust backend, real filesystem access |
| UI | React + TypeScript + Vite | Component reuse; owner already works in React |
| PDF | PDF.js (vendored, worker same-origin) | Same engine as the prototype |
| DB | SQLite via `tauri-plugin-sql` or rusqlite | Single file, easy backup, FTS5 |
| Search | SQLite FTS5 over notes, highlights, and extracted PDF text | No extra service |
| Notes editor | CodeMirror 6 (Markdown) | Fast, extensible for `p. N` links |
| Files | Managed library folder + optional watched folder | PDFs stay ordinary files the user owns |
| AI (later) | Pluggable: local model or API | Summaries grounded in highlights + sessions |

```
React UI ──invoke──▶ Rust commands ──▶ SQLite (library.db)
   │                       └────────▶ library/ (PDF files, content-hashed)
   └── PDF.js renders files read via Tauri fs (asset protocol)
```

### Migration from the prototype
Add export/import to the prototype (Phase 1, spec in [export-import.md](export-import.md)), then a first-run importer in the desktop app that reads the same `.zip`: `library.json` into SQLite, `pdfs/` into the library folder.

### Possible shared core with SlideNotes
SlideNotes (separate project) also links PDF positions to note sections. If both survive, factor out a small package for anchors, page references and note links, used by both.
