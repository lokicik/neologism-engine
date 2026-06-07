// Phase 21 tuning harness: coordinate-descent over the big-tech knobs, scoring a
// composite objective averaged over several seeds. Run:
//   cargo run -p neologism-core --example tune
//
// Prints each trial and the best config found. Use it to (re)pick the values in
// `BigTechTuning::default()`. The objective weights novelty/pronounceability/
// diversity/shape — proxies for "brandable" — and discards configs that starve
// the pool (uniq < 99.5%) or collapse novelty/diversity vs. the baseline.
use neologism_core::style::{Config, Style};
use neologism_core::metrics::batch_stats;
use neologism_core::{generate_with_tuning, BigTechTuning, NameResult};

const SEEDS: std::ops::RangeInclusive<u64> = 1..=8;

fn cfg_for(seed: u64) -> Config {
    Config {
        style: Style::BigTech,
        count: 50,
        min_len: 4,
        max_len: 12,
        temperature: 0.85,
        variety: 0.5,
        seed: Some(seed),
        roots: vec![],
        variant: None,
        description: None,
        compound: false,
        starts_with: None,
        contains: None,
        exclude: vec![],
    }
}

/// Fraction (%) of names in the brand sweet spot: 1–3 syllables and 5–9 chars.
fn shape_pct(results: &[NameResult]) -> f64 {
    if results.is_empty() {
        return 0.0;
    }
    let good = results
        .iter()
        .filter(|r| (1..=3).contains(&r.syllables) && (5..=9).contains(&r.name.chars().count()))
        .count();
    good as f64 / results.len() as f64 * 100.0
}

#[derive(Clone, Copy)]
struct Eval {
    composite: f64,
    pron: f64,
    nov: f64,
    div: f64,
    shape: f64,
    uniq: f64,
}

fn eval(tuning: &BigTechTuning) -> Eval {
    let (mut pron, mut nov, mut mem, mut div, mut uniq, mut shape) = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    let seeds: Vec<u64> = SEEDS.collect();
    for &s in &seeds {
        let res = generate_with_tuning(&cfg_for(s), tuning);
        let st = batch_stats(&res);
        pron += st.avg_pronounce;
        nov += st.avg_novelty;
        mem += st.avg_memorability;
        div += st.diversity;
        uniq += st.unique_pct;
        shape += shape_pct(&res);
    }
    let n = seeds.len() as f64;
    let (pron, nov, mem, div, uniq, shape) =
        (pron / n, nov / n, mem / n, div / n, uniq / n, shape / n);
    let composite = 0.30 * nov + 0.20 * pron + 0.25 * (div * 100.0) + 0.15 * shape + 0.10 * mem;
    Eval { composite, pron, nov, div, shape, uniq }
}

fn main() {
    let baseline = eval(&BigTechTuning::default());
    println!(
        "baseline  composite {:.2}  (pron {:.1} nov {:.1} div {:.2} shape {:.1} uniq {:.1})\n",
        baseline.composite, baseline.pron, baseline.nov, baseline.div, baseline.shape, baseline.uniq
    );

    let mut best = BigTechTuning::default();
    let mut best_e = baseline;

    // Accept a trial only if it beats the running best AND doesn't starve the
    // pool or materially collapse novelty/diversity vs. the original baseline.
    let consider = |label: String, t: BigTechTuning, best: &mut BigTechTuning, best_e: &mut Eval| {
        let e = eval(&t);
        let ok = e.uniq >= 99.5 && e.nov >= baseline.nov - 4.0 && e.div >= baseline.div - 0.04;
        let flag = if e.composite > best_e.composite && ok { "*" } else { " " };
        println!(
            "{} {:<16} composite {:.2}  (pron {:.1} nov {:.1} div {:.2} shape {:.1} uniq {:.1})",
            flag, label, e.composite, e.pron, e.nov, e.div, e.shape, e.uniq
        );
        if e.composite > best_e.composite && ok {
            *best = t;
            *best_e = e;
        }
    };

    for pass in 1..=2 {
        println!("--- pass {pass} ---");
        for v in [0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70] {
            let mut t = best.clone();
            t.markov_w = v;
            consider(format!("markov_w={v:.2}"), t, &mut best, &mut best_e);
        }
        for v in [0.15, 0.20, 0.25, 0.30, 0.35, 0.40] {
            let mut t = best.clone();
            t.blend_w = v;
            consider(format!("blend_w={v:.2}"), t, &mut best, &mut best_e);
        }
        for v in [1.5, 1.75, 2.0, 2.25, 2.5] {
            let mut t = best.clone();
            t.gate_sigma = v;
            consider(format!("gate_sigma={v:.2}"), t, &mut best, &mut best_e);
        }
        for v in [0.5, 1.0, 1.5, 2.0, 2.5] {
            let mut t = best.clone();
            t.fluency_w = v;
            consider(format!("fluency_w={v:.2}"), t, &mut best, &mut best_e);
        }
        for v in [0.5, 1.0, 1.5, 2.0, 2.5] {
            let mut t = best.clone();
            t.brevity_w = v;
            consider(format!("brevity_w={v:.2}"), t, &mut best, &mut best_e);
        }
        for v in [0.60, 0.65, 0.70, 0.75, 0.80] {
            let mut t = best.clone();
            t.mmr_lambda = v;
            consider(format!("mmr_lambda={v:.2}"), t, &mut best, &mut best_e);
        }
        for v in [2usize, 3] {
            let mut t = best.clone();
            t.syllable_cap = v;
            consider(format!("syllable_cap={v}"), t, &mut best, &mut best_e);
        }
    }

    println!(
        "\nBEST composite {:.2} (baseline {:.2}, +{:.2})",
        best_e.composite, baseline.composite, best_e.composite - baseline.composite
    );
    println!("{best:#?}");
}
