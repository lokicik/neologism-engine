// Phase 24 measurement: how often do big-tech names repeat across separate
// (random-seed) Generate clicks? Run: cargo run -p neologism-core --example repeats
//
// Generates N random-seed batches of `count` names, tallies how many batches each
// distinct name appears in, and reports the worst offenders + the size of the
// distinct-name space (which bounds how low the repeat-rate can go).
use std::collections::{HashMap, HashSet, VecDeque};
use neologism_core::style::{Config, Style};
use neologism_core::generate;

const BATCHES: usize = 300;
const COUNT: usize = 10;

/// Simulate a session of `BATCHES` Generate clicks. `window` = the exclude-recent
/// size the UI passes (None = no exclusion, i.e. old behavior).
fn run(window: Option<usize>) {
    let mut appears_in: HashMap<String, usize> = HashMap::new();
    let mut recent: VecDeque<String> = VecDeque::new();

    for b in 0..BATCHES {
        let exclude: Vec<String> = recent.iter().cloned().collect();
        let cfg = Config {
            style: Style::BigTech,
            count: COUNT,
            min_len: 4,
            max_len: 12,
            temperature: 0.85,
            variety: 0.3,
            seed: Some(0x9E37_79B9_7F4A_7C15u64.wrapping_mul(b as u64 + 1)),
            roots: vec![],
            variant: None,
            description: None,
            compound: false,
            starts_with: None,
            contains: None,
            exclude,
        };
        let names: HashSet<String> = generate(&cfg).into_iter().map(|r| r.name).collect();
        for n in &names {
            *appears_in.entry(n.clone()).or_insert(0) += 1;
            if let Some(w) = window {
                recent.push_back(n.clone());
                while recent.len() > w {
                    recent.pop_front();
                }
            }
        }
    }

    let distinct = appears_in.len();
    let mut ranked: Vec<(&String, &usize)> = appears_in.iter().collect();
    ranked.sort_by(|a, b| b.1.cmp(a.1));
    let worst = ranked.first().map(|(_, c)| **c).unwrap_or(0);
    let once: usize = appears_in.values().filter(|&&c| c == 1).count();

    let label = match window {
        None => "no exclude (raw)".to_string(),
        Some(w) => format!("exclude-recent window={w}"),
    };
    println!("--- {label} ---");
    println!("  distinct names      : {distinct}");
    println!("  worst recurrence    : {worst}/{BATCHES}  ({:.1}%)", worst as f64 / BATCHES as f64 * 100.0);
    println!("  seen in only 1 batch: {once}/{distinct}  ({:.0}%)", once as f64 / distinct as f64 * 100.0);
    print!("  top recurring       : ");
    for (name, c) in ranked.iter().take(6) {
        print!("{name}({c}) ");
    }
    println!("\n");
}

fn main() {
    println!("big-tech repeat analysis — {BATCHES} batches × {COUNT} names (variety 0.3)\n");
    run(None);
    run(Some(250));
}
