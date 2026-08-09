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
        "npm" | "pypi" | "crate" | "registry" | "namespace" => {
            &["scope", "key", "tag", "alias", "slug"]
        }
        "availability" | "available" => &["scope", "open", "clear", "ready", "free"],
        "database" | "db" | "sql" | "query" | "schema" | "table" | "storage" | "store" => &[
            "schema", "query", "table", "store", "base", "data", "record", "row", "field", "index",
        ],
        "migration" | "migrate" => &["shift", "bridge", "relay", "port", "move"],
        "rate" | "limit" | "limiter" | "throttle" | "quota" => {
            &["gate", "meter", "quota", "pace", "burst"]
        }
        "terminal" | "shell" | "console" | "command" | "prompt" => {
            &["term", "shell", "prompt", "cmd", "console"]
        }
        "log" | "logging" | "monitor" | "monitoring" | "observability" | "telemetry" => {
            &["trace", "watch", "scope", "pulse", "beacon"]
        }
        "git" | "repo" | "repository" | "version" | "release" => {
            &["commit", "branch", "tag", "forge", "push", "patch"]
        }
        "cache" | "caching" | "memoize" => &["cache", "stash", "store", "heap", "buffer"],
        "browser" | "bookmark" | "tab" | "web" | "link" => {
            &["tab", "pin", "clip", "ribbon", "star"]
        }
        "test" | "testing" | "qa" | "debug" | "bug" | "assert" => {
            &["spec", "check", "probe", "assert", "trace"]
        }
        "cloud" | "deploy" | "deployment" | "server" | "hosting" | "infrastructure" | "infra" => {
            &["cloud", "dock", "ship", "stack", "grid"]
        }
        "queue" | "broker" | "messaging" | "stream" | "topic" | "bus" => {
            &["queue", "broker", "stream", "topic", "pipe", "bus"]
        }
        "format" | "formatter" | "lint" | "linter" | "style" => &[
            "format", "lint", "style", "rule", "tidy", "syntax", "indent", "align",
        ],
        "environment" | "env" | "variable" | "config" | "configuration" | "setting"
        | "settings" | "secret" => &["env", "config", "dot", "secret", "var", "param"],
        "filesystem" | "file" | "path" | "directory" | "folder" | "search" | "find" | "index" => {
            &["file", "path", "find", "scan", "index", "seek"]
        }
        "feature" | "flag" | "toggle" | "rollout" => {
            &["flag", "toggle", "switch", "rollout", "gate", "launch"]
        }
        "background" | "job" | "worker" | "scheduler" | "cron" | "timer" => {
            &["job", "tick", "worker", "cron", "timer", "run"]
        }
        "dependency" | "dependencies" | "update" | "updater" | "upgrade" | "bump" => &[
            "dep", "bump", "update", "sync", "graph", "module", "version",
        ],
        "documentation" | "docs" | "doc" | "guide" | "manual" | "reference" => {
            &["doc", "guide", "page", "site", "manual"]
        }
        "site" | "website" | "portal" => &["site", "page", "web", "portal", "home"],
        "legal" | "law" | "lawyer" | "attorney" | "court" | "litigation" => {
            &["law", "case", "brief", "clause", "jury", "docket"]
        }
        "research" | "investigate" | "investigation" => {
            &["source", "proof", "trace", "lens", "cite"]
        }
        "hire" | "recruit" | "recruiter" | "candidate" | "applicant" | "talent" => {
            &["talent", "role", "hire", "scout", "match", "crew"]
        }
        "meal" | "recipe" | "menu" | "grocery" | "cook" | "kitchen" => {
            &["dish", "plate", "pantry", "menu", "meal", "table"]
        }
        "inventory" | "catalog" | "belonging" | "household" => {
            &["item", "stock", "count", "catalog", "asset", "keep"]
        }
        "support" | "helpdesk" | "inbox" => {
            &["desk", "reply", "inbox", "resolve", "assist", "answer"]
        }
        "estate" | "property" | "listing" | "realtor" | "housing" => {
            &["home", "key", "door", "nest", "roof", "place"]
        }
        "event" | "conference" | "attendee" | "venue" => {
            &["event", "ticket", "stage", "venue", "guest", "pass"]
        }
        "weather" | "forecast" | "rain" | "temperature" | "climate" | "storm" => {
            &["sky", "cloud", "rain", "storm", "breeze", "sun"]
        }
        "habit" | "routine" | "streak" | "ritual" => {
            &["habit", "routine", "streak", "ritual", "daily", "rhythm"]
        }
        "crm" | "sale" | "lead" | "deal" => &[
            "lead", "deal", "sale", "close", "client", "contact", "growth",
        ],
        "meditation" | "meditate" | "sleep" | "breath" | "rest" => {
            &["calm", "breath", "still", "rest", "dream", "pause"]
        }
        "pet" | "animal" | "vet" | "veterinary" => &["paw", "tail", "pet", "vet", "vital", "buddy"],
        "generate" | "generator" | "create" | "creator" | "build" | "builder" => {
            &["forge", "mint", "spark", "seed", "craft"]
        }
        "secure" | "security" | "private" | "privacy" | "password" | "auth" | "encrypt"
        | "encrypted" => &["vault", "guard", "shield", "lock", "cipher"],
        "finance" | "money" | "payment" | "expense" | "budget" | "bank" | "invoice" => {
            &["ledger", "tally", "coin", "cash", "fund", "balance"]
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
        "color" | "palette" => &["hue", "tone", "tint", "pixel", "canvas", "prism"],
        "design" | "visual" | "creative" => &["hue", "form", "pixel", "canvas", "prism"],
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
        "learn" | "education" | "study" | "course" => {
            &["learn", "lore", "sage", "quiz", "study", "skill"]
        }
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
        "npm" | "pypi" | "crate" | "registry" | "namespace" | "availability" | "available" => {
            &["open", "free", "clear", "ready", "unique", "fresh"]
        }
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
        "queue" | "broker" | "messaging" | "stream" | "topic" | "bus" => {
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
        "research" | "investigate" | "investigation" => {
            &["deep", "exact", "clear", "open", "trusted", "focused"]
        }
        "hire" | "recruit" | "recruiter" | "candidate" | "applicant" | "talent" => {
            &["bright", "trusted", "ready", "open", "select", "proven"]
        }
        "meal" | "recipe" | "menu" | "grocery" | "cook" | "kitchen" => {
            &["fresh", "daily", "simple", "shared", "warm", "tasty"]
        }
        "inventory" | "catalog" | "belonging" | "household" => {
            &["tidy", "clear", "ready", "local", "smart", "sorted"]
        }
        "support" | "helpdesk" | "inbox" => {
            &["helpful", "quick", "clear", "ready", "human", "trusted"]
        }
        "estate" | "property" | "listing" | "realtor" | "housing" => {
            &["local", "open", "prime", "trusted", "bright", "true"]
        }
        "event" | "conference" | "attendee" | "venue" => {
            &["live", "open", "social", "local", "vivid", "shared"]
        }
        "weather" | "forecast" | "rain" | "temperature" | "climate" | "storm" => {
            &["local", "clear", "live", "daily", "bright", "steady"]
        }
        "habit" | "routine" | "streak" | "ritual" => {
            &["daily", "steady", "simple", "focused", "gentle", "lasting"]
        }
        "crm" | "sale" | "lead" | "deal" => {
            &["clear", "ready", "active", "trusted", "direct", "prime"]
        }
        "meditation" | "meditate" | "sleep" | "breath" | "rest" => {
            &["calm", "quiet", "gentle", "daily", "deep", "soft"]
        }
        "pet" | "animal" | "vet" | "veterinary" => {
            &["happy", "trusted", "daily", "gentle", "healthy", "bright"]
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

fn has_any_keyword(keywords: &[String], choices: &[&str]) -> bool {
    keywords
        .iter()
        .any(|keyword| choices.contains(&keyword.as_str()))
}

fn is_feature_flag_brief(keywords: &[String]) -> bool {
    keywords.iter().any(|keyword| keyword == "feature")
        && has_any_keyword(keywords, &["flag", "toggle", "rollout", "switch", "gate"])
}

fn is_color_palette_brief(keywords: &[String]) -> bool {
    has_any_keyword(keywords, &["color", "palette"])
        && has_any_keyword(
            keywords,
            &["design", "visual", "creative", "generator", "scheme"],
        )
}

/// Drop a weak or polysemous word only when another keyword makes the intended
/// domain explicit. The word remains available in every other context.
fn is_contextually_suppressed(word: &str, keywords: &[String]) -> bool {
    let recruiting = has_any_keyword(
        keywords,
        &[
            "hire",
            "recruit",
            "recruiter",
            "candidate",
            "applicant",
            "talent",
        ],
    );
    let meals = has_any_keyword(
        keywords,
        &["meal", "recipe", "menu", "grocery", "cook", "kitchen"],
    );
    let inventory = has_any_keyword(
        keywords,
        &["inventory", "catalog", "belonging", "household"],
    );
    let support = has_any_keyword(keywords, &["support", "helpdesk", "inbox"]);
    let real_estate = has_any_keyword(
        keywords,
        &["estate", "property", "listing", "realtor", "housing"],
    );
    let events = has_any_keyword(keywords, &["event", "conference", "attendee", "venue"]);
    let technical_queue = has_any_keyword(
        keywords,
        &["queue", "broker", "messaging", "stream", "topic", "bus"],
    );
    let weather = has_any_keyword(
        keywords,
        &[
            "weather",
            "forecast",
            "rain",
            "temperature",
            "climate",
            "storm",
        ],
    );
    let habits = has_any_keyword(keywords, &["habit", "routine", "streak", "ritual"]);
    let sales = has_any_keyword(keywords, &["crm", "sale", "lead", "deal"]);
    let pets = has_any_keyword(keywords, &["pet", "animal", "vet", "veterinary"]);
    let travel = has_any_keyword(keywords, &["travel", "trip", "map", "route"]);
    let release = has_any_keyword(
        keywords,
        &["git", "repo", "repository", "version", "release"],
    );
    let naming = has_any_keyword(
        keywords,
        &["name", "naming", "brand", "title", "word", "identity"],
    );
    let developer_namespace = has_any_keyword(
        keywords,
        &[
            "npm",
            "pypi",
            "crate",
            "registry",
            "namespace",
            "availability",
            "available",
        ],
    );
    let color_palette = is_color_palette_brief(keywords);

    (recruiting && matches!(word, "team" | "pipeline" | "track"))
        || (meals && matches!(word, "plan" | "weekly" | "organizer"))
        || (inventory && matches!(word, "home" | "tracker"))
        || (support && matches!(word, "agent" | "customer" | "service" | "ticket"))
        || (real_estate
            && matches!(
                word,
                "discovery" | "home" | "market" | "marketplace" | "buyer" | "real"
            ))
        || (technical_queue && word == "event")
        || (events && matches!(word, "book" | "check"))
        || (weather && matches!(word, "alert" | "local"))
        || (habits && matches!(word, "coach" | "daily" | "tracker"))
        || (sales
            && matches!(
                word,
                "customer" | "pipeline" | "relationship" | "representative" | "team"
            ))
        || (pets
            && matches!(
                word,
                "appointment" | "care" | "health" | "owner" | "reminder"
            ))
        || (travel && word == "plan")
        || (release && word == "automation")
        || (naming && developer_namespace && matches!(word, "check" | "find" | "search"))
        || (color_palette && matches!(word, "designer" | "generator" | "scheme"))
}

/// Describes how a known product is delivered rather than what it is. These
/// words remain available for unknown briefs, but should not become standalone
/// Brandable root groups beside an already recognized domain.
fn is_brand_context_only(word: &str) -> bool {
    matches!(
        word,
        "assistant"
            | "automatic"
            | "collaborative"
            | "companion"
            | "edit"
            | "engine"
            | "guided"
            | "instant"
            | "local"
            | "modern"
            | "offline"
            | "online"
            | "powered"
            | "reminder"
            | "seller"
            | "shared"
            | "simple"
            | "tracker"
    )
}

/// Return the focused adjective pool for a Compound first page. Unknown
/// domains use the restrained general palette instead of the whimsical corpus.
pub fn compound_adjectives(keywords: &[String]) -> Vec<&'static str> {
    let mut ordered_keywords: Vec<(u8, usize, &String)> = keywords
        .iter()
        .enumerate()
        .map(|(index, keyword)| (concept_position(keyword), index, keyword))
        .collect();
    ordered_keywords.sort_by_key(|(position, index, _)| (*position, *index));

    let mut adjectives = Vec::new();
    for (_, _, keyword) in ordered_keywords {
        if matches!(keyword.as_str(), "friend" | "team")
            || is_contextually_suppressed(keyword, keywords)
        {
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
    let has_known_concept = keywords.iter().any(|keyword| {
        !matches!(keyword.as_str(), "friend" | "team")
            && !is_contextually_suppressed(keyword, keywords)
            && !concept_adjectives(keyword).is_empty()
    });
    if !has_known_concept {
        return true;
    }
    if !compound_roots(keywords, 16).iter().any(|root| root == noun) {
        return false;
    }

    for keyword in keywords {
        if is_contextually_suppressed(keyword, keywords) {
            continue;
        }
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
            | "stream"
            | "topic"
            | "bus"
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
            "queue" | "broker" | "messaging" | "stream" | "topic" | "bus"
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
            ) && !is_contextually_suppressed(keyword, keywords)
                && !(has_analytics && keyword.as_str() == "api")
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
pub fn is_naming_brief(keywords: &[String]) -> bool {
    keywords.iter().any(|keyword| {
        matches!(
            keyword.as_str(),
            "name" | "naming" | "brand" | "title" | "word" | "identity"
        )
    })
}

fn is_naming_tool_brief(keywords: &[String]) -> bool {
    has_any_keyword(keywords, &["name", "naming", "word"])
        && has_any_keyword(
            keywords,
            &[
                "engine",
                "generate",
                "generator",
                "product",
                "package",
                "available",
                "availability",
                "registry",
                "namespace",
                "developer",
            ],
        )
}

/// Choose literal source words that are worth styling in Respell mode. A
/// recognizable spelling change should carry the product's subject, not its
/// delivery method, audience, or an incidental role (Companyon, Remynder,
/// Plannr). Unknown briefs keep every extracted word so this remains a filter,
/// not a closed vocabulary.
pub fn respell_source_keywords(keywords: &[String]) -> Vec<String> {
    let has_semantic_anchor = keywords.iter().any(|keyword| {
        !concept_roots(keyword).is_empty() && !is_contextually_suppressed(keyword, keywords)
    });
    if !has_semantic_anchor {
        return keywords.to_vec();
    }

    let naming_brief = is_naming_brief(keywords);
    let feature_flags = is_feature_flag_brief(keywords);
    let focused: Vec<String> = keywords
        .iter()
        .filter(|keyword| {
            !is_contextually_suppressed(keyword, keywords)
                && !is_brand_context_only(keyword)
                && !matches!(keyword.as_str(), "friend" | "team" | "builder")
                && !(feature_flags && keyword.as_str() == "developer")
                && !concept_roots(keyword).is_empty()
                && (!naming_brief
                    || matches!(
                        keyword.as_str(),
                        "name" | "naming" | "brand" | "title" | "word" | "identity"
                    ))
        })
        .cloned()
        .collect();

    if focused.is_empty() {
        keywords.to_vec()
    } else {
        focused
    }
}

pub fn brand_root_groups(keywords: &[String], limit: usize) -> Vec<Vec<String>> {
    const DEV_NAMING_ROOTS: &[&str] = &["key", "tag", "alias", "slug"];
    let has_naming_domain = is_naming_brief(keywords);
    let has_rich_dev_palette = keywords.iter().any(|keyword| {
        matches!(
            keyword.as_str(),
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
                | "format"
                | "formatter"
                | "lint"
                | "linter"
                | "style"
        )
    });
    let has_queue_domain = keywords.iter().any(|keyword| {
        matches!(
            keyword.as_str(),
            "queue" | "broker" | "messaging" | "stream" | "topic" | "bus"
        )
    });
    let has_dependency_domain = keywords.iter().any(|keyword| {
        matches!(
            keyword.as_str(),
            "dependency" | "dependencies" | "update" | "updater" | "upgrade" | "bump"
        )
    });
    let has_semantic_anchor = keywords.iter().any(|keyword| {
        !concept_roots(keyword).is_empty() && !is_contextually_suppressed(keyword, keywords)
    });
    let mut positioned_groups = Vec::new();
    let mut seen = Vec::new();
    for (source_order, keyword) in keywords.iter().enumerate() {
        if seen.len() == limit {
            break;
        }
        if is_contextually_suppressed(keyword, keywords) {
            continue;
        }
        if has_semantic_anchor && is_brand_context_only(keyword) {
            continue;
        }
        if has_rich_dev_palette && is_dev_artifact(keyword) {
            continue;
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
        let expanded_roots = if has_naming_domain && is_dev_artifact(keyword) {
            DEV_NAMING_ROOTS
        } else {
            concept_roots(keyword)
        };
        for &root in expanded_roots {
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

/// Extra function concepts for Auto's isolated semantic-pair retry.
/// Ordinary Brandable generation deliberately keeps artifact words such as
/// `planner` out of its root pool; this lane can recover that meaning without
/// spreading another root family through every first page.
fn bounded_guided_groups(groups: &[&[&str]], limit: usize) -> Vec<Vec<String>> {
    let mut remaining = limit;
    groups
        .iter()
        .filter_map(|roots| {
            let group: Vec<String> = roots
                .iter()
                .take(remaining)
                .map(|root| (*root).to_string())
                .collect();
            remaining = remaining.saturating_sub(group.len());
            (!group.is_empty()).then_some(group)
        })
        .collect()
}

pub fn guided_pair_root_groups(keywords: &[String], limit: usize) -> Vec<Vec<String>> {
    if is_naming_tool_brief(keywords) {
        // `LexLoom` gives naming tools one deliberate word-making role without
        // adding another suffix family to ordinary Brandable output.
        const GROUPS: &[&[&str]] = &[&["lex"], &["loom", "mint"]];
        return bounded_guided_groups(GROUPS, limit);
    }

    // Shared-expense briefs benefit from role words that are more concrete than
    // the broad finance/social palettes. Keep this vocabulary private to the
    // final-gap pair lane: ordinary Brandable still explores the wider roots.
    let shared_expenses = keywords.iter().any(|keyword| keyword == "expense")
        && keywords.iter().any(|keyword| {
            matches!(
                keyword.as_str(),
                "split" | "share" | "sharing" | "divide" | "settle"
            )
        })
        && keywords
            .iter()
            .any(|keyword| matches!(keyword.as_str(), "friend" | "community" | "social" | "team"));
    if shared_expenses {
        const GROUPS: &[&[&str]] = &[
            &["split", "share", "settle", "pool", "fair"],
            &["tab", "tally", "due", "bill", "pay", "ledger"],
            &["mate", "kin", "bond", "link", "circle"],
        ];
        return bounded_guided_groups(GROUPS, limit);
    }

    let planning = keywords
        .iter()
        .any(|keyword| matches!(keyword.as_str(), "plan" | "planner" | "planning"));
    let workout = keywords
        .iter()
        .any(|keyword| matches!(keyword.as_str(), "fitness" | "workout" | "exercise"));
    if planning && workout {
        // `RepLoop` and `FitSet` express both the workout and the planning
        // behavior without adding another Fit-suffix family to ordinary Auto.
        const GROUPS: &[&[&str]] = &[
            &["fit", "pulse", "rep", "lift"],
            &["set", "log", "plan", "loop", "path", "map"],
        ];
        return bounded_guided_groups(GROUPS, limit);
    }

    let artificial_intelligence = keywords
        .iter()
        .any(|keyword| matches!(keyword.as_str(), "ai" | "model" | "agent"));
    let workflow_automation = keywords
        .iter()
        .any(|keyword| matches!(keyword.as_str(), "automation" | "workflow"));
    if artificial_intelligence && workflow_automation {
        // The broad AI roots produce readable suffix forms but become too long
        // when joined to a workflow concept. These short roles keep both ideas
        // visible in names such as `CogLoop` without changing ordinary Auto.
        const GROUPS: &[&[&str]] = &[
            &["cog", "aid"],
            &["loop", "run", "task", "flow"],
        ];
        return bounded_guided_groups(GROUPS, limit);
    }

    let sales_relationship = keywords.iter().any(|keyword| {
        matches!(
            keyword.as_str(),
            "crm" | "sale" | "lead" | "deal" | "customer" | "relationship" | "representative"
        )
    });
    let sales_pipeline = keywords.iter().any(|keyword| keyword == "pipeline");
    if sales_relationship && sales_pipeline {
        // Compact revenue roles produce readable pairs such as `RevLoop`
        // without pushing the abbreviation into ordinary Brandable pages.
        const GROUPS: &[&[&str]] = &[&["rev"], &["loop", "lane", "path"]];
        return bounded_guided_groups(GROUPS, limit);
    }

    let formatting = keywords
        .iter()
        .any(|keyword| matches!(keyword.as_str(), "format" | "formatter" | "style"));
    let linting = keywords
        .iter()
        .any(|keyword| matches!(keyword.as_str(), "lint" | "linter" | "rule"));
    if formatting && linting {
        // Keep concise tool roles such as `TidyKit` and `LintFix` inside the
        // isolated pair lane. Ordinary Brandable keeps its broader syntax and
        // style palette instead of turning every formatter name into a kit.
        const GROUPS: &[&[&str]] = &[&["tidy", "lint", "rule"], &["kit", "fix"]];
        return bounded_guided_groups(GROUPS, limit);
    }

    if is_feature_flag_brief(keywords) {
        // `FlipOps` and `FlipLog` express feature control without adding a
        // fifth Gate-prefixed card or widening ordinary Brandable vocabulary.
        const GROUPS: &[&[&str]] = &[&["flip"], &["ops", "kit", "map", "log", "run"]];
        return bounded_guided_groups(GROUPS, limit);
    }

    let recruiting = keywords.iter().any(|keyword| {
        matches!(
            keyword.as_str(),
            "candidate" | "applicant" | "recruit" | "recruiter" | "talent" | "hire"
        )
    });
    let candidate_tracking = keywords
        .iter()
        .any(|keyword| matches!(keyword.as_str(), "track" | "pipeline"));
    if recruiting && candidate_tracking {
        // Candidate pipelines need a workflow role beside the ordinary talent
        // roots. Keep concise forms such as `JobLoop` and `HireHub` private to
        // this pair lane instead of teaching every tracker another template.
        const GROUPS: &[&[&str]] = &[
            &["job", "hire", "crew"],
            &["loop", "hub", "map", "log", "set"],
        ];
        return bounded_guided_groups(GROUPS, limit);
    }

    let household = keywords
        .iter()
        .any(|keyword| matches!(keyword.as_str(), "household" | "belonging" | "belongings"));
    let inventory = keywords
        .iter()
        .any(|keyword| matches!(keyword.as_str(), "catalog" | "inventory"));
    if household && inventory {
        // `StowLog` and `StowTag` describe a household inventory without
        // spreading another generic metaphor tail through ordinary Brandable.
        const GROUPS: &[&[&str]] = &[&["stow"], &["log", "tag", "map"]];
        return bounded_guided_groups(GROUPS, limit);
    }

    let mut groups = brand_root_groups(keywords, limit);
    let used = groups.iter().flatten().count();
    if used >= limit {
        return groups;
    }

    let function_roots: &[&str] = if planning {
        &["plan", "track", "path", "map"]
    } else {
        &[]
    };

    let existing: Vec<&str> = groups.iter().flatten().map(String::as_str).collect();
    let extra: Vec<String> = function_roots
        .iter()
        .filter(|root| !existing.contains(root))
        .take(limit - used)
        .map(|root| (*root).to_string())
        .collect();
    if !extra.is_empty() {
        groups.push(extra);
    }
    groups
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
    if let Some(base) = match word {
        "hiring" => Some("hire"),
        "coding" => Some("code"),
        "naming" => Some("name"),
        "writing" => Some("write"),
        "sharing" => Some("share"),
        "caching" => Some("cache"),
        "messaging" => Some("message"),
        "migrating" => Some("migrate"),
        "creating" => Some("create"),
        "generating" => Some("generate"),
        "updating" => Some("update"),
        "listing" => Some("listing"),
        _ => None,
    } {
        return base.to_string();
    }
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
        assert_eq!(stem("hiring"), "hire");
        assert_eq!(stem("coding"), "code");
        assert_eq!(stem("writing"), "write");
        assert_eq!(stem("generating"), "generate");
        assert_eq!(stem("listing"), "listing");
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
    fn expands_developer_naming_brief_into_contextual_roots() {
        let kws = extract_keywords(
            "a developer tool that generates names for packages CLIs libraries and projects",
            8,
        );
        assert!(is_naming_brief(&kws));
        let roots = brand_roots(&kws, 16);
        assert!(roots.iter().any(|r| r == "lex" || r == "nym"));
        assert!(roots.iter().any(|r| r == "key" || r == "tag"));
        assert!(!roots
            .iter()
            .any(|r| matches!(r.as_str(), "crate" | "stack" | "byte" | "node" | "kit")));
        assert!(roots.iter().any(|r| r == "forge" || r == "mint"));
        assert!(!roots.iter().any(|r| r == "developer" || r == "package"));

        let generic_kws = extract_keywords("a developer toolkit for APIs", 6);
        assert!(!is_naming_brief(&generic_kws));
        let generic = brand_roots(&generic_kws, 16);
        assert!(generic.contains(&"crate".to_string()));
        assert!(generic.contains(&"kit".to_string()));
    }

    #[test]
    fn guided_naming_tools_use_lex_roles_only_in_their_lane() {
        for prompt in [
            "an offline naming engine for developer projects",
            "a tool that finds available package names",
            "a naming tool for new products",
        ] {
            let keywords = extract_keywords(prompt, 6);
            let ordinary = brand_root_groups(&keywords, 16);
            let guided = guided_pair_root_groups(&keywords, 16);
            assert!(ordinary.iter().flatten().any(|root| root == "lex"));
            assert!(!ordinary.iter().flatten().any(|root| root == "loom"));
            assert_eq!(guided, vec![vec!["lex"], vec!["loom", "mint"]], "{prompt}");
        }

        for prompt in [
            "a baby name journal",
            "a word puzzle",
            "a product analytics tool",
            "a brand analytics product",
        ] {
            let keywords = extract_keywords(prompt, 6);
            assert_ne!(
                guided_pair_root_groups(&keywords, 16),
                vec![vec!["lex"], vec!["loom", "mint"]],
                "{prompt}",
            );
        }
    }

    #[test]
    fn expands_developer_namespace_briefs_without_filesystem_leakage() {
        let own = extract_keywords(
            "an offline naming engine for developer projects that checks npm and crates.io",
            6,
        );
        let own_roots = brand_roots(&own, 16);
        for expected in ["lex", "scope", "key", "tag", "alias", "slug"] {
            assert!(own_roots.contains(&expected.to_string()), "{own_roots:?}");
        }
        for dropped in ["engine", "offline", "check"] {
            assert!(!own_roots.contains(&dropped.to_string()), "{own_roots:?}");
        }

        let available = extract_keywords(
            "a tool that finds available package names across developer registries and namespaces",
            6,
        );
        let available_roots = brand_roots(&available, 16);
        for expected in ["lex", "scope", "open", "key", "tag"] {
            assert!(
                available_roots.contains(&expected.to_string()),
                "{available_roots:?}"
            );
        }
        for leaked in ["file", "path", "find", "scan", "seek"] {
            assert!(
                !available_roots.contains(&leaked.to_string()),
                "{available_roots:?}"
            );
        }
    }

    #[test]
    fn keeps_offline_engine_words_for_unknown_briefs() {
        let keywords = vec!["offline".into(), "engine".into(), "bakery".into()];
        let roots = brand_roots(&keywords, 12);
        assert!(roots.contains(&"offline".to_string()), "{roots:?}");
        assert!(roots.contains(&"engine".to_string()), "{roots:?}");
        assert!(roots.contains(&"bakery".to_string()), "{roots:?}");
    }

    #[test]
    fn keeps_unknown_domain_words() {
        let roots = brand_roots(&["vintage".into(), "keyboard".into()], 12);
        assert!(roots.contains(&"retro".to_string()));
        assert!(roots.contains(&"key".to_string()));
    }

    #[test]
    fn drops_context_only_words_beside_a_known_domain() {
        for (prompt, dropped, expected) in [
            ("a local cache inspector", "local", "stash"),
            ("a guided breathing and rest companion", "guided", "still"),
            ("a simple workout planner", "simple", "pulse"),
            ("a collaborative document editor", "collaborative", "ink"),
            ("automatic invoice reminders", "automatic", "ledger"),
            ("an online marketplace for local sellers", "online", "cart"),
            ("an online marketplace for local sellers", "seller", "cart"),
            ("a photo and video editing app", "edit", "frame"),
            ("a trip planning and route app", "plan", "roam"),
        ] {
            let keywords = extract_keywords(prompt, 6);
            let roots = brand_roots(&keywords, 16);
            assert!(!roots.contains(&dropped.to_string()), "{prompt}: {roots:?}");
            assert!(roots.contains(&expected.to_string()), "{prompt}: {roots:?}");
        }
    }

    #[test]
    fn focuses_respell_sources_on_the_product_subject() {
        for (prompt, kept, dropped) in [
            (
                "a developer tool that generates names for packages CLIs libraries and projects",
                &["name"][..],
                &["developer", "generate", "package", "library", "cli"][..],
            ),
            (
                "an app for splitting expenses with friends",
                &["split", "expense"][..],
                &["friend"][..],
            ),
            (
                "a guided breathing and rest companion",
                &["breath", "rest"][..],
                &["guided", "companion"][..],
            ),
            (
                "a simple workout planner",
                &["workout"][..],
                &["simple", "planner"][..],
            ),
            (
                "automatic invoice reminders",
                &["invoice"][..],
                &["automatic", "reminder"][..],
            ),
            (
                "animal health reminders for pet owners",
                &["animal", "pet"][..],
                &["health", "reminder", "owner"][..],
            ),
            (
                "an online marketplace for local sellers",
                &["marketplace"][..],
                &["online", "local", "seller"][..],
            ),
            (
                "an autonomous agent workflow builder",
                &["agent"][..],
                &["builder"][..],
            ),
        ] {
            let keywords = extract_keywords(prompt, 6);
            let sources = respell_source_keywords(&keywords);
            for word in kept {
                assert!(sources.iter().any(|source| source == word), "{prompt}: {sources:?}");
            }
            for word in dropped {
                assert!(
                    !sources.iter().any(|source| source == word),
                    "{prompt}: {sources:?}"
                );
            }
        }
    }

    #[test]
    fn respell_sources_preserve_unknown_briefs() {
        let keywords = vec!["local".into(), "bakery".into()];
        assert_eq!(respell_source_keywords(&keywords), keywords);

        let builder_only = vec!["builder".into()];
        assert_eq!(respell_source_keywords(&builder_only), builder_only);
    }

    #[test]
    fn keeps_context_words_when_no_domain_is_known() {
        let roots = brand_roots(&["local".into(), "bakery".into()], 12);
        assert!(roots.contains(&"local".to_string()));
        assert!(roots.contains(&"bakery".to_string()));

        let cache = extract_keywords("a local cache inspector", 6);
        assert!(compound_adjectives(&cache).contains(&"local"));
    }

    #[test]
    fn keeps_distinct_concepts_in_separate_groups() {
        let groups = brand_root_groups(&["journal".into(), "insight".into()], 12);
        assert_eq!(groups.len(), 2);
        assert!(groups[0].contains(&"ink".to_string()));
        assert!(groups[1].contains(&"lens".to_string()));
    }

    #[test]
    fn guided_pairs_restore_suppressed_product_functions_only_in_their_lane() {
        let prompt = "a simple workout planner";
        let keywords = extract_keywords(prompt, 6);
        let ordinary = brand_root_groups(&keywords, 16);
        let guided = guided_pair_root_groups(&keywords, 16);
        assert!(ordinary
            .iter()
            .any(|group| group.iter().any(|root| root == "pulse")));
        assert!(!ordinary.iter().flatten().any(|root| root == "set"));
        assert!(guided
            .iter()
            .any(|group| group.iter().any(|root| root == "set")));
        assert_eq!(guided.len(), ordinary.len() + 1, "{guided:?}");
    }

    #[test]
    fn guided_shared_expense_pairs_use_concrete_roles_only_in_their_lane() {
        let keywords = extract_keywords("an app for splitting expenses with friends", 6);
        let ordinary = brand_root_groups(&keywords, 16);
        let guided = guided_pair_root_groups(&keywords, 16);
        assert!(!ordinary.iter().flatten().any(|root| root == "tab"));
        assert!(!ordinary.iter().flatten().any(|root| root == "mate"));
        assert!(guided.iter().flatten().any(|root| root == "tab"));
        assert!(guided.iter().flatten().any(|root| root == "mate"));
        assert!(guided.iter().flatten().count() <= 16, "{guided:?}");
    }

    #[test]
    fn guided_ai_workflows_use_short_roles_only_in_their_lane() {
        let keywords = extract_keywords("an AI assistant for workflow automation", 6);
        let ordinary = brand_root_groups(&keywords, 16);
        let guided = guided_pair_root_groups(&keywords, 16);
        assert!(!ordinary.iter().flatten().any(|root| root == "cog"));
        assert!(!ordinary.iter().flatten().any(|root| root == "loop"));
        assert!(guided.iter().flatten().any(|root| root == "cog"));
        assert!(guided.iter().flatten().any(|root| root == "loop"));
        assert!(guided.iter().flatten().count() <= 16, "{guided:?}");
    }

    #[test]
    fn guided_sales_pipelines_use_revenue_roles_only_in_their_lane() {
        let keywords = extract_keywords(
            "a customer relationship pipeline for sales representatives",
            6,
        );
        let ordinary = brand_root_groups(&keywords, 16);
        let guided = guided_pair_root_groups(&keywords, 16);
        assert!(!ordinary.iter().flatten().any(|root| root == "rev"));
        assert!(guided.iter().flatten().any(|root| root == "rev"));
        assert!(guided.iter().flatten().any(|root| root == "loop"));
        assert_eq!(guided.len(), 2, "{guided:?}");
        assert!(guided.iter().flatten().count() <= 16, "{guided:?}");
    }

    #[test]
    fn guided_formatters_use_tool_roles_only_in_their_lane() {
        let keywords = extract_keywords("a code formatter and linter", 6);
        let ordinary = brand_root_groups(&keywords, 16);
        let guided = guided_pair_root_groups(&keywords, 16);
        assert!(!ordinary
            .iter()
            .flatten()
            .any(|root| matches!(root.as_str(), "kit" | "fix")));
        assert!(guided.iter().flatten().any(|root| root == "tidy"));
        assert!(guided.iter().flatten().any(|root| root == "lint"));
        assert!(guided.iter().flatten().any(|root| root == "rule"));
        assert!(guided.iter().flatten().any(|root| root == "kit"));
        assert!(guided.iter().flatten().any(|root| root == "fix"));
        assert_eq!(guided.len(), 2, "{guided:?}");
        assert!(guided.iter().flatten().count() <= 16, "{guided:?}");
    }

    #[test]
    fn guided_household_catalogs_use_inventory_roles_only_in_their_lane() {
        let keywords = extract_keywords("a catalog for household belongings", 6);
        let ordinary = brand_root_groups(&keywords, 16);
        let guided = guided_pair_root_groups(&keywords, 16);
        assert!(!ordinary.iter().flatten().any(|root| root == "stow"));
        assert!(guided.iter().flatten().any(|root| root == "stow"));
        assert!(guided.iter().flatten().any(|root| root == "log"));
        assert!(guided.iter().flatten().any(|root| root == "tag"));
        assert!(guided.iter().flatten().any(|root| root == "map"));
        assert_eq!(guided.len(), 2, "{guided:?}");

        let unrelated = extract_keywords("a software catalog", 6);
        assert!(!guided_pair_root_groups(&unrelated, 16)
            .iter()
            .flatten()
            .any(|root| root == "stow"));
    }

    #[test]
    fn guided_recruiter_tracking_uses_hiring_workflow_roles_only_in_its_lane() {
        let keywords = extract_keywords("candidate tracking software for recruiters", 6);
        let ordinary = brand_root_groups(&keywords, 16);
        let guided = guided_pair_root_groups(&keywords, 16);
        assert!(!ordinary.iter().flatten().any(|root| root == "job"));
        assert!(guided.iter().flatten().any(|root| root == "job"));
        assert!(guided.iter().flatten().any(|root| root == "hire"));
        assert!(guided.iter().flatten().any(|root| root == "loop"));
        assert!(guided.iter().flatten().any(|root| root == "hub"));
        assert_eq!(guided.len(), 2, "{guided:?}");
        assert!(guided.iter().flatten().count() <= 16, "{guided:?}");

        let applicant = extract_keywords("an applicant tracking system for hiring teams", 6);
        let applicant_ordinary = brand_root_groups(&applicant, 16);
        let applicant_guided = guided_pair_root_groups(&applicant, 16);
        assert_eq!(applicant_ordinary.len(), 1, "{applicant_ordinary:?}");
        assert!(applicant_ordinary
            .iter()
            .flatten()
            .any(|root| root == "talent"));
        assert!(applicant_guided
            .iter()
            .flatten()
            .any(|root| root == "job"));

        let unrelated = extract_keywords("a package dependency tracker", 6);
        assert!(!guided_pair_root_groups(&unrelated, 16)
            .iter()
            .flatten()
            .any(|root| root == "job"));
    }

    #[test]
    fn guided_feature_flags_use_flip_roles_only_in_their_lane() {
        for prompt in [
            "a feature flag service",
            "feature toggle management for developers",
        ] {
            let keywords = extract_keywords(prompt, 6);
            let ordinary = brand_root_groups(&keywords, 16);
            let guided = guided_pair_root_groups(&keywords, 16);
            assert!(!ordinary.iter().flatten().any(|root| root == "flip"));
            assert!(guided.iter().flatten().any(|root| root == "flip"));
            assert!(guided.iter().flatten().any(|root| root == "ops"));
            assert!(guided.iter().flatten().any(|root| root == "log"));
            assert_eq!(guided.len(), 2, "{prompt}: {guided:?}");
            if prompt.contains("developers") {
                let sources = respell_source_keywords(&keywords);
                assert!(!sources.iter().any(|source| source == "developer"));
            }
        }

        let unrelated = extract_keywords("a network feature map", 6);
        assert!(!guided_pair_root_groups(&unrelated, 16)
            .iter()
            .flatten()
            .any(|root| root == "flip"));
    }

    #[test]
    fn known_ai_domain_precedes_incidental_assistant_context() {
        let keywords = extract_keywords("workflow automation assistant powered by AI", 6);
        let groups = brand_root_groups(&keywords, 16);
        assert!(groups[0].iter().any(|root| root == "synth"), "{groups:?}");
        assert!(!groups.iter().flatten().any(|root| root == "assistant"));
        assert!(!groups.iter().flatten().any(|root| root == "powered"));
        assert!(groups.iter().flatten().any(|root| root == "workflow"));
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
    fn audience_terms_do_not_replace_an_unknown_product_domain() {
        let keywords = ["plumber".into(), "pipeline".into(), "team".into()];
        let adjectives = compound_adjectives(&keywords);
        assert_eq!(&adjectives[..4], ["clear", "bright", "bold", "open"]);
        assert!(!adjectives.contains(&"shared"));
        assert!(compound_pair_is_coherent(
            "clear", "pipeline", &keywords, false
        ));
    }

    #[test]
    fn disambiguates_common_consumer_product_contexts() {
        let event = extract_keywords("an event ticketing platform", 6);
        let event_roots = brand_roots(&event, 16);
        assert!(event_roots.contains(&"venue".to_string()));
        assert!(event_roots.contains(&"ticket".to_string()));
        assert!(!event_roots.contains(&"queue".to_string()));

        let event_bus = extract_keywords("an event bus for services", 6);
        let event_bus_roots = brand_roots(&event_bus, 16);
        assert!(event_bus_roots.contains(&"queue".to_string()));
        assert!(!event_bus_roots.contains(&"venue".to_string()));

        let property = extract_keywords("property discovery for home buyers", 6);
        let property_roots = brand_roots(&property, 16);
        assert!(property_roots.contains(&"home".to_string()));
        assert!(!property_roots.contains(&"source".to_string()));

        let support = extract_keywords("a ticket inbox for customer service agents", 6);
        let support_roots = brand_roots(&support, 16);
        assert!(support_roots.contains(&"reply".to_string()));
        assert!(support_roots.contains(&"assist".to_string()));
        assert!(support_roots.contains(&"answer".to_string()));
        assert!(!support_roots.contains(&"ticket".to_string()));
        assert!(!support_roots.contains(&"care".to_string()));
        assert!(!support_roots.contains(&"neural".to_string()));

        let pets = extract_keywords("animal health reminders for pet owners", 6);
        let pet_roots = brand_roots(&pets, 16);
        assert!(pet_roots.contains(&"paw".to_string()));
        assert!(pet_roots.contains(&"vet".to_string()));
        assert!(pet_roots.contains(&"buddy".to_string()));
        assert!(!pet_roots.contains(&"care".to_string()));
    }

    #[test]
    fn expands_general_product_domains_on_synonym_prompts() {
        for (prompt, marker) in [
            ("candidate tracking software for recruiters", "talent"),
            ("a weekly menu and grocery organizer", "pantry"),
            ("a catalog for household belongings", "stock"),
            ("conference booking and attendee check-in", "venue"),
            ("local rain and temperature alerts", "breeze"),
            ("routine and streak coaching", "ritual"),
            ("a CRM for sales teams", "contact"),
            ("a guided breathing and rest companion", "still"),
            ("animal health reminders for pet owners", "paw"),
        ] {
            let keywords = extract_keywords(prompt, 6);
            let roots = brand_roots(&keywords, 16);
            assert!(roots.contains(&marker.to_string()), "{prompt}: {roots:?}");
        }
    }

    #[test]
    fn color_palette_briefs_add_viable_roots_and_drop_context_words() {
        for prompt in [
            "a color palette and visual design tool",
            "a palette tool for visual designers",
            "a color scheme generator",
        ] {
            let keywords = extract_keywords(prompt, 6);
            let roots = brand_roots(&keywords, 16);
            let respell_sources = respell_source_keywords(&keywords);
            for expected in ["tone", "tint", "pixel", "canvas", "prism"] {
                assert!(roots.contains(&expected.to_string()), "{prompt}: {roots:?}");
            }
            for dropped in ["designer", "generator", "scheme"] {
                assert!(!roots.contains(&dropped.to_string()), "{prompt}: {roots:?}");
                assert!(
                    !respell_sources.iter().any(|source| source == dropped),
                    "{prompt}: {respell_sources:?}",
                );
            }
        }

        let photo = extract_keywords("a photo editing tool with color presets", 6);
        let events = extract_keywords("color labels for calendar events", 6);
        assert!(!is_color_palette_brief(&photo));
        assert!(!is_color_palette_brief(&events));
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
    fn broad_domains_use_distinctive_semantic_roots() {
        let inventory = brand_roots(&extract_keywords("a home inventory tracker", 6), 16);
        assert!(inventory.contains(&"asset".to_string()));
        assert!(inventory.contains(&"count".to_string()));
        assert!(!inventory.contains(&"crate".to_string()));
        assert!(!inventory.contains(&"shelf".to_string()));

        let finance = brand_roots(
            &extract_keywords("a personal budget and expense tracker", 6),
            16,
        );
        assert!(finance.contains(&"cash".to_string()));
        assert!(finance.contains(&"balance".to_string()));
        assert!(!finance.contains(&"mint".to_string()));
        assert!(!finance.contains(&"vault".to_string()));

        let rate_limit = brand_roots(&extract_keywords("an API rate limiting library", 6), 16);
        assert!(rate_limit.contains(&"burst".to_string()));
        assert!(!rate_limit.contains(&"guard".to_string()));

        let bookmarks = brand_roots(&extract_keywords("a browser bookmark manager", 6), 16);
        assert!(bookmarks.contains(&"pin".to_string()));
        assert!(bookmarks.contains(&"ribbon".to_string()));
        assert!(!bookmarks.contains(&"mark".to_string()));
        assert!(!bookmarks.contains(&"link".to_string()));

        let jobs = brand_roots(&extract_keywords("a background job scheduler", 6), 16);
        assert!(jobs.contains(&"tick".to_string()));
        assert!(!jobs.contains(&"task".to_string()));

        let dependencies = brand_roots(&extract_keywords("dependency update automation", 6), 16);
        assert!(dependencies.contains(&"graph".to_string()));
        assert!(dependencies.contains(&"module".to_string()));
        assert!(!dependencies.contains(&"lock".to_string()));

        let release = brand_roots(&extract_keywords("git release automation", 6), 16);
        assert!(release.contains(&"push".to_string()));
        assert!(release.contains(&"patch".to_string()));
        assert!(!release.contains(&"ship".to_string()));
    }

    #[test]
    fn rich_dev_palettes_replace_generic_artifacts_only_when_they_can() {
        let database = brand_roots(&extract_keywords("a CLI for database migrations", 6), 16);
        assert!(database.contains(&"record".to_string()));
        assert!(database.contains(&"row".to_string()));
        assert!(!database.contains(&"crate".to_string()));
        assert!(!database.contains(&"stack".to_string()));

        let formatter = brand_roots(&extract_keywords("a code formatter and linter", 6), 16);
        assert!(formatter.contains(&"syntax".to_string()));
        assert!(formatter.contains(&"indent".to_string()));
        assert!(!formatter.contains(&"crate".to_string()));
        assert!(!formatter.contains(&"stack".to_string()));

        let rate_limit = brand_roots(&extract_keywords("an API rate limiting library", 6), 16);
        assert!(rate_limit.contains(&"meter".to_string()));
        assert!(rate_limit.contains(&"kit".to_string()));
    }

    #[test]
    fn low_scoring_domains_gain_short_distinctive_roots() {
        let sales = brand_roots(&extract_keywords("a CRM for sales teams", 6), 16);
        assert!(sales.contains(&"sale".to_string()));
        assert!(sales.contains(&"close".to_string()));
        assert!(!sales.contains(&"pipeline".to_string()));

        let education = brand_roots(&extract_keywords("an online course and study app", 6), 16);
        assert!(education.contains(&"sage".to_string()));
        assert!(education.contains(&"quiz".to_string()));
        assert!(!education.contains(&"class".to_string()));

        let environment = brand_roots(&extract_keywords("an environment variable manager", 6), 16);
        assert!(environment.contains(&"dot".to_string()));
        assert!(environment.contains(&"var".to_string()));
        assert!(environment.contains(&"param".to_string()));
        assert!(!environment.contains(&"value".to_string()));
        assert!(!environment.contains(&"setting".to_string()));

        let legal = brand_roots(&extract_keywords("legal research for court cases", 6), 16);
        assert!(legal.contains(&"jury".to_string()));
        assert!(legal.contains(&"docket".to_string()));
        assert!(legal.contains(&"cite".to_string()));
        assert!(!legal.contains(&"counsel".to_string()));
        assert!(!legal.contains(&"scope".to_string()));
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

        let release = extract_keywords("git release automation", 6);
        let release_roots = brand_roots(&release, 16);
        assert!(release_roots.contains(&"commit".to_string()));
        assert!(!release_roots.contains(&"mind".to_string()));
        assert!(!release_roots.contains(&"synth".to_string()));
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
