<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * mobile upload.php for Hand2STACK.
 *
 * @package    local_stackinputhelper
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define('AJAX_SCRIPT', true);

require_once(__DIR__ . '/../../config.php');

require_login();
require_sesskey();
require_capability('local/stackinputhelper:use', context_system::instance());

header('Content-Type: application/json; charset=utf-8');

try {
    global $DB, $USER;

    $sessionid = required_param('session', PARAM_ALPHANUMEXT);
    $record = $DB->get_record('local_stackinputhelper_sess', ['sessionid' => $sessionid], '*', MUST_EXIST);

    if ((int)$record->userid !== (int)$USER->id) {
        throw new moodle_exception('nopermissions', 'error', '', get_string('edit'));
    }

    if ((int)$record->expiresat < time()) {
        $record->status = 'expired';
        $record->timemodified = time();
        $DB->update_record('local_stackinputhelper_sess', $record);
        throw new moodle_exception('sessionexpired', 'local_stackinputhelper');
    }

    $upload = \local_stackinputhelper\local\image_upload_validator::validate($_FILES['image'] ?? []);

    $result = \local_stackinputhelper\local\mathpix_client::recognize(
        $upload['filepath'],
        $upload['filename'],
        $upload['mimetype']
    );

    $record->status = 'done';
    $record->rawlatex = $result['raw_latex'];
    $record->rawascii = $result['raw_asciimath'];
    $record->stack = $result['stack'];
    $record->resulttext = $result['text'];
    $record->timemodified = time();
    $DB->update_record('local_stackinputhelper_sess', $record);

    echo json_encode([
        'success' => true,
        'raw_latex' => $result['raw_latex'],
        'raw_asciimath' => $result['raw_asciimath'],
        'stack' => $result['stack'],
        'text' => $result['text'],
        'lines' => $result['lines'],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    \local_stackinputhelper\local\api_response::send_error($error);
}
