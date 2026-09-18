<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * lang en local stackinputhelper.php for Hand2STACK.
 *
 * @package    local_stackinputhelper
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

$string['pluginname'] = 'Hand2STACK';

$string['enabled'] = 'Enable Hand2STACK';
$string['enabled_desc'] = 'Enable or disable the Hand2STACK plugin.';

$string['mathpixappid'] = 'Mathpix App ID';
$string['mathpixappid_desc'] = 'The Mathpix application ID used by the Moodle plugin backend.';

$string['mathpixappkey'] = 'Mathpix App Key';
$string['mathpixappkey_desc'] = 'The Mathpix application key. This is stored in Moodle settings and is never sent to the browser.';

$string['maxfilesize'] = 'Maximum image size';
$string['maxfilesize_desc'] = 'Maximum upload image size in MB.';

$string['enablemobile'] = 'Enable mobile upload';
$string['enablemobile_desc'] = 'Allow users to upload mathematical expression images from a mobile device using a QR code.';
$string['mobilebaseurl'] = 'Mobile public base URL';
$string['mobilebaseurl_desc'] = 'Usually leave this empty to use the Moodle site URL automatically, including any subdirectory such as /projects. Set it only when phones must use a different externally reachable Moodle base URL.';

$string['uploadbtn'] = 'Upload math image';
$string['mobileuploadbtn'] = 'Mobile Math Upload';
$string['camerabtn'] = 'Take a photo';
$string['uploading'] = 'Recognizing...';
$string['nofieldfound'] = 'No visible answer input found on this page.';
$string['recognizefailed'] = 'Recognition failed.';
$string['requestfailed'] = 'The request could not be completed. Please try again or contact the administrator.';
$string['taskcleanupexpiredsessions'] = 'Delete expired Hand2STACK sessions';
$string['invalidfiletype'] = 'Invalid file type. Please upload a JPG, PNG, or WebP image.';
$string['filetoolarge'] = 'The uploaded image is too large.';
$string['emptyuploadedfile'] = 'The uploaded image is empty.';
$string['invalidimagecontents'] = 'The uploaded file could not be decoded as a valid image.';
$string['imagedimensionstoolarge'] = 'The uploaded image dimensions are too large.';
$string['imagevalidationunavailable'] = 'Server-side image validation is unavailable. PHP Fileinfo and GD are required.';
$string['unsupportedserverimageformat'] = 'This server cannot decode the uploaded image format. Please upload a JPG or PNG image.';
$string['missingmathpixcredentials'] = 'Mathpix App ID or App Key is not configured.';
$string['invaliduploadedfile'] = 'The uploaded file is invalid.';
$string['curlrequired'] = 'The PHP cURL extension is required.';
$string['mathpixrequestfailed'] = 'The Mathpix request failed.';
$string['mathpixinvalidresponse'] = 'Mathpix returned an invalid response.';
$string['pluginnotenabled'] = 'Hand2STACK is disabled.';
$string['mobilenotenabled'] = 'Mobile upload is disabled.';
$string['sessionexpired'] = 'This mobile upload session has expired.';
$string['mobileuploadinstructions'] = 'Take a photo of a mathematical expression. The result will be sent back to the Moodle page that created this session.';
$string['mobileuploadcomplete'] = 'Upload complete. You can return to the original Moodle page.';
$string['nofilechosen'] = 'Please choose an image first.';
$string['takephoto'] = 'Take photo';
$string['usethisphoto'] = 'Use this photo';
$string['recognizedresults'] = 'Recognized results';
$string['selectanswer'] = 'Select the answer to insert into STACK:';
$string['selectpart'] = 'Click a symbol, or drag across the formula to select a range.';
$string['recommendedanswer'] = 'Recommended answer';
$string['stackpreview'] = 'STACK input preview:';
$string['insertanswer'] = 'Insert answer';
$string['rawlatex'] = 'LaTeX';
$string['recognizedformat'] = 'Recognized format:';
$string['asciimath'] = 'ASCII';
$string['asciiunavailable'] = 'ASCII was not returned for this image.';
$string['lineprefix'] = 'Line';
$string['creatingmobilesession'] = 'Creating mobile upload session...';
$string['waitingmobileupload'] = 'Waiting for mobile upload...';
$string['mobileuploadreceived'] = 'Successfully received mobile result. You can upload another photo with the same QR code.';
$string['mobileuploadexpired'] = 'This mobile upload session has expired.';
$string['mobileuploadtimeout'] = 'Timeout waiting for result. Please create a new session.';
$string['mobilesessionfailed'] = 'Failed to create mobile session:';
$string['partialselectionfailed'] = 'Could not convert the selected text.';
$string['handwritebtn'] = 'Handwrite math';
$string['handwriteinstructions'] = 'Write with Apple Pencil, your finger, or a mouse. To scroll, drag outside the writing area.';
$string['resizehandwriting'] = 'Drag to resize the writing area';
$string['draw'] = 'Pen';
$string['eraser'] = 'Eraser';
$string['undo'] = 'Undo';
$string['clear'] = 'Clear';
$string['recognizestrokes'] = 'Recognize handwriting';
$string['nostrokes'] = 'Write an expression first.';
$string['invalidstrokes'] = 'The handwriting stroke data is invalid.';
$string['emptylatex'] = 'The selected expression is empty.';
$string['privacy:metadata:mathpix'] = 'Uploaded images and handwriting strokes are sent to Mathpix for mathematical expression recognition.';
$string['privacy:metadata:mathpix:image'] = 'The mathematical expression image uploaded by the user.';
$string['privacy:metadata:mathpix:strokes'] = 'The handwriting coordinates captured from the user\'s pen or mouse.';
$string['privacy:metadata:session'] = 'Temporary mobile upload sessions and recognition results.';
$string['privacy:metadata:session:userid'] = 'The user who created the mobile upload session.';
$string['privacy:metadata:session:rawlatex'] = 'The raw LaTeX returned by Mathpix.';
$string['privacy:metadata:session:rawascii'] = 'The AsciiMath returned by Mathpix.';
$string['privacy:metadata:session:stack'] = 'The STACK expression generated from the raw LaTeX.';
$string['privacy:metadata:session:resulttext'] = 'The recognized result returned to the Moodle page.';
$string['privacy:metadata:session:timecreated'] = 'The time when the mobile upload session was created.';
$string['privacy:metadata:session:timemodified'] = 'The time when the mobile upload session was last modified.';
$string['privacy:metadata:session:expiresat'] = 'The time when the mobile upload session expires.';
