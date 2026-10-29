/* Файл: js/services/knowledge.service.js */
/* Knowledge Service v0.1 — legacy wrapper над Knowledge-сторами IndexedDB */
/* Сторы: TWI_CARDS, CUSTOM_DOCS, CUSTOM_NODES, ETALON_ACTS, ETALON_DRAFT  */

(function () {
    'use strict';

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    /* Владение etalonActsArray (Реальная изоляция модулей, часть 3, Группа C,
       критичный шаг): перенесено 1:1 из js/core/bootstrap.js — сервис теперь
       единственный владелец объявления, window.etalonActsArray остаётся
       синхронизированной живой ссылкой для всех существующих потребителей. */
    window.etalonActsArray = window.etalonActsArray || [];

    var STORE_NAMES = {
        TWI_CARDS:   'twi_cards',
        CUSTOM_DOCS: 'custom_docs',
        CUSTOM_NODES:'custom_nodes',
        ETALON_ACTS: 'rbi_etalon_acts',
        ETALON_DRAFT:'rbi_etalon_draft'
    };

    function getStore(name) {
        if (typeof STORES !== 'undefined' && STORES[name]) return STORES[name];
        return STORE_NAMES[name] || name;
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function markDirty() {
        if (window.RBI.services.sync && typeof window.RBI.services.sync.markDirty === 'function') {
            window.RBI.services.sync.markDirty('knowledge');
        }
    }

    function requireStorage() {
        if (!window.RBI.services.storage) throw new Error('[RBI.knowledge] storage service недоступен');
    }

    function softDelete(item) {
        var now = nowIso();
        return Object.assign({}, item, {
            _deleted: true,
            is_deleted: true,
            deleted_at: now,
            updatedAt: now,
            updated_at: now,
            syncStatus: 'deleted_pending_sync',
            sync_status: 'deleted_pending_sync'
        });
    }

    window.RBI.services.knowledge = {

        /* ── TWI_CARDS ───────────────────────────────────────────────── */

        getTwiCards: async function () {
            requireStorage();
            return window.RBI.services.storage.getAll(getStore('TWI_CARDS'));
        },

        saveTwiCard: async function (card) {
            requireStorage();
            var now = nowIso();
            var toSave = Object.assign({}, card, { updatedAt: now, updated_at: now });
            await window.RBI.services.storage.put(getStore('TWI_CARDS'), toSave);
            markDirty();
            return toSave;
        },

        deleteTwiCard: async function (id) {
            requireStorage();
            var item = await window.RBI.services.storage.get(getStore('TWI_CARDS'), id);
            if (!item) return false;
            var deleted = softDelete(item);
            await window.RBI.services.storage.put(getStore('TWI_CARDS'), deleted);
            markDirty();
            return deleted;
        },

        /* ── CUSTOM_DOCS ─────────────────────────────────────────────── */

        getCustomDocs: async function () {
            requireStorage();
            return window.RBI.services.storage.getAll(getStore('CUSTOM_DOCS'));
        },

        saveCustomDoc: async function (doc) {
            requireStorage();
            var now = nowIso();
            var toSave = Object.assign({}, doc, { updatedAt: now, updated_at: now });
            await window.RBI.services.storage.put(getStore('CUSTOM_DOCS'), toSave);
            markDirty();
            return toSave;
        },

        deleteCustomDoc: async function (id) {
            requireStorage();
            var item = await window.RBI.services.storage.get(getStore('CUSTOM_DOCS'), id);
            if (!item) return false;
            var deleted = softDelete(item);
            await window.RBI.services.storage.put(getStore('CUSTOM_DOCS'), deleted);
            markDirty();
            return deleted;
        },

        /* ── CUSTOM_NODES ────────────────────────────────────────────── */

        getCustomNodes: async function () {
            requireStorage();
            return window.RBI.services.storage.getAll(getStore('CUSTOM_NODES'));
        },

        saveCustomNode: async function (node) {
            requireStorage();
            var now = nowIso();
            var toSave = Object.assign({}, node, { updatedAt: now, updated_at: now });
            await window.RBI.services.storage.put(getStore('CUSTOM_NODES'), toSave);
            markDirty();
            return toSave;
        },

        deleteCustomNode: async function (id) {
            requireStorage();
            var item = await window.RBI.services.storage.get(getStore('CUSTOM_NODES'), id);
            if (!item) return false;
            var deleted = softDelete(item);
            await window.RBI.services.storage.put(getStore('CUSTOM_NODES'), deleted);
            markDirty();
            return deleted;
        },

        /* ── ETALON_ACTS ─────────────────────────────────────────────── */

        getEtalonActs: async function () {
            requireStorage();
            return window.RBI.services.storage.getAll(getStore('ETALON_ACTS'));
        },

        saveEtalonAct: async function (act) {
            requireStorage();
            var now = nowIso();
            var toSave = Object.assign({}, act, { updatedAt: now, updated_at: now });
            await window.RBI.services.storage.put(getStore('ETALON_ACTS'), toSave);
            markDirty();
            return toSave;
        },

        deleteEtalonAct: async function (id) {
            requireStorage();
            var item = await window.RBI.services.storage.get(getStore('ETALON_ACTS'), id);
            if (!item) return false;
            var deleted = softDelete(item);
            await window.RBI.services.storage.put(getStore('ETALON_ACTS'), deleted);
            markDirty();
            return deleted;
        },

        /* ── ETALON_DRAFT ────────────────────────────────────────────── */

        getEtalonDraft: async function () {
            requireStorage();
            return window.RBI.services.storage.getAll(getStore('ETALON_DRAFT'));
        },

        saveEtalonDraft: async function (draft) {
            requireStorage();
            var now = nowIso();
            var toSave = Object.assign({}, draft, { updatedAt: now, updated_at: now });
            await window.RBI.services.storage.put(getStore('ETALON_DRAFT'), toSave);
            markDirty();
            return toSave;
        },

        /* ── SYSTEM_DOCS (статика из data/system_docs.js) ────────────── */

        getSystemDocs: function () {
            return typeof window.SYSTEM_DOCS !== 'undefined' ? window.SYSTEM_DOCS : [];
        },

        /* ── Синхронные геттеры/сеттеры живых in-memory структур ──────── */

        getTwiCardsSync: function () {
            return Array.isArray(window.customTwiCards) ? window.customTwiCards : [];
        },
        ensureTwiCardsSync: function () {
            if (!Array.isArray(window.customTwiCards)) window.customTwiCards = [];
            return window.customTwiCards;
        },
        setTwiCardsSync: function (arr) {
            var list = Array.isArray(arr) ? arr : [];
            if (typeof window.rbi_slimKnowledgeRecordForMemory === 'function') {
                list = list.map(window.rbi_slimKnowledgeRecordForMemory);
            }
            window.customTwiCards = list;
            return window.customTwiCards;
        },
        getCustomDocsSync: function () {
            return Array.isArray(window.customDocs) ? window.customDocs : [];
        },
        ensureCustomDocsSync: function () {
            if (!Array.isArray(window.customDocs)) window.customDocs = [];
            return window.customDocs;
        },
        setCustomDocsSync: function (arr) {
            var list = Array.isArray(arr) ? arr : [];
            if (typeof window.rbi_slimKnowledgeRecordForMemory === 'function') {
                list = list.map(window.rbi_slimKnowledgeRecordForMemory);
            }
            window.customDocs = list;
            return window.customDocs;
        },
        getCustomNodesSync: function () {
            return Array.isArray(window.customNodes) ? window.customNodes : [];
        },
        ensureCustomNodesSync: function () {
            if (!Array.isArray(window.customNodes)) window.customNodes = [];
            return window.customNodes;
        },
        setCustomNodesSync: function (arr) {
            window.customNodes = Array.isArray(arr) ? arr : [];
            return window.customNodes;
        },
        getEtalonActsSync: function () {
            return Array.isArray(window.etalonActsArray) ? window.etalonActsArray : [];
        },
        ensureEtalonActsSync: function () {
            if (!Array.isArray(window.etalonActsArray)) window.etalonActsArray = [];
            return window.etalonActsArray;
        },
        setEtalonActsSync: function (arr) {
            window.etalonActsArray = Array.isArray(arr) ? arr : [];
            return window.etalonActsArray;
        },
        getTwiTypeSync: function () {
            return window.currentTwiType || 'INSPECTOR';
        },
        getTwiStepCountSync: function () {
            return window.twiStepCount || 0;
        },
        setTwiStepCountSync: function (n) {
            window.twiStepCount = n;
            return window.twiStepCount;
        },

        openTwiViewer: function (id) {
            if (typeof window.openTwiViewer !== 'function') {
                console.warn('[RBI Knowledge Service] window.openTwiViewer недоступен');
                return;
            }
            return window.openTwiViewer(id);
        },

        renderTwiList: function () {
            if (typeof window.renderTwiList !== 'function') {
                console.warn('[RBI Knowledge Service] window.renderTwiList недоступен');
                return;
            }
            return window.renderTwiList();
        },

        renderDocsList: function () {
            if (typeof window.renderDocsList !== 'function') {
                console.warn('[RBI Knowledge Service] window.renderDocsList недоступен');
                return;
            }
            return window.renderDocsList();
        },

        renderNodesList: function () {
            if (typeof window.renderNodesList !== 'function') {
                console.warn('[RBI Knowledge Service] window.renderNodesList недоступен');
                return;
            }
            return window.renderNodesList();
        },

        openTwiConstructor: function (editId) {
            if (typeof window.openTwiConstructor !== 'function') {
                console.warn('[RBI Knowledge Service] window.openTwiConstructor недоступен');
                return;
            }
            return window.openTwiConstructor(editId);
        },

        openDocViewer: function (id) {
            if (typeof window.openDocViewer !== 'function') {
                console.warn('[RBI Knowledge Service] window.openDocViewer недоступен');
                return;
            }
            return window.openDocViewer(id);
        },

        openNodeViewer: function (id) {
            if (typeof window.openNodeViewer !== 'function') {
                console.warn('[RBI Knowledge Service] window.openNodeViewer недоступен');
                return;
            }
            return window.openNodeViewer(id);
        },

        openNodeConstructor: function (id) {
            if (typeof window.openNodeConstructor !== 'function') {
                console.warn('[RBI Knowledge Service] window.openNodeConstructor недоступен');
                return;
            }
            return window.openNodeConstructor(id);
        },

        deleteCustomDoc: function (id) {
            if (typeof window.deleteCustomDoc !== 'function') {
                console.warn('[RBI Knowledge Service] window.deleteCustomDoc недоступен');
                return;
            }
            return window.deleteCustomDoc(id);
        },

        reloadReferenceMemory: function () {
            if (typeof window.rbi_reloadReferenceMemory !== 'function') {
                // Вызывают с .then() — не возвращать undefined
                return Promise.resolve();
            }
            return Promise.resolve(window.rbi_reloadReferenceMemory());
        },

        getMagicTwiCandidates: function () {
            // До loadModule('knowledge') window.* ещё нет (фаза 1 без статичного тега).
            // Контракт: всегда массив — иначе tasks weekly plan падает на .length.
            if (typeof window.getMagicTwiCandidates !== 'function') {
                return [];
            }
            var list = window.getMagicTwiCandidates();
            return Array.isArray(list) ? list : [];
        },

        populateTwiItemSelect: function (itemId) {
            if (typeof window.populateTwiItemSelect !== 'function') {
                console.warn('[RBI Knowledge Service] window.populateTwiItemSelect недоступен');
                return;
            }
            return window.populateTwiItemSelect(itemId);
        },

        changeTwiType: function (type) {
            if (typeof window.changeTwiType !== 'function') {
                console.warn('[RBI Knowledge Service] window.changeTwiType недоступен');
                return;
            }
            return window.changeTwiType(type);
        },

        renderGoodPhoto: function (src) {
            if (typeof window.renderGoodPhoto !== 'function') {
                console.warn('[RBI Knowledge Service] window.renderGoodPhoto недоступен');
                return;
            }
            return window.renderGoodPhoto(src);
        },

        renderBadPhoto: function (src) {
            if (typeof window.renderBadPhoto !== 'function') {
                console.warn('[RBI Knowledge Service] window.renderBadPhoto недоступен');
                return;
            }
            return window.renderBadPhoto(src);
        },

        refreshTwiPhotoCandidates: function (opts) {
            if (typeof window.refreshTwiPhotoCandidates !== 'function') {
                console.warn('[RBI Knowledge Service] window.refreshTwiPhotoCandidates недоступен');
                return;
            }
            return window.refreshTwiPhotoCandidates(opts);
        },

        cycleTwiConstructorPhoto: function (side) {
            if (typeof window.cycleTwiConstructorPhoto !== 'function') {
                console.warn('[RBI Knowledge Service] window.cycleTwiConstructorPhoto недоступен');
                return;
            }
            return window.cycleTwiConstructorPhoto(side);
        },

        openItemHelp: function (id, event, ctx) {
            if (typeof window.openItemHelpMenu !== 'function') {
                console.warn('[RBI Knowledge Service] window.openItemHelpMenu недоступен');
                return;
            }
            return window.openItemHelpMenu(id, event, ctx);
        },

        findAndOpenND: function (normText) {
            if (typeof window.findAndOpenND !== 'function') {
                if (typeof window.showToast === 'function') {
                    window.showToast('База знаний недоступна');
                } else {
                    console.warn('[RBI Knowledge Service] window.findAndOpenND недоступен');
                }
                return;
            }
            return window.findAndOpenND(normText);
        },

        requireEditRight: function () {
            var perms = window.RBI.services.permissions;
            if (!perms || typeof perms.canEditKnowledgeBase !== 'function') {
                console.warn('[RBI Knowledge Service] permissions service недоступен');
                return false;
            }
            if (!perms.canEditKnowledgeBase()) {
                if (typeof window.showToast === 'function') {
                    window.showToast('⛔ Ваша роль не позволяет редактировать базу знаний');
                }
                return false;
            }
            return true;
        },

        // P2-0061: (запись, вид) — по общему правилу; (ФИО) — как раньше
        canDeleteItem: function (ownerName, kindName) {
            var perms = window.RBI.services.permissions;
            if (!perms || typeof perms.canDelete !== 'function') {
                console.warn('[RBI Knowledge Service] permissions service недоступен');
                return false;
            }
            return perms.canDelete(ownerName, kindName);
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.knowledge', window.RBI.services.knowledge);
    }

    console.log('[RBI Service] knowledge loaded');
}());
