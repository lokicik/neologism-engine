// Fixed-seed human-audit harness for generic (no-prompt) Brandable names.
// Compares the generator-family mix and the no-prompt suffix-ranking signal;
// every filter stays production-identical.
// Run: cargo run -p neologism-core --example generic_compare --release
use neologism_core::style::{Config, Style};
use neologism_core::{generate_with_tuning, BigTechTuning};

const SEEDS: &[u64] = &[7, 42, 101, 2024];

fn config(seed: u64) -> Config {
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
        description: None,
        compound: false,
        starts_with: None,
        contains: None,
        exclude: vec![],
    }
}

fn names(seed: u64, markov_w: f64, blend_w: f64, suffix_w: f64) -> String {
    let mut tuning = BigTechTuning::from_variety(0.3);
    tuning.markov_w = markov_w;
    tuning.blend_w = blend_w;
    tuning.suffix_w = suffix_w;
    generate_with_tuning(&config(seed), &tuning)
        .into_iter()
        .map(|result| result.name)
        .collect::<Vec<_>>()
        .join(", ")
}

fn main() {
    let production = BigTechTuning::from_variety(0.3);
    for &seed in SEEDS {
        println!("\nseed {seed}");
        println!(
            "  prod : {}",
            names(
                seed,
                production.markov_w,
                production.blend_w,
                production.suffix_w,
            )
        );
        println!(
            "  no suffix bonus: {}",
            names(seed, production.markov_w, production.blend_w, 0.0)
        );
        println!("  low  : {}", names(seed, 0.10, 0.35, production.suffix_w));
        println!("  none : {}", names(seed, 0.00, 0.40, production.suffix_w));
    }
}
