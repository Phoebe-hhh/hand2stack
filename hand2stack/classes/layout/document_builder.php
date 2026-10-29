<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Review rows of a Mathpix text document: prose and its delimited maths.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\layout;

use local_hand2stack\converter\math_extractor;
use local_hand2stack\converter\statement_splitter;

defined('MOODLE_INTERNAL') || die();

final class document_builder {
    /** Build every visible document row, retaining prose around its maths. */
    public static function build_document_lines(string $text, string $latex = '', array $asciimath = []): array {
        $text = trim(str_replace(["\r\n", "\r"], "\n", $text));
        if ($text === '') {
            $next = 0;
            return line_builder::build_math_lines($latex, self::matching_ascii($latex, $asciimath, $next));
        }

        $lines = self::build_document_rows($text, $asciimath);
        $hasmath = array_filter($lines, static function(array $line): bool {
            return $line['math'] !== '';
        });
        if (!$hasmath && trim($latex) !== '') {
            $next = 0;
            return line_builder::build_math_lines($latex, self::matching_ascii($latex, $asciimath, $next));
        }
        return $lines;
    }

    /**
     * One review row per document row. Mathpix decides what is prose: text
     * outside the formula delimiters is shown as text and never converted.
     */
    public static function build_document_rows(string $text, array $asciimath = []): array {
        $lines = [];
        $row = [];
        $nextascii = 0;
        $flush = static function() use (&$row, &$lines): void {
            $line = self::document_row_line($row);
            if ($line !== null) {
                $lines[] = $line;
            }
            $row = [];
        };
        foreach (self::document_segments($text) as [$type, $value]) {
            if ($type === 'display') {
                $flush();
                $ascii = self::matching_ascii($value, $asciimath, $nextascii);
                foreach (line_builder::build_math_lines($value, $ascii) as $line) {
                    $lines[] = $line;
                }
                continue;
            }
            if ($type === 'inline') {
                $row[] = ['math', $value, self::matching_ascii($value, $asciimath, $nextascii)];
                continue;
            }
            $pieces = explode("\n", $value);
            foreach ($pieces as $index => $piece) {
                if ($index > 0) {
                    $flush();
                }
                if ($piece !== '') {
                    $row[] = ['text', $piece];
                }
            }
        }
        $flush();
        return $lines;
    }

    /**
     * Split Mathpix's text output into prose and formulas by its delimiters.
     * Display maths is $$...$$, \\[...\\] or a bare \\begin{aligned}... block;
     * inline maths is $...$ or \\(...\\). A "$" that Mathpix left unclosed opens
     * maths to the end of its row.
     *
     * @return array<int,array{0:string,1:string}> ['text'|'inline'|'display', content]
     */
    public static function document_segments(string $text): array {
        // Mathpix sometimes nests a delimiter pair: \\(\\(x=9\\)\\).
        do {
            $previous = $text;
            $text = preg_replace('/\\\\\(\s*\\\\\(([\s\S]*?)\\\\\)\s*\\\\\)/u', '\\\\($1\\\\)', $text);
            $text = preg_replace('/\\\\\[\s*\\\\\(([\s\S]*?)\\\\\)\s*\\\\\]/u', '\\\\[$1\\\\]', $text);
        } while ($text !== $previous);

        $pattern = '/\$\$([\s\S]+?)\$\$|(?<!\\\\)\\\\\[([\s\S]+?)\\\\\]|(?<!\\\\)\\\\\(([\s\S]+?)\\\\\)|\$([^$\n]+?)\$'
            . '|(\\\\begin\{(aligned|gathered|split|align|array|cases)\*?\}[\s\S]*?\\\\end\{\6\*?\})/u';
        $segments = [];
        $offset = 0;
        $addtext = static function(string $value) use (&$segments): void {
            // An unclosed "$" still marks where Mathpix's formula starts. A
            // LaTeX line break "\\\\" ends a row like a newline.
            foreach (preg_split('/\n|\\\\\\\\/', $value) as $index => $piece) {
                if ($index > 0) {
                    $segments[] = ['text', "\n"];
                }
                $dollar = strpos($piece, '$');
                if ($dollar === false) {
                    $segments[] = ['text', $piece];
                    continue;
                }
                $segments[] = ['text', substr($piece, 0, $dollar)];
                $math = trim(substr($piece, $dollar + 1), " \t$");
                if ($math !== '') {
                    $segments[] = ['inline', $math];
                }
            }
        };
        while (preg_match($pattern, $text, $match, PREG_OFFSET_CAPTURE, $offset)) {
            $start = $match[0][1];
            $addtext(substr($text, $offset, $start - $offset));
            $group = static function(int $index) use ($match): ?string {
                return isset($match[$index]) && $match[$index][1] !== -1 ? $match[$index][0] : null;
            };
            $inline = $group(3) ?? $group(4);
            // Handwriting comes back as "\\(\\begin{array}...\\end{array}\\)":
            // a multi-row block is display maths whatever its delimiters.
            if ($inline !== null && line_builder::extract_multiline_body(trim($inline)) === null
                    && piecewise_rows::parse($inline) === null) {
                $segments[] = ['inline', trim($inline)];
            } else if ($inline !== null) {
                $segments[] = ['display', trim($inline)];
            } else {
                $segments[] = ['display', trim($group(1) ?? $group(2) ?? $match[0][0])];
            }
            $offset = $start + strlen($match[0][0]);
        }
        $addtext(substr($text, $offset));

        // Merge adjacent text pieces so a row's prose is one string.
        $merged = [];
        foreach ($segments as $segment) {
            $last = count($merged) - 1;
            if ($segment[0] === 'text' && $last >= 0 && $merged[$last][0] === 'text') {
                $merged[$last][1] .= $segment[1];
            } else {
                $merged[] = $segment;
            }
        }

        // "\\(x=4\\) or \\(x=-2\\)": two relations with only a connective between
        // them state one thing. As two formulas, the last one alone would be
        // read as the answer. "\\(x\\) and \\(y\\) are positive" is prose, and
        // formulas on separate rows stay on their rows.
        $joined = [];
        foreach ($merged as $segment) {
            $count = count($joined);
            if ($segment[0] === 'inline' && $count >= 2 && $joined[$count - 2][0] === 'inline'
                    && $joined[$count - 1][0] === 'text' && strpos($joined[$count - 1][1], "\n") === false
                    && statement_splitter::connective($joined[$count - 1][1]) !== null
                    && statement_splitter::has_relation($joined[$count - 2][1]) && statement_splitter::has_relation($segment[1])) {
                $word = trim(array_pop($joined)[1]);
                $joined[$count - 2][1] .= ' \\text{' . $word . '} ' . $segment[1];
                continue;
            }
            $joined[] = $segment;
        }
        return $joined;
    }

