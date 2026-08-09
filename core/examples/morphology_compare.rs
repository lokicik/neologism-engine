// Audit recurring Brandable morphology artifacts across established and held-out briefs.
// Run: cargo run -p neologism-core --example morphology_compare --release
use neologism_core::blend::overlap_blend;
use neologism_core::generate;
use neologism_core::keywords::{brand_root_groups, brand_roots, extract_keywords};
use neologism_core::metrics::{composite_score, diversity};
use neologism_core::style::{Config, Style};
use std::collections::{BTreeMap, BTreeSet};

const PROMPTS: &[&str] = &[
    "a developer tool that generates names for packages CLIs libraries and projects",
    "a journaling app with mood insights",
    "a secure password manager for teams",
    "an app for splitting expenses with friends",
    "a marketplace for vintage keyboards",
    "a fast analytics dashboard for API performance",
    "a CLI for database migrations",
    "an API rate limiting library",
    "a terminal log viewer",
    "git release automation",
    "a local cache inspector",
    "a browser bookmark manager",
    "an API testing toolkit",
    "a cloud deployment dashboard",
    "a message queue client",
    "a code formatter and linter",
    "an environment variable manager",
    "a filesystem search CLI",
    "a feature flag service",
    "a background job scheduler",
    "dependency update automation",
    "a documentation site generator",
];
const SEEDS: &[u64] = &[7, 42, 101, 2024, 9999];
const COLLAPSED_SUFFIX_TAILS: &[&str] = &["a", "o", "ra", "x", "fy"];
const CONCEPT_SUFFIXES: &[&str] = &["ia", "io", "ora", "ix", "ify"];
// Audit mirror of the production exploration palette in core/src/lib.rs.
const CONCEPT_METAPHORS: &[&str] = &[
    "flow", "forge", "spark", "seed", "craft", "nest", "lab", "wave", "link", "pulse", "beam",
    "grid", "vault", "relay", "trace", "scope", "prism", "lumen", "nova", "peak", "trail", "path",
    "signal", "hive", "smith", "harbor", "grove", "spring", "frame", "glow", "flux", "loom",
    "muse", "atlas",
];

fn config(prompt: &str, seed: u64) -> Config {
    Config {
        style: Style::BigTech,
        count: 10,
        min_len: 4,
        max_len: 12,
        temperature: 0.85,
        variety: 0.3,
        seed: Some(seed),
        roots: vec![],
        variant: None,
        description: Some(prompt.to_string()),
        compound: false,
        starts_with: None,
        contains: None,
        exclude: vec![],
    }
}

fn has_collapsed_suffix(name: &str, roots: &[String]) -> bool {
    let lower = name.to_lowercase();
    roots.iter().any(|root| {
        root.chars()
            .last()
            .is_some_and(|last| matches!(last, 'a' | 'e' | 'i' | 'o' | 'u' | 'y'))
            && COLLAPSED_SUFFIX_TAILS
                .iter()
                .any(|tail| lower == format!("{root}{tail}"))
    })
}

fn has_full_vowel_suffix(name: &str, roots: &[String]) -> bool {
    let lower = name.to_lowercase();
    roots.iter().any(|root| {
        root.chars()
            .last()
            .is_some_and(|last| matches!(last, 'a' | 'e' | 'i' | 'o' | 'u' | 'y'))
            && CONCEPT_SUFFIXES
                .iter()
                .any(|suffix| lower == format!("{root}{suffix}"))
    })
}

fn has_concept_suffix(name: &str, roots: &[String]) -> bool {
    let lower = name.to_lowercase();
    roots.iter().any(|root| {
        CONCEPT_SUFFIXES
            .iter()
            .any(|suffix| lower == format!("{root}{suffix}"))
    })
}

fn concept_metaphor_tail(name: &str, roots: &[String]) -> Option<&'static str> {
    let lower = name.to_lowercase();
    for &metaphor in CONCEPT_METAPHORS {
        for root in roots {
            let mut joined = root.clone();
            let same_vowel_seam = root.chars().last().is_some_and(|last| {
                metaphor.starts_with(last) && matches!(last, 'a' | 'e' | 'i' | 'o' | 'u' | 'y')
            });
            if same_vowel_seam {
                joined.extend(metaphor.chars().skip(1));
            } else {
                joined.push_str(metaphor);
            }
            if lower == joined {
                return Some(metaphor);
            }
        }
    }
    None
}

