# OpenReview Studio

A local-first browser workspace for episode review and video QC. Select a source video from your device, log timestamped issues, capture frames, annotate review images, and share a portable review package. The source video is never sent to a server.

## Features

- Project library and episode workspaces with multiple source-version records.
- Browser-native local video playback, seeking, volume, speed (native player controls), and fullscreen.
- Timestamped issues with category, severity, status, scope, observation, requested fix, and screenshot.
- QC Notes Studio parses pasted episode notes locally, preserves source wording/timecodes, lets reviewers correct episode groupings and categories, and imports timestamped issues plus episode-wide observations without requiring video first.
- Review timeline with issue markers, search, status/severity filters, and quick status cycling.
- Local IndexedDB autosave and reload recovery. Source files are relinked after reload.
- ZIP package export/import with screenshot assets, JSON manifest validation, path checks, and conservative import limits.
- Project, current-episode, or visible-filter exports as a portable ZIP, Markdown, plain text, JSON, or standalone HTML report. ZIP export can optionally include the currently loaded source video after an explicit opt-in.
- Focused video workbench with QC notes and issue navigation in the right sidebar; local video remains the main canvas.
- Keyboard shortcuts: Space play/pause, M capture, B bookmark, arrows seek by a configurable interval. Change the capture and bookmark keys, choose an accent color, and set reviewer name and seek interval in Settings.
- Confirmed deletion for accidental projects and episodes. Shortcut badges and button tooltips show the active bindings.
- Dark interface, keyboard focus states, reduced-motion support, responsive compact layout.

Set `VITE_APP_NAME` at build time to customize the application name.

## Run locally

Requires Node.js 20.19+ or 22.12+ and npm.

```sh
npm install
npm run dev
```

Open the local address printed by Vite. Build and verify with:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
npm run test:e2e
```

## Use

1. Create a project, or open **QC Notes Studio** and paste notes. Choose a destination project or create one in the studio, then inspect and correct the parsed episodes and notes before importing.
2. In each episode, select a local video file. Imported unlinked notes attach to that episode's new source version; the browser creates a temporary object URL and plays it locally.
3. Click an issue, timeline marker, or Previous/Next issue control to seek and pause at its timestamp. Out-of-duration timestamps remain unchanged and show a warning.
4. Press the configured capture shortcut (default **M**) or choose **Log issue** to capture the current time and (where supported) frame, then enter the note. Review notes stay beside the player; filter and search them or click a timeline marker.
5. Export a review ZIP or text/HTML report. Import a ZIP from the project library on another browser, then select the matching source video to continue.

Projects are saved automatically in this browser's IndexedDB. Browser storage can be cleared or limited, so export regular review-package backups. A project does not embed the source video by default.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/REVIEW-PACKAGE-FORMAT.md](docs/REVIEW-PACKAGE-FORMAT.md), and [docs/PRIVACY-AND-SECURITY.md](docs/PRIVACY-AND-SECURITY.md).

## Testing and deployment

See [docs/TESTING.md](docs/TESTING.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The app is a static SPA and can be served from Cloudflare Pages or GitHub Pages. Hosting credentials are not stored in this repository.

## Known limitations

- Browser decoding support depends on the video's codec; MP4 alone does not guarantee playback. H.264/AAC is a practical baseline.
- Browser seeking is approximate and frame stepping/frame-rate metadata are not yet derived from media. Stored timestamps are the browser media time in seconds. Imported source time strings are retained separately for traceability.
- Source relinking is manual after reload. A duration change over half a second is reported while existing timestamps remain unchanged. Versions are identified by their recorded label, filename, size, and duration when available; cryptographic source fingerprinting is not implemented.
- Annotations support normalized box, circle, arrow, and text geometry over a captured frame, with the original image kept separately from the generated annotated composite. Shapes can be selected, moved, resized, deleted, recolored, and adjusted with bounded undo/redo. Both images and the editable geometry are included in review ZIPs and standalone HTML reports.
- Review ZIP stores issue data in a JSON manifest and captured images under `assets/`. Source video is excluded by default; the export dialog can explicitly include the currently loaded episode source. Import restores review data and still asks the recipient to select a local source for playback.
- Automated production-preview workflows cover Chrome and Brave. Other Chromium browsers, codec fallback, storage-quota, and high-volume cases remain unverified.
