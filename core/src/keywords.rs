//! Lightweight keyword extraction (simplified RAKE — Rose et al. 2010).
//!
//! RAKE is training-free and language-independent: split text into candidate
//! phrases at stopwords, then score each content word by degree/frequency
//! (words that co-occur in longer phrases score higher). We return the top
//! single words to feed the big-tech blender, so a product description like
//! "app for splitting expenses with friends" yields roots like
//! {split, expense, friend}.

/// Common English function words — phrase delimiters, never keywords.
const STOPWORDS: &[&str] = &[
    "a",
    "an",
    "the",
    "and",
    "or",
    "but",
    "if",
    "then",
    "else",
    "for",
    "to",
    "of",
    "in",
    "on",
    "at",
    "by",
    "with",
    "from",
    "into",
    "onto",
    "up",
    "down",
    "out",
    "over",
    "under",
    "as",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "am",
    "do",
    "does",
    "did",
    "have",
    "has",
    "had",
    "it",
    "its",
    "this",
    "that",
    "these",
    "those",
    "they",
    "them",
    "their",
    "we",
    "us",
    "our",
    "you",
    "your",
    "i",
    "me",
    "my",
    "he",
    "she",
    "his",
    "her",
    "him",
    "who",
    "whom",
    "which",
    "what",
    "when",
    "where",
    "why",
    "how",
    "all",
    "any",
    "some",
    "no",
    "not",
    "can",
    "will",
    "would",
    "should",
    "could",
    "may",
    "might",
    "must",
    "shall",
    "about",
    "between",
    "through",
    "during",
    "without",
    "within",
    "along",
    "across",
    "after",
    "before",
    "than",
    "so",
    "too",
    "very",
    "just",
    "more",
    "most",
    "much",
    "many",
    "such",
    "own",
    "same",
    "other",
    "each",
    "app",
    "application",
    "platform",
    "tool",
    "service",
    "product",
    "system",
    "software",
    "lets",
    "let",
    "help",
    "helps",
    "make",
    "makes",
    "using",
    "use",
    "uses",
    "via",
    "per",
];

fn is_stopword(w: &str) -> bool {
    STOPWORDS.contains(&w)
}

/// Short evocative roots for common product concepts. This is deliberately a
/// small, transparent offline lexicon rather than semantic inference.
fn concept_roots(word: &str) -> &'static [&'static str] {
    match word {
        "name" | "naming" | "brand" | "title" | "word" | "identity" => {
            &["lex", "nym", "nom", "mark", "mint"]
        }
        "developer" | "code" | "coding" | "program" | "programming" | "package" | "library"
        | "cli" | "api" => &["crate", "stack", "byte", "node", "kit"],
        "database" | "db" | "sql" | "query" | "schema" | "table" | "storage" | "store" => {
            &["schema", "query", "table", "store", "base"]
        }
        "migration" | "migrate" => &["shift", "bridge", "relay", "port", "move"],
        "rate" | "limit" | "limiter" | "throttle" | "quota" => {
            &["gate", "meter", "quota", "pace", "guard"]
        }
        "terminal" | "shell" | "console" | "command" | "prompt" => {
            &["term", "shell", "prompt", "cmd", "console"]
        }
        "log" | "logging" | "monitor" | "monitoring" | "observability" | "telemetry" => {
            &["trace", "watch", "scope", "pulse", "beacon"]
        }
        "git" | "repo" | "repository" | "version" | "release" => {
            &["commit", "branch", "tag", "forge", "ship"]
        }
        "cache" | "caching" | "memoize" => &["cache", "stash", "store", "heap", "buffer"],
        "browser" | "bookmark" | "tab" | "web" | "link" => &["tab", "mark", "link", "page", "web"],
        "test" | "testing" | "qa" | "debug" | "bug" | "assert" => {
            &["spec", "check", "probe", "assert", "trace"]
        }
        "cloud" | "deploy" | "deployment" | "server" | "hosting" | "infrastructure" | "infra" => {
            &["cloud", "dock", "ship", "stack", "grid"]
        }
        "queue" | "broker" | "messaging" | "event" | "stream" | "topic" => {
            &["queue", "broker", "stream", "topic", "pipe", "bus"]
        }
        "format" | "formatter" | "lint" | "linter" | "style" => {
            &["format", "lint", "style", "rule", "tidy"]
        }
        "environment" | "env" | "variable" | "config" | "configuration" | "setting"
        | "settings" | "secret" => &["env", "config", "setting", "secret", "value"],
        "filesystem" | "file" | "path" | "directory" | "folder" | "search" | "find" | "index" => {
            &["file", "path", "find", "scan", "index", "seek"]
        }
        "feature" | "flag" | "toggle" | "rollout" => {
            &["flag", "toggle", "switch", "rollout", "gate", "launch"]
        }
        "background" | "job" | "worker" | "scheduler" | "cron" | "timer" => {
            &["job", "task", "worker", "cron", "timer", "run"]
        }
        "dependency" | "dependencies" | "update" | "updater" | "upgrade" | "bump" => {
            &["dep", "bump", "update", "sync", "lock", "version"]
        }
        "documentation" | "docs" | "doc" | "guide" | "manual" | "reference" => {
            &["doc", "guide", "page", "site", "manual"]
        }
        "site" | "website" | "portal" => &["site", "page", "web", "portal", "home"],
        "legal" | "law" | "lawyer" | "attorney" | "court" | "litigation" => {
            &["law", "case", "brief", "clause", "docket", "counsel"]
        }
        "research" | "investigate" | "investigation" | "discovery" => {
            &["source", "proof", "index", "trace", "lens", "scope"]
        }
        "generate" | "generator" | "create" | "creator" | "build" | "builder" => {
            &["forge", "mint", "spark", "seed", "craft"]
        }
        "secure" | "security" | "private" | "privacy" | "password" | "auth" | "encrypt"
        | "encrypted" => &["vault", "guard", "shield", "lock", "cipher"],
        "finance" | "money" | "payment" | "expense" | "budget" | "bank" | "invoice" => {
            &["ledger", "tally", "mint", "vault", "fund"]
        }
        "health" | "fitness" | "workout" | "exercise" | "medical" | "care" => {
            &["pulse", "vital", "thrive", "fit", "care"]
        }
        "write" | "writing" | "journal" | "note" | "document" | "editor" => {
            &["ink", "quill", "draft", "scribe", "note"]
        }
        "mood" | "emotion" | "feeling" => &["mood", "vibe", "aura", "tone", "feel"],
        "friend" | "community" | "social" | "team" | "chat" | "message" => {
            &["kin", "circle", "bond", "link", "tribe"]
        }
        "split" | "share" | "sharing" | "divide" | "settle" => {
            &["split", "share", "fair", "settle", "pool"]
        }
        "data" | "analytic" | "analytics" | "insight" | "metric" => {
            &["signal", "lens", "trace", "scope", "vector"]
        }
        "design" | "color" | "visual" | "creative" => &["hue", "form", "pixel", "canvas", "prism"],
        "task" | "plan" | "schedule" | "calendar" | "focus" | "productivity" => {
            &["focus", "flow", "tempo", "task", "plan"]
        }
        "market" | "marketplace" | "shop" | "sell" | "buy" | "commerce" => {
            &["cart", "trade", "market", "shelf", "bazaar"]
        }
        "vintage" | "retro" | "classic" | "antique" => {
            &["retro", "relic", "classic", "heritage", "timber"]
        }
        "keyboard" | "keyboards" | "typing" | "type" => &["key", "type", "switch", "cap", "board"],
        "travel" | "trip" | "map" | "route" => &["roam", "atlas", "route", "compass", "trek"],
        "photo" | "image" | "video" | "audio" | "music" => {
            &["frame", "reel", "wave", "tune", "echo"]
        }
        "learn" | "education" | "study" | "course" => &["learn", "lore", "study", "skill", "class"],
        "delivery" | "ship" | "shipping" | "logistic" | "logistics" | "transport" => {
            &["route", "fleet", "cargo", "relay", "dock"]
        }
        "ai" | "model" | "agent" | "automation" => &["mind", "synth", "agent", "spark", "neural"],
        "fast" | "speed" | "performance" | "rapid" => &["swift", "dash", "bolt", "flux", "surge"],
        _ => &[],
    }
}

