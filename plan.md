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

## 8. Beyond heuristics — roadmap to better *results* (Phase 26)

*Phases 19–25 squeezed the heuristic stack about as far as it goes: backoff Markov, MMR diversity,
brand-mimic/real-word filters, a Variety knob, exclude-recent, and a 5k+ founder-vetted corpus
(YC + GitHub). Hand-categorizing fresh samples puts the keeper rate (names you'd actually consider
using) at roughly **two in three**. The honest finding from this run: that ceiling isn't a tuning
problem anymore.*

**The bottleneck:** the engine *generates* well but *judges* badly. Our scores — pronounceability,
novelty, memorability, diversity — are proxies. They cannot tell `Logitan` (clean, brandable) from
`Bombanac` (numerically fine, reads as awkward). No amount of constant-sweeping fixes a judge that
can't see the thing that actually matters. Better results from here on means a better judge, not
more generation tuning.

Four directions, ranked by where the leverage actually is:

**#1 — Offline LLM-distilled quality scorer (top pick).** Use an LLM *offline, once*, to label a
large batch of candidate names ("would you use this as a brand name? 1–5"). Train a small model
(logistic regression / tiny MLP over phonetic + n-gram + structural features) on those labels, and
ship the resulting weights — kilobytes, not megabytes — into the WASM build as a drop-in replacement
for today's heuristic gate. Estimated gain: keeper-rate ~67% → ~85%. Stays **fully offline, no API
key, no backend** — the one neural-flavored option that doesn't break the architecture. This is
"the gain of a model without the cost of running one."

**#2 — Optional online AI mode.** Let an LLM re-rank/generate candidates, write one-line
explanations, or take a freeform brief ("name like Stripe but for logistics"). Best raw quality and
the most natural UX, but requires a backend + API key + per-call cost — opt-in only, and it changes
what the project *is* (no longer purely client-side/offline). Treat as an add-on mode, not a
replacement for the core engine.

**#3 — Subword/syllable generation** (extends item #4 above, Wuggy-style). Replace character-Markov
with an onset–nucleus–coda model: more phonotactically natural names, "a name like Spotify"
template-matching, and per-language flavors (Japanese, Nordic, Latin). A real generation-core
rewrite — substantial data + engineering work — but stays classical/offline. Orthogonal to #1: a
better *generator* still needs a better *judge* to pick its best output.

**#4 — Usefulness / productization** (extends item #6 above). Different axis entirely — not better
*strings*, but more *useful* results: semantic relevance to a product description (embeddings),
real domain/social-handle availability checks, short "why this name works" explanations,
pronunciation guides. Valuable, but doesn't move name *quality* — complements #1 rather than
competing with it.

