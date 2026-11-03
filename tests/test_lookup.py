"""Tests for adding papers by arXiv id or DOI. No network: `lookup.fetch` is replaced with canned replies."""

from __future__ import annotations

import functools
import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from pdfdesk import lookup
from pdfdesk.cli import Handler, Server, static_dir
from pdfdesk.store import Store

ATOM = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/1706.03762v7</id>
    <published>2017-06-12T17:57:34Z</published>
    <title>Attention Is All
      You Need</title>
    <author><name>Ashish Vaswani</name></author><author><name>Noam Shazeer</name></author>
    <author><name>Niki Parmar</name></author><author><name>Jakob Uszkoreit</name></author>
    <author><name>Llion Jones</name></author><author><name>Aidan N. Gomez</name></author>
    <author><name>Lukasz Kaiser</name></author><author><name>Illia Polosukhin</name></author>
    <arxiv:journal_ref>NeurIPS 2017</arxiv:journal_ref>
  </entry>
</feed>"""
ATOM_ERROR = """<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/api/errors#incorrect_id_format</id><title>Error</title></entry></feed>"""
CROSSREF = {"message": {"DOI": "10.1145/3292500.3330701", "title": ["Optuna"], "subtitle": ["A Next-generation Hyperparameter Optimization Framework"],
                        "author": [{"given": "Takuya", "family": "Akiba"}, {"given": "Shotaro", "family": "Sano"}],
                        "issued": {"date-parts": [[2019, 7, 25]]}, "container-title": ["Proceedings of <i>Knowledge Discovery</i> &amp; Data Mining"]}}
PDF = b"%PDF-1.5\n" + b"x" * 5000 + b"\n%%EOF"


def fake_fetch(replies):
    calls = []

    def fetch(url, accept="*/*", limit=0):
        calls.append(url)
        for prefix, reply in replies.items():
            if url.startswith(prefix):
                if isinstance(reply, Exception):
                    raise reply
                return reply
        raise AssertionError("unexpected fetch " + url)
    fetch.calls = calls
    return fetch


class ParseTest(unittest.TestCase):
    def test_what_people_paste(self):
        cases = {
            "1706.03762": ("arxiv", "1706.03762"), "arXiv:1706.03762v5": ("arxiv", "1706.03762v5"),
            " https://arxiv.org/abs/1706.03762 ": ("arxiv", "1706.03762"), "arxiv.org/pdf/2301.12345v2.pdf": ("arxiv", "2301.12345v2"),
            "hep-th/9901001": ("arxiv", "hep-th/9901001"), "math.GT/0309136v1": ("arxiv", "math.GT/0309136v1"),
            "10.48550/arXiv.1706.03762": ("arxiv", "1706.03762"), "https://doi.org/10.48550/arXiv.2106.09685": ("arxiv", "2106.09685"),
            "10.1145/3292500.3330701": ("doi", "10.1145/3292500.3330701"), "doi:10.1038/nature14539": ("doi", "10.1038/nature14539"),
            "https://doi.org/10.1016/j.cell.2020.01.001.": ("doi", "10.1016/j.cell.2020.01.001"),
        }
        for q, want in cases.items():
            self.assertEqual(lookup.parse_query(q), want, q)

    def test_nonsense_is_refused_with_a_useful_message(self):
        for q in ("", "attention is all you need", "1706", "http://evil.example/10.1/x y"):
            with self.assertRaises(lookup.LookupError_) as cm:
                lookup.parse_query(q)
            self.assertIn("arXiv id", str(cm.exception))