/// Compact adjective palettes for readable two-word names. Unlike the broad
/// adjective corpus, these words are selected to make sense beside the product
/// concepts in the brief (QuietInk, FairTally, SwiftTrace).
fn concept_adjectives(word: &str) -> &'static [&'static str] {
    match word {
        "name" | "naming" | "brand" | "title" | "word" | "identity" => {
            &["clear", "fresh", "prime", "true", "open", "bright"]
        }
        "developer" | "code" | "coding" | "program" | "programming" | "package" | "library"
        | "cli" | "api" => &["open", "native", "prime", "solid", "swift", "clean"],
        "database" | "db" | "sql" | "query" | "schema" | "table" | "storage" | "store" => {
            &["local", "solid", "clear", "fast", "open", "native"]
        }
        "migration" | "migrate" => &["safe", "smooth", "steady", "swift", "clean", "direct"],
        "rate" | "limit" | "limiter" | "throttle" | "quota" => {
            &["fair", "steady", "smart", "safe", "even", "clear"]
        }
        "terminal" | "shell" | "console" | "command" | "prompt" => {
            &["native", "swift", "clean", "open", "dark", "direct"]
        }
        "log" | "logging" | "monitor" | "monitoring" | "observability" | "telemetry" => {
            &["live", "clear", "deep", "sharp", "steady", "open"]
        }
        "git" | "repo" | "repository" | "version" | "release" => {
            &["clean", "open", "ready", "stable", "swift", "prime"]
        }
        "cache" | "caching" | "memoize" => &["fast", "local", "hot", "quick", "smart", "swift"],
        "browser" | "bookmark" | "tab" | "web" | "link" => {
            &["open", "quick", "clear", "smart", "native", "light"]
        }
        "test" | "testing" | "qa" | "debug" | "bug" | "assert" => {
            &["sure", "clean", "exact", "quick", "strict", "solid"]
        }
        "cloud" | "deploy" | "deployment" | "server" | "hosting" | "infrastructure" | "infra" => {
            &["ready", "swift", "steady", "live", "open", "solid"]
        }
        "queue" | "broker" | "messaging" | "event" | "stream" | "topic" => {
            &["live", "steady", "open", "fast", "durable", "direct"]
        }
        "format" | "formatter" | "lint" | "linter" | "style" => {
            &["clean", "exact", "strict", "tidy", "clear", "steady"]
        }
        "environment" | "env" | "variable" | "config" | "configuration" | "setting"
        | "settings" | "secret" => &["local", "safe", "clear", "private", "stable", "ready"],
        "filesystem" | "file" | "path" | "directory" | "folder" | "search" | "find" | "index" => {
            &["local", "quick", "deep", "exact", "smart", "fast"]
        }
        "feature" | "flag" | "toggle" | "rollout" => {
            &["safe", "gradual", "smart", "ready", "live", "steady"]
        }
        "background" | "job" | "worker" | "scheduler" | "cron" | "timer" => {
            &["steady", "timed", "ready", "async", "swift", "reliable"]
        }
        "dependency" | "dependencies" | "update" | "updater" | "upgrade" | "bump" => {
            &["fresh", "safe", "current", "stable", "ready", "clean"]
        }
        "documentation" | "docs" | "doc" | "guide" | "manual" | "reference" => {
            &["clear", "open", "simple", "ready", "living", "helpful"]
        }
        "site" | "website" | "portal" => &["open", "live", "clear", "fast", "public", "bright"],
        "legal" | "law" | "lawyer" | "attorney" | "court" | "litigation" => {
            &["sound", "clear", "exact", "trusted", "proven", "firm"]
        }
        "research" | "investigate" | "investigation" | "discovery" => {
            &["deep", "exact", "clear", "open", "trusted", "focused"]
        }
        "generate" | "generator" | "create" | "creator" | "build" | "builder" => {
            &["fresh", "bright", "bold", "swift", "open", "prime"]
        }
        "secure" | "security" | "private" | "privacy" | "password" | "auth" | "encrypt"
        | "encrypted" => &[
            "safe", "solid", "sure", "sealed", "steady", "trusted", "private", "strong", "secure",
            "hidden", "silent", "iron", "firm", "secret", "inner", "verified", "proven", "guarded",
            "locked", "zero", "core", "deep", "hard", "sound",
        ],
        "finance" | "money" | "payment" | "expense" | "budget" | "bank" | "invoice" => &[
            "fair", "clear", "even", "steady", "shared", "simple", "equal", "balanced", "honest",
            "joint", "mutual", "settled", "easy", "open", "smart", "ready", "clean", "daily",
        ],
        "health" | "fitness" | "workout" | "exercise" | "medical" | "care" => {
            &["vital", "active", "well", "steady", "bright", "daily"]
        }
        "write" | "writing" | "journal" | "note" | "document" | "editor" => {
            &["quiet", "lucid", "daily", "clear", "open", "true"]
        }
        "mood" | "emotion" | "feeling" => &["calm", "vivid", "inner", "lucid", "honest", "gentle"],
        "friend" | "community" | "social" | "team" | "chat" | "message" => {
            &["shared", "trusted", "connected", "close", "open", "united"]
        }
        "split" | "share" | "sharing" | "divide" | "settle" => {
            &["fair", "even", "shared", "equal", "settled", "clear"]
        }
        "data" | "analytic" | "analytics" | "insight" | "metric" => &[
            "clear", "sharp", "live", "direct", "exact", "bright", "deep", "smart", "real",
            "fresh", "prime", "focused", "active", "clean", "pure", "open", "agile", "ready",
            "lucid", "keen", "steady", "wise", "core", "total",
        ],
        "design" | "color" | "visual" | "creative" => {
            &["vivid", "clear", "bold", "bright", "pure", "fresh"]
        }
        "task" | "plan" | "schedule" | "calendar" | "focus" | "productivity" => {
            &["clear", "steady", "daily", "focused", "simple", "swift"]
        }
        "market" | "marketplace" | "shop" | "sell" | "buy" | "commerce" => {
            &["rare", "prime", "open", "local", "select", "curated"]
        }
        "vintage" | "retro" | "classic" | "antique" => &[
            "retro", "classic", "heritage", "timeless", "tactile", "rare",
        ],
        "keyboard" | "keyboards" | "typing" | "type" => {
            &["tactile", "clicky", "custom", "quiet", "classic", "select"]
        }
        "travel" | "trip" | "map" | "route" => &["open", "wild", "free", "local", "far", "direct"],
        "photo" | "image" | "video" | "audio" | "music" => {
            &["vivid", "clear", "live", "deep", "pure", "sonic"]
        }
        "learn" | "education" | "study" | "course" => {
            &["bright", "clear", "open", "smart", "deep", "daily"]
        }
        "delivery" | "ship" | "shipping" | "logistic" | "logistics" | "transport" => {
            &["swift", "direct", "ready", "steady", "rapid", "local"]
        }
        "ai" | "model" | "agent" | "automation" => {
            &["smart", "native", "open", "clear", "deep", "bright"]
        }
        "fast" | "speed" | "performance" | "rapid" => {
            &["swift", "rapid", "live", "quick", "instant", "sharp"]
        }
        _ => &[],
    }
}

