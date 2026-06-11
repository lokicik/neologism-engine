pub mod blend;
pub mod connotation;
pub mod exclude;
pub mod keywords;
pub mod markov;
pub mod metrics;
pub mod phonemes;
pub mod phonotactics;
pub mod score;
pub mod style;

use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};

use style::{Config, Style};
use markov::Model;
use phonemes::{affinity_score, Variant};
use phonotactics::{is_valid, is_valid_clustered, respects_sonority, syllable_count};
use score::{score_memorability, score_novelty, score_pronounceability};
use blend::{blend, compound, overlap_blend, tech_transform};
use exclude::ExcludeSet;

/// Tunable big-tech generation knobs (Phase 21). `Default` = production values;
/// the tuning harness ([core/examples/tune.rs]) sweeps these in-process. Only
/// big-tech reads them — Sci-Fi/Fantasy are unaffected.
#[derive(Debug, Clone)]
pub struct BigTechTuning {
    /// P(coined Markov) in the no-roots generator mix.
    pub markov_w: f64,
    /// P(blend) in the mix; remainder is short single-root evocative.
    pub blend_w: f64,
    /// Quality gate: candidates below `corpus_mean − gate_sigma·corpus_std` log-
    /// likelihood are rejected.
    pub gate_sigma: f64,
    /// Rank weight on pronounceability (fluency).
    pub fluency_w: f64,
    /// Rank weight on memorability (brevity).
    pub brevity_w: f64,
    /// MMR diversity-vs-quality balance (higher = more quality).
    pub mmr_lambda: f64,
    /// Reject names with more than this many syllables.
    pub syllable_cap: usize,
    /// Rank weight per char of longest real-word prefix (Forge·lab, Harbor·ai).
    /// Offline "brand-appeal" signal (Phase 28): names that open with a real word
    /// read more brandable. Empirically the strongest of the cheap offline signals.
    pub prefix_w: f64,
    /// Rank bonus for a clean brandable suffix (-ify/-io/-ai/-ia). Phase 28.
    pub suffix_w: f64,
    /// Rank penalty for a harsh consonant-cluster ending (Bear·ch, Aure·sh). Phase 28.
    pub harsh_w: f64,
    /// Phase 33: reject candidates within edit distance 1 of any excluded name.
    /// The exclude-recent window (Phase 30) blocks exact repeats only — this
    /// catches Keystona/Keystonn-style variants. false = pre-33 exact-only.
    pub fuzzy_exclude: bool,
    /// Phase 33: also reject candidates sharing a tech-suffix-stripped stem with
    /// an excluded name (Keystonify vs excluded Keyston → same stem). false = pre-33.
    pub stem_exclude: bool,
    /// Phase 33: max fraction of a batch sharing one tech suffix or one 3-char
    /// prefix. cap = max(1, ceil(count × max_share)). 1.0 disables the cap.
    /// Default 0.2 → cap 2 at count=10, preventing batches of e.g. 4 × "-ify".
    pub max_share: f64,
    /// Phase 35: the fuzzy (edit-1) and stem exclusion layers only cover the
    /// most recent `fuzzy_window` entries of cfg.exclude; exact-match covers
    /// the whole list. They must not scale together: there are only ~700
    /// single-root stems and edit-1 balls carpet the 4–12-char space, so
    /// session-scale fuzzy/stem exclusion starves generation, while exact
    /// exclusion blocks single points and is starvation-safe at any scale.
    pub fuzzy_window: usize,
}

impl Default for BigTechTuning {
    // Phase 21: values chosen by the tuning sweep (examples/tune.rs); the v=0
    // (max-quality) end of the variety axis below. syllable_cap kept at 3 (not the
    // sweep's 2, which would bar every 3-syllable name for negligible gain).
    fn default() -> Self {
        Self::from_variety(0.0)
    }
}

