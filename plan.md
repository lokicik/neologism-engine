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

## Phase 74 — Keep both words in a Compound semantically compatible

**Bottleneck.** Phase 72 guaranteed that every Compound noun came from the brief, but it still
sampled adjectives and nouns independently. Both halves could therefore be individually relevant
yet awkward together: `BoldNom`, `TrueByte`, `SmartInk`, `AgileTone`, `DailyPool`, and
`OpenRelic`. A new role-aware audit found only **211/300 (70.3%)** compatible pairs across the
original six first-page benchmarks; dev naming was 27/50 and journaling 21/50.

**A/B.** A 3x focused candidate pool made fixed seeds converge harder and lowered batch
diversity, so it was removed. A 1.5x pool recovered 6.7 points of cross-seed distinctness but
lost 1.6 composite points without improving intra-batch diversity. The measured 2x pool remains.
The generation palette also replaces `Rapid` with `Swift`; this removes combinations such as
`RapidMint` while keeping useful forms such as `SwiftSeed` and `SwiftForge`.

**What changed.** Focused Compound generation now checks adjective ownership before accepting a
pair. Ordinary adjectives stay with the concept that supplied their noun (`PrimeLex`,
`CleanNode`, `QuietInk`, `ClearDraft`). True modifier concepts may cross groups where English
meaning supports it: mood adjectives can describe journal/insight nouns (`VividLens`), split
adjectives can describe finance nouns (`FairLedger`), vintage can describe keyboard/market nouns
(`RetroBoard`), and speed can describe analytics nouns (`SwiftSignal`). Unknown briefs and the
Phase 73 continuation palette remain permissive so the gate does not fake semantic knowledge or
break deep-session capacity.

**Measured result.** Pair coherence moves **211/300 → 300/300** on the original benchmarks and
**511/600 → 600/600** across all twelve audited first-page briefs. Mean structural composite
trades 76.57 → 75.87, mean diversity 0.780 → 0.765, and fixed-seed distinctness 82.7% → 74.3%.
This is deliberate: the old structural score cannot see semantic mismatch and previously rated
unrelated names very highly. Representative first pages now favor `PrimeLex`, `SwiftKit`,
`QuietInk`, `FairLedger`, `RetroBoard`, and `KeenLens`; all eleven known-concept long audits still
return 100/100 names.

**Verification.** The core suite is **111/111**, with direct role-pair tests and a production
regression requiring every focused journaling result to carry both a semantic noun and a coherent
adjective. The Brandable `concept_compare` remains unchanged. WASM and the production bundle
build cleanly; Chromium preserves both 100-card Compound sessions and all 30 guided Auto pages.

---

## Phase 75 — Make the offline engine understand developer domains

**Bottleneck.** Developer naming is the product's positioning advantage, but the semantic map
still understood mostly generic artifacts such as `API`, `CLI`, and `library`. An eight-brief
held-out audit exposed the gap across database migrations, rate limiting, terminal logs, Git
releases, caches, browser bookmarks, testing, and cloud deployment. The baseline returned only
690 of 800 requested names, and just **165/690 (23.9%)** carried a domain marker. Database
Brandable returned 0/0; rate limiting and testing were 0/50 in both modes.

**A/B.** Adding the compact domain lexicon alone moved the audit to **663/800 (82.9%)**, but
generic artifact roots still displaced the stronger nouns in Compound (`crate`, `stack`, and
`kit` competing with `schema`, `quota`, and `spec`). When a recognized specialized developer
domain is present, Compound now suppresses those generic artifact nouns. This raised the native
audit to **768/800 (96.0%)** without broadening unknown prompts or changing the candidate pool.

**What changed.** The offline semantic layer now maps ten developer concept families to compact
brand roots and their own adjective palettes: databases/migrations, rate limiting, terminals,
logs/observability, Git/releases, caches, browser/bookmarks, testing/debugging, and cloud
deployment. Artifact words such as `viewer`, `inspector`, and `toolkit` remain useful brief
context but no longer become weak literal stems. Representative results include `Relayra`,
`DirectPort`, `Guardio`, `FairMeter`, `Promptora`, `NativeShell`, `Branchify`, `OpenForge`,
`Heapify`, `LocalCache`, `Checkora`, `SureSpec`, `Cloudify`, and `ReadyStack`.

**Measured result.** The production Chromium/WASM gate audits 800 names over 80 deterministic
pages. Every page returns all ten names; Brandable is **378/400 (94.5%)** domain-linked and
Compound is **388/400 (97.0%)**, or **95.8% overall**. This marker test measures semantic
attachment, not subjective beauty: forms such as `Bridgea` and `Tagent` show that morphology is
the next independent quality boundary rather than evidence that the domain map is complete.

**Verification.** The core suite is **114/114** with direct root, modifier, and specialized-noun
regressions. The previous Brandable and twelve-brief Compound harnesses remain unchanged at their
Phase 74 checkpoints. WASM and the production web bundle build cleanly; Chromium passes the new
developer-domain gate, all 30 guided Auto pages, and both 100-card Compound sessions.

---

## Phase 76 — Stop concept suffixes from erasing the root

**Bottleneck.** Semantic coverage exposed a separate morphology defect. When a concept root ended
in a vowel, `concept_transform` removed the first vowel of its suffix. That turned `bridge + ia`
into `Bridgea`, `cache + ix` into `Cachex`, `forge + ora` into `Forgera`, and `page + io` into
`Pageo`. Across fourteen established and held-out briefs, five seeds each, a new 700-name audit
found **77/700 (11.0%)** of these mechanically collapsed suffixes.

**Rejected alternatives.** Removing the root's final vowel instead eliminated the collapsed
forms and raised the structural composite, but developer-domain coverage fell **96.0% → 86.6%**:
`quota + ify` became `Quotify` and `store + ia` became `Storia`, changing the visible concept.
Keeping only two suffixes for vowel-ending roots did not improve the already-zero defect rate
and lowered diversity **0.717 → 0.709**, so that restriction was also removed.

**What changed.** Concept suffixing now preserves both the complete root and the complete suffix.
The same families become `Bridgeora`, `Cacheora`, `Forgeora`, `Pageora`, and `Traceora`. A direct
unit regression pins every `scope` suffix form so neither side of the vowel seam can silently
disappear again. The morphology harness derives the active semantic roots for all fourteen briefs
rather than relying on a fixed list of forbidden output strings.

**Measured result.** Collapsed suffixes move **77/700 → 0/700** while all 700 requested names
still return. Mean structural composite trades **81.96 → 81.63** and diversity holds
**0.716 → 0.717**. On the seven unchanged non-cache developer cases, Chromium Brandable semantic
coverage also moves **338/350 → 348/350** because roots remain visible. The cache audit was found
to omit its valid `buffer` root; correcting that measurement gives the current production gate
**398/400 Brandable** and **391/400 Compound** without lowering any threshold.

**Verification.** The core suite remains **114/114**; the twelve-brief Compound audit stays
600/600 prompt-linked and pair-coherent. WASM and the production bundle build cleanly. Chromium
passes the 80-page developer-domain gate, all 30 Auto pages, and both 100-card Compound sessions.

---

## Phase 77 — Reject typo-like shared overlaps between semantic roots

**Bottleneck.** The Phase 76 audit removed collapsed suffixes but exposed two remaining
two-concept joins that still read like spelling mistakes. `settle + ledger` shared `le` and became
`Settledger`; `tag + agent` shared `ag` and became `Tagent`. Across the fourteen-brief fixed-seed
set they occupied **7/700 names**: two `Settledger` and five `Tagent` results. This path is separate
from the generic portmanteau blender, where a deliberate overlap such as `pin + interest` remains
useful.

**A/B.** Preserving both roots instead of merging them removed the first-page defects, but only
delayed the problem: `Tagagent` surfaced in the new 1,400-name rolling-session audit. The retained
rule asks for another root pair whenever two semantic roots have a shared overlap of two or more
letters. It does not blacklist outputs, remove generic overlap blending, or spend candidates on a
known awkward full concatenation.

**Measured result.** Shared-overlap artifacts move **7/700 → 0/700** on the fixed-seed set and
remain zero across all **1,400/1,400** rolling-session names, with no short batch. Mean structural
composite trades **81.63 → 81.54** while diversity moves **0.717 → 0.718**. The expense long
session gives up one point of two-concept coverage (**45% → 44%**) but replaces `Settledger` with
clear alternatives such as `Settlebond`; the Git brief replaces `Tagent` with `Tagmind`.
Developer-domain coverage remains **790/800**, and Compound remains **600/600** prompt-linked and
pair-coherent.

**Verification.** Direct tests pin both rejected semantic pairs while preserving the generic
`Pinterest` overlap path. The core suite is **114/114**. WASM and the production bundle build
cleanly; Chromium reports no lossy semantic overlap, keeps the developer-domain gate at
**398/400 Brandable** and **391/400 Compound**, passes all 30 Auto pages, and preserves both
100-card Compound sessions.

---

## Phase 78 — Cover the second wave of developer naming briefs

**Bottleneck.** The first developer-domain pass was strong on its eight audited areas, but that
did not prove the offline engine understood the wider work developers actually name. Eight new
held-out briefs exposed the next gap: message queues, formatters/linters, environment variables,
filesystem search, feature flags, background jobs, dependency updates, and documentation sites.
The new set returned only **720/800** requested names and just **189/720 (26.3%)** carried a
domain marker. Across all sixteen briefs, the baseline was **979/1,520 (64.4%)**.

**What changed.** Each new domain now has a compact root family and a restrained Compound
adjective palette. Specialized concepts lead generic artifacts such as `CLI`, `client`, and
`service`; those artifact words remain useful context but no longer crowd out `queue`, `lint`,
`config`, `path`, `flag`, `cron`, `dep`, or `doc`. Context disambiguation also prevents `message`
from opening social roots in a queue brief, `automation` from opening agent roots in a dependency
brief, and `generator` from displacing documentation/site roots. Representative first pages now
include `Streamora`, `DirectPipe`, `Lintify`, `StrictFormat`, `Configix`, `LocalEnv`, `Pathora`,
`QuickSeek`, `Launchify`, `SafeToggle`, `Cronix`, `ReadyJob`, `Depora`, `SafeLock`, `Guideora`,
and `LivingSite`.

**Measured result.** The new eight-brief set moves **189/720 (26.3%) → 800/800 (100%)** with
every requested name returned. The original eight cases remain **790/800**, so the expanded native
audit reaches **1,590/1,600 (99.4%)** rather than buying new coverage by weakening the old set.
The Chromium/WASM gate covers the same 160 deterministic pages: the new set is also **800/800**,
while the full sixteen-brief totals are **798/800 Brandable** and **791/800 Compound**.

**Rejected scorer change.** The morphology audit now separately counts complete suffixes after
vowel-ending roots: **63/700** fixed-seed and **40/1,400** rolling names. Penalizing that whole
family reduced the incidence, but also lowered structural composite **81.54 → 81.23** and
diversity **0.718 → 0.712**; a half-strength penalty still regressed both metrics. The production
ranking therefore stays unchanged. The measurement remains so future taste data can determine
whether forms such as `Cacheora` are actually disliked rather than treating a visible seam as a
defect by assumption.

**Verification.** The core suite is **116/116**. The seven-brief Brandable checkpoint remains
unchanged, Compound remains **600/600** prompt-linked and pair-coherent, and the morphology audit
returns **700/700** fixed-seed plus **1,400/1,400** rolling names with no collapsed or lossy-overlap
forms. WASM and the production bundle build cleanly; Chromium passes the expanded developer-domain
gate, all 30 guided Auto pages, and both 100-card Compound sessions.

---

## Phase 79 — Reject same-stem Compound echoes

**Bottleneck.** The expanded developer audit surfaced `TimedTimer`: both halves were individually
valid for a background scheduler, so the semantic role check accepted a name that visibly said
the same thing twice. Expanding the Compound harness from twelve to twenty briefs made the defect
measurable. It appeared **3/1,000** times across five fixed seeds, always as `TimedTimer`; the
other 997 names were clean.

**A/B.** A broad semantic-similarity filter would also erase intentional, brandable pairings.
The retained rule is lexical and deliberately narrow: reject pairs whose halves share at least
four leading letters and leave at most two letters on either side of that shared stem. It also
consolidates the existing exact-match and full-prefix guards. Direct counterexamples preserve
`FairHair`, `PrimePrint`, and `QuietInk`, while `TimedTimer`, `TidyTidy`, and prefix repetition
remain rejected.

**Measured result.** Fixed-seed lexical echoes move **3/1,000 → 0/1,000** while noun relevance
and adjective–noun coherence remain **1,000/1,000**. The affected scheduler brief replaces
`TimedTimer` with `SwiftTask` and `TimedWorker`; its structural composite improves
**70.9 → 71.5**, diversity trades **0.751 → 0.744**, and its 100-name capacity remains intact.
Across twenty long audit batches, **0/1,940** generated names contain an echo; no previously full
session becomes short.

**Verification.** The core suite is **118/118**, including a direct 100-name scheduler
regression. Brandable quality remains byte-identical, developer semantics stay **1,590/1,600**,
and morphology remains free of collapsed suffixes and lossy overlaps. WASM and the production
bundle build cleanly; Chromium finds no lexical echo in 800 Compound developer-domain names,
keeps semantic coverage at **791/800**, passes all 30 guided Auto pages, and preserves both
100-card Compound sessions.

---

## Phase 80 — Break the first-page suffix monoculture

**Bottleneck.** Semantic relevance was strong, but the first page still explained why many names
felt mechanically similar. Expanding the morphology audit to twenty-two briefs found
**773/1,100** direct root-plus-suffix forms, **327/1,100** multi-concept joins, and **0/1,100**
metaphor forms. Of 110 deterministic pages, **55** carried at least eight suffix forms and **41**
were suffix-only. The more varied metaphor lane already dominated Load more, but was unreachable
on a single-concept first page.

**A/B.** Opening that lane for every prompt raised diversity but weakened developer specificity
**1,590/1,600 → 1,532/1,600**; forcing every metaphor to the lead concept recovered meaning but
starved four long-session batches. Both variants were rejected. The retained rule leaves every
multi-concept first page unchanged and reserves a measured 20% candidate lane only for
single-concept briefs. After the first page, the existing broad continuation behavior remains
unchanged. A 30% lane was less balanced and a 10% lane left more suffix-heavy pages; 20% performed
best across the fixed seed matrix.

**Seam correction.** Exercising the metaphor lane exposed a separate morphology bug. When a root
ended with the same consonant that began the metaphor, the join deleted one side and produced
`Bumpulse`, `Shellink`, `Flagrid`, `Configlow`, and `Agentrail`. The expanded audit found
**13/1,100** fixed-page and **97/2,200** rolling examples. Identical vowels may still merge
cleanly (`nova + atlas → Novatlas`), but consonants now preserve both readable roots; collapsed
consonant seams move to **0/1,100** and **0/2,200**.

**Measured result.** Direct suffix forms fall **773 → 658**, readable metaphor forms move
**0 → 115**, suffix-heavy pages fall **55 → 30**, and suffix-only pages fall **41 → 6**.
First-page diversity rises **0.715 → 0.725**. The structural composite trades
**81.51 → 80.87**, expected because that legacy score explicitly rewards clean suffixes; unlike
the rejected blanket penalty, this change adds a distinct naming family instead of merely
reordering the same forms. All **2,200/2,200** rolling names still return, the old multi-concept
first pages remain byte-identical, and developer-domain coverage stays **1,590/1,600**.

Representative single-concept pages now mix compact coinages with forms such as `Careflow`,
`Pulsevault`, `Valuevault`, `Envatlas`, `Gatevault`, `Flagwave`, `Workerloom`, and `Timerflow`
instead of presenting ten near-identical suffix treatments.

**Verification.** The core suite is **119/119** with a direct first-page shape regression.
Compound remains **1,000/1,000** prompt-linked and pair-coherent with zero lexical echoes across
both 1,000 fixed-page and 1,940 long-session names. WASM and the production bundle build cleanly;
Chromium reports only **6/80** suffix-only developer Brandable pages, preserves **798/800**
Brandable and **791/800** Compound semantic coverage, passes all 30 guided Auto pages, and keeps
both 100-card Compound sessions intact.

---

## Phase 81 — Give legal research a real semantic space

**Bottleneck.** `legal research` exposed the weakness that still hides behind otherwise healthy
global averages. Brandable treated both words almost literally and returned forms such as
`Legol`, `Reslit`, `Legrify`, and `Resche`: diversity was **0.616**, none of 100 names represented
both concepts, and every first-page name overused one of the two raw prefixes. Compound produced
reasonable-looking labels such as `TopLegal`, but exhausted its narrow palette at **40/100**;
diversity was **0.485** and only **44%** of the batch was structurally distinct.

**Change.** Legal work and research now expand into separate, restrained offline vocabularies:
`law`, `case`, `brief`, `clause`, `docket`, and `counsel` on one side; `source`, `proof`, `index`,
`trace`, `lens`, and `scope` on the other. Compound receives matching adjective families instead
of falling back to generic praise words. Unknown professions still use the restrained fallback,
which is pinned independently by the `plumber` regression.

**Measured result.** Brandable now fills **100/100** names, raises diversity
**0.616 → 0.771**, moves two-concept forms **0% → 15%**, and cuts first-page raw-prefix overuse
**10/10 → 1/10**. Its page now contains readable forms such as `Briefindex`, `Docketlens`,
`Lawsource`, and `Clauselens`. Compound moves **40/100 → 100/100**, raises diversity
**0.485 → 0.733**, and raises structurally distinct output **44% → 62%**, with forms such as
`FirmLaw`, `DeepIndex`, `OpenProof`, and `FirmDocket`.

The legacy Brandable structural composite falls **85.8 → 79.1**. That is an informative failure
of the metric, not a quality regression: the old score rewarded short typo-like mutations and
literal prefix reuse more strongly than semantic breadth. The retained change improves the
observable failure modes without changing the previous seven audited briefs.

**Verification.** The core suite is **120/120**. All previous concept-audit outputs remain
byte-identical; Compound stays **1,000/1,000** prompt-linked and pair-coherent, all twenty long
briefs now reach **100/100**, and lexical echoes remain **0/2,000**. Developer-domain coverage
stays **1,590/1,600** and the Phase 80 morphology matrix is unchanged. WASM and the production
bundle build cleanly; Chromium passes all 30 guided Auto pages, the developer-domain gate, and
three separate 100-card Compound sessions including `legal research`.

---

## Phase 82 — Build a general-domain safety net

**Bottleneck.** The semantic audits were deep on developer tools but sparse elsewhere. A new
calibration/synonym-holdout corpus across recruiting, meals, inventory, customer support, real
estate, events, weather, habits, sales CRM, meditation, and pet care exposed three repeated
failures. The stemmer reduced `hiring` to `hir`; unknown product words beside `team` could make
Compound reject every candidate; and polysemous words leaked into the wrong domain, producing
`Streamify`/`SteadyBus` for event ticketing, `Buyertrace`/`TrustedLens` for property discovery,
and `Inboxsynth`/`SmartAgent` for customer support.

The baseline calibration side generated only **965/1,100** first-page names, with
**410/965 (42.5%)** carrying an expected semantic marker and **100/965 (10.4%)** carrying a
known wrong-domain marker. Its recruiting and sales-CRM Compound pages were completely empty.
The independent synonym holdout generated **1,080/1,100**, with **392/1,080 (36.3%)** semantic
and **121/1,080 (11.2%)** wrong-domain names.

**Change.** Eleven restrained offline semantic families now cover both calibration terms and
common synonyms. A small explicit inflection table restores silent-e concepts such as
`hiring → hire`, `coding → code`, and `writing → write` without guessing at every `-ing` word.
Context suppression stays narrow: audience words cannot take ownership of an unknown Compound
brief, while `agent`, `discovery`, `marketplace`, and similar ambiguous words are ignored only
when support, real-estate, event, or another explicit domain is already present. `event` itself
now means a consumer event; technical `queue`, `broker`, `stream`, `topic`, and `bus` remain
separate developer signals.

**Capacity-gated A/B.** The first semantic expansion looked strong on first pages but was
rejected because a sales holdout returned **0/50** Brandable names and `pet care appointment`
stopped at **15/100** during Load more. Removing only the redundant contextual groups fixed both
instead of weakening the global length or coherence filters. The permanent harness now tests
all 22 prompts with disjoint seed sets and also runs 100-name rolling sessions in both modes.

**Measured result.** Calibration reaches **1,100/1,100** first-page and **2,200/2,200** rolling
names; semantic coverage rises to **1,049/1,100 (95.4%)**, while wrong-domain leakage falls to
**1/1,100 (0.1%)**. Synonym holdout reaches the same full capacities, rises to
**1,051/1,100 (95.5%)** semantic coverage, and falls to **0/1,100** wrong-domain names. Results
now include `TrustedHire`, `WarmPantry`, `QuickInbox`, `PrimeRoof`, `VividVenue`, `LiveBreeze`,
`TrustedDeal`, `QuietPause`, and `GentleTail` instead of raw fragments or unrelated technical
language. Exact-marker coverage intentionally undercounts transformed Brandable forms.

**Verification.** The core suite is **123/123**. The original eight concept sessions still fill
100 names; Compound remains **1,000/1,000** prompt-linked and pair-coherent with zero echoes in
both 1,000 first-page and 2,000 long-session names. Developer-domain coverage remains
**1,590/1,600**, and the Phase 80 morphology matrix remains unchanged at **1,100/1,100** fixed
plus **2,200/2,200** rolling names. WASM and the production bundle build cleanly. Chromium keeps
the developer and 30-page Auto gates green, while five separate Compound UI sessions—including
the new recruiting and consumer-event regressions—each reach 100 unique, relevant names.

---

## Phase 83 — Stop rewarding every project name for looking like a suffix template

**Bottleneck.** Phase 80 opened a readable metaphor lane, but the Phase 28 brand-appeal scorer
still gave every clean `-ify/-io/-ia/-ix/-ora` form a **0.28** ranking bonus at production
variety. Candidate diversity had improved while final selection continued to prefer mechanical
forms such as `Careora` and `Dishify` over equally relevant `Careflow`, `Rainloom`, or
`Clientrelay`. The expanded general-domain harness now records suffix, metaphor, and multi-root
shapes in addition to semantic coverage and capacity. Its baseline Brandable pages selected
**396/550** suffix forms on calibration and **409/550** on the independent synonym holdout.

**A/B and rejected shortcuts.** Removing the bonus globally was rejected: prompts without a
brief lost useful corpus guidance and surfaced weaker replacements such as `Pinarroww` and
`Sayeslika`. Removing it for every described project also failed the existing multi-concept
balance regression; the app's own brief fell to only two compact coinages and became dominated
by literal two-root joins. A blanket **0.14** bonus preserved that test but left single-concept
pages unnecessarily suffix-heavy. The retained policy follows the information already present:
generic generation keeps its old bonus, a recognized single concept gets no suffix bonus, and a
multi-concept brief gets a reduced bonus that is **0.14** at production variety and relaxes toward
zero as variety rises. The 20% single-concept metaphor candidate lane remains unchanged.

**Measured result.** Across the established twenty-two-brief morphology matrix, direct suffix
forms fall **658/1,100 → 513/1,100**, readable metaphor forms rise **115 → 189**, and
multi-concept joins move **327 → 398**. Suffix-heavy pages halve **30/110 → 15/110** and
suffix-only pages fall **6/110 → 4/110**. Diversity holds **0.725 → 0.726**; the legacy
structural composite moves **80.87 → 80.15**, expected because that metric explicitly includes
the suffix reward being reduced. All **2,200/2,200** rolling names still return with no collapsed
seams or short batches.

The independent general-domain corpus keeps full capacity and meaning: calibration reaches
**1,053/1,100 (95.7%)** semantic with **1/1,100** wrong-domain, while holdout reaches
**1,050/1,100 (95.5%)** semantic with zero wrong-domain; both rolling sides remain
**2,200/2,200**. Their Brandable shape mix is now almost balanced: calibration selects
**277 suffix / 273 metaphor**, and holdout **300 suffix / 247 metaphor / 3 other**. Developer
coverage also stays **1,591/1,600 (99.4%)**. This is a bounded family-balance correction, not a
claim that the engine has learned personal taste; no real like/pass export was available.

**Verification.** The workspace suite is **124/124**. WASM and the production bundle build
cleanly. Chromium reports **800/800 Brandable** and **791/800 Compound** developer-domain names,
all 30 Auto pages keep ten names and their sole accents are **15/15** prompt-linked, five
Compound scenarios each reach 100 unique relevant names, and the app's own Brandable brief also
reaches 100 without repeats or false exhaustion.

---

## Phase 84 — Separate product context from naming concepts

**Bottleneck.** The post-suffix audit exposed a deeper source of awkward names. RAKE correctly
kept descriptive words from a brief, but Brandable treated every unknown word as a separate
semantic root group. That produced `Stashlocal`, `Dreamguided`, `Trackerloom`, `Instantbeam`,
`Flowshared`, and `Modernreel`. Long descriptors could be worse than unattractive: the lead root
for `simple workout planner` became `simple`, so only **30/50** first-page names returned and just
**5/30** carried a fitness marker; `collaborative document editor` and `automatic invoice
reminders` returned **0/50** each.

**Permanent audit and boundary.** A new eleven-brief fixed-seed corpus covers local, guided,
simple, personal/tracker, collaborative, instant, shared, automatic/reminder, modern,
lightweight, and remote wording. It records first-page capacity, domain markers, weak context
forms, misordered tails, and ten-batch rolling capacity. The baseline returned only
**430/550** first-page names and **806/1,100** rolling names, with **30** short rolling batches.
Of the returned first pages, **405/430** were domain-linked but **36/430** used a context-only
word as a name root; rolling sessions contained **83/806** such forms.

The retained rule is deliberately contextual rather than a global stopword expansion. When the
brief already contains a recognized semantic domain, eleven measured delivery/role words such as
`local`, `guided`, `simple`, `collaborative`, `automatic`, `tracker`, and `reminder` do not open
standalone Brandable groups. Unknown briefs still preserve their words (`local bakery` remains
available), and Compound keeps its adjective semantics (`LocalCache` remains possible). This
separates what the product *is* from how it is delivered without pretending every adjective is
meaningless.

**Measured result.** The dedicated corpus now returns **550/550** first-page and
**1,100/1,100** rolling names with no short batch. All **550/550** first-page names carry an
expected domain marker; weak context forms and misordered tails fall to **0**, including across
all **1,100** rolling names. Formerly empty briefs now produce readable sets such as `Draftwave`,
`Scribeflux`, `Ledgerflux`, and `Tallylink`; the workout page replaces `Simpleora` with forms such
as `Careflow`, `Thrivespring`, `Fitsignal`, and `Pulseatlas`.

The established morphology matrix improves at the same time: suffix forms move
**513/1,100 → 487/1,100**, metaphor forms **189 → 216**, suffix-heavy pages **15/110 → 10/110**,
and suffix-only pages **4/110 → 0/110**. Diversity stays **0.726** while the legacy structural
composite moves **80.15 → 80.03**. General-domain calibration remains **1,053/1,100** semantic
with one wrong-domain result; synonym holdout remains **1,050/1,100** with none. Developer-domain
coverage stays **1,591/1,600 (99.4%)**.

**Verification.** The workspace suite is **126/126**, and the new descriptor audit fails closed
on capacity, semantics, weak forms, tails, and rolling output. WASM and the production bundle
build cleanly. Chromium expands Auto coverage from 30 to **55** fixed pages: every page contains
ten names, weak Brandable context forms remain zero, and all **35/35** accents are prompt-linked.
The developer browser gate remains **800/800 Brandable** and **791/800 Compound**, while
suffix-only Brandable pages improve **8/80 → 4/80**. Five Compound sessions and the app's own
Brandable session still reach 100 unique names without false exhaustion.

---

## Phase 85 — Give neighboring product domains distinct vocabularies

**Bottleneck and rejected hypothesis.** The first suspicion was that the readable metaphor lane
had become a generic `flow`/`link`/`loom` monoculture. A new exact-tail audit first separates real
root+metaphor forms from two-concept joins that merely share a palette word. Across the fixed
1,100-name morphology matrix, only **216** names on **40/110** pages are exact metaphor forms;
**22/40** such pages repeat a tail, but the maximum is **3/10** on one cloud page. Long sessions
exercise **33/34** curated tails. A broad metaphor penalty or tighter global cap would therefore
remove useful variety to fix a concentration problem the measured pages do not have, so that
change was rejected.

The real repetition was semantic. The general-domain audit now records aggregate composite and
ILAD diversity for both modes and fails closed when an exact Brandable name appears in multiple
product domains. The Phase 84 baseline found **12** cross-domain collisions: six `care…` names
shared by customer support and pet care, and six `ticket…` names shared by customer support and
events. These were not random tail collisions; two neighboring domains owned the same naming
roots.

**Bounded correction.** Customer support now expands to `desk`, `reply`, `inbox`, `resolve`,
`assist`, and `answer`. A raw `ticket` is suppressed only when a support/helpdesk/inbox concept is
present, so event naming still keeps `ticket`. Pet care now uses `paw`, `tail`, `pet`, `vet`,
`vital`, and `buddy` instead of the shared `care` root and an unproductive long `companion` root.
Three narrow A/B alternatives using `solve`, `guide`, or `help` recovered some edit-distance
spread but produced visibly weaker forms and lower composite scores; they were rejected.

**Measured result.** Exact cross-domain collisions fall **12 → 0**. Calibration semantic coverage
rises **1,053/1,100 (95.7%) → 1,069/1,100 (97.2%)** and holdout rises
**1,050/1,100 (95.5%) → 1,067/1,100 (97.0%)**, while wrong-domain counts stay at one and zero.
Brandable composite improves **79.32 → 79.78** on calibration and **79.21 → 79.69** on holdout.
ILAD moves **0.735 → 0.726** and **0.743 → 0.737** respectively: a small, explicit trade for
longer domain-specific roots rather than shared short words. Both splits still deliver
**2,200/2,200** rolling names, and the tested support/pet pages maintain or improve session
distinctness. Compound quality and diversity remain stable.

**Verification.** The workspace suite is **126/126**. The morphology matrix remains
**1,100/1,100**, composite **80.03**, diversity **0.726**, with **487 suffix / 397 multi-concept /
216 metaphor** forms and no suffix-only page. The new morphology gates cap any one exact metaphor
tail at three names per page and require at least 90% of the palette in rolling sessions.
Developer coverage remains **1,591/1,600 (99.4%)**; the modifier corpus is **550/550** semantic;
Compound is **1,000/1,000** prompt-linked and pair-coherent with zero lexical echoes across
2,000 rolling names. WASM and the production bundle build cleanly. Chromium now covers **65** Auto
pages with zero weak context forms and **40/40** prompt-linked accents; developer gates remain
**800/800 Brandable** and **791/800 Compound**, and all established 100-name Brandable/Compound
sessions pass without repeats or false exhaustion.

---

## Phase 86 — Extend the context boundary across the full product lexicon

**Bottleneck.** Phase 85 proved that exact cross-domain collisions can expose shared-root
problems, but its eleven general domains covered only a fraction of the offline lexicon. A new
48-domain, five-seed Brandable matrix now spans consumer, creative, business, and developer
briefs. The first baseline requested **2,400** names but returned only **2,345**: every online
marketplace page collapsed to **5/10** (`Seller…`/`Online…` only), and every photo/video editor
page collapsed to **4/10** (`Edit…` only). Travel also opened the entire productivity palette,
producing forms such as `Planora`, `Taskio`, and `Flowify`; `git release automation` opened the AI
palette and produced `Commitsynth`, `Forgemind`, and `Shipmind`.

The matrix also reports shared semantic roots and exact names across all 48 domains. Its initial
51 collisions include true ambiguity (`cloud` for weather and deployment), adjacent meanings
(`vital` for fitness and pet health), and expected nested contexts (developer naming and naming).
Those are kept visible for future review but are not forced to zero: making every domain lexicon
artificially disjoint would remove useful words without proving better names.

**Bounded correction.** `online`, `seller`, and the stem `edit` are now treated as delivery/role
context only when another recognized domain is present; unknown briefs still retain them.
`plan` is suppressed only beside an explicit travel concept, and `automation` is suppressed only
beside an explicit git/release concept. This removes the specific misleading group rather than
globally banning productive words. Exact review also rejected an overbroad proposal to suppress
delivery `track`: `Cargotrack`, `Relaytrack`, and `Routetrack` are coherent names and remain.

**Measured result.** The broad matrix now returns **2,400/2,400** names with **0/240** short
pages, zero audited context-only roots, and zero context-only name forms. Marketplace now opens
with forms such as `Cartify`, `Tradeflux`, and `Bazaaria`; media with `Frameloom`, `Echopath`, and
`Reellink`; travel with `Atlaspeak`, `Treksignal`, and `Roamify`; git release with `Branchify`,
`Commitio`, and `Tagwave`. The established morphology matrix improves at the same time:
composite **80.03 → 80.17**, diversity **0.726 → 0.728**, and the mix moves from
**487 suffix / 397 multi-concept / 216 metaphor** to **477 / 380 / 243**, still with no
suffix-only page and full **2,200/2,200** rolling output.

