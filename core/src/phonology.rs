//! Pronunciation layer for the seam-blend generator family (Phase 141).
//!
//! Everything here operates on phonemes (ARPAbet, stress-free), not letters —
//! deliberately independent of `phonotactics.rs`, which is letter-based and
//! frozen. The rule G2P returns each phoneme with the letter span that produced
//! it, so callers can map phoneme-level decisions (syllable boundaries, seam
//! overlaps) back onto spellings. Rules approximate English orthography well
//! enough for the short root/adjective vocabulary the blender draws from; a
//! CMUdict-subset lexicon refines real-word pronunciations where available.

use std::ops::Range;

/// The 39 stress-free ARPAbet phonemes (CMUdict inventory).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[rustfmt::skip]
pub enum Phoneme {
    AA, AE, AH, AO, AW, AY, EH, ER, EY, IH, IY, OW, OY, UH, UW, // vowels
    B, CH, D, DH, F, G, HH, JH, K, L, M, N, NG, P, R, S, SH, T, TH, V, W, Y, Z, ZH,
}

use Phoneme::*;

impl Phoneme {
    /// Parse one ARPAbet symbol, ignoring a trailing stress digit ("AH0" → AH).
    pub fn from_arpabet(sym: &str) -> Option<Self> {
        let sym = sym.trim_end_matches(|c: char| c.is_ascii_digit());
        Some(match sym {
            "AA" => AA, "AE" => AE, "AH" => AH, "AO" => AO, "AW" => AW,
            "AY" => AY, "EH" => EH, "ER" => ER, "EY" => EY, "IH" => IH,
            "IY" => IY, "OW" => OW, "OY" => OY, "UH" => UH, "UW" => UW,
            "B" => B, "CH" => CH, "D" => D, "DH" => DH, "F" => F, "G" => G,
            "HH" => HH, "JH" => JH, "K" => K, "L" => L, "M" => M, "N" => N,
            "NG" => NG, "P" => P, "R" => R, "S" => S, "SH" => SH, "T" => T,
            "TH" => TH, "V" => V, "W" => W, "Y" => Y, "Z" => Z, "ZH" => ZH,
            _ => return None,
        })
    }

    pub fn is_vowel(self) -> bool {
        matches!(
            self,
            AA | AE | AH | AO | AW | AY | EH | ER | EY | IH | IY | OW | OY | UH | UW
        )
    }

    /// Sonority rank: vowels 5, glides 4, liquids 3, nasals 2, fricatives 1,
    /// stops/affricates 0. Same scale family as the letter-based approximation
    /// in `phonotactics.rs`, but computed on real phonemes.
    pub fn sonority(self) -> u8 {
        match self {
            _ if self.is_vowel() => 5,
            W | Y => 4,
            L | R => 3,
            M | N | NG => 2,
            F | V | TH | DH | S | Z | SH | ZH | HH => 1,
            _ => 0,
        }
    }
}

/// One phoneme plus the half-open byte range of the (lowercase ASCII) spelling
/// that produced it. Ranges from `pronounce_spanned` partition the input.
pub type SpannedPhoneme = (Phoneme, Range<usize>);

/// A syllable as onset + nucleus + coda over indices into the phoneme sequence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Syllable {
    pub onset: Vec<usize>,
    pub nucleus: usize,
    pub coda: Vec<usize>,
}

fn is_vowel_letter(b: u8) -> bool {
    matches!(b, b'a' | b'e' | b'i' | b'o' | b'u')
}

