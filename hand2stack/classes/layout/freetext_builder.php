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
     * Preserve Mathpix prose and paragraphs while converting only delimited maths
     * into STACK free-text inline mathematics.
     */
    public static function build(string $text, string $ascii = '', string $latex = ''): string {
        return notation_keeper::keeping_primes(static function() use ($text, $ascii, $latex): string {
            return self::convert($text, $ascii, $latex);
        });
    }

    private static function convert(string $text, string $ascii, string $latex): string {
        $text = trim(str_replace(["\r\n", "\r"], "\n", $text));
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
        foreach (document_builder::document_segments($text) as [$type, $value]) {
            if ($type === 'text') {
                // The review rows drop the uploaded filename header too.
                $converted .= implode("\n", array_filter(explode("\n", $value), static function(string $row): bool {
                    return !line_builder::is_filename_row($row);
                }));
                continue;
            }
            [$prose, $latex] = statement_splitter::split_leading_prose($value);
            $math = $latex === '' ? '' : self::math_to_ascii($latex);
            $piece = trim($prose . ' ' . ($math === '' ? $latex : self::wrap_math($math)));
            // Two formulas with nothing but spaces between them are two rows.
            // Only segment boundaries break: the value and condition of a
            // piecewise row ("`y=x^2+1` `x>1`") stay on their row.
            if (preg_match('/`[ \t]*$/u', $converted) && strpos($piece, '`') === 0) {
                $converted = rtrim($converted, " \t") . "\n";
            }
            $converted .= $piece;
        }
        $text = $converted;

        return trim(preg_replace("/\\n{3,}/", "\n\n", $text));
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
