// Phase 27 step 1+2: builds a big-tech candidate pool spanning the quality
// spectrum (gate loosened so borderline/awkward names survive alongside clean
// ones), labels each 1-5 for brand quality via a local OpenAI-compatible LLM
// (llama.cpp at 127.0.0.1:8080), extracts the existing scoring features, and
// appends "name<TAB>feature1..featureN<TAB>label" rows to the output file.
//
// Resumable: re-running with the same output file skips names already present.
//
// Run: cargo run -p neologism-core --release --example label_names -- <out.tsv> [target_count]

use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::TcpStream;

use neologism_core::markov::Model;
use neologism_core::phonotactics::{respects_sonority, syllable_count};
use neologism_core::score::{score_memorability, score_novelty, score_pronounceability};
use neologism_core::style::{Config, Style};
use neologism_core::{generate_with_tuning, BigTechTuning};

const HOST: &str = "127.0.0.1";
const PORT: u16 = 8080;
const MODEL: &str = "gemma-4-12B-it-qat-UD-Q4_K_XL.gguf";
const BATCH: usize = 25;

fn parse_lines(s: &str) -> Vec<String> {
    s.lines()
        .map(|l| l.trim().to_lowercase())
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .collect()
}

/// Generate a deduplicated pool of big-tech candidates spanning the quality
/// spectrum: high variety, and the word-likeness gate loosened (gate_sigma
/// pushed far out) so borderline/awkward names survive alongside clean ones —
/// without that, the classifier would only ever see names the engine already
/// considers good, and could never learn the boundary.
fn build_pool(target: usize) -> Vec<String> {
    let mut tuning = BigTechTuning::from_variety(1.0);
    tuning.gate_sigma = 8.0;

    let mut names: HashSet<String> = HashSet::new();
    let mut seed: u64 = 0xC0FF_EE15_u64;
    let mut stalls = 0;
    while names.len() < target && stalls < 50 {
        let before = names.len();
        let cfg = Config {
            style: Style::BigTech,
            count: 40,
            temperature: 0.9,
            variety: 1.0,
            seed: Some(seed),
            ..Config::default()
        };
        for r in generate_with_tuning(&cfg, &tuning) {
            names.insert(r.name);
        }
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        stalls = if names.len() == before { stalls + 1 } else { 0 };
    }
    let mut v: Vec<String> = names.into_iter().collect();
    v.sort();
    v.truncate(target);
    v
}

/// Minimal blocking HTTP/1.1 POST over a raw TCP socket — the local server
/// sends Content-Length (no chunked encoding), so reading to EOF after
/// `Connection: close` is sufficient. Keeps the example dependency-free
/// (serde_json is already a dependency; no reqwest/ureq needed).
fn post_json(path: &str, body: &str) -> Option<String> {
    let mut stream = TcpStream::connect((HOST, PORT)).ok()?;
    let request = format!(
        "POST {path} HTTP/1.1\r\n\
         Host: {HOST}:{PORT}\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         \r\n\
         {body}",
        body.len()
    );
    stream.write_all(request.as_bytes()).ok()?;
    let mut response = String::new();
    stream.read_to_string(&mut response).ok()?;
    let body_start = response.find("\r\n\r\n")? + 4;
    Some(response[body_start..].to_string())
}

/// Ask the local LLM to rate a batch of names 1 (bad/awkward) to 5
/// (excellent/brandable). Returns one integer per name, in order, or None if
/// the response didn't parse into exactly the right number of ratings — the
/// model occasionally wraps the array in commentary despite instructions, or
/// (rarely) miscounts; both are treated as a failed batch and skipped, since a
/// misaligned label is worse than a missing one.
fn rate_batch(names: &[String]) -> Option<Vec<i32>> {
    let mut prompt = String::from(
        "Rate each invented tech-company brand name below on brand quality, \
         from 1 (bad: awkward, hard to pronounce, junk-like) to 5 (excellent: \
         memorable, easy to say, distinctive, sounds like a real brand). \
         Respond with ONLY a JSON array of integers in the same order, nothing else.\n\n",
    );
    for (i, n) in names.iter().enumerate() {
        prompt.push_str(&format!("{}. {n}\n", i + 1));
    }

    let body = serde_json::json!({
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
    })
    .to_string();

    let resp_body = post_json("/v1/chat/completions", &body)?;
    let parsed: serde_json::Value = serde_json::from_str(&resp_body).ok()?;
    let content = parsed["choices"][0]["message"]["content"].as_str()?;
    let start = content.find('[')?;
    let end = content.rfind(']')?;
    let nums: Vec<i32> = serde_json::from_str(&content[start..=end]).ok()?;
    if nums.len() == names.len() && nums.iter().all(|n| (1..=5).contains(n)) {
        Some(nums)
    } else {
        None
    }
}

