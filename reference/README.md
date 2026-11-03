# Reference: how the prototype was made

Everything Claude used or produced while building ResearchDesk v0.1 (2026-11-03), kept so later work can trace back to it. Nothing in this folder is loaded by the app.

| Path | What it is |
|---|---|
| `source/original-idea-notes.txt` | The notes the project started from: the "PDF Research Workspace / Research Paper IDE" idea, three-panel layout, reading lifecycle, competitor list (Zotero, LiquidText, Readwise Reader, Paperpile), feature ideas and suggested stack |
| `skills/artifact-design/SKILL.md` | The design guidance Claude loaded before writing the page (tokens, theming, layout, copy rules). Transcribed from the session; see the note at the top of the file |
| `published/researchdesk-single-file.html` | The single-file version published as a claude.ai artifact. `prototype/` is the same code split into `index.html`, `styles.css` and `app.js` |

## How the prototype was built

1. Read the idea notes and picked the parts that set it apart from existing tools: reading lifecycle, sessions, reading calendar, revision queue.
2. Loaded the `artifact-design` skill and settled a design plan: a cool blue-grey palette with one ink-blue accent, one colour per lifecycle status, four highlight colours with fixed meanings; Source Serif 4 for titles, notes and paper text, IBM Plex Sans for UI, IBM Plex Mono for page numbers and figures.
3. Wrote the page as one HTML file using PDF.js 3.11.174 from cdnjs for rendering and text selection, localStorage for state and IndexedDB for PDF files. Seeded ten example papers (marked as examples) so the first view isn't empty.
4. Syntax-checked the script with `node --check`, published it as an artifact.
5. Split the file into `prototype/`, added `scripts/serve.mjs`, the README, `CLAUDE.md` and `docs/`.

## Other skills available but not used
`frontend-design` (general UI design guidance) was available in the session but not loaded; `artifact-design` covered the same ground.
