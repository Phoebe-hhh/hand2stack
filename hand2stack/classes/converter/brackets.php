<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Bracket matching and argument reading for the conversion steps.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\converter;

defined('MOODLE_INTERNAL') || die();

final class brackets {
    /** Offset of the brace closing the one at $open, or null when unbalanced. */
    public static function closing_brace(string $s, int $open): ?int {
        $depth = 0;
        for ($i = $open, $length = strlen($s); $i < $length; $i++) {
            if ($s[$i] === '{') {
                $depth++;
            } else if ($s[$i] === '}' && --$depth === 0) {
                return $i;
            }
        }
        return null;
    }

    /**
     * Offset of the bracket closing the one at $open, or null when unbalanced.
     */
    public static function closing_bracket(string $s, int $open): ?int {
        $pairs = ['(' => ')', '{' => '}', '[' => ']'];
        $opening = $s[$open];
        $closing = $pairs[$opening];
        $depth = 0;
        for ($i = $open, $length = strlen($s); $i < $length; $i++) {
            if ($s[$i] === $opening) {
                $depth++;
            } else if ($s[$i] === $closing && --$depth === 0) {
                return $i;
            }
        }
        return null;
    }

    /**
     * End offset of one factor of an unbracketed function argument starting at
     * $cursor: a number, a single letter, a Greek letter, \\frac{..}{..},
     * \\sqrt{..} or a call such as abs(..), with any super/subscripts.
     */
    private static function read_argument_factor(string $s, int $cursor): ?int {
        $rest = substr($s, $cursor);
        if (preg_match('/^(?:\\\\frac\s*(?=\{)|\\\\sqrt\s*(?:\[[^\[\]]*\]\s*)?(?=\{))/', $rest, $match)) {
            $end = $cursor + strlen($match[0]);
            $groups = strpos($match[0], 'frac') !== false ? 2 : 1;
            for ($group = 0; $group < $groups; $group++) {
                while (isset($s[$end]) && ctype_space($s[$end])) {
                    $end++;
                }
                if (!isset($s[$end]) || $s[$end] !== '{' || ($close = self::closing_bracket($s, $end)) === null) {
                    return null;
                }
                $end = $close + 1;
            }
        } else if (preg_match('/^(?:abs|sqrt|exp)\s*(?=\()/', $rest, $match)) {
            $close = self::closing_bracket($s, $cursor + strlen($match[0]));
            if ($close === null) {
                return null;
            }
            $end = $close + 1;
        } else if (preg_match('/^(?:\d+(?:\.\d+)?|\\\\(?:' . patterns::GREEK_LETTERS . ')(?![A-Za-z])|%(?:pi|e|i)(?![A-Za-z])|[A-Za-z](?![A-Za-z]))/', $rest, $match)) {
            $end = $cursor + strlen($match[0]);
        } else {
            return null;
        }

        // Super- and subscripts belong to the factor: "\\sin x^{2}" is sin(x^2).
        while (preg_match('/\G\s*(?:°|[\^_]\s*(?:(?=[{(])|[+-]?\d+|[A-Za-z]))/u', $s, $match, 0, $end)) {
            $end += strlen($match[0]);
            if (isset($s[$end]) && ($s[$end] === '{' || $s[$end] === '(') && preg_match('/[\^_]\s*$/', $match[0])) {
                $close = self::closing_bracket($s, $end);
                if ($close === null) {
                    return null;
                }
                $end = $close + 1;
            }
        }
        return $end;
    }

    /**
     * Read the argument of a function at $cursor. A bracketed argument is
     * taken whole; an unbracketed one is the following product of factors, as
     * handwriting means it: `\sin 2x`, `\sin \frac{\pi}{6}`, `\ln x^{2}`.
     *
     * @return array{0:string,1:int}|null The argument and the offset after it.
     */
    public static function read_function_argument(string $s, int $cursor): ?array {
        while (isset($s[$cursor]) && ctype_space($s[$cursor])) {
            $cursor++;
        }
        if (!isset($s[$cursor])) {
            return null;
        }
        if ($s[$cursor] === '(' || $s[$cursor] === '{') {
            $close = self::closing_bracket($s, $cursor);
            return $close === null ? null : [substr($s, $cursor + 1, $close - $cursor - 1), $close + 1];
        }

        $start = $cursor;
        $end = null;
        while (($next = self::read_argument_factor($s, $cursor)) !== null) {
            $end = $next;
            $cursor = $next;
            while (isset($s[$cursor]) && (ctype_space($s[$cursor]) || $s[$cursor] === patterns::IMPLICIT_PRODUCT)) {
                $cursor++;
            }
        }
        return $end === null ? null : [substr($s, $start, $end - $start), $end];
    }

    /**
     * The body of \\lim, \\sum, \\prod or d/dx and what follows it. Like a
     * function argument (\\sin x+1 is sin(x)+1), the body ends at a "+" or "-"
     * outside brackets, or at a relation: \\lim f(x) + 1 is (lim f(x)) + 1.
     * A sign that starts the body or follows an operator belongs to it.
     *
     * @return array{0:string,1:string}
     */
    public static function split_operator_body(string $input): array {
        [$body, $rest] = self::split_at_relation($input);
        $depth = 0;
        $previous = '';
        for ($i = 0, $length = strlen($body); $i < $length; $i++) {
            $char = $body[$i];
            if (strpos('({[', $char) !== false) {
                $depth++;
            } else if (strpos(')}]', $char) !== false) {
                $depth--;
            } else if ($depth === 0 && ($char === '+' || $char === '-') && $previous !== ''
                    && strpos('^_*/(,{[=<>+-', $previous) === false) {
                return [rtrim(substr($body, 0, $i)), substr($body, $i) . $rest];
            }
            if (!ctype_space($char)) {
                $previous = $char;
            }
        }
        return [$body, $rest];
    }

    /**
     * Split "body = rest" at the first relation outside brackets, so that a
     * limit or sum keeps only its own body: "\\lim ... \\frac{\\sin x}{x}=1".
     *
     * @return array{0:string,1:string}
     */
    private static function split_at_relation(string $input): array {
        $depth = 0;
        for ($i = 0, $length = strlen($input); $i < $length; $i++) {
            $char = $input[$i];
            if (strpos('({[', $char) !== false) {
                $depth++;
            } else if (strpos(')}]', $char) !== false) {
                $depth--;
            } else if ($depth === 0 && strpos('=<>#', $char) !== false && ($i === 0 || $input[$i - 1] !== '\\')) {
                return [rtrim(substr($input, 0, $i)), substr($input, $i)];
            }
        }
        return [$input, ''];
    }
}
