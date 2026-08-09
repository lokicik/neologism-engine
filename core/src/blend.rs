use crate::phonotactics::{is_vowel, syllable_count};
use rand::Rng;

const TECH_SUFFIXES: &[&str] = &[
    // original 11
    "ly", "ify", "io", "ia", "ware", "hub", "base", "lab", "ai", "hq", "it",
    // Phase 29: 13 additions — all soft-ending (no harsh-cluster penalties from brand_appeal)
    "app", "byte", "core", "edge", "flow", "forge", "hive", "link", "net", "ops", "sync", "wave",
    "works",
];

/// Softer endings for semantic prompt roots. These create coined names rather
/// than generic product labels such as -hub/-app/-net.
const CONCEPT_SUFFIXES: &[&str] = &["ia", "io", "ora", "ix", "ify"];

/// Blend two root words: take a prefix of `a` and a suffix of `b`.
/// Returns None if inputs are too short.
pub fn blend(a: &str, b: &str) -> Option<String> {
    if a.len() < 2 || b.len() < 2 {
        return None;
    }
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();

    // split at the first vowel boundary (after at least 1 char) for each word
    let a_split = first_vowel_boundary(&a_chars)
        .unwrap_or(a_chars.len() / 2)
        .max(1);
    let b_split = last_consonant_onset(&b_chars).unwrap_or(b_chars.len() / 2);

    let prefix: String = a_chars[..a_split].iter().collect();
    let suffix: String = b_chars[b_split..].iter().collect();

    if prefix.is_empty() || suffix.is_empty() {
        return None;
    }
    Some(format!("{}{}", prefix, suffix))
}

/// Blend at a shared seam: if the end of `a` overlaps the start of `b`, merge
/// there (pin + interest → pinterest; span + spanglish-style). Returns None when
/// there is no overlap of length >= 2. Grounded in how real portmanteaus form.
pub fn overlap_blend(a: &str, b: &str) -> Option<String> {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let max_k = a_chars.len().min(b_chars.len());
    // Don't let the overlap swallow an entire word.
    for k in (2..max_k).rev() {
        if a_chars[a_chars.len() - k..] == b_chars[..k] {
            let merged: String = a_chars.iter().chain(b_chars[k..].iter()).collect();
            return Some(merged);
        }
    }
    None
}

/// Join two short semantic roots without cutting away their meaning. Traditional
/// prefix/suffix blending works for long words (pin + interest), but mangles
/// compact morphemes such as lex/mint or nym/forge. Shared seams of two or more
/// letters are still preferred. Otherwise preserve duplicate consonants so
/// both concepts remain visible (pool+link → "poollink"). Two colliding vowels
/// ask the caller for another pair; concatenating aura+ink as "auraink" is no
/// clearer than deleting one into "aurank". The normal phonotactic filter can
/// reject any resulting consonant pile-up.
pub fn semantic_join(a: &str, b: &str) -> Option<String> {
    if a.len() < 2 || b.len() < 2 || a.eq_ignore_ascii_case(b) {
        return None;
    }
    if let Some(overlap) = overlap_blend(a, b) {
        return Some(overlap);
    }

    let a_last = a.chars().last()?;
    let b_first = b.chars().next()?;
    if is_vowel(a_last) && is_vowel(b_first) {
        return None;
    }
    let joined = format!("{a}{b}");
    (joined.len() <= 12).then_some(joined)
}

/// Join an adjective + noun into a CamelCase compound (SwiftForge, BrightLoom).
pub fn compound(adj: &str, noun: &str) -> String {
    fn cap(s: &str) -> String {
        let mut c = s.chars();
        match c.next() {
            Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            None => String::new(),
        }
    }
    format!("{}{}", cap(adj), cap(noun))
}

/// Drop the trailing vowel(s) to get a consonant-ending "tech" form (Flickr-style).
pub fn drop_trailing_vowels(s: &str) -> String {
    let trimmed = s.trim_end_matches(|c| is_vowel(c));
    if trimmed.is_empty() {
        s.to_string()
    } else {
        trimmed.to_string()
    }
}

/// Apply a random tech transform: suffix append or vowel-dropping.
pub fn tech_transform<R: Rng>(rng: &mut R, name: &str, temperature: f64) -> String {
    // at low temperature prefer no transform, at high temperature almost always transform
    let transform_prob = temperature * 0.7;
    if rng.gen::<f64>() > transform_prob {
        return name.to_string();
    }
    // 30% chance drop vowels, 70% chance append suffix
    if rng.gen::<f64>() < 0.3 {
        drop_trailing_vowels(name)
    } else if name.len() >= 9 {
        // Already long — don't bolt on a suffix and create a mashup.
        name.to_string()
    } else {
        let suffix = TECH_SUFFIXES[rng.gen_range(0..TECH_SUFFIXES.len())];
        // avoid double-appending if name already ends with suffix
        if name.ends_with(suffix) {
            name.to_string()
        } else {
            format!("{}{}", name, suffix)
        }
    }
}

