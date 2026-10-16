// This file is part of Moodle - http://moodle.org/
// SPDX-License-Identifier: GPL-3.0-or-later

// The source of every AMD module, concatenated, for tests that read the
// browser code as text or extract single functions from it.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../amd/src');
const files = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : (entry.name.endsWith('.js') ? [full] : []);
}).sort();

module.exports = files(root).map(file => fs.readFileSync(file, 'utf8')).join('\n');
