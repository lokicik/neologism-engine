#!/usr/bin/env python3
"""Describe a completed preference collection that failed the frozen model gate."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path

import fit_preference as frozen


EXPECTED_COLLECTION_SHA256 = "031f4d75a416dedfd853116b4bca1833e384422e3691a0403f2431d5d6628f25"
EXPECTED_SOURCE_FILE_SHA256 = "debb789365ca2b2eff334662e5325c00a5a9ea32cda9b5f3d6e433b83676803e"
EXPECTED_PROTOCOL_FILE_SHA256 = "ee0c8d96484740c1d332abb5cbc249925b2ed2c1cc4ff3d9fcf113fc19428bb0"


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def composite(result: dict) -> float:
    return round(
        float(result["score_pronounce"]) * 0.4
        + float(result["score_memorability"]) * 0.3
        + float(result["score_novelty"]) * 0.3
    )


def scalar_features(result: dict) -> dict[str, float]:
    return {
        "composite": composite(result),
        "conceptCoverage": float(result.get("concept_coverage", 0.0) or 0.0),
        "length": float(len(result["name"])),
        "memorability": float(result["score_memorability"]),
        "novelty": float(result["score_novelty"]),
        "pronounceability": float(result["score_pronounce"]),
        "syllables": float(result["syllables"]),
    }


def summarized_counter(values: Counter[str]) -> dict[str, int]:
    return {key: values[key] for key in sorted(values)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--collector-protocol", type=Path, required=True)
    parser.add_argument("--collection", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    identities = {
        "collectionSha256": frozen.sha256_file(args.collection),
        "collectorProtocolFileSha256": frozen.sha256_file(args.collector_protocol),
        "sourceFileSha256": frozen.sha256_file(args.source),
    }
    expected = {
        "collectionSha256": EXPECTED_COLLECTION_SHA256,
        "collectorProtocolFileSha256": EXPECTED_PROTOCOL_FILE_SHA256,
        "sourceFileSha256": EXPECTED_SOURCE_FILE_SHA256,
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
    primary = [task for task in tasks if "repeatOf" not in task]
    repeats = [task for task in tasks if "repeatOf" in task]
    if len(primary) != 150 or len(repeats) != 24:
        raise ValueError("frozen task inventory changed")

    decisive_by_partition: Counter[str] = Counter()
    for task in primary:
        if decision_by_id[task["id"]]["choice"] != "neither":
            decisive_by_partition[task["partition"]] += 1
    consistent = 0
    mismatch_types: Counter[str] = Counter()
    for task in repeats:
        original = task_by_id[task["repeatOf"]]
        original_choice = decision_by_id[original["id"]]["choice"]
        repeat_choice = decision_by_id[task["id"]]["choice"]
        original_name = frozen.normalized_choice(original, original_choice)
        repeat_name = frozen.normalized_choice(task, repeat_choice)
        if original_name == repeat_name:
            consistent += 1
        elif original_choice == "neither":
            mismatch_types["neitherToDecisive"] += 1
        elif repeat_choice == "neither":
            mismatch_types["decisiveToNeither"] += 1
        else:
            mismatch_types["oppositeName"] += 1

    decisive = {
        partition: decisive_by_partition[partition]
        for partition in ("train", "validation", "test")
    }
    consistency_passed = consistent >= int(protocol["consistencyGate"])
    decisive_passed = all(
        decisive[partition] >= int(minimum)
        for partition, minimum in protocol["minimumDecisive"].items()
    )
    recomputed_audit = {
        "consistencyPassed": consistency_passed,
        "consistentRepeats": consistent,
        "decisive": decisive,
        "decisivePassed": decisive_passed,
    }
    if collection.get("audit") != recomputed_audit:
        raise ValueError("collection audit disagrees with recomputation")

    cases = {case["briefId"]: case for case in source["cases"]}
    results = {
        (case["briefId"], result["name"].lower()): result
        for case in source["cases"]
        for result in case["pool"]
    }
    per_brief: dict[str, dict] = {}
    mode_pairs: defaultdict[str, Counter[str]] = defaultdict(Counter)
    construction_pairs: defaultdict[str, Counter[str]] = defaultdict(Counter)
    chosen_modes: Counter[str] = Counter()
    chosen_constructions: Counter[str] = Counter()
    exposed_modes: Counter[str] = Counter()
    exposed_constructions: Counter[str] = Counter()
    differences: defaultdict[str, list[float]] = defaultdict(list)
    composite_direction: Counter[str] = Counter()
    pronounce_direction: Counter[str] = Counter()

    for brief_id, case in sorted(cases.items()):
        brief_tasks = [task for task in primary if task["briefId"] == brief_id]
        choices = [decision_by_id[task["id"]]["choice"] for task in brief_tasks]
        neither = choices.count("neither")
        per_brief[brief_id] = {
            "brief": case["brief"],
            "decisive": len(brief_tasks) - neither,
            "neither": neither,
            "neitherRate": neither / len(brief_tasks),
            "partition": case["partition"],
            "primary": len(brief_tasks),
        }

        for task in brief_tasks:
            choice = decision_by_id[task["id"]]["choice"]
            left = results[(brief_id, task["leftName"].lower())]
            right = results[(brief_id, task["rightName"].lower())]
            modes = sorted((left.get("sourceMode", "brandable"), right.get("sourceMode", "brandable")))
            constructions = sorted((left.get("construction", "none"), right.get("construction", "none")))
            mode_key = "|".join(modes)
            construction_key = "|".join(constructions)
            mode_pairs[mode_key]["primary"] += 1
            construction_pairs[construction_key]["primary"] += 1
            for result in (left, right):
                exposed_modes[result.get("sourceMode", "brandable")] += 1
                exposed_constructions[result.get("construction", "none")] += 1
            if choice == "neither":
                mode_pairs[mode_key]["neither"] += 1
                construction_pairs[construction_key]["neither"] += 1
                continue

            mode_pairs[mode_key]["decisive"] += 1
            construction_pairs[construction_key]["decisive"] += 1
            chosen, unchosen = (left, right) if choice == "left" else (right, left)
            chosen_modes[chosen.get("sourceMode", "brandable")] += 1
            chosen_constructions[chosen.get("construction", "none")] += 1
            chosen_values = scalar_features(chosen)
            unchosen_values = scalar_features(unchosen)
            for key in chosen_values:
                differences[key].append(chosen_values[key] - unchosen_values[key])
            composite_delta = chosen_values["composite"] - unchosen_values["composite"]
            pronounce_delta = chosen_values["pronounceability"] - unchosen_values["pronounceability"]
            composite_direction["higher" if composite_delta > 0 else "lower" if composite_delta < 0 else "tie"] += 1
            pronounce_direction["higher" if pronounce_delta > 0 else "lower" if pronounce_delta < 0 else "tie"] += 1

    def pair_summary(values: defaultdict[str, Counter[str]]) -> dict[str, dict]:
        result = {}
        for key in sorted(values):
            row = values[key]
            result[key] = {
                "decisive": row["decisive"],
                "neither": row["neither"],
                "neitherRate": row["neither"] / row["primary"],
                "primary": row["primary"],
            }
        return result

    report = {
        "choiceCounts": {
            "all": summarized_counter(Counter(row["choice"] for row in decisions)),
            "primary": summarized_counter(Counter(decision_by_id[task["id"]]["choice"] for task in primary)),
            "repeat": summarized_counter(Counter(decision_by_id[task["id"]]["choice"] for task in repeats)),
        },
        "chosenMinusUnchosenMean": {
            key: mean(differences[key]) for key in sorted(differences)
        },
        "chosenConstructionCounts": summarized_counter(chosen_constructions),
        "chosenModeCounts": summarized_counter(chosen_modes),
        "collectionAudit": recomputed_audit,
        "compositeDirection": summarized_counter(composite_direction),
        "constructionPairs": pair_summary(construction_pairs),
        "exposedConstructionCounts": summarized_counter(exposed_constructions),
        "exposedModeCounts": summarized_counter(exposed_modes),
        "identity": {
            **identities,
            "collectorProtocolPayloadSha256": protocol_payload_sha,
            "sourcePayloadSha256": source_payload_sha,
        },
        "modePairs": pair_summary(mode_pairs),
        "perBrief": per_brief,
        "pronounceabilityDirection": summarized_counter(pronounce_direction),
        "repeatAudit": {
            "consistent": consistent,
            "inconsistent": len(repeats) - consistent,
            "mismatchTypes": summarized_counter(mismatch_types),
            "total": len(repeats),
        },
        "schema": "neologism-real-preference-descriptive-audit-v1",
    }
    if args.output.exists():
        raise ValueError(f"output already exists: {args.output}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    frozen.write_json(args.output, report)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"real collection audit: {error}")
        raise SystemExit(1)