**Verification.** The workspace suite remains **126/126**. The Phase 85 general matrix is
unchanged at **1,069/1,100** calibration and **1,067/1,100** holdout semantic names with zero
cross-domain collision in that guarded set. The modifier corpus remains **550/550** semantic,
developer coverage **1,591/1,600 (99.4%)**, and Compound remains **1,000/1,000** prompt-linked
and pair-coherent with zero lexical echoes across 2,000 rolling names. WASM and the production
bundle build cleanly. Chromium expands Auto from 65 to **85** pages: all contain ten names, weak
context forms stay zero, and all **45/45** accents are prompt-linked. Developer browser gates stay
**800/800 Brandable** and **791/800 Compound**; the app Brandable session and all five Compound
sessions still reach 100 unique names without false exhaustion.

---

## Phase 87 — Separate broad-domain naming neighborhoods

**Bottleneck.** The 48-domain matrix from Phase 86 had full capacity, but its exact-name report
still contained **50 shared names across 54 domain pairs**. The largest avoidable clusters came
from broad roots rather than the generator itself: bookmark names reused naming/social
`mark`/`link` forms, finance reused naming/security `mint`/`vault`, dependencies reused security
`lock`, and cloud deployment and git release both emitted six identical `ship…` names. These
collisions made different briefs feel as if they were drawing from the same product-name bag.

**Measured A/B correction.** Each replacement was tested over five fixed seeds with per-domain
composite, diversity, session uniqueness, first-page inspection, and the full collision graph.
Inventory now favors `count`/`asset`; finance `coin`/`cash`/`balance`; rate limiting `burst`;
bookmarks `pin`/`clip`/`ribbon`/`star`; background jobs `tick`; dependencies `graph`/`module`;
and git release `push`/`patch`. We rejected weaker alternatives including `fence`, `valve`,
`brake`, module-only and tree-only dependency palettes, and a fully disjoint cloud palette.
Replacing cloud's strong deployment vocabulary cut collisions but lowered its composite by 2.8
points, so the retained fix separates git vocabulary instead.

**Measured result.** Exact cross-domain reuse falls from **50 names / 54 domain pairs to 20 / 20**
while all **2,400/2,400** requested names remain available. Broad composite improves
**79.97 → 80.16**. Average diversity moves **0.727 → 0.726** and average per-domain session
uniqueness **46.8% → 46.5%**: a small explicit spread trade for removing 34 repeated domain
pairs, not a hidden claim that all overlap is bad. The remaining pairs are visible adjacent or
nested meanings such as weather/deployment `cloud`, travel/delivery `route`, naming/developer
naming, and fitness/pet-health `vital`. The audit now fails closed above 20 collision pairs or
below its aggregate composite, diversity, and uniqueness floors.

The retained first pages include `Countify`, `Assetflow`, and `Stockora` for inventory;
`Cashify`, `Ledgeria`, and `Balanceix` for finance; `Burstora` and `Quotaify` for rate limiting;
`Starsignal`, `Clipora`, and `Pinnova` for bookmarks; `Versionia`, `Graphia`, and `Syncrelay` for
dependencies; and `Patchify`, `Pushify`, and `Forgeora` for git release. The established
morphology matrix also improves from **80.17 → 80.48** composite at **0.728** diversity, with
**1,100/1,100** first-page and **2,200/2,200** rolling names.

**Verification.** The workspace suite is **127/127**. General-domain calibration remains
**1,069/1,100** semantic and holdout **1,067/1,100**, with zero guarded cross-domain collision;
the modifier corpus remains **550/550**, developer coverage **1,591/1,600**, and Compound
**1,000/1,000** prompt-linked and pair-coherent with zero lexical echoes. WASM, TypeScript, and
the production bundle build cleanly. Chromium passes all **85** Auto pages with **45/45**
prompt-linked accents, developer coverage remains **800/800 Brandable** and **791/800 Compound**,
and the 100-name Brandable session plus all five 100-name Compound sessions remain duplicate-free
without false exhaustion.

---

## Phase 88 — Lift the weakest domain vocabularies

**Bottleneck.** Once cross-domain repetition was bounded, the 48-domain quality report exposed a
wide floor gap. Education scored only **67.38** composite, sales CRM **73.06**, legal research
**73.46**, environment tooling **74.98**, database migrations **75.44**, and formatters **76.08**.
The first pages explained why: education overused long `Study…`/`Class…` joins, while specialized
developer briefs reopened the generic `crate`/`stack`/`byte`/`node`/`kit` palette and produced
interchangeable forms such as `Storekit`, `Relaystack`, `Lintbyte`, and `Tidystack`.

**Bounded correction and rejected variants.** A first attempt suppressed generic developer
artifacts beside every specialized developer domain. It increased session spread, but common
`gate` and `trace` forms then filled the gap, exact collision pairs rose **20 → 29**, and broad
composite fell **80.16 → 80.09**; that global rule was rejected. The retained boundary applies
only where a richer replacement palette was measured: database adds `data`, `record`, `row`,
`field`, and `index`, while formatter adds `syntax`, `indent`, and `align`. Rate limiting,
testing, and filesystem naming keep their useful developer-artifact accents.

The lowest consumer/business palettes were tuned with the same fixed-seed A/B loop. Education
adds the shorter `sage` and `quiz`; sales adds `sale` and `close` while preserving productive
`client`, `contact`, and `growth`; environment adds `dot` while retaining `setting`; legal
research balances `jury`, `docket`, and `cite`. `grow`/`funnel` sales roots were rejected after
lowering composite to **71.88** and producing `Closespring`/`Growscope`. A raw `var` environment
root raised composite but collapsed diversity to **0.616** around `Vario`/`Varia`, and an
over-pruned eight-root legal palette collapsed diversity to **0.618**; neither survives.

**Measured result.** Broad composite rises **80.16 → 80.53**, diversity **0.726 → 0.728**, and
average per-domain uniqueness **46.5% → 47.1%**, while exact collision pairs remain capped at
**20** and capacity remains **2,400/2,400**. Education improves **67.38 → 74.24** composite and
**0.761 → 0.791** diversity; sales **73.06 → 73.98** and **0.722 → 0.776**; formatter
**76.08 → 77.46** and **0.766 → 0.810**. Environment reaches **78.42**, legal research **77.40**,
and database migrations **76.44**. The retained first pages include `Sageloom`, `Quizlumen`,
`Contactio`, `Salepath`, `Dotloom`, `Docketlens`, `Juryproof`, `Relayrow`, `Syntaxio`, and
`Indentix`. Broad audit floors now fail closed below **80.5** composite, **0.725** diversity, or
**47%** average domain uniqueness.

The established morphology matrix improves again from **80.48 → 80.74** composite and
**0.728 → 0.730** diversity, with **1,100/1,100** first-page and **2,200/2,200** rolling names.
General-domain semantic coverage remains **1,069/1,100** calibration and **1,067/1,100**
holdout; their Brandable composite rises **79.86 → 79.95** and **79.73 → 79.83** respectively.
Developer marker coverage rises **1,591/1,600 → 1,594/1,600**.

**Verification.** The workspace suite is **129/129**. The modifier corpus remains **550/550**,
and Compound remains **1,000/1,000** prompt-linked and pair-coherent with zero lexical echoes.
WASM, TypeScript, and the production bundle build cleanly. Chromium passes all **85** Auto pages
with **45/45** prompt-linked accents, developer coverage remains **800/800 Brandable** and
**791/800 Compound**, and the 100-name Brandable session plus all five 100-name Compound sessions
remain duplicate-free without false exhaustion.

---

## Phase 89 — Make the app's own naming brief feel intentional

**Bottleneck.** The app's own brief — “a developer tool that generates names for packages,
CLIs, libraries and projects” — still exposed a taste problem hidden by aggregate semantic
coverage. Its first Brandable page opened with `Kitpeak`, `Kitseed`, and `Kithive`; those names
were technically developer-related, but the generic `crate`/`stack`/`byte`/`node`/`kit` palette
overpowered the actual naming intent. The fixed-seed developer-naming case scored **82.62**
composite, **0.691** diversity, and **42%** session uniqueness.

**Bounded correction.** Developer artifacts now expand to `key`, `tag`, `alias`, and `slug` only
when the same brief explicitly contains a naming concept. A normal developer/API brief still
keeps the generic artifact vocabulary. Ranking also gives a small **0.20** preference to a
candidate that visibly carries the brief's first, deliberately ordered semantic group. This is
a general rule: it favors the principal modifier or domain over incidental context rather than
hard-coding a list of preferred final names.

The alternatives were measured and rejected. `token` raised the structural score but promoted
`Tokenseed`; `label` increased exact cross-domain collisions from **20 to 21**; and a stronger
**0.35** lead preference lowered developer-naming diversity to **0.722**. Removing developer
artifacts entirely also collapsed session uniqueness. The retained setting keeps a first-page
mix of at least three compact coinages and three semantic joins, while requiring at least half
of the app brief's first page to carry its naming anchor.

**Measured result.** The developer-naming first page now opens with `Lexify`, `Nomforge`,
`Markseed`, `Markforge`, and `Nomio`. Composite rises **82.62 → 85.02**, diversity
**0.691 → 0.735**, and session uniqueness **42% → 44%**. Across all 48 domains, composite rises
**80.53 → 80.61**, diversity holds at **0.729**, average domain uniqueness reaches **47.2%**,
and exact collision pairs remain capped at **20**. The morphology matrix improves
**80.74 → 80.95** composite at **0.730** diversity, with all **1,100/1,100** first-page and
**2,200/2,200** rolling names available.

**Verification.** The workspace suite is **129/129**. General-domain coverage remains
**1,069/1,100** calibration and **1,067/1,100** holdout; modifier coverage remains **550/550**;
developer coverage remains **1,594/1,600**; and Compound remains **1,000/1,000** prompt-linked
and pair-coherent with zero lexical echoes. WASM, TypeScript, and the production bundle build
cleanly. Chromium passes all **85** Auto pages with **45/45** prompt-linked accents,
**800/800** developer Brandable names and **791/800** developer Compound names. The app's
100-name Brandable session and all five 100-name Compound sessions remain duplicate-free and
never falsely exhaust.

---

## Phase 90 — Keep local taste inside each project

**Bottleneck and rejected generator experiments.** Phase 89 improved the cold-start result, but
the remaining misses (`Keyseed`, `Aliasseed`, repeated `-forge` families) tempted increasingly
narrow generator rules. Five fixed-seed variants were measured and rejected: a deeper candidate
pool left the app's first page unchanged and introduced two suffix-only morphology pages; a
naming-specific suffix mix raised exact cross-domain collisions **20 → 23**; broad and narrow
tail caps lowered the app brief's composite and edit diversity; and banning identifier-plus-seed
pairs lowered it to **83.46** composite and raised collisions to **21**. None beat the committed
Phase 89 setting, so no speculative root or final-name blacklist remains.

The evidence-backed gap was already in the product. Every liked/passed result carried a stable
project context and the v2 export formed pairs only inside that context, but the live local-taste
ranker still built one profile from every project. Likes from a fantasy game could therefore
reorder names for a developer package. That contradicted the data boundary and made repeated use
of the app less reliable.

**Retained correction.** Live feedback is now filtered by the current context ID before a
profile is built. Three signals teach one project, not every future brief. A new project begins
without inherited ranking; returning to the original brief restores its profile. Collections
created entirely before context tagging retain the old global behavior as a compatibility
fallback, while scoped and legacy records are never mixed. The status now says
`Local taste · this project` when active and shows project-specific progress otherwise.

**Verification.** Eighteen deterministic preference checks cover positive, negative, mode, and
shape learning plus four new context gates: cross-project exclusion, current-project ranking,
new-project isolation, and legacy fallback. TypeScript and the production bundle build cleanly.
Nineteen Chromium checks exercise real WASM feedback, mutual exclusion, persistence, project
switching, pass-only activation, Settings, and the v2 download; switching briefs visibly resets
`3 liked · 2 passed` to `3 likes or 3 passes left`. The Phase 89 core remains the retained
cold-start engine: **129/129** workspace tests, **80.61** broad composite, **0.729** diversity,
and the established Auto/developer/session gates all remain green.

---

## Phase 91 — Let local taste choose, not just reorder

**Bottleneck.** Project scoping made feedback trustworthy, but the live ranker still received
exactly the ten names the user was going to see. It could change card order but could not replace
a weak first-page name with a stronger candidate outside that page. Once a profile existed, the
app was paying the interaction cost of taste learning without giving the judge a real choice.

**Rejected generator/scorer experiments.** Two cold-start ideas were prototyped outside the
retained path. Prefix-conditioned brand-Markov completion raised the legacy composite and
edit-distance diversity, but produced forms such as `Contern`, `Commode`, and `Routsy`; three-letter
prefixes raised cross-domain collision pairs **20 → 65**, while four-letter prefixes still reached
**38**. A contrastive brand-corpus-versus-English likelihood score demoted some plain joins but
continued to prefer mechanical names such as `Keyforge`, `Ledgerbeam`, and `Lintwave`. Both probes
were removed; there is no new universal aesthetic rule or core-engine diff.

**Retained correction.** Cold start still generates the requested count. Once the current project
has a valid local profile, Create asks the existing offline engine for a **3× candidate pool**
(ten visible names means thirty candidates, capped at sixty), ranks that pool with the user's
positive/negative shape and mode evidence, and shows only the requested page. Pool candidates that
were not shown count as explored so deterministic generation cannot keep cycling through the same
passed-over set. Existing cards never jump; personalization applies only to each incoming page.

**Verification.** Twenty-one deterministic preference checks prove cold-start count preservation,
the three-page pool, and the key selection contract: an `-ix` candidate outside the original first
ten enters the personalized shortlist. TypeScript and the Vite production bundle build cleanly.
Twenty-one Chromium checks exercise real WASM generation and verify that an active profile adds
exactly thirty recent candidates while rendering ten cards, preserves all feedback/export behavior,
and does not transfer the profile to another project. This is a measured post-feedback quality
gain, not a claim that cold-start aesthetics have been solved.

---

## Phase 92 — Seed local taste with names the user already likes

**Bottleneck.** Phase 91 gave the local judge thirty candidates to choose from, but a new user
still had to label three generated names before that judge could help. This was avoidable: people
often already know the naming language they want (`Vercel`, `Linear`, `Notion`) even when they
cannot express it as a scoring rule.

**Retained correction.** Advanced options now accepts three to eight reference names. The same
offline shape profile extracts length, syllable rhythm, vowel balance, sharpness, compound form,
endings, onsets, and bigrams from those examples; three usable positive examples immediately
activate the existing 30-to-10 local shortlist. References are bounded, normalized, and
deduplicated against each other and starred names. They persist in a separate localStorage key,
never count as real likes or passes, and never enter the taste-data export. Explicit feedback
remains project-scoped; references are an intentional global style preference. The shortlist's
engine-quality anchor was also raised so a shape match cannot promote a structurally weak name
over a strong candidate.

**Interface.** The former ellipsis chip is now the discoverable `Advanced` control. Its first
field is `Names you like`, with a stable `0/3` readiness indicator, concise guidance, and a
40-pixel input target using the existing dark surface, border, and accent system. Active result
status reports references separately from project likes and passes.

**Verification.** Twenty-seven deterministic checks cover parsing, normalization, the eight-name cap,
reference-only profile activation, the thirty-candidate pool, and favorite/reference
deduplication plus the quality-floor contract. A fixed-seed audit across three briefs and five
seeds compared 150 selected names: the previous weight averaged **84.10** engine quality with
**7/150** below 75; the retained weight averages **86.01** with **0/150** below 75 while mean
reference affinity moves only **-0.016**. TypeScript and the production build are clean.
Twenty-eight Chromium checks cover persistence, ten-from-thirty selection, readiness/status
copy, and separation from explicit feedback.

---

## Phase 93 — Keep personalized pages strong and structurally varied

**Bottleneck.** The larger local pool exposed a boundary error between the Rust generator and
the web selector. The engine limits one three-letter stem family to 20% of the requested batch,
so a normal ten-name page allows two. Personalization requested thirty names first, which relaxed
that internal cap to six; the web ranker could then put most of those six variants back into its
visible ten. Across five briefs, four reference sets, and five seeds, the 100 personalized pages
contained **190** names beyond the intended two-per-prefix limit and **104/1,000** selected names
below a 75 structural composite. The app brief visibly collapsed into `Mint…`, `Mark…`, `Lex…`,
and `Nom…` variants.

**Rejected alternatives.** A generic edit-distance MMR penalty reduced near-duplicate pairs but
admitted more low-quality candidates, including `Lexcheck`; it was removed. Hard two-per-suffix
limits reduced reference affinity too sharply and surfaced `Nymslug`. A deeper pool without a
visible-page family cap increased concentration. No new naming root, suffix palette, or aesthetic
blacklist was retained.

**Retained correction.** An active local profile now requests up to sixty offline candidates.
The engine may honestly return fewer when a brief's reachable space is narrower (the audit spans
29–60), but the visible page still contains ten. Selection first uses candidates at or above a
75 structural composite when at least ten are available, then restores the generator's 20%
three-letter-prefix boundary at the visible-page size. If a constrained pool lacks enough strong
names or prefix families, ranked fallbacks preserve result count rather than causing false
exhaustion. Cold start remains byte-for-byte on the old requested-count path.

**Measured result.** On the fixed 100-page matrix, average engine quality rises
**84.16 → 85.46**; sub-75 selections fall **104 → 0**; three-plus prefix overflow falls
**190 → 0**; near-duplicate pairs fall **315 → 245**; and mean pair similarity falls
**0.260 → 0.233**. Mean reference affinity is effectively held (**-0.783 → -0.786**).
The retained production audit fails closed below **85.2** average quality, above **260** near
pairs, above **0.24** mean pair similarity, or on any sub-75 name/prefix overflow.

**Verification.** Thirty-one deterministic preference checks cover the six-page request, quality
floor, visible family limit, constrained fallback, and zero-size behavior alongside all prior
taste contracts. TypeScript and the Vite production build are clean. The new
`taste-quality-audit.mjs` passes all seven gates over 1,000 selected names, and the existing 28
Chromium checks preserve real-WASM feedback, references, persistence, export separation, and
expanded-pool selection.

---

## Phase 94 — Raise the offline first-page quality floor

**Bottleneck.** Aggregate semantic and structural scores were no longer enough to explain why
the app's own lists still felt mechanical. The expanded naming pool exposed two concrete
patterns: short naming roots repeatedly recycled the old `-ix`/`-io`/`-ify` palette, and a cold
Auto page could still contain one or two structurally weak names even when the engine had better
unused alternatives. The personalized naming page could also show three copies of one exact
ending after taste ranking, despite respecting the existing two-per-prefix limit.

**Measured exploration.** The correction stayed narrow after rejecting broader experiments.
Global suffix expansion produced forms such as `Talenter`, `Plateer`, and `Assister`; abstract
coinage and semantic real-word lanes either became noisy (`Tascil`, `Infurts`) or failed to cover
non-naming briefs; rebuilding every cold page from a thirty-name pool raised proxy scores but
made the result more mechanical; and changing recent-history behavior damaged both structural
quality and taste affinity. A generic suffix cap also reduced taste fit, while an extra
clean-ending score bonus had no meaningful effect. None of those variants remains.

**Retained correction.** Naming briefs alone now give short roots such as `lex`, `nym`, and `nom`
a wider smooth-ending palette (`-el`, `-en`, `-on`, `-ion`, `-era`); longer naming roots receive
the restrained subset. Other product domains retain their previous morphology. Personalized
naming pages restore a two-per-exact-ending boundary in addition to the existing prefix-family
boundary, relaxing only if a genuinely constrained pool cannot fill the requested count.

Cold Auto still generates the requested ten names first. Only when that page is short or contains
a candidate below the 75 structural floor does the browser request one bounded thirty-name
offline fallback. Strong primary names keep their order; only weak or missing slots are filled,
with prefix and naming-ending diversity observed where the available pool permits it. Explicit
modes and active local-taste flows are unchanged, and no LLM, API call, or key is involved.

**Measured result.** Across 90 fixed cold Auto pages (18 briefs × 5 seeds), the visible average
quality rises **80.78 → 82.87** and sub-75 names fall **133 → 0**. Repair activates on **55/90**
pages, uses either zero or exactly thirty fallback candidates, keeps near-duplicate pairs at
**50**, and holds mean pair similarity at **0.202**. On the 100-page personalized matrix,
average quality is **85.61**, sub-75 names and prefix overflow remain **0**, near pairs are
**251**, and mean pair similarity improves **0.233 → 0.228**; mean reference affinity moves only
**-0.786 → -0.794**. The app's fixed reference-name page changes from a hard repeated
`Nymtag`/`Markix`/`Nomix` cadence to a mix including `Lexion`, `Nymion`, `Markel`, `Mintel`,
`Minten`, and `Marken`.

**Verification.** The workspace suite is **132/132**. The morphology matrix remains effectively
flat at **80.92** composite and **0.730** diversity versus the previous **80.95/0.730**, with all
**1,100/1,100** first-page and **2,200/2,200** rolling names. General-domain calibration and
holdout stay at **1,069/1,100** and **1,067/1,100** semantic names with zero cross-domain exact
collisions. WASM, TypeScript, and the production bundle build cleanly. Chromium passes all
**85** Auto pages, the 90-page cold-quality audit, the 1,000-name personalized audit,
**800/800** developer Brandable and **791/800** developer Compound names, the real feedback and
reference flows, and the duplicate-free 100-name app-brief session.

This raises the LLM-free floor; it does not turn the heuristic score into a universal beauty
judge. The remaining broad aesthetic work should be learned from real liked-versus-passed pairs,
then accepted only on held-out preference data rather than hand-tuned from a few memorable names.

---

## Phase 95 — Keep cold repair inside Auto's one-accent contract

**Bottleneck.** Phase 94 repaired weak cold Auto slots from a thirty-name fallback, but that
fallback accidentally ran the full Auto mix again. A guided thirty-name Auto pool may contain
three Respell candidates, so the repair selector could add another accent to a primary page that
already had one. The new production audit first failed on **7/90** pages, with a maximum of two
visible accents. The app's own fixed page demonstrated the quality cost directly: both
`Developr` and `Offlyne` appeared even though guided Auto promises at most one Respell accent.

**Retained correction.** The primary page remains unchanged Auto. Only the hidden repair pool is
now generated through Brandable directly; it still uses the same brief, exclusions, candidate
count, and local-only engine. This keeps repair focused on replacing structurally weak slots
instead of silently rerunning the mode schedule. No broad Respell blacklist or scorer adjustment
was added: deciding whether the remaining single `Developr` accent is aesthetically desirable
requires real preference evidence, not another hand-tuned proxy.

**Measured result.** Multi-accent repaired pages fall **7/90 → 0/90** and the maximum visible
accent falls **2 → 1**. The app-brief page replaces the second accent `Offlyne` with Brandable
`Nymera`. The trade-off is negligible and remains inside every retained gate: average structural
quality **82.87 → 82.84**, near-duplicate pairs **50 → 51**, mean pair similarity
**0.202 → 0.205**, and sub-75 names remain **0**.

**Verification.** The production build is clean. The 90-page cold audit now fails closed on any
page with multiple accents and passes all eight gates. Chromium also preserves the original
**85/85** guided Auto pages with **45/45** prompt-linked accents, plus all real App feedback,
project scoping, reference-name, persistence, Settings, and taste-export checks. This phase does
not change Rust or WASM generation.

---

## Phase 96 — Focus Respell on the product subject

**Bottleneck.** The remaining Auto accent was edit-distance-linked to the brief but could still
style the wrong part of it. Across the fixed prompt matrix, the same structurally credible yet
incidental forms repeated on every seed: `Developr` for a naming tool, `Fryend` for expense
splitting, `Companyon` for breathing, `Plannr` for workouts, `Remynder` for invoices and pets,
and `Onlyne` for a marketplace. This was a source-selection problem, not evidence that Respell's
one-transform spelling rules needed another broad mutation or name blacklist.

**Retained correction.** Prompted Respell now reuses the engine's established semantic-domain
knowledge before producing variants. When a recognized product concept exists, delivery words,
audience terms, contextually suppressed words, and unknown role nouns are excluded; unknown
briefs retain their original literal fallback. Naming briefs focus specifically on naming words,
so the app's own brief receives no Respell accent when `name` has no safe transform instead of
falling through to `Developr`. Explicit seed roots and every non-Respell mode remain unchanged.

Removing an unearned accent can expose one more same-family Brandable on a cold page. The bounded
offline repair therefore also opens when mean pair similarity exceeds **0.21**. It preserves any
earned accent and only substitutes a Brandable fallback whose structural quality is at least as
high as the name it replaces; it stops as soon as the page meets the diversity boundary. This is
still local WASM work, and the fallback remains capped at thirty candidates.

**Measured result.** The 85-page guided matrix moves from **45** prompt-linked Respell accents to
**20** product-subject accents: all 25 context/role-word cases disappear, while `Vyntage`,
`Edytor`, and `Anymal` remain available where the styled source is the product concept. Weak
context forms stay at **0** and all visible accents remain prompt-linked. On the 90-page cold
matrix, the source filter alone would raise mean pair similarity to **0.213**; the quality-neutral
diversity pass brings it to **0.207**. Visible average structural quality is **82.89**, sub-75
names remain **0**, near-duplicate pairs remain under the retained limit at **58**, and no page
contains more than one accent. Repair activates on **75/90** fixed pages.

**Verification.** The focused Rust source-selection tests cover naming, expense, breathing,
fitness, invoice, pet, marketplace, and unknown briefs. The complete Respell test family passes,
the deterministic browser preference check pins quality-neutral substitution and accent
preservation, TypeScript and the production bundle build cleanly, and both the 85-page Auto audit
and all eight 90-page cold-quality gates pass. No LLM, network call, scorer-weight change, or
per-name rejection list was introduced.

---

## Phase 97 — Teach the offline engine developer namespaces

**Bottleneck.** The product's positioning promises developer-name availability across npm,
PyPI, crates.io, GitHub, and domains, but the generator did not understand those words. Its own
brief extracted `engine, name, offline, check, developer, npm`; `npm` had no semantic expansion,
so the visible family collapsed around `Lex/Nom/Mint` and occasionally produced `Checkalias`.
A held-out wording about finding available names across registries was worse: polysemous `find`
activated the filesystem domain and returned `Pathlex`, `Scanify`, and `Fileora`.

**Measured exploration.** A broad namespace palette (`scope, handle, claim, alias, tag`) raised
semantic coverage but retained heavy joins such as `Aliasclaim` and `Markhandle`; it was rejected.
A single shared identifier palette removed those joins but caused the explicit availability brief
to collapse back to generic naming suffixes. The retained split gives registry words (`npm`,
`pypi`, `crate`, `registry`, `namespace`) the concise `scope/key/tag/alias/slug` family and gives
`available/availability` a separate `scope/open/clear/ready/free` family. In a recognized
namespace-naming brief, `check/find/search` can no longer masquerade as the product domain;
`engine/offline` remain available for unknown briefs but are delivery context beside a known one.

**Measured result.** On the product's five fixed cold pages, visible namespace-root names rise
**5/50 → 17/50**, distinct names rise **18 → 21**, and mean pair similarity falls
**0.201 → 0.175**. Structural quality deliberately trades a small amount of suffix-score proxy
for meaning and variety, moving **86.45 → 85.61** while staying above the focused 85 floor. The
broader availability wording goes from **37** visible filesystem-context leaks to **0** and every
seed now contains `Scopekey` or `Scopetag`. Across all three focused briefs, namespace coverage is
**17/50**, **19/50**, and **15/50**; quality is **85.61**, **85.22**, and **85.13**; mean
similarity is **0.175**, **0.161**, and **0.178**.

The full 90-page cold matrix remains inside every retained gate: visible quality is **82.84**,
sub-75 names remain **0**, near-duplicate pairs improve **58 → 52**, mean pair similarity improves
**0.207 → 0.205**, and no page has more than one accent. The original developer-naming wording is
byte-for-byte unchanged because it does not mention a registry or namespace.

**Verification.** Two Rust regressions pin namespace expansion, contextual polysemy handling, and
the unknown-brief fallback. The new fifteen-page production browser audit requires a namespace
concept on every seed, at least 30% namespace-root names, zero delivery/filesystem leakage, no
sub-75 names, at least 85 average quality, at most 0.19 mean similarity, and at least twenty
distinct names per brief. Existing **85/85** guided Auto pages, all eight 90-page cold gates,
and the developer-domain browser matrix (**800/800 Brandable**, **791/800 Compound**) remain green.
No LLM, network call, scorer-weight change, or final-name blacklist was added.

---

## Phase 98 — Make the cross-domain collision gate explain its failures

**Bottleneck.** The broad 48-domain audit had become red on the committed baseline: **22** exact
domain-pair collisions exceeded a historical fixed cap of **20**. Blindly raising that integer
would hide future regressions, while forcing the generator below it would penalize deliberate
semantic overlap such as generic naming versus developer naming, fitness versus pet care, or
travel versus delivery.

**Retained correction.** The audit now traces every exact collision back through the root sets of
both briefs. A pair is explained only when the final name visibly begins or ends with a root that
both domains intentionally share; otherwise it fails immediately. Explained collisions retain a
separate normalized cap of **1% of all audited names**, replacing the stale corpus-size-dependent
integer. Composite, list diversity, per-domain seed uniqueness, short-page, and weak-context gates
remain unchanged.

**Measured result and verification.** All current **22/2,400** collision pairs are explained by a
shared semantic root and unexplained collisions are **0**. Examples include `Lexia` from the
shared naming family, `Vitalio` from `vital`, and `Routeora` from `route`; unrelated same-string
collisions would still fail. The total remains below the normalized **24-pair** ceiling. The full
audit is green at **80.61** composite, **0.730** diversity, **47.5%** average five-seed domain
uniqueness, **2,400/2,400** names, and zero weak context roots/forms. This phase changes the
regression oracle only; production generation and every name remain byte-for-byte unchanged.

---

## Phase 99 — Separate real morphology artifacts from semantic lookalikes

**Bottleneck.** The rolling morphology report still named `Feelink` as one collapsed consonant
metaphor seam in 2,200 names. That diagnosis was false: the journaling brief intentionally joined
the distinct semantic roots `feel + ink`; the detector later reinterpreted the same spelling as a
hypothetical collapsed `feel + link`. Production's actual metaphor join already preserves that
consonant boundary as `Feellink`.

**Retained correction.** The audit now calculates semantic-group coverage before classifying a
seam. A spelling that visibly covers two prompt concepts is reported as a semantic lookalike, not
as evidence that the root-plus-metaphor path swallowed a consonant. Real first-page and rolling
metaphor seam counts are now hard zero gates, and a focused regression pins `feel + link` to the
fully preserved `Feellink` form.

**Measured result.** The same unchanged production corpus now reports **0/1,100** fixed and
**0/2,200** rolling collapsed consonant metaphor seams, with `Feelink` transparently listed as the
sole non-artifact lookalike. All **1,100/1,100** fixed and **2,200/2,200** rolling names remain
available at **80.92** composite and **0.730** diversity. This phase changes the audit and one
regression assertion only; generated names are byte-for-byte unchanged.

---

## Phase 100 — Keep semantic Brandable above its structural floor

**Bottleneck.** The app's own deterministic 100-name Brandable session started strongly but let
the weak candidate tail surface after repeated exclusions: five names fell below the web app's
existing 75-point quality boundary, with `Mintora` at **69**, `Minton` at **72**, and
`Aliaspeak` at **64**. The broad morphology audit did not measure continuation quality, so it
reported full capacity without exposing that decline. Environment-variable naming showed the
same source problem more sharply through low-scoring `Value*` forms.

**Retained correction.** Prompt-derived Brandable candidates are still all generated and ranked,
but candidates at or above **75** now form the selectable pool whenever they can fill a page.
Below-floor candidates remain ordered as a last-resort capacity fallback rather than being
deleted. Continuation pages search an eight-page pool because earlier exclusions have consumed
the strongest forms. Inside that qualified pool, non-naming semantic pages spend eight additional
MMR points on shape diversity and seed jitter rises from **1.2x to 1.5x**, recovering variety
without reopening the weak tail. Naming first pages retain their Phase 97 selection profile and
adopt the floor on continuation, preserving the npm/registry contract. The environment family
replaces generic `value/setting` with the concise technical roots `var/param`.

