// A/B harness for prompt-root quality. Runs the generator with fixed seeds,
// comparing raw keywords with concept expansion at several coverage weights.
// Run: cargo run -p neologism-core --example concept_compare --release
use neologism_core::keywords::{brand_root_groups, extract_keywords};
use neologism_core::metrics::{composite_score, diversity};
use neologism_core::style::{Config, Style};
use neologism_core::{generate_with_tuning, BigTechTuning};
use std::collections::{HashMap, HashSet};

const PROMPTS: &[&str] = &[
    "a developer tool that generates names for packages CLIs libraries and projects",
    "a journaling app with mood insights",
    "a secure password manager for teams",
    "an app for splitting expenses with friends",
    "a marketplace for vintage keyboards",
    "a fast analytics dashboard for API performance",
    "fitness",
    "legal research",
];

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

fn names(prompt: &str, seed: u64, concept_expand: bool, coverage_w: f64) -> String {
    let mut tuning = BigTechTuning::from_variety(0.3);
    tuning.concept_expand = concept_expand;
    tuning.concept_coverage_w = coverage_w;
    generate_with_tuning(&config(prompt, seed), &tuning)
        .into_iter()
        .map(|r| r.name)
        .collect::<Vec<_>>()
        .join(", ")
}

fn production_audit(prompt: &str) -> String {
    const BATCHES: usize = 10;
    let groups = brand_root_groups(&extract_keywords(prompt, 6), 16);
    let mut total = 0usize;
    let mut composite = 0u64;
    let mut batch_diversity = 0.0;
    let mut family_overflow_batches = 0usize;
    let mut two_concept = 0usize;
    let mut unique = HashSet::new();
    let mut excluded = Vec::new();
    let mut short_batches = 0usize;

    for batch in 0..BATCHES {
        let seed = 0xA076_1D64_78BD_642Fu64.wrapping_mul(batch as u64 + 1);
        let mut cfg = config(prompt, seed);
        cfg.exclude = excluded.clone();
        let results = generate_with_tuning(&cfg, &BigTechTuning::from_variety(0.3));
        if results.len() < cfg.count {
            short_batches += 1;
        }
        let mut prefixes: HashMap<String, usize> = HashMap::new();
        for result in &results {
            let lower = result.name.to_lowercase();
            let prefix: String = lower.chars().take(3).collect();
            *prefixes.entry(prefix).or_default() += 1;
            let covered = groups
                .iter()
                .filter(|group| {
                    group.iter().any(|root| {
                        lower.contains(root) || (root.len() >= 3 && lower.contains(&root[..3]))
                    })
                })
                .count();
            if covered >= 2 {
                two_concept += 1;
            }
            composite += composite_score(result) as u64;
            unique.insert(lower);
            total += 1;
        }
        excluded.extend(results.iter().map(|result| result.name.clone()));
        if prefixes.values().copied().max().unwrap_or(0) > 2 {
            family_overflow_batches += 1;
        }
        batch_diversity += diversity(&results);
    }

    format!(
        "100-name session: {total} names  comp {:.1}  div {:.3}  unique {:.1}%  two-concept {:.1}%  prefix>2 {family_overflow_batches}/{BATCHES}  short {short_batches}",
        composite as f64 / total as f64,
        batch_diversity / BATCHES as f64,
        unique.len() as f64 / total as f64 * 100.0,
        two_concept as f64 / total as f64 * 100.0,
    )
}

fn main() {
    for (i, prompt) in PROMPTS.iter().enumerate() {
        let seed = 0xA076_1D64_78BD_642Fu64.wrapping_mul(i as u64 + 1);
        let keywords = extract_keywords(prompt, 6);
        println!("\n{prompt}");
        println!("  roots: {:?}", brand_root_groups(&keywords, 16));
        println!("  old  : {}", names(prompt, seed, false, 0.85));
        println!("  .85  : {}", names(prompt, seed, true, 0.85));
        println!("  .50  : {}", names(prompt, seed, true, 0.50));
        println!("  .25  : {}", names(prompt, seed, true, 0.25));
        println!("  {}", production_audit(prompt));
    }
}
