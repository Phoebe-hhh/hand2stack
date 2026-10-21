<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * db upgrade.php for Hand2STACK.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
defined('MOODLE_INTERNAL') || die();

function xmldb_local_hand2stack_upgrade($oldversion) {
    global $DB;

    $dbman = $DB->get_manager();

    if ($oldversion < 2026053100) {
        $table = new xmldb_table('local_hand2stack_sess');

        if (!$dbman->table_exists($table)) {
            $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
            $table->add_field('sessionid', XMLDB_TYPE_CHAR, '64', null, XMLDB_NOTNULL, null, null);
            $table->add_field('userid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('status', XMLDB_TYPE_CHAR, '20', null, XMLDB_NOTNULL, null, 'waiting');
            $table->add_field('rawlatex', XMLDB_TYPE_TEXT, null, null, null, null, null);
            $table->add_field('stack', XMLDB_TYPE_TEXT, null, null, null, null, null);
            $table->add_field('resulttext', XMLDB_TYPE_TEXT, null, null, null, null, null);
            $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('expiresat', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);

            $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
            $table->add_index('sessionid_uix', XMLDB_INDEX_UNIQUE, ['sessionid']);
            $table->add_index('userid_ix', XMLDB_INDEX_NOTUNIQUE, ['userid']);
            $table->add_index('expiresat_ix', XMLDB_INDEX_NOTUNIQUE, ['expiresat']);

            $dbman->create_table($table);
        }

        upgrade_plugin_savepoint(true, 2026053100, 'local', 'hand2stack');
    }

    if ($oldversion < 2026091200) {
        $table = new xmldb_table('local_hand2stack_sess');
        $field = new xmldb_field('rawascii', XMLDB_TYPE_TEXT, null, null, null, null, null, 'rawlatex');

        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        upgrade_plugin_savepoint(true, 2026091200, 'local', 'hand2stack');
    }

    if ($oldversion < 2026091500) {
        upgrade_plugin_savepoint(true, 2026091500, 'local', 'hand2stack');
    }

    if ($oldversion < 2026092300) {
        upgrade_plugin_savepoint(true, 2026092300, 'local', 'hand2stack');
    }

    if ($oldversion < 2026092400) {
        upgrade_plugin_savepoint(true, 2026092400, 'local', 'hand2stack');
    }

    if ($oldversion < 2026100400) {
        $table = new xmldb_table('local_hand2stack_sess');
        $field = new xmldb_field('rawtext', XMLDB_TYPE_TEXT, null, null, null, null, null, 'rawascii');

        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        upgrade_plugin_savepoint(true, 2026100400, 'local', 'hand2stack');
    }

    if ($oldversion < 2026100500) {
        $table = new xmldb_table('local_hand2stack_event');

        if (!$dbman->table_exists($table)) {
            $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
            $table->add_field('eventid', XMLDB_TYPE_CHAR, '36', null, XMLDB_NOTNULL, null, null);
            $table->add_field('studyid', XMLDB_TYPE_CHAR, '64', null, XMLDB_NOTNULL, null, null);
            $table->add_field('anonuserid', XMLDB_TYPE_CHAR, '64', null, XMLDB_NOTNULL, null, null);
            $table->add_field('traceid', XMLDB_TYPE_CHAR, '36', null, XMLDB_NOTNULL, null, null);
            $table->add_field('pageid', XMLDB_TYPE_CHAR, '36', null, XMLDB_NOTNULL, null, null);
            $table->add_field('eventseq', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('eventtype', XMLDB_TYPE_CHAR, '40', null, XMLDB_NOTNULL, null, null);
            $table->add_field('usageid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('slot', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('inputname', XMLDB_TYPE_CHAR, '100', null, null, null, null);
            $table->add_field('modality', XMLDB_TYPE_CHAR, '20', null, null, null, null);
            $table->add_field('questionid', XMLDB_TYPE_INTEGER, '10', null, null, null, null);
            $table->add_field('qbankentryid', XMLDB_TYPE_INTEGER, '10', null, null, null, null);
            $table->add_field('questionversion', XMLDB_TYPE_INTEGER, '10', null, null, null, null);
            $table->add_field('pluginversion', XMLDB_TYPE_CHAR, '40', null, XMLDB_NOTNULL, null, null);
            $table->add_field('schemaversion', XMLDB_TYPE_INTEGER, '4', null, XMLDB_NOTNULL, null, null);
            $table->add_field('clienttime', XMLDB_TYPE_INTEGER, '15', null, XMLDB_NOTNULL, null, null);
            $table->add_field('elapsedms', XMLDB_TYPE_INTEGER, '10', null, null, null, null);
            $table->add_field('servertime', XMLDB_TYPE_INTEGER, '15', null, XMLDB_NOTNULL, null, null);
            $table->add_field('payload', XMLDB_TYPE_TEXT, null, null, null, null, null);

            $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
            $table->add_index('eventid_uix', XMLDB_INDEX_UNIQUE, ['eventid']);
            $table->add_index('trace_seq_ix', XMLDB_INDEX_NOTUNIQUE, ['traceid', 'eventseq']);
            $table->add_index('study_user_ix', XMLDB_INDEX_NOTUNIQUE, ['studyid', 'anonuserid']);
            $table->add_index('usage_slot_ix', XMLDB_INDEX_NOTUNIQUE, ['usageid', 'slot']);
            $table->add_index('eventtype_ix', XMLDB_INDEX_NOTUNIQUE, ['eventtype']);
            $table->add_index('servertime_ix', XMLDB_INDEX_NOTUNIQUE, ['servertime']);

            $dbman->create_table($table);
        }

        \local_hand2stack\local\research_logger::ensure_secret();

        upgrade_plugin_savepoint(true, 2026100500, 'local', 'hand2stack');
    }

    if ($oldversion < 2026101900) {
        $table = new xmldb_table('local_hand2stack_event');
        $field = new xmldb_field('studycondition', XMLDB_TYPE_CHAR, '20', null, null, null, null, 'modality');

        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        $table = new xmldb_table('local_hand2stack_cm');

        if (!$dbman->table_exists($table)) {
            $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
            $table->add_field('cmid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('inputmode', XMLDB_TYPE_CHAR, '20', null, XMLDB_NOTNULL, null, 'normal');
            $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);

            $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
            $table->add_key('cmid_fk', XMLDB_KEY_FOREIGN_UNIQUE, ['cmid'], 'course_modules', ['id']);

            $dbman->create_table($table);
        }

        upgrade_plugin_savepoint(true, 2026101900, 'local', 'hand2stack');
    }

    if ($oldversion < 2026101901) {
        // New capability local/hand2stack:exportlogs.
        upgrade_plugin_savepoint(true, 2026101901, 'local', 'hand2stack');
    }

    if ($oldversion < 2026101902) {
        // Research lifecycle events and rebuilt AMD modules. The version bump
        // also invalidates Moodle's cached browser JavaScript.
        upgrade_plugin_savepoint(true, 2026101902, 'local', 'hand2stack');
    }

    if ($oldversion < 2026102100) {
        // Identified logging for everyday use: the user id beside the pseudonym.
        $table = new xmldb_table('local_hand2stack_event');
        $field = new xmldb_field('userid', XMLDB_TYPE_INTEGER, '10', null, null, null, null, 'anonuserid');
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }
        $field = new xmldb_field('identified', XMLDB_TYPE_INTEGER, '1', null, XMLDB_NOTNULL, null, '0', 'userid');
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }
        $index = new xmldb_index('userid_ix', XMLDB_INDEX_NOTUNIQUE, ['userid']);
        if (!$dbman->index_exists($table, $index)) {
            $dbman->add_index($table, $index);
        }

        $table = new xmldb_table('local_hand2stack_cm');
        $field = new xmldb_field('identified', XMLDB_TYPE_INTEGER, '1', null, XMLDB_NOTNULL, null, '0', 'inputmode');
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        upgrade_plugin_savepoint(true, 2026102100, 'local', 'hand2stack');
    }

    if ($oldversion < 2026102101) {
        // Quiz attempt observers (db/events.php) that complete research traces.
        upgrade_plugin_savepoint(true, 2026102101, 'local', 'hand2stack');
    }

    return true;
}
