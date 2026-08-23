#!/usr/bin/env python3
"""Run the frozen Phase 296 WordNet gloss-retrieval experiment."""

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
import re
from typing import Iterable, Sequence
import zipfile


SOURCE_SHA256 = "cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59"
DATA_FILES = ("data.noun", "data.verb", "data.adj", "data.adv")
NAME_PATTERN = re.compile(r"[a-z]{4,12}")
TOKEN_PATTERN = re.compile(r"[a-z]{2,}")
K_VALUES = (16, 32, 64)
ALPHAS = (0.15, 0.25, 0.35)
SYMBOLS = "abcdefghijklmnopqrstuvwxyz$"
SMOOTHING = 0.1
BOOTSTRAPS = 2000
BOOTSTRAP_SEED = 2962026
MIN_RAW = 50_000
MIN_RETAINED = 45_000
MIN_EVALUATION = 3_000
MAX_EVALUATION_EXCLUSION = 0.50

# Frozen function-word inventory. These tokens may not create retrieval support.
STOPWORDS = frozenset(
    """
    a about above after again against all am an and any are as at be because
    been before being below between both but by can could did do does doing
    down during each few for from further had has have having he her here hers
    herself him himself his how i if in into is it its itself just me more most
    my myself no nor not now of off on once only or other our ours ourselves
    out over own same she should so some such than that the their theirs them
    themselves then there these they this those through to too under until up
    very was we were what when where which while who whom why will with would
    you your yours yourself yourselves
    """.split()
)


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


def text_features(text: str, removed: frozenset[str] = frozenset()) -> list[str]:
    tokens = [
        token
        for token in TOKEN_PATTERN.findall(text.lower())
        if token not in STOPWORDS and token not in removed
    ]
    return tokens + [f"{left}_{right}" for left, right in zip(tokens, tokens[1:])]


def parse_synset(line: str) -> tuple[list[str], str] | None:
    if not line or line[0].isspace():
        return None
    body, separator, gloss = line.partition("|")
    if not separator:
        raise ValueError("WordNet data line has no gloss separator")
    fields = body.split()
    if len(fields) < 5:
        raise ValueError("WordNet data line is truncated")
    word_count = int(fields[3], 16)
    word_end = 4 + word_count * 2
    if len(fields) <= word_end:
        raise ValueError("WordNet data line has incomplete lemma fields")
    words = [fields[4 + offset * 2] for offset in range(word_count)]
    return words, gloss.strip()


def load_records(source: Path) -> list[dict[str, object]]:
    if sha256(source) != SOURCE_SHA256:
        raise ValueError("WordNet ZIP SHA-256 mismatch")
    documents: dict[str, list[str]] = defaultdict(list)
    with zipfile.ZipFile(source) as archive:
        if "wordnet/LICENSE" not in archive.namelist():
            raise ValueError("WordNet license is missing")
        for filename in DATA_FILES:
            member = f"wordnet/{filename}"
            try:
                lines = archive.read(member).decode("ascii").splitlines()
            except KeyError as error:
                raise ValueError(f"WordNet member is missing: {member}") from error
            for line_number, line in enumerate(lines, 1):
                try:
                    parsed = parse_synset(line)
                except ValueError as error:
                    raise ValueError(f"{member}:{line_number}: {error}") from error
                if parsed is None:
                    continue
                words, gloss = parsed
                eligible = sorted({word for word in words if NAME_PATTERN.fullmatch(word)})
                if not eligible:
                    continue
                # Remove all ASCII pieces of every synset lemma, including
                # components of WordNet multiword expressions.
                removed = frozenset(
                    piece
                    for word in words
                    for piece in TOKEN_PATTERN.findall(word.lower())
                )
                features = text_features(gloss, removed)
                if not features:
                    continue
                for lemma in eligible:
                    documents[lemma].extend(features)
    return [
        {"features": documents[name], "name": name}
        for name in sorted(documents)
        if documents[name]
    ]


def blocked_deletions(names: set[str]) -> set[str]:
    return {
        name[:offset] + name[offset + 1 :]
        for name in names
        for offset in range(len(name))
    }


