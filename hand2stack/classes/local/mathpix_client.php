<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * classes local mathpix client.php for Hand2STACK.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\local;

defined('MOODLE_INTERNAL') || die();

final class mathpix_client {
    private const ENDPOINT = 'https://api.mathpix.com/v3/text';
    private const STROKES_ENDPOINT = 'https://api.mathpix.com/v3/strokes';

    public static function recognize(string $filepath, string $filename, string $mimetype): array {
        $appid = trim((string)get_config('local_hand2stack', 'mathpixappid'));
        $appkey = trim((string)get_config('local_hand2stack', 'mathpixappkey'));

        if ($appid === '' || $appkey === '') {
            throw new \moodle_exception('missingmathpixcredentials', 'local_hand2stack');
        }

        if (!is_readable($filepath)) {
            throw new \moodle_exception('invaliduploadedfile', 'local_hand2stack');
        }

        if (!function_exists('curl_init')) {
            throw new \moodle_exception('curlrequired', 'local_hand2stack');
        }

        $options = [
            'math_inline_delimiters' => ['$', '$'],
            'rm_spaces' => true,
            'formats' => ['text', 'data'],
            'data_options' => [
                'include_latex' => true,
                'include_asciimath' => true,
            ],
            // Learners' handwriting must not be kept to train Mathpix models.
            'metadata' => ['improve_mathpix' => false],
        ];

        $postfields = [
            'file' => new \CURLFile($filepath, $mimetype, $filename),
            'options_json' => json_encode($options),
        ];

        [$body, $errno, $error, $status] = self::post(self::ENDPOINT, $postfields, [
            'app_id: ' . $appid,
            'app_key: ' . $appkey,
        ]);

        return self::parse_response($body, $errno, $error, $status);
    }

    /** Recognize browser-captured digital ink without exposing Mathpix credentials. */
    public static function recognize_strokes(array $x, array $y): array {
        self::validate_strokes($x, $y);

        $appid = trim((string)get_config('local_hand2stack', 'mathpixappid'));
        $appkey = trim((string)get_config('local_hand2stack', 'mathpixappkey'));
        if ($appid === '' || $appkey === '') {
            throw new \moodle_exception('missingmathpixcredentials', 'local_hand2stack');
        }
        if (!function_exists('curl_init')) {
            throw new \moodle_exception('curlrequired', 'local_hand2stack');
        }

        $payload = json_encode([
            'strokes' => ['strokes' => ['x' => $x, 'y' => $y]],
            'math_inline_delimiters' => ['$', '$'],
            'rm_spaces' => true,
            'formats' => ['text', 'data'],
            'data_options' => [
                'include_latex' => true,
                'include_asciimath' => true,
            ],
            // Learners' handwriting must not be kept to train Mathpix models.
            'metadata' => ['improve_mathpix' => false],
        ]);
        if ($payload === false || strlen($payload) > 512 * 1024) {
            throw new \moodle_exception('invalidstrokes', 'local_hand2stack');
        }

        [$body, $errno, $error, $status] = self::post(self::STROKES_ENDPOINT, $payload, [
            'app_id: ' . $appid,
            'app_key: ' . $appkey,
            'Content-Type: application/json',
        ]);

        return self::parse_response($body, $errno, $error, $status);
    }

    /**
     * Send a request through Moodle's HTTP client, so the site's outgoing proxy
     * and HTTP security settings apply as they do to the rest of Moodle.
     */
    private static function post(string $url, $postfields, array $headers): array {
        global $CFG;
        require_once($CFG->libdir . '/filelib.php');

        $curl = new \curl();
        $curl->setHeader($headers);
        $body = $curl->post($url, $postfields, ['CURLOPT_TIMEOUT' => 40]);
        $errno = (int)$curl->get_errno();
        $status = (int)($curl->get_info()['http_code'] ?? 0);
        // A URL blocked by the site's HTTP security settings is never sent;
        // the client returns the reason as the body, with no status.
        $error = $errno !== 0 ? (string)$curl->error : ($status === 0 ? (string)$body : '');
        return [$body, $errno, $error, $status];
    }

