// This file is part of Moodle - http://moodle.org/
// SPDX-License-Identifier: GPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../amd/src');
const buildRoot = path.resolve(__dirname, '../../amd/build');
const files = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : (entry.name.endsWith('.js') ? [full] : []);
});
const moduleName = file => 'local_hand2stack/' + path.relative(root, file).replace(/\\/g, '/').replace(/\.js$/, '');
const sources = new Map(files(root).map(file => [moduleName(file), fs.readFileSync(file, 'utf8')]));
const builtSources = new Map(files(buildRoot).map(file => ['local_hand2stack/'
    + path.relative(buildRoot, file).replace(/\\/g, '/').replace(/\.min\.js$/, ''), fs.readFileSync(file, 'utf8')]));

// Just enough of a browser for the modules' top-level code to run.
const browser = () => ({
    navigator: {userAgent: 'node', maxTouchPoints: 0},
    window: {
        crypto: {randomUUID: () => '00000000-0000-4000-8000-000000000000'},
        sessionStorage: {getItem: () => null, setItem: () => {}},
        setTimeout: () => 0,
        clearTimeout: () => {},
        console
    },
    document: {}
});

// Load every module the way RequireJS does: dependencies first, each factory once.
const loadAll = (sources) => {
    const globals = browser();
    const exportsOf = new Map();
    const load = (name, trail = []) => {
        if (exportsOf.has(name)) return exportsOf.get(name);
        assert.ok(sources.has(name), `${trail.join(' -> ')} needs ${name}, which does not exist`);
        assert.ok(!trail.includes(name), `circular dependency: ${trail.concat(name).join(' -> ')}`);
        let deps;
        let factory;
        vm.runInNewContext(sources.get(name), Object.assign({}, globals, {
            define: (d, f) => {
                deps = d;
                factory = f;
            }
        }));
        const exported = factory(...deps.map(dep => load(dep, trail.concat(name))));
        exportsOf.set(name, exported);
        return exported;
    };
    sources.forEach((source, name) => load(name));
    return exportsOf;
};

test('every module loads and its dependencies exist without cycles', () => {
    const exportsOf = loadAll(sources);
    assert.equal(exportsOf.size, sources.size);
    assert.equal(typeof exportsOf.get('local_hand2stack/main').init, 'function');
});

test('every name a module takes from a dependency is exported by it', () => {
    const exportsOf = loadAll(sources);
    sources.forEach((source, name) => {
        const header = /define\(\[([\s\S]*?)\],\s*function\(([\s\S]*?)\)\s*\{/.exec(source);
        const deps = [...header[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
        const params = header[2].split(',').map(param => param.trim()).filter(Boolean);
        assert.equal(params.length, deps.length, `${name}: one parameter per dependency`);
        for (const match of source.matchAll(/^ {4}const \{([\s\S]*?)\} = (\w+);/gm)) {
            const dep = deps[params.indexOf(match[2])];
            assert.ok(dep, `${name}: ${match[2]} is not a dependency`);
            match[1].split(',').map(item => item.trim()).filter(Boolean).forEach(item => {
                assert.notEqual(exportsOf.get(dep)[item], undefined, `${name} takes ${item}, which ${dep} does not export`);
            });
        }
    });
});

test('the built modules load and export what the sources export', () => {
    const built = loadAll(builtSources);
    loadAll(sources).forEach((exported, name) => {
        assert.deepEqual(Object.keys(built.get(name)).sort(), Object.keys(exported).sort(), name);
    });
});

test('every module has a built copy and no built copy is left without its source', () => {
    assert.deepEqual([...builtSources.keys()].sort(), [...sources.keys()].sort());
});
