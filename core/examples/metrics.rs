// Repeatable evaluation harness: generates a batch per style/variant and prints
// aggregate quality metrics. Run: cargo run -p neologism-core --example metrics
use neologism_core::metrics::batch_stats;
use neologism_core::style::{Config, Style};
use neologism_core::generate;

fn row(label: &str, style: Style, variant: Option<&str>) {
    let cfg = Config {
        style,
        count: 50,
        min_len: 4,
        max_len: 12,
        temperature: 0.85,
        variety: 0.3,
        seed: Some(42),
        roots: vec![],
        variant: variant.map(|s| s.to_string()),
        description: None,
        compound: false,
        starts_with: None,
        contains: None,
    };
    let s = batch_stats(&generate(&cfg));
    println!(
        "{:<18} pron {:>5.1}  nov {:>5.1}  mem {:>5.1}  div {:>4.2}  uniq {:>5.1}%  len {:>4.1}  syl {:>3.1}",
        label, s.avg_pronounce, s.avg_novelty, s.avg_memorability, s.diversity, s.unique_pct, s.avg_length, s.avg_syllables
    );
}

fn main() {
    println!("Neologism Engine — batch metrics (n=50, seed=42)\n");
    row("big_tech", Style::BigTech, None);
    row("sci_fi (mixed)", Style::SciFi, None);
    for v in ["stellar", "machine", "alien"] {
        row(&format!("  sci_fi/{v}"), Style::SciFi, Some(v));
    }
    row("fantasy (mixed)", Style::Fantasy, None);
    for v in ["elvish", "dwarvish", "orcish", "common"] {
        row(&format!("  fantasy/{v}"), Style::Fantasy, Some(v));
    }
}
