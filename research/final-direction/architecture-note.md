# Architecture audit: product naming needs lexical identity and scoped feasibility

Read-only audit, 2026-09-06. No generator, model, thresholds, UI, or user data changed. This note records current code/data and retained experiment results; it does not claim improved names.

## The strongest new finding

The current product-benefit inventory contains **8 frames and 24 whole-word anchors** (`core/data/product_frames.tsv:3`). **23 of those 24 exact spellings are present in the local extracted crate-name snapshot** (`research/collision/crate-names.txt`). Twelve are also in `core/data/bigtech.txt` (exact normalized spelling check in `anchor-check.mjs`). Only `reprise` is absent from the shipped collision Bloom filter.

The current generator first constructs whole anchors, then object+anchor compounds (`core/src/product_frame.rs:81`), but its global collision check rejects a hit regardless of the user's target namespace or product category (`core/src/product_frame.rs:105`). Pool eligibility repeats this rejection (`web/src/lib/candidate-pool.ts:127`). A hit in an unrelated crate namespace and a same-category competitor have the same consequence.

This is visible in retained actual executions, not just a hypothetical policy objection. Across the twelve final Product-brief regression records, `research/product-brief/artifacts-v3/trace-32.json.gz` through `trace-43.json.gz`, the 24 unique guided-metaphor whole anchors have these first outcomes:

| Outcome | Unique anchors |
| --- | ---: |
| `frame.filter:collision_snapshot` | 22 |
| `frame.filter:phonotactics` (`touchstone`, also a snapshot hit) | 1 |
| Emitted (`reprise`) | 1 |

`ledger` and `atlas` also appear from Reason, but their pool sources are rejected as `collision_snapshot`. Thus **seven of eight authored benefit frames cannot supply a single whole anchor to finalist selection**. This pushes the intended lexical route back toward object+anchor compounds and clipped forms. It does not establish that the blocked anchors are beautiful, available, or safe to adopt.

Membership was independently checked using the Bloom header (`932789` bits, `k=8`) and the exact wrapping-u64 double hash in `core/src/collision.rs:38`. Controls matched the Rust test cases (`tokio`/`serde`: hit; `zqxvelumarith`: absent). The exact text matches in the locally retained crate-name file confirm these 23 are not Bloom false positives. No live availability claim follows from either membership or absence.

The source builder (`core/examples/build_collision_set.rs:23`) merges all eligible names from crates.io and the brand corpus into one set; that format discards source/category/timestamp distinctions. `core/src/collision.rs:128` also calls false “definitive” in its documentation; that is only true for membership in a successfully loaded snapshot, never current availability. Runtime `None` returns false, so the function itself is not an availability verdict.

## The product target is already documented

There are **eleven explicit user-provided positive naming anchors**, not zero preference information: `research/personal-prototype/anchors.json:4` records Linear, Vercel, Stripe, Anthropic, OpenAI, Perplexity, Notion, Obsidian, Godot, Instagram, Twitch. Its own categories are six lexical, three derived, and two coined. These examples support investigating whole lexical identity. They do not provide a model training set or establish that copying their sound creates good new names.

The earlier Phase 305 application used their abstract phonographic resemblance and failed genuine human evaluation. A recommendation to “collect preferences and train a small ranker” must acknowledge that both collection and a subsequent rejector experiment have already happened.

## What is already disproven, and what those failures actually mean

| Retained work | Verified result | Honest implication |
| --- | --- | --- |
| `research/preference-learning/COLLECTION-NEGATIVE-CHECKPOINT.md:30` | 77/150 Neither; 73 decisive vs 120 required; repeats 13/24 vs 20 | The existing long collection cannot train its frozen learner. More ranking work is not an immediate evidence-backed fix. |
| `research/personal-acceptability/NEGATIVE-CHECKPOINT.md:34` | 201 retained labels; grouped AUC .5932 vs shorter-name baseline .6159 | Reinterpreting pair choices as absolute positive spelling labels did not solve the problem. |
| `research/personal-prototype/HUMAN-NEGATIVE-CHECKPOINT.md:28` | Prototype 2/12 Use, 2/12 non-reject; control 4/12 non-reject; repeats 3/6 | Surface resemblance within arbitrary whole-form supply failed user judgment. |
| `research/holistic/NEGATIVE-CHECKPOINT.md:40` | Conditional GRU NLL uplift .2605%; true-vs-wrong 55.8443% | Small whole-name GRU on those Wikidata description/name pairs did not learn sufficient meaning. |
| `research/holistic/CONTRASTIVE-NEGATIVE-CHECKPOINT.md:36` | 10-way retrieval 12.0275%, below lexical 18.0152% | The same corpus did not support the proposed contrastive semantic route. |
| `research/crate-retrieval/NEGATIVE-CHECKPOINT-V3.md:39` | Context contrast 74.817%; NLL improvement 2.011% vs 5% | TF-IDF product-description retrieval gave a semantic signal, but retrieved-name character generation failed the stated effect gate; metadata licensing also blocks shipment. |
| `research/wordnet-gloss-retrieval/NEGATIVE-CHECKPOINT.md:46` | 22/35 briefs meet 64-positive-neighbor coverage | Raw WordNet gloss overlap does not bridge modern product jargon at the frozen density requirement. |
| `research/wordnet-rootgroups/NEGATIVE-CHECKPOINT.md:30` | Minimum eligible pool 30; 714/720 cards, six 8/10 pages | This lexical route failed the old forced-ten/per-source-cap contract, not a human quality test. Examples were still descriptively weak; removing filling alone cannot establish success. |
| `research/polysemous-lexeme/NEGATIVE-CHECKPOINT.md:24` | 0–3 eligible terms, mean .2083 | The intersection of ConceptNet, 1,100-word inventory, polysemy/norm filters, and collisions lacked capacity. It did not test a broad sense-curated product naming lexicon. |
| `research/conceptnet-lattice/NEGATIVE-CHECKPOINT.md:39` | 110,592 paths; zero eligible cards | Maximum-score character search converged on lexical forms prohibited by novelty/collision policy. |
| `research/conceptnet-guided-sampler/SEALED-NEGATIVE-CHECKPOINT.md:31` | 330/330 cards, 31/33 full pools, 100% own-vs-wrong; later control 8/12 rejected by user | Strong source classification and abundant structurally valid strings did not ensure human quality. |
| `research/pool-review/REPORT.md:3` | Assistant picks 21/170; 17 already finalists | Current selection loses some alternatives but no large hidden aesthetic rescue was found. These are not human labels. |
| `research/retained-fragments/REPORT.md:5` | Eligible 170→84; five prior assistant picks lost | A dictionary attestation filter is not a general model of whole-name recognizability. |

