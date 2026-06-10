// Multi-batch big-tech quality averages (Phase 34): the seeded `metrics`
// example is a single 50-name batch, too noisy to judge a data/corpus change.
// Run: cargo run -p neologism-core --example qual --release
use neologism_core::generate;
use neologism_core::style::{Config, Style};

const BATCHES: usize = 300;
const COUNT: usize = 10;

fn main() {
    let (mut p, mut n, mut m, mut len, mut syl, mut total) = (0u64, 0u64, 0u64, 0usize, 0usize, 0usize);
    for b in 0..BATCHES {
        let cfg = Config {
            style: Style::BigTech,
            count: COUNT,
            min_len: 4,
            max_len: 12,
            temperature: 0.85,
            variety: 0.3,
            seed: Some(0xA076_1D64_78BD_642Fu64.wrapping_mul(b as u64 + 1)),
            roots: vec![],
            variant: None,
            description: None,
            compound: false,
            starts_with: None,
            contains: None,
            exclude: vec![],
        };
        for r in generate(&cfg) {
            p += r.score_pronounce as u64;
            n += r.score_novelty as u64;
            m += r.score_memorability as u64;
            len += r.name.chars().count();
            syl += r.syllables;
            total += 1;
        }
    }
    let t = total as f64;
    println!("big-tech quality over {BATCHES} batches × {COUNT} (variety 0.3, no exclude)");
    println!("  names: {total}");
    println!("  pron  {:.2}", p as f64 / t);
    println!("  nov   {:.2}", n as f64 / t);
    println!("  mem   {:.2}", m as f64 / t);
    println!("  len   {:.2}", len as f64 / t);
    println!("  syl   {:.2}", syl as f64 / t);
}
