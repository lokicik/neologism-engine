//! Flag which names are already taken, using the shipped collision bloom
//! (~85k crates.io + brand names). Reads one name per line from the file given
//! as the first argument (or stdin) and prints `name<TAB>taken|free`. Used to
//! screen LLM-generated names for availability — the engine's real remaining
//! value once the LLM handles taste.
//!
//! ```powershell
//! cargo run -p neologism-core --example collision_check -- names.txt
//! ```

use std::io::{self, Read};

fn main() {
    let arg = std::env::args().nth(1);
    let text = match arg {
        Some(path) => std::fs::read_to_string(path).expect("read names file"),
        None => {
            let mut s = String::new();
            io::stdin().read_to_string(&mut s).expect("read stdin");
            s
        }
    };
    for line in text.lines() {
        let name = line.trim();
        if name.is_empty() {
            continue;
        }
        let taken = neologism_core::collision::likely_taken(name);
        println!("{name}\t{}", if taken { "taken" } else { "free" });
    }
}
