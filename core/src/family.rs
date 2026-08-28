//! Shared pipeline for the opt-in coinage generator families (Phase 141):
//! the name-filter chain, result construction, and the bounded z-normalized
//! rank + MMR selection. Both `seamblend` and `morphemes` enumerate candidates
//! their own way, then hand a materialized `(lowercase_name, meaning_bonus)`
//! pool here. Keeping enumeration separate from filtering/ranking is what makes
//! these families safe to extend without perturbing any RNG stream.

use crate::exclude::ExcludeSet;
use crate::phonology::{pronounce, syllabify};
use crate::style::{Config, Style};
use crate::{
    capitalize, connotation, mimics_real_brand_indexed, passes_constraints, rank_jitter, score,
    BigtechStatic, NameResult, BAD_SUBSTRINGS,
};
use std::collections::HashMap;
use std::collections::HashSet;

/// Brand-shape ceiling, same value as `BigTechTuning::syllable_cap`.
pub(crate) const SYLLABLE_CAP: usize = 3;

/// HANDOFF Phase 140 lesson (HireHub): transparent {real word}+{generic tail}
/// pairs are near-certainly taken by an in-domain product; no coinage family
/// may emit that class.
const GENERIC_PAIR_TAILS: &[&str] = &["hub", "map", "set", "arc", "lab", "beam", "seed"];

/// The generic name-filter chain every coinage family shares. Family-specific
/// checks (e.g. seam-blend's consonant-skeleton guard) run in the caller.
/// `lower` must be lowercase ASCII.
pub(crate) fn passes_name_filters(
    lower: &str,
    cfg: &Config,
    dict: &HashSet<String>,
    st: &BigtechStatic,
    exclude: &ExcludeSet,
) -> bool {
    if lower.len() < cfg.min_len || lower.len() > cfg.max_len {
        return false;
    }
    let Some(ph) = pronounce(lower) else {
        return false;
    };
    let syllables = syllabify(&ph).len();
    if syllables == 0 || syllables > SYLLABLE_CAP {
        return false;
    }
    if BAD_SUBSTRINGS.iter().any(|b| lower.contains(b)) {
        return false;
    }
    if st.corpus_set.contains(lower) || dict.contains(lower) || st.common_words.contains(lower) {
        return false;
    }
    if mimics_real_brand_indexed(lower, &st.corpus_by_len) {
        return false;
    }
    if GENERIC_PAIR_TAILS.iter().any(|tail| {
        lower
            .strip_suffix(tail)
            .is_some_and(|stem| stem.len() >= 3 && st.common_words.contains(stem))
    }) {
        return false;
    }
    if !passes_constraints(lower, cfg) {
        return false;
    }
    // Exact-only exclusion: the reachable space is brief-constrained, and the
    // fuzzy/stem layers are documented to starve constrained modes.
    if exclude.rejects(lower, false, false) {
        return false;
    }
    true
}

pub(crate) fn to_result(lower: &str) -> NameResult {
    let name = capitalize(lower);
    NameResult {
        syllables: crate::phonotactics::syllable_count(lower),
        score_pronounce: score::score_pronounceability(lower),
        score_novelty: score::score_novelty(lower, crate::DICT.get_or_init(crate::build_dictionary)),
        score_memorability: score::score_memorability(lower),
        connotations: connotation::connotations(&name),
        name,
        style: Style::BigTech,
    }
}

/// Bounded, z-normalized rank over a candidate pool, then MMR selection.
/// `pool` is `(lowercase_name, meaning_bonus)`; the bonus lets a family reward
/// its own signal (seam overlap, morpheme meaning match). No unnormalized lead
/// term — the scale mismatch in the legacy ranker is a defect, not a pattern.
/// `stream` gives the family a ChaCha stream disjoint from production Auto.
pub(crate) fn rank_select(
    pool: &[(String, f64)],
    cfg: &Config,
    seed: u64,
    stream: u64,
) -> Vec<NameResult> {
    use rand::SeedableRng;
    if pool.is_empty() {
        return Vec::new();
    }
    let mut rng = rand_chacha::ChaCha8Rng::seed_from_u64(seed);
    rng.set_stream(stream);
    let salt = rand::Rng::gen::<u64>(&mut rng);
    let st = BigtechStatic::get();

    let lls: Vec<f64> = pool.iter().map(|(n, _)| st.model.log_likelihood(n)).collect();
    let mean = lls.iter().sum::<f64>() / lls.len() as f64;
    let var = lls.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / lls.len() as f64;
    let std = var.sqrt().max(f64::EPSILON);
    let jitter_w = 0.15 + 0.35 * cfg.variety.clamp(0.0, 1.0);

    let mut decorated: Vec<(f64, NameResult)> = pool
        .iter()
        .zip(lls.iter())
        .map(|((lower, bonus), ll)| {
            let z = ((ll - mean) / std).clamp(-2.0, 2.0) / 2.0;
            let syllables = syllabify(&pronounce(lower).unwrap_or_default()).len();
            let syl_score = match syllables {
                2 => 0.6,
                3 => 0.3,
                1 => 0.2,
                _ => 0.0,
            };
            let len_score = match lower.len() {
                5..=8 => 0.3,
                4 | 9 => 0.15,
                _ => 0.0,
            };
            let rank = z + bonus + syl_score + len_score + rank_jitter(lower, salt) * jitter_w;
            (rank, to_result(lower))
        })
        .collect();
    decorated.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    let rank_min = decorated.last().map(|(r, _)| *r).unwrap_or(0.0);
    let rank_span = (decorated.first().map(|(r, _)| *r).unwrap_or(0.0) - rank_min).max(f64::EPSILON);
    let relevance: HashMap<String, f64> = decorated
        .iter()
        .take(cfg.count * 2)
        .map(|(r, res)| (res.name.clone(), ((*r - rank_min) / rank_span).clamp(0.0, 1.0)))
        .collect();
    let results: Vec<NameResult> = decorated
        .into_iter()
        .take(cfg.count * 2)
        .map(|(_, r)| r)
        .collect();
    let cap = ((cfg.count as f64 * 0.2).ceil() as usize).max(1);
    crate::metrics::mmr_select_capped_by(&results, cfg.count, 0.7, cap, |r| {
        relevance.get(&r.name).copied().unwrap_or(0.0)
    })
}
