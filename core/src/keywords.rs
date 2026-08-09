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
    "a",
    "an",
    "the",
    "and",
    "or",
    "but",
    "if",
    "then",
    "else",
    "for",
    "to",
    "of",
    "in",
    "on",
    "at",
    "by",
    "with",
    "from",
    "into",
    "onto",
    "up",
    "down",
    "out",
    "over",
    "under",
    "as",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "am",
    "do",
    "does",
    "did",
    "have",
    "has",
    "had",
    "it",
    "its",
    "this",
    "that",
    "these",
    "those",
    "they",
    "them",
    "their",
    "we",
    "us",
    "our",
    "you",
    "your",
    "i",
    "me",
    "my",
    "he",
    "she",
    "his",
    "her",
    "him",
    "who",
    "whom",
    "which",
    "what",
    "when",
    "where",
    "why",
    "how",
    "all",
    "any",
    "some",
    "no",
    "not",
    "can",
    "will",
    "would",
    "should",
    "could",
    "may",
    "might",
    "must",
    "shall",
    "about",
    "between",
    "through",
    "during",
    "without",
    "within",
    "along",
    "across",
    "after",
    "before",
    "than",
    "so",
    "too",
    "very",
    "just",
    "more",
    "most",
    "much",
    "many",
    "such",
    "own",
    "same",
    "other",
    "each",
    "app",
    "application",
    "platform",
    "tool",
    "service",
    "product",
    "system",
    "software",
    "lets",
    "let",
    "help",
    "helps",
    "make",
    "makes",
    "using",
    "use",
    "uses",
    "via",
    "per",
];

fn is_stopword(w: &str) -> bool {
    STOPWORDS.contains(&w)
}

/// Short evocative roots for common product concepts. This is deliberately a
/// small, transparent offline lexicon rather than semantic inference.
fn concept_roots(word: &str) -> &'static [&'static str] {
    match word {
        "name" | "naming" | "brand" | "title" | "word" | "identity" => {
            &["lex", "nym", "nom", "mark", "mint"]
        }
        "developer" | "code" | "coding" | "program" | "programming" | "package" | "library"
        | "cli" | "api" => &["crate", "stack", "byte", "node", "kit"],
        "generate" | "generator" | "create" | "creator" | "build" | "builder" => {
            &["forge", "mint", "spark", "seed", "craft"]
        }
        "secure" | "security" | "private" | "privacy" | "password" | "auth" | "encrypt"
        | "encrypted" => &["vault", "guard", "shield", "lock", "cipher"],
        "finance" | "money" | "payment" | "expense" | "budget" | "bank" | "invoice" => {
            &["ledger", "tally", "mint", "vault", "fund"]
        }
        "health" | "fitness" | "workout" | "exercise" | "medical" | "care" => {
            &["pulse", "vital", "thrive", "fit", "care"]
        }
        "write" | "writing" | "journal" | "note" | "document" | "editor" => {
            &["ink", "quill", "draft", "scribe", "note"]
        }
        "friend" | "community" | "social" | "team" | "chat" | "message" => {
            &["kin", "circle", "bond", "link", "tribe"]
        }
        "data" | "analytic" | "analytics" | "insight" | "metric" => {
            &["signal", "lens", "trace", "scope", "vector"]
        }
        "design" | "color" | "visual" | "creative" => &["hue", "form", "pixel", "canvas", "prism"],
        "task" | "plan" | "schedule" | "calendar" | "focus" | "productivity" => {
            &["focus", "flow", "tempo", "task", "plan"]
        }
        "market" | "marketplace" | "shop" | "sell" | "buy" | "commerce" => {
            &["cart", "trade", "market", "shelf", "bazaar"]
        }
        "travel" | "trip" | "map" | "route" => &["roam", "atlas", "route", "compass", "trek"],
        "photo" | "image" | "video" | "audio" | "music" => {
            &["frame", "reel", "wave", "tune", "echo"]
        }
        "learn" | "education" | "study" | "course" => &["learn", "lore", "study", "skill", "class"],
        "delivery" | "ship" | "shipping" | "logistic" | "logistics" | "transport" => {
            &["route", "fleet", "cargo", "relay", "dock"]
        }
        "ai" | "model" | "agent" | "automation" => &["mind", "synth", "agent", "spark", "neural"],
        "fast" | "speed" | "performance" | "rapid" => &["swift", "dash", "bolt", "flux", "surge"],
        _ => &[],
    }
}

/// Artifact words are informative in a brief but weak literal naming roots.
/// Their concept expansions remain, avoiding Dev-/Gen-/Pack- stem walls.
fn suppress_literal_root(word: &str) -> bool {
    !concept_roots(word).is_empty() || matches!(word, "project" | "manager" | "dashboard")
}

/// Expand extracted keywords into brand-shaped roots. Unknown/domain-specific
/// words remain untouched, preserving prompt fidelity ("keyboard" stays a root).
pub fn brand_roots(keywords: &[String], limit: usize) -> Vec<String> {
    let mut out = Vec::new();
    for keyword in keywords {
        if !suppress_literal_root(keyword) && !out.contains(keyword) {
            out.push(keyword.clone());
        }
        for &root in concept_roots(keyword) {
            let root = root.to_string();
            if !out.contains(&root) {
                out.push(root);
            }
            if out.len() == limit {
                return out;
            }
        }
        if out.len() == limit {
            break;
        }
    }
    out
}