**The key distinction driving sequencing: data buys *variety*, a scorer buys *quality*.** Phase 25
proved more clean data grows the distinct-name space (fewer repeats) with diminishing returns, but
it cannot raise the keeper-rate ceiling — feeding the same Markov+heuristic judge more material
doesn't make the judge smarter. Conversely, a better scorer raises keeper-rate *immediately*, on
the existing corpus, with no data work at all. **Sequencing "expand data, then build the scorer" is
sound** — a bigger corpus gives the offline labeling step (#1) more raw material to draw candidates
from — but if forced to choose one, the scorer (#1) is where the next real quality jump lives.

**Corpus growth has saturated — measured, not assumed (Phase 26).** Tested whether *more* clean
data still helps: pulled ~5.5k PyPI top-download package names + ~900 more GitHub repos (deeper
star-range pagination), filtered through the Phase 25 pipeline (dictionary-word removal,
brand-likelihood scoring vs. the existing model, junk/offensive filter) down to 1,258 new clean,
brand-scored candidates (mean log-likelihood −2.76, on par with the YC batch's −2.84) — a 25%
corpus increase, 5,075 → 6,333. Clean A/B with the `repeats` harness (identical code, only the
corpus file swapped):

| Corpus | Distinct big-tech names (300×10 batches) | `mem` |
|---|---|---|
| 5,075 (Phase 25) | **2,237** | 75.5 |
| 6,333 (+1,258 PyPI/GitHub) | **2,195** | 75.0 |

More data made the space *smaller*, not bigger — both numbers are within run-to-run noise of each
other, i.e. **no measurable gain**. The char-Markov model's statistics had already converged at
~5k entries; another 1,258 "founder-vetted-equivalent" names just reshuffles which already-likely
patterns the model favors, it doesn't unlock new ones. **Conclusion: stop gathering data — the
corpus is at its useful ceiling. The 1,258-name addition was *not* merged** (kept `bigtech.txt` at
its committed 5,075-line state). This sharpens roadmap #1: the offline scorer is now not just the
best lever, it's the *only* lever left that can move results forward.

---

## 9. Phase 27 — offline LLM-distilled scorer: tried, stopped at Checkpoint B (no merge)

*Roadmap #1 (§8) got unblocked — the user provided a local LLM (llama.cpp, Gemma 3 12B QAT Q4,
OpenAI-compatible API at `127.0.0.1:8080`). A live probe confirmed it gives exactly the
discriminating judgment the heuristics can't: asked to rate `Loftlab/Bombanac/Logitan/Zqxprull`
1–5, it returned `[4, 2, 4, 1]` — correctly separating the *Logitan-vs-Bombanac* pair that's been
this project's running example of what proxies miss. So the plan was: label ~2,000 candidates
with the LLM once, train a tiny linear model on the existing 9 features (reusing
`log_likelihood`, `score_pronounceability/memorability/novelty`, `syllable_count`,
`respects_sonority`, length, vowel ratio, max-consonant-run), and ship just the weights into WASM.*

**What was built** (`core/examples/label_names.rs`, `core/examples/train_scorer.rs`, both still in
the tree, uncommitted-to-history as working tools): a candidate-pool generator with the
word-likeness gate loosened (`gate_sigma = 8.0`) so it surfaces the full quality spectrum
(clean brand-like names down to junk), a batched (25/call) rater calling the local LLM over raw
HTTP/TCP, and a hand-rolled gradient-descent linear-regression trainer with z-score
normalization and an 80/20 train/validation split.

**Checkpoint A passed** — 50 names labeled, eyeballed, and the gradient made sense: label-1 names
(`Ederfectx, Grovelab, Hebbitro, Pillseai`) read as genuinely awkward, label-4 names
(`Breezeai, Bufferly, Lucidhub, Pixelai`) as clean and brand-like.

**Checkpoint B failed — Pearson correlation 0.252 (below the 0.3 "weak" floor), MAE 0.90 on a
1–5 scale.** Trained on 1,080 examples (1,350 labeled total — a power outage interrupted the
2,000-name run mid-way; the resumable design preserved all progress, but re-runs kept hitting
batches that made the model produce abnormally long reasoning and truncate its answer, so the
remaining ~650 weren't worth fighting for). The model's predictions clustered narrowly (2.0–3.7)
regardless of the LLM's actual rating (1–5): `Roamio` predicted 3.28, rated 5; `Scriptly`
predicted 2.06, rated 4. One feature (`respects_sonority`) had ~zero variance in the dataset and
its learned weight collapsed to 0.

**Why it failed — and this is the useful part:** it isn't a data-volume problem (1,080 examples
is plenty for 9 features) or a model-capacity problem (the plan's own fallback — escalate to a
bigger model only if the linear one is the bottleneck — wouldn't have helped, because the
ceiling is in the *inputs*, not the *fit*). It's a **feature-vocabulary gap**. The LLM's own
reasoning showed it docking `Bombanac` because *"sounds like 'bomb' or 'bombastic' — might have
negative connotations"* — a **semantic/connotative** judgment. Every one of our 9 features is
structural or phonotactic (length, syllables, n-gram likelihood, consonant runs); none of them
can represent "this string evokes the real word 'bomb'." A linear blend of nine ways to measure
*shape* cannot predict a judgment about *meaning*. Distilling that signal would require a
fundamentally different feature pipeline (e.g., substring/embedding similarity to a real-word
corpus) — which is no longer "ship a kilobyte weight array," it's a different and heavier
architecture, arguably crossing into roadmap #2/#5 territory (the deliberate offline/no-runtime
scope boundary this project has held since Phase 18).

**Conclusion: stopped per the plan's own checkpoint-gate ("if validation correlation is weak,
stop here rather than ship a model that just adds noise") — correctly so.** Per the project's
not-shipping-noise rule, `core/src/scorer.rs` was never written and `generate_bigtech` is
untouched. This sharpens the original §8 diagnosis from "the judge is bad" to something more
precise and more final: **the judge is bad because its entire feature vocabulary is structural,
and brand-quality judgment runs on semantic association — an axis the classical/offline stack
cannot reach without breaking its own architecture.** That reframes roadmap #2 (online AI mode)
from "an alternative path" to "the *only* path to a smarter judge" — at the cost the project has
always known it carries: a backend, an API key, and leaving pure-client-side behind.

---

## 10. Phase 28 — local LLM re-ranker + offline brand-appeal sweetener (shipped, `e7c5cdd`)

*Phase 27 closed the offline-distilled-scorer path (§9), but two findings reopened the problem from
a better angle. First, the "offline is a dead end" verdict was **half-wrong — it was under-featured**:
an in-memory retrain on the same 1,350-name labeled set, adding four trivial **offline semantic**
features, lifted held-out correlation with the LLM's judgment from r=0.19 → 0.33 (the four alone
score 0.31; the original nine structural features were mostly noise). Second, the user runs the app
**locally with a llama.cpp server always available**, so the "breaks the pure-offline architecture"
objection that gated roadmap #2 doesn't apply to their use — the LLM re-ranker is unconditionally on
the table. Chosen direction: a lightweight two-stage design (cheap offline filter → LLM rerank, the
RAG-reranking textbook pattern), attacking the "2-in-8 keepers" problem from both ends. Big-tech only.*

