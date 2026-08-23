#!/usr/bin/env python3
"""Explicitly refresh the public OSF files for Phase 286."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request


NODE = "baues"
ROOT_API = f"https://api.osf.io/v2/nodes/{NODE}/files/osfstorage/"
ARTICLE_DOI = "10.3758/s13428-026-02976-4"


def get_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "neologism-engine-research/1"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def list_entries(url: str, prefix: str = "") -> list[tuple[str, dict]]:
    entries: list[tuple[str, dict]] = []
    while url:
        page = get_json(url)
        for item in page["data"]:
            attributes = item["attributes"]
            name = attributes["name"]
            relative = f"{prefix}/{name}" if prefix else name
            if attributes["kind"] == "folder":
                child_url = item["relationships"]["files"]["links"]["related"]["href"]
                entries.extend(list_entries(child_url, relative))
            else:
                entries.append((relative, item))
        url = page.get("links", {}).get("next")
    return entries


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if not args.refresh:
        raise SystemExit("network is disabled unless --refresh is explicit")
    args.out.mkdir(parents=True, exist_ok=True)

    node = get_json(f"https://api.osf.io/v2/nodes/{NODE}/")["data"]
    listed = sorted(list_entries(ROOT_API), key=lambda pair: pair[0])
    if not listed:
        raise SystemExit("OSF node contains no files")

    files = []
    for relative, item in listed:
        destination = args.out / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        url = item["links"]["download"]
        request = urllib.request.Request(url, headers={"User-Agent": "neologism-engine-research/1"})
        with urllib.request.urlopen(request, timeout=180) as response, destination.open("wb") as output:
            shutil.copyfileobj(response, output)
        expected_size = int(item["attributes"]["size"])
        if destination.stat().st_size != expected_size:
            raise SystemExit(f"size mismatch for {relative}")
        files.append(
            {
                "bytes": expected_size,
                "name": relative.replace("\\", "/"),
                "sha256": sha256(destination),
                "url": url,
            }
        )

    license_value = node["relationships"].get("license", {}).get("links", {}).get("related", {}).get("meta")
    manifest = {
        "api": ROOT_API,
        "articleDoi": ARTICLE_DOI,
        "articleLicense": "CC BY 4.0",
        "files": files,
        "node": NODE,
        "projectLicenseRelationshipMeta": license_value,
        "public": bool(node["attributes"]["public"]),
        "retrievedAtUtc": datetime.now(timezone.utc).isoformat(),
        "schema": "neologism-ordinal-valence-external-snapshot-v1",
        "title": node["attributes"]["title"],
    }
    manifest_path = args.out / "snapshot-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(manifest, sort_keys=True))


if __name__ == "__main__":
    main()
