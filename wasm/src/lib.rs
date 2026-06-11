use wasm_bindgen::prelude::*;
use neologism_core::{generate, NameResult};
use neologism_core::style::Config;
use neologism_core::metrics::{batch_stats, composite_score};

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
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
