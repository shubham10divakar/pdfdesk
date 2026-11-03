# Data model

## Prototype JSON (`localStorage["researchdesk.v1"]`)

```jsonc
{
  "papers": [{
    "id": "k3j2h1ab",
    "sample": false,            // true for seeded example papers
    "hasFile": true,            // PDF blob present in IndexedDB under the same id
    "title": "…", "authors": "…", "year": 2017, "venue": "NeurIPS",
    "pages": 15,
    "status": "reading",        // inbox|planned|reading|paused|completed|revisit
    "tags": ["transformers"],
    "notes": "markdown…",
    "highlights": [{
      "id": "…", "page": 4, "color": "yellow",   // yellow|green|blue|pink
      "text": "selected text",
      "rects": [{"x":0.1,"y":0.2,"w":0.5,"h":0.015}],  // page-relative, null if unknown
      "comment": "", "at": 1762170000000
    }],
    "sessions": [{
      "id": "…", "date": 1762170000000,          // session start (ms)
      "from": 9, "to": 12, "minutes": 35, "note": "…"
    }],
    "bookmarks": [5],
    "target": {"page": 13, "date": "2026-11-04"}, // or null
    "addedAt": 0, "lastOpened": 0, "lastPage": 12, "maxPage": 12
  }],
  "ui": {"view":"home","filter":"all","tab":"notes","nmode":"preview","hlFilter":"all","zoom":1,"q":""}
}
```

## Proposed SQLite schema (desktop)

```sql
CREATE TABLE paper (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  authors       TEXT,             -- display string; normalise later if needed
  year          INTEGER,
  venue         TEXT,
  doi           TEXT,
  arxiv_id      TEXT,
  file_path     TEXT,             -- relative to library root
  file_hash     TEXT,             -- sha256, detects replaced PDFs
  page_count    INTEGER,
  status        TEXT NOT NULL DEFAULT 'inbox'
                CHECK (status IN ('inbox','planned','reading','paused','completed','revisit')),
  last_page     INTEGER DEFAULT 1,
  max_page      INTEGER DEFAULT 0,
  added_at      INTEGER NOT NULL,
  last_opened   INTEGER
);

CREATE TABLE status_change (     -- lifecycle history
  id INTEGER PRIMARY KEY, paper_id TEXT REFERENCES paper(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL, at INTEGER NOT NULL
);

CREATE TABLE tag (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE paper_tag (paper_id TEXT REFERENCES paper(id) ON DELETE CASCADE,
                        tag_id INTEGER REFERENCES tag(id) ON DELETE CASCADE,
                        PRIMARY KEY (paper_id, tag_id));

CREATE TABLE note (               -- one main note per paper for now
  paper_id TEXT PRIMARY KEY REFERENCES paper(id) ON DELETE CASCADE,
  body_md  TEXT NOT NULL DEFAULT '', updated_at INTEGER
);

CREATE TABLE highlight (
  id          TEXT PRIMARY KEY,
  paper_id    TEXT REFERENCES paper(id) ON DELETE CASCADE,
  page        INTEGER NOT NULL,
  color       TEXT NOT NULL,
  text        TEXT NOT NULL,
  prefix      TEXT,               -- ~32 chars before, for re-anchoring
  suffix      TEXT,               -- ~32 chars after
  rects_json  TEXT,               -- page-relative rects
  file_hash   TEXT,               -- PDF version the rects belong to
  comment     TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE session (
  id         TEXT PRIMARY KEY,
  paper_id   TEXT REFERENCES paper(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  ended_at   INTEGER,
  page_from  INTEGER, page_to INTEGER,
  active_sec INTEGER NOT NULL,
  note       TEXT
);

CREATE TABLE bookmark (paper_id TEXT REFERENCES paper(id) ON DELETE CASCADE, page INTEGER,
                       label TEXT, PRIMARY KEY (paper_id, page));

CREATE TABLE target (paper_id TEXT PRIMARY KEY REFERENCES paper(id) ON DELETE CASCADE,
                     page INTEGER, due_date TEXT);

CREATE TABLE paper_link (         -- research connections between papers
  from_id TEXT REFERENCES paper(id) ON DELETE CASCADE,
  to_id   TEXT REFERENCES paper(id) ON DELETE CASCADE,
  kind    TEXT,                   -- builds-on | compares | same-method | contradicts …
  note    TEXT,
  PRIMARY KEY (from_id, to_id, kind)
);

CREATE VIRTUAL TABLE search USING fts5(paper_id UNINDEXED, kind, page UNINDEXED, body);
-- rows for: extracted page text, highlights, notes
```

Reading-calendar queries come straight from `session` (`GROUP BY date(started_at/1000,'unixepoch','localtime')`).
