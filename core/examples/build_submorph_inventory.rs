//! Offline builder for the submorpheme inventory (Phase 142, WP1).
//!
//! Extracts head/tail fragments with real associations from the engine's own
//! wordlists using the phonology layer, mines canon tails from bigtech.txt,
//! applies the "half-hear" gate, and writes:
//!   research/submorph/draft.tsv   — the full surviving inventory (audit trail)
//!   research/submorph/report.txt  — per-rule rejection counts + samples
//! The shipping `core/data/submorph.tsv` is a curated subset of the draft.
//!
//! ```powershell
//! cargo run -p neologism-core --example build_submorph_inventory --release
//! ```

use neologism_core::phonology::{
    best_spanned, legal_onset, lexicon_pronounce, pronounce, syllabify, Phoneme,
};
use std::collections::{BTreeMap, HashSet};
use std::fs;

const DOMAIN_SEEDS: &[&str] = &[
    "verify", "sound", "speed", "build", "data", "secure", "learn", "health", "money", "design",
    "code", "cloud", "deploy", "track", "write", "note", "search", "sync", "link", "share",
    "store", "image", "video", "music", "game", "mail", "chat", "team", "task", "time", "plan",
    "map", "travel", "food", "shop", "pay", "safe", "fast", "light", "smart",
];

/// Tense nuclei — count as "heavy" syllable material for interior-tail mining
/// and for the first-syllable-stress proxy downstream.
fn tense(p: Phoneme) -> bool {
    use Phoneme::*;
    matches!(p, EY | IY | AY | OW | UW | AW | OY | ER)
}

/// Lax-vowel equivalence classes for the half-hear test.
fn vowel_class(p: Phoneme) -> u8 {
    use Phoneme::*;
    match p {
        IH | IY => 1,
        EH | EY => 2,
        AE | AA | AH | AO => 3,
        UW | UH => 4,
        AW => 5,
        AY => 6,
        OW => 7,
        OY => 8,
        ER => 9,
        _ => 0, // consonants: compare directly
    }
}

fn ph_eq(a: Phoneme, b: Phoneme) -> bool {
    if a == b {
        return true;
    }
    let (ca, cb) = (vowel_class(a), vowel_class(b));
    ca != 0 && ca == cb
}

fn is_prefix(frag: &[Phoneme], word: &[Phoneme]) -> bool {
    frag.len() <= word.len() && frag.iter().zip(word).all(|(a, b)| ph_eq(*a, *b))
}

/// Does `frag` occur starting at any syllable boundary of `word`?
fn at_syllable_start(frag: &[Phoneme], word: &[Phoneme]) -> Option<usize> {
    let starts: Vec<usize> = syllabify(word)
        .iter()
        .map(|s| s.onset.first().copied().unwrap_or(s.nucleus))
        .collect();
    for (si, &st) in starts.iter().enumerate() {
        if is_prefix(frag, &word[st..]) {
            return Some(si);
        }
    }
    None
}

fn wordlist(path: &str) -> Vec<String> {
    fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("cannot read {path}: {e}"))
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(str::to_lowercase)
        .collect()
}

#[derive(Clone)]
struct Assoc {
    word: String,
    strength: f64,
}

#[derive(Default, Clone)]
struct FragEntry {
    head: bool,
    tail: bool,
    assocs: Vec<Assoc>,
}

