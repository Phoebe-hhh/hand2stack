<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * classes local stack converter.php for STACK Input Helper.
 *
 * @package    local_stackinputhelper
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_stackinputhelper\local;

defined('MOODLE_INTERNAL') || die();

final class stack_converter {
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
        $s = preg_replace(
            '/([A-Za-z0-9)\]])\s*(?=\\\\(?:sqrt|sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|arcsin|arccos|arctan|log|ln)\b)/',
            '$1*',
            $s
        );

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
        $s = preg_replace(
            '/([A-Za-z0-9)\]])\s*(?=\\\\' . $greekcommands . '\b)/',
            '$1*',
            $s
        );
        $s = preg_replace(
            '/(\\\\' . $greekcommands . ')\s*(?=\\\\' . $greekcommands . '\b)/',
            '$1*',
            $s
        );

        $s = preg_replace('/\\\\vec\s*\{\s*([a-zA-Z])\s*\}\s*\\\\cdot\s*\\\\vec\s*\{\s*([a-zA-Z])\s*\}/', '$1.$2', $s);
        $s = preg_replace('/\\\\vec\s*\{\s*([a-zA-Z])\s*\}/', '$1', $s);

        $s = str_replace(['\\cdot', '\\times', '×', '\\div', '÷'], ['*', '*', '*', '/', '/'], $s);
        $s = str_replace(['\\geqslant', '\\geq', '≥'], '>=', $s);
        $s = str_replace(['\\leqslant', '\\leq', '≤'], '<=', $s);
        $s = str_replace(['\\neq', '\\ne'], '#', $s);

        $s = preg_replace('/[a-zA-Z]\s*=\s*\\\\pm\s*([A-Za-z0-9%.\[\]\^()+\-*\/]+)/', '[$1,-$1]', $s);
        $s = preg_replace('/[a-zA-Z]\s*=\s*±\s*([A-Za-z0-9%.\[\]\^()+\-*\/]+)/u', '[$1,-$1]', $s);
        $s = preg_replace('/^[a-zA-Z]\s*=\s*([^,=]+)\s*(?<!\\\\),\s*([^,=]+)$/', '[$1,$2]', $s);

        $s = preg_replace('/([a-zA-Z])\s*\\\\in\s*\\\\mathbb\s*\{\s*([A-Z])\s*\}/', '__ALL__$1__IN__$2__', $s);
        $s = preg_replace('/([a-zA-Z])\s*\\\\in\s*\[\s*([^,\]]+)\s*,\s*([^\]]+)\s*\]/', '__INTERVAL__$1__$2__$3__', $s);
        $s = preg_replace('/([a-zA-Z])\s*∈\s*([A-Z])/u', '__ALL__$1__IN__$2__', $s);
        $s = preg_replace('/([a-zA-Z])\s*∈\s*\[\s*([^,\]]+)\s*,\s*([^\]]+)\s*\]/u', '__INTERVAL__$1__$2__$3__', $s);
        $s = preg_replace('/\\\\mathbb\s*\{\s*([A-Z])\s*\}/', '$1', $s);

        $s = preg_replace('/-\s*\\\\infty/', 'minf', $s);
        $s = preg_replace('/-\s*∞/u', 'minf', $s);
        $s = str_replace(['\\infty', '∞'], 'inf', $s);

        $s = self::normalize_prime_derivative($s);
        $s = str_replace(['\\,', '\\!', '\\;', '\\:', '\\ '], '', $s);
        $s = preg_replace('/\^\{([^{}]+)\}/', '^($1)', $s);

        $s = preg_replace('/\\\\binom\s*\{([^{}]+)\}\s*\{([^{}]+)\}/', 'binomial($1,$2)', $s);

        $s = self::normalize_inverse_trig($s);
        $s = preg_replace('/e\^\(([^()]+)\)/', '%e^($1)', $s);
        $s = preg_replace('/e\^([a-zA-Z0-9]+)/', '%e^$1', $s);

        $s = preg_replace('/\\\\log\s*_\s*\{([^{}]+)\}\s*\(([^()]*)\)/', '(log($2)/log($1))', $s);
        $s = preg_replace('/\\\\log\s*_\s*\{([^{}]+)\}\s*\{([^{}]+)\}/', '(log($2)/log($1))', $s);
        $s = preg_replace('/\\\\log\s*_\s*\{([^{}]+)\}\s*([a-zA-Z0-9]+)/', '(log($2)/log($1))', $s);
        $s = preg_replace('/\\\\log\s*_\s*([a-zA-Z0-9]+)\s*\{([^{}]+)\}/', '(log($2)/log($1))', $s);
        $s = preg_replace('/\\\\log\s*_\s*([a-zA-Z0-9]+)\s*([a-zA-Z0-9]+)/', '(log($2)/log($1))', $s);

