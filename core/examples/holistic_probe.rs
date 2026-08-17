//! Isolated brief-conditioned holistic-generator research harness.
//!
//! This example is not called by production generation, WASM, or the web app.

use neologism_core::exclude::stem_of;
use neologism_core::exclude::within_edit1;
use neologism_core::keywords::extract_keywords;
use neologism_core::metrics::{composite_score, diversity, mmr_select};
use neologism_core::phonotactics::{is_valid, respects_sonority, syllable_count};
use neologism_core::score::{score_memorability, score_novelty, score_pronounceability};
use neologism_core::style::Style;
use neologism_core::NameResult;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::error::Error;
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};

#[path = "holistic_probe/model.rs"]
mod holistic_model;

const WORDS: &str = include_str!("../data/words.txt");
const COMMON_WORDS: &str = include_str!("../data/common_words.txt");
const BIGTECH: &str = include_str!("../data/bigtech.txt");
const ROOTS: &str = include_str!("../data/roots.txt");
const ITALIAN: &str = include_str!("../data/experimental/accents/italian.txt");
const JAPANESE: &str = include_str!("../data/experimental/accents/japanese-ascii.txt");
const SEEDS: &[u64] = &[13, 67, 313];
const POOL_SIZE: usize = 80;
const PAGE_SIZE: usize = 10;
const MAX_ATTEMPTS: usize = 10_000;
const MIN_QUALITY: u32 = 75;

#[derive(Deserialize)]
struct KeywordRequest {
    id: String,
    text: String,
    name: String,
}

#[derive(Serialize)]
struct KeywordResponse {
    id: String,
    keywords: Vec<String>,
    stem: String,
}

fn keyword_mode() -> Result<(), Box<dyn Error>> {
    let stdin = io::stdin();
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let request: KeywordRequest = serde_json::from_str(&line)?;
        let lower = request
            .name
            .chars()
            .filter(|character| character.is_ascii_alphabetic())
            .collect::<String>()
            .to_ascii_lowercase();
        let response = KeywordResponse {
            id: request.id,
            keywords: extract_keywords(&request.text, 6),
            stem: stem_of(&lower).to_string(),
        };
        serde_json::to_writer(&mut stdout, &response)?;
        writeln!(&mut stdout)?;
    }
    Ok(())
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
struct RejectCounts {
    no_sample: usize,
    duplicate: usize,
    collision: usize,
    structural: usize,
    quality: usize,
}

#[derive(Clone, Debug, Serialize)]
struct Candidate {
    name: String,
    keywords: Vec<String>,
    condition_logp: f32,
    condition_lift: f32,
    nearest_source_distance: String,
    origin: &'static str,
    syllables: usize,
    score_pronounce: u32,
    score_novelty: u32,
    score_memorability: u32,
    composite: u32,
}

#[derive(Clone, Debug, Serialize)]
struct PageRun {
    brief: String,
    seed: u64,
    extracted_keywords: Vec<String>,
    known_keywords: Vec<String>,
    attempts: usize,
    rejections: RejectCounts,
    pool_size: usize,
    page: Vec<Candidate>,
    page_diversity: f64,
}

#[derive(Serialize)]
struct ProbeReport {
    schema: &'static str,
    model_sha256: String,
    temperature: f32,
    top_k: usize,
    pages: Vec<PageRun>,
    summary: serde_json::Value,
    gates: BTreeMap<&'static str, bool>,
}

struct CollisionIndex {
    exact: HashSet<String>,
    by_length: HashMap<usize, Vec<String>>,
}

impl CollisionIndex {
    fn new(values: impl IntoIterator<Item = String>) -> Self {
        let exact: HashSet<String> = values.into_iter().collect();
        let mut by_length: HashMap<usize, Vec<String>> = HashMap::new();
        for value in &exact {
            by_length
                .entry(value.len())
                .or_default()
                .push(value.clone());
        }
        for values in by_length.values_mut() {
            values.sort_unstable();
        }
        Self { exact, by_length }
    }

