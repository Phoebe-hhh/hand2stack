// This file is part of Moodle - http://moodle.org/.
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// @package local_hand2stack
// @copyright 2026 Phoebe Huang
// @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later

/**
 * Entry point: find the STACK answer boxes and attach Hand2STACK to them.
 *
 * @module local_hand2stack/main
 */
define([
    'local_hand2stack/config',
    'local_hand2stack/core/stack_inputs',
    'local_hand2stack/core/research_observer',
    'local_hand2stack/core/api',
    'local_hand2stack/ui/attach_button',
    'local_hand2stack/modes/freetext/working',
    'local_hand2stack/modes/freetext/anchors',
    'local_hand2stack/modes/freetext/locked_answer'
], function(
    Config, StackInputs, ResearchObserver, Api, AttachButton, Working, Anchors, LockedAnswer
) {
    const {pluginUrl, replaceLegacyNodeUrl, defaultConfig, config} = Config;
    const {
        prepareProcessInputs, findAnswerBoxes, findLockedFreeTextBoxes, isFreeTextInput, captureAnswerAnchor,
        findSiblingAnswerBoxes
    } = StackInputs;
    const {startResearch} = ResearchObserver;
    const {fetchMissingAnchors} = Api;
    const {attachButton} = AttachButton;
    const {bindFreeTextProcess} = Working;
    const {setupTargetBox} = Anchors;
    const {showSavedSourceImage} = LockedAnswer;

    const run = async () => {
        prepareProcessInputs();
        const mainContent = document.querySelector('.main-inner');
        if (mainContent && (document.body.id === 'page-mod-quiz-attempt'
                || document.body.id === 'page-question-bank-previewquestion-preview')) {
            mainContent.style.maxWidth = '1200px';
        }
        const lockedBoxes = findLockedFreeTextBoxes();
        lockedBoxes.forEach(showSavedSourceImage);
        const boxes = findAnswerBoxes();
        if (!boxes.length) {
            // A review page, or a question locked after Check, has only locked answers.
            if (!lockedBoxes.length) window.console.warn(config.nofieldfound || 'No visible STACK input found');
            return;
        }
        // The keyboard condition of a study: no Hand2STACK controls, but the
        // process input is still kept in sync and typing is still recorded.
        if (config.inputMode === 'logonly') {
            boxes.forEach(bindFreeTextProcess);
            startResearch(boxes);
            return;
        }
        // With auto-fill on, anchored inputs next to a free-text box are filled
        // from that box's working, not captured alone. While it is paused,
        // every input gets its own buttons.
        boxes.forEach(captureAnswerAnchor);
        boxes.forEach(bindFreeTextProcess);
        const candidates = new Set();
        if (config.autofill) {
            boxes.filter(isFreeTextInput).forEach(source => {
                findSiblingAnswerBoxes(source).forEach(box => candidates.add(box));
            });
        }
        boxes.filter(box => !candidates.has(box)).forEach(attachButton);
        await fetchMissingAnchors(Array.from(candidates));
        candidates.forEach(box => (box.dataset.hand2stackAnchor ? setupTargetBox(box) : attachButton(box)));
        startResearch(boxes);
    };

    const init = suppliedConfig => {
        Object.assign(config, defaultConfig, suppliedConfig || {});
        config.recognizeUrl = replaceLegacyNodeUrl(config.recognizeUrl || config.apiurl, pluginUrl('recognize.php'));
        config.strokesUrl = replaceLegacyNodeUrl(config.strokesUrl, pluginUrl('strokes.php'));
        config.convertUrl = replaceLegacyNodeUrl(config.convertUrl, pluginUrl('convert.php'));
        config.anchorsUrl = config.anchorsUrl || pluginUrl('anchors.php');
        config.eventUrl = config.eventUrl || pluginUrl('event.php');
        config.sessionCreateUrl = replaceLegacyNodeUrl(config.sessionCreateUrl, pluginUrl('session_create.php'));
        config.sessionResultUrl = replaceLegacyNodeUrl(
            config.sessionResultUrl || config.sessionResultBaseUrl,
            pluginUrl('session_result.php')
        );
        config.sesskey = config.sesskey || (window.M && M.cfg && M.cfg.sesskey) || '';
        run();
    };

    return {init};
});
