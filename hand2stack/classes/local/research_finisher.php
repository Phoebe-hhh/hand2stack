<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * classes local research finisher.php for Hand2STACK.
 *
 * Ends the research trace of every question of a finished quiz attempt. The
 * browser logs task_finished only for the questions on the page where the
 * learner finishes, and only if that page's events reach the server; a
 * question on another page, a closed tab or an attempt submitted by the
 * server when time ran out has none. When an attempt is submitted or
 * abandoned, a task a few minutes later, once the browser's own events have
 * had time to arrive, adds a task_finished with "source": "server" to the
 * latest trace of each question that has events but no task_finished.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\local;

defined('MOODLE_INTERNAL') || die();

final class research_finisher {
    /** How long the browser's own task_finished is waited for. */
    public const DELAY_SECONDS = 300;

    public const REASON_SUBMITTED = 'server_attempt_submitted';

    public const REASON_ABANDONED = 'server_attempt_abandoned';

    private const TABLE = 'local_hand2stack_event';

    public static function attempt_submitted(\mod_quiz\event\attempt_submitted $event): void {
        self::queue((int)$event->objectid, self::REASON_SUBMITTED);
    }

    public static function attempt_abandoned(\mod_quiz\event\attempt_abandoned $event): void {
        self::queue((int)$event->objectid, self::REASON_ABANDONED);
    }

    /** Schedule complete_attempt() for an attempt whose usage has research events. */
    public static function queue(int $attemptid, string $reason): void {
        global $DB;

        $usageid = (int)$DB->get_field('quiz_attempts', 'uniqueid', ['id' => $attemptid]);
        if (!$usageid || !$DB->record_exists(self::TABLE, ['usageid' => $usageid])) {
            return;
        }
        $task = new \local_hand2stack\task\complete_research_traces();
        $task->set_custom_data(['attemptid' => $attemptid, 'reason' => $reason]);
        $task->set_next_run_time(time() + self::DELAY_SECONDS);
        \core\task\manager::queue_adhoc_task($task, true);
    }

    /**
     * Add the missing task_finished events of a finished attempt.
     *
     * @return int The number of events added.
     */
    public static function complete_attempt(int $attemptid, string $reason): int {
        global $DB;

        $attempt = $DB->get_record('quiz_attempts', ['id' => $attemptid], 'id, uniqueid, timefinish, timemodified');
        if (!$attempt) {
            return 0;
        }
        $usageid = (int)$attempt->uniqueid;
        $finishedms = 1000 * (int)($attempt->timefinish ?: $attempt->timemodified);

        $added = 0;
        $slots = $DB->get_fieldset_sql('SELECT DISTINCT slot FROM {' . self::TABLE . '} WHERE usageid = :usageid',
            ['usageid' => $usageid]);
        foreach ($slots as $slot) {
            $where = ['usageid' => $usageid, 'slot' => (int)$slot];
            if ($DB->record_exists(self::TABLE, $where + ['eventtype' => 'task_finished'])) {
                continue;
            }
            // The trace the learner worked in last.
            $latest = $DB->get_records(self::TABLE, $where, 'servertime DESC, id DESC', '*', 0, 1);
            $latest = reset($latest);
            if (!$latest) {
                continue;
            }
            $lastseq = (int)$DB->get_field_sql('SELECT MAX(eventseq) FROM {' . self::TABLE . '} WHERE traceid = :traceid',
                ['traceid' => $latest->traceid]);

            $record = clone $latest;
            unset($record->id);
            $record->eventid = \core\uuid::generate();
            $record->pageid = \core\uuid::generate();
            $record->eventseq = $lastseq + 1;
            $record->eventtype = 'task_finished';
            $record->inputname = null;
            $record->modality = null;
            $record->pluginversion = research_logger::plugin_version();
            $record->schemaversion = research_logger::SCHEMA_VERSION;
            $record->clienttime = $finishedms;
            $record->elapsedms = null;
            $record->servertime = (int)round(microtime(true) * 1000);
            $record->payload = json_encode([
                'reason' => $reason,
                'source' => 'server',
                'moodleState' => self::question_state($usageid, (int)$slot),
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $DB->insert_record(self::TABLE, $record);
            $added++;
        }
        return $added;
    }

    /** Moodle's state of the question after its last step, such as gradedwrong or gaveup. */
    private static function question_state(int $usageid, int $slot): ?string {
        global $DB;

        $sql = 'SELECT qas.state
                  FROM {question_attempts} qa
                  JOIN {question_attempt_steps} qas ON qas.questionattemptid = qa.id
                 WHERE qa.questionusageid = :usageid AND qa.slot = :slot
              ORDER BY qas.sequencenumber DESC';
        $state = $DB->get_field_sql($sql, ['usageid' => $usageid, 'slot' => $slot], IGNORE_MULTIPLE);
        return $state !== false ? (string)$state : null;
    }
}
