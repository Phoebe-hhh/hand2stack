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
 * The review panel: its frame, source image viewer and request status.
 *
 * @module local_hand2stack/ui/result_panel
 */
define(['local_hand2stack/config', 'local_hand2stack/ui/change_highlighter'], function(Config, ChangeHighlighter) {
    const {config, isMobileOrTablet} = Config;
    const {createChangeHighlighter} = ChangeHighlighter;

    const createTextarea = (value, readonly) => {
        const ta = document.createElement('textarea');
        ta.value = value || '';
        ta.readOnly = readonly;
        ta.rows = 2;
        ta.style.width = '100%';
        ta.style.boxSizing = 'border-box';
        ta.style.marginTop = '4px';
        ta.style.marginBottom = '8px';
        ta.style.fontSize = '13px';
        ta.style.fontFamily = 'monospace';
        return ta;
    };

    const createResultPanel = () => {
        const panel = document.createElement('div');
        const choiceName = 'local-hand2stack-line-choice-' + Math.random().toString(36).slice(2);
        panel.style.marginTop = '8px';
        panel.style.padding = '12px';
        panel.style.border = '1px solid #d8e1e8';
        panel.style.borderRadius = '6px';
        panel.style.background = '#f8fbfd';
        panel.style.display = 'none';
        // Follow the question content width rather than the viewport. Moodle's question
        // information column makes the usable area narrower, especially on iPad.
        panel.style.width = 'auto';
        panel.style.maxWidth = '100%';
        panel.style.minWidth = '0';
        panel.style.boxSizing = 'border-box';

        const freeTextHeader = document.createElement('div');
        freeTextHeader.style.display = 'none';
        freeTextHeader.style.justifyContent = 'space-between';
        freeTextHeader.style.alignItems = 'center';
        freeTextHeader.style.gap = '16px';
        freeTextHeader.style.flexWrap = 'wrap';
        freeTextHeader.style.marginBottom = '18px';
        const freeTextHeading = document.createElement('strong');
        freeTextHeading.textContent = config.confirmrecognition || 'Review recognized content';
        freeTextHeading.style.fontSize = '18px';
        const freeTextWorkflow = document.createElement('span');
        freeTextWorkflow.textContent = config.freetextworkflow || 'Photo / iPad handwriting → Free text';
        freeTextWorkflow.style.color = '#667085';
        freeTextWorkflow.style.fontSize = '14px';
        freeTextHeader.append(freeTextHeading, freeTextWorkflow);

        const title = document.createElement('div');
        title.textContent = config.recognizedresults || 'Recognized results';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '4px';

        const instruction = document.createElement('div');
        instruction.textContent = config.selectanswer || 'Select the answer to insert into STACK:';
        instruction.style.marginBottom = '8px';

        const options = document.createElement('div');
        options.style.display = 'grid';
        options.style.gap = '6px';
        options.style.marginBottom = '8px';
        options.style.minWidth = '0';
        // Long recognitions scroll inside the list so the editable column stays in view.
        options.style.position = 'relative';
        options.style.maxHeight = 'min(60vh, 560px)';
        options.style.overflowY = 'auto';
        options.style.overscrollBehavior = 'contain';
        options.style.paddingRight = '4px';
        options.style.scrollbarWidth = 'thin';

        const formatTitle = document.createElement('div');
        formatTitle.textContent = config.recognizedformat || 'Recognized format:';
        formatTitle.style.fontWeight = 'bold';

        const formatTabs = document.createElement('div');
        formatTabs.setAttribute('role', 'tablist');
        formatTabs.style.display = 'flex';
        formatTabs.style.gap = '4px';
        formatTabs.style.marginTop = '0';

        const latexTab = document.createElement('button');
        latexTab.type = 'button';
        latexTab.textContent = config.rawlatex || 'LaTeX';
        latexTab.setAttribute('role', 'tab');

        const asciiTab = document.createElement('button');
        asciiTab.type = 'button';
        asciiTab.textContent = config.asciimath || 'ASCII';
        asciiTab.setAttribute('role', 'tab');

        [latexTab, asciiTab].forEach(tab => {
            tab.style.padding = '2px 7px';
            tab.style.border = '0';
            tab.style.borderRadius = '3px';
            tab.style.fontSize = '12px';
            tab.style.cursor = 'pointer';
        });
        formatTabs.appendChild(asciiTab);
        formatTabs.appendChild(latexTab);

        const formatRows = document.createElement('div');
        formatRows.style.display = 'grid';
        formatRows.style.gap = '6px';
        formatRows.style.margin = '6px 0 8px';

        const stackTitle = document.createElement('label');
        stackTitle.textContent = config.stackpreview || 'STACK input preview:';
        stackTitle.style.display = 'block';
        stackTitle.style.fontWeight = 'bold';
        const stackTextarea = createTextarea('', false);
        const changeHighlighter = createChangeHighlighter(stackTextarea);
        const stackTextareaId = 'local-hand2stack-stack-preview-' + Math.random().toString(36).slice(2);
        stackTextarea.id = stackTextareaId;
        stackTitle.setAttribute('for', stackTextareaId);

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.textContent = config.insertanswer || 'Insert answer';
        applyBtn.style.padding = '4px 8px';
        applyBtn.style.cursor = 'pointer';
        applyBtn.style.display = 'block';
        applyBtn.style.marginLeft = 'auto';

        const actionButtons = document.createElement('div');
        actionButtons.style.display = 'flex';
        actionButtons.style.justifyContent = 'flex-end';
        actionButtons.style.gap = '8px';
        actionButtons.append(applyBtn);

        const freeTextHelp = document.createElement('div');
        freeTextHelp.textContent = (config.freetexthelp
            || 'Edit text directly; formulas use ASCII math markers. Paragraphs and line breaks are preserved.')
            + ' ' + (config.editedhighlighthelp || 'Blue text shows your changes.')
            + ' ' + (config.directsubmithelp || 'Edits here are used directly as your Free-text answer.');
        freeTextHelp.style.display = 'none';
        freeTextHelp.style.color = '#667085';
        freeTextHelp.style.fontSize = '13px';
        freeTextHelp.style.marginTop = '8px';

        const requestStatus = document.createElement('div');
        requestStatus.setAttribute('role', 'status');
        requestStatus.setAttribute('aria-live', 'polite');
        requestStatus.style.display = 'none';
        requestStatus.style.marginTop = '8px';
        requestStatus.style.padding = '6px 8px';
        requestStatus.style.borderRadius = '3px';
        requestStatus.style.fontSize = '13px';

        const reviewGrid = document.createElement('div');
        reviewGrid.style.display = 'grid';
        reviewGrid.style.gap = '16px';
        reviewGrid.style.alignItems = 'start';
        reviewGrid.style.minWidth = '0';

        const candidateColumn = document.createElement('section');
        candidateColumn.style.minWidth = '0';
        candidateColumn.style.overflow = 'hidden';
        const sourceTitle = document.createElement('div');
        sourceTitle.textContent = config.originalwork || 'Original work';
        sourceTitle.style.fontWeight = 'bold';
        sourceTitle.style.marginBottom = '8px';
        sourceTitle.style.display = 'none';
        const sourcePreview = document.createElement('img');
        sourcePreview.alt = config.originalwork || 'Original work';
        sourcePreview.draggable = false;
        sourcePreview.style.display = 'block';
        sourcePreview.style.width = '100%';
        sourcePreview.style.height = '520px';
        sourcePreview.style.objectFit = 'contain';
        sourcePreview.style.background = '#fff';
        sourcePreview.style.transformOrigin = 'center center';
        sourcePreview.style.userSelect = 'none';
        sourcePreview.style.transition = 'transform 120ms ease-out';

        const sourceViewer = document.createElement('div');
        sourceViewer.style.display = 'none';
        sourceViewer.style.position = 'relative';
        sourceViewer.style.overflow = 'hidden';
        sourceViewer.style.background = '#fff';
        sourceViewer.style.border = '1px solid #d8e1e8';
        sourceViewer.style.borderRadius = '4px';
        sourceViewer.style.touchAction = 'pan-y';
        sourceViewer.appendChild(sourcePreview);

        const zoomControls = document.createElement('div');
        zoomControls.style.cssText = 'position:absolute;right:8px;top:8px;display:flex;gap:4px;z-index:1';
        const makeZoomButton = (text, label) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = text;
            button.title = label;
            button.setAttribute('aria-label', label);
            button.className = 'btn btn-light';
            button.style.cssText = 'min-width:34px;height:34px;padding:2px 8px;border:1px solid #aeb8c2;box-shadow:0 1px 3px rgba(0,0,0,.12)';
            return button;
        };
        const zoomOut = makeZoomButton('−', config.zoomout || 'Zoom out');
        const zoomReset = makeZoomButton('100%', config.resetzoom || 'Reset zoom');
        const zoomIn = makeZoomButton('+', config.zoomin || 'Zoom in');
        zoomControls.append(zoomOut, zoomReset, zoomIn);
        sourceViewer.appendChild(zoomControls);

        let imageScale = 1;
        let imageX = 0;
        let imageY = 0;
        let imageDrag = null;
        const renderImageTransform = () => {
            sourcePreview.style.transform = 'translate3d(' + imageX + 'px,' + imageY + 'px,0) scale(' + imageScale + ')';
            sourceViewer.style.cursor = imageScale > 1 ? (imageDrag ? 'grabbing' : 'grab') : 'default';
            sourceViewer.style.touchAction = imageScale > 1 ? 'none' : 'pan-y';
            zoomOut.disabled = imageScale <= 1;
            zoomIn.disabled = imageScale >= 4;
            zoomReset.textContent = Math.round(imageScale * 100) + '%';
        };
        const setImageScale = scale => {
            imageScale = Math.max(1, Math.min(4, Math.round(scale * 4) / 4));
            if (imageScale === 1) {
                imageX = 0;
                imageY = 0;
            }
            renderImageTransform();
        };
        const resetImageView = () => setImageScale(1);
        zoomOut.addEventListener('click', () => setImageScale(imageScale - 0.25));
        zoomIn.addEventListener('click', () => setImageScale(imageScale + 0.25));
        zoomReset.addEventListener('click', resetImageView);
        sourceViewer.addEventListener('pointerdown', event => {
            if (imageScale <= 1 || event.target.closest('button')) return;
            event.preventDefault();
            imageDrag = {id: event.pointerId, x: event.clientX, y: event.clientY, imageX, imageY};
            renderImageTransform();
        });
        sourceViewer.addEventListener('pointermove', event => {
            if (!imageDrag || imageDrag.id !== event.pointerId) return;
            event.preventDefault();
            imageX = imageDrag.imageX + event.clientX - imageDrag.x;
            imageY = imageDrag.imageY + event.clientY - imageDrag.y;
            renderImageTransform();
        });
        const stopImageDrag = event => {
            if (!imageDrag || imageDrag.id !== event.pointerId) return;
            imageDrag = null;
            renderImageTransform();
        };
        sourceViewer.addEventListener('pointerup', stopImageDrag);
        sourceViewer.addEventListener('pointercancel', stopImageDrag);
        sourceViewer.addEventListener('pointerleave', stopImageDrag);
        sourceViewer.title = config.dragimage || 'Drag to inspect the enlarged image';
        renderImageTransform();
        candidateColumn.append(title, instruction, options, sourceTitle, sourceViewer);

        const recognizedColumn = document.createElement('section');
        recognizedColumn.style.minWidth = '0';
        recognizedColumn.style.padding = '0 4px';

        const editableHeader = document.createElement('div');
        editableHeader.style.display = 'flex';
        editableHeader.style.justifyContent = 'space-between';
        editableHeader.style.alignItems = 'center';
        editableHeader.style.gap = '8px';
        editableHeader.append(formatTitle, formatTabs);

        const convertedColumn = document.createElement('section');
        convertedColumn.style.minWidth = '0';
        convertedColumn.style.paddingTop = '10px';
        convertedColumn.style.borderTop = '1px solid #e2e6ea';
        convertedColumn.style.marginTop = '10px';
        convertedColumn.style.display = 'none';
        convertedColumn.append(stackTitle, changeHighlighter.wrapper, freeTextHelp);
        recognizedColumn.append(editableHeader, formatRows, convertedColumn, actionButtons, requestStatus);
        reviewGrid.append(candidateColumn, recognizedColumn);

        const updateReviewLayout = () => {
            const width = panel.getBoundingClientRect().width;
            const useColumns = panel._freeTextMode
                ? !isMobileOrTablet
                : (!isMobileOrTablet && width >= 820);
            reviewGrid.style.gridTemplateColumns = useColumns
                ? 'minmax(0, 1fr) minmax(0, 1fr)'
                : 'minmax(0, 1fr)';
        };
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(updateReviewLayout);
            observer.observe(panel);
            panel._reviewResizeObserver = observer;
        }

        panel.append(freeTextHeader, reviewGrid);

        panel._options = options;
        panel._freeTextHeader = freeTextHeader;
        panel._instruction = instruction;
        panel._formatTitle = formatTitle;
        panel._formatTabs = formatTabs;
        panel._formatRows = formatRows;
        panel._stackTitle = stackTitle;
        panel._reviewGrid = reviewGrid;
        panel._candidateColumn = candidateColumn;
        panel._sourceTitle = sourceTitle;
        panel._sourceViewer = sourceViewer;
        panel._sourcePreview = sourcePreview;
        panel._resetImageView = resetImageView;
        panel._recognizedColumn = recognizedColumn;
        panel._editableHeader = editableHeader;
        panel._convertedColumn = convertedColumn;
        panel._updateReviewLayout = updateReviewLayout;
        panel._latexTab = latexTab;
        panel._asciiTab = asciiTab;
        panel._stackTextarea = stackTextarea;
        panel._changeHighlighter = changeHighlighter;
        panel._actionButtons = actionButtons;
        panel._applyBtn = applyBtn;
        panel._freeTextHelp = freeTextHelp;
        panel._requestStatus = requestStatus;
        panel._choiceName = choiceName;

        return panel;
    };

    const setRequestStatus = (panel, message = '', isError = false) => {
        if (!panel || !panel._requestStatus) return;
        panel._requestStatus.textContent = message;
        panel._requestStatus.style.display = message ? 'block' : 'none';
        panel._requestStatus.style.background = isError ? '#f8d7da' : '#eef6ff';
        panel._requestStatus.style.color = isError ? '#842029' : '#24496b';
        panel._requestStatus.style.border = isError ? '1px solid #f1aeb5' : '1px solid #b8d4ee';
    };

    return {createResultPanel, setRequestStatus};
});
