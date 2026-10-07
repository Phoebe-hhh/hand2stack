# Hand2STACK

**Multimodal Input for STACK**

Hand2STACK is a Moodle local plugin that adds multimodal mathematical expression input support for STACK questions.

The plugin now calls Mathpix directly from Moodle PHP. A separate Node.js service, external recognizer API, port `3001`, `pm2`, or `systemd` process is not required for normal deployment.

The current interaction is designed as a human-in-the-loop confirmation step. The plugin recognizes the full image, structures mathematical candidate lines without treating any candidate as the answer, and lets the student choose or refine what to insert. Free-text STACK extractors continue to receive the complete working.

## Quick Installation for Moodle Administrators

Requirements:

- Moodle 4.4 or later.
- PHP cURL, Fileinfo, and GD extensions.
- A working Moodle cron that runs every minute.
- Outbound HTTPS access to `api.mathpix.com`.

Installation:

1. Open the latest GitHub Release and download `hand2stack-vX.Y.Z.zip` from **Assets**. Do not use GitHub's automatically generated "Source code" archives.
2. In Moodle, open `Site administration > Plugins > Install plugins` and upload the ZIP.
3. Complete the installation from `Site administration > Notifications`.
4. Open `Site administration > Plugins > Local plugins > Hand2STACK`.
5. Enable the plugin and enter the Mathpix App ID and App Key.
6. Leave `Mobile public base URL` empty for normal deployments, including Moodle installations under paths such as `/projects`.
7. Purge Moodle caches, then open a STACK question preview or quiz attempt and verify image upload, handwriting, recognition, and answer insertion.

Upgrading from 0.3.x uses the same procedure: upload the new Release ZIP and complete the Moodle notification/upgrade page. Existing plugin settings are retained.

If Moodle reports that the destination directory already exists and ZIP upgrades are disabled, the administrator can replace `local/hand2stack` with the folder from the Release ZIP, then visit `Site administration > Notifications`. Back up the existing folder first; never copy `node_modules` to the server.

Migrating from 0.2.x is a component migration rather than an ordinary upgrade. Disable the legacy plugin without uninstalling it, install the new ZIP, verify that its settings were copied, enable the new plugin, and only then uninstall and remove `local/stackinputhelper`. Temporary mobile-upload sessions are not migrated.

## Features

