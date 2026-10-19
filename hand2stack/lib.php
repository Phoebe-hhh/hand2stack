<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * lib.php for Hand2STACK.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
defined('MOODLE_INTERNAL') || die();

use local_hand2stack\local\input_mode;

/**
 * Add the Hand2STACK input mode to a quiz's settings page.
 *
 * @param moodleform_mod $formwrapper
 * @param MoodleQuickForm $mform
 */
function local_hand2stack_coursemodule_standard_elements($formwrapper, $mform): void {
    $current = $formwrapper->get_current();
    if (($current->modulename ?? '') !== 'quiz' || !get_config('local_hand2stack', 'enabled')) {
        return;
    }

    $options = [];
    foreach (input_mode::MODES as $mode) {
        $options[$mode] = get_string('inputmode_' . $mode, 'local_hand2stack');
    }
    $mform->addElement('header', 'local_hand2stack_header', get_string('pluginname', 'local_hand2stack'));
    $mform->addElement('select', 'local_hand2stack_inputmode', get_string('inputmode', 'local_hand2stack'), $options);
    $mform->addHelpButton('local_hand2stack_inputmode', 'inputmode', 'local_hand2stack');
    $mform->setDefault('local_hand2stack_inputmode', input_mode::for_cm((int)($current->coursemodule ?? 0)));

    if (input_mode::is_locked((int)($current->instance ?? 0))) {
        $mform->hardFreeze('local_hand2stack_inputmode');
        $mform->addElement('static', 'local_hand2stack_inputmode_locked', '',
            get_string('inputmodelocked', 'local_hand2stack'));
    }
}

/**
 * Save the input mode chosen on a quiz's settings page.
 *
 * @param stdClass $data
 * @param stdClass $course
 * @return stdClass
 */
function local_hand2stack_coursemodule_edit_post_actions($data, $course) {
    if (($data->modulename ?? '') !== 'quiz' || !isset($data->local_hand2stack_inputmode)) {
        return $data;
    }
    $mode = (string)$data->local_hand2stack_inputmode;
    // A frozen select is still posted; the lock is enforced here as well.
    if (in_array($mode, input_mode::MODES, true) && !input_mode::is_locked((int)$data->instance)) {
        input_mode::set_for_cm((int)$data->coursemodule, $mode);
    }
    return $data;
}

/**
 * Forget a deleted quiz's input mode.
 *
 * @param stdClass $cm
 */
function local_hand2stack_pre_course_module_delete($cm): void {
    input_mode::delete_for_cm((int)$cm->id);
}

/**
 * Add "Hand2STACK log" to a quiz's More menu for those who may download it.
 *
 * @param settings_navigation $nav
 * @param context $context
 */
function local_hand2stack_extend_settings_navigation(settings_navigation $nav, context $context): void {
    if ($context->contextlevel != CONTEXT_MODULE) {
        return;
    }
    $courseid = $context->get_course_context()->instanceid;
    $cm = get_fast_modinfo($courseid)->get_cm($context->instanceid);
    if ($cm->modname !== 'quiz' || !has_capability('local/hand2stack:exportlogs', $context)) {
        return;
    }
    $modulesettings = $nav->find('modulesettings', navigation_node::TYPE_SETTING);
    if (!$modulesettings) {
        return;
    }
    $modulesettings->add(get_string('exportlogs', 'local_hand2stack'),
        new moodle_url('/local/hand2stack/export.php', ['cmid' => $context->instanceid]),
        navigation_node::TYPE_SETTING, null, 'local_hand2stack_export', new pix_icon('i/export', ''));
}
