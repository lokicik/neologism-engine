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

use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use blend::{
    blend, compound, concept_transform, naming_transform, overlap_blend, semantic_join,
    tech_transform,
};
use exclude::ExcludeSet;
use markov::Model;
use phonemes::{affinity_score, Variant};
use phonotactics::{is_valid, is_valid_clustered, is_vowel, respects_sonority, syllable_count};
use score::{score_memorability, score_novelty, score_pronounceability};
use style::{Config, Style};

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
    /// Rank bonus for a clean brandable suffix (-ify/-io/-ai/-ia) when no
    /// project description is available. Phase 28.
    pub suffix_w: f64,
    /// Reduced suffix bonus for descriptions spanning multiple concept groups.
    /// It keeps a compact coined-name lane beside literal two-root joins. A
    /// single known concept needs no suffix bonus because its root already
    /// supplies the meaning.
    pub concept_suffix_w: f64,
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
    /// Expand prompt keywords through a curated offline concept lexicon before
    /// blending. Kept as a switch so quality harnesses can compare old/new paths.
    pub concept_expand: bool,
    /// Bonus for carrying an additional prompt concept in a coined name.
    /// Exposed to the A/B harness so semantic fidelity can be balanced against
    /// names that read like literal two-root labels.
    pub concept_coverage_w: f64,
    /// Candidate share reserved for readable root+metaphor forms on a
    /// single-concept first page. Multi-concept and continuation mixes are
    /// intentionally independent.
    pub single_concept_metaphor_w: f64,
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
            concept_suffix_w: lerp(0.20, 0.0),
            harsh_w: 0.50,
            // Phase 33: anti-sameness floors — constant across the variety axis.
            fuzzy_exclude: true,
            stem_exclude: true,
            max_share: 0.20,
            // Phase 35: fuzzy/stem scope — constant across the variety axis.
            fuzzy_window: 2000,
            concept_expand: true,
            concept_coverage_w: 0.25,
            single_concept_metaphor_w: 0.20,
        }
    }
}

const BIGTECH_CORPUS: &str = include_str!("../data/bigtech.txt");
const ROOTS: &str = include_str!("../data/roots.txt");
const ADJECTIVES: &str = include_str!("../data/adjectives.txt");
// Phase 36: extra curated evocative real words for the real-word naming mode
// (Apple/Notion-style). Filtered against roots/adjectives/brands at curation.
const REALWORDS: &str = include_str!("../data/realwords.txt");
const WORDS: &str = include_str!("../data/words.txt");
// Curated second halves for the small exploration lane in description-driven
// Brandable generation. Each remains readable after a semantic root
// (LexFlow, AuraGlow, KeySmith) without becoming a random object pairing.
const CONCEPT_METAPHORS: &[&str] = &[
    "flow", "forge", "spark", "seed", "craft", "nest", "lab", "wave", "link", "pulse", "beam",
    "grid", "vault", "relay", "trace", "scope", "prism", "lumen", "nova", "peak", "trail", "path",
    "signal", "hive", "smith", "harbor", "grove", "spring", "frame", "glow", "flux", "loom",
    "muse", "atlas",
];
// ~19k common English words — used ONLY to filter big-tech output so the model
// can't emit a plain real word as a "brand" (Guard, Telegraph, Content). Kept
// separate from WORDS so novelty scoring and Sci-Fi/Fantasy stay unchanged.
const COMMON_WORDS: &str = include_str!("../data/common_words.txt");

/// Substrings that make a bad/offensive brand name. Big-tech output containing
/// any of these is rejected. Kept to 4+ chars with low collision risk (no `ass`,
/// `anal`, `pee`, `rape`, `hell` — they hit innocent names like class/canal/speed/
/// shell). Catches connotation flubs (`Bitdefect`) and keeps output safe.
const BAD_SUBSTRINGS: &[&str] = &[
    "fuck", "shit", "cunt", "dick", "cock", "bitch", "bastard", "whore", "slut", "porn", "nazi",
    "nigg", "retard", "damn", "crap", "turd", "fart", "puke", "vomit", "poop", "defect", "fraud",
    "scam", "lousy", "kill",
    // Phase 48: a blend seam produced mood+journaling → "mong" (UK slur).
    "mong",
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
    [
        FANTASY_ELVISH,
        FANTASY_DWARVISH,
        FANTASY_ORCISH,
        FANTASY_COMMON,
    ]
    .join("\n")
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
    parse_lines(WORDS)
        .iter()
        .map(|s| s.to_lowercase())
        .collect()
}