- Adds an upload button near visible STACK answer inputs.
- Sends uploaded images from Moodle PHP to Mathpix.
- Displays multi-line recognition results instead of immediately submitting a single OCR result.
- Detects STACK free-text inputs and preserves all recognized lines as editable displayed AsciiMath.
- Hides an optional STACK textarea named `process` (or `processN`) and keeps it synchronized with the recognized mathematical steps, while excluding prose and synthetic summaries.
- Keeps the Free-text review compact by showing the original work and one complete editable transcription, without a redundant candidate list.
- Preserves complete Mathpix document text, including prose and every mathematical line, across mobile-upload polling.
- Shows the uploaded source image beside free-text recognition with zoom, reset, and drag inspection.
- Matches labelled results such as `f(2)=...` or `Answer: ...` to sibling STACK fields through their syntax hints while protecting newer recognition results and concurrent student edits.
- Inserts only the value when an answer field's own syntax hint is a label (`x=`), so a recognized `x=3` is inserted as `3`; values with a further relation or connective are inserted unchanged.
- Classifies recognized lines as text, equation, expression, approximation, or condition without inferring which is the answer.
- Preserves approximate values as normalized candidates with an `approximate` relation instead of discarding them.
- Lets users choose a different line, drag-select part of a line, or edit the selected recognized ASCII expression.
- Lets users correct each recognized ASCII line directly, marks changed lines, and restores the original OCR value on request.
- Shows recognized LaTeX as matching read-only rows instead of one combined debug-style value.
- Preserves surrounding Japanese/English text in the review display while converting only the selected mathematical answer to STACK syntax.
- Converts Mathpix LaTeX output to STACK/Maxima-friendly syntax.
- Validates edited algebraic expressions with STACK's parser and inserts only the confirmed STACK expression into the answer field.
- Prevents older asynchronous recognition requests from replacing newer results.
- Applies a configurable per-user recognition request limit.
- Supports QR-code mobile upload using a Moodle-managed temporary session and Moodle's local QR generator.
- Stores Mathpix App ID and App Key in Moodle admin settings, not in browser JavaScript.
- Optionally records pseudonymised research interaction events for consenting participants (see [Research Event Logging](#research-event-logging)).

## Recognition Review Workflow

When a student uploads an image containing several lines, for example:

```text
x^2 + 2x + 1 = 0
(x + 1)^2 = 0
x + 1 = 0
x = -1
```

the plugin displays each recognized line separately and waits for the student to select one. The selected line is then converted to STACK syntax in the editable preview before insertion. A candidate is never treated as an answer merely because it is the last line.

For a STACK 4.13 or later free-text input, the workflow changes automatically: the plugin keeps the complete Mathpix document, converts delimited mathematics to displayed AsciiMath while retaining surrounding prose, and presents the source image beside one editable transcription. Edits remain synchronized with the hidden STACK answer field; no answer-line selector is shown. Algebraic inputs continue to use the line-selection workflow above.

When the same question also contains short algebraic inputs with syntax hints such as `f(2)=`, the plugin can match corresponding labelled lines in the recognized working and fill those inputs after server-side STACK validation. A match is discarded if a newer recognition request starts or the student edits the target field while validation is in progress.

If the OCR result contains natural language such as `Therefore, x = -1`, the review display keeps the text visible so the student can understand the recognition result. The STACK preview extracts the mathematical part, for example `x=-1`.

## Installation

The plugin requires Moodle 4.4 or later. An administrator can install it directly from the installable ZIP attached to a GitHub Release; cloning the repository on the Moodle server is not required.

Install a zip whose root folder is exactly:

```text
hand2stack/
```

from:

```text
Site administration > Plugins > Install plugins
```

Alternatively, copy this folder to:

```text
moodle/local/hand2stack
```

Then visit Moodle as an administrator:

```text
Site administration > Notifications
```

Follow the Moodle plugin installation or upgrade prompts.

## Configuration

Configure the plugin from:

```text
Site administration > Plugins > Local plugins > Hand2STACK
```

Required settings:

- `Mathpix App ID`
- `Mathpix App Key`

Optional settings:

- Enable/disable the helper.
- Maximum upload image size.
- Recognition requests allowed per user per minute.
- Enable/disable mobile upload.
- Mobile public base URL. Leave this empty for normal installations.
- Research event logging and Study ID (see below). Logging is off by default.

## Research Event Logging

Hand2STACK can record how learners move from recognition to submission, for educational research. It is disabled by default and records nothing unless all of the following hold:

1. **Enable research event logging** is turned on in the plugin settings.
2. **Study ID** is set (for example `pilot2026a`). Participant pseudonyms differ between study IDs.
3. The learner holds `local/hand2stack:researchparticipant` in the quiz context. No role has this capability by default, and site administrators are not included automatically. Grant it through a role assigned only to consenting participants.

For each question, the browser sends batches of events to `local/hand2stack/event.php`: recognition started and completed, candidate selection, edits (the value before and after each edit, not individual keystrokes), Hand2STACK and STACK validation, answer insertion, submission, observed feedback, and revision. Handwriting is summarised as counts and durations; coordinates and images are never stored.

Events are stored in the `local_hand2stack_event` table. The server checks every event again, accepts it only for the learner's own attempt, and fills in the question, question version, and plugin version itself. Learners are identified by an HMAC of the study ID and user ID, keyed by a site secret that is generated on installation and never sent to the browser. Grades and official submissions remain in Moodle's own question attempt tables.

## Mobile Upload URL

For normal Moodle deployments, no network-specific setup is required. The mobile QR code uses the Moodle site URL configured in `$CFG->wwwroot`, including installations in a subdirectory. For example, a Moodle installed at `https://stack.example.edu/projects` automatically produces URLs below `https://stack.example.edu/projects/local/hand2stack/`.

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

- Research event logging is off by default and limited to consenting participants. Its events use pseudonymous IDs, are included in Moodle privacy exports, and are removed by privacy deletion requests.

Site administrators should confirm that Mathpix use complies with institutional privacy and data handling policies.

## Development

Install the pinned JavaScript build dependency, run regression tests, and rebuild the Moodle AMD asset:

```bash
cd hand2stack
npm ci
npm run check
npm run build
```

`npm run check` runs the JavaScript regression suite and syntax-checks both the source and built AMD files. PHP files can be checked with:

```bash
find . -name '*.php' -print -exec php -l {} \;
```

Moodle's full PHPUnit environment installs and tests the STACK question type as well as Hand2STACK. Its initialization therefore requires a working STACK CAS configuration. If the Moodle PHP container is configured to execute local Maxima, the `maxima` command must exist there; a separately running Goemaxima service used by the normal Moodle site does not automatically configure the isolated PHPUnit environment. This requirement affects full Moodle/STACK test initialization, not Hand2STACK's normal runtime or its JavaScript tests.

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
git tag v0.4.0-alpha
git push origin v0.4.0-alpha
```

The GitHub Actions workflow then checks PHP syntax and creates a GitHub Release containing:

- a Moodle-installable ZIP whose root folder is `hand2stack/` (tests and Node build files are excluded through `.gitattributes`);
- a changelog generated from commits since the previous version tag;
- GitHub-generated release notes with merged pull requests and contributors.

The workflow refuses to publish if the tag does not match `$plugin->release` in `version.php`.

## Version

Current version:

```text
0.4.0-alpha
```