const GENERAL_COMPOUND_ADJECTIVES: &[&str] = &[
    "clear", "bright", "bold", "open", "prime", "simple", "swift", "pure", "fresh", "smart",
    "vivid", "lucid", "native", "ready", "steady", "direct", "modern", "novel", "rare", "vital",
    "agile", "wise", "solid", "calm", "new", "top", "key", "one", "true", "core",
];

/// Return the focused adjective pool for a Compound first page. Unknown
/// domains use the restrained general palette instead of the whimsical corpus.
pub fn compound_adjectives(keywords: &[String]) -> Vec<&'static str> {
    let has_product_concept = keywords.iter().any(|keyword| {
        !matches!(keyword.as_str(), "friend" | "team") && !concept_adjectives(keyword).is_empty()
    });
    let mut ordered_keywords: Vec<(u8, usize, &String)> = keywords
        .iter()
        .enumerate()
        .map(|(index, keyword)| (concept_position(keyword), index, keyword))
        .collect();
    ordered_keywords.sort_by_key(|(position, index, _)| (*position, *index));

    let mut adjectives = Vec::new();
    for (_, _, keyword) in ordered_keywords {
        if has_product_concept && matches!(keyword.as_str(), "friend" | "team") {
            continue;
        }
        for &adjective in concept_adjectives(keyword) {
            if !adjectives.contains(&adjective) {
                adjectives.push(adjective);
            }
            if adjectives.len() == 30 {
                return adjectives;
            }
        }
    }
    if adjectives.is_empty() {
        adjectives.extend_from_slice(GENERAL_COMPOUND_ADJECTIVES);
    }
    adjectives
}

