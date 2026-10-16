<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * LaTeX to STACK conversion: the entry points and the order of the steps.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\converter;

use local_hand2stack\converter\rules\algebra;
use local_hand2stack\converter\rules\calculus;
use local_hand2stack\converter\rules\matrix;
use local_hand2stack\converter\rules\named_notation;
use local_hand2stack\converter\rules\piecewise;
use local_hand2stack\converter\rules\tidy;
use local_hand2stack\converter\rules\trig_log;

defined('MOODLE_INTERNAL') || die();

final class stack_converter {
    /**
     * Normalize user-edited ASCII/STACK-like input on the server.
     *
     * @param string $input Edited input.
     * @return string STACK-compatible expression.
     */
    public static function normalize_ascii(string $input): string {
        // A Japanese keyboard often yields full-width "ｘ＝３"; NFKC folds it to
        // ASCII. Superscript digits first, or NFKC turns x² into x2.
        $input = preg_replace_callback('/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/u', static function(array $m): string {
            return '^' . strtr($m[0], ['⁰' => '0', '¹' => '1', '²' => '2', '³' => '3', '⁴' => '4',
                '⁵' => '5', '⁶' => '6', '⁷' => '7', '⁸' => '8', '⁹' => '9']);
        }, trim($input));
        if (class_exists('Normalizer')) {
            $input = \Normalizer::normalize($input, \Normalizer::FORM_KC);
        }
        $input = str_replace(['−', '–', '—', '＝'], ['-', '-', '-', '='], $input);
        // A typed {1,2,3} is a set; braces after ^ or _ group, as in LaTeX.
        $stack = [];
        $typed = '';
        for ($i = 0, $length = strlen($input); $i < $length; $i++) {
            $char = $input[$i];
            if ($char === '{') {
                $set = $i === 0 || !in_array(substr(rtrim(substr($input, 0, $i)), -1), ['^', '_'], true);
                $stack[] = $set;
                $typed .= $set ? '\\{' : '{';
            } else if ($char === '}' && $stack) {
                $typed .= array_pop($stack) ? '\\}' : '}';
            } else {
                $typed .= $char;
            }
        }
        return self::normalize($typed);
    }

    /** Convert the mathematics a learner selected, which may include prose. */
    public static function normalize_selection(string $input): string {
        $statements = array_filter(statement_splitter::split_statements(trim($input)), static function(array $segment): bool {
            return $segment[0] === 'math';
        });
        if (count($statements) > 1) {
            // Prose between statements is not part of either, so convert each one alone.
            return implode(',', array_filter(array_map(static function(array $segment): string {
                return self::normalize_selection($segment[1]);
            }, $statements), 'strlen'));
        }

        $candidate = math_extractor::extract($input);
        if ($candidate === '') {
            return '';
        }

        return self::normalize($candidate);
    }

    /** Convert one LaTeX formula to a STACK expression. */
    public static function normalize(string $input): string {
        $s = statement_splitter::brace_script_labels(trim($input));

        if ($s === '') {
            return '';
        }

        $statements = array_filter(statement_splitter::split_statements($s), static function(array $segment): bool {
            return $segment[0] === 'math';
        });
        if (count($statements) > 1) {
            // Separate statements are not one expression: list them visibly.
            return implode(',', array_map(static function(array $segment): string {
                return self::normalize($segment[1]);
            }, $statements));
        }

        $scientific = [];
        $units = [];
        $kept = [];
        $s = self::protect($s, $scientific, $units, $kept);
        $s = named_notation::normalize($s);
        $s = self::strip_layout($s);

        // Approximation is not equality. With no semantics-preserving STACK
        // spelling available here, keep exactly what OCR returned.
        $approx = '(?:\\\\(?:approx|simeq|thickapprox|sim)(?![A-Za-z])|(?<![A-Za-z\\\\])approx(?![A-Za-z])|≈|~~)';
        if (preg_match('/' . $approx . '/u', $s)) {
            return trim($input);
        }

        $piecewise = piecewise::normalize($s);
        if ($piecewise !== '') {
            return $piecewise;
        }

        $matrix = matrix::normalize($s);
        if ($matrix !== '') {
            return $matrix;
        }

        $s = self::operators_and_relations($s);
        $s = self::calculus_and_functions($s);
        $indexi = false;
        $s = self::identifiers($s, $indexi);
        $s = self::constants_and_products($s, $indexi);
        $s = self::restore($s, $kept, $scientific, $units);

        return trim($s);
    }

