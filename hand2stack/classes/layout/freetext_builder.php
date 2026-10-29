<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Free-text working: the recognized document as prose with `maths`.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\layout;

use local_hand2stack\converter\notation_keeper;
use local_hand2stack\converter\stack_converter;
use local_hand2stack\converter\statement_splitter;

defined('MOODLE_INTERNAL') || die();

final class freetext_builder {
    /**
     * Preserve Mathpix prose and paragraphs while marking each formula as
     * STACK free-text inline mathematics. A formula is written in the AsciiMath
     * Mathpix returned for it, which [[ascii]] displays as the learner wrote it:
     * the working is read, not graded, so nothing is converted to STACK syntax.
     *
     * @param array $asciimath [LaTeX, AsciiMath] for each formula, in Mathpix's order
     */
    public static function build(string $text, string $ascii = '', string $latex = '', array $asciimath = []): string {
        return notation_keeper::keeping_as_written(static function() use ($text, $ascii, $latex, $asciimath): string {
            return self::convert($text, $ascii, $latex, $asciimath);
        });
    }

    private static function convert(string $text, string $ascii, string $latex, array $asciimath): string {
        $text = trim(str_replace(["\r\n", "\r"], "\n", $text));
        if ($text === '' && $asciimath) {
            return implode("\n", array_map(static function(array $pair): string {
                return self::asciimath_block($pair[1]);
            }, $asciimath));
        }
        if ($text === '') {
            $fallback = trim(str_replace(["\r\n", "\r"], "\n", $ascii));
            if ($fallback === '' && trim($latex) !== '') {
                $fallback = stack_converter::normalize_selection($latex);
            }
            return $fallback === '' ? '' : "`{$fallback}`";
        }

        // Mathpix's text format keeps prose as text and marks mathematics with
        // TeX delimiters, read by the same document_segments() as the review
        // rows. Only the maths is converted, so a paragraph such as
        // "Therefore, \\(x=3\\)." remains readable prose.
        $converted = '';
        $next = 0;
        foreach (document_builder::document_segments($text) as [$type, $value]) {
            if ($type === 'text') {
                // The review rows drop the uploaded filename header too.
                $converted .= implode("\n", array_filter(explode("\n", $value), static function(string $row): bool {
                    return !line_builder::is_filename_row($row);
                }));
                continue;
            }
            // Mathpix's AsciiMath for this formula: the next one whose LaTeX
            // is this segment's.
            $piece = null;
            for ($i = $next, $count = count($asciimath); $i < $count; $i++) {
                if (preg_replace('/\s+/', '', $asciimath[$i][0]) === preg_replace('/\s+/', '', $value)) {
                    $piece = $type === 'display'
                        ? self::asciimath_block($asciimath[$i][1])
                        : self::asciimath_row($asciimath[$i][1]);
                    $next = $i + 1;
                    break;
                }
            }
            if ($piece !== null && $type === 'display') {
                // A block stands on lines of its own, as Mathpix displayed it.
                $converted = rtrim($converted, " \t");
                $converted .= ($converted === '' || substr($converted, -1) === "\n" ? '' : "\n") . $piece . "\n";
                continue;
            }
            if ($piece === null) {
                // No AsciiMath for it: convert the LaTeX as before.
                [$prose, $latex] = statement_splitter::split_leading_prose($value);
                $math = $latex === '' ? '' : self::math_to_ascii($latex);
                $piece = trim($prose . ' ' . ($math === '' ? $latex : self::wrap_math($math)));
            }
            // Two formulas with nothing but spaces between them are two rows.
            // Only segment boundaries break: the value and condition of a
            // piecewise row ("`y=x^2+1` `x>1`") stay on their row. \z, not $:
            // $ also matches before a final newline, which doubled it.
            if (preg_match('/`[ \t]*\z/u', $converted) && strpos($piece, '`') === 0) {
                $converted = rtrim($converted, " \t") . "\n";
            }
            $converted .= $piece;
        }
        $text = $converted;

        return trim(preg_replace("/\\n{3,}/", "\n\n", $text));
    }

    /**
     * A displayed formula as an [[ascii]] block: a backtick alone on the lines
     * before and after, one row per line, which STACK shows aligned at the
     * relations. Inline backticks on consecutive lines would run into one
     * paragraph. Mathpix returns a handwritten block as {:[x^(2)-1=0],[x=+-1]:}.
     */
    private static function asciimath_block(string $ascii): string {
        $ascii = trim($ascii);
        if (!preg_match('/^\{:\[(.*)\]:\}$/s', $ascii, $match)) {
            return self::block_of([$ascii]);
        }
        $rows = [];
        $row = '';
        $depth = 0;
        $quoted = false;
        $inner = $match[1];
        for ($i = 0, $length = strlen($inner); $i < $length; $i++) {
            $char = $inner[$i];
            if ($char === '"') {
                $quoted = !$quoted;
            } else if (!$quoted && strpos('([{', $char) !== false) {
                $depth++;
            } else if (!$quoted && strpos(')]}', $char) !== false) {
                if ($depth === 0 && substr($inner, $i, 3) === '],[') {
                    $rows[] = $row;
                    $row = '';
                    $i += 2;
                    continue;
                }
                $depth--;
            }
            $row .= $char;
        }
        $rows[] = $row;
        return self::block_of($rows);
    }

