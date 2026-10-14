<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * tests stack converter test.php for Hand2STACK.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack;

use local_hand2stack\local\mathpix_client;
use local_hand2stack\local\stack_converter;

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
            'fraction in an exponent inside a fraction' => [
                '\\frac{x e^{-\\frac{x}{2}}}{\\sqrt{x^{2}+1}}-\\frac{x \\sqrt{x^{2}+1} \\cdot e^{-\\frac{x}{2}}}{2}',
                '(x*%e^(-x/2))/(sqrt(x^2+1))-(x*sqrt(x^2+1)*%e^(-x/2))/(2)',
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
            'logarithm base with nested argument' => [
                '\\log _{2}(x(x-2))=3',
                '(log(x*(x-2))/log(2))=3',
            ],
            'logarithm base with left-right nested argument' => [
                '\\log_{3}\\left((x+1)(x-1)\\right)',
                '(log((x+1)*(x-1))/log(3))',
            ],
            'text e constant' => ['\\text { e }', '%e'],
            'text i constant' => ['\\text { i }', '%i'],
            'absolute value' => ['\\left|x^{2}-1\\right|', 'abs(x^2-1)'],
            'chained inequality' => ['0<x<1', '0<x and x<1'],
            'numbered result label' => ['1. f(2)=1+2\\sqrt{2}', 'f(2)=1+2*sqrt(2)'],
            'exact value followed by decimal approximation' => [
                'g(1)=2+\\frac{1}{\\sqrt{2}}\\approx2.71',
                'g(1)=2+1/sqrt(2)',
            ],
            'approximate assignment' => ['x\\approx3.83', 'x=3.83'],
            'short LaTeX inequality commands' => ['1\\le x\\lt3', '1<=x and x<3'],
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
            'multiplication commands' => ['2 \\cdot 3+a \\times b-6 \\div 2', '2*3+a*b-6/2'],
            // \cdots is an ellipsis, not \cdot followed by "s".
            'ellipsis is not a product' => ['a^{2}-(a+2)>0 \\cdots', 'a^2-(a+2)>0\\cdots'],
            'not equal commands' => ['x \\neq 1 \\quad y \\ne 2', 'not(x=1),not(y=2)'],
            // Longer commands that merely start with \ne or \to stay unknown.
            'negation is not not-equal' => ['\\neg p', '\\neg*p'],
            'vert commands' => ['\\lvert x \\rvert+\\vert y \\vert', 'abs(x)+abs(y)'],
            'transpose is not an arrow' => ['A^{\\top}', 'A^(\\top)'],
            'dense implicit multiplication' => [
                '3x(x+1)(x-2)+2\\pi r^2h-4ab\\sqrt{c}',
                '3*x*(x+1)*(x-2)+2*%pi*r^2*h-4*a*b*sqrt(c)',
            ],
            'multivariable products' => [
                '\\frac{ax^2+bxy+cy^2}{\\sqrt{a^2+b^2+c^2}}',
                '(a*x^2+b*x*y+c*y^2)/(sqrt(a^2+b^2+c^2))',
            ],
            'two solutions keep their variable' => ['x=1,2', 'x=1,2'],
            'therefore two solutions' => ['\\therefore x=2,3', 'x=2,3'],
            // A trailing condition is the learner's; it is never dropped as a domain restriction.
            'trailing restriction is kept' => ['x-1,\\qquad x\\ne1', 'x-1,x#1'],
            'second not-equal is kept' => ['y=2, x \\neq 1', 'y=2,x#1'],
            'not equal' => ['x \\neq 0', 'not(x=0)'],
            'English prose and unmatched math delimiter' => [
                'Therefore, $x=\\frac{\\pi}{2}',
                'x=(%pi)/2',
            ],
            'Japanese prose and yen-like delimiter' => [
                '解答: ¥\\frac{x+1}{x-1}',
                '(x+1)/(x-1)',
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

    public function test_nested_math_delimiters_are_removed_from_structured_lines(): void {
        $lines = mathpix_client::build_lines('\\(\\(x=9\\)\\)');

        $this->assertCount(1, $lines);
        $this->assertSame('x=9', $lines[0]['latex']);
        $this->assertSame('x=9', $lines[0]['math']);
        $this->assertSame('x=9', $lines[0]['display_parts'][0]['latex']);
    }

    /**
     * Mathpix decides what is prose: a document row without formula
     * delimiters is text, shown as recognized and never guessed into maths.
     */
    public function test_document_rows_outside_formula_delimiters_are_text(): void {
        $lines = mathpix_client::build_document_lines(
            "(日)\nFor the lugarithms to be defined,\n\$x>0\$\nSince\nthe larger one is \$x=3"
        );

        $this->assertSame(['text', 'text', 'condition', 'text', 'equation'], array_column($lines, 'type'));
        $this->assertSame('For the lugarithms to be defined,', $lines[1]['display']);
        $this->assertSame('', $lines[1]['stack']);
        $this->assertSame([['type' => 'text', 'text' => 'For the lugarithms to be defined,']], $lines[1]['display_parts']);
        $this->assertSame('', $lines[3]['stack']);
        // Mathpix left the closing "$" off; its opening "$" still starts the formula.
        $this->assertSame('x=3', $lines[4]['stack']);
        $this->assertSame('text', $lines[4]['display_parts'][0]['type']);

        // A Japanese row Mathpix read as text stays text: no OCR repair is guessed.
        $japanese = mathpix_client::build_document_lines('答えはメニー1たす');
        $this->assertSame('text', $japanese[0]['type']);
        $this->assertSame('', $japanese[0]['stack']);
    }

    /** Handwriting wraps every row in one inline array; each row is still its own line. */
    public function test_inline_multirow_block_keeps_its_rows(): void {
        $lines = mathpix_client::build_document_lines('\\( \\begin{array}{l}4 x-7=2 x+9 \\\\ 2 x=16 \\\\ x=8\\end{array} \\)');

        $this->assertSame(['4*x-7=2*x+9', '2*x=16', 'x=8'], array_column($lines, 'stack'));
    }

    /** A row keeps every formula it holds, in order; none is chosen as the answer. */
    public function test_row_keeps_all_of_its_formulas(): void {
        $lines = mathpix_client::build_document_lines("\\(a<-2\\), \\(2<a\\)\n\\(x>2\\) なので \\(x=4\\)");
        $this->assertSame(['a<-2,2<a', 'x>2,x=4'], array_column($lines, 'stack'));
    }

    /** Mathpix may answer 200 with an error; that is a failed request, not an empty result. */
    public function test_mathpix_error_in_a_successful_response_fails(): void {
        $parse = new \ReflectionMethod(mathpix_client::class, 'parse_response');
        $this->expectException(\moodle_exception::class);
        $this->expectExceptionMessage(get_string('mathpixrequestfailed', 'local_hand2stack'));
        $parse->invoke(null, json_encode(['error' => 'Image too large']), 0, '', 200);
    }

    /** An inequation is a condition, and an approximation's normalized value is its STACK value. */
    public function test_inequation_and_approximation_rows(): void {
        $lines = mathpix_client::build_lines('x \\neq 1');
        $this->assertSame('condition', $lines[0]['type']);

        $lines = mathpix_client::build_lines('x \\approx 2.71.');
        $this->assertSame(['x=2.71', 'x=2.71', 'approximation'],
            [$lines[0]['stack'], $lines[0]['normalized'], $lines[0]['type']]);
    }

    /** Free text numbers only kept rows, drops the filename header, and keeps spaces around prose. */
    public function test_freetext_numbering_filename_and_prose_spacing(): void {
        $doc = "IMG_01.PNG\nSolve.\n\\[\\begin{aligned}1.&\\ x=1 \\\\\n2.&\\ y=2\\end{aligned}\\]\nso \\(x=1\\) and then \\(y=2\\)";
        $this->assertSame("Solve.\n`1. x=1`\n`2. y=2`\nso `x=1` and then `y=2`", mathpix_client::build_freetext($doc));

        $lines = mathpix_client::build_document_lines($doc);
        $this->assertSame(' and then ', $lines[count($lines) - 1]['display_parts'][2]['text']);
    }

    /** A row starting with a decimal keeps it; only an item number such as "1." or "2)" is removed. */
    public function test_leading_decimal_is_not_an_item_number(): void {
        $lines = mathpix_client::build_document_lines("\\[\\begin{aligned}1.5 x&=3 \\\\ x&=2\\end{aligned}\\]");
        $this->assertSame(['1.5*x=3', 'x=2'], array_column($lines, 'stack'));

        $lines = mathpix_client::build_document_lines("\\[\\begin{aligned}1. 2 x&=4 \\\\ 2) x&=2\\end{aligned}\\]");
        $this->assertSame(['2*x=4', 'x=2'], array_column($lines, 'stack'));
    }

    public function test_freetext_preserves_prose_paragraphs_and_marks_only_math(): void {
        $text = "First explain the method.\n\nTherefore, \\(x=\\frac{3}{2}\\), so the result follows.";

        $this->assertSame(
            "First explain the method.\n\nTherefore, `x=3/2`, so the result follows.",
            mathpix_client::build_freetext($text)
        );
    }

    public function test_freetext_uses_ascii_fallback_without_losing_lines(): void {
        $this->assertSame("`x=1\ny=2`", mathpix_client::build_freetext('', "x=1\ny=2"));
    }

    public function test_freetext_converts_aligned_math_by_row_without_leaking_layout_commands(): void {
        $text = "For \\(theta=1\\)\n"
            . "\\[\\begin{aligned}g(1)&=2\\sin(\\pi/2)^2+1/\\sqrt{2}\\\\"
            . "&=2+1/\\sqrt{2}\\\\&\\approx2.71\\end{aligned}\\]\n"
            . "Therefore, this is the final value.";
        $result = mathpix_client::build_freetext($text);

        $this->assertStringContainsString('For `theta=1`', $result);
        $this->assertStringContainsString("`g(1)=2*sin(%pi/2)^2+1/sqrt(2)`\n", $result);
        $this->assertStringContainsString("`2+1/sqrt(2)`\n`~~2.71`", $result);
        $this->assertStringContainsString('Therefore, this is the final value.', $result);
        $this->assertStringNotContainsString('b*%e*g*%i*n', $result);
        $this->assertStringNotContainsString('a*p*p*r*o*x', $result);

        $singleDollar = '$\\begin{aligned}x&=1\\\\y&=2\\end{aligned}$';
        $this->assertSame("`x=1`\n`y=2`", mathpix_client::build_freetext($singleDollar));

        $finalanswers = '\\[\\begin{aligned}1.\ f(2)&\\approx1+2\\sqrt{2}\\\\'
            . '2)\ \\Rightarrow g(1)&\\approx2+1/\\sqrt{2}=2.71\\end{aligned}\\]';
        $convertedanswers = mathpix_client::build_freetext($finalanswers);
        $this->assertStringContainsString("`1. f(2)~~1+2*sqrt(2)`\n", $convertedanswers);
        $this->assertStringContainsString('`2. g(1)~~2+1/sqrt(2)=2.71`', $convertedanswers);
        $this->assertStringNotContainsString('R*%i*g*h*t*a*r*r*o*w', $convertedanswers);
    }

    public function test_aligned_continuation_drops_leading_equals(): void {
        $lines = mathpix_client::build_lines(
            '\\begin{aligned}f(x)&=\\frac{x^2+2x+1}{x+1}\\\\&=x+1\\end{aligned}'
        );

        $this->assertSame('f(x)=(x^2+2*x+1)/(x+1)', $lines[0]['stack']);
        $this->assertSame('x+1', $lines[1]['stack']);
    }

    public function test_equation_system_rows_are_not_combined_into_an_answer(): void {
        // The learner decides how to state the answer; no [x=2,y=1] is added.
        $lines = mathpix_client::build_lines(
            '\\begin{aligned}2x+3y&=7\\\\y&=1\\\\x&=2\\end{aligned}'
        );
        $this->assertSame(['2*x+3*y=7', 'y=1', 'x=2'], array_column($lines, 'stack'));
        $this->assertSame('x=1,y=2', stack_converter::normalize_selection('x=1, y=2'));
    }

    public function test_lines_are_candidates_not_automatic_answers(): void {
        $lines = mathpix_client::build_lines("g(1)=2+1/\\sqrt{2}\n~~2.71.");
        $this->assertSame('equation', $lines[0]['type']);
        $this->assertNull($lines[0]['relation']);
        $this->assertSame('g(1)=2+1/sqrt(2)', $lines[0]['normalized']);
        $this->assertSame('approximation', $lines[1]['type']);
        $this->assertSame('approximate', $lines[1]['relation']);
        $this->assertSame('2.71', $lines[1]['normalized']);
        $this->assertSame('~~2.71.', $lines[1]['raw']);
    }

    public function test_document_lines_use_complete_text_not_single_latex_result(): void {
        $text = "\\( |x-2|+|x|\\leq x+1 \\)\n"
            . "First consider the case \\(0\\leq x<2\\)\n"
            . "\\( (2-x)+x\\leq x+1 \\)\n"
            . "Therefore, \\(x\\geq1\\)\n"
            . "Finally, \\(1\\leq x\\leq3\\)";
        $lines = mathpix_client::build_document_lines($text, '|x-2|+|x|\\leq x+1');

        $this->assertCount(5, $lines);
        $this->assertSame('abs(x-2)+abs(x)<=x+1', $lines[0]['stack']);
        $this->assertSame('0<=x and x<2', $lines[1]['stack']);
        $this->assertSame('1<=x and x<=3', $lines[4]['stack']);
        $this->assertSame('text', $lines[1]['display_parts'][0]['type']);
        $this->assertSame('math', $lines[1]['display_parts'][1]['type']);
    }

    public function test_document_lines_ignore_delimiters_and_remove_finally_ocr_tail(): void {
        $text = "\\[\n\\(x+1=2\\)\n\\]\n"
            . "\\text{Finall} y. \\(1\\leq x\\leq3\\)";
        $lines = mathpix_client::build_document_lines($text);

        $this->assertCount(2, $lines);
        $this->assertSame('x+1=2', $lines[0]['stack']);
        $this->assertSame('1<=x and x<=3', $lines[1]['stack']);
        $this->assertSame('text', $lines[1]['display_parts'][0]['type']);
        $this->assertSame('math', $lines[1]['display_parts'][1]['type']);
    }

    public function test_document_lines_respect_dollar_boundaries_before_prose_matching(): void {
        $text = "IMG_2397.PNG\n"
            . 'Next, for $x \\geqslant 2$' . "\n"
            . 'so, $x \\leq 3$' . "\n"
            . 'Finally. $1 \\leq x \\leq 3';
        $lines = mathpix_client::build_document_lines($text);

        $this->assertCount(3, $lines);
        $this->assertSame('x>=2', $lines[0]['stack']);
        $this->assertSame('x<=3', $lines[1]['stack']);
        $this->assertSame('1<=x and x<=3', $lines[2]['stack']);
        $this->assertSame('Next, for ', $lines[0]['display_parts'][0]['text']);
        $this->assertSame('Finally. ', $lines[2]['display_parts'][0]['text']);
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
                'f(x)=if x<0 then 0 elseif x>=0 then 1',
            ],
        ];
    }

    /**
     * Rows recorded by research instrumentation in a real attempt
     * (2026-10-05, usage 50), with the conversion they must now produce.
     *
     * @dataProvider research_trace_line_cases
     */
    public function test_research_trace_lines_convert_without_prose_products(string $latex, string $expected): void {
        $this->assertSame($expected, stack_converter::normalize_selection($latex));
    }

    /**
     * Each expected value was checked against STACK 4.13 validation and an
     * AlgEquiv answer test with the intended teacher answer.
     *
     * @dataProvider stack_audit_cases
     */
    public function test_stack_audit_regressions(string $latex, string $expected): void {
        $this->assertSame($expected, stack_converter::normalize_selection($latex));
    }

    public static function stack_audit_cases(): array {
        return [
            'unbracketed product argument' => ['\\sin 2 x', 'sin(2*x)'],
            'unbracketed Greek product argument' => ['\\sin 2 \\theta', 'sin(2*theta)'],
            'fraction argument' => ['\\sin \\frac{\\pi}{6}', 'sin((%pi)/6)'],
            'power inside argument' => ['\\sin x^{2}', 'sin(x^2)'],
            'logarithm of a power' => ['\\ln x^{2}', 'ln(x^2)'],
            'based logarithm of a power' => ['\\log _{3} x^{2}', 'log(x^2)/log(3)'],
            'Greek argument' => ['\\tan \\theta', 'tan(theta)'],
            'logarithm of absolute value' => ['\\ln |x|+C', 'ln(abs(x))+C'],
            'degrees inside trigonometric function' => ['\\sin 30^{\\circ}=\\frac{1}{2}', 'sin((30)*%pi/180)=1/2'],
            'degrees alone' => ['30^{\\circ}', '30'],
            'display fraction' => ['\\dfrac{3}{4}', '3/4'],
            'Japanese leqq' => ['x \\leqq 2', 'x<=2'],
            'Japanese leqq chain' => ['0 \\leqq x \\leqq 2 \\pi', '0<=x and x<=2*%pi'],
            'plus-minus before a root' => ['x=\\pm \\sqrt{3}', 'x=+-sqrt(3)'],
            'plus-minus inside quadratic formula' => ['\\frac{-b \\pm \\sqrt{b^{2}-4 a c}}{2 a}', '(-b+-sqrt(b^2-4*a*c))/(2*a)'],
            'leading implication arrow' => ['\\Rightarrow x=3', 'x=3'],
            'bare prime' => ['y^{\\prime}=2 y', 'diff(y,x)=2*y'],
            'limit keeps its right-hand side' => ['\\lim _{x \\rightarrow 0} \\frac{\\sin x}{x}=1', 'limit(sin(x)/x,x,0)=1'],
            'sum keeps its right-hand side' => ['\\sum_{k=1}^{n} k=\\frac{n(n+1)}{2}', 'sum(k,k,1,n)=(n*(n+1))/(2)'],
            'determinant keeps its right-hand side' => ['\\left|\\begin{array}{ll}a & b \\\\ c & d\\end{array}\\right|=a d-b c', 'determinant(matrix([a,b],[c,d]))=a*d-b*c'],
            'brace system is a list' => ['\\left\\{\\begin{array}{l}x+y=3 \\\\ x-y=1\\end{array}\\right.', '[x+y=3,x-y=1]'],
            'cases system is a list' => ['\\begin{cases}x+y=3 \\\\ x-y=1\\end{cases}', '[x+y=3,x-y=1]'],
            'set' => ['\\{1,2,3\\}', '{1,2,3}'],
            'named set is not two solutions' => ['A=\\{1,2\\}', 'A={1,2}'],
            'open interval' => ['x \\in(-1,3)', '-1<x and x<3'],
            'combination' => ['{ }_{5} C_{2}', 'binomial(5,2)'],
            'combination with mathrm' => ['{ }_{6} \\mathrm{C}_{3}=20', 'binomial(6,3)=20'],
            'point equation' => ['(x, y)=(1,2)', '[x,y]=[1,2]'],
            'several assignments stay as written' => ['\\mu=50, \\sigma=10', 'mu=50,sigma=10'],
            'OCR-damaged second solution stays invalid' => ['x=-1, x-3', 'x=-1,x-3'],
            'integrand of two functions' => ['\\int \\sin x \\cos x d x', 'int(sin(x)*cos(x),x)'],
        ];
    }

    /**
     * Results that STACK accepted but read differently from the handwriting
     * (a_{i} as a[%i], \eta as %e*t*a). Each expected value is STACK-valid;
     * unsupported notation must keep a backslash so STACK rejects it visibly.
     *
     * @dataProvider valid_but_wrong_cases
     */
    public function test_valid_but_wrong_regressions(string $path, string $input, string $expected): void {
        $actual = $path === 'ascii' ? stack_converter::normalize_ascii($input) : stack_converter::normalize_selection($input);
        $this->assertSame($expected, $actual);
    }

    public static function valid_but_wrong_cases(): array {
        return [
            'subscript i is an index' => ['latex', 'a_{i}+a_{i+1}', 'a[i]+a[i+1]'],
            'scientific number times a variable' => ['latex', '2.5e-3 x', '2.5e-3*x'],
            'limit body ends at a plus' => ['latex', '\\lim_{x \\to 0} \\frac{\\sin x}{x} + 1', 'limit(sin(x)/x,x,0)+1'],
            'sum body ends at a plus' => ['latex', '\\sum_{k=1}^{n} k^2 + n', 'sum(k^2,k,1,n)+n'],
            'derivative body ends at a plus' => ['latex', '\\frac{d}{dx} x^2 + 1', 'diff(x^2,x)+1'],
            'leading sign stays in a sum body' => ['latex', '\\sum_{k=1}^{n} -k', 'sum(-k,k,1,n)'],
            'bracketed sum body is whole' => ['latex', '\\sum_{k=1}^{n} (k^2 + k)', 'sum((k^2+k),k,1,n)'],
            'x double prime has no stated variable' => ['latex', "x''=3", "x''=3"],
            // A worded condition keeps its words as words; nothing is inferred as an else.
            'worded condition stays text' => ['latex', 'f(x)=\\begin{cases} x^2 & x>0 \\\\ 0 & \\text{otherwise} \\end{cases}', 'f(x)=if x>0 then x^2 elseif "otherwise" then 0'],
            'worded middle condition stays text' => ['latex', 'f(n)=\\begin{cases} n/2 & \\text{n even} \\\\ 3n+1 & \\text{n odd} \\end{cases}', 'f(n)=if "n even" then n/2 elseif "n odd" then 3*n+1'],
            'words and maths in one condition' => ['latex', 'f(x)=\\begin{cases} 1 & \\text{if } x>0 \\\\ 0 & \\text{otherwise} \\end{cases}', 'f(x)=if "if" x>0 then 1 elseif "otherwise" then 0'],
            'last branch keeps its own condition' => ['latex', 'f(x)=\\begin{cases} 1 & x<0 \\\\ 2 & x \\geq 0 \\end{cases}', 'f(x)=if x<0 then 1 elseif x>=0 then 2'],
            'branch without a condition is the else' => ['latex', 'f(x)=\\begin{cases} 1 & x<0 \\\\ 2 \\end{cases}', 'f(x)=if x<0 then 1 else 2'],
            'prose before a system is prose' => ['latex', '\\text{Answer: } \\begin{cases} x=1 \\\\ y=2\\end{cases}', '[x=1,y=2]'],
            'variable times a scientific number' => ['latex', 'x 2.5e-3', 'x*2.5e-3'],
            'unbraced text subscript' => ['latex', 'x_\\text{max}=3', 'x[max]=3'],
            'sentence period after an approximation' => ['latex', 'x \\approx 2.71.', 'x=2.71'],
            'sentence period after a lone approximation' => ['latex', '\\approx 2.71.', '2.71'],
            'subscript i makes i a variable' => ['latex', 'x_{i}=i^2', 'x[i]=i^2'],
            'imaginary unit after a root' => ['latex', 'z = 1 + \\sqrt{3}i', 'z=1+sqrt(3)*%i'],
            'eta' => ['latex', '2\\eta x', '2*eta*x'],
            'xi' => ['latex', '\\xi', 'xi'],
            'chi' => ['latex', '\\chi', 'chi'],
            'varepsilon' => ['latex', '\\varepsilon', 'epsilon'],
            'varphi' => ['latex', '\\varphi', 'phi'],
            'floor brackets' => ['latex', '\\lfloor x \\rfloor', 'floor(x)'],
            'empty set' => ['latex', '\\emptyset', '{}'],
            'real part' => ['latex', '\\operatorname{Re}(z)', 'realpart(z)'],
            'base-10 logarithm' => ['latex', '\\lg x', 'lg(x)'],
            'upright differential' => ['latex', '\\int \\frac{1}{x}\\,\\mathrm{d}x', 'int(1/x,x)'],
            'definite integral with value' => ['latex', '\\int_0^{\\pi} \\sin x dx = 2', 'int(sin(x),x,0,%pi)=2'],
            'integral inside a fraction' => ['latex', '\\frac{\\int_0^1(x+1)\\,dx}{(x+3)}', '(int((x+1),x,0,1))/((x+3))'],
            'matrix inside a fraction' => ['latex', '\\frac{\\begin{pmatrix}3 & x \\\\ x & 3\\end{pmatrix}}{2}', '(matrix([3,x],[x,3]))/2'],
            'equivalence arrow splits statements' => ['latex', 'x^2=4 \\Leftrightarrow x=\\pm 2', 'x^2=4,x=+-2'],
            'therefore splits statements' => ['latex', '2x+3=7 \\therefore x=2', '2*x+3=7,x=2'],
            'union stays invalid' => ['latex', 'A \\cup B', 'A\\cup*B'],
            'arg stays invalid' => ['latex', '\\arg z', '\\arg*z'],
            'set builder stays invalid' => ['latex', '\\{x \\mid x>0\\}', '{x\\mid*x>0}'],
            'scientific notation' => ['ascii', '2.5e-3', '2.5e-3'],
            'scientific notation capital E' => ['ascii', '1.0E-5', '1.0E-5'],
            'typed pi constant' => ['ascii', '%pi', '%pi'],
            'typed e constant power' => ['ascii', '%e^x', '%e^x'],
            'number times typed pi' => ['ascii', '2%pi', '2*%pi'],
            'log10' => ['ascii', 'log10(x)', 'lg(x)'],
            'atan2' => ['ascii', 'atan2(y,x)', 'atan2(y,x)'],
            'floor' => ['ascii', 'floor(x)', 'floor(x)'],
            'sign' => ['ascii', 'sign(x)', 'signum(x)'],
            'gcd' => ['ascii', 'gcd(4,6)', 'gcd(4,6)'],
            'Greek names' => ['ascii', 'zeta+eta+kappa+nu', 'zeta+eta+kappa+nu'],
            'booleans' => ['ascii', 'true', 'true'],
            'unknown function stays whole' => ['ascii', 'expand(x)', 'expand(x)'],
        ];
    }

    public function test_malformed_connected_relations_remain_visible_without_false_products(): void {
        $this->assertSame('x=-1 or x-3', stack_converter::normalize_selection('x=-1 \\text { or } x-3'));
        $this->assertSame('x=-1 or x-3', stack_converter::normalize_selection('x=-1 \\quad \\text { or } \\quad x-3'));
        $this->assertSame('x-3 and x=-1', stack_converter::normalize_selection('x-3 \\text { かつ } x=-1'));
        $this->assertSame('x=-1 or x-3', stack_converter::normalize_ascii('x=-1 or x-3'));
    }

    public static function research_trace_line_cases(): array {
        return [
            'written or joins two solutions' => ['x=2 \\quad \\text { or } \\quad x=3', 'x=2 or x=3'],
            'written and joins two conditions' => ['y \\leq 2 \\text{ and } y>0', 'y<=2 and y>0'],
            'unknown operatorname is prose' => ['\\operatorname{cuz} \\quad x=-1', 'x=-1'],
            'known operatorname is still a function' => ['\\operatorname{det}(A)', 'determinant(A)'],
        ];
    }

    public function test_document_keeps_the_closing_dollar_of_its_last_row(): void {
        $text = "\$\$\n\\begin{array}{l}\nx^{2}-5 x+6=0 \\\\\n(x-2)(x-3)=0 \\\\\n"
            . "x=2 \\quad \\text { or } \\quad x=3\n\\end{array}\n\$\$\n\nthe larger one is \$x=3\$";
        $lines = mathpix_client::build_document_lines($text);
        $this->assertSame(['x^2-5*x+6=0', '(x-2)*(x-3)=0', 'x=2 or x=3', 'x=3'], array_column($lines, 'stack'));
        $this->assertSame('the larger one is $x=3$', $lines[3]['latex']);
    }

    public function test_document_lines_drop_leading_implication_arrows(): void {
        $text = "\$\\Rightarrow f(2)=1+2 \\sqrt{2} \\approx 3.82\$\n"
            . "\$\$\n\\begin{aligned}\n& \\Leftrightarrow x^{2}-6 x+5 \\leq 0\n\\end{aligned}\n\$\$";
        $this->assertSame(['f(2)=1+2*sqrt(2)', 'x^2-6*x+5<=0'],
            array_column(mathpix_client::build_document_lines($text), 'stack'));
    }

    public function test_statements_in_one_row_are_not_one_expression(): void {
        // 2026-10-08 attempts: a gap or a prose word separates two statements.
        // Read as one expression, the gap became the false chain x-2>0*x and 0*x>2.
        $this->assertSame('x-2>0,x>2', stack_converter::normalize_selection('x-2>0 \\quad x>2'));
        $this->assertSame('x>0 and x-2>0,x>2',
            stack_converter::normalize_selection('x>0 \\text { and } x-2>0, \\text { so } x>2 .'));
        // A connective, a gap inside one expression and a real chain stay whole.
        $this->assertSame('x=2 or x=3', stack_converter::normalize_selection('x=2 \\quad \\text { or } \\quad x=3'));
        $this->assertSame('2*x+3', stack_converter::normalize_selection('2 x \\quad+3'));
        $this->assertSame('1<2*x and 2*x<3', stack_converter::normalize_selection('1<2 x<3'));
    }

    public function test_freetext_keeps_prose_between_statements_outside_the_maths(): void {
        $latex = "\\begin{array}{l}\nx>0 \\text { and } x-2>0, \\text { so } x>2 . \\\\\nx(x-2)=8\n\\end{array}";
        $this->assertSame("`x>0 and x-2>0`, so `x>2`.\n`x*(x-2)=8`", mathpix_client::build_freetext($latex));
        $this->assertSame("because `x-2>0`\n`x>2`", mathpix_client::build_freetext('because $x-2>0 \\quad x>2$'));    }

    public function test_relations_mathpix_joins_with_a_connective_word_stay_one_statement(): void {
        // Read as two formulas, only the last one (x=-2) would be the answer.
        $this->assertSame('`x=4 or x=-2`', mathpix_client::build_freetext('\\(x=4\\) or \\(x=-2\\)'));
        $this->assertSame('so `x<1 or x>3 or x=5`', mathpix_client::build_freetext('so $x<1$ or $x>3$ または $x=5$'));
        $this->assertSame(['x=4 or x=-2'], array_column(mathpix_client::build_document_lines('$x=4$ or $x=-2$'), 'stack'));
        // Handwriting and OCR capitalise the word; STACK reads only lowercase.
        $this->assertSame('`x=4 or x=-2`', mathpix_client::build_freetext('$x=4$ OR $x=-2$'));
        $this->assertSame('x=4 or x=-2', stack_converter::normalize_selection('x=4 \\text { Or } x=-2'));
        $this->assertSame('`x=4`. Or `x=-2`', mathpix_client::build_freetext('$x=4$. Or $x=-2$'));
        // Other prose, and terms that are not relations, keep Mathpix's split.
        $this->assertSame('`x>0`, so `x>2`', mathpix_client::build_freetext('\\(x>0\\), so \\(x>2\\)'));
        $this->assertSame('`x` and `y` are positive', mathpix_client::build_freetext('$x$ and $y$ are positive'));
        $this->assertSame("`x=4` or\n`x=-2`", mathpix_client::build_freetext("\$x=4\$ or\n\$x=-2\$"));
    }

    public function test_freetext_keeps_operatorname_prose_outside_the_formula(): void {
        $this->assertSame("cuz `x=-1`", mathpix_client::build_freetext("\$\\operatorname{cuz} \\quad x=-1\$"));
    }

    public function test_text_is_prose_even_when_ocr_misreads_the_word(): void {
        // "より" read as "f.)": the \text stays prose and neither statement is lost.
        $latex = '|x-1| \\geq 0 \\text { f.) } 2 x-4 \\geq 0';
        $this->assertSame('`abs(x-1)>=0` f.) `2*x-4>=0`', mathpix_client::build_freetext("\\($latex\\)"));
        $this->assertSame('abs(x-1)>=0,2*x-4>=0', stack_converter::normalize_selection($latex));
        $this->assertSame('fって `x>=2`', mathpix_client::build_freetext('\\(\\text { fって } x \\geq 2\\)'));
        $this->assertSame('`x=1 or x=2`', mathpix_client::build_freetext('$x=1 \\text{or} x=2$'));
    }

    /**
     * @dataProvider edited_ascii_cases
     */
    public function test_normalize_edited_ascii(string $ascii, string $expected): void {
        $this->assertSame($expected, stack_converter::normalize_ascii($ascii));
    }

    public static function edited_ascii_cases(): array {
        return [
            'function typed without brackets' => ['sinx', 'sin(x)'],
            'power on function name' => ['sin^2(x)', 'sin(x)^2'],
            'typed logarithm of absolute value' => ['ln|x|+C', 'ln(abs(x))+C'],
            'STACK base logarithm' => ['lg(x,2)', 'lg(x,2)'],
            'two-argument logarithm' => ['log(x,2)', 'log(x)/log(2)'],
            'full-width relation' => ['x≧2', 'x>=2'],
            'full-width letters' => ['ｘ＝３', 'x=3'],
            'superscript digit' => ['x²+1', 'x^2+1'],
            'typed set' => ['{1,2,3}', '{1,2,3}'],
            'adjacent groups' => ['(x+1)(x-1)', '(x+1)*(x-1)'],
            'number before group' => ['2(x+1)', '2*(x+1)'],
            'absolute value' => ['|x-1|', 'abs(x-1)'],
            'unicode minus' => ['x=−1', 'x=-1'],
            'logarithm base with nested argument' => ['log_2(x(x-2))=3', '(log(x*(x-2))/log(2))=3'],
            'logarithm base inside a word is not a logarithm' => ['catalog_2', 'c*a*t*a*l*o*g_2'],
            'logical interval with implicit multiplication' => [
                '1<=x and x<=3*2x',
                '1<=x and x<=3*2*x',
            ],
            'logical alternative is not treated as a chained inequality' => [
                'x<1 or x>3',
                'x<1 or x>3',
            ],
            'logical negation remains a function' => ['not(x=1)', 'not(x=1)'],
            'list membership uses the valid STACK predicate' => [
                'x in [1,2]',
                'elementp(x,[1,2])',
            ],
        ];
    }
}
