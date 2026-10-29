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
 * Lines mode of the review panel: the recognized rows to choose from, the
 * selected line's editor, and inserting the chosen answer.
 *
 * @module local_hand2stack/modes/lines/view
 */
define([
    'local_hand2stack/config',
    'local_hand2stack/core/stack_inputs',
    'local_hand2stack/core/research',
    'local_hand2stack/core/api',
    'local_hand2stack/core/math_text',
    'local_hand2stack/ui/math_render',
    'local_hand2stack/ui/formula_select',
    'local_hand2stack/ui/result_panel',
    'local_hand2stack/modes/lines/line_content',
    'local_hand2stack/modes/lines/format_rows'
], function(
    Config, StackInputs, Research, Api, MathText, MathRender, FormulaSelect, ResultPanel, LineContent, FormatRows
) {
    const {config} = Config;
    const {setAnswerValue, findProcessInput, processValueForLines, syncProcessInput} = StackInputs;
    const {research} = Research;
    const {postAscii} = Api;
    const {clientSideStackFallback} = MathText;
    const {typesetMath} = MathRender;
    const {setupInteractiveFormula, clearFormulaSelections} = FormulaSelect;
    const {setRequestStatus} = ResultPanel;
    const {createLineContent} = LineContent;
    const {createFormatRows} = FormatRows;

    // The panel laid out for choosing a line. Both panels keep the width they
    // had before recognition: result content must never size the question.
    const showLinesLayout = panel => {
        const layoutReference = panel._layoutReference;
        if (layoutReference && layoutReference.offsetParent !== null) {
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
        panel._freeTextMode = false;
        panel.style.padding = '12px';
        panel.style.borderRadius = '6px';
        panel.style.background = '#f8fbfd';
        panel._freeTextHeader.style.display = 'none';
        panel._instruction.textContent = config.selectanswer || 'Select the answer to insert into STACK:';
        panel._options.style.display = 'grid';
        panel._formatTitle.style.display = 'block';
        panel._formatTabs.style.display = 'flex';
        panel._formatRows.style.display = 'grid';
        panel._editableHeader.style.display = 'flex';
        panel._candidateColumn.style.display = 'block';
        panel._sourceTitle.style.display = 'none';
        panel._sourceViewer.style.display = 'none';
        panel._sourcePreview.src = '';
        panel._instruction.style.display = 'block';
        panel._candidateColumn.firstChild.style.display = 'block';
        panel._recognizedColumn.style.display = 'block';
        panel._reviewGrid.style.display = 'grid';
        panel._convertedColumn.style.paddingTop = '10px';
        panel._convertedColumn.style.borderTop = '1px solid #e2e6ea';
        panel._convertedColumn.style.marginTop = '10px';
        // The line-by-line review shows, read-only, the value Insert will put
        // in the answer box, so the learner confirms what is inserted.
        panel._convertedColumn.style.display = 'block';
        panel._updateReviewLayout();
        panel._stackTitle.textContent = config.convertedstack || 'Converted for STACK:';
        panel._stackTextarea.rows = 1;
        panel._stackTextarea.readOnly = true;
        panel._stackTextarea.style.resize = 'none';
        panel._stackTextarea.style.height = '38px';
        panel._stackTextarea.style.minHeight = '38px';
        panel._stackTextarea.style.background = '#f3f6f8';
        panel._stackTextarea.style.fontFamily = 'monospace';
        panel._stackTextarea.style.fontSize = '13px';
        panel._stackTextarea.style.lineHeight = '';
        panel._stackTextarea.style.color = '';
        panel._stackTextarea.style.webkitTextFillColor = '';
        panel._stackTextarea.style.caretColor = '';
        panel._changeHighlighter.backdrop.style.display = 'none';
        panel._freeTextHelp.style.display = 'none';
        panel._actionButtons.style.display = 'flex';
    };

    const showLinesResult = (panel, {answerBox, stackResult, restore, resultLines, logOptions, logRecognition}) => {
        // The process input holds the working behind the inserted answer: it
        // is written on Insert, then follows every edit of that working.
        // Recognizing alone leaves it as it was. Free-text mode syncs from the
        // submitted text instead (bindFreeTextProcess).
        let processBound = false;
        if (restore) {
            const processInput = findProcessInput(answerBox);
            processBound = Boolean(processInput && processInput.value
                && processInput.value === processValueForLines(resultLines));
        }
        const syncDiagnosticProcess = () => {
            if (processBound) syncProcessInput(answerBox, resultLines);
        };

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
        const stackValueForLine = line => {
            if (!line) return stackResult || '';
            if (line._validatedAscii === line.ascii && line._validatedStack) return line._validatedStack;
            if (!line.edited && line.stack) return line.stack;
            return clientSideStackFallback(line.ascii) || line.ascii || line.stack || '';
        };
        // The Converted for STACK box shows exactly what Insert inserts.
        const updateSelectedPreview = () => {
            panel._stackTextarea.value = stackValueForLine(resultLines[selectedIndex]);
        };
        const validationGeneration = (panel._lineValidationGeneration || 0) + 1;
        panel._lineValidationGeneration = validationGeneration;
        const validateAsciiLine = line => {
            const ascii = line ? line.ascii : '';
            if (!ascii) return Promise.resolve('');
            if (line._validatedAscii === ascii && line._validatedStack) {
                return Promise.resolve(line._validatedStack);
            }
            if (line._validatingAscii === ascii && line._validationPromise) {
                return line._validationPromise;
            }
            line._validatingAscii = ascii;
            line._validationPromise = postAscii(ascii).then(stack => {
                if (panel._lineValidationGeneration === validationGeneration && line.ascii === ascii && stack) {
                    line._validatedAscii = ascii;
                    line._validatedStack = stack;
                    if (resultLines[selectedIndex] === line && !panel._partialSelection) {
                        updateSelectedPreview();
                    }
                }
                return stack;
            }).finally(() => {
                if (line._validatingAscii === ascii) {
                    line._validatingAscii = '';
                    line._validationPromise = null;
                }
            });
            return line._validationPromise;
        };
        const {renderFormatRows, selectFormat} = createFormatRows({
            panel, answerBox, resultLines, getSelectedIndex: () => selectedIndex, lineTracker, logOptions,
            syncDiagnosticProcess, refreshCandidateLine: index => refreshCandidateLine(index), updateSelectedPreview,
            clearRequestStatus: () => setRequestStatus(panel)
        });
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
        // Resolve the real Insert value while the learner reviews the panel.
        // A LaTeX-derived fallback is already STACK and must not go through the
        // AsciiMath-only implicit-product rules unless the learner edits it.
        resultLines.forEach(line => {
            if (line.asciiFromMathpix && !line.edited && line.ascii) {
                validateAsciiLine(line).catch(() => {
                    // Insert reports a conversion failure if the learner chooses this row.
                });
            }
        });
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
                // Normalize genuine Mathpix AsciiMath, and anything the learner
                // edited in the ASCII tab. An untouched LaTeX-derived fallback
                // is already STACK and deliberately preserves p(x)-style ambiguity.
                if (line && ascii && !partial && (line.asciiFromMathpix || line.edited)) {
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
                        stackValue = await validateAsciiLine(line);
                    } catch (error) {
                        if (panel._insertRequestId === requestId) logValidation(false, '', error);
                        throw error;
                    }
                    if (panel._insertRequestId !== requestId || selectedIndex !== lineIndex || line.ascii !== ascii) {
                        return;
                    }
                    logValidation(Boolean(stackValue), stackValue);
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

    return {showLinesLayout, showLinesResult};
});
