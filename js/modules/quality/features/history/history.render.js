/**
 * history.render.js
 * Рендер вкладки «История» — фильтрация, группировка, генерация HTML,
 * детальный просмотр акта, пагинация групп.
 *
 * Бизнес-логика перенесена из history.legacy.js. Обратная совместимость
 * с inline-обработчиками index.html и внешними вызовами (game.js) —
 * через window.*-прокси в конце файла.
 */

import { HistoryState } from './history.state.js';
import {
    planPinOf,
    formatPlanPinPlaceLabel,
    assignFloorPointNumbers
} from '../shared/plan-pin-label.js';
import { openHistoryPlanViewer } from '../audit/features/quality-plan-pin.js';
import {
    histCollator as _histCollator,
    contractorNameOf as _contractorNameOf,
    workTypeNameOf as _workTypeNameOf,
    avgFinalUrk as _avgFinalUrk,
    avgUrkStatusCls as _avgUrkStatusCls
} from './history.group.js';

let _ctx = null;
/** Cache floorId → Map(id→num) for one History render pass. */
let _histFloorNumCache = new Map();
let _historyI18nBound = false;
let _historyDetailId = null;

function _t(key, fallback, vars) {
    try {
        var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
        if (i18n && typeof i18n.t === 'function') {
            var out = vars ? i18n.t(key, vars) : i18n.t(key);
            if (out && out !== key) return out;
        }
    } catch (e) {}
    if (vars && fallback) {
        return String(fallback).replace(/\{(\w+)\}/g, function (_m, k) {
            return vars[k] != null ? String(vars[k]) : '';
        });
    }
    return fallback;
}

function _bindHistoryI18n() {
    if (_historyI18nBound) return;
    if (!(window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function')) return;
    _historyI18nBound = true;
    window.RBI.events.on('i18n:localeChanged', function () {
        try {
            if (typeof HistoryRender.render === 'function') HistoryRender.render();
            var modal = document.getElementById('modal-overlay');
            if (_historyDetailId && modal && modal.style.display === 'flex'
                && typeof HistoryRender.renderDetail === 'function') {
                HistoryRender.renderDetail(_historyDetailId);
            }
        } catch (_e) { /* ignore */ }
    });
}

function _pinWord(n) {
    if (n === 1) return _t('quality.history.plan.pin_one', 'точка');
    if (n > 1 && n < 5) return _t('quality.history.plan.pin_few', 'точки');
    return _t('quality.history.plan.pin_many', 'точек');
}

function _floorsLabel(n) {
    if (n === 1) return _t('quality.history.plan.floors_one', '1 этаж');
    if (n > 1 && n < 5) return _t('quality.history.plan.floors_few', '{n} этажа', { n: n });
    return _t('quality.history.plan.floors_many', '{n} этажей', { n: n });
}

function _locationsSvc() {
    try {
        return (window.RBI && window.RBI.services && window.RBI.services.locations) || null;
    } catch (_e) {
        return null;
    }
}

function _clearHistFloorNumCache() {
    _histFloorNumCache = new Map();
}

function _pointNoForItem(item) {
    const pin = planPinOf(item);
    if (!pin || pin.locationId == null) return null;
    const fid = String(pin.locationId);
    if (!_histFloorNumCache.has(fid)) {
        _histFloorNumCache.set(fid, assignFloorPointNumbers(HistoryState.allRecords || [], fid));
    }
    return _histFloorNumCache.get(fid).get(String(item.id));
}

function _placeLabelForItem(item) {
    const pin = planPinOf(item);
    if (!pin || !Number.isFinite(Number(pin.x)) || !Number.isFinite(Number(pin.y))) {
        return item && item.location ? String(item.location) : '';
    }
    return formatPlanPinPlaceLabel(item, {
        pointNo: _pointNoForItem(item),
        locations: _locationsSvc(),
        inspections: HistoryState.allRecords || []
    });
}

function _escHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _workTypePinItems(items) {
    return (items || []).filter(function (item) {
        const pin = planPinOf(item);
        return !!(pin && pin.locationId != null
            && Number.isFinite(Number(pin.x)) && Number.isFinite(Number(pin.y)));
    });
}

function _workTypeCanShowPlan(items) {
    const loc = _locationsSvc();
    if (!loc || typeof loc.getPlanForFloor !== 'function') return false;
    const pins = _workTypePinItems(items);
    for (let i = 0; i < pins.length; i++) {
        const pin = planPinOf(pins[i]);
        const plan = loc.getPlanForFloor(pin.locationId);
        if (plan && plan.pdf_url) return true;
    }
    return false;
}

function _showMiniFloorPicker(floors, onPick) {
    const existing = document.getElementById('history-plan-floor-pick');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'history-plan-floor-pick';
    overlay.className = 'fixed inset-0 z-[12000] bg-black/50 flex items-end sm:items-center justify-center p-3';
    const rows = floors.map(function (f) {
        return `<button type="button" data-hplan-floor="${_escAttr(f.id)}"
            class="w-full text-left px-3 py-2.5 rounded-xl mb-1 hover:bg-brand-soft
                   text-rbi-body font-bold text-ink border border-transparent hover:border-brand-soft">
            ${_escHtml(f.name || f.id)}
        </button>`;
    }).join('');
    overlay.innerHTML = `
      <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col border border-surface">
        <div class="flex items-center justify-between px-4 py-3 border-b border-surface">
          <div class="text-sm font-bold text-ink">${_t('quality.history.plan.pick_floor', 'Выбор этажа')}</div>
          <button type="button" data-hplan-cancel class="text-muted hover:text-ink text-xl leading-none px-2">×</button>
        </div>
        <div class="overflow-y-auto p-2 flex-1">${rows || ('<div class="p-4 text-center text-rbi-label text-muted">' + _t('quality.history.plan.empty_floors', 'Нет этажей') + '</div>')}</div>
      </div>`;
    document.body.appendChild(overlay);
    const close = function () { overlay.remove(); };
    overlay.querySelector('[data-hplan-cancel]').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelectorAll('[data-hplan-floor]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const id = btn.getAttribute('data-hplan-floor');
            close();
            if (id && typeof onPick === 'function') onPick(id);
        });
    });
}

function _openHistoryPlanForItems(items) {
    const pinItems = _workTypePinItems(items);
    if (!pinItems.length) {
        if (typeof showToast === 'function') showToast(_t('quality.history.plan.no_pins_group', 'Нет точек на плане в этой группе'));
        return;
    }
    const loc = _locationsSvc();
    const floorMap = new Map();
    pinItems.forEach(function (item) {
        const pin = planPinOf(item);
        const fid = String(pin.locationId);
        if (floorMap.has(fid)) return;
        const plan = loc && loc.getPlanForFloor(fid);
        if (!plan || !plan.pdf_url) return;
        let name = fid;
        try {
            const node = loc.getNode(fid);
            if (node && node.displayName) name = node.displayName;
        } catch (_e) { /* ignore */ }
        floorMap.set(fid, { id: fid, name: name });
    });
    const floors = [...floorMap.values()];
    if (!floors.length) {
        if (typeof showToast === 'function') showToast(_t('quality.history.plan.no_pdf', '⚠️ У этажей нет PDF-плана'));
        return;
    }
    const openFloor = function (floorId) {
        openHistoryPlanViewer({ floorId: floorId, items: pinItems });
    };
    if (floors.length === 1) {
        openFloor(floors[0].id);
        return;
    }
    _showMiniFloorPicker(floors, openFloor);
}

let _histPlanDelegationBound = false;

