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
 * Lines mode: the editor of the selected line, shown as ASCII (editable) or LaTeX.
 *
 * @module local_hand2stack/modes/lines/format_rows
 */
define([
    'local_hand2stack/config',
    'local_hand2stack/core/research',
    'local_hand2stack/core/api',
    'local_hand2stack/core/math_text',
    'local_hand2stack/ui/change_highlighter'
], function(Config, Research, Api, MathText, ChangeHighlighter) {
    const {config} = Config;
    const {research} = Research;
    const {postAscii} = Api;
    const {asciiToLatexPreview} = MathText;
    const {createChangeHighlighter} = ChangeHighlighter;

    const createFormatRows = ({panel, answerBox, resultLines, getSelectedIndex, lineTracker, logOptions,
            syncDiagnosticProcess, refreshCandidateLine, updateSelectedPreview, clearRequestStatus}) => {
        let selectedFormat = 'ascii';
        const renderFormatRows = () => {
            panel._formatRows.innerHTML = '';
            const index = getSelectedIndex();
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
                clearRequestStatus();
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
                    // Typing replaces a chosen formula part; a conversion of
                    // that part still in flight must not write it back.
                    panel._partialSelection = null;
                    panel._selectionRequestId = (panel._selectionRequestId || 0) + 1;
                    clearRequestStatus();
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
                                if (resultLines[getSelectedIndex()] === line && !panel._partialSelection) {
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
        return {renderFormatRows, selectFormat};
    };

    return {createFormatRows};
});
