// This file is part of Moodle - http://moodle.org/.
//
// @package local_hand2stack
// @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../amd/src/main.js'), 'utf8');
const body = source.match(/const asciiToLatexPreview = value => \{([\s\S]*?)\n    \};/);
assert.ok(body, 'asciiToLatexPreview must remain available for regression tests');
// This evaluates only the extracted pure conversion function, with no DOM access.
const asciiToLatexPreview = Function('return value => {' + body[1] + '}')();
const delimiterBody = source.match(/const stripOuterMathDelimiters = value => \{([\s\S]*?)\n    \};/);
assert.ok(delimiterBody, 'stripOuterMathDelimiters must remain available for regression tests');
const stripOuterMathDelimiters = Function('return value => {' + delimiterBody[1] + '}')();
const splitBody = source.match(/const splitEmbeddedMathText = value => \{([\s\S]*?)\n    \};/);
assert.ok(splitBody, 'splitEmbeddedMathText must remain available for regression tests');
const splitEmbeddedMathText = Function(
    'stripOuterMathDelimiters',
    'return value => {' + splitBody[1] + '}'
)(stripOuterMathDelimiters);

test('nested OCR math delimiters are removed before MathJax rendering', () => {
    assert.equal(stripOuterMathDelimiters('\\(x=9\\)'), 'x=9');
    assert.equal(stripOuterMathDelimiters('\\(\\(x=9\\)\\)'), 'x=9');
    assert.equal(stripOuterMathDelimiters('\\[\\(x^2=1\\)\\]'), 'x^2=1');
    assert.equal(stripOuterMathDelimiters('$$x=9$$'), 'x=9');
});

test('embedded OCR delimiters split prose from renderable mathematics', () => {
    assert.deepEqual(splitEmbeddedMathText('for \\(3x-6+4=2x+7\\)'), [
        {type: 'text', text: 'for '},
        {type: 'math', latex: '3x-6+4=2x+7', text: '3x-6+4=2x+7'},
    ]);
    assert.deepEqual(splitEmbeddedMathText('so the ans is \\(\\(x=9\\)\\)'), [
        {type: 'text', text: 'so the ans is '},
        {type: 'math', latex: 'x=9', text: 'x=9'},
    ]);
});

test('edited inequalities render logical relations as mathematical symbols', () => {
    assert.equal(
        asciiToLatexPreview('0<=x+1 and x<2+1'),
        '0\\le x+1 \\mathrel{\\land} x<2+1'
    );
    assert.equal(
        asciiToLatexPreview('x<1 or x>3'),
        'x<1 \\mathrel{\\lor} x>3'
    );
});

test('matching interval clauses retain compact chained rendering', () => {
    assert.equal(
        asciiToLatexPreview('1<=x and x<=3*2x'),
        '1\\le x\\le 3\\cdot 2x'
    );
});

test('common edited STACK forms receive conventional LaTeX previews', () => {
    const cases = new Map([
        ['not(x=1)', '\\neg (x=1)'],
        ['x in [1,2]', 'x \\in  [1,2]'],
        ['sqrt(1+sqrt(x))', '\\sqrt{1+\\sqrt{x}}'],
        ['x^(a+1)', 'x^{a+1}'],
        ['1/2+x#1', '\\frac{1}{2}+x\\ne 1'],
        ['x~=2', 'x\\approx 2'],
        ['minf<x<inf', '-\\infty <x<\\infty '],
    ]);
    for (const [ascii, latex] of cases) {
        assert.equal(asciiToLatexPreview(ascii), latex, ascii);
    }
});
