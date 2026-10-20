// This file is part of Moodle - http://moodle.org/.
// SPDX-License-Identifier: GPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = require('./amd_source');

function extractFunctionSource(name) {
    const start = source.indexOf(`const ${name} = `);
    assert.ok(start >= 0, `${name} not found`);
    const braceStart = source.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1) + ';';
    }
    assert.fail(`could not extract ${name}`);
}

const createResearchLogger = (0, eval)(`(function() {
    ${extractFunctionSource('parseStackInputName')}
    ${extractFunctionSource('createResearchLogger')}
    return createResearchLogger;
})()`);

// A browser tab: sessionStorage survives "page loads", each of which builds
// a fresh logger, exactly like a quiz Check reloading the page. The outbox
// (IndexedDB in the browser) survives too, and `server` stands in for
// event.php with its unique eventid.
const createTab = (options = {}) => {
    const storage = new Map();
    // The outbox as IndexedDB keeps it: event rows with a status, drafts,
    // and the synchronous localStorage spill of each.
    const outboxRows = new Map();
    const drafts = new Map();
    const traces = new Map();
    const draftSpill = new Map();
    let spilled = [];
    const sent = [];
    const server = {stored: new Map(), online: true, reject: new Set(), beaconLost: false};
    let clock = 1791190800000;
    let uuidCounter = 0;
    let timers = [];
    const never = () => new Promise(() => {});
    const pendingRow = event => ({eventid: event.eventid, status: 'pending', event, attempts: 0});
    const newer = (a, b) => (!a ? b || null : (!b ? a : (b.lastInputAt > a.lastInputAt ? b : a)));
    const outbox = {
        put: events => {
            if (options.outboxHangs) return never();
            events.forEach(event => outboxRows.set(event.eventid, pendingRow(event)));
            return Promise.resolve();
        },
        mark: updates => {
            updates.forEach(update => {
                const row = outboxRows.get(update.eventid);
                if (row) Object.assign(row, update);
            });
            return Promise.resolve();
        },
        remove: ids => {
            ids.forEach(id => outboxRows.delete(id));
            spilled = spilled.filter(event => !ids.includes(event.eventid));
            return Promise.resolve();
        },
        load: () => {
            spilled.forEach(event => {
                if (!outboxRows.has(event.eventid)) outboxRows.set(event.eventid, pendingRow(event));
            });
            spilled = [];
            return Promise.resolve(Array.from(outboxRows.values()).map(row => Object.assign({}, row)));
        },
        clear: () => {
            outboxRows.clear();
            drafts.clear();
            draftSpill.clear();
            traces.clear();
            spilled = [];
            return Promise.resolve();
        },
        spill: events => {
            spilled = spilled.filter(event => !events.some(other => other.eventid === event.eventid)).concat(events);
        },
        putDraft: (key, draft) => {
            if (options.draftWritesHang) return never();
            drafts.set(key, Object.assign({}, draft, {key}));
            return Promise.resolve();
        },
        spillDraft: (key, draft) => {
            draftSpill.set(key, Object.assign({}, draft, {key}));
        },
        getDraft: key => Promise.resolve(newer(drafts.get(key) || null, draftSpill.get(key) || null)),
        removeDraft: (key, burstId) => {
            if (draftSpill.has(key) && draftSpill.get(key).burstId === burstId) draftSpill.delete(key);
            if (drafts.has(key) && drafts.get(key).burstId === burstId) drafts.delete(key);
            return Promise.resolve();
        },
        putTrace: (key, state) => {
            if (!options.traceWritesLost) traces.set(key, {key, state: JSON.parse(JSON.stringify(state)), updatedAt: clock});
            return Promise.resolve();
        },
        loadTraces: () => Promise.resolve(Array.from(traces.values()).map(row => ({key: row.key, state: row.state}))),
        pruneTraces: before => {
            traces.forEach((row, key) => {
                if (row.updatedAt < before) traces.delete(key);
            });
            return Promise.resolve();
        },
        pruneDrafts: before => {
            let count = 0;
            drafts.forEach((draft, key) => {
                if (!(draft.lastInputAt >= before)) {
                    drafts.delete(key);
                    count++;
                }
            });
            return Promise.resolve(count);
        }
    };
    const receive = batch => {
        const acknowledgedIds = [];
        const rejectedIds = [];
        batch.forEach(event => {
            if (server.reject.has(event.type)) {
                rejectedIds.push(event.eventid);
                return;
            }
            server.stored.set(event.eventid, (server.stored.get(event.eventid) || 0) + 1);
            acknowledgedIds.push(event.eventid);
        });
        return {success: true, accepted: acknowledgedIds.length, acknowledgedIds, rejectedIds};
    };
    const rows = status => Array.from(outboxRows.values()).filter(row => (status === 'dead'
        ? row.status !== 'pending' : row.status === status));
    const tab = {
        sent,
        server,
        outboxRows,
        drafts,
        draftSpill,
        traces,
        pending: () => rows('pending'),
        dead: () => rows('dead'),
        spilled: () => spilled,
        // Storage the browser wipes when the tab closes.
        closeSession: () => storage.clear(),
        advance: ms => {
            clock += ms;
            const due = timers.filter(timer => timer.at <= clock);
            timers = timers.filter(timer => timer.at > clock);
            due.forEach(timer => timer.fn());
        },
        // A closed tab: timers and pending sends are gone, storage is not.
        close: () => {
            timers = [];
        },
        load: () => createResearchLogger({
            pageId: `page-${++uuidCounter}`,
            uuid: () => `uuid-${++uuidCounter}`,
            now: () => clock,
            getConfig: () => ({eventUrl: '/event.php', research: {enabled: options.enabled !== false}}),
            storage: {
                getItem: key => storage.get(key) || null,
                setItem: (key, value) => storage.set(key, value),
                removeItem: key => storage.delete(key)
            },
            outbox: options.noOutbox ? null : outbox,
            setTimeout: (fn, ms) => {
                const timer = {fn, at: clock + ms};
                timers.push(timer);
                return timer;
            },
            clearTimeout: timer => {
                timers = timers.filter(other => other !== timer);
            },
            warn: error => {
                if (!/research event\(s\)/.test(error.message)) throw error;
                (tab.warnings = tab.warnings || []).push(error.message);
            },
            describeBox: () => ({inputType: 'algebraic'}),
            send: (batch, unloading) => {
                sent.push(...batch);
                if (options.response) {
                    return typeof options.response === 'function' ? options.response(batch) : options.response;
                }
                if (!server.online) return Promise.reject(new Error('offline'));
                if (unloading) {
                    if (!server.beaconLost) receive(batch);
                    return {beacon: true};
                }
                return receive(batch);
            }
        })
    };
    return tab;
};

