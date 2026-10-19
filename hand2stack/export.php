<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * export.php for Hand2STACK.
 *
 * Downloads the research log. With a quiz (cmid), anyone holding
 * local/hand2stack:exportlogs there gets that quiz's events; without one,
 * site administrators get a whole study, optionally for one course.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
require_once(__DIR__ . '/../../config.php');
require_once($CFG->libdir . '/adminlib.php');

use local_hand2stack\local\research_export;
use local_hand2stack\local\research_logger;

$cmid = optional_param('cmid', 0, PARAM_INT);
$courseid = optional_param('courseid', 0, PARAM_INT);
$studyid = optional_param('studyid', '', PARAM_ALPHANUMEXT);
$dataformat = optional_param('dataformat', '', PARAM_ALPHA);

if ($cmid) {
    $cm = get_coursemodule_from_id('quiz', $cmid, 0, false, MUST_EXIST);
    require_login($cm->course, false, $cm);
    $context = context_module::instance($cm->id);
    require_capability('local/hand2stack:exportlogs', $context);
    $courseid = 0;
    $PAGE->set_url(new moodle_url('/local/hand2stack/export.php', ['cmid' => $cmid]));
    $PAGE->set_title(get_string('exportlogs', 'local_hand2stack') . ': ' . format_string($cm->name));
    $PAGE->set_heading(format_string($COURSE->fullname));
    $PAGE->activityheader->disable();
} else {
    admin_externalpage_setup('local_hand2stack_export');
}

$studies = research_export::study_ids($cmid ?: null);
$current = research_logger::study_id();
if ($studyid === '' || !in_array($studyid, $studies, true)) {
    $studyid = in_array($current, $studies, true) ? $current : (string)reset($studies);
}

$baseparams = array_filter(['cmid' => $cmid, 'courseid' => $courseid, 'studyid' => $studyid]);

if ($dataformat !== '' && $studyid !== '') {
    $filename = clean_filename(implode('-', array_filter([
        'hand2stack-log', $studyid, $cmid ? 'quiz' . $cmid : ($courseid ? 'course' . $courseid : ''), date('Ymd'),
    ])));
    $records = research_export::recordset($studyid, $cmid ?: null, $courseid ?: null);
    $spreadsheet = in_array($dataformat, research_export::SPREADSHEET_FORMATS, true);
    \core\dataformat::download_data($filename, $dataformat, research_export::COLUMNS, $records,
        fn(stdClass $record) => research_export::row($record, $spreadsheet));
    $records->close();
    die;
}

echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('exportlogs', 'local_hand2stack'));
echo html_writer::tag('p', get_string('exportlogs_desc', 'local_hand2stack'));

if (!$studies) {
    echo $OUTPUT->notification(get_string('exportnoevents', 'local_hand2stack'), 'info');
    echo $OUTPUT->footer();
    die;
}

$url = new moodle_url('/local/hand2stack/export.php', array_filter(['cmid' => $cmid, 'courseid' => $courseid]));
echo $OUTPUT->single_select($url, 'studyid', array_combine($studies, $studies), $studyid, null, null,
    ['label' => get_string('researchstudyid', 'local_hand2stack')]);

if (!$cmid) {
    // Courses with quiz events in this study; question previews belong to no course.
    $courses = $DB->get_records_sql_menu(
        "SELECT DISTINCT c.id, c.shortname
           FROM {local_hand2stack_event} e
           JOIN {quiz_attempts} qza ON qza.uniqueid = e.usageid
           JOIN {quiz} qz ON qz.id = qza.quiz
           JOIN {course} c ON c.id = qz.course
          WHERE e.studyid = :studyid
       ORDER BY c.shortname", ['studyid' => $studyid]);
    $courses = array_map('format_string', $courses);
    echo $OUTPUT->single_select(new moodle_url('/local/hand2stack/export.php', ['studyid' => $studyid]),
        'courseid', [0 => get_string('exportallcourses', 'local_hand2stack')] + $courses, $courseid, null, null,
        ['label' => get_string('course')]);
}

$count = research_export::count($studyid, $cmid ?: null, $courseid ?: null);
echo html_writer::tag('p', get_string('exporteventcount', 'local_hand2stack', $count));
if ($count) {
    echo $OUTPUT->download_dataformat_selector(get_string('exportdownload', 'local_hand2stack'),
        new moodle_url('/local/hand2stack/export.php'), 'dataformat', $baseparams);
}

echo $OUTPUT->footer();
