// Audit one or more Settings > Local taste data exports against the current
// offline composite score. This is a checkpoint tool, not a production ranker:
// it tells us whether a future scorer has real preference signal to beat.
//
// Run: cargo run -p neologism-core --release --example taste_audit -- <taste.json> [more.json]

use std::collections::{BTreeMap, BTreeSet};
use std::fs;

use neologism_core::metrics::composite_score;
use neologism_core::NameResult;
use serde::Deserialize;

const SCHEMAS: [&str; 2] = ["neologism-taste-v1", "neologism-taste-v2"];

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Label {
    Liked,
    Passed,
}

#[derive(Debug, Deserialize)]
struct ResultRow {
    #[serde(flatten)]
    value: NameResult,
    #[serde(default, rename = "sourceMode")]
    source_mode: Option<String>,
    #[serde(default, rename = "tasteContext")]
    taste_context: Option<TasteContextRow>,
}

#[derive(Debug, Deserialize)]
struct TasteContextRow {
    id: String,
}

#[derive(Debug, Deserialize)]
struct Example {
    label: Label,
    result: ResultRow,
}

#[derive(Debug, Deserialize)]
struct Dataset {
    schema: String,
    examples: Vec<Example>,
    comparisons: Vec<[usize; 2]>,
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct EvidenceKey {
    context: String,
    name: String,
}

#[derive(Debug)]
struct PairAudit {
    preferred: String,
    rejected: String,
    margin: f64,
}

#[derive(Debug, Default)]
struct Audit {
    pairs: Vec<PairAudit>,
    modes: BTreeMap<String, [usize; 2]>, // [liked, passed]
    contexts: BTreeSet<String>,
    matched_liked: BTreeSet<EvidenceKey>,
    matched_passed: BTreeSet<EvidenceKey>,
    matched_contexts: BTreeSet<String>,
}

fn minimum_sample_ready(matched_liked: usize, matched_passed: usize) -> bool {
    matched_liked >= 10 && matched_passed >= 10
}

fn audit_dataset(dataset: &Dataset) -> Result<Audit, String> {
    if !SCHEMAS.contains(&dataset.schema.as_str()) {
        return Err(format!(
            "unsupported schema {:?}; expected one of {SCHEMAS:?}",
            dataset.schema
        ));
    }

    let mut audit = Audit::default();
    for example in &dataset.examples {
        audit.contexts.insert(
            example
                .result
                .taste_context
                .as_ref()
                .map(|context| context.id.clone())
                .unwrap_or_else(|| "legacy-unscoped".to_string()),
        );
        let mode = example
            .result
            .source_mode
            .clone()
            .unwrap_or_else(|| "unknown".to_string());
        let counts = audit.modes.entry(mode).or_default();
        match example.label {
            Label::Liked => counts[0] += 1,
            Label::Passed => counts[1] += 1,
        }
    }

    for (pair_index, [preferred_index, rejected_index]) in
        dataset.comparisons.iter().copied().enumerate()
    {
        let preferred = dataset.examples.get(preferred_index).ok_or_else(|| {
            format!("comparison {pair_index} preferred index {preferred_index} is out of range")
        })?;
        let rejected = dataset.examples.get(rejected_index).ok_or_else(|| {
            format!("comparison {pair_index} rejected index {rejected_index} is out of range")
        })?;
        if preferred.label != Label::Liked || rejected.label != Label::Passed {
            return Err(format!(
                "comparison {pair_index} must point liked > passed, got {:?} > {:?}",
                preferred.label, rejected.label
            ));
        }
        let preferred_context = preferred
            .result
            .taste_context
            .as_ref()
            .map(|context| context.id.as_str());
        let rejected_context = rejected
            .result
            .taste_context
            .as_ref()
            .map(|context| context.id.as_str());
        if dataset.schema == "neologism-taste-v2" {
            if preferred_context != rejected_context {
                return Err(format!(
                    "comparison {pair_index} crosses project contexts: {:?} > {:?}",
                    preferred_context.unwrap_or("legacy-unscoped"),
                    rejected_context.unwrap_or("legacy-unscoped")
                ));
            }
            // Legacy-unscoped comparisons remain auditable, but they cannot
            // satisfy the matched-context evidence checkpoint.
            if let Some(context) = preferred_context.filter(|value| !value.trim().is_empty()) {
                audit.matched_liked.insert(EvidenceKey {
                    context: context.to_string(),
                    name: preferred.result.value.name.trim().to_lowercase(),
                });
                audit.matched_passed.insert(EvidenceKey {
                    context: context.to_string(),
                    name: rejected.result.value.name.trim().to_lowercase(),
                });
                audit.matched_contexts.insert(context.to_string());
            }
        }
        audit.pairs.push(PairAudit {
            preferred: preferred.result.value.name.clone(),
            rejected: rejected.result.value.name.clone(),
            margin: composite_score(&preferred.result.value) as f64
                - composite_score(&rejected.result.value) as f64,
        });
    }
    Ok(audit)
}

fn merge_audit(combined: &mut Audit, audit: Audit, include_matched_evidence: bool) {
    if include_matched_evidence {
        combined
            .matched_liked
            .extend(audit.matched_liked.iter().cloned());
        combined
            .matched_passed
            .extend(audit.matched_passed.iter().cloned());
        combined
            .matched_contexts
            .extend(audit.matched_contexts.iter().cloned());
    }
    combined.pairs.extend(audit.pairs);
    combined.contexts.extend(audit.contexts);
    for (mode, counts) in audit.modes {
        let total = combined.modes.entry(mode).or_default();
        total[0] += counts[0];
        total[1] += counts[1];
    }
}

fn print_report(audit: &mut Audit, single_export: bool) {
    let mut wins = 0usize;
    let mut ties = 0usize;
    let mut losses = 0usize;
    for pair in &audit.pairs {
        if pair.margin > f64::EPSILON {
            wins += 1;
        } else if pair.margin < -f64::EPSILON {
            losses += 1;
        } else {
            ties += 1;
        }
    }

    let liked: usize = audit.modes.values().map(|counts| counts[0]).sum();
    let passed: usize = audit.modes.values().map(|counts| counts[1]).sum();

    println!("\n=== Offline composite vs exported taste labels ===");
    println!("raw examples: {liked} liked, {passed} passed");
    println!("export context buckets: {}", audit.contexts.len());
    println!("derived pairs: {}", audit.pairs.len());
    if !audit.pairs.is_empty() {
        let agreement = (wins as f64 + ties as f64 * 0.5) / audit.pairs.len() as f64 * 100.0;
        println!(
            "derived pair agreement: {agreement:.1}%  (wins {wins}, ties {ties}, losses {losses})"
        );
    } else {
        println!("derived pair agreement: n/a (export needs matched liked and passed labels)");
    }
    println!(
        "note: pairs are inferred from separate unary like/pass actions; shared endpoints are not independent observations"
    );

    if single_export {
        let matched_liked = audit.matched_liked.len();
        let matched_passed = audit.matched_passed.len();
        println!(
            "matched scoped evidence: {matched_liked} liked, {matched_passed} passed across {} project contexts",
            audit.matched_contexts.len()
        );
        if minimum_sample_ready(matched_liked, matched_passed) {
            println!(
                "minimum descriptive audit sample: reached (10/10 is not independent or blind proof)"
            );
        } else {
            println!(
                "minimum descriptive audit sample: not reached (need {} more matched likes and {} more matched passes)",
                10usize.saturating_sub(matched_liked),
                10usize.saturating_sub(matched_passed)
            );
        }
    } else {
        println!("matched scoped evidence: NOT AGGREGATED across multiple files");
        println!("minimum descriptive audit sample: NOT EVALUATED across multiple files");
        println!(
            "warning: v2 has no rater/profile/snapshot identity; combined totals may double-count cumulative exports. Use one terminal export per independent profile and treat combined results as descriptive only"
        );
    }
    println!("direct blinded pair choices: NOT EVALUATED");
    println!("reversed-choice consistency: NOT EVALUATED");

    println!("\nlabels by source mode:");
    for (mode, [liked, passed]) in &audit.modes {
        println!("  {mode:<10} liked {liked:>4}  passed {passed:>4}");
    }

    audit.pairs.sort_by(|a, b| a.margin.total_cmp(&b.margin));
    let disagreements: Vec<&PairAudit> = audit
        .pairs
        .iter()
        .filter(|pair| pair.margin < 0.0)
        .take(10)
        .collect();
    if !disagreements.is_empty() {
        println!("\nworst disagreements (negative = offline score preferred the passed name):");
        for pair in disagreements {
            println!(
                "  {:>6.1}  {} > {}",
                pair.margin, pair.preferred, pair.rejected
            );
        }
    }
}

fn main() {
    let paths: Vec<String> = std::env::args().skip(1).collect();
    if paths.is_empty() {
        eprintln!("usage: taste_audit <neologism-taste.json> [more.json]");
        std::process::exit(1);
    }

    let single_export = paths.len() == 1;
    let mut combined = Audit::default();
    for path in &paths {
        let raw = fs::read_to_string(path).unwrap_or_else(|error| {
            eprintln!("{path}: {error}");
            std::process::exit(2);
        });
        let dataset: Dataset = serde_json::from_str(&raw).unwrap_or_else(|error| {
            eprintln!("{path}: invalid JSON: {error}");
            std::process::exit(2);
        });
        let audit = audit_dataset(&dataset).unwrap_or_else(|error| {
            eprintln!("{path}: {error}");
            std::process::exit(2);
        });
        println!(
            "loaded {path}: {} examples, {} derived pairs; matched {}/{} across {} scoped contexts; minimum descriptive sample {}",
            dataset.examples.len(),
            audit.pairs.len(),
            audit.matched_liked.len(),
            audit.matched_passed.len(),
            audit.matched_contexts.len(),
            if minimum_sample_ready(audit.matched_liked.len(), audit.matched_passed.len()) {
                "reached"
            } else {
                "not reached"
            }
        );
        merge_audit(&mut combined, audit, single_export);
    }
    print_report(&mut combined, single_export);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(raw: &str) -> Dataset {
        serde_json::from_str(raw).expect("valid fixture")
    }

    fn fixture_example(label: &str, name: &str, context: Option<&str>) -> serde_json::Value {
        let mut result = serde_json::json!({
            "name": name,
            "style": "big_tech",
            "syllables": 2,
            "score_pronounce": 85,
            "score_novelty": 90,
            "score_memorability": 80,
            "connotations": []
        });
        if let Some(context) = context {
            result["tasteContext"] = serde_json::json!({ "id": context });
        }
        serde_json::json!({ "label": label, "result": result })
    }

    fn fixture_dataset(examples: Vec<serde_json::Value>, comparisons: Vec<[usize; 2]>) -> Dataset {
        serde_json::from_value(serde_json::json!({
            "schema": "neologism-taste-v2",
            "examples": examples,
            "comparisons": comparisons
        }))
        .expect("valid generated fixture")
    }

    #[test]
    fn computes_pairwise_agreement_and_modes() {
        let dataset = parse(
            r#"{
              "schema":"neologism-taste-v2",
              "examples":[
                {"label":"liked","result":{"name":"Noma","style":"big_tech","sourceMode":"realword","tasteContext":{"id":"project-a"},"syllables":2,"score_pronounce":90,"score_novelty":90,"score_memorability":90,"connotations":[]}},
                {"label":"liked","result":{"name":"Lexix","style":"big_tech","sourceMode":"brandable","tasteContext":{"id":"project-b"},"syllables":2,"score_pronounce":60,"score_novelty":60,"score_memorability":60,"connotations":[]}},
                {"label":"passed","result":{"name":"Bobbyn","style":"big_tech","sourceMode":"respell","tasteContext":{"id":"project-a"},"syllables":2,"score_pronounce":80,"score_novelty":80,"score_memorability":80,"connotations":[]}},
                {"label":"passed","result":{"name":"Toppyr","style":"big_tech","sourceMode":"respell","tasteContext":{"id":"project-b"},"syllables":2,"score_pronounce":80,"score_novelty":80,"score_memorability":80,"connotations":[]}}
              ],
              "comparisons":[[0,2],[1,3]]
            }"#,
        );
        let audit = audit_dataset(&dataset).expect("auditable");
        assert_eq!(audit.pairs.len(), 2);
        assert!(audit.pairs[0].margin > 0.0);
        assert!(audit.pairs[1].margin < 0.0);
        assert_eq!(audit.modes["realword"], [1, 0]);
        assert_eq!(audit.modes["respell"], [0, 2]);
        assert_eq!(audit.contexts.len(), 2);
        assert_eq!(audit.matched_liked.len(), 2);
        assert_eq!(audit.matched_passed.len(), 2);
        assert_eq!(audit.matched_contexts.len(), 2);
        assert!(!minimum_sample_ready(
            audit.matched_liked.len(),
            audit.matched_passed.len()
        ));
    }

