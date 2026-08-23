# Articulatory WFST research checkpoint

The train-only syllable-state generator was implemented, reproduced, and
rejected on its frozen development gates. It never entered production and its
one-off Rust execution harness was removed after the evidence was captured.

- [Frozen protocol](PROTOCOL.md)
- [Negative checkpoint](NEGATIVE-CHECKPOINT.md)
- `build_corpus.py` retains the passing deterministic train/validation corpus
  extraction step for provenance.
