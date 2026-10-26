/**
 * analytics.actions.js
 * Бизнес-действия модуля Analytics.
 *
 * Делегирует загрузку данных в analytics.service.js,
 * управляет режимом (local/cloud) и фильтрами через AnalyticsState.
 *
 * Фаза N (перенесено из analytics.legacy.js): реальная бизнес-логика
 * раздела «Аналитика» — источники данных, переключение подвкладок,
 * управление трендами графиков, экспертные заключения, архив отчётов.
 * Источник состояния — AnalyticsState.* там, где состояние изолировано
 * (mode, filters, chartInstances, activeSubTab), и window.* там, где
 * состояние остаётся в app.js/templates.js (contractorArray, userTemplates,
 * SYSTEM_TEMPLATES, activeMultiFilters, reportsArray, customExpertConclusions,
 * DEFECT_CAUSES — уже синхронизированы с window.* в app.js). trendGroupings,
 * selectedChartFilters, currentContractorsFilter, currentDetailedContractor,
 * currentEditingExpertKey, currentEditingTextAreaId и buildTrendChartData
 * физически перенесены в analytics.state.js/analytics.actions.js (этот файл),
 * доступ — через window.*, как и раньше.
 */

import { AnalyticsState } from './analytics.state.js';
import { meetingRichToSafeHtml } from '../meetings/meetings.protocol.js';

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


/** Ключ линии подрядчика на трендах — тот же формат, что в списке/фильтре. */
function trendContractorKey(item) {
    const name = String(item?.contractorName || 'Неизвестно').trim() || 'Неизвестно';
    const proj = String(
        item?.project_display_name || item?.projectName || item?.project_canonical_key || 'Без объекта'
    ).trim() || 'Без объекта';
    return `${name} [${proj}]`;
}

function _trendCatMatchesFilter(cat, allowedCats) {
    if (!allowedCats || !allowedCats.length) return false;
    if (allowedCats.includes(cat)) return true;
    // Совместимость: в фильтре/PDF иногда приходит голое имя подрядчика
    return allowedCats.some((a) => {
        const raw = String(a || '').trim();
        if (!raw) return false;
        return cat === raw || cat.startsWith(raw + ' [');
    });
}

function _trendBucketLabel(d, period) {
    if (period === 'YEAR') return d.getFullYear().toString();
    if (period === 'QUARTER') return `Q${Math.floor(d.getMonth() / 3) + 1} '${d.getFullYear().toString().slice(-2)}`;
    if (period === 'WEEK') return `${_t('quality.analytics.period.week_short', 'Нед.')}${window.getWeekNumber(d)} '${d.getFullYear().toString().slice(-2)}`;
    return d.toLocaleString('ru-RU', { month: 'short', year: '2-digit' });
}

function _trendPointValue(items, fieldName) {
    if (!items || !items.length) return null;
    const templates = (window.RBI && window.RBI.services && window.RBI.services.templates)
        ? window.RBI.services.templates.getUserTemplates()
        : (typeof window.userTemplates !== 'undefined' ? window.userTemplates : {});
    // Линия одного подрядчика: УрК подрядчика (окно ≤15 внутри корзины).
    if (fieldName === 'contractorName' && typeof window.getContractorMetrics === 'function') {
        const m = window.getContractorMetrics(items, templates);
        return m ? m.baseUrkContrPerc : null;
    }
    // TOTAL / вид работ / прочее: среднее по подрядчикам корзины (тот же канон KPI).
    if (typeof window.avgContractorRatingsFromChecks === 'function') {
        return window.avgContractorRatingsFromChecks(items).avgUrk;
    }
    let sum = 0, n = 0;
    items.forEach((i) => {
        if (!i || !i.metrics) return;
        sum += Number(i.metrics.final) || 0;
        n++;
    });
    return n > 0 ? Math.round(sum / n) : null;
}

// Перенесено из app.js 1:1 — умный генератор данных для трендовых графиков.
// Точка периода: канон ≤15 / среднее по подрядчикам (не среднее всех checks.final).
function buildTrendChartData(data, fieldName, allowedCats = [], period = 'MONTH') {
    const timeMap = {}; const categoriesTotal = {};
    const labelOrder = [];
    const sortedData = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));

    sortedData.forEach(item => {
        if (!item.metrics) return;
        const d = new Date(item.date);
        const tLabel = _trendBucketLabel(d, period);

        let cat = fieldName === 'TOTAL' ? 'Общий УрК' : (item[fieldName] || 'Неизвестно');
        if (fieldName === 'contractorName') {
            cat = trendContractorKey(item);
        }
        categoriesTotal[cat] = (categoriesTotal[cat] || 0) + 1;

        if (!timeMap[tLabel]) {
            timeMap[tLabel] = {};
            labelOrder.push(tLabel);
        }
        if (!timeMap[tLabel][cat]) timeMap[tLabel][cat] = [];
        timeMap[tLabel][cat].push(item);
    });

    let targetCats = [];
    if (fieldName === 'TOTAL') targetCats = ['Общий УрК'];
    else if (allowedCats && allowedCats.length > 0) {
        targetCats = Object.keys(categoriesTotal)
            .filter((c) => _trendCatMatchesFilter(c, allowedCats))
            .sort((a, b) => categoriesTotal[b] - categoriesTotal[a]);
        const exactOrdered = allowedCats.filter((c) => categoriesTotal[c]);
        if (exactOrdered.length === allowedCats.length) targetCats = exactOrdered;
    }
    else targetCats = Object.keys(categoriesTotal).sort((a, b) => categoriesTotal[b] - categoriesTotal[a]).slice(0, 10);

    const labels = labelOrder.length ? labelOrder : Object.keys(timeMap);
    const colors = ['#4f46e5', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#db2777', '#d97706', '#059669', '#2563eb'];

    const datasets = targetCats.map((cat, i) => {
        const dataPoints = labels.map(l => _trendPointValue(timeMap[l] && timeMap[l][cat], fieldName));
        return {
            label: cat.length > 20 ? cat.substring(0, 20) + '...' : cat,
            data: dataPoints,
            borderColor: fieldName === 'TOTAL' ? '#4f46e5' : colors[i % colors.length],
            backgroundColor: fieldName === 'TOTAL' ? 'rgba(79, 70, 229, 0.1)' : colors[i % colors.length],
            fill: fieldName === 'TOTAL',
            tension: 0.35, borderWidth: fieldName === 'TOTAL' ? 2 : 1.5, pointRadius: fieldName === 'TOTAL' ? 3 : 2, spanGaps: true
        };
    });

    return { labels, datasets };
}
window.buildTrendChartData = buildTrendChartData;
window.trendContractorKey = trendContractorKey;

// ─── Приватные хелперы (перенесено из analytics.legacy.js, строки 12–91) ───

function _getSetting(key) {
    return window.RBI.services.settings.get(key);
}

function _analyticsFilters(ns) {
    // ВАЖНО: window.activeMultiFilters — единственный источник, реально обновляемый
    // модалкой мульти-фильтра (applyMultiFilter() в multi-filter.js пишет туда напрямую,
    // не вызывая AnalyticsState.setFilters()). AnalyticsState.filters — одноразовый
    // снимок, заполняемый только при инициализации модуля (analytics.module.js#init),
    // поэтому не может быть источником по умолчанию — иначе выбор объекта/подрядчика
    // в фильтре молча игнорируется при расчёте данных (баг: фильтр визуально выбран,
    // но данные показываются нефильтрованными).
    if (window.activeMultiFilters && window.activeMultiFilters[ns || 'analytics']) {
        return window.activeMultiFilters[ns || 'analytics'];
    }
    if (!ns || ns === 'analytics') {
        if (window.RBI && window.RBI.services && window.RBI.services.analytics) {
            return window.RBI.services.analytics.getAnalyticsFilters();
        }
    }
    if (window.AnalyticsState && window.AnalyticsState.filters) {
        return window.AnalyticsState.filters;
    }
    return { project: [], contractor: [], inspector: [], template: [], period: null };
}

function _analyticsMode() {
    if (window.AnalyticsState) return window.AnalyticsState.mode;
    return window.analyticsDataMode || 'local';
}

function _chartInstances() {
    if (window.AnalyticsState) return window.AnalyticsState.chartInstances;
    if (typeof window.chartInstances !== 'undefined') return window.chartInstances;
    return {};
}

function _historyFilters() {
    if (window.HistoryState && window.HistoryState.filters) {
        return window.HistoryState.filters;
    }
    if (window.activeMultiFilters && window.activeMultiFilters.history) {
        return window.activeMultiFilters.history;
    }
    return { project: [], contractor: [], inspector: [] };
}

function _inspections() {
    // ВАЖНО (постраничная загрузка Журнала, см. отчёт по оптимизации журнала/
    // аналитики): HistoryState.allRecords с этого момента содержит только
    // текущую страницу Журнала, не весь стор — источник правды для аналитики
    // всегда window.contractorArray (полный массив).
    if (window.RBI && window.RBI.services && window.RBI.services.inspections) {
        return window.RBI.services.inspections.getAllForAnalyticsSync();
    }
    if (Array.isArray(window.contractorArray)) return window.contractorArray;
    return [];
}

function _storage() {
    if (window.RBI && window.RBI.services && window.RBI.services.storage) {
        return window.RBI.services.storage;
    }
    return {
        stores: function () { return typeof STORES !== 'undefined' ? STORES : {}; },
        put: function (store, data) { return dbPut(store, data); }
    };
}

