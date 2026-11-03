# Architecture

## 1. Prototype (today)

```
index.html ─┬─ styles.css      tokens + layout
            ├─ pdf.js (vendor) rendering + text layer
            └─ app.js
                 ├─ S (state)  ──save()──▶ disk: PUT /api/library  |  browser: localStorage "researchdesk.v1"
                 ├─ idb        ──────────▶ disk: /api/pdf/<id>        |  browser: IndexedDB "researchdesk"/files
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

There are two storage backends behind one interface (`save()` and the `idb` helper). `boot()` picks one at startup. Spec: [disk-storage.md](disk-storage.md), decision D-010.

**Under `pdfdesk` (0.2+): a folder on disk.** `boot()` finds the server's `/api/info`, switches `idb` to the disk implementation and loads `/api/library`.

```
~/PDFDesk/                       (or --data-dir / $PDFDESK_DATA; printed at startup, shown on About)
├─ library.json                  {"format":"pdfdesk-library","formatVersion":1,"savedAt":…,"papers":[…]}
├─ pdfs/<paper-id>.pdf           real PDF files
└─ backups/library-YYYY-MM-DD.json   first save of each day; last 14 kept
```

```
app.js                                  pdfdesk/cli.py (Handler)        pdfdesk/store.py (Store)
save() ─ 300 ms ─▶ pushDisk() ─ PUT /api/library {baseRev, papers} ─▶ write(): rev check, backup, atomic replace
  409 {rev, papers} ◀─ another window/port saved first ◀────────────── Conflict
  └▶ merge3(base, theirs, mine) and save again
idb.put/get/del ────────────── PUT/GET/DELETE /api/pdf/<id> ───────▶ write_pdf / read_pdf / delete_pdf
focus or visible ─▶ syncFromDisk() ─ GET /api/info (rev changed?) ─ GET /api/library
```

- **Same library everywhere on the machine.** Any port, `127.0.0.1` or `localhost`, any browser. Clearing browser data deletes nothing. Importing a PDF still copies it (into `pdfs/`); the original is never touched.
- **`rev`** is `library.json`'s mtime and size, so two `pdfdesk` processes sharing a folder see each other's writes.
- **`merge3`** merges against `DISK.base`, the last version this window read or wrote: a change made on only one side wins, removals are honoured unless the other side changed that item, and notes edited in both windows are kept one after the other under "Also written in another window". Nothing either window wrote is lost.
- **UI state** (view, zoom, filters) stays in each browser's localStorage under `pdfdesk.ui.v1`.
- **Server stopped while a page is open:** `#netbar` says so, and `pushDisk` retries every 4 s until it gets through.
- **Moving 0.1.x libraries in:** with an empty folder, the browser's library (localStorage + IndexedDB at that origin) is moved in on first run, PDFs included, and the browser copy is left as it was. When the folder already has a library and the browser has papers it lacks, `#leftbar` offers to add them (remembered per browser under `pdfdesk.browserChecked`).
- **Security:** the server binds to 127.0.0.1, refuses any `Host` other than `localhost:<port>`/`127.0.0.1:<port>` (DNS rebinding) and any foreign `Origin`, never answers CORS preflights, and only accepts ids matching `[A-Za-z0-9_-]{1,64}`.

**On a plain static server** (`npm run dev`, `python -m http.server`, `file://`): browser storage, as in 0.1.x. Importing a PDF copies it into IndexedDB (database `researchdesk`, store `files`, keyed by paper id), and everything else is one JSON blob in localStorage under `researchdesk.v1`. That storage is per browser and per origin (`localhost:5173` and `localhost:8080` are separate libraries), clearing site data deletes it, and on disk it sits inside the browser profile, e.g. `%LOCALAPPDATA%\Google\Chrome\User Data\Default\IndexedDB\http_localhost_5173.indexeddb.*`. The storage keys keep the old ResearchDesk name (D-007).

**Export / import** (below) works the same in both modes and is how a library moves to another computer.

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
- The whole paper list is saved as one JSON document on every change (disk) or one localStorage blob (browser, ~5 MB limit). Fine for hundreds of papers, not tens of thousands.
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
