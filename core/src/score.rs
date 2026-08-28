use crate::phonotactics::{is_vowel, syllable_count};
use std::collections::HashSet;

/// Plosive consonants — an initial plosive measurably raises brand-name
/// memorability (sound-symbolism research, Pathak 2020).
const PLOSIVES: &[char] = &['b', 'p', 't', 'd', 'k', 'g'];

/// Score memorability 0–100 (higher = more memorable / brandable).
/// Rewards: initial plosive, shortness, few syllables, repeated onsets/letters.
pub fn score_memorability(name: &str) -> u32 {
    if name.is_empty() {
        return 0;
    }
    let lower = name.to_lowercase();
    let chars: Vec<char> = lower.chars().collect();
    let len = chars.len();

    let mut score = 45.0f64;

    // Initial plosive bonus
    if PLOSIVES.contains(&chars[0]) {
        score += 15.0;
    }

    // Shortness: peak around 4–7 chars, penalty for long names
    if (4..=7).contains(&len) {
        score += 15.0;
    } else if len > 7 {
        score -= (len as f64 - 7.0) * 4.0;
    } else {
        // very short (< 4) is punchy but cramped
        score += 5.0;
    }

    // Few syllables are easier to recall
    let syl = syllable_count(&lower);
    score += match syl {
        1 | 2 => 12.0,
        3 => 4.0,
        _ => -(syl as f64 - 3.0) * 6.0,
    };

    // Repetition / alliteration: repeated letters or doubled onset are catchy
    let distinct: HashSet<char> = chars.iter().copied().collect();
    let repetition = len - distinct.len();
    if repetition > 0 {
        score += (repetition as f64).min(2.0) * 5.0;
    }

    score.clamp(0.0, 100.0) as u32
}

/// Score pronounceability 0–100 (higher = easier to say).
pub fn score_pronounceability(name: &str) -> u32 {
    if name.is_empty() {
        return 0;
    }
    let chars: Vec<char> = name.chars().collect();
    let n = chars.len() as f64;
    let mut penalty = 0.0f64;

    // penalise consecutive consonant runs > 2
    let mut cons_run = 0u32;
    for &c in &chars {
        if is_vowel(c) {
            if cons_run > 2 {
                penalty += (cons_run - 2) as f64 * 8.0;
            }
            cons_run = 0;
        } else {
            cons_run += 1;
        }
    }
    if cons_run > 2 {
        penalty += (cons_run - 2) as f64 * 8.0;
    }

    // reward CV alternation: count transitions vowel→consonant or consonant→vowel
    let transitions = chars
        .windows(2)
        .filter(|w| is_vowel(w[0]) != is_vowel(w[1]))
        .count() as f64;
    let alternation_bonus = (transitions / n) * 20.0;

    // penalise very short or very long
    if name.len() < 3 {
        penalty += 15.0;
    }
    if name.len() > 10 {
        penalty += (name.len() as f64 - 10.0) * 3.0;
    }

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
    let is_substring = dictionary
        .iter()
        .any(|w| w.len() >= 4 && (lower.contains(w.as_str()) || w.contains(lower.as_str())));
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

/// True iff `levenshtein(a, b) <= 2` — same predicate the brand-mimic filter
/// uses, but allocation-free for ASCII inputs (Phase 34). The full DP below
/// builds a nested Vec matrix per call; the mimic filter probes hundreds of
/// brands per candidate, so those allocations dominated big-tech latency.
/// Two stack rows + an early row-min exit give identical answers.
pub(crate) fn levenshtein_le2(a: &str, b: &str) -> bool {
    let (m, n) = (a.len(), b.len());
    const CAP: usize = 64;
    if !a.is_ascii() || !b.is_ascii() || m >= CAP || n >= CAP {
        return levenshtein(a, b) <= 2;
    }
    if m.abs_diff(n) > 2 {
        return false;
    }
    let (a, b) = (a.as_bytes(), b.as_bytes());
    let mut prev = [0usize; CAP];
    let mut curr = [0usize; CAP];
    for (j, p) in prev.iter_mut().enumerate().take(n + 1) {
        *p = j;
    }
    for i in 1..=m {
        curr[0] = i;
        let mut row_min = i;
        for j in 1..=n {
            curr[j] = if a[i - 1] == b[j - 1] {
                prev[j - 1]
            } else {
                1 + prev[j].min(curr[j - 1]).min(prev[j - 1])
            };
            row_min = row_min.min(curr[j]);
        }
        // Distance only grows down the rows — once a whole row exceeds 2, done.
        if row_min > 2 {
            return false;
        }
        prev[..=n].copy_from_slice(&curr[..=n]);
    }
    prev[n] <= 2
}

pub(crate) fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let m = a.len();
    let n = b.len();
    // Early-exit for big length differences — can't be close
    if m.abs_diff(n) > 2 {
        return m.abs_diff(n);
    }
    let mut dp = vec![vec![0usize; n + 1]; m + 1];
    for i in 0..=m {
        dp[i][0] = i;
    }
    for j in 0..=n {
        dp[0][j] = j;
    }
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
        ["flux", "link", "node", "cloud"]
            .iter()
            .map(|s| s.to_string())
            .collect()
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

    #[test]
    fn memorability_favors_short_punchy() {
        // Short, plosive-initial "Bolt" should beat long "Aelindorian"
        let punchy = score_memorability("Bolt");
        let long = score_memorability("Aelindorian");
        assert!(punchy > long, "{} vs {}", punchy, long);
        assert!(punchy <= 100);
        assert!(long <= 100);
    }
}