def has_exact_or_edit_one(
    name: str, blocked: set[str], deletions: set[str]
) -> bool:
    if name in blocked or name in deletions:
        return True
    if any(name[:offset] + name[offset + 1 :] in blocked for offset in range(len(name))):
        return True
    for offset, original in enumerate(name):
        prefix = name[:offset]
        suffix = name[offset + 1 :]
        for replacement in "abcdefghijklmnopqrstuvwxyz":
            if replacement != original and prefix + replacement + suffix in blocked:
                return True
    return False


def split_records(
    records: Sequence[dict[str, object]],
) -> tuple[list[dict[str, object]], dict[str, object]]:
    provisional: dict[str, list[dict[str, object]]] = {
        "train": [],
        "validation": [],
        "test": [],
    }
    for record in records:
        residue = fnv1a64(str(record["name"])) % 10
        split = "train" if residue < 8 else "validation" if residue == 8 else "test"
        provisional[split].append(record)

    train = provisional["train"]
    train_names = {str(record["name"]) for record in train}
    train_deletions = blocked_deletions(train_names)
    validation = [
        record
        for record in provisional["validation"]
        if not has_exact_or_edit_one(str(record["name"]), train_names, train_deletions)
    ]
    blocked = train_names | {str(record["name"]) for record in validation}
    deletions = blocked_deletions(blocked)
    test = [
        record
        for record in provisional["test"]
        if not has_exact_or_edit_one(str(record["name"]), blocked, deletions)
    ]

    retained = []
    for split, rows in (("train", train), ("validation", validation), ("test", test)):
        for record in rows:
            retained.append({**record, "split": split})
    retained.sort(key=lambda record: (str(record["split"]), str(record["name"])))
    counts = {key: len(value) for key, value in provisional.items()}
    retained_counts = {
        "train": len(train),
        "validation": len(validation),
        "test": len(test),
    }
    exclusion = {
        split: 1.0 - retained_counts[split] / counts[split]
        for split in ("validation", "test")
    }
    audit = {
        "cross_partition_exact_or_edit_one": 0,
        "evaluation_exclusion_rate": exclusion,
        "provisional_counts": counts,
        "retained_counts": retained_counts,
    }
    return retained, audit


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


def retrieve_features(
    features: Sequence[str],
    train: Sequence[dict[str, object]],
    idf: dict[str, float],
    postings: dict[str, list[tuple[int, float]]],
) -> list[tuple[int, float]]:
    query = sparse_vector(features, idf)
    similarities: defaultdict[int, float] = defaultdict(float)
    for feature in sorted(query):
        for index, document_weight in postings.get(feature, ()):
            similarities[index] += query[feature] * document_weight
    positive = [(index, value) for index, value in similarities.items() if value > 0.0]
    positive.sort(key=lambda item: (-item[1], str(train[item[0]]["name"])))
    return positive[: max(K_VALUES)]


def retrieve(
    record: dict[str, object],
    train: Sequence[dict[str, object]],
    idf: dict[str, float],
    postings: dict[str, list[tuple[int, float]]],
) -> list[tuple[int, float]]:
    return retrieve_features(
        [str(value) for value in record["features"]], train, idf, postings
    )


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
    return total / (len(sequence) - 2)


def ordered_partition(
    records: Sequence[dict[str, object]], split: str
) -> list[dict[str, object]]:
    selected = [record for record in records if record["split"] == split]
    selected.sort(key=lambda record: (fnv1a64(str(record["name"])), str(record["name"])))
    return selected[:10_000]


def retrieval_rows(
    evaluation: Sequence[dict[str, object]],
    train: Sequence[dict[str, object]],
    neighbors: Sequence[Sequence[tuple[int, float]]],
) -> Iterable[dict[str, object]]:
    for record, row in zip(evaluation, neighbors):
        yield {
            "name": record["name"],
            "neighbors": [
                {"name": train[index]["name"], "similarity": similarity}
                for index, similarity in row
            ],
        }


def bootstrap_lower(improvements: Sequence[float]) -> float:
    rng = random.Random(BOOTSTRAP_SEED)
    estimates = [
        sum(improvements[rng.randrange(len(improvements))] for _ in improvements)
        / len(improvements)
        for _ in range(BOOTSTRAPS)
    ]
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
    return {"artifacts": artifacts, "phase": 296, "state": state}


