#!/usr/bin/env python3
"""Read-only edge-family diagnosis after the frozen Phase 293 data failure."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from collections import Counter, defaultdict
import sys

import prepare as frozen


def stats(dsu: frozen.DisjointSet, size: int) -> dict[str, object]:
    counts = Counter(dsu.find(index) for index in range(size))
    sizes = sorted(counts.values(), reverse=True)
    return {
        "components": len(sizes),
        "largest": sizes[0] if sizes else 0,
        "largest_10": sizes[:10],
    }


def main() -> None:
    csv.field_size_limit(min(sys.maxsize, 2_147_483_647))
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--tables", type=Path, default=root / "source" / "tables")
    parser.add_argument("--out", type=Path, default=root / "work" / "component-diagnostic.json")
    args = parser.parse_args()

    owners: dict[int, set[tuple[int, int]]] = defaultdict(set)
    owner_rows = frozen.reader(args.tables / "crate_owners.csv", "crate_owners.csv")
    try:
        for row in owner_rows:
            owners[int(row["crate_id"])].add((int(row["owner_kind"]), int(row["owner_id"])))
    finally:
        frozen.close_reader(owner_rows)

    records: list[tuple[str, str, tuple[str, ...]]] = []
    crate_rows = frozen.reader(args.tables / "crates.csv", "crates.csv")
    try:
        for row in crate_rows:
            name = row["name"]
            if frozen.NAME_RE.fullmatch(name) is None:
                continue
            description = tuple(
                token for token in frozen.tokens(row["description"] or "") if token != name
            )
            crate_owners = tuple(
                f"{kind}:{identity}" for kind, identity in sorted(owners.get(int(row["id"]), set()))
            )
            if len(description) < 3 or not crate_owners:
                continue
            records.append((name, " ".join(description), crate_owners))
    finally:
        frozen.close_reader(crate_rows)
    records.sort()

    size = len(records)
    owner_dsu = frozen.DisjointSet(size)
    description_dsu = frozen.DisjointSet(size)
    edit_dsu = frozen.DisjointSet(size)
    combined_dsu = frozen.DisjointSet(size)
    owner_first: dict[str, int] = {}
    description_first: dict[str, int] = {}
    signature_first: dict[tuple[int, int, str], int] = {}
    name_index = {name: index for index, (name, _, _) in enumerate(records)}
    owner_frequency = Counter(owner for _, _, values in records for owner in values)
    description_frequency = Counter(description for _, description, _ in records)
    edges = Counter()

    for index, (name, description, record_owners) in enumerate(records):
        for owner in record_owners:
            previous = owner_first.setdefault(owner, index)
            if previous != index:
                edges["owner"] += 1
            owner_dsu.union(index, previous)
            combined_dsu.union(index, previous)
        previous_description = description_first.setdefault(description, index)
        if previous_description != index:
            edges["description"] += 1
        description_dsu.union(index, previous_description)
        combined_dsu.union(index, previous_description)
        for offset in range(len(name)):
            deleted = name[:offset] + name[offset + 1 :]
            signature = (len(name), offset, deleted)
            previous_signature = signature_first.setdefault(signature, index)
            if previous_signature != index:
                edges["substitution"] += 1
            edit_dsu.union(index, previous_signature)
            combined_dsu.union(index, previous_signature)
            shorter = name_index.get(deleted)
            if shorter is not None:
                edges["insertion_deletion"] += 1
                edit_dsu.union(index, shorter)
                combined_dsu.union(index, shorter)

    report = {
        "combined": stats(combined_dsu, size),
        "description_only": stats(description_dsu, size),
        "edges": dict(sorted(edges.items())),
        "eligible": size,
        "edit1_only": stats(edit_dsu, size),
        "owner_only": stats(owner_dsu, size),
        "top_description_frequencies": sorted(description_frequency.values(), reverse=True)[:10],
        "top_owner_frequencies": sorted(owner_frequency.values(), reverse=True)[:10],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(frozen.canonical(report), encoding="utf-8", newline="\n")
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
