<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * mobile.php for Hand2STACK.
 *
 * @package    local_hand2stack
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
require_once(__DIR__ . '/../../config.php');

$sessionid = required_param('session', PARAM_ALPHANUMEXT);

require_login();
require_capability('local/hand2stack:use', context_system::instance());

global $DB, $PAGE, $OUTPUT, $USER;

if (!get_config('local_hand2stack', 'enabled')) {
    throw new moodle_exception('pluginnotenabled', 'local_hand2stack');
}
if (!get_config('local_hand2stack', 'enablemobile')) {
    throw new moodle_exception('mobilenotenabled', 'local_hand2stack');
}

$record = $DB->get_record('local_hand2stack_sess', ['sessionid' => $sessionid], '*', MUST_EXIST);
if ((int)$record->userid !== (int)$USER->id) {
    throw new moodle_exception('nopermissions', 'error', '', get_string('view'));
}
if ((int)$record->expiresat < time()) {
    throw new moodle_exception('sessionexpired', 'local_hand2stack');
}

$PAGE->set_url(new moodle_url('/local/hand2stack/mobile.php', ['session' => $sessionid]));
$PAGE->set_context(context_system::instance());
$PAGE->set_title(get_string('mobileuploadbtn', 'local_hand2stack'));
$PAGE->set_heading(get_string('mobileuploadbtn', 'local_hand2stack'));

echo $OUTPUT->header();
?>
<div class="local-hand2stack-mobile">
    <p><?php echo s(get_string('mobileuploadinstructions', 'local_hand2stack')); ?></p>
    <input id="local-hand2stack-mobile-file" type="file" accept="image/*" capture="environment" style="display: none;">
    <button id="local-hand2stack-mobile-camera" type="button" class="btn btn-secondary">
        <?php echo s(get_string('takephoto', 'local_hand2stack')); ?>
    </button>
    <span id="local-hand2stack-mobile-filename" style="display: inline-block; margin: 0 0.75rem;"></span>
    <button id="local-hand2stack-mobile-submit" type="button" class="btn btn-primary" disabled>
        <?php echo s(get_string('usethisphoto', 'local_hand2stack')); ?>
    </button>
    <div id="local-hand2stack-mobile-status" style="margin-top: 1rem;"></div>
    <pre id="local-hand2stack-mobile-result" style="margin-top: 1rem; display: none;"></pre>
</div>
<script>
(function() {
    const fileInput = document.getElementById('local-hand2stack-mobile-file');
    const cameraBtn = document.getElementById('local-hand2stack-mobile-camera');
    const filename = document.getElementById('local-hand2stack-mobile-filename');
    const submitBtn = document.getElementById('local-hand2stack-mobile-submit');
    const status = document.getElementById('local-hand2stack-mobile-status');
    const result = document.getElementById('local-hand2stack-mobile-result');
    const uploadUrl = <?php echo json_encode((new moodle_url('/local/hand2stack/mobile_upload.php'))->out(false)); ?>;
    const sessionId = <?php echo json_encode($sessionid); ?>;
    const sesskey = <?php echo json_encode(sesskey()); ?>;

    cameraBtn.addEventListener('click', function() {
        fileInput.click();
    });

    fileInput.addEventListener('change', function() {
        const file = fileInput.files && fileInput.files[0];
        filename.textContent = file ? file.name : '';
        submitBtn.disabled = !file;
        status.textContent = '';
        result.style.display = 'none';
    });

    submitBtn.addEventListener('click', async function() {
        const file = fileInput.files && fileInput.files[0];
        if (!file) {
            status.textContent = <?php echo json_encode(get_string('nofilechosen', 'local_hand2stack')); ?>;
            return;
        }

        const oldText = submitBtn.textContent;
        cameraBtn.disabled = true;
        submitBtn.disabled = true;
        submitBtn.textContent = <?php echo json_encode(get_string('uploading', 'local_hand2stack')); ?>;
        status.textContent = <?php echo json_encode(get_string('uploading', 'local_hand2stack')); ?>;
        result.style.display = 'none';

        try {
            const formData = new FormData();
            formData.append('image', file);
            formData.append('session', sessionId);
            formData.append('sesskey', sesskey);

            const response = await fetch(uploadUrl, {
                method: 'POST',
                body: formData,
                credentials: 'same-origin'
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || ('HTTP ' + response.status));
            }

            status.textContent = <?php echo json_encode(get_string('mobileuploadcomplete', 'local_hand2stack')); ?>;
            result.style.display = 'block';
            result.textContent = data.stack || '';
        } catch (error) {
            status.textContent = <?php echo json_encode(get_string('recognizefailed', 'local_hand2stack')); ?> + ' ' + error.message;
        } finally {
            cameraBtn.disabled = false;
            submitBtn.disabled = false;
            submitBtn.textContent = oldText;
        }
    });
})();
</script>
<?php
echo $OUTPUT->footer();
