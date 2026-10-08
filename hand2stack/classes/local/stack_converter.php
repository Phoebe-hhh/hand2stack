<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * classes local stack converter.php for Hand2STACK.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\local;

defined('MOODLE_INTERNAL') || die();

final class stack_converter {
    /**
     * Words that \\operatorname{...} may name as a function. Mathpix also
     * wraps handwritten prose such as "cuz" in \\operatorname; any other
     * word is prose, never a product of single-letter variables.
     */
    private const OPERATOR_FUNCTIONS = [
        'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan',
        'arcsinh', 'arccosh', 'arctanh', 'asin', 'acos', 'atan', 'log', 'ln', 'lg', 'exp', 'det', 'sgn',
        'sign', 'signum', 'arg', 'max', 'min', 'gcd', 'lcm', 'deg', 'dim', 'ker', 'rank', 'tr', 'trace',
        'Re', 'Im', 'lim', 'mod', 'abs', 'floor', 'ceil', 'erf', 'grad', 'div', 'curl',
    ];

    /** Logical connectives a handwritten line may join two relations with. */
    private const CONNECTIVES = ['or' => 'or', 'and' => 'and', 'または' => 'or', 'かつ' => 'and'];

    /** A relation symbol: a statement such as "x>2" has one, a term such as "0 x" has none. */
    private const RELATION = '/=|<|>|\\\\(?:leqq?|geqq?|leqslant|geqslant|le|ge|neq|ne|lt|gt)(?![A-Za-z])|[≤≥≦≧≠]/u';

    /**
     * Split one formula row into statements and the prose between them.
     * "x>0 \\text{and} x-2>0, \\text{so} x>2" is two statements joined by
     * "so"; "x-2>0 \\quad x>2" is two statements side by side. Without the
     * split, the gap becomes a product and a false chain: x-2>0*x and 0*x>2.
     * A connective (or/and) stays inside its statement, and a gap splits only
     * when every side is a complete relation.
     *
     * @return array<int,array{0:string,1:string}> ['math'|'prose', text] segments.
     */
    public static function split_statements(string $latex): array {
        $connectives = '/^(?:' . implode('|', array_map('preg_quote', array_keys(self::CONNECTIVES))) . ')$/u';
        $chunks = [];
        $start = 0;
        $depth = 0;
        $length = strlen($latex);
        for ($i = 0; $i < $length; $i++) {
            $char = $latex[$i];
            if ($char === '{') {
                $depth++;
            } else if ($char === '}') {
                $depth--;
            } else if ($char === '\\' && $depth === 0
                    && preg_match('/\G\\\\(?:text|mathrm)\s*\{\s*([^{}]*?)\s*\}/u', $latex, $match, 0, $i)
                    && preg_match('/\pL.*\pL/u', $match[1]) && !preg_match($connectives, $match[1])) {
                $chunks[] = ['math', substr($latex, $start, $i - $start)];
                $chunks[] = ['prose', $match[1]];
                $i += strlen($match[0]) - 1;
                $start = $i + 1;
            }
        }
        $chunks[] = ['math', substr($latex, $start)];

        $segments = [];
        foreach ($chunks as [$type, $text]) {
            if ($type === 'prose') {
                $segments[] = ['prose', $text];
                continue;
            }
            $parts = preg_split('/(?:\s*\\\\q?quad(?![A-Za-z])\s*)+/', $text);
            $complete = count($parts) > 1 && !array_filter($parts, static function(string $part): bool {
                return trim($part, " \t,.;") !== '' && !preg_match(self::RELATION, $part);
            });
            foreach ($complete ? $parts : [$text] as $part) {
                // Punctuation between statements belongs to the prose.
                preg_match('/^([\s,.;:]*)(.*?)([\s,.;:]*)$/su', $part, $edge);
                if (trim($edge[1]) !== '') {
                    $segments[] = ['prose', trim($edge[1])];
                }
                if ($edge[2] !== '') {
                    $segments[] = ['math', $edge[2]];
                }
                if (trim($edge[3]) !== '') {
                    $segments[] = ['prose', trim($edge[3])];
                }
            }
        }
        $maths = array_filter($segments, static function(array $segment): bool {
            return $segment[0] === 'math';
        });
        return count($maths) > 1 ? $segments : [['math', $latex]];
    }

    /** Turn \\operatorname{word} into \\text{word} unless word is a known function. */
    private static function prose_operatornames(string $input): string {
        return preg_replace_callback('/\\\\operatorname\s*\{\s*([A-Za-z]{2,})\s*\}/u', static function(array $match): string {
            return in_array($match[1], self::OPERATOR_FUNCTIONS, true) ? $match[0] : '\\text{' . $match[1] . '}';
        }, $input);
    }

    /**
     * Split prose that opens a formula, e.g. Mathpix's "\\operatorname{cuz} \\quad x=-1",
     * into the prose ("cuz") and the remaining mathematics ("x=-1").
     *
     * @return array{0:string,1:string}
     */
    public static function split_leading_prose(string $latex): array {
        $latex = self::prose_operatornames($latex);
        $prose = [];
        $pattern = '/^\s*\\\\(?:text|mathrm)\s*\{\s*([^{}]*?)\s*\}(?:\s|\\\\q?quad|\\\\[,;: ])*/u';
        while (preg_match($pattern, $latex, $match)) {
            // A lone "e" or "i" is a constant, not a word.
            if (preg_match('/^[ei]$/', $match[1])) {
                break;
            }
            $prose[] = $match[1];
            $latex = substr($latex, strlen($match[0]));
        }
        return [trim(implode(' ', $prose)), trim($latex)];
    }

