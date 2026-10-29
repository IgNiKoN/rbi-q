/**
 * interventions.module.js
 * Модуль «Воздействия и Практики» — ES-модуль (Step 37).
 *
 * Содержит всю бизнес-логику из app.js строки ~6889–7994.
 * Регистрирует window.rbi_* и вспомогательные window.* функции напрямую.
 *
 * Приватные хелперы: _storage(), _syncEnqueue(), _getSetting(),
 *   _isDemoMode(), _sync().
 * Бизнес-логику не меняет — перенос 1-в-1 из app.js.
 */

import './practice.pptx-export.js'; // side-effect: exportPracticePptx / rbi_exportPracticePptx

// =========================================================================
// ПРИВАТНЫЕ ХЕЛПЕРЫ (изоляция от прямых dbPut/STORES/triggerSync)
// =========================================================================

let _ctx = null;
function bindCtx(ctx) {
    _ctx = ctx;
    bindInterventionsActionDelegation();
}
window.InterventionsShared = { bindCtx: bindCtx };

// Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
// (см. _ai/INDEX_HTML_HANDLERS_MAP.md), namespace-per-module (data-interventions-action).
function bindInterventionsActionDelegation() {
    if (window.__interventionsActionDelegationBound) return;
    window.__interventionsActionDelegationBound = true;

    var readArg = function (el, valType, evt) {
        switch (valType) {
            case 'element': return el;
            case 'event': return evt;
            case 'checked': return el.checked;
            case 'int': return parseInt(el.value, 10);
            case 'value': return el.value;
            default: return undefined;
        }
    };

    var dispatch = function (el, evt) {
        var action = el.dataset.interventionsAction;
        var fn = window[action];
        if (typeof fn !== 'function') return;
        var valType = el.dataset.interventionsActionValType;
        var arg = valType ? readArg(el, valType, evt) : el.dataset.actionArg;
        var arg2 = el.dataset.interventionsActionArg2;

        if (arg === undefined) {
            fn();
        } else if (arg2 === undefined) {
            fn(arg);
        } else {
            fn(arg, arg2);
        }
    };

    var resolveActionElement = function (target, wantsChange) {
        var el = target;
        while (el && el.nodeType === 1) {
            if (el.dataset && el.dataset.interventionsAction) {
                if (!!(el.dataset.actionEvent === 'change') === wantsChange) return el;
            }
            var inlineOnclick = el.getAttribute && el.getAttribute('onclick');
            if (!wantsChange && inlineOnclick && inlineOnclick.includes('stopPropagation')) return null;
            el = el.parentElement;
        }
        return null;
    };

    document.addEventListener('click', function (e) {
        var el = resolveActionElement(e.target, false);
        if (el) dispatch(el, e);
    }, true);

    document.addEventListener('change', function (e) {
        var el = resolveActionElement(e.target, true);
        if (el) dispatch(el, e);
    }, true);
}

function _getSetting(key) {
    if (_ctx && _ctx.settings) return _ctx.settings.get(key);
    return window.RBI.services.settings.get(key);
}

function _isDemoMode() {
    if (_ctx && _ctx.appMode) return _ctx.appMode.isDemo();
    return window.RBI.services.appMode.isDemo();
}

function _syncEnqueue(action, payload) {
    if (_ctx && _ctx.sync && typeof _ctx.sync.enqueue === 'function') {
        _ctx.sync.enqueue(action, payload);
        return;
    }
    if (window.RBI && window.RBI.services && window.RBI.services.sync &&
        typeof window.RBI.services.sync.enqueue === 'function') {
        window.RBI.services.sync.enqueue(action, payload);
        return;
    }
    if (window.SyncQueueManager && typeof window.SyncQueueManager.enqueue === 'function') {
        window.SyncQueueManager.enqueue(action, payload);
    }
}

function _storage() {
    if (_ctx && _ctx.storage) return _ctx.storage;
    if (window.RBI && window.RBI.services && window.RBI.services.storage) {
        return window.RBI.services.storage;
    }
    return {
        stores: function() { return typeof STORES !== 'undefined' ? STORES : {}; },
        get: function(store, key) { return dbGet(store, key); },
        getAll: function(store) { return dbGetAll(store); },
        put: function(store, data) { return dbPut(store, data); },
        delete: function(store, key) { return dbDelete(store, key); }
    };
}

function _sync(mode) {
    var m = mode || 'silent';
    if (_ctx && _ctx.sync) return _ctx.sync.trigger(m);
    if (window.RBI && window.RBI.services && window.RBI.services.sync) {
        return window.RBI.services.sync.trigger(m);
    }
    if (typeof triggerSync === 'function') return triggerSync(m);
    return Promise.resolve(false);
}

function _getTwiCards() {
    if (_ctx && _ctx.knowledge) return _ctx.knowledge.getTwiCardsSync();
    if (window.RBI && window.RBI.services && window.RBI.services.knowledge) {
        return window.RBI.services.knowledge.getTwiCardsSync();
    }
    return Array.isArray(window.customTwiCards) ? window.customTwiCards : [];
}
function _getCustomDocs() {
    if (_ctx && _ctx.knowledge) return _ctx.knowledge.getCustomDocsSync();
    if (window.RBI && window.RBI.services && window.RBI.services.knowledge) {
        return window.RBI.services.knowledge.getCustomDocsSync();
    }
    return Array.isArray(window.customDocs) ? window.customDocs : [];
}
function _getCustomNodes() {
    if (_ctx && _ctx.knowledge) return _ctx.knowledge.getCustomNodesSync();
    if (window.RBI && window.RBI.services && window.RBI.services.knowledge) {
        return window.RBI.services.knowledge.getCustomNodesSync();
    }
    return Array.isArray(window.customNodes) ? window.customNodes : [];
}
function _getEtalonActs() {
    if (_ctx && _ctx.knowledge) return _ctx.knowledge.getEtalonActsSync();
    if (window.RBI && window.RBI.services && window.RBI.services.knowledge) {
        return window.RBI.services.knowledge.getEtalonActsSync();
    }
    return Array.isArray(window.etalonActsArray) ? window.etalonActsArray : [];
}
function _getGameActionLogs() {
    if (_ctx && _ctx.game) return _ctx.game.getGameActionLogsSync();
    if (window.RBI && window.RBI.services && window.RBI.services.game) {
        return window.RBI.services.game.getGameActionLogsSync();
    }
    return window.gameActionLogs || [];
}
function _getAllInspections() {
    if (_ctx && _ctx.inspections) return _ctx.inspections.getAllSync();
    if (window.RBI && window.RBI.services && window.RBI.services.inspections) {
        return window.RBI.services.inspections.getAllSync();
    }
    return Array.isArray(contractorArray) ? contractorArray : [];
}
function _gameLogAction(actionType, targetId) {
    if (_ctx && _ctx.game) return _ctx.game.logAction(actionType, targetId);
    if (window.RBI && window.RBI.services && window.RBI.services.game) {
        return window.RBI.services.game.logAction(actionType, targetId);
    }
    if (typeof gameLogAction === 'function') return gameLogAction(actionType, targetId);
}
function _calculateImpact(inspector, contractor, template) {
    if (_ctx && _ctx.game) return _ctx.game.calculateImpact(inspector, contractor, template);
    if (window.RBI && window.RBI.services && window.RBI.services.game) {
        return window.RBI.services.game.calculateImpact(inspector, contractor, template);
    }
    if (typeof calculateImpactScore === 'function') return calculateImpactScore(inspector, contractor, template);
}

function _templates() {
    if (_ctx && _ctx.templates) return _ctx.templates;
    if (window.RBI && window.RBI.services && window.RBI.services.templates) {
        return window.RBI.services.templates;
    }
    return {
        getUserTemplates: function () {
            return typeof window.userTemplates !== 'undefined' ? window.userTemplates : {};
        },
        getSystemTemplates: function () {
            return typeof window.SYSTEM_TEMPLATES !== 'undefined' ? window.SYSTEM_TEMPLATES : {};
        }
    };
}

// =========================================================================
// РАЗМЕТКА МОДАЛОК INTERVENTIONS (перенос из index.html:1695-1754/1756-1838/
// 1840-1950, перенос 30 modal/overlay-блоков #app-modals в JS-рендер).
// HTML-строки 1:1 идентичны прежней статичной разметке.
// =========================================================================
function renderRbiInterventionModalMarkup() {
    return `
    <div id="rbi-intervention-modal"
        class="fixed inset-0 bg-surface/80 z-[8000] hidden items-center justify-center p-4 backdrop-blur-sm"
        data-interventions-action="rbi_closeInterventionModal">
        <div class="bg-[var(--card-bg)] w-full max-w-sm rounded-2xl shadow-2xl transition-transform border border-[var(--card-border)] overflow-hidden flex flex-col"
            onclick="event.stopPropagation()">
            <div
                class="p-4 border-b border-[var(--card-border)] bg-[var(--hover-bg)] flex justify-between items-center shrink-0">
                <div
                    class="font-black text-rbi-body uppercase tracking-tight text-ink flex items-center gap-2">
                    <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                    </svg> Фиксация Воздействия
                </div>
                <button data-interventions-action="rbi_closeInterventionModal"
                    class="w-8 h-8 bg-surface rounded-full flex items-center justify-center text-muted active:scale-90 shadow-sm border border-surface">✕</button>
            </div>
            <div class="p-4 space-y-3">
                <div
                    class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100 dark:border-blue-800/50 mb-2">
                    <div class="text-rbi-caption text-blue-800 dark:text-blue-300 font-medium leading-snug">Зафиксируйте
                        проведенную работу с подрядчиком. Система автоматически отследит, улучшилось ли его качество
                        (УрК) после ваших действий, и начислит <b>Impact Score</b>.</div>
                </div>
                <div>
                    <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">Подрядчик (Из
                        истории проверок)</label>
                    <select id="rbi-int-contractor" class="input-base"
                        data-interventions-action="rbi_updateInterventionTemplates" data-action-event="change"></select>
                </div>
                <div>
                    <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">Вид работ</label>
                    <select id="rbi-int-template" class="input-base"></select>
                </div>
                <div>
                    <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">Примененный
                        инструмент</label>
                    <select id="rbi-int-type" class="input-base">
                        <option value="1.5">Разбор с бригадой (TWI-сессия) [Коэф. x1.5]</option>
                        <option value="1.4">Разработано техническое решение [Коэф. x1.4]</option>
                        <option value="1.3">Совместный осмотр эталона [Коэф. x1.3]</option>
                        <option value="1.2">Обучение / инструктаж [Коэф. x1.2]</option>
                        <option value="1.2">Официальный разбор на совещании [Коэф. x1.2]</option>
                        <option value="1.0">Показан личный антирейтинг [Коэф. x1.0]</option>
                        <option value="1.0">Замена бригадира / состава [Коэф. x1.0]</option>
                    </select>
                </div>
                <div>
                    <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">Краткий
                        комментарий (Факт)</label>
                    <textarea id="rbi-int-comment" class="input-base h-16 resize-none text-rbi-label"
                        placeholder="Напр: Провел показательную сборку угла..."></textarea>
                </div>
                <button data-interventions-action="rbi_saveIntervention"
                    class="w-full bg-green-600 text-white py-3.5 rounded-xl font-black text-rbi-label uppercase tracking-widest shadow-md active:scale-95 flex items-center justify-center gap-2 mt-2 transition-transform">
                    Сохранить Воздействие
                </button>
            </div>
        </div>
    </div>
`;
}

