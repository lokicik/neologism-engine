//! Aggregate quality metrics over a batch of generated names.
//!
//! Attribution: the **diversity** metric is Intra-List Average Distance (ILAD),
//! Ziegler et al. (2005), building on Smyth & McClave (2001) — average pairwise
//! dissimilarity of items in a list. The **composite score** (a weighted blend)
//! and any downstream recommendation rules are pragmatic design choices, not
//! drawn from a paper.

use serde::{Deserialize, Serialize};
use crate::NameResult;
use crate::score::levenshtein;

/// Single "overall" score (0–100): a weighted blend of the three per-name scores.
/// Weights are a pragmatic choice (favor easy-to-say + memorable, then original).
pub fn composite_score(r: &NameResult) -> u32 {
    let c = 0.40 * r.score_pronounce as f64
        + 0.30 * r.score_memorability as f64
        + 0.30 * r.score_novelty as f64;
    c.round().clamp(0.0, 100.0) as u32
}

/// Intra-List Average Distance (ILAD): mean normalized edit distance over all
/// unique name pairs. 0 = identical, 1 = maximally different. Higher = more diverse.
pub fn diversity(results: &[NameResult]) -> f64 {
    let n = results.len();
    if n < 2 {
        return 0.0;
    }
    let mut total = 0.0f64;
    let mut pairs = 0usize;
    for i in 0..n {
        for j in (i + 1)..n {
            let a = results[i].name.to_lowercase();
            let b = results[j].name.to_lowercase();
            let max = a.chars().count().max(b.chars().count()).max(1) as f64;
            total += levenshtein(&a, &b) as f64 / max;
            pairs += 1;
        }
    }
    total / pairs as f64
}

/// Greedy Maximal Marginal Relevance selection (Carbonell & Goldstein 1998):
/// pick `count` names balancing quality (composite score) against dissimilarity
/// to those already chosen, reducing near-duplicate clustering. `lambda` (0..1)
/// weights quality vs. diversity (0.7 = mostly quality, some spread).
pub fn mmr_select(items: &[NameResult], count: usize, lambda: f64) -> Vec<NameResult> {
    if items.len() <= count {
        return items.to_vec();
    }
    let rel = |r: &NameResult| composite_score(r) as f64 / 100.0;
    let sim = |a: &str, b: &str| -> f64 {
        let max = a.chars().count().max(b.chars().count()).max(1) as f64;
        1.0 - levenshtein(&a.to_lowercase(), &b.to_lowercase()) as f64 / max
    };

    let mut remaining: Vec<usize> = (0..items.len()).collect();
    let mut selected: Vec<usize> = Vec::with_capacity(count);

    // Seed with the highest-relevance item.
    let first = *remaining
        .iter()
        .max_by(|&&i, &&j| rel(&items[i]).partial_cmp(&rel(&items[j])).unwrap_or(std::cmp::Ordering::Equal))
        .unwrap();
    selected.push(first);
    remaining.retain(|&i| i != first);

    while selected.len() < count && !remaining.is_empty() {
        let next = *remaining
            .iter()
            .max_by(|&&i, &&j| {
                let mi = mmr_value(&items[i], &selected, items, lambda, &rel, &sim);
                let mj = mmr_value(&items[j], &selected, items, lambda, &rel, &sim);
                mi.partial_cmp(&mj).unwrap_or(std::cmp::Ordering::Equal)
            })
            .unwrap();
        selected.push(next);
        remaining.retain(|&i| i != next);
    }
    selected.into_iter().map(|i| items[i].clone()).collect()
}

fn mmr_value(
    cand: &NameResult,
    selected: &[usize],
    items: &[NameResult],
    lambda: f64,
    rel: &impl Fn(&NameResult) -> f64,
    sim: &impl Fn(&str, &str) -> f64,
) -> f64 {
    let max_sim = selected
        .iter()
        .map(|&s| sim(&cand.name, &items[s].name))
        .fold(0.0f64, f64::max);
    lambda * rel(cand) - (1.0 - lambda) * max_sim
}

