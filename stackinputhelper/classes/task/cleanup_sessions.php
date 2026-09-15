<?php
// This file is part of Moodle - http://moodle.org/.
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

namespace local_stackinputhelper\task;

defined('MOODLE_INTERNAL') || die();

/** Removes expired mobile-upload sessions and their recognition results. */
final class cleanup_sessions extends \core\task\scheduled_task {
    public function get_name(): string {
        return get_string('taskcleanupexpiredsessions', 'local_stackinputhelper');
    }

    public function execute(): void {
        global $DB;

        $DB->delete_records_select('local_stackinputhelper_sess', 'expiresat < ?', [time()]);
    }
}
