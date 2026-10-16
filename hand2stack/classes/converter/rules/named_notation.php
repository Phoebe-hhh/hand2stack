<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Notation with a single STACK spelling, and Japanese nCr / nPr.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\converter\rules;

defined('MOODLE_INTERNAL') || die();

final class named_notation {
    /**
     * Notation with one STACK spelling: \\lfloor x\\rfloor is floor(x), \\emptyset
     * is {}, \\land is and, \\mathrm{d}x is dx, \\varphi is \\phi.
     */
    public static function normalize(string $s): string {
        $s = preg_replace('/(?:\\\\(?:left|big|Big|bigg|Bigg)\s*)?\\\\lfloor(?![A-Za-z])/', '\\operatorname{floor}(', $s);
        $s = preg_replace('/(?:\\\\(?:left|big|Big|bigg|Bigg)\s*)?\\\\lceil(?![A-Za-z])/', '\\operatorname{ceiling}(', $s);
        $s = preg_replace('/(?:\\\\(?:right|big|Big|bigg|Bigg)\s*)?\\\\r(?:floor|ceil)(?![A-Za-z])/', ')', $s);
        $s = preg_replace('/\\\\(?:emptyset|varnothing)(?![A-Za-z])|∅/u', '\\{\\}', $s);
        $s = preg_replace('/\s*(?:\\\\(?:land|wedge)(?![A-Za-z])|∧)\s*/u', ' \\text{and} ', $s);
        $s = preg_replace('/\s*(?:\\\\(?:lor|vee)(?![A-Za-z])|∨)\s*/u', ' \\text{or} ', $s);
        $s = preg_replace('/\\\\(?:mathrm|operatorname|text)\s*\{\s*d\s*\}\s*(?=[A-Za-z])/', 'd', $s);
        $s = preg_replace('/\\\\var(epsilon|theta|rho|sigma|phi)(?![A-Za-z])/', '\\\\$1', $s);
        $s = preg_replace('/\\\\(?:no)?limits(?![A-Za-z])/', '', $s);
        // Maxima's names for the sign function and complex parts.
        $s = preg_replace('/(?:\\\\operatorname\s*\{\s*(?:sgn|sign)\s*\}|(?<![A-Za-z\\\\])(?:sgn|sign))\s*(?=\()/', 'signum', $s);
        $s = preg_replace('/(?:\\\\operatorname\s*\{\s*Re\s*\}|\\\\Re(?![A-Za-z]))\s*(?=\()/', 'realpart', $s);
        $s = preg_replace('/(?:\\\\operatorname\s*\{\s*Im\s*\}|\\\\Im(?![A-Za-z]))\s*(?=\()/', 'imagpart', $s);
        // log10(x) typed by a learner is the base-10 logarithm, not log(10)*x.
        return preg_replace('/(?<![A-Za-z\\\\])log10\s*(?=\()/', 'lg', $s);
    }

    /** Japanese combination/permutation notation: {}_{5}C_{2}, {}_{5}P_{2}. */
    public static function combinations(string $input): string {
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
}
