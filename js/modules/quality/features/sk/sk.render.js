/**
 * sk.render.js
 * Рендер-владелец модуля SK (Стройконтроль). Реализация перенесена 1:1 из
 * sk.legacy.js (удалён) — по образцу settings.render.js: render.js и
 * sk.actions.js — независимые файлы без общего module-scope, поэтому
 * _storage()/_inspections() здесь — собственные копии (используются только
 * функциями этого файла), не импорт из sk.actions.js.
 */

import { sk_loadData, sk_switchView, sk_executeImport, sk_normalizeCategoryKey, SKActions } from './sk.actions.js';
import { skAnalyticRecords, skPlaceFilterHtml, skLoadChoices, skRefreshLinksCount, skPendingCount } from './sk.links.js';

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

function _skFieldLabel(fieldId, fallback) {
    return _t('quality.sk.field.' + fieldId, fallback);
}

function _skDisplayCategory(cat) {
    if (cat === 'Без категории') return _t('quality.sk.display.uncategorized', 'Без категории');
    return cat;
}

function _skDisplayProject(name) {
    if (name === 'Объект не определен') return _t('quality.sk.display.project_undefined', 'Объект не определен');
    return name;
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

// Фаза (перенос из sk.legacy.js): единая точка доступа к IndexedDB через
// StorageService или fallback — локальная копия, нужна только
// sk_getPendingContractorsQueue() (используется sk_renderContractorQueueBanner).
function _templates() {
    return (SKActions._ctx && SKActions._ctx.templates) || window.RBI.services.templates;
}

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

function _analyticsFilters() {
    if (SKActions._ctx && SKActions._ctx.analytics) {
        return SKActions._ctx.analytics.getAnalyticsFilters();
    }
    if (window.RBI && window.RBI.services && window.RBI.services.analytics) {
        return window.RBI.services.analytics.getAnalyticsFilters();
    }
    if (typeof activeMultiFilters !== 'undefined' && activeMultiFilters.analytics) {
        return activeMultiFilters.analytics;
    }
    return { project: [], contractor: [], inspector: [], template: [] };
}

// Локальная копия: единая точка доступа к данным проверок через
// InspectionService — нужна только sk_renderDashboard().
function _inspections() {
    return ((SKActions._ctx && SKActions._ctx.inspections) || window.RBI.services.inspections).getAllSync();
}

// Локальная копия очереди неподтверждённых подрядчиков — нужна только
// sk_renderContractorQueueBanner(). Основная копия (используемая
// sk_openContractorLinkModal) — в sk.actions.js.
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

// Локальная копия SK_FIELDS — нужна только sk_showMappingModal(). Основная
// копия (используемая маппингом/импортом) — в sk.actions.js.
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
// РЕНДЕР-ФУНКЦИИ (ПУБЛИЧНЫЙ API, window.*)
// =========================================================================

async function sk_renderContractorQueueBanner() {
    var banner = document.getElementById('sk-contractor-queue-banner');
    if (!banner) return;
    var queue = await sk_getPendingContractorsQueue();
    if (!queue.length) {
        banner.innerHTML = '';
        banner.classList.add('hidden');
        return;
    }
    banner.classList.remove('hidden');
    banner.innerHTML = `
        <div class="mb-4 p-3 rounded-2xl border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800 shadow-sm">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="text-rbi-body font-black uppercase text-yellow-800 dark:text-yellow-300">
                        ${_t('quality.sk.queue.title', 'Найдены неподтверждённые подрядчики')}
                    </div>
                    <div class="text-rbi-caption font-bold text-yellow-700 dark:text-yellow-400 mt-1 leading-snug">
                        ${_t('quality.sk.queue.description', 'Система нашла {count} названий подрядчиков из ПК СК, которые нужно связать со справочником. После связи они будут распознаваться автоматически.', { count: queue.length })}
                    </div>
                </div>
                <button onclick="sk_openContractorLinkModal()"
                    class="shrink-0 bg-yellow-500 text-white px-3 py-2 rounded-xl text-rbi-caption font-black uppercase shadow active:scale-95">
                    ${_t('quality.sk.queue.link', 'Связать')}
                </button>
            </div>
        </div>
    `;
}

async function sk_renderMainTab() {
    var container = document.getElementById('sk-main-container');
    if (!container) return;

    if ((!window.skRecords || window.skRecords.length === 0) && !document.getElementById('sk-view-dashboard')) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20">
                <svg class="animate-spin h-8 w-8 text-brand mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <div class="text-rbi-caption font-bold text-muted uppercase tracking-widest">${_t('quality.sk.loading', 'Чтение базы Стройконтроля...')}</div>
            </div>`;
        await sk_loadData();
    }

    var minD = null, maxD = null;
    window.skRecords.forEach(function (r) {
        if (r.date_issued) {
            var d = new Date(r.date_issued);
            if (!minD || d < minD) minD = d;
            if (!maxD || d > maxD) maxD = d;
        }
    });
    var periodStr = (minD && maxD)
        ? _t('quality.sk.period.from_to', 'с {from} по {to}', { from: minD.toLocaleDateString('ru-RU'), to: maxD.toLocaleDateString('ru-RU') })
        : _t('quality.sk.period.undefined', 'Не определен');

    var permSvc = (SKActions._ctx && SKActions._ctx.permissions) || window.RBI.services.permissions;
    var role = permSvc ? permSvc.getCurrentRole() : 'guest';
    var canSeeHr = role !== 'guest';
    var canUploadSk = permSvc ? permSvc.canManageSK() : false;

    var hrBtnHtml = canSeeHr ? `<button onclick="sk_switchView('hr')" id="sk-btn-hr" class="shrink-0 px-4 bg-[var(--card-bg)] text-muted border border-[var(--card-border)] py-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95 transition-colors shadow-sm flex items-center gap-1.5"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg> ${_t('quality.sk.tab.hr', 'Инженеры СК')}</button>` : '';

    var needsFullRender = !document.getElementById('sk-view-dashboard') || !!window.__rbiSkForceI18nRemount;
    if (window.__rbiSkForceI18nRemount) window.__rbiSkForceI18nRemount = false;

    if (needsFullRender) {
        var html = `
            <div id="sk-contractor-queue-banner" class="hidden"></div>
            <div class="bg-[var(--card-bg)] p-4 rounded-2xl border border-[var(--card-border)] shadow-sm mb-4">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h2 class="text-rbi-body font-bold uppercase tracking-tight text-ink dark:text-white flex items-center gap-1.5">
                            <svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            ${_t('quality.sk.title.data', 'Данные ПК Стройконтроль')}
                        </h2>
                        <p class="text-rbi-caption text-muted font-bold mt-1">${_t('quality.sk.total_in_db_before', 'Всего в базе:')} <b id="sk-total-count" class="text-brand">${window.skRecords.length}</b> ${_t('quality.sk.total_in_db_after', 'позиций')}</p>
                        <p id="sk-period-text" class="text-rbi-caption text-muted font-bold mt-0.5 uppercase tracking-widest">${_t('quality.sk.period.label', 'Период: {period}', { period: periodStr })}</p>
                    </div>
                    <div class="flex gap-2">
                    ${canUploadSk ? `
                        <button onclick="sk_clearData()" class="w-10 h-10 bg-danger-soft text-danger border border-danger-soft rounded-xl flex items-center justify-center shadow-sm active:scale-90 transition-transform" title="${_t('quality.sk.clear_db.title', 'Очистить базу СК')}">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                        <button onclick="document.getElementById('sk-excel-input').click()" class="bg-brand text-white px-4 py-2 rounded-xl text-rbi-label font-bold uppercase shadow-md active:scale-95 flex items-center gap-1.5 h-10">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"></path></svg> ${_t('quality.sk.import', 'Импорт')}
                        </button>
                    ` : `
                        <div class="text-rbi-caption text-muted font-bold bg-surface px-3 py-2 rounded-xl border border-[var(--card-border)]">
                        ${_t('quality.sk.view_only', 'Только просмотр')}
                        </div>
                    `}
                    </div>
                </div>
            </div>

            <div class="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar pb-1">
                <button onclick="sk_switchView('dashboard')" id="sk-btn-dashboard" class="shrink-0 px-4 bg-brand-soft text-brand border border-brand-soft py-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95 transition-colors shadow-sm flex items-center gap-1.5"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"></path></svg> ${_t('quality.sk.tab.dashboard', 'Дашборд')}</button>
                <button onclick="sk_switchView('volumes')" id="sk-btn-volumes" class="shrink-0 px-4 bg-[var(--card-bg)] text-muted border border-[var(--card-border)] py-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95 transition-colors shadow-sm flex items-center gap-1.5"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> ${_t('quality.sk.tab.volumes', 'Объемы')}</button>
                ${hrBtnHtml}
                <button onclick="sk_switchView('links')" id="sk-btn-links" class="shrink-0 px-4 bg-[var(--card-bg)] text-muted border border-[var(--card-border)] py-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95 transition-colors shadow-sm flex items-center gap-1.5"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"></path></svg> ${_t('quality.sk.tab.links', 'Разобрать')}<span data-sk-links-count class="${skPendingCount() ? '' : 'hidden '}min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] leading-[18px] text-center">${skPendingCount() || ''}</span></button>
            </div>

            <div id="sk-view-dashboard" class="block"></div>
            <div id="sk-view-volumes" class="hidden"></div>
            <div id="sk-view-hr" class="hidden"></div>
            <div id="sk-view-links" class="hidden"></div>
        `;
        container.innerHTML = html;
    } else {
        var countEl = document.getElementById('sk-total-count');
        var periodEl = document.getElementById('sk-period-text');
        if (countEl) countEl.innerText = window.skRecords.length;
        if (periodEl) periodEl.innerText = _t('quality.sk.period.label', 'Период: {period}', { period: periodStr });
    }

    if (typeof sk_renderContractorQueueBanner === 'function') {
        sk_renderContractorQueueBanner().catch(function (e) { console.warn(e); });
    }
    // P2-0076: счётчик «Разобрать» и подписи «Компании» для Аналитики (первая загрузка подписей — перерисовать дашборд)
    skRefreshLinksCount();
    var hadChoices = !!window.__skCoreChoicesLoaded;
    skLoadChoices(false).then(function (ch) {
        window.__skCoreChoicesLoaded = !!ch;
        if (ch && !hadChoices && (window.skCurrentSubTab || 'dashboard') === 'dashboard') {
            if (typeof window.__anaDeskPaintSk === 'function' && document.getElementById('sub-sk') && document.getElementById('sub-sk').classList.contains('ana-desk-sk')) window.__anaDeskPaintSk();
            else sk_renderDashboard();
        }
    }).catch(function () {});

    var targetTab = window.skCurrentSubTab || 'dashboard';
    if (typeof sk_renderVolumes === 'function') sk_renderVolumes();
    if (typeof sk_renderDashboard === 'function') sk_renderDashboard();
    if (targetTab === 'hr' && typeof sk_renderHrTab === 'function') sk_renderHrTab();
    sk_switchView(targetTab);
    // Аналитика B4: shell готов — можно reuse при возврате на подвкладку без смены фильтра.
    if (typeof window.analyticsMarkTabPainted === 'function') {
        window.analyticsMarkTabPainted('sub-sk');
    }
}

function sk_renderVolumes() {
    var container = document.getElementById('sk-view-volumes');
    if (!container) return;
    var rowsHtml = '';
    for (var workType in window.skVolumes) {
        var v = window.skVolumes[workType];
        rowsHtml += `
            <div class="flex items-center gap-2 mb-2 bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--card-border)]">
                <div class="flex-1 text-rbi-label font-bold text-ink truncate">${workType}</div>
                <div class="w-16 text-center text-rbi-caption font-black bg-[var(--card-bg)] border border-[var(--card-border)] py-1 rounded shadow-inner">${v.amount} ${v.unit}</div>
                <button onclick="sk_deleteVolume('${workType}')" class="text-danger bg-danger-soft border border-danger-soft w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-transform"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg></button>
            </div>`;
    }
    if (!rowsHtml) rowsHtml = `<div class="text-rbi-caption text-muted text-center py-4 uppercase font-bold">${_t('quality.sk.volumes.empty', 'Справочник пуст. Укажите объемы, чтобы система рассчитывала ИСД.')}</div>`;
    container.innerHTML = `
        <div class="bg-[var(--card-bg)] p-4 rounded-xl border border-[var(--card-border)] shadow-sm">
            <h3 class="text-rbi-body font-black uppercase mb-3 text-ink dark:text-white border-b border-[var(--card-border)] pb-2">${_t('quality.sk.volumes.add_title', 'Добавить объем')}</h3>
            <div class="space-y-3 mb-4">
                <input type="text" id="sk-vol-name" class="input-base text-rbi-label" placeholder="${_t('quality.sk.volumes.name_placeholder', 'Вид работ (например: Окна ПВХ)')}">
                <div class="flex gap-2">
                    <input type="number" id="sk-vol-amount" class="input-base text-rbi-label flex-1" placeholder="${_t('quality.sk.volumes.amount_placeholder', 'Кол-во (напр: 280)')}">
                    <input type="text" id="sk-vol-unit" class="input-base text-rbi-label w-20 text-center" placeholder="${_t('quality.sk.volumes.unit_placeholder', 'Ед. (шт)')}">
                </div>
                <button onclick="sk_addVolume()" class="w-full bg-green-50 text-green-700 border border-green-200 py-3.5 rounded-xl text-rbi-label font-black uppercase tracking-widest active:scale-95 shadow-sm transition-transform">${_t('quality.sk.volumes.save', 'Сохранить')}</button>
            </div>
            <h3 class="text-rbi-body font-black uppercase mb-3 text-ink dark:text-white border-b border-[var(--card-border)] pb-2 mt-4">${_t('quality.sk.volumes.current_title', 'Текущий справочник')}</h3>
            <div>${rowsHtml}</div>
        </div>`;
}

function sk_showMappingModal(fileHeaders, sampleRow) {
    var modal = document.getElementById('modal-overlay');
    var cleanHeader = function (str) {
        if (!str) return '';
        return str.toLowerCase().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    };
    var exactMatch = {
        'row_number': '№ п/п', 'number': '№ замечания', 'text': 'замечание',
        'category': 'категория замечания', 'date_issued': 'дата выдачи',
        'contractor': 'ответственная организация',
        'contractor_representative': 'представитель ответственной организации',
        'deadline': 'требуемый срок устранения', 'status': 'отметка об устранении',
        'date_resolved': 'фактическая дата устранения',
        'inspector': 'представитель организации выдавший предписание',
        'closed_by': 'представитель организации снявший предписание',
        'structure': 'элемент структуры', 'project_loc': 'расположение в проекте'
    };
    var currentMapping = {};
    var allFound = true;
    var mappingHtml = SK_FIELDS.map(function (field) {
        var bestMatchIdx = -1;
        var targetStr = exactMatch[field.id];
        bestMatchIdx = fileHeaders.findIndex(function (h) { return cleanHeader(h) === targetStr; });
        currentMapping[field.id] = bestMatchIdx;
        if (bestMatchIdx === -1) { allFound = false; console.warn('[Маппинг] Не найдена колонка: "' + targetStr + '"'); }
        var options = '<option value="-1">' + _t('quality.sk.mapping.skip', '-- Пропустить (Не загружать) --') + '</option>';
        fileHeaders.forEach(function (h, idx) {
            if (!h) return;
            var sampleText = sampleRow[idx] ? _t('quality.sk.mapping.sample', ' (напр: {sample})', { sample: String(sampleRow[idx]).substring(0, 15) }) : '';
            var selected = (idx === bestMatchIdx) ? 'selected' : '';
            options += '<option value="' + idx + '" ' + selected + '>' + h + sampleText + '</option>';
        });
        return `
            <div class="mb-3 bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--card-border)] shadow-sm">
                <div class="text-rbi-caption font-black text-brand uppercase mb-1">${_skFieldLabel(field.id, field.name)}</div>
                <select class="sk-mapping-select input-base !py-1.5 text-rbi-label" data-field="${field.id}">${options}</select>
            </div>`;
    }).join('');

    if (allFound) {
        showToast(_t('quality.sk.mapping.recognized', '✨ Стандартный файл распознан! Начинаем загрузку...'));
        window.skMapping = currentMapping;
        setTimeout(function () { sk_executeImport(currentMapping); }, 300);
        return;
    }

    document.getElementById('modal-icon').innerHTML = `<div class="w-12 h-12 bg-brand-soft text-brand rounded-xl flex items-center justify-center text-2xl mx-auto mb-2 border border-brand-soft">🔗</div>`;
    document.getElementById('modal-title').innerHTML = `<div class="text-center font-black uppercase text-lg">${_t('quality.sk.mapping.title', 'Связь колонок')}</div>`;
    document.getElementById('modal-body').innerHTML = `
        <div class="text-center text-rbi-caption text-muted mb-2 leading-relaxed">${_t('quality.sk.mapping.description', 'Система не смогла автоматически распознать все колонки. Проверьте связь вручную.')}</div>
        <button onclick="window.RBI.services.ai.sk_aiMapColumns()" id="btn-ai-mapping" class="w-full bg-surface text-brand border border-brand-soft py-2 rounded-lg font-bold text-rbi-caption uppercase mb-4 active:scale-95 transition-colors flex justify-center items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> ${_t('quality.sk.mapping.ai_guess', 'Угадать через ИИ (DeepSeek)')}
        </button>
        <div class="max-h-[40vh] overflow-y-auto custom-scrollbar pr-1 mb-4">${mappingHtml}</div>
        <div class="flex gap-2">
            <button onclick="closeModal()" class="flex-1 bg-surface text-muted py-3.5 rounded-xl font-bold text-rbi-label uppercase active:scale-95 border">${_t('quality.sk.mapping.cancel', 'Отмена')}</button>
            <button onclick="sk_executeImport()" class="flex-1 bg-brand text-white py-3.5 rounded-xl font-black text-rbi-label uppercase shadow-md active:scale-95">${_t('quality.sk.mapping.load', '▶ Загрузить')}</button>
        </div>
    `;
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
}

function sk_showNormalizationModal() {
    var modal = document.getElementById('modal-overlay');
    var pairsHtml = window.skTempPairsToConfirm.map(function (pair, idx) {
        return `
        <div class="bg-surface border border-surface p-3 rounded-xl shadow-sm mb-3" id="norm-pair-${idx}">
            <div class="text-rbi-caption font-bold text-muted uppercase mb-2 text-center">${_t('quality.sk.norm.similarity', 'Сходство: {score}%', { score: pair.score })}</div>
            <div class="flex justify-between items-center gap-2 mb-3">
                <div class="flex-1 bg-danger-soft p-2 rounded border border-danger-soft text-center">
                    <div class="text-rbi-caption uppercase text-danger font-bold mb-0.5">${_t('quality.sk.norm.new_excel', 'Новое из Excel:')}</div>
                    <div class="text-rbi-label font-black text-ink dark:text-white leading-tight">${pair.raw}</div>
                </div>
                <div class="text-muted">➡️</div>
                <div class="flex-1 bg-green-50 dark:bg-green-900/10 p-2 rounded border border-green-200 text-center">
                    <div class="text-rbi-caption uppercase text-green-600 font-bold mb-0.5">${_t('quality.sk.norm.in_rbi', 'В базе RBI:')}</div>
                    <div class="text-rbi-label font-black text-ink dark:text-white leading-tight">${pair.target}</div>
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="sk_resolvePair(${idx}, false)" class="flex-1 bg-surface text-muted py-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95 border border-surface">${_t('quality.sk.norm.different', 'Разные')}</button>
                <button onclick="sk_resolvePair(${idx}, true)" class="flex-1 bg-brand text-white py-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95 shadow-sm">${_t('quality.sk.norm.merge', 'Объединить')}</button>
            </div>
        </div>`;
    }).join('');
    document.getElementById('modal-icon').innerHTML = `<div class="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center text-2xl mx-auto mb-2 border border-orange-200">🤝</div>`;
    document.getElementById('modal-title').innerHTML = `<div class="text-center font-black uppercase text-lg">${_t('quality.sk.norm.title', 'Одинаковые организации?')}</div>`;
    document.getElementById('modal-body').innerHTML = `
        <div class="text-center text-rbi-caption text-muted mb-4 leading-relaxed">
            ${_t('quality.sk.norm.description', 'Система нашла похожие названия компаний. Подтвердите, чтобы в отчетах они не разваливались на две разные строки.')}
        </div>
        <div class="max-h-[50vh] overflow-y-auto custom-scrollbar pr-1 mb-4" id="norm-pairs-container">
            ${pairsHtml}
        </div>`;
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
}

function sk_renderDashboard() {
    var _allInspections = _inspections();
    var container = document.getElementById('sk-view-dashboard');
    if (!container) return;

    if (window.skRecords.length === 0) {
        container.innerHTML = `<div class="text-center py-10 bg-[var(--card-bg)] rounded-xl border border-dashed border-surface text-muted text-rbi-label font-bold uppercase tracking-widest shadow-sm">${_t('quality.sk.dashboard.no_data', 'Нет данных. Загрузите файл Excel.')}</div>`;
        return;
    }

    var activeRecords = window.skRecords;
    if (window.analyticsDataMode === 'cloud') {
        activeRecords = activeRecords.filter(function (r) { return r.source === 'cloud' || r.syncStatus === 'synced' || r.sync_status === 'synced'; });
    }

    // Multifilter без периода — база для тренда (всегда «за всё время»).
    if (_analyticsFilters().project.length > 0) {
        var fProj0 = _analyticsFilters().project;
        activeRecords = activeRecords.filter(function (r) { return fProj0.includes(r.project_display_name) || fProj0.includes(r.project_canonical_key) || fProj0.includes(r.display_name); });
    }
    if (_analyticsFilters().contractor.length > 0) {
        var fContr0 = _analyticsFilters().contractor;
        activeRecords = activeRecords.filter(function (r) { return fContr0.includes(r.contractor_name) || fContr0.includes(r.contractor_canonical_key) || fContr0.includes(r.contractor); });
    }
    if (_analyticsFilters().inspector.length > 0) {
        var fInsp0 = _analyticsFilters().inspector;
        activeRecords = activeRecords.filter(function (r) { return fInsp0.includes(r.issued_by) || fInsp0.includes(r.inspector); });
    }
    if (_analyticsFilters().template.length > 0) {
        var fTmpl0 = _analyticsFilters().template.map(function (t) { return t.toLowerCase(); });
        activeRecords = activeRecords.filter(function (r) { return fTmpl0.includes((r.category || '').toLowerCase()); });
    }

    // P2-0076: подрядчик, вид работ, место — по id «Компании» (копии записей); фильтр по месту
    var placeFilterHtml = skPlaceFilterHtml(activeRecords, 'onchange="sk_setPlaceFilter(this.value)"');
    activeRecords = skAnalyticRecords(activeRecords);
    var trendRecords = activeRecords.slice();

    var selPeriod = document.getElementById('global-filter-period') && document.getElementById('global-filter-period').value || 'D30';
    var now = new Date();
    var periodNorm = typeof window.normalizeAnalyticsPeriod === 'function' ? window.normalizeAnalyticsPeriod(selPeriod) : selPeriod;
    var periodDays = typeof window.getAnalyticsPeriodDays === 'function' ? window.getAnalyticsPeriodDays(selPeriod) : null;
    if (periodNorm === 'CUSTOM') {
        var dFrom = document.getElementById('filter-date-from') && document.getElementById('filter-date-from').value;
        var dTo = document.getElementById('filter-date-to') && document.getElementById('filter-date-to').value;
        if (dFrom) activeRecords = activeRecords.filter(function (r) { return r.date_issued && new Date(r.date_issued) >= new Date(dFrom); });
        if (dTo) { var tDate = new Date(dTo); tDate.setHours(23, 59, 59, 999); activeRecords = activeRecords.filter(function (r) { return r.date_issued && new Date(r.date_issued) <= tDate; }); }
    } else if (periodDays) {
        var fromP = new Date(now); fromP.setDate(now.getDate() - periodDays);
        activeRecords = activeRecords.filter(function (r) { return r.date_issued && new Date(r.date_issued) >= fromP; });
    }

    if (trendRecords.length === 0) {
        container.innerHTML = placeFilterHtml + `<div class="text-center py-10 bg-[var(--card-bg)] rounded-xl border border-dashed border-surface text-muted text-rbi-label font-bold uppercase tracking-widest shadow-sm">${_t('quality.sk.dashboard.no_filter_match', 'За выбранным фильтрам замечаний нет.')}</div>`;
        return;
    }

    var lblOpen = _t('quality.sk.status.open_short', 'О:');
    var lblOverdue = _t('quality.sk.status.overdue_short', 'П:');
    var lblAvgClose = _t('quality.sk.status.avg_close_short', 'С:');
    var titleOpen = _t('quality.sk.status.open_title', 'Открыто');
    var titleOverdue = _t('quality.sk.status.overdue_title', 'Просрочено');
    var titleAvgClose = _t('quality.sk.status.avg_close_title', 'Ср. дней на закрытие');

    var rbiContractors = [...new Set(_allInspections.map(function (c) { return c.contractorName ? c.contractorName.toLowerCase().trim() : ''; }))];
    var rbiDefectRatesCache = {};
    var getRbiDefectRate = function (contractor, cleanCategory) {
        var cacheKey = contractor + '_||_' + cleanCategory;
        if (rbiDefectRatesCache[cacheKey] !== undefined) return rbiDefectRatesCache[cacheKey];
        var relevantChecks = _allInspections.filter(function (c) { return c.contractorName === contractor && c.templateTitle === cleanCategory; });
        if (relevantChecks.length === 0) { rbiDefectRatesCache[cacheKey] = 0.05; return 0.05; }
        var totalItemsChecked = 0, totalDefectsFound = 0;
        relevantChecks.forEach(function (c) {
            if (c.metrics) { totalItemsChecked += c.metrics.checkedCount || 10; totalDefectsFound += (c.metrics.n_B2_fail + c.metrics.n_B3_fail); }
        });
        var rate = totalItemsChecked === 0 ? 0.05 : (totalDefectsFound / totalItemsChecked);
        rbiDefectRatesCache[cacheKey] = rate;
        return rate;
    };

    var contrMap = {}, matrixMap = {}, totalIssues = 0, totalOpen = 0, standardsMap = {};
    var skIssues = { isd: [], open: [], cmi: [] };

    var isIssueOpen = function (record) {
        if (record.is_verified_closed === true) return false;
        var normalized = record.status_normalized || '';
        if (normalized === 'verified') return false;
        var s = String(record.status || record.status_raw || '').toLowerCase().trim();
        if (s === 'проверено') return false;
        return true;
    };

    activeRecords.forEach(function (r) {
        if (r.standards && Array.isArray(r.standards)) {
            r.standards.forEach(function (std) { standardsMap[std] = (standardsMap[std] || 0) + 1; });
        }
        var c = r.contractor;
        totalIssues++;
        var isOpen = isIssueOpen(r);
        if (isOpen) totalOpen++;
        var effectiveCategory = r.category_corrected && r.ai_category ? r.ai_category : r.category;
        var rawCats = effectiveCategory ? effectiveCategory.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : ['Без категории'];
        rawCats.forEach(function (raw) {
            var strippedRaw = raw.replace(/^\d+[\.,]\s*/, '').trim();
            var catKey = sk_normalizeCategoryKey(raw);
            var cleanCat = window.skCategoryMap[catKey] || strippedRaw;
            if (cleanCat.trim() === '') cleanCat = 'Без категории';
            var matrixKey = c + '_||_' + cleanCat;
            if (!matrixMap[matrixKey]) {
                matrixMap[matrixKey] = { contractor: c, category: cleanCat, total: 0, open: 0, overdue: 0, closingDays: [], projectName: _skDisplayProject(r.project_display_name || r.projectName || r.project_canonical_key || 'Объект не определен') };
            }
            matrixMap[matrixKey].total++;
            if (isOpen) matrixMap[matrixKey].open++;
            var issued = r.date_issued ? new Date(r.date_issued) : null;
            var deadline = r.deadline ? new Date(r.deadline) : null;
            var resolved = r.date_resolved ? new Date(r.date_resolved) : null;
            var nowD = new Date();
            if (deadline) {
                if (isOpen && nowD > deadline) matrixMap[matrixKey].overdue++;
                else if (!isOpen && resolved && resolved > deadline) matrixMap[matrixKey].overdue++;
            }
            if (!isOpen && issued && resolved) {
                var daysToClose = Math.ceil((resolved - issued) / (1000 * 60 * 60 * 24));
                if (daysToClose >= 0) matrixMap[matrixKey].closingDays.push(daysToClose);
            }
        });
        if (!contrMap[c]) contrMap[c] = { total: 0, open: 0, overdueCount: 0, closingTimes: [], defects: {}, overdueDaysArr: [], closedCount: 0, closedOnTimeCount: 0 };
        var data = contrMap[c];
        data.total++;
        if (isOpen) data.open++;
        if (r.text) {
            var cleanText = r.text.toLowerCase().trim();
            cleanText = cleanText.replace(/(в осях|оси|отм\.|на отметке|кв\.|квартира)[\s\dа-яa-z\.\-\,\+]+/g, '');
            cleanText = cleanText.replace(/\d+[\.,]\d+[\.,]\d+/g, '').replace(/\d+/g, '');
            cleanText = cleanText.replace(/согласно ппр|согласно рд|по проекту|нарушение/g, '').trim();
            if (cleanText.length < 5) cleanText = r.text.substring(0, 100);
            cleanText = cleanText.charAt(0).toUpperCase() + cleanText.slice(1, 120) + (cleanText.length > 120 ? '...' : '');
            data.defects[cleanText] = (data.defects[cleanText] || 0) + 1;
        }
        var issued2 = r.date_issued ? new Date(r.date_issued) : null;
        var deadline2 = r.deadline ? new Date(r.deadline) : null;
        var resolved2 = r.date_resolved ? new Date(r.date_resolved) : null;
        var nowD2 = new Date();
        if (resolved2 && !isOpen) data.closedCount++;
        if (deadline2) {
            if (isOpen && nowD2 > deadline2) { data.overdueCount++; data.overdueDaysArr.push(Math.floor((nowD2 - deadline2) / (1000 * 60 * 60 * 24))); }
            else if (!isOpen && resolved2) {
                if (resolved2 > deadline2) { data.overdueCount++; data.overdueDaysArr.push(Math.floor((resolved2 - deadline2) / (1000 * 60 * 60 * 24))); }
                else { data.closedOnTimeCount++; }
            }
        }
        if (!isOpen && issued2 && resolved2) {
            var daysToClose2 = Math.ceil((resolved2 - issued2) / (1000 * 60 * 60 * 24));
            if (daysToClose2 >= 0) data.closingTimes.push(daysToClose2);
        }
    });

    var matrixByProject = {};
    Object.keys(matrixMap).forEach(function (key) {
        var mData = matrixMap[key];
        var pName = mData.projectName;
        if (!matrixByProject[pName]) matrixByProject[pName] = {};
        if (!matrixByProject[pName][mData.contractor]) matrixByProject[pName][mData.contractor] = [];
        matrixByProject[pName][mData.contractor].push(mData);
    });

    var matrixRows = '';
    Object.keys(matrixByProject).sort().forEach(function (projName) {
        matrixRows += `
            <details class="bg-surface mb-3 border border-surface rounded-xl overflow-hidden shadow-sm group/matrix [&_summary::-webkit-details-marker]:hidden">
                <summary class="p-3 bg-brand-soft cursor-pointer font-black text-rbi-body uppercase tracking-widest text-brand flex justify-between items-center select-none group-open/matrix:border-b border-brand-soft">
                    <span class="flex items-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg> ${_t('quality.sk.dashboard.project_label', 'Объект: {name}', { name: projName })}</span>
                    <span class="transition-transform duration-300 group-open/matrix:rotate-180 text-brand">▼</span>
                </summary>
                <div class="overflow-x-auto custom-scrollbar">
                    <table class="w-full text-left whitespace-nowrap">
                        <thead class="bg-surface text-rbi-caption text-[var(--text-muted)] uppercase shadow-sm font-bold">
                            <tr>
                                <th class="p-2.5 pl-4 border-b border-[var(--card-border)]">${_t('quality.sk.table.contractor_work', 'Подрядчик / Вид работ')}</th>
                                <th class="p-2.5 text-center border-b border-[var(--card-border)]" title="${_t('quality.sk.table.fact_expected_title', 'Сколько выдали СК / Сколько ожидаем по статистике')}">${_t('quality.sk.table.fact_expected', 'Факт / Ожидание')}</th>
                                <th class="p-2.5 text-center border-b border-[var(--card-border)]">${_t('quality.sk.table.isd', 'ИСД')}</th>
                                <th class="p-2.5 text-center border-b border-[var(--card-border)]">${_t('quality.sk.table.conclusion', 'Вывод')}</th>
                                <th class="p-2.5 text-center border-b border-[var(--card-border)]" title="${_t('quality.sk.table.execution_status_title', 'О: Открыто | П: Просрочено | С: Ср.дней закрытия')}">${_t('quality.sk.table.execution_status', 'Статус исполнения')}</th>
                            </tr>
                        </thead>
                        <tbody>`;

        var projContractors = matrixByProject[projName];
        Object.keys(projContractors).sort().forEach(function (contrName) {
            matrixRows += `<tr class="bg-[var(--hover-bg)] border-b border-[var(--card-border)]"><td colspan="5" class="p-2 pl-3 text-rbi-label font-black text-ink dark:text-white uppercase">${contrName}</td></tr>`;
            var isLinkedContr = rbiContractors.includes(contrName.toLowerCase().trim()) || Object.values(window.skContractorMap).map(function (v) { return v.toLowerCase().trim(); }).includes(contrName.toLowerCase().trim());
            projContractors[contrName].sort(function (a, b) { return b.total - a.total; }).forEach(function (mData) {
                var isdHtml = '<span class="text-rbi-caption text-muted font-bold bg-surface px-2 py-0.5 rounded">' + _t('quality.sk.isd.no_volume', 'Объем не задан') + '</span>';
                var statusBadge = '<span class="text-muted text-rbi-caption font-bold">' + _t('quality.sk.isd.insufficient_data', 'Недостаточно данных') + '</span>';
                var expectedHtml = '<span class="text-muted">-</span>';
                if (mData.category !== 'Без категории') {
                    if (!isLinkedContr) {
                        isdHtml = '<span class="text-rbi-caption text-muted font-bold uppercase border border-surface px-2 py-0.5 rounded bg-surface">' + _t('quality.sk.isd.no_rbi_base', 'Нет базы RBI') + '</span>';
                        statusBadge = '<span class="text-muted text-rbi-caption font-bold">' + _t('quality.sk.isd.not_linked', 'Не связан') + '</span>';
                    } else if (window.skVolumes) {
                        var volKey = Object.keys(window.skVolumes).find(function (k) { return k.toLowerCase().trim() === mData.category.toLowerCase().trim(); });
                        if (volKey) {
                            var vol = window.skVolumes[volKey].amount;
                            var rbiRate = getRbiDefectRate(mData.contractor, mData.category);
                            var expected = Math.round(vol * rbiRate);
                            if (expected < 1) expected = 1;
                            expectedHtml = '<span class="text-ink font-black">' + expected + '</span>';
                            var isd = Math.round((mData.total / expected) * 100);
                            var colorClass = 'text-green-600 bg-green-50 border-green-200';
                            statusBadge = '<span class="text-green-600 font-bold text-rbi-caption uppercase flex items-center justify-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-green-500"></span> ' + _t('quality.sk.isd.transparent', 'Прозрачно') + '</span>';
                            if (isd < 20) {
                                colorClass = 'text-danger bg-danger-soft border-danger-soft';
                                statusBadge = '<span class="text-danger font-bold text-rbi-caption uppercase flex items-center justify-center gap-1 animate-pulse"><span class="w-1.5 h-1.5 rounded-full bg-danger"></span> ' + _t('quality.sk.isd.hiding_defects', 'Скрывают брак') + '</span>';
                                skIssues.isd.push(mData.contractor + ' (' + mData.category + ')');
                            } else if (isd < 60) {
                                colorClass = 'text-orange-500 bg-orange-50 border-orange-200';
                                statusBadge = '<span class="text-orange-500 font-bold text-rbi-caption uppercase flex items-center justify-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span> ' + _t('quality.sk.isd.suspicious', 'Подозрительно') + '</span>';
                            }
                            isdHtml = isd > 100 ? '<span class="font-black ' + colorClass + ' px-2 py-0.5 rounded border text-rbi-label">100% <span class="text-rbi-caption opacity-70">' + _t('quality.sk.isd.excessive', '(Избыточно)') + '</span></span>' : '<span class="font-black ' + colorClass + ' px-2 py-0.5 rounded border text-rbi-body">' + isd + '%</span>';
                        }
                    }
                }
                var avgClose = mData.closingDays.length > 0 ? Math.round(mData.closingDays.reduce(function (a, b) { return a + b; }, 0) / mData.closingDays.length) : 0;
                var overColor = mData.overdue > 0 ? 'text-danger' : 'text-muted';
                var avgColor = avgClose > 14 ? 'text-orange-500' : 'text-muted';
                var groupRecords = activeRecords.filter(function (r) { return r.contractor === mData.contractor && r.category === mData.category && r.predicted_risk; });
                var aiBadge = '';
                if (groupRecords.length > 0) {
                    if (groupRecords.some(function (r) { return r.predicted_risk === 'High'; })) aiBadge = `<span class="bg-danger-soft text-danger border border-danger-soft px-1.5 py-0.5 rounded text-rbi-caption font-black uppercase shadow-sm ml-1" title="${_t('quality.sk.ai.risk_title', 'ИИ прогнозирует срыв сроков')}">${_t('quality.sk.ai.risk', '🔮 Риск')}</span>`;
                    else if (groupRecords.some(function (r) { return r.predicted_risk === 'Medium'; })) aiBadge = `<span class="bg-yellow-100 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded text-rbi-caption font-black uppercase shadow-sm ml-1">${_t('quality.sk.ai.attention', '🔮 Внимание')}</span>`;
                }
                var displayCategory = _skDisplayCategory(mData.category);
                matrixRows += `
                    <tr class="border-b border-surface bg-surface">
                        <td class="p-2.5 pl-4 text-rbi-caption font-bold ${mData.category === 'Без категории' ? 'text-muted italic' : 'text-muted'} truncate max-w-[150px]" title="${displayCategory}">
                            <div class="flex items-center gap-1.5">
                                <span class="truncate">↳ ${displayCategory}</span>
                                ${!isLinkedContr || mData.category === 'Без категории' ? '' : `<button onclick="sk_openCategoryLinkModal('${mData.category.replace(/'/g, "\\'")}')" class="text-brand hover:text-brand" title="${_t('quality.sk.link_category', 'Привязать к другому виду работ')}">🔗</button>`}
                                ${aiBadge}
                            </div>
                        </td>
                        <td class="p-2.5 text-center text-rbi-caption"><span class="font-black text-brand">${mData.total}</span> / ${expectedHtml}</td>
                        <td class="p-2.5 text-center align-middle">${isdHtml}</td>
                        <td class="p-2.5 text-center align-middle">${statusBadge}</td>
                        <td class="p-2.5 text-center text-rbi-caption font-bold align-middle whitespace-nowrap">
                            <span class="text-muted" title="${titleOpen}">${lblOpen} ${mData.open}</span> | 
                            <span class="${overColor}" title="${titleOverdue}">${lblOverdue} ${mData.overdue}</span> | 
                            <span class="${avgColor}" title="${titleAvgClose}">${lblAvgClose} ${avgClose}</span>
                        </td>
                    </tr>`;
            });
        });
        matrixRows += '</tbody></table></div></details>';
    });

    var linkedHtml = '', unlinkedHtml = '';
    var sortedContrs = Object.keys(contrMap).sort(function (a, b) { return contrMap[b].total - contrMap[a].total; });
    sortedContrs.forEach(function (cName) {
        var data = contrMap[cName];
        var isLinked = rbiContractors.includes(cName.toLowerCase().trim()) || Object.values(window.skContractorMap).includes(cName);
        var linkBadge = isLinked
            ? `<span class="bg-brand-soft text-brand border border-brand-soft px-2 py-0.5 rounded text-rbi-caption font-bold uppercase tracking-widest shadow-sm flex items-center gap-1 w-fit"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"></path></svg> ${_t('quality.sk.badge.linked', 'Связан с RBI')}</span>`
            : `<span class="bg-surface text-muted border border-surface px-2 py-0.5 rounded text-rbi-caption font-bold uppercase tracking-widest flex items-center gap-1 w-fit"><svg class="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg> ${_t('quality.sk.badge.unlinked', 'Без связи')}</span>`;
        var overduePerc = data.total > 0 ? Math.round((data.overdueCount / data.total) * 100) : 0;
        var avgOverdueDepth = data.overdueDaysArr.length > 0 ? Math.round(data.overdueDaysArr.reduce(function (a, b) { return a + b; }, 0) / data.overdueDaysArr.length) : 0;
        var onTimePerc = data.closedCount > 0 ? Math.round((data.closedOnTimeCount / data.closedCount) * 100) : 100;
        var cmi = 0;
        if (data.total > 0) {
            cmi = Math.round((onTimePerc * 0.6) + ((100 - overduePerc) * 0.4) - Math.min(avgOverdueDepth, 30));
            cmi = Math.max(0, Math.min(100, cmi));
            if (data.closedCount === 0 && data.overdueCount === 0) cmi = 100;
        }
        if (isLinked) {
            if (data.open > 5) skIssues.open.push(cName);
            if (cmi < 40 && data.total > 5) skIssues.cmi.push(cName);
        }
        var cmiColor = cmi >= 70 ? 'text-green-600' : (cmi >= 40 ? 'text-orange-500' : 'text-danger');
        var overdueColor = overduePerc > 30 ? 'text-danger' : (overduePerc > 10 ? 'text-orange-500' : 'text-green-600');
        var topDefects = Object.keys(data.defects).map(function (text) { return { text: text, count: data.defects[text] }; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 3);
        var topDefectsHtml = topDefects.length > 0 && topDefects[0].count > 1
            ? topDefects.filter(function (d) { return d.count > 1; }).map(function (d) {
                var recMatch = activeRecords.find(function (r) { return r.contractor === cName && r.text && r.text.toLowerCase().includes(d.text.replace('...', '').toLowerCase()); });
                var stdBadge = (recMatch && recMatch.standards && recMatch.standards.length > 0) ? '<div class="text-rbi-caption font-black text-blue-600 bg-blue-50 border border-blue-200 px-1 py-0.5 rounded w-fit mt-1">' + recMatch.standards.join(', ') + '</div>' : '';
                return '<div class="flex items-start gap-2 mb-1.5 border-b border-surface pb-1.5"><span class="bg-orange-100 text-orange-700 px-1.5 rounded text-rbi-caption font-black shrink-0 mt-0.5">' + _t('quality.sk.defects.count', '{count} раз', { count: d.count }) + '</span><div class="flex-1 min-w-0"><span class="text-rbi-caption text-ink leading-snug">' + d.text + '</span>' + stdBadge + '</div></div>';
            }).join('')
            : '<div class="text-rbi-caption text-muted font-bold">' + _t('quality.sk.defects.no_repeats', 'Явно выраженных повторений нет') + '</div>';
        var safeId = cName.replace(/[^a-zA-Zа-яА-Я0-9]/g, '');
        var safeCName = cName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        var cardHtml = `
            <details class="bg-surface border ${isLinked ? 'border-brand-soft' : 'border-[var(--card-border)]'} rounded-xl shadow-sm mb-3 group [&_summary::-webkit-details-marker]:hidden">
                <summary class="p-3 cursor-pointer flex justify-between items-center transition-colors select-none">
                    <div class="flex-1 min-w-0 pr-3">
                        <div class="mb-1.5">${linkBadge}</div>
                        <div class="text-rbi-body font-black text-ink dark:text-white truncate mb-1">${cName}</div>
                        <div class="flex gap-2 text-rbi-caption font-bold">
                            <span class="text-muted bg-surface px-1.5 py-0.5 rounded border border-surface">${_t('quality.sk.card.total', 'Всего:')} ${data.total}</span>
                            <span class="text-danger bg-danger-soft px-1.5 py-0.5 rounded border border-danger-soft">${_t('quality.sk.card.open', 'Открыто:')} ${data.open}</span>
                        </div>
                    </div>
                    <div class="text-right shrink-0 flex flex-col items-end">
                        <div class="text-rbi-caption uppercase font-bold text-muted mb-0.5">${_t('quality.sk.card.overdue_label', 'Просрочка')}</div>
                        <div class="text-[16px] font-black ${overdueColor}">${overduePerc}%</div>
                    </div>
                </summary>
                <div class="p-3 border-t border-[var(--card-border)] bg-surface">
                    <div class="grid grid-cols-3 gap-2 mb-3">
                        <div class="bg-surface p-2 rounded-lg border border-[var(--card-border)] shadow-sm text-center">
                            <div class="text-rbi-caption font-bold text-muted uppercase tracking-widest mb-1 flex items-center justify-center gap-1 cursor-pointer" onclick="sk_showInfoModal('cmi')">${_t('quality.sk.cmi.index', 'Индекс CMI ❓')}</div>
                            <div class="text-[16px] font-black ${cmiColor}">${cmi}</div>
                        </div>
                        <div class="bg-surface p-2 rounded-lg border border-[var(--card-border)] shadow-sm text-center">
                            <div class="text-rbi-caption font-bold text-muted uppercase tracking-widest mb-1" title="${_t('quality.sk.cmi.on_time_title', '% закрытых вовремя')}">${_t('quality.sk.cmi.on_time', 'В срок')}</div>
                            <div class="text-[16px] font-black text-ink">${onTimePerc}%</div>
                        </div>
                        <div class="bg-surface p-2 rounded-lg border border-[var(--card-border)] shadow-sm text-center">
                            <div class="text-rbi-caption font-bold text-muted uppercase tracking-widest mb-1" title="${_t('quality.sk.cmi.depth_title', 'Средняя задержка в днях')}">${_t('quality.sk.cmi.depth', 'Глубина')}</div>
                            <div class="text-[16px] font-black ${avgOverdueDepth > 5 ? 'text-danger' : 'text-ink'}">${_t('quality.sk.cmi.days', '{n} дн.', { n: avgOverdueDepth })}</div>
                        </div>
                    </div>
                    <div class="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/50 p-2.5 rounded-lg shadow-sm mb-3">
                        <div class="text-rbi-caption font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest mb-2">${_t('quality.sk.defects.title', '🔄 Типовые дефекты (Из Excel)')}</div>
                        ${topDefectsHtml}
                    </div>
                    <button onclick="window.RBI.services.ai.sk_generateContractorAiSummary('${safeCName}', '${safeId}')" id="btn-sk-ai-${safeId}" class="w-full bg-brand text-white py-3 rounded-xl text-rbi-caption font-black uppercase active:scale-95 transition-transform shadow-md flex items-center justify-center gap-2">
                        ${_t('quality.sk.ai.analyze', '🤖 AI-Анализ и Письмо прорабу')}
                    </button>
                    <div id="sk-ai-res-${safeId}" class="hidden mt-3 p-3 bg-surface border border-brand-soft rounded-xl text-rbi-label leading-relaxed text-ink shadow-inner"></div>
                </div>
            </details>`;
        if (isLinked) linkedHtml += cardHtml; else unlinkedHtml += cardHtml;
    });

    var spatialMap = {};
    activeRecords.forEach(function (r) {
        if (!r.block || !r.floor || r.canonical_key === 'unknown') return;
        var objKey = r.display_name;
        if (!spatialMap[objKey]) spatialMap[objKey] = {};
        if (!spatialMap[objKey][r.block]) spatialMap[objKey][r.block] = {};
        if (!spatialMap[objKey][r.block][r.floor]) spatialMap[objKey][r.block][r.floor] = { total: 0, open: 0, overdue: 0 };
        var cell = spatialMap[objKey][r.block][r.floor];
        cell.total++;
        if (isIssueOpen(r)) cell.open++;
        var deadline = r.deadline ? new Date(r.deadline) : null;
        if (deadline && isIssueOpen(r) && new Date() > deadline) cell.overdue++;
    });

    var spatialHtml = '';
    Object.keys(spatialMap).forEach(function (objKey) {
        spatialHtml += `
            <details class="bg-surface mb-3 border border-surface rounded-xl overflow-hidden shadow-sm group/space [&_summary::-webkit-details-marker]:hidden">
                <summary class="p-3 bg-brand-soft cursor-pointer font-black text-rbi-body uppercase tracking-widest text-brand flex justify-between items-center select-none group-open/space:border-b border-brand-soft">
                    <span class="flex items-center gap-2">${_t('quality.sk.spatial.object', '🏢 Объект: {name}', { name: objKey })}</span>
                    <span class="transition-transform duration-300 group-open/space:rotate-180 text-brand">▼</span>
                </summary>
                <div class="p-3 bg-surface">`;
        Object.keys(spatialMap[objKey]).sort().forEach(function (blockName) {
            var blockData = spatialMap[objKey][blockName];
            var floors = Object.keys(blockData).sort(function (a, b) { var nA = parseInt(a), nB = parseInt(b); return (!isNaN(nA) && !isNaN(nB)) ? nB - nA : a.localeCompare(b); });
            var tableRows = '';
            floors.forEach(function (floor) {
                var cell = blockData[floor];
                var bgColor = 'bg-green-50 text-green-700';
                if (cell.total > 15) bgColor = 'bg-danger-soft text-danger font-black';
                else if (cell.total > 5) bgColor = 'bg-yellow-50 text-yellow-700 font-bold';
                tableRows += `<tr class="border-b border-surface hover:bg-[var(--hover-bg)]"><td class="p-2 text-rbi-caption font-bold text-muted border-r border-surface text-center w-16">${_t('quality.sk.spatial.floor', 'Эт. {floor}', { floor: floor })}</td><td class="p-2 text-center text-rbi-label ${bgColor}">${cell.total}</td><td class="p-2 text-center text-rbi-caption font-bold text-muted">${lblOpen} ${cell.open} | <span class="${cell.overdue > 0 ? 'text-danger' : 'text-muted'}">${lblOverdue} ${cell.overdue}</span></td></tr>`;
            });
            spatialHtml += `
                <div class="mb-3 bg-surface border border-[var(--card-border)] rounded-xl shadow-sm overflow-hidden">
                    <div class="bg-[var(--hover-bg)] p-2 text-rbi-caption font-black uppercase text-brand border-b border-[var(--card-border)]">${blockName}</div>
                    <div class="overflow-x-auto"><table class="w-full text-left whitespace-nowrap"><thead class="bg-surface text-rbi-caption text-muted uppercase"><tr><th class="p-2 text-center border-r border-surface">${_t('quality.sk.spatial.level', 'Уровень')}</th><th class="p-2 text-center">${_t('quality.sk.spatial.total_issues', 'Всего замечаний')}</th><th class="p-2 text-center">${_t('quality.sk.spatial.open_overdue', 'Открыто / Просрочено')}</th></tr></thead><tbody>${tableRows}</tbody></table></div>
                </div>`;
        });
        spatialHtml += '</div></details>';
    });
    if (!spatialHtml) spatialHtml = '<div class="text-center py-4 text-muted text-rbi-caption font-bold uppercase">' + _t('quality.sk.spatial.no_location', 'Данные о расположении отсутствуют. При импорте убедитесь, что колонка "Элемент структуры" связана корректно.') + '</div>';

    container.innerHTML = placeFilterHtml + `
        <div class="grid grid-cols-2 gap-2 mb-4">
            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] p-3 rounded-xl shadow-sm text-center">
                <div class="text-rbi-caption font-bold uppercase text-muted tracking-widest mb-1">${_t('quality.sk.summary.total', 'Всего замечаний СК')}</div>
                <div class="text-2xl font-black text-ink dark:text-white">${totalIssues}</div>
            </div>
            <div class="bg-danger-soft border border-danger-soft p-3 rounded-xl shadow-sm text-center">
                <div class="text-rbi-caption font-bold uppercase text-danger tracking-widest mb-1">${_t('quality.sk.summary.open_now', 'Открыто сейчас')}</div>
                <div class="text-2xl font-black text-danger">${totalOpen}</div>
            </div>
        </div>
        <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden mb-4 p-4">
            <h3 class="text-rbi-label font-black uppercase tracking-widest text-ink mb-3 flex items-center gap-1.5"><svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg> ${_t('quality.sk.standards.title', 'Самые нарушаемые нормативы')}</h3>
            <div class="flex flex-wrap gap-2">
                ${Object.keys(standardsMap).length > 0
            ? Object.keys(standardsMap).sort(function (a, b) { return standardsMap[b] - standardsMap[a]; }).slice(0, 8).map(function (std) { return '<div class="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-2 py-1 rounded-lg cursor-pointer active:scale-95 transition-transform" onclick="switchTab(\'tab-reference\'); setTimeout(() => { const btns = document.querySelectorAll(\'.sub-tab-btn\'); if (btns[1]) switchReferenceSubTab(\'ref-sub-docs\', btns[1]); const s = document.getElementById(\'doc-search-input\'); if(s) {s.value=\'' + std + '\'; renderDocsList();} }, 300);"><span class="text-rbi-label font-black text-blue-700 dark:text-blue-400">' + std + '</span><span class="text-rbi-caption font-bold bg-surface text-muted px-1.5 rounded-md shadow-sm border border-blue-100 dark:border-blue-900">' + standardsMap[std] + '</span></div>'; }).join('')
            : '<div class="text-rbi-caption font-bold text-muted">' + _t('quality.sk.standards.empty', 'В текстах замечаний нет ссылок на ГОСТ/СП.') + '</div>'}
            </div>
        </div>
        <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden mb-4 group [&_summary::-webkit-details-marker]:hidden">
            <summary class="p-3.5 bg-[var(--hover-bg)] cursor-pointer flex justify-between items-center transition-colors select-none group-open:border-b border-[var(--card-border)]">
                <span class="font-bold text-rbi-label uppercase tracking-widest text-ink flex items-center gap-1.5"><svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"></path></svg> ${_t('quality.sk.risk_matrix.title', 'Матрица Рисков (ИСД)')} <button onclick="event.stopPropagation(); sk_showInfoModal('isd')" class="text-brand hover:text-brand active:scale-95 transition-transform ml-1.5"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></button></span>
                <span class="text-muted transition-transform duration-300 group-open:rotate-180"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg></span>
            </summary>
            <div class="p-3 bg-surface">
                ${(function () { var p = (SKActions._ctx && SKActions._ctx.permissions) || window.RBI.services.permissions; return p && p.isAdmin(); })() ? `<div class="flex justify-end gap-2 mb-3"><button onclick="window.RBI.services.ai.sk_autoMapCategories(false, true)" class="bg-surface text-brand border border-brand-soft px-3 py-2 rounded-lg text-rbi-caption font-black uppercase active:scale-95 shadow-sm transition-transform flex items-center gap-1.5" title="${_t('quality.sk.risk_matrix.recheck_all_title', 'Перепроверить все дефекты (кроме ручных привязок)')}">${_t('quality.sk.risk_matrix.recheck_all', '🤖 Перепроверить всё')}</button><button onclick="window.RBI.services.ai.sk_autoMapCategories(false, false)" class="bg-brand-soft text-brand border border-brand-soft px-3 py-2 rounded-lg text-rbi-caption font-black uppercase active:scale-95 shadow-sm transition-transform flex items-center gap-1.5">${_t('quality.sk.risk_matrix.recognize_uncategorized', '🤖 Распознать "Без категории"')}</button></div>` : ''}
                ${matrixRows || '<div class="text-center p-4 bg-[var(--card-bg)] rounded-xl border border-dashed border-[var(--card-border)] text-muted text-rbi-caption uppercase font-bold">' + _t('quality.sk.risk_matrix.empty', 'Нет данных для матрицы') + '</div>'}
            </div>
        </details>
        <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden mb-4 group [&_summary::-webkit-details-marker]:hidden">
            <summary class="p-3.5 bg-[var(--hover-bg)] cursor-pointer flex justify-between items-center transition-colors select-none group-open:border-b border-[var(--card-border)]">
                <span class="font-bold text-rbi-label uppercase tracking-widest text-ink flex items-center gap-1.5"><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg> ${_t('quality.sk.spatial_analysis.title', 'Пространственный анализ (Этажи)')}</span>
                <span class="text-muted transition-transform duration-300 group-open:rotate-180"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg></span>
            </summary>
            <div class="p-3 bg-surface max-h-[60vh] overflow-y-auto custom-scrollbar">${spatialHtml}</div>
        </details>
        <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden mb-4 group [&_summary::-webkit-details-marker]:hidden">
            <summary class="p-3.5 bg-[var(--hover-bg)] cursor-pointer flex justify-between items-center transition-colors select-none group-open:border-b border-[var(--card-border)]">
                <span class="font-bold text-rbi-label uppercase tracking-widest text-ink flex items-center gap-1.5"><svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path></svg> ${_t('quality.sk.trend.title', 'Тренд открытых замечаний')} <span class="text-rbi-caption font-bold text-muted normal-case tracking-normal">${_t('quality.sk.trend.all_time', '· за всё время')}</span></span>
                <span class="text-muted transition-transform duration-300 group-open:rotate-180"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg></span>
            </summary>
            <div class="p-3" style="height: 240px; position: relative; width: 100%;"><canvas id="sk-trend-chart"></canvas></div>
        </details>
        <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden mb-4 group [&_summary::-webkit-details-marker]:hidden">
            <summary class="p-3.5 bg-[var(--hover-bg)] cursor-pointer flex justify-between items-center transition-colors select-none group-open:border-b border-[var(--card-border)]">
                <span class="font-bold text-rbi-label uppercase tracking-widest text-brand flex items-center gap-1.5"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"></path></svg> ${_t('quality.sk.linked.title', 'Связано с проверками RBI')}</span>
                <span class="text-muted transition-transform duration-300 group-open:rotate-180"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg></span>
            </summary>
            <div class="p-3 bg-surface">${linkedHtml || '<div class="text-center py-4 bg-surface rounded-xl border border-dashed border-surface text-muted text-rbi-caption font-bold uppercase tracking-widest">' + _t('quality.sk.linked.empty', 'Связанных подрядчиков не найдено') + '</div>'}</div>
        </details>
        <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden mb-4 group [&_summary::-webkit-details-marker]:hidden">
            <summary class="p-3.5 bg-[var(--hover-bg)] cursor-pointer flex justify-between items-center transition-colors select-none group-open:border-b border-[var(--card-border)]">
                <span class="font-bold text-rbi-label uppercase tracking-widest text-muted flex items-center gap-1.5"><svg class="w-4 h-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg> ${_t('quality.sk.isolated.title', 'Изолированный анализ (Без связи)')}</span>
                <span class="text-muted transition-transform duration-300 group-open:rotate-180"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg></span>
            </summary>
            <div class="p-3 bg-surface">${unlinkedHtml || '<div class="text-center py-4 bg-surface rounded-xl border border-dashed border-surface text-muted text-rbi-caption font-bold uppercase tracking-widest">' + _t('quality.sk.isolated.empty', 'Все подрядчики связаны с RBI') + '</div>'}</div>
        </details>`;

    setTimeout(function () {
        var ctxTrend = document.getElementById('sk-trend-chart');
        if (ctxTrend && typeof Chart !== 'undefined') {
            var monthsSet = new Set();
            trendRecords.forEach(function (r) {
                if (r.date_issued) {
                    var dIss = new Date(r.date_issued);
                    monthsSet.add(dIss.getFullYear() + '-' + String(dIss.getMonth() + 1).padStart(2, '0'));
                }
                if (r.date_resolved) {
                    var dRes = new Date(r.date_resolved);
                    monthsSet.add(dRes.getFullYear() + '-' + String(dRes.getMonth() + 1).padStart(2, '0'));
                }
            });
            var sortedMonths = Array.from(monthsSet).sort();
            var labels = [], dataOpen = [], dataNew = [], dataOverdue = [], dataClosed = [], dataCum = [];
            sortedMonths.forEach(function (mKey) {
                var parts2 = mKey.split('-'); var year2 = parts2[0]; var month2 = parts2[1];
                var endOfMonth = new Date(year2, month2, 0, 23, 59, 59);
                var startOfMonth = new Date(year2, month2 - 1, 1, 0, 0, 0);
                labels.push(endOfMonth.toLocaleString('ru-RU', { month: 'short', year: '2-digit' }));
                var openCount = 0, newCount = 0, overdueCount = 0, closedCount = 0, cumCount = 0;
                trendRecords.forEach(function (r) {
                    if (!r.date_issued) return;
                    var issued = new Date(r.date_issued);
                    if (issued > endOfMonth) return;
                    var resolved = r.date_resolved ? new Date(r.date_resolved) : null;
                    var deadline = r.deadline ? new Date(r.deadline) : null;
                    var openAtEom = !resolved || resolved > endOfMonth;
                    cumCount++;
                    if (issued >= startOfMonth && issued <= endOfMonth) newCount++;
                    if (openAtEom) {
                        openCount++;
                        if (deadline && deadline < endOfMonth) overdueCount++;
                    }
                    if (resolved && resolved <= endOfMonth) closedCount++;
                });
                dataOpen.push(openCount);
                dataNew.push(newCount);
                dataOverdue.push(overdueCount);
                dataClosed.push(closedCount);
                dataCum.push(cumCount);
            });
            if (window.skTrendChartInstance) window.skTrendChartInstance.destroy();
            window.skTrendChartInstance = new Chart(ctxTrend, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        { label: _t('quality.sk.chart.open_eom', 'Открыто на конец мес.'), data: dataOpen, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderWidth: 2, pointRadius: 3, fill: true, tension: 0.3 },
                        { label: _t('quality.sk.chart.overdue_eom', 'Просрочено на конец мес.'), data: dataOverdue, borderColor: '#f59e0b', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, fill: false, tension: 0.3 },
                        { label: _t('quality.sk.chart.closed_eom', 'Закрыто на конец мес.'), data: dataClosed, borderColor: '#22c55e', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, fill: false, tension: 0.3 },
                        { label: _t('quality.sk.chart.new_issued', 'Выдано новых'), data: dataNew, borderColor: '#6366f1', backgroundColor: 'transparent', borderWidth: 2, borderDash: [5, 5], pointRadius: 3, fill: false, tension: 0.3 },
                        { label: _t('quality.sk.chart.cumulative', 'Накоплено выдано'), data: dataCum, borderColor: '#64748b', backgroundColor: 'transparent', borderWidth: 2, borderDash: [2, 4], pointRadius: 2, fill: false, tension: 0.25 }
                    ]
                },
                options: {
                    animation: false,
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 8, font: { size: 8 }, padding: 8 } } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        }
    }, 100);

    // Периодическая сверка ИСД для XP (не чаще раза в минуту)
    var nowTs = Date.now();
    if (typeof window.sk_evaluateIsdXpRewards === 'function' &&
        (!window._skIsdXpEvalAt || (nowTs - window._skIsdXpEvalAt) > 60000)) {
        window._skIsdXpEvalAt = nowTs;
        window.sk_evaluateIsdXpRewards().catch(function () { /* silent */ });
    }
}

