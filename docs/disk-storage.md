# Library on disk (spec, 0.2.0)

Status: **built** for 0.2.0. Decision: decisions.md D-010. How it fits together: [architecture.md § Where your data lives](architecture.md#where-your-data-lives).

## Problem

Up to 0.1.x the live library is browser storage (see [architecture.md § Where your data lives](architecture.md#where-your-data-lives)). Storage is per browser and per origin, so `pdfdesk --port 8080`, `127.0.0.1:5173`, or a different browser each show an empty library. Clearing site data deletes it. Export/import only copies it by hand.

## Goal

When PDFDesk runs under the `pdfdesk` command, the library is a normal folder on disk. Any port and any browser on the machine show the same library, and clearing browser data deletes nothing.

## The folder

Default `~/PDFDesk` (on Windows `C:\Users\<you>\PDFDesk`). Change it with `pdfdesk --data-dir <path>` or the `PDFDESK_DATA` environment variable. `pdfdesk` prints the path on startup and the About page shows it.

```
~/PDFDesk/
├─ library.json              every paper: status, tags, highlights, notes, sessions, bookmarks
├─ pdfs/<paper-id>.pdf       real PDF files, one per paper
└─ backups/library-YYYY-MM-DD.json   copy of library.json taken on the first save of each day; last 14 kept
```

`library.json` uses the export format's paper objects (data-model.md) with a header:
`{"format":"pdfdesk-library","formatVersion":1,"savedAt":"…","papers":[…]}`. UI state (current view, zoom, filters) stays in each browser's localStorage; it isn't library data.

## Server API (`pdfdesk/cli.py`, standard library only)

| Method and path | Does |
|---|---|
| `GET /api/info` | `{app, version, dataDir, rev}` |
| `GET /api/library` | `{rev, papers}`; `papers` is `null` when the folder has no library yet |
| `PUT /api/library` | body `{baseRev, papers}`. Saves if `baseRev` matches the current `rev`, else `409` with the current `{rev, papers}` |
| `GET /api/pdf/<id>` | the PDF bytes, `404` if missing |
| `PUT /api/pdf/<id>` | body is the PDF; saved atomically |
| `DELETE /api/pdf/<id>` | removes it |

- **`rev`** is the file's modification time and size (`<mtime_ns>-<size>`), so two `pdfdesk` processes on different ports sharing one folder still see each other's changes.
- **Atomic writes:** write to a temp file in the same folder, then `os.replace`. A crash never leaves a half-written `library.json`.
- **Ids** must match `[A-Za-z0-9_-]{1,64}`; nothing outside the folder can be read or written.
- **Security:** the server binds to 127.0.0.1 only. Every request must carry `Host: localhost:<port>` or `127.0.0.1:<port>`, which blocks DNS-rebinding pages, and requests with a foreign `Origin` are refused. Writes use `PUT`/`DELETE`, which a web page on another site can't send without a CORS preflight, and the server never answers preflights.

## App behaviour (`app.js`)

- **Storage mode** is chosen at startup: if `GET api/info` answers, the app uses the disk; otherwise (`npm run dev`, any static server, `file://`) it keeps using browser storage exactly as before. `prototype/` stays openable from a static server.
- **The storage layer is swapped, not the app.** `save()` and the `idb` helper (`put`, `putStrict`, `get`, `del`) get a disk implementation; everything above them, including export/import, is unchanged.
- **Saving:** papers are sent at most every 300 ms and only when they changed. UI state goes to localStorage as before.
- **Another tab or port saved first** (`409`): the app does a three-way merge against the last version it saw (`merge3`): a change made on only one side wins, items removed on one side stay removed unless the other side changed them, and notes edited in both windows are kept one after the other. Then it saves again. Nothing either window wrote is lost.
- **Coming back to a window** (focus or visibility): if the library changed on disk and this window has no unsaved changes, it reloads quietly.
- **Server stopped while the app is open:** a banner says changes aren't being saved and to run `pdfdesk` again. Saving retries every few seconds and the banner clears once it succeeds.

## Moving existing browser libraries

- **First run with an empty folder:** if this browser has a library at this address (0.1.x), it's moved into the folder automatically: papers into `library.json`, PDFs from IndexedDB into `pdfs/`. A toast says where it went. The browser copy is left in place, untouched, as a fallback.
- **The folder already has a library, and this browser has papers that aren't in it** (for example a library made on another port in 0.1.x): a banner offers **Add them to my library**, which merges them like an import, or **Not now**. The choice is remembered in this browser.
- **Example papers:** a brand-new folder with no browser library starts with the examples, as today.

## Tests

`scripts/e2e/disk-storage.mjs` (headless Chrome, no npm packages):
1. Add a PDF, highlight and note on port A: `library.json` and `pdfs/<id>.pdf` appear on disk, and the PDF is byte-identical.
2. A second `pdfdesk` on port B with the same folder, in a fresh browser profile: same library, and the PDF renders.
3. Two windows edit different papers at the same time: both edits are on disk.
4. Migration: a 0.1.x browser library on an origin moves into an empty folder on first run.
5. The server stopping while a page is open shows a warning, and saving resumes when it's back.
6. A browser library on another port is offered to an existing folder and merged on request.

The API itself (conflicts, atomic writes, ids, Host/Origin checks, two processes on one folder) is covered by `tests/test_server.py`. The export/import e2e test keeps running against the static server (browser mode).
