//! Meaning-first Lab scope. Roles survive generation and selection; legacy
//! exports remain unchanged. No added vocabulary or learned aesthetic score.
use crate::{brief_intent::{self, BriefIntent, IntentTerm}, phonology, relation::{self, MaterialRoot}, reason::ReasonDecode};
use serde::Serialize;
use std::{cell::RefCell, collections::BTreeMap};

#[derive(Debug, Clone, Serialize)]
pub struct ObjectPhrase {
    pub surface: String,
    pub start: usize,
    pub end: usize,
    pub terms: Vec<IntentTerm>,
}
#[derive(Debug, Clone, Serialize)]
pub struct SemanticPlan {
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub check_retained_fragments: bool,
    pub schema: &'static str,
    pub intent: BriefIntent,
    pub status: &'static str,
    pub reason: Option<&'static str>,
    pub object_phrase: Option<ObjectPhrase>,
    pub material: Vec<MaterialRoot>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub product_frame: Option<crate::product_frame::Frame>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub object_relation: Option<crate::product_brief::ObjectRelation>,
}

pub fn compile(description: &str) -> SemanticPlan {
    from_relation(description, relation::compile(description))
}

pub(crate) fn from_relation(description: &str, base: relation::RelationPlan) -> SemanticPlan {
    let mut intent = base.intent;
    let objects: Vec<_> = intent.terms.iter().filter(|t| t.role == "object").cloned().collect();
    let phrase = objects.first().zip(objects.last()).map(|(a, b)| ObjectPhrase {
        surface: description[a.start..b.end].into(), start: a.start, end: b.end, terms: objects.clone(),
    });
    // Keep the complete noun phrase. Never silently drop its distinguishing
    // modifier to fit the existing six-term generator budget.
    let mut terms: Vec<String> = intent.terms.iter().filter(|t| matches!(t.role, "operation" | "object"))
        .map(|t| t.term.clone()).collect();
    let mut seen = std::collections::HashSet::new();
    terms.retain(|t| seen.insert(t.clone()));
    let reason = base.reason.or((terms.len() > 6).then_some("object_phrase_exceeds_budget"));
    intent.generation_terms = terms;
    let material = intent.generation_terms.iter().flat_map(|t| relation::material(t)).collect();
    SemanticPlan { check_retained_fragments: false, schema: "meaning-first-plan-v1", intent, status: if reason.is_none() { "ready" } else { "unresolved" }, reason, object_phrase: phrase, material, product_frame: None, object_relation: None }
}

pub fn compile_product(description: &str) -> SemanticPlan {
    let mut plan = compile(description);
    plan.product_frame = crate::product_frame::resolve(&plan);
    plan
}

#[derive(Clone)]
struct Scope { plan: SemanticPlan, constructions: BTreeMap<String, Vec<String>>, cuts: BTreeMap<String, crate::retained::Construction> }
thread_local! { static ACTIVE: RefCell<Option<Scope>> = const { RefCell::new(None) }; }
pub fn with_plan<T>(plan: &SemanticPlan, run: impl FnOnce() -> T) -> T {
    struct Restore(Option<Scope>);
    impl Drop for Restore { fn drop(&mut self) { ACTIVE.with(|s| *s.borrow_mut() = self.0.take()); } }
    let _restore = Restore(ACTIVE.with(|s| s.replace(Some(Scope { plan: plan.clone(), constructions: BTreeMap::new(), cuts: BTreeMap::new() }))));
    brief_intent::with_intent(&plan.intent, run)
}

pub(crate) fn root_groups(terms: &[String], limit: usize) -> Option<Vec<Vec<String>>> {
    ACTIVE.with(|s| {
        let s = s.borrow();
        let p = &s.as_ref()?.plan;
        if p.status != "ready" || p.intent.generation_terms != terms { return None; }
        let cap = limit / terms.len().max(1);
        Some(terms.iter().map(|t| p.material.iter().filter(|m| &m.term == t).take(cap).map(|m| m.root.clone()).collect()).collect())
    })
}

/// An explicit benefit plan owns its material budget. A downstream producer
/// must not fill these groups with untyped distributional neighbors.
pub(crate) fn benefit_root_groups(terms: &[String], limit: usize) -> Option<Vec<Vec<String>>> {
    let bounded = ACTIVE.with(|s| s.borrow().as_ref().is_some_and(|s| s.plan.material.iter().any(|m| m.source == "product_benefit")));
    if bounded { root_groups(terms, limit) } else { None }
}