function sk_renderHrTab() {
    var container = document.getElementById('sk-view-hr');
    if (!container) return;
    var permSvc = (SKActions._ctx && SKActions._ctx.permissions) || window.RBI.services.permissions;
    var skSvc = (SKActions._ctx && SKActions._ctx.sk) || window.RBI.services.sk;
    var role = permSvc ? permSvc.getCurrentRole() : 'guest';
    if (role === 'guest') { container.innerHTML = `<div class="text-center py-6 text-danger text-rbi-label font-bold uppercase border border-danger-soft bg-danger-soft rounded-xl">${_t('quality.sk.hr.auth_required', 'Доступно только авторизованным сотрудникам')}</div>`; return; }
    if (window.skRecords.length === 0) { container.innerHTML = `<div class="text-center py-6 text-muted text-rbi-caption font-bold uppercase border border-dashed border-[var(--card-border)] rounded-xl">${_t('quality.sk.hr.no_data', 'Нет данных')}</div>`; return; }

    skSvc.setBadRemarksSync([]);
    var calculateEngStats = function (recordsArray) {
        var engMap = {};
        recordsArray.forEach(function (r) {
            var baseName = r.inspector && r.inspector.trim() !== '' ? r.inspector.trim() : _t('quality.sk.hr.not_specified', 'Не указан');
            var engName = baseName.toLowerCase().includes('технадзор') ? baseName : baseName + _t('quality.sk.hr.supervision_suffix', ' (Технадзор)');
            if (!engMap[engName]) engMap[engName] = { total: 0, open: 0, overdue: 0, withCategory: 0, matched: 0, closingTimes: [], contractors: new Set() };
            var d = engMap[engName];
            d.total++;
            if (r.contractor) d.contractors.add(r.contractor);
            var isOpen = !(r.is_verified_closed === true || r.status_normalized === 'verified' || String(r.status || '').toLowerCase().trim() === 'проверено');
            if (isOpen) d.open++;
            if (r.category && r.category !== 'Без категории') d.withCategory++;
            var textLower = r.text ? r.text.toLowerCase() : '';
            var hasNormative = /(сп\s*\d|гост|ПУЭ|снип|шифр|тр\s|тк\s|ппр|\d+\s*(мм|см|м|%|град)|(лист|л\.|узел|уз\.|пункт|п\.|приказ[а-я]*)\s*(№\s*|от\s*)?\d+)/i.test(textLower);
            if (hasNormative) { d.matched++; } else { if (r.text && r.text.length > 10) skSvc.getBadRemarksSync().push({ eng: engName, text: r.text }); }
            var issued = r.date_issued ? new Date(r.date_issued) : null;
            var deadline = r.deadline ? new Date(r.deadline) : null;
            var resolved = r.date_resolved ? new Date(r.date_resolved) : null;
            var now = new Date();
            if (deadline) {
                if (isOpen && now > deadline) d.overdue++;
                else if (!isOpen && resolved && resolved > deadline) d.overdue++;
            }
            if (!isOpen && issued && resolved) { var daysToClose = Math.ceil((resolved - issued) / (1000 * 60 * 60 * 24)); if (daysToClose >= 0) d.closingTimes.push(daysToClose); }
        });
        return Object.keys(engMap).map(function (name) {
            var d = engMap[name];
            var avgTime = d.closingTimes.length > 0 ? Math.round(d.closingTimes.reduce(function (a, b) { return a + b; }, 0) / d.closingTimes.length) : 0;
            var overduePerc = d.total > 0 ? Math.round((d.overdue / d.total) * 100) : 0;
            var catPerc = d.total > 0 ? Math.round((d.withCategory / d.total) * 100) : 0;
            var accuracyPerc = d.total > 0 ? Math.round((d.matched / d.total) * 100) : 0;
            var kpi = Math.max(0, 100 - overduePerc + (catPerc === 100 ? 10 : 0));
            return { name: name, total: d.total, open: d.open, overduePerc: overduePerc, accuracyPerc: accuracyPerc, avgTime: avgTime, kpi: kpi };
        });
    };

    var baseRecords = window.skRecords;
    if (window.analyticsDataMode === 'cloud') {
        baseRecords = baseRecords.filter(function (r) { return r.source === 'cloud' || r.syncStatus === 'synced' || r.sync_status === 'synced'; });
    }
    if (_analyticsFilters().project.length > 0) {
        var fProj = _analyticsFilters().project;
        baseRecords = baseRecords.filter(function (r) { return fProj.includes(r.project_display_name) || fProj.includes(r.project_canonical_key) || fProj.includes(r.display_name); });
    }
    if (_analyticsFilters().contractor.length > 0) {
        var fContr = _analyticsFilters().contractor;
        baseRecords = baseRecords.filter(function (r) { return fContr.includes(r.contractor_name) || fContr.includes(r.contractor_canonical_key) || fContr.includes(r.contractor); });
    }
    if (_analyticsFilters().inspector.length > 0) {
        var fInsp = _analyticsFilters().inspector;
        baseRecords = baseRecords.filter(function (r) { return fInsp.includes(r.issued_by) || fInsp.includes(r.inspector); });
    }
    if (_analyticsFilters().template.length > 0) {
        var fTmpl = _analyticsFilters().template.map(function (t) { return t.toLowerCase(); });
        baseRecords = baseRecords.filter(function (r) { return fTmpl.includes((r.category || '').toLowerCase()); });
    }
    baseRecords = skAnalyticRecords(baseRecords, { noPlace: true });   // P2-0076: подрядчики — по id «Компании»

    var selPeriod = document.getElementById('global-filter-period') && document.getElementById('global-filter-period').value || 'D30';
    var currentRecords = baseRecords, prevRecords = [];
    var now = new Date();
    var periodNorm2 = typeof window.normalizeAnalyticsPeriod === 'function' ? window.normalizeAnalyticsPeriod(selPeriod) : selPeriod;
    var bounds = typeof window.getAnalyticsPrevPeriodBounds === 'function' ? window.getAnalyticsPrevPeriodBounds(selPeriod, now) : null;
    if (periodNorm2 === 'CUSTOM') {
        var dFrom = document.getElementById('filter-date-from') && document.getElementById('filter-date-from').value;
        var dTo = document.getElementById('filter-date-to') && document.getElementById('filter-date-to').value;
        currentRecords = baseRecords;
        if (dFrom) currentRecords = currentRecords.filter(function (r) { return r.date_issued && new Date(r.date_issued) >= new Date(dFrom); });
        if (dTo) { var tDate = new Date(dTo); tDate.setHours(23, 59, 59, 999); currentRecords = currentRecords.filter(function (r) { return r.date_issued && new Date(r.date_issued) <= tDate; }); }
    } else if (bounds) {
        currentRecords = baseRecords.filter(function (r) { return r.date_issued && new Date(r.date_issued) >= bounds.startCurr; });
        prevRecords = baseRecords.filter(function (r) {
            return r.date_issued && new Date(r.date_issued) >= bounds.startPrev && new Date(r.date_issued) < bounds.endPrev;
        });
    } else {
        currentRecords = baseRecords;
    }

    var currentStats = calculateEngStats(currentRecords);
    var prevStats = calculateEngStats(prevRecords);
    currentStats.sort(function (a, b) {
        var valA = a[window.skHrSortBy], valB = b[window.skHrSortBy];
        if (valA < valB) return window.skHrSortDesc ? 1 : -1;
        if (valA > valB) return window.skHrSortDesc ? -1 : 1;
        return 0;
    });

    var renderTrend = function (curr, prev, inverse) {
        if (prev === undefined) return '';
        var diff = curr - prev;
        if (diff === 0) return '<span class="text-rbi-caption text-muted ml-1 font-black">▬</span>';
        var isGood = inverse ? diff < 0 : diff > 0;
        var color = isGood ? 'text-green-500' : 'text-danger';
        var sign = diff > 0 ? '▲' : '▼';
        return '<span class="text-rbi-caption ' + color + ' ml-1 font-black">' + sign + Math.abs(diff) + '</span>';
    };

    var rowsHtml = currentStats.map(function (e, idx) {
        var rankColor = idx === 0 ? 'bg-yellow-400 text-white shadow-sm' : 'bg-surface text-muted';
        var accColor = e.accuracyPerc >= 80 ? 'text-green-600' : (e.accuracyPerc >= 50 ? 'text-orange-500' : 'text-danger');
        var prevE = prevStats.find(function (p) { return p.name === e.name; });
        var prevKpi = prevE ? prevE.kpi : undefined;
        var prevAcc = prevE ? prevE.accuracyPerc : undefined;
        var prevOver = prevE ? prevE.overduePerc : undefined;
        return `<tr class="border-b border-[var(--card-border)] hover:bg-[var(--hover-bg)] transition-colors"><td class="p-2.5 flex items-center gap-2"><div class="w-6 h-6 rounded flex items-center justify-center text-rbi-caption font-black ${rankColor} shrink-0">${idx + 1}</div><div class="font-bold text-rbi-label text-ink dark:text-white truncate max-w-[120px]" title="${e.name}">${e.name}</div></td><td class="p-2.5 text-center text-rbi-label font-black text-muted">${e.total}</td><td class="p-2.5 text-center text-rbi-body font-bold ${e.overduePerc > 20 ? 'text-danger' : 'text-green-600'}">${e.overduePerc}% ${renderTrend(e.overduePerc, prevOver, true)}</td><td class="p-2.5 text-center text-rbi-body font-black ${accColor}">${e.accuracyPerc}% ${renderTrend(e.accuracyPerc, prevAcc, false)}</td><td class="p-2.5 text-center text-rbi-label font-bold text-muted">${e.avgTime} ${_t('quality.sk.hr.days_short', 'дн.')}</td><td class="p-2.5 text-center text-rbi-body font-black ${e.kpi >= 80 ? 'text-green-600' : 'text-danger'} bg-surface rounded-r-lg">${e.kpi} ${renderTrend(e.kpi, prevKpi, false)}</td></tr>`;
    }).join('');

    container.innerHTML = `
        <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden mb-4">
            <div class="p-3.5 bg-[var(--hover-bg)] border-b border-[var(--card-border)] flex justify-between items-center">
                <div>
                    <div class="font-black text-rbi-body uppercase text-ink dark:text-white mb-0.5">${_t('quality.sk.hr.rating_title', 'Рейтинг инженеров СК (KPI)')}</div>
                    <div class="text-rbi-caption text-[var(--text-muted)] leading-snug font-medium">${_t('quality.sk.hr.rating_hint', 'KPI = 100 - %Просрочки + Бонусы.<br>Тренд (▲▼) показывает динамику по сравнению с предыдущим периодом.')}</div>
                </div>
            </div>
            <div class="overflow-x-auto custom-scrollbar">
                <table class="w-full text-left whitespace-nowrap">
                    <thead class="bg-surface text-rbi-caption text-[var(--text-muted)] uppercase tracking-wider select-none">
                        <tr>
                            <th class="p-3 cursor-pointer hover:text-brand transition-colors" title="${_t('quality.sk.hr.col.engineer_title', 'ФИО инженера строительного контроля')}" onclick="window.sk_sortHrTable('name')">${_t('quality.sk.hr.col.engineer', 'Инженер СК')} <span class="text-brand">${window.skHrSortBy === 'name' ? (window.skHrSortDesc ? '▼' : '▲') : ''}</span></th>
                            <th class="p-3 text-center cursor-pointer hover:text-brand transition-colors" title="${_t('quality.sk.hr.col.issued_title', 'Количество предписаний/замечаний, выданных инженером за выбранный период')}" onclick="window.sk_sortHrTable('total')">${_t('quality.sk.hr.col.issued', 'Выдал')} <span class="text-brand">${window.skHrSortBy === 'total' ? (window.skHrSortDesc ? '▼' : '▲') : ''}</span></th>
                            <th class="p-3 text-center cursor-pointer hover:text-brand transition-colors" title="${_t('quality.sk.hr.col.overdue_title', 'Доля замечаний, закрытых с нарушением срока устранения (deadline)')}" onclick="window.sk_sortHrTable('overduePerc')">${_t('quality.sk.hr.col.overdue', 'Просрочка')} <span class="text-brand">${window.skHrSortBy === 'overduePerc' ? (window.skHrSortDesc ? '▼' : '▲') : ''}</span></th>
                            <th class="p-3 text-center text-brand font-black cursor-pointer hover:text-brand transition-colors" title="${_t('quality.sk.hr.col.accuracy_title', 'Доля предписаний со ссылкой на нормативный документ (СП/ГОСТ/ППР/чертёж) — показатель качества формулировок')}" onclick="window.sk_sortHrTable('accuracyPerc')">${_t('quality.sk.hr.col.accuracy', 'Точность')} <span class="text-brand">${window.skHrSortBy === 'accuracyPerc' ? (window.skHrSortDesc ? '▼' : '▲') : ''}</span></th>
                            <th class="p-3 text-center cursor-pointer hover:text-brand transition-colors" title="${_t('quality.sk.hr.col.avg_time_title', 'Среднее число дней от выдачи предписания до его закрытия')}" onclick="window.sk_sortHrTable('avgTime')">${_t('quality.sk.hr.col.avg_time', 'Ср. Время')} <span class="text-brand">${window.skHrSortBy === 'avgTime' ? (window.skHrSortDesc ? '▼' : '▲') : ''}</span></th>
                            <th class="p-3 text-center text-brand font-black cursor-pointer hover:text-brand transition-colors" title="${_t('quality.sk.hr.col.kpi_title', 'Итоговый рейтинг: 100 − %Просрочки + бонус за 100% точность формулировок')}" onclick="window.sk_sortHrTable('kpi')">${_t('quality.sk.hr.col.kpi', 'KPI')} <span class="text-brand">${window.skHrSortBy === 'kpi' ? (window.skHrSortDesc ? '▼' : '▲') : ''}</span></th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml || '<tr><td colspan="6" class="text-center p-4 text-muted text-xs">' + _t('quality.sk.hr.no_period_data', 'Нет данных за период') + '</td></tr>'}</tbody>
                </table>
            </div>
        </div>
        <div class="bg-brand-soft border border-brand-soft rounded-xl p-4 shadow-sm">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <div class="text-rbi-body font-black text-brand uppercase tracking-widest flex items-center gap-1.5 mb-1"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> ${_t('quality.sk.hr.ai_coach.title', 'AI-Тренер (Разбор ошибок)')}</div>
                    <div class="text-rbi-caption text-brand/80 leading-snug pr-4 font-medium">${_t('quality.sk.hr.ai_coach.description', 'Нейросеть выберет несколько реальных предписаний без нормативов, объяснит гарантийные риски и покажет, как нужно было написать правильно.')}</div>
                </div>
                <button onclick="window.sk_auditTemplatesAi()" class="bg-brand text-white px-3 py-2 rounded-xl text-rbi-caption font-black uppercase shadow-md active:scale-95 transition-transform shrink-0">${_t('quality.sk.hr.ai_coach.analyze', 'Разобрать')}</button>
            </div>
            <div id="sk-ai-templates-res" class="hidden mt-3 p-3 bg-surface border border-brand-soft rounded-xl text-rbi-label leading-relaxed text-ink shadow-inner font-medium"></div>
        </div>`;
}

