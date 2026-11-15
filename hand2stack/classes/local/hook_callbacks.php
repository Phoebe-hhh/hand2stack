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
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\local;

defined('MOODLE_INTERNAL') || die();

final class hook_callbacks {
    public static function before_standard_top_of_body_html_generation(
        \core\hook\output\before_standard_top_of_body_html_generation $hook
    ): void {
        global $PAGE, $SCRIPT, $USER;

        if (during_initial_install()) {
            return;
        }

        $targets = [
            '/mod/quiz/attempt.php',
            // Review only shows the learner's original image under each answer.
            '/mod/quiz/review.php',
            // Moodle 4.x moved question preview into the previewquestion plugin.
            '/question/bank/previewquestion/preview.php',
        ];
        $path = $SCRIPT ?: (!empty($PAGE->url)
            ? $PAGE->url->get_path()
            : parse_url($_SERVER['SCRIPT_NAME'] ?? '', PHP_URL_PATH));
        if (!in_array($path, $targets, true)) {
            return;
        }

        if (!get_config('local_hand2stack', 'enabled')) {
            return;
        }
        if (!isloggedin() || isguestuser()
                || !has_capability('local/hand2stack:use', \context_system::instance())) {
            return;
        }

        // A quiz set to "off" behaves as if the plugin were not installed.
        $inputmode = input_mode::for_context($PAGE->context);
        if ($inputmode === input_mode::OFF) {
            return;
        }

        // A question preview's usage belongs to the user's own context, where
        // event.php looks for the participant capability; ask the same here,
        // so the page never logs what the server would reject.
        $researchcontext = $path === '/question/bank/previewquestion/preview.php'
            ? \context_user::instance($USER->id)
            : $PAGE->context;
        $research = research_logger::enabled_for_context($researchcontext, (int)$USER->id);
        $config = [
            'inputMode' => $inputmode,
            'research' => [
                'enabled' => $research,
                'schemaVersion' => research_logger::SCHEMA_VERSION,
                'outboxScope' => $research ? research_logger::outbox_scope((int)$USER->id) : '',
            ],
            'sesskey' => sesskey(),
            'enablemobile' => (bool)get_config('local_hand2stack', 'enablemobile'),
        ];

        // The interface strings go through Moodle's string API (main.js reads
        // them with core/str), not through the arguments of js_call_amd, and
        // the endpoint URLs are derived from M.cfg.wwwroot in the browser.
        $PAGE->requires->strings_for_js([
            'uploadbtn', 'mobileuploadbtn', 'camerabtn', 'uploading', 'recognizefailed', 'recognizedresults',
            'selectanswer', 'recognizedworking', 'selectpart', 'recommendedanswer', 'approximation', 'edited',
            'restoreocr', 'stackpreview', 'convertedstack', 'freetextpreview', 'originalwork', 'confirmrecognition',
            'freetextworkflow', 'recognizedfullanswer', 'freetexthelp', 'editedhighlighthelp', 'directsubmithelp',
            'zoomin', 'zoomout', 'resetzoom', 'dragimage', 'insertanswer', 'rawlatex', 'recognizedformat',
            'asciimath', 'asciiunavailable', 'lineprefix', 'creatingmobilesession', 'waitingmobileupload',
            'textline', 'mobilescantip', 'mobilesessionnotcreated', 'mobileuploadreceived', 'mobileuploadexpired',
            'mobileuploadtimeout', 'mobilesessionfailed', 'partialselectionfailed', 'conversioninprogress',
            'pollingfailed', 'handwritebtn', 'handwriteinstructions', 'resizehandwriting', 'draw', 'eraser',
            'extractedfromworking', 'anchornotfound', 'filledfromlastline', 'anchorconvertfailed',
            'fallbackconvertfailed', 'pensize', 'penthin', 'penmedium', 'penthick', 'undo', 'clear',
            'recognizestrokes', 'nostrokes',
        ], 'local_hand2stack');

        $PAGE->requires->js_call_amd('local_hand2stack/main', 'init', [$config]);
    }
}