    private static function validate_strokes(array $x, array $y): void {
        if (!$x || count($x) !== count($y) || count($x) > 1000) {
            throw new \moodle_exception('invalidstrokes', 'local_hand2stack');
        }
        $pointcount = 0;
        foreach ($x as $index => $xstroke) {
            $ystroke = $y[$index] ?? null;
            if (!is_array($xstroke) || !is_array($ystroke) || !$xstroke || count($xstroke) !== count($ystroke)) {
                throw new \moodle_exception('invalidstrokes', 'local_hand2stack');
            }
            $pointcount += count($xstroke);
            if ($pointcount > 50000) {
                throw new \moodle_exception('invalidstrokes', 'local_hand2stack');
            }
            foreach ($xstroke as $pointindex => $xvalue) {
                $yvalue = $ystroke[$pointindex];
                if (!is_numeric($xvalue) || !is_numeric($yvalue)
                        || abs((float)$xvalue) > 100000 || abs((float)$yvalue) > 100000) {
                    throw new \moodle_exception('invalidstrokes', 'local_hand2stack');
                }
            }
        }
    }

    private static function parse_response($body, int $errno, string $error, int $status): array {
        if ($body === false || $errno !== 0 || $status === 0) {
            throw new \moodle_exception('mathpixrequestfailed', 'local_hand2stack', '', null, $error);
        }

        $data = json_decode($body, true);
        if (!is_array($data)) {
            throw new \moodle_exception('mathpixinvalidresponse', 'local_hand2stack');
        }

        if ($status < 200 || $status >= 300) {
            $message = $data['error'] ?? $data['message'] ?? ('HTTP ' . $status);
            throw new \moodle_exception('mathpixrequestfailed', 'local_hand2stack', '', null, $message);
        }

        $rawlatex = self::extract_latex($data);
        $rawascii = self::extract_data_value($data, 'asciimath');
        $rawtext = isset($data['text']) && is_string($data['text']) ? trim($data['text']) : '';
        // The data/latex field may contain only the first formula in a page.
        // Mathpix's text field contains the complete document, including prose
        // and every maths line, so use it for the algebraic review rows.
        $lines = self::build_document_lines($rawtext, $rawlatex);
        $stack = self::recommended_stack($lines);
        if ($stack === '') {
            $stack = stack_converter::normalize_selection($rawlatex);
        }

        return [
            'raw_latex' => $rawlatex,
            'raw_asciimath' => $rawascii,
            'raw_text' => $rawtext,
            'freetext' => self::build_freetext($rawtext, $rawascii, $rawlatex),
            'stack' => $stack,
            'text' => $stack,
            'lines' => $lines,
            'mathpix' => $data,
        ];
    }

    /**
     * Preserve Mathpix prose and paragraphs while converting only delimited maths
     * into STACK free-text inline mathematics.
     */
    public static function build_freetext(string $text, string $ascii = '', string $latex = ''): string {
        $text = trim(str_replace(["\r\n", "\r"], "\n", $text));
        if ($text === '') {
            $fallback = trim(str_replace(["\r\n", "\r"], "\n", $ascii));
            if ($fallback === '' && trim($latex) !== '') {
                $fallback = stack_converter::normalize_selection($latex);
            }
            return $fallback === '' ? '' : "`{$fallback}`";
        }

        // Mathpix's text format keeps prose as text and marks mathematics with
        // TeX delimiters, read by the same document_segments() as the review
        // rows. Only the maths is converted, so a paragraph such as
        // "Therefore, \\(x=3\\)." remains readable prose.
        $converted = '';
        foreach (self::document_segments($text) as [$type, $value]) {
            if ($type === 'text') {
                $converted .= $value;
                continue;
            }
            [$prose, $latex] = stack_converter::split_leading_prose($value);
            $math = $latex === '' ? '' : self::freetext_math_to_ascii($latex);
            $converted .= trim($prose . ' ' . ($math === '' ? $latex : self::wrap_freetext_math($math)));
        }
        $text = $converted;

        $text = preg_replace('/`[ \t]*`/u', "`\n`", $text);
        return trim(preg_replace("/\\n{3,}/", "\n\n", $text));
    }

    /** Wrap every converted row independently so STACK preserves line boundaries. */
    private static function wrap_freetext_math(string $math): string {
        $rows = preg_split('/\n+/', trim($math));
        $rows = array_values(array_filter(array_map('trim', $rows), static function(string $row): bool {
            return $row !== '';
        }));
        return implode("\n", array_map(static function(string $row): string {
            // A row split into statements already marks its own maths.
            return strpos($row, '`') === false ? '`' . $row . '`' : $row;
        }, $rows));
    }

