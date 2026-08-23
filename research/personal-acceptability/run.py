#!/usr/bin/env python3
"""Run the frozen Phase 304 personal absolute-acceptability probe."""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import sys


ALPHAS = (0.1, 1.0, 10.0)
EXPECTED_COLLECTION_SHA256 = "031f4d75a416dedfd853116b4bca1833e384422e3691a0403f2431d5d6628f25"
EXPECTED_SOURCE_SHA256 = "debb789365ca2b2eff334662e5325c00a5a9ea32cda9b5f3d6e433b83676803e"
EXPECTED_COLLECTOR_PROTOCOL_SHA256 = "ee0c8d96484740c1d332abb5cbc249925b2ed2c1cc4ff3d9fcf113fc19428bb0"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def grams(name: str) -> list[str]:
    padded = f"^{name}$"
    return [
        padded[offset : offset + width]
        for width in (2, 3, 4)
        for offset in range(len(padded) - width + 1)
    ]


def auc(rows: list[dict], scores: list[float]) -> float:
    positive = [score for row, score in zip(rows, scores, strict=True) if row["label"] == 1]
    negative = [score for row, score in zip(rows, scores, strict=True) if row["label"] == 0]
    if not positive or not negative:
        raise ValueError("ROC AUC requires both classes")
    wins = sum(
        1.0 if left > right else 0.5 if left == right else 0.0
        for left in positive
        for right in negative
    )
    return wins / (len(positive) * len(negative))


def balanced_accuracy(rows: list[dict], scores: list[float]) -> float:
    positive = [score > 0.0 for row, score in zip(rows, scores, strict=True) if row["label"] == 1]
    negative = [score <= 0.0 for row, score in zip(rows, scores, strict=True) if row["label"] == 0]
    if not positive or not negative:
        raise ValueError("balanced accuracy requires both classes")
    return (sum(positive) / len(positive) + sum(negative) / len(negative)) / 2.0


def grouped_folds(cases: dict[str, dict], brief_ids: set[str], count: int, salt: str) -> dict[str, int]:
    ordered = sorted(
        brief_ids,
        key=lambda brief_id: (
            frozen.fnv1a64(f"{salt}|{cases[brief_id]['brief']}"),
            brief_id,
        ),
    )
    return {brief_id: index % count for index, brief_id in enumerate(ordered)}


def fit_model(rows: list[dict], alpha: float) -> dict:
    class_counts = {0: Counter(), 1: Counter()}
    totals = {0: 0, 1: 0}
    labels = {row["label"] for row in rows}
    if labels != {0, 1}:
        raise ValueError("training model requires both classes")
    for row in rows:
        values = grams(row["name"])
        class_counts[row["label"]].update(values)
        totals[row["label"]] += len(values)
    vocabulary = sorted(class_counts[0].keys() | class_counts[1].keys())
    if not vocabulary:
        raise ValueError("empty n-gram vocabulary")
    size = len(vocabulary)
    positive_denominator = totals[1] + alpha * size
    negative_denominator = totals[0] + alpha * size
    weights = {
        gram: math.log((class_counts[1][gram] + alpha) / positive_denominator)
        - math.log((class_counts[0][gram] + alpha) / negative_denominator)
        for gram in vocabulary
    }
    return {"alpha": alpha, "weights": weights}


def score(model: dict, name: str) -> float:
    values = grams(name)
    return sum(model["weights"].get(gram, 0.0) for gram in values) / len(values) if values else 0.0


