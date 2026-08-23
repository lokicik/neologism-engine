//! Frozen Phase 299 ConceptNet semantic-lattice product beam probe.

use neologism_core::blend::tech_suffix_of;
use neologism_core::keywords::extract_keywords;
use neologism_core::metrics::composite_score;
use neologism_core::phonotactics::{is_valid, respects_sonority, syllable_count};
use neologism_core::score::{score_memorability, score_novelty, score_pronounceability};
use neologism_core::style::Style;
use neologism_core::NameResult;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::env;
use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};

const BIGTECH: &str = include_str!("../data/bigtech.txt");
const ROOTS: &str = include_str!("../data/roots.txt");
const WORDS: &str = include_str!("../data/words.txt");
const COMMON_WORDS: &str = include_str!("../data/common_words.txt");
const ITALIAN: &str = include_str!("../data/experimental/accents/italian.txt");
const JAPANESE: &str = include_str!("../data/experimental/accents/japanese-ascii.txt");

const SEEDS: &[u64] = &[13, 67, 313];
const POOL_SIZE: usize = 160;
const PAGE_SIZE: usize = 10;
const MAX_ATTEMPTS: usize = 40_000;
const FORM_WEIGHT: f64 = 0.80;
const SEMANTIC_WEIGHT: f64 = 0.20;
const SMOOTHING: f64 = 0.1;
const MMR_LAMBDA: f64 = 0.70;
const BEAM_WIDTH: usize = 1_024;
const LANE_COMPLETIONS: usize = 512;
const JITTER_SCALE: f64 = 0.03;
const SYMBOLS: &[u8] = b"abcdefghijklmnopqrstuvwxyz$";

const BAD_SUBSTRINGS: &[&str] = &[
    "fuck", "shit", "cunt", "dick", "cock", "bitch", "bastard", "whore", "slut", "porn", "nazi",
    "nigg", "retard", "damn", "crap", "turd", "fart", "puke", "vomit", "poop", "defect", "fraud",
    "scam", "lousy", "kill", "mong",
];

const METAPHOR_TAILS: &[&str] = &[
    "flow", "forge", "spark", "seed", "craft", "nest", "lab", "wave", "link", "pulse", "beam",
    "grid", "vault", "relay", "trace", "scope", "prism", "lumen", "nova", "peak", "trail", "path",
    "signal", "hive", "smith", "harbor", "grove", "spring", "frame", "glow", "flux", "loom",
    "muse", "atlas",
];

#[derive(Clone)]
struct CharModel {
    counts: HashMap<[u8; 2], [f64; 27]>,
    totals: HashMap<[u8; 2], f64>,
}

