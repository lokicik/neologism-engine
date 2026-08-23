#!/usr/bin/env python3
"""Audit Phase-287 design structure and exact-test power without labels."""

from __future__ import annotations

import argparse
from collections import Counter
import json
import math
from pathlib import Path

import numpy as np

import fit_preference as frozen


TRUE_ACCURACIES = (0.60, 0.65, 0.70, 0.75, 0.80)


def exact_pass_threshold(total: int) -> int:
    accuracy_minimum = math.ceil(0.60 * total - 1e-12)
    for successes in range(accuracy_minimum, total + 1):
        if frozen.sign_test_p(successes, total) <= 0.05:
            return successes
    raise ValueError(f"no exact-test threshold for n={total}")


def binomial_tail(total: int, threshold: int, probability: float) -> float:
    return sum(
        math.comb(total, successes)
        * probability**successes
        * (1.0 - probability) ** (total - successes)
        for successes in range(threshold, total + 1)
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    source = json.loads(args.source.read_text(encoding="utf-8"))
    tasks = [task for task in frozen.build_tasks(source, 0)]
    if len(tasks) != 150:
        raise SystemExit(f"expected 150 primary tasks, received {len(tasks)}")

    cases = {case["briefId"]: case for case in source["cases"]}
    result_by_brief_name = {
        (case["briefId"], result["name"].lower()): result
        for case in source["cases"]
        for result in case["pool"]
    }

    rows = []
    for task in tasks:
        rows.append(
            {
                "task": task,
                "left": result_by_brief_name[
                    (task["briefId"], task["leftName"].lower())
                ],
                "right": result_by_brief_name[
                    (task["briefId"], task["rightName"].lower())
                ],
            }
        )

    structurally_unscorable = [
        row["task"]["id"]
        for row in rows
        if np.array_equal(
            frozen.candidate_features(row["left"]),
            frozen.candidate_features(row["right"]),
        )
    ]

    train_candidates = {}
    for row in rows:
        if row["task"]["partition"] != "train":
            continue
        for side in ("left", "right"):
            result = row[side]
            key = (row["task"]["briefId"], result["name"].lower())
            train_candidates[key] = frozen.candidate_features(result)
    candidate_matrix = np.vstack(
        [train_candidates[key] for key in sorted(train_candidates)]
    )
    mean = candidate_matrix.mean(axis=0)
    scale = candidate_matrix.std(axis=0)
    scale[scale < 1e-12] = 1.0

    def matrix(partition: str | None) -> np.ndarray:
        selected = [
            row
            for row in rows
            if partition is None or row["task"]["partition"] == partition
        ]
        return np.vstack(
            [
                (frozen.candidate_features(row["left"]) - mean) / scale
                - (frozen.candidate_features(row["right"]) - mean) / scale
                for row in selected
            ]
        )

    matrices = {
        name: matrix(name) for name in ("train", "validation", "test")
    }
    matrices["all"] = matrix(None)
    matrix_report = {}
    for name, values in matrices.items():
        nonzero = np.max(np.abs(values), axis=0) > 1e-12
        matrix_report[name] = {
            "comparisons": int(values.shape[0]),
            "nonzeroFeatureDifferences": int(nonzero.sum()),
            "rank": int(np.linalg.matrix_rank(values)),
        }

    ordered_briefs = sorted(
        source["cases"], key=lambda case: (frozen.fnv1a64(case["brief"]), case["briefId"])
    )
    fold_by_brief = {
        case["briefId"]: index % 6 for index, case in enumerate(ordered_briefs)
    }
    fold_counts = Counter(fold_by_brief.values())
    fold_pair_counts = Counter(fold_by_brief[row["task"]["briefId"]] for row in rows)
    folds_complete = (
        sorted(fold_counts.values()) == [5] * 6
        and sorted(fold_pair_counts.values()) == [25] * 6
    )

    partition_counts = Counter(task["partition"] for task in tasks)
    partition_briefs = {
        partition: len(
            {task["briefId"] for task in tasks if task["partition"] == partition}
        )
        for partition in ("train", "validation", "test")
    }

    fixed_n = partition_counts["test"]
    fixed_threshold = exact_pass_threshold(fixed_n)
    fixed_power = {
        format(probability, ".2f"): binomial_tail(
            fixed_n, fixed_threshold, probability
        )
        for probability in TRUE_ACCURACIES
    }
    cv_n = len(tasks)
    cv_threshold = exact_pass_threshold(cv_n)
    cv_power = {
        format(probability, ".2f"): binomial_tail(cv_n, cv_threshold, probability)
        for probability in TRUE_ACCURACIES
    }

    report = {
        "schema": "neologism-preference-design-audit-v1",
        "sourcePayloadSha256": frozen.sha256_text(frozen.canonical(source)),
        "primaryComparisons": len(tasks),
        "structurallyUnscorable": structurally_unscorable,
        "partitionComparisons": dict(sorted(partition_counts.items())),
        "partitionBriefs": partition_briefs,
        "featureMatrices": matrix_report,
        "fixedTest": {
            "comparisons": fixed_n,
            "minimumSuccesses": fixed_threshold,
            "minimumObservedAccuracy": fixed_threshold / fixed_n,
            "optimisticExactPower": fixed_power,
            "powerGateAtTrue70": 0.80,
            "passed": fixed_power["0.70"] >= 0.80,
        },
        "sixFoldAlternative": {
            "briefsPerFold": dict(sorted(fold_counts.items())),
            "comparisonsPerFold": dict(sorted(fold_pair_counts.items())),
            "complete": folds_complete,
            "outOfFoldComparisons": cv_n,
            "minimumSuccesses": cv_threshold,
            "minimumObservedAccuracy": cv_threshold / cv_n,
            "optimisticExactPower": cv_power,
            "powerGateAtTrue70": 0.95,
            "structurallyEligible": folds_complete and cv_power["0.70"] >= 0.95,
        },
    }
    if args.out:
        frozen.write_json(args.out, report)
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
