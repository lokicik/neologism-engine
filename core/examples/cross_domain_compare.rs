// Exact Brandable-name collision audit across the engine's broad offline lexicon.
// Run: cargo run -p neologism-core --example cross_domain_compare --release
use neologism_core::generate;
use neologism_core::keywords::{brand_roots, extract_keywords};
use neologism_core::metrics::{composite_score, diversity};
use neologism_core::style::{Config, Style};
use std::collections::{BTreeMap, BTreeSet, HashSet};

struct Case {
    label: &'static str,
    prompt: &'static str,
}

const CASES: &[Case] = &[
    Case {
        label: "recruiting",
        prompt: "a hiring pipeline for recruiting teams",
    },
    Case {
        label: "meals",
        prompt: "a meal planning and recipe app",
    },
    Case {
        label: "inventory",
        prompt: "a home inventory tracker",
    },
    Case {
        label: "customer support",
        prompt: "a ticket inbox for customer service agents",
    },
    Case {
        label: "real estate",
        prompt: "property discovery for home buyers",
    },
    Case {
        label: "events",
        prompt: "conference booking and attendee check-in",
    },
    Case {
        label: "weather",
        prompt: "local rain and temperature alerts",
    },
    Case {
        label: "habits",
        prompt: "routine and streak coaching",
    },
    Case {
        label: "sales CRM",
        prompt: "a CRM for sales teams",
    },
    Case {
        label: "meditation",
        prompt: "a guided breathing and rest companion",
    },
    Case {
        label: "pet care",
        prompt: "animal health reminders for pet owners",
    },
    Case {
        label: "naming",
        prompt: "a naming tool for new products",
    },
    Case {
        label: "security",
        prompt: "a secure password manager",
    },
    Case {
        label: "finance",
        prompt: "a personal budget and expense tracker",
    },
    Case {
        label: "fitness",
        prompt: "a simple workout planner",
    },
    Case {
        label: "writing",
        prompt: "a collaborative document editor",
    },
    Case {
        label: "mood",
        prompt: "a private mood journal",
    },
    Case {
        label: "social",
        prompt: "a community chat app",
    },
    Case {
        label: "expense splitting",
        prompt: "an app for splitting expenses with friends",
    },
    Case {
        label: "analytics",
        prompt: "an analytics dashboard for product metrics",
    },
    Case {
        label: "design",
        prompt: "a color palette and visual design tool",
    },
    Case {
        label: "productivity",
        prompt: "a task and calendar planner",
    },
    Case {
        label: "marketplace",
        prompt: "an online marketplace for local sellers",
    },
    Case {
        label: "vintage keyboards",
        prompt: "a marketplace for vintage keyboards",
    },
    Case {
        label: "travel",
        prompt: "a trip planning and route app",
    },
    Case {
        label: "media",
        prompt: "a photo and video editing app",
    },
    Case {
        label: "education",
        prompt: "an online course and study app",
    },
    Case {
        label: "delivery",
        prompt: "a delivery tracking and logistics app",
    },
    Case {
        label: "AI automation",
        prompt: "an AI assistant for workflow automation",
    },
    Case {
        label: "performance",
        prompt: "a fast performance monitor",
    },
    Case {
        label: "developer naming",
        prompt: "a developer tool that generates names for packages",
    },
    Case {
        label: "database",
        prompt: "a CLI for database migrations",
    },
    Case {
        label: "rate limiting",
        prompt: "an API rate limiting library",
    },
    Case {
        label: "terminal logs",
        prompt: "a terminal log viewer",
    },
    Case {
        label: "git release",
        prompt: "git release automation",
    },
    Case {
        label: "cache",
        prompt: "a local cache inspector",
    },
    Case {
        label: "bookmarks",
        prompt: "a browser bookmark manager",
    },
    Case {
        label: "testing",
        prompt: "an API testing toolkit",
    },
    Case {
        label: "cloud deployment",
        prompt: "a cloud deployment dashboard",
    },
    Case {
        label: "message queue",
        prompt: "a message queue client",
    },
    Case {
        label: "formatter",
        prompt: "a code formatter and linter",
    },
    Case {
        label: "environment",
        prompt: "an environment variable manager",
    },
    Case {
        label: "filesystem",
        prompt: "a filesystem search CLI",
    },
    Case {
        label: "feature flags",
        prompt: "a feature flag service",
    },
    Case {
        label: "background jobs",
        prompt: "a background job scheduler",
    },
    Case {
        label: "dependencies",
        prompt: "dependency update automation",
    },
    Case {
        label: "documentation",
        prompt: "a documentation site generator",
    },
    Case {
        label: "legal research",
        prompt: "legal research for court cases",
    },
];

