pub mod blend;
pub mod markov;
pub mod phonotactics;
pub mod score;
pub mod style;

use std::collections::HashSet;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};

use style::{Config, Style};
use markov::Model;
use phonotactics::{is_valid, syllable_count};
use score::{score_novelty, score_pronounceability};
use blend::{blend, tech_transform};

const BIGTECH_CORPUS: &str = include_str!("../data/bigtech.txt");
const SCIFI_CORPUS: &str = include_str!("../data/scifi.txt");
const FANTASY_CORPUS: &str = include_str!("../data/fantasy.txt");
const ROOTS: &str = include_str!("../data/roots.txt");
const WORDS: &str = include_str!("../data/words.txt");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NameResult {
    pub name: String,
    pub style: Style,
    pub syllables: usize,
    pub score_pronounce: u32,
    pub score_novelty: u32,
}

fn parse_lines(s: &str) -> Vec<&str> {
    s.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .collect()
}

fn build_dictionary() -> HashSet<String> {
    parse_lines(WORDS).iter().map(|s| s.to_lowercase()).collect()
}

pub fn generate(cfg: &Config) -> Vec<NameResult> {
    let dict = build_dictionary();
    let seed = cfg.seed.unwrap_or_else(|| rand::random());
    let mut rng = ChaCha8Rng::seed_from_u64(seed);

    match cfg.style {
        Style::BigTech => generate_bigtech(cfg, &dict, &mut rng),
        Style::SciFi => generate_markov(cfg, &dict, &mut rng, SCIFI_CORPUS),
        Style::Fantasy => generate_markov(cfg, &dict, &mut rng, FANTASY_CORPUS),
    }
}

fn generate_bigtech(cfg: &Config, dict: &HashSet<String>, rng: &mut ChaCha8Rng) -> Vec<NameResult> {
    let roots_corpus = parse_lines(ROOTS);
    let bigtech_corpus = parse_lines(BIGTECH_CORPUS);

    let user_roots: Vec<&str> = cfg.roots.iter().map(|s| s.as_str()).collect();
    let all_roots: Vec<&str> = if user_roots.is_empty() {
        roots_corpus.clone()
    } else {
        user_roots
    };

    let mut results = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let max_attempts = cfg.count * 80;

    let bigtech_model = Model::train(&bigtech_corpus, 2);

    for _ in 0..max_attempts {
        if results.len() >= cfg.count { break; }

        let name = if rand::Rng::gen::<f64>(rng) < 0.6 {
            let a = all_roots[rand::Rng::gen_range(rng, 0..all_roots.len())];
            let b = all_roots[rand::Rng::gen_range(rng, 0..all_roots.len())];
            if a == b { continue; }
            let Some(blended) = blend(a, b) else { continue };
            tech_transform(rng, &blended, cfg.temperature)
        } else {
            let Some(s) = bigtech_model.sample(rng, cfg.temperature, cfg.min_len, cfg.max_len) else { continue };
            tech_transform(rng, &s, cfg.temperature)
        };

        let name = capitalize(&name);
        if name.len() < cfg.min_len || name.len() > cfg.max_len { continue; }
        if !is_valid(&name.to_lowercase(), Style::BigTech) { continue; }
        if seen.contains(&name) { continue; }

        seen.insert(name.clone());
        let sp = score_pronounceability(&name);
        let sn = score_novelty(&name.to_lowercase(), dict);
        results.push(NameResult {
            syllables: syllable_count(&name.to_lowercase()),
            name,
            style: Style::BigTech,
            score_pronounce: sp,
            score_novelty: sn,
        });
    }
    results
}

fn generate_markov(cfg: &Config, dict: &HashSet<String>, rng: &mut ChaCha8Rng, corpus: &str) -> Vec<NameResult> {
    let names = parse_lines(corpus);
    let model = Model::train(&names, 3);

    let mut results = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let max_attempts = cfg.count * 60;

    for _ in 0..max_attempts {
        if results.len() >= cfg.count { break; }
        let Some(name) = model.sample(rng, cfg.temperature, cfg.min_len, cfg.max_len) else { continue };
        let name = capitalize(&name);
        if !is_valid(&name.to_lowercase(), cfg.style) { continue; }
        if seen.contains(&name) { continue; }
        seen.insert(name.clone());
        let sp = score_pronounceability(&name);
        let sn = score_novelty(&name.to_lowercase(), dict);
        results.push(NameResult {
            syllables: syllable_count(&name.to_lowercase()),
            name,
            style: cfg.style,
            score_pronounce: sp,
            score_novelty: sn,
        });
    }
    results
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().to_string() + c.as_str(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(style: Style) -> Config {
        Config {
            style,
            count: 5,
            min_len: 4,
            max_len: 12,
            temperature: 0.7,
            seed: Some(42),
            roots: vec![],
        }
    }

    #[test]
    fn generates_bigtech_names() {
        let results = generate(&cfg(Style::BigTech));
        assert!(!results.is_empty());
        for r in &results {
            assert!(r.name.len() >= 4);
            assert!(r.name.len() <= 12);
            assert!(r.score_pronounce <= 100);
            assert!(r.score_novelty <= 100);
        }
    }

    #[test]
    fn generates_scifi_names() {
        let results = generate(&cfg(Style::SciFi));
        assert!(!results.is_empty());
    }

    #[test]
    fn generates_fantasy_names() {
        let results = generate(&cfg(Style::Fantasy));
        assert!(!results.is_empty());
    }

    #[test]
    fn seeded_output_is_deterministic() {
        let a = generate(&cfg(Style::SciFi));
        let b = generate(&cfg(Style::SciFi));
        let names_a: Vec<&str> = a.iter().map(|r| r.name.as_str()).collect();
        let names_b: Vec<&str> = b.iter().map(|r| r.name.as_str()).collect();
        assert_eq!(names_a, names_b);
    }
}
