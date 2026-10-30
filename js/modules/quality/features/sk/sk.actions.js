/**
 * sk.actions.js
 * Бизнес-действия модуля SK (Стройконтроль). Реализация перенесена 1:1 из
 * sk.legacy.js (удалён) — по образцу settings.actions.js.
 *
 * Содержит: приватные утилиты доступа к сервисам, module-scope переменные,
 * внутренние вспомогательные функции, CRUD/импорт/аналитика (window.sk_*),
 * facade-объект skModule (реестр 'sk'), fallback-заглушку 'module.sk',
 * и SKActions — фасад для sk.module.js (ctx.sk после bindCtx).
 *
 * SKActions вызывает sk.service.js через ctx.sk (после bindCtx),
 * с fallback на window.RBI.services.sk для обратной совместимости.
 * Обновляет SKState и эмитит события через ctx.events || window.RBI.events.
 */

import { SKState } from './sk.state.js';
import {
    sk_renderContractorQueueBanner,
    sk_renderMainTab,
    sk_renderVolumes,
    sk_renderDashboard,
    sk_renderHrTab,
    sk_showMappingModal,
    sk_showNormalizationModal,
    sk_closeContractorLinkModal,
    sk_fillContractorSuggestion
} from './sk.render.js';
import { skRegisterImport, sk_showLinksSummary, sk_renderLinks } from './sk.links.js';

function _t(key, fallback, vars) {
    try {
        var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
        if (i18n && typeof i18n.t === 'function') {
            var s = vars ? i18n.t(key, vars) : i18n.t(key);
            if (s && s !== key) return s;
        }
    } catch (e) {}
    if (vars && fallback) {
        return String(fallback).replace(/\{(\w+)\}/g, function (_m, k) {
            return vars[k] != null ? String(vars[k]) : '';
        });
    }
    return fallback;
}

function _objects() {
    try {
        if (SKActions._ctx && SKActions._ctx.services && SKActions._ctx.services.objects) {
            return SKActions._ctx.services.objects;
        }
        if (SKActions._ctx && SKActions._ctx.objects) {
            return SKActions._ctx.objects;
        }
    } catch (e) {}
    return (window.RBI && window.RBI.services && window.RBI.services.objects) || null;
}
function _contractors() {
    try {
        if (SKActions._ctx && SKActions._ctx.services && SKActions._ctx.services.contractors) {
            return SKActions._ctx.services.contractors;
        }
        if (SKActions._ctx && SKActions._ctx.contractors) {
            return SKActions._ctx.contractors;
        }
    } catch (e) {}
    return (window.RBI && window.RBI.services && window.RBI.services.contractors) || null;
}
function _objectList() {
    var o = _objects();
    if (!o) return [];
    if (typeof o.list === 'function') {
        var l = o.list();
        return Array.isArray(l) ? l : [];
    }
    return Array.isArray(o.objects) ? o.objects : [];
}
function _contractorList() {
    var c = _contractors();
    if (!c) return [];
    if (typeof c.list === 'function') {
        var l = c.list();
        return Array.isArray(l) ? l : [];
    }
    return Array.isArray(c.contractors) ? c.contractors : [];
}

// Фаза (перенос из sk.legacy.js): единая точка доступа к настройкам через
// SettingsService с fallback.
function _getSetting(key) {
    return ((SKActions._ctx && SKActions._ctx.settings) || window.RBI.services.settings).get(key);
}

// Фаза (перенос из sk.legacy.js): изоляция isDemoMode через AppModeService с fallback.
function _isDemoMode() {
    return ((SKActions._ctx && SKActions._ctx.appMode) || window.RBI.services.appMode).isDemo();
}

function _gameLogAction(actionType, targetId) {
    if (SKActions._ctx && SKActions._ctx.game) {
        return SKActions._ctx.game.logAction(actionType, targetId);
    }
    if (window.RBI && window.RBI.services && window.RBI.services.game) {
        return window.RBI.services.game.logAction(actionType, targetId);
    }
    if (typeof gameLogAction === 'function') return gameLogAction(actionType, targetId);
}

// Фаза (перенос из sk.legacy.js): единая точка доступа к данным проверок через
// InspectionService.
function _inspections() {
    return ((SKActions._ctx && SKActions._ctx.inspections) || window.RBI.services.inspections).getAllSync();
}

// Фаза (перенос из sk.legacy.js): единая точка доступа к syncConfig через
// SyncService или fallback.
function _syncConfig() {
    if (SKActions._ctx && SKActions._ctx.sync && typeof SKActions._ctx.sync.getConfig === 'function') {
        return SKActions._ctx.sync.getConfig();
    }
    if (window.RBI && window.RBI.services && window.RBI.services.sync &&
        typeof window.RBI.services.sync.getConfig === 'function') {
        return window.RBI.services.sync.getConfig();
    }
    return window.syncConfig || {};
}

// Фаза (перенос из sk.legacy.js): единая точка доступа к IndexedDB через
// StorageService или fallback.
function _storage() {
    if (SKActions._ctx && SKActions._ctx.storage) {
        return SKActions._ctx.storage;
    }
    if (window.RBI && window.RBI.services && window.RBI.services.storage) {
        return window.RBI.services.storage;
    }
    return {
        stores: function() { return typeof STORES !== 'undefined' ? STORES : {}; },
        get: function(store, key) { return dbGet(store, key); },
        getAll: function(store) { return dbGetAll(store); },
        put: function(store, data) { return dbPut(store, data); },
        putBatch: function(store, items) {
            return ((SKActions._ctx && SKActions._ctx.storage) || window.RBI.services.storage).putBatch(store, items);
        },
        delete: function(store, key) { return dbDelete(store, key); }
    };
}

// Единая точка доступа к живому in-memory массиву задач через TaskService.
function _getTasks() {
    return ((SKActions._ctx && SKActions._ctx.tasks) || window.RBI.services.tasks).getTasksSync();
}

function _templates() {
    return (SKActions._ctx && SKActions._ctx.templates) || window.RBI.services.templates;
}

function _setTasks(arr) {
    return ((SKActions._ctx && SKActions._ctx.tasks) || window.RBI.services.tasks).setTasksSync(arr);
}

// Фаза (перенос из sk.legacy.js): единая точка вызова синхронизации через
// SyncService или fallback.
function _sync(mode) {
    var m = mode || 'silent';
    if (SKActions._ctx && SKActions._ctx.sync) {
        return SKActions._ctx.sync.trigger(m);
    }
    if (window.RBI && window.RBI.services && window.RBI.services.sync) {
        return window.RBI.services.sync.trigger(m);
    }
    if (typeof triggerSync === 'function') return triggerSync(m);
    return Promise.resolve(false);
}

// =========================================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ МОДУЛЯ
// =========================================================================
window.skRecords = window.skRecords || [];
window.skVolumes = window.skVolumes || {};
window.skMapping = window.skMapping || null;
window.skContractorMap = window.skContractorMap || {};
window.skCategoryMap = window.skCategoryMap || {};
window.skCurrentSubTab = window.skCurrentSubTab || 'dashboard';
window.skHrSortBy = window.skHrSortBy || 'kpi';
window.skHrSortDesc = (typeof window.skHrSortDesc !== 'undefined') ? window.skHrSortDesc : true;

// Флаг разделяется с ai.actions.js (sk_autoMapCategories) — только через window.
if (typeof window.skAiRunning !== 'boolean') window.skAiRunning = false;

var SK_FIELDS = [
    { id: 'row_number', name: '№ п/п' },
    { id: 'number', name: '№ замечания' },
    { id: 'text', name: 'Замечание' },
    { id: 'category', name: 'Категория замечания' },
    { id: 'date_issued', name: 'Дата выдачи' },
    { id: 'contractor', name: 'Ответственная организация' },
    { id: 'contractor_representative', name: 'Представитель ответственной организации' },
    { id: 'deadline', name: 'Требуемый срок устранения' },
    { id: 'status', name: 'Отметка об устранении' },
    { id: 'date_resolved', name: 'Фактическая дата устранения' },
    { id: 'inspector', name: 'Представитель организации выдавший предписание' },
    { id: 'closed_by', name: 'Представитель организации снявший предписание' },
    { id: 'structure', name: 'Элемент структуры' },
    { id: 'project_loc', name: 'Расположение в проекте' }
];

// =========================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (не экспортируемые)
// =========================================================================

function sk_getCurrentUserName() {
    var candidates = [
        _syncConfig().engineerName,
        _syncConfig().inspectorName,
        _getSetting('engineerName'),
        _getSetting('inspectorName'),
        _getSetting('userName'),
        document.getElementById('inp-inspector') && document.getElementById('inp-inspector').value && document.getElementById('inp-inspector').value.trim(),
        document.getElementById('sync-engineer-name') && document.getElementById('sync-engineer-name').value && document.getElementById('sync-engineer-name').value.trim(),
        document.getElementById('cloud-engineer-name') && document.getElementById('cloud-engineer-name').value && document.getElementById('cloud-engineer-name').value.trim()
    ];

    for (var i = 0; i < candidates.length; i++) {
        var clean = String(candidates[i] || '').trim();
        if (clean && clean !== 'Инженер' && clean !== 'undefined' && clean !== 'null') {
            return clean;
        }
    }

    try {
        var saved = JSON.parse(localStorage.getItem('rbi_sync_config') || '{}');
        var savedName = String(saved.engineerName || saved.inspectorName || '').trim();
        if (savedName && savedName !== 'Инженер') return savedName;
    } catch (e) {}

    return 'Не указан';
}

function sk_getCurrentRole() {
    var permSvc = (SKActions._ctx && SKActions._ctx.permissions) || window.RBI.services.permissions;
    return permSvc ? permSvc.getCurrentRole() : 'guest';
}