fn role<'a>(plan: &'a SemanticPlan, word: &str) -> Option<&'a str> {
    plan.intent.terms.iter().find(|t| t.term == word || t.surface.eq_ignore_ascii_case(word)).map(|t| t.role)
}
// Lexicographic role priority, before the existing Reason score. No new
// aesthetic weights; contextual evidence cannot beat the product's operation.
pub(crate) fn reason_priority(description: Option<&str>, chain: &[String]) -> u8 {
    ACTIVE.with(|s| s.borrow().as_ref().filter(|s| s.plan.status == "ready" && Some(s.plan.intent.description.as_str()) == description)
        .map_or(0, |s| match chain.first().and_then(|w| role(&s.plan, w)) {
            Some("operation") => 0, Some("object") => 1, Some("condition") => 2, _ => 3,
        }))
}

/// Actual accepted generator construction, not inferred substring ancestry.
pub(crate) fn record_construction(name: &str, words: &[&str]) {
    ACTIVE.with(|s| { if let Some(s) = s.borrow_mut().as_mut() {
        s.constructions.entry(name.to_ascii_lowercase()).or_insert_with(|| words.iter().map(|w| w.to_string()).collect());
    }});
}

pub(crate) fn record_cuts(name: &str, a: &str, b: &str, left_end: usize, right_start: usize, shared_phonemes: usize) {
    ACTIVE.with(|s| { if let Some(s) = s.borrow_mut().as_mut().filter(|s| s.plan.check_retained_fragments) {
        s.cuts.entry(name.to_ascii_lowercase()).or_insert_with(|| crate::retained::construction(a, b, left_end, right_start, shared_phonemes));
    }});
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PronunciationEvidence {
    pub count: usize,
    pub source: &'static str,
    pub components: Vec<String>,
}
fn dictionary_count(word: &str) -> Option<usize> {
    phonology::lexicon_pronounce(word).map(|p| p.iter().filter(|p| p.is_vowel()).count())
}
pub fn pronunciation(plan: &SemanticPlan, name: &str) -> PronunciationEvidence {
    let lower = name.to_ascii_lowercase();
    if let Some(count) = dictionary_count(&lower) {
        return PronunciationEvidence { count, source: "dictionary", components: vec![lower] };
    }
    let mut parses = Vec::new();
    if let Some(e) = crate::product_frame::evidence(plan, name) {
        if let Some(object) = &e.object_term {
            if let (Some(a), Some(b)) = (dictionary_count(&e.anchor.word), dictionary_count(object)) {
                return PronunciationEvidence { count: a + b, source: "dictionary_components", components:
                    if lower.starts_with(object) { vec![object.clone(), e.anchor.word] } else { vec![e.anchor.word, object.clone()] } };
            }
        }
    }
    for a in &plan.material {
        if let Some(b) = lower.strip_prefix(&a.root).filter(|b| !b.is_empty()) {
            if plan.material.iter().any(|m| m.root == b) {
                if let (Some(ac), Some(bc)) = (dictionary_count(&a.root), dictionary_count(b)) {
                    parses.push((ac + bc, vec![a.root.clone(), b.to_string()]));
                }
            }
        }
    }
    if let Some((count, parts)) = parses.first() {
        if parses.iter().all(|(n, _)| n == count) {
            return PronunciationEvidence { count: *count, source: "dictionary_components", components: parts.clone() };
        }
    }
    PronunciationEvidence { count: crate::phonotactics::letter_syllable_count(&lower), source: if parses.is_empty() { "letter_estimate" } else { "ambiguous_components" }, components: vec![] }
}
pub(crate) fn known_syllables(name: &str) -> Option<usize> {
    ACTIVE.with(|s| {
        let s = s.borrow();
        let p = &s.as_ref()?.plan;
        if p.status != "ready" { return None; }
        let evidence = pronunciation(p, name);
        matches!(evidence.source, "dictionary" | "dictionary_components").then_some(evidence.count)
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct SemanticLink {
    pub term: String,
    pub role: String,
    pub method: &'static str,
    pub material: String,
    pub start: Option<usize>,
    pub end: Option<usize>,
}
#[derive(Debug, Clone, Serialize)]
pub struct SemanticEvidence {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retained_construction: Option<crate::retained::Construction>,
    pub name: String,
    pub links: Vec<SemanticLink>,
    pub object_terms: Vec<String>,
    pub covered_object_terms: Vec<String>,
    pub tier: Option<u8>,
    pub decision: &'static str,
    pub pronunciation: PronunciationEvidence,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub product_frame: Option<crate::product_frame::FrameEvidence>,
}

pub fn evidence(plan: &SemanticPlan, name: &str, reason: Option<&ReasonDecode>) -> SemanticEvidence {
    let lower = name.to_ascii_lowercase();
    let construction = ACTIVE.with(|s| s.borrow().as_ref().and_then(|s| s.constructions.get(&lower).cloned())).unwrap_or_default();
    let retained = if plan.check_retained_fragments {
        ACTIVE.with(|s| s.borrow().as_ref().and_then(|s| s.cuts.get(&lower).cloned())).map(|c| crate::retained::assess(c, plan))
    } else { None };
    let mut links = Vec::new();
    let product_frame = crate::product_frame::evidence(plan, name);
    if let Some(e) = &product_frame {
        let frame = plan.product_frame.as_ref().unwrap();
        links.push(SemanticLink { term: frame.operation.clone(), role: "operation".into(), method: "product_benefit", material: e.anchor.word.clone(), start: None, end: None });
        if let Some(term) = &e.object_term {
            links.push(SemanticLink { term: term.clone(), role: "object".into(), method: "complete_word", material: term.clone(), start: None, end: None });
        }
    }
    for m in &plan.material {
        let Some(role) = role(plan, &m.term) else { continue; };
        let edge = lower.starts_with(&m.root) || lower.ends_with(&m.root);
        let built = construction.contains(&m.root);
        if plan.check_retained_fragments && built {
            // Missing cuts abstain: ancestral words alone cannot qualify a blend.
            if let Some(c) = &retained {
                for part in c.parts.iter().filter(|p| p.parent == m.root && p.status != "unattested_fragment") {
                    links.push(SemanticLink { term: m.term.clone(), role: role.into(),
                        method: if m.source == "existing_concept_palette" { "palette_clue" } else { part.status },
                        material: part.fragment.clone(), start: Some(part.start), end: Some(part.end) });
                }
            }
            continue;
        }
        if edge || built {
            let start = (!built).then(|| if lower.starts_with(&m.root) { 0 } else { lower.len() - m.root.len() });
            links.push(SemanticLink { term: m.term.clone(), role: role.into(),
                method: if m.source == "product_benefit" { if built { "benefit_construction" } else { "benefit_word" } }
                    else if m.source == "existing_concept_palette" { "palette_clue" }
                    else if built { "generator_material" }
                    else if m.source == "brief_literal" { "literal" } else { "fragment_association" }, material: m.root.clone(), start, end: start.map(|s| s + m.root.len()) });
        }
    }
    // Only direct recorded Reason links count as a metaphor anchor. Coined
    // strings and indirect distributional paths need independent lexical links.
    let metaphor = reason.filter(|r| r.kind != "coined" && r.chain.len() == 1)
        .and_then(|r| r.chain.first()).and_then(|w| plan.intent.terms.iter().find(|t| t.term == *w || t.surface.eq_ignore_ascii_case(w)));
    if let Some(t) = metaphor {
        links.push(SemanticLink { term: t.term.clone(), role: t.role.into(), method: "direct_metaphor", material: name.into(), start: None, end: None });
    }
    let strong = |l: &&SemanticLink| l.method != "palette_clue";
    let operation = links.iter().filter(strong).any(|l| l.role == "operation");
    let object_terms: Vec<String> = plan.object_phrase.as_ref().map(|p| p.terms.iter().map(|t| t.term.clone()).collect()).unwrap_or_default();
    let independent = |a: &SemanticLink, b: &SemanticLink| match (a.start, a.end, b.start, b.end) {
        (Some(a), Some(ae), Some(b), Some(be)) => ae <= b || be <= a,
        _ => a.method == "direct_metaphor" || a.material != b.material,
    };
    let covered: Vec<String> = object_terms.iter().filter(|t| links.iter().filter(strong).any(|l| l.role == "object" && &l.term == *t
        && links.iter().filter(strong).any(|a| a.role == "operation" && independent(a, l)))).cloned().collect();
    let direct_metaphor = links.iter().any(|l| l.role == "operation" && l.method == "direct_metaphor");
    let tier = if plan.status != "ready" || !operation { None }
        else if !object_terms.is_empty() && covered.len() == object_terms.len() { Some(0) }
        else if !covered.is_empty() { Some(1) }
        else if direct_metaphor || product_frame.is_some() { Some(2) } else { None };
    let decision = if plan.status != "ready" { "meaning_unresolved" }
        else if tier.is_none() && retained.as_ref().is_some_and(|c| c.parts.iter().any(|p| p.status == "unattested_fragment")) { "unattested_fragment" }
        else if !operation { "missing_operation_evidence" }
        else if tier.is_none() { "missing_object_evidence" } else { "qualified" };
    SemanticEvidence { retained_construction: retained, name: name.into(), links, object_terms, covered_object_terms: covered, tier, decision, pronunciation: pronunciation(plan, name), product_frame }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn phrase_and_scope_preserve_roles_and_restore() {
        let p = compile("a terminal tool that tracks memory usage during test runs");
        assert_eq!(p.status, "ready");
        assert_eq!(p.object_phrase.as_ref().unwrap().surface, "memory usage");
        assert_eq!(p.intent.generation_terms, ["track", "memory", "usage"]);
        let desc = Some(p.intent.description.as_str());
        with_plan(&p, || {
            assert!(reason_priority(desc, &["tracks".into()]) < reason_priority(desc, &["test".into()]));
            assert_eq!(reason_priority(Some("different brief"), &["test".into()]), 0);
            let _ = std::panic::catch_unwind(|| with_plan(&compile(""), || panic!("restore")));
            assert_eq!(reason_priority(desc, &["test".into()]), 2);
        });
        assert_eq!(reason_priority(desc, &["test".into()]), 0);
    }
    #[test]
    fn dictionary_correction_keeps_three_syllable_boundary_and_unknowns() {
        for (brief, name, count) in [
            ("a tool that compares executable sizes", "comparesize", 3),
            ("a tool that checks dependency licenses", "checklicense", 3),
            ("a tool that tracks memory usage", "trackusage", 3),
            ("a tool that groups log messages", "groupmessage", 3),
            ("a tool that verifies configuration files", "verifyfile", 4),
        ] {
            let p = compile(brief);
            let original = crate::phonotactics::syllable_count(name);
            with_plan(&p, || {
                assert_eq!(known_syllables(name), Some(count), "{name}");
                assert_eq!(crate::phonotactics::syllable_count(name), count);
                assert_eq!(known_syllables("zaxyqul"), None);
            });
            assert_eq!(crate::phonotactics::syllable_count(name), original);
        }
    }
    #[test]
    fn metaphor_and_recorded_blend_survive_without_literal_both_roots() {
        let p = compile("a terminal tool that tracks memory usage during test runs");
        let mut r = ReasonDecode { name: "Izci".into(), kind: "foreign".into(), origin: "Turkish".into(), gloss: "scout".into(), chain: vec!["tracks".into()], taken: false };
        assert_eq!(evidence(&p, "Izci", Some(&r)).tier, Some(2));
        r.chain = vec!["test".into()];
        assert_eq!(evidence(&p, "Mihenk", Some(&r)).tier, None);
        assert_eq!(evidence(&p, "Trackia", None).decision, "missing_object_evidence");
        with_plan(&p, || {
            record_construction("Metrack", &["memory", "track"]);
            let e = evidence(&p, "Metrack", None);
            assert_eq!(e.tier, Some(1));
            assert_eq!(e.covered_object_terms, ["memory"]);
        });
        assert!(evidence(&p, "Metrack", None).tier.is_none());
    }
    #[test]
    fn unresolved_input_does_not_silently_drop_object_or_negation() {
        for brief in ["", "a tool that does not track users", "a tool that compares rows and deletes tables", "a tool that tracks alpha beta gamma delta epsilon zeta eta"] {
            let p = compile(brief);
            assert_eq!(p.status, "unresolved", "{brief}");
            assert_eq!(evidence(&p, "TrackUsage", None).decision, "meaning_unresolved");
        }
    }
    #[test]
    fn same_letters_cannot_prove_two_roles() {
        let mut p = compile("a tool that tracks memory usage");
        p.material = vec![
            MaterialRoot { root: "track".into(), term: "track".into(), source: "brief_literal" },
            MaterialRoot { root: "track".into(), term: "memory".into(), source: "existing_fragment_association" },
        ];
        assert!(evidence(&p, "Track", None).tier.is_none());
    }
}
