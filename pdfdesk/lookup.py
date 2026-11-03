"""Look up a paper by arXiv id or DOI and fetch its details (and, for arXiv, its PDF). Standard library only.

Only three hosts are ever contacted: export.arxiv.org (metadata), arxiv.org (PDFs) and api.crossref.org (DOIs).
The id is validated before it goes into a URL, so this can't be used to fetch arbitrary addresses.
"""

from __future__ import annotations

import html
import json
import re
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from pdfdesk import __version__

USER_AGENT = f"PDFDesk/{__version__} (+https://github.com/shubham10divakar/pdfdesk)"
TIMEOUT = 25
MAX_PDF = 150 << 20  # 150 MB

ARXIV_NEW = re.compile(r"(\d{4}\.\d{4,5})(v\d+)?", re.I)
ARXIV_OLD = re.compile(r"([a-z][a-z.\-]*/\d{7})(v\d+)?", re.I)
DOI = re.compile(r"(10\.\d{4,9}/[^\s\"<>]+)")


class LookupError_(Exception):
    """A lookup that failed for a reason worth telling the user. `status` is the HTTP status to answer with."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def parse_query(q: str) -> tuple[str, str]:
    """('arxiv', '1706.03762v5') or ('doi', '10.1145/3292500.3330701') from what someone pasted."""
    s = (q or "").strip()
    s = re.sub(r"^(https?://)?(www\.)?", "", s, flags=re.I)
    low = s.lower()
    # arXiv DOIs (10.48550/arXiv.1706.03762) are arXiv papers
    m = re.match(r"(doi\.org/|dx\.doi\.org/|doi:\s*)?10\.48550/arxiv\.(.+)$", low)
    if m:
        s = m.group(2)
        low = s.lower()
    if low.startswith(("arxiv.org/abs/", "arxiv.org/pdf/", "export.arxiv.org/abs/")):
        s = s.split("/", 2)[2]
        s = re.sub(r"\.pdf$", "", s, flags=re.I)
    s = re.sub(r"^arxiv:\s*", "", s, flags=re.I)
    for rx in (ARXIV_NEW, ARXIV_OLD):
        m = rx.fullmatch(s)
        if m:
            return "arxiv", m.group(1) + (m.group(2) or "")
    s2 = re.sub(r"^(doi\.org/|dx\.doi\.org/|doi:\s*)", "", s, flags=re.I)
    m = DOI.fullmatch(s2.rstrip(".,;"))
    if m:
        return "doi", m.group(1)
    raise LookupError_("That doesn't look like an arXiv id (like 1706.03762) or a DOI (like 10.1145/3292500.3330701).")


def fetch(url: str, accept: str = "*/*", limit: int = 5 << 20) -> tuple[bytes, str]:
    """GET url and return (body, content type). Replaced in tests."""
    host = urllib.parse.urlsplit(url).hostname
    if host not in ("export.arxiv.org", "arxiv.org", "api.crossref.org"):
        raise LookupError_("refusing to contact " + str(host), 500)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            body = r.read(limit + 1)
            if len(body) > limit:
                raise LookupError_("The file is too large to download.", 413)
            return body, r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise LookupError_("Not found.", 404) from e
        raise LookupError_(f"The server answered {e.code}. Try again in a minute.", 502) from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise LookupError_("Couldn't reach the internet to look this up. Check your connection and try again.", 502) from e


def clean(s) -> str:
    """Crossref text can carry HTML: tags like <i>…</i> and entities like &amp;."""
    return " ".join(html.unescape(re.sub(r"<[^>]+>", "", str(s or ""))).split())


def authors_line(names: list[str]) -> str:
    """Surnames, comma separated, like the rest of the library ("Vaswani, Shazeer, et al.")."""
    sur = [n.split()[-1] if n.split() else n for n in names if n and n.strip()]
    return ", ".join(sur[:6] + ["et al."]) if len(sur) > 7 else ", ".join(sur)


NS = {"a": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}


def arxiv(aid: str) -> dict:
    body, _ = fetch("https://export.arxiv.org/api/query?" + urllib.parse.urlencode({"id_list": aid}), "application/atom+xml")
    try:
        root = ET.fromstring(body)
    except ET.ParseError as e:
        raise LookupError_("arXiv sent something PDFDesk couldn't read. Try again in a minute.", 502) from e
    entry = root.find("a:entry", NS)
    title = entry.findtext("a:title", "", NS) if entry is not None else ""
    if entry is None or not title.strip() or "/api/errors" in (entry.findtext("a:id", "", NS) or ""):
        raise LookupError_(f"arXiv has no paper {aid}.", 404)
    names = [a.findtext("a:name", "", NS).strip() for a in entry.findall("a:author", NS)]
    published = entry.findtext("a:published", "", NS)
    journal = (entry.findtext("arxiv:journal_ref", "", NS) or "").strip()
    base = re.sub(r"v\d+$", "", aid)
    return {
        "source": "arxiv",
        "arxiv": base,
        "doi": (entry.findtext("arxiv:doi", "", NS) or "").strip(),
        "title": " ".join(title.split()),
        "authors": authors_line(names),
        "year": int(published[:4]) if published[:4].isdigit() else "",
        "venue": journal or "arXiv",
        "url": f"https://arxiv.org/abs/{base}",
        "pdfUrl": f"https://arxiv.org/pdf/{aid}",
    }


def arxiv_pdf(meta: dict) -> bytes:
    body, ctype = fetch(meta["pdfUrl"], "application/pdf", MAX_PDF)
    if not body.startswith(b"%PDF"):
        raise LookupError_("arXiv didn't send a PDF for this paper (it may still be processing). Try again later.", 502)
    return body


def crossref(doi: str) -> dict:
    body, _ = fetch("https://api.crossref.org/works/" + urllib.parse.quote(doi, safe="/:;()"), "application/json")
    try:
        msg = json.loads(body.decode("utf-8"))["message"]
    except (ValueError, KeyError) as e:
        raise LookupError_("Crossref sent something PDFDesk couldn't read. Try again in a minute.", 502) from e
    title = clean((msg.get("title") or [""])[0])
    sub = clean((msg.get("subtitle") or [""])[0])
    if sub and sub.lower() not in title.lower():
        title = f"{title}: {sub}"
    if not title:
        raise LookupError_(f"Crossref has no title for {doi}.", 404)
    names = [clean(" ".join(x for x in (a.get("given"), a.get("family")) if x) or a.get("name", "")) for a in msg.get("author") or []]
    parts = (msg.get("issued") or msg.get("published") or {}).get("date-parts") or [[None]]
    year = parts[0][0] if parts and parts[0] else ""
    return {
        "source": "doi",
        "arxiv": "",
        "doi": msg.get("DOI", doi),
        "title": title,
        "authors": authors_line(names),
        "year": year or "",
        "venue": clean((msg.get("container-title") or [""])[0] or msg.get("publisher") or ""),
        "url": "https://doi.org/" + msg.get("DOI", doi),
    }


def look_up(query: str) -> tuple[dict, bytes | None]:
    """Details for the paper, and its PDF when one can be downloaded (arXiv)."""
    kind, ident = parse_query(query)
    if kind == "arxiv":
        meta = arxiv(ident)
        return meta, arxiv_pdf(meta)
    return crossref(ident), None
