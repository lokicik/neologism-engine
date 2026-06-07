pub mod blend;
pub mod connotation;
pub mod keywords;
pub mod markov;
pub mod metrics;
pub mod phonemes;
pub mod phonotactics;
pub mod score;
pub mod style;

use std::collections::HashSet;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};

use style::{Config, Style};
use markov::Model;
use phonemes::{affinity_score, Variant};
use phonotactics::{is_valid, is_valid_clustered, respects_sonority, syllable_count};
use score::{score_memorability, score_novelty, score_pronounceability};
use blend::{blend, compound, tech_transform};

const BIGTECH_CORPUS: &str = include_str!("../data/bigtech.txt");
const ROOTS: &str = include_str!("../data/roots.txt");
const ADJECTIVES: &str = include_str!("../data/adjectives.txt");
const WORDS: &str = include_str!("../data/words.txt");

// Sci-fi sub-corpora
const SCIFI_STELLAR: &str = include_str!("../data/scifi/stellar.txt");
const SCIFI_MACHINE: &str = include_str!("../data/scifi/machine.txt");
const SCIFI_ALIEN: &str = include_str!("../data/scifi/alien.txt");

// Fantasy sub-corpora
const FANTASY_ELVISH: &str = include_str!("../data/fantasy/elvish.txt");
const FANTASY_DWARVISH: &str = include_str!("../data/fantasy/dwarvish.txt");
const FANTASY_ORCISH: &str = include_str!("../data/fantasy/orcish.txt");
const FANTASY_COMMON: &str = include_str!("../data/fantasy/common.txt");

/// All sci-fi sub-corpora concatenated (used when no variant is selected).
fn scifi_corpus() -> String {
    [SCIFI_STELLAR, SCIFI_MACHINE, SCIFI_ALIEN].join("\n")
}

/// All fantasy sub-corpora concatenated (used when no variant is selected).
fn fantasy_corpus() -> String {
    [FANTASY_ELVISH, FANTASY_DWARVISH, FANTASY_ORCISH, FANTASY_COMMON].join("\n")
}

/// Map a variant name to its dedicated sub-corpus.
fn variant_corpus(variant: &str) -> Option<&'static str> {
    match variant.to_lowercase().as_str() {
        "stellar" => Some(SCIFI_STELLAR),
        "machine" => Some(SCIFI_MACHINE),
        "alien" => Some(SCIFI_ALIEN),
        "elvish" => Some(FANTASY_ELVISH),
        "dwarvish" => Some(FANTASY_DWARVISH),
        "orcish" => Some(FANTASY_ORCISH),
        "common" => Some(FANTASY_COMMON),
        _ => None,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NameResult {
    pub name: String,
    pub style: Style,
    pub syllables: usize,
    pub score_pronounce: u32,
    pub score_novelty: u32,
    pub score_memorability: u32,
    pub connotations: Vec<String>,
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
        Style::SciFi => {
            let corpus = variant_only_corpus(cfg).unwrap_or_else(scifi_corpus);
            generate_markov(cfg, &dict, &mut rng, &corpus)
        }
        Style::Fantasy => {
            let corpus = variant_only_corpus(cfg).unwrap_or_else(fantasy_corpus);
            generate_markov(cfg, &dict, &mut rng, &corpus)
        }
    }
}

/// The dedicated sub-corpus for the config's variant, if one is set and valid.
fn variant_only_corpus(cfg: &Config) -> Option<String> {
    cfg.variant
        .as_deref()
        .and_then(variant_corpus)
        .map(|s| s.to_string())
}

