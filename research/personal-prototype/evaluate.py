#!/usr/bin/env python3
"""Evaluate the frozen Phase 305 personal prototype selector."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
ANCHORS_PATH = HERE / "anchors.json"
PROTOCOL_PATH = HERE / "PROTOCOL.md"
SOURCE_REPORTS = {
    "development": (
        ROOT / "research/conceptnet-guided-sampler/work/development-a/report.json",
        "fb0e2d53a05210ed314323e31adf2f81fa9d3ab84077eeb059d9eddb46b247a5",
    ),
    "test": (
        ROOT / "research/conceptnet-guided-sampler/work/sealed-a/report.json",
        "7457f1439be84dfb5f7d3a4891961a5fa81686baf8517671f890fa218243f525",
    ),
}
TRAIN_NAMES_PATH = (
    ROOT
    / "research/conceptnet-guided-sampler/work/development-a/corpus/train-names.txt"
)
TRAIN_NAMES_SHA256 = "fe974bf069a620061ed60727154861b2373a4626f8d185a81e7b5aa4392b9c70"
FAMILY_ORDER = ("lexical", "coined", "derived")
POOL_SIZE = 120
PAGE_SIZE = 10
BACKGROUND_SIZE = 256
MMR_LAMBDA = 0.70


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


def fnv1a64(text: str) -> int:
    value = 0xCBF29CE484222325
    for byte in text.encode("utf-8"):
        value ^= byte
        value = (value * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return value


def levenshtein(left: str, right: str) -> int:
    previous = list(range(len(right) + 1))
    for left_index, left_char in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_char in enumerate(right, start=1):
            current.append(
                min(
                    previous[right_index] + 1,
                    current[right_index - 1] + 1,
                    previous[right_index - 1] + (left_char != right_char),
                )
            )
        previous = current
    return previous[-1]


def normalized_edit_similarity(left: str, right: str) -> float:
    return 1.0 - levenshtein(left, right) / max(len(left), len(right), 1)


def articulatory_class(char: str) -> str:
    if char in "aeiou":
        return "V"
    if char in "bcdgkpt":
        return "T"
    if char in "fsvxz":
        return "F"
    if char in "mn":
        return "N"
    if char in "lrwy":
        return "L"
    return "O"


def class_string(name: str) -> str:
    return "".join(articulatory_class(char) for char in name)


def vowel_runs(name: str) -> int:
    runs = 0
    inside = False
    for char in name:
        vowel = char in "aeiou"
        if vowel and not inside:
            runs += 1
        inside = vowel
    return runs


def vowel_fraction(name: str) -> float:
    return sum(char in "aeiou" for char in name) / max(len(name), 1)


def unique_ratio(name: str) -> float:
    return len(set(name)) / max(len(name), 1)


def prototype_similarity(left: str, right: str) -> float:
    left_classes = class_string(left)
    right_classes = class_string(right)
    class_distance = levenshtein(left_classes, right_classes) / max(
        len(left_classes), len(right_classes), 1
    )
    distance = (
        0.35 * class_distance
        + 0.20 * min(abs(len(left) - len(right)) / 8.0, 1.0)
        + 0.15 * min(abs(vowel_runs(left) - vowel_runs(right)) / 3.0, 1.0)
        + 0.10 * abs(vowel_fraction(left) - vowel_fraction(right))
        + 0.10 * (articulatory_class(left[0]) != articulatory_class(right[0]))
        + 0.05 * (articulatory_class(left[-1]) != articulatory_class(right[-1]))
        + 0.05 * abs(unique_ratio(left) - unique_ratio(right))
    )
    return 1.0 - min(max(distance, 0.0), 1.0)


def shared_prefix(left: str, right: str) -> int:
    count = 0
    for left_char, right_char in zip(left, right):
        if left_char != right_char:
            break
        count += 1
    return count


def shared_suffix(left: str, right: str) -> int:
    return shared_prefix(left[::-1], right[::-1])


def load_anchors() -> list[dict]:
    payload = json.loads(ANCHORS_PATH.read_text(encoding="utf-8"))
    if payload.get("schema") != "neologism-personal-positive-anchors-v1":
        raise ValueError("unexpected anchor schema")
    anchors = payload.get("anchors")
    if not isinstance(anchors, list) or len(anchors) != 11:
        raise ValueError("expected exactly eleven anchors")
    normalized = []
    seen = set()
    family_counts = Counter()
    for row in anchors:
        name = row.get("normalized")
        family = row.get("family")
        if not isinstance(name, str) or not name.isascii() or not name.isalpha():
            raise ValueError("anchor normalization must be ASCII letters")
        if name != name.lower() or not 4 <= len(name) <= 12 or name in seen:
            raise ValueError("invalid or duplicate normalized anchor")
        if family not in FAMILY_ORDER:
            raise ValueError("unknown anchor family")
        seen.add(name)
        family_counts[family] += 1
        normalized.append({"name": name, "display": row["name"], "family": family})
    if any(family_counts[family] == 0 for family in FAMILY_ORDER):
        raise ValueError("every prototype family must be represented")
    return normalized


def candidate_style(name: str, anchors: list[dict]) -> dict:
    family_scores = {}
    nearest = {}
    for family in FAMILY_ORDER:
        options = [row for row in anchors if row["family"] == family]
        scored = [
            (prototype_similarity(name, row["name"]), row["name"]) for row in options
        ]
        score = max(item[0] for item in scored)
        anchor = min(item[1] for item in scored if item[0] == score)
        family_scores[family] = score
        nearest[family] = anchor
    winning_family = max(
        FAMILY_ORDER,
        key=lambda family: (family_scores[family], -FAMILY_ORDER.index(family)),
    )
    return {
        "prototype_score": family_scores[winning_family],
        "prototype_family": winning_family,
        "nearest_anchor": nearest[winning_family],
        "family_scores": family_scores,
    }


def copy_violation(name: str, anchors: list[dict]) -> str | None:
    for row in anchors:
        anchor = row["name"]
        if levenshtein(name, anchor) <= 2:
            return f"edit<=2:{anchor}"
        if shared_prefix(name, anchor) >= 4:
            return f"prefix>=4:{anchor}"
        if shared_suffix(name, anchor) >= 4:
            return f"suffix>=4:{anchor}"
    return None


def coherence(anchors: list[dict], train_names: list[str]) -> dict:
    background = sorted(set(train_names), key=lambda name: (fnv1a64(name), name))[
        :BACKGROUND_SIZE
    ]
    anchor_names = {row["name"] for row in anchors}
    rows = []
    for held in anchors:
        choices = []
        for other in anchors:
            if other["name"] != held["name"]:
                choices.append(
                    {
                        "name": other["name"],
                        "kind": "anchor",
                        "similarity": prototype_similarity(held["name"], other["name"]),
                    }
                )
        for name in background:
            if name != held["name"] and name not in anchor_names:
                choices.append(
                    {
                        "name": name,
                        "kind": "background",
                        "similarity": prototype_similarity(held["name"], name),
                    }
                )
        choices.sort(key=lambda row: (-row["similarity"], row["name"], row["kind"]))
        best_anchor_index = next(
            index for index, choice in enumerate(choices) if choice["kind"] == "anchor"
        )
        best_anchor = choices[best_anchor_index]
        fractional_rank = best_anchor_index / max(len(choices) - 1, 1)
        rows.append(
            {
                "held_anchor": held["name"],
                "nearest_other_anchor": best_anchor["name"],
                "nearest_other_similarity": best_anchor["similarity"],
                "rank": best_anchor_index + 1,
                "comparison_count": len(choices),
                "fractional_rank": fractional_rank,
                "top_half": fractional_rank <= 0.5,
            }
        )
    median_rank = statistics.median(row["fractional_rank"] for row in rows)
    top_half_count = sum(row["top_half"] for row in rows)
    return {
        "background_count": len(background),
        "background_sha256": hashlib.sha256(
            ("\n".join(background) + "\n").encode("utf-8")
        ).hexdigest(),
        "rows": rows,
        "top_half_count": top_half_count,
        "median_fractional_rank": median_rank,
        "gates": {
            "at_least_7_of_11_top_half": top_half_count >= 7,
            "median_fractional_rank_at_most_0_35": median_rank <= 0.35,
        },
    }


def normalize(value: float, minimum: float, maximum: float) -> float:
    if maximum <= minimum:
        return 1.0
    return (value - minimum) / (maximum - minimum)


def enrich_pool(pool: list[dict], anchors: list[dict]) -> tuple[list[dict], Counter]:
    enriched = []
    exclusions = Counter()
    for source in pool[:POOL_SIZE]:
        name = source["name"].lower()
        violation = copy_violation(name, anchors)
        if violation:
            exclusions[violation.split(":", 1)[0]] += 1
            continue
        row = dict(source)
        row["normalized_name"] = name
        row.update(candidate_style(name, anchors))
        enriched.append(row)
    return enriched, exclusions


def select(pool: list[dict]) -> list[dict]:
    if not pool:
        return []
    ranges = {}
    for field in ("composite", "global_logp", "source_margin", "prototype_score"):
        values = [float(row[field]) for row in pool]
        ranges[field] = (min(values), max(values))
    relevance = []
    for row in pool:
        quality = normalize(float(row["composite"]), *ranges["composite"])
        global_form = normalize(float(row["global_logp"]), *ranges["global_logp"])
        source_margin = normalize(float(row["source_margin"]), *ranges["source_margin"])
        prototype = normalize(
            float(row["prototype_score"]), *ranges["prototype_score"]
        )
        relevance.append(
            0.40 * quality
            + 0.15 * global_form
            + 0.20 * source_margin
            + 0.25 * prototype
        )
    eligible_groups = {int(row["source_group"]) for row in pool}
    source_cap = 10 if len(eligible_groups) <= 1 else 5 if len(eligible_groups) == 2 else 4
    remaining = sorted(range(len(pool)), key=lambda index: pool[index]["normalized_name"])
    selected = []
    source_counts = Counter()
    family_counts = Counter()
    while len(selected) < PAGE_SIZE:
        best = None
        for index in remaining:
            row = pool[index]
            if source_counts[int(row["source_group"])] >= source_cap:
                continue
            if family_counts[row["prototype_family"]] >= 6:
                continue
            maximum_similarity = max(
                (
                    normalized_edit_similarity(
                        row["normalized_name"], pool[chosen]["normalized_name"]
                    )
                    for chosen in selected
                ),
                default=0.0,
            )
            value = MMR_LAMBDA * relevance[index] - (1.0 - MMR_LAMBDA) * maximum_similarity
            if (
                best is None
                or value > best[0]
                or (
                    value == best[0]
                    and row["normalized_name"] < pool[best[1]]["normalized_name"]
                )
            ):
                best = (value, index)
        if best is None:
            break
        index = best[1]
        selected.append(index)
        source_counts[int(pool[index]["source_group"])] += 1
        family_counts[pool[index]["prototype_family"]] += 1
        remaining.remove(index)
    return [pool[index] for index in selected]


def page_diversity(page: list[dict]) -> float:
    if len(page) < 2:
        return 0.0
    distances = []
    for left in range(len(page)):
        for right in range(left + 1, len(page)):
            distances.append(
                1.0
                - normalized_edit_similarity(
                    page[left]["normalized_name"], page[right]["normalized_name"]
                )
            )
    return sum(distances) / len(distances)


def source_cap_holds(pool: list[dict], selected: list[dict]) -> bool:
    groups = {int(row["source_group"]) for row in pool}
    cap = 10 if len(groups) <= 1 else 5 if len(groups) == 2 else 4
    counts = Counter(int(row["source_group"]) for row in selected)
    return max(counts.values(), default=0) <= cap


def summarize(source: dict, anchors: list[dict], partition: str) -> tuple[list[dict], dict, dict]:
    pages = []
    total_exclusions = Counter()
    for source_page in source["pages"]:
        pool, exclusions = enrich_pool(source_page["pool"], anchors)
        total_exclusions.update(exclusions)
        selected = select(pool)
        baseline = []
        for source_candidate in source_page["selected"]:
            row = dict(source_candidate)
            row["normalized_name"] = row["name"].lower()
            row.update(candidate_style(row["normalized_name"], anchors))
            baseline.append(row)
        selected_prototype_mean = (
            sum(row["prototype_score"] for row in selected) / len(selected)
            if selected
            else 0.0
        )
        baseline_prototype_mean = (
            sum(row["prototype_score"] for row in baseline) / len(baseline)
            if baseline
            else 0.0
        )
        pages.append(
            {
                "brief": source_page["brief"],
                "seed": source_page["seed"],
                "keywords": source_page["keywords"],
                "source_pool_count": len(source_page["pool"]),
                "truncated_pool_count": min(len(source_page["pool"]), POOL_SIZE),
                "eligible_pool_count": len(pool),
                "copy_exclusions": dict(sorted(exclusions.items())),
                "selected": selected,
                "page_diversity": page_diversity(selected),
                "prototype_mean": selected_prototype_mean,
                "baseline_prototype_mean": baseline_prototype_mean,
                "prototype_uplift": selected_prototype_mean - baseline_prototype_mean,
                "prototype_improved": selected_prototype_mean > baseline_prototype_mean,
                "source_cap_holds": source_cap_holds(pool, selected),
                "prototype_family_counts": dict(
                    sorted(Counter(row["prototype_family"] for row in selected).items())
                ),
            }
        )

    selected = [row for page in pages for row in page["selected"]]
    diversities = [page["page_diversity"] for page in pages]
    by_brief = defaultdict(list)
    for page in pages:
        by_brief[page["brief"]].append(page)
    overlaps = []
    brief_unique_counts = []
    page_sets = []
    for brief_pages in by_brief.values():
        names = []
        for page in brief_pages:
            page_names = {row["normalized_name"] for row in page["selected"]}
            names.extend(page_names)
            page_sets.append(tuple(sorted(page_names)))
        brief_unique_counts.append(len(set(names)))
        for left in range(len(brief_pages)):
            for right in range(left + 1, len(brief_pages)):
                left_names = {
                    row["normalized_name"] for row in brief_pages[left]["selected"]
                }
                right_names = {
                    row["normalized_name"] for row in brief_pages[right]["selected"]
                }
                overlaps.append(len(left_names & right_names))

    prototype_mean = (
        sum(row["prototype_score"] for row in selected) / len(selected) if selected else 0.0
    )
    baseline_prototype_mean = statistics.mean(
        page["baseline_prototype_mean"] for page in pages
    )
    summary = {
        "partition": partition,
        "pages": len(pages),
        "selected_cards": len(selected),
        "full_pages": sum(len(page["selected"]) == PAGE_SIZE for page in pages),
        "minimum_source_pool": min(page["source_pool_count"] for page in pages),
        "minimum_eligible_pool": min(page["eligible_pool_count"] for page in pages),
        "copy_exclusions": dict(sorted(total_exclusions.items())),
        "minimum_quality": min((row["composite"] for row in selected), default=0),
        "average_quality": (
            sum(row["composite"] for row in selected) / len(selected) if selected else 0.0
        ),
        "mean_diversity": statistics.mean(diversities),
        "minimum_diversity": min(diversities),
        "minimum_brief_unique": min(brief_unique_counts),
        "mean_overlap": statistics.mean(overlaps),
        "maximum_overlap": max(overlaps),
        "duplicate_page_sets": len(page_sets) - len(set(page_sets)),
        "condition_win_rate": (
            sum(row["semantic_logp"] > row["wrong_max_logp"] for row in selected)
            / len(selected)
            if selected
            else 0.0
        ),
        "prototype_mean": prototype_mean,
        "baseline_prototype_mean": baseline_prototype_mean,
        "prototype_uplift": prototype_mean - baseline_prototype_mean,
        "prototype_improved_pages": sum(page["prototype_improved"] for page in pages),
    }
    required_improved_pages = 48 if partition == "development" else 22
    gates = {
        "all_source_pools_at_least_120": all(
            page["source_pool_count"] >= POOL_SIZE for page in pages
        ),
        "all_eligible_pools_at_least_100": all(
            page["eligible_pool_count"] >= 100 for page in pages
        ),
        "all_pages_10": all(len(page["selected"]) == PAGE_SIZE for page in pages),
        "minimum_quality_at_least_75": summary["minimum_quality"] >= 75,
        "average_quality_at_least_84": summary["average_quality"] >= 84.0,
        "mean_diversity_at_least_0_72": summary["mean_diversity"] >= 0.72,
        "minimum_diversity_at_least_0_60": summary["minimum_diversity"] >= 0.60,
        "minimum_brief_unique_at_least_27": summary["minimum_brief_unique"] >= 27,
        "mean_overlap_at_most_1": summary["mean_overlap"] <= 1.0,
        "maximum_overlap_at_most_3": summary["maximum_overlap"] <= 3,
        "duplicate_page_sets_zero": summary["duplicate_page_sets"] == 0,
        "condition_win_rate_at_least_70pct": summary["condition_win_rate"] >= 0.70,
        "source_lane_caps_hold": all(page["source_cap_holds"] for page in pages),
        "prototype_family_caps_hold": all(
            max(page["prototype_family_counts"].values(), default=0) <= 6
            for page in pages
        ),
        "anchor_copy_violations_zero": all(
            copy_violation(row["normalized_name"], anchors) is None for row in selected
        ),
        "prototype_uplift_at_least_0_03": summary["prototype_uplift"] >= 0.03,
        "prototype_improved_page_count": summary["prototype_improved_pages"]
        >= required_improved_pages,
    }
    return pages, summary, gates


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--partition", choices=tuple(SOURCE_REPORTS), required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    source_path, expected_source_hash = SOURCE_REPORTS[args.partition]
    if sha256(source_path) != expected_source_hash:
        raise ValueError("Phase 303 source report SHA-256 mismatch")
    if sha256(TRAIN_NAMES_PATH) != TRAIN_NAMES_SHA256:
        raise ValueError("Phase 303 train names SHA-256 mismatch")
    source = json.loads(source_path.read_text(encoding="utf-8"))
    expected_partition = "development" if args.partition == "development" else "test"
    if source.get("schema") != "neologism-conceptnet-guided-sampler-report-v1":
        raise ValueError("unexpected Phase 303 report schema")
    if source.get("partition") != expected_partition:
        raise ValueError("Phase 303 source partition mismatch")

    anchors = load_anchors()
    train_names = [
        line.strip()
        for line in TRAIN_NAMES_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    anchor_coherence = coherence(anchors, train_names)
    pages, summary, gates = summarize(source, anchors, args.partition)
    gates = {
        **anchor_coherence["gates"],
        **gates,
        "inherited_source_hard_filters": all(
            source["gates"].get(key, False)
            for key in (
                "all_form_floor",
                "lexical_hazards_zero",
                "review_collisions_zero",
                "unchanged_root_zero",
            )
        ),
    }
    report = {
        "schema": "neologism-personal-prototype-report-v1",
        "phase": 305,
        "partition": args.partition,
        "anchors": anchors,
        "coherence": anchor_coherence,
        "pages": pages,
        "summary": summary,
        "gates": gates,
        "state": "passed" if all(gates.values()) else "failed",
    }
    report_path = args.out / "report.json"
    write_json(report_path, report)
    manifest = {
        "schema": "neologism-personal-prototype-manifest-v1",
        "phase": 305,
        "partition": args.partition,
        "state": report["state"],
        "anchors_sha256": sha256(ANCHORS_PATH),
        "protocol_sha256": sha256(PROTOCOL_PATH),
        "evaluator_sha256": sha256(Path(__file__)),
        "source_report_sha256": expected_source_hash,
        "train_names_sha256": TRAIN_NAMES_SHA256,
        "report_sha256": sha256(report_path),
        "report_bytes": report_path.stat().st_size,
    }
    write_json(args.out / "manifest.json", manifest)
    print(json.dumps({"summary": summary, "gates": gates, "state": report["state"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
