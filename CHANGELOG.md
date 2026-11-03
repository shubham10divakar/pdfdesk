# Changelog

All notable changes to PDFDesk. Versions follow [semantic versioning](https://semver.org/); dates are release dates.

## Unreleased

- **Fix:** when zoomed in, the left side of a page couldn't be scrolled to. Wide pages now scroll to both edges, and pages that fit stay centred.
- The "PDF missing" message now names the file in your library folder instead of talking about the browser.

## 0.2.1 (2026-11-03)

First PyPI release since 0.1.0; it includes everything from 0.1.1 and 0.2.0 below.

- **Open your library folder from the app.** Click the folder path in the sidebar or on the About page and it opens in File Explorer (Finder on macOS). If that isn't possible, the path is copied for you.

## 0.2.0 (2026-11-03, not published on PyPI)

### Your library is now a folder on your computer
Under the `pdfdesk` command the library lives in `PDFDesk` in your home folder: `library.json`, your PDFs as normal files in `pdfs/`, and a daily backup in `backups/` (last 14 kept).
- The same library on any port and in any browser on your computer. `pdfdesk --port 8080` no longer starts empty.
- Clearing browser data deletes nothing.
- Coming from 0.1: your library moves into the folder automatically on first run. Papers from other ports are offered too.
- Two windows at once: edits from both are merged, and notes written in both are kept.
- If PDFDesk stops while the page is open, the page says so and saves as soon as it's back.
- `pdfdesk --data-dir <folder>` (or `PDFDESK_DATA`) keeps the library somewhere else.

### Export and import
- **Export library**: one `.zip` with your PDFs, highlights, comments, notes, sessions and bookmarks, plus a readable Markdown file per paper.
- **Export without PDFs**: a small `.json` backup.
- **Import library**: shows what's in the file first, then adds it without deleting anything, or replaces your library after asking. Drop an export on the window to import it.

### Fixes
- Imported sessions are listed newest first.

## 0.1.1 (2026-11-03, not published on PyPI)

- **About page**: who built PDFDesk and why, every feature, keyboard shortcuts, and links to reach the author. "Report a bug or idea" opens a GitHub issue.
- Credit line in the sidebar and in the `pdfdesk` startup message.
- Fixes: highlight colour filter dots were invisible; the reader scrolled sideways at 100% zoom; the PDF.js worker no longer points at a CDN.

## 0.1.0 (2026-11-03)

First release.
- Library with a reading lifecycle (Inbox, Planned, Reading, Paused, Completed, Revisit), import by button or drag and drop, search, tags, target dates.
- PDF reader with zoom, page jump, bookmarks and resume; `j`/`k` and `b` shortcuts.
- Colour-coded highlights with comments; Markdown notes where `p. 12` links to the page.
- Reading sessions that count active time only; overview with weekly stats, a 17-week reading calendar, up next and a daily revision queue.
- Dark mode; PDF.js and fonts bundled, so it works offline. No Python dependencies.
