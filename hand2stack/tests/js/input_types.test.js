// This file is part of Moodle - http://moodle.org/.
// SPDX-License-Identifier: GPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pluginRoot = path.resolve(__dirname, '../..');
const source = require('./amd_source');
const hook = fs.readFileSync(path.join(pluginRoot, 'classes/local/hook_callbacks.php'), 'utf8');
const mathpix = fs.readFileSync(path.join(pluginRoot, 'classes/ocr/mathpix_client.php'), 'utf8');

// A declaration from the AMD modules: up to its first top-level semicolon.
const constSource = name => {
    const start = source.indexOf(`const ${name} = `);
    assert.ok(start >= 0, `${name} not found in amd/src`);
    let depth = 0;
    for (let i = start; i < source.length; i++) {
        if ('([{'.includes(source[i])) depth++;
        if (')]}'.includes(source[i])) depth--;
        if (source[i] === ';' && depth === 0) return source.slice(start, i + 1);
    }
    assert.fail(`could not find end of ${name}`);
};

const isSupportedAnswerBox = (0, eval)(`(function() {
    ${constSource('SUPPORTED_INPUT_TYPES')}
    ${constSource('isSupportedAnswerBox')}
    return isSupportedAnswerBox;
})()`);

const isEditableAnswerBox = (0, eval)(`(function() {
    ${constSource('isEditableAnswerBox')}
    return isEditableAnswerBox;
})()`);

// The attributes STACK 4.13 renders for each input type.
const box = (tagName, type, stackInputType) => ({tagName, type, dataset: {stackInputType}});

test('typed STACK inputs receive capture buttons', () => {
    for (const type of ['algebraic', 'numerical', 'units', 'string']) {
        assert.equal(isSupportedAnswerBox(box('INPUT', 'text', type)), true, type);
    }
    for (const type of ['textarea', 'equiv', 'notes', 'freetext']) {
        assert.equal(isSupportedAnswerBox(box('TEXTAREA', undefined, type)), true, type);
    }
});

test('choice and matrix inputs are never treated as answer boxes', () => {
    // Overwriting a radio or checkbox value would change the submitted choice key.
    assert.equal(isSupportedAnswerBox(box('INPUT', 'radio', 'radio')), false);
    assert.equal(isSupportedAnswerBox(box('INPUT', 'checkbox', 'checkbox')), false);
    assert.equal(isSupportedAnswerBox(box('SELECT', undefined, 'dropdown')), false);
    // Every matrix cell carries data-stack-input-type="matrix".
    assert.equal(isSupportedAnswerBox(box('INPUT', 'text', 'matrix')), false);
    assert.equal(isSupportedAnswerBox(box('INPUT', 'text', 'varmatrix')), false);
    assert.equal(isSupportedAnswerBox(box('INPUT', 'text', 'singlechar')), false);
    assert.equal(isSupportedAnswerBox(box('INPUT', 'hidden', 'algebraic')), false);
});

test('read-only and disabled answer boxes receive no capture buttons', () => {
    // A review page, or an answer locked after Check, would show an inserted
    // value that is never submitted.
    assert.equal(isEditableAnswerBox({readOnly: false, disabled: false}), true);
    assert.equal(isEditableAnswerBox({readOnly: true, disabled: false}), false);
    assert.equal(isEditableAnswerBox({readOnly: false, disabled: true}), false);
    assert.match(constSource('findAnswerBoxes'), /isEditableAnswerBox\(input\)/);
});

test('Mathpix requests go through Moodle\'s HTTP client, so the site proxy applies', () => {
    assert.doesNotMatch(mathpix, /curl_init\(/);
    assert.match(mathpix, /new \\curl\(\)/);
    assert.equal((mathpix.match(/self::post\(self::(STROKES_)?ENDPOINT/g) || []).length, 2);
});

test('the plugin loads on the Moodle 4.x question preview page', () => {
    assert.match(hook, /'\/question\/bank\/previewquestion\/preview\.php'/);
    assert.doesNotMatch(hook, /'\/question\/preview\.php'/);
});

test('Mathpix is asked not to keep learner images for training', () => {
    const optOuts = mathpix.match(/'metadata' => \['improve_mathpix' => false\]/g) || [];
    assert.equal(optOuts.length, 2, 'both the image and the strokes request opt out');
});