/// Broaden a known domain for long requests and Load more. The domain words
/// remain first; a restrained neutral tail supplies capacity without reopening
/// the broad corpus used by promptless exploration.
pub fn compound_continuation_adjectives(keywords: &[String]) -> Vec<&'static str> {
    let mut adjectives = compound_adjectives(keywords);
    for &adjective in GENERAL_COMPOUND_ADJECTIVES {
        if !adjectives.contains(&adjective) {
            adjectives.push(adjective);
        }
        if adjectives.len() == 30 {
            break;
        }
    }
    adjectives
}

fn is_cross_concept_modifier(word: &str) -> bool {
    matches!(
        word,
        "mood"
            | "emotion"
            | "feeling"
            | "split"
            | "share"
            | "sharing"
            | "divide"
            | "settle"
            | "vintage"
            | "retro"
            | "classic"
            | "antique"
            | "fast"
            | "speed"
            | "performance"
            | "rapid"
            | "migration"
            | "migrate"
            | "terminal"
    )
}

/// Detect adjective–noun pairs that visibly repeat the same lexical stem.
/// This stays narrower than a semantic-similarity rule so legitimate
/// alliteration such as FairHair is not rejected with obvious echoes such as
/// TimedTimer.
pub fn compound_pair_has_lexical_echo(adjective: &str, noun: &str) -> bool {
    let adjective = adjective.to_ascii_lowercase();
    let noun = noun.to_ascii_lowercase();
    if adjective == noun {
        return true;
    }

    let shorter = adjective.len().min(noun.len());
    if shorter < 4 {
        return false;
    }
    if adjective.starts_with(&noun) || noun.starts_with(&adjective) {
        return true;
    }

    let shared_prefix = adjective
        .bytes()
        .zip(noun.bytes())
        .take_while(|(left, right)| left == right)
        .count();
    shared_prefix >= 4 && adjective.len() - shared_prefix <= 2 && noun.len() - shared_prefix <= 2
}

/// Check whether a Compound adjective and noun express compatible parts of
/// the brief. Modifiers such as Retro, Fair, Vivid, and Swift may describe any
/// product noun; other adjectives stay with the concept that supplied them.
pub fn compound_pair_is_coherent(
    adjective: &str,
    noun: &str,
    keywords: &[String],
    allow_general: bool,
) -> bool {
    let has_known_concept = keywords
        .iter()
        .any(|keyword| !concept_adjectives(keyword).is_empty());
    if !has_known_concept {
        return true;
    }
    if !compound_roots(keywords, 16).iter().any(|root| root == noun) {
        return false;
    }

    for keyword in keywords {
        if !concept_adjectives(keyword).contains(&adjective) {
            continue;
        }
        let owns_noun = (!suppress_literal_root(keyword) && keyword == noun)
            || concept_roots(keyword).contains(&noun);
        if owns_noun || is_cross_concept_modifier(keyword) {
            return true;
        }
    }

    allow_general && GENERAL_COMPOUND_ADJECTIVES.contains(&adjective)
}

fn is_dev_artifact(word: &str) -> bool {
    matches!(
        word,
        "developer"
            | "code"
            | "coding"
            | "program"
            | "programming"
            | "package"
            | "library"
            | "cli"
            | "api"
            | "client"
            | "service"
    )
}

fn is_specialized_dev_domain(word: &str) -> bool {
    matches!(
        word,
        "database"
            | "db"
            | "sql"
            | "query"
            | "schema"
            | "table"
            | "storage"
            | "store"
            | "migration"
            | "migrate"
            | "rate"
            | "limit"
            | "limiter"
            | "throttle"
            | "quota"
            | "terminal"
            | "shell"
            | "console"
            | "command"
            | "prompt"
            | "log"
            | "logging"
            | "monitor"
            | "monitoring"
            | "observability"
            | "telemetry"
            | "git"
            | "repo"
            | "repository"
            | "version"
            | "release"
            | "cache"
            | "caching"
            | "memoize"
            | "browser"
            | "bookmark"
            | "tab"
            | "web"
            | "link"
            | "test"
            | "testing"
            | "qa"
            | "debug"
            | "bug"
            | "assert"
            | "cloud"
            | "deploy"
            | "deployment"
            | "server"
            | "hosting"
            | "infrastructure"
            | "infra"
            | "queue"
            | "broker"
            | "messaging"
            | "event"
            | "stream"
            | "topic"
            | "format"
            | "formatter"
            | "lint"
            | "linter"
            | "style"
            | "environment"
            | "env"
            | "variable"
            | "config"
            | "configuration"
            | "setting"
            | "settings"
            | "secret"
            | "filesystem"
            | "file"
            | "path"
            | "directory"
            | "folder"
            | "search"
            | "find"
            | "index"
            | "feature"
            | "flag"
            | "toggle"
            | "rollout"
            | "background"
            | "job"
            | "worker"
            | "scheduler"
            | "cron"
            | "timer"
            | "dependency"
            | "dependencies"
            | "update"
            | "updater"
            | "upgrade"
            | "bump"
            | "documentation"
            | "docs"
            | "doc"
            | "guide"
            | "manual"
            | "reference"
            | "site"
            | "website"
            | "portal"
    )
}

