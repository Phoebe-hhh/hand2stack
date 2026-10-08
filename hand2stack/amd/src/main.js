// This file is part of Moodle - http://moodle.org/.
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// @package local_hand2stack
// @copyright 2026 Phoebe Huang
// @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later

define([], function() {
    const pluginUrl = (path) => {
        const moodleRoot = window.M && M.cfg && M.cfg.wwwroot
            ? String(M.cfg.wwwroot).replace(/\/$/, '')
            : window.location.origin;
        return moodleRoot + '/local/hand2stack/' + path;
    };

    const replaceLegacyNodeUrl = (url, fallback) => {
        if (!url || /:3001\b/.test(url) || /\/mobile\/[A-Za-z0-9]+/.test(url)) {
            return fallback;
        }
        return url;
    };

    const defaultConfig = {
        recognizeUrl: '',
        strokesUrl: '',
        convertUrl: '',
        anchorsUrl: '',
        sessionCreateUrl: '',
        sessionResultUrl: '',
        eventUrl: '',
        research: {enabled: false, schemaVersion: 1},
        sesskey: '',
        enablemobile: true,
        uploadbtn: 'Upload math image',
        mobilebtn: 'Mobile Math Upload',
        camerabtn: 'Take a photo',
        uploading: 'Recognizing...',
        recognizefailed: 'Recognition failed.',
        recognizedresults: 'Recognized results',
        selectanswer: 'Select the answer to insert into STACK:',
        recognizedworking: 'Recognized mathematical working. Review or edit it before inserting:',
        selectpart: 'Click a symbol, or drag across the formula to select a range.',
        recommendedanswer: 'Suggested',
        approximation: 'Approximation',
        detectedcandidates: 'Detected mathematical candidates (not automatically treated as answers)',
        edited: 'Edited',
        restoreocr: 'Restore OCR result',
        stackpreview: 'STACK input preview:',
        convertedstack: 'Converted for STACK:',
        freetextpreview: 'Free-text working preview:',
        originalwork: 'Original work',
        confirmrecognition: 'Review recognized content',
        freetextworkflow: 'Photo / iPad handwriting → Free text',
        recognizedfullanswer: 'Complete recognized answer · editable',
        freetexthelp: 'Edit text directly; formulas use ASCII math markers. Paragraphs and line breaks are preserved.',
        editedhighlighthelp: 'Blue text shows your changes.',
        directsubmithelp: 'Edits here are used directly as your Free-text answer.',
        appendhint: 'Keep the existing answer and add this section.',
        appendfreetext: 'Append to Free text',
        insertfreetext: 'Insert at cursor',
        zoomin: 'Zoom in',
        zoomout: 'Zoom out',
        resetzoom: 'Reset zoom',
        dragimage: 'Drag to inspect the enlarged image',
        insertanswer: 'Insert answer',
        rawlatex: 'Raw LaTeX',
        recognizedformat: 'Recognized format:',
        asciimath: 'ASCII',
        lineprefix: 'Line',
        creatingmobilesession: 'Creating mobile upload session...',
        waitingmobileupload: 'Waiting for mobile upload...',
        mobileuploadreceived: 'Successfully received mobile result. You can upload another photo with the same QR code.',
        mobileuploadexpired: 'This mobile upload session has expired.',
        mobileuploadtimeout: 'Timeout waiting for result. Please create a new session.',
        mobilesessionfailed: 'Failed to create mobile session:',
        conversioninprogress: 'Converting and validating...',
        pollingfailed: 'The mobile connection was interrupted. Retrying...',
        partialselectionfailed: 'Could not convert the selected text.',
        handwritebtn: 'Handwrite math',
        handwriteinstructions: 'Write with Apple Pencil, your finger, or a mouse. To scroll, drag outside the writing area.',
        resizehandwriting: 'Drag to resize the writing area',
        draw: 'Pen',
        eraser: 'Eraser',
        extractedfromworking: 'Extracted from your working',
        anchornotfound: 'Could not find {$a} in the recognized working. Please enter it manually.',
        filledfromlastline: 'No line starting with {$a} was found, so this was filled from the last line of your working. Please check it.',
        anchorconvertfailed: 'Found {$a} in the recognized working, but could not convert it. Please enter it manually.',
        pensize: 'Pen size',
        penthin: 'Thin pen',
        penmedium: 'Medium pen',
        penthick: 'Thick pen',
        undo: 'Undo',
        clear: 'Clear',
        recognizestrokes: 'Recognize handwriting',
        nostrokes: 'Write an expression first.'
    };
    let config = {};
    const isIPadWebKit = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    const isMobileOrTablet = isIPadWebKit
        || /Android|Mobile|Tablet/i.test(navigator.userAgent)
        || Boolean(navigator.userAgentData && navigator.userAgentData.mobile);

    const findStackInputs = () => {
        const selectors = [
            'input[data-stack-input-type]',
            'textarea[data-stack-input-type]',
            'input[data-stack-input-decimalseparator]',
            'textarea[data-stack-input-decimalseparator]'
        ];

        const boxes = [];
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                if (!boxes.includes(el)) {
                    boxes.push(el);
                }
            });
        });
        return boxes;
    };

    const processInputName = input => {
        const parsed = input ? parseStackInputName(input.name) : null;
        return parsed ? parsed.input : String((input && input.name) || '');
    };

    const isProcessInput = input => {
        return Boolean(input
            && input.tagName === 'TEXTAREA'
            && /^process\d*$/i.test(processInputName(input)));
    };

    const prepareProcessInputs = () => {
        findStackInputs().filter(isProcessInput).forEach(input => {
            input.hidden = true;
            input.setAttribute('aria-hidden', 'true');
            input.dataset.hand2stackProcess = 'true';
        });
    };

    const findAnswerBoxes = () => findStackInputs().filter(input => {
        return input.offsetParent !== null && !isProcessInput(input);
    });

    const createHiddenFileInput = (capture = false) => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        if (capture) fileInput.setAttribute('capture', 'environment');
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
        return fileInput;
    };

    const setAnswerValue = (input, value) => {
        input.focus();
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const setBackgroundValue = (input, value) => {
        if (!input || input.value === value) return;
        input.value = value;
        input.dispatchEvent(new Event('input', {bubbles: true}));
        input.dispatchEvent(new Event('change', {bubbles: true}));
    };

    const findProcessInput = answerBox => {
        const question = answerBox && answerBox.closest('.que');
        if (!question) return null;
        return findStackInputs().find(input => question.contains(input) && isProcessInput(input)) || null;
    };

    const processValueForLines = lines => {
        if (!Array.isArray(lines)) return '';
        return lines.filter(line => !line.synthetic
                && String((line && line.type) || 'expression').toLowerCase() !== 'text')
            .map(line => String((line && (line._validatedStack || line.stack || line.ascii || line.math)) || '').trim())
            .filter(Boolean)
            .join('\n');
    };

    // One backtick-marked Free-text row, normalised like the server normalises
    // recognized lines: list numbering is layout, and Maxima has no "~~", so a
    // restated decimal after an exact value is dropped.
    const processRowFromFreeText = row => {
        let value = String(row || '').trim()
            .replace(/^(?:\d+[.)]|\(\d+\))\s+(?=[A-Za-z(])/, '')
            .replace(/^(?:~~|≈)\s*/, '');
        const approx = /~~|≈/.exec(value);
        if (approx) {
            const head = value.slice(0, approx.index);
            value = /(^|[^<>!#:])=/.test(head) ? head : value.replace(/~~|≈/, '=');
        }
        return value.trim();
    };

    // The Free-text working marks each maths row with backticks; prose stays
    // outside them. Unpaired backticks (mid-edit) are ignored.
    const processValueForFreeText = text => {
        const rows = [];
        const pattern = /`([^`]*)`/g;
        let match;
        while ((match = pattern.exec(String(text || ''))) !== null) {
            match[1].split('\n').map(processRowFromFreeText).filter(Boolean).forEach(row => rows.push(row));
        }
        return rows.join('\n');
    };

    const syncProcessValue = (answerBox, value) => {
        const processInput = findProcessInput(answerBox);
        if (!processInput) return;
        setBackgroundValue(processInput, value);
    };

    const syncProcessInput = (answerBox, lines) => {
        syncProcessValue(answerBox, processValueForLines(lines));
    };

    // A Free-text box is what the learner submits, so its process data
    // follows every change to it, whether recognized or typed.
    const bindFreeTextProcess = answerBox => {
        if (!isFreeTextInput(answerBox) || answerBox.dataset.hand2stackProcessBound === '1') return;
        answerBox.dataset.hand2stackProcessBound = '1';
        const sync = () => syncProcessValue(answerBox, processValueForFreeText(answerBox.value));
        answerBox.addEventListener('input', sync);
        answerBox.addEventListener('change', sync);
    };

    const isFreeTextInput = input => {
        return Boolean(input && String(input.dataset.stackInputType || '').toLowerCase() === 'freetext');
    };

    // Capture each answer box's own Syntax hint once, at bind time. STACK
    // renders the hint as either the `placeholder` or, only while the box is
    // blank, the `value`. A page reloaded with a saved answer has that answer
    // in `value`, so a value is accepted as a hint only when it looks like a
    // label ("f(2)=" / "f(2):"), never a saved answer such as "1+2*sqrt(2)".
    const captureAnswerAnchor = box => {
        if (isFreeTextInput(box) || box.dataset.hand2stackAnchor) {
            return;
        }
        const value = String(box.value || '').trim();
        const hint = String(box.getAttribute('placeholder') || '').trim()
            || (/[=:]$/.test(value) ? value : '');
        if (hint) {
            box.dataset.hand2stackAnchor = hint;
        }
    };

    // STACK input names look like "q43:4_fval": usage id, slot, input name.
    const parseStackInputName = name => {
        const match = /^q(\d+):(\d+)_(.+)$/.exec(String(name || ''));
        return match ? {usage: match[1], slot: match[2], input: match[3]} : null;
    };

    // Research instrumentation (docs/research/event-logging-spec-v1.md). The
    // core keeps traces, sequence numbers and the send queue; the page wiring
    // is injected through `env` so the trace logic can be tested outside a
    // browser. Every entry point is a no-op unless the server enabled logging
    // for this learner, and none of them may throw into the answering workflow.
    const createResearchLogger = env => {
        const SCHEMA = 1;
        const FLUSH_MS = 5000;
        const FLUSH_SIZE = 20;
        const EDIT_IDLE_MS = 1000;
        const MAX_QUEUE = 500;
        const BEACON_BYTES = 60000;
        const FEEDBACK_WINDOW_MS = 5 * 60 * 1000;
        // Learner actions that, after feedback, begin a revision.
        const REVISION_TRIGGERS = ['recognition_started', 'candidate_selected'];
        // Submits after which the next page shows this question's feedback.
        // Next/Previous/Save only store the response.
        const FEEDBACK_SUBMITS = ['check', 'finish'];
        // Actions that end any edit still in progress before they are logged.
        const EDIT_BOUNDARIES = {recognition_started: 'flush', submit_triggered: 'submit'};
        const queue = [];
        const segments = new Map();
        const memory = new Map();
        const trackers = new Set();
        let flushTimer = null;
        let disabled = false;

        const enabled = () => {
            const config = env.getConfig();
            return !disabled && Boolean(config.research && config.research.enabled && config.eventUrl);
        };

        const clip = (value, max = 4000) => {
            const text = value === null || value === undefined ? '' : String(value);
            return text.length > max ? text.slice(0, max) + '…[truncated]' : text;
        };

        const storageKey = key => 'hand2stack:trace:' + key;

        // A trace lives in sessionStorage so it survives the page reload
        // that every quiz Check or Next causes; memory is the fallback.
        const loadTrace = key => {
            let stored = memory.get(key) || null;
            try {
                stored = JSON.parse(env.storage.getItem(storageKey(key)) || 'null') || stored;
            } catch (error) {
                // Private mode or blocked storage: keep the in-memory trace.
            }
            if (stored && typeof stored.id === 'string' && Number.isInteger(stored.seq)) {
                return {state: stored, resumed: true};
            }
            return {state: {id: env.uuid(), seq: 0, pendingSubmit: null, feedback: null}, resumed: false};
        };

        const saveTrace = (key, state) => {
            memory.set(key, state);
            try {
                env.storage.setItem(storageKey(key), JSON.stringify(state));
            } catch (error) {
                // As above.
            }
        };

        const contextFor = (box, options) => {
            const parsed = parseStackInputName(box && box.name);
            if (!parsed) return null;
            return {
                key: parsed.usage + ':' + parsed.slot,
                usage: Number(parsed.usage),
                slot: Number(parsed.slot),
                // Question-level events pass input/modality null explicitly.
                input: 'input' in options ? options.input : parsed.input,
                modality: 'modality' in options ? options.modality : ((box && box._hand2stackModality) || null)
            };
        };

        const takeBatch = maxBytes => {
            const batch = [];
            let bytes = 2;
            while (queue.length && batch.length < 100) {
                const size = JSON.stringify(queue[0]).length + 1;
                if (batch.length && bytes + size > maxBytes) break;
                bytes += size;
                batch.push(queue.shift());
            }
            return batch;
        };

        const requeue = batch => {
            if (disabled) return;
            const room = MAX_QUEUE - queue.length;
            if (room > 0) queue.unshift(...batch.slice(0, room));
            schedule();
        };

        const flush = (unloading = false) => {
            if (flushTimer) {
                env.clearTimeout(flushTimer);
                flushTimer = null;
            }
            if (!enabled()) {
                queue.length = 0;
                return;
            }
            while (queue.length) {
                const batch = takeBatch(unloading ? BEACON_BYTES : 500000);
                Promise.resolve()
                    .then(() => env.send(batch, unloading))
                    .then(result => {
                        if (result && result.disabled) {
                            disabled = true;
                            queue.length = 0;
                        }
                    })
                    .catch(() => requeue(batch));
            }
        };

        const schedule = () => {
            if (queue.length >= FLUSH_SIZE) {
                flush(false);
            } else if (!flushTimer && queue.length) {
                flushTimer = env.setTimeout(() => {
                    flushTimer = null;
                    flush(false);
                }, FLUSH_MS);
            }
        };

        // `type` may be null to only mark learner activity: that starts the
        // page segment and, after feedback, the revision.
        const record = (box, type, payload, options = {}) => {
            const ctx = contextFor(box, options);
            if (!ctx) return;
            const {state, resumed} = loadTrace(ctx.key);
            const push = (eventType, eventPayload) => {
                const now = env.now();
                state.seq += 1;
                queue.push({
                    eventid: env.uuid(),
                    traceid: state.id,
                    pageid: env.pageId,
                    eventseq: state.seq,
                    type: eventType,
                    clienttime: now,
                    elapsedms: Math.max(0, now - segment.startedAt),
                    usage: ctx.usage,
                    slot: ctx.slot,
                    input: ctx.input,
                    modality: ctx.modality,
                    schema: SCHEMA,
                    payload: eventPayload
                });
            };
            let segment = segments.get(ctx.key);
            if (!segment) {
                segment = {startedAt: env.now()};
                segments.set(ctx.key, segment);
                push('interaction_started', Object.assign({resumed, entry: ctx.modality}, env.describeBox(box)));
            }
            const revisionAction = options.activity || (REVISION_TRIGGERS.includes(type) ? type : '');
            if (state.feedback && revisionAction) {
                push('revision_started', {
                    feedbackState: state.feedback.state,
                    previousSubmitted: state.feedback.answers || {},
                    msSinceFeedback: Math.max(0, env.now() - state.feedback.at),
                    firstAction: revisionAction
                });
                state.feedback = null;
            }
            if (type) {
                push(type, payload || {});
            }
            if (type === 'submit_triggered') {
                state.pendingSubmit = payload && FEEDBACK_SUBMITS.includes(payload.submitterKind)
                    ? {answers: payload.answers || {}, at: env.now()}
                    : null;
            } else if (type === 'feedback_observed') {
                state.feedback = {
                    state: payload.state,
                    answers: state.pendingSubmit ? state.pendingSubmit.answers : {},
                    at: env.now()
                };
                state.pendingSubmit = null;
            }
            saveTrace(ctx.key, state);
            schedule();
        };

        const commitEdits = trigger => trackers.forEach(tracker => tracker.commit(trigger));

        const guard = fn => (...args) => {
            if (!enabled()) return undefined;
            try {
                return fn(...args);
            } catch (error) {
                env.warn(error);
                return undefined;
            }
        };

        const log = guard((box, type, payload = {}, options = {}) => {
            if (EDIT_BOUNDARIES[type]) commitEdits(EDIT_BOUNDARIES[type]);
            record(box, type, payload, options);
        });

        // One edit burst becomes one edit_committed with the value before the
        // first keystroke and after the last; keystrokes are never logged.
        // `rebase` adopts a value Hand2STACK itself wrote as the new baseline.
        const editTracker = (box, getValue, describe, options = {}) => {
            const max = options.max || 4000;
            const logOptions = () => (options.logOptions ? options.logOptions() : {});
            let baseline = getValue();
            let burst = null;
            let timer = null;
            const tracker = {
                input: guard(() => {
                    if (!burst) {
                        burst = {before: baseline, startedAt: env.now(), count: 0};
                        record(box, null, null, Object.assign({}, logOptions(), {activity: 'edit_committed'}));
                    }
                    burst.count++;
                    env.clearTimeout(timer);
                    timer = env.setTimeout(() => tracker.commit('idle'), EDIT_IDLE_MS);
                }),
                commit: guard(trigger => {
                    env.clearTimeout(timer);
                    timer = null;
                    if (!burst) return;
                    const current = burst;
                    burst = null;
                    const after = getValue();
                    baseline = after;
                    if (after === current.before) return;
                    record(box, 'edit_committed', Object.assign({}, describe(), {
                        trigger,
                        before: clip(current.before, max),
                        after: clip(after, max),
                        burstMs: Math.max(0, env.now() - current.startedAt),
                        inputEvents: current.count
                    }), logOptions());
                }),
                rebase: () => {
                    if (!burst) baseline = getValue();
                },
                dispose: () => {
                    env.clearTimeout(timer);
                    trackers.delete(tracker);
                }
            };
            trackers.add(tracker);
            return tracker;
        };

        // The submit that this page load is the answer to, if recent enough.
        const pendingSubmit = guard(box => {
            const ctx = contextFor(box, {});
            if (!ctx) return null;
            const {state, resumed} = loadTrace(ctx.key);
            if (!resumed || !state.pendingSubmit) return null;
            if (env.now() - state.pendingSubmit.at > FEEDBACK_WINDOW_MS) {
                state.pendingSubmit = null;
                saveTrace(ctx.key, state);
                return null;
            }
            return state.pendingSubmit;
        });

        return {
            enabled,
            clip,
            log,
            editTracker,
            commitEdits: guard(commitEdits),
            pendingSubmit,
            flush: guard(flush),
            _queue: queue
        };
    };

    // STACK drops the Syntax hint from the page once an empty answer has been
    // submitted, so fill in any missing anchors from the question definition.
    const fetchMissingAnchors = async boxes => {
        const missing = boxes.filter(box => !box.dataset.hand2stackAnchor && parseStackInputName(box.name));
        if (!missing.length || !config.anchorsUrl) return;
        const questions = new Map();
        missing.forEach(box => {
            const parsed = parseStackInputName(box.name);
            const key = parsed.usage + ':' + parsed.slot;
            if (!questions.has(key)) questions.set(key, parsed);
        });
        await Promise.all(Array.from(questions.values()).map(async question => {
            try {
                const formData = new FormData();
                formData.append('usage', question.usage);
                formData.append('slot', question.slot);
                formData.append('sesskey', config.sesskey);
                const response = await fetch(config.anchorsUrl, {
                    method: 'POST',
                    body: formData,
                    credentials: 'same-origin'
                });
                const data = await parseJsonResponse(response);
                if (!response.ok || !data.success) {
                    throw requestError(data, response);
                }
                missing.forEach(box => {
                    const parsed = parseStackInputName(box.name);
                    if (parsed.usage !== question.usage || parsed.slot !== question.slot) return;
                    const anchor = data.anchors && data.anchors[parsed.input];
                    if (anchor && !box.dataset.hand2stackAnchor) box.dataset.hand2stackAnchor = anchor;
                });
            } catch (error) {
                window.console.warn('[hand2stack] could not load answer anchors:', error);
            }
        }));
    };

    // Other STACK inputs that live in the same question as a free-text box,
    // so one photo of the full working can also fill in their small answer
    // boxes (e.g. f(2)= / g(1)= inputs alongside a "show your work" box).
    const findSiblingAnswerBoxes = answerBox => {
        const question = answerBox.closest('.que');
        if (!question) {
            return [];
        }
        return findAnswerBoxes().filter(box => box !== answerBox
            && question.contains(box)
            && !isFreeTextInput(box));
    };

    const normalizeAnchorText = value => {
        return String(value || '')
            .replace(/\\\(|\\\)|\$/g, '')
            .replace(/\s+/g, '')
            // Japanese input often uses the full-width "：" and "＝".
            .replace(/[=:：＝]+$/, '');
    };

    const matchableLineText = line => {
        return String((line && (line.math || line.raw || line.latex)) || '');
    };

    // The extracted maths of "Answer: $1<x \\leq 5$" no longer contains its
    // prose label, so a label is also looked for in the recognized row.
    const matchableLineTexts = line => {
        const texts = [matchableLineText(line), String((line && line.raw) || ''), String((line && line.latex) || '')];
        return texts.filter((text, index) => text && texts.indexOf(text) === index);
    };

    // Find the anchor (e.g. "g(1)") at the start of a recognized line and
    // return just the value after it. The value stops at the next relation
    // marker, so a restated decimal is dropped. Recognized lines are LaTeX,
    // e.g. "g(1)=2+\frac{1}{\sqrt{2}} \approx 2.71" -> "2+\frac{1}{\sqrt{2}}".
    // Whitespace inside the value is kept: collapsing it would turn
    // "\cdot x" into the unknown command "\cdotx".
    const extractAnchoredValue = (anchor, lineText) => {
        const normalizedAnchor = normalizeAnchorText(anchor);
        if (!normalizedAnchor) {
            return null;
        }
        const anchorPattern = Array.from(normalizedAnchor)
            .map(char => char.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'))
            .join('\\s*');
        const text = String(lineText || '').replace(/\\(?:left|right)(?![a-zA-Z])/g, '');
        // "Answer: ..." labels a value as well as "f(2) = ..." does; ":=" does not.
        const head = text.match(new RegExp('^\\s*' + anchorPattern + '\\s*(?:~~|≈|\\\\approx|\\\\simeq|[=＝]|[:：](?!=))\\s*', 'i'));
        if (!head) {
            return null;
        }
        let rest = text.slice(head[0].length);
        // After "f(2) =" a further "=" restates the value; after "Answer:"
        // the value itself may be an equation such as "x=3".
        const labelled = /[:：]\s*$/.test(head[0]);
        // "<=", ">=", "!=" and "#=" are part of the value, not a new relation.
        const next = labelled ? null : /(^|[^<>!#:])(?:~~|≈|\\approx|\\simeq|=)/.exec(rest);
        if (next) {
            rest = rest.slice(0, next.index + next[1].length);
        }
        rest = rest.trim();
        return rest || null;
    };

    const flashAutofilledBox = box => {
        const previousOutline = box.style.outline;
        box.style.outline = '2px solid #3978c5';
        window.setTimeout(() => {
            box.style.outline = previousOutline;
        }, 2000);
    };

    // The data layer between recognition and the answer boxes. One recognized
    // working is turned into one structured result per anchor, e.g.
    //   [{anchor: 'f(2)=', expr: '\frac{3}{2}', lineIndex: 4},
    //    {anchor: 'g(1)=', expr: null, lineIndex: -1}]
    // Scan from the end: when a label is restated after an earlier derivation
    // step (e.g. "g(1)=..." mid-working, then "g(1)~~..." as the final
    // answer), the later line is the intended answer.
    // A box whose own Syntax hint is a label ("x=") expects only what follows
    // it, so a recognized "x=3" is inserted as "3". A value that goes on to
    // another relation or connective ("x=2 or x=3") is inserted whole.
    const stripOwnAnchor = (anchor, value) => {
        const rest = extractAnchoredValue(anchor, value);
        if (!rest || /[=<>#]/.test(rest) || /(^|[^A-Za-z])(?:or|and)([^A-Za-z]|$)/.test(rest)) {
            return value;
        }
        return rest;
    };

    // A prose label such as "Answer:" or "答え:" (no digits, brackets or
    // operators) names the final result rather than a specific quantity like
    // "f(2)=". Learners often just underline that result instead of writing
    // the label.
    const isProseAnchor = anchor => {
        return /^[A-Za-z\u3040-\u30ff\u3400-\u9fff\s]{2,}$/u.test(normalizeAnchorText(anchor));
    };

    const isMathLine = line => {
        return Boolean(line && !line.synthetic && (line.math || line.stack)
            && String(line.type || 'expression').toLowerCase() !== 'text');
    };

    const extractAnchoredAnswers = (anchors, lines) => {
        const results = anchors.map(anchor => {
            for (let i = lines.length - 1; i >= 0; i--) {
                const expr = matchableLineTexts(lines[i])
                    .map(text => extractAnchoredValue(anchor, text))
                    .find(Boolean);
                if (expr) {
                    return {anchor, expr, lineIndex: i};
                }
            }
            return {anchor, expr: null, lineIndex: -1};
        });
        // A missing prose label falls back to the last mathematical line not
        // already claimed by another label. The caller marks it for checking.
        const used = new Set(results.filter(result => result.expr).map(result => result.lineIndex));
        results.forEach(result => {
            if (result.expr || !isProseAnchor(result.anchor)) return;
            for (let i = lines.length - 1; i >= 0; i--) {
                if (used.has(i) || !isMathLine(lines[i])) continue;
                const expr = matchableLineText(lines[i]).trim();
                if (!expr) continue;
                used.add(i);
                Object.assign(result, {expr, lineIndex: i, fallback: true});
                return;
            }
        });
        return results;
    };

    // Generic across questions: it never hardcodes which answers a question
    // needs, it only matches whatever Syntax hints the teacher already set.
    // The free-text box is the source; its anchored sibling boxes are targets.
    const applyMatchedAnswers = async (sourceBox, lines, isCurrent = () => true, onTargetResult = null) => {
        if (!isFreeTextInput(sourceBox) || !Array.isArray(lines) || !lines.length) {
            return [];
        }
        const report = onTargetResult || (() => null);
        const targets = findSiblingAnswerBoxes(sourceBox)
            .filter(box => box.dataset.hand2stackAnchor);
        const extracted = extractAnchoredAnswers(targets.map(box => box.dataset.hand2stackAnchor), lines);

        for (let index = 0; index < targets.length; index++) {
            if (!isCurrent()) return extracted;
            const box = targets[index];
            const result = extracted[index];
            const logOptions = {modality: sourceBox._hand2stackModality || null};
            const logAnchor = (status, value, previousValue) => research.log(box, 'answer_inserted', {
                via: 'anchor_autofill',
                status,
                value: value === null ? null : research.clip(value),
                previousValue: research.clip(previousValue),
                anchor: normalizeAnchorText(result.anchor),
                recognized: research.clip(result.expr),
                lineIndex: result.lineIndex === undefined ? null : result.lineIndex
            }, logOptions);
            if (!result.expr) {
                report(box, Object.assign({status: 'notfound'}, result));
                logAnchor('notfound', null, box.value);
                continue;
            }
            const valueBeforeValidation = box.value;
            const validationStartedAt = Date.now();
            try {
                const cleanStack = await postLatex(result.expr);
                // Recognition and STACK validation are asynchronous. Never let
                // an older result, or a result validated while the learner was
                // typing, replace the current answer.
                if (!isCurrent()) return extracted;
                research.log(box, 'validation_completed', {
                    source: 'h2s_convert',
                    expression: research.clip(result.expr),
                    stack: research.clip(cleanStack),
                    valid: Boolean(cleanStack),
                    errorCode: null,
                    message: '',
                    latencyMs: Date.now() - validationStartedAt
                }, logOptions);
                result.stack = cleanStack || '';
                if (!cleanStack) {
                    report(box, Object.assign({status: 'convertfailed'}, result));
                    logAnchor('convertfailed', null, valueBeforeValidation);
                } else if (box.value === valueBeforeValidation) {
                    const status = result.fallback ? 'fallback_last_line' : 'filled';
                    setAnswerValue(box, cleanStack);
                    flashAutofilledBox(box);
                    report(box, Object.assign({}, result, {status}));
                    logAnchor(status, cleanStack, valueBeforeValidation);
                }
            } catch (error) {
                window.console.warn('[hand2stack] anchor match could not be validated:', result.anchor, error);
                if (isCurrent()) {
                    research.log(box, 'validation_completed', {
                        source: 'h2s_convert',
                        expression: research.clip(result.expr),
                        stack: '',
                        valid: false,
                        errorCode: error.code || null,
                        message: research.clip(error.message, 300),
                        latencyMs: Date.now() - validationStartedAt
                    }, logOptions);
                    report(box, Object.assign({status: 'convertfailed'}, result));
                    logAnchor('convertfailed', null, valueBeforeValidation);
                }
            }
        }
        return extracted;
    };

    const setTargetStatus = (box, kind, text) => {
        const status = box._hand2stackStatus;
        if (!status) return;
        window.clearTimeout(status._fadeTimer);
        status._kind = kind;
        status.textContent = text;
        status.style.color = kind === 'success' ? '#1a7f37' : '#b45309';
        status.style.opacity = text ? '1' : '0';
        status.style.display = text ? 'inline-block' : 'none';
        if (kind === 'success' && text) {
            status._fadeTimer = window.setTimeout(() => {
                status.style.opacity = '0';
                status._fadeTimer = window.setTimeout(() => {
                    status.style.display = 'none';
                }, 400);
            }, 3000);
        }
    };

    // Keep a per-target record of what recognition proposed and what the
    // learner did with it, so the process can be inspected or logged later.
    const reportTargetResult = (box, result) => {
        const label = normalizeAnchorText(result.anchor);
        box._hand2stackExtraction = {
            anchor: label,
            recognized: result.expr,
            stack: result.stack || '',
            sourceLine: result.lineIndex,
            autoFilled: result.status === 'filled' || result.status === 'fallback_last_line',
            fallback: result.status === 'fallback_last_line',
            studentEdited: false
        };
        box.dataset.hand2stackAutoFilled = box._hand2stackExtraction.autoFilled ? '1' : '0';
        delete box.dataset.hand2stackStudentEdited;
        if (result.status === 'filled') {
            setTargetStatus(box, 'success', '✓ ' + (config.extractedfromworking || 'Extracted from your working'));
        } else if (result.status === 'fallback_last_line') {
            // A guess, not a match: keep the request to check it on screen.
            setTargetStatus(box, 'warning', (config.filledfromlastline
                || 'No line starting with {$a} was found, so this was filled from the last line of your working. Please check it.')
                .replace('{$a}', label));
        } else if (result.status === 'notfound') {
            setTargetStatus(box, 'warning', (config.anchornotfound
                || 'Could not find {$a} in the recognized working. Please enter it manually.').replace('{$a}', label));
        } else {
            setTargetStatus(box, 'warning', (config.anchorconvertfailed
                || 'Found {$a} in the recognized working, but could not convert it. Please enter it manually.')
                .replace('{$a}', label));
        }
    };

    // A target box is filled from the free-text working, so it gets no capture
    // buttons of its own: only a status message, and it stays fully editable.
    const setupTargetBox = box => {
        if (box.dataset.hand2stackBound === '1') return;
        box.dataset.hand2stackBound = '1';
        box.dataset.hand2stackTarget = '1';
        if (box.tagName === 'INPUT') {
            box.style.width = 'min(260px, 45vw)';
            box.style.maxWidth = '100%';
        }
        const status = document.createElement('span');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.style.cssText = 'display:none;margin-left:10px;font-size:0.875rem;vertical-align:middle;' +
            'transition:opacity 0.4s';
        box.insertAdjacentElement('afterend', status);
        box._hand2stackStatus = status;
        box.addEventListener('input', event => {
            if (!event.isTrusted) return;
            if (box._hand2stackExtraction) box._hand2stackExtraction.studentEdited = true;
            box.dataset.hand2stackStudentEdited = '1';
            // A "please enter it manually" hint has served its purpose once they type.
            if (status._kind === 'warning') setTargetStatus(box, 'warning', '');
        });
    };

    const formatFreeTextWorking = (recognizedText, rawAscii, rawLatex, stackResult, lines) => {
        const mixedText = String(recognizedText || '').replace(/\r\n?/g, '\n').trim();
        if (mixedText) return mixedText;
        let working = String(rawAscii || '').replace(/\r\n?/g, '\n').trim();
        if (!working && Array.isArray(lines)) {
            working = lines.map(line => String(line.stack || line.math || line.text || '').trim())
                .filter(Boolean).join('\n');
        }
        if (!working) {
            const latex = String(rawLatex || '').replace(/\r\n?/g, '\n').trim();
            if (latex) {
                return '\\[\n' + latex + '\n\\]';
            }
            working = String(stackResult || '').replace(/\r\n?/g, '\n').trim();
        }
        if (!working) {
            return '';
        }

        const workingLines = working.split('\n');
        if (workingLines.length >= 2
                && workingLines[0].trim() === '`'
                && workingLines[workingLines.length - 1].trim() === '`') {
            return working;
        }
        return '`\n' + working + '\n`';
    };

    const postImage = async (url, file, extra = {}) => {
        if (!url) {
            throw new Error('Recognition endpoint is not configured.');
        }

        const formData = new FormData();
        formData.append('image', file);
        formData.append('sesskey', config.sesskey);
        Object.keys(extra).forEach(key => formData.append(key, extra[key]));

        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });
        const data = await parseJsonResponse(response);

        if (!response.ok || !data.success) {
            throw requestError(data, response);
        }

        return data;
    };

    const postLatex = async (latex) => {
        if (!config.convertUrl) {
            throw new Error('Conversion endpoint is not configured.');
        }

        const formData = new FormData();
        formData.append('latex', latex);
        formData.append('sesskey', config.sesskey);

        const response = await fetch(config.convertUrl, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });
        const data = await parseJsonResponse(response);

        if (!response.ok || !data.success) {
            throw requestError(data, response);
        }

        return data.stack || '';
    };

    const postAscii = async (ascii) => {
        if (!config.convertUrl) {
            throw new Error('Conversion endpoint is not configured.');
        }
        const formData = new FormData();
        formData.append('ascii', ascii);
        formData.append('sesskey', config.sesskey);
        const response = await fetch(config.convertUrl, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });
        const data = await parseJsonResponse(response);
        if (!response.ok || !data.success || !data.valid) {
            throw requestError(data, response);
        }
        return data.stack || '';
    };

    const postStrokes = async (strokes) => {
        const formData = new FormData();
        formData.append('strokes', JSON.stringify(strokes));
        formData.append('sesskey', config.sesskey);
        const response = await fetch(config.strokesUrl, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });
        const data = await parseJsonResponse(response);
        if (!response.ok || !data.success) {
            throw requestError(data, response);
        }
        return data;
    };

    const requestError = (data, response) => {
        const error = new Error((data && data.error) || ('HTTP ' + response.status));
        error.code = (data && data.error_code) || null;
        return error;
    };

    const parseJsonResponse = async response => {
        try {
            return await response.json();
        } catch (error) {
            throw new Error('HTTP ' + response.status);
        }
    };

    const createTextarea = (value, readonly) => {
        const ta = document.createElement('textarea');
        ta.value = value || '';
        ta.readOnly = readonly;
        ta.rows = 2;
        ta.style.width = '100%';
        ta.style.boxSizing = 'border-box';
        ta.style.marginTop = '4px';
        ta.style.marginBottom = '8px';
        ta.style.fontSize = '13px';
        ta.style.fontFamily = 'monospace';
        return ta;
    };

    const createChangeHighlighter = textarea => {
        const wrapper = document.createElement('div');
        const backdrop = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.background = '#fff';
        wrapper.style.marginTop = '4px';
        wrapper.style.marginBottom = '8px';
        backdrop.setAttribute('aria-hidden', 'true');
        backdrop.style.cssText = [
            'position:absolute', 'inset:0', 'overflow:hidden', 'pointer-events:none',
            'z-index:2', 'white-space:pre-wrap', 'overflow-wrap:break-word',
            'color:#1f2937', 'background:transparent'
        ].join(';');
        textarea.style.position = 'relative';
        textarea.style.zIndex = '1';
        textarea.style.margin = '0';
        textarea.style.background = 'transparent';
        wrapper.append(backdrop, textarea);

        let previousValue = '';
        let edited = [];
        const render = () => {
            backdrop.replaceChildren();
            let start = 0;
            for (let i = 0; i <= previousValue.length; i++) {
                if (i < previousValue.length && edited[i] === edited[start]) continue;
                const span = document.createElement('span');
                span.textContent = previousValue.slice(start, i);
                if (edited[start]) {
                    span.style.color = '#0b63ce';
                }
                backdrop.appendChild(span);
                start = i;
            }
            if (previousValue.endsWith('\n')) backdrop.appendChild(document.createTextNode('\n '));
            backdrop.scrollTop = textarea.scrollTop;
            backdrop.scrollLeft = textarea.scrollLeft;
        };
        const syncMetrics = () => {
            const style = window.getComputedStyle(textarea);
            ['padding', 'border', 'font', 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight',
                'letterSpacing', 'textAlign', 'boxSizing', 'borderRadius'].forEach(property => {
                backdrop.style[property] = style[property];
            });
            backdrop.style.width = textarea.offsetWidth + 'px';
            backdrop.style.height = textarea.offsetHeight + 'px';
        };
        const reset = value => {
            previousValue = String(value || '');
            edited = Array(previousValue.length).fill(false);
            render();
            window.requestAnimationFrame(syncMetrics);
        };
        const compare = (originalValue, currentValue) => {
            const original = String(originalValue || '');
            const current = String(currentValue || '');
            let prefix = 0;
            while (prefix < original.length && prefix < current.length
                    && original[prefix] === current[prefix]) prefix++;
            let originalSuffix = original.length;
            let currentSuffix = current.length;
            while (originalSuffix > prefix && currentSuffix > prefix
                    && original[originalSuffix - 1] === current[currentSuffix - 1]) {
                originalSuffix--;
                currentSuffix--;
            }
            previousValue = current;
            edited = Array(current.length).fill(false);
            for (let i = prefix; i < currentSuffix; i++) edited[i] = true;
            render();
            window.requestAnimationFrame(syncMetrics);
        };
        textarea.addEventListener('input', () => {
            const nextValue = textarea.value;
            let prefix = 0;
            while (prefix < previousValue.length && prefix < nextValue.length
                    && previousValue[prefix] === nextValue[prefix]) prefix++;
            let oldSuffix = previousValue.length;
            let newSuffix = nextValue.length;
            while (oldSuffix > prefix && newSuffix > prefix
                    && previousValue[oldSuffix - 1] === nextValue[newSuffix - 1]) {
                oldSuffix--;
                newSuffix--;
            }
            edited = edited.slice(0, prefix)
                .concat(Array(newSuffix - prefix).fill(true), edited.slice(oldSuffix));
            previousValue = nextValue;
            render();
        });
        textarea.addEventListener('scroll', render);
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(syncMetrics);
            observer.observe(textarea);
        }
        return {wrapper, backdrop, reset, compare, syncMetrics};
    };

    const createResultPanel = () => {
        const panel = document.createElement('div');
        const choiceName = 'local-hand2stack-line-choice-' + Math.random().toString(36).slice(2);
        panel.style.marginTop = '8px';
        panel.style.padding = '12px';
        panel.style.border = '1px solid #d8e1e8';
        panel.style.borderRadius = '6px';
        panel.style.background = '#f8fbfd';
        panel.style.display = 'none';
        // Follow the question content width rather than the viewport. Moodle's question
        // information column makes the usable area narrower, especially on iPad.
        panel.style.width = 'auto';
        panel.style.maxWidth = '100%';
        panel.style.minWidth = '0';
        panel.style.boxSizing = 'border-box';

        const freeTextHeader = document.createElement('div');
        freeTextHeader.style.display = 'none';
        freeTextHeader.style.justifyContent = 'space-between';
        freeTextHeader.style.alignItems = 'center';
        freeTextHeader.style.gap = '16px';
        freeTextHeader.style.flexWrap = 'wrap';
        freeTextHeader.style.marginBottom = '18px';
        const freeTextHeading = document.createElement('strong');
        freeTextHeading.textContent = config.confirmrecognition || 'Review recognized content';
        freeTextHeading.style.fontSize = '18px';
        const freeTextWorkflow = document.createElement('span');
        freeTextWorkflow.textContent = config.freetextworkflow || 'Photo / iPad handwriting → Free text';
        freeTextWorkflow.style.color = '#667085';
        freeTextWorkflow.style.fontSize = '14px';
        freeTextHeader.append(freeTextHeading, freeTextWorkflow);

        const title = document.createElement('div');
        title.textContent = config.recognizedresults || 'Recognized results';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '4px';

        const instruction = document.createElement('div');
        instruction.textContent = config.selectanswer || 'Select the answer to insert into STACK:';
        instruction.style.marginBottom = '8px';

        const options = document.createElement('div');
        options.style.display = 'grid';
        options.style.gap = '6px';
        options.style.marginBottom = '8px';
        options.style.minWidth = '0';
        // Long recognitions scroll inside the list so the editable column stays in view.
        options.style.position = 'relative';
        options.style.maxHeight = 'min(60vh, 560px)';
        options.style.overflowY = 'auto';
        options.style.overscrollBehavior = 'contain';
        options.style.paddingRight = '4px';
        options.style.scrollbarWidth = 'thin';

        const formatTitle = document.createElement('div');
        formatTitle.textContent = config.recognizedformat || 'Recognized format:';
        formatTitle.style.fontWeight = 'bold';

        const formatTabs = document.createElement('div');
        formatTabs.setAttribute('role', 'tablist');
        formatTabs.style.display = 'flex';
        formatTabs.style.gap = '4px';
        formatTabs.style.marginTop = '0';

        const latexTab = document.createElement('button');
        latexTab.type = 'button';
        latexTab.textContent = config.rawlatex || 'LaTeX';
        latexTab.setAttribute('role', 'tab');

        const asciiTab = document.createElement('button');
        asciiTab.type = 'button';
        asciiTab.textContent = config.asciimath || 'ASCII';
        asciiTab.setAttribute('role', 'tab');

        [latexTab, asciiTab].forEach(tab => {
            tab.style.padding = '2px 7px';
            tab.style.border = '0';
            tab.style.borderRadius = '3px';
            tab.style.fontSize = '12px';
            tab.style.cursor = 'pointer';
        });
        formatTabs.appendChild(asciiTab);
        formatTabs.appendChild(latexTab);

        const rawTextarea = createTextarea('', true);
        rawTextarea.setAttribute('role', 'tabpanel');
        rawTextarea.style.marginTop = '0';

        const formatRows = document.createElement('div');
        formatRows.style.display = 'grid';
        formatRows.style.gap = '6px';
        formatRows.style.margin = '6px 0 8px';

        const stackTitle = document.createElement('label');
        stackTitle.textContent = config.stackpreview || 'STACK input preview:';
        stackTitle.style.display = 'block';
        stackTitle.style.fontWeight = 'bold';
        const stackTextarea = createTextarea('', false);
        const changeHighlighter = createChangeHighlighter(stackTextarea);
        const stackTextareaId = 'local-hand2stack-stack-preview-' + Math.random().toString(36).slice(2);
        stackTextarea.id = stackTextareaId;
        stackTitle.setAttribute('for', stackTextareaId);

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.textContent = config.insertanswer || 'Insert answer';
        applyBtn.style.padding = '4px 8px';
        applyBtn.style.cursor = 'pointer';
        applyBtn.style.display = 'block';
        applyBtn.style.marginLeft = 'auto';

        const insertBtn = document.createElement('button');
        insertBtn.type = 'button';
        insertBtn.textContent = config.insertfreetext || 'Insert at cursor';
        insertBtn.style.padding = '4px 8px';
        insertBtn.style.cursor = 'pointer';
        insertBtn.style.display = 'none';

        const actionButtons = document.createElement('div');
        actionButtons.style.display = 'flex';
        actionButtons.style.justifyContent = 'flex-end';
        actionButtons.style.gap = '8px';
        actionButtons.append(insertBtn, applyBtn);

        const freeTextHelp = document.createElement('div');
        freeTextHelp.textContent = (config.freetexthelp
            || 'Edit text directly; formulas use ASCII math markers. Paragraphs and line breaks are preserved.')
            + ' ' + (config.editedhighlighthelp || 'Blue text shows your changes.')
            + ' ' + (config.directsubmithelp || 'Edits here are used directly as your Free-text answer.');
        freeTextHelp.style.display = 'none';
        freeTextHelp.style.color = '#667085';
        freeTextHelp.style.fontSize = '13px';
        freeTextHelp.style.marginTop = '8px';

        const candidateSummary = document.createElement('div');
        candidateSummary.style.display = 'none';
        candidateSummary.style.marginBottom = '14px';
        const candidateSummaryTitle = document.createElement('div');
        candidateSummaryTitle.textContent = config.detectedcandidates
            || 'Detected mathematical candidates (not automatically treated as answers)';
        candidateSummaryTitle.style.fontWeight = 'bold';
        candidateSummaryTitle.style.marginBottom = '6px';
        const candidateSummaryList = document.createElement('div');
        candidateSummaryList.style.display = 'grid';
        candidateSummaryList.style.gap = '6px';
        candidateSummary.append(candidateSummaryTitle, candidateSummaryList);

        const appendHint = document.createElement('div');
        appendHint.textContent = config.appendhint || 'Keep the existing answer and add this section.';
        appendHint.style.display = 'none';
        appendHint.style.color = '#667085';
        appendHint.style.fontSize = '13px';
        appendHint.style.marginRight = 'auto';
        actionButtons.prepend(appendHint);

        const requestStatus = document.createElement('div');
        requestStatus.setAttribute('role', 'status');
        requestStatus.setAttribute('aria-live', 'polite');
        requestStatus.style.display = 'none';
        requestStatus.style.marginTop = '8px';
        requestStatus.style.padding = '6px 8px';
        requestStatus.style.borderRadius = '3px';
        requestStatus.style.fontSize = '13px';

        const reviewGrid = document.createElement('div');
        reviewGrid.style.display = 'grid';
        reviewGrid.style.gap = '16px';
        reviewGrid.style.alignItems = 'start';
        reviewGrid.style.minWidth = '0';

        const candidateColumn = document.createElement('section');
        candidateColumn.style.minWidth = '0';
        candidateColumn.style.overflow = 'hidden';
        const sourceTitle = document.createElement('div');
        sourceTitle.textContent = config.originalwork || 'Original work';
        sourceTitle.style.fontWeight = 'bold';
        sourceTitle.style.marginBottom = '8px';
        sourceTitle.style.display = 'none';
        const sourcePreview = document.createElement('img');
        sourcePreview.alt = config.originalwork || 'Original work';
        sourcePreview.draggable = false;
        sourcePreview.style.display = 'block';
        sourcePreview.style.width = '100%';
        sourcePreview.style.height = '520px';
        sourcePreview.style.objectFit = 'contain';
        sourcePreview.style.background = '#fff';
        sourcePreview.style.transformOrigin = 'center center';
        sourcePreview.style.userSelect = 'none';
        sourcePreview.style.transition = 'transform 120ms ease-out';

        const sourceViewer = document.createElement('div');
        sourceViewer.style.display = 'none';
        sourceViewer.style.position = 'relative';
        sourceViewer.style.overflow = 'hidden';
        sourceViewer.style.background = '#fff';
        sourceViewer.style.border = '1px solid #d8e1e8';
        sourceViewer.style.borderRadius = '4px';
        sourceViewer.style.touchAction = 'pan-y';
        sourceViewer.appendChild(sourcePreview);

        const zoomControls = document.createElement('div');
        zoomControls.style.cssText = 'position:absolute;right:8px;top:8px;display:flex;gap:4px;z-index:1';
        const makeZoomButton = (text, label) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = text;
            button.title = label;
            button.setAttribute('aria-label', label);
            button.className = 'btn btn-light';
            button.style.cssText = 'min-width:34px;height:34px;padding:2px 8px;border:1px solid #aeb8c2;box-shadow:0 1px 3px rgba(0,0,0,.12)';
            return button;
        };
        const zoomOut = makeZoomButton('−', config.zoomout || 'Zoom out');
        const zoomReset = makeZoomButton('100%', config.resetzoom || 'Reset zoom');
        const zoomIn = makeZoomButton('+', config.zoomin || 'Zoom in');
        zoomControls.append(zoomOut, zoomReset, zoomIn);
        sourceViewer.appendChild(zoomControls);

        let imageScale = 1;
        let imageX = 0;
        let imageY = 0;
        let imageDrag = null;
        const renderImageTransform = () => {
            sourcePreview.style.transform = 'translate3d(' + imageX + 'px,' + imageY + 'px,0) scale(' + imageScale + ')';
            sourceViewer.style.cursor = imageScale > 1 ? (imageDrag ? 'grabbing' : 'grab') : 'default';
            sourceViewer.style.touchAction = imageScale > 1 ? 'none' : 'pan-y';
            zoomOut.disabled = imageScale <= 1;
            zoomIn.disabled = imageScale >= 4;
            zoomReset.textContent = Math.round(imageScale * 100) + '%';
        };
        const setImageScale = scale => {
            imageScale = Math.max(1, Math.min(4, Math.round(scale * 4) / 4));
            if (imageScale === 1) {
                imageX = 0;
                imageY = 0;
            }
            renderImageTransform();
        };
        const resetImageView = () => setImageScale(1);
        zoomOut.addEventListener('click', () => setImageScale(imageScale - 0.25));
        zoomIn.addEventListener('click', () => setImageScale(imageScale + 0.25));
        zoomReset.addEventListener('click', resetImageView);
        sourceViewer.addEventListener('pointerdown', event => {
            if (imageScale <= 1 || event.target.closest('button')) return;
            event.preventDefault();
            imageDrag = {id: event.pointerId, x: event.clientX, y: event.clientY, imageX, imageY};
            renderImageTransform();
        });
        sourceViewer.addEventListener('pointermove', event => {
            if (!imageDrag || imageDrag.id !== event.pointerId) return;
            event.preventDefault();
            imageX = imageDrag.imageX + event.clientX - imageDrag.x;
            imageY = imageDrag.imageY + event.clientY - imageDrag.y;
            renderImageTransform();
        });
        const stopImageDrag = event => {
            if (!imageDrag || imageDrag.id !== event.pointerId) return;
            imageDrag = null;
            renderImageTransform();
        };
        sourceViewer.addEventListener('pointerup', stopImageDrag);
        sourceViewer.addEventListener('pointercancel', stopImageDrag);
        sourceViewer.addEventListener('pointerleave', stopImageDrag);
        sourceViewer.title = config.dragimage || 'Drag to inspect the enlarged image';
        renderImageTransform();
        candidateColumn.append(title, instruction, options, sourceTitle, sourceViewer);

        const recognizedColumn = document.createElement('section');
        recognizedColumn.style.minWidth = '0';
        recognizedColumn.style.padding = '0 4px';

        const editableHeader = document.createElement('div');
        editableHeader.style.display = 'flex';
        editableHeader.style.justifyContent = 'space-between';
        editableHeader.style.alignItems = 'center';
        editableHeader.style.gap = '8px';
        editableHeader.append(formatTitle, formatTabs);

        const convertedColumn = document.createElement('section');
        convertedColumn.style.minWidth = '0';
        convertedColumn.style.paddingTop = '10px';
        convertedColumn.style.borderTop = '1px solid #e2e6ea';
        convertedColumn.style.marginTop = '10px';
        convertedColumn.style.display = 'none';
        convertedColumn.append(stackTitle, changeHighlighter.wrapper, freeTextHelp);
        recognizedColumn.append(editableHeader, formatRows, rawTextarea, candidateSummary,
            convertedColumn, actionButtons, requestStatus);
        reviewGrid.append(candidateColumn, recognizedColumn);

        const updateReviewLayout = () => {
            const width = panel.getBoundingClientRect().width;
            const useColumns = panel._freeTextMode
                ? !isMobileOrTablet
                : (!isMobileOrTablet && width >= 820);
            reviewGrid.style.gridTemplateColumns = useColumns
                ? 'minmax(0, 1fr) minmax(0, 1fr)'
                : 'minmax(0, 1fr)';
        };
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(updateReviewLayout);
            observer.observe(panel);
            panel._reviewResizeObserver = observer;
        }

        panel.append(freeTextHeader, reviewGrid);

        panel._options = options;
        panel._freeTextHeader = freeTextHeader;
        panel._instruction = instruction;
        panel._formatTitle = formatTitle;
        panel._formatTabs = formatTabs;
        panel._rawTextarea = rawTextarea;
        panel._formatRows = formatRows;
        panel._stackTitle = stackTitle;
        panel._reviewGrid = reviewGrid;
        panel._candidateColumn = candidateColumn;
        panel._sourceTitle = sourceTitle;
        panel._sourceViewer = sourceViewer;
        panel._sourcePreview = sourcePreview;
        panel._resetImageView = resetImageView;
        panel._recognizedColumn = recognizedColumn;
        panel._editableHeader = editableHeader;
        panel._convertedColumn = convertedColumn;
        panel._updateReviewLayout = updateReviewLayout;
        panel._latexTab = latexTab;
        panel._asciiTab = asciiTab;
        panel._stackTextarea = stackTextarea;
        panel._changeHighlighter = changeHighlighter;
        panel._actionButtons = actionButtons;
        panel._applyBtn = applyBtn;
        panel._insertBtn = insertBtn;
        panel._freeTextHelp = freeTextHelp;
        panel._candidateSummary = candidateSummary;
        panel._candidateSummaryList = candidateSummaryList;
        panel._appendHint = appendHint;
        panel._requestStatus = requestStatus;
        panel._choiceName = choiceName;

        return panel;
    };

    const setRequestStatus = (panel, message = '', isError = false) => {
        if (!panel || !panel._requestStatus) return;
        panel._requestStatus.textContent = message;
        panel._requestStatus.style.display = message ? 'block' : 'none';
        panel._requestStatus.style.background = isError ? '#f8d7da' : '#eef6ff';
        panel._requestStatus.style.color = isError ? '#842029' : '#24496b';
        panel._requestStatus.style.border = isError ? '1px solid #f1aeb5' : '1px solid #b8d4ee';
    };

    const createMobilePanel = () => {
        const panel = document.createElement('div');
        panel.style.marginTop = '8px';
        panel.style.padding = '8px';
        panel.style.border = '1px solid #ddd';
        panel.style.background = '#f8fbff';
        panel.style.display = 'none';

        const title = document.createElement('div');
        title.textContent = config.mobilebtn || 'Mobile Math Upload';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '8px';

        const tip = document.createElement('div');
        tip.textContent = 'Scan the QR code with your phone, log in if needed, and upload the image.';
        tip.style.marginBottom = '8px';

        const qrImg = document.createElement('img');
        qrImg.style.display = 'block';
        qrImg.style.maxWidth = '220px';
        qrImg.style.border = '1px solid #ddd';
        qrImg.style.marginBottom = '8px';

        const link = document.createElement('a');
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.wordBreak = 'break-all';
        link.style.display = 'block';
        link.style.marginBottom = '8px';

        const warning = document.createElement('div');
        warning.style.display = 'none';
        warning.style.marginBottom = '8px';
        warning.style.padding = '8px';
        warning.style.border = '1px solid #f0ad4e';
        warning.style.background = '#fff8e5';
        warning.style.color = '#6b4b00';

        const status = document.createElement('div');
        status.textContent = 'Session not created';
        status.style.color = '#555';

        panel.appendChild(title);
        panel.appendChild(tip);
        panel.appendChild(qrImg);
        panel.appendChild(link);
        panel.appendChild(warning);
        panel.appendChild(status);

        panel._qrImg = qrImg;
        panel._link = link;
        panel._warning = warning;
        panel._status = status;
        return panel;
    };

    const escapeHtml = (value) => {
        return String(value || '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    };

    const renderLatex = (latex) => {
        const value = String(latex || '').trim();
        return value ? '\\(' + escapeHtml(value) + '\\)' : '';
    };

    // Moodle loads MathJax 2 with delayStartupUntil=configured and only calls
    // Hub.Configured() once its filter finds an equation on the page. When the
    // question text has no math, queued typesets would wait until STACK returns
    // validation output, so start MathJax through Moodle's own loader.
    let mathJax2ConfigPromise = null;
    const ensureMathJax2Configured = mathJax => {
        if (mathJax.isReady) return Promise.resolve();
        if (!mathJax2ConfigPromise) {
            mathJax2ConfigPromise = new Promise(resolve => {
                const fallback = () => {
                    if (!mathJax.isReady && typeof mathJax.Hub.Configured === 'function') {
                        mathJax.Hub.Configured();
                    }
                    resolve();
                };
                if (typeof window.require !== 'function') {
                    fallback();
                    return;
                }
                window.require(['filter_mathjaxloader/loader'], loader => {
                    if (loader && typeof loader.typeset === 'function') {
                        loader.typeset();
                    }
                    resolve();
                }, fallback);
            });
        }
        return mathJax2ConfigPromise;
    };

    const typesetMath = async (element, attempt = 0) => {
        if (!element) return;

        const retry = () => {
            if (attempt >= 20 || !element.isConnected) return Promise.resolve();
            return new Promise(resolve => window.setTimeout(resolve, 100))
                .then(() => typesetMath(element, attempt + 1));
        };
        const mathJax = window.MathJax;
        if (!mathJax) return retry();

        try {
            // Moodle may expose the MathJax configuration object before the
            // runtime has finished loading. Waiting for startup prevents the
            // first OCR preview from remaining as literal \(...\) text.
            if (mathJax.startup && mathJax.startup.promise) {
                await mathJax.startup.promise;
            }
            if (typeof mathJax.typesetPromise === 'function') {
                await mathJax.typesetPromise([element]);
                return;
            }
            if (mathJax.Hub && typeof mathJax.Hub.Queue === 'function') {
                await ensureMathJax2Configured(mathJax);
                await new Promise(resolve => {
                    mathJax.Hub.Queue(['Typeset', mathJax.Hub, element], resolve);
                });
                return;
            }
        } catch (error) {
            // MathJax rejects when another STACK typeset is in progress. A
            // short retry is safer than waiting for an unrelated later click.
            if (attempt < 20) return retry();
            window.console.warn('[hand2stack] MathJax typeset failed:', error);
            return;
        }
        return retry();
    };

    const asciiToLatexPreview = value => {
        let latex = String(value || '').trim();
        latex = latex.replace(/[−–—]/g, '-');
        // Display an expanded STACK interval in its original chained form.
        // This keeps the left preview mathematical instead of typesetting
        // the letters in "and" as variables.
        latex = latex.replace(
            /^(.+?)(<=|>=|<|>)(.+?)\s+and\s+\3(<=|>=|<|>)(.+)$/,
            '$1$2$3$4$5'
        );
        let previousLatex = '';
        while (previousLatex !== latex) {
            previousLatex = latex;
            latex = latex.replace(/\babs\(([^()]*)\)/g, '\\left|$1\\right|');
            latex = latex.replace(/\bsqrt\(([^()]*)\)/g, '\\sqrt{$1}');
        }
        latex = latex.replace(
            /\b(sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|asin|acos|atan|log|ln|exp)\(([^()]*)\)/g,
            '\\operatorname{$1}\\left($2\\right)'
        );
        latex = latex.replace(/\(([^()]*)\)\s*\/\s*\(([^()]*)\)/g, '\\frac{$1}{$2}');
        latex = latex.replace(/\^\s*\(([^()]*)\)/g, '^{$1}');
        latex = latex.replace(/\^\s*\(?\s*([+-]?[A-Za-z0-9]+)\s*\)?/g, '^{$1}');
        latex = latex.replace(/([A-Za-z0-9.%]+)\s*\/\s*([A-Za-z0-9.%]+)/g, '\\frac{$1}{$2}');
        latex = latex.replace(/\*/g, '\\cdot ');
        latex = latex.replace(/(?:~~|~=|≈)/g, '\\approx ');
        latex = latex.replace(/<=/g, '\\le ').replace(/>=/g, '\\ge ')
            .replace(/(?:!=|#)/g, '\\ne ');
        latex = latex.replace(/->/g, '\\to ').replace(/(?:\+\/\-|±)/g, '\\pm ');
        latex = latex.replace(/\band\b/gi, '\\mathrel{\\land}');
        latex = latex.replace(/\bor\b/gi, '\\mathrel{\\lor}');
        latex = latex.replace(/\bnot\b/gi, '\\neg ');
        latex = latex.replace(/\bin\b/gi, '\\in ');
        latex = latex.replace(/\bminf\b/gi, '-\\infty ');
        latex = latex.replace(/\b(?:inf|infinity)\b/gi, '\\infty ');
        latex = latex.replace(/%?\bpi\b/gi, '\\pi ');
        latex = latex.replace(/%e\b/g, 'e').replace(/%i\b/g, 'i');
        return latex;
    };

    const stripOuterMathDelimiters = value => {
        let result = String(value || '').trim();
        let previous = '';
        while (result !== previous) {
            previous = result;
            result = result.replace(/^\\\(\s*([\s\S]*?)\s*\\\)$/u, '$1').trim();
            result = result.replace(/^\\\[\s*([\s\S]*?)\s*\\\]$/u, '$1').trim();
            result = result.replace(/^\$\$?\s*([\s\S]*?)\s*\$\$?$/u, '$1').trim();
        }
        return result;
    };

    const splitEmbeddedMathText = value => {
        let text = String(value || '');
        let previous = '';
        while (text !== previous) {
            previous = text;
            text = text.replace(/\\\(\s*\\\(([\s\S]*?)\\\)\s*\\\)/gu, '\\($1\\)');
            text = text.replace(/\\\[\s*\\\[([\s\S]*?)\\\]\s*\\\]/gu, '\\[$1\\]');
        }
        const pattern = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/gu;
        const parts = [];
        let offset = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            if (match.index > offset) {
                parts.push({type: 'text', text: text.slice(offset, match.index)});
            }
            const latex = stripOuterMathDelimiters(match[1] ?? match[2] ?? match[3] ?? match[4] ?? '');
            if (latex) parts.push({type: 'math', latex, text: latex});
            offset = pattern.lastIndex;
        }
        if (offset < text.length) parts.push({type: 'text', text: text.slice(offset)});
        return parts.length ? parts : [{type: 'text', text}];
    };

    const normalizeDisplayParts = parts => {
        if (!Array.isArray(parts)) return [];
        return parts.flatMap(part => {
            if (!part) return [];
            if (part.type !== 'math') return splitEmbeddedMathText(part.text || '');
            const latex = stripOuterMathDelimiters(part.latex || part.text || '');
            return [Object.assign({}, part, {latex, text: latex})];
        });
    };

    const normalizeResultLines = (rawLatex, stackResult, lines) => {
        if (Array.isArray(lines) && lines.length) {
            return lines.map((line, index) => ({
                raw: String(line.raw || line.latex || line.ascii || '').trim(),
                latex: stripOuterMathDelimiters(line.latex || ''),
                originalLatex: stripOuterMathDelimiters(line.latex || ''),
                display: String(line.display || line.latex || '').trim(),
                displayParts: normalizeDisplayParts(line.display_parts),
                math: stripOuterMathDelimiters(line.math || ''),
                stack: String(line.stack || line.text || '').trim(),
                ascii: String(line.ascii || line.stack || line.text || line.math || '').trim(),
                originalAscii: String(line.ascii || line.stack || line.text || line.math || '').trim(),
                normalized: String(line.normalized || line.stack || '').trim(),
                type: String(line.type || 'expression'),
                relation: line.relation ? String(line.relation) : null,
                synthetic: Boolean(line.synthetic),
                edited: false,
                recommended: false
            })).filter(line => line.latex || line.stack);
        }

        const latex = stripOuterMathDelimiters(rawLatex || stackResult || '');
        const stack = String(stackResult || latex || '').trim();
        return latex || stack ? [{
            latex,
            originalLatex: latex,
            stack,
            ascii: stack,
            originalAscii: stack,
            type: 'expression',
            relation: null,
            edited: false,
            recommended: false
        }] : [];
    };

    const selectionInside = (selection, container) => {
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            return false;
        }

        const range = selection.getRangeAt(0);
        return container.contains(range.commonAncestorContainer);
    };

    const normalizeSelectableText = (value) => {
        return String(value || '')
            .replace(/[−–—]/g, '-')
            .replace(/\s+/g, '')
            .trim();
    };

    const latexDisplayMap = (latex) => {
        const source = String(latex || '');
        const chars = [];
        const starts = [];
        const ends = [];

        for (let i = 0; i < source.length; i++) {
            const char = source[i];
            if (/\s/.test(char) || char === '&') {
                continue;
            }

            if (char === '\\') {
                const match = source.slice(i).match(/^\\[a-zA-Z]+/);
                if (match) {
                    const command = match[0];
                    const symbols = {
                        '\\cdot': '*', '\\times': '*', '\\prod': '∏', '\\sum': '∑',
                        '\\int': '∫', '\\infty': '∞', '\\leq': '≤', '\\geq': '≥',
                        '\\pi': 'π', '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ',
                        '\\delta': 'δ', '\\theta': 'θ', '\\lambda': 'λ', '\\mu': 'μ',
                        '\\sigma': 'σ', '\\phi': 'φ', '\\omega': 'ω'
                    };
                    if (symbols[command]) {
                        chars.push(symbols[command]);
                        starts.push(i);
                        ends.push(i + command.length);
                    }
                    i += command.length - 1;
                    continue;
                }
            }

            if (char === '^' || char === '_') {
                const start = i;
                if (source[i + 1] === '{') {
                    let depth = 1;
                    let j = i + 2;
                    while (j < source.length && depth > 0) {
                        if (source[j] === '{') {
                            depth++;
                        } else if (source[j] === '}') {
                            depth--;
                        }
                        j++;
                    }
                    const exponent = source.slice(i + 2, j - 1).replace(/\s+/g, '');
                    let sourceOffset = i + 2;
                    for (const expchar of exponent) {
                        chars.push(expchar);
                        starts.push(sourceOffset);
                        sourceOffset += expchar.length;
                        ends.push(sourceOffset);
                    }
                    i = j - 1;
                    continue;
                }

                if (source[i + 1]) {
                    chars.push(source[i + 1]);
                    starts.push(start);
                    ends.push(i + 2);
                    i++;
                }
                continue;
            }

            if (char === '{' || char === '}') {
                continue;
            }

            chars.push(char);
            starts.push(i);
            ends.push(i + 1);
        }

        return { text: chars.join(''), starts, ends, source };
    };

    const selectedLatexFromLine = (selectedText, latex) => {
        const normalized = normalizeSelectableText(selectedText);
        if (!normalized) {
            return '';
        }

        const mapped = latexDisplayMap(latex);
        const start = normalizeSelectableText(mapped.text).indexOf(normalized);
        if (start === -1) {
            return '';
        }

        const end = start + normalized.length - 1;
        const sourceStart = mapped.starts[start];
        const sourceEnd = mapped.ends[end];
        return mapped.source.slice(sourceStart, sourceEnd).trim();
    };

    const readSelectedLatex = (container) => {
        const selection = window.getSelection ? window.getSelection() : null;
        if (!selectionInside(selection, container)) {
            return '';
        }

        const range = selection.getRangeAt(0);
        const selectedText = selection.toString().replace(/\s+/g, ' ').trim();
        const mathNodes = Array.from(container.querySelectorAll('[data-latex]')).filter(node => {
            return typeof range.intersectsNode === 'function' && range.intersectsNode(node);
        });

        if (mathNodes.length === 1) {
            const latex = selectedLatexFromLine(selectedText, mathNodes[0].dataset.latex || '');
            if (latex) {
                return latex;
            }
        }

        return selectedText;
    };

    const clientSideStackFallback = (value) => {
        let stack = String(value || '').trim();
        if (!stack) {
            return '';
        }

        stack = stack.replace(/[−–—]/g, '-');
        stack = stack.replace(/[𝑥𝒙𝓍]/g, 'x');
        stack = stack.replace(/[𝑦𝒚𝓎]/g, 'y');
        stack = stack.replace(/[𝑧𝒛𝓏]/g, 'z');
        stack = stack.replace(/[²]/g, '^2');
        stack = stack.replace(/[³]/g, '^3');
        stack = stack.replace(/[⁴]/g, '^4');
        stack = stack.replace(/[⁵]/g, '^5');
        stack = stack.replace(/[⁶]/g, '^6');
        stack = stack.replace(/[⁷]/g, '^7');
        stack = stack.replace(/[⁸]/g, '^8');
        stack = stack.replace(/[⁹]/g, '^9');
        stack = stack.replace(/[⁰]/g, '^0');
        stack = stack.replace(/\\cdot|\\times/g, '*');
        stack = stack.replace(/\^\{([^{}]+)\}/g, '^$1');
        stack = stack.replace(/[{}]/g, '');
        stack = stack.replace(/\s+/g, '');
        stack = stack.replace(/(\d)([A-Za-z])/g, '$1*$2');
        stack = stack.replace(/\)([A-Za-z])/g, ')*$1');
        stack = stack.replace(/\b([A-Za-z])\(/g, '$1*(');

        return stack;
    };

    const superscriptDisplay = (value) => {
        const superscripts = {
            '0': '⁰',
            '1': '¹',
            '2': '²',
            '3': '³',
            '4': '⁴',
            '5': '⁵',
            '6': '⁶',
            '7': '⁷',
            '8': '⁸',
            '9': '⁹',
            '+': '⁺',
            '-': '⁻'
        };

        return String(value || '').split('').map(char => superscripts[char] || char).join('');
    };

    const parseLatexGroup = (source, start) => {
        let i = start;
        while (/\s/.test(source[i] || '')) {
            i++;
        }
        if (source[i] !== '{') {
            return null;
        }

        let depth = 1;
        let j = i + 1;
        while (j < source.length && depth > 0) {
            if (source[j] === '{') {
                depth++;
            } else if (source[j] === '}') {
                depth--;
            }
            j++;
        }
        if (depth !== 0) {
            return null;
        }

        return {
            value: source.slice(i + 1, j - 1).trim(),
            end: j
        };
    };

    const parseLatexFraction = (source, start) => {
        const numerator = parseLatexGroup(source, start);
        if (!numerator) {
            return null;
        }
        const denominator = parseLatexGroup(source, numerator.end);
        if (!denominator) {
            return null;
        }

        return {
            numerator: numerator.value,
            denominator: denominator.value,
            end: denominator.end
        };
    };

    const latexTokens = (latex) => {
        const source = String(latex || '');
        const tokens = [];

        for (let i = 0; i < source.length; i++) {
            const char = source[i];
            if (/\s/.test(char) || char === '&') {
                continue;
            }

            if (char === '\\') {
                const match = source.slice(i).match(/^\\[a-zA-Z]+/);
                if (match) {
                    const command = match[0];
                    if (command === '\\frac') {
                        const parsed = parseLatexFraction(source, i + command.length);
                        if (parsed) {
                            // Use STACK-compatible linear punctuation around the recursively
                            // tokenized operands. This keeps the whole fraction selectable while
                            // also allowing a user to pick just one symbol from either operand.
                            tokens.push({latex: '(', display: '('});
                            tokens.push(...latexTokens(parsed.numerator));
                            tokens.push({latex: ')/(', display: ')/('});
                            tokens.push(...latexTokens(parsed.denominator));
                            tokens.push({latex: ')', display: ')'});
                            i = parsed.end - 1;
                            continue;
                        }
                    }
                    const commandDisplay = {
                        '\\cdot': '·', '\\times': '×', '\\div': '÷', '\\pi': 'π',
                        '\\infty': '∞', '\\rightarrow': '→', '\\longrightarrow': '→',
                        '\\to': '→', '\\sum': 'Σ', '\\prod': '∏', '\\int': '∫',
                        '\\sqrt': '√', '\\partial': '∂', '\\leq': '≤', '\\leqslant': '≤',
                        '\\geq': '≥', '\\geqslant': '≥', '\\neq': '≠', '\\ne': '≠'
                    };
                    tokens.push({
                        latex: command,
                        display: commandDisplay[command] || command.replace(/^\\/, '')
                    });
                    i += command.length - 1;
                    continue;
                }
            }

            if (char === '^') {
                if (source[i + 1] === '{') {
                    let depth = 1;
                    let j = i + 2;
                    while (j < source.length && depth > 0) {
                        if (source[j] === '{') {
                            depth++;
                        } else if (source[j] === '}') {
                            depth--;
                        }
                        j++;
                    }
                    const exponent = source.slice(i + 2, j - 1).replace(/\s+/g, '');
                    tokens.push({
                        latex: '^{' + exponent + '}',
                        display: superscriptDisplay(exponent)
                    });
                    i = j - 1;
                    continue;
                }

                if (source[i + 1]) {
                    tokens.push({
                        latex: '^' + source[i + 1],
                        display: superscriptDisplay(source[i + 1])
                    });
                    i++;
                }
                continue;
            }

            if (char === '{' || char === '}') {
                continue;
            }

            tokens.push({ latex: char, display: char });
        }

        return tokens;
    };

    // A token or formula range the learner selected instead of a whole line.
    const logPartialSelection = (panel, lineIndex, latex, value) => {
        const answerBox = panel._hand2stackAnswerBox;
        if (!answerBox || !value || panel._hand2stackLastPartial === value) return;
        panel._hand2stackLastPartial = value;
        research.log(answerBox, 'candidate_selected', {
            kind: 'partial',
            lineIndex: Number.isInteger(lineIndex) && lineIndex >= 0 ? lineIndex : null,
            latex: research.clip(latex),
            value: research.clip(value)
        }, {modality: panel._hand2stackSource || null});
    };

    const convertSelectedLatex = async (panel, latex) => {
        const requestId = (panel._selectionRequestId || 0) + 1;
        panel._selectionRequestId = requestId;
        const fallback = clientSideStackFallback(latex);
        panel._stackTextarea.value = fallback || latex;

        try {
            const stack = await postLatex(latex);
            if (panel._selectionRequestId === requestId) {
                panel._stackTextarea.value = stack || fallback || latex;
                logPartialSelection(panel, panel._partialSelection ? panel._partialSelection.lineIndex : null,
                    latex, panel._stackTextarea.value);
            }
        } catch (error) {
            window.console.warn('[hand2stack] partial selection conversion failed:', error);
            if (panel._selectionRequestId === requestId) {
                panel._stackTextarea.value = fallback || latex;
            }
        }
    };

    const interactiveMathLeaves = rendered => {
        const selector = [
            'mjx-mi', 'mjx-mn', 'mjx-mo', 'mjx-mtext', 'mjx-ms',
            '.MathJax span.mi', '.MathJax span.mn', '.MathJax span.mo', '.MathJax span.mtext', '.MathJax span.ms',
            'svg text', 'svg use'
        ].join(', ');
        return Array.from(rendered.querySelectorAll(selector)).filter(node => {
            return !node.querySelector || !node.querySelector(selector);
        });
    };

    const latexForLeafRange = (latex, leaves, start, end) => {
        const mapped = latexDisplayMap(latex);
        const before = Array.from(normalizeSelectableText(
            leaves.slice(0, start).map(node => node.textContent || '').join('')
        )).length;
        const selected = normalizeSelectableText(leaves.slice(start, end + 1).map(node => node.textContent || '').join(''));
        const selectedLength = Array.from(selected).length;
        if (selected && mapped.starts[before] !== undefined && mapped.ends[before + selectedLength - 1] !== undefined) {
            let fragment = mapped.source.slice(mapped.starts[before], mapped.ends[before + selectedLength - 1]).trim();
            const openingBraces = (fragment.match(/\{/g) || []).length;
            const closingBraces = (fragment.match(/\}/g) || []).length;
            if (openingBraces > closingBraces) {
                fragment += '}'.repeat(openingBraces - closingBraces);
            }
            return fragment;
        }
        return selectedLatexFromLine(selected, latex);
    };

    const setupInteractiveFormula = (panel, rendered, line = null) => {
        const leaves = interactiveMathLeaves(rendered);
        if (!leaves.length) {
            return;
        }
        rendered.style.touchAction = 'none';
        const interactionController = new AbortController();
        panel._interactiveControllers = panel._interactiveControllers || [];
        panel._interactiveControllers.push(interactionController);
        if (line) {
            line._interactiveControllers = line._interactiveControllers || [];
            line._interactiveControllers.push(interactionController);
        }
        const documentListenerOptions = {
            capture: true,
            signal: interactionController.signal
        };

        const clearNativeSelection = () => {
            const selection = window.getSelection ? window.getSelection() : null;
            if (selection && typeof selection.removeAllRanges === 'function') {
                selection.removeAllRanges();
            }
        };

        leaves.forEach((leaf, index) => {
            leaf.dataset.stackPartIndex = String(index);
            leaf.style.cursor = 'pointer';
        });

        const applyFormulaSelection = (anchor, clicked, convert = true) => {
            const start = Math.min(anchor, clicked);
            const end = Math.max(anchor, clicked);

            panel._options.querySelectorAll('[data-stack-part-index]').forEach(node => {
                node.style.background = '';
                node.style.borderRadius = '';
            });
            leaves.forEach((node, index) => {
                if (index >= start && index <= end) {
                    node.style.background = '#b9d7ff';
                    node.style.borderRadius = '3px';
                }
            });

            if (convert) {
                const selectedLatex = latexForLeafRange(rendered.dataset.latex || '', leaves, start, end);
                if (selectedLatex) {
                    convertSelectedLatex(panel, selectedLatex);
                }
            }
        };

        const previewDraggedSelection = (start, end) => {
            const selectedLatex = latexForLeafRange(rendered.dataset.latex || '', leaves, start, end);
            if (!selectedLatex) {
                return;
            }
            window.clearTimeout(panel._dragConversionTimer);
            const requestId = (panel._selectionRequestId || 0) + 1;
            panel._selectionRequestId = requestId;
            const fallback = clientSideStackFallback(selectedLatex) || selectedLatex;
            const isPartial = Math.min(start, end) > 0 || Math.max(start, end) < leaves.length - 1;
            const option = rendered.closest('[data-result-line-index]');
            const lineIndex = option ? Number(option.dataset.resultLineIndex) : -1;
            const fullLineStack = option ? (option.dataset.stackValue || '') : '';
            panel._stackTextarea.value = fallback;
            panel._partialSelection = {lineIndex, value: fallback};
            panel._dragConversionTimer = window.setTimeout(async () => {
                try {
                    const stack = await postLatex(selectedLatex);
                    if (panel._selectionRequestId !== requestId) {
                        return;
                    }
                    // A partial drag must never be silently promoted back to the
                    // complete candidate line by a late conversion response.
                    panel._stackTextarea.value = isPartial && stack === fullLineStack
                        ? fallback : (stack || fallback);
                    panel._partialSelection.value = panel._stackTextarea.value;
                    logPartialSelection(panel, lineIndex, selectedLatex, panel._partialSelection.value);
                } catch (error) {
                    window.console.warn('[hand2stack] partial selection conversion failed:', error);
                    if (panel._selectionRequestId === requestId) {
                        panel._stackTextarea.value = fallback;
                    }
                }
            }, 150);
        };

        leaves.forEach((leaf, index) => {
            leaf.addEventListener('pointerdown', event => {
                if (event.button !== 0) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                window.clearTimeout(panel._dragConversionTimer);
                panel._selectionRequestId = (panel._selectionRequestId || 0) + 1;
                const option = rendered.closest('[data-result-line-index]');
                if (option && panel._activateLine) {
                    panel._activateLine(Number(option.dataset.resultLineIndex));
                }
                clearTokenSelections(panel);
                clearNativeSelection();
                rendered._stackDragStart = index;
                rendered._stackDragEnd = index;
                rendered._stackDidDrag = false;
                rendered._stackPointerId = event.pointerId;
                applyFormulaSelection(index, index, false);
            });
        });

        document.addEventListener('pointermove', event => {
            if (rendered._stackDragStart === undefined || event.pointerId !== rendered._stackPointerId) {
                return;
            }
            event.preventDefault();
            let closestIndex = rendered._stackDragEnd;
            let closestDistance = Number.POSITIVE_INFINITY;
            leaves.forEach((leaf, index) => {
                const rect = leaf.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const distance = Math.abs(event.clientX - centerX) + Math.abs(event.clientY - centerY) * 0.25;
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestIndex = index;
                }
            });
            rendered._stackDragEnd = closestIndex;
            rendered._stackDidDrag = rendered._stackDidDrag || closestIndex !== rendered._stackDragStart;
            applyFormulaSelection(rendered._stackDragStart, closestIndex, false);
            if (rendered._stackDidDrag) {
                rendered._stackSuppressClick = true;
                panel._ignoreLineClickUntil = Date.now() + 500;
                previewDraggedSelection(rendered._stackDragStart, closestIndex);
            }
        }, documentListenerOptions);

        document.addEventListener('pointerup', event => {
            if (rendered._stackDragStart === undefined || event.pointerId !== rendered._stackPointerId) {
                return;
            }
            event.preventDefault();
            const start = rendered._stackDragStart;
            const end = rendered._stackDragEnd;
            const didDrag = rendered._stackDidDrag;
            rendered._stackDragStart = undefined;
            rendered._stackDragEnd = undefined;
            rendered._stackPointerId = undefined;
            rendered._stackSelectionAnchor = start;
            clearNativeSelection();
            if (didDrag) {
                rendered._stackSuppressClick = true;
                previewDraggedSelection(start, end);
            }
        }, documentListenerOptions);

        document.addEventListener('pointercancel', () => {
            rendered._stackDragStart = undefined;
            rendered._stackDragEnd = undefined;
            rendered._stackPointerId = undefined;
        }, documentListenerOptions);

        rendered.addEventListener('click', event => {
            const leaf = event.target.closest('[data-stack-part-index]');
            if (!leaf || !rendered.contains(leaf)) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            clearNativeSelection();
            if (rendered._stackSuppressClick) {
                rendered._stackSuppressClick = false;
                return;
            }

            const clicked = Number(leaf.dataset.stackPartIndex);
            const anchor = event.shiftKey && rendered._stackSelectionAnchor !== undefined
                ? rendered._stackSelectionAnchor : clicked;
            rendered._stackSelectionAnchor = anchor;
            applyFormulaSelection(anchor, clicked, true);
        });
    };

    const selectTokenRange = (row, start, end) => {
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        row.querySelectorAll('[data-token-index]').forEach(token => {
            const index = Number(token.dataset.tokenIndex);
            token.style.background = index >= min && index <= max ? '#cfe3ff' : '';
        });

        row._selectionStart = min;
        row._selectionEnd = max;
    };

    const clearTokenSelections = (panel, exceptRow = null) => {
        (panel._tokenRows || []).forEach(row => {
            if (row === exceptRow) {
                return;
            }
            row.querySelectorAll('[data-token-index]').forEach(token => {
                token.style.background = '';
            });
            row._selectionStart = null;
            row._selectionEnd = null;
            row._dragging = false;
        });
    };

    const clearFormulaSelections = panel => {
        panel._options.querySelectorAll('[data-stack-part-index]').forEach(node => {
            node.style.background = '';
            node.style.borderRadius = '';
        });
    };

    const createTokenSelector = (panel, latex) => {
        const tokens = latexTokens(latex);
        if (!tokens.length) {
            return null;
        }

        const row = document.createElement('span');
        row.style.display = 'inline-flex';
        row.style.flexWrap = 'wrap';
        row.style.alignItems = 'baseline';
        row.style.gap = '2px';
        row.style.marginTop = '0';
        row.style.padding = '2px 0';
        row.style.fontFamily = 'serif';
        row.style.fontSize = '20px';
        row.style.userSelect = 'none';
        row._tokens = tokens;
        panel._tokenRows = panel._tokenRows || [];
        panel._tokenRows.push(row);

        tokens.forEach((token, index) => {
            const tokenEl = document.createElement('span');
            tokenEl.dataset.tokenIndex = String(index);
            tokenEl.dataset.latex = token.latex;
            tokenEl.textContent = token.display;
            tokenEl.style.cursor = 'text';
            tokenEl.style.borderRadius = '2px';
            tokenEl.style.padding = '0 1px';

            tokenEl.addEventListener('mousedown', event => {
                event.preventDefault();
                event.stopPropagation();
                const option = row.closest('[data-result-line-index]');
                if (option && panel._activateLine) {
                    panel._activateLine(Number(option.dataset.resultLineIndex));
                }
                clearFormulaSelections(panel);
                clearTokenSelections(panel, row);
                row._dragging = true;
                selectTokenRange(row, index, index);
            });

            tokenEl.addEventListener('mouseenter', () => {
                if (row._dragging) {
                    selectTokenRange(row, row._selectionStart, index);
                }
            });

            row.appendChild(tokenEl);
        });

        document.addEventListener('mouseup', () => {
            if (!row._dragging) {
                return;
            }

            row._dragging = false;
            const selected = row._tokens
                .slice(row._selectionStart, row._selectionEnd + 1)
                .map(token => token.latex)
                .join('');
            if (selected) {
                convertSelectedLatex(panel, selected);
            }
        }, {signal: panel._selectionAbortController.signal});

        return row;
    };

    const createLineContent = (panel, line) => {
        const container = document.createElement('span');
        container.style.display = 'inline-flex';
        container.style.alignItems = 'center';
        container.style.minWidth = '0';
        container.style.maxWidth = '100%';
        container.style.flex = '1 1 auto';
        container.style.overflowX = 'auto';
        container.style.overflowY = 'hidden';
        container.style.fontFamily = 'inherit';

        const displayRow = document.createElement('span');
        displayRow.style.display = 'inline-flex';
        displayRow.style.flexWrap = 'wrap';
        displayRow.style.alignItems = 'center';
        displayRow.style.gap = '4px';
        displayRow.style.minHeight = '24px';
        container.appendChild(displayRow);

        const parts = line.displayParts.length ? line.displayParts : normalizeDisplayParts([{
            type: line.math ? 'math' : 'text',
            text: line.display || line.latex || line.stack || '',
            latex: line.math || ''
        }]);

        parts.forEach(part => {
            if (part.type === 'math' && part.latex) {
                const rendered = document.createElement('span');
                rendered.textContent = '\\(' + part.latex + '\\)';
                rendered.style.display = 'inline-block';
                rendered.style.fontSize = '16px';
                rendered.style.lineHeight = '1.15';
                rendered.setAttribute('aria-label', part.latex);
                rendered.dataset.latex = part.latex;
                displayRow.appendChild(rendered);

                rendered.dataset.interactiveFormula = '1';
                rendered.title = config.selectpart || 'Click a symbol, or drag across the formula to select a range.';
                return;
            }

            const text = document.createElement('span');
            // OCR text segments can carry LaTeX spacing commands outside math; show them as spaces.
            text.textContent = String(part.text || '').replace(/[$¥￥]/g, '')
                .replace(/\\q?quad(?![a-zA-Z])|\\[,;:! ]/g, ' ')
                .replace(/ {2,}/g, ' ');
            text.style.whiteSpace = 'pre-wrap';
            text.style.fontFamily = 'inherit';
            displayRow.appendChild(text);
        });

        return container;
    };

    const updateResultPanel = (panel, rawLatex, rawAscii, stackResult, answerBox, lines, recognizedText = '', sourceUrl = '') => {
        setRequestStatus(panel);
        window.clearTimeout(panel._dragConversionTimer);
        panel._selectionRequestId = (panel._selectionRequestId || 0) + 1;
        if (panel._selectionAbortController) {
            panel._selectionAbortController.abort();
        }
        (panel._interactiveControllers || []).forEach(controller => controller.abort());
        panel._interactiveControllers = [];
        panel._selectionAbortController = new AbortController();
        const freeTextMode = isFreeTextInput(answerBox);
        const layoutReference = panel._layoutReference;
        if (!freeTextMode && layoutReference && layoutReference.offsetParent !== null) {
            const referenceWidth = Math.floor(layoutReference.getBoundingClientRect().width);
            if (referenceWidth > 0) {
                // Freeze both panels at the pre-recognition width. Result content
                // must never participate in sizing the Moodle question container.
                layoutReference.style.width = referenceWidth + 'px';
                layoutReference.style.maxWidth = '100%';
                panel.style.width = referenceWidth + 'px';
                panel.style.maxWidth = '100%';
            }
        }
        panel.style.display = 'block';
        panel._freeTextMode = freeTextMode;
        panel.style.padding = freeTextMode ? '20px' : '12px';
        panel.style.borderRadius = freeTextMode ? '10px' : '6px';
        panel.style.background = freeTextMode ? '#fff' : '#f8fbfd';
        panel.style.width = freeTextMode ? '100%' : panel.style.width;
        panel._freeTextHeader.style.display = freeTextMode ? 'flex' : 'none';
        panel._instruction.textContent = freeTextMode
            ? (config.recognizedworking || 'Recognized mathematical working. Review or edit it before inserting:')
            : (config.selectanswer || 'Select the answer to insert into STACK:');
        panel._options.style.display = freeTextMode ? 'none' : 'grid';
        panel._formatTitle.style.display = freeTextMode ? 'none' : 'block';
        panel._formatTabs.style.display = freeTextMode ? 'none' : 'flex';
        panel._rawTextarea.style.display = freeTextMode ? 'none' : 'block';
        panel._formatRows.style.display = freeTextMode ? 'none' : 'grid';
        panel._editableHeader.style.display = freeTextMode ? 'none' : 'flex';
        panel._candidateColumn.style.display = 'block';
        panel._sourceTitle.style.display = freeTextMode ? 'block' : 'none';
        panel._sourceViewer.style.display = freeTextMode && sourceUrl ? 'block' : 'none';
        panel._sourcePreview.src = freeTextMode && sourceUrl ? sourceUrl : '';
        if (freeTextMode && sourceUrl) panel._resetImageView();
        panel._instruction.style.display = freeTextMode ? 'none' : 'block';
        panel._candidateColumn.firstChild.style.display = freeTextMode ? 'none' : 'block';
        panel._recognizedColumn.style.display = 'block';
        panel._reviewGrid.style.display = 'grid';
        panel._reviewGrid.style.gridTemplateColumns = freeTextMode ? '1fr' : panel._reviewGrid.style.gridTemplateColumns;
        panel._convertedColumn.style.paddingTop = freeTextMode ? '0' : '10px';
        panel._convertedColumn.style.borderTop = freeTextMode ? '0' : '1px solid #e2e6ea';
        panel._convertedColumn.style.marginTop = freeTextMode ? '0' : '10px';
        panel._convertedColumn.style.display = freeTextMode ? 'block' : 'none';
        if (!freeTextMode || sourceUrl) panel._updateReviewLayout();
        panel._stackTitle.textContent = freeTextMode
            ? (config.recognizedfullanswer || 'Complete recognized answer · editable')
            : (config.convertedstack || 'Converted for STACK:');
        panel._stackTextarea.rows = freeTextMode ? 14 : 1;
        panel._stackTextarea.readOnly = !freeTextMode;
        panel._stackTextarea.style.resize = freeTextMode ? '' : 'none';
        panel._stackTextarea.style.height = freeTextMode ? '' : '38px';
        panel._stackTextarea.style.minHeight = freeTextMode ? '' : '38px';
        panel._stackTextarea.style.background = freeTextMode ? 'transparent' : '#f3f6f8';
        panel._stackTextarea.style.fontFamily = freeTextMode ? 'inherit' : 'monospace';
        panel._stackTextarea.style.fontSize = freeTextMode ? '16px' : '13px';
        panel._stackTextarea.style.lineHeight = freeTextMode ? '1.65' : '';
        panel._stackTextarea.style.color = freeTextMode ? 'transparent' : '';
        panel._stackTextarea.style.webkitTextFillColor = freeTextMode ? 'transparent' : '';
        panel._stackTextarea.style.caretColor = freeTextMode ? '#111827' : '';
        panel._changeHighlighter.backdrop.style.display = freeTextMode ? 'block' : 'none';
        panel._freeTextHelp.style.display = freeTextMode ? 'block' : 'none';
        panel._appendHint.style.display = 'none';
        panel._actionButtons.style.display = freeTextMode ? 'none' : 'flex';
        const resultLines = normalizeResultLines(rawLatex, stackResult, lines);
        const recognition = panel._hand2stackRecognition || null;
        panel._hand2stackRecognition = null;
        panel._hand2stackAnswerBox = answerBox;
        panel._hand2stackLastPartial = '';
        if (recognition) panel._hand2stackSource = recognition.source;
        (panel._hand2stackTrackers || []).forEach(tracker => tracker.dispose());
        panel._hand2stackTrackers = [];
        const logOptions = () => ({modality: panel._hand2stackSource || null});
        const logRecognition = defaultIndex => {
            if (!recognition) return;
            research.log(answerBox, 'recognition_completed', {
                requestId: recognition.requestId,
                source: recognition.source,
                ok: true,
                errorCode: null,
                latencyMs: recognition.latencyMs,
                mode: freeTextMode ? 'freetext' : 'lines',
                ocr: {
                    rawLatex: research.clip(rawLatex, 8000),
                    rawAscii: research.clip(rawAscii, 8000),
                    text: research.clip(recognizedText, 8000)
                },
                converted: {stack: research.clip(stackResult)},
                lines: resultLines.slice(0, 50).map((line, index) => ({
                    index,
                    type: line.type,
                    latex: research.clip(line.originalLatex),
                    ascii: research.clip(line.originalAscii),
                    stack: research.clip(line.stack),
                    synthetic: Boolean(line.synthetic)
                })),
                truncatedLines: resultLines.length > 50,
                defaultIndex
            }, logOptions());
        };
        const syncDiagnosticProcess = () => syncProcessInput(answerBox, resultLines);
        // Free-text mode syncs from the submitted text instead (bindFreeTextProcess).
        if (!freeTextMode) syncDiagnosticProcess();

        if (freeTextMode) {
            panel._options.innerHTML = '';
            panel._candidateSummaryList.replaceChildren();
            panel._candidateSummary.style.display = 'none';
            panel._stackTextarea.value = formatFreeTextWorking(recognizedText, rawAscii, rawLatex, stackResult, lines);
            panel._changeHighlighter.reset(panel._stackTextarea.value);
            if (panel._answerBoxDisplay === undefined) {
                panel._answerBoxDisplay = answerBox.style.display;
            }
            answerBox.style.display = 'none';
            logRecognition(null);
            const previousValue = answerBox.value;
            setAnswerValue(answerBox, panel._stackTextarea.value);
            research.log(answerBox, 'answer_inserted', {
                via: 'freetext_recognition',
                value: research.clip(panel._stackTextarea.value, 8000),
                previousValue: research.clip(previousValue, 8000)
            }, logOptions());
            const freeTextTracker = research.editTracker(answerBox, () => panel._stackTextarea.value,
                () => ({target: 'freetext'}), {max: 8000, logOptions});
            panel._hand2stackTrackers.push(freeTextTracker);
            if (panel._freeTextSyncHandler) {
                panel._stackTextarea.removeEventListener('input', panel._freeTextSyncHandler);
            }
            panel._freeTextSyncHandler = () => {
                freeTextTracker.input();
                answerBox.value = panel._stackTextarea.value;
                answerBox.dispatchEvent(new Event('input', {bubbles: true}));
            };
            panel._stackTextarea.addEventListener('input', panel._freeTextSyncHandler);
            panel._stackTextarea.onblur = () => {
                freeTextTracker.commit('blur');
                answerBox.dispatchEvent(new Event('change', {bubbles: true}));
            };
            return;
        }
        panel._candidateSummary.style.display = 'none';
        if (panel._answerBoxDisplay !== undefined) {
            answerBox.style.display = panel._answerBoxDisplay;
        }
        panel._applyBtn.textContent = config.insertanswer || 'Insert answer';
        panel._applyBtn.className = '';
        panel._applyBtn.style.padding = '4px 8px';
        panel._applyBtn.style.marginTop = '';
        panel._insertBtn.style.display = 'none';

        let defaultIndex = Math.max(0, resultLines.length - 1);
        for (let i = resultLines.length - 1; i >= 0; i--) {
            if (resultLines[i].stack) {
                defaultIndex = i;
                break;
            }
        }
        panel._rawTextarea.style.display = 'none';
        logRecognition(defaultIndex);
        let selectedIndex = defaultIndex;
        // Created when a line's row is first rendered, so its baseline is the
        // value before the learner's first keystroke.
        const lineTracker = (line, index) => {
            if (!line._hand2stackTracker) {
                line._hand2stackTracker = research.editTracker(answerBox, () => line.ascii, () => ({
                    target: 'line',
                    lineIndex: index,
                    ocrOriginal: research.clip(line.originalAscii)
                }), {logOptions});
                panel._hand2stackTrackers.push(line._hand2stackTracker);
            }
            return line._hand2stackTracker;
        };
        let selectedFormat = 'ascii';
        const stackValueForLine = line => {
            if (!line) return stackResult || '';
            if (!line.edited && line.stack) return line.stack;
            if (line._validatedAscii === line.ascii && line._validatedStack) return line._validatedStack;
            return clientSideStackFallback(line.ascii) || line.ascii || line.stack || '';
        };
        const updateSelectedPreview = () => {
            const selectedLine = resultLines[selectedIndex];
            panel._stackTextarea.value = stackValueForLine(selectedLine);
        };
        const renderFormatRows = () => {
            panel._formatRows.innerHTML = '';
            const index = selectedIndex;
            const line = resultLines[index];
            if (!line) return;

            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.flexDirection = 'column';
            row.style.gap = '4px';
            row.style.position = 'relative';
            row.style.padding = '3px 0 3px 10px';
            line._formatRow = row;

            const selectionMarker = document.createElement('span');
            selectionMarker.setAttribute('aria-hidden', 'true');
            selectionMarker.style.position = 'absolute';
            selectionMarker.style.left = '0';
            selectionMarker.style.top = '25px';
            selectionMarker.style.width = '2px';
            selectionMarker.style.height = '38px';
            selectionMarker.style.borderRadius = '2px';
            selectionMarker.style.background = '#8ab4f8';

            const heading = document.createElement('div');
            heading.style.display = 'flex';
            heading.style.justifyContent = 'space-between';
            heading.style.alignItems = 'center';

            const label = document.createElement('label');
            label.textContent = (config.lineprefix || 'Line') + ' ' + (index + 1);
            label.style.fontSize = '12px';
            label.style.color = '#555';

            const field = document.createElement('input');
            field.type = 'text';
            field.value = selectedFormat === 'ascii' ? line.ascii : line.latex;
            field.readOnly = selectedFormat !== 'ascii';
            field.style.width = '100%';
            field.style.boxSizing = 'border-box';
            field.style.fontFamily = 'monospace';
            field.style.padding = '6px 8px';
            field.style.height = '38px';
            field.style.minHeight = '38px';
            field.style.maxHeight = '38px';
            field.style.border = '1px solid #b8c2cc';
            field.style.borderRadius = '3px';
            field.style.background = '#fff';
            const fieldId = 'local-hand2stack-format-line-' + Math.random().toString(36).slice(2);
            field.id = fieldId;
            label.setAttribute('for', fieldId);
            const fieldHighlighter = createChangeHighlighter(field);
            fieldHighlighter.wrapper.style.margin = '0';
            fieldHighlighter.backdrop.style.whiteSpace = 'pre';
            if (selectedFormat === 'ascii') {
                // Moodle themes may apply an !important white input background.
                // The real input must remain transparent so the coloured diff
                // backdrop is visible underneath it.
                field.style.setProperty('background-color', 'transparent', 'important');
                field.style.setProperty('background-image', 'none', 'important');
                field.style.setProperty('color', 'transparent', 'important');
                field.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
                field.style.caretColor = '#111827';
                fieldHighlighter.compare(line.originalAscii, field.value);
            } else {
                // LaTeX is a read-only representation, not an edit diff.
                fieldHighlighter.backdrop.style.display = 'none';
                field.style.setProperty('background-color', '#fff', 'important');
                field.style.setProperty('color', '#1f2937', 'important');
                field.style.setProperty('-webkit-text-fill-color', '#1f2937', 'important');
            }

            const action = document.createElement('span');
            action.style.display = 'flex';
            action.style.alignItems = 'center';
            action.style.justifyContent = 'flex-end';
            action.style.gap = '6px';
            const badge = document.createElement('span');
            badge.textContent = config.edited || 'Edited';
            badge.style.cssText = 'font-size:11px;color:#7a4b00';
            const reset = document.createElement('button');
            reset.type = 'button';
            reset.textContent = config.restoreocr || 'Restore original';
            reset.style.cssText = 'border:0;background:transparent;color:#0f6cbf;cursor:pointer;padding:2px 0;font-size:11px';
            const tracker = lineTracker(line, index);
            const updateEditedControls = () => {
                const visible = line.edited && selectedFormat === 'ascii';
                action.style.display = visible ? 'flex' : 'none';
            };
            reset.addEventListener('click', event => {
                event.stopPropagation();
                tracker.commit('flush');
                const valueBeforeRestore = line.ascii;
                line.ascii = line.originalAscii;
                line.latex = line.originalLatex || asciiToLatexPreview(line.ascii);
                line.edited = false;
                line._validatedAscii = '';
                line._validatedStack = '';
                field.value = line.ascii;
                field.style.background = '#fff';
                fieldHighlighter.reset(line.ascii);
                tracker.rebase();
                if (valueBeforeRestore !== line.ascii) {
                    research.log(answerBox, 'edit_committed', {
                        target: 'line',
                        lineIndex: index,
                        ocrOriginal: research.clip(line.originalAscii),
                        trigger: 'restore',
                        before: research.clip(valueBeforeRestore),
                        after: research.clip(line.ascii),
                        burstMs: 0,
                        inputEvents: 0
                    }, logOptions());
                }
                syncDiagnosticProcess();
                window.clearTimeout(line._editTimer);
                updateEditedControls();
                refreshCandidateLine(index);
                updateSelectedPreview();
                field.focus();
            });
            heading.append(label);
            action.append(badge, reset);
            updateEditedControls();

            if (selectedFormat === 'ascii') {
                field.addEventListener('input', () => {
                    panel._partialSelection = null;
                    line.ascii = field.value;
                    tracker.input();
                    line.latex = asciiToLatexPreview(line.ascii);
                    line.edited = line.ascii !== line.originalAscii;
                    line._validatedAscii = '';
                    line._validatedStack = '';
                    syncDiagnosticProcess();
                    field.style.background = '#fff';
                    updateEditedControls();
                    updateSelectedPreview();
                    window.clearTimeout(line._editTimer);
                    line._editTimer = window.setTimeout(() => {
                        refreshCandidateLine(index);
                    }, 250);
                });
                field.addEventListener('blur', () => tracker.commit('blur'));
            }
            row.append(selectionMarker, heading, fieldHighlighter.wrapper, action);
            panel._formatRows.appendChild(row);
        };
        const selectFormat = format => {
            const isAscii = format === 'ascii';
            selectedFormat = isAscii ? 'ascii' : 'latex';
            panel._latexTab.setAttribute('aria-selected', isAscii ? 'false' : 'true');
            panel._asciiTab.setAttribute('aria-selected', isAscii ? 'true' : 'false');
            panel._latexTab.style.background = isAscii ? '#fff' : '#e8f1ff';
            panel._asciiTab.style.background = isAscii ? '#e8f1ff' : '#fff';
            renderFormatRows();
        };
        panel._asciiTab.disabled = false;
        panel._asciiTab.title = '';
        panel._latexTab.onclick = () => selectFormat('latex');
        panel._asciiTab.onclick = () => selectFormat('ascii');
        panel._options.innerHTML = '';
        panel._options.scrollTop = 0;
        panel._tokenRows = [];
        panel._selectionBoxes = [];
        panel._optionWrappers = [];

        const showSelectionBoxes = selectedIndex => {
            panel._selectionBoxes.forEach((boxes, index) => {
                boxes.forEach(box => {
                    box.style.display = index === selectedIndex ? 'flex' : 'none';
                });
            });
        };

        const showSelectedLine = selectedIndex => {
            panel._optionWrappers.forEach((option, index) => {
                const selected = index === selectedIndex;
                option.style.border = selected ? '1px solid #8ab4f8' : '1px solid #e2e2e2';
                option.style.background = selected ? '#f3f8ff' : '#fff';
            });
        };

        const selectLine = (index, line) => {
            window.clearTimeout(panel._dragConversionTimer);
            panel._partialSelection = null;
            panel._selectionRequestId = (panel._selectionRequestId || 0) + 1;
            clearTokenSelections(panel);
            clearFormulaSelections(panel);
            showSelectionBoxes(index);
            showSelectedLine(index);
            // Both the radio and its wrapper report the same choice; only a
            // change of line is a selection.
            if (index !== selectedIndex) {
                const previous = resultLines[selectedIndex];
                if (previous && previous._hand2stackTracker) previous._hand2stackTracker.commit('flush');
                research.log(answerBox, 'candidate_selected', {
                    kind: 'line',
                    lineIndex: index,
                    previousIndex: selectedIndex,
                    isDefault: index === defaultIndex,
                    value: research.clip(stackValueForLine(line)),
                    ocrValue: research.clip(line && line.stack),
                    lineEdited: Boolean(line && line.edited)
                }, logOptions());
            }
            selectedIndex = index;
            updateSelectedPreview();
            window.clearTimeout(panel._renderSelectedTimer);
            panel._renderSelectedTimer = window.setTimeout(renderFormatRows, 0);
        };

        panel._options.addEventListener('change', event => {
            const input = event.target.closest('input[type="radio"][data-result-choice]');
            if (!input || !input.checked) return;
            const index = Number(input.value);
            if (Number.isInteger(index) && resultLines[index]) {
                selectLine(index, resultLines[index]);
            }
        }, {signal: panel._selectionAbortController.signal});

        panel._activateLine = index => {
            const input = panel._options.querySelector('input[type="radio"][value="' + index + '"]');
            if (input) {
                input.checked = true;
            }
            selectLine(index, resultLines[index]);
        };

        resultLines.forEach((line, index) => {
            const hasMath = Boolean(line.stack || line.math);
            const isDefault = index === defaultIndex;
            const optionId = 'local-hand2stack-line-' + Math.random().toString(36).slice(2);
            const wrapper = document.createElement('div');
            wrapper.dataset.resultLineIndex = String(index);
            wrapper.dataset.stackValue = line.stack || line.math || '';
            wrapper.style.display = 'grid';
            wrapper.style.gridTemplateColumns = 'auto 1fr';
            wrapper.style.columnGap = '8px';
            wrapper.style.alignItems = 'center';
            wrapper.style.padding = '5px 8px';
            wrapper.style.minHeight = '38px';
            wrapper.style.boxSizing = 'border-box';
            wrapper.style.border = isDefault ? '1px solid #8ab4f8' : '1px solid #e2e2e2';
            wrapper.style.borderRadius = '3px';
            wrapper.style.background = isDefault ? '#f3f8ff' : '#fff';
            wrapper.style.cursor = hasMath ? 'pointer' : 'default';
            wrapper.style.userSelect = 'text';

            const input = document.createElement('input');
            input.type = 'radio';
            input.name = panel._choiceName;
            input.id = optionId;
            input.value = String(index);
            input.dataset.resultChoice = '1';
            input.checked = isDefault;
            input.disabled = !hasMath;
            input.style.marginTop = '0';

            const body = document.createElement('label');
            body.htmlFor = optionId;
            body.style.display = 'flex';
            body.style.alignItems = 'center';
            body.style.minWidth = '0';
            body.style.width = '100%';
            const prefix = document.createElement('span');
            prefix.textContent = (config.lineprefix || 'Line') + ' ' + (index + 1);
            prefix.style.display = 'inline-block';
            prefix.style.flex = '0 0 auto';
            prefix.style.fontSize = '12px';
            prefix.style.color = '#555';
            prefix.style.marginRight = '12px';

            const lineContent = createLineContent(panel, line);
            const status = document.createElement('span');
            status.textContent = !hasMath
                ? 'text'
                : isDefault && resultLines.length > 1
                ? (config.recommendedanswer || 'Suggested')
                : '';
            status.style.marginLeft = 'auto';
            status.style.paddingLeft = '10px';
            status.style.fontSize = '11px';
            status.style.color = '#667085';
            status.style.whiteSpace = 'nowrap';
            line._prefix = prefix;
            line._body = body;
            line._lineContent = lineContent;
            line._status = status;
            const selectionBoxes = Array.from(lineContent.querySelectorAll('[data-token-selection-box]'));
            selectionBoxes.forEach(box => {
                box.style.display = isDefault ? 'flex' : 'none';
            });
            panel._selectionBoxes.push(selectionBoxes);

            body.appendChild(prefix);
            body.appendChild(lineContent);
            body.appendChild(status);
            wrapper.appendChild(input);
            wrapper.appendChild(body);
            panel._options.appendChild(wrapper);
            panel._optionWrappers.push(wrapper);

            wrapper.addEventListener('pointerdown', event => {
                if (!event.target.closest('[data-token-index], [data-stack-part-index]')) {
                    panel._partialSelection = null;
                }
            }, true);

            wrapper.addEventListener('click', event => {
                if (!hasMath) return;
                if ((panel._ignoreLineClickUntil || 0) > Date.now()) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (panel._partialSelection && panel._partialSelection.lineIndex === index) {
                        panel._stackTextarea.value = panel._partialSelection.value;
                    }
                    return;
                }
                if (panel._partialSelection && panel._partialSelection.lineIndex === index) {
                    event.preventDefault();
                    event.stopPropagation();
                    panel._stackTextarea.value = panel._partialSelection.value;
                    return;
                }
                if (event.target.closest('[data-token-index], [data-stack-part-index]')) {
                    return;
                }
                input.checked = true;
                selectLine(index, line);
            });

            input.addEventListener('change', () => {
                if (input.checked) {
                    if (panel._partialSelection && panel._partialSelection.lineIndex === index) {
                        panel._stackTextarea.value = panel._partialSelection.value;
                        return;
                    }
                    selectLine(index, line);
                }
            });
        });

        const refreshCandidateLine = index => {
            const line = resultLines[index];
            if (!line || !line._lineContent) return;
            const obsoleteControllers = line._interactiveControllers || [];
            obsoleteControllers.forEach(controller => controller.abort());
            panel._interactiveControllers = (panel._interactiveControllers || [])
                .filter(controller => !obsoleteControllers.includes(controller));
            line._interactiveControllers = [];
            line._prefix.textContent = (config.lineprefix || 'Line') + ' ' + (index + 1);
            const statuses = [];
            if (index === defaultIndex && resultLines.length > 1) {
                statuses.push(config.recommendedanswer || 'Suggested');
            }
            if (line.edited) statuses.push(config.edited || 'Edited');
            line._status.textContent = statuses.join(' · ');
            line._lineContent.innerHTML = '';
            // Keep the OCR prose styling, while synchronizing only its formula.
            let formulaUpdated = false;
            const synchronizedParts = line.displayParts.map(part => {
                if (part.type !== 'math' || formulaUpdated || !line.edited) return part;
                formulaUpdated = true;
                return Object.assign({}, part, {latex: line.latex, text: line.latex});
            });
            const synchronizedLine = Object.assign({}, line, {
                displayParts: synchronizedParts,
                math: line.edited ? line.latex : line.math
            });
            const synchronizedContent = createLineContent(panel, synchronizedLine);
            while (synchronizedContent.firstChild) {
                line._lineContent.appendChild(synchronizedContent.firstChild);
            }
            typesetMath(line._lineContent).then(() => {
                line._lineContent.querySelectorAll('[data-interactive-formula]').forEach(rendered => {
                    setupInteractiveFormula(panel, rendered, line);
                });
            });
        };

        const selected = resultLines[defaultIndex];
        panel._stackTextarea.value = selected ? (selected.stack || selected.math || '') : (stackResult || '');
        selectFormat('ascii');
        panel._applyBtn.onclick = async () => {
            const requestId = (panel._insertRequestId || 0) + 1;
            panel._insertRequestId = requestId;
            const lineIndex = selectedIndex;
            const line = resultLines[lineIndex];
            if (line && line._hand2stackTracker) line._hand2stackTracker.commit('apply');
            const ascii = line ? line.ascii : '';
            panel._applyBtn.disabled = true;
            setRequestStatus(panel, config.conversioninprogress || 'Converting and validating...');
            try {
                let stackValue = panel._partialSelection && panel._partialSelection.value
                    ? panel._partialSelection.value
                    : stackValueForLine(line);
                const partial = Boolean(panel._partialSelection && panel._partialSelection.value);
                if (line && line.edited && !partial) {
                    const validationStartedAt = Date.now();
                    const logValidation = (valid, stack, error = null) => research.log(answerBox, 'validation_completed', {
                        source: 'h2s_convert',
                        expression: research.clip(ascii),
                        stack: research.clip(stack),
                        valid,
                        errorCode: error ? (error.code || null) : null,
                        message: error ? research.clip(error.message, 300) : '',
                        latencyMs: Date.now() - validationStartedAt
                    }, logOptions());
                    try {
                        stackValue = await postAscii(ascii);
                    } catch (error) {
                        if (panel._insertRequestId === requestId) logValidation(false, '', error);
                        throw error;
                    }
                    if (panel._insertRequestId !== requestId || selectedIndex !== lineIndex || line.ascii !== ascii) {
                        return;
                    }
                    logValidation(Boolean(stackValue), stackValue);
                    line._validatedAscii = ascii;
                    line._validatedStack = stackValue;
                }
                if (!stackValue) {
                    throw new Error(config.recognizefailed || 'Conversion failed.');
                }
                const ownAnchor = answerBox.dataset.hand2stackAnchor || '';
                const insertedValue = ownAnchor ? stripOwnAnchor(ownAnchor, stackValue) : stackValue;
                panel._stackTextarea.value = insertedValue;
                const previousValue = answerBox.value;
                setAnswerValue(answerBox, insertedValue);
                research.log(answerBox, 'answer_inserted', {
                    via: 'apply',
                    value: research.clip(insertedValue),
                    converted: research.clip(stackValue),
                    strippedAnchor: insertedValue !== stackValue ? normalizeAnchorText(ownAnchor) : null,
                    previousValue: research.clip(previousValue),
                    lineIndex,
                    partial,
                    lineEdited: Boolean(line && line.edited),
                    ocrValue: research.clip(line && line.stack)
                }, logOptions());
                syncDiagnosticProcess();
                setRequestStatus(panel);
            } catch (error) {
                if (panel._insertRequestId === requestId) {
                    setRequestStatus(panel, error.message, true);
                }
            } finally {
                if (panel._insertRequestId === requestId) {
                    panel._applyBtn.disabled = false;
                }
            }
        };
        typesetMath(panel._options).then(() => {
            panel._options.querySelectorAll('[data-interactive-formula]').forEach(rendered => {
                const option = rendered.closest('[data-result-line-index]');
                const lineIndex = option ? Number(option.dataset.resultLineIndex) : -1;
                setupInteractiveFormula(panel, rendered, resultLines[lineIndex] || null);
            });
            const defaultOption = panel._optionWrappers[defaultIndex];
            if (defaultOption) {
                const list = panel._options;
                const bottom = defaultOption.offsetTop + defaultOption.offsetHeight;
                if (bottom > list.clientHeight) {
                    list.scrollTop = defaultOption.offsetTop - Math.max(0, (list.clientHeight - defaultOption.offsetHeight) / 2);
                }
            }
        });
    };

    const logRecognitionFailure = (answerBox, recognition, error) => {
        research.log(answerBox, 'recognition_completed', {
            requestId: recognition.requestId,
            source: recognition.source,
            ok: false,
            errorCode: (error && error.code) || null,
            message: research.clip(error && error.message, 300),
            latencyMs: recognition.latencyMs
        }, {modality: recognition.source});
    };

    const createMobileSession = async () => {
        const formData = new FormData();
        formData.append('sesskey', config.sesskey);

        const response = await fetch(config.sessionCreateUrl, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });
        const data = await parseJsonResponse(response);

        if (!response.ok || !data.success) {
            throw requestError(data, response);
        }

        return data;
    };

    const fetchSessionResult = async (sessionId) => {
        const separator = config.sessionResultUrl.indexOf('?') === -1 ? '?' : '&';
        const response = await fetch(config.sessionResultUrl + separator + 'session=' + encodeURIComponent(sessionId), {
            credentials: 'same-origin'
        });
        const data = await parseJsonResponse(response);

        if (!response.ok || !data.success) {
            throw requestError(data, response);
        }

        return data;
    };

    const buildQrDataUrl = (svg) => {
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(String(svg || ''));
    };

    const icons = {
        image: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"></rect><circle cx="8.5" cy="8.5" r="1.5" fill="none" stroke="currentColor" stroke-width="2"></circle><path d="M21 15l-5-5L5 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
        camera: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M14.5 4l1.5 2H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l1.5-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"></circle></svg>',
        pen: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20zM14 7l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>'
    };

    const createHandwritingPanel = (answerBox, resultPanel, requestCoordinator, lifecycleSignal) => {
        const panel = document.createElement('div');
        panel.style.cssText = 'display:none;margin-top:8px;padding:10px;border:1px solid #9db7d5;background:#f8fbff;width:100%;max-width:none;box-sizing:border-box';

        const instruction = document.createElement('div');
        instruction.textContent = config.handwriteinstructions;
        instruction.style.marginBottom = '8px';
        const canvas = document.createElement('canvas');
        canvas.width = 900;
        canvas.height = 420;
        canvas.style.cssText = 'display:block;width:100%;height:min(44vh,420px);min-height:260px;background:#fff;border:1px solid #8795a5;border-radius:4px;touch-action:none;overscroll-behavior:contain;cursor:crosshair';
        canvas.setAttribute('aria-label', config.handwritebtn);

        const canvasWrapper = document.createElement('div');
        canvasWrapper.style.cssText = 'position:relative;width:100%';

        const resizeHandle = document.createElement('button');
        resizeHandle.type = 'button';
        resizeHandle.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">' +
            '<path d="M6 16L16 6M11 16l5-5M16 16h.01" fill="none" stroke="currentColor" stroke-width="1.5" ' +
            'stroke-linecap="round"/></svg>';
        resizeHandle.setAttribute('aria-label', config.resizehandwriting || 'Drag to resize the writing area');
        resizeHandle.title = config.resizehandwriting || 'Drag to resize the writing area';
        resizeHandle.style.cssText = 'position:absolute;right:2px;bottom:2px;width:28px;height:28px;padding:4px;border:0;background:rgba(255,255,255,.88);color:#64748b;cursor:nwse-resize;touch-action:none;user-select:none;display:flex;align-items:center;justify-content:center;border-radius:3px';

        let resizePointerId = null;
        let resizeStartX = 0;
        let resizeStartY = 0;
        let resizeStartWidth = 0;
        let resizeStartHeight = 0;
        let resizeScaleX = 1;
        let resizeScaleY = 1;
        let canvasBackingScale = 0;
        resizeHandle.addEventListener('pointerdown', event => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            event.preventDefault();
            resizePointerId = event.pointerId;
            resizeStartX = event.clientX;
            resizeStartY = event.clientY;
            resizeStartWidth = panel.getBoundingClientRect().width;
            const canvasBounds = canvas.getBoundingClientRect();
            resizeStartHeight = canvasBounds.height;
            resizeScaleX = canvasBounds.width > 0 ? canvas.width / canvasBounds.width : 1;
            resizeScaleY = canvasBounds.height > 0 ? canvas.height / canvasBounds.height : resizeScaleX;
            canvasBackingScale = resizeScaleX;
        });
        document.addEventListener('pointermove', event => {
            if (resizePointerId === null || event.pointerId !== resizePointerId) return;
            event.preventDefault();
            const panelLeft = panel.getBoundingClientRect().left;
            const availableWidth = Math.max(360, window.innerWidth - panelLeft - 24);
            const nextWidth = Math.max(360, Math.min(availableWidth, resizeStartWidth + event.clientX - resizeStartX));
            const nextHeight = Math.max(260, Math.min(1200, resizeStartHeight + event.clientY - resizeStartY));
            panel.style.width = Math.round(nextWidth) + 'px';
            canvas.style.height = Math.round(nextHeight) + 'px';
            const resizedBounds = canvas.getBoundingClientRect();
            if (resizedBounds.width > 0 && resizedBounds.height > 0) {
                canvas.width = Math.round(resizedBounds.width * resizeScaleX);
                canvas.height = Math.round(resizedBounds.height * resizeScaleY);
                redraw();
            }
        }, {passive: false, signal: lifecycleSignal});
        const finishResize = event => {
            if (resizePointerId === null || event.pointerId !== resizePointerId) return;
            resizePointerId = null;
        };
        document.addEventListener('pointerup', finishResize, {signal: lifecycleSignal});
        document.addEventListener('pointercancel', finishResize, {signal: lifecycleSignal});

        const controls = document.createElement('div');
        controls.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap';
        const draw = document.createElement('button');
        const eraser = document.createElement('button');
        const undo = document.createElement('button');
        const clear = document.createElement('button');
        const recognize = document.createElement('button');
        const status = document.createElement('span');
        [draw, eraser, undo, clear, recognize].forEach(button => {
            button.type = 'button';
            button.className = 'btn btn-secondary';
        });
        recognize.className = 'btn btn-primary';
        draw.textContent = config.draw || 'Pen';
        eraser.textContent = config.eraser || 'Eraser';
        undo.textContent = config.undo;
        clear.textContent = config.clear;
        recognize.textContent = config.recognizestrokes;
        // Pen widths are in CSS pixels; each stroke keeps the width it was drawn with.
        const penSizes = [
            {width: 1.5, label: config.penthin || 'Thin pen'},
            {width: 2.5, label: config.penmedium || 'Medium pen'},
            {width: 4, label: config.penthick || 'Thick pen'}
        ];
        let penWidth = penSizes[1].width;
        const sizeGroup = document.createElement('div');
        sizeGroup.setAttribute('role', 'group');
        sizeGroup.setAttribute('aria-label', config.pensize || 'Pen size');
        sizeGroup.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding:2px;' +
            'border:1px solid #cfd4dc;border-radius:6px;background:#fff';
        const sizeButtons = penSizes.map(size => {
            const button = document.createElement('button');
            button.type = 'button';
            button.title = size.label;
            button.setAttribute('aria-label', size.label);
            button.style.cssText = 'width:32px;height:30px;padding:0;border:0;border-radius:4px;' +
                'display:inline-flex;align-items:center;justify-content:center;cursor:pointer';
            const dot = document.createElement('span');
            const dotSize = Math.round(size.width * 2 + 2);
            dot.style.cssText = 'display:block;border-radius:50%;background:#111827;' +
                'width:' + dotSize + 'px;height:' + dotSize + 'px';
            button.appendChild(dot);
            button._penWidth = size.width;
            sizeGroup.appendChild(button);
            return button;
        });
        const paintSizeButtons = () => {
            sizeButtons.forEach(button => {
                const selected = button._penWidth === penWidth;
                button.setAttribute('aria-pressed', selected ? 'true' : 'false');
                button.style.background = selected ? '#e8f1ff' : 'transparent';
                button.style.boxShadow = selected ? 'inset 0 0 0 1px #3978c5' : 'none';
            });
        };
        paintSizeButtons();
        controls.append(draw, eraser, sizeGroup, undo, clear, recognize, status);
        canvasWrapper.append(canvas, resizeHandle);
        panel.append(instruction, canvasWrapper, controls);

        const strokes = [];
        const history = [];
        let active = null;
        let tool = 'draw';
        let canvasRect = null;
        let drawFrame = null;
        const dirtyStrokes = new Set();
        const context = canvas.getContext('2d');
        const cloneStrokes = () => strokes.map(stroke => ({
            x: stroke.x.slice(), y: stroke.y.slice(), drawn: stroke.x.length, width: stroke.width
        }));
        const saveHistory = () => history.push(cloneStrokes());
        // Aggregate writing behaviour since the last recognition; coordinates
        // are never logged (spec §4.2).
        const PAUSE_MS = 2000;
        let writing = null;
        const resetWriting = () => {
            writing = {strokes: 0, erases: 0, undos: 0, clears: 0, firstAt: 0, lastEndAt: 0, pauses: 0, longestPause: 0};
        };
        resetWriting();
        const takeWritingStats = () => {
            const stats = {
                strokeCount: strokes.length,
                newStrokeCount: writing.strokes,
                pointCount: strokes.reduce((total, stroke) => total + stroke.x.length, 0),
                eraseCount: writing.erases,
                undoCount: writing.undos,
                clearCount: writing.clears,
                writingDurationMs: writing.firstAt ? Math.max(0, writing.lastEndAt - writing.firstAt) : 0,
                pauseCount: writing.pauses,
                longestPauseMs: writing.longestPause
            };
            resetWriting();
            return stats;
        };
        const setTool = nextTool => {
            tool = nextTool;
            const drawing = tool === 'draw';
            draw.setAttribute('aria-pressed', drawing ? 'true' : 'false');
            eraser.setAttribute('aria-pressed', drawing ? 'false' : 'true');
            draw.className = drawing ? 'btn btn-primary' : 'btn btn-secondary';
            eraser.className = drawing ? 'btn btn-secondary' : 'btn btn-primary';
            canvas.style.cursor = drawing ? 'crosshair' : 'cell';
        };
        const configureContext = (width = 4) => {
            context.strokeStyle = '#111827';
            context.lineWidth = width;
            context.lineCap = 'round';
            context.lineJoin = 'round';
        };
        const pointFor = event => {
            const rect = canvasRect || canvas.getBoundingClientRect();
            return {
                x: Math.round((event.clientX - rect.left) * canvas.width / rect.width),
                y: Math.round((event.clientY - rect.top) * canvas.height / rect.height)
            };
        };
        const drawNewSegments = stroke => {
            const length = stroke.x.length;
            if (!length || stroke.drawn >= length) return;

            configureContext(stroke.width);
            context.beginPath();
            if (stroke.drawn === 0) {
                context.moveTo(stroke.x[0], stroke.y[0]);
                if (length === 1) context.lineTo(stroke.x[0] + 0.01, stroke.y[0] + 0.01);
            } else {
                const previous = stroke.drawn - 1;
                context.moveTo(stroke.x[previous], stroke.y[previous]);
            }
            for (let i = Math.max(1, stroke.drawn); i < length; i++) {
                context.lineTo(stroke.x[i], stroke.y[i]);
            }
            context.stroke();
            stroke.drawn = length;
        };
        const flushDrawing = () => {
            drawFrame = null;
            dirtyStrokes.forEach(drawNewSegments);
            dirtyStrokes.clear();
        };
        const scheduleDrawing = stroke => {
            dirtyStrokes.add(stroke);
            if (drawFrame === null) drawFrame = window.requestAnimationFrame(flushDrawing);
        };
        const redraw = () => {
            if (drawFrame !== null) {
                window.cancelAnimationFrame(drawFrame);
                drawFrame = null;
            }
            dirtyStrokes.clear();
            context.clearRect(0, 0, canvas.width, canvas.height);
            strokes.forEach(stroke => {
                stroke.drawn = 0;
                drawNewSegments(stroke);
            });
        };
        const distanceToSegment = (point, start, end) => {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
            const ratio = Math.max(0, Math.min(1,
                ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)
            ));
            return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
        };
        const eraseAt = point => {
            let changed = false;
            for (let strokeIndex = strokes.length - 1; strokeIndex >= 0; strokeIndex--) {
                const stroke = strokes[strokeIndex];
                for (let i = 0; i < stroke.x.length; i++) {
                    const start = {x: stroke.x[i], y: stroke.y[i]};
                    const end = i + 1 < stroke.x.length ? {x: stroke.x[i + 1], y: stroke.y[i + 1]} : start;
                    if (distanceToSegment(point, start, end) <= 24) {
                        strokes.splice(strokeIndex, 1);
                        changed = true;
                        break;
                    }
                }
            }
            if (changed) redraw();
            return changed;
        };
        const addSamples = (event, stroke = active) => {
            if (!stroke) return;
            const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
            samples.forEach(sample => {
                const point = pointFor(sample);
                if (stroke.erasing) {
                    stroke.changed = eraseAt(point) || stroke.changed;
                    return;
                }
                const last = stroke.x.length - 1;
                if (last < 0 || stroke.x[last] !== point.x || stroke.y[last] !== point.y) {
                    stroke.x.push(point.x);
                    stroke.y.push(point.y);
                }
            });
            if (!stroke.erasing) scheduleDrawing(stroke);
        };
        const flushPendingDrawing = () => {
            if (drawFrame === null) return;
            window.cancelAnimationFrame(drawFrame);
            flushDrawing();
        };
        const syncCanvasBackingStore = () => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            if (!canvasBackingScale) {
                canvasBackingScale = canvas.width / rect.width;
            }
            const expectedWidth = Math.max(1, Math.round(rect.width * canvasBackingScale));
            const expectedHeight = Math.max(1, Math.round(rect.height * canvasBackingScale));
            if (canvas.width === expectedWidth && canvas.height === expectedHeight) return;
            canvas.width = expectedWidth;
            canvas.height = expectedHeight;
            redraw();
        };
        const syncEmptyCanvasBackingStore = () => {
            if (!strokes.length) syncCanvasBackingStore();
        };
        if (typeof ResizeObserver !== 'undefined') {
            const canvasResizeObserver = new ResizeObserver(() => {
                // Keep the backing-store scale constant when surrounding result UI
                // changes width. Existing stroke coordinates then retain their exact
                // on-screen size and position instead of being stretched by CSS.
                syncCanvasBackingStore();
            });
            canvasResizeObserver.observe(canvas);
            lifecycleSignal.addEventListener('abort', () => canvasResizeObserver.disconnect(), {once: true});
        }
        const startStroke = (pointerId, event) => {
            syncEmptyCanvasBackingStore();
            canvasRect = canvas.getBoundingClientRect();
            saveHistory();
            const strokeStartedAt = Date.now();
            if (writing.lastEndAt) {
                const pause = strokeStartedAt - writing.lastEndAt;
                if (pause >= PAUSE_MS) writing.pauses++;
                writing.longestPause = Math.max(writing.longestPause, pause);
            }
            writing.firstAt = writing.firstAt || strokeStartedAt;
            if (tool === 'eraser') writing.erases++;
            else writing.strokes++;
            if (tool === 'eraser') {
                active = {pointerId, erasing: true, changed: false};
                addSamples(event);
                return;
            }
            const scale = canvasRect.width > 0 ? canvas.width / canvasRect.width : 1;
            active = {x: [], y: [], drawn: 0, pointerId, width: penWidth * scale};
            strokes.push(active);
            addSamples(event);
        };
        const finishStroke = (pointerId, event = null) => {
            if (!active || pointerId !== active.pointerId) return;
            if (event) addSamples(event, active);
            flushPendingDrawing();
            if (active.erasing && !active.changed) history.pop();
            writing.lastEndAt = Date.now();
            active = null;
            canvasRect = null;
        };
        canvas.addEventListener('pointerdown', event => {
            if ((isIPadWebKit && (event.pointerType === 'touch' || event.pointerType === 'pen'))
                    || (event.pointerType === 'mouse' && event.button !== 0)) return;
            event.preventDefault();
            startStroke(event.pointerId, event);
        });
        canvas.addEventListener('pointermove', event => {
            if (!active || (isIPadWebKit && (event.pointerType === 'touch' || event.pointerType === 'pen'))
                    || event.pointerId !== active.pointerId) return;
            event.preventDefault();
            addSamples(event);
        });
        const endStroke = event => {
            if (isIPadWebKit && (event.pointerType === 'touch' || event.pointerType === 'pen')) return;
            finishStroke(event.pointerId, event);
        };
        canvas.addEventListener('pointerup', endStroke);
        canvas.addEventListener('pointercancel', event => {
            if (!active || event.pointerId !== active.pointerId) return;
            if (active.erasing && !active.changed) history.pop();
            active = null;
            canvasRect = null;
        });
        // On iPad/iPhone WebKit, handle both Pencil and finger input through
        // Touch Events. This avoids the Pencil gaps seen through Pointer Events
        // while still allowing ordinary finger handwriting.
        const drawingTouch = (event, identifier = null) => Array.from(event.changedTouches || []).find(touch =>
            identifier === null || touch.identifier === identifier);
        canvas.addEventListener('touchstart', event => {
            if (!isIPadWebKit) return;
            const touch = drawingTouch(event);
            if (!touch) return;
            event.preventDefault();
            startStroke('touch-' + touch.identifier, touch);
        }, {passive: false});
        canvas.addEventListener('touchmove', event => {
            if (!isIPadWebKit || !active || typeof active.pointerId !== 'string') return;
            const identifier = Number(active.pointerId.slice(6));
            const touch = drawingTouch(event, identifier);
            if (!touch) return;
            event.preventDefault();
            addSamples(touch);
        }, {passive: false});
        const endTouchStroke = event => {
            if (!isIPadWebKit || !active || typeof active.pointerId !== 'string') return;
            const identifier = Number(active.pointerId.slice(6));
            const touch = drawingTouch(event, identifier);
            if (!touch) return;
            event.preventDefault();
            finishStroke(active.pointerId, touch);
        };
        canvas.addEventListener('touchend', endTouchStroke, {passive: false});
        canvas.addEventListener('touchcancel', event => {
            if (!isIPadWebKit || !active || typeof active.pointerId !== 'string') return;
            const identifier = Number(active.pointerId.slice(6));
            if (!drawingTouch(event, identifier)) return;
            if (active.erasing && !active.changed) history.pop();
            active = null;
            canvasRect = null;
        }, {passive: false});
        draw.addEventListener('click', () => setTool('draw'));
        eraser.addEventListener('click', () => setTool('eraser'));
        sizeButtons.forEach(button => button.addEventListener('click', () => {
            penWidth = button._penWidth;
            paintSizeButtons();
            setTool('draw');
        }));
        undo.addEventListener('click', () => {
            if (!history.length) return;
            writing.undos++;
            strokes.splice(0, strokes.length, ...history.pop());
            redraw();
            status.textContent = '';
        });
        clear.addEventListener('click', () => {
            if (!strokes.length) return;
            writing.clears++;
            saveHistory();
            strokes.length = 0;
            redraw();
            status.textContent = '';
        });
        setTool('draw');
        recognize.addEventListener('click', async () => {
            if (!strokes.length) { status.textContent = config.nostrokes; return; }
            const requestId = requestCoordinator.begin();
            const startedAt = Date.now();
            research.log(answerBox, 'recognition_started', {
                requestId,
                source: 'handwrite',
                handwriting: takeWritingStats()
            }, {modality: 'handwrite'});
            recognize.disabled = true;
            status.textContent = config.uploading;
            setRequestStatus(resultPanel);
            try {
                const result = await postStrokes({x: strokes.map(s => s.x), y: strokes.map(s => s.y)});
                if (!requestCoordinator.isCurrent(requestId)) return;
                const stackResult = result.stack || result.text || '';
                resultPanel._hand2stackRecognition = {requestId, source: 'handwrite', latencyMs: Date.now() - startedAt};
                updateResultPanel(resultPanel, result.raw_latex || '', result.raw_asciimath || '', stackResult,
                    answerBox, result.lines || [], result.freetext || result.raw_text || '', canvas.toDataURL('image/png'));
                applyMatchedAnswers(answerBox, result.lines || [],
                    () => requestCoordinator.isCurrent(requestId), reportTargetResult).catch(error => {
                    window.console.error('[hand2stack] applyMatchedAnswers failed:', error);
                });
                status.textContent = '';
            } catch (error) {
                if (requestCoordinator.isCurrent(requestId)) {
                    logRecognitionFailure(answerBox, {requestId, source: 'handwrite', latencyMs: Date.now() - startedAt}, error);
                    status.textContent = (config.recognizefailed || 'Recognition failed.') + ' ' + error.message;
                }
            } finally {
                recognize.disabled = false;
                if (!requestCoordinator.isCurrent(requestId)) {
                    status.textContent = '';
                }
            }
        });
        return panel;
    };

    const setIconButtonLabel = (button, label) => {
        button.title = label;
        button.setAttribute('aria-label', label);
    };

    const iconButtonColors = {
        idle: {background: '#fff', border: '#cfd4dc', color: '#374151'},
        hover: {background: '#f3f6fa', border: '#aeb6c2', color: '#1f2937'},
        selected: {background: '#e8f1ff', border: '#3978c5', color: '#1d4f91'}
    };

    const paintIconButton = (button) => {
        const selected = button.getAttribute('aria-pressed') === 'true';
        const colors = iconButtonColors[selected ? 'selected' : (button._hovered ? 'hover' : 'idle')];
        button.style.background = colors.background;
        button.style.borderColor = colors.border;
        button.style.color = colors.color;
    };

    const createIconButton = (label, icon) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.innerHTML = icon;
        setIconButtonLabel(button, label);
        button.style.width = '36px';
        button.style.height = '34px';
        button.style.padding = '0';
        button.style.border = '1px solid';
        button.style.borderRadius = '6px';
        button.style.boxShadow = '0 1px 2px rgba(15, 23, 42, 0.06)';
        button.style.display = 'inline-flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.flex = '0 0 auto';
        button.style.cursor = 'pointer';
        button.style.transition = 'background-color 0.15s, border-color 0.15s, color 0.15s';
        button.addEventListener('mouseenter', () => {
            button._hovered = true;
            paintIconButton(button);
        });
        button.addEventListener('mouseleave', () => {
            button._hovered = false;
            paintIconButton(button);
        });
        paintIconButton(button);
        return button;
    };

    const attachButton = (answerBox) => {
        if (!answerBox || answerBox.dataset.hand2stackBound === '1') {
            return;
        }

        answerBox.dataset.hand2stackBound = '1';
        captureAnswerAnchor(answerBox);
        if (answerBox.tagName === 'INPUT' && !isFreeTextInput(answerBox)) {
            answerBox.style.width = 'min(260px, 45vw)';
            answerBox.style.maxWidth = '100%';
        }

        const lifecycleController = new AbortController();
        let recognitionRequestId = 0;
        const requestCoordinator = {
            begin: () => ++recognitionRequestId,
            invalidate: () => ++recognitionRequestId,
            isCurrent: requestId => requestId === recognitionRequestId && answerBox.isConnected
        };
        const fileInput = createHiddenFileInput(false);
        const cameraInput = isMobileOrTablet ? createHiddenFileInput(true) : null;
        const resultPanel = createResultPanel();
        const handwritingPanel = createHandwritingPanel(
            answerBox,
            resultPanel,
            requestCoordinator,
            lifecycleController.signal
        );
        resultPanel._layoutReference = handwritingPanel;
        const mobilePanel = createMobilePanel();
        let mobilePollTimer = null;
        let mobilePollInFlight = false;
        let mobilePollFailures = 0;
        let lastMobileResultVersion = '';

        const uploadLabel = config.uploadbtn || 'Upload math image';
        const mobileLabel = isMobileOrTablet
            ? (config.camerabtn || 'Take a photo')
            : (config.mobilebtn || 'Mobile Math Upload');
        const uploadBtn = createIconButton(uploadLabel, icons.image);
        const mobileBtn = createIconButton(mobileLabel, icons.camera);
        const handwriteBtn = createIconButton(config.handwritebtn, icons.pen);
        let inputMode = '';

        const selectInputMode = mode => {
            if (inputMode !== mode) {
                requestCoordinator.invalidate();
            }
            inputMode = mode;
            answerBox._hand2stackModality = mode;
            handwritingPanel.style.display = mode === 'handwrite' ? 'block' : 'none';
            mobilePanel.style.display = mode === 'mobile' ? 'block' : 'none';

            if (mode !== 'mobile' && mobilePollTimer) {
                window.clearInterval(mobilePollTimer);
                mobilePollTimer = null;
            }

            [
                [uploadBtn, 'image'],
                [handwriteBtn, 'handwrite'],
                [mobileBtn, isMobileOrTablet ? 'camera' : 'mobile']
            ].forEach(([button, buttonMode]) => {
                button.setAttribute('aria-pressed', mode === buttonMode ? 'true' : 'false');
                paintIconButton(button);
            });
        };

        handwriteBtn.addEventListener('click', () => {
            selectInputMode('handwrite');
        });

        uploadBtn.addEventListener('click', () => {
            selectInputMode('image');
            fileInput.value = '';
            fileInput.click();
        });

        const recognizeImageFile = async (file, button, idleLabel) => {
            if (!file) return;

            const requestId = requestCoordinator.begin();
            const source = button === uploadBtn ? 'image' : 'camera';
            const startedAt = Date.now();
            research.log(answerBox, 'recognition_started', {
                requestId,
                source,
                image: {mime: file.type || '', bytes: file.size || 0}
            }, {modality: source});
            const sourceUrl = URL.createObjectURL(file);
            button.disabled = true;
            setIconButtonLabel(button, config.uploading || 'Recognizing...');
            setRequestStatus(resultPanel);

            try {
                const result = await postImage(config.recognizeUrl, file);
                if (!requestCoordinator.isCurrent(requestId)) return;
                const stackResult = result.stack || result.normalized || result.text || '';

                if (!stackResult && !result.raw_asciimath && !result.raw_latex && !result.freetext && !result.raw_text) {
                    throw new Error('Empty STACK result');
                }

                if (resultPanel._sourceObjectUrl) URL.revokeObjectURL(resultPanel._sourceObjectUrl);
                resultPanel._sourceObjectUrl = sourceUrl;
                resultPanel._hand2stackRecognition = {requestId, source, latencyMs: Date.now() - startedAt};
                updateResultPanel(resultPanel, result.raw_latex || '', result.raw_asciimath || '', stackResult,
                    answerBox, result.lines || [], result.freetext || result.raw_text || '', sourceUrl);
                applyMatchedAnswers(answerBox, result.lines || [],
                    () => requestCoordinator.isCurrent(requestId), reportTargetResult).catch(error => {
                    window.console.error('[hand2stack] applyMatchedAnswers failed:', error);
                });
            } catch (error) {
                if (!requestCoordinator.isCurrent(requestId)) return;
                logRecognitionFailure(answerBox, {requestId, source, latencyMs: Date.now() - startedAt}, error);
                window.console.error('[hand2stack] recognition failed:', error);
                resultPanel.style.display = 'block';
                setRequestStatus(resultPanel, (config.recognizefailed || 'Recognition failed.') + ' ' + error.message, true);
            } finally {
                if (resultPanel._sourceObjectUrl !== sourceUrl) URL.revokeObjectURL(sourceUrl);
                button.disabled = false;
                setIconButtonLabel(button, idleLabel);
            }
        };

        fileInput.addEventListener('change', () => {
            recognizeImageFile(fileInput.files && fileInput.files[0], uploadBtn, uploadLabel);
        });

        if (cameraInput) {
            cameraInput.addEventListener('change', () => {
                recognizeImageFile(cameraInput.files && cameraInput.files[0], mobileBtn, mobileLabel);
            });
        }

        mobileBtn.addEventListener('click', async () => {
            if (cameraInput) {
                selectInputMode('camera');
                cameraInput.value = '';
                cameraInput.click();
                return;
            }
            selectInputMode('mobile');
            const requestId = requestCoordinator.begin();
            try {
                if (mobilePollTimer) {
                    window.clearInterval(mobilePollTimer);
                    mobilePollTimer = null;
                }
                lastMobileResultVersion = '';
                mobilePollFailures = 0;
                mobilePollInFlight = false;

                mobileBtn.disabled = true;
                setIconButtonLabel(mobileBtn, config.creatingmobilesession || 'Creating mobile upload session...');

                const data = await createMobileSession();
                if (inputMode !== 'mobile' || !requestCoordinator.isCurrent(requestId)) {
                    mobileBtn.disabled = false;
                    setIconButtonLabel(mobileBtn, mobileLabel);
                    return;
                }
                const sessionId = data.session_id;
                research.log(answerBox, 'recognition_started', {
                    requestId,
                    source: 'mobile',
                    mobileSession: true
                }, {modality: 'mobile'});

                mobilePanel.style.display = 'block';
                mobilePanel._link.href = data.mobile_url;
                mobilePanel._link.textContent = data.mobile_url;
                if (!data.qr_svg) {
                    throw new Error('Moodle did not return a QR code.');
                }
                mobilePanel._qrImg.src = buildQrDataUrl(data.qr_svg);
                if (data.mobile_url_warning) {
                    mobilePanel._warning.textContent = data.mobile_url_warning;
                    mobilePanel._warning.style.display = 'block';
                } else {
                    mobilePanel._warning.textContent = '';
                    mobilePanel._warning.style.display = 'none';
                }
                mobilePanel._status.textContent = config.waitingmobileupload || 'Waiting for mobile upload...';

                mobileBtn.disabled = false;
                setIconButtonLabel(mobileBtn, mobileLabel);

                const start = Date.now();
                const timeoutMs = 10 * 60 * 1000;
                mobilePollTimer = window.setInterval(async () => {
                    if (mobilePollInFlight || !requestCoordinator.isCurrent(requestId) || inputMode !== 'mobile') {
                        return;
                    }
                    mobilePollInFlight = true;
                    try {
                        const result = await fetchSessionResult(sessionId);
                        if (!requestCoordinator.isCurrent(requestId) || inputMode !== 'mobile') return;
                        mobilePollFailures = 0;

                        if (result.ready) {
                            const stackResult = result.stack || result.text || '';
                            const resultVersion = [
                                result.updated_at || '',
                                result.raw_latex || '',
                                stackResult
                            ].join(':');

                            if (resultVersion !== lastMobileResultVersion) {
                                lastMobileResultVersion = resultVersion;
                                mobilePanel._status.textContent = config.mobileuploadreceived || 'Successfully received mobile result. You can upload another photo with the same QR code.';
                                resultPanel._hand2stackRecognition = {requestId, source: 'mobile', latencyMs: null};
                                updateResultPanel(resultPanel, result.raw_latex || '', result.raw_asciimath || '', stackResult,
                                    answerBox, result.lines || [], result.freetext || result.raw_text || '');
                                applyMatchedAnswers(answerBox, result.lines || [],
                                    () => requestCoordinator.isCurrent(requestId) && inputMode === 'mobile', reportTargetResult).catch(error => {
                                    window.console.error('[hand2stack] applyMatchedAnswers failed:', error);
                                });
                            }
                        } else if (result.expired) {
                            window.clearInterval(mobilePollTimer);
                            mobilePollTimer = null;
                            mobilePanel._status.textContent = config.mobileuploadexpired || 'This mobile upload session has expired.';
                        } else {
                            mobilePanel._status.textContent = config.waitingmobileupload || 'Waiting for mobile upload...';
                        }

                        if (Date.now() - start > timeoutMs) {
                            window.clearInterval(mobilePollTimer);
                            mobilePollTimer = null;
                            mobilePanel._status.textContent = config.mobileuploadtimeout || 'Timeout waiting for result. Please create a new session.';
                        }
                    } catch (error) {
                        window.console.error('[hand2stack] polling failed:', error);
                        mobilePollFailures++;
                        mobilePanel._status.textContent = config.pollingfailed || 'The mobile connection was interrupted. Retrying...';
                        if (mobilePollFailures >= 3) {
                            window.clearInterval(mobilePollTimer);
                            mobilePollTimer = null;
                            mobilePanel._status.textContent = error.message;
                        }
                    } finally {
                        mobilePollInFlight = false;
                    }
                }, 2000);
            } catch (error) {
                if (inputMode !== 'mobile' || !requestCoordinator.isCurrent(requestId)) {
                    mobileBtn.disabled = false;
                    setIconButtonLabel(mobileBtn, mobileLabel);
                    return;
                }
                window.console.error('[hand2stack] mobile session failed:', error);
                window.alert((config.mobilesessionfailed || 'Failed to create mobile session:') + ' ' + error.message);
                mobileBtn.disabled = false;
                setIconButtonLabel(mobileBtn, mobileLabel);
            }
        });

        // Keep the buttons together: if they do not fit beside the answer box,
        // the whole group wraps onto the next line instead of splitting up.
        const buttonGroup = document.createElement('span');
        buttonGroup.style.display = 'inline-flex';
        buttonGroup.style.flexWrap = 'nowrap';
        buttonGroup.style.alignItems = 'center';
        buttonGroup.style.gap = '6px';
        buttonGroup.style.verticalAlign = 'top';
        buttonGroup.style.whiteSpace = 'nowrap';
        buttonGroup.append(uploadBtn, handwriteBtn);
        if (config.enablemobile) {
            buttonGroup.appendChild(mobileBtn);
        }

        answerBox.insertAdjacentElement('afterend', buttonGroup);

        // Beside the box the group just needs a small gap. Once it has wrapped
        // below, line it up with the box's left edge and give it room to breathe.
        const layoutButtonGroup = () => {
            if (answerBox.offsetParent === null) return;
            buttonGroup.style.margin = '0 0 0 10px';
            const boxRect = answerBox.getBoundingClientRect();
            const groupRect = buttonGroup.getBoundingClientRect();
            if (groupRect.top < boxRect.bottom - 1) return;
            const indent = Math.max(0, boxRect.left - (groupRect.left - 10));
            buttonGroup.style.margin = '8px 0 4px ' + indent + 'px';
        };
        layoutButtonGroup();
        window.addEventListener('resize', layoutButtonGroup, {signal: lifecycleController.signal});
        if (typeof ResizeObserver !== 'undefined') {
            const groupResizeObserver = new ResizeObserver(layoutButtonGroup);
            groupResizeObserver.observe(answerBox);
            if (answerBox.parentElement) groupResizeObserver.observe(answerBox.parentElement);
            lifecycleController.signal.addEventListener('abort', () => groupResizeObserver.disconnect(), {once: true});
        }
        if (config.enablemobile) {
            buttonGroup.insertAdjacentElement('afterend', mobilePanel);
            mobilePanel.insertAdjacentElement('afterend', handwritingPanel);
        } else {
            buttonGroup.insertAdjacentElement('afterend', handwritingPanel);
        }
        handwritingPanel.insertAdjacentElement('afterend', resultPanel);

        const cleanupObserver = new MutationObserver(() => {
            if (answerBox.isConnected) return;
            requestCoordinator.invalidate();
            lifecycleController.abort();
            if (mobilePollTimer) window.clearInterval(mobilePollTimer);
            if (resultPanel._selectionAbortController) resultPanel._selectionAbortController.abort();
            (resultPanel._interactiveControllers || []).forEach(controller => controller.abort());
            if (resultPanel._reviewResizeObserver) resultPanel._reviewResizeObserver.disconnect();
            if (resultPanel._sourceObjectUrl) URL.revokeObjectURL(resultPanel._sourceObjectUrl);
            fileInput.remove();
            if (cameraInput) cameraInput.remove();
            cleanupObserver.disconnect();
        });
        cleanupObserver.observe(document.body, {childList: true, subtree: true});
    };

    const randomUuid = () => {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
    };

    const research = createResearchLogger({
        pageId: randomUuid(),
        uuid: randomUuid,
        now: () => Date.now(),
        getConfig: () => config,
        storage: {
            getItem: key => window.sessionStorage.getItem(key),
            setItem: (key, value) => window.sessionStorage.setItem(key, value)
        },
        setTimeout: (fn, ms) => window.setTimeout(fn, ms),
        clearTimeout: timer => window.clearTimeout(timer),
        warn: error => window.console.warn('[hand2stack] research logging failed:', error),
        describeBox: box => ({
            inputType: String((box && box.dataset.stackInputType) || ''),
            hasSavedAnswer: Boolean(String((box && box._hand2stackInitialValue) || '').trim()),
            hasProcessInput: Boolean(findProcessInput(box)),
            device: {
                mobileOrTablet: isMobileOrTablet,
                ipadWebKit: isIPadWebKit,
                viewportWidth: window.innerWidth
            }
        }),
        send: (batch, unloading) => {
            const formData = new FormData();
            formData.append('sesskey', config.sesskey);
            formData.append('events', JSON.stringify(batch));
            if (unloading && navigator.sendBeacon && navigator.sendBeacon(config.eventUrl, formData)) {
                return null;
            }
            return fetch(config.eventUrl, {
                method: 'POST',
                body: formData,
                credentials: 'same-origin',
                keepalive: unloading
            }).then(response => {
                if (response.status >= 500) throw new Error('HTTP ' + response.status);
                return response.json().catch(() => null);
            });
        }
    });

    // Every STACK input of the answer box's question, by input name.
    const questionAnswers = box => {
        const question = box && box.closest('.que');
        const answers = {};
        if (!question) return answers;
        findStackInputs().filter(input => question.contains(input)).forEach(input => {
            answers[processInputName(input)] = research.clip(input.value, isFreeTextInput(input) ? 8000 : 4000);
        });
        return answers;
    };

    // Moodle's question state classes (question_state::get_state_class).
    const questionState = question => {
        const states = [
            'correct', 'partiallycorrect', 'incorrect', 'notyetanswered', 'answersaved', 'invalidanswer',
            'complete', 'incomplete', 'notanswered', 'requiresgrading'
        ];
        return states.find(state => question.classList.contains(state)) || 'unknown';
    };

    // A question's own Check button is named "q<usage>:<slot>_-submit"; it
    // submits the whole form but only grades that question.
    const classifySubmitter = name => {
        const check = /^q(\d+):(\d+)_-submit$/.exec(name);
        if (check) return {kind: 'check', key: check[1] + ':' + check[2]};
        if (name === 'next') return {kind: 'next', key: null};
        if (name === 'previous') return {kind: 'previous', key: null};
        if (name === 'save') return {kind: 'save', key: null};
        if (/finish/i.test(name)) return {kind: 'finish', key: null};
        return {kind: 'other', key: null};
    };

    const researchBoxes = [];

    // STACK's own validation is rendered into "<input name>_val", both by its
    // instant-validation AJAX and on the page after a submit.
    const observeStackValidation = box => {
        const element = document.getElementById(box.name + '_val');
        if (!element) return null;
        // MathJax typesets the validation after STACK renders it, so the
        // text changes without a new validation. Key on the validated value
        // and outcome instead; only an error's own text is kept as message.
        const flatten = node => String((node && node.textContent) || '').replace(/\s+/g, ' ').trim();
        // STACK renders the value it validated as a hidden "<name>_val" input
        // inside the validation; the box may already hold later keystrokes.
        const read = () => {
            const error = element.querySelector('.stackinputerror');
            const validated = element.querySelector('input[type="hidden"][name$="_val"]');
            return {
                shown: Boolean(flatten(element)),
                expression: validated ? String(validated.value) : box.value,
                valid: !error,
                message: error ? research.clip(flatten(error), 1000) : ''
            };
        };
        const keyFor = result => result.expression + '\u0000' + result.valid;
        let last = read().shown ? keyFor(read()) : '';
        let timer = null;
        const report = (source, force = false) => {
            const result = read();
            if (!result.shown) return;
            const key = keyFor(result);
            if (!force && key === last) return;
            last = key;
            research.log(box, 'validation_completed', {
                source,
                expression: research.clip(result.expression),
                typed: result.expression === box.value ? null : research.clip(box.value),
                valid: result.valid,
                errorCode: null,
                message: result.message,
                latencyMs: null
            });
        };
        new MutationObserver(() => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => report('stack_instant'), 300);
        }).observe(element, {childList: true, subtree: true, characterData: true});
        return {reportNow: () => report('stack_page', true)};
    };

    const bindResearchAnswerBox = box => {
        if (box.dataset.hand2stackResearchBound === '1') return;
        box.dataset.hand2stackResearchBound = '1';
        box._hand2stackInitialValue = box.value;
        researchBoxes.push(box);
        const tracker = research.editTracker(box, () => box.value, () => ({target: 'answer'}), {
            max: isFreeTextInput(box) ? 8000 : 4000,
            logOptions: () => ({modality: 'keyboard'})
        });
        // Hand2STACK's own writes are untrusted events and move the baseline.
        box.addEventListener('input', event => (event.isTrusted ? tracker.input() : tracker.rebase()));
        box.addEventListener('change', event => {
            if (!event.isTrusted) tracker.rebase();
        });
        box.addEventListener('blur', () => tracker.commit('blur'));
        box._hand2stackValidation = observeStackValidation(box);
    };

    const startResearch = boxes => {
        if (!research.enabled()) return;
        boxes.forEach(bindResearchAnswerBox);

        // One representative box per question carries question-level events.
        const questions = new Map();
        researchBoxes.forEach(box => {
            const parsed = parseStackInputName(box.name);
            const key = parsed ? parsed.usage + ':' + parsed.slot : '';
            if (key && !questions.has(key)) questions.set(key, box);
        });

        questions.forEach(box => {
            const question = box.closest('.que');
            if (!question || !research.pendingSubmit(box)) return;
            const feedback = question.querySelector('.outcome, .stackprtfeedback');
            const grade = question.querySelector('.grade');
            research.log(box, 'feedback_observed', {
                state: questionState(question),
                queClasses: Array.from(question.classList),
                hasPrtFeedback: Boolean(question.querySelector('.stackprtfeedback')),
                feedbackText: research.clip(feedback ? feedback.textContent.replace(/\s+/g, ' ').trim() : '', 1000),
                gradeText: grade ? grade.textContent.replace(/\s+/g, ' ').trim() : '',
                answers: questionAnswers(box)
            }, {input: null, modality: null});
            researchBoxes.filter(other => question.contains(other) && other._hand2stackValidation)
                .forEach(other => other._hand2stackValidation.reportNow());
        });

        const forms = new Set(researchBoxes.map(box => box.form).filter(Boolean));
        forms.forEach(form => form.addEventListener('submit', event => {
            const submitter = event.submitter ? String(event.submitter.name || '') : '';
            const classified = classifySubmitter(submitter);
            questions.forEach((box, key) => {
                if (box.form !== form || (classified.key && classified.key !== key)) return;
                research.log(box, 'submit_triggered', {
                    submitter,
                    submitterKind: classified.kind,
                    answers: questionAnswers(box)
                }, {input: null, modality: null});
            });
            research.flush(true);
        }));

        window.addEventListener('pagehide', () => {
            research.commitEdits('flush');
            research.flush(true);
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') research.flush(true);
        });
    };

    const run = async () => {
        prepareProcessInputs();
        const mainContent = document.querySelector('.main-inner');
        if (mainContent && (document.body.id === 'page-mod-quiz-attempt'
                || document.body.id === 'page-question-preview')) {
            mainContent.style.maxWidth = '1200px';
        }
        const boxes = findAnswerBoxes();
        if (!boxes.length) {
            window.console.warn(config.nofieldfound || 'No visible STACK input found');
            return;
        }
        // One capture interaction per question: anchored inputs next to a
        // free-text box are filled from that box's working, not captured alone.
        boxes.forEach(captureAnswerAnchor);
        boxes.forEach(bindFreeTextProcess);
        const candidates = new Set();
        boxes.filter(isFreeTextInput).forEach(source => {
            findSiblingAnswerBoxes(source).forEach(box => candidates.add(box));
        });
        boxes.filter(box => !candidates.has(box)).forEach(attachButton);
        await fetchMissingAnchors(Array.from(candidates));
        candidates.forEach(box => (box.dataset.hand2stackAnchor ? setupTargetBox(box) : attachButton(box)));
        startResearch(boxes);
    };

    const init = suppliedConfig => {
        config = Object.assign({}, defaultConfig, suppliedConfig || {});
        config.recognizeUrl = replaceLegacyNodeUrl(config.recognizeUrl || config.apiurl, pluginUrl('recognize.php'));
        config.strokesUrl = replaceLegacyNodeUrl(config.strokesUrl, pluginUrl('strokes.php'));
        config.convertUrl = replaceLegacyNodeUrl(config.convertUrl, pluginUrl('convert.php'));
        config.anchorsUrl = config.anchorsUrl || pluginUrl('anchors.php');
        config.eventUrl = config.eventUrl || pluginUrl('event.php');
        config.sessionCreateUrl = replaceLegacyNodeUrl(config.sessionCreateUrl, pluginUrl('session_create.php'));
        config.sessionResultUrl = replaceLegacyNodeUrl(
            config.sessionResultUrl || config.sessionResultBaseUrl,
            pluginUrl('session_result.php')
        );
        config.sesskey = config.sesskey || (window.M && M.cfg && M.cfg.sesskey) || '';
        run();
    };

    return {init};
});
