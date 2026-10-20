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
 * Research events in this browser that the server has not confirmed yet,
 * those it never will (the dead-letter), and edits still being typed.
 *
 * @module local_hand2stack/core/research_outbox
 */
define([], function() {
    const DB_NAME = 'hand2stack-research';
    const DB_VERSION = 2;
    const EVENTS = 'outbox';
    const DRAFTS = 'drafts';
    const SPILL_PREFIX = 'hand2stack:outbox-spill:';
    const DRAFT_SPILL_PREFIX = 'hand2stack:draft-spill:';

    const request = req => new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    const done = tx => new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });

    // Everything is kept under `scope`, the server's name for this learner in
    // this study, so another account or study on the same browser never sends
    // or sees it. IndexedDB writes may not finish once the page is going, so
    // spill() and spillDraft() keep those last ones in localStorage, which is
    // synchronous, until the next page moves them into IndexedDB.
    //
    // An event row: {eventid, scope, status, event, attempts, firstAttemptAt,
    // lastAttemptAt, lastError, failureReason, deadAt, noticeId}. status is
    // "pending" until the server stores the event (then the row is removed),
    // or "rejected", "unresolved" or "expired": the dead-letter, kept.
    const createOutbox = (scope, indexedDB, localStorage) => {
        let opened = null;
        const open = () => {
            if (!opened) {
                opened = new Promise((resolve, reject) => {
                    if (!indexedDB) {
                        reject(new Error('IndexedDB is not available'));
                        return;
                    }
                    const req = indexedDB.open(DB_NAME, DB_VERSION);
                    req.onupgradeneeded = () => {
                        const db = req.result;
                        if (!db.objectStoreNames.contains(EVENTS)) {
                            db.createObjectStore(EVENTS, {keyPath: 'eventid'}).createIndex('scope', 'scope');
                        }
                        if (!db.objectStoreNames.contains(DRAFTS)) {
                            db.createObjectStore(DRAFTS, {keyPath: 'key'}).createIndex('scope', 'scope');
                        }
                    };
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
            }
            return opened;
        };

        const write = (store, fn) => open().then(db => {
            const tx = db.transaction(store, 'readwrite');
            fn(tx.objectStore(store));
            return done(tx);
        });
        const readAll = store => open()
            .then(db => request(db.transaction(store).objectStore(store).index('scope').getAll(scope)));

        const local = {
            read: key => {
                try {
                    const value = JSON.parse(localStorage.getItem(key) || 'null');
                    return value && typeof value === 'object' ? value : null;
                } catch (error) {
                    return null;
                }
            },
            write: (key, value) => {
                try {
                    if (value === null) {
                        localStorage.removeItem(key);
                    } else {
                        localStorage.setItem(key, JSON.stringify(value));
                    }
                } catch (error) {
                    // Full or blocked: only a page killed mid-write loses it.
                }
            }
        };

        // Events.
        const spillKey = SPILL_PREFIX + scope;
        const readSpill = () => {
            const events = local.read(spillKey);
            return Array.isArray(events) ? events : [];
        };
        const without = (events, ids) => {
            const gone = new Set(ids);
            return events.filter(event => event && !gone.has(event.eventid));
        };

        const pendingRow = event => ({
            eventid: event.eventid, scope, status: 'pending', event, attempts: 0, firstAttemptAt: null,
            lastAttemptAt: null, lastError: null, failureReason: null, deadAt: null, noticeId: null
        });

        const put = events => write(EVENTS, store => events.forEach(event => store.put(pendingRow(event))));

        // Merge fields into existing rows; a row already removed stays removed.
        const mark = updates => write(EVENTS, store => updates.forEach(update => {
            store.get(update.eventid).onsuccess = result => {
                const row = result.target.result;
                if (row) store.put(Object.assign(row, update, {eventid: row.eventid, scope}));
            };
        }));

        const spill = events => {
            local.write(spillKey, without(readSpill(), events.map(event => event.eventid)).concat(events));
        };

        const remove = ids => {
            const spilled = readSpill();
            if (spilled.length) {
                const kept = without(spilled, ids);
                local.write(spillKey, kept.length ? kept : null);
            }
            return write(EVENTS, store => ids.forEach(id => store.delete(id)));
        };

        const load = () => {
            const spilled = readSpill();
            // A spilled event IndexedDB already has keeps its row and status.
            const stored = spilled.length
                ? write(EVENTS, store => spilled.forEach(event => {
                    store.get(event.eventid).onsuccess = result => {
                        if (!result.target.result) store.put(pendingRow(event));
                    };
                })).then(() => local.write(spillKey, null))
                : Promise.resolve();
            return stored
                .then(() => readAll(EVENTS))
                // Without IndexedDB the spill is all there is; keep it until sent.
                .catch(() => spilled.map(pendingRow));
        };

        // Drafts: one per edit target, the newer of IndexedDB and the spill.
        const draftSpillKey = key => DRAFT_SPILL_PREFIX + scope + ':' + key;
        const newer = (a, b) => {
            if (!a) return b || null;
            if (!b) return a;
            return Number(b.lastInputAt) > Number(a.lastInputAt) ? b : a;
        };

        const putDraft = (key, draft) => write(DRAFTS, store => store.put(Object.assign({}, draft, {key, scope})));

        const spillDraft = (key, draft) => local.write(draftSpillKey(key), Object.assign({}, draft, {key, scope}));

        const getDraft = key => {
            const spilled = local.read(draftSpillKey(key));
            return open()
                .then(db => request(db.transaction(DRAFTS).objectStore(DRAFTS).get(key)))
                .then(row => newer(row && row.scope === scope ? row : null, spilled))
                .catch(() => spilled);
        };

        // Only the burst that wrote it: a newer edit of the same target may
        // have replaced the draft meanwhile.
        const removeDraft = (key, burstId) => {
            const spilled = local.read(draftSpillKey(key));
            if (spilled && spilled.burstId === burstId) local.write(draftSpillKey(key), null);
            return write(DRAFTS, store => {
                store.get(key).onsuccess = result => {
                    const row = result.target.result;
                    if (row && row.burstId === burstId) store.delete(key);
                };
            });
        };

        // Drafts nobody came back to: another attempt, or long ago.
        const pruneDrafts = before => readAll(DRAFTS).then(rows => {
            const old = rows.filter(row => !(Number(row.lastInputAt) >= before)).map(row => row.key);
            return old.length
                ? write(DRAFTS, store => old.forEach(key => store.delete(key))).then(() => old.length)
                : 0;
        });

        const clear = () => {
            local.write(spillKey, null);
            try {
                const prefix = DRAFT_SPILL_PREFIX + scope + ':';
                Object.keys(localStorage).filter(key => key.startsWith(prefix))
                    .forEach(key => localStorage.removeItem(key));
            } catch (error) {
                // Blocked storage: nothing was spilled either.
            }
            return open().then(db => {
                const tx = db.transaction([EVENTS, DRAFTS], 'readwrite');
                [EVENTS, DRAFTS].forEach(name => {
                    const store = tx.objectStore(name);
                    store.index('scope').getAllKeys(scope).onsuccess = event => {
                        event.target.result.forEach(id => store.delete(id));
                    };
                });
                return done(tx);
            });
        };

        return {put, mark, remove, load, spill, clear, putDraft, spillDraft, getDraft, removeDraft, pruneDrafts};
    };

    return {createOutbox};
});
