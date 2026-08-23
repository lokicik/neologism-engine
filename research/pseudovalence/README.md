# Human pseudoword-valence checkpoint

The isolated character-form model found a reproducible human-valence ranking
signal, but it was rejected because the frozen sealed-test calibration gate
failed. The scorer is not connected to generation, ranking, WASM, or web code.

Raw OSF files and all generated outputs remain ignored. Network access is only
available through the explicit refresh command:

```powershell
python research/pseudovalence/refresh.py --refresh
```

- [Frozen protocol](PROTOCOL.md)
- [Sealed-test negative checkpoint](SEALED-NEGATIVE-CHECKPOINT.md)