**Measured result.** The product brief now sustains **100/100** fresh names with **0** below 75;
the environment brief does the same and its five-seed Brandable composite rises to **85.74**.
Across the morphology matrix, fixed quality rises **80.92 → 83.16** and diversity
**0.730 → 0.737**, with a minimum of **75** and **0/1,100** failures. All rolling sessions retain
**2,200/2,200** names at **81.83** average, minimum **75**, and **0/2,200** failures. The broad
48-domain audit rises **80.61 → 83.09** composite while retaining **0.726** diversity,
**47.2%** five-seed uniqueness, **23/2,400** explained collisions, and zero unexplained ones.
General-domain calibration and holdout each keep **1,076/1,100** semantic names, and the held-out
developer matrix keeps **1,587/1,600 (99.2%)** semantic names.

**Verification boundary.** The strengthened morphology audit now fails on any sub-75 fixed or
rolling name and on any lost 100-name capacity. The product's exact npm/crates.io brief is also
pinned by the unit session regression. No LLM, network call, final-name blacklist, or scorer
weight retraining was added.

---

## Phase 101 — Keep local taste attached to the brief

**Bottleneck.** Phase 100 removed the weak structural tail, but the browser's personalized
60-to-10 selection could still optimize a preferred word shape by discarding the brief's more
specific concepts. Across the retained 100-page matrix, the npm/crates.io product brief fell from
**56/200** specialized names in the engine's first ten to **37/200** after taste selection. The
Rust/log brief fell **28/200 → 15/200**, with pages collapsing into high-scoring but generic
`Byteix`, `Nodeia`, and `Crateio` families.

**Rejected alternatives.** A positional bonus for the engine's existing order reduced near pairs
**260 → 246** but pushed npm/crates.io meaning down again to **30/200**; output position was not a
reliable relevance signal and was removed. A **0.35** concept bonus reached **80/200** namespace
and **25/200** log names, but lowered average structural quality to **85.07**, below the retained
**85.2** gate. It was also removed.

**Retained correction.** The existing Rust semantic groups now expose one batched WASM signal:
how many distinct brief concepts each generated name visibly carries. Active local taste adds a
bounded **0.20** preference when a candidate carries one additional concept. The bonus cannot
accumulate for three-root literal mashups, cannot rescue a sub-75 name, and is absent for cold
pages and non-Big-Tech styles. No semantic lexicon or generator ordering changed.

**Measured result.** Personalized npm/crates.io meaning rises **37 → 58/200** and Rust/log meaning
**15 → 20/200**; the other three audited domains hold at **200/200**, **160/200**, and **200/200**.
Across all 1,000 selected names, specialized coverage rises **612 → 638** and near-duplicate pairs
fall **260 → 247**. The trade remains bounded: structural quality **85.71 → 85.50**, reference
affinity **-0.750 → -0.753**, mean pair similarity **0.223 → 0.226**, with zero sub-75 names and
zero visible prefix overflow. The production audit now fails if personalization retains less than
70% of the engine first page's specialized meaning on any prompt.

**Verification.** The workspace suite is **137/137** and the deterministic preference harness
pins the multi-concept tie-break. WASM and the production bundle build cleanly. Chromium passes
the 1,000-name personalized matrix, real feedback/reference/export flow, all 90 cold Auto pages,
all 85 guided Auto pages, the fifteen-page namespace gate, and the duplicate-free 100-name brief
session. No LLM, network call, hidden name blacklist, or cold-start output change was added.

---

## Phase 102 — Break personalized suffix walls outside naming briefs

**Bottleneck.** Phase 101 kept personalized names attached to the brief, but the selector only
limited exact endings for naming products. Other projects could still show mechanically uniform
pages: one Rust/log profile selected five `-ia` and five `-io` forms such as `Byteia`, `Crateia`,
`Stackia`, and `Kitia`. Across the 100-page matrix, names beyond the first two copies of one exact
ending totaled **232/1,000**, despite zero prefix-family overflow.

**Rejected alternative.** Applying the naming brief's strict two-per-ending cap everywhere
removed all **232** excess forms and cut near pairs **247 → 177**, but structural quality fell to
**85.17** and reference affinity to **-0.826**, missing both retained gates. The stricter global
rule was removed rather than weakening those gates.

**Retained correction.** Personalized naming briefs keep their existing **20%** exact-ending
limit. Every other personalized brief now uses a gentler **30%** boundary: at ten visible names,
no more than three may share `-ia`, `-io`, `-ix`, or another exact ending. Constrained pools still
retain the existing deferred fallback, so a diversity preference cannot falsely shorten a page.
Cold generation, engine ranking, and non-personalized modes are unchanged.

**Measured result.** Exact-ending excess falls **232 → 135/1,000 (42%)**, near-duplicate pairs
**247 → 213**, and mean pair similarity **0.226 → 0.206**. No audited page contains four copies of
one ending. Structural quality holds **85.50 → 85.46**, reference affinity remains inside its gate
at **-0.778**, specialized-brief retention is unchanged, and sub-75 names plus prefix overflow
remain zero. The production audit now caps three-name ending excess at 150, near pairs at 230,
mean similarity at 0.22, and fails on any four-copy ending family.

**Verification.** The deterministic preference harness pins both boundaries: two copies for a
naming page and three elsewhere. The 1,000-name Chromium matrix passes all strengthened ending,
quality, taste, semantic, family, and capacity gates. TypeScript and the production bundle build
cleanly, and the real browser feedback/reference flow still selects ten names from its expanded
offline pool. No LLM, network call, new name rejection list, or Rust generation change was added.

---

## Phase 103 — Stop personalized pagination from burning unseen names

**Bottleneck.** The browser showed ten personalized names but requested a hidden pool of up to
sixty, then wrote the entire pool into recent history. A single page could therefore consume
fifty names the user never saw. In four deterministic 100-name sessions, that policy exhausted
every run early, with a minimum of 60 visible names and **1,332** history entries for only
**240** displayed names. Recording only visible names improved the same baseline to 70 names per
run, but exposed a second coupling: the semantic continuation threshold scaled from the hidden
request count, so a 60-candidate pool waited for 120 prior names before opening a broader lane.

**Retained correction.** Recent history now records only the names actually displayed. Hidden
shortlist candidates remain eligible for later pages, while already shown names are still
excluded case-insensitively. Semantic continuation follows the product's visible page rhythm:
after twenty shown names for a multi-concept brief, or ten for a single-concept brief, regardless
of whether local taste internally requests ten or sixty candidates. The generator still returns
a full sixty-name pool for personalized ranking, and no LLM, network call, scorer-weight change,
or final-name blacklist was added.

**Measured result.** The retained visible-only policy reaches **100/100** names in all four
deterministic reference-profile sessions, with **400** displayed names and exactly **400** history
entries. Every run has 100 unique names, all **400/400** remain visibly tied to the brief, no name
falls below 75, and every page retains the full 60-candidate ranking pool. Mean structural quality
is **85.18** and the tenth-page mean is **83.75**. The real Chromium UI also reaches 100 names with
zero repeats, no false exhaustion, and a recent-history count exactly equal to the 100 visible
cards.

**Verification.** A focused regression proves that a 60-candidate internal request opens the
multi-concept continuation lane after twenty visible exclusions. The workspace suite is
**138/138**. Chromium passes the new rolling personalized A/B and real-UI gate, the feedback and
reference flow, all 90 cold Auto pages, all 85 guided Auto pages, the fifteen-page namespace
matrix, and the duplicate-free 100-name brief session. WASM and the production bundle build
cleanly.

---

## Phase 104 — Make fresh personalized sessions genuinely different

**Bottleneck.** The local taste selector fully re-sorted its hidden candidate pool with a
seed-independent score. Engine order changed slightly across seeds, but most five-seed pages were
still identical after personalization: across twenty prompt/reference combinations, the unions
contained only **250/1,000** names and **57/80** retry pages exactly reproduced an earlier page in
their group. This made a fresh attempt feel deterministic even though every returned name was
structurally valid.

**A/B boundary.** A stable name-and-session hash now contributes only a small bounded tie-break
after learned shape, engine quality, and brief-concept coverage. A **0.08** weight raised the union
to 278 names and reduced exact repeated pages to 10. The retained **0.12** weight reached 288 and
8. A stronger **0.16** trial reached 311 and 2, but reduced specialized Rust/log names from
20/200 to 18/200 and failed the existing 70% semantic-retention gate, so it was removed.

**Retained correction.** One fresh manual generation receives a new local selection salt; its
infinite-scroll continuation keeps the same salt so the session has a coherent taste direction.
An explicitly supplied seed remains deterministic. The bounded contribution is at most ±0.06,
cannot bypass the 75-point floor, cannot accumulate brief bonuses, and still passes the visible
prefix and ending-family caps. Cold generation and the Rust engine are unchanged.

**Measured result.** Five-seed personalized first-page coverage rises **250 → 288** names
(**+15.2%**) and exact repeated retries fall **57 → 8 (−86%)**. Across the same 1,000 selected
names, structural quality holds at **85.39**, reference affinity at **−0.778**, sub-75 names and
prefix overflow remain zero, exact-ending excess is **134**, near pairs are **220**, and mean
pair similarity is **0.208**. All five brief families retain their semantic gate. In the rolling
audit, all four personalized sessions still reach 100 unique, prompt-linked names; mean quality
is **85.27** and tenth-page quality **83.60**.

**Verification.** The deterministic preference smoke test proves that one salt repeats exactly
while a new salt explores another shortlist. The 1,000-name Chromium matrix now gates at least
30 additional cross-seed names and at most ten exact repeated pages. The real 100-name UI,
feedback/reference/export flow, TypeScript build, and production Vite bundle are green. No LLM,
network call, new corpus entry, scorer retraining, or hidden name blacklist was added.

---

## Phase 105 — Keep personalized pages from becoming suffix templates

**Bottleneck.** Exact-ending caps prevented four copies of `-ia` or `-io`, but could not see a
page assembled from different generic endings. The fixed personalized matrix still contained
**649/1,000** direct root-plus-suffix names such as `Byteia`, `Crateio`, `Shieldio`, and
`Lockia`. On **42/100** pages at least eight cards used that construction, and **14** pages were
entirely suffix templates despite passing every structural and exact-ending gate.

**A/B boundary.** The selector now recognizes only the narrow production pattern: a Brandable
candidate carrying exactly one brief concept and ending in one of the explicit semantic/naming
suffixes. An **80%** visible-page cap reduced the total to 614 and removed every suffix-only page.
A stricter **70%** trial reached 572 and removed all eight-form pages, but structural quality fell
to **85.14** and reference affinity to **−0.823**, failing both retained gates. It was removed.

**Retained correction.** When a strong expanded pool permits it, a ten-name personalized page
now reserves at least two cards for another construction: a semantic join, readable metaphor, or
other non-suffix form. Direct suffix candidates beyond eight are deferred, not rejected; the
existing constrained-pool fallback still fills the requested count. The rule cannot admit a
sub-75 name and does not affect cold generation, Compound, Respell, Sci-Fi, Fantasy, or the Rust
engine.

**Measured result.** Direct suffix forms move **649 → 614**, suffix-only pages **14 → 0**, and no
page exceeds eight. Exact-ending excess improves **134 → 122**, near pairs **220 → 203**, and mean
pair similarity **0.208 → 0.206**. Structural quality holds at **85.24**, reference affinity at
**−0.800**, and sub-75 names plus prefix overflow remain zero. Specialized npm/crates.io names
rise **56 → 65/200** and Rust/log names **20 → 29/200**; all other semantic families retain their
previous gate. Fresh-session variety remains 288 names with only eight exact retry pages.

**Verification.** The deterministic preference smoke test requires a full ten-name page with no
more than eight direct suffix forms. Chromium gates all 1,000 personalized names, and all four
rolling sessions still reach 100 unique prompt-linked names at **85.25** mean and **83.63**
tenth-page quality. The real 100-name UI, feedback/reference/export flow, TypeScript build, and
production bundle are green. No LLM, network call, corpus addition, scorer retraining, or hidden
name blacklist was added.

---

## Phase 106 — Let strong two-part taste influence guided Auto

**Bottleneck.** Local taste already learned compound shape and source mode, but guided Auto gave
its ranker no Compound candidates. With explicit two-part references `GitHub, DoorDash, YouTube`,
twenty-five fixed pages selected **0/250** Compound cards, reached only **81** distinct names, and
had **−1.548** mean affinity. The profile could describe what the user liked but could not choose
that family unless the user manually left Auto.

**A/B boundary.** Adding twenty Compound candidates proved the missing-family hypothesis:
affinity jumped to **−0.390** and uniqueness to 171, but **234/250** cards became Compound and
quality fell **85.04 → 82.31**. Five candidates still lowered quality to **84.76** while surfacing
45 Compound cards. Both variants were removed. Three candidates preserve quality while giving
the judge enough mode-relevant alternatives.

**Retained correction.** A positive profile must be at least **75% visibly two-part** before
guided Big-tech Auto opens a Compound accent pool. At the normal ten-name page size that pool is
exactly three candidates beside the existing sixty-candidate personalized pool. They receive no
quota: the normal local scorer, 75-point floor, semantic bonus, and family caps decide whether
any appear. Explicit Compound remains the route for an all-Compound page. Closed compounds are
not guessed from arbitrary spelling; the trigger uses source mode or a visible camel-case seam.

**Measured result.** Across the 25 targeted pages, Compound cards move **0 → 30/250**, affinity
**−1.548 → −1.387**, and distinct names **81 → 95**. Structural quality is effectively unchanged
at **85.04 → 85.03**, prompt-unlinked names improve **5 → 4**, and sub-75 names remain zero. No
page can receive more than the three supplemental candidates. The real production UI shows three
Compound accents for the security brief while still recording only its ten displayed names.

**Stronger evidence gate.** The general 1,000-name personalized matrix now compares local
selection with raw engine order instead of relying only on an absolute affinity floor. Mean
affinity improves **−1.138 → −0.800 (+0.337)** and structural quality **83.69 → 85.24**. Every one
of the four established reference families gains at least **0.228** affinity; permanent gates
require +0.30 overall and +0.20 per family.

**Verification.** The preference smoke test pins the three-candidate trigger and proves
single-part profiles stay Brandable-first. The new 25-page mode audit gates quality, affinity,
mode share, vocabulary, semantic coverage, and the structural floor. Chromium also passes the
1,000-name taste matrix, all four 100-name rolling sessions, all 90 cold Auto pages, and the full
production feedback/reference/export flow. TypeScript and the production bundle build cleanly.
No LLM, network call, corpus addition, scorer retraining, or hidden name blacklist was added.

---

## Phase 107 — Let cold Auto earn one non-template form

**Bottleneck.** The developer-namespace pages still passed every structural gate while looking
mechanical. Across the fifteen fixed pages, **99/150** names were direct `Lex/Nom/Mark/Mint` plus
suffix forms and the rest were compact namespace joins; there was no third construction. The
three brief groups exposed only **63** distinct names, with **85.30** mean structural quality and
**0.173** within-page similarity. A numerically strong page could therefore still read as ten
variations of the same naming template.

**Rejected alternatives.** Opening the main first-page generator to a 15% general metaphor lane
raised one five-seed union from 21 to 28 names, but dropped namespace coverage to **13/50** on one
brief and structural quality to **84.39** on another. A 10% lane still produced `Markpath`, missed
the namespace gate, and lowered two briefs below 85. Replacing `mark/mint` with `verb/onom` only
moved the repetition wall: similarity reached **0.203** and quality fell as low as **84.15**;
single-root variants also missed retained gates. A cold Compound fallback produced `PrimeMint`
and `PrimeMark` while lowering one namespace group to **14/50**, so it was removed.

**A/B boundary.** A separate internal Brandable pool proved safer than changing the main mix.
Three candidates surfaced a strong alternative on 4/15 pages; five reached 8/15; the retained
eight-candidate pool reached 9/15 while improving the aggregate quality/diversity balance. A
twelve-candidate trial reached 12/15 but began converging on repeated `Nomnova` forms, worsened
mean similarity from **0.168 to 0.171**, and lowered one brief below its baseline quality, so it
was removed.

**Retained correction.** When guided Auto has a brief but cannot earn a product-linked Respell,
it asks the Rust engine for eight semantic root-plus-metaphor candidates from a restrained set of
safe second halves. A candidate must visibly carry the brief, score at least **85**, and beat the
other candidates before at most one can enter the page. Respell keeps first refusal, the new form
remains Brandable rather than inventing another user-facing mode, and the normal cold repair plus
local-taste selectors still make the final decision. No broad generator weight, scorer weight,
network call, LLM, or final-name blacklist changed.

**Measured result.** In the fifteen namespace pages, direct suffix forms fall **99 → 93**, nine
quality-gated metaphor forms appear (`Keyflow`, `Tagwave`, `Keyflux`, `Nombeam`), namespace-root
coverage rises **51 → 54**, and the three five-seed unions grow **63 → 69** names. Mean structural
quality improves **85.30 → 85.62** and similarity **0.173 → 0.168**. Across all 90 cold Auto pages,
repaired quality rises **82.85 → 83.02**, pages needing repair fall **42 → 38**, near-duplicate
pairs fall **47 → 43**, and no selected name falls below 75.

The 1,000-name personalized matrix also improves: quality **85.24 → 85.33**, measured reference
affinity **-0.800 → -0.797**, direct suffix forms **614 → 610**, near pairs **203 → 198**, mean
similarity **0.206 → 0.203**, fresh-session coverage **288 → 300**, and exact repeated retry pages
**8 → 7**. All four rolling personalized sessions still reach 100 unique prompt-linked names;
mean quality is **85.29** and tenth-page quality **84.69**.

**Verification.** The new Rust invariant pins safe endings and brief coverage; the workspace suite
is **139/139**. The strengthened namespace audit requires at least two non-template metaphor forms
per brief alongside its existing semantic and structural gates. Chromium passes all 90 cold Auto
pages, all 85 guided pages, the 1,000-name taste matrix, four 100-name personalized sessions, the
real feedback/reference/export flow, and the 100-name brief UI. The 1,100/2,200-name morphology
matrices, 2,400-name cross-domain audit, 800/800 developer Brandable matrix, 791/800 Compound
matrix, WASM build, TypeScript, and production bundle are green.

---

## Phase 108 — Fill cold Auto seed blind spots

**Bottleneck.** Phase 107's bounded pool improved construction variety without weakening the
main generator, but it found an 85+ metaphor accent on only **9/15** fixed namespace pages. The
remaining six were deterministic seed blind spots rather than missing semantics: for example,
the product's own seed-42 page understood the brief, but its best eight-candidate metaphor scored
only **81.8** and therefore correctly stayed hidden.

**Measured search and rejected alternatives.** A dedicated browser sweep compared 74 deterministic
offsets against the six missed pages. Offset **16** was the only candidate to fill **6/6** gaps;
its fallback set retained five distinct forms (`Keyloom`, `Lexwave`, `Keylink`, `Nombeam`,
`Tagseed`). Replacing the primary seed wholesale was not safe. Offsets 3, 64, and 65,537 reached
13/15 pages, but changed already-good pages, moved namespace coverage down to 52–54, direct suffix
forms between 90–95, and cold repair counts as high as 41. Applying the second pool on later pages
also lowered personalized tenth-page quality to **83.21**, so both broader variants were removed.

**Retained correction.** The original eight-candidate pool still gets first refusal. Only when it
has no brief-linked 85+ candidate, there is no safe Respell, and the exclusion history is empty,
Auto tries the same bounded pool at `seed + 16` modulo 2^32. At most one winning Brandable enters
the normal selector. The rule is deterministic, limited to a fresh first page, and neither lowers
the quality floor nor changes continuation sessions, scorer weights, or the Rust generator.

**Measured result.** Every one of the fifteen namespace pages now earns exactly one strong
non-template form, up from **9/15**. Direct suffix forms improve **93 → 91**, namespace markers
remain **54**, the three five-seed unions grow **69 → 73**, mean quality rises **85.62 → 85.96**,
and similarity improves **0.168 → 0.167**. Across 90 cold pages, pages needing repair fall
**38 → 37**, repaired quality rises **83.02 → 83.04**, mean similarity improves **0.203 → 0.201**,
and every selected name remains at or above 75.

The 1,000-name personalized matrix also moves in the intended direction: selected quality
**85.33 → 85.40**, affinity **-0.797 → -0.793**, direct suffix forms **610 → 608**, near pairs
**198 → 195**, similarity **0.203 → 0.202**, and fresh-session coverage **300 → 306**. All four
visible-only sessions still reach 100 unique, prompt-linked names, with **85.28** mean quality and
**84.36** tenth-page quality. The mode-aware taste matrix grows **85 → 99** unique names and
reduces unlinked forms **5 → 4** while preserving its quality and affinity gates.

**Verification.** The namespace audit now requires one qualifying metaphor on every fixed page.
The 74-offset sweep remains as a reproducible diagnostic rather than a production gate. All 90
cold pages, all 85 guided pages, the 1,000-name taste matrix, four 100-name personalized sessions,
mode-aware taste, feedback/reference/export behavior, TypeScript, and the production bundle pass.
The Rust engine is unchanged; Phase 107's **139/139** unit suite and morphology, cross-domain, and
developer-domain gates therefore remain the current core baseline.

---

## Phase 109 — Let a second strong form replace a template

**Bottleneck.** Phase 108 guaranteed one non-template Brandable on every namespace page, but the
remaining page could still read as one exception inside a suffix wall. Across the fifteen fixed
pages, **91/150** names were still direct `Lex/Nom/Mark/Mint` suffix forms. The product's own
seed-42 page had six of them alongside `Keyloom`; all ten names were structurally strong, so the
normal weak/similarity repair correctly had no reason to open a different construction.

**Rejected alternatives.** A direct-suffix cap was numerically attractive but aesthetically weak.
With the normal 30-name fallback, a five-form cap could be reached on only **85/90** cold pages
without lowering an individual replacement's quality; on the product page, the best alternative
was `Marktag` at **84.8** versus an **86.1** suffix card. A 60-name fallback reached 90/90 and moved
mean quality/similarity in the right direction, but its visible product change was merely
`Nomify → Nomtag`, so the larger pool and hard quota were rejected. Blindly merging the top two
metaphors was also unsafe: it produced same-tail pairs such as `Keyflow/Tagflow` and displaced the
only `Scope` form on one namespace page.

**Retained correction.** The original Phase 108 primary metaphor still enters unchanged. The
eight-candidate pool may now identify one second candidate only when its curated ending differs
from the primary and it also scores at least 85. With no Respell present, that candidate competes
only against direct, single-concept suffix cards and enters only if its structural quality is at
least as high as the card it replaces. Multi-concept forms are protected, page size stays ten,
and the independent seed fallback remains fresh-first-page only; continuation pages keep using
their existing primary pool.
Guided forms carry explicit construction/rank metadata so audits and future taste exports can
distinguish them from ordinary Brandable names that happen to end in `flow`, `lab`, or `signal`.

**Measured result.** In the fifteen namespace pages, guided metaphor forms rise **15 → 23** while
direct suffix forms fall **91 → 86**. Namespace markers improve **54 → 55**, the three five-seed
unions grow **73 → 77**, mean quality rises **85.96 → 86.18**, and mean similarity improves
**0.167 → 0.160**. The product's own fixed page replaces `Mintel` with `Tagsignal` while retaining
`Keyscope`, `Keyloom`, and both multi-concept alias forms.

Across 90 cold pages, repair activation falls **37 → 34**, repaired quality rises
**83.04 → 83.11**, near pairs improve **44 → 43**, and similarity **0.201 → 0.200** with no sub-75
selection. The 1,000-name personalized matrix improves quality **85.40 → 85.45**, affinity
**-0.793 → -0.791**, direct suffix forms **608 → 605**, near pairs **195 → 193**, similarity
**0.202 → 0.201**, and fresh-session coverage **306 → 312**. Exact repeated retries remain seven.
The mode-aware matrix reaches **100** unique names, up from 99. All four personalized sessions
still reach 100 unique prompt-linked names with unchanged **85.28** mean and **84.36** tenth-page
quality.

**Verification.** The 85-page Auto audit now reads explicit construction metadata and requires at
most two 85+ guided metaphors with distinct curated endings; it observes **56** forms, **36** unique,
and only ten unique quality-neutral secondary forms (`Dreampeak`, `Kinflux`, `Pausebeam`,
`Pulseflux`, `Pushlab`, `Tagflow`, `Tagsignal`, `Tallyflux`, `Tallyglow`, `Traceseed`). The namespace
gate requires one or two on every fixed page. All cold, Auto, namespace, taste, mode-aware taste,
four-session, feedback/export, and developer-domain browser gates pass. TypeScript and the
production bundle build cleanly. The Rust engine/WASM are unchanged, so the **139/139** core suite
and Phase 108's morphology/cross-domain baselines remain applicable.

---

## Phase 110 — Let the fallback fill one missing strong form

**Bottleneck and measurement correction.** Phase 109 found a safe second-form rule, but only
**8/15** namespace pages had two qualifying candidates in their primary eight-name pool. The
independent `seed + 16` pool already rescued pages with zero candidates, yet it was never asked to
complete a page with exactly one. The new construction metadata also exposed an audit undercount:
when a guided candidate duplicated a normal Brandable spelling, merge kept one visible copy but
dropped its provenance. With that metadata preserved and no name change, the true Phase 109
baseline is **62** guided forms / **38** unique across 85 pages, not the previously reported 56/36.

**Retained correction.** On a fresh page with no safe Respell, the primary metaphor pool still gets
first refusal. If it returns fewer than two candidates, the same deterministic fallback pool may
fill only the missing slot. Exact names and metaphor endings are deduplicated before the existing
quality-neutral replacement rule runs; no third form can enter. Pages with exclusion history do
not open the independent pool, so the four proven 100-name continuation paths keep their prior
behavior. When normal Brandable and guided pools produce the same spelling, the retained card now
keeps explicit guided construction/rank metadata for honest audits and future taste evidence.

**Measured result.** Across 85 guided pages, correctly observed forms rise **62 → 72** and unique
forms **38 → 42**; unique secondary forms grow **10 → 17**. In the fifteen namespace pages,
guided forms improve **23 → 26**, direct suffix forms **86 → 83**, namespace markers **55 → 57**,
and the three five-seed unions **77 → 80**. Mean quality rises **86.18 → 86.25** and similarity
improves **0.160 → 0.159**. The product's own seed-42 page is unchanged because its primary pool
already supplied both `Keyloom` and `Tagsignal`; the fallback changes only pages missing a second
qualified construction.

Across 90 cold pages, direct quality improves **83.02 → 83.10**, repaired quality
**83.11 → 83.17**, and raw sub-75 candidates fall **9 → 8**. Repair activation stays 34 pages and
near pairs stay 43; mean similarity moves slightly **0.200 → 0.201**, remaining better than the
pre-Phase-109 baseline and below the 0.21 gate. The 1,000-name taste matrix improves quality
**85.45 → 85.47**, affinity **-0.791 → -0.789**, suffix forms **605 → 604**, fresh-session coverage
**312 → 314**, and exact repeated retries **7 → 6**; near pairs and similarity hold at 193/0.201.
Specialized namespace retention rises **69 → 70/200**. Mode-aware taste remains at 100 unique
names, while all four visible-only sessions retain the same **85.28** mean, **84.36** tenth-page
quality, and 100/100 unique prompt-linked names.

**Verification.** The diagnostic Auto audit now reports page-level violation reasons rather than
only a total, and validates contiguous construction ranks after deduplication. All 85 Auto pages,
fifteen namespace pages, 90 cold pages, the 1,000-name taste matrix, four 100-name sessions,
mode-aware taste, and real feedback/export flow pass. TypeScript and the production bundle build
cleanly. The Rust engine/WASM remain unchanged, so the **139/139** core and prior morphology,
cross-domain, and explicit developer-domain baselines remain applicable.

---

## Phase 111 — Put a stronger name first without changing the set

**Bottleneck.** Phases 107–110 improved the ten visible names, but the order still gave users a
mechanical first impression. On the product's fixed seed-42 page, `Keyloom` scored **92.5** and
`Tagsignal` was already visible, yet `Lexify` remained the lead card. Across 90 repaired cold Auto
pages, the first card averaged **82.90** structural quality, trailed the best visible card by
**6.43** points, was a direct suffix form on **41/90** pages, and was guided on only 3/90. A strong
set could therefore look weaker than it was before the user read past card one.

**Rejected ordering rules.** Sorting by structural quality looked compelling in isolation: first
quality reached **89.32** and regret reached zero. It also made the problem more mechanical,
raising suffix-first pages **41 → 59** and lowering first-card concept coverage **1.17 → 1.09**.
Blind guided-first reduced suffix leads to 14 and raised quality to 85.47, but coverage fell to
1.07. Merely ensuring a guided form in the first three preserved all metrics, yet left the product
page unchanged because `Tagsignal` was already second while the stronger `Keyloom` stayed sixth.
All three variants were rejected.

**Retained correction.** Fresh, unpersonalized Auto pages may promote the strongest existing
guided form to card one only when it scores at least as high as the current lead and represents at
least as many brief concepts. The selector only moves one card; it cannot add, remove, or rescore a
name. Local taste keeps full ownership after the user supplies references/feedback, AI Studio is
unchanged, and Load more preserves its continuation order. A focused regression pins promotion,
exact-set preservation, quality protection, and concept-coverage protection.

**Measured result.** The guarded rule reorders **37/90** cold pages. Mean first-card quality rises
**82.90 → 85.05**, regret falls **6.43 → 4.27**, guided leads rise **3 → 38**, guided presence in the
first row rises **11 → 40**, and suffix-first pages fall **41 → 23**. Mean first-card coverage stays
exactly **1.17**. The product page now opens `Keyloom, Lexify, Tagsignal, Keyscope, ...`; other fixed
pages gain leads such as `Tagseed`, `Tagwave`, `Nombeam`, and `Keylink`. Every page retains the exact
same ten names, so aggregate quality, diversity, namespace coverage, and long-session capacity are
unchanged by construction.

**Verification.** The new 90-page first-impression sweep records all rejected and retained A/B
strategies. The cold production audit now requires exact-set preservation and zero first-card
quality/coverage regressions; all gates pass. The fifteen-page namespace audit passes with the
user-visible order, the deterministic preference smoke suite passes all three new lead-order
regressions, and all 85 Auto pages, the 1,000-name taste matrix, and the real feedback/reference/
export flow remain green. TypeScript and the production bundle build cleanly. No Rust/WASM,
generator score, candidate pool, personalized ranker, or AI path changed.

---

## Phase 112 — Replace only the remaining weak suffix leads

**Bottleneck.** Phase 111 left **23/90** cold pages opening with a direct suffix. Thirteen had no
guided candidate in the repaired set; ten had a guided form whose structural score was below the
lead. None were blocked by concept coverage. The guarded guided rule was therefore already using
all safe candidates it knew how to recognize, while clean main-pool semantic joins remained
eligible nowhere simply because they lacked guided construction metadata.

**Rejected breadth and calibrated margin.** Promoting the strongest qualified non-suffix on every
page looked excellent numerically—first quality **86.96**, suffix-first 16, coverage 1.22—but
changed **70/90** pages and replaced already-good leads such as `Retroboard → Keyshelf` and
`Dashnode → Fluxkit`. Restricting it to the remaining suffix leads produced seven extra changes,
but included the marginal **84.8 → 85.1** `Draftify → Inklink`. A one- and two-point margin retained
the same other six pages in the fixed matrix; the stricter two-point rule was kept as the safer
future boundary.

**Retained correction.** Guided forms still get first refusal under Phase 111's no-loss rule. Only
if no guided promotion occurs and the current first card is a direct single-concept suffix may a
broader non-suffix card compete. It must preserve or improve concept coverage and beat the lead by
at least **2.0** structural points. Existing non-suffix leads are never reconsidered. The operation
still moves one existing card only, and remains cold/fresh Auto-only: local taste, AI Studio, and
Load more do not use it.

**Measured result.** Relative to Phase 111, total reordered pages rise **37 → 43**, first-card
quality **85.05 → 85.35**, regret **4.27 → 3.97**, and suffix-first pages **23 → 17**. Mean first-card
coverage improves **1.17 → 1.20**; guided leads/top-three presence stay 38/40 because this phase
fills only their remaining gap. The six additional page changes are five distinct improvements:
`Marken → Keyseed`, `Vaultify → Guardbond` on two seeds, `Stashify → Bufferlab`,
`Vitalix → Taillab`, and `Marketix → Bazaarbeam`. Each wins by at least 2.4 points. The product's
`Keyloom` lead and all fifteen namespace-page sets remain unchanged.

**Verification.** The deterministic preference smoke suite now pins the two-point promotion,
marginal-difference rejection, and protection of existing non-suffix leads in addition to Phase
111's set/quality/coverage gates. The 90-page cold audit passes with **43** reordered pages, zero
set changes, zero quality/coverage regressions, and the exact prior aggregate metrics. The full
first-impression sweep, namespace audit, 1,000-name personalized matrix, and real feedback/
reference/export flow pass. TypeScript and the production bundle build cleanly. No candidate,
score, personalized order, continuation order, Rust/WASM, or AI behavior changed.