const RETRY_CAP = 5 * 60 * 1000;
const answerBox = value => ({name: 'q43:4_ans1', value});
const settle = () => new Promise(resolve => setImmediate(resolve));
// The learner's own events, without the clock (activity_paused/resumed).
const actions = events => events.filter(event => !event.type.startsWith('activity_'));

test('the acceptance scenario can be rebuilt from the event trace alone', async () => {
    const tab = createTab();

    // Page 1: photo, OCR mistake, fix in the candidate line, insert, Check.
    let research = tab.load();
    let box = answerBox('');
    research.log(box, 'task_started', {answers: {ans1: '', process: ''}}, {input: null, modality: null});
    let line = {ascii: 'x^2+5x+8=0'};
    research.log(box, 'recognition_started', {requestId: 1, source: 'image'}, {modality: 'image'});
    research.log(box, 'recognition_completed', {ok: true, ocr: {rawAscii: 'x^2+5x+8=0'}}, {modality: 'image'});
    const lineEdits = research.editTracker(box, () => line.ascii, () => ({target: 'line', lineIndex: 0}),
        {logOptions: () => ({modality: 'image'})});
    ['x^2+5x+=0', 'x^2+5x+6=0'].forEach(value => {
        line.ascii = value;
        lineEdits.input();
    });
    lineEdits.commit('apply');
    research.log(box, 'validation_completed', {source: 'h2s_convert', valid: true}, {modality: 'image'});
    box.value = 'x^2+5*x+6=0';
    research.log(box, 'answer_inserted', {via: 'apply', value: box.value}, {modality: 'image'});
    research.log(box, 'submit_triggered', {submitterKind: 'check', answers: {ans1: box.value}},
        {input: null, modality: null});
    research.flush(true);

    // Page 2: incorrect, the learner retypes the answer and checks again.
    tab.advance(3000);
    research = tab.load();
    box = answerBox('x^2+5*x+6=0');
    let pending = research.pendingSubmit(box);
    assert.ok(pending);
    research.log(box, 'submit_confirmed', {submissionEventId: pending.eventid}, {input: null, modality: null});
    research.log(box, 'feedback_observed', {state: 'incorrect', submissionEventId: pending.eventid},
        {input: null, modality: null});
    const answerEdits = research.editTracker(box, () => box.value, () => ({target: 'answer'}),
        {logOptions: () => ({modality: 'keyboard'})});
    tab.advance(14000);
    box.value = '(x+2)*(x+3)=0';
    answerEdits.input();
    tab.advance(1000); // idle commit
    research.log(box, 'validation_completed', {source: 'stack_instant', valid: true});
    research.log(box, 'submit_triggered', {submitterKind: 'check', answers: {ans1: box.value}},
        {input: null, modality: null});
    research.flush(true);

    // Page 3: correct.
    research = tab.load();
    pending = research.pendingSubmit(box);
    research.log(answerBox(box.value), 'submit_confirmed', {submissionEventId: pending.eventid},
        {input: null, modality: null});
    research.log(answerBox(box.value), 'feedback_observed', {state: 'correct', submissionEventId: pending.eventid},
        {input: null, modality: null});
    research.log(answerBox(box.value), 'task_finished', {reason: 'graded_complete'},
        {input: null, modality: null});
    research.flush(true);
    await settle();

    // The first action of a page starts the question's clock.
    assert.deepEqual(tab.sent.filter(event => event.type === 'activity_resumed').map(event => event.payload.reason),
        ['recognition_started', 'edit_committed']);
    assert.deepEqual(actions(tab.sent).map(event => event.type), [
        'interaction_started', 'task_started', 'recognition_started', 'recognition_completed', 'edit_committed',
        'validation_completed', 'answer_inserted', 'submit_triggered',
        'interaction_started', 'submit_confirmed', 'feedback_observed', 'revision_started', 'edit_committed',
        'validation_completed', 'submit_triggered',
        'interaction_started', 'submit_confirmed', 'feedback_observed', 'task_finished'
    ]);

    // One trace across three pages, with a continuous sequence.
    assert.equal(new Set(tab.sent.map(event => event.traceid)).size, 1);
    assert.equal(new Set(tab.sent.map(event => event.pageid)).size, 3);
    assert.deepEqual(tab.sent.map(event => event.eventseq), tab.sent.map((event, index) => index + 1));
    assert.equal(new Set(tab.sent.map(event => event.eventid)).size, tab.sent.length);

    const edits = tab.sent.filter(event => event.type === 'edit_committed');
    assert.deepEqual(edits.map(event => [event.payload.target, event.payload.before, event.payload.after,
        event.payload.trigger, event.payload.inputEvents]), [
        ['line', 'x^2+5x+8=0', 'x^2+5x+6=0', 'apply', 2],
        ['answer', 'x^2+5*x+6=0', '(x+2)*(x+3)=0', 'idle', 1]
    ]);
    assert.equal(edits[1].modality, 'keyboard');

    const revision = tab.sent.find(event => event.type === 'revision_started');
    assert.deepEqual(revision.payload.previousSubmitted, {ans1: 'x^2+5*x+6=0'});
    assert.equal(revision.payload.feedbackState, 'incorrect');
    assert.equal(revision.payload.firstAction, 'edit_committed');
    assert.equal(revision.payload.msSinceFeedback, 14000);

    const starts = tab.sent.filter(event => event.type === 'interaction_started');
    assert.deepEqual(starts.map(event => event.payload.resumed), [false, true, true]);
    const submit = tab.sent.find(event => event.type === 'submit_triggered');
    assert.equal(submit.input, null);
    assert.deepEqual([submit.usage, submit.slot, submit.schema], [43, 4, 1]);
    const confirmations = tab.sent.filter(event => event.type === 'submit_confirmed');
    assert.deepEqual(confirmations.map(event => event.payload.submissionEventId),
        tab.sent.filter(event => event.type === 'submit_triggered').map(event => event.eventid));
});

test('task lifecycle events occur only once across page reloads', async () => {
    const tab = createTab();
    const box = answerBox('');
    let research = tab.load();
    research.log(box, 'task_started', {answers: {ans1: ''}}, {input: null, modality: null});
    research.flush(true);
    research = tab.load();
    research.log(box, 'task_started', {answers: {ans1: 'x'}}, {input: null, modality: null});
    research.log(box, 'task_finished', {answers: {ans1: 'x'}}, {input: null, modality: null});
    research.flush(true);
    research = tab.load();
    research.log(box, 'task_finished', {answers: {ans1: 'x'}}, {input: null, modality: null});
    research.flush(true);
    await settle();
    assert.equal(tab.sent.filter(event => event.type === 'task_started').length, 1);
    assert.equal(tab.sent.filter(event => event.type === 'task_finished').length, 1);
});

