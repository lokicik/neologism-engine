# Preference evidence audit

Read-only repo audit, 2026-09-06. No runtime, storage, label, model, or threshold changes. Counts below come from the current retained reports and, where stated, a fresh parse of retained source/label JSON. The original two user collection files were not found under the scoped repository locations; no browser profile or unrelated user directory was inspected. Thus their raw decisions/timestamps were not independently rerun in this audit.

## Decision

Do not restart a generic preference-labeling campaign or recommend a small spelling ranker as an untried fix. Both routes have already been tested. The strongest usable human evidence is that many candidate pairs offer no acceptable option, and that the user likes intentional whole names across several forms. There is no verified set of absolute human approvals for the latest Product-brief or retained-fragment candidates.

The promising next architectural question is whether a brief can retrieve appropriate whole lexical concepts and generate a few coherent names without requiring each name to encode both the operation and its object. This is a direction inferred from existing human evidence, not a demonstrated quality improvement. Learn nothing from assistant picks as if they were user preferences.

## What actual human evidence exists

| Source | Verified retained evidence | What it can establish |
|---|---|---|
| `research/preference-learning` | 174 decisions = 150 primary pairs over 30 briefs + 24 concealed side-reversed repeats. Primary choices: 33 left, 40 right, 77 neither. 73 decisive choices; 13/24 repeat agreement. | Broad dissatisfaction with the recruited pool; some relative same-brief preferences. Does not establish absolute adoption. |
| `research/personal-acceptability/work/run-a/labels.json` | Fresh parse: 201 unique retained name spellings = 68 chosen-derived positives + 133 neither-derived negatives; 28 positive-bearing and 29 negative-bearing briefs. | A derivative of the same collection, not 201 additional human decisions. |
| `research/personal-prototype` absolute collector | 30 decisions = 24 primary ratings, two arms over 12 briefs, six repeats. Prototype 2 use / 0 maybe / 10 no; control 2 use / 2 maybe / 8 no. Repeats 3/6 consistent. | Absolute human evaluation of the old arbitrary-syllable source. Does not label the current generators. |
| `research/personal-prototype/anchors.json` | 11 explicit user-provided liked brands: Linear, Vercel, Stripe, Anthropic, OpenAI, Perplexity, Notion, Obsidian, Godot, Instagram, Twitch. Fresh parse: six lexical, three derived, two coined. | Positive naming references, without target briefs or matched negatives. Familiarity/product association may affect liking. Not 11 brief-name training pairs. |
| App favorites/passes | Schema and implementation verified; no actual persisted user rows inspected in this audit. | Available data capture mechanism, not a known usable label count. |

The source JSON currently contains 1,254 pool entries across the 30 recruitment briefs, but only 150 disjoint primary pairs were shown. Pool size is not label count. Repeated source spellings are not additional independent judgments.

Primary references: `research/preference-learning/COLLECTION-NEGATIVE-CHECKPOINT.md:28`, `research/preference-learning/work/real-descriptive-a/report.json`, `research/personal-acceptability/NEGATIVE-CHECKPOINT.md:31`, `research/personal-prototype/HUMAN-NEGATIVE-CHECKPOINT.md:25`, `research/personal-prototype/anchors.json:4`.

## What has already failed

1. Frozen Bradley-Terry pairwise learner refused the real collection before fitting: 73 decisive choices versus 120 required, and 13/24 consistent repeats versus 20 required. No real coefficients/model were produced.
2. A separately frozen post-outcome absolute acceptability experiment removed 11 inconsistent-repeat primaries and four cross-brief duplicate spellings. Its brief-independent character 2-4-gram density model achieved OOF AUC 0.593211, below both the 0.65 gate and simple negative-length baseline 0.615933. No final model was written.
3. The 11 liked reference brands already informed a surface/phonographic prototype. Its absolute human result failed. Reusing their syllable patterns or spelling fragments as a new positive style class would repeat that approach.
4. The Wikidata whole-name learning experiments used existing name/description pairs, not human preference labels. The GRU failed brief conditioning (0.2605% NLL improvement; 55.8443% correct-versus-wrong-condition wins). Its contrastive follow-up was near random (12.0275% 10-way top-1; 52.9175% pairwise) and weaker than lexical matching. Scaling this same supervision is unsupported.

References: `research/preference-learning/COLLECTION-NEGATIVE-CHECKPOINT.md`, `research/personal-acceptability/NEGATIVE-CHECKPOINT.md`, `research/personal-prototype/HUMAN-NEGATIVE-CHECKPOINT.md`, `research/holistic/NEGATIVE-CHECKPOINT.md`, `research/holistic/CONTRASTIVE-NEGATIVE-CHECKPOINT.md`.

## What the labels say about direction versus style

The actual prompt was **“Which name fits this product better?”**, with **“Neither name works”**. It conflates fit, appeal, and minimal usability unless the user supplies an explicit absolute adoption judgment. These were broad civic/business products, not a developer-only dataset. The retained cases include a dental laboratory, volunteer kitchens, pet groomers, bakery batches, oral history, and language teachers.

Some descriptive examples from the 201 retained derived labels:

