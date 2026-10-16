// This file is part of Moodle - http://moodle.org/.
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// @package local_hand2stack
// @copyright 2026 Phoebe Huang
// @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later

/**
 * Filling the review panel with a recognition result.
 *
 * @module local_hand2stack/ui/result_view
 */
define([
    'local_hand2stack/config',
    'local_hand2stack/core/stack_inputs',
    'local_hand2stack/core/research',
    'local_hand2stack/core/api',
    'local_hand2stack/core/math_text',
    'local_hand2stack/core/saved_result',
    'local_hand2stack/ui/math_render',
    'local_hand2stack/ui/formula_select',
    'local_hand2stack/ui/change_highlighter',
    'local_hand2stack/ui/result_panel',
    'local_hand2stack/modes/lines',
    'local_hand2stack/modes/freetext/working',
    'local_hand2stack/modes/freetext/anchors'
], function(
    Config, StackInputs, Research, Api, MathText, SavedResult, MathRender, FormulaSelect,
    ChangeHighlighter, ResultPanel, Lines, Working, Anchors
) {
    const {config} = Config;
    const {
        setAnswerValue, setBackgroundValue, findProcessInput, processValueForLines, syncProcessInput,
        isFreeTextInput
    } = StackInputs;
    const {research} = Research;
    const {postAscii} = Api;
    const {asciiToLatexPreview, normalizeResultLines, clientSideStackFallback} = MathText;
    const {saveRecognitionResult, saveFreeTextWorking} = SavedResult;
    const {typesetMath} = MathRender;
    const {setupInteractiveFormula, clearFormulaSelections} = FormulaSelect;
    const {createChangeHighlighter} = ChangeHighlighter;
    const {setRequestStatus} = ResultPanel;
    const {createLineContent} = Lines;
    const {linesFromFreeText, formatFreeTextWorking} = Working;
    const {applyMatchedAnswers, reportTargetResult} = Anchors;

    const updateResultPanel = (panel, rawLatex, rawAscii, stackResult, answerBox, lines, recognizedText = '', sourceUrl = '',
            {restore = false, savedWorking = null} = {}) => {
        // A restored panel shows the result the saved answer came from; it is
        // not a new recognition, so it neither logs nor rewrites any answer.
        if (!restore) {
            // Only the Free-text panel shows the source image.
            saveRecognitionResult(answerBox, {rawLatex, rawAscii, stackResult, lines, recognizedText,
                sourceUrl: isFreeTextInput(answerBox) ? sourceUrl : ''});
        }
        setRequestStatus(panel);
        window.clearTimeout(panel._dragConversionTimer);
        panel._selectionRequestId = (panel._selectionRequestId || 0) + 1;
        if (panel._selectionAbortController) {
            panel._selectionAbortController.abort();
        }
        (panel._interactiveControllers || []).forEach(controller => controller.abort());
        panel._interactiveControllers = [];
        panel._selectionAbortController = new AbortController();
        const freeTextMode = isFreeTextInput(answerBox);
        const layoutReference = panel._layoutReference;
        if (!freeTextMode && layoutReference && layoutReference.offsetParent !== null) {
            const referenceWidth = Math.floor(layoutReference.getBoundingClientRect().width);
            if (referenceWidth > 0) {
                // Freeze both panels at the pre-recognition width. Result content
                // must never participate in sizing the Moodle question container.
                layoutReference.style.width = referenceWidth + 'px';
                layoutReference.style.maxWidth = '100%';
                panel.style.width = referenceWidth + 'px';
                panel.style.maxWidth = '100%';
            }
        }
        panel.style.display = 'block';
        panel._freeTextMode = freeTextMode;
        panel.style.padding = freeTextMode ? '20px' : '12px';
        panel.style.borderRadius = freeTextMode ? '10px' : '6px';
        panel.style.background = freeTextMode ? '#fff' : '#f8fbfd';
        panel.style.width = freeTextMode ? '100%' : panel.style.width;
        panel._freeTextHeader.style.display = freeTextMode ? 'flex' : 'none';
        panel._instruction.textContent = freeTextMode
            ? (config.recognizedworking || 'Recognized mathematical working. Review or edit it before inserting:')
            : (config.selectanswer || 'Select the answer to insert into STACK:');
        panel._options.style.display = freeTextMode ? 'none' : 'grid';
        panel._formatTitle.style.display = freeTextMode ? 'none' : 'block';
        panel._formatTabs.style.display = freeTextMode ? 'none' : 'flex';
        panel._formatRows.style.display = freeTextMode ? 'none' : 'grid';
        panel._editableHeader.style.display = freeTextMode ? 'none' : 'flex';
        // A mobile upload brings back no image, so a Free-text panel without
        // one leaves out the empty "Original work" column.
        panel._candidateColumn.style.display = freeTextMode && !sourceUrl ? 'none' : 'block';
        panel._sourceTitle.style.display = freeTextMode && sourceUrl ? 'block' : 'none';
        panel._sourceViewer.style.display = freeTextMode && sourceUrl ? 'block' : 'none';
        panel._sourcePreview.src = freeTextMode && sourceUrl ? sourceUrl : '';
        if (freeTextMode && sourceUrl) panel._resetImageView();
        panel._instruction.style.display = freeTextMode ? 'none' : 'block';
        panel._candidateColumn.firstChild.style.display = freeTextMode ? 'none' : 'block';
        panel._recognizedColumn.style.display = 'block';
        panel._reviewGrid.style.display = 'grid';
        panel._reviewGrid.style.gridTemplateColumns = freeTextMode ? '1fr' : panel._reviewGrid.style.gridTemplateColumns;
        panel._convertedColumn.style.paddingTop = freeTextMode ? '0' : '10px';
        panel._convertedColumn.style.borderTop = freeTextMode ? '0' : '1px solid #e2e6ea';
        panel._convertedColumn.style.marginTop = freeTextMode ? '0' : '10px';
        // The line-by-line review shows, read-only, the value Insert will put
        // in the answer box, so the learner confirms what is inserted.
        panel._convertedColumn.style.display = 'block';
        if (!freeTextMode || sourceUrl) panel._updateReviewLayout();
        panel._stackTitle.textContent = freeTextMode
            ? (config.recognizedfullanswer || 'Complete recognized answer · editable')
            : (config.convertedstack || 'Converted for STACK:');
        panel._stackTextarea.rows = freeTextMode ? 14 : 1;
        panel._stackTextarea.readOnly = !freeTextMode;
        panel._stackTextarea.style.resize = freeTextMode ? '' : 'none';
        panel._stackTextarea.style.height = freeTextMode ? '' : '38px';
        panel._stackTextarea.style.minHeight = freeTextMode ? '' : '38px';
        panel._stackTextarea.style.background = freeTextMode ? 'transparent' : '#f3f6f8';
        panel._stackTextarea.style.fontFamily = freeTextMode ? 'inherit' : 'monospace';
        panel._stackTextarea.style.fontSize = freeTextMode ? '16px' : '13px';
        panel._stackTextarea.style.lineHeight = freeTextMode ? '1.65' : '';
        panel._stackTextarea.style.color = freeTextMode ? 'transparent' : '';
        panel._stackTextarea.style.webkitTextFillColor = freeTextMode ? 'transparent' : '';
        panel._stackTextarea.style.caretColor = freeTextMode ? '#111827' : '';
        panel._changeHighlighter.backdrop.style.display = freeTextMode ? 'block' : 'none';
        panel._freeTextHelp.style.display = freeTextMode ? 'block' : 'none';
        panel._actionButtons.style.display = freeTextMode ? 'none' : 'flex';
        const resultLines = normalizeResultLines(rawLatex, stackResult, lines);
        const recognition = panel._hand2stackRecognition || null;
        panel._hand2stackRecognition = null;
        panel._hand2stackAnswerBox = answerBox;
        panel._hand2stackLastPartial = '';
        if (recognition) panel._hand2stackSource = recognition.source;
        (panel._hand2stackTrackers || []).forEach(tracker => tracker.dispose());
        panel._hand2stackTrackers = [];
        const logOptions = () => ({modality: panel._hand2stackSource || null});
        const logRecognition = defaultIndex => {
            if (!recognition) return;
            research.log(answerBox, 'recognition_completed', {
                requestId: recognition.requestId,
                source: recognition.source,
                ok: true,
                errorCode: null,
                latencyMs: recognition.latencyMs,
                mode: freeTextMode ? 'freetext' : 'lines',
                ocr: {
                    rawLatex: research.clip(rawLatex, 8000),
                    rawAscii: research.clip(rawAscii, 8000),
                    text: research.clip(recognizedText, 8000)
                },
                converted: {stack: research.clip(stackResult)},
                lines: resultLines.slice(0, 50).map((line, index) => ({
                    index,
                    type: line.type,
                    latex: research.clip(line.originalLatex),
                    ascii: research.clip(line.originalAscii),
                    stack: research.clip(line.stack),
                    synthetic: Boolean(line.synthetic)
                })),
                truncatedLines: resultLines.length > 50,
                defaultIndex
            }, logOptions());
        };
        // The process input holds the working behind the inserted answer: it
        // is written on Insert, then follows every edit of that working.
        // Recognizing alone leaves it as it was. Free-text mode syncs from the
        // submitted text instead (bindFreeTextProcess).
        let processBound = false;
        if (!freeTextMode && restore) {
            const processInput = findProcessInput(answerBox);
            processBound = Boolean(processInput && processInput.value
                && processInput.value === processValueForLines(resultLines));
        }
        const syncDiagnosticProcess = () => {
            if (processBound) syncProcessInput(answerBox, resultLines);
        };

        if (freeTextMode) {
            panel._options.innerHTML = '';
            const recognizedWorking = formatFreeTextWorking(recognizedText, rawAscii, rawLatex, stackResult, lines);
            if (panel._answerBoxDisplay === undefined) {
                panel._answerBoxDisplay = answerBox.style.display;
            }
            answerBox.style.display = 'none';
            if (restore) {
                // After a submit the answer box holds the working. After a plain
                // reload it holds an older saved answer, so put the learner's
                // unsubmitted working back, as a browser keeps unsent form
                // input, and let the anchored boxes follow it again.
                const working = typeof savedWorking === 'string' ? savedWorking : answerBox.value;
                const unsubmitted = working.trim() !== String(answerBox.value || '').trim();
                if (unsubmitted) setBackgroundValue(answerBox, working);
                answerBox._hand2stackWorking = working;
                panel._stackTextarea.value = working;
                panel._changeHighlighter.compare(recognizedWorking, working);
                if (unsubmitted) {
                    applyMatchedAnswers(answerBox, linesFromFreeText(working), () => answerBox.value === working,
                        reportTargetResult, {convert: postAscii, via: 'freetext_restore'}).catch(error => {
                        window.console.error('[hand2stack] re-extraction failed:', error);
                    });
                }
            } else {
                answerBox._hand2stackWorking = recognizedWorking;
                panel._stackTextarea.value = recognizedWorking;
                panel._changeHighlighter.reset(recognizedWorking);
                logRecognition(null);
                const previousValue = answerBox.value;
                setAnswerValue(answerBox, panel._stackTextarea.value);
                research.log(answerBox, 'answer_inserted', {
                    via: 'freetext_recognition',
                    value: research.clip(panel._stackTextarea.value, 8000),
                    previousValue: research.clip(previousValue, 8000)
                }, logOptions());
            }
            const freeTextTracker = research.editTracker(answerBox, () => panel._stackTextarea.value,
                () => ({target: 'freetext'}), {max: 8000, logOptions});
            panel._hand2stackTrackers.push(freeTextTracker);
            if (panel._freeTextSyncHandler) {
                panel._stackTextarea.removeEventListener('input', panel._freeTextSyncHandler);
            }
            panel._freeTextSyncHandler = () => {
                freeTextTracker.input();
                answerBox.value = panel._stackTextarea.value;
                saveFreeTextWorking(answerBox, panel._stackTextarea.value);
                answerBox.dispatchEvent(new Event('input', {bubbles: true}));
                // The answer boxes were extracted from this working, so they
                // follow the learner's corrections to it, unless the learner
                // has typed in a box or a newer edit or recognition arrived.
                window.clearTimeout(panel._reextractTimer);
                panel._reextractTimer = window.setTimeout(() => {
                    const text = panel._stackTextarea.value;
                    const isCurrent = () => panel._stackTextarea.value === text && answerBox.value === text;
                    applyMatchedAnswers(answerBox, linesFromFreeText(text), isCurrent, reportTargetResult,
                        {convert: postAscii, via: 'freetext_edit', followEdits: true}).catch(error => {
                        window.console.error('[hand2stack] re-extraction failed:', error);
                    });
                }, 700);
            };
            panel._stackTextarea.addEventListener('input', panel._freeTextSyncHandler);
            panel._stackTextarea.onblur = () => {
                freeTextTracker.commit('blur');
                answerBox.dispatchEvent(new Event('change', {bubbles: true}));
            };
            return;
        }
        if (panel._answerBoxDisplay !== undefined) {
            answerBox.style.display = panel._answerBoxDisplay;
        }
        panel._applyBtn.textContent = config.insertanswer || 'Insert answer';
        panel._applyBtn.className = '';
        panel._applyBtn.style.padding = '4px 8px';
        panel._applyBtn.style.marginTop = '';

        let defaultIndex = Math.max(0, resultLines.length - 1);
        for (let i = resultLines.length - 1; i >= 0; i--) {
            if (resultLines[i].stack) {
                defaultIndex = i;
                break;
            }
        }
        logRecognition(defaultIndex);
        let selectedIndex = defaultIndex;
        // Created when a line's row is first rendered, so its baseline is the
        // value before the learner's first keystroke.
        const lineTracker = (line, index) => {
            if (!line._hand2stackTracker) {
                line._hand2stackTracker = research.editTracker(answerBox, () => line.ascii, () => ({
                    target: 'line',
                    lineIndex: index,
                    ocrOriginal: research.clip(line.originalAscii)
                }), {logOptions});
                panel._hand2stackTrackers.push(line._hand2stackTracker);
            }
            return line._hand2stackTracker;
        };
        let selectedFormat = 'ascii';
        const stackValueForLine = line => {
            if (!line) return stackResult || '';
            if (!line.edited && line.stack) return line.stack;
            if (line._validatedAscii === line.ascii && line._validatedStack) return line._validatedStack;
            return clientSideStackFallback(line.ascii) || line.ascii || line.stack || '';
        };
        // The Converted for STACK box shows exactly what Insert inserts.
        const updateSelectedPreview = () => {
            panel._stackTextarea.value = stackValueForLine(resultLines[selectedIndex]);
        };
        const renderFormatRows = () => {
            panel._formatRows.innerHTML = '';
            const index = selectedIndex;
            const line = resultLines[index];
            if (!line) return;

            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.flexDirection = 'column';
            row.style.gap = '4px';
            row.style.position = 'relative';
            row.style.padding = '3px 0 3px 10px';
            line._formatRow = row;

            const selectionMarker = document.createElement('span');
            selectionMarker.setAttribute('aria-hidden', 'true');
            selectionMarker.style.position = 'absolute';
            selectionMarker.style.left = '0';
            selectionMarker.style.top = '25px';
            selectionMarker.style.width = '2px';
            selectionMarker.style.height = '38px';
            selectionMarker.style.borderRadius = '2px';
            selectionMarker.style.background = '#8ab4f8';

            const heading = document.createElement('div');
            heading.style.display = 'flex';
            heading.style.justifyContent = 'space-between';
            heading.style.alignItems = 'center';

            const label = document.createElement('label');
            label.textContent = (config.lineprefix || 'Line') + ' ' + (index + 1);
            label.style.fontSize = '12px';
            label.style.color = '#555';

            const field = document.createElement('input');
            field.type = 'text';
            field.value = selectedFormat === 'ascii' ? line.ascii : line.latex;
            field.readOnly = selectedFormat !== 'ascii';
            field.style.width = '100%';
            field.style.boxSizing = 'border-box';
            field.style.fontFamily = 'monospace';
            field.style.padding = '6px 8px';
            field.style.height = '38px';
            field.style.minHeight = '38px';
            field.style.maxHeight = '38px';
            field.style.border = '1px solid #b8c2cc';
            field.style.borderRadius = '3px';
            field.style.background = '#fff';
            const fieldId = 'local-hand2stack-format-line-' + Math.random().toString(36).slice(2);
            field.id = fieldId;
            label.setAttribute('for', fieldId);
            const fieldHighlighter = createChangeHighlighter(field);
            fieldHighlighter.wrapper.style.margin = '0';
            fieldHighlighter.backdrop.style.whiteSpace = 'pre';
            if (selectedFormat === 'ascii') {
                // Moodle themes may apply an !important white input background.
                // The real input must remain transparent so the coloured diff
                // backdrop is visible underneath it.
                field.style.setProperty('background-color', 'transparent', 'important');
                field.style.setProperty('background-image', 'none', 'important');
                field.style.setProperty('color', 'transparent', 'important');
                field.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
                field.style.caretColor = '#111827';
                fieldHighlighter.compare(line.originalAscii, field.value);
            } else {
                // LaTeX is a read-only representation, not an edit diff.
                fieldHighlighter.backdrop.style.display = 'none';
                field.style.setProperty('background-color', '#fff', 'important');
                field.style.setProperty('color', '#1f2937', 'important');
                field.style.setProperty('-webkit-text-fill-color', '#1f2937', 'important');
            }

            const action = document.createElement('span');
            action.style.display = 'flex';
            action.style.alignItems = 'center';
            action.style.justifyContent = 'flex-end';
            action.style.gap = '6px';
            const badge = document.createElement('span');
            badge.textContent = config.edited || 'Edited';
            badge.style.cssText = 'font-size:11px;color:#7a4b00';
            const reset = document.createElement('button');
            reset.type = 'button';
            reset.textContent = config.restoreocr || 'Restore original';
            reset.style.cssText = 'border:0;background:transparent;color:#0f6cbf;cursor:pointer;padding:2px 0;font-size:11px';
            const tracker = lineTracker(line, index);
            const updateEditedControls = () => {
                const visible = line.edited && selectedFormat === 'ascii';
                action.style.display = visible ? 'flex' : 'none';
            };
            reset.addEventListener('click', event => {
                event.stopPropagation();
                tracker.commit('flush');
                const valueBeforeRestore = line.ascii;
                line.ascii = line.originalAscii;
                line.latex = line.originalLatex || asciiToLatexPreview(line.ascii);
                line.edited = false;
                line._validatedAscii = '';
                line._validatedStack = '';
                field.value = line.ascii;
                field.style.background = '#fff';
                fieldHighlighter.reset(line.ascii);
                tracker.rebase();
                if (valueBeforeRestore !== line.ascii) {
                    research.log(answerBox, 'edit_committed', {
                        target: 'line',
                        lineIndex: index,
                        ocrOriginal: research.clip(line.originalAscii),
                        trigger: 'restore',
                        before: research.clip(valueBeforeRestore),
                        after: research.clip(line.ascii),
                        burstMs: 0,
                        inputEvents: 0
                    }, logOptions());
                }
                syncDiagnosticProcess();
                window.clearTimeout(line._editTimer);
                updateEditedControls();
                refreshCandidateLine(index);
                updateSelectedPreview();
                field.focus();
            });
            heading.append(label);
            action.append(badge, reset);
            updateEditedControls();

            if (selectedFormat === 'ascii') {
                field.addEventListener('input', () => {
                    panel._partialSelection = null;
                    line.ascii = field.value;
                    tracker.input();
                    line.latex = asciiToLatexPreview(line.ascii);
                    line.edited = line.ascii !== line.originalAscii;
                    line._validatedAscii = '';
                    line._validatedStack = '';
                    syncDiagnosticProcess();
                    field.style.background = '#fff';
                    updateEditedControls();
                    updateSelectedPreview();
                    window.clearTimeout(line._editTimer);
                    line._editTimer = window.setTimeout(() => {
                        refreshCandidateLine(index);
                    }, 250);
                    // Show the server's conversion of the edit, the value Insert
                    // will insert, once the learner pauses.
                    window.clearTimeout(line._validateTimer);
                    const ascii = line.ascii;
                    if (line.edited) {
                        line._validateTimer = window.setTimeout(async () => {
                            try {
                                const stack = await postAscii(ascii);
                                if (line.ascii !== ascii || !stack) return;
                                line._validatedAscii = ascii;
                                line._validatedStack = stack;
                                if (resultLines[selectedIndex] === line && !panel._partialSelection) {
                                    updateSelectedPreview();
                                }
                                syncDiagnosticProcess();
                            } catch (error) {
                                // Invalid for now; Insert reports the reason.
                            }
                        }, 600);
                    }
                });
                field.addEventListener('blur', () => tracker.commit('blur'));
            }
            row.append(selectionMarker, heading, fieldHighlighter.wrapper, action);
            panel._formatRows.appendChild(row);
        };
        const selectFormat = format => {
            const isAscii = format === 'ascii';
            selectedFormat = isAscii ? 'ascii' : 'latex';
            panel._latexTab.setAttribute('aria-selected', isAscii ? 'false' : 'true');
            panel._asciiTab.setAttribute('aria-selected', isAscii ? 'true' : 'false');
            panel._latexTab.style.background = isAscii ? '#fff' : '#e8f1ff';
            panel._asciiTab.style.background = isAscii ? '#e8f1ff' : '#fff';
            renderFormatRows();
        };
        panel._asciiTab.disabled = false;
        panel._asciiTab.title = '';
        panel._latexTab.onclick = () => selectFormat('latex');
        panel._asciiTab.onclick = () => selectFormat('ascii');
        panel._options.innerHTML = '';
        panel._options.scrollTop = 0;
        panel._selectionBoxes = [];
        panel._optionWrappers = [];

        const showSelectionBoxes = selectedIndex => {
            panel._selectionBoxes.forEach((boxes, index) => {
                boxes.forEach(box => {
                    box.style.display = index === selectedIndex ? 'flex' : 'none';
                });
            });
        };

        const showSelectedLine = selectedIndex => {
            panel._optionWrappers.forEach((option, index) => {
                const selected = index === selectedIndex;
                option.style.border = selected ? '1px solid #8ab4f8' : '1px solid #e2e2e2';
                option.style.background = selected ? '#f3f8ff' : '#fff';
            });
        };

        const selectLine = (index, line) => {
            window.clearTimeout(panel._dragConversionTimer);
            panel._partialSelection = null;
            panel._selectionRequestId = (panel._selectionRequestId || 0) + 1;
            clearFormulaSelections(panel);
            showSelectionBoxes(index);
            showSelectedLine(index);
            // Both the radio and its wrapper report the same choice; only a
            // change of line is a selection.
            if (index !== selectedIndex) {
                const previous = resultLines[selectedIndex];
                if (previous && previous._hand2stackTracker) previous._hand2stackTracker.commit('flush');
                research.log(answerBox, 'candidate_selected', {
                    kind: 'line',
                    lineIndex: index,
                    previousIndex: selectedIndex,
                    isDefault: index === defaultIndex,
                    value: research.clip(stackValueForLine(line)),
                    ocrValue: research.clip(line && line.stack),
                    lineEdited: Boolean(line && line.edited)
                }, logOptions());
            }
            selectedIndex = index;
            updateSelectedPreview();
            window.clearTimeout(panel._renderSelectedTimer);
            panel._renderSelectedTimer = window.setTimeout(renderFormatRows, 0);
        };

        panel._options.addEventListener('change', event => {
            const input = event.target.closest('input[type="radio"][data-result-choice]');
            if (!input || !input.checked) return;
            const index = Number(input.value);
            if (Number.isInteger(index) && resultLines[index]) {
                selectLine(index, resultLines[index]);
            }
        }, {signal: panel._selectionAbortController.signal});

        panel._activateLine = index => {
            const input = panel._options.querySelector('input[type="radio"][value="' + index + '"]');
            if (input) {
                input.checked = true;
            }
            selectLine(index, resultLines[index]);
        };

        resultLines.forEach((line, index) => {
            const hasMath = Boolean(line.stack || line.math);
            const isDefault = index === defaultIndex;
            const optionId = 'local-hand2stack-line-' + Math.random().toString(36).slice(2);
            const wrapper = document.createElement('div');
            wrapper.dataset.resultLineIndex = String(index);
            wrapper.dataset.stackValue = line.stack || line.math || '';
            wrapper.style.display = 'grid';
            wrapper.style.gridTemplateColumns = 'auto 1fr';
            wrapper.style.columnGap = '8px';
            wrapper.style.alignItems = 'center';
            wrapper.style.padding = '5px 8px';
            wrapper.style.minHeight = '38px';
            wrapper.style.boxSizing = 'border-box';
            wrapper.style.border = isDefault ? '1px solid #8ab4f8' : '1px solid #e2e2e2';
            wrapper.style.borderRadius = '3px';
            wrapper.style.background = isDefault ? '#f3f8ff' : '#fff';
            wrapper.style.cursor = hasMath ? 'pointer' : 'default';
            wrapper.style.userSelect = 'text';

            const input = document.createElement('input');
            input.type = 'radio';
            input.name = panel._choiceName;
            input.id = optionId;
            input.value = String(index);
            input.dataset.resultChoice = '1';
            input.checked = isDefault;
            input.disabled = !hasMath;
            input.style.marginTop = '0';

            const body = document.createElement('label');
            body.htmlFor = optionId;
            body.style.display = 'flex';
            body.style.alignItems = 'center';
            body.style.minWidth = '0';
            body.style.width = '100%';
            const prefix = document.createElement('span');
            prefix.textContent = (config.lineprefix || 'Line') + ' ' + (index + 1);
            prefix.style.display = 'inline-block';
            prefix.style.flex = '0 0 auto';
            prefix.style.fontSize = '12px';
            prefix.style.color = '#555';
            prefix.style.marginRight = '12px';

            const lineContent = createLineContent(panel, line);
            const status = document.createElement('span');
            status.textContent = !hasMath
                ? (config.textline || 'text')
                : isDefault && resultLines.length > 1
                ? (config.recommendedanswer || 'Suggested')
                : '';
            status.style.marginLeft = 'auto';
            status.style.paddingLeft = '10px';
            status.style.fontSize = '11px';
            status.style.color = '#667085';
            status.style.whiteSpace = 'nowrap';
            line._prefix = prefix;
            line._body = body;
            line._lineContent = lineContent;
            line._status = status;
            const selectionBoxes = Array.from(lineContent.querySelectorAll('[data-token-selection-box]'));
            selectionBoxes.forEach(box => {
                box.style.display = isDefault ? 'flex' : 'none';
            });
            panel._selectionBoxes.push(selectionBoxes);

            body.appendChild(prefix);
            body.appendChild(lineContent);
            body.appendChild(status);
            wrapper.appendChild(input);
            wrapper.appendChild(body);
            panel._options.appendChild(wrapper);
            panel._optionWrappers.push(wrapper);

            wrapper.addEventListener('pointerdown', event => {
                if (!event.target.closest('[data-stack-part-index]')) {
                    panel._partialSelection = null;
                }
            }, true);

            wrapper.addEventListener('click', event => {
                if (!hasMath) return;
                if ((panel._ignoreLineClickUntil || 0) > Date.now()) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (panel._partialSelection && panel._partialSelection.lineIndex === index) {
                        panel._stackTextarea.value = panel._partialSelection.value;
                    }
                    return;
                }
                if (panel._partialSelection && panel._partialSelection.lineIndex === index) {
                    event.preventDefault();
                    event.stopPropagation();
                    panel._stackTextarea.value = panel._partialSelection.value;
                    return;
                }
                if (event.target.closest('[data-stack-part-index]')) {
                    return;
                }
                input.checked = true;
                selectLine(index, line);
            });

            input.addEventListener('change', () => {
                if (input.checked) {
                    if (panel._partialSelection && panel._partialSelection.lineIndex === index) {
                        panel._stackTextarea.value = panel._partialSelection.value;
                        return;
                    }
                    selectLine(index, line);
                }
            });
        });

        const refreshCandidateLine = index => {
            const line = resultLines[index];
            if (!line || !line._lineContent) return;
            const obsoleteControllers = line._interactiveControllers || [];
            obsoleteControllers.forEach(controller => controller.abort());
            panel._interactiveControllers = (panel._interactiveControllers || [])
                .filter(controller => !obsoleteControllers.includes(controller));
            line._interactiveControllers = [];
            line._prefix.textContent = (config.lineprefix || 'Line') + ' ' + (index + 1);
            const statuses = [];
            if (index === defaultIndex && resultLines.length > 1) {
                statuses.push(config.recommendedanswer || 'Suggested');
            }
            if (line.edited) statuses.push(config.edited || 'Edited');
            line._status.textContent = statuses.join(' · ');
            line._lineContent.innerHTML = '';
            // Keep the OCR prose styling, while synchronizing only its formula.
            // The row's ASCII holds all of its formulas ("x>2,x=4"), so an
            // edit of a row with several replaces them by the edited one.
            const mathParts = line.displayParts.filter(part => part.type === 'math');
            const synchronizedParts = !line.edited ? line.displayParts
                : mathParts.length > 1 ? [{type: 'math', latex: line.latex, text: line.latex}]
                : line.displayParts.map(part => part.type !== 'math' ? part
                    : Object.assign({}, part, {latex: line.latex, text: line.latex}));
            const synchronizedLine = Object.assign({}, line, {
                displayParts: synchronizedParts,
                math: line.edited ? line.latex : line.math
            });
            const synchronizedContent = createLineContent(panel, synchronizedLine);
            while (synchronizedContent.firstChild) {
                line._lineContent.appendChild(synchronizedContent.firstChild);
            }
            typesetMath(line._lineContent).then(() => {
                line._lineContent.querySelectorAll('[data-interactive-formula]').forEach(rendered => {
                    setupInteractiveFormula(panel, rendered, line);
                });
            });
        };

        const selected = resultLines[defaultIndex];
        panel._stackTextarea.value = selected ? (selected.stack || selected.math || '') : (stackResult || '');
        selectFormat('ascii');
        panel._applyBtn.onclick = async () => {
            const requestId = (panel._insertRequestId || 0) + 1;
            panel._insertRequestId = requestId;
            const lineIndex = selectedIndex;
            const line = resultLines[lineIndex];
            if (line && line._hand2stackTracker) line._hand2stackTracker.commit('apply');
            const ascii = line ? line.ascii : '';
            panel._applyBtn.disabled = true;
            setRequestStatus(panel, config.conversioninprogress || 'Converting and validating...');
            try {
                let stackValue = panel._partialSelection && panel._partialSelection.value
                    ? panel._partialSelection.value
                    : stackValueForLine(line);
                const partial = Boolean(panel._partialSelection && panel._partialSelection.value);
                if (line && line.edited && !partial) {
                    const validationStartedAt = Date.now();
                    const logValidation = (valid, stack, error = null) => research.log(answerBox, 'validation_completed', {
                        source: 'h2s_convert',
                        expression: research.clip(ascii),
                        stack: research.clip(stack),
                        valid,
                        errorCode: error ? (error.code || null) : null,
                        message: error ? research.clip(error.message, 300) : '',
                        latencyMs: Date.now() - validationStartedAt
                    }, logOptions());
                    try {
                        stackValue = await postAscii(ascii);
                    } catch (error) {
                        if (panel._insertRequestId === requestId) logValidation(false, '', error);
                        throw error;
                    }
                    if (panel._insertRequestId !== requestId || selectedIndex !== lineIndex || line.ascii !== ascii) {
                        return;
                    }
                    logValidation(Boolean(stackValue), stackValue);
                    line._validatedAscii = ascii;
                    line._validatedStack = stackValue;
                }
                if (!stackValue) {
                    throw new Error(config.recognizefailed || 'Conversion failed.');
                }
                // Inserted exactly as shown: the learner checks it, the plugin
                // does not reshape it to the box's Syntax hint.
                panel._stackTextarea.value = stackValue;
                const previousValue = answerBox.value;
                setAnswerValue(answerBox, stackValue);
                research.log(answerBox, 'answer_inserted', {
                    via: 'apply',
                    value: research.clip(stackValue),
                    converted: research.clip(stackValue),
                    previousValue: research.clip(previousValue),
                    lineIndex,
                    partial,
                    lineEdited: Boolean(line && line.edited),
                    ocrValue: research.clip(line && line.stack)
                }, logOptions());
                processBound = true;
                syncDiagnosticProcess();
                setRequestStatus(panel);
            } catch (error) {
                if (panel._insertRequestId === requestId) {
                    setRequestStatus(panel, error.message, true);
                }
            } finally {
                if (panel._insertRequestId === requestId) {
                    panel._applyBtn.disabled = false;
                }
            }
        };
        typesetMath(panel._options).then(() => {
            panel._options.querySelectorAll('[data-interactive-formula]').forEach(rendered => {
                const option = rendered.closest('[data-result-line-index]');
                const lineIndex = option ? Number(option.dataset.resultLineIndex) : -1;
                setupInteractiveFormula(panel, rendered, resultLines[lineIndex] || null);
            });
            const defaultOption = panel._optionWrappers[defaultIndex];
            if (defaultOption) {
                const list = panel._options;
                const bottom = defaultOption.offsetTop + defaultOption.offsetHeight;
                if (bottom > list.clientHeight) {
                    list.scrollTop = defaultOption.offsetTop - Math.max(0, (list.clientHeight - defaultOption.offsetHeight) / 2);
                }
            }
        });
    };

    return {updateResultPanel};
});
