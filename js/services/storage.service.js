/* Файл: js/services/storage.service.js */
/* Storage Service v0.1 — legacy wrapper над IndexedDB helpers */

(function () {
    'use strict';

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    window.RBI.services.storage = {

        stores: function () {
            return typeof STORES !== 'undefined' ? STORES : {};
        },

        get: async function (storeName, key) {
            if (typeof dbGet !== 'function') throw new Error('[RBI.storage] dbGet недоступен');
            return dbGet(storeName, key);
        },

        getAll: async function (storeName) {
            if (typeof dbGetAll !== 'function') throw new Error('[RBI.storage] dbGetAll недоступен');
            return dbGetAll(storeName);
        },

        put: async function (storeName, data) {
            if (typeof dbPut !== 'function') throw new Error('[RBI.storage] dbPut недоступен');
            return dbPut(storeName, data);
        },

        delete: async function (storeName, key) {
            if (typeof dbDelete !== 'function') throw new Error('[RBI.storage] dbDelete недоступен');
            return dbDelete(storeName, key);
        },

        clear: async function (storeName) {
            if (typeof dbClear !== 'function') throw new Error('[RBI.storage] dbClear недоступен');
            return dbClear(storeName);
        },

        putBatch: async function (storeName, items) {
            if (typeof dbPutBatch === 'function') {
                return dbPutBatch(storeName, items);
            }
            if (!Array.isArray(items)) return false;
            for (var i = 0; i < items.length; i++) {
                await this.put(storeName, items[i]);
            }
            return true;
        },

        // P2-0072: номер записи — сервис номеров платформы (uuid); тип сущности в номер больше не входит.
        generateId: function () {
            return window.RbiIds.newId();
        },

        // Мягкое удаление: выставляет is_deleted, _deleted, deleted_at,
        // updated_at, syncStatus/sync_status — через существующий dbGet/dbPut.
        softDelete: async function (storeName, id) {
            if (typeof dbGet !== 'function' || typeof dbPut !== 'function') {
                throw new Error('[RBI.storage] dbGet/dbPut недоступны');
            }
            var record = await dbGet(storeName, id);
            if (!record) return false;
            var now = new Date().toISOString();
            record.is_deleted  = true;
            record._deleted    = true;
            record.deleted_at  = now;
            record.updated_at  = now;
            record.syncStatus  = 'pending';
            record.sync_status = 'pending';
            await dbPut(storeName, record);
            return true;
        },

        // Сохраняет запись с гарантированными системными полями.
        // Не перезаписывает created_at, если уже выставлен.
        save: async function (storeName, record) {
            if (typeof dbPut !== 'function') {
                throw new Error('[RBI.storage] dbPut недоступен');
            }
            var now = new Date().toISOString();
            if (!record.created_at)  { record.created_at  = now; }
            record.updated_at = now;
            if (record.is_deleted == null) { record.is_deleted = false; }
            if (!record.syncStatus)  { record.syncStatus  = 'pending'; }
            if (!record.sync_status) { record.sync_status = 'pending'; }
            await dbPut(storeName, record);
            return record;
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.storage', window.RBI.services.storage);
    }

    console.log('[RBI Service] storage loaded');
}());
