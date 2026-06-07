use neologism_core::{generate, style::{Config, Style}};

fn show(label: &str, style: Style, variant: Option<&str>) {
    let cfg = Config {
        style,
        count: 8,
        min_len: 4,
        max_len: 12,
        temperature: 0.85,
        variety: 0.3,
        seed: Some(7),
        roots: vec![],
        variant: variant.map(|s| s.to_string()),
        description: None,
        compound: false,
        starts_with: None,
        contains: None,
        exclude: vec![],
    };
    let names: Vec<String> = generate(&cfg).into_iter().map(|r| r.name).collect();
    println!("{:<10}: {}", label, names.join(", "));
}

fn main() {
    show("BigTech", Style::BigTech, None);
    show("SciFi", Style::SciFi, None);
    for v in ["stellar", "machine", "alien"] {
        show(v, Style::SciFi, Some(v));
    }
    show("Fantasy", Style::Fantasy, None);
    for v in ["elvish", "dwarvish", "orcish", "common"] {
        show(v, Style::Fantasy, Some(v));
    }
}
