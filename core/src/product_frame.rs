//! Small, authored product-benefit inventory. Matches operation AND object
//! sense; never expands every dictionary sense or claims a preference score.
use crate::{semantic::{self, SemanticPlan}, style::{Config, Style}, NameResult};
use rand::{seq::SliceRandom, SeedableRng};
use serde::Serialize;
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize)]
pub struct Anchor { pub word: String, pub sense: String }
#[derive(Debug, Clone, Serialize)]
pub struct Frame {
    pub id: String,
    pub operation: String,
    pub matched_objects: Vec<String>,
    pub benefit: String,
    pub anchors: Vec<Anchor>,
    pub provenance: &'static str,
}
#[derive(Debug, Clone, Serialize)]
pub struct FrameEvidence {
    pub frame_id: String,
    pub benefit: String,
    pub anchor: Anchor,
    pub object_term: Option<String>,
    pub construction: &'static str,
    pub provenance: &'static str,
}

pub fn resolve(plan: &SemanticPlan) -> Option<Frame> {
    if plan.status != "ready" { return None; }
    let operation = &plan.intent.terms.iter().find(|t| t.role == "operation")?.term;
    let objects = &plan.object_phrase.as_ref()?.terms;
    let mut matches = Vec::new();
    for line in include_str!("../data/product_frames.tsv").lines().filter(|l| !l.starts_with('#') && !l.is_empty()) {
        let c: Vec<_> = line.split('\t').collect();
        if c.len() != 5 || !c[1].split(',').any(|w| w == operation) { continue; }
        let matched_objects: Vec<_> = objects.iter().filter(|t| c[2].split(',').any(|w| w == t.term)).map(|t| t.term.clone()).collect();
        if matched_objects.is_empty() { continue; }
        matches.push(Frame { id: c[0].into(), operation: operation.clone(), matched_objects,
            benefit: c[3].into(), anchors: c[4].split(';').filter_map(|s| s.split_once(':'))
                .map(|(word, sense)| Anchor { word: word.into(), sense: sense.into() }).collect(),
            provenance: "editorial-product-frames-v1; not preference-validated" });
    }
    // Abstain instead of resolving conflicting senses by inventory row order.
    (matches.len() == 1).then(|| matches.remove(0))
}

pub fn evidence(plan: &SemanticPlan, name: &str) -> Option<FrameEvidence> {
    let frame = plan.product_frame.as_ref()?;
    let lower = name.to_ascii_lowercase();
    for anchor in &frame.anchors {
        let object = plan.object_phrase.as_ref()?.terms.iter().filter(|t| frame.matched_objects.contains(&t.term)).find(|t|
            t.term != anchor.word && (lower == format!("{}{}", t.term, anchor.word) || lower == format!("{}{}", anchor.word, t.term)));
        if lower == anchor.word || object.is_some() {
            return Some(FrameEvidence { frame_id: frame.id.clone(), benefit: frame.benefit.clone(), anchor: anchor.clone(),
                object_term: object.map(|t| t.term.clone()), construction: if object.is_some() { "complete_words" } else { "whole_metaphor" }, provenance: frame.provenance });
        }
    }
    None
}