test('an edit that returns to its starting value is not an edit', async () => {
    const tab = createTab();
    const research = tab.load();
    const box = answerBox('x+1');
    const edits = research.editTracker(box, () => box.value, () => ({target: 'answer'}));
    box.value = 'x+12';
    edits.input();
    box.value = 'x+1';
    edits.input();
    tab.advance(1000);
    research.flush();
    await settle();
    assert.deepEqual(actions(tab.sent).map(event => event.type), ['interaction_started']);
});

test('values written by Hand2STACK move the baseline instead of counting as edits', async () => {
    const tab = createTab();
    const research = tab.load();
    const box = answerBox('');
    const edits = research.editTracker(box, () => box.value, () => ({target: 'answer'}));
    box.value = 'x^2-1';
    edits.rebase();
    box.value = 'x^2+1';
    edits.input();
    edits.commit('blur');
    research.flush();
    await settle();
    const edit = tab.sent.find(event => event.type === 'edit_committed');
    assert.deepEqual([edit.payload.before, edit.payload.after], ['x^2-1', 'x^2+1']);
});

test('a new recognition closes an edit in progress first', async () => {
    const tab = createTab();
    const research = tab.load();
    const box = answerBox('a');
    const edits = research.editTracker(box, () => box.value, () => ({target: 'answer'}));
    box.value = 'ab';
    edits.input();
    research.log(box, 'recognition_started', {source: 'handwrite'});
    research.flush();
    await settle();
    assert.deepEqual(actions(tab.sent).map(event => [event.type, event.payload.trigger]), [
        ['interaction_started', undefined],
        ['edit_committed', 'flush'],
        ['recognition_started', undefined]
    ]);
});

test('page views without a recent submit do not report feedback', () => {
    const tab = createTab();
    let research = tab.load();
    const box = answerBox('1');
    assert.equal(research.pendingSubmit(box), null);
    research.log(box, 'submit_triggered', {answers: {}}, {input: null, modality: null});
    tab.advance(10 * 60 * 1000);
    research = tab.load();
    assert.equal(research.pendingSubmit(box), null);
});

test('nothing is queued or sent unless the server enabled logging', async () => {
    const tab = createTab({enabled: false});
    const research = tab.load();
    const box = answerBox('');
    research.log(box, 'recognition_started', {});
    const edits = research.editTracker(box, () => box.value, () => ({target: 'answer'}));
    box.value = 'x';
    edits.input();
    edits.commit('blur');
    research.flush(true);
    await settle();
    assert.equal(tab.sent.length, 0);
    assert.equal(research._queue.length, 0);
});

test('a server that reports logging disabled stops further sends', async () => {
    const tab = createTab({response: {success: true, accepted: 0, disabled: true}});
    const research = tab.load();
    const box = answerBox('');
    research.log(box, 'recognition_started', {});
    research.flush();
    await settle();
    const sentBefore = tab.sent.length;
    research.log(box, 'recognition_completed', {});
    research.flush();
    await settle();
    assert.equal(tab.sent.length, sentBefore);
    assert.equal(research.enabled(), false);
});

test('long values are clipped and marked', () => {
    const research = createTab().load();
    assert.equal(research.clip('abcdef', 3), 'abc…[truncated]');
    assert.equal(research.clip(null), '');
});

test('saving with Next does not wait for feedback, a Check does', () => {
    const tab = createTab();
    let research = tab.load();
    const box = answerBox('x=3');
    research.log(box, 'submit_triggered', {submitterKind: 'next', answers: {ans1: 'x=3'}}, {input: null, modality: null});
    research = tab.load();
    assert.equal(research.pendingSubmit(box), null);

    research.log(box, 'submit_triggered', {submitterKind: 'check', answers: {ans1: 'x=3'}}, {input: null, modality: null});
    research = tab.load();
    assert.deepEqual(research.pendingSubmit(box).answers, {ans1: 'x=3'});
});

test('a later Next clears a Check that is still waiting for feedback', () => {
    const tab = createTab();
    const research = tab.load();
    const box = answerBox('3');
    research.log(box, 'submit_triggered', {submitterKind: 'check', answers: {}}, {input: null, modality: null});
    research.log(box, 'submit_triggered', {submitterKind: 'next', answers: {}}, {input: null, modality: null});
    assert.equal(tab.load().pendingSubmit(box), null);
});

test('a question Check button is scoped to its own question', () => {
    const classifySubmitter = (0, eval)(`(function() {
        ${extractFunctionSource('classifySubmitter')}
        return classifySubmitter;
    })()`);
    assert.deepEqual(classifySubmitter('q50:2_-submit'), {kind: 'check', key: '50:2'});
    assert.deepEqual(classifySubmitter('next'), {kind: 'next', key: null});
    assert.deepEqual(classifySubmitter('finish'), {kind: 'finish', key: null});
    assert.deepEqual(classifySubmitter('save'), {kind: 'save', key: null});
    assert.deepEqual(classifySubmitter(''), {kind: 'other', key: null});
});

test('STACK validation is logged once per validated value, not per MathJax repaint', () => {
    const element = {
        textContent: '', error: null, validated: null,
        querySelector: selector => (selector.startsWith('input') ? element.validated : element.error)
    };
    let onMutation = null;
    const logged = [];
    const observeStackValidation = (0, eval)(`(function(document, MutationObserver, window, research) {
        ${extractFunctionSource('observeStackValidation')}
        return observeStackValidation;
    })`)(
        {getElementById: id => (id === 'q50:1_ans1_val' ? element : null)},
        class {
            constructor(callback) {
                onMutation = callback;
            }
            observe() {}
        },
        {setTimeout: fn => fn(), clearTimeout: () => {}},
        {clip: value => String(value), log: (box, type, payload) => logged.push([payload.source, payload.expression, payload.valid, payload.message, payload.typed])}
    );

    const box = {name: 'q50:1_ans1', value: 'x=3'};
    element.textContent = 'Your last answer was interpreted as follows: \\[ x=3 \\]';
    const validation = observeStackValidation(box);

    element.textContent = 'Your last answer was interpreted as follows: 𝑥=3x=3';
    onMutation(); // MathJax typesetting the same validation
    assert.deepEqual(logged, []);

    box.value = '(x+1';
    element.error = {textContent: 'You have a missing right bracket.'};
    element.textContent = 'You have a missing right bracket.';
    onMutation();
    box.value = '(x+1)';
    element.error = null;
    element.textContent = 'Your last answer was interpreted as follows: x+1';
    onMutation();
    validation.reportNow();

    // The learner typed on while STACK validated "1<x": log what was validated.
    element.validated = {value: '1<x'};
    element.textContent = 'Your last answer was interpreted as follows: 1<x';
    box.value = '1<x an';
    onMutation();

    assert.deepEqual(logged, [
        ['stack_instant', '(x+1', false, 'You have a missing right bracket.', null],
        ['stack_instant', '(x+1)', true, '', null],
        ['stack_page', '(x+1)', true, '', null],
        ['stack_instant', '1<x', true, '', '1<x an']
    ]);
});

