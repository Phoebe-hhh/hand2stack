<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * lang en local hand2stack.php for Hand2STACK.
 *
 * @package    local_hand2stack
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
$string['ratelimit'] = 'Recognition requests per minute';
$string['ratelimit_desc'] = 'Maximum paid image or handwriting recognition requests per user per minute. Use 0 to keep the safe default of 20.';

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
$string['ratelimitexceeded'] = 'Too many recognition requests. Please wait a minute and try again.';
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
$string['selectanswer'] = 'Select or edit a result before inserting it into STACK.';
$string['recognizedworking'] = 'Recognized mathematical working. Review or edit it before inserting:';
$string['selectpart'] = 'Click a symbol, or drag across the formula to select a range.';
$string['recommendedanswer'] = 'Suggested';
$string['approximation'] = 'Approximation';
$string['detectedcandidates'] = 'Detected mathematical candidates (not automatically treated as answers)';
$string['edited'] = 'Edited';
$string['restoreocr'] = 'Restore OCR result';
$string['stackpreview'] = 'STACK input preview:';
$string['convertedstack'] = 'Converted for STACK:';
$string['freetextpreview'] = 'Free-text working preview:';
$string['originalwork'] = 'Original work';
$string['confirmrecognition'] = 'Review recognized content';
$string['freetextworkflow'] = 'Photo / iPad handwriting → Free text';
$string['recognizedfullanswer'] = 'Complete recognized answer · editable';
$string['freetexthelp'] = 'Edit text directly; formulas use ASCII math markers. Paragraphs and line breaks are preserved.';
$string['editedhighlighthelp'] = 'Blue text shows your changes.';
$string['directsubmithelp'] = 'Edits here are used directly as your Free-text answer.';
$string['appendhint'] = 'Keep the existing answer and add this section.';
$string['appendfreetext'] = 'Append to Free text';
$string['insertfreetext'] = 'Insert at cursor';
$string['zoomin'] = 'Zoom in';
$string['zoomout'] = 'Zoom out';
$string['resetzoom'] = 'Reset zoom';
$string['dragimage'] = 'Drag to inspect the enlarged image';
$string['insertanswer'] = 'Insert into answer';
$string['rawlatex'] = 'LaTeX';
$string['recognizedformat'] = 'Editable';
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
$string['extractedfromworking'] = 'Extracted from your working';
$string['anchornotfound'] = 'Could not find {$a} in the recognized working. Please enter it manually.';
$string['filledfromlastline'] = 'No line starting with {$a} was found, so this was filled from the last line of your working. Please check it.';
$string['anchorconvertfailed'] = 'Found {$a} in the recognized working, but could not convert it. Please enter it manually.';
$string['pensize'] = 'Pen size';
$string['penthin'] = 'Thin pen';
$string['penmedium'] = 'Medium pen';
$string['penthick'] = 'Thick pen';
$string['undo'] = 'Undo';
$string['clear'] = 'Clear';
$string['recognizestrokes'] = 'Recognize handwriting';
$string['nostrokes'] = 'Write an expression first.';
$string['invalidstrokes'] = 'The handwriting stroke data is invalid.';
$string['emptylatex'] = 'The selected expression is empty.';
$string['invalidstackexpression'] = 'The edited expression could not be converted into valid STACK input. Please check the expression and try again.';
$string['stackvalidationunavailable'] = 'STACK input validation is unavailable on this server.';
$string['conversioninprogress'] = 'Converting and validating...';
$string['pollingfailed'] = 'The mobile connection was interrupted. Retrying...';
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
$string['invalidevents'] = 'The research event batch is invalid.';
$string['hand2stack:researchparticipant'] = 'Take part in Hand2STACK research logging';
$string['researchheading'] = 'Research event logging';
$string['researchheading_desc'] = 'Records pseudonymised interaction events (recognition, edits, validation, insertion, submission and feedback) for consenting participants. Events are recorded only for users who hold the "Take part in Hand2STACK research logging" capability in the quiz context; site administrators are not included automatically. Images and handwriting coordinates are never stored.';
$string['researchlogging'] = 'Enable research event logging';
$string['researchlogging_desc'] = 'Off by default. Turn on only on sites or periods covered by an approved study protocol.';
$string['researchstudyid'] = 'Study ID';
$string['researchstudyid_desc'] = 'Identifier stored with every event, for example pilot2026a. Logging stays off while this is empty. Pseudonymous participant IDs are different for each study ID.';
$string['privacy:metadata:event'] = 'Research interaction events recorded for consenting study participants.';
$string['privacy:metadata:event:anonuserid'] = 'A pseudonymous participant ID derived from the user ID and the study ID with a site secret.';
$string['privacy:metadata:event:usageid'] = 'The question attempt the event belongs to.';
$string['privacy:metadata:event:eventtype'] = 'The kind of interaction, such as recognition, edit, validation or submission.';
$string['privacy:metadata:event:clienttime'] = 'The time the interaction happened in the browser.';
$string['privacy:metadata:event:payload'] = 'Details of the interaction, such as recognized text, the expression before and after an edit, validation results and observed feedback.';
