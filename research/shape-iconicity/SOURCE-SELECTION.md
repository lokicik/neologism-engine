# Phase 289 development source selection

Date: 2026-08-23

The inventory was inspected only for node metadata, paths, sizes, and URLs. No
development file or external human outcome was opened before this selection.

## Inventory identity

- Inventory manifest SHA-256:
  `182d17bb04067b137f61a75a6f7bfdac69091e3b4046ff2be6dc15bf613dbff8`
- `ekpgh`: public, 631 files, 78,731,512 bytes, no node license ID.
- `y9zjc`: public, 686 files, 76,977,668 bytes, no node license ID.
- Frozen PLOS external files were downloaded but remain unopened:
  - `pone.0208874.s005.xlsx`: 907,945 bytes,
    SHA-256 `a7f47dbef7e65d10abe194c5787d227ce45fb5008d2aefc422d0ff4ec0f523f5`
  - `pone.0208874.s007.docx`: 24,209 bytes,
    SHA-256 `c108e099e566cc752a12156a5b1af7a6808cf2f4498d60be4c841c06880bc974`

## Exact development downloads

Only these files may be downloaded and opened:

1. `ekpgh/Explanation of Stimulus Set Variables.pdf`
2. `ekpgh/SoS Pseudoword Database.xlsx`
3. `y9zjc/README.pdf`
4. `y9zjc/Crossmodal_RSA_AV_ratings_parameters/Crossmodal_AV_ratings/combo_final_order_culled_data.mat`
5. `y9zjc/Crossmodal_RSA_AV_ratings_parameters/Crossmodal_AV_ratings/ratings_crossmodal.m`
6. `y9zjc/Pseudoword_RSA_env_tilt_FFT_Matlab_code/importfile.m`
7. `y9zjc/Pseudoword_RSA_env_tilt_FFT_Matlab_code/pseudowords537_Final_YJ.mat`
8. `y9zjc/Pseudoword_RSA_env_tilt_FFT_Matlab_code/RSA_Ordered_P_to_R_culled.mat`

The spreadsheet and PDFs recover stimulus spelling/IDs and documented fields;
the MAT files and their adjacent scripts recover observed rating order and
scale direction. WAV, acoustic measurements, author predictors, image data,
and every unlisted file are excluded. If these eight files cannot establish
the protocol's item-level human-rating contract without guessing, the
development source fails closed.
