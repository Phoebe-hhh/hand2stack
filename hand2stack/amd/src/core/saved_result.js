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
    // The strokes on each box's handwriting canvas, kept the same way, so a
    // learner who checks an answer can still erase and rewrite part of it.
    const SAVED_STROKES_PREFIX = 'hand2stack:strokes:';

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

    const writeSavedResult = (key, value, keep = key) => {
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
                if (other && other !== key && other !== keep && other.startsWith(SAVED_RESULT_PREFIX)) {
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
    const toSavedJpeg = (source, width, height) => {
        const scale = Math.min(1, SAVED_IMAGE_MAX_SIDE / Math.max(width, height, 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.85);
    };

    // Images made here from a canvas are saved as they are.
    const savedJpegs = new Set();

    // The handwriting canvas copied straight to a saved image. Loading the
    // canvas's PNG into an <img> first came out blank on iPad Safari.
    const snapshotCanvas = canvas => {
        try {
            const url = toSavedJpeg(canvas, canvas.width, canvas.height);
            savedJpegs.add(url);
            return url;
        } catch (error) {
            return '';
        }
    };

    const compressSourceImage = sourceUrl => new Promise(resolve => {
        if (!sourceUrl) {
            resolve('');
            return;
        }
        if (savedJpegs.has(sourceUrl)) {
            savedJpegs.delete(sourceUrl);
            resolve(sourceUrl);
            return;
        }
        const image = new Image();
        image.onload = () => {
            // Draw only once the image is decoded: WebKit may otherwise draw nothing.
            const decoded = typeof image.decode === 'function' ? image.decode().catch(() => null) : Promise.resolve();
            decoded.then(() => {
                try {
                    resolve(toSavedJpeg(image, image.naturalWidth, image.naturalHeight));
                } catch (error) {
                    resolve('');
                }
            });
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

    const savedStrokesKey = answerBox => SAVED_STROKES_PREFIX + String((answerBox && answerBox.name) || '');

    const loadSavedStrokes = answerBox => {
        if (!answerBox || !answerBox.name) return null;
        try {
            const saved = JSON.parse(window.sessionStorage.getItem(savedStrokesKey(answerBox)) || 'null');
            return saved && Array.isArray(saved.strokes) && saved.strokes.length ? saved : null;
        } catch (error) {
            return null;
        }
    };

    // An empty canvas forgets its strokes. Saving may drop other boxes'
    // saved results, never this box's own.
    const saveStrokes = (answerBox, drawing) => {
        if (!answerBox || !answerBox.name) return;
        const key = savedStrokesKey(answerBox);
        if (!drawing || !drawing.strokes.length) {
            try {
                window.sessionStorage.removeItem(key);
            } catch (error) {
                // Nothing kept.
            }
            return;
        }
        writeSavedResult(key, Object.assign({}, drawing, {savedAt: Date.now()}), savedResultKey(answerBox));
    };

    return {loadSavedResult, saveRecognitionResult, saveFreeTextWorking, loadSavedStrokes, saveStrokes, snapshotCanvas};
});
