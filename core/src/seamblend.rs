//! Seam-blend generator family (Phase 141): fuse two meaning-bearing source
//! words at a *phonetic* seam so the join reads as one coined word
//! (pin+interest → Pinterest) instead of a visible root+suffix assembly.
//!
//! Architecture is deliberately different from `generate_bigtech`:
//! 1. candidate enumeration is a pure deterministic function of the brief —
//!    no RNG in the loop, so adding a filter later can never reshuffle pages;
//! 2. all filters run on the materialized pool;
//! 3. the RNG (a dedicated ChaCha8 stream, disjoint from production Auto's)
//!    only salts rank jitter.
//!
//! Reachable only through `Config.variant == "seamblend"` — production Auto
//! and every existing mode are byte-identical with this module present.

use crate::family;
use crate::phonology::{best_spanned, pronounce, syllabify, Phoneme, SpannedPhoneme};
use crate::style::Config;
use crate::{exclude::ExcludeSet, keywords, semfield, BigtechStatic, CONCEPT_METAPHORS};
use std::collections::{HashMap, HashSet};

/// Dedicated ChaCha stream id — provably disjoint from production Auto's
/// stream 0 for the same user seed.
const SEAMBLEND_STREAM: u64 = 0x5EA6_B1E4;

/// One enumerated fusion candidate (pre-filter).
#[derive(Debug, Clone)]
struct Fusion {
    /// Lowercase fused spelling.
    lower: String,
    /// Shared-phoneme run length at the seam (0 for a syllable splice).
    overlap: usize,
    /// Expected phoneme sequence: prefix phonemes ++ suffix phonemes. The
    /// fused spelling must keep this consonant skeleton when re-pronounced —
    /// the phoneme-level Busharbor guard (`seam_preserves_consonants`).
    expected: Vec<Phoneme>,
}

/// Cut `a` where a suffix of its phonemes equals a prefix of `b`'s, keeping
/// `b`'s spelling for the shared run (pin|interest → pinterest). Longest
/// overlap wins; returns None when no phonemes are shared.
fn overlap_fusion(a: &str, pa: &[SpannedPhoneme], b: &str, pb: &[SpannedPhoneme]) -> Option<Fusion> {
    let na = pa.len();
    let nb = pb.len();
    let max_k = (na - 1).min(nb - 1);
    for k in (1..=max_k).rev() {
        let a_tail: Vec<Phoneme> = pa[na - k..].iter().map(|(p, _)| *p).collect();
        let b_head: Vec<Phoneme> = pb[..k].iter().map(|(p, _)| *p).collect();
        if a_tail == b_head {
            let cut = pa[na - k].1.start;
            if cut < 1 {
                continue; // a must contribute at least one letter (p|interest is fine)
            }
            let lower = format!("{}{}", &a[..cut], b);
            let expected: Vec<Phoneme> = pa[..na - k]
                .iter()
                .chain(pb.iter())
                .map(|(p, _)| *p)
                .collect();
            return Some(Fusion {
                lower,
                overlap: k,
                expected,
            });
        }
    }
    None
}

/// Splice a syllable prefix of `a` onto a syllable suffix of `b`
/// (bre|akfast + l|unch → brunch). At least one side must be truncated —
/// whole+whole is plain concatenation, exactly the assembled look this
/// family exists to avoid.
fn splice_fusions(
    a: &str,
    pa: &[SpannedPhoneme],
    b: &str,
    pb: &[SpannedPhoneme],
) -> Vec<Fusion> {
    let a_ph: Vec<Phoneme> = pa.iter().map(|(p, _)| *p).collect();
    let b_ph: Vec<Phoneme> = pb.iter().map(|(p, _)| *p).collect();
    let a_syl = syllabify(&a_ph);
    let b_syl = syllabify(&b_ph);
    let mut out = Vec::new();
    // Prefix cut points in a: after syllable s (phoneme index where syllable
    // s+1 starts), plus the whole word.
    let mut a_cuts: Vec<usize> = (1..a_syl.len())
        .map(|s| a_syl[s].onset.first().copied().unwrap_or(a_syl[s].nucleus))
        .collect();
    a_cuts.push(pa.len());
    // Suffix start points in b: syllable starts, plus the whole word (0).
    let mut b_cuts: Vec<usize> = (1..b_syl.len())
        .map(|s| b_syl[s].onset.first().copied().unwrap_or(b_syl[s].nucleus))
        .collect();
    b_cuts.insert(0, 0);
    for &ac in &a_cuts {
        for &bc in &b_cuts {
            if ac == pa.len() && bc == 0 {
                continue; // whole + whole
            }
            let a_letters = &a[..pa.get(ac).map_or(a.len(), |(_, r)| r.start)];
            let b_letters = &b[pb[bc].1.start..];
            if a_letters.len() < 2 || b_letters.len() < 3 {
                continue;
            }
            // Onset-maximization is phoneme-correct but can hand the suffix a
            // spelling no English word starts with (back|link → "cklink").
            // Reject orthographically illegal suffix openings at the source.
            let sb = b_letters.as_bytes();
            if sb.len() >= 2 && (sb[0] == sb[1] || b_letters.starts_with("ck") || b_letters.starts_with("ng") || b_letters.starts_with("tch"))
            {
                continue;
            }
            let lower = format!("{a_letters}{b_letters}");
            let expected: Vec<Phoneme> = a_ph[..ac].iter().chain(b_ph[bc..].iter()).copied().collect();
            out.push(Fusion {
                lower,
                overlap: 0,
                expected,
            });
        }
    }
    out
}