/// Common-English-word set for the big-tech real-word filter (see COMMON_WORDS).
fn build_common_words() -> HashSet<String> {
    parse_lines(COMMON_WORDS)
        .iter()
        .map(|s| s.to_string())
        .collect()
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
    /// Phase 36: the real-word mode pool — roots + adjectives + realwords.txt,
    /// 4–9 chars, deduped. These are emitted VERBATIM in real-word mode (the
    /// one mode where "is a real word" is the point, not a rejection reason).
    realword_pool: Vec<&'static str>,
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
            let mut realword_pool: Vec<&'static str> = roots
                .iter()
                .chain(adjectives.iter())
                .chain(parse_lines(REALWORDS).iter())
                .copied()
                .filter(|w| w.len() >= 4 && w.len() <= 9)
                .collect();
            realword_pool.sort_unstable();
            realword_pool.dedup();
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
                realword_pool,
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

/// Combine roots from two different prompt concepts. This avoids synonym piles
/// such as Lens+Scope and favors names that carry two ideas, e.g. Ink+Lens.
fn join_root_groups(rng: &mut ChaCha8Rng, groups: &[Vec<String>]) -> Option<String> {
    if groups.len() < 2 {
        return None;
    }
    let a_group = rand::Rng::gen_range(rng, 0..groups.len());
    let mut b_group = rand::Rng::gen_range(rng, 0..groups.len() - 1);
    if b_group >= a_group {
        b_group += 1;
    }
    let (first_group, second_group) = if a_group < b_group {
        (a_group, b_group)
    } else {
        (b_group, a_group)
    };
    let a = groups[first_group][rand::Rng::gen_range(rng, 0..groups[first_group].len())].as_str();
    let b = groups[second_group][rand::Rng::gen_range(rng, 0..groups[second_group].len())].as_str();
    if a == b {
        return None;
    }
    semantic_join(a, b)
}

/// Number of prompt concepts visibly represented by a candidate. Root joins
/// can lose one seam letter, so a stable three-letter fragment counts too.
fn concept_group_covered(lower: &str, group: &[String]) -> bool {
    group
        .iter()
        .any(|root| lower.contains(root) || (root.len() >= 3 && lower.contains(&root[..3])))
}

fn concept_coverage(lower: &str, groups: &[Vec<String>]) -> usize {
    groups
        .iter()
        .filter(|group| concept_group_covered(lower, group))
        .count()
}

/// Join a prompt root to a curated metaphor without hiding either word at a
/// vowel boundary. `semantic_join` deliberately turns nova+atlas into
/// `novatlas`, which is useful for compact concept pairs but can turn
/// forge+atlas into the misleading `forgetlas` in the exploration lane.
fn metaphor_join(a: &str, b: &str) -> Option<String> {
    if a.len() < 2 || b.len() < 2 || a.eq_ignore_ascii_case(b) {
        return None;
    }

    let mut joined = a.to_string();
    let a_last = joined.chars().last()?;
    let b_first = b.chars().next()?;
    if a_last == b_first && is_vowel(a_last) {
        joined.extend(b.chars().skip(1));
    } else {
        joined.push_str(b);
    }
    (joined.len() <= 12).then_some(joined)
}

/// Stable seed-dependent value in [-0.5, 0.5]. A small dose in semantic
/// ranking keeps different seeds exploratory without admitting structural junk.
fn rank_jitter(name: &str, salt: u64) -> f64 {
    let mut hash = 0xcbf2_9ce4_8422_2325u64 ^ salt;
    for byte in name.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash ^= hash >> 33;
    hash = hash.wrapping_mul(0xff51_afd7_ed55_8ccd);
    let unit = (hash >> 11) as f64 / (1u64 << 53) as f64;
    unit - 0.5
}

/// Offline "brand-appeal" score (Phase 28) — a cheap proxy for the *semantic*
/// quality the structural scores miss. Rewards names that open with a real word
/// and end in a clean brandable suffix; penalizes harsh consonant-cluster
/// endings. On the Phase 27 LLM-labeled set these signals lifted correlation with
/// the LLM's brand-quality judgment from ~0.19 to ~0.33; folded into ranking (not
/// gating), so it reshapes which names surface without changing what's allowed.
/// `lower` must be lowercase ASCII (always true for generated names).
fn brand_appeal(lower: &str, common: &HashSet<String>, t: &BigTechTuning, suffix_w: f64) -> f64 {
    // Longest real-word prefix (≥3 chars): Forge·lab, Harbor·ai, Glide·hub.
    let mut prefix_len = 0usize;
    for j in (3..=lower.len()).rev() {
        if common.contains(&lower[..j]) {
            prefix_len = j;
            break;
        }
    }
    const CLEAN_SUFFIXES: [&str; 7] = ["ify", "io", "ai", "ia", "ly", "ix", "ora"];
    const HARSH_ENDINGS: [&str; 12] = [
        "rch", "tch", "sh", "ck", "sk", "ft", "rt", "rk", "nt", "st", "ld", "rd",
    ];
    let clean = CLEAN_SUFFIXES.iter().any(|s| lower.ends_with(s));
    let harsh = HARSH_ENDINGS.iter().any(|s| lower.ends_with(s));
    prefix_len as f64 * t.prefix_w + if clean { suffix_w } else { 0.0 }
        - if harsh { t.harsh_w } else { 0.0 }
}

fn suffix_rank_weight(tuning: &BigTechTuning, concept_expanded: bool, concept_count: usize) -> f64 {
    if concept_expanded && concept_count >= 2 {
        tuning.concept_suffix_w
    } else if concept_expanded {
        0.0
    } else {
        tuning.suffix_w
    }
}

fn generate_bigtech(
    cfg: &Config,
    dict: &HashSet<String>,
    rng: &mut ChaCha8Rng,
    tuning: &BigTechTuning,
) -> Vec<NameResult> {
    // Phase 34: corpora, trained model, word sets and gate stats are cached —
    // all seed-independent, so repeated calls (one per Generate click) skip setup.
    let st = BigtechStatic::get();
    // Names the user has already seen this session — never repeat them.
    // Phase 33: ExcludeSet adds fuzzy (edit-1) and stem-level rejection on top
    // of exact-match. Phase 35: exact covers the whole list; fuzzy/stem only
    // the most recent fuzzy_window entries (see the BigTechTuning field doc).
    let exclude = ExcludeSet::new(&cfg.exclude, tuning.fuzzy_window);

    // Phase 36 naming modes (big-tech reuses the previously unused `variant`
    // field): "respell" = Lyft/Tumblr-style one-transform respellings of real
    // words; "realword" = curated real words verbatim (Apple/Notion-style).
    // Anything else (or None) = the default brandable pipeline.
    let variant_lower = cfg.variant.as_deref().map(str::to_lowercase);
    let respell_mode = variant_lower.as_deref() == Some("respell");
    let realword_mode = variant_lower.as_deref() == Some("realword");

    // Priority for blend roots: description keywords > user-supplied roots > corpus.
    let raw_desc_keywords: Vec<String> = cfg
        .description
        .as_deref()
        .filter(|d| !d.trim().is_empty())
        .map(|d| keywords::extract_keywords(d, 6))
        .unwrap_or_default();
    let naming_brief = keywords::is_naming_brief(&raw_desc_keywords);
    // Brandable uses semantic groups to coin new forms. Compound keeps its
    // two-word shape but uses the same transparent lexicon for readable noun
    // halves (QuietInk instead of a random adjective + raw "journaling").
    let use_concept_roots =
        tuning.concept_expand && !cfg.compound && !respell_mode && !realword_mode;
    let concept_groups = if use_concept_roots {
        keywords::brand_root_groups(&raw_desc_keywords, 16)
    } else {
        Vec::new()
    };
    let expanded_desc_keywords = if use_concept_roots {
        concept_groups.iter().flatten().cloned().collect()
    } else if respell_mode {
        keywords::respell_source_keywords(&raw_desc_keywords)
    } else {
        raw_desc_keywords.clone()
    };
    let concept_expanded = expanded_desc_keywords != raw_desc_keywords;
    let desc_keywords = expanded_desc_keywords;
    let compound_desc_roots = if cfg.compound && !raw_desc_keywords.is_empty() {
        keywords::compound_roots(&raw_desc_keywords, 16)
    } else {
        Vec::new()
    };
    let compound_continuation = cfg.compound && (cfg.count > 10 || !cfg.exclude.is_empty());
    let compound_adjectives =
        if cfg.compound && (!raw_desc_keywords.is_empty() || !cfg.roots.is_empty()) {
            if compound_continuation {
                keywords::compound_continuation_adjectives(&raw_desc_keywords)
            } else {
                keywords::compound_adjectives(&raw_desc_keywords)
            }
        } else {
            Vec::new()
        };
    // Preserve the strongest semantic mix for the first two multi-concept
    // batches (one for a smaller single-concept brief), then open a metaphor
    // lane so Load more does not exhaust suffix permutations.
    let prompt_history_threshold = cfg.count.max(1) * if concept_groups.len() >= 2 { 2 } else { 1 };
    let has_prompt_history = concept_expanded
        && cfg
            .exclude
            .iter()
            .rev()
            .filter(|name| concept_coverage(&name.to_lowercase(), &concept_groups) > 0)
            .take(prompt_history_threshold)
            .count()
            >= prompt_history_threshold;

    let all_roots: Vec<&str> = if !compound_desc_roots.is_empty() {
        compound_desc_roots.iter().map(|s| s.as_str()).collect()
    } else if !desc_keywords.is_empty() {
        desc_keywords.iter().map(|s| s.as_str()).collect()
    } else if !cfg.roots.is_empty() {
        cfg.roots.iter().map(|s| s.as_str()).collect()
    } else {
        st.roots.clone()
    };

    // Keep the candidate pool shallow enough that different seeds explore
    // different semantic pairings instead of converging on one global top ten.
    // A prompted Compound pool is intentionally shallower. Its curated
    // adjective x noun space is finite; exhausting it made every seed converge
    // on the same ranked names instead of offering meaningful alternatives.
    let target = if cfg.compound && !compound_adjectives.is_empty() {
        cfg.count * 2
    } else {
        cfg.count * 5
    };
    let mut pool: Vec<NameResult> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let max_attempts = target * 80;

    // When the user supplies roots (description or seed words), blend purely from
    // them so re-ranking can't swap in generic names; otherwise use the weighted
    // generator mix below (coined Markov + clean blends + short evocative roots).
    let has_roots = !desc_keywords.is_empty() || !cfg.roots.is_empty();

    // Phonotactic-probability quality gate (Springer "I'd buy that!"): a default
    // candidate must be at least as brand-like as the low tail of real brands.
    // Skipped for user-roots (keyword fidelity), compound (two real words), and
    // the Phase 36 modes (curated real-word sources, not coinage to be vetted —
    // and respellings like tumblr deliberately have un-wordlike phonotactics).
    // Phase 48: prompted respell batches must surface the keyword-derived
    // respellings (journal → journl); the curated pool outnumbers them
    // ~100:1, so they're pulled to the front of the batch at the exit below.
    let kw_respells: HashSet<String> = if respell_mode && has_roots {
        all_roots
            .iter()
            .flat_map(|r| blend::respell_options(r))
            .collect()
    } else {
        HashSet::new()
    };
    // Try every prompt-derived styling before the generic pool can fill the
    // small candidate budget. This matters most for Auto's one-name Respell
    // accent: the old 50/50 random sampling often returned an unrelated word
    // even when a usable keyword respelling existed.
    let mut pending_kw_respells: Vec<String> = kw_respells.iter().cloned().collect();
    pending_kw_respells.sort_unstable();

    let apply_gate = !has_roots && !cfg.compound && !respell_mode && !realword_mode;
    let ll_floor = if apply_gate {
        st.ll_mean - tuning.gate_sigma * st.ll_std
    } else {
        f64::NEG_INFINITY
    };

    for _ in 0..max_attempts {
        if pool.len() >= target {
            break;
        }

        let name = if respell_mode {
            // One-transform respelling of a curated real word (lyft, tumblr).
            // Prompt-derived options are attempted first; the curated pool
            // fills the rest when those few options are exhausted or invalid.
            if !pending_kw_respells.is_empty() {
                let index = rand::Rng::gen_range(rng, 0..pending_kw_respells.len());
                pending_kw_respells.swap_remove(index)
            } else {
                let w = if has_roots && rand::Rng::gen::<f64>(rng) < 0.5 {
                    all_roots[rand::Rng::gen_range(rng, 0..all_roots.len())]
                } else {
                    st.realword_pool[rand::Rng::gen_range(rng, 0..st.realword_pool.len())]
                };
                let Some(r) = blend::respell(rng, w) else {
                    continue;
                };
                r
            }
        } else if realword_mode {
            // Curated real word, emitted verbatim (Apple/Notion-style).
            // Deliberately prompt-independent — the pool is curated, and faking
            // relevance without semantics would be worse than saying so (the
            // web UI notes that this mode ignores the description).
            st.realword_pool[rand::Rng::gen_range(rng, 0..st.realword_pool.len())].to_string()
        } else if cfg.compound {
            // Adjective + noun compound (SwiftForge); already CamelCase.
            // With a brief or explicit roots, both halves remain intentional:
            // a brief-aware adjective plus a semantic noun root. The broad
            // corpora remain available for promptless exploration.
            let adj = if !compound_adjectives.is_empty() {
                compound_adjectives[rand::Rng::gen_range(rng, 0..compound_adjectives.len())]
            } else {
                st.adjectives[rand::Rng::gen_range(rng, 0..st.adjectives.len())]
            };
            let noun = if has_roots {
                all_roots[rand::Rng::gen_range(rng, 0..all_roots.len())]
            } else {
                st.roots[rand::Rng::gen_range(rng, 0..st.roots.len())]
            };
            if keywords::compound_pair_has_lexical_echo(adj, noun) {
                continue;
            }
            if !keywords::compound_pair_is_coherent(
                adj,
                noun,
                &raw_desc_keywords,
                compound_continuation,
            ) {
                continue;
            }
            compound(adj, noun)
        } else if has_roots {
            // Phase 48: weighted mix instead of pure root-blending. A single
            // keyword ("fitness") used to make blend_roots return None on
            // every attempt — the batch came back empty and the UI showed a
            // false "you've seen every name" notice — and pure blends alone
            // yielded opaque fragments (mood+journaling → "mong"). Arms:
            // blend two user roots / one root + tech transform (Shopify
            // pattern — works with one keyword) / blend a user root with a
            // curated metaphor root for variety (keyword half stays intact).
            // After the compact phase, multi-concept prompts reserve 15% for
            // this lane; single concepts use it more heavily because their
            // suffix-only space is smaller.
            let blend_two_w = if concept_expanded {
                if concept_groups.len() >= 2 {
                    if has_prompt_history {
                        0.60
                    } else {
                        0.75
                    }
                } else {
                    0.0
                }
            } else if all_roots.len() >= 2 {
                0.45
            } else {
                0.0
            };
            let suffix_w = if concept_expanded {
                if concept_groups.len() >= 2 || has_prompt_history {
                    0.25
                } else {
                    1.0 - tuning.single_concept_metaphor_w.clamp(0.0, 1.0)
                }
            } else if all_roots.len() >= 2 {
                0.30
            } else {
                0.45
            };
            let pick = rand::Rng::gen::<f64>(rng);
            if pick < blend_two_w {
                let combined = if concept_expanded {
                    join_root_groups(rng, &concept_groups)
                } else {
                    blend_roots(rng, &all_roots)
                };
                let Some(b) = combined else { continue };
                if concept_expanded {
                    b
                } else {
                    tech_transform(rng, &b, cfg.temperature)
                }
            } else if pick < blend_two_w + suffix_w {
                let root = if concept_expanded {
                    let lead_group = &concept_groups[0];
                    lead_group[rand::Rng::gen_range(rng, 0..lead_group.len())].as_str()
                } else {
                    all_roots[rand::Rng::gen_range(rng, 0..all_roots.len())]
                };
                if concept_expanded {
                    if naming_brief {
                        naming_transform(rng, root)
                    } else {
                        concept_transform(rng, root)
                    }
                } else {
                    tech_transform(rng, root, 1.0)
                }
            } else {
                let a = if concept_expanded && !has_prompt_history {
                    let lead_group = &concept_groups[0];
                    lead_group[rand::Rng::gen_range(rng, 0..lead_group.len())].as_str()
                } else {
                    all_roots[rand::Rng::gen_range(rng, 0..all_roots.len())]
                };
                let b = if concept_expanded {
                    CONCEPT_METAPHORS[rand::Rng::gen_range(rng, 0..CONCEPT_METAPHORS.len())]
                } else {
                    st.roots[rand::Rng::gen_range(rng, 0..st.roots.len())]
                };
                if a == b {
                    continue;
                }
                if concept_expanded {
                    let Some(m) = metaphor_join(a, b) else {
                        continue;
                    };
                    m
                } else {
                    let Some(m) = overlap_blend(a, b).or_else(|| blend(a, b)) else {
                        continue;
                    };
                    tech_transform(rng, &m, cfg.temperature)
                }
            }
        } else {
            // Weighted mix: mostly coined Markov, some clean blends, some short
            // single-root evocative names (root + tech suffix, à la Shopify).
            let pick = rand::Rng::gen::<f64>(rng);
            if pick < tuning.markov_w {
                let Some(s) = st
                    .model
                    .sample(rng, cfg.temperature, cfg.min_len, cfg.max_len)
                else {
                    continue;
                };
                tech_transform(rng, &s, cfg.temperature)
            } else if pick < tuning.markov_w + tuning.blend_w {
                let Some(b) = blend_roots(rng, &st.roots) else {
                    continue;
                };
                tech_transform(rng, &b, cfg.temperature)
            } else {
                let root = st.roots[rand::Rng::gen_range(rng, 0..st.roots.len())];
                tech_transform(rng, root, 1.0)
            }
        };

        let name = capitalize(&name);
        if name.len() < cfg.min_len || name.len() > cfg.max_len {
            continue;
        }
        let lower = name.to_lowercase();
        // Respellings deliberately break English phonotactics (tumblr ends in
        // a 4-consonant run) — allow the denser clusters and skip sonority,
        // like the harsh Sci-Fi variants do.
        if respell_mode {
            if !is_valid_clustered(&lower, Style::BigTech, 4) {
                continue;
            }
        } else if !is_valid(&lower, Style::BigTech) {
            continue;
        }
        // Big-tech names should read naturally → enforce sonority sequencing.
        // Compounds join two real words, so skip the single-word sonority check.
        if !cfg.compound && !respell_mode && !respects_sonority(&lower) {
            continue;
        }
        // Brand-shape: 1–3 syllables (research sweet spot); reject long mashups.
        if !cfg.compound && syllable_count(&lower) > tuning.syllable_cap {
            continue;
        }
        // Phonotactic-probability gate: reject candidates less brand-like than
        // the low tail of real brands (no-op when apply_gate is false).
        if st.model.log_likelihood(&name) < ll_floor {
            continue;
        }
        // Don't emit names that read as a truncated/typo'd real brand. Also
        // enforced for the Phase 36 modes: a respelling can land on a brand
        // (flicker→flickr) and a real word can read as a brand typo (strip).
        if (apply_gate || respell_mode || realword_mode)
            && mimics_real_brand_indexed(&lower, &st.corpus_by_len)
        {
            continue;
        }
        // Never emit a real brand / root / dictionary word verbatim — except in
        // real-word mode, where curated real words (incl. roots) are the point;
        // there only the brand-mimic check above guards against brands.
        if !realword_mode && (st.corpus_set.contains(&lower) || dict.contains(&lower)) {
            continue;
        }
        // Reject plain real words (Guard, Telegraph) — big-tech only.
        if !realword_mode && st.common_words.contains(&lower) {
            continue;
        }
        // Reject bad/offensive connotations (Bitdefect) — big-tech only.
        if BAD_SUBSTRINGS.iter().any(|b| lower.contains(b)) {
            continue;
        }
        if !passes_constraints(&lower, cfg) {
            continue;
        }
        // Phase 33: fuzzy + stem exclusion (most expensive filter — runs on
        // survivors only). Phase 44: only in the open-ended default mix —
        // with user roots/description the reachable space is a handful of
        // stems × suffixes, so stem exclusion blacklists the user's own
        // keywords after one batch and starves generation; the curated
        // realword pool is similarly small. Exact exclusion always applies.
        let constrained = has_roots || realword_mode;
        if exclude.rejects(
            &lower,
            tuning.fuzzy_exclude && !constrained,
            tuning.stem_exclude && !constrained,
        ) {
            continue;
        }
        if seen.contains(&name) {
            continue;
        }

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
    // and a brevity bonus from memorability. Brevity bias only applies without
    // user roots — keyword-derived names are as long as the keywords need.
    // Phase 48: fluency + appeal now apply with roots too — every candidate is
    // keyword-derived, so they only order the pool (and sink harsh fragments
    // like "Markg" that used to top prompted batches).
    let brevity_w = if has_roots { 0.0 } else { tuning.brevity_w };
    let fluency_w = tuning.fluency_w;
    let appeal_w = 1.0;
    let concept_rank_salt = if concept_expanded {
        rand::Rng::gen::<u64>(rng)
    } else {
        0
    };
    let exploration_w = if concept_expanded {
        cfg.variety.clamp(0.0, 1.0) * 1.2
    } else {
        0.0
    };
    let suffix_rank_w = suffix_rank_weight(tuning, concept_expanded, concept_groups.len());
    let rank = |r: &NameResult| {
        let lower = r.name.to_lowercase();
        let coverage_bonus = if concept_expanded {
            concept_coverage(&lower, &concept_groups).saturating_sub(1) as f64
                * tuning.concept_coverage_w
        } else {
            0.0
        };
        // The first group is the brief's preferred semantic anchor (modifier or
        // core domain), not just another context word. Keep it visible when two
        // equally broad candidates compete: RetroKey over KeyMarket, LexForge
        // over KeySeed for a developer naming tool.
        let lead_concept_bonus = if concept_expanded
            && concept_groups.len() >= 2
            && concept_groups
                .first()
                .map_or(false, |group| concept_group_covered(&lower, group))
        {
            0.20
        } else {
            0.0
        };
        // In Brandable mode a one-edit common-word neighbor usually reads as a
        // typo (Kiten/kitten), not an intentional respelling. Respell has its own
        // explicit mode and bypasses this concept ranking path.
        let typo_penalty = if concept_expanded && r.score_novelty == 60 {
            0.45
        } else {
            0.0
        };
        st.model.log_likelihood(&r.name)
            + (r.score_pronounce as f64 / 100.0) * fluency_w
            + (r.score_memorability as f64 / 100.0) * brevity_w
            + appeal_w * brand_appeal(&lower, &st.common_words, tuning, suffix_rank_w)
            + coverage_bonus
            + lead_concept_bonus
            + rank_jitter(&r.name, concept_rank_salt) * exploration_w
            - typo_penalty
    };
    // Phase 34: rank each name once, then sort on the cached value — sort_by
    // with rank() inline recomputed log_likelihood + brand_appeal per comparison
    // (~10× the work). Same values, same comparator → identical order.
    let mut decorated: Vec<(f64, NameResult)> = pool.into_iter().map(|r| (rank(&r), r)).collect();
    decorated.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    let rank_min = decorated.last().map(|(score, _)| *score).unwrap_or(0.0);
    let rank_max = decorated.first().map(|(score, _)| *score).unwrap_or(0.0);
    let rank_span = (rank_max - rank_min).max(f64::EPSILON);
    let concept_relevance: HashMap<String, f64> = decorated
        .iter()
        .map(|(score, result)| {
            (
                result.name.clone(),
                ((*score - rank_min) / rank_span).clamp(0.0, 1.0),
            )
        })
        .collect();
    let mut pool: Vec<NameResult> = decorated.into_iter().map(|(_, r)| r).collect();
    // Phase 48: a prompted respell batch leads with the keyword-derived
    // respellings (best-ranked first, up to a third of the batch); the rest
    // is the usual diversified pool selection.
    let mut lead: Vec<NameResult> = Vec::new();
    if !kw_respells.is_empty() {
        let max_lead = (cfg.count + 2) / 3;
        let mut i = 0;
        while i < pool.len() && lead.len() < max_lead {
            if kw_respells.contains(&pool[i].name.to_lowercase()) {
                lead.push(pool.remove(i));
            } else {
                i += 1;
            }
        }
    }
    // Keep the most brand-like as candidates, then diversify the final set.
    // Phase 33: mmr_select_capped enforces suffix/prefix structural caps so a
    // batch never contains more than max_share*count names sharing one suffix
    // or 3-char prefix — preventing e.g. 4×"-ify" at count=10. Phase 48: the
    // has_roots path goes through this too — it used to plain-truncate, which
    // let one stem family fill the whole batch (10×"Markge…" for a
    // marketplace prompt); the 3-char prefix cap is exactly what breaks that.
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
    let mut out = lead;
    let remaining = cfg.count - out.len();
    if concept_expanded {
        out.extend(metrics::mmr_select_capped_by(
            &pool,
            remaining,
            tuning.mmr_lambda,
            share_cap,
            |result| concept_relevance.get(&result.name).copied().unwrap_or(0.0),
        ));
    } else {
        out.extend(metrics::mmr_select_capped(
            &pool,
            remaining,
            tuning.mmr_lambda,
            share_cap,
        ));
    }
    out
}

fn generate_markov(
    cfg: &Config,
    dict: &HashSet<String>,
    rng: &mut ChaCha8Rng,
    corpus: &str,
) -> Vec<NameResult> {
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
        if pool.len() >= target {
            break;
        }
        let Some(name) = model.sample(rng, cfg.temperature, cfg.min_len, cfg.max_len) else {
            continue;
        };
        let name = capitalize(&name);
        if !is_valid_clustered(&name.to_lowercase(), cfg.style, max_run) {
            continue;
        }
        if soft && !respects_sonority(&name.to_lowercase()) {
            continue;
        }
        let lower = name.to_lowercase();
        if corpus_set.contains(&lower) || dict.contains(&lower) {
            continue;
        }
        if !passes_constraints(&lower, cfg) {
            continue;
        }
        if exclude.contains(&lower) {
            continue;
        }
        if seen.contains(&name) {
            continue;
        }
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

/// On-demand breakdown of why a name reads the way it does (Phase 36): the
/// structural facts behind the scores, in UI-renderable form. Never called
/// during generation — zero impact on the generation paths.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Explanation {
    /// Recognized brandable tech suffix ("ify", "hub", …), if any.
    pub suffix: Option<String>,
    /// The name minus that suffix (present only when a suffix was found).
    pub stem: Option<String>,
    /// Longest real-English-word *proper* prefix of ≥3 chars (Forge·lab).
    pub prefix_word: Option<String>,
    /// True when the entire name is a common English word (real-word mode).
    pub is_real_word: bool,
    pub syllables: usize,
    pub connotations: Vec<String>,
    pub score_pronounce: u32,
    pub score_novelty: u32,
    pub score_memorability: u32,
}

pub fn explain(name: &str) -> Explanation {
    let lower = name.to_lowercase();
    let st = BigtechStatic::get();
    let dict = DICT.get_or_init(build_dictionary);

    let suffix = blend::tech_suffix_of(&lower).map(str::to_string);
    let stem = suffix
        .as_ref()
        .map(|s| lower[..lower.len() - s.len()].to_string());

    let is_real_word = st.common_words.contains(&lower);
    let mut prefix_word = None;
    if !is_real_word {
        for j in (3..lower.len()).rev() {
            if lower.is_char_boundary(j) && st.common_words.contains(&lower[..j]) {
                prefix_word = Some(lower[..j].to_string());
                break;
            }
        }
    }

    Explanation {
        suffix,
        stem,
        prefix_word,
        is_real_word,
        syllables: syllable_count(&lower),
        connotations: connotation::connotations(name),
        score_pronounce: score_pronounceability(&lower),
        score_novelty: score_novelty(&lower, dict),
        score_memorability: score_memorability(&lower),
    }
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
        let good = brand_appeal("forgeify", &common, &t, t.suffix_w); // "forge" prefix + "ify" suffix
        let harsh = brand_appeal("bearch", &common, &t, t.suffix_w); // harsh "-rch" ending
        assert!(good > harsh, "good={good} should beat harsh={harsh}");
        // Harsh ending is penalized below a neutral coined name.
        let neutral = brand_appeal("zentu", &common, &t, t.suffix_w);
        assert!(
            harsh < neutral,
            "harsh={harsh} should be penalized below neutral={neutral}"
        );
    }

    #[test]
    fn multi_concept_names_use_a_reduced_suffix_bonus() {
        let tuning = BigTechTuning::from_variety(0.3);
        assert!(tuning.suffix_w > 0.0);
        assert_eq!(tuning.concept_suffix_w, 0.14);
        assert!(tuning.concept_suffix_w < tuning.suffix_w);
        assert_eq!(suffix_rank_weight(&tuning, false, 0), tuning.suffix_w);
        assert_eq!(suffix_rank_weight(&tuning, true, 1), 0.0);
        assert_eq!(
            suffix_rank_weight(&tuning, true, 2),
            tuning.concept_suffix_w
        );
    }

    #[test]
    fn constraints_filter_output() {
        let mut c = cfg(Style::Fantasy);
        c.count = 8;
        c.starts_with = Some("a".to_string());
        for r in generate(&c) {
            assert!(
                r.name.to_lowercase().starts_with('a'),
                "{} ignored starts_with",
                r.name
            );
        }
        let mut c2 = cfg(Style::SciFi);
        c2.count = 6;
        c2.contains = Some("ar".to_string());
        for r in generate(&c2) {
            assert!(
                r.name.to_lowercase().contains("ar"),
                "{} ignored contains",
                r.name
            );
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
            let names: HashSet<String> =
                generate(&c).iter().map(|r| r.name.to_lowercase()).collect();
            let corpus: HashSet<String> = match style {
                Style::BigTech => parse_lines(BIGTECH_CORPUS)
                    .iter()
                    .chain(parse_lines(ROOTS).iter())
                    .map(|s| s.to_lowercase())
                    .collect(),
                Style::SciFi => parse_lines(&scifi_corpus())
                    .iter()
                    .map(|s| s.to_lowercase())
                    .collect(),
                Style::Fantasy => parse_lines(&fantasy_corpus())
                    .iter()
                    .map(|s| s.to_lowercase())
                    .collect(),
            };
            let overlap: Vec<&String> = names.intersection(&corpus).collect();
            assert!(
                overlap.is_empty(),
                "{:?}/{:?} reproduced corpus entries: {:?}",
                style,
                variant,
                overlap
            );
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
    fn compound_with_one_explicit_root_fills_the_batch() {
        let mut c = cfg(Style::BigTech);
        c.compound = true;
        c.roots = vec!["research".to_string()];
        c.count = 10;
        c.max_len = 12;
        let results = generate(&c);
        assert_eq!(results.len(), 10);
        assert!(results
            .iter()
            .all(|result| result.name.to_lowercase().ends_with("research")));
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
        assert!(
            hit,
            "no description-derived names: {:?}",
            results.iter().map(|r| &r.name).collect::<Vec<_>>()
        );
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
            v.iter()
                .map(|r| affinity_score(&r.name, Variant::Elvish))
                .sum::<f64>()
                / v.len() as f64
        };
        assert!(
            avg(&elvish) >= avg(&mix),
            "elvish {} vs mix {}",
            avg(&elvish),
            avg(&mix)
        );
    }

    #[test]
    fn bigtech_names_within_syllable_cap() {
        // Brand-shape rule: default big-tech names stay at 1–3 syllables.
        let mut c = cfg(Style::BigTech);
        c.count = 12;
        c.max_len = 12;
        for r in generate(&c) {
            assert!(
                syllable_count(&r.name.to_lowercase()) <= 3,
                "{} has >3 syllables",
                r.name
            );
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
        assert!(mimics_real_brand("xstripe", &["stripe"])); // prefix pad
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
            assert!(
                !common.contains(&r.name.to_lowercase()),
                "{} is a common word",
                r.name
            );
        }
    }

    #[test]
    fn bigtech_avoids_brand_mimics() {
        // No default big-tech name should be a truncated/typo'd real brand.
        let brands = parse_lines(BIGTECH_CORPUS);
        let mut c = cfg(Style::BigTech);
        c.count = 15;
        for r in generate(&c) {
            assert!(
                !mimics_real_brand(&r.name.to_lowercase(), &brands),
                "{} mimics a real brand",
                r.name
            );
        }
    }

    #[test]
    fn realword_mode_emits_pool_words_only() {
        let mut c = cfg(Style::BigTech);
        c.variant = Some("realword".to_string());
        c.count = 12;
        let results = generate(&c);
        assert!(!results.is_empty());
        let st = BigtechStatic::get();
        let brands: HashSet<String> = parse_lines(BIGTECH_CORPUS)
            .iter()
            .map(|s| s.to_lowercase())
            .collect();
        for r in &results {
            let lower = r.name.to_lowercase();
            assert!(
                st.realword_pool.binary_search(&lower.as_str()).is_ok(),
                "{} not in the curated pool",
                r.name
            );
            assert!(!brands.contains(&lower), "{} is a real brand", r.name);
        }
    }

    #[test]
    fn respell_mode_emits_coinages_not_words() {
        let mut c = cfg(Style::BigTech);
        c.variant = Some("respell".to_string());
        c.count = 12;
        let results = generate(&c);
        assert!(!results.is_empty());
        let common = build_common_words();
        for r in &results {
            let lower = r.name.to_lowercase();
            assert!(!common.contains(&lower), "{} is a plain real word", r.name);
            assert!(!dict_contains(&lower), "{} is a dictionary word", r.name);
        }
    }

    fn dict_contains(lower: &str) -> bool {
        build_dictionary().contains(lower)
    }

    #[test]
    fn unknown_variant_matches_default_bigtech() {
        // An unrecognized variant must fall through to the default pipeline,
        // byte-identical — protects existing callers and the frozen baseline.
        let a: Vec<String> = generate(&cfg(Style::BigTech))
            .into_iter()
            .map(|r| r.name)
            .collect();
        let mut c = cfg(Style::BigTech);
        c.variant = Some("nonsense".to_string());
        let b: Vec<String> = generate(&c).into_iter().map(|r| r.name).collect();
        assert_eq!(a, b);
    }

    #[test]
    fn description_mode_survives_exclusion() {
        // Phase 44 regression: a description narrows the space to a few stems
        // × suffixes; stem/fuzzy exclusion used to blacklist all of them after
        // one batch, starving generation. Exact exclusion must still apply.
        let mut c = cfg(Style::BigTech);
        c.description = Some("a marketplace for vintage keyboards".to_string());
        c.count = 10;
        let first: Vec<String> = generate(&c).into_iter().map(|r| r.name).collect();
        assert!(!first.is_empty());

        let mut c2 = cfg(Style::BigTech);
        c2.description = c.description.clone();
        c2.count = 10;
        c2.seed = Some(1337);
        c2.exclude = first.clone();
        let second: Vec<String> = generate(&c2).into_iter().map(|r| r.name).collect();
        assert!(
            !second.is_empty(),
            "description mode starved after one excluded batch"
        );
        for n in &second {
            assert!(!first.contains(n), "{n} repeated despite exact exclusion");
        }
    }

    #[test]
    fn description_session_yields_100_fresh_contextual_names() {
        let description =
            "a developer tool that generates names for packages CLIs libraries and projects";
        let groups = keywords::brand_root_groups(&keywords::extract_keywords(description, 6), 16);
        let mut excluded = Vec::new();
        let mut unique = HashSet::new();

        for batch_index in 0..10 {
            let mut c = cfg(Style::BigTech);
            c.description = Some(description.to_string());
            c.count = 10;
            c.temperature = 0.85;
            c.variety = 0.3;
            c.seed = Some(0xA076_1D64_78BD_642Fu64.wrapping_mul(batch_index as u64 + 1));
            c.exclude = excluded.clone();
            let batch = generate(&c);
            assert_eq!(
                batch.len(),
                10,
                "description session starved at batch {batch_index}: {:?}",
                batch.iter().map(|result| &result.name).collect::<Vec<_>>()
            );
            if batch_index == 0 {
                let lead_count = batch
                    .iter()
                    .filter(|result| concept_group_covered(&result.name.to_lowercase(), &groups[0]))
                    .count();
                assert!(
                    lead_count >= 5,
                    "first page lost the brief's naming anchor ({lead_count}/10): {:?}",
                    batch.iter().map(|result| &result.name).collect::<Vec<_>>()
                );
            }
            for result in batch {
                let lower = result.name.to_lowercase();
                assert!(
                    concept_coverage(&lower, &groups) >= 1,
                    "{} lost the project concept",
                    result.name
                );
                assert!(unique.insert(lower), "{} repeated", result.name);
                excluded.push(result.name);
            }
        }

        assert_eq!(unique.len(), 100);
    }

    #[test]
    fn metaphor_join_keeps_both_words_readable() {
        assert_eq!(
            metaphor_join("forge", "atlas"),
            Some("forgeatlas".to_string())
        );
        assert_eq!(metaphor_join("nova", "atlas"), Some("novatlas".to_string()));
        assert_eq!(
            metaphor_join("shell", "link"),
            Some("shelllink".to_string())
        );
        assert_eq!(
            metaphor_join("bump", "pulse"),
            Some("bumppulse".to_string())
        );
        assert_eq!(metaphor_join("mint", "mint"), None);
    }

    #[test]
    fn single_keyword_description_generates() {
        // Phase 48 regression: "fitness" extracts exactly one keyword, and
        // blend_roots (the only candidate arm then) needs two — every attempt
        // returned None and the batch came back EMPTY on a fresh session,
        // showing a false "you've seen every name" notice in the UI.
        let mut c = cfg(Style::BigTech);
        c.description = Some("fitness".to_string());
        c.count = 10;
        let results = generate(&c);
        assert_eq!(
            results.len(),
            10,
            "single-keyword description starved: {:?}",
            results.iter().map(|r| &r.name).collect::<Vec<_>>()
        );

        // "AI tool for lawyers" used to reduce to one keyword too ("ai" was
        // dropped as <3 chars, "tool" is a stopword).
        let mut c2 = cfg(Style::BigTech);
        c2.description = Some("AI tool for lawyers".to_string());
        c2.count = 10;
        assert!(!generate(&c2).is_empty(), "AI-tool prompt starved");
    }

    #[test]
    fn single_keyword_session_yields_100_fresh_names() {
        let description = "fitness";
        let groups = keywords::brand_root_groups(&keywords::extract_keywords(description, 6), 16);
        let mut excluded = Vec::new();
        for batch_index in 0..10 {
            let mut c = cfg(Style::BigTech);
            c.description = Some(description.to_string());
            c.count = 10;
            c.temperature = 0.85;
            c.variety = 0.3;
            c.seed = Some(0xA076_1D64_78BD_642Fu64.wrapping_mul(batch_index as u64 + 1));
            c.exclude = excluded.clone();
            let batch = generate(&c);
            assert_eq!(
                batch.len(),
                10,
                "single-concept batch {batch_index} starved"
            );
            for result in batch {
                let lower = result.name.to_lowercase();
                assert!(concept_coverage(&lower, &groups) >= 1);
                assert!(!excluded.contains(&result.name));
                excluded.push(result.name);
            }
        }
        assert_eq!(excluded.len(), 100);
    }

    #[test]
    fn description_batch_is_diverse() {
        // Phase 48 regression: the has_roots path used to skip the MMR/share
        // -cap pass, so one stem family filled the whole batch (10×"Markge…"
        // for this exact prompt).
        let mut c = cfg(Style::BigTech);
        c.description = Some("a marketplace for vintage keyboards".to_string());
        c.count = 10;
        let results = generate(&c);
        assert!(results.len() >= 6, "too few results: {}", results.len());
        // Three keywords → only 3 reachable prefix families (mar/vin/key), so
        // the MMR cap must relax to fill the batch — a balanced 4/4/2 is the
        // correct outcome. The regression this guards: 10/10 names in ONE
        // family. Require ≥3 families and no family holding over half.
        let mut prefixes: HashMap<String, usize> = HashMap::new();
        for r in &results {
            let lower = r.name.to_lowercase();
            let p: String = lower.chars().take(3).collect();
            *prefixes.entry(p).or_insert(0) += 1;
        }
        let names: Vec<&String> = results.iter().map(|r| &r.name).collect();
        assert!(
            prefixes.len() >= 3,
            "only {} prefix families: {names:?}",
            prefixes.len()
        );
        for (p, n) in &prefixes {
            assert!(
                *n * 2 <= results.len(),
                "{n} of {} names share prefix {p:?}: {names:?}",
                results.len()
            );
        }
    }

    #[test]
    fn description_names_echo_keywords() {
        // Prompted names must visibly carry either a literal keyword or one of
        // its curated concept roots; at least half the batch should show intent.
        let mut c = cfg(Style::BigTech);
        c.description = Some("a journaling app with mood insights".to_string());
        c.count = 10;
        let results = generate(&c);
        assert!(!results.is_empty());
        let frags = [
            "jou", "journ", "moo", "mood", "ins", "insight", "ink", "quil", "draf", "scrib",
            "note", "sign", "lens", "trac", "scop", "vect",
        ];
        let hits = results
            .iter()
            .filter(|r| {
                let lower = r.name.to_lowercase();
                frags.iter().any(|f| lower.contains(f))
            })
            .count();
        assert!(
            hits * 2 >= results.len(),
            "only {hits}/{} echo a keyword: {:?}",
            results.len(),
            results.iter().map(|r| &r.name).collect::<Vec<_>>()
        );
    }

    #[test]
    fn concept_ranking_balances_coinages_and_literal_joins() {
        // Phase 62: rewarding every extra visible concept too strongly made
        // literal joins occupy 9/10 slots for the app's own brief. Keep both
        // families: compact one-concept coinages supply brand character while
        // multi-concept joins preserve explicit product meaning.
        let description =
            "a developer tool that generates names for packages CLIs libraries and projects";
        let mut c = cfg(Style::BigTech);
        c.description = Some(description.to_string());
        c.count = 10;
        c.temperature = 0.85;
        c.variety = 0.3;
        c.seed = Some(0xA076_1D64_78BD_642F);
        let results = generate(&c);
        let keywords = keywords::extract_keywords(description, 6);
        let groups = keywords::brand_root_groups(&keywords, 16);
        let single = results
            .iter()
            .filter(|result| concept_coverage(&result.name.to_lowercase(), &groups) == 1)
            .count();
        let joined = results
            .iter()
            .filter(|result| concept_coverage(&result.name.to_lowercase(), &groups) >= 2)
            .count();
        let names: Vec<&String> = results.iter().map(|result| &result.name).collect();
        assert!(single >= 3, "only {single} compact coinages: {names:?}");
        assert!(joined >= 3, "only {joined} semantic joins: {names:?}");
    }

    #[test]
    fn naming_brief_reaches_smoother_coined_endings() {
        let mut c = cfg(Style::BigTech);
        c.description = Some(
            "a developer tool that generates names for packages CLIs libraries and projects"
                .to_string(),
        );
        c.count = 60;
        c.temperature = 0.85;
        c.variety = 0.3;
        c.seed = Some(42);
        let results = generate(&c);
        let naming_roots = ["lex", "nym", "nom", "mark", "mint"];
        let smooth_endings = ["el", "en", "on", "ion", "era"];
        assert!(
            results.iter().any(|result| {
                let lower = result.name.to_lowercase();
                naming_roots.iter().any(|root| {
                    smooth_endings
                        .iter()
                        .any(|ending| lower == format!("{root}{ending}"))
                })
            }),
            "naming brief did not reach its smoother ending palette"
        );
    }

    #[test]
    fn single_concept_first_page_varies_its_shape() {
        let mut c = cfg(Style::BigTech);
        c.description = Some("fitness".to_string());
        c.count = 10;
        c.temperature = 0.85;
        c.variety = 0.3;
        c.seed = Some(7);
        let results = generate(&c);
        assert_eq!(results.len(), 10);

        let keywords = keywords::extract_keywords("fitness", 6);
        let roots = keywords::brand_roots(&keywords, 16);
        let concept_suffixes = ["ia", "io", "ora", "ix", "ify"];
        let suffix_count = results
            .iter()
            .filter(|result| {
                let lower = result.name.to_lowercase();
                roots.iter().any(|root| {
                    concept_suffixes
                        .iter()
                        .any(|suffix| lower == format!("{root}{suffix}"))
                })
            })
            .count();
        assert!(suffix_count > 0, "lost the compact coined-name lane");
        assert!(
            suffix_count < results.len(),
            "first page collapsed to suffix-only forms: {:?}",
            results
                .iter()
                .map(|result| &result.name)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn no_mong_substring() {
        // mood+journaling blends seamed into "mong" (a UK slur) before Phase
        // 48 added it to BAD_SUBSTRINGS.
        assert!(BAD_SUBSTRINGS.contains(&"mong"));
        for seed in [42u64, 7, 1337] {
            let mut c = cfg(Style::BigTech);
            c.description = Some("a journaling app with mood insights".to_string());
            c.count = 10;
            c.seed = Some(seed);
            for r in generate(&c) {
                assert!(
                    !r.name.to_lowercase().contains("mong"),
                    "emitted {}",
                    r.name
                );
            }
        }
    }

    #[test]
    fn compound_uses_description_keywords() {
        // Phase 72: every prompted compound keeps a semantic noun from the
        // brief, not merely one lucky literal keyword somewhere in the batch.
        let mut c = cfg(Style::BigTech);
        c.compound = true;
        c.description = Some("a journaling app with mood insights".to_string());
        c.count = 10;
        c.max_len = 16;
        let results = generate(&c);
        assert_eq!(results.len(), 10);
        let extracted = keywords::extract_keywords(c.description.as_deref().unwrap(), 6);
        let roots: HashSet<String> = keywords::compound_roots(&extracted, 16)
            .into_iter()
            .collect();
        for result in results {
            let boundary = result
                .name
                .char_indices()
                .skip(1)
                .find(|(_, character)| character.is_ascii_uppercase())
                .map(|(index, _)| index)
                .unwrap_or(result.name.len());
            let adjective = result.name[..boundary].to_lowercase();
            let noun = result.name[boundary..].to_lowercase();
            assert!(roots.contains(&noun), "unrelated compound: {}", result.name);
            assert!(
                keywords::compound_pair_is_coherent(&adjective, &noun, &extracted, false),
                "incoherent compound: {}",
                result.name
            );
        }
    }

    #[test]
    fn prompted_compound_sustains_long_batches() {
        // Brief-aware palettes must keep Load more viable without reopening
        // the broad, mismatched adjective corpus. Legal research used to stop
        // at 40 names before it gained a real semantic family.
        let prompts = [
            "a secure password manager for teams",
            "an app for splitting expenses with friends",
            "a fast analytics dashboard for API performance",
            "legal research",
        ];
        for prompt in prompts {
            let mut c = cfg(Style::BigTech);
            c.compound = true;
            c.description = Some(prompt.to_string());
            c.count = 100;
            c.max_len = 12;
            let results = generate(&c);
            assert_eq!(results.len(), 100, "short Compound batch for {prompt}");
        }
    }

    #[test]
    fn prompted_compound_rejects_lexical_echoes() {
        let mut c = cfg(Style::BigTech);
        c.compound = true;
        c.description = Some("a background job scheduler".to_string());
        c.count = 100;
        c.max_len = 16;
        let results = generate(&c);
        assert_eq!(results.len(), 100);
        for result in results {
            let boundary = result
                .name
                .char_indices()
                .skip(1)
                .find(|(_, character)| character.is_ascii_uppercase())
                .map(|(index, _)| index)
                .unwrap_or(result.name.len());
            assert!(
                !keywords::compound_pair_has_lexical_echo(
                    &result.name[..boundary],
                    &result.name[boundary..],
                ),
                "lexical echo: {}",
                result.name
            );
        }
    }

    #[test]
    fn single_concept_compound_session_yields_100_fresh_names() {
        let description = "fitness";
        let extracted = keywords::extract_keywords(description, 6);
        let roots: HashSet<String> = keywords::compound_roots(&extracted, 16)
            .into_iter()
            .collect();
        let mut excluded = Vec::new();

        for batch_index in 0..10 {
            let mut c = cfg(Style::BigTech);
            c.compound = true;
            c.description = Some(description.to_string());
            c.count = 10;
            c.seed = Some(0xA076_1D64_78BD_642Fu64.wrapping_mul(batch_index as u64 + 1));
            c.exclude = excluded.clone();
            let batch = generate(&c);
            assert_eq!(batch.len(), 10, "Compound batch {batch_index} starved");
            for result in batch {
                let noun = result
                    .name
                    .char_indices()
                    .skip(1)
                    .find(|(_, character)| character.is_ascii_uppercase())
                    .map(|(index, _)| result.name[index..].to_lowercase())
                    .unwrap_or_default();
                assert!(roots.contains(&noun), "{} lost its concept", result.name);
                assert!(!excluded.contains(&result.name), "{} repeated", result.name);
                excluded.push(result.name);
            }
        }
        assert_eq!(excluded.len(), 100);
    }

    #[test]
    fn respell_prefers_description_keywords() {
        // Phase 48: respell mode used to ignore the description entirely.
        // "fitness" has several one-transform respellings (fytness, fitnes…),
        // so a prompted respell batch should include a keyword-derived one.
        let mut c = cfg(Style::BigTech);
        c.variant = Some("respell".to_string());
        c.description = Some("fitness coaching for athletes".to_string());
        c.count = 12;
        let results = generate(&c);
        assert!(!results.is_empty());
        let mut keyword_respells: Vec<String> = Vec::new();
        for kw in keywords::extract_keywords(c.description.as_deref().unwrap(), 6) {
            keyword_respells.extend(blend::respell_options(&kw));
        }
        let hit = results
            .iter()
            .any(|r| keyword_respells.contains(&r.name.to_lowercase()));
        assert!(
            hit,
            "no keyword-derived respellings (options {:?}) in {:?}",
            keyword_respells,
            results.iter().map(|r| &r.name).collect::<Vec<_>>()
        );
    }

    #[test]
    fn single_viable_respell_accent_stays_tied_to_the_product_subject() {
        let prompts = [
            "a marketplace for vintage keyboards",
            "fitness coaching for athletes",
            "animal health reminders for pet owners",
        ];

        for (index, description) in prompts.iter().enumerate() {
            let mut c = cfg(Style::BigTech);
            c.variant = Some("respell".to_string());
            c.description = Some((*description).to_string());
            c.count = 1;
            c.seed = Some(0xA076_1D64_78BD_642Fu64.wrapping_mul(index as u64 + 1));
            let expected: HashSet<String> = keywords::respell_source_keywords(
                &keywords::extract_keywords(description, 6),
            )
                .iter()
                .flat_map(|keyword| blend::respell_options(keyword))
                .collect();
            let results = generate(&c);
            assert_eq!(results.len(), 1, "wrong count for {description}");
            assert_eq!(
                results[0].name,
                generate(&c)[0].name,
                "prompted Respell lost seeded determinism"
            );
            assert!(
                expected.contains(&results[0].name.to_lowercase()),
                "{} is unrelated to {description}; expected one of {expected:?}",
                results[0].name
            );
        }
    }

    #[test]
    fn realword_mode_survives_exclusion() {
        // Same shape for the small curated realword pool.
        let mut c = cfg(Style::BigTech);
        c.variant = Some("realword".to_string());
        c.count = 10;
        let first: Vec<String> = generate(&c).into_iter().map(|r| r.name).collect();
        assert!(!first.is_empty());

        let mut c2 = cfg(Style::BigTech);
        c2.variant = c.variant.clone();
        c2.count = 10;
        c2.seed = Some(1337);
        c2.exclude = first.clone();
        let second: Vec<String> = generate(&c2).into_iter().map(|r| r.name).collect();
        assert!(
            !second.is_empty(),
            "realword mode starved after one excluded batch"
        );
        for n in &second {
            assert!(!first.contains(n), "{n} repeated despite exact exclusion");
        }
    }

    #[test]
    fn mimics_indexed_matches_scan() {
        // The by-length index (Phase 34) must give the same verdict as the full
        // corpus scan for every probe — truncations, pads, typos, unrelated.
        let st = BigtechStatic::get();
        let corpus = parse_lines(BIGTECH_CORPUS);
        let probes = [
            "supaba",
            "gongodb",
            "hulumi",
            "zephyrium",
            "xstripe",
            "supabasey",
            "twility",
            "googl",
            "googler",
            "spotif",
            "notione",
            "zzzz",
            "keyston",
            "vantaflow",
            "amazo",
            "samazon",
            "figm",
            "figmaa",
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
            ("supaba", "supabase"),
            ("gongodb", "mongodb"),
            ("abc", "abc"),
            ("abc", "abd"),
            ("abc", "xyz"),
            ("short", "shortest"),
            ("keyston", "keystone"),
            ("a", "abc"),
            ("", "ab"),
            ("", "abc"),
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
    fn explain_decomposes_known_shapes() {
        // Real-word prefix + brandable suffix.
        let e = explain("Forgeify");
        assert_eq!(e.prefix_word.as_deref(), Some("forge"));
        assert_eq!(e.suffix.as_deref(), Some("ify"));
        assert_eq!(e.stem.as_deref(), Some("forge"));
        assert!(!e.is_real_word);
        // A plain real word.
        let e = explain("Notion");
        assert!(e.is_real_word);
        assert!(e.prefix_word.is_none());
        // A pure coinage decomposes to nothing structural. (Not "Zentu" — that
        // genuinely opens with the real word "zen", which explain() reports.)
        let e = explain("Vrixo");
        assert!(e.suffix.is_none() && e.prefix_word.is_none() && !e.is_real_word);
        assert!(e.syllables >= 1);
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
