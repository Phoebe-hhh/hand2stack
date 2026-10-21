<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * classes task complete research traces.php for Hand2STACK.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\task;

use local_hand2stack\local\research_finisher;

defined('MOODLE_INTERNAL') || die();

/** Adds the task_finished events a finished quiz attempt is missing; see research_finisher. */
class complete_research_traces extends \core\task\adhoc_task {
    public function execute(): void {
        $data = $this->get_custom_data();
        research_finisher::complete_attempt((int)$data->attemptid, (string)$data->reason);
    }
}
