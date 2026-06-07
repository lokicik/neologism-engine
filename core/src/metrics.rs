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
    fn batch_stats_basic() {
        let batch = vec![r("alpha", 60, 80, 40), r("beta", 80, 60, 60)];
        let s = batch_stats(&batch);
        assert_eq!(s.count, 2);
        assert_eq!(s.unique_pct, 100.0);
        assert!((s.avg_pronounce - 70.0).abs() < 1e-9);
        assert!(s.diversity > 0.0 && s.diversity <= 1.0);
    }
}
