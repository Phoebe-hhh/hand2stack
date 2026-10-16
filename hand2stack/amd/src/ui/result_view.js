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
 * Filling the review panel with a recognition result, in the mode of its answer box.
 *
 * @module local_hand2stack/ui/result_view
 */
define([
    'local_hand2stack/core/stack_inputs',
    'local_hand2stack/core/research',
    'local_hand2stack/core/math_text',
    'local_hand2stack/core/saved_result',
    'local_hand2stack/ui/result_panel',
    'local_hand2stack/modes/lines/view',
    'local_hand2stack/modes/freetext/view'
], function(StackInputs, Research, MathText, SavedResult, ResultPanel, LinesView, FreeTextView) {
    const {isFreeTextInput} = StackInputs;
    const {research} = Research;
    const {normalizeResultLines} = MathText;
    const {saveRecognitionResult} = SavedResult;
    const {setRequestStatus} = ResultPanel;
    const {showLinesLayout, showLinesResult} = LinesView;
    const {showFreeTextLayout, showFreeTextResult} = FreeTextView;

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
        if (freeTextMode) {
            showFreeTextLayout(panel, sourceUrl);
        } else {
            showLinesLayout(panel);
        }
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
        const context = {answerBox, rawLatex, rawAscii, stackResult, lines, recognizedText, restore, savedWorking,
            resultLines, logOptions, logRecognition};
        if (freeTextMode) {
            showFreeTextResult(panel, context);
        } else {
            showLinesResult(panel, context);
        }
    };

    return {updateResultPanel};
});
