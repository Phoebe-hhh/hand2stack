<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * settings.php for Hand2STACK.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage(
        'local_hand2stack',
        get_string('pluginname', 'local_hand2stack')
    );

    if ($ADMIN->fulltree) {
        $settings->add(new admin_setting_configcheckbox(
            'local_hand2stack/enabled',
            get_string('enabled', 'local_hand2stack'),
            get_string('enabled_desc', 'local_hand2stack'),
            1
        ));

        $settings->add(new admin_setting_configtext(
            'local_hand2stack/mathpixappid',
            get_string('mathpixappid', 'local_hand2stack'),
            get_string('mathpixappid_desc', 'local_hand2stack'),
            '',
            PARAM_TEXT
        ));

        $settings->add(new admin_setting_configpasswordunmask(
            'local_hand2stack/mathpixappkey',
            get_string('mathpixappkey', 'local_hand2stack'),
            get_string('mathpixappkey_desc', 'local_hand2stack'),
            ''
        ));

        $settings->add(new admin_setting_configtext(
            'local_hand2stack/maxfilesize',
            get_string('maxfilesize', 'local_hand2stack'),
            get_string('maxfilesize_desc', 'local_hand2stack'),
            2,
            PARAM_INT
        ));

        $settings->add(new admin_setting_configtext(
            'local_hand2stack/ratelimit',
            get_string('ratelimit', 'local_hand2stack'),
            get_string('ratelimit_desc', 'local_hand2stack'),
            20,
            PARAM_INT
        ));

        $settings->add(new admin_setting_configcheckbox(
            'local_hand2stack/enablemobile',
            get_string('enablemobile', 'local_hand2stack'),
            get_string('enablemobile_desc', 'local_hand2stack'),
            1
        ));

        $settings->add(new admin_setting_configtext(
            'local_hand2stack/mobilebaseurl',
            get_string('mobilebaseurl', 'local_hand2stack'),
            get_string('mobilebaseurl_desc', 'local_hand2stack'),
            '',
            PARAM_URL
        ));
    }

    $ADMIN->add('localplugins', $settings);
}
