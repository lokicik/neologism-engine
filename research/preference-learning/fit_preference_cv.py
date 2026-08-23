#!/usr/bin/env python3
"""Fit the prospective grouped-CV Phase-290 preference learner."""

from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path

import numpy as np

import fit_preference as frozen


def feature_space(rows: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    candidates = {}
    for row in rows:
        for side in ("left", "right"):
            result = row[side]
            key = (row["task"]["briefId"], result["name"].lower())
            candidates[key] = frozen.candidate_features(result)
    matrix = np.vstack([candidates[key] for key in sorted(candidates)])
    mean = matrix.mean(axis=0)
    scale = matrix.std(axis=0)
    scale[scale < 1e-12] = 1.0
    return mean, scale


def design(rows: list[dict], mean: np.ndarray, scale: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    x = np.vstack(
        [
            (frozen.candidate_features(row["left"]) - mean) / scale
            - (frozen.candidate_features(row["right"]) - mean) / scale
            for row in rows
        ]
    )
    y = np.asarray([row["label"] for row in rows], dtype=np.float64)
    return x, y


def grouped_folds(cases: dict[str, dict], brief_ids: set[str], count: int, salt: str) -> dict[str, int]:
    ordered = sorted(
        brief_ids,
        key=lambda brief_id: (
            frozen.fnv1a64(f"{salt}|{cases[brief_id]['brief']}"),
            brief_id,
        ),
    )
    return {brief_id: index % count for index, brief_id in enumerate(ordered)}


def select_l2(rows: list[dict], cases: dict[str, dict], fold_count: int, salt: str) -> tuple[float, list[dict]]:
    brief_ids = {row["task"]["briefId"] for row in rows}
    folds = grouped_folds(cases, brief_ids, fold_count, salt)
    candidates = []
    for l2 in frozen.L2_GRID:
        probabilities = []
        labels = []
        iterations = []
        for fold in range(fold_count):
            train = [row for row in rows if folds[row["task"]["briefId"]] != fold]
            validation = [row for row in rows if folds[row["task"]["briefId"]] == fold]
            if not train or not validation:
                raise ValueError("empty grouped inner fold")
            mean, scale = feature_space(train)
            x_train, y_train = design(train, mean, scale)
            x_validation, y_validation = design(validation, mean, scale)
            weights, used_iterations, _ = frozen.fit_irls(x_train, y_train, l2)
            probabilities.extend(frozen.sigmoid(x_validation @ weights).tolist())
            labels.extend(y_validation.tolist())
            iterations.append(used_iterations)
        probability = np.asarray(probabilities, dtype=np.float64)
        y = np.asarray(labels, dtype=np.float64)
        score, ties = frozen.accuracy(y, probability)
        candidates.append(
            {
                "accuracy": score,
                "brier": frozen.brier(y, probability),
                "iterationsMax": max(iterations),
                "l2": l2,
                "ties": ties,
            }
        )
    selected = max(
        candidates,
        key=lambda row: (row["accuracy"], -row["brier"], row["l2"]),
    )
    return float(selected["l2"]), candidates


def baseline_value(result: dict, key: str) -> float:
    if key == "composite":
        return round(
            float(result["score_pronounce"]) * 0.4
            + float(result["score_memorability"]) * 0.3
            + float(result["score_novelty"]) * 0.3
        )
    return float(result[key])


def exact_p(successes: int, failures: int) -> float:
    total = successes + failures
    return 1.0 if total == 0 else frozen.sign_test_p(successes, total)


def paired_sign_flip_p(differences: list[float]) -> tuple[float, int]:
    magnitudes = [int(round(abs(value) * 2.0)) for value in differences if value != 0.0]
    observed = int(round(sum(differences) * 2.0))
    distribution = Counter({0: 1})
    for magnitude in magnitudes:
        updated = Counter()
        for total, ways in distribution.items():
            updated[total - magnitude] += ways
            updated[total + magnitude] += ways
        distribution = updated
    if not magnitudes:
        return 1.0, 0
    tail = sum(ways for total, ways in distribution.items() if total >= observed)
    return tail / (2 ** len(magnitudes)), len(magnitudes)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--collector-protocol", type=Path, required=True)
    parser.add_argument("--collection", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    source = json.loads(args.source.read_text(encoding="utf-8"))
    collector_protocol = json.loads(args.collector_protocol.read_text(encoding="utf-8"))
    collection = json.loads(args.collection.read_text(encoding="utf-8"))
    tasks, collection_audit = frozen.validate_collection(
        source, collector_protocol, collection
    )
    decisions = {row["taskId"]: row["choice"] for row in collection["decisions"]}
    cases = {case["briefId"]: case for case in source["cases"]}
    result_by_brief_name = {
        (case["briefId"], result["name"].lower()): result
        for case in source["cases"]
        for result in case["pool"]
    }

    rows = []
    structurally_unscorable = []
    for task in tasks:
        choice = decisions[task["id"]]
        if "repeatOf" in task:
            continue
        left = result_by_brief_name[
            (task["briefId"], task["leftName"].lower())
        ]
        right = result_by_brief_name[
            (task["briefId"], task["rightName"].lower())
        ]
        if np.array_equal(
            frozen.candidate_features(left), frozen.candidate_features(right)
        ):
            structurally_unscorable.append(task["id"])
            continue
        if choice != "neither":
            rows.append(
                {
                    "task": task,
                    "left": left,
                    "right": right,
                    "label": 1.0 if choice == "left" else 0.0,
                }
            )

    if structurally_unscorable != ["primary:r039-01"]:
        raise ValueError("structurally unscorable pair identity changed")

    decisive_by_brief = Counter(row["task"]["briefId"] for row in rows)
    if len(rows) < 119:
        raise ValueError("grouped-CV total decisive gate failed")
    if set(decisive_by_brief) != set(cases) or min(decisive_by_brief.values()) < 3:
        raise ValueError("grouped-CV per-brief decisive gate failed")

    outer_folds = grouped_folds(cases, set(cases), 6, "outer-v1")
    if sorted(Counter(outer_folds.values()).values()) != [5] * 6:
        raise ValueError("outer brief folds are incomplete")

    oof = []
    outer_reports = []
    for outer_fold in range(6):
        outer_train = [
            row
            for row in rows
            if outer_folds[row["task"]["briefId"]] != outer_fold
        ]
        outer_test = [
            row
            for row in rows
            if outer_folds[row["task"]["briefId"]] == outer_fold
        ]
        selected_l2, inner_candidates = select_l2(
            outer_train, cases, 5, f"inner-v1-{outer_fold}"
        )
        mean, scale = feature_space(outer_train)
        x_train, y_train = design(outer_train, mean, scale)
        x_test, y_test = design(outer_test, mean, scale)
        weights, iterations, gradient_norm = frozen.fit_irls(
            x_train, y_train, selected_l2
        )
        probabilities = frozen.sigmoid(x_test @ weights)
        for row, probability, label in zip(
            outer_test, probabilities, y_test, strict=True
        ):
            oof.append(
                {
                    "briefId": row["task"]["briefId"],
                    "label": int(label),
                    "outerFold": outer_fold,
                    "probabilityLeft": float(probability),
                    "row": row,
                    "taskId": row["task"]["id"],
                }
            )
        outer_reports.append(
            {
                "fold": outer_fold,
                "gradientInfinityNorm": gradient_norm,
                "innerCandidates": inner_candidates,
                "iterations": iterations,
                "selectedL2": selected_l2,
                "testBriefs": sorted(
                    {row["task"]["briefId"] for row in outer_test}
                ),
                "testComparisons": len(outer_test),
                "trainComparisons": len(outer_train),
            }
        )

    oof.sort(key=lambda row: row["taskId"])
    if len(oof) != len(rows) or len({row["taskId"] for row in oof}) != len(rows):
        raise ValueError("out-of-fold coverage mismatch")
    probability = np.asarray([row["probabilityLeft"] for row in oof])
    y = np.asarray([row["label"] for row in oof], dtype=np.float64)
    accuracy, ties = frozen.accuracy(y, probability)
    if ties:
        raise ValueError("out-of-fold model probability tie")
    model_correct = (probability > 0.5) == (y == 1.0)
    successes = int(model_correct.sum())

    baseline_scores = {
        key: frozen.baseline_accuracy([row["row"] for row in oof], key)
        for key in ("composite", "score_pronounce")
    }
    strongest_key = max(
        baseline_scores,
        key=lambda key: (baseline_scores[key], key == "composite"),
    )
    strongest = baseline_scores[strongest_key]
    paired_differences = []
    for index, record in enumerate(oof):
        row = record["row"]
        delta = baseline_value(row["left"], strongest_key) - baseline_value(
            row["right"], strongest_key
        )
        baseline_score = (
            0.5
            if delta == 0.0
            else float((delta > 0.0) == (row["label"] == 1.0))
        )
        paired_differences.append(float(model_correct[index]) - baseline_score)

    by_brief = {}
    positive_briefs = 0
    negative_briefs = 0
    for brief_id in sorted(cases):
        positions = [i for i, row in enumerate(oof) if row["briefId"] == brief_id]
        brief_accuracy = float(model_correct[np.asarray(positions)].mean())
        if brief_accuracy > 0.5:
            positive_briefs += 1
        elif brief_accuracy < 0.5:
            negative_briefs += 1
        by_brief[brief_id] = {
            "accuracy": brief_accuracy,
            "comparisons": len(positions),
        }

    by_mode = {}
    mode_gate = True
    for mode in frozen.MODES:
        positions = [
            index
            for index, record in enumerate(oof)
            if record["row"]["left"].get("sourceMode") == mode
            or record["row"]["right"].get("sourceMode") == mode
        ]
        if not positions:
            continue
        mode_accuracy = float(model_correct[np.asarray(positions)].mean())
        required = len(positions) >= 10
        passed = (not required) or mode_accuracy > 0.5
        mode_gate = mode_gate and passed
        by_mode[mode] = {
            "accuracy": mode_accuracy,
            "comparisons": len(positions),
            "positivePassed": passed,
            "positiveRequired": required,
        }

    sign_p = frozen.sign_test_p(successes, len(oof))
    paired_p, paired_nonzero = paired_sign_flip_p(paired_differences)
    brief_p = exact_p(positive_briefs, negative_briefs)
    passed = (
        accuracy >= 0.60
        and accuracy - strongest >= 0.08
        and sign_p <= 0.05
        and paired_p <= 0.05
        and positive_briefs >= 20
        and brief_p <= 0.05
        and mode_gate
    )

    normalized = [
        {
            "briefId": row["briefId"],
            "label": row["label"],
            "outerFold": row["outerFold"],
            "probabilityLeft": format(row["probabilityLeft"], ".12g"),
            "taskId": row["taskId"],
        }
        for row in oof
    ]
    frozen.write_json(args.out / "cv-normalized-records.json", normalized)
    report = {
        "baselines": {
            "composite": baseline_scores["composite"],
            "pronounceability": baseline_scores["score_pronounce"],
            "strongest": strongest,
            "strongestName": strongest_key,
        },
        "briefGate": {
            "byBrief": by_brief,
            "negative": negative_briefs,
            "oneSidedExactSignP": brief_p,
            "positive": positive_briefs,
        },
        "bySourceMode": by_mode,
        "collectionAudit": collection_audit,
        "collectionSha256": frozen.sha256_file(args.collection),
        "decisiveComparisons": len(rows),
        "gate": {
            "accuracyMinimum": 0.60,
            "baselineUpliftMinimum": 0.08,
            "modeGatePassed": mode_gate,
            "passed": passed,
            "signTestPMaximum": 0.05,
        },
        "model": {
            "accuracy": accuracy,
            "baselineUplift": accuracy - strongest,
            "oneSidedExactSignP": sign_p,
            "successes": successes,
            "ties": ties,
            "total": len(oof),
        },
        "outerFolds": outer_reports,
        "pairedBaselineGate": {
            "nonzeroDifferences": paired_nonzero,
            "observedCorrectnessGain": sum(paired_differences) / len(paired_differences),
            "oneSidedExactSignP": paired_p,
        },
        "schema": "neologism-grouped-cv-preference-report-v1",
        "structurallyUnscorable": structurally_unscorable,
    }
    frozen.write_json(args.out / "cv-report.json", report)
    if not passed:
        print(json.dumps(report, indent=2, sort_keys=True))
        raise SystemExit(3)

    final_l2, full_candidates = select_l2(rows, cases, 6, "final-v1")
    mean, scale = feature_space(rows)
    x, labels = design(rows, mean, scale)
    weights, iterations, gradient_norm = frozen.fit_irls(x, labels, final_l2)
    frozen.write_json(
        args.out / "cv-model.json",
        {
            "coefficients": [format(value, ".12g") for value in weights],
            "featureMean": [format(value, ".12g") for value in mean],
            "featureNames": frozen.FEATURE_NAMES,
            "featureScale": [format(value, ".12g") for value in scale],
            "finalSelection": full_candidates,
            "gradientInfinityNorm": gradient_norm,
            "iterations": iterations,
            "l2": final_l2,
            "schema": "neologism-grouped-cv-preference-model-v1",
        },
    )
    manifest = {
        path.name: frozen.sha256_file(path)
        for path in sorted(args.out.glob("*.json"))
        if path.name != "cv-manifest.json"
    }
    frozen.write_json(args.out / "cv-manifest.json", manifest)
    print(json.dumps({"manifest": manifest, "report": report}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
