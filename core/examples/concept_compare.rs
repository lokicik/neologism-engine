// A/B harness for prompt-root quality. Runs the production generator with the
// same seeds while toggling only BigTechTuning::concept_expand.
// Run: cargo run -p neologism-core --example concept_compare --release
use neologism_core::style::{Config, Style};
use neologism_core::{generate_with_tuning, BigTechTuning};

const PROMPTS: &[&str] = &[
    "a developer tool that generates names for packages CLIs libraries and projects",
    "a journaling app with mood insights",
    "a secure password manager for teams",
    "an app for splitting expenses with friends",
    "a marketplace for vintage keyboards",
    "a fast analytics dashboard for API performance",
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

fn names(prompt: &str, seed: u64, concept_expand: bool) -> String {
    let mut tuning = BigTechTuning::from_variety(0.3);
    tuning.concept_expand = concept_expand;
    generate_with_tuning(&config(prompt, seed), &tuning)
        .into_iter()
        .map(|r| r.name)
        .collect::<Vec<_>>()
        .join(", ")
}

fn main() {
    for (i, prompt) in PROMPTS.iter().enumerate() {
        let seed = 0xA076_1D64_78BD_642Fu64.wrapping_mul(i as u64 + 1);
        println!("\n{prompt}");
        println!("  old : {}", names(prompt, seed, false));
        println!("  new : {}", names(prompt, seed, true));
    }
}
