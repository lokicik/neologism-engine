#!/usr/bin/env python3
"""Run the frozen Phase 291 human-wordlikeness manifold experiment."""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import heapq
import json
import math
import random
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable, Sequence


PRODUCT_SHA256 = "dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6"
PSEUDOLEX_SHA256 = "70f4e7a92fc300ba609013a172db18fe04e44855b2162313ce2b8c57b7000289"
EXPECTED_COLUMNS = [
    "subjID",
    "gender",
    "birthYear",
    "vocabLevel",
    "cmu",
    "disc",
    "ortho",
    "length",
    "rating",
    "uniScore",
    "biScore",
    "triScore",
]
ELIGIBLE_RE = re.compile(r"[a-z]{4,12}\Z")
K_VALUES = (1, 3, 5, 10, 20)
ALPHABET = "abcdefghijklmnopqrstuvwxyz$"
PERMUTATIONS = 1000
PERMUTATION_SEED = 2912026


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_sha(path: Path, expected: str) -> None:
    actual = sha256_file(path)
    if actual != expected:
        raise ValueError(f"SHA-256 mismatch for {path}: {actual} != {expected}")


def canonical_bytes(value: object) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        + "\n"
    ).encode("utf-8")


def write_json(path: Path, value: object) -> None:
    path.write_bytes(canonical_bytes(value))


def write_jsonl(path: Path, rows: Iterable[object]) -> None:
    with path.open("wb") as handle:
        for row in rows:
            handle.write(canonical_bytes(row))


def fnv1a64(text: str) -> int:
    value = 14695981039346656037
    for byte in text.encode("utf-8"):
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
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root == right_root:
            return
        if self.rank[left_root] < self.rank[right_root]:
            left_root, right_root = right_root, left_root
        self.parent[right_root] = left_root
        if self.rank[left_root] == self.rank[right_root]:
            self.rank[left_root] += 1


def load_product_names(path: Path) -> list[str]:
    require_sha(path, PRODUCT_SHA256)
    names: list[str] = []
    with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
        for line_number, line in enumerate(handle, start=1):
            row = json.loads(line)
            if not isinstance(row, dict) or "name" not in row or "split" not in row:
                raise ValueError(f"invalid product row {line_number}")
            if row["split"] == "train":
                name = row["name"]
                if not isinstance(name, str) or not ELIGIBLE_RE.fullmatch(name):
                    raise ValueError(f"invalid train product name at row {line_number}")
                names.append(name)
    if len(names) != 10138 or len(set(names)) != 10138:
        raise ValueError(
            f"expected 10,138 unique train product names, got {len(names)} rows and "
            f"{len(set(names))} unique"
        )
    return sorted(names)


def inspect_pseudolex(path: Path) -> tuple[list[str], dict[str, list[str]], int, int]:
    """Read identities and spellings, deliberately ignoring the rating field."""
    require_sha(path, PSEUDOLEX_SHA256)
    subjects_by_item: dict[str, set[str]] = defaultdict(set)
    seen_pairs: set[tuple[str, str]] = set()
    all_subjects: set[str] = set()
    rows = 0
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != EXPECTED_COLUMNS:
            raise ValueError(f"unexpected PseudoLex columns: {reader.fieldnames}")
        for row_number, row in enumerate(reader, start=2):
            rows += 1
            item = row["ortho"]
            subject = row["subjID"]
            if not item or not subject:
                raise ValueError(f"missing item or subject at row {row_number}")
            pair = (item, subject)
            if pair in seen_pairs:
                raise ValueError(f"duplicate item/participant observation at row {row_number}")
            seen_pairs.add(pair)
            subjects_by_item[item].add(subject)
            all_subjects.add(subject)
    if rows != 201600:
        raise ValueError(f"expected 201,600 PseudoLex rows, got {rows}")
    if len(subjects_by_item) != 8400:
        raise ValueError(f"expected 8,400 PseudoLex items, got {len(subjects_by_item)}")
    if len(all_subjects) != 1440:
        raise ValueError(f"expected 1,440 participants, got {len(all_subjects)}")
    bad_counts = {item: len(ids) for item, ids in subjects_by_item.items() if len(ids) != 24}
    if bad_counts:
        raise ValueError(f"items without exactly 24 distinct participants: {bad_counts}")
    eligible = sorted(item for item in subjects_by_item if ELIGIBLE_RE.fullmatch(item))
    if len(eligible) < 7000:
        raise ValueError(f"only {len(eligible)} eligible items; at least 7,000 required")
    subject_lists = {item: sorted(subjects_by_item[item]) for item in eligible}
    return eligible, subject_lists, rows, len(all_subjects)