impl BigTechTuning {
    /// Map a `variety` knob in [0,1] onto the tuning, interpolating between a
    /// tight/best-quality preset (v=0 ≈ the Phase 21 sweep result) and a wide-
    /// spread preset (v=1). Higher variety loosens selection/ranking so a batch
    /// spans more shapes and registers — the fix for "names all feel the same".
    /// The quality floor (gate, syllable cap, junk/leak filters) is unchanged.
    pub fn from_variety(v: f64) -> Self {
        let v = v.clamp(0.0, 1.0);
        let lerp = |a: f64, b: f64| a + (b - a) * v;
        Self {
            // Shift the generator mix hard at high variety: less brand-Markov
            // (one register) toward blends + evocative single-roots (more shapes).
            markov_w: lerp(0.35, 0.20),
            blend_w: lerp(0.25, 0.40),
            // Keep the word-likeness gate tight even at high variety — variety
            // comes from the structural knobs below, NOT from admitting
            // low-brand-likelihood junk (Bombanac/Groqual).
            gate_sigma: lerp(1.5, 2.2),
            fluency_w: lerp(2.5, 0.0),
            brevity_w: lerp(2.5, 0.0),
            mmr_lambda: lerp(0.85, 0.50),
            syllable_cap: 3,
            // Brand-appeal nudges (Phase 28). The real-word-prefix and clean-suffix
            // rewards bias toward a brandable register, so they relax toward 0 at
            // high variety — exactly like fluency/brevity — letting coined,
            // non-word-starting shapes through. The harsh-ending penalty is a
            // junk signal, not a register one, so it stays on across the axis.
            prefix_w: lerp(0.10, 0.0),
            suffix_w: lerp(0.40, 0.0),
            harsh_w: 0.50,
            // Phase 33: anti-sameness floors — constant across the variety axis.
            fuzzy_exclude: true,
            stem_exclude: true,
            max_share: 0.20,
            // Phase 35: fuzzy/stem scope — constant across the variety axis.
            fuzzy_window: 2000,
        }
    }
}

const BIGTECH_CORPUS: &str = include_str!("../data/bigtech.txt");
const ROOTS: &str = include_str!("../data/roots.txt");
const ADJECTIVES: &str = include_str!("../data/adjectives.txt");
const WORDS: &str = include_str!("../data/words.txt");
// ~19k common English words — used ONLY to filter big-tech output so the model
// can't emit a plain real word as a "brand" (Guard, Telegraph, Content). Kept
// separate from WORDS so novelty scoring and Sci-Fi/Fantasy stay unchanged.
const COMMON_WORDS: &str = include_str!("../data/common_words.txt");

/// Substrings that make a bad/offensive brand name. Big-tech output containing
/// any of these is rejected. Kept to 4+ chars with low collision risk (no `ass`,
/// `anal`, `pee`, `rape`, `hell` — they hit innocent names like class/canal/speed/
/// shell). Catches connotation flubs (`Bitdefect`) and keeps output safe.
const BAD_SUBSTRINGS: &[&str] = &[
    "fuck", "shit", "cunt", "dick", "cock", "bitch", "bastard", "whore", "slut",
    "porn", "nazi", "nigg", "retard", "damn", "crap", "turd", "fart", "puke",
    "vomit", "poop", "defect", "fraud", "scam", "lousy",
];

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

/// Common-English-word set for the big-tech real-word filter (see COMMON_WORDS).
fn build_common_words() -> HashSet<String> {
    parse_lines(COMMON_WORDS).iter().map(|s| s.to_string()).collect()
}

/// Seed-independent big-tech setup, built once per process (Phase 34). Before
/// this cache every `generate` call re-parsed ~19k common words + ~5k brands,
/// retrained the order-3 backoff model (4 count tables) and re-scored the whole
/// corpus for the quality-gate floor — ~all of the per-call latency in the web
/// app, where each Generate click is a fresh call with a new seed. Everything
/// here is deterministic, so caching cannot change output. In WASM the statics
/// live for the module instance: the first click pays setup once.
struct BigtechStatic {
    roots: Vec<&'static str>,
    adjectives: Vec<&'static str>,
    /// Order-3 brand Markov with stupid-backoff: order-3 coherence (vs. the old
    /// wandering order-2) without dead-ending on the sparse brand corpus.
    model: Model,
    /// Never emit a real brand / root verbatim.
    corpus_set: HashSet<String>,
    /// Brands bucketed by char length for the mimic filter: its two cases only
    /// involve brands within ±2 chars of the candidate, so probing 5 buckets
    /// replaces a scan of the whole corpus (Phase 34 — pure speed).
    corpus_by_len: HashMap<usize, Vec<&'static str>>,
    common_words: HashSet<String>,
    /// Corpus log-likelihood stats; the gate floor is mean − gate_sigma·std,
    /// computed per call so gate_sigma stays a live tuning knob.
    ll_mean: f64,
    ll_std: f64,
}

