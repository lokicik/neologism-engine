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

## Phase 33 — Generation Distinction (fuzzy exclusion + structural caps)

**Motivation.** Two gaps survived Phase 30's exact-exclude+window fix:

1. **Cross-batch near-duplicates.** `exclude.contains()` blocks exact repeats only.
   Edit-1 variants (Keyston / Keystona / Keystonn) and shared-stem siblings
   (Keyston / Keystonify — same stem after stripping `-ify`) still appear across
   batches even with the 2 000-name window.
2. **Within-batch structural sameness.** MMR's plain edit-distance similarity is
   too weak (weight 0.15 at `mmr_lambda=0.85`) to prevent 3–4 names ending in
   the same tech suffix (e.g. four `-ify` names at `count=10`).

**What was built (Phase 31 lesson applied: selection-level levers, not generator rewrites):**

- `core/src/exclude.rs` — `ExcludeSet` replaces the plain `HashSet<String>`.
  Adds two rejection layers: **stem exclusion** (strip recognized tech suffix via
  `blend::tech_suffix_of`, then compare stems — O(1)) and **edit-1 exclusion**
  (scan length-bucketed exclude list, ~3 buckets × ~220 entries × O(12) char
  walk; < 1ms WASM budget, runs last after all cheaper filters).
- `core/src/blend.rs` — `pub fn tech_suffix_of(lower: &str) → Option<&'static str>`;
  longest-match over the 24 TECH_SUFFIXES, requiring ≥4-char stem remainder.
- `BigTechTuning` — three new knobs (constants across the variety axis):
  `fuzzy_exclude: bool = true`, `stem_exclude: bool = true`, `max_share: f64 = 0.2`.
- `core/src/metrics.rs` — `pub fn mmr_select_capped(…, cap: usize)`: copy of the
  `mmr_select` greedy loop plus `suffix_counts` / `prefix_counts` maps; skips
  candidates when the cap is full for their suffix/prefix group, with a fallback
  to uncapped selection when all candidates are capped (full count beats a perfect
  cap). **`mmr_select` itself is untouched** — Sci-Fi/Fantasy still call it at
  fixed `lambda=0.7`, so their output is byte-for-byte identical (verified below).
- `core/examples/repeats.rs` updated: now reports near-dup rate, suffix/prefix
  concentration (avg/peak), short batches, and runs four configs in one pass.

**Before/after table (300 batches × 10 names, variety=0.3, window=2000):**

| Config | distinct | worst recurrence | near-dup rate | suffix max (avg/peak) | short batches |
|--------|----------|-----------------|--------------|----------------------|---------------|
| pre-33 (exact only) | 2884 | 2/300 (0.7%) | **24.5%** | 1.37 / 4 | 0/300 |
| Phase 33 — fuzzy+stem only | 2940 | 2/300 (0.7%) | **5.8%** | 1.30 / 3 | 0/300 |
| Phase 33 — caps only | 2885 | 2/300 (0.7%) | 24.6% | 1.34 / **2** | 0/300 |
| Phase 33 — full defaults | 2939 | 2/300 (0.7%) | **5.8%** | 1.25 / **2** | 0/300 |

Near-dup rate drops from **24.5% → 5.8%** (4.2× reduction) via fuzzy+stem exclusion.
Per-batch suffix peak drops from **4 → 2** via structural caps.
Both improvements are additive; full defaults combines both.
Starvation check: **0 short batches** across all configs at window=2000.

**Sci-Fi/Fantasy frozen verification:** `cargo run --example sample` and
`--example metrics` output byte-identical to pre-Phase-33 baseline (seeded runs).
`generate_markov` is not touched; `mmr_select` (used by sci-fi/fantasy) is not
modified; only `generate_bigtech` now calls `mmr_select_capped`.

**68 tests green** (20 new: `exclude.rs` truth tables for `within_edit1`, `stem_of`,
`ExcludeSet`; `metrics.rs` tests for `mmr_select_capped` including suffix-cap
enforcement, all-same-suffix fallback, and `cap=usize::MAX` regression guard;
`blend.rs` tests for `tech_suffix_of`).

---

## Phase 34 — Faster Repeated Generation + Wider Root Space

**Motivation.** Three asks: better quality, more unique generation, and faster repeated
generation with different seeds (every Generate click is a fresh `generate()` call). Profiling
showed each big-tech call redid all seed-independent setup: parsing 19,404 common words and
5,075 brands, retraining the order-3 backoff model (4 count tables), and re-scoring the whole
corpus for the quality-gate floor. The rank sort also recomputed `log_likelihood` +
`brand_appeal` per comparison (~10× redundant), and the brand-mimic filter scanned all 5,075
brands per surviving candidate with an allocating full-DP Levenshtein.

**What was built (34a — speed, zero output change):**

- `BigtechStatic` in a `OnceLock` (lib.rs): corpora, trained backoff model, corpus/common-word
  sets, by-length brand index, gate-floor mean/std (floor still `mean − gate_sigma·std`, so
  `gate_sigma` stays a live knob). Dictionary cached in a second `OnceLock` shared by all styles.
- Decorate-sort-undecorate for the rank sort: rank computed once per pool item.
- `mimics_real_brand_indexed`: probes 5 length buckets (both mimic cases only involve brands
  within ±2 chars) with `score::levenshtein_le2`, an allocation-free two-stack-row bounded
  check. The full-scan form is kept as the reference implementation; an equivalence test pins
  them together. `within_edit1` (Phase 33) rewritten allocation-free.