/// The feature vector used to train the distilled scorer — entirely existing
/// signals, no new metrics invented (Phase 27 plan, Step 2):
/// [log_likelihood, pronounceability, memorability, novelty, syllables,
///  length, vowel_ratio, max_consonant_run, respects_sonority]
fn features(name: &str, model: &Model, dict: &std::collections::HashSet<String>) -> [f64; 9] {
    let lower = name.to_lowercase();
    let len = lower.chars().count() as f64;
    let vowels = lower
        .chars()
        .filter(|c| "aeiouy".contains(*c))
        .count() as f64;
    let mut max_run = 0u32;
    let mut run = 0u32;
    for c in lower.chars() {
        if "aeiouy".contains(c) {
            run = 0;
        } else {
            run += 1;
            max_run = max_run.max(run);
        }
    }
    [
        model.log_likelihood(&lower),
        score_pronounceability(&lower) as f64,
        score_memorability(&lower) as f64,
        score_novelty(&lower, dict) as f64,
        syllable_count(&lower) as f64,
        len,
        vowels / len.max(1.0),
        max_run as f64,
        if respects_sonority(&lower) { 1.0 } else { 0.0 },
    ]
}

fn already_labeled(path: &str) -> HashSet<String> {
    fs::read_to_string(path)
        .unwrap_or_default()
        .lines()
        .filter_map(|l| l.split('\t').next())
        .map(|s| s.to_lowercase())
        .collect()
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("usage: label_names <out.tsv> [target_count]");
        std::process::exit(1);
    }
    let out_path = &args[1];
    let target: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(2000);

    eprintln!("building candidate pool (target={target}, gate loosened, variety=1.0)...");
    let pool = build_pool(target);
    eprintln!("pool built: {} distinct candidates", pool.len());

    let done = already_labeled(out_path);
    let todo: Vec<String> = pool.into_iter().filter(|n| !done.contains(&n.to_lowercase())).collect();
    eprintln!("{} already labeled, {} remaining", done.len(), todo.len());

    let bigtech_corpus_lines = parse_lines(include_str!("../data/bigtech.txt"));
    let refs: Vec<&str> = bigtech_corpus_lines.iter().map(|s| s.as_str()).collect();
    let model = Model::train_backoff(&refs, 3);
    let dict: std::collections::HashSet<String> = parse_lines(include_str!("../data/words.txt")).into_iter().collect();

    let mut out = OpenOptions::new().create(true).append(true).open(out_path).expect("open output");

    let mut labeled = 0usize;
    let mut failed_batches = 0usize;
    for chunk in todo.chunks(BATCH) {
        match rate_batch(chunk) {
            Some(ratings) => {
                for (name, label) in chunk.iter().zip(ratings.iter()) {
                    let f = features(name, &model, &dict);
                    let row = format!(
                        "{name}\t{:.4}\t{:.1}\t{:.1}\t{:.1}\t{:.1}\t{:.1}\t{:.4}\t{:.1}\t{:.1}\t{label}\n",
                        f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7], f[8]
                    );
                    out.write_all(row.as_bytes()).expect("write row");
                }
                out.flush().expect("flush");
                labeled += chunk.len();
                eprintln!("labeled {labeled}/{} ({} batch failures so far)", todo.len(), failed_batches);
            }
            None => {
                failed_batches += 1;
                eprintln!("batch failed to parse, skipping {} names ({failed_batches} failures so far)", chunk.len());
            }
        }
    }
    eprintln!("done: {labeled} labeled, {failed_batches} batch failures, output -> {out_path}");
}
