# Changelog

Hand2STACK was previously known as STACK Input Helper. Releases from 0.3.0 onward
use the Moodle component name `local_hand2stack` and install in `local/hand2stack`.

## Unreleased

- When a prose label such as `Answer:` is missing from the recognized working, fill its answer box from the last mathematical line and ask the learner to check it. Specific labels such as `f(2)=` never guess.
- Accept full-width `：` and `＝` after anchor labels.
- Convert based logarithms with nested arguments, e.g. `\log_{2}(x(x-2))` and the typed `log_2(x(x-2))`, to `log(x*(x-2))/log(2)` instead of the invalid product `log_2*(x*(x-2))`.
- Keep a written `or`/`and` when one side is not a complete relation (often an OCR error such as `x-3` for `x=3`), so `x=-1 or x-3` stays visibly wrong instead of silently becoming `x=-1*x-3`.
- Read unbracketed function arguments as handwriting means them: `\sin 2x` is `sin(2*x)` (was `sin(2)*x`), `\sin\frac{\pi}{6}` is `sin(%pi/6)` (was `sin(%pi)/6`), `\sin x^{2}` and `\ln x^{2}` keep the power inside, and `\tan\theta`, `\ln|x|` and `\sin 30^{\circ}` are valid.
- Convert `\leqq`/`\geqq` (≦/≧), `\dfrac`, `\pm` inside an expression (STACK's `+-`), a leading `\Rightarrow`/`∴`, `y'`, `{}_{n}C_{r}`/`{}_{n}P_{r}`, sets `\{1,2\}`, open intervals `x\in(a,b)`, `(x,y)=(1,2)` and several assignments such as `\mu=50, \sigma=10`.
- Keep the right-hand side of a limit, sum or derivative (`\lim ... =1` was swallowed into the limit), and the text around a matrix (`|A|=ad-bc`).
- Treat a `cases` or `\left\{` block without conditions as a system of equations; it previously kept only its last equation or became a one-column matrix.
- Never turn `x=-1, x-3` (an OCR-damaged second solution) or `A=\{1,2\}` into a plausible list.
- Typed answers: fold full-width characters (`ｘ＝３`), `≧`/`≦` and superscript digits (`x²`), and accept `sinx`, `sin^2(x)`, `ln|x|`, `lg(x,2)` and `log(x,2)`.

## 0.4.0-alpha - 2026-10-07

- Add research instrumentation v1 backend: a pseudonymised `local_hand2stack_event` table, the `event.php` batch endpoint, and server-side resolution of question, question-bank entry, question version and plugin version.
- Add site settings for research event logging (off by default) and a study ID, plus the `local/hand2stack:researchparticipant` capability for consenting learners.
- Declare research events in the privacy provider, with export and deletion by pseudonymous participant ID.
- Add the browser research logger: recognition, candidate selection, debounced edit commits, Hand2STACK and STACK validation, answer insertion, submission, observed feedback and revision events, batched and flushed with `sendBeacon` on submit and page hide.
- Record aggregate handwriting metrics (strokes, erases, undos, clears, pauses, writing time) without coordinates.
- Scope a question's Check to that question's trace, record Next/Previous/Save as saves that do not wait for feedback, recognise all Moodle question state classes, and log STACK validation once per validated value instead of on every MathJax repaint.
- Insert a recognized "x=3" as "3" when the answer box's own Syntax hint is the label "x="; values with a further relation or connective are inserted unchanged.
- Accept colon labels such as "Answer:" as anchors, matching them in the recognized row when the extracted maths has dropped the label.
- Convert "x=2 \\text{or} x=3" to "x=2 or x=3", treat unknown `\\operatorname{...}` words as prose, drop leading implication arrows from candidate rows, and keep the closing "$" of a document's last inline formula.
- Fix the privacy provider reporting contexts through a non-existent `contextlist::add_context()` method, and implement the user list provider.

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