// Delivery: an event leaves the browser's outbox only when event.php stores
// it; one the server will not have stays there as a dead letter, reported by
// a delivery_failed event.

const typeAnswer = (tab, research, value, name = 'q43:4_ans1') => {
    const box = {name, value: 'x'};
    const edits = research.editTracker(box, () => box.value, () => ({target: 'answer'}),
        {logOptions: () => ({modality: 'keyboard'})});
    box.value = value;
    edits.input();
    return {box, edits};
};
const storedOnce = tab => Array.from(tab.server.stored.values()).every(count => count === 1);
const settleAll = async () => {
    for (let i = 0; i < 8; i++) await settle();
};
const questionLevel = {input: null, modality: null};

test('events made while offline are sent again with backoff once the network is back', async () => {
    const tab = createTab();
    const research = tab.load();
    tab.server.online = false;
    const {edits} = typeAnswer(tab, research, 'x+1');
    edits.commit('blur');
    research.flush();
    await settleAll();
    assert.equal(tab.server.stored.size, 0);
    const waiting = tab.pending();
    assert.ok(waiting.length >= 2);
    assert.ok(waiting.every(row => row.attempts === 1 && row.lastError === 'offline'));

    // Still offline at the first retry: the wait doubles.
    tab.advance(5000);
    await settleAll();
    assert.equal(research.stats().failedSends, 2);
    tab.server.online = true;
    tab.advance(5000);
    await settleAll();
    assert.equal(tab.server.stored.size, 0, 'the second wait is 10 s');
    tab.advance(5000);
    await settleAll();

    assert.equal(tab.server.stored.size, waiting.length);
    assert.equal(tab.outboxRows.size, 0);
    assert.ok(storedOnce(tab));
    assert.equal(research.stats().pending, 0);
});

test('coming back online sends at once instead of waiting out the backoff', async () => {
    const tab = createTab();
    const research = tab.load();
    tab.server.online = false;
    research.log(answerBox(''), 'recognition_started', {});
    research.flush();
    await settleAll();
    tab.server.online = true;
    research.restore();
    await settleAll();
    assert.ok(tab.server.stored.size >= 2);
    assert.equal(tab.outboxRows.size, 0);
});

test('a reload right after an edit restores the unsent events without duplicates', async () => {
    const tab = createTab();
    let research = tab.load();
    const {edits} = typeAnswer(tab, research, 'x+2');
    // The page goes before the idle commit: pagehide commits and beacons,
    // but the beacon never arrives.
    tab.server.beaconLost = true;
    edits.commit('flush');
    research.flush(true);
    await settleAll();
    assert.equal(tab.server.stored.size, 0);
    const unsent = tab.pending().map(row => row.event);
    assert.deepEqual(actions(unsent).map(event => event.type), ['interaction_started', 'edit_committed']);

    tab.server.beaconLost = false;
    research = tab.load();
    research.restore();
    await settleAll();
    assert.deepEqual(Array.from(tab.server.stored.keys()).sort(), unsent.map(event => event.eventid).sort());
    assert.equal(tab.outboxRows.size, 0);

    // The edit arrives exactly as it was made.
    const resent = tab.sent.filter(event => event.type === 'edit_committed');
    assert.deepEqual(resent[resent.length - 1], unsent.find(event => event.type === 'edit_committed'));
});

test('a beacon that did arrive is confirmed by the next page and stored once', async () => {
    const tab = createTab();
    let research = tab.load();
    research.log(answerBox(''), 'recognition_started', {});
    research.flush(true);
    await settleAll();
    const count = tab.server.stored.size;
    assert.equal(tab.pending().length, count, 'a beacon confirms nothing');

    research = tab.load();
    research.restore();
    await settleAll();
    assert.equal(tab.outboxRows.size, 0);
    assert.equal(tab.server.stored.size, count);
    assert.ok(Array.from(tab.server.stored.values()).every(times => times === 2), 'a duplicate the server ignores');
});

test('a tab closed before sending is caught up when the quiz is opened again', async () => {
    const tab = createTab();
    let research = tab.load();
    research.log(answerBox(''), 'recognition_started', {});
    tab.close(); // no pagehide, no flush
    await settleAll();
    assert.equal(tab.sent.length, 0);

    research = tab.load();
    research.restore();
    await settleAll();
    assert.deepEqual(actions(tab.sent).map(event => event.type), ['interaction_started', 'recognition_started']);
    assert.equal(tab.outboxRows.size, 0);
    assert.ok(storedOnce(tab));
});

test('events the outbox had not finished writing are spilled on unload and restored', async () => {
    const tab = createTab({outboxHangs: true});
    let research = tab.load();
    tab.server.beaconLost = true;
    research.log(answerBox(''), 'recognition_started', {});
    research.flush(true);
    await settleAll();
    assert.deepEqual(actions(tab.spilled()).map(event => event.type), ['interaction_started', 'recognition_started']);

    tab.server.beaconLost = false;
    research = tab.load();
    research.restore();
    await settleAll();
    assert.equal(tab.server.stored.size, tab.sent.length / 2);
    assert.deepEqual(tab.spilled(), []);
});

test('a partial acknowledgement removes only the events the server named', async () => {
    const tab = createTab({response: batch => ({
        success: true,
        acknowledgedIds: batch.filter(event => event.type !== 'recognition_started').map(event => event.eventid),
        rejectedIds: []
    })});
    const research = tab.load();
    research.log(answerBox(''), 'recognition_started', {});
    research.flush();
    await settleAll();
    assert.deepEqual(tab.pending().map(row => [row.event.type, row.unanswered]), [['recognition_started', 1]]);
});

test('a rejected event becomes a dead letter and the server is told, once', async () => {
    const tab = createTab();
    tab.server.reject.add('recognition_started');
    const research = tab.load();
    research.log(answerBox(''), 'recognition_started', {});
    research.flush();
    await settleAll();
    tab.advance(60 * 60 * 1000);
    await settleAll();

    const original = tab.sent.find(event => event.type === 'recognition_started');
    assert.equal(tab.sent.filter(event => event.eventid === original.eventid).length, 1, 'never sent again');
    assert.deepEqual(tab.dead().map(row => [row.eventid, row.status, row.failureReason, row.attempts]),
        [[original.eventid, 'rejected', 'rejected', 1]]);
    assert.deepEqual(tab.dead()[0].event, original, 'kept as it was');

    const notice = tab.sent.find(event => event.type === 'delivery_failed');
    assert.deepEqual([notice.traceid, notice.eventseq, notice.usage, notice.slot, notice.input, notice.modality],
        [original.traceid, 0, 43, 4, null, null]);
    assert.deepEqual([notice.payload.originalEventId, notice.payload.originalEventSeq, notice.payload.originalType,
        notice.payload.reason, notice.payload.attempts], [original.eventid, original.eventseq, 'recognition_started',
        'rejected', 1]);
    assert.ok(tab.server.stored.has(notice.eventid));
    assert.equal(tab.dead()[0].noticeId, notice.eventid);
    assert.equal(tab.sent.filter(event => event.type === 'delivery_failed').length, 1);
    assert.deepEqual([research.stats().rejected, research.stats().pending], [1, 0]);
    assert.deepEqual(tab.warnings, ['1 research event(s) were not stored and are kept as dead letters in this browser']);

    // The next page reports nothing again.
    const next = tab.load();
    next.restore();
    await settleAll();
    assert.equal(tab.sent.filter(event => event.type === 'delivery_failed').length, 1);
});

