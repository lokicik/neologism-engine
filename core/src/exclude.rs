//! Cross-batch near-duplicate detection (Phase 33).
//!
//! The UI's exclude-recent window (Phase 30) blocks *exact* repeats only, so
//! edit-1 variants like Keyston / Keystona / Keystonn, and shared-stem siblings
//! like Keystonify (same stem as Keyston after stripping "-ify"), still appear
//! across batches despite the 2 000-name window.
//!
//! `ExcludeSet` adds two layers on top of exact-match:
//!   1. **Stem exclusion**: strip recognized tech suffixes (blend::tech_suffix_of)
//!      to get a root stem, then reject candidates whose stem matches any
//!      excluded stem. Keystonify → stem "keyston"; if Keyston is excluded,
//!      its stem is also "keyston" → rejected.
//!   2. **Edit-1 exclusion**: reject candidates within Levenshtein distance 1
//!      of any excluded name (one substitution, insertion, or deletion).
//!
//! Performance budget (WASM): the exclude list is at most 2 000 entries.
//! Build cost: 2 000 × (HashSet insert + 24 ends_with) ≈ negligible.
//! Probe cost per candidate: exact/stem = O(1). Edit-1 scan: only the three
//! length buckets [len-1, len, len+1] are scanned; each bucket holds ~220
//! entries on average; within_edit1 is O(max(|a|,|b|)) ≈ O(12). Total ≈
//! 660 × 12 = ~8 k ops per probe, run only on candidates that survived every
//! cheaper filter. Well under 1 ms per generate() call.

use std::collections::{HashMap, HashSet};
use crate::blend::tech_suffix_of;

/// True iff Levenshtein(a, b) ≤ 1. Inputs must be lowercase.
///
/// Three cases only:
///   equal length   → at most one position may differ (one substitution)
///   |a| = |b| + 1  → a has one extra char that b lacks (one deletion from a)
///   |b| = |a| + 1  → b has one extra char that a lacks (one insertion into a)
///   |len diff| ≥ 2 → false immediately
pub fn within_edit1(a: &str, b: &str) -> bool {
    let ac: Vec<char> = a.chars().collect();
    let bc: Vec<char> = b.chars().collect();
    let la = ac.len();
    let lb = bc.len();
    match la.abs_diff(lb) {
        0 => {
            // One substitution allowed.
            ac.iter().zip(bc.iter()).filter(|(x, y)| x != y).count() <= 1
        }
        1 => {
            // One insertion/deletion: walk both, allowing one skip in the longer.
            let (long, short) = if la > lb { (&ac, &bc) } else { (&bc, &ac) };
            let mut si = 0usize; // index into short
            let mut skipped = false;
            for &c in long.iter() {
                if si < short.len() && c == short[si] {
                    si += 1;
                } else if !skipped {
                    skipped = true;
                } else {
                    return false;
                }
            }
            true
        }
        _ => false,
    }
}

/// The name minus its recognized tech suffix, or the whole name when no suffix
/// is recognized. Input must be lowercase. "keystonify" → "keyston".
pub fn stem_of(lower: &str) -> &str {
    match tech_suffix_of(lower) {
        Some(suf) => &lower[..lower.len() - suf.len()],
        None => lower,
    }
}

/// Preprocessed exclude list for fast near-duplicate rejection. Build once per
/// generate() call; queried many times (once per surviving candidate).
pub struct ExcludeSet {
    exact: HashSet<String>,
    /// Length-bucketed names for edit-1 scanning: only buckets [len-1..=len+1]
    /// need to be checked, cutting the search to ~1/n of the full list.
    by_len: HashMap<usize, Vec<String>>,
    stems: HashSet<String>,
}

impl ExcludeSet {
    /// Build from the caller-supplied exclude list. Lowercases internally.
    pub fn new(names: &[String]) -> Self {
        let mut exact = HashSet::new();
        let mut by_len: HashMap<usize, Vec<String>> = HashMap::new();
        let mut stems = HashSet::new();
        for name in names {
            let lower = name.to_lowercase();
            let stem = stem_of(&lower).to_string();
            by_len.entry(lower.chars().count()).or_default().push(lower.clone());
            stems.insert(stem);
            exact.insert(lower);
        }
        Self { exact, by_len, stems }
    }

