//! Experimental shallow English intent parser. No model or added naming material.
//! Explicit synchronous scopes leave the existing Config and production API intact.
use crate::keywords;
use serde::Serialize;
use std::cell::RefCell;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct IntentTerm {
    pub term: String,
    pub surface: String,
    pub start: usize,
    pub end: usize,
    pub role: &'static str,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct BriefIntent {
    pub schema: &'static str,
    pub description: String,
    pub status: &'static str,
    pub fallback_reason: Option<&'static str>,
    pub terms: Vec<IntentTerm>,
    pub generation_terms: Vec<String>,
}

// Grammar vocabulary, not a synonym/name inventory. Actions stay distinct.
pub(crate) fn action(word: &str) -> Option<&'static str> {
    const ACTIONS: &[&str] = &[
        "check", "verify", "compare", "detect", "track", "replay", "explain",
        "group", "map", "find", "inspect", "record", "restore", "validate",
        "monitor", "search", "sync", "filter", "measure", "protect", "convert",
        "sort", "merge", "split", "analyze", "generate", "reproduce", "rehearse",
    ];
    ACTIONS.iter().copied().find(|base| {
        word == *base || word == format!("{base}s")
            || (base.ends_with('y') && word == format!("{}ies", &base[..base.len()-1]))
            || word == format!("{}ing", base.strip_suffix('e').unwrap_or(base))
    })
}

fn boundary(word: &str) -> bool {
    matches!(word, "before" | "after" | "across" | "between" | "against" | "during" | "by" | "without")
}

/// Spans refer to the original bytes. Ambiguous input retains legacy extraction.
pub fn compile(description: &str) -> BriefIntent {
    compile_with_actions(description, action)
}

pub(crate) fn compile_with_actions(description: &str, resolve_action: fn(&str) -> Option<&'static str>) -> BriefIntent {
    let mut intent = BriefIntent {
        schema: "brief-intent-v1", description: description.into(), status: "fallback",
        fallback_reason: None, terms: vec![], generation_terms: vec![],
    };
    let tokens: Vec<(usize, &str)> = description.split_inclusive(|c: char| !c.is_ascii_alphabetic())
        .scan(0, |offset, part| {
            let start = *offset;
            *offset += part.len();
            Some((start, part.trim_end_matches(|c: char| !c.is_ascii_alphabetic())))
        }).filter(|(_, word)| !word.is_empty()).collect();
    let words: Vec<String> = tokens.iter().map(|(_, w)| w.to_ascii_lowercase()).collect();
    let fallback = if description.trim().is_empty() { Some("empty_description") }
        else if !description.is_ascii() { Some("unsupported_language_or_characters") }
        else if words.iter().any(|w| matches!(w.as_str(), "no" | "not" | "never" | "without" | "cannot" | "doesn" | "don" | "isn")) { Some("negation_requires_interpretation") }
        else { None };
    let operation = words.iter().enumerate().find(|(i, w)| {
        resolve_action(w).is_some() && !words[..*i].iter().any(|w| boundary(w))
            && (*i == 0 || words[..*i].iter().any(|w| matches!(w.as_str(), "that" | "to" | "for"))
                || w.ends_with('s') || w.ends_with("ing"))
    }).map(|(i, _)| i);
    if let Some(reason) = fallback.or_else(|| operation.is_none().then_some("no_explicit_operation")) {
        intent.fallback_reason = Some(reason);
        intent.generation_terms = keywords::extract_keywords_legacy(description, 6);
        return intent;
    }
    let operation = operation.unwrap();
    let condition = words.iter().enumerate().skip(operation + 1).find(|(_, w)| boundary(w)).map(|(i, _)| i);
    for (i, (start, surface)) in tokens.iter().enumerate() {
        let word = &words[i];
        if i != operation && (keywords::is_stopword(word) || boundary(word)
            || matches!(word.as_str(), "utility" | "assistant" | "developer" | "local" | "command" | "line")
            || word.len() < 3) { continue; }
        let role = if i == operation { "operation" } else if i < operation { "context" }
            else if condition.is_some_and(|j| i > j) { "condition" } else { "object" };
        let term = resolve_action(word).map(str::to_string).unwrap_or_else(|| keywords::stem(word));
        intent.terms.push(IntentTerm { term, surface: (*surface).into(), start: *start, end: start + surface.len(), role });
    }
    if !intent.terms.iter().any(|t| t.role == "object") {
        intent.fallback_reason = Some("no_explicit_object");
        intent.generation_terms = keywords::extract_keywords_legacy(description, 6);
        return intent;
    }
    // Reserve the six-term producer budget for the operation, object and condition.
    // Context remains recorded even when it does not fit that budget.
    for (role, cap) in [("operation", 1), ("object", 3), ("condition", 2), ("context", 1)] {
        for term in intent.terms.iter().filter(|t| t.role == role).take(cap) {
            if intent.generation_terms.len() < 6 && !intent.generation_terms.contains(&term.term) {
                intent.generation_terms.push(term.term.clone());
            }
        }
    }
    intent.status = "parsed";
    intent
}

