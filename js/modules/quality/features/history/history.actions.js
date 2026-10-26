/**
 * history.actions.js
 * Бизнес-действия модуля History.
 *
 * Все операции с данными — через ctx.inspections (после bindCtx)/ctx.storage,
 * с fallback на window.dbPut/STORES для обратной совместимости (пока storage
 * не гарантированно доступен на момент вызова из inline-обработчиков).
 */

import { HistoryState, deletedHistoryCopy, deletedHistoryFlags } from './history.state.js';
import { HistoryRender } from './history.render.js';

// Фаза 91 (перенесено из history.legacy.js): единая точка доступа к IndexedDB
// через StorageService или fallback на глобальные dbPut/STORES.
function _storage(ctx) {
    if (ctx && ctx.storage) {
        return ctx.storage;
    }
    if (window.RBI && window.RBI.services && window.RBI.services.storage) {
        return window.RBI.services.storage;
    }
    return {
        stores: function () { return typeof STORES !== 'undefined' ? STORES : {}; },
        get: function (store, key) { return dbGet(store, key); },
        getAll: function (store) { return dbGetAll(store); },
        put: function (store, data) { return dbPut(store, data); }
    };
}

// Фаза 121 (перенесено из history.legacy.js): единая точка вызова
// синхронизации через SyncService или fallback на глобальный triggerSync.
function _sync(mode) {
    var m = mode || 'silent';
    if (HistoryActions._ctx && HistoryActions._ctx.sync) {
        return HistoryActions._ctx.sync.trigger(m);
    }
    if (window.RBI && window.RBI.services && window.RBI.services.sync) {
        return window.RBI.services.sync.trigger(m);
    }
    if (typeof triggerSync === 'function') return triggerSync(m);
    return Promise.resolve(false);
}

// Единая точка доступа к permissions: приоритет ctx.permissions,
// затем fallback на window.RBI.services.permissions.
function _permissions(ctx) {
    return (ctx && ctx.permissions) || (window.RBI && window.RBI.services && window.RBI.services.permissions);
}

