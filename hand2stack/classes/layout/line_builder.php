<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Candidate review rows of recognized LaTeX.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\layout;

use local_hand2stack\converter\math_extractor;
use local_hand2stack\converter\notation_keeper;
use local_hand2stack\converter\stack_converter;

defined('MOODLE_INTERNAL') || die();

final class line_builder {
    /**
     * Candidate rows for review. A Mathpix document (its text format, where
     * every formula sits inside $...$, \\(...\\) or \\[...\\]) is split by those
     * delimiters; a bare LaTeX formula is maths throughout.
     */
    public static function build_lines(string $latex): array {
        // "\\(" is a LaTeX line break before "(", not an opening \(.
        if (preg_match('/\$|(?<!\\\\)\\\\[(\[]/u', $latex)) {
            return document_builder::build_document_rows($latex);
        }
        return self::build_math_lines($latex);
    }

    /** Rows of a bare LaTeX formula: every row is maths; prose is only \\text{...}. */
    public static function build_math_lines(string $latex): array {
        $latex = trim($latex);
        if ($latex === '') {
            return [];
        }

        $normalized = str_replace(["\r\n", "\r"], "\n", $latex);
        // Unwrap the document only when a single delimiter pair encloses all
        // of it. A text document such as "... the larger one is $x=3$" ends
        // with an inline formula whose closing "$" belongs to that row.
        if (preg_match('/^\$(?!\$)([^$]*)\$$/u', $normalized, $match)) {
            $normalized = trim($match[1]);
        } else if (preg_match('/^\\\\\[((?:(?!\\\\[\[\]])[\s\S])*)\\\\\]$/u', $normalized, $match)) {
            $normalized = trim($match[1]);
        }

        $multiline = self::extract_multiline_body($normalized);
        if ($multiline !== null) {
            $parts = piecewise_rows::split_rows($multiline);
        } else if (preg_match_all('/\\\\begin\{(?:pmatrix|bmatrix|matrix|vmatrix)\}/', $normalized) > 1) {
            $marked = preg_replace(
                '/(\\\\end\{(?:pmatrix|bmatrix|matrix|vmatrix)\})\s*\n+\s*(?=\\\\begin\{(?:pmatrix|bmatrix|matrix|vmatrix)\})/',
                '$1__HAND2STACK_MATRIX_SPLIT__',
                $normalized
            );
            $parts = explode('__HAND2STACK_MATRIX_SPLIT__', $marked);
        } else if (preg_match('/\\\\begin\{(?:cases|pmatrix|bmatrix|matrix|vmatrix)\}/', $normalized)
                || preg_match('/\\\\left\s*\\\\?[({\[]?\s*\\\\begin\{array\}/', $normalized)) {
            $parts = [$normalized];
        } else {
            $parts = piecewise_rows::split_rows($normalized);
        }

        $lines = [];
        foreach ($parts as $part) {
            $piecewise = piecewise_rows::parse($part);
            if ($piecewise !== null) {
                // A piecewise function as the learner laid it out: a row per
                // branch, its value and condition in the order written.
                [$prefix, $rows] = $piecewise;
                if ($prefix !== '') {
                    $lines = array_merge($lines, self::build_math_lines($prefix));
                }
                foreach ($rows as $index => $pieces) {
                    $lines[] = piecewise_rows::row_line($pieces, $index === 0);
                }
                continue;
            }
            if (!self::is_kept_math_row($part)) {
                continue;
            }
            // "1.5x=3" starts with a decimal and "3.x" with a product, not the item number "1.".
            $number = preg_match('/^\s*&?\s*(\d+)\s*(?:\.(?=[\s&]|\\\\)|\))\s*/', $part, $match) ? $match[1] : null;
            $part = self::clean_line_latex($part);

            $math = math_extractor::extract($part);
            $line = self::candidate_line($part, $math, self::display_parts($part, $math));
            if ($number !== null && $multiline !== null) {
                $line['itemnumber'] = $number;
            }
            $lines[] = $line;
        }

        return $lines;
    }

    /** The text endpoint may prepend the uploaded filename as a header row. */
    public static function is_filename_row(string $row): bool {
        return (bool)preg_match('#^\s*[^/\\\\]+\.(?:png|jpe?g|heic|webp|gif)\s*$#iu', $row);
    }

