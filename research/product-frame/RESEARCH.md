# Which LLM-free direction is justified?

The best immediate fit for this repository is **sense-constrained product-benefit material, transparent whole-word constructions, then selection among eligible names without a literal-keyword bonus**. This is an engineering inference from the papers and the retained local interventions, not a published proof that this architecture is best. A learned ranker is the stronger subsequent candidate for learning taste, provided its training and evaluation target actual developer-product naming preferences.

## Primary evidence

| Study | Relevant evidence | Limit of transfer |
| --- | --- | --- |
| Hiranandani, Maneriker & Jhamtani, [Generating Appealing Brand Names (2017)](https://arxiv.org/abs/1706.09335), §4/Table 3 | Description expansion, syllable blending, a RankSVM trained on 315 pair comparisons, and diversity selection. In the name-rating experiment, generated names received 16.6% Good, 41.8% Fair and 41.6% Bad ratings. | Only ten entity descriptions; the constrained human baseline is not a professional naming agency. These results do not validate our hand-tuned scores or promise a high useful-name yield. |
| Özbal & Strapparava, [A Computational Approach to the Automation of Creative Naming (ACL 2012)](https://aclanthology.org/P12-1074/), evaluation/conclusion | Names derive from category and properties to emphasize, including semantic associations and wordplay. About 87% were judged English-sounding, but only about one in four successful. | Pronounceability and naming success are distinct targets. Product-benefit associations are a plausible source of material, not a guarantee of appeal. |
| Pollet, Winters & Delobelle, [Learning to Rank Generated Portmanteaus (ICCC 2021)](https://computationalcreativity.net/iccc21/wp-content/uploads/2021/09/ICCC_2021_paper_76.pdf), Table 2 | XGBoost learns from real blends and generated alternatives. Rankers put the human-highest-rated form first in 42.58% (real-word labels), 44.02% (highest-only labels), and 44.98% (all annotations) of groups under their tie convention. | This compares variants of the same source-word pair, with ten nonexpert annotators. Ranking candidates from different semantic source pairs is explicitly future work. It is not a developer-brand preference benchmark. |
| Özbal, Strapparava & Guerini, [Brand Pitt (LREC 2012)](https://aclanthology.org/L12-1395/) | A corpus of 1,000 creative brand names annotated for linguistic devices and domains. | Existing brands are useful examples of mechanisms, not positive preference labels for an unseen brief. No external corpus is copied into this implementation. |

The 2017 paper's attribution in the project README was incorrect and is corrected. Gangal and colleagues authored **Charmanteau**, a different paper cited by the 2021 study.

## Alternatives considered

1. **More character generators or phonotactic tuning:** low priority. The local quality-cause report already found useful candidates lost in selection and irrelevant senses introduced in expansion. Published pronounceability results do not establish useful-brand quality.
2. **Broader untyped synonyms:** rejected for this step. More senses add candidate volume while making product fit harder to verify. The local `backup` sports-neighbor example illustrates the risk.
3. **Typed benefit inventory and complete constructions:** implemented as a bounded change. It addresses material and whole-form legibility, retains evidence, and runs locally in Rust/WASM. It cannot judge every unintended association of a coined name.
4. **Preference-trained whole-name ranker:** a credible next architecture, not implemented here. We have no retained human gate pass or adequately matched preference dataset. Training on assistant judgments or existing-brand presence would measure a different target. An offline ranker need not be an LLM, but requires a separate controlled data decision.

## Implementation decision

- Eight original editorial frames contain 24 word/sense associations. Every frame needs a matching operation and object cue. Ambiguous or unsupported matches abstain. These are authored hypotheses, not human-normed or preference-validated vocabulary.
- Only the opt-in flow's guided-metaphor family uses these anchors. It emits whole metaphors or complete object–anchor compounds, with no clipping, suffix fabrication, or new aesthetic weights. Constraints, syllable limits and local collision checks apply; rejected material is traced.
- Meaning remains required, but coverage tiers no longer outrank family rank. Rank and seeded family tie order are still imperfect proxies; removing one incorrect priority does not create a learned taste model.
- The old `semantic_pool` remains programmatically available and its frozen evidence is replayed. The existing Lab checkbox runs `frame_pool`; Auto and saved preferences are unchanged.
- A fixed 2×2 comparison separates the selector change from the material change. The 12 new briefs are a small coverage probe selected for supported domains, not a representative market benchmark. Unrecognized input remains a reported failure; no test brief is rewritten after seeing output.

The whole-word policy prevents new clipped forms in this one family. It does **not** repair every old-family coinage or automatically recognize negative connotations such as the possible destructive reading of `Destore`. That remaining limitation needs whole-name judgment rather than another arbitrary string blacklist.
