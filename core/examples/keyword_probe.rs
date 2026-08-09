// Inspect the exact offline keyword and semantic-root groups for a brief.
// Run: cargo run -p neologism-core --example keyword_probe -- "your brief"
use neologism_core::keywords::{
    brand_root_groups, extract_keywords, guided_pair_root_groups, respell_source_keywords,
};

fn main() {
    let description = std::env::args().skip(1).collect::<Vec<_>>().join(" ");
    if description.trim().is_empty() {
        eprintln!("usage: cargo run -p neologism-core --example keyword_probe -- \"your brief\"");
        std::process::exit(2);
    }

    let keywords = extract_keywords(&description, 6);
    println!("keywords: {keywords:?}");
    println!("brand groups: {:?}", brand_root_groups(&keywords, 16));
    println!("pair groups: {:?}", guided_pair_root_groups(&keywords, 16));
    println!("respell sources: {:?}", respell_source_keywords(&keywords));
}