def build_families(items: Sequence[str]) -> list[list[str]]:
    index = {item: position for position, item in enumerate(items)}
    dsu = DisjointSet(len(items))

    substitution_buckets: dict[tuple[int, int, str], int] = {}
    for position, item in enumerate(items):
        for character_index in range(len(item)):
            signature = (
                len(item),
                character_index,
                item[:character_index] + item[character_index + 1 :],
            )
            previous = substitution_buckets.get(signature)
            if previous is None:
                substitution_buckets[signature] = position
            else:
                dsu.union(position, previous)

        for character_index in range(len(item)):
            shorter = item[:character_index] + item[character_index + 1 :]
            shorter_position = index.get(shorter)
            if shorter_position is not None:
                dsu.union(position, shorter_position)

    components: dict[int, list[str]] = defaultdict(list)
    for position, item in enumerate(items):
        components[dsu.find(position)].append(item)
    families = [sorted(members) for members in components.values()]
    families.sort(key=lambda members: (fnv1a64(members[0]), members[0]))
    return families


def split_families(families: Sequence[Sequence[str]], item_count: int) -> dict[str, str]:
    development_limit = math.floor(item_count * 0.60)
    validation_limit = math.floor(item_count * 0.20)
    development_count = 0
    validation_count = 0
    phase = "development"
    assignment: dict[str, str] = {}

    for members in families:
        family_size = len(members)
        if phase == "development" and development_count + family_size > development_limit:
            phase = "validation"
        if phase == "validation" and validation_count + family_size > validation_limit:
            phase = "test"
        for item in members:
            assignment[item] = phase
        if phase == "development":
            development_count += family_size
        elif phase == "validation":
            validation_count += family_size
    if len(assignment) != item_count:
        raise AssertionError("split omitted items")
    return assignment


def grams(name: str) -> Counter[str]:
    bounded = f"^{name}$"
    counts: Counter[str] = Counter()
    for width in (2, 3, 4):
        counts.update(bounded[offset : offset + width] for offset in range(len(bounded) - width + 1))
    return counts


def build_product_index(
    names: Sequence[str],
) -> tuple[dict[str, float], dict[str, list[tuple[int, float]]]]:
    document_frequency: Counter[str] = Counter()
    term_counts: list[Counter[str]] = []
    for name in names:
        counts = grams(name)
        term_counts.append(counts)
        document_frequency.update(counts.keys())

    total = len(names)
    idf = {
        gram: math.log((total + 1) / (frequency + 1)) + 1.0
        for gram, frequency in sorted(document_frequency.items())
    }
    postings: dict[str, list[tuple[int, float]]] = defaultdict(list)
    for document_id, counts in enumerate(term_counts):
        weighted = {gram: count * idf[gram] for gram, count in counts.items()}
        norm = math.sqrt(sum(value * value for value in weighted.values()))
        if norm == 0.0:
            raise ValueError(f"zero product vector for {names[document_id]}")
        for gram, value in weighted.items():
            postings[gram].append((document_id, value / norm))
    return idf, dict(postings)


def manifold_scores(
    name: str,
    idf: dict[str, float],
    postings: dict[str, list[tuple[int, float]]],
) -> dict[int, float]:
    counts = grams(name)
    weighted = {gram: count * idf[gram] for gram, count in counts.items() if gram in idf}
    norm = math.sqrt(sum(value * value for value in weighted.values()))
    similarities: defaultdict[int, float] = defaultdict(float)
    if norm > 0.0:
        for gram, value in weighted.items():
            query_weight = value / norm
            for document_id, document_weight in postings[gram]:
                similarities[document_id] += query_weight * document_weight
    nearest = heapq.nlargest(max(K_VALUES), similarities.values())
    nearest.extend([0.0] * (max(K_VALUES) - len(nearest)))
    prefix: list[float] = []
    running = 0.0
    for value in nearest:
        running += value
        prefix.append(running)
    return {k: prefix[k - 1] / k for k in K_VALUES}


def build_markov(names: Sequence[str]) -> tuple[dict[str, Counter[str]], Counter[str]]:
    transitions: dict[str, Counter[str]] = defaultdict(Counter)
    context_totals: Counter[str] = Counter()
    for name in names:
        sequence = f"^^{name}$"
        for offset in range(2, len(sequence)):
            context = sequence[offset - 2 : offset]
            character = sequence[offset]
            transitions[context][character] += 1
            context_totals[context] += 1
    return dict(transitions), context_totals


