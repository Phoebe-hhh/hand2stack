<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * strokes.php for STACK Input Helper.
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
    if (!get_config('local_stackinputhelper', 'enabled')) {
        throw new moodle_exception('pluginnotenabled', 'local_stackinputhelper');
    }

    $json = required_param('strokes', PARAM_RAW);
    $strokes = json_decode($json, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($strokes)) {
        throw new moodle_exception('invalidstrokes', 'local_stackinputhelper');
    }

    $result = \local_stackinputhelper\local\mathpix_client::recognize_strokes(
        $strokes['x'] ?? [],
        $strokes['y'] ?? []
    );

    echo json_encode([
        'success' => true,
        'raw_latex' => $result['raw_latex'],
        'raw_asciimath' => $result['raw_asciimath'],
        'stack' => $result['stack'],
        'text' => $result['text'],
        'lines' => $result['lines'],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $error->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
