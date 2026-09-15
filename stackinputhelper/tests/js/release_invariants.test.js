// This file is part of Moodle - http://moodle.org/.
// SPDX-License-Identifier: GPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pluginRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(pluginRoot, 'amd/src/main.js'), 'utf8');
const hook = fs.readFileSync(path.join(pluginRoot, 'classes/local/hook_callbacks.php'), 'utf8');
const endpoints = [
    'recognize.php', 'strokes.php', 'convert.php',
    'session_create.php', 'session_result.php', 'mobile_upload.php'
].map(file => fs.readFileSync(path.join(pluginRoot, file), 'utf8'));
const scheduledTasks = fs.readFileSync(path.join(pluginRoot, 'db/tasks.php'), 'utf8');
const cleanupTask = fs.readFileSync(path.join(pluginRoot, 'classes/task/cleanup_sessions.php'), 'utf8');

test('mobile QR generation does not use a third-party QR service', () => {
    assert.doesNotMatch(source, /api\.qrserver\.com|create-qr-code/);
    assert.match(source, /buildQrDataUrl/);
});

test('fallback endpoints respect Moodle installations in a subdirectory', () => {
    assert.match(source, /M\.cfg\.wwwroot/);
    assert.doesNotMatch(source, /window\.location\.origin \+ '\/local\/stackinputhelper\/'/);
});

test('image upload stays separate while phones and tablets use the camera button', () => {
    assert.match(source, /fileInput\.accept = 'image\/\*'/);
    assert.match(source, /const fileInput = createHiddenFileInput\(false\)/);
    assert.match(source, /const isMobileOrTablet = isIPadWebKit/);
    assert.match(source, /Android\|Mobile\|Tablet/);
    assert.match(source, /const cameraInput = isMobileOrTablet \? createHiddenFileInput\(true\) : null/);
    assert.match(source, /if \(capture\) fileInput\.setAttribute\('capture', 'environment'\)/);
    assert.match(source, /if \(cameraInput\)[\s\S]*selectInputMode\('camera'\)/);
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

test('handwriting canvas accepts finger input without turning strokes into page scrolling', () => {
    assert.match(source, /touch-action:none/);
    assert.match(source, /overscroll-behavior:contain/);
    assert.doesNotMatch(source, /canvas\.style\.touchAction/);
    assert.doesNotMatch(source, /setPointerCapture|releasePointerCapture/);
    assert.match(source, /event\.pointerType === 'mouse' && event\.button !== 0/);
    assert.match(source, /const drawingTouch =/);
    assert.doesNotMatch(source, /touch\.touchType === 'stylus'/);
    assert.match(source, /isIPadWebKit && \(event\.pointerType === 'touch' \|\| event\.pointerType === 'pen'\)/);
    assert.match(source, /addEventListener\('touchmove'.*\{passive: false\}/s);
});

test('handwriting canvas has a touch-friendly vertical resize handle', () => {
    assert.match(source, /resizeHandle\.style\.cssText = .*cursor:ns-resize;touch-action:none/);
    assert.match(source, /resizeHandle\.addEventListener\('pointerdown'/);
    assert.match(source, /Math\.max\(260, Math\.min\(1200,/);
    assert.match(hook, /'resizehandwriting' => get_string\('resizehandwriting'/);
});

test('resizing expands the canvas backing store instead of stretching handwriting', () => {
    assert.match(source, /canvas\.height = Math\.round\(nextHeight \* canvas\.width \/ renderedWidth\)/);
    assert.match(source, /canvas\.height = Math\.round[\s\S]*?redraw\(\)/);
});

test('canvas backing dimensions are synchronized before the first stroke', () => {
    assert.match(source, /const syncEmptyCanvasBackingStore = \(\) =>/);
    assert.match(source, /expectedHeight = Math\.round\(rect\.height \* canvas\.width \/ rect\.width\)/);
    assert.match(source, /const startStroke[\s\S]*?syncEmptyCanvasBackingStore\(\);[\s\S]*?canvasRect = canvas\.getBoundingClientRect\(\)/);
});

test('an eraser miss does not consume an undo step', () => {
    assert.match(source, /stroke\.changed = eraseAt\(point\) \|\| stroke\.changed/);
    assert.match(source, /active\.erasing && !active\.changed\) history\.pop\(\)/);
});

test('plugin is loaded through the Moodle AMD API without inline configuration', () => {
    assert.match(hook, /js_call_amd\('local_stackinputhelper\/main', 'init'/);
    assert.doesNotMatch(hook, /<script|console\.log/);
});

test('API endpoints do not expose internal exception messages', () => {
    endpoints.forEach(endpoint => {
        assert.match(endpoint, /api_response::send_error\(\$error\)/);
        assert.doesNotMatch(endpoint, /'error'\s*=>\s*\$error->getMessage\(\)/);
    });
});

test('expired mobile sessions have a scheduled cleanup task', () => {
    assert.match(scheduledTasks, /local_stackinputhelper\\\\task\\\\cleanup_sessions/);
    assert.match(cleanupTask, /delete_records_select\('local_stackinputhelper_sess', 'expiresat < \?'/);
});
