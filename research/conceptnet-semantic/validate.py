#!/usr/bin/env python3
"""Validate a frozen Phase 297 ConceptNet snapshot without network access."""

from __future__ import annotations

import argparse
from collections import defaultdict
import gzip
import hashlib
import json
import math
from pathlib import Path
import re
from urllib.parse import unquote


KEYWORDS_SHA256 = "1f959c015efb9d49b1219b966f3ee464592fa62949c4b8804ce1f2fe2f692a6d"
TERM_PATTERN = re.compile(r"[a-z]{3,16}")
MIN_WEIGHT = 0.10


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical(value: object) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ) + "\n"


def write_json(path: Path, value: object) -> None:
    path.write_text(canonical(value), encoding="utf-8", newline="\n")


def load_briefs(path: Path) -> list[dict[str, object]]:
    if sha256(path) != KEYWORDS_SHA256:
        raise ValueError("canonical keyword evidence SHA-256 mismatch")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list) or len(value) != 35:
        raise ValueError("canonical brief inventory changed")
    return value


def load_snapshot(path: Path) -> dict[str, dict[str, object]]:
    rows: dict[str, dict[str, object]] = {}
    with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
        for line_number, line in enumerate(handle, 1):
            row = json.loads(line)
            keyword = row.get("keyword")
            response = row.get("response")
            if not isinstance(keyword, str) or not isinstance(response, dict):
                raise ValueError(f"malformed snapshot row {line_number}")
            if keyword in rows:
                raise ValueError(f"duplicate keyword: {keyword}")
            if not isinstance(response.get("related"), list):
                raise ValueError(f"missing related list: {keyword}")
            rows[keyword] = response
    return rows


def anchors(keyword: str, response: dict[str, object]) -> dict[str, float]:
    result: dict[str, float] = {}
    for row in response["related"]:
        if not isinstance(row, dict):
            raise ValueError(f"malformed related row: {keyword}")
        identifier = row.get("@id")
        weight = row.get("weight")
        if not isinstance(identifier, str) or not isinstance(weight, (int, float)):
            raise ValueError(f"malformed related value: {keyword}")
        numeric = float(weight)
        if not math.isfinite(numeric) or numeric < MIN_WEIGHT:
            continue
        pieces = identifier.split("/")
        if len(pieces) != 4 or pieces[:3] != ["", "c", "en"]:
            continue
        term = unquote(pieces[3])
        if term == keyword or not TERM_PATTERN.fullmatch(term):
            continue
        result[term] = max(result.get(term, 0.0), numeric)
    return dict(sorted(result.items(), key=lambda item: (-item[1], item[0]))[:200])


def main() -> int:
    root = Path(__file__).resolve().parent
    repository = root.parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument(
        "--keywords",
        type=Path,
        default=repository / "research" / "holistic" / "work" / "dataset-final" / "canonical-keyword-coverage.json",
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError(f"output already exists: {args.output}")

    briefs = load_briefs(args.keywords)
    snapshot = load_snapshot(args.snapshot)
    declared = sorted({keyword for row in briefs for keyword in row["extracted"]})
    exact_inventory = sorted(snapshot) == declared and len(declared) == 111
    by_keyword = {keyword: anchors(keyword, snapshot[keyword]) for keyword in sorted(snapshot)}
    keyword_nonempty = exact_inventory and all(by_keyword[keyword] for keyword in declared)

    brief_rows = []
    sets = []
    source_diversity_pass = True
    for row in briefs:
        keywords = [str(value) for value in row["extracted"]]
        merged: dict[str, float] = {}
        sources: defaultdict[str, list[str]] = defaultdict(list)
        counts = {}
        for keyword in keywords:
            values = by_keyword.get(keyword, {})
            counts[keyword] = len(values)
            for term, weight in values.items():
                merged[term] = max(merged.get(term, 0.0), weight)
                sources[term].append(keyword)
        unique_sources = {
            keyword: sum(1 for term, owners in sources.items() if owners == [keyword])
            for keyword in keywords
        }
        if len(keywords) >= 2 and sum(value > 0 for value in unique_sources.values()) < 2:
            source_diversity_pass = False
        anchor_set = set(merged)
        sets.append(anchor_set)
        brief_rows.append(
            {
                "anchor_count": len(anchor_set),
                "brief": row["brief"],
                "keyword_anchor_counts": counts,
                "max_keyword_anchors": max(counts.values(), default=0),
                "unique_anchor_contributions": unique_sources,
            }
        )

    overlaps = []
    for left in range(len(sets)):
        for right in range(left + 1, len(sets)):
            union = sets[left] | sets[right]
            overlaps.append(len(sets[left] & sets[right]) / len(union) if union else 1.0)
    mean_overlap = sum(overlaps) / len(overlaps)
    maximum_overlap = max(overlaps)
    gates = {
        "brief_anchor_count_at_least_64": all(row["anchor_count"] >= 64 for row in brief_rows),
        "brief_source_keyword_at_least_32": all(row["max_keyword_anchors"] >= 32 for row in brief_rows),
        "cross_brief_maximum_jaccard_at_most_0_80": maximum_overlap <= 0.80,
        "cross_brief_mean_jaccard_at_most_0_35": mean_overlap <= 0.35,
        "exact_111_keyword_inventory": exact_inventory,
        "every_keyword_has_anchor": keyword_nonempty,
        "multi_keyword_unique_source_diversity": source_diversity_pass,
    }
    report = {
        "briefs": brief_rows,
        "gates": gates,
        "keyword_anchor_counts": {keyword: len(by_keyword[keyword]) for keyword in sorted(by_keyword)},
        "maximum_brief_jaccard": maximum_overlap,
        "mean_brief_jaccard": mean_overlap,
        "passed": all(gates.values()),
        "snapshot_sha256": sha256(args.snapshot),
    }
    write_json(args.output, report)
    return 0 if all(gates.values()) else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"phase297 validate: {error}")
        raise SystemExit(1)