The learned-edit, phonetic Pareto, product-of-experts, and human-wordlikeness-manifold checkpoints reinforce this: high wordlikeness/structural scores are mechanism diagnostics, not actual preference. Their negative results are not a mathematical proof that every non-LLM architecture is impossible.

## One coherent next architecture

**A sense-based naming catalog and compiler, with separate display-name and target-identifier decisions.** The unit of generation is an intentional naming idea with a valid whole form, not a bag of keyword fragments or a sampled character sequence.

1. A bounded developer-product frame identifies the job and benefit. The current parser can remain a fast default, but unresolved or conflicting inputs must expose a small editable interpretation instead of silently switching to generic strings. The source spans already exist.
2. A licensed, provenance-controlled lexicon stores word senses, pronunciation, a concrete relation to product benefits, and permitted whole-word or independently attested constructions. Compile authored sense associations offline into a Rust-readable index. Preserve a retrieved lexical item's identity; do not train a Markov model on retrieved names or trust arbitrary GloVe neighbors as semantic parents.
3. Enumerate meaningful complete forms and explicitly supported derivations. Existing producers can remain optional exploration branches; they do not have to consume equal finalist shares. Semantic explanation is evidence, not aesthetic score. Fragment attestation remains diagnostic rather than universal hard rejection.
4. Keep `DisplayName` separate from `IdentifierCandidate`. Attach per-source, per-target collision evidence and uncertainty. A target crates.io package hit disqualifies that package identifier. A known same-category brand remains a serious naming conflict. An unrelated registry's use of a common word is recorded without pretending it proves the global display name is unusable or available. A scoped package identifier can differ from a display name only where the actual ecosystem supports that. This does not authorize weakening the existing Auto rules; it requires an explicit new product contract and prospective evaluation.
5. Show at most a few concepts/names and let the user keep a direction. Do not generate ten pages to satisfy structural capacity. Do not integrate a new learned taste model until genuinely adopted/accepted names exist in matching contexts and their consistency is adequate.

This is a specific change of task and representation. It is **not** revival of raw WordNet BFS, TF-IDF→local Markov, phonographic brand imitation, or the closed Phase 306 experiment. It combines an explicit product meaning with intact lexical identity and a feasibility model that matches the intended naming target. Its main cost is a durable naming data asset and product interpretation coverage; code complexity is secondary.

## Decisive falsifier before a broad rewrite

First freeze a small separate developer-domain pack and output contract. Audit **pre-filter reachability** of meaningful whole-form reference names and **where each disappears**: interpretation → sense retrieval → construction → lexical validation → target collision → final selection. Familiar established names are positive controls for expressibility only and may be used in a diagnostic before collision; they must never be presented as newly available recommendations. A reverse engineered exact known-name match is not a success metric.

Then compare the same bounded briefs with matched candidate budgets and no current-Auto changes. Keep the original short human gate (12 primary comparisons + 4 repeats; at least 8 wins, 6 usable briefs, +3 usable briefs over Auto, 3/4 consistency). Count usability against the intended target namespace and show collision information consistently on both arms. Freeze all new interpretation/lexicon data before inspecting evaluation outputs. The old artifact cannot validate a changed candidate set; generate a new version under the same unchanged acceptance thresholds.

**Falsifier:** if intact, relevant, responsibly scoped lexical/construction candidates still fail that human adoption gate, stop claiming that more catalog breadth or a ranker is the answer. The fully automatic offline promise has then failed another distinct candidate ontology; the honest product direction becomes an assisted naming workspace, or a separately user-approved relaxation of runtime constraints. Do not schedule another anonymous heuristic campaign.

## Reproduce the retained anchor first-outcome count

Run from repo root with Node; this reads retained artifacts only and does not use port 4246:

```js
const fs = require('fs'), zlib = require('zlib');
const outcomes = new Map();
for (let i = 32; i < 44; i++) {
  const run = JSON.parse(zlib.gunzipSync(fs.readFileSync(
    `research/product-brief/artifacts-v3/trace-${i}.json.gz`))).current;
  for (const anchor of run.semantic.product_frame.anchors) {
    const events = run.trace.filter(e => e.family === 'guided_metaphor' && e.name === anchor.word);
    outcomes.set(anchor.word, events.map(e => e.detail || e.decision).join(', ') || 'emitted');
  }
}
console.log(Object.fromEntries([...outcomes.values()].reduce((m, k) =>
  m.set(k, (m.get(k) || 0) + 1), new Map())));
// { 'frame.filter:collision_snapshot': 22, 'frame.filter:phonotactics': 1, emitted: 1 }
```
