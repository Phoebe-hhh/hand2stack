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
const convertEndpoint = fs.readFileSync(path.join(pluginRoot, 'convert.php'), 'utf8');
const apiResponse = fs.readFileSync(path.join(pluginRoot, 'classes/local/api_response.php'), 'utf8');
const limiter = fs.readFileSync(path.join(pluginRoot, 'classes/local/request_limiter.php'), 'utf8');
const mobilePage = fs.readFileSync(path.join(pluginRoot, 'mobile.php'), 'utf8');

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

test('free-text inputs preserve multiline AsciiMath instead of selecting one answer line', () => {
    assert.match(source, /dataset\.stackInputType[\s\S]*=== 'freetext'/);
    assert.match(source, /formatFreeTextWorking\(rawAscii, rawLatex, stackResult, lines\)/);
    assert.match(source, /return '`\\n' \+ working \+ '\\n`'/);
    assert.match(source, /panel\._options\.style\.display = freeTextMode \? 'none' : 'grid'/);
    assert.match(source, /panel\._stackTextarea\.rows = freeTextMode \? 8 : 1/);
});

test('free-text mode is configured with localized review labels', () => {
    assert.match(hook, /'recognizedworking' => get_string\('recognizedworking'/);
    assert.match(hook, /'freetextpreview' => get_string\('freetextpreview'/);
});

test('recognized lines have editable ASCII with independent selection and reset', () => {
    assert.match(source, /originalAscii:/);
    assert.match(source, /line\.edited = line\.ascii !== line\.originalAscii/);
    assert.match(source, /updateEditedControls\(\);\s*updateSelectedPreview\(\);\s*window\.clearTimeout\(line\._editTimer\)/);
    assert.match(source, /window\.setTimeout\(\(\) => \{\s*refreshCandidateLine\(index\);\s*\}, 250\)/);
    assert.match(source, /line\.ascii = line\.originalAscii/);
    assert.match(source, /selectedIndex = index;[\s\S]*updateSelectedPreview\(\)/);
    assert.doesNotMatch(source, /field\.addEventListener\('input'[\s\S]{0,500}selectedIndex = index/);
    assert.doesNotMatch(source, /window\.setTimeout\(\(\) => \{\s*renderFormatRows\(\)/);
    assert.match(source, /field\.value = line\.ascii;[\s\S]*field\.focus\(\)/);
});

test('single-line STACK answer inputs are compact', () => {
    assert.match(source, /answerBox\.tagName === 'INPUT'/);
    assert.match(source, /answerBox\.style\.width = 'min\(260px, 45vw\)'/);
});

test('conversion review distinguishes editable OCR from read-only STACK output', () => {
    assert.match(source, /config\.convertedstack \|\| 'Converted for STACK:'/);
    assert.match(source, /panel\._stackTextarea\.readOnly = !freeTextMode/);
    assert.match(source, /isDefault && resultLines\.length > 1/);
    assert.match(source, /stack\.replace\(\/\\b\(\[A-Za-z\]\)\\\(\/g, '\$1\*\('/);
    assert.match(hook, /'convertedstack' => get_string\('convertedstack'/);
});

test('algebraic review uses a responsive candidate-and-single-editor layout', () => {
    assert.match(source, /reviewGrid\.style\.display = 'grid'/);
    assert.match(source, /candidateColumn\.append\(title, instruction, options\)/);
    assert.match(source, /reviewGrid\.append\(candidateColumn, recognizedColumn\)/);
    assert.match(source, /recognizedColumn\.append\(editableHeader, formatRows, rawTextarea, convertedColumn, applyBtn, requestStatus\)/);
    assert.match(source, /panel\.style\.width = 'auto'[\s\S]*panel\.style\.maxWidth = '100%'/);
    assert.match(source, /!isMobileOrTablet && width >= 820[\s\S]*'minmax\(0, 1fr\) minmax\(0, 1fr\)'/);
    assert.match(source, /candidateColumn\.style\.overflow = 'hidden'/);
    assert.match(source, /container\.style\.overflowX = 'auto'/);
    assert.match(source, /new ResizeObserver\(updateReviewLayout\)/);
    assert.match(source, /panel\._candidateColumn\.style\.display = freeTextMode \? 'none' : 'block'/);
    assert.match(source, /const index = selectedIndex[\s\S]*const line = resultLines\[index\][\s\S]*panel\._formatRows\.appendChild\(row\)/);
    assert.doesNotMatch(source, /resultLines\.forEach\(\(line, index\) => \{[\s\S]*panel\._formatRows\.appendChild\(row\)/);
    assert.doesNotMatch(source, /field\.addEventListener\('focus', \(\) => panel\._activateLine/);
    assert.match(source, /convertedColumn\.style\.display = 'none'/);
    assert.match(source, /wrapper\.style\.minHeight = '38px'/);
    assert.match(source, /wrapper\.style\.borderRadius = '3px'/);
    assert.match(source, /selectionMarker\.style\.height = '38px'/);
    assert.match(source, /field\.style\.height = '38px'/);
    assert.match(source, /panel\._stackTextarea\.style\.height = freeTextMode \? '' : '38px'/);
    assert.match(source, /body\.style\.display = 'flex'/);
    assert.match(source, /line\._status\.textContent = statuses\.join\(' · '\)/);
    assert.match(source, /editedPreview\.textContent = [^\n]*line\.latex[^\n]*asciiToLatexPreview\(line\.ascii\)/);
    assert.match(source, /typesetMath\(line\._lineContent\)/);
    assert.match(source, /status\.style\.marginLeft = 'auto'/);
});

test('editing ASCII keeps the LaTeX review value synchronized', () => {
    assert.match(source, /const asciiToLatexPreview = value =>/);
    assert.match(source, /line\.latex = asciiToLatexPreview\(line\.ascii\)/);
    assert.match(source, /line\.latex = line\.originalLatex \|\| asciiToLatexPreview\(line\.ascii\)/);
});

test('insert recomputes the current selected value in STACK format', () => {
    assert.match(source, /const stackValueForLine = line =>/);
    assert.match(source, /if \(!line\.edited && line\.stack\) return line\.stack/);
    assert.match(source, /return clientSideStackFallback\(line\.ascii\) \|\| line\.ascii \|\| line\.stack/);
    assert.match(source, /let stackValue = panel\._partialSelection[\s\S]*stackValueForLine\(line\)/);
    assert.match(source, /stackValue = await postAscii\(ascii\)/);
    assert.match(source, /line\._validatedAscii = ascii/);
    assert.match(source, /panel\._stackTextarea\.value = stackValue;[\s\S]*setAnswerValue\(answerBox, stackValue\)/);
    assert.match(source, /updateEditedControls\(\);\s*updateSelectedPreview\(\);/);
});

test('edited ASCII is normalized and validated by STACK before insertion', () => {
    assert.match(source, /formData\.append\('ascii', ascii\)/);
    assert.match(convertEndpoint, /stack_converter::normalize_ascii\(\$ascii\)/);
    assert.match(convertEndpoint, /stack_ast_container::make_from_student_source/);
    assert.match(convertEndpoint, /\$ast->get_valid\(\)/);
});

test('only the latest recognition request may update the result panel', () => {
    assert.match(source, /const requestCoordinator = \{/);
    assert.match(source, /const requestId = requestCoordinator\.begin\(\)/);
    assert.match(source, /if \(!requestCoordinator\.isCurrent\(requestId\)\) return/);
    assert.match(source, /if \(inputMode !== 'mobile' \|\| !requestCoordinator\.isCurrent\(requestId\)\)/);
});

test('mobile polling is serialized, reports failures, and stops after repeated errors', () => {
    assert.match(source, /if \(mobilePollInFlight \|\| !requestCoordinator\.isCurrent/);
    assert.match(source, /mobilePollInFlight = true/);
    assert.match(source, /mobilePollFailures >= 3/);
    assert.match(source, /config\.pollingfailed/);
});

test('dynamic teardown releases document listeners and hidden file inputs', () => {
    assert.match(source, /const lifecycleController = new AbortController\(\)/);
    assert.match(source, /signal: lifecycleSignal/);
    assert.match(source, /new MutationObserver/);
    assert.match(source, /lifecycleController\.abort\(\)/);
    assert.match(source, /fileInput\.remove\(\)/);
});

test('candidate radios have associated visible labels', () => {
    assert.match(source, /const body = document\.createElement\('label'\)/);
    assert.match(source, /body\.htmlFor = optionId/);
});

test('recognition endpoints are rate limited and return safe actionable errors', () => {
    assert.match(limiter, /cache::make\('local_stackinputhelper', 'ratelimit'\)/);
    assert.match(limiter, /ratelimitexceeded/);
    assert.match(apiResponse, /SAFE_ERROR_CODES/);
    assert.match(apiResponse, /'error_code' => \$errorcode/);
    assert.match(endpoints[0], /request_limiter::enforce\(\)/);
    assert.match(endpoints[1], /request_limiter::enforce\(\)/);
    assert.match(endpoints[5], /request_limiter::enforce\(\)/);
});

test('expired mobile pages fail before asking the user to take a photo', () => {
    const expiryCheck = mobilePage.indexOf("throw new moodle_exception('sessionexpired'");
    const pageHeader = mobilePage.indexOf('$OUTPUT->header()');
    assert.ok(expiryCheck >= 0);
    assert.ok(pageHeader > expiryCheck);
});

test('candidate selection is delegated so MathJax updates cannot break the detail panel', () => {
    assert.match(source, /panel\._options\.addEventListener\('change'/);
    assert.match(source, /input\.dataset\.resultChoice = '1'/);
    assert.match(source, /selectLine\(index, resultLines\[index\]\)/);
    assert.match(source, /panel\._renderSelectedTimer = window\.setTimeout\(renderFormatRows, 0\)/);
    assert.doesNotMatch(source, /const selectLine = \(index, line\) => \{[\s\S]{0,400}selectLine\(index, resultLines\[index\]\)/);
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
    assert.match(source, /canvasWrapper\.style\.cssText = 'position:relative;width:100%'/);
    assert.match(source, /resizeHandle\.style\.cssText = 'position:absolute;right:2px;bottom:2px;[\s\S]*cursor:nwse-resize;touch-action:none/);
    assert.match(source, /canvasWrapper\.append\(canvas, resizeHandle\)/);
    assert.match(source, /resizeHandle\.addEventListener\('pointerdown'/);
    assert.match(source, /Math\.max\(260, Math\.min\(1200,/);
    assert.match(source, /resizeStartWidth \+ event\.clientX - resizeStartX/);
    assert.match(source, /panel\.style\.width = Math\.round\(nextWidth\) \+ 'px'/);
    assert.match(hook, /'resizehandwriting' => get_string\('resizehandwriting'/);
});

test('resizing expands the canvas backing store instead of stretching handwriting', () => {
    assert.match(source, /resizeScaleX = canvasBounds\.width > 0 \? canvas\.width \/ canvasBounds\.width : 1/);
    assert.match(source, /resizeScaleY = canvasBounds\.height > 0 \? canvas\.height \/ canvasBounds\.height : resizeScaleX/);
    assert.match(source, /canvas\.width = Math\.round\(resizedBounds\.width \* resizeScaleX\)/);
    assert.match(source, /canvas\.height = Math\.round\(resizedBounds\.height \* resizeScaleY\)/);
    assert.match(source, /canvas\.height = Math\.round[\s\S]*?redraw\(\)/);
});

test('canvas backing dimensions are synchronized before the first stroke', () => {
    assert.match(source, /const syncCanvasBackingStore = \(\) =>/);
    assert.match(source, /const syncEmptyCanvasBackingStore = \(\) =>/);
    assert.match(source, /expectedWidth = Math\.max\(1, Math\.round\(rect\.width \* canvasBackingScale\)\)/);
    assert.match(source, /expectedHeight = Math\.max\(1, Math\.round\(rect\.height \* canvasBackingScale\)\)/);
    assert.match(source, /const startStroke[\s\S]*?syncEmptyCanvasBackingStore\(\);[\s\S]*?canvasRect = canvas\.getBoundingClientRect\(\)/);
});

test('showing recognition results cannot stretch existing handwriting', () => {
    assert.match(source, /const canvasResizeObserver = new ResizeObserver/);
    assert.match(source, /canvasResizeObserver\.observe\(canvas\)/);
    assert.match(source, /syncCanvasBackingStore\(\)/);
    assert.match(source, /lifecycleSignal\.addEventListener\('abort', \(\) => canvasResizeObserver\.disconnect\(\)/);
    assert.match(source, /resultPanel\._layoutReference = handwritingPanel/);
    assert.match(source, /const referenceWidth = Math\.floor\(layoutReference\.getBoundingClientRect\(\)\.width\)/);
    assert.match(source, /layoutReference\.style\.width = referenceWidth \+ 'px'/);
    assert.match(source, /panel\.style\.width = referenceWidth \+ 'px'/);
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
