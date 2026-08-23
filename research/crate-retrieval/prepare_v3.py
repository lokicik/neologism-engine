#!/usr/bin/env python3
"""Execute Phase 294 preparation with only the Phase 295 powered minimum."""

from __future__ import annotations

import hashlib
from pathlib import Path
import sys


BASE_SHA256 = "6b01b69f705c24e494d765135b85b2558b1056135a8a5dfd79b76c39fcf8bb8c"
OLD = 'len(validation_records) >= 5_000 and len(test_records) >= 5_000'
NEW = 'len(validation_records) >= 3_000 and len(test_records) >= 3_000'


def main() -> None:
    root = Path(__file__).resolve().parent
    source_path = root / "prepare_v2.py"
    source_bytes = source_path.read_bytes()
    observed = hashlib.sha256(source_bytes).hexdigest()
    if observed != BASE_SHA256:
        raise SystemExit(f"Phase 294 preparation hash mismatch: {observed}")
    source = source_bytes.decode("utf-8")
    if source.count(OLD) != 1:
        raise SystemExit("expected exactly one evaluation-minimum expression")
    transformed = source.replace(OLD, NEW)
    arguments = list(sys.argv[1:])
    if "--out" not in arguments:
        arguments.extend(["--out", str(root / "work" / "prepared-v3")])
    sys.argv = [str(source_path), *arguments]
    namespace = {"__file__": str(source_path), "__name__": "__main__"}
    exec(compile(transformed, "<phase295-prepare-v3>", "exec"), namespace)


if __name__ == "__main__":
    main()
