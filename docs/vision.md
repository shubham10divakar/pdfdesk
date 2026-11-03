# Vision

## Problem
Research reading is spread across tools. PDFs sit in folders or Zotero. Highlights are trapped inside each reader. Notes live in Word, Notion or Markdown files. Nothing records *when* you read something, how far you got, or what you took away. Weeks later you know you "read" a paper but can't find what you learned from it.

## Idea
A research IDE for papers. Each PDF is a unit of knowledge that moves through a lifecycle, and the app keeps the history of that movement.

| Status | Meaning |
|---|---|
| Inbox | Imported, not evaluated |
| Planned | Intend to read, optionally with a target page and date |
| Reading | Currently reading |
| Paused | Started, set aside |
| Completed | Finished |
| Revisit | Worth reading again |

## What makes it different
Existing tools (Zotero, LiquidText, Readwise Reader, Paperpile) do library management and annotation well. None of them put **reading history** at the centre:

1. **Sessions**: date, page range, active minutes, one-line takeaway.
2. **Reading calendar**: what you read each day, streaks, time per paper.
3. **Resume**: reopen exactly where you stopped, with your last takeaway in view.
4. **Revision queue**: highlights from finished papers resurface on a schedule.
5. **Grounded AI notes** (later): summaries built from *your* highlights and session notes, every claim linked to a page.

## Principles
- **Local-first.** PDFs, notes and history stay on the user's machine. Sync is optional and later.
- **Notes are first-class.** The notebook beside the paper can grow longer than the paper.
- **Every note can point at a page**, and every highlight can be found from the notes.
- **Honest numbers.** Count active reading time, not window-open time.
- **Open formats.** Notes export as Markdown; data is plain SQLite.

## Out of scope (for now)
Team collaboration, citation formatting/Word plugins (Zotero does this), EPUB/HTML articles, mobile apps.
