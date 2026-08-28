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

/// Native (test/example) builds embed the table so `cargo test` and the probes
/// work offline. The wasm build deliberately does NOT — `neighbors.tsv` is
/// ~0.5 MB gzipped and only the Lab seam-blend mode uses it, so the web layer
/// fetches it lazily and injects it via `load_from_tsv`, keeping it out of the
/// binary every production-Auto user downloads. See DATA-LICENSES.md.
#[cfg(not(target_arch = "wasm32"))]
const NEIGHBORS: &str = include_str!("../data/semfield/neighbors.tsv");

static TABLE: OnceLock<HashMap<String, Vec<String>>> = OnceLock::new();

fn parse(tsv: &str) -> HashMap<String, Vec<String>> {
    tsv.lines()
        .filter_map(|line| {
            let (key, rest) = line.split_once('\t')?;
            let neighbors: Vec<String> = rest.split_whitespace().map(str::to_string).collect();
            (!neighbors.is_empty()).then_some((key.to_string(), neighbors))
        })
        .collect()
}

/// Inject the neighbor table at runtime (the wasm lazy-load path). First call
/// wins; later calls and the native embedded fallback are ignored.
pub fn load_from_tsv(tsv: &str) {
    let _ = TABLE.set(parse(tsv));
}

fn table() -> &'static HashMap<String, Vec<String>> {
    TABLE.get_or_init(|| {
        #[cfg(not(target_arch = "wasm32"))]
        {
            parse(NEIGHBORS)
        }
        // Wasm without an injected table: expansion is simply a no-op, so the
        // seam-blend family still runs (thin briefs just stay thin).
        #[cfg(target_arch = "wasm32")]
        {
            HashMap::new()
        }
    })
}

/// Up to `k` brand-worthy words semantically related to `keyword`
/// (case-insensitive, already ranked by relatedness). Empty when the keyword
/// is absent from the table.
pub fn expand(keyword: &str, k: usize) -> Vec<&'static str> {
    let lower = keyword.trim().to_ascii_lowercase();
    table()
        .get(lower.as_str())
        .map(|ns| ns.iter().take(k).map(String::as_str).collect())
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
