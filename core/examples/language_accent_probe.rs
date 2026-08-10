//! Standalone technical probe for two corpus-backed spelling profiles.
//!
//! This example does not call or modify production generation. It answers only
//! whether the existing character-Markov stack can emit full, deterministic,
//! structurally safe, distinguishable pages from held-out place-name profiles.
//! Human preference remains a separate, mandatory product gate.

use neologism_core::exclude::within_edit1;
use neologism_core::markov::Model;
use neologism_core::metrics::{composite_score, diversity, mmr_select};
use neologism_core::phonotactics::{is_valid_clustered, respects_sonority, syllable_count};
use neologism_core::score::{score_memorability, score_novelty, score_pronounceability};
use neologism_core::style::Style;
use neologism_core::NameResult;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::env;
use std::error::Error;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

const ITALIAN: &str = include_str!("../data/experimental/accents/italian.txt");
const JAPANESE_ASCII: &str = include_str!("../data/experimental/accents/japanese-ascii.txt");
const WORDS: &str = include_str!("../data/words.txt");
const COMMON_WORDS: &str = include_str!("../data/common_words.txt");
const BIGTECH: &str = include_str!("../data/bigtech.txt");

const ORDER: usize = 3;
const PAGE_SIZE: usize = 10;
const POOL_SIZE: usize = PAGE_SIZE * 8;
const MAX_ATTEMPTS: usize = 10_000;
const MIN_QUALITY: u32 = 75;
const MIN_MEAN_QUALITY: f64 = 84.0;
const MIN_MEAN_DIVERSITY: f64 = 0.82;
const MIN_PAGE_DIVERSITY: f64 = 0.75;
const MMR_LAMBDA: f64 = 0.70;
const SEEDS: &[u64] = &[
    13, 29, 43, 67, 83, 101, 127, 149, 181, 211, 241, 277, 313, 347, 383, 419, 457, 491, 521, 557,
    593, 631, 673, 719, 761, 809, 853, 907, 953, 997,
];
const BAD_SUBSTRINGS: &[&str] = &[
    "fuck", "shit", "cunt", "dick", "cock", "bitch", "bastard", "whore", "slut", "porn", "nazi",
    "nigg", "retard", "damn", "crap", "turd", "fart", "puke", "vomit", "poop", "defect", "fraud",
    "scam", "lousy", "kill", "mong",
];

struct Accent {
    label: &'static str,
    all: Vec<String>,
    train: Vec<String>,
    holdout: Vec<String>,
    model: Model,
    likelihood_floor: f64,
}

struct Exclusions<'a> {
    same_train: &'a HashSet<String>,
    other_train: &'a HashSet<String>,
    training_corpus: &'a HashSet<String>,
    sealed_holdout: &'a HashSet<String>,
    selected_corpus: &'a HashSet<String>,
    dictionary: &'a HashSet<String>,
    brands: &'a HashSet<String>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct RejectCounts {
    no_sample: usize,
    same_train: usize,
    other_train: usize,
    dictionary: usize,
    brand: usize,
    duplicate: usize,
    blocked_substring: usize,
    structural: usize,
    likelihood: usize,
    quality: usize,
}

impl RejectCounts {
    fn add(&mut self, other: &Self) {
        self.no_sample += other.no_sample;
        self.same_train += other.same_train;
        self.other_train += other.other_train;
        self.dictionary += other.dictionary;
        self.brand += other.brand;
        self.duplicate += other.duplicate;
        self.blocked_substring += other.blocked_substring;
        self.structural += other.structural;
        self.likelihood += other.likelihood;
        self.quality += other.quality;
    }
}

struct PageRun {
    seed: u64,
    page: Vec<NameResult>,
    pool_names: Vec<String>,
    attempts: usize,
    rejected: RejectCounts,
}

struct ProbeReport {
    label: &'static str,
    runs: Vec<PageRun>,
    deterministic: bool,
    short_pools: usize,
    training_corpus_hits: usize,
    sealed_holdout_hits: usize,
    dictionary_hits: usize,
    brand_hits: usize,
    blocked_substring_hits: usize,
    sub_75: usize,
    within_page_duplicates: usize,
    duplicate_pages: usize,
    unique_names: usize,
    self_model_hits: usize,
    visible_total: usize,
    selected_corpus_edit1: usize,
    average_quality: f64,
    minimum_quality: u32,
    average_diversity: f64,
    minimum_diversity: f64,
    average_page_overlap: f64,
    maximum_page_overlap: usize,
}

