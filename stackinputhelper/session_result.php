<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * session result.php for STACK Input Helper.
 *
 * @package    local_stackinputhelper
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define('AJAX_SCRIPT', true);

require_once(__DIR__ . '/../../config.php');

require_login();
require_capability('local/stackinputhelper:use', context_system::instance());

header('Content-Type: application/json; charset=utf-8');

try {
    global $DB, $USER;

    $sessionid = required_param('session', PARAM_ALPHANUMEXT);
    $record = $DB->get_record('local_stackinputhelper_sess', ['sessionid' => $sessionid], '*', MUST_EXIST);

    if ((int)$record->userid !== (int)$USER->id) {
        throw new moodle_exception('nopermissions', 'error', '', get_string('view'));
    }

    if ((int)$record->expiresat < time() && $record->status !== 'done') {
        $record->status = 'expired';
        $record->timemodified = time();
        $DB->update_record('local_stackinputhelper_sess', $record);
    }

    echo json_encode([
        'success' => true,
        'ready' => $record->status === 'done',
        'expired' => $record->status === 'expired',
        'status' => $record->status,
        'raw_latex' => $record->rawlatex,
        'raw_asciimath' => $record->rawascii,
        'stack' => $record->stack,
        'text' => $record->resulttext,
        'lines' => \local_stackinputhelper\local\mathpix_client::build_lines((string)$record->rawlatex),
        'updated_at' => (int)$record->timemodified,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $error->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
