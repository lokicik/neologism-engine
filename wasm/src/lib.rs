use wasm_bindgen::prelude::*;
use neologism_core::{generate, NameResult};
use neologism_core::style::Config;
use neologism_core::metrics::{batch_stats, composite_score};

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Inject the seam-blend data tables the wasm binary omits to stay small
/// (Phase 141). The web layer fetches these lazily and calls these once, only
/// when the Lab seam-blend mode is used. Both are idempotent (first call wins).
#[wasm_bindgen]
pub fn load_semfield(tsv: &str) {
    neologism_core::semfield::load_from_tsv(tsv);
}

#[wasm_bindgen]
pub fn load_pron_lexicon(tsv: &str) {
    neologism_core::phonology::load_lexicon(tsv);
}

/// Inject the name-collision bloom filter (binary). Lazy, like the tables above.
#[wasm_bindgen]
pub fn load_collision(bytes: &[u8]) {
    neologism_core::collision::load_from_bytes(bytes);
}

/// For each supplied name, whether it is probably an existing package/brand
/// (bloom membership; a `true` may be a ~0.5% false positive). JSON in/out.
#[wasm_bindgen]
pub fn collision_risk(names_json: &str) -> String {
    let names: Vec<String> = match serde_json::from_str(names_json) {
        Ok(n) => n,
        Err(e) => return format!("{{\"error\":\"{}\"}}", e),
    };
    let flags: Vec<bool> = names
        .iter()
        .map(|n| neologism_core::collision::likely_taken(n))
        .collect();
    serde_json::to_string(&flags).unwrap_or_else(|_| "[]".to_string())
}

/// Reasoning-family page WITH decodes: {"results":[...], "decodes":[...]}
/// where each decode carries the name's origin, gloss, and full reasoning
/// chain (Phase 143). The web layer renders the chain on the card.
#[wasm_bindgen]
pub fn generate_reason_page(config_json: &str) -> String {
    let cfg: Config = match serde_json::from_str(config_json) {
        Ok(c) => c,
        Err(e) => return format!("{{\"error\":\"{}\"}}", e),
    };
    // The seed only jitters near-ties in this family; a fixed fallback keeps
    // the wasm crate free of a rand dependency.
    let seed = cfg.seed.unwrap_or(0x5EED);
    let (results, decodes) = neologism_core::reason::generate_reason_explained(&cfg, seed);
    serde_json::to_string(&serde_json::json!({ "results": results, "decodes": decodes }))
        .unwrap_or_else(|_| "{}".to_string())
}

/// Submorph page WITH per-syllable decodes: {"results":[...], "decodes":[...]}
/// (Phase 143 follow-up — the web card shows "ver = verify + nect = connect").
#[wasm_bindgen]
pub fn generate_submorph_page(config_json: &str) -> String {
    let cfg: Config = match serde_json::from_str(config_json) {
        Ok(c) => c,
        Err(e) => return format!("{{\"error\":\"{}\"}}", e),
    };
    let seed = cfg.seed.unwrap_or(0x5EED);
    let (results, decodes) = neologism_core::submorph::generate_submorph_explained(&cfg, seed);
    serde_json::to_string(&serde_json::json!({ "results": results, "decodes": decodes }))
        .unwrap_or_else(|_| "{}".to_string())
}

/// Takes a JSON-encoded Config, returns a JSON-encoded Vec<NameResult>.
#[wasm_bindgen]
pub fn generate_names(config_json: &str) -> String {
    let cfg: Config = match serde_json::from_str(config_json) {
        Ok(c) => c,
        Err(e) => return format!("{{\"error\":\"{}\"}}", e),
    };
    let results = generate(&cfg);
    serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
}

/// Experimental diagnostic entry point. Existing generation exports are unchanged.
/// Returns the bounded family page, structured evidence and observed internal events.
#[wasm_bindgen]
pub fn generate_candidate_diagnostics(config_json: &str) -> String {
    let run = || -> Result<serde_json::Value, String> {
        let mut cfg: Config = serde_json::from_str(config_json).map_err(|e| e.to_string())?;
        if cfg.style != neologism_core::style::Style::BigTech {
            return Err("candidate diagnostics require big_tech".into());
        }
        if cfg.seed.is_none() { return Err("candidate diagnostics require a seed".into()); }
        cfg.count = cfg.count.min(24);
        if cfg.count == 0 { return Ok(serde_json::json!({"results": [], "evidence": [], "trace": []})); }
        let seed = cfg.seed.unwrap();
        let ((results, evidence), trace) = neologism_core::diagnostics::capture(|| {
            match cfg.variant.as_deref() {
                Some("reason") => {
                    let (r, d) = neologism_core::reason::generate_reason_explained(&cfg, seed);
                    (r, serde_json::to_value(d).unwrap())
                }
                Some("submorph") => {
                    let (r, d) = neologism_core::submorph::generate_submorph_explained(&cfg, seed);
                    (r, serde_json::to_value(d).unwrap())
                }
                _ => (generate(&cfg), serde_json::json!([])),
            }
        });
        Ok(serde_json::json!({"results": results, "evidence": evidence, "trace": trace}))
    };
    match run() {
        Ok(value) => value.to_string(),
        Err(error) => serde_json::json!({"error": error}).to_string(),
    }
}

