//! THE GATE (Phase 142 WP1): prints the submorph family's top candidates with
//! their decodes for owner review. No web work proceeds until this output is
//! judged against the ~300-rejection history. Deterministic.
//!
//! ```powershell
//! cargo run -p neologism-core --example submorph_probe --release
//! ```

use neologism_core::style::{Config, Style};
use neologism_core::submorph::generate_submorph_explained;
use std::collections::HashSet;

fn main() {
    let briefs = [
        "a tool that deploys and verifies cloud services",
        "an audio and music production app",
        "a note taking app with backlinks",
        "a secure payments and finance platform",
        "a health and fitness tracking app",
    ];
    for brief in briefs {
        let cfg = Config {
            style: Style::BigTech,
            variant: Some("submorph".to_string()),
            description: Some(brief.to_string()),
            seed: Some(67),
            count: 20,
            ..Config::default()
        };
        let (results, decodes) = generate_submorph_explained(&cfg, 67);
        println!("=== {brief} ===");
        for d in &decodes {
            let hits: Vec<&str> = d
                .head_hits
                .iter()
                .chain(d.tail_hits.iter())
                .map(String::as_str)
                .collect();
            println!(
                "  {:<12} {} = {}  ·  {} = {}   [{}{}]",
                d.name,
                d.head,
                d.head_gloss,
                d.tail,
                if d.tail_quality { "canon" } else { &d.tail_gloss },
                d.junction,
                if hits.is_empty() { String::new() } else { format!("; hits: {}", hits.join(",")) },
            );
        }
        let heads: HashSet<&str> = decodes.iter().map(|d| d.head.as_str()).collect();
        let tails: HashSet<&str> = decodes.iter().map(|d| d.tail.as_str()).collect();
        let tri = results
            .iter()
            .filter(|r| r.syllables >= 3)
            .count();
        println!(
            "  -- {} names · {} distinct heads · {} distinct tails · {} three-syllable\n",
            results.len(),
            heads.len(),
            tails.len(),
            tri
        );
    }
}
