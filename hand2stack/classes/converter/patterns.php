<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Names and patterns shared by the LaTeX to STACK conversion steps.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\converter;

defined('MOODLE_INTERNAL') || die();

final class patterns {
    /**
     * Words that \\operatorname{...} may name as a function. Mathpix also
     * wraps handwritten prose such as "cuz" in \\operatorname; any other
     * word is prose, never a product of single-letter variables.
     */
    public const OPERATOR_FUNCTIONS = [
        'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan',
        'arcsinh', 'arccosh', 'arctanh', 'asin', 'acos', 'atan', 'log', 'ln', 'lg', 'exp', 'det', 'sgn',
        'sign', 'signum', 'arg', 'max', 'min', 'gcd', 'lcm', 'deg', 'dim', 'ker', 'rank', 'tr', 'trace',
        'Re', 'Im', 'lim', 'mod', 'abs', 'floor', 'ceil', 'ceiling', 'erf', 'grad', 'div', 'curl',
    ];

    /** Logical connectives a handwritten line may join two relations with, in any case ("Or", "OR"). */
    public const CONNECTIVES = ['or' => 'or', 'and' => 'and', 'または' => 'or', 'かつ' => 'and'];

    /** Arrows and signs that join two statements, with the prose shown for each. */
    public const STATEMENT_JOINERS = [
        'Longleftrightarrow' => '⇔', 'Leftrightarrow' => '⇔', 'iff' => '⇔',
        'Longrightarrow' => '⇒', 'Rightarrow' => '⇒', 'implies' => '⇒',
        'therefore' => '∴', 'because' => '∵',
    ];

    /** A relation symbol: a statement such as "x>2" has one, a term such as "0 x" has none. */
    public const RELATION = '/=|<|>|\\\\(?:leqq?|geqq?|leqslant|geqslant|le|ge|neq|ne|lt|gt)(?![A-Za-z])|[≤≥≦≧≠]/u';

    /** Upright units that are unambiguous; arbitrary \\mathrm words remain OCR text. */
    public const UNIT_NAME = '(?:mm|cm|dm|km|um|nm|kg|mg|ug|mol|Hz|kHz|MHz|GHz|Pa|kPa|MPa|J|kJ|W|kW|V|mV|A|mA|K|N|C|F|Ohm|L|mL|s|min|h|m|g)';
    public const UNIT_ATOM = '\\\\mathrm\s*\{\s*~?\s*(' . self::UNIT_NAME . ')\s*\}'
        . '(?:\s*\^\s*(?:\{\s*-?\d+\s*\}|-?\d))?';

    /**
     * A unit written after a number: "2.5\\,\\mathrm{m}", "5 \\mathrm{~cm}^{2}",
     * "3 \\mathrm{~km} / \\mathrm{h}". Mathpix sets units upright like prose,
     * but after a number they are part of the quantity, not a word.
     */
    public const UNIT = '/(?<=\d)(?:\s|\\\\[,;: ]|~)*(' . self::UNIT_ATOM
        . '(?:(?:\s*(?:\/|\\\\cdot(?![A-Za-z]))\s*|\s+)' . self::UNIT_ATOM . ')*)/u';

    /** Functions whose argument handwriting often leaves unbracketed, longest names first. */
    public const BARE_ARGUMENT_FUNCTIONS = 'arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|cot|sec|csc|exp|log|ln|lg';

    /** An implicit product, kept distinct from "*" until function arguments are read. */
    public const IMPLICIT_PRODUCT = "\x03";

    /** Greek letters that may stand as a variable inside a function argument. */
    public const GREEK_LETTERS = 'alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi'
        . '|pi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega'
        . '|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega';

    /**
     * Commands that name a STACK variable or function once the backslash goes.
     * Any other command (\\cup, \\arg, \\nabla, ...) has no STACK form here and
     * keeps its backslash, so STACK rejects it visibly instead of reading it
     * as a product of letters such as c*u*p.
     */
    public const STRIPPABLE_COMMANDS = self::GREEK_LETTERS
        . '|sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|arcsin|arccos|arctan|exp|log|ln|lg|max|min|gcd|lcm|det';

    /** Multi-letter names that are STACK identifiers, never a product of letters. */
    public const IDENTIFIERS = ['mu', 'sigma', 'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
        'iota', 'kappa', 'lambda', 'nu', 'xi', 'rho', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
        'inf', 'minf', 'and', 'or', 'not', 'then', 'else', 'in', 'true', 'false', 'min', 'max',
        'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'asin', 'acos', 'atan', 'atan2',
        'log', 'ln', 'lg', 'log10', 'sqrt', 'nthroot', 'exp', 'abs', 'floor', 'ceiling', 'signum', 'mod', 'gcd', 'lcm',
        'realpart', 'imagpart', 'limit', 'diff', 'int', 'sum', 'product', 'matrix', 'determinant', 'elementp', 'binomial', 'pi'];

    /** A float in scientific notation such as 2.5e-3, which STACK reads as one number. */
    public const SCIENTIFIC = '/(?<![A-Za-z0-9.\\\\])\d+(?:\.\d+)?[eE][+-]?\d+(?![\dA-Za-z.(^])/';
}
