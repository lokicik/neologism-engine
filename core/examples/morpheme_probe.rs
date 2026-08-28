//! Morpheme-composition family probe (Phase 141, roadmap phase 3). Prints the
//! page for a set of briefs so classical-coinage quality can be eyeballed.
//!
//! ```powershell
//! cargo run -p neologism-core --example morpheme_probe --release
//! ```

use neologism_core::style::{Config, Style};

fn main() {
    let briefs = [
        "a tool for photo light and color",
        "a water and sea navigation app",
        "a knowledge and learning platform",
        "a time and calendar scheduler",
        "a secure vault for secrets",
        "a fast performance monitor",
        "a sound and audio workstation",
        "a star map and astronomy app",
        "a health and wellness tracker",
        "a word and language dictionary",
    ];
    for brief in briefs {
        let cfg = Config {
            style: Style::BigTech,
            variant: Some("morpheme".to_string()),
            description: Some(brief.to_string()),
            seed: Some(67),
            ..Config::default()
        };
        let page = neologism_core::generate(&cfg);
        println!(
            "{brief}\n  {} names: {}\n",
            page.len(),
            page.iter().map(|r| r.name.clone()).collect::<Vec<_>>().join(", "),
        );
    }
}
