//! Collision-risk report for the seam-blend family (Phase 141).
//!
//! The in-engine filters already reject exact corpus matches and brand-mimic
//! typos; this report surfaces the RESIDUAL risk classes the HANDOFF's HireHub
//! lesson names: (a) transparent {real-word}×{hub,map,set,arc,lab,beam,seed}
//! pairs, which are near-certainly taken in-domain, and (b) any candidate
//! within edit distance 2 of a known brand in a size range the mimic predicate
//! does not cover. Review the flagged list manually before enabling the Lab
//! mode in a deploy. Exit code 1 only on an exact brand/corpus hit (a filter
//! regression), never on flags — this is a review queue, not a gate.
//!
//! ```powershell
//! cargo run -p neologism-core --example collision_report --release
//! ```

use neologism_core::style::{Config, Style};
use std::collections::HashSet;
use std::fs;

/// Local copy — `score::levenshtein` is crate-private and score.rs is frozen.
fn levenshtein(a: &str, b: &str) -> usize {
    let b_chars: Vec<char> = b.chars().collect();
    let mut row: Vec<usize> = (0..=b_chars.len()).collect();
    for (i, ca) in a.chars().enumerate() {
        let mut prev = row[0];
        row[0] = i + 1;
        for (j, &cb) in b_chars.iter().enumerate() {
            let old = row[j + 1];
            row[j + 1] = (row[j + 1] + 1)
                .min(row[j] + 1)
                .min(prev + usize::from(ca != cb));
            prev = old;
        }
    }
    row[b_chars.len()]
}

const BLOCKLIST_TAILS: &[&str] = &["hub", "map", "set", "arc", "lab", "beam", "seed"];

fn wordlist(path: &str) -> Vec<String> {
    fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("cannot read {path}: {e}"))
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(str::to_lowercase)
        .collect()
}

fn main() {
    let brands = wordlist("core/data/bigtech.txt");
    let brand_set: HashSet<&str> = brands.iter().map(String::as_str).collect();
    let common: HashSet<String> = wordlist("core/data/common_words.txt").into_iter().collect();

    let briefs = [
        "candidate tracking software for recruiters",
        "a weekly menu and grocery organizer",
        "a customer relationship pipeline for sales representatives",
        "a color palette and visual design tool",
        "a delivery tracking and logistics app",
        "an AI assistant for workflow automation",
        "a naming tool for new products",
        "a terminal log viewer",
        "a cloud deployment dashboard",
        "a message queue client",
        "a feature flag service",
        "a documentation site generator",
        "legal research for court cases",
        "a habit tracker for daily routines",
        "password manager for teams",
    ];
    let seeds = [13u64, 67, 313];

    let mut all: Vec<String> = Vec::new();
    for brief in briefs {
        for seed in seeds {
            let cfg = Config {
                style: Style::BigTech,
                variant: Some("seamblend".to_string()),
                description: Some(brief.to_string()),
                seed: Some(seed),
                ..Config::default()
            };
            for r in neologism_core::generate(&cfg) {
                all.push(r.name.to_lowercase());
            }
        }
    }
    all.sort();
    all.dedup();

    let mut exact = Vec::new();
    let mut generic_pairs = Vec::new();
    let mut near_brand = Vec::new();
    for name in &all {
        if brand_set.contains(name.as_str()) {
            exact.push(name.clone());
        }
        for tail in BLOCKLIST_TAILS {
            if let Some(stem) = name.strip_suffix(tail) {
                if stem.len() >= 3 && common.contains(stem) {
                    generic_pairs.push(name.clone());
                }
            }
        }
        for brand in &brands {
            let bl = brand.chars().count();
            let nl = name.chars().count();
            if bl.abs_diff(nl) <= 2 && bl >= 5 && levenshtein(name, brand) <= 2 {
                near_brand.push(format!("{name} ~ {brand}"));
                break;
            }
        }
    }

    println!(
        "{} unique seam-blend candidates across {} briefs x {} seeds",
        all.len(),
        briefs.len(),
        seeds.len()
    );
    println!("exact brand hits (filter regression if nonzero): {}", exact.len());
    for name in &exact {
        println!("  EXACT {name}");
    }
    println!("transparent generic pairs (HireHub class): {}", generic_pairs.len());
    for name in &generic_pairs {
        println!("  PAIR  {name}");
    }
    println!("near-brand (edit<=2 of a 5+ char brand): {}", near_brand.len());
    for line in near_brand.iter().take(40) {
        println!("  NEAR  {line}");
    }
    if near_brand.len() > 40 {
        println!("  ... {} more", near_brand.len() - 40);
    }
    std::process::exit(if exact.is_empty() { 0 } else { 1 });
}
