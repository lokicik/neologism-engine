use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Style {
    BigTech,
    SciFi,
    Fantasy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub style: Style,
    #[serde(default = "default_count")]
    pub count: usize,
    #[serde(default = "default_min")]
    pub min_len: usize,
    #[serde(default = "default_max")]
    pub max_len: usize,
    /// 0.0 = conservative, 1.0 = wild
    #[serde(default = "default_temperature")]
    pub temperature: f64,
    pub seed: Option<u64>,
    /// Seed words for big-tech blending (e.g. ["pin","interest"])
    #[serde(default)]
    pub roots: Vec<String>,
    /// Optional sub-style for sci-fi/fantasy (e.g. "elvish", "alien").
    pub variant: Option<String>,
    /// Optional product description for big-tech naming; keywords become blend roots.
    pub description: Option<String>,
}

fn default_count() -> usize { 10 }
fn default_min() -> usize { 4 }
fn default_max() -> usize { 12 }
fn default_temperature() -> f64 { 0.7 }

impl Default for Config {
    fn default() -> Self {
        Self {
            style: Style::BigTech,
            count: default_count(),
            min_len: default_min(),
            max_len: default_max(),
            temperature: default_temperature(),
            seed: None,
            roots: vec![],
            variant: None,
            description: None,
        }
    }
}
