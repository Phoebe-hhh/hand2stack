// This file is part of Moodle - http://moodle.org/
// SPDX-License-Identifier: GPL-3.0-or-later

// Minify every AMD module in amd/src to amd/build/<same path>.min.js, and
// remove built files whose source no longer exists.
const fs = require('node:fs');
const path = require('node:path');
const {minify} = require('terser');

const plugin = path.resolve(__dirname, '..');
const src = path.join(plugin, 'amd/src');
const build = path.join(plugin, 'amd/build');
const files = (dir, ext) => fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full, ext) : (entry.name.endsWith(ext) ? [full] : []);
});

(async () => {
    const expected = new Set();
    for (const file of files(src, '.js')) {
        const target = path.join(build, path.relative(src, file).replace(/\.js$/, '.min.js'));
        const result = await minify(fs.readFileSync(file, 'utf8'), {
            compress: true,
            mangle: true,
            format: {comments: /^!|@license|@copyright/}
        });
        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.writeFileSync(target, result.code);
        expected.add(target);
    }
    for (const file of files(build, '.js')) {
        if (!expected.has(file)) fs.unlinkSync(file);
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
