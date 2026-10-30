/* Файл: js/modules/construction/features/construction-core.js */

var _ctx = null;
function bindCtx(ctx) {
    _ctx = ctx;
    bindConstructionCoreActionDelegation();
    bindConstructionCoreI18n();
}

function _objects() {
    try {
        if (_ctx && _ctx.services && _ctx.services.objects) return _ctx.services.objects;
        if (_ctx && _ctx.objects) return _ctx.objects;
    } catch (e) {}
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

function _t(key, fallback) {
    try {
        var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
        if (i18n && typeof i18n.t === 'function') {
            var s = i18n.t(key);
            if (s && s !== key) return s;
        }
    } catch (e) { /* ignore */ }
    return fallback;
}

function bindConstructionCoreI18n() {
    if (window.__constructionCoreI18nBound) return;
    window.__constructionCoreI18nBound = true;
    if (!(window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function')) return;
    window.RBI.events.on('i18n:localeChanged', function () {
        try {
            if (window.ConstManager && typeof window.ConstManager.updateStatusChips === 'function') {
                window.ConstManager.updateStatusChips();
            }
        } catch (_e) { /* ignore */ }
        try {
            if (window.ConstManager && typeof window.ConstManager.renderAdminPanel === 'function') {
                window.ConstManager.renderAdminPanel();
            }
        } catch (_e2) { /* ignore */ }
        try {
            if (window.ConstManager && window.ConstManager.currentView === 'list' && typeof window.ConstManager.renderDefectsList === 'function') {
                window.ConstManager.renderDefectsList();
            }
        } catch (_e3) { /* ignore */ }
    });
}

// Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
// (см. _ai/INDEX_HTML_HANDLERS_MAP.md), namespace-per-module (data-construction-core-action).
// Действия — методы window.ConstManager, не bare window.*-функции.
function bindConstructionCoreActionDelegation() {
    if (window.__constructionCoreActionDelegationBound) return;
    window.__constructionCoreActionDelegationBound = true;

    var dispatch = function (el) {
        var action = el.dataset.constructionCoreAction;
        var fn = window.ConstManager && window.ConstManager[action];
        if (typeof fn !== 'function') return;
        var arg = el.dataset.actionArg;
        if (arg === undefined) {
            fn.call(window.ConstManager);
        } else {
            fn.call(window.ConstManager, arg);
        }
    };

    var resolveActionElement = function (target, wantsChange) {
        var el = target;
        while (el && el.nodeType === 1) {
            if (el.dataset && el.dataset.constructionCoreAction) {
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

function _session() {
    if (_ctx && _ctx.session) return _ctx.session;
    return window.RBI.services.session;
}

function _permissions() {
    if (_ctx && _ctx.permissions) return _ctx.permissions;
    return window.RBI.services.permissions;
}

window.ConstManager = {
    bindCtx: bindCtx,
    objects: [],
    buildings: [],
    floors: [],
    defects: [], // <-- ДОБАВИЛИ МАССИВ ДЛЯ ДЕФЕКТОВ НА ПЛАНАХ

    currentObjId: null,
    currentBldId: null,
    currentFlrId: null,

    // --- НОВОЕ: Переменные фильтров и видов ---
    currentView: 'plan', // 'plan' или 'list'
    activeStatusFilters: [], // Пустой массив = выбраны все
    currentFilterCategory: 'ALL',

    /** Фильтры булавок: единый контракт для renderAllPins (statuses[], category). */
    getPinFilters() {
        const statuses = (this.activeStatusFilters && this.activeStatusFilters.length > 0)
            ? this.activeStatusFilters.slice()
            : null; // null = все статусы
        return {
            statuses: statuses || undefined,
            category: this.currentFilterCategory || 'ALL'
        };
    },

    /**
     * Сопоставить этаж справочника локаций (quality planPin.locationId)
     * с этажом иерархии СК v1 (CONST_FLOORS).
     */
    resolveFloorIdFromLocation(locationFloorId) {
        if (!locationFloorId) return null;
        const locId = String(locationFloorId);
        const floors = this.floors || [];
        if (floors.some((f) => String(f.id) === locId)) return locId;

        const loc = window.RBI && window.RBI.services && window.RBI.services.locations;
        if (!loc || typeof loc.getNode !== 'function') return null;

        const floorNode = loc.getNode(locId);
        if (!floorNode || floorNode._deleted || floorNode.is_deleted) return null;

        // 1) Тот же PDF
        try {
            const plan = typeof loc.getPlanForFloor === 'function' ? loc.getPlanForFloor(locId) : null;
            const pdfUrl = plan && (plan.pdf_url || plan.pdfUrl);
            if (pdfUrl) {
                const byPdf = floors.find((f) => f.pdf_url && String(f.pdf_url) === String(pdfUrl));
                if (byPdf) return byPdf.id;
            }
        } catch (_e) { /* ignore */ }

        // 2) Имя этажа + объект
        const floorName = String(floorNode.displayName || floorNode.name || '').trim().toLowerCase();
        if (!floorName) return null;
        let candidates = floors.filter((f) => String(f.name || '').trim().toLowerCase() === floorName);
        if (!candidates.length) return null;

        if (candidates.length > 1 && typeof loc.getPath === 'function') {
            const path = loc.getPath(locId) || [];
            const objNode = path.find((n) => n && n.nodeType === 'object');
            const objKey = objNode
                ? String(objNode.canonical_key || objNode.id || '')
                : '';
            if (objKey) {
                const narrowed = candidates.filter((f) => {
                    const bld = (this.buildings || []).find((b) => b.id === f.building_id);
                    return bld && String(bld.object_id) === objKey;
                });
                if (narrowed.length) candidates = narrowed;
            }
        }
        return candidates[0] ? candidates[0].id : null;
    },

    /** Починить дефекты без валидного floorId (locationFloorId / прямое совпадение). */
    async healDefectFloorLinks() {
        const floors = this.floors || [];
        const floorIds = new Set(floors.map((f) => String(f.id)));
        let changed = 0;
        for (const d of (this.defects || [])) {
            if (!d || d._deleted) continue;
            const ok = d.floorId && floorIds.has(String(d.floorId));
            if (ok) continue;
            let resolved = null;
            if (d.locationFloorId) {
                resolved = this.resolveFloorIdFromLocation(d.locationFloorId);
            }
            if (!resolved && d.floorId) {
                // floorId мог быть id локации, а не CONST_FLOORS
                resolved = this.resolveFloorIdFromLocation(d.floorId);
            }
            if (!resolved) continue;
            d.floorId = resolved;
            d.updated_at = new Date().toISOString();
            changed += 1;
            try {
                if (_storage().stores().CONST_DEFECTS) {
                    await _storage().put(_storage().stores().CONST_DEFECTS, d);
                }
            } catch (_e) { /* ignore persist */ }
        }
        if (changed) {
            console.log('[ConstManager] healDefectFloorLinks:', changed);
        }
        return changed;
    },

    // C2b: каталог объектов = locations (ObjectDirectory facade), не сырой project_objects.
    async _loadObjectsFromCatalog() {
        const mapOd = (o) => ({
            id: o.canonical_key || o.id,
            name: o.display_name || o.name || o.canonical_key || o.id
        });
        const mapLoc = (n) => ({
            id: n.canonical_key || n.id,
            name: n.displayName || n.display_name || n.name || n.canonical_key || n.id
        });
        const alive = (o) => o && !o._deleted && !o.is_deleted;

        // 1) ObjectDirectory (проекция locations + leftover)
        try {
            var od = _objects();
            if (od) {
                var objList = _objectList();
                if (
                    objList.length === 0 &&
                    typeof od.rebuildFromLocations === 'function'
                ) {
                    await od.rebuildFromLocations();
                }
                const fromOd = _objectList().filter(alive).map(mapOd).filter((o) => o.id && o.name);
                const leftover = _leftoverList().filter(alive).map(mapOd).filter((o) => o.id && o.name);
                if (fromOd.length || leftover.length) {
                    const seen = new Set();
                    return [...fromOd, ...leftover].filter((o) => {
                        if (seen.has(o.id)) return false;
                        seen.add(o.id);
                        return true;
                    });
                }
            }
        } catch (e) {
            console.warn('[ConstManager] ObjectDirectory catalog failed:', e);
        }

        // 2) locations напрямую
        try {
            const loc = window.RBI && window.RBI.services && window.RBI.services.locations;
            if (loc) {
                if (typeof loc.init === 'function') {
                    try { await loc.init(); } catch (_e) { /* ignore */ }
                }
                if (typeof loc.listNodes === 'function') {
                    const nodes = (loc.listNodes({ nodeType: 'object', parentId: null }) || [])
                        .filter(alive)
                        .map(mapLoc)
                        .filter((o) => o.id && o.name);
                    if (nodes.length) return nodes;
                }
            }
        } catch (e) {
            console.warn('[ConstManager] locations catalog failed:', e);
        }

        // 3) Legacy IDB fallback
        try {
            const storedObjs = await _storage().getAll('project_objects');
            return (storedObjs || []).filter(alive).map(mapOd).filter((o) => o.id && o.name);
        } catch (e) {
            console.warn('[ConstManager] project_objects fallback failed:', e);
            return [];
        }
    },

    // 1. Инициализация (загрузка данных из БД)
    async init() {
        console.log('[ConstManager] Загрузка иерархии планов...');
        try {
            // Грузим из локальной IndexedDB
            if (typeof dbGetAll !== 'undefined') {
                this.objects = await this._loadObjectsFromCatalog();

                const b = await _storage().getAll(_storage().stores().CONST_BUILDINGS);
                this.buildings = (b || []).filter(x => !x._deleted);

                const f = await _storage().getAll(_storage().stores().CONST_FLOORS);
                this.floors = (f || []).filter(x => !x._deleted);

                const d = await _storage().getAll(_storage().stores().CONST_DEFECTS);
                this.defects = (d || []).filter(x => !x._deleted);

                // --- Загрузка заявок на приемку ---
                if (window.ConstAcceptance && typeof window.ConstAcceptance.init === 'function') {
                    // Запуск модуля приемки происходит асинхронно при открытии вкладки,
                    // но мы можем подстраховаться и загрузить базу здесь
                    const reqs = await _storage().getAll(_storage().stores().CONST_ACCEPTANCE);
                    if (reqs) window.ConstAcceptance.requests = reqs.filter(x => !x._deleted);
                }

                for (const def of this.defects) {
                    if (!def.id || !def.photo) continue;

                    if (String(def.photo).startsWith('data:') && typeof window.ensureLocalPhotoRef === 'function') {
                        def.photo = await window.ensureLocalPhotoRef(def.photo, 'const', {
                            entityType: 'construction_defect',
                            entityId: def.id
                        });
                        await _storage().put(_storage().stores().CONST_DEFECTS, def);
                    }

                    _session().setPhotoRaw(def.id, def.photo);
                }

                await this.healDefectFloorLinks();
            }
        } catch (e) {
            console.error('[ConstManager] Ошибка загрузки БД:', e);
        }

        if (!window.__constManagerLocationsListenerBound) {
            window.__constManagerLocationsListenerBound = true;
            document.addEventListener('locations:changed', function () {
                if (!window.ConstManager || typeof window.ConstManager._loadObjectsFromCatalog !== 'function') return;
                window.ConstManager._loadObjectsFromCatalog().then(function (objs) {
                    window.ConstManager.objects = objs || [];
                    window.ConstManager.renderSelectors();
                    if (window.ConstAdmin && typeof window.ConstAdmin.renderTree === 'function') {
                        try { window.ConstAdmin.renderTree(); } catch (_e) { /* ignore */ }
                    }
                }).catch(function () { /* ignore */ });
            });
        }

        this.renderAdminPanel();
        this.renderSelectors();
        this.updateStatusChips(); // <-- ДОБАВИЛИ ЭТО
    },

    // 2. Отрисовка кнопки "Администрирование" (Только для Админа)
    renderAdminPanel() {
        const adminContainer = document.getElementById('const-admin-btn-container');
        if (!adminContainer) return;

        // Проверяем роль (в будущем добавится engineer_sk)
        const role = _permissions() ? _permissions().getCurrentRole() : 'guest';
        const isManager = _permissions() ? _permissions().canManageHierarchy() : ['manager', 'director', 'deputy_manager'].includes(role);

        if (isManager) {
            adminContainer.innerHTML = `
                <button onclick="window.ConstAdmin.openModal()" class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg shadow-md active:scale-95 text-[10px] font-black uppercase whitespace-nowrap flex items-center gap-1 transition-transform">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    ${_t('construction.admin.hierarchy', 'Управление иерархией')}
                </button>
            `;
        } else {
            adminContainer.innerHTML = '';
        }
    },

    // 3. Заполнение селекторов (выпадающих списков)
    renderSelectors() {
        const objSel = document.getElementById('const-object-select');
        const bldSel = document.getElementById('const-building-select');
        const flrSel = document.getElementById('const-floor-select');
        const layerSel = document.getElementById('const-layer-select');
        if (!objSel || !bldSel || !flrSel) return;

        // --- ОБЪЕКТЫ ---
        let objHtml = '<option value="">-- Выберите объект --</option>';
        if (this.objects.length === 0) {
            objHtml = '<option value="">Нет объектов</option>';
        } else {
            this.objects.sort((a, b) => a.name.localeCompare(b.name)).forEach(o => {
                objHtml += `<option value="${o.id}">${o.name}</option>`;
            });
        }
        objSel.innerHTML = objHtml;
        if (this.currentObjId && this.objects.find(o => o.id === this.currentObjId)) {
            objSel.value = this.currentObjId;
        } else {
            this.currentObjId = null;
            objSel.value = '';
        }

        // --- КОРПУСА ---
        this.updateBuildingSelector();

        // --- ЭТАЖИ ---
        this.updateFloorSelector();
        // --- СЛОИ ---
        if (layerSel) {
            // Если он пустой, инициализируем
            if (layerSel.options.length === 0) {
                layerSel.innerHTML = `
                    <option value="ALL">Слой: Все дефекты</option>
                    <option value="SMR">Слой: Только СМР (Строительство)</option>
                    <option value="OT">Слой: Охрана труда и ПБ</option>
                    <option value="ZONES">Слой: Зоны приемки работ</option>
                `;
            }
            // Запоминаем выбранный слой
            if (!this.currentLayer) this.currentLayer = 'ALL';
            layerSel.value = this.currentLayer;
        }
    },

    updateBuildingSelector() {
        const bldSel = document.getElementById('const-building-select');
        if (!bldSel) return;

        if (!this.currentObjId) {
            bldSel.innerHTML = '<option value="">Сначала выберите объект</option>';
            bldSel.disabled = true;
            this.currentBldId = null;
            return;
        }

        const validBlds = this.buildings.filter(b => b.object_id === this.currentObjId);

        if (validBlds.length === 0) {
            bldSel.innerHTML = '<option value="">Корпусов нет</option>';
            bldSel.disabled = true;
            this.currentBldId = null;
            return;
        }

        let html = '<option value="">-- Выберите корпус --</option>';
        validBlds.sort((a, b) => a.sort_order - b.sort_order).forEach(b => {
            html += `<option value="${b.id}">${b.name}</option>`;
        });

        bldSel.innerHTML = html;
        bldSel.disabled = false;

        if (this.currentBldId && validBlds.find(b => b.id === this.currentBldId)) {
            bldSel.value = this.currentBldId;
        } else {
            this.currentBldId = null;
            bldSel.value = '';
        }
    },

    updateFloorSelector() {
        const flrSel = document.getElementById('const-floor-select');
        if (!flrSel) return;

        if (!this.currentBldId) {
            flrSel.innerHTML = '<option value="">Сначала выберите корпус</option>';
            flrSel.disabled = true;
            this.currentFlrId = null;
            this.clearPdfView();
            return;
        }

        const validFlrs = this.floors.filter(f => f.building_id === this.currentBldId);

        if (validFlrs.length === 0) {
            flrSel.innerHTML = '<option value="">Этажей нет</option>';
            flrSel.disabled = true;
            this.currentFlrId = null;
            this.clearPdfView();
            return;
        }

        let html = '<option value="">-- Выберите этаж --</option>';
        validFlrs.sort((a, b) => a.sort_order - b.sort_order).forEach(f => {
            html += `<option value="${f.id}">${f.name}</option>`;
        });

        flrSel.innerHTML = html;
        flrSel.disabled = false;

        if (this.currentFlrId && validFlrs.find(f => f.id === this.currentFlrId)) {
            flrSel.value = this.currentFlrId;
            // Учитываем текущий вид (План или Реестр)
            if (this.currentView === 'plan') {
                this.loadPdfForFloor(this.currentFlrId);
            } else {
                this.renderDefectsList();
            }
        } else {
            this.currentFlrId = null;
            flrSel.value = '';
            this.clearPdfView();
            if (this.currentView === 'list') this.renderDefectsList();
        }
    },

    // 4. Обработчики изменений (onchange)
    onObjectChange() {
        this.currentObjId = document.getElementById('const-object-select').value;
        this.currentBldId = null;
        this.currentFlrId = null;
        this.updateBuildingSelector();
        this.updateFloorSelector();
        this.updateStatusChips(); // <-- ДОБАВИЛИ
    },

    onBuildingChange() {
        this.currentBldId = document.getElementById('const-building-select').value;
        this.currentFlrId = null;
        this.updateFloorSelector();
        this.updateStatusChips(); // <-- ДОБАВИЛИ
    },

    onFloorChange() {
        this.currentFlrId = document.getElementById('const-floor-select').value;
        if (this.currentFlrId) {
            if (this.currentView === 'plan') {
                this.loadPdfForFloor(this.currentFlrId);
            } else {
                this.renderDefectsList();
            }
        } else {
            this.clearPdfView();
            if (this.currentView === 'list') this.renderDefectsList();
        }
        this.updateStatusChips(); // <-- ДОБАВИЛИ
    },
    onLayerChange() {
        const layerSel = document.getElementById('const-layer-select');
        if (!layerSel) return;
        this.currentLayer = layerSel.value;
        
        // Перерисовываем точки с учетом нового слоя
        if (this.currentFlrId) {
            window.ConstDefectForm.renderAllPins(this.currentFlrId, this.getPinFilters());
        }
    },
    // 5. Логика отображения PDF
    clearPdfView() {
        this._pdfLoadToken = (this._pdfLoadToken || 0) + 1;
        const placeholder = document.getElementById('const-plan-placeholder');
        const renderArea = document.getElementById('const-pdf-render-area');
        const oldBtn = document.getElementById('interactive-plan-btn');
        if (oldBtn) oldBtn.remove();

        if (placeholder) placeholder.classList.remove('hidden');
        if (renderArea) {
            renderArea.classList.add('hidden');
            renderArea.innerHTML = '';
        }
    },

    async loadPdfForFloor(floorId) {
        const placeholder = document.getElementById('const-plan-placeholder');
        const renderArea = document.getElementById('const-pdf-render-area');

        if (!placeholder || !renderArea) return;

        const floor = this.floors.find(f => String(f.id) === String(floorId));
        if (!floor || !floor.pdf_url) {
            this.clearPdfView();
            if (typeof showToast === 'function') showToast('⚠️ У этого этажа нет загруженного плана');
            return;
        }

        // Токен против гонки: быстрое переключение этажей не должно рисовать чужие булавки
        const loadToken = (this._pdfLoadToken = (this._pdfLoadToken || 0) + 1);
        const isStale = () => this._pdfLoadToken !== loadToken || String(this.currentFlrId || '') !== String(floorId);

        // Показываем лоадер и разрешаем скролл
        placeholder.innerHTML = `<div class="animate-pulse">Загрузка PDF плана...</div>`;
        placeholder.classList.remove('hidden');
        renderArea.classList.add('hidden');
        renderArea.innerHTML = '';
        renderArea.classList.remove('touch-none'); // Разрешаем скроллить план пальцем!
        this.currentFlrId = floorId;

        try {
            // 1. Достаем файл (единый офлайн-стор PhotoManager / IDB)
            let pdfArrayBuffer = null;
            if (typeof window.rbiLoadCloudPdfArrayBuffer === 'function') {
                pdfArrayBuffer = await window.rbiLoadCloudPdfArrayBuffer(floor.pdf_url);
            } else if (typeof PhotoManager !== 'undefined' && typeof PhotoManager.getAsyncUrl === 'function') {
                const cachedUrl = await PhotoManager.getAsyncUrl(floor.pdf_url);
                if (isStale()) return;
                if (cachedUrl && cachedUrl.startsWith('blob:')) {
                    const res = await fetch(cachedUrl);
                    pdfArrayBuffer = await res.arrayBuffer();
                }
            }
            if (!pdfArrayBuffer) {
                if (!navigator.onLine) throw new Error('Нет интернета, а план не кэширован');
                const res = await fetch(floor.pdf_url);
                if (!res.ok) throw new Error('Не удалось скачать файл');
                pdfArrayBuffer = await res.arrayBuffer();
            }
            if (isStale()) return;

            // 2. Рендерим PDF
            const pdfjs = window.rbiPdfjs ? await window.rbiPdfjs() : window.pdfjsLib;
            const pdf = await pdfjs.getDocument({ data: pdfArrayBuffer }).promise;
            const page = await pdf.getPage(1);
            if (isStale()) return;

            const containerWidth = renderArea.clientWidth || window.innerWidth - 40;
            const baseViewport = page.getViewport({ scale: 1 });
            const scale = containerWidth / baseViewport.width;
            const viewport = page.getViewport({ scale: scale * 1.5 }); // Хорошее качество

            // ЖЕСТКАЯ ПРИВЯЗКА КООРДИНАТ: Создаем обертку строго по размеру холста
            const wrapperDiv = document.createElement('div');
            wrapperDiv.className = 'relative w-full';
            wrapperDiv.style.lineHeight = '0'; // Убираем пустое пространство под картинкой

            const canvas = document.createElement('canvas');
            canvas.className = 'w-full h-auto'; // План занимает 100% ширины
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport: viewport }).promise;
            if (isStale()) return;

            wrapperDiv.appendChild(canvas);

            // КОНТЕЙНЕР БУЛАВОК (Находится внутри жесткой обертки, точки 100% не съедут)
            const pinsContainer = document.createElement('div');
            pinsContainer.id = 'preview-pdf-pins';
            pinsContainer.className = 'absolute top-0 left-0 w-full h-full pointer-events-none';
            pinsContainer.dataset.floorId = String(floorId);
            wrapperDiv.appendChild(pinsContainer);

            // 3. Добавляем всё это в область рендера
            renderArea.appendChild(wrapperDiv);

            // 4. Плавающая кнопка Интерактивного плана
            const safeName = floor.name.replace(/'/g, "\\'");
            const oldBtn = document.getElementById('interactive-plan-btn');
            if (oldBtn) oldBtn.remove();

            // Сжимаем область чертежа снизу на 70px, чтобы освободить место для кнопки и избежать перекрытия
            renderArea.style.bottom = '70px';

            const btnHtml = `
                <div id="interactive-plan-btn" class="absolute bottom-4 left-0 right-0 flex justify-center z-10 pointer-events-none">
                    <button onclick="window.UniversalPdfViewer.open('${floor.pdf_url}', 'План: ${safeName}', '${floor.id}')" class="pointer-events-auto bg-indigo-600 text-white px-5 py-3.5 rounded-2xl shadow-[0_5px_15px_rgba(79,70,229,0.4)] active:scale-95 text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-transform border border-indigo-400">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        Интерактивный план
                    </button>
                </div>
            `;
            // Добавляем кнопку к главному контейнеру
            document.getElementById('const-plan-container').insertAdjacentHTML('beforeend', btnHtml);

            // 5. Показываем результат, затем булавки (контейнер уже в DOM и видим)
            placeholder.classList.add('hidden');
            renderArea.classList.remove('hidden');
            if (window.ConstDefectForm && typeof window.ConstDefectForm.renderAllPins === 'function') {
                window.ConstDefectForm.renderAllPins(floorId, this.getPinFilters());
            }

        } catch (e) {
            if (isStale()) return;
            console.error('[ConstManager] Ошибка рендера PDF:', e);
            placeholder.innerHTML = `<div class="text-red-500 font-bold text-[10px] uppercase text-center p-4">❌ Ошибка загрузки PDF<br><span class="text-slate-500 lowercase normal-case font-normal mt-1 block">${e.message}</span></div>`;
        }
    },
    // === НОВОЕ: Переключение видов и фильтры ===
    switchView(view) {
        this.currentView = view;
        const btnPlan = document.getElementById('const-btn-view-plan');
        const btnList = document.getElementById('const-btn-view-list');
        const planCont = document.getElementById('const-plan-container');
        const listCont = document.getElementById('const-list-container');

        if (!btnPlan || !btnList || !planCont || !listCont) return;

        if (view === 'plan') {
            btnPlan.className = "flex-1 sm:flex-none px-4 py-1.5 rounded-md text-[11px] font-black uppercase transition-all bg-white dark:bg-slate-800 text-indigo-600 shadow-sm";
            btnList.className = "flex-1 sm:flex-none px-4 py-1.5 rounded-md text-[11px] font-black uppercase transition-all text-slate-500 dark:text-slate-400";
            planCont.classList.remove('hidden');
            listCont.classList.add('hidden');
            // Перерисовываем точки на плане с учетом фильтров
            if (this.currentFlrId && window.ConstDefectForm && typeof window.ConstDefectForm.renderAllPins === 'function') {
                window.ConstDefectForm.renderAllPins(this.currentFlrId, this.getPinFilters());
            }
        } else {
            btnList.className = "flex-1 sm:flex-none px-4 py-1.5 rounded-md text-[11px] font-black uppercase transition-all bg-white dark:bg-slate-800 text-indigo-600 shadow-sm";
            btnPlan.className = "flex-1 sm:flex-none px-4 py-1.5 rounded-md text-[11px] font-black uppercase transition-all text-slate-500 dark:text-slate-400";
            planCont.classList.add('hidden');
            listCont.classList.remove('hidden');
            this.renderDefectsList(); // Рисуем список при переключении
        }
    },

    applyFilters() {
        const categoryEl = document.getElementById('const-filter-category');
        if (categoryEl) this.currentFilterCategory = categoryEl.value;

        if (this.currentView === 'plan') {
            if (this.currentFlrId && window.ConstDefectForm && typeof window.ConstDefectForm.renderAllPins === 'function') {
                window.ConstDefectForm.renderAllPins(this.currentFlrId, this.getPinFilters());
            }
        } else {
            this.renderDefectsList();
        }
        this.updateStatusChips(); // Обновляем счетчики при смене категории
    },

    exportDefectsToExcel() {
        let filtered = this.defects;
        let fileNamePrefix = "Все_Объекты";

        // Фильтрация по иерархии
        if (this.currentFlrId) {
            filtered = filtered.filter(d => d.floorId === this.currentFlrId);
            fileNamePrefix = this.floors.find(f => f.id === this.currentFlrId)?.name || 'Этаж';
        } else if (this.currentBldId) {
            const bldFloors = this.floors.filter(f => f.building_id === this.currentBldId).map(f => f.id);
            filtered = filtered.filter(d => bldFloors.includes(d.floorId));
            fileNamePrefix = this.buildings.find(b => b.id === this.currentBldId)?.name || 'Корпус';
        } else if (this.currentObjId) {
            const objBuildings = this.buildings.filter(b => b.object_id === this.currentObjId).map(b => b.id);
            const objFloors = this.floors.filter(f => objBuildings.includes(f.building_id)).map(f => f.id);
            filtered = filtered.filter(d => objFloors.includes(d.floorId));
            fileNamePrefix = this.objects.find(o => o.id === this.currentObjId)?.name || 'Объект';
        }

        // Умная фильтрация перед выгрузкой (по статусу и категории)
        // Умная фильтрация перед выгрузкой (по статусу и категории)
        if (this.activeStatusFilters.length > 0) {
            filtered = filtered.filter(d => this.activeStatusFilters.includes(d.status));
        }
        if (this.currentFilterCategory && this.currentFilterCategory !== 'ALL') {
            filtered = filtered.filter(d => d.category === this.currentFilterCategory);
        }

        if (filtered.length === 0) return showToast('⚠️ Нет данных для выгрузки');

        const statusNames = { 'issued': 'Выдано', 'in_progress': 'В работе', 'fixed': 'Устранено (Ждет СК)', 'closed': 'Закрыто', 'rejected': 'Отклонено СК' };

        // Собираем данные со всей историей статусов
        const dataToExport = filtered.map((d, index) => {
            let dateFixed = '-';
            let dateClosed = '-';
            let commentsArr = [];

            if (d.history && d.history.length > 0) {
                const fixedRecord = d.history.find(h => h.status === 'fixed');
                if (fixedRecord) dateFixed = new Date(fixedRecord.date).toLocaleString('ru-RU');

                const closedRecord = d.history.find(h => h.status === 'closed');
                if (closedRecord) dateClosed = new Date(closedRecord.date).toLocaleString('ru-RU');

                d.history.forEach(h => {
                    if (h.comment) commentsArr.push(`[${statusNames[h.status] || h.status}] ${h.user}: ${h.comment}`);
                });
            }

            // Ищем привязки по ID этажа
            const flr = window.ConstManager.floors.find(f => f.id === d.floorId);
            const bld = flr ? window.ConstManager.buildings.find(b => b.id === flr.building_id) : null;
            const obj = bld ? window.ConstManager.objects.find(o => o.id === bld.object_id) : null;

            return {
                "№": index + 1,
                "Объект": obj?.name || '-',
                "Корпус": bld?.name || '-',
                "Этаж": flr?.name || '-',
                "Координаты (X, Y)": `${parseFloat(d.x).toFixed(1)}%, ${parseFloat(d.y).toFixed(1)}%`,
                "Статус": statusNames[d.status] || d.status,
                "Категория": d.category,
                "Ответственный подрядчик": d.contractor || '-',
                "Вид работ": d.templateKey ? (_templates().getSystemTemplates()[d.templateKey.replace('sys_', '')]?.title || _templates().getUserTemplates()[d.templateKey.replace('user_', '')]?.title || d.templateKey) : '-',
                "Нарушение": d.itemName,
                "Норматив": d.normText ? d.normText.replace(/<\/?[^>]+(>|$)/g, "").replace(/<br>/g, "\n") : '-',
                "Уточнение": d.description || '-',
                "Срок устранения": d.deadline ? new Date(d.deadline).toLocaleDateString('ru-RU') : '-',
                "Дата выдачи": new Date(d.created_at).toLocaleString('ru-RU'),
                "Дата устранения (Факт)": dateFixed,
                "Дата закрытия": dateClosed,
                "Автор": d.created_by || '-',
                "История комментариев": commentsArr.join('\n')
            };
        });

        try {
            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Реестр");
            
            // Безопасное имя файла
            const safeName = fileNamePrefix.replace(/[/\\?%*:|"<>]/g, '-');
            XLSX.writeFile(workbook, `Реестр_СК_${safeName}_${new Date().toLocaleDateString('ru-RU')}.xlsx`);
            showToast("✅ Полный реестр успешно выгружен в Excel!");
        } catch (e) {
            console.error(e);
            showToast("❌ Ошибка при формировании Excel файла");
        }
    },

    renderDefectsList() {
        const container = document.getElementById('const-list-container');
        if (!container) return;

        if (!this.defects || !Array.isArray(this.defects)) {
            container.innerHTML = `<div class="text-center py-10 text-slate-400 font-bold text-[11px] uppercase tracking-widest bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">Ошибка загрузки данных</div>`;
            return;
        }

        // --- УМНАЯ ФИЛЬТРАЦИЯ ИЕРАРХИИ ---
        let filtered = this.defects;
        let locationTitle = "Все объекты";

        // Если выбран этаж - показываем только этот этаж
        if (this.currentFlrId) {
            filtered = filtered.filter(d => String(d.floorId) === String(this.currentFlrId));
            const flrName = this.floors.find(f => String(f.id) === String(this.currentFlrId))?.name || 'Этаж';
            locationTitle = `Уровень: ${flrName}`;
        } 
        // Если выбран только корпус - показываем все этажи корпуса
        else if (this.currentBldId) {
            const bldFloors = this.floors.filter(f => f.building_id === this.currentBldId).map(f => String(f.id));
            filtered = filtered.filter(d => bldFloors.includes(String(d.floorId)));
            const bldName = this.buildings.find(b => b.id === this.currentBldId)?.name || 'Корпус';
            locationTitle = `Уровень: ${bldName} (Все этажи)`;
        } 
        // Если выбран только объект - показываем все корпуса объекта
        else if (this.currentObjId) {
            const objBuildings = this.buildings.filter(b => b.object_id === this.currentObjId).map(b => b.id);
            const objFloors = this.floors.filter(f => objBuildings.includes(f.building_id)).map(f => String(f.id));
            filtered = filtered.filter(d => objFloors.includes(String(d.floorId)));
            const objName = this.objects.find(o => o.id === this.currentObjId)?.name || 'Объект';
            locationTitle = `Уровень: ${objName} (Весь объект)`;
        }

        // --- СЧЕТЧИКИ СТАТУСОВ ---
        let countOpen = 0, countFixed = 0, countClosed = 0, countRejected = 0;
        filtered.forEach(d => {
            if (d.status === 'issued' || d.status === 'in_progress') countOpen++;
            else if (d.status === 'fixed') countFixed++;
            else if (d.status === 'closed') countClosed++;
            else if (d.status === 'rejected') countRejected++;
        });

        // HTML заглушка для шапки реестра
        const statsHtml = `
            <div class="flex justify-between items-center mb-3">
                <div class="text-[10px] font-black uppercase text-slate-500 tracking-widest">${locationTitle}</div>
            </div>
        `;

        // --- ПРИМЕНЕНИЕ ВЫБРАННЫХ ФИЛЬТРОВ ---
        if (this.activeStatusFilters.length > 0) {
            filtered = filtered.filter(d => this.activeStatusFilters.includes(d.status));
        }
        if (this.currentFilterCategory && this.currentFilterCategory !== 'ALL') {
            filtered = filtered.filter(d => d.category === this.currentFilterCategory);
        }

        // Сортировка: Сначала красные (B3), потом новые

        // Сортировка: Сначала красные (B3), потом новые
        // Вычисляем порядковые номера (от самых старых к новым), чтобы они совпадали с планом
        const allDefectsForFloor = this.defects.filter(d => String(d.floorId) === String(this.currentFlrId));
        const originalIndexes = new Map();
        allDefectsForFloor.forEach((d, i) => originalIndexes.set(d.id, i + 1));
        filtered.sort((a, b) => {
            if (a.category === 'B3' && b.category !== 'B3') return -1;
            if (b.category === 'B3' && a.category !== 'B3') return 1;
            const dateA = a.created_at ? new Date(a.created_at) : 0;
            const dateB = b.created_at ? new Date(b.created_at) : 0;
            return dateB - dateA;
        });

        const statusNames = {
            'issued': _t('construction.status.issued', 'Выдано'),
            'in_progress': _t('construction.status.in_progress', 'В работе'),
            'fixed': _t('construction.form.status_fixed', 'Устранено'),
            'closed': _t('construction.status.closed', 'Закрыто'),
            'rejected': _t('construction.status.rejected', 'Отклонено')
        };
        const statusColors = {
            'issued': 'text-red-600 bg-red-50 border-red-200',
            'in_progress': 'text-blue-600 bg-blue-50 border-blue-200',
            'fixed': 'text-yellow-600 bg-yellow-50 border-yellow-200',
            'closed': 'text-green-600 bg-green-50 border-green-200',
            'rejected': 'text-slate-600 bg-slate-50 border-slate-200'
        };
        const noPhotoLabel = _t('construction.registry.no_photo', 'Нет<br>фото');
        const showOnPlanLabel = _t('construction.registry.show_on_plan', 'Показать на плане');
        const deadlinePrefix = _t('construction.registry.deadline_prefix', 'До:');
        const deadlineUnset = _t('construction.registry.deadline_unset', 'Не указан');
        const contractorUnset = _t('construction.registry.contractor_unset', 'Подрядчик не указан');

        container.innerHTML = filtered.map(d => {
            const photoRef = d.photo || '';
            const photoHtml = photoRef
                ? `<img ${(typeof window.rbiBuildPhotoImgAttrs === 'function')
                    ? window.rbiBuildPhotoImgAttrs(photoRef, { preferThumb: true })
                    : ('src="' + (typeof window.getPhotoSrc === 'function' ? window.getPhotoSrc(photoRef) : photoRef) + '"')} loading="lazy" class="w-16 h-16 object-cover rounded-lg border border-slate-200 cursor-pointer shadow-sm shrink-0" onclick="event.stopPropagation(); window.ConstDefectForm.openDefectPhoto('${d.id}')">`
                : `<div class="w-16 h-16 bg-slate-100 dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-[8px] text-slate-400 font-bold uppercase shrink-0 text-center leading-tight">${noPhotoLabel}</div>`;

            let catColor = 'bg-blue-500';
            if (d.category === 'B2') catColor = 'bg-orange-500';
            if (d.category === 'B3') catColor = 'bg-red-600';

            const deadlineText = d.deadline ? new Date(d.deadline).toLocaleDateString('ru-RU') : deadlineUnset;

            return `
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm flex flex-col cursor-pointer hover:border-indigo-400 transition-colors" onclick="window.ConstDefectForm && window.ConstDefectForm.openExisting && window.ConstDefectForm.openExisting('${d.id}')">
                <div class="flex gap-3 mb-2 border-b border-slate-100 dark:border-slate-700 pb-2">
                    ${photoHtml}
                    <div class="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                            <div class="flex items-start justify-between gap-2 mb-1">
                                <div class="text-[12px] font-black text-slate-800 dark:text-white truncate leading-tight flex items-center gap-1.5">
                                    <span class="${catColor} text-white px-1.5 py-0.5 rounded text-[8px] tracking-widest">${d.category}</span>
                                    <span class="truncate">№${originalIndexes.get(d.id)}: ${d.itemName}</span>
                                </div>
                                <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded border ${statusColors[d.status]} shrink-0">${statusNames[d.status] || d.status}</span>
                            </div>
                            <div class="text-[10px] text-slate-500 truncate font-medium">${d.contractor || contractorUnset}</div>
                        </div>
                        <div class="mt-1 flex justify-between items-center">
                            <div class="text-[9px] font-bold text-slate-400 flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> ${deadlinePrefix} ${deadlineText}</div>
                            <div class="text-[9px] font-bold text-slate-400">${new Date(d.created_at).toLocaleDateString('ru-RU')}</div>
                        </div>
                    </div>
                </div>
                
                <!-- НОВАЯ КНОПКА ПОИСКА НА ПЛАНЕ -->
                <div class="flex justify-end mt-1">
                    <button onclick="event.stopPropagation(); window.ConstManager.focusOnPin('${d.id}')" class="bg-indigo-50 text-indigo-600 border border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase active:scale-95 transition-transform shadow-sm flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        ${showOnPlanLabel}
                    </button>
                </div>
            </div>`;
        }).join('');

        if (typeof window.rbiHydrateLocalImages === 'function') {
            window.rbiHydrateLocalImages(container);
        }
    },
    // --- Поиск и фокусировка на конкретной точке на интерактивном плане ---
    // --- Поиск и фокусировка на конкретной точке на интерактивном плане ---
    focusOnPin(defectId) {
        const defect = this.defects.find(d => d.id === defectId);
        if (!defect) return;

        if (this.currentFlrId !== defect.floorId) {
            const floor = this.floors.find(f => f.id === defect.floorId);
            if (floor) {
                this.currentObjId = this.buildings.find(b => b.id === floor.building_id)?.object_id;
                this.currentBldId = floor.building_id;
                this.currentFlrId = floor.id;
                this.renderSelectors();
            }
        }

        this.switchView('plan');
        const floor = this.floors.find(f => f.id === defect.floorId);
        if (!floor) return;

        const safeName = floor.name.replace(/'/g, "\\'");
        
        // НОВОЕ: Передаем defectId четвертым параметром прямо в просмотрщик!
        window.UniversalPdfViewer.open(floor.pdf_url, `План: ${safeName}`, floor.id, defectId);
    },
    // ==========================================
    // ИНТЕРАКТИВНЫЕ ЧИПСЫ СТАТУСОВ (iOS STYLE)
    // ==========================================
    updateStatusChips() {
        const container = document.getElementById('const-status-chips-container');
        if (!container) return;

        // 1. Собираем базу дефектов по текущей иерархии
        let baseDefects = this.defects;
        if (this.currentFlrId) {
            baseDefects = baseDefects.filter(d => String(d.floorId) === String(this.currentFlrId));
        } else if (this.currentBldId) {
            const bldFloors = this.floors.filter(f => f.building_id === this.currentBldId).map(f => String(f.id));
            baseDefects = baseDefects.filter(d => bldFloors.includes(String(d.floorId)));
        } else if (this.currentObjId) {
            const objBuildings = this.buildings.filter(b => b.object_id === this.currentObjId).map(b => b.id);
            const objFloors = this.floors.filter(f => objBuildings.includes(f.building_id)).map(f => String(f.id));
            baseDefects = baseDefects.filter(d => objFloors.includes(String(d.floorId)));
        }

        // Если применен фильтр категорий (B1/B2/B3), учитываем его в счетчиках
        if (this.currentFilterCategory && this.currentFilterCategory !== 'ALL') {
            baseDefects = baseDefects.filter(d => d.category === this.currentFilterCategory);
        }

        // 2. Считаем количество
        const counts = { issued: 0, in_progress: 0, fixed: 0, closed: 0, rejected: 0 };
        baseDefects.forEach(d => { if (counts[d.status] !== undefined) counts[d.status]++; });

        // 3. Стили для iOS дизайна (Мягкие тона для активных, белые для неактивных)
        const STYLES = {
            issued: {
                active: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400',
                badgeActive: 'bg-red-600 text-white',
            },
            in_progress: {
                active: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400',
                badgeActive: 'bg-blue-600 text-white',
            },
            fixed: {
                active: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400',
                badgeActive: 'bg-orange-500 text-white',
            },
            closed: {
                active: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400',
                badgeActive: 'bg-green-600 text-white',
            },
            rejected: {
                active: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300',
                badgeActive: 'bg-slate-500 text-white',
            }
        };

        const inactiveClass = 'bg-white text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
        const inactiveBadgeClass = 'bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-500 border border-slate-200 dark:border-slate-700';

        // 4. Рисуем кнопки
        const createChip = (statusKey, label) => {
            const isActive = this.activeStatusFilters.includes(statusKey);
            const isAllMode = this.activeStatusFilters.length === 0;
            const visuallyActive = isAllMode || isActive;
            
            const btnClass = visuallyActive ? STYLES[statusKey].active : inactiveClass;
            const badgeClass = visuallyActive ? STYLES[statusKey].badgeActive : inactiveBadgeClass;
            const shadow = visuallyActive ? 'shadow-sm' : '';

            return `
                <button onclick="window.ConstManager.toggleStatusFilter('${statusKey}')" 
                        class="shrink-0 px-3 py-1.5 rounded-xl border text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 active:scale-95 ${btnClass} ${shadow}">
                    ${label} 
                    <span class="${badgeClass} px-1.5 py-0.5 rounded-md text-[9px] font-black tracking-widest min-w-[20px] text-center">
                        ${counts[statusKey] || 0}
                    </span>
                </button>
            `;
        };

        container.innerHTML = `
            ${createChip('issued', _t('construction.status.issued', 'Выдано'))}
            ${createChip('in_progress', _t('construction.status.in_progress', 'В работе'))}
            ${createChip('fixed', _t('construction.status.fixed', 'На проверке'))}
            ${createChip('closed', _t('construction.status.closed', 'Закрыто'))}
            ${createChip('rejected', _t('construction.status.rejected', 'Отклонено'))}
        `;
    },

    toggleStatusFilter(statusKey) {
        const idx = this.activeStatusFilters.indexOf(statusKey);
        if (idx > -1) {
            this.activeStatusFilters.splice(idx, 1); // Выключаем
        } else {
            this.activeStatusFilters.push(statusKey); // Включаем
        }
        
        // Если выбрали все 5, сбрасываем фильтр (режим "Все")
        if (this.activeStatusFilters.length === 5) {
            this.activeStatusFilters = [];
        }

        this.updateStatusChips();
        this.applyFilters();
    }
};
