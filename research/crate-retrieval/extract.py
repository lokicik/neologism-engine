#!/usr/bin/env python3
"""Extract only the frozen Phase 293 crates.io table subset."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tarfile


ARCHIVE_SHA256 = "fecb5cc2ea7eae450c53051ffc104506d22eea7336203afee7a22fe39620647c"
WANTED = {
    "categories.csv",
    "crate_owners.csv",
    "crates.csv",
    "crates_categories.csv",
    "crates_keywords.csv",
    "keywords.csv",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"


def main() -> None:
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, default=root / "source" / "db-dump.tar.gz")
    parser.add_argument("--out", type=Path, default=root / "source" / "tables")
    args = parser.parse_args()
    if sha256(args.archive) != ARCHIVE_SHA256:
        raise SystemExit("archive SHA-256 mismatch")
    if args.out.exists() and any(args.out.iterdir()):
        raise SystemExit(f"output directory is not empty: {args.out}")
    args.out.mkdir(parents=True, exist_ok=True)

    remaining = set(WANTED)
    records: dict[str, dict[str, object]] = {}
    with tarfile.open(args.archive, mode="r:gz") as bundle:
        for member in bundle:
            base = Path(member.name).name
            if base not in remaining or not member.isfile():
                continue
            source = bundle.extractfile(member)
            if source is None:
                raise SystemExit(f"could not open archive member: {member.name}")
            destination = args.out / base
            with destination.open("wb") as output:
                shutil.copyfileobj(source, output, length=1024 * 1024)
            records[base] = {
                "archive_member": member.name,
                "bytes": destination.stat().st_size,
                "sha256": sha256(destination),
            }
            remaining.remove(base)
            if not remaining:
                break
    if remaining:
        raise SystemExit(f"missing frozen tables: {sorted(remaining)}")
    (args.out / "manifest.json").write_text(
        canonical({"archive_sha256": ARCHIVE_SHA256, "tables": records}),
        encoding="utf-8",
        newline="\n",
    )
    print(canonical(records), end="")


if __name__ == "__main__":
    main()