    /**
     * Mark each statement of a row separately and keep the prose between them
     * as text: "x>0 \\text{and} x-2>0, \\text{so} x>2" becomes
     * "`x>0 and x-2>0`, so `x>2`". Null when the row is a single statement.
     */
    private static function freetext_statements(string $latex): ?string {
        $segments = stack_converter::split_statements($latex);
        if (count($segments) < 2) {
            return null;
        }
        $row = '';
        foreach ($segments as [$type, $text]) {
            if ($type === 'math') {
                $math = stack_converter::normalize_selection($text);
                if ($math === '') {
                    continue;
                }
                $piece = '`' . $math . '`';
            } else {
                $piece = $text;
            }
            $row .= ($row === '' || preg_match('/^[,.;:]/', $piece) ? '' : ' ') . $piece;
        }
        return $row;
    }

    /** Convert one Free-text maths region without treating TeX layout as algebra. */
    private static function freetext_math_to_ascii(string $latex): string {
        $converted = [];
        $numbering = [];
        $multilinebody = self::extract_multiline_body(trim($latex));
        if ($multilinebody !== null) {
            $rawrows = preg_split('/(?:\n+|\\\\\\\\)/', $multilinebody);
            foreach ($rawrows as $rawrow) {
                if (preg_match('/^\s*&?\s*(\d+)\s*[\.\)]\s*/', $rawrow, $match)) {
                    $numbering[] = $match[1] . '. ';
                } else {
                    $numbering[] = '';
                }
            }
        }
        $rowindex = 0;
        foreach (self::build_lines($latex) as $line) {
            $stack = trim((string)($line['stack'] ?? ''));
            $linelatex = (string)($line['latex'] ?? '');
            $withoutproofarrow = preg_replace(
                '/^(?:\\s|\\\\[,;:! ])*\\\\(?:Rightarrow|Longrightarrow|implies|Leftrightarrow|iff)\\s*/',
                '',
                $linelatex
            );
            if ($withoutproofarrow !== $linelatex) {
                $linelatex = $withoutproofarrow;
                $stack = stack_converter::normalize_selection($linelatex);
            }
            if (preg_match('/\\\\(?:approx|simeq|sim)(?![A-Za-z])/', $linelatex)) {
                // Convert each side separately so "~~" lands where the approximation was,
                // not on an earlier "=" in the same row.
                $sides = preg_split('/\\\\(?:approx|simeq|sim)(?![A-Za-z])/', $linelatex);
                $stack = implode('~~', array_map(static function(string $side): string {
                    return trim($side) === '' ? '' : stack_converter::normalize_selection($side);
                }, $sides));
            }
            $statements = self::freetext_statements($linelatex);
            if ($statements !== null) {
                $stack = $statements;
            }
            if ($stack !== '') {
                $converted[] = ($numbering[$rowindex] ?? '') . $stack;
            }
            $rowindex++;
        }
        if ($converted) {
            return implode("\n", $converted);
        }
        return stack_converter::normalize_selection($latex);
    }

    /**
     * Candidate rows for review. A Mathpix document (its text format, where
     * every formula sits inside $...$, \\(...\\) or \\[...\\]) is split by those
     * delimiters; a bare LaTeX formula is maths throughout.
     */
    public static function build_lines(string $latex): array {
        // "\\(" is a LaTeX line break before "(", not an opening \(.
        if (preg_match('/\$|(?<!\\\\)\\\\[(\[]/u', $latex)) {
            return self::build_document_rows($latex);
        }
        return self::build_math_lines($latex);
    }

