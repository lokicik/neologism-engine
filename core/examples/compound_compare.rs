// Rolling audit for description-driven Compound names.
// Run: cargo run -p neologism-core --example compound_compare --release
use neologism_core::generate;
use neologism_core::keywords::{compound_roots, extract_keywords};
use neologism_core::metrics::{composite_score, diversity};
use neologism_core::style::{Config, Style};
use std::collections::HashSet;

const PROMPTS: &[&str] = &[
    "a developer tool that generates names for packages CLIs libraries and projects",
    "a journaling app with mood insights",
    "a secure password manager for teams",
    "an app for splitting expenses with friends",
    "a marketplace for vintage keyboards",
    "a fast analytics dashboard for API performance",
    "fitness",
    "a travel route planner",
    "an education study app",
    "an AI automation agent",
    "a music app",
    "legal research",
];
const SEEDS: &[u64] = &[7, 42, 101, 2024, 9999];

fn noun(name: &str) -> String {
    name.char_indices()
        .skip(1)
        .find(|(_, character)| character.is_ascii_uppercase())
        .map(|(index, _)| name[index..].to_lowercase())
        .unwrap_or_default()
}

fn config(description: &str, seed: u64) -> Config {
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
        description: Some(description.to_string()),
        compound: true,
        starts_with: None,
        contains: None,
        exclude: vec![],
    }
}

fn main() {
    let mut grand_total = 0usize;
    let mut grand_linked = 0usize;

    for prompt in PROMPTS {
        let keywords = extract_keywords(prompt, 6);
        let accepted: HashSet<String> = compound_roots(&keywords, 16).into_iter().collect();
        let mut total = 0usize;
        let mut linked = 0usize;
        let mut composite = 0u64;
        let mut batch_diversity = 0.0;
        let mut unique = HashSet::new();
        let mut first = Vec::new();

        for (index, seed) in SEEDS.iter().enumerate() {
            let results = generate(&config(prompt, *seed));
            if index == 0 {
                first = results.iter().map(|result| result.name.clone()).collect();
            }
            batch_diversity += diversity(&results);
            for result in &results {
                total += 1;
                linked += usize::from(accepted.contains(&noun(&result.name)));
                composite += composite_score(result) as u64;
                unique.insert(result.name.to_lowercase());
            }
        }

        grand_total += total;
        grand_linked += linked;
        let mut long_config = config(prompt, SEEDS[0]);
        long_config.count = 100;
        let long_count = generate(&long_config).len();
        println!("\n{prompt}");
        println!("  first: {}", first.join(", "));
        println!(
            "  {linked}/{total} prompt-linked  comp {:.1}  div {:.3}  distinct {:.1}%  long {long_count}/100",
            composite as f64 / total as f64,
            batch_diversity / SEEDS.len() as f64,
            unique.len() as f64 / total as f64 * 100.0,
        );
    }

    println!(
        "\nall: {grand_linked}/{grand_total} prompt-linked ({:.1}%)",
        grand_linked as f64 / grand_total as f64 * 100.0,
    );
}
