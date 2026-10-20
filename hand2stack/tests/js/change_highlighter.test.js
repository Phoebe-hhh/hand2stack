// This file is part of Moodle - http://moodle.org/.
// SPDX-License-Identifier: GPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const file = path.resolve(__dirname, '../../amd/src/ui/change_highlighter.js');
let editedMask;
vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    define: (deps, factory) => {
        editedMask = factory().editedMask;
    }
});
const marks = (original, current) => editedMask(original, current).map(edited => edited ? '^' : ' ').join('');

test('two separate edits mark only the changed characters, not the text between them', () => {
    assert.equal(marks('hello world, this is fine', 'hallo world, this is fane'),
        ' ^                    ^  ');
    assert.equal(marks('x = 1\ny = 2', 'x = 10\ny = 2\nz'), '     ^      ^^');
});

test('unchanged, cleared and fully new text', () => {
    assert.equal(marks('same', 'same'), '    ');
    assert.equal(marks('abc', ''), '');
    assert.equal(marks('', 'xyz'), '^^^');
});

test('the unmarked characters are a longest common subsequence', () => {
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const text = () => Array.from({length: Math.floor(random() * 30)}, () => 'ab\nc'[Math.floor(random() * 4)]).join('');
    for (let round = 0; round < 300; round++) {
        const a = text();
        const b = text();
        const kept = [...b].filter((c, i) => !editedMask(a, b)[i]).join('');
        const lcs = Array.from({length: a.length + 1}, () => Array(b.length + 1).fill(0));
        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                lcs[i][j] = a[i - 1] === b[j - 1] ? lcs[i - 1][j - 1] + 1 : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
            }
        }
        let matched = 0;
        for (const c of a) if (matched < kept.length && c === kept[matched]) matched++;
        assert.equal(matched, kept.length, `${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
        assert.equal(kept.length, lcs[a.length][b.length], `${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
    }
});