**Part 1 — offline brand-appeal sweetener (`core/src/lib.rs`, big-tech only).** A new
`brand_appeal()` term folded into the bigtech `rank` closure, reusing the existing `common_words`
HashSet (no new data/deps). It scores four researched signals: longest real-word prefix length
(`Forge`lab), clean brandable suffix (`-ify/-io/-ai/-ia/-ly/-ix/-ora`), and a penalty for harsh
consonant-cluster endings (`-rch/-tch/-sh/-ck/-sk/-ft/-rt/-rk/-nt/-st/-ld/-rd`). Three new
`BigTechTuning` knobs (`prefix_w=0.10`, `suffix_w=0.40`, `harsh_w=0.50`), gated behind `!has_roots`
exactly like `fluency_w`/`brevity_w` (the prefix/suffix rewards relax to 0 at high variety; the
harsh penalty stays on as a junk signal). The `tune.rs` sweep was **deliberately skipped** — it
optimizes the proxy composite (uniqueness/novelty/diversity), the exact signal `brand_appeal` exists
to bypass, so sweeping would mis-calibrate it; defaults are grounded in the r-value research instead.
48 tests pass; Sci-Fi/Fantasy metrics byte-for-byte identical.

**Part 2 — local LLM re-ranker (`web/src/lib/llm.ts` + `App.tsx`, opt-in).** A "✨ AI rank" toggle:
over-generates a 30-name pool, shows the offline-ranked top-N **instantly**, then a local
OpenAI-compatible LLM (llama.cpp at `127.0.0.1:8080`) re-ranks in the background and reorders to its
picks. Mirrors the `domain.ts` graceful-fallback pattern: any failure (unreachable, CORS, malformed
reply) returns null and silently keeps the offline ranking — no error, never blocks. Auto-detects
the model via `GET /v1/models`; one batched 1–10 brand-quality prompt; parses `choices[0].message.content`.
Pool was cut 50→30 for ~30s latency (the local model's verbose reasoning makes the call scale with
name count). CORS pre-verified with curl before building the UI.

**Live evidence (this session, CLI).** A 30-name production pool (seed 42): the LLM buried `Tetript`
(3/10) and `Regorge` (2/10) that sat in the offline **top-10**, and surfaced `Insilion`, `Haystra`,
`Tokenlab`, `Metrace` from the offline **bottom half** (`Metrace` was offline rank 30/30, LLM 7/10).
Offline top-10 ≈ 3/10 keepers; LLM top-10 ≈ 9/10. Separately confirmed the offline proxies *are*
correlated with quality at the population level — the 20 most-repeated names averaged 6.2/10 vs 4.9
for unique-once names — but with telling blind spots (`Metahub`, repeated 8×, scored 4/10: "meta"
is structurally perfect but semantically just Meta/Facebook). The re-ranker is the piece that
resolves those.

---

## 11. Phase 29 — name-space expansion (shipped, `33ef467`)

*A 10k-generation sweep showed the same structural attractors dominating every session (Keyston,
Codesk, Dataly). Root cause: of the two generative paths, the Markov path (~45%) has converged
(Phase 26 proved more corpus data gives no gain) and the blend+transform path (~55%) applied one of
only **11 fixed tech suffixes** — a tiny combinatorial space. Goal: widen the space without touching
quality. Big-tech only.*