/// Rule-based grapheme-to-phoneme with letter spans. Handles the digraphs,
/// soft c/g, magic-e and y-as-vowel patterns that dominate the engine's short
/// coined-word space. Returns None for empty or non-ASCII-alphabetic input.
/// The spans partition `word` — asserted by `spans_partition_the_word`.
pub fn pronounce_spanned(word: &str) -> Option<Vec<SpannedPhoneme>> {
    if word.is_empty() || !word.bytes().all(|b| b.is_ascii_alphabetic()) {
        return None;
    }
    let lower = word.to_ascii_lowercase();
    let w = lower.as_bytes();
    let n = w.len();

    // Magic-e: final e after a consonant, with an earlier vowel, is silent and
    // lengthens a single vowel letter two positions back (vane, mite, code).
    let silent_e = n >= 4
        && w[n - 1] == b'e'
        && !is_vowel_letter(w[n - 2])
        && w[n - 2] != b'r' // "-re" endings (acre) are rare; keep r audible
        && w[..n - 1].iter().any(|&b| is_vowel_letter(b));
    let magic_vowel = if silent_e
        && is_vowel_letter(w[n - 3])
        && (n < 4 + 1 || !is_vowel_letter(w[n - 4]))
    {
        Some(n - 3)
    } else {
        None
    };

    let mut out: Vec<SpannedPhoneme> = Vec::with_capacity(n);
    let mut i = 0usize;
    while i < n {
        let rest = &w[i..];
        // Trigraphs first.
        if rest.starts_with(b"tch") {
            out.push((CH, i..i + 3));
            i += 3;
            continue;
        }
        if rest.starts_with(b"igh") {
            out.push((AY, i..i + 3));
            i += 3;
            continue;
        }
        // Consonant digraphs.
        if rest.len() >= 2 {
            let two = &rest[..2];
            let digraph = match two {
                b"ch" => Some(CH),
                b"sh" => Some(SH),
                b"th" => Some(TH),
                b"ph" => Some(F),
                b"wh" => Some(W),
                b"ck" => Some(K),
                b"ng" => Some(NG),
                _ => None,
            };
            if let Some(p) = digraph {
                out.push((p, i..i + 2));
                i += 2;
                continue;
            }
            if two == b"qu" {
                out.push((K, i..i + 1));
                out.push((W, i + 1..i + 2));
                i += 2;
                continue;
            }
            // Doubled consonant → one phoneme spanning both letters.
            if two[0] == two[1] && !is_vowel_letter(two[0]) {
                if let Some(p) = single_consonant(two[0], rest.get(2).copied()) {
                    out.push((p, i..i + 2));
                    i += 2;
                    continue;
                }
            }
            // Vowel digraphs.
            let vd = match two {
                b"ai" | b"ay" | b"ei" | b"ey" => Some(EY),
                b"ea" | b"ee" | b"ie" => Some(IY),
                b"oa" | b"oe" => Some(OW),
                b"oi" | b"oy" => Some(OY),
                b"oo" | b"ue" | b"ui" | b"ew" => Some(UW),
                b"ou" => Some(AW),
                b"au" | b"aw" => Some(AO),
                b"ow" => Some(if i + 2 == n { OW } else { AW }),
                b"er" if i + 2 == n => Some(ER),
                _ => None,
            };
            if let Some(p) = vd {
                out.push((p, i..i + 2));
                i += 2;
                continue;
            }
        }
        // Single letters.
        let b = w[i];
        let next = w.get(i + 1).copied();
        match b {
            b'a' | b'e' | b'i' | b'o' | b'u' => {
                if silent_e && i == n - 1 {
                    // Silent final e: attach its letter to the previous phoneme's
                    // span so spans still partition the word.
                    if let Some(last) = out.last_mut() {
                        last.1.end = n;
                    } else {
                        out.push((IY, i..i + 1));
                    }
                } else if magic_vowel == Some(i) {
                    let long = match b {
                        b'a' => EY,
                        b'e' => IY,
                        b'i' => AY,
                        b'o' => OW,
                        _ => UW,
                    };
                    out.push((long, i..i + 1));
                } else {
                    let short = match b {
                        b'a' => AE,
                        b'e' => EH,
                        b'i' => IH,
                        b'o' => AA,
                        _ => AH,
                    };
                    out.push((short, i..i + 1));
                }
            }
            b'y' => {
                // Consonant /j/ at word start or after a vowel letter (yard,
                // beyond); vowel otherwise (lyft → IH, brandy → IY).
                let prev_vowel = i > 0 && is_vowel_letter(w[i - 1]);
                if i == 0 || prev_vowel {
                    out.push((Y, i..i + 1));
                } else if i + 1 == n {
                    out.push((IY, i..i + 1));
                } else {
                    out.push((IH, i..i + 1));
                }
            }
            b'x' => {
                // One letter, two phonemes: S gets an empty span at the letter's
                // end so spans stay a partition (documented contract).
                out.push((K, i..i + 1));
                out.push((S, i + 1..i + 1));
            }
            _ => {
                if let Some(p) = single_consonant(b, next) {
                    out.push((p, i..i + 1));
                }
                // Letters with no mapping (silent gh handled above) are skipped;
                // their span merges into the neighbor below.
            }
        }
        i += 1;
    }
    // Ensure spans partition the word even if a letter was skipped.
    if let Some(first) = out.first_mut() {
        first.1.start = 0;
    }
    for j in 1..out.len() {
        let prev_end = out[j - 1].1.end;
        if out[j].1.start > prev_end {
            out[j].1.start = prev_end;
        }
    }
    if let Some(last) = out.last_mut() {
        last.1.end = n;
    }
    (!out.is_empty()).then_some(out)
}

