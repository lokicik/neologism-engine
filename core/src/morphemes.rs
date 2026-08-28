//! Morpheme-composition generator family (Phase 141, roadmap phase 3).
//!
//! Meaning-first coinage: it selects Greek/Latin roots whose glosses match the
//! brief (directly or through the phase-2 semantic field), then composes two of
//! them with classical linking vowels (photo+o+graph, lumin+aria) into a single
//! coined word. This is a register the seam-blend family can't reach — a name
//! that *decodes* to a meaning rather than fusing two surface words — and its
//! linking-vowel shape is distinct from seam blends, so it doesn't just move
//! cards into another visible template family.
//!
//! Reachable only through `Config.variant == "morpheme"`; its own ChaCha stream
//! and the enumerate→filter→rank pipeline in `family` keep production Auto and
//! every existing mode bit-identical.

use crate::family;
use crate::phonotactics::is_vowel;
use crate::style::Config;
use crate::{exclude::ExcludeSet, keywords, semfield, BigtechStatic};
use std::collections::HashSet;
use std::sync::OnceLock;

/// Dedicated ChaCha stream id — disjoint from production Auto (0), seam-blend
/// (0x5EA6B1E4), and any future family.
const MORPHEME_STREAM_ID: u64 = 0x_0033_0287;

/// Fallback morphemes for pages with too few brief matches — broadly brandable
/// roots that read well in any coinage.
const AESTHETIC_PAD: &[&str] = &["lum", "nova", "vita", "dyna", "nex", "astro", "flu", "sol"];

#[derive(Debug, Clone)]
struct Morpheme {
    form: String,
    gloss: String,
    tags: Vec<String>,
}

const MORPHEMES_TSV: &str = include_str!("../data/morphemes.tsv");

static MORPHEMES: OnceLock<Vec<Morpheme>> = OnceLock::new();

fn morphemes() -> &'static Vec<Morpheme> {
    MORPHEMES.get_or_init(|| {
        MORPHEMES_TSV
            .lines()
            .filter(|l| !l.trim().is_empty() && !l.starts_with('#'))
            .filter_map(|line| {
                let mut cols = line.split('\t');
                let form = cols.next()?.trim().to_string();
                let _origin = cols.next()?;
                let gloss = cols.next()?.trim().to_string();
                let tags = cols
                    .next()
                    .unwrap_or("")
                    .split(',')
                    .map(|t| t.trim().to_string())
                    .filter(|t| !t.is_empty())
                    .collect();
                (!form.is_empty() && form.chars().all(|c| c.is_ascii_lowercase()))
                    .then_some(Morpheme { form, gloss, tags })
            })
            .collect()
    })
}

/// The brief's concept words: its keywords plus their semantic-field neighbors.
fn concept_words(cfg: &Config) -> HashSet<String> {
    let mut concepts: HashSet<String> = HashSet::new();
    if let Some(desc) = cfg.description.as_deref().filter(|d| !d.trim().is_empty()) {
        for kw in keywords::extract_keywords(desc, 6) {
            for nb in semfield::expand(&kw, 8) {
                concepts.insert(nb.to_string());
            }
            concepts.insert(kw);
        }
    }
    for root in &cfg.roots {
        let r = root.trim().to_lowercase();
        if !r.is_empty() {
            for nb in semfield::expand(&r, 8) {
                concepts.insert(nb.to_string());
            }
            concepts.insert(r);
        }
    }
    concepts
}

fn morpheme_matches(m: &Morpheme, concepts: &HashSet<String>) -> bool {
    concepts.contains(&m.gloss) || m.tags.iter().any(|t| concepts.contains(t))
}

/// Classical compositions of two morpheme forms: direct, elided (drop a's final
/// vowel before a vowel), and linking-vowel (-o-/-i-) when both sides are
/// consonantal. The shared filter chain rejects anything unpronounceable.
fn compositions(a: &str, b: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let a_last = a.chars().last();
    let b_first = b.chars().next();
    let a_vowel = a_last.is_some_and(is_vowel);
    let b_vowel = b_first.is_some_and(is_vowel);

    out.push(format!("{a}{b}"));
    if a_vowel && b_vowel {
        // luna + aria -> lunaria (drop a's trailing vowel to avoid a hiatus).
        let cut = a.len() - a_last.unwrap().len_utf8();
        if cut >= 2 {
            out.push(format!("{}{}", &a[..cut], b));
        }
    }
    if !a_vowel && !b_vowel {
        // photo-style linking vowel between two consonantal seams.
        out.push(format!("{a}o{b}"));
        out.push(format!("{a}i{b}"));
    }
    out.sort();
    out.dedup();
    out
}

