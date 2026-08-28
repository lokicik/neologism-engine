use rand::Rng;
use std::collections::HashMap;

const START: char = '^';
const END: char = '$';

/// Stupid-backoff discount applied per order dropped (Brants et al. 2007).
const BACKOFF: f64 = 0.4;

/// Order-k character Markov model.
///
/// When `backoff` is true, the model also stores count tables for every lower
/// order (`0..=order`) so an unseen high-order context can fall back to a
/// shorter one instead of dead-ending. This yields order-3 coherence on a small,
/// sparse corpus (the 355-name brand list) without producing incoherent
/// fragments. The plain (non-backoff) path is unchanged so Sci-Fi/Fantasy
/// generation is byte-for-byte identical.
pub struct Model {
    order: usize,
    counts: HashMap<String, HashMap<char, u32>>,
    /// Count tables for orders `0..order` (index = order), only when backoff is on.
    lower: Vec<HashMap<String, HashMap<char, u32>>>,
}

impl Model {
    pub fn train(names: &[&str], order: usize) -> Self {
        let counts = Self::count_at_order(names, order);
        Self {
            order,
            counts,
            lower: Vec::new(),
        }
    }

    /// Train an order-`order` model that can back off to all lower orders.
    pub fn train_backoff(names: &[&str], order: usize) -> Self {
        let counts = Self::count_at_order(names, order);
        let lower: Vec<HashMap<String, HashMap<char, u32>>> =
            (0..order).map(|k| Self::count_at_order(names, k)).collect();
        Self {
            order,
            counts,
            lower,
        }
    }

    /// Build the (context -> next-char counts) table for a single order `k`.
    fn count_at_order(names: &[&str], k: usize) -> HashMap<String, HashMap<char, u32>> {
        let mut counts: HashMap<String, HashMap<char, u32>> = HashMap::new();
        for name in names {
            let padded: String = std::iter::repeat(START)
                .take(k)
                .chain(name.chars())
                .chain(std::iter::once(END))
                .collect();
            let chars: Vec<char> = padded.chars().collect();
            for i in 0..chars.len().saturating_sub(k) {
                let key: String = chars[i..i + k].iter().collect();
                let next = chars[i + k];
                *counts.entry(key).or_default().entry(next).or_insert(0) += 1;
            }
        }
        counts
    }

    /// The distribution for `context`, backing off to shorter contexts when the
    /// full one is unseen. Returns the matched order's table entry, or None.
    fn dist_with_backoff(&self, context: &str) -> Option<&HashMap<char, u32>> {
        if let Some(d) = self.counts.get(context) {
            return Some(d);
        }
        if self.lower.is_empty() {
            return None;
        }
        // Drop leading chars to shorten the context, trying each lower order.
        let ctx: Vec<char> = context.chars().collect();
        for k in (0..self.order).rev() {
            let suffix: String = ctx[ctx.len() - k..].iter().collect();
            if let Some(d) = self.lower[k].get(&suffix) {
                return Some(d);
            }
        }
        None
    }

    /// Sample a name; temperature rescales frequencies (< 1 = peaked, > 1 = flat).
    pub fn sample<R: Rng>(
        &self,
        rng: &mut R,
        temperature: f64,
        min_len: usize,
        max_len: usize,
    ) -> Option<String> {
        let mut result = String::new();
        let mut context: String = std::iter::repeat(START).take(self.order).collect();

        for _ in 0..max_len + self.order + 2 {
            let dist = self.dist_with_backoff(&context)?;
            let next = self.weighted_sample(rng, dist, temperature)?;
            if next == END {
                break;
            }
            result.push(next);
            // slide context window
            let mut ctx_chars: Vec<char> = context.chars().collect();
            ctx_chars.push(next);
            context = ctx_chars[ctx_chars.len() - self.order..].iter().collect();
        }

        if result.len() < min_len || result.len() > max_len {
            return None;
        }
        Some(result)
    }

    /// Average log-probability per transition of `name` under this model
    /// (Shannon word-likeness). Higher = more typical of the training corpus.
    /// Unseen contexts/characters fall back to a small floor so blends that
    /// the model never saw aren't `-inf`.
    pub fn log_likelihood(&self, name: &str) -> f64 {
        const FLOOR: f64 = 1e-6;
        let padded: Vec<char> = std::iter::repeat(START)
            .take(self.order)
            .chain(name.to_lowercase().chars())
            .chain(std::iter::once(END))
            .collect();

        let mut total = 0.0f64;
        let mut steps = 0usize;
        for i in 0..padded.len().saturating_sub(self.order) {
            let key: String = padded[i..i + self.order].iter().collect();
            let next = padded[i + self.order];
            let p = self.prob_with_backoff(&key, next).max(FLOOR);
            total += p.ln();
            steps += 1;
        }
        if steps == 0 {
            return f64::NEG_INFINITY;
        }
        total / steps as f64
    }