    /**
     * Replace what later steps must not touch with placeholders: numbers in
     * scientific notation, units after a number, and unconvertible notation.
     */
    private static function protect(string $s, array &$scientific, array &$units, array &$kept): string {
        // 2.5e-3 is one number; without this, e becomes %e and the value changes.
        $s = preg_replace_callback(patterns::SCIENTIFIC, static function(array $m) use (&$scientific): string {
            $token = '§S' . count($scientific) . '§';
            $scientific[$token] = $m[0];
            return $token;
        }, $s);
        // A unit after a number stays one name (cm, not c*m) and joins its number with "*".
        $s = preg_replace_callback(patterns::UNIT, static function(array $m) use (&$units): string {
            $token = '§U' . count($units) . '§';
            $units[$token] = notation_keeper::unit_ascii($m[1]);
            return $token;
        }, $s);
        return notation_keeper::keep_unconvertible($s, $kept);
    }

    /** Remove layout: spacing, display style, leading arrows and list numbering. */
    private static function strip_layout(string $s): string {
        // Layout/proof commands are not part of a STACK expression.
        $s = str_replace(['\\quad', '\\qquad', '\\therefore', '\\because'], '', $s);
        $s = preg_replace('/\\\\pm(?![A-Za-z])/', '±', $s);
        // One degree mark, so later passes need to recognise only "°".
        $s = preg_replace('/\^\s*\{\s*\\\\circ\s*\}|\^\s*\\\\circ(?![A-Za-z])|\\\\degree(?![A-Za-z])/', '°', $s);
        // Display-size variants mean the same fraction; \displaystyle is layout.
        $s = preg_replace('/\\\\[dtc]frac(?![A-Za-z])/', '\\\\frac', $s);
        $s = preg_replace('/\\\\(?:displaystyle|textstyle)(?![A-Za-z])/', '', $s);
        // A leading implication arrow or ∴ introduces the line; it is not a factor.
        $s = preg_replace(
            '/^\s*(?:\\\\(?:Rightarrow|Longrightarrow|implies|Leftrightarrow|Longleftrightarrow|iff)(?![A-Za-z])|[⇒⇔⟹⟺∴∵])\s*/u',
            '',
            $s
        );
        $s = named_notation::combinations($s);
        // A percentage is not the same value as its bare number. Keep the OCR
        // notation so unsupported percentage syntax is rejected visibly.

        // List numbering such as "1. f(2)=..." is layout, not a product "1.f(2)".
        return preg_replace('/^\s*(?:\d+[.)]|\(\d+\))\s+(?=[A-Za-z\\\\(])/', '', $s);
    }

