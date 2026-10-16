# Privacy and security

The application has no backend data flow. Selected video bytes remain in the browser and are exposed to the HTML video element through a temporary object URL. Videos are not uploaded. Review metadata, annotations, and generated screenshots are persisted to IndexedDB on the user's device. They leave the device only if the user explicitly exports and shares a review package or report. A package contains screenshots and review notes but excludes source video by default.

The production bundle has no analytics or external runtime dependencies. The UI uses system fonts. ZIP import bounds compressed size, entry count, and declared uncompressed size; rejects absolute and traversal paths; validates the manifest and version references; and only restores screenshot assets at constrained relative paths. HTML reports escape user text and embed captured images as data URLs. The static host serves application code, so opening the hosted application requires downloading its code; this does not transfer local review content.

Browser IndexedDB can be cleared, evicted, or quota limited. Export backups for important work. This project does not claim browser storage is permanent or unlimited. Static security headers are provided in `public/_headers` for hosts that implement that convention; hosting providers differ in supported headers and deployment configuration.
