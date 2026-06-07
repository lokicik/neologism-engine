//! Phonetic connotation tags — the "vibe" a name evokes, derived from sound
//! symbolism.
//!
//! Grounded in: Sapir (1929) — front vowels ("mil") read as small, back vowels
//! ("mal") as large; Klink (2000) and Lowrey & Shrum (2007) — front vowels +
//! fricatives read as small/light/fast/sharp, back vowels + stops as
//! large/heavy/bold, sonorants as soft/smooth; the bouba/kiki effect — front
//! vowels + plosives feel sharp, back vowels + sonorants feel round.
//!
//! We use tasteful neutral adjectives (bold/delicate), not the gendered phrasing
//! some of the source studies use. Operates on letters, so no grapheme-to-phoneme
//! step is needed.

const FRONT_VOWELS: &[char] = &['e', 'i', 'y'];
const BACK_VOWELS: &[char] = &['o', 'u'];
const PLOSIVES: &[char] = &['b', 'p', 't', 'd', 'k', 'g'];
const FRICATIVES: &[char] = &['f', 'v', 's', 'z', 'x', 'h'];
const SONORANTS: &[char] = &['l', 'r', 'm', 'n', 'w'];

/// Up to 3 descriptive tags for the name's phonetic character.
pub fn connotations(name: &str) -> Vec<String> {
    let lower = name.to_lowercase();
    let chars: Vec<char> = lower.chars().filter(|c| c.is_ascii_alphabetic()).collect();
    if chars.is_empty() {
        return vec![];
    }

    let count = |set: &[char]| chars.iter().filter(|c| set.contains(c)).count();
    let front = count(FRONT_VOWELS);
    let back = count(BACK_VOWELS);
    let plosive = count(PLOSIVES);
    let fricative = count(FRICATIVES);
    let sonorant = count(SONORANTS);

    let mut tags: Vec<&str> = Vec::new();

    // Size / weight axis (Sapir 1929): one size tag, weight only on a strong lean.
    if front > back {
        tags.push("small");
        if front >= back + 2 {
            tags.push("light");
        }
    } else if back > front {
        tags.push("large");
        if back >= front + 2 {
            tags.push("heavy");
        }
    }

    // Texture axis: the single dominant consonant class (distinct adjective each).
    let max_cons = sonorant.max(plosive).max(fricative);
    if max_cons > 0 {
        if plosive == max_cons {
            tags.push("bold");
        } else if fricative == max_cons {
            tags.push("sleek");
        } else {
            tags.push("smooth");
        }
    }

    // Shape axis (bouba/kiki): only on a clear signal.
    if front > back && plosive > sonorant {
        tags.push("sharp");
    } else if back > front && sonorant > plosive {
        tags.push("round");
    }

    // Dedup preserving order, cap at 3.
    let mut seen = std::collections::HashSet::new();
    tags.into_iter()
        .filter(|t| seen.insert(*t))
        .take(3)
        .map(|s| s.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn front_vowels_read_small() {
        // "zigez" — front vowels (Klink's miniature-car example)
        assert!(connotations("zigez").contains(&"small".to_string()));
    }

    #[test]
    fn back_vowels_read_large() {
        // back vowels o/u dominate (Klink's jumbo-car direction)
        assert!(connotations("zugor").contains(&"large".to_string()));
    }

    #[test]
    fn tags_capped_and_nonempty() {
        for n in ["aelindra", "brutok", "zephyr", "flux", "qexxor"] {
            let t = connotations(n);
            assert!(!t.is_empty(), "{} gave no tags", n);
            assert!(t.len() <= 3);
        }
    }
}
