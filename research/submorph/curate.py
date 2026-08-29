"""Curate research/submorph/draft.tsv into core/data/submorph.tsv (Phase 142).

Mechanical rules over the mined draft:
  - meaning fragments only, 3-5 letters
  - drop degenerate self-association rows (fragment == its only association)
  - drop fragments equal to a common word when self is the top association
Then append (a) a hand-curated quality-tail block (canon suffixes; weights from
the miner's bigtech counts where available) and (b) a hand-curated block of
classic meaning fragments (cel=excel, dex=index, lum=light...) that the corpus
mining under-covers but the Vercel-class formula needs.

Run from the workspace root:  python research/submorph/curate.py
"""

import os

ROOT = os.getcwd()
DRAFT = os.path.join(ROOT, "research", "submorph", "draft.tsv")
OUT = os.path.join(ROOT, "core", "data", "submorph.tsv")

QUALITY_TAILS = [
    # fragment, canon_weight
    ("ify", 1.00), ("ly", 1.00), ("ra", 1.00), ("na", 0.90), ("ta", 0.90),
    ("to", 0.85), ("io", 0.85), ("ry", 0.75), ("ty", 0.75), ("on", 0.75),
    ("ma", 0.75), ("ia", 0.70), ("ter", 0.70), ("der", 0.70), ("um", 0.60),
    ("us", 0.60), ("el", 0.60), ("ex", 0.60), ("ora", 0.60), ("era", 0.60),
    ("tic", 0.60), ("tor", 0.60), ("os", 0.55), ("ix", 0.55), ("ent", 0.55),
    ("ist", 0.50), ("eo", 0.45),
]

# Classic sub-morphemes the source mining under-covers. Every association is a
# word an English speaker genuinely half-hears in the fragment.
HAND_ROWS = [
    ("cel", "T", "excel:0.85,accelerate:0.80,celerity:0.55", "excel · accelerate"),
    ("dex", "T", "index:0.85,dexterity:0.60", "index · dexterity"),
    ("lum", "H", "luminous:0.80,lumen:0.80,illuminate:0.60", "light"),
    ("lex", "B", "lexicon:0.85,lexical:0.70", "words · language"),
    ("nex", "T", "nexus:0.85,next:0.70,connect:0.60", "nexus · connect"),
    ("mer", "B", "merge:0.80,merit:0.65", "merge · merit"),
    ("ver", "H", "verify:0.85,versatile:0.70,verse:0.65", "verify · versatile"),
    ("vel", "B", "velocity:0.85,level:0.55", "velocity"),
    ("son", "H", "sonic:0.85,sound:0.75,sonnet:0.55", "sound"),
    ("sol", "H", "solar:0.80,solid:0.70,solution:0.60", "sun · solid · solution"),
    ("nov", "H", "nova:0.85,novel:0.75,innovate:0.65", "new · innovate"),
    ("stel", "H", "stellar:0.85", "stellar"),
    ("aur", "H", "aura:0.80,aurora:0.75", "aura · aurora"),
    ("cog", "H", "cognition:0.75,cog:0.60", "thinking · gear"),
    ("syn", "H", "sync:0.90,synthesis:0.70", "sync · synthesis"),
    ("dyn", "H", "dynamic:0.85,dynamo:0.75", "dynamic"),
    ("tem", "H", "tempo:0.75,template:0.65", "tempo · template"),
    ("cur", "H", "current:0.75,curate:0.70,secure:0.55", "current · curate"),
    ("dur", "H", "durable:0.80,endure:0.70", "durable"),
    ("fin", "H", "final:0.75,finish:0.70,refine:0.60", "finish · refine"),
    ("grav", "H", "gravity:0.85", "gravity"),
    ("laten", "X", "", ""),  # sentinel ignored; keeps diff noise minimal
    ("liber", "H", "liberty:0.80", "freedom"),
    ("loc", "H", "location:0.75,local:0.75", "place"),
    ("mem", "H", "memory:0.85,remember:0.65", "memory"),
    ("mig", "H", "migrate:0.85", "migrate"),
    ("mod", "H", "module:0.80,modern:0.70,mode:0.65", "module · modern"),
    ("nav", "H", "navigate:0.85,naval:0.60", "navigate"),
    ("ora", "H", "oracle:0.80,orate:0.60", "oracle"),
    ("pon", "T", "component:0.60,proponent:0.55", "component"),
    ("por", "H", "portal:0.75,port:0.70", "portal"),
    ("sec", "H", "secure:0.85,second:0.60", "secure"),
    ("sen", "H", "sensor:0.75,sense:0.75", "sense"),
    ("sig", "H", "signal:0.85,signature:0.65", "signal"),
    ("stat", "H", "static:0.80,state:0.75,statistic:0.60", "state · static"),
    ("tex", "B", "text:0.85,texture:0.70", "text · texture"),
    ("vault", "X", "", ""),  # banned by S2 anyway; sentinel
    ("vig", "H", "vigilant:0.80,vigor:0.70", "vigilant · vigor"),
    ("vol", "H", "volume:0.75,evolve:0.60", "volume · evolve"),
    ("zen", "H", "zen:0.85,zenith:0.75", "calm · zenith"),
]


def load_common():
    path = os.path.join(ROOT, "core", "data", "common_words.txt")
    with open(path, encoding="utf-8") as f:
        return {ln.strip() for ln in f if ln.strip()}


def main():
    common = load_common()
    out_rows = []
    seen = set()

    with open(DRAFT, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 6 or cols[2] != "meaning":
                continue
            frag, pos, _cls, _w, assocs, gloss = cols[:6]
            if not (3 <= len(frag) <= 5):
                continue
            pairs = [a.split(":") for a in assocs.split(",") if ":" in a]
            words = [p[0] for p in pairs]
            # degenerate: fragment's only/top association is itself
            if words and words[0] == frag and len(words) == 1:
                continue
            if frag in common and words and words[0] == frag:
                continue
            if frag in seen:
                continue
            seen.add(frag)
            out_rows.append((frag, pos, "meaning", "0.00", assocs, gloss))

    for frag, pos, assocs, gloss in HAND_ROWS:
        if pos == "X" or frag in seen:
            continue
        seen.add(frag)
        out_rows.append((frag, pos, "meaning", "0.00", assocs, gloss))

    for frag, w in QUALITY_TAILS:
        if frag in seen:
            # a mined meaning row exists; quality role is additive under a
            # distinct key so runtime can treat it as always-admissible
            pass
        out_rows.append((frag, "T", "quality", f"{w:.2f}", "-:0.0", "canon suffix"))

    out_rows.sort(key=lambda r: (r[2], r[0]))
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("# Submorpheme inventory (Phase 142). Curated from research/submorph/draft.tsv\n")
        f.write("# by research/submorph/curate.py; hand rows appended. Schema:\n")
        f.write("# fragment\tposition\tclass\tcanon_weight\tassociations\tgloss\n")
        for r in out_rows:
            f.write("\t".join(r) + "\n")
    meaning = sum(1 for r in out_rows if r[2] == "meaning")
    quality = sum(1 for r in out_rows if r[2] == "quality")
    print(f"wrote {OUT}: {meaning} meaning + {quality} quality = {len(out_rows)} rows")


if __name__ == "__main__":
    main()
