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
        const moodleRoot = window.M && M.cfg && M.cfg.wwwroot
            ? String(M.cfg.wwwroot).replace(/\/$/, '')
            : window.location.origin;
        return moodleRoot + '/local/stackinputhelper/' + path;
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
        camerabtn: 'Take a photo',
        uploading: 'Recognizing...',
        recognizefailed: 'Recognition failed.',
        recognizedresults: 'Recognized results',
        selectanswer: 'Select the answer to insert into STACK:',
        recognizedworking: 'Recognized mathematical working. Review or edit it before inserting:',
        selectpart: 'Click a symbol, or drag across the formula to select a range.',
        recommendedanswer: 'Recommended',
        edited: 'Edited',
        restoreocr: 'Restore OCR result',
        stackpreview: 'STACK input preview:',
        convertedstack: 'Converted for STACK:',
        freetextpreview: 'Free-text working preview:',
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
        conversioninprogress: 'Converting and validating...',
        pollingfailed: 'The mobile connection was interrupted. Retrying...',
        partialselectionfailed: 'Could not convert the selected text.',
        handwritebtn: 'Handwrite math',
        handwriteinstructions: 'Write with Apple Pencil, your finger, or a mouse. To scroll, drag outside the writing area.',
        resizehandwriting: 'Drag to resize the writing area',
        draw: 'Pen',
        eraser: 'Eraser',
        undo: 'Undo',
        clear: 'Clear',
        recognizestrokes: 'Recognize handwriting',
        nostrokes: 'Write an expression first.'
    };
    let config = {};
    const isIPadWebKit = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    const isMobileOrTablet = isIPadWebKit
        || /Android|Mobile|Tablet/i.test(navigator.userAgent)
        || Boolean(navigator.userAgentData && navigator.userAgentData.mobile);

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

    const createHiddenFileInput = (capture = false) => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        if (capture) fileInput.setAttribute('capture', 'environment');
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

    const isFreeTextInput = input => {
        return Boolean(input && String(input.dataset.stackInputType || '').toLowerCase() === 'freetext');
    };

    const formatFreeTextWorking = (rawAscii, rawLatex, stackResult, lines) => {
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
        const data = await parseJsonResponse(response);

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
        const data = await parseJsonResponse(response);

        if (!response.ok || !data.success) {
            throw new Error(data.error || ('HTTP ' + response.status));
        }

        return data.stack || '';
    };

    const postAscii = async (ascii) => {
        if (!config.convertUrl) {
            throw new Error('Conversion endpoint is not configured.');
        }
        const formData = new FormData();
        formData.append('ascii', ascii);
        formData.append('sesskey', config.sesskey);
        const response = await fetch(config.convertUrl, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });
        const data = await parseJsonResponse(response);
        if (!response.ok || !data.success || !data.valid) {
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
        const data = await parseJsonResponse(response);
        if (!response.ok || !data.success) {
            throw new Error(data.error || ('HTTP ' + response.status));
        }
        return data;
    };

    const parseJsonResponse = async response => {
        try {
            return await response.json();
        } catch (error) {
            throw new Error('HTTP ' + response.status);
        }
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
        panel.style.padding = '12px';
        panel.style.border = '1px solid #d8e1e8';
        panel.style.borderRadius = '6px';
        panel.style.background = '#f8fbfd';
        panel.style.display = 'none';
        // Follow the question content width rather than the viewport. Moodle's question
        // information column makes the usable area narrower, especially on iPad.
        panel.style.width = 'auto';
        panel.style.maxWidth = '100%';
        panel.style.minWidth = '0';
        panel.style.boxSizing = 'border-box';

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
        options.style.minWidth = '0';

        const formatTitle = document.createElement('div');
        formatTitle.textContent = config.recognizedformat || 'Recognized format:';
        formatTitle.style.fontWeight = 'bold';

        const formatTabs = document.createElement('div');
        formatTabs.setAttribute('role', 'tablist');
        formatTabs.style.display = 'flex';
        formatTabs.style.gap = '4px';
        formatTabs.style.marginTop = '0';

        const latexTab = document.createElement('button');
        latexTab.type = 'button';
        latexTab.textContent = config.rawlatex || 'LaTeX';
        latexTab.setAttribute('role', 'tab');

        const asciiTab = document.createElement('button');
        asciiTab.type = 'button';
        asciiTab.textContent = config.asciimath || 'ASCII';
        asciiTab.setAttribute('role', 'tab');

        [latexTab, asciiTab].forEach(tab => {
            tab.style.padding = '2px 7px';
            tab.style.border = '0';
            tab.style.borderRadius = '3px';
            tab.style.fontSize = '12px';
            tab.style.cursor = 'pointer';
        });
        formatTabs.appendChild(asciiTab);
        formatTabs.appendChild(latexTab);

        const rawTextarea = createTextarea('', true);
        rawTextarea.setAttribute('role', 'tabpanel');
        rawTextarea.style.marginTop = '0';

        const formatRows = document.createElement('div');
        formatRows.style.display = 'grid';
        formatRows.style.gap = '6px';
        formatRows.style.margin = '6px 0 8px';

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
        applyBtn.style.display = 'block';
        applyBtn.style.marginLeft = 'auto';

        const requestStatus = document.createElement('div');
        requestStatus.setAttribute('role', 'status');
        requestStatus.setAttribute('aria-live', 'polite');
        requestStatus.style.display = 'none';
        requestStatus.style.marginTop = '8px';
        requestStatus.style.padding = '6px 8px';
        requestStatus.style.borderRadius = '3px';
        requestStatus.style.fontSize = '13px';

        const reviewGrid = document.createElement('div');
        reviewGrid.style.display = 'grid';
        reviewGrid.style.gap = '16px';
        reviewGrid.style.alignItems = 'start';
        reviewGrid.style.minWidth = '0';

        const candidateColumn = document.createElement('section');
        candidateColumn.style.minWidth = '0';
        candidateColumn.style.overflow = 'hidden';
        candidateColumn.append(title, instruction, options);

        const recognizedColumn = document.createElement('section');
        recognizedColumn.style.minWidth = '0';
        recognizedColumn.style.padding = '0 4px';

        const editableHeader = document.createElement('div');
        editableHeader.style.display = 'flex';
        editableHeader.style.justifyContent = 'space-between';
        editableHeader.style.alignItems = 'center';
        editableHeader.style.gap = '8px';
        editableHeader.append(formatTitle, formatTabs);

        const convertedColumn = document.createElement('section');
        convertedColumn.style.minWidth = '0';
        convertedColumn.style.paddingTop = '10px';
        convertedColumn.style.borderTop = '1px solid #e2e6ea';
        convertedColumn.style.marginTop = '10px';
        convertedColumn.style.display = 'none';
        convertedColumn.append(stackTitle, stackTextarea);
        recognizedColumn.append(editableHeader, formatRows, rawTextarea, convertedColumn, applyBtn, requestStatus);
        reviewGrid.append(candidateColumn, recognizedColumn);

        const updateReviewLayout = () => {
            const width = panel.getBoundingClientRect().width;
            reviewGrid.style.gridTemplateColumns = !isMobileOrTablet && width >= 820
                ? 'minmax(0, 1fr) minmax(0, 1fr)'
                : 'minmax(0, 1fr)';
        };
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(updateReviewLayout);
            observer.observe(panel);
            panel._reviewResizeObserver = observer;
        }

        panel.appendChild(reviewGrid);

        panel._options = options;
        panel._instruction = instruction;
        panel._formatTitle = formatTitle;
        panel._formatTabs = formatTabs;
        panel._rawTextarea = rawTextarea;
        panel._formatRows = formatRows;
        panel._stackTitle = stackTitle;
        panel._reviewGrid = reviewGrid;
        panel._candidateColumn = candidateColumn;
        panel._recognizedColumn = recognizedColumn;
        panel._editableHeader = editableHeader;
        panel._convertedColumn = convertedColumn;
        panel._updateReviewLayout = updateReviewLayout;
        panel._latexTab = latexTab;
        panel._asciiTab = asciiTab;
        panel._stackTextarea = stackTextarea;
        panel._applyBtn = applyBtn;
        panel._requestStatus = requestStatus;
        panel._choiceName = choiceName;

        return panel;
    };

    const setRequestStatus = (panel, message = '', isError = false) => {
        if (!panel || !panel._requestStatus) return;
        panel._requestStatus.textContent = message;
        panel._requestStatus.style.display = message ? 'block' : 'none';
        panel._requestStatus.style.background = isError ? '#f8d7da' : '#eef6ff';
        panel._requestStatus.style.color = isError ? '#842029' : '#24496b';
        panel._requestStatus.style.border = isError ? '1px solid #f1aeb5' : '1px solid #b8d4ee';
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

    const asciiToLatexPreview = value => {
        let latex = String(value || '').trim();
        latex = latex.replace(/[−–—]/g, '-');
        latex = latex.replace(/\babs\(([^()]*)\)/g, '\\left|$1\\right|');
        latex = latex.replace(/\(([^()]*)\)\s*\/\s*\(([^()]*)\)/g, '\\frac{$1}{$2}');
        latex = latex.replace(/\^\s*\(?\s*([+-]?[A-Za-z0-9]+)\s*\)?/g, '^{$1}');
        latex = latex.replace(/\*/g, '\\cdot ');
        latex = latex.replace(/<=/g, '\\le ').replace(/>=/g, '\\ge ').replace(/!=/g, '\\ne ');
        latex = latex.replace(/\bpi\b/gi, '\\pi ').replace(/\binfinity\b/gi, '\\infty ');
        return latex;
    };

    const normalizeResultLines = (rawLatex, stackResult, lines) => {
        if (Array.isArray(lines) && lines.length) {
            const lastIndex = lines.length - 1;
            return lines.map((line, index) => ({
                latex: String(line.latex || '').trim(),
                originalLatex: String(line.latex || '').trim(),
                display: String(line.display || line.latex || '').trim(),
                displayParts: Array.isArray(line.display_parts) ? line.display_parts : [],
                math: String(line.math || '').trim(),
                stack: String(line.stack || line.text || '').trim(),
                ascii: String(line.ascii || line.stack || line.text || line.math || '').trim(),
                originalAscii: String(line.ascii || line.stack || line.text || line.math || '').trim(),
                edited: false,
                recommended: index === lastIndex
            })).filter(line => line.latex || line.stack);
        }

        const latex = String(rawLatex || stackResult || '').trim();
        const stack = String(stackResult || latex || '').trim();
        return latex || stack ? [{
            latex,
            originalLatex: latex,
            stack,
            ascii: stack,
            originalAscii: stack,
            edited: false,
            recommended: true
        }] : [];
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
        stack = stack.replace(/\b([A-Za-z])\(/g, '$1*(');

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
            text.textContent = String(part.text || '').replace(/[$¥￥]/g, '');
            text.style.whiteSpace = 'pre-wrap';
            text.style.fontFamily = 'inherit';
            displayRow.appendChild(text);
        });

        return container;
    };

    const updateResultPanel = (panel, rawLatex, rawAscii, stackResult, answerBox, lines) => {
        setRequestStatus(panel);
        window.clearTimeout(panel._dragConversionTimer);
        panel._selectionRequestId = (panel._selectionRequestId || 0) + 1;
        if (panel._selectionAbortController) {
            panel._selectionAbortController.abort();
        }
        (panel._interactiveControllers || []).forEach(controller => controller.abort());
        panel._interactiveControllers = [];
        panel._selectionAbortController = new AbortController();
        const freeTextMode = isFreeTextInput(answerBox);
        const layoutReference = panel._layoutReference;
        if (layoutReference && layoutReference.offsetParent !== null) {
            const referenceWidth = Math.floor(layoutReference.getBoundingClientRect().width);
            if (referenceWidth > 0) {
                // Freeze both panels at the pre-recognition width. Result content
                // must never participate in sizing the Moodle question container.
                layoutReference.style.width = referenceWidth + 'px';
                layoutReference.style.maxWidth = '100%';
                panel.style.width = referenceWidth + 'px';
                panel.style.maxWidth = '100%';
            }
        }
        panel.style.display = 'block';
        panel._instruction.textContent = freeTextMode
            ? (config.recognizedworking || 'Recognized mathematical working. Review or edit it before inserting:')
            : (config.selectanswer || 'Select the answer to insert into STACK:');
        panel._options.style.display = freeTextMode ? 'none' : 'grid';
        panel._formatTitle.style.display = freeTextMode ? 'none' : 'block';
        panel._formatTabs.style.display = freeTextMode ? 'none' : 'flex';
        panel._rawTextarea.style.display = freeTextMode ? 'none' : 'block';
        panel._formatRows.style.display = freeTextMode ? 'none' : 'grid';
        panel._editableHeader.style.display = freeTextMode ? 'none' : 'flex';
        panel._candidateColumn.style.display = freeTextMode ? 'none' : 'block';
        panel._recognizedColumn.style.display = 'block';
        panel._reviewGrid.style.display = 'grid';
        panel._reviewGrid.style.gridTemplateColumns = freeTextMode ? '1fr' : panel._reviewGrid.style.gridTemplateColumns;
        panel._convertedColumn.style.paddingTop = freeTextMode ? '0' : '10px';
        panel._convertedColumn.style.borderTop = freeTextMode ? '0' : '1px solid #e2e6ea';
        panel._convertedColumn.style.marginTop = freeTextMode ? '0' : '10px';
        panel._convertedColumn.style.display = freeTextMode ? 'block' : 'none';
        if (!freeTextMode) panel._updateReviewLayout();
        panel._stackTitle.textContent = freeTextMode
            ? (config.freetextpreview || 'Free-text working preview:')
            : (config.convertedstack || 'Converted for STACK:');
        panel._stackTextarea.rows = freeTextMode ? 8 : 1;
        panel._stackTextarea.readOnly = !freeTextMode;
        panel._stackTextarea.style.resize = freeTextMode ? '' : 'none';
        panel._stackTextarea.style.height = freeTextMode ? '' : '38px';
        panel._stackTextarea.style.minHeight = freeTextMode ? '' : '38px';
        panel._stackTextarea.style.background = freeTextMode ? '#fff' : '#f3f6f8';

        if (freeTextMode) {
            panel._options.innerHTML = '';
            panel._stackTextarea.value = formatFreeTextWorking(rawAscii, rawLatex, stackResult, lines);
            panel._applyBtn.onclick = () => setAnswerValue(answerBox, panel._stackTextarea.value || '');
            return;
        }

        const resultLines = normalizeResultLines(rawLatex, stackResult, lines);
        let defaultIndex = Math.max(0, resultLines.length - 1);
        for (let i = resultLines.length - 1; i >= 0; i--) {
            if (resultLines[i].stack) {
                defaultIndex = i;
                break;
            }
        }
        panel._rawTextarea.style.display = 'none';
        let selectedIndex = defaultIndex;
        let selectedFormat = 'ascii';
        const stackValueForLine = line => {
            if (!line) return stackResult || '';
            if (!line.edited && line.stack) return line.stack;
            if (line._validatedAscii === line.ascii && line._validatedStack) return line._validatedStack;
            return clientSideStackFallback(line.ascii) || line.ascii || line.stack || '';
        };
        const updateSelectedPreview = () => {
            const selectedLine = resultLines[selectedIndex];
            panel._stackTextarea.value = stackValueForLine(selectedLine);
        };
        const renderFormatRows = () => {
            panel._formatRows.innerHTML = '';
            const index = selectedIndex;
            const line = resultLines[index];
            if (!line) return;

            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.flexDirection = 'column';
            row.style.gap = '4px';
            row.style.position = 'relative';
            row.style.padding = '3px 0 3px 10px';
            line._formatRow = row;

            const selectionMarker = document.createElement('span');
            selectionMarker.setAttribute('aria-hidden', 'true');
            selectionMarker.style.position = 'absolute';
            selectionMarker.style.left = '0';
            selectionMarker.style.top = '25px';
            selectionMarker.style.width = '2px';
            selectionMarker.style.height = '38px';
            selectionMarker.style.borderRadius = '2px';
            selectionMarker.style.background = '#8ab4f8';

            const heading = document.createElement('div');
            heading.style.display = 'flex';
            heading.style.justifyContent = 'space-between';
            heading.style.alignItems = 'center';

            const label = document.createElement('label');
            label.textContent = (config.lineprefix || 'Line') + ' ' + (index + 1);
            label.style.fontSize = '12px';
            label.style.color = '#555';

            const field = document.createElement('input');
            field.type = 'text';
            field.value = selectedFormat === 'ascii' ? line.ascii : line.latex;
            field.readOnly = selectedFormat !== 'ascii';
            field.style.width = '100%';
            field.style.boxSizing = 'border-box';
            field.style.fontFamily = 'monospace';
            field.style.padding = '6px 8px';
            field.style.height = '38px';
            field.style.minHeight = '38px';
            field.style.maxHeight = '38px';
            field.style.border = '1px solid #b8c2cc';
            field.style.borderRadius = '3px';
            field.style.background = line.edited && selectedFormat === 'ascii' ? '#fff8e5' : '#fff';
            const fieldId = 'local-stackinputhelper-format-line-' + Math.random().toString(36).slice(2);
            field.id = fieldId;
            label.setAttribute('for', fieldId);

            const action = document.createElement('span');
            action.style.display = 'flex';
            action.style.alignItems = 'center';
            action.style.justifyContent = 'flex-end';
            action.style.gap = '6px';
            const badge = document.createElement('span');
            badge.textContent = config.edited || 'Edited';
            badge.style.cssText = 'font-size:11px;color:#7a4b00';
            const reset = document.createElement('button');
            reset.type = 'button';
            reset.textContent = config.restoreocr || 'Restore original';
            reset.style.cssText = 'border:0;background:transparent;color:#0f6cbf;cursor:pointer;padding:2px 0;font-size:11px';
            const updateEditedControls = () => {
                const visible = line.edited && selectedFormat === 'ascii';
                action.style.display = visible ? 'flex' : 'none';
            };
            reset.addEventListener('click', event => {
                event.stopPropagation();
                line.ascii = line.originalAscii;
                line.latex = line.originalLatex || asciiToLatexPreview(line.ascii);
                line.edited = false;
                line._validatedAscii = '';
                line._validatedStack = '';
                field.value = line.ascii;
                field.style.background = '#fff';
                window.clearTimeout(line._editTimer);
                updateEditedControls();
                refreshCandidateLine(index);
                updateSelectedPreview();
                field.focus();
            });
            heading.append(label);
            action.append(badge, reset);
            updateEditedControls();

            if (selectedFormat === 'ascii') {
                field.addEventListener('input', () => {
                    panel._partialSelection = null;
                    line.ascii = field.value;
                    line.latex = asciiToLatexPreview(line.ascii);
                    line.edited = line.ascii !== line.originalAscii;
                    line._validatedAscii = '';
                    line._validatedStack = '';
                    field.style.background = line.edited ? '#fff8e5' : '#fff';
                    updateEditedControls();
                    updateSelectedPreview();
                    window.clearTimeout(line._editTimer);
                    line._editTimer = window.setTimeout(() => {
                        refreshCandidateLine(index);
                    }, 250);
                });
            }
            row.append(selectionMarker, heading, field, action);
            panel._formatRows.appendChild(row);
        };
        const selectFormat = format => {
            const isAscii = format === 'ascii';
            selectedFormat = isAscii ? 'ascii' : 'latex';
            panel._latexTab.setAttribute('aria-selected', isAscii ? 'false' : 'true');
            panel._asciiTab.setAttribute('aria-selected', isAscii ? 'true' : 'false');
            panel._latexTab.style.background = isAscii ? '#fff' : '#e8f1ff';
            panel._asciiTab.style.background = isAscii ? '#e8f1ff' : '#fff';
            renderFormatRows();
        };
        panel._asciiTab.disabled = false;
        panel._asciiTab.title = '';
        panel._latexTab.onclick = () => selectFormat('latex');
        panel._asciiTab.onclick = () => selectFormat('ascii');
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
            selectedIndex = index;
            updateSelectedPreview();
            window.clearTimeout(panel._renderSelectedTimer);
            panel._renderSelectedTimer = window.setTimeout(renderFormatRows, 0);
        };

        panel._options.addEventListener('change', event => {
            const input = event.target.closest('input[type="radio"][data-result-choice]');
            if (!input || !input.checked) return;
            const index = Number(input.value);
            if (Number.isInteger(index) && resultLines[index]) {
                selectLine(index, resultLines[index]);
            }
        }, {signal: panel._selectionAbortController.signal});

        panel._activateLine = index => {
            const input = panel._options.querySelector('input[type="radio"][value="' + index + '"]');
            if (input) {
                input.checked = true;
            }
            selectLine(index, resultLines[index]);
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
            wrapper.style.alignItems = 'center';
            wrapper.style.padding = '5px 8px';
            wrapper.style.minHeight = '38px';
            wrapper.style.boxSizing = 'border-box';
            wrapper.style.border = isDefault ? '1px solid #8ab4f8' : '1px solid #e2e2e2';
            wrapper.style.borderRadius = '3px';
            wrapper.style.background = isDefault ? '#f3f8ff' : '#fff';
            wrapper.style.cursor = 'pointer';
            wrapper.style.userSelect = 'text';

            const input = document.createElement('input');
            input.type = 'radio';
            input.name = panel._choiceName;
            input.id = optionId;
            input.value = String(index);
            input.dataset.resultChoice = '1';
            input.checked = isDefault;
            input.style.marginTop = '0';

            const body = document.createElement('label');
            body.htmlFor = optionId;
            body.style.display = 'flex';
            body.style.alignItems = 'center';
            body.style.minWidth = '0';
            body.style.width = '100%';
            const prefix = document.createElement('span');
            prefix.textContent = (config.lineprefix || 'Line') + ' ' + (index + 1);
            prefix.style.display = 'inline-block';
            prefix.style.flex = '0 0 auto';
            prefix.style.fontSize = '12px';
            prefix.style.color = '#555';
            prefix.style.marginRight = '12px';

            const lineContent = createLineContent(panel, line);
            const status = document.createElement('span');
            status.textContent = isDefault && resultLines.length > 1
                ? (config.recommendedanswer || 'Recommended')
                : '';
            status.style.marginLeft = 'auto';
            status.style.paddingLeft = '10px';
            status.style.fontSize = '11px';
            status.style.color = '#667085';
            status.style.whiteSpace = 'nowrap';
            line._prefix = prefix;
            line._body = body;
            line._lineContent = lineContent;
            line._status = status;
            const selectionBoxes = Array.from(lineContent.querySelectorAll('[data-token-selection-box]'));
            selectionBoxes.forEach(box => {
                box.style.display = isDefault ? 'flex' : 'none';
            });
            panel._selectionBoxes.push(selectionBoxes);

            body.appendChild(prefix);
            body.appendChild(lineContent);
            body.appendChild(status);
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

        const refreshCandidateLine = index => {
            const line = resultLines[index];
            if (!line || !line._lineContent) return;
            const obsoleteControllers = line._interactiveControllers || [];
            obsoleteControllers.forEach(controller => controller.abort());
            panel._interactiveControllers = (panel._interactiveControllers || [])
                .filter(controller => !obsoleteControllers.includes(controller));
            line._interactiveControllers = [];
            line._prefix.textContent = (config.lineprefix || 'Line') + ' ' + (index + 1);
            const statuses = [];
            if (index === defaultIndex && resultLines.length > 1) statuses.push(config.recommendedanswer || 'Recommended');
            if (line.edited) statuses.push(config.edited || 'Edited');
            line._status.textContent = statuses.join(' · ');
            line._lineContent.innerHTML = '';
            const editedPreview = document.createElement('span');
            editedPreview.textContent = '\\(' + (line.latex || asciiToLatexPreview(line.ascii)) + '\\)';
            editedPreview.dataset.latex = line.latex || asciiToLatexPreview(line.ascii);
            editedPreview.dataset.interactiveFormula = '1';
            editedPreview.style.fontSize = '16px';
            line._lineContent.appendChild(editedPreview);
            typesetMath(line._lineContent).then(() => {
                line._lineContent.querySelectorAll('[data-interactive-formula]').forEach(rendered => {
                    setupInteractiveFormula(panel, rendered, line);
                });
            });
        };

        const selected = resultLines[defaultIndex];
        panel._stackTextarea.value = selected ? (selected.stack || selected.math || '') : (stackResult || '');
        selectFormat('ascii');
        panel._applyBtn.onclick = async () => {
            const requestId = (panel._insertRequestId || 0) + 1;
            panel._insertRequestId = requestId;
            const lineIndex = selectedIndex;
            const line = resultLines[lineIndex];
            const ascii = line ? line.ascii : '';
            panel._applyBtn.disabled = true;
            setRequestStatus(panel, config.conversioninprogress || 'Converting and validating...');
            try {
                let stackValue = panel._partialSelection && panel._partialSelection.value
                    ? panel._partialSelection.value
                    : stackValueForLine(line);
                if (line && line.edited && !(panel._partialSelection && panel._partialSelection.value)) {
                    stackValue = await postAscii(ascii);
                    if (panel._insertRequestId !== requestId || selectedIndex !== lineIndex || line.ascii !== ascii) {
                        return;
                    }
                    line._validatedAscii = ascii;
                    line._validatedStack = stackValue;
                }
                if (!stackValue) {
                    throw new Error(config.recognizefailed || 'Conversion failed.');
                }
                panel._stackTextarea.value = stackValue;
                setAnswerValue(answerBox, stackValue);
                setRequestStatus(panel);
            } catch (error) {
                if (panel._insertRequestId === requestId) {
                    setRequestStatus(panel, error.message, true);
                }
            } finally {
                if (panel._insertRequestId === requestId) {
                    panel._applyBtn.disabled = false;
                }
            }
        };
        typesetMath(panel._options).then(() => {
            panel._options.querySelectorAll('[data-interactive-formula]').forEach(rendered => {
                const option = rendered.closest('[data-result-line-index]');
                const lineIndex = option ? Number(option.dataset.resultLineIndex) : -1;
                setupInteractiveFormula(panel, rendered, resultLines[lineIndex] || null);
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
        const data = await parseJsonResponse(response);

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
        const data = await parseJsonResponse(response);

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

    const createHandwritingPanel = (answerBox, resultPanel, requestCoordinator, lifecycleSignal) => {
        const panel = document.createElement('div');
        panel.style.cssText = 'display:none;margin-top:8px;padding:10px;border:1px solid #9db7d5;background:#f8fbff;width:100%;max-width:none;box-sizing:border-box';

        const instruction = document.createElement('div');
        instruction.textContent = config.handwriteinstructions;
        instruction.style.marginBottom = '8px';
        const canvas = document.createElement('canvas');
        canvas.width = 900;
        canvas.height = 420;
        canvas.style.cssText = 'display:block;width:100%;height:min(44vh,420px);min-height:260px;background:#fff;border:1px solid #8795a5;border-radius:4px;touch-action:none;overscroll-behavior:contain;cursor:crosshair';
        canvas.setAttribute('aria-label', config.handwritebtn);

        const canvasWrapper = document.createElement('div');
        canvasWrapper.style.cssText = 'position:relative;width:100%';

        const resizeHandle = document.createElement('button');
        resizeHandle.type = 'button';
        resizeHandle.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">' +
            '<path d="M6 16L16 6M11 16l5-5M16 16h.01" fill="none" stroke="currentColor" stroke-width="1.5" ' +
            'stroke-linecap="round"/></svg>';
        resizeHandle.setAttribute('aria-label', config.resizehandwriting || 'Drag to resize the writing area');
        resizeHandle.title = config.resizehandwriting || 'Drag to resize the writing area';
        resizeHandle.style.cssText = 'position:absolute;right:2px;bottom:2px;width:28px;height:28px;padding:4px;border:0;background:rgba(255,255,255,.88);color:#64748b;cursor:nwse-resize;touch-action:none;user-select:none;display:flex;align-items:center;justify-content:center;border-radius:3px';

        let resizePointerId = null;
        let resizeStartX = 0;
        let resizeStartY = 0;
        let resizeStartWidth = 0;
        let resizeStartHeight = 0;
        let resizeScaleX = 1;
        let resizeScaleY = 1;
        let canvasBackingScale = 0;
        resizeHandle.addEventListener('pointerdown', event => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            event.preventDefault();
            resizePointerId = event.pointerId;
            resizeStartX = event.clientX;
            resizeStartY = event.clientY;
            resizeStartWidth = panel.getBoundingClientRect().width;
            const canvasBounds = canvas.getBoundingClientRect();
            resizeStartHeight = canvasBounds.height;
            resizeScaleX = canvasBounds.width > 0 ? canvas.width / canvasBounds.width : 1;
            resizeScaleY = canvasBounds.height > 0 ? canvas.height / canvasBounds.height : resizeScaleX;
            canvasBackingScale = resizeScaleX;
        });
        document.addEventListener('pointermove', event => {
            if (resizePointerId === null || event.pointerId !== resizePointerId) return;
            event.preventDefault();
            const panelLeft = panel.getBoundingClientRect().left;
            const availableWidth = Math.max(360, window.innerWidth - panelLeft - 24);
            const nextWidth = Math.max(360, Math.min(availableWidth, resizeStartWidth + event.clientX - resizeStartX));
            const nextHeight = Math.max(260, Math.min(1200, resizeStartHeight + event.clientY - resizeStartY));
            panel.style.width = Math.round(nextWidth) + 'px';
            canvas.style.height = Math.round(nextHeight) + 'px';
            const resizedBounds = canvas.getBoundingClientRect();
            if (resizedBounds.width > 0 && resizedBounds.height > 0) {
                canvas.width = Math.round(resizedBounds.width * resizeScaleX);
                canvas.height = Math.round(resizedBounds.height * resizeScaleY);
                redraw();
            }
        }, {passive: false, signal: lifecycleSignal});
        const finishResize = event => {
            if (resizePointerId === null || event.pointerId !== resizePointerId) return;
            resizePointerId = null;
        };
        document.addEventListener('pointerup', finishResize, {signal: lifecycleSignal});
        document.addEventListener('pointercancel', finishResize, {signal: lifecycleSignal});

        const controls = document.createElement('div');
        controls.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap';
        const draw = document.createElement('button');
        const eraser = document.createElement('button');
        const undo = document.createElement('button');
        const clear = document.createElement('button');
        const recognize = document.createElement('button');
        const status = document.createElement('span');
        [draw, eraser, undo, clear, recognize].forEach(button => {
            button.type = 'button';
            button.className = 'btn btn-secondary';
        });
        recognize.className = 'btn btn-primary';
        draw.textContent = config.draw || 'Pen';
        eraser.textContent = config.eraser || 'Eraser';
        undo.textContent = config.undo;
        clear.textContent = config.clear;
        recognize.textContent = config.recognizestrokes;
        controls.append(draw, eraser, undo, clear, recognize, status);
        canvasWrapper.append(canvas, resizeHandle);
        panel.append(instruction, canvasWrapper, controls);

        const strokes = [];
        const history = [];
        let active = null;
        let tool = 'draw';
        let canvasRect = null;
        let drawFrame = null;
        const dirtyStrokes = new Set();
        const context = canvas.getContext('2d');
        const cloneStrokes = () => strokes.map(stroke => ({
            x: stroke.x.slice(), y: stroke.y.slice(), drawn: stroke.x.length
        }));
        const saveHistory = () => history.push(cloneStrokes());
        const setTool = nextTool => {
            tool = nextTool;
            const drawing = tool === 'draw';
            draw.setAttribute('aria-pressed', drawing ? 'true' : 'false');
            eraser.setAttribute('aria-pressed', drawing ? 'false' : 'true');
            draw.className = drawing ? 'btn btn-primary' : 'btn btn-secondary';
            eraser.className = drawing ? 'btn btn-secondary' : 'btn btn-primary';
            canvas.style.cursor = drawing ? 'crosshair' : 'cell';
        };
        const configureContext = () => {
            context.strokeStyle = '#111827';
            context.lineWidth = 4;
            context.lineCap = 'round';
            context.lineJoin = 'round';
        };
        const pointFor = event => {
            const rect = canvasRect || canvas.getBoundingClientRect();
            return {
                x: Math.round((event.clientX - rect.left) * canvas.width / rect.width),
                y: Math.round((event.clientY - rect.top) * canvas.height / rect.height)
            };
        };
        const drawNewSegments = stroke => {
            const length = stroke.x.length;
            if (!length || stroke.drawn >= length) return;

            configureContext();
            context.beginPath();
            if (stroke.drawn === 0) {
                context.moveTo(stroke.x[0], stroke.y[0]);
                if (length === 1) context.lineTo(stroke.x[0] + 0.01, stroke.y[0] + 0.01);
            } else {
                const previous = stroke.drawn - 1;
                context.moveTo(stroke.x[previous], stroke.y[previous]);
            }
            for (let i = Math.max(1, stroke.drawn); i < length; i++) {
                context.lineTo(stroke.x[i], stroke.y[i]);
            }
            context.stroke();
            stroke.drawn = length;
        };
        const flushDrawing = () => {
            drawFrame = null;
            dirtyStrokes.forEach(drawNewSegments);
            dirtyStrokes.clear();
        };
        const scheduleDrawing = stroke => {
            dirtyStrokes.add(stroke);
            if (drawFrame === null) drawFrame = window.requestAnimationFrame(flushDrawing);
        };
        const redraw = () => {
            if (drawFrame !== null) {
                window.cancelAnimationFrame(drawFrame);
                drawFrame = null;
            }
            dirtyStrokes.clear();
            context.clearRect(0, 0, canvas.width, canvas.height);
            strokes.forEach(stroke => {
                stroke.drawn = 0;
                drawNewSegments(stroke);
            });
        };
        const distanceToSegment = (point, start, end) => {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
            const ratio = Math.max(0, Math.min(1,
                ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)
            ));
            return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
        };
        const eraseAt = point => {
            let changed = false;
            for (let strokeIndex = strokes.length - 1; strokeIndex >= 0; strokeIndex--) {
                const stroke = strokes[strokeIndex];
                for (let i = 0; i < stroke.x.length; i++) {
                    const start = {x: stroke.x[i], y: stroke.y[i]};
                    const end = i + 1 < stroke.x.length ? {x: stroke.x[i + 1], y: stroke.y[i + 1]} : start;
                    if (distanceToSegment(point, start, end) <= 24) {
                        strokes.splice(strokeIndex, 1);
                        changed = true;
                        break;
                    }
                }
            }
            if (changed) redraw();
            return changed;
        };
        const addSamples = (event, stroke = active) => {
            if (!stroke) return;
            const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
            samples.forEach(sample => {
                const point = pointFor(sample);
                if (stroke.erasing) {
                    stroke.changed = eraseAt(point) || stroke.changed;
                    return;
                }
                const last = stroke.x.length - 1;
                if (last < 0 || stroke.x[last] !== point.x || stroke.y[last] !== point.y) {
                    stroke.x.push(point.x);
                    stroke.y.push(point.y);
                }
            });
            if (!stroke.erasing) scheduleDrawing(stroke);
        };
        const flushPendingDrawing = () => {
            if (drawFrame === null) return;
            window.cancelAnimationFrame(drawFrame);
            flushDrawing();
        };
        const syncCanvasBackingStore = () => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            if (!canvasBackingScale) {
                canvasBackingScale = canvas.width / rect.width;
            }
            const expectedWidth = Math.max(1, Math.round(rect.width * canvasBackingScale));
            const expectedHeight = Math.max(1, Math.round(rect.height * canvasBackingScale));
            if (canvas.width === expectedWidth && canvas.height === expectedHeight) return;
            canvas.width = expectedWidth;
            canvas.height = expectedHeight;
            redraw();
        };
        const syncEmptyCanvasBackingStore = () => {
            if (!strokes.length) syncCanvasBackingStore();
        };
        if (typeof ResizeObserver !== 'undefined') {
            const canvasResizeObserver = new ResizeObserver(() => {
                // Keep the backing-store scale constant when surrounding result UI
                // changes width. Existing stroke coordinates then retain their exact
                // on-screen size and position instead of being stretched by CSS.
                syncCanvasBackingStore();
            });
            canvasResizeObserver.observe(canvas);
            lifecycleSignal.addEventListener('abort', () => canvasResizeObserver.disconnect(), {once: true});
        }
        const startStroke = (pointerId, event) => {
            syncEmptyCanvasBackingStore();
            canvasRect = canvas.getBoundingClientRect();
            saveHistory();
            if (tool === 'eraser') {
                active = {pointerId, erasing: true, changed: false};
                addSamples(event);
                return;
            }
            active = {x: [], y: [], drawn: 0, pointerId};
            strokes.push(active);
            addSamples(event);
        };
        const finishStroke = (pointerId, event = null) => {
            if (!active || pointerId !== active.pointerId) return;
            if (event) addSamples(event, active);
            flushPendingDrawing();
            if (active.erasing && !active.changed) history.pop();
            active = null;
            canvasRect = null;
        };
        canvas.addEventListener('pointerdown', event => {
            if ((isIPadWebKit && (event.pointerType === 'touch' || event.pointerType === 'pen'))
                    || (event.pointerType === 'mouse' && event.button !== 0)) return;
            event.preventDefault();
            startStroke(event.pointerId, event);
        });
        canvas.addEventListener('pointermove', event => {
            if (!active || (isIPadWebKit && (event.pointerType === 'touch' || event.pointerType === 'pen'))
                    || event.pointerId !== active.pointerId) return;
            event.preventDefault();
            addSamples(event);
        });
        const endStroke = event => {
            if (isIPadWebKit && (event.pointerType === 'touch' || event.pointerType === 'pen')) return;
            finishStroke(event.pointerId, event);
        };
        canvas.addEventListener('pointerup', endStroke);
        canvas.addEventListener('pointercancel', event => {
            if (!active || event.pointerId !== active.pointerId) return;
            if (active.erasing && !active.changed) history.pop();
            active = null;
            canvasRect = null;
        });
        // On iPad/iPhone WebKit, handle both Pencil and finger input through
        // Touch Events. This avoids the Pencil gaps seen through Pointer Events
        // while still allowing ordinary finger handwriting.
        const drawingTouch = (event, identifier = null) => Array.from(event.changedTouches || []).find(touch =>
            identifier === null || touch.identifier === identifier);
        canvas.addEventListener('touchstart', event => {
            if (!isIPadWebKit) return;
            const touch = drawingTouch(event);
            if (!touch) return;
            event.preventDefault();
            startStroke('touch-' + touch.identifier, touch);
        }, {passive: false});
        canvas.addEventListener('touchmove', event => {
            if (!isIPadWebKit || !active || typeof active.pointerId !== 'string') return;
            const identifier = Number(active.pointerId.slice(6));
            const touch = drawingTouch(event, identifier);
            if (!touch) return;
            event.preventDefault();
            addSamples(touch);
        }, {passive: false});
        const endTouchStroke = event => {
            if (!isIPadWebKit || !active || typeof active.pointerId !== 'string') return;
            const identifier = Number(active.pointerId.slice(6));
            const touch = drawingTouch(event, identifier);
            if (!touch) return;
            event.preventDefault();
            finishStroke(active.pointerId, touch);
        };
        canvas.addEventListener('touchend', endTouchStroke, {passive: false});
        canvas.addEventListener('touchcancel', event => {
            if (!isIPadWebKit || !active || typeof active.pointerId !== 'string') return;
            const identifier = Number(active.pointerId.slice(6));
            if (!drawingTouch(event, identifier)) return;
            if (active.erasing && !active.changed) history.pop();
            active = null;
            canvasRect = null;
        }, {passive: false});
        draw.addEventListener('click', () => setTool('draw'));
        eraser.addEventListener('click', () => setTool('eraser'));
        undo.addEventListener('click', () => {
            if (!history.length) return;
            strokes.splice(0, strokes.length, ...history.pop());
            redraw();
            status.textContent = '';
        });
        clear.addEventListener('click', () => {
            if (!strokes.length) return;
            saveHistory();
            strokes.length = 0;
            redraw();
            status.textContent = '';
        });
        setTool('draw');
        recognize.addEventListener('click', async () => {
            if (!strokes.length) { status.textContent = config.nostrokes; return; }
            const requestId = requestCoordinator.begin();
            recognize.disabled = true;
            status.textContent = config.uploading;
            setRequestStatus(resultPanel);
            try {
                const result = await postStrokes({x: strokes.map(s => s.x), y: strokes.map(s => s.y)});
                if (!requestCoordinator.isCurrent(requestId)) return;
                const stackResult = result.stack || result.text || '';
                updateResultPanel(resultPanel, result.raw_latex || '', result.raw_asciimath || '', stackResult, answerBox, result.lines || []);
                status.textContent = '';
            } catch (error) {
                if (requestCoordinator.isCurrent(requestId)) {
                    status.textContent = (config.recognizefailed || 'Recognition failed.') + ' ' + error.message;
                }
            } finally {
                recognize.disabled = false;
                if (!requestCoordinator.isCurrent(requestId)) {
                    status.textContent = '';
                }
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
        if (answerBox.tagName === 'INPUT' && !isFreeTextInput(answerBox)) {
            answerBox.style.width = 'min(260px, 45vw)';
            answerBox.style.maxWidth = '100%';
        }

        const lifecycleController = new AbortController();
        let recognitionRequestId = 0;
        const requestCoordinator = {
            begin: () => ++recognitionRequestId,
            invalidate: () => ++recognitionRequestId,
            isCurrent: requestId => requestId === recognitionRequestId && answerBox.isConnected
        };
        const fileInput = createHiddenFileInput(false);
        const cameraInput = isMobileOrTablet ? createHiddenFileInput(true) : null;
        const resultPanel = createResultPanel();
        const handwritingPanel = createHandwritingPanel(
            answerBox,
            resultPanel,
            requestCoordinator,
            lifecycleController.signal
        );
        resultPanel._layoutReference = handwritingPanel;
        const mobilePanel = createMobilePanel();
        let mobilePollTimer = null;
        let mobilePollInFlight = false;
        let mobilePollFailures = 0;
        let lastMobileResultVersion = '';

        const uploadLabel = config.uploadbtn || 'Upload math image';
        const mobileLabel = isMobileOrTablet
            ? (config.camerabtn || 'Take a photo')
            : (config.mobilebtn || 'Mobile Math Upload');
        const uploadBtn = createIconButton(uploadLabel, icons.image, '#f5f5f5');
        const mobileBtn = createIconButton(mobileLabel, icons.camera, '#eef6ff');
        const handwriteBtn = createIconButton(config.handwritebtn, icons.pen, '#f2f7ef');
        let inputMode = '';

        const selectInputMode = mode => {
            if (inputMode !== mode) {
                requestCoordinator.invalidate();
            }
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
                [mobileBtn, isMobileOrTablet ? 'camera' : 'mobile', '#eef6ff']
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

        const recognizeImageFile = async (file, button, idleLabel) => {
            if (!file) return;

            const requestId = requestCoordinator.begin();
            button.disabled = true;
            setIconButtonLabel(button, config.uploading || 'Recognizing...');
            setRequestStatus(resultPanel);

            try {
                const result = await postImage(config.recognizeUrl, file);
                if (!requestCoordinator.isCurrent(requestId)) return;
                const stackResult = result.stack || result.normalized || result.text || '';

                if (!stackResult && !result.raw_asciimath && !result.raw_latex) {
                    throw new Error('Empty STACK result');
                }

                updateResultPanel(resultPanel, result.raw_latex || '', result.raw_asciimath || '', stackResult, answerBox, result.lines || []);
            } catch (error) {
                if (!requestCoordinator.isCurrent(requestId)) return;
                window.console.error('[stackinputhelper] recognition failed:', error);
                resultPanel.style.display = 'block';
                setRequestStatus(resultPanel, (config.recognizefailed || 'Recognition failed.') + ' ' + error.message, true);
            } finally {
                button.disabled = false;
                setIconButtonLabel(button, idleLabel);
            }
        };

        fileInput.addEventListener('change', () => {
            recognizeImageFile(fileInput.files && fileInput.files[0], uploadBtn, uploadLabel);
        });

        if (cameraInput) {
            cameraInput.addEventListener('change', () => {
                recognizeImageFile(cameraInput.files && cameraInput.files[0], mobileBtn, mobileLabel);
            });
        }

        mobileBtn.addEventListener('click', async () => {
            if (cameraInput) {
                selectInputMode('camera');
                cameraInput.value = '';
                cameraInput.click();
                return;
            }
            selectInputMode('mobile');
            const requestId = requestCoordinator.begin();
            try {
                if (mobilePollTimer) {
                    window.clearInterval(mobilePollTimer);
                    mobilePollTimer = null;
                }
                lastMobileResultVersion = '';
                mobilePollFailures = 0;
                mobilePollInFlight = false;

                mobileBtn.disabled = true;
                setIconButtonLabel(mobileBtn, config.creatingmobilesession || 'Creating mobile upload session...');

                const data = await createMobileSession();
                if (inputMode !== 'mobile' || !requestCoordinator.isCurrent(requestId)) {
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
                    if (mobilePollInFlight || !requestCoordinator.isCurrent(requestId) || inputMode !== 'mobile') {
                        return;
                    }
                    mobilePollInFlight = true;
                    try {
                        const result = await fetchSessionResult(sessionId);
                        if (!requestCoordinator.isCurrent(requestId) || inputMode !== 'mobile') return;
                        mobilePollFailures = 0;

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
                        mobilePollFailures++;
                        mobilePanel._status.textContent = config.pollingfailed || 'The mobile connection was interrupted. Retrying...';
                        if (mobilePollFailures >= 3) {
                            window.clearInterval(mobilePollTimer);
                            mobilePollTimer = null;
                            mobilePanel._status.textContent = error.message;
                        }
                    } finally {
                        mobilePollInFlight = false;
                    }
                }, 2000);
            } catch (error) {
                if (inputMode !== 'mobile' || !requestCoordinator.isCurrent(requestId)) {
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

        const cleanupObserver = new MutationObserver(() => {
            if (answerBox.isConnected) return;
            requestCoordinator.invalidate();
            lifecycleController.abort();
            if (mobilePollTimer) window.clearInterval(mobilePollTimer);
            if (resultPanel._selectionAbortController) resultPanel._selectionAbortController.abort();
            (resultPanel._interactiveControllers || []).forEach(controller => controller.abort());
            if (resultPanel._reviewResizeObserver) resultPanel._reviewResizeObserver.disconnect();
            fileInput.remove();
            if (cameraInput) cameraInput.remove();
            cleanupObserver.disconnect();
        });
        cleanupObserver.observe(document.body, {childList: true, subtree: true});
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