    fn collides(&self, candidate: &str) -> bool {
        if self.exact.contains(candidate) {
            return true;
        }
        let length = candidate.len();
        (length.saturating_sub(1)..=length.saturating_add(1)).any(|candidate_length| {
            self.by_length
                .get(&candidate_length)
                .is_some_and(|values| values.iter().any(|value| within_edit1(candidate, value)))
        })
    }
}

fn entries(raw: &str) -> impl Iterator<Item = String> + '_ {
    raw.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(str::to_ascii_lowercase)
}

fn dictionary() -> HashSet<String> {
    entries(WORDS).collect()
}

fn collision_index(review_path: &Path) -> Result<CollisionIndex, Box<dyn Error>> {
    let review = fs::read_to_string(review_path)?;
    let values = review
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .chain(entries(WORDS))
        .chain(entries(COMMON_WORDS))
        .chain(entries(BIGTECH))
        .chain(entries(ROOTS))
        .chain(entries(ITALIAN))
        .chain(entries(JAPANESE));
    Ok(CollisionIndex::new(values))
}

fn title_case(lower: &str) -> String {
    let mut chars = lower.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    first.to_ascii_uppercase().to_string() + chars.as_str()
}

fn result(lower: &str, score_dictionary: &HashSet<String>) -> NameResult {
    let name = title_case(lower);
    NameResult {
        name: name.clone(),
        style: Style::BigTech,
        syllables: syllable_count(lower),
        score_pronounce: score_pronounceability(lower),
        score_novelty: score_novelty(lower, score_dictionary),
        score_memorability: score_memorability(lower),
        connotations: neologism_core::connotation::connotations(&name),
    }
}

fn make_candidate(
    lower: &str,
    keywords: &[String],
    model: &holistic_model::Model,
    result: &NameResult,
) -> Candidate {
    let condition_logp = model.average_log_probability(lower, keywords);
    let empty_logp = model.average_log_probability(lower, &[]);
    Candidate {
        name: result.name.clone(),
        keywords: keywords.to_vec(),
        condition_logp,
        condition_lift: condition_logp - empty_logp,
        nearest_source_distance: "2+".into(),
        origin: "holistic",
        syllables: result.syllables,
        score_pronounce: result.score_pronounce,
        score_novelty: result.score_novelty,
        score_memorability: result.score_memorability,
        composite: composite_score(result),
    }
}

fn generate_page(
    brief: &str,
    seed: u64,
    model: &holistic_model::Model,
    collisions: &CollisionIndex,
    score_dictionary: &HashSet<String>,
    temperature: f32,
    top_k: usize,
) -> PageRun {
    let extracted_keywords = extract_keywords(brief, 6);
    let known_keywords = model.known_keywords(&extracted_keywords);
    let mut rng = ChaCha8Rng::seed_from_u64(seed);
    let mut seen = HashSet::new();
    let mut pool = Vec::new();
    let mut candidate_metadata = HashMap::new();
    let mut rejections = RejectCounts::default();
    let mut attempts = 0;
    while attempts < MAX_ATTEMPTS && pool.len() < POOL_SIZE {
        attempts += 1;
        let Some(lower) = model.sample(&mut rng, &known_keywords, temperature, top_k, 4, 12) else {
            rejections.no_sample += 1;
            continue;
        };
        if !seen.insert(lower.clone()) {
            rejections.duplicate += 1;
            continue;
        }
        if collisions.collides(&lower) {
            rejections.collision += 1;
            continue;
        }
        if !is_valid(&lower, Style::BigTech) || !respects_sonority(&lower) {
            rejections.structural += 1;
            continue;
        }
        let scored = result(&lower, score_dictionary);
        if composite_score(&scored) < MIN_QUALITY {
            rejections.quality += 1;
            continue;
        }
        candidate_metadata.insert(
            scored.name.to_ascii_lowercase(),
            make_candidate(&lower, &known_keywords, model, &scored),
        );
        pool.push(scored);
    }
    let selected = mmr_select(&pool, PAGE_SIZE, 0.70);
    let page = selected
        .iter()
        .filter_map(|item| {
            candidate_metadata
                .get(&item.name.to_ascii_lowercase())
                .cloned()
        })
        .collect();
    PageRun {
        brief: brief.into(),
        seed,
        extracted_keywords,
        known_keywords,
        attempts,
        rejections,
        pool_size: pool.len(),
        page,
        page_diversity: diversity(&selected),
    }
}

