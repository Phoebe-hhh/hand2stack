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
 * Research event traces, sequence numbers and the send queue, independent of the page.
 *
 * @module local_hand2stack/core/research_logger
 */
define(['local_hand2stack/core/stack_inputs'], function(StackInputs) {
    const {parseStackInputName} = StackInputs;

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

    return {createResearchLogger};
});
