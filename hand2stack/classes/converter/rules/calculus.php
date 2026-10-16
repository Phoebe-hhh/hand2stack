<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Derivatives, integrals, limits, sums and products.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\converter\rules;

use local_hand2stack\converter\brackets;
use local_hand2stack\converter\notation_keeper;
use local_hand2stack\converter\patterns;

defined('MOODLE_INTERNAL') || die();

final class calculus {
    /** dy/dx, d^2y/dx^2 and d/dx f(x) as diff(...). */
    public static function derivative(string $input): string {
        // Quotient notation: dy/dx and d^2y/dx^2. Handle this before the
        // generic fraction pass so the numerator and denominator stay intact.
        $output = preg_replace_callback(
            '/\\\\frac\s*\{\s*(d|\\\\partial)\s*\^\s*(?:\((\d+)\)|(\d+))\s*([a-zA-Z])\s*\}\s*\{\s*\1\s*([a-zA-Z])\s*\^\s*(?:\((\d+)\)|(\d+))\s*\}/',
            static function($m) {
                $num = $m[2] ?: $m[3];
                $den = $m[6] ?: $m[7];
                return $num === $den ? 'diff(' . $m[4] . ',' . $m[5] . ',' . $num . ')' : $m[0];
            },
            $input
        );
        $output = preg_replace_callback(
            '/\\\\frac\s*\{\s*(d|\\\\partial)\s*([a-zA-Z])\s*\}\s*\{\s*\1\s*([a-zA-Z])\s*\}/',
            static function($m) {
                return 'diff(' . $m[2] . ',' . $m[3] . ')';
            },
            $output
        );

        $output = preg_replace_callback(
            '/\\\\frac\s*\{\s*(d|\\\\partial)\s*\^\s*(?:\((\d+)\)|(\d+))\s*\}\s*\{\s*\1\s*([a-zA-Z])\s*\^\s*(?:\((\d+)\)|(\d+))\s*\}\s*(.+)$/',
            static function($m) {
                $num = $m[2] ?: $m[3];
                $den = $m[5] ?: $m[6];
                [$body, $rest] = brackets::split_operator_body(trim($m[7]));
                return $num === $den ? 'diff(' . $body . ',' . trim($m[4]) . ',' . $num . ')' . $rest : $m[0];
            },
            $output
        );

        return preg_replace_callback(
            '/\\\\frac\s*\{\s*(d|\\\\partial)\s*\}\s*\{\s*\1\s*([a-zA-Z])\s*\}\s*(.+)$/',
            static function($m) {
                [$body, $rest] = brackets::split_operator_body(trim($m[3]));
                return 'diff(' . $body . ',' . trim($m[2]) . ')' . $rest;
            },
            $output
        );
    }

    /** f'(x) and f''(x) as diff(...), unless the conversion keeps primes as written. */
    public static function prime_derivative(string $input): string {
        if (notation_keeper::keeps_primes()) {
            return $input;
        }
        $output = preg_replace('/([a-zA-Z])\s*\^\s*\{\s*\\\\prime\s*\\\\prime\s*\}\s*\(\s*([a-zA-Z])\s*\)/', 'diff($1($2),$2,2)', $input);
        $output = preg_replace('/([a-zA-Z])\s*\^\s*\{\s*\\\\prime\s*\}\s*\(\s*([a-zA-Z])\s*\)/', 'diff($1($2),$2)', $output);
        $output = preg_replace('/([a-zA-Z])\'\'\s*\(\s*([a-zA-Z])\s*\)/', 'diff($1($2),$2,2)', $output);
        return preg_replace('/([a-zA-Z])\'\s*\(\s*([a-zA-Z])\s*\)/', 'diff($1($2),$2)', $output);
    }

    /**
     * Convert each integral within its own scope: up to the bracket that
     * encloses it or a relation beside it. "\\int_0^1 x\\,dx = 1/2" and
     * "\\frac{\\int_0^1 x\\,dx}{2}" both end the integral at its differential.
     */
    public static function integrals(string $input): string {
        $offset = 0;
        while (preg_match('/\\\\int(?![A-Za-z])/', $input, $match, PREG_OFFSET_CAPTURE, $offset)) {
            $start = $match[0][1];
            $length = strlen($input);
            $end = $length;
            $depth = 0;
            for ($i = $start; $i < $length; $i++) {
                $char = $input[$i];
                if (strpos('({[', $char) !== false) {
                    $depth++;
                } else if (strpos(')}]', $char) !== false && --$depth < 0) {
                    $end = $i;
                    break;
                } else if ($depth === 0 && strpos('=<>#,', $char) !== false && $input[$i - 1] !== '\\') {
                    $end = $i;
                    break;
                }
            }
            $scope = rtrim(substr($input, $start, $end - $start));
            $input = substr($input, 0, $start) . self::integral($scope) . substr($input, $start + strlen($scope));
            $offset = $start + 1;
        }
        return $input;
    }

