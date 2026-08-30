//! Stress harness for the reasoning namer (Phase 143): coverage across
//! off-KB domains, entry-repetition ("wallpaper") measurement, seed variety,
//! and continuation behavior. Deterministic.
//!
//! ```powershell
//! cargo run -p neologism-core --example reason_stress --release
//! ```

use neologism_core::reason::generate_reason_explained;
use neologism_core::style::{Config, Style};
use std::collections::{BTreeMap, HashSet};

fn cfg(brief: &str, seed: u64) -> Config {
    Config {
        style: Style::BigTech,
        variant: Some("reason".to_string()),
        description: Some(brief.to_string()),
        seed: Some(seed),
        count: 8,
        ..Config::default()
    }
}

fn main() {
    let briefs = [
        // Core dev domains (KB-adjacent)
        "a self hosted password manager",
        "a terminal log viewer",
        "a package registry for private modules",
        "a database migration tool",
        // Deliberately off-KB / hard domains
        "a video conferencing app",
        "an e-commerce checkout library",
        "a machine learning experiment tracker",
        "a kubernetes cost optimizer",
        "an invoice generator for freelancers",
        "a GPU profiler",
        "a spreadsheet engine",
        "a chess training app",
        "a weather station dashboard",
        "a dating app",
        "a podcast editor",
        "a recipe manager",
        "a kids drawing app",
        "an expense splitting app for roommates",
        "a flight booking search engine",
        "a plant care reminder app",
    ];

    let mut freq: BTreeMap<String, usize> = BTreeMap::new();
    let mut thin: Vec<(String, usize)> = Vec::new();
    println!("=== per-brief pages (seed 7) ===");
    for brief in briefs {
        let (results, decodes) = generate_reason_explained(&cfg(brief, 7), 7);
        for d in &decodes {
            *freq.entry(d.name.clone()).or_default() += 1;
        }
        if results.len() < 5 {
            thin.push((brief.to_string(), results.len()));
        }
        let line: Vec<String> = decodes
            .iter()
            .map(|d| format!("{}({})", d.name, d.chain.join(">")))
            .collect();
        println!("[{:>2}] {brief}\n     {}", results.len(), line.join("  "));
    }

    println!("\n=== wallpaper check: entries appearing in 4+ of 20 briefs ===");
    let mut rep: Vec<(&String, &usize)> = freq.iter().filter(|(_, &c)| c >= 4).collect();
    rep.sort_by(|a, b| b.1.cmp(a.1));
    for (name, c) in &rep {
        println!("  {c}x {name}");
    }
    println!("(total distinct entries used: {})", freq.len());

    println!("\n=== thin briefs (<5 names) ===");
    if thin.is_empty() {
        println!("  none");
    }
    for (b, n) in &thin {
        println!("  {n} names: {b}");
    }

    // Seed variety on one brief.
    let mut union: HashSet<String> = HashSet::new();
    let mut first_pages: Vec<Vec<String>> = Vec::new();
    for seed in 1..=5u64 {
        let (r, _) = generate_reason_explained(&cfg("a terminal log viewer", seed), seed);
        let names: Vec<String> = r.iter().map(|x| x.name.clone()).collect();
        union.extend(names.iter().cloned());
        first_pages.push(names);
    }
    println!("\n=== seed variety (log viewer, seeds 1-5, 8 per page) ===");
    println!("  union size: {} (40 slots)", union.len());
    println!("  seed1: {}", first_pages[0].join(", "));
    println!("  seed5: {}", first_pages[4].join(", "));

    // Continuation: exclude page 1, ask again.
    let (p1, _) = generate_reason_explained(&cfg("a self hosted password manager", 7), 7);
    let mut c2 = cfg("a self hosted password manager", 7);
    c2.exclude = p1.iter().map(|r| r.name.clone()).collect();
    let (p2, d2) = generate_reason_explained(&c2, 8);
    let overlap = p2
        .iter()
        .filter(|r| p1.iter().any(|x| x.name == r.name))
        .count();
    println!("\n=== continuation (password manager) ===");
    println!("  page2 size: {} · overlap with page1: {overlap}", p2.len());
    println!(
        "  page2: {}",
        d2.iter().map(|d| d.name.clone()).collect::<Vec<_>>().join(", ")
    );
}
