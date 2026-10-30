/* Файл: js/modules/construction/features/defect-form.js */

// ============================================================================
// === УПРАВЛЕНИЕ ФОРМОЙ ДЕФЕКТА И ОТРИСОВКА БУЛАВОК НА ПЛАНАХ ===
// ============================================================================
// ============================================================================
// === УПРАВЛЕНИЕ ФОРМОЙ ДЕФЕКТА И ОТРИСОВКА БУЛАВОК НА ПЛАНАХ ===
// ============================================================================

var _ctx = null;
function bindCtx(ctx) {
    _ctx = ctx;
    bindDefectFormActionDelegation();
    bindDefectFormI18n();
}

function _objects() {
    try {
        if (_ctx && _ctx.services && _ctx.services.objects) return _ctx.services.objects;
        if (_ctx && _ctx.objects) return _ctx.objects;
    } catch (e) {}
    return (window.RBI && window.RBI.services && window.RBI.services.objects) || null;
}
function _contractors() {
    try {
        if (_ctx && _ctx.services && _ctx.services.contractors) return _ctx.services.contractors;
        if (_ctx && _ctx.contractors) return _ctx.contractors;
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
function _leftoverList() {
    var o = _objects();
    if (!o) return [];
    if (typeof o.leftoverList === 'function') {
        var l = o.leftoverList();
        return Array.isArray(l) ? l : [];
    }
    return Array.isArray(o.leftoverObjects) ? o.leftoverObjects : [];
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

function _defectStatusLabel(status) {
    var map = {
        issued: _t('construction.status.issued', 'Выдано'),
        in_progress: _t('construction.status.in_progress', 'В работе'),
        fixed: _t('construction.form.status_fixed', 'Устранено'),
        closed: _t('construction.status.closed', 'Закрыто'),
        rejected: _t('construction.status.rejected', 'Отклонено')
    };
    return map[status] || status;
}

function refreshDefectModalStaticLabels() {
    var modal = document.getElementById('const-defect-modal');
    if (!modal) return;
    var titleEl = document.getElementById('const-defect-modal-title');
    if (titleEl && !document.getElementById('const-defect-id').value) {
        titleEl.textContent = _t('construction.form.title_new', 'Новое замечание');
    }
    var setLabel = function (sel, key, fb) {
        var el = modal.querySelector(sel);
        if (el) el.textContent = _t(key, fb);
    };
    setLabel('label[for="const-defect-template"], div:has(#const-defect-template) > label', 'construction.form.label_work_type', 'Вид работ (Чек-лист) *');
    var labels = modal.querySelectorAll('label');
    labels.forEach(function (lbl) {
        var t = lbl.textContent.trim();
        if (t.indexOf('Вид работ') === 0 || t.indexOf('Work type') === 0) lbl.textContent = _t('construction.form.label_work_type', 'Вид работ (Чек-лист) *');
        else if (t.indexOf('Нарушение') === 0) lbl.textContent = _t('construction.form.label_violation', 'Нарушение *');
        else if (t === 'Категория' || t.indexOf('Category') === 0) lbl.textContent = _t('construction.form.label_category', 'Категория');
        else if (t.indexOf('Срок') === 0) lbl.textContent = _t('construction.form.label_deadline', 'Срок устранения');
        else if (t.indexOf('Ответственный') === 0) lbl.textContent = _t('construction.form.label_contractor', 'Ответственный подрядчик *');
        else if (t.indexOf('Уточняющее') === 0) lbl.textContent = _t('construction.form.label_description', 'Уточняющее описание');
        else if (t.indexOf('Фотофиксация') === 0) lbl.textContent = _t('construction.form.label_photo', 'Фотофиксация');
    });
    var searchInp = document.getElementById('const-defect-item-search');
    if (searchInp) searchInp.placeholder = _t('construction.form.placeholder_violation_search', 'Начните вводить нарушение...');
    var descInp = document.getElementById('const-defect-desc');
    if (descInp) descInp.placeholder = _t('construction.form.placeholder_description', 'Оси, размеры, детали...');
    var photoBtn = document.getElementById('const-defect-photo-btn');
    if (photoBtn && photoBtn.classList.contains('flex')) {
        var svg = photoBtn.querySelector('svg');
        photoBtn.innerHTML = (svg ? svg.outerHTML : '') + _t('construction.form.attach_photo', 'Прикрепить фото');
    }
    var normHdr = document.getElementById('const-defect-norm-block');
    if (normHdr) {
        var normTitle = normHdr.querySelector('.text-\\[9px\\]');
        if (normTitle) normTitle.textContent = _t('construction.form.norm_reference', 'Справочно (Норматив)');
        var helpBtn = document.getElementById('const-defect-btn-help');
        if (helpBtn) helpBtn.textContent = _t('construction.form.btn_help', 'Справка');
        var normBtn = document.getElementById('const-defect-btn-norm');
        if (normBtn) normBtn.textContent = _t('construction.form.btn_norm', 'Норматив');
    }
}

var _defectFormI18nBound = false;
function bindDefectFormI18n() {
    if (_defectFormI18nBound) return;
    _defectFormI18nBound = true;
    if (!(window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function')) return;
    window.RBI.events.on('i18n:localeChanged', function () {
        try {
            refreshDefectModalStaticLabels();
            var modal = document.getElementById('const-defect-modal');
            if (modal && modal.style.display === 'flex') {
                var id = document.getElementById('const-defect-id').value;
                var defect = id && window.ConstManager && window.ConstManager.defects.find(function (d) { return d.id === id; });
                if (defect && typeof window.ConstDefectForm.openExisting === 'function') {
                    window.ConstDefectForm.openExisting(id);
                }
            }
            if (window.ConstManager && window.ConstManager.currentFlrId && window.ConstDefectForm && typeof window.ConstDefectForm.renderAllPins === 'function') {
                window.ConstDefectForm.renderAllPins(
                    window.ConstManager.currentFlrId,
                    window.ConstManager.getPinFilters ? window.ConstManager.getPinFilters() : {}
                );
            }
        } catch (_e) { /* ignore */ }
    });
}

// Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
// (см. _ai/INDEX_HTML_HANDLERS_MAP.md), namespace-per-module (data-defect-form-action).
// Действия — методы window.ConstDefectForm, не bare window.*-функции.
function bindDefectFormActionDelegation() {
    if (window.__defectFormActionDelegationBound) return;
    window.__defectFormActionDelegationBound = true;

    var readArg = function (el, valType, evt) {
        switch (valType) {
            case 'event': return evt;
            case 'value': return el.value;
            case 'byId': {
                var refEl = document.getElementById(el.dataset.defectFormActionKey);
                return refEl ? refEl.value : undefined;
            }
            default: return undefined;
        }
    };

    var dispatch = function (el, evt) {
        var action = el.dataset.defectFormAction;
        var fn = window.ConstDefectForm && window.ConstDefectForm[action];
        if (typeof fn !== 'function') return;
        var valType = el.dataset.defectFormActionValType;
        var arg = valType ? readArg(el, valType, evt) : undefined;
        if (arg === undefined) {
            fn.call(window.ConstDefectForm);
        } else {
            fn.call(window.ConstDefectForm, arg);
        }
    };

    var resolveActionElement = function (target, wantsChange) {
        var el = target;
        while (el && el.nodeType === 1) {
            if (el.dataset && el.dataset.defectFormAction) {
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

function _isDemoMode() {
    if (_ctx && _ctx.appMode) return _ctx.appMode.isDemo();
    return window.RBI.services.appMode.isDemo();
}

function _triggerSync(mode) {
    var m = mode || 'silent';
    if (_ctx && _ctx.sync) return _ctx.sync.trigger(m);
    if (window.RBI && window.RBI.services && window.RBI.services.sync) return window.RBI.services.sync.trigger(m);
    if (typeof triggerSync === 'function') return triggerSync(m);
    return Promise.resolve(false);
}

function _storage() {
    if (_ctx && _ctx.storage) return _ctx.storage;
    if (window.RBI && window.RBI.services && window.RBI.services.storage) {
        return window.RBI.services.storage;
    }
    return {
        stores: function () { return typeof STORES !== 'undefined' ? STORES : {}; },
        get: function (store, key) { return dbGet(store, key); },
        getAll: function (store) { return dbGetAll(store); },
        put: function (store, data) { return dbPut(store, data); },
        delete: function (store, key) { return dbDelete(store, key); }
    };
}

function _getAllInspections() {
    if (_ctx && _ctx.inspections) return _ctx.inspections.getAllSync();
    return window.RBI.services.inspections.getAllSync();
}

function _templates() {
    if (_ctx && _ctx.templates) return _ctx.templates;
    return window.RBI.services.templates;
}

function _session() {
    if (_ctx && _ctx.session) return _ctx.session;
    return window.RBI.services.session;
}

function _permissions() {
    if (_ctx && _ctx.permissions) return _ctx.permissions;
    return window.RBI.services.permissions;
}

// =========================================================================
// РАЗМЕТКА МОДАЛКИ «const-defect-modal» (перенос из index.html:1486-1610,
// перенос 30 modal/overlay-блоков #app-modals в JS-рендер). HTML-строка 1:1
// идентична прежней статичной разметке.
// =========================================================================
(function mountConstDefectModalMarkup() {
    if (document.getElementById('const-defect-modal')) return;
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
        ? window.RBI.services.shell.getModalsRoot()
        : document.getElementById('app-modals');
    if (!root) return;
    root.insertAdjacentHTML('beforeend', `
    <div id="const-defect-modal"
        class="fixed inset-0 bg-slate-900/80 z-[10000] hidden items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm"
        data-defect-form-action="close">
        <div class="bg-[var(--card-bg)] w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl border border-[var(--card-border)] overflow-hidden flex flex-col max-h-[90vh]"
            onclick="event.stopPropagation()">

            <div
                class="p-4 border-b border-[var(--card-border)] bg-[var(--hover-bg)] flex justify-between items-center shrink-0">
                <h3 id="const-defect-modal-title"
                    class="font-black text-[13px] uppercase text-slate-800 dark:text-white flex items-center gap-2">
                    <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z">
                        </path>
                    </svg>
                    ${_t('construction.form.title_new', 'Новое замечание')}
                </h3>
                <button data-defect-form-action="close"
                    class="w-8 h-8 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 shadow-sm border border-slate-200 dark:border-slate-700 active:scale-90 font-black">✕</button>
            </div>

            <div class="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                <input type="hidden" id="const-defect-x">
                <input type="hidden" id="const-defect-y">
                <input type="hidden" id="const-defect-id">
                <input type="hidden" id="const-defect-item-name">

                <div>
                    <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">${_t('construction.form.label_work_type', 'Вид работ (Чек-лист) *')}</label>
                    <select id="const-defect-template" class="input-base text-[12px] font-bold"
                        data-defect-form-action="onTemplateChange" data-defect-form-action-val-type="value" data-action-event="change">
                        <!-- Список чек-листов загрузится из JS -->
                    </select>
                </div>

                <div class="relative">
                    <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">${_t('construction.form.label_violation', 'Нарушение *')}</label>
                    <!-- Видимое поле для поиска -->
                    <input type="text" id="const-defect-item-search" class="input-base text-[12px] leading-snug"
                        placeholder="${_t('construction.form.placeholder_violation_search', 'Начните вводить нарушение...')}" autocomplete="off"
                        oninput="window.ConstDefectForm.handleItemSearch(this.value)"
                        onfocus="window.ConstDefectForm.handleItemSearch(this.value)">
                    <!-- Скрытое поле для ID (чтобы не сломать логику сохранения) -->
                    <input type="hidden" id="const-defect-item">

                    <!-- Выпадающий список с результатами поиска -->
                    <div id="dd-const-defect-item"
                        class="absolute top-[48px] left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl z-[15000] hidden max-h-48 overflow-y-auto custom-scrollbar">
                    </div>
                </div>

                <div id="const-defect-norm-block"
                    class="hidden bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl shadow-inner">
                    <div class="text-[9px] font-black uppercase text-indigo-500 mb-1">${_t('construction.form.norm_reference', 'Справочно (Норматив)')}</div>
                    <div id="const-defect-norm-text" class="text-[10px] text-slate-600 dark:text-slate-400 font-medium">
                    </div>
                    <div class="flex gap-2 mt-2" id="const-defect-help-actions">
                        <button type="button" id="const-defect-btn-help"
                            class="flex-1 px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wide bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800"
                            onclick="window.ConstDefectForm.openItemHelp(event)">${_t('construction.form.btn_help', 'Справка')}</button>
                        <button type="button" id="const-defect-btn-norm"
                            class="flex-1 px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wide bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600"
                            onclick="window.ConstDefectForm.openNorm()">${_t('construction.form.btn_norm', 'Норматив')}</button>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label
                            class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">${_t('construction.form.label_category', 'Категория')}</label>
                        <select id="const-defect-category" class="input-base text-[11px] font-bold">
                            <option value="B1">${_t('construction.form.category_b1', 'B1 (Мелкий)')}</option>
                            <option value="B2" selected>${_t('construction.form.category_b2', 'B2 (Значимый)')}</option>
                            <option value="B3">${_t('construction.form.category_b3', 'B3 (Критика)')}</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">${_t('construction.form.label_deadline', 'Срок устранения')}</label>
                        <input type="date" id="const-defect-deadline" class="input-base !py-2 text-[11px]">
                    </div>
                </div>

                <div>
                    <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">${_t('construction.form.label_contractor', 'Ответственный подрядчик *')}</label>
                    <select id="const-defect-contractor" class="input-base text-[12px] font-bold"></select>
                </div>

                <div>
                    <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">${_t('construction.form.label_description', 'Уточняющее описание')}</label>
                    <textarea id="const-defect-desc" class="input-base h-16 resize-none text-[12px]"
                        placeholder="${_t('construction.form.placeholder_description', 'Оси, размеры, детали...')}"></textarea>
                </div>
                <!-- НОВОЕ: Блок фото -->
                <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <label
                        class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-2 block">${_t('construction.form.label_photo', 'Фотофиксация')}</label>
                    <button id="const-defect-photo-btn"
                        onclick="document.getElementById('const-defect-photo-input').click()"
                        class="w-full bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 py-4 rounded-xl text-[10px] font-bold uppercase active:scale-95 transition-colors flex flex-col items-center justify-center gap-2">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round"
                                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z">
                            </path>
                        </svg>
                        ${_t('construction.form.attach_photo', 'Прикрепить фото')}
                    </button>
                    <!-- Скрытый инпут для выбора файла -->
                    <input type="file" id="const-defect-photo-input" accept="image/*" class="hidden"
                        data-defect-form-action="handlePhotoUpload" data-defect-form-action-val-type="event" data-action-event="change">
                    <!-- Контейнер превью -->
                    <div id="const-defect-photo-preview"
                        class="hidden relative w-full h-40 mt-2 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm"
                        data-photo="">
                        <img id="const-defect-img" src="" class="w-full h-full object-cover cursor-pointer"
                            data-defect-form-action="openDefectPhoto" data-defect-form-action-val-type="byId" data-defect-form-action-key="const-defect-id">
                        <button data-defect-form-action="removePhoto"
                            class="absolute top-2 right-2 bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shadow-md active:scale-90">✕</button>
                    </div>
                </div>
            </div>

            <div class="p-3 border-t border-[var(--card-border)] bg-slate-50 dark:bg-slate-900/50 flex gap-2 shrink-0"
                id="const-defect-actions">
                <!-- Сюда JS вставит кнопки Сохранить или Удалить -->
            </div>
        </div>
    </div>
`);
}());

window.ConstDefectForm = {
    bindCtx: bindCtx,
    // --- Вспомогательная: получить плоский список пунктов из групп чек-листа ---
    getFlatItemsFromGroups(groups) {
        let items = [];
        groups.forEach(g => {
            if (g.items) items.push(...g.items);
        });
        return items;
    },

    // --- Заполнение выпадающих списков (чекс-листы и подрядчики) ---
    populateDropdowns() {
        // 1. Чек-листы
        const tmplSelect = document.getElementById('const-defect-template');
        let tmplHtml = '<option value="">' + _t('construction.form.select_work_type', '-- Выберите вид работ --') + '</option>';
        const _st = _templates().getSystemTemplates();
        Object.keys(_st).sort().forEach(k => {
            tmplHtml += `<option value="sys_${k}">[СИС] ${_st[k].title}</option>`;
        });
        const _ut = _templates().getUserTemplates();
        Object.keys(_ut).sort().forEach(k => {
            tmplHtml += `<option value="user_${k}">[МОЙ] ${_ut[k].title}</option>`;
        });
        tmplSelect.innerHTML = tmplHtml;

        // 2. Подрядчики (из справочника или истории)
        const contrSelect = document.getElementById('const-defect-contractor');
        let contrHtml = '<option value="">' + _t('construction.form.select_contractor', '-- Выберите подрядчика --') + '</option>';
        let uniqueContrs = [];
        var _contrList = _contractorList();
        if (_contrList.length > 0) {
            uniqueContrs = _contrList.map(c => c.display_name);
        } else {
            var _allInsp = _getAllInspections();
            if (_allInsp.length) {
                uniqueContrs = [...new Set(_allInsp.map(c => c.contractorName).filter(Boolean))];
            }
        }
        uniqueContrs.sort().forEach(c => {
            contrHtml += `<option value="${c.replace(/"/g, '&quot;')}">${c}</option>`;
        });
        contrSelect.innerHTML = contrHtml;
    },

    // --- Выбран чек-лист → подготавливаем базу для поиска ---
    onTemplateChange(tmplKey) {
        document.getElementById('const-defect-item').value = '';
        document.getElementById('const-defect-item-search').value = '';
        document.getElementById('const-defect-item-name').value = '';
        document.getElementById('const-defect-norm-block').classList.add('hidden');
        document.getElementById('dd-const-defect-item').classList.add('hidden');
    },

    // --- Умный поиск нарушений ---
    handleItemSearch(query) {
        const tmplKey = document.getElementById('const-defect-template').value;
        const dropdown = document.getElementById('dd-const-defect-item');

        if (!tmplKey) {
            dropdown.innerHTML = '<div class="p-3 text-[10px] text-slate-500 font-bold text-center">' + _t('construction.form.search_select_work_first', 'Сначала выберите вид работ выше') + '</div>';
            dropdown.classList.remove('hidden');
            return;
        }

        const type = tmplKey.split('_')[0];
        const key = tmplKey.replace(type + '_', '');
        let groups = [];
        if (type === 'sys' && _templates().getSystemTemplates()[key]) groups = _templates().getSystemTemplates()[key].groups;
        else if (type === 'user' && _templates().getUserTemplates()[key]) groups = _templates().getUserTemplates()[key].groups;

        const flatItems = this.getFlatItemsFromGroups(groups);

        // Фильтруем по тексту
        const q = query.toLowerCase().trim();
        const matched = flatItems.filter(i => i.n.toLowerCase().includes(q) || (i.t && i.t.toLowerCase().includes(q)));

        if (matched.length === 0) {
            dropdown.innerHTML = '<div class="p-3 text-[10px] text-slate-500 font-bold text-center">' + _t('construction.form.search_nothing_found', 'Ничего не найдено') + '</div>';
            dropdown.classList.remove('hidden');
            return;
        }

        // Рендерим результаты
        dropdown.innerHTML = matched.map(i => {
            const safeNorm = (i.t || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            const safeName = i.n.replace(/"/g, '&quot;').replace(/'/g, "\\'");
            return `
                <div class="p-2 border-b border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                     onmousedown="window.ConstDefectForm.selectItem('${i.id}', '${safeName}', ${i.w}, '${safeNorm}')">
                    <div class="text-[11px] font-bold text-slate-800 dark:text-white leading-tight">
                        <span class="text-[9px] font-black text-white bg-slate-400 px-1 rounded mr-1">B${i.w}</span>${i.n}
                    </div>
                </div>
            `;
        }).join('');

        dropdown.classList.remove('hidden');
    },

    // --- Обработка клика по найденному пункту ---
    selectItem(id, name, weight, norm) {
        document.getElementById('const-defect-item-search').value = name;
        document.getElementById('const-defect-item-name').value = name;
        document.getElementById('const-defect-item').value = id;
        document.getElementById('dd-const-defect-item').classList.add('hidden');

        // Показываем норматив (очищенный от HTML для текстового поля)
        let cleanNorm = norm ? norm.replace(/<\/?[^>]+(>|$)/g, "").replace(/<br>/g, " ") : "";
        const normBlock = document.getElementById('const-defect-norm-block');

        if (norm && norm.trim()) {
            document.getElementById('const-defect-norm-text').innerHTML = norm;
        } else {
            document.getElementById('const-defect-norm-text').innerHTML = '';
        }
        // Блок оставляем видимым при выбранном пункте — кнопки Справка/Норматив
        normBlock.classList.remove('hidden');

        // Авто-формирование текста замечания (Нарушение + Норматив)
        let autoText = _t('construction.form.violation_prefix', 'Нарушение: {name}.', { name: name });
        const noNorm = _t('construction.form.no_norm', 'Без норматива');
        if (cleanNorm && cleanNorm !== noNorm) {
            autoText += _t('construction.form.requirements_prefix', ' Требования: {norm}', { norm: cleanNorm });
        }
        document.getElementById('const-defect-desc').value = autoText;

        // Автокатегория (Блокируем от ручного изменения)
        const catSelect = document.getElementById('const-defect-category');
        if (weight === 1) catSelect.value = 'B1';
        else if (weight === 2) catSelect.value = 'B2';
        else if (weight === 3) catSelect.value = 'B3';

        catSelect.setAttribute('disabled', 'true');
        catSelect.classList.add('opacity-60', 'cursor-not-allowed');
    },

    openItemHelp(event) {
        const itemId = (document.getElementById('const-defect-item') || {}).value || '';
        const toastFn = window['showToast'];
        if (!itemId) {
            if (typeof toastFn === 'function') {
                toastFn(_t('construction.form.toast_select_item_help', 'Выберите пункт чек-листа'));
            }
            return;
        }
        const tmplKey = (document.getElementById('const-defect-template') || {}).value || '';
        const type = tmplKey.split('_')[0];
        const key = tmplKey.replace(type + '_', '');
        let groups = [];
        if (type === 'sys' && _templates().getSystemTemplates()[key]) groups = _templates().getSystemTemplates()[key].groups || [];
        else if (type === 'user' && _templates().getUserTemplates()[key]) groups = _templates().getUserTemplates()[key].groups || [];
        const helpCtx = { templateKey: tmplKey || undefined, checklist: groups };
        const svc = window.RBI && window.RBI.services && window.RBI.services.knowledge;
        if (svc && typeof svc.openItemHelp === 'function') {
            svc.openItemHelp(itemId, event, helpCtx);
            return;
        }
        const openMenu = window['openItemHelpMenu'];
        if (typeof openMenu === 'function') {
            openMenu(itemId, event, helpCtx);
            return;
        }
        if (typeof toastFn === 'function') {
            toastFn(_t('construction.v2.acc.knowledge_unavailable', 'База знаний недоступна'));
        }
    },

    openNorm() {
        const tmplKey = (document.getElementById('const-defect-template') || {}).value || '';
        const itemId = (document.getElementById('const-defect-item') || {}).value || '';
        const normEl = document.getElementById('const-defect-norm-text');
        const normText = normEl ? (normEl.textContent || '').trim() : '';
        const type = tmplKey.split('_')[0];
        const key = tmplKey.replace(type + '_', '');
        let groups = [];
        if (type === 'sys' && _templates().getSystemTemplates()[key]) groups = _templates().getSystemTemplates()[key].groups || [];
        else if (type === 'user' && _templates().getUserTemplates()[key]) groups = _templates().getUserTemplates()[key].groups || [];
        const flat = this.getFlatItemsFromGroups(groups);
        const item = flat.find(function (i) { return String(i.id) === String(itemId); });
        const ndId = item && item.ndId ? String(item.ndId) : '';
        const svc = window.RBI && window.RBI.services && window.RBI.services.knowledge;
        const toastFn = window['showToast'];
        if (ndId && svc && typeof svc.openDocViewer === 'function') {
            svc.openDocViewer(ndId);
            return;
        }
        if (!normText) {
            if (typeof toastFn === 'function') {
                toastFn(_t('construction.form.toast_no_norm', 'Норматив не указан'));
            }
            return;
        }
        if (svc && typeof svc.findAndOpenND === 'function') {
            svc.findAndOpenND(normText);
            return;
        }
        const findNd = window['findAndOpenND'];
        if (typeof findNd === 'function') {
            findNd(normText);
            return;
        }
        if (typeof toastFn === 'function') {
            toastFn(_t('construction.v2.acc.knowledge_unavailable', 'База знаний недоступна'));
        }
    },

    // --- Открыть форму для нового дефекта ---
    openNew(xPercent, yPercent) {
        // Генерируем постоянный ID для нового дефекта
        const newId = 'def_' + window.RbiIds.newId();

        this.populateDropdowns();

        document.getElementById('const-defect-id').value = newId;
        document.getElementById('const-defect-x').value = xPercent;
        document.getElementById('const-defect-y').value = yPercent;
        document.getElementById('const-defect-template').value = '';
        document.getElementById('const-defect-item').innerHTML = '<option value="">' + _t('construction.form.select_work_first', 'Сначала выберите вид работ') + '</option>';
        document.getElementById('const-defect-item-name').value = '';
        document.getElementById('const-defect-norm-block').classList.add('hidden');
        document.getElementById('const-defect-category').value = 'B2';
        // Ставим срок по умолчанию: +14 дней от сегодня
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 14);
        document.getElementById('const-defect-deadline').value = futureDate.toISOString().split('T')[0];
        document.getElementById('const-defect-contractor').value = '';
        document.getElementById('const-defect-desc').value = '';

        // Очищаем превью фото
        this.removePhoto();

        document.getElementById('const-defect-modal-title').innerText = _t('construction.form.title_new', 'Новое замечание');
        document.getElementById('const-defect-actions').innerHTML = `
            <button onclick="window.ConstDefectForm.close()" class="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl text-[11px] font-bold uppercase active:scale-95 border border-slate-200">${_t('construction.form.btn_cancel', 'Отмена')}</button>
            <button onclick="window.ConstDefectForm.save()" class="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-[11px] font-black uppercase shadow-md active:scale-95">${_t('construction.form.btn_save', '💾 Сохранить')}</button>
        `;

        document.getElementById('const-defect-modal').style.display = 'flex';
    },

    // --- Открыть форму для редактирования существующего дефекта ---
    async openExisting(id) {
        const defect = window.ConstManager.defects.find(d => d.id === id);
        if (!defect) return;

        this.populateDropdowns();

        document.getElementById('const-defect-id').value = defect.id;
        document.getElementById('const-defect-x').value = defect.x;
        document.getElementById('const-defect-y').value = defect.y;
        document.getElementById('const-defect-template').value = defect.templateKey || '';
        // После выбора чек-листа нужно подгрузить пункты
        this.onTemplateChange(defect.templateKey);
        // Небольшая задержка, чтобы пункты успели отрисоваться
        setTimeout(() => {
            document.getElementById('const-defect-item').value = defect.itemId || '';
            document.getElementById('const-defect-item-search').value = defect.itemName || '';

            // Восстанавливаем блок норматива (+ кнопки справки при выбранном пункте)
            const normBlock = document.getElementById('const-defect-norm-block');
            if (defect.normText && defect.normText.trim()) {
                document.getElementById('const-defect-norm-text').innerHTML = defect.normText;
                normBlock.classList.remove('hidden');
            } else if (defect.itemId) {
                document.getElementById('const-defect-norm-text').innerHTML = '';
                normBlock.classList.remove('hidden');
            } else {
                normBlock.classList.add('hidden');
            }
        }, 50);
        document.getElementById('const-defect-item-name').value = defect.itemName || '';
        document.getElementById('const-defect-category').value = defect.category || 'B2';
        document.getElementById('const-defect-deadline').value = defect.deadline || '';
        document.getElementById('const-defect-contractor').value = defect.contractor || '';
        document.getElementById('const-defect-desc').value = defect.description || '';

        // Загружаем фото: сначала из памяти осмотра, иначе из сохранённого дефекта
        const defectPhoto = _session().getPhotoRaw(defect.id) || defect.photo || null;
        if (defectPhoto) {
            _session().setPhotoRaw(defect.id, defectPhoto);
            if (typeof updateConstDefectPhotoPreview === 'function') {
                await updateConstDefectPhotoPreview(defect.id);
            }
        } else {
            this.removePhoto(); // если фото нет – очищаем превью
        }
        document.getElementById('const-defect-modal-title').innerText = _t('construction.form.title_edit', 'Редактирование замечания');
        // --- НОВАЯ ЛОГИКА СТАТУСОВ И КНОПОК ПО РОЛЯМ ---
        const role = _permissions() ? _permissions().getCurrentRole() : 'guest';
        const isEngineer = _permissions() ? _permissions().isEngineerOrAdmin() : ['engineer', 'manager', 'deputy_manager'].includes(role);
        const isContractor = role === 'contractor';
        const btnDeleteTitle = _t('construction.form.btn_delete_title', 'Удалить');
        const btnCopyTitle = _t('construction.form.btn_copy_title', 'Копировать');

        // Гарантируем, что статус есть
        if (!defect.status) defect.status = 'issued';

        let actionBtns = '';

        if (defect.status === 'issued') {
            if (isContractor) {
                actionBtns = `
                    <button onclick="window.ConstDefectForm.changeStatus('${defect.id}', 'in_progress')" class="flex-1 bg-blue-50 text-blue-600 border border-blue-200 py-3 rounded-xl text-[11px] font-bold uppercase active:scale-95">${_t('construction.form.btn_in_progress', 'В работу')}</button>
                    <button onclick="window.ConstDefectForm.changeStatus('${defect.id}', 'fixed')" class="flex-[1.5] bg-green-600 text-white py-3 rounded-xl text-[11px] font-black uppercase shadow-md active:scale-95">${_t('construction.form.btn_fixed', 'Устранено (Фото)')}</button>
                `;
            } else if (isEngineer) {
                actionBtns = `
                    <button onclick="window.ConstDefectForm.delete('${defect.id}')" class="bg-red-50 text-red-600 py-3 px-3 rounded-xl text-[11px] font-bold uppercase active:scale-95 border border-red-200" title="${btnDeleteTitle}">🗑️</button>
                    <button onclick="window.ConstDefectForm.duplicate('${defect.id}')" class="bg-blue-50 text-blue-600 py-3 px-3 rounded-xl text-[11px] font-bold uppercase active:scale-95 border border-blue-200" title="${btnCopyTitle}">📋</button>
                    <button onclick="window.ConstDefectForm.save()" class="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-[11px] font-black uppercase shadow-md active:scale-95">${_t('construction.form.btn_update', '💾 Обновить')}</button>
                `;
            }
        } else if (defect.status === 'in_progress') {
            if (isContractor) {
                actionBtns = `<button onclick="window.ConstDefectForm.changeStatus('${defect.id}', 'fixed')" class="w-full bg-green-600 text-white py-3 rounded-xl text-[11px] font-black uppercase shadow-md active:scale-95">${_t('construction.form.btn_fixed_attach', 'Устранено (Приложить фото)')}</button>`;
            } else {
                actionBtns = `<div class="text-center w-full text-[11px] font-bold text-blue-500 py-3">${_t('construction.form.msg_contractor_in_progress', 'Подрядчик взял в работу')}</div>`;
            }
        } else if (defect.status === 'fixed') {
            if (isEngineer) {
                actionBtns = `
                    <button onclick="window.ConstDefectForm.changeStatus('${defect.id}', 'rejected')" class="flex-1 bg-red-50 text-red-600 border border-red-200 py-3 rounded-xl text-[11px] font-bold uppercase active:scale-95">${_t('construction.form.btn_reject', '❌ Отклонить')}</button>
                    <button onclick="window.ConstDefectForm.changeStatus('${defect.id}', 'closed')" class="flex-1 bg-green-600 text-white py-3 rounded-xl text-[11px] font-black uppercase shadow-md active:scale-95">${_t('construction.form.btn_accept_close', '✅ Принять (Закрыть)')}</button>
                 `;
            } else {
                actionBtns = `<div class="text-center w-full text-[11px] font-bold text-green-500 py-3">${_t('construction.form.msg_awaiting_engineer', 'Ожидает проверки Инженером СК')}</div>`;
            }
        } else if (defect.status === 'closed') {
            actionBtns = `<div class="text-center w-full text-[11px] font-black text-green-600 py-3">${_t('construction.form.msg_defect_closed', 'Дефект закрыт')}</div>`;
        } else if (defect.status === 'rejected') {
            if (isContractor) {
                actionBtns = `<button onclick="window.ConstDefectForm.changeStatus('${defect.id}', 'fixed')" class="w-full bg-orange-500 text-white py-3 rounded-xl text-[11px] font-black uppercase shadow-md active:scale-95">${_t('construction.form.btn_resubmit', 'Повторно предъявить (Фото)')}</button>`;
            } else if (isEngineer) {
                actionBtns = `
                    <button onclick="window.ConstDefectForm.save()" class="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-[11px] font-black uppercase shadow-md active:scale-95">${_t('construction.form.btn_update', '💾 Обновить')}</button>
                 `;
            }
        }

        // Рендер истории статусов
        let historyHtml = '';
        if (defect.history && defect.history.length > 0) {
            historyHtml = `<div class="w-full mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex flex-col gap-2 max-h-32 overflow-y-auto custom-scrollbar">`;
            [...defect.history].reverse().forEach(h => {
                const stName = _defectStatusLabel(h.status);
                const dDate = new Date(h.date).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

                let histPhoto = '';
                if (h.photo) {
                    histPhoto = `<img ${(typeof window['rbiBuildPhotoImgAttrs'] === 'function') ? window.rbiBuildPhotoImgAttrs(h.photo, { preferThumb: true }) : ('src="' + (window.getPhotoThumbSrc || window.getPhotoSrc)(h.photo) + '"')} class="w-10 h-10 object-cover rounded border cursor-pointer mt-1" loading="lazy" onclick="openPhotoViewer('${h.photo}')">`;
                }

                historyHtml += `
                    <div class="bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800 text-[10px]">
                        <div class="flex justify-between font-bold mb-1"><span class="text-indigo-600">${stName}</span><span class="text-slate-400">${dDate}</span></div>
                        <div class="text-slate-600 dark:text-slate-300">${h.user} ${h.comment ? `— <i>${h.comment}</i>` : ''}</div>
                        ${histPhoto}
                    </div>
                `;
            });
            historyHtml += `</div>`;
        }

        document.getElementById('const-defect-actions').innerHTML = actionBtns;

        // Вставляем историю прямо над кнопками
        const actionsContainer = document.getElementById('const-defect-actions');
        const existingHistory = document.getElementById('const-defect-history');
        if (existingHistory) existingHistory.remove();

        if (historyHtml) {
            const histDiv = document.createElement('div');
            histDiv.id = 'const-defect-history';
            histDiv.className = 'w-full px-4 pb-2 bg-[var(--card-bg)]';
            histDiv.innerHTML = historyHtml;
            actionsContainer.parentNode.insertBefore(histDiv, actionsContainer);
        }

        document.getElementById('const-defect-modal').style.display = 'flex';
    },

    // --- Закрыть форму ---
    close() {
        document.getElementById('const-defect-modal').style.display = 'none';
        const tempPin = document.getElementById('temp-pin');
        if (tempPin) tempPin.remove();
    },

    async changeStatus(id, newStatus) {
        const defect = window.ConstManager.defects.find(d => d.id === id);
        if (!defect) return;

        const userName = window.syncConfig?.engineerName || 'Пользователь';
        let comment = '';

        // Инженер отклоняет
        if (newStatus === 'rejected') {
            comment = prompt(_t('construction.form.prompt_reject_reason', 'Укажите причину отклонения:'));
            if (!comment) return showToast(_t('construction.form.toast_reject_need_comment', '⚠️ Для отклонения нужен комментарий!'));
        }

        // Подрядчик устраняет (Требуется фото!)
        if (newStatus === 'fixed') {
            comment = prompt(_t('construction.form.prompt_fix_comment', 'Краткий комментарий об устранении:'));
            if (comment === null) return;

            // Настраиваем фоторедактор специально для "устранения"
            window.activePhotoContext = 'defect_fix';
            window.currentDefectFixId = id;
            window.currentDefectFixComment = comment;

            // Вызываем окно добавления фото
            document.getElementById('photo-source-modal').style.display = 'flex';
            return; // Прерываем функцию, она продолжится автоматически после рисования на фото
        }

        this.applyStatusChange(defect, newStatus, userName, comment, null);
    },

    async applyStatusChange(defect, newStatus, userName, comment, photoUrl) {
        defect.status = newStatus;
        if (!defect.history) defect.history = [];

        // Добавляем запись в историю
        defect.history.push({
            status: newStatus,
            date: new Date().toISOString(),
            user: userName,
            comment: comment,
            photo: photoUrl
        });

        defect.updated_at = new Date().toISOString();

        await _storage().put(_storage().stores().CONST_DEFECTS, defect);

        localStorage.setItem('rbi_cloud_dirty', '1');
        _triggerSync('silent');

        showToast(_t('construction.form.toast_status_updated', '✅ Статус обновлен!'));
        this.openExisting(defect.id); // Перерисовываем модалку, чтобы показать новые кнопки

        // Обновляем булавки на плане (чтобы сменить цвет)
        if (window.ConstManager.currentView === 'plan') {
            window.ConstDefectForm.renderAllPins(
                window.ConstManager.currentFlrId,
                window.ConstManager.getPinFilters ? window.ConstManager.getPinFilters() : {}
            );
        } else {
            window.ConstManager.renderDefectsList();
        }
    },

    openDefectPhoto(defectId) {
        const defect = window.ConstManager.defects.find(d => d.id === defectId);
        const src = _session().getPhotoRaw(defectId) || defect?.photo;
        if (src && typeof openPhotoViewer === 'function') {
            openPhotoViewer(src);
        }
    },

    // --- Сохранить дефект (новый или обновление) ---
    async save() {
        const id = document.getElementById('const-defect-id').value;
        const x = parseFloat(document.getElementById('const-defect-x').value);
        const y = parseFloat(document.getElementById('const-defect-y').value);
        const floorId = window.ConstManager.currentFlrId;
        const templateKey = document.getElementById('const-defect-template').value;
        const itemId = document.getElementById('const-defect-item').value;
        const itemName = document.getElementById('const-defect-item-name').value;
        const normText = document.getElementById('const-defect-norm-text').innerHTML;
        const category = document.getElementById('const-defect-category').value;
        const deadline = document.getElementById('const-defect-deadline').value;
        const contractor = document.getElementById('const-defect-contractor').value;
        const description = document.getElementById('const-defect-desc').value.trim();

        // Убираем старую подсветку
        ['const-defect-template', 'const-defect-item-search', 'const-defect-contractor'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('border-red-500', 'bg-red-50');
        });

        // Проверяем и подсвечиваем пустые обязательные поля
        let hasError = false;
        if (!templateKey) {
            document.getElementById('const-defect-template').classList.add('border-red-500', 'bg-red-50');
            hasError = true;
        }
        if (!itemId) {
            document.getElementById('const-defect-item-search').classList.add('border-red-500', 'bg-red-50');
            hasError = true;
        }
        if (!contractor) {
            document.getElementById('const-defect-contractor').classList.add('border-red-500', 'bg-red-50');
            hasError = true;
        }

        if (hasError) {
            return showToast(_t('construction.form.toast_fill_required', '⚠️ Заполните все поля, выделенные красным!'));
        }

        // Получаем фото из глобального хранилища
        let photo = _session().getPhotoRaw(id) || null;

        // Если фото нет, но есть временный ключ (перенос из temp, если использовался)
        if (!photo && window.tempDefectPhotoKey && _session().getPhotoRaw(window.tempDefectPhotoKey)) {
            photo = _session().getPhotoRaw(window.tempDefectPhotoKey);
            _session().setPhotoRaw(id, photo);
            _session().deletePhotoRaw(window.tempDefectPhotoKey);
            window.tempDefectPhotoKey = null;
        }

        if (photo && String(photo).startsWith('data:') && typeof window['ensureLocalPhotoRef'] === 'function') {
            photo = await window.ensureLocalPhotoRef(photo, 'const', {
                entityType: 'construction_defect',
                entityId: id
            });
            _session().setPhotoRaw(id, photo);
        }

        const now = new Date().toISOString();
        const existingIndex = window.ConstManager.defects.findIndex(d => d.id === id);
        const prevDefect = existingIndex !== -1 ? window.ConstManager.defects[existingIndex] : null;

        let contractorId = '';
        const contractorsSvc = _contractors();
        if (contractorsSvc && typeof contractorsSvc.resolveIdFromNormalized === 'function') {
            contractorId = contractorsSvc.resolveIdFromNormalized({
                display_name: contractor,
                contractor_name: contractor
            }) || '';
        }

        const defectData = {
            id: id,
            floorId: floorId,
            x: x,
            y: y,
            templateKey: templateKey,
            itemId: itemId,
            itemName: itemName,
            normText: normText,
            text: itemName,
            category: category,
            deadline: deadline,
            contractor: contractor,
            contractorId: contractorId,
            description: description,
            photo: photo,
            status: prevDefect?.status || 'issued',
            created_at: prevDefect?.created_at || now,
            updated_at: now,
            created_by: prevDefect?.created_by || window.syncConfig?.engineerName || 'Инженер'
        };

        if (existingIndex !== -1) {
            window.ConstManager.defects[existingIndex] = { ...window.ConstManager.defects[existingIndex], ...defectData };
        } else {
            window.ConstManager.defects.push(defectData);
        }

        if (photo) {
            _session().setPhotoRaw(id, photo);
        }

        if (_storage().stores().CONST_DEFECTS) {
            try {
                await _storage().put(_storage().stores().CONST_DEFECTS, defectData);
            } catch (e) {
                console.warn('Ошибка сохранения дефекта', e);
                showToast(_t('construction.form.toast_not_saved', '⚠️ Замечание не сохранено в память устройства'));
                return;
            }
        }
        // ОЧЕРЕДЬ
        if (window.SyncQueueManager && !_isDemoMode()) {
            window.SyncQueueManager.enqueue('SAVE_CONST_DEFECT', defectData);
        }
        this.close();
        showToast(_t('construction.form.toast_saved', '✅ Замечание сохранено на плане!'));
        
        // Безопасно получаем текущий масштаб, если открыт интерактивный план
        let currentScale = 1;
        if (window.UniversalPdfViewer && window.UniversalPdfViewer.panzoomInstance) {
            currentScale = window.UniversalPdfViewer.panzoomInstance.getScale();
        }

        // Перерисовываем точки с правильным масштабом
        this.renderAllPins(
            floorId,
            window.ConstManager.getPinFilters ? window.ConstManager.getPinFilters() : {},
            currentScale
        );
        
        // Если был открыт реестр (хотя мы ставим точки на плане, но вдруг)
        if (window.ConstManager.currentView === 'list') {
            window.ConstManager.renderDefectsList();
        }
    },

    // --- Удалить дефект ---
    delete(id) {
        if (!confirm(_t('construction.form.confirm_delete_from_plan', 'Удалить это замечание с плана?'))) return;
        window.ConstManager.defects = window.ConstManager.defects.filter(d => d.id !== id);
        if (_storage().stores().CONST_DEFECTS) {
            _storage().delete(_storage().stores().CONST_DEFECTS, id).catch(e => console.warn('Ошибка удаления дефекта', e));
        }
        this.close();
        this.renderAllPins(window.ConstManager.currentFlrId);
        showToast(_t('construction.form.toast_deleted', '🗑️ Замечание удалено'));
    },
    // --- Копировать (дублировать) дефект ---
    // --- Массовое копирование (Штамп) ---
    duplicate(id) {
        const orig = window.ConstManager.defects.find(d => d.id === id);
        if (!orig) return;

        this.close(); // Закрываем модалку дефекта
        showToast(_t('construction.form.toast_stamp_mode', '📋 Режим штампа. Кликайте по чертежу, чтобы расставить копии.'));

        // Передаем данные оригинала в просмотрщик PDF и включаем режим копирования
        window.UniversalPdfViewer.setCopyMode(true, orig);
    },

    // --- Отрисовать все булавки на текущем плане с учётом фильтров ---
    renderAllPins(floorId, filters = {}, currentScale = 1, highlightDefectId = null) {
        if (!floorId) return;
        const floorKey = String(floorId);
        
        // 1. Сначала скрываем ВСЕ нарисованные зоны приемок (если они были)
        document.querySelectorAll('.zone-marker-layer').forEach(el => el.remove());

        // 2. Получаем текущий слой из Менеджера
        const layer = window.ConstManager.currentLayer || 'ALL';

        let defects = [];

        // 3. Логика слоев для ДЕФЕКТОВ
        if (layer === 'ZONES') {
            // Если выбран слой зон приемки, дефекты СМР мы вообще не показываем!
            defects = []; 
        } else {
            // Берем дефекты этажа (строгое сравнение id как строк)
            defects = (window.ConstManager.defects || []).filter(d =>
                d && !d._deleted && String(d.floorId || '') === floorKey
            );

            // Фильтр по слою ОТ и ПБ (Ищем ключевые слова в названии чеклиста)
            if (layer === 'OT') {
                defects = defects.filter(d => {
                    const tName = d.templateKey ? (_templates().getSystemTemplates()[d.templateKey.replace('sys_', '')]?.title || _templates().getUserTemplates()[d.templateKey.replace('user_', '')]?.title || '') : '';
                    return tName.toLowerCase().includes('охран') || tName.toLowerCase().includes('безопас') || tName.toLowerCase().includes('тб');
                });
            } else if (layer === 'SMR') {
                // Если СМР, убираем Охрану труда
                defects = defects.filter(d => {
                    const tName = d.templateKey ? (_templates().getSystemTemplates()[d.templateKey.replace('sys_', '')]?.title || _templates().getUserTemplates()[d.templateKey.replace('user_', '')]?.title || '') : '';
                    return !(tName.toLowerCase().includes('охран') || tName.toLowerCase().includes('безопас') || tName.toLowerCase().includes('тб'));
                });
            }

            // Умные фильтры по массиву статусов (из чипсов)
            // Поддержка legacy-ключа filters.status (строка)
            let statusList = null;
            if (Array.isArray(filters.statuses) && filters.statuses.length > 0) {
                statusList = filters.statuses;
            } else if (filters.status && filters.status !== 'ALL') {
                statusList = [filters.status];
            }
            if (statusList) {
                defects = defects.filter(d => statusList.includes(d.status));
            }
            if (filters.category && filters.category !== 'ALL') {
                defects = defects.filter(d => d.category === filters.category);
            }
        }

        // Координаты: без валидных x/y булавку некуда ставить — ставим в центр, чтобы не «терять» дефект
        defects = defects.map(d => {
            const x = Number(d.x);
            const y = Number(d.y);
            if (Number.isFinite(x) && Number.isFinite(y)) {
                return { ...d, x, y };
            }
            return { ...d, x: 50, y: 50 };
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // --- АЛГОРИТМ КЛАСТЕРИЗАЦИИ (ГРУППИРОВКИ) ---

        // --- АЛГОРИТМ КЛАСТЕРИЗАЦИИ (ГРУППИРОВКИ) ---
        // Чем больше зум (currentScale), тем меньше радиус захвата
        const threshold = 4 / currentScale;

        let clusters = [];
        let unclustered = [...defects];
        let originalIndexes = new Map();
        defects.forEach((d, i) => originalIndexes.set(d.id, i + 1));

        while (unclustered.length > 0) {
            let base = unclustered.shift();
            let currentCluster = [base];
            let i = 0;
            
            while (i < unclustered.length) {
                let p = unclustered[i];
                let dist = Math.sqrt(Math.pow(base.x - p.x, 2) + Math.pow(base.y - p.y, 2));
                
                if (dist < threshold) {
                    currentCluster.push(p);
                    unclustered.splice(i, 1);
                } else {
                    i++;
                }
            }
            clusters.push(currentCluster);
        }

        const pinsHtml = clusters.map(cluster => {
            if (cluster.length === 1) {
                const d = cluster[0];
                const indexNum = originalIndexes.get(d.id);

                let bgColor = 'bg-blue-500';  
                if (d.category === 'B2') bgColor = 'bg-orange-500';
                if (d.category === 'B3') bgColor = 'bg-red-600';
                if (d.status === 'closed') bgColor = 'bg-green-500';

                let overdueClass = '';
                if (d.deadline && d.status !== 'closed' && d.status !== 'fixed') {
                    const dl = new Date(d.deadline);
                    dl.setHours(0, 0, 0, 0);
                    if (dl < today) overdueClass = 'ring-4 ring-red-500/80 animate-pulse';
                }
                // Если мы искали именно эту точку с Реестра - делаем её ОГРОМНОЙ и пульсирующей
                if (highlightDefectId === d.id) {
                    return `
                    <div class="absolute z-50 pointer-events-auto" style="left: ${d.x}%; top: ${d.y}%; transform: translate(-50%, -50%);">
                        <!-- Эффект радара (синие расходящиеся круги) -->
                        <div class="absolute inset-0 bg-indigo-500 rounded-full animate-ping opacity-75"></div>
                        <!-- Сама увеличенная кнопка с жирной синей рамкой -->
                        <div onclick="window.ConstDefectForm.openExisting('${d.id}')" 
                             class="relative w-10 h-10 rounded-full border-4 border-indigo-600 shadow-[0_0_20px_rgba(79,70,229,0.8)] flex items-center justify-center text-white text-[16px] font-black cursor-pointer bg-indigo-500" 
                             title="${d.itemName} (${d.category})">
                            ${indexNum}
                        </div>
                    </div>`;
                }

                return `
                <div onclick="window.ConstDefectForm.openExisting('${d.id}')" 
                     class="absolute w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-white text-[10px] font-black z-20 pointer-events-auto ${bgColor} ${overdueClass}" 
                     style="left: ${d.x}%; top: ${d.y}%; transform: translate(-50%, -50%); cursor: pointer; transition: transform 150ms ease;"
                     onpointerenter="this.style.transform='translate(-50%,-50%) scale(1.15)'"
                     onpointerleave="this.style.transform='translate(-50%,-50%)'"
                     title="${d.itemName} (${d.category})">
                    ${indexNum}
                </div>`;

                
            } else {
                const total = cluster.length;
                const avgX = cluster.reduce((sum, p) => sum + p.x, 0) / total;
                const avgY = cluster.reduce((sum, p) => sum + p.y, 0) / total;

                let red = 0, orange = 0, blue = 0, green = 0;
                cluster.forEach(d => {
                    if (d.status === 'closed') green++;
                    else if (d.category === 'B3') red++;
                    else if (d.category === 'B2') orange++;
                    else blue++;
                });

                const cRed = (red / total) * 360;
                const cOrange = cRed + (orange / total) * 360;
                const cBlue = cOrange + (blue / total) * 360;
                const cGreen = cBlue + (green / total) * 360;

                const grad = `conic-gradient(from 0deg, #ef4444 0deg ${cRed}deg, #f97316 ${cRed}deg ${cOrange}deg, #3b82f6 ${cOrange}deg ${cBlue}deg, #22c55e ${cBlue}deg 360deg)`;

                const clusterToast = _t('construction.form.toast_zoom_cluster', 'Приблизьте чертеж, чтобы увидеть {total} дефектов', { total: total });
                const clusterTitle = _t('construction.form.title_hidden_defects', 'Скрыто дефектов: {total}', { total: total });
                return `
                <div class="absolute w-8 h-8 rounded-full shadow-[0_4px_10px_rgba(0,0,0,0.3)] flex items-center justify-center z-30 pointer-events-auto"
                     style="left: ${avgX}%; top: ${avgY}%; background: ${grad}; padding: 3px; transform: translate(-50%, -50%); cursor: pointer; transition: transform 150ms ease;"
                     onpointerenter="this.style.transform='translate(-50%,-50%) scale(1.15)'"
                     onpointerleave="this.style.transform='translate(-50%,-50%)'"
                     onclick="showToast(${JSON.stringify(clusterToast)})" title="${clusterTitle.replace(/"/g, '&quot;')}">
                    <div class="w-full h-full bg-white text-slate-800 rounded-full flex items-center justify-center text-[12px] font-black border border-slate-200">
                        ${total}
                    </div>
                </div>`;
            }
        }).join('');

        const universalPinsContainer = document.getElementById('universal-pdf-pins');
        if (universalPinsContainer) universalPinsContainer.innerHTML = pinsHtml;

        // Preview-план: рисуем всегда, если контейнер есть и принадлежит этому этажу
        // (раньше требовали !hidden у renderArea — из-за гонки булавки могли не появиться)
        const previewPinsContainer = document.getElementById('preview-pdf-pins');
        if (previewPinsContainer) {
            const pinnedTo = previewPinsContainer.dataset.floorId;
            if (!pinnedTo || String(pinnedTo) === floorKey) {
                previewPinsContainer.innerHTML = pinsHtml;
            }
        }
        // --- 4. ОТРИСОВКА ЗОН ПРИЕМОК (ЕСЛИ СЛОЙ ALL ИЛИ ZONES) ---
        if (layer === 'ALL' || layer === 'ZONES') {
            const reqs = window.ConstAcceptance?.requests?.filter(r => String(r.floorId) === floorKey && r.zone) || [];
            
            const zonesHtml = reqs.map(req => {
                const z = req.zone;
                let zoneColor = 'bg-blue-500/20 border-blue-500';
                let labelColor = 'bg-blue-600';
                
                if (req.status === 'rejected') { zoneColor = 'bg-red-500/20 border-red-500'; labelColor = 'bg-red-600'; }
                if (req.status === 'accepted') { zoneColor = 'bg-green-500/20 border-green-500'; labelColor = 'bg-green-600'; }

                return `
                <div class="zone-marker-layer absolute border-2 ${zoneColor} shadow-inner z-10 flex items-center justify-center cursor-pointer hover:bg-black/10 transition-colors" 
                     style="left: ${z.x}%; top: ${z.y}%; width: ${z.w}%; height: ${z.h}%;"
                     onclick="window.ConstAcceptance.openRequestDetails('${req.id}')"
                     title="${_t('construction.form.acceptance_request_title', 'Заявка: {contractor} ({workType})', { contractor: req.contractor, workType: req.workType }).replace(/"/g, '&quot;')}">
                     <span class="${labelColor} text-white text-[8px] font-black px-1.5 py-0.5 rounded opacity-80 uppercase tracking-widest text-center leading-tight shadow-md">${req.workType}</span>
                </div>`;
            }).join('');

            if (universalPinsContainer) universalPinsContainer.insertAdjacentHTML('afterbegin', zonesHtml);
            if (previewPinsContainer) {
                const pinnedTo = previewPinsContainer.dataset.floorId;
                if (!pinnedTo || String(pinnedTo) === floorKey) {
                    previewPinsContainer.insertAdjacentHTML('afterbegin', zonesHtml);
                }
            }
        }
    },
    // --- Используем существующую глобальную систему фото ---
    handlePhotoUpload(event) {
        let defectId = document.getElementById('const-defect-id').value;
        if (!defectId) {
            // Защита: если ID нет (не должно случиться, но на всякий случай)
            defectId = 'def_' + window.RbiIds.newId();
            document.getElementById('const-defect-id').value = defectId;
        }
        // Запоминаем ID для переноса (на случай, если он изменится, но у нас постоянный)
        window.tempDefectPhotoKey = null;
        if (typeof syncPhotoTargetId === 'function') {
            syncPhotoTargetId(defectId);
        } else {
            window.currentPhotoId = defectId;
        }
        window.activePhotoContext = 'defect';
        if (typeof window['handlePhotoUpload'] === 'function') {
            window.handlePhotoUpload(event);
        } else {
            console.error('window.handlePhotoUpload not found');
        }
    },

    removePhoto() {
        const defectId = document.getElementById('const-defect-id').value;
        if (defectId) {
            _session().deletePhotoRaw(defectId);  // удаляем фото из глобального хранилища
        }
        // Скрываем превью
        const previewDiv = document.getElementById('const-defect-photo-preview');
        if (previewDiv) previewDiv.classList.add('hidden');
        const imgEl = document.getElementById('const-defect-img');
        if (imgEl) imgEl.src = '';
        const btn = document.getElementById('const-defect-photo-btn');
        if (btn) btn.innerHTML = _t('construction.form.attach_photo_emoji', '📷 Прикрепить фото');
        const fileInput = document.getElementById('const-defect-photo-input');
        if (fileInput) fileInput.value = '';
        if (typeof syncPhotoTargetId === 'function') {
            syncPhotoTargetId(null);
        } else {
            window.currentPhotoId = null;
        }
        window.activePhotoContext = null;
    },
};