**Bench (`core/examples/bench.rs`, 200 calls × 10 names, window=2000, release):**

| | before | after |
|---|---|---|
| per call (avg) | 144.9 ms | **15.9 ms** (9.1×) |
| p95 | 187.0 ms | 21.1 ms |

Output **byte-identical for all three styles** (seeded `sample`/`metrics` diff clean) — the
cache holds only deterministic, seed-independent values.

**What was built (34b — root space):** `roots.txt` 366 → **707** and `adjectives.txt`
135 → **272** (dupe "zenith" removed). New entries follow the existing register (short,
concrete, evocative; new semantic fields: metals/minerals, weather, birds/animals, music,
tools/craft, textiles, architecture, physics/space, Greek/Latin combining forms). All
candidates filtered programmatically: 75 dropped as exact `bigtech.txt` brand matches
(chrome, atlas, kraken, kernel…), plus dupes/charset. Blend space grows ~3.7×
(366² → 707² ordered pairs).

**Quality verification** (`core/examples/qual.rs`, 300 batches × 10 — the single-batch
`metrics` example is too noisy to judge a corpus change): pron 91.1 → 91.0, nov 93.1 → 93.5,
mem 71.1 → 71.5, len 7.42 → 7.37. Neutral-to-slightly-positive. 300-batch repeats at final
config: distinct 2947 (was 2939), near-dup **4.7%** (was 5.8%), suffix/prefix peak 2,
0 short batches. 30k sweep: distinct 75.9% (was 76.1%, noise), near-dup 48.6% (was 48.3%).

**Negative results (pool widening — tried, measured, reverted):** with setup cached,
overgeneration was nearly free, so target ×5 → ×8 and pre-MMR truncate ×2 → ×3 were tried.
×8 *lowered* 30k distinct 76.1% → 71.5% — a deeper pool makes the rank stage converge on the
same top attractors every batch (selection pressure ↑, batch-to-batch variety ↓). The ×3
truncate alone bought +0.5pp distinct but cost 1.9 memorability points and visibly weaker
names. Both reverted; ×5/×2 stands. Same lesson as Phase 31: more raw material ≠ better
output — the selection slice was already tuned.

**Sci-Fi/Fantasy frozen verification:** seeded `sample`/`metrics` lines byte-identical
through both 34a and 34b (`generate_markov` untouched; corpora untouched; shared dictionary
cache holds identical contents).

**70 tests green** (2 new: `mimics_indexed_matches_scan`, `levenshtein_le2_matches_full`).

---

## Phase 35 — Session-Scale Distinctness (100% distinct at 100k)

**Motivation.** A 100k sweep after Phase 34 yielded 57.3% distinct. The limiter was
structural: the 2,000-name exclude window legally re-admits any name after ~200 batches, and
the top attractors recurred exactly at that floor (Keyston 43× ≈ once per 233 batches).

**What was built.** Exclusion layers now have **separate scopes**
(`ExcludeSet::new(names, fuzzy_window)`, lib.rs knob `fuzzy_window = 2000`):
**exact**-match covers the *entire* exclude list, while the fuzzy (edit-1) and stem layers
only cover the most recent `fuzzy_window` entries. They must not scale together — there are
only ~700 single-root stems and edit-1 balls carpet the 4–12-char space, so session-scale
fuzzy/stem exclusion would starve generation; exact exclusion blocks single points and is
starvation-safe at any scale. `fuzzy_window ≥ list len` reproduces pre-35 behavior exactly
(regression-guard test), so behavior with exclude lists ≤ 2,000 is unchanged.
Web: `RECENT_WINDOW` 2000 → **20000** (~200 KB through the JSON boundary, negligible).

**100k sweep (10,000 batches × 10, variety 0.3):**

| | pre-33 | Phase 34 (win 2000) | Phase 35 (full session) |
|---|---|---|---|
| distinct | 49,714 (49.7%) | 57,275 (57.3%) | **100,000 (100.0%)** |
| worst recurrence | 47 | 43 | **1** |
| short batches | 0 | 0 | **0** |
| suffix conc. (avg/peak) | 1.35 / 4 | 1.25 / 2 | 1.20 / 2 |
| quality avg (pron/nov/mem) | 90.9 / 92.5 / 70.2 | 90.9 / 92.1 / 69.7 | 90.5 / 90.4 / 64.3 |
| drift, first→last 1000 batches | flat | flat | pron −0.5, nov −1.9, **mem −6.9** |

Full-session exact exclusion makes repeats impossible and generation **never starves**
(0/10,000 short batches) — the open question was quality, and the drift column is the honest
answer: pron holds, but memorability decays as the finite short-name space exhausts (the
engine is forced into longer names by batch ~8,000). This is the real capacity boundary, and
it's far beyond any real session.

**Shipped web config (window 20,000), measured at 2,500 batches / 25k names:**
distinct 24,381 (**97.5%**), worst recurrence 2, 0 short batches, quality drift
pron 90.9→90.8, nov 91.8→91.4, mem 69.5→67.3 — for a session ~10× longer than heavy real
usage, repeats effectively vanish and quality stays within ~2 points.

