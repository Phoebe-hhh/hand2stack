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
 * Research events the page produces by itself: typing, STACK validation, submits and feedback.
 *
 * @module local_hand2stack/core/research_observer
 */
define(['local_hand2stack/core/stack_inputs', 'local_hand2stack/core/research'], function(StackInputs, Research) {
    const {findStackInputs, processInputName, isFreeTextInput, parseStackInputName} = StackInputs;
    const {research} = Research;

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

    // Inputs of the question whose value was too long for its snapshot, with
    // the full length, so a clipped answer is never read as complete.
    const truncatedAnswers = box => {
        const question = box && box.closest('.que');
        const truncated = {};
        if (!question) return truncated;
        findStackInputs().filter(input => question.contains(input)).forEach(input => {
            const max = isFreeTextInput(input) ? 8000 : 4000;
            if (input.value.length > max) truncated[processInputName(input)] = input.value.length;
        });
        return truncated;
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

    // Waits (at most a second) for traces kept in the outbox, so a question
    // whose sessionStorage was cleared goes on with the same trace.
    const startResearch = (boxes, mayStartTask = true) => {
        if (!research.enabled()) return;
        research.ready().then(() => beginResearch(boxes, mayStartTask)).catch(error => {
            window.console.warn('[hand2stack] research logging failed:', error);
        });
    };

    const beginResearch = (boxes, mayStartTask) => {
        // A page opened in a background tab is not being worked on: say so
        // before the first event, whose interaction_started records it.
        if (document.visibilityState !== 'visible') research.pause('hidden');
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
            if (!question) return;
            const pending = research.pendingSubmit(box);
            if (mayStartTask) {
                research.log(box, 'task_started', {
                    answers: questionAnswers(box),
                    truncatedAnswers: truncatedAnswers(box),
                    state: questionState(question)
                }, {input: null, modality: null});
            }
            if (!pending) return;
            const flatten = node => String((node && node.textContent) || '').replace(/\s+/g, ' ').trim();
            const outcome = question.querySelector('.outcome');
            const prtFeedback = Array.from(question.querySelectorAll('.stackprtfeedback')).map(node => ({
                text: research.clip(flatten(node), 1000),
                classes: Array.from(node.classList)
            })).filter(item => item.text);
            const grade = question.querySelector('.grade');
            research.log(box, 'submit_confirmed', {
                submissionEventId: pending.eventid || null,
                submitterKind: pending.kind || null,
                submittedAt: pending.at,
                roundTripMs: Math.max(0, Date.now() - pending.at),
                submittedAnswers: pending.answers || {},
                answers: questionAnswers(box),
                truncatedAnswers: truncatedAnswers(box)
            }, {input: null, modality: null});
            research.log(box, 'feedback_observed', {
                submissionEventId: pending.eventid || null,
                state: questionState(question),
                queClasses: Array.from(question.classList),
                hasPrtFeedback: prtFeedback.length > 0,
                feedbackText: research.clip(flatten(outcome), 1000),
                prtFeedback,
                gradeText: flatten(grade),
                answers: questionAnswers(box),
                truncatedAnswers: truncatedAnswers(box)
            }, {input: null, modality: null});
            if (pending.kind === 'finish' || ['correct', 'complete'].includes(questionState(question))) {
                research.log(box, 'task_finished', {
                    reason: pending.kind === 'finish' ? 'quiz_finished' : 'graded_complete',
                    submissionEventId: pending.eventid || null,
                    state: questionState(question),
                    answers: questionAnswers(box),
                    truncatedAnswers: truncatedAnswers(box)
                }, {input: null, modality: null});
            }
            researchBoxes.filter(other => question.contains(other) && other._hand2stackValidation)
                .forEach(other => other._hand2stackValidation.reportNow());
        });

        const forms = new Set(researchBoxes.map(box => box.form).filter(Boolean));
        forms.forEach(form => form.addEventListener('submit', event => {
            const submitter = event.submitter ? String(event.submitter.name || '') : '';
            const classified = classifySubmitter(submitter);
            questions.forEach((box, key) => {
                if (box.form !== form || (classified.key && classified.key !== key)) return;
                const answers = questionAnswers(box);
                const truncated = truncatedAnswers(box);
                const submitted = research.log(box, 'submit_triggered', {
                    submitter,
                    submitterKind: classified.kind,
                    answers,
                    truncatedAnswers: truncated
                }, {input: null, modality: null});
                // Moodle's Finish attempt normally goes to a summary page
                // with no question inputs, so record the learner's task-end
                // action here. A later confirmed completion is de-duplicated.
                if (classified.kind === 'finish') {
                    research.log(box, 'task_finished', {
                        reason: 'quiz_finish_triggered',
                        submissionEventId: submitted ? submitted.eventid : null,
                        state: questionState(box.closest('.que')),
                        answers,
                        truncatedAnswers: truncated
                    }, {input: null, modality: null});
                }
            });
            research.flush(true);
        }));

        // The question being worked on. Alone on its page it is current from
        // the start; with others, the one the learner focuses, points at or
        // types in (and any Hand2STACK action) becomes current. Being on
        // screen is not enough: several questions can be.
        const questionBoxes = new Map();
        questions.forEach(box => {
            const question = box.closest('.que');
            if (question) questionBoxes.set(question, box);
        });
        const activateFrom = event => {
            const question = event.target && event.target.closest ? event.target.closest('.que') : null;
            const box = question && questionBoxes.get(question);
            if (box) research.activate(box, event.type);
        };
        ['focusin', 'pointerdown', 'keydown'].forEach(type => document.addEventListener(type, activateFrom, true));

        // Active time (activity_paused / activity_resumed): the page counts
        // while it is visible and the window has focus. A file or camera
        // picker opened from the page, or focus moving into an iframe such as
        // STACK's preview, blurs the window but is still work on the task.
        let picking = false;
        document.addEventListener('click', event => {
            const target = event.target;
            if (target && target.tagName === 'INPUT' && target.type === 'file') picking = true;
        }, true);
        const pageActive = () => document.visibilityState === 'visible' && (picking || document.hasFocus()
            || Boolean(document.activeElement && document.activeElement.tagName === 'IFRAME'));
        // After pagehide the page is gone for the learner, even if a click or
        // focus still reaches it while the next page loads.
        let left = false;
        const resumeIfActive = reason => {
            if (!left && pageActive()) research.resume(reason);
        };
        window.addEventListener('blur', () => {
            // activeElement moves into an iframe only after the blur.
            window.setTimeout(() => {
                if (!pageActive()) research.pause('blur');
            }, 0);
        });
        window.addEventListener('focus', () => {
            picking = false;
            resumeIfActive('focus');
        });
        window.addEventListener('pagehide', () => {
            left = true;
            research.commitEdits('flush');
            research.pause('leave');
            research.flush(true);
        });
        window.addEventListener('pageshow', event => {
            if (!event.persisted) return;
            left = false;
            resumeIfActive('pageshow');
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                // A hidden tab may be closed or killed without a pagehide.
                research.commitEdits('hidden');
                // A phone or tablet hides the page while its camera app takes
                // the photo for the answer.
                if (!picking) research.pause('hidden');
                research.flush(true);
            } else {
                resumeIfActive('visible');
                research.restore();
            }
        });
        if (questionBoxes.size === 1) research.activate(questionBoxes.values().next().value, 'start');
        // Send what earlier pages, a lost connection or a beacon left unconfirmed.
        window.addEventListener('online', () => research.restore());
        research.restore();
    };

    return {startResearch};
});
