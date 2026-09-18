<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * session create.php for Hand2STACK.
 *
 * @package    local_stackinputhelper
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define('AJAX_SCRIPT', true);

require_once(__DIR__ . '/../../config.php');

require_login();
require_sesskey();
require_capability('local/stackinputhelper:use', context_system::instance());

header('Content-Type: application/json; charset=utf-8');

try {
    global $DB, $USER;

    if (!get_config('local_stackinputhelper', 'enabled')) {
        throw new moodle_exception('pluginnotenabled', 'local_stackinputhelper');
    }

    if (!get_config('local_stackinputhelper', 'enablemobile')) {
        throw new moodle_exception('mobilenotenabled', 'local_stackinputhelper');
    }

    $now = time();
    $DB->delete_records_select('local_stackinputhelper_sess', 'expiresat < ?', [$now]);

    $sessionid = bin2hex(random_bytes(16));
    $record = (object)[
        'sessionid' => $sessionid,
        'userid' => $USER->id,
        'status' => 'waiting',
        'rawlatex' => '',
        'rawascii' => '',
        'stack' => '',
        'resulttext' => '',
        'timecreated' => $now,
        'timemodified' => $now,
        'expiresat' => $now + 10 * 60,
    ];

    $DB->insert_record('local_stackinputhelper_sess', $record);

    $mobileurl = new moodle_url('/local/stackinputhelper/mobile.php', ['session' => $sessionid]);
    $mobileurlout = $mobileurl->out(false);

    $mobilebaseurl = trim((string)get_config('local_stackinputhelper', 'mobilebaseurl'));
    if ($mobilebaseurl !== '') {
        $mobileurlout = rtrim($mobilebaseurl, '/') . '/local/stackinputhelper/mobile.php?session=' . rawurlencode($sessionid);
    }

    $warning = '';
    $mobilehost = strtolower((string)parse_url($mobileurlout, PHP_URL_HOST));
    if ($mobilehost === 'localhost' || substr($mobilehost, -10) === '.localhost'
            || $mobilehost === '127.0.0.1' || $mobilehost === '::1') {
        $warning = 'This QR code uses localhost, which only works on this computer. '
            . 'For phone upload, open Moodle using a network-accessible site URL or set Mobile public base URL in the plugin settings.';
    }

    // Generate the QR code inside Moodle so the private mobile URL and session
    // identifier are never sent to a third-party QR service.
    $qrcode = new core_qrcode($mobileurlout);
    $qrsvg = $qrcode->getBarcodeSVGcode(4, 4, '#000000');

    echo json_encode([
        'success' => true,
        'session_id' => $sessionid,
        'mobile_url' => $mobileurlout,
        'mobile_url_warning' => $warning,
        'qr_svg' => $qrsvg,
        'expires_at' => $record->expiresat,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    \local_stackinputhelper\local\api_response::send_error($error);
}
