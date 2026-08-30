//! Deterministic reasoning namer (Phase 143): finds names the way a human
//! namer reasons, without any LLM.
//!
//! The pipeline is classic spreading activation over explicit knowledge:
//!   brief keywords
//!     → semantic-field neighbors (embedding edges, `semfield`)
//!     → curated concept bridges (the metaphor jumps a person makes:
//!       password → lock → gate; memory → well)
//!     → the story knowledge base (`core/data/story_kb.tsv`: mythology,
//!       foreign words, craft/nautical/astronomy terms, each with a gloss).
//!
//! Every result carries its full reasoning CHAIN ("backlinks → memory → well
//! that holds all memory → Mimir"), so the output is an argument, not a
//! string. Fully deterministic per (brief, seed); the seed only jitters
//! near-ties. Reachable via `Config.variant == "reason"`.

use crate::style::Config;
use crate::submorph::norm;
use crate::{collision, keywords, rank_jitter, semfield, NameResult};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::OnceLock;

const STORY_KB: &str = include_str!("../data/story_kb.tsv");
const BRIDGES: &str = include_str!("../data/concept_bridges.tsv");

/// Dedicated ChaCha-free jitter salt space; the family needs no RNG stream —
/// selection jitter comes from `rank_jitter(name, seed)` directly. Strong
/// enough that different seeds genuinely reshuffle near-tier entries (the
/// stress harness showed 0.08 froze every page identical across seeds).
const JITTER_W: f64 = 0.22;

#[derive(Debug, Clone)]
struct KbEntry {
    name: String,
    kind: String,
    origin: String,
    gloss: String,
    tags: Vec<String>,
    spice: f64,
}

static KB: OnceLock<Vec<KbEntry>> = OnceLock::new();
static BRIDGE_MAP: OnceLock<HashMap<String, Vec<(String, String, f64)>>> = OnceLock::new();

fn kb() -> &'static Vec<KbEntry> {
    KB.get_or_init(|| {
        STORY_KB
            .lines()
            .filter(|l| !l.trim().is_empty() && !l.starts_with('#'))
            .filter_map(|line| {
                let c: Vec<&str> = line.split('\t').collect();
                if c.len() < 6 {
                    return None;
                }
                Some(KbEntry {
                    name: c[0].trim().to_string(),
                    kind: c[1].trim().to_string(),
                    origin: c[2].trim().to_string(),
                    gloss: c[3].trim().to_string(),
                    tags: c[4].split(',').map(|t| norm(t.trim())).collect(),
                    spice: c[5].trim().parse().unwrap_or(0.5),
                })
            })
            .collect()
    })
}

/// Edge value: (normalized target for matching, original spelling for display,
/// weight). Matching runs on normalized forms; chains show real words.
fn bridges() -> &'static HashMap<String, Vec<(String, String, f64)>> {
    BRIDGE_MAP.get_or_init(|| {
        let mut map: HashMap<String, Vec<(String, String, f64)>> = HashMap::new();
        for line in BRIDGES.lines() {
            if line.trim().is_empty() || line.starts_with('#') {
                continue;
            }
            let c: Vec<&str> = line.split('\t').collect();
            if c.len() < 3 {
                continue;
            }
            let to_raw = c[1].trim().to_string();
            let w: f64 = c[2].trim().parse().unwrap_or(0.5);
            let from = norm(c[0].trim());
            let edge = (norm(&to_raw), to_raw, w);
            // e-elision alias: "optimizer" norms to "optimiz", which must still
            // find the "optimize" edges — index e-final keys under both forms.
            if let Some(stripped) = from.strip_suffix('e') {
                map.entry(stripped.to_string()).or_default().push(edge.clone());
            }
            map.entry(from).or_default().push(edge);
        }
        map
    })
}

/// Activation lookup tolerant of e-elision on either side ("optimize" tag vs
/// "optimiz" activation key and vice versa).
fn act_get<'a>(act: &'a HashMap<String, Activation>, key: &str) -> Option<&'a Activation> {
    if let Some(a) = act.get(key) {
        return Some(a);
    }
    if let Some(stripped) = key.strip_suffix('e') {
        if let Some(a) = act.get(stripped) {
            return Some(a);
        }
    }
    act.get(&format!("{key}e"))
}

