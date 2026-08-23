#!/usr/bin/env python3
"""Explicitly refresh the public OSF pseudovalence research files."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request

NODE = "kv9at"
API = f"https://api.osf.io/v2/nodes/{NODE}/files/osfstorage/"
EXPECTED = {"data_pseudovalence.RData", "Pseudoval_code.R"}
ARTICLE_DOI = "10.3758/s13423-024-02487-3"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def get_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "neologism-engine-research/1"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if not args.refresh:
        raise SystemExit("network is disabled unless --refresh is explicit")
    args.out.mkdir(parents=True, exist_ok=True)

    node = get_json(f"https://api.osf.io/v2/nodes/{NODE}/")["data"]
    listing = get_json(API)["data"]
    by_name = {item["attributes"]["name"]: item for item in listing}
    if set(by_name) != EXPECTED:
        raise SystemExit(f"unexpected OSF file set: {sorted(by_name)}")

    files = []
    for name in sorted(EXPECTED):
        item = by_name[name]
        url = item["links"]["download"]
        destination = args.out / name
        request = urllib.request.Request(url, headers={"User-Agent": "neologism-engine-research/1"})
        with urllib.request.urlopen(request, timeout=120) as response, destination.open("wb") as output:
            shutil.copyfileobj(response, output)
        expected_size = item["attributes"]["size"]
        if destination.stat().st_size != expected_size:
            raise SystemExit(f"size mismatch for {name}")
        files.append({
            "name": name,
            "url": url,
            "bytes": expected_size,
            "sha256": sha256(destination),
        })

    manifest = {
        "schema": "neologism-pseudovalence-snapshot-v1",
        "node": NODE,
        "title": node["attributes"]["title"],
        "public": node["attributes"]["public"],
        "projectLicense": None,
        "articleDoi": ARTICLE_DOI,
        "articleLicense": "CC BY 4.0",
        "retrievedAtUtc": datetime.now(timezone.utc).isoformat(),
        "api": API,
        "files": files,
    }
    manifest_path = args.out / "snapshot-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, sort_keys=True))


if __name__ == "__main__":
    main()
