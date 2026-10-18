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
 * Free-text mode of the review panel: the whole working, editable, beside the source image.
 *
 * @module local_hand2stack/modes/freetext/view
 */
define([
    'local_hand2stack/config',
    'local_hand2stack/core/stack_inputs',
    'local_hand2stack/core/research',
    'local_hand2stack/core/api',
    'local_hand2stack/core/saved_result',
    'local_hand2stack/modes/freetext/working',
    'local_hand2stack/modes/freetext/anchors'
], function(Config, StackInputs, Research, Api, SavedResult, Working, Anchors) {
    const {config} = Config;
    const {setAnswerValue, setBackgroundValue} = StackInputs;
    const {research} = Research;
    const {postAscii} = Api;
    const {saveFreeTextWorking} = SavedResult;
    const {linesFromFreeText, formatFreeTextWorking} = Working;
    const {applyMatchedAnswers, reportTargetResult} = Anchors;

    // The panel laid out for Free text. A mobile upload brings back no image,
    // so a panel without one leaves out the empty "Original work" column.
    const showFreeTextLayout = (panel, sourceUrl) => {
        panel.style.display = 'block';
        panel._freeTextMode = true;
        panel.style.padding = '20px';
        panel.style.borderRadius = '10px';
        panel.style.background = '#fff';
        panel.style.width = '100%';
        panel._freeTextHeader.style.display = 'flex';
        panel._instruction.textContent = config.recognizedworking
            || 'Recognized mathematical working. Review or edit it before inserting:';
        panel._options.style.display = 'none';
        panel._formatTitle.style.display = 'none';
        panel._formatTabs.style.display = 'none';
        panel._formatRows.style.display = 'none';
        panel._editableHeader.style.display = 'none';
        panel._candidateColumn.style.display = !sourceUrl ? 'none' : 'block';
        panel._sourceTitle.style.display = sourceUrl ? 'block' : 'none';
        panel._sourceViewer.style.display = sourceUrl ? 'block' : 'none';
        panel._sourcePreview.src = sourceUrl ? sourceUrl : '';
        if (sourceUrl) panel._resetImageView();
        panel._instruction.style.display = 'none';
        panel._candidateColumn.firstChild.style.display = 'none';
        panel._recognizedColumn.style.display = 'block';
        panel._reviewGrid.style.display = 'grid';
        panel._reviewGrid.style.gridTemplateColumns = '1fr';
        panel._convertedColumn.style.paddingTop = '0';
        panel._convertedColumn.style.borderTop = '0';
        panel._convertedColumn.style.marginTop = '0';
        panel._convertedColumn.style.display = 'block';
        if (sourceUrl) panel._updateReviewLayout();
        panel._stackTitle.textContent = config.recognizedfullanswer || 'Complete recognized answer · editable';
        panel._stackTextarea.rows = 14;
        panel._stackTextarea.readOnly = false;
        panel._stackTextarea.style.resize = '';
        panel._stackTextarea.style.height = '';
        panel._stackTextarea.style.minHeight = '';
        panel._stackTextarea.style.background = 'transparent';
        panel._stackTextarea.style.fontFamily = 'inherit';
        panel._stackTextarea.style.fontSize = '16px';
        panel._stackTextarea.style.lineHeight = '1.65';
        panel._stackTextarea.style.color = 'transparent';
        panel._stackTextarea.style.webkitTextFillColor = 'transparent';
        panel._stackTextarea.style.caretColor = '#111827';
        panel._changeHighlighter.backdrop.style.display = 'block';
        panel._freeTextHelp.style.display = 'block';
        panel._actionButtons.style.display = 'none';
    };

    // The recognized working goes straight into the Free-text answer, which
    // then follows every edit of it; the anchored boxes follow it too.
    const showFreeTextResult = (panel, {answerBox, rawLatex, rawAscii, stackResult, lines, recognizedText,
            restore, savedWorking, logOptions, logRecognition}) => {
        panel._options.innerHTML = '';
        const recognizedWorking = formatFreeTextWorking(recognizedText, rawAscii, rawLatex, stackResult, lines);
        if (panel._answerBoxDisplay === undefined) {
            panel._answerBoxDisplay = answerBox.style.display;
        }
        answerBox.style.display = 'none';
        // In STACK's side-by-side container the hidden box leaves the
        // [[ascii]] preview alone in a column sized to its content. Let the
        // container span the question like the review panel above it, without
        // the gap that kept the box apart from the preview: the editor's <br>
        // around the placeholders are flex items too and would indent it.
        const container = answerBox.parentElement;
        if (container && container.classList.contains('free-text-container')) {
            container.style.width = '100%';
            container.style.boxSizing = 'border-box';
            container.style.gap = '0';
        }
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
            if (unsubmitted && config.autofill) {
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
            // With auto-fill on, the answer boxes were extracted from this
            // working, so they follow the learner's corrections to it, unless
            // the learner has typed in a box or a newer edit or recognition
            // arrived.
            if (!config.autofill) return;
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
    };

    return {showFreeTextLayout, showFreeTextResult};
});