function sk_canUploadRecords() {
    var permSvc = (SKActions._ctx && SKActions._ctx.permissions) || window.RBI.services.permissions;
    return permSvc ? permSvc.canManageSK() : false;
}

function sk_canDeleteRecord(record) {
    if (!record) return false;
    var permSvc = (SKActions._ctx && SKActions._ctx.permissions) || window.RBI.services.permissions;
    if (permSvc && permSvc.isAdmin()) return true;
    var role = sk_getCurrentRole();
    if (role !== 'engineer') return false;
    var currentUser = sk_getCurrentUserName();
    var uploadedBy = record.uploaded_by || record.sk_uploaded_by || record.imported_by || '';
    return uploadedBy === currentUser;
}

function sk_filterRecordsByAccess(records) {
    if (!Array.isArray(records)) return [];
    var permSvc = (SKActions._ctx && SKActions._ctx.permissions) || (window.RBI && window.RBI.services && window.RBI.services.permissions);
    if (!permSvc) return [];

    return permSvc.filterByDataScope(records, {
        projectField: ['project_canonical_key', 'canonical_key', 'projectName', 'project'],
        contractorField: ['contractor_canonical_key', 'contractor', 'contractorName', 'contractor_name'],
        ownerField: ['uploaded_by', 'sk_uploaded_by', 'imported_by']
    });
}

async function sk_getPendingContractorsQueue() {
    try {
        var queue = await _storage().getAll(_storage().stores().CONTRACTOR_QUEUE) || [];
        var pending = queue.filter(function (q) {
            return q && q.status !== 'linked' && q.status !== 'resolved' && q.status !== 'rejected';
        });
        var map = new Map();
        pending.forEach(function (item) {
            var key = String(item.raw_name || '').trim().toLowerCase();
            if (key && !map.has(key)) map.set(key, item);
        });
        return Array.from(map.values());
    } catch (e) {
        console.warn('[ПК СК] Не удалось прочитать очередь подрядчиков:', e);
        return [];
    }
}

function sk_cleanIssueNumber(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim().replace(/\s+/g, '').replace(/[^\dA-Za-zА-Яа-яЁё_-]/g, '');
}

function sk_makeUniqueKey(projectCode, skNumber) {
    var pCode = String(projectCode || 'LOCAL').trim() || 'LOCAL';
    var n = sk_cleanIssueNumber(skNumber);
    return pCode + '_' + n;
}

function sk_normalizeStatus(rawStatus) {
    var raw = String(rawStatus || '').trim();
    var s = raw.toLowerCase();
    if (s === 'проверено') return { raw: raw, normalized: 'verified', analytical: 'verified_closed', isClosed: true };
    if (s === 'устранено') return { raw: raw, normalized: 'fixed_claimed', analytical: 'fixed_not_verified', isClosed: false };
    if (s === 'не устранено' || s.includes('не устран')) return { raw: raw, normalized: 'open', analytical: 'open', isClosed: false };
    if (!s) return { raw: '', normalized: 'open', analytical: 'open', isClosed: false };
    return { raw: raw, normalized: 'unknown', analytical: 'unknown', isClosed: false };
}

function sk_needsAiCategoryMapping(record) {
    if (!record) return false;
    var category = String(record.category || record.ai_category || record.category_corrected || '').trim();
    if (!category) return true;
    if (category.toLowerCase() === 'без категории') return true;
    if (/^\d+$/.test(category)) return true;
    return false;
}

function sk_hasAiRelevantChange(existing, record) {
    if (!record) return false;
    if (!existing) return sk_needsAiCategoryMapping(record);
    var oldText = String(existing.text || '').trim();
    var newText = String(record.text || '').trim();
    var oldCategory = String(existing.category || '').trim();
    var newCategory = String(record.category || '').trim();
    return oldText !== newText || oldCategory !== newCategory;
}

function sk_makeContractorCanonicalKey(name) {
    var clean = sk_cleanContractorName(name || '');
    return clean.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'unknown_contractor';
}

function sk_parseExcelDate(val) {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') return new Date((val - 25569) * 86400 * 1000).toISOString();
    if (typeof val === 'string') {
        var cleanVal = val.trim();
        var parts = cleanVal.split(/[.,/ -]/);
        if (parts.length === 3) {
            var day = parts[0].padStart(2, '0');
            var month = parts[1].padStart(2, '0');
            var year = parts[2];
            if (year.length === 2) year = '20' + year;
            var isoString = year + '-' + month + '-' + day + 'T12:00:00Z';
            var d = new Date(isoString);
            return isNaN(d.getTime()) ? null : d.toISOString();
        }
        var d2 = new Date(cleanVal);
        return isNaN(d2.getTime()) ? null : d2.toISOString();
    }
    return null;
}

