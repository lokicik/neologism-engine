#!/usr/bin/env python3
"""Run the frozen Phase 295 retrieval-conditioned name-model experiment."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from contextlib import contextmanager
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import random
from typing import Iterable, Sequence


RECORDS_SHA256 = "daec41e23fbafa817c8fc3e3882d2dc0f45af5e50166e0a9cb85355a619f0d0f"
K_VALUES = (16, 32, 64)
ALPHAS = (0.15, 0.25, 0.35)
SYMBOLS = "abcdefghijklmnopqrstuvwxyz$"
SMOOTHING = 0.1
BOOTSTRAPS = 2000
BOOTSTRAP_SEED = 2952026


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


def write_json_gzip(path: Path, value: object) -> None:
    with gzip_text_writer(path) as output:
        output.write(canonical(value))


def write_jsonl_gzip(path: Path, rows: Iterable[object]) -> None:
    with gzip_text_writer(path) as output:
        for row in rows:
            output.write(canonical(row))


def fnv1a64(text: str) -> int:
    value = 14695981039346656037
    for byte in text.encode("ascii"):
        value ^= byte
        value = (value * 1099511628211) & 0xFFFFFFFFFFFFFFFF
    return value


def load_records(path: Path) -> list[dict[str, object]]:
    if sha256(path) != RECORDS_SHA256:
        raise ValueError("normalized-record SHA-256 mismatch")
    records: list[dict[str, object]] = []
    with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
        for line_number, line in enumerate(handle, 1):
            record = json.loads(line)
            if record.get("split") not in {"train", "validation", "test"}:
                raise ValueError(f"invalid split on line {line_number}")
            if not isinstance(record.get("features"), list) or not record["features"]:
                raise ValueError(f"invalid features on line {line_number}")
            records.append(record)
    counts = Counter(str(record["split"]) for record in records)
    expected = {"train": 48224, "validation": 3290, "test": 3322}
    if dict(counts) != expected:
        raise ValueError(f"record counts changed: {dict(counts)} != {expected}")
    return records


def sparse_vector(features: Sequence[str], idf: dict[str, float]) -> dict[str, float]:
    counts = Counter(features)
    weighted = {
        feature: (1.0 + math.log(count)) * idf[feature]
        for feature, count in counts.items()
        if feature in idf
    }
    norm = math.sqrt(sum(value * value for value in weighted.values()))
    if norm == 0.0:
        return {}
    return {feature: weighted[feature] / norm for feature in sorted(weighted)}


def build_tfidf(
    train: Sequence[dict[str, object]],
) -> tuple[dict[str, float], dict[str, list[tuple[int, float]]]]:
    document_frequency: Counter[str] = Counter()
    for record in train:
        document_frequency.update(set(str(value) for value in record["features"]))
    total = len(train)
    idf = {
        feature: math.log((total + 1) / (frequency + 1)) + 1.0
        for feature, frequency in sorted(document_frequency.items())
    }
    postings: dict[str, list[tuple[int, float]]] = defaultdict(list)
    for index, record in enumerate(train):
        vector = sparse_vector([str(value) for value in record["features"]], idf)
        if not vector:
            raise ValueError(f"zero train vector: {record['name']}")
        for feature, weight in vector.items():
            postings[feature].append((index, weight))
    return idf, dict(postings)


def retrieve(
    record: dict[str, object],
    train: Sequence[dict[str, object]],
    idf: dict[str, float],
    postings: dict[str, list[tuple[int, float]]],
) -> list[tuple[int, float]]:
    query = sparse_vector([str(value) for value in record["features"]], idf)
    similarities: defaultdict[int, float] = defaultdict(float)
    for feature in sorted(query):
        query_weight = query[feature]
        for index, document_weight in postings.get(feature, ()):
            similarities[index] += query_weight * document_weight
    positive = [(index, value) for index, value in similarities.items() if value > 0.0]
    positive.sort(
        key=lambda item: (
            -item[1],
            str(train[item[0]]["name"]),
            int(train[item[0]]["id"]),
        )
    )
    return positive[: max(K_VALUES)]


class CharModel:
    def __init__(self) -> None:
        self.counts: dict[str, list[float]] = {}
        self.totals: defaultdict[str, float] = defaultdict(float)

    def add(self, name: str, weight: float = 1.0) -> None:
        sequence = f"^^{name}$"
        for offset in range(2, len(sequence)):
            context = sequence[offset - 2 : offset]
            symbol = sequence[offset]
            values = self.counts.setdefault(context, [0.0] * len(SYMBOLS))
            values[SYMBOLS.index(symbol)] += weight
            self.totals[context] += weight

    def probability(self, context: str, symbol: str) -> float:
        values = self.counts.get(context)
        count = values[SYMBOLS.index(symbol)] if values is not None else 0.0
        return (count + SMOOTHING) / (
            self.totals.get(context, 0.0) + SMOOTHING * len(SYMBOLS)
        )


def local_model(
    neighbors: Sequence[tuple[int, float]],
    train: Sequence[dict[str, object]],
    k: int,
) -> CharModel:
    model = CharModel()
    for index, similarity in neighbors[:k]:
        model.add(str(train[index]["name"]), similarity)
    return model


def name_nll(name: str, global_model: CharModel, local: CharModel | None, alpha: float) -> float:
    sequence = f"^^{name}$"
    total = 0.0
    predictions = 0
    for offset in range(2, len(sequence)):
        context = sequence[offset - 2 : offset]
        symbol = sequence[offset]
        global_probability = global_model.probability(context, symbol)
        local_probability = local.probability(context, symbol) if local is not None else 0.0
        probability = (
            global_probability
            if local is None
            else (1.0 - alpha) * global_probability + alpha * local_probability
        )
        total -= math.log(probability)
        predictions += 1
    return total / predictions


def ordered_partition(
    records: Sequence[dict[str, object]], split: str
) -> list[dict[str, object]]:
    selected = [record for record in records if record["split"] == split]
    selected.sort(key=lambda record: (fnv1a64(str(record["name"])), str(record["name"]), int(record["id"])))
    return selected[:10_000]


def retrieval_rows(
    evaluation: Sequence[dict[str, object]],
    train: Sequence[dict[str, object]],
    all_neighbors: Sequence[Sequence[tuple[int, float]]],
) -> Iterable[dict[str, object]]:
    for record, neighbors in zip(evaluation, all_neighbors):
        yield {
            "component": record["component"],
            "id": record["id"],
            "name": record["name"],
            "neighbors": [
                {
                    "id": train[index]["id"],
                    "name": train[index]["name"],
                    "similarity": similarity,
                }
                for index, similarity in neighbors
            ],
        }


def bootstrap_lower(
    evaluation: Sequence[dict[str, object]], improvements: Sequence[float]
) -> float:
    grouped: dict[str, list[float]] = defaultdict(list)
    for record, improvement in zip(evaluation, improvements):
        grouped[str(record["component"])].append(improvement)
    component_ids = sorted(grouped)
    rng = random.Random(BOOTSTRAP_SEED)
    estimates: list[float] = []
    for _ in range(BOOTSTRAPS):
        total = 0.0
        count = 0
        for _ in component_ids:
            sampled = component_ids[rng.randrange(len(component_ids))]
            values = grouped[sampled]
            total += sum(values)
            count += len(values)
        estimates.append(total / count)
    estimates.sort()
    return estimates[math.floor(0.005 * BOOTSTRAPS)]


def evaluate_grid(
    evaluation: Sequence[dict[str, object]],
    train: Sequence[dict[str, object]],
    neighbors: Sequence[Sequence[tuple[int, float]]],
    global_model: CharModel,
) -> tuple[dict[str, dict[str, object]], dict[tuple[int, float], list[float]], list[float]]:
    global_nll = [name_nll(str(record["name"]), global_model, None, 0.0) for record in evaluation]
    grid: dict[str, dict[str, object]] = {}
    score_vectors: dict[tuple[int, float], list[float]] = {}
    condition_count = min(2000, len(evaluation))
    for k in K_VALUES:
        locals_for_all = [local_model(row, train, k) for row in neighbors]
        coverage = sum(len(row) >= k for row in neighbors) / len(neighbors)
        for alpha in ALPHAS:
            conditional = [
                name_nll(str(record["name"]), global_model, local, alpha)
                for record, local in zip(evaluation, locals_for_all)
            ]
            wins = 0
            comparisons = 0
            for index in range(condition_count):
                name = str(evaluation[index]["name"])
                real_nll = conditional[index]
                for offset in range(1, 10):
                    wrong_index = (index + offset) % condition_count
                    wrong_nll = name_nll(name, global_model, locals_for_all[wrong_index], alpha)
                    wins += real_nll < wrong_nll
                    comparisons += 1
            mean_global = sum(global_nll) / len(global_nll)
            mean_conditional = sum(conditional) / len(conditional)
            key = f"k{k}-a{alpha:.2f}"
            grid[key] = {
                "alpha": alpha,
                "condition_comparisons": comparisons,
                "condition_win_rate": wins / comparisons,
                "conditional_nll": mean_conditional,
                "full_neighbor_coverage": coverage,
                "global_nll": mean_global,
                "k": k,
                "nll_improvement": (mean_global - mean_conditional) / mean_global,
            }
            score_vectors[(k, alpha)] = conditional
    return grid, score_vectors, global_nll


def selected_key(grid: dict[str, dict[str, object]]) -> tuple[str, dict[str, object]]:
    return min(
        grid.items(),
        key=lambda item: (
            float(item[1]["conditional_nll"]),
            -float(item[1]["condition_win_rate"]),
            float(item[1]["alpha"]),
            int(item[1]["k"]),
        ),
    )


def artifact_manifest(output: Path, state: str) -> dict[str, object]:
    artifacts = {}
    for path in sorted(output.iterdir(), key=lambda item: item.name):
        if path.is_file() and path.name != "manifest.json":
            artifacts[path.name] = {"bytes": path.stat().st_size, "sha256": sha256(path)}
    return {"artifacts": artifacts, "phase": 295, "state": state}


def main() -> int:
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--records", type=Path, default=root / "work" / "prepared-v3" / "records.jsonl.gz"
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError(f"output directory is not empty: {args.output}")
    args.output.mkdir(parents=True, exist_ok=True)

    records = load_records(args.records)
    train = [record for record in records if record["split"] == "train"]
    train.sort(key=lambda record: (str(record["name"]), int(record["id"])))
    idf, postings = build_tfidf(train)
    write_json_gzip(args.output / "idf.json.gz", idf)
    global_model = CharModel()
    for record in train:
        global_model.add(str(record["name"]))

    validation = ordered_partition(records, "validation")
    validation_neighbors = [retrieve(record, train, idf, postings) for record in validation]
    write_jsonl_gzip(
        args.output / "validation-retrieval.jsonl.gz",
        retrieval_rows(validation, train, validation_neighbors),
    )
    grid, score_vectors, global_scores = evaluate_grid(
        validation, train, validation_neighbors, global_model
    )
    selection_name, selection = selected_key(grid)
    selected_pair = (int(selection["k"]), float(selection["alpha"]))
    selected_scores = score_vectors[selected_pair]
    improvements = [
        global_nll - conditional_nll
        for global_nll, conditional_nll in zip(global_scores, selected_scores)
    ]
    bootstrap = bootstrap_lower(validation, improvements)
    validation_gates = {
        "bootstrap_99pct_lower_positive": bootstrap > 0.0,
        "condition_win_rate_at_least_65pct": float(selection["condition_win_rate"]) >= 0.65,
        "full_neighbor_coverage_at_least_95pct": float(selection["full_neighbor_coverage"]) >= 0.95,
        "nll_improvement_at_least_5pct": float(selection["nll_improvement"]) >= 0.05,
    }
    validation_report = {
        "bootstrap_99pct_lower_improvement": bootstrap,
        "evaluation_items": len(validation),
        "gates": validation_gates,
        "grid": grid,
        "passed": all(validation_gates.values()),
        "selected": selection,
        "selected_key": selection_name,
    }
    write_json(args.output / "validation-report.json", validation_report)
    write_jsonl_gzip(
        args.output / "validation-scores.jsonl.gz",
        (
            {
                "component": record["component"],
                "conditional_nll": conditional,
                "global_nll": global_nll,
                "id": record["id"],
                "improvement": global_nll - conditional,
                "name": record["name"],
            }
            for record, global_nll, conditional in zip(
                validation, global_scores, selected_scores
            )
        ),
    )
    if not all(validation_gates.values()):
        write_json(args.output / "manifest.json", artifact_manifest(args.output, "validation_failed"))
        return 2

    test = ordered_partition(records, "test")
    test_neighbors = [retrieve(record, train, idf, postings) for record in test]
    write_jsonl_gzip(
        args.output / "test-retrieval.jsonl.gz",
        retrieval_rows(test, train, test_neighbors),
    )
    k, alpha = selected_pair
    test_locals = [local_model(row, train, k) for row in test_neighbors]
    test_global = [name_nll(str(record["name"]), global_model, None, 0.0) for record in test]
    test_conditional = [
        name_nll(str(record["name"]), global_model, local, alpha)
        for record, local in zip(test, test_locals)
    ]
    test_improvements = [
        global_nll - conditional_nll
        for global_nll, conditional_nll in zip(test_global, test_conditional)
    ]
    condition_count = min(2000, len(test))
    wins = 0
    comparisons = 0
    for index in range(condition_count):
        name = str(test[index]["name"])
        real_nll = test_conditional[index]
        for offset in range(1, 10):
            wrong = (index + offset) % condition_count
            wrong_nll = name_nll(name, global_model, test_locals[wrong], alpha)
            wins += real_nll < wrong_nll
            comparisons += 1
    mean_global = sum(test_global) / len(test)
    mean_conditional = sum(test_conditional) / len(test)
    test_improvement = (mean_global - mean_conditional) / mean_global
    test_coverage = sum(len(row) >= k for row in test_neighbors) / len(test_neighbors)
    test_condition = wins / comparisons
    test_bootstrap = bootstrap_lower(test, test_improvements)
    buckets = {}
    for label, minimum, maximum in (("4-6", 4, 6), ("7-9", 7, 9), ("10-12", 10, 12)):
        values = [
            improvement
            for record, improvement in zip(test, test_improvements)
            if minimum <= len(str(record["name"])) <= maximum
        ]
        buckets[label] = {
            "items": len(values),
            "mean_improvement": sum(values) / len(values) if values else None,
            "passed": len(values) < 500 or sum(values) / len(values) > 0.0,
            "required": len(values) >= 500,
        }
    test_gates = {
        "bootstrap_99pct_lower_positive": test_bootstrap > 0.0,
        "condition_win_rate_at_least_65pct": test_condition >= 0.65,
        "full_neighbor_coverage_at_least_95pct": test_coverage >= 0.95,
        "length_buckets_positive": all(bool(bucket["passed"]) for bucket in buckets.values()),
        "nll_improvement_at_least_5pct": test_improvement >= 0.05,
    }
    test_report = {
        "bootstrap_99pct_lower_improvement": test_bootstrap,
        "condition_comparisons": comparisons,
        "condition_win_rate": test_condition,
        "conditional_nll": mean_conditional,
        "evaluation_items": len(test),
        "full_neighbor_coverage": test_coverage,
        "gates": test_gates,
        "global_nll": mean_global,
        "length_buckets": buckets,
        "nll_improvement": test_improvement,
        "passed": all(test_gates.values()),
        "selected": selection,
    }
    write_json(args.output / "test-report.json", test_report)
    write_jsonl_gzip(
        args.output / "test-scores.jsonl.gz",
        (
            {
                "component": record["component"],
                "conditional_nll": conditional,
                "global_nll": global_nll,
                "id": record["id"],
                "improvement": global_nll - conditional,
                "name": record["name"],
            }
            for record, global_nll, conditional in zip(test, test_global, test_conditional)
        ),
    )
    state = "test_passed" if all(test_gates.values()) else "test_failed"
    write_json(args.output / "manifest.json", artifact_manifest(args.output, state))
    return 0 if all(test_gates.values()) else 3


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"phase295: {error}")
        raise SystemExit(1)
