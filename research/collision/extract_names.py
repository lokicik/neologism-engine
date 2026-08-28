"""Extract package-name lists for the collision bloom filter (Phase 141,
roadmap phase 4a). Package/crate NAMES are facts (not the crates.io dump's
descriptions, which are license-blocked), so they are safe to ship as a
membership set. Writes one lowercase name per line to research/collision/
crate-names.txt (gitignored); the Rust builder turns it into the bloom.

Run from the workspace root:

    python research/collision/extract_names.py
"""

import csv
import os
import sys

ROOT = os.getcwd()
CRATES_CSV = os.path.join(
    ROOT, "research", "crate-retrieval", "source", "tables", "crates.csv"
)
OUT = os.path.join(ROOT, "research", "collision", "crate-names.txt")

# crates.csv can have very large quoted fields (readme/description).
csv.field_size_limit(1 << 30)


def main():
    if not os.path.exists(CRATES_CSV):
        sys.exit(f"missing {CRATES_CSV}")
    seen = set()
    with open(CRATES_CSV, encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        name_idx = header.index("name")
        for row in reader:
            if len(row) <= name_idx:
                continue
            name = row[name_idx].strip().lower()
            # Brand-name-plausible: alphabetic, 3-14 chars. Crate names allow
            # hyphens/underscores/digits; those never collide with our coinages.
            if 3 <= len(name) <= 14 and name.isalpha() and name.isascii():
                seen.add(name)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        for name in sorted(seen):
            f.write(name + "\n")
    print(f"wrote {OUT}: {len(seen)} alphabetic crate names")


if __name__ == "__main__":
    main()
