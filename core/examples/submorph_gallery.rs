//! Emit a JSON gallery of submorph names with decodes across a wide brief set
//! (Phase 142). Deterministic. Prints JSON to stdout.
//!
//! ```powershell
//! cargo run -p neologism-core --example submorph_gallery --release > gallery.json
//! ```

use neologism_core::style::{Config, Style};
use neologism_core::submorph::generate_submorph_explained;

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
        "a tool that deploys and verifies cloud services",
        "an audio and music production app",
        "a note taking app with backlinks",
        "a secure payments and finance platform",
    ];
    let mut items: Vec<String> = Vec::new();
    for (bi, brief) in briefs.iter().enumerate() {
        let cfg = Config {
            style: Style::BigTech,
            variant: Some("submorph".to_string()),
            description: Some(brief.to_string()),
            seed: Some(200 + bi as u64),
            count: 10,
            ..Config::default()
        };
        let (_, decodes) = generate_submorph_explained(&cfg, 200 + bi as u64);
        for d in decodes {
            let why = format!(
                "{} = {} · {} = {}",
                d.head,
                d.head_gloss,
                d.tail,
                if d.tail_quality { "canon suffix" } else { &d.tail_gloss }
            );
            items.push(format!(
                "  {{\"name\":\"{}\",\"brief\":\"{}\",\"why\":\"{}\"}}",
                esc(&d.name),
                esc(brief),
                esc(&why)
            ));
        }
    }
    println!("[\n{}\n]", items.join(",\n"));
}
