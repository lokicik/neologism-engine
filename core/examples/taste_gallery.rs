//! Emit a JSON taste gallery: real Lab-family output (seam-blend + morpheme)
//! across a spread of dev-project briefs, for the interactive like/pass picker.
//! Deterministic. Prints JSON to stdout.
//!
//! ```powershell
//! cargo run -p neologism-core --example taste_gallery --release > gallery.json
//! ```

use neologism_core::style::{Config, Style};

fn page(variant: &str, brief: &str, seed: u64, n: usize) -> Vec<String> {
    let cfg = Config {
        style: Style::BigTech,
        variant: Some(variant.to_string()),
        description: Some(brief.to_string()),
        seed: Some(seed),
        count: n,
        ..Config::default()
    };
    neologism_core::generate(&cfg)
        .into_iter()
        .map(|r| r.name)
        .collect()
}

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
    let mut items: Vec<String> = Vec::new();
    for (bi, brief) in briefs.iter().enumerate() {
        let seed = 40 + bi as u64 * 7;
        for variant in ["seamblend", "morpheme"] {
            for name in page(variant, brief, seed, 5) {
                items.push(format!(
                    "{{\"name\":\"{}\",\"brief\":\"{}\",\"family\":\"{}\"}}",
                    esc(&name),
                    esc(brief),
                    variant
                ));
            }
        }
    }
    println!("[\n  {}\n]", items.join(",\n  "));
}