impl CharModel {
    fn train<'a>(names: impl IntoIterator<Item = &'a str>) -> Self {
        Self::train_weighted(names.into_iter().map(|name| (name, 1.0)))
    }

    fn train_weighted<'a>(names: impl IntoIterator<Item = (&'a str, f64)>) -> Self {
        let mut counts: HashMap<[u8; 2], [f64; 27]> = HashMap::new();
        let mut totals: HashMap<[u8; 2], f64> = HashMap::new();
        for (name, weight) in names {
            let mut sequence = Vec::with_capacity(name.len() + 3);
            sequence.extend_from_slice(b"^^");
            sequence.extend_from_slice(name.as_bytes());
            sequence.push(b'$');
            for window in sequence.windows(3) {
                let context = [window[0], window[1]];
                let Some(index) = symbol_index(window[2]) else {
                    continue;
                };
                counts.entry(context).or_insert([0.0; 27])[index] += weight;
                *totals.entry(context).or_insert(0.0) += weight;
            }
        }
        Self { counts, totals }
    }

    fn probability(&self, context: [u8; 2], symbol: u8) -> f64 {
        let index = symbol_index(symbol).expect("fixed symbol alphabet");
        let count = self
            .counts
            .get(&context)
            .map(|values| values[index])
            .unwrap_or(0.0);
        let total = self.totals.get(&context).copied().unwrap_or(0.0);
        (count + SMOOTHING) / (total + SMOOTHING * SYMBOLS.len() as f64)
    }

    fn log_likelihood(&self, name: &str) -> f64 {
        let mut context = [b'^', b'^'];
        let mut total = 0.0;
        let mut steps = 0usize;
        for symbol in name.bytes().chain(std::iter::once(b'$')) {
            total += self.probability(context, symbol).ln();
            context = [context[1], symbol];
            steps += 1;
        }
        total / steps as f64
    }

    fn beam(&self, semantic: &Self, seed: u64) -> Vec<String> {
        let mut states = vec![(Vec::<u8>::new(), [b'^', b'^'], 0.0f64)];
        let mut completed: Vec<(String, f64)> = Vec::new();
        for _ in 0..=12 {
            let mut next = Vec::new();
            for (prefix, context, score) in states {
                for &symbol in SYMBOLS {
                    if symbol == b'$' && prefix.len() < 4 {
                        continue;
                    }
                    if prefix.len() == 12 && symbol != b'$' {
                        continue;
                    }
                    let transition = FORM_WEIGHT * self.probability(context, symbol).ln()
                        + SEMANTIC_WEIGHT * semantic.probability(context, symbol).ln()
                        + transition_jitter(seed, &prefix, symbol);
                    let next_score = score + transition;
                    if symbol == b'$' {
                        if let Ok(name) = String::from_utf8(prefix.clone()) {
                            completed.push((name, next_score));
                        }
                    } else {
                        let mut extended = prefix.clone();
                        extended.push(symbol);
                        next.push((extended, [context[1], symbol], next_score));
                    }
                }
            }
            next.sort_by(|left, right| {
                right
                    .2
                    .total_cmp(&left.2)
                    .then_with(|| left.0.cmp(&right.0))
            });
            next.truncate(BEAM_WIDTH);
            states = next;
            if states.is_empty() {
                break;
            }
        }
        completed.sort_by(|left, right| {
            right
                .1
                .total_cmp(&left.1)
                .then_with(|| left.0.cmp(&right.0))
        });
        let mut seen = HashSet::new();
        completed
            .into_iter()
            .filter_map(|(name, _)| seen.insert(name.clone()).then_some(name))
            .take(LANE_COMPLETIONS)
            .collect()
    }
}

fn transition_jitter(seed: u64, prefix: &[u8], symbol: u8) -> f64 {
    let mut value = 14695981039346656037u64;
    for byte in seed
        .to_le_bytes()
        .into_iter()
        .chain(std::iter::once(b'|'))
        .chain(prefix.iter().copied())
        .chain(std::iter::once(b'|'))
        .chain(std::iter::once(symbol))
    {
        value ^= byte as u64;
        value = value.wrapping_mul(1099511628211);
    }
    ((value as f64 / u64::MAX as f64) - 0.5) * JITTER_SCALE
}

fn symbol_index(symbol: u8) -> Option<usize> {
    match symbol {
        b'a'..=b'z' => Some((symbol - b'a') as usize),
        b'$' => Some(26),
        _ => None,
    }
}

#[derive(Clone)]
struct BriefSpec {
    text: String,
    keywords: Vec<String>,
    groups: Vec<Vec<String>>,
    models: Vec<CharModel>,
    roots: Vec<String>,
}

#[derive(Clone, Deserialize)]
struct Anchor {
    term: String,
    score: f64,
}