struct HeldoutClass {
    hits: usize,
    ties: usize,
    total: usize,
    excluded_shared: usize,
    mean_margin: f64,
    p05_margin: f64,
}

struct HeldoutReport {
    italian: HeldoutClass,
    japanese: HeldoutClass,
}

#[derive(Default)]
struct SourceHit {
    matched_source_rows: usize,
    sources: BTreeSet<String>,
    fields: BTreeSet<String>,
    example_geoname_id: String,
}

struct SourceAudit {
    generated_unique: usize,
    selected_corpus_hits: usize,
    raw_source_only_hits: usize,
    selected_names: BTreeSet<String>,
    hits: BTreeMap<String, SourceHit>,
    profiles: BTreeMap<String, BTreeSet<&'static str>>,
}

fn entries(raw: &str) -> Vec<String> {
    raw.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(str::to_string)
        .collect()
}

fn percentile(mut values: Vec<f64>, share: f64) -> f64 {
    values.sort_by(f64::total_cmp);
    let index = ((values.len().saturating_sub(1)) as f64 * share.clamp(0.0, 1.0)).round() as usize;
    values.get(index).copied().unwrap_or(f64::NEG_INFINITY)
}

fn accent(label: &'static str, raw: &str) -> Accent {
    let all = entries(raw);
    assert_eq!(all.len(), 1_000, "{label} corpus size drifted");
    assert!(
        all.iter().all(|name| {
            (4..=10).contains(&name.len()) && name.bytes().all(|byte| byte.is_ascii_lowercase())
        }),
        "{label} contains a malformed token"
    );
    assert_eq!(
        all.iter().collect::<HashSet<_>>().len(),
        all.len(),
        "{label} contains duplicate tokens"
    );
    let mut train = Vec::new();
    let mut holdout = Vec::new();
    for (index, name) in all.iter().enumerate() {
        if index % 5 == 0 {
            holdout.push(name.clone());
        } else {
            train.push(name.clone());
        }
    }
    assert_eq!(train.len(), 800);
    assert_eq!(holdout.len(), 200);
    let refs: Vec<&str> = train.iter().map(String::as_str).collect();
    let model = Model::train_backoff(&refs, ORDER);

    // This is a fixed train-self-likelihood plausibility floor. The sealed
    // holdout is not consulted until the final post-generation leakage and
    // profile-classification reports.
    let likelihood_floor = percentile(
        train
            .iter()
            .map(|name| model.log_likelihood(name))
            .collect(),
        0.05,
    );
    Accent {
        label,
        all,
        train,
        holdout,
        model,
        likelihood_floor,
    }
}

fn word_set(raw: &str) -> HashSet<String> {
    entries(raw)
        .into_iter()
        .map(|word| word.to_ascii_lowercase())
        .collect()
}

fn title_case(lower: &str) -> String {
    let mut chars = lower.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    first.to_ascii_uppercase().to_string() + chars.as_str()
}

fn candidate(lower: &str, score_dictionary: &HashSet<String>) -> NameResult {
    NameResult {
        name: title_case(lower),
        style: Style::BigTech,
        syllables: syllable_count(lower),
        score_pronounce: score_pronounceability(lower),
        score_novelty: score_novelty(lower, score_dictionary),
        score_memorability: score_memorability(lower),
        connotations: Vec::new(),
    }
}

