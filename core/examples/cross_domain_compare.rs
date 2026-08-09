// Exact Brandable-name collision audit across the engine's broad offline lexicon.
// Run: cargo run -p neologism-core --example cross_domain_compare --release
use neologism_core::generate;
use neologism_core::keywords::{brand_roots, extract_keywords};
use neologism_core::style::{Config, Style};
use std::collections::{BTreeMap, BTreeSet};

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
const FOCUS_CASES: &[&str] = &["marketplace", "travel", "media", "git release"];

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
}

fn main() {
    let mut root_domains: BTreeMap<String, BTreeSet<&'static str>> = BTreeMap::new();
    let mut name_domains: BTreeMap<String, BTreeSet<&'static str>> = BTreeMap::new();
    let mut total = 0usize;
    let mut short_pages = Vec::new();
    let mut weak_root_uses = Vec::new();
    let mut weak_name_forms = BTreeSet::new();

    for case in CASES {
        let keywords = extract_keywords(case.prompt, 6);
        let roots = brand_roots(&keywords, 16);
        let case_weak_roots = roots
            .iter()
            .filter(|root| weak_context_root(case, root))
            .cloned()
            .collect::<Vec<_>>();
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
                let lower = result.name.to_lowercase();
                if case_weak_roots
                    .iter()
                    .any(|root| lower.starts_with(root) || lower.ends_with(root))
                {
                    weak_name_forms.insert(format!("{}:{}", case.label, result.name));
                }
                name_domains.entry(lower).or_default().insert(case.label);
            }
        }
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
        "cross-domain exact collisions: {}: {}",
        collisions.len(),
        format_shared(&collisions)
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
}
