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
    /**
     * Log the diagnostic server-side and return a safe client message.
     *
     * @param \Throwable $error The original failure.
     * @param int $status HTTP status code.
     */
    public static function send_error(\Throwable $error, int $status = 400): void {
        error_log('[local_stackinputhelper] ' . $error);
        http_response_code($status);
        echo json_encode([
            'success' => false,
            'error' => get_string('requestfailed', 'local_stackinputhelper'),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