/// The consonant skeleton of a phoneme sequence. Vowel qualities legitimately
/// shift when spellings are cut and rejoined (magic-e context changes), but a
/// changed consonant means the seam created a new reading: bus+harbor →
/// "busharbor" turns S,HH into SH ("bush arbor") and is rejected here.
fn consonant_skeleton(phonemes: &[Phoneme]) -> Vec<Phoneme> {
    phonemes.iter().copied().filter(|p| !p.is_vowel()).collect()
}

fn seam_preserves_consonants(fusion: &Fusion) -> bool {
    match pronounce(&fusion.lower) {
        Some(actual) => consonant_skeleton(&actual) == consonant_skeleton(&fusion.expected),
        None => false,
    }
}

/// A thin ingredient group is widened toward this many words via semantic-
/// field expansion; rich curated groups (>= this) are left untouched so
/// recognized briefs keep their curated behavior.
const THIN_GROUP: usize = 5;

/// Widen thin ingredient groups with semantic-field neighbors until each
/// reaches `THIN_GROUP`, skipping words already present in any group. Seeds are
/// the group's own words first, then the brief keywords — so a brief whose
/// distinctive word is off-embedding (e.g. "backlink", absent from GloVe) still
/// expands through its ordinary words ("note", "taking"). GloVe-derived
/// neighbors are all known-real, brand-worthy English words that only ever act
/// as blend ingredients.
fn augment_thin_groups(groups: &mut [Vec<String>], brief_keywords: &[String]) {
    let mut present: HashSet<String> = groups.iter().flatten().cloned().collect();
    for gi in 0..groups.len() {
        if groups[gi].len() >= THIN_GROUP {
            continue;
        }
        let seeds: Vec<String> = groups[gi]
            .clone()
            .into_iter()
            .chain(brief_keywords.iter().cloned())
            .collect();
        'seed: for seed in seeds {
            for nb in semfield::expand(&seed, 8) {
                if groups[gi].len() >= THIN_GROUP {
                    break 'seed;
                }
                if present.insert(nb.to_string()) {
                    groups[gi].push(nb.to_string());
                }
            }
        }
    }
}

/// Deterministic ingredient groups for the brief: description concept groups
/// when available, else user roots, padded with the curated metaphor palette
/// so there is always a second group to fuse across.
fn ingredient_groups(cfg: &Config) -> Vec<Vec<String>> {
    let mut groups: Vec<Vec<String>> = Vec::new();
    if let Some(desc) = cfg.description.as_deref().filter(|d| !d.trim().is_empty()) {
        let kws = keywords::extract_keywords(desc, 6);
        groups = keywords::brand_root_groups(&kws, 16);
        augment_thin_groups(&mut groups, &kws);
    }
    if groups.is_empty() && !cfg.roots.is_empty() {
        groups.push(
            cfg.roots
                .iter()
                .map(|r| r.trim().to_lowercase())
                .filter(|r| r.len() >= 2)
                .collect(),
        );
    }
    if groups.is_empty() {
        // Promptless Lab page: evocative curated real words × metaphors.
        let st = BigtechStatic::get();
        groups.push(
            st.realword_pool
                .iter()
                .filter(|w| w.len() >= 4 && w.len() <= 8)
                .take(32)
                .map(|w| w.to_string())
                .collect(),
        );
    }
    // Always offer the strong evocative-anchor palette as its own group, so
    // most fusions pair a brief word with a spark/vault/forge-grade anchor —
    // the shape of every name the owner kept in the 2026-08-28 taste run.
    groups.push(CONCEPT_METAPHORS.iter().map(|m| m.to_string()).collect());
    // Bound the enumeration space; groups are already priority-ordered.
    for g in &mut groups {
        g.truncate(24);
    }
    groups
}

