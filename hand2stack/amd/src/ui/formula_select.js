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
 * Selecting part of a rendered formula and converting only that part.
 *
 * @module local_hand2stack/ui/formula_select
 */
define([
    'local_hand2stack/core/research',
    'local_hand2stack/core/api',
    'local_hand2stack/core/math_text'
], function(
    Research, Api, MathText
) {
    const {research} = Research;
    const {postLatex} = Api;
    const {normalizeSelectableText, latexDisplayMap, selectedLatexFromLine, clientSideStackFallback} = MathText;

    // A token or formula range the learner selected instead of a whole line.
    const logPartialSelection = (panel, lineIndex, latex, value) => {
        const answerBox = panel._hand2stackAnswerBox;
        if (!answerBox || !value || panel._hand2stackLastPartial === value) return;
        panel._hand2stackLastPartial = value;
        research.log(answerBox, 'candidate_selected', {
            kind: 'partial',
            lineIndex: Number.isInteger(lineIndex) && lineIndex >= 0 ? lineIndex : null,
            latex: research.clip(latex),
            value: research.clip(value)
        }, {modality: panel._hand2stackSource || null});
    };

    // A clicked or shift-extended selection is what Insert inserts, exactly as
    // the Converted for STACK box shows it, like a dragged one.
    const convertSelectedLatex = async (panel, latex, lineIndex) => {
        const requestId = (panel._selectionRequestId || 0) + 1;
        panel._selectionRequestId = requestId;
        const fallback = clientSideStackFallback(latex);
        panel._stackTextarea.value = fallback || latex;
        panel._partialSelection = {lineIndex, value: panel._stackTextarea.value};

        try {
            const stack = await postLatex(latex);
            if (panel._selectionRequestId === requestId) {
                panel._stackTextarea.value = stack || fallback || latex;
                panel._partialSelection.value = panel._stackTextarea.value;
                logPartialSelection(panel, lineIndex, latex, panel._stackTextarea.value);
            }
        } catch (error) {
            window.console.warn('[hand2stack] partial selection conversion failed:', error);
            if (panel._selectionRequestId === requestId) {
                panel._stackTextarea.value = fallback || latex;
                panel._partialSelection.value = panel._stackTextarea.value;
            }
        }
    };

    const interactiveMathLeaves = rendered => {
        const selector = [
            'mjx-mi', 'mjx-mn', 'mjx-mo', 'mjx-mtext', 'mjx-ms',
            '.MathJax span.mi', '.MathJax span.mn', '.MathJax span.mo', '.MathJax span.mtext', '.MathJax span.ms',
            'svg text', 'svg use'
        ].join(', ');
        return Array.from(rendered.querySelectorAll(selector)).filter(node => {
            return !node.querySelector || !node.querySelector(selector);
        });
    };

    const latexForLeafRange = (latex, leaves, start, end) => {
        const mapped = latexDisplayMap(latex);
        const before = Array.from(normalizeSelectableText(
            leaves.slice(0, start).map(node => node.textContent || '').join('')
        )).length;
        const selected = normalizeSelectableText(leaves.slice(start, end + 1).map(node => node.textContent || '').join(''));
        const selectedLength = Array.from(selected).length;
        if (selected && mapped.starts[before] !== undefined && mapped.ends[before + selectedLength - 1] !== undefined) {
            let fragment = mapped.source.slice(mapped.starts[before], mapped.ends[before + selectedLength - 1]).trim();
            const openingBraces = (fragment.match(/\{/g) || []).length;
            const closingBraces = (fragment.match(/\}/g) || []).length;
            if (openingBraces > closingBraces) {
                fragment += '}'.repeat(openingBraces - closingBraces);
            }
            return fragment;
        }
        return selectedLatexFromLine(selected, latex);
    };

    const setupInteractiveFormula = (panel, rendered, line = null) => {
        const leaves = interactiveMathLeaves(rendered);
        if (!leaves.length) {
            return;
        }
        rendered.style.touchAction = 'none';
        const interactionController = new AbortController();
        panel._interactiveControllers = panel._interactiveControllers || [];
        panel._interactiveControllers.push(interactionController);
        if (line) {
            line._interactiveControllers = line._interactiveControllers || [];
            line._interactiveControllers.push(interactionController);
        }
        const documentListenerOptions = {
            capture: true,
            signal: interactionController.signal
        };

        const clearNativeSelection = () => {
            const selection = window.getSelection ? window.getSelection() : null;
            if (selection && typeof selection.removeAllRanges === 'function') {
                selection.removeAllRanges();
            }
        };

        leaves.forEach((leaf, index) => {
            leaf.dataset.stackPartIndex = String(index);
            leaf.style.cursor = 'pointer';
        });

        const applyFormulaSelection = (anchor, clicked, convert = true) => {
            const start = Math.min(anchor, clicked);
            const end = Math.max(anchor, clicked);

            panel._options.querySelectorAll('[data-stack-part-index]').forEach(node => {
                node.style.background = '';
                node.style.borderRadius = '';
            });
            leaves.forEach((node, index) => {
                if (index >= start && index <= end) {
                    node.style.background = '#b9d7ff';
                    node.style.borderRadius = '3px';
                }
            });

            if (convert) {
                const selectedLatex = latexForLeafRange(rendered.dataset.latex || '', leaves, start, end);
                if (selectedLatex) {
                    const option = rendered.closest('[data-result-line-index]');
                    convertSelectedLatex(panel, selectedLatex, option ? Number(option.dataset.resultLineIndex) : -1);
                }
            }
        };

        const previewDraggedSelection = (start, end) => {
            const selectedLatex = latexForLeafRange(rendered.dataset.latex || '', leaves, start, end);
            if (!selectedLatex) {
                return;
            }
            window.clearTimeout(panel._dragConversionTimer);
            const requestId = (panel._selectionRequestId || 0) + 1;
            panel._selectionRequestId = requestId;
            const fallback = clientSideStackFallback(selectedLatex) || selectedLatex;
            const isPartial = Math.min(start, end) > 0 || Math.max(start, end) < leaves.length - 1;
            const option = rendered.closest('[data-result-line-index]');
            const lineIndex = option ? Number(option.dataset.resultLineIndex) : -1;
            const fullLineStack = option ? (option.dataset.stackValue || '') : '';
            panel._stackTextarea.value = fallback;
            panel._partialSelection = {lineIndex, value: fallback};
            panel._dragConversionTimer = window.setTimeout(async () => {
                try {
                    const stack = await postLatex(selectedLatex);
                    if (panel._selectionRequestId !== requestId) {
                        return;
                    }
                    // A partial drag must never be silently promoted back to the
                    // complete candidate line by a late conversion response.
                    panel._stackTextarea.value = isPartial && stack === fullLineStack
                        ? fallback : (stack || fallback);
                    panel._partialSelection.value = panel._stackTextarea.value;
                    logPartialSelection(panel, lineIndex, selectedLatex, panel._partialSelection.value);
                } catch (error) {
                    window.console.warn('[hand2stack] partial selection conversion failed:', error);
                    if (panel._selectionRequestId === requestId) {
                        panel._stackTextarea.value = fallback;
                    }
                }
            }, 150);
        };

        leaves.forEach((leaf, index) => {
            leaf.addEventListener('pointerdown', event => {
                if (event.button !== 0) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                window.clearTimeout(panel._dragConversionTimer);
                panel._selectionRequestId = (panel._selectionRequestId || 0) + 1;
                const option = rendered.closest('[data-result-line-index]');
                if (option && panel._activateLine) {
                    panel._activateLine(Number(option.dataset.resultLineIndex));
                }
                clearNativeSelection();
                rendered._stackDragStart = index;
                rendered._stackDragEnd = index;
                rendered._stackDidDrag = false;
                rendered._stackPointerId = event.pointerId;
                applyFormulaSelection(index, index, false);
            });
        });

        document.addEventListener('pointermove', event => {
            if (rendered._stackDragStart === undefined || event.pointerId !== rendered._stackPointerId) {
                return;
            }
            event.preventDefault();
            let closestIndex = rendered._stackDragEnd;
            let closestDistance = Number.POSITIVE_INFINITY;
            leaves.forEach((leaf, index) => {
                const rect = leaf.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const distance = Math.abs(event.clientX - centerX) + Math.abs(event.clientY - centerY) * 0.25;
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestIndex = index;
                }
            });
            rendered._stackDragEnd = closestIndex;
            rendered._stackDidDrag = rendered._stackDidDrag || closestIndex !== rendered._stackDragStart;
            applyFormulaSelection(rendered._stackDragStart, closestIndex, false);
            if (rendered._stackDidDrag) {
                rendered._stackSuppressClick = true;
                panel._ignoreLineClickUntil = Date.now() + 500;
                previewDraggedSelection(rendered._stackDragStart, closestIndex);
            }
        }, documentListenerOptions);

        document.addEventListener('pointerup', event => {
            if (rendered._stackDragStart === undefined || event.pointerId !== rendered._stackPointerId) {
                return;
            }
            event.preventDefault();
            const start = rendered._stackDragStart;
            const end = rendered._stackDragEnd;
            const didDrag = rendered._stackDidDrag;
            rendered._stackDragStart = undefined;
            rendered._stackDragEnd = undefined;
            rendered._stackPointerId = undefined;
            rendered._stackSelectionAnchor = start;
            clearNativeSelection();
            if (didDrag) {
                rendered._stackSuppressClick = true;
                previewDraggedSelection(start, end);
            }
        }, documentListenerOptions);

        document.addEventListener('pointercancel', () => {
            rendered._stackDragStart = undefined;
            rendered._stackDragEnd = undefined;
            rendered._stackPointerId = undefined;
        }, documentListenerOptions);

        rendered.addEventListener('click', event => {
            const leaf = event.target.closest('[data-stack-part-index]');
            if (!leaf || !rendered.contains(leaf)) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            clearNativeSelection();
            if (rendered._stackSuppressClick) {
                rendered._stackSuppressClick = false;
                return;
            }

            const clicked = Number(leaf.dataset.stackPartIndex);
            const anchor = event.shiftKey && rendered._stackSelectionAnchor !== undefined
                ? rendered._stackSelectionAnchor : clicked;
            rendered._stackSelectionAnchor = anchor;
            applyFormulaSelection(anchor, clicked, true);
        });
    };

    const clearFormulaSelections = panel => {
        panel._options.querySelectorAll('[data-stack-part-index]').forEach(node => {
            node.style.background = '';
            node.style.borderRadius = '';
        });
    };

    return {setupInteractiveFormula, clearFormulaSelections};
});