#[derive(Deserialize)]
struct AnchorRow {
    keyword: String,
    anchors: Vec<Anchor>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
struct Rejections {
    no_sample: usize,
    duplicate: usize,
    root_copy: usize,
    hazard: usize,
    structural: usize,
    form_floor: usize,
    collision: usize,
    quality: usize,
}

impl Rejections {
    fn new() -> Self {
        Self {
            no_sample: 0,
            duplicate: 0,
            root_copy: 0,
            hazard: 0,
            structural: 0,
            form_floor: 0,
            collision: 0,
            quality: 0,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
struct Candidate {
    name: String,
    source_group: usize,
    global_logp: f64,
    semantic_logp: f64,
    wrong_max_logp: f64,
    condition_margin: f64,
    score_pronounce: u32,
    score_novelty: u32,
    score_memorability: u32,
    composite: u32,
    syllables: usize,
    template_tail: bool,
    origin: &'static str,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
struct Page {
    brief: String,
    seed: u64,
    keywords: Vec<String>,
    anchor_groups: Vec<Vec<String>>,
    attempts: usize,
    rejections: Rejections,
    pool: Vec<Candidate>,
    selected: Vec<Candidate>,
    page_diversity: f64,
}

#[derive(Serialize)]
struct Report {
    schema: &'static str,
    partition: String,
    global_form_floor: f64,
    train_count: usize,
    validation_count: usize,
    pages: Vec<Page>,
    summary: serde_json::Value,
    gates: BTreeMap<String, bool>,
}

struct CollisionIndex {
    exact: HashSet<String>,
    deletion_forms: HashSet<String>,
    substitution_signatures: HashSet<(usize, String)>,
}

impl CollisionIndex {
    fn new(values: impl IntoIterator<Item = String>) -> Self {
        let exact: HashSet<String> = values
            .into_iter()
            .map(|value| value.to_ascii_lowercase())
            .filter(|value| {
                !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_lowercase())
            })
            .collect();
        let mut deletion_forms = HashSet::new();
        let mut substitution_signatures = HashSet::new();
        for value in &exact {
            for offset in 0..value.len() {
                let deleted = delete_ascii(value, offset);
                deletion_forms.insert(deleted.clone());
                substitution_signatures.insert((value.len(), deleted));
            }
        }
        Self {
            exact,
            deletion_forms,
            substitution_signatures,
        }
    }

    fn collides(&self, candidate: &str) -> bool {
        if self.exact.contains(candidate) || self.deletion_forms.contains(candidate) {
            return true;
        }
        for offset in 0..candidate.len() {
            let deleted = delete_ascii(candidate, offset);
            if self.exact.contains(&deleted)
                || self
                    .substitution_signatures
                    .contains(&(candidate.len(), deleted))
            {
                return true;
            }
        }
        false
    }
}

fn delete_ascii(value: &str, offset: usize) -> String {
    let mut deleted = String::with_capacity(value.len().saturating_sub(1));
    deleted.push_str(&value[..offset]);
    deleted.push_str(&value[offset + 1..]);
    deleted
}

fn fnv1a64(text: &str) -> u64 {
    let mut value = 14695981039346656037u64;
    for byte in text.bytes() {
        value ^= byte as u64;
        value = value.wrapping_mul(1099511628211);
    }
    value
}

fn lines(raw: &str) -> impl Iterator<Item = String> + '_ {
    raw.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(str::to_ascii_lowercase)
}

fn read_lines(path: &Path) -> Result<Vec<String>, Box<dyn Error>> {
    Ok(fs::read_to_string(path)?
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

fn build_specs(
    briefs: Vec<String>,
    anchors_by_keyword: &HashMap<String, Vec<Anchor>>,
) -> Vec<BriefSpec> {
    let mut ordered = briefs;
    ordered.sort_by(|left, right| (fnv1a64(left), left).cmp(&(fnv1a64(right), right)));
    ordered
        .into_iter()
        .map(|text| {
            let keywords = extract_keywords(&text, 6);
            let anchor_rows: Vec<&Vec<Anchor>> = keywords
                .iter()
                .filter_map(|keyword| anchors_by_keyword.get(keyword))
                .filter(|anchors| !anchors.is_empty())
                .collect();
            let groups: Vec<Vec<String>> = anchor_rows
                .iter()
                .map(|anchors| anchors.iter().map(|anchor| anchor.term.clone()).collect())
                .collect();
            let models = anchor_rows
                .iter()
                .map(|anchors| {
                    let maximum = anchors
                        .iter()
                        .map(|anchor| anchor.score)
                        .max_by(f64::total_cmp)
                        .unwrap_or(1.0);
                    CharModel::train_weighted(
                        anchors
                            .iter()
                            .map(|anchor| (anchor.term.as_str(), anchor.score / maximum)),
                    )
                })
                .collect();
            let mut roots: Vec<String> = groups.iter().flatten().cloned().collect();
            roots.sort();
            roots.dedup();
            BriefSpec {
                text,
                keywords,
                groups,
                models,
                roots,
            }
        })
        .collect()
}

fn brief_semantic_logp(spec: &BriefSpec, name: &str) -> f64 {
    spec.models
        .iter()
        .map(|model| model.log_likelihood(name))
        .max_by(f64::total_cmp)
        .unwrap_or(f64::NEG_INFINITY)
}

fn wrong_max_logp(specs: &[BriefSpec], current: usize, name: &str) -> f64 {
    (1..=9)
        .map(|offset| brief_semantic_logp(&specs[(current + offset) % specs.len()], name))
        .max_by(f64::total_cmp)
        .unwrap_or(f64::NEG_INFINITY)
}

fn title_case(lower: &str) -> String {
    let mut chars = lower.chars();
    match chars.next() {
        Some(first) => first.to_ascii_uppercase().to_string() + chars.as_str(),
        None => String::new(),
    }
}

fn make_result(lower: &str, dictionary: &HashSet<String>) -> NameResult {
    let name = title_case(lower);
    NameResult {
        name: name.clone(),
        style: Style::BigTech,
        syllables: syllable_count(lower),
        score_pronounce: score_pronounceability(lower),
        score_novelty: score_novelty(lower, dictionary),
        score_memorability: score_memorability(lower),
        connotations: neologism_core::connotation::connotations(&name),
    }
}

fn has_template_tail(lower: &str) -> bool {
    tech_suffix_of(lower).is_some()
        || METAPHOR_TAILS
            .iter()
            .any(|tail| lower.len() > tail.len() && lower.ends_with(tail))
}

fn has_root_copy(lower: &str, roots: &[String]) -> bool {
    roots
        .iter()
        .any(|root| root.len() >= 4 && lower.contains(root))
}

fn has_hazard(lower: &str) -> bool {
    BAD_SUBSTRINGS.iter().any(|hazard| lower.contains(hazard))
}

fn normalize(value: f64, minimum: f64, maximum: f64) -> f64 {
    if maximum > minimum {
        (value - minimum) / (maximum - minimum)
    } else {
        0.0
    }
}

fn levenshtein(left: &str, right: &str) -> usize {
    let right_bytes = right.as_bytes();
    let mut previous: Vec<usize> = (0..=right_bytes.len()).collect();
    let mut current = vec![0usize; right_bytes.len() + 1];
    for (left_index, left_byte) in left.bytes().enumerate() {
        current[0] = left_index + 1;
        for (right_index, right_byte) in right_bytes.iter().enumerate() {
            current[right_index + 1] = (previous[right_index + 1] + 1)
                .min(current[right_index] + 1)
                .min(previous[right_index] + usize::from(left_byte != *right_byte));
        }
        std::mem::swap(&mut previous, &mut current);
    }
    previous[right_bytes.len()]
}

fn similarity(left: &str, right: &str) -> f64 {
    let maximum = left.len().max(right.len()).max(1) as f64;
    1.0 - levenshtein(left, right) as f64 / maximum
}

fn name_diversity(names: &[String]) -> f64 {
    if names.len() < 2 {
        return 0.0;
    }
    let mut total = 0.0;
    let mut pairs = 0usize;
    for left in 0..names.len() {
        for right in left + 1..names.len() {
            total += 1.0 - similarity(&names[left], &names[right]);
            pairs += 1;
        }
    }
    total / pairs as f64
}

fn select(pool: &[Candidate]) -> Vec<Candidate> {
    if pool.is_empty() {
        return Vec::new();
    }
    let min_global = pool
        .iter()
        .map(|candidate| candidate.global_logp)
        .min_by(f64::total_cmp)
        .unwrap();
    let max_global = pool
        .iter()
        .map(|candidate| candidate.global_logp)
        .max_by(f64::total_cmp)
        .unwrap();
    let min_semantic = pool
        .iter()
        .map(|candidate| candidate.semantic_logp)
        .min_by(f64::total_cmp)
        .unwrap();
    let max_semantic = pool
        .iter()
        .map(|candidate| candidate.semantic_logp)
        .max_by(f64::total_cmp)
        .unwrap();
    let relevance: Vec<f64> = pool
        .iter()
        .map(|candidate| {
            0.65 * candidate.composite as f64 / 100.0
                + 0.20 * normalize(candidate.global_logp, min_global, max_global)
                + 0.15 * normalize(candidate.semantic_logp, min_semantic, max_semantic)
        })
        .collect();
    let eligible_groups: BTreeSet<usize> = pool
        .iter()
        .map(|candidate| candidate.source_group)
        .collect();
    let cap = match eligible_groups.len() {
        0 | 1 => 10,
        2 => 5,
        _ => 4,
    };
    let mut remaining: Vec<usize> = (0..pool.len()).collect();
    remaining.sort_by(|left, right| pool[*left].name.cmp(&pool[*right].name));
    let mut selected: Vec<usize> = Vec::new();
    let mut group_counts: HashMap<usize, usize> = HashMap::new();
    while selected.len() < PAGE_SIZE {
        let mut best: Option<(usize, f64)> = None;
        for &index in &remaining {
            if group_counts
                .get(&pool[index].source_group)
                .copied()
                .unwrap_or(0)
                >= cap
            {
                continue;
            }
            let max_similarity = selected
                .iter()
                .map(|selected_index| similarity(&pool[index].name, &pool[*selected_index].name))
                .fold(0.0, f64::max);
            let value = MMR_LAMBDA * relevance[index] - (1.0 - MMR_LAMBDA) * max_similarity;
            let replace = match best {
                None => true,
                Some((best_index, best_value)) => {
                    value > best_value
                        || (value == best_value && pool[index].name < pool[best_index].name)
                }
            };
            if replace {
                best = Some((index, value));
            }
        }
        let Some((index, _)) = best else {
            break;
        };
        selected.push(index);
        *group_counts.entry(pool[index].source_group).or_insert(0) += 1;
        remaining.retain(|candidate| *candidate != index);
    }
    selected
        .into_iter()
        .map(|index| pool[index].clone())
        .collect()
}

fn generate_page(
    specs: &[BriefSpec],
    brief_index: usize,
    seed: u64,
    global: &CharModel,
    form_floor: f64,
    collision: &CollisionIndex,
    dictionary: &HashSet<String>,
) -> Page {
    let spec = &specs[brief_index];
    let mut attempts = 0usize;
    let mut rejections = Rejections::new();
    let mut seen = HashSet::new();
    let mut pool = Vec::new();
    let lanes: Vec<Vec<String>> = spec
        .models
        .iter()
        .enumerate()
        .map(|(index, model)| {
            global.beam(
                model,
                seed ^ fnv1a64(&spec.text) ^ (index as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15),
            )
        })
        .collect();
    let mut rank = 0usize;
    while attempts < MAX_ATTEMPTS && pool.len() < POOL_SIZE && !lanes.is_empty() {
        let mut progressed = false;
        for source_group in 0..lanes.len() {
            let Some(lower) = lanes[source_group].get(rank).cloned() else {
                continue;
            };
            progressed = true;
            attempts += 1;
            if attempts > MAX_ATTEMPTS || pool.len() >= POOL_SIZE {
                break;
            }
            if !seen.insert(lower.clone()) {
                rejections.duplicate += 1;
                continue;
            }
            if has_root_copy(&lower, &spec.roots) {
                rejections.root_copy += 1;
                continue;
            }
            if has_hazard(&lower) {
                rejections.hazard += 1;
                continue;
            }
            let syllables = syllable_count(&lower);
            if !is_valid(&lower, Style::BigTech)
                || !respects_sonority(&lower)
                || !(1..=3).contains(&syllables)
            {
                rejections.structural += 1;
                continue;
            }
            let global_logp = global.log_likelihood(&lower);
            if global_logp < form_floor {
                rejections.form_floor += 1;
                continue;
            }
            if collision.collides(&lower) {
                rejections.collision += 1;
                continue;
            }
            let result = make_result(&lower, dictionary);
            let composite = composite_score(&result);
            if composite < 75 {
                rejections.quality += 1;
                continue;
            }
            let semantic_logp = brief_semantic_logp(spec, &lower);
            let wrong_max_logp = wrong_max_logp(specs, brief_index, &lower);
            pool.push(Candidate {
                name: result.name,
                source_group,
                global_logp,
                semantic_logp,
                wrong_max_logp,
                condition_margin: semantic_logp - wrong_max_logp,
                score_pronounce: result.score_pronounce,
                score_novelty: result.score_novelty,
                score_memorability: result.score_memorability,
                composite,
                syllables,
                template_tail: has_template_tail(&lower),
                origin: "conceptnet_lattice",
            });
        }
        if !progressed {
            break;
        }
        rank += 1;
    }
    if pool.is_empty() {
        rejections.no_sample = lanes.iter().filter(|lane| lane.is_empty()).count();
    }
    pool.sort_by(|left, right| left.name.cmp(&right.name));
    let selected = select(&pool);
    let selected_names: Vec<String> = selected
        .iter()
        .map(|candidate| candidate.name.to_ascii_lowercase())
        .collect();
    Page {
        brief: spec.text.clone(),
        seed,
        keywords: spec.keywords.clone(),
        anchor_groups: spec.groups.clone(),
        attempts,
        rejections,
        pool,
        selected,
        page_diversity: name_diversity(&selected_names),
    }
}

fn build_pages(
    specs: &[BriefSpec],
    indices: &[usize],
    global: &CharModel,
    form_floor: f64,
    collision: &CollisionIndex,
    dictionary: &HashSet<String>,
) -> Vec<Page> {
    let mut pages = Vec::new();
    for &index in indices {
        for &seed in SEEDS {
            pages.push(generate_page(
                specs, index, seed, global, form_floor, collision, dictionary,
            ));
        }
    }
    pages
}

fn summarize(
    pages: &[Page],
    form_floor: f64,
    replay: bool,
) -> (serde_json::Value, BTreeMap<String, bool>) {
    let selected: Vec<&Candidate> = pages.iter().flat_map(|page| page.selected.iter()).collect();
    let total = selected.len();
    let quality_sum: u64 = selected
        .iter()
        .map(|candidate| candidate.composite as u64)
        .sum();
    let average_quality = if total > 0 {
        quality_sum as f64 / total as f64
    } else {
        0.0
    };
    let minimum_quality = selected
        .iter()
        .map(|candidate| candidate.composite)
        .min()
        .unwrap_or(0);
    let mean_diversity = if pages.is_empty() {
        0.0
    } else {
        pages.iter().map(|page| page.page_diversity).sum::<f64>() / pages.len() as f64
    };
    let minimum_diversity = pages
        .iter()
        .map(|page| page.page_diversity)
        .min_by(f64::total_cmp)
        .unwrap_or(0.0);

    let mut pages_by_brief: BTreeMap<&str, Vec<&Page>> = BTreeMap::new();
    for page in pages {
        pages_by_brief.entry(&page.brief).or_default().push(page);
    }
    let mut minimum_brief_unique = usize::MAX;
    let mut overlaps = Vec::new();
    for brief_pages in pages_by_brief.values() {
        let mut unique = BTreeSet::new();
        let sets: Vec<BTreeSet<&str>> = brief_pages
            .iter()
            .map(|page| {
                page.selected
                    .iter()
                    .map(|candidate| candidate.name.as_str())
                    .collect()
            })
            .collect();
        for names in &sets {
            unique.extend(names.iter().copied());
        }
        minimum_brief_unique = minimum_brief_unique.min(unique.len());
        for left in 0..sets.len() {
            for right in left + 1..sets.len() {
                overlaps.push(sets[left].intersection(&sets[right]).count());
            }
        }
    }
    if minimum_brief_unique == usize::MAX {
        minimum_brief_unique = 0;
    }
    let mean_overlap = if overlaps.is_empty() {
        0.0
    } else {
        overlaps.iter().sum::<usize>() as f64 / overlaps.len() as f64
    };
    let maximum_overlap = overlaps.iter().copied().max().unwrap_or(0);
    let page_sets: Vec<Vec<String>> = pages
        .iter()
        .map(|page| {
            let mut names: Vec<String> = page
                .selected
                .iter()
                .map(|candidate| candidate.name.to_ascii_lowercase())
                .collect();
            names.sort();
            names
        })
        .collect();
    let unique_page_sets: BTreeSet<Vec<String>> = page_sets.iter().cloned().collect();
    let duplicate_page_sets = page_sets.len().saturating_sub(unique_page_sets.len());
    let condition_wins = selected
        .iter()
        .filter(|candidate| candidate.semantic_logp > candidate.wrong_max_logp)
        .count();
    let condition_win_rate = if total > 0 {
        condition_wins as f64 / total as f64
    } else {
        0.0
    };
    let template_tails = selected
        .iter()
        .filter(|candidate| candidate.template_tail)
        .count();
    let template_tail_rate = if total > 0 {
        template_tails as f64 / total as f64
    } else {
        1.0
    };
    let all_form_floor = selected
        .iter()
        .all(|candidate| candidate.global_logp >= form_floor);
    let lane_coverage = pages.iter().all(|page| {
        let eligible: BTreeSet<usize> = page
            .pool
            .iter()
            .map(|candidate| candidate.source_group)
            .collect();
        let chosen: BTreeSet<usize> = page
            .selected
            .iter()
            .map(|candidate| candidate.source_group)
            .collect();
        eligible.len() < 2 || chosen.len() >= 2
    });
    let lane_caps_hold = pages.iter().all(|page| {
        let eligible: BTreeSet<usize> = page
            .pool
            .iter()
            .map(|candidate| candidate.source_group)
            .collect();
        let cap = match eligible.len() {
            0 | 1 => 10,
            2 => 5,
            _ => 4,
        };
        let mut counts: HashMap<usize, usize> = HashMap::new();
        for candidate in &page.selected {
            *counts.entry(candidate.source_group).or_insert(0) += 1;
        }
        counts.values().all(|count| *count <= cap)
    });

    let mut gates = BTreeMap::new();
    gates.insert(
        "all_pools_160".into(),
        pages.iter().all(|page| page.pool.len() == POOL_SIZE),
    );
    gates.insert(
        "all_pages_10".into(),
        pages.iter().all(|page| page.selected.len() == PAGE_SIZE),
    );
    gates.insert("all_form_floor".into(), all_form_floor);
    gates.insert(
        "average_quality_at_least_84".into(),
        average_quality >= 84.0,
    );
    gates.insert(
        "condition_win_rate_at_least_70pct".into(),
        condition_win_rate >= 0.70,
    );
    gates.insert("duplicate_page_sets_zero".into(), duplicate_page_sets == 0);
    gates.insert(
        "mean_diversity_at_least_0_72".into(),
        mean_diversity >= 0.72,
    );
    gates.insert("mean_overlap_at_most_1".into(), mean_overlap <= 1.0);
    gates.insert(
        "minimum_brief_unique_at_least_27".into(),
        minimum_brief_unique >= 27,
    );
    gates.insert(
        "minimum_diversity_at_least_0_60".into(),
        minimum_diversity >= 0.60,
    );
    gates.insert("minimum_quality_at_least_75".into(), minimum_quality >= 75);
    gates.insert("maximum_overlap_at_most_3".into(), maximum_overlap <= 3);
    gates.insert("same_process_replay".into(), replay);
    gates.insert(
        "template_tail_rate_at_most_20pct".into(),
        template_tail_rate <= 0.20,
    );
    gates.insert("unchanged_root_zero".into(), true);
    gates.insert("lexical_hazards_zero".into(), true);
    gates.insert("review_collisions_zero".into(), true);
    gates.insert("keyword_lane_coverage".into(), lane_coverage);
    gates.insert("keyword_lane_caps_hold".into(), lane_caps_hold);

    let summary = json!({
        "average_quality": average_quality,
        "condition_win_rate": condition_win_rate,
        "duplicate_page_sets": duplicate_page_sets,
        "full_pages": pages.iter().filter(|page| page.selected.len() == PAGE_SIZE).count(),
        "full_pools": pages.iter().filter(|page| page.pool.len() == POOL_SIZE).count(),
        "maximum_overlap": maximum_overlap,
        "mean_diversity": mean_diversity,
        "mean_overlap": mean_overlap,
        "minimum_brief_unique": minimum_brief_unique,
        "minimum_diversity": minimum_diversity,
        "minimum_quality": minimum_quality,
        "pages": pages.len(),
        "selected_cards": total,
        "template_tail_rate": template_tail_rate,
        "template_tails": template_tails,
    });
    (summary, gates)
}

struct Args {
    partition: String,
    train: PathBuf,
    validation: PathBuf,
    review: PathBuf,
    briefs: PathBuf,
    anchors: PathBuf,
    output: PathBuf,
}

fn parse_args() -> Result<Args, Box<dyn Error>> {
    let mut values: HashMap<String, String> = HashMap::new();
    let raw: Vec<String> = env::args().skip(1).collect();
    if raw.len() % 2 != 0 {
        return Err("arguments must be --key value pairs".into());
    }
    for pair in raw.chunks_exact(2) {
        values.insert(pair[0].clone(), pair[1].clone());
    }
    let take = |key: &str| -> Result<String, Box<dyn Error>> {
        values
            .get(key)
            .cloned()
            .ok_or_else(|| format!("missing {key}").into())
    };
    Ok(Args {
        partition: take("--partition")?,
        train: PathBuf::from(take("--train")?),
        validation: PathBuf::from(take("--validation")?),
        review: PathBuf::from(take("--review")?),
        briefs: PathBuf::from(take("--briefs")?),
        anchors: PathBuf::from(take("--anchors")?),
        output: PathBuf::from(take("--output")?),
    })
}

fn main() -> Result<(), Box<dyn Error>> {
    let args = parse_args()?;
    if args.partition != "development" && args.partition != "test" {
        return Err("partition must be development or test".into());
    }
    let train = read_lines(&args.train)?;
    let validation = read_lines(&args.validation)?;
    if train.len() != 10_138 || validation.len() != 1_260 {
        return Err(format!(
            "unexpected corpus counts: train={} validation={}",
            train.len(),
            validation.len()
        )
        .into());
    }
    let global = CharModel::train(train.iter().map(String::as_str));
    let mut validation_scores: Vec<f64> = validation
        .iter()
        .map(|name| global.log_likelihood(name))
        .collect();
    validation_scores.sort_by(f64::total_cmp);
    let floor_index = (validation_scores.len() as f64 * 0.10).floor() as usize;
    let form_floor = validation_scores[floor_index];

    let brief_values: Vec<String> = serde_json::from_str(&fs::read_to_string(&args.briefs)?)?;
    if brief_values.len() != 35 {
        return Err(format!("expected 35 briefs, got {}", brief_values.len()).into());
    }
    let mut anchors_by_keyword = HashMap::new();
    for (line_number, line) in fs::read_to_string(&args.anchors)?.lines().enumerate() {
        let row: AnchorRow = serde_json::from_str(line)
            .map_err(|error| format!("anchor line {}: {error}", line_number + 1))?;
        if row.anchors.is_empty()
            || row
                .anchors
                .iter()
                .any(|anchor| !anchor.score.is_finite() || anchor.score <= 0.0)
            || anchors_by_keyword
                .insert(row.keyword.clone(), row.anchors)
                .is_some()
        {
            return Err(format!("invalid anchor row for {}", row.keyword).into());
        }
    }
    if anchors_by_keyword.len() != 111 {
        return Err(format!("expected 111 anchor rows, got {}", anchors_by_keyword.len()).into());
    }
    let specs = build_specs(brief_values, &anchors_by_keyword);
    if specs.iter().any(|spec| spec.models.is_empty()) {
        return Err("a canonical brief has no semantic root group".into());
    }
    let indices: Vec<usize> = if args.partition == "development" {
        (0..24).collect()
    } else {
        (24..35).collect()
    };

    let review = read_lines(&args.review)?;
    let collision = CollisionIndex::new(
        review
            .into_iter()
            .chain(lines(BIGTECH))
            .chain(lines(ROOTS))
            .chain(lines(WORDS))
            .chain(lines(COMMON_WORDS))
            .chain(lines(ITALIAN))
            .chain(lines(JAPANESE)),
    );
    let dictionary: HashSet<String> = lines(WORDS).collect();
    let pages = build_pages(
        &specs,
        &indices,
        &global,
        form_floor,
        &collision,
        &dictionary,
    );
    let replay_pages = build_pages(
        &specs,
        &indices,
        &global,
        form_floor,
        &collision,
        &dictionary,
    );
    let replay = pages == replay_pages;
    let (summary, gates) = summarize(&pages, form_floor, replay);
    let passed = gates.values().all(|value| *value);
    let report = Report {
        schema: "neologism-conceptnet-lattice-report-v1",
        partition: args.partition,
        global_form_floor: form_floor,
        train_count: train.len(),
        validation_count: validation.len(),
        pages,
        summary,
        gates,
    };
    let mut bytes = serde_json::to_vec(&report)?;
    bytes.push(b'\n');
    fs::write(args.output, bytes)?;
    if passed {
        Ok(())
    } else {
        std::process::exit(2);
    }
}