function renderRbiPracticeModalMarkup() {
    return `
    <div id="rbi-practice-modal"
        class="fixed inset-0 bg-surface/80 z-[9000] hidden items-center justify-center p-4 backdrop-blur-sm"
        data-interventions-action="rbi_closePracticeModal">
        <div class="bg-[var(--card-bg)] w-full max-w-md rounded-2xl shadow-2xl transition-transform border border-[var(--card-border)] overflow-hidden flex flex-col max-h-[90vh]"
            onclick="event.stopPropagation()">
            <div
                class="p-4 border-b border-[var(--card-border)] bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 flex justify-between items-center shrink-0">
                <div
                    class="font-black text-rbi-body uppercase tracking-tight text-yellow-800 dark:text-yellow-500 flex items-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M21.666 4.756c.962-.203 1.934-.377 2.916-.52a6.003 6.003 0 00-5.395 4.972">
                        </path>
                    </svg> Оформление Практики
                </div>
                <button data-interventions-action="rbi_closePracticeModal"
                    class="w-8 h-8 bg-surface rounded-full flex items-center justify-center text-muted active:scale-90 shadow-sm border border-surface">✕</button>
            </div>
            <div class="p-4 overflow-y-auto custom-scrollbar space-y-4">
                <div
                    class="text-rbi-label bg-yellow-100/50 dark:bg-yellow-900/10 text-yellow-800 dark:text-yellow-500 p-3 rounded-xl border border-yellow-200 dark:border-yellow-800 font-medium">
                    Система обнаружила улучшение УрК на <b id="rbi-prac-delta" class="text-green-600">+0%</b> после
                    вашего воздействия. Давайте кристаллизуем этот опыт!
                </div>
                <input type="hidden" id="rbi-prac-int-id">

                <div>
                    <label
                        class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block flex justify-between">
                        <span>Название (Суть)</span>
                        <button data-action="rbi_generatePracticeTitleAi" class="text-brand hover:text-brand">🤖
                            AI-генерация</button>
                    </label>
                    <input type="text" id="rbi-prac-title" class="input-base"
                        placeholder="Напр: Искоренение дефекта кладки...">
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="text-rbi-caption font-bold text-danger uppercase mb-1 block">Проблема (ДО)</label>
                        <textarea id="rbi-prac-problem" class="input-base h-16 resize-none text-rbi-label"
                            placeholder="Что было на площадке — своими словами"></textarea>
                    </div>
                    <div>
                        <label class="text-rbi-caption font-bold text-green-600 uppercase mb-1 block">Решение (ПОСЛЕ)</label>
                        <textarea id="rbi-prac-solution" class="input-base h-16 resize-none text-rbi-label"
                            placeholder="Что сделали и какой результат"></textarea>
                    </div>
                </div>

                <div>
                    <label class="text-rbi-caption font-bold text-brand uppercase mb-1 block">Ключевой вывод (для презентации)</label>
                    <textarea id="rbi-prac-takeaway" class="input-base h-14 resize-none text-rbi-label"
                        placeholder="1–2 предложения: чему учит эта практика на объекте"></textarea>
                    <div class="text-rbi-caption text-muted font-medium mt-1">На печати A3 фото в режиме contain (без обрезки). Было/Стало — до 4, Процесс — до 6.</div>
                </div>

                <div class="grid grid-cols-3 gap-2 border-t border-surface pt-3">
                    <div>
                        <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block text-center">Было</label>
                        <div id="rbi-prac-photos-before" class="grid grid-cols-2 gap-1 mb-1"></div>
                        <button type="button" onclick="document.getElementById('rbi-prac-photo-before').click()"
                            class="w-full h-14 border border-dashed border-surface rounded-lg bg-[var(--hover-bg)] flex items-center justify-center text-muted active:scale-95 text-rbi-caption font-bold">➕</button>
                        <input type="file" id="rbi-prac-photo-before" accept="image/*" multiple class="hidden"
                            data-interventions-action="rbi_handlePracPhotoMulti" data-interventions-action-val-type="event" data-interventions-action-arg2="before" data-action-event="change">
                    </div>
                    <div>
                        <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block text-center">Процесс</label>
                        <div id="rbi-prac-photos-process" class="grid grid-cols-2 gap-1 mb-1"></div>
                        <button type="button" onclick="document.getElementById('rbi-prac-photo-process').click()"
                            class="w-full h-14 border border-dashed border-surface rounded-lg bg-[var(--hover-bg)] flex items-center justify-center text-muted active:scale-95 text-rbi-caption font-bold">➕</button>
                        <input type="file" id="rbi-prac-photo-process" accept="image/*" multiple class="hidden"
                            data-interventions-action="rbi_handlePracPhotoMulti" data-interventions-action-val-type="event" data-interventions-action-arg2="process" data-action-event="change">
                    </div>
                    <div>
                        <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block text-center">Стало</label>
                        <div id="rbi-prac-photos-after" class="grid grid-cols-2 gap-1 mb-1"></div>
                        <button type="button" onclick="document.getElementById('rbi-prac-photo-after').click()"
                            class="w-full h-14 border border-dashed border-surface rounded-lg bg-[var(--hover-bg)] flex items-center justify-center text-muted active:scale-95 text-rbi-caption font-bold">➕</button>
                        <input type="file" id="rbi-prac-photo-after" accept="image/*" multiple class="hidden"
                            data-interventions-action="rbi_handlePracPhotoMulti" data-interventions-action-val-type="event" data-interventions-action-arg2="after" data-action-event="change">
                    </div>
                </div>

                <button data-interventions-action="rbi_savePractice"
                    class="w-full bg-yellow-500 text-white py-3.5 rounded-xl font-black text-rbi-body uppercase tracking-widest shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M17.5 3h-11a2 2 0 00-2 2v14a2 2 0 002 2h11a2 2 0 002-2V5a2 2 0 00-2-2z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 13h6m-6 4h6m-3-10v.01"></path>
                    </svg>
                    Оформить практику
                </button>
            </div>
        </div>
    </div>
`;
}

function renderManualPracticeModalMarkup() {
    return `
    <div id="manual-practice-modal"
        class="fixed inset-0 bg-surface/80 z-[9000] hidden items-center justify-center p-4 backdrop-blur-sm"
        data-interventions-action="rbi_closeManualPracticeModal">
        <div class="bg-[var(--card-bg)] w-full max-w-md rounded-2xl shadow-2xl transition-transform border border-[var(--card-border)] overflow-hidden flex flex-col max-h-[90vh]"
            onclick="event.stopPropagation()">

            <div
                class="p-4 border-b border-[var(--card-border)] bg-surface/50 flex justify-between items-center shrink-0">
                <div
                    class="font-black text-rbi-body uppercase tracking-tight text-ink flex items-center gap-2">
                    <svg class="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z">
                        </path>
                    </svg>
                    <span id="man-prac-modal-title">Новая практика</span>
                </div>
                <button data-interventions-action="rbi_closeManualPracticeModal"
                    class="w-8 h-8 bg-surface rounded-full flex items-center justify-center text-muted active:scale-90 shadow-sm border border-surface">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>

            <div class="p-4 overflow-y-auto custom-scrollbar space-y-4">
                <div class="flex justify-between items-center">
                    <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase block">Название
                        (Суть)</label>
                    <button data-action="rbi_beautifyPracticeAi"
                        class="text-rbi-caption font-bold text-brand bg-brand-soft px-2 py-1 rounded border border-brand-soft active:scale-95 flex items-center gap-1">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                        </svg> Улучшить текст (ИИ)
                    </button>
                </div>
                <input type="text" id="man-prac-title" class="input-base"
                    placeholder="Напр: Замена типа анкеров на фасаде...">

                <div class="grid grid-cols-1 gap-3">
                    <div>
                        <label class="text-rbi-caption font-bold text-muted uppercase mb-1 block">Что делали / В чем
                            проблема</label>
                        <textarea id="man-prac-problem" class="input-base h-20 resize-none text-rbi-label"
                            placeholder="Опишите исходную ситуацию..."></textarea>
                    </div>
                    <div>
                        <label class="text-rbi-caption font-bold text-muted uppercase mb-1 block">Результат /
                            Решение</label>
                        <textarea id="man-prac-solution" class="input-base h-20 resize-none text-rbi-label"
                            placeholder="Опишите, к какому выводу пришли..."></textarea>
                    </div>
                    <div>
                        <label class="text-rbi-caption font-bold text-brand uppercase mb-1 block">Ключевой вывод (для презентации)</label>
                        <textarea id="man-prac-takeaway" class="input-base h-14 resize-none text-rbi-label"
                            placeholder="Чему учит практика: что закрепить на других участках"></textarea>
                        <div class="text-rbi-caption text-muted font-medium mt-1">На печати A3 — object-fit contain. Было/Стало до 4, Процесс до 6.</div>
                    </div>
                </div>

                <div class="grid grid-cols-3 gap-2 border-t border-surface pt-3">
                    <div>
                        <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block text-center">Было</label>
                        <div id="man-prac-photos-before" class="grid grid-cols-2 gap-1 mb-1"></div>
                        <button onclick="document.getElementById('man-prac-photo-before').click()"
                            class="w-full h-14 border border-dashed border-surface rounded-lg bg-[var(--hover-bg)] flex items-center justify-center text-muted active:scale-95 text-rbi-caption font-bold">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg>
                        </button>
                        <input type="file" id="man-prac-photo-before" accept="image/*" multiple class="hidden"
                            data-interventions-action="rbi_handlePracPhotoMulti" data-interventions-action-val-type="event" data-interventions-action-arg2="before" data-action-event="change">
                    </div>
                    <div>
                        <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block text-center">Процесс</label>
                        <div id="man-prac-photos-process" class="grid grid-cols-2 gap-1 mb-1"></div>
                        <button onclick="document.getElementById('man-prac-photo-process').click()"
                            class="w-full h-14 border border-dashed border-surface rounded-lg bg-[var(--hover-bg)] flex items-center justify-center text-muted active:scale-95 text-rbi-caption font-bold">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg>
                        </button>
                        <input type="file" id="man-prac-photo-process" accept="image/*" multiple class="hidden"
                            data-interventions-action="rbi_handlePracPhotoMulti" data-interventions-action-val-type="event" data-interventions-action-arg2="process" data-action-event="change">
                    </div>
                    <div>
                        <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block text-center">Стало</label>
                        <div id="man-prac-photos-after" class="grid grid-cols-2 gap-1 mb-1"></div>
                        <button onclick="document.getElementById('man-prac-photo-after').click()"
                            class="w-full h-14 border border-dashed border-surface rounded-lg bg-[var(--hover-bg)] flex items-center justify-center text-muted active:scale-95 text-rbi-caption font-bold">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg>
                        </button>
                        <input type="file" id="man-prac-photo-after" accept="image/*" multiple class="hidden"
                            data-interventions-action="rbi_handlePracPhotoMulti" data-interventions-action-val-type="event" data-interventions-action-arg2="after" data-action-event="change">
                    </div>
                </div>

                <div class="border-t border-surface pt-3">
                    <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">Прикрепленные PDF-документы</label>
                    <div id="man-prac-docs-list" class="space-y-2 mb-2"></div>
                    <button onclick="document.getElementById('man-prac-doc-input').click()"
                        class="w-full bg-surface text-muted py-2.5 rounded-lg border border-dashed border-surface font-bold text-rbi-caption uppercase active:scale-95 transition-colors flex items-center justify-center gap-2">
                        📄 Прикрепить PDF
                    </button>
                    <input type="file" id="man-prac-doc-input" accept="application/pdf" multiple class="hidden"
                        data-interventions-action="rbi_handlePracDocMulti" data-interventions-action-val-type="event" data-action-event="change">
                </div>

                <button data-interventions-action="rbi_saveManualPractice"
                    class="w-full bg-brand text-white py-3.5 rounded-xl font-black text-rbi-label uppercase tracking-widest shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2 mt-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5">
                        </path>
                    </svg>
                    Сохранить в базу
                </button>
            </div>
        </div>
    </div>
`;
}

(function mountInterventionsModalsMarkup() {
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
        ? window.RBI.services.shell.getModalsRoot()
        : document.getElementById('app-modals');
    if (!root) return;
    if (!document.getElementById('rbi-intervention-modal')) {
        root.insertAdjacentHTML('beforeend', renderRbiInterventionModalMarkup());
    }
    if (!document.getElementById('rbi-practice-modal')) {
        root.insertAdjacentHTML('beforeend', renderRbiPracticeModalMarkup());
    }
    if (!document.getElementById('manual-practice-modal')) {
        root.insertAdjacentHTML('beforeend', renderManualPracticeModalMarkup());
    }
}());

// =========================================================================
// ИНИЦИАЛИЗАЦИЯ ДАННЫХ (guard — на случай, если не инициализированы ранее)
// =========================================================================

window.rbi_interventionsData = window.rbi_interventionsData || [];
window.rbi_practicesData     = window.rbi_practicesData     || [];
window.rbi_fmeaRecords       = window.rbi_fmeaRecords       || [];

// =========================================================================
// БЛОК ВОЗДЕЙСТВИЙ (INTERVENTIONS)
// =========================================================================

window.rbi_openInterventionModal = function () {
    const cSelect = document.getElementById('rbi-int-contractor');
    if (!cSelect) return;

    // Собираем подрядчиков, которых реально проверял текущий инспектор
    const myName = document.getElementById('inp-inspector')?.value.trim();
    const myChecks = _getAllInspections().filter(c => c.inspectorName === myName);

    if (myChecks.length === 0) {
        return showToast("⚠️ Сначала проведите хотя бы одну проверку!");
    }

    const uniqueContrs = [...new Set(myChecks.map(c => c.contractorName).filter(Boolean))].sort();

    cSelect.innerHTML = uniqueContrs.map(c => `<option value="${c.replace(/"/g, '&quot;')}">${c}</option>`).join('');

    // Сбрасываем поля
    document.getElementById('rbi-int-comment').value = '';
    rbi_updateInterventionTemplates(); // Обновляем зависимый селектор видов работ

    document.getElementById('rbi-intervention-modal').style.display = 'flex';
    document.body.classList.add('modal-open');
};

window.rbi_closeInterventionModal = function () {
    document.getElementById('rbi-intervention-modal').style.display = 'none';
    document.body.classList.remove('modal-open');
};

// Динамическое обновление списка Видов Работ в зависимости от выбранного подрядчика
window.rbi_updateInterventionTemplates = function () {
    const cName = document.getElementById('rbi-int-contractor').value;
    const tSelect = document.getElementById('rbi-int-template');

    const myName = document.getElementById('inp-inspector')?.value.trim();
    const myChecks = _getAllInspections().filter(c => c.inspectorName === myName && c.contractorName === cName);

    // Собираем уникальные виды работ (templateKey -> templateTitle)
    const templatesMap = {};
    myChecks.forEach(c => {
        if (!templatesMap[c.templateKey]) templatesMap[c.templateKey] = c.templateTitle;
    });

    tSelect.innerHTML = Object.keys(templatesMap).map(key => `<option value="${key}">${templatesMap[key]}</option>`).join('');
};