/// Meaningful 2-letter tokens that survive the min-length cut ("AI tool for
/// lawyers" must keep "ai", not just "lawyers").
const SHORT_KEEP: &[&str] = &["ai", "ml", "ar", "vr"];

/// Light inflection stripper — just enough that "journaling"/"keyboards" feed
/// the blender as "journal"/"keyboard". Deliberately not a Porter stemmer:
/// each rule is pinned by a test and nothing else is touched.
fn stem(word: &str) -> String {
    let mut w = word.to_string();
    if let Some(base) = w.strip_suffix("ing") {
        if base.len() >= 3 {
            let b: Vec<char> = base.chars().collect();
            let n = b.len();
            // splitting → split (undouble a final consonant pair)
            if n >= 2 && b[n - 1] == b[n - 2] && !"aeiou".contains(b[n - 1]) {
                w = base[..n - 1].to_string();
            } else {
                w = base.to_string();
            }
        }
    } else if let Some(base) = w.strip_suffix("ies") {
        if base.len() >= 2 {
            w = format!("{base}y"); // companies → company
        }
    } else if w.ends_with("sses")
        || w.ends_with("xes")
        || w.ends_with("zes")
        || w.ends_with("ches")
        || w.ends_with("shes")
    {
        w.truncate(w.len() - 2); // -es after a sibilant: boxes → box, glasses → glass
                                 // ("expenses" falls through to the plain -s rule below → "expense")
    } else if w.ends_with('s') && !w.ends_with("ss") && w.len() >= 4 {
        w.truncate(w.len() - 1); // keyboards → keyboard
    }
    w
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
        if is_stopword(raw) || (raw.len() < 3 && !SHORT_KEEP.contains(&raw)) {
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

    let mut scored: Vec<(&str, f64)> = freq.keys().map(|&w| (w, degree[w] / freq[w])).collect();
    // Sort by score desc, then alphabetically for determinism.
    scored.sort_by(|a, b| {
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.0.cmp(b.0))
    });

    // Stem the winners (journaling → journal) and dedupe post-stem collisions
    // ("keyboard" and "keyboards" must not both feed the blender).
    let mut out: Vec<String> = Vec::new();
    for (w, _) in scored {
        let s = stem(w);
        if !out.contains(&s) {
            out.push(s);
        }
        if out.len() == limit {
            break;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_content_words() {
        let kws = extract_keywords("an app for splitting expenses with friends", 5);
        assert!(kws.iter().any(|k| k == "split"));
        assert!(kws.iter().any(|k| k == "expense"));
        assert!(kws.iter().any(|k| k == "friend"));
        // stopwords excluded
        assert!(!kws.iter().any(|k| k == "an" || k == "for" || k == "with"));
    }

    #[test]
    fn stems_inflections() {
        assert_eq!(stem("journaling"), "journal");
        assert_eq!(stem("keyboards"), "keyboard");
        assert_eq!(stem("splitting"), "split");
        assert_eq!(stem("tracking"), "track");
        assert_eq!(stem("companies"), "company");
        assert_eq!(stem("expenses"), "expense");
        assert_eq!(stem("boxes"), "box");
        // not mangled: -ss kept, short -ing words kept
        assert_eq!(stem("fitness"), "fitness");
        assert_eq!(stem("king"), "king");
        assert_eq!(stem("mood"), "mood");
    }

    #[test]
    fn keeps_ai() {
        let kws = extract_keywords("AI tool for lawyers", 5);
        assert!(kws.iter().any(|k| k == "ai"), "{kws:?}");
        assert!(kws.iter().any(|k| k == "lawyer"), "{kws:?}");
    }

    #[test]
    fn dedupes_stems() {
        // "keyboard" and "keyboards" must collapse to one root.
        let kws = extract_keywords("keyboard layouts for keyboards", 5);
        assert_eq!(
            kws.iter().filter(|k| *k == "keyboard").count(),
            1,
            "{kws:?}"
        );
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

    #[test]
    fn expands_generic_dev_brief_into_brand_roots() {
        let kws = extract_keywords(
            "a developer tool that generates names for packages CLIs libraries and projects",
            8,
        );
        let roots = brand_roots(&kws, 16);
        assert!(roots.iter().any(|r| r == "lex" || r == "nym"));
        assert!(roots.iter().any(|r| r == "crate" || r == "stack"));
        assert!(roots.iter().any(|r| r == "forge" || r == "mint"));
        assert!(!roots.iter().any(|r| r == "developer" || r == "package"));
    }

    #[test]
    fn keeps_unknown_domain_words() {
        let roots = brand_roots(&["vintage".into(), "keyboard".into()], 12);
        assert!(roots.contains(&"vintage".to_string()));
        assert!(roots.contains(&"keyboard".to_string()));
    }
}
