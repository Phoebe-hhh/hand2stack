<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * strokes.php for Hand2STACK.
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
    if (!get_config('local_hand2stack', 'enabled')) {
        throw new moodle_exception('pluginnotenabled', 'local_hand2stack');
    }

    \local_hand2stack\local\request_limiter::enforce();

    $json = required_param('strokes', PARAM_RAW);
    $strokes = json_decode($json, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($strokes)) {
        throw new moodle_exception('invalidstrokes', 'local_hand2stack');
    }

    $result = \local_hand2stack\local\mathpix_client::recognize_strokes(
        $strokes['x'] ?? [],
        $strokes['y'] ?? []
    );

    echo json_encode([
        'success' => true,
        'raw_latex' => $result['raw_latex'],
        'raw_asciimath' => $result['raw_asciimath'],
        'raw_text' => $result['raw_text'],
        'freetext' => $result['freetext'],
        'stack' => $result['stack'],
        'text' => $result['text'],
        'lines' => $result['lines'],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    \local_hand2stack\local\api_response::send_error($error);
}
