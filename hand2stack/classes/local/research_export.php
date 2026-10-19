<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * classes local research export.php for Hand2STACK.
 *
 * Builds the downloadable research log: one row per event, with the quiz,
 * question and final mark alongside so the file can be analysed on its own.
 * No Moodle user id, name or usage id leaves the server: learners are the
 * stored HMAC pseudonym and attempts get one of their own.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\local;

defined('MOODLE_INTERNAL') || die();

final class research_export {
    /** Exported columns, in order. */
    public const COLUMNS = [
        'studyid', 'anonuserid', 'anonattemptid', 'attempt',
        'courseid', 'course', 'cmid', 'quiz', 'studycondition',
        'slot', 'questionid', 'qbankentryid', 'questionversion', 'question',
        'finalstate', 'finalfraction', 'maxmark', 'finalmark',
        'traceid', 'pageid', 'eventseq', 'eventtype', 'inputname', 'modality',
        'clienttime', 'clienttimeiso', 'elapsedms', 'servertime',
        'pluginversion', 'schemaversion', 'eventid', 'payload',
    ];

    /** Study ids that have events, newest first, optionally only in one quiz. */
    public static function study_ids(?int $cmid = null): array {
        global $DB;

        [$join, $where, $params] = self::scope($cmid, null);
        $sql = "SELECT e.studyid, MAX(e.servertime) AS latest
                  FROM {local_hand2stack_event} e
                       $join
                 WHERE $where
              GROUP BY e.studyid
              ORDER BY latest DESC";
        return array_map('strval', array_keys($DB->get_records_sql_menu($sql, $params)));
    }

    /** Number of events a download would contain. */
    public static function count(string $studyid, ?int $cmid = null, ?int $courseid = null): int {
        global $DB;

        [$join, $where, $params] = self::scope($cmid, $courseid);
        return $DB->count_records_sql("SELECT COUNT(1)
                                         FROM {local_hand2stack_event} e
                                              $join
                                        WHERE $where AND e.studyid = :studyid",
            $params + ['studyid' => $studyid]);
    }

    /**
     * The events of a study, in a quiz or a course when given, ready for
     * \core\dataformat::download_data(). Close the recordset when done.
     */
    public static function recordset(string $studyid, ?int $cmid = null, ?int $courseid = null): \moodle_recordset {
        global $DB;

        [$join, $where, $params] = self::scope($cmid, $courseid);
        $sql = "SELECT e.id, e.studyid, e.anonuserid, e.usageid, e.slot, e.traceid, e.pageid, e.eventseq,
                       e.eventtype, e.inputname, e.modality, e.studycondition, e.questionid, e.qbankentryid,
                       e.questionversion, e.pluginversion, e.schemaversion, e.clienttime, e.elapsedms,
                       e.servertime, e.eventid, e.payload,
                       qza.attempt, c.id AS courseid, c.shortname AS course, cm.id AS cmid, qz.name AS quiz,
                       q.name AS question, qat.maxmark, qas.state AS finalstate, qas.fraction AS finalfraction
                  FROM {local_hand2stack_event} e
                       $join
             LEFT JOIN {question} q ON q.id = e.questionid
             LEFT JOIN {question_attempts} qat ON qat.questionusageid = e.usageid AND qat.slot = e.slot
             LEFT JOIN {question_attempt_steps} qas ON qas.questionattemptid = qat.id
                       AND qas.sequencenumber = (SELECT MAX(s2.sequencenumber)
                                                   FROM {question_attempt_steps} s2
                                                  WHERE s2.questionattemptid = qat.id)
                 WHERE $where AND e.studyid = :studyid
              ORDER BY e.usageid, e.slot, e.traceid, e.eventseq";
        return $DB->get_recordset_sql($sql, $params + ['studyid' => $studyid]);
    }

    /** Dataformats a spreadsheet application may open and evaluate. */
    public const SPREADSHEET_FORMATS = ['csv', 'excel', 'ods'];

