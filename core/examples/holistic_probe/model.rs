use rand::Rng;
use serde::Deserialize;
use std::collections::HashMap;

const MAGIC: &[u8; 8] = b"NEOHOL1\0";

#[derive(Deserialize)]
struct Metadata {
    schema: String,
    character_embedding: usize,
    keyword_embedding: usize,
    hidden: usize,
    keyword_vocabulary: Vec<String>,
    metrics: TrainingMetrics,
}

#[derive(Deserialize)]
struct TrainingMetrics {
    test_nll_relative_improvement: f64,
    wrong_condition_pairwise_accuracy: f64,
}

#[derive(Clone)]
struct QuantMatrix {
    rows: usize,
    cols: usize,
    scales: Vec<f32>,
    values: Vec<i8>,
}

impl QuantMatrix {
    fn row(&self, row: usize) -> Vec<f32> {
        let start = row * self.cols;
        let scale = self.scales[row];
        self.values[start..start + self.cols]
            .iter()
            .map(|value| *value as f32 * scale)
            .collect()
    }

    fn dot_rows(&self, input: &[f32]) -> Vec<f32> {
        debug_assert_eq!(input.len(), self.cols);
        (0..self.rows)
            .map(|row| {
                let start = row * self.cols;
                let sum: f32 = self.values[start..start + self.cols]
                    .iter()
                    .zip(input)
                    .map(|(weight, value)| *weight as f32 * *value)
                    .sum();
                sum * self.scales[row]
            })
            .collect()
    }
}

struct Cursor<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> Cursor<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, offset: 0 }
    }

    fn take(&mut self, count: usize) -> Result<&'a [u8], String> {
        let end = self
            .offset
            .checked_add(count)
            .ok_or("model length overflow")?;
        let value = self
            .bytes
            .get(self.offset..end)
            .ok_or("truncated model artifact")?;
        self.offset = end;
        Ok(value)
    }

    fn u8(&mut self) -> Result<u8, String> {
        Ok(self.take(1)?[0])
    }

    fn u32(&mut self) -> Result<u32, String> {
        let bytes: [u8; 4] = self.take(4)?.try_into().map_err(|_| "invalid u32")?;
        Ok(u32::from_le_bytes(bytes))
    }

    fn f32(&mut self) -> Result<f32, String> {
        let bytes: [u8; 4] = self.take(4)?.try_into().map_err(|_| "invalid f32")?;
        let value = f32::from_le_bytes(bytes);
        if !value.is_finite() {
            return Err("non-finite model value".into());
        }
        Ok(value)
    }
}

pub struct Model {
    keyword_ids: HashMap<String, usize>,
    keyword: QuantMatrix,
    character: QuantMatrix,
    condition: QuantMatrix,
    condition_bias: Vec<f32>,
    weight_ih: QuantMatrix,
    weight_hh: QuantMatrix,
    bias_ih: Vec<f32>,
    bias_hh: Vec<f32>,
    output: QuantMatrix,
    output_bias: Vec<f32>,
    hidden: usize,
    mechanism_gates_pass: bool,
}

fn expect_quant(
    tensors: &mut HashMap<String, QuantMatrix>,
    name: &str,
    rows: usize,
    cols: usize,
) -> Result<QuantMatrix, String> {
    let tensor = tensors
        .remove(name)
        .ok_or_else(|| format!("missing tensor {name}"))?;
    if tensor.rows != rows || tensor.cols != cols {
        return Err(format!(
            "tensor {name} dimensions {}x{} != {rows}x{cols}",
            tensor.rows, tensor.cols
        ));
    }
    Ok(tensor)
}

fn expect_float(
    tensors: &mut HashMap<String, (usize, usize, Vec<f32>)>,
    name: &str,
    count: usize,
) -> Result<Vec<f32>, String> {
    let (rows, cols, values) = tensors
        .remove(name)
        .ok_or_else(|| format!("missing tensor {name}"))?;
    if rows.checked_mul(cols) != Some(count) || values.len() != count {
        return Err(format!("tensor {name} length mismatch"));
    }
    Ok(values)
}