function sk_showInfoModal(type) {
    var title = '', body = '';
    if (type === 'cmi') {
        title = _t('quality.sk.info.cmi.title', 'Индекс Зрелости (CMI)');
        body = `<div class="text-rbi-body leading-relaxed text-ink space-y-3"><p>${_t('quality.sk.info.cmi.intro', '<b>CMI (Control Maturity Index)</b> оценивает дисциплину подрядчика при устранении предписаний Стройконтроля.')}</p><div class="bg-surface p-3 rounded-lg border border-surface font-mono text-rbi-caption text-center">${_t('quality.sk.info.cmi.formula', 'CMI = (%Вовремя × 0.6) + ((100 - %Просрочки) × 0.4) - Глубина')}</div><div class="bg-brand-soft border-l-2 border-brand p-2 text-rbi-caption">${_t('quality.sk.info.cmi.example', '<b>Пример:</b> У подрядчика 10 замечаний. 8 закрыто вовремя, 2 просрочено (в среднем на 5 дней).<br>CMI = (80% × 0.6) + ((100 - 20%) × 0.4) - 5 дней = 48 + 32 - 5 = <b>75 баллов</b>.')}</div><p>${_t('quality.sk.info.cmi.scale', '🟢 <b>≥ 70</b> — Отлично.<br>🟡 <b>40 – 69</b> — Средне.<br>🔴 <b>< 40</b> — Срыв сроков.')}</p></div>`;
    } else if (type === 'isd') {
        title = _t('quality.sk.info.isd.title', 'Индекс Соответствия (ИСД)');
        body = `<div class="text-rbi-body leading-relaxed text-ink space-y-3"><p>${_t('quality.sk.info.isd.intro', '<b>ИСД</b> — это детектор сокрытия брака.')}</p><div class="bg-surface p-3 rounded-lg border border-surface font-mono text-rbi-caption text-center">${_t('quality.sk.info.isd.formula', 'ИСД = (Факт в ПК СК / Ожидаемый Брак) × 100%')}</div><p>${_t('quality.sk.info.isd.alert', '🔴 <b>ИСД < 20%</b> — Аномалия. Обязательный выезд на объект.')}</p></div>`;
    } else if (type === 'hr') {
        title = _t('quality.sk.info.hr.title', 'KPI Инженеров СК');
        body = `<div class="text-rbi-body leading-relaxed text-ink space-y-3"><p>${_t('quality.sk.info.hr.intro', '<b>KPI</b> оценивает качество ведения Стройконтроля конкретным инженером.')}</p><div class="bg-surface p-3 rounded-lg border border-surface font-mono text-rbi-caption text-center">${_t('quality.sk.info.hr.formula', 'KPI = 100 - %Просрочки + Бонус (10)')}</div></div>`;
    }
    var modal = document.getElementById('modal-overlay');
    document.getElementById('modal-icon').innerHTML = '';
    document.getElementById('modal-title').innerHTML = '<div class="text-center font-black uppercase text-lg text-brand">' + title + '</div>';
    document.getElementById('modal-body').innerHTML = body + '<div class="mt-5 pt-3 border-t border-surface"><button onclick="closeModal()" class="w-full bg-brand text-white py-3.5 rounded-xl font-black text-rbi-body uppercase shadow-md active:scale-95 transition-transform">' + _t('quality.sk.info.ok', 'Понятно') + '</button></div>';
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
}

