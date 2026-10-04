<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * anchors.php for Hand2STACK.
 *
 * Returns the Syntax hints of a STACK question's inputs. STACK stops rendering
 * the hint once an empty answer has been submitted, so the page alone cannot
 * always tell which anchor (e.g. "f(2)=") belongs to which answer box.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define('AJAX_SCRIPT', true);

require_once(__DIR__ . '/../../config.php');
require_once($CFG->dirroot . '/question/engine/lib.php');

require_login();
require_sesskey();
require_capability('local/hand2stack:use', context_system::instance());

header('Content-Type: application/json; charset=utf-8');

try {
    if (!get_config('local_hand2stack', 'enabled')) {
        throw new moodle_exception('pluginnotenabled', 'local_hand2stack');
    }

    $usageid = required_param('usage', PARAM_INT);
    $slot = required_param('slot', PARAM_INT);

    // Only the learner's own quiz attempt (or a reviewer of it), or the
    // current user's own question preview.
    $attempt = $DB->get_record('quiz_attempts', ['uniqueid' => $usageid]);
    if ($attempt) {
        if ((int)$attempt->userid !== (int)$USER->id) {
            $cm = get_coursemodule_from_instance('quiz', $attempt->quiz, 0, false, MUST_EXIST);
            require_capability('mod/quiz:viewreports', context_module::instance($cm->id));
        }
    } else {
        $usage = $DB->get_record('question_usages', ['id' => $usageid], 'id, contextid, component', MUST_EXIST);
        if ($usage->component !== 'core_question_preview'
                || (int)$usage->contextid !== (int)context_user::instance($USER->id)->id) {
            throw new required_capability_exception(context_system::instance(), 'moodle/question:usemine',
                'nopermissions', '');
        }
    }

    // Loading the usage initialises the question from its seed, so a hint
    // written with question variables comes back already rendered.
    $quba = question_engine::load_questions_usage_by_activity($usageid);
    $question = $quba->get_question($slot);
    $anchors = [];
    if (!empty($question->inputs) && is_array($question->inputs)) {
        foreach ($question->inputs as $name => $input) {
            if (!$input->is_parameter_used('syntaxHint')) {
                continue;
            }
            $hint = trim((string)$input->get_parameter('syntaxHint', ''));
            if ($hint !== '') {
                $anchors[$name] = $hint;
            }
        }
    }

    echo json_encode([
        'success' => true,
        'anchors' => (object)$anchors,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    \local_hand2stack\local\api_response::send_error($error);
}
