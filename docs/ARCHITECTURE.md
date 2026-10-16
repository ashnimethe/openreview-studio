# Architecture

OpenReview Studio is a client-only React 19 + TypeScript SPA built with Vite. It has no API server, login, analytics, cloud storage, or remote media-processing component. UI/domain state is in `src/App.tsx`; core record types/time formatting are in `src/lib/model.ts`; IndexedDB persistence is in `src/lib/store.ts`; ZIP packaging and text/HTML serializers are in `src/lib/packages.ts`.

## Data model

The versioned application domain is `Project → Episode → Version + Issue`. IDs are UUIDs. Issues store normalized media time in seconds, an optional source-version ID, and optional original imported timecode/text. Episode-wide observations and full note-import batches are stored separately so timestamp-free notes and source text remain traceable. Existing records remain valid because these fields are optional. Original and composited annotated screenshots are separate JPEG data URLs during work and separate asset entries in package exports. Annotation geometry is also retained as normalized editable records (0–1) relative to the captured image.

## Persistence and media

IndexedDB database `openreview-studio`, version 1, stores project records in one object store. Each meaningful project-state change is debounced and persisted. Source videos are excluded from this database. The UI creates and revokes a temporary object URL for the current `File`; after reload the reviewer selects the local source again. Generated screenshots and review metadata remain in IndexedDB.

## Boundaries and limitations

Video playback, seeking, and frame capture are native browser APIs. Issue navigation waits for `loadedmetadata` when necessary and `seeked` before updating the playhead, while rejecting invalid and out-of-duration times. The media element supplies the actual time; no promise of frame-accurate seeking is made. QC Notes Studio uses deterministic local parsing and requires reviewer confirmation before import. Future persistence schema changes must bump the IndexedDB version and include an upgrade migration. Portable package format versioning is independent of the IndexedDB version.

## Configuration

`VITE_APP_NAME` optionally changes the displayed product name at build time. It contains no secret and does not change the stable ZIP format identifier.
