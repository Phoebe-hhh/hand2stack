<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Turn a Mathpix response into the recognition result the browser receives.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\ocr;

use local_hand2stack\converter\stack_converter;
use local_hand2stack\layout\document_builder;
use local_hand2stack\layout\freetext_builder;

defined('MOODLE_INTERNAL') || die();

final class response_parser {
    public static function parse($body, int $errno, string $error, int $status): array {
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
        // Mathpix can answer 200 with an error (an unreadable image, for
        // example); without this the learner would only see an empty result.
        if (!empty($data['error'])) {
            $message = is_string($data['error']) ? $data['error'] : json_encode($data['error']);
            throw new \moodle_exception('mathpixrequestfailed', 'local_hand2stack', '', null, $message);
        }

        $rawlatex = self::extract_latex($data);
        $rawascii = self::extract_data_value($data, 'asciimath');
        $rawtext = isset($data['text']) && is_string($data['text']) ? trim($data['text']) : '';
        // The data/latex field may contain only the first formula in a page.
        // Mathpix's text field contains the complete document, including prose
        // and every maths line, so use it for the algebraic review rows.
        $asciimath = self::asciimath_by_latex($data);
        $lines = document_builder::build_document_lines($rawtext, $rawlatex, $asciimath);
        $stack = self::recommended_stack($lines);
        if ($stack === '') {
            $stack = stack_converter::normalize_selection($rawlatex);
        }

        return [
            'raw_latex' => $rawlatex,
            'raw_asciimath' => $rawascii,
            'raw_text' => $rawtext,
            'freetext' => freetext_builder::build($rawtext, $rawascii, $rawlatex, $asciimath),
            'stack' => $stack,
            'text' => $stack,
            'lines' => $lines,
            'mathpix' => $data,
        ];
    }

    private static function recommended_stack(array $lines): string {
        for ($i = count($lines) - 1; $i >= 0; $i--) {
            if ($lines[$i]['stack'] !== '') {
                return $lines[$i]['stack'];
            }
        }
        return '';
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

    /**
     * Each formula's [LaTeX, AsciiMath], in the order Mathpix lists them: an
     * asciimath item followed by the latex item of the same formula.
     */
    private static function asciimath_by_latex(array $response): array {
        $pairs = [];
        $ascii = null;
        foreach (is_array($response['data'] ?? null) ? $response['data'] : [] as $item) {
            if (!is_array($item) || !is_string($item['value'] ?? null)) {
                continue;
            }
            if (($item['type'] ?? '') === 'asciimath') {
                $ascii = trim($item['value']);
            } else if (($item['type'] ?? '') === 'latex' && $ascii !== null) {
                $pairs[] = [trim($item['value']), $ascii];
                $ascii = null;
            }
        }
        return $pairs;
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