/// Map one consonant letter (with lookahead for soft c/g) to a phoneme.
fn single_consonant(b: u8, next: Option<u8>) -> Option<Phoneme> {
    let soft = matches!(next, Some(b'e') | Some(b'i') | Some(b'y'));
    Some(match b {
        b'b' => B,
        b'c' => {
            if soft {
                S
            } else {
                K
            }
        }
        b'd' => D,
        b'f' => F,
        b'g' => {
            if soft {
                JH
            } else {
                G
            }
        }
        b'h' => HH,
        b'j' => JH,
        b'k' => K,
        b'l' => L,
        b'm' => M,
        b'n' => N,
        b'p' => P,
        b'q' => K,
        b'r' => R,
        b's' => S,
        b't' => T,
        b'v' => V,
        b'w' => W,
        b'z' => Z,
        _ => return None,
    })
}

/// Phonemes only, no spans (convenience over `pronounce_spanned`).
pub fn pronounce(word: &str) -> Option<Vec<Phoneme>> {
    pronounce_spanned(word).map(|v| v.into_iter().map(|(p, _)| p).collect())
}

/// True if `cluster` is a legal English syllable onset. Singletons always;
/// two-consonant clusters from the standard table; s+stop+liquid for three.
pub fn legal_onset(cluster: &[Phoneme]) -> bool {
    match cluster {
        [] | [_] => true,
        [a, b2] => legal_onset2(*a, *b2),
        [S, m, l] => matches!(m, P | T | K) && legal_onset2(*m, *l),
        _ => false,
    }
}

fn legal_onset2(a: Phoneme, b: Phoneme) -> bool {
    match (a, b) {
        (S, P | T | K | M | N | L | W | F) => true,
        (P | B | F, L | R) => true,
        (T | D | TH | SH, R) => true,
        (K | G, L | R | W) => true,
        (T, W) | (D, W) => true,
        _ => false,
    }
}

/// Onset-maximizing syllabification: each vowel phoneme is a nucleus; the
/// consonants between two nuclei split so the following syllable takes the
/// longest legal onset (at.las, not atl.as). Word-initial consonants are all
/// onset; word-final all coda. Empty when the sequence has no vowel.
pub fn syllabify(phonemes: &[Phoneme]) -> Vec<Syllable> {
    let nuclei: Vec<usize> = phonemes
        .iter()
        .enumerate()
        .filter(|(_, p)| p.is_vowel())
        .map(|(i, _)| i)
        .collect();
    if nuclei.is_empty() {
        return Vec::new();
    }
    let mut syllables: Vec<Syllable> = Vec::with_capacity(nuclei.len());
    for (k, &nuc) in nuclei.iter().enumerate() {
        let onset_start = if k == 0 {
            0
        } else {
            // Consonants between the previous nucleus and this one: give this
            // syllable the longest legal onset suffix of that cluster.
            let cluster_start = nuclei[k - 1] + 1;
            let mut start = nuc; // empty onset by default
            for s in cluster_start..nuc {
                if legal_onset(&phonemes[s..nuc]) {
                    start = s;
                    break;
                }
            }
            start
        };
        syllables.push(Syllable {
            onset: (onset_start..nuc).collect(),
            nucleus: nuc,
            coda: Vec::new(),
        });
        // The previous syllable's coda is everything between its nucleus and
        // this syllable's onset start.
        if k > 0 {
            let prev = &mut syllables[k - 1];
            prev.coda = (nuclei[k - 1] + 1..onset_start).collect();
        }
    }
    if let (Some(last), Some(&last_nuc)) = (syllables.last_mut(), nuclei.last()) {
        last.coda = (last_nuc + 1..phonemes.len()).collect();
    }
    syllables
}