/// Replaces only the guided-metaphor family in the opt-in frame experiment.
/// Full words preserve their lexical identity; no clipping or decorative tail.
pub fn generate(plan: &SemanticPlan, cfg: &Config) -> Vec<NameResult> {
    let Some(frame) = &plan.product_frame else { return vec![]; };
    if cfg.style != Style::BigTech || cfg.seed.is_none() || cfg.count == 0 { return vec![]; }
    let mut anchors = frame.anchors.clone();
    let mut rng = rand_chacha::ChaCha8Rng::seed_from_u64(cfg.seed.unwrap());
    anchors.shuffle(&mut rng);
    // A shallow phrase may include adjectives ("repeated alert messages").
    // Only the sense-checked object cues are licensed construction material.
    let phrase = plan.object_phrase.as_ref().unwrap();
    let objects: Vec<_> = if plan.object_relation.is_some() {
        frame.matched_objects.iter().filter_map(|word| phrase.terms.iter().find(|t| &t.term == word)).collect()
    } else {
        phrase.terms.iter().filter(|t| frame.matched_objects.contains(&t.term)).collect()
    };
    let mut names = Vec::new();
    // Interleave anchors before trying another construction: one anchor must
    // not consume the entire family page or its first three letters.
    for index in 0..=objects.len() * 2 {
        for a in &anchors {
            if index == 0 { names.push(crate::capitalize(&a.word)); }
            else {
                let object = &objects[(index - 1) / 2].term;
                if object == &a.word { continue; }
                names.push(if index % 2 == 1 { format!("{}{}", crate::capitalize(object), crate::capitalize(&a.word)) }
                    else { format!("{}{}", crate::capitalize(&a.word), crate::capitalize(object)) });
            }
        }
    }
    let mut seen = HashSet::new();
    let mut results = Vec::new();
    for name in names {
        let lower = name.to_ascii_lowercase();
        crate::diagnostics::record(&lower, "frame.material", "complete_form");
        let syllables = semantic::pronunciation(plan, &name).count;
        let reject = if !seen.insert(lower.clone()) { Some("duplicate") }
            else if lower.len() < cfg.min_len || lower.len() > cfg.max_len { Some("length") }
            else if cfg.exclude.iter().any(|e| e.eq_ignore_ascii_case(&lower)) { Some("excluded") }
            else if cfg.starts_with.as_ref().is_some_and(|s| !lower.starts_with(&s.to_ascii_lowercase())) { Some("starts_with") }
            else if cfg.contains.as_ref().is_some_and(|s| !lower.contains(&s.to_ascii_lowercase())) { Some("contains") }
            else if syllables > 3 { Some("syllable_cap") }
            else if !crate::phonotactics::is_valid(&lower, cfg.style) { Some("phonotactics") }
            else if crate::collision::likely_taken(&lower) { Some("collision_snapshot") } else { None };
        if let Some(reason) = reject { crate::diagnostics::record(&lower, "frame.filter", reason); continue; }
        crate::diagnostics::record(&lower, "frame.rank_input", "eligible");
        if results.len() >= cfg.count.min(24) { crate::diagnostics::record(&lower, "frame.selection", "page_budget"); continue; }
        let e = crate::explain(&name);
        results.push(NameResult { name, style: cfg.style, syllables, score_pronounce: e.score_pronounce,
            score_novelty: e.score_novelty, score_memorability: e.score_memorability, connotations: e.connotations });
    }
    results
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sense_requires_operation_and_object_and_preserves_legacy() {
        assert!(resolve(&semantic::compile("a tool that tracks football scores")).is_none());
        assert!(resolve(&semantic::compile("a tool that restores antique furniture")).is_none());
        assert!(resolve(&semantic::compile("a tool that does not track users")).is_none());
        let p = semantic::compile_product("a tool that tracks memory usage");
        assert_eq!(p.product_frame.as_ref().unwrap().id, "observation");
        assert!(semantic::compile("a tool that tracks memory usage").product_frame.is_none());
        assert!(evidence(&p, "Watchia").is_none());
        let e = evidence(&p, "MemoryWatch").unwrap();
        assert_eq!(e.object_term.as_deref(), Some("memory"));
        assert_eq!(e.anchor.sense, "continued observation");
        let p = semantic::compile_product("a tool that filters repeated alert messages");
        assert!(evidence(&p, "RepeatMesh").is_none());
        assert!(evidence(&p, "AlertMesh").is_some());
    }
    #[test]
    fn complete_forms_repeat_and_respect_constraints() {
        let p = semantic::compile_product("a tool that verifies archive signatures");
        let cfg = Config { seed: Some(13), count: 24, ..Config::default() };
        semantic::with_plan(&p, || {
            let (a, trace) = crate::diagnostics::capture(|| generate(&p, &cfg));
            assert!(!a.is_empty());
            assert!(!trace.is_empty());
            assert_eq!(serde_json::to_string(&a).unwrap(), serde_json::to_string(&generate(&p, &cfg)).unwrap());
            for r in &a {
                assert!(evidence(&p, &r.name).is_some());
                assert_eq!(semantic::evidence(&p, &r.name, None).decision, "qualified");
                assert_eq!(r.syllables, crate::explain(&r.name).syllables);
            }
            let excluded = Config { exclude: a.iter().map(|r| r.name.to_uppercase()).collect(), ..cfg.clone() };
            assert!(generate(&p, &excluded).iter().all(|r| !a.iter().any(|a| a.name == r.name)));
            assert!(generate(&p, &Config { count: 0, ..cfg.clone() }).is_empty());
            assert!(generate(&p, &Config { starts_with: Some("zzzz".into()), ..cfg }).is_empty());
        });
    }
}