/// Noun roots for Compound mode. Audience terms ("for teams", "with friends")
/// and speed claims work better as context/adjectives than as the noun half of
/// a product name, provided the brief contains a stronger product concept.
pub fn compound_roots(keywords: &[String], limit: usize) -> Vec<String> {
    let has_analytics = keywords.iter().any(|keyword| {
        matches!(
            keyword.as_str(),
            "data" | "analytic" | "analytics" | "insight" | "metric"
        )
    });
    let has_specialized_dev_domain = keywords
        .iter()
        .any(|keyword| is_specialized_dev_domain(keyword));
    let has_source_control = keywords.iter().any(|keyword| {
        matches!(
            keyword.as_str(),
            "git" | "repo" | "repository" | "version" | "release"
        )
    });
    let has_queue_domain = keywords.iter().any(|keyword| {
        matches!(
            keyword.as_str(),
            "queue" | "broker" | "messaging" | "event" | "stream" | "topic"
        )
    });
    let has_dependency_domain = keywords.iter().any(|keyword| {
        matches!(
            keyword.as_str(),
            "dependency" | "dependencies" | "update" | "updater" | "upgrade" | "bump"
        )
    });
    let has_docs_domain = keywords.iter().any(|keyword| {
        matches!(
            keyword.as_str(),
            "documentation"
                | "docs"
                | "doc"
                | "guide"
                | "manual"
                | "reference"
                | "site"
                | "website"
                | "portal"
        )
    });
    let product_keywords: Vec<String> = keywords
        .iter()
        .filter(|keyword| {
            !matches!(
                keyword.as_str(),
                "friend" | "team" | "fast" | "speed" | "performance" | "rapid"
            ) && !(has_analytics && keyword.as_str() == "api")
                && !(has_specialized_dev_domain && is_dev_artifact(keyword))
                && !(has_source_control && keyword.as_str() == "automation")
                && !(has_queue_domain && keyword.as_str() == "message")
                && !(has_dependency_domain && keyword.as_str() == "automation")
                && !(has_docs_domain
                    && matches!(
                        keyword.as_str(),
                        "generate" | "generator" | "create" | "creator" | "build" | "builder"
                    ))
        })
        .cloned()
        .collect();

    let mut roots = brand_roots(&product_keywords, limit);
    if roots.is_empty() {
        roots = brand_roots(keywords, limit);
    }
    roots.retain(|root| !matches!(root.as_str(), "retro" | "classic" | "fair" | "swift"));
    if keywords.iter().any(|keyword| keyword == "expense") {
        roots.retain(|root| !matches!(root.as_str(), "mint" | "vault"));
    }
    roots
}

/// Artifact words are informative in a brief but weak literal naming roots.
/// Their concept expansions remain, avoiding Dev-/Gen-/Pack- stem walls.
fn suppress_literal_root(word: &str) -> bool {
    !concept_roots(word).is_empty()
        || matches!(
            word,
            "project"
                | "manager"
                | "dashboard"
                | "viewer"
                | "inspector"
                | "toolkit"
                | "planner"
                | "client"
                | "service"
        )
}

/// Preferred order inside a coined compound: modifiers first, core domain
/// metaphors next, product function/context last. This encodes the difference
/// between RetroKey and KeyRetro, or InkLens and LensInk, without an LLM.
fn concept_position(word: &str) -> u8 {
    match word {
        "name" | "naming" | "brand" | "title" | "word" | "identity" | "mood" | "emotion"
        | "feeling" | "split" | "share" | "sharing" | "divide" | "settle" | "vintage" | "retro"
        | "classic" | "antique" | "fast" | "speed" | "performance" | "rapid" => 0,
        "migration" | "migrate" | "rate" | "limit" | "limiter" | "throttle" | "terminal"
        | "git" | "release" | "test" | "testing" | "qa" | "debug" | "cloud" | "deploy"
        | "deployment" | "queue" | "broker" | "messaging" | "event" | "stream" | "topic"
        | "format" | "formatter" | "lint" | "linter" | "style" | "environment" | "env"
        | "variable" | "config" | "configuration" | "setting" | "settings" | "secret"
        | "filesystem" | "file" | "path" | "directory" | "folder" | "search" | "find" | "index"
        | "feature" | "flag" | "toggle" | "rollout" | "background" | "job" | "worker"
        | "scheduler" | "cron" | "timer" | "dependency" | "dependencies" | "update" | "updater"
        | "upgrade" | "bump" | "documentation" | "docs" | "doc" | "guide" | "manual"
        | "reference" | "site" | "website" | "portal" => 0,
        "generate" | "generator" | "create" | "creator" | "build" | "builder" | "friend"
        | "community" | "social" | "team" | "chat" | "message" | "data" | "analytic"
        | "analytics" | "insight" | "metric" | "market" | "marketplace" | "shop" | "sell"
        | "buy" | "commerce" => 2,
        _ => 1,
    }
}

