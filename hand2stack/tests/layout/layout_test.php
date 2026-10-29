<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Tests for review rows, Free-text working and response parsing.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\layout;

use local_hand2stack\converter\stack_converter;
use local_hand2stack\ocr\response_parser;

defined('MOODLE_INTERNAL') || die();

final class layout_test extends \advanced_testcase {
    public function test_mixed_prose_line_separates_text_from_selectable_math(): void {
        $lines = line_builder::build_lines('Therefore, $x=\\frac{\\pi}{2}');

        $this->assertCount(1, $lines);
        $this->assertSame('x=\\frac{\\pi}{2}', $lines[0]['math']);
        $this->assertSame('x=(%pi)/2', $lines[0]['stack']);
        $this->assertSame('text', $lines[0]['display_parts'][0]['type']);
        $this->assertSame('math', $lines[0]['display_parts'][1]['type']);
        $this->assertSame('x=\\frac{\\pi}{2}', $lines[0]['display_parts'][1]['latex']);
    }

    public function test_nested_math_delimiters_are_removed_from_structured_lines(): void {
        $lines = line_builder::build_lines('\\(\\(x=9\\)\\)');

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
        $lines = document_builder::build_document_lines(
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
        $japanese = document_builder::build_document_lines('答えはメニー1たす');
        $this->assertSame('text', $japanese[0]['type']);
        $this->assertSame('', $japanese[0]['stack']);
    }

    /** Handwriting wraps every row in one inline array; each row is still its own line. */
    public function test_inline_multirow_block_keeps_its_rows(): void {
        $lines = document_builder::build_document_lines('\\( \\begin{array}{l}4 x-7=2 x+9 \\\\ 2 x=16 \\\\ x=8\\end{array} \\)');

        $this->assertSame(['4*x-7=2*x+9', '2*x=16', 'x=8'], array_column($lines, 'stack'));
    }

    /** A row keeps every formula it holds, in order; none is chosen as the answer. */
    public function test_row_keeps_all_of_its_formulas(): void {
        $lines = document_builder::build_document_lines("\\(a<-2\\), \\(2<a\\)\n\\(x>2\\) なので \\(x=4\\)");
        $this->assertSame(['a<-2,2<a', 'x>2,x=4'], array_column($lines, 'stack'));
    }

    /**
     * A piecewise function is laid out as written: a row per branch, its value
     * and condition each converted alone, words kept as words, the brace kept
     * as text on the first row. Handwriting nests it inside the page's array.
     */
    public function test_piecewise_function_keeps_its_rows(): void {
        $handwriting = '\\( \\begin{array}{l}1.5 x=3 \\\\ \\left\\{\\begin{array}{l}y=x^{2}+1 \\quad x>1 \\\\ '
            . 'y=x^{-\\sin x}-\\log _{2} x \\quad x \\leq 1\\end{array}\\right.\\end{array} \\)';
        $lines = document_builder::build_document_lines($handwriting);
        $this->assertSame(['1.5*x=3', 'y=x^2+1,x>1', 'y=x^(-sin(x))-(log(x)/log(2)),x<=1'], array_column($lines, 'stack'));
        $this->assertSame(['type' => 'text', 'text' => '{ '], $lines[1]['display_parts'][0]);
        $this->assertSame("`1.5*x=3`\n{ `y=x^2+1` `x>1`\n`y=x^(-sin(x))-(log(x)/log(2))` `x<=1`",
            freetext_builder::build($handwriting));

        $cases = '\\[ f(x)=\\begin{cases} x^2 & x>0 \\\\ 0 & \\text{otherwise} \\end{cases} \\]';
        $this->assertSame(['f(x)=', 'x^2,x>0', '0'], array_column(document_builder::build_document_lines($cases), 'stack'));
        $this->assertSame("`f(x)=`\n{ `x^2` `x>0`\n`0` otherwise", freetext_builder::build($cases));

        // A system of equations has no conditions and stays one list.
        $system = '\\[\\begin{cases} x+y=3 \\\\ x-y=1 \\end{cases}\\]';
        $this->assertSame(['[x+y=3,x-y=1]'], array_column(document_builder::build_document_lines($system), 'stack'));
    }

    /** Mathpix may answer 200 with an error; that is a failed request, not an empty result. */
    public function test_mathpix_error_in_a_successful_response_fails(): void {
        $parse = new \ReflectionMethod(response_parser::class, 'parse');
        $this->expectException(\moodle_exception::class);
        $this->expectExceptionMessage(get_string('mathpixrequestfailed', 'local_hand2stack'));
        $parse->invoke(null, json_encode(['error' => 'Image too large']), 0, '', 200);
    }

    /** An inequation converts; an approximation remains exactly what OCR returned. */
    public function test_inequation_and_approximation_rows(): void {
        $lines = line_builder::build_lines('x \\neq 1');
        $this->assertSame('condition', $lines[0]['type']);

        $lines = line_builder::build_lines('x \\approx 2.71.');
        $this->assertSame(['x \\approx 2.71.', 'x \\approx 2.71.', 'approximation'],
            [$lines[0]['stack'], $lines[0]['normalized'], $lines[0]['type']]);
    }

    /** Free text numbers only kept rows, drops the filename header, and keeps spaces around prose. */
    public function test_freetext_numbering_filename_and_prose_spacing(): void {
        $doc = "IMG_01.PNG\nSolve.\n\\[\\begin{aligned}1.&\\ x=1 \\\\\n2.&\\ y=2\\end{aligned}\\]\nso \\(x=1\\) and then \\(y=2\\)";
        $this->assertSame("Solve.\n`1. x=1`\n`2. y=2`\nso `x=1` and then `y=2`", freetext_builder::build($doc));

        $lines = document_builder::build_document_lines($doc);
        $this->assertSame(' and then ', $lines[count($lines) - 1]['display_parts'][2]['text']);
    }

    /** A row starting with a decimal keeps it; only an item number such as "1." or "2)" is removed. */
    public function test_leading_decimal_is_not_an_item_number(): void {
        $lines = document_builder::build_document_lines("\\[\\begin{aligned}1.5 x&=3 \\\\ x&=2\\end{aligned}\\]");
        $this->assertSame(['1.5*x=3', 'x=2'], array_column($lines, 'stack'));

        $lines = document_builder::build_document_lines("\\[\\begin{aligned}1. 2 x&=4 \\\\ 2) x&=2\\end{aligned}\\]");
        $this->assertSame(['2*x=4', 'x=2'], array_column($lines, 'stack'));

        // Free text keeps an item number but never reads a decimal as one.
        $this->assertSame("`1.5*x=3`\n`2. x=2`", freetext_builder::build('\\( \\begin{array}{l} 1.5 x=3 \\\\ 2. x=2 \\end{array} \\)'));
    }

    public function test_freetext_preserves_prose_paragraphs_and_marks_only_math(): void {
        $text = "First explain the method.\n\nTherefore, \\(x=\\frac{3}{2}\\), so the result follows.";

        $this->assertSame(
            "First explain the method.\n\nTherefore, `x=3/2`, so the result follows.",
            freetext_builder::build($text)
        );
    }

    /**
     * Free-text working is read, not graded: f'(x) stays as written, alike
     * with f'(2), while a single answer still gets diff(f(x),x).
     */
    public function test_freetext_keeps_prime_derivatives_as_written(): void {
        $doc = "\\(f^{\\prime}(x)=2 x\\)\n\\(f^{\\prime}(2)=4\\)\n\\(g''(t)=6 t\\)";
        $this->assertSame("`f'(x)=2*x`\n`f'(2)=4`\n`g''(t)=6*t`", freetext_builder::build($doc));
        $this->assertSame('diff(f(x),x)=2*x', stack_converter::normalize("f^{\\prime}(x)=2 x"));
    }

    public function test_freetext_keeps_continued_rows_and_function_values_as_written(): void {
        // A handwritten integral worked out row by row, as Mathpix returns it.
        $doc = "\\[\\begin{aligned}& \\int_{0}^{2}\\left(x^{2}-x\\right) d x \\\\ = & \\int_{0}^{2} x^{2} d x-\\int_{0}^{2} x d x \\\\ "
            . "F(2)-F(0)= & \\frac{8}{3}-2 \\\\ = & \\frac{2}{3}\\end{aligned}\\]";
        $this->assertSame("`int((x^2-x),x,0,2)`\n`=int(x^2,x,0,2)-int(x,x,0,2)`\n`F(2)-F(0)=8/3-2`\n`=2/3`",
            freetext_builder::build($doc));
        // A review row is still the value alone; F(2) stays as written there too.
        $this->assertSame(['int((x^2-x),x,0,2)', 'int(x^2,x,0,2)-int(x,x,0,2)', 'F(2)-F(0)=8/3-2', '2/3'],
            array_column(document_builder::build_document_lines($doc), 'stack'));
    }

    public function test_a_leading_minus_in_a_formula_is_a_sign_not_a_bullet(): void {
        $this->assertSame(['-3*x+2', 'x=1'], array_column(line_builder::build_lines(
            "\\begin{aligned}- 3 x+2 \\\\ 1.\\ x=1\\end{aligned}"), 'stack'));
    }

    public function test_freetext_formula_rows_are_not_separated_by_an_extra_blank_line(): void {
        $this->assertSame("`x=1`\n`y=2`", freetext_builder::build("\\(x=1\\)\n\\(y=2\\)"));
        $this->assertSame("`x=1`\n`y=2`", freetext_builder::build("\\(x=1\\) \\(y=2\\)"));
        $this->assertSame("`x=1`\n\n`y=2`", freetext_builder::build("\\(x=1\\)\n\n\\(y=2\\)"));
    }

    public function test_prose_inside_a_formula_keeps_both_statements_of_a_review_row(): void {
        // Mathpix puts prose in \text{} inside the formula, as for a handwritten
        // line; the second statement must not be dropped ("x>0*x").
        $this->assertSame(['x>0,x>2'], array_column(
            document_builder::build_document_lines("\\(x>0 \\text{ so } x>2\\)"), 'stack'));
        $this->assertSame(['x>0,x>2', 'x=3,y=5'], array_column(document_builder::build_document_lines(
            "\\[\\begin{aligned}1.\\ x>0 \\text{ so } x>2 \\\\ 2.\\ x=3 \\text{ hence } y=5\\end{aligned}\\]"), 'stack'));
    }

    public function test_freetext_uses_ascii_fallback_without_losing_lines(): void {
        $this->assertSame("`x=1\ny=2`", freetext_builder::build('', "x=1\ny=2"));
    }

    public function test_freetext_converts_aligned_math_by_row_without_leaking_layout_commands(): void {
        $text = "For \\(theta=1\\)\n"
            . "\\[\\begin{aligned}g(1)&=2\\sin(\\pi/2)^2+1/\\sqrt{2}\\\\"
            . "&=2+1/\\sqrt{2}\\\\&\\approx2.71\\end{aligned}\\]\n"
            . "Therefore, this is the final value.";
        $result = freetext_builder::build($text);

        $this->assertStringContainsString('For `theta=1`', $result);
        $this->assertStringContainsString("`g(1)=2*sin(%pi/2)^2+1/sqrt(2)`\n", $result);
        $this->assertStringContainsString("`=2+1/sqrt(2)`\n`~~2.71`", $result);
        $this->assertStringContainsString('Therefore, this is the final value.', $result);
        $this->assertStringNotContainsString('b*%e*g*%i*n', $result);
        $this->assertStringNotContainsString('a*p*p*r*o*x', $result);

        $singleDollar = '$\\begin{aligned}x&=1\\\\y&=2\\end{aligned}$';
        $this->assertSame("`x=1`\n`y=2`", freetext_builder::build($singleDollar));

        $finalanswers = '\\[\\begin{aligned}1.\ f(2)&\\approx1+2\\sqrt{2}\\\\'
            . '2)\ \\Rightarrow g(1)&\\approx2+1/\\sqrt{2}=2.71\\end{aligned}\\]';
        $convertedanswers = freetext_builder::build($finalanswers);
        $this->assertStringContainsString("`1. f(2)~~1+2*sqrt(2)`\n", $convertedanswers);
        $this->assertStringContainsString('`2. g(1)~~2+1/sqrt(2)=2.71`', $convertedanswers);
        $this->assertStringNotContainsString('R*%i*g*h*t*a*r*r*o*w', $convertedanswers);
    }

    public function test_aligned_continuation_drops_leading_equals(): void {
        $lines = line_builder::build_lines(
            '\\begin{aligned}f(x)&=\\frac{x^2+2x+1}{x+1}\\\\&=x+1\\end{aligned}'
        );

        $this->assertSame('f(x)=(x^2+2*x+1)/(x+1)', $lines[0]['stack']);
        $this->assertSame('x+1', $lines[1]['stack']);
    }

    public function test_equation_system_rows_are_not_combined_into_an_answer(): void {
        // The learner decides how to state the answer; no [x=2,y=1] is added.
        $lines = line_builder::build_lines(
            '\\begin{aligned}2x+3y&=7\\\\y&=1\\\\x&=2\\end{aligned}'
        );
        $this->assertSame(['2*x+3*y=7', 'y=1', 'x=2'], array_column($lines, 'stack'));
        $this->assertSame('x=1,y=2', stack_converter::normalize_selection('x=1, y=2'));
    }

    public function test_lines_are_candidates_not_automatic_answers(): void {
        $lines = line_builder::build_lines("g(1)=2+1/\\sqrt{2}\n~~2.71.");
        $this->assertSame('equation', $lines[0]['type']);
        $this->assertNull($lines[0]['relation']);
        $this->assertSame('g(1)=2+1/sqrt(2)', $lines[0]['normalized']);
        $this->assertSame('approximation', $lines[1]['type']);
        $this->assertSame('approximate', $lines[1]['relation']);
        $this->assertSame('~~2.71.', $lines[1]['normalized']);
        $this->assertSame('~~2.71.', $lines[1]['raw']);
    }

    public function test_document_lines_use_complete_text_not_single_latex_result(): void {
        $text = "\\( |x-2|+|x|\\leq x+1 \\)\n"
            . "First consider the case \\(0\\leq x<2\\)\n"
            . "\\( (2-x)+x\\leq x+1 \\)\n"
            . "Therefore, \\(x\\geq1\\)\n"
            . "Finally, \\(1\\leq x\\leq3\\)";
        $lines = document_builder::build_document_lines($text, '|x-2|+|x|\\leq x+1');

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
        $lines = document_builder::build_document_lines($text);

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
        $lines = document_builder::build_document_lines($text);

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
        $lines = line_builder::build_lines($latex);
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
                '1,x>=0', // the last branch row; a piecewise function is laid out a row per branch
            ],
        ];
    }

    public function test_document_keeps_the_closing_dollar_of_its_last_row(): void {
        $text = "\$\$\n\\begin{array}{l}\nx^{2}-5 x+6=0 \\\\\n(x-2)(x-3)=0 \\\\\n"
            . "x=2 \\quad \\text { or } \\quad x=3\n\\end{array}\n\$\$\n\nthe larger one is \$x=3\$";
        $lines = document_builder::build_document_lines($text);
        $this->assertSame(['x^2-5*x+6=0', '(x-2)*(x-3)=0', 'x=2 or x=3', 'x=3'], array_column($lines, 'stack'));
        $this->assertSame('the larger one is $x=3$', $lines[3]['latex']);
    }

    public function test_display_row_with_quad_is_shown_once(): void {
        // 2026-10-14 handwriting: the first row of a multi-row block kept its
        // "\quad" in the maths but not in the display text, so the row was
        // shown twice, as plain text and as rendered maths.
        $text = "\$\$\n\\begin{aligned}\n& x>2,50 \\quad x=4 \\\\\n& 1.5 x=3\n\\end{aligned}\n\$\$";
        $lines = document_builder::build_document_lines($text);
        $this->assertSame([['type' => 'math', 'latex' => 'x>2,50 \\quad x=4']], $lines[0]['display_parts']);
    }

    public function test_document_lines_drop_leading_implication_arrows(): void {
        $text = "\$\\Rightarrow f(2)=1+2 \\sqrt{2} \\approx 3.82\$\n"
            . "\$\$\n\\begin{aligned}\n& \\Leftrightarrow x^{2}-6 x+5 \\leq 0\n\\end{aligned}\n\$\$";
        $this->assertSame(['f(2)=1+2 \\sqrt{2} \\approx 3.82', 'x^2-6*x+5<=0'],
            array_column(document_builder::build_document_lines($text), 'stack'));
    }

    public function test_freetext_keeps_prose_between_statements_outside_the_maths(): void {
        $latex = "\\begin{array}{l}\nx>0 \\text { and } x-2>0, \\text { so } x>2 . \\\\\nx(x-2)=8\n\\end{array}";
        $this->assertSame("`x>0 and x-2>0`, so `x>2`.\n`x(x-2)=8`", freetext_builder::build($latex));
        // Statements written on one row with a gap stay on that row.
        $this->assertSame("because `x-2>0` `x>2`", freetext_builder::build('because $x-2>0 \\quad x>2$'));    }

    public function test_relations_mathpix_joins_with_a_connective_word_stay_one_statement(): void {
        // Read as two formulas, only the last one (x=-2) would be the answer.
        $this->assertSame('`x=4 or x=-2`', freetext_builder::build('\\(x=4\\) or \\(x=-2\\)'));
        $this->assertSame('so `x<1 or x>3 or x=5`', freetext_builder::build('so $x<1$ or $x>3$ または $x=5$'));
        $this->assertSame(['x=4 or x=-2'], array_column(document_builder::build_document_lines('$x=4$ or $x=-2$'), 'stack'));
        // Handwriting and OCR capitalise the word; STACK reads only lowercase.
        $this->assertSame('`x=4 or x=-2`', freetext_builder::build('$x=4$ OR $x=-2$'));
        $this->assertSame('x=4 or x=-2', stack_converter::normalize_selection('x=4 \\text { Or } x=-2'));
        $this->assertSame('`x=4`. Or `x=-2`', freetext_builder::build('$x=4$. Or $x=-2$'));
        // Other prose, and terms that are not relations, keep Mathpix's split.
        $this->assertSame('`x>0`, so `x>2`', freetext_builder::build('\\(x>0\\), so \\(x>2\\)'));
        $this->assertSame('`x` and `y` are positive', freetext_builder::build('$x$ and $y$ are positive'));
        $this->assertSame("`x=4` or\n`x=-2`", freetext_builder::build("\$x=4\$ or\n\$x=-2\$"));
    }

    public function test_freetext_keeps_operatorname_prose_outside_the_formula(): void {
        $this->assertSame("cuz `x=-1`", freetext_builder::build("\$\\operatorname{cuz} \\quad x=-1\$"));
    }

    public function test_text_is_prose_even_when_ocr_misreads_the_word(): void {
        // "より" read as "f.)": the \text stays prose and neither statement is lost.
        $latex = '|x-1| \\geq 0 \\text { f.) } 2 x-4 \\geq 0';
        $this->assertSame('`abs(x-1)>=0` f.) `2*x-4>=0`', freetext_builder::build("\\($latex\\)"));
        $this->assertSame('abs(x-1)>=0,2*x-4>=0', stack_converter::normalize_selection($latex));
        $this->assertSame('fって `x>=2`', freetext_builder::build('\\(\\text { fって } x \\geq 2\\)'));
        $this->assertSame('`x=1 or x=2`', freetext_builder::build('$x=1 \\text{or} x=2$'));
    }
}
