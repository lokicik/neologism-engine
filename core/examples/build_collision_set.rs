//! Offline builder for `core/data/collision.bloom` (Phase 141, roadmap phase
//! 4a). Reads the extracted crate-name list (research/collision/crate-names.txt,
//! produced by extract_names.py — gitignored) plus the shipped brand corpus and
//! writes a bloom filter over all of them. Package/brand NAMES are facts, so the
//! membership set is license-clean (see DATA-LICENSES.md).
//!
//! ```powershell
//! cargo run -p neologism-core --example build_collision_set --release
//! ```

use neologism_core::collision::build_bloom;
use std::collections::BTreeSet;
use std::fs;

const BITS_PER_ELEM: usize = 11; // ~0.5% false-positive rate

fn add_names(set: &mut BTreeSet<String>, text: &str) {
    for line in text.lines() {
        let name = line.trim().to_lowercase();
        if (3..=14).contains(&name.len()) && name.chars().all(|c| c.is_ascii_alphabetic()) {
            set.insert(name);
        }
    }
}

fn main() {
    let mut set: BTreeSet<String> = BTreeSet::new();

    let crate_names = "research/collision/crate-names.txt";
    match fs::read_to_string(crate_names) {
        Ok(text) => add_names(&mut set, &text),
        Err(e) => eprintln!("warning: no {crate_names} ({e}); building from bigtech only"),
    }
    add_names(
        &mut set,
        &fs::read_to_string("core/data/bigtech.txt").expect("bigtech.txt"),
    );

    let names: Vec<String> = set.into_iter().collect();
    let blob = build_bloom(&names, BITS_PER_ELEM);
    fs::write("core/data/collision.bloom", &blob).expect("write collision.bloom");
    println!(
        "collision.bloom: {} names, {} KB ({} bits/elem, ~{:.1}% FP)",
        names.len(),
        blob.len() / 1024,
        BITS_PER_ELEM,
        // Approximate FP for k = round(bits*ln2): (1 - e^{-k n / m})^k ≈ 0.6185^bits
        0.6185f64.powi(BITS_PER_ELEM as i32) * 100.0,
    );
}
