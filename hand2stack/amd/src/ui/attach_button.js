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
 * The buttons beside an answer box and the recognition workflow they start.
 *
 * @module local_hand2stack/ui/attach_button
 */
define([
    'local_hand2stack/config',
    'local_hand2stack/core/stack_inputs',
    'local_hand2stack/core/research',
    'local_hand2stack/core/api',
    'local_hand2stack/core/saved_result',
    'local_hand2stack/ui/icons',
    'local_hand2stack/ui/result_panel',
    'local_hand2stack/ui/result_view',
    'local_hand2stack/ui/mobile_panel',
    'local_hand2stack/ui/handwriting_panel',
    'local_hand2stack/modes/freetext/anchors'
], function(
    Config, StackInputs, Research, Api, SavedResult, Icons, ResultPanel, ResultView, MobilePanel,
    HandwritingPanel, Anchors
) {
    const {config, isMobileOrTablet} = Config;
    const {isFreeTextInput, captureAnswerAnchor} = StackInputs;
    const {logRecognitionFailure, research} = Research;
    const {postImage, createMobileSession, fetchSessionResult} = Api;
    const {loadSavedResult, prepareSourceImage} = SavedResult;
    const {icons, setIconButtonLabel, paintIconButton, createIconButton} = Icons;
    const {createResultPanel, setRequestStatus} = ResultPanel;
    const {updateResultPanel} = ResultView;
    const {createMobilePanel, buildQrDataUrl} = MobilePanel;
    const {createHandwritingPanel} = HandwritingPanel;
    const {applyMatchedAnswers, reportTargetResult} = Anchors;

    const createHiddenFileInput = (capture = false) => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        if (capture) fileInput.setAttribute('capture', 'environment');
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
        return fileInput;
    };

    const attachButton = (answerBox) => {
        if (!answerBox || answerBox.dataset.hand2stackBound === '1') {
            return;
        }

        answerBox.dataset.hand2stackBound = '1';
        captureAnswerAnchor(answerBox);
        if (answerBox.tagName === 'INPUT' && !isFreeTextInput(answerBox)) {
            answerBox.style.width = 'min(260px, 45vw)';
            answerBox.style.maxWidth = '100%';
        }

        const lifecycleController = new AbortController();
        let recognitionRequestId = 0;
        const requestCoordinator = {
            begin: () => ++recognitionRequestId,
            invalidate: () => ++recognitionRequestId,
            isCurrent: requestId => requestId === recognitionRequestId && answerBox.isConnected
        };
        const fileInput = createHiddenFileInput(false);
        const cameraInput = isMobileOrTablet ? createHiddenFileInput(true) : null;
        const resultPanel = createResultPanel();
        const handwritingPanel = createHandwritingPanel(
            answerBox,
            resultPanel,
            requestCoordinator,
            lifecycleController.signal
        );
        resultPanel._layoutReference = handwritingPanel;
        const mobilePanel = createMobilePanel();
        let mobilePollTimer = null;
        let mobilePollInFlight = false;
        let mobilePollFailures = 0;
        let lastMobileResultVersion = '';

        const uploadLabel = config.uploadbtn || 'Upload math image';
        const mobileLabel = isMobileOrTablet
            ? (config.camerabtn || 'Take a photo')
            : (config.mobilebtn || 'Mobile Math Upload');
        const uploadBtn = createIconButton(uploadLabel, icons.image);
        const mobileBtn = createIconButton(mobileLabel, icons.camera);
        const handwriteBtn = createIconButton(config.handwritebtn, icons.pen);
        let inputMode = '';

        const selectInputMode = mode => {
            if (inputMode !== mode) {
                requestCoordinator.invalidate();
            }
            inputMode = mode;
            answerBox._hand2stackModality = mode;
            handwritingPanel.style.display = mode === 'handwrite' ? 'block' : 'none';
            mobilePanel.style.display = mode === 'mobile' ? 'block' : 'none';

            if (mode !== 'mobile' && mobilePollTimer) {
                window.clearInterval(mobilePollTimer);
                mobilePollTimer = null;
            }

            [
                [uploadBtn, 'image'],
                [handwriteBtn, 'handwrite'],
                [mobileBtn, isMobileOrTablet ? 'camera' : 'mobile']
            ].forEach(([button, buttonMode]) => {
                button.setAttribute('aria-pressed', mode === buttonMode ? 'true' : 'false');
                paintIconButton(button);
            });
        };

        handwriteBtn.addEventListener('click', () => {
            selectInputMode('handwrite');
        });

        uploadBtn.addEventListener('click', () => {
            selectInputMode('image');
            fileInput.value = '';
            fileInput.click();
        });

        const recognizeImageFile = async (file, button, idleLabel) => {
            if (!file) return;

            const requestId = requestCoordinator.begin();
            const source = button === uploadBtn ? 'image' : 'camera';
            const startedAt = Date.now();
            research.log(answerBox, 'recognition_started', {
                requestId,
                source,
                image: {mime: file.type || '', bytes: file.size || 0}
            }, {modality: source});
            const sourceUrl = URL.createObjectURL(file);
            prepareSourceImage(sourceUrl, file);
            button.disabled = true;
            setIconButtonLabel(button, config.uploading || 'Recognizing...');
            setRequestStatus(resultPanel);

            try {
                const result = await postImage(config.recognizeUrl, file);
                if (!requestCoordinator.isCurrent(requestId)) return;
                const stackResult = result.stack || result.normalized || result.text || '';

                if (!stackResult && !result.raw_asciimath && !result.raw_latex && !result.freetext && !result.raw_text) {
                    throw new Error('Empty STACK result');
                }

                if (resultPanel._sourceObjectUrl) URL.revokeObjectURL(resultPanel._sourceObjectUrl);
                resultPanel._sourceObjectUrl = sourceUrl;
                resultPanel._hand2stackRecognition = {requestId, source, latencyMs: Date.now() - startedAt};
                updateResultPanel(resultPanel, result.raw_latex || '', result.raw_asciimath || '', stackResult,
                    answerBox, result.lines || [], result.freetext || result.raw_text || '', sourceUrl);
                if (config.autofill) {
                    applyMatchedAnswers(answerBox, result.lines || [],
                        () => requestCoordinator.isCurrent(requestId), reportTargetResult).catch(error => {
                        window.console.error('[hand2stack] applyMatchedAnswers failed:', error);
                    });
                }
            } catch (error) {
                if (!requestCoordinator.isCurrent(requestId)) return;
                logRecognitionFailure(answerBox, {requestId, source, latencyMs: Date.now() - startedAt}, error);
                window.console.error('[hand2stack] recognition failed:', error);
                resultPanel.style.display = 'block';
                setRequestStatus(resultPanel, (config.recognizefailed || 'Recognition failed.') + ' ' + error.message, true);
            } finally {
                if (resultPanel._sourceObjectUrl !== sourceUrl) URL.revokeObjectURL(sourceUrl);
                button.disabled = false;
                setIconButtonLabel(button, idleLabel);
            }
        };

        fileInput.addEventListener('change', () => {
            recognizeImageFile(fileInput.files && fileInput.files[0], uploadBtn, uploadLabel);
        });

        if (cameraInput) {
            cameraInput.addEventListener('change', () => {
                recognizeImageFile(cameraInput.files && cameraInput.files[0], mobileBtn, mobileLabel);
            });
        }

        mobileBtn.addEventListener('click', async () => {
            if (cameraInput) {
                selectInputMode('camera');
                cameraInput.value = '';
                cameraInput.click();
                return;
            }
            selectInputMode('mobile');
            const requestId = requestCoordinator.begin();
            try {
                if (mobilePollTimer) {
                    window.clearInterval(mobilePollTimer);
                    mobilePollTimer = null;
                }
                lastMobileResultVersion = '';
                mobilePollFailures = 0;
                mobilePollInFlight = false;

                mobileBtn.disabled = true;
                setIconButtonLabel(mobileBtn, config.creatingmobilesession || 'Creating mobile upload session...');

                const data = await createMobileSession();
                if (inputMode !== 'mobile' || !requestCoordinator.isCurrent(requestId)) {
                    mobileBtn.disabled = false;
                    setIconButtonLabel(mobileBtn, mobileLabel);
                    return;
                }
                const sessionId = data.session_id;
                research.log(answerBox, 'recognition_started', {
                    requestId,
                    source: 'mobile',
                    mobileSession: true
                }, {modality: 'mobile'});

                mobilePanel.style.display = 'block';
                mobilePanel._link.href = data.mobile_url;
                mobilePanel._link.textContent = data.mobile_url;
                if (!data.qr_svg) {
                    throw new Error('Moodle did not return a QR code.');
                }
                mobilePanel._qrImg.src = buildQrDataUrl(data.qr_svg);
                if (data.mobile_url_warning) {
                    mobilePanel._warning.textContent = data.mobile_url_warning;
                    mobilePanel._warning.style.display = 'block';
                } else {
                    mobilePanel._warning.textContent = '';
                    mobilePanel._warning.style.display = 'none';
                }
                mobilePanel._status.textContent = config.waitingmobileupload || 'Waiting for mobile upload...';

                mobileBtn.disabled = false;
                setIconButtonLabel(mobileBtn, mobileLabel);

                const start = Date.now();
                const timeoutMs = 10 * 60 * 1000;
                mobilePollTimer = window.setInterval(async () => {
                    if (mobilePollInFlight || !requestCoordinator.isCurrent(requestId) || inputMode !== 'mobile') {
                        return;
                    }
                    mobilePollInFlight = true;
                    try {
                        const result = await fetchSessionResult(sessionId);
                        if (!requestCoordinator.isCurrent(requestId) || inputMode !== 'mobile') return;
                        mobilePollFailures = 0;

                        if (result.ready) {
                            const stackResult = result.stack || result.text || '';
                            const resultVersion = [
                                result.updated_at || '',
                                result.raw_latex || '',
                                stackResult
                            ].join(':');

                            if (resultVersion !== lastMobileResultVersion) {
                                lastMobileResultVersion = resultVersion;
                                mobilePanel._status.textContent = config.mobileuploadreceived || 'Successfully received mobile result. You can upload another photo with the same QR code.';
                                resultPanel._hand2stackRecognition = {requestId, source: 'mobile', latencyMs: null};
                                updateResultPanel(resultPanel, result.raw_latex || '', result.raw_asciimath || '', stackResult,
                                    answerBox, result.lines || [], result.freetext || result.raw_text || '');
                                if (config.autofill) {
                                    applyMatchedAnswers(answerBox, result.lines || [],
                                        () => requestCoordinator.isCurrent(requestId) && inputMode === 'mobile', reportTargetResult).catch(error => {
                                        window.console.error('[hand2stack] applyMatchedAnswers failed:', error);
                                    });
                                }
                            }
                        } else if (result.expired) {
                            window.clearInterval(mobilePollTimer);
                            mobilePollTimer = null;
                            mobilePanel._status.textContent = config.mobileuploadexpired || 'This mobile upload session has expired.';
                        } else {
                            mobilePanel._status.textContent = config.waitingmobileupload || 'Waiting for mobile upload...';
                        }

                        if (Date.now() - start > timeoutMs) {
                            window.clearInterval(mobilePollTimer);
                            mobilePollTimer = null;
                            mobilePanel._status.textContent = config.mobileuploadtimeout || 'Timeout waiting for result. Please create a new session.';
                        }
                    } catch (error) {
                        window.console.error('[hand2stack] polling failed:', error);
                        mobilePollFailures++;
                        mobilePanel._status.textContent = config.pollingfailed || 'The mobile connection was interrupted. Retrying...';
                        if (mobilePollFailures >= 3) {
                            window.clearInterval(mobilePollTimer);
                            mobilePollTimer = null;
                            mobilePanel._status.textContent = error.message;
                        }
                    } finally {
                        mobilePollInFlight = false;
                    }
                }, 2000);
            } catch (error) {
                if (inputMode !== 'mobile' || !requestCoordinator.isCurrent(requestId)) {
                    mobileBtn.disabled = false;
                    setIconButtonLabel(mobileBtn, mobileLabel);
                    return;
                }
                window.console.error('[hand2stack] mobile session failed:', error);
                window.alert((config.mobilesessionfailed || 'Failed to create mobile session:') + ' ' + error.message);
                mobileBtn.disabled = false;
                setIconButtonLabel(mobileBtn, mobileLabel);
            }
        });

        // Keep the buttons together: if they do not fit beside the answer box,
        // the whole group wraps onto the next line instead of splitting up.
        const buttonGroup = document.createElement('span');
        buttonGroup.style.display = 'inline-flex';
        buttonGroup.style.flexWrap = 'nowrap';
        buttonGroup.style.alignItems = 'center';
        buttonGroup.style.gap = '6px';
        buttonGroup.style.verticalAlign = 'top';
        buttonGroup.style.whiteSpace = 'nowrap';
        buttonGroup.append(uploadBtn, handwriteBtn);
        if (config.enablemobile) {
            buttonGroup.appendChild(mobileBtn);
        }

        // STACK lays a free-text box beside its [[ascii]] preview in a flex
        // .free-text-container that stretches every child into an equal,
        // full-height column. Inside it the buttons and panels would become
        // columns too, so they go outside the container. Before it, so the
        // page reads handwriting, recognition, then STACK's rendering; the
        // preview iframe itself is never moved, since moving it reloads it.
        const boxParent = answerBox.parentElement;
        const inFlexParent = Boolean(boxParent
            && /^(inline-)?(flex|grid)$/.test(window.getComputedStyle(boxParent).display));
        const beforeContainer = inFlexParent && boxParent.classList.contains('free-text-container');
        if (beforeContainer) {
            boxParent.insertAdjacentElement('beforebegin', buttonGroup);
        } else {
            (inFlexParent ? boxParent : answerBox).insertAdjacentElement('afterend', buttonGroup);
        }

        // Beside the box the group just needs a small gap. Once it has wrapped
        // below, line it up with the box's left edge and give it room to breathe.
        // Above a container it starts the row, with room before the panels.
        const layoutButtonGroup = () => {
            if (beforeContainer) {
                buttonGroup.style.margin = '0 0 8px 0';
                return;
            }
            if (answerBox.offsetParent === null) return;
            buttonGroup.style.margin = '0 0 0 10px';
            const boxRect = answerBox.getBoundingClientRect();
            const groupRect = buttonGroup.getBoundingClientRect();
            if (groupRect.top < boxRect.bottom - 1) return;
            const indent = Math.max(0, boxRect.left - (groupRect.left - 10));
            buttonGroup.style.margin = '8px 0 4px ' + indent + 'px';
        };
        layoutButtonGroup();
        window.addEventListener('resize', layoutButtonGroup, {signal: lifecycleController.signal});
        if (typeof ResizeObserver !== 'undefined') {
            const groupResizeObserver = new ResizeObserver(layoutButtonGroup);
            groupResizeObserver.observe(answerBox);
            if (answerBox.parentElement) groupResizeObserver.observe(answerBox.parentElement);
            lifecycleController.signal.addEventListener('abort', () => groupResizeObserver.disconnect(), {once: true});
        }
        if (config.enablemobile) {
            buttonGroup.insertAdjacentElement('afterend', mobilePanel);
            mobilePanel.insertAdjacentElement('afterend', handwritingPanel);
        } else {
            buttonGroup.insertAdjacentElement('afterend', handwritingPanel);
        }
        handwritingPanel.insertAdjacentElement('afterend', resultPanel);
        if (beforeContainer) {
            handwritingPanel.style.marginBottom = '12px';
            resultPanel.style.marginBottom = '12px';
        }

        const savedResult = loadSavedResult(answerBox);
        if (savedResult) {
            // Research events from the restored panel keep the way the result
            // was made, until the learner picks another input method.
            if (!answerBox._hand2stackModality && typeof savedResult.modality === 'string') {
                answerBox._hand2stackModality = savedResult.modality;
            }
            updateResultPanel(resultPanel, savedResult.rawLatex || '', savedResult.rawAscii || '',
                savedResult.stackResult || '', answerBox, Array.isArray(savedResult.lines) ? savedResult.lines : [],
                savedResult.recognizedText || '', savedResult.sourceUrl || '', {restore: true, savedWorking: savedResult.working});
        }
        // Writing kept from before the reload is shown again, ready to change.
        if (handwritingPanel._hand2stackRestoredStrokes) selectInputMode('handwrite');

        const cleanupObserver = new MutationObserver(() => {
            if (answerBox.isConnected) return;
            requestCoordinator.invalidate();
            lifecycleController.abort();
            if (mobilePollTimer) window.clearInterval(mobilePollTimer);
            if (resultPanel._selectionAbortController) resultPanel._selectionAbortController.abort();
            (resultPanel._interactiveControllers || []).forEach(controller => controller.abort());
            if (resultPanel._reviewResizeObserver) resultPanel._reviewResizeObserver.disconnect();
            if (resultPanel._sourceObjectUrl) URL.revokeObjectURL(resultPanel._sourceObjectUrl);
            fileInput.remove();
            if (cameraInput) cameraInput.remove();
            cleanupObserver.disconnect();
        });
        cleanupObserver.observe(document.body, {childList: true, subtree: true});
    };

    return {attachButton};
});
