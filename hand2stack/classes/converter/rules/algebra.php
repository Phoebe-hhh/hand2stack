<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Fractions, roots, absolute values and products.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\converter\rules;

use local_hand2stack\converter\patterns;

defined('MOODLE_INTERNAL') || die();

final class algebra {
    /** |x| and \\vert x\\vert as abs(x), when the bars pair up. */
    public static function absolute(string $input): string {
        $output = preg_replace('/\\\\[lr]?vert(?![a-zA-Z])/', '|', $input);
        return self::pair_bars($output) ?? $output;
    }

    /**
     * Whether the bars in $input do not pair up one way only: unpaired,
     * |a|b|c| (|a|*b*|c| or |a*|b|*c|) or a norm ||x||. Such a row is the
     * learner's to clarify, so it stays as written.
     */
    public static function has_ambiguous_bars(string $input): bool {
        // \\left and \\big only size a bar: in "x-\\left|y\\right|" it follows the minus.
        $output = preg_replace('/\\\\(?:left|right|[bB]igg?[lr]?)(?![a-zA-Z])\s*/', '', $input);
        $output = preg_replace('/\\\\[lr]?vert(?![a-zA-Z])/', '|', $output);
        // \\| is a norm, which has no STACK spelling here.
        return strpos($output, '\\|') !== false
            || strpos($output, '|') !== false && self::pair_bars($output) === null;
    }

    /** $input with each pair of bars as abs(..), or null when they do not pair one way. */
    private static function pair_bars(string $output): ?string {
        if (strpos($output, '|') === false) {
            return $output;
        }

        $normalized = '';
        $depth = 0;
        $length = strlen($output);
        for ($index = 0; $index < $length; $index++) {
            if ($output[$index] !== '|') {
                $normalized .= $output[$index];
                continue;
            }

            $previous = '';
            for ($cursor = $index - 1; $cursor >= 0; $cursor--) {
                if (!ctype_space($output[$cursor])) {
                    $previous = $output[$cursor];
                    break;
                }
            }
            $opens = $depth === 0 || $previous === '' || strpos('+-*/^=<(,[', $previous) !== false;
            if ($opens) {
                $normalized .= ($previous !== '' && ctype_alpha($previous) ? ' ' : '') . 'abs(';
                $depth++;
            } else {
                // A bar right before a term, with two more bars to come, may
                // close this pair or open one inside it.
                $next = ltrim(substr($output, $index + 1));
                if ($next !== '' && (ctype_alnum($next[0]) || strpos('(\\', $next[0]) !== false)
                        && substr_count($output, '|', $index + 1) >= 2) {
                    return null;
                }
                $normalized .= ')';
                $depth--;
            }
        }

        // ||x|| is a norm, not two empty absolute values.
        return $depth === 0 && strpos($normalized, 'abs()') === false ? $normalized : null;
    }

    /**
     * "2\\sqrt{3}" and "\\alpha\\beta" are products, but "\\tan\\theta" and
     * "\\sin\\sqrt{x}" apply a function: no "*" after a function name.
     */
    public static function star_before_commands(string $input, string $commands): string {
        return preg_replace_callback(
            '/(\\\\[A-Za-z]+|[A-Za-z0-9)\]])(\s*)(?=\\\\(?:' . $commands . ')(?![A-Za-z]))/',
            static function(array $m): string {
                // Only a Greek letter is a value; any other command (\\int,
                // \\sin, \\cdot, ...) is an operator, never a factor.
                if ($m[1][0] === '\\' && !preg_match('/^\\\\(?:' . patterns::GREEK_LETTERS . ')$/', $m[1])) {
                    return $m[1] . $m[2];
                }
                return $m[1] . patterns::IMPLICIT_PRODUCT;
            },
            $input
        );
    }

    /** \\frac{a}{b}, \\sqrt{x} and \\sqrt[n]{x} with nested groups. */
    public static function fractions_roots(string $input): string {
        // A group may hold braces of its own, e.g. the exponent in
        // "\\frac{x e^{-\\frac{x}{2}}}{2}"; the loop converts what is nested.
        $group = '(?<g>\{(?:[^{}]++|(?&g))*\})';
        $output = $input;
        do {
            $previous = $output;
            $output = preg_replace_callback(
                '/\\\\sqrt\s*\[([^\[\]]+)\]\s*' . $group . '/',
                static function(array $m): string {
                    return '(' . substr($m['g'], 1, -1) . ')^(1/' . $m[1] . ')';
                },
                $output
            );
            $output = preg_replace_callback('/\\\\sqrt\s*' . $group . '/', static function(array $m): string {
                return 'sqrt(' . substr($m['g'], 1, -1) . ')';
            }, $output);
            $output = preg_replace_callback(
                '/\\\\frac\s*(?<n>\{(?:[^{}]++|(?&n))*\})\s*(?<d>\{(?:[^{}]++|(?&d))*\})/',
                static function(array $m): string {
                    return '(' . substr($m['n'], 1, -1) . ')/(' . substr($m['d'], 1, -1) . ')';
                },
                $output
            );
        } while ($output !== $previous);

        return $output;
    }

    /** Multi-letter names stay whole: known identifiers, calls and unknown names alike. */
    public static function variable_products(string $input): string {
        $identifiers = patterns::IDENTIFIERS;

        // A word after a backslash is an unsupported command; leave it whole.
        return preg_replace_callback('/(?<![\\\\A-Za-z])[A-Za-z]{2,}(?:10|2)?(?=(\()?)/', static function($m) use ($identifiers) {
            if (in_array(strtolower($m[0]), $identifiers, true)) {
                return $m[0];
            }
            // A longer unknown name applied to brackets, e.g. expand(x), is a
            // function call for STACK to accept or reject, not e*x*p*a*n*d.
            if (strlen($m[0]) >= 3 && !empty($m[1])) {
                return $m[0];
            }
            // An unknown continuous name may itself be a variable name. Keep
            // it instead of guessing that every letter is a separate factor.
            return $m[0];
        }, $input);
    }
}
