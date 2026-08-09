// Calibration/holdout audit for common non-developer product domains.
// Run: cargo run -p neologism-core --example general_domain_compare --release
use neologism_core::generate;
use neologism_core::keywords::{brand_root_groups, extract_keywords};
use neologism_core::metrics::{composite_score, diversity};
use neologism_core::style::{Config, Style};
use std::collections::HashSet;

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
            "item", "stock", "shelf", "catalog", "crate", "list", "home", "house", "keep",
        ],
        wrong_domain_markers: &[],
    },
    Case {
        label: "customer support",
        calibration: "a customer support helpdesk",
        holdout: "a ticket inbox for customer service agents",
        semantic_markers: &[
            "support", "help", "ticket", "desk", "reply", "inbox", "resolve",
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
        ],
        wrong_domain_markers: &[],
    },
];

const CALIBRATION_SEEDS: &[u64] = &[7, 42, 101, 2024, 9999];
const HOLDOUT_SEEDS: &[u64] = &[13, 67, 313, 4096, 65_537];

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
}

fn rolling_count(prompt: &str, compound: bool, seeds: &[u64]) -> usize {
    let mut excluded = Vec::new();
    let mut total = 0;
    for batch in 0..10 {
        let seed = seeds[batch % seeds.len()]
            .wrapping_add(0x9E37_79B9_7F4A_7C15u64.wrapping_mul(batch as u64 + 1));
        let mut cfg = config(prompt, seed, compound);
        cfg.exclude = excluded.clone();
        let names = generate(&cfg);
        total += names.len();
        excluded.extend(names.into_iter().map(|name| name.name));
    }
    total
}

fn audit(prompt: &str, compound: bool, case: &Case, seeds: &[u64]) -> Audit {
    let mut result = Audit {
        total: 0,
        semantic: 0,
        wrong_domain: 0,
        composite: 0,
        diversity: 0.0,
        unique: HashSet::new(),
        first: Vec::new(),
        rolling_count: rolling_count(prompt, compound, seeds),
    };

    for (index, seed) in seeds.iter().enumerate() {
        let names = generate(&config(prompt, *seed, compound));
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
            result.unique.insert(lower);
        }
    }
    result
}

fn main() {
    const EXPECTED_PER_SPLIT: usize = CASES.len() * 2 * CALIBRATION_SEEDS.len() * 10;
    const EXPECTED_ROLLING_PER_SPLIT: usize = CASES.len() * 2 * 100;
    let mut totals = [[0usize; 4]; 2];

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
            for (label, compound) in [("brandable", false), ("compound", true)] {
                let result = audit(prompt, compound, case, seeds);
                totals[split_index][0] += result.total;
                totals[split_index][1] += result.semantic;
                totals[split_index][2] += result.wrong_domain;
                totals[split_index][3] += result.rolling_count;
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
    }
}
