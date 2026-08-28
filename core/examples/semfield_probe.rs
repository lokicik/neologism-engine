//! Semantic-field starvation probe (Phase 141, roadmap phase 2).
//!
//! The seam-blend family starves on briefs whose curated concept groups are
//! thin — it could only offer a handful of names. This probe reports, for a
//! set of deliberately thin/off-lexicon briefs, the page size the family now
//! produces and the semantic-field expansions driving it, so the fix is
//! measurable. Deterministic.
//!
//! ```powershell
//! cargo run -p neologism-core --example semfield_probe --release
//! ```

use neologism_core::style::{Config, Style};
use neologism_core::{keywords, semfield};

fn main() {
    // Briefs whose key nouns fall outside the curated concept lexicon — the
    // cases where the family used to return only 1-3 names.
    let briefs = [
        "a note taking app with backlinks",
        "a self hosted photo gallery",
        "a spreadsheet for climbing routes",
        "a synthesizer patch librarian",
        "a tool for pruning bonsai trees",
        "a ferment and pickle tracker",
        "an app for birdwatching sightings",
        "a tabletop dice roller",
    ];

    let mut total = 0usize;
    for brief in briefs {
        let cfg = Config {
            style: Style::BigTech,
            variant: Some("seamblend".to_string()),
            description: Some(brief.to_string()),
            seed: Some(67),
            ..Config::default()
        };
        let page = neologism_core::generate(&cfg);
        total += page.len();
        let kws = keywords::extract_keywords(brief, 6);
        let expansions: Vec<String> = kws
            .iter()
            .filter(|k| semfield::has(k))
            .map(|k| format!("{k}→[{}]", semfield::expand(k, 5).join(" ")))
            .collect();
        println!(
            "{brief}\n  {} names: {}\n  expand: {}\n",
            page.len(),
            page.iter().map(|r| r.name.clone()).collect::<Vec<_>>().join(", "),
            if expansions.is_empty() { "(none)".to_string() } else { expansions.join("  ") },
        );
    }
    println!("total names across {} thin briefs: {total}", briefs.len());
}
