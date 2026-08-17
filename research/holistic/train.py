#!/usr/bin/env python3
"""Train and export the frozen brief-conditioned character GRU."""

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
from typing import Iterable

import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset


SEED = 13
BOS = 0
EOS = 1
CHAR_OFFSET = 2
PAD_TARGET = -100
CHAR_EMBED = 24
KEYWORD_EMBED = 64
HIDDEN = 96
MAX_EPOCHS = 60
PATIENCE = 6
BATCH_SIZE = 256
MAGIC = b"NEOHOL1\0"
VERSION = 1
MAX_ARTIFACT = 128 * 1024
TEMPERATURES = (0.65, 0.75, 0.85)
TOP_KS = (8, 12, 16)
VALIDATION_SAMPLE_ROWS = 128
VALIDATION_SAMPLES_PER_ROW = 2


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_jsonl_gzip(path: Path) -> list[dict]:
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


class NameDataset(Dataset):
    def __init__(self, rows: list[dict], keyword_ids: dict[str, int]) -> None:
        self.rows = rows
        self.keyword_ids = keyword_ids

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int) -> tuple[list[int], list[int], list[int]]:
        row = self.rows[index]
        letters = [CHAR_OFFSET + ord(character) - ord("a") for character in row["name"]]
        inputs = [BOS, *letters]
        targets = [letter - 1 for letter in letters] + [0]
        keywords = [self.keyword_ids[word] for word in row["keywords"] if word in self.keyword_ids]
        if not keywords:
            raise RuntimeError(f"row without known keywords: {row['qid']}")
        return inputs, targets, keywords


def collate(batch: list[tuple[list[int], list[int], list[int]]]) -> tuple[torch.Tensor, ...]:
    max_length = max(len(item[0]) for item in batch)
    max_keywords = max(len(item[2]) for item in batch)
    inputs = torch.zeros((len(batch), max_length), dtype=torch.long)
    targets = torch.full((len(batch), max_length), PAD_TARGET, dtype=torch.long)
    lengths = torch.zeros(len(batch), dtype=torch.long)
    keyword_ids = torch.zeros((len(batch), max_keywords), dtype=torch.long)
    keyword_mask = torch.zeros((len(batch), max_keywords), dtype=torch.float32)
    for row, (source, target, keywords) in enumerate(batch):
        inputs[row, :len(source)] = torch.tensor(source)
        targets[row, :len(target)] = torch.tensor(target)
        lengths[row] = len(source)
        keyword_ids[row, :len(keywords)] = torch.tensor(keywords)
        keyword_mask[row, :len(keywords)] = 1.0
    return inputs, targets, lengths, keyword_ids, keyword_mask