    /// True if `lower` (already lowercase) should be rejected.
    ///
    /// Check order: exact → stem → edit-1 (most expensive last).
    /// When `fuzzy` and `stems` are both false this reproduces the pre-33
    /// exact-only check byte-for-byte.
    pub fn rejects(&self, lower: &str, fuzzy: bool, stems: bool) -> bool {
        if self.exact.contains(lower) {
            return true;
        }
        if stems && self.stems.contains(stem_of(lower)) {
            return true;
        }
        if fuzzy {
            let len = lower.chars().count();
            for bucket in [len.saturating_sub(1), len, len + 1] {
                if let Some(entries) = self.by_len.get(&bucket) {
                    for excluded in entries {
                        if within_edit1(lower, excluded) {
                            return true;
                        }
                    }
                }
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- within_edit1 ---

    #[test]
    fn edit1_equal_strings() {
        assert!(within_edit1("keyston", "keyston"));
    }

    #[test]
    fn edit1_one_substitution() {
        assert!(within_edit1("keyston", "kEyston")); // uppercase treated as different char
        assert!(within_edit1("keyston", "keystOn"));
    }

    #[test]
    fn edit1_two_substitutions_false() {
        assert!(!within_edit1("keyston", "xeystXn"));
    }

    #[test]
    fn edit1_one_insertion() {
        assert!(within_edit1("keystona", "keyston"));
        assert!(within_edit1("keystonn", "keyston"));
        assert!(within_edit1("akeyston", "keyston"));
    }

    #[test]
    fn edit1_one_deletion() {
        assert!(within_edit1("keyston", "keystona"));
        assert!(within_edit1("keyston", "keystonn"));
    }

    #[test]
    fn edit1_len_diff_two_false() {
        assert!(!within_edit1("keystonn", "keysto")); // len diff 2
        assert!(!within_edit1("ab", "abcd"));
    }

    // --- stem_of ---

    #[test]
    fn stem_strips_suffix() {
        assert_eq!(stem_of("keystonify"), "keyston");
        assert_eq!(stem_of("dataforge"), "data");
        assert_eq!(stem_of("cloudworks"), "cloud");
    }

    #[test]
    fn stem_no_suffix() {
        assert_eq!(stem_of("nova"), "nova");
        assert_eq!(stem_of("keron"), "keron");
    }

    // --- ExcludeSet ---

    #[test]
    fn excludeset_exact() {
        let ex = ExcludeSet::new(&["keyston".to_string()]);
        assert!(ex.rejects("keyston", false, false));
        assert!(!ex.rejects("keynova", false, false));
    }

    #[test]
    fn excludeset_fuzzy_edit1() {
        let ex = ExcludeSet::new(&["keyston".to_string()]);
        assert!(ex.rejects("keystona", true, false)); // 1 insertion
        assert!(ex.rejects("keystonn", true, false)); // 1 insertion
        assert!(!ex.rejects("keynova", true, false)); // unrelated
    }

    #[test]
    fn excludeset_stem_match() {
        let ex = ExcludeSet::new(&["keyston".to_string()]);
        // "keystonify" stem is "keyston" → rejected
        assert!(ex.rejects("keystonify", false, true));
    }

    #[test]
    fn excludeset_stem_reverse() {
        // If keystonify is excluded, keyston should be rejected via stem too.
        let ex = ExcludeSet::new(&["keystonify".to_string()]);
        assert!(ex.rejects("keyston", false, true));
    }

    #[test]
    fn excludeset_fuzzy_false_no_extra_rejects() {
        let ex = ExcludeSet::new(&["keyston".to_string()]);
        // With both false, only exact match fires.
        assert!(!ex.rejects("keystona", false, false));
        assert!(!ex.rejects("keystonify", false, false));
    }

    #[test]
    fn excludeset_unrelated_accepted() {
        let ex = ExcludeSet::new(&["keyston".to_string()]);
        assert!(!ex.rejects("glorbnex", true, true));
        assert!(!ex.rejects("vantaflow", true, true));
    }
}
