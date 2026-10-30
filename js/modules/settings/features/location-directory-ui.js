/**
 * location-directory-ui.js
 * UI справочника локаций/планов (Настройки) → service.locations.
 * Legacy ConstAdmin не используется.
 */

function _t(key, fallback, vars) {
    try {
        var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
        if (i18n && typeof i18n.t === 'function') {
            var s = i18n.t(key, vars);
            if (s && s !== key) return s;
        }
    } catch (_e) { /* ignore */ }
    if (vars && typeof fallback === 'string') {
        return fallback.replace(/\{(\w+)\}/g, function (_, name) {
            return vars[name] != null ? String(vars[name]) : '{' + name + '}';
        });
    }
    return fallback;
}

let _delegationBound = false;
let _selectedId = null;
/** Свёрнутость дерева: id узлов, у которых дети раскрыты. */
const _expandedIds = new Set();

function _objects() {
    return (window.RBI && window.RBI.services && window.RBI.services.objects) || null;
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

function _svc() {
    return (window.RBI && window.RBI.services && window.RBI.services.locations) || null;
}

function _unitsSvc() {
    return (window.RBI && window.RBI.services && window.RBI.services.constructionUnits) || null;
}

function _perm() {
    return (window.RBI && window.RBI.services && window.RBI.services.permissions) || null;
}

function _toast(msg) {
    const toastFn = window['showToast'];
    if (typeof toastFn === 'function') toastFn(msg);
}

function _escape(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _canEdit() {
    const p = _perm();
    return !!(p && (p.isAdmin?.() || p.canManageHierarchy?.()));
}

/** P2-0054: места проекта ведёт «Компания → Объекты и места» — здесь просмотр и планы. */
const CORE_PLACES_HREF = '#/settings/company/objects';
function _isCoreLed(svc, id) {
    return !!(svc && typeof svc.isCoreLed === 'function' && svc.isCoreLed(id));
}
function _corePlacesHtml() {
    return `<div data-loc-dir-core-places class="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 p-3 space-y-2">
            <div class="text-[11px] font-bold text-teal-800 dark:text-teal-300">${_escape(_t('settings.admin.locations.core_places_v2', 'Места и PDF-планы этого проекта ведутся в «Компания → Объекты и места». Здесь — просмотр.'))}</div>
            <a href="${CORE_PLACES_HREF}" class="inline-block bg-teal-600 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase">${_escape(_t('settings.admin.locations.core_places_link', 'Править в Компании →'))}</a>
        </div>`;
}
/** P2-0057: план места ядра загружается в «Компании» (документ ядра с версиями) — здесь ссылка вместо загрузки. */
function _corePlanLinkHtml() {
    return `<a href="${CORE_PLACES_HREF}" data-loc-dir-core-plan class="inline-block bg-teal-600 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase">${_escape(_t('settings.admin.locations.core_plan_link', 'Загрузить в Компании →'))}</a>`;
}

function _childType(parentType) {
    if (!parentType) return 'object';
    if (parentType === 'object') return 'building';
    if (parentType === 'building') return 'section';
    if (parentType === 'section') return 'floor';
    if (parentType === 'floor') return 'apartment';
    return null;
}

function _defaultChildName(child) {
    if (child === 'apartment') return '1';
    if (child === 'section') return _t('settings.admin.locations.default_section', 'Секция 1');
    if (child === 'floor') return _t('settings.admin.locations.default_floor', 'Этаж 1');
    if (child === 'building') return _t('settings.admin.locations.default_building', 'Корпус 1');
    return _t('settings.admin.locations.default_new', 'Новый');
}

/** Создать operational unit для нового apartment (1:1). */
async function _ensureUnitForApartment(apartmentNode) {
    const units = _unitsSvc();
    if (!units || !apartmentNode?.id) return;
    await units.init?.();
    const existing = typeof units.list === 'function' ? units.list({ locationId: apartmentNode.id }) : [];
    if (existing && existing.length) return existing[0];
    return units.create({
        locationId: apartmentNode.id,
        name: apartmentNode.displayName || 'КВ',
        type: 'КВ',
        sort_order: apartmentNode.sort_order != null ? Number(apartmentNode.sort_order) : 0,
        status: 'not_inspected'
    });
}

/** Синхронизировать имя unit при переименовании apartment. */
async function _syncUnitNameForApartment(apartmentId, name) {
    const units = _unitsSvc();
    if (!units || !apartmentId) return;
    await units.init?.();
    const linked = typeof units.list === 'function' ? units.list({ locationId: apartmentId }) : [];
    for (const u of linked || []) {
        if (u && u.name !== name) {
            await units.update(u.id, { name });
        }
    }
}

/** Linked operational unit для apartment (1:1). */
function _linkedUnitForApartment(apartmentId) {
    const units = _unitsSvc();
    if (!units || !apartmentId || typeof units.list !== 'function') return null;
    const linked = units.list({ locationId: apartmentId }) || [];
    return linked[0] || null;
}

function _treePlanMark(svc, n) {
    if (n.nodeType === 'floor') {
        const plan = svc.getPlanForFloor(n.id);
        return plan?.pdf_url ? '📄' : '⚠️';
    }
    if (n.nodeType === 'apartment') {
        const unit = _linkedUnitForApartment(n.id);
        return unit?.pdf_url ? '📄' : '⚠️';
    }
    if (n.nodeType === 'object' && typeof svc.resolveObjectLink === 'function') {
        const link = svc.resolveObjectLink({
            locationObjectId: n.id,
            canonical_key: n.canonical_key,
            displayName: n.displayName
        });
        return link && link.linked ? '🔗' : '⛓';
    }
    return '';
}

function _odLinkBlockHtml(svc, node, can) {
    if (!node || node.nodeType !== 'object') return '';
    const key = String(node.canonical_key || '').trim();
    // C2b: SoT = locations; OD — facade-проекция
    return `<div class="border-t border-slate-200 dark:border-slate-700 pt-3 mt-2 space-y-2">
        <div class="text-[10px] font-black uppercase text-slate-500">${_escape(_t('settings.admin.locations.catalog_title', 'Каталог объектов (C2b)'))}</div>
        <div class="text-[11px] text-teal-700 font-bold">${_escape(_t('settings.admin.locations.sot_locations', 'SoT: locations.object'))}</div>
        <div class="text-[10px] text-slate-400">${_escape(_t('settings.admin.locations.key_facade', 'key: {key} · ObjectDirectory = facade', { key: key || '—' }))}</div>
    </div>`;
}


function _migrateBannerHtml(svc) {
    const p = _perm();
    const isAdmin = !!(p && p.isAdmin?.());
    if (!isAdmin) return '';
    let leftover = 0;
    try {
        var od = _objects();
        if (od) {
            leftover = _leftoverList().length;
        } else if (typeof svc.listUnlinkedObjects === 'function') {
            leftover = ((svc.listUnlinkedObjects() || {}).odOnly || []).length;
        }
    } catch (_e) { /* ignore */ }
    if (!leftover) {
        return `<div class="border-b border-slate-200 dark:border-slate-700 p-2 text-[10px] text-slate-500 font-bold">
            ${_escape(_t('settings.admin.locations.migrate_ok', 'C2b: каталог объектов = locations (OD leftover: 0)'))}
        </div>`;
    }
    return `<div class="border-b border-amber-200 dark:border-amber-800 p-2 space-y-1 bg-amber-50/50 dark:bg-amber-950/20">
        <div class="text-[10px] font-black uppercase text-amber-800 dark:text-amber-300">
            ${_escape(_t('settings.admin.locations.migrate_leftover', 'OD leftover: {count} (локальный IDB без peer в locations)', { count: leftover }))}
        </div>
        <div class="text-[10px] text-slate-600 dark:text-slate-300">
            ${_escape(_t('settings.admin.locations.migrate_hint', 'Apply миграции отключён (C2b). Создавайте/правьте объекты только здесь. Sync project_objects выключен.'))}
        </div>
    </div>`;
}

function _formatMigrateReport(rep) {
    if (!rep) return '';
    const err = (rep.errors || []).slice(0, 5).map((e) => `  · ${e.key}: ${e.message}`).join('\n');
    return [
        `${rep.dryRun ? '[dry-run]' : '[apply]'} created=${rep.created} linked=${rep.linked} synonyms=${rep.updatedSynonyms} skipped=${rep.skipped} errors=${(rep.errors || []).length}`,
        err
    ].filter(Boolean).join('\n');
}

/** Раскрыть предков выбранного узла (чтобы он был виден в дереве). */
function _expandAncestors(svc, nodeId) {
    if (!svc || !nodeId) return;
    let cur = svc.getNode(nodeId);
    while (cur && cur.parentId) {
        _expandedIds.add(cur.parentId);
        cur = svc.getNode(cur.parentId);
    }
}

function _renderTreeHtml(svc) {
    const objects = svc.listNodes({ nodeType: 'object', parentId: null });
    if (!objects.length) {
        return '<div class="p-4 text-[11px] text-slate-400 font-bold uppercase tracking-widest text-center">' + _escape(_t('settings.admin.locations.tree_empty', 'Дерево пусто — создайте объект')) + '</div>';
    }
    if (_selectedId) _expandAncestors(svc, _selectedId);

    let html = '<ul class="space-y-1 text-[12px]">';
    const walk = (nodes, depth) => {
        for (const n of nodes) {
            const sel = _selectedId === n.id ? 'bg-teal-100 dark:bg-teal-900/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800';
            const mark = _treePlanMark(svc, n);
            const kids = svc.getChildren(n.id);
            const hasKids = kids.length > 0;
            const open = hasKids && _expandedIds.has(n.id);
            const pad = 8 + depth * 12;

            html += `<li>`;
            html += `<div class="flex items-center gap-0.5" style="padding-left:${pad}px">`;
            if (hasKids) {
                html += `<button type="button" data-loc-dir-action="toggle-expand" data-id="${_escape(n.id)}"
                    class="shrink-0 w-5 h-5 flex items-center justify-center rounded text-[10px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="${_escape(open ? _t('settings.admin.locations.collapse', 'Свернуть') : _t('settings.admin.locations.expand', 'Развернуть'))}" aria-expanded="${open ? 'true' : 'false'}">${open ? '▾' : '▸'}</button>`;
            } else {
                html += `<span class="shrink-0 w-5" aria-hidden="true"></span>`;
            }
            html += `<button type="button" data-loc-dir-action="select" data-id="${_escape(n.id)}"
                    class="flex-1 min-w-0 text-left px-2 py-1 rounded-lg ${sel}">
                    <span class="text-[9px] uppercase text-slate-400 mr-1">${_escape(n.nodeType)}</span>
                    ${mark} ${_escape(n.displayName)}${!n.parentId && _isCoreLed(svc, n.id) ? ` <span class="ml-1 text-[9px] font-black uppercase text-teal-700 dark:text-teal-300 bg-teal-100 dark:bg-teal-900/40 rounded px-1.5 py-0.5">${_escape(_t('settings.admin.locations.core_places_chip', 'места — в Компании'))}</span>` : ''}
                </button>`;
            html += `</div>`;
            if (hasKids && open) {
                html += '<ul class="mt-0.5">';
                walk(kids, depth + 1);
                html += '</ul>';
            }
            html += `</li>`;
        }
    };
    walk(objects, 0);
    html += '</ul>';
    return html;
}

function _editorHtml(svc) {
    const can = _canEdit();
    const node = _selectedId ? svc.getNode(_selectedId) : null;
    if (!node) {
        return `<div class="p-4 space-y-3">
            <p class="text-[11px] text-slate-500">${_escape(_t('settings.admin.locations.select_or_create', 'Выберите узел слева или создайте корень.'))}</p>
            ${can ? `<button type="button" data-loc-dir-action="create-root"
                class="bg-teal-600 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase">${_escape(_t('settings.admin.locations.add_object', '+ Объект'))}</button>` : ''}
            <a href="#/construction-v2" class="block text-[10px] font-black uppercase text-indigo-600 mt-2">${_escape(_t('settings.admin.locations.open_sk', 'Открыть СК (новый) →'))}</a>
        </div>`;
    }
    const next = _childType(node.nodeType);
    // P2-0054: проект «Компании» — места только просмотр (ЖК сам по себе переименовывается, как раньше)
    const core = _isCoreLed(svc, node.id);
    const lockPlace = core && !(node.nodeType === 'object' && !node.parentId);
    const plan = node.nodeType === 'floor' ? svc.getPlanForFloor(node.id) : null;
    const aptUnit = node.nodeType === 'apartment' ? _linkedUnitForApartment(node.id) : null;
    const aptPdfUrl = aptUnit?.pdf_url && String(aptUnit.pdf_url).startsWith('http') ? String(aptUnit.pdf_url) : '';
    return `<div class="p-4 space-y-3">
        <div class="text-[10px] font-black uppercase text-teal-700">${_escape(node.nodeType)}</div>
        <input id="loc-dir-name" type="text" value="${_escape(node.displayName)}"
            class="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-[12px] bg-transparent" ${can && !lockPlace ? '' : 'disabled'} />
        ${can && lockPlace ? _corePlacesHtml() : can && core ? `<div class="flex flex-wrap gap-2">
            <button type="button" data-loc-dir-action="save" data-id="${_escape(node.id)}"
                class="bg-slate-800 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase">${_escape(_t('settings.admin.locations.save', 'Сохранить'))}</button>
        </div>${_corePlacesHtml()}` : can ? `<div class="flex flex-wrap gap-2">
            <button type="button" data-loc-dir-action="save" data-id="${_escape(node.id)}"
                class="bg-slate-800 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase">${_escape(_t('settings.admin.locations.save', 'Сохранить'))}</button>
            ${next ? `<button type="button" data-loc-dir-action="add-child" data-id="${_escape(node.id)}" data-child="${next}"
                class="bg-teal-600 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase">+ ${_escape(next)}</button>` : ''}
            <button type="button" data-loc-dir-action="delete" data-id="${_escape(node.id)}"
                class="bg-red-50 text-red-600 border border-red-200 px-3 py-2 rounded-xl text-[10px] font-black uppercase">${_escape(_t('settings.admin.locations.delete', 'Удалить'))}</button>
        </div>` : ''}
        ${node.nodeType === 'floor' ? `
            <div class="border-t border-slate-200 dark:border-slate-700 pt-3 mt-2">
                <div class="text-[10px] font-black uppercase text-slate-500 mb-2">${_escape(_t('settings.admin.locations.pdf_plan', 'PDF-план'))}</div>
                ${plan?.pdf_url
                    ? `<div class="text-[11px] mb-2">📄 ${_escape(plan.pdf_name || 'plan.pdf')}
                        <a href="${_escape(plan.pdf_url)}" target="_blank" class="text-indigo-600 ml-2">${_escape(_t('settings.admin.locations.open', 'открыть'))}</a></div>`
                    : '<div class="text-[11px] text-amber-600 mb-2">' + _escape(_t('settings.admin.locations.plan_missing', 'План не загружен')) + '</div>'}
                ${can && core ? _corePlanLinkHtml() : can ? `<input id="loc-dir-pdf" type="file" accept="application/pdf" class="text-[11px] w-full" />
                <button type="button" data-loc-dir-action="upload-pdf" data-id="${_escape(node.id)}"
                    class="mt-2 bg-indigo-600 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase">${_escape(_t('settings.admin.locations.upload_pdf', 'Загрузить PDF'))}</button>` : ''}
            </div>` : ''}
        ${node.nodeType === 'apartment' ? `
            <div class="border-t border-slate-200 dark:border-slate-700 pt-3 mt-2">
                <div class="text-[10px] font-black uppercase text-slate-500 mb-2">${_escape(_t('settings.admin.locations.pdf_apt', 'PDF-план квартиры'))}</div>
                ${aptPdfUrl
                    ? `<div class="text-[11px] mb-2">📄 ${_escape(aptUnit.pdf_name || 'plan.pdf')}
                        <a href="${_escape(aptPdfUrl)}" target="_blank" class="text-indigo-600 ml-2">${_escape(_t('settings.admin.locations.open', 'открыть'))}</a></div>`
                    : '<div class="text-[11px] text-amber-600 mb-2">' + _escape(_t('settings.admin.locations.plan_missing', 'План не загружен')) + '</div>'}
                ${can && core ? _corePlanLinkHtml() : can ? `<input id="loc-dir-unit-pdf" type="file" accept="application/pdf" class="text-[11px] w-full" />
                <div class="flex flex-wrap gap-2 mt-2">
                    <button type="button" data-loc-dir-action="upload-unit-pdf" data-id="${_escape(node.id)}"
                        class="bg-indigo-600 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase">${_escape(_t('settings.admin.locations.upload_pdf', 'Загрузить PDF'))}</button>
                    ${aptPdfUrl ? `<button type="button" data-loc-dir-action="clear-unit-pdf" data-id="${_escape(node.id)}"
                        class="bg-slate-50 text-slate-600 border border-slate-200 px-3 py-2 rounded-xl text-[10px] font-black uppercase">${_escape(_t('settings.admin.locations.clear_plan', 'Снять план'))}</button>` : ''}
                </div>` : ''}
            </div>` : ''}
        ${_odLinkBlockHtml(svc, node, can)}
        <button type="button" data-loc-dir-action="create-root"
            class="text-[10px] font-black uppercase text-teal-700 underline">${_escape(_t('settings.admin.locations.more_object', '+ ещё объект'))}</button>
        <a href="#/construction-v2" class="block text-[10px] font-black uppercase text-indigo-600">${_escape(_t('settings.admin.locations.open_sk', 'Открыть СК (новый) →'))}</a>
    </div>`;
}

function _bindDelegation() {
    if (_delegationBound) return;
    _delegationBound = true;
    document.addEventListener('click', async (ev) => {
        const t = ev.target;
        const el = t && t.closest ? t.closest('[data-loc-dir-action]') : null;
        if (!el) return;
        const action = el.getAttribute('data-loc-dir-action');
        const svc = _svc();
        if (!svc || !action) return;
        try {
            await svc.init();
            if (action === 'select') {
                _selectedId = el.getAttribute('data-id');
                _expandAncestors(svc, _selectedId);
                await mountLocationDirectoryUI();
                return;
            }
            if (action === 'toggle-expand') {
                const id = el.getAttribute('data-id');
                if (!id) return;
                if (_expandedIds.has(id)) _expandedIds.delete(id);
                else _expandedIds.add(id);
                await mountLocationDirectoryUI();
                return;
            }
            if (action === 'create-root') {
                const name = prompt(_t('settings.admin.locations.prompt_object', 'Название объекта'), '__SMOKE_TEST__ Object');
                if (!name) return;
                const clean = typeof svc.cleanObjectName === 'function'
                    ? svc.cleanObjectName(name)
                    : String(name || '').toLowerCase().trim();
                const n = await svc.createNode({
                    nodeType: 'object',
                    displayName: name,
                    parentId: null,
                    canonical_key: clean
                });
                _selectedId = n.id;
                // C2b: без shadow OD / createOdFromLocation — SoT уже locations
                var od = _objects();
                if (od && typeof od.rebuildFromLocations === 'function') {
                    try { await od.rebuildFromLocations(); } catch (_e) { /* ignore */ }
                }
                _toast(_t('settings.admin.locations.toast_created', 'Объект создан'));
                await mountLocationDirectoryUI();
                return;
            }
            if (action === 'add-child') {
                const parentId = el.getAttribute('data-id');
                const child = el.getAttribute('data-child');
                const name = prompt(_t('settings.admin.locations.prompt_child', 'Название ({child})', { child: child }), _defaultChildName(child));
                if (!name) return;
                const n = await svc.createNode({ nodeType: child, displayName: name, parentId });
                if (child === 'apartment') {
                    await _ensureUnitForApartment(n);
                }
                _selectedId = n.id;
                _expandedIds.add(parentId);
                _toast(_t('settings.admin.locations.toast_child_created', 'Создано'));
                await mountLocationDirectoryUI();
                return;
            }
            if (action === 'save') {
                const id = el.getAttribute('data-id');
                const inp = document.getElementById('loc-dir-name');
                const displayName = inp ? inp.value : '';
                await svc.updateNode(id, { displayName });
                const node = svc.getNode(id);
                if (node && node.nodeType === 'apartment') {
                    await _syncUnitNameForApartment(id, String(displayName || node.displayName || '').trim());
                }
                _toast(_t('settings.admin.locations.toast_saved', 'Сохранено'));
                await mountLocationDirectoryUI();
                return;
            }
            if (action === 'delete') {
                const id = el.getAttribute('data-id');
                if (!confirm(_t('settings.admin.locations.confirm_delete', 'Удалить узел и всех потомков?'))) return;
                // softDeleteNode(apartment) → softDelete linked unit (см. locations.service)
                await svc.softDeleteNode(id);
                _selectedId = null;
                _toast(_t('settings.admin.locations.toast_deleted', 'Удалено'));
                await mountLocationDirectoryUI();
                return;
            }
            if (action === 'link-od') {
                const id = el.getAttribute('data-id');
                const odKey = el.getAttribute('data-od-key') || '';
                if (typeof svc.linkLocationToOd !== 'function') {
                    _toast(_t('settings.admin.locations.bridge_unavailable', 'Мост OD недоступен'));
                    return;
                }
                await svc.linkLocationToOd(id, odKey || undefined);
                _toast(_t('settings.admin.locations.linked_od', 'Привязано к ObjectDirectory'));
                await mountLocationDirectoryUI();
                return;
            }
            if (action === 'create-od') {
                const id = el.getAttribute('data-id');
                if (typeof svc.createOdFromLocation !== 'function') {
                    _toast(_t('settings.admin.locations.bridge_unavailable', 'Мост OD недоступен'));
                    return;
                }
                await svc.createOdFromLocation(id);
                _toast(_t('settings.admin.locations.created_od', 'Создано в ObjectDirectory'));
                await mountLocationDirectoryUI();
                return;
            }
            if (action === 'create-loc-from-od') {
                if (typeof svc.listUnlinkedObjects !== 'function' || typeof svc.createLocationFromOd !== 'function') {
                    _toast(_t('settings.admin.locations.bridge_unavailable', 'Мост OD недоступен'));
                    return;
                }
                const un = svc.listUnlinkedObjects();
                const odOnly = (un && un.odOnly) || [];
                if (!odOnly.length) {
                    _toast(_t('settings.admin.locations.no_unlinked', 'Нет несвязанных объектов OD'));
                    return;
                }
                const labels = odOnly.map((o, i) => `${i + 1}. ${o.display_name || o.name || o.canonical_key}`).join('\n');
                const pick = prompt(_t('settings.admin.locations.prompt_od_pick', 'Номер ObjectDirectory для создания object:\n{labels}', { labels: labels }), '1');
                if (!pick) return;
                const idx = Number(pick) - 1;
                const chosen = odOnly[idx];
                if (!chosen || !chosen.canonical_key) {
                    _toast(_t('settings.admin.locations.invalid_number', 'Неверный номер'));
                    return;
                }
                const r = await svc.createLocationFromOd(chosen.canonical_key);
                _selectedId = r.locationObject ? r.locationObject.id : _selectedId;
                _toast(_t('settings.admin.locations.created_from_od', 'Объект создан из OD'));
                await mountLocationDirectoryUI();
                return;
            }
            if (action === 'migrate-od-dry' || action === 'migrate-od-apply') {
                _toast(_t('settings.admin.locations.migrate_disabled', 'C2b: Apply миграции отключён — каталог = locations'));
                return;
            }
            if (action === 'upload-pdf') {
                const id = el.getAttribute('data-id');
                const fileInput = document.getElementById('loc-dir-pdf');
                const file = fileInput && fileInput.files && fileInput.files[0];
                if (!file) {
                    _toast(_t('settings.admin.locations.select_pdf', 'Выберите PDF'));
                    return;
                }
                await svc.uploadFloorPdf(id, file);
                _toast(_t('settings.admin.locations.plan_uploaded', 'План загружен'));
                await mountLocationDirectoryUI();
                return;
            }
            if (action === 'upload-unit-pdf') {
                const apartmentId = el.getAttribute('data-id');
                const fileInput = document.getElementById('loc-dir-unit-pdf');
                const file = fileInput && fileInput.files && fileInput.files[0];
                if (!file) {
                    _toast(_t('settings.admin.locations.select_pdf', 'Выберите PDF'));
                    return;
                }
                const units = _unitsSvc();
                if (!units?.uploadUnitPdf) throw new Error('service.constructionUnits недоступен');
                await units.init?.();
                let unit = _linkedUnitForApartment(apartmentId);
                if (!unit) {
                    const node = svc.getNode(apartmentId);
                    unit = await _ensureUnitForApartment(node || { id: apartmentId });
                }
                if (!unit?.id) throw new Error(_t('settings.admin.locations.error', 'Нет linked unit для квартиры'));
                await units.uploadUnitPdf(unit.id, file);
                _toast(_t('settings.admin.locations.apt_plan_uploaded', 'План квартиры загружен'));
                await mountLocationDirectoryUI();
                return;
            }
            if (action === 'clear-unit-pdf') {
                const apartmentId = el.getAttribute('data-id');
                if (!confirm(_t('settings.admin.locations.confirm_clear_apt', 'Снять план квартиры?'))) return;
                const units = _unitsSvc();
                if (!units?.clearUnitPlan) throw new Error('service.constructionUnits недоступен');
                await units.init?.();
                const unit = _linkedUnitForApartment(apartmentId);
                if (!unit?.id) throw new Error(_t('settings.admin.locations.error', 'Нет linked unit для квартиры'));
                await units.clearUnitPlan(unit.id);
                _toast(_t('settings.admin.locations.plan_cleared', 'План снят'));
                await mountLocationDirectoryUI();
            }
        } catch (e) {
            console.error('[LocationDirectoryUI]', e);
            _toast(e.message || _t('settings.admin.locations.error', 'Ошибка'));
        }
    }, true);
}

export async function mountLocationDirectoryUI() {
    _bindDelegation();
    const root = document.getElementById('location-directory-root');
    const section = document.getElementById('location-directory-section');
    if (!root) return;
    const svc = _svc();
    const canView = _canEdit() || !!(_perm() && _perm().isAdmin?.());
    if (section) {
        // Показываем admin / hierarchy managers
        const p = _perm();
        const show = !!(p && (p.isAdmin?.() || p.canManageHierarchy?.()));
        section.classList.toggle('hidden', !show);
        if (!show) return;
    }
    if (!svc) {
        root.innerHTML = '<div class="p-4 text-red-500 text-[11px]">' + _escape(_t('settings.admin.locations.svc_missing', 'service.locations не загружен')) + '</div>';
        return;
    }
    await svc.init();
    const units = _unitsSvc();
    if (units?.init) await units.init();
    root.innerHTML = `<div class="flex flex-col min-h-[280px]">
        ${_migrateBannerHtml(svc)}
        <div class="flex flex-col md:flex-row flex-1">
        <div class="md:w-1/2 border-b md:border-b-0 md:border-r border-teal-200 dark:border-teal-800 p-2 overflow-y-auto max-h-[50vh]" id="loc-dir-tree">
            ${_renderTreeHtml(svc)}
        </div>
        <div class="md:w-1/2" id="loc-dir-editor">${_editorHtml(svc)}</div>
        </div>
    </div>`;
}

export const LocationDirectoryUI = { mount: mountLocationDirectoryUI };