    /**
     * "x=2 \\text{or} x=3": relations joined by a written connective. Returns
     * "x=2 or x=3", or null when the line is not exactly that shape.
     */
    private static function join_connected_relations(string $input): ?string {
        $words = implode('|', array_map('preg_quote', array_keys(self::CONNECTIVES)));
        $separator = '/(?:\s|\\\\q?quad|\\\\[,;: ])*\\\\(?:text|mathrm)\s*\{\s*(' . $words . ')\s*\}(?:\s|\\\\q?quad|\\\\[,;: ])*/u';
        if (!preg_match_all($separator, $input, $matches)) {
            return null;
        }
        $parts = preg_split($separator, $input);
        $connectives = array_map(static function(string $word): string {
            return self::CONNECTIVES[$word];
        }, $matches[1]);
        foreach ($parts as $part) {
            if (trim($part) === '' || preg_match('/\\\\(?:text|mathrm)\s*\{|\$/u', $part)
                    || !preg_match('/(?:=|<|>|\\\\(?:leq?|geq?|neq?|ne)(?![A-Za-z]))/u', $part)) {
                return null;
            }
        }
        $joined = trim($parts[0]);
        foreach ($connectives as $index => $connective) {
            $joined .= ' ' . $connective . ' ' . trim($parts[$index + 1]);
        }
        return $joined;
    }

    /** Functions whose argument handwriting often leaves unbracketed, longest names first. */
    private const BARE_ARGUMENT_FUNCTIONS = 'arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|cot|sec|csc|exp|log|ln';

    /** An implicit product, kept distinct from "*" until function arguments are read. */
    private const IMPLICIT_PRODUCT = "\x03";

    /** Greek letters that may stand as a variable inside a function argument. */
    private const GREEK_LETTERS = 'alpha|beta|gamma|delta|epsilon|varepsilon|theta|vartheta|lambda|mu|sigma|rho|tau|phi|varphi|psi|omega|pi';

