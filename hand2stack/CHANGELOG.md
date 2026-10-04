# Changelog

Hand2STACK was previously known as STACK Input Helper. Releases from 0.3.0 onward
use the Moodle component name `local_hand2stack` and install in `local/hand2stack`.

## Unreleased

## 0.3.2-alpha - 2026-10-04

- Add an optional hidden `process`/`processN` STACK textarea that records recognized mathematical steps in order.
- Keep process data synchronized with algebraic edits, validated values, and editable free-text working.
- Exclude prose, unpaired free-text delimiters, and generated summary rows from process data.
- Remove nested Mathpix math delimiters before MathJax rendering.
- Keep prose and embedded mathematics separate when Mathpix returns mixed-content lines.
- Normalize layout spacing and Unicode minus/equality characters consistently in structured display parts.

## 0.3.1-alpha - 2026-10-04

- Recover STACK syntax hints from the server when a saved or empty submission no longer exposes them in the page.
- Extract labelled results such as `f(2)=...` from recognized working and report each matched or missing target clearly.
- Add thin, medium, and thick handwriting pen sizes.
- Improve conversion of numbered result lines, approximation chains, and short LaTeX inequality commands.
- Preserve exact results when a trailing decimal approximation only restates the same answer.

## 0.3.0-alpha - 2026-10-04

- Rename the Moodle plugin identity from `local_stackinputhelper` to `local_hand2stack`.
- Rename the installed directory, namespaces, capabilities, settings, database table, AMD module, language files, routes, DOM identifiers, and logs to Hand2STACK.
- Copy plugin settings from the legacy component when Hand2STACK is installed alongside it.
- Treat this as a new Moodle plugin identity; administrators must follow the documented migration procedure from 0.2.x.

## 0.2.16-alpha - 2026-10-04

- Rename the public source directory, npm package, and release ZIP to Hand2STACK.
- Keep the installed Moodle directory and component identifier unchanged in the 0.2.x compatibility series.

## 0.2.15-alpha - 2026-10-04

- Preserve complete Mathpix document text through mobile-upload polling.
- Prevent stale recognition matches or concurrent learner edits from overwriting sibling STACK answers.
- Preserve prose and multiple mathematics regions in STACK free-text answers.
- Add a side-by-side source-image viewer with zoom and drag inspection for free-text review.
- Match labelled working such as `f(2)=...` to sibling STACK fields using their configured syntax hints.
- Improve logical-relation, approximation, interval, and multiline-environment conversion and previews.
- Highlight edits in free-text and algebraic ASCII review fields without changing submitted content.

## 0.2.14-alpha - 2026-09-26

- Keep the handwriting canvas and recognition panel within the Moodle question width, and preserve stroke geometry when surrounding layout changes.
- Validate edited ASCII on the server with STACK's parser before inserting it into the answer field.
- Prevent stale image, handwriting, and mobile results from replacing a newer recognition result.
- Serialize mobile polling, surface connection failures, and stop after repeated polling errors.
- Add configurable per-user recognition rate limiting and safe, actionable API error messages.
- Clean up document listeners, observers, polling timers, and hidden file inputs when a question is removed.
- Reject expired mobile sessions before the user takes a photo and associate candidate labels with their radio controls.
- Replace the combined OCR format dump with matching per-line ASCII editors and read-only LaTeX rows.
- Mark corrected OCR lines, support one-click restore, and debounce updates to the selected STACK preview without changing the selected line.
- Use a compact width for ordinary single-line STACK answer fields.
- Detect STACK free-text inputs and keep the complete multiline OCR working instead of selecting only one answer line.
- Insert Mathpix AsciiMath as an editable displayed-math block, with a LaTeX fallback when ASCII is unavailable.
- Preserve the existing line and partial-expression selection workflow for algebraic inputs.

## 0.2.12-alpha - 2026-09-18

- Rename the plugin to Hand2STACK.
- Keep `local_hand2stack` as the internal Moodle component name for upgrade compatibility.

## 0.2.11-alpha

- Synchronize the tested mobile, handwriting, eraser, and resizable-canvas implementation into the release source.
- Support Moodle installations hosted in a subdirectory by deriving fallback endpoints from `$CFG->wwwroot`.
- Add scheduled cleanup for expired mobile-upload sessions.
- Hide internal exception details from API clients while retaining server-side logging.
- Require Moodle 4.4 or later for the output hook API.

All notable user-facing changes to Hand2STACK are recorded here.

## 0.2.10-alpha - 2026-09-14

- Generate mobile-upload QR codes inside Moodle without sending session URLs to a third-party QR service.
- Dispose of document-level selection listeners whenever recognition results are replaced.
- Preserve line selection, partial formula selection, drag selection, and STACK preview behavior across result refreshes.

## 0.2.9-alpha - 2026-07-28

- Added server-side upload validation using the actual file contents rather than browser-provided MIME types.
- Rejects PHP upload errors, empty files, unsupported formats, malformed images, oversized files, and excessive image dimensions before OCR.
- Added a tag-driven GitHub Release workflow that publishes a Moodle-ready ZIP, generated changelog, and release notes.
- Expanded LaTeX-to-STACK conversion coverage for advanced and multiline expressions.

## 0.2.8-alpha - 2026-06-04

- Moodle-hosted Mathpix recognition and human confirmation workflow.
- Multi-line candidate extraction and mobile QR-code uploads.
- LaTeX-to-STACK conversion for common algebra, calculus, matrices, and structured answers.