    /**
     * One exported row; usageid is replaced by the attempt pseudonym. For a
     * spreadsheet, text starting with = + - @ is prefixed with ' so course,
     * quiz and question names, or answers, are never run as formulas.
     */
    public static function row(\stdClass $record, bool $spreadsheet = false): array {
        $fraction = $record->finalfraction !== null ? (float)$record->finalfraction : null;
        $maxmark = $record->maxmark !== null ? (float)$record->maxmark : null;
        $values = [
            'studyid' => $record->studyid,
            'anonuserid' => $record->anonuserid,
            'anonattemptid' => research_logger::anon_attempt_id((int)$record->usageid, $record->studyid),
            'attempt' => $record->attempt,
            'courseid' => $record->courseid,
            'course' => $record->course,
            'cmid' => $record->cmid,
            'quiz' => $record->quiz,
            'studycondition' => $record->studycondition,
            'slot' => $record->slot,
            'questionid' => $record->questionid,
            'qbankentryid' => $record->qbankentryid,
            'questionversion' => $record->questionversion,
            'question' => $record->question,
            'finalstate' => $record->finalstate,
            'finalfraction' => $fraction,
            'maxmark' => $maxmark,
            'finalmark' => $fraction !== null && $maxmark !== null ? round($fraction * $maxmark, 7) : null,
            'traceid' => $record->traceid,
            'pageid' => $record->pageid,
            'eventseq' => $record->eventseq,
            'eventtype' => $record->eventtype,
            'inputname' => $record->inputname,
            'modality' => $record->modality,
            'clienttime' => $record->clienttime,
            'clienttimeiso' => gmdate('Y-m-d\TH:i:s', intdiv((int)$record->clienttime, 1000))
                . sprintf('.%03dZ', (int)$record->clienttime % 1000),
            'elapsedms' => $record->elapsedms,
            'servertime' => $record->servertime,
            'pluginversion' => $record->pluginversion,
            'schemaversion' => $record->schemaversion,
            'eventid' => $record->eventid,
            'payload' => $record->payload,
        ];
        return $spreadsheet ? array_map([self::class, 'escape_formula'], array_values($values)) : array_values($values);
    }

    /**
     * Moodle's own escaping where it exists. Its CSV, Excel and ODS writers
     * apply it too on recent releases; a value already prefixed with ' is
     * left alone, so nothing is escaped twice.
     *
     * @param mixed $value
     * @return mixed
     */
    public static function escape_formula($value) {
        // Numbers are never formulas; core's ?string return would make them text.
        if (!is_string($value)) {
            return $value;
        }
        if (method_exists(\core\dataformat::class, 'escape_spreadsheet_formula')) {
            return \core\dataformat::escape_spreadsheet_formula($value);
        }
        if ($value === '-') {
            return $value;
        }
        $trimmed = ltrim($value);
        return $trimmed !== '' && in_array($trimmed[0], ['=', '+', '-', '@'], true) ? "'" . $value : $value;
    }

    /**
     * Joins and conditions for the events in scope. A quiz or course limits
     * the rows to quiz attempts there; the whole study also keeps previews.
     *
     * @return array [$join, $where, $params]
     */
    private static function scope(?int $cmid, ?int $courseid): array {
        global $DB;

        $quizmodule = (int)$DB->get_field('modules', 'id', ['name' => 'quiz']);
        $kind = ($cmid || $courseid) ? 'JOIN' : 'LEFT JOIN';
        $join = "$kind {quiz_attempts} qza ON qza.uniqueid = e.usageid
                 $kind {quiz} qz ON qz.id = qza.quiz
                 $kind {course_modules} cm ON cm.instance = qz.id AND cm.module = :quizmodule
                 $kind {course} c ON c.id = qz.course";
        $where = '1 = 1';
        $params = ['quizmodule' => $quizmodule];
        if ($cmid) {
            $where .= ' AND cm.id = :cmid';
            $params['cmid'] = $cmid;
        }
        if ($courseid) {
            $where .= ' AND c.id = :courseid';
            $params['courseid'] = $courseid;
        }
        return [$join, $where, $params];
    }
}
