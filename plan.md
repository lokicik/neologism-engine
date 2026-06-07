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

## 7. Engine tuning — DONE (Phase 21)

*Phase 21 tuned the Phase 19 constants and closed the real-word-leak gap. Big_tech novelty rose
~91.7 → 94.3 with pronounceability/diversity held; Sci-Fi/Fantasy unchanged (byte-for-byte). 47 tests.*

**7b — Real-word filter (done).** Root cause: shared `words.txt` is only 561 stop-words, AND it's
shared by all styles, so expanding it in place would have changed Sci-Fi/Fantasy. Fix: a **separate,
big-tech-only** [core/data/common_words.txt](core/data/common_words.txt) (~19.4k common English
words) applied only in `generate_bigtech`; scoring + shared dict untouched. Kills jarring leaks
(`Guard`, `Telegraph`, `Content`, `Greet`). A few brandable real words (`Fluent`, `Lucid`) and rare
ones (`Decamp`) still pass — left on purpose: real-word brands (Stripe/Square/Notion) are good, and
an exhaustive dictionary would filter those too.

**7a — Constant sweep (done).** Knobs extracted into a `BigTechTuning` struct (`Default` = production
values) so they're swept in-process via [core/examples/tune.rs](core/examples/tune.rs) (coordinate
descent, composite objective averaged over 8 seeds, uniq/novelty/diversity guards). Result
(composite 90.1 → 92.7):

| Knob | Was | Now |
|---|---|---|
| `markov_w` / `blend_w` | 0.55 / 0.30 | 0.45 / 0.15 |
| `gate_sigma` | 2.0 | 1.5 |
| `fluency_w` / `brevity_w` | 1.5 / 1.5 | 2.5 / 2.5 |
| `mmr_lambda` | 0.7 | 0.8 |
| `syllable_cap` | 3 | **3 (kept)** |

`syllable_cap` was the one override: the sweep preferred 2 (marginally higher composite, the
objective over-rewards brevity/novelty), but cap=2 bars every 3-syllable name — Spotify/Shopify-style
brands — for negligible real gain, so cap=3 was kept (eyeballed both). Markov order/`BACKOFF` and the
`mimics_real_brand` params were left fixed (lower leverage). **Verdict: shipped; near-ceiling now.**

---

## Bottom line

Big-tech (the star feature) is now the strongest style and committed (Phases 19–20). Remaining
options, best-first: **#6 deployment** (ship it — highest value), **#7 tuning** (incremental polish
of the now-strong engine), then **#4 Wuggy** only if multilingual/template generation becomes a goal.
#3 is a minor refinement; #5 is a different project. See `README.md` for the full research
bibliography and `~/.claude/plans/` for the build history.
