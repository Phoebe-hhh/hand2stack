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

const helpers = (0, eval)(`(function() {
    ${extractFunctionSource('parseStackInputName')}
    ${extractFunctionSource('processInputName')}
    ${extractFunctionSource('isProcessInput')}
    ${extractFunctionSource('processValueForLines')}
    ${extractFunctionSource('processRowFromFreeText')}
    ${extractFunctionSource('processValueForFreeText')}
    return {isProcessInput, processValueForLines, processValueForFreeText};
})()`);

test('only process textareas opt in to the hidden diagnostic channel', () => {
    assert.equal(helpers.isProcessInput({tagName: 'TEXTAREA', name: 'q43:4_process'}), true);
    assert.equal(helpers.isProcessInput({tagName: 'TEXTAREA', name: 'q43:4_process2'}), true);
    assert.equal(helpers.isProcessInput({tagName: 'INPUT', name: 'q43:4_process'}), false);
    assert.equal(helpers.isProcessInput({tagName: 'TEXTAREA', name: 'q43:4_processing'}), false);
});

test('process data preserves order and omits prose and generated summaries', () => {
    const lines = [
        {type: 'condition', stack: 'x>=0'},
        {type: 'text', stack: ''},
        {type: 'equation', stack: 'x^2=1'},
        {type: 'expression', stack: '[x=1,y=2]', synthetic: true},
        {type: 'condition', stack: 'x>=1'}
    ];
    assert.equal(helpers.processValueForLines(lines), 'x>=0\nx^2=1\nx>=1');
});

test('free-text process data keeps only backtick rows, in order', () => {
    const text = 'Since `x^2-1=(x-1)*(x+1)` we cancel `x+1`. Therefore,\n'
        + '`f(x)=x-1+sqrt(x^2+4)`\n\nNext, let `x=2`.\n`\nf(2)=1+2*sqrt(2)\n\n2*sin(1)\n`';
    assert.equal(helpers.processValueForFreeText(text),
        'x^2-1=(x-1)*(x+1)\nx+1\nf(x)=x-1+sqrt(x^2+4)\nx=2\nf(2)=1+2*sqrt(2)\n2*sin(1)');
});

test('free-text process data reflects edits and ignores an unpaired backtick', () => {
    assert.equal(helpers.processValueForFreeText('I wrote `x>=1`, then `x<2'), 'x>=1');
    assert.equal(helpers.processValueForFreeText('no maths here'), '');
});

test('free-text process rows drop numbering and the approximation operator', () => {
    assert.equal(helpers.processValueForFreeText('`1. f(2)=1+2*sqrt(2)~~3.83`'), 'f(2)=1+2*sqrt(2)');
    assert.equal(helpers.processValueForFreeText('`g(1)~~2.71`'), 'g(1)=2.71');
    assert.equal(helpers.processValueForFreeText('`~~2.71`'), '2.71');
});
