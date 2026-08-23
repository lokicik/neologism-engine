#!/usr/bin/env python3
"""Fit the frozen transparent Phase-287 preference model."""

from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path

import numpy as np


L2_GRID = (0.1, 1.0, 10.0, 100.0)
VOWELS = frozenset("aeiouy")
SONORITY = {
    **dict.fromkeys("aeiouy", 5.0),
    **dict.fromkeys("wj", 4.0),
    **dict.fromkeys("lr", 3.0),
    **dict.fromkeys("mn", 2.0),
    **dict.fromkeys("fvszxh", 1.5),
    **dict.fromkeys("pbtdkgcq", 1.0),
}
MODES = ("brandable", "realword", "respell", "compound")
CONSTRUCTIONS = ("none", "guided_metaphor", "guided_pair")
FEATURE_NAMES = (
    "score_pronounce", "score_novelty", "score_memorability", "syllables",
    "length", "vowel_share", "cv_alternation", "repeat_share", "unique_share",
    "sonority_mean", "sonority_transition", "sonority_initial", "sonority_final",
    "concept_coverage",
    *(f"mode_{value}" for value in MODES),
    *(f"construction_{value}" for value in CONSTRUCTIONS),
)


def canonical(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def fnv1a64(value: str) -> int:
    result = 0xCBF29CE484222325
    for byte in value.encode("utf-8"):
        result ^= byte
        result = (result * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return result


def build_tasks(source: dict, repeat_count: int) -> list[dict]:
    primary = []
    for case in source["cases"]:
        for pair in case["pairs"]:
            left = case["pool"][pair["leftIndex"]]["name"]
            right = case["pool"][pair["rightIndex"]]["name"]
            if fnv1a64(pair["id"]) & 1:
                left, right = right, left
            primary.append({
                "id": f"primary:{pair['id']}",
                "pairId": pair["id"],
                "briefId": case["briefId"],
                "partition": case["partition"],
                "leftName": left,
                "rightName": right,
            })
    repeat_sources = sorted(primary, key=lambda task: (sha256_text(task["pairId"]), task["pairId"]))[:repeat_count]
    repeats = [
        {
            **task,
            "id": f"repeat:{task['pairId']}",
            "leftName": task["rightName"],
            "rightName": task["leftName"],
            "repeatOf": task["id"],
        }
        for task in repeat_sources
    ]
    return sorted(primary + repeats, key=lambda task: (sha256_text(task["id"]), task["id"]))


def normalized_choice(task: dict, choice: str) -> str:
    if choice == "neither":
        return "neither"
    return task["leftName"].lower() if choice == "left" else task["rightName"].lower()


def validate_collection(source: dict, protocol: dict, collection: dict) -> tuple[list[dict], dict]:
    if not isinstance(source, dict) or not isinstance(protocol, dict) or not isinstance(collection, dict):
        raise ValueError("source, protocol, and collection must be JSON objects")
    required_protocol = {
        "schema", "sourcePayloadSha256", "primaryCount", "repeatCount", "choices",
        "consistencyGate", "minimumDecisive",
    }
    missing_protocol = sorted(required_protocol - protocol.keys())
    if missing_protocol:
        raise ValueError(f"collector protocol missing fields: {', '.join(missing_protocol)}")
    if protocol["schema"] != "neologism-preference-learning-collector-protocol-v1":
        raise ValueError("unsupported collector protocol schema")
    if collection.get("schema") != "neologism-prospective-preference-collection-v1":
        raise ValueError("unsupported collection schema")
    source_sha = sha256_text(canonical(source))
    protocol_sha = sha256_text(canonical(protocol))
    if source_sha != protocol["sourcePayloadSha256"]:
        raise ValueError("source does not match collector protocol")
    if collection.get("sourcePayloadSha256") != source_sha:
        raise ValueError("collection source hash mismatch")
    if collection.get("collectorProtocolSha256") != protocol_sha:
        raise ValueError("collection protocol hash mismatch")
    tasks = build_tasks(source, int(protocol["repeatCount"]))
    primary_count = sum("repeatOf" not in task for task in tasks)
    if primary_count != int(protocol["primaryCount"]):
        raise ValueError("source primary task count mismatch")
    if len({task["id"] for task in tasks}) != len(tasks):
        raise ValueError("duplicate task identity")
    decisions = collection.get("decisions")
    if not isinstance(decisions, list) or len(decisions) != len(tasks):
        raise ValueError("collection must contain every ordered task")
    allowed = set(protocol["choices"])
    for task, decision in zip(tasks, decisions, strict=True):
        if decision.get("taskId") != task["id"] or decision.get("choice") not in allowed:
            raise ValueError("decision identity or choice mismatch")
    by_id = {decision["taskId"]: decision for decision in decisions}
    consistent = 0
    decisive = {"train": 0, "validation": 0, "test": 0}
    for task, decision in zip(tasks, decisions, strict=True):
        if "repeatOf" not in task and decision["choice"] != "neither":
            decisive[task["partition"]] += 1
        if "repeatOf" in task:
            original = next(candidate for candidate in tasks if candidate["id"] == task["repeatOf"])
            if normalized_choice(task, decision["choice"]) == normalized_choice(original, by_id[task["repeatOf"]]["choice"]):
                consistent += 1
    if consistent < int(protocol["consistencyGate"]):
        raise ValueError("repeat consistency gate failed")
    for partition, minimum in protocol["minimumDecisive"].items():
        if decisive[partition] < int(minimum):
            raise ValueError(f"decisive {partition} gate failed")
    expected_audit = {
        "consistentRepeats": consistent,
        "decisive": decisive,
        "consistencyPassed": True,
        "decisivePassed": True,
    }
    if collection.get("audit") != expected_audit:
        raise ValueError("collection audit disagrees with recomputation")
    return tasks, expected_audit


def candidate_features(result: dict) -> np.ndarray:
    name = result["name"].lower()
    n = len(name)
    vowels = np.asarray([char in VOWELS for char in name], dtype=np.float64)
    sonority = np.asarray([SONORITY[char] for char in name], dtype=np.float64)
    transitions = max(1, n - 1)
    mode = result.get("sourceMode", "brandable")
    construction = result.get("construction", "none")
    values = [
        float(result["score_pronounce"]),
        float(result["score_novelty"]),
        float(result["score_memorability"]),
        float(result["syllables"]),
        float(n),
        float(vowels.mean()),
        float(np.abs(np.diff(vowels)).sum() / transitions),
        float(sum(left == right for left, right in zip(name, name[1:])) / transitions),
        float(len(set(name)) / n),
        float(sonority.mean()),
        float(np.abs(np.diff(sonority)).mean()),
        float(sonority[0]),
        float(sonority[-1]),
        float(result.get("concept_coverage", 0.0) or 0.0),
        *(float(mode == value) for value in MODES),
        *(float(construction == value) for value in CONSTRUCTIONS),
    ]
    vector = np.asarray(values, dtype=np.float64)
    if len(vector) != len(FEATURE_NAMES) or not np.isfinite(vector).all():
        raise ValueError(f"invalid feature vector for {name}")
    return vector


def sigmoid(values: np.ndarray) -> np.ndarray:
    result = np.empty_like(values)
    positive = values >= 0
    result[positive] = 1.0 / (1.0 + np.exp(-values[positive]))
    exponent = np.exp(values[~positive])
    result[~positive] = exponent / (1.0 + exponent)
    return result


def fit_irls(x: np.ndarray, y: np.ndarray, l2: float) -> tuple[np.ndarray, int, float]:
    weights = np.zeros(x.shape[1], dtype=np.float64)
    for iteration in range(1, 101):
        probabilities = sigmoid(x @ weights)
        gradient = x.T @ (y - probabilities) - l2 * weights
        curvature = probabilities * (1.0 - probabilities)
        hessian = x.T @ (curvature[:, None] * x) + l2 * np.eye(x.shape[1])
        step = np.linalg.solve(hessian, gradient)
        weights += step
        if not np.isfinite(weights).all():
            raise ValueError("non-finite IRLS weights")
        if float(np.max(np.abs(step))) < 1e-10:
            final_gradient = x.T @ (y - sigmoid(x @ weights)) - l2 * weights
            gradient_norm = float(np.max(np.abs(final_gradient)))
            if gradient_norm > 1e-8:
                raise ValueError("IRLS gradient gate failed")
            return weights, iteration, gradient_norm
    raise ValueError("IRLS did not converge")


def accuracy(y: np.ndarray, probability: np.ndarray) -> tuple[float, int]:
    ties = int(np.sum(probability == 0.5))
    decisive = probability != 0.5
    correct = np.sum((probability[decisive] > 0.5) == (y[decisive] == 1.0)) + ties * 0.5
    return float(correct / len(y)), ties


def brier(y: np.ndarray, probability: np.ndarray) -> float:
    return float(np.mean((probability - y) ** 2))


def baseline_accuracy(rows: list[dict], key: str) -> float:
    def value(result: dict) -> float:
        if key == "composite":
            return round(
                float(result["score_pronounce"]) * 0.4
                + float(result["score_memorability"]) * 0.3
                + float(result["score_novelty"]) * 0.3
            )
        return float(result[key])

    correct = 0.0
    for row in rows:
        delta = value(row["left"]) - value(row["right"])
        if delta == 0.0:
            correct += 0.5
        elif (delta > 0.0) == (row["label"] == 1.0):
            correct += 1.0
    return correct / len(rows)


def sign_test_p(successes: int, total: int) -> float:
    return sum(math.comb(total, value) for value in range(successes, total + 1)) / (2 ** total)


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(canonical(value) + "\n", encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--collector-protocol", type=Path, required=True)
    parser.add_argument("--collection", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    source = json.loads(args.source.read_text(encoding="utf-8"))
    protocol = json.loads(args.collector_protocol.read_text(encoding="utf-8"))
    collection = json.loads(args.collection.read_text(encoding="utf-8"))
    tasks, collection_audit = validate_collection(source, protocol, collection)
    decisions = {row["taskId"]: row for row in collection["decisions"]}
    result_by_brief_name = {
        (case["briefId"], result["name"].lower()): result
        for case in source["cases"]
        for result in case["pool"]
    }
    rows = []
    for task in tasks:
        if "repeatOf" in task or decisions[task["id"]]["choice"] == "neither":
            continue
        left = result_by_brief_name[(task["briefId"], task["leftName"].lower())]
        right = result_by_brief_name[(task["briefId"], task["rightName"].lower())]
        choice = decisions[task["id"]]["choice"]
        rows.append({
            "task": task,
            "left": left,
            "right": right,
            "label": 1.0 if choice == "left" else 0.0,
        })
    partitions = {name: [row for row in rows if row["task"]["partition"] == name] for name in ("train", "validation", "test")}

    train_candidates = {}
    for row in partitions["train"]:
        for side in ("left", "right"):
            result = row[side]
            key = (row["task"]["briefId"], result["name"].lower())
            train_candidates[key] = candidate_features(result)
    candidate_matrix = np.vstack([train_candidates[key] for key in sorted(train_candidates)])
    mean = candidate_matrix.mean(axis=0)
    scale = candidate_matrix.std(axis=0)
    scale[scale < 1e-12] = 1.0

    def matrix(partition_rows: list[dict]) -> tuple[np.ndarray, np.ndarray]:
        x = np.vstack([
            (candidate_features(row["left"]) - mean) / scale - (candidate_features(row["right"]) - mean) / scale
            for row in partition_rows
        ])
        y = np.asarray([row["label"] for row in partition_rows], dtype=np.float64)
        return x, y

    x_train, y_train = matrix(partitions["train"])
    x_validation, y_validation = matrix(partitions["validation"])
    normalized_records = []
    for partition, partition_rows in partitions.items():
        x_partition, y_partition = matrix(partition_rows)
        for row, features, label in zip(partition_rows, x_partition, y_partition, strict=True):
            normalized_records.append({
                "features": [format(value, ".12g") for value in features],
                "label": int(label),
                "partition": partition,
                "taskId": row["task"]["id"],
            })
    normalized_records.sort(key=lambda row: (row["partition"], row["taskId"]))
    write_json(args.out / "normalized-records.json", normalized_records)
    fitted = {}
    candidates = []
    for l2 in L2_GRID:
        weights, iterations, gradient_norm = fit_irls(x_train, y_train, l2)
        fitted[l2] = weights
        probability = sigmoid(x_validation @ weights)
        validation_accuracy, ties = accuracy(y_validation, probability)
        candidates.append({
            "accuracy": validation_accuracy,
            "brier": brier(y_validation, probability),
            "gradientInfinityNorm": gradient_norm,
            "iterations": iterations,
            "l2": l2,
            "ties": ties,
        })
    selected = max(candidates, key=lambda row: (row["accuracy"], -row["brier"], row["l2"]))
    validation_pass = selected["accuracy"] >= 0.60
    validation_report = {
        "collectionAudit": collection_audit,
        "collectionSha256": sha256_file(args.collection),
        "decisiveRecords": {key: len(value) for key, value in partitions.items()},
        "gate": {"accuracyMinimum": 0.60, "passed": validation_pass},
        "l2Candidates": candidates,
        "selectedL2": selected["l2"],
    }
    write_json(args.out / "validation-report.json", validation_report)
    if not validation_pass:
        raise SystemExit(2)

    weights = fitted[selected["l2"]]
    x_test, y_test = matrix(partitions["test"])
    test_probability = sigmoid(x_test @ weights)
    test_accuracy, test_ties = accuracy(y_test, test_probability)
    if test_ties:
        raise ValueError("sealed model probability tie")
    composite_baseline = baseline_accuracy(partitions["test"], "composite")
    pronounce_baseline = baseline_accuracy(partitions["test"], "score_pronounce")
    strongest_baseline = max(composite_baseline, pronounce_baseline)
    successes = int(np.sum((test_probability > 0.5) == (y_test == 1.0)))
    p_value = sign_test_p(successes, len(y_test))
    by_mode = {}
    mode_gate = True
    for mode in MODES:
        positions = [index for index, row in enumerate(partitions["test"]) if row["left"].get("sourceMode") == mode or row["right"].get("sourceMode") == mode]
        if not positions:
            continue
        mode_probability = test_probability[np.asarray(positions)]
        mode_y = y_test[np.asarray(positions)]
        mode_accuracy, mode_ties = accuracy(mode_y, mode_probability)
        required = len(positions) >= 10
        positive = mode_accuracy > 0.5 and mode_ties == 0
        by_mode[mode] = {"accuracy": mode_accuracy, "comparisons": len(positions), "positivePassed": (not required) or positive, "positiveRequired": required, "ties": mode_ties}
        mode_gate = mode_gate and ((not required) or positive)
    test_pass = test_accuracy >= 0.60 and test_accuracy - strongest_baseline >= 0.08 and p_value <= 0.05 and mode_gate
    test_report = {
        "baselines": {"composite": composite_baseline, "pronounceability": pronounce_baseline, "strongest": strongest_baseline},
        "bySourceMode": by_mode,
        "gate": {"accuracyMinimum": 0.60, "baselineUpliftMinimum": 0.08, "modeGatePassed": mode_gate, "passed": test_pass, "signTestPMaximum": 0.05},
        "model": {"accuracy": test_accuracy, "baselineUplift": test_accuracy - strongest_baseline, "oneSidedExactSignP": p_value, "successes": successes, "ties": test_ties, "total": len(y_test)},
    }
    write_json(args.out / "test-report.json", test_report)
    write_json(args.out / "model.json", {
        "coefficients": [format(value, ".12g") for value in weights],
        "featureMean": [format(value, ".12g") for value in mean],
        "featureNames": FEATURE_NAMES,
        "featureScale": [format(value, ".12g") for value in scale],
        "l2": selected["l2"],
        "schema": "neologism-transparent-preference-model-v1",
    })
    manifest = {path.name: sha256_file(path) for path in sorted(args.out.glob("*.json")) if path.name != "manifest.json"}
    write_json(args.out / "manifest.json", manifest)
    print(json.dumps({"manifest": manifest, "test": test_report, "validation": validation_report}, indent=2, sort_keys=True))
    if not test_pass:
        raise SystemExit(3)


if __name__ == "__main__":
    main()