/// One activated concept: its strength and the reasoning path that lit it.
#[derive(Debug, Clone)]
struct Activation {
    weight: f64,
    path: Vec<String>,
}

/// Spread activation from the brief. Deterministic; paths record provenance.
fn activate(cfg: &Config) -> HashMap<String, Activation> {
    let mut act: HashMap<String, Activation> = HashMap::new();
    let mut boost = |concept: String, weight: f64, path: Vec<String>, act: &mut HashMap<String, Activation>| {
        let e = act.entry(concept).or_insert(Activation { weight: 0.0, path: Vec::new() });
        if weight > e.weight {
            e.weight = weight;
            e.path = path;
        }
    };

    let mut seeds: Vec<String> = Vec::new();
    if let Some(desc) = cfg.description.as_deref().filter(|d| !d.trim().is_empty()) {
        seeds.extend(keywords::extract_keywords(desc, 6));
    }
    seeds.extend(cfg.roots.iter().map(|r| r.trim().to_lowercase()).filter(|r| !r.is_empty()));

    // The keyword extractor stems ("dating" → "dat", "conferencing" →
    // "conferenc"). Chains are shown to humans, so recover the original brief
    // word for display: the first brief token the stem prefixes.
    let brief_words: Vec<String> = cfg
        .description
        .as_deref()
        .unwrap_or("")
        .to_lowercase()
        .split(|c: char| !c.is_ascii_alphabetic())
        .filter(|w| w.len() >= 3)
        .map(str::to_string)
        .collect();
    let display_of = |kw: &str| -> String {
        brief_words
            .iter()
            .find(|w| w.starts_with(kw))
            .cloned()
            .unwrap_or_else(|| kw.to_string())
    };

    for kw in &seeds {
        let k = norm(kw);
        let disp = display_of(kw);
        // Sense trust: when a keyword has hand-written bridges, a human has
        // declared its intended sense — embedding neighbors (which blur word
        // senses: "chains" → retail stores) get discounted for that keyword.
        let sem_scale = if bridges().contains_key(&k) { 0.6 } else { 1.0 };
        boost(k, 1.0, vec![disp.clone()], &mut act);
        for (rank, nb) in semfield::expand(kw, 10).into_iter().enumerate() {
            let w = sem_scale * 0.55 / (1.0 + rank as f64 / 5.0);
            boost(norm(nb), w, vec![disp.clone(), nb.to_string()], &mut act);
        }
    }
    // Two bridge hops: the metaphor jumps. Each hop decays. Keys are
    // normalized; paths keep the human-readable spellings.
    for _hop in 0..2 {
        let snapshot: Vec<(String, Activation)> =
            act.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        for (concept, a) in snapshot {
            if a.weight < 0.15 {
                continue;
            }
            if let Some(edges) = bridges().get(&concept) {
                for (to_key, to_display, bw) in edges {
                    let w = a.weight * bw * 0.85;
                    if w < 0.10 {
                        continue;
                    }
                    let mut path = a.path.clone();
                    path.push(to_display.clone());
                    boost(to_key.clone(), w, path, &mut act);
                }
            }
        }
    }
    act
}

/// The reasoning behind one proposed name.
#[derive(Debug, Clone, Serialize)]
pub struct ReasonDecode {
    pub name: String,
    pub kind: String,
    pub origin: String,
    pub gloss: String,
    /// The activation path that reached this entry, e.g.
    /// ["backlink", "memory", "recall"] — render as backlink → memory → recall.
    pub chain: Vec<String>,
    pub taken: bool,
}