test('a delivery_failed that fails itself is kept, not reported again', async () => {
    const tab = createTab();
    tab.server.reject.add('recognition_started');
    tab.server.reject.add('delivery_failed');
    const research = tab.load();
    research.log(answerBox(''), 'recognition_started', {});
    research.flush();
    await settleAll();
    tab.advance(60 * 60 * 1000);
    await settleAll();
    assert.equal(tab.sent.filter(event => event.type === 'delivery_failed').length, 1);
    assert.deepEqual(tab.dead().map(row => [row.event.type, row.status, row.noticeId === null]),
        [['recognition_started', 'rejected', false], ['delivery_failed', 'rejected', true]]);
});

test('an error or an unconfirming answer keeps the events pending, with the last error', async () => {
    for (const response of [{success: false, errorcode: 'invalidsesskey'}, {success: true, accepted: 1}]) {
        const tab = createTab({response});
        const research = tab.load();
        research.log(answerBox(''), 'recognition_started', {});
        research.flush();
        await settleAll();
        const perSend = tab.sent.length;
        for (let i = 0; i < 12; i++) {
            tab.advance(RETRY_CAP);
            await settleAll();
        }
        // Retried with backoff, never more often than every 5 minutes.
        assert.ok(tab.sent.length <= perSend * 13);
        assert.equal(tab.dead().length, 0);
        assert.ok(tab.pending().length >= 2, 'kept for the next page');
        assert.ok(tab.pending().every(row => row.attempts > 5
            && row.lastError === 'event.php did not confirm the batch'));
    }
});

test('an event the server never names becomes "unresolved" after five answered tries', async () => {
    const tab = createTab({response: batch => ({
        success: true,
        acknowledgedIds: batch.filter(event => event.type !== 'recognition_started').map(event => event.eventid),
        rejectedIds: []
    })});
    const research = tab.load();
    research.log(answerBox(''), 'recognition_started', {});
    research.flush();
    await settleAll();
    const ignored = tab.sent.find(event => event.type === 'recognition_started').eventid;
    for (let i = 0; i < 10; i++) {
        tab.advance(RETRY_CAP);
        await settleAll();
    }
    assert.equal(tab.sent.filter(event => event.eventid === ignored).length, 5);
    assert.deepEqual(tab.dead().map(row => [row.eventid, row.status, row.attempts]), [[ignored, 'unresolved', 5]]);
    assert.equal(tab.sent.find(event => event.type === 'delivery_failed').payload.reason, 'unresolved');
});

test('the count of unanswered tries survives a reload', async () => {
    const tab = createTab({response: batch => ({
        success: true,
        acknowledgedIds: batch.filter(event => event.type !== 'recognition_started').map(event => event.eventid),
        rejectedIds: []
    })});
    let research = tab.load();
    research.log(answerBox(''), 'recognition_started', {});
    for (let page = 0; page < 5; page++) {
        research.flush();
        await settleAll();
        tab.close();
        research = tab.load();
        research.restore();
        await settleAll();
    }
    assert.deepEqual(tab.dead().map(row => row.status), ['unresolved']);
});

test('events older than a week become "expired" dead letters, not deleted', async () => {
    const tab = createTab();
    tab.server.online = false;
    let research = tab.load();
    research.log(answerBox(''), 'recognition_started', {});
    research.flush();
    await settleAll();
    tab.close();
    tab.advance(8 * 24 * 60 * 60 * 1000);
    tab.server.online = true;
    research = tab.load();
    research.restore();
    await settleAll();
    const expired = tab.dead().filter(row => row.event.type !== 'delivery_failed');
    assert.ok(expired.length >= 2);
    assert.ok(expired.every(row => row.status === 'expired' && row.lastError === 'offline'));
    const notices = tab.sent.filter(event => event.type === 'delivery_failed');
    assert.equal(notices.length, expired.length);
    assert.ok(notices.every(event => tab.server.stored.has(event.eventid) && event.payload.reason === 'expired'));
    // None of the originals reached the server.
    assert.ok(expired.every(row => !tab.server.stored.has(row.eventid)));
});

test('dead letters are removed a month after they were reported', async () => {
    const tab = createTab();
    tab.server.reject.add('recognition_started');
    let research = tab.load();
    research.log(answerBox(''), 'recognition_started', {});
    research.flush();
    await settleAll();
    tab.advance(31 * 24 * 60 * 60 * 1000);
    await settleAll(); // its delivery_failed is stored
    research = tab.load();
    research.restore();
    await settleAll();
    assert.equal(tab.outboxRows.size, 0);
});

test('a server that turns logging off also clears the outbox', async () => {
    const tab = createTab({response: {success: true, accepted: 0, disabled: true}});
    const research = tab.load();
    research.log(answerBox(''), 'recognition_started', {});
    research.flush();
    await settleAll();
    assert.equal(tab.outboxRows.size, 0);
});

test('a hidden tab commits the edit in progress before sending', async () => {
    const tab = createTab();
    const research = tab.load();
    typeAnswer(tab, research, 'x+3');
    research.commitEdits('hidden');
    research.flush(true);
    await settleAll();
    const edit = tab.sent.find(event => event.type === 'edit_committed');
    assert.deepEqual([edit.payload.trigger, edit.payload.after], ['hidden', 'x+3']);
});

// Active time: one question at a time, only while the page is visible,
// focused and not left.

const otherBox = value => ({name: 'q43:5_ans1', value});
const activeOf = (tab, box) => {
    const finished = tab.sent.filter(event => event.slot === Number(box.name.split(':')[1].split('_')[0])
        && (event.type === 'activity_paused' || event.type === 'task_finished' || event.type === 'submit_triggered'));
    const last = finished[finished.length - 1];
    return last && (last.payload.totalActiveMs !== undefined ? last.payload.totalActiveMs : last.payload.activeTimeMs);
};

