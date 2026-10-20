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
    // Which characters of current are not in original, by a Myers diff. One
    // span from the first to the last difference would also mark the
    // untouched text between two separate edits.
    const editedMask = (originalValue, currentValue) => {
        const a = String(originalValue || '');
        const b = String(currentValue || '');
        const mask = Array(b.length).fill(false);
        let prefix = 0;
        while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
        let aEnd = a.length;
        let bEnd = b.length;
        while (aEnd > prefix && bEnd > prefix && a[aEnd - 1] === b[bEnd - 1]) {
            aEnd--;
            bEnd--;
        }
        const n = aEnd - prefix;
        const m = bEnd - prefix;
        const max = n + m;
        if (!n || !m) {
            for (let i = prefix; i < bEnd; i++) mask[i] = true;
            return mask;
        }
        const offset = max + 1;
        const v = new Int32Array(2 * max + 3);
        const trace = [];
        // Each step keeps only the diagonals it can reach, and a rewrite too
        // large to trace is marked as one span.
        const limit = Math.min(max, 2000);
        let done = false;
        for (let d = 0; d <= limit && !done; d++) {
            trace.push(v.slice(offset - d - 1, offset + d + 2));
            for (let k = -d; k <= d; k += 2) {
                let x = (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]))
                    ? v[offset + k + 1] : v[offset + k - 1] + 1;
                let y = x - k;
                while (x < n && y < m && a[prefix + x] === b[prefix + y]) {
                    x++;
                    y++;
                }
                v[offset + k] = x;
                if (x >= n && y >= m) {
                    done = true;
                    break;
                }
            }
        }
        if (!done) {
            for (let i = prefix; i < bEnd; i++) mask[i] = true;
            return mask;
        }
        let x = n;
        let y = m;
        for (let d = trace.length - 1; d > 0; d--) {
            const previous = trace[d];
            const k = x - y;
            const at = diagonal => previous[diagonal + d + 1];
            const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
            const previousK = down ? k + 1 : k - 1;
            const previousX = at(previousK);
            const previousY = previousX - previousK;
            while (x > previousX && y > previousY) {
                x--;
                y--;
            }
            if (down) mask[prefix + previousY] = true;
            x = previousX;
            y = previousY;
        }
        return mask;
    };

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
            previousValue = String(currentValue || '');
            edited = editedMask(originalValue, previousValue);
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

    return {createChangeHighlighter, editedMask};
});
