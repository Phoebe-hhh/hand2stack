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
 * The handwriting canvas and its tools.
 *
 * @module local_hand2stack/ui/handwriting_panel
 */
define([
    'local_hand2stack/config',
    'local_hand2stack/core/research',
    'local_hand2stack/core/api',
    'local_hand2stack/ui/result_panel',
    'local_hand2stack/ui/result_view',
    'local_hand2stack/modes/freetext/anchors'
], function(
    Config, Research, Api, ResultPanel, ResultView, Anchors
) {
    const {config, isIPadWebKit} = Config;
    const {logRecognitionFailure, research} = Research;
    const {postStrokes} = Api;
    const {setRequestStatus} = ResultPanel;
    const {updateResultPanel} = ResultView;
    const {applyMatchedAnswers, reportTargetResult} = Anchors;

    const createHandwritingPanel = (answerBox, resultPanel, requestCoordinator, lifecycleSignal) => {
        const panel = document.createElement('div');
        panel.style.cssText = 'display:none;margin-top:8px;padding:10px;border:1px solid #9db7d5;background:#f8fbff;width:100%;max-width:none;box-sizing:border-box';

        const instruction = document.createElement('div');
        instruction.textContent = config.handwriteinstructions;
        instruction.style.marginBottom = '8px';
        const canvas = document.createElement('canvas');
        canvas.width = 900;
        canvas.height = 420;
        canvas.style.cssText = 'display:block;width:100%;height:min(44vh,420px);min-height:260px;background:#fff;border:1px solid #8795a5;border-radius:4px;touch-action:none;overscroll-behavior:contain;cursor:crosshair';
        canvas.setAttribute('aria-label', config.handwritebtn);

        const canvasWrapper = document.createElement('div');
        canvasWrapper.style.cssText = 'position:relative;width:100%';

        const resizeHandle = document.createElement('button');
        resizeHandle.type = 'button';
        resizeHandle.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">' +
            '<path d="M6 16L16 6M11 16l5-5M16 16h.01" fill="none" stroke="currentColor" stroke-width="1.5" ' +
            'stroke-linecap="round"/></svg>';
        resizeHandle.setAttribute('aria-label', config.resizehandwriting || 'Drag to resize the writing area');
        resizeHandle.title = config.resizehandwriting || 'Drag to resize the writing area';
        resizeHandle.style.cssText = 'position:absolute;right:2px;bottom:2px;width:28px;height:28px;padding:4px;border:0;background:rgba(255,255,255,.88);color:#64748b;cursor:nwse-resize;touch-action:none;user-select:none;display:flex;align-items:center;justify-content:center;border-radius:3px';

        let resizePointerId = null;
        let resizeStartX = 0;
        let resizeStartY = 0;
        let resizeStartWidth = 0;
        let resizeStartHeight = 0;
        let resizeScaleX = 1;
        let resizeScaleY = 1;
        let canvasBackingScale = 0;
        resizeHandle.addEventListener('pointerdown', event => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            event.preventDefault();
            resizePointerId = event.pointerId;
            resizeStartX = event.clientX;
            resizeStartY = event.clientY;
            resizeStartWidth = panel.getBoundingClientRect().width;
            const canvasBounds = canvas.getBoundingClientRect();
            resizeStartHeight = canvasBounds.height;
            resizeScaleX = canvasBounds.width > 0 ? canvas.width / canvasBounds.width : 1;
            resizeScaleY = canvasBounds.height > 0 ? canvas.height / canvasBounds.height : resizeScaleX;
            canvasBackingScale = resizeScaleX;
        });
        document.addEventListener('pointermove', event => {
            if (resizePointerId === null || event.pointerId !== resizePointerId) return;
            event.preventDefault();
            const panelLeft = panel.getBoundingClientRect().left;
            const availableWidth = Math.max(360, window.innerWidth - panelLeft - 24);
            const nextWidth = Math.max(360, Math.min(availableWidth, resizeStartWidth + event.clientX - resizeStartX));
            const nextHeight = Math.max(260, Math.min(1200, resizeStartHeight + event.clientY - resizeStartY));
            panel.style.width = Math.round(nextWidth) + 'px';
            canvas.style.height = Math.round(nextHeight) + 'px';
            const resizedBounds = canvas.getBoundingClientRect();
            if (resizedBounds.width > 0 && resizedBounds.height > 0) {
                canvas.width = Math.round(resizedBounds.width * resizeScaleX);
                canvas.height = Math.round(resizedBounds.height * resizeScaleY);
                redraw();
            }
        }, {passive: false, signal: lifecycleSignal});
        const finishResize = event => {
            if (resizePointerId === null || event.pointerId !== resizePointerId) return;
            resizePointerId = null;
        };
        document.addEventListener('pointerup', finishResize, {signal: lifecycleSignal});
        document.addEventListener('pointercancel', finishResize, {signal: lifecycleSignal});

        const controls = document.createElement('div');
        controls.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap';
        const draw = document.createElement('button');
        const eraser = document.createElement('button');
        const undo = document.createElement('button');
        const clear = document.createElement('button');
        const recognize = document.createElement('button');
        const status = document.createElement('span');
        [draw, eraser, undo, clear, recognize].forEach(button => {
            button.type = 'button';
            button.className = 'btn btn-secondary';
        });
        recognize.className = 'btn btn-primary';
        draw.textContent = config.draw || 'Pen';
        eraser.textContent = config.eraser || 'Eraser';
        undo.textContent = config.undo;
        clear.textContent = config.clear;
        recognize.textContent = config.recognizestrokes;
        // Pen widths are in CSS pixels; each stroke keeps the width it was drawn with.
        const penSizes = [
            {width: 1.5, label: config.penthin || 'Thin pen'},
            {width: 2.5, label: config.penmedium || 'Medium pen'},
            {width: 4, label: config.penthick || 'Thick pen'}
        ];
        let penWidth = penSizes[1].width;
        const sizeGroup = document.createElement('div');
        sizeGroup.setAttribute('role', 'group');
        sizeGroup.setAttribute('aria-label', config.pensize || 'Pen size');
        sizeGroup.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding:2px;' +
            'border:1px solid #cfd4dc;border-radius:6px;background:#fff';
        const sizeButtons = penSizes.map(size => {
            const button = document.createElement('button');
            button.type = 'button';
            button.title = size.label;
            button.setAttribute('aria-label', size.label);
            button.style.cssText = 'width:32px;height:30px;padding:0;border:0;border-radius:4px;' +
                'display:inline-flex;align-items:center;justify-content:center;cursor:pointer';
            const dot = document.createElement('span');
            const dotSize = Math.round(size.width * 2 + 2);
            dot.style.cssText = 'display:block;border-radius:50%;background:#111827;' +
                'width:' + dotSize + 'px;height:' + dotSize + 'px';
            button.appendChild(dot);
            button._penWidth = size.width;
            sizeGroup.appendChild(button);
            return button;
        });
        const paintSizeButtons = () => {
            sizeButtons.forEach(button => {
                const selected = button._penWidth === penWidth;
                button.setAttribute('aria-pressed', selected ? 'true' : 'false');
                button.style.background = selected ? '#e8f1ff' : 'transparent';
                button.style.boxShadow = selected ? 'inset 0 0 0 1px #3978c5' : 'none';
            });
        };
        paintSizeButtons();
        controls.append(draw, eraser, sizeGroup, undo, clear, recognize, status);
        canvasWrapper.append(canvas, resizeHandle);
        panel.append(instruction, canvasWrapper, controls);

        const strokes = [];
        const history = [];
        let active = null;
        let tool = 'draw';
        let canvasRect = null;
        let drawFrame = null;
        const dirtyStrokes = new Set();
        const context = canvas.getContext('2d');
        const cloneStrokes = () => strokes.map(stroke => ({
            x: stroke.x.slice(), y: stroke.y.slice(), drawn: stroke.x.length, width: stroke.width
        }));
        const saveHistory = () => history.push(cloneStrokes());
        // Aggregate writing behaviour since the last recognition; coordinates
        // are never logged (spec §4.2).
        const PAUSE_MS = 2000;
        let writing = null;
        const resetWriting = () => {
            writing = {strokes: 0, erases: 0, undos: 0, clears: 0, firstAt: 0, lastEndAt: 0, pauses: 0, longestPause: 0};
        };
        resetWriting();
        const takeWritingStats = () => {
            const stats = {
                strokeCount: strokes.length,
                newStrokeCount: writing.strokes,
                pointCount: strokes.reduce((total, stroke) => total + stroke.x.length, 0),
                eraseCount: writing.erases,
                undoCount: writing.undos,
                clearCount: writing.clears,
                writingDurationMs: writing.firstAt ? Math.max(0, writing.lastEndAt - writing.firstAt) : 0,
                pauseCount: writing.pauses,
                longestPauseMs: writing.longestPause
            };
            resetWriting();
            return stats;
        };
        const setTool = nextTool => {
            tool = nextTool;
            const drawing = tool === 'draw';
            draw.setAttribute('aria-pressed', drawing ? 'true' : 'false');
            eraser.setAttribute('aria-pressed', drawing ? 'false' : 'true');
            draw.className = drawing ? 'btn btn-primary' : 'btn btn-secondary';
            eraser.className = drawing ? 'btn btn-secondary' : 'btn btn-primary';
            canvas.style.cursor = drawing ? 'crosshair' : 'cell';
        };
        const configureContext = (width = 4) => {
            context.strokeStyle = '#111827';
            context.lineWidth = width;
            context.lineCap = 'round';
            context.lineJoin = 'round';
        };
        const pointFor = event => {
            const rect = canvasRect || canvas.getBoundingClientRect();
            return {
                x: Math.round((event.clientX - rect.left) * canvas.width / rect.width),
                y: Math.round((event.clientY - rect.top) * canvas.height / rect.height)
            };
        };
        const drawNewSegments = stroke => {
            const length = stroke.x.length;
            if (!length || stroke.drawn >= length) return;

            configureContext(stroke.width);
            context.beginPath();
            if (stroke.drawn === 0) {
                context.moveTo(stroke.x[0], stroke.y[0]);
                if (length === 1) context.lineTo(stroke.x[0] + 0.01, stroke.y[0] + 0.01);
            } else {
                const previous = stroke.drawn - 1;
                context.moveTo(stroke.x[previous], stroke.y[previous]);
            }
            for (let i = Math.max(1, stroke.drawn); i < length; i++) {
                context.lineTo(stroke.x[i], stroke.y[i]);
            }
            context.stroke();
            stroke.drawn = length;
        };
        const flushDrawing = () => {
            drawFrame = null;
            dirtyStrokes.forEach(drawNewSegments);
            dirtyStrokes.clear();
        };
        const scheduleDrawing = stroke => {
            dirtyStrokes.add(stroke);
            if (drawFrame === null) drawFrame = window.requestAnimationFrame(flushDrawing);
        };
        const redraw = () => {
            if (drawFrame !== null) {
                window.cancelAnimationFrame(drawFrame);
                drawFrame = null;
            }
            dirtyStrokes.clear();
            context.clearRect(0, 0, canvas.width, canvas.height);
            strokes.forEach(stroke => {
                stroke.drawn = 0;
                drawNewSegments(stroke);
            });
        };
        const distanceToSegment = (point, start, end) => {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
            const ratio = Math.max(0, Math.min(1,
                ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)
            ));
            return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
        };
        const eraseAt = point => {
            let changed = false;
            for (let strokeIndex = strokes.length - 1; strokeIndex >= 0; strokeIndex--) {
                const stroke = strokes[strokeIndex];
                for (let i = 0; i < stroke.x.length; i++) {
                    const start = {x: stroke.x[i], y: stroke.y[i]};
                    const end = i + 1 < stroke.x.length ? {x: stroke.x[i + 1], y: stroke.y[i + 1]} : start;
                    if (distanceToSegment(point, start, end) <= 24) {
                        strokes.splice(strokeIndex, 1);
                        changed = true;
                        break;
                    }
                }
            }
            if (changed) redraw();
            return changed;
        };
        const addSamples = (event, stroke = active) => {
            if (!stroke) return;
            const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
            samples.forEach(sample => {
                const point = pointFor(sample);
                if (stroke.erasing) {
                    stroke.changed = eraseAt(point) || stroke.changed;
                    return;
                }
                const last = stroke.x.length - 1;
                if (last < 0 || stroke.x[last] !== point.x || stroke.y[last] !== point.y) {
                    stroke.x.push(point.x);
                    stroke.y.push(point.y);
                }
            });
            if (!stroke.erasing) scheduleDrawing(stroke);
        };
        const flushPendingDrawing = () => {
            if (drawFrame === null) return;
            window.cancelAnimationFrame(drawFrame);
            flushDrawing();
        };
        const syncCanvasBackingStore = () => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            if (!canvasBackingScale) {
                canvasBackingScale = canvas.width / rect.width;
            }
            const expectedWidth = Math.max(1, Math.round(rect.width * canvasBackingScale));
            const expectedHeight = Math.max(1, Math.round(rect.height * canvasBackingScale));
            if (canvas.width === expectedWidth && canvas.height === expectedHeight) return;
            canvas.width = expectedWidth;
            canvas.height = expectedHeight;
            redraw();
        };
        const syncEmptyCanvasBackingStore = () => {
            if (!strokes.length) syncCanvasBackingStore();
        };
        if (typeof ResizeObserver !== 'undefined') {
            const canvasResizeObserver = new ResizeObserver(() => {
                // Keep the backing-store scale constant when surrounding result UI
                // changes width. Existing stroke coordinates then retain their exact
                // on-screen size and position instead of being stretched by CSS.
                syncCanvasBackingStore();
            });
            canvasResizeObserver.observe(canvas);
            lifecycleSignal.addEventListener('abort', () => canvasResizeObserver.disconnect(), {once: true});
        }
        const startStroke = (pointerId, event) => {
            syncEmptyCanvasBackingStore();
            canvasRect = canvas.getBoundingClientRect();
            saveHistory();
            const strokeStartedAt = Date.now();
            if (writing.lastEndAt) {
                const pause = strokeStartedAt - writing.lastEndAt;
                if (pause >= PAUSE_MS) writing.pauses++;
                writing.longestPause = Math.max(writing.longestPause, pause);
            }
            writing.firstAt = writing.firstAt || strokeStartedAt;
            if (tool === 'eraser') writing.erases++;
            else writing.strokes++;
            if (tool === 'eraser') {
                active = {pointerId, erasing: true, changed: false};
                addSamples(event);
                return;
            }
            const scale = canvasRect.width > 0 ? canvas.width / canvasRect.width : 1;
            active = {x: [], y: [], drawn: 0, pointerId, width: penWidth * scale};
            strokes.push(active);
            addSamples(event);
        };
        const finishStroke = (pointerId, event = null) => {
            if (!active || pointerId !== active.pointerId) return;
            if (event) addSamples(event, active);
            flushPendingDrawing();
            if (active.erasing && !active.changed) history.pop();
            writing.lastEndAt = Date.now();
            active = null;
            canvasRect = null;
        };
        canvas.addEventListener('pointerdown', event => {
            // Fingers never write: a resting hand or a stray tap would leave marks.
            if (event.pointerType === 'touch'
                    || (isIPadWebKit && event.pointerType === 'pen')
                    || (event.pointerType === 'mouse' && event.button !== 0)) return;
            event.preventDefault();
            startStroke(event.pointerId, event);
        });
        canvas.addEventListener('pointermove', event => {
            if (!active || (isIPadWebKit && (event.pointerType === 'touch' || event.pointerType === 'pen'))
                    || event.pointerId !== active.pointerId) return;
            event.preventDefault();
            addSamples(event);
        });
        const endStroke = event => {
            if (isIPadWebKit && (event.pointerType === 'touch' || event.pointerType === 'pen')) return;
            finishStroke(event.pointerId, event);
        };
        canvas.addEventListener('pointerup', endStroke);
        canvas.addEventListener('pointercancel', event => {
            if (!active || event.pointerId !== active.pointerId) return;
            if (active.erasing && !active.changed) history.pop();
            active = null;
            canvasRect = null;
        });
        // On iPad/iPhone WebKit, handle Pencil input through Touch Events. This
        // avoids the Pencil gaps seen through Pointer Events. Finger touches are
        // ignored so a palm or a stray tap cannot draw.
        const drawingTouch = (event, identifier = null) => Array.from(event.changedTouches || []).find(touch =>
            identifier === null ? touch.touchType === 'stylus' : touch.identifier === identifier);
        canvas.addEventListener('touchstart', event => {
            if (!isIPadWebKit) return;
            const touch = drawingTouch(event);
            if (!touch) return;
            event.preventDefault();
            startStroke('touch-' + touch.identifier, touch);
        }, {passive: false});
        canvas.addEventListener('touchmove', event => {
            if (!isIPadWebKit || !active || typeof active.pointerId !== 'string') return;
            const identifier = Number(active.pointerId.slice(6));
            const touch = drawingTouch(event, identifier);
            if (!touch) return;
            event.preventDefault();
            addSamples(touch);
        }, {passive: false});
        const endTouchStroke = event => {
            if (!isIPadWebKit || !active || typeof active.pointerId !== 'string') return;
            const identifier = Number(active.pointerId.slice(6));
            const touch = drawingTouch(event, identifier);
            if (!touch) return;
            event.preventDefault();
            finishStroke(active.pointerId, touch);
        };
        canvas.addEventListener('touchend', endTouchStroke, {passive: false});
        canvas.addEventListener('touchcancel', event => {
            if (!isIPadWebKit || !active || typeof active.pointerId !== 'string') return;
            const identifier = Number(active.pointerId.slice(6));
            if (!drawingTouch(event, identifier)) return;
            if (active.erasing && !active.changed) history.pop();
            active = null;
            canvasRect = null;
        }, {passive: false});
        draw.addEventListener('click', () => setTool('draw'));
        eraser.addEventListener('click', () => setTool('eraser'));
        sizeButtons.forEach(button => button.addEventListener('click', () => {
            penWidth = button._penWidth;
            paintSizeButtons();
            setTool('draw');
        }));
        undo.addEventListener('click', () => {
            if (!history.length) return;
            writing.undos++;
            strokes.splice(0, strokes.length, ...history.pop());
            redraw();
            status.textContent = '';
        });
        clear.addEventListener('click', () => {
            if (!strokes.length) return;
            writing.clears++;
            saveHistory();
            strokes.length = 0;
            redraw();
            status.textContent = '';
        });
        setTool('draw');
        recognize.addEventListener('click', async () => {
            if (!strokes.length) { status.textContent = config.nostrokes; return; }
            const requestId = requestCoordinator.begin();
            const startedAt = Date.now();
            research.log(answerBox, 'recognition_started', {
                requestId,
                source: 'handwrite',
                handwriting: takeWritingStats()
            }, {modality: 'handwrite'});
            recognize.disabled = true;
            status.textContent = config.uploading;
            setRequestStatus(resultPanel);
            try {
                const result = await postStrokes({x: strokes.map(s => s.x), y: strokes.map(s => s.y)});
                if (!requestCoordinator.isCurrent(requestId)) return;
                const stackResult = result.stack || result.text || '';
                resultPanel._hand2stackRecognition = {requestId, source: 'handwrite', latencyMs: Date.now() - startedAt};
                updateResultPanel(resultPanel, result.raw_latex || '', result.raw_asciimath || '', stackResult,
                    answerBox, result.lines || [], result.freetext || result.raw_text || '', canvas.toDataURL('image/png'));
                applyMatchedAnswers(answerBox, result.lines || [],
                    () => requestCoordinator.isCurrent(requestId), reportTargetResult).catch(error => {
                    window.console.error('[hand2stack] applyMatchedAnswers failed:', error);
                });
                status.textContent = '';
            } catch (error) {
                if (requestCoordinator.isCurrent(requestId)) {
                    logRecognitionFailure(answerBox, {requestId, source: 'handwrite', latencyMs: Date.now() - startedAt}, error);
                    status.textContent = (config.recognizefailed || 'Recognition failed.') + ' ' + error.message;
                }
            } finally {
                recognize.disabled = false;
                if (!requestCoordinator.isCurrent(requestId)) {
                    status.textContent = '';
                }
            }
        });
        return panel;
    };

    return {createHandwritingPanel};
});