    /** Products, operators, relations, sets, intervals and infinity. */
    private static function operators_and_relations(string $s): string {
        $s = preg_replace('/\\\\left(?![a-zA-Z])/', '', $s);
        $s = preg_replace('/\\\\right(?![a-zA-Z])/', '', $s);
        $s = algebra::absolute($s);
        $s = algebra::star_before_commands($s, 'sqrt|sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|arcsin|arccos|arctan|log|ln');

        $commands = ['frac', 'sqrt', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh',
            'cosh', 'tanh', 'arcsin', 'arccos', 'arctan', 'log', 'ln', 'lim', 'partial',
            'int', 'sum', 'prod', 'vec', 'hat', 'widehat', 'bar', 'overline', 'dot', 'ddot'];
        foreach ($commands as $command) {
            $s = preg_replace('/\\\\\s*' . preg_quote($command, '/') . '/', '\\' . $command, $s);
        }

        $greekcommands = '(?:alpha|beta|gamma|delta|epsilon|theta|lambda|mu|sigma|rho|tau|phi|psi|omega)';
        $s = algebra::star_before_commands($s, substr($greekcommands, 3, -1));

        $s = preg_replace('/\\\\vec\s*\{\s*([a-zA-Z])\s*\}\s*\\\\cdot\s*\\\\vec\s*\{\s*([a-zA-Z])\s*\}/', '$1.$2', $s);
        $s = preg_replace('/\\\\vec\s*\{\s*([a-zA-Z])\s*\}/', '$1', $s);

        // Whole commands only: \cdots is an ellipsis, not \cdot followed by "s".
        $s = preg_replace('/\\\\(?:cdot|times)(?![A-Za-z])/', '*', $s);
        $s = preg_replace('/\\\\div(?![A-Za-z])/', '/', $s);
        $s = str_replace(['×', '÷'], ['*', '/'], $s);
        // \geqq/\leqq (≧/≦) is the usual Japanese notation; replace it before \geq.
        $s = str_replace(['\\geqq', '\\geqslant', '\\geq', '≥', '≧', '⩾'], '>=', $s);
        $s = str_replace(['\\leqq', '\\leqslant', '\\leq', '≤', '≦', '⩽'], '<=', $s);
        $s = preg_replace('/\\\\ge(?![a-zA-Z])/', '>=', $s);
        $s = preg_replace('/\\\\le(?![a-zA-Z])/', '<=', $s);
        $s = preg_replace('/\\\\gt(?![a-zA-Z])/', '>', $s);
        $s = preg_replace('/\\\\lt(?![a-zA-Z])/', '<', $s);
        $s = preg_replace('/\\\\neq?(?![a-zA-Z])|≠/u', '#', $s);

        // STACK's own +- operator keeps both values and the variable:
        // "x=\pm 2" is x=+-2, never the bare list [2,-2].
        $s = preg_replace('/\s*(?:\\\\pm(?![A-Za-z])|±)\s*/u', '+-', $s);

        $s = preg_replace('/([a-zA-Z])\s*\\\\in\s*\\\\mathbb\s*\{\s*([A-Z])\s*\}/', '__ALL__$1__IN__$2__', $s);
        $s = preg_replace_callback(
            '/([a-zA-Z])\s*(?:\\\\in(?![A-Za-z])|∈)\s*([\[(])\s*([^,\[\]()]+)\s*,\s*([^,\[\]()]+)\s*([\])])/u',
            static function(array $m): string {
                return '__INTERVAL' . ($m[2] === '[' ? 'C' : 'O') . ($m[5] === ']' ? 'C' : 'O')
                    . '__' . $m[1] . '__' . $m[3] . '__' . $m[4] . '__';
            },
            $s
        );
        $s = preg_replace('/([a-zA-Z])\s*∈\s*([A-Z])/u', '__ALL__$1__IN__$2__', $s);
        $s = preg_replace('/\\\\mathbb\s*\{\s*([A-Z])\s*\}/', '$1', $s);

        // -∞ is minf only as a value; in x-\infty the minus subtracts. Spaces
        // keep inf a word of its own, so x\infty is x*inf, not x*i*n*f.
        $s = preg_replace_callback('/-\s*(?:\\\\infty(?![A-Za-z])|∞)/u', static function(array $m) use ($s): string {
            $before = rtrim(substr($s, 0, $m[0][1]));
            $binary = preg_match('/\\\\([A-Za-z]+)$/', $before, $command)
                ? preg_match('/^(?:' . patterns::GREEK_LETTERS . '|infty)$/', $command[1])
                : preg_match('/[A-Za-z0-9)\]}§]$/u', $before);
            return $binary ? '- inf ' : ' minf ';
        }, $s, -1, $count, PREG_OFFSET_CAPTURE);
        return preg_replace('/\\\\infty(?![A-Za-z])|∞/u', ' inf ', $s);
    }

