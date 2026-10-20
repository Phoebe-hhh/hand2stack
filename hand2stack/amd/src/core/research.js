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
 * The research logger of this page.
 *
 * @module local_hand2stack/core/research
 */
define([
    'local_hand2stack/config',
    'local_hand2stack/core/stack_inputs',
    'local_hand2stack/core/research_logger',
    'local_hand2stack/core/research_outbox'
], function(
    Config, StackInputs, ResearchLogger, ResearchOutbox
) {
    const {config, isIPadWebKit, isMobileOrTablet} = Config;
    const {findProcessInput} = StackInputs;
    const {createResearchLogger} = ResearchLogger;
    const {createOutbox} = ResearchOutbox;

    const logRecognitionFailure = (answerBox, recognition, error) => {
        research.log(answerBox, 'recognition_completed', {
            requestId: recognition.requestId,
            source: recognition.source,
            ok: false,
            errorCode: (error && error.code) || null,
            message: research.clip(error && error.message, 300),
            latencyMs: recognition.latencyMs
        }, {modality: recognition.source});
    };

    const randomUuid = () => {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
    };

    // Made on first use: main.js merges the server's config, with the
    // outbox scope, only after this module has loaded.
    const outbox = () => {
        const scope = config.research && config.research.enabled ? String(config.research.outboxScope || '') : '';
        if (!scope) return null;
        let localStorage = null;
        try {
            localStorage = window.localStorage;
        } catch (error) {
            // Blocked storage: no spill on unload.
        }
        return createOutbox(scope, window.indexedDB || null, localStorage);
    };

    const research = createResearchLogger({
        pageId: randomUuid(),
        outbox,
        uuid: randomUuid,
        now: () => Date.now(),
        getConfig: () => config,
        storage: {
            getItem: key => window.sessionStorage.getItem(key),
            setItem: (key, value) => window.sessionStorage.setItem(key, value),
            removeItem: key => window.sessionStorage.removeItem(key)
        },
        setTimeout: (fn, ms) => window.setTimeout(fn, ms),
        clearTimeout: timer => window.clearTimeout(timer),
        warn: error => window.console.warn('[hand2stack] research logging failed:', error),
        describeBox: box => ({
            inputType: String((box && box.dataset.stackInputType) || ''),
            hasSavedAnswer: Boolean(String((box && box._hand2stackInitialValue) || '').trim()),
            hasProcessInput: Boolean(findProcessInput(box)),
            device: {
                mobileOrTablet: isMobileOrTablet,
                ipadWebKit: isIPadWebKit,
                viewportWidth: window.innerWidth
            }
        }),
        send: (batch, unloading) => {
            const formData = new FormData();
            formData.append('sesskey', config.sesskey);
            formData.append('events', JSON.stringify(batch));
            // A queued beacon is not a stored event: the logger keeps it
            // until a later fetch is answered with its id.
            if (unloading && navigator.sendBeacon && navigator.sendBeacon(config.eventUrl, formData)) {
                return {beacon: true};
            }
            return fetch(config.eventUrl, {
                method: 'POST',
                body: formData,
                credentials: 'same-origin',
                keepalive: unloading
            }).then(response => {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            });
        }
    });

    return {logRecognitionFailure, research};
});
