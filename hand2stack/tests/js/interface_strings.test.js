// This file is part of Moodle - http://moodle.org/
// SPDX-License-Identifier: GPL-3.0-or-later

// main.js fills the interface strings from Moodle's core/str before it starts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../amd/src');

// Load config.js for real and main.js with every other dependency stubbed.
const loadMain = globals => {
    const factoryOf = file => {
        let made;
        vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), Object.assign({
            define: (deps, factory) => {
                made = {deps, factory};
            }
        }, globals));
        return made;
    };
    const Config = factoryOf('config.js').factory();
    const started = [];
    const stub = new Proxy({}, {
        get: (target, name) => (name === 'startResearch'
            ? () => started.push(Object.assign({}, Config.config))
            : () => []),
    });
    const main = factoryOf('main.js');
    const exported = main.factory(...main.deps.map(dep => (dep === 'local_hand2stack/config' ? Config : stub)));
    return {Config, init: exported.init, started};
};

const browser = extra => {
    // A Moodle installed in a subdirectory; M is a global, so also window.M.
    const M = {cfg: {wwwroot: 'https://moodle.example/projects', sesskey: 'abc'}};
    return Object.assign({
        navigator: {userAgent: 'node', maxTouchPoints: 0},
        window: {M, location: {origin: 'https://moodle.example'}, console: {warn: () => {}}},
        document: {querySelector: () => null, body: {id: 'page-mod-quiz-attempt'}},
        M,
    }, extra);
};

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('interface strings come from core/str, under the language key of each config key', async () => {
    const asked = [];
    const {Config, init, started} = loadMain(browser({
        require: (names, loaded) => loaded({
            get_strings: requests => {
                asked.push(...requests);
                return Promise.resolve(requests.map(request => 'ja:' + request.key));
            },
        }),
    }));
    init({inputMode: 'normal'});
    await settle();
    assert.equal(started.length, 1, 'the page starts once the strings are in');
    assert.equal(started[0].uploadbtn, 'ja:uploadbtn');
    // The one key whose language string has another name.
    assert.equal(started[0].mobilebtn, 'ja:mobileuploadbtn');
    assert.ok(asked.every(request => request.component === 'local_hand2stack'));
    assert.equal(asked.length, Object.keys(Config.stringKeys).length);
    // Settings and addresses are not strings to translate.
    assert.equal(asked.some(request => /Url$|^sesskey$|^inputMode$/.test(request.key)), false);
    assert.equal(started[0].recognizeUrl, 'https://moodle.example/projects/local/hand2stack/recognize.php');
});

test('the page still starts, in English, when the strings cannot be loaded', async () => {
    for (const require of [
        (names, loaded) => loaded({get_strings: () => Promise.reject(new Error('offline'))}),
        (names, loaded, failed) => failed(new Error('no core/str')),
        undefined,
    ]) {
        const {init, started} = loadMain(browser(require ? {require} : {}));
        init({});
        await settle();
        assert.equal(started.length, 1);
        assert.equal(started[0].uploadbtn, 'Upload math image');
    }
});

test('every preloaded language string exists in both language packs', () => {
    const hook = fs.readFileSync(path.resolve(root, '../../classes/local/hook_callbacks.php'), 'utf8');
    const preloaded = /strings_for_js\(\[([\s\S]*?)\]/.exec(hook)[1].match(/'(\w+)'/g).map(key => key.slice(1, -1));
    const {Config} = loadMain(browser({}));
    assert.deepEqual([...preloaded].sort(), Object.values(Config.stringKeys).sort());
    for (const lang of ['en', 'ja']) {
        const pack = fs.readFileSync(path.resolve(root, `../../lang/${lang}/local_hand2stack.php`), 'utf8');
        preloaded.forEach(key => assert.ok(pack.includes(`$string['${key}']`), `${lang} lacks ${key}`));
    }
});
