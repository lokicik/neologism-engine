//! Probe for the deterministic reasoning namer (Phase 143): prints each name
//! with its full reasoning chain, origin, and availability. Deterministic.
//!
//! ```powershell
//! cargo run -p neologism-core --example reason_probe --release
//! ```

use neologism_core::reason::generate_reason_explained;
use neologism_core::style::{Config, Style};

fn main() {
    let briefs = [
        "a self hosted password manager",
        "a note taking app with backlinks",
        "a terminal log viewer for developers",
        "a command line tool for database migrations",
        "a real time collaborative code editor",
        "an audio and music production app",
        "a package registry for private modules",
        "a habit tracking app",
    ];
    for wild in [false, true] {
        println!("======== {} register ========", if wild { "WILD" } else { "BALANCED" });
        for brief in briefs {
            let cfg = Config {
                style: Style::BigTech,
                variant: Some("reason".to_string()),
                description: Some(brief.to_string()),
                seed: Some(7),
                count: 6,
                temperature: if wild { 1.2 } else { 0.85 },
                ..Config::default()
            };
            let (_, decodes) = generate_reason_explained(&cfg, 7);
            println!("--- {brief}");
            for d in decodes {
                println!(
                    "  {:<10} [{}/{}{}]  {}   ({} → {})",
                    d.name,
                    d.kind,
                    d.origin,
                    if d.taken { ", taken" } else { "" },
                    d.gloss,
                    d.chain.join(" → "),
                    d.name,
                );
            }
        }
        println!();
    }
}
