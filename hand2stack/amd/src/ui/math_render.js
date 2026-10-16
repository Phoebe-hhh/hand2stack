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
 * MathJax typesetting of previews.
 *
 * @module local_hand2stack/ui/math_render
 */
define([], function() {
    // Moodle loads MathJax 2 with delayStartupUntil=configured and only calls
    // Hub.Configured() once its filter finds an equation on the page. When the
    // question text has no math, queued typesets would wait until STACK returns
    // validation output, so start MathJax through Moodle's own loader.
    let mathJax2ConfigPromise = null;

    const ensureMathJax2Configured = mathJax => {
        if (mathJax.isReady) return Promise.resolve();
        if (!mathJax2ConfigPromise) {
            mathJax2ConfigPromise = new Promise(resolve => {
                const fallback = () => {
                    if (!mathJax.isReady && typeof mathJax.Hub.Configured === 'function') {
                        mathJax.Hub.Configured();
                    }
                    resolve();
                };
                if (typeof window.require !== 'function') {
                    fallback();
                    return;
                }
                window.require(['filter_mathjaxloader/loader'], loader => {
                    if (loader && typeof loader.typeset === 'function') {
                        loader.typeset();
                    }
                    resolve();
                }, fallback);
            });
        }
        return mathJax2ConfigPromise;
    };

    const typesetMath = async (element, attempt = 0) => {
        if (!element) return;

        const retry = () => {
            if (attempt >= 20 || !element.isConnected) return Promise.resolve();
            return new Promise(resolve => window.setTimeout(resolve, 100))
                .then(() => typesetMath(element, attempt + 1));
        };
        const mathJax = window.MathJax;
        if (!mathJax) return retry();

        try {
            // Moodle may expose the MathJax configuration object before the
            // runtime has finished loading. Waiting for startup prevents the
            // first OCR preview from remaining as literal \(...\) text.
            if (mathJax.startup && mathJax.startup.promise) {
                await mathJax.startup.promise;
            }
            if (typeof mathJax.typesetPromise === 'function') {
                await mathJax.typesetPromise([element]);
                return;
            }
            if (mathJax.Hub && typeof mathJax.Hub.Queue === 'function') {
                await ensureMathJax2Configured(mathJax);
                await new Promise(resolve => {
                    mathJax.Hub.Queue(['Typeset', mathJax.Hub, element], resolve);
                });
                return;
            }
        } catch (error) {
            // MathJax rejects when another STACK typeset is in progress. A
            // short retry is safer than waiting for an unrelated later click.
            if (attempt < 20) return retry();
            window.console.warn('[hand2stack] MathJax typeset failed:', error);
            return;
        }
        return retry();
    };

    return {typesetMath};
});
