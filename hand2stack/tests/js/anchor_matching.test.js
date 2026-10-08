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
const silentResearch = {log: () => {}, clip: value => (value === null || value === undefined ? '' : String(value))};
const buildApplyMatchedAnswers = (0, eval)(`(function(isFreeTextInput, findSiblingAnswerBoxes, postLatex, setAnswerValue, flashAutofilledBox,
        research = ${'{'}log: () => {}, clip: value => (value === null || value === undefined ? '' : String(value))${'}'}) {
    ${extractFunctionSource('normalizeAnchorText')}
    ${extractFunctionSource('matchableLineText')}
    ${extractFunctionSource('matchableLineTexts')}
    ${extractFunctionSource('isProseAnchor')}
    ${extractFunctionSource('isMathLine')}
    ${extractFunctionSource('finalClause')}
    ${extractFunctionSource('extractAnchoredValue')}
    ${extractFunctionSource('extractAnchoredAnswers')}
    ${extractFunctionSource('applyMatchedAnswers')}
    return applyMatchedAnswers;
})`);

test('applyMatchedAnswers prefers a later restated line over an earlier derivation step', async () => {
    // Mirrors a real free-text answer: the student first derives g(1) with
    // "=", then restates it later with "~~" as their final answer. The
    // restated line must win, not whichever one appears first.
    const calls = [];
    const fakeBox = {id: 'ans_g1', dataset: {hand2stackAnchor: 'g(1)='}};
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
    const fakeBox = {value: '', dataset: {hand2stackAnchor: 'f(2)='}};
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
    const fakeBox = {value: '', dataset: {hand2stackAnchor: 'f(2)='}};
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

const extractAnchoredAnswers = (0, eval)(`(function() {
    ${extractFunctionSource('normalizeAnchorText')}
    ${extractFunctionSource('matchableLineText')}
    ${extractFunctionSource('matchableLineTexts')}
    ${extractFunctionSource('isProseAnchor')}
    ${extractFunctionSource('isMathLine')}
    ${extractFunctionSource('finalClause')}
    ${extractFunctionSource('extractAnchoredValue')}
    ${extractFunctionSource('extractAnchoredAnswers')}
    return extractAnchoredAnswers;
})()`);

test('extractAnchoredAnswers returns one structured result per anchor', () => {
    const lines = [
        {math: 'f(2)=\\frac{3}{2}'},
        {math: 'so g is larger'},
        {math: 'g(1)=2+\\frac{1}{\\sqrt{2}}'}
    ];
    assert.deepEqual(extractAnchoredAnswers(['f(2)=', 'g(1)=', 'h(3)='], lines), [
        {anchor: 'f(2)=', expr: '\\frac{3}{2}', lineIndex: 0},
        {anchor: 'g(1)=', expr: '2+\\frac{1}{\\sqrt{2}}', lineIndex: 2},
        {anchor: 'h(3)=', expr: null, lineIndex: -1}
    ]);
});

test('applyMatchedAnswers reports filled and missing targets', async () => {
    const reports = [];
    const found = {value: '', dataset: {hand2stackAnchor: 'f(2)='}};
    const missing = {value: '', dataset: {hand2stackAnchor: 'g(1)='}};
    const events = [];
    const applyMatchedAnswers = buildApplyMatchedAnswers(
        () => true,
        () => [found, missing],
        async latex => latex,
        () => {},
        () => {},
        Object.assign({}, silentResearch, {
            log: (box, type, payload) => events.push([box === found ? 'f' : 'g', type, payload.status || payload.valid])
        })
    );

    await applyMatchedAnswers('SOURCE', [{math: 'f(2)=1'}], () => true,
        (box, result) => reports.push([box === found ? 'f' : 'g', result.status, result.lineIndex]));

    assert.deepEqual(reports, [['f', 'filled', 0], ['g', 'notfound', -1]]);
    // Research events: validation, then the autofill outcome for each target.
    assert.deepEqual(events, [
        ['f', 'validation_completed', true],
        ['f', 'answer_inserted', 'filled'],
        ['g', 'answer_inserted', 'notfound']
    ]);
});

test('a colon label anchors a value, but ":=" does not', () => {
    assert.equal(extractAnchoredValue('Answer:', 'Answer: 1<x and x<=5'), '1<x and x<=5');
    // Full-width punctuation from Japanese input.
    assert.equal(extractAnchoredValue('答え：', '答え：x=3'), 'x=3');
    assert.equal(extractAnchoredValue('f(2)=', 'f(2)＝5'), '5');
    // After a colon the value may itself be an equation.
    assert.equal(extractAnchoredValue('Answer:', 'answer : x=3'), 'x=3');
    assert.equal(extractAnchoredValue('f(2)=', 'f(2):=3'), null);
});

test('a prose label is found in the recognized row when the maths dropped it', () => {
    const extractAnchoredAnswers = (0, eval)(`(function() {
        ${extractFunctionSource('normalizeAnchorText')}
        ${extractFunctionSource('matchableLineText')}
        ${extractFunctionSource('matchableLineTexts')}
    ${extractFunctionSource('isProseAnchor')}
    ${extractFunctionSource('isMathLine')}
    ${extractFunctionSource('finalClause')}
        ${extractFunctionSource('extractAnchoredValue')}
        ${extractFunctionSource('extractAnchoredAnswers')}
        return extractAnchoredAnswers;
    })()`);
    // Server rows for "But $x=1$ is not allowed." / "Answer: $1<x \leq 5$".
    const lines = [
        {math: 'x=1', raw: 'But $x=1$ is not allowed.'},
        {math: '1<x \\leq 5', raw: 'Answer: $1<x \\leq 5$'}
    ];
    assert.deepEqual(extractAnchoredAnswers(['Answer:'], lines), [
        {anchor: 'Answer:', expr: '$1<x \\leq 5$', lineIndex: 1}
    ]);
});

test('an answer box drops its own label hint from an inserted value', () => {
    const stripOwnAnchor = (0, eval)(`(function() {
        ${extractFunctionSource('normalizeAnchorText')}
        ${extractFunctionSource('extractAnchoredValue')}
        ${extractFunctionSource('stripOwnAnchor')}
        return stripOwnAnchor;
    })()`);
    assert.equal(stripOwnAnchor('x=', 'x=3'), '3');
    assert.equal(stripOwnAnchor('x=', 'x = -1/2'), '-1/2');
    assert.equal(stripOwnAnchor('f(2)=', 'f(2)=1+2*sqrt(2)'), '1+2*sqrt(2)');
    // Anything that is not "label = value" is inserted unchanged.
    assert.equal(stripOwnAnchor('x=', 'x=2 or x=3'), 'x=2 or x=3');
    assert.equal(stripOwnAnchor('x=', 'x^2=9'), 'x^2=9');
    assert.equal(stripOwnAnchor('x=', '3'), '3');
    assert.equal(stripOwnAnchor('y=', 'x=3'), 'x=3');
});

test('a missing prose label falls back to the last mathematical line', () => {
    const extract = (0, eval)(`(function() {
        ${extractFunctionSource('normalizeAnchorText')}
        ${extractFunctionSource('matchableLineText')}
        ${extractFunctionSource('matchableLineTexts')}
        ${extractFunctionSource('isProseAnchor')}
        ${extractFunctionSource('isMathLine')}
        ${extractFunctionSource('finalClause')}
        ${extractFunctionSource('extractAnchoredValue')}
        ${extractFunctionSource('extractAnchoredAnswers')}
        return extractAnchoredAnswers;
    })()`);
    // Server rows for the 2026-10-07 attempt: the final answer is underlined,
    // not labelled, and the working ends with a prose-only row.
    const lines = [
        {type: 'expression', math: 'x-1', raw: 'Multiply both side by $x-1$'},
        {type: 'condition', math: 'x+3 \\geq 2(x-1)', raw: 'x+3 \\geq 2(x-1)'},
        {type: 'condition', math: 'x \\leq 5', raw: 'x \\leq 5'},
        {type: 'equation', math: 'x=1', raw: 'But $x=1$ not allowed,'},
        {type: 'condition', math: '1<x \\leq 5', raw: '1<x \\leq 5'},
        {type: 'text', math: '', raw: 'Thank you'}
    ];
    assert.deepEqual(extract(['Answer:'], lines), [
        {anchor: 'Answer:', expr: '1<x \\leq 5', lineIndex: 4, fallback: true}
    ]);

    // A specific label such as f(2) never guesses.
    assert.deepEqual(extract(['f(2)='], lines), [{anchor: 'f(2)=', expr: null, lineIndex: -1}]);

    // A written label still wins, and its line is not reused by a fallback.
    const labelled = lines.concat([{type: 'condition', math: '1<x \\leq 5', raw: 'Answer: $1<x \\leq 5$'}]);
    assert.deepEqual(extract(['Answer:'], labelled), [
        {anchor: 'Answer:', expr: '$1<x \\leq 5$', lineIndex: 6}
    ]);
    const twoLabels = extract(['Answer:', 'Final answer:'], labelled);
    assert.equal(twoLabels[0].lineIndex, 6);
    assert.deepEqual([twoLabels[1].lineIndex, twoLabels[1].fallback], [4, true]);
});

test('a last-line fallback takes the conclusion after its conditions', () => {
    const extract = (0, eval)(`(function() {
        ${extractFunctionSource('normalizeAnchorText')}
        ${extractFunctionSource('matchableLineText')}
        ${extractFunctionSource('matchableLineTexts')}
        ${extractFunctionSource('isProseAnchor')}
        ${extractFunctionSource('isMathLine')}
        ${extractFunctionSource('finalClause')}
        ${extractFunctionSource('extractAnchoredValue')}
        ${extractFunctionSource('extractAnchoredAnswers')}
        return extractAnchoredAnswers;
    })()`);
    const lastLine = math => extract(['Answer:'], [
        {type: 'equation', math: 'x=-2 \\text { or } x=4'},
        {type: 'equation', math, raw: 'Since $' + math + '$'}
    ])[0].expr;
    // 2026-10-08 attempt: "Since x>2, x=4" with the answer underlined.
    assert.equal(lastLine('x>2, x=4'), 'x=4');
    assert.equal(lastLine('x>2, \\quad x=4'), 'x=4');
    assert.equal(lastLine('x \\geq 0, x \\neq 1, x=3'), 'x=3');
    // Two solutions, a list, a point or a bare condition stay whole.
    assert.equal(lastLine('x=2, x=3'), 'x=2, x=3');
    assert.equal(lastLine('x=2, 3'), 'x=2, 3');
    assert.equal(lastLine('(x, y)=(1,2)'), '(x, y)=(1,2)');
    assert.equal(lastLine('x>2, x<5'), 'x>2, x<5');
    assert.equal(lastLine('x \\leq 5'), 'x \\leq 5');
});

test('only prose labels are allowed to fall back', () => {
    const isProseAnchor = (0, eval)(`(function() {
        ${extractFunctionSource('normalizeAnchorText')}
        ${extractFunctionSource('isProseAnchor')}
        return isProseAnchor;
    })()`);
    ['Answer:', 'Final answer:', 'answer =', '答え：', '解答:'].forEach(anchor => assert.equal(isProseAnchor(anchor), true, anchor));
    ['f(2)=', 'g(1)=', 'x=', 'x_1=', 'a+b='].forEach(anchor => assert.equal(isProseAnchor(anchor), false, anchor));
});

test('applyMatchedAnswers marks a last-line fallback for checking', async () => {
    const reports = [];
    const events = [];
    const box = {value: '', dataset: {hand2stackAnchor: 'Answer:'}};
    const applyMatchedAnswers = buildApplyMatchedAnswers(
        () => true,
        () => [box],
        async () => '1<x and x<=5',
        (target, value) => { target.value = value; },
        () => {},
        Object.assign({}, silentResearch, {log: (target, type, payload) => events.push([type, payload.status])})
    );
    await applyMatchedAnswers('SOURCE', [{type: 'condition', math: '1<x \\leq 5'}], () => true,
        (target, result) => reports.push([result.status, result.lineIndex]));
    assert.equal(box.value, '1<x and x<=5');
    assert.deepEqual(reports, [['fallback_last_line', 0]]);
    assert.deepEqual(events.at(-1), ['answer_inserted', 'fallback_last_line']);
});

test('linesFromFreeText reads the edited working line by line', () => {
    const linesFromFreeText = (0, eval)(`(function() {
        ${extractFunctionSource('linesFromFreeText')}
        return linesFromFreeText;
    })()`);
    assert.deepEqual(linesFromFreeText('`x^2-2*x-3=0`\n\nSince `x>2`,\n`x=4`\nAnswer: `x=4`\n`x>0`, so `x>2`.\nThank you'), [
        {type: 'expression', math: 'x^2-2*x-3=0', raw: 'x^2-2*x-3=0'},
        {type: 'expression', math: 'x>2', raw: 'Since x>2,'},
        {type: 'expression', math: 'x=4', raw: 'x=4'},
        {type: 'expression', math: 'x=4', raw: 'Answer: x=4'},
        {type: 'expression', math: 'x>2', raw: 'x>0, so x>2.'},
        {type: 'text', math: '', raw: 'Thank you'}
    ]);
    // A backtick block over several lines, and an unpaired backtick mid-edit.
    assert.deepEqual(linesFromFreeText('`\nx=1\nx=2\n`').map(line => line.math), ['x=1', 'x=2']);
    assert.deepEqual(linesFromFreeText('`x=1`\n`x=').map(line => line.math), ['x=1', '']);
});

test('editing the working updates a box only while the learner has not typed in it', async () => {
    const linesFromFreeText = (0, eval)(`(function() {
        ${extractFunctionSource('linesFromFreeText')}
        return linesFromFreeText;
    })()`);
    const converted = [];
    const box = {value: 'x=3', dataset: {hand2stackAnchor: 'Answer:'},
        _hand2stackExtraction: {recognized: 'x=3'}};
    const applyMatchedAnswers = buildApplyMatchedAnswers(
        () => true,
        () => [box],
        async () => { throw new Error('the LaTeX converter must not be used for edited working'); },
        (target, value) => { target.value = value; },
        () => {}
    );
    const edit = text => applyMatchedAnswers('SOURCE', linesFromFreeText(text), () => true,
        (target, result) => { target._hand2stackExtraction = {recognized: result.expr}; },
        {convert: async ascii => { converted.push(ascii); return ascii; }, via: 'freetext_edit', followEdits: true});

    // The screenshot case: the learner corrects the last line from x=3 to x=4.
    await edit('`x^2-2*x-3=0`\n\nSince `x>2`,\n`x=4`');
    assert.equal(box.value, 'x=4');
    // Editing another line leaves the unchanged answer alone (no re-validation).
    await edit('`x^2-2*x-8=0`\n\nSince `x>2`,\n`x=4`');
    assert.deepEqual(converted, ['x=4']);
    // Once the learner types in the answer box, it is theirs.
    box.dataset.hand2stackStudentEdited = '1';
    await edit('`x^2-2*x-8=0`\n\nSince `x>2`,\n`x=5`');
    assert.equal(box.value, 'x=4');
});
