# Testing

Commands:

- `npm run typecheck` — strict TypeScript project check.
- `npm run lint` — Oxlint static checks; it exits successfully with React Compiler advisory warnings.
- `npm test` — Vitest checks for timestamp normalization and QC note parsing, media seeking events and bounds, time/size helpers, IndexedDB save/recovery, package round-trip and rejection cases, screenshot restoration, image overlay output, and HTML injection handling.
- `npm run build` — production compilation.
- `npm run test:e2e` — rebuilds the production bundle, serves the production preview, and runs the full Playwright workflow in locally installed Chrome and Brave when present.
- `npm run preview` — serve the built output for a production-like browser check.

The full production-preview Playwright workflow passed in current installed Chrome and Brave on macOS. Chrome reported Chromium `154.0.8037.99`; Brave Browser is `155.1.97.56` (Chromium `155.0.8059.80`). The test imported synthetic note examples, reviewed episode groupings, linked a generated 15-second H.264 MP4, verified play/pause, frame capture and box annotation, marker seeking and pause, rejected an out-of-duration timestamp without moving the playhead, navigated to the previous issue, changed status, waited for autosave, reloaded and recovered the data, imported the ZIP in a fresh browser context, and relinked to a 16-second local clip. The relink duration-change warning appeared and the issue timestamp stayed unchanged. It exported Markdown, TXT, JSON, ZIP, and standalone HTML; verified the original and annotated frame assets plus editable geometry in the package; opened the HTML independently; checked source-note output; verified the default ZIP omitted the video; and observed no external HTTP requests or page errors. No production review notes are bundled in the public test fixtures.

On another system, set `CHROME_PATH` to a Chrome executable or install Playwright's browser with `npx playwright install chromium`. Set `BRAVE_PATH` to a Brave executable to add it to the browser matrix; Brave is skipped if its configured path is absent.

Earlier manual embedded-Chromium checks verified project/episode management, frame capture, M shortcut, annotations (box/text, move/resize/delete/undo/redo), annotation persistence, settings persistence, archive/restore, rename, and review-package import. The generated E2E clip is synthetic test content, not production footage.

A cross-browser matrix beyond Chrome/Brave, Edge, Safari and Firefox, codec fallback cases, IndexedDB quota failures, malformed/oversized package UX, high-volume issue-list performance, contrast measurement, screen-reader behavior, and failed-write recovery remain unverified. Use locally generated, non-sensitive footage for media tests. Automated regression tests use synthetic notes and video only.
