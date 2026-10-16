<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Piecewise functions written with cases or array.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\converter\rules;

use local_hand2stack\converter\stack_converter;

defined('MOODLE_INTERNAL') || die();

final class piecewise {
    /** The STACK if/elseif form of a cases or array block, or '' when $input has none. */
    public static function normalize(string $input): string {
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
                $prefix = stack_converter::normalize($prefix);
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
                    'expression' => stack_converter::normalize($expression),
                    'condition' => $condition === '' ? '' : self::condition($condition),
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

        // Every branch keeps the condition the learner wrote; only a branch
        // written without one is the else. No condition is inferred.
        $result = '';
        foreach ($branches as $index => $branch) {
            if ($branch['condition'] === '') {
                $result .= ($index === 0 ? '' : ' else ') . $branch['expression'];
            } else {
                $result .= ($index === 0 ? 'if ' : ' elseif ') . $branch['condition'] . ' then ' . $branch['expression'];
            }
        }

        return $prefix . $result;
    }

    /**
     * A branch condition with its words kept as words: each \\text{...} becomes
     * a STACK string and the maths around it is converted, so
     * "\\text{otherwise}" is "otherwise" (quoted), never an assumed else, and
     * "\\text{if } x>0" keeps both "if" and x>0.
     */
    private static function condition(string $condition): string {
        if (!preg_match('/\\\\(?:text|mathrm)\s*\{/', $condition)) {
            return stack_converter::normalize($condition);
        }
        $condition = trim($condition);
        $wrapped = preg_match('/^\((.*)\)$/s', $condition, $inner);
        $pieces = preg_split('/\\\\(?:text|mathrm)\s*\{([^{}]*)\}/u', $wrapped ? $inner[1] : $condition, -1,
            PREG_SPLIT_DELIM_CAPTURE);
        $out = [];
        foreach ($pieces as $index => $piece) {
            $piece = trim($piece);
            if ($piece === '') {
                continue;
            }
            $out[] = $index % 2 === 1 ? '"' . str_replace('"', "'", $piece) . '"' : stack_converter::normalize($piece);
        }
        $result = implode(' ', array_filter($out, 'strlen'));
        return $wrapped ? '(' . $result . ')' : $result;
    }
}
