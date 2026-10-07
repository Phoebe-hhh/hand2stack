<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * classes local research logger.php for Hand2STACK.
 *
 * Stores pseudonymised interaction events for research studies. The table
 * never holds a Moodle user id: learners are identified by an HMAC of the
 * study id and user id, keyed by a site secret that never leaves the server.
 * See docs/research/event-logging-spec-v1.md for the event dictionary.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_hand2stack\local;

defined('MOODLE_INTERNAL') || die();

final class research_logger {
    /** Version of the event dictionary this server understands. */
    public const SCHEMA_VERSION = 1;

    /** Capability that marks a consenting study participant. */
    public const PARTICIPANT_CAPABILITY = 'local/hand2stack:researchparticipant';

    public const EVENT_TYPES = [
        'interaction_started',
        'recognition_started',
        'recognition_completed',
        'candidate_selected',
        'edit_committed',
        'validation_completed',
        'answer_inserted',
        'submit_triggered',
        'feedback_observed',
        'revision_started',
    ];

    public const MODALITIES = ['keyboard', 'image', 'camera', 'mobile', 'handwrite'];

    public const MAX_BATCH = 100;

    public const MAX_PAYLOAD_BYTES = 65536;

    private const TABLE = 'local_hand2stack_event';

    private const UUID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/';

    /** Create the pseudonymisation secret once; it is never shown in the admin UI. */
    public static function ensure_secret(): void {
        if ((string)get_config('local_hand2stack', 'researchsecret') === '') {
            set_config('researchsecret', random_string(64), 'local_hand2stack');
        }
    }

    public static function study_id(): string {
        return trim((string)get_config('local_hand2stack', 'researchstudyid'));
    }

    /** Site-wide switch: logging is on and a study is named. */
    public static function is_enabled(): bool {
        return (bool)get_config('local_hand2stack', 'enabled')
            && (bool)get_config('local_hand2stack', 'researchlogging')
            && self::study_id() !== '';
    }

    /**
     * Whether a user is a consenting participant in this context. Site admins
     * are deliberately not included through "do anything".
     */
    public static function is_participant(\context $context, int $userid): bool {
        return has_capability(self::PARTICIPANT_CAPABILITY, $context, $userid, false);
    }

    public static function enabled_for_context(\context $context, int $userid): bool {
        return self::is_enabled() && $userid > 0 && !isguestuser($userid)
            && self::is_participant($context, $userid);
    }

    public static function anon_user_id(int $userid, string $studyid): string {
        self::ensure_secret();
        $secret = (string)get_config('local_hand2stack', 'researchsecret');
        return hash_hmac('sha256', $studyid . ':' . $userid, $secret);
    }

    /**
     * Every pseudonym this user has in the event table, one per study.
     *
     * @return string[] studyid => anonuserid
     */
    public static function anon_ids_for_user(int $userid): array {
        global $DB;

        $ids = [];
        foreach ($DB->get_fieldset_sql('SELECT DISTINCT studyid FROM {' . self::TABLE . '}') as $studyid) {
            $ids[$studyid] = self::anon_user_id($userid, $studyid);
        }
        return $ids;
    }

    /**
     * SQL fragment selecting this user's events, or null when there are none.
     *
     * @return array|null [$select, $params]
     */
    public static function user_event_select(int $userid): ?array {
        $clauses = [];
        $params = [];
        $index = 0;
        foreach (self::anon_ids_for_user($userid) as $studyid => $anonid) {
            $clauses[] = "(studyid = :study{$index} AND anonuserid = :anon{$index})";
            $params["study{$index}"] = $studyid;
            $params["anon{$index}"] = $anonid;
            $index++;
        }
        return $clauses ? [implode(' OR ', $clauses), $params] : null;
    }

    public static function plugin_version(): string {
        static $version = null;
        if ($version === null) {
            $info = \core_plugin_manager::instance()->get_plugin_info('local_hand2stack');
            $version = $info ? trim(($info->release ?? '') . ' (' . ($info->versiondisk ?? '') . ')') : 'unknown';
        }
        return $version;
    }

    /**
     * The context of a usage that belongs to this user: their own quiz attempt
     * or their own question preview. Reviewers are never recorded.
     */
    public static function own_usage_context(int $usageid, int $userid): ?\context {
        global $DB;

        $usage = $DB->get_record('question_usages', ['id' => $usageid], 'id, contextid, component');
        if (!$usage) {
            return null;
        }
        if ($usage->component === 'mod_quiz') {
            $owner = $DB->get_field('quiz_attempts', 'userid', ['uniqueid' => $usageid]);
            if ((int)$owner !== $userid) {
                return null;
            }
        } else if ($usage->component !== 'core_question_preview'
                || (int)$usage->contextid !== (int)\context_user::instance($userid)->id) {
            return null;
        }
        return \context::instance_by_id($usage->contextid, IGNORE_MISSING) ?: null;
    }

    /** Question identity for a slot, resolved on the server rather than trusted from the page. */
    public static function resolve_question(int $usageid, int $slot): ?\stdClass {
        global $DB;

        $sql = 'SELECT qa.questionid, qv.questionbankentryid, qv.version
                  FROM {question_attempts} qa
             LEFT JOIN {question_versions} qv ON qv.questionid = qa.questionid
                 WHERE qa.questionusageid = :usageid AND qa.slot = :slot';
        return $DB->get_record_sql($sql, ['usageid' => $usageid, 'slot' => $slot]) ?: null;
    }