    /// P(next | context): exact frequency at the full order, or — for a backoff
    /// model — the highest order whose context+char is seen, discounted by
    /// `BACKOFF` per order dropped (stupid backoff). Plain models return 0.0 on a
    /// miss, preserving the caller's floor behaviour.
    fn prob_with_backoff(&self, context: &str, next: char) -> f64 {
        if let Some(dist) = self.counts.get(context) {
            let sum: u32 = dist.values().sum();
            let c = dist.get(&next).copied().unwrap_or(0);
            if sum > 0 && c > 0 {
                return c as f64 / sum as f64;
            }
        }
        if self.lower.is_empty() {
            return 0.0;
        }
        let ctx: Vec<char> = context.chars().collect();
        for k in (0..self.order).rev() {
            let suffix: String = ctx[ctx.len() - k..].iter().collect();
            if let Some(dist) = self.lower[k].get(&suffix) {
                let sum: u32 = dist.values().sum();
                let c = dist.get(&next).copied().unwrap_or(0);
                if sum > 0 && c > 0 {
                    let levels = (self.order - k) as i32;
                    return (c as f64 / sum as f64) * BACKOFF.powi(levels);
                }
            }
        }
        0.0
    }

    fn weighted_sample<R: Rng>(
        &self,
        rng: &mut R,
        dist: &HashMap<char, u32>,
        temperature: f64,
    ) -> Option<char> {
        let t = temperature.max(0.01);
        // Sort by char to make sampling order-independent (HashMap iteration is non-deterministic)
        let mut weights: Vec<(char, f64)> = dist
            .iter()
            .map(|(&c, &w)| (c, (w as f64).powf(1.0 / t)))
            .collect();
        weights.sort_by_key(|(c, _)| *c);
        let total: f64 = weights.iter().map(|(_, w)| w).sum();
        if total == 0.0 {
            return None;
        }
        let mut pick = rng.gen::<f64>() * total;
        for (c, w) in &weights {
            pick -= w;
            if pick <= 0.0 {
                return Some(*c);
            }
        }
        weights.last().map(|(c, _)| *c)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn log_likelihood_prefers_typical() {
        let names = vec![
            "google", "amazon", "spotify", "stripe", "notion", "vercel", "shopify",
        ];
        let model = Model::train(&names, 2);
        let typical = model.log_likelihood("shoptify");
        let junk = model.log_likelihood("xqzkph");
        assert!(typical > junk, "typical {} vs junk {}", typical, junk);
    }

    #[test]
    fn backoff_separates_brandlike_from_junk() {
        // Order-3 with backoff should score a coherent coinage well above junk,
        // where the old order-2 floor (1e-6) flattened them together.
        let brands = vec![
            "google", "amazon", "spotify", "stripe", "notion", "vercel", "shopify", "figma",
            "linear", "render", "supabase",
        ];
        let model = Model::train_backoff(&brands, 3);
        let brandlike = model.log_likelihood("vercet");
        let junk = model.log_likelihood("porducku");
        assert!(brandlike > junk, "brandlike {} vs junk {}", brandlike, junk);
        assert!(junk > f64::NEG_INFINITY);
    }

    #[test]
    fn backoff_recovers_unseen_context() {
        // A backoff model must keep sampling past a context the order-3 table
        // never saw (it falls back to a shorter context instead of stopping).
        let brands = vec!["google", "amazon", "spotify", "stripe", "notion"];
        let model = Model::train_backoff(&brands, 3);
        let mut rng = ChaCha8Rng::seed_from_u64(7);
        let mut produced = 0;
        for _ in 0..50 {
            if model.sample(&mut rng, 0.9, 4, 12).is_some() {
                produced += 1;
            }
        }
        assert!(produced > 0, "backoff model produced no samples");
    }

    #[test]
    fn deterministic_with_seed() {
        let names = vec!["aelindra", "thalor", "sylvara", "morduin"];
        let model = Model::train(&names, 2);
        let mut rng1 = ChaCha8Rng::seed_from_u64(42);
        let mut rng2 = ChaCha8Rng::seed_from_u64(42);
        let a = model.sample(&mut rng1, 0.7, 4, 12);
        let b = model.sample(&mut rng2, 0.7, 4, 12);
        assert_eq!(a, b);
    }
}
