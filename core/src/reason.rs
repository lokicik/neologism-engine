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
/// selection jitter comes from `rank_jitter(name, seed)` directly.
const JITTER_W: f64 = 0.08;

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
            map.entry(norm(c[0].trim()))
                .or_default()
                .push((norm(&to_raw), to_raw, w));
        }
        map
    })
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

    for kw in &seeds {
        let k = norm(kw);
        boost(k, 1.0, vec![kw.clone()], &mut act);
        for (rank, nb) in semfield::expand(kw, 10).into_iter().enumerate() {
            let w = 0.55 / (1.0 + rank as f64 / 5.0);
            boost(norm(nb), w, vec![kw.clone(), nb.to_string()], &mut act);
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
        for tag in &e.tags {
            if let Some(a) = act.get(tag) {
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
    scored.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.e.name.cmp(&b.e.name))
    });

    // Variety caps: no page monoculture of one kind or origin.
    let cap = ((cfg.count as f64 * 0.34).ceil() as usize).max(1);
    let mut kind_n: HashMap<&str, usize> = HashMap::new();
    let mut origin_n: HashMap<&str, usize> = HashMap::new();
    let mut out: Vec<NameResult> = Vec::new();
    let mut decodes: Vec<ReasonDecode> = Vec::new();
    for s in &scored {
        if out.len() >= cfg.count {
            break;
        }
        if kind_n.get(s.e.kind.as_str()).copied().unwrap_or(0) >= cap {
            continue;
        }
        if origin_n.get(s.e.origin.as_str()).copied().unwrap_or(0) >= cap {
            continue;
        }
        *kind_n.entry(s.e.kind.as_str()).or_default() += 1;
        *origin_n.entry(s.e.origin.as_str()).or_default() += 1;
        decodes.push(ReasonDecode {
            name: s.e.name.clone(),
            kind: s.e.kind.clone(),
            origin: s.e.origin.clone(),
            gloss: s.e.gloss.clone(),
            chain: s.chain.clone(),
            taken: s.taken,
        });
        out.push(crate::family::to_result(&s.e.name.to_lowercase()));
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
