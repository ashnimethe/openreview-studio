# Review Package Format

A review package is a ZIP archive. The default exporter never adds the original video. The export dialog has an explicit checkbox to include the currently loaded episode's source video under `sources/`; text and HTML reports never include video. Source-inclusive packages can be very large. The importer validates package paths and size limits but does not ingest source video into browser storage; the reviewer selects a local source file to resume playback.

```text
manifest.json
assets/<issue-uuid>.jpg
assets/<issue-uuid>.png
assets/<issue-uuid>-annotated.jpg  (optional)
assets/<issue-uuid>-annotated.png  (optional)
sources/<source-filename>  (optional; only after explicit opt-in)
```

`manifest.json` contains `format: "OpenReview Studio Package"`, integer `formatVersion` (currently 1), `exportedAt`, and the project record. Screenshot fields in issue records are replaced by `screenshotPath` values. On import, referenced image assets are converted back to data URLs for local storage.

The manifest is authoritative for project metadata, episodes, versions, issues, episode-wide observations, and note-import batches. Existing issues may have an optional version reference so notes can be imported before a video is linked. Original source timestamp strings and note text are carried in the issue/observation records; full pasted source notes are retained in the optional `noteImports` collection. Package import rejects unsupported format versions, invalid issue timestamps/status/severity, unsafe absolute/traversal or unexpected paths, missing or malformed referenced images, packages over 600 MB compressed, more than 2,000 ZIP entries, manifests over 32 MB, or over 800 MB declared expanded content. Imported text is displayed through normal React text nodes or escaped report strings; imported active HTML is not executed.

Future incompatible formats must increment `formatVersion`. Importers must reject unknown newer versions rather than silently discard fields. Keep paths relative and assets limited to generated review images.
