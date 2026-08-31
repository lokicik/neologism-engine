//! Submorpheme-fusion generator family (Phase 142, WP1): the Vercel formula.
//!
//! Composes one head fragment with one tail fragment into a 2-syllable coined
//! word where EVERY syllable carries a latent association relevant to the
//! brief (ver=verify + cel=excel → Vercel) and the seam is invisible — the
//! output reads as one natural word, never as word+word assembly. Each name
//! carries its decode ("ver = verify · versatile / cel = excel") as provenance.
//!
//! Reachable only through `Config.variant == "submorph"`; own ChaCha stream;
//! enumeration is a pure function of the brief (filters run on the
//! materialized pool), like every Phase-141 family.

use crate::family;
use crate::phonology::{legal_onset, pronounce, pronounce_as_prefix, syllabify, Phoneme};
use crate::seamblend::consonant_skeleton;
use crate::style::Config;
use crate::{exclude::ExcludeSet, keywords, semfield, BigtechStatic, NameResult};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

/// Dedicated ChaCha stream id — disjoint from Auto (0), seamblend
/// (0x5EA6_B1E4) and morpheme (0x0033_0287).
const SUBMORPH_STREAM: u64 = 0x5B40_C0DE;

/// Quality tails allowed to form a third syllable (the Spotify shape).
const TRISYL_TAILS: &[&str] = &["ify", "io", "ia", "eo", "ora", "era"];

const SUBMORPH_TSV: &str = include_str!("../data/submorph.tsv");

#[derive(Debug, Clone)]
struct Fragment {
    letters: String,
    head: bool,
    tail: bool,
    quality: bool,
    canon_weight: f64,
    /// (association word, strength) — non-empty for meaning fragments.
    assocs: Vec<(String, f64)>,
    gloss: String,
}

static INVENTORY: OnceLock<Vec<Fragment>> = OnceLock::new();

fn inventory() -> &'static Vec<Fragment> {
    INVENTORY.get_or_init(|| {
        SUBMORPH_TSV
            .lines()
            .filter(|l| !l.trim().is_empty() && !l.starts_with('#'))
            .filter_map(|line| {
                let cols: Vec<&str> = line.split('\t').collect();
                if cols.len() < 6 {
                    return None;
                }
                let letters = cols[0].trim().to_string();
                if !letters.chars().all(|c| c.is_ascii_lowercase()) {
                    return None;
                }
                let (head, tail) = match cols[1].trim() {
                    "H" => (true, false),
                    "T" => (false, true),
                    "B" => (true, true),
                    _ => return None,
                };
                let quality = cols[2].trim() == "quality";
                let canon_weight: f64 = cols[3].trim().parse().unwrap_or(0.0);
                let assocs: Vec<(String, f64)> = cols[4]
                    .split(',')
                    .filter_map(|p| {
                        let (w, s) = p.split_once(':')?;
                        let s: f64 = s.parse().ok()?;
                        (w != "-" && s > 0.0).then(|| (w.to_string(), s))
                    })
                    .collect();
                Some(Fragment {
                    letters,
                    head,
                    tail,
                    quality,
                    canon_weight,
                    assocs,
                    gloss: cols[5].trim().to_string(),
                })
            })
            .collect()
    })
}

/// Per-name decode: which fragments built the name and why they matched.
#[derive(Debug, Clone, Serialize)]
pub struct SubmorphDecode {
    pub name: String,
    pub head: String,
    pub head_gloss: String,
    pub tail: String,
    pub tail_gloss: String,
    /// Brief-field words the head/tail associations actually hit.
    pub head_hits: Vec<String>,
    pub tail_hits: Vec<String>,
    pub junction: &'static str,
    /// True when the tail is a brand-canon suffix rather than a meaning tail.
    pub tail_quality: bool,
}

