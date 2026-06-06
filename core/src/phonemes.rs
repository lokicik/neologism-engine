//! Phoneme-class profiles for sub-style flavoring.
//!
//! Grounded in sound-symbolism research (Köhler's bouba/kiki; "Sounds good:
//! phonetic patterns in top brand names"; Pathak 2020): sonorous liquids and
//! sibilants read as soft/flowing, harsh plosives and back consonants read as
//! hard/spiky. Each variant favors some letter classes and disfavors others;
//! `affinity_score` rates how well a name fits its variant so generation can
//! re-rank candidates toward the intended sound.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Variant {
    Elvish,
    Dwarvish,
    Orcish,
    Common,
    Stellar,
    Machine,
    Alien,
}

impl Variant {
    pub fn parse(s: &str) -> Option<Variant> {
        match s.to_lowercase().as_str() {
            "elvish" => Some(Variant::Elvish),
            "dwarvish" => Some(Variant::Dwarvish),
            "orcish" => Some(Variant::Orcish),
            "common" => Some(Variant::Common),
            "stellar" => Some(Variant::Stellar),
            "machine" => Some(Variant::Machine),
            "alien" => Some(Variant::Alien),
            _ => None,
        }
    }

    /// Letters this variant favors (on-profile sounds).
    fn favored(self) -> &'static [char] {
        match self {
            Variant::Elvish => &['l', 'r', 's', 'n', 'i', 'e', 'a', 'y', 'w', 'h'],
            Variant::Dwarvish => &['d', 'r', 'n', 'm', 'b', 'g', 'k', 't', 'u', 'o'],
            Variant::Orcish => &['k', 'g', 'r', 'z', 't', 'h', 'u', 'a', 'b'],
            Variant::Common => &[],
            Variant::Stellar => &['l', 'r', 'n', 's', 'a', 'e', 'i', 'o', 'm'],
            Variant::Machine => &['t', 'x', 'n', 'r', 'k', 's', 'c', 'o', 'e'],
            Variant::Alien => &['x', 'z', 'q', 'k', 'v', 'r'],
        }
    }

    /// Letters this variant avoids (off-profile sounds).
    fn disfavored(self) -> &'static [char] {
        match self {
            Variant::Elvish => &['k', 'g', 'z', 'x', 'q'],
            Variant::Dwarvish => &['x', 'z', 'q', 'w', 'y'],
            Variant::Orcish => &['w', 'y', 'l'],
            Variant::Common => &['x', 'z', 'q'],
            Variant::Stellar => &['x', 'z', 'q', 'k', 'g'],
            Variant::Machine => &['w', 'h', 'y'],
            Variant::Alien => &['w', 'h'],
        }
    }
}

/// Rate how well `name` fits `variant`'s sound profile. Higher = more on-profile.
/// Returns a relative score (used for sorting); ~0.5 baseline, no strong bias for Common.
pub fn affinity_score(name: &str, variant: Variant) -> f64 {
    if variant == Variant::Common {
        return 0.5;
    }
    let favored = variant.favored();
    let disfavored = variant.disfavored();
    let lower = name.to_lowercase();
    let len = lower.chars().count().max(1) as f64;

    let mut score = 0.0f64;
    for c in lower.chars() {
        if favored.contains(&c) {
            score += 1.0;
        } else if disfavored.contains(&c) {
            score -= 0.7;
        }
    }
    (score / len + 0.3).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_known_variants() {
        assert_eq!(Variant::parse("elvish"), Some(Variant::Elvish));
        assert_eq!(Variant::parse("ALIEN"), Some(Variant::Alien));
        assert_eq!(Variant::parse("nope"), None);
    }

    #[test]
    fn elvish_prefers_flowing_names() {
        // "Aelindra" (liquids + sibilants) should outrank "Gruumsh" (harsh plosives)
        let flowing = affinity_score("aelindra", Variant::Elvish);
        let harsh = affinity_score("gruumsh", Variant::Elvish);
        assert!(flowing > harsh, "{} vs {}", flowing, harsh);
    }

    #[test]
    fn orcish_prefers_harsh_names() {
        let harsh = affinity_score("gruumsh", Variant::Orcish);
        let flowing = affinity_score("aelindra", Variant::Orcish);
        assert!(harsh > flowing, "{} vs {}", harsh, flowing);
    }

    #[test]
    fn alien_prefers_xzq() {
        let alienish = affinity_score("zyxvax", Variant::Alien);
        let plain = affinity_score("orion", Variant::Alien);
        assert!(alienish > plain, "{} vs {}", alienish, plain);
    }
}
