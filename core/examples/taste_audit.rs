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

#[derive(Debug, Deserialize, PartialEq)]
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
        if dataset.schema == "neologism-taste-v2" {
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
            if preferred_context != rejected_context {
                return Err(format!(
                    "comparison {pair_index} crosses project contexts: {:?} > {:?}",
                    preferred_context.unwrap_or("legacy-unscoped"),
                    rejected_context.unwrap_or("legacy-unscoped")
                ));
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

fn print_report(audit: &mut Audit) {
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

    println!("\n=== Offline composite vs human taste ===");
    println!("examples: {liked} liked, {passed} passed");
    println!("contexts: {}", audit.contexts.len());
    println!("pairs: {}", audit.pairs.len());
    if !audit.pairs.is_empty() {
        let agreement = (wins as f64 + ties as f64 * 0.5) / audit.pairs.len() as f64 * 100.0;
        println!("agreement: {agreement:.1}%  (wins {wins}, ties {ties}, losses {losses})");
    } else {
        println!("agreement: n/a (export needs at least one liked and one passed name)");
    }
    if liked < 10 || passed < 10 {
        println!("note: collect at least 10 liked and 10 passed examples before treating agreement as stable");
    }

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

    let mut combined = Audit::default();
    for path in paths {
        let raw = fs::read_to_string(&path).unwrap_or_else(|error| {
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
            "loaded {path}: {} examples, {} pairs",
            dataset.examples.len(),
            audit.pairs.len()
        );
        combined.pairs.extend(audit.pairs);
        combined.contexts.extend(audit.contexts);
        for (mode, counts) in audit.modes {
            let total = combined.modes.entry(mode).or_default();
            total[0] += counts[0];
            total[1] += counts[1];
        }
    }
    print_report(&mut combined);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(raw: &str) -> Dataset {
        serde_json::from_str(raw).expect("valid fixture")
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
}
