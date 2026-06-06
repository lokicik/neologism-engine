//! Lightweight keyword extraction (simplified RAKE — Rose et al. 2010).
//!
//! RAKE is training-free and language-independent: split text into candidate
//! phrases at stopwords, then score each content word by degree/frequency
//! (words that co-occur in longer phrases score higher). We return the top
//! single words to feed the big-tech blender, so a product description like
//! "app for splitting expenses with friends" yields roots like
//! {split, expense, friend}.

/// Common English function words — phrase delimiters, never keywords.
const STOPWORDS: &[&str] = &[
    "a", "an", "the", "and", "or", "but", "if", "then", "else", "for", "to", "of", "in", "on",
    "at", "by", "with", "from", "into", "onto", "up", "down", "out", "over", "under", "as", "is",
    "are", "was", "were", "be", "been", "being", "am", "do", "does", "did", "have", "has", "had",
    "it", "its", "this", "that", "these", "those", "they", "them", "their", "we", "us", "our",
    "you", "your", "i", "me", "my", "he", "she", "his", "her", "him", "who", "whom", "which",
    "what", "when", "where", "why", "how", "all", "any", "some", "no", "not", "can", "will",
    "would", "should", "could", "may", "might", "must", "shall", "about", "between", "through",
    "during", "without", "within", "along", "across", "after", "before", "than", "so", "too",
    "very", "just", "more", "most", "much", "many", "such", "own", "same", "other", "each",
    "app", "application", "platform", "tool", "service", "product", "system", "software",
    "lets", "let", "help", "helps", "make", "makes", "using", "use", "uses", "via", "per",
];

fn is_stopword(w: &str) -> bool {
    STOPWORDS.contains(&w)
}

/// Extract up to `limit` keyword stems from `text`, ranked by RAKE word score.
pub fn extract_keywords(text: &str, limit: usize) -> Vec<String> {
    let lower = text.to_lowercase();

    // Tokenize, then split into candidate phrases at stopwords / non-alpha breaks.
    let mut phrases: Vec<Vec<String>> = Vec::new();
    let mut current: Vec<String> = Vec::new();
    for raw in lower.split(|c: char| !c.is_ascii_alphabetic()) {
        if raw.is_empty() {
            continue;
        }
        if is_stopword(raw) || raw.len() < 3 {
            if !current.is_empty() {
                phrases.push(std::mem::take(&mut current));
            }
        } else {
            current.push(raw.to_string());
        }
    }
    if !current.is_empty() {
        phrases.push(current);
    }

    // RAKE word scoring: score(w) = degree(w) / frequency(w).
    use std::collections::HashMap;
    let mut freq: HashMap<&str, f64> = HashMap::new();
    let mut degree: HashMap<&str, f64> = HashMap::new();
    for phrase in &phrases {
        let plen = phrase.len() as f64;
        for w in phrase {
            *freq.entry(w.as_str()).or_insert(0.0) += 1.0;
            *degree.entry(w.as_str()).or_insert(0.0) += plen;
        }
    }

    let mut scored: Vec<(&str, f64)> = freq
        .keys()
        .map(|&w| (w, degree[w] / freq[w]))
        .collect();
    // Sort by score desc, then alphabetically for determinism.
    scored.sort_by(|a, b| {
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.0.cmp(b.0))
    });

    scored.into_iter().take(limit).map(|(w, _)| w.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_content_words() {
        let kws = extract_keywords("an app for splitting expenses with friends", 5);
        assert!(kws.iter().any(|k| k.contains("split")));
        assert!(kws.iter().any(|k| k == "expenses"));
        assert!(kws.iter().any(|k| k == "friends"));
        // stopwords excluded
        assert!(!kws.iter().any(|k| k == "an" || k == "for" || k == "with"));
    }

    #[test]
    fn empty_text_yields_nothing() {
        assert!(extract_keywords("", 5).is_empty());
        assert!(extract_keywords("the and or with", 5).is_empty());
    }

    #[test]
    fn respects_limit() {
        let kws = extract_keywords("fast secure private encrypted messaging chat network", 3);
        assert_eq!(kws.len(), 3);
    }
}
