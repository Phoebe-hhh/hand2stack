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
 * One recognized row, its prose and its selectable formulas, as shown in the review list.
 *
 * @module local_hand2stack/modes/lines/line_content
 */
define(['local_hand2stack/config', 'local_hand2stack/core/math_text'], function(Config, MathText) {
    const {config} = Config;
    const {normalizeDisplayParts} = MathText;

    const createLineContent = (panel, line) => {
        const container = document.createElement('span');
        container.style.display = 'inline-flex';
        container.style.alignItems = 'center';
        container.style.minWidth = '0';
        container.style.maxWidth = '100%';
        container.style.flex = '1 1 auto';
        container.style.overflowX = 'auto';
        container.style.overflowY = 'hidden';
        container.style.fontFamily = 'inherit';

        const displayRow = document.createElement('span');
        displayRow.style.display = 'inline-flex';
        displayRow.style.flexWrap = 'wrap';
        displayRow.style.alignItems = 'center';
        displayRow.style.gap = '4px';
        displayRow.style.minHeight = '24px';
        container.appendChild(displayRow);

        const parts = line.displayParts.length ? line.displayParts : normalizeDisplayParts([{
            type: line.math ? 'math' : 'text',
            text: line.display || line.latex || line.stack || '',
            latex: line.math || ''
        }]);

        parts.forEach(part => {
            if (part.type === 'math' && part.latex) {
                const rendered = document.createElement('span');
                rendered.textContent = '\\(' + part.latex + '\\)';
                rendered.style.display = 'inline-block';
                rendered.style.fontSize = '16px';
                rendered.style.lineHeight = '1.15';
                rendered.setAttribute('aria-label', part.latex);
                rendered.dataset.latex = part.latex;
                displayRow.appendChild(rendered);

                rendered.dataset.interactiveFormula = '1';
                rendered.title = config.selectpart || 'Click a symbol, or drag across the formula to select a range.';
                return;
            }

            const text = document.createElement('span');
            // OCR text segments can carry LaTeX spacing commands outside math; show them as spaces.
            text.textContent = String(part.text || '').replace(/[$¥￥]/g, '')
                .replace(/\\q?quad(?![a-zA-Z])|\\[,;:! ]/g, ' ')
                .replace(/ {2,}/g, ' ');
            text.style.whiteSpace = 'pre-wrap';
            text.style.fontFamily = 'inherit';
            displayRow.appendChild(text);
        });

        return container;
    };

    return {createLineContent};
});
