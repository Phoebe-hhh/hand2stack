// This file is part of Moodle - http://moodle.org/.
// SPDX-License-Identifier: GPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.resolve(__dirname, '../../amd/src/main.js'), 'utf8');

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
// a fresh logger, exactly like a quiz Check reloading the page.
const createTab = (options = {}) => {
    const storage = new Map();
    const sent = [];
    let clock = 1791190800000;
    let uuidCounter = 0;
    let timers = [];
    const tab = {
        sent,
        advance: ms => {
            clock += ms;
            const due = timers.filter(timer => timer.at <= clock);
            timers = timers.filter(timer => timer.at > clock);
            due.forEach(timer => timer.fn());
        },
        load: () => createResearchLogger({
            pageId: `page-${++uuidCounter}`,
            uuid: () => `uuid-${++uuidCounter}`,
            now: () => clock,
            getConfig: () => ({eventUrl: '/event.php', research: {enabled: options.enabled !== false}}),
            storage: {getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value)},
            setTimeout: (fn, ms) => {
                const timer = {fn, at: clock + ms};
                timers.push(timer);
                return timer;
            },
            clearTimeout: timer => {
                timers = timers.filter(other => other !== timer);
            },
            warn: error => {
                throw error;
            },
            describeBox: () => ({inputType: 'algebraic'}),
            send: batch => {
                sent.push(...batch);
                return options.response || {success: true};
            }
        })
    };
    return tab;
};

const answerBox = value => ({name: 'q43:4_ans1', value});
const settle = () => new Promise(resolve => setImmediate(resolve));

test('the acceptance scenario can be rebuilt from the event trace alone', async () => {
    const tab = createTab();

    // Page 1: photo, OCR mistake, fix in the candidate line, insert, Check.
    let research = tab.load();
    let box = answerBox('');
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
    assert.ok(research.pendingSubmit(box));
    research.log(box, 'feedback_observed', {state: 'incorrect'}, {input: null, modality: null});
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
    research.log(answerBox(box.value), 'feedback_observed', {state: 'correct'}, {input: null, modality: null});
    research.flush(true);
    await settle();

    assert.deepEqual(tab.sent.map(event => event.type), [
        'interaction_started', 'recognition_started', 'recognition_completed', 'edit_committed',
        'validation_completed', 'answer_inserted', 'submit_triggered',
        'interaction_started', 'feedback_observed', 'revision_started', 'edit_committed',
        'validation_completed', 'submit_triggered',
        'interaction_started', 'feedback_observed'
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
    assert.deepEqual(tab.sent.map(event => event.type), ['interaction_started']);
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
    assert.deepEqual(tab.sent.map(event => [event.type, event.payload.trigger]), [
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
