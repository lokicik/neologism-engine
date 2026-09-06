//! Opt-in operation/object material planning. Existing dictionaries supply
//! morphology validation and roots; no new names or semantic edges are added.
use crate::{
    brief_intent::{self, BriefIntent, IntentTerm},
    keywords,
};
use serde::Serialize;
use std::cell::RefCell;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct MaterialRoot {
    pub root: String,
    pub term: String,
    pub source: &'static str,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct RelationPlan {
    pub schema: &'static str,
    pub intent: BriefIntent,
    pub status: &'static str,
    pub reason: Option<&'static str>,
    pub operation: Option<IntentTerm>,
    pub object_head: Option<IntentTerm>,
    pub operation_roots: Vec<MaterialRoot>,
    pub object_roots: Vec<MaterialRoot>,
}

/// Validate inflection candidates against the existing vocabulary. This word
/// list is never added to the generator's material inventory.
fn normalize(surface: &str) -> String {
    let word = surface.to_ascii_lowercase();
    let known = &crate::BigtechStatic::get().common_words;
    let mut candidates = Vec::new();
    if !word.ends_with("ss") {
        if let Some(base) = word.strip_suffix("ies") {
            candidates.push(format!("{base}y"));
        }
        for suffix in ["s", "es", "ing", "ed"] {
            if let Some(base) = word.strip_suffix(suffix) {
                candidates.push(base.to_string());
                if matches!(suffix, "ing" | "ed") {
                    candidates.push(format!("{base}e"));
                }
            }
        }
    }
    candidates
        .into_iter()
        .find(|s| s.len() >= 3 && known.contains(s))
        .unwrap_or(word)
}

pub(crate) fn material(term: &str) -> Vec<MaterialRoot> {
    let mut roots = vec![MaterialRoot {
        root: term.into(),
        term: term.into(),
        source: "brief_literal",
    }];
    for root in keywords::concept_roots(term) {
        roots.push(MaterialRoot {
            root: (*root).into(),
            term: term.into(),
            source: "existing_concept_palette",
        });
    }
    // Only exact recorded associations and fragments valid in both positions.
    // Distributional neighbors and decorative suffixes are not meaning proof.
    for line in include_str!("../data/submorph.tsv")
        .lines()
        .filter(|l| !l.starts_with('#'))
    {
        let c: Vec<&str> = line.split('\t').collect();
        if c.len() >= 6
            && c[1] == "B"
            && c[2] == "meaning"
            && c[0].len() >= 3
            && c[4].split(',').any(|a| {
                a.split_once(':').is_some_and(|(w, weight)| {
                    w == term && weight.parse::<f64>().unwrap_or(0.0) > 0.0
                })
            })
        {
            roots.push(MaterialRoot {
                root: c[0].into(),
                term: term.into(),
                source: "existing_fragment_association",
            });
        }
    }
    let mut seen = std::collections::HashSet::new();
    roots.retain(|r| r.root.len() >= 3 && seen.insert(r.root.clone()));
    roots.truncate(8);
    roots
}

pub fn compile(description: &str) -> RelationPlan {
    compile_intent(description, brief_intent::compile(description))
}

pub(crate) fn compile_intent(description: &str, mut intent: BriefIntent) -> RelationPlan {
    let mut reason = intent.fallback_reason;
    if intent.status == "parsed" {
        for term in &mut intent.terms {
            if term.role != "operation" {
                term.term = normalize(&term.surface);
            }
        }
    }
    let operation = intent.terms.iter().find(|t| t.role == "operation").cloned();
    let objects: Vec<_> = intent
        .terms
        .iter()
        .filter(|t| t.role == "object")
        .cloned()
        .collect();
    // The head precedes an of/in/on/with complement when present. All object
    // terms remain recorded and the budget starts with the head, not adjectives.
    let complement = objects
        .first()
        .zip(objects.last())
        .and_then(|(first, last)| {
            let slice = &description[first.start..last.end];
            slice
                .split_inclusive(|c: char| !c.is_ascii_alphabetic())
                .scan(first.start, |offset, token| {
                    let start = *offset;
                    *offset += token.len();
                    Some((start, token.trim().to_ascii_lowercase()))
                })
                .find(|(_, w)| matches!(w.as_str(), "of" | "in" | "on" | "with"))
                .map(|(start, _)| start)
        });
    let head = objects
        .iter()
        .filter(|t| complement.is_none_or(|end| t.end <= end))
        .next_back()
        .cloned();
    let coordinated = objects
        .first()
        .zip(objects.last())
        .is_some_and(|(first, last)| {
            description[first.start..last.end]
                .split(|c: char| !c.is_ascii_alphabetic())
                .any(|w| matches!(w.to_ascii_lowercase().as_str(), "and" | "or"))
        });
    if coordinated
        || objects
            .iter()
            .any(|t| brief_intent::action(&t.surface.to_ascii_lowercase()).is_some())
    {
        reason = Some("multiple_operations_require_interpretation");
    }
    if operation.is_none() || head.is_none() {
        reason = reason.or(Some("missing_operation_or_object"));
    }
    let operation_roots = operation
        .as_ref()
        .map(|o| material(&o.term))
        .unwrap_or_default();
    let object_roots = head.as_ref().map(|o| material(&o.term)).unwrap_or_default();
    if reason.is_none() {
        intent.generation_terms.clear();
        for term in operation.iter().chain(head.iter()).chain(objects.iter()) {
            if intent.generation_terms.len() < 6 && !intent.generation_terms.contains(&term.term) {
                intent.generation_terms.push(term.term.clone());
            }
        }
    }
    RelationPlan {
        schema: "operation-object-plan-v1",
        intent,
        status: if reason.is_none() {
            "ready"
        } else {
            "unresolved"
        },
        reason,
        operation,
        object_head: head,
        operation_roots,
        object_roots,
    }
}