def markov_score(
    name: str, transitions: dict[str, Counter[str]], context_totals: Counter[str]
) -> float:
    sequence = f"^^{name}$"
    total_logp = 0.0
    predictions = 0
    for offset in range(2, len(sequence)):
        context = sequence[offset - 2 : offset]
        character = sequence[offset]
        count = transitions.get(context, Counter()).get(character, 0)
        denominator = context_totals.get(context, 0) + 0.1 * len(ALPHABET)
        total_logp += math.log((count + 0.1) / denominator)
        predictions += 1
    return total_logp / predictions


def aggregate_ratings(path: Path, wanted: set[str]) -> dict[str, float]:
    totals: defaultdict[str, int] = defaultdict(int)
    counts: Counter[str] = Counter()
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != EXPECTED_COLUMNS:
            raise ValueError("PseudoLex schema changed between passes")
        for row_number, row in enumerate(reader, start=2):
            item = row["ortho"]
            if item not in wanted:
                continue
            try:
                rating = int(row["rating"])
            except ValueError as error:
                raise ValueError(f"non-integer rating at row {row_number}") from error
            if rating < 1 or rating > 5:
                raise ValueError(f"out-of-range rating at row {row_number}")
            totals[item] += rating
            counts[item] += 1
    if set(totals) != wanted:
        raise ValueError("rating aggregation omitted requested items")
    if any(counts[item] != 24 for item in wanted):
        raise ValueError("rating aggregation did not retain 24 observations per item")
    return {item: totals[item] / counts[item] for item in sorted(wanted)}


def rankdata(values: Sequence[float]) -> list[float]:
    order = sorted(range(len(values)), key=lambda index: (values[index], index))
    ranks = [0.0] * len(values)
    start = 0
    while start < len(order):
        end = start + 1
        while end < len(order) and values[order[end]] == values[order[start]]:
            end += 1
        average_rank = (start + 1 + end) / 2.0
        for offset in range(start, end):
            ranks[order[offset]] = average_rank
        start = end
    return ranks


def pearson(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) != len(right) or len(left) < 2:
        raise ValueError("correlation requires equal vectors with at least two values")
    left_mean = sum(left) / len(left)
    right_mean = sum(right) / len(right)
    numerator = sum((x - left_mean) * (y - right_mean) for x, y in zip(left, right))
    left_ss = sum((x - left_mean) ** 2 for x in left)
    right_ss = sum((y - right_mean) ** 2 for y in right)
    denominator = math.sqrt(left_ss * right_ss)
    if denominator == 0.0:
        raise ValueError("correlation is undefined for a constant vector")
    return numerator / denominator


def residualize(values: Sequence[float], lengths: Sequence[int]) -> list[float]:
    value_mean = sum(values) / len(values)
    length_mean = sum(lengths) / len(lengths)
    denominator = sum((length - length_mean) ** 2 for length in lengths)
    slope = (
        sum((length - length_mean) * (value - value_mean) for value, length in zip(values, lengths))
        / denominator
        if denominator > 0.0
        else 0.0
    )
    intercept = value_mean - slope * length_mean
    return [value - intercept - slope * length for value, length in zip(values, lengths)]


def correlations(
    scores: Sequence[float], ratings: Sequence[float], lengths: Sequence[int]
) -> dict[str, float]:
    score_ranks = rankdata(scores)
    rating_ranks = rankdata(ratings)
    return {
        "controlled_spearman": pearson(
            residualize(score_ranks, lengths), residualize(rating_ranks, lengths)
        ),
        "raw_spearman": pearson(score_ranks, rating_ranks),
    }


def evaluate_partition(
    items: Sequence[str],
    ratings: dict[str, float],
    all_scores: dict[str, dict[str, object]],
    key: str,
) -> dict[str, float]:
    score_values = [float(all_scores[item][key]) for item in items]
    rating_values = [ratings[item] for item in items]
    lengths = [len(item) for item in items]
    return correlations(score_values, rating_values, lengths)


