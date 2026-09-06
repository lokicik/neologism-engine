//! Exact generator cuts and existing, position-aware fragment attestations.
//! A source word is provenance, not proof that its clipped letters carry it.
use crate::semantic::SemanticPlan;
use serde::Serialize;

pub fn compile(description: &str) -> SemanticPlan {
    let mut p = crate::product_brief::compile(description);
    p.check_retained_fragments = true;
    p
}

#[derive(Debug, Clone, Serialize)]
pub struct Part {
    pub parent: String,
    pub fragment: String,
    pub source_start: usize,
    pub source_end: usize,
    pub start: usize,
    pub end: usize,
    pub status: &'static str,
    pub associations: Vec<String>,
}
#[derive(Debug, Clone, Serialize)]
pub struct Construction {
    pub method: &'static str,
    pub shared_phonemes: usize,
    pub parts: Vec<Part>,
}

pub(crate) fn construction(a: &str, b: &str, left_end: usize, right_start: usize, shared_phonemes: usize) -> Construction {
    Construction { method: if shared_phonemes == 0 { "syllable_splice" } else { "phoneme_overlap" }, shared_phonemes,
        parts: vec![
            Part { parent: a.into(), fragment: a[..left_end].into(), source_start: 0, source_end: left_end, start: 0, end: left_end, status: "unchecked", associations: vec![] },
            Part { parent: b.into(), fragment: b[right_start..].into(), source_start: right_start, source_end: b.len(), start: left_end, end: left_end + b.len() - right_start, status: "unchecked", associations: vec![] },
        ] }
}

pub(crate) fn assess(mut c: Construction, plan: &SemanticPlan) -> Construction {
    for (index, part) in c.parts.iter_mut().enumerate() {
        if part.fragment == part.parent { part.status = "whole_parent"; continue; }
        // Exact links only. Existing concept palettes cannot license a new
        // sense transitively; quality tails never count as meaning evidence.
        let mut targets = vec![part.parent.as_str()];
        targets.extend(plan.material.iter().filter(|m| m.root == part.parent && m.source != "existing_concept_palette").map(|m| m.term.as_str()));
        for line in include_str!("../data/submorph.tsv").lines().filter(|l| !l.starts_with('#')) {
            let cols: Vec<_> = line.split('\t').collect();
            if cols.len() < 6 || cols[0] != part.fragment || cols[2] != "meaning"
                || !(cols[1] == "B" || cols[1] == if index == 0 { "H" } else { "T" }) { continue; }
            for item in cols[4].split(',') {
                if let Some((word, weight)) = item.split_once(':') {
                    if targets.contains(&word) && weight.parse::<f64>().unwrap_or(0.0) > 0.0 { part.associations.push(word.into()); }
                }
            }
        }
        part.associations.sort(); part.associations.dedup();
        part.status = if part.associations.is_empty() { "unattested_fragment" } else { "attested_fragment" };
    }
    c
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_association_and_position_required_without_length_threshold() {
        let p = compile("a tool that verifies archive signatures");
        let c = assess(construction("signature", "proof", 3, 0, 0), &p);
        assert_eq!(c.parts[0].status, "attested_fragment");
        assert_eq!(c.parts[0].associations, ["signature"]);
        let p = compile("a tool that checks manifest hashes");
        assert_eq!(assess(construction("manifest", "check", 2, 0, 0), &p).parts[0].status, "unattested_fragment");
        assert_eq!(assess(construction("prism", "message", 3, 0, 0), &p).parts[0].status, "unattested_fragment");
        // 'pri' is licensed for pristine at the head, not for prism or tails.
        assert_eq!(assess(construction("pristine", "check", 3, 0, 0), &p).parts[0].status, "attested_fragment");
        assert_eq!(assess(construction("check", "pristine", 5, 0, 0), &p).parts[1].status, "whole_parent");
        let mut tail = construction("check", "pristine", 5, 0, 0);
        tail.parts[1].fragment = "pri".into();
        assert_eq!(assess(tail, &p).parts[1].status, "unattested_fragment");
    }

    #[test]
    fn retained_evidence_does_not_inherit_meaning_from_an_ancestral_word() {
        use crate::semantic::{self, evidence};
        for (brief, name, a, b, end, decision) in [
            ("a tool that checks manifest hashes", "macheck", "manifest", "check", 2, "unattested_fragment"),
            ("a tool that verifies archive signatures", "sigproof", "signature", "proof", 3, "qualified"),
            ("a tool that filters alert messages", "primessage", "prism", "message", 3, "unattested_fragment"),
        ] {
            let old = crate::product_brief::compile(brief);
            semantic::with_plan(&old, || {
                semantic::record_construction(name, &[a,b]);
                assert_eq!(evidence(&old, name, None).decision, "qualified");
            });
            let p = compile(brief);
            semantic::with_plan(&p, || {
                semantic::record_construction(name, &[a,b]);
                assert!(evidence(&p, name, None).retained_construction.is_none());
                semantic::record_cuts(name, a, b, end, 0, 0);
                let e = evidence(&p, name, None);
                assert_eq!(e.decision, decision, "{name}");
                let c = e.retained_construction.unwrap();
                assert_eq!(c.parts.iter().map(|p| p.fragment.as_str()).collect::<String>(), name);
                for part in c.parts {
                    assert_eq!(&part.parent[part.source_start..part.source_end], part.fragment);
                    assert_eq!(&name[part.start..part.end], part.fragment);
                }
            });
            assert!(evidence(&p, name, None).retained_construction.is_none());
            assert!(evidence(&old, name, None).retained_construction.is_none());
        }
    }
}
