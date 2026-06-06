use std::collections::HashSet;
use crate::phonotactics::is_vowel;

/// Score pronounceability 0–100 (higher = easier to say).
pub fn score_pronounceability(name: &str) -> u32 {
    if name.is_empty() { return 0; }
    let chars: Vec<char> = name.chars().collect();
    let n = chars.len() as f64;
    let mut penalty = 0.0f64;

    // penalise consecutive consonant runs > 2
    let mut cons_run = 0u32;
    for &c in &chars {
        if is_vowel(c) {
            if cons_run > 2 { penalty += (cons_run - 2) as f64 * 8.0; }
            cons_run = 0;
        } else {
            cons_run += 1;
        }
    }
    if cons_run > 2 { penalty += (cons_run - 2) as f64 * 8.0; }

    // reward CV alternation: count transitions vowel→consonant or consonant→vowel
    let transitions = chars.windows(2)
        .filter(|w| is_vowel(w[0]) != is_vowel(w[1]))
        .count() as f64;
    let alternation_bonus = (transitions / n) * 20.0;

    // penalise very short or very long
    if name.len() < 3 { penalty += 15.0; }
    if name.len() > 10 { penalty += (name.len() as f64 - 10.0) * 3.0; }

    let raw = 80.0 + alternation_bonus - penalty;
    raw.clamp(0.0, 100.0) as u32
}

/// Score novelty 0–100: 0 = real word, 100 = completely invented.
pub fn score_novelty(name: &str, dictionary: &HashSet<String>) -> u32 {
    let lower = name.to_lowercase();
    if dictionary.contains(&lower) {
        return 5;
    }
    // Check if any dict word is a substring of the name or vice-versa
    let is_substring = dictionary.iter().any(|w| {
        w.len() >= 4 && (lower.contains(w.as_str()) || w.contains(lower.as_str()))
    });
    if is_substring {
        return 40;
    }
    // Check short edit distance to any common word
    let close = dictionary.iter().any(|w| levenshtein(&lower, w) <= 1);
    if close {
        return 60;
    }
    95
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let m = a.len();
    let n = b.len();
    // Early-exit for big length differences — can't be close
    if m.abs_diff(n) > 2 { return m.abs_diff(n); }
    let mut dp = vec![vec![0usize; n + 1]; m + 1];
    for i in 0..=m { dp[i][0] = i; }
    for j in 0..=n { dp[0][j] = j; }
    for i in 1..=m {
        for j in 1..=n {
            dp[i][j] = if a[i - 1] == b[j - 1] {
                dp[i - 1][j - 1]
            } else {
                1 + dp[i - 1][j].min(dp[i][j - 1]).min(dp[i - 1][j - 1])
            };
        }
    }
    dp[m][n]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dict() -> HashSet<String> {
        ["flux", "link", "node", "cloud"].iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn real_word_low_novelty() {
        assert!(score_novelty("flux", &dict()) < 20);
    }

    #[test]
    fn invented_word_high_novelty() {
        assert!(score_novelty("zyxvalar", &dict()) > 80);
    }

    #[test]
    fn pronounceability_in_range() {
        let s = score_pronounceability("aelindra");
        assert!(s <= 100);
        let s2 = score_pronounceability("xskqr");
        assert!(s2 < s);
    }
}
