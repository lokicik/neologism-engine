#!/usr/bin/env python3
"""Deterministic mathematical audit for the Phase 295 evaluation minimum."""

from __future__ import annotations

import json
import math


Z = 1.959963984540054


def wilson(rate: float, count: int) -> tuple[float, float]:
    denominator = 1.0 + Z * Z / count
    center = (rate + Z * Z / (2 * count)) / denominator
    half = Z * math.sqrt(rate * (1 - rate) / count + Z * Z / (4 * count * count)) / denominator
    return center - half, center + half


def binomial_tail_half(count: int, threshold: int) -> float:
    return sum(math.comb(count, successes) for successes in range(threshold, count + 1)) / (2**count)


def main() -> None:
    worst = wilson(0.5, 2000)
    gate = wilson(0.65, 2000)
    retrieval = wilson(0.95, 3000)
    tail = binomial_tail_half(2000, 1300)
    gates = {
        "condition_null_tail_at_most_1e_30": tail <= 1e-30,
        "fifty_percent_reserve": 3000 >= 2000 * 1.5,
        "gate_wilson_lower_at_least_0_62": gate[0] >= 0.62,
        "retrieval_half_width_at_most_0_01": (retrieval[1] - retrieval[0]) / 2 <= 0.01,
        "worst_half_width_at_most_0_022": (worst[1] - worst[0]) / 2 <= 0.022,
    }
    report = {
        "condition_gate_wilson_95": gate,
        "condition_null_exact_one_sided_p": tail,
        "eligible_minimum": 3000 if all(gates.values()) else None,
        "gates": gates,
        "retrieval_gate_wilson_95": retrieval,
        "worst_case_wilson_95": worst,
    }
    print(json.dumps(report, ensure_ascii=False, separators=(",", ":"), sort_keys=True))
    raise SystemExit(0 if all(gates.values()) else 2)


if __name__ == "__main__":
    main()