function _gameLogAction(actionType, targetId) {
    if (window.RBI && window.RBI.services && window.RBI.services.game) {
        return window.RBI.services.game.logAction(actionType, targetId);
    }
    if (typeof gameLogAction === 'function') return gameLogAction(actionType, targetId);
}

function _reports() {
    if (AnalyticsActions._ctx && AnalyticsActions._ctx.reports) {
        return AnalyticsActions._ctx.reports;
    }
    if (window.RBI && window.RBI.services && window.RBI.services.reports) {
        return window.RBI.services.reports;
    }
    return {
        getAllSync: function () {
            return Array.isArray(window.reportsArray) ? window.reportsArray : [];
        },
        getExpertConclusions: function () {
            return window.customExpertConclusions || {};
        },
        getExpertConclusion: function (key) {
            return (window.customExpertConclusions || {})[key];
        },
        setExpertConclusion: function (key, val) {
            if (window.customExpertConclusions) window.customExpertConclusions[key] = val;
        },
        deleteExpertConclusion: function (key) {
            if (window.customExpertConclusions) delete window.customExpertConclusions[key];
        }
    };
}

function _defectCauses() {
    if (window.RBI && window.RBI.services && window.RBI.services.inspections) {
        return window.RBI.services.inspections.getDefectCausesSync();
    }
    return typeof DEFECT_CAUSES !== 'undefined' ? DEFECT_CAUSES : [];
}

function _callAI(messages, options) {
    if (window.RBI && window.RBI.services && window.RBI.services.ai) {
        return window.RBI.services.ai.call(messages, options);
    }
    return window.callAI(messages, options);
}

function _syncConfig() {
    if (window.RBI && window.RBI.services && window.RBI.services.sync &&
        typeof window.RBI.services.sync.getConfig === 'function') {
        return window.RBI.services.sync.getConfig();
    }
    return window.syncConfig || {};
}

function _sync(mode) {
    var m = mode || 'silent';
    if (window.RBI && window.RBI.services && window.RBI.services.sync) {
        return window.RBI.services.sync.trigger(m);
    }
    if (typeof triggerSync === 'function') return triggerSync(m);
    return Promise.resolve(false);
}

function _getTasks() {
    if (window.RBI && window.RBI.services && window.RBI.services.tasks) {
        return window.RBI.services.tasks.getTasksSync();
    }
    return typeof window.rbi_tasksData !== 'undefined' ? window.rbi_tasksData : [];
}
function _getPractices() {
    if (window.RBI && window.RBI.services && window.RBI.services.tasks) {
        return window.RBI.services.tasks.getPracticesSync();
    }
    return typeof window.rbi_practicesData !== 'undefined' ? window.rbi_practicesData : [];
}

