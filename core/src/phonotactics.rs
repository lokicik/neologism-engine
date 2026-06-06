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
}