def permutation_p_value(
    test_items: Sequence[str],
    test_ratings: dict[str, float],
    selected_scores: Sequence[float],
    family_for_item: dict[str, str],
    observed: float,
) -> float:
    score_residuals = residualize(rankdata(selected_scores), [len(item) for item in test_items])
    original_rating_ranks = rankdata([test_ratings[item] for item in test_items])
    index_by_item = {item: index for index, item in enumerate(test_items)}
    family_members: dict[str, list[str]] = defaultdict(list)
    for item in test_items:
        family_members[family_for_item[item]].append(item)
    for members in family_members.values():
        members.sort()

    families_by_size: dict[int, list[str]] = defaultdict(list)
    rating_vectors: dict[str, list[float]] = {}
    for family_id, members in family_members.items():
        families_by_size[len(members)].append(family_id)
        rating_vectors[family_id] = [original_rating_ranks[index_by_item[item]] for item in members]
    for family_ids in families_by_size.values():
        family_ids.sort()

    rng = random.Random(PERMUTATION_SEED)
    wins = 0
    lengths = [len(item) for item in test_items]
    for _ in range(PERMUTATIONS):
        permuted_ranks = [0.0] * len(test_items)
        for family_ids in families_by_size.values():
            sources = list(family_ids)
            rng.shuffle(sources)
            for destination, source in zip(family_ids, sources):
                destination_members = family_members[destination]
                source_values = rating_vectors[source]
                for item, value in zip(destination_members, source_values):
                    permuted_ranks[index_by_item[item]] = value
        permuted = pearson(score_residuals, residualize(permuted_ranks, lengths))
        if permuted >= observed:
            wins += 1
    return (wins + 1) / (PERMUTATIONS + 1)


def artifact_manifest(output: Path, state: str) -> dict[str, object]:
    files: dict[str, dict[str, object]] = {}
    for path in sorted(output.iterdir(), key=lambda item: item.name):
        if path.is_file() and path.name != "manifest.json":
            files[path.name] = {"bytes": path.stat().st_size, "sha256": sha256_file(path)}
    return {
        "artifacts": files,
        "phase": 291,
        "state": state,
    }


