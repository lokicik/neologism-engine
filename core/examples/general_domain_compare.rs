// Calibration/holdout audit for common non-developer product domains.
// Run: cargo run -p neologism-core --example general_domain_compare --release [metaphor-share] [concept-suffix-bonus]
use neologism_core::keywords::{brand_root_groups, extract_keywords};
use neologism_core::metrics::{composite_score, diversity};
use neologism_core::style::{Config, Style};
use neologism_core::{generate_with_tuning, BigTechTuning};
use std::collections::{BTreeMap, BTreeSet, HashSet};

struct Case {
    label: &'static str,
    calibration: &'static str,
    holdout: &'static str,
    semantic_markers: &'static [&'static str],
    wrong_domain_markers: &'static [&'static str],
}

const CASES: &[Case] = &[
    Case {
        label: "recruiting",
        calibration: "a hiring pipeline for recruiting teams",
        holdout: "candidate tracking software for recruiters",
        semantic_markers: &["hire", "talent", "candidate", "role", "scout", "match"],
        wrong_domain_markers: &[],
    },
    Case {
        label: "meals",
        calibration: "a meal planning and recipe app",
        holdout: "a weekly menu and grocery organizer",
        semantic_markers: &[
            "meal", "recipe", "dish", "plate", "pantry", "menu", "cook", "kitchen", "grocery",
            "basket",
        ],
        wrong_domain_markers: &[],
    },
    Case {
        label: "inventory",
        calibration: "a home inventory tracker",
        holdout: "a catalog for household belongings",
        semantic_markers: &[
            "item", "stock", "count", "catalog", "asset", "list", "home", "house", "keep",
        ],
        wrong_domain_markers: &[],
    },
    Case {
        label: "customer support",
        calibration: "a customer support helpdesk",
        holdout: "a ticket inbox for customer service agents",
        semantic_markers: &[
            "support", "help", "ticket", "desk", "reply", "inbox", "resolve", "assist", "answer",
        ],
        wrong_domain_markers: &["mind", "synth", "neural"],
    },
    Case {
        label: "real estate",
        calibration: "a real estate listing marketplace",
        holdout: "property discovery for home buyers",
        semantic_markers: &[
            "home", "house", "key", "door", "nest", "roof", "place", "estate", "property",
            "listing",
        ],
        wrong_domain_markers: &[
            "source", "proof", "index", "trace", "lens", "scope", "file", "path", "find", "scan",
            "seek",
        ],
    },
    Case {
        label: "events",
        calibration: "an event ticketing platform",
        holdout: "conference booking and attendee check-in",
        semantic_markers: &[
            "event", "ticket", "stage", "venue", "guest", "pass", "crowd", "gather", "seat",
        ],
        wrong_domain_markers: &["queue", "broker", "stream", "topic", "pipe", "bus"],
    },
    Case {
        label: "weather",
        calibration: "a weather forecast app",
        holdout: "local rain and temperature alerts",
        semantic_markers: &[
            "sky", "cloud", "rain", "storm", "breeze", "sun", "forecast", "temp", "climate", "wind",
        ],
        wrong_domain_markers: &["dock", "ship", "stack", "grid"],
    },
    Case {
        label: "habits",
        calibration: "a daily habit tracker",
        holdout: "routine and streak coaching",
        semantic_markers: &[
            "habit", "routine", "streak", "ritual", "daily", "repeat", "rhythm", "track",
        ],
        wrong_domain_markers: &[],
    },
    Case {
        label: "sales CRM",
        calibration: "a CRM for sales teams",
        holdout: "a customer relationship pipeline for sales representatives",
        semantic_markers: &[
            "lead", "deal", "client", "contact", "pipeline", "sale", "growth", "close",
        ],
        wrong_domain_markers: &[],
    },
    Case {
        label: "meditation",
        calibration: "a meditation and sleep app",
        holdout: "a guided breathing and rest companion",
        semantic_markers: &[
            "calm", "breath", "still", "rest", "dream", "sleep", "quiet", "zen", "pause",
        ],
        wrong_domain_markers: &[],
    },
    Case {
        label: "pet care",
        calibration: "a pet care appointment app",
        holdout: "animal health reminders for pet owners",
        semantic_markers: &[
            "pet",
            "paw",
            "tail",
            "care",
            "vital",
            "animal",
            "vet",
            "companion",
            "buddy",
        ],
        wrong_domain_markers: &[],
    },
];