    /** Rows of a bare LaTeX formula: every row is maths; prose is only \\text{...}. */
    private static function build_math_lines(string $latex): array {
        $latex = trim($latex);
        if ($latex === '') {
            return [];
        }

        $normalized = str_replace(["\r\n", "\r"], "\n", $latex);
        // Unwrap the document only when a single delimiter pair encloses all
        // of it. A text document such as "... the larger one is $x=3$" ends
        // with an inline formula whose closing "$" belongs to that row.
        if (preg_match('/^\$(?!\$)([^$]*)\$$/u', $normalized, $match)) {
            $normalized = trim($match[1]);
        } else if (preg_match('/^\\\\\[((?:(?!\\\\[\[\]])[\s\S])*)\\\\\]$/u', $normalized, $match)) {
            $normalized = trim($match[1]);
        }

        $multiline = self::extract_multiline_body($normalized);
        if ($multiline !== null) {
            $parts = preg_split('/(?:\n+|\\\\\\\\)/', $multiline);
        } else if (preg_match_all('/\\\\begin\{(?:pmatrix|bmatrix|matrix|vmatrix)\}/', $normalized) > 1) {
            $marked = preg_replace(
                '/(\\\\end\{(?:pmatrix|bmatrix|matrix|vmatrix)\})\s*\n+\s*(?=\\\\begin\{(?:pmatrix|bmatrix|matrix|vmatrix)\})/',
                '$1__HAND2STACK_MATRIX_SPLIT__',
                $normalized
            );
            $parts = explode('__HAND2STACK_MATRIX_SPLIT__', $marked);
        } else if (preg_match('/\\\\begin\{(?:cases|pmatrix|bmatrix|matrix|vmatrix)\}/', $normalized)
                || preg_match('/\\\\left\s*\\\\?[({\[]?\s*\\\\begin\{array\}/', $normalized)) {
            $parts = [$normalized];
        } else {
            $parts = preg_split('/(?:\n+|\\\\\\\\)/', $normalized);
        }

        $lines = [];
        foreach ($parts as $part) {
            // Mathpix may put display-math delimiters on their own physical
            // rows. They are document markup, not recognized student content.
            if (preg_match('/^\s*(?:\\\\\[|\\\\\]|\$\$?)\s*$/u', $part)) {
                continue;
            }
            // The text endpoint may prepend the uploaded filename as a header.
            if (preg_match('#^\s*[^/\\\\]+\.(?:png|jpe?g|heic|webp|gif)\s*$#iu', $part)) {
                continue;
            }
            $part = self::clean_line_latex($part);
            if ($part === '') {
                continue;
            }

            $math = stack_converter::extract_math($part);
            $lines[] = self::candidate_line($part, $math, self::display_parts($part, $math));
        }

        return $lines;
    }

    /** Build every visible document row, retaining prose around its maths. */
    public static function build_document_lines(string $text, string $latex = ''): array {
        $text = trim(str_replace(["\r\n", "\r"], "\n", $text));
        if ($text === '') {
            return self::build_math_lines($latex);
        }

        $lines = self::build_document_rows($text);
        $hasmath = array_filter($lines, static function(array $line): bool {
            return $line['math'] !== '';
        });
        if (!$hasmath && trim($latex) !== '') {
            return self::build_math_lines($latex);
        }
        return $lines;
    }

