# Changelog

## 0.2.11-alpha

- Synchronize the tested mobile, handwriting, eraser, and resizable-canvas implementation into the release source.
- Support Moodle installations hosted in a subdirectory by deriving fallback endpoints from `$CFG->wwwroot`.
- Add scheduled cleanup for expired mobile-upload sessions.
- Hide internal exception details from API clients while retaining server-side logging.
- Require Moodle 4.4 or later for the output hook API.

All notable user-facing changes to STACK Input Helper are recorded here.

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