fn main() {
    let common: HashSet<String> = wordlist("core/data/common_words.txt").into_iter().collect();
    let realwords: HashSet<String> = wordlist("core/data/realwords.txt").into_iter().collect();
    let adjectives: HashSet<String> = wordlist("core/data/adjectives.txt").into_iter().collect();

    // morphemes.tsv: forms + gloss/tag words join the source lexicon.
    let mut morpheme_words: HashSet<String> = HashSet::new();
    for line in fs::read_to_string("core/data/morphemes.tsv").unwrap().lines() {
        if line.trim().is_empty() || line.starts_with('#') {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        if cols.len() >= 4 {
            morpheme_words.insert(cols[2].trim().to_string());
            for t in cols[3].split(',') {
                morpheme_words.insert(t.trim().to_string());
            }
        }
    }

    // semfield values of the domain seeds (brand-worthy by construction).
    let mut sem_values: HashSet<String> = HashSet::new();
    for line in fs::read_to_string("core/data/semfield/neighbors.tsv").unwrap().lines() {
        if let Some((key, rest)) = line.split_once('\t') {
            if DOMAIN_SEEDS.contains(&key) {
                for w in rest.split_whitespace() {
                    sem_values.insert(w.to_string());
                }
            }
        }
    }

    // Source lexicon: curated + morpheme glosses + seed neighbors + the seeds.
    let mut source: HashSet<String> = HashSet::new();
    source.extend(realwords.iter().cloned());
    source.extend(adjectives.iter().cloned());
    source.extend(morpheme_words.iter().cloned());
    source.extend(sem_values.iter().cloned());
    source.extend(DOMAIN_SEEDS.iter().map(|s| s.to_string()));
    source.retain(|w| {
        w.len() >= 3 && w.len() <= 12 && w.bytes().all(|b| b.is_ascii_lowercase())
            && lexicon_pronounce(w).is_some()
    });
    eprintln!("source lexicon: {} words", source.len());

    let brandability = |w: &str| -> f64 {
        if realwords.contains(w) || adjectives.contains(w) || sem_values.contains(w) {
            1.0
        } else {
            0.5
        }
    };

    // ---- Step B: mine fragment candidates with their parent words ----------
    let mut frags: BTreeMap<String, FragEntry> = BTreeMap::new();
    let mut register = |letters: &str, head: bool, parent: &str, pos_weight: f64,
                        frags: &mut BTreeMap<String, FragEntry>,
                        brandability: &dyn Fn(&str) -> f64| {
        let letters = letters.to_string();
        if letters.len() < 2 || letters.len() > 5 {
            return;
        }
        // Half-hear test: fragment as a reader would sound it (rule G2P)
        // against the parent's real pronunciation.
        let Some(pf) = pronounce(&letters) else { return };
        let Some(pw) = lexicon_pronounce(parent) else { return };
        let ok = if head {
            is_prefix(&pf, pw)
        } else {
            at_syllable_start(&pf, pw).is_some()
        };
        if !ok {
            return;
        }
        let coverage = pf.len() as f64 / pw.len() as f64;
        let strength = 0.5 * coverage.min(1.0) + 0.3 * pos_weight + 0.2 * brandability(parent);
        let e = frags.entry(letters).or_default();
        if head {
            e.head = true;
        } else {
            e.tail = true;
        }
        e.assocs.push(Assoc { word: parent.to_string(), strength });
    };

    for w in &source {
        let Some(sp) = best_spanned(w) else { continue };
        let ph: Vec<Phoneme> = sp.iter().map(|(p, _)| *p).collect();
        let syls = syllabify(&ph);
        if syls.is_empty() {
            continue;
        }
        let syl_letter_span = |si: usize| -> (usize, usize) {
            let s = &syls[si];
            let first_ph = s.onset.first().copied().unwrap_or(s.nucleus);
            let last_ph = s.coda.last().copied().unwrap_or(s.nucleus);
            (sp[first_ph].1.start, sp[last_ph].1.end)
        };
        // Head: first syllable letters.
        let (_, h_end) = syl_letter_span(0);
        let head_letters = &w[..h_end];
        for v in ortho_variants(head_letters) {
            register(&v, true, w, 1.0, &mut frags, &brandability);
        }
        // Tail: last syllable letters.
        let n = syls.len();
        let (t_start, _) = syl_letter_span(n - 1);
        let tail_letters = &w[t_start..];
        for v in ortho_variants(tail_letters) {
            register(&v, false, w, 0.8, &mut frags, &brandability);
        }
        // Interior heavy syllables as tails.
        for si in 1..n.saturating_sub(1) {
            let s = &syls[si];
            let heavy = !s.coda.is_empty() || tense(ph[s.nucleus]);
            if heavy {
                let (a, b) = syl_letter_span(si);
                for v in ortho_variants(&w[a..b]) {
                    register(&v, false, w, 0.6, &mut frags, &brandability);
                }
            }
        }
    }

    // ---- Step C: keep gate --------------------------------------------------
    let mut kept: Vec<(String, FragEntry)> = Vec::new();
    let mut rej_word = 0usize;
    let mut rej_weak = 0usize;
    let mut rej_onset = 0usize;
    let profane = ["fuck", "shit", "cunt", "dick", "cock", "nigg", "nazi", "ass"];
    for (letters, mut e) in frags {
        if letters.len() >= 4 && common.contains(&letters) {
            rej_word += 1;
            continue; // Vault-/-flow class: visible word fragments die here
        }
        if profane.iter().any(|p| letters.contains(p)) {
            continue;
        }
        // Dedup associations by word, keep strongest, cap 6.
        e.assocs.sort_by(|a, b| b.strength.partial_cmp(&a.strength).unwrap());
        e.assocs.dedup_by(|a, b| a.word == b.word);
        e.assocs.truncate(6);
        let best = e.assocs.first().map(|a| a.strength).unwrap_or(0.0);
        let second = e.assocs.get(1).map(|a| a.strength).unwrap_or(0.0);
        if !(best >= 0.55 || (best >= 0.4 && second >= 0.4)) {
            rej_weak += 1;
            continue;
        }
        if e.head {
            // Heads must start with a legal onset (as pronounced).
            if let Some(pf) = pronounce(&letters) {
                let onset: Vec<Phoneme> = pf.iter().copied().take_while(|p| !p.is_vowel()).collect();
                if !legal_onset(&onset) {
                    rej_onset += 1;
                    e.head = false;
                }
            }
        }
        if e.head || e.tail {
            kept.push((letters, e));
        }
    }

    // ---- Step D: canon tails from bigtech.txt ------------------------------
    let brands = wordlist("core/data/bigtech.txt");
    let mut final_syl: BTreeMap<String, usize> = BTreeMap::new();
    for b in &brands {
        if !b.bytes().all(|c| c.is_ascii_lowercase()) {
            continue;
        }
        let Some(sp) = best_spanned(b) else { continue };
        let ph: Vec<Phoneme> = sp.iter().map(|(p, _)| *p).collect();
        let syls = syllabify(&ph);
        let Some(last) = syls.last() else { continue };
        let first_ph = last.onset.first().copied().unwrap_or(last.nucleus);
        let start = sp[first_ph].1.start;
        let tail = &b[start..];
        if tail.len() >= 2 && tail.len() <= 4 {
            *final_syl.entry(tail.to_string()).or_default() += 1;
        }
    }
    let max_count = final_syl.values().copied().max().unwrap_or(1) as f64;
    let canon: Vec<(String, usize, f64)> = final_syl
        .iter()
        .filter(|(_, &c)| c >= 8)
        .map(|(t, &c)| (t.clone(), c, ((1.0 + c as f64).ln() / (1.0 + max_count).ln())))
        .collect();

    // ---- Write draft + report ----------------------------------------------
    fs::create_dir_all("research/submorph").unwrap();
    let mut tsv = String::from(
        "# Draft submorpheme inventory (build_submorph_inventory). Curate into core/data/submorph.tsv.\n\
         # fragment\tposition\tclass\tcanon_weight\tassociations\tgloss\n",
    );
    let fmt_assocs = |assocs: &[Assoc]| -> (String, String) {
        let a = assocs
            .iter()
            .map(|x| format!("{}:{:.2}", x.word, x.strength))
            .collect::<Vec<_>>()
            .join(",");
        let g = assocs
            .iter()
            .take(2)
            .map(|x| x.word.clone())
            .collect::<Vec<_>>()
            .join(" · ");
        (a, g)
    };
    let mut n_heads = 0usize;
    let mut n_tails = 0usize;
    for (letters, e) in &kept {
        let (a, g) = fmt_assocs(&e.assocs);
        let pos = match (e.head, e.tail) {
            (true, true) => "B",
            (true, false) => "H",
            _ => "T",
        };
        if e.head {
            n_heads += 1;
        }
        if e.tail {
            n_tails += 1;
        }
        tsv.push_str(&format!("{letters}\t{pos}\tmeaning\t0.00\t{a}\t{g}\n"));
    }
    for (t, _c, w) in &canon {
        tsv.push_str(&format!("{t}\tT\tquality\t{w:.2}\t-:0.0\tcanon suffix\n"));
    }
    fs::write("research/submorph/draft.tsv", &tsv).unwrap();

    let report = format!(
        "source words: {}\nfragments kept: {} ({} head-capable, {} tail-capable)\n\
         canon tails (count>=8): {}\nrejected: visible-word {}, weak-assoc {}, illegal-onset(head-demoted) {}\n\
         canon tail list: {}\n",
        source.len(),
        kept.len(),
        n_heads,
        n_tails,
        canon.len(),
        rej_word,
        rej_weak,
        rej_onset,
        canon
            .iter()
            .map(|(t, c, _)| format!("{t}({c})"))
            .collect::<Vec<_>>()
            .join(" ")
    );
    fs::write("research/submorph/report.txt", &report).unwrap();
    eprintln!("{report}");
    println!("wrote research/submorph/draft.tsv ({} rows)", kept.len() + canon.len());
}

/// Orthographic normalization variants of a fragment, each keeping the parent
/// association: identity, silent-e drop (lume→lum), ow→o (flow→flo), doubled
/// consonant collapse.
fn ortho_variants(letters: &str) -> Vec<String> {
    let mut out = vec![letters.to_string()];
    if letters.len() >= 3 && letters.ends_with('e') {
        out.push(letters[..letters.len() - 1].to_string());
    }
    if letters.len() >= 3 && letters.ends_with('w') && letters[..letters.len() - 1].ends_with('o') {
        out.push(letters[..letters.len() - 1].to_string());
    }
    let b = letters.as_bytes();
    for i in 1..b.len() {
        if b[i] == b[i - 1] && !matches!(b[i], b'a' | b'e' | b'i' | b'o' | b'u') {
            let mut v = letters.to_string();
            v.remove(i);
            out.push(v);
            break;
        }
    }
    out.sort();
    out.dedup();
    out
}