class HolisticGru(nn.Module):
    def __init__(self, keyword_count: int) -> None:
        super().__init__()
        self.keyword = nn.Embedding(keyword_count, KEYWORD_EMBED)
        self.character = nn.Embedding(28, CHAR_EMBED)
        self.condition = nn.Linear(KEYWORD_EMBED, HIDDEN)
        self.gru = nn.GRU(CHAR_EMBED, HIDDEN, batch_first=True)
        self.output = nn.Linear(HIDDEN, 27)

    def initial_hidden(self, keyword_ids: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        embeddings = self.keyword(keyword_ids)
        denominator = mask.sum(dim=1, keepdim=True).clamp_min(1.0)
        mean = (embeddings * mask.unsqueeze(-1)).sum(dim=1) / denominator
        return torch.tanh(self.condition(mean)).unsqueeze(0)

    def forward(
        self,
        inputs: torch.Tensor,
        keyword_ids: torch.Tensor,
        keyword_mask: torch.Tensor,
    ) -> torch.Tensor:
        hidden = self.initial_hidden(keyword_ids, keyword_mask)
        states, _ = self.gru(self.character(inputs), hidden)
        return self.output(states)


def loss_sum(logits: torch.Tensor, targets: torch.Tensor) -> tuple[torch.Tensor, int]:
    flat_targets = targets.reshape(-1)
    loss = nn.functional.cross_entropy(
        logits.reshape(-1, logits.shape[-1]),
        flat_targets,
        ignore_index=PAD_TARGET,
        reduction="sum",
    )
    return loss, int((flat_targets != PAD_TARGET).sum().item())


@torch.no_grad()
def nll(model: HolisticGru, loader: DataLoader, empty: bool = False) -> float:
    model.eval()
    total = 0.0
    tokens = 0
    for inputs, targets, _, keyword_ids, keyword_mask in loader:
        if empty:
            keyword_mask = torch.zeros_like(keyword_mask)
        loss, count = loss_sum(model(inputs, keyword_ids, keyword_mask), targets)
        total += float(loss.item())
        tokens += count
    return total / max(tokens, 1)


@torch.no_grad()
def per_sample_nll(
    model: HolisticGru,
    inputs: torch.Tensor,
    targets: torch.Tensor,
    keyword_ids: torch.Tensor,
    keyword_mask: torch.Tensor,
) -> torch.Tensor:
    logits = model(inputs, keyword_ids, keyword_mask)
    losses = nn.functional.cross_entropy(
        logits.transpose(1, 2),
        targets,
        ignore_index=PAD_TARGET,
        reduction="none",
    )
    counts = (targets != PAD_TARGET).sum(dim=1).clamp_min(1)
    return losses.sum(dim=1) / counts


@torch.no_grad()
def wrong_condition_accuracy(model: HolisticGru, loader: DataLoader) -> float:
    model.eval()
    wins = 0
    comparisons = 0
    generator = torch.Generator().manual_seed(0xC0FFEE)
    for inputs, targets, _, keyword_ids, keyword_mask in loader:
        true_nll = per_sample_nll(model, inputs, targets, keyword_ids, keyword_mask)
        batch = inputs.shape[0]
        if batch < 2:
            continue
        for _ in range(9):
            shift = int(torch.randint(1, batch, (1,), generator=generator).item())
            wrong_ids = keyword_ids.roll(shifts=shift, dims=0)
            wrong_mask = keyword_mask.roll(shifts=shift, dims=0)
            wrong_nll = per_sample_nll(model, inputs, targets, wrong_ids, wrong_mask)
            wins += int((true_nll < wrong_nll).sum().item())
            comparisons += batch
    return wins / max(comparisons, 1)


def condition_batch(
    words: list[str], keyword_ids: dict[str, int]
) -> tuple[torch.Tensor, torch.Tensor]:
    ids = [keyword_ids[word] for word in words if word in keyword_ids]
    if not ids:
        ids = [0]
        mask = [0.0]
    else:
        mask = [1.0] * len(ids)
    return torch.tensor([ids], dtype=torch.long), torch.tensor([mask], dtype=torch.float32)


@torch.no_grad()
def sample_name(
    model: HolisticGru,
    words: list[str],
    keyword_ids: dict[str, int],
    temperature: float,
    top_k: int,
    generator: torch.Generator,
) -> str:
    model.eval()
    ids, mask = condition_batch(words, keyword_ids)
    hidden = model.initial_hidden(ids, mask)
    token = torch.tensor([[BOS]], dtype=torch.long)
    result = []
    for _ in range(12):
        state, hidden = model.gru(model.character(token), hidden)
        logits = model.output(state[:, -1, :])[0] / temperature
        if len(result) < 4:
            logits[0] = -torch.inf
        count = min(top_k, logits.numel())
        values, indices = torch.topk(logits, count, sorted=True)
        probabilities = torch.softmax(values, dim=0)
        selected = int(torch.multinomial(probabilities, 1, generator=generator).item())
        output_id = int(indices[selected].item())
        if output_id == 0:
            break
        result.append(chr(ord("a") + output_id - 1))
        token = torch.tensor([[output_id + 1]], dtype=torch.long)
    return "".join(result)


@torch.no_grad()
def average_name_logp(
    model: HolisticGru,
    name: str,
    words: list[str],
    keyword_ids: dict[str, int],
) -> float:
    ids, mask = condition_batch(words, keyword_ids)
    hidden = model.initial_hidden(ids, mask)
    input_id = BOS
    total = 0.0
    output_ids = [ord(character) - ord("a") + 1 for character in name] + [0]
    for output_id in output_ids:
        token = torch.tensor([[input_id]], dtype=torch.long)
        state, hidden = model.gru(model.character(token), hidden)
        logits = model.output(state[:, -1, :])[0]
        total += float(torch.log_softmax(logits, dim=0)[output_id].item())
        input_id = output_id + 1
    return total / max(len(output_ids), 1)


@torch.no_grad()
def select_sampling_parameters(
    model: HolisticGru,
    validation_rows: list[dict],
    keyword_ids: dict[str, int],
) -> tuple[dict, list[dict]]:
    calibration = sorted(validation_rows, key=lambda row: (row["qid"], row["name"]))[
        :VALIDATION_SAMPLE_ROWS
    ]
    matrix = []
    for temperature in TEMPERATURES:
        for top_k in TOP_KS:
            generator = torch.Generator().manual_seed(
                SEED ^ int(temperature * 100) ^ (top_k << 16)
            )
            names = []
            logps = []
            lifts = []
            for row in calibration:
                for _ in range(VALIDATION_SAMPLES_PER_ROW):
                    name = sample_name(
                        model,
                        row["keywords"],
                        keyword_ids,
                        temperature,
                        top_k,
                        generator,
                    )
                    names.append(name)
                    conditioned = average_name_logp(model, name, row["keywords"], keyword_ids)
                    empty = average_name_logp(model, name, [], keyword_ids)
                    logps.append(conditioned)
                    lifts.append(conditioned - empty)
            unique_rate = len(set(names)) / max(len(names), 1)
            mean_logp = sum(logps) / max(len(logps), 1)
            mean_lift = sum(lifts) / max(len(lifts), 1)
            matrix.append({
                "temperature": temperature,
                "top_k": top_k,
                "samples": len(names),
                "unique_rate": unique_rate,
                "mean_condition_logp": mean_logp,
                "mean_condition_lift": mean_lift,
            })
    # Frozen validation-only choice: maximize unique output rate, then
    # condition lift and model likelihood. No sealed test observation enters it.
    selected = max(
        matrix,
        key=lambda row: (
            row["unique_rate"],
            row["mean_condition_lift"],
            row["mean_condition_logp"],
            -row["temperature"],
            -row["top_k"],
        ),
    )
    return selected, matrix


def quantize_rows(tensor: torch.Tensor) -> tuple[list[float], bytes]:
    matrix = tensor.detach().cpu().to(torch.float32)
    if matrix.ndim != 2:
        raise ValueError("quantized tensors must be matrices")
    scales = []
    values = bytearray()
    for row in matrix:
        maximum = float(row.abs().max().item())
        scale = maximum / 127.0 if maximum > 0 else 1.0
        scales.append(scale)
        quantized = torch.clamp(torch.round(row / scale), -127, 127).to(torch.int8)
        values.extend((int(value.item()) & 0xFF) for value in quantized)
    return scales, bytes(values)


def quantized_copy(model: HolisticGru) -> HolisticGru:
    copy = HolisticGru(model.keyword.num_embeddings)
    state = model.state_dict()
    quantized_names = {
        "keyword.weight",
        "character.weight",
        "condition.weight",
        "gru.weight_ih_l0",
        "gru.weight_hh_l0",
        "output.weight",
    }
    restored = {}
    for name, tensor in state.items():
        if name not in quantized_names:
            restored[name] = tensor.detach().clone()
            continue
        scales, values = quantize_rows(tensor)
        signed = [value if value < 128 else value - 256 for value in values]
        matrix = torch.tensor(signed, dtype=torch.float32).reshape(tensor.shape)
        matrix *= torch.tensor(scales, dtype=torch.float32).unsqueeze(1)
        restored[name] = matrix
    copy.load_state_dict(restored)
    copy.eval()
    return copy


@torch.no_grad()
def next_logits(
    model: HolisticGru,
    words: list[str],
    prefix: str,
    keyword_ids: dict[str, int],
) -> list[float]:
    ids, mask = condition_batch(words, keyword_ids)
    hidden = model.initial_hidden(ids, mask)
    logits = None
    for input_id in [BOS, *[CHAR_OFFSET + ord(char) - ord("a") for char in prefix]]:
        token = torch.tensor([[input_id]], dtype=torch.long)
        state, hidden = model.gru(model.character(token), hidden)
        logits = model.output(state[:, -1, :])[0]
    if logits is None:
        raise RuntimeError("parity prefix produced no step")
    return [float(value) for value in logits.tolist()]


def encode_model(model: HolisticGru, metadata: dict) -> bytes:
    state = model.state_dict()
    quantized_names = [
        "keyword.weight",
        "character.weight",
        "condition.weight",
        "gru.weight_ih_l0",
        "gru.weight_hh_l0",
        "output.weight",
    ]
    float_names = [
        "condition.bias",
        "gru.bias_ih_l0",
        "gru.bias_hh_l0",
        "output.bias",
    ]
    tensors: list[tuple[int, str, torch.Tensor]] = []
    tensors.extend((0, name, state[name]) for name in quantized_names)
    tensors.extend((1, name, state[name]) for name in float_names)
    metadata_bytes = json.dumps(metadata, sort_keys=True, separators=(",", ":")).encode("utf-8")
    output = bytearray(MAGIC)
    output.extend(struct.pack("<II", VERSION, len(metadata_bytes)))
    output.extend(metadata_bytes)
    output.extend(struct.pack("<I", len(tensors)))
    for kind, name, tensor in tensors:
        name_bytes = name.encode("ascii")
        matrix = tensor.detach().cpu().to(torch.float32)
        rows = matrix.shape[0]
        cols = matrix.shape[1] if matrix.ndim == 2 else 1
        output.extend(struct.pack("<BBII", kind, len(name_bytes), rows, cols))
        output.extend(name_bytes)
        if kind == 0:
            scales, values = quantize_rows(matrix)
            output.extend(struct.pack(f"<{len(scales)}f", *scales))
            output.extend(values)
        else:
            values = matrix.reshape(-1).tolist()
            output.extend(struct.pack(f"<{len(values)}f", *values))
    return bytes(output)


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
    vocab = [line.strip() for line in vocab_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(vocab) != 512 or sha256(vocab_path.read_bytes()) != manifest["vocab_sha256"]:
        raise RuntimeError("keyword vocabulary drifted")
    keyword_ids = {word: index for index, word in enumerate(vocab)}
    rows = read_jsonl_gzip(args.data)
    split_rows = {
        split: [row for row in rows if row["split"] == split]
        for split in ("train", "validation", "test")
    }
    loaders = {
        split: DataLoader(
            NameDataset(items, keyword_ids),
            batch_size=BATCH_SIZE,
            shuffle=(split == "train"),
            generator=torch.Generator().manual_seed(SEED),
            collate_fn=collate,
            num_workers=0,
        )
        for split, items in split_rows.items()
    }

    model = HolisticGru(len(vocab))
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    best_state = None
    best_validation = math.inf
    best_epoch = 0
    stale = 0
    history = []
    for epoch in range(1, MAX_EPOCHS + 1):
        model.train()
        total = 0.0
        tokens = 0
        for inputs, targets, _, keyword_ids_batch, keyword_mask in loaders["train"]:
            optimizer.zero_grad(set_to_none=True)
            loss, count = loss_sum(model(inputs, keyword_ids_batch, keyword_mask), targets)
            (loss / count).backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total += float(loss.item())
            tokens += count
        validation_nll = nll(model, loaders["validation"])
        train_nll = total / max(tokens, 1)
        history.append({"epoch": epoch, "train_nll": train_nll, "validation_nll": validation_nll})
        print(f"epoch {epoch:02d} train {train_nll:.5f} validation {validation_nll:.5f}")
        if validation_nll < best_validation - 1e-6:
            best_validation = validation_nll
            best_epoch = epoch
            best_state = {key: value.detach().clone() for key, value in model.state_dict().items()}
            stale = 0
        else:
            stale += 1
            if stale >= PATIENCE:
                break
    if best_state is None:
        raise RuntimeError("training did not produce a checkpoint")
    model.load_state_dict(best_state)

    selected_sampling, sampling_matrix = select_sampling_parameters(
        model, split_rows["validation"], keyword_ids
    )

    test_conditioned = nll(model, loaders["test"])
    test_empty = nll(model, loaders["test"], empty=True)
    nll_improvement = (test_empty - test_conditioned) / test_empty if test_empty else 0.0
    wrong_accuracy = wrong_condition_accuracy(model, loaders["test"])
    metrics = {
        "best_epoch": best_epoch,
        "validation_nll": best_validation,
        "test_conditioned_nll": test_conditioned,
        "test_empty_nll": test_empty,
        "test_nll_relative_improvement": nll_improvement,
        "wrong_condition_pairwise_accuracy": wrong_accuracy,
    }
    metadata = {
        "schema": "neologism-holistic-model-v1",
        "seed": SEED,
        "character_embedding": CHAR_EMBED,
        "keyword_embedding": KEYWORD_EMBED,
        "hidden": HIDDEN,
        "keyword_vocabulary": vocab,
        "dataset_sha256": manifest["dataset_sha256"],
        "vocab_sha256": manifest["vocab_sha256"],
        "sampling": selected_sampling,
        "metrics": metrics,
    }
    model_bytes = encode_model(model, metadata)
    if len(model_bytes) > MAX_ARTIFACT:
        raise RuntimeError(f"model artifact too large: {len(model_bytes)} > {MAX_ARTIFACT}")
    args.out.mkdir(parents=True, exist_ok=True)
    model_path = args.out / "holistic-v1.bin"
    model_path.write_bytes(model_bytes)
    quantized = quantized_copy(model)
    parity_cases = []
    for index, row in enumerate(
        sorted(split_rows["validation"], key=lambda item: (item["qid"], item["name"]))[:100]
    ):
        prefix_length = index % (len(row["name"]) + 1)
        prefix = row["name"][:prefix_length]
        parity_cases.append({
            "keywords": row["keywords"],
            "prefix": prefix,
            "logits": next_logits(quantized, row["keywords"], prefix, keyword_ids),
        })
    parity_payload = {
        "schema": "neologism-holistic-parity-v1",
        "model_sha256": sha256(model_bytes),
        "cases": parity_cases,
    }
    (args.out / "parity-reference.json").write_text(
        json.dumps(parity_payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    report = {
        "schema": "neologism-holistic-training-report-v1",
        "torch_version": torch.__version__,
        "python": sys.version,
        "model_bytes": len(model_bytes),
        "model_sha256": sha256(model_bytes),
        "architecture": {
            "character_embedding": CHAR_EMBED,
            "keyword_embedding": KEYWORD_EMBED,
            "hidden": HIDDEN,
            "keyword_vocabulary": len(vocab),
        },
        "splits": {key: len(value) for key, value in split_rows.items()},
        "metrics": metrics,
        "sampling_selection": {
            "basis": "validation-only unique-rate then condition-lift then likelihood",
            "selected": selected_sampling,
            "matrix": sampling_matrix,
        },
        "history": history,
        "gates": {
            "artifact_at_most_128_kib": len(model_bytes) <= MAX_ARTIFACT,
            "test_nll_improvement_at_least_5_percent": nll_improvement >= 0.05,
            "wrong_condition_accuracy_at_least_65_percent": wrong_accuracy >= 0.65,
        },
    }
    report_path = args.out / "training-report.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(report, indent=2, sort_keys=True))
    if not all(report["gates"].values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