/// The coining lane: when the perfect real word is taken (Argus, Nexus…), a
/// human namer coins from the concept instead. Reason hands its strongest
/// activated imagery to the submorph engine and stitches the reasoning chain
/// onto each coined result.
fn coined_candidates(
    cfg: &Config,
    seed: u64,
    act: &HashMap<String, Activation>,
) -> Vec<(NameResult, ReasonDecode, f64)> {
    if act.is_empty() {
        return Vec::new();
    }
    let mut concepts: Vec<(&String, &Activation)> = act
        .iter()
        .filter(|(c, a)| c.len() >= 3 && a.weight >= 0.25)
        .collect();
    concepts.sort_by(|a, b| {
        b.1.weight
            .partial_cmp(&a.1.weight)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.0.cmp(b.0))
    });
    concepts.truncate(8);
    if concepts.is_empty() {
        return Vec::new();
    }
    // Path lookup for chain stitching, keyed by the concept's display word.
    let path_of: HashMap<String, Vec<String>> = concepts
        .iter()
        .map(|(c, a)| ((*c).clone(), a.path.clone()))
        .collect();
    let mut coin_cfg = cfg.clone();
    coin_cfg.variant = Some("submorph".to_string());
    coin_cfg.description = Some(
        concepts
            .iter()
            .map(|(c, _)| c.as_str())
            .collect::<Vec<_>>()
            .join(" "),
    );
    coin_cfg.roots = Vec::new();
    let (results, decodes) = crate::submorph::generate_submorph_explained(&coin_cfg, seed ^ 0xC01);
    results
        .into_iter()
        .zip(decodes)
        .enumerate()
        .map(|(i, (r, d))| {
            // Chain = the activation path of the fragment's best brief-field
            // hit, ending in the coinage.
            let hit = d
                .head_hits
                .first()
                .or_else(|| d.tail_hits.first())
                .map(|h| norm(h));
            // Best case: the fragment's hit word IS one of our concepts —
            // inherit that exact path. Fallback (the hit came via submorph's
            // own one-hop expansion): inherit the strongest concept's path, so
            // the chain still shows the reasoning that seeded the coinage.
            let chain = hit
                .and_then(|h| {
                    path_of
                        .iter()
                        .find(|(c, _)| norm(c) == h)
                        .map(|(_, p)| p.clone())
                })
                .or_else(|| concepts.first().map(|(_, a)| a.path.clone()))
                .unwrap_or_default();
            let gloss = format!("{} + {}", d.head_gloss, d.tail_gloss);
            let decode = ReasonDecode {
                name: r.name.clone(),
                kind: "coined".to_string(),
                origin: "coined".to_string(),
                gloss,
                chain,
                taken: false,
            };
            // Competitive with strong retrievals so the page genuinely mixes.
            let score = 0.55 + 0.6 * (1.0 - i as f64 / 10.0);
            (r, decode, score)
        })
        .collect()
}

pub fn generate_reason_explained(cfg: &Config, seed: u64) -> (Vec<NameResult>, Vec<ReasonDecode>) {
    let wild = cfg.temperature >= 1.0;
    let act = activate(cfg);
    let excluded: std::collections::HashSet<String> =
        cfg.exclude.iter().map(|e| e.to_lowercase()).collect();

    struct Scored<'a> {
        e: &'a KbEntry,
        score: f64,
        chain: Vec<String>,
        taken: bool,
    }
    let mut scored: Vec<Scored> = Vec::new();
    for e in kb() {
        let lower = e.name.to_lowercase();
        if excluded.contains(&lower) {
            continue;
        }
        if lower.len() < cfg.min_len.min(3) || lower.len() > cfg.max_len.max(10) {
            continue;
        }
        let (mut best, mut sum, mut chain): (f64, f64, Vec<String>) = (0.0, 0.0, Vec::new());
        // An entry's own name is an implicit tag: activating the concept
        // "ledger" must be able to reach the Ledger entry itself.
        let self_tag = norm(&lower);
        for tag in e.tags.iter().chain(std::iter::once(&self_tag)) {
            if let Some(a) = act_get(&act, tag) {
                sum += a.weight;
                if a.weight > best {
                    best = a.weight;
                    chain = a.path.clone();
                }
            }
        }
        if best <= 0.0 && !act.is_empty() {
            continue;
        }
        let mut score = best + 0.35 * (sum - best);
        // Register: Wild reaches for the exotic shelf; Balanced stays nearer
        // the familiar end and mildly discounts the most exotic entries.
        if wild {
            score += 0.30 * e.spice;
        } else {
            score -= 0.25 * (e.spice - 0.65).max(0.0);
        }
        let taken = collision::likely_taken(&lower);
        if taken {
            score -= 0.9;
        }
        // Promptless page: pure register browsing, seed-jittered below.
        if act.is_empty() {
            score += 0.5;
        }
        score += rank_jitter(&lower, seed) * JITTER_W;
        scored.push(Scored { e, score, chain, taken });
    }
    // Merge the retrieval lane with the coining lane into one ranked pool.
    let mut merged: Vec<(f64, NameResult, ReasonDecode)> = scored
        .iter()
        .map(|s| {
            (
                s.score,
                crate::family::to_result(&s.e.name.to_lowercase()),
                ReasonDecode {
                    name: s.e.name.clone(),
                    kind: s.e.kind.clone(),
                    origin: s.e.origin.clone(),
                    gloss: s.e.gloss.clone(),
                    chain: s.chain.clone(),
                    taken: s.taken,
                },
            )
        })
        .collect();
    for (r, d, score) in coined_candidates(cfg, seed, &act) {
        if excluded.contains(&r.name.to_lowercase()) {
            continue;
        }
        merged.push((score, r, d));
    }
    merged.sort_by(|a, b| {
        b.0.partial_cmp(&a.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.2.name.cmp(&b.2.name))
    });

    // Variety caps: no page monoculture of one kind or origin — the coined
    // lane carries kind/origin "coined", so the same cap bounds its share.
    let cap = ((cfg.count as f64 * 0.34).ceil() as usize).max(1);
    let mut kind_n: HashMap<String, usize> = HashMap::new();
    let mut origin_n: HashMap<String, usize> = HashMap::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut out: Vec<NameResult> = Vec::new();
    let mut decodes: Vec<ReasonDecode> = Vec::new();
    for (_, r, d) in &merged {
        if out.len() >= cfg.count {
            break;
        }
        if !seen.insert(r.name.to_lowercase()) {
            continue;
        }
        if kind_n.get(d.kind.as_str()).copied().unwrap_or(0) >= cap {
            continue;
        }
        if origin_n.get(d.origin.as_str()).copied().unwrap_or(0) >= cap {
            continue;
        }
        *kind_n.entry(d.kind.clone()).or_default() += 1;
        *origin_n.entry(d.origin.clone()).or_default() += 1;
        decodes.push(d.clone());
        out.push(r.clone());
    }
    (out, decodes)
}

