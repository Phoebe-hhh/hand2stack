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

        $operator = '/\\\\frac\s*\{\s*(?:d|\\\\partial)\s*(?=[\^}])/';
        $output = self::each_from_last($output, $operator,
            '/\\\\frac\s*\{\s*(d|\\\\partial)\s*\^\s*(?:\((\d+)\)|(\d+))\s*\}\s*\{\s*\1\s*([a-zA-Z])\s*\^\s*(?:\((\d+)\)|(\d+))\s*\}\s*(.+)$/',
            static function($m) {
                $num = $m[2] ?: $m[3];
                $den = $m[5] ?: $m[6];
                [$body, $rest] = brackets::split_operator_body(trim($m[7]));
                return $num === $den ? 'diff(' . $body . ',' . trim($m[4]) . ',' . $num . ')' . $rest : $m[0];
            }
        );

        return self::each_from_last($output, $operator,
            '/\\\\frac\s*\{\s*(d|\\\\partial)\s*\}\s*\{\s*\1\s*([a-zA-Z])\s*\}\s*(.+)$/',
            static function($m) {
                [$body, $rest] = brackets::split_operator_body(trim($m[3]));
                return 'diff(' . $body . ',' . trim($m[2]) . ')' . $rest;
            }
        );
    }

    /**
     * Whether a limit, sum, product or d/dx operator leaves its extent to a
     * guess: "\\lim_{x\\to 0} x^2+2x" may mean limit(x^2)+2x or
     * limit(x^2+2x). A body in one pair of brackets, or one that a relation,
     * comma or closing bracket ends, is clear; a product stays in the body as
     * usual ("\\sum a_k b_k"). Run after integrals, whose int(..) bounds a body.
     */
    public static function has_ambiguous_body(string $input): bool {
        $order = '\s*(?:\^\s*(?:\(\s*\d+\s*\)|\d+))?\s*';
        $operator = '/\\\\lim\s*_\s*\{[^{}]*\}'
            . '|\\\\(?:sum|prod)\s*_\s*\{\s*[a-zA-Z]\s*=[^{}]*\}\s*\^\s*'
            . '(?:\{[^{}]*\}|\([^()]*\)|inf|minf|[A-Za-z]|[+\-]?\d+(?:\.\d+)?)'
            . '|\\\\frac\s*\{\s*(?:d|\\\\partial)' . $order . '\}\s*\{\s*(?:d|\\\\partial)\s*[a-zA-Z]' . $order . '\}/';
        if (!preg_match_all($operator, $input, $matches, PREG_OFFSET_CAPTURE)) {
            return false;
        }
        foreach ($matches[0] as [$header, $offset]) {
            [$body, $rest] = brackets::split_operator_body(trim(substr($input, $offset + strlen($header))));
            if (preg_match('/^\s*[+\-]/', $rest) && !brackets::is_one_group($body)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Convert each operator whose body runs to the end of the input, from the
     * last one back, so "\\lim_{x\\to 0} x+\\lim_{x\\to 1} x^2" converts both:
     * the earlier body then meets the later operator already converted.
     */
    private static function each_from_last(string $input, string $operator, string $pattern, callable $convert): string {
        if (!preg_match_all($operator, $input, $matches, PREG_OFFSET_CAPTURE)) {
            return $input;
        }
        foreach (array_reverse($matches[0]) as [, $offset]) {
            $input = substr($input, 0, $offset) . preg_replace_callback($pattern, $convert, substr($input, $offset), 1);
        }
        return $input;
    }

    /** f'(x) and f''(x) as diff(...), unless the conversion keeps primes as written. */
    public static function prime_derivative(string $input): string {
        if (notation_keeper::keeps_as_written()) {
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
        // \\int \\frac{dx}{1+x^2} is \\int \\frac{1}{1+x^2} dx written with its
        // differential on the fraction line.
        $input = preg_replace(
            '/(\\\\int(?![A-Za-z])(?:\s*_\s*(?:\{[^{}]*\}|\\\\[A-Za-z]+|[^\s\\\\{]))?'
                . '(?:\s*\^\s*(?:\{[^{}]*\}|\([^()]*\)|\\\\[A-Za-z]+|[^\s\\\\{(]))?)'
                . '\s*\\\\frac\s*\{\s*d\s*([a-zA-Z])\s*\}\s*(\{(?:[^{}]|(?3))*\})/',
            '$1 \\\\frac{1}$3 d $2',
            $input
        );
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
            $scope = self::through_differential(rtrim(substr($input, $start, $end - $start)));
            $input = substr($input, 0, $start) . self::integral($scope) . substr($input, $start + strlen($scope));
            $offset = $start + 1;
        }
        return $input;
    }

    /**
     * Cut a scope after the integral's own differential when a sum,
     * difference, product or quotient follows it, so "\\int x^2 dx - \\int x dx
     * + 2/3" gives three terms instead of one integral that never ends in its
     * differential.
     */
    private static function through_differential(string $scope): string {
        $length = strlen($scope);
        $depth = 0;
        for ($i = strlen('\\int'); $i < $length; $i++) {
            $char = $scope[$i];
            if ($char === '\\') {
                // A command name such as \cdot is not a differential.
                while ($i + 1 < $length && ctype_alpha($scope[$i + 1])) {
                    $i++;
                }
            } else if (strpos('({[', $char) !== false) {
                $depth++;
            } else if (strpos(')}]', $char) !== false) {
                $depth--;
            } else if ($depth === 0 && $char === 'd'
                    && preg_match('/\Gd\s*[a-zA-Z](?![A-Za-z])\s*(?=[+\-*\/]|\\\\(?:cdot|times)(?![A-Za-z]))/', $scope, $m, 0, $i)) {
                return rtrim(substr($scope, 0, $i + strlen($m[0])));
            }
        }
        return $scope;
    }

    /**
     * An unbraced upper limit is one token, as in LaTeX: \\int_0^1x dx runs
     * from 0 to 1, with x as the integrand.
     */
    private static function integral(string $input): string {
        $output = preg_replace_callback(
            '/\\\\int\s*_\s*\{\s*([^{}]+?)\s*\}\s*\^\s*(?:\{\s*([^{}]+?)\s*\}|\(\s*([^()]+?)\s*\)|((?:\\\\[A-Za-z]+|[+\-]?(?:[0-9.]+|%[A-Za-z]+|inf(?![A-Za-z])|[A-Za-z]))))\s*(.*?)\s*(?:\\\\[,;:!]\s*)*d\s*([a-zA-Z])\s*$/',
            static function($m) {
                $upper = $m[2] !== '' ? $m[2] : ($m[3] !== '' ? $m[3] : $m[4]);
                return 'int(' . self::integrand($m[5]) . ',' . trim($m[6]) . ',' . trim($m[1]) . ',' . trim($upper) . ')';
            },
            $input
        );

        $output = preg_replace_callback(
            '/\\\\int\s*_\s*((?:\\\\[A-Za-z]+|[A-Za-z0-9%.+\-]+))\s*\^\s*(?:\{\s*([^{}]+?)\s*\}|\(\s*([^()]+?)\s*\)|((?:\\\\[A-Za-z]+|[+\-]?(?:[0-9.]+|%[A-Za-z]+|inf(?![A-Za-z])|[A-Za-z]))))\s*(.*?)\s*(?:\\\\[,;:!]\s*)*d\s*([a-zA-Z])\s*$/',
            static function($m) {
                $upper = $m[2] !== '' ? $m[2] : ($m[3] !== '' ? $m[3] : $m[4]);
                return 'int(' . self::integrand($m[5]) . ',' . trim($m[6]) . ',' . trim($m[1]) . ',' . trim($upper) . ')';
            },
            $output
        );

        return preg_replace_callback(
            '/\\\\int\s*(.*?)\s*(?:\\\\[,;:!]\s*)*d\s*([a-zA-Z])\s*$/',
            static function($m) {
                return 'int(' . self::integrand($m[1]) . ',' . trim($m[2]) . ')';
            },
            $output
        );
    }

    /** The integrand as written, or 1 when only the differential is left: \\int_0^1 dx. */
    private static function integrand(string $integrand): string {
        $integrand = ltrim(trim($integrand), '*' . patterns::IMPLICIT_PRODUCT);
        return $integrand === '' ? '1' : $integrand;
    }

    /** \\lim_{x\\to a} f(x) as limit(f(x),x,a). */
    public static function limit(string $input): string {
        return self::each_from_last($input, '/\\\\lim\s*_/',
            '/\\\\lim\s*_\s*\{\s*([a-zA-Z])\s*(?:\\\\to|\\\\rightarrow|\\\\longrightarrow|->|→)\s*([^{}]+?)\s*\}\s*(.+)$/u',
            static function($m) {
                [$body, $rest] = brackets::split_operator_body(trim($m[3]));
                return 'limit(' . $body . ',' . trim($m[1]) . ',' . trim($m[2]) . ')' . $rest;
            }
        );
    }

    /** \\sum and \\prod with bounds as sum(...) and product(...). */
    public static function sum_product(string $input): string {
        return self::each_from_last($input, '/\\\\(?:sum|prod)\s*_/',
            '/\\\\(sum|prod)\s*_\s*\{\s*([a-zA-Z])\s*=\s*([^{}]+?)\s*\}\s*\^\s*(?:\{\s*([^{}]+?)\s*\}|\(\s*([^()]+?)\s*\)|((?:inf|minf|[A-Za-z]|[+\-]?\d+(?:\.\d+)?)))\s*(.+)$/',
            static function($m) {
                $name = $m[1] === 'sum' ? 'sum' : 'product';
                $upper = $m[4] !== '' ? $m[4] : ($m[5] !== '' ? $m[5] : $m[6]);
                [$body, $rest] = brackets::split_operator_body(trim($m[7]));
                return $name . '(' . $body . ',' . trim($m[2]) . ',' . trim($m[3]) . ',' . trim($upper) . ')' . $rest;
            }
        );
    }
}
