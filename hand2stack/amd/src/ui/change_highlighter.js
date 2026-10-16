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
 * Highlighting what the learner changed in an editable result.
 *
 * @module local_hand2stack/ui/change_highlighter
 */
define([], function() {
    const createChangeHighlighter = textarea => {
        const wrapper = document.createElement('div');
        const backdrop = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.background = '#fff';
        wrapper.style.marginTop = '4px';
        wrapper.style.marginBottom = '8px';
        backdrop.setAttribute('aria-hidden', 'true');
        backdrop.style.cssText = [
            'position:absolute', 'inset:0', 'overflow:hidden', 'pointer-events:none',
            'z-index:2', 'white-space:pre-wrap', 'overflow-wrap:break-word',
            'color:#1f2937', 'background:transparent'
        ].join(';');
        textarea.style.position = 'relative';
        textarea.style.zIndex = '1';
        textarea.style.margin = '0';
        textarea.style.background = 'transparent';
        wrapper.append(backdrop, textarea);

        let previousValue = '';
        let edited = [];
        const render = () => {
            backdrop.replaceChildren();
            let start = 0;
            for (let i = 0; i <= previousValue.length; i++) {
                if (i < previousValue.length && edited[i] === edited[start]) continue;
                const span = document.createElement('span');
                span.textContent = previousValue.slice(start, i);
                if (edited[start]) {
                    span.style.color = '#0b63ce';
                }
                backdrop.appendChild(span);
                start = i;
            }
            if (previousValue.endsWith('\n')) backdrop.appendChild(document.createTextNode('\n '));
            backdrop.scrollTop = textarea.scrollTop;
            backdrop.scrollLeft = textarea.scrollLeft;
        };
        const syncMetrics = () => {
            const style = window.getComputedStyle(textarea);
            ['padding', 'border', 'font', 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight',
                'letterSpacing', 'textAlign', 'boxSizing', 'borderRadius'].forEach(property => {
                backdrop.style[property] = style[property];
            });
            backdrop.style.width = textarea.offsetWidth + 'px';
            backdrop.style.height = textarea.offsetHeight + 'px';
        };
        const reset = value => {
            previousValue = String(value || '');
            edited = Array(previousValue.length).fill(false);
            render();
            window.requestAnimationFrame(syncMetrics);
        };
        const compare = (originalValue, currentValue) => {
            const original = String(originalValue || '');
            const current = String(currentValue || '');
            let prefix = 0;
            while (prefix < original.length && prefix < current.length
                    && original[prefix] === current[prefix]) prefix++;
            let originalSuffix = original.length;
            let currentSuffix = current.length;
            while (originalSuffix > prefix && currentSuffix > prefix
                    && original[originalSuffix - 1] === current[currentSuffix - 1]) {
                originalSuffix--;
                currentSuffix--;
            }
            previousValue = current;
            edited = Array(current.length).fill(false);
            for (let i = prefix; i < currentSuffix; i++) edited[i] = true;
            render();
            window.requestAnimationFrame(syncMetrics);
        };
        textarea.addEventListener('input', () => {
            const nextValue = textarea.value;
            let prefix = 0;
            while (prefix < previousValue.length && prefix < nextValue.length
                    && previousValue[prefix] === nextValue[prefix]) prefix++;
            let oldSuffix = previousValue.length;
            let newSuffix = nextValue.length;
            while (oldSuffix > prefix && newSuffix > prefix
                    && previousValue[oldSuffix - 1] === nextValue[newSuffix - 1]) {
                oldSuffix--;
                newSuffix--;
            }
            edited = edited.slice(0, prefix)
                .concat(Array(newSuffix - prefix).fill(true), edited.slice(oldSuffix));
            previousValue = nextValue;
            render();
        });
        textarea.addEventListener('scroll', render);
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(syncMetrics);
            observer.observe(textarea);
        }
        return {wrapper, backdrop, reset, compare, syncMetrics};
    };

    return {createChangeHighlighter};
});