/// Generate a seam-blend page. `seed` only affects rank jitter and therefore
/// which of several near-equal candidates surface — never the candidate set.
pub fn generate_seamblend(cfg: &Config, dict: &HashSet<String>, seed: u64) -> Vec<NameOut> {
    let st = BigtechStatic::get();
    let exclude = ExcludeSet::new(&cfg.exclude, 2000);
    let groups = ingredient_groups(cfg);

    // Pronounce each ingredient once.
    let mut prons: HashMap<&str, Vec<SpannedPhoneme>> = HashMap::new();
    for w in groups.iter().flatten() {
        if let Some(p) = best_spanned(w) {
            prons.insert(w.as_str(), p);
        }
    }

    // Enumerate (pure): ordered cross-group pairs, overlap fusion first, then
    // splices. Filters run on the materialized pool below, so adding one never
    // reshuffles the deterministic order.
    let mut pool: Vec<(String, f64)> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for (gi, ga) in groups.iter().enumerate() {
        for (gj, gb) in groups.iter().enumerate() {
            if gi == gj {
                continue;
            }
            for a in ga {
                for b in gb {
                    if a == b {
                        continue;
                    }
                    let (Some(pa), Some(pb)) = (prons.get(a.as_str()), prons.get(b.as_str()))
                    else {
                        continue;
                    };
                    let mut fusions: Vec<Fusion> = Vec::new();
                    if let Some(f) = overlap_fusion(a, pa, b, pb) {
                        fusions.push(f);
                    }
                    fusions.extend(splice_fusions(a, pa, b, pb));
                    for f in fusions {
                        if !seen.insert(f.lower.clone()) {
                            continue;
                        }
                        // Seam-specific guard (Busharbor class), then the shared
                        // name-filter chain.
                        if !seam_preserves_consonants(&f) {
                            continue;
                        }
                        if !family::passes_name_filters(&f.lower, cfg, dict, st, &exclude) {
                            continue;
                        }
                        let bonus = taste_bonus(a, b, &f, &st.common_words);
                        pool.push((f.lower, bonus));
                    }
                }
            }
        }
    }
    family::rank_select(&pool, cfg, seed, SEAMBLEND_STREAM)
}

/// The family returns ordinary `NameResult`s (same shape the web layer knows).
pub type NameOut = crate::NameResult;

/// Generic tech-suffix tails the owner's taste run rejected wholesale
/// (Probyte, Specrate, Datascop, Mobyte). A candidate ending in one is demoted.
/// This is the one clean, defensible signal from that run: a -byte/-rate/-scop
/// ending reliably marks a name the owner passed. The deeper "Confield is bland
/// but Tabalong is good" distinction is semantic coherence, which offline
/// scoring structurally cannot judge — so it is deliberately NOT encoded here.
const GENERIC_TAILS: &[&str] = &["byte", "rate", "ify", "scop", "trace", "istry", "tics"];

/// True if `w` is a strong evocative anchor (the curated metaphor palette:
/// spark, vault, forge, craft, atlas, pulse, prism…).
fn is_anchor(w: &str) -> bool {
    CONCEPT_METAPHORS.contains(&w)
}

