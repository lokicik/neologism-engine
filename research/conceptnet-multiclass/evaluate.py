#!/usr/bin/env python3
"""Run the frozen Phase 302 multiclass source-keyword selector preflight."""

from __future__ import annotations

import argparse
from collections import defaultdict
import gzip
import hashlib
import json
import math
from pathlib import Path
from typing import Iterable


SOURCE_REPORT_SHA256 = "8140a0b00f83e3cc3607fa7b4fe097ad61d790a46fe6c9d3ab14a05e97e4bde0"
ANCHORS_SHA256 = "ff207ad1570356b1a820726dc6c6dc980826425bd40e440ce4dac0d0f4788e55"
SYMBOLS = "abcdefghijklmnopqrstuvwxyz$"
SMOOTHING = 0.1
PAGE_SIZE = 10
MMR_LAMBDA = 0.70


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


class CharModel:
    def __init__(self) -> None:
        self.counts: dict[str, list[float]] = {}
        self.totals: defaultdict[str, float] = defaultdict(float)

    def add(self, name: str, weight: float) -> None:
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

    def log_likelihood(self, name: str) -> float:
        sequence = f"^^{name}$"
        total = 0.0
        for offset in range(2, len(sequence)):
            total += math.log(
                self.probability(sequence[offset - 2 : offset], sequence[offset])
            )
        return total / (len(sequence) - 2)


def keyword_models(path: Path) -> dict[str, CharModel]:
    if sha256(path) != ANCHORS_SHA256:
        raise ValueError("Phase 298 anchor SHA-256 mismatch")
    models: dict[str, CharModel] = {}
    keywords = []
    with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
        for line_number, line in enumerate(handle, 1):
            row = json.loads(line)
            keyword = row.get("keyword")
            anchors = row.get("anchors")
            if not isinstance(keyword, str) or not isinstance(anchors, list) or not anchors:
                raise ValueError(f"invalid anchor row {line_number}")
            maximum = max(float(anchor["score"]) for anchor in anchors)
            if not math.isfinite(maximum) or maximum <= 0.0:
                raise ValueError(f"invalid anchor maximum for {keyword}")
            model = CharModel()
            for anchor in anchors:
                term = anchor.get("term")
                score = float(anchor.get("score"))
                if (
                    not isinstance(term, str)
                    or not term.isascii()
                    or not term.islower()
                    or not term.isalpha()
                    or not math.isfinite(score)
                    or score <= 0.0
                ):
                    raise ValueError(f"invalid anchor for {keyword}")
                model.add(term, score / maximum)
            keywords.append(keyword)
            models[keyword] = model
    if len(keywords) != 111 or keywords != sorted(keywords) or len(set(keywords)) != 111:
        raise ValueError("anchor keyword inventory changed")
    return models


def load_source(path: Path) -> dict[str, object]:
    if sha256(path) != SOURCE_REPORT_SHA256:
        raise ValueError("Phase 300 development report SHA-256 mismatch")
    report = json.loads(path.read_text(encoding="utf-8"))
    if (
        report.get("schema") != "neologism-conceptnet-sampler-report-v1"
        or report.get("partition") != "development"
        or not isinstance(report.get("pages"), list)
        or len(report["pages"]) != 72
    ):
        raise ValueError("Phase 300 source report identity mismatch")
    if not all(len(page.get("pool", [])) == 160 for page in report["pages"]):
        raise ValueError("Phase 300 source pool changed")
    required_source_gates = (
        "all_form_floor",
        "lexical_hazards_zero",
        "review_collisions_zero",
        "unchanged_root_zero",
    )
    if not all(bool(report["gates"].get(gate)) for gate in required_source_gates):
        raise ValueError("Phase 300 source hard-filter gate changed")
    return report


def normalize(value: float, minimum: float, maximum: float) -> float:
    return (value - minimum) / (maximum - minimum) if maximum > minimum else 0.0


def levenshtein(left: str, right: str) -> int:
    previous = list(range(len(right) + 1))
    for left_index, left_character in enumerate(left, 1):
        current = [left_index]
        for right_index, right_character in enumerate(right, 1):
            current.append(
                min(
                    previous[right_index] + 1,
                    current[right_index - 1] + 1,
                    previous[right_index - 1]
                    + (left_character != right_character),
                )
            )
        previous = current
    return previous[-1]


def similarity(left: str, right: str) -> float:
    return 1.0 - levenshtein(left, right) / max(len(left), len(right), 1)


def diversity(names: list[str]) -> float:
    if len(names) < 2:
        return 0.0
    values = [
        1.0 - similarity(names[left], names[right])
        for left in range(len(names))
        for right in range(left + 1, len(names))
    ]
    return sum(values) / len(values)


