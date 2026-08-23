#!/usr/bin/env python3
"""Inspect the frozen Phase-289 development MAT without opening external data."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

import numpy as np
from scipy.io import loadmat


EXPECTED_SHA256 = (
    "9288d0895e8eb628e96721550b47dd692f862577084a9b5143f0d2c3a642d62c"
)
ASCII_NAME = re.compile(r"[a-z]{4,12}")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def scalar_text(value: object) -> str:
    if isinstance(value, np.ndarray):
        if value.size != 1:
            raise ValueError(f"expected scalar cell, received shape {value.shape}")
        value = value.item()
    return str(value)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-root",
        type=Path,
        default=Path(__file__).parent / "source",
    )
    args = parser.parse_args()

    source = (
        args.source_root
        / "osf"
        / "y9zjc"
        / "Pseudoword_RSA_env_tilt_FFT_Matlab_code"
        / "RSA_Ordered_P_to_R_culled.mat"
    )
    actual_sha256 = sha256(source)
    if actual_sha256 != EXPECTED_SHA256:
        raise SystemExit(
            f"source hash mismatch: expected {EXPECTED_SHA256}, got {actual_sha256}"
        )

    data = loadmat(source, squeeze_me=True, struct_as_record=False)
    cells = data["Words_Sound_Convert_6"]
    ratings = np.asarray(data["combo_Final_Order_culled"], dtype=np.float64)
    if cells.shape != (537, 17) or ratings.shape != (31, 537):
        raise SystemExit(
            f"unexpected source shapes: cells={cells.shape}, ratings={ratings.shape}"
        )

    observed_names = [
        "".join(scalar_text(value) for value in cells[row, :4])
        for row in range(cells.shape[0])
    ]
    rating_counts = np.isfinite(ratings).sum(axis=0)
    direct_ascii = [bool(ASCII_NAME.fullmatch(name)) for name in observed_names]
    eligible = [
        name
        for name, is_ascii, count in zip(observed_names, direct_ascii, rating_counts)
        if is_ascii and count >= 25
    ]

    report = {
        "phase": 289,
        "source_sha256": actual_sha256,
        "source_shapes": {
            "participant_by_item_ratings": list(ratings.shape),
            "stimulus_table": list(cells.shape),
        },
        "observed_items": len(observed_names),
        "distinct_observed_segment_sequences": len(set(observed_names)),
        "direct_lower_ascii_items": sum(direct_ascii),
        "distinct_direct_lower_ascii_items": len(
            {name for name, keep in zip(observed_names, direct_ascii) if keep}
        ),
        "rating_count_min": int(rating_counts.min()),
        "rating_count_max": int(rating_counts.max()),
        "items_with_at_least_25_ratings": int((rating_counts >= 25).sum()),
        "distinct_direct_lower_ascii_items_with_at_least_25_ratings": len(
            set(eligible)
        ),
        "required_distinct_lower_ascii_items": 500,
        "status": "fail",
        "failure": "insufficient directly observed lowercase ASCII pseudowords",
        "external_opened": False,
    }
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