def load_briefs(path: Path) -> list[str]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list) or len(value) != 35 or not all(isinstance(item, str) for item in value):
        raise ValueError("canonical brief inventory changed")
    return value


def main() -> int:
    root = Path(__file__).resolve().parent
    repository = root.parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        default=Path(r"C:\Users\LOKMAN\nltk_data\corpora\wordnet.zip"),
    )
    parser.add_argument(
        "--briefs",
        type=Path,
        default=repository / "research" / "holistic" / "canonical_briefs.json",
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError(f"output directory is not empty: {args.output}")
    args.output.mkdir(parents=True, exist_ok=True)

    raw_records = load_records(args.source)
    records, split_audit = split_records(raw_records)
    train = [record for record in records if record["split"] == "train"]
    train.sort(key=lambda record: str(record["name"]))
    retained_counts = split_audit["retained_counts"]
    provisional_counts = split_audit["provisional_counts"]
    count_gates = {
        "cross_partition_exact_or_edit_one_zero": split_audit["cross_partition_exact_or_edit_one"] == 0,
        "evaluation_exclusion_at_most_50pct": all(
            float(value) <= MAX_EVALUATION_EXCLUSION
            for value in split_audit["evaluation_exclusion_rate"].values()
        ),
        "raw_eligible_at_least_50000": len(raw_records) >= MIN_RAW,
        "retained_at_least_45000": len(records) >= MIN_RETAINED,
        "test_at_least_3000": int(retained_counts["test"]) >= MIN_EVALUATION,
        "validation_at_least_3000": int(retained_counts["validation"]) >= MIN_EVALUATION,
    }
    if not all(count_gates.values()):
        report = {
            "gates": count_gates,
            "passed": False,
            "raw_eligible": len(raw_records),
            **split_audit,
            "source_sha256": SOURCE_SHA256,
        }
        write_json(args.output / "data-report.json", report)
        write_json(args.output / "manifest.json", artifact_manifest(args.output, "data_failed"))
        return 2

    idf, postings = build_tfidf(train)
    brief_rows = []
    for brief in load_briefs(args.briefs):
        features = text_features(brief)
        in_vocabulary = sorted(set(features) & idf.keys())
        neighbors = retrieve_features(features, train, idf, postings)
        brief_rows.append(
            {
                "brief": brief,
                "in_vocabulary_features": in_vocabulary,
                "positive_neighbors": len(neighbors),
            }
        )
    brief_gate = all(
        row["in_vocabulary_features"] and int(row["positive_neighbors"]) >= max(K_VALUES)
        for row in brief_rows
    )
    data_gates = {**count_gates, "canonical_brief_coverage_35_of_35": brief_gate}
    data_report = {
        "canonical_briefs": brief_rows,
        "gates": data_gates,
        "passed": all(data_gates.values()),
        "raw_eligible": len(raw_records),
        **split_audit,
        "source_sha256": SOURCE_SHA256,
    }
    write_json(args.output / "data-report.json", data_report)
    if not all(data_gates.values()):
        write_json(args.output / "manifest.json", artifact_manifest(args.output, "data_failed"))
        return 2

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
    bootstrap = bootstrap_lower(improvements)
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
                "conditional_nll": conditional,
                "global_nll": global_nll,
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
        return 3

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
    mean_global = sum(test_global) / len(test_global)
    mean_conditional = sum(test_conditional) / len(test_conditional)
    test_improvement = (mean_global - mean_conditional) / mean_global
    test_coverage = sum(len(row) >= k for row in test_neighbors) / len(test_neighbors)
    test_condition = wins / comparisons
    test_bootstrap = bootstrap_lower(test_improvements)
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
                "conditional_nll": conditional,
                "global_nll": global_nll,
                "improvement": global_nll - conditional,
                "name": record["name"],
            }
            for record, global_nll, conditional in zip(test, test_global, test_conditional)
        ),
    )
    state = "test_passed" if all(test_gates.values()) else "test_failed"
    write_json(args.output / "manifest.json", artifact_manifest(args.output, state))
    return 0 if all(test_gates.values()) else 4


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError, zipfile.BadZipFile) as error:
        print(f"phase296: {error}")
        raise SystemExit(1)
