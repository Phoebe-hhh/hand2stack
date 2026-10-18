<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * tests research logger test.php for Hand2STACK.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack;

use local_hand2stack\local\input_mode;
use local_hand2stack\local\research_logger;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/question/engine/lib.php');
require_once($CFG->dirroot . '/mod/quiz/locallib.php');

/**
 * @covers \local_hand2stack\local\research_logger
 * @covers \local_hand2stack\local\input_mode
 * @covers \local_hand2stack\privacy\provider
 */
final class research_logger_test extends \advanced_testcase {
    private function enable_study(string $studyid = 'pilot2026a'): void {
        set_config('enabled', 1, 'local_hand2stack');
        set_config('researchlogging', 1, 'local_hand2stack');
        set_config('researchstudyid', $studyid, 'local_hand2stack');
    }

    /** A started question preview owned by the user, as [usageid, slot]. */
    private function create_preview_usage(\stdClass $user): array {
        $questiongenerator = $this->getDataGenerator()->get_plugin_generator('core_question');
        $category = $questiongenerator->create_question_category();
        $question = $questiongenerator->create_question('shortanswer', null, ['category' => $category->id]);

        $quba = \question_engine::make_questions_usage_by_activity('core_question_preview',
            \context_user::instance($user->id));
        $quba->set_preferred_behaviour('deferredfeedback');
        $slot = $quba->add_question(\question_bank::load_question($question->id));
        $quba->start_all_questions();
        \question_engine::save_questions_usage_by_activity($quba);
        return [(int)$quba->get_id(), (int)$slot];
    }

    /** A quiz in the given input mode and the user's started attempt, as [quiz, usageid, slot]. */
    private function create_quiz_attempt(\stdClass $user, string $mode): array {
        $course = $this->getDataGenerator()->create_course();
        $quiz = $this->getDataGenerator()->create_module('quiz', ['course' => $course->id]);
        input_mode::set_for_cm((int)$quiz->cmid, $mode);

        $questiongenerator = $this->getDataGenerator()->get_plugin_generator('core_question');
        $category = $questiongenerator->create_question_category();
        $question = $questiongenerator->create_question('shortanswer', null, ['category' => $category->id]);
        quiz_add_quiz_question($question->id, $quiz);
        \mod_quiz\quiz_settings::create($quiz->id)->get_grade_calculator()->recompute_quiz_sumgrades();

        $this->setUser($user);
        $attempt = quiz_prepare_and_start_new_attempt(\mod_quiz\quiz_settings::create($quiz->id, $user->id), 1, null);
        $this->setUser(null);
        return [$quiz, (int)$attempt->uniqueid, 1];
    }

    private function make_participant(\stdClass $user): void {
        $roleid = create_role('Research participant', 'h2sparticipant', '');
        $systemcontext = \context_system::instance();
        assign_capability(research_logger::PARTICIPANT_CAPABILITY, CAP_ALLOW, $roleid, $systemcontext->id);
        role_assign($roleid, $user->id, $systemcontext->id);
    }

    private function event(int $usageid, int $slot, array $overrides = []): array {
        static $seq = 0;
        $seq++;
        return array_merge([
            'eventid' => sprintf('00000000-0000-4000-8000-%012d', $seq),
            'traceid' => '11111111-1111-4111-8111-111111111111',
            'pageid' => '22222222-2222-4222-8222-222222222222',
            'eventseq' => $seq,
            'type' => 'edit_committed',
            'clienttime' => 1791190809123,
            'elapsedms' => 8123,
            'usage' => $usageid,
            'slot' => $slot,
            'input' => 'ans1',
            'modality' => 'image',
            'schema' => 1,
            'payload' => ['target' => 'line', 'before' => 'x^2+5x+8=0', 'after' => 'x^2+5x+6=0'],
        ], $overrides);
    }

