<?php
// This file is part of Moodle - http://moodle.org/.
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

namespace local_stackinputhelper\local;

defined('MOODLE_INTERNAL') || die();

/** Shared JSON error responses for plugin endpoints. */
final class api_response {
    /** Error codes which are safe and useful to expose to the user. */
    private const SAFE_ERROR_CODES = [
        'invalidfiletype', 'filetoolarge', 'emptyuploadedfile', 'invalidimagecontents',
        'imagedimensionstoolarge', 'imagevalidationunavailable', 'unsupportedserverimageformat',
        'missingmathpixcredentials', 'invaliduploadedfile', 'curlrequired', 'mathpixrequestfailed',
        'mathpixinvalidresponse', 'pluginnotenabled', 'mobilenotenabled', 'sessionexpired',
        'invalidstrokes', 'emptylatex', 'invalidstackexpression', 'stackvalidationunavailable',
        'ratelimitexceeded',
    ];

    /**
     * Log the diagnostic server-side and return a safe client message.
     *
     * @param \Throwable $error The original failure.
     * @param int $status HTTP status code.
     */
    public static function send_error(\Throwable $error, int $status = 0): void {
        error_log('[local_stackinputhelper] ' . $error);
        $errorcode = $error instanceof \moodle_exception ? $error->errorcode : '';
        if (!in_array($errorcode, self::SAFE_ERROR_CODES, true)) {
            $errorcode = 'requestfailed';
        }
        if ($status === 0) {
            $status = self::status_for_error($errorcode);
        }
        http_response_code($status);
        echo json_encode([
            'success' => false,
            'error' => get_string($errorcode, 'local_stackinputhelper'),
            'error_code' => $errorcode,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /** Return an appropriate HTTP status without exposing diagnostics. */
    private static function status_for_error(string $errorcode): int {
        if ($errorcode === 'ratelimitexceeded') {
            return 429;
        }
        if ($errorcode === 'sessionexpired') {
            return 410;
        }
        if ($errorcode === 'filetoolarge' || $errorcode === 'imagedimensionstoolarge') {
            return 413;
        }
        if (in_array($errorcode, [
            'missingmathpixcredentials', 'curlrequired', 'imagevalidationunavailable',
            'stackvalidationunavailable', 'mathpixrequestfailed', 'mathpixinvalidresponse',
        ], true)) {
            return 503;
        }
        return 400;
    }
}
