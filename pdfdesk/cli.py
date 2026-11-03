"""`pdfdesk` command: serve the bundled browser app on localhost and open it."""

from __future__ import annotations

import argparse
import errno
import functools
import http.server
import json
import socket
import sys
import threading
import webbrowser
from pathlib import Path
from urllib.parse import unquote, urlsplit

from pdfdesk import __version__
from pdfdesk.store import Conflict, Store, default_dir

DEFAULT_PORT = 5173
AUTHOR = "Subham Divakar"
ISSUES = "https://github.com/shubham10divakar/pdfdesk/issues"
MAX_LIBRARY = 256 << 20   # 256 MB of JSON
MAX_PDF = 2 << 30         # 2 GB per PDF


def say(text: str, ascii_fallback: str) -> None:
    """Print text, or a plain-ASCII version on consoles that can't encode it (older Windows code pages)."""
    try:
        print(text, flush=True)
    except UnicodeEncodeError:
        print(ascii_fallback, flush=True)

# Windows can map .js to text/plain through the registry, which browsers refuse to run.
TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".pdf": "application/pdf",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
}


def static_dir() -> Path:
    """The app files: bundled inside the wheel, or prototype/ when run from a checkout."""
    bundled = Path(__file__).parent / "static"
    if (bundled / "index.html").is_file():
        return bundled
    checkout = Path(__file__).parent.parent / "prototype"
    if (checkout / "index.html").is_file():
        return checkout
    raise SystemExit("pdfdesk: app files are missing from this install. Reinstall with `pip install --force-reinstall pdfdesk`.")


class Handler(http.server.SimpleHTTPRequestHandler):
    """Static app files, plus the library API under /api/ (spec: docs/disk-storage.md)."""

    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **TYPES}

    def end_headers(self) -> None:
        # Revalidate every load, so an upgraded install never runs a stale app.js.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    # ---------- request checks ----------
    def _allowed(self) -> bool:
        """Only this machine's browser, at this server's own address, may talk to us.

        The Host check blocks DNS rebinding (a web page whose domain resolves to 127.0.0.1); the Origin
        check blocks other sites. CORS preflights are never answered, so no other origin can PUT/DELETE.
        """
        srv = self.server
        host = (self.headers.get("Host") or "").lower()
        origin = self.headers.get("Origin")
        if host not in srv.allowed_hosts or (origin is not None and origin.lower() not in srv.allowed_origins):  # type: ignore[attr-defined]
            self.send_error(403, "Forbidden")
            return False
        return True

    def _json(self, code: int, obj) -> None:
        body = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _length(self, limit: int) -> int | None:
        try:
            n = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._json(411, {"error": "Content-Length required"})
            return None
        if n < 0 or n > limit:
            self._json(413, {"error": "too large"})
            return None
        return n

    def _api_path(self) -> list[str] | None:
        path = unquote(urlsplit(self.path).path)
        if not path.startswith("/api/"):
            return None
        return path[len("/api/"):].strip("/").split("/")

    # ---------- methods ----------
    def do_GET(self) -> None:
        if not self._allowed():
            return
        parts = self._api_path()
        if parts is None:
            return super().do_GET()
        store: Store = self.server.store  # type: ignore[attr-defined]
        if parts == ["info"]:
            return self._json(200, {"app": "pdfdesk", "version": __version__, "dataDir": str(store.root), "rev": store.rev()})
        if parts == ["library"]:
            rev, papers = store.read()
            return self._json(200, {"rev": rev, "papers": papers})
        if len(parts) == 2 and parts[0] == "pdf":
            try:
                data = store.read_pdf(parts[1])
            except KeyError:
                return self._json(400, {"error": "bad id"})
            if data is None:
                return self._json(404, {"error": "no such PDF"})
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self._json(404, {"error": "not found"})

    def do_HEAD(self) -> None:
        if not self._allowed():
            return
        if self._api_path() is not None:
            return self._json(405, {"error": "use GET"})
        super().do_HEAD()

    def do_PUT(self) -> None:
        if not self._allowed():
            return
        parts = self._api_path()
        store: Store = self.server.store  # type: ignore[attr-defined]
        if parts == ["library"]:
            n = self._length(MAX_LIBRARY)
            if n is None:
                return
            try:
                body = json.loads(self.rfile.read(n).decode("utf-8"))
                rev = store.write(str(body["baseRev"]), body["papers"])
            except Conflict as c:
                return self._json(409, {"rev": c.rev, "papers": c.papers})
            except (ValueError, KeyError, TypeError, UnicodeDecodeError):
                return self._json(400, {"error": "expected {baseRev, papers}"})
            return self._json(200, {"rev": rev})
        if parts and len(parts) == 2 and parts[0] == "pdf":
            n = self._length(MAX_PDF)
            if n is None:
                return
            try:
                store.write_pdf(parts[1], self.rfile, n)
            except KeyError:
                return self._json(400, {"error": "bad id"})
            except ValueError:
                return self._json(400, {"error": "upload ended early"})
            return self._json(200, {"ok": True})
        self._json(404, {"error": "not found"})

    def do_DELETE(self) -> None:
        if not self._allowed():
            return
        parts = self._api_path()
        if parts and len(parts) == 2 and parts[0] == "pdf":
            try:
                self.server.store.delete_pdf(parts[1])  # type: ignore[attr-defined]
            except KeyError:
                return self._json(400, {"error": "bad id"})
            return self._json(200, {"ok": True})
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self._allowed():
            self._json(405, {"error": "not supported"})

    def do_OPTIONS(self) -> None:
        # Never answer CORS preflights: other websites must not be able to write to the library.
        self.send_error(403, "Forbidden")

    def log_message(self, format: str, *args) -> None:  # quiet by default
        if self.server.verbose:  # type: ignore[attr-defined]
            super().log_message(format, *args)


