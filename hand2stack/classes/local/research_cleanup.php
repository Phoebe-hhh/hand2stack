<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * classes local research cleanup.php for Hand2STACK.
 *
 * Research events live only as long as the question usage they describe.
 * Without it there is no attempt, mark or saved response to read them with,
 * the quiz they belong to cannot be told, and a privacy request cannot find
 * whose they are. When Moodle deletes a quiz attempt, its events go with it.
 * Moodle tells plugins only after the usage is gone, and not at all for a
 * quiz preview, a question preview or a course deletion, so the hourly
 * cleanup also removes the events of any usage that no longer exists.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\local;

defined('MOODLE_INTERNAL') || die();

final class research_cleanup {
    private const TABLE = 'local_hand2stack_event';

    /** Delete the events of one question usage; returns how many there were. */
    public static function delete_usage_events(int $usageid): int {
        global $DB;

        $count = $DB->count_records(self::TABLE, ['usageid' => $usageid]);
        if ($count) {
            $DB->delete_records(self::TABLE, ['usageid' => $usageid]);
        }
        return $count;
    }

    /**
     * Delete the events whose question usage no longer exists. Events are
     * only accepted for an existing usage, so these are always left from a
     * deletion; returns how many there were.
     */
    public static function delete_orphaned_events(): int {
        global $DB;

        $select = 'usageid NOT IN (SELECT qu.id FROM {question_usages} qu)';
        $count = $DB->count_records_select(self::TABLE, $select);
        if ($count) {
            $DB->delete_records_select(self::TABLE, $select);
        }
        return $count;
    }

    /** A quiz attempt was deleted: its events go with it. Not called for previews. */
    public static function attempt_state_changed(\mod_quiz\hook\attempt_state_changed $hook): void {
        $original = $hook->get_original_attempt();
        if ($hook->get_updated_attempt() === null && $original && !empty($original->uniqueid)) {
            self::delete_usage_events((int)$original->uniqueid);
        }
    }
}
