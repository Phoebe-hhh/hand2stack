<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * convert.php for Hand2STACK.
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

    $ascii = optional_param('ascii', '', PARAM_RAW_TRIMMED);
    $latex = optional_param('latex', '', PARAM_RAW_TRIMMED);
    if ($ascii === '' && $latex === '') {
        throw new moodle_exception('emptylatex', 'local_stackinputhelper');
    }

    $stack = $ascii !== ''
        ? \local_stackinputhelper\local\stack_converter::normalize_ascii($ascii)
        : \local_stackinputhelper\local\stack_converter::normalize_selection($latex);
    if ($stack === '') {
        throw new moodle_exception('invalidstackexpression', 'local_stackinputhelper');
    }

    $stackastfile = $CFG->dirroot . '/question/type/stack/stack/cas/ast.container.class.php';
    if (!is_readable($stackastfile)) {
        throw new moodle_exception('stackvalidationunavailable', 'local_stackinputhelper');
    }
    require_once($stackastfile);
    $ast = \stack_ast_container::make_from_student_source(
        $stack,
        'local_stackinputhelper',
        new \stack_cas_security()
    );
    if (!$ast->get_valid()) {
        throw new moodle_exception('invalidstackexpression', 'local_stackinputhelper');
    }

    echo json_encode([
        'success' => true,
        'stack' => $stack,
        'valid' => true,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    \local_stackinputhelper\local\api_response::send_error($error);
}