    /** Primes, powers, functions and their arguments, calculus and determinants. */
    private static function calculus_and_functions(string $s): string {
        $s = preg_replace('/\^\s*\{\s*\\\\prime\s*\\\\prime\s*\}|\^\s*\\\\prime\s*\\\\prime(?![A-Za-z])/', "''", $s);
        $s = preg_replace('/\^\s*\{\s*\\\\prime\s*\}|\^\s*\\\\prime(?![A-Za-z])/', "'", $s);
        $s = calculus::prime_derivative($s);
        // A bare prime does not state its independent variable. Keep it as OCR
        // wrote it; only f'(x) supplies enough information to convert safely.
        $s = str_replace(['\\,', '\\!', '\\;', '\\:', '\\ '], '', $s);
        $s = preg_replace('/\^\{([^{}]+)\}/', '^($1)', $s);

        $s = preg_replace('/\\\\binom\s*\{([^{}]+)\}\s*\{([^{}]+)\}/', 'binomial($1,$2)', $s);

        $s = trig_log::inverse_trig($s);
        $s = preg_replace('/(?<!%)e\^\(([^()]+)\)/', '%e^($1)', $s);
        $s = preg_replace('/(?<!%)e\^([a-zA-Z0-9]+)/', '%e^$1', $s);

        $s = trig_log::base_logarithms($s);

        // Capture the differential before function normalization can consume
        // a compact tail such as "\\sin x\\,dx" as one function argument.
        $s = calculus::integrals($s);

        $s = trig_log::function_arguments($s);
        $s = str_replace(patterns::IMPLICIT_PRODUCT, '*', $s);
        // A standalone degree mark carries meaning and must not be discarded.

        $s = calculus::derivative($s);
        $s = calculus::sum_product($s);
        $s = algebra::fractions_roots($s);
        $s = calculus::limit($s);
        $s = preg_replace('/\\\\(?:rightarrow|longrightarrow|to)(?![a-zA-Z])/', '->', $s);

        $s = preg_replace('/\\\\operatorname\s*\{\s*det\s*\}\s*\(([^()]*)\)/', 'determinant($1)', $s);
        $s = preg_replace('/\\\\det\s*\(([^()]*)\)/', 'determinant($1)', $s);
        $s = preg_replace('/\\\\operatorname\s*\{\s*det\s*\}\s*([a-zA-Z])\b/', 'determinant($1)', $s);
        return preg_replace('/\\\\det\s*([a-zA-Z])\b/', 'determinant($1)', $s);
    }

    /**
     * Subscripts, words and remaining commands become STACK names, and spaces
     * between letters become products. $indexi tells whether a subscript i
     * makes i an index rather than the imaginary unit.
     */
    private static function identifiers(string $s, bool &$indexi): string {
        $textlabels = [];
        $s = preg_replace_callback(
            '/([a-zA-Z])_\{\s*\\\\(?:text|mathrm)\s*\{\s*([^{}]+?)\s*\}\s*\}/',
            static function($match) use (&$textlabels) {
                $token = '§' . count($textlabels) . '§';
                $textlabels[$token] = trim($match[2]);
                return $match[1] . '[' . $token . ']';
            },
            $s
        );
        // A subscript i (a_{i}) is an index, so i is a variable in this
        // expression rather than the imaginary unit.
        $indexi = preg_match('/[a-zA-Z]_(?:\{[^{}]*(?<![A-Za-z\\\\])i(?![A-Za-z])[^{}]*\}|i(?![A-Za-z]))/', $s) === 1;
        $s = preg_replace('/([a-zA-Z])_\{\s*([^{}]+?)\s*\}/', '$1[$2]', $s);
        $s = preg_replace('/_\{([^{}]+)\}/', '_$1', $s);

        $s = preg_replace('/\\\\text\s*\{\s*([^{}]+?)\s*\}/', '$1', $s);
        $s = preg_replace('/\\\\mathrm\s*\{\s*([^{}]+?)\s*\}/', '$1', $s);
        $s = preg_replace('/\\\\operatorname\s*\{\s*([^{}]+?)\s*\}/', '$1', $s);
        // \{1,2,3\} is a set; other braces are LaTeX grouping.
        $s = str_replace(['\\{', '\\}', '{', '}'], ["\x01", "\x02", '(', ')'], $s);
        // Spaces keep the name a word of its own: r\pi is r*%pi, not r*p*%i.
        $s = preg_replace('/\\\\(' . patterns::STRIPPABLE_COMMANDS . ')(?![A-Za-z])/', ' $1 ', $s);
        $s = preg_replace('/(?<![A-Za-z\\\\])var(epsilon|theta|rho|sigma|phi)(?![A-Za-z])/', '$1', $s);

        // Preserve logical words before whitespace-based implicit
        // multiplication turns "x and x" into "x*and*x".
        $s = preg_replace('/\band\b/i', '__LOGICAL_AND__', $s);
        $s = preg_replace('/\bor\b/i', '__LOGICAL_OR__', $s);
        $s = preg_replace('/\bin\b/i', '__RELATIONAL_IN__', $s);
        // Lookahead, so "a b c" is a*b*c: each letter both ends one gap and starts the next.
        $s = preg_replace('/([a-zA-Z])\s+(?=[a-zA-Z])/', '$1*', $s);
        $s = preg_replace('/(\d)\s+(?=[a-zA-Z])/', '$1*', $s);
        $s = preg_replace('/\s+/', '', $s);

        // Restore set/interval placeholders before splitting unknown letter
        // sequences into implicit products. Otherwise words such as INTERVAL
        // are transformed into I*N*T*E*R*V*A*L and can no longer be restored.
        $s = preg_replace('/__ALL__([a-zA-Z])__IN__([A-Z])__/', '$1 in $2', $s);
        $s = preg_replace_callback('/__INTERVAL([OC])([OC])__([a-zA-Z])__([^_]+)__([^_]+)__/', static function(array $m): string {
            return $m[4] . ($m[1] === 'C' ? '<=' : '<') . $m[3] . ' and ' . $m[3] . ($m[2] === 'C' ? '<=' : '<') . $m[5];
        }, $s);
        $s = str_replace(
            ['__LOGICAL_AND__', '__LOGICAL_OR__', '__RELATIONAL_IN__'],
            [' and ', ' or ', ' in '],
            $s
        );
        $s = algebra::variable_products($s);
        if ($textlabels) {
            $s = strtr($s, $textlabels);
        }
        return $s;
    }

