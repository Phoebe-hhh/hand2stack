<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Rows of a multi-row block, and piecewise functions laid out a row per branch.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\layout;

use local_hand2stack\converter\stack_converter;
use local_hand2stack\converter\statement_splitter;

defined('MOODLE_INTERNAL') || die();

final class piecewise_rows {
    /**
     * The review row of one piecewise branch: each piece converted alone,
     * words kept as words. The first row carries the learner's brace.
     */
    public static function row_line(array $pieces, bool $first): array {
        $display = $first ? [['type' => 'text', 'text' => '{ ']] : [];
        $maths = [];
        $stacks = [];
        $freetext = [];
        $source = [];
        foreach ($pieces as [$type, $text]) {
            if ($type === 'prose') {
                $display[] = ['type' => 'text', 'text' => $text];
                $freetext[] = $text;
                $source[] = '\\text{' . $text . '}';
                continue;
            }
            $stack = stack_converter::normalize($text);
            $display[] = ['type' => 'math', 'latex' => $text];
            $maths[] = $text;
            $stacks[] = $stack;
            $freetext[] = '`' . $stack . '`';
            $source[] = $text;
        }
        $line = line_builder::candidate_line(implode(' \\quad ', $source), implode(', ', $maths), $display);
        $line['stack'] = $line['ascii'] = $line['normalized'] = implode(',', $stacks);
        $line['freetextrow'] = ($first ? '{ ' : '') . implode(' ', $freetext);
        return $line;
    }

    /**
     * Rows of a multi-row body, split at "\\\\" or a newline but never inside
     * a nested \\begin...\\end block: handwriting wraps the whole page in one
     * array, and a piecewise function inside it is still one block.
     */
    public static function split_rows(string $body): array {
        $rows = [];
        $start = 0;
        $depth = 0;
        for ($i = 0, $length = strlen($body); $i < $length; $i++) {
            if (substr($body, $i, 7) === '\\begin{') {
                $depth++;
            } else if (substr($body, $i, 5) === '\\end{') {
                $depth--;
            } else if ($depth === 0 && ($body[$i] === "\n" || substr($body, $i, 2) === '\\\\')) {
                $rows[] = substr($body, $start, $i - $start);
                $i += $body[$i] === "\n" ? 0 : 1;
                $start = $i + 1;
            }
        }
        $rows[] = substr($body, $start);
        return $rows;
    }

    /**
     * The branches of a brace block whose rows hold a value and a condition
     * ("x^2 & x>0", "0 & \\text{otherwise}", or handwriting's
     * "y=x^2+1 \\quad x>1"), and the maths before the brace ("f(x)="). Each
     * row is its pieces in the order written: a "&" column, or a statement
     * split_statements() finds, as ['math'|'prose', text]. Null for anything
     * else, such as a system of equations with one statement per row, which
     * stays one list.
     *
     * @return array{0:string,1:array<int,array<int,array{0:string,1:string}>>}|null
     */
    public static function parse(string $part): ?array {
        if (!preg_match('/^([\s\S]*?)(\\\\left\s*\\\\(?:\{|lbrace)\s*)?\\\\begin\{(cases|array)\}(?:\{[^{}]*\})?([\s\S]*)\\\\end\{\3\}\s*(?:\\\\right\s*\.)?\s*$/',
                trim($part), $match)) {
            return null;
        }
        if ($match[3] === 'array' && $match[2] === '') {
            return null;
        }
        $rows = [];
        $conditional = false;
        foreach (self::split_rows($match[4]) as $row) {
            $pieces = [];
            foreach (explode('&', $row) as $column) {
                $column = trim(preg_replace('/^(?:\s|\\\\q?quad)+|(?:\s|,|\\\\q?quad)+$/', '', $column));
                if ($column === '') {
                    continue;
                }
                if (preg_match('/^\\\\(?:text|mathrm)\s*\{([^{}]*)\}$/u', $column, $words)) {
                    // A column of words alone ("otherwise") is prose.
                    $pieces[] = ['prose', trim($words[1])];
                    continue;
                }
                foreach (statement_splitter::split_statements($column) as $segment) {
                    if (trim($segment[1]) !== '') {
                        $pieces[] = [$segment[0], trim($segment[1])];
                    }
                }
            }
            if (!$pieces) {
                continue;
            }
            $conditional = $conditional || count($pieces) > 1;
            $rows[] = $pieces;
        }
        return $conditional ? [trim($match[1]), $rows] : null;
    }
}
