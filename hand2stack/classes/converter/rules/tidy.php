<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Final tidying of a converted STACK expression.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\converter\rules;

defined('MOODLE_INTERNAL') || die();

final class tidy {
    /** Drop brackets that carry no meaning and restore calls such as f(x). */
    public static function beautify(string $input): string {
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
        $s = inequality::expand_chained($s);
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
        // Parenthesised comma-separated notation may be a point, tuple or open
        // interval. Keep the delimiters instead of guessing a STACK list.
        return $s;
    }
}
