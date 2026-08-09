// Audit weak descriptive words that can be mistaken for standalone naming concepts.
// Run: cargo run -p neologism-core --example modifier_order_compare --release
use neologism_core::generate;
use neologism_core::keywords::{brand_root_groups, extract_keywords};
use neologism_core::style::{Config, Style};
use std::collections::BTreeSet;

struct Case {
    prompt: &'static str,
    weak_words: &'static [&'static str],
    semantic_markers: &'static [&'static str],
}

const CASES: &[Case] = &[
    Case {
        prompt: "a local cache inspector",
        weak_words: &["local"],
        semantic_markers: &["cache", "stash", "store", "heap", "buffer"],
    },
    Case {
        prompt: "a guided breathing and rest companion",
        weak_words: &["guided", "companion"],
        semantic_markers: &["calm", "breath", "still", "rest", "dream", "pause"],
    },
    Case {
        prompt: "a simple workout planner",
        weak_words: &["simple"],
        semantic_markers: &["pulse", "vital", "thrive", "fit", "care"],
    },
    Case {
        prompt: "a personal finance tracker",
        weak_words: &["personal", "tracker"],
        semantic_markers: &["ledger", "tally", "mint", "vault", "fund"],
    },
    Case {
        prompt: "a collaborative document editor",
        weak_words: &["collaborative"],
        semantic_markers: &["ink", "quill", "draft", "scribe", "note"],
    },
    Case {
        prompt: "an instant API performance monitor",
        weak_words: &["instant"],
        semantic_markers: &[
            "swift", "dash", "bolt", "flux", "surge", "crate", "stack", "byte", "node", "kit",
            "trace", "watch", "scope", "pulse", "beacon",
        ],
    },
    Case {
        prompt: "a shared family calendar",
        weak_words: &["shared"],
        semantic_markers: &["focus", "flow", "tempo", "task", "plan"],
    },
    Case {
        prompt: "automatic invoice reminders",
        weak_words: &["automatic", "reminder"],
        semantic_markers: &["ledger", "tally", "mint", "vault", "fund"],
    },
    Case {
        prompt: "a modern photo editor",
        weak_words: &["modern"],
        semantic_markers: &[
            "frame", "reel", "wave", "tune", "echo", "ink", "quill", "draft", "scribe", "note",
        ],
    },
    Case {
        prompt: "a lightweight terminal log viewer",
        weak_words: &["lightweight"],
        semantic_markers: &["term", "shell", "prompt", "trace", "scope", "pulse"],
    },
    Case {
        prompt: "a remote hiring dashboard",
        weak_words: &["remote"],
        semantic_markers: &["talent", "role", "hire", "scout", "match", "crew"],
    },
];

const SEEDS: &[u64] = &[7, 42, 101, 2024, 9999];

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

fn main() {
    let mut all_total = 0usize;
    let mut all_semantic = 0usize;
    let mut all_weak = 0usize;
    let mut all_tail = 0usize;
    let mut rolling_total = 0usize;
    let mut rolling_weak = 0usize;

    for case in CASES {
        let keywords = extract_keywords(case.prompt, 6);
        let groups = brand_root_groups(&keywords, 16);
        let mut total = 0usize;
        let mut semantic = 0usize;
        let mut weak = 0usize;
        let mut tail = 0usize;
        let mut first = Vec::new();
        let mut weak_examples = BTreeSet::new();
        let mut case_rolling_total = 0usize;
        let mut case_rolling_weak = 0usize;
        let mut short_batches = 0usize;
        let mut rolling_weak_examples = BTreeSet::new();

        for (index, seed) in SEEDS.iter().enumerate() {
            let results = generate(&config(case.prompt, *seed));
            if index == 0 {
                first = results.iter().map(|result| result.name.clone()).collect();
            }
            for result in results {
                let lower = result.name.to_lowercase();
                total += 1;
                semantic += usize::from(
                    case.semantic_markers
                        .iter()
                        .any(|marker| lower.contains(marker)),
                );
                let has_weak = case
                    .weak_words
                    .iter()
                    .any(|word| lower.starts_with(word) || lower.ends_with(word));
                let has_tail = case.weak_words.iter().any(|word| lower.ends_with(word));
                weak += usize::from(has_weak);
                tail += usize::from(has_tail);
                if has_weak {
                    weak_examples.insert(result.name);
                }
            }
        }

        let mut excluded = Vec::new();
        for batch in 0..10u64 {
            let mut cfg = config(
                case.prompt,
                0xA076_1D64_78BD_642Fu64.wrapping_mul(batch + 1),
            );
            cfg.exclude = excluded.clone();
            let results = generate(&cfg);
            short_batches += usize::from(results.len() < cfg.count);
            case_rolling_total += results.len();
            rolling_total += results.len();
            for result in &results {
                let lower = result.name.to_lowercase();
                let has_weak = usize::from(
                    case.weak_words
                        .iter()
                        .any(|word| lower.starts_with(word) || lower.ends_with(word)),
                );
                case_rolling_weak += has_weak;
                rolling_weak += has_weak;
                if has_weak > 0 {
                    rolling_weak_examples.insert(result.name.clone());
                }
            }
            excluded.extend(results.into_iter().map(|result| result.name));
        }

        all_total += total;
        all_semantic += semantic;
        all_weak += weak;
        all_tail += tail;
        println!("\n{}", case.prompt);
        println!("  keywords {keywords:?}");
        println!("  groups   {groups:?}");
        println!("  names    {}", first.join(", "));
        println!(
            "  semantic {semantic}/{total}, weak forms {weak}/{total}, weak tails {tail}/{total}: {}",
            weak_examples.into_iter().collect::<Vec<_>>().join(", "),
        );
        println!(
            "  rolling  {case_rolling_total}/100, weak {case_rolling_weak}/{case_rolling_total}, short batches {short_batches}/10: {}",
            rolling_weak_examples.into_iter().collect::<Vec<_>>().join(", "),
        );
    }

    let expected = CASES.len() * SEEDS.len() * 10;
    let expected_rolling = CASES.len() * 100;
    println!(
        "\nall: generated {all_total}/{}, semantic {all_semantic}/{all_total}, weak forms {all_weak}/{all_total}, weak tails {all_tail}/{all_total}, rolling {rolling_total}/{}, rolling weak {rolling_weak}/{rolling_total}",
        expected,
        expected_rolling,
    );
    assert_eq!(
        all_total, expected,
        "descriptor first-page capacity regressed"
    );
    assert_eq!(all_semantic, all_total, "descriptor semantics regressed");
    assert_eq!(all_weak, 0, "weak descriptor forms resurfaced");
    assert_eq!(all_tail, 0, "misordered descriptor tails resurfaced");
    assert_eq!(
        rolling_total, expected_rolling,
        "descriptor rolling capacity regressed"
    );
    assert_eq!(rolling_weak, 0, "weak rolling forms resurfaced");
}