def parse_args() -> argparse.Namespace:
    research_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--product-dataset",
        type=Path,
        default=research_dir.parent / "holistic" / "work" / "dataset-final" / "dataset.jsonl.gz",
    )
    parser.add_argument(
        "--pseudolex",
        type=Path,
        default=research_dir / "source" / "pseudoLex_share1.csv",
    )
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output = args.output.resolve()
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"output directory is not empty: {output}")
    output.mkdir(parents=True, exist_ok=True)

    product_names = load_product_names(args.product_dataset.resolve())
    items, subjects_by_item, source_rows, participant_count = inspect_pseudolex(
        args.pseudolex.resolve()
    )
    families = build_families(items)
    assignment = split_families(families, len(items))
    family_for_item: dict[str, str] = {}
    family_rows: list[dict[str, object]] = []
    for members in families:
        family_id = f"{fnv1a64(members[0]):016x}:{members[0]}"
        split = assignment[members[0]]
        if any(assignment[item] != split for item in members):
            raise AssertionError("family crossed partitions")
        family_rows.append({"family_id": family_id, "items": list(members), "split": split})
        for item in members:
            family_for_item[item] = family_id

    eligible_rows = [
        {
            "family_id": family_for_item[item],
            "item": item,
            "length": len(item),
            "participant_count": len(subjects_by_item[item]),
            "split": assignment[item],
        }
        for item in items
    ]
    write_jsonl(output / "eligible.jsonl", eligible_rows)
    write_jsonl(output / "families.jsonl", family_rows)

    idf, postings = build_product_index(product_names)
    write_json(output / "idf.json", idf)
    markov_transitions, markov_totals = build_markov(product_names)

    all_scores: dict[str, dict[str, object]] = {}
    score_rows: list[dict[str, object]] = []
    for item in items:
        neighbor_scores = manifold_scores(item, idf, postings)
        row: dict[str, object] = {
            "item": item,
            "markov": markov_score(item, markov_transitions, markov_totals),
        }
        for k in K_VALUES:
            row[f"knn_{k}"] = neighbor_scores[k]
        all_scores[item] = row
        score_rows.append(row)
    write_jsonl(output / "scores.jsonl", score_rows)

    split_counts = Counter(assignment.values())
    data_report = {
        "eligible_items": len(items),
        "families": len(families),
        "participants": participant_count,
        "product_train_names": len(product_names),
        "source_rows": source_rows,
        "split_counts": dict(sorted(split_counts.items())),
    }
    write_json(output / "data-report.json", data_report)

    non_test_items = {item for item in items if assignment[item] != "test"}
    development_ratings = aggregate_ratings(args.pseudolex.resolve(), non_test_items)
    validation_items = sorted(item for item in items if assignment[item] == "validation")
    validation_by_k: dict[str, dict[str, float]] = {}
    for k in K_VALUES:
        validation_by_k[str(k)] = evaluate_partition(
            validation_items, development_ratings, all_scores, f"knn_{k}"
        )
    selected_k = max(
        K_VALUES,
        key=lambda k: (
            validation_by_k[str(k)]["controlled_spearman"],
            validation_by_k[str(k)]["raw_spearman"],
            -k,
        ),
    )
    selected_metrics = validation_by_k[str(selected_k)]
    markov_validation = evaluate_partition(
        validation_items, development_ratings, all_scores, "markov"
    )
    controlled_uplift = (
        selected_metrics["controlled_spearman"]
        - markov_validation["controlled_spearman"]
    )
    validation_pass = (
        selected_metrics["raw_spearman"] >= 0.25
        and selected_metrics["controlled_spearman"] >= 0.20
        and controlled_uplift >= 0.05
    )
    validation_report = {
        "baseline": markov_validation,
        "controlled_uplift": controlled_uplift,
        "gates": {
            "controlled_spearman_at_least_0_20": selected_metrics["controlled_spearman"] >= 0.20,
            "controlled_uplift_at_least_0_05": controlled_uplift >= 0.05,
            "raw_spearman_at_least_0_25": selected_metrics["raw_spearman"] >= 0.25,
        },
        "knn_by_k": validation_by_k,
        "passed": validation_pass,
        "selected_k": selected_k,
        "selected_metrics": selected_metrics,
        "validation_items": len(validation_items),
    }
    write_json(output / "validation-report.json", validation_report)

    if not validation_pass:
        write_json(output / "manifest.json", artifact_manifest(output, "validation_failed"))
        return 2

    test_items = sorted(item for item in items if assignment[item] == "test")
    test_ratings = aggregate_ratings(args.pseudolex.resolve(), set(test_items))
    selected_test = evaluate_partition(test_items, test_ratings, all_scores, f"knn_{selected_k}")
    markov_test = evaluate_partition(test_items, test_ratings, all_scores, "markov")
    test_uplift = selected_test["controlled_spearman"] - markov_test["controlled_spearman"]

    buckets: dict[str, dict[str, object]] = {}
    for label, minimum, maximum in (("4-6", 4, 6), ("7-9", 7, 9), ("10-12", 10, 12)):
        bucket_items = [item for item in test_items if minimum <= len(item) <= maximum]
        bucket: dict[str, object] = {"items": len(bucket_items), "required": len(bucket_items) >= 200}
        if len(bucket_items) >= 2:
            bucket.update(
                evaluate_partition(bucket_items, test_ratings, all_scores, f"knn_{selected_k}")
            )
        bucket["passed"] = (
            not bucket["required"] or float(bucket["controlled_spearman"]) > 0.0
        )
        buckets[label] = bucket

    selected_score_values = [float(all_scores[item][f"knn_{selected_k}"]) for item in test_items]
    permutation_p = permutation_p_value(
        test_items,
        test_ratings,
        selected_score_values,
        family_for_item,
        selected_test["controlled_spearman"],
    )
    test_pass = (
        selected_test["raw_spearman"] >= 0.25
        and selected_test["controlled_spearman"] >= 0.20
        and test_uplift >= 0.05
        and permutation_p <= 0.01
        and all(bool(bucket["passed"]) for bucket in buckets.values())
    )
    test_report = {
        "baseline": markov_test,
        "controlled_uplift": test_uplift,
        "gates": {
            "controlled_spearman_at_least_0_20": selected_test["controlled_spearman"] >= 0.20,
            "controlled_uplift_at_least_0_05": test_uplift >= 0.05,
            "length_buckets_positive": all(bool(bucket["passed"]) for bucket in buckets.values()),
            "permutation_p_at_most_0_01": permutation_p <= 0.01,
            "raw_spearman_at_least_0_25": selected_test["raw_spearman"] >= 0.25,
        },
        "length_buckets": buckets,
        "passed": test_pass,
        "permutation": {
            "count": PERMUTATIONS,
            "family_preserving": True,
            "one_sided_p": permutation_p,
            "seed": PERMUTATION_SEED,
        },
        "selected_k": selected_k,
        "selected_metrics": selected_test,
        "test_items": len(test_items),
    }
    write_json(output / "test-report.json", test_report)
    state = "test_passed" if test_pass else "test_failed"
    write_json(output / "manifest.json", artifact_manifest(output, state))
    return 0 if test_pass else 3


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, AssertionError, json.JSONDecodeError) as error:
        print(f"phase291: {error}", file=sys.stderr)
        raise SystemExit(1)
