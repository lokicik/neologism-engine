#!/usr/bin/env python3
"""Audit a completed Phase 305 absolute-rating collection."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path


HERE = Path(__file__).resolve().parent
SOURCE_PATH = HERE / "human-study.json"
KEY_PATH = HERE / "human-study-key.json"
VALID_CHOICES = {"no": 0, "maybe": 1, "use": 2}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_bytes(value: object) -> bytes:
    return (
        json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
        + "\n"
    ).encode("utf-8")


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(canonical_bytes(value))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("collection", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    source = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    key = json.loads(KEY_PATH.read_text(encoding="utf-8"))
    collection = json.loads(args.collection.read_text(encoding="utf-8"))
    source_hash = sha256(SOURCE_PATH)
    if key.get("sourceSha256") != source_hash:
        raise ValueError("study key/source mismatch")
    if collection.get("schema") != "neologism-personal-prototype-collection-v1":
        raise ValueError("unexpected collection schema")
    if collection.get("sourceSha256") != source_hash:
        raise ValueError("collection source SHA-256 mismatch")

    tasks = source["tasks"]
    expected_ids = [task["id"] for task in tasks]
    decisions = collection.get("decisions")
    if not isinstance(decisions, list):
        raise ValueError("collection decisions must be a list")
    by_task = {}
    for row in decisions:
        task_id = row.get("taskId")
        choice = row.get("choice")
        if task_id in by_task:
            raise ValueError(f"duplicate decision: {task_id}")
        if task_id not in expected_ids or choice not in VALID_CHOICES:
            raise ValueError("unknown task or choice")
        by_task[task_id] = choice
    complete = set(by_task) == set(expected_ids) and len(by_task) == 30

    repeat_rows = [task for task in tasks if task["repeatOf"] is not None]
    repeat_consistent = sum(
        task["id"] in by_task
        and task["repeatOf"] in by_task
        and by_task[task["id"]] == by_task[task["repeatOf"]]
        for task in repeat_rows
    )
    key_by_task = {row["taskId"]: row for row in key["pairs"]}
    arm_choices = defaultdict(list)
    pair_choices = defaultdict(dict)
    for task_id, row in key_by_task.items():
        choice = by_task.get(task_id)
        if choice is None:
            continue
        arm_choices[row["arm"]].append(choice)
        pair_choices[row["pairId"]][row["arm"]] = choice

    arm_summary = {}
    for arm in ("prototype", "control"):
        values = arm_choices[arm]
        counts = Counter(values)
        arm_summary[arm] = {
            "count": len(values),
            "use": counts["use"],
            "maybe": counts["maybe"],
            "no": counts["no"],
            "non_reject": counts["use"] + counts["maybe"],
            "mean_ordinal": (
                sum(VALID_CHOICES[value] for value in values) / len(values)
                if values
                else 0.0
            ),
        }

    outcomes = Counter()
    pair_details = []
    for pair_id in sorted(pair_choices):
        choices = pair_choices[pair_id]
        if set(choices) != {"prototype", "control"}:
            continue
        prototype_value = VALID_CHOICES[choices["prototype"]]
        control_value = VALID_CHOICES[choices["control"]]
        outcome = "win" if prototype_value > control_value else "loss" if prototype_value < control_value else "tie"
        outcomes[outcome] += 1
        pair_details.append(
            {
                "pairId": pair_id,
                "prototype": choices["prototype"],
                "control": choices["control"],
                "outcome": outcome,
            }
        )

    prototype = arm_summary["prototype"]
    control = arm_summary["control"]
    gates = {
        "collection_complete_30": complete,
        "primary_count_24": len(key_by_task) == 24,
        "repeat_count_6": len(repeat_rows) == 6,
        "repeat_consistency_at_least_5_of_6": repeat_consistent >= 5,
        "each_arm_count_12": prototype["count"] == 12 and control["count"] == 12,
        "prototype_use_at_least_4": prototype["use"] >= 4,
        "prototype_non_reject_at_least_8": prototype["non_reject"] >= 8,
        "prototype_non_reject_uplift_at_least_3": prototype["non_reject"] - control["non_reject"] >= 3,
        "paired_wins_at_least_7": outcomes["win"] >= 7,
        "paired_losses_at_most_2": outcomes["loss"] <= 2,
    }
    report = {
        "schema": "neologism-personal-prototype-human-report-v1",
        "sourceSha256": source_hash,
        "collectionSha256": sha256(args.collection),
        "repeatConsistency": {"consistent": repeat_consistent, "total": len(repeat_rows)},
        "arms": arm_summary,
        "paired": {**dict(sorted(outcomes.items())), "details": pair_details},
        "gates": gates,
        "state": "passed" if all(gates.values()) else "failed",
    }
    report_path = args.out / "report.json"
    write_json(report_path, report)
    manifest = {
        "schema": "neologism-personal-prototype-human-manifest-v1",
        "sourceSha256": source_hash,
        "keySha256": sha256(KEY_PATH),
        "collectionSha256": sha256(args.collection),
        "auditorSha256": sha256(Path(__file__)),
        "reportSha256": sha256(report_path),
        "state": report["state"],
    }
    write_json(args.out / "manifest.json", manifest)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
