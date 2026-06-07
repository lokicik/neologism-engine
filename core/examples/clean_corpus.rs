// Phase 25 corpus-cleaning tool. Scores candidate tokens by how brand-like they
// are under the EXISTING brand corpus (order-3 backoff Markov), so junk/foreign
// tokens (low word-likelihood) are filtered out automatically. Prints
// "score<TAB>name" for candidates that pass basic phonotactic filters and aren't
// already in the corpus; threshold/sort downstream in the shell.
//
// Run: cargo run -p neologism-core --example clean_corpus -- <bigtech.txt> <candidates.txt>
use std::fs;
use std::collections::HashSet;
use neologism_core::markov::Model;
use neologism_core::phonotactics::is_valid;
use neologism_core::style::Style;

fn lines(path: &str) -> Vec<String> {
    fs::read_to_string(path)
        .unwrap_or_default()
        .lines()
        .map(|l| l.trim().to_lowercase())
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .collect()
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let corpus = lines(&args[1]);
    let candidates = lines(&args[2]);

    let corpus_set: HashSet<&str> = corpus.iter().map(|s| s.as_str()).collect();
    let refs: Vec<&str> = corpus.iter().map(|s| s.as_str()).collect();
    let model = Model::train_backoff(&refs, 3);

    // Reference: distribution of the real corpus's own likelihoods.
    let mut corpus_ll: Vec<f64> = corpus.iter().map(|w| model.log_likelihood(w)).collect();
    corpus_ll.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let pct = |p: f64| corpus_ll[((corpus_ll.len() as f64 * p) as usize).min(corpus_ll.len() - 1)];
    eprintln!(
        "corpus likelihood: p10={:.3} p25={:.3} p50={:.3} (n={})",
        pct(0.10), pct(0.25), pct(0.50), corpus_ll.len()
    );

    let mut seen: HashSet<String> = HashSet::new();
    for c in &candidates {
        if c.len() < 4 || c.len() > 12 { continue; }
        if corpus_set.contains(c.as_str()) { continue; }
        if seen.contains(c) { continue; }
        if !is_valid(c, Style::BigTech) { continue; }
        seen.insert(c.clone());
        println!("{:.4}\t{}", model.log_likelihood(c), c);
    }
}