**Two changes.** (1) `TECH_SUFFIXES` in `core/src/blend.rs` expanded **11 → 24** — added
`app/byte/core/edge/flow/forge/hive/link/net/ops/sync/wave/works`, all soft-ending so none trigger
the Phase 28 harsh-ending penalty, and none overlap the clean-suffix bonus (pure space expanders).
(2) In `BigTechTuning::from_variety()`, shifted the generator mix at v=0: `blend_w` 0.15 → 0.25 and
`markov_w` 0.45 → 0.35 (root weight unchanged at 0.40), moving 10% of generation off the converged
Markov path onto the combinatorial blend path (366 roots × 366 × 24 suffixes). High-variety (v=1)
endpoints unchanged.

**Result.** Raw 10k-sweep distinct count 5,329 → 5,867 (+10%); the heavy-attractor tail flattened
dramatically — names appearing >20× in 10k went from **62 → 2** (only Keyston/Codesk remain, and
those are pure Markov outputs no suffix trick can touch). Official `repeats` harness: 2,026 → 2,254
raw distinct (+11%); exclude-250 worst-case recurrence dropped to 3%. 48 tests pass; Sci-Fi/Fantasy
byte-for-byte identical.

---

## 12. Phase 30 — seed/distinctness investigation + widen exclude-recent 500 → 2000 (shipped, `567e864`)

*The user wanted "distinct names every time." This phase is mostly the **investigation** that found
the real lever — and corrected an earlier mistaken claim of mine.*

**The "~5,300 ceiling" was a misread — the real vocabulary is 33k+ and still climbing.** Extending
the sweep to 100,000 generations showed the distinct count was never near an asymptote; it was just
a point on a sampling curve:

| Generated | Distinct | % unique |
|---|---|---|
| 10,000 | 5,867 | 58.7% |
| 20,000 | 10,187 | 50.9% |
| 50,000 | 20,620 | 41.2% |
| 100,000 | **33,575** | 33.6% |