fn page_key(page: &PageRun) -> String {
    let mut names: Vec<String> = page
        .page
        .iter()
        .map(|item| item.name.to_ascii_lowercase())
        .collect();
    names.sort_unstable();
    names.join("|")
}

fn overlap(left: &PageRun, right: &PageRun) -> usize {
    let names: HashSet<String> = left
        .page
        .iter()
        .map(|item| item.name.to_ascii_lowercase())
        .collect();
    right
        .page
        .iter()
        .filter(|item| names.contains(&item.name.to_ascii_lowercase()))
        .count()
}

fn sha256_file(path: &Path) -> Result<String, Box<dyn Error>> {
    // Keep the example dependency-free: Windows ships certutil, and the probe
    // report needs a stable artifact identity rather than runtime trust.
    let output = std::process::Command::new("certutil")
        .args([
            "-hashfile",
            path.to_str().ok_or("non-Unicode model path")?,
            "SHA256",
        ])
        .output()?;
    if !output.status.success() {
        return Err("certutil failed to hash the model".into());
    }
    let text = String::from_utf8(output.stdout)?;
    text.lines()
        .map(str::trim)
        .find(|line| line.len() == 64 && line.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| "certutil did not return SHA-256".into())
}

fn run_mode(arguments: &[String]) -> Result<(), Box<dyn Error>> {
    let value = |flag: &str| -> Result<String, Box<dyn Error>> {
        let index = arguments
            .iter()
            .position(|item| item == flag)
            .ok_or_else(|| format!("missing {flag}"))?;
        arguments
            .get(index + 1)
            .cloned()
            .ok_or_else(|| format!("missing value for {flag}").into())
    };
    let model_path = PathBuf::from(value("--model")?);
    let review_path = PathBuf::from(value("--review")?);
    let matrix_path = PathBuf::from(value("--matrix")?);
    let temperature: f32 = value("--temperature")?.parse()?;
    let top_k: usize = value("--top-k")?.parse()?;
    let model_bytes = fs::read(&model_path)?;
    let model = holistic_model::Model::from_bytes(&model_bytes)
        .map_err(|error| format!("model rejected: {error}"))?;
    if !model.mechanism_gates_pass() {
        return Err("model is ineligible: sealed conditioning gates did not pass".into());
    }
    let collisions = collision_index(&review_path)?;
    let score_dictionary = dictionary();
    let briefs: Vec<String> = serde_json::from_slice(&fs::read(&matrix_path)?)?;
    let mut pages = Vec::new();
    for brief in briefs {
        for &seed in SEEDS {
            let page = generate_page(
                &brief,
                seed,
                &model,
                &collisions,
                &score_dictionary,
                temperature,
                top_k,
            );
            let replay = generate_page(
                &brief,
                seed,
                &model,
                &collisions,
                &score_dictionary,
                temperature,
                top_k,
            );
            if serde_json::to_string(&page)? != serde_json::to_string(&replay)? {
                return Err(format!("determinism replay failed for {brief} seed {seed}").into());
            }
            pages.push(page);
        }
    }
    let cards: Vec<&Candidate> = pages.iter().flat_map(|page| &page.page).collect();
    let average_quality =
        cards.iter().map(|item| item.composite as f64).sum::<f64>() / cards.len().max(1) as f64;
    let average_diversity =
        pages.iter().map(|page| page.page_diversity).sum::<f64>() / pages.len().max(1) as f64;
    let minimum_diversity = pages
        .iter()
        .map(|page| page.page_diversity)
        .fold(f64::INFINITY, f64::min);
    let mut unique_gate = true;
    let mut overlap_total = 0usize;
    let mut overlap_pairs = 0usize;
    let mut maximum_overlap = 0usize;
    for group in pages.chunks(SEEDS.len()) {
        let unique: BTreeSet<String> = group
            .iter()
            .flat_map(|page| page.page.iter().map(|item| item.name.to_ascii_lowercase()))
            .collect();
        unique_gate &= unique.len() >= 27;
        for left in 0..group.len() {
            for right in left + 1..group.len() {
                let shared = overlap(&group[left], &group[right]);
                overlap_total += shared;
                overlap_pairs += 1;
                maximum_overlap = maximum_overlap.max(shared);
            }
        }
    }
    let average_overlap = overlap_total as f64 / overlap_pairs.max(1) as f64;
    let page_keys: BTreeSet<String> = pages.iter().map(page_key).collect();
    let mut gates = BTreeMap::new();
    gates.insert(
        "all_pages_full",
        pages.iter().all(|page| page.page.len() == PAGE_SIZE),
    );
    gates.insert(
        "all_pools_full",
        pages.iter().all(|page| page.pool_size == POOL_SIZE),
    );
    gates.insert(
        "all_briefs_supported",
        pages.iter().all(|page| !page.known_keywords.is_empty()),
    );
    gates.insert(
        "minimum_quality_75",
        cards.iter().all(|item| item.composite >= MIN_QUALITY),
    );
    gates.insert("average_quality_84", average_quality >= 84.0);
    gates.insert("average_diversity_072", average_diversity >= 0.72);
    gates.insert("minimum_diversity_060", minimum_diversity >= 0.60);
    gates.insert("per_brief_unique_27_of_30", unique_gate);
    gates.insert("average_overlap_at_most_1", average_overlap <= 1.0);
    gates.insert("maximum_overlap_at_most_3", maximum_overlap <= 3);
    gates.insert("no_duplicate_page_sets", page_keys.len() == pages.len());
    let report = ProbeReport {
        schema: "neologism-holistic-probe-v1",
        model_sha256: sha256_file(&model_path)?,
        temperature,
        top_k,
        summary: serde_json::json!({
            "pages": pages.len(),
            "cards": cards.len(),
            "average_quality": average_quality,
            "average_diversity": average_diversity,
            "minimum_diversity": minimum_diversity,
            "average_page_overlap": average_overlap,
            "maximum_page_overlap": maximum_overlap,
            "unique_page_sets": page_keys.len(),
        }),
        pages,
        gates,
    };
    println!("{}", serde_json::to_string_pretty(&report)?);
    if report.gates.values().any(|passed| !passed) {
        std::process::exit(1);
    }
    Ok(())
}