impl Model {
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, String> {
        let mut cursor = Cursor::new(bytes);
        if cursor.take(8)? != MAGIC {
            return Err("invalid model magic".into());
        }
        if cursor.u32()? != 1 {
            return Err("unsupported model version".into());
        }
        let metadata_length = cursor.u32()? as usize;
        let metadata: Metadata = serde_json::from_slice(cursor.take(metadata_length)?)
            .map_err(|error| format!("invalid model metadata: {error}"))?;
        if metadata.schema != "neologism-holistic-model-v1"
            || metadata.character_embedding != 24
            || metadata.keyword_embedding != 64
            || metadata.hidden != 96
            || metadata.keyword_vocabulary.len() != 512
        {
            return Err("unsupported model architecture".into());
        }
        if !metadata.metrics.test_nll_relative_improvement.is_finite()
            || !metadata
                .metrics
                .wrong_condition_pairwise_accuracy
                .is_finite()
        {
            return Err("non-finite training metrics".into());
        }
        let tensor_count = cursor.u32()? as usize;
        if tensor_count != 10 {
            return Err("unexpected tensor count".into());
        }
        let mut quantized = HashMap::new();
        let mut floats = HashMap::new();
        for _ in 0..tensor_count {
            let kind = cursor.u8()?;
            let name_length = cursor.u8()? as usize;
            let rows = cursor.u32()? as usize;
            let cols = cursor.u32()? as usize;
            let name = std::str::from_utf8(cursor.take(name_length)?)
                .map_err(|_| "non-ASCII tensor name")?
                .to_string();
            let count = rows.checked_mul(cols).ok_or("tensor size overflow")?;
            if rows == 0 || cols == 0 || count > 2_000_000 {
                return Err("invalid tensor dimensions".into());
            }
            match kind {
                0 => {
                    let scales = (0..rows)
                        .map(|_| cursor.f32())
                        .collect::<Result<Vec<_>, _>>()?;
                    if scales.iter().any(|scale| *scale <= 0.0) {
                        return Err("invalid quantization scale".into());
                    }
                    let values = cursor
                        .take(count)?
                        .iter()
                        .map(|value| *value as i8)
                        .collect();
                    if quantized
                        .insert(
                            name,
                            QuantMatrix {
                                rows,
                                cols,
                                scales,
                                values,
                            },
                        )
                        .is_some()
                    {
                        return Err("duplicate tensor name".into());
                    }
                }
                1 => {
                    let values = (0..count)
                        .map(|_| cursor.f32())
                        .collect::<Result<Vec<_>, _>>()?;
                    if floats.insert(name, (rows, cols, values)).is_some() {
                        return Err("duplicate tensor name".into());
                    }
                }
                _ => return Err("unknown tensor kind".into()),
            }
        }
        if cursor.offset != bytes.len() {
            return Err("trailing model bytes".into());
        }
        let hidden = metadata.hidden;
        let keyword_ids = metadata
            .keyword_vocabulary
            .into_iter()
            .enumerate()
            .map(|(index, word)| (word, index))
            .collect();
        let model = Self {
            keyword_ids,
            keyword: expect_quant(&mut quantized, "keyword.weight", 512, 64)?,
            character: expect_quant(&mut quantized, "character.weight", 28, 24)?,
            condition: expect_quant(&mut quantized, "condition.weight", hidden, 64)?,
            condition_bias: expect_float(&mut floats, "condition.bias", hidden)?,
            weight_ih: expect_quant(&mut quantized, "gru.weight_ih_l0", hidden * 3, 24)?,
            weight_hh: expect_quant(&mut quantized, "gru.weight_hh_l0", hidden * 3, hidden)?,
            bias_ih: expect_float(&mut floats, "gru.bias_ih_l0", hidden * 3)?,
            bias_hh: expect_float(&mut floats, "gru.bias_hh_l0", hidden * 3)?,
            output: expect_quant(&mut quantized, "output.weight", 27, hidden)?,
            output_bias: expect_float(&mut floats, "output.bias", 27)?,
            hidden,
            mechanism_gates_pass: metadata.metrics.test_nll_relative_improvement >= 0.05
                && metadata.metrics.wrong_condition_pairwise_accuracy >= 0.65,
        };
        if !quantized.is_empty() || !floats.is_empty() {
            return Err("unexpected model tensors".into());
        }
        Ok(model)
    }

    pub fn mechanism_gates_pass(&self) -> bool {
        self.mechanism_gates_pass
    }