    /**
     * Whether build_math_lines() makes a line of this raw row. Mathpix may
     * put display-math delimiters on their own rows; they are document
     * markup, not recognized student content, as is a filename header.
     */
    private static function is_kept_math_row(string $row): bool {
        return !preg_match('/^\s*(?:\\\\\[|\\\\\]|\$\$?)\s*$/u', $row)
            && !self::is_filename_row($row)
            && self::clean_line_latex($row) !== '';
    }

    /** The review row for $source whose maths is $math. */
    public static function candidate_line(string $source, string $math, array $displayparts): array {
        $metadata = self::classify_candidate($source, $math);
        $stack = $math === '' ? '' : stack_converter::normalize($math);
        // normalize() already resolves an approximation; converting the value
        // with "\\approx" removed would join both sides ("x 2.71" -> "x2.71").
        $normalized = $stack;
        return [
            'raw' => $source,
            'latex' => $source,
            'display' => self::display_latex($source),
            'display_parts' => $displayparts,
            'math' => $math,
            'ascii' => $stack,
            'normalized' => $normalized,
            'stack' => $stack,
            'type' => $metadata['type'],
            'relation' => $metadata['relation'],
        ];
    }

    /** @return array{value:string,type:string,relation:?string} */
    private static function classify_candidate(string $raw, string $math): array {
        if ($math === '') {
            return ['value' => '', 'type' => 'text', 'relation' => null];
        }
        $value = trim($math);
        $relation = null;
        if (preg_match('/^\s*(?:~~|≈|\\\\approx)\s*/u', $value)) {
            $relation = 'approximate';
            $value = preg_replace('/^\s*(?:~~|≈|\\\\approx)\s*/u', '', $value);
        } else if (preg_match('/(?:~~|≈|\\\\approx)/u', $raw)) {
            $relation = 'approximate';
            $value = preg_replace('/(?:~~|≈|\\\\approx)\s*/u', '', $value);
        }
        if ($relation === 'approximate') {
            $value = preg_replace('/[.。]\s*$/u', '', trim($value));
        }
        $type = 'expression';
        if ($relation === 'approximate') {
            $type = 'approximation';
        } else if (preg_match('/(?:<=|>=|<|>|\\\\leq|\\\\geq|≤|≥|\\\\neq?(?![A-Za-z])|≠)/u', $value)) {
            $type = 'condition';
        } else if (preg_match('/(?<![<>!#])=(?!=)/', $value)) {
            $type = 'equation';
        }
        return ['value' => $value, 'type' => $type, 'relation' => $relation];
    }

    public static function extract_multiline_body(string $latex): ?string {
        if (!preg_match('/^\\\\begin\{(aligned|gathered|split|align|array)\*?\}(?:\{[^}]*\})?([\s\S]*?)\\\\end\{\1\*?\}$/', trim($latex), $match)) {
            return null;
        }

        return trim($match[2]);
    }

    public static function clean_line_latex(string $line): string {
        $line = trim($line);
        $line = preg_replace('/^\\\\begin\{(?:aligned|gathered|split|align|array)\*?\}(?:\{[^}]*\})?/', '', $line);
        $line = preg_replace('/\\\\end\{(?:aligned|gathered|split|align|array)\*?\}$/', '', $line);
        if (!preg_match('/\\\\begin\{(?:cases|array|pmatrix|bmatrix|matrix|vmatrix)\}/', $line)) {
            $line = str_replace('&', '', $line);
        }
        $line = str_replace(['\\therefore', '\\because'], '', $line);
        // A review row is one value: "= 2" continuing the row above is 2.
        // Free-text working keeps the "=" the learner wrote.
        if (!notation_keeper::keeps_as_written()) {
            $line = preg_replace('/^\s*=\s*/', '', $line);
        }
        // "1.5x=3" starts with a decimal and "3.x" with a product, not the
        // item number "1.". A leading "- " in a formula is a minus sign: a
        // list bullet stays in Mathpix's text, outside the formula.
        $line = preg_replace('/^\s*(?:\d+(?:\.(?=[\s&]|\\\\)|\))\s*|\*\s+)/', '', $line);
        // Remove delimiters only when they wrap the complete row. Mixed prose
        // such as "Therefore, \(x>=1\)" must keep both delimiters until its
        // text and mathematical parts have been separated.
        // Mathpix can return nested delimiters such as "\\(\\(x=1\\)\\)".
        // Remove every complete outer layer before the browser adds its own.
        do {
            $previous = $line;
            $line = preg_replace('/^\$\$?\s*([\s\S]*?)\s*\$\$?$/u', '$1', $line);
            $line = preg_replace('/^\\\\\(\s*([\s\S]*?)\s*\\\\\)$/u', '$1', $line);
            $line = preg_replace('/^\\\\\[\s*([\s\S]*?)\s*\\\\\]$/u', '$1', $line);
            $line = trim($line);
        } while ($line !== $previous);
        $line = preg_replace('/(?<!\\\\)\btext\s*\{/u', '\\text{', $line);
        // A row that opens with an implication arrow ("\\Rightarrow f(2)=...")
        // continues the working; the arrow is not part of the expression.
        $line = preg_replace(
            '/^(?:\s|\\\\[,;:! ]|\\\\q?quad)*\\\\(?:Rightarrow|Longrightarrow|implies|Leftrightarrow|'
                . 'Longleftrightarrow|iff)(?![A-Za-z])\s*/u',
            '',
            $line
        );

        return trim($line);
    }

