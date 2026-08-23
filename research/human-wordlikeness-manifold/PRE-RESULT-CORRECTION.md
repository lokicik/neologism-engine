# Phase 291 pre-result implementation correction

Date: 2026-08-23

The first attempted run stopped in source inspection at CSV row 2, before
product vectors, model scores, ratings, or correlations were computed. The
author's `length` column records a linguistic length rather than orthographic
character count: for example, `urquallb` has source length `6` but eight ASCII
characters.

The frozen protocol defines length as orthographic character length and derives
it directly from `ortho`. The redundant assertion equating the source column
with `len(ortho)` was therefore removed. No output metric or outcome informed
this correction. The failed directory contains no report or manifest.

Final corrected runner SHA-256, recorded before retry:
`4bc7cfc61f57bfe75e3cc3aaa4f076cd64f60e887dfa16109f150a5cbc74a950`.
