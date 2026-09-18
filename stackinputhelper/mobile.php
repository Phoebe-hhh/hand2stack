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
 * @package    local_stackinputhelper
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
require_once(__DIR__ . '/../../config.php');

$sessionid = required_param('session', PARAM_ALPHANUMEXT);

require_login();
require_capability('local/stackinputhelper:use', context_system::instance());

global $DB, $PAGE, $OUTPUT, $USER;

$record = $DB->get_record('local_stackinputhelper_sess', ['sessionid' => $sessionid], '*', MUST_EXIST);
if ((int)$record->userid !== (int)$USER->id) {
    throw new moodle_exception('nopermissions', 'error', '', get_string('view'));
}

$PAGE->set_url(new moodle_url('/local/stackinputhelper/mobile.php', ['session' => $sessionid]));
$PAGE->set_context(context_system::instance());
$PAGE->set_title(get_string('mobileuploadbtn', 'local_stackinputhelper'));
$PAGE->set_heading(get_string('mobileuploadbtn', 'local_stackinputhelper'));

echo $OUTPUT->header();
?>
<div class="local-stackinputhelper-mobile">
    <p><?php echo s(get_string('mobileuploadinstructions', 'local_stackinputhelper')); ?></p>
    <input id="local-stackinputhelper-mobile-file" type="file" accept="image/*" capture="environment" style="display: none;">
    <button id="local-stackinputhelper-mobile-camera" type="button" class="btn btn-secondary">
        <?php echo s(get_string('takephoto', 'local_stackinputhelper')); ?>
    </button>
    <span id="local-stackinputhelper-mobile-filename" style="display: inline-block; margin: 0 0.75rem;"></span>
    <button id="local-stackinputhelper-mobile-submit" type="button" class="btn btn-primary" disabled>
        <?php echo s(get_string('usethisphoto', 'local_stackinputhelper')); ?>
    </button>
    <div id="local-stackinputhelper-mobile-status" style="margin-top: 1rem;"></div>
    <pre id="local-stackinputhelper-mobile-result" style="margin-top: 1rem; display: none;"></pre>
</div>
<script>
(function() {
    const fileInput = document.getElementById('local-stackinputhelper-mobile-file');
    const cameraBtn = document.getElementById('local-stackinputhelper-mobile-camera');
    const filename = document.getElementById('local-stackinputhelper-mobile-filename');
    const submitBtn = document.getElementById('local-stackinputhelper-mobile-submit');
    const status = document.getElementById('local-stackinputhelper-mobile-status');
    const result = document.getElementById('local-stackinputhelper-mobile-result');
    const uploadUrl = <?php echo json_encode((new moodle_url('/local/stackinputhelper/mobile_upload.php'))->out(false)); ?>;
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
            status.textContent = <?php echo json_encode(get_string('nofilechosen', 'local_stackinputhelper')); ?>;
            return;
        }

        const oldText = submitBtn.textContent;
        cameraBtn.disabled = true;
        submitBtn.disabled = true;
        submitBtn.textContent = <?php echo json_encode(get_string('uploading', 'local_stackinputhelper')); ?>;
        status.textContent = <?php echo json_encode(get_string('uploading', 'local_stackinputhelper')); ?>;
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

            status.textContent = <?php echo json_encode(get_string('mobileuploadcomplete', 'local_stackinputhelper')); ?>;
            result.style.display = 'block';
            result.textContent = data.stack || '';
        } catch (error) {
            status.textContent = <?php echo json_encode(get_string('recognizefailed', 'local_stackinputhelper')); ?> + ' ' + error.message;
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
