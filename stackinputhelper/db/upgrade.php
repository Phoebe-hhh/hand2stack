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
 * @package    local_stackinputhelper
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
defined('MOODLE_INTERNAL') || die();

function xmldb_local_stackinputhelper_upgrade($oldversion) {
    global $DB;

    $dbman = $DB->get_manager();

    if ($oldversion < 2026053100) {
        $table = new xmldb_table('local_stackinputhelper_sess');

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

        upgrade_plugin_savepoint(true, 2026053100, 'local', 'stackinputhelper');
    }

    if ($oldversion < 2026091200) {
        $table = new xmldb_table('local_stackinputhelper_sess');
        $field = new xmldb_field('rawascii', XMLDB_TYPE_TEXT, null, null, null, null, null, 'rawlatex');

        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        upgrade_plugin_savepoint(true, 2026091200, 'local', 'stackinputhelper');
    }

    if ($oldversion < 2026091500) {
        upgrade_plugin_savepoint(true, 2026091500, 'local', 'stackinputhelper');
    }

    if ($oldversion < 2026092300) {
        upgrade_plugin_savepoint(true, 2026092300, 'local', 'stackinputhelper');
    }

    if ($oldversion < 2026092400) {
        upgrade_plugin_savepoint(true, 2026092400, 'local', 'stackinputhelper');
    }

    return true;
}
