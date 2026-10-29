<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Trigonometric and logarithmic functions and their arguments.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\converter\rules;

use local_hand2stack\converter\brackets;
use local_hand2stack\converter\patterns;

defined('MOODLE_INTERNAL') || die();

final class trig_log {
    /** "30^{\\circ}" inside a trigonometric function is an angle in degrees. */
    private static function degrees_to_radians(string $argument): string {
        if (preg_match('/^(.+?)\s*°$/u', trim($argument), $match)) {
            return '(' . $match[1] . ')*\\pi/180';
        }
        return $argument;
    }

    /**
     * Convert a logarithm with an explicit base, including a parenthesised
     * argument which itself contains parentheses.
     *
     * Regexes such as `[^()]*` stop at the first nested group, turning
     * `\log_{2}(x(x-2))` into the invalid product `log_2*(x*(x-2))`.
     */
    public static function base_logarithms(string $input): string {
        $offset = 0;
        // Learners editing the STACK text type the same notation without the
        // backslash, e.g. `log_2(x(x-2))`.
        // Mathpix AsciiMath writes a grouped subscript as `log_(2)`, while
        // LaTeX and learner edits commonly use `log_{2}` and `log_2`.
        $pattern = '/(?:\\\\|(?<![A-Za-z\\\\]))log\s*_\s*'
            . '(?:\{([^{}]+)\}|\(([^()]+)\)|([A-Za-z0-9]+))\s*/';

        while (preg_match($pattern, $input, $match, PREG_OFFSET_CAPTURE, $offset)) {
            $start = $match[0][1];
            $base = '';
            foreach ([1, 2, 3] as $group) {
                if ($match[$group][1] !== -1) {
                    $base = $match[$group][0];
                    break;
                }
            }
            $argument = brackets::read_function_argument($input, $start + strlen($match[0][0]));
            if ($argument === null) {
                $offset = $start + strlen($match[0][0]);
                continue;
            }
            $replacement = '(log(' . $argument[0] . ')/log(' . $base . '))';
            $input = substr($input, 0, $start) . $replacement . substr($input, $argument[1]);
            $offset = $start + strlen($replacement);
        }

        return $input;
    }

    /**
     * Bracket the argument of \\sin, \\ln, ... (or the bare sin, ln, ... typed
     * by a learner), including a power written on the function name:
     * `\sin^{2} x` is sin(x)^2 and `\sin^{-1} x` is asin(x).
     */
    public static function function_arguments(string $input): string {
        $offset = 0;
        $pattern = '/(?:\\\\|(?<![A-Za-z\\\\%]))(' . patterns::BARE_ARGUMENT_FUNCTIONS . ')(?![A-Za-z])'
            . '\s*(?:\^\s*(?:\{\s*([^{}]+?)\s*\}|\(\s*([^()]+?)\s*\)|([+-]?\d+))\s*)?/';
        $inverse = ['arcsin' => 'asin', 'arccos' => 'acos', 'arctan' => 'atan'];

        while (preg_match($pattern, $input, $match, PREG_OFFSET_CAPTURE, $offset)) {
            $start = $match[0][1];
            $argument = brackets::read_function_argument($input, $start + strlen($match[0][0]));
            if ($argument === null) {
                $offset = $start + strlen($match[0][0]);
                continue;
            }
            $name = $inverse[$match[1][0]] ?? $match[1][0];
            $power = '';
            foreach ([2, 3, 4] as $group) {
                if (isset($match[$group]) && $match[$group][1] !== -1 && $match[$group][0] !== '') {
                    $power = trim($match[$group][0]);
                }
            }
            $value = in_array($name, ['sin', 'cos', 'tan', 'cot', 'sec', 'csc'], true)
                ? self::degrees_to_radians($argument[0]) : $argument[0];
            if ($power === '-1' && in_array($name, ['sin', 'cos', 'tan'], true)) {
                $replacement = 'a' . $name . '(' . $value . ')';
            } else {
                $replacement = $name . '(' . $value . ')' . ($power === '' ? '' : '^(' . $power . ')');
            }
            $input = substr($input, 0, $start) . $replacement . substr($input, $argument[1]);
            // Rescan inside the argument: it may hold a further function.
            $offset = $start + strlen($name) + 1;
        }

        return $input;
    }

    /** \\arcsin x and \\sin^{-1} x as asin(x). */
    public static function inverse_trig(string $input): string {
        $s = $input;
        foreach (['arcsin' => 'asin', 'arccos' => 'acos', 'arctan' => 'atan'] as $latex => $stack) {
            $s = preg_replace('/\\\\' . $latex . '\s*\{([^{}]+)\}/', $stack . '($1)', $s);
            $s = preg_replace('/\\\\' . $latex . '\s*\(([^()]*)\)/', $stack . '($1)', $s);
            $s = preg_replace('/\\\\' . $latex . '\s+([a-zA-Z0-9]+)/', $stack . '($1)', $s);
        }
        // \\sin^{-1} is the inverse function by convention, for every
        // trigonometric and hyperbolic function alike.
        $inverses = ['sinh' => 'asinh', 'cosh' => 'acosh', 'tanh' => 'atanh', 'sin' => 'asin', 'cos' => 'acos',
            'tan' => 'atan', 'cot' => 'acot', 'sec' => 'asec', 'csc' => 'acsc'];
        foreach ($inverses as $latex => $stack) {
            $s = preg_replace('/\\\\' . $latex . '(?![A-Za-z])\s*\^\s*\(\s*-1\s*\)\s*\\\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/', $stack . '(($1)/($2))', $s);
            // The argument in brackets may hold brackets of its own: \\tan^{-1}(x^{2}).
            $s = preg_replace('/\\\\' . $latex . '(?![A-Za-z])\s*\^\s*\(\s*-1\s*\)\s*(\((?:[^()]++|(?1))*\))/', $stack . '$1', $s);
            $s = preg_replace('/\\\\' . $latex . '(?![A-Za-z])\s*\^\s*\(\s*-1\s*\)\s*([a-zA-Z0-9]+)/', $stack . '($1)', $s);
        }
        return $s;
    }
}
