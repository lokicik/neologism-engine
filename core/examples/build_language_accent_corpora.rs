//! Derive the experiment-only language-accent corpora from GeoNames dumps.
//!
//! This builder is intentionally separate from production generation. See
//! `core/data/experimental/accents/README.md` for source, license, hashes, and
//! the exact command used for the checked-in snapshot.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::env;
use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};

const CORPUS_SIZE: usize = 1_000;
const MIN_POPULATION: u64 = 1_000;
const MIN_LENGTH: usize = 4;
const MAX_LENGTH: usize = 10;

#[derive(Default)]
struct AlternateNames {
    preferred: BTreeSet<String>,
    other: BTreeSet<String>,
}

fn ascii_token(value: &str) -> Option<String> {
    let lower = value.to_ascii_lowercase();
    let length = lower.len();
    ((MIN_LENGTH..=MAX_LENGTH).contains(&length)
        && lower.bytes().all(|byte| byte.is_ascii_lowercase()))
    .then_some(lower)
}

fn italian_names(path: &Path) -> Result<HashMap<String, String>, Box<dyn Error>> {
    let mut candidates: HashMap<String, AlternateNames> = HashMap::new();
    for line in fs::read_to_string(path)?.lines() {
        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() < 8 || fields[2] != "it" || fields[6] == "1" || fields[7] == "1" {
            continue;
        }
        let Some(name) = ascii_token(fields[3]) else {
            continue;
        };
        let entry = candidates.entry(fields[1].to_string()).or_default();
        if fields[4] == "1" {
            entry.preferred.insert(name);
        } else {
            entry.other.insert(name);
        }
    }

    // A language label does not resolve culturally distinct regional variants.
    // Keep one unique preferred spelling, or one unambiguous non-preferred
    // spelling. Drop unresolved alternatives instead of choosing arbitrarily.
    Ok(candidates
        .into_iter()
        .filter_map(|(id, names)| {
            let resolved = if names.preferred.len() == 1 {
                names.preferred.into_iter().next()
            } else if names.preferred.is_empty() && names.other.len() == 1 {
                names.other.into_iter().next()
            } else {
                None
            };
            resolved.map(|name| (id, name))
        })
        .collect())
}

fn populated_places(
    path: &Path,
    country_code: &str,
    italian: Option<&HashMap<String, String>>,
) -> Result<Vec<(String, u64)>, Box<dyn Error>> {
    let mut by_name: BTreeMap<String, u64> = BTreeMap::new();
    for line in fs::read_to_string(path)?.lines() {
        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() < 15
            || fields[6] != "P"
            || matches!(fields[7], "PPLH" | "PPLQ" | "PPLW")
            || fields[8] != country_code
        {
            continue;
        }
        let population = fields[14].parse::<u64>().unwrap_or(0);
        if population < MIN_POPULATION {
            continue;
        }
        let name = match italian {
            Some(alternates) => alternates.get(fields[0]).cloned(),
            None => ascii_token(fields[2]),
        };
        let Some(name) = name else {
            continue;
        };
        by_name
            .entry(name)
            .and_modify(|current| *current = (*current).max(population))
            .or_insert(population);
    }

    let mut ranked: Vec<(String, u64)> = by_name.into_iter().collect();
    ranked.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0)));
    ranked.truncate(CORPUS_SIZE);
    Ok(ranked)
}

fn write_corpus(path: &Path, label: &str, names: &[(String, u64)]) -> Result<(), Box<dyn Error>> {
    if names.len() != CORPUS_SIZE {
        return Err(format!(
            "{label} produced {} names; expected {CORPUS_SIZE}",
            names.len()
        )
        .into());
    }
    let mut output =
        format!("# {label}\n# Derived corpus; see README.md for source, license, and filtering.\n");
    for (name, _) in names {
        output.push_str(name);
        output.push('\n');
    }
    fs::write(path, output)?;
    Ok(())
}

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() != 5 {
        return Err(format!(
            "usage: {} <IT.txt> <IT alternate-names.txt> <JP.txt> <output-dir>",
            args.first()
                .map(String::as_str)
                .unwrap_or("build_language_accent_corpora")
        )
        .into());
    }

    let output_dir = PathBuf::from(&args[4]);
    fs::create_dir_all(&output_dir)?;
    let italian_alternates = italian_names(Path::new(&args[2]))?;
    let italian = populated_places(Path::new(&args[1]), "IT", Some(&italian_alternates))?;
    let japanese = populated_places(Path::new(&args[3]), "JP", None)?;

    write_corpus(
        &output_dir.join("italian.txt"),
        "Italian place-name spelling profile",
        &italian,
    )?;
    write_corpus(
        &output_dir.join("japanese-ascii.txt"),
        "GeoNames Japanese plain-ASCII place-name spelling profile",
        &japanese,
    )?;

    println!(
        "Italian: {} names, population floor {}",
        italian.len(),
        italian.last().map(|entry| entry.1).unwrap_or(0)
    );
    println!(
        "Japanese GeoNames ASCII: {} names, population floor {}",
        japanese.len(),
        japanese.last().map(|entry| entry.1).unwrap_or(0)
    );
    Ok(())
}