const CALIBRATION_SEEDS: &[u64] = &[7, 42, 101, 2024, 9999];
const HOLDOUT_SEEDS: &[u64] = &[13, 67, 313, 4096, 65_537];
const CONCEPT_SUFFIXES: &[&str] = &["ia", "io", "ora", "ix", "ify"];

fn config(prompt: &str, seed: u64, compound: bool) -> Config {
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
        compound,
        starts_with: None,
        contains: None,
        exclude: vec![],
    }
}

struct Audit {
    total: usize,
    semantic: usize,
    wrong_domain: usize,
    composite: u64,
    diversity: f64,
    unique: HashSet<String>,
    first: Vec<String>,
    rolling_count: usize,
    concept_suffixes: usize,
    metaphor_forms: usize,
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

fn has_concept_suffix(name: &str, groups: &[Vec<String>]) -> bool {
    let lower = name.to_lowercase();
    groups.iter().flatten().any(|root| {
        CONCEPT_SUFFIXES
            .iter()
            .any(|suffix| lower == format!("{root}{suffix}"))
    })
}

fn rolling_count(prompt: &str, compound: bool, seeds: &[u64], tuning: &BigTechTuning) -> usize {
    let mut excluded = Vec::new();
    let mut total = 0;
    for batch in 0..10 {
        let seed = seeds[batch % seeds.len()]
            .wrapping_add(0x9E37_79B9_7F4A_7C15u64.wrapping_mul(batch as u64 + 1));
        let mut cfg = config(prompt, seed, compound);
        cfg.exclude = excluded.clone();
        let names = generate_with_tuning(&cfg, tuning);
        total += names.len();
        excluded.extend(names.into_iter().map(|name| name.name));
    }
    total
}

fn audit(
    prompt: &str,
    compound: bool,
    case: &Case,
    seeds: &[u64],
    tuning: &BigTechTuning,
) -> Audit {
    let groups = brand_root_groups(&extract_keywords(prompt, 6), 16);
    let mut result = Audit {
        total: 0,
        semantic: 0,
        wrong_domain: 0,
        composite: 0,
        diversity: 0.0,
        unique: HashSet::new(),
        first: Vec::new(),
        rolling_count: rolling_count(prompt, compound, seeds, tuning),
        concept_suffixes: 0,
        metaphor_forms: 0,
    };

    for (index, seed) in seeds.iter().enumerate() {
        let names = generate_with_tuning(&config(prompt, *seed, compound), tuning);
        if index == 0 {
            result.first = names.iter().map(|name| name.name.clone()).collect();
        }
        result.diversity += diversity(&names);
        for name in names {
            let lower = name.name.to_lowercase();
            result.total += 1;
            result.semantic += usize::from(
                case.semantic_markers
                    .iter()
                    .any(|marker| lower.contains(marker)),
            );
            result.wrong_domain += usize::from(
                case.wrong_domain_markers
                    .iter()
                    .any(|marker| lower.contains(marker)),
            );
            result.composite += composite_score(&name) as u64;
            if !compound {
                if has_concept_suffix(&name.name, &groups) {
                    result.concept_suffixes += 1;
                } else if concept_coverage(&name.name, &groups) < 2 {
                    result.metaphor_forms += 1;
                }
            }
            result.unique.insert(lower);
        }
    }
    result
}

fn main() {
    const EXPECTED_PER_SPLIT: usize = CASES.len() * 2 * CALIBRATION_SEEDS.len() * 10;
    const EXPECTED_ROLLING_PER_SPLIT: usize = CASES.len() * 2 * 100;
    let mut totals = [[0usize; 4]; 2];
    let mut shape_totals = [[0usize; 3]; 2];
    let mut composite_totals = [[0u64; 2]; 2];
    let mut diversity_totals = [[0.0f64; 2]; 2];
    let mut batch_totals = [[0usize; 2]; 2];
    let mut name_domains: BTreeMap<String, BTreeSet<&'static str>> = BTreeMap::new();
    let mut tuning = BigTechTuning::from_variety(0.3);
    if let Some(value) = std::env::args().nth(1) {
        tuning.single_concept_metaphor_w = value
            .parse::<f64>()
            .expect("metaphor share must be a number");
    }
    if let Some(value) = std::env::args().nth(2) {
        tuning.concept_suffix_w = value.parse::<f64>().expect("suffix bonus must be a number");
    }
    println!(
        "single-concept metaphor candidate share: {:.0}%, multi-concept suffix rank bonus: {:.2}",
        tuning.single_concept_metaphor_w * 100.0,
        tuning.concept_suffix_w,
    );

    for case in CASES {
        println!("\n{}", case.label);
        for (split_index, (split, prompt)) in
            [("calibration", case.calibration), ("holdout", case.holdout)]
                .into_iter()
                .enumerate()
        {
            let seeds = if split_index == 0 {
                CALIBRATION_SEEDS
            } else {
                HOLDOUT_SEEDS
            };
            let keywords = extract_keywords(prompt, 6);
            println!("  {split:<11}: {prompt}");
            println!(
                "               roots {:?}",
                brand_root_groups(&keywords, 16)
            );
            for (mode_index, (label, compound)) in [("brandable", false), ("compound", true)]
                .into_iter()
                .enumerate()
            {
                let result = audit(prompt, compound, case, seeds, &tuning);
                if !compound {
                    for name in &result.unique {
                        name_domains
                            .entry(name.clone())
                            .or_default()
                            .insert(case.label);
                    }
                }
                totals[split_index][0] += result.total;
                totals[split_index][1] += result.semantic;
                totals[split_index][2] += result.wrong_domain;
                totals[split_index][3] += result.rolling_count;
                composite_totals[split_index][mode_index] += result.composite;
                diversity_totals[split_index][mode_index] += result.diversity;
                batch_totals[split_index][mode_index] += seeds.len();
                println!("               {label:<9} {}", result.first.join(", "));
                println!(
                    "                         {}/{} semantic  {}/{} wrong-domain  comp {:.1}  div {:.3}  unique {:.1}%  long {}/100",
                    result.semantic,
                    result.total,
                    result.wrong_domain,
                    result.total,
                    result.composite as f64 / result.total as f64,
                    result.diversity / seeds.len() as f64,
                    result.unique.len() as f64 / result.total as f64 * 100.0,
                    result.rolling_count,
                );
                if !compound {
                    shape_totals[split_index][0] += result.concept_suffixes;
                    shape_totals[split_index][1] += result.metaphor_forms;
                    shape_totals[split_index][2] += result.total;
                    println!(
                        "                         shape suffix {}  metaphor {}  multi/other {}",
                        result.concept_suffixes,
                        result.metaphor_forms,
                        result.total - result.concept_suffixes - result.metaphor_forms,
                    );
                }
            }
        }
    }

    for (index, split) in ["calibration", "holdout"].into_iter().enumerate() {
        println!(
            "\n{split}: {}/{} generated, {}/{} semantic ({:.1}%), {}/{} wrong-domain ({:.1}%), {}/{} rolling",
            totals[index][0],
            EXPECTED_PER_SPLIT,
            totals[index][1],
            totals[index][0],
            totals[index][1] as f64 / totals[index][0] as f64 * 100.0,
            totals[index][2],
            totals[index][0],
            totals[index][2] as f64 / totals[index][0] as f64 * 100.0,
            totals[index][3],
            EXPECTED_ROLLING_PER_SPLIT,
        );
        println!(
            "{split} Brandable shape: suffix {}, metaphor {}, multi/other {}",
            shape_totals[index][0],
            shape_totals[index][1],
            shape_totals[index][2] - shape_totals[index][0] - shape_totals[index][1],
        );
        for (mode_index, mode) in ["Brandable", "Compound"].into_iter().enumerate() {
            println!(
                "{split} {mode} quality: comp {:.2}, div {:.3}",
                composite_totals[index][mode_index] as f64
                    / (batch_totals[index][mode_index] * 10) as f64,
                diversity_totals[index][mode_index] / batch_totals[index][mode_index] as f64,
            );
        }
    }

    let mut collisions: Vec<_> = name_domains
        .into_iter()
        .filter(|(_, domains)| domains.len() >= 2)
        .collect();
    collisions.sort_by(|a, b| b.1.len().cmp(&a.1.len()).then_with(|| a.0.cmp(&b.0)));
    let collision_summary = collisions
        .iter()
        .map(|(name, domains)| {
            format!(
                "{name} [{}]",
                domains.iter().copied().collect::<Vec<_>>().join("/")
            )
        })
        .collect::<Vec<_>>()
        .join(", ");
    println!(
        "cross-domain exact collisions: {} names: {}",
        collisions.len(),
        collision_summary,
    );
    assert!(
        collisions.is_empty(),
        "Brandable names leaked across audited domains: {collision_summary}"
    );
}