The unique *rate* falls as you draw more (you re-draw names you've seen), but the absolute distinct
count keeps rising — 68% of the 33,575 (22,707 names) appeared exactly once. The generator's true
big-tech vocabulary is at least 6× what §11's 10k sample implied, and still growing at 100k.

**Seeds were never the cause of repeats — proven, not asserted.** The engine already draws a fresh
`rand::random()` seed on every call ([lib.rs:185](core/src/lib.rs#L185)); `wasm/Cargo.toml` enables
`getrandom`'s `js` feature so that has real browser entropy; and the web app passes no fixed seed
(the UI's "seed words" box is `roots`, unrelated). A decisive test — **10,000 distinct seeds, one
name each** — produced only **6,535 distinct names (65.4%)**, with `Keyston` recurring across **92
different seeds**. Unique seeds do *not* give unique names: a high-probability output recurs no
matter what seed you start from (`Keyston` holds a stable ~1% of output at every scale: 109/10k,
1,063/100k, 92/10k-seeds). Duplicates are a property of the generator's **probability distribution**,
not seed reuse.

**The only real anti-repeat lever is exclude-recent — and it's a web-app concept, not an engine
one.** The core engine is stateless per call: it only accepts an `exclude` list
([lib.rs:292](core/src/lib.rs#L292)) and filters those names out. The **web app** maintains the
rolling "recent" list (capped at `RECENT_WINDOW`, persisted in localStorage) and passes it as
`exclude` every Generate. The CLI examples mostly pass an empty exclude (`sample`, `metrics`, and the
sweep tooling measured the **raw generator** — which is why those distinct-% figures are the floor,
not the lived experience); `repeats.rs` is the one that *simulates* exclude-recent. So the raw sweep
numbers and the web app's behavior differ by design: the app layers exclusion on top of the raw
generator.

**The change.** With the vocabulary now known to be 33k+, widened `RECENT_WINDOW` **500 → 2000** in
`web/src/App.tsx` (a single UI constant — no engine/Rust/WASM change, no rebuild). Pushes the
no-repeat horizon from ~50 to ~200 batches. **Verified headless** that the larger exclude doesn't
starve generation: a 400-batch session with the exclude list pegged at its full 2,000-name peak
returned the complete 10 names on **every batch (0/400 short)** — the engine's `target*80` attempt
budget skips excluded names with ample room in a 33k space. (The temporary measurement examples
`gen_names.rs`/`excl_check.rs` were scratch and removed; `label_names.rs`/`train_scorer.rs` from
Phase 27 remain as documented tools.)

---

## 13. Phase 31 — subsyllabic generator: tried, LLM-verified worse, removed (no merge)

*The goal was to raise the **intrinsic quality of generated** big-tech names (not pick/filter
better). Hypothesis: the awkward names (Tennyhoot, Bombanac, Regorge) exist because the generator is
**character-level Markov** — it chains letters with no notion of a syllable — so building names from
**syllable units (onset–nucleus–coda)** sampled from real brand syllables should produce names that
are brand-shaped by construction. This is the §6/§8 "Wuggy / roadmap #3" idea, scoped to plain
generation (not "name like X" templates) and big-tech only.*

**What was built** (additive, behind a quality checkpoint): `core/src/subsyllabic.rs` — a segmenter
that splits each corpus name into syllables (vowel-run nuclei, medial clusters split at the sonority
trough, reusing the `phonotactics.rs` onset/coda logic) and a `SubsyllabicModel` storing
position-conditioned onset/nucleus/coda distributions with position-only backoff, mirroring the
`markov.rs` `train`/`sample`/`log_likelihood` interface. A checkpoint harness
`core/examples/subsyllabic_ab.rs` generated 300 raw stems from each model under identical filters and
ran a **blind 1–5 LLM head-to-head** (reusing the `label_names.rs` llama.cpp plumbing).

**Checkpoint FAILED — the LLM rated subsyllabic ~0.3 *worse*:**

| model | LLM mean (1–5) | keeper% (≥4) | proxy novelty | proxy pron |
|---|---|---|---|---|
| char-markov | **2.70** | **30.7** | 79.4 | 91.1 |
| subsyllabic | 2.41 | 26.4 | **88.7** | 92.1 |

**The Phase 27 lesson, a second time:** the **proxies said subsyllabic was better** (higher novelty,
equal sonority, +1 pronounceability) — but the LLM, judging actual brand quality, said it was
**worse**. Eyeballing the stems confirmed it: subsyllabic produced longer, more novel, but more
awkward mashups (`bouglostrear`, `aptottebler`, `jighoufer`, `shovarpus`) alongside the clean ones.
Trusting the proxy table would have shipped a regression. Building from syllable units does **not**
make names more brand-shaped; the character-Markov model tuned over Phases 19–29 is genuinely better.

**Conclusion: bailed per the checkpoint gate.** `subsyllabic_w` was never added to `BigTechTuning`
and no generation branch was wired, so `generate()` stayed byte-for-byte identical (verified: 48
tests green, big-tech `metrics` unchanged at pron 90.6 / nov 95.0 / mem 74.7). The module + harness
were **removed** (clean negative result; the finding lives here). This closes "roadmap #3" as a
*quality* lever: it was the last untried path to better intrinsic generation, and it's now measured
to not help. Better big-tech *quality* from here lives entirely in the **selection** stage — the
Phase 28 LLM re-ranker — not in the generator.

---

## Bottom line

Big-tech is the strongest style, tuned through Phase 25 and extended since:

- **Quality (the judge).** The offline-distilled scorer (roadmap #1) was tried and stopped in Phase
  27 — the gap is semantic, not statistical (§9). Phase 28 then shipped the real fix as a **two-stage
  selector**: a cheap offline `brand_appeal` nudge plus an **opt-in local-LLM re-ranker** with silent
  fallback (§10). This is roadmap #2 (online AI mode) realized in the form that fits a local-first
  user — the smarter judge, with no cost to anyone who doesn't run a local model. Phase 31 then closed
  the *generation* side of quality: a subsyllabic generator was LLM-verified **worse** and removed
  (§13), so better quality lives in selection (the re-ranker), not the generator.
- **Variety & repeats.** Phase 29 widened the generative space (suffixes 11→24, more blending) and
  flattened the attractor tail (§11). Phase 30 established that the real distinct vocabulary is
  **33k+** (not the ~5k once believed), that fresh-per-call seeding is already correct and is *not*
  what controls repeats, and widened the exclude-recent horizon to 2,000 — the actual lever (§12).
- **Remaining options.** **#6 deployment** (Netlify; the Phase 28/29/30 changes need a redeploy with
  a fresh WASM build — the AI-rank toggle silently no-ops for public users without a local LLM, by
  design) — now the single highest-value next step. The generation-core rewrite (roadmap #3) is
  **closed as a quality lever** (§13); it would only return as a *capability* play ("name like X"
  templates, language flavors), not for better English big-tech quality. #3 (phonotactic metric) is a
  minor refinement.

See `README.md` for the research bibliography and `~/.claude/plans/` for the full build history.