    pub fn known_keywords<'a>(
        &self,
        keywords: impl IntoIterator<Item = &'a String>,
    ) -> Vec<String> {
        keywords
            .into_iter()
            .filter(|word| self.keyword_ids.contains_key(word.as_str()))
            .cloned()
            .collect()
    }

    fn hidden_for(&self, keywords: &[String]) -> Vec<f32> {
        let mut mean = vec![0.0; self.keyword.cols];
        let mut count = 0usize;
        for keyword in keywords {
            let Some(&index) = self.keyword_ids.get(keyword) else {
                continue;
            };
            for (target, value) in mean.iter_mut().zip(self.keyword.row(index)) {
                *target += value;
            }
            count += 1;
        }
        if count > 0 {
            for value in &mut mean {
                *value /= count as f32;
            }
        }
        let mut hidden = self.condition.dot_rows(&mean);
        for (value, bias) in hidden.iter_mut().zip(&self.condition_bias) {
            *value = (*value + *bias).tanh();
        }
        hidden
    }

    fn step(&self, input_id: usize, hidden: &mut [f32]) -> Vec<f32> {
        let input = self.character.row(input_id);
        let mut ih = self.weight_ih.dot_rows(&input);
        let mut hh = self.weight_hh.dot_rows(hidden);
        for (value, bias) in ih.iter_mut().zip(&self.bias_ih) {
            *value += *bias;
        }
        for (value, bias) in hh.iter_mut().zip(&self.bias_hh) {
            *value += *bias;
        }
        let (ir, rest) = ih.split_at(self.hidden);
        let (iz, inn) = rest.split_at(self.hidden);
        let (hr, rest) = hh.split_at(self.hidden);
        let (hz, hn) = rest.split_at(self.hidden);
        for index in 0..self.hidden {
            let reset = sigmoid(ir[index] + hr[index]);
            let update = sigmoid(iz[index] + hz[index]);
            let candidate = (inn[index] + reset * hn[index]).tanh();
            hidden[index] = (1.0 - update) * candidate + update * hidden[index];
        }
        let mut logits = self.output.dot_rows(hidden);
        for (value, bias) in logits.iter_mut().zip(&self.output_bias) {
            *value += *bias;
        }
        logits
    }

    pub fn sample<R: Rng>(
        &self,
        rng: &mut R,
        keywords: &[String],
        temperature: f32,
        top_k: usize,
        min_len: usize,
        max_len: usize,
    ) -> Option<String> {
        if keywords.is_empty() || !(temperature > 0.0) || top_k == 0 {
            return None;
        }
        let mut hidden = self.hidden_for(keywords);
        let mut input = 0usize;
        let mut result = String::new();
        for _ in 0..=max_len {
            let logits = self.step(input, &mut hidden);
            let token = choose(rng, &logits, temperature, top_k, result.len() < min_len)?;
            if token == 0 {
                return (result.len() >= min_len).then_some(result);
            }
            let character = (b'a' + (token - 1) as u8) as char;
            result.push(character);
            input = token + 1;
            if result.len() == max_len {
                return Some(result);
            }
        }
        None
    }

    pub fn average_log_probability(&self, name: &str, keywords: &[String]) -> f32 {
        let mut hidden = self.hidden_for(keywords);
        let mut input = 0usize;
        let mut total = 0.0;
        let mut count = 0usize;
        for token in name
            .bytes()
            .map(|byte| (byte - b'a' + 1) as usize)
            .chain(std::iter::once(0))
        {
            let logits = self.step(input, &mut hidden);
            total += log_softmax_at(&logits, token);
            count += 1;
            input = token + 1;
        }
        total / count.max(1) as f32
    }

    pub fn logits_after_prefix(
        &self,
        prefix: &str,
        keywords: &[String],
    ) -> Result<Vec<f32>, String> {
        if !prefix.bytes().all(|byte| byte.is_ascii_lowercase()) {
            return Err("parity prefix must contain lowercase ASCII letters".into());
        }
        let mut hidden = self.hidden_for(keywords);
        let mut logits = Vec::new();
        for input in
            std::iter::once(0usize).chain(prefix.bytes().map(|byte| (byte - b'a' + 2) as usize))
        {
            logits = self.step(input, &mut hidden);
        }
        Ok(logits)
    }
}

fn sigmoid(value: f32) -> f32 {
    1.0 / (1.0 + (-value).exp())
}

fn log_softmax_at(logits: &[f32], index: usize) -> f32 {
    let maximum = logits.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let sum: f32 = logits.iter().map(|value| (*value - maximum).exp()).sum();
    logits[index] - maximum - sum.ln()
}

fn choose<R: Rng>(
    rng: &mut R,
    logits: &[f32],
    temperature: f32,
    top_k: usize,
    block_eos: bool,
) -> Option<usize> {
    let mut ordered: Vec<usize> = (0..logits.len())
        .filter(|index| !block_eos || *index != 0)
        .collect();
    ordered.sort_by(|left, right| {
        logits[*right]
            .total_cmp(&logits[*left])
            .then_with(|| left.cmp(right))
    });
    ordered.truncate(top_k.min(ordered.len()));
    let maximum = ordered
        .iter()
        .map(|index| logits[*index] / temperature)
        .fold(f32::NEG_INFINITY, f32::max);
    let weights: Vec<f32> = ordered
        .iter()
        .map(|index| (logits[*index] / temperature - maximum).exp())
        .collect();
    let total: f32 = weights.iter().sum();
    if !total.is_finite() || total <= 0.0 {
        return None;
    }
    let mut draw = rng.gen::<f32>() * total;
    for (index, weight) in ordered.into_iter().zip(weights) {
        if draw <= weight {
            return Some(index);
        }
        draw -= weight;
    }
    None
}
