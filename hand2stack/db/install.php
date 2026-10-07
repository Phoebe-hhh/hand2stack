<?php
// This file is part of Moodle - http://moodle.org/.

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
