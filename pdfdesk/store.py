"""The library folder: library.json, pdfs/<id>.pdf and daily backups. Standard library only.

Spec: docs/disk-storage.md. Writes are atomic (temp file + os.replace), and the revision token is the
file's mtime and size, so several pdfdesk processes on different ports can share one folder.
"""

from __future__ import annotations

import datetime
import json
import os
import re
import shutil
import tempfile
import threading
import time
from pathlib import Path
from typing import BinaryIO

FORMAT = "pdfdesk-library"
FORMAT_VERSION = 1
KEEP_BACKUPS = 14
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
CHUNK = 1 << 20


class Conflict(Exception):
    """The library changed since the client last read it."""

    def __init__(self, rev: str, papers: list | None):
        super().__init__("library changed")
        self.rev = rev
        self.papers = papers


def default_dir() -> Path:
    env = os.environ.get("PDFDESK_DATA")
    return Path(env) if env else Path.home() / "PDFDesk"


def _replace(tmp: str, target: Path) -> None:
    # On Windows the replace fails while another process has the target open; that is brief, so retry.
    for attempt in range(20):
        try:
            os.replace(tmp, target)
            return
        except PermissionError:
            if attempt == 19:
                raise
            time.sleep(0.05)


def _atomic_write(target: Path, chunks) -> None:
    fd, tmp = tempfile.mkstemp(dir=target.parent, prefix=".tmp-", suffix=target.suffix)
    try:
        with os.fdopen(fd, "wb") as f:
            for chunk in chunks:
                f.write(chunk)
            f.flush()
            os.fsync(f.fileno())
        _replace(tmp, target)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


class Store:
    def __init__(self, root: Path):
        self.root = Path(root).expanduser().resolve()
        self.lib = self.root / "library.json"
        self.pdfs = self.root / "pdfs"
        self.backups = self.root / "backups"
        self.lock = threading.Lock()
        self.pdfs.mkdir(parents=True, exist_ok=True)
        self.backups.mkdir(exist_ok=True)

    # ---------- library.json ----------
    def rev(self) -> str:
        try:
            st = self.lib.stat()
        except FileNotFoundError:
            return "0"
        return f"{st.st_mtime_ns}-{st.st_size}"

    def read(self) -> tuple[str, list | None]:
        with self.lock:
            return self._read()

    def _read(self) -> tuple[str, list | None]:
        try:
            with open(self.lib, "rb") as f:
                st = os.fstat(f.fileno())
                data = json.loads(f.read().decode("utf-8"))
        except FileNotFoundError:
            return "0", None
        papers = data.get("papers") if isinstance(data, dict) else None
        return f"{st.st_mtime_ns}-{st.st_size}", papers if isinstance(papers, list) else None

    def write(self, base_rev: str, papers: list) -> str:
        if not isinstance(papers, list):
            raise ValueError("papers must be a list")
        with self.lock:
            if base_rev != self.rev():
                rev, current = self._read()
                raise Conflict(rev, current)
            self._backup()
            doc = {
                "format": FORMAT,
                "formatVersion": FORMAT_VERSION,
                "savedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
                "papers": papers,
            }
            _atomic_write(self.lib, [json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")])
            return self.rev()

    def _backup(self) -> None:
        if not self.lib.exists():
            return
        today = self.backups / f"library-{datetime.date.today().isoformat()}.json"
        if not today.exists():
            shutil.copy2(self.lib, today)
            old = sorted(self.backups.glob("library-*.json"))[:-KEEP_BACKUPS]
            for p in old:
                try:
                    p.unlink()
                except OSError:
                    pass

    # ---------- PDFs ----------
    def pdf_path(self, pid: str) -> Path:
        if not ID_RE.match(pid):
            raise KeyError(pid)
        return self.pdfs / f"{pid}.pdf"

    def read_pdf(self, pid: str) -> bytes | None:
        path = self.pdf_path(pid)
        with self.lock:
            try:
                return path.read_bytes()
            except FileNotFoundError:
                return None

    def write_pdf(self, pid: str, stream: BinaryIO, length: int) -> None:
        path = self.pdf_path(pid)

        def chunks():
            left = length
            while left > 0:
                block = stream.read(min(CHUNK, left))
                if not block:
                    raise ValueError("upload ended early")
                left -= len(block)
                yield block

        # Stream to a temp file first (outside the lock), then swap it in under the lock.
        fd, tmp = tempfile.mkstemp(dir=self.pdfs, prefix=".tmp-", suffix=".pdf")
        try:
            with os.fdopen(fd, "wb") as f:
                for block in chunks():
                    f.write(block)
                f.flush()
                os.fsync(f.fileno())
            with self.lock:
                _replace(tmp, path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def delete_pdf(self, pid: str) -> None:
        path = self.pdf_path(pid)
        with self.lock:
            try:
                path.unlink()
            except FileNotFoundError:
                pass
