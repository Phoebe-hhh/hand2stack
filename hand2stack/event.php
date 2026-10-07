<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * event.php for Hand2STACK.
 *
 * Receives batches of research interaction events from the page, either by
 * fetch or by navigator.sendBeacon. Every event is checked again on the
 * server, so a page that claims logging is on cannot record anyone who is not
 * a consenting participant in their own attempt.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define('AJAX_SCRIPT', true);

require_once(__DIR__ . '/../../config.php');

require_login();
require_sesskey();
require_capability('local/hand2stack:use', context_system::instance());

header('Content-Type: application/json; charset=utf-8');

try {
    if (!\local_hand2stack\local\research_logger::is_enabled()) {
        echo json_encode(['success' => true, 'accepted' => 0, 'disabled' => true]);
        exit;
    }

    $events = json_decode(required_param('events', PARAM_RAW), true);
    if (!is_array($events) || !array_is_list($events)) {
        throw new moodle_exception('invalidevents', 'local_hand2stack');
    }

    $counts = \local_hand2stack\local\research_logger::record_batch($events, (int)$USER->id);

    echo json_encode(['success' => true] + $counts);
} catch (Throwable $error) {
    \local_hand2stack\local\api_response::send_error($error);
}
