// Audit recurring Brandable morphology artifacts across established and held-out briefs.
// Run: cargo run -p neologism-core --example morphology_compare --release
use neologism_core::blend::overlap_blend;
use neologism_core::generate;
use neologism_core::keywords::{brand_root_groups, brand_roots, extract_keywords};
use neologism_core::metrics::{composite_score, diversity};
use neologism_core::style::{Config, Style};
use std::collections::{BTreeMap, BTreeSet};

const PROMPTS: &[&str] = &[
    "a developer tool that generates names for packages CLIs libraries and projects",
    "a journaling app with mood insights",
    "a secure password manager for teams",
    "an app for splitting expenses with friends",
    "a marketplace for vintage keyboards",
    "a fast analytics dashboard for API performance",
    "a CLI for database migrations",
    "an API rate limiting library",
    "a terminal log viewer",
    "git release automation",
    "a local cache inspector",
    "a browser bookmark manager",
    "an API testing toolkit",
    "a cloud deployment dashboard",
];
const SEEDS: &[u64] = &[7, 42, 101, 2024, 9999];
const COLLAPSED_SUFFIX_TAILS: &[&str] = &["a", "o", "ra", "x", "fy"];
const CONCEPT_SUFFIXES: &[&str] = &["ia", "io", "ora", "ix", "ify"];

fn config(prompt: &str, seed: u64) -> Config {
    Config {
        style: Style::BigTech,
        count: 10,
        min_len: 4,
        max_len: 12,
        temperature: 0.85,
        variety: 0.3,
        seed: Some(seed),
        roots: vec![],
        variant: None,
        description: Some(prompt.to_string()),
        compound: false,
        starts_with: None,
        contains: None,
        exclude: vec![],
    }
}

fn has_collapsed_suffix(name: &str, roots: &[String]) -> bool {
    let lower = name.to_lowercase();
    roots.iter().any(|root| {
        root.chars()
            .last()
            .is_some_and(|last| matches!(last, 'a' | 'e' | 'i' | 'o' | 'u' | 'y'))
            && COLLAPSED_SUFFIX_TAILS
                .iter()
                .any(|tail| lower == format!("{root}{tail}"))
    })
}

fn has_full_vowel_suffix(name: &str, roots: &[String]) -> bool {
    let lower = name.to_lowercase();
    roots.iter().any(|root| {
        root.chars()
            .last()
            .is_some_and(|last| matches!(last, 'a' | 'e' | 'i' | 'o' | 'u' | 'y'))
            && CONCEPT_SUFFIXES
                .iter()
                .any(|suffix| lower == format!("{root}{suffix}"))
    })
}

fn overlap_candidates(
    groups: &[Vec<String>],
) -> (BTreeMap<String, String>, BTreeMap<String, String>) {
    let mut merged = BTreeMap::new();
    let mut preserved = BTreeMap::new();
    for first in 0..groups.len() {
        for second in first + 1..groups.len() {
            for a in &groups[first] {
                for b in &groups[second] {
                    if let Some(name) = overlap_blend(a, b) {
                        let overlap = a.len() + b.len() - name.len();
                        let pair = format!("{a}+{b} ({overlap})");
                        merged.insert(name, pair.clone());
                        preserved.insert(format!("{a}{b}"), pair);
                    }
                }
            }
        }
    }
    (merged, preserved)
}

fn record_overlap_form(
    name: &str,
    forms: &BTreeMap<String, String>,
    examples: &mut BTreeMap<String, usize>,
) {
    if let Some(pair) = forms.get(&name.to_lowercase()) {
        *examples.entry(format!("{name} <- {pair}")).or_default() += 1;
    }
}

fn main() {
    let mut total = 0usize;
    let mut collapsed = 0usize;
    let mut full_vowel_suffixes = 0usize;
    let mut composite = 0u64;
    let mut batch_diversity = 0.0;
    let mut collapsed_examples = BTreeSet::new();
    let mut full_vowel_suffix_examples = BTreeSet::new();
    let mut overlap_examples: BTreeMap<String, usize> = BTreeMap::new();
    let mut preserved_overlap_examples: BTreeMap<String, usize> = BTreeMap::new();
    let mut rolling_total = 0usize;
    let mut rolling_short = 0usize;
    let mut rolling_full_vowel_suffixes = 0usize;

    for prompt in PROMPTS {
        let keywords = extract_keywords(prompt, 6);
        let groups = brand_root_groups(&keywords, 16);
        let roots = brand_roots(&keywords, 16);
        let (overlaps, preserved_overlaps) = overlap_candidates(&groups);
        for seed in SEEDS {
            let results = generate(&config(prompt, *seed));
            batch_diversity += diversity(&results);
            for result in results {
                total += 1;
                composite += composite_score(&result) as u64;
                if has_collapsed_suffix(&result.name, &roots) {
                    collapsed += 1;
                    collapsed_examples.insert(result.name.clone());
                }
                if has_full_vowel_suffix(&result.name, &roots) {
                    full_vowel_suffixes += 1;
                    full_vowel_suffix_examples.insert(result.name.clone());
                }
                record_overlap_form(&result.name, &overlaps, &mut overlap_examples);
                record_overlap_form(
                    &result.name,
                    &preserved_overlaps,
                    &mut preserved_overlap_examples,
                );
            }
        }

        let mut excluded = Vec::new();
        for batch in 0..10 {
            let seed = 0xA076_1D64_78BD_642Fu64.wrapping_mul(batch + 1);
            let mut cfg = config(prompt, seed);
            cfg.exclude = excluded.clone();
            let results = generate(&cfg);
            rolling_short += usize::from(results.len() < cfg.count);
            rolling_total += results.len();
            for result in &results {
                rolling_full_vowel_suffixes +=
                    usize::from(has_full_vowel_suffix(&result.name, &roots));
                record_overlap_form(&result.name, &overlaps, &mut overlap_examples);
                record_overlap_form(
                    &result.name,
                    &preserved_overlaps,
                    &mut preserved_overlap_examples,
                );
            }
            excluded.extend(results.into_iter().map(|result| result.name));
        }
    }

    println!(
        "audited: {total}/{} names",
        PROMPTS.len() * SEEDS.len() * 10
    );
    println!(
        "collapsed vowel suffixes: {collapsed}/{total} ({:.1}%)",
        collapsed as f64 / total as f64 * 100.0
    );
    println!("composite: {:.2}", composite as f64 / total as f64);
    println!(
        "diversity: {:.3}",
        batch_diversity / (PROMPTS.len() * SEEDS.len()) as f64
    );
    println!(
        "collapsed examples: {}",
        collapsed_examples
            .into_iter()
            .collect::<Vec<_>>()
            .join(", ")
    );
    println!(
        "full vowel suffixes: {full_vowel_suffixes}/{total} ({:.1}%), rolling {rolling_full_vowel_suffixes}/{rolling_total}",
        full_vowel_suffixes as f64 / total as f64 * 100.0
    );
    println!(
        "full vowel suffix examples: {}",
        full_vowel_suffix_examples
            .into_iter()
            .collect::<Vec<_>>()
            .join(", ")
    );
    println!(
        "overlap examples: {}",
        overlap_examples
            .into_iter()
            .map(|(example, count)| format!("{example} x{count}"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    println!(
        "preserved overlap examples: {}",
        preserved_overlap_examples
            .into_iter()
            .map(|(example, count)| format!("{example} x{count}"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    println!(
        "rolling sessions: {rolling_total}/{} names, {rolling_short} short batches",
        PROMPTS.len() * 100
    );
}
