#!/usr/bin/env python3
"""Run the frozen Phase 298 raw ConceptNet semantic preflight."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from collections import defaultdict
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import re
from typing import Iterable
from urllib.parse import unquote


SOURCE_BYTES = 497_963_447
SOURCE_SHA256 = "accd65fe94038584295574ddc26e1500c1919c8c4532bf771811cafd0948af7e"
KEYWORDS_SHA256 = "1f959c015efb9d49b1219b966f3ee464592fa62949c4b8804ce1f2fe2f692a6d"
RELATIONS = frozenset(
    f"/r/{name}"
    for name in (
        "RelatedTo",
        "IsA",
        "Synonym",
        "SimilarTo",
        "HasA",
        "PartOf",
        "UsedFor",
        "CapableOf",
        "HasProperty",
        "MannerOf",
        "DerivedFrom",
        "FormOf",
        "AtLocation",
        "Causes",
        "CreatedBy",
        "MadeOf",
        "ReceivesAction",
    )
)
INTERMEDIATE_PATTERN = re.compile(r"[a-z]{2,20}(?:_[a-z]{2,20}){0,2}")
ANCHOR_PATTERN = re.compile(r"[a-z]{3,16}")
MIN_WEIGHT = 1.0
DIRECT_LIMIT = 128
FINAL_LIMIT = 200
WORKING_HIGH_WATER = 8192
WORKING_RETAIN = 4096


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


@contextmanager
def gzip_text_writer(path: Path):
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as compressed:
            with io.TextIOWrapper(compressed, encoding="utf-8", newline="\n") as output:
                yield output


def write_jsonl_gzip(path: Path, rows: Iterable[object]) -> None:
    with gzip_text_writer(path) as output:
        for row in rows:
            output.write(canonical(row))


def load_briefs(path: Path) -> list[dict[str, object]]:
    if sha256(path) != KEYWORDS_SHA256:
        raise ValueError("canonical keyword evidence SHA-256 mismatch")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list) or len(value) != 35:
        raise ValueError("canonical brief inventory changed")
    keywords = {word for row in value for word in row.get("extracted", [])}
    if len(keywords) != 111 or not all(isinstance(word, str) for word in keywords):
        raise ValueError("canonical keyword inventory changed")
    return value


def concept_term(uri: str) -> str | None:
    pieces = uri.split("/")
    if len(pieces) < 4 or pieces[:3] != ["", "c", "en"]:
        return None
    term = unquote(pieces[3])
    if len(term) > 48 or not INTERMEDIATE_PATTERN.fullmatch(term):
        return None
    return term


def line_fields(line: str, line_number: int) -> tuple[str, str, str, str]:
    fields = line.rstrip("\n").split("\t")
    if len(fields) != 5:
        raise ValueError(f"ConceptNet line {line_number} does not have five fields")
    return fields[1], fields[2], fields[3], fields[4]


def metadata_weight(raw: str, line_number: int) -> float:
    value = json.loads(raw)
    weight = value.get("weight") if isinstance(value, dict) else None
    if not isinstance(weight, (int, float)) or not math.isfinite(float(weight)):
        raise ValueError(f"ConceptNet line {line_number} has invalid weight")
    return float(weight)


def strongest(values: dict[str, float], limit: int) -> dict[str, float]:
    return dict(sorted(values.items(), key=lambda item: (-item[1], item[0]))[:limit])


def first_pass(
    source: Path, declared: set[str]
) -> tuple[dict[str, dict[str, float]], dict[str, int]]:
    direct: dict[str, dict[str, float]] = {keyword: {} for keyword in sorted(declared)}
    lines = 0
    relevant = 0
    with gzip.open(source, "rt", encoding="utf-8", newline="") as handle:
        for lines, line in enumerate(handle, 1):
            relation, start_uri, end_uri, metadata = line_fields(line, lines)
            if lines % 5_000_000 == 0:
                print(f"phase298 pass1 lines={lines}", flush=True)
            if relation not in RELATIONS:
                continue
            start = concept_term(start_uri)
            end = concept_term(end_uri)
            if start is None or end is None:
                continue
            queries = []
            if start in declared and end != start:
                queries.append((start, end))
            if end in declared and start != end:
                queries.append((end, start))
            if not queries:
                continue
            weight = metadata_weight(metadata, lines)
            if weight < MIN_WEIGHT:
                continue
            relevant += 1
            for keyword, neighbor in queries:
                direct[keyword][neighbor] = max(direct[keyword].get(neighbor, 0.0), weight)
    return (
        {keyword: strongest(values, DIRECT_LIMIT) for keyword, values in direct.items()},
        {"lines": lines, "relevant_edges": relevant},
    )


def prune_scores(values: dict[str, tuple[float, int]]) -> None:
    if len(values) <= WORKING_HIGH_WATER:
        return
    keep = sorted(values.items(), key=lambda item: (-item[1][0], item[0]))[:WORKING_RETAIN]
    values.clear()
    values.update(keep)


def update_score(
    values: dict[str, tuple[float, int]], term: str, score: float, depth: int
) -> None:
    previous = values.get(term)
    if previous is None or score > previous[0] or (score == previous[0] and depth < previous[1]):
        values[term] = (score, depth)
        prune_scores(values)


def second_pass(
    source: Path,
    declared: set[str],
    direct: dict[str, dict[str, float]],
) -> tuple[dict[str, list[dict[str, object]]], dict[str, int]]:
    intermediate_sources: defaultdict[str, list[tuple[str, float]]] = defaultdict(list)
    scores: dict[str, dict[str, tuple[float, int]]] = {
        keyword: {} for keyword in sorted(declared)
    }
    for keyword, neighbors in direct.items():
        for term, weight in neighbors.items():
            intermediate_sources[term].append((keyword, weight))
            if ANCHOR_PATTERN.fullmatch(term) and term != keyword:
                update_score(scores[keyword], term, weight, 1)
    for term in intermediate_sources:
        intermediate_sources[term].sort()

    lines = 0
    relevant = 0
    with gzip.open(source, "rt", encoding="utf-8", newline="") as handle:
        for lines, line in enumerate(handle, 1):
            relation, start_uri, end_uri, metadata = line_fields(line, lines)
            if lines % 5_000_000 == 0:
                print(f"phase298 pass2 lines={lines}", flush=True)
            if relation not in RELATIONS:
                continue
            start = concept_term(start_uri)
            end = concept_term(end_uri)
            if start is None or end is None:
                continue
            paths: list[tuple[str, str]] = []
            if start in intermediate_sources and ANCHOR_PATTERN.fullmatch(end):
                paths.append((start, end))
            if end in intermediate_sources and ANCHOR_PATTERN.fullmatch(start):
                paths.append((end, start))
            if not paths:
                continue
            weight = metadata_weight(metadata, lines)
            if weight < MIN_WEIGHT:
                continue
            relevant += 1
            for intermediate, anchor in paths:
                for keyword, first_weight in intermediate_sources[intermediate]:
                    if anchor != keyword:
                        update_score(
                            scores[keyword],
                            anchor,
                            0.5 * min(first_weight, weight),
                            2,
                        )

    result = {}
    for keyword, values in scores.items():
        ordered = sorted(values.items(), key=lambda item: (-item[1][0], item[0]))[:FINAL_LIMIT]
        result[keyword] = [
            {"depth": depth, "score": score, "term": term}
            for term, (score, depth) in ordered
        ]
    return result, {"lines": lines, "relevant_edges": relevant}


def evaluate(
    briefs: list[dict[str, object]],
    by_keyword: dict[str, list[dict[str, object]]],
) -> dict[str, object]:
    brief_rows = []
    anchor_sets = []
    source_diversity = True
    for row in briefs:
        keywords = [str(value) for value in row["extracted"]]
        source_sets = {
            keyword: {str(anchor["term"]) for anchor in by_keyword[keyword]}
            for keyword in keywords
        }
        merged = set().union(*source_sets.values()) if source_sets else set()
        anchor_sets.append(merged)
        unique_counts = {
            keyword: len(values - set().union(*(other for key, other in source_sets.items() if key != keyword)))
            for keyword, values in source_sets.items()
        }
        if len(keywords) >= 2 and sum(count > 0 for count in unique_counts.values()) < 2:
            source_diversity = False
        counts = {keyword: len(values) for keyword, values in source_sets.items()}
        brief_rows.append(
            {
                "anchor_count": len(merged),
                "brief": row["brief"],
                "keyword_anchor_counts": counts,
                "max_keyword_anchors": max(counts.values(), default=0),
                "unique_anchor_contributions": unique_counts,
            }
        )

    overlaps = []
    for left in range(len(anchor_sets)):
        for right in range(left + 1, len(anchor_sets)):
            union = anchor_sets[left] | anchor_sets[right]
            overlaps.append(
                len(anchor_sets[left] & anchor_sets[right]) / len(union) if union else 1.0
            )
    mean_overlap = sum(overlaps) / len(overlaps)
    maximum_overlap = max(overlaps)
    all_anchors = [anchor for values in by_keyword.values() for anchor in values]
    valid_scores = sum(
        isinstance(anchor["score"], (int, float))
        and math.isfinite(float(anchor["score"]))
        and float(anchor["score"]) > 0.0
        for anchor in all_anchors
    )
    gates = {
        "brief_anchor_count_at_least_64": all(row["anchor_count"] >= 64 for row in brief_rows),
        "brief_source_keyword_at_least_32": all(row["max_keyword_anchors"] >= 32 for row in brief_rows),
        "cross_brief_maximum_jaccard_at_most_0_80": maximum_overlap <= 0.80,
        "cross_brief_mean_jaccard_at_most_0_35": mean_overlap <= 0.35,
        "exact_111_keyword_inventory": len(by_keyword) == 111,
        "every_keyword_has_anchor": all(by_keyword.values()),
        "multi_keyword_unique_source_diversity": source_diversity,
        "valid_positive_score_rate_at_least_95pct": valid_scores / len(all_anchors) >= 0.95,
    }
    return {
        "briefs": brief_rows,
        "gates": gates,
        "keyword_anchor_counts": {
            keyword: len(by_keyword[keyword]) for keyword in sorted(by_keyword)
        },
        "maximum_brief_jaccard": maximum_overlap,
        "mean_brief_jaccard": mean_overlap,
        "passed": all(gates.values()),
        "retained_keyword_anchors": len(all_anchors),
    }


def artifact_manifest(output: Path, state: str) -> dict[str, object]:
    artifacts = {}
    for path in sorted(output.iterdir(), key=lambda item: item.name):
        if path.is_file() and path.name != "manifest.json":
            artifacts[path.name] = {"bytes": path.stat().st_size, "sha256": sha256(path)}
    return {
        "artifacts": artifacts,
        "phase": 298,
        "source_bytes": SOURCE_BYTES,
        "source_sha256": SOURCE_SHA256,
        "state": state,
    }


def main() -> int:
    root = Path(__file__).resolve().parent
    repository = root.parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument(
        "--keywords",
        type=Path,
        default=repository / "research" / "holistic" / "work" / "dataset-final" / "canonical-keyword-coverage.json",
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError(f"output directory is not empty: {args.output}")
    if args.source.stat().st_size != SOURCE_BYTES or sha256(args.source) != SOURCE_SHA256:
        raise ValueError("ConceptNet bulk source identity mismatch")
    args.output.mkdir(parents=True, exist_ok=True)

    briefs = load_briefs(args.keywords)
    declared = {str(word) for row in briefs for word in row["extracted"]}
    direct, pass1 = first_pass(args.source, declared)
    anchors_by_keyword, pass2 = second_pass(args.source, declared, direct)
    write_jsonl_gzip(
        args.output / "keyword-anchors.jsonl.gz",
        (
            {"anchors": anchors_by_keyword[keyword], "keyword": keyword}
            for keyword in sorted(anchors_by_keyword)
        ),
    )
    report = evaluate(briefs, anchors_by_keyword)
    report["pass1"] = pass1
    report["pass2"] = pass2
    report["source_sha256"] = SOURCE_SHA256
    write_json(args.output / "report.json", report)
    state = "passed" if bool(report["passed"]) else "failed"
    write_json(args.output / "manifest.json", artifact_manifest(args.output, state))
    return 0 if bool(report["passed"]) else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError, gzip.BadGzipFile) as error:
        print(f"phase298: {error}")
        raise SystemExit(1)
