#!/usr/bin/env python3
"""Explicitly refresh the CC BY 4.0 BRAND ResearchBox snapshot."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request
import zipfile

URL = "https://s3.wasabisys.com/zipballs.researchbox.org/ResearchBox_1892.zip"
SOURCE_DOI = "10.3758/s13428-024-02525-x"
ARCHIVE_DOI = "10.5281/zenodo.15039646"
LICENSE = "CC BY 4.0"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if not args.refresh:
        raise SystemExit("network is disabled unless --refresh is explicit")

    args.out.mkdir(parents=True, exist_ok=True)
    archive = args.out / "ResearchBox_1892.zip"
    request = urllib.request.Request(URL, headers={"User-Agent": "neologism-engine-research/1"})
    with urllib.request.urlopen(request, timeout=120) as response, archive.open("wb") as output:
        shutil.copyfileobj(response, output)

    with zipfile.ZipFile(archive) as source:
        matches = [name for name in source.namelist() if name.replace("\\", "/").endswith("/BRAND_dataset.xlsx") or name == "BRAND_dataset.xlsx"]
        if len(matches) != 1:
            raise SystemExit(f"expected one BRAND_dataset.xlsx, found {matches}")
        workbook = args.out / "BRAND_dataset.xlsx"
        with source.open(matches[0]) as input_file, workbook.open("wb") as output_file:
            shutil.copyfileobj(input_file, output_file)

    manifest = {
        "schema": "neologism-brand-liking-snapshot-v1",
        "url": URL,
        "retrievedAtUtc": datetime.now(timezone.utc).isoformat(),
        "sourceDoi": SOURCE_DOI,
        "archiveDoi": ARCHIVE_DOI,
        "license": LICENSE,
        "archiveBytes": archive.stat().st_size,
        "archiveSha256": sha256(archive),
        "workbookBytes": workbook.stat().st_size,
        "workbookMember": matches[0],
        "workbookSha256": sha256(workbook),
    }
    manifest_path = args.out / "snapshot-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, sort_keys=True))


if __name__ == "__main__":
    main()
