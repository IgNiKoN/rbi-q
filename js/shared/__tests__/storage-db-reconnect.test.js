/**
 * P2-0032: связь с локальной базой оборвалась (Safari/iPhone после сворачивания: «Connection to Indexed Database
 * server lost», база закрыта) — чтение открывает базу заново и повторяется, а не падает до перезагрузки страницы.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const DB_SRC = readFileSync(new URL('../../services/storage/storage-db.core.js', import.meta.url), 'utf8');

/** Браузерная база в памяти: open → соединение; соединение можно «оборвать». */
function fakeIdb(data) {
    const opened = [];
    const later = (fn) => setTimeout(fn, 0);
    const makeDb = () => {
        const db = {
            version: 30,
            closed: false,
            failNextRequest: false,
            objectStoreNames: { contains: () => true },
            close() { db.closed = true; },
            transaction() {
                if (db.closed) { const e = new Error('The database connection is closing.'); e.name = 'InvalidStateError'; throw e; }
                return {
                    objectStore: () => ({
                        get(key) {
                            const req = {};
                            later(() => {
                                if (db.failNextRequest) {
                                    db.failNextRequest = false;
                                    req.error = Object.assign(new Error('Connection to Indexed Database server lost. Refresh the page to try again'), { name: 'UnknownError' });
                                    req.onerror();
                                } else { req.result = data[key]; req.onsuccess(); }
                            });
                            return req;
                        }
                    })
                };
            }
        };
        opened.push(db);
        return db;
    };
    return {
        opened,
        open() {
            const req = {};
            later(() => { req.result = makeDb(); req.onsuccess(); });
            return req;
        }
    };
}

function load(idb) {
    const ctx = {
        window: { APP_CONFIG: { LOCAL_DB_NAME: 'PLATFORM2_DB' } },
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        indexedDB: idb, console: { log() {}, warn() {}, error() {} }, setTimeout, Promise, Date, JSON, Object, Array, Error
    };
    ctx.window.window = ctx.window;
    runInNewContext(DB_SRC, ctx);
    return ctx.window;
}

describe('локальная база: обрыв связи', () => {
    it('база закрыта браузером (onclose) — следующее чтение открывает её заново', async () => {
        const idb = fakeIdb({ a: 1 });
        const w = load(idb);
        assert.equal(await w.dbGet('photos', 'a'), 1);
        const first = idb.opened[0];
        first.closed = true;
        if (typeof first.onclose === 'function') first.onclose();
        assert.equal(await w.dbGet('photos', 'a'), 1);
        assert.equal(idb.opened.length, 2);
    });

    it('закрыта без onclose (transaction → InvalidStateError) — открыть заново и повторить один раз', async () => {
        const idb = fakeIdb({ a: 2 });
        const w = load(idb);
        await w.dbGet('photos', 'a');
        idb.opened[0].closed = true;
        assert.equal(await w.dbGet('photos', 'a'), 2);
    });

    it('чтение упало «Connection … lost» (UnknownError) — открыть заново и повторить один раз', async () => {
        const idb = fakeIdb({ a: 3 });
        const w = load(idb);
        await w.dbGet('photos', 'a');
        idb.opened[0].failNextRequest = true;
        assert.equal(await w.dbGet('photos', 'a'), 3);
        assert.equal(idb.opened.length, 2);
    });
});