Bench at the 20k steady-state window: **18.1 ms/call** (vs 15.9 at 2k) — the larger exact
set costs ~2 ms. Sci-Fi/Fantasy untouched (`generate_markov` has its own exact-only set);
seeded sample/metrics byte-identical. **72 tests green** (2 new scoping tests).

---

## Phase 36 — Startup/Project Name Generator (product focus)

**Motivation.** The product vision is a genuinely good startup/project name generator.
Competitor research (Namelix, Nametastic, Atom/Squadhelp, Looka) showed our edges — instant/
free/offline WASM, measured quality, never-repeat sessions (Ph35), adaptive favorites
re-ranking — and four gaps, shipped as four checkpointed commits:

**36a — Availability suite** (web only). Domain checks upgraded from a DNS guess to
**authoritative registry RDAP** where the registry serves it with CORS: .com/.net (Verisign),
.ai (Identity Digital), .app/.dev (Google) — 404 = available, 200 = registered (endpoints
from the IANA bootstrap, each verified). .io/.co keep the Cloudflare DoH indicator, marked
`~` in the UI. New dev-handle row: **GitHub + npm + PyPI + crates.io** (all CORS-friendly
404-semantics APIs, cached, on-demand) — the checks that matter for *project* names; no
competitor has them. Per-name **USPTO/EUIPO trademark search links** (link-outs — a real
trademark check is a human job).

**36b — Naming modes** (core). Big-tech reuses the previously unused `Config.variant`:
- `respell` — Lyft/Tumblr-style ONE-transform respellings of curated real words (vowel drop,
  i→y, -er→-r, double-consonant collapse; never touches the first syllable, never creates
  "-ass" endings). Phonotactics relaxed to clustered max-run 4, no sonority — tumblr ends in
  a 4-consonant run by design. Sample: Thryve, Plynth, Orbyt, Sundyal, Sylicon.
- `realword` — curated evocative real words verbatim (Apple/Notion-style) from a ~1,100-word
  pool (roots + adjectives + new `realwords.txt`, 128 additions filtered against brands).
  The mode skips the real-word rejections (they exist to block exactly this) but keeps the
  brand-mimic guard. Sample: Bazaar, Thicket, Kinetic, Granite, Lagoon.
Both route through the existing candidate loop — exclusion, brand-mimic, constraints,
ranking, capped-MMR all apply (Ph31/34 lesson: the selection pipeline IS the quality).
Unknown variants fall through byte-identically (regression test). `examples/modes.rs`:
respell pron 89.7 / mem 80.9, realword pron 91.3 / mem 82.1 over 100 batches, 0 short.

**36c — Startup-first UI.** Hero row = Brandable / Real words / Respelled / Compound;
Sci-Fi/Fantasy demoted to a collapsible "Creative styles" section (engine untouched). Copy,
title and meta repositioned around startup/project naming + availability checks.

**36d — Explainability.** Core `explain(name) → Explanation` (suffix + stem, real-word
proper prefix, whole-word flag, syllables, connotations, scores) — computed on demand, zero
generation-path changes; wasm `explain_name()`; card renders a one-line rationale behind
"Why this name?" (e.g. *opens with "forge" (real word) · "forge" + brandable "-ify" ·
2 syllables · easy to say*).

**Frozen verification:** seeded `sample`/`metrics` byte-identical for all styles and the
default big-tech path at every checkpoint. **79 tests green** (9 new). WASM rebuilt;
production `npm run build` clean.

---

## Phase 44 — Description-Mode Starvation Fix (+ Playwright self-verification)

**Bug.** With a description prompt, generation died after ~2–3 batches — Generate/More-names
silently produced nothing. Cause: the `has_roots` path blends ONLY the extracted keywords
(~6–12 stems × ~26 suffix transforms), and Phase 33's **stem exclusion** blacklists every name
sharing a stem with the (20k, localStorage-persisted) exclude window — one batch can wipe out
every stem the description can produce, starving the candidate loop.

**Fix.** Fuzzy/stem exclusion now applies only to the open-ended default mix: with user
roots/description or the small curated realword pool, only **exact** exclusion applies
(`generate_bigtech`, Phase 44 comment). Default path byte-identical (seeded sample/metrics
diff). Web: a zero-name batch now shows an honest exhaustion notice with a
"Clear seen names & regenerate" action instead of a dead button. 2 regression tests
(`description_mode_survives_exclusion`, `realword_mode_survives_exclusion`); **81 green**.

**Playwright harness** (`web/e2e/repro.mjs`, chromium): drives the built app headlessly —
before the fix it reproduced the report (batch 3 → +3, batch 4 → +0, dead button); after,
8 More-names clicks yield 76 names and end in the exhaustion notice. Screenshots to
`web/e2e/shots/` (gitignored) for visual review; harness committed for future bug-hunting
and design passes.

---

## Phase 48 — Prompting Logic Fixed (keywords → recognizable, diverse names)

**Bugs (all verified by driving the built app through a 9-prompt Playwright battery).**
(1) Single-keyword prompts ("fitness", "AI tool for lawyers") generated **zero names** with a
false "you've seen every name" notice — `blend_roots` needs ≥2 roots and was the only
candidate arm under `has_roots`. (2) One stem family walled whole batches (10×"Markge…" for
"a marketplace for vintage keyboards") — the `has_roots` exit skipped the MMR/share-cap pass
and zeroed appeal/fluency ranking. (3) Blends were unrecognizable and unstemmed
("journaling"/"keyboards" fed raw), and the mood+journaling seam produced **"mong"** (UK
slur). (4) Respelled/Compound modes silently ignored the prompt. (5) Stats tips referenced
Variety/Randomness sliders removed in Phase 41.