fn generate_page(
    accent: &Accent,
    seed: u64,
    exclusions: &Exclusions<'_>,
    score_dictionary: &HashSet<String>,
) -> PageRun {
    let mut rng = ChaCha8Rng::seed_from_u64(seed);
    let mut seen = HashSet::new();
    let mut pool = Vec::new();
    let mut attempts = 0;
    let mut rejected = RejectCounts::default();

    for _ in 0..MAX_ATTEMPTS {
        if pool.len() >= POOL_SIZE {
            break;
        }
        attempts += 1;
        let Some(lower) = accent.model.sample(&mut rng, 0.9, 4, 10) else {
            rejected.no_sample += 1;
            continue;
        };

        let same_train = exclusions.same_train.contains(&lower);
        let other_train = exclusions.other_train.contains(&lower);
        let dictionary = exclusions.dictionary.contains(&lower);
        let brand = exclusions.brands.contains(&lower);
        rejected.same_train += usize::from(same_train);
        rejected.other_train += usize::from(other_train);
        rejected.dictionary += usize::from(dictionary);
        rejected.brand += usize::from(brand);
        if same_train || other_train || dictionary || brand {
            continue;
        }
        if !seen.insert(lower.clone()) {
            rejected.duplicate += 1;
            continue;
        }
        if BAD_SUBSTRINGS.iter().any(|bad| lower.contains(bad)) {
            rejected.blocked_substring += 1;
            continue;
        }
        if !is_valid_clustered(&lower, Style::BigTech, 3)
            || !respects_sonority(&lower)
            || !(1..=3).contains(&syllable_count(&lower))
        {
            rejected.structural += 1;
            continue;
        }
        if accent.model.log_likelihood(&lower) < accent.likelihood_floor {
            rejected.likelihood += 1;
            continue;
        }
        let result = candidate(&lower, score_dictionary);
        if composite_score(&result) < MIN_QUALITY {
            rejected.quality += 1;
            continue;
        }
        pool.push(result);
    }

    let pool_names = pool.iter().map(|item| item.name.clone()).collect();
    let page = mmr_select(&pool, PAGE_SIZE, MMR_LAMBDA);
    PageRun {
        seed,
        page,
        pool_names,
        attempts,
        rejected,
    }
}

fn same_run(left: &PageRun, right: &PageRun) -> bool {
    left.seed == right.seed
        && left.pool_names == right.pool_names
        && left.attempts == right.attempts
        && left.rejected == right.rejected
        && left.page.len() == right.page.len()
        && left.page.iter().zip(&right.page).all(|(a, b)| {
            a.name == b.name
                && a.syllables == b.syllables
                && a.score_pronounce == b.score_pronounce
                && a.score_novelty == b.score_novelty
                && a.score_memorability == b.score_memorability
        })
}

