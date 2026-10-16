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
 * The STACK answer boxes on the page and the values written into them.
 *
 * @module local_hand2stack/core/stack_inputs
 */
define([], function() {
    const findStackInputs = () => {
        const selectors = [
            'input[data-stack-input-type]',
            'textarea[data-stack-input-type]',
            'input[data-stack-input-decimal-separator]',
            'textarea[data-stack-input-decimal-separator]'
        ];

        const boxes = [];
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                if (!boxes.includes(el)) {
                    boxes.push(el);
                }
            });
        });
        return boxes;
    };

    const processInputName = input => {
        const parsed = input ? parseStackInputName(input.name) : null;
        return parsed ? parsed.input : String((input && input.name) || '');
    };

    const isProcessInput = input => {
        return Boolean(input
            && input.tagName === 'TEXTAREA'
            && /^process\d*$/i.test(processInputName(input)));
    };

    const prepareProcessInputs = () => {
        findStackInputs().filter(isProcessInput).forEach(input => {
            input.hidden = true;
            input.setAttribute('aria-hidden', 'true');
            input.dataset.hand2stackProcess = 'true';
        });
    };

    // STACK input types that take one typed expression or text. Choice
    // inputs (radio, checkbox, dropdown) submit an option key that must never
    // be overwritten, and a matrix spreads one answer over many cells.
    const SUPPORTED_INPUT_TYPES = ['algebraic', 'numerical', 'units', 'textarea', 'equiv', 'notes', 'string', 'freetext'];

    const isSupportedAnswerBox = input => {
        const isText = input.tagName === 'TEXTAREA'
            || (input.tagName === 'INPUT' && String(input.type || 'text').toLowerCase() === 'text');
        const type = String(input.dataset.stackInputType || '').toLowerCase();
        return isText && SUPPORTED_INPUT_TYPES.includes(type);
    };

    // A read-only or disabled box (a review page, or an answer locked after
    // Check) would show an inserted value that is never submitted.
    const isEditableAnswerBox = input => !input.readOnly && !input.disabled;

    const findAnswerBoxes = () => findStackInputs().filter(input => {
        return input.offsetParent !== null && !isProcessInput(input)
            && isSupportedAnswerBox(input) && isEditableAnswerBox(input);
    });

    // Locked Free-text answers: the review page, or a box locked after Check.
    const findLockedFreeTextBoxes = () => findStackInputs().filter(input => {
        return input.offsetParent !== null && isSupportedAnswerBox(input)
            && isFreeTextInput(input) && !isEditableAnswerBox(input);
    });

    const setAnswerValue = (input, value) => {
        input.focus();
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const setBackgroundValue = (input, value) => {
        if (!input || input.value === value) return;
        input.value = value;
        input.dispatchEvent(new Event('input', {bubbles: true}));
        input.dispatchEvent(new Event('change', {bubbles: true}));
    };

    const findProcessInput = answerBox => {
        const question = answerBox && answerBox.closest('.que');
        if (!question) return null;
        return findStackInputs().find(input => question.contains(input) && isProcessInput(input)) || null;
    };

    const processValueForLines = lines => {
        if (!Array.isArray(lines)) return '';
        // An edited row is what the learner wrote now: its validated STACK
        // value once the server has converted that edit, its ASCII until then.
        const value = line => line.edited
            ? (line._validatedAscii === line.ascii && line._validatedStack ? line._validatedStack : line.ascii)
            : (line._validatedStack || line.stack || line.ascii || line.math);
        return lines.filter(line => !line.synthetic
                && String((line && line.type) || 'expression').toLowerCase() !== 'text')
            .map(line => String((line && value(line)) || '').trim())
            .filter(Boolean)
            .join('\n');
    };

    const syncProcessValue = (answerBox, value) => {
        const processInput = findProcessInput(answerBox);
        if (!processInput) return;
        setBackgroundValue(processInput, value);
    };

    const syncProcessInput = (answerBox, lines) => {
        syncProcessValue(answerBox, processValueForLines(lines));
    };

    const isFreeTextInput = input => {
        return Boolean(input && String(input.dataset.stackInputType || '').toLowerCase() === 'freetext');
    };

    // Capture each answer box's own Syntax hint once, at bind time. STACK
    // renders the hint as either the `placeholder` or, only while the box is
    // blank, the `value`. A page reloaded with a saved answer has that answer
    // in `value`, so a value is accepted as a hint only when it looks like a
    // label ("f(2)=" / "f(2):"), never a saved answer such as "1+2*sqrt(2)".
    const captureAnswerAnchor = box => {
        if (isFreeTextInput(box) || box.dataset.hand2stackAnchor) {
            return;
        }
        const value = String(box.value || '').trim();
        const hint = String(box.getAttribute('placeholder') || '').trim()
            || (/[=:]$/.test(value) ? value : '');
        if (hint) {
            box.dataset.hand2stackAnchor = hint;
        }
    };

    // STACK input names look like "q43:4_fval": usage id, slot, input name.
    const parseStackInputName = name => {
        const match = /^q(\d+):(\d+)_(.+)$/.exec(String(name || ''));
        return match ? {usage: match[1], slot: match[2], input: match[3]} : null;
    };

    // Other STACK inputs that live in the same question as a free-text box,
    // so one photo of the full working can also fill in their small answer
    // boxes (e.g. f(2)= / g(1)= inputs alongside a "show your work" box).
    const findSiblingAnswerBoxes = answerBox => {
        const question = answerBox.closest('.que');
        if (!question) {
            return [];
        }
        return findAnswerBoxes().filter(box => box !== answerBox
            && question.contains(box)
            && !isFreeTextInput(box));
    };

    return {
        findStackInputs, processInputName, prepareProcessInputs, findAnswerBoxes, findLockedFreeTextBoxes,
        setAnswerValue, setBackgroundValue, findProcessInput, processValueForLines, syncProcessValue,
        syncProcessInput, isFreeTextInput, captureAnswerAnchor, parseStackInputName, findSiblingAnswerBoxes
    };
});