export const HistoryActions = {

    _ctx: null,

    bindCtx(ctx) {
        this._ctx = ctx;
    },

    /**
     * Загрузить ПЕРВУЮ страницу Журнала через InspectionService.getPage()
     * (курсор по индексу by_date — DB_VERSION 21, storage-db.core.js), а не
     * весь стор app_history через getActive()/getAll(). Заменяет предыдущий
     * подход «достать всё сразу» — см. отчёт по оптимизации журнала/аналитики.
     * Обновляет HistoryState и эмитит history:loaded.
     */
    async loadRecords() {
        try {
            const svc = this._ctx && this._ctx.inspections;
            if (!svc) {
                console.warn('[HistoryActions] inspection service недоступен');
                return;
            }
            HistoryState.resetPagination();

            // P2-0024: история уже целиком в памяти (window.contractorArray, облегчённая — содержимое то же).
            // Список берём оттуда — без второй копии из базы; порядок как у индекса by_date (новые сверху,
            // при равной дате — больший id выше). Раньше при свёрнутых объектах фоновая догрузка всё равно
            // подтягивала всю историю второй копией (заголовки объектов считают все записи периода).
            const mem = Array.isArray(window.contractorArray) ? window.contractorArray : null;
            if (mem && mem.length) {
                HistoryState.setRecordsFromMemory(mem);
                HistoryState.setPageState({ pageCursorKey: null, pageCursorPrimaryKey: null, pageHasMore: false });
                const ev = this._ctx && this._ctx.events;
                if (ev && typeof ev.emit === 'function') ev.emit('history:loaded', { count: HistoryState.allRecords.length });
                return;
            }

            // Первая прогрузка: добираем страницы, пока не наберём
            // initialObjectTarget уникальных объектов (площадок) или не кончатся
            // записи — чтобы верхний список открывался сразу с ~20 объектами
            // без ручной пагинации.
            const targetObjects = HistoryState.initialObjectTarget || 20;
            const maxPages = 12;
            let collected = [];
            let cursorKey = null;
            let cursorPrimaryKey = null;
            let hasMore = false;

            const uniqueObjectCount = (arr) => {
                const names = Object.create(null);
                let n = 0;
                for (let i = 0; i < arr.length; i++) {
                    const p = (arr[i] && (arr[i].projectName || arr[i].project_display_name)) || 'Без объекта';
                    if (!names[p]) {
                        names[p] = true;
                        n++;
                    }
                }
                return n;
            };

            for (let pageNo = 0; pageNo < maxPages; pageNo++) {
                const page = await svc.getPage({
                    limit: HistoryState.pageSize,
                    cursorKey: cursorKey,
                    cursorPrimaryKey: cursorPrimaryKey
                });
                const items = page.items || [];
                if (items.length) collected = collected.concat(items);
                cursorKey = page.nextCursorKey;
                cursorPrimaryKey = page.nextCursorPrimaryKey;
                hasMore = !!page.hasMore;
                if (!hasMore) break;
                if (uniqueObjectCount(collected) >= targetObjects) break;
            }

            HistoryState.setRecords(collected);
            HistoryState.setPageState({
                pageCursorKey: cursorKey,
                pageCursorPrimaryKey: cursorPrimaryKey,
                pageHasMore: hasMore
            });

            const events = this._ctx && this._ctx.events;
            if (events && typeof events.emit === 'function') {
                events.emit('history:loaded', { count: HistoryState.allRecords.length });
            }
        } catch (e) {
            console.error('[HistoryActions] ошибка loadRecords:', e);
        }
    },

    /**
     * Дозагрузить СЛЕДУЮЩУЮ страницу Журнала (курсор продолжается с места,
     * где остановилась предыдущая страница) и добросить её к уже показанным
     * записям. Не перечитывает весь массив — append в state + DOM-patch
     * (HistoryRender.appendPage), без полной пересборки списка.
     */
    async loadNextPage() {
        if (HistoryState.isLoadingPage || !HistoryState.pageHasMore) return;
        const svc = this._ctx && this._ctx.inspections;
        if (!svc) return;

        try {
            HistoryState.setPageState({ isLoadingPage: true });
            const gen = HistoryState.listGen;
            const page = await svc.getPage({
                limit: HistoryState.pageSize,
                cursorKey: HistoryState.pageCursorKey,
                cursorPrimaryKey: HistoryState.pageCursorPrimaryKey
            });
            // P2-0024 доработка 1 (ревью №3): пока шла порция, список заменили (история из памяти, удаление) —
            // порцию не добавляем (иначе дубли строк); курсор не двигаем.
            if (HistoryState.listGen !== gen) {
                if (HistoryState.isLoadingPage) HistoryState.setPageState({ isLoadingPage: false });
                return;
            }
            const newItems = page.items || [];
            HistoryState.appendRecords(newItems);
            HistoryState.setPageState({
                pageCursorKey: page.nextCursorKey,
                pageCursorPrimaryKey: page.nextCursorPrimaryKey,
                pageHasMore: page.hasMore,
                isLoadingPage: false
            });
            if (typeof HistoryRender.appendPage === 'function') {
                HistoryRender.appendPage(newItems);
            } else {
                HistoryRender.render();
            }
        } catch (e) {
            console.error('[HistoryActions] ошибка loadNextPage:', e);
            HistoryState.setPageState({ isLoadingPage: false });
        }
    },

    /**
     * Мягкое удаление записей по заданным ID (программный вызов, минуя чекбоксы).
     * Делегирует в this.deleteSelectedHistory, которая читает выбор из DOM
     * (getSelectedHistoryIds) — полный переход на явную передачу ids
     * без чтения DOM внутри deleteSelectedHistory — следующая фаза.
     */
    async softDeleteSelected(ids) {
        try {
            if (!Array.isArray(ids) || ids.length === 0) return;
            HistoryState.setSelectedIds(ids);

            await HistoryActions.deleteSelectedHistory();

            const events = this._ctx && this._ctx.events;
            if (events && typeof events.emit === 'function') {
                events.emit('history:deleted', { ids });
            }
        } catch (e) {
            console.error('[HistoryActions] ошибка softDeleteSelected:', e);
        }
    },

    /**
     * Загрузить больше групп (пагинация).
     * Увеличивает visibleGroupCount и перерисовывает.
     */
    loadMore() {
        HistoryState.setVisibleGroupCount(HistoryState.visibleGroupCount + 15);
        HistoryRender.render();
    },

    /**
     * Возвращает массив ID выбранных (отмеченных галочками) проверок.
     * Перенесено из history.legacy.js (бывший app.js, строка 2483).
     * ID — текстовые строки (UUID из облака).
     * P2-0026: без повторов — на ПК галочки есть и в таблице, и в скрытом телефонном списке
     * («Выбрать все» ставит обе): иначе печать и удаление шли по каждой проверке дважды.
     */
    getSelectedHistoryIds() {
        var seen = {};
        return Array.from(document.querySelectorAll('.hist-checkbox:checked')).map(function (cb) {
            return cb.value;
        }).filter(function (id) {
            if (seen[id]) return false;
            seen[id] = true;
            return true;
        });
    },

    /**
     * Ставит/снимает все галочки в списке истории.
     * Перенесено из history.legacy.js (бывший app.js, строка 2478).
     * Вызывается из inline handler: onchange="toggleAllHistory(this)"
     */
    toggleAllHistory(checkbox) {
        // P2-0024: свёрнутые объекты рисуются при раскрытии — перед «выбрать все» дорисовать их.
        if (checkbox && checkbox.checked && typeof window.rbiHistMaterializeAllProjects === 'function') {
            window.rbiHistMaterializeAllProjects();
        }
        var checkboxes = document.querySelectorAll('.hist-checkbox');
        checkboxes.forEach(function (cb) {
            cb.checked = checkbox.checked;
        });
    },

    /**
     * Экспортирует выбранные проверки в CSV-файл.
     * Перенесено из history.legacy.js (бывший app.js, строка 2566).
     * Вызывается из inline handler: onclick="exportSelectedCsv()"
     * Зависимости: getSelectedHistoryIds, HistoryState.allRecords, exportToCSV, downloadFile, showToast
     */
    exportSelectedCsv() {
        var ids = HistoryActions.getSelectedHistoryIds();
        if (ids.length === 0) return showToast('Выберите элементы для выгрузки');
        var selectedData = HistoryState.allRecords.filter(function (i) { return ids.includes(i.id); });
        var csv = exportToCSV(selectedData);
        if (csv) downloadFile(csv, 'rbi_selected_' + new Date().toLocaleDateString() + '.csv', 'text/csv');
    },

    /**
     * Печать PDF «Акт осмотра» по выбранным проверкам.
     */
    printSelectedInspectionActs() {
        var ids = HistoryActions.getSelectedHistoryIds();
        if (ids.length === 0) return showToast('Выберите проверки для печати акта');
        if (typeof window.printInspectionActs === 'function') {
            return window.printInspectionActs(ids, 'browser');
        }
        return showToast('⚠️ Модуль печати недоступен');
    },

    /**
     * Soft delete выбранных проверок.
     * Перенесено из history.legacy.js (бывший app.js, строка 2488).
     * Вызывается из inline handler: onclick="deleteSelectedHistory()"
     * Зависимости: getSelectedHistoryIds, HistoryState.allRecords, RbiRoles,
     *              this._ctx.storage/dbPut/STORES, HistoryRender.render, renderCurrentAnalyticsTab,
     *              updateDataSummary, triggerSync, gameForceUpdatePlan, showToast
     */
    async deleteSelectedHistory() {
        var ids = HistoryActions.getSelectedHistoryIds();
        if (ids.length === 0) return showToast('Сначала выберите элементы галочками');

        var perm = _permissions(HistoryActions._ctx);

        if (perm && !perm.canCreate()) {
            return showToast('⛔ Ваша роль не позволяет удалять проверки');
        }

        var canDeleteAll = true;
        for (var k = 0; k < ids.length; k++) {
            var id = ids[k];
            var found = HistoryState.allRecords.find(function (i) { return String(i.id) === String(id); });
            if (!found) continue;
            var ownerName = found.inspectorName || found.inspector_name || '';
            if (perm && !perm.canDelete(ownerName)) {
                canDeleteAll = false;
                break;
            }
        }

        if (!canDeleteAll) {
            return showToast('⚠️ Инженер может удалить только свои проверки. Снимите галочки с чужих актов.');
        }

        if (!confirm('Удалить выбранные проверки (' + ids.length + ' шт)?')) return;

        var storage = _storage(HistoryActions._ctx);
        var contractorMetricsSvc = (HistoryActions._ctx && HistoryActions._ctx.contractorMetrics)
            || (window.RBI && window.RBI.services && window.RBI.services.contractorMetrics);

        // P2-0025: сначала сохранить копию с пометкой удаления, затем пометить запись в памяти
        // (она общая с contractorArray). Сбой записи — эта и следующие записи в памяти не помечаются.
        var deletedCount = 0;
        var deletedIds = Object.create(null);
        var failed = false;
        for (var j = 0; j < ids.length; j++) {
            var delId = ids[j];
            var item = HistoryState.allRecords.find(function (i) { return String(i.id) === String(delId); });
            if (item) {
                var marked = deletedHistoryCopy(item, new Date().toISOString());
                try {
                    await storage.put(storage.stores().HISTORY, marked);
                } catch (eDel) {
                    console.error('[HistoryActions] удаление: запись не сохранена', delId, eDel);
                    failed = true;
                    break;
                }
                Object.assign(item, deletedHistoryFlags(marked));
                deletedIds[String(item.id)] = true;
                deletedCount++;
                if (contractorMetricsSvc) contractorMetricsSvc.recalcTouched(item);
            }
        }

        var memWasList = HistoryState.memorySource && HistoryState.memorySource === window.contractorArray;
        if (Array.isArray(window.contractorArray)) {
            // по id: при порционном списке из базы записи в памяти — другие объекты
            window.contractorArray = window.contractorArray.filter(function (i) { return !i._deleted && !deletedIds[String(i && i.id)]; });
        }
        if (memWasList) HistoryState.setRecordsFromMemory(window.contractorArray);
        else HistoryState.setRecords(HistoryState.allRecords.filter(function (i) { return !i._deleted; }));

        var selectAllCb = document.getElementById('hist-select-all');
        if (selectAllCb) selectAllCb.checked = false;

        // P2-0026: через window.renderHistoryTab — на ПК он перерисовывает и таблицу «Проверки» (обёртка analytics.desktop.render.js)
        if (typeof window.renderHistoryTab === 'function') window.renderHistoryTab(); else HistoryRender.render();

        if (typeof renderCurrentAnalyticsTab === 'function') {
            renderCurrentAnalyticsTab();
        }
        updateDataSummary();

        if (deletedCount > 0) {
            localStorage.setItem('rbi_cloud_dirty', '1');
            _sync('silent');
        }

        if (typeof renderCurrentAnalyticsTab === 'function') renderCurrentAnalyticsTab();
        if (typeof gameForceUpdatePlan === 'function') gameForceUpdatePlan(true);
        updateDataSummary();
        if (failed) {
            showToast('⚠️ Удалено ' + deletedCount + ' из ' + ids.length + ': не удалось сохранить на устройстве, попробуйте ещё раз');
        } else {
            showToast('✅ Удалено успешно (' + ids.length + ' шт)');
        }
    },

    /**
     * P2-0023 доработка 2: проверка не отправляется — фото пункта нет на устройстве, автоповторы исчерпаны.
     * Показываем причину и даём выбор «Отправить без этого фото» (пропавшие фото убираются из проверки
     * и запоминаются в missingPhotos, остальное уходит обычной синхронизацией). Иначе — переснять фото в проверке.
     */
    async resolveSyncAttention(id) {
        var rp = window.RbiSyncRetryPolicy;
        if (!rp) return;
        var storage = _storage(HistoryActions._ctx);
        var rec = HistoryState.allRecords.find(function (i) { return String(i.id) === String(id); });
        if (!rec) {
            try { rec = await storage.get(storage.stores().HISTORY, id); } catch (_e) { rec = null; }
        }
        if (!rec || !rp.isAttention(rec)) return;
        var reason = rec.syncBlockReason || rec.sync_block_reason || 'Не отправлено: фото пункта не найдено на устройстве';
        if (!confirm(reason + '.\n\nОтправить проверку без этого фото? Остальные фото и результаты уйдут на сервер.\n\n«Отмена» — оставить как есть (можно открыть проверку и переснять фото).')) return;
        var dropped = rp.dropMissingPhotos(rec, new Date().toISOString());
        rec.updatedAt = new Date().toISOString();
        rec.updated_at = rec.updatedAt;
        await storage.put(storage.stores().HISTORY, rec);
        if (Array.isArray(window.contractorArray)) {
            var idx = window.contractorArray.findIndex(function (x) { return String(x.id) === String(rec.id); });
            if (idx >= 0) window.contractorArray[idx] = rec;
        }
        HistoryRender.render();
        localStorage.setItem('rbi_cloud_dirty', '1');
        showToast('Отправляем без ' + (dropped > 1 ? dropped + ' фото' : 'этого фото') + '…');
        _sync('manual');
    },

    /**
     * Делегирование: loadHistoryData → HistoryActions.loadRecords.
     * Перенесено из history.legacy.js (Блок 12 Integration).
     */
    loadHistoryData() {
        return HistoryActions.loadRecords();
    }
};

if (typeof window !== 'undefined') {
    window.HistoryActions = HistoryActions;

    // Прокси для обратной совместимости: inline-обработчики index.html
    // и внешние вызовы из game.js/export.js/sync.js используют глобальные имена.
    window.getSelectedHistoryIds = HistoryActions.getSelectedHistoryIds;
    window.toggleAllHistory = HistoryActions.toggleAllHistory;
    window.exportSelectedCsv = HistoryActions.exportSelectedCsv;
    window.printSelectedInspectionActs = HistoryActions.printSelectedInspectionActs;
    window.deleteSelectedHistory = HistoryActions.deleteSelectedHistory;
    window.loadHistoryData = HistoryActions.loadHistoryData;
    window.rbiHistoryResolveAttention = HistoryActions.resolveSyncAttention;
}

console.log('[HistoryActions] history.actions.js loaded');
