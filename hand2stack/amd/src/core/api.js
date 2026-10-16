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
 * Requests to the Hand2STACK server endpoints.
 *
 * @module local_hand2stack/core/api
 */
define(['local_hand2stack/config', 'local_hand2stack/core/stack_inputs'], function(Config, StackInputs) {
    const {config} = Config;
    const {parseStackInputName} = StackInputs;

    // STACK drops the Syntax hint from the page once an empty answer has been
    // submitted, so fill in any missing anchors from the question definition.
    const fetchMissingAnchors = async boxes => {
        const missing = boxes.filter(box => !box.dataset.hand2stackAnchor && parseStackInputName(box.name));
        if (!missing.length || !config.anchorsUrl) return;
        const questions = new Map();
        missing.forEach(box => {
            const parsed = parseStackInputName(box.name);
            const key = parsed.usage + ':' + parsed.slot;
            if (!questions.has(key)) questions.set(key, parsed);
        });
        await Promise.all(Array.from(questions.values()).map(async question => {
            try {
                const formData = new FormData();
                formData.append('usage', question.usage);
                formData.append('slot', question.slot);
                formData.append('sesskey', config.sesskey);
                const response = await fetch(config.anchorsUrl, {
                    method: 'POST',
                    body: formData,
                    credentials: 'same-origin'
                });
                const data = await parseJsonResponse(response);
                if (!response.ok || !data.success) {
                    throw requestError(data, response);
                }
                missing.forEach(box => {
                    const parsed = parseStackInputName(box.name);
                    if (parsed.usage !== question.usage || parsed.slot !== question.slot) return;
                    const anchor = data.anchors && data.anchors[parsed.input];
                    if (anchor && !box.dataset.hand2stackAnchor) box.dataset.hand2stackAnchor = anchor;
                });
            } catch (error) {
                window.console.warn('[hand2stack] could not load answer anchors:', error);
            }
        }));
    };

    const postImage = async (url, file, extra = {}) => {
        if (!url) {
            throw new Error('Recognition endpoint is not configured.');
        }

        const formData = new FormData();
        formData.append('image', file);
        formData.append('sesskey', config.sesskey);
        Object.keys(extra).forEach(key => formData.append(key, extra[key]));

        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });
        const data = await parseJsonResponse(response);

        if (!response.ok || !data.success) {
            throw requestError(data, response);
        }

        return data;
    };

    const postLatex = async (latex) => {
        if (!config.convertUrl) {
            throw new Error('Conversion endpoint is not configured.');
        }

        const formData = new FormData();
        formData.append('latex', latex);
        formData.append('sesskey', config.sesskey);

        const response = await fetch(config.convertUrl, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });
        const data = await parseJsonResponse(response);

        if (!response.ok || !data.success) {
            throw requestError(data, response);
        }

        return data.stack || '';
    };

    const postAscii = async (ascii) => {
        if (!config.convertUrl) {
            throw new Error('Conversion endpoint is not configured.');
        }
        const formData = new FormData();
        formData.append('ascii', ascii);
        formData.append('sesskey', config.sesskey);
        const response = await fetch(config.convertUrl, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });
        const data = await parseJsonResponse(response);
        if (!response.ok || !data.success || !data.valid) {
            throw requestError(data, response);
        }
        return data.stack || '';
    };

    const postStrokes = async (strokes) => {
        const formData = new FormData();
        formData.append('strokes', JSON.stringify(strokes));
        formData.append('sesskey', config.sesskey);
        const response = await fetch(config.strokesUrl, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });
        const data = await parseJsonResponse(response);
        if (!response.ok || !data.success) {
            throw requestError(data, response);
        }
        return data;
    };

    const requestError = (data, response) => {
        const error = new Error((data && data.error) || ('HTTP ' + response.status));
        error.code = (data && data.error_code) || null;
        return error;
    };

    const parseJsonResponse = async response => {
        try {
            return await response.json();
        } catch (error) {
            throw new Error('HTTP ' + response.status);
        }
    };

    const createMobileSession = async () => {
        const formData = new FormData();
        formData.append('sesskey', config.sesskey);

        const response = await fetch(config.sessionCreateUrl, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });
        const data = await parseJsonResponse(response);

        if (!response.ok || !data.success) {
            throw requestError(data, response);
        }

        return data;
    };

    const fetchSessionResult = async (sessionId) => {
        const separator = config.sessionResultUrl.indexOf('?') === -1 ? '?' : '&';
        const response = await fetch(config.sessionResultUrl + separator + 'session=' + encodeURIComponent(sessionId), {
            credentials: 'same-origin'
        });
        const data = await parseJsonResponse(response);

        if (!response.ok || !data.success) {
            throw requestError(data, response);
        }

        return data;
    };

    return {fetchMissingAnchors, postImage, postLatex, postAscii, postStrokes, createMobileSession, fetchSessionResult};
});
