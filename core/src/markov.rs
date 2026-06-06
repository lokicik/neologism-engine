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
