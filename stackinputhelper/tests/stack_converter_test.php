<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * tests stack converter test.php for STACK Input Helper.
 *
 * @package    local_stackinputhelper
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_stackinputhelper;

use local_stackinputhelper\local\mathpix_client;
use local_stackinputhelper\local\stack_converter;

defined('MOODLE_INTERNAL') || die();

final class stack_converter_test extends \advanced_testcase {
    /**
     * @dataProvider normalization_cases
     */
    public function test_normalize_selection(string $latex, string $expected): void {
        $this->assertSame($expected, stack_converter::normalize_selection($latex));
    }

    public static function normalization_cases(): array {
        return [
            'nested fraction' => ['\\frac{x^{2}+2 x+1}{x+1}', '(x^2+2*x+1)/(x+1)'],
            'fraction inside square root' => [
                '\\sqrt{\\frac{x+1}{x-1}}',
                'sqrt((x+1)/(x-1))',
            ],
            'square root inside fraction' => [
                '\\frac{\\sqrt{x^2+1}}{e^{x}+1}',
                'sqrt(x^2+1)/(%e^x+1)',
            ],
            'compound fraction' => [
                '\\frac{\\frac{x}{y}+1}{\\frac{x}{y}-1}',
                '(x/y+1)/(x/y-1)',
            ],
            'power base' => ['(x+1)^{2}', '(x+1)^2'],
            'root' => ['\\sqrt[4]{x+1}', '(x+1)^(1/4)'],
            'trigonometric power' => ['\\cos ^{2} x+\\sin ^{2} x', 'cos(x)^2+sin(x)^2'],
            'trigonometric power without spaces' => [
                '\\sin^2x+\\cos^2x',
                'sin(x)^2+cos(x)^2',
            ],
            'trigonometric power with nested argument' => [
                '\\log\\left(1+\\sqrt{1+\\sin^2\\left(\\frac{\\pi x}{2}\\right)}\\right)',
                'log(1+sqrt(1+sin((%pi*x)/2)^2))',
            ],
            'inverse trigonometric fraction' => ['\\tan ^{-1} \\frac{x}{2}', 'atan(x/2)'],
            'logarithm base' => ['\\log _{10} x', 'log(x)/log(10)'],
            'text e constant' => ['\\text { e }', '%e'],
            'text i constant' => ['\\text { i }', '%i'],
            'absolute value' => ['\\left|x^{2}-1\\right|', 'abs(x^2-1)'],
            'chained inequality' => ['0<x<1', '0<x and x<1'],
            'derivative' => ['\\frac{d}{d x} x^{2}', 'diff(x^2,x)'],
            'derivative quotient' => ['\\frac{dy}{dx}', 'diff(y,x)'],
            'second derivative equation' => [
                '\\frac{d^2y}{dx^2}+3\\frac{dy}{dx}+2y=0',
                'diff(y,x,2)+3*diff(y,x)+2*y=0',
            ],
            'definite integral' => ['\\int_{0}^{1} x^{2} d x', 'int(x^2,x,0,1)'],
            'definite integral without spaces' => [
                '\\int_{0}^{1}x^2e^{-x}\\,dx',
                'int(x^2*%e^(-x),x,0,1)',
            ],
            'definite integral compact bounds' => [
                '\\int_0^1(3x^2+2x+1)\\,dx',
                'int((3*x^2+2*x+1),x,0,1)',
            ],
            'limit' => ['\\lim _{x \\rightarrow 0} \\frac{\\sin x}{x}', 'limit(sin(x)/x,x,0)'],
            'sum' => ['\\sum_{k=0}^{n} x^{k}', 'sum(x^k,k,0,n)'],
            'sum without space before body' => [
                '\\sum_{k=1}^{n}\\frac{1}{k^2}',
                'sum(1/k^2,k,1,n)',
            ],
            'product' => ['\\prod_{k=1}^{n} x_{k}', 'product(x[k],k,1,n)'],
            'product OCR as pi' => ['\\pi_{i=1}^{n} i', 'product(i,i,1,n)'],
            'vector' => ['(1,2,3)', '[1,2,3]'],
            'dot product' => ['\\vec{u} \\cdot \\vec{v}', 'u.v'],
            'dense implicit multiplication' => [
                '3x(x+1)(x-2)+2\\pi r^2h-4ab\\sqrt{c}',
                '3*x*(x+1)*(x-2)+2*%pi*r^2*h-4*a*b*sqrt(c)',
            ],
            'multivariable products' => [
                '\\frac{ax^2+bxy+cy^2}{\\sqrt{a^2+b^2+c^2}}',
                '(a*x^2+b*x*y+c*y^2)/(sqrt(a^2+b^2+c^2))',
            ],
            'two solutions' => ['x=1,2', '[1,2]'],
            'therefore two solutions' => ['\\therefore x=2,3', '[2,3]'],
            'trailing restriction' => ['x-1,\\qquad x\\ne1', 'x-1'],
            'not equal' => ['x \\neq 0', 'not(x=0)'],
            'English prose and unmatched math delimiter' => [
                'Therefore, $x=\\frac{\\pi}{2}',
                'x=(%pi)/2',
            ],
            'Japanese prose and yen-like delimiter' => [
                '解答: ¥\\frac{x+1}{x-1}',
                '(x+1)/(x-1)',
            ],
            'Japanese OCR confuses x equals minus' => [
                '答えはメニー1たす',
                'x=-1',
            ],
        ];
    }

