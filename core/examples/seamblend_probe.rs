//! Offline pool dump for the seam-blend family (Phase 141): prints the
//! selected page for a set of briefs so seam quality can be eyeballed and fed
//! to the collision report. Deterministic (fixed seeds).
//!
//! ```powershell
//! cargo run -p neologism-core --example seamblend_probe --release
//! ```

use neologism_core::style::{Config, Style};

fn main() {
    let briefs = [
        "a terminal log viewer for developers",
        "password manager for teams",
        "a tool that generates brand names",
        "message queue for microservices",
        "habit tracking app",
        "cloud deployment dashboard",
        "recruiting and talent tracking",
        "note taking app with backlinks",
    ];
    for brief in briefs {
        let cfg = Config {
            style: Style::BigTech,
            variant: Some("seamblend".to_string()),
            description: Some(brief.to_string()),
            seed: Some(67),
            ..Config::default()
        };
        let page = neologism_core::generate(&cfg);
        let names: Vec<String> = page.iter().map(|r| r.name.clone()).collect();
        println!("{brief}\n  {}\n", names.join(", "));
    }
    // Promptless Lab page.
    let cfg = Config {
        style: Style::BigTech,
        variant: Some("seamblend".to_string()),
        seed: Some(67),
        ..Config::default()
    };
    let page = neologism_core::generate(&cfg);
    let names: Vec<String> = page.iter().map(|r| r.name.clone()).collect();
    println!("(no brief)\n  {}", names.join(", "));
}
