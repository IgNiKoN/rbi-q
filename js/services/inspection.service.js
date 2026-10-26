/* Файл: js/services/inspection.service.js */
/* Inspection Service v0.1 — legacy wrapper над STORES.HISTORY */

(function () {
    'use strict';

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    /* Владение contractorArray (Реальная изоляция модулей, часть 3, Группа C,
       критичный шаг): перенесено 1:1 из js/core/bootstrap.js — сервис теперь
       единственный владелец объявления, window.contractorArray остаётся
       синхронизированной живой ссылкой для всех существующих потребителей
       (большинство модулей читают bare window.contractorArray напрямую). */
    window.contractorArray = window.contractorArray || [];

    function getHistoryStore() {
        if (typeof STORES !== 'undefined' && STORES.HISTORY) return STORES.HISTORY;
        return 'app_history';
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function markSyncDirty() {
        if (window.RBI.services.sync && typeof window.RBI.services.sync.markDirty === 'function') {
            window.RBI.services.sync.markDirty('history');
        }
    }

    window.RBI.services.inspections = {

        normalize: function (record) {
            if (!record || typeof record !== 'object') return record;

            var isDeleted = record._deleted === true || record.is_deleted === true;
            var syncStatus = record.syncStatus || record.sync_status || 'not_synced';
            var updatedAt = record.updatedAt || record.updated_at || nowIso();

            return Object.assign({}, record, {
                module: record.module || 'quality',
                entityType: record.entityType || 'inspection',
                _deleted: isDeleted,
                is_deleted: isDeleted,
                syncStatus: syncStatus,
                sync_status: syncStatus,
                updatedAt: updatedAt,
                updated_at: updatedAt
            });
        },

        getAll: async function () {
            if (!window.RBI.services.storage) throw new Error('[RBI.inspections] storage service недоступен');
            var arr = await window.RBI.services.storage.getAll(getHistoryStore());
            var self = this;
            return Array.isArray(arr) ? arr.map(function (i) { return self.normalize(i); }) : [];
        },

        // Постраничная (курсорная) загрузка Журнала (см. отчёт по оптимизации
        // журнала/аналитики). Читает через индекс by_date (DB_VERSION 21,
        // storage-db.core.js) — не весь стор app_history, а страницу "свежие
        // сверху". opts: { limit, cursorKey, cursorPrimaryKey } — значение поля
        // `date` и id последней полученной на предыдущей странице записи
        // (оба undefined для первой страницы). Мягко удалённые записи
        // (_deleted/is_deleted) отфильтровываются на уровне сервиса — сам
        // индекс их не знает.
        //
        // ИСПРАВЛЕНИЕ (см. отчёт "История показывает меньше записей, чем есть
        // в базе"): граница страницы теперь задаётся ПАРОЙ (cursorKey +
        // cursorPrimaryKey), а не одним cursorKey — иначе при совпадающих
        // значениях `date` у нескольких записей (обычное дело при массовом
        // импорте/pull из облака) курсор навсегда пропускал часть из них,
        // и «Загрузить более старые проверки» останавливалось, не дойдя до
        // конца стора. См. dbGetPageByIndex (storage-db.core.js).
        //
        // Примечание: индекс by_contractor существует для точечных точечных
        // выборок ("все проверки подрядчика X"), но постраничная непрерывная
        // навигация ("вторая страница подрядчика X") через него не реализована —
        // IndexedDB не поддерживает offset-пагинацию по повторяющемуся значению
        // индекса без отдельного составного индекса. Фильтр по подряднику в
        // Журнале применяется к уже загруженной странице (см. history.render.js),
        // как и раньше, просто на меньшем объёме данных, а не на всей истории.
        getPage: async function (opts) {
            var options = opts || {};
            var limit = options.limit || 50;
            var cursorKey = options.cursorKey;
            var cursorPrimaryKey = options.cursorPrimaryKey;

            if (typeof window.dbGetPageByIndex !== 'function') {
                throw new Error('[RBI.inspections] dbGetPageByIndex недоступен');
            }

            var self = this;
            var collected = [];
            var effectiveCursorKey = cursorKey;
            var effectiveCursorPrimaryKey = cursorPrimaryKey;
            var hasMore = false;

            // Мягко удалённые записи пропускаем, но не считаем их за "страницу" —
            // догоняем limit курсором дальше, пока не наберём нужное количество
            // живых записей или не закончится стор.
            for (var guard = 0; guard < 20 && collected.length < limit; guard++) {
                var page = await window.dbGetPageByIndex(getHistoryStore(), {
                    indexName: 'by_date',
                    limit: limit - collected.length,
                    direction: 'prev',
                    cursorKey: effectiveCursorKey,
                    cursorPrimaryKey: effectiveCursorPrimaryKey
                });

                var liveItems = (page.items || []).filter(function (i) {
                    return i && i._deleted !== true && i.is_deleted !== true;
                });
                collected = collected.concat(liveItems.map(function (i) { return self.normalize(i); }));

                hasMore = page.hasMore;
                effectiveCursorKey = page.nextCursorKey;
                effectiveCursorPrimaryKey = page.nextCursorPrimaryKey;

                if (!page.hasMore) break;
            }

            return {
                items: collected,
                hasMore: hasMore,
                nextCursorKey: effectiveCursorKey,
                nextCursorPrimaryKey: effectiveCursorPrimaryKey
            };
        },

        // ВАЖНО (Постраничная загрузка Журнала, см. отчёт по оптимизации журнала/
        // аналитики): HistoryState.allRecords с этого момента содержит только
        // ТЕКУЩУЮ страницу Журнала (History.loadRecords()/loadNextPage()), не весь
        // стор app_history. Все прочие потребители (геймификация, СК, задачи,
        // совещания, аналитика, knowledge, ai, smart-input и т.д.) продолжают
        // ожидать ПОЛНЫЙ массив проверок — поэтому источник правды для getAllSync/
        // getAllForAnalyticsSync теперь ВСЕГДА window.contractorArray (заполняется
        // целиком в session.service.js restoreSession() и в sync-engine.core.js
        // после pull), а не HistoryState.
        getAllSync: function () {
            return Array.isArray(window.contractorArray) ? window.contractorArray : [];
        },

        pushSync: function (item) {
            if (Array.isArray(window.contractorArray)) {
                window.contractorArray.push(window.RbiHistoryMemory ? window.RbiHistoryMemory.lighten(item) : item); // P2-0024
                return true;
            }
            return false;
        },

        setAllSync: function (arr) {
            var safeArr = Array.isArray(arr) ? arr : [];
            if (window.RbiHistoryMemory) safeArr.forEach(window.RbiHistoryMemory.lighten); // P2-0024: на месте, тот же массив
            window.contractorArray = safeArr;
            return window.contractorArray;
        },

        getAllForAnalyticsSync: function () {
            return Array.isArray(window.contractorArray) ? window.contractorArray : [];
        },

        getDefectCausesSync: function () {
            return Array.isArray(window.DEFECT_CAUSES) ? window.DEFECT_CAUSES : [];
        },

        getActive: async function () {
            var arr = await this.getAll();
            return arr.filter(function (i) {
                return i && i._deleted !== true && i.is_deleted !== true;
            });
        },

        getById: async function (id) {
            var arr = await this.getAll();
            return arr.find(function (i) { return i.id === id; }) || null;
        },

        save: async function (record) {
            if (!window.RBI.services.storage) throw new Error('[RBI.inspections] storage service недоступен');
            var now = nowIso();
            var normalized = this.normalize(Object.assign({}, record, {
                updatedAt: now,
                updated_at: now,
                source: 'local',
                syncStatus: 'not_synced',
                sync_status: 'not_synced'
            }));
            await window.RBI.services.storage.put(getHistoryStore(), normalized);
            markSyncDirty();
            if (window.RBI.services.contractorMetrics) {
                window.RBI.services.contractorMetrics.recalcTouched(normalized);
            }
            return normalized;
        },

        softDelete: async function (id) {
            var item = await this.getById(id);
            if (!item) return false;
            var now = nowIso();
            var deleted = this.normalize(Object.assign({}, item, {
                _deleted: true,
                is_deleted: true,
                deleted_at: now,
                updatedAt: now,
                updated_at: now,
                source: 'local',
                syncStatus: 'deleted_pending_sync',
                sync_status: 'deleted_pending_sync'
            }));
            await window.RBI.services.storage.put(getHistoryStore(), deleted);
            markSyncDirty();
            if (window.RBI.services.contractorMetrics) {
                window.RBI.services.contractorMetrics.recalcTouched(deleted);
            }
            return deleted;
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.inspections', window.RBI.services.inspections);
    }

    console.log('[RBI Service] inspections loaded');
}());