    public function test_mixed_prose_line_separates_text_from_selectable_math(): void {
        $lines = mathpix_client::build_lines('Therefore, $x=\\frac{\\pi}{2}');

        $this->assertCount(1, $lines);
        $this->assertSame('x=\\frac{\\pi}{2}', $lines[0]['math']);
        $this->assertSame('x=(%pi)/2', $lines[0]['stack']);
        $this->assertSame('text', $lines[0]['display_parts'][0]['type']);
        $this->assertSame('math', $lines[0]['display_parts'][1]['type']);
        $this->assertSame('x=\\frac{\\pi}{2}', $lines[0]['display_parts'][1]['latex']);
    }

    public function test_japanese_answer_line_repairs_ocr_before_token_selection(): void {
        $lines = mathpix_client::build_lines('答えはメニー1たす');

        $this->assertCount(1, $lines);
        $this->assertSame('答えはx=-1です', $lines[0]['display']);
        $this->assertSame('x=-1', $lines[0]['math']);
        $this->assertSame('x=-1', $lines[0]['stack']);
        $this->assertSame([
            ['type' => 'text', 'text' => '答えは'],
            ['type' => 'math', 'latex' => 'x=-1'],
            ['type' => 'text', 'text' => 'です'],
        ], $lines[0]['display_parts']);
    }

    public function test_aligned_continuation_drops_leading_equals(): void {
        $lines = mathpix_client::build_lines(
            '\\begin{aligned}f(x)&=\\frac{x^2+2x+1}{x+1}\\\\&=x+1\\end{aligned}'
        );

        $this->assertSame('f(x)=(x^2+2*x+1)/(x+1)', $lines[0]['stack']);
        $this->assertSame('x+1', $lines[1]['stack']);
    }

    public function test_equation_system_adds_complete_assignment_summary(): void {
        $lines = mathpix_client::build_lines(
            '\\begin{aligned}2x+3y&=7\\\\y&=1\\\\x&=2\\end{aligned}'
        );

        $last = $lines[count($lines) - 1];
        $this->assertTrue($last['synthetic']);
        $this->assertSame('[x=2,y=1]', $last['stack']);
    }

    /**
     * @dataProvider structured_line_cases
     */
    public function test_build_structured_lines(string $latex, string $expected): void {
        $lines = mathpix_client::build_lines($latex);
        $this->assertNotEmpty($lines);
        $this->assertSame($expected, $lines[count($lines) - 1]['stack']);
    }

    public static function structured_line_cases(): array {
        return [
            'matrix' => [
                "\\left(\\begin{array}{ll}\n1 & 2 \\\\\n3 & 4\n\\end{array}\\right)",
                'matrix([1,2],[3,4])',
            ],
            'matrix with nested expressions' => [
                "\\begin{pmatrix}\\frac{x+1}{x-1} & \\sqrt{y} \\\\\n2x & e^x\\end{pmatrix}",
                'matrix([(x+1)/(x-1),sqrt(y)],[2*x,%e^x])',
            ],
            'piecewise' => [
                "f(x)=\\left\\{\\begin{array}{ll}\n0, & x<0 \\\\\n1, & x \\geqslant 0\n\\end{array}\\right.",
                'f(x)=if x<0 then 0 else 1',
            ],
        ];
    }
}