---

## Phase 113 — Let semantic near-ties beat mechanical leads

**Bottleneck and classification.** Phase 112 left **17/90** cold pages opening with a direct
suffix. Printing every remaining lead and its four strongest non-suffix alternatives separated
true pool gaps from scoring near-ties. Only three pages had a visibly stronger construction within
half a structural point: `Lexia 86.9/c1 → Keyspark 86.4/c2`,
`Moodora 88.3/c1 → Moodink 88.0/c2`, and `Boltify 89.8/c1 → Dashlab 89.3/c1`.
The other fourteen pages would require a larger quality trade or an alternative with weaker brief
coverage, so they remain unchanged until the generator can supply a genuinely stronger form.

**Calibrated boundary.** An extra-concept-only half-point rule changed the first two pages. Letting
an already quality-gated guided form use the same tolerance added only `Dashlab`. A one-point rule
also promoted `Vitalix → Fitlab`; although reasonable, it offered no coverage gain and opened a
wider future boundary, so it was rejected. The two-point trial selected the same current four
names but carried the same unnecessary future risk.

**Retained correction.** Phase 111's no-loss guided rule and Phase 112's two-point non-suffix rule
still get first refusal. Only if both decline a remaining direct suffix may a non-suffix near-tie
lead. It must stay within **0.5** structural points, never reduce concept coverage, and either add
at least one brief concept or carry explicit quality-gated guided construction metadata. Added
coverage wins the tie before structural score. The operation still reorders the existing ten-name
set only and remains fresh, cold Auto-only; personalized taste, AI Studio, and Load more do not use
it.

**Measured result.** Relative to Phase 112, reordered pages rise **43 → 46**, suffix-first pages
fall **17 → 14**, mean first-card coverage improves **1.20 → 1.22**, guided leads rise **38 → 40**,
and guided top-three presence rises **40 → 41**. Mean first-card structural quality changes only
**85.35 → 85.33** and regret **3.97 → 3.99** because the three intentional trades lose 0.3, 0.5,
and 0.5 points respectively. No page loses coverage, no trade exceeds half a point, the product's
`Keyloom` lead is unchanged, and all fifteen developer-namespace pages keep their prior visible
sets and pass their quality gates.

**Verification.** The deterministic preference suite pins the extra-concept near-tie, guided
near-tie, and over-tolerance rejection. The 90-page production audit requires exactly three
justified trades, zero unjustified quality losses, a half-point maximum loss, at least 85.3 mean
lead quality, at least 1.22 mean lead coverage, and at most fourteen suffix leads. The full
first-impression strategy sweep and verbose namespace audit pass. Candidate generation, aggregate
page quality/diversity, personalized order, continuation order, Rust/WASM, and AI behavior remain
unchanged. The 85-page Auto construction audit, 1,000-name taste matrix, and real browser
feedback/reference/export flow also pass unchanged.

---

## Phase 114 — Search only the true cold-page gaps

**Bottleneck classification.** Phase 113 left **14/90** cold pages with a direct-suffix lead. Five
were correctly owned by an earned Respell, three already used both guided-form slots, and three of
the six searchable pages had no qualifying candidate in any tested pool. A dedicated diagnostic
therefore searched 72 deterministic seed offsets only against the six real open gaps, simulating
the existing 85+ quality floor, distinct-tail rule, quality-neutral replacement, and guarded lead
selector.

**Rejected broad fallback.** Offset `+58` appeared to close three gaps, but two wins were false
economies: `Dashlab` grew an already-overflowing `Dash` family **3 → 4** and raised page similarity
by 0.016; `Bufferlab` grew `Buf` **2 → 3**. Adding `+58` to normal Auto globally improved aggregate
quality but spread new guided forms beyond the actual gaps, lowered mean lead coverage
**1.22 → 1.19**, and exposed one orphaned construction rank. Making semantic joins outrank every
guided winner recovered coverage to 1.27 but caused poor trades such as
`Kinloom 92.5 → Guardbond 81.2` and `Keyloom → Keyseed`. Both broad variants were removed.

**Retained search.** The safe sweep found two complementary pools. Offset `+13` supplies
`Kinloom 92.5` for the secure-team gap while introducing a new prefix family and reducing mean
similarity by 0.026. Offset `+521` supplies `Kitwave 89.8` for the analytics gap, also with a new
prefix and a 0.019 similarity reduction. The web app opens these two eight-candidate local pools
in parallel only after a fresh, unpersonalized briefed Auto page has completed normal generation,
quality repair, and lead ordering and still starts with a direct suffix. Any Respell or two existing
guided forms blocks the retry. A candidate must remain 85+, carry a recognized metaphor ending
and brief concept, replace a no-stronger direct suffix, avoid increasing an overflowing three-letter
prefix family, avoid increasing mean similarity, and finally pass the same guarded lead selector.
Each UI generation click now draws one random 32-bit seed and shares it across that click's local
sub-pools, so the measured offsets exist in the real app while every unseeded click still produces
a fresh page.
Local taste, Load more/recent-history sessions, AI Studio, and ordinary successful pages never open
the retry.

**Measured result.** Exactly two of ninety fixed pages change set: `Shieldora → Kinloom` and
`Surgeora → Kitwave`; their visible leads improve `Vaultio → Kinloom` and
`Dashify → Kitwave`. Relative to Phase 113, reordered pages rise **46 → 48**, mean lead quality
**85.33 → 85.41**, suffix-first pages **14 → 12**, and guided leads **40 → 42**, while mean lead
coverage holds at **1.22**. Aggregate visible quality improves **83.17 → 83.20**; near-duplicate
pairs stay 43 and mean similarity stays 0.201. Repair activation remains 34/90, the product's
`Keyloom` page is unchanged, and all fifteen developer-namespace pages retain their prior metrics
and pass.

**Verification.** The deterministic preference suite pins retry eligibility, a successful
quality-neutral swap, sub-85 rejection, Respell/two-form ownership, and overflowing-prefix
rejection. The
90-page production audit requires exactly two retry set changes, validates each removed/added card,
keeps the three Phase 113 near-ties bounded to half a point, and gates lead quality, coverage,
suffix count, near pairs, and similarity. The 72-offset diagnostic remains reproducible evidence
for both selected and rejected seeds. The 85-page Auto construction audit, fifteen-page namespace
audit, 1,000-name taste matrix, four 100-name continuation sessions, mode-aware taste matrix,
real feedback/reference/export flow, actual prompt UI, TypeScript, and production bundle all pass.

---

## Phase 115 — Recover a suppressed product function without widening Auto

**Bottleneck and rejected breadth.** Phase 114 left twelve suffix-led pages. The four genuine
construction gaps were an expense page, a cache-inspector page, and two workout-planner pages;
the rest correctly belonged to Respell or already used both guided slots. Adding inspection roots
to the ordinary concept lexicon initially looked promising (`Heapify -> Bufferlens`), but the
broad version added `Peeklink`, raised near pairs **43 -> 44**, and returned only 29 of 30 fallback
candidates on one page. A narrower `lens/scope` version was worse: suffix leads rose **12 -> 14**
and near pairs **43 -> 45**. Both variants were removed. Deeper Brandable and Compound pools were
also rejected: they surfaced structurally high but aesthetically weak forms such as `KeyFit`,
while expense/cache pair candidates either missed the 85 floor or could not beat their lead
without weakening diversity.

**Retained construction.** A separate `concept_pair` lane now exists only inside the true
cold-gap retry. It restores the otherwise-suppressed planner function with the restrained local
palette `path/pace/wise/map`, joins two distinct brief groups, and keeps both morphemes readable
with a visible CamelCase seam. The lane returns nothing when fewer than two groups exist, which is
pinned in Rust so a one-concept fallback cannot be mislabeled as two-concept. Candidates must be
85+, carry two concepts, fit one of the two guided slots, and pass the same name, prefix-family,
and mean-similarity guards as metaphor retries. A pair may replace a suffix within the existing
half-point semantic tolerance; all possible suffix replacements are tried so it can preserve an
already-full prefix family instead of deepening it. Metaphor retries remain strictly
quality-neutral.

**Measured result.** Exactly one additional fixed page changes: `Fitio 88.4/c1 -> FitPath
88.0/c2`, then the normal half-point selector promotes `FitPath` over `Vitalia 88.3/c1`. Replacing
the same `Fit-` family keeps its visible count at two and lowers that page's mean pair similarity
by **0.014**. Relative to Phase 114, reordered pages rise **48 -> 49**, guided leads **42 -> 43**,
mean lead coverage **1.22 -> 1.23**, and suffix-first pages **12 -> 11**. Mean lead quality still
rounds to **85.41**, aggregate page quality still rounds to **83.20**, near pairs remain **43**,
and aggregate mean similarity improves from **0.201 -> 0.200**. The product's `Keyloom` page and
all fifteen developer-namespace pages remain unchanged.

**Verification.** The core suite now contains **141** passing tests, including deterministic
`FitPath`, visible pair seams, two-group coverage, and an empty one-group pair lane. The preference
suite pins same-prefix replacement, the half-point boundary, capacity, Respell ownership, and
overflow rejection. The 90-page audit requires the exact three retry swaps, four justified
near-ties, at most eleven suffix leads, at least 1.23 lead coverage, unchanged near-pair count, and
the prior quality floors. The 85-page Auto audit, 15-page namespace audit, retry-independent
first-impression sweep, 1,000-name taste matrix, four 100-name personalized sessions, mode-aware
taste audit, real feedback/reference/export flow, prompt UI, brief continuation, TypeScript, and
production bundle all pass. Local taste, Load more, AI Studio, ordinary successful pages, and
non-Big-Tech styles do not use this lane.

---

## Phase 116 — Upgrade one weak semantic card without touching the lead

**Bottleneck and boundary.** Phase 115 left eleven suffix-led pages: five correctly belonged to
an earned Respell, three had already used both guided slots, and only three remained open to the
final retry. The expense page at seed 9999 had no pair strong enough to challenge `Poolify 91.3`,
but its bounded pair pool contained `TallyBond 84.0/c2`, a materially stronger replacement for
`Sharebond 78.0/c2`. Lowering the 85-point lead floor would have blurred the existing first-card
contract, so the lead rule stays unchanged. The narrower opportunity is to improve the rest of a
proven gap page without pretending the new name should lead.

**Retained set upgrade.** A two-concept pair may now enter this already-bounded retry path at 84+
for a non-leading set upgrade only. It must replace a non-guided Brandable below the first card,
gain at least two structural points, preserve or improve concept coverage, avoid worsening both
the three-letter prefix and exact-ending family caps, and leave mean pair similarity no higher.
The best quality gain wins, with lower similarity breaking a tie. The existing lead is never a
replacement candidate. Pair candidates still need 85+ and the prior half-point tolerance to close
a lead gap; metaphor retries remain quality-neutral. Respell ownership, two-form capacity, local
taste, Load more, AI Studio, and ordinary successful pages remain unchanged.

**Measured result.** Exactly one additional fixed set changes: `Sharebond 78.0/c2 -> TallyBond
84.0/c2` on the expense page at seed 9999. `Poolify` remains first, the existing `Tallyglow`
guided form remains present, prefix and ending counts stay within their prior caps, and page
similarity does not increase. This adds six structural-quality points to one of 900 visible names;
aggregate quality still rounds to **83.20**. All lead metrics remain exactly at Phase 115:
**49/90** reordered pages, **85.41** mean lead quality, **1.23** mean lead coverage, **11** suffix
leads, and **43** guided leads. Near-duplicate pairs remain **43**, mean similarity remains
**0.200**, the product's `Keyloom` page is unchanged, and all fifteen developer-namespace pages
retain their prior sets and metrics.

**Verification.** The deterministic preference suite pins the accepted `TallyBond` upgrade and
separately rejects a sub-84 candidate, a gain below two points, and an overflowing prefix family.
The 90-page production audit requires exactly the three prior gap-closing swaps plus this one
non-leading set upgrade, validates its quality, coverage, slot, family, and similarity contracts,
and keeps every prior lead and aggregate gate. The 85-page Auto audit, 15-page namespace audit,
pre-retry first-impression sweep, 1,000-name taste matrix, four 100-name personalized sessions,
mode-aware taste audit, real feedback/reference/export flow, prompt UI, brief continuation,
TypeScript, and production bundle all pass. The Rust core and WASM generation logic are unchanged.

---

## Phase 117 — Revisit a rejected retry after fixing its replacement search

**Corrected evidence.** Phase 114 rejected offset `+58` partly because `Bufferlab` appeared to grow
the visible `Buf-` family from two names to three. That diagnostic tried only the lowest-quality
eligible suffix slot, so it tested `Bufferlab` against an unrelated `Stash-` card and never reached
the safer `Bufferia` slot. The production retry now tries every eligible suffix replacement in
quality order. The 72-offset diagnostic was brought into line with that behavior and rerun: replacing
`Bufferia` keeps the `Buf-` family at two and lowers that page's mean similarity by **0.003**.

**Narrow pool choice.** Both `+58` and `+1` produce the same additional fixed-matrix result, but
`+58` also exposes a weaker password-manager alternative already superseded by `Kinloom` from the
first retry pool. Offset `+1` has only the cache-inspector win across the six pre-retry searchable
pages, so it is the smaller observed candidate surface. It now runs last, after `+13` and `+521`,
preserving first refusal for `Kinloom 92.5` and `Kitwave 89.8`. All three pools remain isolated to a
fresh, unpersonalized, briefed Auto page that still has a direct-suffix lead, no Respell, and guided
capacity after normal generation, repair, and ordering.

**Measured result.** The only new set change is `Bufferia 84.8/c1 -> Bufferlab 85.5/c1`; the normal
guided near-tie selector then promotes `Bufferlab` over `Heapify 85.3`. Relative to Phase 116,
reordered pages rise **49 -> 50**, suffix-first pages fall **11 -> 10**, and guided leads rise
**43 -> 44**. Mean lead quality still rounds to **85.41**, mean lead coverage remains **1.23**, and
aggregate page quality remains **83.20**. Near-duplicate pairs remain **43**, mean similarity remains
**0.200**, the product's `Keyloom` page is unchanged, and all fifteen developer-namespace pages keep
their prior names and metrics.

**Verification.** The preference suite now pins the exact cache page and requires the retry to skip
weaker unrelated suffix slots in favor of the same-prefix `Bufferia` replacement. The 90-page audit
requires exactly four lead-gap closures plus the Phase 116 non-leading set upgrade, validates the
85-point retry floor, prefix-family and similarity guards, and tightens the suffix-lead ceiling to
ten. The corrected 72-offset sweep, 85-page Auto audit, fifteen-page verbose namespace audit,
construction-gap diagnostic, real prompt UI, local feedback/reference/export flow, TypeScript, and
production bundle all pass. Personalized and continuation paths cannot open this fresh-page retry;
the Rust core and WASM generation logic are unchanged.

---

## Phase 118 — Reuse the repair pool after a proven gap closes

**Rejected tolerance change.** The last open workout page suggested promoting `FitPath 88.0/c2`
over `Fitify 89.1/c1`. A semantic-pair-only tolerance of 1.2 points was tested, but production did
not change: replacing the safe same-prefix slot would increase similarity because the page already
contains `Thrivepath`. `FitMap 87.3/c2` passed the diversity guard only with a roughly 1.8-point
lead trade and was not a clear aesthetic improvement. The wider tolerance was removed.

**Free candidate reuse.** The construction diagnostic then evaluated non-leading upgrades from
both a deep 60-name Brandable pool and the 30-name pool already generated by cold quality repair.
Both found `Pulselab 86.0/c1` for the workout page at seed 7, so no new generation call is needed.
After a page has already qualified for the tightly scoped retry, the selector may now reuse at
most one unused repair-pool Brandable. It must be non-template, non-guided, prompt-linked, 85+,
at least two structural points stronger than a non-leading non-guided Brandable, preserve concept
coverage, avoid worsening prefix and ending families, and leave mean pair similarity no higher.
The largest gain wins, with lower similarity breaking a tie. Respell, Compound, local taste,
continued pages, successful cold pages, and the first card remain outside this extra set step.

**Measured result.** The only new fixed-matrix swap is `Pulsetrail 82.4/c1 -> Pulselab 86.0/c1`
after the existing `Fitio -> FitPath` retry. The visible `Pulse-` family count is unchanged because
the replacement stays in that family, while the page's mean similarity falls another **0.009**.
Across 900 names, repaired mean structural quality now rounds **83.20 -> 83.21**. Lead behavior is
unchanged at **50/90** reordered pages, **85.41** mean lead quality, **1.23** mean lead coverage,
**10** suffix leads, and **44** guided leads. Near-duplicate pairs remain **43**, aggregate mean
similarity remains **0.200**, the `Keyloom` product page is unchanged, and every developer-namespace
page retains its prior names and metrics.

**Verification.** The preference suite pins the combined `FitPath` lead retry plus `Pulselab` inner
upgrade and rejects a sub-85 repair candidate. The 90-page audit now partitions and validates six
individual swaps across five retry pages: four lead-gap closures, one semantic-pair set upgrade,
and one existing-repair Brandable upgrade. It checks both quality floors, concept coverage, family
caps, similarity, exact names, and unchanged lead-trade limits. The construction diagnostic now
shows repair and deep Brandable lanes separately. The App, cold audit, and namespace audit pass the
same actual primary/fallback pool into the selector. The 15-page verbose namespace audit, real
prompt UI, local feedback/reference/export flow, TypeScript, and production bundle all pass; the
85-page Auto generator, personalized ranking, continuation behavior, Rust core, and WASM generation
logic are unchanged.

---

## Phase 119 — Give the final semantic retry concrete product roles

**Evidence boundary.** No exported real-user taste dataset exists in the workspace, so the broad
aesthetic scorer and its weights remain unchanged. Instead, the candidate diagnostic now accepts
arbitrary spellings and scores them through the exact browser/WASM metrics. This separated useful
role constructions from metric-only ideas before they entered generation: `PayMate` scores 91.3,
`RepLoop` 89.5, and `FitSet` 88.8, while generic or awkward alternatives stay out.

**Isolated role palettes.** `concept_pair` now uses a bounded, context-specific palette for two
briefs where the 90-page audit still exposed mechanical suffix leaders. Shared-expense briefs pair
settlement actions with concrete money and social roles (`tab`, `due`, `pay`, `mate`); workout
planner briefs pair workout actions with planning behavior (`rep`, `set`, `log`, `loop`). These
roots are private to the final cold retry. Ordinary Brandable, explicit modes, continued sessions,
personalized ranking, developer namespaces, and unrelated briefs keep their prior root pools.
Generic non-workout planners retain the smaller `plan`/`track`/`path`/`map` fallback.

**Measured result.** The expense retry replaces the equal-quality one-concept `Poolify 91.3` with
the two-concept `PayMate 91.3` while lowering page similarity. Workout seed 7 now leads with
`RepLoop 89.5/c2` and still reuses `Pulselab`; seed 2024 finally changes from `Fitify` to
`RepLoop`, with the actual set swap improving `Vitalia 88.3 -> RepLoop 89.5`. Across the same 90
cold pages, repaired average quality remains **83.21**, near-duplicate pairs improve **43 -> 42**,
mean pair similarity improves **0.200 -> 0.199**, mean lead quality improves **85.41 -> 85.43**,
mean lead coverage improves **1.23 -> 1.26**, and direct suffix leaders fall **10 -> 8**. Lead
reorders rise **50 -> 52**, guided leaders **44 -> 46**, and justified quality trades fall
**4 -> 3** because both new workout promotions improve rather than trade structural quality.

**Verification.** The core suite is **142/142**. The preference suite pins both `PayMate` and the
cross-family `RepLoop` plus repair-pool path. The 90-page cold audit validates seven exact swaps
across six retry pages, all quality, coverage, family, and similarity guards, and zero sub-75
visible names. The 85-page Auto audit, fifteen-page developer-namespace audit, prompt UI, real
local feedback/reference/export flow, WASM build, TypeScript, and production Vite bundle all pass.
No LLM, network call, broad scorer adjustment, or ordinary generation-pool expansion was added.

---

## Phase 120 — Add a real holdout and close AI-workflow starvation

**Independent matrix.** The fixed 90-page audit had no unqualified gaps left, so further rules
against those same fixtures would risk overfitting. A new production-path holdout now runs 35
different consumer and developer briefs over independent seeds 13, 67, and 313: **105 pages**.
Four additional AI-workflow phrasings add twelve wording-order stress pages without changing the
base aggregate. The reusable `keyword_probe` example exposes extracted keywords, ordinary groups,
isolated pair groups, and Respell sources when a page needs diagnosis.

**Observed gap and bounded fix.** Before a new rule, the three base AI-workflow pages led with
`Synthora`, `Agentio`, or `Synthify`; their metaphor/pair retry returned no qualifying alternative.
The isolated `concept_pair` lane now maps an explicit AI/model/agent plus workflow/automation brief
to two short role groups: `cog`/`aid` and `loop`/`run`/`task`/`flow`. `CogLoop 89.5/c2` replaces an
unused or mechanical suffix form and earns the lead through the existing quality, coverage,
prefix-family, and mean-similarity guards. Ordinary Auto and non-automation AI briefs do not receive
these roots; a strong existing non-suffix lead or earned Respell still keeps ownership.

**Prompt-order starvation.** The wording `workflow automation assistant powered by AI` exposed a
separate zero-result bug. Because `assistant` was the first ordinary group, every compact suffix or
join exceeded the length/phonotactic gates before the recognized AI group could contribute. The
words `assistant` and `powered` are now treated as context-only only when a recognized semantic
anchor exists. Unknown personal-assistant briefs still keep their literal words. The formerly empty
prompt now yields a full page and leads with `CogLoop` on all three independent seeds.

**Measured result.** On the unchanged 105-page base, average structural quality improves
**83.91 -> 83.95**, mean lead quality **85.61 -> 85.91**, mean lead coverage **1.15 -> 1.18**,
near-duplicate pairs **85 -> 80**, mean pair similarity **0.204 -> 0.202**, direct suffix leaders
**27 -> 24**, and guided leaders **37 -> 40**; no visible name is below 75. All twelve extra wording
pages contain ten names. Ten of the fifteen total AI-workflow focus pages lead with `CogLoop`; the
others already have a non-suffix lead or an earned Respell, so none leaves an unqualified suffix-only
first impression.

**Verification.** The core suite is **144/144**. The original 90-page cold audit is byte-for-byte
stable at **83.21** average quality, **42** near pairs, **0.199** similarity, **85.43** lead quality,
**1.26** lead coverage, and **8** suffix leaders. The 85-page Auto audit, fifteen-page namespace
audit, 800-name developer-domain browser audit, 2,400-name cross-domain audit, prompt UI, WASM,
TypeScript, and production Vite bundle all pass. The cross-domain run keeps 2,400/2,400 names,
zero short pages, zero unexplained collisions, and an 83.09 average composite. No LLM, network
call, broad scorer adjustment, or ordinary role-palette expansion was added.

---

## Phase 121 — Surface a semantic pair before the final retry

**Observed gap.** The held-out AI-agent wording already had a non-suffix lead, so the final
suffix-only retry never ran even though its pages averaged only 78–79 and the isolated pair lane
contained `CogLoop 89.5/c2`. Auto now tries one 84+ semantic pair only when no prompt-linked
Respell or 85+ metaphor exists. The pair can enter only by replacing an equal-or-weaker direct
suffix card, so this path has no quota and cannot reduce structural quality.

**Result.** `an AI automation agent` now surfaces `CogLoop` directly on all three independent
seeds and never requests the final retry. The three-page average is **80.75**. On the fixed
90-page matrix, repaired quality improves **83.21 -> 83.24**, lead quality **85.43 -> 85.76**,
lead coverage **1.26 -> 1.28**, and guided leaders **46 -> 52** while suffix leaders stay at eight.
The held-out aggregate, one-accent contract, local taste paths, developer domains, and long
sessions remain inside their prior gates.

---

## Phase 122 — Reuse repair candidates without optimizing for ugly scores

**Aesthetic guard.** A first general set-upgrade experiment raised held-out quality to 84.14, but
manual inspection exposed metric gaming such as `Streamix -> Busharbor`, repeated `Keyseed`, and
the redundant `Siteweb`. That variant was rejected. The retained selector follows the engine's
existing order, requires the same three-letter semantic onset, preserves concept coverage and
family/similarity limits, and refuses generic product or metaphor tails. It still requires an
85+ candidate and at least a two-point gain, and reuses only a fallback pool that was already open.

**Result.** The deliberately conservative path makes six reviewed held-out changes:
`Rundream -> Runcalm`, `Webforge -> Webmint`, and `Lawtrace -> Lawcite` across two seeds each.
Held-out average quality improves **83.95 -> 83.99** and near-duplicate pairs **80 -> 79**;
fixed-matrix repaired quality improves **83.24 -> 83.25**. A deterministic preference test proves
that a higher-scoring generic `Matchvault` stays out while a brief-specific safe alternative may
enter. No extra generation call or network dependency was added.

---

## Phase 123 — Give CRM pipelines a compact revenue role

**Isolated role palette.** CRM pipeline prompts previously collapsed into one root group and could
not construct a two-concept name. The broad alternatives were mostly `Clientora`, `Contactio`, and
other suffix forms. The isolated pair lane now maps only a recognized sales/relationship plus
pipeline brief to `rev` and `loop`/`lane`/`path`. These roots do not enter ordinary Brandable or
unrelated sales prompts. Exact engine scoring keeps `RevLoop 88.0`, `RevLane 86.8`, and
`RevPath 86.5` above the existing 84-point pair floor.

**Measured result.** Two weak CRM seeds now lead with `RevLoop 88.0/c2` directly and skip the final
retry; the third retains its stronger existing `Salelab 89.5` metaphor. The three-page CRM average
improves **80.39 -> 81.06**. Across the 105-page held-out base, average quality improves
**83.99 -> 84.01**, lead quality **85.91 -> 85.94**, lead coverage **1.18 -> 1.20**, near-duplicate
pairs **79 -> 78**, and mean similarity **0.202 -> 0.201**. The fixed 90-page matrix is unchanged.

**Verification.** The core suite is **145/145**. The held-out audit pins the two direct `RevLoop`
pages, their pair provenance, zero final retry, the retained `Salelab` seed, and a CRM average of at
least 81. The fixed cold, Auto, namespace, developer-domain, preference, prompt UI, WASM,
TypeScript, and production build gates pass. No LLM or broad scorer adjustment was added.

---

## Phase 124 — Stop weak Respell starvation and give formatters tool-shaped names

**Observed starvation.** A formatter/linter page initially generated the prompt-linked Respell
`Formattr`, so Auto correctly withheld its other accent paths. The spelling scored only **63.7**,
however, and cold repair later removed it. That left a mechanical page while the already-isolated
pair lane remained closed. Prompt relevance alone is no longer enough to own Auto's accent:
a Respell must also clear the existing **75-point visible-quality floor**. This is a general
eligibility fix, not a name blacklist or scorer change.

**Isolated formatter roles.** Hand-curated probing found a genuinely readable developer-tool
family rather than another high-scoring template: `TidyKit 94.0`, `TidyFix 92.5`, `RuleKit 86.5`,
`LintKit 86.3`, and `LintFix 84.8`. Only a brief containing both formatting/style and lint/rule
semantics opens the private `tidy`/`lint`/`rule` plus `kit`/`fix` pair groups. Ordinary Brandable,
explicit modes, and unrelated developer briefs keep their existing roots; Auto can reach the new
roles only through its already-bounded pair lane.
Two of the three independent formatter pages now lead directly with `TidyKit`; the third preserves
its strong `Tidylink` metaphor. All three lead with an 85+ tool-specific construction without the
final retry, and their combined average is **83.19**.

**Seed-spread guard.** The held-out audit now measures the complete 30-name union for every brief's
three deterministic first pages, pairwise overlap, and content-identical pages. This is a regression
guard rather than a reason to inject arbitrary randomness: real continued sessions already use the
20,000-name exclusion history. The retained change slightly improves first-page spread from
**18.17 -> 18.23/30** unique names and lowers pair overlap **5.16 -> 5.12/10**; the existing three
content-identical seed pairs do not increase.

**Measured result.** Across the 105-page held-out base, average structural quality improves
**84.01 -> 84.08**, lead quality **85.94 -> 86.27**, and lead concept coverage **1.20 -> 1.22**.
Guided leaders rise **41 -> 44**. Near pairs remain 78, mean similarity stays inside its gate at
0.202, direct suffix leaders remain 24, and no visible result or admitted Respell falls below 75.

**Verification.** The core suite is **146/146**. The fixed 90-page cold audit remains green at
**83.25** repaired quality with zero sub-75 names; all 85 guided Auto pages, fifteen namespace
pages, and 1,600 developer-domain names pass. The final held-out gate, prompt UI, rebuilt WASM,
TypeScript, and production Vite bundle also pass. No LLM, network call, broad scorer adjustment,
ordinary role-palette expansion, or preference-ranking change was added.

---

## Phase 125 — Prefer the product subject over a generic builder role

**Human-quality miss.** `an autonomous agent workflow builder` exposed a useful limit in the
structural score: `Buylder` scores **91.0**, above `CogLoop 89.5`, but it styles a generic artifact
role and says nothing about the product's AI-workflow identity. Because it was prompt-linked and
well above the new 75-point floor, it legitimately owned Auto's Respell accent and blocked the
better two-concept pair on all three independent seeds. This is exactly the kind of aesthetically
weak high score that should be fixed by semantic source selection, not by inflating another metric.

**Narrow retained rule.** When another recognized semantic anchor exists, `builder` no longer
qualifies as a Respell source. Builder-only or otherwise unknown briefs retain the word through the
existing fallback, and ordinary Brandable still keeps its full build/forge vocabulary. A broader
trial also suppressed `build`, `create`, and `generator`; it removed one proven documentation
upgrade (`Webforge -> Webmint`), so that version was rejected and only `builder` remains.

**Measured result.** All three autonomous-agent pages now surface the existing `CogLoop` pair
directly, require no final retry, and contain no `Buylder`; the three-page average improves
**81.16 -> 81.37** despite deliberately rejecting the higher-scoring spelling. The 105-page held-out
aggregate remains **84.08**, lead quality **86.27**, lead coverage **1.22**, seed spread
**18.23/30**, and pair overlap **5.12/10**. All six reviewed inner-card upgrades remain present.

**Verification.** The core suite remains **146/146**. The full held-out gate, fixed 90-page cold
audit, 85-page Auto audit, fifteen namespace pages, 1,600 developer-domain names, rebuilt WASM,
TypeScript, and production bundle all pass. No score weight, generated-name blacklist, LLM, or
network dependency was added.

---

## Phase 126 — Give household inventories a concrete Stow role

**Observed gap.** The three household-catalog pages were dominated by interchangeable forms such
as `Itembeam`, `Countify`, `Assetix`, and `Stockseed`. The brief's `belonging`, `household`, and
`catalog` terms intentionally collapse into one ordinary semantic group, so the pair lane had no
second function to express. High-scoring Compound probes such as `KeyItem` were rejected as metric
gaming rather than promoted into Auto.

**Curated role family.** Manual candidate probing found a smaller, readable inventory direction:
`StowLog 88.0`, `StowTag 88.0`, and `StowMap 86.5`. Only a prompt containing both a household or
belongings marker and a catalog or inventory marker receives the private `stow` plus
`log`/`tag`/`map` pair groups. A generic software catalog does not receive them, and ordinary
Brandable remains unchanged.

**Measured result.** All three independent household pages now lead directly with
`StowLog 88.0/c2`, preserve ten cards, and skip the final retry. Their average improves
**81.11 -> 81.97**. Across the 105-page held-out base, average quality improves **84.08 -> 84.10**,
lead quality **86.27 -> 86.49**, lead coverage **1.22 -> 1.25**, and guided leaders **44 -> 47**.
The deliberate stable role costs a negligible amount of raw seed spread (**18.23 -> 18.20/30**;
pair overlap **5.12 -> 5.14/10**) while remaining inside the diversity gates; near pairs, mean
similarity, suffix leaders, duplicate pages, and all six reviewed inner-card upgrades hold.

**Verification.** The core suite is **147/147**. The full held-out gate, fixed 90-page cold audit,
85-page Auto audit, fifteen namespace pages, 1,600 developer-domain names, rebuilt WASM,
TypeScript, and production bundle all pass. No LLM, network call, score adjustment, ordinary-pool
expansion, or generic catalog rule was added.

---

## Phase 127 — Reduce dominant visible stems without score gaming

**Observed gap.** Broad edit similarity stayed inside its gate while some otherwise strong pages
still read like one root repeated with different tails: one AI-agent page contained four `Agent...`
cards. A three-letter family cap was tested and rejected because it flagged **66/105** pages and
conflated readable neighboring roots such as `Stow...` and `Stock...`. The narrower exact
four-letter measure found **12** excess cards across the held-out base.

