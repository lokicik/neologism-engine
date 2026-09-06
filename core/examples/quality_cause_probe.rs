//! Research-only interventions through the existing tuning API. No defaults change.
use neologism_core::{brief_intent, diagnostics, phonology, phonotactics, reason, relation, style::Config, BigTechTuning, generate_with_tuning};
use serde_json::json;
use std::{collections::BTreeSet, env, fs};

fn dictionary_count(word: &str) -> Option<usize> {
    phonology::lexicon_pronounce(word).map(|p| p.iter().filter(|p| p.is_vowel()).count())
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let configs: Vec<Config> = serde_json::from_str(&fs::read_to_string(&args[1]).unwrap()).unwrap();
    let mut rows = Vec::new();
    let mut reason_rows = Vec::new();
    for cfg in configs {
        let description = cfg.description.as_deref().unwrap_or("");
        let intent = brief_intent::compile(description);
        let plan = relation::compile(description);
        for scope in ["legacy", "intent", "relation"] {
            for arm in ["baseline", "syllable_gate_disabled", "appeal_bonuses_disabled"] {
                let mut tuning = BigTechTuning::from_variety(cfg.variety);
                if arm == "syllable_gate_disabled" { tuning.syllable_cap = usize::MAX; }
                if arm == "appeal_bonuses_disabled" { tuning.prefix_w = 0.0; tuning.suffix_w = 0.0; tuning.concept_suffix_w = 0.0; }
                let run = || diagnostics::capture(|| generate_with_tuning(&cfg, &tuning));
                let (results, trace) = match scope {
                    "intent" => brief_intent::with_intent(&intent, run),
                    "relation" => relation::with_plan(&plan, run),
                    _ => run(),
                };
                let syllable_rejections: BTreeSet<_> = trace.iter().filter(|e| e.reason == "syllables").map(|e| e.name.clone()).collect();
                let mut pronunciation = Vec::new();
                for name in &syllable_rejections {
                    let mut parses = Vec::new();
                    // Only exact concatenations of the recorded operation/object
                    // roots. Arbitrary dictionary segmentation is not pronunciation proof.
                    for a in &plan.operation_roots { for b in &plan.object_roots {
                        for (a, b) in [(&a.root, &b.root), (&b.root, &a.root)] {
                            if format!("{a}{b}") == *name {
                                if let (Some(ac), Some(bc)) = (dictionary_count(a), dictionary_count(b)) {
                                    parses.push(json!({"left": a, "right": b, "dictionaryComponentSyllables": [ac, bc], "sum": ac+bc}));
                                }
                            }
                        }
                    }}
                    if !parses.is_empty() { pronunciation.push(json!({"name": name, "letterGroups": phonotactics::syllable_count(name), "exactMaterialParses": parses})); }
                }
                let linked: Vec<_> = results.iter().filter(|r| relation::evidence(&plan, &r.name).decision == "linked").map(|r| r.name.clone()).collect();
                rows.push(json!({"config": cfg, "scope": scope, "arm": arm, "results": results, "linked": linked, "pronunciation": pronunciation, "syllableRejectedSpellings": syllable_rejections.len(), "trace": trace}));
            }
        }
        for arm in ["intent", "reverse_term_order", "operation_and_object_only", "operation_only"] {
            let mut scoped = intent.clone();
            match arm {
                "reverse_term_order" => scoped.generation_terms.reverse(),
                "operation_and_object_only" | "operation_only" => {
                    scoped.generation_terms = intent.terms.iter()
                        .filter(|t| t.role == "operation" || (arm == "operation_and_object_only" && t.role == "object"))
                        .map(|t| t.term.clone()).collect();
                },
                _ => {},
            }
            let (results, evidence) = brief_intent::with_intent(&scoped,
                || reason::generate_reason_explained(&cfg, cfg.seed.unwrap_or(13)));
            reason_rows.push(json!({"config": cfg, "arm": arm, "terms": scoped.generation_terms, "results": results, "evidence": evidence}));
        }
        eprintln!("probed: {description}");
    }
    fs::write(&args[2], serde_json::to_vec(&json!({"schema": "quality-cause-probe-v2", "note": "Research counterfactual, not production changes or a promotion evaluation. Disabled gate also admits genuinely long names. Reason role ablations discard information and are not proposed product behavior.", "rows": rows, "reasonRows": reason_rows})).unwrap()).unwrap();
}
