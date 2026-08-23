# Phase 302 Implementation Freeze

This implementation was frozen before producing the first Phase 302 result.

## Inputs

- Phase 300 development report SHA-256: `8140a0b00f83e3cc3607fa7b4fe097ad61d790a46fe6c9d3ab14a05e97e4bde0`
- Phase 298 keyword anchors SHA-256: `ff207ad1570356b1a820726dc6c6dc980826425bd40e440ce4dac0d0f4788e55`

## Frozen files

- `PROTOCOL.md`: `014a5b30273d9d35cc7ca7bea35335becb863683683252817942bdd8142eff17`
- `README.md`: `b49bac68916cfa0b0d971fe11b35d185cae0e5626ed54733afaf843629443959`
- `evaluate.py`: `4a916a12fdef06078da8b28ebcbf80c2741951b5c11658cd9b5a986b0126ed61`

## Decision boundary

The candidate-generating source keyword must be the strict top-1 model among
all 111 keyword models. Ties and negative margins are ineligible. The frozen
nine-wrong-brief scores are used only by the declared evaluation gate, never
by selection. No top-k or threshold relaxation is permitted after seeing the
result.
