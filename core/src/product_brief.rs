//! Product-specific grammar and compositional material. Historical compilers
//! stay callable; all spans refer to the original brief, never rewritten text.
use crate::{brief_intent::{self, IntentTerm}, relation::{self, MaterialRoot}, semantic::{self, SemanticPlan}};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ObjectRelation {
    pub subject: IntentTerm,
    pub property: IntentTerm,
    pub supporting_terms: Vec<IntentTerm>,
    pub provenance: &'static str,
}

fn canonical_action(word: &str) -> Option<&'static str> {
    let root = brief_intent::action(word).or_else(|| {
        ["recover", "map", "group", "filter", "compare", "measure", "verify", "restore", "monitor", "validate"].into_iter().find(|base| {
            let stem = base.strip_suffix('e').unwrap_or(base);
            word == *base || word == format!("{base}s") || word == format!("{stem}ing")
                || word == format!("{stem}ed") || (*base == "map" && matches!(word, "mapping" | "mapped"))
        })
    })?;
    // These are narrow operation aliases, not unconditional synonym expansion.
    Some(match root { "recover" => "restore", "validate" => "verify", "monitor" => "track", other => other })
}

pub fn compile(description: &str) -> SemanticPlan {
    let intent = brief_intent::compile_with_actions(description, canonical_action);
    let mut plan = semantic::from_relation(description, relation::compile_intent(description, intent));
    if plan.status != "ready" { return plan; }
    // Catch an additional known action even when the old action vocabulary
    // cannot recognize its alias. Negation is already handled by the parser.
    if plan.object_phrase.as_ref().is_some_and(|p| p.terms.iter().any(|t| canonical_action(&t.surface.to_ascii_lowercase()).is_some())) {
        plan.status = "unresolved";
        plan.reason = Some("multiple_operations_require_interpretation");
        return plan;
    }
    plan.product_frame = crate::product_frame::resolve(&plan);
    let Some(frame) = plan.product_frame.as_mut() else { return plan; };
    let phrase = plan.object_phrase.as_ref().unwrap();
    let mut relations = Vec::new();
    for line in include_str!("../data/object_relations.tsv").lines().filter(|l| !l.starts_with('#') && !l.is_empty()) {
        let c: Vec<_> = line.split('\t').collect();
        if c.len() != 3 || c[0] != frame.id { continue; }
        let subject = phrase.terms.iter().find(|t| t.term == c[1]);
        let property = phrase.terms.iter().find(|t| t.term == c[2]);
        if let (Some(subject), Some(property)) = (subject, property) {
            let (first, last) = if subject.start < property.start { (subject, property) } else { (property, subject) };
            let between = description[first.end..last.start].trim().to_ascii_lowercase();
            // Direct noun compounds or property-of-subject only. Cooccurrence
            // across another clause is not evidence of a noun relation.
            if between.is_empty() || between == "-" || (between == "of" && property.start < subject.start) {
                let supporting_terms = phrase.terms.iter().filter(|t| t.start != subject.start && t.start != property.start).cloned().collect();
                relations.push(ObjectRelation { subject: subject.clone(), property: property.clone(), supporting_terms, provenance: "editorial-object-relations-v1" });
            }
        }
    }
    if relations.len() == 1 {
        let relation = relations.remove(0);
        frame.matched_objects = vec![relation.subject.term.clone(), relation.property.term.clone()];
        // Canonical ordering stabilizes the material budget without erasing
        // original phrase order or its spans from the evidence.
        let operation = frame.operation.clone();
        // Naming material represents the identified product relation. Other
        // phrase words remain explicit supporting evidence, not extra roots
        // (e.g. damaged archives must not produce damage-derived brand names).
        plan.intent.generation_terms = vec![operation, relation.subject.term.clone(), relation.property.term.clone()];
        plan.object_relation = Some(relation);
    }
    // Put benefit roots into the SAME scoped material consumed by the existing
    // blend families. Keep the literal action and existing per-term budget.
    let mut material = Vec::new();
    for term in &plan.intent.generation_terms {
        let existing = relation::material(term);
        material.extend(existing.iter().take(1).cloned());
        if term == &frame.operation {
            material.extend(frame.anchors.iter().map(|a| MaterialRoot { root: a.word.clone(), term: term.clone(), source: "product_benefit" }));
        }
        for root in existing.into_iter().skip(1) {
            if !material.iter().any(|m: &MaterialRoot| m.term == root.term && m.root == root.root) { material.push(root); }
        }
    }
    plan.material = material;
    plan
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn aliases_and_property_phrases_preserve_evidence_and_material() {
        let protocol: serde_json::Value = serde_json::from_str(include_str!("../../research/product-brief/protocol.json")).unwrap();
        for pair in protocol["paraphrases"].as_array().unwrap() {
            let a = compile(pair[0].as_str().unwrap());
            let b = compile(pair[1].as_str().unwrap());
            assert_eq!(a.status, "ready", "{}", a.intent.description);
            assert_eq!(b.status, "ready", "{}", b.intent.description);
            assert_eq!(a.intent.generation_terms, b.intent.generation_terms);
            assert_eq!(a.material, b.material);
            assert_eq!(a.product_frame.as_ref().unwrap().matched_objects, b.product_frame.as_ref().unwrap().matched_objects);
            let cfg = crate::style::Config { seed: Some(13), count: 24, ..crate::style::Config::default() };
            let generate = |p: &SemanticPlan| semantic::with_plan(p, || crate::product_frame::generate(p, &cfg));
            assert_eq!(serde_json::to_string(&generate(&a)).unwrap(), serde_json::to_string(&generate(&b)).unwrap());
            for p in [&a, &b] {
                for t in &p.intent.terms { assert_eq!(&p.intent.description[t.start..t.end], t.surface); }
                let phrase = p.object_phrase.as_ref().unwrap();
                assert_eq!(&p.intent.description[phrase.start..phrase.end], phrase.surface);
            }
        }
        assert_eq!(semantic::compile_product("a tool that recovers files").status, "unresolved");
    }
    #[test]
    fn unsupported_senses_and_negation_do_not_gain_benefit_material() {
        for brief in ["a tool that recovers antique furniture", "a tool that monitors football scores", "a tool that does not recover files", "a tool that recovers files and deletes archives", "a tool that measures query latency without tracking users"] {
            assert!(compile(brief).product_frame.is_none(), "{brief}");
        }
        let p = compile("a tool that measures latency during query tests");
        assert!(p.object_relation.is_none());
        let p = compile("a utility that recovers damaged archive entries from replicas");
        assert_eq!(p.intent.generation_terms, ["restore", "archive", "entry"]);
        assert_eq!(p.object_relation.as_ref().unwrap().supporting_terms.iter().map(|t| t.term.as_str()).collect::<Vec<_>>(), ["damage", "replica"]);
        assert!(p.object_phrase.as_ref().unwrap().surface.contains("damaged"));
    }
    #[test]
    fn blend_material_is_scoped_and_not_a_decorative_suffix_license() {
        let p = compile("a tool that measures query latency");
        semantic::with_plan(&p, || {
            let groups = crate::keywords::brand_root_groups(&p.intent.generation_terms, 16);
            assert!(groups[0].contains(&"gauge".into()));
            assert_eq!(crate::keywords::guided_pair_root_groups(&p.intent.generation_terms, 16), groups);
            assert!(semantic::evidence(&p, "Gaugeia", None).tier.is_none());
            semantic::record_construction("Quauge", &["query", "gauge"]);
            let e = semantic::evidence(&p, "Quauge", None);
            assert_eq!(e.decision, "qualified");
            assert!(e.links.iter().any(|l| l.method == "benefit_construction"));
        });
        assert!(semantic::evidence(&p, "Quauge", None).tier.is_none());
        assert!(semantic::benefit_root_groups(&p.intent.generation_terms, 16).is_none());
    }
}