class FetchersTest(unittest.TestCase):
    def setUp(self):
        self.real = lookup.fetch

    def tearDown(self):
        lookup.fetch = self.real

    def test_arxiv(self):
        lookup.fetch = fake_fetch({"https://export.arxiv.org/api/query": (ATOM.encode(), "application/atom+xml"), "https://arxiv.org/pdf/1706.03762v7": (PDF, "application/pdf")})
        meta, pdf = lookup.look_up("arXiv:1706.03762v7")
        self.assertEqual(meta["title"], "Attention Is All You Need")
        self.assertEqual(meta["authors"], "Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, et al.")
        self.assertEqual((meta["year"], meta["venue"], meta["arxiv"], meta["url"]), (2017, "NeurIPS 2017", "1706.03762", "https://arxiv.org/abs/1706.03762"))
        self.assertEqual(pdf, PDF)
        self.assertIn("id_list=1706.03762v7", lookup.fetch.calls[0])

    def test_arxiv_unknown_id(self):
        lookup.fetch = fake_fetch({"https://export.arxiv.org/api/query": (ATOM_ERROR.encode(), "application/atom+xml")})
        with self.assertRaises(lookup.LookupError_) as cm:
            lookup.look_up("9999.99999")
        self.assertEqual(cm.exception.status, 404)

    def test_arxiv_sends_html_instead_of_a_pdf(self):
        lookup.fetch = fake_fetch({"https://export.arxiv.org/api/query": (ATOM.encode(), ""), "https://arxiv.org/pdf/": (b"<html>wait</html>", "text/html")})
        with self.assertRaises(lookup.LookupError_) as cm:
            lookup.look_up("1706.03762")
        self.assertEqual(cm.exception.status, 502)

    def test_doi(self):
        lookup.fetch = fake_fetch({"https://api.crossref.org/works/10.1145/3292500.3330701": (json.dumps(CROSSREF).encode(), "application/json")})
        meta, pdf = lookup.look_up("https://doi.org/10.1145/3292500.3330701")
        self.assertEqual((meta["title"], meta["authors"], meta["year"], meta["venue"], meta["doi"]),
                         ("Optuna: A Next-generation Hyperparameter Optimization Framework", "Akiba, Sano", 2019, "Proceedings of Knowledge Discovery & Data Mining", "10.1145/3292500.3330701"))
        self.assertIsNone(pdf)

    def test_offline(self):
        lookup.fetch = fake_fetch({"https://api.crossref.org/": lookup.LookupError_("Couldn't reach the internet to look this up.", 502)})
        with self.assertRaises(lookup.LookupError_) as cm:
            lookup.look_up("10.1038/nature14539")
        self.assertEqual(cm.exception.status, 502)

    def test_only_the_three_hosts(self):
        lookup.fetch = self.real
        with self.assertRaises(lookup.LookupError_):
            lookup.fetch("https://evil.example/x")


class EndpointTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / "lib")
        self.srv = Server(("127.0.0.1", 0), functools.partial(Handler, directory=str(static_dir())))
        self.port = self.srv.server_address[1]
        self.srv.verbose, self.srv.store = False, self.store
        self.srv.allowed_hosts = {f"localhost:{self.port}", f"127.0.0.1:{self.port}"}
        self.srv.allowed_origins = {f"http://{h}" for h in self.srv.allowed_hosts}
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.real = lookup.fetch
        lookup.fetch = fake_fetch({"https://export.arxiv.org/api/query": (ATOM.encode(), ""), "https://arxiv.org/pdf/": (PDF, "application/pdf")})

    def tearDown(self):
        lookup.fetch = self.real
        self.srv.shutdown(); self.srv.server_close(); self.tmp.cleanup()

    def post(self, body, origin=True, ctype="application/json"):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        h = {"Host": f"localhost:{self.port}", "Content-Type": ctype}
        if origin:
            h["Origin"] = f"http://localhost:{self.port}"
        c.request("POST", "/api/lookup", json.dumps(body).encode(), h)
        r = c.getresponse(); data = r.read(); c.close()
        return r.status, (json.loads(data) if data.startswith(b"{") else None)

    def test_adds_the_pdf_to_the_library_folder(self):
        st, r = self.post({"query": "1706.03762", "id": "abc123"})
        self.assertEqual(st, 200)
        self.assertTrue(r["hasFile"])
        self.assertEqual(r["paper"]["title"], "Attention Is All You Need")
        self.assertNotIn("pdfUrl", r["paper"])
        self.assertEqual((self.store.pdfs / "abc123.pdf").read_bytes(), PDF)

    def test_refused_unless_it_comes_from_the_app(self):
        self.assertEqual(self.post({"query": "1706.03762", "id": "abc123"}, origin=False)[0], 403)
        self.assertEqual(self.post({"query": "1706.03762", "id": "abc123"}, ctype="text/plain")[0], 403)
        self.assertFalse((self.store.pdfs / "abc123.pdf").exists())

    def test_bad_input(self):
        self.assertEqual(self.post({"query": "1706.03762", "id": "../x"})[0], 400)
        self.assertEqual(self.post({"id": "abc"})[0], 400)
        st, r = self.post({"query": "not an id", "id": "abc"})
        self.assertEqual(st, 400)
        self.assertIn("arXiv id", r["error"])


if __name__ == "__main__":
    unittest.main()
