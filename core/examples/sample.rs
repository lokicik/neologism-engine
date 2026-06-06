use neologism_core::{generate, style::{Config, Style}};

fn main() {
    for style in [Style::BigTech, Style::SciFi, Style::Fantasy] {
        let cfg = Config { style, count: 8, min_len: 4, max_len: 12, temperature: 0.85, seed: Some(7), roots: vec![] };
        let names: Vec<String> = generate(&cfg).into_iter().map(|r| r.name).collect();
        println!("{:?}: {}", style, names.join(", "));
    }
}