/// Append a tech suffix without vowel-dropping. Prompt-derived concept roots
/// need to remain recognizable; Flickr-style truncation turns scope into scop
/// and weakens exactly the semantic signal the concept lexicon added.
pub fn concept_transform<R: Rng>(rng: &mut R, name: &str) -> String {
    if name.len() >= 9 {
        return name.to_string();
    }
    let suffix = CONCEPT_SUFFIXES[rng.gen_range(0..CONCEPT_SUFFIXES.len())];
    if name.ends_with(suffix) {
        name.to_string()
    } else {
        // Avoid a doubled vowel seam (scope + ora -> scopora).
        let mut suffix = suffix.to_string();
        if name.chars().last().is_some_and(is_vowel) && suffix.chars().next().is_some_and(is_vowel)
        {
            suffix.remove(0);
        }
        format!("{}{}", name, suffix)
    }
}

/// All Lyft/Tumblr/Flickr-style respellings of a real word (Phase 36). Exactly
/// ONE transform per word so the source stays recognizable — that's what makes
/// the style work (lyft *reads as* lift). Transforms, each yielding at most one
/// candidate: (a) drop a reducible schwa 'e' that leaves a syllabic sonorant
/// (tumbler→tumblr, flicker→flickr), (b) i→y swap (lift→lyft), (c) -er→-r
/// (flicker→flickr). Phase 50: the old "drop ANY interior vowel" and "collapse a
/// double consonant" transforms were removed — they read as typos rather than
/// stylings (graceful→gracefl, swallow→swalow), the one real quality bug in this
/// mode. Identity and <4-char results are dropped. Public so tests can assert it.
pub fn respell_options(lower: &str) -> Vec<String> {
    let chars: Vec<char> = lower.chars().collect();
    let mut out: Vec<String> = Vec::new();

    // (a) Drop a reducible schwa 'e' that leaves a syllabic sonorant (flicker→
    // flickr, tumbler→tumblr). Restricted to 'e' followed by l/r/m/n so the
    // result reads as an intentional respelling, not a typo (graceful↛gracefl;
    // monolith has no such 'e' → no monolth). Never from the head: require an
    // earlier vowel so the first syllable stays intact (radiance↛rdiance).
    for i in (2..chars.len().saturating_sub(1)).rev() {
        if chars[i] == 'e'
            && !is_vowel(chars[i - 1])
            && matches!(chars[i + 1], 'l' | 'r' | 'm' | 'n')
            && chars[..i].iter().any(|&c| is_vowel(c))
        {
            let mut v = chars.clone();
            v.remove(i);
            out.push(v.iter().collect());
            break;
        }
    }
    // (b) First 'i' becomes 'y'.
    if let Some(i) = chars.iter().position(|&c| c == 'i') {
        let mut v = chars.clone();
        v[i] = 'y';
        out.push(v.iter().collect());
    }
    // (c) Trailing -er loses its vowel.
    if lower.ends_with("er") && chars.len() >= 4 {
        out.push(format!("{}r", &lower[..lower.len() - 2]));
    }

    out.sort();
    out.dedup();
    // BAD_SUBSTRINGS deliberately omits "ass" (class, brass…), but a transform
    // can CREATE that ending (pegasus → pegass) — reject it here at the source.
    out.retain(|o| o != lower && o.len() >= 4 && !o.ends_with("ass"));
    out
}

/// Pick one respelling of `lower` at random, or None when no transform applies.
pub fn respell<R: Rng>(rng: &mut R, lower: &str) -> Option<String> {
    let options = respell_options(lower);
    if options.is_empty() {
        return None;
    }
    Some(options[rng.gen_range(0..options.len())].clone())
}

/// The recognized tech suffix `lower` ends with (longest match wins), or None.
/// Requires the remaining stem to be ≥ 4 chars so short names aren't misparsed
/// (e.g. "kai" → stem "k" would be nonsense). Phase 33: used for stem-level
/// exclusion (exclude.rs) and per-batch suffix caps (mmr_select_capped).
pub fn tech_suffix_of(lower: &str) -> Option<&'static str> {
    // Sorted by descending length so multi-char suffixes (e.g. "works") beat
    // shorter ones (e.g. "ks") if we ever add short entries.
    const SORTED: &[&str] = &[
        "works", "forge", "ware", "wave", "sync", "ops", "net", "link", "hive", "hub", "hq",
        "flow", "edge", "core", "byte", "base", "app", "ai", "lab", "ify", "io", "ia", "ly", "it",
    ];
    for &suf in SORTED {
        if lower.ends_with(suf) && lower.len().saturating_sub(suf.len()) >= 4 {
            return Some(suf);
        }
    }
    None
}

/// Index of first transition from consonant to vowel (≥ 1 char in).
fn first_vowel_boundary(chars: &[char]) -> Option<usize> {
    let mut found_cons = false;
    for (i, &c) in chars.iter().enumerate() {
        if i == 0 {
            continue;
        }
        if !is_vowel(c) {
            found_cons = true;
        }
        if found_cons && is_vowel(c) {
            return Some(i);
        }
    }
    None
}