fn generate_bigtech(cfg: &Config, dict: &HashSet<String>, rng: &mut ChaCha8Rng) -> Vec<NameResult> {
    let roots_corpus = parse_lines(ROOTS);
    let bigtech_corpus = parse_lines(BIGTECH_CORPUS);

    // Priority for blend roots: description keywords > user-supplied roots > corpus.
    let desc_keywords: Vec<String> = cfg
        .description
        .as_deref()
        .filter(|d| !d.trim().is_empty())
        .map(|d| keywords::extract_keywords(d, 6))
        .unwrap_or_default();

    let all_roots: Vec<&str> = if !desc_keywords.is_empty() {
        desc_keywords.iter().map(|s| s.as_str()).collect()
    } else if !cfg.roots.is_empty() {
        cfg.roots.iter().map(|s| s.as_str()).collect()
    } else {
        roots_corpus.clone()
    };

    // Never emit a real brand / root / dictionary word verbatim.
    let corpus_set: HashSet<String> = bigtech_corpus
        .iter()
        .chain(roots_corpus.iter())
        .map(|s| s.to_lowercase())
        .collect();

    // Overgenerate a pool, then keep the most brand-like by Markov word-likeness.
    let target = cfg.count * 5;
    let mut pool: Vec<NameResult> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let max_attempts = target * 80;

    let bigtech_model = Model::train(&bigtech_corpus, 2);
    let adjectives = parse_lines(ADJECTIVES);
    // When the user supplies roots (description or seed words), blend purely from
    // them so re-ranking can't swap in generic names; otherwise mix in some Markov.
    let has_roots = !desc_keywords.is_empty() || !cfg.roots.is_empty();
    let blend_prob = if has_roots { 1.0 } else { 0.6 };

    for _ in 0..max_attempts {
        if pool.len() >= target { break; }

        let name = if cfg.compound {
            // Adjective + noun compound (SwiftForge); already CamelCase.
            let adj = adjectives[rand::Rng::gen_range(rng, 0..adjectives.len())];
            let noun = roots_corpus[rand::Rng::gen_range(rng, 0..roots_corpus.len())];
            compound(adj, noun)
        } else if rand::Rng::gen::<f64>(rng) < blend_prob {
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
        let lower = name.to_lowercase();
        if !is_valid(&lower, Style::BigTech) { continue; }
        // Big-tech names should read naturally → enforce sonority sequencing.
        // Compounds join two real words, so skip the single-word sonority check.
        if !cfg.compound && !respects_sonority(&lower) { continue; }
        if corpus_set.contains(&lower) || dict.contains(&lower) { continue; }
        if seen.contains(&name) { continue; }

        seen.insert(name.clone());
        let sp = score_pronounceability(&lower);
        let sn = score_novelty(&lower, dict);
        let sm = score_memorability(&lower);
        let cn = connotation::connotations(&name);
        pool.push(NameResult {
            syllables: syllable_count(&name.to_lowercase()),
            name,
            style: Style::BigTech,
            score_pronounce: sp,
            score_novelty: sn,
            score_memorability: sm,
            connotations: cn,
        });
    }

    // Rank by brand-likeness (Markov word-likeness) plus a brevity bonus from
    // memorability, so short names like "Splends" beat long mashups like
    // "Bastababase". The brevity bonus only applies without user roots — with a
    // description/seed words, keyword fidelity matters more than pure brandability.
    let brevity_w = if has_roots { 0.0 } else { 3.0 };
    let rank = |r: &NameResult| {
        bigtech_model.log_likelihood(&r.name) + (r.score_memorability as f64 / 100.0) * brevity_w
    };
    pool.sort_by(|a, b| rank(b).partial_cmp(&rank(a)).unwrap_or(std::cmp::Ordering::Equal));
    pool.truncate(cfg.count);
    pool
}

fn generate_markov(cfg: &Config, dict: &HashSet<String>, rng: &mut ChaCha8Rng, corpus: &str) -> Vec<NameResult> {
    let names = parse_lines(corpus);
    let model = Model::train(&names, 3);
    // Never emit a training entry verbatim — this is a neologism engine.
    let corpus_set: HashSet<String> = names.iter().map(|s| s.to_lowercase()).collect();

    let variant = cfg.variant.as_deref().and_then(Variant::parse);
    // Harsher variants permit denser consonant clusters.
    let max_run = match variant {
        Some(Variant::Orcish) | Some(Variant::Alien) => 4,
        _ => 3,
    };
    // Soft variants should read naturally → enforce sonority sequencing.
    // (Mixed/harsh styles keep their full, deliberately rough range.)
    let soft = matches!(
        variant,
        Some(Variant::Elvish) | Some(Variant::Stellar) | Some(Variant::Common)
    );
    // When a variant is set, overgenerate so we can re-rank toward its sound profile.
    let target = if variant.is_some() { cfg.count * 4 } else { cfg.count };
    let max_attempts = target * 60;

    let mut pool: Vec<NameResult> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for _ in 0..max_attempts {
        if pool.len() >= target { break; }
        let Some(name) = model.sample(rng, cfg.temperature, cfg.min_len, cfg.max_len) else { continue };
        let name = capitalize(&name);
        if !is_valid_clustered(&name.to_lowercase(), cfg.style, max_run) { continue; }
        if soft && !respects_sonority(&name.to_lowercase()) { continue; }
        let lower = name.to_lowercase();
        if corpus_set.contains(&lower) || dict.contains(&lower) { continue; }
        if seen.contains(&name) { continue; }
        seen.insert(name.clone());
        let sp = score_pronounceability(&name);
        let sn = score_novelty(&name.to_lowercase(), dict);
        let sm = score_memorability(&name);
        let cn = connotation::connotations(&name);
        pool.push(NameResult {
            syllables: syllable_count(&name.to_lowercase()),
            name,
            style: cfg.style,
            score_pronounce: sp,
            score_novelty: sn,
            score_memorability: sm,
            connotations: cn,
        });
    }

    // Re-rank toward the variant's phoneme profile, then keep the best `count`.
    if let Some(v) = variant {
        pool.sort_by(|a, b| {
            affinity_score(&b.name, v)
                .partial_cmp(&affinity_score(&a.name, v))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        pool.truncate(cfg.count);
    }
    pool
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
            variant: None,
            description: None,
            compound: false,
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
    fn no_verbatim_corpus_reproduction() {
        // Every style/variant must invent names, never echo a training entry.
        let cases: Vec<(Style, Option<&str>)> = vec![
            (Style::SciFi, Some("machine")),
            (Style::SciFi, None),
            (Style::Fantasy, Some("common")),
            (Style::Fantasy, Some("elvish")),
            (Style::Fantasy, None),
            (Style::BigTech, None),
        ];
        for (style, variant) in cases {
            let mut c = cfg(style);
            c.count = 12;
            c.variant = variant.map(|s| s.to_string());
            let names: HashSet<String> = generate(&c).iter().map(|r| r.name.to_lowercase()).collect();
            let corpus: HashSet<String> = match style {
                Style::BigTech => parse_lines(BIGTECH_CORPUS).iter().chain(parse_lines(ROOTS).iter()).map(|s| s.to_lowercase()).collect(),
                Style::SciFi => parse_lines(&scifi_corpus()).iter().map(|s| s.to_lowercase()).collect(),
                Style::Fantasy => parse_lines(&fantasy_corpus()).iter().map(|s| s.to_lowercase()).collect(),
            };
            let overlap: Vec<&String> = names.intersection(&corpus).collect();
            assert!(overlap.is_empty(), "{:?}/{:?} reproduced corpus entries: {:?}", style, variant, overlap);
        }
    }

    #[test]
    fn compound_mode_produces_compounds() {
        let mut c = cfg(Style::BigTech);
        c.compound = true;
        c.count = 6;
        c.max_len = 16;
        let results = generate(&c);
        assert!(!results.is_empty());
        // Each compound has an internal uppercase boundary (e.g. SwiftForge).
        for r in &results {
            let inner_caps = r.name.chars().skip(1).any(|ch| ch.is_uppercase());
            assert!(inner_caps, "{} is not a compound", r.name);
        }
    }

    #[test]
    fn description_drives_bigtech_roots() {
        let mut c = cfg(Style::BigTech);
        c.description = Some("a platform for tracking fitness and health workouts".to_string());
        c.count = 10;
        let results = generate(&c);
        assert!(!results.is_empty());
        // At least one name should echo a description keyword stem.
        let stems = ["fit", "health", "work", "track"];
        let hit = results.iter().any(|r| {
            let lower = r.name.to_lowercase();
            stems.iter().any(|s| lower.contains(s))
        });
        assert!(hit, "no description-derived names: {:?}",
            results.iter().map(|r| &r.name).collect::<Vec<_>>());
    }

    #[test]
    fn variant_sharpens_profile() {
        // Elvish output should, on average, score higher on elvish affinity
        // than the unflavored fantasy mix.
        use crate::phonemes::{affinity_score, Variant};
        let mut elvish_cfg = cfg(Style::Fantasy);
        elvish_cfg.variant = Some("elvish".to_string());
        elvish_cfg.count = 8;
        let elvish = generate(&elvish_cfg);
        assert!(!elvish.is_empty());

        let mut mix_cfg = cfg(Style::Fantasy);
        mix_cfg.count = 8;
        let mix = generate(&mix_cfg);

        let avg = |v: &[NameResult]| -> f64 {
            v.iter().map(|r| affinity_score(&r.name, Variant::Elvish)).sum::<f64>() / v.len() as f64
        };
        assert!(avg(&elvish) >= avg(&mix), "elvish {} vs mix {}", avg(&elvish), avg(&mix));
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
