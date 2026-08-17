#!/usr/bin/env python3
"""Explicit, deterministic Wikidata snapshot refresh for holistic research."""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import json
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request


ENDPOINT = "https://query.wikidata.org/sparql"
USER_AGENT = "neologism-engine-holistic-research/0.1 (local CC0 research snapshot)"
PAGE_SIZE = 1_000
METADATA_BATCH = 200
CLASSES = {
    "software": "Q7397",
    "website": "Q35127",
    "mobile_app": "Q620615",
}
SEP = "\u001f"

BASE_QUERY = """\
SELECT ?item ?name ?description
WHERE {{
  ?item wdt:P31 wd:{class_qid};
        rdfs:label ?name;
        schema:description ?description.
  FILTER(LANG(?name) = "en")
  FILTER(LANG(?description) = "en")
  FILTER(REGEX(STR(?name), "^[A-Za-z]{{4,12}}$"))
}}
ORDER BY ?item
LIMIT {limit}
OFFSET {offset}
"""

METADATA_QUERY = """\
SELECT ?item
       (GROUP_CONCAT(DISTINCT ?alias; separator="{sep}") AS ?aliases)
       (GROUP_CONCAT(DISTINCT ?genreLabel; separator="{sep}") AS ?genres)
       (GROUP_CONCAT(DISTINCT ?useLabel; separator="{sep}") AS ?uses)
       (GROUP_CONCAT(DISTINCT ?industryLabel; separator="{sep}") AS ?industries)
       (GROUP_CONCAT(DISTINCT ?subjectLabel; separator="{sep}") AS ?subjects)
       (GROUP_CONCAT(DISTINCT STR(?developer); separator="{sep}") AS ?developers)
       (GROUP_CONCAT(DISTINCT STR(?owner); separator="{sep}") AS ?owners)
       (GROUP_CONCAT(DISTINCT STR(?parent); separator="{sep}") AS ?parents)
WHERE {{
  VALUES ?item {{ {items} }}
  OPTIONAL {{ ?item skos:altLabel ?alias. FILTER(LANG(?alias) = "en") }}
  OPTIONAL {{ ?item wdt:P136 ?genre. ?genre rdfs:label ?genreLabel. FILTER(LANG(?genreLabel) = "en") }}
  OPTIONAL {{ ?item wdt:P366 ?use. ?use rdfs:label ?useLabel. FILTER(LANG(?useLabel) = "en") }}
  OPTIONAL {{ ?item wdt:P452 ?industry. ?industry rdfs:label ?industryLabel. FILTER(LANG(?industryLabel) = "en") }}
  OPTIONAL {{ ?item wdt:P921 ?subject. ?subject rdfs:label ?subjectLabel. FILTER(LANG(?subjectLabel) = "en") }}
  OPTIONAL {{ ?item wdt:P178 ?developer }}
  OPTIONAL {{ ?item wdt:P127 ?owner }}
  OPTIONAL {{ ?item wdt:P749 ?parent }}
}}
GROUP BY ?item
ORDER BY ?item
"""


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def values(binding: dict, key: str) -> list[str]:
    raw = binding.get(key, {}).get("value", "")
    return sorted({part.strip() for part in raw.split(SEP) if part.strip()})


def qid(uri: str) -> str:
    return uri.rsplit("/", 1)[-1]


def fetch(query: str) -> dict:
    url = ENDPOINT + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
            if attempt == 3:
                break
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Wikidata query failed after retries: {last_error}")


def deterministic_gzip(payload: bytes) -> bytes:
    from io import BytesIO

    buffer = BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="wb", mtime=0) as stream:
        stream.write(payload)
    return buffer.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="required acknowledgement of network access")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if not args.refresh:
        parser.error("network access is disabled unless --refresh is supplied")

    records: dict[str, dict] = {}
    class_counts: dict[str, int] = {}
    rendered_queries: list[str] = []
    for class_name, class_qid in CLASSES.items():
        offset = 0
        class_count = 0
        while True:
            query = BASE_QUERY.format(
                class_qid=class_qid,
                limit=PAGE_SIZE,
                offset=offset,
            )
            rendered_queries.append(query)
            bindings = fetch(query)["results"]["bindings"]
            for row in bindings:
                item_qid = qid(row["item"]["value"])
                record = records.setdefault(
                    item_qid,
                    {
                        "qid": item_qid,
                        "name": row["name"]["value"],
                        "description": row["description"]["value"],
                        "classes": [],
                        "aliases": [],
                        "genres": [],
                        "uses": [],
                        "industries": [],
                        "subjects": [],
                        "developers": [],
                        "owners": [],
                        "parents": [],
                    },
                )
                record["classes"].append(class_name)
            class_count += len(bindings)
            print(f"base {class_name}: {class_count}", flush=True)
            if len(bindings) < PAGE_SIZE:
                break
            offset += PAGE_SIZE
            time.sleep(0.5)
        class_counts[class_name] = class_count

    ordered_qids = sorted(records)
    for start in range(0, len(ordered_qids), METADATA_BATCH):
        batch = ordered_qids[start:start + METADATA_BATCH]
        query = METADATA_QUERY.format(
            sep=SEP,
            items=" ".join(f"wd:{item}" for item in batch),
        )
        rendered_queries.append(query)
        bindings = fetch(query)["results"]["bindings"]
        for row in bindings:
            record = records[qid(row["item"]["value"])]
            for field in ("aliases", "genres", "uses", "industries", "subjects"):
                record[field].extend(values(row, field))
            for field in ("developers", "owners", "parents"):
                record[field].extend(qid(value) for value in values(row, field))
        print(f"metadata: {min(start + METADATA_BATCH, len(ordered_qids))}/{len(ordered_qids)}", flush=True)
        time.sleep(0.5)

    normalized = []
    for record in records.values():
        for field in (
            "classes", "aliases", "genres", "uses", "industries", "subjects",
            "developers", "owners", "parents",
        ):
            record[field] = sorted(set(record[field]))
        normalized.append(record)
    normalized.sort(key=lambda item: item["qid"])
    lines = [json.dumps(record, sort_keys=True, ensure_ascii=False) for record in normalized]
    payload = ("\n".join(lines) + "\n").encode("utf-8")
    compressed = deterministic_gzip(payload)

    args.out.mkdir(parents=True, exist_ok=True)
    snapshot_path = args.out / "wikidata.jsonl.gz"
    snapshot_path.write_bytes(compressed)
    query_path = args.out / "wikidata-query.rq"
    query_path.write_text(
        "# Base query\n"
        + BASE_QUERY.format(class_qid="CLASS_QID", limit=PAGE_SIZE, offset="OFFSET")
        + "\n# Metadata query\n"
        + METADATA_QUERY.format(sep=SEP, items="QID_BATCH"),
        encoding="utf-8",
        newline="\n",
    )
    manifest = {
        "schema": "neologism-holistic-wikidata-v1",
        "retrieved_utc": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "endpoint": ENDPOINT,
        "license": "CC0-1.0",
        "classes": CLASSES,
        "page_size": PAGE_SIZE,
        "metadata_batch": METADATA_BATCH,
        "records": len(normalized),
        "class_rows_before_qid_dedup": class_counts,
        "snapshot_sha256": sha256_bytes(compressed),
        "uncompressed_sha256": sha256_bytes(payload),
        "query_template_sha256": sha256_bytes(query_path.read_bytes()),
        "requests": len(rendered_queries),
    }
    (args.out / "wikidata-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
