/* Файл: js/modules/construction/features/acceptance.js */

// ============================================================================
// === МОДУЛЬ ПРИЕМКИ РАБОТ (ЖУРНАЛ ЗАЯВОК) ===
// ============================================================================
// ============================================================================
// === МОДУЛЬ ПРИЕМКИ РАБОТ (ЖУРНАЛ ЗАЯВОК) ===
// ============================================================================

var _ctx = null;
function bindCtx(ctx) {
    _ctx = ctx;
    bindAcceptanceActionDelegation();
    bindAcceptanceI18n();
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

var _acceptanceI18nBound = false;
function bindAcceptanceI18n() {
    if (_acceptanceI18nBound) return;
    _acceptanceI18nBound = true;
    if (!(window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function')) return;
    window.RBI.events.on('i18n:localeChanged', function () {
        try {
            if (window.ConstAcceptance && typeof window.ConstAcceptance.renderList === 'function') {
                window.ConstAcceptance.renderList();
            }
        } catch (_e) { /* ignore */ }
    });
}

// Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
// (см. _ai/INDEX_HTML_HANDLERS_MAP.md), namespace-per-module (data-acceptance-action).
// Действия — методы window.ConstAcceptance, не bare window.*-функции.
function bindAcceptanceActionDelegation() {
    if (window.__acceptanceActionDelegationBound) return;
    window.__acceptanceActionDelegationBound = true;

    var dispatch = function (el) {
        var action = el.dataset.acceptanceAction;
        var fn = window.ConstAcceptance && window.ConstAcceptance[action];
        if (typeof fn !== 'function') return;
        fn.call(window.ConstAcceptance);
    };

    var resolveActionElement = function (target, wantsChange) {
        var el = target;
        while (el && el.nodeType === 1) {
            if (el.dataset && el.dataset.acceptanceAction) {
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
        if (el) dispatch(el);
    }, true);

    document.addEventListener('change', function (e) {
        var el = resolveActionElement(e.target, true);
        if (el) dispatch(el);
    }, true);
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

function _templates() {
    if (_ctx && _ctx.templates) return _ctx.templates;
    return window.RBI.services.templates;
}

function _permissions() {
    if (_ctx && _ctx.permissions) return _ctx.permissions;
    return window.RBI.services.permissions;
}

function _game() {
    if (_ctx && _ctx.game) return _ctx.game;
    if (window.RBI && window.RBI.services && window.RBI.services.game) return window.RBI.services.game;
    return null;
}

window.ConstAcceptance = {
    bindCtx: bindCtx,
    requests: [],
    currentFilter: 'pending',

    // 1. Инициализация
    async init() {
        if (window.ConstManager.objects.length === 0) {
            await window.ConstManager.init();
        }
        try {
            if (typeof dbGetAll !== 'undefined') {
                const reqs = await _storage().getAll(_storage().stores().CONST_ACCEPTANCE);
                this.requests = (reqs || []).filter(x => !x._deleted);
            }
        } catch (e) {
            console.error('[ConstAcceptance] Ошибка загрузки заявок:', e);
        }
        this.renderList();
    },

    // 2. Управление фильтрами (оставляем для совместимости, но кнопки мы удалили)
    filter(status, btnEl) {
        this.currentFilter = status;
        this.renderList();
    },

    // 3. Отрисовка списка заявок (Канбан)
    renderList() {
        const container = document.getElementById('acceptance-list-container');
        const objFilterEl = document.getElementById('acc-global-obj-filter');
        if (!container) return;

        // Заполняем фильтр объектов один раз
        if (objFilterEl && objFilterEl.options.length === 1) {
            let opts = '<option value="ALL">' + _t('construction.acceptance.all_objects', 'Все объекты') + '</option>';
            window.ConstManager.objects.sort((a,b)=>a.name.localeCompare(b.name)).forEach(o => {
                opts += `<option value="${o.id}">${o.name}</option>`;
            });
            objFilterEl.innerHTML = opts;
        }

        const selectedObj = objFilterEl ? objFilterEl.value : 'ALL';
        
        // Фильтруем общую базу по объекту
        let baseReqs = this.requests;
        if (selectedObj !== 'ALL') {
            baseReqs = baseReqs.filter(r => r.objectId === selectedObj);
        }

        if (baseReqs.length === 0) {
            container.innerHTML = `<div class="text-center py-10 text-slate-400 text-[11px] font-bold uppercase tracking-widest bg-[var(--card-bg)] rounded-xl border border-dashed border-[var(--card-border)] shadow-sm mt-4">${_t('construction.acceptance.empty_requests', 'Заявок пока нет')}</div>`;
            return;
        }

        const role = _permissions() ? _permissions().getCurrentRole() : 'guest';
        const isEngineer = _permissions() ? _permissions().isEngineerOrAdmin() : ['engineer', 'manager', 'deputy_manager'].includes(role);

        const pending = baseReqs.filter(r => r.status === 'pending').sort((a, b) => new Date(a.requestedDate) - new Date(b.requestedDate));
        const rejected = baseReqs.filter(r => r.status === 'rejected').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const accepted = baseReqs.filter(r => r.status === 'accepted').sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 15); 

        const labelLocation = _t('construction.acceptance.label_location', 'Локация:');
        const labelContractor = _t('construction.acceptance.label_contractor', 'Подрядчик:');
        const btnPlan = _t('construction.acceptance.btn_plan', 'План');
        const btnDefects = _t('construction.acceptance.btn_defects', 'Дефекты');
        const colPending = _t('construction.acceptance.col_pending', '⏳ Ждут проверки');
        const colRejected = _t('construction.acceptance.col_rejected', '❌ Отклонено СК');
        const colAccepted = _t('construction.acceptance.col_accepted', '✅ Принято');
        const colEmptyPending = _t('construction.acceptance.col_empty_pending', 'Заявок нет');
        const colEmptyRejected = _t('construction.acceptance.col_empty_rejected', 'Брака нет');
        const colEmptyAccepted = _t('construction.acceptance.col_empty_accepted', 'История пуста');
        const fallbackObject = _t('construction.acceptance.fallback_object', 'Объект');

        const renderKanbanCard = (r) => {
            const objName = window.ConstManager.objects.find(o => o.id === r.objectId)?.name || fallbackObject;
            const reqDate = r.requestedDate ? new Date(r.requestedDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '-';
            const isOverdue = r.status === 'pending' && new Date(r.requestedDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0);

            return `
            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 mb-3 shadow-sm cursor-pointer hover:border-indigo-400 transition-colors active:scale-[0.98]" onclick="window.ConstAcceptance.openRequestDetails('${r.id}')">
                <div class="flex justify-between items-start mb-2 border-b border-[var(--card-border)] pb-2">
                    <div class="flex-1 min-w-0 pr-2">
                        <div class="text-[9px] font-black uppercase tracking-widest text-indigo-500 mb-0.5 truncate">${objName}</div>
                        <div class="text-[12px] font-black text-slate-800 dark:text-white uppercase truncate leading-tight">${r.workType}</div>
                    </div>
                </div>
                <div class="text-[10px] text-slate-600 dark:text-slate-400 leading-snug font-medium space-y-0.5 mb-2">
                    <div class="truncate"><span class="font-bold text-slate-400">${labelLocation}</span> ${r.location}</div>
                    <div class="truncate"><span class="font-bold text-slate-400">${labelContractor}</span> ${r.contractor}</div>
                </div>
                <div class="flex justify-between items-center bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--card-border)]">
                    <div class="flex items-center gap-1.5 ${isOverdue ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <span class="text-[10px] font-black">${reqDate} | ${r.requestedTime || '--:--'}</span>
                    </div>
                    ${isEngineer && r.status === 'pending' ? `<button onclick="event.stopPropagation(); window.ConstAcceptance.focusOnZone('${r.id}')" class="text-indigo-600 bg-white border border-indigo-200 px-2 py-1 rounded text-[9px] font-bold active:scale-90 shadow-sm flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg> ${btnPlan}</button>` : ''}
                    ${r.status === 'rejected' ? `<button onclick="event.stopPropagation(); window.ConstAcceptance.focusOnZone('${r.id}')" class="text-red-600 bg-white border border-red-200 px-2 py-1 rounded text-[9px] font-bold active:scale-90 shadow-sm flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> ${btnDefects}</button>` : ''}
                </div>
            </div>`;
        };

        container.innerHTML = `
            <div class="flex overflow-x-auto snap-x custom-scrollbar gap-4 px-1 pb-4 pt-2 w-full h-[70vh]">
                <div class="shrink-0 w-[85vw] sm:w-80 snap-start flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/20 rounded-2xl border border-[var(--card-border)] overflow-hidden">
                    <div class="p-3 border-b border-[var(--card-border)] bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-black text-[11px] uppercase tracking-widest flex justify-between items-center shrink-0">
                        <span>${colPending}</span>
                        <span class="bg-white dark:bg-slate-800 text-blue-600 px-1.5 py-0.5 rounded shadow-sm border border-blue-200">${pending.length}</span>
                    </div>
                    <div class="p-3 overflow-y-auto flex-1 custom-scrollbar">
                        ${pending.length > 0 ? pending.map(renderKanbanCard).join('') : '<div class="text-center py-4 text-[10px] font-bold text-slate-400 border border-dashed border-slate-300 rounded-xl">' + colEmptyPending + '</div>'}
                    </div>
                </div>

                <div class="shrink-0 w-[85vw] sm:w-80 snap-start flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/20 rounded-2xl border border-[var(--card-border)] overflow-hidden">
                    <div class="p-3 border-b border-[var(--card-border)] bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 font-black text-[11px] uppercase tracking-widest flex justify-between items-center shrink-0">
                        <span>${colRejected}</span>
                        <span class="bg-white dark:bg-slate-800 text-red-600 px-1.5 py-0.5 rounded shadow-sm border border-red-200">${rejected.length}</span>
                    </div>
                    <div class="p-3 overflow-y-auto flex-1 custom-scrollbar">
                        ${rejected.length > 0 ? rejected.map(renderKanbanCard).join('') : '<div class="text-center py-4 text-[10px] font-bold text-slate-400 border border-dashed border-slate-300 rounded-xl">' + colEmptyRejected + '</div>'}
                    </div>
                </div>

                <div class="shrink-0 w-[85vw] sm:w-80 snap-start flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/20 rounded-2xl border border-[var(--card-border)] overflow-hidden">
                    <div class="p-3 border-b border-[var(--card-border)] bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 font-black text-[11px] uppercase tracking-widest flex justify-between items-center shrink-0">
                        <span>${colAccepted}</span>
                        <span class="bg-white dark:bg-slate-800 text-green-600 px-1.5 py-0.5 rounded shadow-sm border border-green-200">${accepted.length}</span>
                    </div>
                    <div class="p-3 overflow-y-auto flex-1 custom-scrollbar">
                        ${accepted.length > 0 ? accepted.map(renderKanbanCard).join('') : '<div class="text-center py-4 text-[10px] font-bold text-slate-400 border border-dashed border-slate-300 rounded-xl">' + colEmptyAccepted + '</div>'}
                    </div>
                </div>
            </div>
        `;
    },

    // 4. Открытие модального окна (УМНОЕ - помнит контекст!)
    openNewRequestModal(floorId = null, zoneInfo = null, restoreContext = null) {
        const role = _permissions() ? _permissions().getCurrentRole() : 'guest';
        if (role === 'guest') return showToast(_t('construction.acceptance.toast_guest', '⚠️ Гости не могут предъявлять работы'));

        if (window.ConstManager.objects.length === 0) {
            return showToast(_t('construction.acceptance.toast_no_objects', '⚠️ Сначала создайте объект в разделе "Дефекты -> Управление иерархией"'));
        }

        // --- ВОССТАНОВЛЕНИЕ КОНТЕКСТА ---
        let preObj = '', preBld = '', preFlr = '', preWork = '', preRoom = '', preVol = '', preDate = '', preTime = '';
        if (restoreContext) {
            preObj = restoreContext.obj; preBld = restoreContext.bld; preFlr = restoreContext.flr;
            preWork = restoreContext.work; preRoom = restoreContext.room; preVol = restoreContext.vol;
            preDate = restoreContext.date; preTime = restoreContext.time;
        } else if (floorId && typeof floorId === 'string') {
            // Если пришли с плана (Сценарий А)
            const floor = window.ConstManager.floors.find(f => f.id === floorId);
            preFlr = floor?.id || '';
            preBld = floor?.building_id || '';
            preObj = window.ConstManager.buildings.find(b => b.id === preBld)?.object_id || '';
        }

        // Запоминаем зону для сохранения
        window.tempAcceptanceZone = zoneInfo;

        const objOptions = window.ConstManager.objects.map(o => `<option value="${o.id}" ${o.id === preObj ? 'selected' : ''}>${o.name}</option>`).join('');

        let tmplOptions = '<option value="">' + _t('construction.acceptance.select_work_type', '-- Выберите вид работ --') + '</option>';
        const _st = _templates().getSystemTemplates();
        Object.keys(_st).sort().forEach(k => { tmplOptions += `<option value="sys_${k}" ${preWork === 'sys_'+k ? 'selected':''}>[СИС] ${_st[k].title}</option>`; });
        const _ut = _templates().getUserTemplates();
        Object.keys(_ut).sort().forEach(k => { tmplOptions += `<option value="user_${k}" ${preWork === 'user_'+k ? 'selected':''}>[МОЙ] ${_ut[k].title}</option>`; });

        const html = `
        <div id="acc-request-modal" class="fixed inset-0 bg-slate-900/80 z-[6000] flex items-center justify-center p-4 backdrop-blur-sm" onclick="this.remove()">
            <div class="bg-[var(--card-bg)] w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-[var(--card-border)] animate-fadeIn" onclick="event.stopPropagation()">
                <div class="p-4 bg-indigo-600 border-b border-indigo-700 flex justify-between items-center">
                    <h3 class="font-black text-[13px] uppercase text-white flex items-center gap-2">${_t('construction.acceptance.modal_title', '📝 Заявка на приемку')}</h3>
                    <button onclick="document.getElementById('acc-request-modal').remove()" class="text-indigo-200 hover:text-white active:scale-90 font-black text-lg leading-none">✕</button>
                </div>
                <div class="p-4 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    
                    <div class="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                        <label class="text-[10px] font-black text-indigo-500 uppercase mb-2 block flex justify-between items-center">
                            <span>${_t('construction.acceptance.step_location', '1. Локация')}</span>
                            ${zoneInfo ? `<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[8px] font-black shadow-sm border border-blue-200">${_t('construction.acceptance.zone_selected', '✅ Зона выделена')}</span>` : `<button onclick="window.ConstAcceptance.goDrawZone()" class="bg-blue-50 text-blue-600 border border-blue-200 px-2 py-1 rounded text-[9px] font-black uppercase active:scale-95 shadow-sm">${_t('construction.acceptance.draw_zone', '🗺️ Выделить на плане')}</button>`}
                        </label>
                        <select id="req-obj" class="input-base text-[12px] font-bold mb-2" onchange="window.ConstAcceptance.onObjChange(this.value)">
                            <option value="">${_t('construction.acceptance.select_object', '-- Объект --')}</option>${objOptions}
                        </select>
                        <select id="req-bld" class="input-base text-[12px] font-bold mb-2" ${preObj ? '' : 'disabled'} onchange="window.ConstAcceptance.onBldChange(this.value)">
                            <option value="">${_t('construction.acceptance.select_building', '-- Корпус / Секция --')}</option>
                        </select>
                        <select id="req-flr" class="input-base text-[12px] font-bold" ${preBld ? '' : 'disabled'}>
                            <option value="">${_t('construction.acceptance.select_floor', '-- План Этажа --')}</option>
                        </select>
                    </div>

                    <div>
                        <label class="text-[10px] font-black text-indigo-500 uppercase mb-1 block">${_t('construction.acceptance.step_works', '2. Данные о работах *')}</label>
                        <select id="req-work" class="input-base text-[12px] font-bold mb-2 border-indigo-300">
                            ${tmplOptions}
                        </select>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">${_t('construction.acceptance.label_axes', 'Оси / Захватка')}</label>
                                <input type="text" id="req-room" class="input-base text-[12px]" placeholder="${_t('construction.acceptance.placeholder_axes', 'Напр: Оси А-Б')}" value="${preRoom}">
                            </div>
                            <div>
                                <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">${_t('construction.acceptance.label_volume', 'Объем')}</label>
                                <input type="text" id="req-vol" class="input-base text-[12px]" placeholder="${_t('construction.acceptance.placeholder_volume', 'Напр: 45 м2')}" value="${preVol}">
                            </div>
                        </div>
                    </div>

                    <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
                        <label class="text-[10px] font-black text-indigo-500 uppercase mb-2 block">${_t('construction.acceptance.step_schedule', '3. Когда готовы сдать?')}</label>
                        <div class="grid grid-cols-2 gap-2">
                            <input type="date" id="req-date" class="input-base text-[12px] font-bold" value="${preDate}">
                            <select id="req-time" class="input-base text-[12px] font-bold">
                                <option value="09:00" ${preTime==='09:00'?'selected':''}>09:00 - 10:00</option>
                                <option value="10:00" ${preTime==='10:00'?'selected':''}>10:00 - 11:00</option>
                                <option value="11:00" ${preTime==='11:00'?'selected':''}>11:00 - 12:00</option>
                                <option value="13:00" ${preTime==='13:00'?'selected':''}>13:00 - 14:00</option>
                                <option value="14:00" ${preTime==='14:00'?'selected':''}>14:00 - 15:00</option>
                                <option value="15:00" ${preTime==='15:00'?'selected':''}>15:00 - 16:00</option>
                                <option value="16:00" ${preTime==='16:00'?'selected':''}>16:00 - 17:00</option>
                            </select>
                        </div>
                    </div>

                </div>
                <div class="p-3 border-t border-[var(--card-border)] bg-slate-50 dark:bg-slate-900/50 flex gap-2">
                    <button onclick="document.getElementById('acc-request-modal').remove()" class="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl text-[11px] font-bold uppercase active:scale-95 border border-slate-200">${_t('construction.acceptance.btn_cancel', 'Отмена')}</button>
                    <button onclick="window.ConstAcceptance.saveNewRequest()" class="flex-[1.5] bg-indigo-600 text-white py-3 rounded-xl text-[11px] font-black uppercase shadow-md active:scale-95">${_t('construction.acceptance.btn_submit', 'Отправить Инженеру')}</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        
        // Восстанавливаем каскадные селекторы, если объект был предвыбран
        if (preObj) this.onObjChange(preObj, preBld);
        if (preBld) this.onBldChange(preBld, preFlr);

        // Ставим завтрашний день, если даты нет
        if (!preDate) {
            const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
            document.getElementById('req-date').value = tmr.toISOString().split('T')[0];
        }
    },

    // Вспомогательные функции для каскадных списков в модалке
    onObjChange(objId, preSelectBld = null) {
        const bldSel = document.getElementById('req-bld');
        const flrSel = document.getElementById('req-flr');
        if (!bldSel || !flrSel) return;

        flrSel.innerHTML = '<option value="">' + _t('construction.acceptance.select_floor', '-- План Этажа --') + '</option>';
        flrSel.disabled = true;

        if (!objId) {
            bldSel.innerHTML = '<option value="">' + _t('construction.acceptance.select_building', '-- Корпус / Секция --') + '</option>';
            bldSel.disabled = true;
            return;
        }

        const validBlds = window.ConstManager.buildings.filter(b => b.object_id === objId);
        bldSel.innerHTML = '<option value="">' + _t('construction.acceptance.select_building', '-- Корпус / Секция --') + '</option>' + 
            validBlds.map(b => `<option value="${b.id}" ${b.id === preSelectBld ? 'selected' : ''}>${b.name}</option>`).join('');
        bldSel.disabled = false;
    },

    onBldChange(bldId, preSelectFlr = null) {
        const flrSel = document.getElementById('req-flr');
        if (!flrSel) return;

        if (!bldId) {
            flrSel.innerHTML = '<option value="">' + _t('construction.acceptance.select_floor', '-- План Этажа --') + '</option>';
            flrSel.disabled = true;
            return;
        }

        const validFlrs = window.ConstManager.floors.filter(f => f.building_id === bldId);
        flrSel.innerHTML = '<option value="">' + _t('construction.acceptance.select_floor', '-- План Этажа --') + '</option>' + 
            validFlrs.map(f => `<option value="${f.id}" ${f.id === preSelectFlr ? 'selected' : ''}>${f.name}</option>`).join('');
        flrSel.disabled = false;
    },

    // Кнопка "Выделить на плане" изнутри заявки
    goDrawZone() {
        const obj = document.getElementById('req-obj').value;
        const bld = document.getElementById('req-bld').value;
        const flr = document.getElementById('req-flr').value;

        if (!obj || !bld || !flr) return showToast(_t('construction.acceptance.toast_select_location', '⚠️ Сначала выберите Объект, Корпус и Этаж!'));

        // Сохраняем введенный текст, чтобы он не пропал
        window.tempAcceptanceContext = {
            obj, bld, flr,
            work: document.getElementById('req-work').value,
            room: document.getElementById('req-room').value,
            vol: document.getElementById('req-vol').value,
            date: document.getElementById('req-date').value,
            time: document.getElementById('req-time').value
        };

        document.getElementById('acc-request-modal').remove();
        
        window.ConstManager.switchView('plan');
        window.ConstManager.currentFlrId = flr;
        window.ConstManager.renderSelectors();
        
        const floorData = window.ConstManager.floors.find(f => f.id === flr);
        if (!floorData) return;

        window.UniversalPdfViewer.open(floorData.pdf_url, _t('construction.acceptance.zone_draw_title', 'Выделение зоны'), flr);
        setTimeout(() => { window.UniversalPdfViewer.setZoneMode(true); }, 800);
    },

    // 5. Сохранение новой заявки
    async saveNewRequest() {
        const objId = document.getElementById('req-obj').value;
        const bldId = document.getElementById('req-bld').value;
        const flrId = document.getElementById('req-flr').value;
        
        const workSelect = document.getElementById('req-work');
        const workKey = workSelect.value;
        const workTitle = workKey ? workSelect.options[workSelect.selectedIndex].text.replace(/\[.*?\]\s*/, '') : '';
        
        const rm = document.getElementById('req-room').value.trim();
        const vol = document.getElementById('req-vol').value.trim();
        const dateStr = document.getElementById('req-date').value;
        const timeStr = document.getElementById('req-time').value;

        if (!objId || !bldId || !flrId || !workKey || !dateStr) return showToast(_t('construction.acceptance.toast_fill_required', '⚠️ Заполните все поля со звездочкой!'));

        // Берем данные, переданные с плана
        const zoneInfo = window.tempAcceptanceZone;
        const floor = window.ConstManager.floors.find(f => f.id === flrId);
        const bld = window.ConstManager.buildings.find(b => b.id === bldId);
        const loc = [bld?.name, `Этаж ${floor?.name}`, rm].filter(Boolean).join(', ');

        const contractorName = window.syncConfig?.engineerName || 'Подрядчик';
        let contractorId = '';
        const contractorsSvc = window.RBI?.services?.contractors || null;
        if (contractorsSvc && typeof contractorsSvc.resolveIdFromNormalized === 'function') {
            contractorId = contractorsSvc.resolveIdFromNormalized({
                display_name: contractorName,
                contractor_name: contractorName
            }) || '';
        }

        const newReq = {
            id: window.RbiIds.newId(),
            objectId: objId,
            floorId: flrId, 
            zone: zoneInfo, // Сохраняем прямоугольник: x, y, w, h
            templateKey: workKey,
            workType: workTitle,
            location: loc,
            section: bld?.name, 
            floor: floor?.name,
            room: rm,
            volume: vol,
            requestedDate: dateStr,
            requestedTime: timeStr,
            contractor: contractorName,
            contractorId: contractorId,
            status: 'pending',
            created_at: new Date().toISOString(),
            _deleted: false
        };

        this.requests.push(newReq);
        await _storage().put(_storage().stores().CONST_ACCEPTANCE, newReq);

        document.getElementById('acc-request-modal').remove();
        showToast(_t('construction.acceptance.toast_submitted', '✅ Заявка отправлена инженеру!'));
        
        // Очищаем переменные
        window.tempAcceptanceZone = null;
        window.tempAcceptanceFloor = null;
        window.tempAcceptanceObject = null;
        window.tempAcceptanceContext = null;

        this.renderList();
    },

    // 6. Детализация заявки
    openRequestDetails(id) {
        const req = this.requests.find(r => r.id === id);
        if (!req) return;

        const role = _permissions() ? _permissions().getCurrentRole() : 'guest';
        const isEngineer = _permissions() ? _permissions().isEngineerOrAdmin() : ['engineer', 'manager', 'deputy_manager'].includes(role);

        const objName = window.ConstManager.objects.find(o => o.id === req.objectId)?.name || _t('construction.acceptance.unknown_object', 'Неизвестный объект');
        const detailTitle = _t('construction.acceptance.details_title', '📋 Детали заявки');
        const lblLocation = _t('construction.acceptance.label_location', 'Локация:');
        const lblContractor = _t('construction.acceptance.label_contractor', 'Подрядчик:');
        const lblVolume = _t('construction.acceptance.label_volume_detail', 'Объём:');
        const lblSlot = _t('construction.acceptance.label_slot', 'Слот:');
        const lblCreated = _t('construction.acceptance.label_created', 'Создано:');
        const btnShowOnPlan = _t('construction.acceptance.btn_show_on_plan', '🗺️ Показать на плане');
        const btnStartInspection = _t('construction.acceptance.btn_start_inspection', 'Начать проверку (Чек-лист)');
        const btnAcceptNoCk = _t('construction.acceptance.btn_accept_no_ck', '✅ Принять (без ЦК)');
        const btnReject = _t('construction.acceptance.btn_reject', '❌ Отклонить');
        const msgEngineerReviewing = _t('construction.acceptance.msg_engineer_reviewing', '⏳ Инженер проверяет заявку...');
        const btnWithdraw = _t('construction.acceptance.btn_withdraw', 'Отозвать заявку');
        const statusAccepted = _t('construction.acceptance.status_accepted', '✅ Работы Приняты');
        const statusRejected = _t('construction.acceptance.status_rejected', '❌ Работы Отклонены');
        const msgRejectedHint = _t('construction.acceptance.msg_rejected_hint', 'Дефекты перенесены в Реестр замечаний. Устраните их и подайте заявку заново.');
        const btnReturnPending = _t('construction.acceptance.btn_return_pending', 'Вернуть в работу (Служебная)');

        let actionBtns = '';

        if (req.status === 'pending') {
            if (isEngineer) {
                actionBtns = `
                    <div class="flex flex-col gap-2 mt-4 pt-4 border-t border-[var(--card-border)]">
                        <button onclick="document.getElementById('acc-details-modal').remove(); window.ConstAcceptance.focusOnZone('${req.id}')" class="w-full bg-slate-100 text-slate-700 border border-slate-300 py-3 rounded-xl font-black text-[11px] uppercase shadow-sm active:scale-95 flex items-center justify-center gap-2">
                            ${btnShowOnPlan}
                        </button>
                        <button onclick="window.ConstAcceptance.startInspection('${req.id}')" class="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-black text-[12px] uppercase shadow-md active:scale-95 flex items-center justify-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                            ${btnStartInspection}
                        </button>
                        <div class="flex gap-2">
                            <button onclick="window.ConstAcceptance.changeStatus('${req.id}', 'accepted')" class="flex-1 bg-green-50 text-green-600 border border-green-200 py-3 rounded-xl font-bold text-[10px] uppercase active:scale-95 shadow-sm">${btnAcceptNoCk}</button>
                            <button onclick="window.ConstAcceptance.changeStatus('${req.id}', 'rejected')" class="flex-1 bg-red-50 text-red-600 border border-red-200 py-3 rounded-xl font-bold text-[10px] uppercase active:scale-95 shadow-sm">${btnReject}</button>
                        </div>
                    </div>
                `;
            } else {
                actionBtns = `
                    <div class="mt-4 pt-4 border-t border-[var(--card-border)] text-center">
                        <div class="text-[11px] font-bold text-blue-500 uppercase tracking-widest mb-3 animate-pulse">${msgEngineerReviewing}</div>
                        <button onclick="window.ConstAcceptance.deleteRequest('${req.id}')" class="w-full bg-red-50 text-red-600 py-3 rounded-xl font-bold text-[10px] uppercase active:scale-95 border border-red-200">${btnWithdraw}</button>
                    </div>
                `;
            }
        } else {
            let engineerOverrideBtn = isEngineer ? `<button onclick="window.ConstAcceptance.changeStatus('${req.id}', 'pending')" class="w-full mt-2 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold text-[10px] uppercase active:scale-95 border border-slate-200">${btnReturnPending}</button>` : '';
            
            actionBtns = `
                <div class="mt-4 pt-4 border-t border-[var(--card-border)] text-center">
                    <div class="text-[12px] font-black uppercase tracking-widest mb-1 ${req.status === 'accepted' ? 'text-green-600' : 'text-red-600'}">${req.status === 'accepted' ? statusAccepted : statusRejected}</div>
                    ${req.status === 'rejected' ? '<div class="text-[10px] text-slate-500 mb-3">' + msgRejectedHint + '</div>' : ''}
                    ${engineerOverrideBtn}
                </div>
            `;
        }

        const html = `
        <div id="acc-details-modal" class="fixed inset-0 bg-slate-900/80 z-[6000] flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn" onclick="this.remove()">
            <div class="bg-[var(--card-bg)] w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-[var(--card-border)] animate-fadeIn" onclick="event.stopPropagation()">
                <div class="p-4 bg-[var(--hover-bg)] border-b border-[var(--card-border)] flex justify-between items-center">
                    <h3 class="font-black text-[13px] uppercase text-slate-800 dark:text-white flex items-center gap-2">${detailTitle}</h3>
                    <button onclick="document.getElementById('acc-details-modal').remove()" class="text-slate-400 hover:text-red-500 active:scale-90 font-black text-lg leading-none">✕</button>
                </div>
                <div class="p-5">
                    <div class="text-[10px] font-black uppercase text-indigo-500 mb-1">${objName}</div>
                    <div class="text-[16px] font-black text-slate-800 dark:text-white leading-tight mb-4">${req.workType}</div>
                    
                    <div class="space-y-2 text-[12px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                        <div class="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                            <span class="font-bold text-slate-400">${lblLocation}</span>
                            <span class="font-medium text-right">${req.location}</span>
                        </div>
                        <div class="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                            <span class="font-bold text-slate-400">${lblContractor}</span>
                            <span class="font-medium text-right">${req.contractor}</span>
                        </div>
                        <div class="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                            <span class="font-bold text-slate-400">${lblVolume}</span>
                            <span class="font-medium text-right">${req.volume || '-'}</span>
                        </div>
                        <div class="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                            <span class="font-bold text-slate-400">${lblSlot}</span>
                            <span class="font-medium text-right">${req.requestedDate ? new Date(req.requestedDate).toLocaleDateString('ru-RU') : ''} | ${req.requestedTime || ''}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="font-bold text-slate-400">${lblCreated}</span>
                            <span class="font-medium text-right">${new Date(req.created_at).toLocaleDateString('ru-RU')}</span>
                        </div>
                    </div>
                    
                    ${actionBtns}
                </div>
            </div>
        </div>`;
        
        document.body.insertAdjacentHTML('beforeend', html);
    },

    async changeStatus(id, newStatus) {
        const req = this.requests.find(r => r.id === id);
        if (req) {
            req.status = newStatus;
            await _storage().put(_storage().stores().CONST_ACCEPTANCE, req);
            
            const modal = document.getElementById('acc-details-modal');
            if (modal) modal.remove();
            
            const statusLabel = newStatus === 'accepted'
                ? _t('construction.acceptance.toast_status_accepted', 'Принято')
                : (newStatus === 'rejected'
                    ? _t('construction.acceptance.toast_status_rejected', 'Отклонено')
                    : _t('construction.acceptance.toast_status_pending', 'В работе'));
            showToast(_t('construction.acceptance.toast_status_changed', 'Статус заявки изменен на: {status}', { status: statusLabel }));
            this.renderList();
        }
    },

    async deleteRequest(id) {
        if(!confirm(_t('construction.acceptance.confirm_withdraw', 'Отозвать и удалить заявку?'))) return;
        const req = this.requests.find(r => r.id === id);
        if (req) {
            req._deleted = true;
            await _storage().put(_storage().stores().CONST_ACCEPTANCE, req);
            this.requests = this.requests.filter(r => r.id !== id);
            
            const modal = document.getElementById('acc-details-modal');
            if (modal) modal.remove();
            
            showToast(_t('construction.acceptance.toast_withdrawn', '🗑️ Заявка отозвана'));
            this.renderList();
        }
    },

    // --- Поиск и фокусировка на Зоне приемки на интерактивном плане ---
    focusOnZone(reqId) {
        const req = this.requests.find(r => r.id === reqId);
        if (!req || !req.floorId || !req.zone) return showToast(_t('construction.acceptance.toast_no_zone', '⚠️ Для этой заявки не была выделена зона на плане'));

        document.getElementById('acc-details-modal')?.remove();

        if (window.ConstManager.currentFlrId !== req.floorId) {
            const floor = window.ConstManager.floors.find(f => f.id === req.floorId);
            if (floor) {
                window.ConstManager.currentObjId = window.ConstManager.buildings.find(b => b.id === floor.building_id)?.object_id;
                window.ConstManager.currentBldId = floor.building_id;
                window.ConstManager.currentFlrId = floor.id;
                window.ConstManager.renderSelectors();
            }
        }

        window.ConstManager.switchView('plan');
        const floor = window.ConstManager.floors.find(f => f.id === req.floorId);
        if (!floor) return;

        const safeName = floor.name.replace(/'/g, "\\'");
        window.UniversalPdfViewer.open(floor.pdf_url, _t('construction.acceptance.plan_title', 'Приемка: {name}', { name: safeName }), floor.id);

        setTimeout(() => {
            const pz = window.UniversalPdfViewer.panzoomInstance;
            if (!pz) return;

            const wrapper = document.getElementById('universal-pdf-wrapper');
            const container = document.getElementById('universal-pdf-container');
            const pinsContainer = document.getElementById('universal-pdf-pins');
            
            const z = req.zone;
            let zoneColor = 'bg-blue-500/20 border-blue-500';
            let labelColor = 'bg-blue-600';
            if (req.status === 'rejected') { zoneColor = 'bg-red-500/20 border-red-500'; labelColor = 'bg-red-600'; }
            if (req.status === 'accepted') { zoneColor = 'bg-green-500/20 border-green-500'; labelColor = 'bg-green-600'; }

            const zoneHtml = `
                <div class="absolute border-2 ${zoneColor} shadow-inner z-10 flex items-center justify-center cursor-pointer hover:bg-black/10 transition-colors" 
                     style="left: ${z.x}%; top: ${z.y}%; width: ${z.w}%; height: ${z.h}%;"
                     onclick="window.ConstAcceptance.openRequestDetails('${req.id}')">
                     <span class="${labelColor} text-white text-[8px] font-black px-1.5 py-0.5 rounded opacity-80 uppercase tracking-widest text-center leading-tight shadow-md">${req.workType}</span>
                </div>
            `;
            pinsContainer.insertAdjacentHTML('beforeend', zoneHtml);

            const centerX_percent = z.x + (z.w / 2);
            const centerY_percent = z.y + (z.h / 2);

            const cw = wrapper.clientWidth;
            const ch = wrapper.clientHeight;
            
            const zoneWidthPx = (z.w / 100) * container.offsetWidth;
            let targetScale = (cw / zoneWidthPx) * 0.6; 
            if (targetScale > 4) targetScale = 4;
            if (targetScale < 1) targetScale = 1;

            const pointX_px = (centerX_percent / 100) * container.offsetWidth;
            const pointY_px = (centerY_percent / 100) * container.offsetHeight;

            const panX = (cw / 2) - (pointX_px * targetScale);
            const panY = (ch / 2) - (pointY_px * targetScale);

            pz.zoom(targetScale, { animate: true });
            setTimeout(() => {
                pz.pan(panX, panY, { animate: true, force: true });
                showToast(_t('construction.acceptance.toast_zone_highlighted', '📍 Зона сдачи подсвечена на плане!'));
            }, 50);

        }, 600);
    },

    startInspection(id) {
        const req = this.requests.find(r => r.id === id);
        if (!req) return;

        const modal = document.getElementById('acc-details-modal');
        if (modal) modal.remove();

        const objName = window.ConstManager.objects.find(o => o.id === req.objectId)?.name || '';

        window.activeAcceptanceRequestId = id;

        if (_game()) {
            _game().startInspection(req.contractor, req.templateKey, null, objName);
        }

        setTimeout(() => {
            const secInp = document.getElementById('inp-section');
            const flrInp = document.getElementById('inp-floor');
            const rmInp = document.getElementById('inp-room');

            if (secInp) secInp.value = req.section || '';
            if (flrInp) flrInp.value = req.floor || '';
            if (rmInp) rmInp.value = req.room || '';
            
            if(typeof updateLocationFromStructured === 'function') updateLocationFromStructured();
            
            showToast(_t('construction.acceptance.toast_inspection_mode', '📋 Режим приёмки активирован!'));
        }, 300);
    }
    
};
