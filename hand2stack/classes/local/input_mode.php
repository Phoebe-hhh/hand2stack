<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * classes local input mode.php for Hand2STACK.
 *
 * The input mode a teacher picks on a quiz's settings page. A study's
 * keyboard condition uses "logonly": the quiz looks like plain STACK but
 * research events are still recorded. A quiz with no saved mode is normal.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\local;

defined('MOODLE_INTERNAL') || die();

final class input_mode {
    /** Buttons shown and events recorded. */
    public const NORMAL = 'normal';

    /** No buttons; events still recorded (the keyboard condition). */
    public const LOGONLY = 'logonly';

    /** As if the plugin were not installed: no buttons, no events. */
    public const OFF = 'off';

    public const MODES = [self::NORMAL, self::LOGONLY, self::OFF];

    /** Study condition written to each event, by mode. */
    private const CONDITIONS = [
        self::NORMAL => 'hand2stack',
        self::LOGONLY => 'keyboard',
    ];

    private const TABLE = 'local_hand2stack_cm';

    public static function for_cm(int $cmid): string {
        global $DB;

        if ($cmid <= 0) {
            return self::NORMAL;
        }
        $mode = $DB->get_field(self::TABLE, 'inputmode', ['cmid' => $cmid]);
        return in_array($mode, self::MODES, true) ? $mode : self::NORMAL;
    }

    /** The mode of the quiz a context belongs to; normal outside a quiz. */
    public static function for_context(?\context $context): string {
        if (!$context || $context->contextlevel != CONTEXT_MODULE) {
            return self::NORMAL;
        }
        return self::for_cm((int)$context->instanceid);
    }

    public static function set_for_cm(int $cmid, string $mode): void {
        global $DB;

        if (!in_array($mode, self::MODES, true)) {
            throw new \coding_exception('Unknown Hand2STACK input mode: ' . $mode);
        }
        $existing = $DB->get_record(self::TABLE, ['cmid' => $cmid]);
        if ($existing) {
            if ($existing->inputmode !== $mode) {
                $DB->update_record(self::TABLE, (object)[
                    'id' => $existing->id, 'inputmode' => $mode, 'timemodified' => time(),
                ]);
            }
        } else if ($mode !== self::NORMAL) {
            $DB->insert_record(self::TABLE, (object)[
                'cmid' => $cmid, 'inputmode' => $mode, 'timemodified' => time(),
            ]);
        }
    }

    public static function delete_for_cm(int $cmid): void {
        global $DB;

        $DB->delete_records(self::TABLE, ['cmid' => $cmid]);
    }

    /** keyboard / hand2stack, or null for a mode that records nothing. */
    public static function condition(string $mode): ?string {
        return self::CONDITIONS[$mode] ?? null;
    }

    /**
     * Whether learners have attempted the quiz. The mode is then locked so one
     * quiz never holds attempts made under two conditions. Teacher previews
     * do not count.
     */
    public static function is_locked(int $quizid): bool {
        global $CFG;

        if ($quizid <= 0) {
            return false;
        }
        require_once($CFG->dirroot . '/mod/quiz/locallib.php');
        return quiz_has_attempts($quizid);
    }
}