function sk_openCategoryLinkModal(rawCategory) {
    var optionsHtml = '<option value="">' + _t('quality.sk.category_link.select', '-- Выберите правильный вид работ --') + '</option>';
    {
        var _st = _templates().getSystemTemplates();
        Object.keys(_st).forEach(function (k) { optionsHtml += '<option value="' + _st[k].title + '">' + _st[k].title + '</option>'; });
    }
    {
        var _ut = _templates().getUserTemplates();
        Object.keys(_ut).forEach(function (k) { optionsHtml += '<option value="' + _ut[k].title + '">' + _ut[k].title + '</option>'; });
    }
    var modal = document.getElementById('modal-overlay');
    document.getElementById('modal-icon').innerHTML = `<div class="w-12 h-12 bg-brand-soft text-brand rounded-xl flex items-center justify-center text-2xl mx-auto mb-2 border border-brand-soft">🔗</div>`;
    document.getElementById('modal-title').innerHTML = `<div class="text-center font-black uppercase text-lg">${_t('quality.sk.category_link.title', 'Связь видов работ')}</div>`;
    document.getElementById('modal-body').innerHTML = `
        <div class="text-rbi-label text-muted text-center mb-4">${_t('quality.sk.category_link.description', 'Объедините категорию из ПК СК с правильным названием чек-листа в RBI.')}</div>
        <div class="bg-danger-soft text-danger p-2 rounded-lg border border-danger-soft text-center text-rbi-label font-bold mb-3">${_t('quality.sk.category_link.from_sk', 'Из ПК СК: "{category}"', { category: rawCategory })}</div>
        <div class="text-center text-muted mb-3">${_t('quality.sk.category_link.will_count', '⬇️ будет считаться как ⬇️')}</div>
        <select id="sk-category-link-select" class="input-base !py-2 text-rbi-label font-bold mb-4">${optionsHtml}</select>
        <div class="flex gap-2">
            <button onclick="closeModal()" class="flex-1 bg-surface text-muted py-3.5 rounded-xl font-bold text-rbi-label uppercase active:scale-95 border">${_t('quality.sk.category_link.cancel', 'Отмена')}</button>
            <button onclick="sk_saveCategoryLink('${rawCategory.replace(/'/g, "\\'")}')" class="flex-1 bg-brand text-white py-3.5 rounded-xl font-black text-rbi-label uppercase shadow-md active:scale-95">${_t('quality.sk.category_link.link', 'Связать')}</button>
        </div>`;
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
}

