// Held-out audit for developer-domain meaning in Brandable and Compound names.
// Run: cargo run -p neologism-core --example dev_domain_compare --release
use neologism_core::generate;
use neologism_core::metrics::{composite_score, diversity};
use neologism_core::style::{Config, Style};

struct Case {
    prompt: &'static str,
    semantic_markers: &'static [&'static str],
}

const CASES: &[Case] = &[
    Case {
        prompt: "a CLI for database migrations",
        semantic_markers: &[
            "schema", "query", "table", "store", "base", "data", "record", "row", "field", "index",
            "shift", "bridge", "relay", "port",
        ],
    },
    Case {
        prompt: "an API rate limiting library",
        semantic_markers: &["gate", "meter", "quota", "pace", "burst"],
    },
    Case {
        prompt: "a terminal log viewer",
        semantic_markers: &[
            "term", "shell", "prompt", "trace", "watch", "scope", "pulse", "beacon",
        ],
    },
    Case {
        prompt: "git release automation",
        semantic_markers: &["commit", "branch", "tag", "forge", "push", "patch"],
    },
    Case {
        prompt: "a local cache inspector",
        semantic_markers: &["cache", "stash", "store", "heap", "buffer"],
    },
    Case {
        prompt: "a browser bookmark manager",
        semantic_markers: &["tab", "pin", "clip", "ribbon", "star"],
    },
    Case {
        prompt: "an API testing toolkit",
        semantic_markers: &["spec", "check", "probe", "assert", "trace"],
    },
    Case {
        prompt: "a cloud deployment dashboard",
        semantic_markers: &["cloud", "dock", "ship", "stack", "grid"],
    },
    Case {
        prompt: "a message queue client",
        semantic_markers: &["queue", "broker", "stream", "topic", "pipe", "bus"],
    },
    Case {
        prompt: "a code formatter and linter",
        semantic_markers: &[
            "format", "lint", "style", "rule", "tidy", "syntax", "indent", "align",
        ],
    },
    Case {
        prompt: "an environment variable manager",
        semantic_markers: &["env", "config", "dot", "secret", "var", "param"],
    },
    Case {
        prompt: "a filesystem search CLI",
        semantic_markers: &["file", "path", "find", "scan", "index", "seek"],
    },
    Case {
        prompt: "a feature flag service",
        semantic_markers: &["flag", "toggle", "switch", "rollout", "gate", "launch"],
    },
    Case {
        prompt: "a background job scheduler",
        semantic_markers: &["job", "tick", "worker", "cron", "schedule", "timer", "run"],
    },
    Case {
        prompt: "dependency update automation",
        semantic_markers: &[
            "dependency",
            "package",
            "version",
            "bump",
            "update",
            "sync",
            "dep",
            "graph",
            "module",
        ],
    },
    Case {
        prompt: "a documentation site generator",
        semantic_markers: &[
            "doc", "guide", "page", "site", "manual", "scribe", "note", "forge", "web", "portal",
            "home",
        ],
    },
];
const SEEDS: &[u64] = &[7, 42, 101, 2024, 9999];

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

fn main() {
    let mut total = 0usize;
    let mut mapped = 0usize;

    for case in CASES {
        println!("\n{}", case.prompt);
        for (label, compound) in [("brandable", false), ("compound", true)] {
            let mut first = Vec::new();
            let mut mode_total = 0usize;
            let mut mode_mapped = 0usize;
            let mut composite = 0u64;
            let mut batch_diversity = 0.0;

            for (index, seed) in SEEDS.iter().enumerate() {
                let results = generate(&config(case.prompt, *seed, compound));
                if index == 0 {
                    first = results.iter().map(|result| result.name.clone()).collect();
                }
                batch_diversity += diversity(&results);
                for result in results {
                    let lower = result.name.to_lowercase();
                    mode_total += 1;
                    mode_mapped += usize::from(
                        case.semantic_markers
                            .iter()
                            .any(|marker| lower.contains(marker)),
                    );
                    composite += composite_score(&result) as u64;
                }
            }

            total += mode_total;
            mapped += mode_mapped;
            println!("  {label:<9}: {}", first.join(", "));
            println!(
                "             {mode_mapped}/{mode_total} semantic  comp {:.1}  div {:.3}",
                composite as f64 / mode_total as f64,
                batch_diversity / SEEDS.len() as f64,
            );
        }
    }

    println!(
        "\nall: {mapped}/{total} names carry a held-out developer-domain marker ({:.1}%)",
        mapped as f64 / total as f64 * 100.0,
    );
}
