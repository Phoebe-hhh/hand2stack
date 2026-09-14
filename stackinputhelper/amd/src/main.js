// This file is part of Moodle - http://moodle.org/.
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// @package local_stackinputhelper
// @copyright 2026 Phoebe Huang
// @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later

define([], function() {
    const pluginUrl = (path) => {
        return window.location.origin + '/local/stackinputhelper/' + path;
    };

    const replaceLegacyNodeUrl = (url, fallback) => {
        if (!url || /:3001\b/.test(url) || /\/mobile\/[A-Za-z0-9]+/.test(url)) {
            return fallback;
        }
        return url;
    };

    const defaultConfig = {
        recognizeUrl: '',
        strokesUrl: '',
        convertUrl: '',
        sessionCreateUrl: '',
        sessionResultUrl: '',
        sesskey: '',
        enablemobile: true,
        uploadbtn: 'Upload math image',
        mobilebtn: 'Mobile Math Upload',
        uploading: 'Recognizing...',
        recognizefailed: 'Recognition failed.',
        recognizedresults: 'Recognized results',
        selectanswer: 'Select the answer to insert into STACK:',
        selectpart: 'Click a symbol, or drag across the formula to select a range.',
        recommendedanswer: 'Recommended answer',
        stackpreview: 'STACK input preview:',
        insertanswer: 'Insert answer',
        rawlatex: 'Raw LaTeX',
        recognizedformat: 'Recognized format:',
        asciimath: 'ASCII',
        lineprefix: 'Line',
        creatingmobilesession: 'Creating mobile upload session...',
        waitingmobileupload: 'Waiting for mobile upload...',
        mobileuploadreceived: 'Successfully received mobile result. You can upload another photo with the same QR code.',
        mobileuploadexpired: 'This mobile upload session has expired.',
        mobileuploadtimeout: 'Timeout waiting for result. Please create a new session.',
        mobilesessionfailed: 'Failed to create mobile session:',
        partialselectionfailed: 'Could not convert the selected text.',
        handwritebtn: 'Handwrite math',
        handwriteinstructions: 'Write with Apple Pencil or a mouse. Use a finger to scroll.',
        undo: 'Undo',
        clear: 'Clear',
        recognizestrokes: 'Recognize handwriting',
        nostrokes: 'Write an expression first.'
    };
    let config = {};

    const findAnswerBoxes = () => {
        const selectors = [
            'input[data-stack-input-type]',
            'textarea[data-stack-input-type]',
            'input[data-stack-input-decimalseparator]',
            'textarea[data-stack-input-decimalseparator]'
        ];

        const boxes = [];
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                if (el.offsetParent !== null && !boxes.includes(el)) {
                    boxes.push(el);
                }
            });
        });
        return boxes;
    };

    const createHiddenFileInput = () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.setAttribute('capture', 'environment');
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
        return fileInput;
    };

    const setAnswerValue = (input, value) => {
        input.focus();
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const postImage = async (url, file, extra = {}) => {
        if (!url) {
            throw new Error('Recognition endpoint is not configured.');
        }

        const formData = new FormData();
        formData.append('image', file);
        formData.append('sesskey', config.sesskey);
        Object.keys(extra).forEach(key => formData.append(key, extra[key]));

        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || ('HTTP ' + response.status));
        }

        return data;
    };

    const postLatex = async (latex) => {
        if (!config.convertUrl) {
            throw new Error('Conversion endpoint is not configured.');
        }

        const formData = new FormData();
        formData.append('latex', latex);
        formData.append('sesskey', config.sesskey);

        const response = await fetch(config.convertUrl, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || ('HTTP ' + response.status));
        }

        return data.stack || '';
    };

    const postStrokes = async (strokes) => {
        const formData = new FormData();
        formData.append('strokes', JSON.stringify(strokes));
        formData.append('sesskey', config.sesskey);
        const response = await fetch(config.strokesUrl, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || ('HTTP ' + response.status));
        }
        return data;
    };

    const createTextarea = (value, readonly) => {
        const ta = document.createElement('textarea');
        ta.value = value || '';
        ta.readOnly = readonly;
        ta.rows = 2;
        ta.style.width = '100%';
        ta.style.boxSizing = 'border-box';
        ta.style.marginTop = '4px';
        ta.style.marginBottom = '8px';
        ta.style.fontSize = '13px';
        ta.style.fontFamily = 'monospace';
        return ta;
    };

    const createResultPanel = () => {
        const panel = document.createElement('div');
        const choiceName = 'local-stackinputhelper-line-choice-' + Math.random().toString(36).slice(2);
        panel.style.marginTop = '8px';
        panel.style.padding = '8px';
        panel.style.border = '1px solid #ddd';
        panel.style.background = '#fafafa';
        panel.style.display = 'none';
        panel.style.maxWidth = '720px';

        const title = document.createElement('div');
        title.textContent = config.recognizedresults || 'Recognized results';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '4px';

        const instruction = document.createElement('div');
        instruction.textContent = config.selectanswer || 'Select the answer to insert into STACK:';
        instruction.style.marginBottom = '8px';

        const options = document.createElement('div');
        options.style.display = 'grid';
        options.style.gap = '6px';
        options.style.marginBottom = '8px';

        const formatTitle = document.createElement('div');
        formatTitle.textContent = config.recognizedformat || 'Recognized format:';
        formatTitle.style.fontWeight = 'bold';

        const formatTabs = document.createElement('div');
        formatTabs.setAttribute('role', 'tablist');
        formatTabs.style.display = 'flex';
        formatTabs.style.gap = '4px';
        formatTabs.style.marginTop = '4px';

        const latexTab = document.createElement('button');
        latexTab.type = 'button';
        latexTab.textContent = config.rawlatex || 'LaTeX';
        latexTab.setAttribute('role', 'tab');

        const asciiTab = document.createElement('button');
        asciiTab.type = 'button';
        asciiTab.textContent = config.asciimath || 'ASCII';
        asciiTab.setAttribute('role', 'tab');

        [latexTab, asciiTab].forEach(tab => {
            tab.style.padding = '4px 10px';
            tab.style.border = '1px solid #b8c2cc';
            tab.style.borderRadius = '4px 4px 0 0';
            tab.style.cursor = 'pointer';
        });
        formatTabs.appendChild(asciiTab);
        formatTabs.appendChild(latexTab);

        const rawTextarea = createTextarea('', true);
        rawTextarea.setAttribute('role', 'tabpanel');
        rawTextarea.style.marginTop = '0';

        const stackTitle = document.createElement('label');
        stackTitle.textContent = config.stackpreview || 'STACK input preview:';
        stackTitle.style.display = 'block';
        stackTitle.style.fontWeight = 'bold';
        const stackTextarea = createTextarea('', false);
        const stackTextareaId = 'local-stackinputhelper-stack-preview-' + Math.random().toString(36).slice(2);
        stackTextarea.id = stackTextareaId;
        stackTitle.setAttribute('for', stackTextareaId);

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.textContent = config.insertanswer || 'Insert answer';
        applyBtn.style.padding = '4px 8px';
        applyBtn.style.cursor = 'pointer';

        panel.appendChild(title);
        panel.appendChild(instruction);
        panel.appendChild(options);
        panel.appendChild(formatTitle);
        panel.appendChild(formatTabs);
        panel.appendChild(rawTextarea);
        panel.appendChild(stackTitle);
        panel.appendChild(stackTextarea);
        panel.appendChild(applyBtn);

        panel._options = options;
        panel._rawTextarea = rawTextarea;
        panel._latexTab = latexTab;
        panel._asciiTab = asciiTab;
        panel._stackTextarea = stackTextarea;
        panel._applyBtn = applyBtn;
        panel._choiceName = choiceName;

        return panel;
    };

    const createMobilePanel = () => {
        const panel = document.createElement('div');
        panel.style.marginTop = '8px';
        panel.style.padding = '8px';
        panel.style.border = '1px solid #ddd';
        panel.style.background = '#f8fbff';
        panel.style.display = 'none';

        const title = document.createElement('div');
        title.textContent = config.mobilebtn || 'Mobile Math Upload';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '8px';

        const tip = document.createElement('div');
        tip.textContent = 'Scan the QR code with your phone, log in if needed, and upload the image.';
        tip.style.marginBottom = '8px';

        const qrImg = document.createElement('img');
        qrImg.style.display = 'block';
        qrImg.style.maxWidth = '220px';
        qrImg.style.border = '1px solid #ddd';
        qrImg.style.marginBottom = '8px';

        const link = document.createElement('a');
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.wordBreak = 'break-all';
        link.style.display = 'block';
        link.style.marginBottom = '8px';

        const warning = document.createElement('div');
        warning.style.display = 'none';
        warning.style.marginBottom = '8px';
        warning.style.padding = '8px';
        warning.style.border = '1px solid #f0ad4e';
        warning.style.background = '#fff8e5';
        warning.style.color = '#6b4b00';

        const status = document.createElement('div');
        status.textContent = 'Session not created';
        status.style.color = '#555';

        panel.appendChild(title);
        panel.appendChild(tip);
        panel.appendChild(qrImg);
        panel.appendChild(link);
        panel.appendChild(warning);
        panel.appendChild(status);

        panel._qrImg = qrImg;
        panel._link = link;
        panel._warning = warning;
        panel._status = status;
        return panel;
    };

    const escapeHtml = (value) => {
        return String(value || '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    };

    const renderLatex = (latex) => {
        const value = String(latex || '').trim();
        return value ? '\\(' + escapeHtml(value) + '\\)' : '';
    };

    const typesetMath = (element) => {
        if (!window.MathJax || !element) {
            return Promise.resolve();
        }

        if (typeof window.MathJax.typesetPromise === 'function') {
            return window.MathJax.typesetPromise([element]).catch(error => {
                window.console.warn('[stackinputhelper] MathJax typeset failed:', error);
            });
        }

        if (window.MathJax.Hub && typeof window.MathJax.Hub.Queue === 'function') {
            return new Promise(resolve => {
                window.MathJax.Hub.Queue(['Typeset', window.MathJax.Hub, element], resolve);
            });
        }
        return Promise.resolve();
    };

    const normalizeResultLines = (rawLatex, stackResult, lines) => {
        if (Array.isArray(lines) && lines.length) {
            const lastIndex = lines.length - 1;
            return lines.map((line, index) => ({
                latex: String(line.latex || '').trim(),
                display: String(line.display || line.latex || '').trim(),
                displayParts: Array.isArray(line.display_parts) ? line.display_parts : [],
                math: String(line.math || '').trim(),
                stack: String(line.stack || line.text || '').trim(),
                recommended: index === lastIndex
            })).filter(line => line.latex || line.stack);
        }

        const latex = String(rawLatex || stackResult || '').trim();
        const stack = String(stackResult || latex || '').trim();
        return latex || stack ? [{ latex, stack, recommended: true }] : [];
    };

    const selectionInside = (selection, container) => {
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            return false;
        }

        const range = selection.getRangeAt(0);
        return container.contains(range.commonAncestorContainer);
    };

    const normalizeSelectableText = (value) => {
        return String(value || '')
            .replace(/[−–—]/g, '-')
            .replace(/\s+/g, '')
            .trim();
    };

    const latexDisplayMap = (latex) => {
        const source = String(latex || '');
        const chars = [];
        const starts = [];
        const ends = [];

        for (let i = 0; i < source.length; i++) {
            const char = source[i];
            if (/\s/.test(char) || char === '&') {
                continue;
            }

            if (char === '\\') {
                const match = source.slice(i).match(/^\\[a-zA-Z]+/);
                if (match) {
                    const command = match[0];
                    const symbols = {
                        '\\cdot': '*', '\\times': '*', '\\prod': '∏', '\\sum': '∑',
                        '\\int': '∫', '\\infty': '∞', '\\leq': '≤', '\\geq': '≥',
                        '\\pi': 'π', '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ',
                        '\\delta': 'δ', '\\theta': 'θ', '\\lambda': 'λ', '\\mu': 'μ',
                        '\\sigma': 'σ', '\\phi': 'φ', '\\omega': 'ω'
                    };
                    if (symbols[command]) {
                        chars.push(symbols[command]);
                        starts.push(i);
                        ends.push(i + command.length);
                    }
                    i += command.length - 1;
                    continue;
                }
            }

            if (char === '^' || char === '_') {
                const start = i;
                if (source[i + 1] === '{') {
                    let depth = 1;
                    let j = i + 2;
                    while (j < source.length && depth > 0) {
                        if (source[j] === '{') {
                            depth++;
                        } else if (source[j] === '}') {
                            depth--;
                        }
                        j++;
                    }
                    const exponent = source.slice(i + 2, j - 1).replace(/\s+/g, '');
                    let sourceOffset = i + 2;
                    for (const expchar of exponent) {
                        chars.push(expchar);
                        starts.push(sourceOffset);
                        sourceOffset += expchar.length;
                        ends.push(sourceOffset);
                    }
                    i = j - 1;
                    continue;
                }

                if (source[i + 1]) {
                    chars.push(source[i + 1]);
                    starts.push(start);
                    ends.push(i + 2);
                    i++;
                }
                continue;
            }

            if (char === '{' || char === '}') {
                continue;
            }

            chars.push(char);
            starts.push(i);
            ends.push(i + 1);
        }

        return { text: chars.join(''), starts, ends, source };
    };

    const selectedLatexFromLine = (selectedText, latex) => {
        const normalized = normalizeSelectableText(selectedText);
        if (!normalized) {
            return '';
        }

        const mapped = latexDisplayMap(latex);
        const start = normalizeSelectableText(mapped.text).indexOf(normalized);
        if (start === -1) {
            return '';
        }

        const end = start + normalized.length - 1;
        const sourceStart = mapped.starts[start];
        const sourceEnd = mapped.ends[end];
        return mapped.source.slice(sourceStart, sourceEnd).trim();
    };

    const readSelectedLatex = (container) => {
        const selection = window.getSelection ? window.getSelection() : null;
        if (!selectionInside(selection, container)) {
            return '';
        }

        const range = selection.getRangeAt(0);
        const selectedText = selection.toString().replace(/\s+/g, ' ').trim();
        const mathNodes = Array.from(container.querySelectorAll('[data-latex]')).filter(node => {
            return typeof range.intersectsNode === 'function' && range.intersectsNode(node);
        });

        if (mathNodes.length === 1) {
            const latex = selectedLatexFromLine(selectedText, mathNodes[0].dataset.latex || '');
            if (latex) {
                return latex;
            }
        }

        return selectedText;
    };

    const clientSideStackFallback = (value) => {
        let stack = String(value || '').trim();
        if (!stack) {
            return '';
        }

        stack = stack.replace(/[−–—]/g, '-');
        stack = stack.replace(/[𝑥𝒙𝓍]/g, 'x');
        stack = stack.replace(/[𝑦𝒚𝓎]/g, 'y');
        stack = stack.replace(/[𝑧𝒛𝓏]/g, 'z');
        stack = stack.replace(/[²]/g, '^2');
        stack = stack.replace(/[³]/g, '^3');
        stack = stack.replace(/[⁴]/g, '^4');
        stack = stack.replace(/[⁵]/g, '^5');
        stack = stack.replace(/[⁶]/g, '^6');
        stack = stack.replace(/[⁷]/g, '^7');
        stack = stack.replace(/[⁸]/g, '^8');
        stack = stack.replace(/[⁹]/g, '^9');
        stack = stack.replace(/[⁰]/g, '^0');
        stack = stack.replace(/\\cdot|\\times/g, '*');
        stack = stack.replace(/\^\{([^{}]+)\}/g, '^$1');
        stack = stack.replace(/[{}]/g, '');
        stack = stack.replace(/\s+/g, '');
        stack = stack.replace(/(\d)([A-Za-z])/g, '$1*$2');
        stack = stack.replace(/\)([A-Za-z])/g, ')*$1');
        stack = stack.replace(/([A-Za-z])\(/g, '$1*(');

        return stack;
    };

    const superscriptDisplay = (value) => {
        const superscripts = {
            '0': '⁰',
            '1': '¹',
            '2': '²',
            '3': '³',
            '4': '⁴',
            '5': '⁵',
            '6': '⁶',
            '7': '⁷',
            '8': '⁸',
            '9': '⁹',
            '+': '⁺',
            '-': '⁻'
        };

        return String(value || '').split('').map(char => superscripts[char] || char).join('');
    };

    const parseLatexGroup = (source, start) => {
        let i = start;
        while (/\s/.test(source[i] || '')) {
            i++;
        }
        if (source[i] !== '{') {
            return null;
        }

        let depth = 1;
        let j = i + 1;
        while (j < source.length && depth > 0) {
            if (source[j] === '{') {
                depth++;
            } else if (source[j] === '}') {
                depth--;
            }
            j++;
        }
        if (depth !== 0) {
            return null;
        }

        return {
            value: source.slice(i + 1, j - 1).trim(),
            end: j
        };
    };

    const parseLatexFraction = (source, start) => {
        const numerator = parseLatexGroup(source, start);
        if (!numerator) {
            return null;
        }
        const denominator = parseLatexGroup(source, numerator.end);
        if (!denominator) {
            return null;
        }

        return {
            numerator: numerator.value,
            denominator: denominator.value,
            end: denominator.end
        };
    };

    const latexTokens = (latex) => {
        const source = String(latex || '');
        const tokens = [];

        for (let i = 0; i < source.length; i++) {
            const char = source[i];
            if (/\s/.test(char) || char === '&') {
                continue;
            }

            if (char === '\\') {
                const match = source.slice(i).match(/^\\[a-zA-Z]+/);
                if (match) {
                    const command = match[0];
                    if (command === '\\frac') {
                        const parsed = parseLatexFraction(source, i + command.length);
                        if (parsed) {
                            // Use STACK-compatible linear punctuation around the recursively
                            // tokenized operands. This keeps the whole fraction selectable while
                            // also allowing a user to pick just one symbol from either operand.
                            tokens.push({latex: '(', display: '('});
                            tokens.push(...latexTokens(parsed.numerator));
                            tokens.push({latex: ')/(', display: ')/('});
                            tokens.push(...latexTokens(parsed.denominator));
                            tokens.push({latex: ')', display: ')'});
                            i = parsed.end - 1;
                            continue;
                        }
                    }
                    const commandDisplay = {
                        '\\cdot': '·', '\\times': '×', '\\div': '÷', '\\pi': 'π',
                        '\\infty': '∞', '\\rightarrow': '→', '\\longrightarrow': '→',
                        '\\to': '→', '\\sum': 'Σ', '\\prod': '∏', '\\int': '∫',
                        '\\sqrt': '√', '\\partial': '∂', '\\leq': '≤', '\\leqslant': '≤',
                        '\\geq': '≥', '\\geqslant': '≥', '\\neq': '≠', '\\ne': '≠'
                    };
                    tokens.push({
                        latex: command,
                        display: commandDisplay[command] || command.replace(/^\\/, '')
                    });
                    i += command.length - 1;
                    continue;
                }
            }

            if (char === '^') {
                if (source[i + 1] === '{') {
                    let depth = 1;
                    let j = i + 2;
                    while (j < source.length && depth > 0) {
                        if (source[j] === '{') {
                            depth++;
                        } else if (source[j] === '}') {
                            depth--;
                        }
                        j++;
                    }
                    const exponent = source.slice(i + 2, j - 1).replace(/\s+/g, '');
                    tokens.push({
                        latex: '^{' + exponent + '}',
                        display: superscriptDisplay(exponent)
                    });
                    i = j - 1;
                    continue;
                }

                if (source[i + 1]) {
                    tokens.push({
                        latex: '^' + source[i + 1],
                        display: superscriptDisplay(source[i + 1])
                    });
                    i++;
                }
                continue;
            }

            if (char === '{' || char === '}') {
                continue;
            }

            tokens.push({ latex: char, display: char });
        }

        return tokens;
    };

    const convertSelectedLatex = async (panel, latex) => {
        const requestId = (panel._selectionRequestId || 0) + 1;
        panel._selectionRequestId = requestId;
        const fallback = clientSideStackFallback(latex);
        panel._stackTextarea.value = fallback || latex;

        try {
            const stack = await postLatex(latex);
            if (panel._selectionRequestId === requestId) {
                panel._stackTextarea.value = stack || fallback || latex;
            }
        } catch (error) {
            window.console.warn('[stackinputhelper] partial selection conversion failed:', error);
            if (panel._selectionRequestId === requestId) {
                panel._stackTextarea.value = fallback || latex;
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

    const setupInteractiveFormula = (panel, rendered) => {
        const leaves = interactiveMathLeaves(rendered);
        if (!leaves.length) {
            return;
        }
        rendered.style.touchAction = 'none';
        const documentListenerOptions = {
            capture: true,
            signal: panel._selectionAbortController.signal
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
                    convertSelectedLatex(panel, selectedLatex);
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
                } catch (error) {
                    window.console.warn('[stackinputhelper] partial selection conversion failed:', error);
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
                clearTokenSelections(panel);
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

    const selectTokenRange = (row, start, end) => {
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        row.querySelectorAll('[data-token-index]').forEach(token => {
            const index = Number(token.dataset.tokenIndex);
            token.style.background = index >= min && index <= max ? '#cfe3ff' : '';
        });

        row._selectionStart = min;
        row._selectionEnd = max;
    };

    const clearTokenSelections = (panel, exceptRow = null) => {
        (panel._tokenRows || []).forEach(row => {
            if (row === exceptRow) {
                return;
            }
            row.querySelectorAll('[data-token-index]').forEach(token => {
                token.style.background = '';
            });
            row._selectionStart = null;
            row._selectionEnd = null;
            row._dragging = false;
        });
    };

    const clearFormulaSelections = panel => {
        panel._options.querySelectorAll('[data-stack-part-index]').forEach(node => {
            node.style.background = '';
            node.style.borderRadius = '';
        });
    };

    const createTokenSelector = (panel, latex) => {
        const tokens = latexTokens(latex);
        if (!tokens.length) {
            return null;
        }

        const row = document.createElement('span');
        row.style.display = 'inline-flex';
        row.style.flexWrap = 'wrap';
        row.style.alignItems = 'baseline';
        row.style.gap = '2px';
        row.style.marginTop = '0';
        row.style.padding = '2px 0';
        row.style.fontFamily = 'serif';
        row.style.fontSize = '20px';
        row.style.userSelect = 'none';
        row._tokens = tokens;
        panel._tokenRows = panel._tokenRows || [];
        panel._tokenRows.push(row);

        tokens.forEach((token, index) => {
            const tokenEl = document.createElement('span');
            tokenEl.dataset.tokenIndex = String(index);
            tokenEl.dataset.latex = token.latex;
            tokenEl.textContent = token.display;
            tokenEl.style.cursor = 'text';
            tokenEl.style.borderRadius = '2px';
            tokenEl.style.padding = '0 1px';

            tokenEl.addEventListener('mousedown', event => {
                event.preventDefault();
                event.stopPropagation();
                const option = row.closest('[data-result-line-index]');
                if (option && panel._activateLine) {
                    panel._activateLine(Number(option.dataset.resultLineIndex));
                }
                clearFormulaSelections(panel);
                clearTokenSelections(panel, row);
                row._dragging = true;
                selectTokenRange(row, index, index);
            });

            tokenEl.addEventListener('mouseenter', () => {
                if (row._dragging) {
                    selectTokenRange(row, row._selectionStart, index);
                }
            });

            row.appendChild(tokenEl);
        });

        document.addEventListener('mouseup', () => {
            if (!row._dragging) {
                return;
            }

            row._dragging = false;
            const selected = row._tokens
                .slice(row._selectionStart, row._selectionEnd + 1)
                .map(token => token.latex)
                .join('');
            if (selected) {
                convertSelectedLatex(panel, selected);
            }
        }, {signal: panel._selectionAbortController.signal});

        return row;
    };

    const createLineContent = (panel, line) => {
        const container = document.createElement('span');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.alignItems = 'flex-start';
        container.style.gap = '4px';
        container.style.fontFamily = 'inherit';

        const displayRow = document.createElement('span');
        displayRow.style.display = 'inline-flex';
        displayRow.style.flexWrap = 'wrap';
        displayRow.style.alignItems = 'center';
        displayRow.style.gap = '4px';
        displayRow.style.minHeight = '28px';
        container.appendChild(displayRow);

        const parts = line.displayParts.length ? line.displayParts : [{
            type: line.math ? 'math' : 'text',
            text: line.display || line.latex || line.stack || '',
            latex: line.math || ''
        }];

        parts.forEach(part => {
            if (part.type === 'math' && part.latex) {
                const rendered = document.createElement('span');
                rendered.textContent = '\\(' + part.latex + '\\)';
                rendered.style.display = 'inline-block';
                rendered.style.fontSize = '20px';
                rendered.style.lineHeight = '1.25';
                rendered.setAttribute('aria-label', part.latex);
                rendered.dataset.latex = part.latex;
                displayRow.appendChild(rendered);

                rendered.dataset.interactiveFormula = '1';
                rendered.title = config.selectpart || 'Click a symbol, or drag across the formula to select a range.';
                return;
            }

            const text = document.createElement('span');
            text.textContent = String(part.text || '').replace(/[$¥￥]/g, '');
            text.style.whiteSpace = 'pre-wrap';
            text.style.fontFamily = 'inherit';
            displayRow.appendChild(text);
        });

        return container;
    };

    const updateResultPanel = (panel, rawLatex, rawAscii, stackResult, answerBox, lines) => {
        window.clearTimeout(panel._dragConversionTimer);
        panel._selectionRequestId = (panel._selectionRequestId || 0) + 1;
        if (panel._selectionAbortController) {
            panel._selectionAbortController.abort();
        }
        panel._selectionAbortController = new AbortController();
        const resultLines = normalizeResultLines(rawLatex, stackResult, lines);
        let defaultIndex = Math.max(0, resultLines.length - 1);
        for (let i = resultLines.length - 1; i >= 0; i--) {
            if (resultLines[i].stack) {
                defaultIndex = i;
                break;
            }
        }
        panel.style.display = 'block';
        const formats = {
            latex: rawLatex || '',
            ascii: rawAscii || ''
        };
        const selectFormat = format => {
            const isAscii = format === 'ascii' && formats.ascii;
            panel._rawTextarea.value = isAscii ? formats.ascii : formats.latex;
            panel._latexTab.setAttribute('aria-selected', isAscii ? 'false' : 'true');
            panel._asciiTab.setAttribute('aria-selected', isAscii ? 'true' : 'false');
            panel._latexTab.style.background = isAscii ? '#fff' : '#e8f1ff';
            panel._asciiTab.style.background = isAscii ? '#e8f1ff' : '#fff';
        };
        panel._asciiTab.disabled = !formats.ascii;
        panel._asciiTab.title = formats.ascii ? '' : (config.asciiunavailable || 'ASCII was not returned for this image.');
        panel._latexTab.onclick = () => selectFormat('latex');
        panel._asciiTab.onclick = () => selectFormat('ascii');
        selectFormat(formats.ascii ? 'ascii' : 'latex');
        panel._options.innerHTML = '';
        panel._tokenRows = [];
        panel._selectionBoxes = [];
        panel._optionWrappers = [];

        const showSelectionBoxes = selectedIndex => {
            panel._selectionBoxes.forEach((boxes, index) => {
                boxes.forEach(box => {
                    box.style.display = index === selectedIndex ? 'flex' : 'none';
                });
            });
        };

        const showSelectedLine = selectedIndex => {
            panel._optionWrappers.forEach((option, index) => {
                const selected = index === selectedIndex;
                option.style.border = selected ? '1px solid #8ab4f8' : '1px solid #e2e2e2';
                option.style.background = selected ? '#f3f8ff' : '#fff';
            });
        };

        const selectLine = (index, line) => {
            window.clearTimeout(panel._dragConversionTimer);
            panel._partialSelection = null;
            panel._selectionRequestId = (panel._selectionRequestId || 0) + 1;
            clearTokenSelections(panel);
            clearFormulaSelections(panel);
            showSelectionBoxes(index);
            showSelectedLine(index);
            panel._stackTextarea.value = line.stack || line.math || '';
        };

        panel._activateLine = index => {
            const input = panel._options.querySelector('input[type="radio"][value="' + index + '"]');
            if (input) {
                input.checked = true;
            }
            showSelectionBoxes(index);
            showSelectedLine(index);
        };

        resultLines.forEach((line, index) => {
            const isDefault = index === defaultIndex;
            const optionId = 'local-stackinputhelper-line-' + Math.random().toString(36).slice(2);
            const wrapper = document.createElement('div');
            wrapper.dataset.resultLineIndex = String(index);
            wrapper.dataset.stackValue = line.stack || line.math || '';
            wrapper.style.display = 'grid';
            wrapper.style.gridTemplateColumns = 'auto 1fr';
            wrapper.style.columnGap = '8px';
            wrapper.style.alignItems = 'start';
            wrapper.style.padding = '5px 6px';
            wrapper.style.border = isDefault ? '1px solid #8ab4f8' : '1px solid #e2e2e2';
            wrapper.style.background = isDefault ? '#f3f8ff' : '#fff';
            wrapper.style.cursor = 'pointer';
            wrapper.style.userSelect = 'text';

            const input = document.createElement('input');
            input.type = 'radio';
            input.name = panel._choiceName;
            input.id = optionId;
            input.value = String(index);
            input.checked = isDefault;
            input.style.marginTop = '3px';

            const body = document.createElement('span');
            body.style.display = 'block';
            const prefix = document.createElement('span');
            prefix.textContent = (config.lineprefix || 'Line') + ' ' + (index + 1);
            if (isDefault) {
                prefix.textContent += ' - ' + (config.recommendedanswer || 'Recommended answer');
            }
            prefix.style.display = 'block';
            prefix.style.fontSize = '12px';
            prefix.style.color = '#555';
            prefix.style.marginBottom = '2px';

            const lineContent = createLineContent(panel, line);
            const selectionBoxes = Array.from(lineContent.querySelectorAll('[data-token-selection-box]'));
            selectionBoxes.forEach(box => {
                box.style.display = isDefault ? 'flex' : 'none';
            });
            panel._selectionBoxes.push(selectionBoxes);

            body.appendChild(prefix);
            body.appendChild(lineContent);
            wrapper.appendChild(input);
            wrapper.appendChild(body);
            panel._options.appendChild(wrapper);
            panel._optionWrappers.push(wrapper);

            wrapper.addEventListener('pointerdown', event => {
                if (!event.target.closest('[data-token-index], [data-stack-part-index]')) {
                    panel._partialSelection = null;
                }
            }, true);

            wrapper.addEventListener('click', event => {
                if ((panel._ignoreLineClickUntil || 0) > Date.now()) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (panel._partialSelection && panel._partialSelection.lineIndex === index) {
                        panel._stackTextarea.value = panel._partialSelection.value;
                    }
                    return;
                }
                if (panel._partialSelection && panel._partialSelection.lineIndex === index) {
                    event.preventDefault();
                    event.stopPropagation();
                    panel._stackTextarea.value = panel._partialSelection.value;
                    return;
                }
                if (event.target.closest('[data-token-index], [data-stack-part-index]')) {
                    return;
                }
                input.checked = true;
                selectLine(index, line);
            });

            input.addEventListener('change', () => {
                if (input.checked) {
                    if (panel._partialSelection && panel._partialSelection.lineIndex === index) {
                        panel._stackTextarea.value = panel._partialSelection.value;
                        return;
                    }
                    selectLine(index, line);
                }
            });
        });

        const selected = resultLines[defaultIndex];
        panel._stackTextarea.value = selected ? (selected.stack || selected.math || '') : (stackResult || '');
        panel._applyBtn.onclick = () => setAnswerValue(answerBox, panel._stackTextarea.value || '');
        typesetMath(panel._options).then(() => {
            panel._options.querySelectorAll('[data-interactive-formula]').forEach(rendered => {
                setupInteractiveFormula(panel, rendered);
            });
        });
    };

    const createMobileSession = async () => {
        const formData = new FormData();
        formData.append('sesskey', config.sesskey);

        const response = await fetch(config.sessionCreateUrl, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || ('HTTP ' + response.status));
        }

        return data;
    };

    const fetchSessionResult = async (sessionId) => {
        const separator = config.sessionResultUrl.indexOf('?') === -1 ? '?' : '&';
        const response = await fetch(config.sessionResultUrl + separator + 'session=' + encodeURIComponent(sessionId), {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || ('HTTP ' + response.status));
        }

        return data;
    };

    const buildQrDataUrl = (svg) => {
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(String(svg || ''));
    };

    const icons = {
        image: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"></rect><circle cx="8.5" cy="8.5" r="1.5" fill="none" stroke="currentColor" stroke-width="2"></circle><path d="M21 15l-5-5L5 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
        camera: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M14.5 4l1.5 2H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l1.5-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"></circle></svg>',
        pen: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20zM14 7l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>'
    };

    const createHandwritingPanel = (answerBox, resultPanel) => {
        const panel = document.createElement('div');
        panel.style.cssText = 'display:none;margin-top:8px;padding:10px;border:1px solid #9db7d5;background:#f8fbff;max-width:720px';

        const instruction = document.createElement('div');
        instruction.textContent = config.handwriteinstructions;
        instruction.style.marginBottom = '8px';
        const canvas = document.createElement('canvas');
        canvas.width = 900;
        canvas.height = 420;
        canvas.style.cssText = 'display:block;width:100%;height:min(44vh,420px);min-height:260px;background:#fff;border:1px solid #8795a5;border-radius:4px;touch-action:pan-y;cursor:crosshair';
        canvas.setAttribute('aria-label', config.handwritebtn);

        const controls = document.createElement('div');
        controls.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap';
        const undo = document.createElement('button');
        const clear = document.createElement('button');
        const recognize = document.createElement('button');
        const status = document.createElement('span');
        [undo, clear, recognize].forEach(button => { button.type = 'button'; button.className = 'btn btn-secondary'; });
        recognize.className = 'btn btn-primary';
        undo.textContent = config.undo;
        clear.textContent = config.clear;
        recognize.textContent = config.recognizestrokes;
        controls.append(undo, clear, recognize, status);
        panel.append(instruction, canvas, controls);

        const strokes = [];
        let active = null;
        const context = canvas.getContext('2d');
        const pointFor = event => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: Math.round((event.clientX - rect.left) * canvas.width / rect.width),
                y: Math.round((event.clientY - rect.top) * canvas.height / rect.height)
            };
        };
        const redraw = () => {
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.strokeStyle = '#111827';
            context.lineWidth = 4;
            context.lineCap = 'round';
            context.lineJoin = 'round';
            strokes.forEach(stroke => {
                if (!stroke.x.length) return;
                context.beginPath();
                context.moveTo(stroke.x[0], stroke.y[0]);
                for (let i = 1; i < stroke.x.length; i++) context.lineTo(stroke.x[i], stroke.y[i]);
                context.stroke();
            });
        };
        const addSamples = event => {
            const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
            samples.forEach(sample => {
                const point = pointFor(sample);
                active.x.push(point.x);
                active.y.push(point.y);
            });
            redraw();
        };
        canvas.addEventListener('pointerdown', event => {
            if (event.pointerType === 'touch' || event.button !== 0) return;
            event.preventDefault();
            canvas.setPointerCapture(event.pointerId);
            active = {x: [], y: []};
            strokes.push(active);
            addSamples(event);
        });
        canvas.addEventListener('pointermove', event => {
            if (!active || event.pointerType === 'touch') return;
            event.preventDefault();
            addSamples(event);
        });
        const endStroke = event => {
            if (!active) return;
            if (event.pointerType !== 'touch') addSamples(event);
            active = null;
        };
        canvas.addEventListener('pointerup', endStroke);
        canvas.addEventListener('pointercancel', () => { active = null; });
        undo.addEventListener('click', () => { strokes.pop(); redraw(); status.textContent = ''; });
        clear.addEventListener('click', () => { strokes.length = 0; redraw(); status.textContent = ''; });
        recognize.addEventListener('click', async () => {
            if (!strokes.length) { status.textContent = config.nostrokes; return; }
            recognize.disabled = true;
            status.textContent = config.uploading;
            try {
                const result = await postStrokes({x: strokes.map(s => s.x), y: strokes.map(s => s.y)});
                const stackResult = result.stack || result.text || '';
                updateResultPanel(resultPanel, result.raw_latex || '', result.raw_asciimath || '', stackResult, answerBox, result.lines || []);
                status.textContent = '';
            } catch (error) {
                status.textContent = (config.recognizefailed || 'Recognition failed.') + ' ' + error.message;
            } finally {
                recognize.disabled = false;
            }
        });
        return panel;
    };

    const setIconButtonLabel = (button, label) => {
        button.title = label;
        button.setAttribute('aria-label', label);
    };

    const createIconButton = (label, icon, background) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.innerHTML = icon;
        setIconButtonLabel(button, label);
        button.style.marginLeft = '8px';
        button.style.width = '36px';
        button.style.height = '34px';
        button.style.padding = '0';
        button.style.border = '1px solid #999';
        button.style.borderRadius = '4px';
        button.style.background = background;
        button.style.color = '#1f2937';
        button.style.display = 'inline-flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.verticalAlign = 'middle';
        button.style.cursor = 'pointer';
        return button;
    };

    const attachButton = (answerBox) => {
        if (!answerBox || answerBox.dataset.stackinputhelperBound === '1') {
            return;
        }

        answerBox.dataset.stackinputhelperBound = '1';

        const fileInput = createHiddenFileInput();
        const resultPanel = createResultPanel();
        const handwritingPanel = createHandwritingPanel(answerBox, resultPanel);
        const mobilePanel = createMobilePanel();
        let mobilePollTimer = null;
        let lastMobileResultVersion = '';

        const uploadLabel = config.uploadbtn || 'Upload math image';
        const mobileLabel = config.mobilebtn || 'Mobile Math Upload';
        const uploadBtn = createIconButton(uploadLabel, icons.image, '#f5f5f5');
        const mobileBtn = createIconButton(mobileLabel, icons.camera, '#eef6ff');
        const handwriteBtn = createIconButton(config.handwritebtn, icons.pen, '#f2f7ef');
        let inputMode = '';

        const selectInputMode = mode => {
            inputMode = mode;
            handwritingPanel.style.display = mode === 'handwrite' ? 'block' : 'none';
            mobilePanel.style.display = mode === 'mobile' ? 'block' : 'none';

            if (mode !== 'mobile' && mobilePollTimer) {
                window.clearInterval(mobilePollTimer);
                mobilePollTimer = null;
            }

            [
                [uploadBtn, 'image', '#f5f5f5'],
                [handwriteBtn, 'handwrite', '#f2f7ef'],
                [mobileBtn, 'mobile', '#eef6ff']
            ].forEach(([button, buttonMode, background]) => {
                const selected = mode === buttonMode;
                button.setAttribute('aria-pressed', selected ? 'true' : 'false');
                button.style.background = selected ? '#d9e9ff' : background;
                button.style.borderColor = selected ? '#3978c5' : '#999';
            });
        };

        handwriteBtn.addEventListener('click', () => {
            selectInputMode('handwrite');
        });

        uploadBtn.addEventListener('click', () => {
            selectInputMode('image');
            fileInput.value = '';
            fileInput.click();
        });

        fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) {
                return;
            }

            uploadBtn.disabled = true;
            setIconButtonLabel(uploadBtn, config.uploading || 'Recognizing...');

            try {
                const result = await postImage(config.recognizeUrl, file);
                const stackResult = result.stack || result.normalized || result.text || '';

                if (!stackResult) {
                    throw new Error('Empty STACK result');
                }

                updateResultPanel(resultPanel, result.raw_latex || '', result.raw_asciimath || '', stackResult, answerBox, result.lines || []);
            } catch (error) {
                window.console.error('[stackinputhelper] recognition failed:', error);
                window.alert((config.recognizefailed || 'Recognition failed.') + '\n' + error.message);
            } finally {
                uploadBtn.disabled = false;
                setIconButtonLabel(uploadBtn, uploadLabel);
            }
        });

        mobileBtn.addEventListener('click', async () => {
            selectInputMode('mobile');
            try {
                if (mobilePollTimer) {
                    window.clearInterval(mobilePollTimer);
                    mobilePollTimer = null;
                }
                lastMobileResultVersion = '';

                mobileBtn.disabled = true;
                setIconButtonLabel(mobileBtn, config.creatingmobilesession || 'Creating mobile upload session...');

                const data = await createMobileSession();
                if (inputMode !== 'mobile') {
                    mobileBtn.disabled = false;
                    setIconButtonLabel(mobileBtn, mobileLabel);
                    return;
                }
                const sessionId = data.session_id;

                mobilePanel.style.display = 'block';
                mobilePanel._link.href = data.mobile_url;
                mobilePanel._link.textContent = data.mobile_url;
                if (!data.qr_svg) {
                    throw new Error('Moodle did not return a QR code.');
                }
                mobilePanel._qrImg.src = buildQrDataUrl(data.qr_svg);
                if (data.mobile_url_warning) {
                    mobilePanel._warning.textContent = data.mobile_url_warning;
                    mobilePanel._warning.style.display = 'block';
                } else {
                    mobilePanel._warning.textContent = '';
                    mobilePanel._warning.style.display = 'none';
                }
                mobilePanel._status.textContent = config.waitingmobileupload || 'Waiting for mobile upload...';

                mobileBtn.disabled = false;
                setIconButtonLabel(mobileBtn, mobileLabel);

                const start = Date.now();
                const timeoutMs = 10 * 60 * 1000;
                mobilePollTimer = window.setInterval(async () => {
                    try {
                        const result = await fetchSessionResult(sessionId);

                        if (result.ready) {
                            const stackResult = result.stack || result.text || '';
                            const resultVersion = [
                                result.updated_at || '',
                                result.raw_latex || '',
                                stackResult
                            ].join(':');

                            if (resultVersion !== lastMobileResultVersion) {
                                lastMobileResultVersion = resultVersion;
                                mobilePanel._status.textContent = config.mobileuploadreceived || 'Successfully received mobile result. You can upload another photo with the same QR code.';
                                updateResultPanel(resultPanel, result.raw_latex || '', result.raw_asciimath || '', stackResult, answerBox, result.lines || []);
                            }
                        } else if (result.expired) {
                            window.clearInterval(mobilePollTimer);
                            mobilePollTimer = null;
                            mobilePanel._status.textContent = config.mobileuploadexpired || 'This mobile upload session has expired.';
                        } else {
                            mobilePanel._status.textContent = config.waitingmobileupload || 'Waiting for mobile upload...';
                        }

                        if (Date.now() - start > timeoutMs) {
                            window.clearInterval(mobilePollTimer);
                            mobilePollTimer = null;
                            mobilePanel._status.textContent = config.mobileuploadtimeout || 'Timeout waiting for result. Please create a new session.';
                        }
                    } catch (error) {
                        window.console.error('[stackinputhelper] polling failed:', error);
                    }
                }, 2000);
            } catch (error) {
                if (inputMode !== 'mobile') {
                    mobileBtn.disabled = false;
                    setIconButtonLabel(mobileBtn, mobileLabel);
                    return;
                }
                window.console.error('[stackinputhelper] mobile session failed:', error);
                window.alert((config.mobilesessionfailed || 'Failed to create mobile session:') + ' ' + error.message);
                mobileBtn.disabled = false;
                setIconButtonLabel(mobileBtn, mobileLabel);
            }
        });

        answerBox.insertAdjacentElement('afterend', uploadBtn);
        uploadBtn.insertAdjacentElement('afterend', handwriteBtn);
        if (config.enablemobile) {
            handwriteBtn.insertAdjacentElement('afterend', mobileBtn);
            mobileBtn.insertAdjacentElement('afterend', mobilePanel);
            mobilePanel.insertAdjacentElement('afterend', handwritingPanel);
            handwritingPanel.insertAdjacentElement('afterend', resultPanel);
        } else {
            handwriteBtn.insertAdjacentElement('afterend', handwritingPanel);
            handwritingPanel.insertAdjacentElement('afterend', resultPanel);
        }
    };

    const run = () => {
        const boxes = findAnswerBoxes();
        if (!boxes.length) {
            window.console.warn(config.nofieldfound || 'No visible STACK input found');
            return;
        }
        boxes.forEach(attachButton);
    };

    const init = suppliedConfig => {
        config = Object.assign({}, defaultConfig, suppliedConfig || {});
        config.recognizeUrl = replaceLegacyNodeUrl(config.recognizeUrl || config.apiurl, pluginUrl('recognize.php'));
        config.strokesUrl = replaceLegacyNodeUrl(config.strokesUrl, pluginUrl('strokes.php'));
        config.convertUrl = replaceLegacyNodeUrl(config.convertUrl, pluginUrl('convert.php'));
        config.sessionCreateUrl = replaceLegacyNodeUrl(config.sessionCreateUrl, pluginUrl('session_create.php'));
        config.sessionResultUrl = replaceLegacyNodeUrl(
            config.sessionResultUrl || config.sessionResultBaseUrl,
            pluginUrl('session_result.php')
        );
        config.sesskey = config.sesskey || (window.M && M.cfg && M.cfg.sesskey) || '';
        run();
    };

    return {init};
});
