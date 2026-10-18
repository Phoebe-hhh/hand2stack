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
 * The source image under a Free-text answer that can no longer be edited.
 *
 * @module local_hand2stack/modes/freetext/locked_answer
 */
define(['local_hand2stack/config', 'local_hand2stack/core/saved_result'], function(Config, SavedResult) {
    const {config} = Config;
    const {loadSavedResult} = SavedResult;

    // A locked answer cannot be edited, so it gets only the image it was
    // recognized from, below the box, and no capture buttons.
    const showSavedSourceImage = answerBox => {
        if (answerBox.dataset.hand2stackSourceShown === '1') return;
        const saved = loadSavedResult(answerBox);
        if (!saved || !saved.sourceUrl) return;
        answerBox.dataset.hand2stackSourceShown = '1';
        const figure = document.createElement('div');
        figure.style.marginTop = '8px';
        figure.style.maxWidth = '100%';
        const title = document.createElement('div');
        title.textContent = config.originalwork || 'Original work';
        title.style.fontWeight = '600';
        title.style.marginBottom = '4px';
        const image = document.createElement('img');
        image.src = saved.sourceUrl;
        image.alt = config.originalwork || 'Original work';
        image.style.display = 'block';
        image.style.maxWidth = '100%';
        image.style.maxHeight = '520px';
        image.style.objectFit = 'contain';
        image.style.background = '#fff';
        image.style.border = '1px solid #d8e1e8';
        image.style.borderRadius = '6px';
        figure.append(title, image);
        // In a flex or grid parent such as STACK's .free-text-container the
        // figure would become a squeezed column beside the box, so it follows
        // the container, as the buttons and panels of an editable box do.
        const parent = answerBox.parentElement;
        const inFlexParent = parent && /^(inline-)?(flex|grid)$/.test(window.getComputedStyle(parent).display);
        (inFlexParent ? parent : answerBox).insertAdjacentElement('afterend', figure);
    };

    return {showSavedSourceImage};
});