function _bindHistPlanDelegation() {
    if (_histPlanDelegationBound) return;
    _histPlanDelegationBound = true;
    document.addEventListener('click', function (e) {
        const btn = e.target && e.target.closest && e.target.closest('[data-hist-open-plan]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const head = btn.closest('[data-hist-worktype-head]');
        if (!head) return;
        const body = head.nextElementSibling;
        if (!body) return;
        const ids = [...body.querySelectorAll('[data-hist-id]')].map(function (el) {
            return el.getAttribute('data-hist-id');
        }).filter(Boolean);
        const idSet = new Set(ids.map(String));
        const items = (HistoryState.allRecords || []).filter(function (it) {
            return idSet.has(String(it.id));
        });
        _openHistoryPlanForItems(items);
    }, true);
}

_bindHistPlanDelegation();

function _getEtalonActs() {
    if (_ctx && _ctx.knowledge) {
        return _ctx.knowledge.getEtalonActsSync();
    }
    if (window.RBI && window.RBI.services && window.RBI.services.knowledge) {
        return window.RBI.services.knowledge.getEtalonActsSync();
    }
    return Array.isArray(window.etalonActsArray) ? window.etalonActsArray : [];
}

function _templates() {
    if (_ctx && _ctx.templates) {
        return _ctx.templates;
    }
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

// Документарный УрК записи (Два индекса УрК — физика и документация, Шаг 3).
// Старые записи (сохранённые до введения physical/documentary) не содержат
// item.metrics.documentary — досчитываем "на лету" по item.state и актуальному
// чек-листу, без изменения хранимых данных (та же lazy recalculation, что
// используется в getContractorMetrics()).
/**
 * Сохраняет раскрытые аккордеоны Объект/Подрядчик до перерисовки списка.
 * Ключи — отображаемые имена (стабильнее index-based id hist-group-N).
 */
// Сколько проверок у вида работ показывать сразу (без «Показать еще»).
const HIST_CONTRACTOR_VISIBLE = 10;

function _escAttr(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function _projectNameOf(item) {
    return (item && item.projectName) || _t('quality.history.fallback.no_project', 'Без объекта');
}

function _filterHistoryRecords(allRecords) {
    const fSearch = document.getElementById('hist-search-text')?.value.toLowerCase() || '';
    const fPeriod = document.getElementById('hist-filter-period')?.value || 'D30';
    const fPhoto = document.getElementById('hist-filter-photo')?.checked;
    const fB3 = document.getElementById('hist-filter-b3')?.checked;
    const fPlan = document.getElementById('hist-filter-plan')?.checked;
    const _histMultiFilters = (window.activeMultiFilters && window.activeMultiFilters.history) || {};
    const fProj = _histMultiFilters.project || [];
    const fContr = _histMultiFilters.contractor || [];
    const fInsp = _histMultiFilters.inspector || [];
    const fTmpl = _histMultiFilters.template || [];

    let filteredArr = allRecords || [];
    const now = new Date();

    if (fSearch) {
        filteredArr = filteredArr.filter(i => {
            const projectText = i.project_display_name || i.projectName || i.project_canonical_key || '';
            return (
                (i.location && i.location.toLowerCase().includes(fSearch)) ||
                (projectText && projectText.toLowerCase().includes(fSearch)) ||
                (i.inspectorName && i.inspectorName.toLowerCase().includes(fSearch)) ||
                (i.contractorName && i.contractorName.toLowerCase().includes(fSearch)) ||
                (i.templateTitle && i.templateTitle.toLowerCase().includes(fSearch))
            );
        });
    }

    if (fProj.length > 0) {
        filteredArr = filteredArr.filter(i => {
            const p = i.project_display_name || i.projectName || i.project_canonical_key || '';
            return fProj.includes(p) || fProj.includes(i.project_canonical_key);
        });
    }
    if (fContr.length > 0) filteredArr = filteredArr.filter(i => fContr.includes(i.contractorName));
    if (fInsp.length > 0) filteredArr = filteredArr.filter(i => fInsp.includes(i.inspectorName));
    if (fTmpl.length > 0) {
        filteredArr = filteredArr.filter(i => fTmpl.includes(i.templateTitle || i.templateKey));
    }

    if (fPeriod && fPeriod !== 'ALL') {
        const histDays = typeof window.getAnalyticsPeriodDays === 'function'
            ? window.getAnalyticsPeriodDays(fPeriod)
            : null;
        if (histDays) {
            const from = new Date(now);
            from.setDate(now.getDate() - histDays);
            filteredArr = filteredArr.filter(i => new Date(i.date) >= from);
        }
    }

    if (fPhoto) filteredArr = filteredArr.filter(i => i.photos && Object.keys(i.photos).length > 0);
    if (fB3) filteredArr = filteredArr.filter(i => i.metrics && i.metrics.n_B3_fail > 0);
    if (fPlan) {
        filteredArr = filteredArr.filter(function (i) {
            const pin = planPinOf(i);
            if (!pin) return false;
            const x = Number(pin.x);
            const y = Number(pin.y);
            return Number.isFinite(x) && Number.isFinite(y) && pin.locationId != null;
        });
    }

    return filteredArr;
}

function _normLocName(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Floors under building (building → sections → floors) — same as quality-plan-pin. */
function _floorsUnderBuilding(loc, buildingId) {
    const sections = loc.getChildren(buildingId) || [];
    const floors = [];
    for (let i = 0; i < sections.length; i++) {
        if (sections[i].nodeType && sections[i].nodeType !== 'section') continue;
        const kids = loc.getChildren(sections[i].id) || [];
        for (let j = 0; j < kids.length; j++) {
            if (kids[j].nodeType === 'floor') floors.push(kids[j]);
        }
    }
    return floors;
}

function _resolveLocationObject(loc, projectName) {
    if (!loc || !projectName) return null;
    if (typeof loc.resolveObjectLink === 'function') {
        try {
            const link = loc.resolveObjectLink({ displayName: projectName });
            if (link && link.linked && link.locationObject) return link.locationObject;
            if (link && link.locationObject) return link.locationObject;
        } catch (_e) { /* fall through */ }
    }
    const objects = (typeof loc.listNodes === 'function'
        ? loc.listNodes({ nodeType: 'object', parentId: null })
        : []) || [];
    const pn = _normLocName(projectName);
    return objects.find(function (o) {
        return _normLocName(o.displayName) === pn || _normLocName(o.canonical_key) === pn;
    }) || null;
}

/** PDF floors for a location object with building/section meta. */
function _pdfFloorsForObject(loc, objectNode) {
    if (!loc || !objectNode) return [];
    const buildings = (loc.getChildren(objectNode.id) || []).filter(function (n) {
        return !n.nodeType || n.nodeType === 'building';
    });
    const rows = [];
    buildings.forEach(function (b) {
        const sections = (loc.getChildren(b.id) || []).filter(function (n) {
            return !n.nodeType || n.nodeType === 'section';
        });
        sections.forEach(function (s) {
            const kids = loc.getChildren(s.id) || [];
            kids.forEach(function (f) {
                if (f.nodeType !== 'floor') return;
                const plan = loc.getPlanForFloor(f.id);
                if (!plan || !plan.pdf_url) return;
                rows.push({
                    id: String(f.id),
                    name: f.displayName || f.id,
                    buildingId: String(b.id),
                    buildingName: b.displayName || '',
                    buildingsCount: buildings.length,
                    sectionId: String(s.id),
                    sectionName: s.displayName || _t('quality.history.plan.section', 'Секция'),
                    sectionsCount: sections.length
                });
            });
        });
    });
    return rows;
}

function _pinItemsOnFloor(filteredArr, floorId) {
    const fid = String(floorId);
    return (filteredArr || []).filter(function (item) {
        const pin = planPinOf(item);
        return !!(pin && String(pin.locationId) === fid
            && Number.isFinite(Number(pin.x)) && Number.isFinite(Number(pin.y)));
    });
}

/** Floor button label inside a section group (building prefix only if multi-building & flat). */
function _floorRowLabel(row, grouped) {
    if (grouped) return row.name;
    if (row.buildingsCount > 1 && row.buildingName) {
        return row.buildingName + ' · ' + row.name;
    }
    return row.name;
}

/** Group PDF floor rows: building → section → floors. */
function _groupPdfFloors(floors) {
    const buildings = [];
    const bMap = new Map();
    (floors || []).forEach(function (row) {
        const bKey = row.buildingId || row.buildingName || '_';
        let b = bMap.get(bKey);
        if (!b) {
            b = {
                buildingId: row.buildingId,
                buildingName: row.buildingName || '',
                buildingsCount: row.buildingsCount || 1,
                sections: [],
                sMap: new Map()
            };
            bMap.set(bKey, b);
            buildings.push(b);
        }
        const sKey = row.sectionId || row.sectionName || '_';
        let s = b.sMap.get(sKey);
        if (!s) {
            s = {
                sectionId: row.sectionId,
                sectionName: row.sectionName || _t('quality.history.plan.section', 'Секция'),
                floors: []
            };
            b.sMap.set(sKey, s);
            b.sections.push(s);
        }
        s.floors.push(row);
    });
    buildings.forEach(function (b) { delete b.sMap; });
    return buildings;
}

function _floorBtnHtml(row, count, grouped) {
    const countCls = count === 0
        ? 'text-muted'
        : 'text-brand';
    const emptyHint = count === 0
        ? ' <span class="text-rbi-caption font-bold text-muted uppercase tracking-wider">' + _t('quality.history.plan.empty_badge', 'пусто') + '</span>'
        : '';
    return `<button type="button" data-hist-plans-floor="${_escAttr(row.id)}"
        class="w-full text-left flex items-center justify-between gap-2 px-3 py-2.5 mb-1.5 last:mb-0 rounded-xl box-border
               bg-surface border border-[var(--card-border)]
               hover:border-brand hover:bg-brand-soft
               transition-colors">
        <span class="min-w-0 truncate text-rbi-body font-bold text-ink">${_escHtml(_floorRowLabel(row, grouped))}</span>
        <span class="shrink-0 text-rbi-label font-black ${countCls}">${count} ${_escHtml(_pinWord(count))}${emptyHint}</span>
    </button>`;
}

/** Build floors HTML with building/section group headers. Returns { html, totalPins }. */
function _buildGroupedFloorRowsHtml(floors, filteredArr) {
    let totalPins = 0;
    const groups = _groupPdfFloors(floors);
    const showBuilding = groups.length > 1;
    const parts = [];
    groups.forEach(function (b) {
        if (showBuilding && b.buildingName) {
            parts.push(`<div class="text-rbi-caption font-black uppercase tracking-wider text-muted mt-2 mb-1 first:mt-0">${_escHtml(b.buildingName)}</div>`);
        }
        b.sections.forEach(function (s) {
            parts.push(`<div class="text-rbi-caption font-bold text-brand/80 mt-1.5 mb-1 px-0.5">${_escHtml(s.sectionName)}</div>`);
            s.floors.forEach(function (row) {
                const pinItems = _pinItemsOnFloor(filteredArr, row.id);
                _histPlansFloorItems.set(String(row.id), pinItems);
                totalPins += pinItems.length;
                parts.push(_floorBtnHtml(row, pinItems.length, true));
            });
        });
    });
    return { html: parts.join(''), totalPins: totalPins };
}

let _histPlansDelegationBound = false;
/** floorId → filtered pin items for last plans render (open overlay). */
let _histPlansFloorItems = new Map();

function _bindHistPlansDelegation() {
    if (_histPlansDelegationBound) return;
    _histPlansDelegationBound = true;
    document.addEventListener('click', function (e) {
        const toggle = e.target && e.target.closest && e.target.closest('[data-hist-plans-toggle]');
        if (toggle) {
            const card = toggle.closest('[data-hist-plans-project]');
            const body = card && card.querySelector('[data-hist-plans-project-body]');
            const icon = toggle.querySelector('.chevron-icon');
            if (!body) return;
            e.preventDefault();
            const open = body.classList.toggle('is-open');
            if (icon) icon.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
            return;
        }
        const btn = e.target && e.target.closest && e.target.closest('[data-hist-plans-floor]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const floorId = btn.getAttribute('data-hist-plans-floor');
        if (!floorId) return;
        const items = _histPlansFloorItems.get(String(floorId)) || [];
        openHistoryPlanViewer({ floorId: floorId, items: items });
    }, true);
}

_bindHistPlansDelegation();

function _renderHistoryPlansList(filteredArr) {
    const listDiv = document.getElementById('history-plans-list');
    if (!listDiv) return;

    // Preserve open object accordions across filter re-render (как в Проверках).
    const expandedProjects = new Set();
    listDiv.querySelectorAll('[data-hist-plans-project]').forEach(function (card) {
        const pName = card.getAttribute('data-hist-plans-project');
        const body = card.querySelector('[data-hist-plans-project-body]');
        if (pName && body && body.classList.contains('is-open')) expandedProjects.add(pName);
    });

    _histPlansFloorItems = new Map();

    const loc = _locationsSvc();
    if (!loc || typeof loc.getPlanForFloor !== 'function') {
        listDiv.innerHTML = `<div class="text-sm text-muted text-center bg-surface p-6 rounded-xl border border-surface">${_t('quality.history.plan.locations_unavailable', 'Справочник локаций недоступен.')}</div>`;
        return;
    }

    // Как desktop History plans: объекты из проверок + объекты справочника с PDF
    // (новые планы без актов иначе не попадают в мобильный список).
    const projectNames = [];
    const seenProj = new Set();
    (filteredArr || []).forEach(function (item) {
        const pName = _projectNameOf(item);
        if (!seenProj.has(pName)) {
            seenProj.add(pName);
            projectNames.push(pName);
        }
    });
    try {
        const objects = (typeof loc.listNodes === 'function'
            ? loc.listNodes({ nodeType: 'object', parentId: null })
            : []) || [];
        objects.forEach(function (o) {
            const name = o.displayName || o.canonical_key;
            if (!name || seenProj.has(name)) return;
            if (_pdfFloorsForObject(loc, o).length) {
                seenProj.add(name);
                projectNames.push(name);
            }
        });
    } catch (_e) { /* ignore */ }
    projectNames.sort(_histCollator().compare);

    const blocks = [];
    projectNames.forEach(function (pName) {
        const obj = _resolveLocationObject(loc, pName);
        if (!obj) return;
        const floors = _pdfFloorsForObject(loc, obj);
        if (!floors.length) return;

        const grouped = _buildGroupedFloorRowsHtml(floors, filteredArr);
        const totalPins = grouped.totalPins;
        const floorRows = grouped.html;

        const pEsc = _escAttr(pName);
        const floorsLabel = _floorsLabel(floors.length);
        const pinsLabel = _t('quality.history.plan.pins_on_plans', '{n} на планах', { n: totalPins });

        // Toggle via closest() — не getElementById: checks/plans оба в DOM, hist-group-N дублировались.
        blocks.push(`
        <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-[14px] shadow-sm mb-2 overflow-hidden" data-hist-plans-project="${pEsc}">
            <div class="flex justify-between items-center p-2.5 cursor-pointer hover:bg-[var(--hover-bg)] active:bg-[var(--hover-bg)] transition-colors select-none rounded-t-[14px]" data-hist-plans-toggle>
                <div class="flex items-center gap-2.5 min-w-0 pr-2">
                    <div class="w-8 h-8 bg-brand-soft text-brand rounded-[10px] flex items-center justify-center shrink-0 border border-brand-soft">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>
                    </div>
                    <div class="min-w-0">
                        <div class="text-rbi-body font-black text-ink dark:text-white truncate leading-tight">${_escHtml(pName)}</div>
                        <div class="text-rbi-caption font-bold text-muted truncate mt-[1px]">${_escHtml(floorsLabel)}</div>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0 pl-1">
                    <span class="text-rbi-caption font-bold text-muted bg-[var(--hover-bg)] px-1.5 py-0.5 rounded-md border border-[var(--card-border)]">${_escHtml(pinsLabel)}</span>
                    <svg class="w-4 h-4 text-muted transition-transform duration-300 transform rotate-0 chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
            </div>
            <div class="rbi-acc min-w-0" data-hist-plans-project-body>
                <div class="rbi-acc-inner">
                    <div class="border-t border-[var(--card-border)] bg-surface p-2.5 min-w-0">
                        ${floorRows}
                    </div>
                </div>
            </div>
        </div>`);
    });

    if (!blocks.length) {
        listDiv.innerHTML = `<div class="text-sm text-muted text-center bg-surface p-6 rounded-xl border border-surface">${_t('quality.history.plan.empty_filtered', 'Нет объектов с PDF-планами этажей по заданным фильтрам.')}</div>`;
        return;
    }
    listDiv.innerHTML = blocks.join('');

    // Restore previously open objects (default: collapsed).
    if (expandedProjects.size > 0) {
        listDiv.querySelectorAll('[data-hist-plans-project]').forEach(function (card) {
            const pName = card.getAttribute('data-hist-plans-project');
            if (!pName || !expandedProjects.has(pName)) return;
            const body = card.querySelector('[data-hist-plans-project-body]');
            const icon = card.querySelector('.chevron-icon');
            if (body) body.classList.add('is-open');
            if (icon) icon.style.transform = 'rotate(180deg)';
        });
    }
}

let _histGroupSeq = 0;

function _nextHistGroupId() {
    return 'hist-group-' + (_histGroupSeq++);
}

function _renderHistoryRowHtml(item) {
    const photoIcon = (item.photos && Object.keys(item.photos).length > 0) ? `📸` : '';
    const syncBadge = getSyncBadgeHtml(item);
    const docScore = _getDocumentaryScore(item);
    const tTitle = item.templateTitle || _t('quality.history.fallback.unknown_work', 'Неизвестный вид работ');
    const when = new Date(item.date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const insp = item.inspectorName || _t('quality.history.fallback.unspecified', 'Не указан');
    const metaLine = when + ' · ' + tTitle + ' · ' + insp;
    const ts = new Date(item.date).getTime() || 0;
    const idAttr = _escAttr(item.id);
    const statusCls = (item.metrics && item.metrics.statusCls) || 'tag-blue';
    const finalPct = (item.metrics && item.metrics.final != null) ? item.metrics.final : '—';
    const placeLabel = _placeLabelForItem(item);
    const placeTitle = _escAttr(placeLabel);
    const placeHtml = _escHtml(placeLabel);

    return `
                <div class="flex items-center gap-1.5 mb-1.5 min-w-0 w-full max-w-full" data-hist-id="${idAttr}" data-hist-date="${ts}">
                    <input type="checkbox" class="hist-checkbox w-4 h-4 accent-indigo-600 rounded shrink-0 cursor-pointer" value="${idAttr}">
                    <div class="flex-1 min-w-0 overflow-hidden bg-surface border border-[var(--card-border)] rounded-xl p-2.5 shadow-sm cursor-pointer hover:border-brand transition-colors active:scale-[0.98]" onclick="showHistoryDetail('${String(item.id).replace(/'/g, "\\'")}')">
                        <div class="flex justify-between items-start gap-2 min-w-0">
                            <div class="min-w-0 flex-1 overflow-hidden">
                                <div class="flex items-center gap-1 min-w-0">
                                    <div class="text-rbi-caption font-bold text-ink dark:text-white truncate leading-tight min-w-0 flex-1" title="${placeTitle}">${placeHtml}${photoIcon ? ' ' + photoIcon : ''}</div>
                                    <div class="shrink-0 self-center">${syncBadge}</div>
                                </div>
                                <div class="text-rbi-caption text-muted truncate font-medium mt-0.5 min-w-0">${metaLine}</div>
                            </div>
                            <div class="flex flex-col items-end gap-0.5 shrink-0">
                                <span class="status-tag ${statusCls} !text-rbi-caption !px-1.5 !py-0.5 shadow-sm">${finalPct}%</span>
                                ${(docScore !== null && docScore !== undefined) ? `<span class="text-rbi-caption font-bold text-brand whitespace-nowrap" title="${_t('quality.history.urk.doc_title', 'Документарный УрК')}">${_t('quality.history.urk.doc_prefix', 'Док: {pct}%', { pct: docScore })}</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>`;
}

function _renderWorkTypeBlockHtml(safeContractorName, tTitle, tIndex, items) {
    const safeWorkTypeName = `${safeContractorName}-wt-${tIndex}`;
    const wtAvgUrk = _avgFinalUrk(items);
    const wtUrkHtml = (wtAvgUrk !== null)
        ? `<span class="status-tag ${_avgUrkStatusCls(wtAvgUrk)} !text-rbi-caption !px-1.5 !py-0.5 shadow-sm" data-hist-urk-wt title="${_t('quality.history.urk.avg_work', 'Средний УрК по виду работ')}">${wtAvgUrk}%</span>`
        : `<span class="hidden" data-hist-urk-wt></span>`;
    const reversed = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));
    const visibleItems = reversed.slice(0, HIST_CONTRACTOR_VISIBLE);
    const hiddenItems = reversed.slice(HIST_CONTRACTOR_VISIBLE);
    const tEsc = _escAttr(tTitle);
    const hiddenGroupId = `${safeWorkTypeName}-hidden`;
    const planBtn = _workTypeCanShowPlan(items)
        ? `<button type="button" data-hist-open-plan
            class="text-rbi-caption font-black uppercase tracking-wider text-brand
                   bg-brand-soft border border-brand
                   px-2 py-1 rounded-md active:scale-95"
            onclick="event.stopPropagation()">${_t('quality.history.btn.plan', 'План')}</button>`
        : '';

    let html = `<div class="mb-1 mt-1 flex justify-between items-center gap-2 cursor-pointer select-none rounded-md px-1.5 py-1 hover:bg-[var(--hover-bg)] transition-colors" data-hist-worktype-head="${tEsc}" onclick="
                    const body = document.getElementById('${safeWorkTypeName}');
                    const icon = this.querySelector('.chevron-icon-wt');
                    if (!body) return;
                    const open = body.classList.toggle('is-open');
                    if (icon) icon.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
                ">
                    <div class="text-rbi-label font-bold text-brand/80 uppercase tracking-wide flex items-center gap-1 min-w-0">
                        <svg class="w-2.5 h-2.5 text-brand transition-transform duration-300 chevron-icon-wt shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"></path></svg>
                        <span class="truncate normal-case tracking-normal">${tTitle}</span>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        ${planBtn}
                        ${wtUrkHtml}
                        <span class="text-rbi-caption font-bold text-muted bg-[var(--hover-bg)] px-1.5 py-0.5 rounded-md border border-[var(--card-border)]" data-hist-count-wt>${_t('quality.history.count.pcs', '{n} шт', { n: items.length })}</span>
                    </div>
                </div>`;
    html += `<div id="${safeWorkTypeName}" class="rbi-acc min-w-0 pl-1" data-hist-worktype="${tEsc}"><div class="rbi-acc-inner">`;
    html += visibleItems.map(_renderHistoryRowHtml).join('');
    if (hiddenItems.length > 0) {
        html += `<div id="${hiddenGroupId}" class="hidden" data-hist-hidden>${hiddenItems.map(_renderHistoryRowHtml).join('')}</div>`;
        html += `<button type="button" data-hist-show-more onclick="document.getElementById('${hiddenGroupId}').classList.remove('hidden'); this.style.display='none'" class="w-full bg-[var(--hover-bg)] text-muted py-2 mt-1 mb-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95 transition-colors border border-dashed border-[var(--card-border)]">${_t('quality.history.btn.show_more', 'Показать еще проверки ({n})', { n: hiddenItems.length })}</button>`;
    }
    html += `</div></div>`;
    return html;
}

/** workTypesMap: { [templateTitle]: items[] } */
function _renderContractorBlockHtml(safeGroupName, cName, cIndex, workTypesMap) {
    const safeContractorName = `${safeGroupName}-contr-${cIndex}`;
    const collator = _histCollator();
    const wtNames = Object.keys(workTypesMap || {}).sort(collator.compare);
    const allItems = [];
    wtNames.forEach((t) => {
        const arr = workTypesMap[t] || [];
        for (let i = 0; i < arr.length; i++) allItems.push(arr[i]);
    });
    const contrAvgUrk = _avgFinalUrk(allItems);
    const contrUrkHtml = (contrAvgUrk !== null)
        ? `<span class="status-tag ${_avgUrkStatusCls(contrAvgUrk)} !text-rbi-caption !px-1.5 !py-0.5 shadow-sm" data-hist-urk-contr title="${_t('quality.history.urk.avg_contractor', 'Средний УрК по подрядчику')}">${contrAvgUrk}%</span>`
        : `<span class="hidden" data-hist-urk-contr></span>`;
    const cEsc = _escAttr(cName);

    let html = `<div class="mb-1.5 mt-1.5 flex justify-between items-center gap-2 cursor-pointer select-none rounded-lg px-1.5 py-1 hover:bg-[var(--hover-bg)] transition-colors" data-hist-contractor-head="${cEsc}" onclick="
                    const body = document.getElementById('${safeContractorName}');
                    const icon = this.querySelector('.chevron-icon-sm');
                    if (!body) return;
                    const open = body.classList.toggle('is-open');
                    if (icon) icon.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
                ">
                    <div class="text-rbi-caption font-black text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-1 min-w-0">
                        <svg class="w-3 h-3 text-brand transition-transform duration-300 chevron-icon-sm shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"></path></svg>
                        <span class="truncate">${cName}</span>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        ${contrUrkHtml}
                        <span class="text-rbi-caption font-bold text-muted bg-[var(--hover-bg)] px-1.5 py-0.5 rounded-md border border-[var(--card-border)]" data-hist-count-contr>${_t('quality.history.count.pcs', '{n} шт', { n: allItems.length })}</span>
                    </div>
                </div>`;
    html += `<div id="${safeContractorName}" class="rbi-acc min-w-0" data-hist-contractor="${cEsc}"><div class="rbi-acc-inner">`;
    wtNames.forEach((tTitle, tIndex) => {
        html += _renderWorkTypeBlockHtml(safeContractorName, tTitle, tIndex, workTypesMap[tTitle] || []);
    });
    html += `</div></div>`;
    return html;
}

/**
 * P2-0024: lazy=true — тело свёрнутого объекта не рисуется (заголовок, счётчики и УрК — как обычно);
 * подрядчики/виды работ/строки дорисовываются при первом раскрытии (_histMaterializeProject)
 * из тех же отфильтрованных данных. На 3000 проверок это −90% узлов «Истории».
 */
function _renderProjectGroupHtml(pName, contractorsMap, lazy) {
    const safeGroupName = _nextHistGroupId();
    const collator = _histCollator();
    const contractorNames = Object.keys(contractorsMap).sort(collator.compare);
    const allObjectItems = [];
    contractorNames.forEach(cName => {
        const wtMap = contractorsMap[cName] || {};
        Object.keys(wtMap).forEach((tTitle) => {
            const arr = wtMap[tTitle] || [];
            for (let i = 0; i < arr.length; i++) allObjectItems.push(arr[i]);
        });
    });
    const totalChecksInGroup = allObjectItems.length;
    const objAvgUrk = _avgFinalUrk(allObjectItems);
    const objUrkHtml = (objAvgUrk !== null)
        ? `<span class="status-tag ${_avgUrkStatusCls(objAvgUrk)} !text-rbi-caption !px-1.5 !py-0.5 shadow-sm" data-hist-urk-obj title="${_t('quality.history.urk.avg_project', 'Средний УрК по объекту')}">${objAvgUrk}%</span>`
        : `<span class="hidden" data-hist-urk-obj></span>`;
    const pEsc = _escAttr(pName);

    let groupHtml = `
        <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-[14px] shadow-sm mb-2 overflow-hidden" data-hist-project="${pEsc}">
            <div class="flex justify-between items-center p-2.5 cursor-pointer hover:bg-[var(--hover-bg)] active:bg-[var(--hover-bg)] transition-colors select-none rounded-t-[14px]" onclick="if (window.rbiHistToggleProject) window.rbiHistToggleProject(this);">
                <div class="flex items-center gap-2.5 min-w-0 pr-2">
                    <div class="w-8 h-8 bg-brand-soft text-brand rounded-[10px] flex items-center justify-center shrink-0 border border-brand-soft">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                    </div>
                    <div class="min-w-0">
                        <div class="text-rbi-body font-black text-ink dark:text-white truncate leading-tight">${pName}</div>
                        <div class="text-rbi-caption font-bold text-muted truncate mt-[1px]" data-hist-contractor-count>${_t('quality.history.count.contractors', '{n} подрядч.', { n: contractorNames.length })}</div>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0 pl-1">
                    ${objUrkHtml}
                    <span class="text-rbi-caption font-bold text-muted bg-[var(--hover-bg)] px-1.5 py-0.5 rounded-md border border-[var(--card-border)]" data-hist-count-obj>${_t('quality.history.count.pcs', '{n} шт', { n: totalChecksInGroup })}</span>
                    <svg class="w-4 h-4 text-muted transition-transform duration-300 transform rotate-0 chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
            </div>
            
            <div id="${safeGroupName}" class="rbi-acc min-w-0" data-hist-project-body${lazy ? ' data-hist-lazy="1"' : ''}>
                <div class="rbi-acc-inner">
                    <div class="hist-project-list border-t border-[var(--card-border)] bg-surface p-2 min-w-0 overflow-x-hidden">`;

    if (!lazy) {
        contractorNames.forEach((cName, cIndex) => {
            groupHtml += _renderContractorBlockHtml(safeGroupName, cName, cIndex, contractorsMap[cName]);
        });
    }
    groupHtml += `</div></div></div></div>`;
    return groupHtml;
}

/** P2-0024: дорисовать тело объекта, отложенное при render() (см. _renderProjectGroupHtml lazy). */
function _histMaterializeProject(card) {
    const pBody = card && card.querySelector('[data-hist-project-body]');
    if (!pBody || pBody.getAttribute('data-hist-lazy') !== '1') return false;
    // P2-0025: история в памяти заменена синхронизацией — сначала перестроить весь список (тело = актуальный список)
    if (HistoryState.refreshFromMemoryIfStale()) {
        HistoryRender.render();
        return false;
    }
    pBody.removeAttribute('data-hist-lazy');
    const pName = card.getAttribute('data-hist-project');
    const contractorsMap = {};
    _filterHistoryRecords(HistoryState.allRecords).forEach((item) => {
        if (_projectNameOf(item) !== pName) return;
        const cName = _contractorNameOf(item);
        const tTitle = _workTypeNameOf(item);
        if (!contractorsMap[cName]) contractorsMap[cName] = {};
        if (!contractorsMap[cName][tTitle]) contractorsMap[cName][tTitle] = [];
        contractorsMap[cName][tTitle].push(item);
    });
    const host = _histProjectListHost(pBody);
    if (!host) return false;
    const safeGroupName = pBody.id || _nextHistGroupId();
    host.innerHTML = Object.keys(contractorsMap).sort(_histCollator().compare)
        .map((cName, cIndex) => _renderContractorBlockHtml(safeGroupName, cName, cIndex, contractorsMap[cName]))
        .join('');
    HistoryRender._autoLoadPaused = false;
    if (!HistoryRender._sentinelObserver) HistoryRender._observeLoadSentinel();
    return true;
}

/**
 * Раскрыть/свернуть объект по нажатию на шапку. P2-0025 доработка 1: если дорисовка перестроила
 * устаревший список, шапка уже отсоединена — действовать на карточку того же объекта в новом списке.
 */
function _histToggleProject(header) {
    let card = header && header.parentElement;
    if (!card) return;
    const pName = card.getAttribute('data-hist-project');
    _histMaterializeProject(card);
    if (!card.isConnected) {
        card = _findHistCard(document.getElementById('history-list'), pName);
        if (!card) return;
        _histMaterializeProject(card);
    }
    const head = card.firstElementChild;
    const body = Array.from(card.children).find((el) => el.hasAttribute('data-hist-project-body'));
    if (!body) return;
    const icon = head && head.querySelector('.chevron-icon');
    const open = body.classList.toggle('is-open');
    if (icon) icon.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
}

function _histMaterializeAllProjects() {
    const listDiv = document.getElementById('history-list');
    if (!listDiv) return 0;
    // P2-0025 доработка 1: устаревший список — один раз перестроить, затем дорисовать уже новые карточки
    if (HistoryState.refreshFromMemoryIfStale()) HistoryRender.render();
    let n = 0;
    listDiv.querySelectorAll('[data-hist-project]').forEach((card) => { if (_histMaterializeProject(card)) n++; });
    return n;
}

function _histAccIsOpen(el) {
    return !!(el && el.classList.contains('is-open'));
}

function _histAccOpen(el) {
    if (!el) return;
    el.classList.add('is-open');
}

/** Контент аккордеона всегда внутри .rbi-acc-inner (иначе grid-анимация ломается). */
function _histAccContentHost(accEl) {
    if (!accEl) return null;
    let inner = accEl.querySelector(':scope > .rbi-acc-inner');
    if (!inner) {
        inner = document.createElement('div');
        inner.className = 'rbi-acc-inner';
        while (accEl.firstChild) inner.appendChild(accEl.firstChild);
        accEl.appendChild(inner);
    }
    return inner;
}

/** Хост списка подрядчиков внутри раскрытого объекта. */
function _histProjectListHost(pBody) {
    if (!pBody) return null;
    const inner = _histAccContentHost(pBody);
    if (!inner) return null;
    let host = inner.querySelector(':scope > .hist-project-list');
    if (!host) {
        host = document.createElement('div');
        host.className = 'hist-project-list border-t border-[var(--card-border)] bg-surface p-2 min-w-0 overflow-x-hidden';
        while (inner.firstChild) host.appendChild(inner.firstChild);
        inner.appendChild(host);
    }
    return host;
}

function _captureExpandedHistory(listDiv) {
    const projects = new Set();
    const contractors = new Set();
    const workTypes = new Set();
    if (!listDiv) return { projects, contractors, workTypes };

    listDiv.querySelectorAll('[data-hist-project]').forEach((card) => {
        const pName = card.getAttribute('data-hist-project');
        const pBody = card.querySelector('[data-hist-project-body]');
        if (!pName || !pBody || !_histAccIsOpen(pBody)) return;
        projects.add(pName);
        pBody.querySelectorAll('[data-hist-contractor]').forEach((cBody) => {
            if (!_histAccIsOpen(cBody)) return;
            const cName = cBody.getAttribute('data-hist-contractor');
            if (!cName) return;
            contractors.add(pName + '\0' + cName);
            cBody.querySelectorAll('[data-hist-worktype]').forEach((wtBody) => {
                if (!_histAccIsOpen(wtBody)) return;
                const tTitle = wtBody.getAttribute('data-hist-worktype');
                if (tTitle) workTypes.add(pName + '\0' + cName + '\0' + tTitle);
            });
        });
    });
    return { projects, contractors, workTypes };
}

function _restoreExpandedHistory(listDiv, expanded) {
    if (!listDiv || !expanded || !expanded.projects || expanded.projects.size === 0) return;

    listDiv.querySelectorAll('[data-hist-project]').forEach((card) => {
        const pName = card.getAttribute('data-hist-project');
        if (!pName || !expanded.projects.has(pName)) return;

        const pBody = card.querySelector('[data-hist-project-body]');
        if (!pBody) return;
        _histAccOpen(pBody);
        const pIcon = card.querySelector('.chevron-icon');
        if (pIcon) pIcon.style.transform = 'rotate(180deg)';

        pBody.querySelectorAll('[data-hist-contractor]').forEach((cBody) => {
            const cName = cBody.getAttribute('data-hist-contractor');
            if (!cName || !expanded.contractors.has(pName + '\0' + cName)) return;
            _histAccOpen(cBody);
            const head = cBody.previousElementSibling;
            const cIcon = head && head.querySelector('.chevron-icon-sm');
            if (cIcon) cIcon.style.transform = 'rotate(180deg)';

            if (!expanded.workTypes) return;
            cBody.querySelectorAll('[data-hist-worktype]').forEach((wtBody) => {
                const tTitle = wtBody.getAttribute('data-hist-worktype');
                if (!tTitle || !expanded.workTypes.has(pName + '\0' + cName + '\0' + tTitle)) return;
                _histAccOpen(wtBody);
                const wtHead = wtBody.previousElementSibling;
                const wtIcon = wtHead && wtHead.querySelector('.chevron-icon-wt');
                if (wtIcon) wtIcon.style.transform = 'rotate(180deg)';
            });
        });
    });
}

function _findHistCard(listDiv, pName) {
    if (!listDiv || !pName) return null;
    const esc = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(pName) : pName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return listDiv.querySelector('[data-hist-project="' + esc + '"]');
}

function _findHistContractorBody(card, cName) {
    if (!card || !cName) return null;
    const esc = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(cName) : cName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return card.querySelector('[data-hist-contractor="' + esc + '"]');
}

function _findHistWorkTypeBody(cBody, tTitle) {
    if (!cBody || !tTitle) return null;
    const esc = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(tTitle) : tTitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return cBody.querySelector('[data-hist-worktype="' + esc + '"]');
}

function _enforceWorkTypeVisibleLimit(wtBody) {
    if (!wtBody) return;
    const host = _histAccContentHost(wtBody);
    if (!host) return;
    const rows = [...host.querySelectorAll('[data-hist-id]')];
    rows.sort((a, b) => (Number(b.getAttribute('data-hist-date')) || 0) - (Number(a.getAttribute('data-hist-date')) || 0));

    let hiddenWrap = host.querySelector('[data-hist-hidden]');
    let showMoreBtn = host.querySelector('[data-hist-show-more]');

    if (rows.length <= HIST_CONTRACTOR_VISIBLE) {
        rows.forEach((row) => host.insertBefore(row, hiddenWrap || showMoreBtn || null));
        if (hiddenWrap) hiddenWrap.remove();
        if (showMoreBtn) showMoreBtn.remove();
        return;
    }

    if (!hiddenWrap) {
        hiddenWrap = document.createElement('div');
        hiddenWrap.className = 'hidden';
        hiddenWrap.setAttribute('data-hist-hidden', '');
        hiddenWrap.id = (wtBody.id || 'hist') + '-hidden';
        host.appendChild(hiddenWrap);
    }
    if (!showMoreBtn) {
        showMoreBtn = document.createElement('button');
        showMoreBtn.type = 'button';
        showMoreBtn.setAttribute('data-hist-show-more', '');
        showMoreBtn.className = 'w-full bg-[var(--hover-bg)] text-muted py-2 mt-1 mb-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95 transition-colors border border-dashed border-[var(--card-border)]';
        showMoreBtn.onclick = function () {
            hiddenWrap.classList.remove('hidden');
            showMoreBtn.style.display = 'none';
        };
        host.appendChild(showMoreBtn);
    }

    rows.slice(0, HIST_CONTRACTOR_VISIBLE).forEach((row) => host.insertBefore(row, hiddenWrap));
    rows.slice(HIST_CONTRACTOR_VISIBLE).forEach((row) => hiddenWrap.appendChild(row));
    host.appendChild(hiddenWrap);
    host.appendChild(showMoreBtn);
    const wasExpanded = !hiddenWrap.classList.contains('hidden') || showMoreBtn.style.display === 'none';
    showMoreBtn.textContent = _t('quality.history.btn.show_more', 'Показать еще проверки ({n})', { n: rows.length - HIST_CONTRACTOR_VISIBLE });
    if (wasExpanded) {
        hiddenWrap.classList.remove('hidden');
        showMoreBtn.style.display = 'none';
    }
}

function _patchUrkEl(el, avg, title) {
    if (!el) return;
    if (avg === null || avg === undefined) {
        el.className = 'hidden';
        el.textContent = '';
        return;
    }
    el.className = 'status-tag ' + _avgUrkStatusCls(avg) + ' !text-rbi-caption !px-1.5 !py-0.5 shadow-sm';
    el.setAttribute('title', title || '');
    el.textContent = avg + '%';
}

function _updateProjectCardStats(card, pName, filteredArr) {
    if (!card) return;
    const objItems = filteredArr.filter(i => _projectNameOf(i) === pName);
    const countObj = card.querySelector('[data-hist-count-obj]');
    if (countObj) countObj.textContent = _t('quality.history.count.pcs', '{n} шт', { n: objItems.length });
    _patchUrkEl(card.querySelector('[data-hist-urk-obj]'), _avgFinalUrk(objItems), _t('quality.history.urk.avg_project', 'Средний УрК по объекту'));

    const contractors = new Set(objItems.map(_contractorNameOf));
    const cCount = card.querySelector('[data-hist-contractor-count]');
    if (cCount) cCount.textContent = _t('quality.history.count.contractors', '{n} подрядч.', { n: contractors.size });

    card.querySelectorAll('[data-hist-contractor]').forEach((cBody) => {
        const cName = cBody.getAttribute('data-hist-contractor');
        const items = objItems.filter(i => _contractorNameOf(i) === cName);
        const head = cBody.previousElementSibling;
        const countContr = head && head.querySelector('[data-hist-count-contr]');
        if (countContr) countContr.textContent = _t('quality.history.count.pcs', '{n} шт', { n: items.length });
        _patchUrkEl(head && head.querySelector('[data-hist-urk-contr]'), _avgFinalUrk(items), _t('quality.history.urk.avg_contractor', 'Средний УрК по подрядчику'));

        cBody.querySelectorAll('[data-hist-worktype]').forEach((wtBody) => {
            const tTitle = wtBody.getAttribute('data-hist-worktype');
            const wtItems = items.filter(i => _workTypeNameOf(i) === tTitle);
            const wtHead = wtBody.previousElementSibling;
            const countWt = wtHead && wtHead.querySelector('[data-hist-count-wt]');
            if (countWt) countWt.textContent = _t('quality.history.count.pcs', '{n} шт', { n: wtItems.length });
            _patchUrkEl(wtHead && wtHead.querySelector('[data-hist-urk-wt]'), _avgFinalUrk(wtItems), _t('quality.history.urk.avg_work', 'Средний УрК по виду работ'));
        });
    });
}

function _syncLoadMoreFooter(listDiv) {
    if (!listDiv) return;
    const existingBtn = document.getElementById('load-more-history-page-btn');
    const existingSentinel = document.getElementById('history-load-sentinel');
    if (!HistoryState.pageHasMore) {
        if (existingBtn) existingBtn.remove();
        if (existingSentinel) existingSentinel.remove();
        if (HistoryRender._sentinelObserver) {
            HistoryRender._sentinelObserver.disconnect();
            HistoryRender._sentinelObserver = null;
        }
        return;
    }
    if (!existingBtn) {
        listDiv.insertAdjacentHTML('beforeend', `<button id="load-more-history-page-btn" onclick="window.loadMoreHistoryPage()" class="w-full bg-brand-soft text-brand py-3 mt-1 mb-2 rounded-xl text-rbi-caption font-black uppercase tracking-widest active:scale-95 transition-colors border border-brand shadow-sm">
            ${_t('quality.history.btn.load_older', 'Загрузить более старые проверки')}
        </button>
        <div id="history-load-sentinel" class="h-2 -mt-2"></div>`);
    } else if (!existingSentinel) {
        existingBtn.insertAdjacentHTML('afterend', `<div id="history-load-sentinel" class="h-2 -mt-2"></div>`);
    }
    HistoryRender._observeLoadSentinel();
}

function _insertProjectCardSorted(listDiv, cardHtml, pName) {
    const collator = _histCollator();
    const cards = [...listDiv.querySelectorAll(':scope > [data-hist-project]')];
    let inserted = false;
    for (let i = 0; i < cards.length; i++) {
        const other = cards[i].getAttribute('data-hist-project') || '';
        if (collator.compare(pName, other) < 0) {
            cards[i].insertAdjacentHTML('beforebegin', cardHtml);
            inserted = true;
            break;
        }
    }
    if (!inserted) {
        const btn = document.getElementById('load-more-history-page-btn');
        if (btn) btn.insertAdjacentHTML('beforebegin', cardHtml);
        else listDiv.insertAdjacentHTML('beforeend', cardHtml);
    }
}

function _ensureContractorBlock(card, cName) {
    let cBody = _findHistContractorBody(card, cName);
    if (cBody) return cBody;

    const pBody = card.querySelector('[data-hist-project-body]');
    const listHost = _histProjectListHost(pBody);
    if (!listHost) return null;
    const safeGroupName = pBody.id || _nextHistGroupId();
    const cIndex = pBody.querySelectorAll('[data-hist-contractor]').length;
    const blockHtml = _renderContractorBlockHtml(safeGroupName, cName, cIndex, {});
    const collator = _histCollator();
    const heads = [...listHost.querySelectorAll(':scope > [data-hist-contractor-head]')];
    let placed = false;
    for (let i = 0; i < heads.length; i++) {
        const other = heads[i].getAttribute('data-hist-contractor-head') || '';
        if (collator.compare(cName, other) < 0) {
            heads[i].insertAdjacentHTML('beforebegin', blockHtml);
            placed = true;
            break;
        }
    }
    if (!placed) listHost.insertAdjacentHTML('beforeend', blockHtml);
    return _findHistContractorBody(card, cName);
}

function _ensureWorkTypeBlock(cBody, tTitle) {
    let wtBody = _findHistWorkTypeBody(cBody, tTitle);
    if (wtBody) return wtBody;

    const host = _histAccContentHost(cBody);
    if (!host) return null;
    const safeContractorName = cBody.id || ('hist-contr-' + _nextHistGroupId());
    const tIndex = cBody.querySelectorAll('[data-hist-worktype]').length;
    const blockHtml = _renderWorkTypeBlockHtml(safeContractorName, tTitle, tIndex, []);
    const collator = _histCollator();
    const heads = [...host.querySelectorAll(':scope > [data-hist-worktype-head]')];
    let placed = false;
    for (let i = 0; i < heads.length; i++) {
        const other = heads[i].getAttribute('data-hist-worktype-head') || '';
        if (collator.compare(tTitle, other) < 0) {
            heads[i].insertAdjacentHTML('beforebegin', blockHtml);
            placed = true;
            break;
        }
    }
    if (!placed) host.insertAdjacentHTML('beforeend', blockHtml);
    return _findHistWorkTypeBody(cBody, tTitle);
}

function _insertRowIntoWorkType(wtBody, item) {
    if (!wtBody || !item || item.id == null) return false;
    const idStr = String(item.id);
    if (wtBody.querySelector('[data-hist-id="' + ((typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(idStr) : idStr.replace(/"/g, '\\"')) + '"]')) {
        return false;
    }

    const newTs = new Date(item.date).getTime() || 0;
    const rowHtml = _renderHistoryRowHtml(item);
    const rows = [...wtBody.querySelectorAll('[data-hist-id]')];
    let insertBefore = null;
    for (let i = 0; i < rows.length; i++) {
        const ts = Number(rows[i].getAttribute('data-hist-date')) || 0;
        if (ts < newTs) {
            insertBefore = rows[i];
            break;
        }
    }
    if (insertBefore) {
        insertBefore.insertAdjacentHTML('beforebegin', rowHtml);
    } else {
        const host = _histAccContentHost(wtBody);
        const hiddenWrap = host && host.querySelector('[data-hist-hidden]');
        const showMoreBtn = host && host.querySelector('[data-hist-show-more]');
        if (hiddenWrap) hiddenWrap.insertAdjacentHTML('beforeend', rowHtml);
        else if (showMoreBtn) showMoreBtn.insertAdjacentHTML('beforebegin', rowHtml);
        else if (host) host.insertAdjacentHTML('beforeend', rowHtml);
    }
    _enforceWorkTypeVisibleLimit(wtBody);
    _ensureWorkTypePlanButton(wtBody);
    return true;
}

/** After incremental row insert — show «План» if pin+PDF now present. */
function _ensureWorkTypePlanButton(wtBody) {
    if (!wtBody) return;
    const head = wtBody.previousElementSibling;
    if (!head || !head.hasAttribute('data-hist-worktype-head')) return;
    if (head.querySelector('[data-hist-open-plan]')) return;
    const ids = [...wtBody.querySelectorAll('[data-hist-id]')].map(function (el) {
        return el.getAttribute('data-hist-id');
    }).filter(Boolean);
    const idSet = new Set(ids.map(String));
    const items = (HistoryState.allRecords || []).filter(function (it) {
        return idSet.has(String(it.id));
    });
    if (!_workTypeCanShowPlan(items)) return;
    const countEl = head.querySelector('[data-hist-count-wt]');
    const btnHtml = `<button type="button" data-hist-open-plan
            class="text-rbi-caption font-black uppercase tracking-wider text-brand
                   bg-brand-soft border border-brand
                   px-2 py-1 rounded-md active:scale-95"
            onclick="event.stopPropagation()">${_t('quality.history.btn.plan', 'План')}</button>`;
    if (countEl) countEl.insertAdjacentHTML('beforebegin', btnHtml);
}

function _getDocumentaryScore(item) {
    if (!item.metrics) return null;
    if (item.metrics.documentary !== undefined) return item.metrics.documentary;
    if (typeof window.getDocumentaryScore !== 'function' || !item.state || !item.templateKey) return null;
    const type = item.templateKey.split('_')[0];
    const key = item.templateKey.replace(type + '_', '');
    const checklist = type === 'sys' && _templates().getSystemTemplates()[key] ? _templates().getSystemTemplates()[key].groups : (_templates().getUserTemplates()[key] ? _templates().getUserTemplates()[key].groups : []);
    const flatList = typeof window.getFlatList === 'function' ? window.getFlatList(checklist) : [];
    return window.getDocumentaryScore(item.state, flatList);
}

// Приватная функция — перенесена из history.legacy.js (изначально app.js, строка 3971).
// Генерирует SVG-бейдж статуса синхронизации для записи истории.
function getSyncBadgeHtml(item) {
    var source = item.source || '';
    var syncStatus = item.syncStatus || item.sync_status || '';

    var iconLocal = '<svg class="w-2.5 h-2.5 inline-block mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"></path></svg>';
    var iconCloud = '<svg class="w-2.5 h-2.5 inline-block mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"></path></svg>';
    var iconBlocked = '<svg class="w-2.5 h-2.5 inline-block mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>';

    if (syncStatus === 'blocked') {
        var reason = item.syncBlockReason || item.sync_block_reason || _t('quality.history.sync.blocked_default', 'Отправка запрещена');
        var toastMsg = _t('quality.history.sync.reason_prefix', 'Причина: {reason}', { reason: reason });
        return '<button onclick="event.stopPropagation(); showToast(\'' + String(toastMsg).replace(/'/g, "\\'") + '\')" class="px-1.5 py-0.5 rounded bg-danger-soft text-danger border border-danger text-rbi-caption font-bold uppercase ml-1 flex items-center shadow-sm">' + iconBlocked + _t('quality.history.sync.blocked_badge', 'Заблок.') + '</button>';
    }
    // P2-0023 доработка 2: «нужно внимание» — фото пункта нет на устройстве. Пока идут автоповторы —
    // жёлтая плашка с причиной; после ATTENTION_ASK_USER_AFTER неудач — выбор «Отправить без этого фото».
    if (syncStatus === 'needs_attention') {
        var rpA = window.RbiSyncRetryPolicy;
        var attReason = item.syncBlockReason || item.sync_block_reason || _t('quality.history.sync.attention_default', 'Не отправлено: фото пункта не найдено на устройстве');
        var askUser = rpA && rpA.attentionNeedsUser(item);
        var attClick = askUser
            ? 'window.rbiHistoryResolveAttention(\'' + String(item.id).replace(/['"<>\\]/g, '') + '\')'
            : 'showToast(\'' + String(attReason + '. ' + _t('quality.history.sync.attention_retry', 'Повторим автоматически.')).replace(/\\/g, '').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/</g, '&lt;') + '\')';
        return '<button onclick="event.stopPropagation(); ' + attClick + '" title="' + String(attReason).replace(/"/g, '&quot;').replace(/</g, '&lt;') + '" class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 text-rbi-caption font-bold uppercase ml-1 flex items-center shadow-sm">' + iconBlocked + _t('quality.history.sync.attention_badge', 'Не отпр.') + '</button>';
    }
    if (source === 'cloud' || syncStatus === 'synced') {
        return '<span class="px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-200 text-rbi-caption font-bold uppercase ml-1 flex items-center shadow-sm">' + iconCloud + '</span>';
    }
    return '<span class="px-1.5 py-0.5 rounded bg-surface text-muted border border-surface text-rbi-caption font-bold uppercase ml-1 flex items-center shadow-sm">' + iconLocal + '</span>';
}

export const HistoryRender = {

    bindCtx(ctx) {
        _ctx = ctx;
        _bindHistoryI18n();
    },

    /**
     * Рендер вкладки История — фильтрация, группировка, генерация HTML.
     * Перенесено из history.legacy.js (изначально app.js, строка 3990).
     * Оригинальный синтаксис сохранён.
     * Зависимости: HistoryState.allRecords/filters, getSyncBadgeHtml — приватная
     *              функция модуля, DOM IDs: history-list, hist-empty-msg,
     *              hist-count-total, hist-search-text, hist-filter-period,
     *              hist-filter-photo, hist-filter-b3
     */
    render() {
        _bindHistoryI18n();
        if (window.currentHistoryViewMode === 'plans') {
            HistoryRender.renderPlans();
            return;
        }

        const listDiv = document.getElementById('history-list');
        const emptyMsg = document.getElementById('hist-empty-msg');
        const countEl = document.getElementById('hist-count-total');
        if (!listDiv) return;
        // P2-0024: история уже в памяти — список из неё (все записи периода, без второй копии из базы)
        if (typeof HistoryState.useMemoryHistoryIfReady === 'function') HistoryState.useMemoryHistoryIfReady();

        // Preserve open Object/Contractor accordions across full re-render
        // (sync dirty path, filters) — same idea as Tasks UI restore.
        const expanded = _captureExpandedHistory(listDiv);
        _histGroupSeq = 0;
        _clearHistFloorNumCache();

        if (HistoryState.allRecords.length === 0) {
            listDiv.innerHTML = '';
            if (emptyMsg) emptyMsg.style.display = 'block';
            if (countEl) countEl.innerText = '0';
            return;
        }
        if (emptyMsg) emptyMsg.style.display = 'none';

        // Фильтры: activeMultiFilters.history + DOM period/search (см. multi-filter).
        const filteredArr = _filterHistoryRecords(HistoryState.allRecords);
        if (countEl) countEl.innerText = filteredArr.length;

        if (filteredArr.length === 0) {
            listDiv.innerHTML = `<div class="text-sm text-muted text-center bg-surface p-6 rounded-xl border border-surface">${_t('quality.history.empty.filtered', 'По заданным фильтрам проверок не найдено.')}</div>`;
            return;
        }

        // Объект → Подрядчик → Вид работ → проверки по дате (новые сверху).
        const grouped = {};
        filteredArr.forEach(item => {
            const pName = _projectNameOf(item);
            const cName = _contractorNameOf(item);
            const tTitle = _workTypeNameOf(item);
            if (!grouped[pName]) grouped[pName] = {};
            if (!grouped[pName][cName]) grouped[pName][cName] = {};
            if (!grouped[pName][cName][tTitle]) grouped[pName][cName][tTitle] = [];
            grouped[pName][cName][tTitle].push(item);
        });

        const groupKeys = Object.keys(grouped).sort(_histCollator().compare);
        let html = groupKeys.map((pName) => _renderProjectGroupHtml(pName, grouped[pName], !expanded.projects.has(pName))).join('');

        if (HistoryState.pageHasMore) {
            html += `<button id="load-more-history-page-btn" onclick="window.loadMoreHistoryPage()" class="w-full bg-brand-soft text-brand py-3 mt-1 mb-2 rounded-xl text-rbi-caption font-black uppercase tracking-widest active:scale-95 transition-colors border border-brand shadow-sm">
            ${_t('quality.history.btn.load_older', 'Загрузить более старые проверки')}
        </button>
        <div id="history-load-sentinel" class="h-2 -mt-2"></div>`;
        }

        listDiv.innerHTML = html;
        _restoreExpandedHistory(listDiv, expanded);
        // P2-0024: все объекты свёрнуты — список не растёт от догрузки, автодогрузка ждёт раскрытия объекта
        // (как и раньше, при открытии загружена только первая порция; кнопка «Загрузить…» работает всегда).
        HistoryRender._autoLoadPaused = expanded.projects.size === 0;
        HistoryRender._observeLoadSentinel();
    },

    /**
     * Режим «Планы»: объекты → этажи с PDF → RO-оверлей.
     * Точки и счётчики — по `_filterHistoryRecords` (глобальные фильтры Истории).
     */
    renderPlans() {
        const listDiv = document.getElementById('history-plans-list');
        const countEl = document.getElementById('hist-count-total');
        if (!listDiv) return;

        const source = HistoryState.allRecords || [];
        if (source.length === 0) {
            listDiv.innerHTML = `<div class="text-sm text-muted text-center bg-surface p-6 rounded-xl border border-surface">${_t('quality.history.empty.all', 'История пуста.')}</div>`;
            if (countEl) countEl.innerText = '0';
            return;
        }

        const filteredArr = _filterHistoryRecords(source);
        if (countEl) countEl.innerText = filteredArr.length;
        _renderHistoryPlansList(filteredArr);
    },

    /**
     * Догрузка страницы без полной пересборки списка: вставляет только новые
     * строки/группы, сохраняет скролл, чекбоксы и раскрытые аккордеоны.
     * Fallback на render(), если DOM ещё без data-hist-* (пустой/фильтр-empty).
     */
    appendPage(newItems) {
        if (window.currentHistoryViewMode === 'plans') {
            HistoryRender.renderPlans();
            return;
        }
        const listDiv = document.getElementById('history-list');
        const countEl = document.getElementById('hist-count-total');
        const emptyMsg = document.getElementById('hist-empty-msg');
        if (!listDiv) return;

        const filteredAll = _filterHistoryRecords(HistoryState.allRecords);
        if (countEl) countEl.innerText = filteredAll.length;
        if (emptyMsg && HistoryState.allRecords.length > 0) emptyMsg.style.display = 'none';

        if (!listDiv.querySelector('[data-hist-project]')) {
            HistoryRender.render();
            return;
        }

        const incoming = _filterHistoryRecords(newItems || []);
        if (incoming.length === 0) {
            _syncLoadMoreFooter(listDiv);
            return;
        }

        const touchedProjects = new Set();
        const byProject = {};
        incoming.forEach((item) => {
            const pName = _projectNameOf(item);
            const cName = _contractorNameOf(item);
            const tTitle = _workTypeNameOf(item);
            if (!byProject[pName]) byProject[pName] = {};
            if (!byProject[pName][cName]) byProject[pName][cName] = {};
            if (!byProject[pName][cName][tTitle]) byProject[pName][cName][tTitle] = [];
            byProject[pName][cName][tTitle].push(item);
        });

        Object.keys(byProject).forEach((pName) => {
            let card = _findHistCard(listDiv, pName);
            if (!card) {
                _insertProjectCardSorted(listDiv, _renderProjectGroupHtml(pName, byProject[pName], true), pName);
                touchedProjects.add(pName);
                return;
            }
            // P2-0024: тело объекта ещё не нарисовано — строки появятся при раскрытии, здесь только счётчики.
            const lazyBody = card.querySelector('[data-hist-project-body][data-hist-lazy="1"]');
            if (lazyBody) {
                touchedProjects.add(pName);
                return;
            }

            Object.keys(byProject[pName]).forEach((cName) => {
                const cBody = _ensureContractorBlock(card, cName);
                if (!cBody) return;
                Object.keys(byProject[pName][cName]).forEach((tTitle) => {
                    const wtBody = _ensureWorkTypeBlock(cBody, tTitle);
                    if (!wtBody) return;
                    byProject[pName][cName][tTitle].forEach((item) => {
                        _insertRowIntoWorkType(wtBody, item);
                    });
                });
            });
            touchedProjects.add(pName);
        });

        touchedProjects.forEach((pName) => {
            _updateProjectCardStats(_findHistCard(listDiv, pName), pName, filteredAll);
        });

        _syncLoadMoreFooter(listDiv);
    },

    /**
     * Автопагинация по скроллу: следит за сентинелом в конце списка через
     * IntersectionObserver и, когда он попадает в область видимости (пользователь
     * доскроллил почти до конца), запускает ту же докачку страницы, что и кнопка
     * "Загрузить более старые проверки" — без дублирования логики загрузки.
     * Наблюдатель пересоздаётся при каждом render() (сентинел — новый DOM-узел).
     */
    _observeLoadSentinel() {
        if (HistoryRender._sentinelObserver) {
            HistoryRender._sentinelObserver.disconnect();
            HistoryRender._sentinelObserver = null;
        }

        const sentinel = document.getElementById('history-load-sentinel');
        if (!sentinel || typeof IntersectionObserver !== 'function') return;
        if (HistoryRender._autoLoadPaused) return;

        const observer = new IntersectionObserver((entries) => {
            const isVisible = entries.some(e => e.isIntersecting);
            if (isVisible && HistoryState.pageHasMore && !HistoryState.isLoadingPage) {
                // P2-0024: свёрнутые объекты не растут от догрузки (меняются только счётчики) — если список
                // не стал длиннее, автодогрузку останавливаем, иначе она подтянула бы в память всю историю.
                // Раскрытие объекта включает её снова (_histMaterializeProject); кнопка «Загрузить…» остаётся.
                const listDiv = document.getElementById('history-list');
                const before = listDiv ? listDiv.scrollHeight : 0;
                Promise.resolve(window.loadMoreHistoryPage()).then(() => {
                    if (listDiv && listDiv.scrollHeight <= before) {
                        HistoryRender._autoLoadPaused = true;
                        if (HistoryRender._sentinelObserver) {
                            HistoryRender._sentinelObserver.disconnect();
                            HistoryRender._sentinelObserver = null;
                        }
                    }
                }).catch(() => { /* ignore */ });
            }
        }, { root: null, rootMargin: '600px 0px 0px 0px', threshold: 0 });

        observer.observe(sentinel);
        HistoryRender._sentinelObserver = observer;
    },

    /**
     * Применяет фильтры к вкладке История (или Отчёты).
     * Перенесено из history.legacy.js (изначально app.js, строка 3956).
     * Вызывается из index.html через onchange/onclick inline-обработчиков.
     */
    applyFilters() {
        var periodSelect = document.getElementById('hist-filter-period');
        var periodLabel = document.getElementById('btn-hist-period-label');
        if (periodSelect && periodLabel) {
            periodLabel.querySelector('.truncate').innerText =
                periodSelect.options[periodSelect.selectedIndex].text;
        }

        if (window.currentHistoryViewMode === 'reports') {
            if (typeof renderReportsList === 'function') renderReportsList();
        } else if (window.currentHistoryViewMode === 'plans') {
            HistoryRender.renderPlans();
        } else {
            HistoryRender.render();
        }
    },

    /**
     * Обновляет надписи на кнопках мульти-фильтров.
     * Перенесено из history.legacy.js (изначально app.js, строка 3949).
     */
    updateFilters() {
        if (typeof updateFilterButtonLabels === 'function') {
            updateFilterButtonLabels();
        }
    },

    /**
     * Открывает модальное окно с деталями проверки.
     * Перенесено из history.legacy.js (изначально app.js, строка 2576).
     * Оригинальный синтаксис (template literals) сохранён — конвертация создаёт риск ошибок.
     * Зависимости: HistoryState.allRecords, etalonActsArray, SYSTEM_TEMPLATES, userTemplates,
     *              getFlatList, openEtalonViewer, rbiEscapeAttr, rbiPhotoPlaceholder,
     *              openPhotoViewer, closeModal, generatePrescriptionAi, printEtalonAct,
     *              rbiHydrateLocalImages, modal-overlay, modal-title, modal-body DOM IDs
     */
    renderDetail(id) {
        _historyDetailId = id;
        let sortedArray = [...HistoryState.allRecords].sort((a, b) => new Date(b.date) - new Date(a.date));
        let currIdx = sortedArray.findIndex(x => String(x.id) === String(id));

        if (currIdx === -1) {
            sortedArray = [..._getEtalonActs()].sort((a, b) => new Date(b.date) - new Date(a.date));
            currIdx = sortedArray.findIndex(x => String(x.id) === String(id));
        }

        if (currIdx === -1) return;

        const item = sortedArray[currIdx];
        const newerId = currIdx > 0 ? sortedArray[currIdx - 1].id : null;
        const olderId = currIdx < sortedArray.length - 1 ? sortedArray[currIdx + 1].id : null;

        if (item.templateKey === 'sys_etalon_act') {
            if (typeof openEtalonViewer === 'function') {
                setTimeout(() => openEtalonViewer(item.id), 200);
                return;
            }
        }

        const type = item.templateKey.split('_')[0];
        const key = item.templateKey.replace(type + '_', '');
        const specificChecklist = type === 'sys' && _templates().getSystemTemplates()[key] ? _templates().getSystemTemplates()[key].groups : (_templates().getUserTemplates()[key] ? _templates().getUserTemplates()[key].groups : []);
        const detailDocScore = _getDocumentaryScore(item);

        let nOk = 0, nTotal = 0;

        const resultItems = getFlatList(specificChecklist).filter(i => item.state[i.id]).map(i => {
            nTotal++;
            let stTxt = 'OK', stCls = 'tag-green', cat = `B${i.w}`;
            if (item.state[i.id] === 'ok') nOk++;
            if (item.state[i.id] === 'fail') { stTxt = 'FAIL'; stCls = 'tag-red'; }
            if (item.state[i.id] === 'fail_escalated') { stTxt = '>1.5x (B3)'; stCls = 'tag-red shadow-sm'; cat = 'B3'; }

            let photoHtml = '';
            const itemPhotos = item.photos ? window.normalizeItemPhotos(item.photos[i.id]) : [];
            if (itemPhotos.length > 0) {
                photoHtml = itemPhotos.map(rawPhotoSrc => {
                    const safePhotoSrc = window.rbiEscapeAttr(rawPhotoSrc);
                    return `
        <img 
            src="${window.rbiPhotoPlaceholder}"
            data-local-src="${safePhotoSrc}"
            data-prefer-thumb="1"
            loading="lazy"
            class="mt-2 mr-2 w-20 h-20 object-cover rounded border border-slate-200 shadow-sm cursor-pointer"
            onclick="openPhotoViewer('${safePhotoSrc}')"
        >`;
                }).join('');
            }

            let extraData = '';
            if (item.details && item.details[i.id]) {
                const d = item.details[i.id];
                if (d.fact && d.tol) extraData += `<div class="text-rbi-caption font-bold text-orange-600 mt-1">${_t('quality.history.detail.fact_tol', 'Факт: {fact} при допуске {tol} (Превышение {x}x)', { fact: d.fact + d.unit, tol: d.tol + d.unit, x: (d.fact / d.tol).toFixed(1) })}</div>`;
                if (d.comment) extraData += `<div class="text-rbi-caption text-muted italic mt-1">${d.comment}</div>`;
            }

            return `<div class="border-b border-surface py-2.5"><div class="flex items-start justify-between gap-3"><div class="text-rbi-label font-bold text-ink leading-snug"><span class="weight-tag wt-${i.w}">${cat}</span> ${i.n}${extraData}</div><span class="status-tag ${stCls}">${stTxt}</span></div>${photoHtml}</div>`;
        }).join('');

        const modal = document.getElementById('modal-overlay');
        const detailPlace = _placeLabelForItem(item);
        document.getElementById('modal-title').innerHTML = `
    <div class="flex justify-between items-center w-full">
        <button class="p-2 -ml-2 text-muted hover:text-brand disabled:opacity-20 active:scale-90" ${newerId ? `onclick="showHistoryDetail('${newerId}')"` : 'disabled'}><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M15 19l-7-7 7-7"></path></svg></button>
        <div class="text-center truncate flex-1 px-2 text-lg dark:text-white" title="${_escAttr(detailPlace)}">${_escHtml(detailPlace)}</div>
        <button class="p-2 -mr-2 text-muted hover:text-brand disabled:opacity-20 active:scale-90" ${olderId ? `onclick="showHistoryDetail('${olderId}')"` : 'disabled'}><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7 7"></path></svg></button>
    </div>`;

        document.getElementById('modal-body').innerHTML = `
        <div class="text-xs font-bold text-muted mb-1">${item.contractorName}</div>
        <div class="text-rbi-caption font-bold text-brand mb-1">${item.templateTitle}</div>
        ${item.checkedStagesInfo ? `<div class="text-rbi-caption bg-surface p-2 rounded mt-2 mb-2 text-muted font-bold leading-snug"><span class="text-muted uppercase tracking-widest block mb-1">${_t('quality.history.detail.checked_stages', 'Проверенные этапы:')}</span> ${item.checkedStagesInfo.join('<br>')}</div>` : ''}
        <div class="text-rbi-caption text-muted mb-4">${new Date(item.date).toLocaleString('ru-RU')}</div>
        
        <div class="grid grid-cols-2 gap-3 mb-4">
            <div class="bg-surface p-3 rounded-xl border border-surface shadow-sm flex flex-col justify-center">
                <div class="text-rbi-caption text-muted uppercase font-bold mb-1">${_t('quality.history.detail.urk_physical', 'УрК Изделия (физика)')}</div>
                <div class="text-3xl font-black ${item.metrics.isDanger ? 'text-danger' : (item.metrics.final < 85 ? 'text-orange-500' : 'text-green-600')}">${item.metrics.final}%</div>
            </div>
            <div class="bg-surface p-3 rounded-xl border border-surface shadow-sm flex flex-col justify-center">
                <div class="text-rbi-caption text-muted uppercase font-bold mb-1">${_t('quality.history.detail.urk_doc', 'УрК Документации')}</div>
                <div class="text-3xl font-black ${detailDocScore === null ? 'text-muted' : (detailDocScore < 70 ? 'text-danger' : (detailDocScore < 85 ? 'text-orange-500' : 'text-green-600'))}">${detailDocScore === null ? '—' : detailDocScore + '%'}</div>
            </div>
        </div>
        
        ${item.metrics.reason ? `<div class="text-rbi-caption font-bold text-danger mb-3 bg-danger-soft p-3 rounded-lg border border-danger-soft shadow-sm">${item.metrics.reason}</div>` : ''}
        
        ${item.templateKey === 'sys_etalon_act'
                ? `<div class="bg-brand-soft border border-brand rounded-xl p-3 mb-4 text-center shadow-sm">
                   <div class="text-rbi-caption font-black text-brand uppercase tracking-widest mb-2">${_t('quality.history.detail.etalon_badge', 'Это Акт-Эталон')}</div>
                   <button onclick="closeModal(); setTimeout(() => window.printEtalonAct('${item.id}'), 300)" class="w-full bg-brand text-white py-3.5 rounded-xl font-black text-rbi-body uppercase tracking-widest active:scale-95 shadow-md flex items-center justify-center gap-2">
                       ${_t('quality.history.detail.print_etalon', '🖨️ РАСПЕЧАТАТЬ (PDF)')}
                   </button>
               </div>`
                : `<button onclick="closeModal(); setTimeout(() => window.printInspectionAct('${item.id}', 'browser'), 300)" class="w-full mb-2 bg-brand text-white py-3.5 rounded-xl font-black text-rbi-label uppercase tracking-widest active:scale-95 shadow-md flex items-center justify-center gap-2">
                   ${_t('quality.history.detail.print_act', '🖨️ Печать акта осмотра (PDF)')}
               </button>
               <button onclick="closeModal(); setTimeout(() => window.RBI.services.ai.generatePrescriptionAi('${item.id}'), 300)" class="w-full mb-4 bg-slate-800 text-white dark:bg-surface py-3.5 rounded-xl font-black text-rbi-label uppercase tracking-widest active:scale-95 shadow-md flex items-center justify-center gap-2">
                   ${_t('quality.history.detail.ai_prescription', '📄 Создать предписание (ИИ)')}
               </button>`
            }
        
        <div class="bg-surface border border-surface rounded-xl p-3 mb-4">
            <div class="text-rbi-caption font-bold text-muted uppercase mb-2 border-b border-surface pb-1">${_t('quality.history.detail.breakdown', 'Инженерный breakdown')}</div>
            <div class="grid grid-cols-2 gap-2 text-xs text-ink">
                <div>${_t('quality.history.detail.checked', 'Проверено:')} <b>${nTotal} из ${item.metrics.totalCount}</b></div>
                <div>${_t('quality.history.detail.passed', 'Соответствует:')} <b class="text-green-600">${nOk}</b></div>
                <div>${_t('quality.history.detail.failed', 'Нарушения:')} <b class="text-danger">${nTotal - nOk}</b></div>
                <div class="col-span-2 text-rbi-caption mt-1">B1: <b>${item.metrics.n_B1_fail}</b> | B2: <b>${item.metrics.n_B2_fail}</b> | B3: <b>${item.metrics.n_B3_fail}</b></div>
                <div class="col-span-2 text-rbi-caption font-mono bg-surface border border-surface p-1.5 rounded mt-1 text-center font-bold">${_t('quality.history.detail.formula', 'Формула:')} ${item.metrics.baseUrkPerc}% × ${item.metrics.kc.toFixed(2)} × ${item.metrics.kcrit.toFixed(2)} = ${item.metrics.final}%</div>
            </div>
        </div>
        <div class="text-rbi-label font-bold text-muted uppercase mb-2 mt-6">${_t('quality.history.detail.items', 'Детализация проверки')}</div>
        <div class="pb-6">${resultItems}</div>
    `;

        document.body.classList.add('modal-open');
        modal.style.display = 'flex';

        if (typeof window.rbiHydrateLocalImages === 'function') {
            setTimeout(() => {
                window.rbiHydrateLocalImages(document.getElementById('modal-body'));
            }, 50);
        }
    }
};

if (typeof window !== 'undefined') {
    window.HistoryRender = HistoryRender;

    // Прокси для обратной совместимости: inline-обработчики index.html
    // и внешние вызовы из game.js/export.js/sync.js используют глобальные имена.
    window.renderHistoryTab = HistoryRender.render;
    window.rbiHistMaterializeProject = _histMaterializeProject;
    window.rbiHistMaterializeAllProjects = _histMaterializeAllProjects;
    window.rbiHistToggleProject = _histToggleProject;
    window.showHistoryDetail = HistoryRender.renderDetail;
    window.applyHistoryFilters = HistoryRender.applyFilters;
    window.updateAllDynamicFilters = HistoryRender.updateFilters;
    // Постраничная (курсорная) дозагрузка Журнала — делегирует в HistoryActions
    // (window-глобал, не ES import — history.actions.js уже импортирует
    // HistoryRender, обратный импорт создал бы цикл).
    window.loadMoreHistoryPage = function () {
        if (window.HistoryActions && typeof window.HistoryActions.loadNextPage === 'function') {
            return window.HistoryActions.loadNextPage();
        }
    };
}

console.log('[HistoryRender] history.render.js loaded');