def select_alpha(rows: list[dict], cases: dict[str, dict], fold_count: int, salt: str) -> tuple[float, list[dict]]:
    brief_ids = {row["briefId"] for row in rows}
    folds = grouped_folds(cases, brief_ids, fold_count, salt)
    candidates = []
    for alpha in ALPHAS:
        validation_rows = []
        validation_scores = []
        for fold in range(fold_count):
            train = [row for row in rows if folds[row["briefId"]] != fold]
            validation = [row for row in rows if folds[row["briefId"]] == fold]
            if {row["label"] for row in train} != {0, 1} or {row["label"] for row in validation} != {0, 1}:
                raise ValueError("empty or single-class grouped inner fold")
            model = fit_model(train, alpha)
            validation_rows.extend(validation)
            validation_scores.extend(score(model, row["name"]) for row in validation)
        candidates.append(
            {
                "alpha": alpha,
                "balancedAccuracy": balanced_accuracy(validation_rows, validation_scores),
                "rocAuc": auc(validation_rows, validation_scores),
            }
        )
    selected = max(
        candidates,
        key=lambda row: (row["rocAuc"], row["balancedAccuracy"], row["alpha"]),
    )
    return float(selected["alpha"]), candidates


def baseline_score(row: dict, key: str) -> float:
    result = row["result"]
    if key == "composite":
        return round(
            float(result["score_pronounce"]) * 0.4
            + float(result["score_memorability"]) * 0.3
            + float(result["score_novelty"]) * 0.3
        )
    if key == "memorability":
        return float(result["score_memorability"])
    if key == "negativeLength":
        return -float(len(result["name"]))
    raise ValueError(f"unknown baseline: {key}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--collector-protocol", type=Path, required=True)
    parser.add_argument("--collection", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError(f"output directory is not empty: {args.output}")
    args.output.mkdir(parents=True, exist_ok=True)

    identities = {
        "collectionSha256": sha256(args.collection),
        "collectorProtocolFileSha256": sha256(args.collector_protocol),
        "sourceFileSha256": sha256(args.source),
    }
    expected = {
        "collectionSha256": EXPECTED_COLLECTION_SHA256,
        "collectorProtocolFileSha256": EXPECTED_COLLECTOR_PROTOCOL_SHA256,
        "sourceFileSha256": EXPECTED_SOURCE_SHA256,
    }
    if identities != expected:
        raise ValueError("frozen input SHA-256 mismatch")

    source = json.loads(args.source.read_text(encoding="utf-8"))
    protocol = json.loads(args.collector_protocol.read_text(encoding="utf-8"))
    collection = json.loads(args.collection.read_text(encoding="utf-8"))
    source_payload_sha = frozen.sha256_text(frozen.canonical(source))
    protocol_payload_sha = frozen.sha256_text(frozen.canonical(protocol))
    if (
        source_payload_sha != protocol["sourcePayloadSha256"]
        or collection.get("sourcePayloadSha256") != source_payload_sha
        or collection.get("collectorProtocolSha256") != protocol_payload_sha
    ):
        raise ValueError("canonical source or protocol identity mismatch")

    tasks = frozen.build_tasks(source, int(protocol["repeatCount"]))
    decisions = collection.get("decisions")
    if not isinstance(decisions, list) or len(decisions) != len(tasks):
        raise ValueError("collection task count mismatch")
    allowed = set(protocol["choices"])
    for task, decision in zip(tasks, decisions, strict=True):
        if decision.get("taskId") != task["id"] or decision.get("choice") not in allowed:
            raise ValueError("ordered decision identity or choice mismatch")

    task_by_id = {task["id"]: task for task in tasks}
    decision_by_id = {decision["taskId"]: decision for decision in decisions}
    inconsistent_primary = set()
    consistent = 0
    for task in tasks:
        if "repeatOf" not in task:
            continue
        original = task_by_id[task["repeatOf"]]
        original_choice = decision_by_id[original["id"]]["choice"]
        repeat_choice = decision_by_id[task["id"]]["choice"]
        if frozen.normalized_choice(original, original_choice) == frozen.normalized_choice(task, repeat_choice):
            consistent += 1
        else:
            inconsistent_primary.add(original["id"])
    decisive = {"train": 0, "validation": 0, "test": 0}
    for task in tasks:
        if "repeatOf" not in task and decision_by_id[task["id"]]["choice"] != "neither":
            decisive[task["partition"]] += 1
    recomputed_audit = {
        "consistencyPassed": consistent >= int(protocol["consistencyGate"]),
        "consistentRepeats": consistent,
        "decisive": decisive,
        "decisivePassed": all(
            decisive[partition] >= int(minimum)
            for partition, minimum in protocol["minimumDecisive"].items()
        ),
    }
    if collection.get("audit") != recomputed_audit or recomputed_audit["consistencyPassed"] or recomputed_audit["decisivePassed"]:
        raise ValueError("expected frozen failed collection audit changed")

    cases = {case["briefId"]: case for case in source["cases"]}
    results = {
        (case["briefId"], result["name"].lower()): result
        for case in source["cases"]
        for result in case["pool"]
    }
    raw_rows = []
    pair_exclusions = []
    for task in tasks:
        if "repeatOf" in task:
            continue
        if task["id"] in inconsistent_primary:
            pair_exclusions.append({"reason": "inconsistentRepeat", "taskId": task["id"]})
            continue
        choice = decision_by_id[task["id"]]["choice"]
        if choice == "neither":
            names = (task["leftName"], task["rightName"])
            label = 0
        else:
            names = (task["leftName"] if choice == "left" else task["rightName"],)
            label = 1
        for name in names:
            result = results[(task["briefId"], name.lower())]
            raw_rows.append(
                {
                    "briefId": task["briefId"],
                    "label": label,
                    "name": result["name"].lower(),
                    "partition": task["partition"],
                    "result": result,
                    "taskId": task["id"],
                }
            )

    name_briefs: dict[str, set[str]] = {}
    for row in raw_rows:
        name_briefs.setdefault(row["name"], set()).add(row["briefId"])
    cross_brief_names = sorted(name for name, brief_ids in name_briefs.items() if len(brief_ids) > 1)
    rows = [row for row in raw_rows if row["name"] not in set(cross_brief_names)]
    if len({(row["briefId"], row["name"]) for row in rows}) != len(rows):
        raise ValueError("duplicate retained label identity")
    rows.sort(key=lambda row: (row["briefId"], row["name"], row["label"]))

    positives = sum(row["label"] == 1 for row in rows)
    negatives = sum(row["label"] == 0 for row in rows)
    positive_briefs = {row["briefId"] for row in rows if row["label"] == 1}
    negative_briefs = {row["briefId"] for row in rows if row["label"] == 0}
    data_gates = {
        "negativeBriefsAtLeast24": len(negative_briefs) >= 24,
        "negativesAtLeast120": negatives >= 120,
        "positiveBriefsAtLeast24": len(positive_briefs) >= 24,
        "positivesAtLeast55": positives >= 55,
    }
    if not all(data_gates.values()):
        raise ValueError("Phase 304 label sufficiency gate failed")

    outer_folds = grouped_folds(cases, set(cases), 6, "outer-v1")
    oof = []
    outer_reports = []
    for fold in range(6):
        train = [row for row in rows if outer_folds[row["briefId"]] != fold]
        test = [row for row in rows if outer_folds[row["briefId"]] == fold]
        if {row["label"] for row in train} != {0, 1} or {row["label"] for row in test} != {0, 1}:
            raise ValueError("empty or single-class grouped outer fold")
        selected_alpha, candidates = select_alpha(train, cases, 5, f"inner-v1-{fold}")
        model = fit_model(train, selected_alpha)
        test_scores = [score(model, row["name"]) for row in test]
        if not all(math.isfinite(value) for value in test_scores):
            raise ValueError("non-finite outer score")
        for row, value in zip(test, test_scores, strict=True):
            oof.append({**row, "outerFold": fold, "score": value})
        outer_reports.append(
            {
                "fold": fold,
                "innerCandidates": candidates,
                "selectedAlpha": selected_alpha,
                "testBriefs": sorted({row["briefId"] for row in test}),
                "testLabels": len(test),
                "trainLabels": len(train),
            }
        )
    oof.sort(key=lambda row: (row["briefId"], row["name"], row["label"]))
    if len(oof) != len(rows) or len({(row["briefId"], row["name"]) for row in oof}) != len(rows):
        raise ValueError("out-of-fold coverage mismatch")

    model_scores = [row["score"] for row in oof]
    model_auc = auc(oof, model_scores)
    model_balanced = balanced_accuracy(oof, model_scores)
    baseline_aucs = {
        key: auc(oof, [baseline_score(row, key) for row in oof])
        for key in ("composite", "memorability", "negativeLength")
    }
    strongest_baseline = max(baseline_aucs.values())
    by_partition = {}
    partition_gate = True
    for partition in ("train", "validation", "test"):
        positions = [index for index, row in enumerate(oof) if row["partition"] == partition]
        subset = [oof[index] for index in positions]
        subset_positive = sum(row["label"] == 1 for row in subset)
        subset_negative = sum(row["label"] == 0 for row in subset)
        required = subset_positive >= 10 and subset_negative >= 10
        partition_auc = auc(subset, [model_scores[index] for index in positions]) if required else None
        passed = (not required) or (partition_auc is not None and partition_auc >= 0.55)
        partition_gate &= passed
        by_partition[partition] = {
            "negative": subset_negative,
            "positive": subset_positive,
            "required": required,
            "rocAuc": partition_auc,
            "passed": passed,
        }

    gates = {
        **data_gates,
        "balancedAccuracyAtLeast0_60": model_balanced >= 0.60,
        "baselineAucUpliftAtLeast0_05": model_auc - strongest_baseline >= 0.05,
        "partitionAucGate": partition_gate,
        "rocAucAtLeast0_65": model_auc >= 0.65,
    }
    passed = all(gates.values())
    normalized = [
        {
            "briefId": row["briefId"],
            "label": row["label"],
            "name": row["name"],
            "outerFold": row["outerFold"],
            "partition": row["partition"],
            "score": format(row["score"], ".12g"),
            "taskId": row["taskId"],
        }
        for row in oof
    ]
    frozen.write_json(args.output / "labels.json", normalized)
    report = {
        "baselines": {**baseline_aucs, "strongest": strongest_baseline},
        "byPartition": by_partition,
        "collectionAudit": recomputed_audit,
        "crossBriefNameExclusions": cross_brief_names,
        "data": {
            "inconsistentRepeatPairExclusions": len(pair_exclusions),
            "inconsistentRepeatPairIds": sorted(row["taskId"] for row in pair_exclusions),
            "labels": len(rows),
            "negative": negatives,
            "negativeBriefs": len(negative_briefs),
            "positive": positives,
            "positiveBriefs": len(positive_briefs),
        },
        "gates": gates,
        "model": {
            "balancedAccuracy": model_balanced,
            "rocAuc": model_auc,
            "strongestBaselineAucUplift": model_auc - strongest_baseline,
        },
        "outerFolds": outer_reports,
        "passed": passed,
        "schema": "neologism-personal-acceptability-report-v1",
    }
    frozen.write_json(args.output / "report.json", report)

    if passed:
        final_alpha, final_candidates = select_alpha(rows, cases, 6, "final-v1")
        final_model = fit_model(rows, final_alpha)
        frozen.write_json(
            args.output / "model.json",
            {
                "alpha": final_alpha,
                "feature": "exact-character-ngrams-2-4",
                "finalCandidates": final_candidates,
                "schema": "neologism-personal-acceptability-model-v1",
                "threshold": 0.0,
                "weights": {
                    gram: format(value, ".12g")
                    for gram, value in sorted(final_model["weights"].items())
                },
            },
        )

    manifest = {
        "collectionSha256": identities["collectionSha256"],
        "files": {
            path.name: sha256(path)
            for path in sorted(args.output.glob("*.json"))
            if path.name != "manifest.json"
        },
        "phase": 304,
        "state": "passed" if passed else "failed",
    }
    frozen.write_json(args.output / "manifest.json", manifest)
    if not passed:
        raise SystemExit(2)


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent / "preference-learning"
    sys.path.insert(0, str(root))
    import fit_preference as frozen

    try:
        main()
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"phase304: {error}")
        raise SystemExit(1)
