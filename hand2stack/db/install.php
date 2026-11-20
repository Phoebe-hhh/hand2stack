<?php
// This file is part of Moodle - http://moodle.org/.
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Post-install migration for Hand2STACK.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
defined('MOODLE_INTERNAL') || die();

/** Copy settings from the legacy component when both are present. */
function xmldb_local_hand2stack_install(): void {
    $settings = [
        'enabled',
        'mathpixappid',
        'mathpixappkey',
        'maxfilesize',
        'ratelimit',
        'enablemobile',
        'mobilebaseurl',
    ];

    foreach ($settings as $name) {
        $legacyvalue = get_config('local_stackinputhelper', $name);
        if ($legacyvalue !== false && get_config('local_hand2stack', $name) === false) {
            set_config($name, $legacyvalue, 'local_hand2stack');
        }
    }

    \local_hand2stack\local\research_logger::ensure_secret();
}
