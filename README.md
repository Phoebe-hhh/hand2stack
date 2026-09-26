# Hand2STACK

**Multimodal Input for STACK**

Hand2STACK is a Moodle local plugin that adds handwriting, image, and mobile-camera input to STACK answer fields. Students review the recognized mathematics before inserting the converted STACK/Maxima expression.

> **Current pilot release:** [v0.2.14-alpha](https://github.com/Phoebe-hhh/hand2stack/releases/tag/v0.2.14-alpha)

## Download

Moodle administrators should download the prepared plugin package from the release assets:

**[Download stackinputhelper-v0.2.14-alpha.zip](https://github.com/Phoebe-hhh/hand2stack/releases/download/v0.2.14-alpha/stackinputhelper-v0.2.14-alpha.zip)**

Do not upload GitHub's automatically generated **Source code** archives to Moodle. The correct package is named `stackinputhelper-v0.2.14-alpha.zip` and contains a single root folder named `stackinputhelper/`.

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
- Select part of a recognized formula and insert only the confirmed STACK expression.
- Prevent stale recognition requests from replacing newer results and limit recognition requests per user.
- Keep Mathpix credentials on the Moodle server rather than in browser JavaScript.
- Automatically remove expired mobile-upload sessions with a Moodle scheduled task.

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
moodle/local/stackinputhelper
```

Then visit **Site administration → Notifications**. When upgrading manually, back up and replace the existing plugin folder; do not copy `node_modules` to the server.

## Student Workflow

1. Choose image upload, handwriting, or mobile upload beside a STACK answer field.
2. Submit the image or handwritten strokes for recognition.
3. For an algebraic input, select the relevant line or symbols; for a free-text input, review the complete multiline working.
4. Correct the selected recognized ASCII expression or free-text working if necessary.
5. Insert the confirmed expression into the answer field.

The plugin does not submit the quiz answer automatically.

## Privacy

Uploaded images and handwriting coordinates are sent to Mathpix for recognition. Uploaded image files are not permanently stored by this plugin. Temporary mobile-upload sessions expire and are removed by a scheduled task. Administrators should confirm that external recognition complies with institutional policies.

## Repository Layout

- [`stackinputhelper/`](stackinputhelper/) — the Moodle plugin source and detailed documentation.
- [`.github/workflows/release.yml`](.github/workflows/release.yml) — tests, builds, and publishes tagged releases.
- [`scripts/build-release.sh`](scripts/build-release.sh) — creates the correctly structured Moodle installation ZIP for GitHub Actions.

The `scripts/` directory is release infrastructure, not an additional server component. Moodle administrators only need the ZIP from the release page.

## Development

```bash
cd stackinputhelper
npm ci
npm test
npm run build
```

See the [plugin README](stackinputhelper/README.md) for development details, configuration notes, and the release process.

## Status

Version `0.2.14-alpha` is intended for controlled pilot testing. The automated suite covers algebraic candidate selection and editing, STACK-validated insertion, responsive handwriting geometry, request ordering, rate limiting, mobile behavior, endpoint safety, and session cleanup.
