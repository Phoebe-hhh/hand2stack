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
    //
    // Delivery: every event goes into `env.outbox` (IndexedDB) the moment it
    // is made and leaves it only when event.php lists its id as stored. A
    // failed send, a reload or a closed tab leaves it pending, and the next
    // page sends it again under the same eventid, which the server stores
    // once. A beacon is only an attempt and confirms nothing. An event that
    // the server rejects, never names, or that cannot be sent within a week
    // stays in the outbox as a dead letter, and a delivery_failed event tells
    // the server which one it was, so a gap is never silent.
    const createResearchLogger = env => {
        const SCHEMA = 1;
        const FLUSH_MS = 5000;
        const FLUSH_SIZE = 20;
        const EDIT_IDLE_MS = 1000;
        const MAX_QUEUE = 500;
        const RETRY_MAX_MS = 5 * 60 * 1000;
        // A send the server answered without naming an event is retried this
        // often before the event becomes a dead letter, "unresolved".
        const MAX_UNANSWERED = 5;
        // Events still unsent after this become dead letters, "expired".
        const OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
        // Dead letters whose delivery_failed reached the server, and drafts
        // of edits nobody came back to, are removed after these.
        const DEAD_LETTER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
        const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
        const BEACON_BYTES = 60000;
        const FEEDBACK_WINDOW_MS = 5 * 60 * 1000;
        // Learner actions that, after feedback, begin a revision.
        const REVISION_TRIGGERS = ['recognition_started', 'candidate_selected'];
        // Submits after which the next page shows this question's feedback.
        // Next/Previous/Save only store the response.
        const FEEDBACK_SUBMITS = ['check', 'finish'];
        // Actions that end any edit still in progress before they are logged.
        const EDIT_BOUNDARIES = {recognition_started: 'flush', submit_triggered: 'submit'};
        // Events that carry the question's active time so far.
        const ACTIVE_TIME_EVENTS = ['submit_triggered', 'task_finished'];
        // Learner actions that make their question the one being worked on.
        const ACTIVATING_EVENTS = ['recognition_started', 'candidate_selected', 'answer_inserted', 'edit_committed'];
        const QUESTION_LEVEL = {input: null, modality: null};
        const queue = [];
        const segments = new Map();
        const memory = new Map();
        const trackers = new Set();
        const resolved = () => Promise.resolve();
        const noOutbox = {
            put: resolved, mark: resolved, remove: resolved, load: () => Promise.resolve([]), clear: resolved,
            spill: () => {}, putDraft: resolved, spillDraft: () => {}, getDraft: () => Promise.resolve(null),
            removeDraft: resolved, pruneDrafts: () => Promise.resolve(0)
        };
        // env.outbox may be a function: the page's server config, which names
        // the outbox, arrives after this module loads. Nothing touches the
        // outbox before logging is enabled.
        let resolvedOutbox = null;
        const outbox = {};
        Object.keys(noOutbox).forEach(name => {
            outbox[name] = (...args) => {
                if (!resolvedOutbox) {
                    resolvedOutbox = (typeof env.outbox === 'function' ? env.outbox() : env.outbox) || noOutbox;
                }
                return resolvedOutbox[name](...args);
            };
        });
        // eventid of every event in `queue` or being sent; the outbox may hold
        // the same events and must not add them twice.
        const known = new Set();
        const inflight = new Map();
        // eventids the outbox has finished storing, and the promise of each
        // write still under way (a draft is removed only after its edit is in).
        const persisted = new Set();
        const persisting = new Map();
        // Per pending event: attempts, firstAttemptAt, lastAttemptAt,
        // lastError, unanswered. Mirrored into its outbox row.
        const delivery = new Map();
        // burstId of every edit_committed waiting in the outbox.
        const burstsInOutbox = new Set();
        const stats = {
            stored: 0, rejected: 0, unresolved: 0, expired: 0, restored: 0, recovered: 0, overflow: 0, failedSends: 0
        };
        let failures = 0;
        let flushTimer = null;
        let disabled = false;
        // Set by a flush for a page that may be going: an event made after it
        // is spilled at once, as nothing else will save it in time.
        let unloadingPage = false;
        // Whether the page counts as being worked on: visible, focused and
        // not left. Set by the page through pause() and resume().
        let pageActive = true;
        // The one question whose time runs while the page is active. Two
        // questions on a page never share a second.
        let activeQuestionKey = null;

        const enabled = () => {
            const config = env.getConfig();
            return !disabled && Boolean(config.research && config.research.enabled && config.eventUrl);
        };

        const clip = (value, max = 4000) => {
            const text = value === null || value === undefined ? '' : String(value);
            return text.length > max ? text.slice(0, max) + '…[truncated]' : text;
        };
        const length = value => (value === null || value === undefined ? 0 : String(value).length);

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
            return {state: {
                id: env.uuid(), seq: 0, pendingSubmit: null, feedback: null,
                taskStarted: false, taskFinished: false
            }, resumed: false};
        };

        // Active time: the current question collects the time the page is
        // active, into its trace so it adds up across pages. A finished task
        // collects no more; a revisit is not more work on it.
        const bank = (state, segment) => {
            if (segment.activeFrom === null) return 0;
            const now = env.now();
            const ms = Math.max(0, now - segment.activeFrom);
            segment.activeFrom = now;
            if (!state.taskFinished) state.activeMs = (state.activeMs || 0) + ms;
            return ms;
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

        // Problems after the fact are reported, never thrown into a send.
        const warnLater = error => {
            try {
                env.warn(error);
            } catch (ignored) {
                // Nothing to do.
            }
        };
        const report = (what, count) => {
            if (count > 0) warnLater(new Error(count + ' research event(s) ' + what));
        };

        // Stop tracking events in this page (they left the queue for good).
        const forget = events => events.forEach(event => {
            known.delete(event.eventid);
            persisted.delete(event.eventid);
            delivery.delete(event.eventid);
        });

        const infoOf = event => {
            if (!delivery.has(event.eventid)) {
                delivery.set(event.eventid, {
                    attempts: 0, firstAttemptAt: null, lastAttemptAt: null, lastError: null, unanswered: 0
                });
            }
            return delivery.get(event.eventid);
        };
        const rowUpdate = event => {
            const info = infoOf(event);
            return {
                eventid: event.eventid, attempts: info.attempts, firstAttemptAt: info.firstAttemptAt,
                lastAttemptAt: info.lastAttemptAt, lastError: info.lastError, unanswered: info.unanswered
            };
        };

        // Back in the queue, ahead of newer events. What does not fit stays in
        // the outbox only and comes back with the next restore().
        const requeue = batch => {
            if (disabled) return;
            const room = Math.max(0, MAX_QUEUE - queue.length);
            queue.unshift(...batch.slice(0, room));
            batch.slice(room).forEach(event => known.delete(event.eventid));
            stats.overflow += Math.max(0, batch.length - room);
            report('did not fit the send queue and wait in the browser outbox', Math.max(0, batch.length - room));
        };

        const stop = () => {
            disabled = true;
            queue.length = 0;
            known.clear();
            inflight.clear();
            outbox.clear().catch(warnLater);
        };

        // An event the server will not have: kept as a dead letter, and
        // reported with a delivery_failed that carries no learner data. A
        // delivery_failed that fails itself is only kept, never reported.
        const deadLetter = (event, reason, row) => {
            const info = row || rowUpdate(event);
            const notice = event.type === 'delivery_failed' ? null : {
                eventid: env.uuid(),
                traceid: event.traceid,
                pageid: env.pageId,
                // Outside the trace's sequence, which stays as the learner made it.
                eventseq: 0,
                type: 'delivery_failed',
                clienttime: env.now(),
                elapsedms: null,
                usage: event.usage,
                slot: event.slot,
                input: null,
                modality: null,
                schema: SCHEMA,
                payload: {
                    originalEventId: event.eventid,
                    originalTraceId: event.traceid,
                    originalEventSeq: event.eventseq,
                    originalType: event.type,
                    originalClientTime: event.clienttime,
                    reason,
                    attempts: info.attempts || 0,
                    firstAttemptAt: info.firstAttemptAt || null,
                    lastAttemptAt: info.lastAttemptAt || null,
                    lastError: info.lastError || null
                }
            };
            stats[reason]++;
            forget([event]);
            outbox.mark([Object.assign({}, info, {
                eventid: event.eventid, status: reason, failureReason: reason, deadAt: env.now(),
                noticeId: notice ? notice.eventid : null
            })]).catch(warnLater);
            if (notice) enqueue(notice);
        };

        const delivered = (batch, result) => {
            batch.forEach(event => inflight.delete(event.eventid));
            if (result && result.disabled) {
                stop();
                return;
            }
            if (result && result.beacon) {
                // Possibly delivered: the outbox keeps the events, and a later
                // restore() sends them again for the server to confirm.
                batch.forEach(event => known.delete(event.eventid));
                outbox.mark(batch.map(rowUpdate)).catch(warnLater);
                return;
            }
            if (!result || result.success !== true || !Array.isArray(result.acknowledgedIds)
                    || !Array.isArray(result.rejectedIds)) {
                throw new Error('event.php did not confirm the batch');
            }
            failures = 0;
            const acknowledged = new Set(result.acknowledgedIds.map(String));
            const rejected = new Set(result.rejectedIds.map(String));
            const stored = [];
            const again = [];
            let dead = 0;
            batch.forEach(event => {
                if (acknowledged.has(event.eventid)) {
                    stats.stored++;
                    stored.push(event);
                } else if (rejected.has(event.eventid)) {
                    dead++;
                    deadLetter(event, 'rejected');
                } else if (++infoOf(event).unanswered >= MAX_UNANSWERED) {
                    dead++;
                    deadLetter(event, 'unresolved');
                } else {
                    infoOf(event).lastError = 'not named in the response';
                    again.push(event);
                }
            });
            if (stored.length) {
                stored.forEach(event => {
                    if (event.payload && event.payload.burstId) burstsInOutbox.delete(event.payload.burstId);
                });
                forget(stored);
                outbox.remove(stored.map(event => event.eventid)).catch(warnLater);
            }
            report('were not stored and are kept as dead letters in this browser', dead);
            if (again.length) {
                outbox.mark(again.map(rowUpdate)).catch(warnLater);
                requeue(again);
            }
            // Retries, and the delivery_failed of any dead letter.
            schedule();
        };

        const failed = (batch, error) => {
            batch.forEach(event => {
                inflight.delete(event.eventid);
                infoOf(event).lastError = String((error && error.message) || error || 'send failed').slice(0, 300);
            });
            stats.failedSends++;
            failures++;
            outbox.mark(batch.map(rowUpdate)).catch(warnLater);
            requeue(batch);
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
            if (unloading) {
                // The outbox writes asynchronously and may not finish once the
                // page goes; hand what it has not stored yet to sync storage.
                unloadingPage = true;
                const unsaved = queue.concat(Array.from(inflight.values()))
                    .filter(event => !persisted.has(event.eventid));
                if (unsaved.length) outbox.spill(unsaved);
            }
            while (queue.length) {
                const batch = takeBatch(unloading ? BEACON_BYTES : 500000);
                const now = env.now();
                batch.forEach(event => {
                    inflight.set(event.eventid, event);
                    const info = infoOf(event);
                    info.attempts++;
                    info.firstAttemptAt = info.firstAttemptAt || now;
                    info.lastAttemptAt = now;
                });
                Promise.resolve()
                    .then(() => env.send(batch, unloading))
                    .then(result => delivered(batch, result))
                    .catch(error => failed(batch, error));
            }
        };

        const schedule = () => {
            if (!queue.length || flushTimer) return;
            if (failures) {
                // Back off while the server cannot be reached.
                const wait = Math.min(RETRY_MAX_MS, FLUSH_MS * Math.pow(2, failures - 1));
                flushTimer = env.setTimeout(() => {
                    flushTimer = null;
                    flush(false);
                }, wait);
            } else if (queue.length >= FLUSH_SIZE) {
                flush(false);
            } else {
                flushTimer = env.setTimeout(() => {
                    flushTimer = null;
                    flush(false);
                }, FLUSH_MS);
            }
        };

        const enqueue = event => {
            queue.push(event);
            known.add(event.eventid);
            if (event.payload && event.payload.burstId) burstsInOutbox.add(event.payload.burstId);
            if (unloadingPage) outbox.spill([event]);
            const write = outbox.put([event]).then(() => {
                if (known.has(event.eventid)) persisted.add(event.eventid);
            });
            persisting.set(event.eventid, write);
            write.then(() => persisting.delete(event.eventid), error => {
                persisting.delete(event.eventid);
                warnLater(error);
            });
        };

        // Resolves once the outbox holds the event, rejects if it could not
        // store it. An event no longer tracked was stored or dead-lettered.
        const whenStored = event => {
            if (!event) return Promise.reject(new Error('no event'));
            if (persisting.has(event.eventid)) return persisting.get(event.eventid);
            return persisted.has(event.eventid) || !known.has(event.eventid)
                ? Promise.resolve()
                : Promise.reject(new Error('the outbox did not store the event'));
        };

        // burstIds of edits the outbox already holds, read once per page.
        let scan = null;
        const scanned = () => scan || (scan = outbox.load().then(rows => rows.forEach(row => {
            const payload = row && row.event && row.event.payload;
            if (payload && payload.burstId) burstsInOutbox.add(payload.burstId);
        })).catch(() => undefined));

        // Take back what an earlier page (or this one, after a beacon) left
        // in the outbox: pending events are sent now, those too old become
        // dead letters, and dead letters not yet reported are reported.
        const restore = () => {
            // Back on the page (or a new one): nothing to spill.
            unloadingPage = false;
            return load();
        };
        const load = () => outbox.load().then(rows => {
            if (!enabled()) return;
            const now = env.now();
            const oldDead = [];
            let expired = 0;
            rows.forEach(row => {
                const event = row && row.event;
                if (!event || typeof event.eventid !== 'string' || known.has(event.eventid)) return;
                if (event.payload && event.payload.burstId) burstsInOutbox.add(event.payload.burstId);
                if (row.status && row.status !== 'pending') {
                    if (now - Number(row.deadAt) > DEAD_LETTER_TTL_MS) {
                        oldDead.push(event.eventid);
                    } else if (!row.noticeId && event.type !== 'delivery_failed') {
                        deadLetter(event, row.status, row);
                    }
                    return;
                }
                delivery.set(event.eventid, {
                    attempts: Number(row.attempts) || 0, firstAttemptAt: row.firstAttemptAt || null,
                    lastAttemptAt: row.lastAttemptAt || null, lastError: row.lastError || null,
                    unanswered: Number(row.unanswered) || 0
                });
                if (now - Number(event.clienttime) > OUTBOX_TTL_MS) {
                    expired++;
                    deadLetter(event, 'expired', row);
                    return;
                }
                queue.push(event);
                known.add(event.eventid);
                persisted.add(event.eventid);
                stats.restored++;
            });
            if (oldDead.length) outbox.remove(oldDead).catch(warnLater);
            report('could not be sent within a week and are kept as dead letters in this browser', expired);
            outbox.pruneDrafts(now - DRAFT_TTL_MS).catch(warnLater);
            // A server that came back gets the queue at once.
            failures = 0;
            if (queue.length) flush(false);
        });

        // `type` may be null to only mark learner activity: that starts the
        // page segment and, after feedback, the revision.
        const record = (box, type, payload, options = {}) => {
            const ctx = contextFor(box, options);
            if (!ctx) return;
            // A learner action makes its question the current one first, so
            // the switch is logged before the action. This records events
            // itself, so it must come before this trace is read.
            if (!options.passive && (type === null || ACTIVATING_EVENTS.includes(type))) {
                activate(box, options.activity || type);
            }
            const {state, resumed} = loadTrace(ctx.key);
            const push = (eventType, eventPayload) => {
                const now = env.now();
                state.seq += 1;
                const event = {
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
                };
                enqueue(event);
                return event;
            };
            // These are trace-level lifecycle events. Page reloads after Check
            // must not turn them into page-view counters.
            if ((type === 'task_started' && state.taskStarted)
                    || (type === 'task_finished' && state.taskFinished)) {
                return;
            }
            let segment = segments.get(ctx.key);
            if (!segment) {
                const now = env.now();
                segment = {startedAt: now, box, activeFrom: null, pausedAt: now};
                segments.set(ctx.key, segment);
                // After task_finished the learner is looking at the question
                // again, not working on the task.
                push('interaction_started', Object.assign({
                    resumed, entry: ctx.modality, revisit: Boolean(state.taskFinished),
                    activeMsBefore: state.activeMs || 0, pageActive
                }, env.describeBox(box)));
            }
            if (type === 'activity_paused') {
                if (segment.activeFrom === null) return;
                const ms = bank(state, segment);
                segment.activeFrom = null;
                segment.pausedAt = env.now();
                payload = Object.assign({}, payload, {
                    activeMs: ms, totalActiveMs: state.activeMs || 0, taskFinished: Boolean(state.taskFinished)
                });
            } else if (type === 'activity_resumed') {
                if (segment.activeFrom !== null) return;
                const now = env.now();
                segment.activeFrom = now;
                payload = Object.assign({}, payload, {
                    pausedMs: segment.pausedAt === null ? null : Math.max(0, now - segment.pausedAt),
                    totalActiveMs: state.activeMs || 0, taskFinished: Boolean(state.taskFinished)
                });
                segment.pausedAt = null;
            } else if (ACTIVE_TIME_EVENTS.includes(type)) {
                bank(state, segment);
                payload = Object.assign({}, payload, {activeTimeMs: state.activeMs || 0});
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
            const event = type ? push(type, payload || {}) : null;
            if (type === 'task_started') state.taskStarted = true;
            if (type === 'task_finished') {
                state.taskFinished = true;
                // Its time is final; the question stops being current.
                segment.activeFrom = null;
                segment.pausedAt = env.now();
                if (activeQuestionKey === ctx.key) activeQuestionKey = null;
            }
            if (type === 'submit_triggered') {
                state.pendingSubmit = payload && FEEDBACK_SUBMITS.includes(payload.submitterKind)
                    ? {
                        answers: payload.answers || {},
                        at: env.now(),
                        eventid: event ? event.eventid : null,
                        kind: payload.submitterKind,
                        pageid: env.pageId
                    }
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
            return event;
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

        // Pause or resume one question's clock; a finished one has none.
        const pauseQuestion = (key, reason) => {
            const segment = segments.get(key);
            if (segment && segment.activeFrom !== null) {
                record(segment.box, 'activity_paused', {reason}, QUESTION_LEVEL);
            }
        };
        const resumeQuestion = (key, reason) => {
            const segment = segments.get(key);
            if (segment && segment.activeFrom === null && !loadTrace(key).state.taskFinished) {
                record(segment.box, 'activity_resumed', {reason}, QUESTION_LEVEL);
            }
        };

        // `box`'s question becomes the one being worked on: the page calls it
        // for a question alone on its page, and on focus, a pointer or a key
        // inside a question; learner actions call it themselves. The previous
        // question pauses and this one resumes, both for "question_switch".
        function activate(box, reason) {
            const ctx = contextFor(box, {});
            if (!ctx) return;
            if (!segments.has(ctx.key)) {
                // Starts the segment (and interaction_started) without a clock.
                record(box, null, null, Object.assign({passive: true}, QUESTION_LEVEL));
            }
            const switching = activeQuestionKey !== null && activeQuestionKey !== ctx.key;
            if (switching) pauseQuestion(activeQuestionKey, 'question_switch');
            activeQuestionKey = ctx.key;
            if (pageActive) resumeQuestion(ctx.key, switching ? 'question_switch' : reason);
        }

        // The page stops or starts counting as worked on (hidden, blurred,
        // left; visible and focused again): only the current question's clock.
        const setActive = (active, reason) => {
            if (pageActive === active) return;
            pageActive = active;
            if (activeQuestionKey === null) return;
            if (active) {
                resumeQuestion(activeQuestionKey, reason);
            } else {
                pauseQuestion(activeQuestionKey, reason);
            }
        };
        const pause = guard(reason => setActive(false, reason));
        const resume = guard(reason => setActive(true, reason));

        const editPayload = (described, trigger, before, after, max, extra) => Object.assign({}, described, {
            trigger,
            before: clip(before, max),
            after: clip(after, max),
            beforeLength: length(before),
            afterLength: length(after),
            truncated: length(before) > max || length(after) > max
        }, extra);

        // One edit burst becomes one edit_committed with the value before the
        // first keystroke and after the last; keystrokes are never logged.
        // `rebase` adopts a value Hand2STACK itself wrote as the new baseline.
        //
        // While it is typed, the burst is a draft in the outbox (IndexedDB),
        // keyed by attempt, question, input and target, so a page closed or
        // killed mid-edit still has it logged, as trigger "recovered", the
        // next time this target is shown. The draft goes only once its
        // edit_committed is in the outbox, never before. Every edit carries
        // its burstId, so one edit is never logged twice.
        const editTracker = (box, getValue, describe, options = {}) => {
            const max = options.max || 4000;
            const logOptions = () => (options.logOptions ? options.logOptions() : {});
            let baseline = getValue();
            let burst = null;
            let timer = null;
            const described = describe() || {};
            const ctx = contextFor(box, {});
            const draftKey = ctx
                ? [ctx.usage, ctx.slot, box.name, described.target, described.lineIndex === undefined ? '' : described.lineIndex]
                    .join(':')
                : null;
            const draftOf = current => {
                const opts = logOptions();
                return {
                    traceid: ctx ? loadTrace(ctx.key).state.id : null,
                    usage: ctx && ctx.usage, slot: ctx && ctx.slot, input: ctx && ctx.input,
                    target: described.target, lineIndex: described.lineIndex === undefined ? null : described.lineIndex,
                    before: current.before, after: current.after, startedAt: current.startedAt,
                    lastInputAt: current.lastInputAt, inputEvents: current.count, burstId: current.burstId,
                    modality: 'modality' in opts ? opts.modality : ((box && box._hand2stackModality) || null),
                    described: describe()
                };
            };
            const dropDraft = burstId => {
                if (draftKey) outbox.removeDraft(draftKey, burstId).catch(warnLater);
            };
            const tracker = {
                input: guard(() => {
                    if (!burst) {
                        burst = {before: baseline, startedAt: env.now(), count: 0, burstId: env.uuid()};
                        record(box, null, null, Object.assign({}, logOptions(), {activity: 'edit_committed'}));
                    }
                    burst.count++;
                    burst.after = getValue();
                    burst.lastInputAt = env.now();
                    if (draftKey) outbox.putDraft(draftKey, draftOf(burst)).catch(warnLater);
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
                    current.after = after;
                    // The page may be going: the draft is first made safe
                    // synchronously, then logged.
                    if (draftKey && (trigger === 'hidden' || trigger === 'flush' || trigger === 'submit')) {
                        outbox.spillDraft(draftKey, draftOf(current));
                    }
                    if (after === current.before) {
                        dropDraft(current.burstId);
                        return;
                    }
                    const event = record(box, 'edit_committed', editPayload(describe(), trigger, current.before, after, max, {
                        burstMs: Math.max(0, env.now() - current.startedAt),
                        inputEvents: current.count,
                        burstId: current.burstId
                    }), logOptions());
                    whenStored(event).then(() => dropDraft(current.burstId), warnLater);
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
            // An earlier page ended while this target was being typed. The
            // draft is read before any keystroke here can replace it.
            if (draftKey && enabled()) {
                const draftRead = outbox.getDraft(draftKey);
                Promise.all([draftRead, scanned()]).then(([draft]) => guard(() => {
                    if (!draft || (burst && burst.burstId === draft.burstId)) return;
                    if (typeof draft.before !== 'string' || typeof draft.after !== 'string'
                            || draft.before === draft.after || burstsInOutbox.has(draft.burstId)) {
                        // Nothing to log, or its edit_committed is already in.
                        dropDraft(draft.burstId);
                        return;
                    }
                    const event = record(box, 'edit_committed', editPayload(draft.described || described, 'recovered',
                        draft.before, draft.after, max, {
                            burstMs: Math.max(0, Number(draft.lastInputAt) - Number(draft.startedAt)) || 0,
                            inputEvents: Number(draft.inputEvents) || 0,
                            lastInputAt: Number(draft.lastInputAt) || null,
                            burstId: draft.burstId,
                            // A closed tab starts a new trace; this is the one it was typed in.
                            typedInTrace: draft.traceid || null
                        }), {modality: draft.modality || null, passive: true});
                    stats.recovered++;
                    whenStored(event).then(() => dropDraft(draft.burstId), warnLater);
                })()).catch(warnLater);
            }
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
            pause,
            resume,
            activate: guard((box, reason) => activate(box, reason)),
            pendingSubmit,
            flush: guard(flush),
            restore: guard(() => restore().catch(warnLater)),
            stats: () => Object.assign({pending: known.size}, stats),
            whenStored,
            _queue: queue
        };
    };

    return {createResearchLogger};
});
