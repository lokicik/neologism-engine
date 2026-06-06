use std::collections::HashMap;
use rand::Rng;

const START: char = '^';
const END: char = '$';

/// Order-k character Markov model.
pub struct Model {
    order: usize,
    counts: HashMap<String, HashMap<char, u32>>,
}

impl Model {
    pub fn train(names: &[&str], order: usize) -> Self {
        let mut counts: HashMap<String, HashMap<char, u32>> = HashMap::new();
        for name in names {
            let padded: String = std::iter::repeat(START)
                .take(order)
                .chain(name.chars())
                .chain(std::iter::once(END))
                .collect();
            let chars: Vec<char> = padded.chars().collect();
            for i in 0..chars.len().saturating_sub(order) {
                let key: String = chars[i..i + order].iter().collect();
                let next = chars[i + order];
                *counts.entry(key).or_default().entry(next).or_insert(0) += 1;
            }
        }
        Self { order, counts }
    }

    /// Sample a name; temperature rescales frequencies (< 1 = peaked, > 1 = flat).
    pub fn sample<R: Rng>(&self, rng: &mut R, temperature: f64, min_len: usize, max_len: usize) -> Option<String> {
        let mut result = String::new();
        let mut context: String = std::iter::repeat(START).take(self.order).collect();

        for _ in 0..max_len + self.order + 2 {
            let dist = self.counts.get(&context)?;
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
            let p = match self.counts.get(&key) {
                Some(dist) => {
                    let sum: u32 = dist.values().sum();
                    let c = dist.get(&next).copied().unwrap_or(0);
                    if sum == 0 { FLOOR } else { (c as f64 / sum as f64).max(FLOOR) }
                }
                None => FLOOR,
            };
            total += p.ln();
            steps += 1;
        }
        if steps == 0 {
            return f64::NEG_INFINITY;
        }
        total / steps as f64
    }

    fn weighted_sample<R: Rng>(&self, rng: &mut R, dist: &HashMap<char, u32>, temperature: f64) -> Option<char> {
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
    use rand_chacha::ChaCha8Rng;
    use rand::SeedableRng;

    #[test]
    fn log_likelihood_prefers_typical() {
        let names = vec!["google", "amazon", "spotify", "stripe", "notion", "vercel", "shopify"];
        let model = Model::train(&names, 2);
        let typical = model.log_likelihood("shoptify");
        let junk = model.log_likelihood("xqzkph");
        assert!(typical > junk, "typical {} vs junk {}", typical, junk);
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
