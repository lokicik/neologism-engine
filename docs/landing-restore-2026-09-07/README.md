# Landing restoration

The user's follow-up restores the original landing page at `/`, outside the application frame. Its existing content, hero, live demos, and motion code are unchanged; the original landing palette is scoped to that page. This supersedes the root-Create routing in the earlier frozen UI delivery.

Open app and Find your name enter `?view=create`. The app wordmark and Tools → About return to `/`; existing `?view=about` links continue to work. URL routing takes priority over old visit/history state. Create stays mounted while the landing is displayed so returning preserves its draft, names, and scroll position, including within the same in-memory session.

Validation: 33 landing-route checks at 320, 390, and 1440px, plus the 105 current discovery/navigation/Saved/shortlist/surface checks. TypeScript and Vite build passed. The staged source was also compiled before committing. No engine or research changes were made, and the earlier frozen report and captures were not overwritten.

[Desktop landing](screenshots/landing-1440.png) · [Mobile landing](screenshots/landing-390.png) · [320px landing](screenshots/landing-320.png)

Run `node e2e/landing-route-contract.mjs` from `web/`. Set `UI_EVIDENCE_DIR` to retain later captures separately. These are local Chromium checks, not a deployment or a naming-quality evaluation.