/// Light inflection strip so `verify` matches field words `verified`,
/// `verifies`; `deploy` matches `deploys`. Shared with the reason family.
pub(crate) fn norm(w: &str) -> String {
    if let Some(stem) = w.strip_suffix("ies") {
        if stem.len() >= 3 {
            return format!("{stem}y");
        }
    }
    // Multi-letter suffixes need a stem of >=4 so "speed" doesn't become "spe";
    // the plain plural strip is safe at >=3 ("apps" -> "app").
    for suf in ["ing", "ed", "es", "er"] {
        if let Some(stem) = w.strip_suffix(suf) {
            if stem.len() >= 4 {
                return stem.to_string();
            }
        }
    }
    if let Some(stem) = w.strip_suffix('s') {
        if stem.len() >= 3 {
            return stem.to_string();
        }
    }
    w.to_string()
}

/// The brief's weighted semantic field.
fn brief_field(cfg: &Config) -> HashMap<String, f64> {
    let mut field: HashMap<String, f64> = HashMap::new();
    let mut add = |w: &str, s: f64| {
        let k = norm(&w.to_lowercase());
        let e = field.entry(k).or_insert(0.0);
        if s > *e {
            *e = s;
        }
    };
    let mut seeds: Vec<String> = Vec::new();
    if let Some(desc) = cfg.description.as_deref().filter(|d| !d.trim().is_empty()) {
        seeds.extend(keywords::extract_keywords(desc, 6));
    }
    seeds.extend(cfg.roots.iter().map(|r| r.trim().to_lowercase()));
    for kw in &seeds {
        add(kw, 1.0);
        for (rank, nb) in semfield::expand(kw, 12).into_iter().enumerate() {
            add(nb, 0.8 / (1.0 + rank as f64 / 6.0));
        }
    }
    field
}

/// Relevance of a fragment to the brief field: best association hit, with one
/// lazy indirect semfield hop. Returns (score, hit words for the decode).
fn relevance(frag: &Fragment, field: &HashMap<String, f64>) -> (f64, Vec<String>) {
    let mut best = 0.0f64;
    let mut hits: Vec<String> = Vec::new();
    for (a, s) in &frag.assocs {
        let na = norm(a);
        let direct = field.get(&na).copied().unwrap_or(0.0);
        let fw = if direct > 0.0 {
            direct
        } else {
            let indirect = semfield::expand(&na, 8)
                .into_iter()
                .filter_map(|nb| field.get(&norm(nb)).copied())
                .fold(0.0f64, f64::max);
            0.6 * indirect
        };
        let score = s * fw;
        if score > 0.05 {
            hits.push(a.clone());
        }
        if score > best {
            best = score;
        }
    }
    hits.truncate(3);
    (best, hits)
}

/// Are two words in one semantic region? Words absent from the table get the
/// benefit of the doubt so a missing lazy-loaded table changes nothing.
fn words_cohere(a: &str, b: &str) -> bool {
    let (a, b) = (a.to_lowercase(), b.to_lowercase());
    if !semfield::has(&a) || !semfield::has(&b) {
        return true;
    }
    let an = semfield::expand(&a, 25);
    if an.iter().any(|nb| nb.eq_ignore_ascii_case(&b)) {
        return true;
    }
    let bn = semfield::expand(&b, 25);
    if bn.iter().any(|nb| nb.eq_ignore_ascii_case(&a)) {
        return true;
    }
    an.iter()
        .filter(|x| bn.iter().any(|y| x.eq_ignore_ascii_case(y)))
        .count()
        >= 2
}

/// Do a head's and a meaning tail's associations belong to one idea?
///
/// With a brief, the brief itself supplies the common ground: both fragments
/// matched it, so the name coheres. Promptless pages have no brief, and
/// picking the two strongest fragments independently produced decodes that
/// read as nonsense ("sil = silver + moth = behemoth"). Here the fragments
/// must vouch for each other: their top associations have to be semantic
/// neighbors. Unknown words (absent from the table) are given the benefit of
/// the doubt so a missing lazy-loaded table cannot empty the page.
fn associations_cohere(h: &Fragment, t: &Fragment) -> bool {
    match (h.assocs.first(), t.assocs.first()) {
        (Some((ha, _)), Some((ta, _))) => {
            let (ha, ta) = (ha.to_lowercase(), ta.to_lowercase());
            // Two forms of one word is not a coinage, it is a stutter:
            // breezy + breeze reads as Breebreez.
            let shared_prefix = ha
                .chars()
                .zip(ta.chars())
                .take_while(|(a, b)| a == b)
                .count();
            if shared_prefix >= 4 {
                return false;
            }
            words_cohere(&ha, &ta)
        }
        _ => true,
    }
}

