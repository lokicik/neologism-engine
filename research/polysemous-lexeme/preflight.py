#!/usr/bin/env python3
"""Run the frozen Phase 306 polysemous-lexeme data preflight."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import gzip
import hashlib
import json
from pathlib import Path
import re
import zipfile


ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
WORDNET_PATH = Path(r"C:\Users\LOKMAN\nltk_data\corpora\wordnet.zip")
WORDNET_SHA256 = "cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59"
ANCHORS_PATH = ROOT / "research/conceptnet-semantic/work/bulk-run-a/keyword-anchors.jsonl.gz"
ANCHORS_SHA256 = "ff207ad1570356b1a820726dc6c6dc980826425bd40e440ce4dac0d0f4788e55"
KEYWORDS_PATH = ROOT / "research/holistic/work/dataset/canonical-keyword-coverage.json"
KEYWORDS_SHA256 = "1f959c015efb9d49b1219b966f3ee464592fa62949c4b8804ce1f2fe2f692a6d"
REALWORDS_PATH = ROOT / "core/data/realwords.txt"
REALWORDS_SHA256 = "eb72a10fd598de010bae23878523963c8250c550c534c2ac61ec01943c76e59a"
BIGTECH_PATH = ROOT / "core/data/bigtech.txt"
BIGTECH_SHA256 = "bd2871db2af486a0915db0a7c983e80006c5335c38fc2227307fd08442ecd16c"
REVIEW_PATH = ROOT / "research/holistic/work/dataset/review-names.txt"
REVIEW_SHA256 = "87c45e7373ed2715774eea2f22ec28c975cea8139abd3ee513150762a373e09e"
PROTOCOL_PATH = HERE / "PROTOCOL.md"
DATA_FILES = ("data.noun", "data.verb", "data.adj", "data.adv")
NAME = re.compile(r"[a-z]{5,10}")
IMAGE_DOMAINS = frozenset(
    {
        "noun.animal",
        "noun.artifact",
        "noun.body",
        "noun.event",
        "noun.food",
        "noun.location",
        "noun.object",
        "noun.phenomenon",
        "noun.plant",
        "noun.possession",
        "noun.shape",
        "noun.substance",
        "noun.time",
    }
)


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


def verify_sources() -> None:
    expected = {
        WORDNET_PATH: WORDNET_SHA256,
        ANCHORS_PATH: ANCHORS_SHA256,
        KEYWORDS_PATH: KEYWORDS_SHA256,
        REALWORDS_PATH: REALWORDS_SHA256,
        BIGTECH_PATH: BIGTECH_SHA256,
        REVIEW_PATH: REVIEW_SHA256,
    }
    for path, digest in expected.items():
        observed = sha256(path)
        if observed != digest:
            raise ValueError(f"source SHA-256 mismatch: {path}: {observed}")


def load_wordnet() -> dict[str, dict]:
    lexnames = {}
    senses: dict[str, int] = Counter()
    lexfiles: dict[str, set[str]] = defaultdict(set)
    with zipfile.ZipFile(WORDNET_PATH) as archive:
        if "wordnet/LICENSE" not in archive.namelist():
            raise ValueError("WordNet license missing")
        for line in archive.read("wordnet/lexnames").decode("ascii").splitlines():
            fields = line.split()
            if len(fields) >= 2:
                lexnames[int(fields[0])] = fields[1]
        for filename in DATA_FILES:
            lines = archive.read(f"wordnet/{filename}").decode("ascii").splitlines()
            for line in lines:
                if not line or line[0].isspace():
                    continue
                body = line.partition("|")[0].split()
                if len(body) < 5:
                    raise ValueError(f"truncated WordNet row in {filename}")
                lexfile = lexnames[int(body[1])]
                word_count = int(body[3], 16)
                for offset in range(word_count):
                    lemma = body[4 + offset * 2]
                    if NAME.fullmatch(lemma):
                        senses[lemma] += 1
                        lexfiles[lemma].add(lexfile)
    return {
        lemma: {
            "synset_count": senses[lemma],
            "lexfiles": sorted(lexfiles[lemma]),
            "image_bearing": bool(lexfiles[lemma] & IMAGE_DOMAINS),
        }
        for lemma in sorted(senses)
    }


def load_anchors() -> dict[str, dict[str, dict]]:
    result = {}
    with gzip.open(ANCHORS_PATH, "rt", encoding="utf-8") as handle:
        for line in handle:
            row = json.loads(line)
            keyword = row["keyword"]
            terms = {}
            for anchor in row["anchors"]:
                term = anchor["term"]
                current = terms.get(term)
                candidate = {"score": float(anchor["score"]), "depth": int(anchor["depth"])}
                if current is None:
                    terms[term] = candidate
                else:
                    current["score"] = max(current["score"], candidate["score"])
                    current["depth"] = min(current["depth"], candidate["depth"])
            if keyword in result:
                raise ValueError(f"duplicate keyword anchor row: {keyword}")
            result[keyword] = terms
    if len(result) != 111:
        raise ValueError(f"expected 111 keyword rows, got {len(result)}")
    return result


def load_lines(path: Path) -> set[str]:
    return {
        line.strip().lower()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }


def deletion_keys(names: set[str]) -> set[str]:
    return {
        name[:index] + name[index + 1 :]
        for name in names
        for index in range(len(name))
    }


def collides(name: str, blocked: set[str], blocked_deletions: set[str]) -> bool:
    if name in blocked or name in blocked_deletions:
        return True
    if any(name[:index] + name[index + 1 :] in blocked for index in range(len(name))):
        return True
    for index, original in enumerate(name):
        prefix = name[:index]
        suffix = name[index + 1 :]
        for replacement in "abcdefghijklmnopqrstuvwxyz":
            if replacement != original and prefix + replacement + suffix in blocked:
                return True
    return False


def evaluate_brief(
    brief: str,
    keywords: list[str],
    anchors: dict[str, dict[str, dict]],
    wordnet: dict[str, dict],
    realwords: set[str],
    blocked: set[str],
    blocked_deletions: set[str],
) -> dict:
    candidate_terms = sorted(
        {term for keyword in keywords for term in anchors[keyword]}
    )
    exclusions = Counter()
    eligible = []
    for term in candidate_terms:
        if not NAME.fullmatch(term):
            exclusions["form"] += 1
            continue
        if term not in realwords:
            exclusions["not_curated"] += 1
            continue
        metadata = wordnet.get(term)
        if metadata is None:
            exclusions["not_wordnet"] += 1
            continue
        if metadata["synset_count"] < 2 or len(metadata["lexfiles"]) < 2:
            exclusions["not_polysemous"] += 1
            continue
        sources = []
        for keyword in keywords:
            anchor = anchors[keyword].get(term)
            if anchor is not None:
                sources.append({"keyword": keyword, **anchor})
        maximum_score = max(source["score"] for source in sources)
        minimum_depth = min(source["depth"] for source in sources)
        if maximum_score < 1.0 or not (minimum_depth == 1 or len(sources) >= 2):
            exclusions["weak_semantic"] += 1
            continue
        if term in keywords:
            exclusions["prompt_copy"] += 1
            continue
        if collides(term, blocked, blocked_deletions):
            exclusions["collision"] += 1
            continue
        eligible.append(
            {
                "name": term,
                "sources": sources,
                "source_keyword_count": len(sources),
                "maximum_score": maximum_score,
                "minimum_depth": minimum_depth,
                **metadata,
            }
        )
    source_keywords = sorted(
        {source["keyword"] for row in eligible for source in row["sources"]}
    )
    image_rate = (
        sum(row["image_bearing"] for row in eligible) / len(eligible)
        if eligible
        else 0.0
    )
    return {
        "brief": brief,
        "keywords": keywords,
        "raw_anchor_terms": len(candidate_terms),
        "eligible_count": len(eligible),
        "eligible_source_keywords": source_keywords,
        "image_bearing_rate": image_rate,
        "exclusions": dict(sorted(exclusions.items())),
        "eligible": eligible,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    verify_sources()
    wordnet = load_wordnet()
    anchors = load_anchors()
    realwords = load_lines(REALWORDS_PATH)
    blocked = load_lines(BIGTECH_PATH) | load_lines(REVIEW_PATH)
    blocked_deletions = deletion_keys(blocked)
    keyword_rows = json.loads(KEYWORDS_PATH.read_text(encoding="utf-8"))
    keyword_rows.sort(key=lambda row: (fnv1a64(row["brief"]), row["brief"]))
    development = keyword_rows[:24]
    pages = []
    for row in development:
        keywords = list(row["extracted"])
        if any(keyword not in anchors for keyword in keywords):
            raise ValueError(f"missing keyword anchors for {row['brief']}")
        pages.append(
            evaluate_brief(
                row["brief"],
                keywords,
                anchors,
                wordnet,
                realwords,
                blocked,
                blocked_deletions,
            )
        )
    appearances = Counter(
        candidate["name"] for page in pages for candidate in page["eligible"]
    )
    maximum_appearances = max(appearances.values(), default=0)
    gates = {
        "development_briefs_24": len(pages) == 24,
        "every_brief_at_least_12": all(page["eligible_count"] >= 12 for page in pages),
        "two_source_keywords_when_available": all(
            len(page["keywords"]) < 2 or len(page["eligible_source_keywords"]) >= 2
            for page in pages
        ),
        "image_bearing_rate_at_least_80pct": all(
            page["image_bearing_rate"] >= 0.80 for page in pages
        ),
        "maximum_brief_appearances_at_most_8": maximum_appearances <= 8,
    }
    report = {
        "schema": "neologism-polysemous-lexeme-preflight-v1",
        "phase": 306,
        "partition": "development",
        "wordnet_lemma_count": len(wordnet),
        "curated_realword_count": len(realwords),
        "pages": pages,
        "summary": {
            "minimum_eligible": min(page["eligible_count"] for page in pages),
            "maximum_eligible": max(page["eligible_count"] for page in pages),
            "mean_eligible": sum(page["eligible_count"] for page in pages) / len(pages),
            "minimum_image_bearing_rate": min(page["image_bearing_rate"] for page in pages),
            "maximum_brief_appearances": maximum_appearances,
        },
        "gates": gates,
        "state": "passed" if all(gates.values()) else "failed",
    }
    report_path = args.out / "report.json"
    write_json(report_path, report)
    manifest = {
        "schema": "neologism-polysemous-lexeme-manifest-v1",
        "phase": 306,
        "partition": "development",
        "state": report["state"],
        "protocol_sha256": sha256(PROTOCOL_PATH),
        "preflight_sha256": sha256(Path(__file__)),
        "report_sha256": sha256(report_path),
        "report_bytes": report_path.stat().st_size,
    }
    write_json(args.out / "manifest.json", manifest)
    print(json.dumps({"summary": report["summary"], "gates": gates, "state": report["state"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