**Guarded repair.** Four matching stems on a ten-card page now open only the existing bounded
Brandable fallback. The lead, guided constructions, and mode accent cannot move. A replacement
must preserve or improve structural quality and concept coverage, strictly reduce exact-stem
overflow, and not worsen near-pair count, the existing prefix/ending overflow, or mean similarity.
Direct concept-plus-suffix forms are ineligible: the first trial improved numeric scores with
`Flagix`, `Probeix`, and `Traceix`, but manual review correctly rejected those as aesthetic
regressions. The retained path instead makes narrow readable substitutions such as
`Speccrate 77.0 -> Probekit 84.5` on API-toolkit pages.

**Measured result.** Exact-stem excess drops **12 -> 9** across 105 held-out pages. Aggregate
quality moves **84.10 -> 84.11**, lead quality remains **86.49**, lead concept coverage remains
**1.25**, near pairs remain **78**, and mean similarity remains **0.202**. Seed spread changes only
slightly (**18.20 -> 18.17/30** unique; pair overlap stays **5.14/10**) and remains inside the
existing gates. No visible result falls below 75 and direct-suffix leaders remain at 24.

**Verification.** The core suite remains **147/147**. The preference smoke suite, full held-out
gate, fixed 90-page cold audit, 85-page Auto audit, fifteen namespace pages, 1,600 developer-domain
names, TypeScript, and production Vite bundle all pass. No LLM, network call, score change, new
vocabulary, or additional generation request was added.

---

## Phase 128 — Give recruiter trackers a hiring-workflow role

**Observed gap.** `candidate tracking software for recruiters` contained the weakest held-out page
at **79.43** and averaged only **81.48** across three seeds. Its ordinary roots all describe the
recruiting domain (`Talentix`, `Scoutforge`, `Crewrelay`), but none expresses the pipeline function.
The useful `Recruitr 83.4` Respell then closed Auto's normal pair path, even though a two-concept
construction could improve one of the page's weak suffix cards without displacing that accent.

**Candidate review.** The first obvious family was rejected: `HireFlow 80.0`, `HireLane 79.3`, and
`TalentFlow 77.5` did not clear the existing pair threshold. A second manual probe found a stronger
and more readable direction: `JobLoop 89.5`, `JobHub 88.8`, `JobDock 88.0`, `HireHub 88.0`, and
`HireMap 86.5`. Only a brief containing both a recruiting marker and `track` or `pipeline` receives
the private `job`/`hire`/`crew` plus `loop`/`hub`/`map`/`log`/`set` groups. A wording stress pass also
found that unknown `applicant` became a separate nine-letter lead group and starved every candidate
under the twelve-character/three-syllable limits; mapping it into the existing recruiting synonym
group fixes the empty page instead of hiding the variant from the audit.

**Guarded insertion.** This exact lane may request one twelve-name local pair pool even when an
earned Respell is present. The Respell remains the page's sole mode accent. A pair must carry both
concepts, score at least 85, and gain at least two structural points over the direct-suffix card it
replaces. Recruiter Auto additionally raises its Respell floor from 75 to 80: `Recruitr 83.4` and
`Recruyt` remain useful accents, while the reviewed `Applycant 77.0` does not enter applicant pages.
Explicit Respell remains unchanged. Unrelated trackers and ordinary Brandable never receive the
vocabulary. On the weakest seed, `JobLoop 89.5/c2` replaces `Matchify 75.6/c1` and reduces mean page
similarity by 0.010.

**Measured result.** All three recruiter pages now lead with `JobLoop` without a final retry and
retain exactly one `Recruitr` accent. Their average improves **81.48 -> 82.77**. Across 105 held-out
pages, average quality improves **84.11 -> 84.15**, lead quality **86.49 -> 86.73**, lead concept
coverage **1.25 -> 1.28**, mean similarity **0.202 -> 0.201**, suffix leaders **24 -> 23**, and
guided leaders **47 -> 50**. Near pairs remain 78; seed spread changes only slightly
(**18.17 -> 18.14/30**, overlap **5.14 -> 5.16/10**) and remains inside the existing gates.

**Verification.** The core suite is **148/148**. The full held-out gate, fixed 90-page cold audit,
85-page Auto audit, fifteen namespace pages, 1,600 developer-domain names, and all nine recruiter
wording stress pages pass, including three formerly empty applicant-tracking pages. Rebuilt WASM,
TypeScript, and the production Vite bundle also pass. No LLM, network call, global score adjustment,
or ordinary-pool expansion was added.

---

## Phase 129 — Give feature flags a control role without another Gate

**Observed gap.** The three canonical `a feature flag service` pages averaged **81.52** and often
showed four `Gate...` forms in the same ten-card set. Raw score probing suggested `GateKit 92.5`,
`GateMap 92.5`, and `GateOps 91.0`, but adding a fifth form from the same visible root would improve
the metric while making the shortlist feel worse. That family was rejected despite its scores.

**Scoped role family.** A different-root probe found `FlipOps 88.0`, `FlipKit 88.0`, `FlipMap 88.0`,
`FlipLog 88.0`, and `FlipRun 86.5`. Only a brief containing `feature` plus an explicit
flag/toggle/rollout/switch/gate marker receives the private `flip` plus
`ops`/`kit`/`map`/`log`/`run` pair groups. Ordinary Brandable and unrelated feature briefs do not
gain that vocabulary. In this exact feature-flag context, `developer` remains available to normal
semantic Brandable roots but is no longer treated as the product subject for Respell, preventing
the audience-shaped `Developr` accent.

**A/B guard.** The first Auto integration replaced the normal metaphor path entirely. It raised the
local average but increased held-out near pairs **78 -> 79** and exposed another repeated
`Rollout...` form, so it was rejected. The retained path preserves the strongest existing metaphor
and compares one `Flip...` role only against the second guided slot through the existing guarded
replacement. The same pair remains available if a future feature-flag wording earns a safe Respell;
it still cannot bypass the one-accent or quality/diversity contracts.

**Measured result.** All three canonical pages now lead with `FlipOps`, require no final retry, and
their average improves **81.52 -> 82.42**. All nine wording-stress pages contain the scoped pair;
the developer wording contains no Respell. Across the 105-page held-out base, average quality
improves **84.15 -> 84.18**, lead quality **86.73 -> 86.74**, lead concept coverage
**1.28 -> 1.30**, near pairs **78 -> 77**, and exact-stem excess **9 -> 8**. Mean similarity stays
at **0.201**, suffix leaders remain 23, seed spread improves **18.14 -> 18.17/30**, and pair overlap
improves **5.16 -> 5.15/10**.

**Verification.** The core suite is **149/149**. The full held-out gate now covers 105 independent
pages plus 30 wording-stress pages. The fixed 90-page cold audit, 85-page Auto audit, fifteen
namespace pages, 1,600 developer-domain names, rebuilt WASM, TypeScript, and production Vite bundle
all pass. No LLM, network call, global score adjustment, ordinary-pool expansion, or aesthetic
regression accepted only for a higher numeric score was added.

---

## Phase 130 — Give the naming engine one name worth keeping

**Observed product gap.** The app's own namespace briefs cleared every structural gate at roughly
86 quality, yet manual review still found pages dominated by mechanical forms such as `Lexify`,
`Mintix`, `Nomion`, and `Markora`. The score was accurately measuring pronounceability and shape,
but it did not guarantee that a naming product would surface one candidate a person might actually
choose. This is a first-impression problem in the product's core use case, not a reason to raise a
global score weight.

**Candidate review.** Literal compounds were rejected despite their obvious semantics:
`NameMint 66.5`, `WordMint 60.7`, and `NameForge 60.8` lose too much novelty, while
`LexForge 80.3` does not clear the existing pair threshold. The smaller word-making direction is
both cleaner and structurally strong: `LexLoom 89.5` and `LexMint 86.5`. Only an explicit
name/naming/word brief that also carries an engine, generation, product, package, availability,
registry, namespace, or developer marker receives these private groups. Baby-name journals, word
puzzles, brand analytics, and unrelated product tools are pinned as negative cases.

**Rejected first integrations.** The first Auto trial put `LexLoom` on every matching page. It made
the intended candidate visible, but manual review caught `Keyloom` and `LexLoom` together on two
seeds and saw the first namespace brief fall from 29 to 25 unique names. A tail-aware revision
switched those pages to `LexMint`, but another manual pass still found four `Lex...` cards on one
canonical page. The retained selector preserves an existing exact pair, rejects a candidate whose
`loom` or `mint` tail is already present, and applies same-prefix replacement only when adding the
role would create a fourth Lex card. The first prefix gate covered the two-point companion path but
missed the quality-neutral path used when no metaphor exists; a wording-stress seed exposed the
fourth Lex there. A scoped `NeoMint 88.0` reserve was A/B-tested, then removed because it did not
address the cause. The retained fix applies the same prefix choice in both insertion paths: the
companion still needs its two-point gain, while a sole role still cannot replace a stronger card.
If no eligible Lex suffix can leave, the role stays out. No second role family, quota, or final
retry is used.

**Measured result.** The three canonical naming-tool pages now lead with `LexLoom`; their average
improves **87.31 -> 87.40**. Across nine independent wording-stress pages, six lead with
`LexLoom` and every page retains a tail-safe word-making role. All fifteen npm/crates/registry
namespace pages contain one scoped `LexLoom` or `LexMint` pair; none repeats a Loom tail or shows a
fourth Lex prefix. The retained revision recovers one unique name on the affected first namespace
brief (**25 -> 26**) and lowers its first-trial similarity **0.168 -> 0.167**. Across all three
namespace suites, aggregate structural quality improves **86.25 -> 86.33**. The reviewed role
tradeoff reduces explicit namespace-marker cards **57/150 -> 52/150** and moves mean within-page
similarity **0.159 -> 0.161**, while every page still carries `Scope` semantics and all three suites
remain comfortably inside their marker, similarity, quality, and 20-name spread gates.

Across the unchanged 105-page held-out base, average quality remains **84.18**, lead quality
improves **86.74 -> 86.77**, lead concept coverage **1.30 -> 1.33**, and mean similarity
**0.201 -> 0.200**. Near pairs remain 77, suffix leaders remain 23, and exact-stem excess remains
8. The final prefix guard restores three-seed spread and pair overlap to their baseline
**18.17/30** and **5.15/10**. On the fixed cold matrix, lead quality improves
**85.76 -> 85.84**, lead coverage **1.28 -> 1.29**, and justified half-point near-tie trades fall
**3 -> 2**; repaired average remains 83.25.

**Verification.** The core suite is **150/150**. The 105-page held-out base plus 39 wording-stress
pages, 90 fixed cold pages, 85 Auto pages, fifteen namespace pages, and 1,600 developer-domain
names pass. The own-brief 100-page/1,000-selection taste matrix, four independent 100-name
personalized sessions, real 100-name UI session, 25-page mode-aware taste audit, and unpersonalized
100-name brief session also pass. Rebuilt WASM, TypeScript, and the production Vite bundle are
green. No LLM, network call, global scorer change, or ordinary Brandable vocabulary expansion was
added.

---

## Phase 131 — Make color-palette pages vary without losing taste

**Observed bottleneck.** The worst remaining held-out seed spread was the color-palette brief:
three ten-name first pages retained only **11/30** distinct names, shared **9.33/10** names per seed
pair, and seeds 67/313 produced the same set. Manual review found the same mechanical wall behind
the metric: `Pixelia`, `Canvasia`, `Prismora`, `Prismify`, `Pixelio`, `Canvasio`, `Hueora`, and
`Hueify`, plus the same `Vysual` accent. The seed changed generation order, but the compact viable
root/suffix pool converged during quality selection.

**Root and candidate review.** The visual map looked five-root wide, but its `Form...` family scored
only **69.6–71.8** and never survived the 75-point page floor. `Tone` and `Tint` supplied both clear
color semantics and viable shapes: `Toneora 91.3`, `Toneify 89.8`, `Tintify 92.8`, and
`Tintix 94.8`; their metaphor forms included the more deliberate `Toneseed 87.5` and
`Toneloom 87.5`. The retained map adds these roots only for explicit `color` or `palette` terms.
Generic `design`, `visual`, and `creative` keep their old root map, including `Form`, so design-token
taste and unrelated visual products remain unchanged.

**Rejected A/Bs and scope correction.** Replacing `Form` with `Tone` alone raised structural
quality but left the same **11/30** spread and duplicate page, so it was rejected. Adding both roots
globally to design/visual removed the duplicate, but the 1,000-selection taste matrix exposed a real
regression: design-token specialized-meaning retention fell from **80% to 51%**, and mode-aware
taste exceeded its structural-quality tolerance. That version was removed. A wording probe also
found that `designer` could become the first unknown root and collapse a palette page to two names,
while `generator` could produce the poor `Genrator` Respell. Only in the explicit color-palette
lane, `designer`, `generator`, and `scheme` are now treated as context rather than naming material.

**Retained Auto behavior.** A color/palette plus design/visual/creative/generator/scheme brief opens
the scoped path. If it earns a strong prompt-linked Respell, Auto may keep one 85+ semantic metaphor
beside it; without a viable Respell, the existing one-or-two-metaphor contract remains unchanged.
This reuses the existing bounded metaphor pool and one-mode-accent rule: no new scorer, retry,
random source, or online service was added. Three wording variants over three seeds pin full pages,
at least 13/30 names, at most 8.0 pair overlap, a strong metaphor, and the absence of
`Desygn`/`Genrator`/designer-root leakage.

**Measured result.** The canonical color pages improve from **86.69 -> 87.40** average structural
quality, **11 -> 13/30** distinct names, **9.33 -> 8.00** pair overlap, and **one -> zero** duplicate
seed pages. Representative deliberate forms are `Toneseed` and `Toneloom`; every page still keeps
ten prompt-linked names and the strong `Vysual` accent. Across the unchanged 105-page held-out base,
average quality improves **84.18 -> 84.20**, near pairs **77 -> 72**, suffix leaders **23 -> 21**,
guided leaders **50 -> 52**, seed spread **18.17 -> 18.23/30**, pair overlap **5.15 -> 5.11/10**,
and duplicate seed pages **3 -> 2**. Lead quality moves only **86.77 -> 86.76** while coverage stays
**1.33**; the reviewed one-hundredth-point trade reflects stronger non-template color leads and
remains well inside the retained gate.

**Verification.** The core suite is **151/151**. The held-out audit now covers 105 base pages plus
48 wording-stress pages. The 90-page cold audit and 85-page Auto audit remain unchanged. The final
1,000-selection taste matrix and 25-page mode-aware taste audit return exactly to their Phase 130
metrics after the scoped correction. The 48-domain/2,400-name collision audit returns all names,
no short page, and zero unexplained collision; the shared `tone` root explains its one design/mood
overlap. Rebuilt WASM, TypeScript, and the production bundle are green. No LLM or network call is
used.

---

## Phase 132 — Replace generic AI roots with a stronger cognitive palette

**Observed bottleneck.** After the color-page repair, the canonical AI-assistant brief was the
worst remaining held-out seed spread: three ten-name pages retained only **12/30** distinct names,
shared **8.67/10** names per seed pair, and seeds 13/313 produced the same set. Its **82.39** average
also sat well below the held-out mean. `CogLoop` gave the page one clear two-concept lead, but the
remaining cards converged on `Agentix`, `Sparkify`, `Synthia`, `Agentio`, `Neuralix`, `Synthify`,
and `Sparkora`. The old `Mind...` root never survived the visible quality floor, while `Spark...`
was readable but generic enough to make the page feel assembled from a stock AI template.

**Candidate and A/B review.** Candidate scoring found stronger cognitive morphemes without changing
the scorer: `Cognify 85.3`, `Cognio 87.6`, `Logicia 86.8`, `Logicio 88.3`, `Axiomia 87.1`, and
`Axiomix 88.3`. Replacing only dead `Mind` with `Cogn` raised the canonical page to **83.34**,
**14/30** names, and **6.67** overlap. Adding `Nous` raised quality to **84.74** but did not improve
spread and repeated the less approachable `Nousora`, so it was rejected. Keeping `Spark` beside
either `Logic` or `Axiom` reached **15/30** names and **6.33** overlap. The retained six-root palette
uses `Cogn`, `Logic`, `Axiom`, `Synth`, `Agent`, and `Neural`: it removes the generic Spark family,
keeps explicit AI meaning, and produces a more deliberate mix such as `Logicia`, `Cognora`,
`Axiomia`, and `Axiomix`. This is a lexicon curation only; explicit unknown-domain input containing
the word `spark` remains usable and is pinned by a unit test.

**Measured result.** The canonical AI-assistant pages improve from **82.39 -> 86.23** average
structural quality, **12 -> 15/30** distinct names, **8.67 -> 6.67** pair overlap, and **one -> zero**
duplicate seed pages. AI-agent wording improves **81.01 -> 82.87**, while autonomous-agent builder
wording improves **81.37 -> 84.92**. Across the unchanged 105-page held-out base, average quality
rises **84.20 -> 84.31**, near pairs fall **72 -> 68**, average seed spread rises
**18.23 -> 18.31/30**, pair overlap falls **5.11 -> 5.06/10**, and duplicate seed pages fall
**2 -> 1**. Lead quality, coverage, suffix leads, and guided leads remain **86.76**, **1.33**,
**21**, and **52** respectively; `CogLoop` still owns the clear two-concept first card.

**Verification.** The core suite is **152/152**. The held-out gate now requires the canonical AI
pages to average at least 86.1, retain at least 15/30 names, stay at or below 6.7 pair overlap, and
avoid duplicate sets; all fifteen AI-workflow stress/base pages remain full and qualified. The
1,000-selection taste matrix and 25-page mode-aware taste audit are unchanged. The 90-page cold and
85-page Auto audits pass at their retained metrics. The 48-domain/2,400-name audit returns every
name, no short page, **83.15** average quality, and zero unexplained collisions; AI automation alone
rises to **84.80**. Rebuilt WASM and the production bundle pass. No LLM, network call, scorer,
selection weight, retry, or random source changed.

---

## Phase 133 — Give legal research a distinct case-law role

**Observed bottleneck.** After the AI palette repair, `legal research for court cases` was the
last held-out brief with a content-identical seed page. Its three first pages averaged **81.39**,
retained only **13/30** distinct names, and shared **8.00/10** names per seed pair. The visible
set leaned on repeated `Case...`, `Lens...`, and suffix forms, while natural variants such as
`court opinion and citation search` could let the generic word `search` pull in filesystem roots.

**Scoped vocabulary and role.** Explicit legal-plus-research briefs now keep the legal domain
before the research function, treat `case`, `opinion`, and `search` as context in that lane, and
add viable `Memo` and `Gavel` families to the ordinary legal palette. A private two-concept pool
combines `Lex`/`Brief`/`Docket` with `Lens`/`Cite`/`Proof`; Auto examines the slightly deeper pool
only for this lane and preserves the tail-aware `LexCite` lead. `Citation` and `precedent` still
activate the correct semantic groups but cannot become weak literal Respells. Generic filesystem
search remains unchanged.

**A/B boundaries.** Adding ordinary `Lex` improved local spread but produced **29/2,400**
cross-domain collision pairs, above the 1% gate, so `Lex` remains private to the guided pair.
Adding both `Lex` and `Memo` had the same leakage. `Memo` alone was clean but stopped at **17/30**
names and **6.00** overlap; the retained `Memo` plus `Gavel` palette reaches the stronger spread
without a global collision. Suppressing every ordinary `Lens` raised the structural average but
collapsed spread to **14/30** and created another suffix wall. A custom tail-replacement repair
was also rejected: the existing bounded selection can hold Lens-family output to four of ten
without adding a new cold-repair algorithm.

**Measured result.** The canonical legal-research pages improve to **83.97** average structural
quality, **19/30** distinct names, **4.67/10** pair overlap, and **zero** duplicate seed pages. All
three seeds lead with `LexCite`; representative companions include `Brieflens`, `Memoora`,
`Gavelio`, `Lawtrace`, and `Docketlens`. Three natural wording variants retain the same minimum
spread and maximum overlap while rejecting filesystem roots, weak legal Respells, and retries.
Across the unchanged 105-page held-out base, average quality rises **84.31 -> 84.38**, lead quality
**86.76 -> 86.93**, seed spread **18.31 -> 18.49/30**, and pair overlap **5.06 -> 4.96/10**.
Near pairs and suffix leaders remain **68** and **21**; guided leaders rise **52 -> 55**, and the
last exact duplicate seed page disappears.

**Verification.** The core suite is **153/153**. The held-out audit now covers 105 base pages plus
57 wording-stress pages and pins the canonical and variant legal-research behavior. The 90-page
cold audit, 85-page Auto audit, 1,000-selection taste matrix, and 25-page mode-aware taste audit
all pass their retained gates. The 48-domain/2,400-name collision audit returns every name at
**83.23** average quality and **0.727** diversity, with 24 explained shared-root collision pairs
and zero unexplained collisions. Rebuilt WASM, TypeScript, and the production Vite bundle are
green. No LLM, network call, global scorer change, retry, or random source was added.

---

## Phase 134 — Replace the habit page's Daily wall with live rhythm roots

**Observed bottleneck.** After legal research was separated from generic search, `routine and
streak coaching` was the clearest remaining visual repetition: every seed showed four `Daily...`
cards, all three pages contributed one dominant-stem overflow, and the canonical set averaged only
**81.81**. Across three seeds it retained **20/30** names and shared **4.00/10** names per pair.
The six-root map was misleadingly broad: `routine` and `rhythm` contributed almost nothing to the
canonical first page, so selection repeatedly converged on `Daily`, `Habit`, `Ritual`, and
`Streak`.

**Retained vocabulary and context fix.** The habit/routine palette replaces those two ineffective
roots with `Beat` and `Chain`. Both are short, recognizable expressions of rhythm and streak
continuity, and they produce a more varied set such as `Beatlab`, `Beatsignal`, `Chainhive`,
`Dailyflow`, `Habitbeam`, and `Streakpath`. Natural wording exposed a separate interpretation bug:
`daily habit building and streak tracking` admitted generic creation roots and produced forms such
as `Dailycraft` and `Ritualmint`. Only beside an explicit habit/routine/streak/ritual concept,
`build`, `builder`, `track`, `last`, and the existing coaching/tracker words are now context rather
than naming material. Generic builder briefs keep their original `Forge` palette.

**A/B boundaries.** `Groove + Chain` removed the stem wall but lowered two already-weak pages and
global lead quality. `Tempo + Chain` improved local and global metrics, but `Tempo` is shared with
productivity and raised cross-domain collisions **24 -> 28/2,400**, so it was rejected.
`Beat + Groove` reached **84.84** local quality but collapsed to **19/30** names and left four `Beat...`
cards on two pages. Keeping all three roots added width without improving the selected pair's
quality or overlap. Doubling the guided-metaphor pool also lost quality (**83.84 -> 83.73**) and
raised overlap, so the existing bounded generation path remains unchanged.

**Measured result.** The canonical habit pages improve **81.81 -> 83.84** average structural
quality, **20 -> 24/30** distinct names, and **4.00 -> 2.00/10** pair overlap. No page has more than
three names from one four-letter stem. Three natural wording variants produce the same stable
seed-specific pages and no longer leak build/tracking context. Across the unchanged 105-page
held-out base, average quality rises **84.38 -> 84.44**, lead quality **86.93 -> 87.09**, seed
spread **18.49 -> 18.60/30**, pair overlap **4.96 -> 4.90/10**, and mean similarity
**0.200 -> 0.199**. Dominant-stem excess falls **8 -> 5**; near pairs move **68 -> 69**, while
coverage, suffix leaders, guided leaders, and duplicate pages remain **1.33**, **21**, **55**, and
**zero**.

**Verification.** The core suite is **154/154**. The held-out audit now covers 105 base pages plus
66 wording-stress pages and pins both canonical habit diversity and wording equivalence. The
90-page cold audit, 85-page Auto audit, 1,000-selection taste matrix, and 25-page mode-aware taste
audit pass their retained gates. The 48-domain/2,400-name collision audit returns every name at
**83.26** average quality and **0.727** diversity, with the same 24 explained shared-root collision
pairs and zero unexplained collisions. Rebuilt WASM, TypeScript, and the production bundle are
green. No LLM, network call, scorer, selection algorithm, retry, or random source changed.

---

## Phase 135 — Prefer a broad classroom over a higher-scoring Edu wall

**Observed bottleneck.** With the habit page diversified, `an online course and study app` owned
the remaining three-page semantic stem wall: every seed showed four `Sage...` or `Lore...` cards.
The canonical pages averaged **82.94**, retained **21/30** names, and shared **3.33/10** names per
seed pair. The nominal six-root palette was effectively only `Lore`, `Sage`, and `Quiz` because
literal `Learn`, `Study`, and `Skill` transforms scored mostly **60–73**. Natural wording also
exposed interpretation leaks: `study tools for students` produced `Sagetool`, `Loretool`, and
`Toolatlas`, while learner wording collapsed back into a suffix-heavy three-root set.

**Retained palette and wording scope.** The education map is now deliberately five productive
roots: `Tutor`, `Lore`, `Sage`, `Quiz`, and `Dojo`. `Tutor` states the role directly; `Dojo` adds a
short practice-and-learning metaphor without becoming a global vocabulary word. Beside an
explicit learn/education/study/course concept, `tool`, `student`, `learner`, and `online` are now
context rather than naming material. Outside that lane the words keep their previous treatment.
The three natural wording variants resolve to the same seed-specific pages as the canonical brief.

**A/B boundaries.** Candidate scoring found several structurally strong roots, but score alone was
not accepted as taste. `Tutor + Prep + Dojo` raised local quality to **84.99** while shrinking
spread to **20/30** and creating a `Prep...` wall. Keeping a dead `Skill` slot beside `Tutor/Dojo`
reached **84.49**, **22/30**, and **2.67** overlap, but the unused entry still narrowed exploration.
Replacing it with `Edu` reached the highest local score, **85.51**, yet stayed at **22/30**, raised
overlap to **3.00**, and opened two seeds with the generic `Edupeak`. That version was rejected.
Removing the ineffective sixth slot produced the strongest visible set even though its structural
average is lower: three different leads and nearly disjoint seed pages matter more here than a
short, easily scored prefix.

**Measured result.** Canonical education pages improve **82.94 -> 83.75** average structural
quality, **21 -> 28/30** distinct names, and **3.33 -> 0.67/10** pair overlap. `Dojobeam`,
`Quizlab`, and `Sagelab` lead the three seeds; no page has a four-name stem family. Representative
companions include `Sagepath`, `Tutorseed`, `Lorevault`, `Tutorflux`, and `Dojoflow`. Across the
unchanged 105-page held-out base, average quality rises **84.44 -> 84.46**, lead quality
**87.09 -> 87.13**, seed spread **18.60 -> 18.80/30**, pair overlap **4.90 -> 4.83/10**, and mean
similarity **0.199 -> 0.197**. Dominant-stem excess falls **5 -> 2**; near pairs, suffix leaders,
coverage, and duplicate pages remain **69**, **21**, **1.33**, and **zero**, while guided leaders
rise **55 -> 56**.

**Verification.** The core suite is **155/155**. The held-out audit now covers 105 base pages plus
75 wording-stress pages and requires 28/30 education names, at most 0.7 overlap, three different
leads, zero stem overflow, and exact wording equivalence. The 90-page cold audit, 85-page Auto
audit, 1,000-selection taste matrix, and 25-page mode-aware taste audit pass their retained gates.
The 48-domain/2,400-name collision audit returns every name at **83.28** average quality and
**0.728** diversity, with the same 24 explained collision pairs and zero unexplained collisions.
Rebuilt WASM, TypeScript, and the production bundle are green. No LLM, network call, scorer,
selection algorithm, retry, or random source changed.

---

## Phase 136 — Read terminal-log intent instead of the loudest acronym

**Observed bottleneck.** `a terminal log viewer` was the last held-out page outside the message
queue lane with an exact stem wall: seed 67 showed four `Term...` cards. The canonical pages
averaged **84.67**, retained **17/30** names, and shared **6.00/10** names per seed pair. Natural
wording exposed a more serious interpretation fault. `CLI log viewer for developers` discarded
the terminal role and produced `Kitpulse`, `Stackora`, `Byteora`, `Developr`, and related generic
developer names. `terminal logs and command output monitor` admitted `Shelloutput`, `Termoutput`,
and `Monytor`. The acronym, audience, and delivery words were louder than the actual product.

**Scoped interpretation and palette.** A terminal-log brief now requires both a terminal-side
signal (`terminal`, `shell`, `console`, `command`, `prompt`, or `cli`) and a logging-side signal.
Only in that combined context, all terminal phrasings resolve to the same six productive roots:
`Term`, `Shell`, `Prompt`, `Log`, `Exec`, and `Pane`. The separate observability group remains
`Trace`, `Watch`, `Scope`, `Pulse`, and `Beacon`. `developer`, `output`, `inspection`, `tool`, and
`viewer` become context rather than naming roots, while CLI/command/monitor role words cannot take
the Respell accent. A generic CLI brief outside this lane still keeps the ordinary developer
palette. The three wording variants now produce exactly the same seed-specific pages as the
canonical brief.

**A/B boundaries.** Structural scoring made `Tail` look attractive, and a `Tail + Pane` palette
raised the local average to **85.26** while removing the Term wall. The 48-domain audit caught the
cost that the local page could not: pet care already owns `tail`, producing new `Tailify` and
`Tailora` collisions and raising exact cross-domain pairs **24 -> 26/2,400**, above the 1% gate.
That palette was rejected. Adding `ANSI` and `Mux` widened local spread to **20/30**, but neither
root reached the visible page and the four-card Term wall returned. The final direct `Log` root is
both clearer and isolated: it improves the page without creating a new shared-root collision.

**Measured result.** Canonical terminal-log pages improve **84.67 -> 85.85** average structural
quality, retain **17/30** distinct names, and reduce pair overlap **6.00 -> 5.00/10**. No page has
a four-name stem family. Representative results include `Panebeam`, `Logbeacon`, `Logscope`,
`Panelink`, `Shellio`, and `Promptora`. Across the unchanged 105-page held-out base, average
quality rises **84.46 -> 84.50**, lead quality **87.13 -> 87.17**, and concept coverage
**1.33 -> 1.35**. Near pairs fall **69 -> 64**, mean similarity **0.197 -> 0.195**, average seed
overlap **4.83 -> 4.80/10**, and dominant-stem excess **2 -> 1**. Seed spread remains **18.80/30**,
suffix leaders remain **21**, guided leaders remain **56**, and duplicate pages remain zero.

**Verification.** The core suite is **156/156** and targeted formatting is clean. The held-out
audit now covers 105 base pages plus 84 wording-stress pages and pins 85.7+ terminal quality,
17/30 names, at most 5.0 overlap, zero terminal stem overflow, no role-word leakage, and exact
wording equivalence. The 90-page cold audit, 85-page Auto audit, 1,000-selection taste matrix,
25-page mode-aware taste audit, and browser developer-domain audit all pass. The latter retains
**800/800** semantic Brandable names and **797/800** semantic Compound names. The 48-domain audit
returns **2,400/2,400** names at **83.29** composite, **0.730** diversity, and **47.9%** domain
uniqueness, with the original 24 explained collision pairs and zero unexplained collisions.
Rebuilt WASM, TypeScript, and the production Vite bundle are green. No LLM, network call, global
scorer, selection algorithm, retry, or random source changed.

---

## Phase 137 — Keep message queues out of Async and Pipe walls

**Observed bottleneck.** After terminal logs were corrected, `a message queue client` owned the
last dominant-stem overflow in the 105-page held-out base: seed 313 showed four `Pipe...` cards.
The canonical pages averaged **83.64**, retained **24/30** names, and shared **2.00/10** names per
seed pair. Natural wording exposed a larger failure. `message broker client for developers`
produced `Topickit`, `Queuebyte`, and `Developr`; `event streaming and queue monitoring` admitted
generic observability roots plus `Monytor`; and `an async message bus` returned only seven cards,
three below the visible quality floor, with an `Async...` wall.

**Scoped interpretation and palette.** Explicit queue/broker/messaging/stream/topic/bus language
now marks the message-queue lane. Within it, `async`, `asynchronous`, `client`, `consumer`,
`dashboard`, `developer`, `event`, `message`, `monitor`, and `monitoring` are delivery, audience,
or function context rather than naming roots. These words keep their previous behavior outside a
recognized queue brief. The productive queue palette retains `Queue`, `Broker`, `Stream`,
`Topic`, `Pipe`, and `Bus`, and adds one short `Pub` root from publish/subscribe terminology.
All three natural wording variants now produce the same full seed-specific pages as the canonical
brief, with no Respell accent.