const SEEDS: &[u64] = &[7, 42, 101, 2024, 9999];
const WEAK_CONTEXT_ROOTS: &[&str] = &["edit", "online", "seller"];
const FOCUS_CASES: &[&str] = &[
    "inventory",
    "finance",
    "sales CRM",
    "marketplace",
    "travel",
    "media",
    "education",
    "rate limiting",
    "git release",
    "bookmarks",
    "cloud deployment",
    "developer naming",
    "background jobs",
    "dependencies",
    "database",
    "formatter",
    "environment",
    "legal research",
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

fn format_shared(entries: &[(String, BTreeSet<&'static str>)]) -> String {
    entries
        .iter()
        .map(|(value, domains)| {
            format!(
                "{value} [{}]",
                domains.iter().copied().collect::<Vec<_>>().join("/")
            )
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn weak_context_root(case: &Case, root: &str) -> bool {
    WEAK_CONTEXT_ROOTS.contains(&root)
        || (case.label == "travel" && matches!(root, "focus" | "flow" | "tempo" | "task" | "plan"))
        || (case.label == "git release"
            && matches!(root, "mind" | "synth" | "agent" | "spark" | "neural"))
        || (case.label == "developer naming"
            && matches!(root, "crate" | "stack" | "byte" | "node" | "kit"))
}

fn main() {
    let mut root_domains: BTreeMap<String, BTreeSet<&'static str>> = BTreeMap::new();
    let mut name_domains: BTreeMap<String, BTreeSet<&'static str>> = BTreeMap::new();
    let mut total = 0usize;
    let mut short_pages = Vec::new();
    let mut weak_root_uses = Vec::new();
    let mut weak_name_forms = BTreeSet::new();
    let mut audit_composite = 0u64;
    let mut audit_diversity = 0.0f64;
    let mut audit_domain_unique = 0.0f64;

    for case in CASES {
        let keywords = extract_keywords(case.prompt, 6);
        let roots = brand_roots(&keywords, 16);
        let case_weak_roots = roots
            .iter()
            .filter(|root| weak_context_root(case, root))
            .cloned()
            .collect::<Vec<_>>();
        let mut case_total = 0usize;
        let mut case_composite = 0u64;
        let mut case_diversity = 0.0f64;
        let mut case_unique = HashSet::new();
        println!("{:<18} {:?}", case.label, roots);
        for root in &case_weak_roots {
            weak_root_uses.push(format!("{}:{root}", case.label));
        }
        for root in &roots {
            root_domains
                .entry(root.clone())
                .or_default()
                .insert(case.label);
        }
        for seed in SEEDS {
            let results = generate(&config(case.prompt, *seed));
            let page_diversity = diversity(&results);
            case_diversity += page_diversity;
            audit_diversity += page_diversity;
            if *seed == SEEDS[0] && FOCUS_CASES.contains(&case.label) {
                println!(
                    "  first             {}",
                    results
                        .iter()
                        .map(|result| result.name.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                );
            }
            if results.len() != 10 {
                short_pages.push(format!(
                    "{} / {seed}: {}/10 [{}]",
                    case.label,
                    results.len(),
                    results
                        .iter()
                        .map(|result| result.name.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                ));
            }
            for result in results {
                total += 1;
                case_total += 1;
                let score = composite_score(&result) as u64;
                case_composite += score;
                audit_composite += score;
                let lower = result.name.to_lowercase();
                case_unique.insert(lower.clone());
                if case_weak_roots
                    .iter()
                    .any(|root| lower.starts_with(root) || lower.ends_with(root))
                {
                    weak_name_forms.insert(format!("{}:{}", case.label, result.name));
                }
                name_domains.entry(lower).or_default().insert(case.label);
            }
        }
        let case_unique_ratio = case_unique.len() as f64 / case_total as f64;
        audit_domain_unique += case_unique_ratio;
        println!(
            "  quality           comp {:.2}, div {:.3}, unique {:.1}%",
            case_composite as f64 / case_total as f64,
            case_diversity / SEEDS.len() as f64,
            case_unique_ratio * 100.0
        );
    }

    let mut shared_roots: Vec<_> = root_domains
        .into_iter()
        .filter(|(_, domains)| domains.len() >= 2)
        .collect();
    shared_roots.sort_by(|a, b| b.1.len().cmp(&a.1.len()).then_with(|| a.0.cmp(&b.0)));

    let mut collisions: Vec<_> = name_domains
        .into_iter()
        .filter(|(_, domains)| domains.len() >= 2)
        .collect();
    collisions.sort_by(|a, b| b.1.len().cmp(&a.1.len()).then_with(|| a.0.cmp(&b.0)));
    let collision_pairs = collisions
        .iter()
        .map(|(_, domains)| domains.len() * (domains.len() - 1) / 2)
        .sum::<usize>();

    println!(
        "\naudited: {total}/{} names",
        CASES.len() * SEEDS.len() * 10
    );
    println!(
        "short pages: {}/{}: {}",
        short_pages.len(),
        CASES.len() * SEEDS.len(),
        short_pages.join(", ")
    );
    println!(
        "weak context roots: {}: {}",
        weak_root_uses.len(),
        weak_root_uses.join(", ")
    );
    println!(
        "weak context name forms: {}: {}",
        weak_name_forms.len(),
        weak_name_forms
            .iter()
            .cloned()
            .collect::<Vec<_>>()
            .join(", ")
    );
    println!(
        "shared semantic roots: {}: {}",
        shared_roots.len(),
        format_shared(&shared_roots)
    );
    println!(
        "cross-domain exact collisions: {} names, {collision_pairs} domain pairs: {}",
        collisions.len(),
        format_shared(&collisions)
    );
    println!(
        "quality summary: comp {:.2}, div {:.3}, domain unique {:.1}%",
        audit_composite as f64 / total as f64,
        audit_diversity / (CASES.len() * SEEDS.len()) as f64,
        audit_domain_unique / CASES.len() as f64 * 100.0
    );
    assert_eq!(
        total,
        CASES.len() * SEEDS.len() * 10,
        "broad domain audit returned short pages"
    );
    assert!(
        short_pages.is_empty(),
        "broad domain audit returned short pages: {}",
        short_pages.join(", ")
    );
    assert!(
        weak_root_uses.is_empty(),
        "context-only roots leaked into Brandable: {}",
        weak_root_uses.join(", ")
    );
    assert!(
        weak_name_forms.is_empty(),
        "context-only names reached Brandable: {}",
        weak_name_forms
            .iter()
            .cloned()
            .collect::<Vec<_>>()
            .join(", ")
    );
    assert!(
        collision_pairs <= 20,
        "cross-domain exact collision pairs regressed: {collision_pairs} > 20"
    );
    assert!(
        audit_composite as f64 / total as f64 >= 80.5,
        "broad-domain composite quality regressed"
    );
    assert!(
        audit_diversity / (CASES.len() * SEEDS.len()) as f64 >= 0.725,
        "broad-domain diversity regressed"
    );
    assert!(
        audit_domain_unique / CASES.len() as f64 >= 0.47,
        "broad-domain uniqueness regressed"
    );
}