window.rbi_saveIntervention = async function () {
    if (_isDemoMode()) return showToast("В демо-режиме сохранение отключено");
    const cName = document.getElementById('rbi-int-contractor').value;
    const tKey = document.getElementById('rbi-int-template').value;
    const typeSelect = document.getElementById('rbi-int-type');
    const typeText = typeSelect.options[typeSelect.selectedIndex].text.split(' [')[0];
    const typeCoef = parseFloat(typeSelect.value);
    const comment = document.getElementById('rbi-int-comment').value.trim();

    if (!cName || !tKey) return showToast("⚠️ Выберите подрядчика и вид работ");

    // Фиксируем УрК подрядчика НА МОМЕНТ воздействия (чтобы было с чем сравнивать потом)
    const myName = document.getElementById('inp-inspector')?.value.trim();
    const pastChecks = _getAllInspections().filter(c => c.inspectorName === myName && c.contractorName === cName && c.templateKey === tKey).sort((a, b) => new Date(b.date) - new Date(a.date));

    let baseUrkC = 0;
    if (pastChecks.length >= 3) {
        const m = getContractorMetrics(pastChecks, _templates().getUserTemplates());
        if (m) baseUrkC = m.finalC;
    }

    const item = {
        id: 'int_' + Date.now().toString(36),
        date: new Date().toISOString(),
        inspector: myName,
        contractor: cName,
        templateKey: tKey,
        templateTitle: pastChecks[0]?.templateTitle || 'Вид работ',
        typeText: typeText,
        typeCoef: typeCoef,
        comment: comment,
        baseUrk: baseUrkC,
        finalImpact: null,
        deltaUrk: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    window.rbi_interventionsData.push(item);
    await _storage().put(_storage().stores().INTERVENTIONS, item);
    _syncEnqueue('SAVE_INTERVENTION', item);

    _gameLogAction('intervention_logged', item.id);

    showToast("✅ Воздействие зафиксировано! Мониторинг запущен.");
    rbi_closeInterventionModal();
    rbi_renderImpactTab();

    localStorage.setItem('rbi_cloud_dirty', '1');
    _sync('silent');
};

// ==========================================
// ВКЛАДКА ЭФФЕКТИВНОСТЬ (С РЕЕСТРОМ ЭТАЛОНОВ)
// ==========================================
window.rbi_renderImpactTab = function () {
    const container = document.getElementById('rbi-impact-dashboard');
    if (!container) return;

    // ИСПРАВЛЕНИЕ: Гарантируем, что профиль рассчитан, даже если мы не заходили на вкладку
    if (!window.currentProfileData || !window.currentProfileData.rawChecks) {
        const _gameSvc0 = (_ctx && _ctx.game) || window.RBI.services.game;
        const profiles = _gameSvc0.calculateAllProfiles();
        const currentInspector = document.getElementById('inp-inspector')?.value.trim() || _getSetting('engineerName') || 'Неизвестный инспектор';
        window.currentProfileData = profiles[currentInspector] || { name: currentInspector, pi: 0, rawChecks: [] };
    }

    const myProfile = window.currentProfileData;
    if (!myProfile) return container.innerHTML = '<div class="text-center text-muted py-4">Профиль загружается...</div>';

    container.innerHTML = `<div class="flex flex-col items-center justify-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand mb-3"></div><div class="text-rbi-caption font-bold text-muted uppercase tracking-widest">Анализ эффективности...</div></div>`;

    setTimeout(() => {
        try {
            let twiCount = 0; let pracCount = 0; let meetCount = 0; let etalonCount = 0;
            const rawChecks = myProfile.rawChecks || [];

            if (typeof gameActionLogs !== 'undefined') {
                _getGameActionLogs().forEach(l => {
                    if (l.inspector !== myProfile.name) return;
                    if (l.action === 'create_twi' || l.action === 'magic_creator') twiCount++;
                    if (l.action === 'etalon_accepted' || l.action === 'chron_ideal') etalonCount++;
                    if (l.action === 'meeting_memo_created') meetCount++;
                    if (l.action === 'practice_created' || l.action === 'practice_published') pracCount++;
                });
            }

            let totalScore = 0; let impactCount = 0;
            let positiveCount = 0; let negativeCount = 0; let neutralCount = 0;

            const contractorsSet = new Set(rawChecks.map(c => c.contractorName));
            contractorsSet.forEach(cName => {
                const cChecks = rawChecks.filter(c => c.contractorName === cName);
                if (cChecks.length < 6) return;

                const templatesCount = {}; cChecks.forEach(c => templatesCount[c.templateKey] = (templatesCount[c.templateKey] || 0) + 1);
                const topTemplate = Object.keys(templatesCount).sort((a, b) => templatesCount[b] - templatesCount[a])[0];
                const impact = _calculateImpact(myProfile.name, cName, topTemplate);

                if (impact && (impact.score !== 0 || impact.trend !== 'Недостаточно данных')) {
                    totalScore += impact.score; impactCount++;
                    if (impact.score > 0.2) positiveCount++;
                    else if (impact.score < -0.2) negativeCount++;
                    else neutralCount++;
                }
            });

            const avgImpact = impactCount > 0 ? (totalScore / impactCount) : 0;
            let impactColor = avgImpact > 0.2 ? 'text-green-500' : (avgImpact < -0.2 ? 'text-danger' : 'text-muted');


            let html = `
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 animate-fadeIn">
                    <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 text-center shadow-sm">
                        <div class="text-[20px] sm:text-[24px] font-black text-brand leading-none mb-1">${twiCount}</div>
                        <div class="text-rbi-caption sm:text-rbi-caption font-bold text-muted uppercase tracking-widest">TWI-сессии</div>
                    </div>
                    <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 text-center shadow-sm">
                        <div class="text-[20px] sm:text-[24px] font-black text-orange-500 leading-none mb-1">${meetCount}</div>
                        <div class="text-rbi-caption sm:text-rbi-caption font-bold text-muted uppercase tracking-widest">Совещания</div>
                    </div>
                    <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 text-center shadow-sm">
                        <div class="text-[20px] sm:text-[24px] font-black text-blue-500 leading-none mb-1">${etalonCount}</div>
                        <div class="text-rbi-caption sm:text-rbi-caption font-bold text-muted uppercase tracking-widest">Эталоны (ОК)</div>
                    </div>
                    <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 text-center shadow-sm">
                        <div class="text-[20px] sm:text-[24px] font-black text-yellow-500 leading-none mb-1">${pracCount}</div>
                        <div class="text-rbi-caption sm:text-rbi-caption font-bold text-muted uppercase tracking-widest">Практики</div>
                    </div>
                </div>

                <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-sm mb-4 flex flex-col md:flex-row items-center gap-6 animate-fadeIn">
                    <div class="w-full md:w-1/2 relative h-48 flex items-center justify-center">
                        <canvas id="impact-map-chart"></canvas>
                        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-2">
                            <div class="text-[28px] font-black ${impactColor} leading-none">${avgImpact > 0 ? '+' : ''}${avgImpact.toFixed(1)}</div>
                            <div class="text-rbi-caption font-bold text-muted uppercase tracking-widest mt-1">Impact Score</div>
                        </div>
                    </div>
                    <div class="w-full md:w-1/2 space-y-3 w-full">
                        <div class="text-rbi-body font-black text-ink uppercase mb-2 border-b border-[var(--card-border)] pb-2">Влияние на подрядчиков</div>
                        <div class="flex justify-between items-center bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg border border-green-100 dark:border-green-800/50">
                            <span class="text-rbi-label font-bold text-green-700 dark:text-green-400">Улучшили качество</span>
                            <span class="text-rbi-title font-black text-green-600">${positiveCount}</span>
                        </div>
                        <div class="flex justify-between items-center bg-surface px-3 py-2 rounded-lg border border-surface">
                            <span class="text-rbi-label font-bold text-ink">Без изменений</span>
                            <span class="text-rbi-title font-black text-muted">${neutralCount}</span>
                        </div>
                        <div class="flex justify-between items-center bg-danger-soft px-3 py-2 rounded-lg border border-danger-soft">
                            <span class="text-rbi-label font-bold text-danger">Ухудшили качество</span>
                            <span class="text-rbi-title font-black text-danger">${negativeCount}</span>
                        </div>
                    </div>
                </div>

            `;

            container.innerHTML = html;

            setTimeout(() => {
                const ctx = document.getElementById('impact-map-chart');
                if (ctx) {
                    if (window.impactChartInstance) window.impactChartInstance.destroy();
                    let dataArr = [positiveCount, neutralCount, negativeCount];
                    if (positiveCount === 0 && neutralCount === 0 && negativeCount === 0) dataArr = [0, 1, 0];
                    window.impactChartInstance = new Chart(ctx, {
                        type: 'doughnut',
                        data: { labels: ['Улучшили', 'Без изменений', 'Ухудшили'], datasets: [{ data: dataArr, backgroundColor: ['#22c55e', '#cbd5e1', '#ef4444'], borderWidth: 0, cutout: '75%' }] },
                        options: { animation: false, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
                    });
                }
            }, 100);

        } catch (e) {
            console.error("Ошибка в рендере Impact", e);
            container.innerHTML = `<div class="text-center text-danger font-bold p-6 bg-danger-soft rounded-xl border border-danger-soft">❌ Ошибка расчета эффективности. ${e.message}</div>`;
        }
    }, 100);
};

// =========================================================================
// БЛОК ПРАКТИК (PRACTICES)
// =========================================================================

window.rbi_loadPractices = async function () {
    try {
        const stored = await _storage().getAll(_storage().stores().PRACTICES);
        if (stored) window.rbi_practicesData = stored;

        // Нужно подгрузить интервенции для детектора
        if (window.rbi_interventionsData.length === 0) {
            const intObj = await _storage().getAll(_storage().stores().INTERVENTIONS);
            if (intObj) window.rbi_interventionsData = intObj;
        }
    } catch (e) { console.error("Ошибка загрузки практик", e); }
};

// Глобальные фильтры для новой объединенной вкладки
window.kbShowPractices = window.kbShowPractices !== undefined ? window.kbShowPractices : true;
window.kbShowEtalons   = window.kbShowEtalons   !== undefined ? window.kbShowEtalons   : true;

window.rbi_renderPracticesTab = async function () {
    const detectorContainer = document.getElementById('practices-auto-detector');
    const listContainer = document.getElementById('practices-list-container');
    if (!detectorContainer || !listContainer) return;
    const expanded = (typeof window._kbCaptureExpandedGroups === 'function')
        ? window._kbCaptureExpandedGroups(listContainer)
        : new Set();

    const titleContainer = listContainer.previousElementSibling;
    if (titleContainer) {
        titleContainer.className = "sticky-top-panel bg-[var(--card-border)]/80 backdrop-blur-md p-3 rounded-xl border border-[var(--card-border)] shadow-sm mb-4 mt-2 z-40";

        titleContainer.innerHTML = `
            <div class="flex justify-between items-center mb-3 border-b border-[var(--card-border)] pb-2">
                <h2 class="text-rbi-body font-black uppercase text-ink tracking-tight flex items-center gap-1.5">
                    <svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"></path></svg>
                    Библиотека Практик и Эталоны
                </h2>
                <button onclick="rbi_openKbCreateChoice()" class="bg-brand text-white px-3 py-1.5 rounded-lg shadow-md active:scale-95 text-rbi-caption font-black uppercase whitespace-nowrap flex items-center gap-1 transition-transform">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg> Создать
                </button>
            </div>
            
            <div class="flex flex-col gap-2">
                <div class="flex items-center gap-1.5 border-b border-surface pb-2 flex-wrap">
                    <button type="button" role="switch" aria-pressed="${window.kbShowPractices ? 'true' : 'false'}"
                        onclick="window.kbShowPractices=!window.kbShowPractices; rbi_renderPracticesTab()"
                        class="kb-type-chip px-2.5 py-1 rounded-full text-rbi-caption font-black uppercase tracking-wider transition-all active:scale-95 ${window.kbShowPractices ? 'bg-brand text-white shadow-sm' : 'bg-surface text-muted dark:text-muted border border-surface'}">Практики</button>
                    <button type="button" role="switch" aria-pressed="${window.kbShowEtalons ? 'true' : 'false'}"
                        onclick="window.kbShowEtalons=!window.kbShowEtalons; rbi_renderPracticesTab()"
                        class="kb-type-chip px-2.5 py-1 rounded-full text-rbi-caption font-black uppercase tracking-wider transition-all active:scale-95 ${window.kbShowEtalons ? 'bg-brand text-white shadow-sm' : 'bg-surface text-muted dark:text-muted border border-surface'}">Эталоны</button>
                </div>
                <div class="flex justify-between items-center gap-2">
                    <label class="flex items-center gap-2 cursor-pointer active:scale-95 transition-transform">
                        <span class="text-rbi-caption font-black uppercase tracking-widest ${window.practiceOwnerFilter === 'MY' ? 'text-brand' : 'text-muted'}">Только мои</span>
                        <div class="relative">
                            <input type="checkbox" class="sr-only peer" onchange="window.practiceOwnerFilter = this.checked ? 'MY' : 'ALL'; rbi_renderPracticesTab()" ${window.practiceOwnerFilter === 'MY' ? 'checked' : ''}>
                            <div class="w-8 h-4 bg-surface rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand"></div>
                        </div>
                    </label>
                    <div class="flex items-center gap-2 shrink-0">
                        <div id="practices-view-mode-toggle" class="shrink-0"></div>
                        <button type="button" onclick="downloadMissingCloudFiles()" class="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-surface border border-surface text-brand active:scale-95 shadow-sm" title="Скачать всё для офлайна" aria-label="Скачать всё для офлайна">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
        var practicesToggleHost = document.getElementById('practices-view-mode-toggle');
        var kbToggleHtml = window.kbViewModeToggleHtml;
        if (practicesToggleHost && typeof kbToggleHtml === 'function') {
            practicesToggleHost.innerHTML = kbToggleHtml('practices');
        }
    }

    const myName = document.getElementById('inp-inspector')?.value.trim();
    const currentEngineer = _getSetting('engineerName') || 'Инженер';

    // 1. АВТОДЕТЕКТОР УСПЕХА (Для Практик)
    let detectorHtml = '';
    const successfulInterventions = window.rbi_interventionsData.filter(intItem => {
        if (intItem.inspector !== myName) return false;
        if (!intItem.deltaUrk || intItem.deltaUrk < 10) return false;
        return !window.rbi_practicesData.find(p => p.interventionId === intItem.id && !p._deleted);
    });

    if (successfulInterventions.length > 0) {
        const item = successfulInterventions[0];
        detectorHtml = `
            <div class="bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-2xl p-4 shadow-lg text-white mb-6 relative overflow-hidden">
                <div class="absolute -right-4 -top-4 opacity-20 text-8xl">🏆</div>
                <div class="relative z-10">
                    <div class="text-rbi-caption font-black uppercase tracking-widest mb-1 opacity-90 flex items-center gap-1"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Автодетектор Успеха</div>
                    <div class="text-rbi-title font-bold leading-snug mb-3">Потрясающий результат! Качество подрядчика <b>${item.contractor}</b> по виду <b>${item.templateTitle}</b> выросло на <b class="text-yellow-100">+${item.deltaUrk}%</b> после вашей работы.</div>
                    <button onclick="rbi_openCreatePracticeModal('${item.id}')" class="bg-surface text-yellow-700 px-4 py-2 rounded-xl text-rbi-label font-black uppercase tracking-widest active:scale-95 shadow-sm transition-transform">Кристаллизовать опыт (+120 XP)</button>
                </div>
            </div>`;
    }
    detectorContainer.innerHTML = detectorHtml;

    // 2. СБОР И СОРТИРОВКА ДАННЫХ (Практики + Эталоны)
    let mixedData = [];

    if (window.kbShowPractices) {
        const pracs = [...window.rbi_practicesData].filter(p => !p._deleted && p.title && (window.practiceOwnerFilter === 'ALL' || p.author === currentEngineer));
        for (let p of pracs) {
            p._uiType = 'practice';
            p._realAfter = p.photoAfter ? await PhotoManager.getAsyncUrl(p.photoAfter) || window.getPhotoSrc(p.photoAfter) : null;
            p._realBefore = p.photoBefore ? await PhotoManager.getAsyncUrl(p.photoBefore) || window.getPhotoSrc(p.photoBefore) : null;
            mixedData.push(p);
        }
    }

    if (window.kbShowEtalons) {
        const etals = [..._getEtalonActs()].filter(e => !e._deleted && (window.practiceOwnerFilter === 'ALL' || e.owner === currentEngineer || e.inspectorName === currentEngineer));
        for (let e of etals) {
            e._uiType = 'etalon';
            // Достаем первое фото эталона для обложки (elements — старая модель,
            // actV18.photos — модель конструктора «Акт-Эталон (Бета)» Блок 2.5,
            // actV18b.photos — модель «Акт-Эталон (Бета 2, ПК)», 1:1-копия v18-формы).
            e._previewImg = null;
            const firstElementPhoto = e.details && e.details.elements && e.details.elements.length > 0 ? e.details.elements[0].photo : null;
            const firstV18Photo = e.details && e.details.actV18 && e.details.actV18.photos && e.details.actV18.photos.length > 0 ? e.details.actV18.photos[0].photo : null;
            const firstV18bPhoto = e.details && e.details.actV18b && e.details.actV18b.photos && e.details.actV18b.photos.length > 0 ? e.details.actV18b.photos[0].photo : null;
            const coverPhoto = firstElementPhoto || firstV18Photo || firstV18bPhoto;
            if (coverPhoto) e._previewImg = await PhotoManager.getAsyncUrl(coverPhoto) || window.getPhotoSrc(coverPhoto);
            mixedData.push(e);
        }
    }

    mixedData.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

    if (mixedData.length === 0) {
        listContainer.innerHTML = `<div class="text-center py-10 text-muted text-rbi-label font-bold uppercase tracking-widest bg-surface rounded-xl border border-dashed border-surface">В библиотеке пока пусто</div>`;
        return;
    }

    const getViewMode = window.getKnowledgeViewMode;
    const isListView = (typeof getViewMode === 'function' ? getViewMode('practices') : 'cards') === 'list';
    const itemsWrapClass = isListView ? 'flex flex-col gap-1.5' : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3';

    const objectLabel = (item) => {
        const raw = item.projectName || item.project || item.objectName || item.project_display_name || '';
        return String(raw).trim() || 'Без объекта';
    };

    const renderPracticeItem = (item) => {
        const previewImg = item._realAfter || item._realBefore;
        const isOwner = item.author === currentEngineer;
        const pubStatus = item.isPublished ? 'published' : 'draft';
        const safeTitle = String(item.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const authorShort = (item.author || 'Инженер').split(' ')[0];
        const metaRight = item.deltaUrk > 0 ? `+${item.deltaUrk}%` : 'Ручная';

        if (isListView) {
            const thumb = previewImg
                ? `<img src="${previewImg}" class="w-full h-full object-cover">`
                : `<div class="w-full h-full flex items-center justify-center text-muted bg-surface"><svg class="w-5 h-5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z"></path></svg></div>`;
            return `
            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm flex items-center gap-2.5 p-2 active:scale-[0.99] transition-transform relative cursor-pointer" onclick="rbi_openPracticeViewer('${item.id}')">
                <div class="w-11 h-11 rounded-lg overflow-hidden shrink-0 border border-[var(--card-border)]">${thumb}</div>
                <div class="min-w-0 flex-1">
                    <div class="text-rbi-body font-bold text-ink truncate leading-tight">${item.title}${!item.isPublished ? ' <span class="text-rbi-caption font-black text-yellow-600">ЧЕРНОВИК</span>' : ''}</div>
                    <div class="text-rbi-caption font-bold text-muted truncate mt-0.5">Практика · ${item.templateTitle || '—'} · ${authorShort} · ${metaRight}</div>
                </div>
                <button onclick="event.stopPropagation(); openUniversalActionSheet('${item.id}', 'practice', '${safeTitle}', ${isOwner}, '${pubStatus}')" class="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-muted hover:bg-[var(--hover-bg)] active:scale-90">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
                </button>
            </div>`;
        }

        const previewHtml = previewImg ? `<img src="${previewImg}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex flex-col items-center justify-center text-muted bg-surface"><svg class="w-8 h-8 opacity-40 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"></path></svg></div>`;
        return `
            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden flex flex-col active:scale-[0.98] transition-transform relative cursor-pointer" onclick="rbi_openPracticeViewer('${item.id}')">
                <div class="h-28 sm:h-32 border-b border-[var(--card-border)] relative">
                    ${previewHtml}
                    <button onclick="event.stopPropagation(); openUniversalActionSheet('${item.id}', 'practice', '${safeTitle}', ${isOwner}, '${pubStatus}')" class="absolute top-2 right-2 w-8 h-8 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white active:scale-90 transition-transform shadow-md border border-white/20">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
                    </button>
                    ${!item.isPublished ? `<div class="absolute bottom-2 left-2 bg-yellow-500 text-white text-rbi-caption font-black uppercase tracking-widest px-1.5 py-0.5 rounded shadow-md">Черновик</div>` : ''}
                </div>
                <div class="p-3 flex flex-col flex-1">
                    <div class="text-rbi-caption font-black text-brand bg-brand-soft dark:text-brand px-1.5 py-0.5 rounded w-fit mb-1.5 uppercase border border-brand-soft truncate max-w-full">Практика: ${item.templateTitle}</div>
                    <div class="text-rbi-body font-bold text-ink leading-tight line-clamp-2 mb-2">${item.title}</div>
                    <div class="mt-auto border-t border-[var(--card-border)] pt-2 flex justify-between items-center">
                        <div class="text-rbi-caption font-bold text-[var(--text-muted)] truncate pr-2"><svg class="w-3 h-3 inline-block mr-0.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg> ${authorShort}</div>
                        ${item.deltaUrk > 0 ? `<div class="text-rbi-caption font-black text-green-600">+${item.deltaUrk}%</div>` : `<div class="text-rbi-caption font-black text-brand">Ручная</div>`}
                    </div>
                </div>
            </div>`;
    };

    const renderEtalonItem = (item) => {
        const isOwner = (item.owner || item.inspectorName) === currentEngineer;
        const safeContr = String(item.contractorName || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const inspectorShort = item.inspectorName ? item.inspectorName.split(' ')[0] : 'Инженер';
        const etalonLabel = `Эталон${item.source_kind === 'act_v18' ? ' (Бета)' : (item.source_kind === 'act_v18b' ? ' (Бета 2, ПК)' : '')}`;

        if (isListView) {
            const thumb = item._previewImg
                ? `<img src="${item._previewImg}" class="w-full h-full object-cover">`
                : `<div class="w-full h-full flex items-center justify-center text-blue-400 bg-blue-50 dark:bg-blue-900/20"><svg class="w-5 h-5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg></div>`;
            return `
            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm flex items-center gap-2.5 p-2 active:scale-[0.99] transition-transform relative cursor-pointer" onclick="openEtalonViewer('${item.id}')">
                <div class="w-11 h-11 rounded-lg overflow-hidden shrink-0 border border-[var(--card-border)]">${thumb}</div>
                <div class="min-w-0 flex-1">
                    <div class="text-rbi-body font-bold text-ink truncate leading-tight">${item.projectName || 'Без проекта'}</div>
                    <div class="text-rbi-caption font-bold text-muted truncate mt-0.5">${etalonLabel} · ${item.templateTitle || '—'} · ${item.contractorName || '—'} · ${inspectorShort}</div>
                </div>
                <button onclick="event.stopPropagation(); openUniversalActionSheet('${item.id}', 'etalon', '${safeContr}', ${isOwner})" class="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-muted hover:bg-[var(--hover-bg)] active:scale-90">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
                </button>
            </div>`;
        }

        const previewHtml = item._previewImg ? `<img src="${item._previewImg}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex flex-col items-center justify-center text-blue-400 bg-blue-50 dark:bg-blue-900/20"><svg class="w-8 h-8 opacity-50 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg></div>`;
        return `
            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden flex flex-col active:scale-[0.98] transition-transform relative cursor-pointer" onclick="openEtalonViewer('${item.id}')">
                <div class="h-28 sm:h-32 border-b border-[var(--card-border)] relative">
                    ${previewHtml}
                    <button onclick="event.stopPropagation(); openUniversalActionSheet('${item.id}', 'etalon', '${safeContr}', ${isOwner})" class="absolute top-2 right-2 w-8 h-8 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white active:scale-90 transition-transform shadow-md border border-white/20">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
                    </button>
                </div>
                <div class="p-3 flex flex-col flex-1">
                    <div class="text-rbi-caption font-black text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded w-fit mb-1.5 uppercase border border-blue-100 dark:border-blue-800 truncate max-w-full">${etalonLabel}: ${item.templateTitle}</div>
                    <div class="text-rbi-body font-bold text-ink leading-tight line-clamp-2 mb-1">${item.projectName || 'Без проекта'}</div>
                    <div class="text-rbi-caption font-medium text-muted truncate mb-2">👤 ${item.contractorName}</div>
                    <div class="mt-auto border-t border-[var(--card-border)] pt-2 flex justify-between items-center">
                        <div class="text-rbi-caption font-bold text-[var(--text-muted)] truncate pr-2">
                            <svg class="w-3 h-3 inline-block mr-0.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                            ${inspectorShort}
                        </div>
                        <div class="text-rbi-caption font-black text-muted">${new Date(item.date).toLocaleDateString('ru-RU')}</div>
                    </div>
                </div>
            </div>`;
    };

    const grouped = {};
    mixedData.forEach((item) => {
        const pName = objectLabel(item);
        if (!grouped[pName]) grouped[pName] = [];
        grouped[pName].push(item);
    });
    const collator = new Intl.Collator('ru');
    const groupKeys = Object.keys(grouped).sort((a, b) => {
        if (a === 'Без объекта') return 1;
        if (b === 'Без объекта') return -1;
        return collator.compare(a, b);
    });

    let groupIndex = 0;
    listContainer.innerHTML = groupKeys.map((pName) => {
        const items = grouped[pName];
        const safeGroupId = `practices-group-${groupIndex++}`;
        const cardsHtml = items.map((item) => (
            item._uiType === 'practice' ? renderPracticeItem(item) : renderEtalonItem(item)
        )).join('');
        return `
            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-[14px] shadow-sm mb-2 overflow-hidden">
                <div class="flex justify-between items-center p-2.5 cursor-pointer active:bg-[var(--hover-bg)] transition-colors select-none" onclick="
                    const body = document.getElementById('${safeGroupId}');
                    const icon = this.querySelector('.chevron-icon');
                    if (body.classList.contains('hidden')) {
                        body.classList.remove('hidden');
                        icon.style.transform = 'rotate(180deg)';
                    } else {
                        body.classList.add('hidden');
                        icon.style.transform = 'rotate(0deg)';
                    }
                ">
                    <div class="flex items-center gap-2.5 min-w-0 pr-2">
                        <div class="w-8 h-8 bg-brand-soft text-brand rounded-[10px] flex items-center justify-center shrink-0 border border-brand-soft">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                        </div>
                        <div class="min-w-0">
                            <div class="text-rbi-body font-black text-ink truncate leading-tight">${pName}</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0 pl-1">
                        <span class="text-rbi-caption font-bold text-muted bg-[var(--hover-bg)] px-1.5 py-0.5 rounded-md border border-[var(--card-border)]">${items.length} шт</span>
                        <svg class="w-4 h-4 text-muted transition-transform duration-300 transform rotate-0 chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
                <div id="${safeGroupId}" class="hidden border-t border-[var(--card-border)] bg-surface/30 p-2.5">
                    <div class="${itemsWrapClass}">${cardsHtml}</div>
                </div>
            </div>`;
    }).join('');
    if (typeof window._kbRestoreExpandedGroups === 'function') {
        window._kbRestoreExpandedGroups(listContainer, expanded);
    }
};

/** Prefill для выбора версии Акт-Эталона (задача / FAB). */
window._etalonChooserPrefill = { contractor: '', templateKey: '', workTitle: '', project: '', statusKey: '' };

function _etalonVersionButtonsHtml() {
    return `
            <button type="button" onclick="window._etalonChooserOpen('classic')" class="w-full text-left p-4 bg-surface border border-surface rounded-xl flex items-center gap-3 active:scale-95 transition-transform shadow-sm">
                <div class="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shrink-0"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg></div>
                <div>
                    <div class="text-rbi-body font-black text-ink uppercase tracking-wide">Акт-Эталон</div>
                    <div class="text-rbi-caption text-muted font-bold mt-0.5">Классический конструктор с фото узлов</div>
                </div>
            </button>
            <button type="button" onclick="window._etalonChooserOpen('v18')" class="w-full text-left p-4 bg-surface border border-surface rounded-xl flex items-center gap-3 active:scale-95 transition-transform shadow-sm">
                <div class="w-10 h-10 bg-brand-soft text-brand rounded-lg flex items-center justify-center shrink-0"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg></div>
                <div class="flex-1">
                    <div class="text-rbi-body font-black text-ink uppercase tracking-wide flex items-center gap-1.5">Акт-Эталон <span class="text-rbi-caption bg-brand-soft text-brand dark:text-brand px-1.5 py-0.5 rounded uppercase">Бета</span></div>
                    <div class="text-rbi-caption text-muted font-bold mt-0.5">Полный юридический акт (11 разделов, участники, испытания)</div>
                </div>
            </button>
            <button type="button" onclick="window._etalonChooserOpen('v18b')" class="w-full text-left p-4 bg-surface border border-surface rounded-xl flex items-center gap-3 active:scale-95 transition-transform shadow-sm">
                <div class="w-10 h-10 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center shrink-0"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg></div>
                <div class="flex-1">
                    <div class="text-rbi-body font-black text-ink uppercase tracking-wide flex items-center gap-1.5">Акт-Эталон <span class="text-rbi-caption bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-1.5 py-0.5 rounded uppercase">Бета 2 · ПК</span></div>
                    <div class="text-rbi-caption text-muted font-bold mt-0.5">Точная копия исходной формы — только компьютер (≥768px)</div>
                </div>
            </button>`;
}

window._etalonChooserOpen = function (kind) {
    const p = window._etalonChooserPrefill || {};
    if (typeof closeModal === 'function') closeModal();
    if (kind === 'classic') {
        if (typeof openEtalonConstructor === 'function') {
            openEtalonConstructor(p.contractor || '', p.templateKey || '', p.workTitle || '', p.project || '', p.statusKey || '');
        }
        return;
    }
    if (kind === 'v18') {
        if (typeof openEtalonV18Constructor === 'function') {
            openEtalonV18Constructor({
                contractor: p.contractor || '',
                templateKey: p.templateKey || '',
                templateTitle: p.workTitle || '',
                projectName: p.project || '',
                statusKey: p.statusKey || ''
            });
        }
        return;
    }
    if (kind === 'v18b') {
        if (typeof openEtalonV18BConstructor === 'function') {
            openEtalonV18BConstructor({
                contractor: p.contractor || '',
                templateKey: p.templateKey || '',
                templateTitle: p.workTitle || '',
                projectName: p.project || ''
            });
        }
    }
};

/** Выбор версии Акт-Эталона (задача «Снять Эталон», FAB). */
window.openEtalonVersionChooser = function (prefill) {
    const p = prefill || {};
    window._etalonChooserPrefill = {
        contractor: p.contractor || '',
        templateKey: p.templateKey || '',
        workTitle: p.workTitle || p.templateTitle || '',
        project: p.project || p.projectName || '',
        statusKey: p.statusKey || ''
    };
    const modal = document.getElementById('modal-overlay');
    if (!modal) return;
    document.getElementById('modal-icon').innerHTML = '';
    document.getElementById('modal-title').innerHTML = `<div class="text-center font-black uppercase text-lg">Какой Акт-Эталон открыть?</div>`;
    document.getElementById('modal-body').innerHTML = `<div class="space-y-3 mb-2">${_etalonVersionButtonsHtml()}</div>`;
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
};

window.openEtalonVersionChooserFromTask = function (taskId) {
    const task = (window.rbi_tasksData || []).find(function (t) { return t.id === taskId; });
    if (!task) return;
    window.openEtalonVersionChooser({
        contractor: task.contractor || '',
        templateKey: task.templateKey || '',
        workTitle: task.workTitle || task.templateTitle || '',
        project: task.project || '',
        statusKey: task.statusKey || ''
    });
};

// Вспомогательная модалка выбора "Что создать?"
window.rbi_openKbCreateChoice = function () {
    const modal = document.getElementById('modal-overlay');
    document.getElementById('modal-icon').innerHTML = '';
    document.getElementById('modal-title').innerHTML = `<div class="text-center font-black uppercase text-lg">Добавить в библиотеку</div>`;
    document.getElementById('modal-body').innerHTML = `
        <div class="space-y-3 mb-2">
            <button onclick="closeModal(); rbi_openManualPracticeModal()" class="w-full text-left p-4 bg-surface border border-surface rounded-xl flex items-center gap-3 active:scale-95 transition-transform shadow-sm">
                <div class="w-10 h-10 bg-yellow-50 text-yellow-600 rounded-lg flex items-center justify-center shrink-0"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg></div>
                <div>
                    <div class="text-rbi-body font-black text-ink uppercase tracking-wide">Лучшая Практика</div>
                    <div class="text-rbi-caption text-muted font-bold mt-0.5">Поделиться решением проблемы</div>
                </div>
            </button>
            ${_etalonVersionButtonsHtml()}
        </div>
    `;
    // FAB без prefill задачи — пустой контекст
    window._etalonChooserPrefill = { contractor: '', templateKey: '', workTitle: '', project: '', statusKey: '' };
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
};

function _rbiCollectIntPracticeDraft() {
    const st = window._manPracState || { photosBefore: [], photosProcess: [], photosAfter: [], docs: [] };
    const p = {
        intId: document.getElementById('rbi-prac-int-id')?.value || '',
        title: document.getElementById('rbi-prac-title')?.value || '',
        problem: document.getElementById('rbi-prac-problem')?.value || '',
        solution: document.getElementById('rbi-prac-solution')?.value || '',
        takeaway: document.getElementById('rbi-prac-takeaway')?.value || '',
        photosBefore: (st.photosBefore || []).slice(),
        photosProcess: (st.photosProcess || []).slice(),
        photosAfter: (st.photosAfter || []).slice(),
        // legacy draft keys
        photoBefore: (st.photosBefore && st.photosBefore[0]) || '',
        photoAfter: (st.photosAfter && st.photosAfter[0]) || ''
    };
    const base = window._rbiIntPracBaseline || {};
    const changed = !!(
        (p.title || '').trim() ||
        (p.photosBefore && p.photosBefore.length) ||
        (p.photosProcess && p.photosProcess.length) ||
        (p.photosAfter && p.photosAfter.length) ||
        (p.takeaway || '') !== (base.takeaway || '') ||
        (p.problem || '') !== (base.problem || '') ||
        (p.solution || '') !== (base.solution || '')
    );
    return changed ? p : null;
}

function _rbiApplyIntPracticeDraft(p) {
    if (!p) return;
    if (p.title != null) document.getElementById('rbi-prac-title').value = p.title;
    if (p.problem != null) document.getElementById('rbi-prac-problem').value = p.problem;
    if (p.solution != null) document.getElementById('rbi-prac-solution').value = p.solution;
    const takeawayEl = document.getElementById('rbi-prac-takeaway');
    if (takeawayEl && p.takeaway != null) takeawayEl.value = p.takeaway;
    const before = Array.isArray(p.photosBefore) && p.photosBefore.length
        ? p.photosBefore.slice()
        : (p.photoBefore ? [p.photoBefore] : []);
    const after = Array.isArray(p.photosAfter) && p.photosAfter.length
        ? p.photosAfter.slice()
        : (p.photoAfter ? [p.photoAfter] : []);
    window._manPracState = {
        photosBefore: before,
        photosProcess: Array.isArray(p.photosProcess) ? p.photosProcess.slice() : [],
        photosAfter: after,
        docs: Array.isArray(p.docs) ? p.docs.slice() : []
    };
    rbi_renderPracPhotosUI('before');
    rbi_renderPracPhotosUI('process');
    rbi_renderPracPhotosUI('after');
}

window.rbi_openCreatePracticeModal = function (intId) {
    const intItem = window.rbi_interventionsData.find(i => i.id === intId);
    if (!intItem) return;

    const FD = window.RBIFormDraft;
    const draftKey = FD ? FD.practiceIntKey(intId) : null;

    document.getElementById('rbi-prac-int-id').value = intId;
    document.getElementById('rbi-prac-delta').innerText = `+${intItem.deltaUrk}%`;
    document.getElementById('rbi-prac-title').value = '';

    // Автогенерация черновика (можно править под реальный опыт с объекта)
    const autoProblem = `Системное снижение качества (УрК = ${intItem.baseUrk}%). Подрядчик: ${intItem.contractor}.`;
    const autoSolution = `Инструмент: ${intItem.typeText}.\nДействия: ${intItem.comment || 'Проведена работа с персоналом.'}`;
    document.getElementById('rbi-prac-problem').value = autoProblem;
    document.getElementById('rbi-prac-solution').value = autoSolution;
    const takeawayEl = document.getElementById('rbi-prac-takeaway');
    if (takeawayEl) takeawayEl.value = '';
    window._rbiIntPracBaseline = { problem: autoProblem, solution: autoSolution, takeaway: '' };

    window._manPracState = { photosBefore: [], photosProcess: [], photosAfter: [], docs: [] };
    ['before', 'process', 'after'].forEach(function (stage) {
        const inp = document.getElementById('rbi-prac-photo-' + stage);
        if (inp) inp.value = '';
        rbi_renderPracPhotosUI(stage);
    });

    if (FD && draftKey) {
        const decision = FD.askRestore(draftKey, 'Практика по вмешательству');
        if (decision === 'continue') {
            const d = FD.get(draftKey);
            if (d && d.payload) _rbiApplyIntPracticeDraft(d.payload);
        }
    }

    const modal = document.getElementById('rbi-practice-modal');
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
    if (FD && draftKey) {
        FD.bindAutoSave(modal, draftKey, _rbiCollectIntPracticeDraft);
    }
};

window.rbi_closePracticeModal = function () {
    const intId = document.getElementById('rbi-prac-int-id')?.value;
    const FD = window.RBIFormDraft;
    if (FD && intId) {
        const draftKey = FD.practiceIntKey(intId);
        FD.saveNow(draftKey, _rbiCollectIntPracticeDraft);
        FD.unbindAutoSave(draftKey);
    }
    document.getElementById('rbi-practice-modal').style.display = 'none';
    document.body.classList.remove('modal-open');
};

window.rbi_handlePracticePhoto = function (event, type) {
    return window.rbi_handlePracPhotoMulti(event, type);
};

window.rbi_savePractice = async function () {
    const title = document.getElementById('rbi-prac-title').value.trim();
    if (!title) return showToast("⚠️ Введите Название Практики!");

    const intId = document.getElementById('rbi-prac-int-id').value;
    const intItem = window.rbi_interventionsData.find(i => i.id === intId);
    const st = window._manPracState || { photosBefore: [], photosProcess: [], photosAfter: [], docs: [] };

    const practice = {
        id: 'prac_' + Date.now().toString(36),
        interventionId: intId,
        date: new Date().toISOString(),
        author: document.getElementById('inp-inspector')?.value.trim() || 'Инженер',
        owner: document.getElementById('inp-inspector')?.value.trim() || 'Инженер',
        title: title,
        projectName: document.getElementById('inp-project')?.value.trim() || '',
        templateKey: intItem.templateKey,
        templateTitle: intItem.templateTitle,
        deltaUrk: intItem.deltaUrk,
        problem: document.getElementById('rbi-prac-problem').value.trim(),
        solution: document.getElementById('rbi-prac-solution').value.trim(),
        takeaway: (document.getElementById('rbi-prac-takeaway')?.value || '').trim(),
        photosBefore: (st.photosBefore || []).slice(),
        photosProcess: (st.photosProcess || []).slice(),
        photosAfter: (st.photosAfter || []).slice(),
        docs: (st.docs || []).slice(),
        photoBefore: (st.photosBefore && st.photosBefore[0]) || null,
        photoAfter: (st.photosAfter && st.photosAfter[0]) || null,
        isPublished: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    window.rbi_practicesData.push(practice);
    await _storage().put(_storage().stores().PRACTICES, practice);
    _syncEnqueue('SAVE_PRACTICE', practice);

    _gameLogAction('practice_created', practice.id);

    const FD = window.RBIFormDraft;
    if (FD) {
        FD.clear(FD.practiceIntKey(intId));
        FD.unbindAutoSave(FD.practiceIntKey(intId));
    }

    showToast("🏆 Практика кристаллизована! Начислено +120 XP.");
    document.getElementById('rbi-practice-modal').style.display = 'none';
    document.body.classList.remove('modal-open');
    rbi_renderPracticesTab();

    localStorage.setItem('rbi_cloud_dirty', '1');
    _sync('silent');
};

window.rbi_publishPractice = async function (id) {
    var _knowSvc1 = (_ctx && _ctx.knowledge) || window.RBI.services.knowledge;
    if (!_knowSvc1.requireEditRight()) return;
    const pIndex = window.rbi_practicesData.findIndex(p => p.id === id);
    if (pIndex === -1) return;

    if (window.isSyncEnabled && !window.isSyncEnabled()) {
        return showToast("⚠️ Для публикации включите синхронизацию с облаком в Настройках.");
    }

    window.rbi_practicesData[pIndex].isPublished = true;
    window.rbi_practicesData[pIndex].updatedAt = new Date().toISOString();

    await _storage().put(_storage().stores().PRACTICES, window.rbi_practicesData[pIndex]);

    _gameLogAction('practice_published', id);

    localStorage.setItem('rbi_cloud_dirty', '1');
    _sync('silent');

    showToast("📤 Практика отправлена в компанию! Начислено +50 XP.");
    rbi_renderPracticesTab();
};

window.rbi_deletePractice = async function (id) {
    const pIndex = window.rbi_practicesData.findIndex(p => p.id === id);
    var _knowSvc2 = (_ctx && _ctx.knowledge) || window.RBI.services.knowledge;
    if (pIndex !== -1 && !_knowSvc2.canDeleteItem(window.rbi_practicesData[pIndex], 'practice')) {
        return showToast("⚠️ Инженер может удалить только свою практику. Чужие материалы удаляют заместитель или администратор.");
    }

    if (!confirm("Вы уверены, что хотите удалить эту практику? Она удалится у всей команды.")) return;
    if (pIndex === -1) return;

    // Мягкое удаление с правильными флагами для облака
    window.rbi_practicesData[pIndex]._deleted = true;
    window.rbi_practicesData[pIndex].is_deleted = true;
    window.rbi_practicesData[pIndex].updatedAt = new Date().toISOString();
    window.rbi_practicesData[pIndex].updated_at = window.rbi_practicesData[pIndex].updatedAt;
    
    window.rbi_practicesData[pIndex].source = 'local';
    window.rbi_practicesData[pIndex].syncStatus = 'not_synced';
    window.rbi_practicesData[pIndex].sync_status = 'not_synced';
    window.rbi_practicesData[pIndex].syncBlockReason = '';
    window.rbi_practicesData[pIndex].sync_block_reason = '';

    await _storage().put(_storage().stores().PRACTICES, window.rbi_practicesData[pIndex]);

    // Даем команду облаку
    localStorage.setItem('rbi_cloud_dirty', '1');
    _sync('silent');

    showToast("🗑️ Практика успешно удалена.");
    rbi_renderPracticesTab();
};

// --- ЛОГИКА РУЧНЫХ ПРАКТИК (мульти-фото по этапам + PDF-документы) ---
window._manPracState = { photosBefore: [], photosProcess: [], photosAfter: [], docs: [] };

function _rbiCollectManualPracticeDraft() {
    const st = window._manPracState || { photosBefore: [], photosProcess: [], photosAfter: [], docs: [] };
    return {
        title: document.getElementById('man-prac-title')?.value || '',
        problem: document.getElementById('man-prac-problem')?.value || '',
        solution: document.getElementById('man-prac-solution')?.value || '',
        takeaway: document.getElementById('man-prac-takeaway')?.value || '',
        photosBefore: (st.photosBefore || []).slice(),
        photosProcess: (st.photosProcess || []).slice(),
        photosAfter: (st.photosAfter || []).slice(),
        docs: (st.docs || []).map(function (d) {
            return { url: d.url, name: d.name, desc: d.desc || '' };
        })
    };
}

function _rbiApplyManualPracticeDraft(p) {
    if (!p) return;
    if (p.title != null) document.getElementById('man-prac-title').value = p.title;
    if (p.problem != null) document.getElementById('man-prac-problem').value = p.problem;
    if (p.solution != null) document.getElementById('man-prac-solution').value = p.solution;
    const manTakeaway = document.getElementById('man-prac-takeaway');
    if (manTakeaway && p.takeaway != null) manTakeaway.value = p.takeaway;
    window._manPracState = {
        photosBefore: Array.isArray(p.photosBefore) ? p.photosBefore.slice() : [],
        photosProcess: Array.isArray(p.photosProcess) ? p.photosProcess.slice() : [],
        photosAfter: Array.isArray(p.photosAfter) ? p.photosAfter.slice() : [],
        docs: Array.isArray(p.docs) ? p.docs.map(function (d) {
            return { url: d.url, name: d.name, desc: d.desc || '' };
        }) : []
    };
    rbi_renderPracPhotosUI('before');
    rbi_renderPracPhotosUI('process');
    rbi_renderPracPhotosUI('after');
    renderPracticeDocsUI();
}

// Редактирование существующей практики (детектор-практики и ручные — единой
// формой manual-practice-modal, т.к. она не требует привязки к intervention).
window.rbi_editPractice = function (id) {
    const p = window.rbi_practicesData.find(x => x.id === id);
    if (!p) return;
    var _perms = window.RBI && window.RBI.services && window.RBI.services.permissions;
    if (_perms && typeof _perms.canEdit === 'function' && !_perms.canEdit(p, 'intervention')) {
        return showToast("⚠️ Редактировать можно только свою практику.");
    }

    window._rbiPracEditId = id;
    const titleEl = document.getElementById('man-prac-modal-title');
    if (titleEl) titleEl.textContent = 'Изменить практику';

    document.getElementById('man-prac-title').value = p.title || '';
    document.getElementById('man-prac-problem').value = p.problem || '';
    document.getElementById('man-prac-solution').value = p.solution || '';
    const takeawayEl = document.getElementById('man-prac-takeaway');
    if (takeawayEl) takeawayEl.value = p.takeaway || '';

    window._manPracState = {
        photosBefore: Array.isArray(p.photosBefore) && p.photosBefore.length ? p.photosBefore.slice() : (p.photoBefore ? [p.photoBefore] : []),
        photosProcess: Array.isArray(p.photosProcess) ? p.photosProcess.slice() : [],
        photosAfter: Array.isArray(p.photosAfter) && p.photosAfter.length ? p.photosAfter.slice() : (p.photoAfter ? [p.photoAfter] : []),
        docs: Array.isArray(p.docs) ? p.docs.slice() : []
    };
    rbi_renderPracPhotosUI('before');
    rbi_renderPracPhotosUI('process');
    rbi_renderPracPhotosUI('after');
    renderPracticeDocsUI();

    const modal = document.getElementById('manual-practice-modal');
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
};

window.rbi_openManualPracticeModal = function () {
    window._rbiPracEditId = null;
    const titleEl = document.getElementById('man-prac-modal-title');
    if (titleEl) titleEl.textContent = 'Новая практика';

    const FD = window.RBIFormDraft;
    const draftKey = FD ? FD.KEYS.PRACTICE_MANUAL : null;

    document.getElementById('man-prac-title').value = '';
    document.getElementById('man-prac-problem').value = '';
    document.getElementById('man-prac-solution').value = '';
    const manTakeaway = document.getElementById('man-prac-takeaway');
    if (manTakeaway) manTakeaway.value = '';
    window._manPracState = { photosBefore: [], photosProcess: [], photosAfter: [], docs: [] };
    rbi_renderPracPhotosUI('before');
    rbi_renderPracPhotosUI('process');
    rbi_renderPracPhotosUI('after');
    renderPracticeDocsUI();

    if (FD && draftKey) {
        const decision = FD.askRestore(draftKey, 'Практика');
        if (decision === 'continue') {
            const d = FD.get(draftKey);
            if (d && d.payload) _rbiApplyManualPracticeDraft(d.payload);
        }
    }

    const modal = document.getElementById('manual-practice-modal');
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
    if (FD && draftKey) {
        FD.bindAutoSave(modal, draftKey, _rbiCollectManualPracticeDraft);
    }
};

window.rbi_closeManualPracticeModal = function () {
    const FD = window.RBIFormDraft;
    // При редактировании существующей практики черновик-автосейв не нужен —
    // он предназначен только для формы создания новой записи.
    if (FD && !window._rbiPracEditId) {
        const draftKey = FD.KEYS.PRACTICE_MANUAL;
        FD.saveNow(draftKey, _rbiCollectManualPracticeDraft);
        FD.unbindAutoSave(draftKey);
    }
    window._rbiPracEditId = null;
    document.getElementById('manual-practice-modal').style.display = 'none';
    document.body.classList.remove('modal-open');
};

// Совместимость со старым legacy-обработчиком одиночного фото (если где-то еще вызывается)
window.rbi_handleManualPracticePhoto = function (event, type) {
    return window.rbi_handlePracPhotoMulti(event, type);
};

const _manPracStageKeyMap = { before: 'photosBefore', process: 'photosProcess', after: 'photosAfter' };
const _pracPhotoLimits = { before: 4, process: 6, after: 4 };

function _pracPhotoContainers(stage) {
    return [
        document.getElementById('man-prac-photos-' + stage),
        document.getElementById('rbi-prac-photos-' + stage)
    ].filter(Boolean);
}

function _pracSavePhotoDraft() {
    const FD = window.RBIFormDraft;
    if (!FD) return;
    const manModal = document.getElementById('manual-practice-modal');
    if (manModal && manModal.style.display === 'flex') {
        FD.saveNow(FD.KEYS.PRACTICE_MANUAL, _rbiCollectManualPracticeDraft);
        return;
    }
    const intId = document.getElementById('rbi-prac-int-id')?.value;
    if (intId) FD.saveNow(FD.practiceIntKey(intId), _rbiCollectIntPracticeDraft);
}

window.rbi_handlePracPhotoMulti = function (event, stage) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    if (!window._manPracState) {
        window._manPracState = { photosBefore: [], photosProcess: [], photosAfter: [], docs: [] };
    }
    const stateKey = _manPracStageKeyMap[stage] || 'photosBefore';
    const limit = _pracPhotoLimits[stage] || 4;
    const current = window._manPracState[stateKey] || [];
    const room = Math.max(0, limit - current.length);
    if (room === 0) {
        showToast('Лимит фото: ' + limit + ' для этапа «' + stage + '»');
        event.target.value = '';
        return;
    }
    const toAdd = files.slice(0, room);
    if (files.length > room) showToast('Добавлено ' + room + ' из ' + files.length + ' (лимит ' + limit + ')');
    toAdd.forEach((file) => {
        window.compressImageToBase64(file, 1000, 0.8, async (base64) => {
            const localUrl = await PhotoManager.saveLocal(base64, 'prac');
            window._manPracState[stateKey].push(localUrl);
            rbi_renderPracPhotosUI(stage);
            _pracSavePhotoDraft();
        });
    });
    event.target.value = '';
};

window.rbi_renderPracPhotosUI = function (stage) {
    const stateKey = _manPracStageKeyMap[stage] || 'photosBefore';
    const containers = _pracPhotoContainers(stage);
    if (!containers.length) return;
    const photos = (window._manPracState && window._manPracState[stateKey]) || [];
    const html = photos.map((url, idx) => `
        <div class="relative w-full h-14 rounded-lg overflow-hidden border border-surface bg-surface">
            <img ${(typeof window.rbiBuildPhotoImgAttrs === 'function') ? window.rbiBuildPhotoImgAttrs(url, { preferThumb: true }) : ('src="' + window.getPhotoSrc(url) + '"')} class="w-full h-full object-cover">
            <button type="button" onclick="rbi_removePracPhoto('${stage}', ${idx})" class="absolute top-0.5 right-0.5 bg-danger text-white w-4 h-4 rounded-full flex items-center justify-center text-rbi-caption font-black shadow-sm active:scale-90">✕</button>
        </div>
    `).join('');
    containers.forEach(function (container) {
        container.innerHTML = html;
        if (typeof window.rbiHydrateLocalImages === 'function') window.rbiHydrateLocalImages(container);
    });
};

window.rbi_removePracPhoto = function (stage, idx) {
    const stateKey = _manPracStageKeyMap[stage] || 'photosBefore';
    if (!window._manPracState || !window._manPracState[stateKey]) return;
    window._manPracState[stateKey].splice(idx, 1);
    rbi_renderPracPhotosUI(stage);
    _pracSavePhotoDraft();
};

window.rbi_handlePracDocMulti = function (event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const localUrl = await PhotoManager.saveLocal(e.target.result, 'prac_doc');
            window._manPracState.docs.push({ url: localUrl, name: file.name, desc: '' });
            renderPracticeDocsUI();
            const FD = window.RBIFormDraft;
            if (FD) FD.saveNow(FD.KEYS.PRACTICE_MANUAL, _rbiCollectManualPracticeDraft);
        };
        reader.readAsDataURL(file);
    });
    event.target.value = '';
};