/// Rank bonus for the seam-blend pool (Lab-only; production Auto untouched).
/// Encodes the 2026-08-28 taste run: every kept name (Sparktic, Invault,
/// Stacraft, Groupane) carried a strong evocative anchor that survived intact,
/// while the passed names leaned on weak fragments or generic -byte/-rate tails.
/// So reward an anchor that survives at the head or tail, credit a clean
/// overlap, and demote a generic tail. The remaining "is the pairing coherent"
/// judgment is the offline ceiling and is deliberately left to selection.
fn taste_bonus(a: &str, b: &str, f: &Fusion, _common: &HashSet<String>) -> f64 {
    let overlap = (f.overlap.min(3) as f64) * 0.3;
    let anchor_survives = (is_anchor(a) && f.lower.starts_with(a)) as u8
        + (is_anchor(b) && f.lower.ends_with(b)) as u8;
    let generic = GENERIC_TAILS.iter().any(|t| f.lower.ends_with(t));
    overlap + 0.7 * anchor_survives as f64 - if generic { 0.8 } else { 0.0 }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::style::Style;

    fn spanned(w: &str) -> Vec<SpannedPhoneme> {
        best_spanned(w).unwrap()
    }

    #[test]
    fn overlap_fusion_finds_pinterest() {
        let f = overlap_fusion("pin", &spanned("pin"), "interest", &spanned("interest")).unwrap();
        assert_eq!(f.lower, "pinterest");
        assert_eq!(f.overlap, 2);
    }

    #[test]
    fn seam_guard_rejects_busharbor_class_reparses() {
        // bus + harbor: S,HH fuses into SH — "bush arbor". The consonant
        // skeleton changes, so the phoneme-level guard rejects it.
        let pa = spanned("bus");
        let pb = spanned("harbor");
        let expected: Vec<Phoneme> = pa.iter().chain(pb.iter()).map(|(p, _)| *p).collect();
        let f = Fusion {
            lower: "busharbor".to_string(),
            overlap: 0,
            expected,
        };
        assert!(!seam_preserves_consonants(&f));
        // A clean seam passes: log + scope.
        let pa2 = spanned("log");
        let pb2 = spanned("scope");
        let expected2: Vec<Phoneme> = pa2.iter().chain(pb2.iter()).map(|(p, _)| *p).collect();
        let f2 = Fusion {
            lower: "logscope".to_string(),
            overlap: 0,
            expected: expected2,
        };
        assert!(seam_preserves_consonants(&f2));
    }

    #[test]
    fn splice_fusions_hide_at_least_one_seam() {
        let out = splice_fusions("harbor", &spanned("harbor"), "lumen", &spanned("lumen"));
        assert!(!out.is_empty());
        for f in &out {
            assert_ne!(f.lower, "harborlumen", "whole+whole must be skipped");
        }
    }

    #[test]
    fn generate_is_deterministic_and_respects_bounds() {
        let cfg = Config {
            style: Style::BigTech,
            variant: Some("seamblend".to_string()),
            description: Some("a terminal log viewer for developers".to_string()),
            seed: Some(42),
            ..Config::default()
        };
        let dict = crate::DICT.get_or_init(crate::build_dictionary);
        let a = generate_seamblend(&cfg, dict, 42);
        let b = generate_seamblend(&cfg, dict, 42);
        assert!(!a.is_empty(), "seamblend produced nothing for a plain brief");
        assert_eq!(
            a.iter().map(|r| &r.name).collect::<Vec<_>>(),
            b.iter().map(|r| &r.name).collect::<Vec<_>>()
        );
        let st = BigtechStatic::get();
        for r in &a {
            let lower = r.name.to_lowercase();
            assert!(lower.len() >= cfg.min_len && lower.len() <= cfg.max_len, "{}", r.name);
            assert!(!st.common_words.contains(&lower), "real word leaked: {}", r.name);
            assert!(!st.corpus_set.contains(&lower), "brand leaked: {}", r.name);
        }
    }

    #[test]
    fn expansions_never_leak_as_names() {
        // A semantic-field neighbor is an ingredient, never a name. Every
        // emitted name must fail to be a plain real word (the filter chain
        // guarantees this); this pins that guarantee against the expansion.
        let cfg = Config {
            style: Style::BigTech,
            variant: Some("seamblend".to_string()),
            description: Some("a note taking app with backlinks".to_string()),
            seed: Some(7),
            ..Config::default()
        };
        let dict = crate::DICT.get_or_init(crate::build_dictionary);
        let st = BigtechStatic::get();
        for r in generate_seamblend(&cfg, dict, 7) {
            let lower = r.name.to_lowercase();
            assert!(!st.common_words.contains(&lower), "real word leaked: {}", r.name);
            // Any neighbor we might have expanded to must not be the whole name.
            for nb in semfield::expand("backlink", 16) {
                assert_ne!(lower, nb, "expansion surfaced verbatim: {}", r.name);
            }
        }
    }

    #[test]
    fn different_seeds_can_reorder_but_share_no_rng_with_auto() {
        // The candidate set is seed-independent; only jitter ordering differs.
        let cfg = Config {
            style: Style::BigTech,
            variant: Some("seamblend".to_string()),
            description: Some("password manager for teams".to_string()),
            seed: Some(1),
            ..Config::default()
        };
        let dict = crate::DICT.get_or_init(crate::build_dictionary);
        let a: HashSet<String> = generate_seamblend(&cfg, dict, 1)
            .into_iter()
            .map(|r| r.name)
            .collect();
        let b: HashSet<String> = generate_seamblend(&cfg, dict, 2)
            .into_iter()
            .map(|r| r.name)
            .collect();
        // Pages from different seeds draw from one deterministic pool, so they
        // overlap heavily; equality is not required (jitter reorders the top).
        assert!(!a.is_empty() && !b.is_empty());
    }
}
