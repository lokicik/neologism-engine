# Brief-conditioned holistic generator research

This directory is an isolated research lane. Nothing here is imported by
`generate()`, WASM, Auto, storage, or the public `NameResult` JSON contract.

## Provenance boundary

The optional refresh command queries direct instances of Wikidata software
(`Q7397`), website (`Q35127`), and mobile app (`Q620615`). Wikidata structured
data is CC0. The refresh stores the exact SPARQL template, retrieval time,
record counts, and SHA-256 hashes beside a deterministic gzip snapshot. The
frozen snapshot used by the checkpoint is checked in under `snapshot/`;
ordinary builds and training are offline.

- Data access and CC0: <https://www.wikidata.org/wiki/Wikidata:Data_access>
- Query service: <https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service>

The checked-in BigTech corpus is never training data. It participates only in
the declared collision review index and the frozen production control.

## Commands

Network is used only by the explicit refresh step:

```powershell
python research/holistic/refresh_wikidata.py --refresh --out research/holistic/snapshot
```

Build the deterministic grouped dataset using the production keyword extractor:

```powershell
python research/holistic/build_dataset.py --raw research/holistic/snapshot/wikidata.jsonl.gz --out research/holistic/work/dataset
```

Training requires a clean Python 3.12 virtual environment. Do not rely on a
machine-global PyTorch installation:

```powershell
python -m venv research/holistic/.venv
research/holistic/.venv/Scripts/python -m pip install -r research/holistic/requirements.txt
research/holistic/.venv/Scripts/python research/holistic/train.py --data research/holistic/work/dataset/dataset.jsonl.gz --manifest research/holistic/work/dataset/dataset-manifest.json --out research/holistic/work/run
```

Generated snapshots, models, and reports stay under ignored `work/` until all
frozen gates pass. A failed model must not enter production or the repository.

The Rust harness shares the production keyword, phonotactic, sonority, score,
dictionary, collision, diversity, and MMR code without changing its public
types:

```powershell
cargo run -p neologism-core --example holistic_probe --release -- self-test --model research/holistic/work/run/holistic-v1.bin
cargo run -p neologism-core --example holistic_probe --release -- parity --model research/holistic/work/run/holistic-v1.bin --reference research/holistic/work/run/parity-reference.json
```

`run` is intentionally downstream of the training gates. It produces the 35
brief x 3 seed generation report only for an eligible model; this checkpoint's
model was not eligible. See [NEGATIVE-CHECKPOINT.md](NEGATIVE-CHECKPOINT.md).

## Two-stage scorer preflight

Before building a larger masked-denoising generator, the follow-up experiment
tests whether the frozen pairs can train a separate brief/name relevance
scorer:

```powershell
research/holistic/.venv/Scripts/python research/holistic/train_contrastive.py --data research/holistic/work/dataset/dataset.jsonl.gz --manifest research/holistic/work/dataset/dataset-manifest.json --out research/holistic/work/contrastive
```

That preflight also failed its frozen semantic gates, so the denoising
generator was not implemented. See
[CONTRASTIVE-NEGATIVE-CHECKPOINT.md](CONTRASTIVE-NEGATIVE-CHECKPOINT.md).

## What remains viable

These failures reject this Wikidata supervision source, not every possible
holistic naming architecture. They do remove the evidence basis for training a
larger local generator on the same pairs. The next bounded product step therefore
stays at selection time: AI Studio keeps the offline engine as the sole proposer
and gives its optional configured judge the frozen project brief, selected
criterion, and displayed local candidates. That path is separately documented
and tested in Phase 270; it does not import this research code or claim that an
LLM generated the names.