thread_local! { static ACTIVE: RefCell<Option<RelationPlan>> = const { RefCell::new(None) }; }
pub fn with_plan<T>(plan: &RelationPlan, run: impl FnOnce() -> T) -> T {
    struct Restore(Option<RelationPlan>);
    impl Drop for Restore {
        fn drop(&mut self) {
            ACTIVE.with(|a| *a.borrow_mut() = self.0.take());
        }
    }
    let _restore = Restore(ACTIVE.with(|a| a.replace(Some(plan.clone()))));
    brief_intent::with_intent(&plan.intent, run)
}

pub(crate) fn root_groups(terms: &[String], limit: usize) -> Option<Vec<Vec<String>>> {
    ACTIVE.with(|active| {
        active
            .borrow()
            .as_ref()
            .filter(|p| p.status == "ready" && p.intent.generation_terms == terms)
            .map(|p| {
                [&p.operation_roots, &p.object_roots]
                    .iter()
                    .map(|roots| {
                        roots
                            .iter()
                            .take(limit / 2)
                            .map(|r| r.root.clone())
                            .collect()
                    })
                    .collect()
            })
    })
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct RootMatch {
    pub material: MaterialRoot,
    pub start: usize,
    pub end: usize,
}
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct RelationEvidence {
    pub name: String,
    pub operation: Vec<RootMatch>,
    pub object: Vec<RootMatch>,
    pub decision: &'static str,
}

/// Full edge-anchored roots, with disjoint spans: a shared substring cannot
/// prove two roles. This is lexical evidence, not a semantic or aesthetic score.
pub fn evidence(plan: &RelationPlan, name: &str) -> RelationEvidence {
    let lower = name.to_ascii_lowercase();
    let matches = |roots: &[MaterialRoot]| {
        roots
            .iter()
            .flat_map(|root| {
                let mut found = Vec::new();
                if lower.starts_with(&root.root) {
                    found.push(RootMatch {
                        material: root.clone(),
                        start: 0,
                        end: root.root.len(),
                    });
                }
                if lower.ends_with(&root.root) {
                    found.push(RootMatch {
                        material: root.clone(),
                        start: lower.len() - root.root.len(),
                        end: lower.len(),
                    });
                }
                found
            })
            .collect::<Vec<_>>()
    };
    let operation = matches(&plan.operation_roots);
    let object = matches(&plan.object_roots);
    let decision = if plan.status != "ready" {
        "relation_unresolved"
    } else if operation.is_empty() {
        "missing_operation_link"
    } else if object.is_empty() {
        "missing_object_link"
    } else if !operation
        .iter()
        .any(|a| object.iter().any(|b| a.end <= b.start || b.end <= a.start))
    {
        "overlapping_role_links"
    } else {
        "linked"
    };
    RelationEvidence {
        name: name.into(),
        operation,
        object,
        decision,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validated_morphology_and_object_head_survive_budget() {
        for (surface, base) in [
            ("sizes", "size"),
            ("boxes", "box"),
            ("services", "service"),
            ("rendered", "render"),
        ] {
            assert_eq!(normalize(surface), base);
        }
        let p = compile("a browser utility that explains accessibility failures in rendered forms");
        assert_eq!(p.object_head.unwrap().term, "failure");
        assert!(p.intent.generation_terms.contains(&"form".into()));
        let p = compile("a tool that verifies checksums of downloadable binaries");
        assert_eq!(p.object_head.unwrap().term, "checksum");
        assert!(!p.intent.generation_terms.contains(&"package".into()));
    }
    #[test]
    fn requires_separate_full_role_links() {
        let p = compile("a tool that verifies checksums before release");
        assert_eq!(evidence(&p, "Verchecksum").decision, "linked");
        assert_eq!(evidence(&p, "Verifyia").decision, "missing_object_link");
        assert_eq!(
            evidence(&p, "Stackforge").decision,
            "missing_operation_link"
        );
        assert_eq!(
            evidence(&p, "Overchecksum").decision,
            "missing_operation_link"
        );
        let p = compile("a tool that maps maps");
        assert_ne!(evidence(&p, "Map").decision, "linked");
        let mut p = compile("a tool that maps outlines");
        p.object_roots = p.operation_roots.clone();
        assert_eq!(evidence(&p, "Map").decision, "overlapping_role_links");
        assert_eq!(
            compile("a tool that checks licenses and certificates").status,
            "unresolved"
        );
        assert_eq!(
            evidence(&compile("a tool that does not track users"), "Trackuser").decision,
            "relation_unresolved"
        );
    }
    #[test]
    fn scopes_restore_on_panic_and_preserve_original_reader() {
        let brief = "a build tool that compares executable sizes between release tags";
        let original = brief_intent::compile(brief);
        let p = compile(brief);
        with_plan(&p, || {
            assert_eq!(
                keywords::extract_keywords(brief, 6),
                p.intent.generation_terms
            );
            assert!(keywords::brand_root_groups(&p.intent.generation_terms, 16)
                .iter()
                .flatten()
                .any(|r| r == "size"));
            let _ = std::panic::catch_unwind(|| with_plan(&compile(""), || panic!("probe")));
            assert_eq!(
                keywords::extract_keywords(brief, 6),
                p.intent.generation_terms
            );
        });
        assert_eq!(brief_intent::compile(brief), original);
    }
}
