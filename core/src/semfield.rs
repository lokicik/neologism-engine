//! Semantic-field expansion (Phase 141, roadmap phase 2).
//!
//! Maps a brief keyword to a handful of semantically related, brand-worthy
//! English words. The table is precomputed offline from GloVe 6B (PDDL /
//! public domain; edges only) and anchored to the engine's own wordlists, so
//! every value is already known-real English — see
//! `research/semantic-field/build_neighbors.py` and DATA-LICENSES.md.
//!
//! The seam-blend family uses this to widen its ingredient set when a brief's
//! curated concept groups are thin (the "backlinks" starvation case). Expanded
//! words are blend INGREDIENTS only — the seam-blend filters reject any real
//! word verbatim, so an expansion can never surface as a name (asserted by
//! `expansions_never_leak_as_names` in seamblend.rs).

use std::collections::HashMap;
use std::sync::OnceLock;

const NEIGHBORS: &str = include_str!("../data/semfield/neighbors.tsv");

static TABLE: OnceLock<HashMap<&'static str, Vec<&'static str>>> = OnceLock::new();

fn table() -> &'static HashMap<&'static str, Vec<&'static str>> {
    TABLE.get_or_init(|| {
        NEIGHBORS
            .lines()
            .filter_map(|line| {
                let (key, rest) = line.split_once('\t')?;
                let neighbors: Vec<&str> = rest.split_whitespace().collect();
                (!neighbors.is_empty()).then_some((key, neighbors))
            })
            .collect()
    })
}

/// Up to `k` brand-worthy words semantically related to `keyword`
/// (case-insensitive, already ranked by relatedness). Empty when the keyword
/// is absent from the table.
pub fn expand(keyword: &str, k: usize) -> Vec<&'static str> {
    let lower = keyword.trim().to_ascii_lowercase();
    table()
        .get(lower.as_str())
        .map(|ns| ns.iter().take(k).copied().collect())
        .unwrap_or_default()
}

/// True if the table has any expansion for `keyword`.
pub fn has(keyword: &str) -> bool {
    table().contains_key(keyword.trim().to_ascii_lowercase().as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_known_keyword() {
        let out = expand("habit", 3);
        assert_eq!(out.len(), 3);
        assert!(out.iter().all(|w| w.chars().all(|c| c.is_ascii_lowercase())));
    }

    #[test]
    fn respects_k_and_is_case_insensitive() {
        assert!(expand("TRACK", 2).len() <= 2);
        assert_eq!(expand("track", 99), expand("Track", 99));
    }

    #[test]
    fn unknown_keyword_is_empty() {
        assert!(expand("zzzznotaword", 5).is_empty());
        assert!(!has("zzzznotaword"));
    }

    #[test]
    fn neighbors_are_not_the_key_itself() {
        for key in ["habit", "track", "log", "deploy"] {
            assert!(expand(key, 16).iter().all(|w| *w != key), "self in {key}");
        }
    }
}
