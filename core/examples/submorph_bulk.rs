//! Bulk promptless emitter for taste passes (Phase 142): many seeds, both
//! registers, one line per name with its decode. Deterministic.
//!
//! ```powershell
//! cargo run -p neologism-core --example submorph_bulk --release
//! ```

use neologism_core::style::{Config, Style};
use neologism_core::submorph::generate_submorph_explained;
use std::collections::BTreeMap;

fn main() {
    // name -> (decode, register, count of appearances)
    let mut all: BTreeMap<String, (String, &'static str, usize)> = BTreeMap::new();
    for wild in [false, true] {
        let reg = if wild { "wild" } else { "bal " };
        for seed in 1u64..=30 {
            let cfg = Config {
                style: Style::BigTech,
                variant: Some("submorph".to_string()),
                seed: Some(seed),
                count: 10,
                temperature: if wild { 1.2 } else { 0.85 },
                ..Config::default()
            };
            let (_, decodes) = generate_submorph_explained(&cfg, seed);
            for d in decodes {
                let why = format!("{}={} + {}={}", d.head, d.head_gloss, d.tail, d.tail_gloss);
                let e = all.entry(d.name.clone()).or_insert((why, reg, 0));
                e.2 += 1;
            }
        }
    }
    let mut rows: Vec<(&String, &(String, &'static str, usize))> = all.iter().collect();
    rows.sort_by(|a, b| b.1 .2.cmp(&a.1 .2).then(a.0.cmp(b.0)));
    for (name, (why, reg, n)) in rows {
        println!("{n:>2}x [{reg}] {name:<14} {why}");
    }
}
