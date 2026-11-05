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
 * Each row also carries the question's Moodle step at the time of the event,
 * and the raw fraction of the latest Check up to then,
 * graded again from the response that step saved: interactive mode keeps no
 * fraction for a Check that leaves tries, so it is not in the step itself.
 * Learners are the stored HMAC pseudonym and attempts get one of their own;
 * no usage id leaves the server. Only events from a quiz set to identified
 * logging (everyday use) also carry the user id, username, ID number and
 * full name; on a study's pseudonymised events those columns stay empty.
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
        'studyid', 'anonuserid', 'identified', 'userid', 'username', 'idnumber', 'fullname',
        'anonattemptid', 'attempt',
        'courseid', 'course', 'cmid', 'quiz', 'studycondition',
        'slot', 'questionid', 'qbankentryid', 'questionversion', 'question',
        'finalstate', 'finalfraction', 'maxmark', 'finalmark',
        'stepseq', 'stepstate', 'steptriesleft', 'steprawfraction',
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

        self::$rounds = ['usageid' => null, 'slots' => []];
        [$join, $where, $params] = self::scope($cmid, $courseid);
        $namefields = \core_user\fields::for_name()->get_sql('u', false, 'u_', '', true)->selects;
        // How far each trace's browser clock is behind the server's: the
        // smallest servertime - clienttime of its events, the one delivered
        // soonest. A batch is stamped once when it arrives, so servertime
        // alone would date a late batch's older events to its arrival. The
        // finisher's own events are already in server time.
        $notserver = $DB->sql_like('c.payload', ':serverpayload', true, true, true);
        $sql = "SELECT e.id, e.studyid, e.anonuserid, e.identified, e.userid, u.username, u.idnumber $namefields,
                       e.usageid, e.slot, e.traceid, e.pageid, e.eventseq,
                       e.eventtype, e.inputname, e.modality, e.studycondition, e.questionid, e.qbankentryid,
                       e.questionversion, e.pluginversion, e.schemaversion, e.clienttime, e.elapsedms,
                       e.servertime, e.eventid, e.payload,
                       qza.attempt, c.id AS courseid, c.shortname AS course, cm.id AS cmid, qz.name AS quiz,
                       q.name AS question, qat.maxmark, qas.state AS finalstate, qas.fraction AS finalfraction,
                       clk.clockoffset
                  FROM {local_hand2stack_event} e
                       $join
             LEFT JOIN (SELECT c.traceid, MIN(c.servertime - c.clienttime) AS clockoffset
                          FROM {local_hand2stack_event} c
                         WHERE c.studyid = :clockstudyid AND $notserver
                      GROUP BY c.traceid) clk ON clk.traceid = e.traceid
             LEFT JOIN {user} u ON u.id = e.userid AND e.identified = 1
             LEFT JOIN {question} q ON q.id = e.questionid
             LEFT JOIN {question_attempts} qat ON qat.questionusageid = e.usageid AND qat.slot = e.slot
             LEFT JOIN {question_attempt_steps} qas ON qas.questionattemptid = qat.id
                       AND qas.sequencenumber = (SELECT MAX(s2.sequencenumber)
                                                   FROM {question_attempt_steps} s2
                                                  WHERE s2.questionattemptid = qat.id)
                 WHERE $where AND e.studyid = :studyid
              ORDER BY e.usageid, e.slot, e.traceid, e.eventseq";
        return $DB->get_recordset_sql($sql, $params + ['studyid' => $studyid, 'clockstudyid' => $studyid,
            'serverpayload' => '%' . $DB->sql_like_escape(self::SERVER_SOURCE) . '%']);
    }

    /** How the finisher marks the events it writes itself, in server time. */
    private const SERVER_SOURCE = '"source":"server"';

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
        $identified = (int)$record->identified === 1 && $record->username !== null;
        $values = [
            'studyid' => $record->studyid,
            'anonuserid' => $record->anonuserid,
            'identified' => (int)$record->identified,
            'userid' => $identified ? (int)$record->userid : null,
            'username' => $identified ? $record->username : null,
            'idnumber' => $identified ? $record->idnumber : null,
            'fullname' => $identified ? fullname(self::user_names($record)) : null,
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
        ] + self::round_at($record) + [
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
     * The steps of each question of the usage being exported, as
     * round_steps() lists them. The recordset is ordered by usage, so only
     * the current one is kept.
     *
     * @var array
     */
    private static $rounds = ['usageid' => null, 'slots' => []];

    /**
     * The question's state when the event happened: its latest Moodle step
     * by then, and the raw fraction of the latest Check (or Finish) up to
     * that step. The event's time is its browser time moved onto the server
     * clock by its trace's offset. A step is timed in whole seconds: it
     * counts from the start of its second, except for a submit_triggered,
     * which always comes just before the step it causes and so sees only
     * the steps of earlier seconds.
     */
    private static function round_at(\stdClass $record): array {
        $none = ['stepseq' => null, 'stepstate' => null, 'steptriesleft' => null, 'steprawfraction' => null];
        if ($record->usageid === null || $record->slot === null) {
            return $none;
        }
        $usageid = (int)$record->usageid;
        $slot = (int)$record->slot;
        if (self::$rounds['usageid'] !== $usageid) {
            self::$rounds = ['usageid' => $usageid, 'slots' => []];
        }
        if (!array_key_exists($slot, self::$rounds['slots'])) {
            self::$rounds['slots'][$slot] = self::round_steps($usageid, $slot);
        }
        $time = self::event_time($record);
        $lead = $record->eventtype === 'submit_triggered' ? 1000 : 0;
        $found = $none;
        foreach (self::$rounds['slots'][$slot] as $step) {
            if ($step['timecreated'] * 1000 + $lead > $time) {
                break;
            }
            $found = $step['columns'];
        }
        return $found;
    }

    /** The event's time on the server clock, in milliseconds. */
    private static function event_time(\stdClass $record): int {
        $isserver = $record->payload !== null && strpos((string)$record->payload, self::SERVER_SOURCE) !== false;
        if ($isserver || $record->clockoffset === null) {
            // Already in server time; or, without any client event to measure the clock by, as received.
            return $isserver ? (int)$record->clienttime : (int)$record->servertime;
        }
        return (int)$record->clienttime + (int)$record->clockoffset;
    }

    /**
     * Each Moodle step of one question attempt, with the columns an event
     * from its time gets. A Check or Finish is graded again on the response
     * it was given, as the question type grades it, without the behaviour's
     * penalty; a step that grades nothing keeps the latest grade before it.
     */
    private static function round_steps(int $usageid, int $slot): array {
        try {
            $quba = \question_engine::load_questions_usage_by_activity($usageid);
            $qa = $quba->get_question_attempt($slot);
        } catch (\Throwable $e) {
            // A deleted preview or attempt: the event stays without steps.
            return [];
        }
        $question = $qa->get_question();
        $steps = [];
        $response = [];
        $triesleft = null;
        $rawfraction = null;
        foreach ($qa->get_step_iterator() as $seq => $step) {
            $data = array_filter($step->get_qt_data(), fn($name) => $name[0] !== '_', ARRAY_FILTER_USE_KEY);
            if ($data) {
                $response = $data;
            }
            if ($step->has_behaviour_var('_triesleft')) {
                $triesleft = (int)$step->get_behaviour_var('_triesleft');
            }
            if ($step->has_behaviour_var('submit') || $step->has_behaviour_var('finish')) {
                $rawfraction = self::raw_fraction($question, $response);
            }
            $steps[] = [
                'timecreated' => (int)$step->get_timecreated(),
                'columns' => [
                    'stepseq' => (int)$seq,
                    'stepstate' => (string)$step->get_state(),
                    'steptriesleft' => $triesleft,
                    'steprawfraction' => $rawfraction,
                ],
            ];
        }
        return $steps;
    }

    /** The raw fraction a response earns, or null when it cannot be graded. */
    private static function raw_fraction(\question_definition $question, array $response): ?float {
        if (!$question instanceof \question_automatically_gradable || !$question->is_gradable_response($response)) {
            return null;
        }
        try {
            [$fraction] = $question->grade_response($response);
        } catch (\Throwable $e) {
            // For STACK, Maxima unavailable: leave the round ungraded rather than fail the download.
            return null;
        }
        return $fraction === null ? null : round((float)$fraction, 7);
    }

    /** The name fields of the event's user, selected with the u_ prefix. */
    private static function user_names(\stdClass $record): \stdClass {
        $user = new \stdClass();
        foreach (\core_user\fields::get_name_fields() as $field) {
            $user->$field = $record->{'u_' . $field} ?? '';
        }
        return $user;
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