    public function test_pseudonym_is_stable_within_a_study_and_differs_across_studies(): void {
        $this->resetAfterTest();

        $first = research_logger::anon_user_id(42, 'pilot2026a');
        $this->assertSame($first, research_logger::anon_user_id(42, 'pilot2026a'));
        $this->assertNotSame($first, research_logger::anon_user_id(42, 'controlled2027a'));
        $this->assertNotSame($first, research_logger::anon_user_id(43, 'pilot2026a'));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $first);
    }

    public function test_normalise_event_rejects_unknown_types_and_malformed_ids(): void {
        $this->assertNotNull(research_logger::normalise_event($this->event(1, 1)));
        $this->assertNull(research_logger::normalise_event($this->event(1, 1, ['type' => 'keypress'])));
        $this->assertNull(research_logger::normalise_event($this->event(1, 1, ['eventid' => 'not-a-uuid'])));
        $this->assertNull(research_logger::normalise_event($this->event(1, 1, ['schema' => 99])));
        $this->assertNull(research_logger::normalise_event($this->event(1, 1, ['payload' => 'text'])));

        $record = research_logger::normalise_event($this->event(1, 1, ['modality' => 'telepathy', 'payload' => []]));
        $this->assertNull($record->modality);
        $this->assertSame('{}', $record->payload);
    }

    public function test_events_are_stored_with_server_resolved_identity_and_no_user_id(): void {
        global $DB;
        $this->resetAfterTest();
        $this->enable_study();

        $user = $this->getDataGenerator()->create_user();
        $this->make_participant($user);
        [$usageid, $slot] = $this->create_preview_usage($user);

        $event = $this->event($usageid, $slot);
        $counts = research_logger::record_batch([$event, $event], (int)$user->id);
        $this->assertSame(['accepted' => 1, 'duplicates' => 1, 'rejected' => 0], $counts);

        $record = $DB->get_record('local_hand2stack_event', ['eventid' => $event['eventid']], '*', MUST_EXIST);
        $this->assertSame('pilot2026a', $record->studyid);
        $this->assertSame(research_logger::anon_user_id((int)$user->id, 'pilot2026a'), $record->anonuserid);
        $this->assertNotEmpty($record->questionid);
        $this->assertNotEmpty($record->qbankentryid);
        $this->assertNotEmpty($record->pluginversion);
        $this->assertSame(['target' => 'line', 'before' => 'x^2+5x+8=0', 'after' => 'x^2+5x+6=0'],
            json_decode($record->payload, true));
        $this->assertObjectNotHasProperty('userid', $record);
    }

    public function test_non_participants_and_other_users_usages_are_not_recorded(): void {
        global $DB;
        $this->resetAfterTest();
        $this->enable_study();

        $owner = $this->getDataGenerator()->create_user();
        $other = $this->getDataGenerator()->create_user();
        [$usageid, $slot] = $this->create_preview_usage($owner);

        // Owner without consent.
        $this->assertSame(1, research_logger::record_batch([$this->event($usageid, $slot)], (int)$owner->id)['rejected']);

        // A consenting participant cannot log into someone else's usage.
        $this->make_participant($other);
        $this->assertSame(1, research_logger::record_batch([$this->event($usageid, $slot)], (int)$other->id)['rejected']);

        // An unknown slot is rejected.
        $this->assertSame(1, research_logger::record_batch([$this->event($usageid, 99)], (int)$other->id)['rejected']);

        $this->assertSame(0, $DB->count_records('local_hand2stack_event'));
    }

    public function test_privacy_api_finds_and_deletes_events_by_pseudonym(): void {
        global $DB;
        $this->resetAfterTest();
        $this->enable_study();

        $user = $this->getDataGenerator()->create_user();
        $this->make_participant($user);
        [$usageid, $slot] = $this->create_preview_usage($user);
        research_logger::record_batch([$this->event($usageid, $slot)], (int)$user->id);

        $contextlist = privacy\provider::get_contexts_for_userid((int)$user->id);
        $this->assertCount(1, $contextlist);

        $approved = new \core_privacy\local\request\approved_contextlist($user, 'local_hand2stack',
            $contextlist->get_contextids());
        privacy\provider::delete_data_for_user($approved);
        $this->assertSame(0, $DB->count_records('local_hand2stack_event'));
    }

    public function test_privacy_userlist_finds_event_owners_through_their_usage(): void {
        global $DB;
        $this->resetAfterTest();
        $this->enable_study();

        $user = $this->getDataGenerator()->create_user();
        $this->make_participant($user);
        [$usageid, $slot] = $this->create_preview_usage($user);
        research_logger::record_batch([$this->event($usageid, $slot)], (int)$user->id);

        $context = \context_system::instance();
        $userlist = new \core_privacy\local\request\userlist($context, 'local_hand2stack');
        privacy\provider::get_users_in_context($userlist);
        $this->assertSame([(int)$user->id], array_map('intval', $userlist->get_userids()));

        privacy\provider::delete_data_for_users(new \core_privacy\local\request\approved_userlist(
            $context, 'local_hand2stack', [(int)$user->id]));
        $this->assertSame(0, $DB->count_records('local_hand2stack_event'));
    }

    public function test_events_carry_the_condition_of_the_quiz_they_were_made_in(): void {
        global $DB;
        $this->resetAfterTest();
        $this->enable_study();

        $user = $this->getDataGenerator()->create_user();
        $this->make_participant($user);
        [, $handusage, $slot] = $this->create_quiz_attempt($user, input_mode::NORMAL);
        [$keyboardquiz, $keyboardusage] = $this->create_quiz_attempt($user, input_mode::LOGONLY);
        [, $offusage] = $this->create_quiz_attempt($user, input_mode::OFF);
        [$previewusage, $previewslot] = $this->create_preview_usage($user);

        $hand = $this->event($handusage, $slot);
        $keyboard = $this->event($keyboardusage, $slot, ['modality' => 'keyboard']);
        $preview = $this->event($previewusage, $previewslot);
        $counts = research_logger::record_batch([$hand, $keyboard, $preview, $this->event($offusage, $slot)], (int)$user->id);
        $this->assertSame(['accepted' => 3, 'duplicates' => 0, 'rejected' => 1], $counts);

        $condition = fn(array $event) => $DB->get_field('local_hand2stack_event', 'studycondition',
            ['eventid' => $event['eventid']], MUST_EXIST);
        $this->assertSame('hand2stack', $condition($hand));
        $this->assertSame('keyboard', $condition($keyboard));
        $this->assertNull($condition($preview));

        // Changing the mode later never relabels events already recorded.
        input_mode::set_for_cm((int)$keyboardquiz->cmid, input_mode::NORMAL);
        $this->assertSame('keyboard', $condition($keyboard));
    }

    public function test_input_mode_defaults_to_normal_and_locks_once_attempted(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course();
        $quiz = $this->getDataGenerator()->create_module('quiz', ['course' => $course->id]);
        $this->assertSame(input_mode::NORMAL, input_mode::for_cm((int)$quiz->cmid));
        $this->assertFalse(input_mode::is_locked((int)$quiz->id));

        // Saving normal on a quiz without a row stores nothing.
        input_mode::set_for_cm((int)$quiz->cmid, input_mode::NORMAL);
        $this->assertSame(0, $DB->count_records('local_hand2stack_cm'));
        input_mode::set_for_cm((int)$quiz->cmid, input_mode::LOGONLY);
        $this->assertSame(input_mode::LOGONLY, input_mode::for_cm((int)$quiz->cmid));
        $this->assertSame(input_mode::LOGONLY,
            input_mode::for_context(\context_module::instance((int)$quiz->cmid)));
        $this->assertSame(input_mode::NORMAL, input_mode::for_context(\context_system::instance()));

        [$attempted] = $this->create_quiz_attempt($this->getDataGenerator()->create_user(), input_mode::LOGONLY);
        $this->assertTrue(input_mode::is_locked((int)$attempted->id));

        course_delete_module((int)$quiz->cmid);
        $this->assertFalse($DB->record_exists('local_hand2stack_cm', ['cmid' => $quiz->cmid]));
    }
}
