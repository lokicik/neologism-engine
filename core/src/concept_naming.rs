//! Isolated product-name catalog. Never enters legacy generators, global
//! pronunciation/collision OnceLocks, family quotas, or aesthetic ranking.
use crate::{style::{Config, Style}, NameResult};
use rand::{seq::SliceRandom, SeedableRng};
use serde::{Deserialize, Serialize};
use std::{collections::{BTreeMap, BTreeSet}, sync::OnceLock};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Direction { pub id: String, pub benefit: String }
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Domain { pub id: String, pub label: String, pub directions: Vec<Direction> }
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Job {
    pub id: String, pub domain: String, pub label: String, pub object: String,
    pub operation: String, pub directions: Vec<String>, pub phrases: Vec<String>,
    pub actions: Vec<String>, pub objects: Vec<String>, pub incompatible: Vec<String>,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Pronunciation {
    pub source: String, pub components: serde_json::Value, pub syllables: Option<usize>,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CollisionEvidence {
    pub source: String, pub sha256: String, pub snapshot_date: Option<String>,
    #[serde(rename = "match")] pub matched: bool,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Form {
    pub name: String, pub kind: String, pub components: Vec<String>,
    pub pronunciation: Pronunciation, pub collisions: Vec<CollisionEvidence>,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Concept {
    pub id: String, pub domain: String, pub direction: String, pub rank: usize,
    pub sense: String, pub suitable: Vec<String>, pub incompatible: Vec<String>,
    pub source: String, pub forms: Vec<Form>,
}
#[derive(Debug, Clone, Deserialize)]
struct Catalog {
    identity: String, domains: Vec<Domain>, jobs: Vec<Job>, entries: Vec<Concept>,
    sources: serde_json::Value,
}
fn catalog() -> &'static Catalog {
    static DATA: OnceLock<Catalog> = OnceLock::new();
    DATA.get_or_init(|| serde_json::from_str(include_str!("../data/concept_naming.json")).expect("compiled catalog"))
}
fn product_target() -> String { "product_name".into() }
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct NamingRequest {
    pub config: Config,
    #[serde(default = "product_target")] pub target: String,
    pub interpretation_override: Option<String>,
    pub direction: Option<String>,
    pub data_identity: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
pub struct EvidenceSpan { pub surface: String, pub start: usize, pub end: usize, pub role: String }
#[derive(Debug, Clone, Serialize)]
pub struct ProductMeaning {
    pub status: String, pub reason: Option<String>, pub description: String,
    pub job: Option<Job>, pub options: Vec<Job>, pub evidence_spans: Vec<EvidenceSpan>,
    pub interpretation_rule: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
pub struct ConceptSource {
    pub concept_id: String, pub direction: String, pub rank: usize, pub sense: String,
    pub benefit: String, pub provenance: String, pub construction: String,
    pub components: Vec<String>, pub rejection: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
pub struct Candidate {
    pub id: String, pub result: NameResult, pub sources: Vec<ConceptSource>,
    pub pronunciation: Pronunciation, pub collisions: Vec<CollisionEvidence>,
    pub rejection: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
pub struct CandidateTrace {
    pub name: String, pub stage: String, pub decision: String, pub detail: Option<String>,
    pub occurrences: usize,
}
#[derive(Debug, Clone, Serialize)]
pub struct Finalist { pub id: String, pub concept_id: String, pub direction: String }
#[derive(Debug, Clone, Serialize)]
pub struct ConceptRun {
    pub schema: &'static str, pub request: NamingRequest, pub data_identity: String,
    pub data_sources: serde_json::Value, pub meaning: ProductMeaning, pub directions: Vec<Direction>,
    pub direction_order: Vec<String>, pub candidates: Vec<Candidate>, pub finalists: Vec<Finalist>,
    pub trace: Vec<CandidateTrace>, pub exhausted: bool,
}

fn tokens(text: &str) -> Vec<(usize, usize, String)> {
    let mut out = Vec::new();
    let mut start = None;
    for (i, c) in text.char_indices().chain(std::iter::once((text.len(), ' '))) {
        if c.is_ascii_alphabetic() { start.get_or_insert(i); }
        else if let Some(s) = start.take() { out.push((s, i, text[s..i].to_ascii_lowercase())); }
    }
    out
}
fn phrase_spans(text: &str, ts: &[(usize, usize, String)], phrase: &str, role: &str) -> Vec<EvidenceSpan> {
    let parts: Vec<_> = phrase.split_whitespace().collect();
    if parts.is_empty() { return vec![]; }
    ts.windows(parts.len()).filter(|window| window.iter().zip(&parts).all(|(a,b)| a.2 == *b))
        .map(|window| { let start=window[0].0; let end=window.last().unwrap().1;
            EvidenceSpan { surface:text[start..end].into(),start,end,role:role.into() } }).collect()
}
fn action_matches(word: &str, action: &str) -> bool {
    let stem=action.strip_suffix('e').unwrap_or(action);
    word==action || word==format!("{action}s") || word==format!("{stem}ing")
        || word==format!("{stem}ed") || word==format!("{action}ed")
        || (action.ends_with('y') && (word==format!("{}ies", &action[..action.len()-1]) || word==format!("{}ied", &action[..action.len()-1])))
        || (action=="retry" && word=="retrying")
}
fn interpret(data: &Catalog, description: &str, chosen: Option<&str>) -> ProductMeaning {
    let ts=tokens(description);
    let mut meaning=ProductMeaning { status:"unsupported".into(), reason:None, description:description.into(),
        job:None, options:vec![], evidence_spans:vec![], interpretation_rule:None };
    if description.trim().is_empty() { meaning.reason=Some("empty_description".into()); return meaning; }
    let mut matches=Vec::new();
    for job in &data.jobs {
        if job.incompatible.iter().any(|p| !phrase_spans(description,&ts,p,"context").is_empty()) { continue; }
        let phrases:Vec<_>=job.phrases.iter().flat_map(|p| phrase_spans(description,&ts,p,"product_phrase")).collect();
        let objects:Vec<_>=job.objects.iter().flat_map(|p| phrase_spans(description,&ts,p,"object")).collect();
        let actions:Vec<_>=ts.iter().filter(|t| job.actions.iter().any(|a| action_matches(&t.2,a)))
            .map(|t| EvidenceSpan { surface:description[t.0..t.1].into(),start:t.0,end:t.1,role:"operation".into() }).collect();
        if !phrases.is_empty() || (!objects.is_empty() && !actions.is_empty()) {
            let rule=if !phrases.is_empty() {"product_noun_phrase"} else {"action_and_object"};
            matches.push((job.clone(),rule,phrases.into_iter().chain(objects).chain(actions).collect::<Vec<_>>()));
        }
    }
    // A user can correct even a confident but mistaken automatic interpretation.
    meaning.options=data.jobs.clone();
    if let Some(id)=chosen {
        if let Some(job)=data.jobs.iter().find(|j| j.id==id) {
            meaning.status="ready".into(); meaning.job=Some(job.clone());
            meaning.interpretation_rule=Some("user_override".into());
            if let Some((_,_,spans))=matches.into_iter().find(|m| m.0.id==id) { meaning.evidence_spans=spans; }
            return meaning;
        }
    }
    let negation=ts.iter().any(|t| matches!(t.2.as_str(),"no"|"not"|"never"|"without"|"cannot"|"don"|"doesn"|"isn"));
    let primary_end=ts.iter().position(|t| matches!(t.2.as_str(),"before"|"after"|"during")).unwrap_or(ts.len());
    let unknown_action=ts[..primary_end].iter().any(|t| ["delete","erase","sell","buy","hire"].iter().any(|a| action_matches(&t.2,a)));
    if negation || unknown_action || matches.len()>1 {
        meaning.status="ambiguous".into();
        meaning.reason=Some(if negation {"negation_requires_interpretation"} else if unknown_action {"unmodeled_operation"} else {"multiple_product_jobs"}.into());
    } else if let Some((job,rule,spans))=matches.pop() {
        meaning.status="ready".into(); meaning.job=Some(job);
        meaning.interpretation_rule=Some(rule.into()); meaning.evidence_spans=spans;
    } else { meaning.reason=Some("outside_supported_product_jobs".into()); }
    meaning
}
fn event(name: &str, stage: &str, decision: &str, detail: Option<String>) -> CandidateTrace {
    CandidateTrace { name:name.into(),stage:stage.into(),decision:decision.into(),detail,occurrences:1 }
}
fn rejection(form: &Form, cfg: &Config) -> Option<String> {
    let name=form.name.to_ascii_lowercase();
    let reason=if !name.bytes().all(|b| b.is_ascii_lowercase()) {Some("unsupported_spelling")}
        else if name.len()<cfg.min_len || name.len()>cfg.max_len {Some("length")}
        else if cfg.exclude.iter().any(|n| n.eq_ignore_ascii_case(&name)) {Some("excluded")}
        else if cfg.starts_with.as_ref().is_some_and(|s| !name.starts_with(&s.to_ascii_lowercase())) {Some("starts_with")}
        else if cfg.contains.as_ref().is_some_and(|s| !name.contains(&s.to_ascii_lowercase())) {Some("contains")}
        else if form.pronunciation.source=="missing" || form.pronunciation.syllables.is_none() {Some("missing_pronunciation")}
        else if form.collisions.iter().any(|c| c.source=="brand_corpus" && c.matched) {Some("known_brand_match")}
        else if !form.collisions.iter().any(|c| c.source=="brand_corpus") {Some("missing_brand_evidence")}
        else {None};
    reason.map(str::to_string)
}
pub fn generate(request: NamingRequest) -> Result<ConceptRun,String> { generate_with(catalog(),request) }
fn generate_with(data: &Catalog, request: NamingRequest) -> Result<ConceptRun,String> {
    let cfg=&request.config;
    if cfg.style!=Style::BigTech || request.target!="product_name" {return Err("Product names supports developer product names only.".into());}
    let seed=cfg.seed.ok_or("A seed is required.")?;
    if seed>u32::MAX as u64 {return Err("Seed must be a 32-bit unsigned integer.".into());}
    if cfg.min_len>cfg.max_len {return Err("Minimum length exceeds maximum length.".into());}
    if request.data_identity.as_ref().is_some_and(|id| id!=&data.identity) {return Err("Catalog changed. Generate a new session.".into());}
    if request.interpretation_override.as_ref().is_some_and(|id| !data.jobs.iter().any(|j| &j.id==id)) {return Err("Unknown product interpretation.".into());}
    let description=cfg.description.as_deref().unwrap_or("");
    let meaning=interpret(data,description,request.interpretation_override.as_deref());
    let job=meaning.job.as_ref();
    let directions:Vec<_>=job.and_then(|j|data.domains.iter().find(|d|d.id==j.domain)).map(|d|
        d.directions.iter().filter(|b|job.unwrap().directions.contains(&b.id)).cloned().collect()).unwrap_or_default();
    if request.direction.as_ref().is_some_and(|id| !directions.iter().any(|d| &d.id==id)) {return Err("Direction is not part of this product interpretation.".into());}
    let mut direction_order:Vec<_>=directions.iter().filter(|d|request.direction.as_ref().is_none_or(|id|id==&d.id)).map(|d|d.id.clone()).collect();
    direction_order.shuffle(&mut rand_chacha::ChaCha8Rng::seed_from_u64(seed));
    let mut candidates:Vec<Candidate>=vec![];
    let mut positions=BTreeMap::new();
    let mut trace=vec![];
    if let Some(job)=job {
        let ts=tokens(description);
        let mut material:Vec<_>=data.entries.iter().filter(|e|e.domain==job.domain&&job.directions.contains(&e.direction)).collect();
        material.sort_by_key(|e|e.rank);
        for entry in material {
            for form in &entry.forms {
                let id=form.name.to_ascii_lowercase();
                trace.push(event(&form.name,"generator","catalog_form",Some(entry.id.clone())));
                let source_rejection=if entry.sense.trim().is_empty()||entry.source.trim().is_empty() {Some("missing_meaning_evidence".into())}
                    else if entry.incompatible.iter().any(|p|!phrase_spans(description,&ts,p,"context").is_empty()) {Some("incompatible_concept_context".into())}
                    else {None};
                let source=ConceptSource {concept_id:entry.id.clone(),direction:entry.direction.clone(),rank:entry.rank,sense:entry.sense.clone(),
                    benefit:directions.iter().find(|d|d.id==entry.direction).unwrap().benefit.clone(),provenance:entry.source.clone(),
                    construction:form.kind.clone(),components:form.components.clone(),rejection:source_rejection};
                let reject=rejection(form,cfg);
                trace.push(event(&form.name,"pool",reject.as_deref().or(source.rejection.as_deref()).unwrap_or("eligible"),Some(entry.id.clone())));
                if let Some(&index)=positions.get(&id) {let p:&mut Candidate=&mut candidates[index];p.sources.push(source);}
                else {
                    let explained=crate::explain(&form.name);
                    positions.insert(id.clone(),candidates.len());
                    candidates.push(Candidate {id,result:NameResult {name:form.name.clone(),style:cfg.style,
                        syllables:form.pronunciation.syllables.unwrap_or(explained.syllables),score_pronounce:explained.score_pronounce,
                        score_novelty:explained.score_novelty,score_memorability:explained.score_memorability,connotations:explained.connotations},
                        sources:vec![source],pronunciation:form.pronunciation.clone(),collisions:form.collisions.clone(),rejection:reject});
                }
            }
        }
    } else { trace.push(event("","interpretation",&meaning.status,meaning.reason.clone())); }
    let mut finalists=vec![];
    let mut picked=BTreeSet::new(); let mut concepts=BTreeSet::new(); let mut openings=BTreeSet::new();
    let limit=cfg.count.min(4);
    loop {
        let before=finalists.len();
        for direction in &direction_order {
            if finalists.len()>=limit {break;}
            for p in &candidates {
                if p.rejection.is_some()||picked.contains(&p.id)||openings.contains(&p.id.chars().take(3).collect::<String>()) {continue;}
                if p.sources.iter().any(|s|concepts.contains(&s.concept_id)) {continue;}
                let Some(source)=p.sources.iter().find(|s|s.rejection.is_none()&&&s.direction==direction) else {continue;};
                finalists.push(Finalist {id:p.id.clone(),concept_id:source.concept_id.clone(),direction:direction.clone()});
                picked.insert(p.id.clone()); openings.insert(p.id.chars().take(3).collect::<String>());
                concepts.extend(p.sources.iter().filter(|s|s.rejection.is_none()).map(|s|s.concept_id.clone()));
                break;
            }
        }
        if finalists.len()==before||finalists.len()>=limit {break;}
    }
    for p in &candidates {
        let decision=if picked.contains(&p.id) {"selected"}
            else if p.rejection.is_some()||p.sources.iter().all(|s|s.rejection.is_some()) {"no_eligible_source"}
            else if !p.sources.iter().any(|s|direction_order.contains(&s.direction)&&s.rejection.is_none()) {"direction_filter"}
            else if p.sources.iter().any(|s|concepts.contains(&s.concept_id)) {"concept_cap"}
            else if openings.contains(&p.id.chars().take(3).collect::<String>()) {"opening_cap"}
            else {"finalist_limit"};
        trace.push(event(&p.result.name,"selection",decision,None));
    }
    let exhausted=meaning.status=="ready"&&finalists.is_empty();
    Ok(ConceptRun {schema:"concept-naming-run-v1",request,data_identity:data.identity.clone(),data_sources:data.sources.clone(),meaning,directions,
        direction_order,candidates,finalists,trace,exhausted})
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(brief:&str)->NamingRequest {NamingRequest {config:Config {description:Some(brief.into()),seed:Some(13),..Config::default()},target:product_target(),interpretation_override:None,direction:None,data_identity:None}}
    #[test]
    fn natural_nouns_and_actions_have_real_spans() {
        for (brief,id) in [("a CLI for database migrations","migrate_data"),("a tool that migrates databases","migrate_data"),
            ("a terminal log viewer","inspect_signals"),("a job scheduler","schedule_jobs"),("a message queue client","schedule_jobs"),
            ("a configuration validator","validate_config"),("a tool that verifies checksums","verify_artifacts")]
        {let run=generate(request(brief)).unwrap();assert_eq!(run.meaning.status,"ready","{brief}");assert_eq!(run.meaning.job.unwrap().id,id);
            for span in run.meaning.evidence_spans {assert_eq!(&brief[span.start..span.end],span.surface);}
            assert!(!run.finalists.is_empty(),"{brief}");}
        let a=generate(request("a CLI for database migrations")).unwrap();let b=generate(request("a tool that migrates databases")).unwrap();
        assert_eq!(serde_json::to_value(a.finalists).unwrap(),serde_json::to_value(b.finalists).unwrap());
    }
    #[test]
    fn ambiguity_unsupported_negation_and_explicit_correction() {
        for brief in ["a tool that does not restore files","a log viewer and configuration validator","a tool that deletes logs"] {
            let run=generate(request(brief)).unwrap();assert_eq!(run.meaning.status,"ambiguous");assert!(run.candidates.is_empty());
        }
        for brief in ["","a furniture recovery tool","a job scheduler for recruiters","a community chat app","a football performance monitor"] {
            assert_eq!(generate(request(brief)).unwrap().meaning.status,"unsupported","{brief}");
        }
        let mut req=request("a log viewer and configuration validator");req.interpretation_override=Some("inspect_signals".into());
        let run=generate(req.clone()).unwrap();assert_eq!(run.meaning.interpretation_rule.as_deref(),Some("user_override"));assert!(!run.finalists.is_empty());
        req.interpretation_override=Some("not_a_job".into());assert!(generate(req).is_err());
    }
    #[test]
    fn repeat_constraints_caps_focus_and_exhaustion() {
        let mut req=request("a terminal log viewer");
        let first=generate(req.clone()).unwrap();assert_eq!(serde_json::to_string(&first).unwrap(),serde_json::to_string(&generate(req.clone()).unwrap()).unwrap());
        let mut seen=BTreeSet::new();
        for _ in 0..30 {
            let run=generate(req.clone()).unwrap();assert!(run.finalists.len()<=4);
            let mut concepts=BTreeSet::new();let mut openings=BTreeSet::new();
            for f in &run.finalists {assert!(seen.insert(f.id.clone()));assert!(concepts.insert(f.concept_id.clone()));assert!(openings.insert(f.id[..3].to_string()));}
            if run.finalists.is_empty() {assert!(run.exhausted);break;}
            req.config.exclude=seen.iter().map(|n|n.to_uppercase()).collect();
        }
        assert!(generate(req).unwrap().exhausted);
        let mut req=request("a terminal log viewer");req.direction=Some("evidence".into());
        assert!(generate(req.clone()).unwrap().finalists.iter().all(|f|f.direction=="evidence"));
        req.direction=Some("retry".into());assert!(generate(req).is_err());
        let mut req=request("a terminal log viewer");req.config.starts_with=Some("zz".into());assert!(generate(req).unwrap().finalists.is_empty());
        let mut req=request("a terminal log viewer");req.config.contains=Some("zz".into());assert!(generate(req).unwrap().finalists.is_empty());
        let mut req=request("a terminal log viewer");req.config.min_len=6;req.config.max_len=7;
        assert!(generate(req).unwrap().candidates.iter().filter(|p|p.rejection.is_none()).all(|p|(6..=7).contains(&p.id.len())));
        let mut req=request("a terminal log viewer");req.config.count=0;assert!(generate(req).unwrap().finalists.is_empty());
        let mut req=request("a terminal log viewer");req.data_identity=Some("stale".into());assert!(generate(req).is_err());
    }
    #[test]
    fn whole_words_keep_scoped_collision_and_pronunciation_evidence() {
        let run=generate(request("a tool that verifies checksums")).unwrap();
        let touchstone=run.candidates.iter().find(|p|p.id=="touchstone").unwrap();
        assert!(touchstone.rejection.is_none());assert!(touchstone.collisions.iter().any(|c|c.source=="crate_snapshot"&&c.matched));
        assert!(!crate::phonotactics::is_valid("touchstone",Style::BigTech));
        let proof=run.candidates.iter().find(|p|p.id=="proof").unwrap();
        assert_eq!(proof.collisions.len(),2);
        for p in run.candidates {if p.collisions.iter().any(|c|c.source=="brand_corpus"&&c.matched) {assert_eq!(p.rejection.as_deref(),Some("known_brand_match"));}}
        let run=generate(request("a job scheduler")).unwrap();
        assert_eq!(run.candidates.iter().find(|p|p.id=="metronome").unwrap().rejection.as_deref(),Some("missing_pronunciation"));
    }
    #[test]
    fn duplicate_sources_and_missing_meaning_are_not_lost() {
        let mut data=catalog().clone();
        let entry=data.entries.iter().find(|e|e.id=="observation-logbook").unwrap().clone();
        let mut duplicate=entry.clone();duplicate.id="observation-logbook-second-sense".into();duplicate.direction="visibility".into();
        data.entries.push(duplicate);
        let run=generate_with(&data,request("a terminal log viewer")).unwrap();
        assert_eq!(run.candidates.iter().find(|p|p.id=="logbook").unwrap().sources.len(),2);
        assert_eq!(run.candidates.iter().filter(|p|p.id=="logbook").count(),1);
        for e in data.entries.iter_mut().filter(|e|e.domain=="observation") {e.sense.clear();}
        assert!(generate_with(&data,request("a terminal log viewer")).unwrap().finalists.is_empty());
        data.entries.clear();assert!(generate_with(&data,request("a terminal log viewer")).unwrap().exhausted);
    }
}
