// This file is part of Moodle - http://moodle.org/
// SPDX-License-Identifier: GPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../amd/src/core/saved_result.js'), 'utf8');

// A sessionStorage that holds at most `quota` characters.
const storage = (quota = Infinity) => {
    const items = new Map();
    const used = () => [...items].reduce((total, [key, value]) => total + key.length + value.length, 0);
    return {
        get length() {
            return items.size;
        },
        key: index => [...items.keys()][index] ?? null,
        getItem: key => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => {
            const previous = items.get(key);
            items.set(key, String(value));
            if (used() > quota) {
                if (previous === undefined) items.delete(key);
                else items.set(key, previous);
                throw new Error('QuotaExceededError');
            }
        },
        removeItem: key => items.delete(key),
        items
    };
};

const load = sessionStorage => {
    let exported;
    vm.runInNewContext(source, {
        window: {sessionStorage},
        define: (deps, factory) => {
            exported = factory();
        }
    });
    return exported;
};

const box = name => ({name});
const drawing = {width: 900, height: 420, cssHeight: '', strokes: [{x: [1, 2, 3], y: [4, 5, 6], width: 2.5}]};

test('a box keeps its handwriting strokes across a reload', () => {
    const session = storage();
    load(session).saveStrokes(box('q12:1_ans1'), drawing);
    // The page reloads: a new module instance reads the same sessionStorage.
    const saved = load(session).loadSavedStrokes(box('q12:1_ans1'));
    assert.equal(JSON.stringify(saved.strokes), JSON.stringify(drawing.strokes));
    assert.equal(saved.width, 900);
    assert.equal(load(session).loadSavedStrokes(box('q13:1_ans1')), null);
});

test('clearing the canvas forgets its saved strokes', () => {
    const session = storage();
    const {saveStrokes, loadSavedStrokes} = load(session);
    saveStrokes(box('q12:1_ans1'), drawing);
    saveStrokes(box('q12:1_ans1'), Object.assign({}, drawing, {strokes: []}));
    assert.equal(loadSavedStrokes(box('q12:1_ans1')), null);
    assert.equal(session.items.size, 0);
});

test('saving strokes over quota drops other boxes’ results, never this box’s own', () => {
    const session = storage(900);
    const own = 'hand2stack:result:q12:1_ans1';
    const other = 'hand2stack:result:q12:1_ans2';
    session.setItem(own, JSON.stringify({savedAt: 1, sourceUrl: 'x'.repeat(300)}));
    session.setItem(other, JSON.stringify({savedAt: 2, sourceUrl: 'y'.repeat(300)}));
    const big = Object.assign({}, drawing, {strokes: [{x: Array(40).fill(100), y: Array(40).fill(200), width: 2.5}]});
    load(session).saveStrokes(box('q12:1_ans1'), big);
    assert.ok(session.items.has(own));
    assert.ok(!session.items.has(other));
    assert.ok(load(session).loadSavedStrokes(box('q12:1_ans1')));
});
