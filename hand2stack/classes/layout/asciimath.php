<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Rows in the AsciiMath Mathpix returns for one formula.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\layout;

defined('MOODLE_INTERNAL') || die();

final class asciimath {
    /**
     * Split Mathpix's matrix-shaped multi-row value without changing a row.
     *
     * A handwritten aligned block is returned as
     * `{:[first row],[second row]:}`. A `],[` inside quoted prose or nested
     * brackets is content, not a row boundary.
     *
     * @return string[] The original AsciiMath rows, trimmed.
     */
    public static function rows(string $ascii): array {
        $ascii = trim($ascii);
        if ($ascii === '') {
            return [];
        }
        if (!preg_match('/^\{:\[(.*)\]:\}$/s', $ascii, $match)) {
            return [$ascii];
        }

        $rows = [];
        $row = '';
        $depth = 0;
        $quoted = false;
        $inner = $match[1];
        for ($i = 0, $length = strlen($inner); $i < $length; $i++) {
            $char = $inner[$i];
            if ($char === '"') {
                $quoted = !$quoted;
            } else if (!$quoted && strpos('([{', $char) !== false) {
                $depth++;
            } else if (!$quoted && strpos(')]}', $char) !== false) {
                if ($depth === 0 && substr($inner, $i, 3) === '],[') {
                    $rows[] = trim($row);
                    $row = '';
                    $i += 2;
                    continue;
                }
                $depth--;
            }
            $row .= $char;
        }
        $rows[] = trim($row);
        return array_values(array_filter($rows, static function(string $value): bool {
            return $value !== '';
        }));
    }
}