**Core.** `keywords.rs`: light pinned-by-test stemmer (-ing with undoubling, -ies→y,
sibilant -es, plain -s) + short-token allowlist (ai/ml/ar/vr) + post-stem dedupe.
`has_roots` candidate mix: blend-two-roots (45%) / root + tech transform (30%, works with
one keyword) / root × corpus-root blend (25%) — fixes starvation AND multiplies the
reachable space (the Phase 44 repro prompt now passes 90+ names without exhausting, was 76).
`has_roots` now exits through `mmr_select_capped` with appeal+fluency ranking; brevity stays
off (keyword fidelity). `mmr_select_capped` relaxes a saturated cap **one step at a time**
instead of falling back to everything, so overflow spreads evenly across the few prefix
families a prompt can reach (4/3/3, not 6/2/2). Compound noun-halves draw from keyword stems
(70%); respell tries keyword stems first and pulls keyword-derived respellings to the front
of the batch. Real-words stays prompt-independent **by design** (curated pool; faking
relevance without semantics would be worse) — the UI says so. `BAD_SUBSTRINGS` += "mong".
Honest finding: for the journaling prompt, every keyword respelling is *correctly* rejected
by the brand-mimic guard ("journl"≈journey, "ynsight"≈insight — both in the corpus), so that
batch legitimately falls back to the pool.

**Web.** "naming around: journal · mood · insight" line above results (new wasm
`extract_keywords`); Real-words + description shows an honest note; tips rewritten in
command-bar vocabulary.

**Verification.** Default seeded `sample`/`metrics` **byte-identical** through both core
commits. **90 tests green** (9 new, incl. `single_keyword_description_generates`,
`description_batch_is_diverse`, `description_names_echo_keywords`, `no_mong_substring`,
mode-fidelity tests). New `web/e2e/prompts.mjs` (4 regressions) green; `repro.mjs` green;
battery re-run: "fitness" → Fitnit/Fitnest/Fitnessio…, journaling → Moodit/Journen/
Moodsync/Insightai…, compound → BreezeMood/PureJournal/TrimInsight.

---

## Phase 49 — Infinite Scroll (auto-generate on scroll, slide/fade entrance)

The Create page's `More names` button is gone: an `IntersectionObserver` sentinel under the
results grid (600px prefetch margin) auto-appends the next batch as the user scrolls; the
observer re-binds per append so batches chain until the sentinel leaves the prefetch zone
(also auto-fills tall viewports on first generate). Cards play a staggered slide-up/fade
(`card-in`, 45ms/card, `animation-delay` inline) — React keys are stable so existing cards
never re-animate; `prefers-reduced-motion` disables it (verified: computed opacity 1 at
150ms). Exhaustion unmounts the sentinel and the Phase 44 notice takes over. Inline shimmer
skeletons show during appends. `repro.mjs` converted from button clicks to scroll rounds
(8 rounds → 150 names, no dead ends); `explore.mjs` captures the scrolled state;
`prompts.mjs` batch checks widened to full-batch multiples. Web-only; engine untouched.

---

## Phase 61 — Two-sided local taste learning

**Bottleneck.** The Phase 59 profile learned only from favorites. It could pull future
batches toward a liked suffix or sound, but it had no way to learn that a recurring shape
was specifically unwanted.

**What shipped.** Create cards now expose a reversible **Not for me** action beside save.
Positive and negative signals are mutually exclusive, persisted locally, and summarized by
an always-visible taste status after generation. The ranker compares each new candidate with
both the liked and avoided structural profiles (length, syllables, vowel lean/endings,
sharpness, compound family, suffix, onset, and bigrams). Rejection strength ramps from one to
five passes and is bounded, so an accidental click cannot overwhelm engine quality. Existing
cards never jump; feedback affects the next generated batch.

**Verification.** The deterministic preference harness proves liked-only behavior remains
intact and that five rejected `-ora` examples reverse an otherwise-positive `-ora` ranking.
The production TypeScript/Vite build is clean. A Chromium flow verifies persistence,
like/pass mutual exclusion, accessible pressed state, the visible model summary, and reload
restoration; visual review confirms the extra action fits the existing card hierarchy.

---

## Phase 62 — Balance semantic fidelity with brand character

**Bottleneck.** Concept expansion fixed relevance, but its `0.85` extra-concept bonus
over-corrected: for this product's own brief, 9/10 Brandable slots became literal two-root
joins (`Stackforge`, `Nodecraft`, `Markseed`). Compact coinages such as `Lexora` and `Nomix`
were present in the pool but rarely surfaced.

**What changed.** The semantic-coverage weight is now an explicit tuning value and the
fixed-seed harness compares `0.85`, `0.50`, and `0.25`. Production uses **0.25**: meaning
still matters, but carrying a second visible concept no longer overwhelms phonetic quality,
brand appeal, and MMR diversity.

