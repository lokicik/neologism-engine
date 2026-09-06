//! Opt-in, observational traces. No RNG, scoring or generator decisions change.
//! Records materialized spellings, not failed attempts that never form a name.
use serde::Serialize;
use std::cell::RefCell;
use std::collections::BTreeMap;

type Events = BTreeMap<(String, &'static str, &'static str), usize>;
thread_local! {
    static EVENTS: RefCell<Option<Events>> = const { RefCell::new(None) };
}

#[derive(Debug, Serialize, PartialEq)]
pub struct GeneratorTrace {
    pub name: String,
    pub stage: &'static str,
    pub reason: &'static str,
    pub occurrences: usize,
}

pub(crate) fn record(name: &str, stage: &'static str, reason: &'static str) {
    EVENTS.with(|events| {
        if let Some(events) = events.borrow_mut().as_mut() {
            *events.entry((name.to_lowercase(), stage, reason)).or_default() += 1;
        }
    });
}

pub fn capture<T>(run: impl FnOnce() -> T) -> (T, Vec<GeneratorTrace>) {
    // Restore the previous collector even on panic or a nested diagnostic call.
    struct Restore(Option<Events>);
    impl Drop for Restore {
        fn drop(&mut self) {
            EVENTS.with(|events| *events.borrow_mut() = self.0.take());
        }
    }
    let _restore = Restore(EVENTS.with(|events| events.replace(Some(BTreeMap::new()))));
    let result = run();
    let trace = EVENTS.with(|events| events.borrow_mut().take().unwrap_or_default())
        .into_iter()
        .map(|((name, stage, reason), occurrences)| GeneratorTrace { name, stage, reason, occurrences })
        .collect();
    (result, trace)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::style::{Config, Style};
    #[test]
    fn capture_preserves_pages_and_is_deterministic() {
        for variant in [None, Some("respell"), Some("metaphor"), Some("concept_pair"), Some("reason"), Some("submorph"), Some("seamblend"), Some("morpheme")] {
            let cfg = Config { style: Style::BigTech, description: Some("a note taking app with backlinks".into()), variant: variant.map(str::to_string), seed: Some(67), count: 24, ..Config::default() };
            let plain = crate::generate(&cfg);
            let (traced, first) = capture(|| crate::generate(&cfg));
            let (_, second) = capture(|| crate::generate(&cfg));
            assert_eq!(serde_json::to_string(&plain).unwrap(), serde_json::to_string(&traced).unwrap());
            assert_eq!(first, second);
            assert!(!first.is_empty(), "missing trace: {variant:?}");
        }
    }
    #[test]
    fn nested_capture_and_panic_restore_collector() {
        let (_, outer) = capture(|| {
            record("Alpha", "test", "outer");
            let (_, inner) = capture(|| record("Beta", "test", "inner"));
            assert_eq!(inner.len(), 1);
            let _ = std::panic::catch_unwind(|| capture(|| panic!("probe")));
            record("Alpha", "test", "outer");
        });
        assert_eq!(outer.len(), 1);
        assert_eq!(outer[0].occurrences, 2);
        EVENTS.with(|events| assert!(events.borrow().is_none()));
    }
}