fn tail_histogram(counts: &BTreeMap<&'static str, usize>) -> String {
    let mut entries: Vec<(&str, usize)> =
        counts.iter().map(|(&tail, &count)| (tail, count)).collect();
    entries.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
    entries
        .into_iter()
        .map(|(tail, count)| format!("{tail} {count}"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn concept_coverage(name: &str, groups: &[Vec<String>]) -> usize {
    let lower = name.to_lowercase();
    groups
        .iter()
        .filter(|group| {
            group
                .iter()
                .any(|root| lower.contains(root) || (root.len() >= 3 && lower.contains(&root[..3])))
        })
        .count()
}

fn has_collapsed_consonant_metaphor_seam(name: &str, roots: &[String]) -> bool {
    let lower = name.to_lowercase();
    roots.iter().any(|root| {
        let Some(last) = root.chars().last() else {
            return false;
        };
        !matches!(last, 'a' | 'e' | 'i' | 'o' | 'u' | 'y')
            && CONCEPT_METAPHORS.iter().any(|metaphor| {
                metaphor.starts_with(last)
                    && lower == format!("{root}{}", &metaphor[last.len_utf8()..])
            })
    })
}

fn overlap_candidates(
    groups: &[Vec<String>],
) -> (BTreeMap<String, String>, BTreeMap<String, String>) {
    let mut merged = BTreeMap::new();
    let mut preserved = BTreeMap::new();
    for first in 0..groups.len() {
        for second in first + 1..groups.len() {
            for a in &groups[first] {
                for b in &groups[second] {
                    if let Some(name) = overlap_blend(a, b) {
                        let overlap = a.len() + b.len() - name.len();
                        let pair = format!("{a}+{b} ({overlap})");
                        merged.insert(name, pair.clone());
                        preserved.insert(format!("{a}{b}"), pair);
                    }
                }
            }
        }
    }
    (merged, preserved)
}

fn record_overlap_form(
    name: &str,
    forms: &BTreeMap<String, String>,
    examples: &mut BTreeMap<String, usize>,
) {
    if let Some(pair) = forms.get(&name.to_lowercase()) {
        *examples.entry(format!("{name} <- {pair}")).or_default() += 1;
    }
}

fn main() {
    let mut total = 0usize;
    let mut collapsed = 0usize;
    let mut full_vowel_suffixes = 0usize;
    let mut concept_suffixes = 0usize;
    let mut multi_concept_joins = 0usize;
    let mut metaphor_forms = 0usize;
    let mut collapsed_consonant_metaphor_seams = 0usize;
    let mut composite = 0u64;
    let mut batch_diversity = 0.0;
    let mut collapsed_examples = BTreeSet::new();
    let mut full_vowel_suffix_examples = BTreeSet::new();
    let mut overlap_examples: BTreeMap<String, usize> = BTreeMap::new();
    let mut preserved_overlap_examples: BTreeMap<String, usize> = BTreeMap::new();
    let mut rolling_total = 0usize;
    let mut rolling_short = 0usize;
    let mut rolling_full_vowel_suffixes = 0usize;
    let mut rolling_concept_suffixes = 0usize;
    let mut rolling_multi_concept_joins = 0usize;
    let mut rolling_metaphor_forms = 0usize;
    let mut rolling_collapsed_consonant_metaphor_seams = 0usize;
    let mut suffix_heavy_pages = 0usize;
    let mut suffix_only_pages = 0usize;
    let mut collapsed_consonant_metaphor_examples = BTreeSet::new();
    let mut semantic_seam_lookalikes = BTreeSet::new();
    let mut metaphor_tail_counts = BTreeMap::new();
    let mut metaphor_tail_prompts: BTreeMap<&'static str, BTreeSet<&'static str>> = BTreeMap::new();
    let mut metaphor_pages = 0usize;
    let mut repeated_metaphor_tail_pages = 0usize;
    let mut max_metaphor_tail_share = 0usize;
    let mut rolling_metaphor_tail_counts = BTreeMap::new();
    let mut heavy_metaphor_tail_pages = BTreeSet::new();

    for prompt in PROMPTS {
        let keywords = extract_keywords(prompt, 6);
        let groups = brand_root_groups(&keywords, 16);
        let roots = brand_roots(&keywords, 16);
        let (overlaps, preserved_overlaps) = overlap_candidates(&groups);
        for seed in SEEDS {
            let results = generate(&config(prompt, *seed));
            batch_diversity += diversity(&results);
            let mut page_metaphor_tails = BTreeMap::new();
            for result in &results {
                if concept_coverage(&result.name, &groups) < 2 {
                    if let Some(tail) = concept_metaphor_tail(&result.name, &roots) {
                        *page_metaphor_tails.entry(tail).or_default() += 1;
                        *metaphor_tail_counts.entry(tail).or_default() += 1;
                        metaphor_tail_prompts
                            .entry(tail)
                            .or_default()
                            .insert(prompt);
                    }
                }
            }
            metaphor_pages += usize::from(!page_metaphor_tails.is_empty());
            repeated_metaphor_tail_pages +=
                usize::from(page_metaphor_tails.values().any(|count| *count >= 2));
            let page_max = page_metaphor_tails
                .values()
                .copied()
                .max()
                .unwrap_or_default();
            max_metaphor_tail_share = max_metaphor_tail_share.max(page_max);
            if page_max >= 3 {
                let forms = results
                    .iter()
                    .filter_map(|result| {
                        if concept_coverage(&result.name, &groups) >= 2 {
                            return None;
                        }
                        concept_metaphor_tail(&result.name, &roots)
                            .map(|tail| format!("{}:{tail}", result.name))
                    })
                    .collect::<Vec<_>>()
                    .join(", ");
                heavy_metaphor_tail_pages.insert(format!("{prompt} / {seed}: {forms}"));
            }
            let page_suffixes = results
                .iter()
                .filter(|result| has_concept_suffix(&result.name, &roots))
                .count();
            suffix_heavy_pages += usize::from(page_suffixes >= 8);
            suffix_only_pages += usize::from(page_suffixes == results.len());
            for result in results {
                let coverage = concept_coverage(&result.name, &groups);
                total += 1;
                composite += composite_score(&result) as u64;
                if has_collapsed_suffix(&result.name, &roots) {
                    collapsed += 1;
                    collapsed_examples.insert(result.name.clone());
                }
                if has_full_vowel_suffix(&result.name, &roots) {
                    full_vowel_suffixes += 1;
                    full_vowel_suffix_examples.insert(result.name.clone());
                }
                if has_concept_suffix(&result.name, &roots) {
                    concept_suffixes += 1;
                } else if coverage >= 2 {
                    multi_concept_joins += 1;
                } else {
                    metaphor_forms += 1;
                }
                if has_collapsed_consonant_metaphor_seam(&result.name, &roots) {
                    if coverage >= 2 {
                        semantic_seam_lookalikes.insert(result.name.clone());
                    } else {
                        collapsed_consonant_metaphor_seams += 1;
                        collapsed_consonant_metaphor_examples.insert(result.name.clone());
                    }
                }
                record_overlap_form(&result.name, &overlaps, &mut overlap_examples);
                record_overlap_form(
                    &result.name,
                    &preserved_overlaps,
                    &mut preserved_overlap_examples,
                );
            }
        }

        let mut excluded = Vec::new();
        for batch in 0..10 {
            let seed = 0xA076_1D64_78BD_642Fu64.wrapping_mul(batch + 1);
            let mut cfg = config(prompt, seed);
            cfg.exclude = excluded.clone();
            let results = generate(&cfg);
            rolling_short += usize::from(results.len() < cfg.count);
            rolling_total += results.len();
            for result in &results {
                let coverage = concept_coverage(&result.name, &groups);
                if coverage < 2 {
                    if let Some(tail) = concept_metaphor_tail(&result.name, &roots) {
                        *rolling_metaphor_tail_counts.entry(tail).or_default() += 1;
                    }
                }
                rolling_full_vowel_suffixes +=
                    usize::from(has_full_vowel_suffix(&result.name, &roots));
                if has_concept_suffix(&result.name, &roots) {
                    rolling_concept_suffixes += 1;
                } else if coverage >= 2 {
                    rolling_multi_concept_joins += 1;
                } else {
                    rolling_metaphor_forms += 1;
                }
                if has_collapsed_consonant_metaphor_seam(&result.name, &roots) {
                    if coverage >= 2 {
                        semantic_seam_lookalikes.insert(result.name.clone());
                    } else {
                        rolling_collapsed_consonant_metaphor_seams += 1;
                        collapsed_consonant_metaphor_examples.insert(result.name.clone());
                    }
                }
                record_overlap_form(&result.name, &overlaps, &mut overlap_examples);
                record_overlap_form(
                    &result.name,
                    &preserved_overlaps,
                    &mut preserved_overlap_examples,
                );
            }
            excluded.extend(results.into_iter().map(|result| result.name));
        }
    }

    println!(
        "audited: {total}/{} names",
        PROMPTS.len() * SEEDS.len() * 10
    );
    println!(
        "collapsed vowel suffixes: {collapsed}/{total} ({:.1}%)",
        collapsed as f64 / total as f64 * 100.0
    );
    println!("composite: {:.2}", composite as f64 / total as f64);
    println!(
        "diversity: {:.3}",
        batch_diversity / (PROMPTS.len() * SEEDS.len()) as f64
    );
    println!(
        "collapsed examples: {}",
        collapsed_examples
            .into_iter()
            .collect::<Vec<_>>()
            .join(", ")
    );
    println!(
        "full vowel suffixes: {full_vowel_suffixes}/{total} ({:.1}%), rolling {rolling_full_vowel_suffixes}/{rolling_total}",
        full_vowel_suffixes as f64 / total as f64 * 100.0
    );
    println!(
        "shape mix: suffix {concept_suffixes}/{total}, multi-concept {multi_concept_joins}/{total}, metaphor {metaphor_forms}/{total}; suffix-heavy pages {suffix_heavy_pages}/{}, suffix-only {suffix_only_pages}/{}",
        PROMPTS.len() * SEEDS.len(),
        PROMPTS.len() * SEEDS.len()
    );
    println!(
        "rolling shape mix: suffix {rolling_concept_suffixes}/{rolling_total}, multi-concept {rolling_multi_concept_joins}/{rolling_total}, metaphor {rolling_metaphor_forms}/{rolling_total}",
    );
    println!(
        "metaphor tails: {} exact forms across {metaphor_pages}/{} pages; repeated-tail pages {repeated_metaphor_tail_pages}/{metaphor_pages}, max same tail {max_metaphor_tail_share}/10",
        metaphor_tail_counts.values().sum::<usize>(),
        PROMPTS.len() * SEEDS.len(),
    );
    println!(
        "metaphor tail histogram: {}",
        tail_histogram(&metaphor_tail_counts)
    );
    println!(
        "metaphor prompt spread: {}",
        tail_histogram(
            &metaphor_tail_prompts
                .iter()
                .map(|(&tail, prompts)| (tail, prompts.len()))
                .collect(),
        )
    );
    println!(
        "rolling metaphor tail histogram: {}",
        tail_histogram(&rolling_metaphor_tail_counts)
    );
    let unused_rolling_metaphor_tails = CONCEPT_METAPHORS
        .iter()
        .filter(|tail| !rolling_metaphor_tail_counts.contains_key(**tail))
        .copied()
        .collect::<Vec<_>>();
    println!(
        "unused rolling metaphor tails: {}",
        unused_rolling_metaphor_tails.join(", ")
    );
    assert!(
        max_metaphor_tail_share <= 3,
        "one metaphor tail occupied {max_metaphor_tail_share}/10 names on a page"
    );
    assert!(
        rolling_metaphor_tail_counts.len() >= CONCEPT_METAPHORS.len() * 9 / 10,
        "rolling sessions exercised only {}/{} metaphor tails",
        rolling_metaphor_tail_counts.len(),
        CONCEPT_METAPHORS.len()
    );
    println!(
        "heavy metaphor-tail pages: {}",
        heavy_metaphor_tail_pages
            .into_iter()
            .collect::<Vec<_>>()
            .join(" | ")
    );
    println!(
        "collapsed consonant metaphor seams: {collapsed_consonant_metaphor_seams}/{total}, rolling {rolling_collapsed_consonant_metaphor_seams}/{rolling_total} ({})",
        collapsed_consonant_metaphor_examples
            .into_iter()
            .collect::<Vec<_>>()
            .join(", ")
    );
    println!(
        "semantic seam lookalikes (not artifacts): {}",
        semantic_seam_lookalikes
            .into_iter()
            .collect::<Vec<_>>()
            .join(", ")
    );
    assert_eq!(
        collapsed_consonant_metaphor_seams, 0,
        "first-page metaphor joins collapsed a consonant seam"
    );
    assert_eq!(
        rolling_collapsed_consonant_metaphor_seams, 0,
        "rolling metaphor joins collapsed a consonant seam"
    );
    println!(
        "full vowel suffix examples: {}",
        full_vowel_suffix_examples
            .into_iter()
            .collect::<Vec<_>>()
            .join(", ")
    );
    println!(
        "overlap examples: {}",
        overlap_examples
            .into_iter()
            .map(|(example, count)| format!("{example} x{count}"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    println!(
        "preserved overlap examples: {}",
        preserved_overlap_examples
            .into_iter()
            .map(|(example, count)| format!("{example} x{count}"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    println!(
        "rolling sessions: {rolling_total}/{} names, {rolling_short} short batches",
        PROMPTS.len() * 100
    );
}