    /** A review row from its prose and maths parts, or null for an empty row. */
    private static function document_row_line(array $parts): ?array {
        $text = trim(implode('', array_map(static function(array $part): string {
            return $part[0] === 'text' ? $part[1] : '';
        }, $parts)));
        $mathparts = array_values(array_filter(array_map(static function(array $part): array {
            $math = $part[0] === 'math' ? line_builder::clean_line_latex($part[1]) : '';
            return [$math, $part[2] ?? ''];
        }, $parts), static function(array $part): bool {
            return $part[0] !== '';
        }));
        $maths = array_map(static function(array $part): string {
            return $part[0];
        }, $mathparts);
        /*
         * Keep every Mathpix AsciiMath formula on a mixed row. If Mathpix did
         * not provide one of them, only that formula falls back to the existing
         * LaTeX conversion instead of making the whole row lose its OCR ASCII.
         */
        $ascii = implode(',', array_map(static function(array $part): string {
            if (trim($part[1]) !== '') {
                return trim($part[1]);
            }
            $math = math_extractor::extract($part[0]);
            return $math === '' ? '' : \local_hand2stack\converter\stack_converter::normalize($math);
        }, $mathparts));
        if ($text === '' && !$maths) {
            return null;
        }
        // The text endpoint may prepend the uploaded filename as a header.
        if (!$maths && line_builder::is_filename_row($text)) {
            return null;
        }

        $display = [];
        $source = '';
        foreach ($parts as [$type, $value]) {
            if ($type === 'text') {
                $source .= $value;
                if (trim($value) !== '') {
                    // Keep the spaces that separate this text from the maths around it.
                    $display[] = ['type' => 'text', 'text' => ($display && preg_match('/^\s/u', $value) ? ' ' : '')
                        . line_builder::display_latex($value) . (preg_match('/\s$/u', $value) ? ' ' : '')];
                }
                continue;
            }
            $math = line_builder::clean_line_latex($value);
            if ($math !== '') {
                $source .= '$' . $math . '$';
                $display[] = ['type' => 'math', 'latex' => $math];
            }
        }
        $source = trim($source);
        if (!$maths) {
            return line_builder::candidate_line($source, '', $display);
        }
        // A row holding only one formula is that formula. With several, every
        // one is kept, in order: "\\(a<-2\\), \\(2<a\\)" is "a<-2,2<a", and
        // "\\(x>2\\) なので \\(x=4\\)" is "x>2,x=4". Choosing one would guess
        // which the answer is and silently drop the others.
        if ($text === '' && count($maths) === 1) {
            $source = $maths[0];
        }
        $math = implode(', ', array_map([math_extractor::class, 'extract'], $maths));
        return line_builder::candidate_line($source, $math, $display, $ascii);
    }

    /** The next pair whose LaTeX is this formula's, or no ASCII fallback. */
    private static function matching_ascii(string $latex, array $pairs, int &$next): string {
        $wanted = preg_replace('/\s+/', '', trim($latex));
        for ($i = $next, $count = count($pairs); $i < $count; $i++) {
            if (!is_array($pairs[$i]) || !isset($pairs[$i][0], $pairs[$i][1])) {
                continue;
            }
            if (preg_replace('/\s+/', '', trim((string)$pairs[$i][0])) !== $wanted) {
                continue;
            }
            $next = $i + 1;
            return trim((string)$pairs[$i][1]);
        }
        return '';
    }
}
