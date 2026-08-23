#!/usr/bin/env python3
"""Explicit network refresh for the frozen Phase-291 PseudoLex source."""

from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urljoin
from urllib.request import Request, urlopen
import zipfile


PUBLICATIONS_URL = "https://www.phon.ox.ac.uk/jpierrehumbert/publications.html"
USER_AGENT = "neologism-engine-human-wordlikeness-research/0.1"


class Links(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.current_href: str | None = None
        self.current_text: list[str] = []
        self.links: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        self.current_href = dict(attrs).get("href")
        self.current_text = []

    def handle_data(self, data: str) -> None:
        if self.current_href is not None:
            self.current_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "a" and self.current_href is not None:
            text = " ".join("".join(self.current_text).split())
            self.links.append((self.current_href, text))
            self.current_href = None
            self.current_text = []


def download(url: str) -> tuple[bytes, str, str | None]:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=60) as response:
        return response.read(), response.geturl(), response.headers.get("Content-Type")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--out", type=Path, default=Path(__file__).parent / "source")
    args = parser.parse_args()
    if not args.refresh:
        raise SystemExit("network access requires explicit --refresh")

    page, page_final_url, page_content_type = download(PUBLICATIONS_URL)
    links = Links()
    links.feed(page.decode("utf-8"))
    candidates = [
        (href, text)
        for href, text in links.links
        if "data file" in text.lower() and ("pseudolex" in href.lower() or href.lower().endswith(".csv"))
    ]
    if len(candidates) != 1:
        raise RuntimeError(f"expected one PseudoLex data link, found {candidates!r}")
    href, link_text = candidates[0]
    data_url = urljoin(page_final_url, href)
    archive, data_final_url, data_content_type = download(data_url)
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        all_members = [name for name in zipped.namelist() if not name.endswith("/")]
        ignored_metadata = [name for name in all_members if name.startswith("__MACOSX/")]
        members = [name for name in all_members if name not in ignored_metadata]
        if members != ["pseudoLex_share1.csv"]:
            raise RuntimeError(f"unexpected PseudoLex data members: {members!r}")
        data = zipped.read(members[0])
    if len(data) < 1_000_000:
        raise RuntimeError(f"PseudoLex CSV is unexpectedly small: {len(data)} bytes")

    args.out.mkdir(parents=True, exist_ok=True)
    archive_path = args.out / "pseudoLex_share1.csv.zip"
    archive_path.write_bytes(archive)
    data_path = args.out / "pseudoLex_share1.csv"
    data_path.write_bytes(data)
    page_path = args.out / "publications.html"
    page_path.write_bytes(page)
    manifest = {
        "schema": "neologism-pseudolex-source-v1",
        "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
        "license_declared_by_source_page": False,
        "link": {"href": href, "text": link_text},
        "page": {
            "bytes": len(page),
            "content_type": page_content_type,
            "final_url": page_final_url,
            "requested_url": PUBLICATIONS_URL,
            "sha256": sha256(page),
        },
        "archive": {
            "bytes": len(archive),
            "content_type": data_content_type,
            "final_url": data_final_url,
            "ignored_metadata_members": ignored_metadata,
            "requested_url": data_url,
            "sha256": sha256(archive),
        },
        "data": {
            "bytes": len(data),
            "archive_member": members[0],
            "content_type": "text/csv",
            "sha256": sha256(data),
        },
    }
    (args.out / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
