#!/usr/bin/env python3
"""Run Phase 300 against a clean archive of the frozen committed core."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile


BASE_COMMIT = "ccdb67b49ae053f10ed7bdd4ee683d622d2c50b7"
DATASET_SHA = "dd4b7b977ea62aea570f7ec5b9941ca06174fd7cbb882a39ffbd2183f488d9d6"
TRAIN_SHA = "fe974bf069a620061ed60727154861b2373a4626f8d185a81e7b5aa4392b9c70"
VALIDATION_SHA = "fc464b1b7486e3e6ab58f69cebfcb8cba89705177c9ff8bf77b91b685e5e51a4"
BRIEFS_SHA = "4b5163775bc97c7feeae85e6894d7a4160eb66333de8a2fca4d5fa898ee01caa"
REVIEW_SHA = "87c45e7373ed2715774eea2f22ec28c975cea8139abd3ee513150762a373e09e"
ANCHORS_SHA = "ff207ad1570356b1a820726dc6c6dc980826425bd40e440ce4dac0d0f4788e55"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_sha(path: Path, expected: str) -> None:
    actual = sha256(path)
    if actual != expected:
        raise SystemExit(f"SHA-256 mismatch for {path}: {actual} != {expected}")


def derive_corpora(dataset: Path, output: Path) -> tuple[Path, Path]:
    require_sha(dataset, DATASET_SHA)
    partitions: dict[str, set[str]] = {"train": set(), "validation": set()}
    with gzip.open(dataset, "rt", encoding="utf-8", newline="") as handle:
        for line in handle:
            row = json.loads(line)
            split = row.get("split")
            if split in partitions:
                partitions[split].add(row["name"])
    output.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    for split in ("train", "validation"):
        path = output / f"{split}-names.txt"
        path.write_text(
            "".join(f"{name}\n" for name in sorted(partitions[split])),
            encoding="ascii",
            newline="\n",
        )
        paths[split] = path
    require_sha(paths["train"], TRAIN_SHA)
    require_sha(paths["validation"], VALIDATION_SHA)
    return paths["train"], paths["validation"]


def expand_anchors(source: Path, output: Path) -> Path:
    require_sha(source, ANCHORS_SHA)
    target = output / "keyword-anchors.jsonl"
    with gzip.open(source, "rt", encoding="utf-8", newline="") as input_handle:
        rows = [json.loads(line) for line in input_handle]
    keywords = [row.get("keyword") for row in rows]
    if len(rows) != 111 or keywords != sorted(keywords) or len(set(keywords)) != 111:
        raise SystemExit("ConceptNet keyword-anchor inventory changed")
    target.write_text(
        "".join(json.dumps(row, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
        newline="\n",
    )
    return target


def extract_workspace(repo: Path, destination: Path) -> Path:
    archive = subprocess.run(
        [
            "git",
            "archive",
            "--format=tar",
            BASE_COMMIT,
            "Cargo.toml",
            "Cargo.lock",
            "core",
            "wasm",
        ],
        cwd=repo,
        check=True,
        stdout=subprocess.PIPE,
    ).stdout
    root = destination.resolve()
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as bundle:
        for member in bundle.getmembers():
            target = (destination / member.name).resolve()
            if root != target and root not in target.parents:
                raise SystemExit(f"unsafe archive member: {member.name}")
        bundle.extractall(destination, filter="data")
    return destination


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--partition", choices=("development", "test"), required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()

    research = Path(__file__).resolve().parent
    repo = research.parent.parent
    output = args.output.resolve()
    if output.exists() and any(output.iterdir()):
        raise SystemExit(f"output directory is not empty: {output}")
    output.mkdir(parents=True, exist_ok=True)

    dataset = repo / "research" / "holistic" / "work" / "dataset-final" / "dataset.jsonl.gz"
    review = repo / "research" / "holistic" / "work" / "dataset-final" / "review-names.txt"
    briefs = repo / "research" / "holistic" / "canonical_briefs.json"
    anchors_source = repo / "research" / "conceptnet-semantic" / "work" / "bulk-run-a" / "keyword-anchors.jsonl.gz"
    require_sha(review, REVIEW_SHA)
    require_sha(briefs, BRIEFS_SHA)
    train, validation = derive_corpora(dataset, output / "corpus")
    anchors = expand_anchors(anchors_source, output / "corpus")

    resolved = subprocess.run(
        ["git", "rev-parse", f"{BASE_COMMIT}^{{commit}}"],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    if resolved != BASE_COMMIT:
        raise SystemExit(f"base commit mismatch: {resolved}")

    with tempfile.TemporaryDirectory(prefix="phase300-") as temporary:
        clean_workspace = extract_workspace(repo, Path(temporary))
        shutil.copyfile(
            research / "probe.rs",
            clean_workspace / "core" / "examples" / "conceptnet_sampler_probe.rs",
        )
        if args.check_only:
            completed = subprocess.run(
                [
                    "cargo",
                    "check",
                    "--offline",
                    "--locked",
                    "--release",
                    "-p",
                    "neologism-core",
                    "--example",
                    "conceptnet_sampler_probe",
                ],
                cwd=clean_workspace,
            )
            raise SystemExit(completed.returncode)
        report = output / "report.json"
        command = [
            "cargo",
            "run",
            "--offline",
            "--locked",
            "--release",
            "-p",
            "neologism-core",
            "--example",
            "conceptnet_sampler_probe",
            "--",
            "--partition",
            args.partition,
            "--train",
            str(train),
            "--validation",
            str(validation),
            "--review",
            str(review),
            "--briefs",
            str(briefs),
            "--anchors",
            str(anchors),
            "--output",
            str(report),
        ]
        completed = subprocess.run(command, cwd=clean_workspace)
        if not report.exists():
            raise SystemExit(completed.returncode or 1)
        manifest = {
            "base_commit": BASE_COMMIT,
            "anchors_sha256": ANCHORS_SHA,
            "expanded_anchors_sha256": sha256(anchors),
            "partition": args.partition,
            "probe_sha256": sha256(research / "probe.rs"),
            "protocol_sha256": sha256(research / "PROTOCOL.md"),
            "report_bytes": report.stat().st_size,
            "report_sha256": sha256(report),
            "runner_sha256": sha256(Path(__file__)),
        }
        (output / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        raise SystemExit(completed.returncode)


if __name__ == "__main__":
    main()