**A/B result.** On the app's own brief, the same seed changes from 9 literal joins + 1
coinage to a mixed first page: `Lexia`, `Markify`, `Nomora`, `Stackforge`, `Markio`,
`Nomix`, `Lexora`, `Nodecraft`, `Cratespark`, `Marknode`. Five other fixed briefs retained
their semantic roots; suffix coinages rose only where the offline scorer considered them
competitive. A regression test requires at least four compact coinages and two semantic
joins, pinning the intended mix without pinning exact output strings.

**Verification.** **98 core tests green**, fixed-seed six-brief A/B harness clean, WASM
rebuilt, TypeScript/Vite production build clean, and the Chromium prompt-regression battery
passes (single-keyword generation, prefix diversity, keyword explanation, mode honesty).

---

## Phase 63 — Adapt Auto when no brief is given

**Bottleneck.** Auto always reserved 70% of its page for Brandable generation. That works
when a project description or roots give the generator meaning, but the same mix produced
too many fluent-looking yet opaque coinages on an empty prompt.

**Rejected experiment.** Four fixed seeds compared production Markov/blend weights with a
lower-Markov mix and no Markov path. The alternatives occasionally improved an individual
name, but aggregate pronounceability and memorability fell, near-duplicate pressure rose,
and no-Markov samples introduced new malformed shapes. The core weights were therefore
left unchanged; `generic_compare` preserves the audit instead of turning a mixed result into
a production change.

**What changed.** Auto is now brief-aware. A description or root keeps the proven
**70/10/10/10** Brandable/Realword/Respell/Compound mix. With no semantic input it uses
**50/30/10/10**, replacing two opaque coinage slots with names from the curated real-word
pool. Explicit modes are untouched, and batches smaller than four remain entirely
Brandable.

**Verification.** The deterministic Auto harness checks both schedules, exact requested
size, ordering, accent coverage, and case-insensitive deduplication. **98 core tests green**,
WASM rebuilt, TypeScript/Vite production build clean, and the Chromium taste-feedback flow
passes all nine persistence, accessibility, and ranking checks.

---

## Phase 64 — Learn from passes before the first favorite

**Bottleneck.** Negative feedback was stored immediately but the local profile still
required three favorites before it existed. A user who only passed on weak names saw an
active-looking control with no effect on later batches.

**What changed.** Three passes can now create an avoided-shape profile
without any favorites. Two passes remain inert to avoid overfitting; once a three-favorite
positive profile exists, even one pass is retained as a weak contrast signal, preserving the
existing evidence ramp. Negative-only similarity is bounded with `tanh`, and engine quality
remains in the ranking, so the model steers away from a pattern instead of hard-blacklisting
it. The status chip now explains that either three likes or three passes can teach local
taste.

**Verification.** The deterministic preference harness proves two passes stay inactive,
three `-ora` passes activate a zero-like profile, and `Vexium` then outranks the matching
`Vexora` shape. Existing liked-only, compound-family, and positive/negative contrast cases
remain green. TypeScript/Vite production build clean; Chromium verifies all eleven storage,
mutual-exclusion, accessibility, reload, and pass-only activation checks. Visual review at
1440px confirms the zero-like status fits the existing stats row.

---

## Phase 65 — Learn which naming modes the user prefers

**Bottleneck.** The local profile learned spelling shape, length, suffixes, and compounds,
but Auto discarded the source strategy after merging its four sub-batches. A user could
consistently like Real words or reject Respelled names and the ranker still treated those
families as indistinguishable Brandable strings.

**Rejected alternatives.** A fixed-seed audit kept generic Compound in Auto because its
quality was mixed rather than uniformly weak (`PureSync`, `UrbanEdge`, `CopperMoor`, and
`ProudPulse` were viable). Applying the prompt-only typo penalty globally changed none of
four audited first pages and moved the 300-batch proxies by only +0.03 novelty/+0.01
memorability. Replacing proxy relevance with the stronger internal rank removed some weak
names but collapsed novelty **93.50 → 81.92**; a 35% rank blend still fell to **90.25**
and introduced new misses. All three production experiments were reverted.

**What changed.** The web engine now tags each Big-tech result with its actual source mode:
Brandable, Realword, Respell, or Compound. The optional tag travels with existing local
favorite/pass records. The shape profile learns a bounded mode affinity alongside suffix,
onset, bigram, and structural signals, so otherwise-equal candidates from consistently liked
modes move up and candidates from consistently passed modes move down. Mode affinity activates
only when at least 75% of a feedback profile shares one source, preventing Auto's naturally
Brandable-heavy exposure from masquerading as preference. Old records require no migration:
CamelCase still identifies Compound and everything else remains neutral `unknown`.

**Verification.** Fourteen deterministic preference checks cover liked, rejected, and mixed
mode ties plus all prior shape/contrast behavior. Eight Auto schedule/dedupe checks remain green.
TypeScript/Vite production build clean; Chromium verifies twelve storage, source-tag,
mutual-exclusion, accessibility, reload, and pass-only activation checks using real WASM
output.

---

## Phase 66 — Export real pairwise taste evidence

**Bottleneck.** The next cold-start scorer needs genuine human preference evidence, but the
only durable labels were browser-local favorite/pass arrays. The earlier offline scorer had
failed on proxy LLM labels and underpowered structural features; repeating that experiment
without real labels would not move quality forward.

**What changed.** Settings now exports a versioned `neologism-taste-v1` JSON dataset. Each
explicit like/pass keeps its full engine scores and Phase 65 source mode; compact index pairs
encode every observed `liked > passed` comparison without duplicating result objects. The
file includes an export timestamp and counts, but deliberately excludes the AI key, judge
configuration, prompt, and recent-name history. One-sided feedback remains valid data and
exports with zero pair comparisons.