/// Junction of head+tail. Returns (fused lowercase, junction kind, expected
/// consonant skeleton) or None when the junction is illegal.
fn fuse(h: &Fragment, t: &Fragment) -> Option<(String, &'static str, Vec<Phoneme>)> {
    // The head sounds as a word PREFIX (final-er/silent-e rules must not fire
    // on it); the tail genuinely is word-final, so plain pronounce is right.
    let ph_h = pronounce_as_prefix(&h.letters)?;
    let ph_t = pronounce(&t.letters)?;
    let h_last_v = ph_h.last()?.is_vowel();
    let t_first_v = ph_t.first()?.is_vowel();
    // V+V hiatus destroys the monosyllabic head — rejected outright.
    if h_last_v && t_first_v {
        return None;
    }
    let mut skel = consonant_skeleton(&ph_h);
    skel.extend(consonant_skeleton(&ph_t));
    // Single-consonant letter overlap (son+nex → sonex): most inevitable seam.
    let hb = h.letters.as_bytes();
    let tb = t.letters.as_bytes();
    if hb.last() == tb.first() && !matches!(hb.last(), Some(b'a' | b'e' | b'i' | b'o' | b'u')) {
        let fused = format!("{}{}", h.letters, &t.letters[1..]);
        let mut skel_overlap = skel.clone();
        // Drop one copy of the shared consonant at the seam.
        let cut = consonant_skeleton(&ph_h).len();
        if cut > 0 {
            skel_overlap.remove(cut - 1);
        }
        return Some((fused, "overlap", skel_overlap));
    }
    Some((format!("{}{}", h.letters, t.letters), "direct", skel))
}

/// True when a fragment carries a "spicy" letter — the rare-consonant zing of
/// Zapier/Kazoo-class names. Wild mode rewards these.
fn spicy(letters: &str) -> bool {
    letters.chars().any(|c| matches!(c, 'z' | 'j' | 'k' | 'w' | 'x'))
}

/// The bouncy A-phrase tail class (along, aglow, adrift…) that builds
/// Tabalong-shaped trisyllables. Wild-only — the default register's
/// seamlessness rules reject these visible words by design.
fn is_bouncy_tail(letters: &str) -> bool {
    letters.len() >= 4 && letters.starts_with('a')
}

/// Structure checks on the fused string, as a reader would sound it.
fn passes_structure(fused: &str, t: &Fragment, expected_skel: &[Phoneme], wild: bool) -> bool {
    let Some(ph) = pronounce(fused) else {
        return false;
    };
    // S4: seam must not create a new reading (Busharbor guard, phoneme level).
    if consonant_skeleton(&ph) != expected_skel {
        return false;
    }
    // No identical adjacent phonemes.
    if ph.windows(2).any(|w| w[0] == w[1]) {
        return false;
    }
    let syls = syllabify(&ph);
    // Wild mode opens the bouncy trisyllabic register (Tabalong class) for any
    // tail; the default register keeps the tight 2-syllable Vercel shape.
    let trisyl_ok = wild || (t.quality && TRISYL_TAILS.contains(&t.letters.as_str()));
    match syls.len() {
        2 => {}
        3 if trisyl_ok => {}
        _ => return false,
    }
    // First-syllable stress proxy: closed syllable or tense nucleus.
    let s0 = &syls[0];
    let tense = matches!(
        ph[s0.nucleus],
        Phoneme::EY
            | Phoneme::IY
            | Phoneme::AY
            | Phoneme::OW
            | Phoneme::UW
            | Phoneme::AW
            | Phoneme::OY
            | Phoneme::ER
    );
    if s0.coda.is_empty() && !tense {
        return false;
    }
    // Medial cluster: coda ≤1 (2 only for s-cluster), onset legal (guaranteed
    // by syllabify's onset maximization), total medial consonants ≤2 (3 for
    // s+stop+liquid onsets).
    let coda_len = s0.coda.len();
    if coda_len > 2 || (coda_len == 2 && ph[s0.coda[0]] != Phoneme::S) {
        return false;
    }
    let onset1: Vec<Phoneme> = syls[1].onset.iter().map(|&i| ph[i]).collect();
    if !legal_onset(&onset1) {
        return false;
    }
    let medial = coda_len + onset1.len();
    if medial > 2 && !(medial == 3 && onset1.len() == 3) {
        return false;
    }
    true
}

