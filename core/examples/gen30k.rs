// One-shot 30k generation sweep: pre-33 vs Phase 33 full defaults.
// Run: cargo run -p neologism-core --example gen30k --release
use std::collections::{HashMap, HashSet, VecDeque};
use neologism_core::style::{Config, Style};
use neologism_core::{generate_with_tuning, BigTechTuning};
use neologism_core::exclude::{within_edit1, stem_of};
use neologism_core::blend::tech_suffix_of;

const BATCHES: usize = 3000;
const COUNT: usize = 10;
const WINDOW: usize = 2000;

fn run(tuning: &BigTechTuning, label: &str) {
    let mut appears_in: HashMap<String, usize> = HashMap::new();
    let mut recent: VecDeque<String> = VecDeque::new();

    let mut session_by_len: HashMap<usize, Vec<String>> = HashMap::new();
    let mut session_stems: HashSet<String> = HashSet::new();
    let mut session_total = 0usize;
    let mut near_dup_count = 0usize;

    let mut batch_max_suffix: Vec<usize> = Vec::with_capacity(BATCHES);
    let mut short_batches = 0usize;

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
        let names: Vec<String> = generate_with_tuning(&cfg, tuning)
            .into_iter()
            .map(|r| r.name)
            .collect();

        if names.len() < COUNT { short_batches += 1; }

        let name_set: HashSet<String> = names.iter().cloned().collect();
        for n in &name_set {
            *appears_in.entry(n.clone()).or_insert(0) += 1;
            recent.push_back(n.clone());
            while recent.len() > WINDOW { recent.pop_front(); }
        }

        let mut suf_map: HashMap<&str, usize> = HashMap::new();
        for n in &names {
            let lower = n.to_lowercase();
            if let Some(s) = tech_suffix_of(&lower) { *suf_map.entry(s).or_insert(0) += 1; }
        }
        batch_max_suffix.push(suf_map.values().copied().max().unwrap_or(0));

        for n in &names {
            let lower = n.to_lowercase();
            let stem = stem_of(&lower).to_string();
            let len = lower.chars().count();
            session_total += 1;
            let mut is_nd = session_stems.contains(&stem);
            if !is_nd {
                'outer: for bucket in [len.saturating_sub(1), len, len + 1] {
                    if let Some(entries) = session_by_len.get(&bucket) {
                        for prev in entries {
                            if within_edit1(&lower, prev) { is_nd = true; break 'outer; }
                        }
                    }
                }
            }
            if is_nd { near_dup_count += 1; }
            session_by_len.entry(len).or_default().push(lower);
            session_stems.insert(stem);
        }
    }

    let distinct = appears_in.len();
    let mut ranked: Vec<(&String, &usize)> = appears_in.iter().collect();
    ranked.sort_by(|a, b| b.1.cmp(a.1));
    let worst = ranked.first().map(|(_, c)| **c).unwrap_or(0);
    let once: usize = appears_in.values().filter(|&&c| c == 1).count();
    let avg_suf = batch_max_suffix.iter().sum::<usize>() as f64 / BATCHES as f64;
    let peak_suf = batch_max_suffix.iter().copied().max().unwrap_or(0);

    println!("=== {} ===", label);
    println!("  total generated     : {}", session_total);
    println!("  distinct names      : {} ({:.1}% of total)", distinct, distinct as f64 / session_total as f64 * 100.0);
    println!("  worst recurrence    : {}/{BATCHES}  ({:.1}%)", worst, worst as f64 / BATCHES as f64 * 100.0);
    println!("  seen in only 1 batch: {once}/{distinct}  ({:.0}%)", once as f64 / distinct as f64 * 100.0);
    println!("  near-dup rate       : {near_dup_count}/{session_total}  ({:.1}%)", near_dup_count as f64 / session_total as f64 * 100.0);
    println!("  suffix conc.        : avg max {avg_suf:.2} / peak {peak_suf} per batch");
    println!("  short batches       : {short_batches}/{BATCHES}");
    print!("  top recurring       : ");
    for (name, c) in ranked.iter().take(8) { print!("{}({}) ", name, c); }
    println!("\n");
}

fn main() {
    println!("30k big-tech sweep — {BATCHES} batches × {COUNT} (variety 0.3, window {WINDOW})\n");
    let pre33 = BigTechTuning { fuzzy_exclude: false, stem_exclude: false, max_share: 1.0, ..BigTechTuning::from_variety(0.3) };
    run(&pre33, "pre-33");
    run(&BigTechTuning::from_variety(0.3), "Phase 33 full defaults");
}