**A/B boundaries.** The bounded fallback already contained many relevant alternatives, but every
visible `Pipe...` card scored **87.5** while the strongest different-stem replacements stopped at
**85.5**. The global quality-neutral repair correctly refused that trade, so its safety rule was
not relaxed. Adding `FIFO` raised local quality to **84.31** but showed no FIFO names, reduced
spread to **20/30**, raised overlap to **4.33**, and merely moved the Pipe wall to another seed.
`Deque` surfaced once but still left the wall, with **21/30** names and **3.67** overlap. A combined
`Pub + Sub` palette reached the highest local score, **85.11**, but fell to **23/30** names and
introduced abbreviation-heavy forms such as `Subio` and `Subify`. The single `Pub` lane gives the
best balance of visible taste, structural quality, and exploration.

**Measured result.** Canonical message-queue pages improve **83.64 -> 84.43** average structural
quality, **24 -> 26/30** distinct names, and **2.00 -> 1.67/10** pair overlap. No page has a
four-name stem family. Representative results include `Publink`, `Publoom`, `Pubsignal`,
`Pipeloom`, `Queueflow`, `Brokerbeam`, and `Topicflux`. Across the unchanged 105-page held-out
base, average quality rises **84.50 -> 84.52**, lead quality **87.17 -> 87.25**, seed spread
**18.80 -> 18.86/30**, and pair overlap **4.80 -> 4.79/10**. Dominant-stem excess falls **1 -> 0**;
coverage, near pairs, mean similarity, suffix leaders, guided leaders, and duplicate pages remain
**1.35**, **64**, **0.195**, **21**, **56**, and zero.

**Verification.** The core suite is **157/157** and targeted formatting is clean. The held-out
audit now covers 105 base pages plus 93 wording-stress pages and pins 84.4+ queue quality,
26/30 names, at most 1.7 overlap, zero queue stem overflow, full ten-name variants, no context-word
leakage, and exact wording equivalence. The 90-page cold audit, 85-page Auto audit,
1,000-selection taste matrix, 25-page mode-aware taste audit, and browser developer-domain audit
all pass. The latter retains **800/800** semantic Brandable names and **797/800** semantic Compound
names. The 48-domain audit returns **2,400/2,400** names at **83.30** composite, **0.729**
diversity, and **47.8%** domain uniqueness, with the same 24 explained collision pairs and zero
unexplained collisions. Rebuilt WASM, TypeScript, and the production Vite bundle are green. No
LLM, network call, global scorer, selection algorithm, retry, or random source changed.

---

## Phase 138 — Make Auto Respell earn its place by readability

**Observed bottleneck.** The held-out audit previously checked weak Respell scores but did not
inventory the spellings that actually survived to the visible page. Across 105 independent cold
pages plus 93 wording-stress pages, Auto selected a Respell on **63 pages** from **18 unique**
forms. The edit-distance rule treated reversible brand spellings and damaged words as equivalent:
`Browsr`, `Lybrary`, `Pryvate`, and `Vysual` sat beside `Grocry`, `Calndar`, `Proprty`,
`Monytor`, `Filesystm`, `Recruitr`, and related interior-vowel deletions. Their structural scores
were often high, so the existing 75-point floor could not express the visual problem.

**Scoped presentation rule.** Explicit Respell still exposes the engine's full exploratory
vocabulary. Auto now adds a separate readability gate after prompt linkage: the result must be at
most seven letters and must be exactly reversible as either an early `i -> y` substitution, a
compact six-letter substitution such as `Desygn`, or a penultimate `e` deletion such as `Browsr`.
Long forms and interior deletions yield their accent slot to the existing quality-gated metaphor
or scoped pair path. This changes neither Respell generation nor scoring; it changes only what
Auto is willing to present as a supposedly polished first-page accent.

**A/B boundary.** The first guard allowed `i -> y` only in the first three positions. It cleaned
the held-out pages, but it also removed `Desygn` from the constrained design-token taste pool.
Eight of 100 personalized pages then needed a third prefix family card and four pages reached nine
direct suffix forms. Allowing the same one-edit substitution anywhere in words of six letters or
fewer restored that useful sixth family while still rejecting `Monytor`, `Logystic`, `Mygration`,
and `Recruyt`. The final personalized matrix has zero prefix overflow, at most eight direct suffix
forms, **85.32** selected quality, **0.193** mean similarity, and only the reviewed `Desygn` accent
across its 20 design-token pages. A remaining four-card `Plan...` family was also inspected; its
fallback could only offer another mechanical suffix form (`Taskora`) without weakening an existing
non-template guard, so that score-only swap was rejected.

**Measured result.** Visible held-out Respells fall **63 -> 18 pages** and **18 -> 4 unique
forms**: `Browsr`, `Lybrary`, `Pryvate`, and `Vysual`. Average structural quality rises
**84.52 -> 84.80**, lead quality **87.25 -> 88.08**, suffix leaders fall **21 -> 11**, and guided
leaders rise **56 -> 78**. Seed spread improves **18.86 -> 19.60/30** while pair overlap falls
**4.79 -> 4.39/10**. The trade is small and explicit: coverage moves **1.35 -> 1.34**, near pairs
**64 -> 66**, mean similarity **0.195 -> 0.198**, and one task-planner page has one exact-stem
excess; all remain inside retained gates. Recruiter pages now keep `JobLoop` and discard the
damaged role-word accents instead of preserving a Respell quota.

**Verification.** The Auto smoke test pins both accepted and rejected transformations. The
85-page Auto audit surfaces only the reviewed `Vyntage`, `Edytor`, and `Anymal` accents; the
198-page held-out audit and 100-page/1,000-selection taste audit now print and gate their visible
Respell inventories. The 90-page cold audit, 25-page mode-aware taste audit, three-prompt namespace
audit, four 100-name personalized sessions, and 1,600-name browser developer-domain audit pass
their retained contracts. The Rust suite remains **157/157** and the 48-domain audit remains
**2,400/2,400** at **83.30** composite, **0.729** diversity, and **47.8%** domain uniqueness, with
24 shared-root collisions and zero unexplained collisions. TypeScript and the production Vite
bundle are green. No LLM, network call, Rust generator, WASM artifact, explicit Respell mode,
scorer, retry, or random source changed.

---

## Phase 139 — Replace delivery and cloud suffix leads with scoped product roles

**Observed bottleneck.** Phase 138 left eleven direct-suffix leaders in the 105-page held-out
base. Five belonged to only two clearly recognized jobs: all three delivery-tracking seeds and two
of three cloud-deployment seeds. The available generic Compound candidates (`TopDock`, `KeyDock`)
scored well but read like templates, while literal tracking pairs (`CargoTrack`, `RouteTrack`)
were too weak to enter a polished first page. The isolated concept-pair pool exposed two better
roles without expanding the global vocabulary: `ShipOps` at **89.5** and `SkyDock` at **88.0**.

**Scoped interpretation.** A delivery/logistics subject plus tracking, operations, or dispatch now
opens a private `Ship` × `Ops/Map/Hub` pair family. A cloud/hosting/infrastructure subject plus
deployment opens `Sky` × `Dock/Ship/Grid`; the web selector deliberately prefers `SkyDock` when
the equal-scoring alternatives survive. Ordinary shipping labels, logistics inventory, cloud-cost
tools, weather products, and Git release automation retain their previous palettes. `parcel` and
`shipment` now map to the existing delivery roots, while operation/tracking and team context is
suppressed only in the longer delivery wordings that otherwise produced short, sub-75 literal
joins. Cloud deployment similarly ignores incidental `application` and `team` context.

**A/B boundary.** A first normalization applied the delivery context rule to every recognized
delivery-tracking brief. It produced readable inner cards but changed the broad-domain sample
enough to add `Docklink` and another shared-root collision with cloud: the 48-domain gate moved
from **24 -> 26** exact collision pairs and failed. That version was rejected. The final rule
normalizes only prompts carrying `parcel`, `shipment`, `operation`, `dispatch`, or `team`; the
canonical delivery palette keeps its prior exploration behavior. The collision matrix returns to
**24** explained shared-root pairs and zero unexplained collisions.

**Measured result.** Held-out suffix leaders fall **11 -> 6** and guided leaders rise **78 -> 84**.
Average structural quality improves **84.80 -> 84.85**, lead quality **88.08 -> 88.22**, and lead
concept coverage **1.34 -> 1.40**. Near pairs fall **66 -> 62** and mean similarity improves
**0.198 -> 0.197**; seed spread remains **19.60/30**, with pair overlap moving only
**4.39 -> 4.41/10** and no duplicate pages. `ShipOps` leads all **3/3** canonical delivery pages
and all **9/9** wording-stress pages. `SkyDock` does the same for cloud deployment. Every one of
the 18 new wording pages contains ten names, has no sub-75 card, no Respell, no context leakage,
and needs no final retry.

**Verification.** The held-out audit now covers **105 + 111** pages and permanently gates both
roles, their six natural-language variants, seed diversity, leakage, retry use, and the visible
quality floor. The Rust suite is **159/159**. Auto's 85-page matrix, the 90-page cold audit, three
namespace briefs, 100 personalized pages/1,000 selections, 25 mode-aware pages, four 100-name
personalized sessions, and the browser developer-domain audit all pass. Developer output remains
**800/800** semantic Brandable and **797/800** semantic Compound. The 48-domain audit remains
**2,400/2,400** at **83.30** composite, **0.729** diversity, and **47.8%** domain uniqueness,
with 24 explained collisions and zero unexplained collisions. TypeScript, rebuilt clean WASM, and
the production Vite bundle are green. No LLM, network call, global scorer, retry rule, random
source, or explicit naming mode changed.

---

## Phase 140 — Repair lexical seam hazards without perturbing generation

**Observed defect.** A message-queue page exposed `Busharbor`, produced by `bus + harbor` but
naturally reparsed as “bush arbor.” Rejecting `sh/ch/th/ph/wh` seams during sampling removed the
name but changed the deterministic RNG stream and broke five held-out gates. A fixed `0.50` rank
penalty kept the RNG stream but still changed the shortlist boundary: `Busharbor` disappeared,
`Pipeora` entered from the shallow attractor pool, and message-queue spread regressed from
**26 -> 25/30** while seed overlap rose **1.67 -> 2.00**. Applying the same filter immediately
before MMR produced the identical failure. All three versions were rejected; no gate was weakened
and `Pipelab` was not forced from a deeper diagnostic pool.

**High-confidence signal.** The retained core API detects only a prompt-expanded root followed by
a curated metaphor where the seam is one of the five English `h` digraphs and both alternate
segments are dictionary words. Thus `bus + harbor -> bush + arbor` is flagged, while `Logscope`,
ordinary suffix coinages, and unrelated two-part names are not. The signal crosses WASM as batched
metadata; it does not change generation, ranking, MMR, scoring, candidate depth, or random state.
The focused fixtures also pin a second positive `bat + harbor -> bath + arbor` and a non-metaphor
negative.

**Bounded repair.** A selected lexical hazard opens only the existing three-page Brandable fallback.
Exactly that card may be replaced, following the fallback's seed-specific order, only by a safe
non-suffix candidate with non-decreasing structural quality and concept coverage. Exact-stem
overflow, prefix/ending-family overflow, near pairs, and mean page similarity must all stay flat or
improve. Personalized shortlists likewise omit a hazard whenever the existing pool has enough safe
names. On the affected seed, `Busharbor 85.5` becomes `Topicpath 85.5`; the other nine cards remain
unchanged. The held-out audit now permanently gates visible high-confidence lexical hazards at zero.

**Measured result.** The Phase 139 aggregate is restored exactly: average quality **84.85**, lead
quality **88.22**, lead coverage **1.40**, **62** near pairs, **0.197** mean similarity, **6** suffix
leaders, **84** guided leaders, **19.60/30** seed diversity, **4.41/10** overlap, and zero duplicate
pages. Message-queue pages return to **26/30** names and **1.67** overlap at **84.43** average, with
zero Respells, retries, stem overflow, or wording drift. All **105 + 111** selected pages contain
zero flagged lexical reparses.

**Verification.** The Rust suite is **160/160** and the preference smoke suite passes its new
single-card repair fixtures. Rebuilt WASM, TypeScript, and the production Vite bundle are green.
The 49-gate held-out audit, 85-page Auto audit, 90-page cold audit, namespace audit, 100-page taste
matrix, 25-page mode-aware taste audit, four 100-name personalized sessions, and real 100-name UI
session all pass. Browser developer output remains **800/800** semantic Brandable and **797/800**
semantic Compound; the core developer comparison reaches **1,558/1,600** marker hits. The
48-domain audit remains **2,400/2,400** at **83.30** composite, **0.729** diversity, and **47.8%**
domain uniqueness, with 24 explained collisions and zero unexplained collisions. No LLM, network
call, score adjustment, global pool expansion, or special-cased replacement name was added.

---

## Phase 141 — Measure visible construction saturation before changing generation

**Observed blind spot.** The retained held-out set has only **0.197** mean edit similarity and one
exact-stem excess card, yet whole pages still read as variations on the same recipe. Message-queue
seed 67 is ten root-plus-metaphor forms; routine seed 13 is the same, while delivery pages place one
semantic pair beside nine suffix forms. String and stem diversity therefore do not measure whether
the construction itself has become repetitive.

**Observation-only proxy.** The held-out audit now classifies only the final visible cards, using
mutually exclusive surface shapes: Respell/other accent, one-concept direct suffix, multi-concept
linkage, one-concept curated metaphor tail, or unclassified Brandable. This is explicitly a
`template-match proxy`, not generator provenance or an aesthetic truth. A coincidental suffix is
possible, `concept_coverage` is semantic rather than structural metadata, and an unclassified form
would not by itself prove holistic Wordoid-style generation. For that reason Phase 141 adds no new
quality gate and changes no production selection behavior.

**Measured baseline.** Across the 105 canonical pages and 1,050 visible cards, **527 (50.2%)** are
direct suffix forms, **363 (34.6%)** are root-plus-metaphor shapes, **148 (14.1%)** are linked to
multiple brief concepts, and only **12 (1.1%)** are Respells; zero Brandables fall outside the
known proxy. In total,
**1,038/1,050 (98.9%)** cards match an assembled construction. **93/105** pages match 10/10 and all
**105/105** match at least 9/10. A single broad construction shape occupies six or more cards on
**72/105** pages, while **19/105** pages contain at least eight direct suffixes. The narrower
suffix-plus-metaphor subtotal is **8.48/10** per page; 83 pages reach eight and 44 reach ten. The
separate wording-stress set is even more saturated: **1,104/1,110 (99.5%)**, with **105/111**
10/10 pages and **90/111** single-shape walls.

**Decision boundary.** A future experimental lane must reduce both whole-page template matching
and single-shape walls; merely exchanging suffix forms for more metaphor tails is not an
improvement. Every existing semantic, structural, diversity, lexical-safety, taste, namespace, and
session gate must remain green. Integration still requires context-matched, blind pairwise human
preference evidence; this diagnostic alone cannot establish that a candidate is beautiful.

**Verification.** The production-path held-out audit reproduces the full Phase 140 baseline and all
49 retained gates while printing canonical and wording-stress construction summaries plus the most
saturated pages. No Rust, WASM, generator, ranker, shortlist, score, random source, network path, or
UI behavior changed.

---

## Phase 142 — Reject a corpus-backed spelling-profile lane before product integration

**Hypothesis and isolation.** Phase 141 showed that almost every visible Brandable is assembled
from a known surface recipe. A character-level spelling-profile lane could, in principle, add forms
that are not direct suffixes, metaphor joins, or concept pairs. This phase tests only that narrow
technical premise with the existing public `Model::train_backoff`, sampling, score, phonotactic,
and MMR APIs. The two new examples and their adjacent data never enter `generate()`, Auto, WASM,
the web app, or a public mode. This is not a production experiment and it does not claim to model
an Italian or Japanese language.

**Provenance-safe corpus snapshot.** The experiment derives two 1,000-name snapshots from the
2026-08-10 GeoNames IT, Italian alternate-name, and JP country dumps under CC BY 4.0. It keeps
single-token 4–10-letter ASCII populated places with population at least 1,000, excludes
historical, abandoned, and destroyed feature codes, and rejects Italian alternates flagged
historic or colloquial. An Italian record survives only when it has one unique preferred spelling
or one unambiguous non-preferred spelling; regional alternatives are not resolved by an arbitrary
lexical tie-break. The Japanese file uses GeoNames' plain ASCII field and is labeled a Japanese
plain-ASCII place-name spelling profile, not verified transliteration, Hepburn romaji, or Japanese
phonology. The reproducible builder, source hashes, transformation disclosure, derived hashes,
license link, attribution, non-endorsement statement, and limitations live beside the snapshots.

**Sealed technical protocol.** Every fifth population-ranked entry is the frozen 200-name holdout;
the remaining 800 train an order-three backoff model. A fifth-percentile plausibility floor is
derived from training self-likelihood only. The holdout is never used to filter, tune, or select a
generated candidate; it is consulted only after pages are fixed for exact-leakage and profile
classification reports. Each profile runs the same 30 declared seeds, fills an 80-candidate pool
within 10,000 attempts, and selects ten names with production's `0.70` MMR balance. Exact names
from both training partitions, `words.txt`, `common_words.txt`, `bigtech.txt`, and the existing
blocked substrings are rejected. Replay compares ordered raw-pool names, rejection counters, and
selected scores/order. The report separates class recalls, ties, signed margins, and balanced
accuracy; generated self-model classification is printed only as a circular sanity diagnostic.
The one exact spelling shared by both source profiles, `mori`, is reported and excluded from its
Japanese holdout denominator rather than being assigned an intrinsically ambiguous class.

**What passed.** Both profiles fill **30/30** pages and every 80-name pool. Same-process replay is
identical, training-corpus/dictionary/brand leakage is zero, every visible name scores at least 85,
and accepted-yield rates differ by only **1.21x** despite the English-biased compatibility filters.
Italian averages **90.48** technical composite and **0.892** ILAD with a **0.853** minimum page;
Japanese ASCII averages **90.50**, **0.889**, and **0.857**. Page-pair overlap averages
**0.14/10** and **0.29/10**, with maxima of two and three. After excluding the shared spelling,
the sealed classifier reaches **191/200 (95.5%)** Italian recall, **195/199 (98.0%)** Japanese
recall, no ties, and **96.7%** balanced accuracy. Thus the existing character model can distinguish
these selected spelling distributions without test-set calibration leakage.

**What failed.** The fixed cross-seed uniqueness gate requires at least 270/300 names per profile.
Italian reaches only **255/300** and Japanese ASCII only **220/300**. The untouched holdout also
catches four visible Japanese selections reconstructing two unique source names: `Tama` appears
three times and `Tomi` once. A read-only scan of canonical, ASCII, and inline-alternate strings plus
name-bearing, non-metadata alternate-table rows in the downloaded IT and JP dumps finds **159 exact
source collisions among 475 unique visible outputs**. Two are those holdout names and **157** are
raw-source-only; the total contains 47 four-letter, 61 five-letter, 44 six-letter, and seven
seven-letter strings. The selected-corpus edit-one diagnostic is also high: **119/300** Italian and
**213/300** Japanese selections. These are reconstruction and near-copy risks, not train leakage.
The audit is explicitly limited to IT/JP and must not be described as a global GeoNames check.

**Decision.** Product integration is rejected. The lane separates source profiles, but it repeats
too many short attractors, frequently reconstructs real place names, is filtered by English-centric
sonority and scoring rules, has no brief semantics, has not shown any reduction in Phase 141's
visible construction walls, and has no cultural or human-preference evidence. Raising temperature,
adding retries, or changing model order after seeing this result would need a newly preregistered
experiment; doing it post hoc merely to clear the frozen gate, hand-picking seeds, weakening
uniqueness, or celebrating circular self-model hits would game the proxy. Phase 31 already showed
that a structural proxy win can receive worse blind local-LLM quality ratings; this checkpoint
preserves the same boundary without calling those ratings human preference.

**Verification.** Rebuilding from the pinned dumps reproduces 1,000 unique tokens per file, the
documented derived hashes, and population floors of 4,556 and 15,763. The default probe exits one
on exactly the frozen holdout-leakage and cross-seed-uniqueness gates; with the four-file IT/JP
audit it also fails the explicit source-collision gate. Two fresh release processes produce
byte-identical output. All **160/160** core tests and the additional
all-target example/test harnesses pass. The production-path held-out audit retains all 49 gates and
the full Phase 141 baseline: **84.85** average quality, **0.197** similarity, **19.60/30** seed
spread, zero lexical hazards, and unchanged construction-saturation counts. No production Rust,
WASM, web selector, scorer, ranker, random source, or public API changed.

**Any future revival.** A successor must first retain the 30-seed mechanical gates, eliminate
presented global place/product/dictionary collisions through a reproducible review index, and add
brief-conditioned semantics rather than a decorative accent. Beside frozen Auto it must reduce
assembled-card share by at least ten points and lower single-shape walls by at least 25%, while all
49 production gates remain green. Production use then requires a candidate-vs-frozen-Auto study
whose inferential unit is the brief, not four correlated name rows from one prompt. Each proposed
profile is a separate study: 30 distinct unseen briefs contribute one blind full-page primary
choice each, while 12 concealed side-reversed repeats are quality control only and never enter
efficacy. All 42 decisions must be recorded; the candidate needs at least 21/30 primary page wins
(70%, with a 95% Wilson lower bound of 52.1%) and at least 10/12 consistent reversals. Fullness,
collisions, and all 49 production gates must remain green. One evaluator establishes only that
evaluator's preference, and no keeper-rate claim is allowed without a separately frozen keeper
definition. Until then the corpus and probe remain research artifacts only.

---

## Phase 143 — Reject fixed-budget exact-template rejection sampling

**Historical boundary and hypothesis.** A brief-root fragment followed by character-Markov
completion is not a new lane: Phase 69 already rejected that path after `Lexpedra`, `Nymetamanl`,
and `Nodecrafis`, while Phase 31 showed that a new subsyllabic generator could improve structural
proxies and still receive worse blind local-LLM ratings. A narrower untested variant available
without building another model was an explicit, separate “name like X” rejection sampler. This
phase asks one mechanical question: can the existing global BigTech character model fill good,
varied pages whose *spelling* has exactly the same consonant/vowel layout as a reference? It does
not claim prompt semantics, phonemes, language modeling, aesthetic quality, or a reduction in
Phase 141's ordinary Auto walls. A genuinely reference-conditioned onset–nucleus–coda model remains
a distinct, untested capability.

**Frozen standalone protocol.** A one-off `reference_template_probe.rs` trains the public order-three
backoff model on the 5,067 BigTech entries left after removing all eight declared references. Five
fixed seeds (`13`, `67`, `313`, `521`, `997`) each draw one shared, prompt-independent pool of
2,000 unique candidates at temperature `0.70` within 100,000 attempts. Candidates must pass the
existing BigTech phonotactic, sonority, one-to-three-syllable, scoring, and train-derived
fifth-percentile likelihood checks. Exact and edit-one matches against the complete BigTech,
`words.txt`, `common_words.txt`, `roots.txt`, and reference inventories are rejected through a
deletion-signature index. No suffix, transform, blend, concept join, production `generate()` call,
WASM path, or web ranker participates.

The eight frozen spelling templates deliberately cover distinct shapes: Slack `CCVCC`, Vercel
`CVCCVC`, Figma `CVCCV`, Spotify `CCVCVCV`, Sentry `CVCCCV`, Prisma `CCVCCV`, Asana `VCVCV`, and
Oracle `VCVCCV`, with `y` treated as a vowel to match the engine's existing letter heuristic. A
hard match has the same exact length and per-letter C/V sequence; this is explicitly orthographic,
not Wuggy-style phonological or G2P evidence. Every template/seed needed at least 30 eligible
matches before public `0.70` MMR selected ten. The causal control is an unconditioned ten-name MMR
page from the identical shared pool. The preregistered mechanical gates also require 40/40 full
pages, deterministic replay, zero selected blocklist hits, composite mean at least 84 and within
0.5 of control, ILAD mean/minimum at least `0.72/0.60`, at least 45/50 unique names per template,
zero duplicate page sets, seed overlap at most 1/10 on average and 3/10 maximum, and at least a
30-point overall and 20-point per-template fidelity uplift. Short-page overlaps are normalized to
ten by dividing the intersection by the smaller page before applying the overlap gates. Thresholds
and templates were not relaxed after the first result.

**What worked mechanically.** All five shared pools filled, requiring only 12,553–13,012 attempts,
and same-process replay preserved the full pool, counters, scores, and order. The 304 selection
occurrences were 100% exact C/V matches, versus 12% of the unconditioned controls matching any
declared pattern, for an 88-point diagnostic uplift. Every selected name retained the
composite-75 floor; exact/edit-one inventory leakage was zero. No complete page set repeated. Two
fresh release processes emitted byte-identical standard output.

**Frozen failures.** Exact templates were too sparse in a large shared pool. Minimum per-seed
capacity was Slack **1**, Vercel **43**, Figma **7**, Spotify **23**, Sentry **13**, Prisma **9**,
Asana **2**, and Oracle **3**; only Vercel cleared the required 30 in every seed. The matrix
therefore returned **304/400** selections rather than forty full pages. Per-template uniqueness
was respectively **10/16, 47/50, 30/41, 50/50, 42/50, 42/49, 18/24, and 21/24**
unique/selected occurrences; 50 remained the target for each template. Conditioned mean composite
fell from the shared-pool control's **92.84** to **88.38**, far beyond the allowed half point. Mean
ILAD was a healthy **0.826**, but the one-name Slack page made the minimum **0.000**. Eleven selected
occurrences, representing ten unique strings, visibly began with a full four-plus-letter root
followed by an opaque tail; `Pathly` was the repeat. Another 23/304 occurrences had a recognized
tech-suffix surface despite full-string Markov provenance. Normalized cross-seed overlap averaged
**1.35/10** and peaked at **10/10**, exposing repeated short-page attractors. In total seven frozen
gates failed: template capacity, full pages, visible root tails, quality retention, minimum page
diversity, per-template uniqueness, and normalized page overlap.

**Decision.** Product integration is rejected. Exact orthographic conditioning proves fidelity by
construction but starves common reference shapes, lowers selection quality, and still surfaces
awkward candidates such as `Predb`, `Flecq`, and `Credb`; it does not solve the judgment problem.
Increasing attempts or the pool after seeing these failures could change capacity and quality, but
would be a distinct, newly preregistered experiment rather than a rescue of this checkpoint.
Relaxing exact C/V distance turns the proposal back into the transparent local shape reranker
already shipped in Phase 92. A reference-conditioned onset–nucleus–coda sampler would be broader
new research, not a result closed by this run; Phase 31's worse LLM-rated unconditional sampler is
a warning for its acceptance protocol. This fixed-budget lane must not enter Auto, replace the
current reference profile, or be described as a Phase 141 construction-wall improvement. External
place/package/product collision checks and blind human preference were not run because the frozen
mechanical checkpoint already failed.

**Verification.** The standalone release example exited one on exactly the seven documented gates,
and two fresh processes returned identical standard output. Once the negative result was recorded,
the 788-line one-off harness was removed rather than adding an intentionally red, mutable-data
artifact with no product consumer; this mirrors the Phase 31 checkpoint. The release Rust suite
stays **160/160**. The production held-out audit retains all 49 gates and the exact Phase 141
baseline: **84.85** average quality, **0.197** similarity, **19.60/30** seed spread, zero lexical
hazards, and unchanged construction counts. No generator, ranker, scorer, random source, WASM API,
or UI behavior is changed by this phase.

---

## Phase 144 — Count matched taste evidence, not raw labels

**Bottleneck.** The product already had the complete local-feedback chain: project-scoped
like/pass storage, v2 export, offline composite audit, context isolation, personalized shortlist
selection, and a separate reference-name bootstrap. Its visible stopping rule was nevertheless
wrong for scorer research. Settings showed global liked/passed totals, and the Rust audit warned on
those same raw totals. Ten likes from project A plus ten passes from project B could therefore look
like the requested 10/10 sample while producing zero valid comparisons. A 1-by-10 Cartesian fan-out
could likewise look like ten pair rows even though only one liked example participated.

**Frozen evidence semantics.** Readiness now counts unique `(tasteContext.id, normalized name)`
endpoints that participate in at least one validated v2 `liked > passed` edge. Both endpoints must
carry the same non-legacy project context. Duplicate example rows and duplicate edges do not
inflate the sets; raw labels, Cartesian pair count, and legacy-unscoped pairs remain descriptive
only. The checkpoint is **10 matched likes and 10 matched passes**, with the number of contributing
project contexts reported beside it. Reaching 10/10 means only that one export is large enough for
a minimum descriptive audit. The existing recorder captures separate unary actions, not randomized
direct choices, so blinding and reversed-choice consistency remain explicitly **NOT EVALUATED**.

**What changed.** `web/src/lib/taste-data.ts` owns the shared matched-endpoint calculation without
changing the v2 schema or the exported comparisons. The active project status continues past the
three-signal personalization threshold toward 10/10, while Settings separates raw labels and
derived-pair count from matched likes, matched passes, and scoped context count. The Rust
`taste_audit` validates schema, indices, direction, and v2 context before building the same unique
endpoint sets. A single canonical export can report minimum-sample readiness; multiple files still
aggregate raw scores for descriptive inspection but never aggregate readiness. Their output warns
that v2 has no rater/profile/snapshot identity, so cumulative snapshots may double-count and only
one terminal export per independent profile should be supplied. README copy keeps the export's
privacy boundary explicit: briefs are present, API credentials and recent-name history are absent.

**Acceptance fixtures.** A disjoint 10-like/10-pass sample is fixed at 0/0 matched endpoints; one
same-context 10-by-10 sample produces 100 derived rows but only 10/10 endpoints; one like fanned to
ten passes stays 1/10; case-normalized duplicate rows and repeated edges stay 1/1; legacy-only data
stays 0/0; and readiness changes from false at 9/10 to true at 10/10. The Rust audit additionally
pins that descriptive multi-file aggregation leaves readiness endpoint sets empty.

**Verification and decision.** The focused TypeScript contract passes **20/20**, the Rust audit
passes **7/7**, the release core library remains **160/160**, and the production web build succeeds.
The production-browser taste workflow passes all **34** checks, including active, pass-only,
reference-only, reload, export, privacy, and matched-context progress behavior. The production
held-out audit remains **49/49** at the exact **84.85** average quality, **0.197** similarity, and
**19.60/30** seed-spread baseline with zero lexical hazards. This phase changes no generator,
scorer, ranker, random stream, persistence schema, network behavior, or WASM API. No real taste
export is present in the repository, so it cannot authorize new weights; broad scorer work remains
blocked pending actual matched labels and a separate preregistered, context-disjoint blind/reversal
study.

---

## Phase 145 — Stop shared Saved names from masquerading as taste evidence

**Contradiction.** Before this checkpoint, opening `#names=` wrote zero-score, contextless stubs
directly into `neologism:favorites`. The recipient had made no preference decision, but three
shared names could activate the legacy local profile and later export as three explicit likes.
Feedback mutation and card state were also keyed only by spelling, even though Phase 144 correctly
defined scoped evidence as `(tasteContext.id, normalized name)`. A spelling liked for project A
could therefore erase or light up the same spelling in project B.

**Frozen ownership model.** Explicit likes remain in `neologism:favorites`; future share imports
use the separate local-only `neologism:imported-saved` collection. Taste identity is project
context plus trimmed, case-normalized spelling, with historical unscoped feedback retained in its
own null-context compatibility bucket. Same-context like/pass remains mutually exclusive, while
opposite labels in different projects coexist. Settings, preference profiles, taste exports, and
Create/AI-Studio card state consume explicit feedback only. Saved is instead a spelling-deduped
projection of explicit likes plus imported names, preferring the fully scored explicit record when
both sources contain the same spelling.

**Migration and failure boundary.** The old share branch emitted one exact seven-field stub shape:
valid name/style, zero syllables and scores, and an empty connotation array. Only parsed rows with
that exact key set migrate; nonzero historical likes and rows with context or modern provenance
remain explicit. Migration writes the imported copy first. If that write fails, the original
durable key remains untouched while the recovered row is shown as imported-only Saved data, never
as taste, and later explicit feedback writes preserve that durable recovery copy; if the second
write fails, the two-key Saved projection dedupes the temporary copy and the next initialization
retries idempotently. New import writes retain the recovery hash on quota/privacy failure rather
than clearing the only transferable copy.

**Saved and share UX.** Saved retains source metadata while showing one card per normalized
spelling. Imported-only cards explicitly say that they came from a shared link and are not taste
evidence; combined cards report their scoped, legacy, and share sources. Removing a card backed by
more than one source requires an explicit “remove everywhere” confirmation and states that passes
are kept. Persistence is imported-first with best-effort compensating rollback and a visible
failure if either write cannot complete. TXT and JSON exports and forwarded links use the deduped
projection and contain only name and style. Share decoding now validates the array boundary,
nonempty bounded names, known styles, control characters, the 200-name limit, and the
32,768-character hash limit;
the encoder preflights the same collection-count and hash-length limits. Malformed rows are
discarded; malformed, non-array, and oversized payloads fail closed. The sender rejects 201 names
instead of creating a link the receiver would silently truncate.

