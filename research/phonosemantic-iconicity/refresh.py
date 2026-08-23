#!/usr/bin/env python3
"""Explicitly inventory or refresh the public OSF iconicity source."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import urllib.error
import urllib.request


NODE = "hdm7w"
ARTICLE_DOI = "10.1121/10.0041768"


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
            relative = f"{prefix}/{attributes['name']}" if prefix else attributes["name"]
            if attributes["kind"] == "folder":
                child_url = item["relationships"]["files"]["links"]["related"]["href"]
                entries.extend(list_entries(child_url, relative))
            else:
                entries.append((relative, item))
        url = page.get("links", {}).get("next")
    return entries


def safe_destination(root: Path, relative: str) -> Path:
    parts = PurePosixPath(relative).parts
    if not parts or any(part in {"", ".", ".."} for part in parts):
        raise ValueError(f"unsafe source path: {relative}")
    destination = root.joinpath(*parts).resolve()
    if root.resolve() not in destination.parents:
        raise ValueError(f"source path escapes output: {relative}")
    return destination


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--download", action="append", default=[])
    args = parser.parse_args()
    if not args.refresh:
        raise SystemExit("network is disabled unless --refresh is explicit")
    args.out.mkdir(parents=True, exist_ok=True)

    node = None
    resource_type = None
    failures = []
    for candidate in ("nodes", "registrations"):
        try:
            node = get_json(f"https://api.osf.io/v2/{candidate}/{NODE}/")["data"]
            resource_type = candidate
            break
        except urllib.error.HTTPError as error:
            if error.code not in {401, 403, 404}:
                raise
            failures.append(f"{candidate}:{error.code}")
    if node is None or resource_type is None:
        raise SystemExit(f"OSF source is not publicly readable: {', '.join(failures)}")
    root_api = f"https://api.osf.io/v2/{resource_type}/{NODE}/files/osfstorage/"
    listed = sorted(list_entries(root_api), key=lambda pair: pair[0])
    if not listed:
        raise SystemExit("OSF node contains no files")
    by_path = {relative: item for relative, item in listed}
    missing = sorted(set(args.download) - by_path.keys())
    if missing:
        raise SystemExit(f"requested source files are absent: {missing}")

    files = []
    for relative, item in listed:
        attributes = item["attributes"]
        record = {
            "bytes": int(attributes["size"]),
            "name": relative,
            "url": item["links"]["download"],
        }
        if relative in args.download:
            destination = safe_destination(args.out, relative)
            destination.parent.mkdir(parents=True, exist_ok=True)
            request = urllib.request.Request(record["url"], headers={"User-Agent": "neologism-engine-research/1"})
            with urllib.request.urlopen(request, timeout=180) as response, destination.open("wb") as output:
                shutil.copyfileobj(response, output)
            if destination.stat().st_size != record["bytes"]:
                raise SystemExit(f"size mismatch for {relative}")
            record["sha256"] = sha256(destination)
        files.append(record)

    manifest = {
        "api": root_api,
        "articleDoi": ARTICLE_DOI,
        "files": files,
        "node": NODE,
        "nodeLicenseId": node["relationships"].get("license", {}).get("data", {}).get("id"),
        "public": bool(node["attributes"]["public"]),
        "resourceType": resource_type,
        "retrievedAtUtc": datetime.now(timezone.utc).isoformat(),
        "schema": "neologism-phonosemantic-iconicity-inventory-v1",
        "title": node["attributes"]["title"],
    }
    destination = args.out / "inventory-manifest.json"
    destination.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(manifest, sort_keys=True))


if __name__ == "__main__":
    main()
