// Throwaway harness: generate a rich candidate pool for a given product
// description across all big-tech modes, print each with the engine's own
// scores so a human (or LLM) can do the taste-filtering the engine can't.
// Run: cargo run -p neologism-core --example candidates --release -- "your project description here"
use neologism_core::generate;
use neologism_core::style::{Config, Style};
use std::collections::BTreeSet;

fn base(desc: &Option<String>) -> Config {
    Config {
        style: Style::BigTech,
        count: 12,
        min_len: 4,
        max_len: 12,
        temperature: 0.85,
        variety: 0.4,
        seed: None,
        roots: vec![],
        variant: None,
        description: desc.clone(),
        compound: false,
        starts_with: None,
        contains: None,
        exclude: vec![],
    }
}

fn composite(pron: u32, mem: u32, nov: u32) -> f64 {
    0.40 * pron as f64 + 0.30 * mem as f64 + 0.30 * nov as f64
}

fn run(label: &str, cfgs: Vec<Config>) {
    let mut seen: BTreeSet<String> = BTreeSet::new();
    let mut rows: Vec<(f64, String)> = vec![];
    for cfg in cfgs {
        for r in generate(&cfg) {
            if !seen.insert(r.name.to_lowercase()) {
                continue;
            }
            let c = composite(r.score_pronounce, r.score_novelty, r.score_memorability);
            let conn = if r.connotations.is_empty() {
                String::new()
            } else {
                format!("  [{}]", r.connotations.join(", "))
            };
            rows.push((
                c,
                format!(
                    "  {:<14} comp {:>4.0}  pron {:>3} mem {:>3} nov {:>3}  {}syl{}",
                    r.name, c, r.score_pronounce, r.score_memorability, r.score_novelty,
                    r.syllables, conn
                ),
            ));
        }
    }
    rows.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
    println!("\n=== {label} ({} names, engine-ranked best first) ===", rows.len());
    for (_, line) in rows {
        println!("{line}");
    }
}

fn main() {
    let desc_str = std::env::args().skip(1).collect::<Vec<_>>().join(" ");
    let desc = if desc_str.trim().is_empty() {
        None
    } else {
        Some(desc_str.clone())
    };
    println!(
        "description: {}",
        desc.clone().unwrap_or_else(|| "(none — generic brandable)".into())
    );

    // Brandable (coined): several seeds × two variety levels for breadth.
    let mut brandable = vec![];
    for &seed in &[7u64, 42, 101, 2024] {
        for &variety in &[0.35f64, 0.65] {
            let mut c = base(&desc);
            c.seed = Some(seed);
            c.variety = variety;
            brandable.push(c);
        }
    }
    run("BRANDABLE / coined", brandable);

    // Compound (adjective + keyword noun).
    let compound = [11u64, 77, 909]
        .iter()
        .map(|&seed| {
            let mut c = base(&desc);
            c.compound = true;
            c.seed = Some(seed);
            c
        })
        .collect();
    run("COMPOUND", compound);

    // Real-word mode (curated evocative words; description-independent by design).
    let realword = [5u64, 55, 555]
        .iter()
        .map(|&seed| {
            let mut c = base(&desc);
            c.variant = Some("realword".into());
            c.seed = Some(seed);
            c
        })
        .collect();
    run("REAL-WORD", realword);

    // Respell (Lyft/Tumblr-style one-transform respellings).
    let respell = [9u64, 99, 999]
        .iter()
        .map(|&seed| {
            let mut c = base(&desc);
            c.variant = Some("respell".into());
            c.seed = Some(seed);
            c
        })
        .collect();
    run("RESPELL", respell);
}
