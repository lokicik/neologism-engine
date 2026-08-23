#!/usr/bin/env python3
"""Run Phase 303 against a clean archive of the frozen committed core."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from types import ModuleType


BASE_RUNNER_SHA256 = "e490ce247c2ac2094ae3d029015c2792144f04fb0fa1532052b69686ff220ead"
EXPECTED_SCHEMA = "neologism-conceptnet-guided-sampler-report-v1"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_module(path: Path, name: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"cannot load module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--partition", choices=("development", "test"), required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()

    research = Path(__file__).resolve().parent
    repo = research.parent.parent
    phase300 = repo / "research" / "conceptnet-sampler"
    base_runner_path = phase300 / "run_clean.py"
    base_probe_path = phase300 / "probe.rs"
    materializer_path = research / "materialize_probe.py"
    if sha256(base_runner_path) != BASE_RUNNER_SHA256:
        raise SystemExit("Phase 300 runner SHA-256 mismatch")

    base = load_module(base_runner_path, "phase300_frozen_runner")
    materializer = load_module(materializer_path, "phase303_materializer")
    if sha256(base_probe_path) != materializer.BASE_PROBE_SHA256:
        raise SystemExit("Phase 300 probe SHA-256 mismatch")

    output = args.output.resolve()
    if output.exists() and any(output.iterdir()):
        raise SystemExit(f"output directory is not empty: {output}")
    output.mkdir(parents=True, exist_ok=True)

    dataset = repo / "research" / "holistic" / "work" / "dataset-final" / "dataset.jsonl.gz"
    review = repo / "research" / "holistic" / "work" / "dataset-final" / "review-names.txt"
    briefs = repo / "research" / "holistic" / "canonical_briefs.json"
    anchors_source = (
        repo
        / "research"
        / "conceptnet-semantic"
        / "work"
        / "bulk-run-a"
        / "keyword-anchors.jsonl.gz"
    )
    base.require_sha(review, base.REVIEW_SHA)
    base.require_sha(briefs, base.BRIEFS_SHA)
    train, validation = base.derive_corpora(dataset, output / "corpus")
    anchors = base.expand_anchors(anchors_source, output / "corpus")

    resolved = subprocess.run(
        ["git", "rev-parse", f"{base.BASE_COMMIT}^{{commit}}"],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    if resolved != base.BASE_COMMIT:
        raise SystemExit(f"base commit mismatch: {resolved}")

    with tempfile.TemporaryDirectory(prefix="phase303-") as temporary:
        clean_workspace = base.extract_workspace(repo, Path(temporary))
        generated = materializer.transform(base_probe_path.read_text(encoding="utf-8"))
        probe_target = (
            clean_workspace
            / "core"
            / "examples"
            / "conceptnet_guided_sampler_probe.rs"
        )
        probe_target.write_text(generated, encoding="utf-8", newline="\n")
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
                    "conceptnet_guided_sampler_probe",
                ],
                cwd=clean_workspace,
            )
            raise SystemExit(completed.returncode)

        report = output / "report.json"
        completed = subprocess.run(
            [
                "cargo",
                "run",
                "--offline",
                "--locked",
                "--release",
                "-p",
                "neologism-core",
                "--example",
                "conceptnet_guided_sampler_probe",
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
            ],
            cwd=clean_workspace,
        )
        if not report.exists():
            raise SystemExit(completed.returncode or 1)
        parsed = json.loads(report.read_text(encoding="utf-8"))
        if parsed.get("schema") != EXPECTED_SCHEMA or parsed.get("partition") != args.partition:
            raise SystemExit("Phase 303 report identity mismatch")
        manifest = {
            "anchors_sha256": base.ANCHORS_SHA,
            "base_commit": base.BASE_COMMIT,
            "base_probe_sha256": sha256(base_probe_path),
            "base_runner_sha256": BASE_RUNNER_SHA256,
            "materializer_sha256": sha256(materializer_path),
            "partition": args.partition,
            "phase": 303,
            "protocol_sha256": sha256(research / "PROTOCOL.md"),
            "report_bytes": report.stat().st_size,
            "report_sha256": sha256(report),
            "runner_sha256": sha256(Path(__file__)),
            "state": "passed" if bool(parsed.get("gates")) and all(parsed["gates"].values()) else "failed",
        }
        (output / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        raise SystemExit(completed.returncode)


if __name__ == "__main__":
    main()