    /** The constants %pi, %e and %i, implicit products, and final tidying. */
    private static function constants_and_products(string $s, bool $indexi): string {
        $s = preg_replace('/\\\\pi\b/', '%pi', $s);
        $s = str_replace('π', '%pi', $s);
        $s = preg_replace('/(^|[^%A-Za-z0-9_])pi(?![A-Za-z0-9_])/', '$1%pi', $s);
        $s = preg_replace('/(\d)pi(?![A-Za-z0-9_])/', '$1*%pi', $s);
        $s = preg_replace('/(^|[^%A-Za-z0-9_])e(?![A-Za-z0-9_])/', '$1%e', $s);
        if (!$indexi) {
            $s = preg_replace('/(^|[^%A-Za-z0-9_])i(?![A-Za-z0-9_])/', '$1%i', $s);
        }
        $s = preg_replace('/([A-Za-z0-9)\]])(%e|%pi|%i)(?![A-Za-z])/', '$1*$2', $s);

        $s = str_replace(')(', ')*(', $s);
        $s = preg_replace('/(\d)([a-zA-Z])/', '$1*$2', $s);
        $s = preg_replace('/(?<!atan|log1)(\d)\(/', '$1*(', $s);
        $s = preg_replace('/\)([a-zA-Z])/', ')*$1', $s);
        $s = preg_replace('/\]([a-zA-Z(])/', ']*$1', $s);
        $s = preg_replace('/(^|[^%A-Za-z0-9_])e(?![A-Za-z0-9_])/', '$1%e', $s);
        if (!$indexi) {
            $s = preg_replace('/(^|[^%A-Za-z0-9_])i(?![A-Za-z0-9_])/', '$1%i', $s);
        }
        $s = algebra::absolute($s);
        $s = preg_replace('/\b([a-df-zA-DF-Z])x(?=(\^|\+|\-|\*|\/|\)|$))/', '$1*x', $s);
        $s = preg_replace('/^(.+?)\s+in\s+(\[[^\]]+\])$/', 'elementp($1,$2)', $s);
        $s = str_replace(["\x01", "\x02"], ['{', '}'], $s);
        // log(x,2) is not Maxima; it means the base-2 logarithm.
        $s = preg_replace('/\blog\(([^(),]+),([^(),]+)\)/', '(log($1)/log($2))', $s);
        $s = tidy::protect_functions($s);
        return tidy::beautify($s);
    }

    /** Put back what protect() replaced with placeholders. */
    private static function restore(string $s, array $kept, array $scientific, array $units): string {
        // Kept text first: it may hold a number or unit placeholder of its own.
        if ($kept) {
            $s = strtr($s, $kept);
        }
        if ($scientific) {
            // A placeholder is not a letter, so implicit multiplication never
            // saw "2.5e-3 x"; the number and its neighbour are two factors.
            $s = preg_replace('/(§S\d+§)(?=[A-Za-z(%])/u', '$1*', $s);
            $s = preg_replace('/(?<=[A-Za-z0-9)])(§S\d+§)/u', '*$1', $s);
            $s = strtr($s, $scientific);
        }
        if ($units) {
            $s = preg_replace('/(?<=[0-9])(§U\d+§)/u', '*$1', $s);
            $s = strtr($s, $units);
        }
        return $s;
    }
}
