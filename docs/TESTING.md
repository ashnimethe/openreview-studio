# Testing

Commands:

- `npm run typecheck` — strict TypeScript project check.
- `npm run lint` — Oxlint static checks; it exits successfully with React Compiler advisory warnings.
- `npm test` — Vitest checks for timestamp normalization and QC note parsing, media seeking events and bounds, time/size helpers, IndexedDB save/recovery, package round-trip and rejection cases, screenshot restoration, image overlay output, and HTML injection handling.
- `npm run build` — production compilation.
- `npm run test:e2e` — rebuilds the production bundle, serves the production preview, and runs the full Playwright workflow in locally installed Chrome and Brave when present.
- `npm run preview` — serve the built output for a production-like browser check.

The production-preview Playwright workflow passed in installed Chrome and Brave on macOS. Chrome reported Chromium `154.0.8037.99`; Brave Browser is `155.1.97.56` (Chromium `155.0.8059.80`). It imports synthetic QC notes, verifies the player and right-side issue list, changes and uses custom capture/bookmark keys, applies a custom accent color, relinks a local 15-second MP4 to a 16-second clip, seeks/pause checks, persists and recovers data, tests issue and project/episode deletion, imports a ZIP in a fresh profile, exports Markdown, TXT, JSON, ZIP, and standalone HTML, and records no page errors or external requests. The default ZIP excludes source video. No production notes or footage are included in test fixtures.

On another system, set `CHROME_PATH` to a Chrome executable or install Playwright's browser with `npx playwright install chromium`. Set `BRAVE_PATH` to a Brave executable to add it to the browser matrix; Brave is skipped if its configured path is absent.

Earlier manual embedded-Chromium checks verified project/episode management, frame capture, M shortcut, annotations (box/text, move/resize/delete/undo/redo), annotation persistence, settings persistence, archive/restore, rename, and review-package import. The generated E2E clip is synthetic test content, not production footage.

Other Chromium browsers (including Edge and Helium), codec fallback cases, IndexedDB quota failures, malformed/oversized package UX, high-volume issue-list performance, contrast measurement, screen-reader behavior, and failed-write recovery remain unverified. Use locally generated, non-sensitive footage for media tests. Automated regression tests use synthetic notes and video only.
