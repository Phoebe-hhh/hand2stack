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

/**
 * Filling the other answer boxes of a question from labelled results in the Free-text working.
 *
 * @module local_hand2stack/modes/freetext/anchors
 */
define([
    'local_hand2stack/config',
    'local_hand2stack/core/stack_inputs',
    'local_hand2stack/core/research',
    'local_hand2stack/core/api'
], function(
    Config, StackInputs, Research, Api
) {
    const {config} = Config;
    const {setBackgroundValue, isFreeTextInput, findSiblingAnswerBoxes} = StackInputs;
    const {research} = Research;
    const {postLatex} = Api;

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
        // A row keeps all of its formulas ("x>2, f(2)=3"); a label may start any one.
        const parts = (line && (line.display_parts || line.displayParts)) || [];
        parts.forEach(part => {
            if (part && part.type === 'math' && part.latex) texts.push(String(part.latex));
        });
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
        // After "f(2) =" a further "=" restates the value; after a prose
        // label ("Answer:" or "answer =") the value itself may be an equation
        // such as "x=3", so only the label is removed.
        const labelled = /[:：]\s*$/.test(head[0]) || isProseAnchor(anchor);
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
    // options (used when the learner edits the recognized working):
    //   convert      - converts a found value; ASCII working needs postAscii.
    //   via          - research label of the insertion.
    //   followEdits  - only update a box the learner has not typed in, and
    //                  only when its source value actually changed.
    const applyMatchedAnswers = async (sourceBox, lines, isCurrent = () => true, onTargetResult = null, options = null) => {
        if (!isFreeTextInput(sourceBox) || !Array.isArray(lines) || !lines.length) {
            return [];
        }
        const report = onTargetResult || (() => null);
        const settings = options || {};
        const convert = settings.convert || postLatex;
        const targets = findSiblingAnswerBoxes(sourceBox)
            .filter(box => box.dataset.hand2stackAnchor);
        const extracted = extractAnchoredAnswers(targets.map(box => box.dataset.hand2stackAnchor), lines);

        for (let index = 0; index < targets.length; index++) {
            if (!isCurrent()) return extracted;
            const box = targets[index];
            const result = extracted[index];
            const logOptions = {modality: sourceBox._hand2stackModality || null};
            if (settings.followEdits) {
                const previous = box._hand2stackExtraction;
                if (box.dataset.hand2stackStudentEdited === '1'
                        || (previous && previous.recognized === result.expr)) {
                    continue;
                }
            }
            const logAnchor = (status, value, previousValue) => research.log(box, 'answer_inserted', {
                via: settings.via || 'anchor_autofill',
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
            // A failed last-line guess clears the box, so an answer left from
            // an earlier attempt cannot be submitted against this working.
            // An answer the learner typed on this page is kept.
            const failConversion = previousValue => {
                const clear = result.fallback && box.value === previousValue && box.value !== ''
                    && box.dataset.hand2stackStudentEdited !== '1';
                if (clear) setBackgroundValue(box, '');
                report(box, Object.assign({status: 'convertfailed'}, result));
                logAnchor('convertfailed', clear ? '' : null, previousValue);
            };
            const valueBeforeValidation = box.value;
            const validationStartedAt = Date.now();
            try {
                const cleanStack = await convert(result.expr);
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
                    failConversion(valueBeforeValidation);
                } else if (box.value === valueBeforeValidation) {
                    const status = result.fallback ? 'fallback_last_line' : 'filled';
                    // Filled in the background: moving focus here would pull
                    // the learner away from what they are doing and, on a
                    // tablet, open the on-screen keyboard.
                    setBackgroundValue(box, cleanStack);
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
                    failConversion(valueBeforeValidation);
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
        } else if (result.fallback) {
            // Show what was read, so the learner sees why nothing was filled.
            setTargetStatus(box, 'warning', (config.fallbackconvertfailed
                || 'Could not read {$a->label} from the last line {$a->line}. Please enter it manually.')
                .replace('{$a->label}', label).replace('{$a->line}', result.expr));
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

    return {
        applyMatchedAnswers: (...args) => (config.autofill ? applyMatchedAnswers(...args) : Promise.resolve([])),
        reportTargetResult, setupTargetBox
    };
});
