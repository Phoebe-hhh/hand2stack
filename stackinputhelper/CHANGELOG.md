# Changelog

All notable user-facing changes to STACK Input Helper are recorded here.

## 0.2.10-alpha - 2026-09-14

- Add an on-screen handwriting canvas with Apple Pencil and mouse input, undo, clear, and stroke recognition.
- Generate mobile-upload QR codes inside Moodle without sending session URLs to a third-party QR service.
- Load the browser integration through Moodle's AMD API and restrict it to authenticated users with the plugin capability.
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