/// Expand extracted keywords into distinct semantic groups. Keeping groups
/// separate lets the generator combine *different ideas* (Ink + Lens) instead
/// of accidentally pairing synonyms from one idea (Lens + Scope).
pub fn brand_root_groups(keywords: &[String], limit: usize) -> Vec<Vec<String>> {
    let has_queue_domain = keywords.iter().any(|keyword| {
        matches!(
            keyword.as_str(),
            "queue" | "broker" | "messaging" | "event" | "stream" | "topic"
        )
    });
    let has_dependency_domain = keywords.iter().any(|keyword| {
        matches!(
            keyword.as_str(),
            "dependency" | "dependencies" | "update" | "updater" | "upgrade" | "bump"
        )
    });
    let mut positioned_groups = Vec::new();
    let mut seen = Vec::new();
    for (source_order, keyword) in keywords.iter().enumerate() {
        if seen.len() == limit {
            break;
        }
        if (has_queue_domain && keyword == "message")
            || (has_dependency_domain && keyword == "automation")
        {
            continue;
        }
        let mut group = Vec::new();
        if !suppress_literal_root(keyword) && !seen.contains(keyword) {
            group.push(keyword.clone());
        }
        for &root in concept_roots(keyword) {
            let root = root.to_string();
            if !seen.contains(&root) && !group.contains(&root) {
                group.push(root);
            }
        }
        group.truncate(limit - seen.len());
        if !group.is_empty() {
            seen.extend(group.iter().cloned());
            positioned_groups.push((concept_position(keyword), source_order, group));
        }
    }
    positioned_groups.sort_by_key(|(position, source_order, _)| (*position, *source_order));
    positioned_groups
        .into_iter()
        .map(|(_, _, group)| group)
        .collect()
}

/// Flatten semantic groups for callers that only need the candidate root pool.
pub fn brand_roots(keywords: &[String], limit: usize) -> Vec<String> {
    brand_root_groups(keywords, limit)
        .into_iter()
        .flatten()
        .collect()
}

/// Meaningful 2-letter tokens that survive the min-length cut ("AI tool for
/// lawyers" must keep "ai", not just "lawyers").
const SHORT_KEEP: &[&str] = &["ai", "ml", "ar", "vr"];

/// Light inflection stripper — just enough that "journaling"/"keyboards" feed
/// the blender as "journal"/"keyboard". Deliberately not a Porter stemmer:
/// each rule is pinned by a test and nothing else is touched.
fn stem(word: &str) -> String {
    let mut w = word.to_string();
    if let Some(base) = w.strip_suffix("ing") {
        if base.len() >= 3 {
            let b: Vec<char> = base.chars().collect();
            let n = b.len();
            // splitting → split (undouble a final consonant pair)
            if n >= 2 && b[n - 1] == b[n - 2] && !"aeiou".contains(b[n - 1]) {
                w = base[..n - 1].to_string();
            } else {
                w = base.to_string();
            }
        }
    } else if let Some(base) = w.strip_suffix("ies") {
        if base.len() >= 2 {
            w = format!("{base}y"); // companies → company
        }
    } else if w.ends_with("sses")
        || w.ends_with("xes")
        || w.ends_with("zes")
        || w.ends_with("ches")
        || w.ends_with("shes")
    {
        w.truncate(w.len() - 2); // -es after a sibilant: boxes → box, glasses → glass
                                 // ("expenses" falls through to the plain -s rule below → "expense")
    } else if w.ends_with('s') && !w.ends_with("ss") && w.len() >= 4 {
        w.truncate(w.len() - 1); // keyboards → keyboard
    }
    w
}