**Acceptance evidence.** The pure identity/migration/removal fixture passes **19/19**, including
imported-first write failure, second-write retry, compensating deletion rollback, exact old-stub
recognition, context isolation, and Saved source counts. The share contract passes **8/8** and the
unchanged v2 taste-data contract passes **21/21**. The production browser taste workflow passes
**61/61** across share-only profile/export exclusion, duplicate imports, reload, quota recovery,
historical migration, malformed hashes and oversized collections, TXT/JSON/forwarded-link privacy,
provenance copy, confirm cancel/accept, transactional failure, and rejection preservation. A
deterministic Create identity contract passes **7/7**, proving project-scoped like/pass coexistence, mutual
exclusion, neutrality in a third project, and reload persistence. The separate AI Studio browser
contract passes **5/5**: imported-only and other-project copies do not light the star, the current-
project action adds its own row without mutating either source, and the exact context restores the
star. The existing preference contract remains green, the production web build succeeds, and the
release Rust library remains **160/160**.

**Decision.** This is a data-integrity repair, not an aesthetic or generator experiment. The held-
out production audit remains **49/49** at the exact **84.85** quality, **0.197** similarity, and
**19.60/30** seed-spread baseline with zero lexical hazards. No generator, scorer, ranker, random
stream, network call, taste-export schema, WASM API, or public Rust type changed; the only new
persistence surface is the provenance-specific imported-Saved key and its guarded migration. Real
matched labels are still absent, so scorer weights remain blocked. The later blind study now uses
30 distinct briefs as the inferential units: one primary full-page choice each, 12 side-reversed
quality-control repeats excluded from efficacy, at least 21/30 candidate wins, and at least 10/12
consistent reversals.

---

## Phase 146 — Make domain evidence honest before batching it

**Why the proposed batch stopped.** Availability was already a shipped utility: Phase 32 added
TLD/GitHub checks, Phase 36a expanded them to registry and package sources, and Phase 53 made
developer naming part of the product position. A Saved-shortlist batch was therefore the strongest
code-facing idea while new aesthetic weights remain evidence-blocked. The provider audit rejected
that implementation, however. Ten names would have multiplied the old card's ten simultaneous
requests into one hundred. GitHub's unauthenticated REST budget is 60 requests/hour; PyPI asks
high-volume clients to identify themselves; and crates.io requires API clients to send an
application-identifying User-Agent and stay at or below one request/second. Browser fetch cannot
set that protected header, the official sparse index is not CORS-readable from the app, and a raw
GitHub mirror was not accepted as an undocumented workaround. The phase therefore fixes the
existing evidence surface before adding any batch.

**Frozen boundary.** Opening **Name checks** performs zero network I/O. A second explicit action
runs exactly six domain observations for one supported spelling: RDAP registry evidence for
`.com`, `.ai`, `.app`, and `.dev`, plus DNS-only observations for `.io` and `.co`. The displayed
name is trimmed and lowercased only; spaces, punctuation, Unicode, labels longer than 63 characters,
and edge hyphens are unsupported rather than silently stripped or transliterated. GitHub, npm,
PyPI, crates.io, USPTO, and EUIPO are manual links marked **not evaluated**. They never enter a
result count or aggregate verdict and receive the displayed name only if the user opens the link.
No developer registry API is called automatically.

**Evidence semantics.** RDAP `200` is “registration record found” and `404` is “no registration
record found”; authentication failures, throttling, redirects, other HTTP failures, network errors,
and timeouts are inconclusive. DNS `NOERROR` with an answer is “DNS record observed,” empty
`NOERROR` is “no A answer,” and status 3 is “NXDOMAIN observed”; malformed/mismatched payloads,
SERVFAIL, and REFUSED fail closed. None of those labels says **available**, registrable, publishable,
clear, or legally safe. Rows distinguish provider, method, and network/cache/cooldown/not-run/
cancelled source; completed provider observations show their relevant timestamp. The panel states
that normal IP/request metadata accompanies the six lookups and that the result is point-in-time
evidence only.

**Network contract.** Only the four frozen origins—Verisign, Identity Digital, Google Registry,
and Cloudflare—are accepted. Requests omit credentials and referrers, bypass HTTP cache, reject
redirects, time out after ten seconds, and share a 30-second per-card ceiling. The session scheduler
caps global concurrency at four, permits only one active request per origin, and spaces same-origin
starts by at least one second. A 429 starts an origin cooldown and stops its queued sibling without
an automatic retry. Conclusive observations use a 256-entry in-memory LRU for exactly five minutes;
transport failures and throttling are never cached, concurrent identical work is coalesced, and a
reload clears everything. Coalesced transport has subscriber ownership: closing one card cannot
cancel another active card's shared request, while work with no remaining subscribers is aborted.
Closing a panel resets unfinished rows to not-run instead of inventing a network result.

**Acceptance evidence.** The directly runnable transport/state contract passes **33/33**. It pins
input boundaries; RDAP, DoH, HTTP, redirect, malformed, network, timeout, cooldown, and cancellation
semantics; exact 299,999/300,000 ms cache behavior; origin allowlisting; concurrency and spacing;
deterministic ordering; in-flight coalescing; and the combined case where the owner subscriber
aborts while another remains active. A separate production-browser fixture intercepts every HTTPS
request and passes **19/19**: opening sends zero, a valid explicit run sends exactly six allowed
hosts, all rows terminate, the same-session rerun sends zero and says cached, an unsupported Saved
name sends zero, reload restores six fresh requests, manual links issue no API calls, and no
unexpected external request escapes. CI uses only injected/intercepted transports; it does not
treat a live provider response as a stable test oracle.

TypeScript checking and the production web build remain green. The retained Phase 145 contracts
still pass 19/19, 8/8, 21/21, 61/61, 7/7, and 5/5; the Rust release suite remains 160/160; and the
49-gate held-out production audit remains green at quality 84.85, similarity 0.197, and seed spread
19.60/30 with zero lexical hazards.

**Decision.** Phase 146 is a correctness and privacy repair, not “clearance,” a ranking feature, or
a beauty signal. It changes no generator, scorer, ranker, taste state/schema, Saved identity,
random stream, WASM API, or Rust code. A shortlist batch can reopen only after every automated
namespace source has a provider-approved browser contract; it must then remain explicit, bounded,
ephemeral, and disconnected from result ranking. The relevant provider references are GitHub's
REST rate-limit and best-practice pages, PyPI's API policy, the crates.io policy RFC, Cloudflare's
DoH JSON documentation, and RDAP HTTP semantics in RFC 7480.

---

## Phase 147 — Make persisted passes actually reversible

**Bottleneck.** Phase 61 described **Not for me** as reversible, but the undo control existed only
on a currently visible card. Passed rows persist locally, affect later ranking, and enter the v2
taste export; after a reload or a new batch, there was no UI that could inspect or neutralize one
mistaken or stale pass. The 20,000-name recent-history window also makes waiting for the exact card
to reappear an unrealistic recovery path. This was a user-data correctness gap, not a request for
another taste proxy or ranking rule.

**Frozen boundary.** Settings now contains a default-collapsed **Review passed names** surface next
to the existing Local taste data summary and export. It renders only explicit negative rows—never
Saved or share-only names—and keeps one row per existing taste identity: project-context ID plus
trimmed, lowercased spelling, with a separate null-context legacy bucket. Scoped labels expose all
human-visible identity inputs already stored on the row: naming style, brief, and roots; an absent
context is labeled **Historical unscoped feedback** rather than inferred from the current Create
brief. Source mode remains descriptive. No timestamps or chronology are claimed because the schema
does not store them.

**Undo and failure semantics.** **Undo pass** is a remove-only action. It persists deletion of that
exact identity before mutating React state, then immediately updates the count, matched-evidence
progress, v2 export, active taste profile, and any matching visible card. It never converts the name
into a like or Saved entry. The same spelling passed in another project or in the legacy bucket is
untouched. If browser storage rejects the write, the row, profile, and export remain unchanged and
the surface shows a visible alert. A successful action announces the remaining count and moves
keyboard focus to the next Undo action, or back to the disclosure after the final row. Parsed
non-array rejected storage now fails closed to an empty in-memory list without rewriting the
durable value; valid arrays and the existing 200-row cap are unchanged.

**Acceptance evidence.** The directly runnable identity fixture passes **21/21**, including scoped,
cross-project, legacy, and unknown-row removal semantics. The production-browser contract passes
**26/26**. It seeds one spelling in project A, project B, and the legacy bucket; proves distinct
labels and exact deletion; checks summary, matched evidence, v2 export, live-card neutralization,
reload persistence, success announcement and focus, the final-row empty state, malformed non-array
loading, and a forced storage-write failure that leaves both UI and durable data intact. The
production build is green, and the retained taste/Saved browser contract remains **61/61**.

**Decision.** Phase 147 changes no `NameResult`, `TasteContext`, taste/storage/export schema,
generator, scorer, ranker, profile threshold, random stream, network path, Saved identity, WASM, or
Rust code. Settings already owns local taste counts and export, so the review stays there instead of
adding another top-level collection. The next separate accessibility checkpoint should make that
dialog and its model picker fully keyboard-modal; it is not bundled into this data-correction phase.

---

## Phase 148 — Make Settings genuinely keyboard-modal

**Bottleneck.** Settings rendered with `role="dialog"`, but opening it did not move focus inside,
Tab could reach the page behind it, closing did not restore the opener, and the dialog had neither
`aria-modal` nor heading/description relationships. Its themed model list was also mouse-only:
options selected on pointer down but exposed no combobox/listbox state or keyboard selection path.
That made an already-central local-data and optional-AI surface unreliable without a mouse.

**Frozen boundary.** This phase repairs only the existing Settings interaction and its visible
focus treatment. It adds no preference action, storage field, export field, network request,
provider, model default, generator/ranker behavior, or Rust/WASM surface. The existing editable
model field and 60-row display cap remain; the work makes their current behavior operable and
observable from the keyboard instead of replacing the control.

**Modal and focus contract.** The dialog is now named by its visible heading, described by its
introductory copy, and marked modal. Opening focuses the named close control. Forward and reverse
Tab traversal wrap inside every currently rendered enabled control, while Escape, Cancel, overlay
click, Save, and the close control all unmount through one opener-restoration path. Settings controls
receive a visible two-pixel focus ring; the passed-history disclosure uses an inset offset so its
ring is not clipped by the rounded overflow boundary. After the final pass is undone, collapsing
the still-open zero state moves focus to Cancel before the disclosure becomes disabled, preserving
modal ownership instead of briefly dropping focus to the document body.

**Combobox contract.** The model input now exposes editable combobox state and owns a labeled
listbox whose options carry selection state. Arrow Down/Up moves an active descendant while DOM
focus remains on the input; Enter selects it, the first Escape closes only the list, and a second
Escape closes Settings. Home and End retain native caret behavior. Active options scroll into the
260-pixel popup viewport. An exact typed model beyond the first 60 source rows is substituted into
the displayed cap and activated at its real displayed index, so Enter cannot silently replace it
with row one. Pointer selection remains supported and closes the popup without stealing input focus.

**Acceptance evidence.** The production keyboard fixture passes **48/48** against a mocked
65-model OpenRouter response. It verifies dialog naming/description, initial focus, two complete
forward and reverse Tab cycles, visible focus indicators, accessible control names, the final-pass
focus handoff, 60-row cap, native Home/End behavior, off-screen option scrolling, exact source row
65 selection, pointer selection, two-stage Escape, all close-path restoration, and exactly one
intercepted model-list request. The retained passed-review browser contract remains **26/26** and
the broader taste/Saved contract remains **61/61**. TypeScript checking and the production Vite
build are green.

**Decision.** This is an accessibility and interaction-correctness checkpoint, not an AI feature
or taste experiment. Settings now behaves like the modal it visually claimed to be, and the custom
model picker no longer trades themeability for keyboard exclusion. No generator, scorer, ranker,
random stream, storage/taste schema, network policy, Saved identity, WASM API, or Rust code changed.

---

## Phase 149 — Make Create filter popovers keep keyboard context

**Bottleneck.** The shared Phase 41 `Chip` control still treated Length, Creativity, and Advanced
as pointer-first popovers. Triggers exposed neither category-bearing names nor expanded/controlled
state. Escape from a choice or Advanced input removed the focused node and left focus on the
document body; keyboard choice activation did the same. Tabbing away left the old panel open, so a
keyboard user could reach another chip while the first disclosure remained visible. Existing
browser coverage opened these controls only with pointer clicks and never asserted focus.

**Frozen boundary.** The three Create chips remain nonmodal disclosures, and Advanced remains a
real form rather than an ARIA menu. This phase changes only their shared interaction semantics and
scoped focus treatment. It adds no arrow-key/roving-menu contract, focus trap, config option,
storage key, network request, generation/ranking rule, or taste behavior. Parent-owned values and
the existing pointer selection paths remain unchanged.

**Disclosure and focus contract.** Every trigger now reports its category and current value,
`aria-expanded`, and a stable `aria-controls` target. Its visible panel is an explicitly named
group; Length and Creativity choices expose exactly one selected `aria-pressed` state for canonical
presets. Enter or Space opens the disclosure. Escape and preset selection synchronously return
focus to the persistent trigger before closing. By contrast, Tab/Shift+Tab leaving the wrapper and
an outside pointer action close without restoring focus, preserving the browser-chosen destination.
That focusout policy also keeps ordinary keyboard and pointer switching to one open popup. Advanced
continues to skip its disabled Seed words field in Auto, retains native input behavior, and keeps
storage-neutral form values across close/reopen. A scoped two-pixel focus-visible ring covers chip
triggers, choices, and Advanced inputs without changing the rest of Create.

**Acceptance evidence.** The production Chromium fixture passes **46/46**. It verifies all three
dynamic accessible names, collapsed/expanded state, unique control IDs, named groups, ordered
choices, exact pressed state, Enter and Space opening, keyboard and pointer selection, visible
focus, Escape restoration, natural forward and reverse exits, outside-pointer focus preservation,
single-popup behavior, disabled-field skipping, `Starts with = z` preservation, and non-menu
Advanced semantics, plus 390-pixel and 320-pixel horizontal containment for the panel and focused
controls, and scroll-margin-backed vertical visibility for each keyboard-focused Advanced field at
320 pixels. The interaction starts no generation, leaves browser storage byte-for-byte
unchanged, records zero fetch/XHR calls, and lets no external request escape. TypeScript and the
production Vite build are green; the retained taste/Saved browser contract remains **61/61**,
including its existing pointer-driven Advanced reference workflow. The desktop panel stays fully
visible; narrow layouts keep it horizontally contained and scroll each keyboard-focused field with
its full ring visible.

**Decision.** Phase 149 fixes the highest-reach remaining keyboard context loss in the core Create
flow without widening it into a general menu system. It changes no Settings, NameCard/domain,
Saved, AI Studio, generator, scorer, ranker, random stream, storage/taste schema, network policy,
WASM API, or Rust code. Name checks still has a separate disclosure-order/accessibility gap and is
the strongest candidate for a later narrow checkpoint; it is not bundled here.

---

## Phase 150 — Keep keyboard context inside Name checks

**Bottleneck.** Phase 146 made domain evidence explicit and privacy-bounded, but its card disclosure
remained pointer-first. The controlled panel rendered before its persistent **Name checks** trigger,
so Enter or Space opened it while leaving focus on the trigger and forward Tab skipped Run plus all
six manual links. The trigger exposed no card-specific name, expanded state, or controlled region;
Escape did nothing. Starting a lookup also made the focused native button disabled, which Chromium
responded to by dropping focus to the document body. The Phase 146 browser fixture covered network
semantics through pointer actions but none of those focus failures.

**Frozen boundary.** Name checks remains an inline, nonmodal disclosure—not a menu, dialog, focus
trap, batch-clearance surface, or ranking input. This phase changes only NameCard DOM order,
per-card disclosure semantics, focus/cancellation behavior, scoped focus styling, and the existing
production-browser fixture. It does not change `domain.ts`, providers, requests, cache, scheduler,
timeouts, rate limits, evidence wording, manual-link destinations, generation, taste, Saved
identity, storage schema, WASM, or Rust.

**Disclosure and focus contract.** The action row now precedes its controlled panel in DOM order.
Every trigger is a real button named for its displayed card and reports `aria-expanded` plus a
stable unique `aria-controls`; the matching panel is a named `role="region"`. Pointer, Enter, and
Space opening all move focus into that region, where the next forward Tab reaches Run for a valid
label or skips the natively disabled Run action to GitHub for an unsupported spelling. Normal Tab
can leave without a trap. Escape from the region or any descendant closes it, uses the existing
abort/reset path, and restores the exact card trigger. Completed rows remain intact across a
close/reopen, while unfinished rows return to not-run and late responses cannot update the card.

**Busy-button contract.** Unsupported labels still use native `disabled` and send nothing. During a
valid run, however, Run stays natively focusable while exposing `aria-disabled` and `aria-busy`;
the existing early-return guard rejects repeated activation. The results grid mirrors busy state.
Terminal completion clears both states without moving focus, and Escape during delayed work can
therefore cancel without ever falling to the document body. Scoped two-pixel focus rings and
scroll margins cover the region, Run, trigger, and six manual links.

**Acceptance evidence.** The expanded production fixture passes **49/49** with every HTTPS request
intercepted. It pins unique per-card relationships, Enter/Space/pointer entry, zero-I/O opening,
visible focus, forward and reverse traversal, Escape restoration, exactly six requests despite a
repeated Enter, terminal focus retention, completed reopen, delayed-request cancellation and stale
response rejection, independent Create/Saved cards, unsupported-label skipping, cache/reload
behavior, the frozen provider/header/evidence contract, and no developer API or unexpected external
traffic. At 390 and 320 pixels it gates horizontal card/panel/row containment and full focus-ring
visibility for Run and all manual links. The direct interaction check keeps storage byte-identical;
the full reload lifecycle separately leaves every storage key except the app's operational
`recent` name history unchanged.

The unchanged domain transport contract remains **33/33**. Retained production-browser contracts
remain green at Taste/Saved **61/61**, Settings **48/48**, and Create filters **46/46**. TypeScript,
the production Vite build, and `git diff --check` are green.

**Decision.** Phase 150 closes the remaining keyboard context loss in the existing evidence
surface without expanding what that evidence means. A lookup is still a point-in-time observation,
manual services are still not evaluated, and none of these mechanics establishes availability,
registrability, ownership, trademark safety, or market clearance.

---

## Phase 151 — Contain the mobile app shell

**Bottleneck.** The responsive shell introduced in Phase 47 still forced all six navigation
controls into one unwrapped row below 900 pixels. Later additions raised that row's intrinsic
width to roughly 596 pixels, so a fresh 390-pixel page already had an oversized document and
opening Saved panned it to `scrollX=59`; at 320 pixels the pan reached `227`. That shift clipped
the logo, navigation, title, and toolbar even though the Saved toolbar itself wrapped correctly.
A second 320-pixel defect came from `.results-grid` retaining a 300-pixel minimum inside a
288-pixel content column. Existing responsive gates measured the already-panned card rather than
the document before focus could hide the original overflow.

**Frozen boundary.** This is a CSS-only shell and grid correction plus one deterministic
production-browser fixture and documentation. It does not hide or clip overflow, add a horizontal
scroller, reorder controls, shorten labels, change Sidebar or Saved markup, touch routing, storage,
networking, generation, ranking, taste, WASM, or Rust, or claim cross-browser conformance. The
unsemantic `.sidebar-nav` and `.sidebar-foot` wrappers may stop contributing flex boxes at the
narrow breakpoint; the outer `nav` and the original DOM/Tab sequence remain intact.

**Responsive contract.** At 640 pixels and below the shell may wrap while keeping the exact visual
and keyboard order `logo → Create → AI Studio → Saved → Settings → About`. All six targets are at
least 40 pixels high. At 640 and 560 pixels they still fit one row; at 390 and 320 pixels they form
a balanced three-plus-three layout without CSS `order`. At 560 pixels and below the results grid
uses `minmax(0, 1fr)`, allowing its card to shrink to the real content width. The document remains
at the viewport width with `scrollX=0`; no ancestor masks the result with `overflow-x`.

| Before | After |
| --- | --- |
| Fresh 390/320-pixel pages had an approximately 596-pixel document. | HTML, body, shell, sidebar, and page stay within the 390/320-pixel viewport. |
| Saved navigation panned horizontally to 59/227 pixels. | Real Create → AI Studio → Saved reaches the fresh snapshot at `scrollX=0`; Settings restores its opener afterward. |
| The 320-pixel results column forced a 300-pixel card into 288 pixels. | Grid and card use the available 288-pixel width. |
| Focus could conceal the initial overflow before a test measured it. | The regression snapshot is taken immediately after Saved navigation, before later focus movement. |

**Acceptance evidence.** The new `responsive-shell.mjs` production fixture passes **17/17** at
1280×900, 390×844, and 320×700. It hard-gates document/body width containment, zero horizontal pan,
absence of overflow masking, expected desktop/mobile shell placement, six visible non-overlapping
shell controls, natural Tab order, 40-pixel mobile targets, all four Saved toolbar actions, grid
and first-card containment, Settings opener restoration, byte-identical local/session storage, and
zero fetch/XMLHttpRequest calls or external HTTPS requests. The 390- and 320-pixel visual review shows
the balanced header rows and contained Saved content; this is production Chromium evidence, not a
cross-browser claim.

Retained production-browser contracts remain green at Create filters **46/46**, Name checks
**49/49**, Settings **48/48**, and Taste/Saved **61/61**. TypeScript and the production Vite build
are green; the focused fixture syntax check and `git diff --check` also pass.

**Decision.** Phase 151 removes a real shell-wide content-loss path with a narrow layout rule rather
than masking it. It does not change any naming or evidence behavior; it makes the existing controls
and Saved content reachable at the measured narrow widths while preserving their natural order.

---

## Phase 152 — Keep AI Studio honest when ranking fails

**Bottleneck.** AI Studio generated its 24-name pool locally before asking the optional model to
rank it, but a first HTTP failure left `pool` populated while `view` stayed empty. The notice was
nested inside metadata that rendered only for an existing ranked view, so the user saw zero cards,
zero warning, and the original “Generate a batch” empty state even though all 24 names had already
been sent. Native-disabling Generate also dropped keyboard focus to the document body. After one
successful metric, a later failed metric preserved the cards accidentally but relabeled them with
the newly selected metric. Rapid metric changes could additionally let a slower earlier response
overwrite the reasons/pick for the latest selection.

**Frozen boundary.** This phase changes only the AI Studio component state machine, its scoped
status/focus styling, one mocked production-browser contract, and documentation. It does not change
`judge.ts`, provider URLs or headers, request/prompt schemas, model settings, generation, Create,
scoring, taste, Saved, storage schemas, WASM, or Rust. There is no automatic retry, backoff, queue,
transport cancellation, raw provider error body, persistent pool/error state, or new concurrency
system. The existing judge still returns `null` on any incomplete or failed result; Studio now owns
an honest caller-side fallback.

**State and recovery contract.** The selected metric is no longer evidence of the displayed order.
Every successful ranked view stores the actual metric snapshot that produced its order, reasons,
and pick. A newly generated pool is installed immediately as **Unranked local pool** before the
model call. Failure never mutates that base view: the first failure therefore leaves all 24 names
in engine order with no AI reasons/pick, while a later failure leaves the last successful order,
reasons, pick, and label intact. The accessible alert names the attempted metric and the preserved
view. **Retry ranking** uses the same pool id, ordered names, and criterion snapshot with the current
model configuration; **Open Settings** uses the existing modal and opener-restoration contract.

One synchronous operation guard keeps Generate, metric chips, Custom Rank, and Retry focusable with
observable busy/disabled state while rejecting repeat activation. Request and pool ids bind each
response to the attempt that owns it. Retry remains in the DOM while pending; success moves focus
to the persistent metric control before removing the recovery action.
Custom criteria are frozen at request start, so later input edits cannot mislabel the response.

| Before | After |
| --- | --- |
| First 503 hid the already-generated 24-name pool and warning. | All 24 names remain visible in exact engine order under `Unranked local pool`. |
| Local fallback could be mistaken for an AI result. | It has zero AI reasons, zero pick, and never says `Ranked by Brandable`. |
| Failed Premium selection relabeled the preserved Brandable order. | Metadata remains `Ranked by Brandable`; the alert separately names the failed Premium attempt. |
| Generate/Retry disabling could move focus to `BODY`. | Busy controls remain focusable, guarded, and restore persistent focus before transient actions disappear. |
| Rapid actions could start competing calls or drift the selected metric. | One pending operation accepts no duplicate or competing request. |

**Acceptance evidence.** The new `ai-studio-failure.mjs` production fixture passes **33/33** with
mocked OpenRouter responses. At 390 pixels it freezes the exact 24-name Brandable request, forces a
503, verifies local order/no reasons/no pick/no false empty state, visible `role="alert"`, Generate
focus, Settings open/close focus restoration, no automatic retry, and one same-pool/same-criterion
Retry despite repeated activation. Successful recovery requires 24 reasons, one pick, the true
Brandable label, and focus on the Brandable chip. A separate 320-pixel path establishes a successful
Brandable view, holds a Premium request while rapid Premium/Playful actions are rejected, then
verifies that failure leaves the complete prior view byte-identical. Premium Retry must reuse its
snapshot and replace the view only after a complete success. Both widths gate alert/action/card
containment, `scrollX=0`, byte-identical browser storage, no unexpected external HTTPS request or
page error, and no model-list burst. Visual review confirms the warm warning surface, readable
recovery actions, visible Generate focus, and contained single-column cards at both widths.

Retained production-browser contracts remain green at Studio taste identity **5/5**, Settings
**48/48**, responsive shell **17/17**, and Taste/Saved **61/61**. TypeScript, the production Vite
build, fixture syntax, and `git diff --check` are green.

**Decision.** Phase 152 makes the optional judge fail without destroying or misrepresenting local
work. It improves truth and recovery only; it does not claim that the fallback was AI-ranked, that
the provider recovered automatically, or that a successful model judgment is objectively better.

---

## Phase 153 — Recover like/pass switches without claiming atomic storage

**Bottleneck.** A like-to-pass or pass-to-like switch wrote two separate `localStorage` keys in
sequence. If removal from the old collection succeeded but the new-label write failed, durable
storage could disagree with React state; the same scoped identity could reload as both liked and
passed. The failure escaped as an unhandled page error, no user-facing status explained what was
durable, and a natively focused card action could not be trusted as confirmation of success.

**Frozen boundary.** This phase changes only the shared taste-identity/storage operation, the two
App-owned feedback handlers, one global local error surface, focused pure/production-browser
contracts, and documentation. It does not add a storage key, journal, timestamp, schema migration,
automatic repair scan, network request, generator/scorer/ranker change, taste-weight change, Saved
identity change, WASM surface, or Rust change. `localStorage` is not described as transactional or
atomic across keys. Historical contradictory records are not silently migrated; activating either
already-selected side removes that exact side through the existing neutral action.

**Durable-state contract.** The shared operation derives identity from the existing project context
plus normalized spelling. A switch removes and persists the old label first, then writes the new
label. If the old-label removal fails, the target write is never attempted and UI remains on the
previous choice. If the target write fails, the app makes one best-effort write restoring the old
label. Successful rollback projects the previous durable choice back into both Create and AI
Studio. If rollback also fails, the first removal is the only durable mutation, so both stored and
visible state become neutral and the alert says that the old choice could not be restored. A
single-key add/remove failure likewise leaves its previous state intact. Every result updates the
favorite and rejected refs together, preserves the existing 200-pass cap, and clears the transient
alert on the next successful feedback action; the alert itself is never persisted.

| Before | After |
| --- | --- |
| A second-key failure could leave one identity durably liked and passed. | The old label is removed first; failure restores it or resolves honestly to neutral, never to a transaction-created double label. |
| UI state advanced before both writes were known. | Both feedback collections are projected from the operation's reported durable result. |
| Storage failure surfaced as an unhandled page error with no recovery boundary. | A shared accessible alert explains whether the previous choice was kept or the name became neutral. |
| Create and AI Studio could diverge in failure behavior. | Both call the same App-owned operation and retain focus on the invoking card action. |
| The rejected-history limit lived only in the old toggle helper. | The shared operation retains the exact bounded 200-row behavior. |

**Acceptance evidence.** The dependency-free storage/identity contract passes **30/30**, including
both switch directions, old-label failure short-circuiting, target-write failure with successful
rollback, rollback failure in both directions, single-key failure, the 200-pass cap, and repair of
one side of a historical conflict. The new production `feedback-transaction.mjs` fixture passes
**20/20**. It forces liked-to-passed and passed-to-liked failures, verifies exact durable/UI state
and invoking-control focus, reloads the restored state, then forces target plus rollback failure and
gates an honest durable/visible neutral result. Its 390-pixel path confirms the sticky alert is
readable and horizontally contained; visual review confirms it does not cover the active card
controls. The same failure surface and focus contract pass in mocked AI Studio. All forced failures
produce zero page errors and zero unexpected external HTTPS requests.

Retained production-browser contracts remain green at Create taste identity **7/7**, Studio taste
identity **5/5**, Taste/Saved **61/61**, passed review **26/26**, and Settings keyboard **48/48**.
TypeScript, the production Vite build, fixture syntax, and `git diff --check` are green.

**Decision.** Phase 153 closes a reproducible partial-write contradiction without pretending that
browser storage offers a cross-key transaction. The product now reports the strongest durable truth
it can prove after each attempted switch; broader backup/restore, automatic conflict migration, and
multi-key journaling remain separate product decisions.

---

## Phase 154 — Make exact likes reviewable without deleting Saved everywhere

**Bottleneck.** Settings exposed explicit likes only as an aggregate count, while Saved deliberately
collapsed one spelling across project A, project B, historical unscoped feedback, and a shared copy.
Its removal action therefore had to mean “remove everywhere.” Once a generated card disappeared,
there was no user path to make only project A's like neutral while preserving project B, the legacy
row, and the shared Saved spelling. The exact identity already existed in storage and exports; the
missing piece was a reversible product surface.

**Frozen boundary.** This phase adds one collapsed explicit-like review to Settings, an App-owned
persist-before-state undo handler, shared scoped styling with the existing passed review, one
production-browser contract, and documentation. It does not change the Saved spelling union or its
global removal confirmation, imported-share storage, `NameResult`, `TasteContext`, taste/export
schema, ranking weights, generation, network behavior, WASM, or Rust. The surface contains only
explicit favorites; imported-only Saved names never enter it. Undo removes the exact existing
`(tasteContext.id | null, normalized spelling)` like and makes it neutral—it never creates a pass.
No chronology is shown because feedback rows have no timestamp.

**Interaction and durable-state contract.** `removeFavorite` persists before Settings mutates the
favorite ref/state. A rejected browser-storage write therefore leaves the row, counts, evidence,
export, and Saved provenance unchanged while exposing an alert inside that review section. Success
updates the Local taste summary, matched evidence, v2 export, and Saved's aggregated source note from
the same App state. Focus moves to the next available **Undo like**, or back to the still-open
disclosure after the final row. Collapsing that now-empty disclosure uses the existing Settings
handoff to Cancel, so modal focus never falls to the page. The review and passed sections cannot
flex-shrink and clip hidden rows on a narrow modal; the modal owns scrolling while each list retains
its bounded internal scroll.

| Before | After |
| --- | --- |
| Three same-spelling likes appeared as one Saved card with only remove-everywhere control. | Settings renders project A, project B, and historical unscoped likes as three explicit rows. |
| Neutralizing project A also risked deleting project B and a shared copy from Saved. | Exact undo removes only project A; every other like, pass, and imported Saved row stays durable. |
| Removing the final explicit like could erase the recipient's shared shortlist entry. | The shared card remains and is relabeled `not taste evidence`; taste export becomes disabled when no labels remain. |
| A failed favorites write had no dedicated review-row recovery contract. | The row/count remain unchanged, a visible alert explains the failure, and focus stays on its Undo action. |
| Narrow flex layout could clip expanded review rows behind an overflow-hidden section. | Review sections keep their content height and the modal scrolls, with rows/actions contained at 390 pixels. |

**Acceptance evidence.** The new `liked-history.mjs` production fixture passes **26/26**. It seeds
one spelling as project A, project B, and historical-unscoped likes plus a separate shared Saved copy;
the opposite labels make scoped/legacy evidence changes observable. The fixture gates collapsed
counts, distinct context/source labels, exclusion of the shared row, zero writes while reviewing,
exact project-A removal, next-action focus, unchanged passes/import, Local taste summary and evidence,
v2 export, one deduplicated Saved card with corrected provenance, and reload persistence. A separate
final-like case proves that the share-only card survives, does not enable taste export, and is labeled
not taste evidence. Forced favorites-key failure retains durable/UI state and invoking focus with no
page error. At 390 pixels, the expanded section must have no clipped content and every row/action must
stay inside the modal; visual review confirms all three rows remain reachable and readable.