/// Index of last consonant cluster onset before final syllable.
fn last_consonant_onset(chars: &[char]) -> Option<usize> {
    if syllable_count(&chars.iter().collect::<String>()) < 2 {
        // single-syllable word: just take the last vowel start
        for (i, &c) in chars.iter().enumerate().rev() {
            if is_vowel(c) {
                return Some(i);
            }
        }
        return None;
    }
    // find the last vowel-to-consonant transition
    let mut last = None;
    let mut prev_vowel = false;
    for (i, &c) in chars.iter().enumerate() {
        if prev_vowel && !is_vowel(c) {
            last = Some(i);
        }
        prev_vowel = is_vowel(c);
    }
    last
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blend_pin_interest() {
        let result = blend("pin", "interest");
        assert!(result.is_some());
        let r = result.unwrap();
        assert!(!r.is_empty());
        // should start with "p" at minimum
        assert!(r.starts_with('p'));
    }

    #[test]
    fn blend_micro_soft() {
        let result = blend("micro", "soft");
        assert!(result.is_some());
    }

    #[test]
    fn drop_trailing_vowel() {
        assert_eq!(drop_trailing_vowels("syncro"), "syncr");
        assert_eq!(drop_trailing_vowels("flux"), "flux");
    }

    #[test]
    fn compound_camelcases() {
        assert_eq!(compound("swift", "forge"), "SwiftForge");
        assert_eq!(compound("bright", "loom"), "BrightLoom");
    }

    #[test]
    fn overlap_blend_merges_seam() {
        assert_eq!(
            overlap_blend("pin", "interest"),
            Some("pinterest".to_string())
        );
        assert_eq!(
            overlap_blend("data", "tabase"),
            Some("database".to_string())
        );
        assert_eq!(overlap_blend("smoke", "fog"), None);
    }

    #[test]
    fn semantic_join_preserves_short_roots() {
        assert_eq!(semantic_join("lex", "mint"), Some("lexmint".to_string()));
        assert_eq!(semantic_join("nym", "forge"), Some("nymforge".to_string()));
        assert_eq!(semantic_join("nova", "atlas"), None);
        assert_eq!(semantic_join("pool", "link"), Some("poollink".to_string()));
        assert_eq!(semantic_join("aura", "ink"), None);
        assert_eq!(semantic_join("mint", "mint"), None);
    }

    #[test]
    fn tech_suffix_of_recognized() {
        assert_eq!(tech_suffix_of("keystonify"), Some("ify"));
        assert_eq!(tech_suffix_of("dataforge"), Some("forge"));
        assert_eq!(tech_suffix_of("cloudworks"), Some("works"));
    }

    #[test]
    fn tech_suffix_of_stem_too_short() {
        // stem "k" < 4 chars → None
        assert_eq!(tech_suffix_of("kio"), None);
        // stem "ab" < 4 chars → None
        assert_eq!(tech_suffix_of("abai"), None);
    }

    #[test]
    fn tech_suffix_of_no_suffix() {
        assert_eq!(tech_suffix_of("nova"), None);
        assert_eq!(tech_suffix_of("keron"), None);
    }

    #[test]
    fn respell_classic_patterns() {
        // The canonical brand respellings must be reachable.
        assert!(respell_options("tumbler").contains(&"tumblr".to_string()));
        assert!(respell_options("flicker").contains(&"flickr".to_string()));
        assert!(respell_options("lift").contains(&"lyft".to_string()));
        // Phase 50: summit→sumit (double-consonant collapse) was removed as a
        // typo-style transform; the i→y respelling stands in its place.
        assert!(respell_options("summit").contains(&"summyt".to_string()));
    }

    #[test]
    fn respell_never_identity_or_tiny() {
        for word in ["tumbler", "lift", "ember", "grid", "axis"] {
            for opt in respell_options(word) {
                assert_ne!(opt, word, "identity respell of {word}");
                assert!(opt.len() >= 4, "tiny respell {opt} of {word}");
            }
        }
        // No applicable transform → empty (no vowels to drop/swap, no doubles).
        assert!(respell_options("orb").is_empty());
    }

    #[test]
    fn respell_keeps_head_and_avoids_bad_endings() {
        // Never drop a first-syllable vowel (radiance ↛ rdiance).
        assert!(!respell_options("radiance").contains(&"rdiance".to_string()));
        // Transform-created "-ass" endings are rejected (pegasus ↛ pegass).
        assert!(!respell_options("pegasus").contains(&"pegass".to_string()));
    }

    #[test]
    fn tech_transform_never_lengthens_long_names() {
        use rand::SeedableRng;
        use rand_chacha::ChaCha8Rng;
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        let base = "datacortex"; // 10 chars — already long
        for _ in 0..100 {
            let out = tech_transform(&mut rng, base, 1.0);
            assert!(out.len() <= base.len(), "lengthened to {}", out);
        }
    }

    #[test]
    fn concept_transform_never_drops_the_root() {
        use rand::SeedableRng;
        use rand_chacha::ChaCha8Rng;
        let mut rng = ChaCha8Rng::seed_from_u64(9);
        for _ in 0..50 {
            let name = concept_transform(&mut rng, "scope");
            assert!(name.starts_with("scop"));
            assert!(name.len() >= "scope".len());
        }
    }
}