thread_local! {
    static ACTIVE: RefCell<Option<BriefIntent>> = const { RefCell::new(None) };
}

/// Synchronous only; restores nested calls and unwinding. Match the exact brief
/// and term list so derived Reason/Submorph root configurations stay independent.
pub fn with_intent<T>(intent: &BriefIntent, run: impl FnOnce() -> T) -> T {
    struct Restore(Option<BriefIntent>);
    impl Drop for Restore {
        fn drop(&mut self) { ACTIVE.with(|active| *active.borrow_mut() = self.0.take()); }
    }
    let _restore = Restore(ACTIVE.with(|active| active.replace(Some(intent.clone()))));
    run()
}

pub(crate) fn generation_keywords(text: &str, limit: usize) -> Option<Vec<String>> {
    ACTIVE.with(|active| active.borrow().as_ref()
        .filter(|i| i.status == "parsed" && i.description == text)
        .map(|i| i.generation_terms.iter().take(limit).cloned().collect()))
}

pub(crate) fn root_groups(terms: &[String], limit: usize) -> Option<Vec<Vec<String>>> {
    ACTIVE.with(|active| {
        let active = active.borrow();
        let intent = active.as_ref().filter(|i| i.status == "parsed" && i.generation_terms == terms)?;
        let mut seen = Vec::new();
        let mut groups = Vec::new();
        // Equal per-concept allowance, existing literal/palette roots only.
        let cap = (limit / intent.generation_terms.len().max(1)).clamp(1, 4);
        for term in terms {
            let mut group = Vec::new();
            let literal = (!keywords::suppress_literal_root(term)).then_some(term.as_str());
            for root in literal.into_iter().chain(keywords::concept_roots(term).iter().copied()) {
                if group.len() >= cap || seen.len() >= limit { break; }
                if !seen.iter().any(|s| s == root) {
                    seen.push(root.to_string()); group.push(root.to_string());
                }
            }
            if !group.is_empty() { groups.push(group); }
        }
        Some(groups)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roles_preserve_operation_and_original_spans() {
        for (brief, operation, object) in [
            ("a build tool that checks dependency licenses before publishing a package", "check", "license"),
            ("a package release assistant that verifies checksums of downloadable binaries", "verify", "checksum"),
            ("a command line utility that compares JSON responses across API versions", "compare", "json"),
        ] {
            let intent = compile(brief);
            assert_eq!(intent.status, "parsed");
            assert_eq!(intent.generation_terms[0], operation);
            assert!(intent.generation_terms.contains(&object.to_string()));
            for term in &intent.terms { assert_eq!(&brief[term.start..term.end], term.surface); }
        }
    }
    #[test]
    fn unsupported_and_negated_briefs_fall_back_exactly() {
        for brief in ["", "a checksum tool", "a tool that does not track users", "a tool that doesn't track users", "isim üreten araç", "verify"] {
            let intent = compile(brief);
            assert_eq!(intent.status, "fallback", "{brief}");
            with_intent(&intent, || assert_eq!(keywords::extract_keywords(brief, 6), intent.generation_terms));
        }
    }
    #[test]
    fn scope_restores_after_nested_calls_and_panic() {
        let brief = "a package tool that verifies checksums before release";
        let original = keywords::extract_keywords(brief, 6);
        let intent = compile(brief);
        with_intent(&intent, || {
            assert_eq!(keywords::extract_keywords(brief, 6), intent.generation_terms);
            assert!(generation_keywords("unrelated text", 6).is_none());
            let _ = std::panic::catch_unwind(|| with_intent(&compile(""), || panic!("probe")));
            assert_eq!(keywords::extract_keywords(brief, 6), intent.generation_terms);
        });
        assert_eq!(keywords::extract_keywords(brief, 6), original);
    }

    #[test]
    fn material_budget_preserves_roles_and_does_not_leak_into_legacy_pages() {
        let brief = "a command line utility that compares JSON responses across API versions";
        let intent = compile(brief);
        with_intent(&intent, || {
            let groups = keywords::brand_root_groups(&intent.generation_terms, 16);
            assert_eq!(groups.first().unwrap(), &vec!["compare".to_string()]);
            assert!(groups.iter().flatten().any(|r| r == "json"));
            assert!(groups.iter().flatten().count() <= 16);
            assert_eq!(compile(brief), intent);
        });
        for variant in [None, Some("concept_pair"), Some("reason"), Some("submorph"), Some("seamblend"), Some("morpheme")] {
            let cfg = crate::style::Config { description: Some(brief.into()), seed: Some(13), count: 4, variant: variant.map(str::to_string), ..Default::default() };
            let before = serde_json::to_string(&crate::generate(&cfg)).unwrap();
            let first = with_intent(&intent, || serde_json::to_string(&crate::generate(&cfg)).unwrap());
            let second = with_intent(&intent, || serde_json::to_string(&crate::generate(&cfg)).unwrap());
            assert_eq!(first, second);
            assert_eq!(before, serde_json::to_string(&crate::generate(&cfg)).unwrap());
        }
    }
}
