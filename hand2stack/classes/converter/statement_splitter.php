<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Split a formula row into its statements and the prose between them.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\converter;

defined('MOODLE_INTERNAL') || die();

final class statement_splitter {
    /**
     * "x_\\text{max}" is the label of x, written without the braces of
     * "x_{\\text{max}}"; brace it so the label is not read as prose.
     */
    public static function brace_script_labels(string $latex): string {
        return preg_replace('/([_^])\s*(\\\\(?:text|mathrm)\s*\{[^{}]*\})/u', '$1{$2}', $latex);
    }

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
        $latex = self::brace_script_labels($latex);
        $connectives = '/^(?:' . implode('|', array_map('preg_quote', array_keys(patterns::CONNECTIVES))) . ')$/iu';
        $chunks = [];
        $start = 0;
        $depth = 0;
        $length = strlen($latex);
        $units = notation_keeper::unit_spans($latex);
        for ($i = 0; $i < $length; $i++) {
            $char = $latex[$i];
            foreach ($units as [$from, $to]) {
                if ($i === $from) {
                    // A unit after a number is part of the quantity, not prose.
                    $i = $to - 1;
                    continue 2;
                }
            }
            if ($char === '\\' && $depth === 0
                    && preg_match('/\G\\\\begin\s*\{([A-Za-z]+\*?)\}/', $latex, $environment, 0, $i)) {
                // A cases or array block is one statement; the \\text{otherwise}
                // of a branch is its condition, not prose between statements.
                $end = strpos($latex, '\\end{' . $environment[1] . '}', $i);
                if ($end !== false) {
                    $i = $end + strlen('\\end{' . $environment[1] . '}') - 1;
                    continue;
                }
            }
            if ($char === '{') {
                $depth++;
            } else if ($char === '}') {
                $depth--;
            } else if ($depth === 0 && ($char === '\\' || $char === "\xE2")
                    && preg_match('/\G(?:\\\\(' . implode('|', array_keys(patterns::STATEMENT_JOINERS))
                        . ')(?![A-Za-z])|[⇒⇔⟹⟺∴∵])/u', $latex, $match, 0, $i)) {
                // "x^2=4 \Leftrightarrow x=\pm 2" states two things; the
                // arrow is not a factor of a product.
                $chunks[] = ['math', substr($latex, $start, $i - $start)];
                $chunks[] = ['prose', isset($match[1]) && $match[1] !== ''
                    ? patterns::STATEMENT_JOINERS[$match[1]] : strtr($match[0], ['⟹' => '⇒', '⟺' => '⇔'])];
                $i += strlen($match[0]) - 1;
                $start = $i + 1;
            } else if ($char === '\\' && $depth === 0
                    && preg_match('/\G\\\\(text|mathrm)\s*\{\s*([^{}]*?)\s*\}/u', $latex, $match, 0, $i)
                    && !preg_match($connectives, $match[2])
                    && ($match[1] === 'text'
                        // Mathpix marks prose as \text: keep it as written, even a
                        // misread word such as "f.)", except the constants e and i.
                        ? trim($match[2]) !== '' && !preg_match('/^[ei]$/', $match[2])
                        : preg_match('/\pL.*\pL/u', $match[2]))) {
                $match[1] = $match[2];
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
                return trim($part, " \t,.;") !== '' && !preg_match(patterns::RELATION, $part);
            });
            foreach ($complete ? $parts : [$text] as $part) {
                // LaTeX spacing (\, \; ~) at a prose boundary is layout; without
                // this, "x=3\, \text{so}" keeps "x=3\" and calls "," prose.
                $part = preg_replace('/^(?:\s|\\\\[,;:! ]|~)+|(?:\s|\\\\[,;:! ]|~)+$/', ' ', $part);
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
        $textprose = count($chunks) > 1 && count($maths) > 0;
        return count($maths) > 1 || $textprose ? $segments : [['math', $latex]];
    }

    /** Whether a formula states a relation (=, <, \\leq, ...) rather than a term. */
    public static function has_relation(string $latex): bool {
        return (bool)preg_match(patterns::RELATION, $latex);
    }

    /** The STACK connective ("or"/"and") a piece of prose is exactly, or null. */
    public static function connective(string $text): ?string {
        return patterns::CONNECTIVES[strtolower(trim($text))] ?? null;
    }

    /** Turn \\operatorname{word} into \\text{word} unless word is a known function. */
    public static function prose_operatornames(string $input): string {
        return preg_replace_callback('/\\\\operatorname\s*\{\s*([A-Za-z]{2,})\s*\}/u', static function(array $match): string {
            return in_array($match[1], patterns::OPERATOR_FUNCTIONS, true) ? $match[0] : '\\text{' . $match[1] . '}';
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
    public static function join_connected_relations(string $input): ?string {
        $words = implode('|', array_map('preg_quote', array_keys(patterns::CONNECTIVES)));
        $separator = '/(?:\s|\\\\q?quad|\\\\[,;: ])*\\\\(?:text|mathrm)\s*\{\s*(' . $words . ')\s*\}(?:\s|\\\\q?quad|\\\\[,;: ])*/iu';
        if (!preg_match_all($separator, $input, $matches)) {
            return null;
        }
        $parts = preg_split($separator, $input);
        $connectives = array_map(static function(string $word): string {
            return patterns::CONNECTIVES[strtolower($word)];
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
}