window.renderPracticeDocsUI = function () {
    const container = document.getElementById('man-prac-docs-list');
    if (!container) return;
    const docs = window._manPracState.docs || [];
    if (docs.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = docs.map((d, idx) => `
        <div class="flex items-center gap-2 bg-surface border border-surface rounded-lg p-2">
            <div class="text-rbi-label font-bold text-ink truncate flex-1">📄 ${d.name}</div>
            <input type="text" placeholder="Описание..." value="${(d.desc || '').replace(/"/g, '&quot;')}" oninput="window._manPracState.docs[${idx}].desc = this.value" class="input-base !py-1 !text-rbi-caption flex-1">
            <button onclick="rbi_removePracDoc(${idx})" class="w-6 h-6 bg-danger-soft text-danger rounded-full flex items-center justify-center text-rbi-caption font-black shrink-0">✕</button>
        </div>
    `).join('');
};

window.rbi_removePracDoc = function (idx) {
    window._manPracState.docs.splice(idx, 1);
    renderPracticeDocsUI();
    const FD = window.RBIFormDraft;
    if (FD) FD.saveNow(FD.KEYS.PRACTICE_MANUAL, _rbiCollectManualPracticeDraft);
};

window.rbi_saveManualPractice = async function () {
    const title = document.getElementById('man-prac-title').value.trim();
    if (!title) return showToast("⚠️ Введите Название Практики!");

    const st = window._manPracState || { photosBefore: [], photosProcess: [], photosAfter: [], docs: [] };

    const editId = window._rbiPracEditId;
    if (editId) {
        const pIndex = window.rbi_practicesData.findIndex(p => p.id === editId);
        if (pIndex === -1) { window._rbiPracEditId = null; return; }
        const existing = window.rbi_practicesData[pIndex];
        existing.title = title;
        existing.problem = document.getElementById('man-prac-problem').value.trim();
        existing.solution = document.getElementById('man-prac-solution').value.trim();
        existing.takeaway = (document.getElementById('man-prac-takeaway')?.value || '').trim();
        existing.photosBefore = (st.photosBefore || []).slice();
        existing.photosProcess = (st.photosProcess || []).slice();
        existing.photosAfter = (st.photosAfter || []).slice();
        existing.docs = (st.docs || []).slice();
        existing.photoBefore = (st.photosBefore && st.photosBefore[0]) || null;
        existing.photoAfter = (st.photosAfter && st.photosAfter[0]) || null;
        existing.updatedAt = new Date().toISOString();
        existing.source = 'local';
        existing.syncStatus = 'not_synced';
        existing.sync_status = 'not_synced';

        await _storage().put(_storage().stores().PRACTICES, existing);
        _syncEnqueue('SAVE_PRACTICE', existing);

        window._rbiPracEditId = null;
        showToast("✅ Практика обновлена");
        document.getElementById('manual-practice-modal').style.display = 'none';
        document.body.classList.remove('modal-open');
        rbi_renderPracticesTab();

        localStorage.setItem('rbi_cloud_dirty', '1');
        _sync('silent');
        return;
    }

    const practice = {
        id: 'prac_' + Date.now().toString(36),
        interventionId: null, // Нет привязки к авто-детектору
        date: new Date().toISOString(),
        author: document.getElementById('inp-inspector')?.value.trim() || 'Инженер',
        owner: document.getElementById('inp-inspector')?.value.trim() || 'Инженер',
        title: title,
        projectName: document.getElementById('inp-project')?.value.trim() || '',
        templateKey: 'manual',
        templateTitle: 'Ручной опыт',
        deltaUrk: 0, // Не высчитываем процент для ручных
        problem: document.getElementById('man-prac-problem').value.trim(),
        solution: document.getElementById('man-prac-solution').value.trim(),
        takeaway: (document.getElementById('man-prac-takeaway')?.value || '').trim(),
        // Мульти-фото по этапам (новый формат). Первое фото каждого этапа дублируется
        // в photoBefore/photoAfter для обратной совместимости со старыми версиями рендера.
        photosBefore: st.photosBefore.slice(),
        photosProcess: st.photosProcess.slice(),
        photosAfter: st.photosAfter.slice(),
        docs: st.docs.slice(),
        photoBefore: st.photosBefore[0] || null,
        photoAfter: st.photosAfter[0] || null,
        isPublished: true, // Ручные сразу идут в библиотеку
        source: 'local',
        syncStatus: 'not_synced',
        sync_status: 'not_synced',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    window.rbi_practicesData.push(practice);
    await _storage().put(_storage().stores().PRACTICES, practice);

    _gameLogAction('practice_published', practice.id);

    const FD = window.RBIFormDraft;
    if (FD) {
        FD.clear(FD.KEYS.PRACTICE_MANUAL);
        FD.unbindAutoSave(FD.KEYS.PRACTICE_MANUAL);
    }

    showToast("📚 Практика сохранена и опубликована!");
    document.getElementById('manual-practice-modal').style.display = 'none';
    document.body.classList.remove('modal-open');
    rbi_renderPracticesTab();

    localStorage.setItem('rbi_cloud_dirty', '1');
    _sync('silent');
};

// ============================================================================
// ЭКСПОРТ ВСЕЙ БИБЛИОТЕКИ СПРАВОЧНИКОВ В КОД (ДЛЯ ВШИВАНИЯ В PWA)
// ============================================================================
window.exportLibraryToJsCode = async function (skipSyncCheck = false) {
    const checkLocal = (arr) => {
        if (!Array.isArray(arr)) return false;
        const userItems = arr.filter(i => i && i.id && !String(i.id).startsWith('sys_'));
        let str = JSON.stringify(userItems);
        return str.includes('"local://') || str.includes('"data:image');
    };

    // Если есть локальные фотки и мы еще не пробовали синхронизироваться
    if (!skipSyncCheck && (checkLocal(_getTwiCards()) || checkLocal(_getCustomNodes()) || checkLocal(window.rbi_practicesData))) {
        if (confirm("⚠️ В вашей библиотеке есть локальные фото.\n\nЧтобы они работали у всех без интернета, их нужно выгрузить в облако перед скачиванием кода.\n\nПопробовать синхронизировать автоматически?")) {
            showToast("⏳ Синхронизация фото...");

            localStorage.setItem('rbi_cloud_dirty', '1');

            await _sync('manual');
            // Даем время на сохранение в IndexedDB
            setTimeout(async () => {
                var _knowSvc3 = (_ctx && _ctx.knowledge) || window.RBI.services.knowledge;
            await _knowSvc3.reloadReferenceMemory(); // Подтягиваем свежие ссылки
                window.exportLibraryToJsCode(true); // Передаем true, чтобы пропустить проверку и скачать код
            }, 2000);
            return;
        }
    }

    let jsCode = "/* =================================================== */\n";
    jsCode += "/* Сгенерировано из RBI Quality (Вшитая Библиотека)    */\n";
    jsCode += "/* =================================================== */\n\n";

    // 1. Нормативы (Docs)
    const exportDocs = _getCustomDocs().filter(d => !String(d.id).startsWith('sys_'));
    jsCode += "// --- 1. НОРМАТИВНЫЕ ДОКУМЕНТЫ ---\n";
    jsCode += `const CUSTOM_SYSTEM_DOCS = ${JSON.stringify(exportDocs, null, 4)};\n\n`;

    // 2. Технические Узлы (Nodes)
    const exportNodes = _getCustomNodes().filter(n => !String(n.id).startsWith('sys_'));
    jsCode += "// --- 2. ТЕХНИЧЕСКИЕ УЗЛЫ ---\n";
    jsCode += `const CUSTOM_SYSTEM_NODES = ${JSON.stringify(exportNodes, null, 4)};\n\n`;

    // 3. Инструкции (TWI)
    const exportTwi = _getTwiCards().filter(t => !String(t.id).startsWith('sys_'));
    jsCode += "// --- 3. TWI ИНСТРУКЦИИ ---\n";
    jsCode += `const CUSTOM_TWI_CARDS = ${JSON.stringify(exportTwi, null, 4)};\n\n`;

    // 4. Лучшие Практики (Practices)
    const exportPrac = (window.rbi_practicesData || []).filter(p => !p._deleted && p.isPublished);
    jsCode += "// --- 4. ОПУБЛИКОВАННЫЕ ПРАКТИКИ ---\n";
    jsCode += `const CUSTOM_PRACTICES = ${JSON.stringify(exportPrac, null, 4)};\n\n`;

    // 5. Пользовательские Чек-листы (Templates)
    const exportTemplates = {};
    const _ut = _templates().getUserTemplates();
    {
        Object.keys(_ut).forEach(k => {
            if (!_ut[k]._deleted) {
                // Делаем копию, чтобы не сломать рабочие данные на экране
                const tmplClone = JSON.parse(JSON.stringify(_ut[k]));

                // Очищаем текст нормативов от HTML-тегов, чтобы код был чистым
                if (tmplClone.groups) {
                    tmplClone.groups.forEach(g => {
                        if (g.items) {
                            g.items.forEach(item => {
                                if (item.t) {
                                    let cleanText = item.t.replace(/<br\s*[\/]?>/gi, "\\n");
                                    cleanText = cleanText.replace(/<\/?[^>]+(>|$)/g, "");
                                    item.t = cleanText;
                                }
                            });
                        }
                    });
                }
                exportTemplates[k] = tmplClone;
            }
        });
    }
    jsCode += "// --- 5. ПОЛЬЗОВАТЕЛЬСКИЕ ЧЕК-ЛИСТЫ ---\n";
    jsCode += `const CUSTOM_USER_TEMPLATES = ${JSON.stringify(exportTemplates, null, 4)};\n\n`;

    downloadFile(jsCode, `rbi_library_code_${new Date().toLocaleDateString('ru-RU')}.js`, 'application/javascript');
    showToast("✅ Файл библиотеки со ссылками скачан!");
};

// === ЛОГИКА УНИВЕРСАЛЬНОГО МЕНЮ (3 ТОЧКИ) ===
window.openUniversalActionSheet = function (id, type, title, isOwner, extraData) {
    // <-- ВСТАВКА: Режим Бога для администратора (разрешаем удалять и менять всё)
    var _permSvc = (_ctx && _ctx.permissions) || window.RBI.services.permissions;
    if (_permSvc && _permSvc.isAdmin()) {
        isOwner = true;
    }

    const sheet = document.getElementById('universal-action-sheet');
    document.getElementById('uas-title').innerText = title;

    let btnsHtml = '';

    // Кнопка: Просмотр (Для всех)
    btnsHtml += `
        <button onclick="handleUasAction('${id}', '${type}', 'view')" class="w-full flex items-center gap-3 p-3 hover:bg-surface rounded-xl transition-colors text-ink active:scale-95">
            <div class="w-8 h-8 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
            </div>
            <span class="text-rbi-body font-bold">Смотреть</span>
        </button>
    `;

    // Кнопки выгрузки (Практики): PDF / Печать / PPTX — один строгий макет A4
    if (type === 'practice') {
        btnsHtml += `
        <button onclick="handleUasAction('${id}', '${type}', 'pdf')" class="w-full flex items-center gap-3 p-3 hover:bg-surface rounded-xl transition-colors text-ink active:scale-95">
            <div class="w-8 h-8 bg-brand-soft text-brand dark:text-brand rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"></path></svg>
            </div>
            <span class="text-rbi-body font-bold">Скачать PDF</span>
        </button>
        <button onclick="handleUasAction('${id}', '${type}', 'print')" class="w-full flex items-center gap-3 p-3 hover:bg-surface rounded-xl transition-colors text-ink active:scale-95">
            <div class="w-8 h-8 bg-surface text-ink dark:text-muted rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z"></path></svg>
            </div>
            <span class="text-rbi-body font-bold">Печать</span>
        </button>
        <button onclick="handleUasAction('${id}', '${type}', 'pptx')" class="w-full flex items-center gap-3 p-3 hover:bg-surface rounded-xl transition-colors text-ink active:scale-95">
            <div class="w-8 h-8 bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2zm3 4h4M8 12h8M8 16h5"></path></svg>
            </div>
            <span class="text-rbi-body font-bold">Сохранить PPTX</span>
        </button>`;
    }

    // Кнопка: Изменить (Только Практики, только автор)
    if (type === 'practice' && isOwner) {
        btnsHtml += `
        <button onclick="handleUasAction('${id}', '${type}', 'edit')" class="w-full flex items-center gap-3 p-3 hover:bg-surface rounded-xl transition-colors text-ink active:scale-95">
            <div class="w-8 h-8 bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"></path></svg>
            </div>
            <span class="text-rbi-body font-bold">Изменить</span>
        </button>`;
    }
    // Кнопка: Опубликовать (Только Практики, только автор, если еще не опубликовано)
    if (type === 'practice' && isOwner && extraData !== 'published') {
        btnsHtml += `
        <button onclick="handleUasAction('${id}', '${type}', 'publish')" class="w-full flex items-center gap-3 p-3 hover:bg-surface rounded-xl transition-colors text-ink active:scale-95">
            <div class="w-8 h-8 bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg>
            </div>
            <span class="text-rbi-body font-bold">Опубликовать в библиотеку</span>
        </button>`;
    }
    // Кнопки для Эталонов
    if (type === 'etalon') {
        btnsHtml += `
        <button onclick="handleUasAction('${id}', '${type}', 'pdf')" class="w-full flex items-center gap-3 p-3 hover:bg-surface rounded-xl transition-colors text-ink active:scale-95">
            <div class="w-8 h-8 bg-brand-soft text-brand dark:text-brand rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"></path></svg>
            </div>
            <span class="text-rbi-body font-bold">Скачать PDF</span>
        </button>
        <button onclick="handleUasAction('${id}', '${type}', 'word')" class="w-full flex items-center gap-3 p-3 hover:bg-surface rounded-xl transition-colors text-ink active:scale-95">
            <div class="w-8 h-8 bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"></path></svg>
            </div>
            <span class="text-rbi-body font-bold">Скачать Word</span>
        </button>`;

        if (isOwner) {
            btnsHtml += `
            <button onclick="handleUasAction('${id}', '${type}', 'edit')" class="w-full flex items-center gap-3 p-3 hover:bg-surface rounded-xl transition-colors text-ink active:scale-95">
                <div class="w-8 h-8 bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 rounded-lg flex items-center justify-center shrink-0">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"></path></svg>
                </div>
                <span class="text-rbi-body font-bold">Изменить</span>
            </button>`;
        }
    }
    // Кнопки для Отчетов (PDF)
    if (type === 'report') {
        btnsHtml += `
        <button onclick="handleUasAction('${id}', '${type}', 'share')" class="w-full flex items-center gap-3 p-3 hover:bg-surface rounded-xl transition-colors text-ink active:scale-95">
            <div class="w-8 h-8 bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"></path></svg>
            </div>
            <span class="text-rbi-body font-bold">Поделиться файлом</span>
        </button>`;
    }
    // Изменить (Только TWI)
    if (type === 'twi' && isOwner) {
        btnsHtml += `
        <button onclick="handleUasAction('${id}', '${type}', 'publish')" class="w-full flex items-center gap-3 p-3 hover:bg-surface rounded-xl transition-colors text-ink active:scale-95">
            <div class="w-8 h-8 bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"></path></svg>
            </div>
            <span class="text-rbi-body font-bold">Изменить</span>
        </button>`;
    }
    // Кнопки для FMEA и Совещаний (Редактировать и PDF)
    if ((type === 'fmea' || type === 'meeting') && isOwner) {
        btnsHtml += `
        <button onclick="handleUasAction('${id}', '${type}', 'edit')" class="w-full flex items-center gap-3 p-3 hover:bg-surface rounded-xl transition-colors text-ink active:scale-95">
            <div class="w-8 h-8 bg-surface text-ink dark:text-muted rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"></path></svg>
            </div>
            <span class="text-rbi-body font-bold">Изменить</span>
        </button>
        <button onclick="handleUasAction('${id}', '${type}', 'pdf')" class="w-full flex items-center gap-3 p-3 hover:bg-surface rounded-xl transition-colors text-ink active:scale-95">
            <div class="w-8 h-8 bg-brand-soft text-brand dark:text-brand rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"></path></svg>
            </div>
            <span class="text-rbi-body font-bold">Скачать PDF</span>
        </button>`;
    }
    if ((type === 'meeting' || type === 'fmea') && isOwner) {
        btnsHtml += `
        <button onclick="handleUasAction('${id}', '${type}', 'bind')" class="w-full flex items-center gap-3 p-3 hover:bg-surface rounded-xl transition-colors text-ink active:scale-95">
            <div class="w-8 h-8 bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"></path></svg>
            </div>
            <span class="text-rbi-body font-bold">Привязать к объекту</span>
        </button>`;
    }
    // Изменить НД (автор или админ — isOwner уже расширен для админа выше)
    if (type === 'doc' && isOwner && !String(id).startsWith('sys_')) {
        btnsHtml += `
        <button onclick="handleUasAction('${id}', '${type}', 'edit')" class="w-full flex items-center gap-3 p-3 hover:bg-surface rounded-xl transition-colors text-ink active:scale-95">
            <div class="w-8 h-8 bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"></path></svg>
            </div>
            <span class="text-rbi-body font-bold">Изменить</span>
        </button>`;
    }
    // Переиндексировать и отправить (Только НД, только администратор)
    if (type === 'doc' && _permSvc && _permSvc.isAdmin()) {
        btnsHtml += `
        <button onclick="handleUasAction('${id}', '${type}', 'reindex')" class="w-full flex items-center gap-3 p-3 hover:bg-surface rounded-xl transition-colors text-ink active:scale-95">
            <div class="w-8 h-8 bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            </div>
            <span class="text-rbi-body font-bold">Переиндексировать и отправить</span>
        </button>`;
    }
    // Изменить (Только Узлы и только для автора)
    if (type === 'node' && isOwner && !id.startsWith('sys_')) {
        btnsHtml += `
        <button onclick="handleUasAction('${id}', '${type}', 'edit')" class="w-full flex items-center gap-3 p-3 hover:bg-surface rounded-xl transition-colors text-ink active:scale-95">
            <div class="w-8 h-8 bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"></path></svg>
            </div>
            <span class="text-rbi-body font-bold">Изменить</span>
        </button>`;
    }
    // Удаление (Только для автора, не системные)
    if (isOwner && !id.startsWith('sys_')) {
        btnsHtml += `
        <div class="border-t border-surface my-1"></div>
        <button onclick="handleUasAction('${id}', '${type}', 'delete')" class="w-full flex items-center gap-3 p-3 hover:bg-danger-soft rounded-xl transition-colors text-danger active:scale-95">
            <div class="w-8 h-8 bg-danger-soft text-danger dark:text-danger rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </div>
            <span class="text-rbi-body font-bold">Удалить</span>
        </button>`;
    }

    document.getElementById('uas-buttons').innerHTML = btnsHtml;
    sheet.style.display = 'flex';
    document.body.classList.add('modal-open');
    setTimeout(() => {
        sheet.classList.remove('opacity-0');
        sheet.querySelector('.transform').classList.remove('translate-y-full');
    }, 10);
};

window.closeUniversalActionSheet = function () {
    const sheet = document.getElementById('universal-action-sheet');
    sheet.classList.add('opacity-0');
    sheet.querySelector('.transform').classList.add('translate-y-full');
    setTimeout(() => {
        sheet.style.display = 'none';
        document.body.classList.remove('modal-open');
    }, 300);
};

window.handleUasAction = function (id, type, action) {
    closeUniversalActionSheet();
    setTimeout(() => {
        // --- ДЕЙСТВИЯ ПРАКТИК ---
        if (type === 'practice') {
            if (action === 'view') rbi_openPracticeViewer(id);
            if (action === 'pdf') rbi_printPracticePdf(id, 'script');
            if (action === 'print') rbi_printPracticePdf(id, 'browser');
            if (action === 'pptx' && typeof window.rbi_exportPracticePptx === 'function') window.rbi_exportPracticePptx(id);
            if (action === 'publish') rbi_publishPractice(id);
            if (action === 'edit') rbi_editPractice(id);
            if (action === 'delete') rbi_deletePractice(id);
        }
        // --- ДЕЙСТВИЯ ЭТАЛОНОВ ---
        if (type === 'etalon') {
            if (action === 'view') openEtalonViewer(id);
            if (action === 'pdf') printEtalonAct(id, 'script');
            if (action === 'word' && typeof window.rbi_exportEtalonDocx === 'function') window.rbi_exportEtalonDocx(id);
            if (action === 'edit') editEtalonAct(id);
            if (action === 'delete') deleteEtalonAct(id);
        }
        var _knowSvc4 = (_ctx && _ctx.knowledge) || window.RBI.services.knowledge;
        // --- ДЕЙСТВИЯ TWI ---
        if (type === 'twi') {
            if (action === 'view') _knowSvc4.openTwiViewer(id);
            if (action === 'delete') deleteTwiCard(id);
            // Добавим кнопку редактора
            if (action === 'publish') _knowSvc4.openTwiConstructor(id); // Используем слот publish для "Изменить"
        }
        // --- ДЕЙСТВИЯ УЗЛОВ ---
        if (type === 'node') {
            if (action === 'view') _knowSvc4.openNodeViewer(id);
            if (action === 'edit') _knowSvc4.openNodeConstructor(id);
            if (action === 'delete') deleteNode(id);
        }
        // --- ДЕЙСТВИЯ НД ---
        if (type === 'doc') {
            if (action === 'view') _knowSvc4.openDocViewer(id);
            if (action === 'edit') {
                if (typeof window.openEditCustomDoc === 'function') window.openEditCustomDoc(id);
                else if (typeof openEditCustomDoc === 'function') openEditCustomDoc(id);
            }
            if (action === 'delete') _knowSvc4.deleteCustomDoc(id);
            if (action === 'reindex') window.rbi_reindexCustomDoc(id);
        }
        // --- ДЕЙСТВИЯ FMEA ---
        if (type === 'fmea') {
            if (action === 'view') rbi_viewFmea(id);
            if (action === 'edit') rbi_loadFmeaToWorkspace(id);
            if (action === 'bind' && typeof rbi_openFmeaBindModal === 'function') rbi_openFmeaBindModal(id);
            if (action === 'pdf') rbi_printFmeaPdf(id, 'script');
            if (action === 'delete') rbi_deleteFmea(id);
        }
        // --- ДЕЙСТВИЯ СОВЕЩАНИЙ ---
        if (type === 'meeting') {
            if (action === 'view') rbi_openSavedMeeting(id);
            if (action === 'edit') rbi_openSavedMeeting(id); // Совещания редактируются в том же окне просмотра
            if (action === 'bind' && typeof rbi_openMeetingBindModal === 'function') rbi_openMeetingBindModal(id);
            if (action === 'pdf') rbi_printMeetingPdf(id, 'script');
            if (action === 'delete') rbi_deleteMeeting(id);
        }
        // --- ДЕЙСТВИЯ ОТЧЕТОВ ---
        if (type === 'report') {
            if (action === 'view') openReport(id);
            if (action === 'share') shareReport(id);
            if (action === 'delete') deleteReport(id);
        }
    }, 350);
};

// --- ОКНО ПРОСМОТРА ПРАКТИКИ ПО КЛИКУ НА КАРТОЧКУ ---
window.rbi_openPracticeViewer = async function (id) {
    const p = window.rbi_practicesData.find(x => x.id === id);
    if (!p) return;

    // Мульти-фото по этапам с fallback на legacy одиночные поля photoBefore/photoAfter
    const renderPracStageGallery = async (urls) => {
        if (!urls || urls.length === 0) return '';
        const imgs = await Promise.all(urls.map(async (url) => {
            const real = await PhotoManager.getAsyncUrl(url) || window.getPhotoSrc(url);
            return `<img src="${real}" class="w-full h-32 object-contain bg-surface rounded-lg border border-surface cursor-pointer" onclick="openPhotoViewer('${url}')">`;
        }));
        return `<div class="grid grid-cols-2 gap-1.5 mt-2">${imgs.join('')}</div>`;
    };

    const beforeUrls = (p.photosBefore && p.photosBefore.length > 0) ? p.photosBefore : (p.photoBefore ? [p.photoBefore] : []);
    const processUrls = p.photosProcess || [];
    const afterUrls = (p.photosAfter && p.photosAfter.length > 0) ? p.photosAfter : (p.photoAfter ? [p.photoAfter] : []);

    const imgBeforeHtml = await renderPracStageGallery(beforeUrls);
    const imgProcessHtml = await renderPracStageGallery(processUrls);
    const imgAfterHtml = await renderPracStageGallery(afterUrls);

    let docsHtml = '';
    if (p.docs && p.docs.length > 0) {
        docsHtml = `
        <div class="bg-surface/50 p-3 rounded-xl border border-surface mb-4">
            <div class="text-rbi-caption font-black text-muted uppercase tracking-widest mb-1.5 border-b border-surface pb-1">📄 Прикрепленные документы</div>
            ${p.docs.map(d => `<div class="text-rbi-label font-medium text-ink py-1"><a href="#" onclick="event.preventDefault(); openPhotoViewer('${d.url}')" class="text-brand underline">${d.name}</a>${d.desc ? ` — ${d.desc}` : ''}</div>`).join('')}
        </div>`;
    }

    const modal = document.getElementById('modal-overlay');
    document.getElementById('modal-icon').innerHTML = '';
    document.getElementById('modal-title').innerHTML = `
        <div class="flex justify-between items-center w-full">
            <span class="text-rbi-title uppercase font-black text-ink flex items-center gap-2">
                <svg class="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                Библиотека практик
            </span>
            <button onclick="closeModal()" class="text-muted hover:text-danger active:scale-90 px-2 text-lg">✕</button>
        </div>
    `;

    document.getElementById('modal-body').innerHTML = `
        <div class="text-center mb-4 border-b border-[var(--card-border)] pb-3">
            <div class="text-rbi-title font-black text-ink uppercase leading-tight mb-1">${p.title}</div>
            <div class="text-rbi-caption font-bold text-brand uppercase tracking-widest">${p.templateTitle}</div>
        </div>

        <div class="grid grid-cols-1 gap-3 mb-4">
            <div class="bg-surface/50 p-3 rounded-xl border border-surface">
                <div class="text-rbi-caption font-black text-muted uppercase tracking-widest mb-1.5 border-b border-surface pb-1 flex items-center gap-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> 
                    ${p.deltaUrk > 0 ? 'Суть проблемы (Было)' : 'Исходная ситуация'}
                </div>
                <div class="text-rbi-body font-medium text-ink leading-relaxed whitespace-pre-wrap">${p.problem}</div>
                ${imgBeforeHtml}
            </div>
            
            <div class="bg-surface/50 p-3 rounded-xl border border-surface">
                <div class="text-rbi-caption font-black text-muted uppercase tracking-widest mb-1.5 border-b border-surface pb-1 flex items-center gap-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> 
                    ${p.deltaUrk > 0 ? 'Принятое решение (Стало)' : 'Решение и результат'}
                </div>
                <div class="text-rbi-body font-medium text-ink leading-relaxed whitespace-pre-wrap">${p.solution}</div>
                ${imgAfterHtml}
            </div>
            ${processUrls.length > 0 ? `
            <div class="bg-surface/50 p-3 rounded-xl border border-surface">
                <div class="text-rbi-caption font-black text-muted uppercase tracking-widest mb-1.5 border-b border-surface pb-1">🔧 Процесс</div>
                ${imgProcessHtml}
            </div>` : ''}
        </div>
        ${docsHtml}
        <div class="grid grid-cols-3 gap-2 w-full">
            <button onclick="closeModal(); rbi_printPracticePdf('${p.id}', 'script')" class="bg-brand-soft text-brand border border-brand-soft py-3.5 rounded-xl font-black text-rbi-caption uppercase tracking-widest shadow-sm active:scale-95 transition-transform">
                PDF
            </button>
            <button onclick="closeModal(); rbi_printPracticePdf('${p.id}', 'browser')" class="bg-brand text-white py-3.5 rounded-xl font-black text-rbi-caption uppercase tracking-widest shadow-md active:scale-95 transition-transform">
                Печать
            </button>
            <button onclick="closeModal(); if(window.rbi_exportPracticePptx) rbi_exportPracticePptx('${p.id}')" class="bg-orange-50 text-orange-700 border border-orange-200 py-3.5 rounded-xl font-black text-rbi-caption uppercase tracking-widest shadow-sm active:scale-95 transition-transform">
                PPTX
            </button>
        </div>
    `;
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
};

// =========================================================================
// ДЕСКРИПТОР МОДУЛЯ (для будущего подключения через manifest)
// =========================================================================

export const InterventionsModule = {
    id: 'interventions',
    async init(ctx) { /* no-op for now */ },
    mount(container, ctx) { /* no-op for now */ },
    unmount() { /* no-op for now */ }
};
