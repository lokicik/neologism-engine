use crate::style::Style;

const VOWELS: &[char] = &['a', 'e', 'i', 'o', 'u', 'y'];

pub fn is_vowel(c: char) -> bool {
    VOWELS.contains(&c)
}

/// Returns false if the name violates basic phonotactic rules.
/// Uses a default max consonant run of 3.
pub fn is_valid(name: &str, style: Style) -> bool {
    is_valid_clustered(name, style, 3)
}

/// Like `is_valid`, but with a configurable max consonant run so harsher
/// variants (orcish, alien) can permit denser clusters.
pub fn is_valid_clustered(name: &str, style: Style, max_run: u32) -> bool {
    if name.is_empty() {
        return false;
    }
    let chars: Vec<char> = name.chars().collect();

    // must have at least one vowel
    if !chars.iter().any(|c| is_vowel(*c)) {
        return false;
    }

    // reject consonant runs longer than max_run
    let mut cons_run = 0u32;
    for &c in &chars {
        if is_vowel(c) || c == '\'' {
            cons_run = 0;
        } else {
            cons_run += 1;
            if cons_run > max_run {
                return false;
            }
        }
    }

    // style-specific rules
    match style {
        Style::BigTech => {
            // big-tech names should not start with a vowel cluster (>2) or end with unusual chars
            if chars.len() < 3 {
                return false;
            }
        }
        Style::SciFi | Style::Fantasy => {
            // allow apostrophes in fantasy, not sci-fi
            if style == Style::SciFi {
                if chars.contains(&'\'') {
                    return false;
                }
            }
        }
    }

    true
}

/// Sonority rank of a consonant (Clements 1990 scale; vowels are peaks).
/// Higher = more sonorous. `h` is dropped before this is consulted (digraphs).
fn sonority(c: char) -> u8 {
    match c {
        'w' | 'j' => 4, // glides
        'l' | 'r' => 3, // liquids
        'm' | 'n' => 2, // nasals
        _ => 1,         // obstruents
    }
}

fn strictly_rising(s: &[char]) -> bool {
    s.windows(2).all(|w| sonority(w[0]) < sonority(w[1]))
}

fn non_rising(s: &[char]) -> bool {
    s.windows(2).all(|w| sonority(w[0]) >= sonority(w[1]))
}

/// A valid onset rises strictly in sonority toward the vowel, with an optional
/// leading `s`-adjunct (the English "st-/sp-/sk-" exception).
fn onset_ok(c: &[char]) -> bool {
    if c.len() <= 1 {
        return true;
    }
    let rest = if c[0] == 's' { &c[1..] } else { c };
    strictly_rising(rest)
}

/// A valid coda falls (non-rising) in sonority away from the vowel.
fn coda_ok(c: &[char]) -> bool {
    c.len() <= 1 || non_rising(c)
}

/// A medial cluster splits into a falling coda + a rising onset at some trough.
fn medial_ok(c: &[char]) -> bool {
    (0..=c.len()).any(|k| coda_ok(&c[..k]) && onset_ok(&c[k..]))
}

/// Approximate Sonority Sequencing Principle check (Clements 1990): every
/// consonant cluster should rise toward a vowel and fall away from it. Used to
/// keep "soft" styles naturally pronounceable; harsh variants skip this.
/// `h` is treated as a digraph modifier (th, sh, ph...) and ignored; `'` breaks.
pub fn respects_sonority(name: &str) -> bool {
    let lower = name.to_lowercase();
    let chars: Vec<char> = lower.chars().filter(|&c| c != 'h').collect();
    let n = chars.len();

    let mut i = 0;
    let mut seen_vowel = false;
    while i < n {
        let c = chars[i];
        if is_vowel(c) {
            seen_vowel = true;
            i += 1;
            continue;
        }
        if c == '\'' {
            i += 1;
            continue;
        }
        // Gather a maximal consonant cluster.
        let start = i;
        while i < n && !is_vowel(chars[i]) && chars[i] != '\'' {
            i += 1;
        }
        let cluster = &chars[start..i];
        let at_start = !seen_vowel;
        let at_end = !chars[i..].iter().any(|&c| is_vowel(c));
        let ok = match (at_start, at_end) {
            (true, false) => onset_ok(cluster),
            (false, true) => coda_ok(cluster),
            (false, false) => medial_ok(cluster),
            (true, true) => true, // vowelless — is_valid rejects this separately
        };
        if !ok {
            return false;
        }
    }
    true
}

/// Split a word into rough CV syllables; returns syllable count.
pub fn syllable_count(name: &str) -> usize {
    let mut count = 0usize;
    let mut prev_vowel = false;
    for c in name.chars() {
        let v = is_vowel(c);
        if v && !prev_vowel {
            count += 1;
        }
        prev_vowel = v;
    }
    count.max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_no_vowel() {
        assert!(!is_valid("xskqr", Style::Fantasy));
    }

    #[test]
    fn rejects_long_consonant_run() {
        assert!(!is_valid("strengths_xkcd", Style::SciFi));
    }

    #[test]
    fn accepts_valid_fantasy() {
        assert!(is_valid("aelindra", Style::Fantasy));
    }

    #[test]
    fn syllable_count_works() {
        // ae-lin-dra: "ae" is one vowel group → 3 syllables
        assert_eq!(syllable_count("aelindra"), 3);
        assert_eq!(syllable_count("flux"), 1);
        assert_eq!(syllable_count("nexus"), 2);
    }

    #[test]
    fn sonority_accepts_natural_clusters() {
        assert!(respects_sonority("tract")); // tr onset, ct... coda
        assert!(respects_sonority("strand")); // str onset (s-adjunct), nd coda
        assert!(respects_sonority("solindra")); // ndr medial
        assert!(respects_sonority("caladriel")); // dr medial
        assert!(respects_sonority("thandriel")); // th digraph, ndr medial
        assert!(respects_sonority("nexus"));
    }

    #[test]
    fn sonority_rejects_unnatural_clusters() {
        assert!(!respects_sonority("sptai")); // "spt" onset: pt doesn't rise
        assert!(!respects_sonority("figm")); // "gm" coda rises (g<m)
        assert!(!respects_sonority("rtmang")); // "rtm" reversal
    }
}
