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
