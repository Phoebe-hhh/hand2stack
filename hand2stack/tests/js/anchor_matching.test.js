// This file is part of Moodle - http://moodle.org/.
// SPDX-License-Identifier: GPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pluginRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(pluginRoot, 'amd/src/main.js'), 'utf8');

// Pull the real function bodies out of main.js by brace-counting from each
// `const <name> = ... => {` declaration, so these tests exercise the exact
// code that ships rather than a re-typed copy that could drift from it.
function extractFunctionSource(name) {
    const marker = `const ${name} = `;
    const start = source.indexOf(marker);
    assert.ok(start >= 0, `${name} not found in amd/src/main.js`);
    const braceStart = source.indexOf('{', start);
    let depth = 0;
    let end = -1;
    for (let i = braceStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}') {
            depth--;
            if (depth === 0) {
                end = i + 1;
                break;
            }
        }
    }
    assert.ok(end > braceStart, `could not find end of ${name}`);
    return source.slice(start, end) + ';';
}

const sandbox = (0, eval)(`(function() {
    ${extractFunctionSource('normalizeAnchorText')}
    ${extractFunctionSource('extractAnchoredValue')}
    return {normalizeAnchorText, extractAnchoredValue};
})()`);
const {normalizeAnchorText, extractAnchoredValue} = sandbox;

test('normalizeAnchorText strips math delimiters, whitespace and a trailing =', () => {
    assert.equal(normalizeAnchorText('f(2) = '), 'f(2)');
    assert.equal(normalizeAnchorText('\\(g(1)\\)='), 'g(1)');
    assert.equal(normalizeAnchorText(''), '');
});

test('extractAnchoredValue pulls the answer after an approximate relation', () => {
    assert.equal(extractAnchoredValue('f(2)=', 'f(2)~~1+2*sqrt(2)'), '1+2*sqrt(2)');
});

test('extractAnchoredValue drops a restated decimal after a second =', () => {
    // This is the exact line shape that defeats a naive "last expression"
    // extractor: the approximate symbol plus a trailing "=2.71" restatement.
    assert.equal(extractAnchoredValue('g(1)=', 'g(1)~~2+1/sqrt(2)=2.71'), '2+1/sqrt(2)');
});

test('extractAnchoredValue ignores lines that do not start with the anchor', () => {
    // Trailing commentary in the same free-text answer must not be mistaken
    // for the f(2) line just because it is the last line in the document.
    assert.equal(
        extractAnchoredValue('f(2)=', 'Note. the first expression is only valid when not(x=-1).'),
        null
    );
});

test('extractAnchoredValue requires a relation marker right after the anchor', () => {
    assert.equal(extractAnchoredValue('h(3)=', 'f(2)=1'), null);
    assert.equal(extractAnchoredValue('f(2)=', 'f(2)isafunction'), null);
});

// applyMatchedAnswers touches the DOM and the network (sibling lookup,
// server-side validation), so build it with those dependencies stubbed out
// while keeping the real matching/extraction code it closes over.
const buildApplyMatchedAnswers = (0, eval)(`(function(isFreeTextInput, findSiblingAnswerBoxes, postLatex, setAnswerValue, flashAutofilledBox) {
    ${extractFunctionSource('normalizeAnchorText')}
    ${extractFunctionSource('matchableLineText')}
    ${extractFunctionSource('extractAnchoredValue')}
    ${extractFunctionSource('applyMatchedAnswers')}
    return applyMatchedAnswers;
})`);

test('applyMatchedAnswers prefers a later restated line over an earlier derivation step', async () => {
    // Mirrors a real free-text answer: the student first derives g(1) with
    // "=", then restates it later with "~~" as their final answer. The
    // restated line must win, not whichever one appears first.
    const calls = [];
    const fakeBox = {id: 'ans_g1', dataset: {stackinputhelperAnchor: 'g(1)='}};
    const applyMatchedAnswers = buildApplyMatchedAnswers(
        box => box === 'SOURCE',
        () => [fakeBox],
        async latex => latex,
        (box, value) => calls.push([box.id, value]),
        () => {}
    );

    const lines = [
        {math: 'g(1)=2*sin((%pi)/2)^2+1/sqrt(2)'},
        {math: 'f(2)~~1+2*sqrt(2)'},
        {math: 'g(1)~~2+1/sqrt(2)=2.71'},
        {math: 'f(2)>g(1)'}
    ];

    await applyMatchedAnswers('SOURCE', lines);

    assert.deepEqual(calls, [['ans_g1', '2+1/sqrt(2)']]);
});

test('applyMatchedAnswers does nothing for a non-free-text source box', async () => {
    const calls = [];
    const applyMatchedAnswers = buildApplyMatchedAnswers(
        () => false,
        () => { throw new Error('should not look up siblings'); },
        async latex => latex,
        (box, value) => calls.push([box.id, value]),
        () => {}
    );

    await applyMatchedAnswers('SOURCE', [{math: 'f(2)=1'}]);

    assert.deepEqual(calls, []);
});

test('applyMatchedAnswers does not apply a stale recognition result', async () => {
    const calls = [];
    const fakeBox = {value: '', dataset: {stackinputhelperAnchor: 'f(2)='}};
    let resolveValidation;
    let current = true;
    const validation = new Promise(resolve => { resolveValidation = resolve; });
    const applyMatchedAnswers = buildApplyMatchedAnswers(
        () => true,
        () => [fakeBox],
        () => validation,
        (box, value) => calls.push([box, value]),
        () => {}
    );

    const pending = applyMatchedAnswers('SOURCE', [{math: 'f(2)=1'}], () => current);
    current = false;
    resolveValidation('1');
    await pending;

    assert.deepEqual(calls, []);
});

test('applyMatchedAnswers preserves an answer edited during validation', async () => {
    const calls = [];
    const fakeBox = {value: '', dataset: {stackinputhelperAnchor: 'f(2)='}};
    let resolveValidation;
    const validation = new Promise(resolve => { resolveValidation = resolve; });
    const applyMatchedAnswers = buildApplyMatchedAnswers(
        () => true,
        () => [fakeBox],
        () => validation,
        (box, value) => calls.push([box, value]),
        () => {}
    );

    const pending = applyMatchedAnswers('SOURCE', [{math: 'f(2)=1'}]);
    fakeBox.value = 'learner edit';
    resolveValidation('1');
    await pending;

    assert.deepEqual(calls, []);
});
