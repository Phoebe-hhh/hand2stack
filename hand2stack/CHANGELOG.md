# Changelog

Hand2STACK was previously known as STACK Input Helper. Releases from 0.3.0 onward
use the Moodle component name `local_hand2stack` and install in `local/hand2stack`.

## Unreleased

- Keep every formula of a review row, in order, instead of only the last one. `\(a<-2\), \(2<a\)` gave `2<a` and silently dropped `a<-2`; it now gives `a<-2,2<a`. `\(x>2\) なので \(x=4\)` gives `x>2,x=4`. An answer label such as `f(2)=` is still found at the start of any formula in the row.
- End the body of a limit, sum, product or `d/dx` at a `+` or `-` outside brackets, as `\sin x+1` already ends at `sin(x)+1`. `\lim_{x \to 0} \frac{\sin x}{x} + 1` became `limit(sin(x)/x+1,x,0)`, which STACK accepts with a different value; it is now `limit(sin(x)/x,x,0)+1`. A body in brackets, or one that starts with a sign, is kept whole.
- Keep every branch condition of a piecewise function as written. `\begin{cases} x^2 & x>0 \\ 0 & \text{otherwise} \end{cases}` was cut at the word and became unreadable; it is now `if x>0 then x^2 elseif "otherwise" then 0`, with words kept as a quoted string and the maths converted, and no branch assumed to be the `else`. The last branch's condition is no longer dropped either: `1 & x<0 \\ 2 & x \geq 0` gives `if x<0 then 1 elseif x>=0 then 2` instead of `... else 2`. Only a branch written without a condition is the `else`. Prose before the block (`\text{Answer: }`) stays prose.
- Leave `x'` and `x''` unconverted, since they state no variable to differentiate by; they became `diff(x,x)`. `y'` and `y''` are still derivatives by `x`, and `f''(t)` by `t`.
- Remove only a prose label from an anchored answer. With the syntax hint `answer =`, `answer = x=3` gave `x`; it now gives `x=3`. A quantity label such as `f(2)=` still drops a restated value (`f(2)=3=3.0` gives `3`).
- Show the converted value in the line-by-line review, read-only, so the learner sees what Insert will put in the answer box, including a label hint already removed.
- Multiply a number in scientific notation by the variable next to it: `2.5e-3 x` became `2.5e-3x`, which STACK rejects; it is now `2.5e-3*x`.
- Drop the sentence period after an approximation: `x \approx 2.71.` became `x=2.71.`; it is now `x=2.71`. The review row's `normalized` value no longer joins both sides of the approximation (`x2.71`).
- Read `x_\text{max}` as the label of `x`, like `x_{\text{max}}`: it became `x_` and the prose `max`; it is now `x[max]`.
- Classify a row with `\neq` as a condition instead of an expression.
- In Free text, number only the rows that are kept (a `\\` followed by a newline lost `2.`), leave out the uploaded filename header, and keep the space before prose that follows a formula in the review row (` and then`, not `and then`).
- Report a Mathpix response that carries an error with status 200 as a failed recognition instead of an empty result.
- Show the remaining fixed interface text from the language pack (the "text" row status, the mobile QR tip and session status, and the localhost warning), and translate it into Japanese.
- Report malformed handwriting data as invalid strokes instead of a generic failure, and limit how often a user can create mobile upload sessions (counted apart from recognitions).
- Declare every stored field in the privacy metadata: the mobile session's ID, status and document text, and the research event's study, trace, page, order, slot, input, modality, question and times.
- After editing a review row that holds several formulas ("Since x>2, x=4"), update the formula the row's answer comes from, its last one, instead of the first.
- Remove unused code from the browser script (an old token selector and LaTeX parser) and four interface elements that were always hidden.
- Keep a decimal at the start of a row. `1.5x=3` lost `1.` as if it were an item number and became `5*x=3`; it is now `1.5*x=3`. Item numbers such as `1.` and `2)` are still removed.
- Translate the remaining Japanese strings (pen, eraser, the mobile URL setting, the request-failed message and the session cleanup task), and name the `local/hand2stack:use` capability and the rate-limit cache in both languages.
- Leave out the empty "Original work" heading in a Free-text panel that has no image, as after a mobile upload, which brings back only the recognized text.
- Convert a fraction or root whose numerator, denominator or radicand holds braces of its own. `\frac{x e^{-\frac{x}{2}}}{2}` (a fraction in an exponent inside a fraction) stayed `\frac(x*%e^(-x/2))*(2)`, which STACK rejects for the backslash; it is now `(x*%e^(-x/2))/(2)`.
- Keep each handwritten row as its own line. Mathpix returns handwriting as one inline block, `\( \begin{array}{l} 4x-7=2x+9 \\ 2x=16 \\ x=8 \end{array} \)`, and only `\[...\]` or `$$...$$` blocks were split into rows, so the whole working showed as a single "Line 1". A multi-row block (`array`, `aligned`, `gathered`, `split`, `align`) is now split by its rows whatever its delimiters.
- Keep the review panel after Check, Next or Save. The reload used to clear the original image and the recognized working; the last recognition of each answer box is now kept in the browser tab (sessionStorage, image downscaled to a JPEG) and shown again with the saved answer. A Free-text panel shows the working with the learner's corrections still marked. After a plain reload (F5), which brings back the answer Moodle saved last, the learner's newer unsubmitted working is put back into the answer box and its anchored boxes, as a browser keeps unsent form input. Restoring never logs a new recognition. On the quiz review page, and under a Free-text answer locked after Check, the original image is shown below the answer (the plugin now also loads on `mod/quiz/review.php`, without capture buttons).
- Never drop a trailing `, x \neq …` as a domain restriction. `y=2, x \neq 1` became `y=2` and `x \neq 1, y \neq 2` became `not(x=1)`, silently losing what the learner wrote; they are now `y=2,x#1` and `x#1,y#2`.
- Replace LaTeX commands only as whole commands: `\cdot`, `\times`, `\div`, `\ne`, `\to` and `\vert`. `\cdots` (a handwritten `…` that Mathpix keeps inside the formula) was cut into `\cdot` + `s`, so `a+2>0 \cdots` became `a+2>0*s`; it now stays `\cdots`, visibly unconverted, for the learner to remove. Likewise `\neg p` became `#g*p` and `A^{\top}` became `A^(->p)`; unknown commands now keep their backslash.
- Keep everything Mathpix marks as `\text{...}` as prose, even a misread word, and convert the maths on each side separately. `|x-1| \geq 0 \text{ f.) } 2x-4 \geq 0` ("より" misread as "f.)") lost `|x-1|` and became `>=02*x-4>=0`; it is now `` `abs(x-1)>=0` f.) `2*x-4>=0` ``. A leading word such as `\text{よって} x \geq 2` is kept instead of dropped. `e`, `i`, `or` and `and` stay inside the maths.
- When a prose label such as `Answer:` is missing from the recognized working, fill its answer box from the last mathematical line and ask the learner to check it. Specific labels such as `f(2)=` never guess.
- Accept full-width `：` and `＝` after anchor labels.
- Answer boxes filled from the recognized working now follow the learner's corrections to that working: editing `x=3` to `x=4` in the review text updates the final-answer box. A box the learner has typed in is never overwritten.
- When the last-line fallback cannot convert that line (e.g. `x>2, x=4`), say so and show the line, and clear the answer box so an answer left from an earlier attempt cannot be submitted against the new working. An answer the learner typed on the page is kept.
- Convert based logarithms with nested arguments, e.g. `\log_{2}(x(x-2))` and the typed `log_2(x(x-2))`, to `log(x*(x-2))/log(2)` instead of the invalid product `log_2*(x*(x-2))`.
- Keep a written `or`/`and` when one side is not a complete relation (often an OCR error such as `x-3` for `x=3`), so `x=-1 or x-3` stays visibly wrong instead of silently becoming `x=-1*x-3`.
- Read unbracketed function arguments as handwriting means them: `\sin 2x` is `sin(2*x)` (was `sin(2)*x`), `\sin\frac{\pi}{6}` is `sin(%pi/6)` (was `sin(%pi)/6`), `\sin x^{2}` and `\ln x^{2}` keep the power inside, and `\tan\theta`, `\ln|x|` and `\sin 30^{\circ}` are valid.
- Convert `\leqq`/`\geqq` (≦/≧), `\dfrac`, `\pm` inside an expression (STACK's `+-`), a leading `\Rightarrow`/`∴`, `y'`, `{}_{n}C_{r}`/`{}_{n}P_{r}`, sets `\{1,2\}`, open intervals `x\in(a,b)` and `(x,y)=(1,2)`.
- Keep the right-hand side of a limit, sum or derivative (`\lim ... =1` was swallowed into the limit), and the text around a matrix (`|A|=ad-bc`).
- Treat a `cases` or `\left\{` block without conditions as a system of equations; it previously kept only its last equation or became a one-column matrix.
- Split a row holding two statements instead of reading it as one expression: `x-2>0 \quad x>2` was the false chain `x-2>0*x and 0*x>2`, and `x-2>0, \text{so} x>2` gave `s*o*x>2`. In Free text the prose word stays outside the maths: `` `x>0 and x-2>0`, so `x>2` ``.
- Keep two relations that Mathpix returned as separate formulas joined by a written `or`/`and` (`\(x=4\) or \(x=-2\)`) in one Free-text statement, `` `x=4 or x=-2` ``. They were marked as two statements, so only `x=-2` was read as the answer. A capitalised `Or`/`OR` is read as `or` too, in one formula or between two.
- Keep the variable the learner wrote: `x=2, 3` stays `x=2,3` and `x=\pm 2` is `x=+-2`. They were rewritten to the bare lists `[2,3]` and `[2,-2]`, which dropped `x=` and assumed the question wanted a list. Likewise `x=1, y=2` is no longer wrapped as `[x=1,y=2]`, and a system's last rows `y=1`, `x=2` no longer add a combined `[x=2,y=1]` row, which was also offered as the answer.
- Never turn `x=-1, x-3` (an OCR-damaged second solution) or `A=\{1,2\}` into a plausible list.
- Typed answers: fold full-width characters (`ｘ＝３`), `≧`/`≦` and superscript digits (`x²`), and accept `sinx`, `sin^2(x)`, `ln|x|`, `lg(x,2)` and `log(x,2)`.
- Never attach capture buttons to STACK radio, checkbox, dropdown or matrix inputs. Inserting into a choice overwrote the submitted option key, and every matrix cell received its own buttons.
- Load the plugin on the Moodle 4.x question preview page (`/question/bank/previewquestion/preview.php`); it previously appeared only in quiz attempts.
- Ask Mathpix not to keep learners' images and handwriting for model training (`improve_mathpix: false`).
- Unsupported LaTeX such as `\cup`, `\arg`, `\nabla` or `\mapsto` now stays visibly invalid in STACK instead of becoming a product of letters such as `A*c*u*p*B`.
- Fix answers STACK accepted but read differently from the handwriting: a subscript `a_{i}` is `a[i]` (was `a[%i]`); `\eta`, `\xi`, `\nu`, `\zeta`, `\kappa`, `\chi`, `\varepsilon` and `\varphi` are Greek letters (was e.g. `%e*t*a`); `\lfloor x\rfloor`, `\emptyset`, `\operatorname{Re}(z)`, `\lg x` and `\sqrt{3}i` convert; an integral with `\mathrm{d}x`, with a value after it (`\int_0^{\pi}\sin x\,dx=2`) or inside a fraction keeps its `int(...)`; a row joined by `\Rightarrow`, `\Leftrightarrow` or `\therefore` is split into its statements.
- Typed answers keep scientific notation (`2.5e-3` was `2.5*%e-3`), `%pi` and `%e` (were `%%pi`), `log10(x)`, `atan2`, `floor`, `signum`, `mod`, `gcd`, `true`/`false` and Greek names, and leave unknown function names such as `expand(x)` for STACK to judge.
- The release script refuses a release whose Moodle version number is not greater than the previous release's.
- Follow Mathpix's own split between prose and formulas: the review rows and the Free-text working now read the same formula delimiters (`$...$`, `\(...\)`, `\[...\]`, `$$...$$`). A row Mathpix returned as text, such as `For the logarithms to be defined,` or `Since`, is shown as text instead of a product of letters like `F*o*r*t*h*e*...`, and is never inserted or copied into the `process` input. A `$` Mathpix left unclosed still starts the formula, also in Free text (`the larger one is $x=3`).
- Remove case-specific OCR repairs (`\text{Finall} y`, `メニー` for `x=-`, `たす` for `です`) and the English keyword list used to guess prose; recognized text is shown as Mathpix returned it.
- Never attach capture buttons to a read-only or disabled answer box, such as on the review page or after an answer is locked by Check; a value inserted there was shown but never submitted.
- Fill answer boxes from the working without moving focus to them, so the cursor no longer jumps away from what the learner is doing and the on-screen keyboard no longer opens on a tablet.
- Send Mathpix requests through Moodle's HTTP client, so they use the site's outgoing proxy and HTTP security settings. Servers that reach the internet only through a proxy previously failed every recognition.

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
