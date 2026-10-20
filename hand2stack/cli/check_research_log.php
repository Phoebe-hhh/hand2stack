<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * cli check research log.php for Hand2STACK.
 *
 * Reports, per question trace, whether the stored research log looks
 * complete, and each task's active and wall-clock time. Run before analysing
 * a pilot:
 *
 *     php local/hand2stack/cli/check_research_log.php --study=pilot2026a --cmid=27
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define('CLI_SCRIPT', true);

require(__DIR__ . '/../../../config.php');
require_once($CFG->libdir . '/clilib.php');

use local_hand2stack\local\research_integrity;
use local_hand2stack\local\research_logger;

[$options, $unrecognised] = cli_get_params(
    ['study' => '', 'cmid' => 0, 'course' => 0, 'all' => false, 'json' => false, 'help' => false],
    ['s' => 'study', 'a' => 'all', 'h' => 'help']
);

if ($unrecognised || $options['help']) {
    echo "Check a Hand2STACK research log for gaps and clipped or unlabelled events.

Options:
  --study=ID   Study id (default: the one set in the plugin settings)
  --cmid=N     Only this quiz (course module id)
  --course=N   Only this course
  --all        List every trace, not only those with something to look at
  --json       Print the full result as JSON
  -h, --help   This help
";
    exit($unrecognised ? 1 : 0);
}

$studyid = $options['study'] !== '' ? (string)$options['study'] : research_logger::study_id();
if ($studyid === '') {
    cli_error('No study id: pass --study.');
}

$traces = research_integrity::check($studyid, (int)$options['cmid'] ?: null, (int)$options['course'] ?: null);

if ($options['json']) {
    echo json_encode($traces, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    exit(0);
}

$seconds = static fn(?int $ms): string => $ms === null ? '-' : sprintf('%.1f s', $ms / 1000);
$withissues = array_filter($traces, [research_integrity::class, 'has_issues']);
$events = array_sum(array_column($traces, 'events'));
echo "Study {$studyid}: " . count($traces) . " traces, {$events} events, " . count($withissues)
    . " traces to look at.\n\n";

foreach ($options['all'] ? $traces : $withissues as $trace) {
    $issues = [];
    if ($trace['missing']) {
        $issues[] = count($trace['missing']) . ' missing eventseq (' . implode(',', array_slice($trace['missing'], 0, 10))
            . (count($trace['missing']) > 10 ? ',…' : '') . ')';
    }
    if ($trace['failed']) {
        $issues[] = count($trace['failed']) . ' failed deliveries: ' . implode(', ', array_map(
            static fn(array $failure): string => 'seq ' . ($failure['originalseq'] ?? '?') . ' ' . $failure['reason']
                . ($failure['originaltype'] !== '' ? ' (' . $failure['originaltype'] . ')' : ''),
            array_slice($trace['failed'], 0, 10))) . (count($trace['failed']) > 10 ? ', …' : '')
            . ' — the original is kept in the browser\'s dead-letter';
    }
    if ($trace['duplicateseqs']) {
        $issues[] = $trace['duplicateseqs'] . ' repeated eventseq';
    }
    if ($trace['duplicateedits']) {
        $issues[] = $trace['duplicateedits'] . ' edits logged twice (same burstId)';
    }
    if ($trace['siblingtraces']) {
        $issues[] = 'question split into ' . ($trace['siblingtraces'] + 1)
            . ' traces (sessionStorage lost mid-attempt); add their active time';
    }
    if ($trace['truncated']) {
        $issues[] = count($trace['truncated']) . ' clipped';
    }
    if ($trace['nomodality']) {
        $issues[] = count($trace['nomodality']) . ' actions without modality';
    }
    if ($trace['started'] === null) {
        $issues[] = 'no task_started';
    }
    if ($trace['finished'] === null) {
        $issues[] = 'not finished';
    }
    printf("%s  quiz %s slot %d  %s  %d events  active %s  wall %s%s\n    %s\n",
        substr($trace['anonattemptid'], 0, 12), $trace['cmid'] ?? '-', $trace['slot'], $trace['studycondition'] ?? '-',
        $trace['events'], $seconds($trace['activems']), $seconds($trace['wallms']),
        $trace['revisits'] ? "  revisits {$trace['revisits']}" : '',
        $issues ? implode('; ', $issues) : 'ok');
}
