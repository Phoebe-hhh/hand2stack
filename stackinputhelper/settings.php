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
 * @package    local_stackinputhelper
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage(
        'local_stackinputhelper',
        get_string('pluginname', 'local_stackinputhelper')
    );

    if ($ADMIN->fulltree) {
        $settings->add(new admin_setting_configcheckbox(
            'local_stackinputhelper/enabled',
            get_string('enabled', 'local_stackinputhelper'),
            get_string('enabled_desc', 'local_stackinputhelper'),
            1
        ));

        $settings->add(new admin_setting_configtext(
            'local_stackinputhelper/mathpixappid',
            get_string('mathpixappid', 'local_stackinputhelper'),
            get_string('mathpixappid_desc', 'local_stackinputhelper'),
            '',
            PARAM_TEXT
        ));

        $settings->add(new admin_setting_configpasswordunmask(
            'local_stackinputhelper/mathpixappkey',
            get_string('mathpixappkey', 'local_stackinputhelper'),
            get_string('mathpixappkey_desc', 'local_stackinputhelper'),
            ''
        ));

        $settings->add(new admin_setting_configtext(
            'local_stackinputhelper/maxfilesize',
            get_string('maxfilesize', 'local_stackinputhelper'),
            get_string('maxfilesize_desc', 'local_stackinputhelper'),
            2,
            PARAM_INT
        ));

        $settings->add(new admin_setting_configtext(
            'local_stackinputhelper/ratelimit',
            get_string('ratelimit', 'local_stackinputhelper'),
            get_string('ratelimit_desc', 'local_stackinputhelper'),
            20,
            PARAM_INT
        ));

        $settings->add(new admin_setting_configcheckbox(
            'local_stackinputhelper/enablemobile',
            get_string('enablemobile', 'local_stackinputhelper'),
            get_string('enablemobile_desc', 'local_stackinputhelper'),
            1
        ));

        $settings->add(new admin_setting_configtext(
            'local_stackinputhelper/mobilebaseurl',
            get_string('mobilebaseurl', 'local_stackinputhelper'),
            get_string('mobilebaseurl_desc', 'local_stackinputhelper'),
            '',
            PARAM_URL
        ));
    }

    $ADMIN->add('localplugins', $settings);
}
