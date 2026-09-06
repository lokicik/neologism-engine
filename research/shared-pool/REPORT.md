# Shared-pool experiment

Status: mechanically evaluated; human preference result pending. Auto is unchanged.

## Reproducibility

- 48 baseline Auto pages and finalist sets reproduced exactly after instrumentation.
- 36 evaluation pages: 12 prospectively frozen briefs, three seeds each.
- Code/data identities and the original user-owned dirty diff are retained in artifacts. Full per-page traces are gzip JSON with SHA-256 hashes in comparison.json.
- Deterministic results exclude wall-clock timings. Durations include diagnostic collection and serialization work; this is not a production-speed benchmark.

## Descriptive results

- Median distinct candidate pool: 175.
- Median eligible candidate pool: 142.
- Pages with four finalists: 36/36.
- Median experimental duration: 604 ms.
- Median warmed Auto duration in the same harness: 35 ms. Auto and Lab perform different amounts of work.

## Concrete outputs (seed 13)

| Brief | Existing Auto finalists | Shared-pool finalists |
|---|---|---|
| a tool that rehearses SQLite schema migrations on disposable database copies | Portora, Shiftix, Bridgerow | Verboflu, Storelink, Matbaa, PureRow |
| a webhook debugger that replays failed deliveries against a local endpoint | Ulak, Dockfailed, Againstix | Scriblum, Relaylink, Magnex, TopDock |
| a build tool that checks dependency licenses before publishing a package | Creatic, DepSeed, Bumpify | Plasserv, Versionloom, Matbaa, TopSync |
| a command line utility that compares JSON responses across API versions | Tropic, Termia, Shellio | Autocalc, Termatlas, Falconer, KeyShell |
| a debugger for daylight saving errors in scheduled background jobs | Muvakkit, Tickora, Jobora | Novalum, Jobsignal, Andon, PureJob |
| a local inspector that explains why CSS rules override each other |  | Cosmarch, Ruleflow, Ferman, TopRule |
| a command line recorder for reproducing flaky integration tests | Probeora, Specio, Traceora | Gradforte, Traceloom, Mihenk, PureCmd |
| a tool that tracks breaking changes in GraphQL schemas | Breakix, Datapeak, Breakia | Datakine, Storeseed, Izci, RareRow |
| a browser extension that maps redirects between documentation pages | Harita, Tabroam, Docia | Geoverb, Browsr, Doclink, Portolan |
| a local utility that finds secrets accidentally added to git patches | Beatriev, Pathia, Paramlab | Creasec, Seeksignal, Krypta, BoldEnv |
| a developer tool for inspecting memory allocations in WebAssembly modules | Kitwave, Inspectkit | Verospec, Stacklink, Sankofa, BoldNode |
| a package release assistant that verifies checksums of downloadable binaries | Halyard, Tagora, Pushify | Calcastro, Forgebeam, Kura, RareTag |

## Interpretation boundary

The experiment exposes candidates outside Auto's preselected page. More candidates, different families and richer explanations do not establish better names. Missing per-name semantic evidence is recorded explicitly, not guessed from an explanation.

The collector contains 12 primary page comparisons and four concealed side-reversed repeats. Promotion requires at least 8 experimental wins, at least 6 usable experimental briefs, at least 3 more usable briefs than Auto, and at least 3 consistent repeats. No weights or gates may be tuned using these outcomes. No model is fitted.

Internal traces cover materialized spellings and retrieved inventory entries. Failed construction attempts without a spelling are outside the trace vocabulary. Intermediate nested Submorph events inside Reason are marked by their original stage. A producer's unreturned spelling is not necessarily bad: it may be filtered, ranked below its page budget, or excluded by a diversity cap. The experiment does not bypass those producer decisions.