| Product brief | Chosen from a decisive pair | Rejected through neither pairs |
|---|---|---|
| Meal delivery for volunteer kitchens | Plateflow | Agilemeal, Fleetforge, Fleetmeal, Routemeal, Tastyplate |
| Route notebook for mobile pet groomers | Pawroute, Vetatlas, Vetcompass | Atlaslab, Gentlevet, Petroute, Primetrek |
| Market research interviews and insight tagging | SourceShelf, SourceTag, Proofbazaar | Proofloom, Proofcart, Scopeflow, Wisecart |
| Bakery production and ingredient batches | None in retained labels; all five original pairs neither | Dailyflow, Flowmap, Flowsignal, Oneflow, Plansignal, Topbatch |
| Oral history and consent tracking | None in retained labels; all five original pairs neither | Consentlab, Orallab, Rareconsent, Solidoral, Histack |
| Reading log for book clubs | Bookify, Rarescope | Pulselink, Pureclub, Topbeacon, Tracebeam |
| Citation organizer | Lensix, Lensora | Lucidcite, Nativelens, Sourcebeam, Sourceseed |

These are not endorsements of every chosen name and not newly collected labels. They support a narrow inference: the utility of a component depends on the whole name and product. A universal ban on compounds, suffixes, or `flow` would conflict with retained choices; assigning each favored component a positive weight is equally unjustified. The same raw material can occur in both classes. The dataset does not contain cleanly controlled same-meaning style contrasts.

The 150 primary pair exposures contained 181 brandable, 116 compound, and three respell names; chosen counts were 60, 12, and one respectively. Those rates are confounded by brief, pair construction, source quality, and the neither outcome. They are not evidence of a universal generator-family preference. Also, 67/73 decisive pairs had exactly equal structural composite scores because source recruitment deliberately quality-matched names; the lack of composite separation is partly a design consequence.

Of 11 inconsistent repeats, ten crossed the neither boundary (seven neither-to-choice, three choice-to-neither), and only one switched between opposite names. This suggests a fragile acceptability boundary in a weak pool more than constant preference reversal. Fatigue, drifting criteria, or order effects are possible explanations, not measured conclusions: raw decision timestamps were not available in the inspected repo artifacts.

## App feedback is not an exposure log

`web/src/lib/engine.ts:51` stores a `NameResult` with spelling, source mode, optional construction, context, structural scores, and connotations. Context contains description/roots and an ID. `web/src/lib/taste-context.ts:10` deliberately ignores source mode, seed, constraints, and page size when identifying the project.

`web/src/lib/taste-data.ts:36` exports unary liked/passed rows and constructs every compatible same-context like × pass combination. Those Cartesian pairs are inferred comparisons, not observed head-to-head choices. The export has an export timestamp, but individual stored rows have no exposure time, label time, displayed position, page/session identity, generator/data version, or list of simultaneously visible alternatives. There is no explicit event distinguishing “not shown,” “shown but not acted on,” “passed,” and “picked as the final project name.”

`web/src/lib/storage.ts:165` retains only the most recent 200 passes. Likes can outlive the negative sampling window. This storage is sufficient for the current transparent local shape preference behavior, but unsuitable for unbiased exposure-aware evaluation. The UI's 10 likes + 10 passes checkpoint counts unique contextual rows; it does not mean a learned ranker is statistically ready.

## Non-human material that must stay separate

- `web/e2e/taste-data-check.ts` uses programmatically constructed Noma/Lexix/Bobbyn/EagerMythos fixtures. These verify schema behavior.
- `web/e2e/taste-quality-audit.mjs` and `mode-taste-audit.mjs` use hard-coded brand reference sets and structural metrics. Passing them is regression evidence, not actual user approval.
- `research/preference-learning/work/synthetic-cv.json` and the `cv-smoke-*` models are generated by `make_synthetic_cv.py` from fixed artificial feature weights. They must never be counted as real learned preference performance.
- `research/pool-review/review.json` explicitly records source-visible assistant editorial review of 170 eligible proposals; its 21 picks are not human labels. Other recent shared-pool/Product-brief/retained-fragment reviews carry the same boundary.
- `research/preference-learning/README.md` still says that no human collection has happened. That sentence is stale; the later negative checkpoint and hash-bound retained report are the current evidence.

## Splits, leakage, and a useful next probe

- Do not expand one like/pass cross-product into hundreds of supposedly independent observations. Split by project/brief and by normalized name family; compare outcomes at the brief level.
- Keep concealed repeats out of training. Avoid opposite-fold variants sharing a source lexical concept or parent family. The existing absolute experiment explicitly removed Countloom, Stocknova, Studioloom, and Wisecount when they crossed briefs.
- The repeatedly inspected 12 developer briefs are now development cases. Their original gate remains unchanged, but they cannot be called fresh generalization evidence after current lexical changes are based on them.
- Keep genuine human, source-visible assistant, synthetic fixture, external corpus, and unlabeled exposure records as distinct provenance classes.
- A new whole-name ranker is not currently justified by sufficient reliable target labels. This does not prove that rankers cannot work; it means this repo has already tested two relevant insufficient-data hypotheses.

The immediate low-burden probe should be a candidate-source ceiling check, not another 174-choice campaign: use a few fixed product briefs and retrieve whole lexical concepts from explicit benefit/sense links, alongside the current operation-object/blend pool. Freeze the inventory and spelling rules before opening results, retain all candidates and abstentions, and compare at the whole-name level. Existing liked brands can inform the intended range (lexical, derived, coined), but must not become candidate seeds or held-out positive labels. The output should first justify that the alternative offers a materially different kind of candidate; assistant judgment remains diagnostic.

If this architecture later earns adoption, add minimal local exposure and explicit final-choice events prospectively, preserving existing taste storage. That lets real project usage build future preference data without imposing a separate long study. It is instrumentation for learning later, not an immediate quality fix. The frozen human promotion gate remains required for a superiority claim.