/// Plain entry for the lib.rs variant dispatch.
pub fn generate_reason(
    cfg: &Config,
    _dict: &std::collections::HashSet<String>,
    seed: u64,
) -> Vec<NameResult> {
    generate_reason_explained(cfg, seed).0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::style::Style;

    fn cfg(desc: &str) -> Config {
        Config {
            style: Style::BigTech,
            variant: Some("reason".to_string()),
            description: Some(desc.to_string()),
            seed: Some(7),
            ..Config::default()
        }
    }

    #[test]
    fn kb_and_bridges_load() {
        assert!(kb().len() >= 150, "kb too small: {}", kb().len());
        assert!(bridges().len() >= 150, "bridges too small: {}", bridges().len());
        for e in kb() {
            assert!(!e.tags.is_empty(), "{} has no tags", e.name);
            assert!(!e.gloss.is_empty(), "{} has no gloss", e.name);
        }
    }

    #[test]
    fn password_brief_reaches_lock_imagery_with_chains() {
        let (results, decodes) = generate_reason_explained(&cfg("a self hosted password manager"), 7);
        assert!(!results.is_empty());
        let names: Vec<&str> = decodes.iter().map(|d| d.name.as_str()).collect();
        // The curated lock/guard shelf must be reachable from this brief.
        assert!(
            names.iter().any(|n| ["Kilit", "Donjon", "Custos", "Arcanum", "Aegis", "Krypta"].contains(n)),
            "no lock-imagery name surfaced: {names:?}"
        );
        for d in &decodes {
            assert!(!d.chain.is_empty(), "{} has no reasoning chain", d.name);
        }
    }

    #[test]
    fn deterministic_and_seed_jitters_only_ties() {
        let a = generate_reason_explained(&cfg("a terminal log viewer"), 3).0;
        let b = generate_reason_explained(&cfg("a terminal log viewer"), 3).0;
        assert_eq!(
            a.iter().map(|r| &r.name).collect::<Vec<_>>(),
            b.iter().map(|r| &r.name).collect::<Vec<_>>()
        );
    }

    /// KB/bridge lint: the knowledge files are the engine's whole world —
    /// this test keeps them structurally sound as they grow.
    #[test]
    fn knowledge_files_pass_lint() {
        let kinds = ["myth", "foreign", "craft", "nautical", "astro", "nature", "literary"];
        let mut seen = std::collections::HashSet::new();
        for e in kb() {
            let lower = e.name.to_lowercase();
            assert!(seen.insert(lower.clone()), "duplicate KB name: {}", e.name);
            assert!(
                (3..=14).contains(&e.name.len()) && e.name.chars().all(|c| c.is_ascii_alphabetic()),
                "bad KB name: {}",
                e.name
            );
            assert!(kinds.contains(&e.kind.as_str()), "{}: bad kind {}", e.name, e.kind);
            assert!(!e.origin.is_empty(), "{}: empty origin", e.name);
            assert!((0.0..=1.0).contains(&e.spice), "{}: spice {}", e.name, e.spice);
            assert!(
                (1..=8).contains(&e.tags.len()),
                "{}: {} tags",
                e.name,
                e.tags.len()
            );
            for t in &e.tags {
                assert!(
                    !t.is_empty() && t.chars().all(|c| c.is_ascii_lowercase()),
                    "{}: bad tag {t:?}",
                    e.name
                );
            }
            assert!(
                (5..=60).contains(&e.gloss.len()),
                "{}: gloss length {}",
                e.name,
                e.gloss.len()
            );
        }
        let mut edges = std::collections::HashSet::new();
        for (from, outs) in bridges() {
            for (to, _, w) in outs {
                assert!(*w > 0.0 && *w <= 1.0, "bridge {from}->{to}: weight {w}");
                assert_ne!(from, to, "self-loop bridge: {from}");
                edges.insert((from.clone(), to.clone()));
            }
        }
        assert!(edges.len() >= 250, "bridge set unexpectedly small: {}", edges.len());
    }

    /// Coverage gate: the stress-harness expectations, frozen. KB/bridge edits
    /// must never silently regress breadth (this is the reason-family
    /// equivalent of the held-out audit discipline).
    #[test]
    fn stress_briefs_stay_covered() {
        let briefs = [
            "a self hosted password manager",
            "a terminal log viewer",
            "a package registry for private modules",
            "a database migration tool",
            "a video conferencing app",
            "an e-commerce checkout library",
            "a machine learning experiment tracker",
            "a kubernetes cost optimizer",
            "an invoice generator for freelancers",
            "a GPU profiler",
            "a spreadsheet engine",
            "a chess training app",
            "a weather station dashboard",
            "a dating app",
            "a podcast editor",
            "a recipe manager",
            "a kids drawing app",
            "an expense splitting app for roommates",
            "a flight booking search engine",
            "a plant care reminder app",
        ];
        let mut freq: HashMap<String, usize> = HashMap::new();
        let mut thin = 0usize;
        for brief in briefs {
            let (results, decodes) = generate_reason_explained(&cfg(brief), 7);
            assert!(results.len() >= 4, "{brief}: only {} names", results.len());
            if results.len() < 5 {
                thin += 1;
            }
            for d in decodes {
                *freq.entry(d.name).or_default() += 1;
            }
        }
        assert!(thin <= 2, "{thin} thin briefs (<5 names)");
        for (name, n) in freq {
            assert!(n <= 7, "wallpaper: {name} appears in {n}/20 pages");
        }
    }

    #[test]
    fn coined_lane_mixes_in_with_chains() {
        let (_, decodes) = generate_reason_explained(&cfg("a self hosted password manager"), 7);
        let coined: Vec<&ReasonDecode> = decodes.iter().filter(|d| d.kind == "coined").collect();
        assert!(!coined.is_empty(), "no coined candidates on a rich brief");
        for d in &coined {
            assert!(!d.chain.is_empty(), "coined {} has no chain", d.name);
            assert!(!d.taken, "coined {} marked taken", d.name);
        }
        // Retrieval must still lead the page.
        assert!(decodes.iter().any(|d| d.kind != "coined"));
    }

    #[test]
    fn promptless_page_renders_with_variety() {
        let base = Config {
            style: Style::BigTech,
            variant: Some("reason".to_string()),
            seed: Some(5),
            ..Config::default()
        };
        let (results, decodes) = generate_reason_explained(&base, 5);
        assert!(results.len() >= 8, "promptless too thin: {}", results.len());
        let kinds: std::collections::HashSet<&str> =
            decodes.iter().map(|d| d.kind.as_str()).collect();
        assert!(kinds.len() >= 3, "promptless page is a monoculture: {kinds:?}");
    }
}