class Server(http.server.ThreadingHTTPServer):
    # On Windows SO_REUSEADDR lets a second server bind the same port silently, so two copies would
    # "run" at once. Claim the port exclusively there instead; elsewhere keep fast restarts.
    allow_reuse_address = sys.platform != "win32"
    daemon_threads = True

    def server_bind(self) -> None:
        if sys.platform == "win32" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="pdfdesk",
        description="Start PDFDesk on this computer and open it in your browser.",
    )
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"port to serve on (default {DEFAULT_PORT})")
    parser.add_argument("--data-dir", type=Path, default=None,
                        help="folder for your library (default: $PDFDESK_DATA, or PDFDesk in your home folder)")
    parser.add_argument("--no-browser", action="store_true", help="don't open a browser window")
    parser.add_argument("--verbose", action="store_true", help="log every request")
    parser.add_argument("--version", action="version", version=f"pdfdesk {__version__}")
    args = parser.parse_args(argv)

    try:
        store = Store(args.data_dir or default_dir())
    except OSError as e:
        print(f"pdfdesk: can't use {args.data_dir or default_dir()} as the library folder: {e.strerror or e}", file=sys.stderr)
        return 1
    handler = functools.partial(Handler, directory=str(static_dir()))
    try:
        server = Server(("127.0.0.1", args.port), handler)
    except OSError as e:
        if e.errno in (errno.EADDRINUSE, errno.EACCES) or getattr(e, "winerror", None) in (10048, 10013):
            print(
                f"pdfdesk: port {args.port} is already in use. PDFDesk may already be running at http://localhost:{args.port}\n"
                "Open that address, or start on another port: pdfdesk --port <number>\n"
                f"Your library is in {store.root} either way.",
                file=sys.stderr,
            )
            return 1
        raise
    server.verbose = args.verbose  # type: ignore[attr-defined]
    server.store = store  # type: ignore[attr-defined]
    server.allowed_hosts = {f"localhost:{args.port}", f"127.0.0.1:{args.port}"}  # type: ignore[attr-defined]
    server.allowed_origins = {f"http://{h}" for h in server.allowed_hosts}  # type: ignore[attr-defined]

    url = f"http://localhost:{args.port}/"
    print(f"PDFDesk {__version__} running at {url}  (Ctrl+C to stop)")
    print(f"Library folder: {store.root}", flush=True)
    say(f"Built by {AUTHOR} with ♥", f"Built by {AUTHOR} with <3")
    print(f"Feedback and questions: {ISSUES}", flush=True)
    if not args.no_browser:
        threading.Timer(0.3, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()
    return 0