    /**
     * One review row per document row. Mathpix decides what is prose: text
     * outside the formula delimiters is shown as text and never converted.
     */
    private static function build_document_rows(string $text): array {
        $lines = [];
        $row = [];
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
                foreach (self::build_math_lines($value) as $line) {
                    $lines[] = $line;
                }
                continue;
            }
            if ($type === 'inline') {
                $row[] = ['math', $value];
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
    private static function document_segments(string $text): array {
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
            if ($group(3) !== null || $group(4) !== null) {
                $segments[] = ['inline', trim($group(3) ?? $group(4))];
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
                    && stack_converter::connective($joined[$count - 1][1]) !== null
                    && stack_converter::has_relation($joined[$count - 2][1]) && stack_converter::has_relation($segment[1])) {
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
        $maths = array_values(array_filter(array_map(static function(array $part): string {
            return $part[0] === 'math' ? self::clean_line_latex($part[1]) : '';
        }, $parts), static function(string $math): bool {
            return $math !== '';
        }));
        if ($text === '' && !$maths) {
            return null;
        }
        // The text endpoint may prepend the uploaded filename as a header.
        if (!$maths && preg_match('#^[^/\\\\]+\.(?:png|jpe?g|heic|webp|gif)$#iu', $text)) {
            return null;
        }

        $display = [];
        $source = '';
        foreach ($parts as [$type, $value]) {
            if ($type === 'text') {
                $source .= $value;
                if (trim($value) !== '') {
                    $display[] = ['type' => 'text', 'text' => self::display_latex($value) . (preg_match('/\s$/u', $value) ? ' ' : '')];
                }
                continue;
            }
            $math = self::clean_line_latex($value);
            if ($math !== '') {
                $source .= '$' . $math . '$';
                $display[] = ['type' => 'math', 'latex' => $math];
            }
        }
        $source = trim($source);
        if (!$maths) {
            return self::candidate_line($source, '', $display);
        }
        // A row holding only one formula is that formula; with prose or
        // several formulas, the last formula is the row's statement, as in
        // the learner's Free-text working ("Since `x>2`, `x=4`").
        if ($text === '' && count($maths) === 1) {
            $source = $maths[0];
        }
        $math = stack_converter::extract_math($maths[count($maths) - 1]);
        return self::candidate_line($source, $math, $display);
    }

    /** The review row for $source whose maths is $math. */
    private static function candidate_line(string $source, string $math, array $displayparts): array {
        $metadata = self::classify_candidate($source, $math);
        $stack = $math === '' ? '' : stack_converter::normalize($math);
        $normalized = $math === '' ? '' : stack_converter::normalize($metadata['value']);
        return [
            'raw' => $source,
            'latex' => $source,
            'display' => self::display_latex($source),
            'display_parts' => $displayparts,
            'math' => $math,
            'ascii' => $stack,
            'normalized' => $normalized,
            'stack' => $stack,
            'type' => $metadata['type'],
            'relation' => $metadata['relation'],
        ];
    }

    /** @return array{value:string,type:string,relation:?string} */
    private static function classify_candidate(string $raw, string $math): array {
        if ($math === '') {
            return ['value' => '', 'type' => 'text', 'relation' => null];
        }
        $value = trim($math);
        $relation = null;
        if (preg_match('/^\s*(?:~~|≈|\\\\approx)\s*/u', $value)) {
            $relation = 'approximate';
            $value = preg_replace('/^\s*(?:~~|≈|\\\\approx)\s*/u', '', $value);
        } else if (preg_match('/(?:~~|≈|\\\\approx)/u', $raw)) {
            $relation = 'approximate';
            $value = preg_replace('/(?:~~|≈|\\\\approx)\s*/u', '', $value);
        }
        if ($relation === 'approximate') {
            $value = preg_replace('/[.。]\s*$/u', '', trim($value));
        }
        $type = 'expression';
        if ($relation === 'approximate') {
            $type = 'approximation';
        } else if (preg_match('/(?:<=|>=|<|>|\\\\leq|\\\\geq|≤|≥)/u', $value)) {
            $type = 'condition';
        } else if (preg_match('/(?<![<>!#])=(?!=)/', $value)) {
            $type = 'equation';
        }
        return ['value' => $value, 'type' => $type, 'relation' => $relation];
    }

    private static function recommended_stack(array $lines): string {
        for ($i = count($lines) - 1; $i >= 0; $i--) {
            if ($lines[$i]['stack'] !== '') {
                return $lines[$i]['stack'];
            }
        }
        return '';
    }

    private static function extract_multiline_body(string $latex): ?string {
        if (!preg_match('/^\\\\begin\{(aligned|gathered|split|align|array)\*?\}(?:\{[^}]*\})?([\s\S]*?)\\\\end\{\1\*?\}$/', trim($latex), $match)) {
            return null;
        }

        return trim($match[2]);
    }

    private static function clean_line_latex(string $line): string {
        $line = trim($line);
        $line = preg_replace('/^\\\\begin\{(?:aligned|gathered|split|align|array)\*?\}(?:\{[^}]*\})?/', '', $line);
        $line = preg_replace('/\\\\end\{(?:aligned|gathered|split|align|array)\*?\}$/', '', $line);
        if (!preg_match('/\\\\begin\{(?:cases|array|pmatrix|bmatrix|matrix|vmatrix)\}/', $line)) {
            $line = str_replace('&', '', $line);
        }
        $line = str_replace(['\\therefore', '\\because'], '', $line);
        $line = preg_replace('/^\s*=\s*/', '', $line);
        $line = preg_replace('/^\s*(?:\d+[\.\)]\s*|[-*]\s+)/', '', $line);
        // Remove delimiters only when they wrap the complete row. Mixed prose
        // such as "Therefore, \(x>=1\)" must keep both delimiters until its
        // text and mathematical parts have been separated.
        // Mathpix can return nested delimiters such as "\\(\\(x=1\\)\\)".
        // Remove every complete outer layer before the browser adds its own.
        do {
            $previous = $line;
            $line = preg_replace('/^\$\$?\s*([\s\S]*?)\s*\$\$?$/u', '$1', $line);
            $line = preg_replace('/^\\\\\(\s*([\s\S]*?)\s*\\\\\)$/u', '$1', $line);
            $line = preg_replace('/^\\\\\[\s*([\s\S]*?)\s*\\\\\]$/u', '$1', $line);
            $line = trim($line);
        } while ($line !== $previous);
        $line = preg_replace('/(?<!\\\\)\btext\s*\{/u', '\\text{', $line);
        // A row that opens with an implication arrow ("\\Rightarrow f(2)=...")
        // continues the working; the arrow is not part of the expression.
        $line = preg_replace(
            '/^(?:\s|\\\\[,;:! ]|\\\\q?quad)*\\\\(?:Rightarrow|Longrightarrow|implies|Leftrightarrow|'
                . 'Longleftrightarrow|iff)(?![A-Za-z])\s*/u',
            '',
            $line
        );

        return trim($line);
    }

    private static function display_latex(string $line): string {
        $line = preg_replace('/\\\\text\s*\{\s*([^{}]*?)\s*\}/u', '$1', $line);
        $line = preg_replace('/(?<!\\\\)\btext\s*\{\s*([^{}]*?)\s*\}/u', '$1', $line);
        $line = str_replace(['\\(', '\\)', '\\[', '\\]'], '', $line);
        $line = preg_replace('/[$¥￥]/u', '', $line);
        $line = str_replace(['\\,', '\\;', '\\:', '\\!'], '', $line);
        return trim($line);
    }

    private static function display_parts(string $line, string $math): array {
        // Apply the same layout clean-up as extract_math(); otherwise a row
        // containing "\quad" or a Unicode minus cannot be located in the
        // display text and is shown twice (raw LaTeX plus rendered maths).
        $display = str_replace(['−', '–', '—', '＝'], ['-', '-', '-', '='], self::display_latex($line));
        $display = preg_replace('/\\\\q?quad(?![a-zA-Z])/u', ' ', $display);
        if ($math === '') {
            return [[
                'type' => 'text',
                'text' => $display,
            ]];
        }

        $mathdisplay = self::display_latex($math);
        $displaycompact = preg_replace('/\s+/u', '', $display);
        $mathcompact = preg_replace('/\s+/u', '', $mathdisplay);
        $pos = $mathcompact === '' ? false : mb_strpos($displaycompact, $mathcompact);

        if ($pos === false) {
            return [
                ['type' => 'text', 'text' => $display],
                ['type' => 'math', 'latex' => $math],
            ];
        }

        $parts = [];
        $offset = 0;
        $compactoffset = 0;
        $mathstart = null;
        $mathend = null;
        $chars = preg_split('//u', $display, -1, PREG_SPLIT_NO_EMPTY);
        foreach ($chars as $char) {
            $charlen = mb_strlen($char);
            if (!preg_match('/\s/u', $char)) {
                if ($compactoffset === $pos && $mathstart === null) {
                    $mathstart = $offset;
                }
                $compactoffset++;
                if ($compactoffset === $pos + mb_strlen($mathcompact) && $mathend === null) {
                    $mathend = $offset + $charlen;
                    break;
                }
            }
            $offset += $charlen;
        }

        if ($mathstart === null || $mathend === null) {
            return [
                ['type' => 'text', 'text' => $display],
                ['type' => 'math', 'latex' => $math],
            ];
        }

        $before = mb_substr($display, 0, $mathstart);
        $after = mb_substr($display, $mathend);
        if (trim($before) !== '') {
            $parts[] = ['type' => 'text', 'text' => $before];
        }
        $parts[] = ['type' => 'math', 'latex' => $math];
        if (trim($after) !== '') {
            $parts[] = ['type' => 'text', 'text' => $after];
        }

        return $parts;
    }

    private static function extract_latex(array $data): string {
        $value = self::extract_data_value($data, 'latex');

        foreach (['latex_styled', 'latex_simplified', 'text'] as $key) {
            if ($value !== '') {
                break;
            }
            if (!empty($data[$key]) && is_string($data[$key])) {
                $value = $data[$key];
                break;
            }
        }

        $value = trim($value);
        $value = preg_replace('/^\$\s*/', '', $value);
        $value = preg_replace('/\s*\$$/', '', $value);
        $value = preg_replace('/^\\\\\[\s*/', '', $value);
        $value = preg_replace('/\s*\\\\\]$/', '', $value);
        $value = preg_replace('/^\\\\\(\s*/', '', $value);
        $value = preg_replace('/\s*\\\\\)$/', '', $value);

        return trim($value);
    }

    private static function extract_data_value(array $response, string $type): string {
        if (empty($response['data']) || !is_array($response['data'])) {
            return '';
        }

        foreach ($response['data'] as $item) {
            if (is_array($item) && ($item['type'] ?? '') === $type && is_string($item['value'] ?? null)) {
                return trim($item['value']);
            }
        }

        return '';
    }
}