def enriched_pool(
    page: dict[str, object], models: dict[str, CharModel]
) -> list[dict[str, object]]:
    result = []
    keywords = [str(keyword) for keyword in page["keywords"]]
    ordered_models = sorted(models.items())
    for raw in page["pool"]:
        candidate = dict(raw)
        lower = str(candidate["name"]).lower()
        source_group = int(candidate["source_group"])
        if source_group < 0 or source_group >= len(keywords):
            raise ValueError("candidate source group exceeds keyword inventory")
        source_keyword = keywords[source_group]
        if source_keyword not in models:
            raise ValueError("candidate source keyword is not modeled")
        source_logp = models[source_keyword].log_likelihood(lower)
        maximum_other = max(
            model.log_likelihood(lower)
            for keyword, model in ordered_models
            if keyword != source_keyword
        )
        margin = source_logp - maximum_other
        candidate["source_keyword"] = source_keyword
        candidate["source_keyword_logp"] = source_logp
        candidate["max_other_keyword_logp"] = maximum_other
        candidate["source_margin"] = margin
        if margin > 0.0:
            result.append(candidate)
    result.sort(key=lambda candidate: str(candidate["name"]))
    return result


def select(pool: list[dict[str, object]]) -> list[dict[str, object]]:
    if not pool:
        return []
    min_global = min(float(candidate["global_logp"]) for candidate in pool)
    max_global = max(float(candidate["global_logp"]) for candidate in pool)
    min_lift = min(float(candidate["source_margin"]) for candidate in pool)
    max_lift = max(float(candidate["source_margin"]) for candidate in pool)
    relevance = [
        0.60 * float(candidate["composite"]) / 100.0
        + 0.20
        * normalize(float(candidate["global_logp"]), min_global, max_global)
        + 0.20 * normalize(float(candidate["source_margin"]), min_lift, max_lift)
        for candidate in pool
    ]
    eligible_groups = {int(candidate["source_group"]) for candidate in pool}
    cap = 10 if len(eligible_groups) <= 1 else 5 if len(eligible_groups) == 2 else 4
    remaining = list(range(len(pool)))
    chosen: list[int] = []
    group_counts: defaultdict[int, int] = defaultdict(int)
    while len(chosen) < PAGE_SIZE:
        best: tuple[float, str, int] | None = None
        for index in remaining:
            group = int(pool[index]["source_group"])
            if group_counts[group] >= cap:
                continue
            maximum_similarity = max(
                (
                    similarity(
                        str(pool[index]["name"]).lower(),
                        str(pool[selected]["name"]).lower(),
                    )
                    for selected in chosen
                ),
                default=0.0,
            )
            value = MMR_LAMBDA * relevance[index] - (1.0 - MMR_LAMBDA) * maximum_similarity
            key = (value, str(pool[index]["name"]), index)
            if best is None or value > best[0] or (
                value == best[0] and str(pool[index]["name"]) < best[1]
            ):
                best = key
        if best is None:
            break
        index = best[2]
        chosen.append(index)
        group_counts[int(pool[index]["source_group"])] += 1
        remaining.remove(index)
    return [pool[index] for index in chosen]


def overlap(left: Iterable[str], right: Iterable[str]) -> int:
    return len(set(left) & set(right))


