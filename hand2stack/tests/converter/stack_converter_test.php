<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Tests for the LaTeX to STACK conversion.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\converter;

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
                // x(x-2) may be a product or a function value: STACK's insert-stars setting decides.
                '(log(x(x-2))/log(2))=3',
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
                'g(1)=2+\\frac{1}{\\sqrt{2}}\\approx2.71',
            ],
            'approximate assignment' => ['x\\approx3.83', 'x\\approx3.83'],
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
            // A product sign Mathpix read as pi, or pi itself: not ours to say.
            'pi with an index stays as written' => ['\\pi_{i=1}^{n} i', '\\pi_{i=1}^{n} i'],
            'parenthesised triple stays ambiguous' => ['(1,2,3)', '(1,2,3)'],
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
                '3*x(x+1)*(x-2)+2*%pi*r^2*h-4*ab*sqrt(c)',
            ],
            'multivariable products' => [
                '\\frac{ax^2+bxy+cy^2}{\\sqrt{a^2+b^2+c^2}}',
                // Run-together names stay whole for STACK's insert-stars setting, ax as bxy.
                '(ax^2+bxy+cy^2)/(sqrt(a^2+b^2+c^2))',
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
            'degrees alone' => ['30^{\\circ}', '30°'],
            'display fraction' => ['\\dfrac{3}{4}', '3/4'],
            'Japanese leqq' => ['x \\leqq 2', 'x<=2'],
            'Japanese leqq chain' => ['0 \\leqq x \\leqq 2 \\pi', '0<=x and x<=2*%pi'],
            'plus-minus before a root' => ['x=\\pm \\sqrt{3}', 'x=+-sqrt(3)'],
            'plus-minus inside quadratic formula' => ['\\frac{-b \\pm \\sqrt{b^{2}-4 a c}}{2 a}', '(-b+-sqrt(b^2-4*a*c))/(2*a)'],
            'leading implication arrow' => ['\\Rightarrow x=3', 'x=3'],
            'bare prime' => ['y^{\\prime}=2 y', "y'=2*y"],
            'limit keeps its right-hand side' => ['\\lim _{x \\rightarrow 0} \\frac{\\sin x}{x}=1', 'limit(sin(x)/x,x,0)=1'],
            'sum keeps its right-hand side' => ['\\sum_{k=1}^{n} k=\\frac{n(n+1)}{2}', 'sum(k,k,1,n)=(n(n+1))/(2)'],
            'determinant keeps its right-hand side' => ['\\left|\\begin{array}{ll}a & b \\\\ c & d\\end{array}\\right|=a d-b c', 'determinant(matrix([a,b],[c,d]))=a*d-b*c'],
            'brace system is a list' => ['\\left\\{\\begin{array}{l}x+y=3 \\\\ x-y=1\\end{array}\\right.', '[x+y=3,x-y=1]'],
            'cases system is a list' => ['\\begin{cases}x+y=3 \\\\ x-y=1\\end{cases}', '[x+y=3,x-y=1]'],
            'set' => ['\\{1,2,3\\}', '{1,2,3}'],
            'named set is not two solutions' => ['A=\\{1,2\\}', 'A={1,2}'],
            'open interval' => ['x \\in(-1,3)', '-1<x and x<3'],
            'combination' => ['{ }_{5} C_{2}', 'binomial(5,2)'],
            'combination with mathrm' => ['{ }_{6} \\mathrm{C}_{3}=20', 'binomial(6,3)=20'],
            'ambiguous point or interval keeps parentheses' => ['(x, y)=(1,2)', '(x,y)=(1,2)'],
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
            // Without brackets, whether a following + or - term belongs to the
            // operator is the learner's to say: the row stays as written.
            'limit body before a plus stays as written' => ['latex', '\\lim_{x \\to 0} \\frac{\\sin x}{x} + 1', '\\lim_{x \\to 0} \\frac{\\sin x}{x} + 1'],
            'sum body before a plus stays as written' => ['latex', '\\sum_{k=1}^{n} k^2 + n', '\\sum_{k=1}^{n} k^2 + n'],
            'derivative body before a plus stays as written' => ['latex', '\\frac{d}{dx} x^2 + 1', '\\frac{d}{dx} x^2 + 1'],
            'bracketed limit body before a plus' => ['latex', '\\lim_{x \\to 0} \\left(\\frac{\\sin x}{x}\\right) + 1', 'limit((sin(x)/x),x,0)+1'],
            'leading sign stays in a sum body' => ['latex', '\\sum_{k=1}^{n} -k', 'sum(-k,k,1,n)'],
            'bracketed sum body is whole' => ['latex', '\\sum_{k=1}^{n} (k^2 + k)', 'sum((k^2+k),k,1,n)'],
            'x double prime has no stated variable' => ['latex', "x''=3", "x''=3"],
            // A worded condition keeps its words as words; nothing is inferred as an else.
            'worded condition stays text' => ['latex', 'f(x)=\\begin{cases} x^2 & x>0 \\\\ 0 & \\text{otherwise} \\end{cases}', 'f(x)=if x>0 then x^2 elseif "otherwise" then 0'],
            'worded middle condition stays text' => ['latex', 'f(n)=\\begin{cases} n/2 & \\text{n even} \\\\ 3n+1 & \\text{n odd} \\end{cases}', 'f(n)=if "n even" then n/2 elseif "n odd" then 3*n+1'],
            'words and maths in one condition' => ['latex', 'f(x)=\\begin{cases} 1 & \\text{if } x>0 \\\\ 0 & \\text{otherwise} \\end{cases}', 'f(x)=if "if" x>0 then 1 elseif "otherwise" then 0'],
            'last branch keeps its own condition' => ['latex', 'f(x)=\\begin{cases} 1 & x<0 \\\\ 2 & x \\geq 0 \\end{cases}', 'f(x)=if x<0 then 1 elseif x>=0 then 2'],
            'branch without a condition is the else' => ['latex', 'f(x)=\\begin{cases} 1 & x<0 \\\\ 2 \\end{cases}', 'f(x)=if x<0 then 1 else 2'],
            'first branch without a condition stays as written' => ['latex', '\\begin{cases} 1 \\\\ 2 & x>0\\end{cases}', '\\begin{cases} 1 \\\\ 2 & x>0\\end{cases}'],
            'middle branch without a condition stays as written' => ['latex', '\\begin{cases} 1 & x<0 \\\\ 2 \\\\ 3 & x>1\\end{cases}', '\\begin{cases} 1 & x<0 \\\\ 2 \\\\ 3 & x>1\\end{cases}'],
            'prose before a system is prose' => ['latex', '\\text{Answer: } \\begin{cases} x=1 \\\\ y=2\\end{cases}', '[x=1,y=2]'],
            'variable times a scientific number' => ['latex', 'x 2.5e-3', 'x*2.5e-3'],
            'unbraced text subscript' => ['latex', 'x_\\text{max}=3', 'x[max]=3'],
            'sentence period after an approximation' => ['latex', 'x \\approx 2.71.', 'x \\approx 2.71.'],
            'sentence period after a lone approximation' => ['latex', '\\approx 2.71.', '\\approx 2.71.'],
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
            // Each integral ends at its own differential when a sum follows it.
            'difference of definite integrals' => [
                'latex',
                '\\int_{0}^{2} x^{2} d x-\\int_{0}^{2} x d x+\\frac{2}{3}',
                'int(x^2,x,0,2)-int(x,x,0,2)+2/3',
            ],
            'integral equal to a difference of integrals' => [
                'latex',
                '\\int_{0}^{2}\\left(x^{2}-x+\\frac{2}{3}\\right) d x=\\int_{0}^{2} x^{2} d x-\\int_{0}^{2} x d x+\\frac{2}{3}',
                'int((x^2-x+2/3),x,0,2)=int(x^2,x,0,2)-int(x,x,0,2)+2/3',
            ],
            'sum of indefinite integrals' => ['latex', '\\int x\\,dx+\\int 1\\,dx', 'int(x,x)+int(1,x)'],
            'compact differential before a difference' => ['latex', '\\int_0^1 xdx-1', 'int(x,x,0,1)-1'],
            'command letters are not a differential' => ['latex', '\\int_0^1 a \\cdot x d x-1', 'int(a*x,x,0,1)-1'],
            // Every limit, sum, product and derivative in a row is converted,
            // not only the first.
            'handwritten limits, integral and sum with bracketed bodies' => [
                'latex',
                '\\lim _{x \\rightarrow 0}\\left(x^{2}+2 x\\right)+\\lim _{x \\rightarrow 0}\\left(\\int_{0}^{2}\\left(x^{2}-x+\\frac{2}{3}\\right) d x\\right)'
                    . '+\\sum_{i=0}^{\\infty}\\left(i^{2}+2 i+1\\right)',
                'limit((x^2+2*x),x,0)+limit((int((x^2-x+2/3),x,0,2)),x,0)+sum((i^2+2*i+1),i,0,inf)',
            ],
            // The same row without brackets: x^2+2x and i^2+2i+1 may each be
            // the whole body or not.
            'handwritten limits and sum without brackets stay as written' => [
                'latex',
                '\\lim _{x \\rightarrow 0} x^{2}+2 x+\\sum_{i=0}^{\\infty} i^{2}+2 i+1',
                '\\lim _{x \\rightarrow 0} x^{2}+2 x+\\sum_{i=0}^{\\infty} i^{2}+2 i+1',
            ],
            'two limits' => ['latex', '\\lim_{x \\to 0} x=\\lim_{y \\to 0} y', 'limit(x,x,0)=limit(y,y,0)'],
            'two sums' => ['latex', '\\sum_{k=1}^{n}(k)+\\sum_{k=1}^{n}\\left(k^{2}\\right)', 'sum((k),k,1,n)+sum((k^2),k,1,n)'],
            'two derivatives' => ['latex', '\\frac{d}{d x}\\left(x^{2}\\right)-\\frac{d^{2}}{d x^{2}}\\left(x^{3}\\right)', 'diff((x^2),x)-diff((x^3),x,2)'],
            'product of sums' => ['latex', '\\sum_{k=1}^{n} k \\cdot \\sum_{j=1}^{m} j', 'sum(k*sum(j,j,1,m),k,1,n)'],
            // A body ends where the bracket or argument list around it does.
            'sum inside an integral' => ['latex', '\\int_{0}^{1} \\sum_{k=1}^{n} x^{k} d x', 'int(sum(x^k,k,1,n),x,0,1)'],
            'product of integrals' => ['latex', '\\int_0^1 x dx \\cdot \\int_0^1 y dy', 'int(x,x,0,1)*int(y,y,0,1)'],
            // A sum over i makes i an index, not the imaginary unit.
            'nested sums over i and j' => ['latex', '\\sum_{i=1}^{n} \\sum_{j=1}^{m} i j', 'sum(sum(i*j,j,1,m),i,1,n)'],
            'imaginary unit without an index i' => ['latex', '3+2 i', '3+2*%i'],
            // A space before a number would join it to what comes before: a
            // product, a list or a thousands separator is the learner's to say.
            'space between numbers stays as written' => ['latex', '2 3', '2 3'],
            'number after a fraction stays as written' => ['latex', '\\frac{1}{2} 3', '\\frac{1}{2} 3'],
            'number after a letter stays as written' => ['latex', 'x 2', 'x 2'],
            // An unbraced superscript is the next token, as in LaTeX.
            'unbraced fraction exponent' => ['latex', '2^\\frac{1}{2}+1', '2^(1/2)+1'],
            // ^{-1} is the inverse of a trigonometric or hyperbolic function by
            // convention; for other functions and f^{-1}(x) it may be either.
            'inverse hyperbolic function' => ['latex', '\\sinh^{-1} x', 'asinh(x)'],
            'inverse secant' => ['latex', '\\sec^{-1} x', 'asec(x)'],
            'inverse trigonometric function of a bracketed power' => ['latex', '\\tan^{-1}(x^{2})+1', 'atan(x^2)+1'],
            'inverse cosine of a product' => ['latex', '\\cos^{-1}((x+1)(x-1))', 'acos((x+1)*(x-1))'],
            // e is no function, and x^{-1}(x+1) does not apply x to x.
            'reciprocal of e times a bracket' => ['latex', 'e^{-1}(x+1)', '%e^(-1)*(x+1)'],
            'reciprocal of x times a bracket' => ['latex', 'x^{-1}(x+1)', 'x^(-1)*(x+1)'],
            'g inverse of a value stays as written' => ['latex', 'g^{-1}(2)', 'g^{-1}(2)'],
            // A differential on the fraction line.
            'integral with dx over a denominator' => ['latex', '\\int_{0}^{1} \\frac{d x}{1+x^{2}}', 'int((1)/(1+x^2),x,0,1)'],
            'indefinite integral with dx over x' => ['latex', '\\int \\frac{dx}{x}', 'int(1/x,x)'],
            // Brackets around a whole cases block only enclose it.
            'cases in round brackets' => ['latex', 'f(x)=\\left(\\begin{cases} x & x>0 \\\\ 0 & x\\leq 0\\end{cases}\\right)',
                'f(x)=if x>0 then x elseif x<=0 then 0'],
            'log to the minus one stays as written' => ['latex', '\\log^{-1} x', '\\log^{-1} x'],
            'f inverse of x stays as written' => ['latex', 'f^{-1}(x)', 'f^{-1}(x)'],
            'reciprocal power still converts' => ['latex', '\\pi^{-1}+x^{-1}', '%pi^(-1)+x^(-1)'],
            // Bars that could pair two ways, and a norm, stay as written.
            'ambiguous absolute bars stay as written' => ['latex', '|a|b|c|', '|a|b|c|'],
            'norm stays as written' => ['latex', '\\left\\|x\\right\\|+||y||', '\\left\\|x\\right\\|+||y||'],
            'separate absolute values' => ['latex', '|x-1|+|x+1|', 'abs(x-1)+abs(x+1)'],
            // A letter before brackets is left to STACK's insert-stars setting.
            'letter before brackets stays as written' => ['latex', 'F(2)-F(0)+a(x+1)', 'F(2)-F(0)+a(x+1)'],
            'number before brackets is a product' => ['latex', '2(x+1)(x-1)', '2*(x+1)*(x-1)'],
            // Prose marked by Mathpix is removed; the rest of the formula stays whole.
            'formula after prose stays whole' => ['latex', '\\text{area } \\frac{1}{2}\\cdot 3\\cdot 4=6', '1/2*3*4=6'],
            // A factor or term around cases has no STACK if form.
            'factor before cases stays as written' => ['latex', '2\\begin{cases} x & x>0 \\\\ 0 & x \\leq 0 \\end{cases}',
                '2\\begin{cases} x & x>0 \\\\ 0 & x \\leq 0 \\end{cases}'],
            'term after cases stays as written' => ['latex', 'f(x)=\\begin{cases} x & x>0 \\\\ 0 & x \\leq 0 \\end{cases}+1',
                'f(x)=\\begin{cases} x & x>0 \\\\ 0 & x \\leq 0 \\end{cases}+1'],
            // A system aligned at its relations is a list of equations.
            'aligned system is a list' => ['latex', '\\left\\{\\begin{array}{rl}2x+3y&\\leq 6\\\\x&\\geq 0\\end{array}\\right.',
                '[2*x+3*y<=6,x>=0]'],
            'brace around unaligned columns stays as written' => ['latex', '\\left\\{\\begin{array}{ll}1 & 2\\\\3 & 4\\end{array}\\right.',
                '\\left\\{\\begin{array}{ll}1 & 2\\\\3 & 4\\end{array}\\right.'],
            // Mathpix spaces a handwritten differential as \mathrm{~d}.
            'spaced upright differential' => ['latex', '\\int x \\mathrm{~d} x', 'int(x,x)'],
            'difference of integrals with spaced differentials' => [
                'latex',
                '\\int_{0}^{2} x^{2} \\mathrm{~d} x-\\int_{0}^{2} x \\mathrm{~d} x+\\frac{2}{3}',
                'int(x^2,x,0,2)-int(x,x,0,2)+2/3',
            ],
            // An integral of the differential alone integrates 1.
            'definite integral of the differential alone' => ['latex', '\\int_0^1 dx', 'int(1,x,0,1)'],
            'indefinite integral of the differential alone' => ['latex', '\\int \\, dx', 'int(1,x)'],
            'difference with an integral of the differential alone' => [
                'latex',
                '2\\int_0^1 x dx - 3\\int_0^1 dx',
                '2*int(x,x,0,1)-3*int(1,x,0,1)',
            ],
            'unbraced upper limit is one token' => ['latex', '\\int_0^1x dx', 'int(x,x,0,1)'],
            'matrix inside a fraction' => ['latex', '\\frac{\\begin{pmatrix}3 & x \\\\ x & 3\\end{pmatrix}}{2}', '(matrix([3,x],[x,3]))/2'],
            'equivalence arrow splits statements' => ['latex', 'x^2=4 \\Leftrightarrow x=\\pm 2', 'x^2=4,x=+-2'],
            'therefore splits statements' => ['latex', '2x+3=7 \\therefore x=2', '2*x+3=7,x=2'],
            'union stays invalid' => ['latex', 'A \\cup B', 'A\\cup*B'],
            'arg stays invalid' => ['latex', '\\arg z', '\\arg*z'],
            'set builder stays invalid' => ['latex', '\\{x \\mid x>0\\}', '{x\\mid*x>0}'],
            // A name keeps its letters together after the backslash goes.
            'pi after a variable' => ['latex', 'r\\pi', 'r*%pi'],
            'pi in an exponent' => ['latex', 'e^{i\\pi}', '%e^(%i*%pi)'],
            'Greek letter before pi' => ['latex', '\\alpha\\pi', 'alpha*%pi'],
            'infinity after a variable' => ['latex', 'n\\infty', 'n*inf'],
            'minus infinity is subtraction after a term' => ['latex', 'x-\\infty', 'x-inf'],
            'minus infinity after an arrow is minf' => ['latex', '\\lim_{x\\to-\\infty} f(x)', 'limit(f(x),x,minf)'],
            'unicode not-equal sign' => ['latex', 'x≠1', 'not(x=1)'],
            'determinant of a matrix' => ['latex', '\\det\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', 'determinant(matrix([1,2],[3,4]))'],
            'factor before a matrix' => ['latex', '2\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', '2*matrix([1,2],[3,4])'],
            // Meaning with no STACK form here stays as written for STACK to reject.
            'cross product stays as written' => ['latex', '\\vec{a}\\times\\vec{b}', '\\vec{a}\\times\\vec{b}'],
            'conjugate stays as written' => ['latex', 'z\\bar{z}=25', 'z\\bar{z}=25'],
            'mean stays as written' => ['latex', '\\overline{x}=5', '\\overline{x}=5'],
            'repeating decimal stays as written' => ['latex', '0.\\dot{3}', '0.\\dot{3}'],
            'mixed number stays as written' => ['latex', '1\\frac{1}{2}', '1\\frac{1}{2}'],
            'fraction after a power is a product' => ['latex', 'x^2\\frac{1}{2}', 'x^2*1/2'],
            // A unit after a number is part of the quantity.
            'unit after a number' => ['latex', 'x=3\\,\\mathrm{cm}', 'x=3*cm'],
            'squared unit' => ['latex', '5 \\mathrm{~cm}^{2}', '5*cm^2'],
            'unit quotient' => ['latex', 'v=3 \\mathrm{~km} / \\mathrm{h}', 'v=3*km/h'],
            'unit product with a negative power' => ['latex', '5\\,\\mathrm{m}\\cdot\\mathrm{s}^{-2}', '5*m*s^-2'],
            'adjacent units remain separate factors' => ['latex', '3 \\mathrm{m} \\mathrm{s}^{-1}', '3*m*s^-1'],
            'upright or is not guessed to be a unit' => ['latex', 'x=2 \\mathrm{or} x=3', 'x=2 or x=3'],
            'upright and is not guessed to be a unit' => ['latex', 'x=2 \\mathrm{and} y=3', 'x=2 and y=3'],
            'upright prose after a number is not guessed to be a unit' => ['latex', 'x=2 \\mathrm{people}', 'x=2'],
            'one marked vector keeps a possible cross product unchanged' => [
                'latex', '\\vec{a}\\times b', '\\vec{a}\\times b',
            ],
            'percentage remains visible' => ['latex', '50\\%', '50\\%'],
            'full-width percentage remains visible' => ['latex', '50％', '50％'],
            'unknown continuous name is not split into guessed factors' => ['latex', 'abc', 'abc'],
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

    /**
     * @dataProvider edited_ascii_cases
     */
    public function test_normalize_edited_ascii(string $ascii, string $expected): void {
        $this->assertSame($expected, stack_converter::normalize_ascii($ascii));
    }

    public static function edited_ascii_cases(): array {
        return [
            'function typed without brackets stays as typed' => ['sinx', 'sinx'],
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
            'logarithm base with nested argument' => ['log_2(x(x-2))=3', '(log(x(x-2))/log(2))=3'],
            'logarithm base inside a word stays one name' => ['catalog_2', 'catalog_2'],
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
