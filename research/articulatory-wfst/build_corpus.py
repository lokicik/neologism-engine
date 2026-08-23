#!/usr/bin/env python3
"""Build deterministic train/validation spelling corpora for the WFST probe."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re

NAME = re.compile(r"[a-z]{4,12}")
EXPECTED_DATASET_SHA256 = "dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_lines(path: Path, values: list[str]) -> str:
    path.write_text("".join(f"{value}\n" for value in values), encoding="ascii", newline="\n")
    return sha256(path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    observed = sha256(args.data)
    if observed != EXPECTED_DATASET_SHA256:
        raise SystemExit(f"dataset SHA-256 mismatch: {observed}")

    partitions: dict[str, set[str]] = {"train": set(), "validation": set()}
    with gzip.open(args.data, "rt", encoding="utf-8", newline="") as handle:
        for line_number, line in enumerate(handle, 1):
            record = json.loads(line)
            split = record.get("split")
            if split not in partitions:
                continue
            name = record.get("name")
            if not isinstance(name, str) or NAME.fullmatch(name) is None:
                raise SystemExit(f"invalid {split} name on line {line_number}: {name!r}")
            partitions[split].add(name)

    train = sorted(partitions["train"])
    validation = sorted(partitions["validation"])
    if len(train) < 8_000 or len(validation) < 1_000:
        raise SystemExit(f"insufficient corpus: train={len(train)} validation={len(validation)}")
    overlap = set(train).intersection(validation)
    if overlap:
        raise SystemExit(f"partition leakage: {len(overlap)} names")

    args.out.mkdir(parents=True, exist_ok=True)
    train_path = args.out / "train-names.txt"
    validation_path = args.out / "validation-names.txt"
    manifest = {
        "schema": "neologism-articulatory-wfst-corpus-v1",
        "sourceDatasetSha256": observed,
        "selection": "exact-split-lowercase-ascii-name-v1",
        "trainCount": len(train),
        "validationCount": len(validation),
        "partitionOverlap": 0,
        "trainSha256": write_lines(train_path, train),
        "validationSha256": write_lines(validation_path, validation),
    }
    manifest_path = args.out / "corpus-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps({**manifest, "manifestSha256": sha256(manifest_path)}, sort_keys=True))


if __name__ == "__main__":
    main()