test('two questions on one page never share a second', async () => {
    const tab = createTab();
    const research = tab.load();
    const alg01 = answerBox('');
    const alg02 = otherBox('');
    research.log(alg01, 'task_started', {}, questionLevel);
    research.log(alg02, 'task_started', {}, questionLevel);
    tab.advance(5000); // nothing current yet on a page of two
    research.activate(alg01, 'focusin');
    tab.advance(10000);
    research.activate(alg02, 'pointerdown');
    tab.advance(20000);
    research.pause('hidden');
    tab.advance(60000); // another tab: neither question counts
    research.resume('visible');
    tab.advance(1000);
    research.pause('leave');
    research.flush();
    await settleAll();

    assert.equal(activeOf(tab, alg01), 10000);
    assert.equal(activeOf(tab, alg02), 21000);
    const clock = tab.sent.filter(event => event.type.startsWith('activity_'))
        .map(event => [event.slot, event.type, event.payload.reason]);
    assert.deepEqual(clock, [
        [4, 'activity_resumed', 'focusin'],
        [4, 'activity_paused', 'question_switch'],
        [5, 'activity_resumed', 'question_switch'],
        [5, 'activity_paused', 'hidden'],
        [5, 'activity_resumed', 'visible'],
        [5, 'activity_paused', 'leave']
    ]);
});

test('a Hand2STACK action in another question switches the clock to it', async () => {
    const tab = createTab();
    const research = tab.load();
    const alg01 = answerBox('');
    const alg02 = otherBox('');
    research.activate(alg01, 'focusin');
    tab.advance(4000);
    research.log(alg02, 'recognition_started', {source: 'handwrite'}, {modality: 'handwrite'});
    tab.advance(6000);
    research.pause('leave');
    research.flush();
    await settleAll();
    assert.equal(activeOf(tab, alg01), 4000);
    assert.equal(activeOf(tab, alg02), 6000);
    // The switch is logged before the action.
    assert.deepEqual(tab.sent.filter(event => event.slot === 5).map(event => event.type),
        ['interaction_started', 'activity_resumed', 'recognition_started', 'activity_paused']);
});

test('time away from the question is not counted as active time', async () => {
    const tab = createTab();
    let research = tab.load();
    const box = answerBox('');
    research.log(box, 'task_started', {answers: {}}, questionLevel);
    research.activate(box, 'start'); // alone on its page
    tab.advance(30000);
    research.pause('hidden');
    tab.advance(7.5 * 60 * 1000); // another tab, another question
    research.resume('visible');
    tab.advance(20000);
    research.log(box, 'submit_triggered', {submitterKind: 'check', answers: {}}, questionLevel);
    research.pause('leave');
    research.flush(true);

    // The next page, after the Check reload.
    tab.advance(2000);
    research = tab.load();
    research.activate(box, 'start');
    research.log(box, 'task_finished', {reason: 'graded_complete'}, questionLevel);
    research.flush();
    await settleAll();

    const byType = type => tab.sent.filter(event => event.type === type);
    assert.deepEqual(byType('activity_paused').map(event => [event.payload.reason, event.payload.activeMs,
        event.payload.totalActiveMs]), [['hidden', 30000, 30000], ['leave', 0, 50000]]);
    const resumed = byType('activity_resumed')[1];
    assert.deepEqual([resumed.payload.reason, resumed.payload.pausedMs], ['visible', 7.5 * 60 * 1000]);
    assert.equal(byType('submit_triggered')[0].payload.activeTimeMs, 50000);
    assert.equal(byType('task_finished')[0].payload.activeTimeMs, 50000);
    assert.equal(resumed.input, null);
    assert.equal(resumed.modality, null);
});

test('pausing twice or resuming an active page logs nothing', async () => {
    const tab = createTab();
    const research = tab.load();
    research.log(answerBox(''), 'task_started', {}, questionLevel);
    research.activate(answerBox(''), 'start');
    research.activate(answerBox(''), 'keydown');
    research.resume('focus');
    research.pause('blur');
    research.pause('hidden');
    research.flush();
    await settleAll();
    assert.deepEqual(tab.sent.map(event => event.type),
        ['interaction_started', 'task_started', 'activity_resumed', 'activity_paused']);
});

test('a page opened in the background starts paused', async () => {
    const tab = createTab();
    const research = tab.load();
    research.pause('hidden');
    const box = answerBox('');
    research.log(box, 'task_started', {}, questionLevel);
    research.activate(box, 'start');
    tab.advance(60000);
    research.resume('visible');
    tab.advance(5000);
    research.log(box, 'submit_triggered', {submitterKind: 'next', answers: {}}, questionLevel);
    research.flush();
    await settleAll();
    assert.equal(tab.sent[0].payload.pageActive, false);
    assert.equal(tab.sent.find(event => event.type === 'activity_resumed').payload.pausedMs, 60000);
    assert.equal(tab.sent.find(event => event.type === 'submit_triggered').payload.activeTimeMs, 5000);
});

test('looking at a finished question again is a revisit and adds no active time', async () => {
    const tab = createTab();
    let research = tab.load();
    const box = answerBox('x');
    research.log(box, 'task_started', {}, questionLevel);
    research.activate(box, 'start');
    tab.advance(10000);
    research.log(box, 'task_finished', {reason: 'graded_complete'}, questionLevel);
    tab.advance(10000);
    research.pause('leave');
    research.flush();
    research = tab.load();
    research.log(box, 'feedback_observed', {state: 'correct'}, questionLevel);
    research.activate(box, 'start');
    research.log(box, 'candidate_selected', {kind: 'line'});
    tab.advance(10000);
    research.pause('leave');
    research.resume('visible');
    research.flush();
    await settleAll();
    const starts = tab.sent.filter(event => event.type === 'interaction_started');
    assert.deepEqual(starts.map(event => [event.payload.revisit, event.payload.activeMsBefore]), [[false, 0], [true, 10000]]);
    assert.equal(tab.sent.find(event => event.type === 'task_finished').payload.activeTimeMs, 10000);
    // The finished question's clock never runs again.
    assert.deepEqual(tab.sent.filter(event => event.type.startsWith('activity_')).map(event => event.type),
        ['activity_resumed']);
});

// Edit integrity: drafts are durable and dropped only after their event is in.

