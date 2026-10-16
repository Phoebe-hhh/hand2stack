<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Matrices, determinants and systems of equations.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\converter\rules;

use local_hand2stack\converter\stack_converter;

defined('MOODLE_INTERNAL') || die();

final class matrix {
    /** The STACK form of the first matrix block in $input, or '' when there is none. */
    public static function normalize(string $input): string {
        if (!preg_match('/\\\\begin\{(array|pmatrix|bmatrix|matrix|vmatrix)\}(?:\{[^}]*\})?([\s\S]*?)\\\\end\{\1\}/', $input, $match)) {
            return '';
        }

        $position = (int) strpos($input, $match[0]);
        $before = substr($input, 0, $position);
        // Count only grouping braces; \\{ in "\\left\\{" opens a system, not a group.
        if (preg_match_all('/(?<!\\\\)\{/', $before) > preg_match_all('/(?<!\\\\)\}/', $before)) {
            // A matrix inside a group, e.g. \\frac{\\begin{pmatrix}...\\end{pmatrix}}{2}:
            // convert the matrix alone and the expression around a placeholder.
            $token = '§M' . substr_count($input, '§M') . '§';
            $core = self::normalize($match[0]);
            $rest = stack_converter::normalize(substr_replace($input, $token, $position, strlen($match[0])));
            return $core === '' || $rest === '' ? '' : strtr($rest, [$token => $core]);
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
                return stack_converter::normalize($value);
            }, $columns);
            $rows[] = '[' . implode(',', $columns) . ']';
        }

        if (!$rows) {
            return '';
        }

        $after = substr($input, $position + strlen($match[0]));
        $opener = '/(?:\\\\left\s*)?(?:\(|\[|\||\\\\\{|\\\\vert|\\\\lvert)\s*$/';
        $closer = '/^\s*(?:\\\\right\s*)?(?:\)|\]|\||\.|\\\\\}|\\\\vert|\\\\rvert)/';
        $prefix = trim(preg_replace($opener, '', $before));
        $suffix = trim(preg_replace($closer, '', $after));
        // \det\begin{pmatrix}...\end{pmatrix} is the determinant of the matrix.
        $det = '/\\\\(?:det(?![A-Za-z])|operatorname\s*\{\s*det\s*\})\s*$/';
        $determinant = (bool)preg_match($det, $prefix);
        $prefix = trim(preg_replace($det, '', $prefix));
        $wrap = static function(string $core) use ($prefix, $suffix, $determinant): string {
            $core = $determinant ? 'determinant(' . $core . ')' : $core;
            $head = $prefix === '' ? '' : stack_converter::normalize($prefix);
            $tail = $suffix === '' ? '' : stack_converter::normalize($suffix);
            // A factor written next to the matrix multiplies it: 2\begin{pmatrix}..
            $head .= preg_match('/[A-Za-z0-9)\]]$/', $head) ? '*' : '';
            $tail = (preg_match('/^[A-Za-z0-9(%]/', $tail) ? '*' : '') . $tail;
            return $head . $core . $tail;
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
}