/// Anti-Groupane seamlessness: the name must not read as visible assembly.
fn is_seamless(fused: &str, h_used: &str, t_used: &str, seam: usize, common: &HashSet<String>) -> bool {
    // S1: no split anywhere yields two common words.
    for i in 3..=fused.len().saturating_sub(3) {
        if common.contains(&fused[..i]) && common.contains(&fused[i..]) {
            return false;
        }
    }
    // S2: neither fragment's used letters are a visible (≥4-letter) real word.
    if (h_used.len() >= 4 && common.contains(h_used)) || (t_used.len() >= 4 && common.contains(t_used)) {
        return false;
    }
    // S3: seam-aligned word on either side.
    if seam >= 4 && common.contains(&fused[..seam]) {
        return false;
    }
    if fused.len().saturating_sub(seam) >= 4 && common.contains(&fused[seam..]) {
        return false;
    }
    true
}

/// Generate with decodes. Fetches shared statics internally so callers
/// (probe examples, wasm) need no crate-private state.
pub fn generate_submorph_explained(cfg: &Config, seed: u64) -> (Vec<NameResult>, Vec<SubmorphDecode>) {
    let dict = crate::DICT.get_or_init(crate::build_dictionary);
    let st = BigtechStatic::get();
    let exclude = ExcludeSet::new(&cfg.exclude, 2000);
    let field = brief_field(cfg);
    let inv = inventory();

    // Admissible fragments. With no brief (the promptless Auto page) there is
    // no semantic field to match, so fragment QUALITY stands in for relevance:
    // rel = the fragment's strongest association. Vercel itself needs no brief
    // — verify+excel is simply two strong syllables.
    let no_brief = field.is_empty();
    // The Creativity chip's Wild setting (temperature >= 1.0) switches the
    // family into its playful register: bouncy trisyllables, relaxed
    // visible-word rules, and a bonus for spicy letters.
    let wild = cfg.temperature >= 1.0;
    let bar = if wild { 0.45 } else { 0.6 };
    let quality_score = |f: &Fragment| {
        let top = f.assocs.first().map(|(_, s)| *s).unwrap_or(0.0);
        let spice = if wild && spicy(&f.letters) { 0.15 } else { 0.0 };
        if top >= bar {
            (top + spice).min(1.0)
        } else {
            0.0
        }
    };
    let mut heads: Vec<(&Fragment, f64, Vec<String>)> = Vec::new();
    let mut tails: Vec<(&Fragment, f64, Vec<String>)> = Vec::new();
    for f in inv {
        if f.head && !f.quality {
            let (rel, hits) = if no_brief {
                (quality_score(f), Vec::new())
            } else {
                let (mut r, h) = relevance(f, &field);
                if wild && r > 0.05 && spicy(&f.letters) {
                    r = (r + 0.15).min(1.0);
                }
                (r, h)
            };
            if rel > 0.05 {
                heads.push((f, rel, hits));
            }
        }
        if f.tail {
            if f.quality {
                tails.push((f, 0.0, Vec::new()));
            } else {
                let (rel, hits) = if no_brief {
                    (quality_score(f), Vec::new())
                } else {
                    let (mut r, h) = relevance(f, &field);
                    if wild && r > 0.05 && spicy(&f.letters) {
                        r = (r + 0.15).min(1.0);
                    }
                    (r, h)
                };
                if rel > 0.05 {
                    tails.push((f, rel, hits));
                }
            }
        }
    }
    heads.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap().then(a.0.letters.cmp(&b.0.letters)));
    tails.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap().then(a.0.letters.cmp(&b.0.letters)));
    if no_brief {
        // Promptless pages rotate the admission window with the seed so every
        // Generate explores a different neighborhood of the inventory instead
        // of always fusing the same alphabetical-top fragments.
        let rot_h = if heads.is_empty() { 0 } else { (seed as usize) % heads.len() };
        heads.rotate_left(rot_h);
        let quality_split = tails.iter().filter(|(f, _, _)| !f.quality).count();
        if quality_split > 1 {
            let (meaning_tails, _) = tails.split_at_mut(quality_split);
            let rot_t = (seed as usize / 7) % meaning_tails.len();
            meaning_tails.rotate_left(rot_t);
        }
    }
    heads.truncate(40);
    tails.truncate(60);
    if wild {
        // The bouncy A-phrase tails are the wild register's signature; seed
        // rotation must never spin them out of the admission window.
        for f in inv {
            if f.tail
                && !f.quality
                && is_bouncy_tail(&f.letters)
                && !tails.iter().any(|(t, _, _)| t.letters == f.letters)
            {
                let top = f.assocs.first().map(|(_, s)| *s).unwrap_or(0.0);
                if top >= bar {
                    tails.push((f, top, Vec::new()));
                }
            }
        }
    }

    // Enumerate round-robin by head so dedup never biases one head family.
    let mut pool: Vec<(String, f64)> = Vec::new();
    let mut decodes: HashMap<String, SubmorphDecode> = HashMap::new();
    let mut seen: HashSet<String> = HashSet::new();
    for (h, rel_h, h_hits) in &heads {
        for (t, rel_t, t_hits) in &tails {
            if h.letters == t.letters {
                continue;
            }
            // Promptless meaning+meaning pairs must cohere (canon tails carry
            // no meaning to clash with, so they are exempt).
            if no_brief && !t.quality && !associations_cohere(h, t) {
                continue;
            }
            let Some((fused, junction, expected_skel)) = fuse(h, t) else {
                continue;
            };
            if !seen.insert(fused.clone()) {
                continue;
            }
            // The seam sits at the end of the head's letters (overlap keeps
            // one shared copy inside the head's span).
            let seam = h.letters.len().min(fused.len());
            if !passes_structure(&fused, t, &expected_skel, wild) {
                continue;
            }
            // Wild mode keeps only the phoneme-level reparse guard (S4, inside
            // passes_structure): the visible-word rules are exactly what a
            // Tabalong-class pun needs to break. Default mode keeps them all.
            if !wild && !is_seamless(&fused, &h.letters, &t.letters, seam, &st.common_words) {
                continue;
            }
            if !family::passes_name_filters(&fused, cfg, dict, st, &exclude) {
                continue;
            }
            let rel_tail_eff = if t.quality {
                0.35 + 0.25 * t.canon_weight
            } else {
                *rel_t
            };
            let trisyl = t.quality && TRISYL_TAILS.contains(&t.letters.as_str());
            let overlap_bonus = if junction == "overlap" { 0.25 } else { 0.0 };
            // Wild mode does not tax the third syllable — the bounce is the point —
            // and actively rewards the bouncy A-phrase tails (Tabalong class).
            let trisyl_penalty = if trisyl && !wild { 0.35 } else { 0.0 };
            let bounce_bonus = if wild && is_bouncy_tail(&t.letters) { 0.45 } else { 0.0 };
            let bonus =
                (0.45 * rel_h + 0.45 * rel_tail_eff + overlap_bonus + bounce_bonus - trisyl_penalty)
                    .clamp(0.0, 1.4);
            decodes.insert(
                fused.clone(),
                SubmorphDecode {
                    name: crate::capitalize(&fused),
                    head: h.letters.clone(),
                    head_gloss: h.gloss.clone(),
                    tail: t.letters.clone(),
                    tail_gloss: t.gloss.clone(),
                    head_hits: h_hits.clone(),
                    tail_hits: t_hits.clone(),
                    junction,
                    tail_quality: t.quality,
                },
            );
            pool.push((fused, bonus));
        }
    }

    // Rank with the shared pipeline over a double-depth page, then apply the
    // page-shape caps greedily (tail ≤2, final-letter class ≤3, trisyl ≤3,
    // quality-tail ≤4 per 10 — scaled to the requested count).
    let mut wide = cfg.clone();
    wide.count = cfg.count * if wild { 3 } else { 2 };
    // Wild discounts the brand-canon conformity prior — wildness IS deviation
    // from the canon, so the canon must not be allowed to veto it.
    let ll_scale = if wild { 0.35 } else { 1.0 };
    let ranked = family::rank_select_scaled(&pool, &wide, seed, SUBMORPH_STREAM, ll_scale);
    let scale = (cfg.count as f64 / 10.0).max(0.5);
    let cap_tail = ((2.0 * scale).ceil() as usize).max(1);
    let cap_class = ((3.0 * scale).ceil() as usize).max(1);
    let cap_tri = ((3.0 * scale).ceil() as usize).max(1);
    let cap_quality = ((4.0 * scale).ceil() as usize).max(1);
    let cap_head = cap_tail;
    let mut head_n: HashMap<String, usize> = HashMap::new();
    let mut tail_n: HashMap<String, usize> = HashMap::new();
    let mut class_n: HashMap<char, usize> = HashMap::new();
    let mut tri_n = 0usize;
    let mut qual_n = 0usize;
    let mut out: Vec<NameResult> = Vec::new();
    let mut out_decodes: Vec<SubmorphDecode> = Vec::new();
    let mut taken: HashSet<String> = HashSet::new();
    // Wild pages reserve slots for the bouncy Tabalong register up front —
    // otherwise the 2-syllable canon shapes always out-rank them.
    let bounce_quota = if wild { (cfg.count / 3).max(2) } else { 0 };
    for want_bouncy in [true, false] {
        if want_bouncy && bounce_quota == 0 {
            continue;
        }
        for r in &ranked {
            if out.len() >= cfg.count {
                break;
            }
            let lower = r.name.to_lowercase();
            if taken.contains(&lower) {
                continue;
            }
            let Some(d) = decodes.get(&lower) else { continue };
            let bouncy = is_bouncy_tail(&d.tail);
            if want_bouncy {
                let bouncy_taken = out_decodes.iter().filter(|x| is_bouncy_tail(&x.tail)).count();
                if !bouncy || bouncy_taken >= bounce_quota {
                    continue;
                }
            }
            let last = lower.chars().last().unwrap_or('x');
            let trisyl = TRISYL_TAILS.contains(&d.tail.as_str()) && d.tail_quality;
            if head_n.get(&d.head).copied().unwrap_or(0) >= cap_head {
                continue;
            }
            if tail_n.get(&d.tail).copied().unwrap_or(0) >= cap_tail {
                continue;
            }
            if class_n.get(&last).copied().unwrap_or(0) >= cap_class {
                continue;
            }
            if trisyl && tri_n >= cap_tri {
                continue;
            }
            if d.tail_quality && qual_n >= cap_quality {
                continue;
            }
            taken.insert(lower);
            *head_n.entry(d.head.clone()).or_default() += 1;
            *tail_n.entry(d.tail.clone()).or_default() += 1;
            *class_n.entry(last).or_default() += 1;
            if trisyl {
                tri_n += 1;
            }
            if d.tail_quality {
                qual_n += 1;
            }
            out_decodes.push(d.clone());
            out.push(r.clone());
        }
    }
    (out, out_decodes)
}

