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
        ];

        $postfields = [
            'file' => new \CURLFile($filepath, $mimetype, $filename),
            'options_json' => json_encode($options),
        ];

        $curl = curl_init(self::ENDPOINT);
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'app_id: ' . $appid,
                'app_key: ' . $appkey,
            ],
            CURLOPT_POSTFIELDS => $postfields,
            CURLOPT_TIMEOUT => 40,
        ]);

        $body = curl_exec($curl);
        $errno = curl_errno($curl);
        $error = curl_error($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);

        if ($body === false || $errno !== 0) {
            throw new \moodle_exception('mathpixrequestfailed', 'local_hand2stack', '', null, $error);
        }

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
        ]);
        if ($payload === false || strlen($payload) > 512 * 1024) {
            throw new \moodle_exception('invalidstrokes', 'local_hand2stack');
        }

        $curl = curl_init(self::STROKES_ENDPOINT);
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'app_id: ' . $appid,
                'app_key: ' . $appkey,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_TIMEOUT => 40,
        ]);
        $body = curl_exec($curl);
        $errno = curl_errno($curl);
        $error = curl_error($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);

        return self::parse_response($body, $errno, $error, $status);
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
        if ($body === false || $errno !== 0) {
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
        // TeX delimiters. Replace each mathematical fragment independently so a
        // paragraph such as "Therefore, \\(x=3\\)." remains readable prose.
        $patterns = [
            '/\\\\\[([\\s\\S]*?)\\\\\]/u',
            '/\\$\\$([\\s\\S]*?)\\$\\$/u',
            '/(?<!\\$)\\$\\s*(\\\\begin\\{(?:aligned|gathered|split|align|array)\\*?\\}'
                . '(?:\\{[^}]*\\})?[\\s\\S]*?\\\\end\\{(?:aligned|gathered|split|align|array)\\*?\\})'
                . '\\s*\\$(?!\\$)/u',
            '/\\\\\(([\\s\\S]*?)\\\\\)/u',
            '/(?<!\\$)\\$([^$\\n]+?)\\$(?!\\$)/u',
        ];
        foreach ($patterns as $pattern) {
            $text = preg_replace_callback($pattern, static function(array $match): string {
                $math = self::freetext_math_to_ascii(trim($match[1]));
                return $math === '' ? trim($match[1]) : self::wrap_freetext_math($math);
            }, $text);
        }

        // Some Mathpix responses contain a bare display environment rather
        // than wrapping it in \[...\]. Treat it as one maths region, but
        // convert its rows independently so environment names and prose
        // commands can never become implicit products such as b*e*g*i*n.
        $text = preg_replace_callback(
            '/\\\\begin\{(aligned|gathered|split|align|array)\*?\}(?:\{[^}]*\})?([\s\S]*?)'
                . '\\\\end\{\1\*?\}/u',
            static function(array $match): string {
                $math = self::freetext_math_to_ascii($match[0]);
                return $math === '' ? trim($match[0]) : self::wrap_freetext_math($math);
            },
            $text
        );

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
            return '`' . $row . '`';
        }, $rows));
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
            if (!empty($line['synthetic'])) {
                continue;
            }
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
                $approx = preg_replace('/\\\\(?:approx|simeq|sim)(?![A-Za-z])/', '=', $linelatex);
                $stack = stack_converter::normalize_selection($approx);
                $stack = preg_replace('/=/', '~~', $stack, 1);
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

    public static function build_lines(string $latex): array {
        $latex = trim($latex);
        if ($latex === '') {
            return [];
        }

        $normalized = str_replace(["\r\n", "\r"], "\n", $latex);
        $normalized = preg_replace('/^\$\s*/', '', $normalized);
        $normalized = preg_replace('/\s*\$$/', '', $normalized);
        $normalized = preg_replace('/^\\\\\[\s*/', '', $normalized);
        $normalized = preg_replace('/\s*\\\\\]$/', '', $normalized);

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
            $math = self::remove_prose_boundary_artifact($part, $math);
            $metadata = self::classify_candidate($part, $math);
            $stack = $math === '' ? '' : stack_converter::normalize($math);
            $normalized = $math === '' ? '' : stack_converter::normalize($metadata['value']);
            $lines[] = [
                'raw' => $part,
                'latex' => $part,
                'display' => self::display_latex($part),
                'display_parts' => self::display_parts($part, $math),
                'math' => $math,
                'ascii' => $stack,
                'normalized' => $normalized,
                'stack' => $stack,
                'type' => $metadata['type'],
                'relation' => $metadata['relation'],
            ];
        }

        $summary = self::assignment_summary($lines);
        if ($summary !== null) {
            $lines[] = $summary;
        }

        return $lines;
    }

    /**
     * Remove an OCR letter left between a prose cue and the real expression.
     * Example: "\\text{Finall} y. 1<=x<=3" must yield "1<=x<=3", not y.1...
     */
    private static function remove_prose_boundary_artifact(string $raw, string $math): string {
        if ($math === '' || preg_match('/(?:finall?|therefore|hence|thus|so)[^A-Za-z]/iu', $raw) !== 1) {
            return $math;
        }
        return trim(preg_replace('/^[A-Za-z]\s*[.,:]\s*(?=[0-9(])/u', '', $math));
    }

    /** Build every visible document row, retaining prose around its maths. */
    public static function build_document_lines(string $text, string $latex = ''): array {
        $text = trim(str_replace(["\r\n", "\r"], "\n", $text));
        if ($text === '') {
            return self::build_lines($latex);
        }

        $lines = self::build_lines($text);
        if (!$lines && trim($latex) !== '') {
            return self::build_lines($latex);
        }
        return $lines;
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

    private static function assignment_summary(array $lines): ?array {
        $assignments = [];
        $variables = [];
        for ($i = count($lines) - 1; $i >= 0; $i--) {
            $stack = trim($lines[$i]['stack'] ?? '');
            if (!preg_match('/^([a-zA-Z])=([^=,]+)$/', $stack, $match)) {
                if ($assignments) {
                    break;
                }
                continue;
            }
            if (isset($variables[$match[1]])) {
                break;
            }
            $variables[$match[1]] = true;
            $assignments[] = $match[1] . '=' . $match[2];
        }
        if (count($assignments) < 2) {
            return null;
        }

        $stack = '[' . implode(',', $assignments) . ']';
        $latex = implode(',\\ ', $assignments);
        return [
            'raw' => $latex,
            'latex' => $latex,
            'display' => $latex,
            'display_parts' => [['type' => 'math', 'latex' => $latex]],
            'math' => $latex,
            'stack' => $stack,
            'ascii' => $stack,
            'normalized' => $stack,
            'type' => 'expression',
            'relation' => null,
            'synthetic' => true,
        ];
    }

    private static function extract_multiline_body(string $latex): ?string {
        if (!preg_match('/^\\\\begin\{(aligned|gathered|split|align|array)\*?\}(?:\{[^}]*\})?([\s\S]*?)\\\\end\{\1\*?\}$/', trim($latex), $match)) {
            return null;
        }

        return trim($match[2]);
    }

    private static function clean_line_latex(string $line): string {
        $line = trim($line);
        // Repair a common Mathpix boundary split: the final "y" in Finally
        // is emitted outside the prose command and otherwise looks like maths.
        $line = preg_replace('/\\\\text\s*\{\s*Finall\s*\}\s*y\b/iu', '\\text{Finally}', $line);
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
        $line = preg_replace('/^\$\s*([\s\S]*?)\s*\$$/u', '$1', $line);
        $line = preg_replace('/^\\\\\(\s*([\s\S]*?)\s*\\\\\)$/u', '$1', $line);
        $line = preg_replace('/^\\\\\[\s*([\s\S]*?)\s*\\\\\]$/u', '$1', $line);
        $line = preg_replace('/(?<!\\\\)\btext\s*\{/u', '\\text{', $line);

        // In Japanese handwriting Mathpix can read the compact sequence
        // "x=-" as the katakana-looking "メニー". Restrict the repair to
        // answer-labelled lines so ordinary Japanese prose is untouched.
        if (preg_match('/(?:答え|解答)/u', $line)) {
            $line = preg_replace('/[xｘメ]\s*[ニ二]\s*[ー−-]\s*(\d+(?:\.\d+)?)/u', 'x=-$1', $line);
            $line = preg_replace('/たす\s*$/u', 'です', $line);
        }
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
        $display = self::display_latex($line);
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
