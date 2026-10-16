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
 * Free-text working and the process data that follows it.
 *
 * @module local_hand2stack/modes/freetext/working
 */
define(['local_hand2stack/core/stack_inputs'], function(StackInputs) {
    const {syncProcessValue, isFreeTextInput} = StackInputs;

    // One backtick-marked Free-text row. List numbering is layout, but the
    // mathematical content is kept exactly as the learner/OCR supplied it.
    const processRowFromFreeText = row => {
        return String(row || '').trim()
            .replace(/^(?:\d+[.)]|\(\d+\))\s+(?=[A-Za-z(])/, '')
            .trim();
    };

    // The Free-text working marks each maths row with backticks; prose stays
    // outside them. Unpaired backticks (mid-edit) are ignored.
    const processValueForFreeText = text => {
        const rows = [];
        const pattern = /`([^`]*)`/g;
        let match;
        while ((match = pattern.exec(String(text || ''))) !== null) {
            match[1].split('\n').map(processRowFromFreeText).filter(Boolean).forEach(row => rows.push(row));
        }
        return rows.join('\n');
    };

    // A Free-text box is what the learner submits, so its process data
    // follows every change to it, whether recognized or typed.
    const bindFreeTextProcess = answerBox => {
        if (!isFreeTextInput(answerBox) || answerBox.dataset.hand2stackProcessBound === '1') return;
        answerBox.dataset.hand2stackProcessBound = '1';
        const sync = () => syncProcessValue(answerBox, processValueForFreeText(answerBox.value));
        answerBox.addEventListener('input', sync);
        answerBox.addEventListener('change', sync);
    };

    // The edited Free-text working as recognized-line objects. Each text line
    // is one line; its maths is the backticked part (the last one when a line
    // holds several statements, e.g. "`x>0`, so `x>2`"), its raw text the line
    // without backticks, so "Answer: `x=4`" still matches the label.
    const linesFromFreeText = text => {
        const lines = [];
        let current = {raw: '', segments: []};
        const parts = String(text || '').replace(/\r\n?/g, '\n').split('`');
        parts.forEach((part, index) => {
            // An unpaired final backtick (mid-edit) leaves its tail as prose.
            const isMath = index % 2 === 1 && index < parts.length - 1;
            part.split('\n').forEach((piece, pieceIndex) => {
                if (pieceIndex > 0) {
                    lines.push(current);
                    current = {raw: '', segments: []};
                }
                current.raw += piece;
                if (isMath && piece.trim()) current.segments.push(piece.trim());
            });
        });
        lines.push(current);
        return lines.filter(line => line.raw.trim()).map(line => {
            const math = line.segments.length ? line.segments[line.segments.length - 1] : '';
            return {type: math ? 'expression' : 'text', math, raw: line.raw.trim()};
        });
    };

    const formatFreeTextWorking = (recognizedText, rawAscii, rawLatex, stackResult, lines) => {
        const mixedText = String(recognizedText || '').replace(/\r\n?/g, '\n').trim();
        if (mixedText) return mixedText;
        let working = String(rawAscii || '').replace(/\r\n?/g, '\n').trim();
        if (!working && Array.isArray(lines)) {
            working = lines.map(line => String(line.stack || line.math || line.text || '').trim())
                .filter(Boolean).join('\n');
        }
        if (!working) {
            const latex = String(rawLatex || '').replace(/\r\n?/g, '\n').trim();
            if (latex) {
                return '\\[\n' + latex + '\n\\]';
            }
            working = String(stackResult || '').replace(/\r\n?/g, '\n').trim();
        }
        if (!working) {
            return '';
        }

        const workingLines = working.split('\n');
        if (workingLines.length >= 2
                && workingLines[0].trim() === '`'
                && workingLines[workingLines.length - 1].trim() === '`') {
            return working;
        }
        return '`\n' + working + '\n`';
    };

    return {bindFreeTextProcess, linesFromFreeText, formatFreeTextWorking};
});