/// Plain entry used by the lib.rs variant dispatch.
pub fn generate_submorph(cfg: &Config, _dict: &HashSet<String>, seed: u64) -> Vec<NameResult> {
    generate_submorph_explained(cfg, seed).0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::style::Style;

    fn cfg(desc: &str) -> Config {
        Config {
            style: Style::BigTech,
            variant: Some("submorph".to_string()),
            description: Some(desc.to_string()),
            seed: Some(7),
            ..Config::default()
        }
    }

    #[test]
    fn inventory_loads_with_contract() {
        let inv = inventory();
        // Phase 143 curation removed ~100 mined fragments whose gloss was only
        // the word they were chopped out of ("lot" from ocelot). The floor
        // guards the curated inventory, not the mined one.
        assert!(inv.len() >= 190, "only {} fragments", inv.len());
        for f in inv {
            if !f.quality {
                assert!(!f.assocs.is_empty(), "meaning fragment {} has no associations", f.letters);
            }
        }
        // The canonical exemplars must exist.
        assert!(inv.iter().any(|f| f.letters == "ver" && f.head));
        assert!(inv.iter().any(|f| f.letters == "cel" && f.tail));
    }

    #[test]
    fn seamlessness_rejects_visible_assembly() {
        let common = &BigtechStatic::get().common_words;
        // group+pane class: two common words at the seam.
        assert!(!is_seamless("grouppane", "group", "pane", 5, common));
        assert!(!is_seamless("vaultify", "vault", "ify", 5, common));
        // vercel class passes.
        assert!(is_seamless("vercel", "ver", "cel", 3, common));
    }

    #[test]
    fn generates_two_syllable_meaning_dense_names() {
        let (results, decodes) = generate_submorph_explained(&cfg("a tool to verify and sync data fast"), 7);
        assert!(!results.is_empty(), "no submorph names generated");
        assert_eq!(results.len(), decodes.len());
        let st = BigtechStatic::get();
        for (r, d) in results.iter().zip(&decodes) {
            let lower = r.name.to_lowercase();
            assert_eq!(r.name, d.name);
            assert!(!st.common_words.contains(&lower), "real word leaked: {}", r.name);
            let ph = pronounce(&lower).unwrap();
            let n = syllabify(&ph).len();
            assert!(n == 2 || n == 3, "{} has {} syllables", r.name, n);
        }
    }

    #[test]
    fn promptless_pages_render_and_vary_by_seed() {
        let base = Config {
            style: Style::BigTech,
            variant: Some("submorph".to_string()),
            seed: Some(11),
            ..Config::default()
        };
        let (a, da) = generate_submorph_explained(&base, 11);
        assert!(a.len() >= 6, "promptless page too thin: {}", a.len());
        assert_eq!(a.len(), da.len());
        let mut c2 = base.clone();
        c2.seed = Some(12);
        let (b, _) = generate_submorph_explained(&c2, 12);
        let an: Vec<&String> = a.iter().map(|r| &r.name).collect();
        let bn: Vec<&String> = b.iter().map(|r| &r.name).collect();
        assert_ne!(an, bn, "different seeds must explore different fragments");
    }

    #[test]
    fn deterministic_per_seed() {
        let a = generate_submorph_explained(&cfg("secure password storage"), 3).0;
        let b = generate_submorph_explained(&cfg("secure password storage"), 3).0;
        assert_eq!(
            a.iter().map(|r| &r.name).collect::<Vec<_>>(),
            b.iter().map(|r| &r.name).collect::<Vec<_>>()
        );
    }

    #[test]
    fn page_shape_caps_hold() {
        let (results, decodes) = generate_submorph_explained(&cfg("a fast build and deploy tool"), 11);
        let mut tail_counts: HashMap<&str, usize> = HashMap::new();
        for d in &decodes {
            *tail_counts.entry(d.tail.as_str()).or_default() += 1;
        }
        for (tail, n) in tail_counts {
            assert!(n <= 2, "tail -{tail} appears {n}× in a 10-page");
        }
        assert!(results.len() <= 10);
    }
}
