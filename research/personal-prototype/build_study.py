#!/usr/bin/env python3
"""Build the prospectively frozen Phase 305 absolute-rating study source."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
INPUTS = {
    "phase305-development": (
        HERE / "work/development-a/report.json",
        "944167f4d9874738bb4d5c33852713bbce464be82d6c55d202a552b3379867ef",
    ),
    "phase305-test": (
        HERE / "work/sealed-a/report.json",
        "cfb537f3f164c52611ede09c9c009c7607eb71551e83ff9032d58b9144669cf2",
    ),
    "phase303-development": (
        ROOT / "research/conceptnet-guided-sampler/work/development-a/report.json",
        "fb0e2d53a05210ed314323e31adf2f81fa9d3ab84077eeb059d9eddb46b247a5",
    ),
    "phase303-test": (
        ROOT / "research/conceptnet-guided-sampler/work/sealed-a/report.json",
        "7457f1439be84dfb5f7d3a4891961a5fa81686baf8517671f890fa218243f525",
    ),
}
PROTOCOL_PATH = HERE / "HUMAN-PROTOCOL.md"
SOURCE_PATH = HERE / "human-study.json"
KEY_PATH = HERE / "human-study-key.json"
SEEDS = (13, 67, 313)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_bytes(value: object) -> bytes:
    return (
        json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
        + "\n"
    ).encode("utf-8")


def write_json(path: Path, value: object) -> None:
    path.write_bytes(canonical_bytes(value))


def fnv1a64(text: str) -> int:
    value = 0xCBF29CE484222325
    for byte in text.encode("utf-8"):
        value ^= byte
        value = (value * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return value


def load_inputs() -> dict[str, dict]:
    payloads = {}
    for label, (path, expected) in INPUTS.items():
        observed = sha256(path)
        if observed != expected:
            raise ValueError(f"{label} SHA-256 mismatch: {observed}")
        payloads[label] = json.loads(path.read_text(encoding="utf-8"))
    return payloads


def page_map(reports: list[dict]) -> dict[tuple[str, int], dict]:
    result = {}
    for report in reports:
        for page in report["pages"]:
            key = (page["brief"], int(page["seed"]))
            if key in result:
                raise ValueError(f"duplicate page {key}")
            result[key] = page
    return result


def task_id(label: str) -> str:
    return f"t-{fnv1a64(label):016x}"


def choose_unused(page: dict, used: set[str]) -> str:
    for row in page["selected"]:
        normalized = row["name"].lower()
        if normalized not in used:
            used.add(normalized)
            return row["name"]
    raise ValueError(f"page has no unused candidate: {page['brief']} / {page['seed']}")


def main() -> int:
    payloads = load_inputs()
    prototype_pages = page_map(
        [payloads["phase305-development"], payloads["phase305-test"]]
    )
    control_pages = page_map(
        [payloads["phase303-development"], payloads["phase303-test"]]
    )
    briefs = sorted(
        {brief for brief, _seed in prototype_pages},
        key=lambda brief: (fnv1a64("phase305-human-brief-v1|" + brief), brief),
    )[:12]
    if len(briefs) != 12:
        raise ValueError("expected twelve retained briefs")

    used: set[str] = set()
    primary_tasks = []
    key_rows = []
    for pair_index, brief in enumerate(briefs, start=1):
        seed = SEEDS[fnv1a64("phase305-human-seed-v1|" + brief) % len(SEEDS)]
        prototype_name = choose_unused(prototype_pages[(brief, seed)], used)
        control_name = choose_unused(control_pages[(brief, seed)], used)
        pair_id = f"p{pair_index:02d}"
        for arm, name in (("prototype", prototype_name), ("control", control_name)):
            identifier = task_id(f"phase305-human-primary-v1|{pair_id}|{arm}|{brief}|{name}")
            primary_tasks.append(
                {"id": identifier, "brief": brief, "name": name, "repeatOf": None}
            )
            key_rows.append(
                {
                    "taskId": identifier,
                    "pairId": pair_id,
                    "arm": arm,
                    "brief": brief,
                    "name": name,
                    "seed": seed,
                }
            )

    repeat_sources = sorted(
        primary_tasks,
        key=lambda task: (
            fnv1a64("phase305-human-repeat-v1|" + task["id"]),
            task["id"],
        ),
    )[:6]
    repeats = []
    for task in repeat_sources:
        identifier = task_id("phase305-human-repeat-task-v1|" + task["id"])
        repeats.append(
            {
                "id": identifier,
                "brief": task["brief"],
                "name": task["name"],
                "repeatOf": task["id"],
            }
        )

    tasks = primary_tasks + repeats
    tasks.sort(
        key=lambda task: (
            fnv1a64("phase305-human-order-v1|" + task["id"]),
            task["id"],
        )
    )
    if len(tasks) != 30 or len({task["id"] for task in tasks}) != 30:
        raise ValueError("study task cardinality failure")

    source = {
        "schema": "neologism-personal-prototype-study-v1",
        "protocolSha256": sha256(PROTOCOL_PATH),
        "taskCount": len(tasks),
        "choices": ["use", "maybe", "no"],
        "tasks": tasks,
    }
    write_json(SOURCE_PATH, source)
    key = {
        "schema": "neologism-personal-prototype-study-key-v1",
        "protocolSha256": sha256(PROTOCOL_PATH),
        "sourceSha256": sha256(SOURCE_PATH),
        "primaryCount": len(primary_tasks),
        "repeatCount": len(repeats),
        "pairs": key_rows,
    }
    write_json(KEY_PATH, key)
    print(
        json.dumps(
            {
                "sourceSha256": sha256(SOURCE_PATH),
                "keySha256": sha256(KEY_PATH),
                "briefs": len(briefs),
                "primary": len(primary_tasks),
                "repeats": len(repeats),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
