# STACK Input Helper

STACK Input Helper is a Moodle local plugin that adds image, on-screen handwriting, and mobile mathematical expression input support for STACK questions.

The plugin now calls Mathpix directly from Moodle PHP. A separate Node.js service, external recognizer API, port `3001`, `pm2`, or `systemd` process is not required for normal deployment.

The current interaction is designed as a human-in-the-loop confirmation step. The plugin recognizes the full image, displays candidate lines, recommends the final line by default, and lets the student confirm or refine the answer before insertion.

## Features

- Adds an upload button near visible STACK answer inputs.
- Provides an on-screen handwriting canvas for Apple Pencil or mouse input, with undo, clear, and recognition controls.
- Sends uploaded images from Moodle PHP to Mathpix.
- Sends handwriting stroke coordinates from Moodle PHP to Mathpix for recognition.
- Displays multi-line recognition results instead of immediately submitting a single OCR result.
- Selects the final recognized line as the recommended answer by default.
- Lets users choose a different line, drag-select part of a line, or edit the STACK preview manually.
- Preserves surrounding Japanese/English text in the review display while converting only the selected mathematical answer to STACK syntax.
- Converts Mathpix LaTeX output to STACK/Maxima-friendly syntax.
- Inserts only the confirmed STACK expression into the answer field.
- Supports QR-code mobile upload using a Moodle-managed temporary session and Moodle's local QR generator.
- Stores Mathpix App ID and App Key in Moodle admin settings, not in browser JavaScript.

## Student Use

The helper appears beside visible STACK answer fields on quiz attempt and question preview pages. It provides three input methods:

1. **Upload math image**: choose a JPG, PNG, or WebP image containing a mathematical expression.
2. **Handwrite math**: write in the canvas with an Apple Pencil or mouse, use **Undo** or **Clear** when needed, then select **Recognize handwriting**. Finger input scrolls the page rather than drawing.
3. **Mobile Math Upload**: scan the QR code, sign in to Moodle on the phone if requested, take or choose a photo, and send the result back to the original Moodle page.

After recognition, students should review the candidate lines. They can select a complete line, drag across part of a rendered expression, or edit the STACK input preview manually. Selecting a different candidate updates both the highlighted row and its radio button. The answer is not placed into STACK until the student selects **Insert answer**.

## Recognition Review Workflow

When a student uploads an image containing several lines, for example:

```text
x^2 + 2x + 1 = 0
(x + 1)^2 = 0
x + 1 = 0
x = -1
```

the plugin displays each recognized line separately and marks the final line as the recommended answer. The student can select another line if needed. The selected line is then converted to STACK syntax in the editable preview before insertion.

If the OCR result contains natural language such as `Therefore, x = -1`, the review display keeps the text visible so the student can understand the recognition result. The STACK preview extracts the mathematical part, for example `x=-1`.

## Installation

Install a zip whose root folder is exactly:

```text
stackinputhelper/
```

from:

```text
Site administration > Plugins > Install plugins
```

Alternatively, copy this folder to:

```text
moodle/local/stackinputhelper
```

Then visit Moodle as an administrator:

```text
Site administration > Notifications
```

Follow the Moodle plugin installation or upgrade prompts.

## Configuration

Configure the plugin from:

```text
Site administration > Plugins > Local plugins > STACK Input Helper
```

Required settings:

- `Mathpix App ID`
- `Mathpix App Key`

Optional settings:

- Enable/disable the helper.
- Maximum upload image size.
- Enable/disable mobile upload.
- Mobile public base URL, only needed when the Moodle site URL is not reachable from phones.

Authenticated users receive the `local/stackinputhelper:use` capability by default. Administrators can change this permission through Moodle role management if the helper should be limited to particular laboratory roles or cohorts.

## Mobile Upload URL

For normal Moodle deployments, no network-specific setup is required. The mobile QR code uses the Moodle site URL configured in `$CFG->wwwroot`, for example a public or campus URL such as `https://stack.example.edu`.

Phones can only open the QR code if they can reach that Moodle URL. If a site is opened as `http://localhost:8000`, the phone will also see `localhost` and will try to connect to itself, not to the teacher's computer. In that case the plugin shows a warning instead of silently producing an unusable QR code.

For local development, use one of these options:

- Open Moodle through a hostname or IP address that the phone can reach on the same network.
- Set `Mobile public base URL` in the plugin settings to that reachable URL.
- Use a tunnel or reverse proxy URL if the phone is not on the same network.

For production Moodle plugin use, administrators normally only need to install the plugin and enter the Mathpix credentials, because the Moodle site's own URL is already stable and reachable.

## Lab Deployment and Acceptance Check

For the ILAS Nagoya University STACK testing environment:

1. Install or update the plugin folder in `moodle/local/stackinputhelper`.
2. Complete Moodle database upgrade from `Site administration > Notifications`.
3. Fill in Mathpix credentials in plugin settings.
4. Purge Moodle caches.
5. Confirm that the Moodle site uses a stable HTTPS URL reachable by laboratory computers and, if mobile upload is enabled, student phones.
6. Open both a STACK question preview and a real quiz attempt using a non-administrator student account.
7. Verify image upload with JPG, PNG, and WebP samples permitted by the server.
8. Verify canvas handwriting with the laboratory's actual input devices. Apple Pencil and mouse drawing are supported; touch is reserved for scrolling.
9. Verify full-line selection, drag selection of part of a formula, manual preview editing, and **Insert answer**.
10. If mobile upload is enabled, scan the QR code from a phone on the intended network and verify that the result returns to the originating Moodle page.
11. Confirm that malformed and oversized uploads are rejected and that Mathpix errors are shown without losing the student's existing STACK answer.

The plugin is currently an alpha release. Before using it in assessed or high-stakes quizzes, run a small pilot with representative devices, browsers, question types, and network conditions, and retain the normal keyboard input method as a fallback.

## Privacy and Security

- Uploaded images and handwriting stroke coordinates are sent to Mathpix for recognition.
- Mathpix credentials are used only by Moodle PHP backend code.
- Credentials are not exposed to browser JavaScript.
- Mobile upload sessions are temporary and expire automatically.
- Uploaded image files are not permanently stored by this plugin.
- Browser-provided filenames and MIME types are not trusted. Moodle verifies the actual file type, dimensions, and decodability before sending an image to Mathpix.

Site administrators should confirm that Mathpix use complies with institutional privacy, consent, procurement, and data handling policies. This release does not impose a per-user Mathpix request limit, so administrators should also monitor account usage and cost during the laboratory pilot.

## Development

Install the pinned JavaScript build dependency, run regression tests, and rebuild the Moodle AMD asset:

```bash
cd stackinputhelper
npm ci
npm test
npm run build
```

The conversion logic is implemented in:

```text
classes/local/stack_converter.php
```

The Mathpix client is implemented in:

```text
classes/local/mathpix_client.php
```

The browser script currently loads:

```text
amd/build/main.min.js
```

## Creating a Release

Update `version.php` and `CHANGELOG.md`, merge the change into the release branch, and push a matching version tag:

```bash
git tag v0.2.10-alpha
git push origin v0.2.10-alpha
```

The GitHub Actions workflow then checks PHP syntax and creates a GitHub Release containing:

- a Moodle-installable ZIP whose root folder is `stackinputhelper/`;
- a changelog generated from commits since the previous version tag;
- GitHub-generated release notes with merged pull requests and contributors.

The workflow refuses to publish if the tag does not match `$plugin->release` in `version.php`.

## Version

Current version:

```text
0.2.10-alpha
```