/// Additive intent experiment. Coverage and hazards use the same scoped brief
/// representation as generation. No scope survives this synchronous call.
#[wasm_bindgen]
pub fn generate_intent_candidate_diagnostics(config_json: &str) -> String {
    let cfg: Config = match serde_json::from_str(config_json) {
        Ok(cfg) => cfg,
        Err(error) => return serde_json::json!({"error": error.to_string()}).to_string(),
    };
    let intent = neologism_core::brief_intent::compile(cfg.description.as_deref().unwrap_or(""));
    neologism_core::brief_intent::with_intent(&intent, || {
        let mut page: serde_json::Value = serde_json::from_str(&generate_candidate_diagnostics(config_json)).unwrap();
        if page.get("error").is_some() { return page.to_string(); }
        let names: Vec<String> = page["results"].as_array().unwrap().iter()
            .map(|r| r["name"].as_str().unwrap().to_string()).collect();
        let description = cfg.description.as_deref().unwrap_or("");
        page["intent"] = serde_json::to_value(&intent).unwrap();
        page["coverages"] = serde_json::to_value(neologism_core::description_concept_coverages(description, &names)).unwrap();
        page["hazards"] = serde_json::to_value(neologism_core::description_lexical_hazards(description, &names)).unwrap();
        page.to_string()
    })
}

/// Operation/object experiment; the original intent export remains unchanged.
#[wasm_bindgen]
pub fn generate_relation_candidate_diagnostics(config_json: &str) -> String {
    let cfg: Config = match serde_json::from_str(config_json) {
        Ok(cfg) => cfg,
        Err(error) => return serde_json::json!({"error": error.to_string()}).to_string(),
    };
    let plan = neologism_core::relation::compile(cfg.description.as_deref().unwrap_or(""));
    neologism_core::relation::with_plan(&plan, || {
        let mut page: serde_json::Value = serde_json::from_str(&generate_candidate_diagnostics(config_json)).unwrap();
        if page.get("error").is_some() { return page.to_string(); }
        let names: Vec<String> = page["results"].as_array().unwrap().iter()
            .map(|r| r["name"].as_str().unwrap().to_string()).collect();
        let description = cfg.description.as_deref().unwrap_or("");
        page["intent"] = serde_json::to_value(&plan.intent).unwrap();
        page["relation"] = serde_json::to_value(&plan).unwrap();
        page["relationEvidence"] = serde_json::to_value(names.iter().map(|name| neologism_core::relation::evidence(&plan, name)).collect::<Vec<_>>()).unwrap();
        page["coverages"] = serde_json::to_value(neologism_core::description_concept_coverages(description, &names)).unwrap();
        page["hazards"] = serde_json::to_value(neologism_core::description_lexical_hazards(description, &names)).unwrap();
        page.to_string()
    })
}

/// Additive meaning-first Lab. The synchronous scope also keeps pronunciation
/// evidence and explanations consistent with the generator's corrected counts.
#[wasm_bindgen]
pub fn generate_semantic_candidate_diagnostics(config_json: &str) -> String {
    semantic_candidate_diagnostics(config_json, false, neologism_core::semantic::compile)
}

#[wasm_bindgen]
pub fn generate_product_frame_diagnostics(config_json: &str) -> String {
    semantic_candidate_diagnostics(config_json, true, neologism_core::semantic::compile_product)
}

#[wasm_bindgen]
pub fn generate_product_brief_diagnostics(config_json: &str) -> String {
    semantic_candidate_diagnostics(config_json, true, neologism_core::product_brief::compile)
}

#[wasm_bindgen]
pub fn generate_retained_fragment_diagnostics(config_json: &str) -> String {
    semantic_candidate_diagnostics(config_json, true, neologism_core::retained::compile)
}