        $s = preg_replace('/\\\\log\\s*_\\s*([a-zA-Z0-9]+)\\s*\\(([^()]*)\\)/', '(log($2)/log($1))', $s);

        // Capture the differential before function normalization can consume
        // a compact tail such as "\\sin x\\,dx" as one function argument.
        $s = self::normalize_integral($s);

        foreach (['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'log', 'ln'] as $fn) {
            $s = preg_replace('/\\\\' . $fn . '\s*\{([^{}]+)\}/', $fn . '($1)', $s);
            $s = preg_replace('/\\\\' . $fn . '\s+([a-zA-Z0-9]+)/', $fn . '($1)', $s);
        }

        $s = self::normalize_derivative($s);
        $s = self::normalize_sum_product($s);
        $s = self::normalize_fractions_roots($s);
        $s = self::normalize_function_powers($s);
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
        $s = str_replace(['{', '}'], ['(', ')'], $s);
        $s = preg_replace('/\\\\([a-zA-Z]+)/', '$1', $s);

        $s = preg_replace('/([a-zA-Z])\s+([a-zA-Z])/', '$1*$2', $s);
        $s = preg_replace('/(\d)\s+([a-zA-Z])/', '$1*$2', $s);
        $s = preg_replace('/\s+/', '', $s);

        // Restore set/interval placeholders before splitting unknown letter
        // sequences into implicit products. Otherwise words such as INTERVAL
        // are transformed into I*N*T*E*R*V*A*L and can no longer be restored.
        $s = preg_replace('/__ALL__([a-zA-Z])__IN__([A-Z])__/', '$1 in $2', $s);
        $s = preg_replace(
            '/__INTERVAL__([a-zA-Z])__([^_]+)__([^_]+)__/',
            '$2<=$1 and $1<=$3',
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
        $s = str_replace(['\\quad', '\\qquad', '\\therefore', '\\because'], '', $s);
        if (preg_match('/(?:答え|解答)/u', $s)) {
            $s = preg_replace('/[xｘメ]\s*[ニ二]\s*[ー-]\s*(\d+(?:\.\d+)?)/u', 'x=-$1', $s);
            $s = preg_replace('/たす\s*$/u', 'です', $s);
        }
        $prosecheck = preg_replace(
            '/_\{\s*\\\\(?:text|mathrm)\s*\{\s*[^{}]*?\s*\}\s*\}/u',
            '_label',
            $s
        );
        $hasprose = preg_match('/(?:\\\\text|(?<!\\\\)\btext|\\\\mathrm)\s*\{/u', $prosecheck) === 1
            || preg_match('/[\x{3040}-\x{30ff}\x{3400}-\x{9fff}]/u', $s) === 1
            || preg_match('/\b(?:answer|solution|therefore|hence|thus|finally)\b/iu', $s) === 1;

        $hasprose = $hasprose
            || preg_match('/\b(?:first|next)\b/iu', $s) === 1;

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

        if (preg_match('/\$(.+?)\$/u', $s, $match)) {
            return trim($match[1]);
        }

        if (preg_match('/\\\\\((.+?)\\\\\)/u', $s, $match) || preg_match('/\\\\\[(.+?)\\\\\]/u', $s, $match)) {
            return trim($match[1]);
        }

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

        $matrix = 'matrix(' . implode(',', $rows) . ')';
        return $match[1] === 'vmatrix' ? 'determinant(' . $matrix . ')' : $matrix;
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
                $normalized .= 'abs(';
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
                return 'limit(' . trim($m[3]) . ',' . trim($m[1]) . ',' . trim($m[2]) . ')';
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
                return $num === $den ? 'diff(' . trim($m[7]) . ',' . trim($m[4]) . ',' . $num . ')' : $m[0];
            },
            $output
        );

        return preg_replace_callback(
            '/\\\\frac\s*\{\s*(d|\\\\partial)\s*\}\s*\{\s*\1\s*([a-zA-Z])\s*\}\s*(.+)$/',
            static function($m) {
                return 'diff(' . trim($m[3]) . ',' . trim($m[2]) . ')';
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
                $integrand = ltrim(trim($m[5]), '*');
                return 'int(' . $integrand . ',' . trim($m[6]) . ',' . trim($m[1]) . ',' . trim($upper) . ')';
            },
            $input
        );

