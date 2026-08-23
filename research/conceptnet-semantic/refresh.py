#!/usr/bin/env python3
"""Explicitly refresh the frozen Phase 297 ConceptNet snapshot."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import time
from typing import Iterable
from urllib.parse import quote
from urllib.request import Request, urlopen


KEYWORDS_SHA256 = "1f959c015efb9d49b1219b966f3ee464592fa62949c4b8804ce1f2fe2f692a6d"
BASE_URL = "https://api.conceptnet.io/related/c/en/{keyword}?filter=/c/en&limit=200"
USER_AGENT = "neologism-engine-phase297/1.0 (offline research snapshot)"
DELAY_SECONDS = 1.05


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical(value: object) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ) + "\n"


def write_json(path: Path, value: object) -> None:
    path.write_text(canonical(value), encoding="utf-8", newline="\n")


@contextmanager
def gzip_text_writer(path: Path):
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as compressed:
            with io.TextIOWrapper(compressed, encoding="utf-8", newline="\n") as output:
                yield output


def write_jsonl_gzip(path: Path, rows: Iterable[object]) -> None:
    with gzip_text_writer(path) as output:
        for row in rows:
            output.write(canonical(row))


def load_keywords(path: Path) -> list[str]:
    if sha256(path) != KEYWORDS_SHA256:
        raise ValueError("canonical keyword evidence SHA-256 mismatch")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list) or len(data) != 35:
        raise ValueError("canonical brief inventory changed")
    keywords = sorted(
        {
            keyword
            for row in data
            for keyword in row.get("extracted", [])
            if isinstance(keyword, str)
        }
    )
    if len(keywords) != 111:
        raise ValueError(f"expected 111 unique keywords, found {len(keywords)}")
    return keywords


def fetch(keyword: str) -> tuple[str, dict[str, object]]:
    url = BASE_URL.format(keyword=quote(keyword, safe=""))
    request = Request(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise ValueError(f"HTTP {response.status} for {keyword}")
        body = response.read()
    value = json.loads(body.decode("utf-8"))
    if not isinstance(value, dict) or not isinstance(value.get("related"), list):
        raise ValueError(f"malformed ConceptNet response for {keyword}")
    for row in value["related"]:
        if not isinstance(row, dict) or not isinstance(row.get("@id"), str):
            raise ValueError(f"malformed related row for {keyword}")
        weight = row.get("weight")
        if not isinstance(weight, (int, float)) or not math.isfinite(float(weight)):
            raise ValueError(f"invalid related weight for {keyword}")
    return url, value


def main() -> int:
    root = Path(__file__).resolve().parent
    repository = root.parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument(
        "--keywords",
        type=Path,
        default=repository / "research" / "holistic" / "work" / "dataset-final" / "canonical-keyword-coverage.json",
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.refresh:
        raise ValueError("network refresh requires explicit --refresh")
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError(f"output directory is not empty: {args.output}")
    args.output.mkdir(parents=True, exist_ok=True)

    keywords = load_keywords(args.keywords)
    rows = []
    urls = []
    for index, keyword in enumerate(keywords):
        if index:
            time.sleep(DELAY_SECONDS)
        url, response = fetch(keyword)
        rows.append({"keyword": keyword, "response": response, "url": url})
        urls.append(url)
        print(f"phase297 refresh {index + 1}/{len(keywords)} {keyword}", flush=True)
    snapshot = args.output / "conceptnet-related.jsonl.gz"
    write_jsonl_gzip(snapshot, rows)
    manifest = {
        "api": "ConceptNet 5.7 related",
        "data_license": "CC BY-SA 4.0",
        "keyword_count": len(keywords),
        "keyword_evidence_sha256": KEYWORDS_SHA256,
        "request_delay_seconds": DELAY_SECONDS,
        "snapshot_bytes": snapshot.stat().st_size,
        "snapshot_sha256": sha256(snapshot),
        "urls_sha256": hashlib.sha256(("\n".join(urls) + "\n").encode("utf-8")).hexdigest(),
    }
    write_json(args.output / "source-manifest.json", manifest)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"phase297 refresh: {error}")
        raise SystemExit(1)