Retained production-browser contracts remain green at passed review **26/26**, Settings keyboard
**48/48**, feedback transaction **20/20**, and Taste/Saved **61/61**. TypeScript, the production Vite
build, fixture syntax, and `git diff --check` are green.

**Decision.** Phase 154 completes the reversible unary-feedback pair without changing what Saved
means. Settings now owns exact evidence repair; Saved remains the spelling-deduplicated shortlist.
This is still user-authored unary feedback, not a direct blind comparison or evidence for scorer
weight changes.

---

## Phase 155 — Give every Why explanation an accessible owner and state

**Bottleneck.** Every result card already had a native **Why** button, but all cards exposed the same
accessible name and no expanded/controlled relationship. A keyboard user could open the text with
Enter, yet assistive technology could not tell which name the button described or whether its region
was open. Escape did nothing, and the asynchronously populated explanation had no named live/loading
boundary. The disclosure was visually present but semantically anonymous.

**Frozen boundary.** This phase changes only `NameCard` disclosure semantics/keyboard handling, one
mock-free production-browser contract, and documentation. It does not change `explainName`, WASM,
the explanation copy or scores, card layout, Name checks, generation, ranking, taste, Saved, storage,
network policy, or Rust. The region has no interactive descendants, so opening intentionally keeps
focus on its persistent trigger and ordinary Tab continues to Name checks. It is a named nonmodal
region, not an ARIA menu, dialog, or focus trap.

**Interaction contract.** Each card owns a stable `useId` target. The visible **Why** label remains
unchanged, while its accessible name includes the displayed name and exposes `aria-expanded` plus
`aria-controls`. The matching region includes the name, polite live behavior, and `aria-busy` while
the local explanation is unresolved. Enter, Space, and pointer activation share the existing toggle.
Escape on an open trigger closes only that card, stops propagation, and leaves focus on the same
button. Other cards may remain open independently; no global accordion behavior is invented.

| Before | After |
| --- | --- |
| Ten repeated controls were announced only as `Why`. | Each is announced as `Why <name> was generated`. |
| Open state and ownership were not machine-readable. | Every trigger exposes expanded state and one unique controlled region. |
| Explanation loading appeared as an anonymous ellipsis. | The named region exposes polite live and busy state until substantive local text resolves. |
| Escape on the focused open control did nothing. | Escape closes only that card and focus remains on its exact trigger. |
| The expanded text had no declared interaction model. | It is explicitly a nonmodal region with no extra Tab stop, menu semantics, or focus trap. |

**Acceptance evidence.** The new `why-disclosure.mjs` production fixture passes **16/16**. It creates
two deterministic cards and gates distinct card-specific button names, false collapsed state, unique
control ids, Enter/Space/pointer activation, independent simultaneous regions, persistent trigger
focus, region name/live/busy semantics, substantive completed explanation text, and Escape closing
only the focused card. Tab moves directly from Why to the same card's Name checks; no hidden focus
stop is introduced. At 390 pixels the expanded region stays inside its card. The fixture snapshots
post-generation fetch/XHR/storage state and proves Why interactions add no request or write, with
zero unexpected external HTTPS requests and zero page errors.

Retained production-browser contracts remain green at Name checks **49/49** and Taste/Saved
**61/61**. TypeScript, the production Vite build, fixture syntax, and `git diff --check` are green.

**Decision.** Phase 155 makes an existing explanation honestly operable without redesigning it or
claiming broader accessibility conformance. The same local analysis is now owned, named, stateful,
and keyboard-dismissible on every card.

---

## Phase 156 — Make clipboard rejection visible and retryable

**Bottleneck.** Card **Copy**, Saved **Copy all**, and Saved **Share link** all called
`navigator.clipboard.writeText(...).then(...)` without handling rejection. A browser permission,
privacy-mode, or clipboard failure therefore produced no visible explanation and could surface as an
unhandled Promise rejection. The success icon usually stayed off, but absence of a checkmark was not
an actionable failure state. Share link's surrounding synchronous `try/catch` did not catch its
asynchronous clipboard rejection.

**Frozen boundary.** This phase changes only the three existing clipboard actions, their card/Saved
error surfaces, one forced-failure production-browser contract, and documentation. It does not add a
clipboard fallback, permission prompt, retry loop, toast framework, storage key, network request,
share/export schema, Saved identity change, generation/ranking change, WASM, or Rust. The visible
toolbar labels and share payload remain unchanged. Encoding-size failures are still reported from
`encodeShareUrl`; clipboard-access rejection gets its own fixed message.

**Success and failure contract.** Every action clears its prior local error at the start of a user
retry and awaits exactly one clipboard write. Only a resolved write enables the existing transient
check state. Rejection forces that success state off, exposes `role="alert"` beside the responsible
card or Saved toolbar, and leaves focus on the persistent invoking button. A later success removes
the alert. Card Copy also exposes a name-specific accessible label—`Copy <name>` or `<name> copied`—
so the icon-only transition is observable without sight. None of these paths writes browser storage.

| Before | After |
| --- | --- |
| Clipboard rejection was silent and potentially unhandled. | A visible local alert explains that browser clipboard access was denied. |
| The missing success icon was the only failure clue. | Failure explicitly clears success state; success appears only after the awaited write resolves. |
| Card Copy buttons were repeatedly announced only by the generic title. | Each button names its card and announces the short-lived copied state. |
| Saved share-link encoding and clipboard failure shared an ineffective catch boundary. | Encoding errors and clipboard-access errors are handled in two explicit stages. |
| Retrying had no frozen recovery contract. | One activation means one write attempt; successful retry clears the alert and preserves exact payload/order. |

**Acceptance evidence.** The new `clipboard-failure.mjs` production fixture passes **18/18** with a
deterministic clipboard that rejects calls 1, 3, and 5 and accepts calls 2, 4, and 6. Card Copy failure
must show the exact name-specific alert, keep its icon/accessible name in the unsucceeded state, retain
focus, and fit inside the card at 390 pixels. Retry must first write `Noma`, then expose the copied
label/icon in one browser snapshot. Saved Copy all must similarly recover to the exact ordered
`Noma\nOrbit` shortlist. Share-link rejection must preserve the previous clipboard value and remain
distinct from encoding failure; retry must produce the unchanged two-row `n,s` payload. All six
activations produce exactly six clipboard attempts, byte-identical storage, zero external HTTPS
requests, and zero page errors. Visual review confirms the card-attached and page-level red surfaces
are readable, contained, and do not obscure their retry controls at 390 pixels.

The retained production Taste/Saved contract remains green at **61/61**, including successful
forwarded share-link decoding. TypeScript, the production Vite build, fixture syntax, and
`git diff --check` are green.

**Decision.** Phase 156 turns a silent browser capability failure into local, honest recovery without
inventing a new notification system or fallback clipboard. Users can distinguish “not copied” from
“copied,” retry the same action, and keep their Saved/taste data untouched.

---

## Phase 157 — Keep AI settings truthful when browser storage rejects a save

**Bottleneck.** Settings updated the running `judgeConfig` before attempting its local-storage write,
while `saveJudgeConfig` swallowed quota/privacy errors and returned no result. A rejected write
therefore closed the dialog and made the current session look saved even though reload restored the
older provider/model/key/prompt. There was no visible failure or honest retry path.

**Frozen boundary.** This phase changes only the existing judge-config persistence return value,
the App-to-Settings save handshake, one local modal alert, one forced-failure production fixture,
and documentation. It does not change the judge request, provider/model discovery, key location,
config shape or storage key, AI Studio ranking, taste/Saved data, generator/ranker, WASM, Rust, or
network policy. The retained AI Studio fixture also narrows its `Generate` locator to an exact
accessible-name match; this repairs a test ambiguity introduced when Phase 155 named card Why
controls, without changing product behavior.

**Persistence and focus contract.** `saveJudgeConfig` now reports success. App persists first and
updates its in-memory config only after that write succeeds. On rejection, Settings remains open,
keeps the edited draft, exposes `role="alert"`, and leaves Save focused. The new alert cannot push the
focused retry action outside the 390-pixel modal viewport: the existing scroll owner brings Save to
the nearest visible edge after the alert mounts. Cancel then reveals the unchanged in-memory config
on reopen. A later successful Save closes normally, restores the Settings opener, and survives reload.

| Before | After |
| --- | --- |
| The running AI config changed before durable storage was known to succeed. | Durable write succeeds first; only then does App replace `judgeConfig`. |
| Storage rejection was swallowed and Settings closed as if saved. | The dialog stays open with an exact visible error and the edited draft intact. |
| Cancel after a failed write could leave the session pretending to use unsaved values. | Cancel discards the draft; reopening shows the previous durable/in-memory config. |
| Adding an alert could push the focused retry button below the modal viewport. | Error and focused Save are both visible and contained at 390 pixels. |
| The retained Studio test's loose `Generate` locator also matched `Why <name> was generated`. | Both Studio Generate locators require the exact accessible name. |

**Acceptance evidence.** The new `settings-storage-failure.mjs` production fixture passes **13/13**.
It seeds an enabled OpenRouter config, rejects exactly the first `neologism:judge` write, edits only
the key, and proves the modal/error/draft remain visible, Save retains focus, and the previous durable
config remains authoritative. At 390 pixels, both the alert and focused retry action must fit inside
the scrollable modal; visual review confirms the compact red surface remains readable above
Cancel/Save without overlap. Cancel restores the Settings opener, and reopening shows no false
in-memory update. A second Save succeeds exactly once, restores the opener, survives reload, leaves
every non-judge key byte-identical, and produces no page error.

Retained production-browser contracts remain green at Settings keyboard **48/48** and AI Studio
failure/recovery **33/33**. TypeScript, the production Vite build, fixture syntax, and
`git diff --check` are green.

**Decision.** Phase 157 makes the optional AI configuration obey the same durable-state honesty as
feedback and clipboard recovery. A browser-storage failure can no longer create a session-only
configuration that looks saved; the user sees what stayed durable and can cancel or retry directly.

---

## Phase 158 — Validate local AI settings before they reach the UI

**Bottleneck.** `loadJudgeConfig` treated every parseable JSON value as a typed partial config and
spread it over defaults. A numeric `model` reached Settings' string normalization and could crash the
modal; a numeric localhost `endpoint` reached `isJudgeReady().trim()` and could crash AI Studio.
Arrays and other non-object JSON also entered the config boundary. Parse errors were safe, but
parseable corruption was not.

**Frozen boundary.** This phase changes only judge-config load validation, one production fixture,
and documentation. It does not change the storage key or saved shape, automatically delete/migrate
data, expose the API key, alter provider/model discovery, add a corruption banner, change the Phase
157 write/retry contract, touch AI ranking, generator/ranker, taste/Saved, WASM, Rust, or network
policy. Existing partial configs remain compatible.

**Validation and recovery contract.** The loader accepts a non-array object, validates `enabled`, the
two provider values, all optional string fields, and finite non-negative price fields, then copies
only those known fields over current defaults. Unknown future fields are ignored in memory. If any
known field has the wrong type, or the parsed value is not an object, the entire in-memory config
falls back to the safe disabled default. Loading never rewrites the raw local record: this preserves
the evidence and avoids a destructive repair-on-read. Opening Settings and explicitly saving the
default draft is the recovery action that replaces the invalid record with the current valid shape.

| Before | After |
| --- | --- |
| Parseable JSON was trusted as `Partial<JudgeConfig>` without runtime checks. | Every known field crosses an explicit type/value boundary before use. |
| Numeric `model` could crash Settings at `.toLowerCase()`. | Settings opens with the disabled safe default and no page error. |
| Numeric localhost `endpoint` could crash AI Studio at `.trim()`. | Studio remains unconfigured and offers its existing Open Settings action. |
| Arrays and non-object JSON could spread into a misleading hybrid config. | Non-object values fail closed to the complete current default. |
| A defensive read risked silently destroying the corrupt or forward-version record. | Raw storage stays byte-identical until explicit Save; unknown fields remain untouched on read. |
| Old partial configs depended on unchecked spreading. | Valid partial configs still inherit current model/prompt defaults and retain their valid endpoint. |

**Acceptance evidence.** The new `settings-corrupt-config.mjs` production fixture passes **17/17**.
Four isolated browser profiles cover a wrong-type OpenRouter model, wrong-type localhost endpoint,
a parseable array, and a valid partial localhost config carrying an unknown future field. It proves
Settings and Studio do not crash; invalid records use the disabled safe config while remaining
byte-identical on read; explicit Save produces a valid current config that remains safe after reload;
the partial legacy endpoint and enabled state survive; omitted fields inherit the current prompt;
unknown data is not erased by a read; and every profile produces zero page errors.

Retained production-browser contracts remain green at Settings keyboard **48/48**, Settings write
failure/retry **13/13**, and AI Studio failure/recovery **33/33**. TypeScript, the production Vite
build, fixture syntax, and `git diff --check` are green.

**Decision.** Phase 158 closes the remaining local AI-config trust gap without inventing a migration
system. Optional AI can now fail closed both when a valid save is rejected and when the pre-existing
record itself is parseable but invalid, while deliberate user Save remains the only repair mutation.

---

## Phase 159 — Persist reference names before changing the active taste profile

**Bottleneck.** Advanced **Names you like** changed App's `tasteReferences` and therefore the local
selection profile before calling `saveTasteReferences`. That storage helper swallowed quota/privacy
errors. A rejected write therefore looked applied in the field and 3/3 progress, influenced the
current session's ranking, and then disappeared on reload without any visible warning.

**Frozen boundary.** This phase changes only the existing reference-string write result, the App-to-
CommandBar update handshake, one field-local alert, one forced-failure production fixture, and
documentation. It does not change the storage key or 240-character cap, reference parsing/profile
math, candidate pools, ranking weights, Advanced disclosure semantics, explicit likes/passes,
taste export, generator, WASM, Rust, or network behavior. No draft store or new schema is added.

**Persistence, focus, and retry contract.** `saveTasteReferences` now reports success. App attempts
that one write before replacing the active reference string. Rejection leaves both the controlled
field and local profile on the previous durable value, returns the DOM input to that value even on a
repeated same-message failure, and exposes an inline `role="alert"` included in the field's accessible
description. Focus stays in the input. Retyping is a normal retry; only a successful write changes
the input/progress/profile and clears the alert. The existing Advanced panel remains the visual owner.

| Before | After |
| --- | --- |
| The session profile changed before reference storage was known to succeed. | The local write succeeds first; only then does App activate the new references. |
| Rejection left the edited field and 3/3 progress looking durable. | Field, progress/help, and ranking direction remain on the previous durable references. |
| Reload was the first sign that the user's reference names had been lost. | An inline alert explains the failure at the responsible field immediately. |
| There was no defined retry or focus behavior. | The same focused input retries one write; success clears the alert and survives reload. |
| A narrow popup could make recovery text or the focus ring hard to inspect. | Error and full 2-pixel input ring remain contained in Advanced at 390 pixels. |

**Acceptance evidence.** The new `taste-reference-storage-failure.mjs` production fixture passes
**13/13**. It seeds `Vercel, Linear` as a durable 2/3 profile, rejects exactly the first reference-key
write, and proves the exact alert, old field value, old progress/help, old durable string, and input
focus all remain truthful. At 390 pixels the alert and full focus ring must fit inside the named
Advanced group; visual review confirms the compact red copy remains readable without crowding the
disabled and optional filters below it. The second identical edit performs one successful retry,
activates `Vercel, Linear, Notion` and 3/3 guidance, clears the alert, retains focus, and survives
reload. Every non-reference local key remains byte-identical, with zero external HTTPS request or
page error.

Retained contracts remain green at Create-filter keyboard **46/46** and the 100-page personalized
taste quality audit, including all structural, affinity, semantic-retention, and retry-spread gates.
TypeScript, the production Vite build, fixture syntax, and `git diff --check` are green.

**Decision.** Phase 159 makes reference-name teaching obey the same durable-state honesty as explicit
feedback and AI settings. A browser-storage failure can no longer silently steer only the current
session or advertise progress that reload will erase; the previous profile stays authoritative until
the user's retry is actually stored.

---

## Phase 160 — Fail closed on corrupt recent-name history

**Bottleneck.** `loadRecent` trusted every parseable JSON value as `string[]`. A stored object or a
mixed array therefore crossed into the generator's `exclude` input and could stop Create from
producing a page. The browser fixture was deliberately run against the old production build first:
both corrupt shapes remained intact on read, but each failed to produce ten cards or repair itself;
the valid-array control continued to work.

**Frozen boundary.** This phase changes only recent-history runtime validation, central ownership of
the existing 20,000-name cap, one production-browser fixture, and documentation. It does not change
the `neologism:recent` key, generator or ranker behavior, fuzzy/stem exclusion windows, recent-history
reset UX, taste/Saved data, schemas, WASM, Rust, or network behavior. Recent history remains
operational state rather than user evidence, so corruption does not add a new warning surface.

**Validation and recovery contract.** The loader parses to `unknown` and accepts only an array whose
every element is a string. Valid input is reduced to its newest 20,000 entries. Invalid or
unparseable input becomes an empty in-memory exclusion list without rewriting the raw record during
the read. A later successful Generate still follows the ordinary `markSeen` path, so it stores the
ten names actually shown as a valid replacement. Saving applies the same exported cap, and App uses
that single shared constant rather than maintaining a second policy value.

| Before | After |
| --- | --- |
| Parseable storage was cast to `string[]` without checking its shape. | Only an all-string array enters the generator exclusion boundary. |
| Objects and mixed arrays could prevent a full Create page. | Both fail closed to an empty in-memory history and Create returns ten cards. |
| A defensive read risked silently erasing the corrupt record. | The read is non-destructive; normal successful generation performs the repair. |
| Load and App each relied on an implicit capacity assumption. | Load, save, and App share one explicit 20,000-name window. |
| Oversized valid arrays had no direct production-browser gate. | The newest tail is retained exactly and ends with the ten currently shown names. |

**Acceptance evidence.** The new `recent-history-corruption.mjs` production fixture passes **18/18**
after the pre-fix red reproduction. Isolated 390-pixel profiles cover a parseable object, a mixed
array, a valid two-name history, and 20,005 valid names. They prove non-destructive reads, full
ten-card pages, valid repair, preserved valid prefixes, exact 20,000-name tail capacity, current-page
names at the end of that tail, unrelated local-storage stability, and zero page errors or external
HTTPS requests.

Retained production contracts remain green: the personalized-session audit sustains all four
100-name sessions, keeps each visible page unique and its browser history equal to the names actually
shown, and the brief-session fixture reaches 100 unique names without false exhaustion. TypeScript,
the production Vite build, fixture syntax, and `git diff --check` are green.

**Decision.** Phase 160 closes a local-data trust gap at the narrowest boundary. Corrupt operational
history can no longer disable the core offline Create flow, valid history keeps its existing long-
session semantics, and recovery remains an ordinary successful generation rather than a destructive
or noisy read-side migration.

---

## Phase 161 — Make local Why failures terminal and retryable

**Bottleneck.** `NameCard` caught and discarded every `explainName` rejection. The controlled Why
region therefore remained `aria-busy=true` with only an ellipsis forever, even though no work was
still running and the persistent trigger retained focus. A production-browser fixture rejected the
first WASM load against the pre-fix build: ten of twelve intended behaviors already passed, while the
terminal busy state and honest recovery guidance were the exact two failures.

**Frozen boundary.** This phase changes only NameCard's local explanation state, one forced-failure
production fixture, and documentation. It does not change explanation scoring or copy on success,
WASM exports, engine initialization, generation, ranking, Name checks, Saved/taste identity, storage,
network policy, card layout, or Rust. It adds no retry button, timer, automatic retry, or new schema.

**Failure, focus, and retry contract.** Opening Why still starts one local explanation and announces
busy state in the existing named live region. Rejection clears busy state and replaces the ellipsis
with “Explanation unavailable — close and reopen Why to retry.” The persistent Why trigger keeps
focus, so Escape closes the same disclosure normally. Reopening while no successful explanation is
cached clears the prior error and starts one retry; success replaces the guidance with the existing
structural explanation. A monotonically increasing request identity prevents a late completion for
an old card name from populating the current result.

| Before | After |
| --- | --- |
| A rejected local explanation was silently swallowed. | The named live region reaches a visible terminal failure state. |
| `aria-busy` remained true forever after failure. | Busy clears as soon as the local request rejects. |
| The ellipsis gave no recovery path. | Copy tells the user to close and reopen Why for one natural retry. |
| Recovery behavior was accidental and untested. | The forced first failure and successful second WASM load are production-gated. |
| An old asynchronous completion had no explicit result-name boundary. | Per-card request identity discards stale completions after the result changes. |

**Acceptance evidence.** The new `why-failure.mjs` production fixture passes **13/13** after the
two-gate pre-fix failure. A 390-pixel Saved card receives one imported-only name, aborts its first
local WASM request, and proves busy-to-error completion, exact guidance, card containment, trigger
focus, Escape close, reopen retry, substantive successful explanation, and exactly two local WASM
starts. Storage remains byte-identical and the flow emits zero page errors or external HTTPS
requests. Visual inspection confirms the error copy is readable inside the card and the focused Why
ring remains fully visible.

The retained Why disclosure contract remains green at **16/16**, including unique card ownership,
Enter/Space/pointer behavior, polite live state, normal explanation completion, natural Tab order,
Escape focus, 390-pixel containment, and zero added network/storage work. TypeScript, the production
Vite build, fixture syntax, and `git diff --check` are green.

**Decision.** Phase 161 makes the existing local explanation honest under its only asynchronous
failure boundary without redesigning the card. A transient WASM load failure no longer masquerades
as permanent work, and recovery stays explicit, focused, local, and side-effect free.

---

## Phase 162 — Keep Create generation focused and single-operation

**Bottleneck.** Create's persistent **Generate** button used native `disabled` as soon as work
started. Chromium immediately moved keyboard focus to `BODY`, so neither a failed local load nor a
successful page returned focus to the action that initiated it. The control exposed no `aria-busy`
state. `handleGenerate` also lacked its own synchronous operation guard, leaving correctness to a
rendered button state and the separate infinite-scroll observer check.

**Frozen boundary.** This phase changes only the Create Generate action, App's ownership of that one
logical operation, scoped busy/focus styling, one forced-failure production fixture, and
documentation. It does not change name generation, seed values, pool composition, ranking, error
copy, recent-history semantics, automatic continuation cadence, AI Studio, filters, taste/Saved,
storage schemas, WASM, Rust, or network policy. The observed initial parallel local WASM load burst
is explicitly baselined rather than folded into this UI/focus checkpoint.

**Busy, duplicate, and recovery contract.** Generate remains a native button but no longer sets its
native `disabled` property. While loading it exposes `aria-disabled=true` and `aria-busy=true`, keeps
a visible two-pixel focus ring and readable progress styling, and rejects click or Enter in
CommandBar. App owns a synchronous `loadingRef` guard as the final boundary, covering the entire
operation from seed preparation through the existing `try/catch/finally`; `finally` clears both the
guard and visible loading state on every exit. Failure retains the existing error banner and focused
Generate action. A new activation is an ordinary retry; success clears the prior error, returns ten
cards, keeps focus, and records exactly those shown names.

| Before | After |
| --- | --- |
| Native disabling moved Generate focus to `BODY` during work. | The persistent action stays focusable through pending, failed, and successful states. |
| Loading was visible only through changed button text. | The action exposes explicit busy and disabled semantics while retaining native focusability. |
| Repeated activation relied on the next React render. | CommandBar rejects rendered-busy input and App synchronously guards the logical operation. |
| Early preparation sat outside a shared cleanup boundary. | Seed preparation and all generation work release the guard through one `finally`. |
| Busy styling dimmed the focused action without a scoped contract. | A 70%-opacity progress state and solid two-pixel ring remain readable at 390 pixels. |
| Failure required the user to find the action again. | The existing error appears while Generate remains focused and immediately retryable. |

**Acceptance evidence.** The new `create-generation-focus.mjs` production fixture passes **16/16**
after reproducing the native-disabled focus loss against the pre-fix build. At 390 pixels it holds
and rejects the first local WASM request, proves focusable busy/disabled state, a solid two-pixel
ring, no additional work from repeated Enter or click, focused idle recovery, the existing error
banner, and byte-identical storage after failure. One normal retry returns ten cards, clears the
error and busy state, retains focus, writes exactly those ten visible names to recent history, leaves
an unrelated key intact, and emits zero page errors or external HTTPS requests. The fixture treats
the initial internal WASM request burst as its baseline and proves repeat activation adds nothing;
the one retry adds at most one initialization request. Visual review confirms the focused progress
button is legible, contained, and clearly outlined on the 390-pixel Create surface.

Retained production contracts remain green at Create-filter keyboard **46/46** and the brief-session
browser flow, which still reaches 100 unique names without false exhaustion and keeps visible keyword
trace plus rolling history aligned. TypeScript, the production Vite build, fixture syntax, and
`git diff --check` are green.

**Decision.** Phase 162 removes a high-frequency keyboard focus loss and gives the core offline
action one honest operation boundary. It does not claim that internal WASM initialization is now
coalesced; that separately observed efficiency issue remains a candidate for its own measured phase.

---

## Bottom line

Big-tech Auto remains the product's strongest path. A guided first page is now semantic
Brandable by default and only admits a 75+ Respell accent that visibly comes from the brief and
passes the compact readability gate; when no safe Respell exists, one quality-gated
root-plus-metaphor Brandable may break the suffix wall; one
different-ending, quality-neutral second form may replace a direct suffix card. The
broader modes remain explicit choices and still form the exploratory mix when no brief exists.
Cold first pages now lead with that stronger guided form only when quality and brief coverage are
both non-decreasing. A remaining direct suffix yields only to a same-coverage non-suffix form with
a two-point quality advantage, or to a half-point near-tie that adds a concept or already passed
the guided-form quality gate. If that still leaves a mechanical lead, a final diversity-safe local
retry may add either a proven metaphor or an 85+ two-concept pair; pair swaps stay inside the same
half-point boundary and cannot deepen a visible prefix family. An 84+ pair that cannot earn the
lead may still replace one non-leading Brandable only with a two-point quality gain and no loss in
coverage or diversity. On an already-proven retry page, one unused 85+ Brandable from the existing
repair pool may make the same guarded inner-card upgrade without another generation call.
The remaining shared-expense and workout-planner retries now use small concrete role palettes,
so the last gap can produce names such as `PayMate` and `RepLoop` without changing ordinary Auto.
AI workflow retries use the same isolated pattern for `CogLoop`, and recognized semantic domains
can no longer starve merely because incidental words such as `assistant` appear first.
Cold repair may reuse one already-generated candidate only when its brief-specific shape survives
the stricter aesthetic guards; generic high-scoring metaphor tails do not displace visible names.
CRM pipeline briefs use the isolated role pattern for `RevLoop` while strong `Salelab` pages remain
untouched. Formatter/linter briefs use the same private-role pattern for `TidyKit`, while weak
related spellings can no longer block a stronger construction before repair.
Generic `builder` wording likewise cannot steal the Respell accent from a recognized product
subject; unknown builder briefs still keep their literal source.
Household inventory briefs can express the job directly through the isolated `StowLog` family
without teaching ordinary catalogs another global template.
Recruiter tracking briefs likewise gain the isolated `JobLoop` hiring-workflow role and no longer
reserve a visible slot for damaged `Recruitr` / `Recruyt` forms.
Feature-flag briefs use an isolated `FlipOps` control role instead of adding another high-scoring
`Gate...` variant, while audience words such as `developer` cannot take the Respell slot.
Naming-engine briefs now surface a scoped `LexLoom` or `LexMint` word-making role while preserving
a stronger existing metaphor and refusing duplicate Loom tails.
Legal-research briefs similarly surface the scoped `LexCite` case-law role while keeping generic
filesystem search and ordinary developer-naming vocabulary isolated.
Habit and routine briefs replace ineffective roots with the scoped `Beat` and `Chain`
families, while building/tracking wording can no longer pull generic creator roots into the page.
Education briefs use five productive `Tutor`/`Lore`/`Sage`/`Quiz`/`Dojo` roots instead of letting
low-yield literal words collapse every seed into the same classroom suffixes.
Terminal-log briefs normalize CLI/console/command wording into a scoped
`Term`/`Shell`/`Prompt`/`Log`/`Exec`/`Pane` palette, so audience and delivery words cannot replace
the product role or rebuild a `Term...` wall.
Message-queue briefs similarly normalize async/developer/monitoring wording into one queue lane
with a restrained `Pub` root, eliminating its Pipe stem wall without lowering
the quality-neutral repair boundary.
Delivery-tracking briefs now lead with the isolated `ShipOps` logistics role, while parcel,
shipment, operations, dispatch, and team wording normalize to the same safe delivery vocabulary.
Cloud-deployment briefs similarly lead with the isolated `SkyDock` release metaphor without
teaching weather pages or generic cloud tools a new global template.
Cold Auto also limits exact four-letter stem repetition on a visible page, but only through a
quality-neutral, coverage-preserving non-suffix substitution from the fallback it already opened.
Compound is now a genuinely brief-aware explicit alternative rather than a random adjective
showcase. Focused first pages stay narrow; recognized concepts open a restrained continuation
palette only when the user asks for more, preserving 100-name session capacity without generic
first-page dilution. Its focused two-word names now also reject cross-concept adjective–noun
pairings that are individually relevant but read poorly together.
Long prompted sessions no longer collapse into repeated suffix families or stop before 100
names, and semantic joins no longer erase a concept at one-letter/vowel boundaries. Naming briefs
now use a smoother, deliberately scoped ending palette. Respell accents style a recognized
product subject instead of incidental context, survive Auto only when the one-edit spelling stays
compact and reversible, and disappear when the brief has no safe literal transformation.
Developer naming briefs now understand package registries, namespaces, and name
availability without confusing `find` with filesystem search. Cold Auto preserves strong
first-page names and opens a bounded offline fallback
for weak slots or an overly repetitive page. Local taste feedback selects each
visible page from up to sixty offline candidates per project, applies a structural quality floor,
preserves additional brief concepts, restores visible stem and ending-family diversity, and
keeps every sufficiently rich page from becoming only root-plus-suffix templates.
Strongly two-part positive examples can also contribute a small Compound accent pool without
turning guided Auto back into a fixed mode quota.
High-confidence hidden root-plus-metaphor reparses now open only the existing bounded Brandable
fallback, and a replacement must preserve quality, brief coverage, and every retained set-diversity
measure without changing the generator's rank or random stream.
The held-out audit now also records visible construction saturation without treating it as an
aesthetic score: **98.9%** of canonical cards match a known assembled template and **72/105** pages
have a six-card single-shape wall. The next generator experiment must lower both measures beside
production Auto rather than shifting suffix cards into another visible template family.
A corpus-backed Italian/Japanese-ASCII character probe confirms that the current Markov stack can
separate two spelling distributions at **96.7%** sealed balanced accuracy, but that is not a product
win: it misses both the frozen cross-seed uniqueness and untouched-holdout leakage gates, while
**159/475** unique visible strings collide with IT/JP GeoNames source records. It remains
deliberately disconnected from production.
A fixed-budget exact single-reference spelling-template probe is likewise rejected: although all
five shared 2,000-name pools filled and the selected subset matched its declared C/V layout by
construction, only one of eight reference shapes had enough candidates in every seed, the matrix
returned **304/400**, and mean composite fell **92.84 → 88.38**. Relaxing that hard layout would
collapse back into the transparent local shape reranker already shipped for reference names; this
failed probe remains disconnected from production and carries no semantic or aesthetic claim.
AI Studio remains an optional, separate batch judge rather than a hidden dependency of Create.

Local taste now distinguishes its three-signal personalization trigger from scorer evidence. The
Saved collection also distinguishes explicit project likes from names received through a share:
both remain available as one deduplicated shortlist, but only deliberate project feedback teaches
the local profile or enters a taste export. One spelling can carry independent decisions across
projects, and old automatic share stubs migrate without reclassifying genuine legacy likes. The
next broad aesthetic scorer change is evidence-gated: collect at least ten unique scoped likes and
ten unique scoped passes that each participate in a same-context pair, then audit one canonical v2
export. That 10/10 checkpoint is descriptive, not independent or blind proof; shipping new weights
still requires a separately preregistered, context-disjoint blind/reversal study. Reference names
continue to provide the transparent local approximation of “name like X”; neither the rejected
exact spelling template nor broader language templates substitute for proving better English
dev-name selection on real human preference data.

See `README.md` for the research bibliography and `~/.claude/plans/` for the full build history.
