// One-shot 100k generation sweep: pre-33 vs Phase 34 (window 2000) vs
// Phase 35 (full-session exact exclusion). Also reports quality drift —
// first-1000 vs last-1000 batch score averages — to confirm that digging
// deeper into the candidate tail late in a session doesn't degrade output.
// Run: cargo run -p neologism-core --example gen100k --release
use std::collections::{HashMap, HashSet, VecDeque};
use neologism_core::style::{Config, Style};
use neologism_core::{generate_with_tuning, BigTechTuning};
use neologism_core::exclude::{within_edit1, stem_of};
use neologism_core::blend::tech_suffix_of;

const BATCHES: usize = 10_000;
const COUNT: usize = 10;
const DRIFT_SPAN: usize = 1_000; // batches measured at each end for drift

fn run(tuning: &BigTechTuning, window: Option<usize>, label: &str) {
    run_n(tuning, window, label, BATCHES, DRIFT_SPAN)
}

fn run_n(tuning: &BigTechTuning, window: Option<usize>, label: &str, batches: usize, drift_span: usize) {
    let mut appears_in: HashMap<String, usize> = HashMap::new();
    let mut recent: VecDeque<String> = VecDeque::new();

    let mut session_by_len: HashMap<usize, Vec<String>> = HashMap::new();
    let mut session_stems: HashSet<String> = HashSet::new();
    let mut session_total = 0usize;
    let mut near_dup_count = 0usize;

    let mut batch_max_suffix: Vec<usize> = Vec::with_capacity(batches);
    let mut short_batches = 0usize;

    // (pron, nov, mem, names) sums over all batches and over each drift span.
    let mut sums = [0u64; 4];
    let mut early = [0u64; 4];
    let mut late = [0u64; 4];

    for b in 0..batches {
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
        let results = generate_with_tuning(&cfg, tuning);
        for r in &results {
            let row = [r.score_pronounce as u64, r.score_novelty as u64, r.score_memorability as u64, 1];
            for i in 0..4 { sums[i] += row[i]; }
            if b < drift_span { for i in 0..4 { early[i] += row[i]; } }
            if b >= batches - drift_span { for i in 0..4 { late[i] += row[i]; } }
        }
        let names: Vec<String> = results.into_iter().map(|r| r.name).collect();

        if names.len() < COUNT { short_batches += 1; }

        let name_set: HashSet<String> = names.iter().cloned().collect();
        for n in &name_set {
            *appears_in.entry(n.clone()).or_insert(0) += 1;
            recent.push_back(n.clone());
            if let Some(w) = window {
                while recent.len() > w { recent.pop_front(); }
            }
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
    let avg_suf = batch_max_suffix.iter().sum::<usize>() as f64 / batches as f64;
    let peak_suf = batch_max_suffix.iter().copied().max().unwrap_or(0);
    let avg3 = |s: &[u64; 4]| {
        let n = s[3].max(1) as f64;
        (s[0] as f64 / n, s[1] as f64 / n, s[2] as f64 / n)
    };
    let (p, nv, m) = avg3(&sums);
    let (ep, env, em) = avg3(&early);
    let (lp, lnv, lm) = avg3(&late);

    println!("=== {} ===", label);
    println!("  total generated     : {}", session_total);
    println!("  distinct names      : {} ({:.1}% of total)", distinct, distinct as f64 / session_total as f64 * 100.0);
    println!("  worst recurrence    : {}/{batches}  ({:.2}%)", worst, worst as f64 / batches as f64 * 100.0);
    println!("  seen in only 1 batch: {once}/{distinct}  ({:.0}%)", once as f64 / distinct as f64 * 100.0);
    println!("  near-dup rate       : {near_dup_count}/{session_total}  ({:.1}%)", near_dup_count as f64 / session_total as f64 * 100.0);
    println!("  suffix conc.        : avg max {avg_suf:.2} / peak {peak_suf} per batch");
    println!("  short batches       : {short_batches}/{batches}");
    println!("  quality avg         : pron {p:.1}  nov {nv:.1}  mem {m:.1}");
    println!("  drift first/last {drift_span} : pron {ep:.1}→{lp:.1}  nov {env:.1}→{lnv:.1}  mem {em:.1}→{lm:.1}");
    print!("  top recurring       : ");
    for (name, c) in ranked.iter().take(8) { print!("{}({}) ", name, c); }
    println!("\n");
}

fn main() {
    println!("100k big-tech sweep — {BATCHES} batches × {COUNT} (variety 0.3)\n");
    let pre33 = BigTechTuning { fuzzy_exclude: false, stem_exclude: false, max_share: 1.0, ..BigTechTuning::from_variety(0.3) };
    run(&pre33, Some(2000), "pre-33 (window 2000)");
    run(&BigTechTuning::from_variety(0.3), Some(2000), "Phase 34 (window 2000)");
    run(&BigTechTuning::from_variety(0.3), None, "Phase 35 (full-session exclude)");
    // The shipped web config: RECENT_WINDOW=20000. 2,500 batches = 25k names,
    // so the window fills at batch 2,000 then slides — this row shows the
    // steady-state quality a heavy real-world session actually sees.
    run_n(&BigTechTuning::from_variety(0.3), Some(20000), "Phase 35 web config (window 20000, 2500 batches)", 2_500, 500);
}
