// Audit recurring Brandable morphology artifacts across established and held-out briefs.
// Run: cargo run -p neologism-core --example morphology_compare --release
use neologism_core::generate;
use neologism_core::keywords::{brand_roots, extract_keywords};
use neologism_core::metrics::{composite_score, diversity};
use neologism_core::style::{Config, Style};
use std::collections::BTreeSet;

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

fn main() {
    let mut total = 0usize;
    let mut collapsed = 0usize;
    let mut composite = 0u64;
    let mut batch_diversity = 0.0;
    let mut collapsed_examples = BTreeSet::new();

    for prompt in PROMPTS {
        let keywords = extract_keywords(prompt, 6);
        let roots = brand_roots(&keywords, 16);
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
            }
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
}