    public static function display_latex(string $line): string {
        $line = preg_replace('/\\\\text\s*\{\s*([^{}]*?)\s*\}/u', '$1', $line);
        $line = preg_replace('/(?<!\\\\)\btext\s*\{\s*([^{}]*?)\s*\}/u', '$1', $line);
        $line = str_replace(['\\(', '\\)', '\\[', '\\]'], '', $line);
        $line = preg_replace('/[$¥￥]/u', '', $line);
        $line = str_replace(['\\,', '\\;', '\\:', '\\!'], '', $line);
        return trim($line);
    }

    private static function display_parts(string $line, string $math): array {
        // Apply the same layout clean-up as math_extractor; otherwise a row
        // containing "\quad" or a Unicode minus cannot be located in the
        // display text and is shown twice (raw LaTeX plus rendered maths).
        $layout = static function(string $latex): string {
            $latex = str_replace(['−', '–', '—', '＝'], ['-', '-', '-', '='], self::display_latex($latex));
            return preg_replace('/\\\\q?quad(?![a-zA-Z])/u', ' ', $latex);
        };
        $display = $layout($line);
        if ($math === '') {
            return [[
                'type' => 'text',
                'text' => $display,
            ]];
        }

        // The maths itself may keep "\quad" ("x>2,50 \quad x=4"), so compare
        // both with the same layout clean-up.
        $mathdisplay = $layout($math);
        $displaycompact = preg_replace('/\s+/u', '', $display);
        $mathcompact = preg_replace('/\s+/u', '', $mathdisplay);
        $pos = $mathcompact === '' ? false : mb_strpos($displaycompact, $mathcompact);

        if ($pos === false) {
            return [
                ['type' => 'text', 'text' => $display],
                ['type' => 'math', 'latex' => $math],
            ];
        }

        $parts = [];
        $offset = 0;
        $compactoffset = 0;
        $mathstart = null;
        $mathend = null;
        $chars = preg_split('//u', $display, -1, PREG_SPLIT_NO_EMPTY);
        foreach ($chars as $char) {
            $charlen = mb_strlen($char);
            if (!preg_match('/\s/u', $char)) {
                if ($compactoffset === $pos && $mathstart === null) {
                    $mathstart = $offset;
                }
                $compactoffset++;
                if ($compactoffset === $pos + mb_strlen($mathcompact) && $mathend === null) {
                    $mathend = $offset + $charlen;
                    break;
                }
            }
            $offset += $charlen;
        }

        if ($mathstart === null || $mathend === null) {
            return [
                ['type' => 'text', 'text' => $display],
                ['type' => 'math', 'latex' => $math],
            ];
        }

        $before = mb_substr($display, 0, $mathstart);
        $after = mb_substr($display, $mathend);
        if (trim($before) !== '') {
            $parts[] = ['type' => 'text', 'text' => $before];
        }
        $parts[] = ['type' => 'math', 'latex' => $math];
        if (trim($after) !== '') {
            $parts[] = ['type' => 'text', 'text' => $after];
        }

        return $parts;
    }
}
