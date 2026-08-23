#!/usr/bin/env python3
"""Validate and normalize the frozen Phase 293 crates.io table subset."""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import re
import sys
from collections import Counter, defaultdict


TABLES = {
    "categories.csv": "c3fe0f8bea5012a67cfa2cd2e45bde53ece58848d4966ebef0e803bad0c2518f",
    "crate_owners.csv": "52d165d23c0b04b86eb26bae3873edfa72d3d8f819b77dbb0d02d2ec7db60653",
    "crates.csv": "1a8401a199226b2592b2ed52e2684f4a29859cb849d499890a35aba9fc1a83e8",
    "crates_categories.csv": "22165ab24aea4d4570678d0466e316277d90da143b2eb8da47ba9b647266be19",
    "crates_keywords.csv": "9853a03d797ece7a9187dce8c6c63556315bf82b1b3acaead25a214c4521fab8",
    "keywords.csv": "2f95c37fa690313f28d6a93aaa44b347c98ef92a11912d7a0e3bd562b594970c",
}
HEADERS = {
    "categories.csv": ["category", "crates_cnt", "created_at", "description", "id", "path", "slug"],
    "crate_owners.csv": ["crate_id", "created_at", "created_by", "owner_id", "owner_kind"],
    "crates_categories.csv": ["category_id", "crate_id"],
    "crates_keywords.csv": ["crate_id", "keyword_id"],
    "crates.csv": [
        "created_at", "description", "documentation", "homepage", "id", "max_features",
        "max_upload_size", "name", "readme", "repository", "trustpub_only", "updated_at",
    ],
    "keywords.csv": ["crates_cnt", "created_at", "id", "keyword"],
}
CANONICAL_SHA = "4b5163775bc97c7feeae85e6894d7a4160eb66333de8a2fca4d5fa898ee01caa"
NAME_RE = re.compile(r"[a-z]{4,12}\Z")
TERM_RE = re.compile(r"[a-z][a-z0-9]{1,23}")
STOP = {
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "crate", "crates", "for",
    "from", "has", "have", "in", "into", "is", "it", "its", "library", "of", "on", "or",
    "package", "provides", "rust", "simple", "that", "the", "their", "this", "to", "tool",
    "use", "used", "using", "via", "was", "with",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_sha(path: Path, expected: str) -> None:
    actual = sha256(path)
    if actual != expected:
        raise SystemExit(f"SHA-256 mismatch for {path}: {actual} != {expected}")


def canonical(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True) + "\n"


def reader(path: Path, name: str) -> csv.DictReader:
    handle = path.open("r", encoding="utf-8", newline="")
    result = csv.DictReader(handle)
    if result.fieldnames != HEADERS[name]:
        handle.close()
        raise SystemExit(f"header mismatch for {name}: {result.fieldnames}")
    result._source_handle = handle  # type: ignore[attr-defined]
    return result


def close_reader(rows: csv.DictReader) -> None:
    rows._source_handle.close()  # type: ignore[attr-defined]


def tokens(text: str) -> list[str]:
    return [token for token in TERM_RE.findall(text.lower()) if token not in STOP]


def fnv1a64(text: str) -> int:
    value = 14695981039346656037
    for byte in text.encode("ascii"):
        value ^= byte
        value = (value * 1099511628211) & 0xFFFFFFFFFFFFFFFF
    return value


class DisjointSet:
    def __init__(self, size: int) -> None:
        self.parent = list(range(size))
        self.rank = [0] * size

    def find(self, item: int) -> int:
        root = item
        while self.parent[root] != root:
            root = self.parent[root]
        while self.parent[item] != item:
            parent = self.parent[item]
            self.parent[item] = root
            item = parent
        return root

    def union(self, left: int, right: int) -> None:
        left = self.find(left)
        right = self.find(right)
        if left == right:
            return
        if self.rank[left] < self.rank[right]:
            left, right = right, left
        self.parent[right] = left
        if self.rank[left] == self.rank[right]:
            self.rank[left] += 1


def load_identity(path: Path, name: str, value_field: str) -> dict[int, str]:
    values: dict[int, str] = {}
    rows = reader(path, name)
    try:
        for row in rows:
            identity = int(row["id"])
            if identity in values:
                raise SystemExit(f"duplicate {name} id: {identity}")
            values[identity] = row[value_field]
    finally:
        close_reader(rows)
    return values


def load_relation(path: Path, name: str, value_field: str) -> dict[int, set[int]]:
    values: dict[int, set[int]] = defaultdict(set)
    rows = reader(path, name)
    try:
        for row in rows:
            values[int(row["crate_id"])].add(int(row[value_field]))
    finally:
        close_reader(rows)
    return values


def main() -> None:
    csv.field_size_limit(min(sys.maxsize, 2_147_483_647))
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--tables", type=Path, default=root / "source" / "tables")
    parser.add_argument("--briefs", type=Path, default=root.parent / "holistic" / "canonical_briefs.json")
    parser.add_argument("--out", type=Path, default=root / "work" / "prepared")
    args = parser.parse_args()
    if args.out.exists() and any(args.out.iterdir()):
        raise SystemExit(f"output directory is not empty: {args.out}")
    args.out.mkdir(parents=True, exist_ok=True)
    for name, expected in TABLES.items():
        require_sha(args.tables / name, expected)
    require_sha(args.briefs, CANONICAL_SHA)

    keywords = load_identity(args.tables / "keywords.csv", "keywords.csv", "keyword")
    categories = load_identity(args.tables / "categories.csv", "categories.csv", "slug")
    crate_keywords = load_relation(
        args.tables / "crates_keywords.csv", "crates_keywords.csv", "keyword_id"
    )
    crate_categories = load_relation(
        args.tables / "crates_categories.csv", "crates_categories.csv", "category_id"
    )

    owners: dict[int, set[tuple[int, int]]] = defaultdict(set)
    owner_rows = reader(args.tables / "crate_owners.csv", "crate_owners.csv")
    try:
        for row in owner_rows:
            kind = int(row["owner_kind"])
            if kind not in (0, 1):
                raise SystemExit(f"unknown owner_kind: {kind}")
            owners[int(row["crate_id"])].add((kind, int(row["owner_id"])))
    finally:
        close_reader(owner_rows)

    records: list[dict[str, object]] = []
    total_crates = 0
    rejection = Counter()
    seen_names: set[str] = set()
    crate_rows = reader(args.tables / "crates.csv", "crates.csv")
    try:
        for row in crate_rows:
            total_crates += 1
            crate_id = int(row["id"])
            name = row["name"]
            if NAME_RE.fullmatch(name) is None:
                rejection["name"] += 1
                continue
            if name in seen_names:
                raise SystemExit(f"duplicate eligible crate name: {name}")
            description_tokens = [token for token in tokens(row["description"] or "") if token != name]
            if len(description_tokens) < 3:
                rejection["description"] += 1
                continue
            crate_owners = sorted(owners.get(crate_id, set()))
            if not crate_owners:
                rejection["owner"] += 1
                continue
            seen_names.add(name)
            features = [f"u:{token}" for token in description_tokens]
            features.extend(
                f"b:{left}_{right}" for left, right in zip(description_tokens, description_tokens[1:])
            )
            keyword_terms: set[str] = set()
            for identity in crate_keywords.get(crate_id, set()):
                if identity not in keywords:
                    raise SystemExit(f"missing keyword identity: {identity}")
                keyword_terms.update(tokens(keywords[identity]))
            category_terms: set[str] = set()
            for identity in crate_categories.get(crate_id, set()):
                if identity not in categories:
                    raise SystemExit(f"missing category identity: {identity}")
                category_terms.update(tokens(categories[identity]))
            features.extend(f"k:{term}" for term in sorted(keyword_terms))
            features.extend(f"c:{term}" for term in sorted(category_terms))
            records.append(
                {
                    "description_fingerprint": " ".join(description_tokens),
                    "features": features,
                    "id": crate_id,
                    "name": name,
                    "owners": [f"{kind}:{identity}" for kind, identity in crate_owners],
                }
            )
    finally:
        close_reader(crate_rows)

    records.sort(key=lambda record: (str(record["name"]), int(record["id"])))
    dsu = DisjointSet(len(records))
    first_owner: dict[str, int] = {}
    first_description: dict[str, int] = {}
    substitution: dict[tuple[int, int, str], int] = {}
    name_index = {str(record["name"]): index for index, record in enumerate(records)}
    for index, record in enumerate(records):
        for owner in record["owners"]:  # type: ignore[union-attr]
            previous = first_owner.setdefault(str(owner), index)
            dsu.union(index, previous)
        fingerprint = str(record["description_fingerprint"])
        previous_description = first_description.setdefault(fingerprint, index)
        dsu.union(index, previous_description)
        name = str(record["name"])
        for offset in range(len(name)):
            deleted = name[:offset] + name[offset + 1 :]
            signature = (len(name), offset, deleted)
            previous_substitution = substitution.setdefault(signature, index)
            dsu.union(index, previous_substitution)
            shorter = name_index.get(deleted)
            if shorter is not None:
                dsu.union(index, shorter)

    components: dict[int, list[int]] = defaultdict(list)
    for index in range(len(records)):
        components[dsu.find(index)].append(index)
    ordered_components = list(components.values())
    for component in ordered_components:
        component.sort(key=lambda index: (str(records[index]["name"]), int(records[index]["id"])))
    ordered_components.sort(
        key=lambda component: (
            fnv1a64(str(records[component[0]]["name"])),
            str(records[component[0]]["name"]),
        )
    )

    eligible = len(records)
    train_limit = math.floor(eligible * 0.80)
    validation_limit = math.floor(eligible * 0.10)
    counts = Counter()
    phase = "train"
    for component_number, component in enumerate(ordered_components):
        size = len(component)
        if phase == "train" and counts["train"] + size > train_limit:
            phase = "validation"
        if phase == "validation" and counts["validation"] + size > validation_limit:
            phase = "test"
        component_id = f"{fnv1a64(str(records[component[0]]['name'])):016x}:{records[component[0]]['name']}"
        for index in component:
            records[index]["component"] = component_id
            records[index]["split"] = phase
        counts[phase] += size

    train_vocabulary: set[str] = set()
    for record in records:
        if record["split"] == "train":
            train_vocabulary.update(
                feature[2:] for feature in record["features"] if str(feature).startswith("u:")
            )
    briefs: list[str] = json.loads(args.briefs.read_text(encoding="utf-8"))
    brief_coverage = {
        brief: sorted(set(tokens(brief)).intersection(train_vocabulary)) for brief in briefs
    }
    largest_component = max((len(component) for component in ordered_components), default=0)
    shares = {split: counts[split] / eligible if eligible else 0.0 for split in ("train", "validation", "test")}
    gates = {
        "brief_coverage_35_of_35": all(brief_coverage.values()) and len(brief_coverage) == 35,
        "eligible_at_least_50000": eligible >= 50_000,
        "largest_component_at_most_5pct": largest_component <= eligible * 0.05,
        "partition_minimums": counts["validation"] >= 5_000 and counts["test"] >= 5_000,
        "partition_shares_within_3_points": (
            abs(shares["train"] - 0.80) <= 0.03
            and abs(shares["validation"] - 0.10) <= 0.03
            and abs(shares["test"] - 0.10) <= 0.03
        ),
    }
    report = {
        "brief_coverage": brief_coverage,
        "components": len(ordered_components),
        "eligible": eligible,
        "gates": gates,
        "largest_component": largest_component,
        "rejections": dict(sorted(rejection.items())),
        "shares": shares,
        "split_counts": {split: counts[split] for split in ("train", "validation", "test")},
        "total_crates": total_crates,
    }
    (args.out / "data-report.json").write_text(canonical(report), encoding="utf-8", newline="\n")
    if not all(gates.values()):
        raise SystemExit(2)

    normalized = args.out / "records.jsonl.gz"
    with normalized.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as compressed:
            with io.TextIOWrapper(compressed, encoding="utf-8", newline="\n") as output:
                for record in records:
                    record.pop("description_fingerprint", None)
                    output.write(canonical(record))
    manifest = {
        "data_report_sha256": sha256(args.out / "data-report.json"),
        "records_bytes": normalized.stat().st_size,
        "records_sha256": sha256(normalized),
        "tables": TABLES,
    }
    (args.out / "manifest.json").write_text(canonical(manifest), encoding="utf-8", newline="\n")
    print(canonical(manifest), end="")


if __name__ == "__main__":
    main()
