//! Emit a large, diverse seam-blend candidate pool per brief as JSON, for the
//! LLM reranker to select from. The engine's strength is generating many valid,
//! varied coinages; the LLM supplies the taste/coherence judgment the offline
//! scorer structurally can't. Deterministic.
//!
//! ```powershell
//! cargo run -p neologism-core --example llm_pool --release > pool.json
//! ```

use neologism_core::style::{Config, Style};

fn esc(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn main() {
    let briefs = [
        "a command line tool for database migrations",
        "a fast static site generator",
        "a terminal based log viewer for developers",
        "a lightweight state management library",
        "a self hosted password manager",
        "an API mocking and testing toolkit",
        "a real time collaborative code editor",
        "a package registry for private modules",
    ];
    let mut groups: Vec<String> = Vec::new();
    for (bi, brief) in briefs.iter().enumerate() {
        let cfg = Config {
            style: Style::BigTech,
            variant: Some("seamblend".to_string()),
            description: Some(brief.to_string()),
            seed: Some(100 + bi as u64),
            count: 30,
            variety: 0.6,
            ..Config::default()
        };
        let names: Vec<String> = neologism_core::generate(&cfg)
            .into_iter()
            .map(|r| format!("\"{}\"", esc(&r.name)))
            .collect();
        groups.push(format!(
            "  {{\"brief\":\"{}\",\"candidates\":[{}]}}",
            esc(brief),
            names.join(",")
        ));
    }
    println!("[\n{}\n]", groups.join(",\n"));
}
