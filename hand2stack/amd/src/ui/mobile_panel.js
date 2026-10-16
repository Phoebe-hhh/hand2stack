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
 * The QR code panel for uploading from another device.
 *
 * @module local_hand2stack/ui/mobile_panel
 */
define(['local_hand2stack/config'], function(Config) {
    const {config} = Config;

    const createMobilePanel = () => {
        const panel = document.createElement('div');
        panel.style.marginTop = '8px';
        panel.style.padding = '8px';
        panel.style.border = '1px solid #ddd';
        panel.style.background = '#f8fbff';
        panel.style.display = 'none';

        const title = document.createElement('div');
        title.textContent = config.mobilebtn || 'Mobile Math Upload';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '8px';

        const tip = document.createElement('div');
        tip.textContent = config.mobilescantip || 'Scan the QR code with your phone, log in if needed, and upload the image.';
        tip.style.marginBottom = '8px';

        const qrImg = document.createElement('img');
        qrImg.style.display = 'block';
        qrImg.style.maxWidth = '220px';
        qrImg.style.border = '1px solid #ddd';
        qrImg.style.marginBottom = '8px';

        const link = document.createElement('a');
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.wordBreak = 'break-all';
        link.style.display = 'block';
        link.style.marginBottom = '8px';

        const warning = document.createElement('div');
        warning.style.display = 'none';
        warning.style.marginBottom = '8px';
        warning.style.padding = '8px';
        warning.style.border = '1px solid #f0ad4e';
        warning.style.background = '#fff8e5';
        warning.style.color = '#6b4b00';

        const status = document.createElement('div');
        status.textContent = config.mobilesessionnotcreated || 'Session not created';
        status.style.color = '#555';

        panel.appendChild(title);
        panel.appendChild(tip);
        panel.appendChild(qrImg);
        panel.appendChild(link);
        panel.appendChild(warning);
        panel.appendChild(status);

        panel._qrImg = qrImg;
        panel._link = link;
        panel._warning = warning;
        panel._status = status;
        return panel;
    };

    const buildQrDataUrl = (svg) => {
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(String(svg || ''));
    };

    return {createMobilePanel, buildQrDataUrl};
});