function sk_closeContractorLinkModal() {
    var modal = document.getElementById('sk-contractor-link-modal');
    if (modal) modal.remove();
    document.body.classList.remove('modal-open');
}

function sk_fillContractorSuggestion() {
    var select = document.getElementById('sk-link-raw-contractor');
    var displayInput = document.getElementById('sk-link-display-name');
    var keyInput = document.getElementById('sk-link-canonical-key');
    if (!select || !displayInput || !keyInput) return;
    var queue = window.skContractorQueueForModal || [];
    var item = queue[Number(select.value)];
    if (!item) return;
    var raw = String(item.raw_name || '').trim();
    displayInput.value = raw;
    var contrSvc = _contractors();
    if (contrSvc && typeof contrSvc.makeCanonicalKey === 'function') {
        keyInput.value = contrSvc.makeCanonicalKey(raw);
    } else {
        keyInput.value = raw.toLowerCase().replace(/ё/g, 'е').replace(/["'«»]/g, '').replace(/\b(ооо|оао|зао|пао|ао|ип)\b/gi, '').replace(/[^a-zа-я0-9]+/gi, '_').replace(/^_+|_+$/g, '');
    }
}

// =========================================================================
// SKRender — рендер-диспетчер модуля SK (для sk.module.js)
// =========================================================================

export const SKRender = {

    /**
     * Диспетчер рендера по вкладке.
     * @param {string} subTab — 'dashboard' | 'records' | 'hr' | 'volumes' | 'mapping' | 'isd'
     */
    render(subTab) {
        var tab = subTab || 'dashboard';
        switch (tab) {
            case 'dashboard': return SKRender.renderDashboard();
            case 'records':   return SKRender.renderMainTab();
            case 'hr':        return SKRender.renderHrTab();
            case 'volumes':   return SKRender.renderVolumes();
            default:          return SKRender.renderMainTab();
        }
    },

    /**
     * Рендер главной вкладки СК (список замечаний).
     */
    renderMainTab() {
        return sk_renderMainTab();
    },

    /**
     * Рендер дашборда СК.
     */
    renderDashboard() {
        return sk_renderDashboard();
    },

    /**
     * Рендер вкладки HR-рейтинга подрядчиков.
     */
    renderHrTab() {
        return sk_renderHrTab();
    },

    /**
     * Рендер вкладки объёмов.
     */
    renderVolumes() {
        return sk_renderVolumes();
    }
};

// Публикация в window для доступа из legacy-кода
if (typeof window !== 'undefined') {
    window.SKRender = SKRender;
}

console.log('[SKRender] sk.render.js loaded (real logic, v2.0)');

(function bindSkI18n() {
    if (window.__rbiSkI18nBound) return;
    if (!(window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function')) return;
    window.__rbiSkI18nBound = true;
    window.RBI.events.on('i18n:localeChanged', function () {
        try {
            if (!document.getElementById('sk-main-container')) return;
            var subSk = document.getElementById('sub-sk');
            if (subSk && subSk.classList.contains('hidden')) return;
            // Shell chrome is built once; force full remount so labels update live.
            window.__rbiSkForceI18nRemount = true;
            if (typeof sk_renderMainTab === 'function') {
                sk_renderMainTab().catch(function () {});
            }
        } catch (_e) { /* ignore */ }
    });
})();

export {
    sk_renderContractorQueueBanner,
    sk_renderMainTab,
    sk_renderVolumes,
    sk_showMappingModal,
    sk_showNormalizationModal,
    sk_renderDashboard,
    sk_renderHrTab,
    sk_showInfoModal,
    sk_openCategoryLinkModal,
    sk_closeContractorLinkModal,
    sk_fillContractorSuggestion
};
