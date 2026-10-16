<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Requests to the Mathpix text and strokes endpoints.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\ocr;

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

        return response_parser::parse($body, $errno, $error, $status);
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

        return response_parser::parse($body, $errno, $error, $status);
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
}
