// Timing harness for repeated generation with different seeds (Phase 34).
// Simulates the production web-app pattern: each Generate click calls
// generate() with a fresh seed and the rolling 2000-name exclude window.
// Run: cargo run -p neologism-core --example bench --release
use std::collections::VecDeque;
use std::time::Instant;
use neologism_core::generate;
use neologism_core::style::{Config, Style};

const CALLS: usize = 200;
const COUNT: usize = 10;
const WINDOW: usize = 2000;

fn cfg(seed: u64, exclude: Vec<String>) -> Config {
    Config {
        style: Style::BigTech,
        count: COUNT,
        min_len: 4,
        max_len: 12,
        temperature: 0.85,
        variety: 0.3,
        seed: Some(seed),
        roots: vec![],
        variant: None,
        description: None,
        compound: false,
        starts_with: None,
        contains: None,
        exclude,
    }
}

fn main() {
    let mut recent: VecDeque<String> = VecDeque::new();
    let mut times_ms: Vec<f64> = Vec::with_capacity(CALLS);

    for i in 0..CALLS {
        let exclude: Vec<String> = recent.iter().cloned().collect();
        let c = cfg(0x9E37_79B9_7F4A_7C15u64.wrapping_mul(i as u64 + 1), exclude);
        let t = Instant::now();
        let results = generate(&c);
        times_ms.push(t.elapsed().as_secs_f64() * 1000.0);
        for r in results {
            recent.push_back(r.name);
            while recent.len() > WINDOW { recent.pop_front(); }
        }
    }

    let total: f64 = times_ms.iter().sum();
    let first = times_ms[0];
    let rest = &times_ms[1..];
    let rest_avg = rest.iter().sum::<f64>() / rest.len() as f64;
    let mut sorted = rest.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let p50 = sorted[sorted.len() / 2];
    let p95 = sorted[sorted.len() * 95 / 100];

    println!("big-tech bench — {CALLS} calls × {COUNT} names (variety 0.3, window {WINDOW})");
    println!("  total       : {total:.1} ms");
    println!("  first call  : {first:.2} ms");
    println!("  rest avg    : {rest_avg:.2} ms/call");
    println!("  rest p50    : {p50:.2} ms");
    println!("  rest p95    : {p95:.2} ms");
}
