# Changelog

All notable changes to PDFDesk. Versions follow [semantic versioning](https://semver.org/); dates are release dates.

## 1.1.0 (2026-11-04)

- **Add a paper by link, without the PDF.** For papers you find on Google Scholar or a publisher's site but can't get the PDF of: *Add by link* keeps the link, title, authors, venue, year, abstract, tags and your first notes. Paste the BibTeX from Scholar (*Cite → BibTeX*) and the details fill themselves in; an arXiv link or a DOI can be filled in from arXiv or Crossref (under `pdfdesk`, and arXiv brings the PDF). Opening the paper shows its details and abstract with **Open paper ↗** and **Attach PDF**; notes work as usual, and no reading session is recorded. A **No PDF yet** list in the sidebar collects them. Attach the PDF when you find it and it becomes a normal paper, with notes and tags kept.
- **Tags suggest themselves.** Click into a tag box and your existing tags are listed, most used first; type a few letters to narrow them, then Enter, comma or a click adds one. A tag you don't have yet is offered as *New tag*. Backspace in the empty box removes the last tag. Works in Details and in Add by link.
- **Abstract field** for every paper, in Details. The library search looks in abstracts too, and the Markdown notes in an export include the abstract and the paper's link.

## 1.0.0 (2026-11-03)

First stable release. Everything since 0.2.2:

- **Add a paper by arXiv ID or DOI.** Paste `1706.03762`, an arXiv link, a DOI or a doi.org link: title, authors, year and venue are filled in, and arXiv papers come with their PDF. A paper you already have opens instead of being added twice. Needs PDFDesk started with the `pdfdesk` command.
- **Highlights survive a new version of the PDF.** Replace a paper's PDF (say, a newer arXiv version) and every highlight is found again by its text, even if it moved to another page or was slightly reworded. Highlights that can't be found are kept with their comments and marked "Not found in this PDF". New highlights also remember the text around them, so a phrase that appears twice lands on the right one.
- **Search your notes and highlights.** The sidebar search now also looks inside highlights and their comments, every line of your notes, and session takeaways. Results are grouped by paper with the words marked; clicking one opens the right page, highlight or note line. Word order, case and accents don't matter.
- **Fix or delete a session.** Each session in the Sessions tab has Edit (pages, minutes, takeaway) and Delete (asks first). The overview's stats and calendar follow.
- **Contents tab.** For PDFs with an outline, a Contents tab lists the sections with their pages. Click one to jump there (Back returns), and the section you're reading is marked as you scroll.
- **Back after following a link.** Read the reference, then press **Back to p. N** in the toolbar, `Alt+←`, or your mouse's back button to return to exactly where you were. Following several links and going back retraces them in order.
- **Links in the PDF work.** Citations like `[12]`, "Section 3", "Figure 2" and contents pages jump to the exact spot they point to; web links (DOIs, arXiv, GitHub) open in a new tab, with the address shown on hover. Only safe web addresses (http, https, mailto) are followed.
- **Click a highlight on the page to find it in the panel.** The pointer turns into a hand over highlights; a click opens the Highlights tab (showing the panel if you'd hidden it), scrolls to that highlight and flashes it, ready for a comment. Dragging to select text works as before.
- **Page links in notes find the exact highlight.** When a line in your notes quotes something you highlighted (as *Insert highlights* writes it), clicking its `p. N` jumps to that highlight and flashes it, instead of just the top of the page. Those links are underlined in the highlight's colour.
- **Click a highlight in the panel to see it on the page.** The whole highlight is a link now, not just the small page number: it jumps to the page and flashes the highlight.
- **Collapsible sidebar and notes panel.** Hide either one with the buttons at the ends of the reader toolbar (or next to the PDFDesk name), or press `[` and `]`. Pages re-fit to the new width and keep your place, so wide pages and slides get the whole window. The choice is remembered.

## 0.2.2 (2026-11-03)

- **Fix:** when zoomed in, the left side of a page couldn't be scrolled to. Wide pages now scroll to both edges, and pages that fit stay centred.
- The "PDF missing" message now names the file in your library folder instead of talking about the browser.
- When the port is busy, `pdfdesk` no longer claims the running server uses the same library folder.

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
