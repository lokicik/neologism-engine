//! Name-collision bloom filter (Phase 141, roadmap phase 4a).
//!
//! A compact membership test over ~86k known package/brand NAMES (crates.io
//! crate names + `bigtech.txt`). Names are facts — unlike the crates.io dump's
//! descriptions, which are license-blocked — so shipping a membership set is
//! clean (see DATA-LICENSES.md). The Lab coinage families reject candidates the
//! filter flags, and the web app surfaces an "availability risk" chip via the
//! `collision_risk` wasm export. A bloom filter has one-sided error: a `true`
//! may be a ~0.5% false positive, a `false` is definitive. That asymmetry is
//! right here — we would rather occasionally drop a fine coinage than surface a
//! taken one.
//!
//! Native builds embed the bloom so tests run offline; the wasm build omits it
//! and the web layer injects it lazily (only the Lab modes and the chip use
//! it), keeping it out of the production-Auto binary.

use std::sync::OnceLock;

#[cfg(not(target_arch = "wasm32"))]
const COLLISION_BLOOM: &[u8] = include_bytes!("../data/collision.bloom");

static BLOOM: OnceLock<Option<Bloom>> = OnceLock::new();

struct Bloom {
    words: Vec<u64>,
    num_bits: u64,
    k: u32,
}

/// Two independent 64-bit FNV-1a-style hashes; the bloom's k probes are
/// `h1 + i*h2` (Kirsch–Mitzenmacher double hashing).
fn hash_pair(s: &[u8]) -> (u64, u64) {
    let mut h1: u64 = 0xcbf2_9ce4_8422_2325;
    let mut h2: u64 = 0x9e37_79b9_7f4a_7c15;
    for &b in s {
        h1 = (h1 ^ b as u64).wrapping_mul(0x0000_0100_0000_01b3);
        h2 = (h2 ^ b as u64).wrapping_mul(0xff51_afd7_ed55_8ccd);
    }
    // Mix so the two streams are well-separated even for short inputs.
    h2 = h2.wrapping_add(h1.rotate_left(31));
    (h1, h2 | 1)
}

impl Bloom {
    fn from_bytes(bytes: &[u8]) -> Option<Bloom> {
        if bytes.len() < 12 {
            return None;
        }
        let num_bits = u64::from_le_bytes(bytes[0..8].try_into().ok()?);
        let k = u32::from_le_bytes(bytes[8..12].try_into().ok()?);
        if num_bits == 0 || k == 0 {
            return None;
        }
        let num_words = num_bits.div_ceil(64) as usize;
        let body = &bytes[12..];
        if body.len() < num_words * 8 {
            return None;
        }
        let words = body[..num_words * 8]
            .chunks_exact(8)
            .map(|c| u64::from_le_bytes(c.try_into().unwrap()))
            .collect();
        Some(Bloom { words, num_bits, k })
    }

    fn contains(&self, s: &str) -> bool {
        let (h1, h2) = hash_pair(s.as_bytes());
        for i in 0..self.k as u64 {
            let bit = h1.wrapping_add(i.wrapping_mul(h2)) % self.num_bits;
            let word = (bit / 64) as usize;
            if self.words[word] & (1u64 << (bit % 64)) == 0 {
                return false;
            }
        }
        true
    }
}

/// Build a bloom filter blob from lowercase names. `bits_per_elem` sets the
/// false-positive rate (~11 → 0.5%). Used offline by
/// `core/examples/build_collision_set.rs`; the runtime reads the same format.
pub fn build_bloom(names: &[String], bits_per_elem: usize) -> Vec<u8> {
    let n = names.len().max(1);
    let num_bits = (n * bits_per_elem).max(64) as u64;
    let k = (((bits_per_elem as f64) * std::f64::consts::LN_2).round() as u32).clamp(1, 12);
    let num_words = num_bits.div_ceil(64) as usize;
    let mut words = vec![0u64; num_words];
    for name in names {
        let (h1, h2) = hash_pair(name.as_bytes());
        for i in 0..k as u64 {
            let bit = h1.wrapping_add(i.wrapping_mul(h2)) % num_bits;
            words[(bit / 64) as usize] |= 1u64 << (bit % 64);
        }
    }
    let mut out = Vec::with_capacity(12 + num_words * 8);
    out.extend_from_slice(&num_bits.to_le_bytes());
    out.extend_from_slice(&k.to_le_bytes());
    for w in words {
        out.extend_from_slice(&w.to_le_bytes());
    }
    out
}

/// Inject the bloom at runtime (the wasm lazy-load path). First call wins.
pub fn load_from_bytes(bytes: &[u8]) {
    let _ = BLOOM.set(Bloom::from_bytes(bytes));
}

fn bloom() -> &'static Option<Bloom> {
    BLOOM.get_or_init(|| {
        #[cfg(not(target_arch = "wasm32"))]
        {
            Bloom::from_bytes(COLLISION_BLOOM)
        }
        #[cfg(target_arch = "wasm32")]
        {
            None
        }
    })
}

/// True if `name` is probably an existing package/brand (or a ~0.5% false
/// positive). False is definitive. No-op (always false) when no bloom is
/// loaded, so callers degrade gracefully.
pub fn likely_taken(name: &str) -> bool {
    bloom()
        .as_ref()
        .is_some_and(|b| b.contains(&name.to_ascii_lowercase()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_membership() {
        let names: Vec<String> = ["github", "tokio", "serde", "vercel", "stripe"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let blob = build_bloom(&names, 12);
        let b = Bloom::from_bytes(&blob).unwrap();
        for n in &names {
            assert!(b.contains(n), "{n} should be present");
        }
        // A clearly-absent coinage should (very likely) miss.
        assert!(!b.contains("zqxlumen"));
    }

    #[test]
    fn embedded_bloom_knows_common_crates() {
        // The shipped bloom must recognize well-known crate names.
        assert!(likely_taken("tokio"));
        assert!(likely_taken("serde"));
        // A fresh coinage should not be flagged (allowing rare false positives).
        assert!(!likely_taken("zqxvelumarith"));
    }
}