fn self_test_mode(arguments: &[String]) -> Result<(), Box<dyn Error>> {
    let model_index = arguments
        .iter()
        .position(|item| item == "--model")
        .ok_or("missing --model")?;
    let path = arguments.get(model_index + 1).ok_or("missing model path")?;
    let bytes = fs::read(path)?;
    holistic_model::Model::from_bytes(&bytes)
        .map_err(|error| format!("valid model rejected: {error}"))?;
    let metadata_length = u32::from_le_bytes(bytes[12..16].try_into()?) as usize;
    let tensor_count_offset = 16 + metadata_length;
    let first_tensor_offset = tensor_count_offset + 4;
    let first_name_length = bytes[first_tensor_offset + 1] as usize;
    let first_name_offset = first_tensor_offset + 10;
    let first_scale_offset = first_name_offset + first_name_length;
    let mut failures = Vec::new();
    let mut bad_magic = bytes.clone();
    bad_magic[0] ^= 0xFF;
    failures.push(holistic_model::Model::from_bytes(&bad_magic).is_err());
    let mut bad_version = bytes.clone();
    bad_version[8..12].copy_from_slice(&2u32.to_le_bytes());
    failures.push(holistic_model::Model::from_bytes(&bad_version).is_err());
    let mut missing_tensor = bytes.clone();
    missing_tensor[first_name_offset] = b'x';
    failures.push(holistic_model::Model::from_bytes(&missing_tensor).is_err());
    let mut wrong_dimensions = bytes.clone();
    wrong_dimensions[first_tensor_offset + 2..first_tensor_offset + 6]
        .copy_from_slice(&511u32.to_le_bytes());
    failures.push(holistic_model::Model::from_bytes(&wrong_dimensions).is_err());
    let mut invalid_scale = bytes.clone();
    invalid_scale[first_scale_offset..first_scale_offset + 4]
        .copy_from_slice(&0.0f32.to_le_bytes());
    failures.push(holistic_model::Model::from_bytes(&invalid_scale).is_err());
    if failures.iter().all(|passed| *passed) {
        println!("holistic model parser: 5/5 malformed artifacts rejected");
        Ok(())
    } else {
        Err("model parser fail-closed test failed".into())
    }
}

