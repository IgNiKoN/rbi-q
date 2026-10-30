/* Файл: js/modules/construction/features/pdf-viewer.js */

// ============================================================================
// === УНИВЕРСАЛЬНЫЙ PDF-ПРОСМОТРЩИК С PANZOOM (ДВИЖОК ДЛЯ ЧЕРТЕЖЕЙ) ===
// ============================================================================
// ============================================================================
// === УНИВЕРСАЛЬНЫЙ PDF-ПРОСМОТРЩИК С PANZOOM И МАРКЕРАМИ ===
// ============================================================================

var _ctx = null;
function bindCtx(ctx) {
    _ctx = ctx;
    bindPdfViewerActionDelegation();
    bindPdfViewerI18n();
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

var _pdfViewerI18nBound = false;
function bindPdfViewerI18n() {
    if (_pdfViewerI18nBound) return;
    _pdfViewerI18nBound = true;
    if (!(window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function')) return;
    window.RBI.events.on('i18n:localeChanged', function () {
        try {
            var modal = document.getElementById('universal-pdf-modal');
            if (!modal || modal.style.display !== 'flex') return;
            var viewer = window.UniversalPdfViewer;
            if (!viewer) return;
            if (viewer.isZoneMode) viewer.setZoneMode(true);
            else if (viewer.isCopyMode) viewer.setCopyMode(true, viewer.copyTemplateDefect);
            else viewer.setAddMode(viewer.isAddMode);
            var loader = document.getElementById('universal-pdf-loader');
            if (loader && !loader.classList.contains('hidden')) {
                var loaderText = loader.querySelector('div');
                if (loaderText) loaderText.textContent = _t('construction.pdf.loading', 'Загрузка чертежа...');
            }
        } catch (_e) { /* ignore */ }
    });
}

// Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
// (см. _ai/INDEX_HTML_HANDLERS_MAP.md), namespace-per-module (data-pdf-viewer-action).
// Действия — методы window.UniversalPdfViewer, не bare window.*-функции.
function bindPdfViewerActionDelegation() {
    if (window.__pdfViewerActionDelegationBound) return;
    window.__pdfViewerActionDelegationBound = true;

    var dispatch = function (el) {
        var action = el.dataset.pdfViewerAction;
        var fn = window.UniversalPdfViewer && window.UniversalPdfViewer[action];
        if (typeof fn !== 'function') return;
        fn.call(window.UniversalPdfViewer);
    };

    var resolveActionElement = function (target) {
        var el = target;
        while (el && el.nodeType === 1) {
            if (el.dataset && el.dataset.pdfViewerAction) return el;
            var inlineOnclick = el.getAttribute && el.getAttribute('onclick');
            if (inlineOnclick && inlineOnclick.includes('stopPropagation')) return null;
            el = el.parentElement;
        }
        return null;
    };

    document.addEventListener('click', function (e) {
        var el = resolveActionElement(e.target);
        if (!el) return;
        // Не даём всплыть/дойти до legacy btn.onclick — иначе toggleAddMode
        // вызывается дважды за один клик (capture + onclick) и режим сразу сбрасывается.
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        dispatch(el);
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

function _session() {
    if (_ctx && _ctx.session) return _ctx.session;
    return window.RBI.services.session;
}

// =========================================================================
// РАЗМЕТКА МОДАЛКИ «UNIVERSAL PDF VIEWER» (перенос из index.html:1080-1130,
// перенос 30 modal/overlay-блоков #app-modals в JS-рендер). HTML-строка 1:1
// идентична прежней статичной разметке.
// =========================================================================
function renderUniversalPdfModalMarkup() {
    return `
    <div id="universal-pdf-modal"
        class="fixed inset-0 bg-slate-900/95 z-[9999] hidden flex-col transition-opacity duration-300 opacity-0">
        <!-- Шапка -->
        <div class="bg-indigo-600 text-white p-4 flex justify-between items-center shadow-md z-20 shrink-0">
            <div class="font-black text-sm uppercase tracking-widest truncate pr-4" id="universal-pdf-title">${_t('construction.pdf.floor_plan', 'План этажа')}
            </div>
            <button data-pdf-viewer-action="close"
                class="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center active:scale-90 shrink-0 border border-indigo-400 font-bold">✕</button>
        </div>

        <!-- Панель инструментов (Тулбар) -->
        <div id="universal-pdf-toolbar"
            class="bg-[var(--card-bg)] border-b border-[var(--card-border)] p-3 flex justify-between items-center z-20 shrink-0 shadow-sm hidden">
            <div id="pdf-add-hint"
                class="text-[10px] font-bold text-slate-500 uppercase tracking-widest hidden animate-pulse">${_t('construction.pdf.hint_click_drawing', 'Кликните на чертеж ➔')}</div>
            <div id="pdf-normal-hint" class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">${_t('construction.pdf.view_mode', 'Режим просмотра')}</div>

            <button id="pdf-btn-add-defect" data-pdf-viewer-action="toggleAddMode"
                class="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase active:scale-95 shadow-sm transition-colors flex items-center gap-1.5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path>
                </svg> ${_t('construction.pdf.add_defect', 'Добавить дефект')}
            </button>
        </div>

        <!-- Контейнер для Panzoom -->
        <div class="flex-1 relative overflow-hidden touch-none" id="universal-pdf-wrapper">
            <div id="universal-pdf-container" class="absolute top-0 left-0 shadow-2xl">
                <!-- Сам рендер PDF (холст) -->
                <canvas id="universal-pdf-canvas" class="block"></canvas>
                <!-- Слой поверх PDF, куда будут падать точки (булавки) дефектов -->
                <div id="universal-pdf-pins" class="absolute inset-0 pointer-events-none"></div>
            </div>
        </div>

        <!-- Лоадер -->
        <div id="universal-pdf-loader"
            class="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 text-white z-30 hidden backdrop-blur-sm">
            <svg class="animate-spin h-10 w-10 mb-4 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none"
                viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                </path>
            </svg>
            <div class="font-bold text-xs uppercase tracking-widest animate-pulse">${_t('construction.pdf.loading', 'Загрузка чертежа...')}</div>
        </div>
    </div>
`;
}

(function mountUniversalPdfModalMarkup() {
    if (document.getElementById('universal-pdf-modal')) return;
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
        ? window.RBI.services.shell.getModalsRoot()
        : document.getElementById('app-modals');
    if (!root) return;
    root.insertAdjacentHTML('beforeend', renderUniversalPdfModalMarkup());
}());

window.UniversalPdfViewer = {
    bindCtx: bindCtx,
    panzoomInstance: null,
    isAddMode: false,
    currentFloorId: null,
    isCopyMode: false,
    copyTemplateDefect: null,
    _zoomListener: null,
    
    // НОВОЕ ДЛЯ ЗОН ПРИЕМКИ
    isZoneMode: false,
    zoneClicks: [], // Добавили переменную для слушателя зума

    async open(pdfUrl, title, floorId = null, highlightDefectId = null) {
        this.currentFloorId = floorId;
        window.ConstManager.currentFlrId = floorId; // Дублируем в менеджер для надежности

        const modal = document.getElementById('universal-pdf-modal');
        const titleEl = document.getElementById('universal-pdf-title');
        const loader = document.getElementById('universal-pdf-loader');
        const wrapper = document.getElementById('universal-pdf-wrapper');
        const container = document.getElementById('universal-pdf-container');
        const canvas = document.getElementById('universal-pdf-canvas');
        const toolbar = document.getElementById('universal-pdf-toolbar');

        if (!modal || !canvas) return;

        titleEl.innerText = title || _t('construction.pdf.view_document', 'Просмотр документа');

        // Если передан floorId, значит мы открыли план этажа -> показываем тулбар
        if (floorId) {
            toolbar.classList.remove('hidden');
            
            // Динамически добавляем кнопку "Выделить зону", если её еще нет
            if (!document.getElementById('pdf-btn-add-zone')) {
                const btnContainer = toolbar.querySelector('button').parentElement;
                btnContainer.insertAdjacentHTML('afterbegin', `
                    <button id="pdf-btn-add-zone" onclick="window.UniversalPdfViewer.toggleZoneMode()" class="bg-blue-50 text-blue-600 border border-blue-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase active:scale-95 shadow-sm transition-colors flex items-center gap-1.5 mr-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> ${_t('construction.pdf.select_zone', 'Выделить зону')}
                    </button>
                `);
            }
        } else {
            toolbar.classList.add('hidden');
        }

        modal.style.display = 'flex';
        document.body.classList.add('modal-open');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);

        loader.classList.remove('hidden');
        container.style.visibility = 'hidden';

        if (this.panzoomInstance) {
            this.panzoomInstance.destroy();
            this.panzoomInstance = null;
        }

        this.setAddMode(false);

        try {
            let pdfArrayBuffer = null;
            if (typeof window.rbiLoadCloudPdfArrayBuffer === 'function') {
                pdfArrayBuffer = await window.rbiLoadCloudPdfArrayBuffer(pdfUrl);
            } else {
                if (typeof PhotoManager !== 'undefined' && typeof PhotoManager.getAsyncUrl === 'function') {
                    const cachedUrl = await PhotoManager.getAsyncUrl(pdfUrl);
                    if (cachedUrl && cachedUrl.startsWith('blob:')) {
                        const res = await fetch(cachedUrl);
                        pdfArrayBuffer = await res.arrayBuffer();
                    }
                }
                if (!pdfArrayBuffer) {
                    if (navigator.onLine === false) throw new Error('PDF не кэширован офлайн');
                    const res = await fetch(pdfUrl);
                    if (!res.ok) throw new Error('Не удалось скачать файл');
                    pdfArrayBuffer = await res.arrayBuffer();
                }
            }

            const pdf = await pdfjsLib.getDocument({ data: pdfArrayBuffer }).promise;
            const page = await pdf.getPage(1);

            const viewport = page.getViewport({ scale: 2.5 });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            container.style.width = `${viewport.width}px`;
            container.style.height = `${viewport.height}px`;

            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport: viewport }).promise;

            // Вычисляем размеры для масштаба
            const cw = wrapper.clientWidth || window.innerWidth;
            const ch = wrapper.clientHeight || window.innerHeight;
            
            const scaleX = cw / viewport.width;
            const scaleY = ch / viewport.height;
            const initialScale = Math.min(scaleX, scaleY) * 0.95;

            // top-left + default origin 50% 50%; центр через RbiPlanPanzoom.center (не CSS margin / не origin 0 0)
            container.classList.add('top-0', 'left-0');
            container.style.left = '0';
            container.style.top = '0';
            container.style.marginLeft = '0';
            container.style.marginTop = '0';
            container.style.removeProperty('transform-origin');

            const pp = window.RbiPlanPanzoom;
            const pzOpts = pp && typeof pp.baseOptions === 'function'
                ? pp.baseOptions({
                    maxScale: 10,
                    minScale: 0.3,
                    startScale: initialScale,
                    startX: 0,
                    startY: 0
                })
                : {
                    maxScale: 10,
                    minScale: 0.3,
                    step: 0.5,
                    startScale: initialScale,
                    startX: 0,
                    startY: 0,
                    pinchAndPan: true,
                    touchAction: 'none'
                };

            this.panzoomInstance = Panzoom(container, pzOpts);

            // Показываем контейнер
            container.style.visibility = 'visible';
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (pp && this.panzoomInstance) pp.center(this.panzoomInstance, wrapper, container);
                });
            });

            // Рендерим точки дефектов
            if (this.currentFloorId) {
                const filters = (window.ConstManager && typeof window.ConstManager.getPinFilters === 'function')
                    ? window.ConstManager.getPinFilters()
                    : {};
                window.ConstDefectForm.renderAllPins(this.currentFloorId, filters, initialScale, highlightDefectId);
            }

            // --- ОБРАБОТЧИК ЗУМА ДЛЯ КЛАСТЕРОВ ---
            if (this._zoomListener) {
                container.removeEventListener('panzoomzoom', this._zoomListener);
            }
            
            let zoomTimeout;
            this._zoomListener = (e) => {
                clearTimeout(zoomTimeout);
                // Дебаунс 30мс, чтобы план не лагал при активном скролле мышки
                zoomTimeout = setTimeout(() => {
                    const currentScale = e.detail.scale;
                    if (this.currentFloorId) {
                        const filters = (window.ConstManager && typeof window.ConstManager.getPinFilters === 'function')
                            ? window.ConstManager.getPinFilters()
                            : {};
                        window.ConstDefectForm.renderAllPins(this.currentFloorId, filters, currentScale, highlightDefectId);
                    }
                }, 30);
            };
            container.addEventListener('panzoomzoom', this._zoomListener);

            if (this._wheelListener && wrapper) {
                wrapper.removeEventListener('wheel', this._wheelListener);
            }
            this._wheelListener = (e) => {
                if (!this.panzoomInstance) return;
                if (pp) pp.wheelZoom(this.panzoomInstance, e, 0.3, 10);
                else {
                    e.preventDefault();
                    this.panzoomInstance.zoomWithWheel(e, { step: 0.2 });
                }
            };
            wrapper.addEventListener('wheel', this._wheelListener, { passive: false });
            container.onclick = (e) => this.handleCanvasClick(e);

        } catch (e) {
            console.error('[UniversalPdfViewer] Ошибка:', e);
            if (typeof showToast === 'function') showToast(_t('construction.pdf.error_load', '❌ Ошибка: {message}', { message: e.message }));
        } finally {
            loader.classList.add('hidden');
        }
    },

    toggleAddMode() {
        this.setAddMode(!this.isAddMode);
    },

    /** Выход из режима штампа — только через data-pdf-viewer-action (без btn.onclick). */
    endCopyMode() {
        this.setCopyMode(false);
    },

    setAddMode(isActive) {
        this.isAddMode = isActive;
        this.isCopyMode = false;
        
        const btn = document.getElementById('pdf-btn-add-defect');
        const hintAdd = document.getElementById('pdf-add-hint');
        const hintNorm = document.getElementById('pdf-normal-hint');
        const container = document.getElementById('universal-pdf-container');
        if (!btn) return;

        // Единственный путь клика — делегирование data-pdf-viewer-action.
        // btn.onclick здесь раньше давал double-toggle с capture-listener.
        btn.onclick = null;
        btn.setAttribute('data-pdf-viewer-action', 'toggleAddMode');

        if (isActive) {
            btn.className = 'bg-red-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase active:scale-95 shadow-sm transition-colors flex items-center gap-1.5';
            btn.innerHTML = _t('construction.pdf.btn_cancel', 'Отмена');
            hintNorm.classList.add('hidden');
            hintAdd.classList.remove('hidden');
            hintAdd.innerText = _t('construction.pdf.hint_click_drawing', 'Кликните на чертеж ➔');
            hintAdd.className = 'text-[10px] font-bold text-red-500 uppercase tracking-widest animate-pulse';
            if (container) container.style.cursor = 'crosshair';
        } else {
            btn.className = 'bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase active:scale-95 shadow-sm transition-colors flex items-center gap-1.5';
            btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg> ' + _t('construction.pdf.add_defect', 'Добавить дефект');
            hintNorm.classList.remove('hidden');
            hintAdd.classList.add('hidden');
            if (hintNorm) hintNorm.innerText = _t('construction.pdf.view_mode', 'Режим просмотра');
            if (container) container.style.cursor = 'grab';
        }
    },

    setCopyMode(isActive, templateDefect = null) {
        this.isCopyMode = isActive;
        this.copyTemplateDefect = templateDefect;
        this.isAddMode = false;
        
        const btn = document.getElementById('pdf-btn-add-defect');
        const hintAdd = document.getElementById('pdf-add-hint');
        const hintNorm = document.getElementById('pdf-normal-hint');
        const container = document.getElementById('universal-pdf-container');
        if (!btn) return;

        btn.onclick = null;

        if (isActive) {
            btn.setAttribute('data-pdf-viewer-action', 'endCopyMode');
            btn.className = 'bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase active:scale-95 shadow-sm transition-colors flex items-center gap-1.5';
            btn.innerHTML = _t('construction.pdf.end_stamp', 'Завершить штамп');
            hintNorm.classList.add('hidden');
            hintAdd.classList.remove('hidden');
            hintAdd.innerText = _t('construction.pdf.hint_stamp', 'Кликайте для вставки копий ➔');
            hintAdd.className = 'text-[10px] font-bold text-blue-500 uppercase tracking-widest animate-pulse';
            if (container) container.style.cursor = 'crosshair';
        } else {
            this.setAddMode(false);
        }
    },
    toggleZoneMode() {
        this.setZoneMode(!this.isZoneMode);
    },

    setZoneMode(isActive) {
        this.isZoneMode = isActive;
        this.isAddMode = false;
        this.isCopyMode = false;
        this.zoneClicks = []; // Сбрасываем клики
        
        const btnAdd = document.getElementById('pdf-btn-add-defect');
        const btnZone = document.getElementById('pdf-btn-add-zone');
        const container = document.getElementById('universal-pdf-container');

        // Глобальный баннер-подсказка
        let helperBanner = document.getElementById('pdf-zone-helper');
        if (!helperBanner) {
            helperBanner = document.createElement('div');
            helperBanner.id = 'pdf-zone-helper';
            helperBanner.className = 'absolute top-20 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-2xl shadow-2xl z-50 text-[12px] font-black uppercase tracking-widest text-center transition-all duration-300 pointer-events-none opacity-0 translate-y-[-20px]';
            document.getElementById('universal-pdf-modal').appendChild(helperBanner);
        }

        const tempZone = document.getElementById('temp-zone-marker');
        if (tempZone) tempZone.remove();

        if (isActive) {
            if (btnZone) {
                btnZone.className = 'bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase active:scale-95 shadow-sm transition-colors flex items-center gap-1.5 mr-2';
                btnZone.innerHTML = _t('construction.pdf.btn_cancel', 'Отмена');
            }
            if (btnAdd) btnAdd.classList.add('hidden'); 
            
            helperBanner.innerHTML = _t('construction.pdf.zone_click_1', '👆 Клик 1: Левый верхний угол зоны');
            helperBanner.classList.remove('opacity-0', 'translate-y-[-20px]');
            
            if (container) container.style.cursor = 'crosshair';
        } else {
            if (btnZone) {
                btnZone.className = 'bg-blue-50 text-blue-600 border border-blue-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase active:scale-95 shadow-sm transition-colors flex items-center gap-1.5 mr-2';
                btnZone.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> ' + _t('construction.pdf.select_zone', 'Выделить зону');
            }
            if (btnAdd) btnAdd.classList.remove('hidden');
            
            // Прячем баннер
            helperBanner.classList.add('opacity-0', 'translate-y-[-20px]');
            
            if (container) container.style.cursor = 'grab';
        }
    },
    handleCanvasClick(e) {
        if (!this.isAddMode && !this.isCopyMode && !this.isZoneMode) return; 

        const container = document.getElementById('universal-pdf-container');
        const xPercent = (e.offsetX / container.offsetWidth) * 100;
        const yPercent = (e.offsetY / container.offsetHeight) * 100;

        // РЕЖИМ 1: РИСОВАНИЕ ЗОНЫ ПРИЕМКИ (2 Клика)
        if (this.isZoneMode) {
            this.zoneClicks.push({ x: xPercent, y: yPercent });
            const helperBanner = document.getElementById('pdf-zone-helper');
            
            if (this.zoneClicks.length === 1) {
                if (helperBanner) helperBanner.innerHTML = _t('construction.pdf.zone_click_2', '👇 Клик 2: Правый нижний угол зоны');
                const pinsContainer = document.getElementById('universal-pdf-pins');
                pinsContainer.insertAdjacentHTML('beforeend', `<div id="temp-zone-marker" class="absolute w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-[0_0_10px_rgba(59,130,246,0.8)] transform -translate-x-1/2 -translate-y-1/2 animate-pulse" style="left: ${xPercent}%; top: ${yPercent}%;"></div>`);
            } 
            else if (this.zoneClicks.length === 2) {
                if (helperBanner) helperBanner.innerHTML = _t('construction.pdf.zone_fixed', '✅ Зона зафиксирована!');
                
                const p1 = this.zoneClicks[0];
                const p2 = this.zoneClicks[1];
                const x = Math.min(p1.x, p2.x);
                const y = Math.min(p1.y, p2.y);
                const w = Math.abs(p1.x - p2.x);
                const h = Math.abs(p1.y - p2.y);
                
                const pinsContainer = document.getElementById('universal-pdf-pins');
                document.getElementById('temp-zone-marker')?.remove();
                pinsContainer.insertAdjacentHTML('beforeend', `<div id="temp-zone-rect" class="absolute bg-blue-500/30 border-2 border-blue-500 shadow-inner" style="left: ${x}%; top: ${y}%; width: ${w}%; height: ${h}%;"></div>`);
                
                setTimeout(() => {
                    this.setZoneMode(false);
                    this.close(); 
                    // ВОТ ТУТ МЫ ПЕРЕДАЕМ ВЕРНУВШИЕСЯ ДАННЫЕ ВМЕСТЕ С ПАМЯТЬЮ ФОРМЫ (если она была)
                    window.ConstAcceptance.openNewRequestModal(this.currentFloorId, {x, y, w, h}, window.tempAcceptanceContext);
                }, 800); // Даем 800мс полюбоваться результатом
            }
            return;
        }

        // РЕЖИМ 2: ШТАМП КОПИЙ
        if (this.isCopyMode && this.copyTemplateDefect) {
            this.massCopyDefect(xPercent, yPercent);
            return; 
        }

        // РЕЖИМ 3: ОБЫЧНАЯ ТОЧКА ДЕФЕКТА
        this.setAddMode(false);
        this.drawTempPin(xPercent, yPercent);
        window.ConstDefectForm.openNew(xPercent, yPercent);
    },

    async massCopyDefect(x, y) {
        const orig = this.copyTemplateDefect;
        const newId = 'def_' + window.RbiIds.newId();
        
        const newDefect = JSON.parse(JSON.stringify(orig));
        newDefect.id = newId;
        newDefect.x = x;
        newDefect.y = y;
        newDefect.status = 'issued';
        newDefect.history = [];
        newDefect.created_at = new Date().toISOString();
        newDefect.updated_at = new Date().toISOString();
        
        if (orig.photo) {
            _session().setPhotoRaw(newId, orig.photo);
        }

        window.ConstManager.defects.push(newDefect);
        await _storage().put(_storage().stores().CONST_DEFECTS, newDefect);
        
        window.ConstDefectForm.renderAllPins(
            window.ConstManager.currentFlrId,
            window.ConstManager.getPinFilters ? window.ConstManager.getPinFilters() : {},
            this.panzoomInstance ? this.panzoomInstance.getScale() : 1
        );
        
        if (navigator.vibrate) navigator.vibrate(30);
    },

    drawTempPin(xPercent, yPercent) {
        const pinsContainer = document.getElementById('universal-pdf-pins');
        if (!pinsContainer) return;
        const oldTemp = document.getElementById('temp-pin');
        if (oldTemp) oldTemp.remove();
        pinsContainer.insertAdjacentHTML('beforeend', `
            <div id="temp-pin" class="absolute w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px] font-black z-30 transform -translate-x-1/2 -translate-y-1/2 animate-bounce" style="left: ${xPercent}%; top: ${yPercent}%;">
                +
            </div>
        `);
    },

    close() {
        this.setCopyMode(false);
        const modal = document.getElementById('universal-pdf-modal');
        const wrapper = document.getElementById('universal-pdf-wrapper');
        const pins = document.getElementById('universal-pdf-pins');

        modal.classList.add('opacity-0');
        setTimeout(() => {
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
            if (pins) pins.innerHTML = ''; 

            if (this._wheelListener && wrapper) {
                wrapper.removeEventListener('wheel', this._wheelListener);
                this._wheelListener = null;
            }
            if (this.panzoomInstance) {
                this.panzoomInstance.destroy();
                this.panzoomInstance = null;
            }
        }, 300);
    }
};