**UX.** The former **AI settings** entry is now the general **Settings** surface. AI provider
details use progressive disclosure and render only after `Enable AI re-rank`, so the default
modal is short and the Local taste data card is visible without scrolling. The card uses the
existing dark surface hierarchy, tabular dynamic counts, a 40px export target, exact-property
press behavior, and a stable `neologism-taste.json` filename.

**Verification.** Eight deterministic schema checks cover versioning, timestamp, counts,
pair indices, source modes, credential exclusion, and one-sided data. TypeScript/Vite
production build clean. Eighteen Chromium checks exercise real WASM feedback, Settings
collapse/reveal behavior, summary counts, the browser download event, parsed JSON schema and
pairs, source preservation, persistence, and accessibility. Visual review at 1440px confirms
the default modal fits without scrolling and the export card matches the established theme.

---

## Phase 67 — Audit the current scorer against human preference pairs

**Bottleneck.** A pairwise export is only potential evidence until a repeatable tool can say
whether the current offline score agrees with it. Training another model first would repeat
the Phase 27 mistake: optimize before proving that the labels expose a useful gap.

**What changed.** `core/examples/taste_audit.rs` consumes one or more
`neologism-taste-v1` exports and validates schema, indices, and `liked > passed` direction.
It measures the existing 40/30/30 pronounceability/memorability/novelty composite on every
human pair, reports wins/ties/losses and agreement, groups labels by Phase 65 source mode,
and prints the ten worst score-vs-human disagreements. Multiple files aggregate for future
cross-user audits. A small-sample warning stays visible until there are at least ten unique
liked and ten passed examples, since cross-product pairs are not independent observations.

**Verification.** Two focused Rust tests prove one agreeing and one disagreeing pair,
source-mode counts, wrong-schema rejection, and reversed-pair rejection. The example builds
as a real CLI target; the README documents the release command and updates the verified core
suite count to 98. No production generation or ranking path changed.

---

## Phase 68 — Scope taste evidence to its project context

**Bottleneck.** The v1 exporter crossed every liked name with every passed name. That is a
valid preference only when both names answered the same naming brief; comparing a liked dev
tool name with a passed fantasy-game name would inject false supervision into the scorer we
eventually want to tune.

**What changed.** Every newly generated result now carries a stable taste context derived
from style, normalized project description, and normalized seed roots. Batch size,
randomness, output constraints, and Big Tech source mode are deliberately excluded so names
for one project remain comparable while the user explores generation controls. The
`neologism-taste-v2` exporter creates `liked > passed` pairs only when their context IDs
match. Historical records without context remain usable inside a separate legacy-unscoped
bucket, but never mix with scoped feedback. Settings reports the real same-project pair
count and tells the user that the exported data includes each name's project brief.

The Rust audit accepts both historical v1 and current v2 files. For v2 it rejects any pair
that crosses context IDs, reports the number of contexts represented, and keeps the existing
schema, direction, and score-agreement checks.

**Verification.** Twelve deterministic TypeScript checks cover v2 schema, same-context
pairing, context counts, legacy isolation, credential exclusion, and context normalization
across case, whitespace, root order, duplicate roots, and irrelevant generation controls.
Three focused Rust tests cover score agreement, direction/schema errors, and cross-context
rejection. The TypeScript/Vite production build is clean. Eighteen Chromium checks validate
real WASM feedback, reload persistence, the Settings count, downloaded v2 JSON, and preserved
source/context metadata; visual review confirms the compact Settings layout still fits at
1440px.

---

## Phase 69 — Keep brief-driven quality alive through 100 names

**Bottleneck.** A fresh prompted Brandable batch looked stronger than before, but the exact
exclusion path exposed a hidden finite-space problem. In a realistic ten-batch session, the
six multi-concept benchmark briefs returned only 43–88 of the requested 100 unique names;
the app's own developer-naming brief stopped at 75. Repeated suffixes and deterministic
concept joins were being exhausted, so infinite scroll eventually claimed the prompt had no
names left.

**Rejected experiments.** Prefix-conditioned Markov completion produced fragments such as
`Lexpedra`, `Nymetamanl`, and `Nodecrafis`, so it was removed. Feeding the existing third
generation arm from the full roots corpus restored capacity but admitted mangled or arbitrary
forms such as `Bytip`, `Klecore`, and `Minteddy`; that version was also removed.

**What changed.** The strongest semantic join/suffix mix remains untouched for the first two
multi-concept Brandable batches and the first single-concept batch. Once the rolling exclusion
history proves that the user is continuing the same brief, a 15% exploration lane opens for
multi-concept briefs. Single-concept prompts use that lane more heavily after their compact
suffix batch because they start with only five semantic roots. The lane preserves one prompt
root intact and joins it only with a small curated set of readable metaphors (`flow`, `spark`,
`nest`, `smith`, `glow`, and related roots). Generic generation, explicit seed-word generation,
the first prompted batch, and every non-Brandable mode retain their previous paths.

