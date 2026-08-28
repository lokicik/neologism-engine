//! Offline builder for `core/data/pron_lexicon.tsv` (Phase 141).
//!
//! Reads the full CMUdict (BSD-2-Clause) from `research/cmudict/cmudict.dict`
//! (gitignored — download from https://github.com/cmusphinx/cmudict) and emits
//! the subset the engine ships: every 3–12-char lowercase-alpha word that
//! appears in the engine's own wordlists (common_words, roots, adjectives,
//! realwords, metaphor palettes). Stress digits are stripped; only the first
//! pronunciation of each word is kept. Output is committed; run manually from
//! the workspace root after changing any source wordlist:
//!
//! ```powershell
//! cargo run -p neologism-core --example build_pron_lexicon
//! ```

use neologism_core::phonology::Phoneme;
use std::collections::{BTreeMap, HashSet};
use std::fs;

/// Curated second-half palettes from lib.rs (CONCEPT_METAPHORS ∪
/// GUIDED_METAPHORS). Duplicated here because they are private constants;
/// nearly all are also in common_words.txt — this list just guarantees it.
const METAPHORS: &[&str] = &[
    "flow", "forge", "spark", "seed", "craft", "nest", "lab", "wave", "link", "pulse", "beam",
    "grid", "vault", "relay", "trace", "scope", "prism", "lumen", "nova", "peak", "trail", "path",
    "signal", "hive", "smith", "harbor", "grove", "spring", "frame", "glow", "flux", "loom",
    "muse", "atlas",
];

fn wordlist(path: &str) -> Vec<String> {
    fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("cannot read {path}: {e}"))
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(str::to_lowercase)
        .collect()
}

fn main() {
    let dict_path = "research/cmudict/cmudict.dict";
    let cmudict = fs::read_to_string(dict_path).unwrap_or_else(|e| {
        panic!("cannot read {dict_path} (download from github.com/cmusphinx/cmudict): {e}")
    });

    let mut wanted: HashSet<String> = HashSet::new();
    for path in [
        "core/data/common_words.txt",
        "core/data/roots.txt",
        "core/data/adjectives.txt",
        "core/data/realwords.txt",
    ] {
        wanted.extend(wordlist(path));
    }
    wanted.extend(METAPHORS.iter().map(|s| s.to_string()));

    let mut out: BTreeMap<String, String> = BTreeMap::new();
    let mut bad_symbols = 0usize;
    for line in cmudict.lines() {
        let line = line.split('#').next().unwrap_or("").trim();
        let mut parts = line.split_whitespace();
        let Some(word) = parts.next() else { continue };
        // Skip alternate pronunciations ("word(2)") and any non-alpha entry.
        if !word.bytes().all(|b| b.is_ascii_lowercase()) {
            continue;
        }
        if word.len() < 3 || word.len() > 12 || !wanted.contains(word) {
            continue;
        }
        let mut phones: Vec<&str> = Vec::new();
        let mut valid = true;
        for sym in parts {
            match Phoneme::from_arpabet(sym) {
                // Store the stress-stripped symbol to keep the file compact.
                Some(_) => phones.push(sym.trim_end_matches(|c: char| c.is_ascii_digit())),
                None => {
                    valid = false;
                    break;
                }
            }
        }
        if !valid || phones.is_empty() {
            bad_symbols += 1;
            continue;
        }
        // First pronunciation wins; BTreeMap keeps output sorted/deterministic.
        out.entry(word.to_string()).or_insert_with(|| {
            let owned: Vec<String> = phones.iter().map(|s| s.to_string()).collect();
            owned.join(" ")
        });
    }

    let mut tsv = String::with_capacity(out.len() * 24);
    for (word, phones) in &out {
        tsv.push_str(word);
        tsv.push('\t');
        tsv.push_str(phones);
        tsv.push('\n');
    }
    fs::write("core/data/pron_lexicon.tsv", &tsv).expect("write pron_lexicon.tsv");

    let missing: Vec<&String> = wanted
        .iter()
        .filter(|w| w.len() >= 3 && w.len() <= 12 && !out.contains_key(*w))
        .take(15)
        .collect();
    println!(
        "pron_lexicon.tsv: {} entries, {} bytes ({} unparsable cmudict lines)",
        out.len(),
        tsv.len(),
        bad_symbols
    );
    println!(
        "wordlist coverage: {}/{} (sample missing: {:?})",
        wanted
            .iter()
            .filter(|w| w.len() >= 3 && w.len() <= 12 && out.contains_key(*w))
            .count(),
        wanted
            .iter()
            .filter(|w| w.len() >= 3 && w.len() <= 12)
            .count(),
        missing
    );
}