test('an edit being typed when the tab was closed is logged when the quiz is opened again', async () => {
    const tab = createTab();
    let research = tab.load();
    let box = answerBox('x+1');
    let edits = research.editTracker(box, () => box.value, () => ({target: 'answer'}),
        {logOptions: () => ({modality: 'keyboard'})});
    box.value = 'x+12';
    edits.input();
    tab.advance(300);
    box.value = 'x+123';
    edits.input();
    research.flush();
    await settleAll();
    tab.close(); // no idle commit, no pagehide
    tab.closeSession(); // a closed tab loses sessionStorage, not the outbox

    research = tab.load();
    box = answerBox('x+1'); // Moodle never received the typing
    edits = research.editTracker(box, () => box.value, () => ({target: 'answer'}),
        {logOptions: () => ({modality: 'keyboard'})});
    await settleAll();
    research.flush();
    await settleAll();
    const edit = tab.sent.find(event => event.type === 'edit_committed');
    assert.deepEqual([edit.payload.trigger, edit.payload.before, edit.payload.after, edit.payload.inputEvents,
        edit.payload.burstMs, edit.modality], ['recovered', 'x+1', 'x+123', 2, 300, 'keyboard']);
    assert.equal(tab.drafts.size, 0, 'dropped once the edit was in the outbox');
    assert.equal(research.stats().recovered, 1);

    // Logged once.
    const again = tab.load();
    again.editTracker(box, () => box.value, () => ({target: 'answer'}));
    await settleAll();
    again.flush();
    await settleAll();
    assert.equal(tab.sent.filter(event => event.type === 'edit_committed').length, 1);
});

test('a draft whose IndexedDB write never finished is recovered from the spill', async () => {
    const tab = createTab({draftWritesHang: true});
    let research = tab.load();
    const box = answerBox('a');
    const edits = research.editTracker(box, () => box.value, () => ({target: 'answer'}));
    box.value = 'ab';
    edits.input();
    // The tab is hidden and killed: the spill is written before the commit,
    // and the commit's event never reaches the outbox.
    tab.server.beaconLost = true;
    research.commitEdits('hidden');
    tab.close();
    tab.outboxRows.clear(); // the IndexedDB write of the event was lost too
    assert.equal(tab.draftSpill.size, 1);

    research = tab.load();
    research.editTracker(box, () => 'a', () => ({target: 'answer'}));
    await settleAll();
    research.flush();
    await settleAll();
    const recovered = tab.sent.filter(event => event.type === 'edit_committed');
    assert.deepEqual(recovered.map(event => [event.payload.trigger, event.payload.after]), [['recovered', 'ab']]);
    assert.equal(tab.draftSpill.size, 0);
});

test('a draft whose edit is already in the outbox is dropped, not logged twice', async () => {
    const tab = createTab();
    let research = tab.load();
    const box = answerBox('a');
    const edits = research.editTracker(box, () => box.value, () => ({target: 'answer'}));
    box.value = 'ab';
    edits.input();
    tab.server.beaconLost = true;
    edits.commit('submit');
    research.flush(true);
    // Killed between storing the edit and dropping its draft.
    const committed = tab.pending().find(row => row.event.type === 'edit_committed').event;
    tab.drafts.set(Array.from(tab.draftSpill.keys())[0], Object.assign({}, Array.from(tab.draftSpill.values())[0]));
    tab.close();
    tab.server.beaconLost = false;

    research = tab.load();
    research.editTracker(box, () => 'ab', () => ({target: 'answer'}));
    research.restore();
    await settleAll();
    const edits2 = tab.sent.filter(event => event.type === 'edit_committed');
    assert.ok(edits2.every(event => event.eventid === committed.eventid));
    assert.equal(tab.drafts.size, 0);
    assert.equal(tab.draftSpill.size, 0);
});

test('a draft from another attempt is not applied, and old drafts are pruned', async () => {
    const tab = createTab();
    let research = tab.load();
    const box = answerBox('a');
    const edits = research.editTracker(box, () => box.value, () => ({target: 'answer'}));
    box.value = 'ab';
    edits.input();
    tab.close();

    // A new attempt: usage 44.
    research = tab.load();
    research.editTracker({name: 'q44:4_ans1', value: 'a'}, () => 'a', () => ({target: 'answer'}));
    await settleAll();
    research.flush();
    await settleAll();
    assert.equal(tab.sent.filter(event => event.type === 'edit_committed').length, 0);
    assert.equal(tab.drafts.size, 1, 'kept as an orphan');

    tab.advance(8 * 24 * 60 * 60 * 1000);
    research = tab.load();
    research.restore();
    await settleAll();
    assert.equal(tab.drafts.size, 0);
});

test('an edit committed normally leaves no draft behind', async () => {
    const tab = createTab();
    let research = tab.load();
    const box = answerBox('a');
    const edits = research.editTracker(box, () => box.value, () => ({target: 'answer'}));
    box.value = 'ab';
    edits.input();
    assert.equal(tab.drafts.size, 1);
    edits.commit('blur');
    await settleAll();
    assert.equal(tab.drafts.size, 0);
    research.flush();
    research = tab.load();
    research.editTracker(box, () => box.value, () => ({target: 'answer'}));
    await settleAll();
    research.flush();
    await settleAll();
    assert.deepEqual(tab.sent.filter(event => event.type === 'edit_committed').map(event => event.payload.trigger),
        ['blur']);
});

test('a draft is dropped only after its edit is in the outbox', async () => {
    const tab = createTab({outboxHangs: true});
    const research = tab.load();
    const box = answerBox('a');
    const edits = research.editTracker(box, () => box.value, () => ({target: 'answer'}));
    box.value = 'ab';
    edits.input();
    edits.commit('blur');
    await settleAll();
    assert.equal(tab.drafts.size, 1, 'the event is not stored yet');
});

test('a clipped edit says so and keeps the full lengths', async () => {
    const tab = createTab();
    const research = tab.load();
    const box = answerBox('ab');
    const edits = research.editTracker(box, () => box.value, () => ({target: 'freetext'}), {max: 5});
    box.value = 'abcdefgh';
    edits.input();
    edits.commit('blur');
    research.flush();
    await settleAll();
    const edit = tab.sent.find(event => event.type === 'edit_committed');
    assert.deepEqual([edit.payload.after, edit.payload.beforeLength, edit.payload.afterLength, edit.payload.truncated],
        ['abcde…[truncated]', 2, 8, true]);
});

test('a panel restored after a Check keeps the input method its result came from', () => {
    const resultView = fs.readFileSync(path.join(__dirname, '../../amd/src/ui/result_view.js'), 'utf8');
    const attachButton = fs.readFileSync(path.join(__dirname, '../../amd/src/ui/attach_button.js'), 'utf8');
    assert.match(resultView, /modality: answerBox\._hand2stackModality \|\| null/);
    assert.match(attachButton, /answerBox\._hand2stackModality = savedResult\.modality/);
    // The panel's own events fall back to it rather than logging null.
    assert.match(resultView, /modality: panel\._hand2stackSource \|\| answerBox\._hand2stackModality \|\| null/);
});