    private static function integral(string $input): string {
        $output = preg_replace_callback(
            '/\\\\int\s*_\s*\{\s*([^{}]+?)\s*\}\s*\^\s*(?:\{\s*([^{}]+?)\s*\}|\(\s*([^()]+?)\s*\)|((?:\\\\[A-Za-z]+|[A-Za-z0-9%.+\-]+)))\s*(.+?)\s*(?:\\\\[,;:!]\s*)*d\s*([a-zA-Z])\s*$/',
            static function($m) {
                $upper = $m[2] !== '' ? $m[2] : ($m[3] !== '' ? $m[3] : $m[4]);
                $integrand = ltrim(trim($m[5]), '*' . patterns::IMPLICIT_PRODUCT);
                return 'int(' . $integrand . ',' . trim($m[6]) . ',' . trim($m[1]) . ',' . trim($upper) . ')';
            },
            $input
        );

        $output = preg_replace_callback(
            '/\\\\int\s*_\s*((?:\\\\[A-Za-z]+|[A-Za-z0-9%.+\-]+))\s*\^\s*(?:\{\s*([^{}]+?)\s*\}|\(\s*([^()]+?)\s*\)|((?:\\\\[A-Za-z]+|[A-Za-z0-9%.+\-]+)))\s*(.+?)\s*(?:\\\\[,;:!]\s*)*d\s*([a-zA-Z])\s*$/',
            static function($m) {
                $upper = $m[2] !== '' ? $m[2] : ($m[3] !== '' ? $m[3] : $m[4]);
                $integrand = ltrim(trim($m[5]), '*' . patterns::IMPLICIT_PRODUCT);
                return 'int(' . $integrand . ',' . trim($m[6]) . ',' . trim($m[1]) . ',' . trim($upper) . ')';
            },
            $output
        );

        return preg_replace_callback(
            '/\\\\int\s*(.+?)\s*(?:\\\\[,;:!]\s*)*d\s*([a-zA-Z])\s*$/',
            static function($m) {
                return 'int(' . ltrim(trim($m[1]), '*' . patterns::IMPLICIT_PRODUCT) . ',' . trim($m[2]) . ')';
            },
            $output
        );
    }

    /** \\lim_{x\\to a} f(x) as limit(f(x),x,a). */
    public static function limit(string $input): string {
        return preg_replace_callback(
            '/\\\\lim\s*_\s*\{\s*([a-zA-Z])\s*(?:\\\\to|\\\\rightarrow|\\\\longrightarrow|->|→)\s*([^{}]+?)\s*\}\s*(.+)$/u',
            static function($m) {
                [$body, $rest] = brackets::split_operator_body(trim($m[3]));
                return 'limit(' . $body . ',' . trim($m[1]) . ',' . trim($m[2]) . ')' . $rest;
            },
            $input
        );
    }

    /** \\sum and \\prod with bounds as sum(...) and product(...). */
    public static function sum_product(string $input): string {
        return preg_replace_callback(
            '/\\\\(sum|prod|pi)\s*_\s*\{\s*([a-zA-Z])\s*=\s*([^{}]+?)\s*\}\s*\^\s*(?:\{\s*([^{}]+?)\s*\}|\(\s*([^()]+?)\s*\)|((?:inf|minf|[A-Za-z]|[+\-]?\d+(?:\.\d+)?)))\s*(.+)$/',
            static function($m) {
                $name = $m[1] === 'sum' ? 'sum' : 'product';
                $upper = $m[4] !== '' ? $m[4] : ($m[5] !== '' ? $m[5] : $m[6]);
                [$body, $rest] = brackets::split_operator_body(trim($m[7]));
                return $name . '(' . $body . ',' . trim($m[2]) . ',' . trim($m[3]) . ',' . trim($upper) . ')' . $rest;
            },
            $input
        );
    }
}
