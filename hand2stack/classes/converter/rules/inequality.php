<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Chained inequalities.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\converter\rules;

defined('MOODLE_INTERNAL') || die();

final class inequality {
    /** "a<x<b" as "a<x and x<b". */
    public static function expand_chained(string $input): string {
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
}