        $output = preg_replace_callback(
            '/\\\\int\s*_\s*((?:\\\\[A-Za-z]+|[A-Za-z0-9%.+\-]+))\s*\^\s*(?:\{\s*([^{}]+?)\s*\}|\(\s*([^()]+?)\s*\)|((?:\\\\[A-Za-z]+|[A-Za-z0-9%.+\-]+)))\s*(.+?)\s*(?:\\\\[,;:!]\s*)*d\s*([a-zA-Z])\s*$/',
            static function($m) {
                $upper = $m[2] !== '' ? $m[2] : ($m[3] !== '' ? $m[3] : $m[4]);
                $integrand = ltrim(trim($m[5]), '*');
                return 'int(' . $integrand . ',' . trim($m[6]) . ',' . trim($m[1]) . ',' . trim($upper) . ')';
            },
            $output
        );

        return preg_replace_callback(
            '/\\\\int\s*(.+?)\s*(?:\\\\[,;:!]\s*)*d\s*([a-zA-Z])\s*$/',
            static function($m) {
                return 'int(' . ltrim(trim($m[1]), '*') . ',' . trim($m[2]) . ')';
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
                return $name . '(' . trim($m[7]) . ',' . trim($m[2]) . ',' . trim($m[3]) . ',' . trim($upper) . ')';
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

    private static function normalize_function_powers(string $input): string {
        $output = $input;
        $offset = 0;
        while (preg_match(
            '/\\\\(sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|log|ln)\s*\^\s*(?:\(\s*([^()]+)\s*\)|\{\s*([^{}]+)\s*\}|([+-]?\d+))\s*/',
            $output,
            $match,
            PREG_OFFSET_CAPTURE,
            $offset
        )) {
            $start = $match[0][1];
            $cursor = $start + strlen($match[0][0]);
            $length = strlen($output);
            while ($cursor < $length && ctype_space($output[$cursor])) {
                $cursor++;
            }

            $argument = '';
            $end = $cursor;
            if ($cursor < $length && $output[$cursor] === '(') {
                $depth = 1;
                $end = $cursor + 1;
                while ($end < $length && $depth > 0) {
                    if ($output[$end] === '(') {
                        $depth++;
                    } else if ($output[$end] === ')') {
                        $depth--;
                    }
                    $end++;
                }
                if ($depth !== 0) {
                    $offset = $cursor + 1;
                    continue;
                }
                $argument = substr($output, $cursor + 1, $end - $cursor - 2);
            } else if (preg_match('/\G([A-Za-z0-9]+)/', $output, $argmatch, 0, $cursor)) {
                $argument = $argmatch[1];
                $end = $cursor + strlen($argmatch[1]);
            } else {
                $offset = $cursor + 1;
                continue;
            }

            $power = $match[2][0] !== '' ? $match[2][0]
                : ($match[3][0] !== '' ? $match[3][0] : $match[4][0]);
            $replacement = $match[1][0] . '(' . $argument . ')^(' . trim($power) . ')';
            $output = substr($output, 0, $start) . $replacement . substr($output, $end);
            $offset = $start + strlen($replacement);
        }

        return $output;
    }

    private static function normalize_variable_products(string $input): string {
        $identifiers = ['mu', 'sigma', 'alpha', 'beta', 'gamma', 'delta', 'theta', 'lambda',
            'omega', 'phi', 'psi', 'rho', 'tau', 'epsilon', 'inf', 'minf', 'and', 'not',
            'then', 'else', 'in', 'min', 'max', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
            'sinh', 'cosh', 'tanh', 'asin', 'acos', 'atan', 'log', 'ln', 'sqrt', 'exp',
            'abs', 'limit', 'diff', 'int', 'sum', 'product', 'matrix', 'determinant',
            'binomial', 'pi'];

        return preg_replace_callback('/[A-Za-z]{2,}/', static function($m) use ($identifiers) {
            return in_array(strtolower($m[0]), $identifiers, true)
                ? $m[0]
                : implode('*', str_split($m[0]));
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
        if ($input === '' || preg_match('/\band\b/', $input)) {
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
            'abs', 'limit', 'diff', 'int', 'sum', 'product', 'matrix', 'determinant', 'binomial'];

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
        $s = preg_replace('/__INTERVAL__([a-zA-Z])__([^_]+)__([^_]+)__/', '$2<=$1 and $1<=$3', $s);
        $s = preg_replace('/=\(\s*([A-Za-z0-9%+\-*\/^.\[\]\s]+(?:,[A-Za-z0-9%+\-*\/^.\[\]\s]+)+)\s*\)/', '=[$1]', $s);
        $s = preg_replace('/^\(\s*([A-Za-z0-9%+\-*\/^.\[\]\s]+(?:,[A-Za-z0-9%+\-*\/^.\[\]\s]+)+)\s*\)$/', '[$1]', $s);
        return $s;
    }
}
