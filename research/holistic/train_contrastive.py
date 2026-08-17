#!/usr/bin/env python3
"""Train-only contrastive brief/name scorer preflight.

This deliberately precedes any denoising generator work. It tests whether the
frozen Wikidata pairs contain a generalizable brief-to-spelling signal after
the existing owner/developer/name-family split.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
import random
import struct
import sys

import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset


SEED = 29
EMBED = 48
NGRAM_BUCKETS = 4096
BATCH_SIZE = 256
MAX_EPOCHS = 40
PATIENCE = 5
LEARNING_RATE = 2e-3
TEMPERATURE = 0.10
NEGATIVE_SHIFTS = (1, 7, 31, 127, 257, 509, 769, 997, 1181)

# Frozen stop gates. The sealed test partition is read only after validation
# checkpoint selection is complete.
MIN_BIDIRECTIONAL_TOP1 = 0.35
MIN_BIDIRECTIONAL_PAIRWISE = 0.70
MIN_COSINE_MARGIN = 0.05
MIN_PAIRWISE_UPLIFT_OVER_LEXICAL = 0.05


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def stable_bucket(value: str) -> int:
    return int.from_bytes(hashlib.sha256(value.encode("ascii")).digest()[:8], "big") % NGRAM_BUCKETS


def name_ngrams(name: str) -> list[int]:
    marked = f"^{name}$"
    buckets = {
        stable_bucket(marked[start:start + width])
        for width in (2, 3, 4)
        for start in range(len(marked) - width + 1)
    }
    return sorted(buckets)


def read_rows(path: Path) -> list[dict]:
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


class PairDataset(Dataset):
    def __init__(self, rows: list[dict], keyword_ids: dict[str, int]) -> None:
        self.items = [
            (
                row["qid"],
                row["name"],
                [keyword_ids[word] for word in row["keywords"]],
                name_ngrams(row["name"]),
                tuple(row["keywords"]),
            )
            for row in rows
        ]

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, index: int) -> tuple:
        return self.items[index]


def collate(batch: list[tuple]) -> tuple:
    max_keywords = max(len(item[2]) for item in batch)
    max_ngrams = max(len(item[3]) for item in batch)
    keyword_ids = torch.zeros((len(batch), max_keywords), dtype=torch.long)
    keyword_mask = torch.zeros((len(batch), max_keywords), dtype=torch.float32)
    ngram_ids = torch.zeros((len(batch), max_ngrams), dtype=torch.long)
    ngram_mask = torch.zeros((len(batch), max_ngrams), dtype=torch.float32)
    for index, (_, _, keywords, ngrams, _) in enumerate(batch):
        keyword_ids[index, :len(keywords)] = torch.tensor(keywords)
        keyword_mask[index, :len(keywords)] = 1.0
        ngram_ids[index, :len(ngrams)] = torch.tensor(ngrams)
        ngram_mask[index, :len(ngrams)] = 1.0
    return (
        [item[0] for item in batch],
        [item[1] for item in batch],
        [item[4] for item in batch],
        keyword_ids,
        keyword_mask,
        ngram_ids,
        ngram_mask,
    )


class ContrastiveScorer(nn.Module):
    def __init__(self, keyword_count: int) -> None:
        super().__init__()
        self.keyword = nn.Embedding(keyword_count, EMBED)
        self.ngram = nn.Embedding(NGRAM_BUCKETS, EMBED)
        self.brief_projection = nn.Linear(EMBED, EMBED)
        self.name_projection = nn.Linear(EMBED, EMBED)

    @staticmethod
    def mean(embedding: nn.Embedding, ids: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        values = embedding(ids) * mask.unsqueeze(-1)
        return values.sum(dim=1) / mask.sum(dim=1, keepdim=True).clamp_min(1.0)

    def forward(
        self,
        keyword_ids: torch.Tensor,
        keyword_mask: torch.Tensor,
        ngram_ids: torch.Tensor,
        ngram_mask: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        brief = torch.tanh(self.brief_projection(self.mean(self.keyword, keyword_ids, keyword_mask)))
        name = torch.tanh(self.name_projection(self.mean(self.ngram, ngram_ids, ngram_mask)))
        return nn.functional.normalize(brief, dim=1), nn.functional.normalize(name, dim=1)


def contrastive_loss(brief: torch.Tensor, name: torch.Tensor) -> torch.Tensor:
    logits = brief @ name.T / TEMPERATURE
    targets = torch.arange(logits.shape[0])
    return 0.5 * (
        nn.functional.cross_entropy(logits, targets)
        + nn.functional.cross_entropy(logits.T, targets)
    )


@torch.no_grad()
def embeddings(model: ContrastiveScorer, loader: DataLoader) -> tuple:
    model.eval()
    qids: list[str] = []
    names: list[str] = []
    keywords: list[tuple[str, ...]] = []
    briefs = []
    name_vectors = []
    for batch_qids, batch_names, batch_keywords, keyword_ids, keyword_mask, ngram_ids, ngram_mask in loader:
        brief, name = model(keyword_ids, keyword_mask, ngram_ids, ngram_mask)
        qids.extend(batch_qids)
        names.extend(batch_names)
        keywords.extend(batch_keywords)
        briefs.append(brief)
        name_vectors.append(name)
    return qids, names, keywords, torch.cat(briefs), torch.cat(name_vectors)


def negative_indices(index: int, count: int) -> list[int]:
    result = []
    for shift in NEGATIVE_SHIFTS:
        candidate = (index + shift) % count
        if candidate == index or candidate in result:
            candidate = (candidate + 1) % count
        result.append(candidate)
    if len(set(result)) != len(NEGATIVE_SHIFTS) or index in result:
        raise RuntimeError("deterministic negative construction failed")
    return result


def lexical_score(keywords: tuple[str, ...], name: str) -> float:
    name_grams = {
        name[start:start + 3]
        for start in range(max(len(name) - 2, 0))
    }
    if not name_grams:
        return 0.0
    best = 0.0
    for keyword in keywords:
        keyword_grams = {
            keyword[start:start + 3]
            for start in range(max(len(keyword) - 2, 0))
        }
        union = name_grams | keyword_grams
        if union:
            best = max(best, len(name_grams & keyword_grams) / len(union))
    return best


def direction_metrics(
    left: torch.Tensor,
    right: torch.Tensor,
    lexical_rows: list[tuple[tuple[str, ...], str]],
    reverse_lexical: bool,
) -> dict:
    top1 = 0.0
    pairwise = 0.0
    lexical_top1 = 0.0
    lexical_pairwise = 0.0
    correct_scores = []
    wrong_scores = []
    for index in range(left.shape[0]):
        negatives = negative_indices(index, left.shape[0])
        correct = float(torch.dot(left[index], right[index]).item())
        wrong = [float(torch.dot(left[index], right[item]).item()) for item in negatives]
        maximum = max(wrong)
        top1 += (
            1.0 if correct > maximum
            else 1.0 / (1.0 + sum(correct == value for value in wrong))
            if correct == maximum
            else 0.0
        )
        pairwise += sum(1.0 if correct > value else 0.5 if correct == value else 0.0 for value in wrong)
        correct_scores.append(correct)
        wrong_scores.extend(wrong)

        if reverse_lexical:
            lexical_correct = lexical_score(lexical_rows[index][0], lexical_rows[index][1])
            lexical_wrong = [
                lexical_score(lexical_rows[item][0], lexical_rows[index][1])
                for item in negatives
            ]
        else:
            lexical_correct = lexical_score(lexical_rows[index][0], lexical_rows[index][1])
            lexical_wrong = [
                lexical_score(lexical_rows[index][0], lexical_rows[item][1])
                for item in negatives
            ]
        lexical_maximum = max(lexical_wrong)
        lexical_top1 += (
            1.0 if lexical_correct > lexical_maximum
            else 1.0 / (1.0 + sum(lexical_correct == value for value in lexical_wrong))
            if lexical_correct == lexical_maximum
            else 0.0
        )
        lexical_pairwise += sum(
            1.0 if lexical_correct > value else 0.5 if lexical_correct == value else 0.0
            for value in lexical_wrong
        )
    comparisons = left.shape[0] * len(NEGATIVE_SHIFTS)
    return {
        "top1": top1 / left.shape[0],
        "pairwise": pairwise / comparisons,
        "mean_correct_cosine": sum(correct_scores) / len(correct_scores),
        "mean_wrong_cosine": sum(wrong_scores) / len(wrong_scores),
        "cosine_margin": (
            sum(correct_scores) / len(correct_scores)
            - sum(wrong_scores) / len(wrong_scores)
        ),
        "lexical_top1": lexical_top1 / left.shape[0],
        "lexical_pairwise": lexical_pairwise / comparisons,
    }


@torch.no_grad()
def evaluate(model: ContrastiveScorer, loader: DataLoader) -> dict:
    _, names, keywords, brief, name = embeddings(model, loader)
    lexical_rows = list(zip(keywords, names))
    brief_to_name = direction_metrics(brief, name, lexical_rows, False)
    name_to_brief = direction_metrics(name, brief, lexical_rows, True)
    return {
        "brief_to_name": brief_to_name,
        "name_to_brief": name_to_brief,
        "bidirectional_top1": 0.5 * (brief_to_name["top1"] + name_to_brief["top1"]),
        "bidirectional_pairwise": 0.5 * (brief_to_name["pairwise"] + name_to_brief["pairwise"]),
        "bidirectional_cosine_margin": 0.5 * (
            brief_to_name["cosine_margin"] + name_to_brief["cosine_margin"]
        ),
        "lexical_bidirectional_top1": 0.5 * (
            brief_to_name["lexical_top1"] + name_to_brief["lexical_top1"]
        ),
        "lexical_bidirectional_pairwise": 0.5 * (
            brief_to_name["lexical_pairwise"] + name_to_brief["lexical_pairwise"]
        ),
    }


def state_sha256(model: ContrastiveScorer) -> str:
    payload = bytearray()
    for name, tensor in sorted(model.state_dict().items()):
        encoded = name.encode("ascii")
        payload.extend(struct.pack("<I", len(encoded)))
        payload.extend(encoded)
        payload.extend(struct.pack("<I", tensor.ndim))
        payload.extend(struct.pack(f"<{tensor.ndim}I", *tensor.shape))
        payload.extend(tensor.detach().cpu().contiguous().numpy().astype("<f4").tobytes())
    return sha256(bytes(payload))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    random.seed(SEED)
    torch.manual_seed(SEED)

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if sha256(args.data.read_bytes()) != manifest["dataset_sha256"]:
        raise RuntimeError("dataset hash does not match manifest")
    vocab_path = args.manifest.with_name("keyword-vocab.txt")
    vocab = [line for line in vocab_path.read_text(encoding="utf-8").splitlines() if line]
    if len(vocab) != 512 or sha256(vocab_path.read_bytes()) != manifest["vocab_sha256"]:
        raise RuntimeError("keyword vocabulary drifted")
    keyword_ids = {word: index for index, word in enumerate(vocab)}
    rows = read_rows(args.data)
    split_rows = {
        split: [row for row in rows if row["split"] == split]
        for split in ("train", "validation", "test")
    }
    datasets = {split: PairDataset(items, keyword_ids) for split, items in split_rows.items()}
    loaders = {
        split: DataLoader(
            dataset,
            batch_size=BATCH_SIZE,
            shuffle=(split == "train"),
            generator=torch.Generator().manual_seed(SEED),
            collate_fn=collate,
            num_workers=0,
        )
        for split, dataset in datasets.items()
    }

    model = ContrastiveScorer(len(vocab))
    optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=1e-4)
    best_state = None
    best_validation = math.inf
    best_epoch = 0
    stale = 0
    history = []
    for epoch in range(1, MAX_EPOCHS + 1):
        model.train()
        total = 0.0
        batches = 0
        for _, _, _, keyword_batch, keyword_mask, ngram_batch, ngram_mask in loaders["train"]:
            optimizer.zero_grad(set_to_none=True)
            brief, name = model(keyword_batch, keyword_mask, ngram_batch, ngram_mask)
            loss = contrastive_loss(brief, name)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total += float(loss.item())
            batches += 1
        model.eval()
        validation_total = 0.0
        validation_batches = 0
        with torch.no_grad():
            for _, _, _, keyword_batch, keyword_mask, ngram_batch, ngram_mask in loaders["validation"]:
                brief, name = model(keyword_batch, keyword_mask, ngram_batch, ngram_mask)
                validation_total += float(contrastive_loss(brief, name).item())
                validation_batches += 1
        train_loss = total / max(batches, 1)
        validation_loss = validation_total / max(validation_batches, 1)
        history.append({
            "epoch": epoch,
            "train_loss": train_loss,
            "validation_loss": validation_loss,
        })
        print(f"epoch {epoch:02d} train {train_loss:.5f} validation {validation_loss:.5f}", flush=True)
        if validation_loss < best_validation - 1e-6:
            best_validation = validation_loss
            best_epoch = epoch
            best_state = {name: value.detach().clone() for name, value in model.state_dict().items()}
            stale = 0
        else:
            stale += 1
            if stale >= PATIENCE:
                break
    if best_state is None:
        raise RuntimeError("contrastive training produced no checkpoint")
    model.load_state_dict(best_state)

    validation = evaluate(model, loaders["validation"])
    test = evaluate(model, loaders["test"])
    gates = {
        "bidirectional_top1_at_least_35_percent": test["bidirectional_top1"] >= MIN_BIDIRECTIONAL_TOP1,
        "bidirectional_pairwise_at_least_70_percent": test["bidirectional_pairwise"] >= MIN_BIDIRECTIONAL_PAIRWISE,
        "cosine_margin_at_least_005": test["bidirectional_cosine_margin"] >= MIN_COSINE_MARGIN,
        "pairwise_uplift_over_lexical_at_least_5_points": (
            test["bidirectional_pairwise"] - test["lexical_bidirectional_pairwise"]
            >= MIN_PAIRWISE_UPLIFT_OVER_LEXICAL
        ),
    }
    report = {
        "schema": "neologism-holistic-contrastive-preflight-v1",
        "python": sys.version,
        "torch": torch.__version__,
        "seed": SEED,
        "architecture": {
            "embedding": EMBED,
            "name_ngram_buckets": NGRAM_BUCKETS,
            "name_ngrams": [2, 3, 4],
            "temperature": TEMPERATURE,
        },
        "dataset_sha256": manifest["dataset_sha256"],
        "splits": {split: len(items) for split, items in split_rows.items()},
        "best_epoch": best_epoch,
        "best_validation_loss": best_validation,
        "state_sha256": state_sha256(model),
        "validation": validation,
        "test": test,
        "gates": gates,
        "history": history,
    }
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "contrastive-report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(report, indent=2, sort_keys=True))
    if not all(gates.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