    /**
     * Rows as a block, except a row that opens with prose: "Answer: 4" or
     * "so, x=4" written in the block comes back as "Answer: "4. That row is
     * prose followed by its maths, outside the block, as STACK's extractors
     * read a labelled line ("Answer: `4`") and as the learner wrote it.
     */
    private static function block_of(array $rows): string {
        $lines = [];
        $block = [];
        foreach (array_map('trim', $rows) as $row) {
            if ($row === '') {
                continue;
            }
            if ($row[0] === '"') {
                if ($block) {
                    $lines[] = "`\n" . implode("\n", $block) . "\n`";
                    $block = [];
                }
                $lines[] = self::asciimath_row($row);
                continue;
            }
            $block[] = self::primes($row);
        }
        if ($block) {
            $lines[] = "`\n" . implode("\n", $block) . "\n`";
        }
        return implode("\n", $lines);
    }

    /** One formula in a row of prose: "Answer: "4 is Answer: `4`. */
    private static function asciimath_row(string $ascii): string {
        $ascii = self::primes(trim($ascii));
        if (preg_match('/^"([^"]*)"\s*(.*)$/s', $ascii, $match)) {
            $prose = trim($match[1]);
            $maths = trim($match[2]);
            return trim($prose . ($maths === '' ? '' : ' `' . $maths . '`'));
        }
        return $ascii === '' ? '' : '`' . $ascii . '`';
    }

    /**
     * Mathpix writes f^{\\prime}(x) as f^(')(x). It shows as f'(x) does, and
     * f'(x) is what a learner, and a label such as "f'(x) =", writes.
     */
    private static function primes(string $ascii): string {
        return preg_replace("/\\^\\(('+)\\)/", '$1', $ascii);
    }

    /** Wrap every converted row independently so STACK preserves line boundaries. */
    private static function wrap_math(string $math): string {
        $rows = preg_split('/\n+/', trim($math));
        $rows = array_values(array_filter(array_map('trim', $rows), static function(string $row): bool {
            return $row !== '';
        }));
        return implode("\n", array_map(static function(string $row): string {
            // A row split into statements already marks its own maths.
            return strpos($row, '`') === false ? '`' . $row . '`' : $row;
        }, $rows));
    }

    /**
     * Mark each statement of a row separately and keep the prose between them
     * as text: "x>0 \\text{and} x-2>0, \\text{so} x>2" becomes
     * "`x>0 and x-2>0`, so `x>2`". Null when the row is a single statement.
     */
    private static function statements(string $latex): ?string {
        $segments = statement_splitter::split_statements($latex);
        if (count($segments) < 2) {
            return null;
        }
        $row = '';
        foreach ($segments as [$type, $text]) {
            if ($type === 'math') {
                $math = stack_converter::normalize_selection($text);
                if ($math === '') {
                    continue;
                }
                $piece = '`' . $math . '`';
            } else {
                $piece = $text;
            }
            $row .= ($row === '' || preg_match('/^[,.;:]/', $piece) ? '' : ' ') . $piece;
        }
        return $row;
    }

    /** Convert one Free-text maths region without treating TeX layout as algebra. */
    private static function math_to_ascii(string $latex): string {
        $converted = [];
        foreach (line_builder::build_lines($latex) as $line) {
            $stack = trim((string)($line['stack'] ?? ''));
            $linelatex = (string)($line['latex'] ?? '');
            $withoutproofarrow = preg_replace(
                '/^(?:\\s|\\\\[,;:! ])*\\\\(?:Rightarrow|Longrightarrow|implies|Leftrightarrow|iff)\\s*/',
                '',
                $linelatex
            );
            if ($withoutproofarrow !== $linelatex) {
                $linelatex = $withoutproofarrow;
                $stack = stack_converter::normalize_selection($linelatex);
            }
            if (preg_match('/\\\\(?:approx|simeq|sim)(?![A-Za-z])/', $linelatex)) {
                // Convert each side separately so "~~" lands where the approximation was,
                // not on an earlier "=" in the same row.
                $sides = preg_split('/\\\\(?:approx|simeq|sim)(?![A-Za-z])/', $linelatex);
                $stack = implode('~~', array_map(static function(string $side): string {
                    return trim($side) === '' ? '' : stack_converter::normalize_selection($side);
                }, $sides));
            }
            $statements = self::statements($linelatex);
            if ($statements !== null) {
                $stack = $statements;
            }
            if (isset($line['freetextrow'])) {
                // A piecewise branch: its pieces already marked, words as words.
                $stack = $line['freetextrow'];
            }
            if ($stack !== '') {
                $converted[] = (isset($line['itemnumber']) ? $line['itemnumber'] . '. ' : '') . $stack;
            }
        }
        if ($converted) {
            return implode("\n", $converted);
        }
        return stack_converter::normalize_selection($latex);
    }
}
