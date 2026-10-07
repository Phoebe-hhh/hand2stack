# Hand2STACK

**Multimodal Input for STACK**

Hand2STACK is a Moodle local plugin that adds handwriting, image, and mobile-camera input to STACK answer fields. Students review the recognized mathematics before inserting the converted STACK/Maxima expression.

> **Current pilot release:** [v0.4.0-alpha](https://github.com/Phoebe-hhh/hand2stack/releases/tag/v0.4.0-alpha)

## Download

Moodle administrators should download the prepared plugin package from the release assets:

**[Download hand2stack-v0.4.0-alpha.zip](https://github.com/Phoebe-hhh/hand2stack/releases/download/v0.4.0-alpha/hand2stack-v0.4.0-alpha.zip)**

Do not upload GitHub's automatically generated **Source code** archives to Moodle. The correct package is named `hand2stack-v0.4.0-alpha.zip` and contains the plugin root folder `hand2stack/`.

## Features

- Write mathematics directly with Apple Pencil, touch, or a mouse.
- Pen, whole-stroke eraser, undo, clear, and resizable writing area.
- Upload an existing handwritten image.
- Take a photo on a phone or tablet.
- Scan a Moodle-generated QR code to upload from another device.
- Review multiple recognized lines and select the intended answer.
- Edit the selected ASCII result, inspect its synchronized LaTeX form, and restore the original OCR value.
- Validate edited algebraic expressions with STACK's parser before insertion.
- Preserve complete multiline working automatically in STACK 4.13+ free-text inputs.
- Populate an optional hidden STACK textarea named `process` (or `processN`) with the recognized mathematical steps in order, excluding prose and generated summaries.
- Preserve prose and every recognized mathematics line during desktop and mobile free-text recognition.
- Show the uploaded source image beside the editable free-text transcription, with zoom and drag inspection.
- Match labelled results such as `f(2)=...` or `Answer: ...` to sibling STACK inputs using their syntax hints without overwriting newer results or student edits.
- Insert only the value when an answer field's own syntax hint is a label, so a recognized `x=3` goes into an `x=` field as `3`.
- Select part of a recognized formula and insert only the confirmed STACK expression.
- Prevent stale recognition requests from replacing newer results and limit recognition requests per user.
- Keep Mathpix credentials on the Moodle server rather than in browser JavaScript.
- Automatically remove expired mobile-upload sessions with a Moodle scheduled task.
- Optional research event logging (off by default) that records pseudonymised recognition, editing, validation, insertion, and submission events for consenting participants only.

## Requirements

- Moodle 4.4 or later.
- STACK question type installed and configured.
- PHP cURL, Fileinfo, and GD extensions.
- Moodle cron running every minute.
- Outbound HTTPS access to `api.mathpix.com`.
- Mathpix App ID and App Key.

## Installation

1. Download the prepared ZIP above.
2. In Moodle, open **Site administration → Plugins → Install plugins**.
3. Upload the ZIP and complete the validation and installation steps.
4. Visit **Site administration → Notifications** if Moodle requests a database upgrade.
5. Open **Site administration → Plugins → Local plugins → Hand2STACK**.
6. Enable the plugin and enter the Mathpix App ID and App Key.
7. Leave **Mobile public base URL** empty for normal installations.
8. Purge Moodle caches.
9. Open a STACK question preview or quiz attempt and test handwriting, recognition, and answer insertion.

Moodle installations in a subdirectory are supported automatically. For example, a site at `https://stack.example.edu/projects` generates plugin and mobile-upload URLs below that same `/projects` path. **Mobile public base URL** is only an override for unusual reverse-proxy or split-network configurations.

For a manual installation, extract the package as:

```text
moodle/local/hand2stack
```

Then visit **Site administration → Notifications**. When upgrading manually, back up and replace the existing plugin folder; do not copy `node_modules` to the server.

### Migrating from 0.2.x

Version 0.3.0 changes the Moodle component identity from `local_stackinputhelper` to `local_hand2stack`. It is not an in-place upgrade:

1. Disable the old Hand2STACK plugin but do not uninstall it yet.
2. Install `hand2stack-v0.3.0-alpha.zip` as a new plugin.
3. The new plugin copies the old Mathpix and operational settings during installation.
4. Enable and verify the new Hand2STACK plugin.
5. Uninstall and remove `local/stackinputhelper`.

Temporary mobile-upload sessions are intentionally not migrated.

## Student Workflow

1. Choose image upload, handwriting, or mobile upload beside a STACK answer field.
2. Submit the image or handwritten strokes for recognition.
3. For an algebraic input, select the relevant line or symbols; for a free-text input, compare the source image with the complete editable transcription.
4. Correct the selected recognized ASCII expression or free-text working if necessary. Free-text edits stay synchronized with the hidden STACK answer field.
5. Insert the confirmed algebraic expression. Labelled free-text results may also fill matching sibling inputs when their syntax hints agree.

The plugin does not submit the quiz answer automatically.

## Privacy

Uploaded images and handwriting coordinates are sent to Mathpix for recognition. Uploaded image files are not permanently stored by this plugin. Temporary mobile-upload sessions expire and are removed by a scheduled task. Administrators should confirm that external recognition complies with institutional policies.

Research event logging is disabled by default. When an administrator enables it and sets a study ID, it records interaction events only for users who hold the `local/hand2stack:researchparticipant` capability in the quiz context; no role has this capability by default and site administrators are not included automatically. Events are stored with a pseudonymous participant ID instead of the Moodle user ID, never include images or handwriting coordinates, and are covered by Moodle's privacy export and deletion requests. Enable it only under an approved study protocol.

## Repository Layout

- [`hand2stack/`](hand2stack/) — the Moodle plugin source and detailed documentation.
- [`.github/workflows/release.yml`](.github/workflows/release.yml) — tests, builds, and publishes tagged releases.
- [`scripts/build-release.sh`](scripts/build-release.sh) — creates the correctly structured Moodle installation ZIP for GitHub Actions.

The `scripts/` directory is release infrastructure, not an additional server component. Moodle administrators only need the ZIP from the release page.

## Development

```bash
cd hand2stack
npm ci
npm test
npm run build
```

See the [plugin README](hand2stack/README.md) for development details, configuration notes, and the release process.

## Status

Version `0.4.0-alpha` is intended for controlled pilot testing. It adds optional research event logging, label-aware answer insertion, and conversion fixes for written connectives, prose in formulas, and implication arrows. The automated suite covers algebraic candidate selection and editing, free-text document preservation, process-data synchronization, guarded sibling-answer matching, STACK-validated insertion, research event logging and its privacy provider, responsive handwriting geometry, request ordering, rate limiting, mobile behavior, endpoint safety, and session cleanup.
