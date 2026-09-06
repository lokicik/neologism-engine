# Research direction: name material, realization, and preference are separate problems

Research date: 2026-09-06. Research-only recommendation; no engine change or quality claim.

The defensible direction is a **sense-specific naming material inventory, conservative candidate construction, and explicit whole-name acceptance feedback**. A learned realization model is a possible component. A learned universal brand-quality score is not justified by the evidence reviewed here. Offline retrieval plus generation plus preference learning is a plausible engineering decomposition, not a published end-to-end solution for this app.

## Five primary sources

1. [Saunders, SIGMORPHON 2023: Improving Automated Prediction of English Lexical Blends Through the Use of Observable Linguistic Features](https://aclanthology.org/2023.sigmorphon-1.10.pdf). Enumerated prefix/suffix candidates are represented using aligned phonemes, syllable boundaries, stress preservation, retained segments and phonotactics. Polynomial regression reached 59.51% reconstruction on the filtered Gangal corpus, versus the cited 48.75% earlier benchmark; 74.13% on the Shaw corpus. The three filtered datasets contain 322, 1,092 and 1,096 blends, with ten-fold cross-validation. These are existing-blend reconstruction results given the source pair, not useful-brand rates. The paper proposes novel human blend evaluation as future work. It does not specify a reusable dataset license or link a code repository. Targeted title/author/OBSERVABLEND searches did not establish a licensed implementation. The fold grouping is insufficiently described to assume strict source-lemma isolation; do not assert leakage, but require it in our reproduction.

2. [Pollet, Winters and Delobelle, ICCC 2021: Learning to Rank Generated Portmanteaus](https://computationalcreativity.net/iccc21/wp-content/uploads/2021/09/ICCC_2021_paper_76.pdf). XGBoost trained on real blends versus generated alternatives achieves 42.58% highest-human-rated first placement; fine-grained annotation reaches 44.98%. Ten nonexpert annotators compare realizations of the same source-word pair. Ranking across different source pairs remains future work. This supports within-pair realization learning, with limited evidence for transferring to product naming. The article links code and data, but current retrieval did not establish their redistribution license.

3. [Joachims, Swaminathan and Schnabel, WSDM 2017: Unbiased Learning-to-Rank with Biased Feedback](https://www.cs.cornell.edu/~tj/publications/joachims_etal_17a.pdf). Search feedback depends on which results are exposed and their positions. The proposed counterfactual learner uses observation propensities. Transfer here is methodological: unshown names are not dislikes, and the old Auto exposure process cannot silently become an unbiased taste dataset. This paper does not prove naming preferences are learnable from our present sample.

4. [Open English WordNet: authoritative license](https://github.com/globalwordnet/english-wordnet/blob/main/LICENSE.md?plain=1). Derived data use CC BY 4.0 with attribution to both the Open English WordNet team and Princeton WordNet, and retention of underlying Princeton notices. Sense IDs, definitions, lexical relations and part-of-speech distinctions make this suitable for a reproducible local semantic index. It is a source of lexical evidence, not a developer naming preference dataset. Version-pin any selected release and ship the exact required notices.

5. [Small World of Words: official research datasets and use terms](https://smallworldofwords.org/en/project/research). The research release page identifies CC BY-NC-ND 3.0. Human association norms are attractive for finding evocative material, but this is not a ready-to-ship source for a commercial adapted naming inventory. Separate permission would be needed for that route. No dataset was downloaded or incorporated.

Searches for newer lexical-blend/name-generation results did not identify a stronger directly matched non-LLM developer-naming evaluation. This is a bounded search finding, not a claim that no such work exists.

## What is already known locally

- `research/learned-edit-fst/APPLICATION-NEGATIVE-CHECKPOINT.md`: 13 learned single-character edits produced high mechanical scores but weak decorated words such as `Mmode` and `Totaly`; sealed concept coverage failed. It learned spelling alterations around dictionary words, not phonological realizations of fixed semantic source pairs.
- `research/phonetic-pareto/NEGATIVE-CHECKPOINT.md`: recombining consonant/vowel streams yielded full diverse pools and average composite 90.975, yet brief-source contrast was 62.5185% against a frozen 75% floor; conspicuous gibberish remained.
- `research/articulatory-wfst/NEGATIVE-CHECKPOINT.md`: corpus-plausible syllable paths still produced poor names. This rules out treating a phonotactic score as an aesthetic boundary.
- `research/preference-learning/COLLECTION-NEGATIVE-CHECKPOINT.md`: a real 174-choice collection exists. Its 150 primary choices include 77 Neither and 73 decisive comparisons, with 13/24 consistent repeats against a required 20/24. The frozen fitter rejected it before learning. The adjacent README saying no human collection happened is stale. A new ranking plan must not ignore this evidence or lower those gates.

The last result matters more than choosing a fashionable ranker. Much of the user's feedback says both options are unacceptable. Repeating a long forced-relative-choice collection on similarly weak names would not resolve that problem. Neither should stay an explicit outcome; skipped/unshown names and unchosen alternatives have different meanings.

## Is a stress-aware realization model actually new?

Partly. `core/src/seamblend.rs` already has grapheme/phoneme-aligned overlapping and syllable-splice candidates plus a consonant reparse guard. Calling for these mechanisms alone would repeat existing work. However, `core/src/phonology.rs` explicitly uses stress-free ARPAbet and `core/examples/build_pron_lexicon.rs` strips stress digits. The current local rank bonus does not learn which source's stress and syllable structure a whole blend should preserve.

A small learned **within-source-pair** preference over realizations would be a distinct hypothesis from single-edit decoration or free consonant/vowel recombination. Its output should be a soft construction prior, not a hard demand that every retained fragment appear in a fragment dictionary. The paper is a reason to test this hypothesis, not a reason to make it the next large implementation effort.

## Recommended architecture and investment order

1. Represent product operation, object, benefit and explicitly selected sense separately. Retrieve a short list of editorial naming directions with source/sense IDs and compatibility restrictions. Whole-word metaphors must remain valid options. A WordNet neighbor is raw material; it is not automatically an attractive name or a correct product metaphor.
2. Give each direction a bounded budget for whole words, restrained compounds and existing source-preserving blends. Preserve construction traces, but do not confuse traces with meaning recoverable by a reader. Inspect the strongest available name per direction before tuning finalist rank. No fixed number of acceptable names is guaranteed.
3. Improve realization only when a useful source pair produces visibly poor cuts. Compare variants within that pair, keeping semantic relevance constant. A compact regularized polynomial or small tree model can compile to Rust; a new runtime LLM is unnecessary. Licensing and train/evaluation data must be established before model training.
4. Treat absolute acceptance, relative preference among acceptable names and naming style as separate observations. Start with explicit Keep/Reject/Unsure and randomized paired comparisons of plausible candidates, preserving brief, candidate set, exposure order and provenance. Do not reinterpret historic Neither as a random left/right choice. Do not train on assistant editorial picks as if they were user labels.
5. Only consider a cross-pair preference ranker when actual developer-brief data supports it on untouched briefs. The existing four-finalist experience, offline implementation and legacy Auto remain intact during the experiment. Original production consideration thresholds remain unchanged.

The strongest counterargument is that this architecture merely relocates intelligence into a costly hand-authored inventory. It may improve a few supported domains while failing on novel briefs, and familiar whole words may be crowded by existing products. Neither lexical-graph expansion nor a realization prior supplies product strategy, cultural judgment or availability. This approach is justified only if a small held-out test increases absolute usable-name yield; otherwise it is another technically tidy mechanism with insufficient naming value.

## Smallest informative realization test

Before training, freeze a small development set of semantically vetted source pairs from several developer product types. Generate every candidate once using existing Seamblend and retain the entire candidate set, including rejected cuts. Source pairs are selected before seeing spellings. Distinguish a bad pair from a bad realization by showing the best available whole-name alternatives per pair; assistant judgments here are exploratory only.

If a licensed attested-blend training corpus is obtained, deduplicate spellings and source pairs across source corpora first. Keep every alternative of a pair in the same partition; group inflectional/source-lemma families so shared roots cannot leak. Tune only on the development split. Freeze the candidate enumerator and compare current rank, learned realization rank, and a simple length/overlap baseline on the exact same candidates. Report generator recall separately from ranking. Exact reconstruction is a mechanism check, never the deployment endpoint.

Then test transfer on new developer briefs with source pairs absent from training. Measure whether the selected whole name is acceptable with its explanation hidden, source recoverability as a separate diagnostic, and naming preference with Neither preserved. Keep all variants of a brief and all paraphrases in one evaluation partition. A reconstruction gain with unchanged acceptable-name yield rejects the proposed product benefit. The existing 12-brief plus four-repeat production comparison remains a distinct gate; do not replace it with corpus reconstruction or weaken it after results.

No code, model, data license or human quality pass is claimed by this note.
