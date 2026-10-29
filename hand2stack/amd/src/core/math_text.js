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
 * Recognized mathematics as text: LaTeX previews, display parts and selections.
 *
 * @module local_hand2stack/core/math_text
 */
define([], function() {
    const asciiToLatexPreview = value => {
        let latex = String(value || '').trim();
        latex = latex.replace(/[−–—]/g, '-');
        // Display an expanded STACK interval in its original chained form.
        // This keeps the left preview mathematical instead of typesetting
        // the letters in "and" as variables.
        latex = latex.replace(
            /^(.+?)(<=|>=|<|>)(.+?)\s+and\s+\3(<=|>=|<|>)(.+)$/,
            '$1$2$3$4$5'
        );
        let previousLatex = '';
        while (previousLatex !== latex) {
            previousLatex = latex;
            latex = latex.replace(/\babs\(([^()]*)\)/g, '\\left|$1\\right|');
            latex = latex.replace(/\bsqrt\(([^()]*)\)/g, '\\sqrt{$1}');
        }
        latex = latex.replace(
            /\b(sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|asin|acos|atan|log|ln|exp)\(([^()]*)\)/g,
            '\\operatorname{$1}\\left($2\\right)'
        );
        latex = latex.replace(/\(([^()]*)\)\s*\/\s*\(([^()]*)\)/g, '\\frac{$1}{$2}');
        latex = latex.replace(/\^\s*\(([^()]*)\)/g, '^{$1}');
        latex = latex.replace(/\^\s*\(?\s*([+-]?[A-Za-z0-9]+)\s*\)?/g, '^{$1}');
        latex = latex.replace(/([A-Za-z0-9.%]+)\s*\/\s*([A-Za-z0-9.%]+)/g, '\\frac{$1}{$2}');
        latex = latex.replace(/\*/g, '\\cdot ');
        latex = latex.replace(/(?:~~|~=|≈)/g, '\\approx ');
        latex = latex.replace(/<=/g, '\\le ').replace(/>=/g, '\\ge ')
            .replace(/(?:!=|#)/g, '\\ne ');
        latex = latex.replace(/->/g, '\\to ').replace(/(?:\+\/\-|±)/g, '\\pm ');
        latex = latex.replace(/\band\b/gi, '\\mathrel{\\land}');
        latex = latex.replace(/\bor\b/gi, '\\mathrel{\\lor}');
        latex = latex.replace(/\bnot\b/gi, '\\neg ');
        latex = latex.replace(/\bin\b/gi, '\\in ');
        latex = latex.replace(/\bminf\b/gi, '-\\infty ');
        latex = latex.replace(/\b(?:inf|infinity)\b/gi, '\\infty ');
        latex = latex.replace(/%?\bpi\b/gi, '\\pi ');
        latex = latex.replace(/%e\b/g, 'e').replace(/%i\b/g, 'i');
        return latex;
    };

    const stripOuterMathDelimiters = value => {
        let result = String(value || '').trim();
        let previous = '';
        while (result !== previous) {
            previous = result;
            result = result.replace(/^\\\(\s*([\s\S]*?)\s*\\\)$/u, '$1').trim();
            result = result.replace(/^\\\[\s*([\s\S]*?)\s*\\\]$/u, '$1').trim();
            result = result.replace(/^\$\$?\s*([\s\S]*?)\s*\$\$?$/u, '$1').trim();
        }
        return result;
    };

    const splitEmbeddedMathText = value => {
        let text = String(value || '');
        let previous = '';
        while (text !== previous) {
            previous = text;
            text = text.replace(/\\\(\s*\\\(([\s\S]*?)\\\)\s*\\\)/gu, '\\($1\\)');
            text = text.replace(/\\\[\s*\\\[([\s\S]*?)\\\]\s*\\\]/gu, '\\[$1\\]');
        }
        const pattern = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/gu;
        const parts = [];
        let offset = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            if (match.index > offset) {
                parts.push({type: 'text', text: text.slice(offset, match.index)});
            }
            const latex = stripOuterMathDelimiters(match[1] ?? match[2] ?? match[3] ?? match[4] ?? '');
            if (latex) parts.push({type: 'math', latex, text: latex});
            offset = pattern.lastIndex;
        }
        if (offset < text.length) parts.push({type: 'text', text: text.slice(offset)});
        return parts.length ? parts : [{type: 'text', text}];
    };

    const normalizeDisplayParts = parts => {
        if (!Array.isArray(parts)) return [];
        return parts.flatMap(part => {
            if (!part) return [];
            if (part.type !== 'math') return splitEmbeddedMathText(part.text || '');
            const latex = stripOuterMathDelimiters(part.latex || part.text || '');
            return [Object.assign({}, part, {latex, text: latex})];
        });
    };

    const normalizeResultLines = (rawLatex, stackResult, lines) => {
        if (Array.isArray(lines) && lines.length) {
            return lines.map((line, index) => ({
                raw: String(line.raw || line.latex || line.ascii || '').trim(),
                latex: stripOuterMathDelimiters(line.latex || ''),
                originalLatex: stripOuterMathDelimiters(line.latex || ''),
                display: String(line.display || line.latex || '').trim(),
                displayParts: normalizeDisplayParts(line.display_parts),
                math: stripOuterMathDelimiters(line.math || ''),
                stack: String(line.stack || line.text || '').trim(),
                ascii: String(line.ascii || line.stack || line.text || line.math || '').trim(),
                originalAscii: String(line.ascii || line.stack || line.text || line.math || '').trim(),
                asciiFromMathpix: Boolean(line.ascii_from_mathpix),
                normalized: String(line.normalized || line.stack || '').trim(),
                type: String(line.type || 'expression'),
                relation: line.relation ? String(line.relation) : null,
                synthetic: Boolean(line.synthetic),
                edited: false,
                recommended: false
            })).filter(line => line.latex || line.stack);
        }

        const latex = stripOuterMathDelimiters(rawLatex || stackResult || '');
        const stack = String(stackResult || latex || '').trim();
        return latex || stack ? [{
            latex,
            originalLatex: latex,
            stack,
            ascii: stack,
            originalAscii: stack,
            asciiFromMathpix: false,
            type: 'expression',
            relation: null,
            edited: false,
            recommended: false
        }] : [];
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
        stack = stack.replace(/\\(?:cdot|times)(?![A-Za-z])/g, '*');
        stack = stack.replace(/\^\{([^{}]+)\}/g, '^$1');
        stack = stack.replace(/[{}]/g, '');
        stack = stack.replace(/\s+/g, '');
        stack = stack.replace(/(\d)([A-Za-z])/g, '$1*$2');
        stack = stack.replace(/\)([A-Za-z])/g, ')*$1');
        stack = stack.replace(/\b([A-Za-z])\(/g, '$1*(');

        return stack;
    };

    return {
        asciiToLatexPreview, normalizeDisplayParts, normalizeResultLines, normalizeSelectableText,
        latexDisplayMap, selectedLatexFromLine, clientSideStackFallback
    };
});
