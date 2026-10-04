<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * session result.php for Hand2STACK.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define('AJAX_SCRIPT', true);

require_once(__DIR__ . '/../../config.php');

require_login();
require_capability('local/hand2stack:use', context_system::instance());

header('Content-Type: application/json; charset=utf-8');

try {
    global $DB, $USER;

    if (!get_config('local_hand2stack', 'enabled')) {
        throw new moodle_exception('pluginnotenabled', 'local_hand2stack');
    }
    if (!get_config('local_hand2stack', 'enablemobile')) {
        throw new moodle_exception('mobilenotenabled', 'local_hand2stack');
    }

    $sessionid = required_param('session', PARAM_ALPHANUMEXT);
    $record = $DB->get_record('local_hand2stack_sess', ['sessionid' => $sessionid], '*', MUST_EXIST);

    if ((int)$record->userid !== (int)$USER->id) {
        throw new moodle_exception('nopermissions', 'error', '', get_string('view'));
    }

    if ((int)$record->expiresat < time()) {
        $record->status = 'expired';
        $record->timemodified = time();
        $DB->update_record('local_hand2stack_sess', $record);
    }

    echo json_encode([
        'success' => true,
        'ready' => $record->status === 'done',
        'expired' => $record->status === 'expired',
        'status' => $record->status,
        'raw_latex' => $record->rawlatex,
        'raw_asciimath' => $record->rawascii,
        'raw_text' => $record->rawtext,
        'stack' => $record->stack,
        'text' => $record->resulttext,
        'freetext' => $record->resulttext,
        'lines' => \local_hand2stack\local\mathpix_client::build_document_lines(
            (string)$record->rawtext,
            (string)$record->rawlatex
        ),
        'updated_at' => (int)$record->timemodified,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    \local_hand2stack\local\api_response::send_error($error);
}
