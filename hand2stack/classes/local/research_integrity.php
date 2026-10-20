<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * classes local research integrity.php for Hand2STACK.
 *
 * Checks a study's stored events for signs of an incomplete record before
 * they are analysed: gaps in a trace's event sequence (events lost or
 * rejected), events the browser reported as never delivered
 * (delivery_failed), clipped answers, learner actions without an input
 * method, and tasks that never finished. Also sums each task's active time.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\local;

defined('MOODLE_INTERNAL') || die();

final class research_integrity {
    /** Learner actions that always come from one input method. */
    public const ACTION_EVENTS = [
        'recognition_started', 'recognition_completed', 'candidate_selected', 'edit_committed', 'answer_inserted',
    ];

    /**
     * One summary per trace, in the order of the download.
     *
     * Each has: traceid, anonattemptid, cmid, quiz, slot, question,
     * studycondition, events, firstseq, lastseq, missing (eventseq numbers
     * absent between them), failed (delivery_failed reports: originalseq,
     * originaltype, reason, attempts; ordered by originalseq; a reported seq
     * is still listed in missing), duplicateedits (edit_committed sharing a
     * burstId), truncated (event ids), nomodality (event ids),
     * started, finished, revisits, wallms (task_started to task_finished)
     * siblingtraces (other traces of the same attempt and slot), and activems
     * (activeTimeMs of task_finished, else of the last
     * activity_paused or submit_triggered; null before active time existed).
     *
     * @return array[]
     */
    public static function check(string $studyid, ?int $cmid = null, ?int $courseid = null): array {
        $traces = [];
        $records = research_export::recordset($studyid, $cmid, $courseid);
        foreach ($records as $record) {
            $trace = &$traces[$record->traceid];
            if ($trace === null) {
                $trace = [
                    'traceid' => $record->traceid,
                    'anonattemptid' => research_logger::anon_attempt_id((int)$record->usageid, $studyid),
                    'cmid' => $record->cmid,
                    'quiz' => $record->quiz,
                    'slot' => (int)$record->slot,
                    'question' => $record->question,
                    'studycondition' => $record->studycondition,
                    'events' => 0,
                    'seqs' => [],
                    'failed' => [],
                    'bursts' => [],
                    'truncated' => [],
                    'nomodality' => [],
                    'started' => null,
                    'finished' => null,
                    'revisits' => 0,
                    'activems' => null,
                ];
            }
            $payload = $record->payload !== null ? json_decode($record->payload, true) : null;
            $payload = is_array($payload) ? $payload : [];
            // A report from the browser, outside the trace's own sequence.
            if ($record->eventtype === 'delivery_failed') {
                $trace['failed'][(string)($payload['originalEventId'] ?? $record->eventid)] = [
                    'originalseq' => isset($payload['originalEventSeq']) ? (int)$payload['originalEventSeq'] : null,
                    'originaltype' => (string)($payload['originalType'] ?? ''),
                    'reason' => (string)($payload['reason'] ?? ''),
                    'attempts' => isset($payload['attempts']) ? (int)$payload['attempts'] : null,
                ];
                unset($trace);
                continue;
            }
            $trace['events']++;
            $trace['seqs'][] = (int)$record->eventseq;

            if (!empty($payload['truncated']) || !empty($payload['truncatedAnswers'])
                    || ($record->payload !== null && strpos($record->payload, '…[truncated]') !== false)) {
                $trace['truncated'][] = $record->eventid;
            }
            if ($record->eventtype === 'edit_committed' && isset($payload['burstId'])) {
                $trace['bursts'][] = (string)$payload['burstId'];
            }
            if ($record->modality === null && in_array($record->eventtype, self::ACTION_EVENTS, true)) {
                $trace['nomodality'][] = $record->eventid;
            }
            switch ($record->eventtype) {
                case 'task_started':
                    $trace['started'] = (int)$record->clienttime;
                    break;
                case 'task_finished':
                    $trace['finished'] = (int)$record->clienttime;
                    break;
                case 'interaction_started':
                    if (!empty($payload['revisit'])) {
                        $trace['revisits']++;
                    }
                    break;
            }
            // The latest running total; task_finished's is final.
            if ($trace['finished'] === null || $record->eventtype === 'task_finished') {
                foreach (['activeTimeMs', 'totalActiveMs'] as $field) {
                    if (isset($payload[$field]) && is_numeric($payload[$field])) {
                        $trace['activems'] = (int)$payload[$field];
                    }
                }
            }
            unset($trace);
        }
        $records->close();

        $summaries = array_values(array_map(static function(array $trace): array {
            $seqs = array_unique($trace['seqs']);
            sort($seqs);
            $first = $seqs ? reset($seqs) : 0;
            $last = $seqs ? end($seqs) : 0;
            $trace['firstseq'] = $first;
            $trace['lastseq'] = $last;
            // A trace starts at 1 in the tab that made it.
            $trace['missing'] = array_values(array_diff(range(1, max(1, $last)), $seqs));
            $trace['duplicateseqs'] = count($trace['seqs']) - count($seqs);
            // The same edit logged twice (as typed and as recovered): count it once.
            $trace['duplicateedits'] = count($trace['bursts']) - count(array_unique($trace['bursts']));
            unset($trace['bursts']);
            // One report per original event, however often it was sent.
            $trace['failed'] = array_values($trace['failed']);
            usort($trace['failed'], static fn($a, $b) => $a['originalseq'] <=> $b['originalseq']);
            $trace['wallms'] = $trace['started'] !== null && $trace['finished'] !== null
                ? $trace['finished'] - $trace['started'] : null;
            unset($trace['seqs']);
            return $trace;
        }, $traces));

        // One question of one attempt normally has one trace. More mean the
        // browser lost sessionStorage mid-attempt: another tab or browser, or
        // Moodle clearing it when its JavaScript revision changed (a cache
        // purge or upgrade). Add up their active time for the question.
        $groups = [];
        foreach ($summaries as $trace) {
            $groups[$trace['anonattemptid'] . ':' . $trace['slot']][] = $trace['traceid'];
        }
        foreach ($summaries as &$trace) {
            $trace['siblingtraces'] = count($groups[$trace['anonattemptid'] . ':' . $trace['slot']]) - 1;
        }
        unset($trace);
        return $summaries;
    }

    /** Whether a trace summary shows anything to look at. */
    public static function has_issues(array $trace): bool {
        return $trace['missing'] || $trace['failed'] || $trace['duplicateseqs'] || $trace['duplicateedits']
            || $trace['truncated'] || $trace['nomodality'] || $trace['siblingtraces']
            || $trace['started'] === null || $trace['finished'] === null;
    }
}