static BIGTECH: OnceLock<BigtechStatic> = OnceLock::new();
static DICT: OnceLock<HashSet<String>> = OnceLock::new();

impl BigtechStatic {
    fn get() -> &'static Self {
        BIGTECH.get_or_init(|| {
            let corpus = parse_lines(BIGTECH_CORPUS);
            let roots = parse_lines(ROOTS);
            let adjectives = parse_lines(ADJECTIVES);
            let model = Model::train_backoff(&corpus, 3);
            let corpus_set: HashSet<String> = corpus
                .iter()
                .chain(roots.iter())
                .map(|s| s.to_lowercase())
                .collect();
            let mut corpus_by_len: HashMap<usize, Vec<&'static str>> = HashMap::new();
            for &w in &corpus {
                corpus_by_len.entry(w.chars().count()).or_default().push(w);
            }
            let common_words = build_common_words();
            let lls: Vec<f64> = corpus.iter().map(|w| model.log_likelihood(w)).collect();
            let mean = lls.iter().sum::<f64>() / lls.len() as f64;
            let var = lls.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / lls.len() as f64;
            Self {
                roots,
                adjectives,
                model,
                corpus_set,
                corpus_by_len,
                common_words,
                ll_mean: mean,
                ll_std: var.sqrt(),
            }
        })
    }
}

pub fn generate(cfg: &Config) -> Vec<NameResult> {
    generate_with_tuning(cfg, &BigTechTuning::from_variety(cfg.variety))
}

