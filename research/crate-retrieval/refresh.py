#!/usr/bin/env python3
"""Explicit network refresh for the frozen crates.io database dump."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tarfile
import urllib.request


URL = "https://static.crates.io/db-dump.tar.gz"
USER_AGENT = "neologism-engine-phase293-research/1.0"


def canonical(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"


def download(destination: Path) -> dict[str, object]:
    temporary = destination.with_suffix(destination.suffix + ".part")
    digest = hashlib.sha256()
    byte_count = 0
    request = urllib.request.Request(URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as output:
        headers = {key.lower(): value for key, value in response.headers.items()}
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)
            digest.update(chunk)
            byte_count += len(chunk)
    declared = headers.get("content-length")
    if declared is not None and byte_count != int(declared):
        raise SystemExit(f"truncated download: {byte_count} != {declared}")
    temporary.replace(destination)
    return {
        "bytes": byte_count,
        "etag": headers.get("etag"),
        "last_modified": headers.get("last-modified"),
        "sha256": digest.hexdigest(),
    }


def inventory(archive: Path, output: Path) -> dict[str, object]:
    members: list[dict[str, object]] = []
    documentation: list[str] = []
    with tarfile.open(archive, mode="r:gz") as bundle:
        for member in bundle:
            if not member.isfile():
                continue
            members.append({"name": member.name, "bytes": member.size})
            base = Path(member.name).name.lower()
            if base in {"readme", "readme.md", "license", "license.md", "copying"}:
                extracted = bundle.extractfile(member)
                if extracted is None:
                    continue
                data = extracted.read()
                document_path = output / "documentation" / Path(member.name).name
                document_path.parent.mkdir(parents=True, exist_ok=True)
                document_path.write_bytes(data)
                documentation.append(document_path.relative_to(output).as_posix())
    (output / "members.json").write_text(canonical(members), encoding="utf-8", newline="\n")
    return {"documentation": sorted(documentation), "members": len(members)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "source")
    args = parser.parse_args()
    if not args.refresh:
        raise SystemExit("network access requires explicit --refresh")
    args.out.mkdir(parents=True, exist_ok=True)
    archive = args.out / "db-dump.tar.gz"
    identity = download(archive)
    archive_inventory = inventory(archive, args.out)
    manifest = {
        "archive": identity,
        "inventory": archive_inventory,
        "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
        "url": URL,
        "user_agent": USER_AGENT,
    }
    (args.out / "manifest.json").write_text(
        canonical(manifest), encoding="utf-8", newline="\n"
    )
    print(canonical(manifest), end="")


if __name__ == "__main__":
    main()
