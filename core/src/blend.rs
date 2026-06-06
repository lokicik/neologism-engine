use rand::Rng;
use crate::phonotactics::{is_vowel, syllable_count};

const TECH_SUFFIXES: &[&str] = &["ly", "ify", "io", "ia", "ware", "hub", "base", "lab", "ai", "hq", "it"];

/// Blend two root words: take a prefix of `a` and a suffix of `b`.
/// Returns None if inputs are too short.
pub fn blend(a: &str, b: &str) -> Option<String> {
    if a.len() < 2 || b.len() < 2 {
        return None;
    }
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();

    // split at the first vowel boundary (after at least 1 char) for each word
    let a_split = first_vowel_boundary(&a_chars).unwrap_or(a_chars.len() / 2).max(1);
    let b_split = last_consonant_onset(&b_chars).unwrap_or(b_chars.len() / 2);

    let prefix: String = a_chars[..a_split].iter().collect();
    let suffix: String = b_chars[b_split..].iter().collect();

    if prefix.is_empty() || suffix.is_empty() {
        return None;
    }
    Some(format!("{}{}", prefix, suffix))
}

/// Drop the trailing vowel(s) to get a consonant-ending "tech" form (Flickr-style).
pub fn drop_trailing_vowels(s: &str) -> String {
    let trimmed = s.trim_end_matches(|c| is_vowel(c));
    if trimmed.is_empty() { s.to_string() } else { trimmed.to_string() }
}

/// Apply a random tech transform: suffix append or vowel-dropping.
pub fn tech_transform<R: Rng>(rng: &mut R, name: &str, temperature: f64) -> String {
    // at low temperature prefer no transform, at high temperature almost always transform
    let transform_prob = temperature * 0.7;
    if rng.gen::<f64>() > transform_prob {
        return name.to_string();
    }
    // 30% chance drop vowels, 70% chance append suffix
    if rng.gen::<f64>() < 0.3 {
        drop_trailing_vowels(name)
    } else {
        let suffix = TECH_SUFFIXES[rng.gen_range(0..TECH_SUFFIXES.len())];
        // avoid double-appending if name already ends with suffix
        if name.ends_with(suffix) {
            name.to_string()
        } else {
            format!("{}{}", name, suffix)
        }
    }
}

/// Index of first transition from consonant to vowel (≥ 1 char in).
fn first_vowel_boundary(chars: &[char]) -> Option<usize> {
    let mut found_cons = false;
    for (i, &c) in chars.iter().enumerate() {
        if i == 0 { continue; }
        if !is_vowel(c) { found_cons = true; }
        if found_cons && is_vowel(c) { return Some(i); }
    }
    None
}

/// Index of last consonant cluster onset before final syllable.
fn last_consonant_onset(chars: &[char]) -> Option<usize> {
    if syllable_count(&chars.iter().collect::<String>()) < 2 {
        // single-syllable word: just take the last vowel start
        for (i, &c) in chars.iter().enumerate().rev() {
            if is_vowel(c) { return Some(i); }
        }
        return None;
    }
    // find the last vowel-to-consonant transition
    let mut last = None;
    let mut prev_vowel = false;
    for (i, &c) in chars.iter().enumerate() {
        if prev_vowel && !is_vowel(c) {
            last = Some(i);
        }
        prev_vowel = is_vowel(c);
    }
    last
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blend_pin_interest() {
        let result = blend("pin", "interest");
        assert!(result.is_some());
        let r = result.unwrap();
        assert!(!r.is_empty());
        // should start with "p" at minimum
        assert!(r.starts_with('p'));
    }

    #[test]
    fn blend_micro_soft() {
        let result = blend("micro", "soft");
        assert!(result.is_some());
    }

    #[test]
    fn drop_trailing_vowel() {
        assert_eq!(drop_trailing_vowels("syncro"), "syncr");
        assert_eq!(drop_trailing_vowels("flux"), "flux");
    }
}