/// Generate a morpheme-composition page. `seed` only affects rank jitter.
pub fn generate_morpheme(cfg: &Config, dict: &HashSet<String>, seed: u64) -> Vec<crate::NameResult> {
    let st = BigtechStatic::get();
    let exclude = ExcludeSet::new(&cfg.exclude, 2000);
    let all = morphemes();
    let concepts = concept_words(cfg);

    // Matched morphemes (meaning-first); dedup by form, keep deterministic order.
    let mut matched: Vec<&Morpheme> = all
        .iter()
        .filter(|m| morpheme_matches(m, &concepts))
        .collect();
    matched.sort_by(|x, y| x.form.cmp(&y.form));
    matched.truncate(16);

    // The brandable pad only fills in when the brief matched too few morphemes
    // to compose among themselves; otherwise it floods every page with the same
    // few tails (-astro/-lum), which is the visible-template wall we avoid.
    let pad: Vec<&Morpheme> = AESTHETIC_PAD
        .iter()
        .filter_map(|form| all.iter().find(|m| m.form == *form))
        .collect();
    let use_pad = matched.len() < 4;
    let firsts: Vec<&Morpheme> = if matched.is_empty() {
        pad.clone()
    } else {
        matched.clone()
    };
    let seconds: Vec<&Morpheme> = if use_pad {
        let mut v = matched.clone();
        for p in &pad {
            if !v.iter().any(|m| m.form == p.form) {
                v.push(p);
            }
        }
        v
    } else {
        matched.clone()
    };

    let mut pool: Vec<(String, f64)> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for a in &firsts {
        for b in &seconds {
            if a.form == b.form {
                continue;
            }
            let both_matched = morpheme_matches(a, &concepts) && morpheme_matches(b, &concepts);
            let distinct = a.gloss != b.gloss;
            let bonus = if both_matched && distinct { 0.4 } else { 0.2 };
            for name in compositions(&a.form, &b.form) {
                if !seen.insert(name.clone()) {
                    continue;
                }
                if !family::passes_name_filters(&name, cfg, dict, st, &exclude) {
                    continue;
                }
                pool.push((name, bonus));
            }
        }
    }
    family::rank_select(&pool, cfg, seed, MORPHEME_STREAM_ID)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::style::Style;

    fn cfg(desc: &str) -> Config {
        Config {
            style: Style::BigTech,
            variant: Some("morpheme".to_string()),
            description: Some(desc.to_string()),
            seed: Some(7),
            ..Config::default()
        }
    }

    #[test]
    fn dataset_loads_and_forms_are_clean() {
        let ms = morphemes();
        assert!(ms.len() >= 120, "only {} morphemes", ms.len());
        for m in ms {
            assert!(m.form.chars().all(|c| c.is_ascii_lowercase()), "bad form {}", m.form);
            assert!(!m.gloss.is_empty());
        }
    }

    #[test]
    fn compositions_handle_vowel_seams() {
        // consonant+consonant → linking vowels offered.
        let c = compositions("lum", "graf");
        assert!(c.contains(&"lumograf".to_string()));
        // vowel+vowel → elided form offered.
        let v = compositions("luna", "aria");
        assert!(v.iter().any(|s| s == "lunaria" || s == "lunaaria"));
    }

    #[test]
    fn light_brief_selects_light_morphemes_and_generates() {
        let dict = crate::DICT.get_or_init(crate::build_dictionary);
        let page = generate_morpheme(&cfg("a tool for photo light and color"), dict, 7);
        assert!(!page.is_empty(), "no morpheme names for a light brief");
        let st = BigtechStatic::get();
        for r in &page {
            let lower = r.name.to_lowercase();
            assert!(lower.len() >= cfg("x").min_len && lower.len() <= cfg("x").max_len);
            assert!(!st.common_words.contains(&lower), "real word leaked: {}", r.name);
            assert!(!st.corpus_set.contains(&lower), "brand leaked: {}", r.name);
        }
    }

    #[test]
    fn deterministic_per_seed() {
        let dict = crate::DICT.get_or_init(crate::build_dictionary);
        let a = generate_morpheme(&cfg("a water and sea navigation app"), dict, 3);
        let b = generate_morpheme(&cfg("a water and sea navigation app"), dict, 3);
        assert_eq!(
            a.iter().map(|r| &r.name).collect::<Vec<_>>(),
            b.iter().map(|r| &r.name).collect::<Vec<_>>()
        );
    }
}
