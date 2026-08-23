#!/usr/bin/env python3
"""Materialize the frozen Phase 303 Rust probe from the immutable Phase 300 probe."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


BASE_PROBE_SHA256 = "a9dd6f60fa8d28d5b55aa839f351004e37d6a560803f2afaba91128ec4ce02ab"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise ValueError(f"{label}: expected one source match, found {count}")
    return source.replace(old, new, 1)


def transform(source: str) -> str:
    source = replace_once(
        source,
        "//! Frozen Phase 300 ConceptNet-conditioned stochastic whole-form probe.",
        "//! Frozen Phase 303 multiclass-guided ConceptNet rejection sampler probe.",
        "identity",
    )
    source = replace_once(
        source,
        "    quality: usize,\n}",
        "    quality: usize,\n    multiclass: usize,\n}",
        "rejection field",
    )
    source = replace_once(
        source,
        "            quality: 0,\n        }",
        "            quality: 0,\n            multiclass: 0,\n        }",
        "rejection initializer",
    )
    source = replace_once(
        source,
        "    global_logp: f64,\n    semantic_logp: f64,",
        "    global_logp: f64,\n    source_keyword_logp: f64,\n    max_other_keyword_logp: f64,\n    source_margin: f64,\n    semantic_logp: f64,",
        "candidate fields",
    )
    source = replace_once(
        source,
        """    let min_semantic = pool
        .iter()
        .map(|candidate| candidate.semantic_logp)
        .min_by(f64::total_cmp)
        .unwrap();
    let max_semantic = pool
        .iter()
        .map(|candidate| candidate.semantic_logp)
        .max_by(f64::total_cmp)
        .unwrap();""",
        """    let min_margin = pool
        .iter()
        .map(|candidate| candidate.source_margin)
        .min_by(f64::total_cmp)
        .unwrap();
    let max_margin = pool
        .iter()
        .map(|candidate| candidate.source_margin)
        .max_by(f64::total_cmp)
        .unwrap();""",
        "selection range",
    )
    source = replace_once(
        source,
        """            0.65 * candidate.composite as f64 / 100.0
                + 0.20 * normalize(candidate.global_logp, min_global, max_global)
                + 0.15 * normalize(candidate.semantic_logp, min_semantic, max_semantic)""",
        """            0.60 * candidate.composite as f64 / 100.0
                + 0.20 * normalize(candidate.global_logp, min_global, max_global)
                + 0.20 * normalize(candidate.source_margin, min_margin, max_margin)""",
        "selection relevance",
    )
    source = replace_once(
        source,
        """fn generate_page(
    specs: &[BriefSpec],
    brief_index: usize,
    seed: u64,
    global: &CharModel,
    form_floor: f64,
    collision: &CollisionIndex,""",
        """fn generate_page(
    specs: &[BriefSpec],
    brief_index: usize,
    seed: u64,
    global: &CharModel,
    keyword_models: &[(String, CharModel)],
    form_floor: f64,
    collision: &CollisionIndex,""",
        "page signature",
    )
    source = replace_once(
        source,
        """        let semantic_logp = brief_semantic_logp(spec, &lower);
        let wrong_max_logp = wrong_max_logp(specs, brief_index, &lower);
        pool.push(Candidate {
            name: result.name,
            source_group,
            global_logp,
            semantic_logp,""",
        """        let source_keyword = &spec.keywords[source_group];
        let source_keyword_logp = spec.models[source_group].log_likelihood(&lower);
        let max_other_keyword_logp = keyword_models
            .iter()
            .filter(|(keyword, _)| keyword != source_keyword)
            .map(|(_, model)| model.log_likelihood(&lower))
            .max_by(f64::total_cmp)
            .expect("validated competing keyword models");
        let source_margin = source_keyword_logp - max_other_keyword_logp;
        if source_margin <= 0.0 {
            rejections.multiclass += 1;
            continue;
        }
        let semantic_logp = brief_semantic_logp(spec, &lower);
        let wrong_max_logp = wrong_max_logp(specs, brief_index, &lower);
        pool.push(Candidate {
            name: result.name,
            source_group,
            global_logp,
            source_keyword_logp,
            max_other_keyword_logp,
            source_margin,
            semantic_logp,""",
        "online multiclass acceptance",
    )
    source = replace_once(
        source,
        '            origin: "conceptnet_sampler",',
        '            origin: "conceptnet_guided_sampler",',
        "origin",
    )
    source = replace_once(
        source,
        """    global: &CharModel,
    form_floor: f64,
    collision: &CollisionIndex,
    dictionary: &HashSet<String>,
) -> Vec<Page> {""",
        """    global: &CharModel,
    keyword_models: &[(String, CharModel)],
    form_floor: f64,
    collision: &CollisionIndex,
    dictionary: &HashSet<String>,
) -> Vec<Page> {""",
        "build-pages signature",
    )
    source = replace_once(
        source,
        """                specs, index, seed, global, form_floor, collision, dictionary,
            ));""",
        """                specs,
                index,
                seed,
                global,
                keyword_models,
                form_floor,
                collision,
                dictionary,
            ));""",
        "build-pages call",
    )
    source = replace_once(
        source,
        """    gates.insert(
        "all_pools_160".into(),
        pages.iter().all(|page| page.pool.len() == POOL_SIZE),
    );""",
        """    gates.insert(
        "all_pools_160".into(),
        pages.iter().all(|page| page.pool.len() == POOL_SIZE),
    );
    gates.insert(
        "all_source_margins_positive".into(),
        pages
            .iter()
            .flat_map(|page| page.pool.iter())
            .all(|candidate| candidate.source_margin > 0.0),
    );
    gates.insert(
        "attempt_budget_at_most_40000".into(),
        pages.iter().all(|page| page.attempts <= MAX_ATTEMPTS),
    );""",
        "new gates",
    )
    source = replace_once(
        source,
        '        "maximum_overlap": maximum_overlap,',
        '        "maximum_attempts": pages.iter().map(|page| page.attempts).max().unwrap_or(0),\n        "maximum_overlap": maximum_overlap,\n        "mean_attempts": pages.iter().map(|page| page.attempts as f64).sum::<f64>() / pages.len().max(1) as f64,\n        "multiclass_rejections": pages.iter().map(|page| page.rejections.multiclass).sum::<usize>(),',
        "summary capacity",
    )
    source = replace_once(
        source,
        """    if specs.iter().any(|spec| spec.models.is_empty()) {
        return Err("a canonical brief has no semantic root group".into());
    }
    let indices:""",
        """    if specs
        .iter()
        .any(|spec| spec.models.is_empty() || spec.keywords.len() != spec.models.len())
    {
        return Err("a canonical brief has an unmodeled semantic keyword".into());
    }
    let mut keyword_models_by_name: BTreeMap<String, CharModel> = BTreeMap::new();
    for spec in &specs {
        for (keyword, model) in spec.keywords.iter().zip(&spec.models) {
            keyword_models_by_name
                .entry(keyword.clone())
                .or_insert_with(|| model.clone());
        }
    }
    let keyword_models: Vec<(String, CharModel)> =
        keyword_models_by_name.into_iter().collect();
    if keyword_models.len() != 111 {
        return Err(format!(
            "expected 111 modeled canonical keywords, got {}",
            keyword_models.len()
        )
        .into());
    }
    let indices:""",
        "all-keyword model inventory",
    )
    source = replace_once(
        source,
        """        &global,
        form_floor,
        &collision,
        &dictionary,
    );
    let replay_pages = build_pages(
        &specs,
        &indices,
        &global,
        form_floor,""",
        """        &global,
        &keyword_models,
        form_floor,
        &collision,
        &dictionary,
    );
    let replay_pages = build_pages(
        &specs,
        &indices,
        &global,
        &keyword_models,
        form_floor,""",
        "main build calls",
    )
    source = replace_once(
        source,
        '        schema: "neologism-conceptnet-sampler-report-v1",',
        '        schema: "neologism-conceptnet-guided-sampler-report-v1",',
        "report schema",
    )
    return source


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if sha256(args.source) != BASE_PROBE_SHA256:
        raise SystemExit("Phase 300 probe SHA-256 mismatch")
    materialized = transform(args.source.read_text(encoding="utf-8"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(materialized, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        print(f"phase303 materialization: {error}")
        raise SystemExit(1)