    /**
     * Validate and store a batch of client events for one user.
     *
     * @param array $events Decoded client events.
     * @param int $userid The Moodle user who sent them.
     * @return array Counts: accepted, duplicates, rejected.
     */
    public static function record_batch(array $events, int $userid): array {
        global $DB;

        $counts = ['accepted' => 0, 'duplicates' => 0, 'rejected' => 0];
        if (count($events) > self::MAX_BATCH) {
            $counts['rejected'] += count($events) - self::MAX_BATCH;
            $events = array_slice($events, 0, self::MAX_BATCH);
        }

        $studyid = self::study_id();
        $anonuserid = self::anon_user_id($userid, $studyid);
        $pluginversion = self::plugin_version();
        $servertime = (int)round(microtime(true) * 1000);
        // A batch nearly always belongs to one or two questions.
        $usages = [];
        $questions = [];

        foreach ($events as $event) {
            $record = is_array($event) ? self::normalise_event($event) : null;
            if (!$record) {
                $counts['rejected']++;
                continue;
            }

            if (!array_key_exists($record->usageid, $usages)) {
                $context = self::own_usage_context($record->usageid, $userid);
                $usages[$record->usageid] = $context && self::is_participant($context, $userid);
            }
            if (!$usages[$record->usageid]) {
                $counts['rejected']++;
                continue;
            }

            $questionkey = $record->usageid . ':' . $record->slot;
            if (!array_key_exists($questionkey, $questions)) {
                $questions[$questionkey] = self::resolve_question($record->usageid, $record->slot);
            }
            $question = $questions[$questionkey];
            if (!$question) {
                $counts['rejected']++;
                continue;
            }

            if ($DB->record_exists(self::TABLE, ['eventid' => $record->eventid])) {
                $counts['duplicates']++;
                continue;
            }

            $record->studyid = $studyid;
            $record->anonuserid = $anonuserid;
            $record->questionid = (int)$question->questionid;
            $record->qbankentryid = $question->questionbankentryid !== null ? (int)$question->questionbankentryid : null;
            $record->questionversion = $question->version !== null ? (int)$question->version : null;
            $record->pluginversion = $pluginversion;
            $record->servertime = $servertime;

            try {
                $DB->insert_record(self::TABLE, $record);
                $counts['accepted']++;
            } catch (\dml_write_exception $error) {
                // A beacon and a fetch can race with the same event id.
                if ($DB->record_exists(self::TABLE, ['eventid' => $record->eventid])) {
                    $counts['duplicates']++;
                } else {
                    throw $error;
                }
            }
        }

        return $counts;
    }

    /**
     * Check the client envelope and map it onto table fields. Server-owned
     * fields are filled in by record_batch().
     */
    public static function normalise_event(array $event): ?\stdClass {
        $uuid = static function($value): ?string {
            $value = strtolower(trim((string)$value));
            return preg_match(self::UUID_PATTERN, $value) ? $value : null;
        };
        $int = static function($value, int $min = 0): ?int {
            if (is_int($value) || (is_float($value) && floor($value) === $value)
                    || (is_string($value) && preg_match('/^\d+$/', $value))) {
                $value = (int)$value;
                return $value >= $min ? $value : null;
            }
            return null;
        };

        $record = new \stdClass();
        $record->eventid = $uuid($event['eventid'] ?? '');
        $record->traceid = $uuid($event['traceid'] ?? '');
        $record->pageid = $uuid($event['pageid'] ?? '');
        $record->eventseq = $int($event['eventseq'] ?? null);
        $record->eventtype = (string)($event['type'] ?? '');
        $record->usageid = $int($event['usage'] ?? null, 1);
        $record->slot = $int($event['slot'] ?? null, 1);
        $record->clienttime = $int($event['clienttime'] ?? null, 1);
        $record->schemaversion = $int($event['schema'] ?? null, 1);

        if ($record->eventid === null || $record->traceid === null || $record->pageid === null
                || $record->eventseq === null || $record->usageid === null || $record->slot === null
                || $record->clienttime === null || $record->schemaversion === null
                || $record->schemaversion > self::SCHEMA_VERSION
                || !in_array($record->eventtype, self::EVENT_TYPES, true)) {
            return null;
        }

        $record->elapsedms = isset($event['elapsedms']) ? $int($event['elapsedms']) : null;

        $input = isset($event['input']) ? clean_param((string)$event['input'], PARAM_ALPHANUMEXT) : '';
        $record->inputname = $input !== '' ? \core_text::substr($input, 0, 100) : null;

        $modality = (string)($event['modality'] ?? '');
        $record->modality = in_array($modality, self::MODALITIES, true) ? $modality : null;

        $payload = $event['payload'] ?? null;
        if ($payload === null) {
            $record->payload = null;
        } else if (is_array($payload)) {
            // A decoded "{}" is an empty PHP array; keep it an object.
            $record->payload = $payload === []
                ? '{}'
                : json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($record->payload === false || strlen($record->payload) > self::MAX_PAYLOAD_BYTES) {
                return null;
            }
        } else {
            return null;
        }

        return $record;
    }
}