#[derive(Deserialize)]
struct ParityReference {
    schema: String,
    model_sha256: String,
    cases: Vec<ParityCase>,
}

#[derive(Deserialize)]
struct ParityCase {
    keywords: Vec<String>,
    prefix: String,
    logits: Vec<f32>,
}

fn parity_mode(arguments: &[String]) -> Result<(), Box<dyn Error>> {
    let value = |flag: &str| -> Result<String, Box<dyn Error>> {
        let index = arguments
            .iter()
            .position(|item| item == flag)
            .ok_or_else(|| format!("missing {flag}"))?;
        arguments
            .get(index + 1)
            .cloned()
            .ok_or_else(|| format!("missing value for {flag}").into())
    };
    let model_path = PathBuf::from(value("--model")?);
    let reference_path = PathBuf::from(value("--reference")?);
    let model = holistic_model::Model::from_bytes(&fs::read(&model_path)?)
        .map_err(|error| format!("model rejected: {error}"))?;
    let reference: ParityReference = serde_json::from_slice(&fs::read(reference_path)?)?;
    if reference.schema != "neologism-holistic-parity-v1"
        || reference.model_sha256 != sha256_file(&model_path)?
        || reference.cases.len() != 100
    {
        return Err("parity reference identity mismatch".into());
    }
    let mut maximum_difference = 0.0f32;
    let mut top_one_matches = 0usize;
    for case in &reference.cases {
        let actual = model.logits_after_prefix(&case.prefix, &case.keywords)?;
        if actual.len() != case.logits.len() || actual.is_empty() {
            return Err("parity logit width mismatch".into());
        }
        for (left, right) in actual.iter().zip(&case.logits) {
            maximum_difference = maximum_difference.max((left - right).abs());
        }
        let actual_top = actual
            .iter()
            .enumerate()
            .max_by(|left, right| left.1.total_cmp(right.1).then_with(|| right.0.cmp(&left.0)))
            .map(|(index, _)| index)
            .ok_or("empty actual logits")?;
        let expected_top = case
            .logits
            .iter()
            .enumerate()
            .max_by(|left, right| left.1.total_cmp(right.1).then_with(|| right.0.cmp(&left.0)))
            .map(|(index, _)| index)
            .ok_or("empty expected logits")?;
        top_one_matches += usize::from(actual_top == expected_top);
    }
    let agreement = top_one_matches as f64 / reference.cases.len() as f64;
    println!(
        "holistic parity: max logit diff {:.6}, top-1 {}/{} ({:.1}%)",
        maximum_difference,
        top_one_matches,
        reference.cases.len(),
        agreement * 100.0
    );
    if maximum_difference > 0.02 || agreement < 0.99 {
        return Err("Python/Rust parity gate failed".into());
    }
    Ok(())
}

fn main() -> Result<(), Box<dyn Error>> {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let mode = arguments.first().cloned().unwrap_or_default();
    match mode.as_str() {
        "keywords" => keyword_mode(),
        "run" => run_mode(&arguments[1..]),
        "self-test" => self_test_mode(&arguments[1..]),
        "parity" => parity_mode(&arguments[1..]),
        _ => Err("usage: holistic_probe <keywords|run|self-test|parity>".into()),
    }
}
