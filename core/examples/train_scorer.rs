// Phase 27 step 3: trains a small linear-regression quality scorer on the
// LLM-labeled dataset produced by `label_names`. Pure hand-rolled gradient
// descent over Vec<f64> — no ML library, so the result is trivially WASM-
// shippable as a `const` weight array (Phase 27 plan, Step 3/4).
//
// Predicts the continuous 1-5 LLM rating from the 9 existing-signal features
// (z-score normalized). Reports validation correlation/MAE — Checkpoint B:
// if the held-out correlation is weak, the dataset/labels can't be distilled
// usefully and the right move is to stop, not ship a model that adds noise.
//
// Run: cargo run -p neologism-core --release --example train_scorer -- <labels.tsv>

use std::fs;

const N: usize = 9;
const EPOCHS: usize = 4000;
const LR: f64 = 0.05;

fn load(path: &str) -> Vec<(String, [f64; N], f64)> {
    fs::read_to_string(path)
        .expect("read labels file")
        .lines()
        .filter_map(|line| {
            let cols: Vec<&str> = line.split('\t').collect();
            if cols.len() != N + 2 {
                return None;
            }
            let name = cols[0].to_string();
            let mut f = [0.0; N];
            for i in 0..N {
                f[i] = cols[i + 1].parse().ok()?;
            }
            let label: f64 = cols[N + 1].parse().ok()?;
            Some((name, f, label))
        })
        .collect()
}

/// Deterministic shuffle (Fisher-Yates with a fixed xorshift stream) — keeps
/// the train/validation split reproducible across runs.
fn shuffled_indices(n: usize, seed: u64) -> Vec<usize> {
    let mut idx: Vec<usize> = (0..n).collect();
    let mut s = seed;
    for i in (1..n).rev() {
        s ^= s << 13;
        s ^= s >> 7;
        s ^= s << 17;
        let j = (s as usize) % (i + 1);
        idx.swap(i, j);
    }
    idx
}

fn mean_std(rows: &[(String, [f64; N], f64)], idxs: &[usize]) -> ([f64; N], [f64; N]) {
    let n = idxs.len() as f64;
    let mut mean = [0.0; N];
    for &i in idxs {
        for k in 0..N {
            mean[k] += rows[i].1[k];
        }
    }
    for m in mean.iter_mut() {
        *m /= n;
    }
    let mut var = [0.0; N];
    for &i in idxs {
        for k in 0..N {
            let d = rows[i].1[k] - mean[k];
            var[k] += d * d;
        }
    }
    let mut std = [0.0; N];
    for k in 0..N {
        std[k] = (var[k] / n).sqrt().max(1e-9);
    }
    (mean, std)
}

fn normalize(f: &[f64; N], mean: &[f64; N], std: &[f64; N]) -> [f64; N] {
    let mut out = [0.0; N];
    for k in 0..N {
        out[k] = (f[k] - mean[k]) / std[k];
    }
    out
}

fn predict(x: &[f64; N], w: &[f64; N], b: f64) -> f64 {
    let mut s = b;
    for k in 0..N {
        s += w[k] * x[k];
    }
    s
}

fn pearson(a: &[f64], b: &[f64]) -> f64 {
    let n = a.len() as f64;
    let ma = a.iter().sum::<f64>() / n;
    let mb = b.iter().sum::<f64>() / n;
    let mut cov = 0.0;
    let mut va = 0.0;
    let mut vb = 0.0;
    for i in 0..a.len() {
        let da = a[i] - ma;
        let db = b[i] - mb;
        cov += da * db;
        va += da * da;
        vb += db * db;
    }
    cov / (va.sqrt() * vb.sqrt()).max(1e-12)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("usage: train_scorer <labels.tsv>");
        std::process::exit(1);
    }
    let rows = load(&args[1]);
    eprintln!("loaded {} labeled examples", rows.len());

    let order = shuffled_indices(rows.len(), 0x5EED_C0DE_u64);
    let split = (rows.len() * 4) / 5;
    let train_idx = &order[..split];
    let val_idx = &order[split..];
    eprintln!("train={} val={}", train_idx.len(), val_idx.len());

    let (mean, std) = mean_std(&rows, train_idx);

    let mut w = [0.0; N];
    let mut b = 3.0; // labels center around ~3 on a 1-5 scale
    let train_x: Vec<[f64; N]> = train_idx.iter().map(|&i| normalize(&rows[i].1, &mean, &std)).collect();
    let train_y: Vec<f64> = train_idx.iter().map(|&i| rows[i].2).collect();

    for epoch in 0..EPOCHS {
        let mut grad_w = [0.0; N];
        let mut grad_b = 0.0;
        for (x, &y) in train_x.iter().zip(train_y.iter()) {
            let err = predict(x, &w, b) - y;
            for k in 0..N {
                grad_w[k] += err * x[k];
            }
            grad_b += err;
        }
        let n = train_x.len() as f64;
        for k in 0..N {
            w[k] -= LR * grad_w[k] / n;
        }
        b -= LR * grad_b / n;

        if epoch % 1000 == 0 || epoch == EPOCHS - 1 {
            let mse: f64 = train_x.iter().zip(train_y.iter()).map(|(x, &y)| (predict(x, &w, b) - y).powi(2)).sum::<f64>() / n;
            eprintln!("epoch {epoch}: train MSE = {mse:.4}");
        }
    }

    // Validation — the Checkpoint B signal.
    let val_pred: Vec<f64> = val_idx.iter().map(|&i| predict(&normalize(&rows[i].1, &mean, &std), &w, b)).collect();
    let val_true: Vec<f64> = val_idx.iter().map(|&i| rows[i].2).collect();
    let corr = pearson(&val_pred, &val_true);
    let mae: f64 = val_pred.iter().zip(val_true.iter()).map(|(p, t)| (p - t).abs()).sum::<f64>() / val_pred.len() as f64;
    eprintln!();
    eprintln!("=== Checkpoint B: held-out validation ===");
    eprintln!("Pearson correlation (predicted vs LLM label): {corr:.3}");
    eprintln!("Mean absolute error (1-5 scale):              {mae:.3}");
    eprintln!("(weak signal: |corr| < 0.3 — stop here, the model isn't learning anything useful)");
    eprintln!("(workable signal: |corr| > 0.4-0.5 — proceed to ship)");
    eprintln!();
    eprintln!("--- sample validation predictions (predicted | actual | name) ---");
    let mut sample: Vec<(f64, f64, &str)> = val_idx.iter().zip(val_pred.iter()).map(|(&i, &p)| (p, rows[i].2, rows[i].0.as_str())).collect();
    sample.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
    for (p, t, name) in sample.iter().take(15) {
        eprintln!("  {p:.2} | {t:.0} | {name}");
    }
    for (p, t, name) in sample.iter().rev().take(15) {
        eprintln!("  {p:.2} | {t:.0} | {name}");
    }

    eprintln!();
    eprintln!("=== Rust const arrays — paste into core/src/scorer.rs ===");
    println!("const FEATURE_MEAN: [f64; {N}] = {mean:?};");
    println!("const FEATURE_STD: [f64; {N}] = {std:?};");
    println!("const WEIGHTS: [f64; {N}] = {w:?};");
    println!("const BIAS: f64 = {b:.6};");
}
