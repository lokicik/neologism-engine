#!/usr/bin/env python3
"""Prepare Phase 294 records with non-percolating edit-one leakage control."""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import math
from pathlib import Path
import sys
from collections import Counter, defaultdict

import prepare as base


class EditIndex:
    def __init__(self, names: list[str]) -> None:
        self.exact = set(names)
        self.deletion_forms: set[str] = set()
        self.substitution_signatures: set[tuple[int, int, str]] = set()
        for name in names:
            for offset in range(len(name)):
                deleted = name[:offset] + name[offset + 1 :]
                self.deletion_forms.add(deleted)
                self.substitution_signatures.add((len(name), offset, deleted))

    def collides(self, name: str) -> bool:
        if name in self.exact or name in self.deletion_forms:
            return True
        for offset in range(len(name)):
            deleted = name[:offset] + name[offset + 1 :]
            if deleted in self.exact or (len(name), offset, deleted) in self.substitution_signatures:
                return True
        return False


def main() -> None:
    csv.field_size_limit(min(sys.maxsize, 2_147_483_647))
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--tables", type=Path, default=root / "source" / "tables")
    parser.add_argument("--briefs", type=Path, default=root.parent / "holistic" / "canonical_briefs.json")
    parser.add_argument("--out", type=Path, default=root / "work" / "prepared-v2")
    args = parser.parse_args()
    if args.out.exists() and any(args.out.iterdir()):
        raise SystemExit(f"output directory is not empty: {args.out}")
    args.out.mkdir(parents=True, exist_ok=True)
    for name, expected in base.TABLES.items():
        base.require_sha(args.tables / name, expected)
    base.require_sha(args.briefs, base.CANONICAL_SHA)

    keywords = base.load_identity(args.tables / "keywords.csv", "keywords.csv", "keyword")
    categories = base.load_identity(args.tables / "categories.csv", "categories.csv", "slug")
    crate_keywords = base.load_relation(
        args.tables / "crates_keywords.csv", "crates_keywords.csv", "keyword_id"
    )
    crate_categories = base.load_relation(
        args.tables / "crates_categories.csv", "crates_categories.csv", "category_id"
    )
    owners: dict[int, set[tuple[int, int]]] = defaultdict(set)
    owner_rows = base.reader(args.tables / "crate_owners.csv", "crate_owners.csv")
    try:
        for row in owner_rows:
            kind = int(row["owner_kind"])
            if kind not in (0, 1):
                raise SystemExit(f"unknown owner_kind: {kind}")
            owners[int(row["crate_id"])].add((kind, int(row["owner_id"])))
    finally:
        base.close_reader(owner_rows)

    records: list[dict[str, object]] = []
    rejection = Counter()
    total_crates = 0
    seen_names: set[str] = set()
    crate_rows = base.reader(args.tables / "crates.csv", "crates.csv")
    try:
        for row in crate_rows:
            total_crates += 1
            crate_id = int(row["id"])
            name = row["name"]
            if base.NAME_RE.fullmatch(name) is None:
                rejection["name"] += 1
                continue
            if name in seen_names:
                raise SystemExit(f"duplicate eligible crate name: {name}")
            description_tokens = [
                token for token in base.tokens(row["description"] or "") if token != name
            ]
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
                keyword_terms.update(base.tokens(keywords[identity]))
            category_terms: set[str] = set()
            for identity in crate_categories.get(crate_id, set()):
                if identity not in categories:
                    raise SystemExit(f"missing category identity: {identity}")
                category_terms.update(base.tokens(categories[identity]))
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
        base.close_reader(crate_rows)

    records.sort(key=lambda record: (str(record["name"]), int(record["id"])))
    initial_eligible = len(records)
    dsu = base.DisjointSet(initial_eligible)
    first_owner: dict[str, int] = {}
    first_description: dict[str, int] = {}
    for index, record in enumerate(records):
        for owner in record["owners"]:  # type: ignore[union-attr]
            previous = first_owner.setdefault(str(owner), index)
            dsu.union(index, previous)
        fingerprint = str(record["description_fingerprint"])
        previous_description = first_description.setdefault(fingerprint, index)
        dsu.union(index, previous_description)

    components: dict[int, list[int]] = defaultdict(list)
    for index in range(initial_eligible):
        components[dsu.find(index)].append(index)
    all_components = list(components.values())
    for component in all_components:
        component.sort(key=lambda index: (str(records[index]["name"]), int(records[index]["id"])))
    hub_limit = initial_eligible * 0.02
    hubs = [component for component in all_components if len(component) > hub_limit]
    retained_components = [component for component in all_components if len(component) <= hub_limit]
    hub_excluded = sum(map(len, hubs))
    retained_initial = initial_eligible - hub_excluded
    retained_components.sort(
        key=lambda component: (
            base.fnv1a64(str(records[component[0]]["name"])),
            str(records[component[0]]["name"]),
        )
    )

    train_limit = math.floor(retained_initial * 0.80)
    validation_limit = math.floor(retained_initial * 0.10)
    preliminary_counts = Counter()
    phase = "train"
    for component in retained_components:
        size = len(component)
        if phase == "train" and preliminary_counts["train"] + size > train_limit:
            phase = "validation"
        if phase == "validation" and preliminary_counts["validation"] + size > validation_limit:
            phase = "test"
        component_id = (
            f"{base.fnv1a64(str(records[component[0]]['name'])):016x}:"
            f"{records[component[0]]['name']}"
        )
        for index in component:
            records[index]["component"] = component_id
            records[index]["preliminary_split"] = phase
        preliminary_counts[phase] += size

    train_records = [record for record in records if record.get("preliminary_split") == "train"]
    validation_candidates = [
        record for record in records if record.get("preliminary_split") == "validation"
    ]
    test_candidates = [record for record in records if record.get("preliminary_split") == "test"]
    train_index = EditIndex([str(record["name"]) for record in train_records])
    validation_records = [
        record for record in validation_candidates if not train_index.collides(str(record["name"]))
    ]
    validation_edit_excluded = len(validation_candidates) - len(validation_records)
    prior_index = EditIndex(
        [str(record["name"]) for record in train_records + validation_records]
    )
    test_records = [
        record for record in test_candidates if not prior_index.collides(str(record["name"]))
    ]
    test_edit_excluded = len(test_candidates) - len(test_records)

    for split, partition_records in (
        ("train", train_records),
        ("validation", validation_records),
        ("test", test_records),
    ):
        for record in partition_records:
            record["split"] = split
    final_records = train_records + validation_records + test_records
    final_records.sort(key=lambda record: (str(record["name"]), int(record["id"])))
    final_counts = {
        "train": len(train_records),
        "validation": len(validation_records),
        "test": len(test_records),
    }

    train_vocab = {
        str(feature)[2:]
        for record in train_records
        for feature in record["features"]  # type: ignore[union-attr]
        if str(feature).startswith("u:")
    }
    briefs: list[str] = json.loads(args.briefs.read_text(encoding="utf-8"))
    brief_coverage = {
        brief: sorted(set(base.tokens(brief)).intersection(train_vocab)) for brief in briefs
    }

    verification_index = EditIndex([str(record["name"]) for record in train_records])
    validation_leaks = sum(
        verification_index.collides(str(record["name"])) for record in validation_records
    )
    train_validation_index = EditIndex(
        [str(record["name"]) for record in train_records + validation_records]
    )
    test_leaks = sum(
        train_validation_index.collides(str(record["name"])) for record in test_records
    )
    final_total = len(final_records)
    largest_retained_component = max(map(len, retained_components), default=0)
    gates = {
        "brief_coverage_35_of_35": len(brief_coverage) == 35 and all(brief_coverage.values()),
        "cross_partition_edit1_zero": validation_leaks == 0 and test_leaks == 0,
        "evaluation_minimums": len(validation_records) >= 5_000 and len(test_records) >= 5_000,
        "final_total_at_least_50000": final_total >= 50_000,
        "hub_exclusion_at_most_10pct": hub_excluded <= initial_eligible * 0.10,
        "largest_retained_component_at_most_2pct": (
            largest_retained_component <= initial_eligible * 0.02
        ),
    }
    report = {
        "brief_coverage": brief_coverage,
        "components": len(all_components),
        "edit_exclusions": {
            "test": test_edit_excluded,
            "validation": validation_edit_excluded,
        },
        "final_counts": final_counts,
        "final_total": final_total,
        "gates": gates,
        "hub_components": sorted((len(component) for component in hubs), reverse=True),
        "hub_excluded": hub_excluded,
        "initial_eligible": initial_eligible,
        "largest_retained_component": largest_retained_component,
        "preliminary_counts": {
            split: preliminary_counts[split] for split in ("train", "validation", "test")
        },
        "rejections": dict(sorted(rejection.items())),
        "total_crates": total_crates,
        "verification_leaks": {"test": test_leaks, "validation": validation_leaks},
    }
    report_path = args.out / "data-report.json"
    report_path.write_text(base.canonical(report), encoding="utf-8", newline="\n")
    if not all(gates.values()):
        raise SystemExit(2)

    normalized = args.out / "records.jsonl.gz"
    with normalized.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as compressed:
            with io.TextIOWrapper(compressed, encoding="utf-8", newline="\n") as output:
                for record in final_records:
                    record.pop("description_fingerprint", None)
                    record.pop("preliminary_split", None)
                    output.write(base.canonical(record))
    manifest = {
        "data_report_sha256": base.sha256(report_path),
        "records_bytes": normalized.stat().st_size,
        "records_sha256": base.sha256(normalized),
        "tables": base.TABLES,
    }
    (args.out / "manifest.json").write_text(
        base.canonical(manifest), encoding="utf-8", newline="\n"
    )
    print(base.canonical(manifest), end="")


if __name__ == "__main__":
    main()