/// Extract up to `limit` keyword stems from `text`, ranked by RAKE word score.
pub fn extract_keywords(text: &str, limit: usize) -> Vec<String> {
    let lower = text.to_lowercase();

    // Tokenize, then split into candidate phrases at stopwords / non-alpha breaks.
    let mut phrases: Vec<Vec<String>> = Vec::new();
    let mut current: Vec<String> = Vec::new();
    for raw in lower.split(|c: char| !c.is_ascii_alphabetic()) {
        if raw.is_empty() {
            continue;
        }
        if is_stopword(raw) || (raw.len() < 3 && !SHORT_KEEP.contains(&raw)) {
            if !current.is_empty() {
                phrases.push(std::mem::take(&mut current));
            }
        } else {
            current.push(raw.to_string());
        }
    }
    if !current.is_empty() {
        phrases.push(current);
    }

    // RAKE word scoring: score(w) = degree(w) / frequency(w).
    use std::collections::HashMap;
    let mut freq: HashMap<&str, f64> = HashMap::new();
    let mut degree: HashMap<&str, f64> = HashMap::new();
    for phrase in &phrases {
        let plen = phrase.len() as f64;
        for w in phrase {
            *freq.entry(w.as_str()).or_insert(0.0) += 1.0;
            *degree.entry(w.as_str()).or_insert(0.0) += plen;
        }
    }

    let mut scored: Vec<(&str, f64)> = freq.keys().map(|&w| (w, degree[w] / freq[w])).collect();
    // Sort by score desc, then alphabetically for determinism.
    scored.sort_by(|a, b| {
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.0.cmp(b.0))
    });

    // Stem the winners (journaling → journal) and dedupe post-stem collisions
    // ("keyboard" and "keyboards" must not both feed the blender).
    let mut out: Vec<String> = Vec::new();
    for (w, _) in scored {
        let s = stem(w);
        if !out.contains(&s) {
            out.push(s);
        }
        if out.len() == limit {
            break;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_content_words() {
        let kws = extract_keywords("an app for splitting expenses with friends", 5);
        assert!(kws.iter().any(|k| k == "split"));
        assert!(kws.iter().any(|k| k == "expense"));
        assert!(kws.iter().any(|k| k == "friend"));
        // stopwords excluded
        assert!(!kws.iter().any(|k| k == "an" || k == "for" || k == "with"));
    }

    #[test]
    fn stems_inflections() {
        assert_eq!(stem("journaling"), "journal");
        assert_eq!(stem("keyboards"), "keyboard");
        assert_eq!(stem("splitting"), "split");
        assert_eq!(stem("tracking"), "track");
        assert_eq!(stem("companies"), "company");
        assert_eq!(stem("expenses"), "expense");
        assert_eq!(stem("boxes"), "box");
        // not mangled: -ss kept, short -ing words kept
        assert_eq!(stem("fitness"), "fitness");
        assert_eq!(stem("king"), "king");
        assert_eq!(stem("mood"), "mood");
    }

    #[test]
    fn keeps_ai() {
        let kws = extract_keywords("AI tool for lawyers", 5);
        assert!(kws.iter().any(|k| k == "ai"), "{kws:?}");
        assert!(kws.iter().any(|k| k == "lawyer"), "{kws:?}");
    }

    #[test]
    fn dedupes_stems() {
        // "keyboard" and "keyboards" must collapse to one root.
        let kws = extract_keywords("keyboard layouts for keyboards", 5);
        assert_eq!(
            kws.iter().filter(|k| *k == "keyboard").count(),
            1,
            "{kws:?}"
        );
    }

    #[test]
    fn empty_text_yields_nothing() {
        assert!(extract_keywords("", 5).is_empty());
        assert!(extract_keywords("the and or with", 5).is_empty());
    }

    #[test]
    fn respects_limit() {
        let kws = extract_keywords("fast secure private encrypted messaging chat network", 3);
        assert_eq!(kws.len(), 3);
    }

    #[test]
    fn expands_generic_dev_brief_into_brand_roots() {
        let kws = extract_keywords(
            "a developer tool that generates names for packages CLIs libraries and projects",
            8,
        );
        let roots = brand_roots(&kws, 16);
        assert!(roots.iter().any(|r| r == "lex" || r == "nym"));
        assert!(roots.iter().any(|r| r == "crate" || r == "stack"));
        assert!(roots.iter().any(|r| r == "forge" || r == "mint"));
        assert!(!roots.iter().any(|r| r == "developer" || r == "package"));
    }

    #[test]
    fn keeps_unknown_domain_words() {
        let roots = brand_roots(&["vintage".into(), "keyboard".into()], 12);
        assert!(roots.contains(&"retro".to_string()));
        assert!(roots.contains(&"key".to_string()));
    }

    #[test]
    fn keeps_distinct_concepts_in_separate_groups() {
        let groups = brand_root_groups(&["journal".into(), "insight".into()], 12);
        assert_eq!(groups.len(), 2);
        assert!(groups[0].contains(&"ink".to_string()));
        assert!(groups[1].contains(&"lens".to_string()));
    }

    #[test]
    fn orders_modifier_domain_then_function() {
        let groups = brand_root_groups(
            &["marketplace".into(), "keyboard".into(), "vintage".into()],
            16,
        );
        assert!(groups[0].contains(&"retro".to_string()));
        assert!(groups[1].contains(&"key".to_string()));
        assert!(groups[2].contains(&"bazaar".to_string()));
    }

    #[test]
    fn compound_adjectives_follow_the_brief() {
        let journal = compound_adjectives(&["journal".into(), "mood".into()]);
        assert!(journal.contains(&"quiet"));
        assert!(journal.contains(&"lucid"));

        let security = compound_adjectives(&["password".into(), "team".into()]);
        assert!(security.contains(&"safe"));
        assert!(security.contains(&"trusted"));
    }

    #[test]
    fn compound_adjectives_have_a_restrained_fallback() {
        let adjectives = compound_adjectives(&["plumber".into()]);
        assert_eq!(adjectives.len(), 30);
        assert_eq!(
            &adjectives[..8],
            ["clear", "bright", "bold", "open", "prime", "simple", "swift", "pure"]
        );
    }

    #[test]
    fn compound_continuation_broadens_only_after_the_focused_palette() {
        let keywords = ["fitness".into()];
        let focused = compound_adjectives(&keywords);
        let continued = compound_continuation_adjectives(&keywords);
        assert_eq!(
            focused,
            ["vital", "active", "well", "steady", "bright", "daily"]
        );
        assert_eq!(&continued[..focused.len()], focused);
        assert_eq!(continued.len(), 30);
    }

    #[test]
    fn compound_pairing_keeps_roles_coherent() {
        let dev = ["name".into(), "developer".into(), "generate".into()];
        assert!(compound_pair_is_coherent("prime", "lex", &dev, false));
        assert!(compound_pair_is_coherent("open", "forge", &dev, false));
        assert!(!compound_pair_is_coherent("bold", "nom", &dev, false));

        let journal = ["mood".into(), "journal".into(), "insight".into()];
        assert!(compound_pair_is_coherent("vivid", "lens", &journal, false));
        assert!(!compound_pair_is_coherent("smart", "ink", &journal, false));
        assert!(compound_pair_is_coherent("smart", "ink", &journal, true));
    }

    #[test]
    fn compound_lexical_echoes_stay_narrow() {
        assert!(compound_pair_has_lexical_echo("timed", "timer"));
        assert!(compound_pair_has_lexical_echo("clear", "clearly"));
        assert!(compound_pair_has_lexical_echo("tidy", "tidy"));
        assert!(!compound_pair_has_lexical_echo("fair", "hair"));
        assert!(!compound_pair_has_lexical_echo("prime", "print"));
        assert!(!compound_pair_has_lexical_echo("quiet", "ink"));
    }

    #[test]
    fn compound_roots_drop_audience_and_modifier_terms() {
        let security = compound_roots(
            &[
                "manager".into(),
                "password".into(),
                "secure".into(),
                "team".into(),
            ],
            16,
        );
        assert!(security.contains(&"vault".to_string()));
        assert!(!security.contains(&"kin".to_string()));

        let analytics = compound_roots(
            &[
                "analytics".into(),
                "fast".into(),
                "api".into(),
                "performance".into(),
            ],
            16,
        );
        assert!(analytics.contains(&"signal".to_string()));
        assert!(!analytics.contains(&"bolt".to_string()));
    }

    #[test]
    fn expands_held_out_developer_domains() {
        let database = extract_keywords("a CLI for database migrations", 6);
        let database_roots = brand_roots(&database, 16);
        assert!(database_roots.iter().any(|root| root == "schema"));
        assert!(database_roots.iter().any(|root| root == "bridge"));
        assert!(!database_roots.iter().any(|root| root == "database"));

        let testing = extract_keywords("an API testing toolkit", 6);
        let testing_roots = brand_roots(&testing, 16);
        assert!(testing_roots.iter().any(|root| root == "spec"));
        assert!(testing_roots.iter().any(|root| root == "probe"));
    }

    #[test]
    fn dev_domain_modifiers_pair_with_domain_nouns() {
        let database = ["migration".into(), "database".into(), "cli".into()];
        assert!(compound_pair_is_coherent(
            "safe", "schema", &database, false
        ));
        assert!(compound_pair_is_coherent(
            "native", "query", &database, false
        ));

        let terminal = ["terminal".into(), "log".into()];
        assert!(compound_pair_is_coherent(
            "native", "trace", &terminal, false
        ));
    }

    #[test]
    fn compound_prefers_specialized_dev_nouns_over_artifacts() {
        let database = extract_keywords("a CLI for database migrations", 6);
        let database_roots = compound_roots(&database, 16);
        assert!(database_roots.contains(&"schema".to_string()));
        assert!(!database_roots.contains(&"crate".to_string()));

        let testing = extract_keywords("an API testing toolkit", 6);
        let testing_roots = compound_roots(&testing, 16);
        assert!(testing_roots.contains(&"spec".to_string()));
        assert!(!testing_roots.contains(&"stack".to_string()));

        let git = extract_keywords("git release automation", 6);
        let git_roots = compound_roots(&git, 16);
        assert!(git_roots.contains(&"commit".to_string()));
        assert!(!git_roots.contains(&"agent".to_string()));
    }

    #[test]
    fn expands_second_wave_developer_domains() {
        for (prompt, marker) in [
            ("a message queue client", "queue"),
            ("a code formatter and linter", "lint"),
            ("an environment variable manager", "config"),
            ("a filesystem search CLI", "path"),
            ("a feature flag service", "toggle"),
            ("a background job scheduler", "cron"),
            ("dependency update automation", "dep"),
            ("a documentation site generator", "doc"),
        ] {
            let keywords = extract_keywords(prompt, 6);
            let roots = brand_roots(&keywords, 16);
            assert!(roots.contains(&marker.to_string()), "{prompt}: {roots:?}");
        }
    }

    #[test]
    fn specialized_context_drops_misleading_generic_concepts() {
        let queue = extract_keywords("a message queue client", 6);
        let queue_roots = compound_roots(&queue, 16);
        assert!(queue_roots.contains(&"queue".to_string()));
        assert!(!queue_roots.contains(&"kin".to_string()));
        assert!(!queue_roots.contains(&"client".to_string()));

        let dependency = extract_keywords("dependency update automation", 6);
        let dependency_roots = compound_roots(&dependency, 16);
        assert!(dependency_roots.contains(&"dep".to_string()));
        assert!(!dependency_roots.contains(&"agent".to_string()));

        let formatter = extract_keywords("a code formatter and linter", 6);
        let formatter_roots = compound_roots(&formatter, 16);
        assert!(formatter_roots.contains(&"lint".to_string()));
        assert!(!formatter_roots.contains(&"crate".to_string()));
    }

    #[test]
    fn expands_legal_research_into_distinct_concepts() {
        let keywords = extract_keywords("legal research", 6);
        let groups = brand_root_groups(&keywords, 16);
        assert_eq!(groups.len(), 2);
        assert!(groups[0].contains(&"case".to_string()));
        assert!(groups[0].contains(&"clause".to_string()));
        assert!(groups[1].contains(&"source".to_string()));
        assert!(groups[1].contains(&"proof".to_string()));

        let roots = compound_roots(&keywords, 16);
        assert!(roots.contains(&"docket".to_string()));
        assert!(roots.contains(&"lens".to_string()));
        assert!(!roots.contains(&"legal".to_string()));
        assert!(!roots.contains(&"research".to_string()));
    }
}
