// This file is part of Moodle - http://moodle.org/.
// SPDX-License-Identifier: GPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pluginRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(pluginRoot, 'amd/src/main.js'), 'utf8');
const hook = fs.readFileSync(path.join(pluginRoot, 'classes/local/hook_callbacks.php'), 'utf8');

test('mobile QR generation does not use a third-party QR service', () => {
    assert.doesNotMatch(source, /api\.qrserver\.com|create-qr-code/);
    assert.match(source, /buildQrDataUrl/);
});

test('result refresh aborts old document-level selection listeners', () => {
    const abortPosition = source.indexOf('panel._selectionAbortController.abort()');
    const replacementPosition = source.indexOf('panel._selectionAbortController = new AbortController()');
    assert.ok(abortPosition >= 0);
    assert.ok(replacementPosition > abortPosition);
    assert.match(source, /signal:\s*panel\._selectionAbortController\.signal/);
});

test('partial drag state blocks same-line whole-answer overwrite', () => {
    assert.match(source, /panel\._partialSelection\s*=\s*\{lineIndex, value: fallback\}/);
    assert.match(source, /panel\._partialSelection\.lineIndex === index/);
    assert.match(source, /isPartial && stack === fullLineStack/);
});

test('plugin is loaded through the Moodle AMD API without inline configuration', () => {
    assert.match(hook, /js_call_amd\('local_stackinputhelper\/main', 'init'/);
    assert.doesNotMatch(hook, /<script|console\.log/);
});
