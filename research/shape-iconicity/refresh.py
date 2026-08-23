#!/usr/bin/env python3
"""Explicitly inventory the OSF shape sources and fetch frozen supplements."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import urllib.parse
import urllib.request


NODES = ("ekpgh", "y9zjc")
PLOS_FILES = {
    "external/pone.0208874.s005.xlsx": "https://journals.plos.org/plosone/article/file?type=supplementary&id=info:doi/10.1371/journal.pone.0208874.s005",
    "external/pone.0208874.s007.docx": "https://journals.plos.org/plosone/article/file?type=supplementary&id=info:doi/10.1371/journal.pone.0208874.s007",
}


def get_json(url: str) -> dict:
    if "api.osf.io" in url and "/files/" in url:
        parsed = urllib.parse.urlsplit(url)
        query = dict(urllib.parse.parse_qsl(parsed.query))
        query["page[size]"] = "100"
        url = urllib.parse.urlunsplit((*parsed[:3], urllib.parse.urlencode(query), parsed.fragment))
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


def download(url: str, destination: Path) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "neologism-engine-research/1"})
    with urllib.request.urlopen(request, timeout=180) as response, destination.open("wb") as output:
        shutil.copyfileobj(response, output)
    return {"bytes": destination.stat().st_size, "sha256": sha256(destination), "url": url}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--download", action="append", default=[])
    parser.add_argument("--external", action="store_true")
    args = parser.parse_args()
    if not args.refresh:
        raise SystemExit("network is disabled unless --refresh is explicit")
    args.out.mkdir(parents=True, exist_ok=True)

    node_records = []
    available = {}
    for node_id in NODES:
        node = get_json(f"https://api.osf.io/v2/nodes/{node_id}/")["data"]
        api = f"https://api.osf.io/v2/nodes/{node_id}/files/osfstorage/"
        listed = sorted(list_entries(api), key=lambda pair: pair[0])
        for relative, item in listed:
            key = f"{node_id}/{relative}"
            available[key] = item
        node_records.append({
            "api": api,
            "files": [{
                "bytes": int(item["attributes"]["size"]),
                "name": relative,
                "url": item["links"]["download"],
            } for relative, item in listed],
            "licenseId": node["relationships"].get("license", {}).get("data", {}).get("id"),
            "node": node_id,
            "public": bool(node["attributes"]["public"]),
            "title": node["attributes"]["title"],
        })

    missing = sorted(set(args.download) - available.keys())
    if missing:
        raise SystemExit(f"requested OSF files are absent: {missing}")
    downloaded = {}
    for key in sorted(args.download):
        item = available[key]
        destination = safe_destination(args.out, f"osf/{key}")
        record = download(item["links"]["download"], destination)
        expected_size = int(item["attributes"]["size"])
        if record["bytes"] != expected_size:
            raise SystemExit(f"size mismatch for {key}")
        downloaded[f"osf/{key}"] = record
    if args.external:
        for relative, url in sorted(PLOS_FILES.items()):
            downloaded[relative] = download(url, safe_destination(args.out, relative))

    manifest = {
        "downloaded": downloaded,
        "nodes": node_records,
        "plosFiles": PLOS_FILES,
        "retrievedAtUtc": datetime.now(timezone.utc).isoformat(),
        "schema": "neologism-shape-iconicity-inventory-v1",
    }
    (args.out / "inventory-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(manifest, sort_keys=True))


if __name__ == "__main__":
    main()
