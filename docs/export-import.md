# Export and import (spec)

Status: **built** (in `app.js`, section `export / import`; not yet in a PyPI release). Must ship in a 0.x release before 1.x (see decisions.md D-008). How it's put together: [architecture.md § Export and import](architecture.md#export-and-import).

## Why

Today the whole library lives inside one browser (see [architecture.md § Where your data lives](architecture.md#where-your-data-lives)). That means:

- there is no backup: clearing site data deletes highlights, notes and history;
- a library can't move to another browser, another computer, or another port;
- 0.x users would have no way to carry their library into the 1.x desktop app.

Export and import fix all three with one file.

## What the user sees

**Export library** (sidebar footer, and the *Your data* section of the About page):

1. One click. The browser downloads `pdfdesk-export-2026-11-03.zip`.
2. A toast confirms: "Exported 42 papers, 38 PDFs, 512 highlights, 230 sessions".
3. A second option, **Export without PDFs** (About page), downloads `pdfdesk-backup-2026-11-03.json`: everything except the PDF copies, a few hundred KB, for frequent backups.
4. The About page shows the date of the last export.

**Import library** (same places):

1. Pick a `.zip` (or the `.json` from an export without PDFs), or drop it on the window.
2. PDFDesk reads it and shows a summary before changing anything:
   "42 papers (39 new, 3 already in your library), 38 PDFs, 512 highlights, 230 sessions."
3. Choose:
   - **Add to my library** (default): merges, never deletes anything (rules below).
   - **Replace my library**: wipes the current library first. It asks once more and offers to export the current library before replacing it.
4. A toast reports what happened: "Added 39 papers, updated 3".

Nothing is uploaded anywhere. The file is created and read entirely in the browser.

## The export file

A plain `.zip` (stored, not compressed: PDFs are already compressed):

```
pdfdesk-export-2026-11-03.zip
├─ library.json            everything except the PDFs (format below)
├─ pdfs/
│   └─ <paper-id>.pdf      the stored copy of each PDF
├─ notes/
│   └─ <title-slug>.md     one readable Markdown file per paper: notes + highlights with pages
└─ README.txt              what this file is and how to import it
```

`notes/` is for people, not for import: the library is readable with any text editor even without PDFDesk.

### `library.json`

```jsonc
{
  "format": "pdfdesk-export",
  "formatVersion": 1,
  "appVersion": "0.2.0",
  "exportedAt": "2026-11-03T18:30:00Z",
  "includesPdfs": true,
  "papers": [ /* paper objects exactly as in data-model.md, including id,
                 highlights, sessions, bookmarks, target, notes */ ]
}
```

- Example papers (`sample: true`) are left out.
- UI state (current view, zoom, filters) is left out: it belongs to the browser, not the library.
- `formatVersion` changes only when the shape changes incompatibly. Importers accept every version up to their own and refuse newer ones with a clear message ("This file was made by a newer PDFDesk. Upgrade with `pip install -U pdfdesk`.").

## Merge rules ("Add to my library")

Papers are matched by `id` (ids are kept across export and import).

| Case | Result |
|---|---|
| Paper not in library | Added, with its PDF |
| Paper already in library | Kept and merged: |
| · highlights, sessions | Union by `id`; nothing is dropped |
| · bookmarks, tags | Union |
| · notes | Kept if identical. If different, the imported notes are appended under a divider: `--- Imported 2026-11-03 ---` |
| · status, last page, target | Taken from whichever copy was opened more recently (`lastOpened`) |
| · PDF | Kept if the library already has one; otherwise taken from the file |

The rule throughout: **import never deletes or overwrites anything the user wrote.** Only "Replace my library" removes data, and only after confirmation.

## Edge cases

- **Storage full:** the browser may refuse very large libraries. Import stops, reports which papers were added, and suggests importing without PDFs.
- **Damaged or unrelated file:** refused before anything changes, with a message naming the problem.
- **Zips from other tools:** stored and deflate entries both import (deflate uses the browser's `DecompressionStream`). ZIP64 files (over 4 GB) are refused.
- **Library on another port** (e.g. you ran `pdfdesk --port 8080` once): open that address, export there, import on `localhost:5173`.

## How it will be built

- No new dependencies and no build step (CLAUDE.md). A small store-only zip writer and reader (CRC-32, about 80 lines) goes in `app.js` under a new `/* ---------- export / import ---------- */` section.
- Downloads use a `Blob` and an `<a download>` link; import uses a hidden file input, like PDF import.
- PDFs are read from and written to the existing `idb` helper; papers go through `S` and `save()`.

## Used by 1.x

The 1.x desktop app imports the same file on first run: `library.json` into SQLite, `pdfs/` into its library folder. This is the upgrade path from 0.x.

## Later

- Reminder when the last export is more than 30 days old.
- Optional automatic backup to a folder (needs the desktop app or the File System Access API).