`concept_compare` is now a rolling-session harness rather than a one-page sample only. It
measures returned count, composite score, intra-batch diversity, uniqueness, two-concept
coverage, prefix-family overflow, and short batches across seven briefs. All seven now return
100/100 unique, context-linked names with zero short batches. For the six multi-concept briefs,
session diversity moved from 0.346–0.629 to 0.744–0.798. Full-session composite averages are
0.6–2.3 points lower because the denominator now includes later candidates that did not exist
before; the initial high-quality batch is unchanged.

**Verification.** Two new Rust regressions simulate ten rolling batches for the app's own
brief and for a single-word `fitness` brief, requiring 100 unique results and visible concept
coverage. A boundary regression also keeps both halves of curated metaphor joins readable
(`ForgeAtlas`, not `Forgetlas`). The full core suite is 101/101. Native release benchmarking
with a 20,000-name history measured a 42.5 ms cold prompted call and 10.5 ms subsequent
average. WASM and the production web bundle build cleanly. A Chromium regression drives
actual infinite scroll to 100 cards and verifies uniqueness, no false exhaustion, persisted
recent-history coverage, and the visible keyword trace.

---

## Phase 70 — Make Auto accents earn their place

**Bottleneck.** Auto treated mode representation as a quota rather than a quality decision.
Across six representative briefs and five fixed seeds, the 30 first pages contained 105
non-Brandable cards, but only 37 were visibly tied to their prompt. Real-word is explicitly
prompt-independent, while small Respell and Compound calls often surfaced unrelated names such
as `Bobbyn`, `GladAwl`, `FineClink`, and `VitalWatt`. A separate count-contract bug made the
problem worse: when a prompted Respell already filled `count=1`, the zero-count MMR remainder
still seeded one extra result.

**Rejected alternatives.** Keeping the fixed 70/10/10/10 mix preserves mode exposure at the
expense of the product's actual job. Globally sorting all four modes by the existing composite
is worse: structurally fluent but irrelevant `Bobbyn` and `GladAwl` scored 95 and 94, above many
useful semantic names. The offline score does not contain prompt meaning, so it cannot be used
as a cross-mode relevance judge.

**What changed.** Both MMR selectors now return an empty result for `count=0`, restoring the
generator's exact count contract. Prompt-derived Respell options are attempted before the
generic curated pool, with stable ordering before seeded sampling. Guided Auto now asks
Brandable for a full fallback page and admits at most one Respell only when it is exactly one
edit from an extracted brief term or supplied root. Prompt-independent Real-word and
semantically uneven Compound remain available as explicit modes, but they are no longer forced
into a guided first page. Empty-brief Auto retains its 50/30/10/10 exploratory mix.

**Measured result.** After the change, the same 30-page audit returns ten names on every page
and 15/15 non-Brandable accents are prompt-linked; briefs without a viable Respell simply get
ten Brandable names. The previous run had 68 unrelated accents among 300 first-page cards.
The audit is now a browser regression rather than a one-off printout.

**Verification.** The core suite is 103/103, including zero-count MMR and single prompted
Respell regressions. The deterministic Auto harness covers the 9/0/1/0 guided policy, exact
one-edit gate, unchanged empty-brief mix, scheduling, and deduplication. WASM and the production
web bundle build cleanly; Chromium verifies the 30-page quality audit plus the existing
long-session and local-taste flows.

---

## Phase 71 — Keep both concepts readable at the seam

**Bottleneck.** The Phase 70 page audit exposed a smaller Brandable failure class after the
unrelated modes were removed. `semantic_join` deleted one character whenever two roots met on
the same letter or on two vowels. That turned `Aura` + `Ink` into `Aurank`, `Pool` + `Link` into
`Poolink`, and `Pool` + `Ledger` into `Pooledger`. The structural score still rated those names
88, 93, and 86 because it cannot know that a semantic root disappeared.

**A/B.** Rejecting every one-letter collision removed the bad names but reduced two-concept
coverage by as much as six points. Preserving every character recovered that coverage and
produced readable `Poollink`/`Poolledger`, but also admitted the equally awkward `Auraink`.
The retained hybrid preserves duplicate consonants, lets the normal phonotactic filter reject
dense clusters, and asks for another pair when two vowels collide. Genuine overlaps of two or
more letters remain compact, so existing forms such as `Settledger` keep their prior path.

**Measured result.** The six multi-concept 100-name sessions still return 600/600 unique,
prompt-linked candidates with no short batch. Their mean composite is effectively unchanged
(79.03 → 79.07); mean diversity moves only 0.771 → 0.769. Average two-concept coverage trades
1.7 percentage points for roots that remain visibly intact. The 30-page Auto audit now fails
on the known lossy seam class and reports zero occurrences.

**Verification.** The full core suite remains 103/103. WASM and the production web bundle
build cleanly. Chromium passes the 30-page Auto quality gate, reaches 100 unique cards without
false exhaustion, and preserves the single-keyword, marketplace-prefix, keyword-trace, and
explicit Real-word hint regressions.

---

## Phase 72 — Make Compound earn its explicit mode

**Bottleneck.** Phase 70 correctly removed Compound from guided Auto because its noun half
used a description keyword only 70% of the time and its adjective came from a 272-word general
corpus. Across six briefs and five fixed seeds, only 148/300 Compound names (**49.3%**) had a
prompt-linked noun. The same generic attractors recurred across unrelated projects: `PoshParse`,
`SolarLope`, and `AgileFlock` appeared beside names such as `BlitheTeam` and `PureVintage`.