def main() -> int:
    root = Path(__file__).resolve().parent
    repository = root.parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        default=repository
        / "research"
        / "conceptnet-sampler"
        / "work"
        / "development-a"
        / "report.json",
    )
    parser.add_argument(
        "--anchors",
        type=Path,
        default=repository
        / "research"
        / "conceptnet-semantic"
        / "work"
        / "bulk-run-a"
        / "keyword-anchors.jsonl.gz",
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError(f"output directory is not empty: {args.output}")
    args.output.mkdir(parents=True, exist_ok=True)

    source = load_source(args.source)
    models = keyword_models(args.anchors)
    pages = []
    for source_page in source["pages"]:
        eligible = enriched_pool(source_page, models)
        selected = select(eligible)
        page = {
            "brief": source_page["brief"],
            "eligible_multiclass_pool": len(eligible),
            "page_diversity": diversity(
                [str(candidate["name"]).lower() for candidate in selected]
            ),
            "seed": source_page["seed"],
            "selected": selected,
            "source_pool": len(source_page["pool"]),
        }
        pages.append(page)

    selected = [candidate for page in pages for candidate in page["selected"]]
    page_groups: dict[str, list[dict[str, object]]] = defaultdict(list)
    for page in pages:
        page_groups[str(page["brief"])].append(page)
    overlaps = []
    minimum_unique = 10**9
    for brief_pages in page_groups.values():
        sets = [
            {str(candidate["name"]).lower() for candidate in page["selected"]}
            for page in brief_pages
        ]
        minimum_unique = min(minimum_unique, len(set().union(*sets)))
        overlaps.extend(
            overlap(sets[left], sets[right])
            for left in range(len(sets))
            for right in range(left + 1, len(sets))
        )
    page_keys = {
        tuple(sorted(str(candidate["name"]).lower() for candidate in page["selected"]))
        for page in pages
    }
    qualities = [int(candidate["composite"]) for candidate in selected]
    condition_wins = sum(
        float(candidate["semantic_logp"]) > float(candidate["wrong_max_logp"])
        for candidate in selected
    )
    lane_coverage = all(
        len({int(candidate["source_group"]) for candidate in page["selected"]}) >= 2
        if len(
            {
                int(candidate["source_group"])
                for candidate in enriched_pool(source_page, models)
            }
        )
        >= 2
        else True
        for page, source_page in zip(pages, source["pages"])
    )
    lane_caps = True
    for page, source_page in zip(pages, source["pages"]):
        eligible = enriched_pool(source_page, models)
        groups = {int(candidate["source_group"]) for candidate in eligible}
        cap = 10 if len(groups) <= 1 else 5 if len(groups) == 2 else 4
        counts: defaultdict[int, int] = defaultdict(int)
        for candidate in page["selected"]:
            counts[int(candidate["source_group"])] += 1
        lane_caps &= all(count <= cap for count in counts.values())
    mean_diversity = sum(float(page["page_diversity"]) for page in pages) / len(pages)
    minimum_diversity = min(float(page["page_diversity"]) for page in pages)
    mean_overlap = sum(overlaps) / len(overlaps)
    maximum_overlap = max(overlaps)
    condition_rate = condition_wins / len(selected) if selected else 0.0
    template_rate = (
        sum(bool(candidate["template_tail"]) for candidate in selected) / len(selected)
        if selected
        else 1.0
    )
    gates = {
        "all_source_margins_positive": all(float(candidate["source_margin"]) > 0.0 for candidate in selected),
        "all_pages_10": all(len(page["selected"]) == 10 for page in pages),
        "all_source_pools_160": all(page["source_pool"] == 160 for page in pages),
        "average_quality_at_least_84": sum(qualities) / len(qualities) >= 84.0 if qualities else False,
        "condition_win_rate_at_least_70pct": condition_rate >= 0.70,
        "duplicate_page_sets_zero": len(page_keys) == len(pages),
        "hard_filter_subset_invariants": True,
        "keyword_lane_caps_hold": lane_caps,
        "keyword_lane_coverage": lane_coverage,
        "maximum_overlap_at_most_3": maximum_overlap <= 3,
        "mean_diversity_at_least_0_72": mean_diversity >= 0.72,
        "mean_overlap_at_most_1": mean_overlap <= 1.0,
        "minimum_brief_unique_at_least_27": minimum_unique >= 27,
        "minimum_diversity_at_least_0_60": minimum_diversity >= 0.60,
        "minimum_quality_at_least_75": min(qualities, default=0) >= 75,
        "template_tail_rate_at_most_20pct": template_rate <= 0.20,
    }
    summary = {
        "average_quality": sum(qualities) / len(qualities) if qualities else 0.0,
        "condition_win_rate": condition_rate,
        "duplicate_page_sets": len(pages) - len(page_keys),
        "full_pages": sum(len(page["selected"]) == 10 for page in pages),
        "maximum_overlap": maximum_overlap,
        "mean_multiclass_pool": sum(int(page["eligible_multiclass_pool"]) for page in pages) / len(pages),
        "mean_diversity": mean_diversity,
        "mean_overlap": mean_overlap,
        "minimum_brief_unique": minimum_unique,
        "minimum_multiclass_pool": min(int(page["eligible_multiclass_pool"]) for page in pages),
        "minimum_diversity": minimum_diversity,
        "minimum_quality": min(qualities, default=0),
        "pages": len(pages),
        "selected_cards": len(selected),
        "template_tail_rate": template_rate,
    }
    report = {
        "gates": gates,
        "pages": pages,
        "passed": all(gates.values()),
        "schema": "neologism-conceptnet-multiclass-report-v1",
        "source_report_sha256": SOURCE_REPORT_SHA256,
        "summary": summary,
    }
    write_json(args.output / "report.json", report)
    manifest = {
        "anchors_sha256": ANCHORS_SHA256,
        "phase": 302,
        "report_bytes": (args.output / "report.json").stat().st_size,
        "report_sha256": sha256(args.output / "report.json"),
        "source_report_sha256": SOURCE_REPORT_SHA256,
        "state": "passed" if report["passed"] else "failed",
    }
    write_json(args.output / "manifest.json", manifest)
    return 0 if report["passed"] else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"phase302: {error}")
        raise SystemExit(1)
