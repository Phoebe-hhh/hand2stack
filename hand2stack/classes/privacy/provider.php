<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * classes privacy provider.php for Hand2STACK.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\privacy;

use local_hand2stack\local\research_logger;

defined('MOODLE_INTERNAL') || die();

class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\core_userlist_provider,
    \core_privacy\local\request\plugin\provider {
    public static function get_metadata(\core_privacy\local\metadata\collection $collection): \core_privacy\local\metadata\collection {
        $collection->add_external_location_link('mathpix', [
            'image' => 'privacy:metadata:mathpix:image',
            'strokes' => 'privacy:metadata:mathpix:strokes',
        ], 'privacy:metadata:mathpix');

        $collection->add_database_table('local_hand2stack_sess', [
            'userid' => 'privacy:metadata:session:userid',
            'rawlatex' => 'privacy:metadata:session:rawlatex',
            'rawascii' => 'privacy:metadata:session:rawascii',
            'stack' => 'privacy:metadata:session:stack',
            'resulttext' => 'privacy:metadata:session:resulttext',
            'timecreated' => 'privacy:metadata:session:timecreated',
            'timemodified' => 'privacy:metadata:session:timemodified',
            'expiresat' => 'privacy:metadata:session:expiresat',
        ], 'privacy:metadata:session');

        $collection->add_database_table('local_hand2stack_event', [
            'anonuserid' => 'privacy:metadata:event:anonuserid',
            'usageid' => 'privacy:metadata:event:usageid',
            'eventtype' => 'privacy:metadata:event:eventtype',
            'clienttime' => 'privacy:metadata:event:clienttime',
            'payload' => 'privacy:metadata:event:payload',
        ], 'privacy:metadata:event');

        return $collection;
    }

    public static function get_contexts_for_userid(int $userid): \core_privacy\local\request\contextlist {
        global $DB;

        $contextlist = new \core_privacy\local\request\contextlist();
        if ($DB->record_exists('local_hand2stack_sess', ['userid' => $userid])
                || self::user_has_events($userid)) {
            $contextlist->add_system_context();
        }
        return $contextlist;
    }

    public static function export_user_data(\core_privacy\local\request\approved_contextlist $contextlist): void {
        global $DB;

        if (empty($contextlist->get_contextids())) {
            return;
        }

        $userid = $contextlist->get_user()->id;
        $context = \context_system::instance();
        $sessions = $DB->get_records('local_hand2stack_sess', ['userid' => $userid]);
        if ($sessions) {
            $data = (object)['sessions' => array_values($sessions)];
            \core_privacy\local\request\writer::with_context($context)->export_data(
                [get_string('pluginname', 'local_hand2stack')],
                $data
            );
        }

        $select = research_logger::user_event_select($userid);
        $events = $select ? $DB->get_records_select('local_hand2stack_event', $select[0], $select[1], 'traceid, eventseq') : [];
        if ($events) {
            \core_privacy\local\request\writer::with_context($context)->export_data(
                [get_string('pluginname', 'local_hand2stack'), get_string('privacy:metadata:event', 'local_hand2stack')],
                (object)['events' => array_values($events)]
            );
        }
    }

    public static function delete_data_for_all_users_in_context(\context $context): void {
        global $DB;

        if ($context->contextlevel === CONTEXT_SYSTEM) {
            $DB->delete_records('local_hand2stack_sess');
            $DB->delete_records('local_hand2stack_event');
        }
    }

    public static function delete_data_for_user(\core_privacy\local\request\approved_contextlist $contextlist): void {
        global $DB;

        if (empty($contextlist->get_contextids())) {
            return;
        }

        foreach ($contextlist->get_contexts() as $context) {
            if ($context->contextlevel === CONTEXT_SYSTEM) {
                $userid = $contextlist->get_user()->id;
                $DB->delete_records('local_hand2stack_sess', ['userid' => $userid]);
                $select = research_logger::user_event_select($userid);
                if ($select) {
                    $DB->delete_records_select('local_hand2stack_event', $select[0], $select[1]);
                }
                return;
            }
        }
    }

    public static function get_users_in_context(\core_privacy\local\request\userlist $userlist): void {
        if ($userlist->get_context()->contextlevel !== CONTEXT_SYSTEM) {
            return;
        }
        $userlist->add_from_sql('userid', 'SELECT userid FROM {local_hand2stack_sess}', []);
        // Events hold no user id, but each belongs to a usage the user owns.
        $userlist->add_from_sql('userid',
            'SELECT qza.userid
               FROM {local_hand2stack_event} e
               JOIN {quiz_attempts} qza ON qza.uniqueid = e.usageid', []);
        $userlist->add_from_sql('instanceid',
            "SELECT ctx.instanceid
               FROM {local_hand2stack_event} e
               JOIN {question_usages} qu ON qu.id = e.usageid AND qu.component = 'core_question_preview'
               JOIN {context} ctx ON ctx.id = qu.contextid AND ctx.contextlevel = :userlevel",
            ['userlevel' => CONTEXT_USER]);
    }

    public static function delete_data_for_users(\core_privacy\local\request\approved_userlist $userlist): void {
        global $DB;

        if ($userlist->get_context()->contextlevel !== CONTEXT_SYSTEM) {
            return;
        }
        foreach ($userlist->get_userids() as $userid) {
            $DB->delete_records('local_hand2stack_sess', ['userid' => $userid]);
            $select = research_logger::user_event_select((int)$userid);
            if ($select) {
                $DB->delete_records_select('local_hand2stack_event', $select[0], $select[1]);
            }
        }
    }

    /** Research events carry a pseudonym, never the user id, so look them up by it. */
    private static function user_has_events(int $userid): bool {
        global $DB;

        $select = research_logger::user_event_select($userid);
        return $select && $DB->record_exists_select('local_hand2stack_event', $select[0], $select[1]);
    }
}
