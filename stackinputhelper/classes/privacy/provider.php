<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * classes privacy provider.php for STACK Input Helper.
 *
 * @package    local_stackinputhelper
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_stackinputhelper\privacy;

defined('MOODLE_INTERNAL') || die();

class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\plugin\provider {
    public static function get_metadata(\core_privacy\local\metadata\collection $collection): \core_privacy\local\metadata\collection {
        $collection->add_external_location_link('mathpix', [
            'image' => 'privacy:metadata:mathpix:image',
            'strokes' => 'privacy:metadata:mathpix:strokes',
        ], 'privacy:metadata:mathpix');

        $collection->add_database_table('local_stackinputhelper_sess', [
            'userid' => 'privacy:metadata:session:userid',
            'rawlatex' => 'privacy:metadata:session:rawlatex',
            'rawascii' => 'privacy:metadata:session:rawascii',
            'stack' => 'privacy:metadata:session:stack',
            'resulttext' => 'privacy:metadata:session:resulttext',
            'timecreated' => 'privacy:metadata:session:timecreated',
            'timemodified' => 'privacy:metadata:session:timemodified',
            'expiresat' => 'privacy:metadata:session:expiresat',
        ], 'privacy:metadata:session');

        return $collection;
    }

    public static function get_contexts_for_userid(int $userid): \core_privacy\local\request\contextlist {
        global $DB;

        $contextlist = new \core_privacy\local\request\contextlist();
        if ($DB->record_exists('local_stackinputhelper_sess', ['userid' => $userid])) {
            $contextlist->add_context(\context_system::instance());
        }
        return $contextlist;
    }

    public static function export_user_data(\core_privacy\local\request\approved_contextlist $contextlist): void {
        global $DB;

        if (empty($contextlist->get_contextids())) {
            return;
        }

        $userid = $contextlist->get_user()->id;
        $sessions = $DB->get_records('local_stackinputhelper_sess', ['userid' => $userid]);
        if (!$sessions) {
            return;
        }

        $context = \context_system::instance();
        $data = (object)['sessions' => array_values($sessions)];
        \core_privacy\local\request\writer::with_context($context)->export_data(
            [get_string('pluginname', 'local_stackinputhelper')],
            $data
        );
    }

    public static function delete_data_for_all_users_in_context(\context $context): void {
        global $DB;

        if ($context->contextlevel === CONTEXT_SYSTEM) {
            $DB->delete_records('local_stackinputhelper_sess');
        }
    }

    public static function delete_data_for_user(\core_privacy\local\request\approved_contextlist $contextlist): void {
        global $DB;

        if (empty($contextlist->get_contextids())) {
            return;
        }

        foreach ($contextlist->get_contexts() as $context) {
            if ($context->contextlevel === CONTEXT_SYSTEM) {
                $DB->delete_records('local_stackinputhelper_sess', ['userid' => $contextlist->get_user()->id]);
                return;
            }
        }
    }
}