/// Phoneme indices where each syllable starts (first onset consonant, or the
/// nucleus for an onsetless syllable). Convenience over `syllabify` for seam
/// alignment, which only needs boundary positions.
pub fn syllable_starts(phonemes: &[Phoneme]) -> Vec<usize> {
    syllabify(phonemes)
        .iter()
        .map(|s| s.onset.first().copied().unwrap_or(s.nucleus))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn phones(word: &str) -> Vec<Phoneme> {
        pronounce(word).unwrap()
    }

    #[test]
    fn spans_partition_the_word() {
        for word in [
            "pinterest", "verizon", "harbor", "atlas", "flow", "lumen", "bright", "quest",
            "checkable", "psyche", "rhythm", "wave",
        ] {
            let sp = pronounce_spanned(word).unwrap();
            assert_eq!(sp.first().unwrap().1.start, 0, "{word}");
            assert_eq!(sp.last().unwrap().1.end, word.len(), "{word}");
            for pair in sp.windows(2) {
                assert_eq!(pair[0].1.end, pair[1].1.start, "gap in {word}: {sp:?}");
            }
        }
    }

    #[test]
    fn digraphs_map_to_single_phonemes() {
        assert_eq!(phones("shop"), vec![SH, AA, P]);
        assert_eq!(phones("chat"), vec![CH, AE, T]);
    }

    #[test]
    fn phase_has_f_onset_and_magic_e() {
        let p = phones("phase");
        assert_eq!(p[0], F);
        assert_eq!(p[1], EY); // magic-e lengthens a
        assert_eq!(*p.last().unwrap(), S); // final e silent
    }

    #[test]
    fn magic_e_lengthens_the_vowel() {
        assert_eq!(phones("vane"), vec![V, EY, N]);
        assert_eq!(phones("mite"), vec![M, AY, T]);
        assert_eq!(phones("code"), vec![K, OW, D]);
        // No earlier vowel → the e is not silent.
        assert_eq!(phones("the"), vec![TH, EH]);
    }

    #[test]
    fn soft_c_and_g() {
        assert_eq!(phones("cite")[0], S);
        assert_eq!(phones("cat")[0], K);
        assert_eq!(phones("gem")[0], JH);
        assert_eq!(phones("got")[0], G);
    }

    #[test]
    fn y_is_consonant_at_start_vowel_inside() {
        assert_eq!(phones("yard")[0], Y);
        assert_eq!(phones("lyft"), vec![L, IH, F, T]);
        assert_eq!(*phones("brandy").last().unwrap(), IY);
    }

    #[test]
    fn doubled_consonants_collapse() {
        assert_eq!(phones("summit"), vec![S, AH, M, IH, T]);
        assert_eq!(phones("pull").len(), 3);
    }

    #[test]
    fn qu_and_x_expand() {
        assert_eq!(phones("quest"), vec![K, W, EH, S, T]);
        assert_eq!(phones("flex"), vec![F, L, EH, K, S]);
    }

    #[test]
    fn syllable_counts_match_intuition() {
        for (word, expected) in [
            ("flow", 1),
            ("atlas", 2),
            ("harbor", 2),
            ("lumen", 2),
            ("pinterest", 3),
            ("verizon", 3),
        ] {
            let n = syllabify(&phones(word)).len();
            assert_eq!(n, expected, "{word}");
        }
    }

    #[test]
    fn onset_maximization_splits_at_legal_onsets() {
        // atlas: /AE T L AE S/ — "tl" is not a legal onset, so t closes the
        // first syllable: at.las.
        let p = phones("atlas");
        let syl = syllabify(&p);
        assert_eq!(syl.len(), 2);
        assert_eq!(syl[0].coda, vec![1]); // T
        assert!(syl[1].onset.len() == 1 && p[syl[1].onset[0]] == L);
        // secret-style: /IY K R/ — "kr" IS a legal onset, so both consonants
        // open the second syllable.
        let p2 = phones("microt");
        let syl2 = syllabify(&p2);
        assert!(syl2[1].onset.len() >= 2, "{syl2:?}");
    }

    #[test]
    fn sonority_ranks() {
        assert_eq!(AA.sonority(), 5);
        assert_eq!(W.sonority(), 4);
        assert_eq!(L.sonority(), 3);
        assert_eq!(M.sonority(), 2);
        assert_eq!(S.sonority(), 1);
        assert_eq!(T.sonority(), 0);
    }

    #[test]
    fn arpabet_roundtrip_ignores_stress() {
        assert_eq!(Phoneme::from_arpabet("AH0"), Some(AH));
        assert_eq!(Phoneme::from_arpabet("K"), Some(K));
        assert_eq!(Phoneme::from_arpabet("ZZZ"), None);
    }

    #[test]
    fn rejects_non_alphabetic() {
        assert!(pronounce("").is_none());
        assert!(pronounce("a-b").is_none());
        assert!(pronounce("naïve").is_none());
    }
}
