<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Notation kept as written: prime derivatives in Free text, units after a
 * number, and notation that has no STACK form here.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\converter;

defined('MOODLE_INTERNAL') || die();

final class notation_keeper {
    /** True while converting Free-text working, which keeps notation as written. */
    private static bool $keepwritten = false;

    /**
     * Run a conversion that keeps notation as the learner wrote it. Free-text
     * working is read, not graded, so f'(x) and f'(2) stay alike instead of
     * one becoming diff(f(x),x), and a row that continues the one above
     * keeps its leading "=".
     */
    public static function keeping_as_written(callable $convert) {
        $previous = self::$keepwritten;
        self::$keepwritten = true;
        try {
            return $convert();
        } finally {
            self::$keepwritten = $previous;
        }
    }

    /** Whether the current conversion keeps notation as written. */
    public static function keeps_as_written(): bool {
        return self::$keepwritten;
    }

    /** Byte ranges of the units in $latex, so prose detection can skip them. */
    public static function unit_spans(string $latex): array {
        if (!preg_match_all(patterns::UNIT, $latex, $matches, PREG_OFFSET_CAPTURE)) {
            return [];
        }
        return array_map(static function(array $match): array {
            return [$match[1], $match[1] + strlen($match[0])];
        }, $matches[1]);
    }

    /** The ASCII spelling of a matched unit: \\mathrm{~km} / \\mathrm{h} is km/h. */
    public static function unit_ascii(string $unit): string {
        // Adjacent upright units are factors: m s^-1, not ms^-1.
        $unit = preg_replace('/\}\s+(?=\\\\mathrm\s*\{)/', '}*', $unit);
        // \cdot first: once \mathrm{s} is s, "\cdot s" would read as \cdots.
        $unit = preg_replace('/\\\\cdot(?![A-Za-z])/', '*', $unit);
        $unit = preg_replace('/\\\\mathrm\s*\{\s*~?\s*([^{}]*?)\s*\}/', '$1', $unit);
        $unit = preg_replace('/\^\s*\{\s*(-?\d+)\s*\}/', '^$1', $unit);
        return preg_replace('/\s+/', '', $unit);
    }

    /**
     * Notation whose meaning has no STACK form here, kept exactly as written
     * so STACK rejects it visibly instead of accepting a different value: a
     * possible cross product (the whole expression, when either side of a
     * \\times is marked as a vector), a mixed number 1\\frac{1}{2} (not
     * 1*1/2), and an accent such as \\bar{z}, \\overline{z} or 0.\\dot{3}
     * (not z or 0.3).
     *
     * @param array<string,string> $kept placeholder => original text
     */
    public static function keep_unconvertible(string $s, array &$kept): string {
        $keep = static function(string $text) use (&$kept): string {
            $token = '§K' . count($kept) . '§';
            $kept[$token] = $text;
            return $token;
        };
        $vector = '\\\\(?:vec|mathbf|boldsymbol)\s*(?:\{[^{}]*\}|[A-Za-z])';
        // If either side is explicitly a vector, multiplication may actually
        // be a cross product. Preserve the OCR expression instead of guessing.
        if (preg_match('/(?:' . $vector . '\s*(?:\\\\times(?![A-Za-z])|×)|(?:\\\\times(?![A-Za-z])|×)\s*' . $vector . ')/u', $s)) {
            return $keep($s);
        }
        $s = preg_replace_callback(
            '/(?<![A-Za-z0-9.^_{}\\\\§])\d+\s*\\\\[dt]?frac\s*\{\s*\d+\s*\}\s*\{\s*\d+\s*\}/',
            static function(array $m) use ($keep): string {
                return $keep($m[0]);
            }, $s);

        $offset = 0;
        while (preg_match('/\\\\(?:hat|widehat|bar|overline|dot|ddot)(?![A-Za-z])\s*/', $s, $match,
                PREG_OFFSET_CAPTURE, $offset)) {
            $start = $match[0][1];
            $cursor = $start + strlen($match[0][0]);
            if (($s[$cursor] ?? '') === '{') {
                $close = brackets::closing_brace($s, $cursor);
                if ($close === null) {
                    $offset = $cursor;
                    continue;
                }
                $end = $close + 1;
            } else if (preg_match('/\G(?:\\\\[A-Za-z]+|[A-Za-z0-9])/', $s, $atom, 0, $cursor)) {
                $end = $cursor + strlen($atom[0]);
            } else {
                $offset = $cursor;
                continue;
            }
            $token = $keep(substr($s, $start, $end - $start));
            $s = substr($s, 0, $start) . $token . substr($s, $end);
            $offset = $start + strlen($token);
        }
        return $s;
    }
}