    /**
     * Offset of the bracket closing the one at $open, or null when unbalanced.
     */
    private static function closing_bracket(string $s, int $open): ?int {
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
        } else if (preg_match('/^(?:\d+(?:\.\d+)?|\\\\(?:' . self::GREEK_LETTERS . ')(?![A-Za-z])|%(?:pi|e|i)(?![A-Za-z])|[A-Za-z](?![A-Za-z]))/', $rest, $match)) {
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
    private static function read_function_argument(string $s, int $cursor): ?array {
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
            while (isset($s[$cursor]) && (ctype_space($s[$cursor]) || $s[$cursor] === self::IMPLICIT_PRODUCT)) {
                $cursor++;
            }
        }
        return $end === null ? null : [substr($s, $start, $end - $start), $end];
    }

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
    private static function normalize_base_logarithms(string $input): string {
        $offset = 0;
        // Learners editing the STACK text type the same notation without the
        // backslash, e.g. `log_2(x(x-2))`.
        $pattern = '/(?:\\\\|(?<![A-Za-z\\\\]))log\s*_\s*(?:\{([^{}]+)\}|([A-Za-z0-9]+))\s*/';

        while (preg_match($pattern, $input, $match, PREG_OFFSET_CAPTURE, $offset)) {
            $start = $match[0][1];
            $base = $match[1][1] !== -1 ? $match[1][0] : $match[2][0];
            $argument = self::read_function_argument($input, $start + strlen($match[0][0]));
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
    private static function normalize_function_arguments(string $input): string {
        $offset = 0;
        $pattern = '/(?:\\\\|(?<![A-Za-z\\\\%]))(' . self::BARE_ARGUMENT_FUNCTIONS . ')(?![A-Za-z])'
            . '\s*(?:\^\s*(?:\{\s*([^{}]+?)\s*\}|\(\s*([^()]+?)\s*\)|([+-]?\d+))\s*)?/';
        $inverse = ['arcsin' => 'asin', 'arccos' => 'acos', 'arctan' => 'atan'];

        while (preg_match($pattern, $input, $match, PREG_OFFSET_CAPTURE, $offset)) {
            $start = $match[0][1];
            $argument = self::read_function_argument($input, $start + strlen($match[0][0]));
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

    /**
     * "2\\sqrt{3}" and "\\alpha\\beta" are products, but "\\tan\\theta" and
     * "\\sin\\sqrt{x}" apply a function: no "*" after a function name.
     */
    private static function insert_star_before_commands(string $input, string $commands): string {
        return preg_replace_callback(
            '/(\\\\[A-Za-z]+|[A-Za-z0-9)\]])(\s*)(?=\\\\(?:' . $commands . ')(?![A-Za-z]))/',
            static function(array $m): string {
                // Only a Greek letter is a value; any other command (\\int,
                // \\sin, \\cdot, ...) is an operator, never a factor.
                if ($m[1][0] === '\\' && !preg_match('/^\\\\(?:' . self::GREEK_LETTERS . ')$/', $m[1])) {
                    return $m[1] . $m[2];
                }
                return $m[1] . self::IMPLICIT_PRODUCT;
            },
            $input
        );
    }

    /** Japanese combination/permutation notation: {}_{5}C_{2}, {}_{5}P_{2}. */
    private static function normalize_combinations(string $input): string {
        return preg_replace_callback(
            '/(?:\{\s*\}\s*|(?<![A-Za-z0-9)}\]]))_\s*\{?\s*([A-Za-z0-9]+)\s*\}?\s*(?:\\\\mathrm\s*\{\s*([CP])\s*\}|([CP]))\s*_\s*\{?\s*([A-Za-z0-9]+)\s*\}?/',
            static function(array $m): string {
                $kind = $m[2] !== '' ? $m[2] : $m[3];
                return $kind === 'C' ? 'binomial(' . $m[1] . ',' . $m[4] . ')'
                    : '(' . $m[1] . ')!/(' . $m[1] . '-' . $m[4] . ')!';
            },
            $input
        );
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

    public static function extract_math(string $input): string {
        return self::extract_math_candidate($input);
    }

    public static function normalize_selection(string $input): string {
        $candidate = self::extract_math_candidate($input);
        if ($candidate === '') {
            return '';
        }

        return self::normalize($candidate);
    }

    public static function normalize(string $input): string {
        $s = trim($input);

        if ($s === '') {
            return '';
        }

        $statements = array_filter(self::split_statements($s), static function(array $segment): bool {
            return $segment[0] === 'math';
        });
        if (count($statements) > 1) {
            // Separate statements are not one expression: list them visibly.
            return implode(',', array_map(static function(array $segment): string {
                return self::normalize($segment[1]);
            }, $statements));
        }

        // Layout/proof commands are not part of a STACK expression. When a
        // final expression is followed by a domain restriction, keep the
        // expression as the answer candidate; the restriction remains visible
        // in the raw OCR text.
        $s = preg_replace(
            '/\s*,\s*(?:\\\\q?quad\s*)*[a-zA-Z]\s*(?:\\\\neq|\\\\ne|#|!=)\s*[^,]+$/',
            '',
            $s
        );
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
        $s = self::normalize_combinations($s);
        // A percentage is written as its number; the unit stays outside the answer.
        $s = preg_replace('/\s*(?:\\\\%|％)/u', '', $s);

        // List numbering such as "1. f(2)=..." is layout, not a product "1.f(2)".
        $s = preg_replace('/^\s*(?:\d+[.)]|\(\d+\))\s+(?=[A-Za-z\\\\(])/', '', $s);

        // Maxima has no approximation operator. A trailing "≈ 3.83" after an
        // exact value restates it as a decimal, so keep the exact part; a
        // lone approximation ("x ≈ 3.83", "≈ 2.71") keeps the decimal.
        $approx = '(?:\\\\(?:approx|simeq|thickapprox|sim)(?![A-Za-z])|(?<![A-Za-z\\\\])approx(?![A-Za-z])|≈|~~)';
        $s = preg_replace('/^\s*' . $approx . '\s*/u', '', $s);
        if (preg_match('/' . $approx . '/u', $s, $match, PREG_OFFSET_CAPTURE)) {
            $head = substr($s, 0, $match[0][1]);
            $s = preg_match('/(?<![<>!#:])=/', $head)
                ? rtrim($head)
                : preg_replace('/' . $approx . '/u', '=', $s, 1);
        }

        $piecewise = self::normalize_piecewise($s);
        if ($piecewise !== '') {
            return $piecewise;
        }

        $matrix = self::normalize_matrix($s);
        if ($matrix !== '') {
            return $matrix;
        }

        $s = preg_replace('/\\\\left(?![a-zA-Z])/', '', $s);
        $s = preg_replace('/\\\\right(?![a-zA-Z])/', '', $s);
        $s = self::normalize_absolute($s);
        $s = self::insert_star_before_commands($s, 'sqrt|sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|arcsin|arccos|arctan|log|ln');

        $commands = ['frac', 'sqrt', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh',
            'cosh', 'tanh', 'arcsin', 'arccos', 'arctan', 'log', 'ln', 'lim', 'partial',
            'int', 'sum', 'prod', 'vec', 'hat', 'widehat', 'bar', 'overline', 'dot', 'ddot'];
        foreach ($commands as $command) {
            $s = preg_replace('/\\\\\s*' . preg_quote($command, '/') . '/', '\\' . $command, $s);
        }

        // Accents are presentation metadata in handwritten/OCR input. STACK
        // has no generally safe scalar representation for them, so retain the
        // underlying expression instead of emitting invalid hat*(...) tokens.
        $s = self::normalize_accents($s);

        $greekcommands = '(?:alpha|beta|gamma|delta|epsilon|theta|lambda|mu|sigma|rho|tau|phi|psi|omega)';
        $s = self::insert_star_before_commands($s, substr($greekcommands, 3, -1));

        $s = preg_replace('/\\\\vec\s*\{\s*([a-zA-Z])\s*\}\s*\\\\cdot\s*\\\\vec\s*\{\s*([a-zA-Z])\s*\}/', '$1.$2', $s);
        $s = preg_replace('/\\\\vec\s*\{\s*([a-zA-Z])\s*\}/', '$1', $s);

        $s = str_replace(['\\cdot', '\\times', '×', '\\div', '÷'], ['*', '*', '*', '/', '/'], $s);
        // \geqq/\leqq (≧/≦) is the usual Japanese notation; replace it before \geq.
        $s = str_replace(['\\geqq', '\\geqslant', '\\geq', '≥', '≧', '⩾'], '>=', $s);
        $s = str_replace(['\\leqq', '\\leqslant', '\\leq', '≤', '≦', '⩽'], '<=', $s);
        $s = preg_replace('/\\\\ge(?![a-zA-Z])/', '>=', $s);
        $s = preg_replace('/\\\\le(?![a-zA-Z])/', '<=', $s);
        $s = preg_replace('/\\\\gt(?![a-zA-Z])/', '>', $s);
        $s = preg_replace('/\\\\lt(?![a-zA-Z])/', '<', $s);
        $s = str_replace(['\\neq', '\\ne'], '#', $s);

        $s = preg_replace('/[a-zA-Z]\s*=\s*(?:\\\\pm|±)\s*([A-Za-z0-9%.\[\]\^()+\-*\/]+)\s*$/u', '[$1,-$1]', $s);
        // Elsewhere, e.g. "1 \pm \sqrt{2}" or the quadratic formula, STACK's
        // own +- operator keeps both values.
        $s = preg_replace('/\s*(?:\\\\pm(?![A-Za-z])|±)\s*/u', '+-', $s);
        // "x=2, 3" lists two solutions. "x=-1, x-3" is not one: the second
        // item still contains x, typically an OCR-damaged "x=3". Leave it
        // visibly invalid rather than inventing the list [-1,x-3].
        $s = preg_replace_callback('/^([a-zA-Z])\s*=\s*([^,=]+)\s*(?<!\\\\),\s*([^,=]+)$/', static function(array $m): string {
            $variable = '/(?<![A-Za-z\\\\])' . $m[1] . '(?![A-Za-z])/';
            foreach ([$m[2], $m[3]] as $item) {
                if (preg_match($variable, $item) || substr_count($item, '(') !== substr_count($item, ')')
                        || substr_count($item, '{') !== substr_count($item, '}')
                        || substr_count($item, '[') !== substr_count($item, ']')) {
                    return $m[0];
                }
            }
            return '[' . $m[2] . ',' . $m[3] . ']';
        }, $s);

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

        $s = preg_replace('/-\s*\\\\infty/', 'minf', $s);
        $s = preg_replace('/-\s*∞/u', 'minf', $s);
        $s = str_replace(['\\infty', '∞'], 'inf', $s);

        $s = preg_replace('/\^\s*\{\s*\\\\prime\s*\\\\prime\s*\}|\^\s*\\\\prime\s*\\\\prime(?![A-Za-z])/', "''", $s);
        $s = preg_replace('/\^\s*\{\s*\\\\prime\s*\}|\^\s*\\\\prime(?![A-Za-z])/', "'", $s);
        $s = self::normalize_prime_derivative($s);
        $s = preg_replace("/(?<![A-Za-z])([a-zA-Z])''(?![A-Za-z0-9(])/", 'diff($1,x,2)', $s);
        $s = preg_replace("/(?<![A-Za-z])([a-zA-Z])'(?![A-Za-z0-9('])/", 'diff($1,x)', $s);
        $s = str_replace(['\\,', '\\!', '\\;', '\\:', '\\ '], '', $s);
        $s = preg_replace('/\^\{([^{}]+)\}/', '^($1)', $s);

        $s = preg_replace('/\\\\binom\s*\{([^{}]+)\}\s*\{([^{}]+)\}/', 'binomial($1,$2)', $s);

        $s = self::normalize_inverse_trig($s);
        $s = preg_replace('/e\^\(([^()]+)\)/', '%e^($1)', $s);
        $s = preg_replace('/e\^([a-zA-Z0-9]+)/', '%e^$1', $s);

        $s = self::normalize_base_logarithms($s);

        // Capture the differential before function normalization can consume
        // a compact tail such as "\\sin x\\,dx" as one function argument.
        $s = self::normalize_integral($s);

        $s = self::normalize_function_arguments($s);
        $s = str_replace(self::IMPLICIT_PRODUCT, '*', $s);
        // Any other degree mark is an angle answer in degrees: keep the number.
        $s = preg_replace('/\s*°/u', '', $s);

        $s = self::normalize_derivative($s);
        $s = self::normalize_sum_product($s);
        $s = self::normalize_fractions_roots($s);
        $s = self::normalize_limit($s);
        $s = str_replace(['\\rightarrow', '\\longrightarrow', '\\to'], '->', $s);

        $s = preg_replace('/\\\\operatorname\s*\{\s*det\s*\}\s*\(([^()]*)\)/', 'determinant($1)', $s);
        $s = preg_replace('/\\\\det\s*\(([^()]*)\)/', 'determinant($1)', $s);
        $s = preg_replace('/\\\\operatorname\s*\{\s*det\s*\}\s*([a-zA-Z])\b/', 'determinant($1)', $s);
        $s = preg_replace('/\\\\det\s*([a-zA-Z])\b/', 'determinant($1)', $s);

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
        $s = preg_replace('/([a-zA-Z])_\{\s*([^{}]+?)\s*\}/', '$1[$2]', $s);
        $s = preg_replace('/_\{([^{}]+)\}/', '_$1', $s);

        $s = preg_replace('/\\\\text\s*\{\s*([^{}]+?)\s*\}/', '$1', $s);
        $s = preg_replace('/\\\\mathrm\s*\{\s*([^{}]+?)\s*\}/', '$1', $s);
        $s = preg_replace('/\\\\operatorname\s*\{\s*([^{}]+?)\s*\}/', '$1', $s);
        // \{1,2,3\} is a set; other braces are LaTeX grouping.
        $s = str_replace(['\\{', '\\}', '{', '}'], ["\x01", "\x02", '(', ')'], $s);
        $s = preg_replace('/\\\\([a-zA-Z]+)/', '$1', $s);

        // Preserve logical words before whitespace-based implicit
        // multiplication turns "x and x" into "x*and*x".
        $s = preg_replace('/\band\b/i', '__LOGICAL_AND__', $s);
        $s = preg_replace('/\bor\b/i', '__LOGICAL_OR__', $s);
        $s = preg_replace('/\bin\b/i', '__RELATIONAL_IN__', $s);
        $s = preg_replace('/([a-zA-Z])\s+([a-zA-Z])/', '$1*$2', $s);
        $s = preg_replace('/(\d)\s+([a-zA-Z])/', '$1*$2', $s);
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
        $s = self::normalize_variable_products($s);
        if ($textlabels) {
            $s = strtr($s, $textlabels);
        }

        $s = preg_replace('/\\\\pi\b/', '%pi', $s);
        $s = str_replace('π', '%pi', $s);
        $s = preg_replace('/(^|[^A-Za-z0-9_])pi(?![A-Za-z0-9_])/', '$1%pi', $s);
        $s = preg_replace('/(\d)pi(?![A-Za-z0-9_])/', '$1*%pi', $s);
        $s = preg_replace('/(^|[^%A-Za-z0-9_])e(?![A-Za-z0-9_])/', '$1%e', $s);
        $s = preg_replace('/(^|[^%A-Za-z0-9_])i(?![A-Za-z0-9_])/', '$1%i', $s);
        $s = preg_replace('/([A-Za-z0-9)\]])(%e|%pi)/', '$1*$2', $s);

        $s = str_replace(')(', ')*(', $s);
        $s = preg_replace('/(\d)([a-zA-Z])/', '$1*$2', $s);
        $s = preg_replace('/(\d)\(/', '$1*(', $s);
        $s = preg_replace('/\)([a-zA-Z])/', ')*$1', $s);
        $s = preg_replace('/\]([a-zA-Z(])/', ']*$1', $s);
        $s = preg_replace('/(^|[^%A-Za-z0-9_])e(?![A-Za-z0-9_])/', '$1%e', $s);
        $s = preg_replace('/(^|[^%A-Za-z0-9_])i(?![A-Za-z0-9_])/', '$1%i', $s);
        $s = self::normalize_absolute($s);
        $s = preg_replace('/\b([a-df-zA-DF-Z])x(?=(\^|\+|\-|\*|\/|\)|$))/', '$1*x', $s);
        $s = preg_replace('/^(.+?)\s+in\s+(\[[^\]]+\])$/', 'elementp($1,$2)', $s);
        $s = str_replace(["\x01", "\x02"], ['{', '}'], $s);
        // "\\mu=50, \\sigma=10" states several values at once.
        if (preg_match('/^[A-Za-z]\w*=[^,=<>]+(?:,[A-Za-z]\w*=[^,=<>]+)+$/', $s)) {
            $s = '[' . $s . ']';
        }
        // log(x,2) is not Maxima; it means the base-2 logarithm.
        $s = preg_replace('/\blog\(([^(),]+),([^(),]+)\)/', '(log($1)/log($2))', $s);
        $s = self::protect_functions($s);
        $s = self::beautify($s);

        return trim($s);
    }

    private static function extract_math_candidate(string $input): string {
        $s = trim($input);
        if ($s === '') {
            return '';
        }

        if (preg_match('/^\\\\text\s*\{\s*([ei])\s*\}$/u', $s, $match)) {
            return $match[1];
        }
        if (preg_match('/^\\\\(?:text|mathrm)\s*\{\s*([^{}]+?)\s*\}$/u', $s, $match)
                && preg_match('/[=+\-*\/^]|\d|\\\\(?:frac|sqrt|sin|cos|tan|log|ln)\b/u', $match[1])) {
            return trim($match[1]);
        }

        $s = str_replace(['−', '–', '—', '＝'], ['-', '-', '-', '='], $s);
        $s = self::normalize_combinations($s);
        $s = self::prose_operatornames($s);
        $connected = self::join_connected_relations($s);
        if ($connected !== null) {
            return $connected;
        }
        // Preserve a recognized connective even when OCR damaged one side.
        // The Free-text review must keep the editable row, while protecting
        // `or`/`and` from implicit multiplication. Thus `x=-1 \text{or} x-3`
        // remains visibly incomplete instead of becoming `x=-1*x-3`.
        $connectivewords = implode('|', array_map('preg_quote', array_keys(self::CONNECTIVES)));
        $malformedseparator = '/\\\\(?:text|mathrm)\s*\{\s*(' . $connectivewords . ')\s*\}/u';
        if (preg_match($malformedseparator, $s)) {
            $s = preg_replace_callback($malformedseparator, static function(array $match): string {
                return ' ' . self::CONNECTIVES[$match[1]] . ' ';
            }, $s);
            return trim(str_replace(['\\quad', '\\qquad'], ' ', $s));
        }
        $s = str_replace(['\\therefore', '\\because'], '', $s);
        if (preg_match('/(?:答え|解答)/u', $s)) {
            $s = preg_replace('/[xｘメ]\s*[ニ二]\s*[ー-]\s*(\d+(?:\.\d+)?)/u', 'x=-$1', $s);
            $s = preg_replace('/たす\s*$/u', 'です', $s);
        }

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
            $s
        );
        $hasprose = preg_match('/(?:\\\\text|(?<!\\\\)\btext|\\\\mathrm)\s*\{/u', $prosecheck) === 1
            || preg_match('/[\x{3040}-\x{30ff}\x{3400}-\x{9fff}]/u', $s) === 1
            || preg_match('/\b(?:answer|solution|therefore|hence|thus|finally|so)\b/iu', $s) === 1;

        $hasprose = $hasprose
            || preg_match('/\b(?:first|next)\b/iu', $s) === 1;

        // Mathpix occasionally omits the closing delimiter at the end of a
        // handwritten line. The opening delimiter still gives an exact prose
        // boundary, so keep only its remainder.
        if ($hasprose && preg_match('/\$([^$\n]+)$/u', $s, $match)) {
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

        $s = preg_replace('/\\\\text\s*\{\s*[^{}]*?\s*\}/u', ' ', $s);
        $s = preg_replace('/(?<!\\\\)\btext\s*\{\s*[^{}]*?\s*\}/u', ' ', $s);
        $s = preg_replace('/\\\\mathrm\s*\{\s*[^{}]*?\s*\}/u', ' ', $s);
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

        $fraction = self::extract_first_fraction($s);
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

    private static function extract_first_fraction(string $input): ?array {
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

    private static function normalize_matrix(string $input): string {
        if (!preg_match('/\\\\begin\{(array|pmatrix|bmatrix|matrix|vmatrix)\}(?:\{[^}]*\})?([\s\S]*?)\\\\end\{\1\}/', $input, $match)) {
            return '';
        }

        $rows = [];
        foreach (preg_split('/\\\\\\\\/', trim($match[2])) as $row) {
            $row = trim($row);
            if ($row === '') {
                continue;
            }
            $columns = array_values(array_filter(array_map('trim', explode('&', $row)), static function($value) {
                return $value !== '';
            }));
            $columns = array_map(static function($value) {
                return self::normalize($value);
            }, $columns);
            $rows[] = '[' . implode(',', $columns) . ']';
        }

        if (!$rows) {
            return '';
        }

        $before = substr($input, 0, (int) strpos($input, $match[0]));
        $after = substr($input, (int) strpos($input, $match[0]) + strlen($match[0]));
        $opener = '/(?:\\\\left\s*)?(?:\(|\[|\||\\\\\{|\\\\vert|\\\\lvert)\s*$/';
        $closer = '/^\s*(?:\\\\right\s*)?(?:\)|\]|\||\.|\\\\\}|\\\\vert|\\\\rvert)/';
        $prefix = trim(preg_replace($opener, '', $before));
        $suffix = trim(preg_replace($closer, '', $after));
        $wrap = static function(string $core) use ($prefix, $suffix): string {
            return ($prefix === '' ? '' : self::normalize($prefix)) . $core . ($suffix === '' ? '' : self::normalize($suffix));
        };
        $onecolumn = !preg_match('/,/', implode('', array_map(static function(string $row): string {
            return preg_replace('/\([^()]*\)|\[[^\[\]]*\]/', '', substr($row, 1, -1));
        }, $rows)));
        // "\left\{ x+y=3 \\ x-y=1 \right." is a system of equations, not a matrix.
        if ($match[1] === 'array' && $onecolumn && preg_match('/(?:\\\\left\s*)?\\\\\{\s*$/', $before)) {
            return $wrap('[' . implode(',', array_map(static function(string $row): string {
                return substr($row, 1, -1);
            }, $rows)) . ']');
        }
        $matrix = 'matrix(' . implode(',', $rows) . ')';
        $bars = preg_match('/(?:\\\\left\s*)?(?:\||\\\\vert|\\\\lvert)\s*$/', $before);
        return $wrap($match[1] === 'vmatrix' || $bars ? 'determinant(' . $matrix . ')' : $matrix);
    }

    private static function normalize_piecewise(string $input): string {
        if (!preg_match('/\\\\begin\{(cases|array)\}(?:\{[^}]*\})?([\s\S]*?)\\\\end\{\1\}/', $input, $match)) {
            return '';
        }

        $prefix = '';
        $prefixpos = strpos($input, $match[0]);
        if ($prefixpos !== false) {
            $prefix = substr($input, 0, $prefixpos);
            $prefix = preg_replace('/\\\\left\s*\\\\?\{\s*$/', '', $prefix);
            $prefix = preg_replace('/\\\\left(?![a-zA-Z])/', '', $prefix);
            $prefix = str_replace(['\\{', '{'], '', $prefix);
            $prefix = trim($prefix);
            if ($prefix !== '' && strpos($prefix, '=') !== false) {
                $prefix = self::normalize($prefix);
            } else {
                $prefix = '';
            }
        }

        $branches = [];
        foreach (preg_split('/\\\\\\\\/', trim($match[2])) as $row) {
            $row = trim($row);
            if ($row === '') {
                continue;
            }
            $parts = explode('&', $row);
            $expression = trim(preg_replace('/[,\s]+$/', '', array_shift($parts)));
            $condition = trim(implode('&', $parts));
            if ($expression !== '') {
                $branches[] = [
                    'expression' => self::normalize($expression),
                    'condition' => $condition === '' ? '' : self::normalize($condition),
                ];
            }
        }

        if (!$branches) {
            return '';
        }

        $conditions = array_filter(array_column($branches, 'condition'), static function(string $condition): bool {
            return $condition !== '';
        });
        if ($match[1] === 'cases' && !$conditions) {
            return $prefix . '[' . implode(',', array_column($branches, 'expression')) . ']';
        }

        if ($match[1] === 'array') {
            $hascondition = false;
            foreach ($branches as $branch) {
                if (preg_match('/(<=|>=|<|>|\\\\leq|\\\\geq|\\\\leqslant|\\\\geqslant)/', $branch['condition'])) {
                    $hascondition = true;
                    break;
                }
            }
            if (!$hascondition) {
                return '';
            }
        }

        $result = $branches[count($branches) - 1]['expression'];
        for ($i = count($branches) - 2; $i >= 0; $i--) {
            if ($branches[$i]['condition'] === '') {
                $result = $branches[$i]['expression'];
                continue;
            }
            $result = 'if ' . $branches[$i]['condition'] . ' then ' . $branches[$i]['expression'] . ' else ' . $result;
        }

        return $prefix . $result;
    }

    private static function normalize_absolute(string $input): string {
        $output = str_replace(['\\lvert', '\\rvert', '\\vert'], '|', $input);
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
                $normalized .= ')';
                $depth--;
            }
        }

        return $depth === 0 ? $normalized : $output;
    }

    private static function normalize_accents(string $input): string {
        $output = $input;
        $offset = 0;
        while (preg_match(
            '/\\\\(?:hat|widehat|bar|overline|dot|ddot)\s*\{/',
            $output,
            $match,
            PREG_OFFSET_CAPTURE,
            $offset
        )) {
            $start = $match[0][1];
            $open = $start + strlen($match[0][0]) - 1;
            $depth = 1;
            $cursor = $open + 1;
            $length = strlen($output);
            while ($cursor < $length && $depth > 0) {
                if ($output[$cursor] === '{') {
                    $depth++;
                } else if ($output[$cursor] === '}') {
                    $depth--;
                }
                $cursor++;
            }

            if ($depth !== 0) {
                $offset = $open + 1;
                continue;
            }

            $inner = substr($output, $open + 1, $cursor - $open - 2);
            $output = substr($output, 0, $start) . $inner . substr($output, $cursor);
            $offset = $start;
        }

        return $output;
    }

    private static function normalize_limit(string $input): string {
        return preg_replace_callback(
            '/\\\\lim\s*_\s*\{\s*([a-zA-Z])\s*(?:\\\\to|\\\\rightarrow|\\\\longrightarrow|->|→)\s*([^{}]+?)\s*\}\s*(.+)$/u',
            static function($m) {
                [$body, $rest] = self::split_at_relation(trim($m[3]));
                return 'limit(' . $body . ',' . trim($m[1]) . ',' . trim($m[2]) . ')' . $rest;
            },
            $input
        );
    }

    private static function normalize_derivative(string $input): string {
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
                [$body, $rest] = self::split_at_relation(trim($m[7]));
                return $num === $den ? 'diff(' . $body . ',' . trim($m[4]) . ',' . $num . ')' . $rest : $m[0];
            },
            $output
        );

        return preg_replace_callback(
            '/\\\\frac\s*\{\s*(d|\\\\partial)\s*\}\s*\{\s*\1\s*([a-zA-Z])\s*\}\s*(.+)$/',
            static function($m) {
                [$body, $rest] = self::split_at_relation(trim($m[3]));
                return 'diff(' . $body . ',' . trim($m[2]) . ')' . $rest;
            },
            $output
        );
    }

    private static function normalize_prime_derivative(string $input): string {
        $output = preg_replace('/([a-zA-Z])\s*\^\s*\{\s*\\\\prime\s*\\\\prime\s*\}\s*\(\s*([a-zA-Z])\s*\)/', 'diff($1($2),$2,2)', $input);
        $output = preg_replace('/([a-zA-Z])\s*\^\s*\{\s*\\\\prime\s*\}\s*\(\s*([a-zA-Z])\s*\)/', 'diff($1($2),$2)', $output);
        $output = preg_replace('/([a-zA-Z])\'\'\s*\(\s*([a-zA-Z])\s*\)/', 'diff($1($2),$2,2)', $output);
        return preg_replace('/([a-zA-Z])\'\s*\(\s*([a-zA-Z])\s*\)/', 'diff($1($2),$2)', $output);
    }

    private static function normalize_integral(string $input): string {
        $output = preg_replace_callback(
            '/\\\\int\s*_\s*\{\s*([^{}]+?)\s*\}\s*\^\s*(?:\{\s*([^{}]+?)\s*\}|\(\s*([^()]+?)\s*\)|((?:\\\\[A-Za-z]+|[A-Za-z0-9%.+\-]+)))\s*(.+?)\s*(?:\\\\[,;:!]\s*)*d\s*([a-zA-Z])\s*$/',
            static function($m) {
                $upper = $m[2] !== '' ? $m[2] : ($m[3] !== '' ? $m[3] : $m[4]);
                $integrand = ltrim(trim($m[5]), '*' . self::IMPLICIT_PRODUCT);
                return 'int(' . $integrand . ',' . trim($m[6]) . ',' . trim($m[1]) . ',' . trim($upper) . ')';
            },
            $input
        );

        $output = preg_replace_callback(
            '/\\\\int\s*_\s*((?:\\\\[A-Za-z]+|[A-Za-z0-9%.+\-]+))\s*\^\s*(?:\{\s*([^{}]+?)\s*\}|\(\s*([^()]+?)\s*\)|((?:\\\\[A-Za-z]+|[A-Za-z0-9%.+\-]+)))\s*(.+?)\s*(?:\\\\[,;:!]\s*)*d\s*([a-zA-Z])\s*$/',
            static function($m) {
                $upper = $m[2] !== '' ? $m[2] : ($m[3] !== '' ? $m[3] : $m[4]);
                $integrand = ltrim(trim($m[5]), '*' . self::IMPLICIT_PRODUCT);
                return 'int(' . $integrand . ',' . trim($m[6]) . ',' . trim($m[1]) . ',' . trim($upper) . ')';
            },
            $output
        );

        return preg_replace_callback(
            '/\\\\int\s*(.+?)\s*(?:\\\\[,;:!]\s*)*d\s*([a-zA-Z])\s*$/',
            static function($m) {
                return 'int(' . ltrim(trim($m[1]), '*' . self::IMPLICIT_PRODUCT) . ',' . trim($m[2]) . ')';
            },
            $output
        );
    }

    private static function normalize_sum_product(string $input): string {
        return preg_replace_callback(
            '/\\\\(sum|prod|pi)\s*_\s*\{\s*([a-zA-Z])\s*=\s*([^{}]+?)\s*\}\s*\^\s*(?:\{\s*([^{}]+?)\s*\}|\(\s*([^()]+?)\s*\)|((?:inf|minf|[A-Za-z]|[+\-]?\d+(?:\.\d+)?)))\s*(.+)$/',
            static function($m) {
                $name = $m[1] === 'sum' ? 'sum' : 'product';
                $upper = $m[4] !== '' ? $m[4] : ($m[5] !== '' ? $m[5] : $m[6]);
                [$body, $rest] = self::split_at_relation(trim($m[7]));
                return $name . '(' . $body . ',' . trim($m[2]) . ',' . trim($m[3]) . ',' . trim($upper) . ')' . $rest;
            },
            $input
        );
    }

    private static function normalize_fractions_roots(string $input): string {
        $output = $input;
        do {
            $previous = $output;
            $output = preg_replace(
                '/\\\\sqrt\s*\[([^\[\]]+)\]\s*\{([^{}]+)\}/',
                '($2)^(1/$1)',
                $output
            );
            $output = preg_replace('/\\\\sqrt\s*\{([^{}]+)\}/', 'sqrt($1)', $output);
            $output = preg_replace(
                '/\\\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/',
                '($1)/($2)',
                $output
            );
        } while ($output !== $previous);

        return $output;
    }

    private static function normalize_variable_products(string $input): string {
        $identifiers = ['mu', 'sigma', 'alpha', 'beta', 'gamma', 'delta', 'theta', 'lambda',
            'omega', 'phi', 'psi', 'rho', 'tau', 'epsilon', 'inf', 'minf', 'and', 'or', 'not',
            'then', 'else', 'in', 'min', 'max', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
            'sinh', 'cosh', 'tanh', 'asin', 'acos', 'atan', 'log', 'ln', 'sqrt', 'exp',
            'abs', 'limit', 'diff', 'int', 'sum', 'product', 'matrix', 'determinant', 'elementp',
            'binomial', 'pi', 'lg'];

        return preg_replace_callback('/[A-Za-z]{2,}/', static function($m) use ($identifiers) {
            if (in_array(strtolower($m[0]), $identifiers, true)) {
                return $m[0];
            }
            // "sinx" typed for sin(x).
            if (preg_match('/^(sin|cos|tan|ln|log|exp)([a-zA-Z])$/', $m[0], $fn)) {
                return $fn[1] . '(' . $fn[2] . ')';
            }
            return implode('*', str_split($m[0]));
        }, $input);
    }

    private static function normalize_inverse_trig(string $input): string {
        $s = $input;
        foreach (['arcsin' => 'asin', 'arccos' => 'acos', 'arctan' => 'atan'] as $latex => $stack) {
            $s = preg_replace('/\\\\' . $latex . '\s*\{([^{}]+)\}/', $stack . '($1)', $s);
            $s = preg_replace('/\\\\' . $latex . '\s*\(([^()]*)\)/', $stack . '($1)', $s);
            $s = preg_replace('/\\\\' . $latex . '\s+([a-zA-Z0-9]+)/', $stack . '($1)', $s);
        }
        foreach (['sin' => 'asin', 'cos' => 'acos', 'tan' => 'atan'] as $latex => $stack) {
            $s = preg_replace('/\\\\' . $latex . '\s*\^\s*\(\s*-1\s*\)\s*\\\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/', $stack . '(($1)/($2))', $s);
            $s = preg_replace('/\\\\' . $latex . '\s*\^\s*\(\s*-1\s*\)\s*\(([^()]+)\)/', $stack . '($1)', $s);
            $s = preg_replace('/\\\\' . $latex . '\s*\^\s*\(\s*-1\s*\)\s*([a-zA-Z0-9]+)/', $stack . '($1)', $s);
        }
        return $s;
    }

    private static function expand_chained_inequality(string $input): string {
        if ($input === '' || preg_match('/\b(?:and|or)\b|,/', $input)) {
            return $input;
        }

        $parts = preg_split('/(<=|>=|<|>)/', $input, -1, PREG_SPLIT_DELIM_CAPTURE);
        if (count($parts) < 5 || count($parts) % 2 === 0) {
            return $input;
        }

        $clauses = [];
        for ($i = 1; $i < count($parts); $i += 2) {
            if (trim($parts[$i - 1]) === '' || trim($parts[$i + 1]) === '') {
                return $input;
            }
            $clauses[] = $parts[$i - 1] . $parts[$i] . $parts[$i + 1];
        }

        return implode(' and ', $clauses);
    }

    private static function protect_functions(string $input): string {
        $functions = ['f', 'g', 'h', 'min', 'max', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
            'sinh', 'cosh', 'tanh', 'asin', 'acos', 'atan', 'log', 'ln', 'sqrt', 'exp',
            'abs', 'limit', 'diff', 'int', 'sum', 'product', 'matrix', 'determinant', 'binomial', 'lg'];
        $functions[] = 'not';
        $functions[] = 'elementp';

        return preg_replace_callback('/([a-zA-Z]+)\(/', static function($m) use ($functions) {
            return in_array($m[1], $functions, true) ? $m[0] : $m[1] . '*(';
        }, $input);
    }

    private static function beautify(string $input): string {
        $s = $input;
        $s = preg_replace('/\((\d+)\)\/\((\d+)\)/', '$1/$2', $s);
        $s = preg_replace('/\((\d+)\)\/\(([a-zA-Z])\)/', '$1/$2', $s);
        $s = preg_replace('/\(([a-zA-Z])\)\/\((\d+)\)/', '$1/$2', $s);
        $s = preg_replace('/\(([a-zA-Z])\)\/\(([a-zA-Z])\)/', '$1/$2', $s);
        $s = preg_replace('/\(([a-zA-Z])\)\/\(([^()]+)\)/', '$1/($2)', $s);
        $s = preg_replace('/\((\d+)\)\/\(([a-zA-Z])\^(\d+)\)/', '$1/$2^$3', $s);
        $s = preg_replace('/\(([^()]+)\)\/\(([A-Za-z0-9%.\[\]]+)\)/', '($1)/$2', $s);
        $s = preg_replace('/\((\d+)\)\/\((sqrt|sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|asin|acos|atan|log|ln|exp)\(([^()]+)\)\)/', '$1/$2($3)', $s);
        $s = preg_replace('/\((sqrt|sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|asin|acos|atan|log|ln|exp|abs)\(([^()]+)\)\)\/\(([a-zA-Z0-9%]+)\)/', '$1($2)/$3', $s);
        $s = preg_replace('/\((\d+)\)\/\(([^()]+)\)/', '$1/($2)', $s);
        $s = preg_replace('/\^\((\d+)\)/', '^$1', $s);
        $s = preg_replace('/\^\(([a-zA-Z])\)/', '^$1', $s);
        $s = preg_replace('/%e\^\(([a-zA-Z0-9]+)\)/', '%e^$1', $s);
        $s = preg_replace('/\(([a-zA-Z])\)\^\(1\/(\d+)\)/', '$1^(1/$2)', $s);
        $s = preg_replace('/\b(sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|asin|acos|atan|log|ln|sqrt|exp)\(\(([^()]+)\)\/\(([^()]+)\)\)/', '$1(($2)/($3))', $s);
        $s = preg_replace('/^\((sqrt|sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|asin|acos|atan|log|ln|exp)\(([^()]+)\)\)\//', '$1($2)/', $s);
        $s = preg_replace('/^\(log\(([^()]+)\)\/log\(([^()]+)\)\)$/', 'log($1)/log($2)', $s);
        $s = self::expand_chained_inequality($s);
        $s = preg_replace('/^([A-Za-z0-9%.\[\]\^()+\-*\/]+)(?:#|!=)([A-Za-z0-9%.\[\]\^()+\-*\/]+)$/', 'not($1=$2)', $s);
        $s = preg_replace('/\bdiff\(([a-zA-Z])\*\(([a-zA-Z])\),\2\)/', 'diff($1($2),$2)', $s);
        $s = preg_replace('/\bdiff\(([a-zA-Z])\*\(([a-zA-Z])\),\2,(\d+)\)/', 'diff($1($2),$2,$3)', $s);
        $s = preg_replace('/\bint\(([a-zA-Z])\*\(([a-zA-Z])\),\2\)/', 'int($1($2),$2)', $s);
        $s = preg_replace('/\bint\(([a-zA-Z])\*\(([a-zA-Z])\),\2,([^,]+),([^)]+)\)/', 'int($1($2),$2,$3,$4)', $s);
        $s = preg_replace('/^([a-zA-Z])\*\(([a-zA-Z])\)=/', '$1($2)=', $s);
        $s = preg_replace_callback('/\b(sum|product)\(([^,]+),%i,([^,]+),([^)]+)\)/', static function($m) {
            return $m[1] . '(' . str_replace('%i', 'i', $m[2]) . ',i,' . $m[3] . ',' . $m[4] . ')';
        }, $s);
        $s = preg_replace('/\bfrac\*\(([^()]+)\)\*\(([^()]+)\)/', '($1)/($2)', $s);
        $s = preg_replace('/\(([a-zA-Z]\[[^\[\]()]+\])\)\/\(([a-zA-Z0-9]+)\)/', '$1/$2', $s);
        $s = preg_replace('/%e\^\(([a-zA-Z0-9]+)\)/', '%e^$1', $s);
        $s = preg_replace('/__ALL__([a-zA-Z])__IN__([A-Z])__/', '$1 in $2', $s);
        $s = preg_replace('/^\(([a-zA-Z](?:,[a-zA-Z])+)\)=/', '[$1]=', $s);
        $s = preg_replace('/=\(\s*([A-Za-z0-9%+\-*\/^.\[\]\s]+(?:,[A-Za-z0-9%+\-*\/^.\[\]\s]+)+)\s*\)/', '=[$1]', $s);
        $s = preg_replace('/^\(\s*([A-Za-z0-9%+\-*\/^.\[\]\s]+(?:,[A-Za-z0-9%+\-*\/^.\[\]\s]+)+)\s*\)$/', '[$1]', $s);
        return $s;
    }
}
