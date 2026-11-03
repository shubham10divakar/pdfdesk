"""`pdfdesk` command: serve the bundled browser app on localhost and open it."""

from __future__ import annotations

import argparse
import errno
import functools
import http.server
import socket
import sys
import threading
import webbrowser
from pathlib import Path

from pdfdesk import __version__

DEFAULT_PORT = 5173
AUTHOR = "Subham Divakar"
ISSUES = "https://github.com/shubham10divakar/pdfdesk/issues"


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
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **TYPES}

    def end_headers(self) -> None:
        # Revalidate every load, so an upgraded install never runs a stale app.js.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

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
    parser.add_argument("--port", type=int, default=DEFAULT_PORT,
                        help=f"port to serve on (default {DEFAULT_PORT}). Your library is stored per port, so keep it the same.")
    parser.add_argument("--no-browser", action="store_true", help="don't open a browser window")
    parser.add_argument("--verbose", action="store_true", help="log every request")
    parser.add_argument("--version", action="version", version=f"pdfdesk {__version__}")
    args = parser.parse_args(argv)

    handler = functools.partial(Handler, directory=str(static_dir()))
    try:
        server = Server(("127.0.0.1", args.port), handler)
    except OSError as e:
        if e.errno in (errno.EADDRINUSE, errno.EACCES) or getattr(e, "winerror", None) in (10048, 10013):
            print(
                f"pdfdesk: port {args.port} is already in use. PDFDesk may already be running at http://localhost:{args.port}\n"
                "Your library is saved per port, so a different port starts with an empty library.\n"
                "To use another port anyway: pdfdesk --port <number>",
                file=sys.stderr,
            )
            return 1
        raise
    server.verbose = args.verbose  # type: ignore[attr-defined]

    url = f"http://localhost:{args.port}/"
    print(f"PDFDesk {__version__} running at {url}  (Ctrl+C to stop)")
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
