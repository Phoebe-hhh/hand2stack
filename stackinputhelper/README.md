# STACK Input Helper

STACK Input Helper is a Moodle local plugin that adds image-based mathematical expression input support for STACK questions.

The plugin now calls Mathpix directly from Moodle PHP. A separate Node.js service, external recognizer API, port `3001`, `pm2`, or `systemd` process is not required for normal deployment.

The current interaction is designed as a human-in-the-loop confirmation step. The plugin recognizes the full image, displays candidate lines, recommends the final line by default, and lets the student confirm or refine the answer before insertion.

## Quick Installation for Moodle Administrators

Requirements:

- Moodle 4.4 or later.
- PHP cURL, Fileinfo, and GD extensions.
- A working Moodle cron that runs every minute.
- Outbound HTTPS access to `api.mathpix.com`.

Installation:

1. Open the latest GitHub Release and download `stackinputhelper-vX.Y.Z.zip` from **Assets**. Do not use GitHub's automatically generated "Source code" archives.
2. In Moodle, open `Site administration > Plugins > Install plugins` and upload the ZIP.
3. Complete the installation from `Site administration > Notifications`.
4. Open `Site administration > Plugins > Local plugins > STACK Input Helper`.
5. Enable the plugin and enter the Mathpix App ID and App Key.
6. Leave `Mobile public base URL` empty for normal deployments, including Moodle installations under paths such as `/projects`.
7. Purge Moodle caches, then open a STACK question preview or quiz attempt and verify image upload, handwriting, recognition, and answer insertion.

Upgrading uses the same procedure: upload the new Release ZIP and complete the Moodle notification/upgrade page. Existing plugin settings are retained.

If Moodle reports that the destination directory already exists and ZIP upgrades are disabled, the administrator can replace `local/stackinputhelper` with the folder from the Release ZIP, then visit `Site administration > Notifications`. Back up the existing folder first; never copy `node_modules` to the server.

## Features

- Adds an upload button near visible STACK answer inputs.
- Sends uploaded images from Moodle PHP to Mathpix.
- Displays multi-line recognition results instead of immediately submitting a single OCR result.
- Selects the final recognized line as the recommended answer by default.
- Lets users choose a different line, drag-select part of a line, or edit the STACK preview manually.
- Preserves surrounding Japanese/English text in the review display while converting only the selected mathematical answer to STACK syntax.
- Converts Mathpix LaTeX output to STACK/Maxima-friendly syntax.
- Inserts only the confirmed STACK expression into the answer field.
- Supports QR-code mobile upload using a Moodle-managed temporary session and Moodle's local QR generator.
- Stores Mathpix App ID and App Key in Moodle admin settings, not in browser JavaScript.

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

The plugin requires Moodle 4.4 or later. An administrator can install it directly from the installable ZIP attached to a GitHub Release; cloning the repository on the Moodle server is not required.

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
- Mobile public base URL. Leave this empty for normal installations.

## Mobile Upload URL

For normal Moodle deployments, no network-specific setup is required. The mobile QR code uses the Moodle site URL configured in `$CFG->wwwroot`, including installations in a subdirectory. For example, a Moodle installed at `https://stack.example.edu/projects` automatically produces URLs below `https://stack.example.edu/projects/local/stackinputhelper/`.

Phones can only open the QR code if they can reach that Moodle URL. If a site is opened as `http://localhost:8000`, the phone will also see `localhost` and will try to connect to itself, not to the teacher's computer. In that case the plugin shows a warning instead of silently producing an unusable QR code.

For local development, use one of these options:

- Open Moodle through a hostname or IP address that the phone can reach on the same network.
- Set `Mobile public base URL` in the plugin settings to that reachable URL.
- Use a tunnel or reverse proxy URL if the phone is not on the same network.

For production Moodle plugin use, administrators should leave `Mobile public base URL` empty. It is an override intended only for unusual reverse-proxy or split-network setups where phones must use a different Moodle base URL. If it is used, it must include Moodle's subdirectory, for example `https://stack.example.edu/projects`.

## Lab Deployment Notes

For the ILAS Nagoya University STACK testing environment:

1. Download the installable ZIP attached to the GitHub Release and install it from `Site administration > Plugins > Install plugins`.
2. Complete Moodle database upgrade from `Site administration > Notifications`.
3. Leave `Mobile public base URL` empty; the `/projects` path is detected from Moodle automatically.
4. Fill in Mathpix credentials in plugin settings.
5. Confirm the server cron runs every minute and purge Moodle caches.
6. Open a STACK question preview or quiz attempt page.
7. Upload a handwritten formula image and confirm the generated STACK expression.

## Privacy and Security

- Uploaded images are sent to Mathpix for OCR.
- Mathpix credentials are used only by Moodle PHP backend code.
- Credentials are not exposed to browser JavaScript.
- Mobile upload sessions are temporary and expire automatically.
- Uploaded image files are not permanently stored by this plugin.
- Browser-provided filenames and MIME types are not trusted. Moodle verifies the actual file type, dimensions, and decodability before sending an image to Mathpix.

Site administrators should confirm that Mathpix use complies with institutional privacy and data handling policies.

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
git tag v0.2.11-alpha
git push origin v0.2.11-alpha
```

The GitHub Actions workflow then checks PHP syntax and creates a GitHub Release containing:

- a Moodle-installable ZIP whose root folder is `stackinputhelper/`;
- a changelog generated from commits since the previous version tag;
- GitHub-generated release notes with merged pull requests and contributors.

The workflow refuses to publish if the tag does not match `$plugin->release` in `version.php`.

## Version

Current version:

```text
0.2.11-alpha
```
