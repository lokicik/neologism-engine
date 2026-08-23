# Phase 291 pre-inspection freeze

Date: 2026-08-23

No PseudoLex data file, item spelling, participant row, or human rating was
downloaded or inspected before this checkpoint.

- Protocol SHA-256:
  `7efeae5132310cbe321b25f9a249351edc25c1354b7e765425db8adae9d358dd`
- Refresh implementation SHA-256:
  `7196feb2bae9d8f6235888f070925fe2525a20fedef18548363df6c3d11de094`
- Linking page:
  `https://www.phon.ox.ac.uk/jpierrehumbert/publications.html`
- Expected link label: `Data file`

The first explicit refresh may resolve that author-provided link and download
only the linked PseudoLex CSV plus its linking page. If the link is ambiguous,
missing, licensed incompatibly, or the data contract is insufficient, the lane
fails closed without widening the source search after outcomes are inspected.

## Pre-outcome archive correction

The first refresh resolved the single author link and returned an 8,153,266-byte
`application/zip` payload named `pseudoLex_share1.csv.zip`; it did not inspect
or parse the contained CSV. The refresh was corrected to require exactly one
archive member named `pseudoLex_share1.csv`, extract it without path guessing,
and record archive and CSV hashes separately. No model, eligibility threshold,
split, metric, or gate changed.

- Corrected refresh implementation SHA-256:
  `8000141a6fb58cef60f7a7e13f3c68690f59373cccaab51dd8baa1129620a5c0`

That correction then exposed member names only: the expected CSV plus the
standard macOS metadata member `__MACOSX/._pseudoLex_share1.csv`. No member
content was parsed. The final refresh records and ignores only `__MACOSX/`
metadata while still requiring exactly one data member with the frozen CSV
name.

- Final refresh implementation SHA-256:
  `e145c9db6eb524704d05975015be8ef65052c77a19ae6606b9d8861db4abf7a3`
