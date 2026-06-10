// Phase 24/30/33 measurement: repeat and near-duplicate analysis for big-tech
// generation across separate (random-seed) Generate clicks.
// Run: cargo run -p neologism-core --example repeats
//
// Simulates BATCHES sessions of `count` names; tracks exact repeats (Phase 24/30
// baseline) and adds Phase 33 near-duplicate metrics: names within edit-1 or
// sharing a stem with a previously seen name.
use std::collections::{HashMap, HashSet, VecDeque};
use neologism_core::style::{Config, Style};
use neologism_core::{generate_with_tuning, BigTechTuning};
use neologism_core::exclude::{within_edit1, stem_of};
use neologism_core::blend::tech_suffix_of;

const BATCHES: usize = 300;
const COUNT: usize = 10;
const WINDOW: usize = 2000;

/// Simulate a session of `BATCHES` Generate clicks with the given tuning.
fn run(tuning: &BigTechTuning, label: &str) {
    let mut appears_in: HashMap<String, usize> = HashMap::new();
    let mut recent: VecDeque<String> = VecDeque::new();

    // Session-level near-dup tracking.
    let mut session_by_len: HashMap<usize, Vec<String>> = HashMap::new();
    let mut session_stems: HashSet<String> = HashSet::new();
    let mut session_total = 0usize;
    let mut near_dup_count = 0usize;

    // Per-batch structural concentration.
    let mut batch_max_suffix: Vec<usize> = Vec::with_capacity(BATCHES);
    let mut batch_max_prefix: Vec<usize> = Vec::with_capacity(BATCHES);
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

        if names.len() < COUNT {
            short_batches += 1;
        }

        // Exact-repeat tracking.
        let name_set: HashSet<String> = names.iter().cloned().collect();
        for n in &name_set {
            *appears_in.entry(n.clone()).or_insert(0) += 1;
            recent.push_back(n.clone());
            while recent.len() > WINDOW {
                recent.pop_front();
            }
        }

        // Per-batch suffix / prefix concentration.
        let mut suf_map: HashMap<&str, usize> = HashMap::new();
        let mut pre_map: HashMap<String, usize> = HashMap::new();
        for n in &names {
            let lower = n.to_lowercase();
            if let Some(s) = tech_suffix_of(&lower) {
                *suf_map.entry(s).or_insert(0) += 1;
            }
            let pre: String = lower.chars().take(3).collect();
            *pre_map.entry(pre).or_insert(0) += 1;
        }
        batch_max_suffix.push(suf_map.values().copied().max().unwrap_or(0));
        batch_max_prefix.push(pre_map.values().copied().max().unwrap_or(0));

        // Session-level near-dup check (against all previously emitted names).
        for n in &names {
            let lower = n.to_lowercase();
            let stem = stem_of(&lower).to_string();
            session_total += 1;
            let len = lower.chars().count();
            let mut is_near_dup = false;
            // Stem match is O(1).
            if session_stems.contains(&stem) {
                is_near_dup = true;
            } else {
                // Edit-1 scan over length buckets.
                'outer: for bucket in [len.saturating_sub(1), len, len + 1] {
                    if let Some(entries) = session_by_len.get(&bucket) {
                        for prev in entries {
                            if within_edit1(&lower, prev) {
                                is_near_dup = true;
                                break 'outer;
                            }
                        }
                    }
                }
            }
            if is_near_dup {
                near_dup_count += 1;
            }
            // Register this name for future batches.
            session_by_len.entry(len).or_default().push(lower);
            session_stems.insert(stem);
        }
    }

    let distinct = appears_in.len();
    let mut ranked: Vec<(&String, &usize)> = appears_in.iter().collect();
    ranked.sort_by(|a, b| b.1.cmp(a.1));
    let worst = ranked.first().map(|(_, c)| **c).unwrap_or(0);
    let once: usize = appears_in.values().filter(|&&c| c == 1).count();

    let avg_max_suf = batch_max_suffix.iter().sum::<usize>() as f64 / BATCHES as f64;
    let peak_max_suf = batch_max_suffix.iter().copied().max().unwrap_or(0);
    let avg_max_pre = batch_max_prefix.iter().sum::<usize>() as f64 / BATCHES as f64;
    let peak_max_pre = batch_max_prefix.iter().copied().max().unwrap_or(0);

    println!("--- {label} ---");
    println!("  distinct names      : {distinct}");
    println!("  worst recurrence    : {worst}/{BATCHES}  ({:.1}%)", worst as f64 / BATCHES as f64 * 100.0);
    println!("  seen in only 1 batch: {once}/{distinct}  ({:.0}%)", once as f64 / distinct as f64 * 100.0);
    println!("  near-dup rate       : {near_dup_count}/{session_total}  ({:.1}%)", near_dup_count as f64 / session_total as f64 * 100.0);
    println!("  suffix concentration: avg max {avg_max_suf:.2} / peak {peak_max_suf} per batch");
    println!("  prefix concentration: avg max {avg_max_pre:.2} / peak {peak_max_pre} per batch");
    println!("  short batches       : {short_batches}/{BATCHES}");
    print!("  top recurring       : ");
    for (name, c) in ranked.iter().take(6) {
        print!("{name}({c}) ");
    }
    println!("\n");
}

fn main() {
    println!("big-tech repeat/near-dup analysis — {BATCHES} batches × {COUNT} names (variety 0.3, window {WINDOW})\n");

    // Pre-33 baseline: exact-exclude only, no suffix caps (reproduces old behavior).
    let pre33 = BigTechTuning {
        fuzzy_exclude: false,
        stem_exclude: false,
        max_share: 1.0,
        ..BigTechTuning::from_variety(0.3)
    };
    run(&pre33, "pre-33 (exact exclude, no caps)");

    // Fuzzy exclude only.
    let fuzzy_only = BigTechTuning {
        fuzzy_exclude: true,
        stem_exclude: true,
        max_share: 1.0,
        ..BigTechTuning::from_variety(0.3)
    };
    run(&fuzzy_only, "Phase 33 — fuzzy+stem exclude only");

    // Suffix/prefix caps only.
    let caps_only = BigTechTuning {
        fuzzy_exclude: false,
        stem_exclude: false,
        max_share: 0.2,
        ..BigTechTuning::from_variety(0.3)
    };
    run(&caps_only, "Phase 33 — suffix/prefix caps only");

    // Full Phase 33 defaults.
    run(&BigTechTuning::from_variety(0.3), "Phase 33 — full defaults");
}