/// Like `generate`, but with explicit big-tech tuning knobs (for the sweep
/// harness). `tuning` only affects big-tech; Sci-Fi/Fantasy ignore it.
pub fn generate_with_tuning(cfg: &Config, tuning: &BigTechTuning) -> Vec<NameResult> {
    // Phase 34: dictionary cached once per process — contents identical to a
    // fresh build_dictionary(), so output is unchanged for every style.
    let dict = DICT.get_or_init(build_dictionary);
    let seed = cfg.seed.unwrap_or_else(|| rand::random());
    let mut rng = ChaCha8Rng::seed_from_u64(seed);

    match cfg.style {
        Style::BigTech => generate_bigtech(cfg, dict, &mut rng, tuning),
        Style::SciFi => {
            let corpus = variant_only_corpus(cfg).unwrap_or_else(scifi_corpus);
            generate_markov(cfg, dict, &mut rng, &corpus)
        }
        Style::Fantasy => {
            let corpus = variant_only_corpus(cfg).unwrap_or_else(fantasy_corpus);
            generate_markov(cfg, dict, &mut rng, &corpus)
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

/// Optional user constraints: starting prefix and/or required substring (both
/// case-insensitive). `lower` is the lowercased candidate name.
fn passes_constraints(lower: &str, cfg: &Config) -> bool {
    if let Some(s) = cfg.starts_with.as_deref() {
        let p = s.trim().to_lowercase();
        if !p.is_empty() && !lower.starts_with(&p) {
            return false;
        }
    }
    if let Some(sub) = cfg.contains.as_deref() {
        let c = sub.trim().to_lowercase();
        if !c.is_empty() && !lower.contains(&c) {
            return false;
        }
    }
    true
}

/// True if `name` reads as a broken real brand rather than a coinage: it is a
/// truncation or same-length typo (edit distance ≤ 2) of an equal-or-longer
/// brand. Rejects `Supaba`←supabase, `Gongodb`←mongodb; keeps genuine extensions
/// like `Hulumi`←hulu (the brand is shorter, so the name reads as its own word).
///
/// Phase 34: the hot path uses `mimics_real_brand_indexed` (by-length buckets);
/// this full-scan form is kept as the reference implementation the equivalence
/// test (`mimics_indexed_matches_scan`) checks against.
#[cfg_attr(not(test), allow(dead_code))]
fn mimics_real_brand(name: &str, brands: &[&str]) -> bool {
    let nlen = name.chars().count();
    brands.iter().any(|w| {
        let wlen = w.chars().count();
        // (a) Truncation / same-length typo of an equal-or-longer brand.
        if wlen >= nlen && wlen - nlen <= 2 && score::levenshtein(name, w) <= 2 {
            return true;
        }
        // (b) A distinctive brand (≥5 chars) padded by a 1–2 char prefix or
        // suffix (zocdoc→zocdocs, amazon→samazon) — reads as the brand, not a
        // coinage. (Short brands are skipped: too many coincidental substrings.)
        wlen >= 5 && nlen > wlen && nlen - wlen <= 2 && (name.starts_with(w) || name.ends_with(w))
    })
}

/// Same predicate as `mimics_real_brand`, probing a by-length brand index
/// instead of scanning the whole corpus (Phase 34 — pure speed). Both cases
/// only involve brands within ±2 chars of the candidate, so 5 length buckets
/// cover everything; `levenshtein_le2` is the allocation-free form of the
/// `levenshtein(..) <= 2` check. Equivalence is asserted by
/// `mimics_indexed_matches_scan`.
fn mimics_real_brand_indexed(name: &str, by_len: &HashMap<usize, Vec<&'static str>>) -> bool {
    let nlen = name.chars().count();
    // (a) Truncation / same-length typo of an equal-or-longer brand.
    for wlen in nlen..=nlen + 2 {
        if let Some(ws) = by_len.get(&wlen) {
            if ws.iter().any(|w| score::levenshtein_le2(name, w)) {
                return true;
            }
        }
    }
    // (b) A distinctive brand (≥5 chars) padded by a 1–2 char prefix or suffix.
    for wlen in nlen.saturating_sub(2)..nlen {
        if wlen < 5 {
            continue;
        }
        if let Some(ws) = by_len.get(&wlen) {
            if ws.iter().any(|w| name.starts_with(w) || name.ends_with(w)) {
                return true;
            }
        }
    }
    false
}

/// Blend two distinct roots, preferring a clean overlap seam (pin+interest→
/// pinterest) and falling back to prefix+suffix. None if too few/duplicate roots.
fn blend_roots(rng: &mut ChaCha8Rng, roots: &[&str]) -> Option<String> {
    if roots.len() < 2 {
        return None;
    }
    let a = roots[rand::Rng::gen_range(rng, 0..roots.len())];
    let b = roots[rand::Rng::gen_range(rng, 0..roots.len())];
    if a == b {
        return None;
    }
    overlap_blend(a, b).or_else(|| blend(a, b))
}

/// Offline "brand-appeal" score (Phase 28) — a cheap proxy for the *semantic*
/// quality the structural scores miss. Rewards names that open with a real word
/// and end in a clean brandable suffix; penalizes harsh consonant-cluster
/// endings. On the Phase 27 LLM-labeled set these signals lifted correlation with
/// the LLM's brand-quality judgment from ~0.19 to ~0.33; folded into ranking (not
/// gating), so it reshapes which names surface without changing what's allowed.
/// `lower` must be lowercase ASCII (always true for generated names).
fn brand_appeal(lower: &str, common: &HashSet<String>, t: &BigTechTuning) -> f64 {
    // Longest real-word prefix (≥3 chars): Forge·lab, Harbor·ai, Glide·hub.
    let mut prefix_len = 0usize;
    for j in (3..=lower.len()).rev() {
        if common.contains(&lower[..j]) {
            prefix_len = j;
            break;
        }
    }
    const CLEAN_SUFFIXES: [&str; 7] = ["ify", "io", "ai", "ia", "ly", "ix", "ora"];
    const HARSH_ENDINGS: [&str; 12] =
        ["rch", "tch", "sh", "ck", "sk", "ft", "rt", "rk", "nt", "st", "ld", "rd"];
    let clean = CLEAN_SUFFIXES.iter().any(|s| lower.ends_with(s));
    let harsh = HARSH_ENDINGS.iter().any(|s| lower.ends_with(s));
    prefix_len as f64 * t.prefix_w
        + if clean { t.suffix_w } else { 0.0 }
        - if harsh { t.harsh_w } else { 0.0 }
}

fn generate_bigtech(cfg: &Config, dict: &HashSet<String>, rng: &mut ChaCha8Rng, tuning: &BigTechTuning) -> Vec<NameResult> {
    // Phase 34: corpora, trained model, word sets and gate stats are cached —
    // all seed-independent, so repeated calls (one per Generate click) skip setup.
    let st = BigtechStatic::get();
    // Names the user has already seen this session — never repeat them.
    // Phase 33: ExcludeSet adds fuzzy (edit-1) and stem-level rejection on top
    // of exact-match. Phase 35: exact covers the whole list; fuzzy/stem only
    // the most recent fuzzy_window entries (see the BigTechTuning field doc).
    let exclude = ExcludeSet::new(&cfg.exclude, tuning.fuzzy_window);

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
        st.roots.clone()
    };

    // Overgenerate a pool, then keep the most brand-like by Markov word-likeness.
    let target = cfg.count * 5;
    let mut pool: Vec<NameResult> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let max_attempts = target * 80;

    // When the user supplies roots (description or seed words), blend purely from
    // them so re-ranking can't swap in generic names; otherwise use the weighted
    // generator mix below (coined Markov + clean blends + short evocative roots).
    let has_roots = !desc_keywords.is_empty() || !cfg.roots.is_empty();

    // Phonotactic-probability quality gate (Springer "I'd buy that!"): a default
    // candidate must be at least as brand-like as the low tail of real brands.
    // Skipped for user-roots (keyword fidelity) and compound (two real words).
    let apply_gate = !has_roots && !cfg.compound;
    let ll_floor = if apply_gate {
        st.ll_mean - tuning.gate_sigma * st.ll_std
    } else {
        f64::NEG_INFINITY
    };

    for _ in 0..max_attempts {
        if pool.len() >= target { break; }

        let name = if cfg.compound {
            // Adjective + noun compound (SwiftForge); already CamelCase.
            let adj = st.adjectives[rand::Rng::gen_range(rng, 0..st.adjectives.len())];
            let noun = st.roots[rand::Rng::gen_range(rng, 0..st.roots.len())];
            compound(adj, noun)
        } else if has_roots {
            // Blend purely from user roots / description keywords.
            let Some(b) = blend_roots(rng, &all_roots) else { continue };
            tech_transform(rng, &b, cfg.temperature)
        } else {
            // Weighted mix: mostly coined Markov, some clean blends, some short
            // single-root evocative names (root + tech suffix, à la Shopify).
            let pick = rand::Rng::gen::<f64>(rng);
            if pick < tuning.markov_w {
                let Some(s) = st.model.sample(rng, cfg.temperature, cfg.min_len, cfg.max_len) else { continue };
                tech_transform(rng, &s, cfg.temperature)
            } else if pick < tuning.markov_w + tuning.blend_w {
                let Some(b) = blend_roots(rng, &st.roots) else { continue };
                tech_transform(rng, &b, cfg.temperature)
            } else {
                let root = st.roots[rand::Rng::gen_range(rng, 0..st.roots.len())];
                tech_transform(rng, root, 1.0)
            }
        };

        let name = capitalize(&name);
        if name.len() < cfg.min_len || name.len() > cfg.max_len { continue; }
        let lower = name.to_lowercase();
        if !is_valid(&lower, Style::BigTech) { continue; }
        // Big-tech names should read naturally → enforce sonority sequencing.
        // Compounds join two real words, so skip the single-word sonority check.
        if !cfg.compound && !respects_sonority(&lower) { continue; }
        // Brand-shape: 1–3 syllables (research sweet spot); reject long mashups.
        if !cfg.compound && syllable_count(&lower) > tuning.syllable_cap { continue; }
        // Phonotactic-probability gate: reject candidates less brand-like than
        // the low tail of real brands (no-op when apply_gate is false).
        if st.model.log_likelihood(&name) < ll_floor { continue; }
        // Don't emit names that read as a truncated/typo'd real brand.
        if apply_gate && mimics_real_brand_indexed(&lower, &st.corpus_by_len) { continue; }
        // Never emit a real brand / root / dictionary word verbatim.
        if st.corpus_set.contains(&lower) || dict.contains(&lower) { continue; }
        // Reject plain real words (Guard, Telegraph) — big-tech only.
        if st.common_words.contains(&lower) { continue; }
        // Reject bad/offensive connotations (Bitdefect) — big-tech only.
        if BAD_SUBSTRINGS.iter().any(|b| lower.contains(b)) { continue; }
        if !passes_constraints(&lower, cfg) { continue; }
        // Phase 33: fuzzy + stem exclusion (most expensive filter — runs on survivors only).
        if exclude.rejects(&lower, tuning.fuzzy_exclude, tuning.stem_exclude) { continue; }
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

    // Rank leaning easy-to-say: brand-likeness (word-likelihood) is the lead
    // signal, plus a pronounceability/fluency bonus (processing fluency → trust)
    // and a brevity bonus from memorability. Brevity/fluency bias only applies
    // without user roots — with a description/seed words, keyword fidelity leads.
    let brevity_w = if has_roots { 0.0 } else { tuning.brevity_w };
    let fluency_w = if has_roots { 0.0 } else { tuning.fluency_w };
    // Brand-appeal nudge only without user roots — with a description/seed words,
    // keyword fidelity leads (same rationale as brevity/fluency above).
    let appeal_w = if has_roots { 0.0 } else { 1.0 };
    let rank = |r: &NameResult| {
        st.model.log_likelihood(&r.name)
            + (r.score_pronounce as f64 / 100.0) * fluency_w
            + (r.score_memorability as f64 / 100.0) * brevity_w
            + appeal_w * brand_appeal(&r.name.to_lowercase(), &st.common_words, tuning)
    };
    // Phase 34: rank each name once, then sort on the cached value — sort_by
    // with rank() inline recomputed log_likelihood + brand_appeal per comparison
    // (~10× the work). Same values, same comparator → identical order.
    let mut decorated: Vec<(f64, NameResult)> =
        pool.into_iter().map(|r| (rank(&r), r)).collect();
    decorated.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    let mut pool: Vec<NameResult> = decorated.into_iter().map(|(_, r)| r).collect();
    if has_roots {
        // User-supplied roots/description: preserve keyword fidelity, no diversity pass.
        pool.truncate(cfg.count);
        pool
    } else {
        // Keep the most brand-like as candidates, then diversify the final set.
        // Phase 33: mmr_select_capped enforces suffix/prefix structural caps so a
        // batch never contains more than max_share*count names sharing one suffix
        // or 3-char prefix — preventing e.g. 4×"-ify" at count=10.
        let share_cap = if tuning.max_share >= 1.0 {
            usize::MAX
        } else {
            ((cfg.count as f64 * tuning.max_share).ceil() as usize).max(1)
        };
        // Phase 34 tried ×8 overgeneration and a ×3 truncate here (cheap after
        // the setup cache): ×8 *lowered* 30k distinct 76→71% — a deeper pool
        // concentrates the rank top on the same attractors every batch — and ×3
        // cost 1.9 memorability points for +0.5pp distinct. Both reverted.
        pool.truncate(cfg.count * 2);
        metrics::mmr_select_capped(&pool, cfg.count, tuning.mmr_lambda, share_cap)
    }
}

fn generate_markov(cfg: &Config, dict: &HashSet<String>, rng: &mut ChaCha8Rng, corpus: &str) -> Vec<NameResult> {
    let names = parse_lines(corpus);
    let model = Model::train(&names, 3);
    // Never emit a training entry verbatim — this is a neologism engine.
    let corpus_set: HashSet<String> = names.iter().map(|s| s.to_lowercase()).collect();

    // Names the user has already seen this session — never repeat them.
    let exclude: HashSet<String> = cfg.exclude.iter().map(|s| s.to_lowercase()).collect();

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
    // Overgenerate so MMR (and variant affinity) have room to select from.
    let target = cfg.count * 4;
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
        if !passes_constraints(&lower, cfg) { continue; }
        if exclude.contains(&lower) { continue; }
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

    // For a variant, pre-bias the pool toward its phoneme profile so MMR selects
    // from on-profile candidates and sub-style flavor is preserved.
    if let Some(v) = variant {
        pool.sort_by(|a, b| {
            affinity_score(&b.name, v)
                .partial_cmp(&affinity_score(&a.name, v))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        pool.truncate(cfg.count * 2);
    }
    // Select the final set balancing quality and diversity (MMR). Sci-Fi/Fantasy
    // use a fixed lambda — the `variety` knob is a big-tech-only control (these
    // styles get their spread from variants), so their output stays stable.
    metrics::mmr_select(&pool, cfg.count, 0.7)
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
            variety: 0.5,
            seed: Some(42),
            roots: vec![],
            variant: None,
            description: None,
            compound: false,
            starts_with: None,
            contains: None,
            exclude: vec![],
        }
    }

    #[test]
    fn brand_appeal_orders_by_quality() {
        let t = BigTechTuning::default();
        let common = build_common_words();
        // A name opening with a real word and a clean suffix should outscore a
        // harsh-ending coined mashup (the exact gradient the feature targets).
        let good = brand_appeal("forgeify", &common, &t); // "forge" prefix + "ify" suffix
        let harsh = brand_appeal("bearch", &common, &t); // harsh "-rch" ending
        assert!(good > harsh, "good={good} should beat harsh={harsh}");
        // Harsh ending is penalized below a neutral coined name.
        let neutral = brand_appeal("zentu", &common, &t);
        assert!(harsh < neutral, "harsh={harsh} should be penalized below neutral={neutral}");
    }

    #[test]
    fn constraints_filter_output() {
        let mut c = cfg(Style::Fantasy);
        c.count = 8;
        c.starts_with = Some("a".to_string());
        for r in generate(&c) {
            assert!(r.name.to_lowercase().starts_with('a'), "{} ignored starts_with", r.name);
        }
        let mut c2 = cfg(Style::SciFi);
        c2.count = 6;
        c2.contains = Some("ar".to_string());
        for r in generate(&c2) {
            assert!(r.name.to_lowercase().contains("ar"), "{} ignored contains", r.name);
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
    fn bigtech_names_within_syllable_cap() {
        // Brand-shape rule: default big-tech names stay at 1–3 syllables.
        let mut c = cfg(Style::BigTech);
        c.count = 12;
        c.max_len = 12;
        for r in generate(&c) {
            assert!(syllable_count(&r.name.to_lowercase()) <= 3, "{} has >3 syllables", r.name);
        }
    }

    #[test]
    fn mimics_real_brand_flags_truncations() {
        let brands = ["supabase", "mongodb", "hulu", "stripe"];
        // Truncation / same-length typo of an equal-or-longer brand → flagged.
        assert!(mimics_real_brand("supaba", &brands));
        assert!(mimics_real_brand("gongodb", &brands));
        // Genuine extension of a shorter brand, or an unrelated coinage → kept.
        assert!(!mimics_real_brand("hulumi", &brands));
        assert!(!mimics_real_brand("zephyrium", &brands));
        // A distinctive brand padded by a short prefix/suffix → flagged.
        assert!(mimics_real_brand("supabasey", &["supabase"])); // suffix pad
        assert!(mimics_real_brand("xstripe", &["stripe"]));     // prefix pad
        // A coinage that merely shares a stem with a brand → kept.
        assert!(!mimics_real_brand("twility", &["twilio"]));
    }

    #[test]
    fn bigtech_excludes_common_words() {
        // No big-tech name should be a plain common English word.
        let common = build_common_words();
        let mut c = cfg(Style::BigTech);
        c.count = 20;
        for r in generate(&c) {
            assert!(!common.contains(&r.name.to_lowercase()), "{} is a common word", r.name);
        }
    }

    #[test]
    fn bigtech_avoids_brand_mimics() {
        // No default big-tech name should be a truncated/typo'd real brand.
        let brands = parse_lines(BIGTECH_CORPUS);
        let mut c = cfg(Style::BigTech);
        c.count = 15;
        for r in generate(&c) {
            assert!(!mimics_real_brand(&r.name.to_lowercase(), &brands),
                "{} mimics a real brand", r.name);
        }
    }

    #[test]
    fn mimics_indexed_matches_scan() {
        // The by-length index (Phase 34) must give the same verdict as the full
        // corpus scan for every probe — truncations, pads, typos, unrelated.
        let st = BigtechStatic::get();
        let corpus = parse_lines(BIGTECH_CORPUS);
        let probes = [
            "supaba", "gongodb", "hulumi", "zephyrium", "xstripe", "supabasey",
            "twility", "googl", "googler", "spotif", "notione", "zzzz",
            "keyston", "vantaflow", "amazo", "samazon", "figm", "figmaa",
        ];
        for p in probes {
            assert_eq!(
                mimics_real_brand_indexed(p, &st.corpus_by_len),
                mimics_real_brand(p, &corpus),
                "indexed vs scan disagree on {p}"
            );
        }
    }

    #[test]
    fn levenshtein_le2_matches_full() {
        // Bounded check must agree with the full DP on representative pairs.
        let pairs = [
            ("supaba", "supabase"), ("gongodb", "mongodb"), ("abc", "abc"),
            ("abc", "abd"), ("abc", "xyz"), ("short", "shortest"),
            ("keyston", "keystone"), ("a", "abc"), ("", "ab"), ("", "abc"),
        ];
        for (a, b) in pairs {
            assert_eq!(
                score::levenshtein_le2(a, b),
                score::levenshtein(a, b) <= 2,
                "le2 vs full disagree on ({a}, {b})"
            );
        }
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
