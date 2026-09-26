<?php
// This file is part of Moodle - http://moodle.org/.

namespace local_stackinputhelper\local;

defined('MOODLE_INTERNAL') || die();

/** Per-user protection for paid recognition requests. */
final class request_limiter {
    /**
     * Enforce a sliding request window using Moodle's application cache.
     *
     * @param string $operation Cache namespace within the component cache.
     * @param int $limit Maximum requests in the window.
     * @param int $windowseconds Window duration.
     */
    public static function enforce(string $operation = 'recognition', int $limit = 20, int $windowseconds = 60): void {
        global $USER;

        $configured = (int)get_config('local_stackinputhelper', 'ratelimit');
        if ($configured > 0) {
            $limit = $configured;
        }
        $cache = \cache::make('local_stackinputhelper', 'ratelimit');
        $key = preg_replace('/[^a-z0-9_-]/i', '_', $operation) . '_' . (int)$USER->id;
        $now = time();
        $attempts = $cache->get($key);
        if (!is_array($attempts)) {
            $attempts = [];
        }
        $attempts = array_values(array_filter($attempts, static function($timestamp) use ($now, $windowseconds) {
            return is_int($timestamp) && $timestamp > $now - $windowseconds;
        }));
        if (count($attempts) >= $limit) {
            throw new \moodle_exception('ratelimitexceeded', 'local_stackinputhelper');
        }
        $attempts[] = $now;
        $cache->set($key, $attempts);
    }
}
