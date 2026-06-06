use wasm_bindgen::prelude::*;
use neologism_core::{generate, style::Config};

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
