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
 * Icons and icon buttons.
 *
 * @module local_hand2stack/ui/icons
 */
define([], function() {
    const icons = {
        image: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"></rect><circle cx="8.5" cy="8.5" r="1.5" fill="none" stroke="currentColor" stroke-width="2"></circle><path d="M21 15l-5-5L5 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
        camera: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M14.5 4l1.5 2H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l1.5-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"></circle></svg>',
        pen: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20zM14 7l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>'
    };

    const setIconButtonLabel = (button, label) => {
        button.title = label;
        button.setAttribute('aria-label', label);
    };

    const iconButtonColors = {
        idle: {background: '#fff', border: '#cfd4dc', color: '#374151'},
        hover: {background: '#f3f6fa', border: '#aeb6c2', color: '#1f2937'},
        selected: {background: '#e8f1ff', border: '#3978c5', color: '#1d4f91'}
    };

    const paintIconButton = (button) => {
        const selected = button.getAttribute('aria-pressed') === 'true';
        const colors = iconButtonColors[selected ? 'selected' : (button._hovered ? 'hover' : 'idle')];
        button.style.background = colors.background;
        button.style.borderColor = colors.border;
        button.style.color = colors.color;
    };

    const createIconButton = (label, icon) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.innerHTML = icon;
        setIconButtonLabel(button, label);
        button.style.width = '36px';
        button.style.height = '34px';
        button.style.padding = '0';
        button.style.border = '1px solid';
        button.style.borderRadius = '6px';
        button.style.boxShadow = '0 1px 2px rgba(15, 23, 42, 0.06)';
        button.style.display = 'inline-flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.flex = '0 0 auto';
        button.style.cursor = 'pointer';
        button.style.transition = 'background-color 0.15s, border-color 0.15s, color 0.15s';
        button.addEventListener('mouseenter', () => {
            button._hovered = true;
            paintIconButton(button);
        });
        button.addEventListener('mouseleave', () => {
            button._hovered = false;
            paintIconButton(button);
        });
        paintIconButton(button);
        return button;
    };

    return {icons, setIconButtonLabel, paintIconButton, createIconButton};
});
