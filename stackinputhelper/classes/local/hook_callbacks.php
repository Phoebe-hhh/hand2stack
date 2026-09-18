<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * classes local hook callbacks.php for Hand2STACK.
 *
 * @package    local_stackinputhelper
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_stackinputhelper\local;

defined('MOODLE_INTERNAL') || die();

final class hook_callbacks {
    public static function before_standard_top_of_body_html_generation(
        \core\hook\output\before_standard_top_of_body_html_generation $hook
    ): void {
        global $PAGE, $SCRIPT;

        if (during_initial_install()) {
            return;
        }

        $targets = [
            '/mod/quiz/attempt.php',
            '/question/preview.php',
        ];
        $path = $SCRIPT ?: (!empty($PAGE->url)
            ? $PAGE->url->get_path()
            : parse_url($_SERVER['SCRIPT_NAME'] ?? '', PHP_URL_PATH));
        if (!in_array($path, $targets, true)) {
            return;
        }

        if (!get_config('local_stackinputhelper', 'enabled')) {
            return;
        }
        if (!isloggedin() || isguestuser()
                || !has_capability('local/stackinputhelper:use', \context_system::instance())) {
            return;
        }

        $config = [
            'recognizeUrl' => (new \moodle_url('/local/stackinputhelper/recognize.php'))->out(false),
            'strokesUrl' => (new \moodle_url('/local/stackinputhelper/strokes.php'))->out(false),
            'convertUrl' => (new \moodle_url('/local/stackinputhelper/convert.php'))->out(false),
            'sessionCreateUrl' => (new \moodle_url('/local/stackinputhelper/session_create.php'))->out(false),
            'sessionResultUrl' => (new \moodle_url('/local/stackinputhelper/session_result.php'))->out(false),
            'sesskey' => sesskey(),
            'enablemobile' => (bool)get_config('local_stackinputhelper', 'enablemobile'),
            'uploadbtn' => get_string('uploadbtn', 'local_stackinputhelper'),
            'mobilebtn' => get_string('mobileuploadbtn', 'local_stackinputhelper'),
            'camerabtn' => get_string('camerabtn', 'local_stackinputhelper'),
            'uploading' => get_string('uploading', 'local_stackinputhelper'),
            'nofieldfound' => get_string('nofieldfound', 'local_stackinputhelper'),
            'recognizefailed' => get_string('recognizefailed', 'local_stackinputhelper'),
            'recognizedresults' => get_string('recognizedresults', 'local_stackinputhelper'),
            'selectanswer' => get_string('selectanswer', 'local_stackinputhelper'),
            'selectpart' => get_string('selectpart', 'local_stackinputhelper'),
            'recommendedanswer' => get_string('recommendedanswer', 'local_stackinputhelper'),
            'stackpreview' => get_string('stackpreview', 'local_stackinputhelper'),
            'insertanswer' => get_string('insertanswer', 'local_stackinputhelper'),
            'rawlatex' => get_string('rawlatex', 'local_stackinputhelper'),
            'recognizedformat' => get_string('recognizedformat', 'local_stackinputhelper'),
            'asciimath' => get_string('asciimath', 'local_stackinputhelper'),
            'asciiunavailable' => get_string('asciiunavailable', 'local_stackinputhelper'),
            'lineprefix' => get_string('lineprefix', 'local_stackinputhelper'),
            'creatingmobilesession' => get_string('creatingmobilesession', 'local_stackinputhelper'),
            'waitingmobileupload' => get_string('waitingmobileupload', 'local_stackinputhelper'),
            'mobileuploadreceived' => get_string('mobileuploadreceived', 'local_stackinputhelper'),
            'mobileuploadexpired' => get_string('mobileuploadexpired', 'local_stackinputhelper'),
            'mobileuploadtimeout' => get_string('mobileuploadtimeout', 'local_stackinputhelper'),
            'mobilesessionfailed' => get_string('mobilesessionfailed', 'local_stackinputhelper'),
            'partialselectionfailed' => get_string('partialselectionfailed', 'local_stackinputhelper'),
            'handwritebtn' => get_string('handwritebtn', 'local_stackinputhelper'),
            'handwriteinstructions' => get_string('handwriteinstructions', 'local_stackinputhelper'),
            'resizehandwriting' => get_string('resizehandwriting', 'local_stackinputhelper'),
            'draw' => get_string('draw', 'local_stackinputhelper'),
            'eraser' => get_string('eraser', 'local_stackinputhelper'),
            'undo' => get_string('undo', 'local_stackinputhelper'),
            'clear' => get_string('clear', 'local_stackinputhelper'),
            'recognizestrokes' => get_string('recognizestrokes', 'local_stackinputhelper'),
            'nostrokes' => get_string('nostrokes', 'local_stackinputhelper'),
        ];

        $PAGE->requires->js_call_amd('local_stackinputhelper/main', 'init', [$config]);
    }
}