    #[test]
    fn rejects_wrong_schema_and_pair_direction() {
        let wrong_schema = parse(r#"{"schema":"future-v2","examples":[],"comparisons":[]}"#);
        assert!(audit_dataset(&wrong_schema)
            .unwrap_err()
            .contains("unsupported schema"));

        let reversed = parse(
            r#"{
              "schema":"neologism-taste-v2",
              "examples":[
                {"label":"passed","result":{"name":"Bad","style":"big_tech","syllables":1,"score_pronounce":50,"score_novelty":50,"score_memorability":50,"connotations":[]}},
                {"label":"liked","result":{"name":"Good","style":"big_tech","syllables":1,"score_pronounce":90,"score_novelty":90,"score_memorability":90,"connotations":[]}}
              ],
              "comparisons":[[0,1]]
            }"#,
        );
        assert!(audit_dataset(&reversed)
            .unwrap_err()
            .contains("liked > passed"));
    }

    #[test]
    fn rejects_v2_pairs_across_project_contexts() {
        let crossed = parse(
            r#"{
              "schema":"neologism-taste-v2",
              "examples":[
                {"label":"liked","result":{"name":"Noma","style":"big_tech","tasteContext":{"id":"project-a"},"syllables":2,"score_pronounce":90,"score_novelty":90,"score_memorability":90,"connotations":[]}},
                {"label":"passed","result":{"name":"Bobbyn","style":"big_tech","tasteContext":{"id":"project-b"},"syllables":2,"score_pronounce":80,"score_novelty":80,"score_memorability":80,"connotations":[]}}
              ],
              "comparisons":[[0,1]]
            }"#,
        );

