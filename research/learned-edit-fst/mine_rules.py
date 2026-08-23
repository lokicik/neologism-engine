#!/usr/bin/env python3
"""Mine deterministic edit-one spelling rules from the frozen train split."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

WORD = re.compile(r"^[a-z]{4,12}$")
VOWELS = set("aeiouy")


def read_words(path: Path) -> set[str]:
    return {
        line.strip().lower()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#") and WORD.fullmatch(line.strip().lower())
    }


def wordnet_counts(path: Path) -> dict[str, int]:
    counts = defaultdict(int)
    with zipfile.ZipFile(path) as archive:
        for raw in archive.read("wordnet/cntlist.rev").decode("utf-8").splitlines():
            fields = raw.split()
            if len(fields) >= 3:
                counts[fields[0].split("%", 1)[0].lower()] += int(fields[2])
    return counts


def deletion_keys(word: str):
    for index in range(len(word)):
        yield word[:index] + word[index + 1 :]


def edit_operation(anchor: str, label: str):
    if len(anchor) == len(label):
        differences = [index for index, (left, right) in enumerate(zip(anchor, label)) if left != right]
        if len(differences) != 1:
            return None
        index = differences[0]
        return "sub", index, anchor[index], label[index]
    if len(anchor) == len(label) + 1:
        for index in range(len(anchor)):
            if anchor[:index] + anchor[index + 1 :] == label:
                return "del", index, anchor[index], "_"
        return None
    if len(label) == len(anchor) + 1:
        for index in range(len(label)):
            if label[:index] + label[index + 1 :] == anchor:
                return "ins", index, "_", label[index]
    return None


def char_class(character: str | None) -> str:
    if character is None:
        return "boundary"
    return "vowel" if character in VOWELS else "consonant"


def rule_identity(anchor: str, operation):
    kind, index, old, new = operation
    length = len(anchor)
    if index < 2:
        bucket = "head"
    elif index >= length - 2:
        bucket = "tail"
    else:
        bucket = "interior"
    left = anchor[index - 1] if index > 0 else None
    right_index = index + (1 if kind != "ins" else 0)
    right = anchor[right_index] if right_index < length else None
    return f"{kind}:{old}>{new}:{bucket}:{char_class(left)}:{char_class(right)}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--wordnet", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    repo = args.repo.resolve()
    curated = read_words(repo / "core/data/realwords.txt")
    common = read_words(repo / "core/data/common_words.txt")
    counts = wordnet_counts(args.wordnet)
    anchors = {word for word in common | curated if counts.get(word, 0) >= 2 or word in curated}
    deletion_index = defaultdict(set)
    for anchor in anchors:
        for key in deletion_keys(anchor):
            deletion_index[key].add(anchor)

    train_records = []
    non_train_seen = 0
    with gzip.open(args.dataset, "rt", encoding="utf-8") as source:
        for line in source:
            row = json.loads(line)
            if row["split"] == "train":
                train_records.append(row)
            else:
                non_train_seen += 1

    paired = []
    for row in train_records:
        label = row["name"].lower()
        if not WORD.fullmatch(label) or label in anchors:
            continue
        candidates = set(deletion_index.get(label, ()))
        for key in deletion_keys(label):
            if key in anchors:
                candidates.add(key)
            candidates.update(anchor for anchor in deletion_index.get(key, ()) if len(anchor) == len(label))
        valid = [(anchor, edit_operation(anchor, label)) for anchor in candidates]
        valid = [(anchor, operation) for anchor, operation in valid if operation is not None]
        if not valid:
            continue
        anchor, operation = min(
            valid,
            key=lambda item: (-counts.get(item[0], 0), -int(item[0] in curated), item[0]),
        )
        paired.append(
            {
                "label": label,
                "group": row["group_id"],
                "anchor": anchor,
                "semcorCount": counts.get(anchor, 0),
                "rule": rule_identity(anchor, operation),
            }
        )

    by_rule = defaultdict(lambda: {"labels": set(), "groups": set(), "examples": []})
    for row in paired:
        bucket = by_rule[row["rule"]]
        bucket["labels"].add(row["label"])
        bucket["groups"].add(row["group"])
        if len(bucket["examples"]) < 8:
            bucket["examples"].append({"anchor": row["anchor"], "label": row["label"]})
    rules = [
        {
            "rule": rule,
            "labelSupport": len(values["labels"]),
            "groupSupport": len(values["groups"]),
            "examples": values["examples"],
            "labels": sorted(values["labels"]),
            "groups": sorted(values["groups"]),
        }
        for rule, values in by_rule.items()
        if len(values["labels"]) >= 8 and len(values["groups"]) >= 5
    ]
    rules.sort(key=lambda row: (-row["groupSupport"], -row["labelSupport"], row["rule"]))
    rules = rules[:64]
    covered_labels = {label for rule in rules for label in rule["labels"]}
    covered_groups = {group for rule in rules for group in rule["groups"]}
    unique_pairs = {(row["label"], row["anchor"]) for row in paired}
    paired_groups = {row["group"] for row in paired}
    gates = {
        "paired_labels_200": len(unique_pairs) >= 200,
        "paired_groups_150": len(paired_groups) >= 150,
        "eligible_rules_8": len(rules) >= 8,
        "covered_labels_120": len(covered_labels) >= 120,
        "covered_groups_100": len(covered_groups) >= 100,
        "non_train_excluded": non_train_seen > 0,
    }
    output = {
        "schema": "learned-edit-fst-preflight.v1",
        "summary": {
            "trainRecords": len(train_records),
            "nonTrainRecordsExcluded": non_train_seen,
            "anchorVocabulary": len(anchors),
            "pairedLabels": len(unique_pairs),
            "pairedGroups": len(paired_groups),
            "eligibleRules": len(rules),
            "coveredLabels": len(covered_labels),
            "coveredGroups": len(covered_groups),
        },
        "gates": gates,
        "rules": rules,
    }
    payload = (json.dumps(output, sort_keys=True, separators=(",", ":")) + "\n").encode()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(payload)
    print(json.dumps({"sha256": hashlib.sha256(payload).hexdigest(), **output["summary"], "gates": gates}, sort_keys=True))
    return 0 if all(gates.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
