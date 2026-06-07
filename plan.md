# Neologism Engine — Future Options (not yet built)

The engine is complete through phase 18 (overlap blending + MMR diversity). The grounded,
high-value engine work is done. This document records the **remaining options** with honest
advantages and disadvantages, so a future decision is informed. None of these are implemented.

> Quick orientation: items 1–2 (overlap blending, MMR diversity) are **already built**. The
> items below are 3–6 from the research report.

---

## 3. Phonotactic-probability pronounceability metric

*Replace the heuristic pronounceability score with a principled one — Vitevitch & Luce (2004):
nonwords built from high-frequency letter/sound sequences are rated more "word-like".*

**Advantages**
- More accurate, research-validated pronounceability (positional bigram/trigram probabilities).
- Reuses infrastructure we already have (n-gram counts over a corpus, like the Markov model).
- Pure function, no new deps, stays client-side/WASM.

**Disadvantages**
- Marginal real-world gain: our heuristic (CV alternation + cluster penalty) already correlates
  well; users won't notice a different number.
- Needs a frequency table (per-language) baked in; adds data weight.
- True version operates on **phonemes**, not letters — without G2P it's still an approximation.

**Effort:** ~half a day. **Verdict:** low priority — a metric refinement, not a capability.

---

## 4. Wuggy-style template / multilingual generation

*Subsyllabic (onset–nucleus–coda) bigram-chain generation — Keuleers & Brysbaert (2010) — that can
generate a name matching a template word's structure ("a name like Spotify") and supports multiple
language phonologies.*

**Advantages**
- A genuinely **new capability**: "make a name like X", plus per-language flavors (Japanese,
  Nordic, Latin) — the biggest differentiator competitors (Wordoid) have that we don't.
- More phonotactically natural output than character Markov.
- Still classical/statistical — no neural runtime, fits the architecture.

**Disadvantages**
- Substantial rewrite of the generation core (subsyllabic segmentation + per-language frequency
  tables); highest effort of these options.
- Needs curated syllable-frequency data per language → significant data work.
- Uncertain incremental quality over the current Markov + sonority + MMR stack for *English*.

**Effort:** several days. **Verdict:** real but expensive; only if "language flavors" or
template-matching becomes a product goal.

---

## 5. Neural generation (char-RNN / LLM)

*Character-level RNN/LSTM or a Transformer/LLM to generate (and possibly explain) names.*

**Advantages**
- Most powerful: captures long-range style, can produce + justify names, follow freeform prompts.
- char-RNN trained offline could even be exported to run in-browser (ONNX/WebGPU).
- An LLM call would give the highest creativity and natural-language control.

**Disadvantages**
- **Breaks the core architecture**: an LLM needs a backend + API key + per-call cost; not
  client-side, not free, not offline.
- char-RNN needs a training pipeline + a model runtime in the browser (bundle size, complexity).
- Determinism/reproducibility (our seeded generation) is lost or hard.
- Heavy for the payoff on *invented short names*, where the classical stack already does well.

**Effort:** large (pipeline + runtime or backend). **Verdict:** out of scope by design — would
change what the project *is*.

---

## 6. Productization

*Turn the finished engine into a finished product: deployment, logos, social-handle checks,
language flavors.*

**Advantages**
- **Deployment** (GitHub Pages / Netlify) is the single highest-value next step overall — a
  generator nobody can reach isn't finished as a product. Low effort, big real-world impact.
- Logos / monogram previews and social-handle checks match what Namelix/Looka offer.
- All doable client-side except logos (which need an image service).

**Disadvantages**
- Not "engine" work — it's hosting, UX, and integrations.
- Logos realistically need a third-party service or a separate generator (scope creep).
- Social/domain checks add network calls and rate-limit handling.

**Effort:** deployment ~1–2 hours; the rest varies. **Verdict:** **deployment is recommended**;
logos/handles are optional polish.

---

## 7. Engine tuning (planned — big-tech quality)

*Phase 19 (order-3 backoff Markov, quality gate, syllable cap, re-weighted mix, mimics guard) and
Phase 20 (brand corpus 355→958) made big-tech the strongest style. Several constants introduced in
Phase 19 were reasoned defaults, never swept — and the corpus expansion surfaced a real-word-leak
gap. This phase tunes the knobs and closes that gap. No new deps; Sci-Fi/Fantasy must stay identical.*

**7a. Sweep the constants** (in [core/src/lib.rs](core/src/lib.rs) / [core/src/markov.rs](core/src/markov.rs)):

| Knob | Current | Range to sweep |
|---|---|---|
| `BT_MARKOV_W` / `BT_BLEND_W` (generator mix) | 0.55 / 0.30 | Markov 0.40–0.70, blend 0.15–0.40 |
| `ll_floor` sigma (quality gate) | mean − 2.0σ | 1.0–3.0σ |
| Markov order / `BACKOFF` | 3 / 0.4 | order 3–4, backoff 0.2–0.6 |
| `mimics_real_brand` edit-dist / len-window / min brand len | ≤2 / +2 / 5 | dist 1–2, window +1..+3, len 4–6 |
| rank `fluency_w` / `brevity_w` | 1.5 / 1.5 | 0.5–3.0 each |
| MMR `lambda` | 0.7 | 0.5–0.85 |
| syllable cap | 3 | 2–3 |

**Method:** extend the metrics harness ([core/examples/metrics.rs](core/examples/metrics.rs)) to (a)
average over many seeds for stability and (b) print a composite objective — pronounceability +
novelty + diversity, a "shape" proxy (% names in the 1–3 syllable / 5–9 char sweet spot), and avg
order-3 log-likelihood as a coherence signal. Coordinate-descent / coarse grid; pick the Pareto-best
config (guard against novelty collapse or diversity loss). Lock chosen constants; keep them named.

**Advantages:** squeezes more quality from the existing engine with zero architectural risk; the
harness gives fast, objective before/after.
**Disadvantages:** diminishing returns — the metrics are already high (pron ~91, div ~0.90); gains
are incremental, and over-fitting one metric can hurt another.
**Effort:** ~half a day. **Verdict:** worthwhile polish, lower priority than deployment.

**7b. Close the real-word-leak gap.** The bigger corpus made the model occasionally emit a real
English word that isn't in [core/data/words.txt](core/data/words.txt) (`Guard`, `Telegraph`,
`Content`, `Greet`) — the novelty/dict filter misses it. Options: (i) expand `words.txt` with a
common-English list, or (ii) decide such names are *acceptable* (real-word brands like Square /
Stripe / Notion are strong). **Lean toward (i)** with a moderate list, but keep the bar at "common
words only" so legitimately brandable rare words still pass. **Effort:** ~1–2 hours (data).

---

## Bottom line

Big-tech (the star feature) is now the strongest style and committed (Phases 19–20). Remaining
options, best-first: **#6 deployment** (ship it — highest value), **#7 tuning** (incremental polish
of the now-strong engine), then **#4 Wuggy** only if multilingual/template generation becomes a goal.
#3 is a minor refinement; #5 is a different project. See `README.md` for the full research
bibliography and `~/.claude/plans/` for the build history.