fn page_overlap(left: &PageRun, right: &PageRun) -> usize {
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

fn probe(
    accent: &Accent,
    other: &Accent,
    exclusions: &Exclusions<'_>,
    score_dictionary: &HashSet<String>,
) -> ProbeReport {
    let mut runs = Vec::new();
    let mut deterministic = true;
    for &seed in SEEDS {
        let run = generate_page(accent, seed, exclusions, score_dictionary);
        let repeat = generate_page(accent, seed, exclusions, score_dictionary);
        deterministic &= same_run(&run, &repeat);
        runs.push(run);
    }

    let visible: Vec<&NameResult> = runs.iter().flat_map(|run| &run.page).collect();
    let training_corpus_hits = visible
        .iter()
        .filter(|item| {
            exclusions
                .training_corpus
                .contains(&item.name.to_ascii_lowercase())
        })
        .count();
    let sealed_holdout_hits = visible
        .iter()
        .filter(|item| {
            exclusions
                .sealed_holdout
                .contains(&item.name.to_ascii_lowercase())
        })
        .count();
    let dictionary_hits = visible
        .iter()
        .filter(|item| {
            exclusions
                .dictionary
                .contains(&item.name.to_ascii_lowercase())
        })
        .count();
    let brand_hits = visible
        .iter()
        .filter(|item| exclusions.brands.contains(&item.name.to_ascii_lowercase()))
        .count();
    let blocked_substring_hits = visible
        .iter()
        .filter(|item| {
            let lower = item.name.to_ascii_lowercase();
            BAD_SUBSTRINGS.iter().any(|bad| lower.contains(bad))
        })
        .count();
    let sub_75 = visible
        .iter()
        .filter(|item| composite_score(item) < MIN_QUALITY)
        .count();
    let within_page_duplicates = runs
        .iter()
        .map(|run| {
            let unique = run
                .page
                .iter()
                .map(|item| item.name.to_ascii_lowercase())
                .collect::<HashSet<_>>()
                .len();
            run.page.len().saturating_sub(unique)
        })
        .sum();
    let unique_names = visible
        .iter()
        .map(|item| item.name.to_ascii_lowercase())
        .collect::<HashSet<_>>()
        .len();
    let mut page_keys = HashSet::new();
    let duplicate_pages = runs
        .iter()
        .filter(|run| {
            let mut names: Vec<String> = run
                .page
                .iter()
                .map(|item| item.name.to_ascii_lowercase())
                .collect();
            names.sort();
            !page_keys.insert(names.join("|"))
        })
        .count();
    let self_model_hits = visible
        .iter()
        .filter(|item| {
            let lower = item.name.to_ascii_lowercase();
            accent.model.log_likelihood(&lower) > other.model.log_likelihood(&lower)
        })
        .count();
    let visible_total = visible.len();
    let selected_corpus_edit1 = visible
        .iter()
        .filter(|item| {
            let lower = item.name.to_ascii_lowercase();
            exclusions
                .selected_corpus
                .iter()
                .any(|known| within_edit1(&lower, known))
        })
        .count();
    let average_quality = if visible.is_empty() {
        0.0
    } else {
        visible
            .iter()
            .map(|item| composite_score(item) as f64)
            .sum::<f64>()
            / visible.len() as f64
    };
    let minimum_quality = visible
        .iter()
        .map(|item| composite_score(item))
        .min()
        .unwrap_or(0);
    let page_diversities: Vec<f64> = runs.iter().map(|run| diversity(&run.page)).collect();
    let average_diversity = if page_diversities.is_empty() {
        0.0
    } else {
        page_diversities.iter().sum::<f64>() / page_diversities.len() as f64
    };
    let minimum_diversity = page_diversities
        .iter()
        .copied()
        .min_by(f64::total_cmp)
        .unwrap_or(0.0);
    let mut overlap_sum = 0;
    let mut overlap_pairs = 0;
    let mut maximum_page_overlap = 0;
    for left in 0..runs.len() {
        for right in (left + 1)..runs.len() {
            let overlap = page_overlap(&runs[left], &runs[right]);
            overlap_sum += overlap;
            overlap_pairs += 1;
            maximum_page_overlap = maximum_page_overlap.max(overlap);
        }
    }
    let average_page_overlap = if overlap_pairs == 0 {
        0.0
    } else {
        overlap_sum as f64 / overlap_pairs as f64
    };
    let short_pools = runs
        .iter()
        .filter(|run| run.pool_names.len() < POOL_SIZE)
        .count();

    ProbeReport {
        label: accent.label,
        runs,
        deterministic,
        short_pools,
        training_corpus_hits,
        sealed_holdout_hits,
        dictionary_hits,
        brand_hits,
        blocked_substring_hits,
        sub_75,
        within_page_duplicates,
        duplicate_pages,
        unique_names,
        self_model_hits,
        visible_total,
        selected_corpus_edit1,
        average_quality,
        minimum_quality,
        average_diversity,
        minimum_diversity,
        average_page_overlap,
        maximum_page_overlap,
    }
}

fn classify_holdout(
    names: &[String],
    shared_profiles: &HashSet<String>,
    own: &Model,
    other: &Model,
) -> HeldoutClass {
    let excluded_shared = names
        .iter()
        .filter(|name| shared_profiles.contains(*name))
        .count();
    let margins: Vec<f64> = names
        .iter()
        .filter(|name| !shared_profiles.contains(*name))
        .map(|name| own.log_likelihood(name) - other.log_likelihood(name))
        .collect();
    let hits = margins.iter().filter(|margin| **margin > 0.0).count();
    let ties = margins.iter().filter(|margin| **margin == 0.0).count();
    let mean_margin = margins.iter().sum::<f64>() / margins.len().max(1) as f64;
    let total = margins.len();
    let p05_margin = percentile(margins, 0.05);
    HeldoutClass {
        hits,
        ties,
        total,
        excluded_shared,
        mean_margin,
        p05_margin,
    }
}

fn heldout_report(
    italian: &Accent,
    japanese: &Accent,
    shared_profiles: &HashSet<String>,
) -> HeldoutReport {
    HeldoutReport {
        italian: classify_holdout(
            &italian.holdout,
            shared_profiles,
            &italian.model,
            &japanese.model,
        ),
        japanese: classify_holdout(
            &japanese.holdout,
            shared_profiles,
            &japanese.model,
            &italian.model,
        ),
    }
}

fn recall(class: &HeldoutClass) -> f64 {
    class.hits as f64 / class.total.max(1) as f64
}

fn balanced_accuracy(report: &HeldoutReport) -> f64 {
    (recall(&report.italian) + recall(&report.japanese)) / 2.0
}

fn aggregate_rejections(report: &ProbeReport) -> RejectCounts {
    let mut total = RejectCounts::default();
    for run in &report.runs {
        total.add(&run.rejected);
    }
    total
}

fn acceptance_yield(report: &ProbeReport) -> f64 {
    let accepted: usize = report.runs.iter().map(|run| run.pool_names.len()).sum();
    let attempts: usize = report.runs.iter().map(|run| run.attempts).sum();
    accepted as f64 / attempts.max(1) as f64
}

fn print_report(report: &ProbeReport) {
    let full_pages = report
        .runs
        .iter()
        .filter(|run| run.page.len() == PAGE_SIZE)
        .count();
    println!("\n{}", report.label);
    for run in &report.runs {
        println!(
            "seed {}: {}",
            run.seed,
            run.page
                .iter()
                .map(|item| item.name.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        );
        println!(
            "  pool {}/{} attempts {} rejects same-train {} other-train {} dict {} brand {} dup {} blocked {} structural {} likelihood {} quality {}",
            run.pool_names.len(),
            POOL_SIZE,
            run.attempts,
            run.rejected.same_train,
            run.rejected.other_train,
            run.rejected.dictionary,
            run.rejected.brand,
            run.rejected.duplicate,
            run.rejected.blocked_substring,
            run.rejected.structural,
            run.rejected.likelihood,
            run.rejected.quality,
        );
    }
    let rejected = aggregate_rejections(report);
    println!(
        "pages {full_pages}/{} full | pools short {} | deterministic {}",
        report.runs.len(),
        report.short_pools,
        report.deterministic
    );
    println!(
        "quality mean {:.2} min {} | ILAD mean {:.3} min {:.3}",
        report.average_quality,
        report.minimum_quality,
        report.average_diversity,
        report.minimum_diversity
    );
    println!(
        "unique {}/{} | duplicate pages {} | within-page duplicates {} | page overlap mean {:.2} max {}",
        report.unique_names,
        report.visible_total,
        report.duplicate_pages,
        report.within_page_duplicates,
        report.average_page_overlap,
        report.maximum_page_overlap
    );
    println!(
        "training corpus hits {} | sealed holdout hits {} | dictionary hits {} | brand hits {} | blocked-substring hits {} | sub-75 {} | selected-corpus edit-1 neighbors {}",
        report.training_corpus_hits,
        report.sealed_holdout_hits,
        report.dictionary_hits,
        report.brand_hits,
        report.blocked_substring_hits,
        report.sub_75,
        report.selected_corpus_edit1
    );
    println!(
        "self-model sanity {}/{} ({:.1}%) | accepted yield {:.2}%",
        report.self_model_hits,
        report.visible_total,
        report.self_model_hits as f64 / report.visible_total.max(1) as f64 * 100.0,
        acceptance_yield(report) * 100.0
    );
    println!(
        "rejection totals: no-sample {} same-train {} other-train {} dict {} brand {} duplicate {} blocked {} structural {} likelihood {} quality {}",
        rejected.no_sample,
        rejected.same_train,
        rejected.other_train,
        rejected.dictionary,
        rejected.brand,
        rejected.duplicate,
        rejected.blocked_substring,
        rejected.structural,
        rejected.likelihood,
        rejected.quality,
    );
}

fn print_heldout(report: &HeldoutReport) {
    let italian_misses = report.italian.total - report.italian.hits - report.italian.ties;
    let japanese_misses = report.japanese.total - report.japanese.hits - report.japanese.ties;
    println!("\nsealed held-out confusion (rows=true, columns=Italian/tie/Japanese)");
    println!(
        "Italian: {}/{}/{} | recall {:.1}% | shared-profile excluded {} | mean margin {:.3} | p05 margin {:.3}",
        report.italian.hits,
        report.italian.ties,
        italian_misses,
        recall(&report.italian) * 100.0,
        report.italian.excluded_shared,
        report.italian.mean_margin,
        report.italian.p05_margin
    );
    println!(
        "Japanese: {}/{}/{} | recall {:.1}% | shared-profile excluded {} | mean margin {:.3} | p05 margin {:.3}",
        japanese_misses,
        report.japanese.ties,
        report.japanese.hits,
        recall(&report.japanese) * 100.0,
        report.japanese.excluded_shared,
        report.japanese.mean_margin,
        report.japanese.p05_margin
    );
    println!(
        "balanced accuracy {:.1}%",
        balanced_accuracy(report) * 100.0
    );
}

fn audit_token(value: &str, generated: &HashSet<String>) -> Option<String> {
    let lower = value.trim().to_ascii_lowercase();
    (lower.len() >= 4
        && lower.len() <= 10
        && lower.bytes().all(|byte| byte.is_ascii_lowercase())
        && generated.contains(&lower))
    .then_some(lower)
}

fn record_source_matches(
    values: impl IntoIterator<Item = (String, &'static str)>,
    source: &str,
    geoname_id: &str,
    generated: &HashSet<String>,
    hits: &mut BTreeMap<String, SourceHit>,
) {
    let mut record_hits: BTreeMap<String, BTreeSet<&'static str>> = BTreeMap::new();
    for (value, field) in values {
        if let Some(name) = audit_token(&value, generated) {
            record_hits.entry(name).or_default().insert(field);
        }
    }
    for (name, fields) in record_hits {
        let hit = hits.entry(name).or_default();
        hit.matched_source_rows += 1;
        hit.sources.insert(source.to_string());
        hit.fields.extend(fields.into_iter().map(str::to_string));
        if hit.example_geoname_id.is_empty() {
            hit.example_geoname_id = geoname_id.to_string();
        }
    }
}

fn scan_country_dump(
    path: &Path,
    source: &str,
    generated: &HashSet<String>,
    hits: &mut BTreeMap<String, SourceHit>,
) -> Result<(), Box<dyn Error>> {
    for line in BufReader::new(File::open(path)?).lines() {
        let line = line?;
        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() < 4 {
            continue;
        }
        let mut values = vec![
            (fields[1].to_string(), "canonical"),
            (fields[2].to_string(), "ascii"),
        ];
        values.extend(
            fields[3]
                .split(',')
                .map(|name| (name.to_string(), "inline-alternate")),
        );
        record_source_matches(values, source, fields[0], generated, hits);
    }
    Ok(())
}

fn scan_alternate_dump(
    path: &Path,
    source: &str,
    generated: &HashSet<String>,
    hits: &mut BTreeMap<String, SourceHit>,
) -> Result<(), Box<dyn Error>> {
    const METADATA_TAGS: &[&str] = &[
        "link", "wkdt", "post", "iata", "icao", "faac", "unlc", "abbr",
    ];
    for line in BufReader::new(File::open(path)?).lines() {
        let line = line?;
        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() < 4 || METADATA_TAGS.contains(&fields[2]) {
            continue;
        }
        record_source_matches(
            [(fields[3].to_string(), "alternate-table")],
            source,
            fields[1],
            generated,
            hits,
        );
    }
    Ok(())
}

fn source_audit(
    paths: &[String],
    italian: &ProbeReport,
    japanese: &ProbeReport,
    selected_corpus: &HashSet<String>,
) -> Result<SourceAudit, Box<dyn Error>> {
    let mut profiles: BTreeMap<String, BTreeSet<&'static str>> = BTreeMap::new();
    for (label, report) in [("Italian", italian), ("Japanese-ASCII", japanese)] {
        for item in report.runs.iter().flat_map(|run| &run.page) {
            profiles
                .entry(item.name.to_ascii_lowercase())
                .or_default()
                .insert(label);
        }
    }
    let generated: HashSet<String> = profiles.keys().cloned().collect();
    let mut hits = BTreeMap::new();
    scan_country_dump(Path::new(&paths[0]), "IT-main", &generated, &mut hits)?;
    scan_alternate_dump(Path::new(&paths[1]), "IT-alternate", &generated, &mut hits)?;
    scan_country_dump(Path::new(&paths[2]), "JP-main", &generated, &mut hits)?;
    scan_alternate_dump(Path::new(&paths[3]), "JP-alternate", &generated, &mut hits)?;
    let selected_names: BTreeSet<String> = generated
        .iter()
        .filter(|name| selected_corpus.contains(*name))
        .cloned()
        .collect();
    let selected_corpus_hits = selected_names.len();
    let raw_source_only_hits = hits
        .keys()
        .filter(|name| !selected_names.contains(*name))
        .count();
    Ok(SourceAudit {
        generated_unique: generated.len(),
        selected_corpus_hits,
        raw_source_only_hits,
        selected_names,
        hits,
        profiles,
    })
}

fn print_source_audit(audit: &SourceAudit) {
    let mut by_length: BTreeMap<usize, usize> = BTreeMap::new();
    for name in audit.hits.keys() {
        *by_length.entry(name.len()).or_default() += 1;
    }
    println!("\nIT/JP raw-source exact-collision audit (not a global GeoNames audit)");
    println!(
        "generated unique {} | selected-corpus hits {} | raw-source-only hits {} | collision lengths {:?}",
        audit.generated_unique,
        audit.selected_corpus_hits,
        audit.raw_source_only_hits,
        by_length
    );
    for (name, hit) in &audit.hits {
        let profile = audit
            .profiles
            .get(name)
            .map(|labels| labels.iter().copied().collect::<Vec<_>>().join("+"))
            .unwrap_or_default();
        println!(
            "collision {name}: profile={profile} selected={} matched-source-rows={} sources={} fields={} example-geoname-id={}",
            audit.selected_names.contains(name),
            hit.matched_source_rows,
            hit.sources.iter().cloned().collect::<Vec<_>>().join("+"),
            hit.fields.iter().cloned().collect::<Vec<_>>().join("+"),
            hit.example_geoname_id
        );
    }
}

fn audit_paths() -> Option<Vec<String>> {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.is_empty() {
        return None;
    }
    if args.len() == 5 && args[0] == "--audit-geonames" {
        return Some(args[1..].to_vec());
    }
    eprintln!(
        "usage: language_accent_probe [--audit-geonames <IT.txt> <IT-alternate.txt> <JP.txt> <JP-alternate.txt>]"
    );
    std::process::exit(2);
}

fn main() {
    let audit_paths = audit_paths();
    assert_eq!(SEEDS.len(), 30, "frozen seed count drifted");
    let italian = accent("Italian place-name spelling profile", ITALIAN);
    let japanese = accent(
        "GeoNames Japanese plain-ASCII place-name spelling profile",
        JAPANESE_ASCII,
    );
    let italian_all = italian.all.iter().cloned().collect::<HashSet<_>>();
    let japanese_all = japanese.all.iter().cloned().collect::<HashSet<_>>();
    let shared_profiles: HashSet<String> =
        italian_all.intersection(&japanese_all).cloned().collect();
    let italian_train = italian.train.iter().cloned().collect::<HashSet<_>>();
    let italian_holdout = italian.holdout.iter().cloned().collect::<HashSet<_>>();
    let japanese_train = japanese.train.iter().cloned().collect::<HashSet<_>>();
    let japanese_holdout = japanese.holdout.iter().cloned().collect::<HashSet<_>>();
    let mut training_corpus = italian_train.clone();
    training_corpus.extend(japanese_train.iter().cloned());
    let mut sealed_holdout = italian_holdout.clone();
    sealed_holdout.extend(japanese_holdout.iter().cloned());
    let score_dictionary = word_set(WORDS);
    let mut blocked_dictionary = score_dictionary.clone();
    blocked_dictionary.extend(word_set(COMMON_WORDS));
    let brands = word_set(BIGTECH);
    let mut selected_corpus: HashSet<String> = italian.all.iter().cloned().collect();
    selected_corpus.extend(japanese.all.iter().cloned());

    let italian_exclusions = Exclusions {
        same_train: &italian_train,
        other_train: &japanese_train,
        training_corpus: &training_corpus,
        sealed_holdout: &sealed_holdout,
        selected_corpus: &selected_corpus,
        dictionary: &blocked_dictionary,
        brands: &brands,
    };
    let japanese_exclusions = Exclusions {
        same_train: &japanese_train,
        other_train: &italian_train,
        training_corpus: &training_corpus,
        sealed_holdout: &sealed_holdout,
        selected_corpus: &selected_corpus,
        dictionary: &blocked_dictionary,
        brands: &brands,
    };
    let italian_report = probe(&italian, &japanese, &italian_exclusions, &score_dictionary);
    let japanese_report = probe(&japanese, &italian, &japanese_exclusions, &score_dictionary);
    print_report(&italian_report);
    print_report(&japanese_report);

    let heldout = heldout_report(&italian, &japanese, &shared_profiles);
    print_heldout(&heldout);
    let mut shared_profile_names: Vec<String> = shared_profiles.iter().cloned().collect();
    shared_profile_names.sort();
    println!(
        "shared exact spellings across profiles: {} ({})",
        shared_profiles.len(),
        shared_profile_names.join(", ")
    );
    println!("generated self-model classification: DIAGNOSTIC ONLY");
    let source_audit_clear = if let Some(paths) = audit_paths {
        match source_audit(&paths, &italian_report, &japanese_report, &selected_corpus) {
            Ok(audit) => {
                let clear = audit.selected_corpus_hits == 0 && audit.raw_source_only_hits == 0;
                print_source_audit(&audit);
                Some(clear)
            }
            Err(error) => {
                eprintln!("IT/JP raw-source collision audit failed: {error}");
                std::process::exit(2);
            }
        }
    } else {
        println!("IT/JP raw-source collision audit: NOT RUN BY THIS COMMAND");
        None
    };
    println!("human blind preference: NOT EVALUATED");

    let reports = [&italian_report, &japanese_report];
    let lower_yield = acceptance_yield(&italian_report).min(acceptance_yield(&japanese_report));
    let upper_yield = acceptance_yield(&italian_report).max(acceptance_yield(&japanese_report));
    let yield_ratio = upper_yield / lower_yield.max(f64::EPSILON);
    println!("filter accepted-yield ratio {yield_ratio:.2}x");
    let mut gates = vec![
        (
            reports.iter().all(|report| {
                report.runs.len() == SEEDS.len()
                    && report.runs.iter().all(|run| run.page.len() == PAGE_SIZE)
            }),
            "each profile has 30/30 complete ten-name pages",
        ),
        (
            reports.iter().all(|report| report.short_pools == 0),
            "every seed fills the fixed 80-candidate pool within 10,000 attempts",
        ),
        (
            reports.iter().all(|report| report.deterministic),
            "same-process replay preserves ordered raw-pool names, counters, and selected scores/order",
        ),
        (
            reports.iter().all(|report| {
                report.training_corpus_hits == 0
                    && report.sealed_holdout_hits == 0
                    && report.dictionary_hits == 0
                    && report.brand_hits == 0
                    && report.blocked_substring_hits == 0
            }),
            "selected pages contain no selected-corpus, dictionary, brand, or blocked-substring hit",
        ),
        (
            reports.iter().all(|report| {
                report.sub_75 == 0 && report.minimum_quality >= MIN_QUALITY
            }),
            "selected pages contain no sub-75 structural candidate",
        ),
        (
            reports
                .iter()
                .all(|report| report.average_quality >= MIN_MEAN_QUALITY),
            "each profile has mean technical composite at least 84",
        ),
        (
            reports
                .iter()
                .all(|report| report.within_page_duplicates == 0),
            "selected pages contain no within-page exact duplicate",
        ),
        (
            reports
                .iter()
                .all(|report| report.duplicate_pages == 0),
            "each profile has no order-independent duplicate page set",
        ),
        (
            reports
                .iter()
                .all(|report| report.unique_names * 10 >= report.visible_total * 9),
            "each profile retains at least 90% unique names across 300 selections",
        ),
        (
            reports.iter().all(|report| {
                report.average_diversity >= MIN_MEAN_DIVERSITY
                    && report.minimum_diversity >= MIN_PAGE_DIVERSITY
            }),
            "each profile has mean ILAD at least 0.82 and every page at least 0.75",
        ),
        (
            reports.iter().all(|report| {
                report.average_page_overlap <= 1.0 && report.maximum_page_overlap <= 3
            }),
            "cross-seed page overlap averages at most 1/10 and never exceeds 3/10",
        ),
        (
            recall(&heldout.italian) >= 0.85 && recall(&heldout.japanese) >= 0.85,
            "sealed heldout recall is at least 85% for each profile",
        ),
        (
            balanced_accuracy(&heldout) >= 0.90,
            "sealed heldout balanced accuracy is at least 90%",
        ),
        (
            heldout.italian.total >= 195 && heldout.japanese.total >= 195,
            "at least 195 unambiguous sealed holdout names remain per profile",
        ),
        (
            yield_ratio <= 2.0,
            "English-biased filter accepted-yield rates stay within 2x",
        ),
    ];
    if let Some(clear) = source_audit_clear {
        gates.push((
            clear,
            "requested IT/JP source audit contains no exact visible source collision",
        ));
    }

    let mut failed = false;
    for (passed, label) in gates {
        println!("{}  {label}", if passed { "PASS" } else { "FAIL" });
        failed |= !passed;
    }
    if failed {
        std::process::exit(1);
    }
}
