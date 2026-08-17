#!/usr/bin/env python3
"""Build a grouped, deterministic train/validation/test dataset."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import gzip
import hashlib
from io import BytesIO
import json
from pathlib import Path
import re
import subprocess
import sys


NAME_RE = re.compile(r"^[A-Za-z]{4,12}$")
QID_RE = re.compile(r"^Q[1-9][0-9]*$")
VOCAB_SIZE = 512
MIN_RECORDS = 8_000


class Dsu:
    def __init__(self, keys: list[str]) -> None:
        self.parent = {key: key for key in keys}

    def find(self, key: str) -> str:
        parent = self.parent[key]
        if parent != key:
            self.parent[key] = self.find(parent)
        return self.parent[key]

    def union(self, left: str, right: str) -> None:
        a, b = self.find(left), self.find(right)
        if a == b:
            return
        smaller, larger = sorted((a, b))
        self.parent[larger] = smaller


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def deterministic_gzip(data: bytes) -> bytes:
    output = BytesIO()
    with gzip.GzipFile(fileobj=output, mode="wb", mtime=0) as stream:
        stream.write(data)
    return output.getvalue()


def read_snapshot(path: Path) -> list[dict]:
    manifest_path = path.with_name("wikidata-manifest.json")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    compressed = path.read_bytes()
    if sha256(compressed) != manifest.get("snapshot_sha256"):
        raise RuntimeError("Wikidata snapshot hash does not match its manifest")
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        records = [json.loads(line) for line in stream if line.strip()]
    if len(records) != manifest.get("records"):
        raise RuntimeError("Wikidata snapshot row count does not match its manifest")
    seen = set()
    list_fields = (
        "classes", "aliases", "genres", "uses", "industries", "subjects",
        "developers", "owners", "parents",
    )
    for record in records:
        if not isinstance(record, dict):
            raise RuntimeError("Wikidata snapshot contains a non-object row")
        record_qid = record.get("qid")
        if not isinstance(record_qid, str) or not QID_RE.fullmatch(record_qid):
            raise RuntimeError("Wikidata snapshot contains an invalid QID")
        if record_qid in seen:
            raise RuntimeError(f"duplicate Wikidata QID: {record_qid}")
        seen.add(record_qid)
        if not isinstance(record.get("name"), str) or not NAME_RE.fullmatch(record["name"]):
            raise RuntimeError(f"invalid Wikidata label for {record_qid}")
        if not isinstance(record.get("description"), str) or not record["description"].strip():
            raise RuntimeError(f"missing Wikidata description for {record_qid}")
        for field in list_fields:
            values = record.get(field)
            if not isinstance(values, list) or not all(isinstance(value, str) for value in values):
                raise RuntimeError(f"invalid {field} for {record_qid}")
    return records


def metadata_text(record: dict) -> str:
    fields = [record["description"]]
    for key in ("classes", "genres", "uses", "industries", "subjects"):
        fields.extend(record.get(key, []))
    return ". ".join(value for value in fields if value)


def keyword_helper(repo: Path, rows: list[dict]) -> dict[str, dict]:
    command = [
        str(Path.home() / ".cargo" / "bin" / "cargo.exe"),
        "run", "-q", "-p", "neologism-core", "--example", "holistic_probe", "--release", "--",
        "keywords",
    ]
    payload = "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows)
    process = subprocess.run(
        command,
        cwd=repo,
        input=payload,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if process.returncode:
        raise RuntimeError(f"keyword helper failed ({process.returncode}):\n{process.stderr}")
    output = {}
    for line in process.stdout.splitlines():
        item = json.loads(line)
        output[item["id"]] = item
    return output


def split_for(group: str) -> str:
    value = int.from_bytes(hashlib.sha256(group.encode("utf-8")).digest()[:8], "big")
    share = value / 2**64
    if share < 0.8:
        return "train"
    if share < 0.9:
        return "validation"
    return "test"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()

    raw = read_snapshot(args.raw)
    eligible = [record for record in raw if NAME_RE.fullmatch(record["name"])]
    helper_rows = [
        {"id": record["qid"], "text": metadata_text(record), "name": record["name"]}
        for record in eligible
    ]
    helper = keyword_helper(args.repo, helper_rows)

    # A normalized spelling represents one target. Prefer the record with more
    # semantic metadata, then the lowest QID for a deterministic tie break.
    by_name: dict[str, list[dict]] = defaultdict(list)
    for record in eligible:
        result = helper[record["qid"]]
        candidate = {
            "qid": record["qid"],
            "name": record["name"].lower(),
            "keywords": result["keywords"],
            "stem": result["stem"],
            "group_ids": sorted(set(
                record.get("owners", [])
                + record.get("developers", [])
                + record.get("parents", [])
            )),
            "source_classes": record["classes"],
            "metadata_size": len(metadata_text(record)),
        }
        by_name[candidate["name"]].append(candidate)
    records = []
    for candidates in by_name.values():
        candidates.sort(key=lambda item: (-item["metadata_size"], item["qid"]))
        records.append(candidates[0])
    records.sort(key=lambda item: (item["name"], item["qid"]))

    dsu = Dsu([record["qid"] for record in records])
    seen_groups: dict[str, str] = {}
    seen_stems: dict[str, str] = {}
    for record in records:
        for group in record["group_ids"]:
            if group in seen_groups:
                dsu.union(record["qid"], seen_groups[group])
            else:
                seen_groups[group] = record["qid"]
        stem = record["stem"]
        if stem in seen_stems:
            dsu.union(record["qid"], seen_stems[stem])
        else:
            seen_stems[stem] = record["qid"]

    components: dict[str, list[str]] = defaultdict(list)
    for record in records:
        components[dsu.find(record["qid"])].append(record["qid"])
    component_key = {
        root: min(members)
        for root, members in components.items()
    }
    for record in records:
        root = dsu.find(record["qid"])
        record["group_id"] = component_key[root]
        record["split"] = split_for(record["group_id"])

    counts = Counter(
        keyword
        for record in records
        if record["split"] == "train"
        for keyword in record["keywords"]
    )
    ranked_train_keywords = [
        keyword
        for keyword, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        if count >= 2
    ]

    # The canonical prompts are a frozen product-compatibility calibration set,
    # not the sealed Wikidata test partition. Reserve the smallest deterministic
    # set of train-observed words that covers those prompts, then fill the fixed
    # 512-entry budget by train frequency. This prevents generic source prose
    # from consuming the entire condition vocabulary while keeping every token
    # strictly train-derived.
    canonical_path = Path(__file__).with_name("canonical_briefs.json")
    canonical = json.loads(canonical_path.read_text(encoding="utf-8"))
    canonical_helper = keyword_helper(
        args.repo,
        [{"id": str(index), "text": brief, "name": brief} for index, brief in enumerate(canonical)],
    )
    canonical_words = [
        set(canonical_helper[str(index)]["keywords"]) & set(ranked_train_keywords)
        for index in range(len(canonical))
    ]
    impossible = [canonical[index] for index, words in enumerate(canonical_words) if not words]
    if impossible:
        raise RuntimeError(
            "canonical prompts have no train-observed condition word: "
            + json.dumps(impossible, sort_keys=True)
        )
    uncovered = set(range(len(canonical)))
    reserved: list[str] = []
    while uncovered:
        candidates = []
        for keyword in ranked_train_keywords:
            covered = {index for index in uncovered if keyword in canonical_words[index]}
            if covered:
                candidates.append((len(covered), counts[keyword], keyword, covered))
        if not candidates:
            raise RuntimeError("canonical vocabulary reservation stalled")
        _coverage, _frequency, keyword, covered = max(
            candidates,
            key=lambda item: (item[0], item[1], tuple(-ord(char) for char in item[2])),
        )
        reserved.append(keyword)
        uncovered -= covered
    vocab = reserved + [
        keyword for keyword in ranked_train_keywords if keyword not in set(reserved)
    ][:VOCAB_SIZE - len(reserved)]
    vocab_set = set(vocab)
    filtered = []
    for record in records:
        known = [keyword for keyword in record["keywords"] if keyword in vocab_set]
        if not known:
            continue
        filtered.append({
            "qid": record["qid"],
            "name": record["name"],
            "keywords": known[:6],
            "group_id": record["group_id"],
            "split": record["split"],
            "source_classes": record["source_classes"],
        })
    if len(filtered) < MIN_RECORDS:
        raise RuntimeError(f"dataset gate failed: {len(filtered)} < {MIN_RECORDS} eligible records")

    names_by_split = defaultdict(set)
    groups_by_split = defaultdict(set)
    for record in filtered:
        names_by_split[record["split"]].add(record["name"])
        groups_by_split[record["split"]].add(record["group_id"])
    splits = ("train", "validation", "test")
    for index, left in enumerate(splits):
        for right in splits[index + 1:]:
            if names_by_split[left] & names_by_split[right]:
                raise RuntimeError(f"name leakage between {left} and {right}")
            if groups_by_split[left] & groups_by_split[right]:
                raise RuntimeError(f"group leakage between {left} and {right}")

    canonical_coverage = []
    for index, brief in enumerate(canonical):
        extracted = canonical_helper[str(index)]["keywords"]
        known = [keyword for keyword in extracted if keyword in vocab_set]
        canonical_coverage.append({"brief": brief, "extracted": extracted, "known": known})
    unsupported = [row["brief"] for row in canonical_coverage if not row["known"]]
    if unsupported:
        ranked = {
            keyword: index + 1
            for index, (keyword, _count) in enumerate(
                sorted(counts.items(), key=lambda item: (-item[1], item[0]))
            )
        }
        details = [
            {
                "brief": row["brief"],
                "extracted": row["extracted"],
                "train_frequency": {
                    keyword: counts.get(keyword, 0) for keyword in row["extracted"]
                },
                "frequency_rank": {
                    keyword: ranked.get(keyword) for keyword in row["extracted"]
                },
            }
            for row in canonical_coverage
            if not row["known"]
        ]
        raise RuntimeError(
            "canonical keyword coverage gate failed:\n"
            + json.dumps(details, indent=2, sort_keys=True)
        )

    review = set()
    for record in raw:
        for value in [record["name"], *record.get("aliases", [])]:
            if NAME_RE.fullmatch(value):
                review.add(value.lower())

    args.out.mkdir(parents=True, exist_ok=True)
    dataset_lines = [json.dumps(row, sort_keys=True) for row in filtered]
    dataset_payload = ("\n".join(dataset_lines) + "\n").encode("utf-8")
    dataset_gzip = deterministic_gzip(dataset_payload)
    dataset_path = args.out / "dataset.jsonl.gz"
    dataset_path.write_bytes(dataset_gzip)
    vocab_payload = ("\n".join(vocab) + "\n").encode("utf-8")
    (args.out / "keyword-vocab.txt").write_bytes(vocab_payload)
    review_payload = ("\n".join(sorted(review)) + "\n").encode("utf-8")
    (args.out / "review-names.txt").write_bytes(review_payload)
    coverage_payload = (json.dumps(canonical_coverage, indent=2, sort_keys=True) + "\n").encode("utf-8")
    (args.out / "canonical-keyword-coverage.json").write_bytes(coverage_payload)

    split_counts = Counter(record["split"] for record in filtered)
    manifest = {
        "schema": "neologism-holistic-dataset-v1",
        "records": len(filtered),
        "split_counts": dict(sorted(split_counts.items())),
        "unique_groups": len({record["group_id"] for record in filtered}),
        "vocab_size": len(vocab),
        "vocab_selection": "canonical-minimum-cover-then-train-frequency-v1",
        "canonical_reserved_keywords": reserved,
        "canonical_briefs": len(canonical),
        "canonical_unsupported": unsupported,
        "review_names": len(review),
        "dataset_sha256": sha256(dataset_gzip),
        "dataset_uncompressed_sha256": sha256(dataset_payload),
        "vocab_sha256": sha256(vocab_payload),
        "review_names_sha256": sha256(review_payload),
        "canonical_coverage_sha256": sha256(coverage_payload),
        "source_snapshot_sha256": sha256(args.raw.read_bytes()),
    }
    manifest_payload = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")
    (args.out / "dataset-manifest.json").write_bytes(manifest_payload)
    print(manifest_payload.decode("utf-8"), end="")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"dataset build failed: {error}", file=sys.stderr)
        raise