**A/B.** Requiring semantic nouns immediately reached 300/300 relevance, but the first compact
palettes exhausted at only 34 security names, 47 expense names, and 41 analytics names in a
100-name request. That version was not retained. Reducing the candidate pool below 2x improved
cross-seed novelty but cost roughly two composite points; the retained 2x pool keeps enough
selection headroom. The final palettes expand only within matching product concepts rather than
reopening the whimsical global adjective corpus.

**What changed.** Compound now orders brief concepts by naming role and draws from transparent,
domain-aware adjective palettes (`Quiet/Lucid` for journals, `Safe/Sealed` for security,
`Fair/Equal` for shared expenses, `Swift/Exact` for analytics). Its noun half comes from the
existing semantic root lexicon. Audience and claim terms such as `team`, `friend`, `fast`, and
`performance` no longer displace the product noun when a stronger concept exists; narrower
guards keep API analytics on `Signal/Lens/Trace` and expense splitting away from generic
`Mint/Vault`. Tautological prefix pairs such as `SharedShare` and `SettledSettle` are rejected.
Promptless Compound retains its former exploratory corpus behavior.

**Measured result.** The same 30 first pages now return **300/300 prompt-linked nouns**. Mean
composite moves 76.28 → 76.57 and mean intra-batch diversity 0.763 → 0.780. Cross-seed first-page
distinctness trades 94.7% → 82.7% because the vocabulary is intentionally narrower, while all
six one-shot long audits return 100/100 names and the real rolling browser session reaches 100
unique cards. Representative results include `PrimeLex`, `QuietInk`, `CoreLock`, `FairTally`,
`RetroBoard`, and `KeenLens` instead of unrelated corpus pairings.

**Verification.** The core suite is **108/108**, including all-name semantic-noun, single-root,
and 100-name Compound regressions; the unchanged Brandable `concept_compare` remains clean.
WASM and the TypeScript/Vite production bundle build successfully. Chromium passes the
30-page Auto gate,
the existing 100-name Brandable session, all prompt/mode regressions, and a new explicit
Compound session requiring 100 unique security-linked cards with no false exhaustion.

---

## Phase 73 — Keep focused Compound briefs alive through 100 names

**Bottleneck.** Phase 72 proved 100-name capacity for six multi-concept briefs, but its compact
domain palettes were still finite when a brief mapped to one semantic concept. The expanded
audit kept every first-page noun relevant yet stopped at 22/100 names for `fitness`, 30 for
travel, 18 for education, 25 for AI automation, and 30 for music. Fixed-seed first-page
distinctness was only 20–38% for those prompts because the same small adjective×noun grid was
being ranked repeatedly.

**Rejected A/B.** Appending the neutral palette on every request raised all known prompts to
100 and improved proxy metrics, but it also displaced focused first-page names with generic
forms such as `KeyNom`, `CalmNym`, and `NovelShare`. That version was removed. Reopening the
original 272-word adjective corpus for unknown domains was also rejected: returning
`JollyResearch`-style filler would satisfy a count while lowering the product's actual quality.

**What changed.** A fresh ten-name Compound request still uses only its ordered domain palette,
so Phase 72 first pages remain byte-for-byte unchanged. A request larger than ten, or a real
`Load more` call carrying an exclusion history, extends that palette to at most 30 restrained
general adjectives. Domain adjectives stay first, noun roots remain semantic, and the broad
promptless corpus remains isolated. Unknown concepts keep the honest finite fallback rather
than receiving arbitrary filler.

**Measured result.** The five newly audited known-concept briefs move from **125/500** available
long-request names to **500/500**, while all 250 fixed-seed first-page names and their scores are
unchanged. The original six Phase 72 briefs remain 600/600 in long requests. `legal research`,
which has no offline concept mapping, deliberately remains 40/100 under the 12-character limit.

**Verification.** The core suite is **110/110**. New regressions pin focused-palette ordering
and simulate ten rolling `fitness` batches with exact exclusion, requiring 100 fresh semantic
Compound names. The twelve-brief release harness remains 600/600 prompt-linked on first pages.
WASM and the production web bundle build cleanly. Chromium now drives both a security brief and
single-concept `fitness` through 100 unique Compound cards, with no unrelated noun, repeat, or
false exhaustion.

---

## Bottom line

Big-tech Auto remains the product's strongest path. A guided first page is now semantic
Brandable by default and only admits a Respell accent that visibly comes from the brief; the
broader modes remain explicit choices and still form the exploratory mix when no brief exists.
Compound is now a genuinely brief-aware explicit alternative rather than a random adjective
showcase. Focused first pages stay narrow; recognized concepts open a restrained continuation
palette only when the user asks for more, preserving 100-name session capacity without generic
first-page dilution.
Long prompted sessions no longer collapse into repeated suffix families or stop before 100
names, and semantic joins no longer erase a concept at one-letter/vowel boundaries. Local taste
feedback can already adjust structural and mode preferences, while AI Studio remains an
optional, separate batch judge rather than a hidden dependency of Create.

The next scorer change is evidence-gated: collect at least ten real likes and ten passes in
matching project contexts, audit the current composite, and require held-out pairwise
improvement before shipping new weights. Language flavors and “name like X” templates remain
possible capability expansions, but they are not substitutes for proving better English
dev-name selection on human preference data.

See `README.md` for the research bibliography and `~/.claude/plans/` for the full build history.