fn semantic_candidate_diagnostics(config_json: &str, product_frame: bool, compile: fn(&str) -> neologism_core::semantic::SemanticPlan) -> String {
    let cfg: Config = match serde_json::from_str(config_json) {
        Ok(cfg) => cfg,
        Err(error) => return serde_json::json!({"error": error.to_string()}).to_string(),
    };
    if product_frame && (cfg.style != neologism_core::style::Style::BigTech || cfg.seed.is_none()) {
        return serde_json::json!({"error": "product frame diagnostics require big_tech and a seed"}).to_string();
    }
    let plan = compile(cfg.description.as_deref().unwrap_or(""));
    neologism_core::semantic::with_plan(&plan, || {
        let mut page: serde_json::Value = if product_frame && cfg.variant.as_deref() == Some("metaphor") {
            let (results, trace) = neologism_core::diagnostics::capture(|| neologism_core::product_frame::generate(&plan, &cfg));
            serde_json::json!({"results": results, "evidence": [], "trace": trace})
        } else if plan.status == "ready" {
            serde_json::from_str(&generate_candidate_diagnostics(config_json)).unwrap()
        } else { serde_json::json!({"results": [], "evidence": [], "trace": []}) };
        if page.get("error").is_some() { return page.to_string(); }
        let names: Vec<String> = page["results"].as_array().unwrap().iter()
            .map(|r| r["name"].as_str().unwrap().to_string()).collect();
        let reasons: Vec<neologism_core::reason::ReasonDecode> = if cfg.variant.as_deref() == Some("reason") {
            serde_json::from_value(page["evidence"].clone()).unwrap_or_default()
        } else { vec![] };
        page["intent"] = serde_json::to_value(&plan.intent).unwrap();
        page["semantic"] = serde_json::to_value(&plan).unwrap();
        page["semanticEvidence"] = serde_json::to_value(names.iter().map(|name|
            neologism_core::semantic::evidence(&plan, name, reasons.iter().find(|r| r.name.eq_ignore_ascii_case(name))))
            .collect::<Vec<_>>()).unwrap();
        page["explanations"] = serde_json::to_value(names.iter().map(|name| neologism_core::explain(name)).collect::<Vec<_>>()).unwrap();
        let description = cfg.description.as_deref().unwrap_or("");
        page["coverages"] = serde_json::to_value(neologism_core::description_concept_coverages(description, &names)).unwrap();
        page["hazards"] = serde_json::to_value(neologism_core::description_lexical_hazards(description, &names)).unwrap();
        page.to_string()
    })
}

/// Structural breakdown of a single name (Phase 36 "Why this name"): suffix,
/// stem, real-word prefix, syllables, connotations, scores — as JSON.
#[wasm_bindgen]
pub fn explain_name(name: &str) -> String {
    serde_json::to_string(&neologism_core::explain(name)).unwrap_or_else(|_| "{}".to_string())
}

/// The keyword stems the engine extracts from a product description (Phase
/// 48) — the web UI shows them so users see exactly what drove their batch.
/// Returns a JSON string array.
#[wasm_bindgen]
pub fn extract_keywords(text: &str) -> String {
    let kws = neologism_core::keywords::extract_keywords(text, 6);
    serde_json::to_string(&kws).unwrap_or_else(|_| "[]".to_string())
}

/// Count distinct prompt concepts represented by each supplied name. This is
/// batched to keep the browser/WASM boundary cheap for personalized pools.
#[wasm_bindgen]
pub fn concept_coverages(text: &str, names_json: &str) -> String {
    let names: Vec<String> = match serde_json::from_str(names_json) {
        Ok(names) => names,
        Err(e) => return format!("{{\"error\":\"{}\"}}", e),
    };
    let coverages = neologism_core::description_concept_coverages(text, &names);
    serde_json::to_string(&coverages).unwrap_or_else(|_| "[]".to_string())
}

/// Flag high-confidence root+metaphor joins that can be reparsed as two
/// different English words. Batched beside concept coverage for diagnostics
/// and bounded shortlist repair.
#[wasm_bindgen]
pub fn lexical_hazards(text: &str, names_json: &str) -> String {
    let names: Vec<String> = match serde_json::from_str(names_json) {
        Ok(names) => names,
        Err(e) => return format!("{{\"error\":\"{}\"}}", e),
    };
    let hazards = neologism_core::description_lexical_hazards(text, &names);
    serde_json::to_string(&hazards).unwrap_or_else(|_| "[]".to_string())
}

/// Takes a JSON-encoded Vec<NameResult>, returns aggregate stats + per-name
/// composite scores as JSON.
#[wasm_bindgen]
pub fn batch_metrics(results_json: &str) -> String {
    let results: Vec<NameResult> = match serde_json::from_str(results_json) {
        Ok(r) => r,
        Err(e) => return format!("{{\"error\":\"{}\"}}", e),
    };
    let composites: Vec<u32> = results.iter().map(composite_score).collect();
    let out = serde_json::json!({
        "stats": batch_stats(&results),
        "composites": composites,
    });
    serde_json::to_string(&out).unwrap_or_else(|_| "{}".to_string())
}
