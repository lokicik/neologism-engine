# Phase 298 bulk acquisition freeze

Date frozen: 2026-08-23

Phase 297's frozen live API returned HTTP 502 before response 1/111. This is a
new acquisition preflight, not an endpoint substitution inside Phase 297.

## Frozen source identity before download

- Official release URL:
  `https://conceptnet.s3.amazonaws.com/downloads/2019/edges/conceptnet-assertions-5.7.0.csv.gz`.
- Official ConceptNet wiki labels the linked assertions release as version
  5.7.0 and documents its five-field gzipped tab-separated format.
- HTTP HEAD observed before this freeze: status `200`, content length
  `497963447`, ETag `"9728310bd5184a3045f1b7bacdb936ce-29"`, Last-Modified
  `Wed, 03 Jul 2019 15:47:25 GMT`.
- Data license: CC BY-SA 4.0, with `ATTRIBUTION.md` retained separately from
  project code.

## Frozen acquisition boundary

- Download exactly the URL above into the ignored
  `research/conceptnet-semantic/work/bulk/` directory.
- Require the exact HTTP content length above. Compute SHA-256 after download.
- Do not decompress, parse, count, search, sample, or inspect assertion content
  until the archive SHA-256 is recorded in a separately committed extraction
  protocol and implementation freeze.
- A failed or partial download is not a semantic-data outcome. No mirror,
  transformed third-party copy, API response, or alternate version may fill in
  missing bytes under this freeze.

The later extraction preflight, if opened, must stream the gzip archive and
retain only declared English edges relevant to the frozen 111 production
keywords. The complete archive and raw derived rows remain ignored and must
never be committed.