function _templates() {
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

export const AnalyticsActions = {

    _ctx: null,
    bindCtx(ctx) { this._ctx = ctx; },

    /**
     * Загрузить данные аналитики через analytics.service.js.
     * Эмитит 'analytics:loaded' после успешной загрузки.
     */
    async loadData() {
        try {
            const svc = this._ctx && this._ctx.analytics;
            if (!svc) {
                console.warn('[AnalyticsActions] analytics service недоступен');
                return;
            }
            const data = svc.getFilteredAnalyticsData();
            AnalyticsState.setDataSource(data || []);

            const events = this._ctx && this._ctx.events;
            if (events && typeof events.emit === 'function') {
                events.emit('analytics:loaded', { count: AnalyticsState.dataSource.length });
            }
        } catch (e) {
            console.error('[AnalyticsActions] ошибка загрузки данных:', e);
        }
    },

    /**
     * Переключить режим источника данных (local/cloud).
     */
    setMode(mode) {
        AnalyticsState.setMode(mode);
        const svc = this._ctx && this._ctx.analytics;
        if (svc && typeof svc.setAnalyticsMode === 'function') {
            svc.setAnalyticsMode(mode);
        }
    },

    /**
     * Обновить фильтры аналитики.
     */
    setFilters(filters) {
        AnalyticsState.setFilters(filters);
        const svc = this._ctx && this._ctx.analytics;
        if (svc && typeof svc.setAnalyticsFilters === 'function') {
            svc.setAnalyticsFilters(filters);
        }
    },

    /**
     * Сбросить все фильтры аналитики к пустым значениям.
     */
    resetFilters() {
        const empty = {
            project: [],
            contractor: [],
            inspector: [],
            template: [],
            period: null
        };
        AnalyticsState.setFilters(empty);
        const svc = this._ctx && this._ctx.analytics;
        if (svc && typeof svc.setAnalyticsFilters === 'function') {
            svc.setAnalyticsFilters(empty);
        }
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: единый выбор источника данных
    // для аналитики (было в js/analytics.js).
    // =========================================================================
    getAnalyticsDataSource(mode) {
        var _allInspections = _inspections();
        const arr = Array.isArray(_allInspections) ? _allInspections : [];

        if (mode === 'cloud') {
            return arr.filter(i =>
                i &&
                i._deleted !== true &&
                (
                    i.source === 'cloud' ||
                    i.syncStatus === 'synced' ||
                    i.sync_status === 'synced'
                )
            );
        }

        // Локальная аналитика показывает всё, что есть на устройстве,
        // кроме мягко удалённых записей.
        return arr.filter(i => i && i._deleted !== true);
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: фильтрация данных для всех
    // вкладок аналитики.
    // =========================================================================
    getFilteredAnalyticsData() {
        const selPeriod = document.getElementById('global-filter-period')?.value || 'D30';

        let arr = AnalyticsActions.getAnalyticsDataSource(_analyticsMode());
        const now = new Date();
        // Жёстко отсекаем проверки Стройконтроля из аналитики качества.
        arr = arr.filter(i => i.inspection_type !== 'sk_acceptance');

        const periodNorm = typeof window.normalizeAnalyticsPeriod === 'function'
            ? window.normalizeAnalyticsPeriod(selPeriod)
            : selPeriod;
        const periodDays = typeof window.getAnalyticsPeriodDays === 'function'
            ? window.getAnalyticsPeriodDays(selPeriod)
            : null;

        if (periodNorm === 'CUSTOM') {
            const dFrom = document.getElementById('filter-date-from')?.value;
            const dTo = document.getElementById('filter-date-to')?.value;
            if (dFrom) {
                const fDate = new Date(dFrom); fDate.setHours(0, 0, 0, 0);
                arr = arr.filter(i => new Date(i.date) >= fDate);
            }
            if (dTo) {
                const tDate = new Date(dTo); tDate.setHours(23, 59, 59, 999);
                arr = arr.filter(i => new Date(i.date) <= tDate);
            }
        } else if (periodDays) {
            const from = new Date(now);
            from.setDate(now.getDate() - periodDays);
            arr = arr.filter(i => new Date(i.date) >= from);
        }

        return AnalyticsActions.applyAnalyticsEntityFilters(arr);
    },

    /**
     * Entity filters (project / contractor / inspector / template) shared by
     * KPI slice and one-pager trend window.
     */
    applyAnalyticsEntityFilters(arr) {
        const f = _analyticsFilters('analytics');
        const fProj = f.project || [];
        const fContr = f.contractor || [];
        const fInsp = f.inspector || [];
        const fTmpl = f.template || [];
        let out = arr || [];
        if (fProj.length > 0) {
            out = out.filter(i => {
                const p = i.project_display_name || i.projectName || i.project_canonical_key || '';
                return fProj.includes(p) || fProj.includes(i.project_canonical_key);
            });
        }
        if (fContr.length > 0) out = out.filter(i => fContr.includes(i.contractorName));
        if (fInsp.length > 0) out = out.filter(i => fInsp.includes(i.inspectorName));
        if (fTmpl.length > 0) out = out.filter(i => fTmpl.includes(i.templateTitle));
        return out;
    },

    /**
     * One-pager «Динамика уровня качества»: own lookback, ignores global D30/CUSTOM.
     * WEEK → 12 weeks; MONTH → 6 months. Entity filters still apply.
     */
    getOnePagerTrendSourceData(grouping) {
        const g = grouping || (window.trendGroupings && window.trendGroupings.onepager) || 'WEEK';
        const lookbackDays = g === 'MONTH' ? 180 : 84;
        let arr = AnalyticsActions.getAnalyticsDataSource(_analyticsMode());
        arr = arr.filter(i => i.inspection_type !== 'sk_acceptance');
        const now = new Date();
        const from = new Date(now);
        from.setDate(now.getDate() - lookbackDays);
        arr = arr.filter(i => new Date(i.date) >= from);
        return AnalyticsActions.applyAnalyticsEntityFilters(arr);
    },

    onePagerTrendWindowHint(grouping) {
        const g = grouping || (window.trendGroupings && window.trendGroupings.onepager) || 'WEEK';
        return g === 'MONTH' ? _t('quality.analytics.trend.window_6m', '6 мес. · вне фильтра периода') : _t('quality.analytics.trend.window_12w', '12 нед. · вне фильтра периода');
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: window.setAnalyticsDataMode.
    // =========================================================================
    setAnalyticsDataMode(mode) {
        window.analyticsDataMode = mode === 'cloud' ? 'cloud' : 'local';
        AnalyticsState.setMode(mode);
        if (typeof window.renderCurrentAnalyticsTab === 'function') window.renderCurrentAnalyticsTab();
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: единая функция переключения
    // подвкладок аналитики.
    // =========================================================================
    switchAnalyticsSubTab(tabId, btnElement, opts) {
        const fromRouter = !!(opts && opts.fromRouter);
        AnalyticsState.setActiveSubTab(tabId);
        window.currentActiveAnalyticsTab = tabId;

        // Скрываем все секции
        document.querySelectorAll('.analytics-sub-section').forEach(el => el.classList.add('hidden'));

        // Сбрасываем стили всех кнопок (в т.ч. legacy `active`/`bg-white` с Подрядчиков в markup)
        document.querySelectorAll('#analytics-subtabs-block .sub-tab-btn').forEach(el => {
            el.classList.remove('bg-surface', 'bg-white', 'shadow-sm', 'text-brand', 'active');
            el.classList.add('text-[var(--text-muted)]');
        });

        // Показываем нужную секцию
        const targetTab = document.getElementById(tabId);
        if (targetTab) targetTab.classList.remove('hidden');

        // Красим активную кнопку
        if (!btnElement) {
            btnElement = document.querySelector(`#analytics-subtabs-block button[data-action-arg="${tabId}"]`);
        }
        if (btnElement) {
            btnElement.classList.add('bg-surface', 'shadow-sm', 'text-brand', 'active');
            btnElement.classList.remove('text-[var(--text-muted)]');
        }

        // Скрываем глобальные фильтры только для Истории и Графика. ПК СК их использует.
        const filtersBlock = document.getElementById('analytics-filters-block');
        if (tabId === 'sub-history' || tabId === 'sub-schedule') {
            if (filtersBlock) filtersBlock.style.display = 'none';
        } else {
            if (filtersBlock) filtersBlock.style.display = 'block';
        }

        // Обновляем кнопку FAB
        if (typeof updateFabButton === 'function') updateFabButton('tab-analytics');

        // Скелетон / «Загрузка…» — только если секция ещё не нарисована.
        // A9: при sync-defer НЕ затираем живой UI; dirty сам по себе не повод
        // для skeleton, если fingerprint/data совпадают (canReuse).
        const deferring = typeof window.shouldDeferFullRender === 'function'
            && window.shouldDeferFullRender('analytics');
        const canReuse = typeof window.analyticsTabCanReusePaint === 'function'
            && window.analyticsTabCanReusePaint(tabId);
        const alreadyPainted = !!(window.AnalyticsRender
            && typeof window.AnalyticsRender.sectionLooksPainted === 'function'
            && window.AnalyticsRender.sectionLooksPainted(tabId));
        const skeletonTargets = {
            'sub-contractors': 'contractors-list-container',
            'sub-onepager': 'onepager-content-container',
            'sub-history': 'history-list',
            'sub-schedule': 'schedule-container',
            'sub-sk': 'sk-main-container'
        };
        // История с данными в памяти — без skeleton (иначе «долгая загрузка» на IDB).
        const histHasMem = tabId === 'sub-history'
            && window.HistoryState && Array.isArray(window.HistoryState.allRecords)
            && window.HistoryState.allRecords.length > 0;
        const skHasMem = tabId === 'sub-sk'
            && Array.isArray(window.skRecords) && window.skRecords.length > 0;
        const schedReady = tabId === 'sub-schedule' && Array.isArray(window.rbi_scheduleData);
        if (!canReuse && !alreadyPainted && !histHasMem && !skHasMem && !schedReady
            && typeof window.rbiShowContentSkeleton === 'function') {
            const skShellAlive = tabId === 'sub-sk' && !!document.getElementById('sk-view-dashboard');
            if (!skShellAlive) {
                const elId = skeletonTargets[tabId];
                const el = elId ? document.getElementById(elId) : null;
                if (el) {
                    window.rbiShowContentSkeleton(el, {
                        cards: tabId === 'sub-history' ? 5 : 4,
                        label: _t('quality.analytics.loading', 'Загрузка…')
                    });
                }
            }
        }

        // Дать браузеру отрисовать «Загрузка…», иначе тяжёлый sync-render
        // блокирует main thread и экран остаётся пустым/старым.
        // Живой UI при sync-defer не трогаем; пустой после teardown — рисуем.
        if (!fromRouter && window.AppRouter && typeof window.AppRouter.navigateSub === 'function') {
            window.AppRouter.navigateSub('#/quality/analytics', tabId);
        }
        if (deferring && alreadyPainted) {
            if (window.RBI?.utils?.syncUi?.markDirty) window.RBI.utils.syncUi.markDirty('analytics');
            else if (window.syncDirtyFlags) window.syncDirtyFlags.analytics = true;
            return;
        }
        if (typeof window.renderCurrentAnalyticsTab === 'function') {
            requestAnimationFrame(function () {
                setTimeout(function () {
                    window.renderCurrentAnalyticsTab();
                }, 0);
            });
        }
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: переключатель произвольного
    // диапазона дат в фильтрах аналитики.
    // =========================================================================
    toggleDateRange() {
        const select = document.getElementById('global-filter-period');
        const period = select?.value;
        const label = document.getElementById('btn-ana-period-label');

        if (select && label) { label.querySelector('.truncate').innerText = select.options[select.selectedIndex].text; }

        const rangeBlock = document.getElementById('custom-date-range');
        if (!rangeBlock) return;

        if (period === 'CUSTOM') {
            rangeBlock.classList.remove('hidden'); rangeBlock.classList.add('grid');
        } else {
            rangeBlock.classList.add('hidden'); rangeBlock.classList.remove('grid');
        }
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: фильтрация списка подрядчиков
    // по чипсам.
    // =========================================================================
    filterContractorsList(filterType, btnElement) {
        window.currentContractorsFilter = filterType;

        // Сбрасываем стили всех чипсов
        const container = document.getElementById('contractors-chips-container');
        if (container) {
            container.querySelectorAll('.contr-chip').forEach(el => {
                el.className = "contr-chip px-3 py-1.5 rounded-full text-rbi-caption font-bold bg-slate-100 text-muted active:scale-95 whitespace-nowrap transition-colors";
            });
        }

        // Красим активный чипс
        if (btnElement) {
            btnElement.className = "contr-chip px-3 py-1.5 rounded-full text-rbi-caption font-bold bg-brand text-white shadow-sm active:scale-95 whitespace-nowrap transition-colors";
        }

        // Перерисовываем список
        if (typeof window.renderContractorsListOnly === 'function') {
            window.renderContractorsListOnly(AnalyticsActions.getFilteredAnalyticsData());
        }
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: управление трендами (линии
    // на графиках) — открытие модала выбора линий.
    // =========================================================================
    openChartFilterModal(type) {
        const data = AnalyticsActions.getFilteredAnalyticsData();
        // contrs/onepager — линии подрядчик+объект (как в buildTrendChartData);
        // works — виды работ. Раньше для onepager ошибочно брался templateTitle,
        // а для contrs — голое contractorName без объекта → фильтр не попадал в ключи графика.
        const isContractorLines = (type === 'contrs' || type === 'onepager');
        const title = isContractorLines ? _t('quality.analytics.chart.lines_contractors', 'Линии: Подрядчики') : _t('quality.analytics.chart.lines_works', 'Линии: Виды работ');

        const counts = {};
        data.forEach((i) => {
            if (!i || !i.metrics) return;
            let key = '';
            if (isContractorLines) {
                if (!i.contractorName) return;
                key = trendContractorKey(i);
            } else {
                key = i.templateTitle || '';
                if (!key) return;
            }
            counts[key] = (counts[key] || 0) + 1;
        });
        const uniqueItems = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

        if (!window.selectedChartFilters[type]) window.selectedChartFilters[type] = [];
        const isAuto = window.selectedChartFilters[type].length === 0;

        let html = `<div class="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar mb-4 pr-1">`;
        html += `<label class="flex items-center gap-3 p-3 bg-brand-soft/30 border border-brand-soft rounded-xl mb-3 font-bold cursor-pointer text-brand">
            <input type="checkbox" id="chart-filter-auto" class="w-5 h-5 accent-indigo-600" onchange="if(this.checked) document.querySelectorAll('.chart-filter-cb').forEach(cb => cb.checked = false)" ${isAuto ? 'checked' : ''}>
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            ${_t('quality.analytics.chart.auto_select', 'Автовыбор (до 10)')}
        </label>`;

        uniqueItems.forEach(item => {
            const isChecked = !isAuto && window.selectedChartFilters[type].includes(item);
            const safeVal = String(item).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
            const safeLabel = String(item).replace(/</g, '&lt;');
            html += `<label class="flex items-center gap-3 p-3 bg-[var(--card-bg)] hover:bg-[var(--hover-bg)] rounded-xl cursor-pointer border border-[var(--card-border)] transition-colors">
                <input type="checkbox" value="${safeVal}" class="chart-filter-cb w-5 h-5 accent-indigo-600 shrink-0" ${isChecked ? 'checked' : ''} onchange="document.getElementById('chart-filter-auto').checked = false">
                <span class="text-rbi-body truncate flex-1 min-w-0" title="${safeVal}">${safeLabel}</span>
                <span class="text-rbi-caption text-muted bg-surface px-2 py-1 rounded-md font-bold shrink-0">${counts[item]} ${_t('quality.analytics.chart.pcs', 'шт')}</span>
            </label>`;
        });
        html += `</div>
        <div class="flex gap-2">
            <button onclick="closeModal()" class="flex-1 bg-surface text-ink py-3 rounded-xl font-bold uppercase active:scale-95 border border-surface">${_t('quality.analytics.btn.cancel', 'Отмена')}</button>
            <button onclick="saveChartFilters('${type}')" class="flex-1 bg-brand text-white py-3 rounded-xl font-bold uppercase shadow-md active:scale-95">${_t('quality.analytics.btn.apply', 'Применить')}</button>
        </div>`;

        const modal = document.getElementById('modal-overlay');
        document.getElementById('modal-icon').innerHTML = '';
        document.getElementById('modal-title').innerHTML = `<div class="flex items-center gap-2"><svg class="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg> ${title}</div>`;
        document.getElementById('modal-body').innerHTML = html;
        document.body.classList.add('modal-open');
        modal.style.display = 'flex';
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: сохранение выбранных линий графика.
    // =========================================================================
    saveChartFilters(type) {
        const isAuto = document.getElementById('chart-filter-auto').checked;
        if (isAuto) { window.selectedChartFilters[type] = []; }
        else {
            const checked = Array.from(document.querySelectorAll('.chart-filter-cb:checked')).map(cb => cb.value);
            if (checked.length === 0) return showToast(_t('quality.analytics.toast.select_lines', 'Выберите линии или включите Авто'));
            window.selectedChartFilters[type] = checked;
        }
        closeModal(); AnalyticsActions.updateTrendCharts(type);
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: обновление трендовых графиков
    // без полной перерисовки вкладки.
    // =========================================================================
    updateTrendCharts(type, period) {
        if (period) window.trendGroupings[type] = period;
        const data = AnalyticsActions.getFilteredAnalyticsData();

        if (AnalyticsState.activeSubTab === 'sub-contractors') {
            if (type === 'contrs' && _chartInstances()['chart_eng_trend_contrs']) {
                _chartInstances()['chart_eng_trend_contrs'].data = window.buildTrendChartData(data, 'contractorName', window.selectedChartFilters.contrs, window.trendGroupings.contrs);
                _chartInstances()['chart_eng_trend_contrs'].update();
            }
            if (type === 'works' && _chartInstances()['chart_eng_trend_works']) {
                _chartInstances()['chart_eng_trend_works'].data = window.buildTrendChartData(data, 'templateTitle', window.selectedChartFilters.works, window.trendGroupings.works);
                _chartInstances()['chart_eng_trend_works'].update();
            }
        } else if (AnalyticsState.activeSubTab === 'sub-onepager') {
            if (type === 'global' && _chartInstances()['chart_onepager_trend']) {
                _chartInstances()['chart_onepager_trend'].data = window.buildTrendChartData(data, 'TOTAL', [], window.trendGroupings.global);
                _chartInstances()['chart_onepager_trend'].update();
            }
            // Фильтр линий подрядчиков на Сводке: полный ререндер, чтобы
            // сохранить автологику «до 10» при пустом фильтре.
            // Trend chart uses own lookback (not global D30) inside renderOnePagerSubTab.
            if (type === 'onepager' && typeof window.renderOnePagerSubTab === 'function') {
                window.renderOnePagerSubTab(data);
            }
        }
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: логика ИИ заключений (PDCA).
    // =========================================================================
    editExpertText(expertKey, textAreaId) {
        window.currentEditingExpertKey = expertKey;
        window.currentEditingTextAreaId = textAreaId;
        const textArea = document.getElementById(textAreaId);
        const modalInput = document.getElementById('modal-expert-input');
        const overlay = document.getElementById('expert-modal-overlay');
        if (!textArea || !modalInput || !overlay) return;

        modalInput.value = textArea.value;
        overlay.style.display = 'flex';
        document.body.classList.add('modal-open');
    },

    cancelExpertEdit() {
        const overlay = document.getElementById('expert-modal-overlay');
        if (overlay) overlay.style.display = 'none';
        document.body.classList.remove('modal-open');
        window.currentEditingExpertKey = null; window.currentEditingTextAreaId = null;
    },

    resetExpertEdit() {
        if (!window.currentEditingExpertKey) return;
        if (confirm(_t('quality.analytics.confirm.reset_expert', 'Сбросить текст до оригинального заключения ИИ? Ваша редакция будет удалена.'))) {
            _reports().deleteExpertConclusion(window.currentEditingExpertKey);
            AnalyticsActions.cancelExpertEdit(); scheduleSessionSave();
            if (window.currentDetailedContractor) {
                if (typeof window.showContractorDetailView === 'function') window.showContractorDetailView(window.currentDetailedContractor);
            } else if (typeof window.renderCurrentAnalyticsTab === 'function') {
                window.renderCurrentAnalyticsTab();
            }
            showToast(_t('quality.analytics.toast.expert_reset', 'Текст сброшен к исходному'));
        }
    },

    saveExpertEdit() {
        const modalInput = document.getElementById('modal-expert-input');
        if (!modalInput || !window.currentEditingExpertKey) return;
        let newText = modalInput.value.trim();
        if (newText === "") return showToast(_t('quality.analytics.toast.expert_empty', 'Текст не может быть пустым!'));

        // Сводка One-Pager: лимит 500 символов, чтобы печать A3 не уезжала на 2-ю страницу.
        const isOnePagerPdca = window.currentEditingExpertKey === 'global_onepager_pdca'
            || String(window.currentEditingExpertKey || '').endsWith('_pdca');
        if (isOnePagerPdca && newText.length > 500) {
            newText = newText.slice(0, 499).trimEnd() + '…';
            showToast(_t('quality.analytics.toast.expert_trimmed', 'Текст обрезан до 500 символов для печати'));
        }

        _reports().setExpertConclusion(window.currentEditingExpertKey, newText);
        AnalyticsActions.cancelExpertEdit(); scheduleSessionSave();

        if (window.currentDetailedContractor) {
            if (typeof window.showContractorDetailView === 'function') window.showContractorDetailView(window.currentDetailedContractor);
        } else if (typeof window.renderCurrentAnalyticsTab === 'function') {
            window.renderCurrentAnalyticsTab();
        }
        showToast(_t('quality.analytics.toast.saved', 'Изменения сохранены!'));
    },

    copyExpertText(btnId, textAreaId) {
        const textArea = document.getElementById(textAreaId);
        const btn = document.getElementById(btnId);
        if (!textArea || !btn) return;

        navigator.clipboard.writeText(textArea.value).then(() => {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '✅<span class="hidden min-[400px]:inline"> ' + _t('quality.analytics.btn.copied', 'Скопировано') + '</span>';
            btn.classList.add('bg-green-50', 'text-green-700', 'border-green-200');
            setTimeout(() => { btn.innerHTML = originalHtml; btn.classList.remove('bg-green-50', 'text-green-700', 'border-green-200'); }, 2000);
            showToast(_t('quality.analytics.toast.copied', 'Текст скопирован в буфер!'));
            _gameLogAction('ai_copy', 'clipboard');
        }).catch(() => showToast(_t('quality.analytics.toast.copy_fail', 'Ошибка копирования')));
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: глобальная функция вызова
    // «Магии TWI» из карточки дефекта аналитики.
    // =========================================================================
    async createMagicTwi(checklistKey, itemId, photoGood, photoBad, title) {
        if (!window.RBI.services.knowledge.requireEditRight()) return;
        // P2-0023 (правило владельца): на пункт — одна карта ТИВИ. Уже есть — показываем её, новую не начинаем.
        if (typeof window.rbiFindExistingTwiCard === 'function') {
            const existingTwi = await window.rbiFindExistingTwiCard(checklistKey, itemId);
            if (existingTwi) {
                window._rbiMagicTwiPending = false;
                if (!(window.customTwiCards || []).some(c => String(c.id) === String(existingTwi.id))) {
                    (window.customTwiCards = window.customTwiCards || []).push(existingTwi);
                }
                showToast('ℹ️ Карта ТИВИ для этого пункта уже есть — открыта');
                if (typeof window.openTwiViewer === 'function') window.openTwiViewer(existingTwi.id);
                if (typeof window.renderTwiList === 'function') window.renderTwiList();
                return;
            }
        }
        // Флаг для saveTwiCard: начислить magic_creator (+100 XP), а не обычный create_twi
        window._rbiMagicTwiPending = true;
        switchTab('tab-reference');
        setTimeout(() => {
            const btns = document.querySelectorAll('#reference-subtabs-block .sub-tab-btn');
            if (btns[2]) switchReferenceSubTab('ref-sub-twi', btns[2]);

            window.RBI.services.knowledge.openTwiConstructor(); // Открываем пустой конструктор

            setTimeout(() => {
                document.getElementById('twi-title-input').value = title;
                document.getElementById('twi-checklist-select').value = checklistKey;

                // Запускаем перерисовку селектора пунктов
                window.RBI.services.knowledge.populateTwiItemSelect(itemId);

                window.RBI.services.knowledge.changeTwiType('INSPECTOR');

                // Вставляем фото
                window.RBI.services.knowledge.renderGoodPhoto(photoGood);
                window.RBI.services.knowledge.renderBadPhoto(photoBad);
                if (typeof window.refreshTwiPhotoCandidates === 'function') {
                    window.refreshTwiPhotoCandidates();
                }

                showToast(_t('quality.analytics.toast.magic_twi', '✨ Магия сработала! Допишите текст и сохраните (+100 XP).'));
            }, 300);
        }, 100);
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: управление архивом отчётов
    // (вкладка История → Отчёты).
    // =========================================================================
    switchHistoryView(view) {
        const btnChecks = document.getElementById('btn-hist-checks');
        const btnReports = document.getElementById('btn-hist-reports');
        const btnPlans = document.getElementById('btn-hist-plans');
        const viewChecks = document.getElementById('history-checks-view');
        const viewReports = document.getElementById('history-reports-view');
        const viewPlans = document.getElementById('history-plans-view');
        const actionsRow = document.getElementById('hist-checks-actions-row');

        const actClass = "px-3 py-1 rounded-full text-rbi-caption font-black uppercase transition-all duration-300 bg-surface text-brand shadow-sm";
        const inactClass = "px-3 py-1 rounded-full text-rbi-caption font-black uppercase transition-all duration-300 text-muted";

        // Сохраняем стейт в глобальную переменную, чтобы фильтры понимали, что перерисовывать
        window.currentHistoryViewMode = view;

        if (btnChecks) btnChecks.className = inactClass;
        if (btnReports) btnReports.className = inactClass;
        if (btnPlans) btnPlans.className = inactClass;
        if (viewChecks) viewChecks.classList.add('hidden');
        if (viewReports) viewReports.classList.add('hidden');
        if (viewPlans) viewPlans.classList.add('hidden');

        if (view === 'checks') {
            if (btnChecks) btnChecks.className = actClass;
            if (viewChecks) viewChecks.classList.remove('hidden');
            if (actionsRow) actionsRow.style.display = 'flex';
            renderHistoryTab();
        } else if (view === 'plans') {
            if (btnPlans) btnPlans.className = actClass;
            if (viewPlans) viewPlans.classList.remove('hidden');
            if (actionsRow) actionsRow.style.display = 'flex';
            renderHistoryTab();
        } else {
            if (btnReports) btnReports.className = actClass;
            if (viewReports) viewReports.classList.remove('hidden');
            if (actionsRow) actionsRow.style.display = 'none';
            if (typeof window.renderReportsList === 'function') window.renderReportsList();
        }
    },

    async openReport(id) {
        const r = _reports().getAllSync().find(x => x.id === id);
        if (!r) return showToast(_t('quality.analytics.toast.report_not_found', 'Файл отчета не найден'));

        const isPptx = (r.mime_type && String(r.mime_type).includes('presentation'))
            || r.report_type === 'pptx'
            || /\.pptx$/i.test(String(r.title || ''));
        const safeName = String(r.title || 'report')
            .replace(/[\\/:*?"<>|]+/g, '_')
            .replace(/\s+/g, '_')
            .slice(0, 80);
        const downloadName = isPptx
            ? (safeName.endsWith('.pptx') ? safeName : safeName + '.pptx')
            : (safeName.endsWith('.pdf') ? safeName : safeName + '.pdf');

        const openBlob = async (blob) => {
            if (isPptx) {
                // In-app viewer (PptxViewJS); при сбое — скачивание.
                if (typeof window.openPptxViewer === 'function') {
                    const ok = await window.openPptxViewer(blob, {
                        title: r.title || _t('quality.analytics.report.presentation', 'Презентация'),
                        downloadName
                    });
                    if (ok) return;
                }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = downloadName;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 15000);
                showToast(_t('quality.analytics.toast.pptx_downloaded', 'PPTX скачан — откройте в PowerPoint'));
                return;
            }

            // PDF: лёгкий opener (https / sync blob на втором тапе). Без all-pages canvas — OOM-safe.
            const legacyModal = document.getElementById('rbi-pdf-report-modal');
            if (legacyModal) {
                try { legacyModal.remove(); } catch (_) { /* ignore */ }
            }
            if (typeof window.rbiOpenPdfDocument !== 'function') {
                showToast(_t('quality.analytics.toast.pdf_opener_unavailable', 'PDF opener недоступен'));
                return;
            }
            const httpsUrl = (r.file_url && String(r.file_url).startsWith('http')) ? r.file_url : '';
            await window.rbiOpenPdfDocument({
                title: r.title || 'PDF',
                fileName: downloadName,
                httpsUrl,
                blob
            });
        };

        // 1. ПРИОРИТЕТ 1: Blob уже в RAM (локальный не залитый)
        if (r.file_blob) {
            const ramBlob = (typeof window.rbiReportPayloadToBlob === 'function')
                ? window.rbiReportPayloadToBlob(r.file_blob, r.mime_type || r.mimeType || 'application/pdf')
                : (r.file_blob instanceof Blob ? r.file_blob : null);
            if (ramBlob) {
                await openBlob(ramBlob);
                return;
            }
        }

        // 1b. IDB (офлайн-кэш без удержания PDF в reportsArray)
        if (window.RBI?.services?.reports?.getLocalBlob) {
            try {
                const localBlob = await window.RBI.services.reports.getLocalBlob(r.id);
                if (localBlob) {
                    await openBlob(localBlob);
                    return;
                }
            } catch (e) {
                console.warn('[Reports] IDB blob read failed', e);
            }
        } else if (typeof dbGet === 'function' && window.STORES?.REPORTS) {
            try {
                const row = await dbGet(STORES.REPORTS, r.id);
                const fromIdb = (typeof window.rbiReportPayloadToBlob === 'function')
                    ? window.rbiReportPayloadToBlob(row && row.file_blob, (row && (row.mime_type || row.mimeType)) || 'application/pdf')
                    : (row && row.file_blob);
                if (fromIdb) {
                    await openBlob(fromIdb);
                    return;
                }
            } catch (_) { /* ignore */ }
        }

        // Мета «cached_cloud» без blob — ложный статус (баг skip автокэша).
        if ((r.cache_status || r.cacheStatus) === 'cached_cloud') {
            r.cache_status = 'cloud_only';
            r.cacheStatus = 'cloud_only';
        }

        // 1c. PHOTOS / PhotoManager по file_url
        if (r.file_url && String(r.file_url).startsWith('http')) {
            try {
                if (typeof dbGet === 'function' && window.STORES?.PHOTOS) {
                    const photoRow = await dbGet(STORES.PHOTOS, r.file_url);
                    if (photoRow && photoRow.data) {
                        const mime = photoRow.mimeType || photoRow.mime_type || 'application/pdf';
                        const fromPhotos = photoRow.data instanceof Blob
                            ? photoRow.data
                            : new Blob([photoRow.data], { type: mime });
                        await openBlob(fromPhotos);
                        return;
                    }
                }
                if (typeof PhotoManager !== 'undefined' && typeof PhotoManager.getAsyncUrl === 'function') {
                    const localU = await PhotoManager.getAsyncUrl(r.file_url);
                    if (localU && String(localU).startsWith('blob:')) {
                        const res = await fetch(localU);
                        if (res.ok) {
                            await openBlob(await res.blob());
                            return;
                        }
                    }
                }
            } catch (_) { /* ignore */ }
        }

        // 2. ПРИОРИТЕТ 2: Файла локально нет — скачать по ссылке в IDB (не держать в RAM списка)
        if (r.file_url && r.file_url.startsWith('http')) {
            if (!navigator.onLine) {
                return showToast(_t('quality.analytics.toast.report_not_cached', '❌ Отчет не кэширован на устройстве. Нужен интернет для скачивания.'));
            }
            showToast(_t('quality.analytics.toast.downloading_cloud', '⏳ Скачиваем файл из облака...'));
            try {
                const response = await fetch(r.file_url);
                if (!response.ok) throw new Error(_t('quality.analytics.error.download_failed', 'Не удалось скачать файл'));
                const blob = await response.blob();

                const toSave = {
                    ...r,
                    file_blob: (typeof blobToArrayBuffer === 'function')
                        ? await blobToArrayBuffer(blob)
                        : blob,
                    file_size: blob.size || 0,
                    mime_type: blob.type || (isPptx ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/pdf'),
                    mimeType: blob.type || (isPptx ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/pdf'),
                    cache_status: 'cached_cloud',
                    cacheStatus: 'cached_cloud',
                    updatedAt: new Date().toISOString()
                };
                toSave.updated_at = toSave.updatedAt;
                await _storage().put(_storage().stores().REPORTS, toSave);

                // В списке — без blob.
                r.file_blob = null;
                r.file_size = blob.size || 0;
                r.cache_status = 'cached_cloud';
                r.cacheStatus = 'cached_cloud';

                await openBlob(blob);
                return;
            } catch (e) {
                console.error("Ошибка скачивания отчета", e);
                if (typeof window.rbiOpenPdfDocument === 'function') {
                    await window.rbiOpenPdfDocument({
                        title: r.title || 'PDF',
                        fileName: downloadName,
                        httpsUrl: r.file_url
                    });
                    return;
                }
                window.open(r.file_url, '_blank');
                return;
            }
        }

        showToast(_t('quality.analytics.toast.report_corrupt', '❌ Ошибка: Файл отчета пуст или поврежден.'));
    },

    async shareReport(id) {
        const r = _reports().getAllSync().find(x => x.id === id);
        if (!r) return showToast(_t('quality.analytics.toast.report_not_found', 'Файл отчета не найден'));

        try {
            let fileToShare = null;

            // Если файл есть локально (RAM)
            if (r.file_blob) {
                fileToShare = new File([r.file_blob], r.title + '.pdf', { type: 'application/pdf' });
            } else if (window.RBI?.services?.reports?.getLocalBlob) {
                const localBlob = await window.RBI.services.reports.getLocalBlob(r.id);
                if (localBlob) {
                    fileToShare = new File([localBlob], r.title + '.pdf', { type: localBlob.type || 'application/pdf' });
                }
            }
            // Если файла локально нет, но есть ссылка (прилетел из облака)
            if (!fileToShare && r.file_url && r.file_url.startsWith('http')) {
                showToast(_t('quality.analytics.toast.downloading_for_share', '⏳ Скачиваем файл из облака для отправки...'));
                const response = await fetch(r.file_url);
                if (!response.ok) throw new Error(_t('quality.analytics.error.download_failed', 'Не удалось скачать файл'));
                const blob = await response.blob();
                fileToShare = new File([blob], r.title + '.pdf', { type: 'application/pdf' });
            }

            if (!fileToShare) return showToast(_t('quality.analytics.toast.share_prepare_fail', '❌ Не удалось подготовить файл к отправке'));

            // Отправка через системное меню Share
            if (navigator.canShare && navigator.canShare({ files: [fileToShare] })) {
                await navigator.share({
                    title: r.title,
                    text: _t('quality.analytics.share.report_prefix', 'Отчет:') + ' ' + r.title,
                    files: [fileToShare]
                });
            } else {
                // Резервный вариант для ПК (просто скачивание)
                const url = URL.createObjectURL(fileToShare);
                const a = document.createElement('a');
                a.href = url;
                a.download = r.title + '.pdf';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast(_t('quality.analytics.toast.file_saved', '✅ Файл сохранен на устройство'));
            }
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.error("Ошибка при отправке файла:", e);
                showToast(_t('quality.analytics.toast.share_fail', '❌ Ошибка при отправке файла'));
            }
        }
    },

    async deleteReport(id) {
        const record = _reports().getAllSync().find(x => x.id === id);

        // Проверяем права: удалить может либо автор, либо Админ/Зам
        const currentEngineer = _getSetting('engineerName') || _t('quality.analytics.fallback.engineer', 'Инженер');
        const role = window.RBI.services.permissions ? window.RBI.services.permissions.getCurrentRole() : 'guest';
        const isManager = window.RBI.services.permissions ? window.RBI.services.permissions.isAdmin() : ['manager', 'deputy_manager'].includes(role);

        if (record.created_by && record.created_by !== currentEngineer && !isManager) {
            return showToast(_t('quality.analytics.toast.delete_own_only', '⚠️ Вы можете удалять только свои отчеты!'));
        }

        if (!confirm(_t('quality.analytics.confirm.delete_report', 'Удалить этот отчет?'))) return;

        const idx = _reports().getAllSync().findIndex(x => x.id === id);
        if (idx > -1) {
            // Ставим железобетонные метки удаления
            _reports().getAllSync()[idx].is_deleted = true;
            _reports().getAllSync()[idx]._deleted = true;
            _reports().getAllSync()[idx]._deletedAt = new Date().toISOString();
            _reports().getAllSync()[idx].deleted_at = _reports().getAllSync()[idx]._deletedAt;

            _reports().getAllSync()[idx].updated_at = new Date().toISOString();
            _reports().getAllSync()[idx].updatedAt = _reports().getAllSync()[idx].updated_at;

            // Возвращаем статус в not_synced, чтобы облако увидело изменение
            _reports().getAllSync()[idx].source = 'local';
            _reports().getAllSync()[idx].sync_status = 'not_synced';
            _reports().getAllSync()[idx].syncStatus = 'not_synced';

            await _storage().put(_storage().stores().REPORTS, _reports().getAllSync()[idx]); // Мягкое удаление локально
        }

        // Мутация массива на месте (не переприсваивание) — сохраняет живую
        // ссылку, на которую полагаются app.js/ReportsState.getReports()/export.js.
        var _filtered = _reports().getAllSync().filter(x => !x.is_deleted && !x._deleted);
        _reports().getAllSync().length = 0;
        Array.prototype.push.apply(_reports().getAllSync(), _filtered);

        if (typeof window.renderReportsList === 'function') window.renderReportsList();

        // Команда синхронизатору
        localStorage.setItem('rbi_cloud_dirty', '1');
        _sync('silent');
    },

    toggleAllReports(checkbox) {
        const checkboxes = document.querySelectorAll('.report-checkbox');
        checkboxes.forEach(cb => cb.checked = checkbox.checked);
    },

    async deleteSelectedReports() {
        const checkboxes = document.querySelectorAll('.report-checkbox:checked');
        const ids = Array.from(checkboxes).map(cb => cb.value);

        if (ids.length === 0) return showToast(_t('quality.analytics.toast.select_reports_delete', 'Выберите отчеты для удаления'));
        if (!confirm(_t('quality.analytics.confirm.delete_reports_n', 'Удалить выбранные отчеты ({n} шт)?', { n: ids.length }))) return;

        for (let id of ids) {
            const record = _reports().getAllSync().find(x => x.id === id);
            if (record) {
                record.is_deleted = true;
                record._deleted = true;
                record._deletedAt = new Date().toISOString();
                record.updated_at = new Date().toISOString();
                record.updatedAt = record.updated_at;
                record.source = 'local';
                record.sync_status = 'not_synced';
                record.syncStatus = 'not_synced';

                await _storage().put(_storage().stores().REPORTS, record);
            }
        }

        // Мутация массива на месте (не переприсваивание) — см. deleteReport().
        var _filtered = _reports().getAllSync().filter(x => !x.is_deleted && !x._deleted);
        _reports().getAllSync().length = 0;
        Array.prototype.push.apply(_reports().getAllSync(), _filtered);

        document.getElementById('reports-select-all').checked = false;
        if (typeof window.renderReportsList === 'function') window.renderReportsList();

        localStorage.setItem('rbi_cloud_dirty', '1');
        _sync('silent');

        showToast(_t('quality.analytics.toast.reports_deleted', '✅ Удалено отчетов: {n}', { n: ids.length }));
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: консолидированный отчёт ко
    // Дню Качества (настройки периода + генерация PDF через DeepSeek AI).
    // =========================================================================
    rbi_openQualityDaySettings(taskId) {
        const modal = document.getElementById('modal-overlay');
        document.getElementById('modal-icon').innerHTML = `<div class="w-14 h-14 bg-brand-soft text-brand rounded-2xl flex items-center justify-center text-3xl mx-auto mb-2 border border-brand-soft">📅</div>`;
        document.getElementById('modal-title').innerHTML = `<div class="text-center font-black uppercase text-lg">${_t('quality.analytics.qday.settings_title', 'Настройки Отчета')}</div>`;

        document.getElementById('modal-body').innerHTML = `
            <div class="text-center text-rbi-body text-muted mb-4 leading-relaxed">
                ${_t('quality.analytics.qday.settings_hint', 'Выберите период для формирования Мега-Отчета. Система агрегирует метрики всех подрядчиков, выберет лучшие практики и запросит ИИ-резюме.')}
            </div>
            
            <div class="mb-6">
                <label class="text-rbi-caption font-bold text-muted uppercase mb-2 block">${_t('quality.analytics.qday.period_label', 'Отчетный период')}</label>
                <select id="qday-period-select" class="w-full bg-[var(--hover-bg)] border border-[var(--card-border)] rounded-xl p-3 text-rbi-body font-bold text-ink dark:text-white outline-none">
                    <option value="current_month">${_t('quality.analytics.qday.period_current_month', 'За текущий месяц')}</option>
                    <option value="last_month">${_t('quality.analytics.qday.period_last_month', 'За прошлый месяц')}</option>
                    <option value="quarter">${_t('quality.analytics.qday.period_quarter', 'За последние 3 месяца (Квартал)')}</option>
                    <option value="all_time">${_t('quality.analytics.qday.period_all_time', 'За всё время')}</option>
                </select>
            </div>

            <div class="flex gap-2">
                <button onclick="closeModal()" class="flex-1 bg-slate-100 text-muted py-3.5 rounded-xl font-bold text-rbi-label uppercase active:scale-95 shadow-sm">
                    ${_t('quality.analytics.btn.cancel', 'Отмена')}
                </button>
                <button onclick="closeModal(); rbi_executeQualityDayReport('${taskId}')" class="flex-1 bg-brand text-white py-3.5 rounded-xl font-black text-rbi-label uppercase shadow-md active:scale-95 flex items-center justify-center gap-2">
                    🚀 ${_t('quality.analytics.qday.generate', 'Сгенерировать')}
                </button>
            </div>
        `;

        document.body.classList.add('modal-open');
        modal.style.display = 'flex';
    },

    async rbi_executeQualityDayReport(taskId) {
        var _allInspections = _inspections();
        if (!_getSetting('aiEnabled')) {
            return showToast(_t('quality.analytics.toast.qday_ai_required', '⚠️ Для формирования отчета требуется включить DeepSeek AI в настройках!'));
        }

        const periodValue = document.getElementById('qday-period-select').value;

        // Показываем лоадер
        const modal = document.getElementById('modal-overlay');
        document.getElementById('modal-icon').innerHTML = `<div class="w-14 h-14 bg-brand-soft text-brand rounded-2xl flex items-center justify-center text-3xl mx-auto mb-2 border border-brand-soft animate-pulse">🤖</div>`;
        document.getElementById('modal-title').innerHTML = `<div class="text-center font-black uppercase text-lg">${_t('quality.analytics.qday.building_title', 'Сборка Дня Качества')}</div>`;
        document.getElementById('modal-body').innerHTML = `
            <div class="flex flex-col items-center justify-center py-4">
                <div class="text-rbi-label font-bold text-muted text-center space-y-2">
                    <div>📥 ${_t('quality.analytics.qday.step_aggregate', 'Агрегируем метрики подрядчиков...')}</div>
                    <div>📊 ${_t('quality.analytics.qday.step_impact', 'Рассчитываем Impact Score команды...')}</div>
                    <div>🏆 ${_t('quality.analytics.qday.step_practices', 'Выбираем лучшие практики...')}</div>
                    <div class="text-brand font-black mt-2">${_t('quality.analytics.qday.step_ai', 'DeepSeek пишет управленческое резюме...')}</div>
                </div>
            </div>
        `;
        document.body.classList.add('modal-open');
        modal.style.display = 'flex';

        try {
            const now = new Date();
            let startDate, endDate;
            let periodTitle = "";

            if (periodValue === 'current_month') {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                periodTitle = `ИТОГИ: ${now.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}`;
            } else if (periodValue === 'last_month') {
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
                periodTitle = `ИТОГИ: ${startDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}`;
            } else if (periodValue === 'quarter') {
                startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
                endDate = new Date();
                periodTitle = `КВАРТАЛЬНЫЙ ОТЧЕТ`;
            } else {
                startDate = new Date(2000, 1, 1);
                endDate = new Date();
                periodTitle = `ОТЧЕТ ЗА ВСЁ ВРЕМЯ`;
            }

            // 1. БАЗА ПРОВЕРОК
            const currentData = _allInspections.filter(c => new Date(c.date) >= startDate && new Date(c.date) <= endDate);

            if (currentData.length === 0) {
                closeModal();
                return showToast(_t('quality.analytics.toast.qday_no_data', '⚠️ За выбранный период нет данных для отчета!'));
            }

            let currAvgUrk = 0;
            if (typeof window.avgContractorRatingsFromChecks === 'function') {
                currAvgUrk = window.avgContractorRatingsFromChecks(currentData).avgUrk;
            } else {
                let sumUrk = 0; currentData.forEach(i => { if (i.metrics) sumUrk += Number(i.metrics.final) || 0; });
                currAvgUrk = Math.round(sumUrk / currentData.length);
            }

            const currIntMetrics = typeof getObjectIntegralMetrics === 'function' ? getObjectIntegralMetrics(currentData, _templates().getUserTemplates()) : null;
            const IKO = currIntMetrics ? currIntMetrics.IKO : "0.00";
            const redZone = currIntMetrics ? currIntMetrics.redZonePerc : 0;

            // 2. HR МЕТРИКИ (КОМАНДА)
            let hrStats = window.RBI.services.game.calculateManagerMetrics();
            let totalImpact = 0;
            hrStats.forEach(h => { totalImpact += h.avgImpact; });
            const avgTeamImpact = hrStats.length > 0 ? (totalImpact / hrStats.length) : 0;
            const bestEng = hrStats.length > 0 ? hrStats.sort((a, b) => b.pi - a.pi)[0] : { name: "Нет данных", checks: 0 };

            // 3. ТОП ПРАКТИК
            let topPracticesHtml = `<div style="color:#64748b; font-size:10px;">Практик в этом периоде не публиковалось.</div>`;
            if (Array.isArray(_getPractices()) && _getPractices().length > 0) {
                const topPrac = [..._getPractices()].filter(p => new Date(p.date) >= startDate && new Date(p.date) <= endDate).sort((a, b) => b.deltaUrk - a.deltaUrk).slice(0, 2);
                if (topPrac.length > 0) {
                    topPracticesHtml = topPrac.map(p => `
                        <div style="border:1px solid #cbd5e1; border-left:4px solid #16a34a; padding:10px; border-radius:6px; margin-bottom:10px; background:white; page-break-inside: avoid;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                <strong style="font-size:12px; color:#0f172a;">${p.title}</strong>
                                <span style="color:#16a34a; font-weight:900;">+${p.deltaUrk}% УрК</span>
                            </div>
                            <div style="font-size:10px; color:#64748b; margin-bottom:5px;">Автор: ${p.author} | ${p.templateTitle}</div>
                            <table style="width:100%; border-collapse:collapse; font-size:10px;">
                                <tr>
                                    <td style="width:50%; vertical-align:top; padding-right:5px;">
                                        <div style="color:#dc2626; font-weight:bold; margin-bottom:2px;">❌ Проблема:</div>
                                        <div style="color:#1e293b;">${p.problem}</div>
                                    </td>
                                    <td style="width:50%; vertical-align:top; padding-left:5px;">
                                        <div style="color:#16a34a; font-weight:bold; margin-bottom:2px;">✅ Решение:</div>
                                        <div style="color:#1e293b;">${p.solution}</div>
                                    </td>
                                </tr>
                            </table>
                        </div>
                    `).join('');
                }
            }

            // 4. КОРЕННЫЕ ПРИЧИНЫ (Парето)
            const causes = {};
            currentData.forEach(c => {
                if (c.state && c.details) {
                    Object.keys(c.state).forEach(id => {
                        if (c.state[id] === 'fail' || c.state[id] === 'fail_escalated') {
                            const code = c.details[id]?.causeCode || 'C00';
                            causes[code] = (causes[code] || 0) + 1;
                        }
                    });
                }
            });

            let causesHtml = '';
            const sortedCauses = Object.keys(causes).sort((a, b) => causes[b] - causes[a]).slice(0, 5);
            if (sortedCauses.length > 0) {
                causesHtml = sortedCauses.map(code => {
                    const cName = (_defectCauses().find(x => x.code === code)?.name) || 'Иное';
                    return `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #e2e8f0; padding:6px 0; font-size:11px;">
                        <span style="color:#334155;">${cName}</span>
                        <span style="font-weight:bold; color:#0f172a;">${causes[code]} шт.</span>
                    </div>`;
                }).join('');
            } else {
                causesHtml = `<div style="color:#64748b; font-size:10px;">Дефектов не выявлено.</div>`;
            }

            // 5. DEEPSEEK - АНАЛИЗ ДЛЯ РЕЗЮМЕ
            const promptSystem = `Ты — Директор по качеству (CQC). Сформируй официальное управленческое резюме для отчета "День Качества" за выбранный период.
            Тон: деловой, объективный, строгий. Формат: текст, разбитый на абзацы. Без воды.
            Отрази 3 вещи: 1. Оценку ИКО и тренда. 2. Оценку работы инженеров (Impact Score). 3. Главный риск следующего периода.`;

            const promptUser = `ИКО: ${IKO}. Красная зона: ${redZone}%. Средний Impact команды: ${avgTeamImpact.toFixed(2)}. Проверок за период: ${currentData.length}. ТОП проблема: ${sortedCauses.length > 0 ? sortedCauses[0] : 'Нет данных'}.`;

            const aiSummary = await _callAI([{ role: 'system', content: promptSystem }, { role: 'user', content: promptUser }], { temperature: 0.3, max_tokens: 800 });

            closeModal();

            // 6. СБОРКА HTML ДЛЯ ПЕЧАТИ
            const pdfContent = `
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="font-size: 24pt; text-transform: uppercase; color: #0f172a; margin: 0; font-weight:900;">КОНСОЛИДИРОВАННЫЙ ОТЧЕТ КО ДНЮ КАЧЕСТВА</h1>
                    <div style="font-size: 14pt; color: #4f46e5; font-weight: 900; margin-top: 5px; text-transform:uppercase;">${periodTitle}</div>
                </div>

                <!-- БЛОК 1: AI-РЕЗЮМЕ -->
                <div style="background: #f8fafc; border: 2px solid #cbd5e1; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                    <h2 style="color: #4f46e5; margin: 0 0 10px 0; font-size: 14pt; text-transform: uppercase;">🧠 УПРАВЛЕНЧЕСКОЕ РЕЗЮМЕ (DEEPSEEK AI)</h2>
                    <div style="font-size: 11pt; line-height: 1.6; color: #1e293b; font-weight: 500;">${meetingRichToSafeHtml(aiSummary)}</div>
                </div>

                <!-- БЛОК 2: МАКРОПОКАЗАТЕЛИ -->
                <table style="width: 100%; border-spacing: 15px 0; border-collapse: separate; table-layout: fixed; margin-left: -15px; margin-bottom: 20px;">
                    <tr>
                        <td style="background:#f8fafc; border:2px solid #cbd5e1; border-radius:12px; padding:15px; text-align:center;">
                            <div style="font-size:9pt; color:#64748b; text-transform:uppercase; font-weight:bold;">Индекс Риска (ИКО)</div>
                            <div style="font-size:28pt; font-weight:900; color:${parseFloat(IKO) >= 0.6 ? '#dc2626' : '#16a34a'};">${IKO}</div>
                        </td>
                        <td style="background:#fef2f2; border:2px solid #fca5a5; border-radius:12px; padding:15px; text-align:center;">
                            <div style="font-size:9pt; color:#991b1b; text-transform:uppercase; font-weight:bold;">Объем Красной Зоны</div>
                            <div style="font-size:28pt; font-weight:900; color:#dc2626;">${redZone}%</div>
                        </td>
                        <td style="background:#f0fdf4; border:2px solid #bbf7d0; border-radius:12px; padding:15px; text-align:center;">
                            <div style="font-size:9pt; color:#166534; text-transform:uppercase; font-weight:bold;">Impact Score Команды</div>
                            <div style="font-size:28pt; font-weight:900; color:#16a34a;">${avgTeamImpact > 0 ? '+' : ''}${avgTeamImpact.toFixed(2)}</div>
                        </td>
                    </tr>
                </table>

                <div style="page-break-before: always;"></div>

                <!-- БЛОК 3: ПРАКТИКИ И ПРИЧИНЫ -->
                <table style="width: 100%; border-spacing: 20px 0; border-collapse: separate; table-layout: fixed; margin-left: -20px; margin-bottom: 20px;">
                    <tr>
                        <td style="width: 50%; vertical-align: top;">
                            <h2 style="font-size: 14pt; color: #0f172a; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px;">🏆 Лучшие практики периода</h2>
                            ${topPracticesHtml}
                        </td>
                        <td style="width: 50%; vertical-align: top;">
                            <h2 style="font-size: 14pt; color: #0f172a; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px;">🔍 Топ причин брака (Парето)</h2>
                            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px;">
                                ${causesHtml}
                            </div>
                            
                            <h2 style="font-size: 14pt; color: #0f172a; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 25px; margin-bottom: 15px;">👤 Рейтинг Инженеров</h2>
                            <div style="background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px;">
                                <div style="font-size: 11pt; font-weight: bold; color: #1e293b; margin-bottom: 5px;">Лучший по Опыту (XP): <span style="color:#4f46e5;">${bestEng.name}</span></div>
                                <div style="font-size: 9pt; color: #64748b;">Проверок: ${bestEng.checks} | Строгость: ${bestEng.strictness > 0 ? '+' + bestEng.strictness.toFixed(1) : bestEng.strictness?.toFixed(1)}</div>
                            </div>
                        </td>
                    </tr>
                </table>
            `;

            // Закрываем задачу в планировщике, так как отчет сформирован
            if (taskId) {
                const task = _getTasks().find(t => t.id === taskId);
                if (task) {
                    task.status = 'done';
                    task.resultComment = _t('quality.analytics.qday.task_done', 'Отчет сгенерирован');
                    await _storage().put(_storage().stores().TASKS, task);
                    rbi_renderTasksList(); // Обновляем списки задач на экране
                }
            }

            // Запускаем печать. Передаем "browser", чтобы открылось системное окно печати/сохранения PDF
            printPdfShell(_t('quality.analytics.qday.print_title', 'День Качества'), pdfContent, "A4", "landscape", "browser");

        } catch (e) {
            closeModal();
            showToast(_t('quality.analytics.toast.qday_build_fail', '❌ Ошибка сборки отчета: {msg}', { msg: e.message }));
        }
    }
};

if (typeof window !== 'undefined') {
    window.AnalyticsActions = AnalyticsActions;

    // =========================================================================
    // WINDOW-ПРОКСИ (обратная совместимость: index.html inline-обработчики,
    // динамически генерируемый HTML — onclick в строках, генерируемых
    // analytics.render.js — и вызовы из js/export.js/js/ai.js/js/sync.js).
    // =========================================================================
    window.getAnalyticsDataSource = AnalyticsActions.getAnalyticsDataSource.bind(AnalyticsActions);
    window.getFilteredAnalyticsData = AnalyticsActions.getFilteredAnalyticsData.bind(AnalyticsActions);
    window.getOnePagerTrendSourceData = AnalyticsActions.getOnePagerTrendSourceData.bind(AnalyticsActions);
    window.setAnalyticsDataMode = AnalyticsActions.setAnalyticsDataMode.bind(AnalyticsActions);
    window.switchAnalyticsSubTab = AnalyticsActions.switchAnalyticsSubTab.bind(AnalyticsActions);
    window.toggleDateRange = AnalyticsActions.toggleDateRange.bind(AnalyticsActions);
    window.filterContractorsList = AnalyticsActions.filterContractorsList.bind(AnalyticsActions);
    window.openChartFilterModal = AnalyticsActions.openChartFilterModal.bind(AnalyticsActions);
    window.saveChartFilters = AnalyticsActions.saveChartFilters.bind(AnalyticsActions);
    window.updateTrendCharts = AnalyticsActions.updateTrendCharts.bind(AnalyticsActions);
    window.editExpertText = AnalyticsActions.editExpertText.bind(AnalyticsActions);
    window.cancelExpertEdit = AnalyticsActions.cancelExpertEdit.bind(AnalyticsActions);
    window.resetExpertEdit = AnalyticsActions.resetExpertEdit.bind(AnalyticsActions);
    window.saveExpertEdit = AnalyticsActions.saveExpertEdit.bind(AnalyticsActions);
    window.copyExpertText = AnalyticsActions.copyExpertText.bind(AnalyticsActions);
    window.createMagicTwi = AnalyticsActions.createMagicTwi.bind(AnalyticsActions);
    window.switchHistoryView = AnalyticsActions.switchHistoryView.bind(AnalyticsActions);
    window.openReport = AnalyticsActions.openReport.bind(AnalyticsActions);
    window.shareReport = AnalyticsActions.shareReport.bind(AnalyticsActions);
    window.deleteReport = AnalyticsActions.deleteReport.bind(AnalyticsActions);
    window.toggleAllReports = AnalyticsActions.toggleAllReports.bind(AnalyticsActions);
    window.deleteSelectedReports = AnalyticsActions.deleteSelectedReports.bind(AnalyticsActions);
    window.rbi_openQualityDaySettings = AnalyticsActions.rbi_openQualityDaySettings.bind(AnalyticsActions);
    window.rbi_executeQualityDayReport = AnalyticsActions.rbi_executeQualityDayReport.bind(AnalyticsActions);
}

// =========================================================================
// РАЗМЕТКА МОДАЛКИ «expert-modal-overlay» (перенос из index.html:1144-1222,
// перенос 30 modal/overlay-блоков #app-modals в JS-рендер). HTML-строка 1:1
// идентична прежней статичной разметке.
// =========================================================================
function renderExpertModalOverlayMarkup() {
    return `
    <div id="expert-modal-overlay"
        class="fixed inset-0 bg-slate-900/70 z-[1600] hidden items-center justify-center p-4 backdrop-blur-sm"
        data-analytics-action="cancelExpertEdit">
        <div class="bg-[var(--card-bg)] w-full max-w-2xl p-6 rounded-2xl shadow-2xl transition-transform"
            id="expert-modal-content" onclick="event.stopPropagation()">
            <div
                class="flex justify-between items-center mb-4 border-b border-[var(--card-border)] pb-3 text-ink dark:text-white">
                <h3 class="font-black text-rbi-body uppercase tracking-tight flex items-center gap-2">
                    <svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z">
                        </path>
                    </svg>
                    Редактировать заключение
                </h3>
                <div class="w-8 h-8 bg-[var(--hover-bg)] rounded-full flex items-center justify-center cursor-pointer text-muted"
                    data-analytics-action="cancelExpertEdit"><svg class="w-4 h-4" fill="none" stroke="currentColor"
                        viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                    </svg></div>
            </div>
            <!-- КНОПКИ ГЕНЕРАТОРА СЦЕНАРИЕВ -->
            <div class="flex gap-2 mb-3 overflow-x-auto no-scrollbar pb-2 border-b border-[var(--card-border)]">
                <button data-action="generateSmartComment" data-action-arg="standard"
                    class="shrink-0 flex items-center gap-1.5 bg-brand-soft text-brand px-3 py-2 rounded-lg text-rbi-caption font-bold border border-brand-soft/30 active:scale-95"><svg
                        class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z">
                        </path>
                    </svg> Базовый</button>
                <button data-action="generateSmartComment" data-action-arg="strict"
                    class="shrink-0 flex items-center gap-1.5 bg-danger-soft text-danger px-3 py-2 rounded-lg text-rbi-caption font-bold border border-danger-soft/30 active:scale-95"><svg
                        class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                    </svg> Претензия</button>
                <button data-action="generateSmartComment" data-action-arg="tech"
                    class="shrink-0 flex items-center gap-1.5 bg-slate-100 text-ink px-3 py-2 rounded-lg text-rbi-caption font-bold border border-slate-300 active:scale-95"><svg
                        class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z">
                        </path>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z">
                        </path>
                    </svg> Тех.аудит</button>
                <button data-action="generateSmartComment" data-action-arg="boss"
                    class="shrink-0 flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-2 rounded-lg text-rbi-caption font-bold border border-amber-200 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400 active:scale-95"><svg
                        class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z">
                        </path>
                    </svg> Руководству</button>
                <button data-action="generateSmartComment" data-action-arg="action_plan"
                    class="shrink-0 flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-rbi-caption font-bold border border-blue-200 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400 active:scale-95"><svg
                        class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01">
                        </path>
                    </svg> План действий</button>
                <button data-action="generateSmartComment" data-action-arg="improve"
                    class="shrink-0 flex items-center gap-1.5 bg-purple-50 text-purple-700 px-3 py-2 rounded-lg text-rbi-caption font-bold border border-purple-200 dark:bg-purple-900/30 dark:border-purple-800 dark:text-purple-400 active:scale-95"><svg
                        class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z">
                        </path>
                    </svg> ✨ Улучшить мой текст</button>
            </div>
            <textarea id="modal-expert-input"
                class="w-full bg-[var(--hover-bg)] border border-[var(--card-border)] rounded-xl p-4 text-rbi-body outline-none h-[50vh] resize-none text-ink"></textarea>
            <div class="flex gap-2 mt-4">
                <button data-analytics-action="resetExpertEdit"
                    class="bg-danger-soft text-danger border border-danger-soft/30 px-4 py-3.5 rounded-xl font-bold text-rbi-caption uppercase active:scale-95">Сброс
                    к ИИ</button>
                <button data-analytics-action="saveExpertEdit"
                    class="flex-1 bg-brand text-white px-4 py-3.5 rounded-xl font-bold text-rbi-label uppercase shadow-md active:scale-95">Сохранить
                    правки</button>
            </div>
        </div>
    </div>
`;
}

(function mountExpertModalOverlayMarkup() {
    if (document.getElementById('expert-modal-overlay')) return;
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
        ? window.RBI.services.shell.getModalsRoot()
        : document.getElementById('app-modals');
    if (!root) return;
    root.insertAdjacentHTML('beforeend', renderExpertModalOverlayMarkup());
}());

console.log('[AnalyticsActions] analytics.actions.js loaded (owner-module: full business logic)');