/// Aggregate statistics for one batch of names.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchStats {
    pub count: usize,
    pub unique_pct: f64,
    pub avg_pronounce: f64,
    pub avg_novelty: f64,
    pub avg_memorability: f64,
    pub avg_length: f64,
    pub avg_syllables: f64,
    pub diversity: f64,
    /// Index of the highest composite-scoring name (0 if empty).
    pub best_index: usize,
}

pub fn batch_stats(results: &[NameResult]) -> BatchStats {
    let count = results.len();
    if count == 0 {
        return BatchStats {
            count: 0,
            unique_pct: 0.0,
            avg_pronounce: 0.0,
            avg_novelty: 0.0,
            avg_memorability: 0.0,
            avg_length: 0.0,
            avg_syllables: 0.0,
            diversity: 0.0,
            best_index: 0,
        };
    }
    let n = count as f64;
    let sum_p: u32 = results.iter().map(|r| r.score_pronounce).sum();
    let sum_n: u32 = results.iter().map(|r| r.score_novelty).sum();
    let sum_m: u32 = results.iter().map(|r| r.score_memorability).sum();
    let sum_len: usize = results.iter().map(|r| r.name.chars().count()).sum();
    let sum_syl: usize = results.iter().map(|r| r.syllables).sum();

    let unique: std::collections::HashSet<&str> =
        results.iter().map(|r| r.name.as_str()).collect();

    let best_index = results
        .iter()
        .enumerate()
        .max_by_key(|(_, r)| composite_score(r))
        .map(|(i, _)| i)
        .unwrap_or(0);

    BatchStats {
        count,
        unique_pct: unique.len() as f64 / n * 100.0,
        avg_pronounce: sum_p as f64 / n,
        avg_novelty: sum_n as f64 / n,
        avg_memorability: sum_m as f64 / n,
        avg_length: sum_len as f64 / n,
        avg_syllables: sum_syl as f64 / n,
        diversity: diversity(results),
        best_index,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::style::Style;

    fn r(name: &str, p: u32, nov: u32, m: u32) -> NameResult {
        NameResult {
            name: name.to_string(),
            style: Style::BigTech,
            syllables: 2,
            score_pronounce: p,
            score_novelty: nov,
            score_memorability: m,
            connotations: vec![],
        }
    }

    #[test]
    fn composite_in_range() {
        let x = r("Zephyr", 80, 90, 70);
        assert!(composite_score(&x) <= 100);
    }

    #[test]
    fn diversity_bounds() {
        let same = vec![r("alpha", 1, 1, 1), r("alpha", 1, 1, 1)];
        assert!(diversity(&same) < 0.01);
        let diff = vec![r("alpha", 1, 1, 1), r("zzzzz", 1, 1, 1)];
        assert!(diversity(&diff) > 0.9);
    }

    #[test]
    fn mmr_increases_diversity() {
        // A pool with three near-duplicates and two distinct names.
        let pool = vec![
            r("vrax", 90, 90, 90),
            r("vrix", 90, 90, 90),
            r("vrex", 90, 90, 90),
            r("z017lon", 88, 90, 88),
            r("quorthak", 88, 90, 88),
        ];
        let picked = mmr_select(&pool, 3, 0.7);
        assert_eq!(picked.len(), 3);
        let plain: Vec<NameResult> = pool.iter().take(3).cloned().collect();
        assert!(diversity(&picked) > diversity(&plain), "mmr {} vs plain {}", diversity(&picked), diversity(&plain));
    }

    #[test]
    fn batch_stats_basic() {
        let batch = vec![r("alpha", 60, 80, 40), r("beta", 80, 60, 60)];
        let s = batch_stats(&batch);
        assert_eq!(s.count, 2);
        assert_eq!(s.unique_pct, 100.0);
        assert!((s.avg_pronounce - 70.0).abs() < 1e-9);
        assert!(s.diversity > 0.0 && s.diversity <= 1.0);
    }
}