test('the outbox is made when first used, after the page config enabled logging', async () => {
    // research.js builds the logger before main.js merges the server config.
    const config = {eventUrl: '/event.php', research: {enabled: false}};
    const made = [];
    const rows = [];
    const research = createResearchLogger({
        pageId: 'page', uuid: (() => {
            let n = 0;
            return () => `uuid-${++n}`;
        })(), now: () => 1791190800000, getConfig: () => config,
        storage: {getItem: () => null, setItem: () => {}},
        outbox: () => {
            made.push(config.research.scope);
            return {
                put: events => {
                    rows.push(...events);
                    return Promise.resolve();
                },
                mark: () => Promise.resolve(), remove: () => Promise.resolve(), load: () => Promise.resolve([]),
                clear: () => Promise.resolve(), spill: () => {}, putDraft: () => Promise.resolve(), spillDraft: () => {},
                getDraft: () => Promise.resolve(null), removeDraft: () => Promise.resolve(), pruneDrafts: () => Promise.resolve(0)
            };
        },
        setTimeout: () => null, clearTimeout: () => {}, warn: error => {
            throw error;
        },
        describeBox: () => ({}), send: () => new Promise(() => {})
    });
    assert.deepEqual(made, []);
    Object.assign(config.research, {enabled: true, scope: 'abc'});
    research.log(answerBox(''), 'recognition_started', {});
    await settle();
    assert.deepEqual(made, ['abc']);
    assert.ok(rows.length >= 2);
});

test('an event made after the page started leaving is spilled at once', async () => {
    const tab = createTab({outboxHangs: true});
    let research = tab.load();
    tab.server.beaconLost = true;
    research.log(answerBox(''), 'recognition_started', {});
    research.flush(true);
    // Something still reaches the page as it goes.
    research.log(answerBox(''), 'candidate_selected', {kind: 'line'});
    tab.close();
    assert.ok(tab.spilled().some(event => event.type === 'candidate_selected'));

    tab.server.beaconLost = false;
    research = tab.load();
    research.restore();
    await settleAll();
    const stored = tab.sent.filter(event => tab.server.stored.has(event.eventid));
    assert.ok(stored.some(event => event.type === 'candidate_selected'));
});

// Traces outlive sessionStorage, which Moodle clears when its JavaScript
// revision changes (a cache purge or an upgrade).

test('a question goes on with the same trace after Moodle cleared sessionStorage', async () => {
    const tab = createTab();
    let research = tab.load();
    const box = answerBox('');
    await research.ready();
    research.log(box, 'task_started', {}, questionLevel);
    research.activate(box, 'start');
    tab.advance(20000);
    research.log(box, 'submit_triggered', {submitterKind: 'next', answers: {}}, questionLevel);
    research.pause('leave');
    research.flush();
    await settleAll();
    const first = tab.sent.slice();

    tab.closeSession(); // the cache purge
    research = tab.load();
    await research.ready();
    research.log(box, 'task_started', {}, questionLevel);
    research.activate(box, 'start');
    tab.advance(5000);
    research.log(box, 'task_finished', {reason: 'graded_complete'}, questionLevel);
    research.flush();
    await settleAll();

    const later = tab.sent.slice(first.length);
    assert.equal(new Set(tab.sent.map(event => event.traceid)).size, 1);
    assert.deepEqual(tab.sent.map(event => event.eventseq), tab.sent.map((event, index) => index + 1));
    assert.equal(later[0].type, 'interaction_started');
    assert.deepEqual([later[0].payload.resumed, later[0].payload.traceFrom], [true, 'indexeddb']);
    // task_started is not repeated, and the clock adds up.
    assert.equal(tab.sent.filter(event => event.type === 'task_started').length, 1);
    assert.equal(later.find(event => event.type === 'task_finished').payload.activeTimeMs, 25000);
});

test('a trace whose last copy was lost goes on after the events still waiting', async () => {
    const tab = createTab();
    tab.server.online = false;
    let research = tab.load();
    const box = answerBox('');
    await research.ready();
    research.log(box, 'task_started', {}, questionLevel);
    research.log(box, 'recognition_started', {});
    research.flush();
    await settleAll();
    const highest = Math.max(...tab.pending().map(row => row.event.eventseq));
    // The page died before its newest trace copy was written.
    tab.traces.forEach(row => {
        row.state.seq = 2;
    });

    tab.close();
    tab.closeSession();
    tab.server.online = true;
    research = tab.load();
    await research.ready();
    research.log(box, 'candidate_selected', {kind: 'line'});
    research.restore();
    await settleAll();
    const events = new Map(tab.sent.map(event => [event.eventid, event]));
    const seqs = Array.from(events.values()).map(event => event.eventseq);
    assert.equal(new Set(seqs).size, seqs.length, 'no sequence number used twice');
    assert.ok(tab.sent.find(event => event.type === 'candidate_selected').eventseq > highest);
});

test('without sessionStorage or an outbox copy a question starts a new trace', async () => {
    const tab = createTab();
    let research = tab.load();
    await research.ready();
    research.log(answerBox(''), 'task_started', {}, questionLevel);
    research.flush();
    await settleAll();
    tab.closeSession();
    tab.traces.clear();
    research = tab.load();
    await research.ready();
    research.log(answerBox(''), 'task_started', {}, questionLevel);
    research.flush();
    await settleAll();
    assert.equal(new Set(tab.sent.map(event => event.traceid)).size, 2);
    assert.equal(tab.sent[tab.sent.length - 2].payload.traceFrom, null);
});

test('a dead letter whose report never reached the server is kept, then dropped after 180 days', async () => {
    const tab = createTab();
    tab.server.reject.add('recognition_started');
    tab.server.reject.add('delivery_failed');
    let research = tab.load();
    research.log(answerBox(''), 'recognition_started', {});
    research.flush();
    await settleAll();
    tab.advance(60 * 60 * 1000);
    await settleAll();
    assert.equal(tab.dead().length, 2);

    tab.advance(31 * 24 * 60 * 60 * 1000);
    research = tab.load();
    research.restore();
    await settleAll();
    assert.deepEqual(tab.dead().map(row => row.event.type).sort(), ['delivery_failed', 'recognition_started'],
        'the server was never told: kept');

    tab.advance(150 * 24 * 60 * 60 * 1000);
    research = tab.load();
    research.restore();
    await settleAll();
    research.restore();
    await settleAll();
    assert.equal(tab.outboxRows.size, 0);
    assert.ok(tab.warnings.includes('1 research event(s) were removed from this browser after 180 days, and the server was never told'));
});

test('a dead letter whose report is still waiting to be sent is kept', async () => {
    const tab = createTab();
    tab.server.reject.add('recognition_started');
    let research = tab.load();
    research.log(answerBox(''), 'recognition_started', {});
    research.flush();
    // The report is made but the connection goes before it is sent.
    tab.server.online = false;
    await settleAll();
    tab.advance(31 * 24 * 60 * 60 * 1000);
    research = tab.load();
    research.restore();
    await settleAll();
    assert.ok(tab.dead().some(row => row.event.type === 'recognition_started'));
});
