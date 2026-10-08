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
            '/question/preview.php',
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

        $research = research_logger::enabled_for_context($PAGE->context, (int)$USER->id);
        $config = [
            'recognizeUrl' => (new \moodle_url('/local/hand2stack/recognize.php'))->out(false),
            'strokesUrl' => (new \moodle_url('/local/hand2stack/strokes.php'))->out(false),
            'convertUrl' => (new \moodle_url('/local/hand2stack/convert.php'))->out(false),
            'anchorsUrl' => (new \moodle_url('/local/hand2stack/anchors.php'))->out(false),
            'sessionCreateUrl' => (new \moodle_url('/local/hand2stack/session_create.php'))->out(false),
            'sessionResultUrl' => (new \moodle_url('/local/hand2stack/session_result.php'))->out(false),
            'eventUrl' => (new \moodle_url('/local/hand2stack/event.php'))->out(false),
            'research' => [
                'enabled' => $research,
                'schemaVersion' => research_logger::SCHEMA_VERSION,
            ],
            'sesskey' => sesskey(),
            'enablemobile' => (bool)get_config('local_hand2stack', 'enablemobile'),
            'uploadbtn' => get_string('uploadbtn', 'local_hand2stack'),
            'mobilebtn' => get_string('mobileuploadbtn', 'local_hand2stack'),
            'camerabtn' => get_string('camerabtn', 'local_hand2stack'),
            'uploading' => get_string('uploading', 'local_hand2stack'),
            'nofieldfound' => get_string('nofieldfound', 'local_hand2stack'),
            'recognizefailed' => get_string('recognizefailed', 'local_hand2stack'),
            'recognizedresults' => get_string('recognizedresults', 'local_hand2stack'),
            'selectanswer' => get_string('selectanswer', 'local_hand2stack'),
            'recognizedworking' => get_string('recognizedworking', 'local_hand2stack'),
            'selectpart' => get_string('selectpart', 'local_hand2stack'),
            'recommendedanswer' => get_string('recommendedanswer', 'local_hand2stack'),
            'approximation' => get_string('approximation', 'local_hand2stack'),
            'detectedcandidates' => get_string('detectedcandidates', 'local_hand2stack'),
            'edited' => get_string('edited', 'local_hand2stack'),
            'restoreocr' => get_string('restoreocr', 'local_hand2stack'),
            'stackpreview' => get_string('stackpreview', 'local_hand2stack'),
            'convertedstack' => get_string('convertedstack', 'local_hand2stack'),
            'freetextpreview' => get_string('freetextpreview', 'local_hand2stack'),
            'originalwork' => get_string('originalwork', 'local_hand2stack'),
            'confirmrecognition' => get_string('confirmrecognition', 'local_hand2stack'),
            'freetextworkflow' => get_string('freetextworkflow', 'local_hand2stack'),
            'recognizedfullanswer' => get_string('recognizedfullanswer', 'local_hand2stack'),
            'freetexthelp' => get_string('freetexthelp', 'local_hand2stack'),
            'editedhighlighthelp' => get_string('editedhighlighthelp', 'local_hand2stack'),
            'directsubmithelp' => get_string('directsubmithelp', 'local_hand2stack'),
            'appendhint' => get_string('appendhint', 'local_hand2stack'),
            'appendfreetext' => get_string('appendfreetext', 'local_hand2stack'),
            'insertfreetext' => get_string('insertfreetext', 'local_hand2stack'),
            'zoomin' => get_string('zoomin', 'local_hand2stack'),
            'zoomout' => get_string('zoomout', 'local_hand2stack'),
            'resetzoom' => get_string('resetzoom', 'local_hand2stack'),
            'dragimage' => get_string('dragimage', 'local_hand2stack'),
            'insertanswer' => get_string('insertanswer', 'local_hand2stack'),
            'rawlatex' => get_string('rawlatex', 'local_hand2stack'),
            'recognizedformat' => get_string('recognizedformat', 'local_hand2stack'),
            'asciimath' => get_string('asciimath', 'local_hand2stack'),
            'asciiunavailable' => get_string('asciiunavailable', 'local_hand2stack'),
            'lineprefix' => get_string('lineprefix', 'local_hand2stack'),
            'creatingmobilesession' => get_string('creatingmobilesession', 'local_hand2stack'),
            'waitingmobileupload' => get_string('waitingmobileupload', 'local_hand2stack'),
            'mobileuploadreceived' => get_string('mobileuploadreceived', 'local_hand2stack'),
            'mobileuploadexpired' => get_string('mobileuploadexpired', 'local_hand2stack'),
            'mobileuploadtimeout' => get_string('mobileuploadtimeout', 'local_hand2stack'),
            'mobilesessionfailed' => get_string('mobilesessionfailed', 'local_hand2stack'),
            'partialselectionfailed' => get_string('partialselectionfailed', 'local_hand2stack'),
            'conversioninprogress' => get_string('conversioninprogress', 'local_hand2stack'),
            'pollingfailed' => get_string('pollingfailed', 'local_hand2stack'),
            'handwritebtn' => get_string('handwritebtn', 'local_hand2stack'),
            'handwriteinstructions' => get_string('handwriteinstructions', 'local_hand2stack'),
            'resizehandwriting' => get_string('resizehandwriting', 'local_hand2stack'),
            'draw' => get_string('draw', 'local_hand2stack'),
            'eraser' => get_string('eraser', 'local_hand2stack'),
            'extractedfromworking' => get_string('extractedfromworking', 'local_hand2stack'),
            'anchornotfound' => get_string('anchornotfound', 'local_hand2stack'),
            'filledfromlastline' => get_string('filledfromlastline', 'local_hand2stack'),
            'anchorconvertfailed' => get_string('anchorconvertfailed', 'local_hand2stack'),
            'pensize' => get_string('pensize', 'local_hand2stack'),
            'penthin' => get_string('penthin', 'local_hand2stack'),
            'penmedium' => get_string('penmedium', 'local_hand2stack'),
            'penthick' => get_string('penthick', 'local_hand2stack'),
            'undo' => get_string('undo', 'local_hand2stack'),
            'clear' => get_string('clear', 'local_hand2stack'),
            'recognizestrokes' => get_string('recognizestrokes', 'local_hand2stack'),
            'nostrokes' => get_string('nostrokes', 'local_hand2stack'),
        ];

        $PAGE->requires->js_call_amd('local_hand2stack/main', 'init', [$config]);
    }
}
