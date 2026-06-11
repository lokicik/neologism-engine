// Phase 36 naming modes: seeded samples + score averages for the respell and
// real-word big-tech modes. The `sample` example stays untouched as the frozen
// default-path baseline; this harness covers the additive modes only.
// Run: cargo run -p neologism-core --example modes --release
use neologism_core::generate;
use neologism_core::style::{Config, Style};

const BATCHES: usize = 100;
const COUNT: usize = 10;

fn cfg(variant: &str, seed: u64) -> Config {
    Config {
        style: Style::BigTech,
        count: COUNT,
        min_len: 4,
        max_len: 12,
        temperature: 0.85,
        variety: 0.3,
        seed: Some(seed),
        roots: vec![],
        variant: Some(variant.to_string()),
        description: None,
        compound: false,
        starts_with: None,
        contains: None,
        exclude: vec![],
    }
}

fn main() {
    for variant in ["respell", "realword"] {
        let sample: Vec<String> = generate(&cfg(variant, 42)).into_iter().map(|r| r.name).collect();
        println!("{variant:9}: {}", sample.join(", "));

        let (mut p, mut n, mut m, mut total) = (0u64, 0u64, 0u64, 0usize);
        let mut short = 0usize;
        for b in 0..BATCHES {
            let results = generate(&cfg(variant, 0xA076_1D64_78BD_642Fu64.wrapping_mul(b as u64 + 1)));
            if results.len() < COUNT { short += 1; }
            for r in results {
                p += r.score_pronounce as u64;
                n += r.score_novelty as u64;
                m += r.score_memorability as u64;
                total += 1;
            }
        }
        let t = total as f64;
        println!(
            "  {BATCHES} batches: pron {:.1}  nov {:.1}  mem {:.1}  names {total}  short {short}\n",
            p as f64 / t, n as f64 / t, m as f64 / t
        );
    }
}
