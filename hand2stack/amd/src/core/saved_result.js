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
 * Recognition results kept in the browser for this attempt, with a small copy of the source image.
 *
 * @module local_hand2stack/core/saved_result
 */
define([], function() {
    // The last recognition of each answer box lives in sessionStorage so the
    // review panel and its source image survive the page reload of every
    // quiz Check, Next or Save. Input names carry the question usage id, so a
    // new attempt or preview never picks up an older result.
    const SAVED_RESULT_PREFIX = 'hand2stack:result:';

    const SAVED_IMAGE_MAX_SIDE = 1600;

    let savedResultToken = 0;

    const savedResultKey = answerBox => SAVED_RESULT_PREFIX + String((answerBox && answerBox.name) || '');

    const loadSavedResult = answerBox => {
        if (!answerBox || !answerBox.name) return null;
        try {
            const saved = JSON.parse(window.sessionStorage.getItem(savedResultKey(answerBox)) || 'null');
            return saved && typeof saved === 'object' ? saved : null;
        } catch (error) {
            return null;
        }
    };

    const writeSavedResult = (key, value) => {
        const text = JSON.stringify(value);
        try {
            window.sessionStorage.setItem(key, text);
            return true;
        } catch (error) {
            // Over quota: drop the other saved results, oldest first, and retry.
        }
        let others = [];
        try {
            for (let i = 0; i < window.sessionStorage.length; i++) {
                const other = window.sessionStorage.key(i);
                if (other && other !== key && other.startsWith(SAVED_RESULT_PREFIX)) {
                    let savedAt = 0;
                    try {
                        savedAt = Number(JSON.parse(window.sessionStorage.getItem(other)).savedAt) || 0;
                    } catch (error) {
                        // Unreadable entries go first.
                    }
                    others.push({key: other, savedAt});
                }
            }
        } catch (error) {
            return false;
        }
        others.sort((a, b) => a.savedAt - b.savedAt);
        for (const other of others) {
            try {
                window.sessionStorage.removeItem(other.key);
                window.sessionStorage.setItem(key, text);
                return true;
            } catch (error) {
                // Keep evicting.
            }
        }
        return false;
    };

    // A downscaled JPEG keeps the image small enough for sessionStorage.
    // Handwriting canvases are transparent, so paint them on white first.
    const compressSourceImage = sourceUrl => new Promise(resolve => {
        if (!sourceUrl) {
            resolve('');
            return;
        }
        const image = new Image();
        image.onload = () => {
            try {
                const scale = Math.min(1, SAVED_IMAGE_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight, 1));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
                const context = canvas.getContext('2d');
                context.fillStyle = '#fff';
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            } catch (error) {
                resolve('');
            }
        };
        image.onerror = () => resolve('');
        image.src = sourceUrl;
    });

    const saveRecognitionResult = (answerBox, result) => {
        if (!answerBox || !answerBox.name) return;
        const token = ++savedResultToken;
        answerBox._hand2stackSavedResultToken = token;
        answerBox._hand2stackSavePending = true;
        const key = savedResultKey(answerBox);
        compressSourceImage(result.sourceUrl).then(imageUrl => {
            // A newer recognition of this box has been saved meanwhile.
            if (answerBox._hand2stackSavedResultToken !== token) return;
            answerBox._hand2stackSavePending = false;
            // The Free-text working as last edited, which may be newer than
            // the recognition if the learner edited while the image compressed.
            const working = answerBox._hand2stackWorking;
            const entry = Object.assign({}, result, {sourceUrl: imageUrl, savedAt: Date.now()},
                typeof working === 'string' ? {working} : {});
            if (!writeSavedResult(key, entry) && imageUrl) {
                writeSavedResult(key, Object.assign(entry, {sourceUrl: ''}));
            }
        });
    };

    // A reload that is not a submit (F5) brings back the answer Moodle saved
    // last, so the learner's newer working is kept here as they type.
    const saveFreeTextWorking = (answerBox, working) => {
        answerBox._hand2stackWorking = working;
        if (answerBox._hand2stackSavePending) return;
        const saved = loadSavedResult(answerBox);
        if (!saved || saved.working === working) return;
        writeSavedResult(savedResultKey(answerBox), Object.assign(saved, {working}));
    };

    return {loadSavedResult, saveRecognitionResult, saveFreeTextWorking};
});
