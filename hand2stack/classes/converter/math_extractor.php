<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Pick the mathematics out of a recognized line that may hold prose.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\converter;

use local_hand2stack\converter\rules\named_notation;

defined('MOODLE_INTERNAL') || die();

final class math_extractor {
    /** The mathematical candidate of a line, still in LaTeX, or '' when there is none. */
    public static function extract(string $input): string {
        $s = statement_splitter::brace_script_labels(trim($input));
        if ($s === '') {
            return '';
        }
        // A cases or array block is maths throughout: the \\text{otherwise} of a
        // branch is its condition. Only prose outside the block needs picking out.
        $block = '/\\\\begin\s*\{(cases|array)\}[\s\S]*?\\\\end\s*\{\1\}/';
        if (preg_match($block, $s)) {
            $math = statement_splitter::split_leading_prose($s)[1];
            if (!preg_match('/\\\\(?:text|mathrm|operatorname)\s*\{/', preg_replace($block, '', $math))) {
                return $math;
            }
        }

        if (preg_match('/^\\\\text\s*\{\s*([ei])\s*\}$/u', $s, $match)) {
            return $match[1];
        }
        if (preg_match('/^\\\\(?:text|mathrm)\s*\{\s*([^{}]+?)\s*\}$/u', $s, $match)
                && preg_match('/[=+\-*\/^]|\d|\\\\(?:frac|sqrt|sin|cos|tan|log|ln)\b/u', $match[1])) {
            return trim($match[1]);
        }

        $s = str_replace(['−', '–', '—', '＝'], ['-', '-', '-', '='], $s);
        // Before prose detection, which would drop \mathrm{d} as a word.
        $s = named_notation::normalize($s);
        $s = named_notation::combinations($s);
        $s = statement_splitter::prose_operatornames($s);
        $connected = statement_splitter::join_connected_relations($s);
        if ($connected !== null) {
            return $connected;
        }
        // Preserve a recognized connective even when OCR damaged one side.
        // The Free-text review must keep the editable row, while protecting
        // `or`/`and` from implicit multiplication. Thus `x=-1 \text{or} x-3`
        // remains visibly incomplete instead of becoming `x=-1*x-3`.
        $connectivewords = implode('|', array_map('preg_quote', array_keys(patterns::CONNECTIVES)));
        $malformedseparator = '/\\\\(?:text|mathrm)\s*\{\s*(' . $connectivewords . ')\s*\}/iu';
        if (preg_match($malformedseparator, $s)) {
            $s = preg_replace_callback($malformedseparator, static function(array $match): string {
                return ' ' . patterns::CONNECTIVES[strtolower($match[1])] . ' ';
            }, $s);
            return trim(str_replace(['\\quad', '\\qquad'], ' ', $s));
        }
        // A leading ∴ introduces the line; between two statements it stays,
        // so normalize() can split "2x+3=7 \\therefore x=2" there.
        $s = preg_replace('/^\s*\\\\(?:therefore|because)(?![A-Za-z])\s*/', '', $s);

        // Extract explicitly delimited maths before removing Mathpix's dollar
        // markers. Doing this later lets trailing letters from prose (the r in
        // "for" or y in "Finally") leak into the mathematical candidate.
        if (preg_match('/\$([^$\n]+?)\$/u', $s, $match)) {
            return trim($match[1]);
        }
        if (preg_match('/\\\\\((.+?)\\\\\)/u', $s, $match)
                || preg_match('/\\\\\[(.+?)\\\\\]/u', $s, $match)) {
            return trim($match[1]);
        }
        $prosecheck = preg_replace(
            '/_\{\s*\\\\(?:text|mathrm)\s*\{\s*[^{}]*?\s*\}\s*\}/u',
            '_label',
            preg_replace(patterns::UNIT, 'unit', $s)
        );
        // Prose inside a formula is what Mathpix marks as \\text{...}; a word
        // list would only guess at it.
        $hasprose = preg_match('/(?:\\\\text|(?<!\\\\)\btext|\\\\mathrm)\s*\{/u', $prosecheck) === 1;

        // Mathpix occasionally omits the closing delimiter at the end of a
        // handwritten line. The opening delimiter still gives an exact prose
        // boundary, so keep only its remainder. A Japanese font may render
        // the "$" as a yen sign.
        if (preg_match('/[$¥￥]([^$¥￥\n]+)$/u', $s, $match)) {
            return trim($match[1]);
        }

        // Mathpix uses dollar signs as inline-math delimiters. A handwritten
        // mixed text/formula line can contain only one of the pair, and a
        // Japanese font may render the same character as a yen sign. Neither
        // belongs in a STACK expression.
        $s = preg_replace('/[$¥￥]/u', '', $s);

        // Mathpix returns a complete formula for ordinary image uploads. Do
        // not run those pure-math lines through the prose-oriented candidate
        // matcher, which can mistake an exponent, bound, or matrix row for the
        // whole answer. Mixed prose still follows the extraction rules below.
        if (!$hasprose) {
            return trim($s);
        }
        // Prose between two statements ("x>0 \\text{ so } x>2") separates
        // them: keep both for normalize(), which lists them, rather than
        // picking one and joining a stray letter of the other to it.
        $statements = array_filter(statement_splitter::split_statements($s), static function(array $segment): bool {
            return $segment[0] === 'math';
        });
        if (count($statements) > 1) {
            return trim($s);
        }

        // A unit after a number belongs to the quantity: keep it through the
        // prose removal below.
        $units = [];
        $s = preg_replace_callback(patterns::UNIT, static function(array $m) use (&$units): string {
            $token = '§U' . count($units) . '§';
            $units[$token] = $m[0];
            return $token;
        }, $s);
        $s = preg_replace('/\\\\text\s*\{\s*[^{}]*?\s*\}/u', ' ', $s);
        $s = preg_replace('/(?<!\\\\)\btext\s*\{\s*[^{}]*?\s*\}/u', ' ', $s);
        $s = preg_replace('/\\\\mathrm\s*\{\s*[^{}]*?\s*\}/u', ' ', $s);
        $s = strtr($s, $units);
        $s = preg_replace('/\s+/', ' ', $s);

        // A bound such as k=1 is part of the surrounding operator, not a
        // standalone equation. Capture the whole sum/product before applying
        // the generic equation matcher below.
        if (preg_match('/(\\\\(?:sum|prod|pi)\s*_\s*\{\s*[a-zA-Z]\s*=\s*[^{}]+\}\s*\^\s*(?:\{[^{}]+\}|\([^()]+\))\s*.+)$/u', $s, $match)) {
            return trim($match[1]);
        }

        if (preg_match('/(?<![A-Za-z])([A-Za-z]\s*=\s*[^,\s=]+\s*,\s*[^,\s=]+)/u', $s, $match)) {
            return trim($match[1]);
        }

        $fraction = self::first_fraction($s);
        if ($fraction !== null) {
            $prefix = substr($s, 0, $fraction['start']);
            if (preg_match('/(?<![A-Za-z])([A-Za-z](?![A-Za-z])\s*=\s*)$/u', $prefix, $match)) {
                return trim($match[1] . $fraction['value']);
            }
            return $fraction['value'];
        }

        $atom = '(?:\\\\[a-zA-Z]+(?:\s*\{[^{}]*\}){0,2}|\([^()]+\)(?:\s*\^\s*(?:\{[^{}]+\}|[A-Za-z0-9]))?|[A-Za-z](?![A-Za-z])(?:\s*\^\s*(?:\{[^{}]+\}|[A-Za-z0-9]))?|\d+(?:\.\d+)?|[+\-*\/.])';
        $equation = '/(?<![A-Za-z])' . $atom . '(?:\s*' . $atom . ')*\s*(?:=|<=|>=|#|<|>)\s*' . $atom . '(?:\s*' . $atom . ')*/u';
        if (preg_match_all($equation, $s, $matches) && !empty($matches[0])) {
            usort($matches[0], static function($a, $b) {
                return strlen($b) <=> strlen($a);
            });
            return trim($matches[0][0]);
        }

        $expression = '/' . $atom . '(?:\s*' . $atom . ')+/u';
        if (preg_match_all($expression, $s, $matches) && !empty($matches[0])) {
            $candidates = array_values(array_filter($matches[0], static function($value) {
                return preg_match('/(?:\d|[+\-*\/^]|\\\\frac|\\\\sqrt)/u', $value);
            }));
            if ($candidates) {
                usort($candidates, static function($a, $b) {
                    return strlen($b) <=> strlen($a);
                });
                return trim($candidates[0]);
            }
        }

        if (preg_match('/[=+\-*\/^]|\d|\\\\frac|\\\\sqrt/u', $s)) {
            return $s;
        }

        return '';
    }

    private static function first_fraction(string $input): ?array {
        $offset = 0;
        while (($start = strpos($input, '\\frac', $offset)) !== false) {
            $cursor = $start + strlen('\\frac');
            $valid = true;
            for ($group = 0; $group < 2; $group++) {
                while (isset($input[$cursor]) && ctype_space($input[$cursor])) {
                    $cursor++;
                }
                if (!isset($input[$cursor]) || $input[$cursor] !== '{') {
                    $valid = false;
                    break;
                }
                $depth = 1;
                $cursor++;
                while (isset($input[$cursor]) && $depth > 0) {
                    if ($input[$cursor] === '{') {
                        $depth++;
                    } else if ($input[$cursor] === '}') {
                        $depth--;
                    }
                    $cursor++;
                }
                if ($depth !== 0) {
                    $valid = false;
                    break;
                }
            }
            if ($valid) {
                return ['start' => $start, 'value' => substr($input, $start, $cursor - $start)];
            }
            $offset = $start + strlen('\\frac');
        }
        return null;
    }
}