        assert!(audit_dataset(&crossed)
            .unwrap_err()
            .contains("crosses project contexts"));
    }

    #[test]
    fn readiness_counts_unique_scoped_endpoints_not_cartesian_rows() {
        let mut examples = Vec::new();
        for index in 0..10 {
            examples.push(fixture_example(
                "liked",
                &format!("Like{index}"),
                Some("project-a"),
            ));
        }
        for index in 0..10 {
            examples.push(fixture_example(
                "passed",
                &format!("Pass{index}"),
                Some("project-a"),
            ));
        }
        let comparisons = (0..10)
            .flat_map(|liked| (10..20).map(move |passed| [liked, passed]))
            .collect();
        let audit = audit_dataset(&fixture_dataset(examples, comparisons)).expect("auditable");

        assert_eq!(audit.pairs.len(), 100);
        assert_eq!(audit.matched_liked.len(), 10);
        assert_eq!(audit.matched_passed.len(), 10);
        assert_eq!(audit.matched_contexts.len(), 1);
        assert!(minimum_sample_ready(
            audit.matched_liked.len(),
            audit.matched_passed.len()
        ));
        assert!(!minimum_sample_ready(9, 10));
        assert!(minimum_sample_ready(10, 10));
    }

    #[test]
    fn disjoint_and_fanned_labels_do_not_inflate_readiness() {
        let mut disjoint_examples = Vec::new();
        for index in 0..10 {
            disjoint_examples.push(fixture_example(
                "liked",
                &format!("Like{index}"),
                Some("project-a"),
            ));
            disjoint_examples.push(fixture_example(
                "passed",
                &format!("Pass{index}"),
                Some("project-b"),
            ));
        }
        let disjoint =
            audit_dataset(&fixture_dataset(disjoint_examples, vec![])).expect("auditable");
        assert_eq!(disjoint.matched_liked.len(), 0);
        assert_eq!(disjoint.matched_passed.len(), 0);

        let mut fanned_examples = vec![fixture_example("liked", "OnlyLike", Some("project-c"))];
        for index in 0..10 {
            fanned_examples.push(fixture_example(
                "passed",
                &format!("Pass{index}"),
                Some("project-c"),
            ));
        }
        let comparisons = (1..=10).map(|passed| [0, passed]).collect();
        let fanned =
            audit_dataset(&fixture_dataset(fanned_examples, comparisons)).expect("auditable");
        assert_eq!(fanned.matched_liked.len(), 1);
        assert_eq!(fanned.matched_passed.len(), 10);
        assert!(!minimum_sample_ready(
            fanned.matched_liked.len(),
            fanned.matched_passed.len()
        ));
    }

    #[test]
    fn duplicate_and_legacy_pairs_do_not_inflate_scoped_evidence() {
        let duplicates = fixture_dataset(
            vec![
                fixture_example("liked", "Noma", Some("project-d")),
                fixture_example("liked", "NOMA", Some("project-d")),
                fixture_example("passed", "Miss", Some("project-d")),
                fixture_example("passed", "MISS", Some("project-d")),
            ],
            vec![[0, 2], [0, 2], [1, 3]],
        );
        let duplicate_audit = audit_dataset(&duplicates).expect("auditable");
        assert_eq!(duplicate_audit.pairs.len(), 3);
        assert_eq!(duplicate_audit.matched_liked.len(), 1);
        assert_eq!(duplicate_audit.matched_passed.len(), 1);

        let legacy = fixture_dataset(
            vec![
                fixture_example("liked", "OldLike", None),
                fixture_example("passed", "OldPass", None),
            ],
            vec![[0, 1]],
        );
        let legacy_audit = audit_dataset(&legacy).expect("auditable");
        assert_eq!(legacy_audit.pairs.len(), 1);
        assert!(legacy_audit.matched_liked.is_empty());
        assert!(legacy_audit.matched_passed.is_empty());
        assert!(legacy_audit.matched_contexts.is_empty());
    }

    #[test]
    fn multiple_files_never_merge_readiness_endpoints() {
        let first = audit_dataset(&fixture_dataset(
            vec![
                fixture_example("liked", "LikeA", Some("project-a")),
                fixture_example("passed", "PassA", Some("project-a")),
            ],
            vec![[0, 1]],
        ))
        .expect("auditable");
        let second = audit_dataset(&fixture_dataset(
            vec![
                fixture_example("liked", "LikeB", Some("project-b")),
                fixture_example("passed", "PassB", Some("project-b")),
            ],
            vec![[0, 1]],
        ))
        .expect("auditable");
        let mut combined = Audit::default();
        merge_audit(&mut combined, first, false);
        merge_audit(&mut combined, second, false);

        assert_eq!(combined.pairs.len(), 2);
        assert!(combined.matched_liked.is_empty());
        assert!(combined.matched_passed.is_empty());
        assert!(combined.matched_contexts.is_empty());
    }
}
