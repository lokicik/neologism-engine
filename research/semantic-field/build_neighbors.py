"""Offline builder for core/data/semfield/neighbors.tsv (Phase 141, semantic
field expansion).

Reads GloVe 6B 100d vectors (Public Domain Dedication and License, PDDL —
nlp.stanford.edu/projects/glove) from research/semantic-field/ and emits, for
every brand-worthy English content word, its cosine-nearest brand-worthy
neighbors. The neighbor VOCABULARY is anchored to the engine's own wordlists
(common_words.txt + roots/adjectives/realwords), so the shipped table contains
only words the engine already treats as real English; GloVe is used offline
only to compute the semantic EDGES. Output is committed; GloVe stays gitignored.

Run from the workspace root once GloVe is downloaded:

    python research/semantic-field/build_neighbors.py

Determinism: keys and neighbor lists are fully sorted; no randomness.
"""

import os
import sys
import zipfile

import numpy as np

ROOT = os.getcwd()
GLOVE_ZIP = os.path.join(ROOT, "research", "semantic-field", "glove.6B.zip")
GLOVE_MEMBER = "glove.6B.100d.txt"
OUT = os.path.join(ROOT, "core", "data", "semfield", "neighbors.tsv")

# GloVe 6B is frequency-ordered; a rank cutoff cheaply drops rare proper nouns
# and typos from the neighbor pool without a POS tagger.
FREQ_RANK_CUTOFF = 30000
KEY_MIN, KEY_MAX = 3, 12       # brief keywords
NB_MIN, NB_MAX = 3, 9          # brand-worthy blend ingredients
NEIGHBORS_PER_KEY = 8          # enough to widen a thin group; keeps the table small
MIN_COSINE = 0.38             # below this the "relation" is noise

# Function words and generic filler make poor blend ingredients.
STOP = set("""
the a an and or but for nor so yet of to in on at by with from into onto upon
as is are was were be been being it its this that these those they them their
you your we our he she his her him who whom which what when where why how not
no yes can will would should could may might must have has had do does did
than then thus also just very more most much many few some any all each every
about above after again against because before between both during each further
here there once only other over under out off up down back then them then
one two three four five six seven eight nine ten first second third new old
good bad big small great little own same such only own via per etc
""".split())


def load_glove():
    if not os.path.exists(GLOVE_ZIP):
        sys.exit(f"missing {GLOVE_ZIP} — download glove.6B.zip first")
    vecs, ranks = {}, {}
    with zipfile.ZipFile(GLOVE_ZIP) as z:
        with z.open(GLOVE_MEMBER) as f:
            for rank, raw in enumerate(f):
                parts = raw.decode("utf-8").rstrip().split(" ")
                word = parts[0]
                if not word.isalpha() or not word.isascii():
                    continue
                vecs[word] = np.asarray(parts[1:], dtype=np.float32)
                ranks[word] = rank
    return vecs, ranks


def wordlist(rel):
    path = os.path.join(ROOT, rel)
    with open(path, encoding="utf-8") as f:
        return {
            ln.strip().lower()
            for ln in f
            if ln.strip() and not ln.startswith("#")
        }


def main():
    print("loading GloVe 100d ...")
    vecs, ranks = load_glove()
    print(f"  {len(vecs)} ascii-alpha vectors")

    common = wordlist("core/data/common_words.txt")
    brandish = set()
    for rel in ("core/data/roots.txt", "core/data/adjectives.txt", "core/data/realwords.txt"):
        brandish |= wordlist(rel)

    def ok_neighbor(w):
        return (
            NB_MIN <= len(w) <= NB_MAX
            and w in vecs
            and w not in STOP
            and (ranks[w] < FREQ_RANK_CUTOFF or w in brandish)
        )

    # Neighbor candidate pool (columns of the similarity matrix).
    nb_words = sorted(w for w in (common | brandish) if ok_neighbor(w))
    nb_index = {w: i for i, w in enumerate(nb_words)}
    M = np.stack([vecs[w] for w in nb_words])
    M /= np.linalg.norm(M, axis=1, keepdims=True) + 1e-9
    print(f"  {len(nb_words)} neighbor-candidate words")

    # Keys: any common content word with a vector, in the brief-keyword range.
    key_words = sorted(
        w for w in common
        if KEY_MIN <= len(w) <= KEY_MAX and w in vecs and w not in STOP
    )
    print(f"  {len(key_words)} keys")

    lines = []
    batch = 512
    for start in range(0, len(key_words), batch):
        chunk = key_words[start:start + batch]
        Q = np.stack([vecs[w] for w in chunk])
        Q /= np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9
        sims = Q @ M.T  # (batch, |nb|)
        for row, key in enumerate(chunk):
            scores = sims[row]
            # Take a generous top slice, then filter self / prefix-duplicates.
            top = np.argpartition(scores, -(NEIGHBORS_PER_KEY + 8))[-(NEIGHBORS_PER_KEY + 8):]
            top = top[np.argsort(scores[top])[::-1]]
            picked = []
            for j in top:
                if scores[j] < MIN_COSINE:
                    break
                w = nb_words[j]
                if w == key:
                    continue
                # Skip trivial morphological variants (cat/cats, run/running).
                if w.startswith(key[:4]) or key.startswith(w[:4]):
                    continue
                picked.append(w)
                if len(picked) >= NEIGHBORS_PER_KEY:
                    break
            if picked:
                lines.append(f"{key}\t{' '.join(picked)}")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
    size = os.path.getsize(OUT)
    print(f"wrote {OUT}: {len(lines)} keys, {size} bytes")


if __name__ == "__main__":
    main()
