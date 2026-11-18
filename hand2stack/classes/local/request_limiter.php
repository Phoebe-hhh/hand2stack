<?php
// This file is part of Moodle - http://moodle.org/.
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Per-user rate limiting for recognition requests.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_hand2stack\local;

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

        $configured = (int)get_config('local_hand2stack', 'ratelimit');
        if ($configured > 0) {
            $limit = $configured;
        }
        $cache = \cache::make('local_hand2stack', 'ratelimit');
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
            throw new \moodle_exception('ratelimitexceeded', 'local_hand2stack');
        }
        $attempts[] = $now;
        $cache->set($key, $attempts);
    }
}