function sk_cleanContractorName(name) {
    if (!name) return 'Неизвестно';
    var clean = name.toLowerCase();
    clean = clean.replace(/\b(ооо|ао|зао|пао|ип|ск|ук|гк)\b/gi, '');
    clean = clean.replace(/["'«»]/g, '');
    clean = clean.replace(/[^a-zа-яё0-9\s]/gi, '').trim().replace(/\s+/g, ' ');
    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

async function sk_parseLocation(rawStr) {
    var rawPath = rawStr ? String(rawStr).trim() : '';
    if (!rawPath) {
        return { raw_path: '', raw_name: '', canonical_key: '', display_name: 'Не указан', block: 'Общее', floor: '', normalization_status: 'empty' };
    }
    var parts = rawPath.split('/').map(function (s) { return String(s || '').trim(); }).filter(Boolean);
    var rawProject = parts.length > 1 ? parts[1] : parts[0];
    var block = parts.length > 2 ? parts[2] : 'Общее';
    var floor = '';
    if (parts.length > 3) {
        var floorPart = parts[3];
        var floorMatch = floorPart.match(/-?\d+/);
        floor = floorMatch ? floorMatch[0] : floorPart;
    }
    var result = { raw_path: rawPath, raw_name: rawProject, canonical_key: '', display_name: rawProject || 'Не указан', block: block, floor: floor, normalization_status: 'pending' };
    if (rawProject) {
        var o = _objects();
        if (o && (typeof o.normalize === 'function' || typeof o.normalizeProjectName === 'function')) {
        try {
            var match = typeof o.normalize === 'function'
                ? await o.normalize(rawProject, { isFromSkImport: true })
                : await o.normalizeProjectName(rawProject, true);
            result.canonical_key = match.canonical_key || '';
            result.display_name = match.display_name || rawProject;
            result.normalization_status = (match.status && match.status.includes('matched')) ? 'matched' : 'pending';
        } catch (e) {
            console.warn('[ПК СК] Не удалось нормализовать объект:', rawProject, e);
        }
        }
    }
    return result;
}

function sk_similarity(s1, s2) {
    if (!s1 || !s2) return 0;
    var longer = s1.toLowerCase();
    var shorter = s2.toLowerCase();
    if (s1.length < s2.length) { longer = s2.toLowerCase(); shorter = s1.toLowerCase(); }
    var longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    var costs = [];
    for (var i = 0; i <= shorter.length; i++) costs[i] = i;
    for (var i = 1; i <= longer.length; i++) {
        var costsTemp = costs[0]; costs[0] = i; var nw = i - 1;
        for (var j = 1; j <= shorter.length; j++) {
            var cj = Math.min(1 + Math.min(costs[j], costs[j - 1]), shorter[j - 1] === longer[i - 1] ? nw : nw + 1);
            nw = costs[j]; costs[j] = cj;
        }
    }
    return (longerLength - costs[shorter.length]) / parseFloat(longerLength);
}

function sk_getCleanCategoryName(rawCat) {
    if (!rawCat) return 'Без категории';
    var raw = String(rawCat).toLowerCase().trim();
    if (raw.includes('электр') || raw.includes('вентил') || raw.includes('отоплен') || raw.includes('водоснаб') || raw.includes('канализ') || raw.includes('слаботоч') || raw.includes('сеть') || raw.includes('сети')) return 'Инженерные сети (ПК СК)';
    if (raw.includes('охрана труда') || raw.includes('безопасност') || raw.includes('тб') || raw.includes('пожар')) return 'Охрана труда и ПБ (ПК СК)';
    if (raw.includes('эколог') || raw.includes('мусор') || raw.includes('бытов')) return 'Организация стройплощадки (ПК СК)';

    var bestMatch = null;
    var highestScore = 0;
    {
        var allTemplates = Object.assign({}, _templates().getSystemTemplates());
        Object.values(allTemplates).forEach(function (tmpl) {
            var score = sk_similarity(raw, tmpl.title.toLowerCase());
            if (score > highestScore) { highestScore = score; bestMatch = tmpl.title; }
        });
    }
    if (highestScore > 0.55) return bestMatch;
    return 'Без категории';
}

function sk_extractStandards(text) {
    if (!text) return [];
    var regex = /(СП\s*\d+(\.\d+)*|ГОСТ\s*[Р]?\s*\d+(-\d+)?|СНиП\s*\d+(\.\d+)*(-\d+)?)/gi;
    var matches = text.match(regex);
    if (!matches) return [];
    var unique = [...new Set(matches.map(function (m) { return m.replace(/\s+/g, ' ').toUpperCase(); }))];
    return unique;
}

function sk_canApproveContractorLink() {
    var permSvc = (SKActions._ctx && SKActions._ctx.permissions) || window.RBI.services.permissions;
    return permSvc ? permSvc.isAdmin() : false;
}

// =========================================================================
// ГЛОБАЛЬНЫЕ ФУНКЦИИ (ПУБЛИЧНЫЙ API)
// =========================================================================

function sk_normalizeCategoryKey(value) {
    return String(value || '')
        .replace(/^\d+[\.,]\s*/, '')
        .trim()
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ');
}

function sk_sortHrTable(column) {
    if (window.skHrSortBy === column) {
        window.skHrSortDesc = !window.skHrSortDesc;
    } else {
        window.skHrSortBy = column;
        window.skHrSortDesc = true;
    }
    sk_renderHrTab();
}

async function sk_loadData() {
    if (_isDemoMode()) return;
    try {
        var records = await _storage().getAll(_storage().stores().SK_RECORDS);
        if (records) {
            var activeRecords = records.filter(function (r) { return !r._deleted && !r.is_deleted; });
            // Восстанавливаем standards на лету для записей без этого поля
            // (записи из Supabase-синхронизации могут не иметь standards)
            activeRecords.forEach(function (r) {
                if (!r.standards || !Array.isArray(r.standards) || r.standards.length === 0) {
                    r.standards = sk_extractStandards(r.text || '');
                }
            });
            window.skRecords = sk_filterRecordsByAccess(activeRecords);
        } else {
            window.skRecords = [];
        }
        var volumes = await _storage().get(_storage().stores().SK_VOLUMES, 'main');
        if (volumes && volumes.data) window.skVolumes = volumes.data;
        var mapping = await _storage().get(_storage().stores().SK_MAPPING, 'main');
        if (mapping && mapping.data) window.skMapping = mapping.data;
        var cmap = await _storage().get(_storage().stores().SK_CONTRACTOR_MAP, 'main');
        if (cmap && cmap.data) window.skContractorMap = cmap.data;
        var catMap = await _storage().get(_storage().stores().SK_CATEGORY_MAP, 'main');
        if (catMap && catMap.data) window.skCategoryMap = catMap.data;
        var contrInitSvc = _contractors();
        if (contrInitSvc && typeof contrInitSvc.init === 'function') {
            await contrInitSvc.init();
        }
    } catch (e) { console.error('Ошибка загрузки данных ПК СК', e); }
}

async function sk_clearData() {
    var permSvc = (SKActions._ctx && SKActions._ctx.permissions) || window.RBI.services.permissions;
    var role = permSvc ? permSvc.getCurrentRole() : 'guest';
    var canManage = permSvc ? permSvc.canManageSK() : false;
    if (!canManage) return showToast(_t('quality.sk.toast.clear_denied', '❌ У вашей роли нет прав для очистки базы ПК СК'));

    var isManager = permSvc ? permSvc.isAdmin() : false;
    var confirmText = isManager
        ? _t('quality.sk.confirm.clear_all', 'Удалить ВСЕ загруженные замечания Стройконтроля? (Справочник объемов сохранится)')
        : _t('quality.sk.confirm.clear_own', 'Удалить ВСЕ ВАШИ загруженные замечания Стройконтроля? (Чужие записи останутся)');
    if (!confirm(confirmText)) return;

    var deletedCount = 0;
    var currentUser = sk_getCurrentUserName();
    for (var i = 0; i < window.skRecords.length; i++) {
        var rec = window.skRecords[i];
        var owner = rec.uploaded_by || rec.sk_uploaded_by || rec.imported_by || '';
        if (isManager || owner === currentUser) {
            var nowIso = new Date().toISOString();
            rec._deleted = true; rec.is_deleted = true;
            rec.deleted_at = nowIso; rec._deletedAt = nowIso;
            rec._updatedAt = nowIso; rec.updated_at = nowIso; rec.updatedAt = nowIso;
            rec.source = 'local'; rec.syncStatus = 'not_synced'; rec.sync_status = 'not_synced';
            rec.syncBlockReason = ''; rec.sync_block_reason = '';
            await _storage().put(_storage().stores().SK_RECORDS, rec);
            deletedCount++;
        }
    }
    if (deletedCount > 0) {
        window.skRecords = window.skRecords.filter(function (r) { return !r._deleted; });
        localStorage.setItem('rbi_cloud_dirty', '1');
        _sync('silent');
        showToast(_t('quality.sk.toast.deleted_count', '🔄 Удалено замечаний: {count}', { count: deletedCount }));
        sk_renderMainTab();
    } else {
        showToast(_t('quality.sk.toast.nothing_to_delete', 'Нет замечаний для удаления (или нет прав на удаление чужих).'));
    }
}

function sk_switchView(view) {
    window.skCurrentSubTab = view;
    var vDash = document.getElementById('sk-view-dashboard');
    var vVol = document.getElementById('sk-view-volumes');
    var vHr = document.getElementById('sk-view-hr');
    var vLinks = document.getElementById('sk-view-links');
    if (vDash) vDash.classList.add('hidden');
    if (vVol) vVol.classList.add('hidden');
    if (vHr) vHr.classList.add('hidden');
    if (vLinks) vLinks.classList.add('hidden');

    var defaultBtnClass = 'shrink-0 px-4 bg-[var(--card-bg)] text-muted border border-[var(--card-border)] py-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95 transition-colors shadow-sm flex items-center gap-1.5';
    var activeBtnClass = 'shrink-0 px-4 bg-brand-soft text-brand border border-brand-soft py-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95 transition-colors shadow-sm flex items-center gap-1.5';

    var btnDash = document.getElementById('sk-btn-dashboard');
    var btnVol = document.getElementById('sk-btn-volumes');
    var btnHr = document.getElementById('sk-btn-hr');
    var btnLinks = document.getElementById('sk-btn-links');
    if (btnDash) btnDash.className = defaultBtnClass;
    if (btnVol) btnVol.className = defaultBtnClass;
    if (btnHr) btnHr.className = defaultBtnClass;
    if (btnLinks) btnLinks.className = defaultBtnClass;

    var viewEl = document.getElementById('sk-view-' + view);
    var btnEl = document.getElementById('sk-btn-' + view);
    if (viewEl) viewEl.classList.remove('hidden');
    if (btnEl) btnEl.className = activeBtnClass;

    if (view === 'hr') sk_renderHrTab();
    if (view === 'links') sk_renderLinks();
}

async function sk_addVolume() {
    var nameInput = document.getElementById('sk-vol-name');
    var amountInput = document.getElementById('sk-vol-amount');
    var unitInput = document.getElementById('sk-vol-unit');
    var name = nameInput.value.trim();
    var amount = parseFloat(amountInput.value.replace(/\s/g, ''));
    var unit = unitInput.value.trim();
    if (!name) return showToast(_t('quality.sk.toast.volume_name_required', '⚠️ Укажите вид работ!'));
    if (isNaN(amount) || amount <= 0) return showToast(_t('quality.sk.toast.volume_amount_invalid', '⚠️ Укажите корректное количество (число)!'));
    if (!unit) return showToast(_t('quality.sk.toast.volume_unit_required', '⚠️ Укажите единицу измерения!'));
    window.skVolumes[name] = { amount: amount, unit: unit };
    await _storage().put(_storage().stores().SK_VOLUMES, { id: 'main', data: window.skVolumes });
    nameInput.value = ''; amountInput.value = ''; unitInput.value = '';
    showToast(_t('quality.sk.toast.volume_added', '✅ Объем добавлен в справочник!'));
    sk_renderVolumes();
    sk_renderDashboard();
}

async function sk_deleteVolume(name) {
    delete window.skVolumes[name];
    await _storage().put(_storage().stores().SK_VOLUMES, { id: 'main', data: window.skVolumes });
    sk_renderVolumes();
    sk_renderDashboard();
}

async function sk_handleExcelImport(event) {
    var file = event.target.files[0];
    if (!sk_canUploadRecords()) {
        event.target.value = '';
        return showToast(_t('quality.sk.toast.upload_denied', '❌ Загружать ПК СК могут только инженер, заместитель или администратор'));
    }
    if (!file) return;
    showToast(_t('quality.sk.toast.reading_excel', '🔄 Читаем Excel файл...'));
    var reader = new FileReader();
    reader.onload = async function (e) {
        try {
            var data = new Uint8Array(e.target.result);
            var workbook = XLSX.read(data, { type: 'array' });
            var firstSheetName = workbook.SheetNames[0];
            var worksheet = workbook.Sheets[firstSheetName];
            var rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            if (rows.length < 2) throw new Error(_t('quality.sk.error.file_empty', 'Файл пуст или не содержит данных'));
            var headers = rows[0].map(function (h) { return h ? h.toString().trim() : ''; });
            var skSvc = (SKActions._ctx && SKActions._ctx.sk) || window.RBI.services.sk;
            skSvc.setTempRawHeadersSync(headers);
            window.skTempRawRows = rows;
            sk_showMappingModal(headers, rows[1] || []);
        } catch (err) {
            console.error(err);
            alert(_t('quality.sk.alert.excel_read_error', 'Ошибка чтения Excel: {message}', { message: err.message }));
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
}

async function sk_executeImport(autoMapping) {
    var _allInspections = _inspections();
    if (autoMapping === undefined) autoMapping = null;
    var currentMapping = autoMapping;
    if (!currentMapping) {
        currentMapping = {};
        document.querySelectorAll('.sk-mapping-select').forEach(function (select) {
            currentMapping[select.dataset.field] = parseInt(select.value);
        });
    }
    var criticalFields = ['number', 'contractor', 'status', 'date_issued'];
    var hasError = false;
    criticalFields.forEach(function (field) {
        if (currentMapping[field] === -1 || isNaN(currentMapping[field])) hasError = true;
    });
    if (hasError) return showToast(_t('quality.sk.toast.mapping_required', "❌ ОШИБКА: Колонки '№ замечания', 'Ответственная организация', 'Дата выдачи' и 'Отметка об устранении' ОБЯЗАТЕЛЬНЫ! Назначьте их."));

    window.skMapping = currentMapping;
    await _storage().put(_storage().stores().SK_MAPPING, { id: 'main', data: currentMapping });

    var rows = window.skTempRawRows;
    var contrIdx = currentMapping['contractor'];
    var rawContractorsInFile = new Set();
    for (var i = 1; i < rows.length; i++) {
        if (rows[i] && rows[i][contrIdx]) rawContractorsInFile.add(String(rows[i][contrIdx]).trim());
    }

    var rbiContractors = [...new Set(_allInspections.map(function (c) { return c.contractorName; }))].filter(Boolean);
    var pairsToConfirm = [];
    window.skTempContractorMatches = {};

    rawContractorsInFile.forEach(function (rawName) {
        var cleanName = sk_cleanContractorName(rawName);
        if (window.skContractorMap[rawName]) {
            window.skTempContractorMatches[rawName] = window.skContractorMap[rawName];
            return;
        }
        var bestMatch = null;
        var highestScore = 0;
        rbiContractors.forEach(function (rbiName) {
            var cleanRbi = sk_cleanContractorName(rbiName);
            var score = sk_similarity(cleanName, cleanRbi);
            if (score > highestScore) { highestScore = score; bestMatch = rbiName; }
        });
        if (highestScore >= 0.85) {
            window.skTempContractorMatches[rawName] = bestMatch;
            window.skContractorMap[rawName] = bestMatch;
        } else if (highestScore >= 0.60 && highestScore < 0.85) {
            pairsToConfirm.push({ raw: rawName, target: bestMatch, score: Math.round(highestScore * 100) });
        } else {
            window.skTempContractorMatches[rawName] = rawName;
        }
    });

    if (pairsToConfirm.length > 0) {
        window.skTempPairsToConfirm = pairsToConfirm;
        sk_showNormalizationModal();
    } else {
        sk_finalizeImport();
    }
}

function sk_resolvePair(idx, isMatch) {
    var pair = window.skTempPairsToConfirm[idx];
    if (isMatch) {
        window.skTempContractorMatches[pair.raw] = pair.target;
        window.skContractorMap[pair.raw] = pair.target;
    } else {
        window.skTempContractorMatches[pair.raw] = pair.raw;
    }
    document.getElementById('norm-pair-' + idx).style.display = 'none';
    var container = document.getElementById('norm-pairs-container');
    var remaining = container.querySelectorAll('div[id^="norm-pair-"]:not([style*="display: none"])');
    if (remaining.length === 0) {
        closeModal();
        sk_finalizeImport();
    }
}

async function sk_finalizeImport() {
    showToast(_t('quality.sk.toast.import_building', '🔄 Формируем единый реестр ПК СК без дублей...'));
    await _storage().put(_storage().stores().SK_CONTRACTOR_MAP, { id: 'main', data: window.skContractorMap });

    var rows = window.skTempRawRows || [];
    var projectCode = _syncConfig().projectCode || 'LOCAL';
    var currentUser = sk_getCurrentUserName();
    var nowIso = new Date().toISOString();
    var importBatchId = window.RbiIds.newId();
    var newRecordsCount = 0, updatedRecordsCount = 0, skippedRecordsCount = 0, aiCandidateCount = 0;
    var recordsToSaveBatch = [];
    var pendingProjectRequestsMap = new Map();

    var allExistingRecords = (await _storage().getAll(_storage().stores().SK_RECORDS)) || [];
    var activeExistingRecords = allExistingRecords.filter(function (r) { return !r._deleted && !r.is_deleted; });
    var existingMap = new Map();
    activeExistingRecords.forEach(function (r) {
        var key = r.sk_unique_key || (r.project_code && r.sk_number ? sk_makeUniqueKey(r.project_code, r.sk_number) : '') || r.id;
        if (key) existingMap.set(String(key), r);
    });

    for (var i = 1; i < rows.length; i++) {
        var row = rows[i];
        if (!row || row.length === 0) continue;
        var getVal = (function (r) {
            return function (field) {
                var idx = window.skMapping ? window.skMapping[field] : -1;
                if (idx === -1 || idx === undefined || r[idx] === undefined) return '';
                return r[idx];
            };
        })(row);

        var skNumber = sk_cleanIssueNumber(getVal('number'));
        if (!skNumber) { skippedRecordsCount++; continue; }

        var skUniqueKey = sk_makeUniqueKey(projectCode, skNumber);
        var stableId = 'sk_' + skUniqueKey;
        var rawContractor = getVal('contractor') ? String(getVal('contractor')).trim() : 'Неизвестно';
        var contractorMatch = null;
        var contrNormSvc = _contractors();
        if (contrNormSvc && (typeof contrNormSvc.normalize === 'function' || typeof contrNormSvc.normalizeContractorName === 'function')) {
            contractorMatch = typeof contrNormSvc.normalize === 'function'
                ? await contrNormSvc.normalize(rawContractor)
                : await contrNormSvc.normalizeContractorName(rawContractor);
        }
        var cleanContractor = (contractorMatch && contractorMatch.display_name) || sk_cleanContractorName(rawContractor);
        var contractorKey = (contractorMatch && contractorMatch.canonical_key) || '';
        var contractorNormStatus = (contractorMatch && contractorMatch.status && contractorMatch.status.includes('matched')) ? 'matched' : 'pending';
        var contractorId = '';
        if (contractorNormStatus === 'matched') {
            var resolveSvc = _contractors();
            if (resolveSvc && typeof resolveSvc.resolveIdFromNormalized === 'function') {
                contractorId = resolveSvc.resolveIdFromNormalized(contractorMatch) || '';
            } else if (resolveSvc && typeof resolveSvc.getByCanonicalKey === 'function' && contractorKey) {
                var matchedCard = resolveSvc.getByCanonicalKey(contractorKey);
                contractorId = (matchedCard && matchedCard.id) ? String(matchedCard.id) : '';
            }
        }

        var rawStructure = getVal('structure') ? String(getVal('structure')).trim() : '';
        var rawProjectLoc = getVal('project_loc') ? String(getVal('project_loc')).trim() : '';
        if (!rawProjectLoc && rawStructure) rawProjectLoc = rawStructure;

        var parsedLoc = await sk_parseLocation(rawProjectLoc);
        if (parsedLoc && parsedLoc.raw_name && (parsedLoc.normalization_status === 'pending' || parsedLoc.normalization_status === 'not_found' || parsedLoc.normalization_status === 'unknown' || !parsedLoc.canonical_key || parsedLoc.canonical_key === 'unknown')) {
            var rawProjectName = String(parsedLoc.raw_name || '').trim();
            if (rawProjectName) {
                var requestKey = rawProjectName.toLowerCase();
                if (!pendingProjectRequestsMap.has(requestKey)) {
                    pendingProjectRequestsMap.set(requestKey, { raw_name: rawProjectName, canonical_key: '', display_name: parsedLoc.display_name || rawProjectName, status: 'pending', source: 'sk_import', created_at: nowIso });
                }
            }
        }

        var rawText = getVal('text') ? String(getVal('text')).trim() : '';
        var extractedStandards = sk_extractStandards(rawText);
        var statusInfo = sk_normalizeStatus(getVal('status'));
        var existing = existingMap.get(skUniqueKey);

        var record = {
            id: (existing && existing.id) || stableId,
            project_code: projectCode,
            number: skNumber, sk_number: skNumber, sk_unique_key: skUniqueKey,
            row_number: getVal('row_number') ? String(getVal('row_number')).trim() : String(i),
            text: rawText,
            category: getVal('category') ? sk_getCleanCategoryName(getVal('category')) : 'Без категории',
            date_issued: sk_parseExcelDate(getVal('date_issued')),
            contractor: cleanContractor, contractorName: cleanContractor, contractor_name: cleanContractor,
            raw_contractor: rawContractor, contractor_raw: rawContractor,
            contractor_canonical_key: contractorKey, contractor_normalization_status: contractorNormStatus,
            contractorId: contractorId,
            contractor_representative: getVal('contractor_representative') ? String(getVal('contractor_representative')).trim() : '',
            deadline: sk_parseExcelDate(getVal('deadline')),
            status: statusInfo.raw, status_raw: statusInfo.raw, status_normalized: statusInfo.normalized,
            status_analytical: statusInfo.analytical, is_verified_closed: statusInfo.isClosed,
            date_resolved: sk_parseExcelDate(getVal('date_resolved')),
            inspector: getVal('inspector') ? String(getVal('inspector')).trim() : 'Неизвестно',
            issued_by: getVal('inspector') ? String(getVal('inspector')).trim() : 'Неизвестно',
            closed_by: getVal('closed_by') ? String(getVal('closed_by')).trim() : '',
            standards: extractedStandards,
            structure: rawStructure, raw_location: rawStructure, project_loc: rawProjectLoc,
            project_raw_path: parsedLoc.raw_path, project_raw_name: parsedLoc.raw_name,
            canonical_key: parsedLoc.canonical_key || 'unknown',
            display_name: parsedLoc.display_name || parsedLoc.raw_name || 'Не указан',
            block: parsedLoc.block || 'Общее', floor: parsedLoc.floor || '',
            project_canonical_key: parsedLoc.canonical_key || '',
            project_display_name: parsedLoc.display_name || parsedLoc.raw_name || 'Не указан',
            project_block: parsedLoc.block || 'Общее', project_floor: parsedLoc.floor || '',
            project_normalization_status: parsedLoc.normalization_status || 'pending',
            uploaded_by: (existing && existing.uploaded_by && existing.uploaded_by !== 'Инженер') ? existing.uploaded_by : currentUser,
            sk_uploaded_by: (existing && existing.sk_uploaded_by && existing.sk_uploaded_by !== 'Инженер') ? existing.sk_uploaded_by : currentUser,
            imported_by: currentUser,
            first_uploaded_by: (existing && existing.first_uploaded_by && existing.first_uploaded_by !== 'Инженер') ? existing.first_uploaded_by : currentUser,
            last_uploaded_by: currentUser,
            import_batch_id: importBatchId,
            import_count: ((existing && existing.import_count) || 0) + 1,
            first_imported_at: (existing && existing.first_imported_at) || nowIso,
            last_imported_at: nowIso,
            source: 'local', syncStatus: 'not_synced', sync_status: 'not_synced',
            syncBlockReason: '', sync_block_reason: '',
            updated_at: nowIso, updatedAt: nowIso, _updatedAt: nowIso,
            created_at: (existing && existing.created_at) || nowIso,
            createdAt: (existing && (existing.createdAt || existing.created_at)) || nowIso,
            _deleted: false, is_deleted: false
        };

        if (existing) {
            record.ai_category = existing.ai_category;
            record.category_corrected = existing.category_corrected;
            record.predicted_risk = existing.predicted_risk;
            if (existing.category_corrected || existing.ai_category) record.category = existing.category;
            var skRole = sk_getCurrentRole();
            var permSvc = (SKActions._ctx && SKActions._ctx.permissions) || window.RBI.services.permissions;
            var isAdminSk = permSvc ? permSvc.isAdmin() : ['manager', 'deputy_manager'].includes(skRole);
            var existingOwner = existing.uploaded_by || existing.sk_uploaded_by || '';
            if (!isAdminSk && existingOwner && existingOwner !== currentUser) { skippedRecordsCount++; continue; }
            updatedRecordsCount++;
        } else {
            newRecordsCount++;
        }

        var needsAiCategory = sk_needsAiCategoryMapping(record);
        var aiRelevantChanged = sk_hasAiRelevantChange(existing, record);
        if (needsAiCategory && aiRelevantChanged) { record.needs_ai_category = true; aiCandidateCount++; }
        else { record.needs_ai_category = false; }

        existingMap.set(skUniqueKey, record);
        recordsToSaveBatch.push(record);
    }

    if (pendingProjectRequestsMap.size > 0 && typeof window.pushObjectRequestToCloud === 'function') {
        var uniqueRequests = Array.from(pendingProjectRequestsMap.values());
        for (var req of uniqueRequests) {
            try { await window.pushObjectRequestToCloud(req); }
            catch (e) { console.warn('[ПК СК] Не удалось отправить заявку на объект:', req, e); localStorage.setItem('rbi_cloud_dirty', '1'); }
        }
    }

    // P2-0076: шаг сопоставления с «Компанией» — известные фирма / категория / место получают id, новое уходит в «Разобрать»
    var linkSummary = recordsToSaveBatch.length > 0 ? await skRegisterImport(recordsToSaveBatch) : null;

    if (recordsToSaveBatch.length > 0) {
        await _storage().putBatch(_storage().stores().SK_RECORDS, recordsToSaveBatch);
    }

    var importLog = {
        id: importBatchId, project_code: projectCode, uploaded_by: currentUser,
        uploaded_at: nowIso, date: nowIso,
        records_total: Math.max(rows.length - 1, 0), records_created: newRecordsCount,
        records_updated: updatedRecordsCount, records_skipped: skippedRecordsCount,
        added: newRecordsCount, updated: updatedRecordsCount, skipped: skippedRecordsCount,
        status: 'completed', source: 'local', syncStatus: 'not_synced', sync_status: 'not_synced',
        syncBlockReason: '', sync_block_reason: ''
    };

    if (_storage().stores().SK_IMPORT_BATCHES) await _storage().put(_storage().stores().SK_IMPORT_BATCHES, importLog);
    await _storage().put(_storage().stores().SK_IMPORTS, importLog);

    var freshRecords = (await _storage().getAll(_storage().stores().SK_RECORDS)) || [];
    window.skRecords = sk_filterRecordsByAccess(freshRecords.filter(function (r) { return !r._deleted && !r.is_deleted; }));

    _gameLogAction('sk_import_done', importLog.id);
    // После импорта — красный ИСД / улучшение ИСД (сравнение со снимком)
    try { await sk_evaluateIsdXpRewards({ fromImport: true }); } catch (e) { console.warn('[ПК СК] ISD XP eval:', e); }

    {
        var skTask = _getTasks().find(function (t) { return t.title === 'Загрузить выгрузку ПК СК' && t.status === 'pending'; });
        if (skTask) {
            skTask.status = 'done'; skTask.done = 1; skTask.resultComment = 'Файл ПК СК загружен';
            skTask.updatedAt = nowIso;
            _storage().put(_storage().stores().TASKS, skTask);
            if (typeof window.gameLogAction === 'function') {
                var logs = window.gameActionLogs || [];
                if (!logs.some(function (l) { return l.action === 'task_completed_on_time' && l.target === skTask.id; })) {
                    window.gameLogAction('task_completed_on_time', skTask.id);
                }
            }
        }
    }

    localStorage.setItem('rbi_cloud_dirty', '1');
    showToast(_t('quality.sk.toast.import_done', '✅ ПК СК: новых {created}, обновлено {updated}, пропущено {skipped}, для AI: {ai}', {
        created: newRecordsCount, updated: updatedRecordsCount, skipped: skippedRecordsCount, ai: aiCandidateCount
    }));

    setTimeout(function () { _sync('manual'); }, 500);

    if (aiCandidateCount > 0 && typeof sk_autoMapCategories === 'function' && !window.skAiRunning) {
        window.skAiRunning = true;
        var aiSvc = (SKActions._ctx && SKActions._ctx.ai) || window.RBI.services.ai;
        aiSvc.sk_autoMapCategories(false).finally(function () {
            window.skAiRunning = false;
            localStorage.setItem('rbi_cloud_dirty', '1');
            setTimeout(function () { _sync('silent'); }, 1000);
            sk_renderDashboard();
        });
    }

    closeModal();
    sk_renderDashboard();
    if (linkSummary) sk_showLinksSummary(linkSummary);
}

async function sk_deleteRecord(recordId) {
    var record = window.skRecords.find(function (r) { return String(r.id) === String(recordId); });
    if (!record) return;
    if (!sk_canDeleteRecord(record)) return showToast(_t('quality.sk.toast.delete_denied', '⚠️ Инженер может удалить только свои записи ПК СК. Остальные роли не имеют права удаления.'));
    var role = sk_getCurrentRole();
    var permSvc = (SKActions._ctx && SKActions._ctx.permissions) || window.RBI.services.permissions;
    var confirmText = (permSvc ? permSvc.isAdmin() : ['manager', 'deputy_manager'].includes(role))
        ? _t('quality.sk.confirm.delete_admin', 'Удалить это замечание ПК СК? У вас есть право удалить любую запись.')
        : _t('quality.sk.confirm.delete_own', 'Удалить это замечание ПК СК? Вы можете удалять только свои загруженные записи.');
    if (!confirm(confirmText)) return;
    var nowIso = new Date().toISOString();
    record._deleted = true; record.is_deleted = true;
    record.deleted_at = nowIso; record._deletedAt = nowIso;
    record._updatedAt = nowIso; record.updated_at = nowIso; record.updatedAt = nowIso;
    record.source = 'local'; record.syncStatus = 'not_synced'; record.sync_status = 'not_synced';
    record.syncBlockReason = ''; record.sync_block_reason = '';
    await _storage().put(_storage().stores().SK_RECORDS, record);
    window.skRecords = window.skRecords.filter(function (r) { return String(r.id) !== String(recordId); });
    sk_renderDashboard();
    localStorage.setItem('rbi_cloud_dirty', '1');
    _sync('silent');
    showToast(_t('quality.sk.toast.record_deleted', '🔄 Замечание ПК СК удалено'));
}

async function sk_saveCategoryLink(rawCategory) {
    var targetCategory = document.getElementById('sk-category-link-select').value;
    if (!targetCategory) return showToast(_t('quality.sk.toast.category_select_required', '⚠️ Выберите вид работ из списка!'));
    var key = sk_normalizeCategoryKey(rawCategory);
    window.skCategoryMap[key] = targetCategory;
    await _storage().put(_storage().stores().SK_CATEGORY_MAP, { id: 'main', data: window.skCategoryMap, source: 'local', syncStatus: 'not_synced', sync_status: 'not_synced', updatedAt: new Date().toISOString(), updated_at: new Date().toISOString() });
    var updatedCount = 0;
    var nowIso = new Date().toISOString();
    for (var r of window.skRecords) {
        var currentCatKey = sk_normalizeCategoryKey(r.category);
        if (currentCatKey === key || r.category === rawCategory) {
            r.category = targetCategory; r.ai_category = targetCategory; r.category_corrected = true;
            r.updated_at = nowIso; r.updatedAt = nowIso; r._updatedAt = nowIso;
            r.source = 'local'; r.syncStatus = 'not_synced'; r.sync_status = 'not_synced';
            await _storage().put(_storage().stores().SK_RECORDS, r);
            updatedCount++;
        }
    }
    closeModal();
    showToast(_t('quality.sk.toast.category_linked', '✅ Связь установлена! Обновлено записей: {count}', { count: updatedCount }));
    localStorage.setItem('rbi_cloud_dirty', '1');
    _sync('silent');
    setTimeout(function () { sk_renderDashboard(); }, 300);
}

async function sk_openContractorLinkModal() {
    var queue = await sk_getPendingContractorsQueue();
    if (!queue.length) { showToast(_t('quality.sk.toast.no_pending_contractors', '✅ Неподтверждённых подрядчиков нет')); return; }
    var canApprove = sk_canApproveContractorLink();
    var modalTitle = canApprove ? _t('quality.sk.contractor_link.title', 'Связать подрядчика') : _t('quality.sk.contractor_link.request_title', 'Отправить заявку на подрядчика');
    var modalDescription = canApprove ? _t('quality.sk.contractor_link.description', 'Выберите название из ПК СК и создайте для него единое имя подрядчика.') : _t('quality.sk.contractor_link.request_description', 'Выберите подрядчика из ПК СК и предложите единое название. Заявка уйдёт администратору на подтверждение.');
    var actionButtonText = canApprove ? _t('quality.sk.contractor_link.link', 'Связать') : _t('quality.sk.contractor_link.submit', 'Отправить заявку');
    var optionsHtml = queue.map(function (q, idx) { return '<option value="' + idx + '">' + String(q.raw_name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</option>'; }).join('');
    var modalHtml = `
        <div id="sk-contractor-link-modal" class="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div class="bg-[var(--card-bg)] w-full max-w-md rounded-2xl border border-[var(--card-border)] shadow-2xl overflow-hidden">
                <div class="p-4 border-b border-[var(--card-border)]">
                    <div class="text-rbi-body font-black uppercase text-ink dark:text-white">${modalTitle}</div>
                    <div class="text-rbi-caption font-bold text-muted mt-1 leading-snug">${modalDescription}</div>
                </div>
                <div class="p-4 space-y-3">
                    <div><label class="block text-rbi-caption font-black uppercase text-muted mb-1">${_t('quality.sk.contractor_link.from_sk_label', 'Подрядчик из ПК СК')}</label><select id="sk-link-raw-contractor" class="input-base w-full" onchange="sk_fillContractorSuggestion()">${optionsHtml}</select></div>
                    <div><label class="block text-rbi-caption font-black uppercase text-muted mb-1">${_t('quality.sk.contractor_link.display_name_label', 'Единое название подрядчика')}</label><input id="sk-link-display-name" class="input-base w-full" placeholder="${_t('quality.sk.contractor_link.display_name_placeholder', 'Например: ООО &quot;СК Каменный город&quot;')}"></div>
                    <div><label class="block text-rbi-caption font-black uppercase text-muted mb-1">${_t('quality.sk.contractor_link.canonical_key_label', 'Технический ключ')}</label><input id="sk-link-canonical-key" class="input-base w-full" placeholder="${_t('quality.sk.contractor_link.canonical_key_placeholder', 'Например: sk_kamenny_gorod')}"></div>
                </div>
                <div class="p-4 border-t border-[var(--card-border)] flex justify-end gap-2">
                    <button onclick="sk_closeContractorLinkModal()" class="px-4 py-2 rounded-xl text-rbi-caption font-black uppercase bg-surface text-muted">${_t('quality.sk.contractor_link.cancel', 'Отмена')}</button>
                    <button onclick="sk_saveContractorLink()" class="px-4 py-2 rounded-xl text-rbi-caption font-black uppercase bg-brand text-white shadow active:scale-95">${actionButtonText}</button>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.body.classList.add('modal-open');
    window.skContractorQueueForModal = queue;
    setTimeout(function () { sk_fillContractorSuggestion(); }, 50);
}

async function sk_saveContractorLink() {
    try {
        var select = document.getElementById('sk-link-raw-contractor');
        var displayInput = document.getElementById('sk-link-display-name');
        var keyInput = document.getElementById('sk-link-canonical-key');
        if (!select || !displayInput || !keyInput) return;
        var queue = window.skContractorQueueForModal || [];
        var item = queue[Number(select.value)];
        if (!item) { showToast(_t('quality.sk.toast.contractor_not_selected', '⚠️ Не выбран подрядчик')); return; }
        var rawName = String(item.raw_name || '').trim();
        var displayName = String(displayInput.value || '').trim();
        var canonicalKey = String(keyInput.value || '').trim();
        if (!rawName || !displayName || !canonicalKey) { showToast(_t('quality.sk.toast.contractor_fields_required', '⚠️ Заполните название и технический ключ')); return; }
        var projectCode = _syncConfig().projectCode || 'LOCAL';
        var currentUser = sk_getCurrentUserName();
        var nowIso = new Date().toISOString();

        if (!sk_canApproveContractorLink()) {
            var allQueue = await _storage().getAll(_storage().stores().CONTRACTOR_QUEUE) || [];
            var updatedQueue = 0;
            for (var q of allQueue) {
                if (String(q.raw_name || '').trim().toLowerCase() === rawName.toLowerCase()) {
                    q.status = 'pending'; q.suggested_canonical_key = canonicalKey;
                    q.admin_comment = 'Заявка от инженера: предложено связать с "' + displayName + '"';
                    q.created_by = q.created_by || currentUser;
                    q.proposed_display_name = displayName; q.proposed_canonical_key = canonicalKey;
                    q.proposed_by = currentUser; q.proposed_at = nowIso;
                    q.source = 'local'; q.syncStatus = 'not_synced'; q.sync_status = 'not_synced';
                    q.syncBlockReason = ''; q.sync_block_reason = '';
                    q.updated_at = nowIso; q.updatedAt = nowIso;
                    await _storage().put(_storage().stores().CONTRACTOR_QUEUE, q);
                    updatedQueue++;
                }
            }
            if (updatedQueue === 0) {
                var request = {
                    id: window.RbiIds.newId(),
                    project_code: projectCode, raw_name: rawName, cleaned_name: rawName.toLowerCase().trim(),
                    suggested_canonical_key: canonicalKey, source_table: 'sk_records', source_record_id: '',
                    created_by: currentUser, status: 'pending',
                    admin_comment: 'Заявка от инженера: предложено связать с "' + displayName + '"',
                    proposed_display_name: displayName, proposed_canonical_key: canonicalKey,
                    proposed_by: currentUser, proposed_at: nowIso,
                    created_at: nowIso, updated_at: nowIso, updatedAt: nowIso,
                    source: 'local', syncStatus: 'not_synced', sync_status: 'not_synced',
                    syncBlockReason: '', sync_block_reason: ''
                };
                await _storage().put(_storage().stores().CONTRACTOR_QUEUE, request);
            }
            localStorage.setItem('rbi_cloud_dirty', '1');
            sk_closeContractorLinkModal();
            showToast(_t('quality.sk.toast.contractor_request_sent', '🔄 Заявка на подрядчика отправлена администратору'));
            setTimeout(function () { _sync('silent'); }, 500);
            await sk_renderContractorQueueBanner();
            return;
        }

        var directoryApi = _contractors();
        if (!directoryApi || typeof directoryApi.create !== 'function') {
            showToast(_t('quality.sk.toast.contractor_service_unavailable', '❌ Сервис справочника подрядчиков недоступен'));
            return;
        }
        var existingCard = typeof directoryApi.getByCanonicalKey === 'function'
            ? directoryApi.getByCanonicalKey(canonicalKey)
            : null;
        var linkedCard = existingCard;
        if (existingCard) {
            if (typeof directoryApi.saveAlias === 'function') {
                await directoryApi.saveAlias(rawName, canonicalKey);
            }
        } else {
            linkedCard = await directoryApi.create({
                display_name: displayName,
                canonical_key: canonicalKey,
                synonyms: [rawName],
                inn: ''
            });
        }
        if (!linkedCard && typeof directoryApi.getByCanonicalKey === 'function') {
            linkedCard = directoryApi.getByCanonicalKey(canonicalKey);
        }
        var linkedContractorId = (linkedCard && linkedCard.id) ? String(linkedCard.id) : '';

        var allQueue2 = await _storage().getAll(_storage().stores().CONTRACTOR_QUEUE) || [];
        for (var q2 of allQueue2) {
            if (String(q2.raw_name || '').trim().toLowerCase() === rawName.toLowerCase()) {
                q2.status = 'linked'; q2.suggested_canonical_key = canonicalKey;
                q2.admin_comment = 'Связано пользователем в ПК СК';
                q2.updated_at = nowIso; q2.updatedAt = nowIso;
                await _storage().put(_storage().stores().CONTRACTOR_QUEUE, q2);
            }
        }

        var records2 = await _storage().getAll(_storage().stores().SK_RECORDS) || [];
        var updated = 0;
        for (var r2 of records2) {
            var recRaw = String(r2.contractor_raw || r2.raw_contractor || r2.contractor || '').trim();
            if (recRaw.toLowerCase() === rawName.toLowerCase()) {
                r2.contractor = displayName; r2.contractorName = displayName; r2.contractor_name = displayName;
                r2.contractor_raw = rawName; r2.raw_contractor = rawName;
                r2.contractor_canonical_key = canonicalKey; r2.contractor_normalization_status = 'matched';
                r2.contractorId = linkedContractorId;
                r2.source = 'local'; r2.syncStatus = 'not_synced'; r2.sync_status = 'not_synced';
                r2.syncBlockReason = ''; r2.sync_block_reason = '';
                r2.updated_at = nowIso; r2.updatedAt = nowIso; r2._updatedAt = nowIso;
                await _storage().put(_storage().stores().SK_RECORDS, r2);
                updated++;
            }
        }

        var contrInitSvc2 = _contractors();
        if (contrInitSvc2 && typeof contrInitSvc2.init === 'function') await contrInitSvc2.init();
        localStorage.setItem('rbi_cloud_dirty', '1');
        var historyUpdated = 0;
        if (typeof window.applyContractorAliasToInspectionHistory === 'function') {
            historyUpdated = await window.applyContractorAliasToInspectionHistory(rawName, canonicalKey, displayName);
        }
        showToast(_t('quality.sk.toast.contractor_linked', '✅ Подрядчик связан. ПК СК: {sk}, история: {history}', { sk: updated, history: historyUpdated }));
        sk_closeContractorLinkModal();
        await sk_loadData();
        sk_renderMainTab();
        setTimeout(function () { _sync('silent'); }, 500);
    } catch (e) {
        console.error('[ПК СК] Ошибка связывания подрядчика:', e);
        showToast(_t('quality.sk.toast.contractor_link_failed', '❌ Не удалось связать подрядчика'));
    }
}

/**
 * Снимок ИСД по подрядчик×вид работ (та же формула, что в матрице дашборда).
 * @returns {Object<string,{contractor:string,category:string,isd:number}>}
 */
function sk_computeIsdSnapshot() {
    var records = (window.skRecords || []).filter(function (r) { return !r._deleted && !r.is_deleted; });
    var volumes = window.skVolumes || {};
    var _allInspections = _inspections();
    var rbiContractors = [...new Set(_allInspections.map(function (c) {
        return c.contractorName ? c.contractorName.toLowerCase().trim() : '';
    }))];
    var rateCache = {};
    var getRate = function (contractor, cleanCategory) {
        var cacheKey = contractor + '_||_' + cleanCategory;
        if (rateCache[cacheKey] !== undefined) return rateCache[cacheKey];
        var relevant = _allInspections.filter(function (c) {
            return c.contractorName === contractor && c.templateTitle === cleanCategory;
        });
        if (relevant.length === 0) { rateCache[cacheKey] = 0.05; return 0.05; }
        var items = 0, defects = 0;
        relevant.forEach(function (c) {
            if (c.metrics) {
                items += c.metrics.checkedCount || 10;
                defects += (c.metrics.n_B2_fail || 0) + (c.metrics.n_B3_fail || 0);
            }
        });
        rateCache[cacheKey] = items === 0 ? 0.05 : (defects / items);
        return rateCache[cacheKey];
    };

    var matrixMap = {};
    records.forEach(function (r) {
        var c = r.contractor;
        if (!c) return;
        var effectiveCategory = r.category_corrected && r.ai_category ? r.ai_category : r.category;
        var rawCats = effectiveCategory
            ? effectiveCategory.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
            : ['Без категории'];
        rawCats.forEach(function (raw) {
            var strippedRaw = raw.replace(/^\d+[\.,]\s*/, '').trim();
            var catKey = typeof sk_normalizeCategoryKey === 'function' ? sk_normalizeCategoryKey(raw) : strippedRaw;
            var cleanCat = (window.skCategoryMap && window.skCategoryMap[catKey]) || strippedRaw;
            if (!cleanCat || cleanCat.trim() === '') cleanCat = 'Без категории';
            var matrixKey = c + '_||_' + cleanCat;
            if (!matrixMap[matrixKey]) {
                matrixMap[matrixKey] = { contractor: c, category: cleanCat, total: 0 };
            }
            matrixMap[matrixKey].total++;
        });
    });

    var snapshot = {};
    Object.keys(matrixMap).forEach(function (key) {
        var m = matrixMap[key];
        if (m.category === 'Без категории') return;
        var isLinked = rbiContractors.includes(String(m.contractor).toLowerCase().trim()) ||
            Object.values(window.skContractorMap || {}).map(function (v) {
                return String(v).toLowerCase().trim();
            }).includes(String(m.contractor).toLowerCase().trim());
        if (!isLinked) return;
        var volKey = Object.keys(volumes).find(function (k) {
            return k.toLowerCase().trim() === m.category.toLowerCase().trim();
        });
        if (!volKey) return;
        var vol = volumes[volKey].amount;
        var expected = Math.round(vol * getRate(m.contractor, m.category));
        if (expected < 1) expected = 1;
        var isd = Math.round((m.total / expected) * 100);
        snapshot[key] = { contractor: m.contractor, category: m.category, isd: isd, expected: expected, total: m.total };
    });
    return snapshot;
}

function _skGameLogOnce(action, target, opts) {
    opts = opts || {};
    var logs = window.gameActionLogs || [];
    if (opts.oncePerDay) {
        var today = new Date().toDateString();
        if (logs.some(function (l) {
            return l.action === action && l.target === target && new Date(l.date).toDateString() === today;
        })) return false;
    } else if (logs.some(function (l) { return l.action === action && l.target === target; })) {
        return false;
    }
    _gameLogAction(action, target);
    return true;
}

/**
 * Сравнивает текущий ИСД с последним снимком: красный ИСД (+15), улучшение (+40).
 * @param {{fromImport?: boolean}} [options]
 */
async function sk_evaluateIsdXpRewards(options) {
    options = options || {};
    var snapshot = sk_computeIsdSnapshot();
    var storeName = _storage().stores().SK_ISD_HISTORY;
    if (!storeName) return snapshot;

    var prevMap = {};
    var hasPrevSnapshot = false;
    try {
        var all = (await _storage().getAll(storeName)) || [];
        var latest = all.find(function (x) { return x && x.id === 'latest'; });
        if (!latest && all.length) {
            latest = all.slice().sort(function (a, b) {
                return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
            })[0];
        }
        if (latest && latest.data && typeof latest.data === 'object') {
            prevMap = latest.data;
            hasPrevSnapshot = Object.keys(prevMap).length > 0;
        }
    } catch (e) {
        console.warn('[ПК СК] Не удалось прочитать историю ИСД', e);
    }

    var redCount = 0;
    var improvedCount = 0;
    Object.keys(snapshot).forEach(function (key) {
        var cur = snapshot[key];
        var old = prevMap[key];
        if (cur.isd < 20) {
            // Красный: только переход из не-красного, либо первый импорт (не спамим с дашборда)
            var becameRed = old && typeof old.isd === 'number' && old.isd >= 20;
            var initialOnImport = options.fromImport && !hasPrevSnapshot;
            if (becameRed || initialOnImport) {
                if (_skGameLogOnce('sk_red_isd_found', key, { oncePerDay: true })) redCount++;
            }
        }
        if (old && typeof old.isd === 'number' && (cur.isd - old.isd) >= 15) {
            if (_skGameLogOnce('sk_isd_improved', key, { oncePerDay: true })) improvedCount++;
        }
    });

    try {
        await _storage().put(storeName, {
            id: 'latest',
            data: snapshot,
            updatedAt: new Date().toISOString(),
            source: 'local',
            syncStatus: 'not_synced',
            sync_status: 'not_synced'
        });
    } catch (e) {
        console.warn('[ПК СК] Не удалось сохранить снимок ИСД', e);
    }

    if (redCount > 0) showToast(_t('quality.sk.toast.red_isd_xp', '🔄 Найден красный ИСД: +{xp} XP', { xp: redCount * 15 }));
    else if (improvedCount > 0) showToast(_t('quality.sk.toast.isd_improved_xp', '🔄 ИСД улучшился: +{xp} XP', { xp: improvedCount * 40 }));

    return snapshot;
}

async function sk_generateAnomalyTasks() {
    var _allInspections = _inspections();
    if (!window.skRecords || window.skRecords.length === 0) return;
    if (!_getTasks().length && !Array.isArray(_getTasks())) return;
    var skIssues = { open: [], cmi: [] };
    var contrMap = {};
    window.skRecords.forEach(function (r) {
        if (r.is_deleted || r._deleted) return;
        var c = r.contractor;
        if (!contrMap[c]) contrMap[c] = { total: 0, open: 0, overdueCount: 0, closedCount: 0, closedOnTimeCount: 0, overdueDaysArr: [] };
        var data = contrMap[c];
        data.total++;
        var isOpen = r.status && r.status.toLowerCase().includes('не устран');
        if (isOpen) data.open++;
        var deadline = r.deadline ? new Date(r.deadline) : null;
        var resolved = r.date_resolved ? new Date(r.date_resolved) : null;
        var now = new Date();
        if (resolved && !isOpen) data.closedCount++;
        if (deadline) {
            if (isOpen && now > deadline) { data.overdueCount++; data.overdueDaysArr.push(Math.floor((now - deadline) / (1000 * 60 * 60 * 24))); }
            else if (!isOpen && resolved) {
                if (resolved > deadline) { data.overdueCount++; data.overdueDaysArr.push(Math.floor((resolved - deadline) / (1000 * 60 * 60 * 24))); }
                else { data.closedOnTimeCount++; }
            }
        }
    });
    var rbiContractors = [...new Set(_allInspections.map(function (c) { return c.contractorName ? c.contractorName.toLowerCase().trim() : ''; }))];
    for (var cName in contrMap) {
        var data = contrMap[cName];
        var isLinked = rbiContractors.includes(cName.toLowerCase().trim()) || Object.values(window.skContractorMap || {}).includes(cName);
        if (isLinked) {
            if (data.open > 2) skIssues.open.push(cName);
            var overduePerc = data.total > 0 ? Math.round((data.overdueCount / data.total) * 100) : 0;
            var avgOverdueDepth = data.overdueDaysArr.length > 0 ? Math.round(data.overdueDaysArr.reduce(function (a, b) { return a + b; }, 0) / data.overdueDaysArr.length) : 0;
            var onTimePerc = data.closedCount > 0 ? Math.round((data.closedOnTimeCount / data.closedCount) * 100) : 100;
            var cmi = 100;
            if (data.total > 0) { cmi = Math.round((onTimePerc * 0.6) + ((100 - overduePerc) * 0.4) - Math.min(avgOverdueDepth, 30)); cmi = Math.max(0, Math.min(100, cmi)); }
            if (cmi < 70 && data.total > 2) skIssues.cmi.push(cName);
        }
    }
    var taskTitle = 'Анализ проблем ПК СК';
    var activeTasks = _getTasks().filter(function (t) { return t.title === taskTitle && t.status === 'pending'; });
    if (activeTasks.length > 1) {
        for (var i = 1; i < activeTasks.length; i++) { activeTasks[i]._deleted = true; await _storage().put(_storage().stores().TASKS, activeTasks[i]); }
        _setTasks(_getTasks().filter(function (t) { return !t._deleted; }));
    }
    var existingTask = _getTasks().find(function (t) { return t.title === taskTitle && t.status === 'pending'; });
    if (skIssues.open.length === 0 && skIssues.cmi.length === 0) {
        if (existingTask) { existingTask.status = 'done'; existingTask.done = 1; existingTask.resultComment = 'Показатели в норме'; existingTask.updatedAt = new Date().toISOString(); await _storage().put(_storage().stores().TASKS, existingTask); window.RBI.events.emit('tasks:refresh', {}); }
    } else {
        var promptLines = [];
 if (skIssues.open.length > 0) promptLines.push(' Много открытых замечаний:\n- ' + [...new Set(skIssues.open)].join('\n- '));
        if (skIssues.cmi.length > 0) promptLines.push('⏱ Низкий Индекс Зрелости (срывы сроков):\n- ' + [...new Set(skIssues.cmi)].join('\n- '));
        var fullPrompt = 'Выявлены проблемы по СВЯЗАННЫМ подрядчикам в Стройконтроле:\n\n' + promptLines.join('\n\n');
        if (existingTask) {
            if (existingTask.prompt !== fullPrompt) { existingTask.prompt = fullPrompt; existingTask.updatedAt = new Date().toISOString(); await _storage().put(_storage().stores().TASKS, existingTask); }
        } else {
            var newTask = {
                id: 'tsk_sk_systemic_alert', type: 'auto', category: 'meeting',
                engineerName: sk_getCurrentUserName(), inspectorName: sk_getCurrentUserName(),
                icon: 'Совещание', taskType: 'Аналитика СК', contractor: 'Системная',
                project: (document.getElementById('inp-project') && document.getElementById('inp-project').value) || 'Все',
                templateKey: '', workTitle: 'Аналитика СК', title: taskTitle, prompt: fullPrompt,
                status: 'pending', priorityLvl: 3, date: new Date().toISOString(),
                target: 1, done: 0, carryOverCount: 0,
                history: ['[' + new Date().toLocaleDateString('ru-RU') + '] Задача создана модулем ПК СК.'],
                updatedAt: new Date().toISOString(), _deleted: false
            };
            _getTasks().unshift(newTask);
            await _storage().put(_storage().stores().TASKS, newTask);
        }
        window.RBI.events.emit('tasks:refresh', {});
    }
}

// =========================================================================
// МОДУЛЬ + РЕГИСТРАЦИЯ В RBI.registry (ключ 'sk')
// =========================================================================
var skModule = {
    _ctx: null,
    _mounted: false,

    init: function (ctx) {
        this._ctx = ctx || {};
        console.log('[sk] init');
    },

    mount: function (root, params) {
        this._mounted = true;
        console.log('[sk] mount', params || {});
        if (typeof sk_renderMainTab === 'function') sk_renderMainTab();
    },

    unmount: function () {
        this._mounted = false;
        console.log('[sk] unmount');
    },

    loadData: function () { return sk_loadData(); },
    renderMainTab: function () { return sk_renderMainTab(); },
    switchView: function (view) { return sk_switchView(view); },
    sortHrTable: function (col) { return sk_sortHrTable(col); },
    handleExcelImport: function (e) { return sk_handleExcelImport(e); },
    showMappingModal: function (h, s) { return sk_showMappingModal(h, s); },
    executeImport: function (m) { return sk_executeImport(m); },
    showNormalizationModal: function () { return sk_showNormalizationModal(); },
    resolvePair: function (i, m) { return sk_resolvePair(i, m); },
    finalizeImport: function () { return sk_finalizeImport(); },
    normalizeCategoryKey: function (v) { return sk_normalizeCategoryKey(v); },
    renderDashboard: function () { return sk_renderDashboard(); },
    renderHrTab: function () { return sk_renderHrTab(); },
    renderContractorQueueBanner: function () { return sk_renderContractorQueueBanner(); },
    showInfoModal: function (t) { return window.sk_showInfoModal && window.sk_showInfoModal(t); },
    renderVolumes: function () { return sk_renderVolumes(); },
    addVolume: function () { return sk_addVolume(); },
    deleteVolume: function (n) { return sk_deleteVolume(n); },
    clearData: function () { return sk_clearData(); },
    deleteRecord: function (id) { return sk_deleteRecord(id); },
    openCategoryLinkModal: function (c) { return window.sk_openCategoryLinkModal && window.sk_openCategoryLinkModal(c); },
    saveCategoryLink: function (c) { return sk_saveCategoryLink(c); },
    openContractorLinkModal: function () { return sk_openContractorLinkModal(); },
    closeContractorLinkModal: function () { return sk_closeContractorLinkModal(); },
    fillContractorSuggestion: function () { return sk_fillContractorSuggestion(); },
    saveContractorLink: function () { return sk_saveContractorLink(); },
    generateAnomalyTasks: function () { return sk_generateAnomalyTasks(); }
};

if (window.RBI && window.RBI.registry) {
    window.RBI.registry.register('sk', skModule);
    console.log('[sk] registered in RBI.registry');
} else {
    console.warn('[sk] RBI.registry недоступен — модуль работает автономно');
}

// Фоновая предзагрузка при старте (модуль может подключиться после DCL)
if (typeof document !== 'undefined') {
    var _skPreload = function () {
        setTimeout(function () {
            if (typeof sk_loadData === 'function') sk_loadData().catch(function () {});
        }, 2500);
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _skPreload);
    } else {
        _skPreload();
    }
}

// ═══ Fallback-регистрация: legacy-заглушка до загрузки ES-модуля sk.module.js ═══
if (window.RBI && window.RBI.registry && !window.RBI.registry.has('module.sk')) {
    window.RBI.registry.register('module.sk', {
        id: 'sk',
        _isLegacyStub: true,
        init: function () {},
        mount: function () {
            if (typeof window.sk_renderMainTab === 'function') window.sk_renderMainTab();
        },
        unmount: function () {}
    });
}

// =========================================================================
// SKActions — фасад для sk.module.js (ctx.sk после bindCtx)
// =========================================================================

function getService() {
    return window.SKActions && window.SKActions._ctx && window.SKActions._ctx.sk;
}

function emitEvent(name, payload) {
    var events = window.SKActions && window.SKActions._ctx && window.SKActions._ctx.events;
    if (events && typeof events.emit === 'function') {
        events.emit(name, payload);
    }
}

export const SKActions = {

    _ctx: null,

    bindCtx(ctx) {
        this._ctx = ctx;
    },

    /**
     * Загружает данные SK через локальную sk_loadData() (та же файловая
     * область видимости, что и SKActions — прямой внутрифайловый вызов).
     *
     * После загрузки синхронизирует SKState с уже заполненными window.sk* переменными.
     */
    async loadData() {
        try {
            await sk_loadData();
            // Синхронизируем SKState с window.sk* (заполненными выше)
            SKState.records       = window.skRecords       || [];
            SKState.volumes       = window.skVolumes       || {};
            SKState.contractorMap = window.skContractorMap || {};
            SKState.categoryMap   = window.skCategoryMap   || {};
            SKState.mapping       = window.skMapping        || null;

            emitEvent('sk:loaded', { records: SKState.records });
            console.log('[SKActions] loadData complete, records:', SKState.records.length);
        } catch (e) {
            console.error('[SKActions] ошибка loadData:', e);
        }
    },

    /**
     * Сохраняет запись СК через sk.service.js, обновляет SKState.records.
     */
    async saveRecord(data) {
        var svc = getService();
        if (!svc) { console.error('[SKActions] sk service недоступен'); return null; }

        var saved = await svc.saveSkRecord(data);

        var idx = SKState.records.findIndex(function (r) { return r.id === saved.id; });
        if (idx !== -1) {
            SKState.records[idx] = saved;
        } else {
            SKState.records.push(saved);
        }
        window.skRecords = SKState.records;

        emitEvent('sk:record:saved', { id: saved.id, record: saved });
        console.log('[SKActions] saveRecord:', saved.id);
        return saved;
    },

    /**
     * Мягкое удаление записи СК через sk.service.js, обновляет SKState.records.
     */
    async deleteRecord(id) {
        var svc = getService();
        if (!svc) { console.error('[SKActions] sk service недоступен'); return null; }

        var deleted = await svc.deleteSkRecord(id);

        SKState.setRecords(SKState.records.filter(function (r) { return r.id !== id; }));

        emitEvent('sk:record:deleted', { id: id });
        console.log('[SKActions] deleteRecord:', id);
        return deleted;
    },

    /**
     * Загружает историю ИСД.
     */
    async loadIsdHistory() {
        var svc = getService();
        if (!svc) { console.error('[SKActions] sk service недоступен'); return []; }

        try {
            var history = await svc.getIsdHistory();
            return history || [];
        } catch (e) {
            console.error('[SKActions] ошибка loadIsdHistory:', e);
            return [];
        }
    }
};

// Публикация в window для доступа из legacy-кода
if (typeof window !== 'undefined') {
    window.SKActions = SKActions;
}

console.log('[SKActions] sk.actions.js loaded (real logic, v2.0)');

export {
    sk_similarity,
    sk_cleanContractorName,
    sk_extractStandards,
    sk_normalizeCategoryKey,
    sk_sortHrTable,
    sk_loadData,
    sk_clearData,
    sk_switchView,
    sk_addVolume,
    sk_deleteVolume,
    sk_handleExcelImport,
    sk_executeImport,
    sk_resolvePair,
    sk_finalizeImport,
    sk_deleteRecord,
    sk_saveCategoryLink,
    sk_openContractorLinkModal,
    sk_saveContractorLink,
    sk_generateAnomalyTasks,
    sk_computeIsdSnapshot,
    sk_evaluateIsdXpRewards
};
