/**
 * analytics.render.js
 * Рендер-диспетчер модуля Analytics.
 *
 * Фаза N (перенесено из analytics.legacy.js): реальная HTML-генерация
 * дашбордов, фильтров, детального вида подрядчика, тренд-графиков
 * (Chart.js), TWI-карт, фотогалерей, Quality Day отчёта, архива отчётов.
 * Источник данных — AnalyticsState.* там, где состояние изолировано, и
 * window.* там, где состояние остаётся в app.js/templates.js.
 */

import { AnalyticsState } from './analytics.state.js';
import {
    shouldFullRebuildAnalyticsLive,
    shouldSkipAnalyticsLivePaint,
    analyticsSourceDataSignatureFromArray,
    isReusablePhotoThumbUrl
} from '../../../../shared/sync-live-paint.policy.js';
import {
    buildRiskZonesInsight,
    buildRiskZonesInsightFromChecks,
    formatRiskInsightDisplayHtml,
    isAutoRiskInsightText
} from './analytics.risk-insight.js';
import { reportKindOf, reportKindLabel, orderKindGroups, REPORT_KIND_OTHER } from '../reports/report-kind.js';

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



function _getSetting(key) {
    return window.RBI.services.settings.get(key);
}

function _analyticsMode() {
    if (window.AnalyticsState) return window.AnalyticsState.mode;
    return window.analyticsDataMode || 'local';
}

// Инкрементальный кэш метрик подрядчика (contractor-metrics.service.js) —
// избегает пересчёта getContractorMetrics() по всей группе при каждом рендере
// вкладок «Подрядчики»/«Сводка». cData — уже сгруппированный по groupKey массив
// записей ("подрядчик [объект]", тот же ключ, что использует сервис) — как
// правило это подмножество ПОЛНОЙ базы подрядчика, урезанное активными фильтрами
// аналитики (период/объект/подрядчик/шаблон/режим cloud, см.
// getFilteredAnalyticsData). getMetricsForGroupMatching сверяет отпечаток id
// записей cData с тем, из чего реально посчитан кэш — отдаёт готовое значение
// ТОЛЬКО если они совпадают (фильтр не сузил группу), иначе считает напрямую
// по cData, не показывая пользователю метрики "как без фильтра".
function _contractorMetricsCached(groupKey, cData) {
    var svc = window.RBI && window.RBI.services && window.RBI.services.contractorMetrics;
    if (svc && typeof svc.getMetricsForGroupMatching === 'function') {
        var matched = svc.getMetricsForGroupMatching(groupKey, cData);
        if (matched) return matched;
    }
    return getContractorMetrics(cData, _templates().getUserTemplates());
}

/**
 * P2-0024: отрисовать содержимое свёрнутого <details> при первом раскрытии (уже открытый — сразу).
 * Блок пересоздаётся при каждой перерисовке вкладки, поэтому «один раз» — на экземпляр блока.
 */
function _drawWhenOpen(detailsEl, draw) {
    let drawn = false;
    const drawOnce = () => { if (drawn) return; drawn = true; draw(); };
    if (!detailsEl) return drawOnce;
    if (detailsEl.open) { drawOnce(); return drawOnce; }
    const onToggle = () => {
        if (!detailsEl.open) return;
        detailsEl.removeEventListener('toggle', onToggle);
        drawOnce();
    };
    detailsEl.addEventListener('toggle', onToggle);
    // Возвращаем «нарисовать сейчас» — ПК-раскладка раскрывает блоки сама и рисует сразу.
    return drawOnce;
}

function _getSkRecords() {
    if (window.RBI && window.RBI.services && window.RBI.services.sk) {
        return window.RBI.services.sk.getRecordsSync();
    }
    return Array.isArray(window.skRecords) ? window.skRecords : [];
}
function _getSkContractorMap() {
    if (window.RBI && window.RBI.services && window.RBI.services.sk) {
        return window.RBI.services.sk.getContractorMapSync();
    }
    return window.skContractorMap || {};
}

function _chartInstances() {
    if (window.AnalyticsState) return window.AnalyticsState.chartInstances;
    if (typeof window.chartInstances !== 'undefined') return window.chartInstances;
    return {};
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

function _getSystemTemplates() {
    return _templates().getSystemTemplates();
}

// Градиентная раскраска УрК: непрерывный переход цвета внутри каждой из 3 зон риска
// (0-69 красный..бордовый, 70-84 жёлтый/янтарный, 85-100 зелёный..тёмно-зелёный),
// с более тёмным/насыщенным цветом на краях диапазона (0 — бордовый, 100 — темно-зелёный).
// Используется вместо плоских text-danger/text-orange-500/text-green-600 там, где
// нужна быстрая визуальная оценка "на глаз" (карточки подрядчиков).
function _urkGradientColor(val) {
    const v = Math.max(0, Math.min(100, Number(val) || 0));
    const stops = [
        { p: 0, c: [127, 29, 29] },   // бордовый (красный-900)
        { p: 69, c: [220, 38, 38] },  // красный-600
        { p: 70, c: [217, 119, 6] },  // янтарный-600
        { p: 84, c: [245, 158, 11] }, // янтарный-500
        { p: 85, c: [34, 197, 94] },  // зелёный-500
        { p: 100, c: [20, 83, 45] }   // темно-зелёный (зелёный-900)
    ];
    for (let i = 0; i < stops.length - 1; i++) {
        if (v >= stops[i].p && v <= stops[i + 1].p) {
            const range = stops[i + 1].p - stops[i].p || 1;
            const t = (v - stops[i].p) / range;
            const c = stops[i].c.map((ch, idx) => Math.round(ch + t * (stops[i + 1].c[idx] - ch)));
            return `rgb(${c[0]},${c[1]},${c[2]})`;
        }
    }
    return `rgb(${stops[stops.length - 1].c.join(',')})`;
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

// inline onclick в карточке объекта («Показатели по объектам») не может звать
// локальную функцию модуля напрямую — маленькая window.*-обёртка, вызывающая сервис.
function rbi_setAnalyticsProjectFilter(name) {
    if (window.RBI && window.RBI.services && window.RBI.services.analytics) {
        window.RBI.services.analytics.setAnalyticsFilters({ project: [name] });
    } else if (window.activeMultiFilters && window.activeMultiFilters.analytics) {
        window.activeMultiFilters.analytics.project = [name];
    }
}
if (typeof window !== 'undefined') window.rbi_setAnalyticsProjectFilter = rbi_setAnalyticsProjectFilter;

function _inspections() {
    // HistoryState.allRecords заполняется только после mount() History-модуля
    // (переход на вкладку «История»); до этого момента остаётся пустым []
    // по умолчанию — используем его, только если оно реально непусто, иначе
    // единственный актуальный источник данных проверок — window.contractorArray.
    if (window.RBI && window.RBI.services && window.RBI.services.inspections) {
        return window.RBI.services.inspections.getAllForAnalyticsSync();
    }
    if (window.HistoryState && Array.isArray(window.HistoryState.allRecords) && window.HistoryState.allRecords.length > 0) {
        return window.HistoryState.allRecords;
    }
    if (Array.isArray(window.contractorArray)) return window.contractorArray;
    return [];
}

function _reports() {
    if (AnalyticsRender._ctx && AnalyticsRender._ctx.reports) {
        return AnalyticsRender._ctx.reports;
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
        }
    };
}

function _defectCauses() {
    if (window.RBI && window.RBI.services && window.RBI.services.inspections) {
        return window.RBI.services.inspections.getDefectCausesSync();
    }
    return typeof DEFECT_CAUSES !== 'undefined' ? DEFECT_CAUSES : [];
}

function _syncConfig() {
    if (window.RBI && window.RBI.services && window.RBI.services.sync &&
        typeof window.RBI.services.sync.getConfig === 'function') {
        return window.RBI.services.sync.getConfig();
    }
    return window.syncConfig || {};
}

// Перенесено из analytics.legacy.js: модульная переменная фотогалерей
// (аналог window._AUDIT_DEFECT_CAUSES из audit.render.js) — с зеркалом
// window.rbiPhotoGalleries для обратной совместимости.
var rbiPhotoGalleries = {};
if (typeof window !== 'undefined') window.rbiPhotoGalleries = rbiPhotoGalleries;

// =========================================================================
// Оптимизация фотогалереи (пагинация + canvas-превью), Блок 1 прямой
// инициативы пользователя от 2026-07-19. Все переменные/функции ниже —
// module-scope, НЕ на window.* (см. _ai/current_plan.md §7 «Нельзя
// трогать» / проверка №3 — новые top-level window.* не добавляются).
// =========================================================================
const ANALYTICS_GALLERY_PAGE_SIZE = 8;

// Очередь гидрации галереи: на iPhone параллельный getAsyncUrl → OOM / белый экран.
const GALLERY_HYDRATE_CONCURRENCY = 2;
let _hydrateQueue = [];
let _hydrateActive = 0;

function _clearGalleryHydrateQueue() {
    _hydrateQueue = [];
}

function _enqueueGalleryHydrate(task) {
    _hydrateQueue.push(task);
    _pumpGalleryHydrateQueue();
}

function _pumpGalleryHydrateQueue() {
    while (_hydrateActive < GALLERY_HYDRATE_CONCURRENCY && _hydrateQueue.length) {
        const task = _hydrateQueue.shift();
        _hydrateActive += 1;
        Promise.resolve()
            .then(task)
            .catch(function () { /* ignore */ })
            .then(function () {
                _hydrateActive -= 1;
                _pumpGalleryHydrateQueue();
            });
    }
}

// Полный (неотфильтрованный по странице) photosArray на galleryId — нужен
// для «Показать ещё» без повторного прохода родительского рендера.
// Перезаписывается (не накапливается) при каждом новом initPhotoGallery
// с тем же galleryId.
const _galleryFullData = new Map();

// A9: отложенная сборка фотогалереи вкладки «Подрядчики» (при открытии details).
let _lazyContractorsGalleryData = null;
let _lazyContractorsGalleryFilled = false;

// In-memory кэш готовых canvas-превью (dataURL) по исходной ссылке на фото
// (data:/local://.../cloud://.../http...). Переживает только текущую сессию —
// по тому же принципу, что уже применён в contractor-metrics.service.js.
const _photoThumbCache = new Map();
const PHOTO_THUMB_CACHE_MAX = 60;

function _setPhotoThumbCache(photoRef, thumb) {
    if (!photoRef || !thumb) return;
    // blob: не кэшируем — PhotoManager LRU revoke → ERR_FILE_NOT_FOUND при возврате.
    if (!isReusablePhotoThumbUrl(thumb)) return;
    // delete+set → ключ уходит в конец Map (LRU)
    if (_photoThumbCache.has(photoRef)) _photoThumbCache.delete(photoRef);
    _photoThumbCache.set(photoRef, thumb);
    while (_photoThumbCache.size > PHOTO_THUMB_CACHE_MAX) {
        const oldest = _photoThumbCache.keys().next().value;
        _photoThumbCache.delete(oldest);
    }
}

function _getCachedPhotoThumb(photoRef) {
    if (!photoRef || !_photoThumbCache.has(photoRef)) return '';
    const cached = _photoThumbCache.get(photoRef);
    if (!isReusablePhotoThumbUrl(cached)) {
        _photoThumbCache.delete(photoRef);
        return '';
    }
    return cached;
}

// Поколение рендера аналитики: при смене фильтра старые async-превью
// (_hydrateGalleryPhotos) не должны трогать DOM / грузить фото.
let _analyticsRenderGen = 0;

// B4: при смене только подвкладки не пересобираем фильтр/HTML уже
// отрисованной секции (DOM остаётся под .hidden). Сбрасывается при смене
// фильтра, sync-dirty, смене режима или изменении объёма данных (иначе
// пустой первый paint «залипал» навсегда — данные пришли, skip сработал).
let _analyticsFilterFp = '';
let _analyticsDataSig = '';
let _analyticsFilteredCache = null;
const _analyticsRenderedTabs = new Set();

function _analyticsFilterFingerprint() {
    const period = document.getElementById('global-filter-period')?.value || 'D30';
    const dFrom = document.getElementById('filter-date-from')?.value || '';
    const dTo = document.getElementById('filter-date-to')?.value || '';
    const f = (window.activeMultiFilters && window.activeMultiFilters.analytics) || {};
    const mode = _analyticsMode();
    // onepagerMode (Объект/Компания) — иначе B4 skip после paint «съедает» тумблер.
    const onepagerMode = window.onepagerMode || 'local';
    return [
        mode,
        onepagerMode,
        period,
        dFrom,
        dTo,
        (f.project || []).join('\u0001'),
        (f.contractor || []).join('\u0001'),
        (f.inspector || []).join('\u0001'),
        (f.template || []).join('\u0001')
    ].join('|');
}

function _analyticsSourceDataSignature() {
    let arr = [];
    try {
        if (window.RBI && window.RBI.services && window.RBI.services.inspections) {
            arr = window.RBI.services.inspections.getAllForAnalyticsSync() || [];
        } else if (Array.isArray(window.contractorArray)) {
            arr = window.contractorArray;
        }
    } catch (_) { arr = []; }
    // Sort edges: IDB reorder после silent pull не выглядит как смена данных.
    return analyticsSourceDataSignatureFromArray(arr);
}

function _analyticsSectionLooksPainted(tabId) {
    const hostIds = {
        // Список обязателен: скелетон ставится в list-container и затирает карточки,
        // а top-summary при этом может остаться «живым» — одного KPI мало для reuse.
        'sub-contractors': ['contractors-list-container', 'contractors-top-summary'],
        'sub-onepager': ['onepager-content-container'],
        'sub-schedule': ['schedule-container'],
        // shell ПК СК: без #sk-view-dashboard это ещё спиннер «Чтение базы…».
        'sub-sk': ['sk-main-container'],
        'sub-data': ['data-sub-container', 'sub-data']
    };
    const ids = hostIds[tabId] || [];
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length) return false;
    for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (el.querySelector && el.querySelector('.rbi-skeleton-wrap')) return false;
    }
    const primary = els[0];
    const html = (primary.innerHTML || '').trim();
    if (html.length < 80) return false;
    const text = primary.innerText || '';
    // Пустой первый рендер («Нет данных…») нельзя считать готовым — иначе
    // приход contractorArray через retry/views.js пропускается skip'ом.
    if (/Нет данных/i.test(text) && html.length < 800) return false;
    if (tabId === 'sub-sk') {
        if (!document.getElementById('sk-view-dashboard')) return false;
        if (/Чтение базы/i.test(text)) return false;
    }
    return true;
}

function _historySectionLooksPainted() {
    const el = document.getElementById('history-list');
    if (!el) return false;
    if (el.querySelector && el.querySelector('.rbi-skeleton-wrap')) return false;
    const html = (el.innerHTML || '').trim();
    if (html.length < 80) return false;
    const text = el.innerText || '';
    if (/Нет записей|Нет данных/i.test(text) && html.length < 800) return false;
    return true;
}

/** Секция подвкладки уже отрисована (для skeleton-guard при sync-defer). */
function analyticsSectionLooksPainted(tabId) {
    if (tabId === 'sub-history') return _historySectionLooksPainted();
    return _analyticsSectionLooksPainted(tabId);
}

/** Можно ли показать подвкладку без скелетона и без полного re-render (B4). */
function analyticsTabCanReusePaint(tabId) {
    if (!tabId) return false;
    if (typeof window.shouldDeferFullRender === 'function' && window.shouldDeferFullRender('analytics')) {
        return false;
    }
    // history/sk dirty: блокируем reuse только при ПОВТОРНОМ заходе на вкладку
    // (нужен refresh). Пока пользователь УЖЕ на вкладке — dirty не повод
    // для skeleton (см. renderCurrentAnalyticsTab stay-on-tab reuse).
    if (tabId === 'sub-sk' && window.syncDirtyFlags && window.syncDirtyFlags.sk) return false;
    if (tabId === 'sub-history' && window.syncDirtyFlags && window.syncDirtyFlags.history) return false;
    // analytics dirty сам по себе НЕ блокирует reuse: если filter/data fingerprint
    // совпадают — UI актуален; иначе switchAnalyticsSubTab каждый фоновый sync
    // снова ставил скелетон и full-rebuild (A9).
    if (_analyticsFilterFingerprint() !== _analyticsFilterFp) return false;
    if (_analyticsSourceDataSignature() !== _analyticsDataSig) return false;
    if (tabId === 'sub-history') return _historySectionLooksPainted();
    if (!_analyticsRenderedTabs.has(tabId)) return false;
    return _analyticsSectionLooksPainted(tabId);
}
window.analyticsTabCanReusePaint = analyticsTabCanReusePaint;

/**
 * Отпечаток фильтров расходится с последним успешным paint.
 * Только фильтры (не dataSig): иначе тихий sync снова full-render'ил бы
 * «живой» DOM. Нужен flush после sync-defer, когда UI кнопки уже обновлён.
 */
function analyticsFilterPaintIsStale() {
    return _analyticsFilterFingerprint() !== _analyticsFilterFp;
}
window.analyticsFilterPaintIsStale = analyticsFilterPaintIsStale;

/** Источник данных (inspections) изменился с последнего успешного paint. */
function analyticsSourceDataIsStale() {
    return _analyticsSourceDataSignature() !== _analyticsDataSig;
}

/** Сброс кэша paint при apply мультифильтра (до отложенного render). */
function invalidateAnalyticsFilterCache() {
    _analyticsFilteredCache = null;
    _analyticsFilterFp = '';
    _analyticsRenderedTabs.clear();
}
window.invalidateAnalyticsFilterCache = invalidateAnalyticsFilterCache;

/**
 * Каркас #tab-analytics после teardown (innerHTML='') или первого монтирования.
 * Узел .view-section сохраняем — нужен switchViewNode / навигации по id.
 */
function ensureAnalyticsMarkup() {
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
        ? window.RBI.services.shell.getContentRoot()
        : document.getElementById('app-content');
    var tab = document.getElementById('tab-analytics');
    if (tab && tab.querySelector('#analytics-subtabs-block')) return true;

    var html = AnalyticsRender.renderMarkup();
    if (!tab) {
        if (!root) return false;
        root.insertAdjacentHTML('beforeend', html);
        var mounted = document.getElementById('tab-analytics');
        if (mounted) {
            try {
                var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
                if (i18n && typeof i18n.applyDom === 'function') i18n.applyDom(mounted);
            } catch (_) { /* ignore */ }
        }
        return !!mounted;
    }

    var tmp = document.createElement('div');
    tmp.innerHTML = String(html).trim();
    var fresh = tmp.firstElementChild;
    if (!fresh) return false;
    tab.innerHTML = fresh.innerHTML;
    try {
        var i18n2 = window.RBI && window.RBI.services && window.RBI.services.i18n;
        if (i18n2 && typeof i18n2.applyDom === 'function') i18n2.applyDom(tab);
    } catch (_) { /* ignore */ }
    return !!tab.querySelector('#analytics-subtabs-block');
}
window.ensureAnalyticsMarkup = ensureAnalyticsMarkup;

/** Пометить подвкладку как отрисованную (async-пайплайны вроде ПК СК / График). */
function analyticsMarkTabPainted(tabId) {
    if (!tabId) return;
    _analyticsRenderedTabs.add(tabId);
}
window.analyticsMarkTabPainted = analyticsMarkTabPainted;

// Локальная мемоизация getObjectIntegralMetrics только внутри аналитики
// (разные срезы data/prevData/по объектам — не трогаем math.utils и другие модули).
const _ikoMemo = new Map();
const IKO_MEMO_MAX = 48;

// P2-0024 доработка 1 (ревью №5): ключ — id И время изменения каждой записи (правка проверки с теми же id
// даёт новый ключ), сжатый в короткий хэш (раньше ключом была строка всех id — до ≈ 400 КБ на ключ).
function _ikoIdsSignature(arr) {
    if (!arr || !arr.length) return '0';
    let h1 = 0xdeadbeef ^ arr.length, h2 = 0x41c6ce57 ^ arr.length;
    const mix = (str) => {
        for (let k = 0; k < str.length; k++) {
            const ch = str.charCodeAt(k);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
    };
    for (let i = 0; i < arr.length; i++) {
        const r = arr[i];
        mix((r && r.id) ? String(r.id) : String(i));
        mix('|' + String((r && (r.updatedAt || r.updated_at)) || '') + ',');
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return arr.length + ':' + (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

/**
 * P2-0024: копия выборки, отсортированная по дате (новые сверху) устойчивой сортировкой.
 * getContractorMetrics сортирует каждую группу так же (new Date в каждом сравнении); на уже
 * отсортированном входе устойчивая сортировка почти не сравнивает, а итоговый порядок (и метрики)
 * тот же — и при одинаковых датах. Есть неразборчивая дата — исходный порядок (ничего не меняем).
 */
function _byDateDescStable(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return arr;
    const keyed = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
        const t = new Date(arr[i] && arr[i].date).getTime();
        if (!Number.isFinite(t)) return arr;
        keyed[i] = [t, arr[i]];
    }
    keyed.sort((a, b) => b[0] - a[0]);
    return keyed.map(k => k[1]);
}

// P2-0024: средний рейтинг подрядчиков по выборке — «Подрядчики» и «Сводка» считают его по одной и той же
// выборке; в пределах одного фильтра/данных второй раз берётся из кэша (сброс — вместе с _ikoMemo).
const _avgRatingsMemo = new Map();
function _avgContractorRatingsCached(arr) {
    const sig = _ikoIdsSignature(arr);
    if (_avgRatingsMemo.has(sig)) return _avgRatingsMemo.get(sig);
    const r = window.avgContractorRatingsFromChecks(_byDateDescStable(arr));
    _avgRatingsMemo.set(sig, r);
    while (_avgRatingsMemo.size > IKO_MEMO_MAX) _avgRatingsMemo.delete(_avgRatingsMemo.keys().next().value);
    return r;
}

function _getObjectIntegralMetricsCached(data) {
    if (typeof getObjectIntegralMetrics !== 'function') return null;
    if (!data || !data.length) return null;
    let templates = {};
    try { templates = _templates().getUserTemplates() || {}; } catch (_) { templates = {}; }
    const sig = _ikoIdsSignature(data);
    if (_ikoMemo.has(sig)) return _ikoMemo.get(sig);
    const metrics = getObjectIntegralMetrics(_byDateDescStable(data), templates);
    _ikoMemo.set(sig, metrics);
    while (_ikoMemo.size > IKO_MEMO_MAX) {
        const oldest = _ikoMemo.keys().next().value;
        _ikoMemo.delete(oldest);
    }
    return metrics;
}

/**
 * Полный сброс runtime-кэшей вкладки при route-teardown (галереи/thumbs/paint reuse).
 * AnalyticsState (фильтры, subTab) не трогаем — они живут вне DOM.
 */
function clearAnalyticsViewRuntimeCaches() {
    try {
        _photoThumbCache.forEach(function (thumb) {
            if (typeof thumb === 'string' && thumb.indexOf('blob:') === 0) {
                try { URL.revokeObjectURL(thumb); } catch (_) { /* ignore */ }
            }
        });
    } catch (_) { /* ignore */ }
    _galleryFullData.clear();
    _photoThumbCache.clear();
    _clearGalleryHydrateQueue();
    _ikoMemo.clear();
    _avgRatingsMemo.clear();
    _lazyContractorsGalleryData = null;
    _lazyContractorsGalleryFilled = false;
    _lazyDetailGalleryFilled = false;
    _lazyDetailGalleryPayload = null;
    _analyticsRenderGen += 1;
    _analyticsFilteredCache = null;
    _analyticsFilterFp = '';
    _analyticsDataSig = '';
    _analyticsRenderedTabs.clear();
}
window.clearAnalyticsViewRuntimeCaches = clearAnalyticsViewRuntimeCaches;

// =========================================================================
// UI вкладки «Отчёты» (группировка по объекту + чипсы doc_kind + клиентская
// пагинация), см. _ai/current_plan.md. Module-scope, НЕ на window.* — тот же
// принцип, что и у _galleryFullData выше.
// =========================================================================
const REPORTS_GROUP_PAGE_SIZE = 12;


// Сохраняет раскрытые аккордеоны объектов до перерисовки списка (по образцу
// _captureExpandedHistory/_restoreExpandedHistory в history.render.js, но
// без второго уровня — у отчётов группировка только по объекту).

// P2-0039: раскрытые группы отчётов (объект `p:…` и тип внутри объекта `p:…|k:…`) — по data-ключам.
function _captureExpandedReports(listDiv) {
    const keys = new Set();
    if (!listDiv) return keys;
    listDiv.querySelectorAll('[data-rep-grp-body]').forEach((body) => {
        if (!body.classList.contains('hidden')) keys.add(body.getAttribute('data-rep-grp-body'));
    });
    return keys;
}

function _setReportsGroupOpen(body, open) {
    if (!body) return;
    body.classList.toggle('hidden', !open);
    const head = body.previousElementSibling;
    const icon = head && head.querySelector('.chevron-icon');
    if (icon) icon.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
}

function _restoreExpandedReports(listDiv, expandedKeys) {
    if (!listDiv || !expandedKeys || expandedKeys.size === 0) return;
    listDiv.querySelectorAll('[data-rep-grp-body]').forEach((body) => {
        if (expandedKeys.has(body.getAttribute('data-rep-grp-body'))) _setReportsGroupOpen(body, true);
    });
}

function _escAttr(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Разрешает photoRef в реальный src, пригодный для ЗАГРУЗКИ В CANVAS
// (не просто в <img>): data: — уже готов; local://cloud:// — PhotoManager.getSrc()
// вернул бы placeholder (см. storage-photo-manager.js:61-64), нужен асинхронный
// PhotoManager.getAsyncUrl(). http(s) — тоже обязательно через getAsyncUrl(), а
// не как готовый URL напрямую: getAsyncUrl() качает файл через fetch()+blob и
// возвращает свой same-origin blob:-URL, тогда как прямая кросс-доменная
// загрузка в <img> для canvas.drawImage()/toDataURL() требует CORS-заголовков
// от Storage-сервера — при их отсутствии canvas считается "tainted" и
// toDataURL() бросает SecurityError (баг найден на реальных данных: превью
// оставались белыми плейсхолдерами, хотя открытие оригинала в просмотрщике
// через обычный <img src> работало, т.к. там CORS не требуется).
async function _resolvePhotoRealSrc(photoRef, opts) {
    // photos[itemId] после B1 — массив; String([u1,u2]) → "u1,u2" → Storage 400.
    if (Array.isArray(photoRef)) photoRef = photoRef[0];
    const ref = String(photoRef || '');
    if (!ref) return null;
    if (ref.startsWith('data:')) return ref;
    if (window.PhotoManager && typeof window.PhotoManager.getAsyncUrl === 'function') {
        const preferThumb = !(opts && opts.full);
        return await window.PhotoManager.getAsyncUrl(
            ref,
            preferThumb ? { preferThumb: true } : undefined
        );
    }
    if (ref.startsWith('local://') || ref.startsWith('cloud://')) return null;
    return ref;
}

// Превью для ленты галереи: preferThumb (лёгкий), не полный файл.
async function _getGalleryPhotoSrc(photoRef) {
    if (!photoRef) return null;
    if (Array.isArray(photoRef)) photoRef = photoRef[0];
    if (!photoRef) return null;
    const hit = _getCachedPhotoThumb(photoRef);
    if (hit) {
        // LRU touch
        _photoThumbCache.delete(photoRef);
        _photoThumbCache.set(photoRef, hit);
        return hit;
    }

    let realSrc = null;
    try {
        realSrc = await _resolvePhotoRealSrc(photoRef, { full: false });
    } catch (e) {
        realSrc = null;
    }
    if (!realSrc) return null;
    _setPhotoThumbCache(photoRef, realSrc);
    // Даже если blob не попал в cache — вернуть свежий URL для текущего img.
    return realSrc;
}

// Генерирует HTML одной карточки галереи. i — индекс в исходном
// (полном, неотфильтрованном по странице) photosArray — нужен для
// устойчивого сопоставления превью↔оригинал и для «Показать ещё».
function _renderPhotoCardHtml(d, i, galleryId, badgeColor, badgeText) {
    let photoRef = d.photo;
    if (Array.isArray(photoRef)) photoRef = photoRef[0];
    const safePhoto = (typeof window.rbiEscapeAttr === 'function')
        ? window.rbiEscapeAttr(photoRef)
        : String(photoRef || '').replace(/"/g, '&quot;');
    const placeholder = window.rbiPhotoPlaceholder || '';
    const cached = _getCachedPhotoThumb(photoRef) || '';
    const initialSrc = cached || placeholder;
    // Полный файл (без data-prefer-thumb) — hydrator / _hydrateGalleryPhotos.
    // Без reusable cache всегда data-local-src — иначе после revoke blob нечего резолвить.
    const localAttrs = (!cached || cached === placeholder)
        ? ` data-local-src="${safePhoto}"`
        : '';
    return `
            <div class="snap-start shrink-0 w-36 sm:w-48 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden flex flex-col shadow-sm">
                <img src="${initialSrc}"${localAttrs} data-photo-idx="${i}" class="w-full h-24 sm:h-32 object-cover border-b border-[var(--card-border)] cursor-pointer active:scale-95 transition-transform" onclick="openPhotoViewer('${safePhoto}')" loading="lazy">
                <div class="p-2 flex-1 flex flex-col justify-between">
                    <div class="text-rbi-caption font-bold text-ink leading-tight line-clamp-2 mb-1.5" title="${d.name}">${d.name}</div>
                    <div>
                        <div class="text-rbi-caption text-[var(--text-muted)] mb-1 truncate w-full" title="${d.contr}">👤 ${d.contr}</div>
                        <div class="flex justify-between items-center">
                            <span class="${badgeColor} text-rbi-caption font-black px-1.5 rounded border">${badgeText}</span>
                            <span class="text-rbi-caption font-bold text-muted">${d.date}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
}

function _galleryPhotoTs(p) {
    const t = Number(p && p.ts);
    if (Number.isFinite(t) && t > 0) return t;
    const raw = p && (p.dateRaw != null ? p.dateRaw : p.date);
    const d = raw != null ? new Date(raw).getTime() : NaN;
    return Number.isFinite(d) ? d : 0;
}

/** Галереи B3/B2/OK: сначала новые проверки, затем подрядчик / пункт. */
function _sortGalleryNewestFirst(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return arr || [];
    arr.sort((a, b) => {
        const dt = _galleryPhotoTs(b) - _galleryPhotoTs(a);
        if (dt) return dt;
        const c = String((a && a.contr) || '').localeCompare(String((b && b.contr) || ''), 'ru');
        if (c) return c;
        return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), 'ru');
    });
    return arr;
}

function _collectAnalyticsGalleryPhotos(data) {
    const allPhotosB3 = [];
    const allPhotosB2 = [];
    const allPhotosOK = [];
    if (!Array.isArray(data)) return { allPhotosB3, allPhotosB2, allPhotosOK };
    data.forEach((i) => {
        if (!i || !i.state) return;
        const ts = new Date(i.date).getTime();
        const dateLabel = Number.isFinite(ts) ? new Date(ts).toLocaleDateString('ru-RU') : '—';
        Object.keys(i.state).forEach((id) => {
            const s = i.state[id];
            const photosArr = (i.photos && i.photos[id])
                ? (window.normalizeItemPhotos ? window.normalizeItemPhotos(i.photos[id]) : [].concat(i.photos[id]))
                : [];
            if (!photosArr.length) return;
            let defName = _t('quality.analytics.fallback.defect', 'Дефект');
            const tType = i.templateKey ? i.templateKey.split('_')[0] : '';
            const tKey = i.templateKey ? i.templateKey.replace(tType + '_', '') : '';
            const cl = tType === 'sys' && _getSystemTemplates()[tKey]
                ? _getSystemTemplates()[tKey].groups
                : (_templates().getUserTemplates()[tKey] ? _templates().getUserTemplates()[tKey].groups : []);
            const foundItem = getFlatList(cl).find((x) => String(x.id) === String(id));
            if (foundItem) defName = foundItem.n;
            photosArr.forEach((photo) => {
                if (!photo) return;
                const photoObj = {
                    photo: photo,
                    name: defName,
                    contr: i.contractorName,
                    date: dateLabel,
                    ts: Number.isFinite(ts) ? ts : 0,
                    dateRaw: i.date
                };
                if (s === 'fail' || s === 'fail_escalated') {
                    const isB3 = (s === 'fail_escalated') || (foundItem && foundItem.w === 3);
                    if (isB3) allPhotosB3.push(photoObj);
                    else allPhotosB2.push(photoObj); // B1 и B2 — одна лента «значимые»
                } else if (s === 'ok') {
                    allPhotosOK.push(photoObj);
                }
            });
        });
    });
    _sortGalleryNewestFirst(allPhotosB3);
    _sortGalleryNewestFirst(allPhotosB2);
    _sortGalleryNewestFirst(allPhotosOK);
    return { allPhotosB3, allPhotosB2, allPhotosOK };
}

/** A9: заполнить фотогалереи Подрядчиков при первом открытии details. */
function rbiEnsureAnalyticsPhotoGalleries(ev) {
    const details = ev && ev.target;
    if (details && details.tagName === 'DETAILS' && !details.open) return;
    if (_lazyContractorsGalleryFilled) return;
    const data = _lazyContractorsGalleryData;
    if (!data) return;
    _lazyContractorsGalleryFilled = true;
    const { allPhotosB3, allPhotosB2, allPhotosOK } = _collectAnalyticsGalleryPhotos(data);
    const slotB3 = document.getElementById('lazy-gallery-main_b3');
    const slotB2 = document.getElementById('lazy-gallery-main_b2');
    const slotOk = document.getElementById('lazy-gallery-main_ok');
    if (slotB3) slotB3.outerHTML = AnalyticsRender.initPhotoGallery('main_b3', allPhotosB3, true);
    if (slotB2) slotB2.outerHTML = AnalyticsRender.initPhotoGallery('main_b2', allPhotosB2, false);
    if (slotOk) {
        slotOk.outerHTML = AnalyticsRender.initPhotoGallery(
            'main_ok', allPhotosOK, false,
            'text-green-700 bg-green-100 border-green-200', 'OK'
        );
    }
}

/** Детализация подрядчика: галереи только при открытии details. */
let _lazyDetailGalleryFilled = false;
let _lazyDetailGalleryPayload = null;

function rbiEnsureDetailPhotoGalleries(ev) {
    const details = ev && ev.target;
    if (details && details.tagName === 'DETAILS' && !details.open) return;
    if (_lazyDetailGalleryFilled) return;
    const payload = _lazyDetailGalleryPayload;
    if (!payload) return;
    _lazyDetailGalleryFilled = true;
    const { allPhotosB3, allPhotosB2, allPhotosOK } = payload;
    const slotB3 = document.getElementById('lazy-gallery-det_b3');
    const slotB2 = document.getElementById('lazy-gallery-det_b2');
    const slotOk = document.getElementById('lazy-gallery-det_ok');
    if (slotB3) {
        slotB3.outerHTML = allPhotosB3.length > 0
            ? AnalyticsRender.initPhotoGallery('det_b3', allPhotosB3, true)
            : '<div class="text-xs text-muted">' + _t('quality.analytics.gallery.no_b3', 'Нет фото B3') + '</div>';
    }
    if (slotB2) {
        slotB2.outerHTML = allPhotosB2.length > 0
            ? AnalyticsRender.initPhotoGallery('det_b2', allPhotosB2, false)
            : '<div class="text-xs text-muted">' + _t('quality.analytics.gallery.no_b2', 'Нет фото B2') + '</div>';
    }
    if (slotOk) {
        slotOk.outerHTML = allPhotosOK.length > 0
            ? AnalyticsRender.initPhotoGallery(
                'det_ok', allPhotosOK, false,
                'text-green-700 bg-green-100 border-green-200', 'OK'
            )
            : '<div class="text-xs text-muted">' + _t('quality.analytics.gallery.no_ok', 'Нет фото эталонов') + '</div>';
    }
}

// Подтягивает превью (preferThumb) для порции галереи — очередь max 2 на iPhone.
function _hydrateGalleryPhotos(galleryId, entries, renderGen) {
    const gen = (renderGen === undefined) ? _analyticsRenderGen : renderGen;
    const wrap = document.getElementById(`gallery-wrap-${galleryId}`);
    if (wrap && typeof window.rbiHydrateLocalImages === 'function') {
        _enqueueGalleryHydrate(function () {
            if (gen !== _analyticsRenderGen) return;
            return Promise.resolve(window.rbiHydrateLocalImages(wrap)).then(function () {
                if (gen !== _analyticsRenderGen || !wrap) return;
                wrap.querySelectorAll('img[data-photo-idx]').forEach(function (img) {
                    const idx = Number(img.getAttribute('data-photo-idx'));
                    const entry = entries.find(function (e) { return e.idx === idx; });
                    if (!entry) return;
                    const ph = window.rbiPhotoPlaceholder || '';
                    if (img.src && img.src !== ph && !img.getAttribute('data-local-src')) {
                        _setPhotoThumbCache(entry.photoRef, img.src);
                    }
                });
            }).catch(function () { /* ignore */ });
        });
    }
    entries.forEach(function (item) {
        const photoRef = item.photoRef;
        const idx = item.idx;
        const cached = _getCachedPhotoThumb(photoRef);
        if (cached) {
            const img = document.querySelector(
                '#gallery-wrap-' + galleryId + ' img[data-photo-idx="' + idx + '"]'
            );
            if (img) {
                img.src = cached;
                img.removeAttribute('data-local-src');
            }
            return;
        }
        _enqueueGalleryHydrate(function () {
            if (gen !== _analyticsRenderGen) return;
            return _getGalleryPhotoSrc(photoRef).then(function (src) {
                if (!src) return;
                if (gen !== _analyticsRenderGen) return;
                const img = document.querySelector(
                    '#gallery-wrap-' + galleryId + ' img[data-photo-idx="' + idx + '"]'
                );
                if (!img) return;
                img.src = src;
                img.removeAttribute('data-local-src');
            });
        });
    });
}

// «Показать ещё» — читает _galleryFullData.get(galleryId) (полный,
// неотфильтрованный по странице массив), рендерит следующую порцию
// ANALYTICS_GALLERY_PAGE_SIZE (или остаток), insertAdjacentHTML в ленту,
// обновляет/убирает саму кнопку.
function _loadMorePhotosImpl(galleryId) {
    const entry = _galleryFullData.get(galleryId);
    if (!entry) return;

    const { photosArray, badgeColor, badgeText, shown } = entry;
    const nextShown = Math.min(shown + ANALYTICS_GALLERY_PAGE_SIZE, photosArray.length);
    const nextPage = photosArray.slice(shown, nextShown);
    if (nextPage.length === 0) return;

    const wrap = document.getElementById(`gallery-wrap-${galleryId}`);
    const track = wrap ? wrap.querySelector('.flex') : null;
    const btn = wrap ? wrap.querySelector(`[data-analytics-action="loadMorePhotos"][data-action-arg="${galleryId}"]`) : null;
    if (!track) return;

    const cardsHtml = nextPage.map((d, i) => _renderPhotoCardHtml(d, shown + i, galleryId, badgeColor, badgeText)).join('');
    if (btn) {
        btn.insertAdjacentHTML('beforebegin', cardsHtml);
    } else {
        track.insertAdjacentHTML('beforeend', cardsHtml);
    }

    entry.shown = nextShown;
    const remaining = photosArray.length - nextShown;
    if (remaining > 0) {
        if (btn) btn.querySelector('span:last-child').textContent = _t('quality.analytics.gallery.more', 'Ещё ({n})', { n: remaining });
    } else if (btn) {
        btn.remove();
    }

    _hydrateGalleryPhotos(galleryId, nextPage.map((d, i) => ({ photoRef: d.photo, idx: shown + i })), _analyticsRenderGen);
}

// Перенесено из app.js 1:1 (текстуально идентична приватной копии в
// history.render.js:15) — приватная, module-scope, НЕ на window.*, по
// образцу history.render.js (не плодит второй глобальный window.getSyncBadgeHtml).
// Генерирует SVG-бейдж статуса синхронизации для карточки отчёта в архиве.
function getSyncBadgeHtml(item) {
    const source = item.source || '';
    const syncStatus = item.syncStatus || item.sync_status || '';

    // Заготовки SVG иконок
    const iconLocal = `<svg class="w-2.5 h-2.5 inline-block mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"></path></svg>`;
    const iconCloud = `<svg class="w-2.5 h-2.5 inline-block mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"></path></svg>`;
    const iconBlocked = `<svg class="w-2.5 h-2.5 inline-block mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;

    if (syncStatus === 'blocked') {
        const reason = item.syncBlockReason || item.sync_block_reason || _t('quality.analytics.sync.blocked_reason', 'Отправка запрещена');
        return `<button onclick="event.stopPropagation(); showToast('${_t('quality.analytics.sync.reason_prefix', 'Причина:')} ${String(reason).replace(/'/g, "\\'")}')" class="px-1.5 py-0.5 rounded bg-danger-soft text-danger border border-danger-soft text-rbi-caption font-bold uppercase ml-1 flex items-center shadow-sm">${iconBlocked}${_t('quality.analytics.sync.blocked_short', 'Заблок.')}</button>`;
    }
    if (source === 'cloud' || syncStatus === 'synced') {
        return `<span class="px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-200 text-rbi-caption font-bold uppercase ml-1 flex items-center shadow-sm">${iconCloud}</span>`;
    }
    return `<span class="px-1.5 py-0.5 rounded bg-slate-100 text-muted border border-slate-200 text-rbi-caption font-bold uppercase ml-1 flex items-center shadow-sm">${iconLocal}</span>`;
}

// Документарный УрК записи (Два индекса УрК — физика и документация, Шаг 3).
// Старые записи без сохранённого item.metrics.documentary — досчитываем "на лету"
// по item.state и актуальному чек-листу (та же lazy recalculation, что в
// getContractorMetrics()/history.render.js), без изменения хранимых данных.
function _getDocumentaryScoreForItem(item) {
    if (!item.metrics) return null;
    if (item.metrics.documentary !== undefined) return item.metrics.documentary;
    if (typeof window.getDocumentaryScore !== 'function' || !item.state || !item.templateKey) return null;
    const type = item.templateKey.split('_')[0];
    const key = item.templateKey.replace(type + '_', '');
    const checklist = type === 'sys' && _getSystemTemplates()[key] ? _getSystemTemplates()[key].groups : (_templates().getUserTemplates()[key] ? _templates().getUserTemplates()[key].groups : []);
    const flatList = getFlatList(checklist);
    return window.getDocumentaryScore(item.state, flatList);
}

function getFilteredAnalyticsData() {
    if (window.AnalyticsActions && typeof window.AnalyticsActions.getFilteredAnalyticsData === 'function') {
        return window.AnalyticsActions.getFilteredAnalyticsData();
    }
    return typeof window.getFilteredAnalyticsData === 'function' ? window.getFilteredAnalyticsData() : [];
}

export const AnalyticsRender = {

    _ctx: null,
    bindCtx(ctx) { this._ctx = ctx; },

    // =====================================================================
    // РАЗМЕТКА ВКЛАДКИ «АНАЛИТИКА» (перенос из index.html:619-974, JS-
    // рендер). Возвращает HTML-строку 1:1 идентичную прежней статичной
    // разметке #tab-analytics: блок подвкладок, глобальные фильтры и 5
    // контейнеров подвкладок (Подрядчики/Сводка/График/ПК СК/История).
    // Заполнение контейнеров — задача существующих функций заполнения
    // (renderContractorsSubTab и т.д.), не этой функции.
    // =====================================================================
    renderMarkup() {
        return `
        <div id="tab-analytics" class="view-section">

            <!-- БЛОК ПОДВКЛАДОК (Прыгает вниз на смартфонах, прилипает наверх на ПК) -->
            <!-- БЛОК ПОДВКЛАДОК (Исправлены отступы) -->
            <!-- БЛОК ПОДВКЛАДОК (Прыгает вниз на смартфонах, прилипает наверх на ПК) -->
            <div id="analytics-subtabs-block" class="z-[45] transition-all duration-300 w-full max-w-4xl mx-auto py-2">
                <div
                    class="flex gap-1 p-1 bg-[var(--card-border)]/80 backdrop-blur-md rounded-xl overflow-x-auto no-scrollbar whitespace-nowrap text-center shadow-sm border border-[var(--card-border)]">
                    <button data-analytics-action="switchAnalyticsSubTab" data-action-arg="sub-contractors" data-analytics-action-arg2-type="element"
                        class="sub-tab-btn flex-1 min-w-[60px] py-2 text-rbi-caption sm:text-rbi-caption font-bold uppercase rounded-md bg-white shadow-sm text-brand flex flex-col items-center gap-1 active">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z">
                            </path>
                        </svg>
                        <span class="sm:hidden" data-i18n="quality.sub.analytics.contractors_short">Подр.</span><span class="hidden sm:inline" data-i18n="quality.sub.analytics.contractors">Подрядчики</span>
                    </button>
                    <button data-analytics-action="switchAnalyticsSubTab" data-action-arg="sub-onepager" data-analytics-action-arg2-type="element"
                        class="sub-tab-btn flex-1 min-w-[60px] py-2 text-rbi-caption sm:text-rbi-caption font-bold uppercase rounded-md text-[var(--text-muted)] flex flex-col items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z">
                            </path>
                        </svg>
                        <span data-i18n="quality.sub.analytics.summary">Сводка</span>
                    </button>
                    <button data-analytics-action="switchAnalyticsSubTab" data-action-arg="sub-schedule" data-analytics-action-arg2-type="element"
                        class="sub-tab-btn flex-1 min-w-[60px] py-2 text-rbi-caption sm:text-rbi-caption font-bold uppercase rounded-md text-[var(--text-muted)] flex flex-col items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z">
                            </path>
                        </svg>
                        <span data-i18n="quality.sub.analytics.schedule">График</span>
                    </button>
                    <button data-analytics-action="switchAnalyticsSubTab" data-action-arg="sub-sk" data-analytics-action-arg2-type="element"
                        class="sub-tab-btn flex-1 min-w-[60px] py-2 text-rbi-caption sm:text-rbi-caption font-bold uppercase rounded-md text-[var(--text-muted)] flex flex-col items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z">
                            </path>
                        </svg>
                        <span class="sm:hidden" data-i18n="quality.sub.analytics.sk_short">СК</span><span class="hidden sm:inline" data-i18n="quality.sub.analytics.sk">ПК СК</span>
                    </button>
                    <button data-analytics-action="switchAnalyticsSubTab" data-action-arg="sub-history" data-analytics-action-arg2-type="element"
                        class="sub-tab-btn flex-1 min-w-[60px] py-2 text-rbi-caption sm:text-rbi-caption font-bold uppercase rounded-md text-[var(--text-muted)] flex flex-col items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <span data-i18n="quality.sub.analytics.history">История</span>
                    </button>

                </div>
            </div>

            <!-- БЛОК ФИЛЬТРОВ (Прилипает всегда) -->
            <div id="analytics-filters-block"
                class="sticky-top-panel bg-[var(--card-border)]/80 backdrop-blur-md p-3 rounded-xl border border-[var(--card-border)] shadow-sm mb-2 no-print">
                <div id="analytics-panel-header"
                    class="text-rbi-caption font-black text-muted uppercase mb-2 flex justify-between items-center gap-2 cursor-pointer">
                    <span class="flex items-center gap-1 min-w-0 flex-1">
                        <span id="analytics-panel-toggle-icon"
                            style="display:inline-block; transition: transform 0.3s">▾</span>
                        <span class="shrink-0">${_t('quality.analytics.filters.title', 'Глобальные фильтры')}</span>
                        <span data-panel-filter-summary
                            class="hidden normal-case font-bold text-brand truncate tracking-normal"></span>
                    </span>

                    <!-- Правый блок: Тумблер + Иконка облака -->
                    <div class="flex items-center gap-2 shrink-0" data-no-panel-toggle>
                        <div id="analytics-global-mode-toggle" class="hidden"></div>
                        <div id="analytics-status-icon-container"></div>
                    </div>
                </div>
                <div id="analytics-panel-body"
                    style="transition: max-height 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1), margin 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275); max-height: 200px; overflow: hidden;">

                    <!-- СТРОКА 1: Объект, Подрядчик, Инспектор (Мультивыбор) -->
                    <div class="grid grid-cols-3 gap-2 mb-2">
                        <button id="btn-ana-project" data-multifilter-action="openMultiFilterModal" data-multifilter-action-args='["project","${_t('quality.analytics.filter.projects', 'Объекты')}","analytics"]'
                            class="input-base text-rbi-caption min-[400px]:text-rbi-caption !py-2 text-left flex justify-between items-center bg-surface shadow-sm"><span
                                class="truncate">${_t('quality.analytics.filter.all_projects', 'Все объекты')}</span><svg class="w-3 h-3 opacity-50 shrink-0" fill="none"
                                stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
                            </svg></button>
                        <button id="btn-ana-contractor"
                            data-multifilter-action="openMultiFilterModal" data-multifilter-action-args='["contractor","${_t('quality.analytics.filter.contractors', 'Подрядчики')}","analytics"]'
                            class="input-base text-rbi-caption min-[400px]:text-rbi-caption !py-2 text-left flex justify-between items-center bg-surface shadow-sm"><span
                                class="truncate">${_t('quality.analytics.filter.all_contractors', 'Все подрядчики')}</span><svg class="w-3 h-3 opacity-50 shrink-0"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
                            </svg></button>
                        <button id="btn-ana-inspector"
                            data-multifilter-action="openMultiFilterModal" data-multifilter-action-args='["inspector","${_t('quality.analytics.filter.inspectors', 'Инспекторы')}","analytics"]'
                            class="input-base text-rbi-caption min-[400px]:text-rbi-caption !py-2 text-left flex justify-between items-center bg-surface shadow-sm"><span
                                class="truncate">${_t('quality.analytics.filter.all_inspectors', 'Все инспекторы')}</span><svg class="w-3 h-3 opacity-50 shrink-0"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
                            </svg></button>
                    </div>

                    <!-- СТРОКА 2: Вид работ, Период и Источник данных -->
                    <div class="grid grid-cols-3 gap-2 mb-2">
                        <button id="btn-ana-template"
                            data-multifilter-action="openMultiFilterModal" data-multifilter-action-args='["template","${_t('quality.analytics.filter.templates', 'Виды работ')}","analytics"]'
                            class="input-base text-rbi-caption !py-2 text-left flex justify-between items-center bg-surface shadow-sm"><span
                                class="truncate">${_t('quality.analytics.filter.all_templates', 'Все виды работ')}</span><svg class="w-3 h-3 opacity-50 shrink-0"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
                            </svg></button>

                        <div class="relative w-full">
                            <select id="global-filter-period"
                                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                data-analytics-action="toggleDateRange,scheduleRenderCurrentAnalyticsTab" data-action-event="change">
                                <option value="D7">${_t('quality.analytics.period.d7', 'За 7 дней')}</option>
                                <option value="D14">${_t('quality.analytics.period.d14', 'За 14 дней')}</option>
                                <option value="D30" selected>${_t('quality.analytics.period.d30', 'За 30 дней')}</option>
                                <option value="D90">${_t('quality.analytics.period.d90', 'За 90 дней')}</option>
                                <option value="D180">${_t('quality.analytics.period.d180', 'За 180 дней')}</option>
                                <option value="ALL">${_t('quality.analytics.period.all', 'Всё время')}</option>
                                <option value="CUSTOM">${_t('quality.analytics.period.custom', 'Свой период...')}</option>
                            </select>
                            <button id="btn-ana-period-label"
                                class="input-base text-rbi-caption !py-2 text-left flex justify-between items-center bg-surface shadow-sm w-full"><span
                                    class="truncate">${_t('quality.analytics.period.d30', 'За 30 дней')}</span><svg class="w-3 h-3 opacity-50 shrink-0"
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
                                </svg></button>
                        </div>

                        <!-- Сюда JS вставит переключатель Аналитики -->
                        <div id="analytics-mode-container" class="flex flex-col justify-center items-end"></div>
                    </div>

                    <!-- КАЛЕНДАРЬ (СКРЫТ ПО УМОЛЧАНИЮ) -->
                    <div id="custom-date-range"
                        class="hidden grid-cols-2 gap-2 bg-brand-soft/30 p-2 rounded-lg border border-brand-soft">
                        <div class="flex items-center gap-1">
                            <span class="text-rbi-caption font-bold text-muted uppercase">${_t('quality.analytics.period.from', 'С:')}</span>
                            <input type="date" id="filter-date-from" class="input-base text-rbi-caption !py-1"
                                data-analytics-action="scheduleRenderCurrentAnalyticsTab" data-action-event="change">
                        </div>
                        <div class="flex items-center gap-1">
                            <span class="text-rbi-caption font-bold text-muted uppercase">${_t('quality.analytics.period.to', 'По:')}</span>
                            <input type="date" id="filter-date-to" class="input-base text-rbi-caption !py-1"
                                data-analytics-action="scheduleRenderCurrentAnalyticsTab" data-action-event="change">
                        </div>
                    </div>

                </div>
            </div>

            <!-- Контейнеры подвкладок -->
            <div id="sub-contractors" class="analytics-sub-section">
                <!-- Главный экран вкладки (Сводка + Список) -->
                <div id="contractors-main-view">
                    <div id="contractors-top-summary" class="mb-4 space-y-4"></div>

                    <!-- Фильтры-чипсы над списком -->
                    <div class="mb-3 flex gap-2 overflow-x-auto no-scrollbar pb-1"
                        id="contractors-chips-container">
                        <button data-analytics-action="filterContractorsList" data-action-arg="ALL" data-analytics-action-arg2-type="element"
                            class="contr-chip px-3 py-1.5 rounded-full text-rbi-caption font-bold bg-brand text-white shadow-sm active:scale-95 whitespace-nowrap transition-colors">${_t('quality.analytics.chip.all', 'Все')}</button>
                        <button data-analytics-action="filterContractorsList" data-action-arg="CRITICAL" data-analytics-action-arg2-type="element"
                            class="contr-chip px-3 py-1.5 rounded-full text-rbi-caption font-bold bg-slate-100 text-muted active:scale-95 whitespace-nowrap transition-colors">🔴
                            ${_t('quality.analytics.chip.critical', 'Критичные')}</button>
                        <button data-analytics-action="filterContractorsList" data-action-arg="WARNING" data-analytics-action-arg2-type="element"
                            class="contr-chip px-3 py-1.5 rounded-full text-rbi-caption font-bold bg-slate-100 text-muted active:scale-95 whitespace-nowrap transition-colors">🟡
                            ${_t('quality.analytics.chip.warning', 'Внимания')}</button>
                        <button data-analytics-action="filterContractorsList" data-action-arg="STABLE" data-analytics-action-arg2-type="element"
                            class="contr-chip px-3 py-1.5 rounded-full text-rbi-caption font-bold bg-slate-100 text-muted active:scale-95 whitespace-nowrap transition-colors">🟢
                            ${_t('quality.analytics.chip.stable', 'Стабильные')}</button>
                        <button data-analytics-action="filterContractorsList" data-action-arg="NEW" data-analytics-action-arg2-type="element"
                            class="contr-chip px-3 py-1.5 rounded-full text-rbi-caption font-bold bg-slate-100 text-muted active:scale-95 whitespace-nowrap transition-colors">⚪
                            ${_t('quality.analytics.chip.new', 'Новые (Сбор)')}</button>
                    </div>

                    <div id="contractors-list-container" class="pb-8 space-y-3"></div>
                </div>

                <!-- Режим детализации подрядчика (Скрыт по умолчанию) -->
                <div id="contractor-detail-view" class="hidden">
                    <div id="contractor-detail-header"
                        class="z-30 bg-white/80 backdrop-blur-md border border-[var(--card-border)] p-3 mt-2 mb-4 rounded-xl shadow-sm flex items-center justify-between">
                        <button data-analytics-action="hideContractorDetailView"
                            class="text-rbi-label font-bold text-muted flex items-center gap-1 active:scale-95 px-2 py-1 bg-[var(--hover-bg)] rounded-lg">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M15 19l-7-7 7-7"></path>
                            </svg> ${_t('quality.analytics.btn.back', 'Назад')}
                        </button>
                        <div class="font-black text-rbi-body uppercase text-brand truncate max-w-[60%] text-right"
                            id="detail-view-title">${_t('quality.analytics.detail.contractor', 'Подрядчик')}</div>
                    </div>
                    <div id="contractor-detail-content" class="pb-8 space-y-4"></div>
                </div>
            </div>
            <div id="sub-onepager" class="analytics-sub-section hidden">
                <div id="onepager-content-container" class="pb-8"></div>
            </div>
            <!-- ИСТОРИЯ ПЕРЕНЕСЕНА СЮДА -->
            <div id="sub-history" class="analytics-sub-section hidden mt-2">

                <!-- ОБЩАЯ "ЛИПКАЯ" ПАНЕЛЬ ФИЛЬТРОВ (ТЕПЕРЬ СНАРУЖИ ВЬЮХ) -->
                <div id="hist-sticky-panel"
                    class="bg-[var(--card-border)]/80 backdrop-blur-md p-3 rounded-2xl border border-[var(--card-border)] mb-4 shadow-sm">

                    <!-- Заголовок с встроенным тумблером (iOS Style) -->
                    <div id="hist-panel-header" class="flex justify-between items-center gap-2 mb-2">
                        <span
                            class="text-rbi-label font-black text-[var(--text-muted)] uppercase tracking-wide flex items-center gap-1 cursor-pointer min-w-0 flex-1">
                            <span id="hist-panel-toggle-icon">▾</span>
                            <span class="shrink-0">${_t('quality.analytics.hist.panel_title', 'База и Отчеты')}</span>
                            <span data-panel-filter-summary
                                class="hidden normal-case font-bold text-brand truncate tracking-normal"></span>
                        </span>

                        <div class="flex items-center bg-surface p-0.5 rounded-full shadow-inner cursor-pointer border border-surface shrink-0"
                            data-no-panel-toggle onclick="event.stopPropagation();">
                            <div id="btn-hist-checks" data-analytics-action="switchHistoryView" data-action-arg="checks"
                                class="px-3 py-1 rounded-full text-rbi-caption font-black uppercase transition-all duration-300 bg-surface text-brand shadow-sm">
                                ${_t('quality.analytics.hist.checks', 'Проверки')}</div>
                            <div id="btn-hist-reports" data-analytics-action="switchHistoryView" data-action-arg="reports"
                                class="px-3 py-1 rounded-full text-rbi-caption font-black uppercase transition-all duration-300 text-muted">
                                ${_t('quality.analytics.hist.reports', 'Отчеты')}</div>
                            <div id="btn-hist-plans" data-analytics-action="switchHistoryView" data-action-arg="plans"
                                class="px-3 py-1 rounded-full text-rbi-caption font-black uppercase transition-all duration-300 text-muted">
                                ${_t('quality.analytics.hist.plans', 'Планы')}</div>
                        </div>
                    </div>

                    <!-- Тело панели фильтров (сворачиваемое) -->
                    <div id="hist-panel-body"
                        style="transition: max-height 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1), margin 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275); max-height: 400px; overflow: hidden;">
                        <!-- Строка поиска -->
                        <div class="relative mb-2">
                            <span class="absolute left-3 top-2.5 text-rbi-body text-[var(--text-muted)]">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                </svg>
                            </span>
                            <input type="text" id="hist-search-text" class="input-base pl-9 text-rbi-label"
                                placeholder="${_t('quality.analytics.hist.search', 'Поиск...')}" oninput="applyHistoryFilters()">
                        </div>

                        <!-- Мульти-фильтры: 2 ряда × 3 колонки -->
                        <div class="grid grid-cols-3 gap-2 mb-2">
                            <button id="btn-hist-project"
                                data-multifilter-action="openMultiFilterModal" data-multifilter-action-args='["project","${_t('quality.analytics.filter.projects', 'Объекты')}","history"]'
                                class="input-base text-rbi-caption !py-2 text-left flex justify-between items-center bg-surface shadow-sm min-w-0"><span
                                    class="truncate">${_t('quality.analytics.filter.all_projects', 'Все объекты')}</span><svg class="w-3 h-3 opacity-50 shrink-0"
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
                                </svg></button>
                            <button id="btn-hist-contractor"
                                data-multifilter-action="openMultiFilterModal" data-multifilter-action-args='["contractor","${_t('quality.analytics.filter.contractors', 'Подрядчики')}","history"]'
                                class="input-base text-rbi-caption !py-2 text-left flex justify-between items-center bg-surface shadow-sm min-w-0"><span
                                    class="truncate">${_t('quality.analytics.filter.all_contractors', 'Все подрядчики')}</span><svg class="w-3 h-3 opacity-50 shrink-0"
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
                                </svg></button>
                            <button id="btn-hist-template"
                                data-multifilter-action="openMultiFilterModal" data-multifilter-action-args='["template","${_t('quality.analytics.filter.templates', 'Виды работ')}","history"]'
                                class="input-base text-rbi-caption !py-2 text-left flex justify-between items-center bg-surface shadow-sm min-w-0"><span
                                    class="truncate">${_t('quality.analytics.filter.all_templates', 'Все виды работ')}</span><svg class="w-3 h-3 opacity-50 shrink-0"
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
                                </svg></button>
                            <button id="btn-hist-inspector"
                                data-multifilter-action="openMultiFilterModal" data-multifilter-action-args='["inspector","${_t('quality.analytics.filter.inspectors', 'Инспекторы')}","history"]'
                                class="input-base text-rbi-caption !py-2 text-left flex justify-between items-center bg-surface shadow-sm min-w-0"><span
                                    class="truncate">${_t('quality.analytics.filter.all_inspectors', 'Все инспекторы')}</span><svg class="w-3 h-3 opacity-50 shrink-0"
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
                                </svg></button>
                            <div class="relative w-full col-span-2 min-w-0">
                                <select id="hist-filter-period"
                                    class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    data-history-action="applyHistoryFilters" data-action-event="change">
                                    <option value="D7">${_t('quality.analytics.period.d7', 'За 7 дней')}</option>
                                    <option value="D14">${_t('quality.analytics.period.d14', 'За 14 дней')}</option>
                                    <option value="D30" selected>${_t('quality.analytics.period.d30', 'За 30 дней')}</option>
                                    <option value="D90">${_t('quality.analytics.period.d90', 'За 90 дней')}</option>
                                    <option value="D180">${_t('quality.analytics.period.d180', 'За 180 дней')}</option>
                                    <option value="ALL">${_t('quality.analytics.period.all', 'Всё время')}</option>
                                </select>
                                <button id="btn-hist-period-label"
                                    class="input-base text-rbi-caption !py-2 text-left flex justify-between items-center bg-surface shadow-sm w-full"><span
                                        class="truncate">${_t('quality.analytics.period.d30', 'За 30 дней')}</span><svg class="w-3 h-3 opacity-50 shrink-0"
                                        fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
                                    </svg></button>
                            </div>
                        </div>

                        <!-- Нижняя строка (Чекбоксы + Кнопки) -->
                        <div id="hist-checks-actions-row"
                            class="flex justify-between items-center px-1 border-t border-[var(--card-border)] pt-2 mt-1">
                            <div class="flex gap-4">
                                <label
                                    class="flex items-center gap-1.5 text-rbi-caption font-bold text-[var(--text-muted)] cursor-pointer">
                                    <input type="checkbox" id="hist-filter-photo" class="accent-indigo-600 w-3.5 h-3.5"
                                        data-history-action="applyHistoryFilters" data-action-event="change"> ${_t('quality.analytics.hist.with_photo', 'С фото')}
                                </label>
                                <label
                                    class="flex items-center gap-1.5 text-rbi-caption font-bold text-danger cursor-pointer">
                                    <input type="checkbox" id="hist-filter-b3" class="accent-red-500 w-3.5 h-3.5"
                                        data-history-action="applyHistoryFilters" data-action-event="change"> ${_t('quality.analytics.hist.only_b3', 'Только B3')}
                                </label>
                                <label
                                    class="flex items-center gap-1.5 text-rbi-caption font-bold text-[var(--text-muted)] cursor-pointer">
                                    <input type="checkbox" id="hist-filter-plan" class="accent-indigo-600 w-3.5 h-3.5"
                                        data-history-action="applyHistoryFilters" data-action-event="change"> ${_t('quality.analytics.hist.with_plan', 'С планом')}
                                </label>
                            </div>
                            <div class="flex items-center gap-2">
                                <label
                                    class="flex items-center gap-1 text-rbi-caption font-bold text-brand cursor-pointer">
                                    <input type="checkbox" id="hist-select-all" class="w-3.5 h-3.5 accent-indigo-600"
                                        data-history-action="toggleAllHistory" data-history-action-val-type="element" data-action-event="change"> ${_t('quality.analytics.chip.all', 'Все')}
                                </label>
                                <button data-history-action="exportSelectedCsv"
                                    class="text-green-600 bg-green-50 p-1.5 rounded-md active:scale-90"
                                    title="${_t('quality.analytics.hist.export_csv', 'Выгрузить CSV')}"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                                    </svg></button>
                                <button data-history-action="printSelectedInspectionActs"
                                    class="text-brand bg-brand-soft p-1.5 rounded-md active:scale-90"
                                    title="${_t('quality.analytics.hist.print_acts', 'Печать актов осмотра (PDF)')}"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
                                    </svg></button>
                                <button data-history-action="deleteSelectedHistory"
                                    class="text-danger bg-danger-soft p-1.5 rounded-md active:scale-90"
                                    title="${_t('quality.analytics.hist.delete_selected', 'Удалить выбранные')}"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor"
                                        viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
                                        </path>
                                    </svg></button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ВЬЮХА 1: КЛАССИЧЕСКАЯ ИСТОРИЯ ПРОВЕРОК -->
                <div id="history-checks-view">
                    <div id="hist-empty-msg" class="text-center py-8 text-sm text-[var(--text-muted)]">${_t('quality.analytics.hist.empty', 'История пуста.')}
                    </div>
                    <div id="history-list" class="min-w-0 max-w-full overflow-x-hidden"></div>
                </div>

                <!-- ВЬЮХА 2: АРХИВ ОТЧЕТОВ -->
                <div id="history-reports-view" class="hidden">
                    <!-- ВСТАВКА: Панель массового удаления отчетов -->
                    <div id="hist-reports-actions-row" class="flex justify-between items-center px-1 pb-3 mb-3 border-b border-[var(--card-border)] gap-2">
                        <label class="flex items-center gap-1.5 text-rbi-caption font-bold text-brand cursor-pointer shrink-0">
                            <input type="checkbox" id="reports-select-all" class="w-4 h-4 accent-indigo-600 rounded" data-analytics-action="toggleAllReports" data-analytics-action-val-type="element" data-action-event="change"> ${_t('quality.analytics.reports.select_all', 'Выбрать всё')}
                        </label>
                        <div class="flex items-center gap-2 ml-auto">
                            <div id="reports-view-mode-toggle" class="shrink-0"></div>
                            <button data-analytics-action="deleteSelectedReports" class="text-danger bg-danger-soft px-3 py-1.5 rounded-lg active:scale-90 flex items-center gap-1 text-rbi-caption font-black uppercase border border-danger-soft shadow-sm">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg> ${_t('quality.analytics.hist.delete_selected', 'Удалить выбранные')}
                            </button>
                        </div>
                    </div>
                    <div id="reports-list" class="pb-8"></div>
                </div>

                <!-- ВЬЮХА 3: ИНТЕРАКТИВНЫЕ ПЛАНЫ ПО ОБЪЕКТУ -->
                <div id="history-plans-view" class="hidden">
                    <div id="history-plans-list" class="min-w-0 max-w-full pb-8"></div>
                </div>
            </div>

            <!-- НОВЫЙ БЛОК: ГРАФИК РАБОТ -->
            <div id="sub-schedule" class="analytics-sub-section hidden mt-2">
                <div id="schedule-container">
                    <!-- Сюда JS загрузит интерфейс -->
                </div>
            </div>
            <!-- КОНЕЦ БЛОКА: РЕЙТИНГ ИНЖЕНЕРА -->
            <!-- НОВЫЙ БЛОК: ПК СТРОЙКОНТРОЛЬ -->
            <div id="sub-sk" class="analytics-sub-section hidden mt-2">
                <div id="sk-main-container" class="pb-8"></div>
            </div>
        </div>
      `;
    },

    /**
     * Диспетчер по текущей подвкладке.
     * Делегирует в window.renderCurrentAnalyticsTab из legacy.
     */
    render(subTab) {
        const tab = subTab || AnalyticsState.activeSubTab || 'sub-contractors';
        if (typeof window.renderCurrentAnalyticsTab === 'function') {
            window.renderCurrentAnalyticsTab(tab);
        }
    },

    /**
     * Обновить переключатель режима (local/cloud).
     */
    renderModeSwitcher() {
        AnalyticsRender.renderAnalyticsModeSwitcher();
    },

    /**
     * Обновить только панель фильтров без полной перерисовки.
     */
    renderFilters() {
        AnalyticsRender.updateAnalyticsFilters();
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: главный рендер текущей вкладки.
    // =========================================================================
    renderCurrentAnalyticsTab() {
        // Единый хелпер §5 (sync-ui-defer): sync не full-render'ит УЖЕ открытую
        // живую Аналитику. Но после route-teardown секция пустая — первый paint
        // обязателен, иначе «Загрузка…» висит до конца sync (История/ПК СК/График).
        // return true = был paint (desk afterTabPaint); false = no-op / skip.
        const activeTabEarly = (AnalyticsState && AnalyticsState.activeSubTab) || 'sub-contractors';
        const deferringNow = typeof window.shouldDeferFullRender === 'function'
            ? window.shouldDeferFullRender('analytics')
            : (!!(document.getElementById('tab-analytics')?.classList.contains('active'))
                && !!(window.isSyncing || window._rbiDeferActiveViewFullRender));
        if (deferringNow && analyticsSectionLooksPainted(activeTabEarly)) {
            if (window.RBI?.utils?.syncUi?.markDirty) window.RBI.utils.syncUi.markDirty('analytics');
            else if (window.syncDirtyFlags) window.syncDirtyFlags.analytics = true;
            return false;
        }
        if (deferringNow) {
            // Пусто / скелетон после teardown — помечаем dirty, но НЕ return:
            // ниже нарисуем из памяти (HistoryState / skRecords / scheduleData).
            if (window.RBI?.utils?.syncUi?.markDirty) window.RBI.utils.syncUi.markDirty('analytics');
            else if (window.syncDirtyFlags) window.syncDirtyFlags.analytics = true;
        }

        // В оригинале (analytics.legacy.js) `currentActiveAnalyticsTab` объявлялась
        // с дефолтом 'sub-contractors'; AnalyticsState.activeSubTab по умолчанию null
        // (до первого switchAnalyticsSubTab/восстановления из localStorage) — сохраняем
        // тот же дефолт, чтобы renderCurrentAnalyticsTab() работал сразу при первом
        // открытии вкладки «Аналитика».
        if (!AnalyticsState.activeSubTab) {
            AnalyticsState.setActiveSubTab('sub-contractors');
            window.currentActiveAnalyticsTab = 'sub-contractors';
        }
        const activeTab = AnalyticsState.activeSubTab;
        const wasDirty = !!(window.syncDirtyFlags && window.syncDirtyFlags.analytics);
        const fp = _analyticsFilterFingerprint();
        const dataSig = _analyticsSourceDataSignature();
        const dataChanged = dataSig !== _analyticsDataSig;
        const filterFpChanged = fp !== _analyticsFilterFp;
        const sectionPainted = activeTab === 'sub-history'
            ? _historySectionLooksPainted()
            : _analyticsSectionLooksPainted(activeTab);

        // Тихий sync / IDB reorder: данные сдвинулись, DOM живой — не rebuild.
        // Dirty остаётся → refresh при смене подвкладки / уходе-заходе.
        if (shouldSkipAnalyticsLivePaint({ filterFpChanged, dataChanged, sectionPainted })) {
            if (window.RBI?.utils?.syncUi?.markDirty) window.RBI.utils.syncUi.markDirty('analytics');
            else if (window.syncDirtyFlags) window.syncDirtyFlags.analytics = true;
            return false;
        }

        // A9: dirty сам по себе НЕ инвалидирует paint. Full rebuild — фильтр
        // или данные на пустом/скелетон-экране (shouldFullRebuildAnalyticsLive).
        const filterChanged = shouldFullRebuildAnalyticsLive({
            filterFpChanged,
            dataChanged,
            sectionPainted
        });

        if (filterChanged) {
            // Инвалидируем in-flight превью и кэш отрисованных подвкладок.
            _analyticsRenderGen += 1;
            _clearGalleryHydrateQueue();
            _ikoMemo.clear();
            _avgRatingsMemo.clear();
            _lazyContractorsGalleryFilled = false;
            _lazyContractorsGalleryData = null;
            _lazyDetailGalleryFilled = false;
            _lazyDetailGalleryPayload = null;
            for (const key in _chartInstances()) { if (_chartInstances()[key]) _chartInstances()[key].destroy(); }
            AnalyticsState.setChartInstances({});
            _analyticsFilterFp = fp;
            _analyticsDataSig = dataSig;
            _analyticsFilteredCache = getFilteredAnalyticsData();
            _analyticsRenderedTabs.clear();
            // Progressive: сразу показать «обновление», чтобы экран не был пустым.
            const listEl = document.getElementById('contractors-list-container');
            if (activeTab === 'sub-contractors' && listEl && typeof window.rbiShowContentSkeleton === 'function') {
                try {
                    window.rbiShowContentSkeleton(listEl, { cards: 3, label: _t('quality.analytics.updating', 'Обновление…') });
                } catch (_) { /* ignore */ }
            }
        } else if (wasDirty) {
            // Тихий sync без смены данных/фильтров — снимаем dirty, UI не трогаем.
            if (window.syncDirtyFlags) window.syncDirtyFlags.analytics = false;
        }

        AnalyticsRender.renderAnalyticsModeSwitcher();
        AnalyticsRender.renderOnePagerModeToggle();

        // Stay-on-tab reuse: history/sk dirty НЕ сбрасывает живой экран
        // (иначе каждый sync → skeleton «Загрузка истории…» / полный ПК СК).
        // Dirty остаётся — refresh при следующем заходе (analyticsTabCanReusePaint).
        const historyReuseOk = activeTab === 'sub-history' && _historySectionLooksPainted();
        const tabReuseOk = activeTab !== 'sub-history'
            && _analyticsRenderedTabs.has(activeTab)
            && _analyticsSectionLooksPainted(activeTab);
        if (!filterChanged && (historyReuseOk || tabReuseOk)) {
            if (window.syncDirtyFlags) window.syncDirtyFlags.analytics = false;
            return false;
        }

        const data = _analyticsFilteredCache || getFilteredAnalyticsData();
        if (!_analyticsFilteredCache) _analyticsFilteredCache = data;
        if (window.syncDirtyFlags) window.syncDirtyFlags.analytics = false;

        if (activeTab === 'sub-contractors') {
            AnalyticsRender.renderContractorsSubTab(data);
            // Если была открыта детализация — восстанавливаем с пересозданием графика
            if (window.currentDetailedContractor) {
                AnalyticsRender.showContractorDetailView(window.currentDetailedContractor);
            }
            if (data.length > 0) _analyticsRenderedTabs.add(activeTab);
            else _analyticsRenderedTabs.delete(activeTab);
        }
        else if (activeTab === 'sub-onepager') {
            AnalyticsRender.renderOnePagerSubTab(data);
            if (data.length > 0) _analyticsRenderedTabs.add(activeTab);
            else _analyticsRenderedTabs.delete(activeTab);
        }
        else if (activeTab === 'sub-schedule') {
            // skipLoad=true если график уже поднимали в сессии — не ждём повторный IDB.
            const skipLoad = Array.isArray(window.rbi_scheduleData);
            if (typeof rbi_renderScheduleTab === 'function') {
                Promise.resolve(rbi_renderScheduleTab(skipLoad)).then(() => {
                    if (typeof window.analyticsMarkTabPainted === 'function') {
                        window.analyticsMarkTabPainted('sub-schedule');
                    }
                }).catch(() => {});
            }
            _analyticsRenderedTabs.add(activeTab);
        }
        else if (activeTab === 'sub-data') {
            if (typeof renderDataSubTab === 'function') renderDataSubTab(data);
            if (data.length > 0) _analyticsRenderedTabs.add(activeTab);
            else _analyticsRenderedTabs.delete(activeTab);
        }
        else if (activeTab === 'sub-history') {
            // Dirty: если записи уже в памяти — сначала рисуем (без «Загрузка…» на минуту IDB),
            // затем тихо перезагружаем. Пустая память — skeleton + loadRecords.
            const histDirty = !!(window.syncDirtyFlags && window.syncDirtyFlags.history);
            const hasMem = !!(window.HistoryState && Array.isArray(window.HistoryState.allRecords)
                && window.HistoryState.allRecords.length > 0);
            if (histDirty) {
                window.syncDirtyFlags.history = false;
            }
            if (histDirty && hasMem) {
                renderHistoryTab();
                initCollapsiblePanel('hist-sticky-panel', 'hist-panel-body', 'hist-panel-header', 'hist-panel-toggle-icon');
                if (window.HistoryActions && typeof window.HistoryActions.loadRecords === 'function') {
                    Promise.resolve(window.HistoryActions.loadRecords()).then(function () {
                        if (AnalyticsState.activeSubTab === 'sub-history') {
                            renderHistoryTab();
                        }
                    }).catch(function () { /* ignore */ });
                }
                return true;
            }
            if (histDirty && !hasMem && window.HistoryActions && typeof window.HistoryActions.loadRecords === 'function') {
                const histEl = document.getElementById('history-list');
                if (histEl && typeof window.rbiShowContentSkeleton === 'function') {
                    window.rbiShowContentSkeleton(histEl, { cards: 5, label: _t('quality.analytics.loading', 'Загрузка…') });
                }
                Promise.resolve(window.HistoryActions.loadRecords()).then(function () {
                    renderHistoryTab();
                    initCollapsiblePanel('hist-sticky-panel', 'hist-panel-body', 'hist-panel-header', 'hist-panel-toggle-icon');
                });
                return true;
            }
            renderHistoryTab();
            initCollapsiblePanel('hist-sticky-panel', 'hist-panel-body', 'hist-panel-header', 'hist-panel-toggle-icon');
        }
        else if (activeTab === 'sub-sk') {
            if (window.syncDirtyFlags) window.syncDirtyFlags.sk = false;
            // Гарантированно запускаем пайплайн ПК СК, он сам внутри разберется с кэшем.
            // analyticsMarkTabPainted('sub-sk') — в конце sk_renderMainTab (async).
            // Stay-on-tab с живым shell уже отсечён tabReuseOk выше.
            if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') window.RBI.events.emit('sk:renderRequested', { view: 'mainTab' });
        }
        else if (activeTab === 'sub-rating') AnalyticsRender.renderRatingTab(); // Обратная совместимость
        return true;
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: переключатель источника
    // аналитики (Идеальное выравнивание iOS Style).
    // =========================================================================
    renderAnalyticsModeSwitcher() {
        const container = document.getElementById('analytics-mode-container');
        const headerIconContainer = document.getElementById('analytics-status-icon-container');

        // Если облако отключено — прячем элементы
        if (!_syncConfig().enabled) {
            if (container) container.innerHTML = '';
            if (headerIconContainer) headerIconContainer.innerHTML = '';
            return;
        }

        const mode = _analyticsMode();
        const isCloud = mode === 'cloud';

        // Добавляем глобальную функцию для тумблера, если её нет
        if (!window.toggleAnalyticsMode) {
            window.toggleAnalyticsMode = function () {
                const current = _analyticsMode();
                window.setAnalyticsDataMode(current === 'cloud' ? 'local' : 'cloud');
                AnalyticsRender.renderCurrentAnalyticsTab();
            };
        }

        if (container) {
            const html = `
                <div onclick="window.toggleAnalyticsMode()" class="w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg flex p-0.5 shadow-sm cursor-pointer active:scale-95 transition-transform" style="height: 34px;">
                    <div title="${_t('quality.analytics.mode.device_title', 'Данные с телефона')}" class="flex-1 rounded-md text-rbi-caption font-black uppercase transition-all flex items-center justify-center gap-1.5 pointer-events-none ${!isCloud ? 'bg-[var(--hover-bg)] text-brand shadow-sm border border-surface' : 'text-muted opacity-70'}">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"></path></svg>
                        <span class="hidden min-[450px]:inline">${_t('quality.analytics.mode.phone', 'Телефон')}</span>
                    </div>
                    <div title="${_t('quality.analytics.mode.cloud_title', 'Данные с сервера')}" class="flex-1 rounded-md text-rbi-caption font-black uppercase transition-all flex items-center justify-center gap-1.5 pointer-events-none ${isCloud ? 'bg-[var(--hover-bg)] text-brand shadow-sm border border-surface' : 'text-muted opacity-70'}">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"></path></svg>
                        <span class="hidden min-[450px]:inline">${_t('quality.analytics.mode.cloud', 'Облако')}</span>
                    </div>
                </div>
            `;
            container.className = "w-full";
            container.innerHTML = html;
        }
        // 2. Рендерим иконку в шапке панели
        if (headerIconContainer) {
            let iconHtml = '';
            let iconClass = 'text-muted';

            if (isCloud) {
                if (window.isSyncing) {
                    iconClass = 'text-brand animate-pulse';
                    iconHtml = `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"></path></svg>`;
                } else {
                    iconClass = 'text-green-500';
                    iconHtml = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"></path></svg>`;
                }
            } else {
                iconHtml = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"></path></svg>`;
            }

            headerIconContainer.innerHTML = `<div class="flex items-center ${iconClass} transition-colors duration-300" title="${_t('quality.analytics.mode.source', 'Источник: {src}', { src: isCloud ? _t('quality.analytics.mode.cloud', 'Облако') : _t('quality.analytics.mode.device', 'Устройство') })}">${iconHtml}</div>`;
        }
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: тумблер «Объект / Компания»
    // в заголовке фильтров.
    // =========================================================================
    renderOnePagerModeToggle() {
        const container = document.getElementById('analytics-global-mode-toggle');
        if (!container) return;

        // Показываем тумблер ТОЛЬКО на вкладке "Сводка"
        if (AnalyticsState.activeSubTab !== 'sub-onepager') {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        if (typeof window.onepagerMode === 'undefined') window.onepagerMode = 'local';
        const isGlobal = window.onepagerMode === 'global';

        // event.stopPropagation() нужен, чтобы при клике на тумблер не сворачивалась панель фильтров
        container.innerHTML = `
            <div class="flex items-center bg-surface p-0.5 rounded-full shadow-inner cursor-pointer border border-surface" onclick="event.stopPropagation(); window.onepagerMode = '${isGlobal ? 'local' : 'global'}'; renderCurrentAnalyticsTab();">
                <div class="px-2 py-0.5 rounded-full text-rbi-caption font-black uppercase transition-all duration-300 ${!isGlobal ? 'bg-surface text-brand shadow-sm' : 'text-muted'}">Объект</div>
                <div class="px-2 py-0.5 rounded-full text-rbi-caption font-black uppercase transition-all duration-300 ${isGlobal ? 'bg-surface text-brand shadow-sm' : 'text-muted'}">Компания</div>
            </div>
        `;
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: обновление списков в фильтрах
    // аналитики.
    // =========================================================================
    updateAnalyticsFilters() {
        const selectC = document.getElementById('global-filter-contractor');
        const selectT = document.getElementById('global-filter-template');
        if (!selectC || !selectT) return;

        var _allInspections = _inspections();
        const uniqueCs = [...new Set(_allInspections.map(i => i.contractorName).filter(Boolean))];
        selectC.innerHTML = `<option value="ALL">${_t('quality.analytics.filter.all_contractors', 'Все подрядчики')}</option>` + uniqueCs.map(c => `<option value="${c}">${c}</option>`).join('');

        const tmplSelect = document.getElementById('checklist-selector');
        if (tmplSelect) {
            let opts = `<option value="ALL">${_t('quality.analytics.filter.all_templates', 'Все виды работ')}</option>`;
            Array.from(tmplSelect.options).forEach(o => {
                if (o.value && o.value !== "HOME" && o.value !== "UPLOAD") opts += `<option value="${o.value}">${o.text}</option>`;
            });
            selectT.innerHTML = opts;
        }
        if (typeof updateFilterButtonLabels === 'function') {
            updateFilterButtonLabels();
        }
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: подвкладка «Подрядчики»
    // (Сводка + Графики + Аккордеоны + Магия TWI).
    // =========================================================================
    renderContractorsSubTab(data) {
        const topContainer = document.getElementById('contractors-top-summary');
        if (!topContainer) return;

        if (data.length === 0) {
            topContainer.innerHTML = `<div class="text-center text-muted text-sm py-10 bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] shadow-sm">${_t('quality.analytics.empty.filtered', 'Нет данных по выбранным фильтрам')}</div>`;
            document.getElementById('contractors-list-container').innerHTML = '';
            document.getElementById('contractors-chips-container').style.display = 'none';
            return;
        }
        document.getElementById('contractors-chips-container').style.display = 'flex';

        let sumB1 = 0, sumB2 = 0, sumB3 = 0;
        const groupedC = {};
        const causesCount = {};

        // A9: фотогалереи — lazy при открытии <details>, не на первом paint.
        _lazyContractorsGalleryData = data;
        _lazyContractorsGalleryFilled = false;

        data.forEach(i => {
            if (i.metrics) {
                sumB1 += Number(i.metrics.n_B1_fail) || 0;
                sumB2 += Number(i.metrics.n_B2_fail) || 0;
                sumB3 += Number(i.metrics.n_B3_fail) || 0;
            }
            const projectLabel = i.project_display_name || i.projectName || i.project_canonical_key || _t('quality.analytics.fallback.no_project', 'Без объекта');
            const cKey = i.contractorName + ' [' + projectLabel + ']';
            groupedC[cKey] = groupedC[cKey] || [];
            groupedC[cKey].push(i);

            if (i.state) {
                Object.keys(i.state).forEach(id => {
                    const s = i.state[id];
                    if (s === 'fail' || s === 'fail_escalated') {
                        let code = i.details && i.details[id] ? i.details[id].causeCode || 'C00' : 'C00';
                        causesCount[code] = (causesCount[code] || 0) + 1;
                    }
                });
            }
        });

        // KPI УрК/док/надёжность — среднее по подрядчикам (окно ≤15), как в печати One-Pager.
        const kpiRatings = (typeof window.avgContractorRatingsFromChecks === 'function')
            ? _avgContractorRatingsCached(data)
            : { avgUrk: 0, avgDoc: null, avgReliability: null, relN: 0 };
        const avgUrkProd = kpiRatings.avgUrk;
        const avgDocProd = kpiRatings.avgDoc;
        const contrCount = Object.keys(groupedC).length;

        let cList = [];

        for (let cName in groupedC) {
            const cData = groupedC[cName];
            const m = _contractorMetricsCached(cName, cData);
            if (m) {
                cList.push({ name: cName, metrics: m });
            }
        }

        const validContrCount = kpiRatings.relN || 0;
        const avgIntegralUrk = kpiRatings.avgReliability != null ? kpiRatings.avgReliability : 0;
        const defaultInsight = buildRiskZonesInsight({
            rows: cList,
            avgUrk: avgUrkProd,
            qualityN: validContrCount,
            sumB1,
            sumB2,
            sumB3,
            checks: data.length
        });

        const globalKey = 'global_main_analysis';
        let savedExpert = _reports().getExpertConclusion(globalKey) || '';
        // Старый автотекст в expert conclusions давал нечитаемую простыню — сбрасываем.
        if (savedExpert && isAutoRiskInsightText(savedExpert)) {
            try { _reports().setExpertConclusion(globalKey, ''); } catch (_) { /* ignore */ }
            savedExpert = '';
        }
        const isCustomText = !!String(savedExpert).trim();
        // В UI только компактная карточка (или осознанный ИИ/ручной текст). Простыню автотекста не показываем.
        const uiSmartText = isCustomText
            ? formatRiskInsightDisplayHtml(savedExpert)
            : (defaultInsight.html || '');
        const rawSmartText = isCustomText ? savedExpert : '';

        const getSelectHtml = (type) => `
            <select onchange="updateTrendCharts('${type}', this.value)" class="text-rbi-caption font-semibold border border-brand-soft text-brand bg-white rounded px-1 py-1 outline-none cursor-pointer shadow-sm">
                <option value="WEEK" ${window.trendGroupings[type] === 'WEEK' ? 'selected' : ''}>${_t('quality.analytics.period.weeks', 'Недели')}</option>
                <option value="MONTH" ${window.trendGroupings[type] === 'MONTH' ? 'selected' : ''}>${_t('quality.analytics.period.months', 'Месяцы')}</option>
            </select>
        `;

        const docGapWarning = (avgDocProd !== null && Math.abs(avgUrkProd - avgDocProd) > 30)
            ? `<div class="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-2 shadow-sm text-center text-rbi-caption font-bold text-orange-700 dark:text-orange-400 flex items-center justify-center gap-1.5 mb-2">
                ⚠️ Большой разрыв между физикой (${avgUrkProd}%) и документацией (${avgDocProd}%) — ${Math.abs(avgUrkProd - avgDocProd)} п.п. Проверьте комплектность документов.
            </div>`
            : '';

        topContainer.innerHTML = `
            <div class="grid grid-cols-3 min-[500px]:grid-cols-5 gap-2 mb-2">
                <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-2 shadow-sm flex flex-col items-center justify-center text-center min-w-0">
                    <div class="text-rbi-caption font-bold text-muted uppercase tracking-wide mb-0.5 truncate w-full" title="${_t('quality.analytics.kpi.avg_urk_title', 'Средний УрК подрядчиков (окно до 15 проверок, приоритет N≥7)')}">${_t('quality.analytics.kpi.avg_urk', 'Ср. УрК')}</div>
                    <div class="text-lg font-bold leading-none ${avgUrkProd < 70 ? 'text-danger' : (avgUrkProd < 85 ? 'text-orange-500' : 'text-green-600')}">${avgUrkProd}%</div>
                </div>
                <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-2 shadow-sm flex flex-col items-center justify-center text-center min-w-0">
                    <div class="text-rbi-caption font-bold text-muted uppercase tracking-wide mb-0.5 truncate w-full" title="${_t('quality.analytics.kpi.avg_doc_title', 'Средний УрК документации подрядчиков (окно до 15)')}">${_t('quality.analytics.kpi.avg_doc', 'Ср. УрК Докум.')}</div>
                    <div class="text-lg font-bold leading-none ${avgDocProd === null ? 'text-muted' : (avgDocProd < 70 ? 'text-danger' : (avgDocProd < 85 ? 'text-orange-500' : 'text-brand'))}">${avgDocProd === null ? '—' : avgDocProd + '%'}</div>
                </div>
                <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-2 shadow-sm flex flex-col items-center justify-center text-center min-w-0">
                    <div class="text-rbi-caption font-bold text-muted uppercase tracking-wide mb-0.5 truncate w-full" title="${_t('quality.analytics.kpi.reliability_title', 'Средний Интегральный рейтинг подрядчиков')}">${_t('quality.analytics.kpi.reliability', 'Надежность')}</div>
                    <div class="text-lg font-bold leading-none ${avgIntegralUrk < 70 ? 'text-danger' : (avgIntegralUrk < 85 ? 'text-orange-500' : 'text-brand')}">${validContrCount > 0 ? avgIntegralUrk + '%' : _t('quality.analytics.kpi.collecting', 'СБОР')}</div>
                </div>
                <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-2 shadow-sm flex flex-col items-center justify-center text-center min-w-0">
                    <div class="text-rbi-caption font-bold text-muted uppercase tracking-wide mb-0.5 truncate w-full">${_t('quality.analytics.kpi.contractors', 'Подрядчиков')}</div>
                    <div class="text-lg font-bold leading-none text-ink dark:text-white">${contrCount}</div>
                </div>
                <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-2 shadow-sm flex flex-col items-center justify-center text-center min-w-0">
                    <div class="text-rbi-caption font-bold text-muted uppercase tracking-wide mb-0.5 truncate w-full">${_t('quality.analytics.kpi.checks', 'Проверок')}</div>
                    <div class="text-lg font-bold leading-none text-ink dark:text-white">${data.length}</div>
                </div>
            </div>
            <div class="mb-3">
                ${docGapWarning}
                <div class="bg-[var(--hover-bg)] border border-[var(--card-border)] rounded-xl p-2 shadow-inner flex justify-around text-center">
                    <div><span class="text-rbi-caption font-semibold text-muted uppercase block">${_t('quality.analytics.defect.b1', 'Мелкие (B1)')}</span><span class="font-bold text-blue-600">${sumB1}</span></div>
                    <div class="w-px bg-[var(--card-border)]"></div>
                    <div><span class="text-rbi-caption font-semibold text-muted uppercase block">${_t('quality.analytics.defect.b2', 'Значимые (B2)')}</span><span class="font-bold text-orange-500">${sumB2}</span></div>
                    <div class="w-px bg-[var(--card-border)]"></div>
                    <div><span class="text-rbi-caption font-semibold text-muted uppercase block">${_t('quality.analytics.defect.b3', 'Критичные (B3)')}</span><span class="font-bold text-danger">${sumB3}</span></div>
                </div>
            </div>

            <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm mb-3 group [&_summary::-webkit-details-marker]:hidden">
                <summary class="p-3 font-bold text-rbi-label text-brand uppercase tracking-widest cursor-pointer flex justify-between items-center bg-brand-soft/20 rounded-xl hover:bg-brand-soft transition-colors">
                    <span class="flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        ${_t('quality.analytics.section.risk_zones', 'Анализ зон риска (AI)')}
                    </span>
                    <span class="transition-transform group-open:rotate-180">▼</span>
                </summary>
                <div class="p-3 border-t border-[var(--card-border)] bg-surface relative">
                    <button onclick="editExpertText('${globalKey}', 'hidden_global_analysis')" class="absolute top-3 right-3 text-rbi-caption font-semibold bg-surface border border-surface px-2 py-1 rounded shadow-sm active:scale-95 text-muted flex items-center gap-1">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg> Изменить
                    </button>
                    <div class="text-rbi-caption text-muted uppercase font-semibold mb-3 border-b border-slate-100 pb-2 pr-20">${_t('quality.analytics.section.sample_status', 'Статус выборки: проанализировано {n} подрядчиков', { n: validContrCount })}</div>
                    ${isCustomText ? `<div class="text-rbi-caption font-semibold text-yellow-700 uppercase mb-2 bg-yellow-100 w-fit px-2 py-0.5 rounded flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> Скорректировано инженером</div>` : ''}
                    <div class="ana-risk-host text-rbi-label text-ink leading-relaxed font-medium">
                        ${uiSmartText}
                    </div>
                    <textarea id="hidden_global_analysis" class="hidden">${rawSmartText}</textarea>
                </div>
            </details>

            <details id="analytics-dynamics-details" class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm mb-3 group [&_summary::-webkit-details-marker]:hidden">
                <summary class="p-3 font-bold text-rbi-label text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-xl">
                    <span class="flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path></svg>
                        ${_t('quality.analytics.section.dynamics', 'Динамика и Тренды')}
                    </span>
                    <span class="transition-transform group-open:rotate-180">▼</span>
                </summary>
                <div class="p-3 border-t border-[var(--card-border)] bg-surface/30">
                    <div class="bg-surface p-3 rounded-lg border border-surface shadow-sm mb-3">
                        <div class="flex justify-between items-center mb-2">
                            <div class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase">${_t('quality.analytics.section.dynamics_contr', 'Динамика: Подрядчики (Топ-10)')}</div>
                            <div class="flex gap-1">
                                <button onclick="openChartFilterModal('contrs')" class="text-rbi-caption font-semibold border border-slate-200 text-muted bg-surface rounded px-2 py-1 shadow-sm flex items-center gap-1">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg> ${_t('quality.analytics.chart.lines', 'Линии')}
                                </button>
                                ${getSelectHtml('contrs')}
                            </div>
                        </div>
                        <div style="height: 180px; position: relative;"><canvas id="chart_eng_trend_contrs"></canvas></div>
                    </div>
                </div>
            </details>

            <details id="analytics-causes-details" class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm mb-3 group [&_summary::-webkit-details-marker]:hidden">
                <summary class="p-3 font-bold text-rbi-label text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-xl">
                    <span class="flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                        ${_t('quality.analytics.section.causes_compare', 'Причины и Сравнение')}
                    </span>
                    <span class="transition-transform group-open:rotate-180">▼</span>
                </summary>
                <div class="p-3 border-t border-[var(--card-border)] bg-surface/30 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div class="bg-surface p-3 rounded-lg border border-surface shadow-sm">
                        <div class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-2">${_t('quality.analytics.section.root_causes', 'Коренные причины дефектов')}</div>
                        <div style="height: 180px; position: relative;"><canvas id="chart_eng_causes"></canvas></div>
                    </div>
                    <div class="bg-surface p-3 rounded-lg border border-surface shadow-sm">
                        <div class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-2">${_t('quality.analytics.section.compare_contr', 'Сравнение Подрядчиков (Интегр. УрК)')}</div>
                        <div style="height: 180px; position: relative;"><canvas id="chart_eng_compare"></canvas></div>
                    </div>
                </div>
            </details>

            <details id="analytics-photos-details" class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm mb-3 group [&_summary::-webkit-details-marker]:hidden">
                <summary class="p-3 font-bold text-rbi-label text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-xl">
                    <span class="flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
                        ${_t('quality.analytics.section.gallery', 'Фотогалерея (Брак и Эталоны)')}
                    </span>
                    <span class="transition-transform group-open:rotate-180">▼</span>
                </summary>
                <div class="p-3 border-t border-[var(--card-border)] bg-surface/30 space-y-4">
                    <div>
                        <h3 class="text-rbi-caption font-bold text-danger uppercase mb-2">${_t('quality.analytics.gallery.b3_title', 'Критический брак (B3)')}</h3>
                        <div id="lazy-gallery-main_b3" class="text-xs text-muted">${_t('quality.analytics.gallery.open_to_load', 'Откройте блок, чтобы загрузить фото…')}</div>
                    </div>
                    <div>
                        <h3 class="text-rbi-caption font-bold text-orange-600 uppercase mb-2">${_t('quality.analytics.gallery.b2_title', 'Значимые дефекты (B2)')}</h3>
                        <div id="lazy-gallery-main_b2" class="text-xs text-muted">${_t('quality.analytics.gallery.open_to_load', 'Откройте блок, чтобы загрузить фото…')}</div>
                    </div>
                    <div>
                        <h3 class="text-rbi-caption font-bold text-green-600 uppercase mb-2">${_t('quality.analytics.gallery.ok_title', 'Эталонные работы (OK)')}</h3>
                        <div id="lazy-gallery-main_ok" class="text-xs text-muted">${_t('quality.analytics.gallery.open_to_load', 'Откройте блок, чтобы загрузить фото…')}</div>
                    </div>
                </div>
            </details>
        `;

        const photosDetails = document.getElementById('analytics-photos-details');
        if (photosDetails) {
            photosDetails.addEventListener('toggle', rbiEnsureAnalyticsPhotoGalleries);
        }

        // Progressive: сначала список, графики — после paint с проверкой gen.
        AnalyticsRender.renderContractorsListOnly(data);

        // P2-0024: графики свёрнутых блоков «Динамика» и «Причины и Сравнение» рисуются при раскрытии
        // (раньше — всегда через 120 мс: ≈ 100 мс работы на каждую смену периода/фильтра на 3000 проверок).
        // P2-0025 (ТД №165): блок уже не на экране (перерисован) — не рисуем; смена поколения без
        // перерисовки больше не оставляет раскрытый блок пустым.
        const dynamicsEl = document.getElementById('analytics-dynamics-details');
        const causesEl = document.getElementById('analytics-causes-details');
        const blockGone = (el) => !!el && !el.isConnected;
        const drawTrendChart = () => {
            if (blockGone(dynamicsEl)) return;
            const trendContrsData = window.buildTrendChartData(data, 'contractorName', window.selectedChartFilters.contrs, window.trendGroupings.contrs);
            const ctxTrendC = document.getElementById('chart_eng_trend_contrs')?.getContext('2d');
            if (ctxTrendC) {
                if (_chartInstances()['chart_eng_trend_contrs']) _chartInstances()['chart_eng_trend_contrs'].destroy();
                _chartInstances()['chart_eng_trend_contrs'] = new Chart(ctxTrendC, { type: 'line', data: trendContrsData, options: { animation: false, responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } }, plugins: { legend: { position: 'right', labels: { boxWidth: 8, font: { size: 9 } } } } } });
            }
        };
        const drawCausesCharts = () => {
            if (blockGone(causesEl)) return;
            let causesLabels = []; let causesData = [];
            Object.keys(causesCount).sort((a, b) => causesCount[b] - causesCount[a]).forEach(code => {
                const name = _defectCauses().find(c => c.code === code)?.name || _t('quality.analytics.fallback.other_cause', 'Иное');
                causesLabels.push(name.substring(0, 15)); causesData.push(causesCount[code]);
            });
            const ctxCauses = document.getElementById('chart_eng_causes')?.getContext('2d');
            if (ctxCauses && causesData.length > 0) {
                if (_chartInstances()['chart_eng_causes']) _chartInstances()['chart_eng_causes'].destroy();
                _chartInstances()['chart_eng_causes'] = new Chart(ctxCauses, { type: 'bar', indexAxis: 'y', data: { labels: causesLabels, datasets: [{ data: causesData, backgroundColor: '#f59e0b', borderRadius: 4 }] }, options: { animation: false, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
            }

            if (blockGone(causesEl)) return;
            cList.sort((a, b) => b.metrics.finalC - a.metrics.finalC);
            const compLabels = cList.map(c => c.name.length > 10 ? c.name.substring(0, 10) + '...' : c.name);
            const compData = cList.map(c => c.metrics.finalC);
            const compColors = compData.map(v => v < 70 ? '#ef4444' : (v < 85 ? '#f59e0b' : '#22c55e'));

            const ctxComp = document.getElementById('chart_eng_compare')?.getContext('2d');
            if (ctxComp && compData.length > 0) {
                if (_chartInstances()['chart_eng_compare']) _chartInstances()['chart_eng_compare'].destroy();
                _chartInstances()['chart_eng_compare'] = new Chart(ctxComp, { type: 'bar', data: { labels: compLabels, datasets: [{ data: compData, backgroundColor: compColors, borderRadius: 4 }] }, options: { animation: false, responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } } });
            }
        };
        _drawWhenOpen(dynamicsEl, drawTrendChart);
        _drawWhenOpen(causesEl, drawCausesCharts);
    },


    // =========================================================================
    // Перенесено из analytics.legacy.js: список Подрядчиков (Мини-карточки
    // сеткой 2 и 3 в ряд).
    // =========================================================================
    renderContractorsListOnly(data) {
        const listContainer = document.getElementById('contractors-list-container');
        if (!listContainer) return;

        const groupedC = {};
        data.forEach(item => {
            const projectLabel = item.project_display_name || item.projectName || item.project_canonical_key || 'Без объектa';
            const cKey = item.contractorName + ' [' + projectLabel + ']';
            groupedC[cKey] = groupedC[cKey] || [];
            groupedC[cKey].push(item);
        });

        const cList = [];
        for (let cName in groupedC) {
            const cData = groupedC[cName];
            const m = _contractorMetricsCached(cName, cData);

            // Считаем B1 и B2 для вывода в карточку
            let sumB1 = 0, sumB2 = 0;
            cData.forEach(i => { if (i.metrics) { sumB1 += Number(i.metrics.n_B1_fail) || 0; sumB2 += Number(i.metrics.n_B2_fail) || 0; } });

            if (m) cList.push({ name: cName, data: cData, metrics: m, workType: cData[0].templateTitle, b1: sumB1, b2: sumB2 });
        }

        let filteredList = cList;
        if (window.currentContractorsFilter === 'CRITICAL') filteredList = cList.filter(c => c.metrics.finalC < 70 || c.metrics.n_изделий_с_B3 > 0);
        else if (window.currentContractorsFilter === 'WARNING') filteredList = cList.filter(c => (c.metrics.finalC >= 70 && c.metrics.finalC < 85) || c.metrics.stabilityIndex < 60);
        else if (window.currentContractorsFilter === 'STABLE') filteredList = cList.filter(c => c.metrics.finalC >= 85 && c.metrics.n_изделий_с_B3 === 0);
        else if (window.currentContractorsFilter === 'NEW') filteredList = cList.filter(c => c.metrics.count < 7);

        filteredList.sort((a, b) => {
            if (a.metrics.count < 7 && b.metrics.count >= 7) return 1;
            if (b.metrics.count < 7 && a.metrics.count >= 7) return -1;
            return b.metrics.finalC - a.metrics.finalC;
        });

        if (filteredList.length === 0) {
            listContainer.innerHTML = `<div class="text-center py-6 text-muted font-bold text-rbi-label uppercase bg-surface rounded-xl border border-surface">В этой категории никого нет</div>`;
            return;
        }

        // Сетка: 2 колонки на мобильных, 3 на планшетах/ПК
        let html = '<div class="grid grid-cols-2 md:grid-cols-3 gap-3">';

        filteredList.forEach((c) => {
            const m = c.metrics;
            const isPrelim = m.count < 7;
            const borderClass = m.finalC < 70 ? 'border-danger' : 'border-[var(--card-border)]';
            const relColor = isPrelim ? '#94a3b8' : _urkGradientColor(m.finalC);
            const urkColor = _urkGradientColor(m.baseUrkContrPerc);
            const hasDoc = m.documentaryC !== null && m.documentaryC !== undefined;
            const docColor = hasDoc ? _urkGradientColor(m.documentaryC) : '';
            const docGapWarn = (hasDoc && !isPrelim && Math.abs(m.baseUrkContrPerc - m.documentaryC) > 30) ? ` <span title="${_t('quality.analytics.warn.doc_gap', 'Большой разрыв между физикой и документацией (>30%)')}">⚠️</span>` : '';

            // Защита от поломки HTML из-за кавычек в названиях
            const safeName = c.name.replace(/'/g, "\\'").replace(/"/g, "&quot;");

            html += `
            <div class="bg-[var(--card-bg)] border ${borderClass} rounded-xl p-2.5 sm:p-3 shadow-sm relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform flex flex-col justify-between min-w-0" onclick="showContractorDetailView('${safeName}')">
                ${isPrelim ? '<div class="absolute top-0 right-0 z-[1] bg-slate-200 text-muted text-rbi-caption font-black px-1.5 py-0.5 rounded-bl-lg uppercase leading-none" title="Нужно больше проверок">Сбор</div>' : ''}
                
                <div class="min-w-0">
                    <div class="text-rbi-caption sm:text-rbi-label font-black text-ink dark:text-white leading-snug mb-0.5 pr-8 line-clamp-2 break-words">${c.name}</div>
                    <div class="text-rbi-caption sm:text-rbi-caption font-bold text-[var(--text-muted)] truncate mb-2">${c.workType}</div>

                    <div class="grid grid-cols-2 gap-2 mb-2">
                        <div class="min-w-0 flex flex-col">
                            <div class="text-rbi-caption sm:text-rbi-caption uppercase text-muted font-bold truncate">${_t('quality.analytics.kpi.reliability', 'Надежность')}</div>
                            <div class="text-xl sm:text-2xl font-black leading-none tabular-nums" style="color:${relColor}">${isPrelim ? '--' : m.finalC}<span class="text-xs sm:text-sm">%</span></div>
                            <div class="text-rbi-caption sm:text-rbi-caption text-muted font-bold mt-0.5 h-3 tabular-nums" title="${_t('quality.analytics.kpi.window15_title', 'Окно ≤15 в периоде')}">N ${m.count}</div>
                        </div>
                        <div class="min-w-0 flex flex-col border-l border-[var(--card-border)] pl-2">
                            <div class="text-rbi-caption sm:text-rbi-caption uppercase text-muted font-bold truncate">${_t('quality.analytics.kpi.quality_level', 'Ур. качества')}</div>
                            <div class="text-xl sm:text-2xl font-black leading-none tabular-nums" style="color:${urkColor}">${m.baseUrkContrPerc}<span class="text-xs sm:text-sm">%</span></div>
                            <div class="text-rbi-caption sm:text-rbi-caption font-bold mt-0.5 h-3 truncate tabular-nums" style="color:${hasDoc ? docColor : 'transparent'}">${hasDoc ? `${_t('quality.analytics.kpi.doc_short', 'Док')} ${m.documentaryC}%${docGapWarn}` : '&nbsp;'}</div>
                        </div>
                    </div>
                </div>
                
                <!-- Информационная панель (Счетчики дефектов) -->
                <div class="flex flex-wrap justify-between items-center gap-1 bg-[var(--hover-bg)] rounded-md px-1.5 py-1.5 mb-2 border border-[var(--card-border)]">
                    <div class="text-rbi-caption sm:text-rbi-caption font-black text-muted uppercase shrink-0">${_t('quality.analytics.kpi.def_abbr', 'Деф.')}</div>
                    <div class="flex flex-wrap justify-end gap-0.5 min-w-0">
                        <span class="text-rbi-caption sm:text-rbi-caption font-black text-blue-600 bg-blue-50 border border-blue-100 px-1 rounded tabular-nums" title="B1">B1:${c.b1}</span>
                        <span class="text-rbi-caption sm:text-rbi-caption font-black text-orange-600 bg-orange-50 border border-orange-100 px-1 rounded tabular-nums" title="B2">B2:${c.b2}</span>
                        <span class="text-rbi-caption sm:text-rbi-caption font-black text-danger bg-danger-soft border border-danger-soft px-1 rounded tabular-nums" title="B3">B3:${m.n_изделий_с_B3}</span>
                    </div>
                </div>

                <!-- Информационная панель (Коэффициенты) -->
                <div class="grid grid-cols-4 gap-0.5 pt-2 border-t border-[var(--card-border)] text-center">
                    <div class="min-w-0">
                        <div class="text-[6px] sm:text-rbi-caption text-muted uppercase font-bold truncate" title="${_t('quality.analytics.kpi.sample_title', 'Выборка')}">${_t('quality.analytics.table.checks', 'Пров.')}</div>
                        <div class="text-rbi-caption sm:text-rbi-caption font-black text-ink dark:text-white tabular-nums">${m.count}</div>
                    </div>
                    <div class="min-w-0 border-l border-surface">
                        <div class="text-[6px] sm:text-rbi-caption text-muted uppercase font-bold truncate" title="${_t('quality.analytics.kpi.stability_title', 'Стабильность')}">${_t('quality.analytics.kpi.stab_abbr', 'Стаб.')}</div>
                        <div class="text-rbi-caption sm:text-rbi-caption font-black tabular-nums ${isPrelim ? 'text-muted' : m.stabColor}">${isPrelim ? '-' : m.stabilityIndex}</div>
                    </div>
                    <div class="min-w-0 border-l border-surface">
                        <div class="text-[6px] sm:text-rbi-caption text-muted uppercase font-bold truncate" title="${_t('quality.analytics.kpi.ks_title', 'Системность (Ks)')}">Ks</div>
                        <div class="text-rbi-caption sm:text-rbi-caption font-black tabular-nums ${m.ks < 1 ? 'text-danger' : 'text-ink'}">${m.ks.toFixed(2)}</div>
                    </div>
                    <div class="min-w-0 border-l border-surface">
                        <div class="text-[6px] sm:text-rbi-caption text-muted uppercase font-bold truncate" title="${_t('quality.analytics.kpi.kcrit_title', 'Критичность (Kcrit)')}">Kcrit</div>
                        <div class="text-rbi-caption sm:text-rbi-caption font-black tabular-nums ${m.kcritC < 1 ? 'text-danger' : 'text-ink'}">${m.kcritC.toFixed(2)}</div>
                    </div>
                </div>
            </div>`;
        });

        html += '</div>';
        listContainer.innerHTML = html;
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: подвкладка «Сводка» (One-Pager).
    // =========================================================================
    async renderOnePagerSubTab(data) {
        var _allInspections = _inspections();
        const container = document.getElementById('onepager-content-container');

        // Инициализация режима по умолчанию
        if (typeof window.onepagerMode === 'undefined') window.onepagerMode = 'local';

        // Если выбран глобальный режим — передаем управление новой функции!
        if (window.onepagerMode === 'global') {
            return AnalyticsRender.renderGlobalOnePager(data, container);
        }
        if (data.length === 0) {
            container.innerHTML = `<div class="text-center text-muted text-sm py-10 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] shadow-sm">${_t('quality.analytics.empty.analysis', 'Нет данных для анализа')}</div>`;
            return;
        }

        let sumB3 = 0;
        data.forEach(i => {
            if (i.metrics) {
                sumB3 += Number(i.metrics.n_B3_fail) || 0;
            }
        });
        // KPI УрК/док — среднее по подрядчикам (окно ≤15), как в печати One-Pager.
        const kpiRatings = (typeof window.avgContractorRatingsFromChecks === 'function')
            ? _avgContractorRatingsCached(data)
            : { avgUrk: 0, avgDoc: null };
        const currAvgUrk = kpiRatings.avgUrk;
        const currAvgDoc = kpiRatings.avgDoc;

        const groupedC = {};
        data.forEach(item => {
            const cKey = (typeof window.trendContractorKey === 'function')
                ? window.trendContractorKey(item)
                : ((item.contractorName || 'Неизвестно') + ' [' + (item.project_display_name || item.projectName || 'Без объекта') + ']');
            groupedC[cKey] = groupedC[cKey] || [];
            groupedC[cKey].push(item);
        });
        const currContractorsCount = Object.keys(groupedC).length;

        const currIntMetrics = _getObjectIntegralMetricsCached(data);
        const mData = currIntMetrics || { redZonePerc: 0, IKO: "0.00", ikoStatus: _t('quality.analytics.kpi.low_data', 'Мало данных'), ikoColor: "text-muted" };

        const ratingData = [];
        for (let cName in groupedC) {
            if (groupedC[cName].length >= 3) {
                const m = _contractorMetricsCached(cName, groupedC[cName]);
                if (m) ratingData.push({ name: cName, val: m.finalC, count: m.count, b3: m.n_изделий_с_B3, isPrelim: m.count < 7, prevVal: null });
            }
        }
        ratingData.sort((a, b) => b.val - a.val);

        // Подрядчики с ИУрК < 70% — среди тех, у кого уже есть надёжность (N≥7)
        const withRel = ratingData.filter(r => r.count >= 7);
        const relN = withRel.length;
        const redContrCount = withRel.filter(r => r.val < 70).length;
        const redContrPerc = relN > 0 ? Math.round((redContrCount / relN) * 100) : null;
        const redContrColorCls = redContrCount >= 3 || (redContrPerc != null && redContrPerc >= 20)
            ? 'text-danger'
            : (redContrCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400');
        const redContrBorderCls = redContrCount > 0
            ? 'bg-danger-soft border-danger-soft/50'
            : 'bg-[var(--card-bg)] border-[var(--card-border)]';

        // P2-0024: на 10 000 проверок вкладка считалась одним куском ≈ 75 мс. Текущий период посчитан —
        // отдаём кадр браузеру, затем сравнение с прошлым периодом, подборка дефектов и разметка.
        // Пришла новая перерисовка за это время — эту не дописываем.
        const _opGen = _analyticsRenderGen;
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (_opGen !== _analyticsRenderGen || !container.isConnected) return false; // не дорисовано (ревью №4)

        const selPeriod = document.getElementById('global-filter-period')?.value || 'D30';
        let prevData = [];
        const now = new Date();
        let trendLabel = _t('quality.analytics.kpi.vs_prev', 'к пред. периоду');
        const prevBounds = typeof getAnalyticsPrevPeriodBounds === 'function'
            ? getAnalyticsPrevPeriodBounds(selPeriod, now)
            : null;
        if (prevBounds) {
            prevData = _allInspections.filter(i => {
                const d = new Date(i.date);
                return d >= prevBounds.startPrev && d < prevBounds.endPrev;
            });
            trendLabel = prevBounds.trendLabel;
        } else if (selPeriod === 'CUSTOM') {
            trendLabel = _t('quality.analytics.kpi.vs_prev', 'к пред. периоду');
        } else {
            const half = Math.floor(data.length / 2);
            // P2-0024: даты разбираются один раз (раньше — new Date в каждом сравнении сортировки); порядок тот же.
            const sortedData = data.map(i => [new Date(i.date).getTime(), i]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
            prevData = sortedData.slice(0, half);
            trendLabel = _t('quality.analytics.kpi.vs_first_half', 'к 1-й пол. базы');
        }

        // Динамика рейтинга подрядчика к предыдущему периоду (та же база, что у KPI).
        const currProjects = new Set(data.map(i => i.project_canonical_key || i.project_display_name || i.projectName).filter(Boolean));
        const prevGroupedC = {};
        prevData.forEach(item => {
            const p = item.project_canonical_key || item.project_display_name || item.projectName;
            if (currProjects.size && p && !currProjects.has(p)) return;
            const cKey = (typeof window.trendContractorKey === 'function')
                ? window.trendContractorKey(item)
                : ((item.contractorName || 'Неизвестно') + ' [' + (item.project_display_name || item.projectName || 'Без объекта') + ']');
            (prevGroupedC[cKey] = prevGroupedC[cKey] || []).push(item);
        });
        ratingData.forEach(r => {
            const prevItems = prevGroupedC[r.name];
            if (prevItems && prevItems.length >= 3) {
                const pm = _contractorMetricsCached(r.name, prevItems);
                if (pm) r.prevVal = pm.finalC;
            }
        });

        let prevAvgUrk = 0; let prevIko = "0.00"; let prevChecks = prevData.length; let prevContrsCount = 0;
        if (prevData.length > 0) {
            const prevKpi = (typeof window.avgContractorRatingsFromChecks === 'function')
                ? _avgContractorRatingsCached(prevData)
                : { avgUrk: 0 };
            prevAvgUrk = prevKpi.avgUrk;
            const pGrouped = {}; prevData.forEach(i => pGrouped[i.contractorName] = true);
            prevContrsCount = Object.keys(pGrouped).length;
            const pInt = _getObjectIntegralMetricsCached(prevData);
            if (pInt) prevIko = pInt.IKO;
        }

        const renderTrend = (curr, prev, label, inverse = false) => {
            if (prev === undefined || prev === null || prev === "") return `<span class="text-muted text-rbi-caption font-bold bg-surface px-1.5 rounded">${_t('quality.analytics.kpi.no_base', 'Нет базы')}</span>`;
            let diff = (parseFloat(curr) - parseFloat(prev));
            if (Math.abs(diff) < 0.01) return `<div class="text-right"><span class="text-muted text-rbi-caption font-bold">▬ 0</span><div class="text-rbi-caption text-muted mt-0.5 uppercase tracking-wider">${label}</div></div>`;
            const isGood = inverse ? diff < 0 : diff > 0;
            const color = isGood ? 'text-green-500' : 'text-danger';
            const sign = diff > 0 ? '▲' : '▼';
            return `<div class="text-right"><span class="${color} text-rbi-label font-black">${sign} ${Math.abs(diff).toFixed(Number.isInteger(diff) ? 0 : 2)}</span><div class="text-rbi-caption text-muted mt-0.5 uppercase tracking-wider">${label}</div></div>`;
        };

        // P2-0024: мини-график «по неделям» (6 пересчётов рейтинга) — нужен только графику, считается
        // в отложенном шаге отрисовки графиков, а не в основном кадре вкладки.
        const sparkLabels = []; const sparkData = [];
        const computeSpark = () => {
            const sparkBase = (window.AnalyticsActions && typeof window.AnalyticsActions.applyAnalyticsEntityFilters === 'function')
                ? window.AnalyticsActions.applyAnalyticsEntityFilters(
                    _allInspections.filter(i => i && i.inspection_type !== 'sk_acceptance')
                )
                : _allInspections.filter(i => i && i.inspection_type !== 'sk_acceptance');
            for (let i = 5; i >= 0; i--) {
                const dStart = new Date(); dStart.setDate(now.getDate() - (i * 7) - 7);
                const dEnd = new Date(); dEnd.setDate(now.getDate() - (i * 7));
                const weekChecks = sparkBase.filter(c => { const d = new Date(c.date); return d >= dStart && d < dEnd; });
                sparkLabels.push(`-${i}${_t('quality.analytics.period.week_letter', 'н')}`);
                sparkData.push(weekChecks.length > 0 && typeof window.avgContractorRatingsFromChecks === 'function'
                    ? window.avgContractorRatingsFromChecks(weekChecks).avgUrk
                    : null);
            }
        };

        let defaultChartContrs = [];
        let isTruncatedForChart = false;
        if (ratingData.length <= 10) {
            defaultChartContrs = ratingData.map(r => r.name);
        } else {
            defaultChartContrs = ratingData.slice(0, 10).map(r => r.name);
            isTruncatedForChart = true;
        }

        if (!window.selectedChartFilters.onepager) window.selectedChartFilters.onepager = [];
        const activeLineFilters = window.selectedChartFilters.onepager.length > 0 ? window.selectedChartFilters.onepager : defaultChartContrs;

        // Сбор всех фото (B3, B2, OK)
        // P2-0024: только когда результат виден — блок «ТОП-5» включён в настройках или автотекст
        // «Аналитики качества» (нет сохранённого вывода инженера) берёт из него проблемы;
        // пункт чек-листа — из таблицы id → пункт на шаблон, а не getFlatList(...).find на каждый ответ.
        let b3Map = {}; let b2Map = {}; let okMap = {};
        const _flatByTemplate = new Map();
        const _findChecklistItem = (templateKey, id) => {
            let byId = _flatByTemplate.get(templateKey);
            if (!byId) {
                const tType = templateKey.split('_')[0];
                const tKey = templateKey.replace(tType + '_', '');
                const cl = tType === 'sys' && _getSystemTemplates()[tKey] ? _getSystemTemplates()[tKey].groups : (_templates().getUserTemplates()[tKey] ? _templates().getUserTemplates()[tKey].groups : []);
                byId = new Map();
                getFlatList(cl).forEach(x => { const k = String(x.id); if (!byId.has(k)) byId.set(k, x); });
                _flatByTemplate.set(templateKey, byId);
            }
            return byId.get(String(id));
        };
        const _needTopDefects = !!_getSetting('anaOpTopDefects') || !_reports().getExpertConclusion('global_onepager_pdca');
        const _defectFallbackName = _t('quality.analytics.fallback.defect', 'Дефект'); // P2-0024: один раз, а не на каждый ответ
        if (_needTopDefects) data.forEach(i => {
            if (i.state && i.details && i.templateKey) {
                Object.keys(i.state).forEach(id => {
                    const s = i.state[id];
                    // P2-0024: в подборку попадают только замечания и «ok» с фото — остальное сразу пропускаем
                    if (s !== 'fail' && s !== 'fail_escalated' && !(s === 'ok' && i.photos && i.photos[id])) return;
                    let defName = _defectFallbackName;
                    const foundItem = _findChecklistItem(i.templateKey, id);
                    if (foundItem) defName = foundItem.n;

                    const photo = (i.photos && i.photos[id])
                        ? (window.normalizeItemPhotos ? window.normalizeItemPhotos(i.photos[id])[0] : [].concat(i.photos[id])[0])
                        : null;

                    if (s === 'fail' || s === 'fail_escalated') {
                        let isB3 = (s === 'fail_escalated') || (foundItem && foundItem.w === 3);
                        if (isB3) {
                            if (!b3Map[defName]) b3Map[defName] = { count: 0, photo: null, contr: (i.contractorName || 'Неизвестно') + ' [' + (i.projectName || 'Без объекта') + ']', name: defName };
                            b3Map[defName].count++;
                            if (photo) b3Map[defName].photo = photo;
                        } else {
                            const isB1 = foundItem && foundItem.w === 1;
                            if (isB1) return; // B1 не попадает в топ дефектов
                            if (!b2Map[defName]) b2Map[defName] = { count: 0, photo: null, contr: (i.contractorName || 'Неизвестно') + ' [' + (i.projectName || 'Без объекта') + ']', name: defName };
                            b2Map[defName].count++;
                            if (photo) b2Map[defName].photo = photo;
                        }
                    } else if (s === 'ok' && photo) {
                        if (!okMap[defName]) okMap[defName] = { count: 0, photo: null, contr: (i.contractorName || 'Неизвестно') + ' [' + (i.projectName || 'Без объекта') + ']', name: defName };
                        okMap[defName].count++;
                        if (photo) okMap[defName].photo = photo;
                    }
                });
            }
        });

        const topB3 = Object.values(b3Map).sort((a, b) => b.count - a.count).slice(0, 5);
        const topB2 = Object.values(b2Map).sort((a, b) => b.count - a.count).slice(0, 5);
        const topOK = Object.values(okMap).sort((a, b) => b.count - a.count).slice(0, 5);

        const renderUIPhotoCards = (arr, isCrit, isOk = false) => {
            if (arr.length === 0) return `<div class="text-center py-6 text-[var(--text-muted)] text-rbi-label bg-[var(--card-bg)] rounded-lg border border-dashed border-[var(--card-border)]">${isOk ? 'Эталонов нет' : 'Дефектов не зафиксировано'}</div>`;
            return `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                ${arr.map(d => {
                const safePhoto = (typeof window.rbiEscapeAttr === 'function')
                    ? window.rbiEscapeAttr(d.photo)
                    : String(d.photo || '').replace(/"/g, '&quot;');
                const imgHtml = d.photo ? `<img ${(typeof window.rbiBuildPhotoImgAttrs === 'function') ? window.rbiBuildPhotoImgAttrs(d.photo, { preferThumb: true }) : ('src="' + window.getPhotoSrc(d.photo) + '" data-local-src="' + safePhoto + '"')} class="w-full h-24 object-cover border-b border-[var(--card-border)] cursor-pointer active:scale-95" onclick="openPhotoViewer('${safePhoto}')" loading="lazy">` : `<div class="w-full h-24 bg-[var(--hover-bg)] flex items-center justify-center text-[var(--card-border)] text-rbi-caption border-b border-[var(--card-border)] text-center px-1">НЕТ ФОТО</div>`;
                let badgeColor = isCrit ? 'text-danger bg-danger-soft border-danger-soft' : 'text-orange-700 bg-orange-100 border-orange-200';
                let badgeText = isCrit ? 'B3' : 'B2';
                if (isOk) { badgeColor = 'text-green-700 bg-green-100 border-green-200'; badgeText = 'OK'; }
                return `
                    <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden flex flex-col shadow-sm">
                        ${imgHtml}
                        <div class="p-2 flex-1 flex flex-col justify-between">
                            <div class="text-rbi-caption font-bold text-ink leading-tight line-clamp-2 mb-1" title="${d.name}">${d.name}</div>
                            <div>
                                <div class="text-rbi-caption text-[var(--text-muted)] mb-1 truncate w-full" title="${d.contr}">👤 ${d.contr}</div>
                                <div class="flex justify-between items-center"><span class="${badgeColor} text-rbi-caption font-black px-1.5 rounded border">${badgeText}</span><span class="text-rbi-caption font-black text-[var(--text-muted)]">${d.count} ${_t('quality.analytics.chart.pcs', 'шт')}</span></div>
                            </div>
                        </div>
                    </div>`;
            }).join('')}
            </div>`;
        };

        let periodText = document.getElementById('btn-ana-period-label')?.innerText.trim() || _t('quality.analytics.period.d30', 'За 30 дней');
        if (document.getElementById('global-filter-period')?.value === 'CUSTOM') {
            const dFrom = document.getElementById('filter-date-from')?.value;
            const dTo = document.getElementById('filter-date-to')?.value;
            if (dFrom || dTo) {
                const fmt = (d) => d ? new Date(d).toLocaleDateString('ru-RU') : '...';
                periodText = `с ${fmt(dFrom)} по ${fmt(dTo)}`;
            }
        }
        const isGlobalDanger = parseFloat(mData.IKO) >= 0.60 || sumB3 > 0;

        const pdcaKey = 'global_onepager_pdca';
        const OP_PDCA_MAX_CHARS = 500;
        const clipPdca = (text) => {
            const t = String(text || '').trim();
            if (t.length <= OP_PDCA_MAX_CHARS) return t;
            return t.slice(0, OP_PDCA_MAX_CHARS - 1).trimEnd() + '…';
        };
        let rawPdcaText = _reports().getExpertConclusion(pdcaKey) || "";
        if (!_reports().getExpertConclusion(pdcaKey)) {
            rawPdcaText = `[АНАЛИТИКА]\nИКО: ${mData.IKO}. Подрядчики с ИУрК<70%: ${relN > 0 ? `${redContrCount} из ${relN} (${redContrPerc}%)` : 'СБОР'}. Проверок: ${data.length}.\n\n`;

            const topDefectsForPdca = [...topB3, ...topB2].sort((a, b) => b.count - a.count).slice(0, 2);
            if (topDefectsForPdca.length > 0) {
                rawPdcaText += `[ПРОБЛЕМЫ]\n` + topDefectsForPdca.map((d, idx) => `${idx + 1}. ${d.name} (${d.count}, ${d.contr})`).join('\n') + `\n\n`;
            }

            const worstContractors = ratingData.filter(r => r.val < 85).slice(0, 2);
            if (worstContractors.length > 0) {
                rawPdcaText += `[ПОДРЯДЧИКИ]\n` + worstContractors.map((r, idx) => `${idx + 1}. ${r.name} — ${r.val}%`).join('\n') + `\n\n`;
            }

            rawPdcaText += `[ПЛАН]\n`;
            if (isGlobalDanger) {
                rawPdcaText += `1. Ограничить КС-2 для красной зоны.\n2. Аудит квалификации персонала.\n`;
                if (worstContractors.length > 0) rawPdcaText += `3. Разбор: ${worstContractors.map(r => r.name).join(', ')}.\n`;
            } else {
                rawPdcaText += `Процесс в управляемой зоне. Фокус — профилактика системных дефектов.\n`;
                if (topDefectsForPdca.length > 0) rawPdcaText += `Приоритет: «${topDefectsForPdca[0].name}».\n`;
            }
        }
        rawPdcaText = clipPdca(rawPdcaText);
        const pdcaWasClipped = String(_reports().getExpertConclusion(pdcaKey) || '').trim().length > OP_PDCA_MAX_CHARS;
        let uiPdcaText = rawPdcaText.replace(/\n/g, '<br>').replace(/^\[(.*?)\]/gm, '<b class="text-ink dark:text-white text-rbi-label block mt-2 mb-1">$1</b>');

        // --- ТЕПЛОВАЯ КАРТА (МАТРИЦА РИСКОВ) ---
        // P2-0024: блок свёрнут — таблица (этапы × подрядчики) строится при раскрытии.
        const buildHeatmapHtml = () => {
            const heatmapStages = {};
            const contrCheckCounts = {}; // Считаем проверки для вывода в топы матрицы

            data.forEach(check => {
                if (!check.metrics) return;

                // Бронебойная защита от отсутствия названия
                const stage = check.templateTitle || check.templateKey || _t('quality.analytics.fallback.unknown_stage', 'Неизвестный этап');
                const contr = check.contractorName || 'Неизвестно';

                contrCheckCounts[contr] = (contrCheckCounts[contr] || 0) + 1;

                if (!heatmapStages[stage]) heatmapStages[stage] = {};
                if (!heatmapStages[stage][contr]) heatmapStages[stage][contr] = { checks: 0, defects: 0 };

                heatmapStages[stage][contr].checks++;
                heatmapStages[stage][contr].defects += ((Number(check.metrics.n_B2_fail) || 0) + (Number(check.metrics.n_B3_fail) || 0));
            });

            let heatmapHtml = '';
            const stageNames = Object.keys(heatmapStages).sort();

            // Все подрядчики текущей выборки; горизонтальный скролл, если не влезают.
            const topMatrixContrs = Object.keys(contrCheckCounts)
                .sort((a, b) => contrCheckCounts[b] - contrCheckCounts[a]);

            if (stageNames.length > 0 && topMatrixContrs.length > 0) {
                heatmapHtml = `<div class="overflow-x-auto custom-scrollbar pb-2 -mx-1 px-1"><table class="text-left border-collapse text-rbi-caption w-full" style="min-width: ${Math.max(400, 140 + 72 + topMatrixContrs.length * 96)}px;">
                <thead class="bg-[var(--hover-bg)] text-[var(--text-muted)] uppercase"><tr>
                    <th class="p-2 border border-[var(--card-border)] font-black sticky left-0 z-10 bg-[var(--hover-bg)] min-w-[120px]">Вид работ / Подрядчик</th>
                    <th class="p-2 border border-[var(--card-border)] text-center font-black sticky z-10 bg-[var(--hover-bg)] min-w-[72px] max-w-[88px] whitespace-normal leading-tight" style="left:120px" title="${_t('quality.analytics.heatmap.defects_sum_title', 'Сумма дефектов B2+B3 по этапу')}">${_t('quality.analytics.heatmap.total_defects', 'Всего дефектов')}</th>`;

                topMatrixContrs.forEach(c => heatmapHtml += `<th class="p-2 border border-[var(--card-border)] text-center font-bold min-w-[96px] max-w-[140px] whitespace-normal leading-tight" title="${c}">${c}</th>`);
                heatmapHtml += `</tr></thead><tbody>`;

                stageNames.forEach(stage => {
                    const stageTotal = topMatrixContrs.reduce((sum, contr) => {
                        const cell = heatmapStages[stage][contr];
                        return sum + (cell ? (Number(cell.defects) || 0) : 0);
                    }, 0);
                    heatmapHtml += `<tr><td class="p-2 border border-[var(--card-border)] font-bold text-ink sticky left-0 z-10 bg-[var(--card-bg)] min-w-[120px] max-w-[160px] whitespace-normal leading-tight" title="${stage}">${stage}</td>`;
                    heatmapHtml += `<td class="p-2 border border-[var(--card-border)] text-center font-black sticky z-10 bg-[var(--card-bg)] text-ink tabular-nums" style="left:120px">${stageTotal}</td>`;
                    topMatrixContrs.forEach(contr => {
                        const cell = heatmapStages[stage][contr];
                        if (!cell) {
                            heatmapHtml += `<td class="p-2 border border-[var(--card-border)] text-center bg-[var(--hover-bg)] text-muted">-</td>`;
                        } else {
                            const defectRate = cell.defects / cell.checks;
                            let bgColor = 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:border-green-800';
                            if (defectRate > 1.5) bgColor = 'bg-danger-soft text-danger border-danger font-black/40';
                            else if (defectRate > 0.5) bgColor = 'bg-yellow-50 text-yellow-700 border-yellow-200 font-bold dark:bg-yellow-900/20 dark:border-yellow-800';
                            heatmapHtml += `<td class="p-2 border border-[var(--card-border)] text-center ${bgColor}">${cell.defects} ${_t('quality.analytics.heatmap.def_short', 'деф.')}</td>`;
                        }
                    });
                    heatmapHtml += `</tr>`;
                });
                heatmapHtml += `</tbody></table></div>`;
            } else {
                heatmapHtml = `<div class="text-center text-muted py-6 text-rbi-caption font-bold uppercase bg-[var(--hover-bg)] rounded-lg border border-dashed border-[var(--card-border)]">${_t('quality.analytics.heatmap.insufficient', 'Недостаточно дефектов для карты')}</div>`;
            }
            return heatmapHtml;
        };

        // --- ИНДЕКС ЗДОРОВЬЯ (ПУЛЬС) ---
        const healthIndex = Math.max(0, Math.min(100, Math.round(100 - (parseFloat(mData.IKO) * 50) - ((redContrPerc || 0) * 0.5) - (sumB3 * 2))));
        let healthColor = healthIndex > 80 ? 'text-green-500' : (healthIndex > 50 ? 'text-orange-500' : 'text-danger');

        // ==========================================
        // СБОРКА ИТОГОВОГО HTML (ОДИН СПИСОК АККОРДЕОНОВ - iOS STYLE)
        // ==========================================
        container.innerHTML = `
            <div class="bg-[var(--card-bg)] p-3 rounded-xl border border-[var(--card-border)] shadow-sm mb-4 mt-2 flex justify-between items-center">
                <div>
                    <h2 class="text-rbi-body font-black uppercase tracking-tight text-ink dark:text-white flex items-center gap-1.5">
                        <svg class="w-4 h-4 text-brand shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                        ${_t('quality.analytics.onepager.object_status', 'Сводный статус объекта')}
                    </h2>
                    <div class="text-rbi-caption font-bold text-[var(--text-muted)] mt-1">${_t('quality.analytics.onepager.coverage', 'Охват: {n} проверок', { n: data.length })} &bull; ${_t('quality.analytics.onepager.period_label', 'Период:')} <span class="text-brand">${periodText}</span></div>
                </div>
            </div>
            
            <div class="space-y-3">
                
                <!-- АККОРДЕОН 1: ГЛАВНЫЕ МЕТРИКИ И РЕЙТИНГ -->
                <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden" open>
                    <summary class="p-3.5 font-bold text-rbi-label text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-2xl select-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"></path></svg>
                            ${_t('quality.analytics.onepager.stats_trends', 'Статистика и Тренды')}
                        </span>
                        <span class="transition-transform group-open:rotate-180">▼</span>
                    </summary>
                    <div class="p-3 border-t border-[var(--card-border)] bg-surface/30 flex flex-col gap-3 rounded-b-2xl">
                        
                        ${(currAvgDoc !== null && Math.abs(currAvgUrk - currAvgDoc) > 30) ? `<div class="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-2.5 shadow-sm text-center text-rbi-caption font-bold text-orange-700 dark:text-orange-400 flex items-center justify-center gap-1.5">⚠️ Разрыв между физикой (${currAvgUrk}%) и документацией (${currAvgDoc}%) по объекту — ${Math.abs(currAvgUrk - currAvgDoc)} п.п.</div>` : ''}
                        <div class="grid grid-cols-2 lg:grid-cols-3 gap-2">
                            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-2.5 shadow-sm flex flex-col justify-between">
                                <div class="text-rbi-caption font-bold text-muted uppercase tracking-widest mb-1">${_t('quality.analytics.onepager.urk_phys_doc', 'Ур. качества (физика/докум.)')}</div>
                                <div class="flex justify-between items-end">
                                    <span class="flex items-baseline gap-1.5">
                                        <span class="text-2xl font-black leading-none" style="color:${_urkGradientColor(currAvgUrk)}">${currAvgUrk}%</span>
                                        <span class="text-rbi-body font-black leading-none ${currAvgDoc === null ? 'text-muted' : ''}" style="${currAvgDoc === null ? '' : 'color:' + _urkGradientColor(currAvgDoc)}">${currAvgDoc === null ? '—' : 'Док ' + currAvgDoc + '%'}</span>
                                    </span>
                                    ${renderTrend(currAvgUrk, prevAvgUrk, trendLabel)}
                                </div>
                            </div>
                            <div class="bg-[var(--card-bg)] border ${parseFloat(mData.IKO) >= 0.6 ? 'border-danger bg-danger-soft/50' : 'border-[var(--card-border)]'} rounded-xl p-2.5 shadow-sm flex flex-col justify-between">
                                <div class="text-rbi-caption font-bold text-muted uppercase tracking-widest mb-1">${_t('quality.analytics.onepager.iko', 'Индекс Риска (ИКО)')}</div>
                                <div class="flex justify-between items-end">
                                    <span class="text-2xl font-black ${mData.ikoColor} leading-none">${mData.IKO}</span>
                                    ${renderTrend(mData.IKO, prevIko, trendLabel, true)}
                                </div>
                            </div>
                            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-2.5 shadow-sm flex flex-col justify-between">
                                <div class="text-rbi-caption font-bold text-muted uppercase tracking-widest mb-1">${_t('quality.analytics.onepager.checks_volume', 'Объем проверок')}</div>
                                <div class="flex justify-between items-end">
                                    <span class="text-2xl font-black text-ink dark:text-white leading-none">${data.length}</span>
                                    ${renderTrend(data.length, prevChecks, trendLabel)}
                                </div>
                            </div>
                            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-2.5 shadow-sm flex flex-col justify-between">
                                <div class="text-rbi-caption font-bold text-muted uppercase tracking-widest mb-1">${_t('quality.analytics.onepager.active_contr', 'Акт. Подрядчиков')}</div>
                                <div class="flex justify-between items-end">
                                    <span class="text-2xl font-black text-ink dark:text-white leading-none">${currContractorsCount}</span>
                                    ${renderTrend(currContractorsCount, prevContrsCount, trendLabel)}
                                </div>
                            </div>
                            <div class="${redContrBorderCls} border rounded-xl p-2.5 shadow-sm flex flex-col justify-between">
                                <div class="text-rbi-caption font-bold ${redContrCount > 0 ? 'text-danger' : 'text-muted'} uppercase tracking-widest mb-1">${_t('quality.analytics.onepager.red_contr', 'Подрядчики с ИУрК < 70%')}</div>
                                <div class="flex justify-between items-end gap-2">
                                    <span class="flex items-baseline gap-1.5 min-w-0">
                                        <span class="text-2xl font-black ${redContrColorCls} leading-none">${relN > 0 ? redContrCount : '—'}</span>
                                        ${relN > 0 ? `<span class="text-rbi-body font-black ${redContrColorCls} leading-none">${redContrPerc}%</span>` : `<span class="text-rbi-label font-bold text-muted">СБОР</span>`}
                                    </span>
                                    <span class="text-rbi-caption font-bold text-muted text-right leading-tight shrink-0">${relN > 0 ? _t('quality.analytics.onepager.red_contr_detail', '{a} из {b}<br>с надёжностью', { a: redContrCount, b: relN }) : _t('quality.analytics.onepager.need_n7', 'нужен N≥7')}</span>
                                </div>
                            </div>
                            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-2.5 shadow-sm flex flex-col justify-between relative overflow-hidden">
                                <div class="text-rbi-caption font-bold text-muted uppercase tracking-widest mb-1 z-10">${_t('quality.analytics.onepager.trend_6w', 'Тренд УрК (6 нед)')}</div>
                                <div class="absolute bottom-0 left-0 right-0 h-[40px] opacity-70"><canvas id="op-sparkline-chart"></canvas></div>
                            </div>
                        </div>

                        <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 shadow-sm flex flex-col">
                            <div class="flex justify-between items-center mb-2 gap-2">
                                <div class="min-w-0">
                                    <div class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase">${_t('quality.analytics.onepager.dynamics_urk', 'Динамика уровня качества')}</div>
                                    <div class="text-rbi-caption font-semibold text-muted mt-0.5">${(window.AnalyticsActions && typeof window.AnalyticsActions.onePagerTrendWindowHint === 'function') ? window.AnalyticsActions.onePagerTrendWindowHint(window.trendGroupings.onepager || 'WEEK') : _t('quality.analytics.trend.window_12w', '12 нед. · вне фильтра периода')}</div>
                                </div>
                                <div class="flex gap-1 shrink-0">
                                    <button onclick="openChartFilterModal('onepager')" class="text-rbi-caption font-bold border border-brand-soft text-brand bg-brand-soft/30 rounded px-2 py-1 active:scale-95 shadow-sm flex items-center gap-1">
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg> ${_t('quality.analytics.chart.lines', 'Линии')}
                                    </button>
                                    <select onchange="updateTrendCharts('onepager', this.value)" class="text-rbi-caption font-semibold border border-brand-soft text-brand bg-surface rounded px-1 py-1 outline-none cursor-pointer shadow-sm">
                                        <option value="WEEK" ${(window.trendGroupings.onepager || 'WEEK') === 'WEEK' ? 'selected' : ''}>${_t('quality.analytics.period.weeks', 'Недели')}</option>
                                        <option value="MONTH" ${window.trendGroupings.onepager === 'MONTH' ? 'selected' : ''}>${_t('quality.analytics.period.months', 'Месяцы')}</option>
                                    </select>
                                </div>
                            </div>
                            <div style="height: 180px; position: relative;"><canvas id="op-line-chart"></canvas></div>
                        </div>

                        <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 shadow-sm flex flex-col">
                            <div class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-3 flex items-center gap-1.5">
                                <svg class="w-4 h-4 text-brand shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path></svg>
                                ${_t('quality.analytics.onepager.rating_reliability', 'Рейтинг подрядчиков по надежности')}
                            </div>
                            <div class="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                ${ratingData.map(r => {
                                    let deltaHtml = `<span class="text-rbi-caption text-muted font-bold">—</span>`;
                                    if (r.prevVal !== null && r.prevVal !== undefined) {
                                        const diff = r.val - r.prevVal;
                                        if (Math.abs(diff) < 0.5) deltaHtml = `<span class="text-rbi-caption text-muted font-bold">▬0</span>`;
                                        else {
                                            const good = diff > 0;
                                            deltaHtml = `<span class="text-rbi-caption font-black ${good ? 'text-green-500' : 'text-danger'}">${diff > 0 ? '▲' : '▼'}${Math.abs(Math.round(diff))}</span>`;
                                        }
                                    }
                                    return `
                                    <div class="flex items-center gap-1.5 py-0.5">
                                        <div class="w-[46%] min-w-0 text-rbi-caption font-bold text-ink leading-tight whitespace-normal break-words" title="${r.name}">${r.name}</div>
                                        <div class="flex-1 min-w-0 max-w-[28%] h-1.5 bg-[var(--hover-bg)] rounded-full overflow-hidden border border-[var(--card-border)] relative">
                                            <div class="h-full ${r.val < 70 ? 'bg-danger' : (r.val < 85 ? 'bg-orange-500' : 'bg-green-500')}" style="width:${r.val}%"></div>
                                        </div>
                                        <div class="w-[68px] shrink-0 flex items-center justify-end gap-1 leading-none" title="${trendLabel}">
                                            ${r.isPrelim ? `<span class="text-rbi-caption text-muted font-bold border border-slate-300 rounded px-0.5" title="${_t('quality.analytics.kpi.prelim_title', 'Предварительный рейтинг')}">${_t('quality.analytics.kpi.collecting', 'СБОР')}</span>` : ''}
                                            <span class="text-rbi-label font-black ${r.val < 70 ? 'text-danger' : (r.val < 85 ? 'text-orange-500' : 'text-green-500')}">${r.val}%</span>
                                            ${deltaHtml}
                                        </div>
                                    </div>`;
                                }).join('') || `<div class="text-rbi-caption text-[var(--text-muted)] text-center py-2">${_t('quality.analytics.empty.insufficient', 'Недостаточно данных')}</div>`}
                            </div>
                        </div>
                    </div>
                </details>

                <!-- АККОРДЕОН 2: ПУЛЬС ОБЪЕКТА -->
                <details class="bg-[var(--card-bg)] border border-brand-soft rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden">
                    <summary class="p-3.5 font-bold text-rbi-label text-brand uppercase tracking-widest cursor-pointer flex justify-between items-center bg-brand-soft/20 rounded-2xl hover:bg-brand-soft transition-colors select-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg> 
                            Пульс объекта (AI) 
                            <button onclick="event.preventDefault(); showToast(_t('quality.analytics.toast.health_help', 'Индекс Здоровья рассчитывается на основе Индекса Риска (ИКО), доли подрядчиков с ИУрК ниже 70% и аварий B3. ИИ анализирует эти данные и дает краткое заключение.'))" class="text-brand hover:text-brand active:scale-95 transition-colors ml-1" title="${_t('quality.analytics.help', 'Справка')}">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            </button>
                        </span>
                        <span class="transition-transform group-open:rotate-180">▼</span>
                    </summary>
                    <div class="p-4 border-t border-brand-soft bg-surface rounded-b-2xl">
                        <div class="flex justify-between items-center mb-4">
                            <div class="text-rbi-caption font-bold uppercase text-muted">${_t('quality.analytics.onepager.health_index', 'Индекс Здоровья')}</div>
                            <div class="text-4xl font-black ${healthColor}">${healthIndex}<span class="text-lg text-muted">/100</span></div>
                        </div>
                        <div class="text-rbi-label leading-relaxed text-ink bg-surface p-3 rounded-lg border border-surface font-medium" id="pulse-ai-text">
                            ${_reports().getExpertConclusion('pulse_ai') || _t('quality.analytics.onepager.pulse_placeholder', 'Нажмите кнопку ниже для генерации пульса.')}
                        </div>
                        <button onclick="window.RBI.services.ai.generatePulseAi()" class="mt-3 w-full bg-brand-soft text-brand border border-brand-soft/30 py-3 rounded-xl font-bold text-rbi-caption uppercase tracking-widest active:scale-95 shadow-sm flex items-center justify-center gap-1.5 transition-transform">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Обновить Пульс
                        </button>
                    </div>
                </details>

                <!-- АККОРДЕОН 3: ТЕПЛОВАЯ КАРТА -->
                <details id="op-heatmap-details" class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden">
                    <summary class="p-3.5 font-bold text-rbi-label text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-2xl select-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>
                            ${_t('quality.analytics.onepager.heatmap', 'Тепловая карта этапов')}
                        </span>
                        <span class="transition-transform group-open:rotate-180">▼</span>
                    </summary>
                    <div class="p-4 border-t border-[var(--card-border)] bg-surface rounded-b-2xl overflow-visible">
                        <div id="op-heatmap-host"></div>
                        <button onclick="window.RBI.services.ai.generateHeatmapAi()" class="mt-3 w-full bg-slate-50 text-muted py-3 rounded-xl font-bold text-rbi-caption uppercase active:scale-95 shadow-sm flex items-center justify-center gap-1.5 border border-surface transition-transform">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Анализ Рисков (ИИ)
                        </button>
                        <div id="heatmap-ai-text" class="mt-3 text-rbi-body leading-relaxed text-ink bg-surface/70 p-4 sm:p-5 rounded-xl border border-surface font-medium shadow-sm custom-scrollbar" aria-live="polite"></div>
                    </div>
                </details>

                <!-- АККОРДЕОН 4: ТОП ФОТО -->
                ${_getSetting('anaOpTopDefects') ? `
                <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden">
                    <summary class="p-3.5 font-bold text-rbi-label text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-2xl select-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><circle cx="12" cy="13" r="3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></circle></svg>
                            ${_t('quality.analytics.onepager.top5', 'ТОП-5 Дефектов и Эталонов')}
                        </span>
                        <span class="transition-transform group-open:rotate-180">▼</span>
                    </summary>
                    <div class="p-3 border-t border-[var(--card-border)] bg-surface/30 flex flex-col gap-3 rounded-b-2xl">
                        <div class="bg-danger-soft border border-danger-soft/50 rounded-xl p-3 shadow-sm flex flex-col">
                            <h3 class="margin-0 mb-3 font-bold text-rbi-caption text-danger uppercase border-b border-danger-soft pb-2 flex items-center gap-1.5"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> Критические дефекты (B3)</h3>
                            ${renderUIPhotoCards(topB3, true)}
                        </div>
                        <div class="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/50 rounded-xl p-3 shadow-sm flex flex-col">
                            <h3 class="margin-0 mb-3 font-bold text-rbi-caption text-orange-600 dark:text-orange-400 uppercase border-b border-orange-200 dark:border-orange-800 pb-2 flex items-center gap-1.5"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Повторяющиеся нарушения (B2)</h3>
                            ${renderUIPhotoCards(topB2, false)}
                        </div>
                        <div class="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/50 rounded-xl p-3 shadow-sm flex flex-col">
                            <h3 class="margin-0 mb-3 font-bold text-rbi-caption text-green-600 dark:text-green-400 uppercase border-b border-green-200 dark:border-green-800 pb-2 flex items-center gap-1.5"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg> ${_t('quality.analytics.gallery.ok_title', 'Эталонные работы (OK)')}</h3>
                            ${renderUIPhotoCards(topOK, false, true)}
                        </div>
                    </div>
                </details>
                ` : ''}

                <!-- АККОРДЕОН 5: АНАЛИТИКА КАЧЕСТВА -->
                <details class="${isGlobalDanger ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800' : 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'} border rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden" open>
                    <summary class="p-3.5 font-bold text-rbi-caption sm:text-rbi-label ${isGlobalDanger ? 'text-orange-800 dark:text-orange-500' : 'text-green-800 dark:text-green-500'} uppercase tracking-wide cursor-pointer flex justify-between items-center rounded-2xl transition-colors select-none gap-2">
                        <span class="flex items-center gap-2 min-w-0 leading-snug">
                            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"></path></svg>
                            <span>${_t('quality.analytics.onepager.quality_analytics', 'Аналитика качества')} <span class="font-semibold normal-case tracking-normal opacity-80">${_t('quality.analytics.onepager.quality_analytics_hint', '(вывод и рекомендация инженера)')}</span></span>
                        </span>
                        <span class="transition-transform group-open:rotate-180 shrink-0">▼</span>
                    </summary>
                    <div class="p-4 border-t ${isGlobalDanger ? 'border-orange-200 dark:border-orange-800' : 'border-green-200 dark:border-green-800'} rounded-b-2xl">
                        <div class="flex justify-between items-center mb-3 gap-2">
                            <div class="text-rbi-caption font-bold uppercase opacity-70">${_t('quality.analytics.onepager.pdca_limit', 'До {n} символов (печать A3)', { n: OP_PDCA_MAX_CHARS })}</div>
                            <div class="flex gap-2 shrink-0">
                                <button onclick="window.RBI.services.ai.generateOnePagerForecastAi('${pdcaKey}')" class="text-rbi-caption font-bold bg-white/70 dark:bg-black/30 border border-black/10 dark:border-white/10 px-2.5 py-1.5 rounded shadow-sm active:scale-95 flex items-center gap-1.5"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> AI-Анализ</button>
                                <button onclick="editExpertText('${pdcaKey}', 'hidden_pdca_text')" class="text-rbi-caption font-bold bg-white/70 dark:bg-black/30 border border-black/10 dark:border-white/10 px-2.5 py-1.5 rounded shadow-sm active:scale-95 flex items-center gap-1.5"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg> Изменить</button>
                            </div>
                        </div>
                        ${pdcaWasClipped ? `<div class="text-rbi-caption font-bold text-amber-700 dark:text-amber-400 mb-2 uppercase">${_t('quality.analytics.toast.expert_trimmed', 'Текст обрезан до 500 символов для печати')}</div>` : ''}
                        <textarea id="hidden_pdca_text" class="hidden" maxlength="${OP_PDCA_MAX_CHARS}">${rawPdcaText.replace(/</g, '&lt;')}</textarea>
                        <div class="text-rbi-body leading-relaxed text-ink whitespace-pre-wrap font-medium max-h-[220px] overflow-y-auto custom-scrollbar">${uiPdcaText}</div>
                    </div>
                </details>

            </div>
        `;

        window.rbiDrawOnePagerHeatmap = _drawWhenOpen(document.getElementById('op-heatmap-details'), () => {
            const host = document.getElementById('op-heatmap-host');
            if (host) host.outerHTML = buildHeatmapHtml();
        });

        setTimeout(() => {
            const ctxSpark = document.getElementById('op-sparkline-chart');
            if (ctxSpark) {
                computeSpark();
                if (_chartInstances()['op-sparkline-chart']) _chartInstances()['op-sparkline-chart'].destroy();
                _chartInstances()['op-sparkline-chart'] = new Chart(ctxSpark.getContext('2d'), {
                    type: 'line',
                    data: { labels: sparkLabels, datasets: [{ data: sparkData, borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.2)', borderWidth: 2, pointRadius: 0, fill: true, tension: 0.4, spanGaps: true }] },
                    options: { animation: false, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false, min: 0, max: 100 } }, layout: { padding: 0 } }
                });
            }

            const ctxLine = document.getElementById('op-line-chart');
            if (ctxLine) {
                const opGrouping = (window.trendGroupings && window.trendGroupings.onepager) || 'WEEK';
                let trendSource = (window.AnalyticsActions && typeof window.AnalyticsActions.getOnePagerTrendSourceData === 'function')
                    ? window.AnalyticsActions.getOnePagerTrendSourceData(opGrouping)
                    : data;
                // Lookback-источник пуст (режим/кэш), а KPI-срез есть — не оставляем пустой canvas.
                if ((!trendSource || !trendSource.length) && Array.isArray(data) && data.length) {
                    trendSource = data;
                }
                const trendData = window.buildTrendChartData(trendSource, 'contractorName', activeLineFilters, opGrouping);
                trendData.datasets.forEach(ds => { ds.borderWidth = 1.5; ds.pointRadius = 2; });

                if (_chartInstances()['op-line-chart']) _chartInstances()['op-line-chart'].destroy();
                _chartInstances()['op-line-chart'] = new Chart(ctxLine.getContext('2d'), {
                    type: 'line',
                    data: trendData,
                    options: {
                        animation: false,
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { min: 0, max: 100, ticks: { font: { size: 9 } } },
                            x: { ticks: { font: { size: 9 } } }
                        },
                        plugins: {
                            legend: { position: 'right', labels: { boxWidth: 8, font: { size: 8 } } },
                            title: {
                                display: isTruncatedForChart,
                                text: _t('quality.analytics.chart.top10_note', 'Отображены до 10 подрядчиков (по рейтингу)'),
                                color: '#94a3b8',
                                font: { size: 10, weight: 'bold' },
                                padding: { bottom: 5 }
                            }
                        }
                    }
                });
            }
        }, 100);
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: глобальная сводка (Company
    // Dashboard с трендами и ПК СК).
    // =========================================================================
    renderGlobalOnePager(data, container) {
        var _allInspections = _inspections();
        if (data.length === 0) {
            container.innerHTML = `<div class="text-center text-muted text-sm py-10 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] shadow-sm">${_t('quality.analytics.empty.company', 'Нет данных для анализа компании')}</div>`;
            return;
        }

        let periodText = document.getElementById('btn-ana-period-label')?.innerText.trim() || _t('quality.analytics.period.d30', 'За 30 дней');

        // --- 1. РАСЧЕТ ПРЕДЫДУЩЕГО ПЕРИОДА ДЛЯ ТРЕНДОВ ---
        const selPeriod = document.getElementById('global-filter-period')?.value || 'D30';
        let prevData = [];
        const now = new Date();
        const prevBoundsG = typeof getAnalyticsPrevPeriodBounds === 'function'
            ? getAnalyticsPrevPeriodBounds(selPeriod, now)
            : null;
        if (prevBoundsG) {
            prevData = _allInspections.filter(i => {
                const d = new Date(i.date);
                return d >= prevBoundsG.startPrev && d < prevBoundsG.endPrev;
            });
        } else {
            const half = Math.floor(data.length / 2);
            const sortedData = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
            prevData = sortedData.slice(0, half);
        }

        // Вспомогательная функция для отрисовки мини-тренда
        const formatTrendInline = (curr, prev, inverse = false) => {
            if (!prev || isNaN(prev)) return '';
            let diff = parseFloat(curr) - parseFloat(prev);
            if (Math.abs(diff) < 0.01) return `<span class="text-muted text-rbi-caption ml-1 font-black">▬ 0</span>`;
            const isGood = inverse ? diff < 0 : diff > 0;
            const color = isGood ? 'text-green-500' : 'text-danger';
            const sign = diff > 0 ? '▲' : '▼';
            return `<span class="${color} text-rbi-caption ml-1 font-black">${sign}${Math.abs(diff).toFixed(Number.isInteger(diff) ? 0 : 2)}</span>`;
        };

        // --- 2. АГРЕГАЦИЯ ДАННЫХ ПО ОБЪЕКТАМ ---
        const projectsMap = {};
        data.forEach(item => { const pName = item.projectName || 'Без объекта'; if (!projectsMap[pName]) projectsMap[pName] = []; projectsMap[pName].push(item); });

        const prevProjectsMap = {};
        prevData.forEach(item => { const pName = item.projectName || 'Без объекта'; if (!prevProjectsMap[pName]) prevProjectsMap[pName] = []; prevProjectsMap[pName].push(item); });

        const projectsArray = Object.keys(projectsMap).map(pName => {
            const pData = projectsMap[pName];
            let redZone = 0; let b3Found = 0;
            pData.forEach(i => {
                if (i.metrics) {
                    b3Found += Number(i.metrics.n_B3_fail) || 0;
                }
            });
            const pKpi = (typeof window.avgContractorRatingsFromChecks === 'function')
                ? window.avgContractorRatingsFromChecks(pData)
                : { avgUrk: 0, avgDoc: null };
            const pAvgUrk = pKpi.avgUrk;
            const pAvgDoc = pKpi.avgDoc;
            const pMetrics = _getObjectIntegralMetricsCached(pData);
            const IKO = pMetrics ? pMetrics.IKO : "0.00";
            if (pMetrics) redZone = pMetrics.redZonePerc;

            // Данные прошлого периода
            const prevPData = prevProjectsMap[pName] || [];
            let pPrevAvgUrk = 0; let pPrevIKO = "0.00";
            if (prevPData.length > 0) {
                pPrevAvgUrk = (typeof window.avgContractorRatingsFromChecks === 'function')
                    ? window.avgContractorRatingsFromChecks(prevPData).avgUrk
                    : 0;
                const ppMetrics = _getObjectIntegralMetricsCached(prevPData);
                if (ppMetrics) pPrevIKO = ppMetrics.IKO;
            }

            return { name: pName, data: pData, avgUrk: pAvgUrk, avgDoc: pAvgDoc, prevAvgUrk: pPrevAvgUrk, IKO: IKO, prevIKO: pPrevIKO, redZone, b3Found, count: pData.length };
        });

        projectsArray.sort((a, b) => parseFloat(b.IKO) - parseFloat(a.IKO)); // Худшие по ИКО наверх

        // --- 3. КАРТОЧКИ ОБЪЕКТОВ С ТРЕНДАМИ (сетка как у подрядчиков: 2 на телефоне) ---
        let cardsHtml = '<div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">';
        projectsArray.forEach(p => {
            const ikoColor = parseFloat(p.IKO) >= 0.6 ? 'text-danger bg-danger-soft border-danger-soft' : (parseFloat(p.IKO) >= 0.3 ? 'text-orange-600 bg-orange-50 border-orange-200' : 'text-green-600 bg-green-50 border-green-200');
            const urkColor = _urkGradientColor(p.avgUrk);
            const hasDoc = p.avgDoc !== null && p.avgDoc !== undefined;
            const docColor = hasDoc ? _urkGradientColor(p.avgDoc) : '';
            const docGap = hasDoc ? Math.abs(p.avgUrk - p.avgDoc) : 0;
            const docGapWarn = (hasDoc && docGap > 30) ? ` <span title="${_t('quality.analytics.warn.doc_gap', 'Большой разрыв между физикой и документацией (>30%)')}">⚠️</span>` : '';

            cardsHtml += `
            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-2.5 sm:p-3 shadow-sm flex flex-col justify-between hover:border-brand transition-colors cursor-pointer active:scale-[0.98] min-w-0" onclick="
                window.rbi_setAnalyticsProjectFilter('${p.name}');
                updateFilterButtonLabels();
                window.onepagerMode = 'local';
                renderCurrentAnalyticsTab();
            ">
                <div class="min-w-0 mb-2">
                    <div class="text-rbi-caption sm:text-rbi-body font-black uppercase text-ink dark:text-white leading-snug line-clamp-2 break-words mb-1.5">${p.name}</div>
                    <div class="text-rbi-caption sm:text-rbi-caption font-black px-1.5 py-0.5 rounded border ${ikoColor} shadow-sm inline-flex items-center max-w-full">
                        <span class="truncate">ИКО ${p.IKO}</span>
                        <span class="shrink-0 ml-0.5">${formatTrendInline(p.IKO, p.prevIKO, true)}</span>
                    </div>
                </div>
                <div class="mt-auto pt-2 border-t border-surface space-y-1.5">
                    <div class="min-w-0">
                        <div class="text-rbi-caption sm:text-rbi-caption font-bold text-muted uppercase tracking-widest mb-0.5 truncate">${_t('quality.analytics.kpi.quality_level', 'Ур. качества')}</div>
                        <div class="text-xl sm:text-2xl font-black leading-none flex items-center tabular-nums" style="color:${urkColor}">
                            ${p.avgUrk}% ${formatTrendInline(p.avgUrk, p.prevAvgUrk, false)}
                        </div>
                        <div class="text-rbi-caption sm:text-rbi-caption font-bold mt-0.5 truncate" style="color:${hasDoc ? docColor : 'transparent'}">${hasDoc ? `${_t('quality.analytics.kpi.doc_short', 'Док')} ${p.avgDoc}%${docGapWarn}` : '&nbsp;'}</div>
                    </div>
                    <div class="flex flex-wrap justify-between gap-1 text-rbi-caption sm:text-rbi-caption font-bold uppercase">
                        <span class="text-muted">Пров. ${p.count}</span>
                        <span class="${p.b3Found > 0 ? 'text-danger' : 'text-muted'}">B3 ${p.b3Found}</span>
                    </div>
                </div>
            </div>`;
        });
        cardsHtml += '</div>';

        // --- 4. РЕЙТИНГ ИНЖЕНЕРОВ ПК СТРОЙКОНТРОЛЬ ---
        let skHrHtml = '';
        const skHrRecordsList = _getSkRecords();
        if (skHrRecordsList.length > 0) {
            const engMap = {};
            skHrRecordsList.forEach(r => {
                let baseName = r.inspector && r.inspector.trim() !== '' ? r.inspector.trim() : _t('quality.analytics.fallback.unspecified', 'Не указан');
                if (!engMap[baseName]) engMap[baseName] = { total: 0, open: 0, overdue: 0, withCategory: 0 };

                engMap[baseName].total++;
                const isOpen = r.status && r.status.toLowerCase().includes('не устран');
                if (isOpen) engMap[baseName].open++;
                if (r.category && r.category !== 'Без категории') engMap[baseName].withCategory++;

                const deadline = r.deadline ? new Date(r.deadline) : null;
                if (deadline && isOpen && new Date() > deadline) engMap[baseName].overdue++;
            });

            const skEngArray = Object.keys(engMap).map(name => {
                const d = engMap[name];
                const overduePerc = d.total > 0 ? Math.round((d.overdue / d.total) * 100) : 0;
                const catPerc = d.total > 0 ? Math.round((d.withCategory / d.total) * 100) : 0;
                const kpi = Math.max(0, 100 - overduePerc + (catPerc === 100 ? 10 : 0));
                return { name, total: d.total, open: d.open, overduePerc, kpi };
            });

            skEngArray.sort((a, b) => b.kpi - a.kpi);

            skHrHtml = skEngArray.map((e, idx) => `
                <div class="flex items-center gap-2 mb-2 pb-2 border-b border-surface last:border-0">
                    <div class="w-5 h-5 rounded flex items-center justify-center text-rbi-caption font-black ${idx === 0 ? 'bg-orange-400 text-white shadow-sm' : 'bg-slate-100 text-muted'} shrink-0">${idx + 1}</div>
                    <div class="flex-1 min-w-0">
                        <div class="text-rbi-label font-bold text-ink dark:text-white truncate">${e.name}</div>
                        <div class="text-rbi-caption font-bold text-muted uppercase mt-0.5">${_t('quality.analytics.onepager.sk_issued', 'Выдано: {total} | Просрочка: {pct}%', { total: e.total, pct: e.overduePerc })}</div>
                    </div>
                    <div class="text-right shrink-0">
                        <div class="text-rbi-caption font-bold text-muted uppercase mb-0.5">KPI</div>
                        <div class="text-rbi-body font-black ${e.kpi >= 80 ? 'text-green-500' : (e.kpi >= 50 ? 'text-orange-500' : 'text-danger')}">${e.kpi}</div>
                    </div>
                </div>
            `).join('');
        } else {
            skHrHtml = '<div class="text-rbi-caption text-center text-muted py-4">' + _t('quality.analytics.sk.not_loaded', 'Данные Стройконтроля не загружены') + '</div>';
        }

        // --- 5. ГЛОБАЛЬНЫЕ РЕЙТИНГИ ПОДРЯДЧИКОВ И ИНЖЕНЕРОВ RBI ---
        const allContrMap = {};
        data.forEach(c => {
            const cKey = `${c.contractorName} [${c.projectName || 'Без объекта'}]`;
            if (!allContrMap[cKey]) allContrMap[cKey] = [];
            allContrMap[cKey].push(c);
        });

        let ratingData = [];
        for (let cKey in allContrMap) {
            if (allContrMap[cKey].length >= 3) {
                const m = _contractorMetricsCached(cKey, allContrMap[cKey]);
                if (m) ratingData.push({ name: cKey, val: m.finalC, isPrelim: m.count < 7 });
            }
        }
        ratingData.sort((a, b) => b.val - a.val);

        let hrHtml = '';
        {
            const hrStats = window.RBI.services.game.calculateManagerMetrics();
            hrHtml = hrStats.map((s, idx) => `
                <div class="flex items-center gap-2 mb-2 pb-2 border-b border-surface last:border-0">
                    <div class="w-5 h-5 rounded flex items-center justify-center text-rbi-caption font-black ${idx === 0 ? 'bg-brand text-white shadow-sm' : 'bg-slate-100 text-muted'} shrink-0">${idx + 1}</div>
                    <div class="flex-1 min-w-0">
                        <div class="text-rbi-label font-bold text-ink dark:text-white truncate">${s.name}</div>
                        <div class="text-rbi-caption font-bold text-muted uppercase mt-0.5">Опыт: ${s.pi} XP | Инспекций: ${s.checks}</div>
                    </div>
                    <div class="text-right shrink-0">
                        <div class="text-rbi-caption font-bold text-muted uppercase mb-0.5">Impact</div>
                        <div class="text-rbi-body font-black ${s.avgImpact > 0 ? 'text-green-500' : (s.avgImpact < 0 ? 'text-danger' : 'text-muted')}">${s.avgImpact > 0 ? '+' : ''}${s.avgImpact.toFixed(1)}</div>
                    </div>
                </div>
            `).join('');
        }

        // --- 6. СБОРКА HTML (Аккордеоны) ---
        container.innerHTML = `
            <div class="bg-[var(--card-bg)] p-3 rounded-xl border border-[var(--card-border)] shadow-sm mb-4 mt-2 flex justify-between items-center">
                <div>
                    <h2 class="text-rbi-body font-black uppercase tracking-tight text-ink dark:text-white flex items-center gap-1.5">
                        <svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        ${_t('quality.analytics.onepager.global_summary', 'Глобальная сводка (Компания)')}
                    </h2>
                    <div class="text-rbi-caption font-bold text-[var(--text-muted)] mt-1">${_t('quality.analytics.onepager.coverage', 'Охват: {n} проверок', { n: data.length })} &bull; ${_t('quality.analytics.onepager.period_label', 'Период:')} <span class="text-brand">${periodText}</span></div>
                </div>
            </div>

            ${cardsHtml}

            <div class="space-y-3 pb-4">
                
                <!-- АНАЛИЗ ИИ -->
                <details class="bg-brand-soft/20 border border-brand-soft rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden" open>
                    <summary class="p-3.5 font-bold text-rbi-label text-brand uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-brand-soft transition-colors rounded-2xl select-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> 
                            ${_t('quality.analytics.onepager.portfolio_ai', 'Анализ портфеля (AI)')}
                        </span>
                        <span class="transition-transform group-open:rotate-180">▼</span>
                    </summary>
                    <div class="p-4 border-t border-brand-soft bg-surface rounded-b-2xl">
                        <div id="global-ai-text" class="text-rbi-body leading-relaxed text-ink font-medium whitespace-pre-wrap">
                            ${_reports().getExpertConclusion('global_portfolio_ai') || _t('quality.analytics.onepager.company_placeholder', 'Нажмите кнопку ниже для генерации отчета по всей компании.')}
                        </div>
                        <button onclick="window.RBI.services.ai.rbi_generateGlobalAi()" class="mt-4 w-full bg-brand text-white py-3.5 rounded-xl font-black text-rbi-label uppercase tracking-widest shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Сгенерировать резюме
                        </button>
                    </div>
                </details>
                <!-- ДВА РЕЙТИНГА ОБЪЕКТОВ РЯДОМ -->
                
                    
                    <!-- РЕЙТИНГ ОБЪЕКТОВ (Ср. УрК) -->
                    <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden">
                        <summary class="p-3.5 font-bold text-rbi-label text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-2xl select-none">
                            <span class="flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"></path></svg> 
                                ${_t('quality.analytics.onepager.projects_rating', 'Рейтинг Объектов (УрК)')}
                            </span>
                            <span class="transition-transform group-open:rotate-180">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg>
                            </span>
                        </summary>
                        <div class="p-4 border-t border-[var(--card-border)] bg-surface/50 rounded-b-2xl">
                            <div class="space-y-3 max-h-[30vh] overflow-y-auto custom-scrollbar pr-2">
                                ${[...projectsArray].sort((a, b) => b.avgUrk - a.avgUrk).map(p => `
                                    <div class="flex items-center gap-2 pb-2 border-b border-surface last:border-0">
                                        <div class="flex-1 min-w-0 pr-2">
                                            <div class="text-rbi-label font-bold text-ink dark:text-white truncate" title="${p.name}">${p.name}</div>
                                            <div class="w-full h-1.5 bg-[var(--card-border)] rounded-full overflow-hidden mt-1.5">
                                                <div class="h-full" style="width:${p.avgUrk}%; background-color:${_urkGradientColor(p.avgUrk)}"></div>
                                            </div>
                                        </div>
                                        <div class="text-right shrink-0 flex flex-col items-end justify-center">
                                            <div class="text-rbi-title font-black leading-none" style="color:${_urkGradientColor(p.avgUrk)}">${p.avgUrk}%</div>
                                            <div class="flex items-center justify-end mt-1 h-3">${formatTrendInline(p.avgUrk, p.prevAvgUrk, false)}</div>
                                            ${(p.avgDoc !== null && p.avgDoc !== undefined) ? `<div class="text-rbi-caption font-bold" style="color:${_urkGradientColor(p.avgDoc)}">Док ${p.avgDoc}%</div>` : ''}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </details>

                    <!-- АНТИРЕЙТИНГ ОБЪЕКТОВ (ИКО) -->
                    <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden">
                        <summary class="p-3.5 font-bold text-rbi-label text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-2xl select-none">
                            <span class="flex items-center gap-2">
                                <svg class="w-4 h-4 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> 
                                ${_t('quality.analytics.onepager.antiratings', 'Антирейтинг (ИКО)')}
                            </span>
                            <span class="transition-transform group-open:rotate-180">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg>
                            </span>
                        </summary>
                        <div class="p-4 border-t border-[var(--card-border)] bg-surface/50 rounded-b-2xl">
                            <div class="space-y-3 max-h-[30vh] overflow-y-auto custom-scrollbar pr-2">
                                ${[...projectsArray].sort((a, b) => parseFloat(b.IKO) - parseFloat(a.IKO)).map(p => `
                                    <div class="flex items-center gap-2 pb-2 border-b border-surface last:border-0">
                                        <div class="flex-1 min-w-0 pr-2">
                                            <div class="text-rbi-label font-bold text-ink dark:text-white truncate" title="${p.name}">${p.name}</div>
                                            <div class="text-rbi-caption font-bold text-muted mt-1 uppercase">${_t('quality.analytics.onepager.crit_defects', 'Крит. деф. (B3): {n} шт.', { n: p.b3Found })}</div>
                                        </div>
                                        <div class="text-right shrink-0 flex flex-col items-end justify-center">
                                            <div class="text-rbi-title font-black leading-none ${parseFloat(p.IKO) >= 0.6 ? 'text-danger' : (parseFloat(p.IKO) >= 0.3 ? 'text-orange-500' : 'text-green-500')}">${p.IKO}</div>
                                            <div class="flex items-center justify-end mt-1 h-3">${formatTrendInline(p.IKO, p.prevIKO, true)}</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </details>
                    
                
                <!-- ГЛОБАЛЬНЫЕ ПОДРЯДЧИКИ -->
                <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden">
                    <summary class="p-3.5 font-bold text-rbi-label text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-2xl select-none">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg> 
                            ${_t('quality.analytics.onepager.global_contr', 'Глобальные Подрядчики (ИУрК)')}
                        </span>
                        <span class="transition-transform group-open:rotate-180">▼</span>
                    </summary>
                    <div class="p-4 border-t border-[var(--card-border)] bg-surface/50 rounded-b-2xl">
                        <div class="space-y-3 max-h-[40vh] overflow-y-auto custom-scrollbar pr-2">
                            ${ratingData.map(r => `
                                <div class="flex items-center gap-2">
                                    <div class="w-32 text-rbi-caption font-bold text-ink truncate" title="${r.name}">${r.name}</div>
                                    <div class="flex-1 h-2.5 bg-[var(--hover-bg)] rounded-full overflow-hidden border border-[var(--card-border)] relative">
                                        <div class="h-full ${r.val < 70 ? 'bg-danger' : (r.val < 85 ? 'bg-orange-500' : 'bg-green-500')}" style="width:${r.val}%"></div>
                                    </div>
                                    <div class="w-10 text-right text-rbi-label font-black ${r.val < 70 ? 'text-danger' : (r.val < 85 ? 'text-orange-500' : 'text-green-500')}">${r.val}%</div>
                                </div>
                            `).join('') || ('<div class="text-rbi-caption text-center text-muted">' + _t('quality.analytics.empty.generic', 'Нет данных') + '</div>')}
                        </div>
                    </div>
                </details>

                <!-- ДВА РЕЙТИНГА ИНЖЕНЕРОВ РЯДОМ -->
                
                    
                    <!-- ИНЖЕНЕРЫ RBI -->
                    <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden">
                        <summary class="p-3.5 font-bold text-rbi-label text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-2xl select-none">
                            <span class="flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg> 
                                ${_t('quality.analytics.onepager.auditors', 'Рейтинг Аудиторов RBI')}
                            </span>
                            <span class="transition-transform group-open:rotate-180">▼</span>
                        </summary>
                        <div class="p-4 border-t border-[var(--card-border)] bg-surface rounded-b-2xl">
                            ${hrHtml || ('<div class="text-rbi-caption text-center text-muted">' + _t('quality.analytics.empty.team', 'Нет данных по команде') + '</div>')}
                        </div>
                    </details>

                    <!-- ИНЖЕНЕРЫ ПК СТРОЙКОНТРОЛЬ -->
                    <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm group [&_summary::-webkit-details-marker]:hidden">
                        <summary class="p-3.5 font-bold text-rbi-label text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-2xl select-none">
                            <span class="flex items-center gap-2">
                                <svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> 
                                ${_t('quality.analytics.onepager.sk_engineers', 'Рейтинг Инженеров (ПК СК)')}
                            </span>
                            <span class="transition-transform group-open:rotate-180">▼</span>
                        </summary>
                        <div class="p-4 border-t border-[var(--card-border)] bg-surface rounded-b-2xl">
                            ${skHrHtml}
                        </div>
                    </details>

                

            </div>
        `;
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: подвкладка «Детализация
    // подрядчика» (с Предиктивным ИИ).
    // =========================================================================
    showContractorDetailView(contractorName) {
        window.currentDetailedContractor = contractorName;
        document.getElementById('contractors-main-view').classList.add('hidden');
        document.getElementById('contractor-detail-view').classList.remove('hidden');
        document.getElementById('detail-view-title').innerText = contractorName;
        window.scrollTo(0, 0);

        const container = document.getElementById('contractor-detail-content');
        const data = getFilteredAnalyticsData().filter(c => {
            const projectLabel = c.project_display_name || c.projectName || c.project_canonical_key || 'Без объекта';
            return c.contractorName + ' [' + projectLabel + ']' === contractorName;
        });

        if (data.length === 0) { container.innerHTML = _t('quality.analytics.error.data', 'Ошибка данных'); return; }

        const m = getContractorMetrics(data, _templates().getUserTemplates());
        // Исторический контур: все проверки подрядчика+объекта без фильтра периода и без окна 15.
        const histData = (_inspections() || []).filter(c => {
            const projectLabel = c.project_display_name || c.projectName || c.project_canonical_key || 'Без объекта';
            return c.contractorName + ' [' + projectLabel + ']' === contractorName;
        });
        const mHist = histData.length
            ? getContractorMetrics(histData, _templates().getUserTemplates(), false)
            : null;
        const workType = data[0].templateTitle;

        let cStageData = {}; let cFailCounts = {}; let cB3Counts = {};
        let sumB1 = 0, sumB2 = 0, sumB3 = 0;
        let allPhotosB3 = []; let allPhotosB2 = []; let allPhotosOK = [];

        data.forEach(unit => {
            if (unit.metrics) {
                sumB1 += Number(unit.metrics.n_B1_fail) || 0;
                sumB2 += Number(unit.metrics.n_B2_fail) || 0;
                sumB3 += Number(unit.metrics.n_B3_fail) || 0;
            }

            const tType = unit.templateKey ? unit.templateKey.split('_')[0] : '';
            const tKey = unit.templateKey ? unit.templateKey.replace(tType + '_', '') : '';
            const clGroups = tType === 'sys' && _getSystemTemplates()[tKey] ? _getSystemTemplates()[tKey].groups : (_templates().getUserTemplates()[tKey] ? _templates().getUserTemplates()[tKey].groups : []);

            if (unit.state) {
                Object.keys(unit.state).forEach(id => {
                    const s = unit.state[id];
                    let defName = _t('quality.analytics.fallback.defect', 'Дефект');
                    let parentStage = _t('quality.analytics.fallback.other', 'Прочее'); // Дефолтное имя, если не найдем

                    // Ищем реальную группу из чек-листа
                    clGroups.forEach(group => {
                        const found = group.items.find(x => String(x.id) === String(id));
                        if (found) { defName = found.n; parentStage = group.group || group.title || _t('quality.analytics.fallback.other', 'Прочее'); }
                    });

                    if (!cStageData[parentStage]) {
                        cStageData[parentStage] = { checks: 0, sumUrk: 0, ok: 0, fail: 0, b1: 0, b2: 0, b3: 0, _countedUnits: new Set() };
                    }

                    // Считаем уникальные проверки (чтобы не плюсовать УрК за каждый дефект)
                    if (!cStageData[parentStage]._countedUnits.has(unit.id)) {
                        cStageData[parentStage]._countedUnits.add(unit.id);
                        cStageData[parentStage].checks++;
                        cStageData[parentStage].sumUrk += (unit.metrics ? (Number(unit.metrics.final) || 0) : 0);
                    }

                    const photosArr = (unit.photos && unit.photos[id])
                        ? (window.normalizeItemPhotos ? window.normalizeItemPhotos(unit.photos[id]) : [].concat(unit.photos[id]))
                        : [];

                    if (s === 'ok') {
                        cStageData[parentStage].ok++;
                        photosArr.forEach((photo) => {
                            if (photo) {
                                const ts = new Date(unit.date).getTime();
                                allPhotosOK.push({
                                    photo: photo,
                                    name: defName,
                                    contr: contractorName,
                                    date: Number.isFinite(ts) ? new Date(ts).toLocaleDateString('ru-RU') : '—',
                                    ts: Number.isFinite(ts) ? ts : 0,
                                    dateRaw: unit.date
                                });
                            }
                        });
                    }

                    if (s === 'fail' || s === 'fail_escalated') {
                        cStageData[parentStage].fail++;
                        const flatList = getFlatList(clGroups);
                        const foundItem = flatList.find(x => String(x.id) === String(id));
                        let isB3 = (s === 'fail_escalated') || (foundItem && foundItem.w === 3);
                        const ts = new Date(unit.date).getTime();
                        const dateLabel = Number.isFinite(ts) ? new Date(ts).toLocaleDateString('ru-RU') : '—';
                        const photoMeta = {
                            name: defName,
                            contr: contractorName,
                            date: dateLabel,
                            ts: Number.isFinite(ts) ? ts : 0,
                            dateRaw: unit.date
                        };

                        if (isB3) {
                            cStageData[parentStage].b3++;
                            if (!cB3Counts[defName]) cB3Counts[defName] = { count: 0, photo: null, name: defName };
                            cB3Counts[defName].count++;
                            photosArr.forEach((photo) => {
                                if (photo) allPhotosB3.push({ photo: photo, ...photoMeta });
                            });
                        } else {
                            cStageData[parentStage].b2++;
                            if (!cFailCounts[defName]) cFailCounts[defName] = { count: 0, photo: null, name: defName };
                            cFailCounts[defName].count++;
                            photosArr.forEach((photo) => {
                                if (photo) allPhotosB2.push({ photo: photo, ...photoMeta });
                            });
                        }
                    }
                });
            }
        });

        _sortGalleryNewestFirst(allPhotosB3);
        _sortGalleryNewestFirst(allPhotosB2);
        _sortGalleryNewestFirst(allPhotosOK);

        let stagesUIHtml = Object.keys(cStageData).map(k => {
            const d = cStageData[k];
            const avgUrk = Math.round(d.sumUrk / d.checks);
            return `<tr class="border-b border-[var(--card-border)] hover:bg-[var(--hover-bg)]">
                <td class="p-2 text-rbi-caption font-bold whitespace-normal">${k}</td>
                <td class="p-2 text-center text-rbi-label">${d.checks}</td>
                <td class="p-2 text-center text-rbi-label font-black ${avgUrk < 70 ? 'text-danger' : (avgUrk < 85 ? 'text-orange-500' : 'text-green-600')}">${avgUrk}%</td>
                <td class="p-2 text-center text-rbi-label text-green-600 font-bold">${d.ok}</td>
                <td class="p-2 text-center text-rbi-label text-orange-500">${d.b2}</td>
                <td class="p-2 text-center text-rbi-label text-danger font-black">${d.b3}</td>
            </tr>`;
        }).join('');
        // --- Генерируем HTML для списка дефектов ---
        let defectsListHtml = '';
        const allDefectsForList = [];
        Object.keys(cB3Counts).forEach(k => allDefectsForList.push({ name: k, count: cB3Counts[k].count, type: 'B3' }));
        Object.keys(cFailCounts).forEach(k => allDefectsForList.push({ name: k, count: cFailCounts[k].count, type: 'B2' }));

        allDefectsForList.sort((a, b) => b.count - a.count); // Сортируем по частоте

        if (allDefectsForList.length > 0) {
            defectsListHtml = allDefectsForList.map(d => `
                <div class="flex justify-between items-center border-b border-surface py-2 last:border-0">
                    <div class="text-rbi-label font-bold text-ink pr-4 leading-snug">${d.name}</div>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="text-rbi-caption font-black px-1.5 py-0.5 rounded ${d.type === 'B3' ? 'bg-danger-soft text-danger' : 'bg-orange-100 text-orange-600'}">${d.type}</span>
                        <span class="text-rbi-label font-black text-muted w-8 text-right">${d.count} ${_t('quality.analytics.chart.pcs', 'шт')}</span>
                    </div>
                </div>
            `).join('');
        } else {
            defectsListHtml = '<div class="text-center text-muted text-rbi-caption font-bold py-2">' + _t('quality.analytics.detail.no_b2b3', 'Дефектов B2 и B3 не зафиксировано') + '</div>';
        }
        const totalDefects = sumB1 + sumB2 + sumB3;
        const pB1 = totalDefects > 0 ? Math.round((sumB1 / totalDefects) * 100) : 0;
        const pB2 = totalDefects > 0 ? Math.round((sumB2 / totalDefects) * 100) : 0;
        const pB3 = totalDefects > 0 ? Math.round((sumB3 / totalDefects) * 100) : 0;

        const histAccordionHtml = mHist ? `
            <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm mb-4 group [&_summary::-webkit-details-marker]:hidden">
                <summary class="p-3 font-black text-rbi-label text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-xl">
                    <span class="flex items-center gap-2">${_t('quality.analytics.detail.history_all', '📚 История (все проверки)')}</span>
                    <span class="transition-transform group-open:rotate-180">▼</span>
                </summary>
                <div class="border-t border-[var(--card-border)] p-3 space-y-3">
                    <p class="text-rbi-caption text-muted font-bold leading-snug">За всё время по этому подрядчику на объекте, <b>без</b> скользящего окна ≤15 и <b>без</b> фильтра периода. Здесь — доверительный интервал и достоверность.</p>
                    <div class="grid grid-cols-2 gap-2">
                        <div class="bg-[var(--hover-bg)] p-2.5 rounded-lg border border-[var(--card-border)]">
                            <div class="text-rbi-caption text-muted uppercase font-bold">${_t('quality.analytics.detail.rel_history', 'Надёжность (история)')}</div>
                            <div class="text-2xl font-black ${mHist.finalC < 70 ? 'text-danger' : (mHist.finalC < 85 ? 'text-orange-500' : 'text-green-600')}">${mHist.count < 7 ? '—' : mHist.finalC + '%'}</div>
                        </div>
                        <div class="bg-[var(--hover-bg)] p-2.5 rounded-lg border border-[var(--card-border)]">
                            <div class="text-rbi-caption text-muted uppercase font-bold">${_t('quality.analytics.detail.avg_urk_history', 'Ср. УрК (история)')}</div>
                            <div class="text-2xl font-black text-ink dark:text-white">${mHist.baseUrkContrPerc}%</div>
                        </div>
                    </div>
                    <div class="grid grid-cols-3 gap-2 text-center">
                        <div class="bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--card-border)]">
                            <div class="text-rbi-caption text-muted uppercase font-bold">${_t('quality.analytics.detail.n_full', 'N полное')}</div>
                            <div class="font-black text-sm">${mHist.count}</div>
                        </div>
                        <div class="bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--card-border)]">
                            <div class="text-rbi-caption text-muted uppercase font-bold">±E (95%)</div>
                            <div class="font-black text-sm">${mHist.count >= 2 ? ('±' + mHist.ci95_margin.toFixed(1) + '%') : '—'}</div>
                        </div>
                        <div class="bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--card-border)]">
                            <div class="text-rbi-caption text-muted uppercase font-bold">${_t('quality.analytics.detail.credibility', 'Достоверность')}</div>
                            <div class="text-rbi-caption font-black uppercase mt-0.5 ${mHist.confCls}">${mHist.confStatus}</div>
                        </div>
                    </div>
                    <div class="text-rbi-caption font-bold text-muted">${_t('quality.analytics.kpi.stability', 'Стабильность:')} <span class="${mHist.stabColor}">${mHist.stabilityIndex} (${mHist.stabText})</span></div>
                </div>
            </details>` : '';

        let mathBreakdown = `
            <div class="text-rbi-label space-y-2 text-ink">
                <p>Операционный Интегральный УрК: окно последних до 15 проверок внутри текущего фильтра периода (в срезе ${data.length} проверок).</p>
                <div class="bg-surface p-2 rounded border border-surface font-mono text-rbi-caption">
                    Средний балл по изделиям (до штрафов): <b>${m.baseUrkContrPerc}%</b>
                </div>
                <p><b>Применены следующие штрафные коэффициенты:</b></p>
                <ul class="list-disc pl-4 space-y-1">
                    <li><span class="${m.ks < 1 ? 'text-danger font-bold' : 'text-green-600'}">Ks = ${m.ks.toFixed(2)}</span> (Системность). Отражает повторяемость одного и того же дефекта B2. В данном случае максимальная частота повтора: ${m.maxFailRate.toFixed(1)}%.</li>
                    <li><span class="${m.kcritC < 1 ? 'text-danger font-bold' : 'text-green-600'}">KB3 = ${m.kcritC.toFixed(2)}</span> (Критичность). Отражает частоту появления аварийных дефектов B3. Доля проверок с B3: ${m.rateB3.toFixed(1)}%.</li>
                </ul>
                ${(m.ks < 1 || m.kcritC < 1) && m.finalC === 84 ? `<div class="bg-orange-50 text-orange-800 p-2 rounded mt-2 border border-orange-200">⚠️ ${_t('quality.analytics.detail.cap84', 'Сработало правило "Стеклянного потолка" (Cap84). Из-за наличия системных или критических нарушений, итоговая оценка обрезана до 84%.')}</div>` : ''}
                <p class="mt-2 border-t pt-2 border-slate-200"><b>Вывод для инженера:</b> ${m.reason}</p>
            </div>
        `;

        const expertObj = getExpertConclusion(m, contractorName, workType, data.length, contractorName.replace(/\W/g, '_'), _reports().getExpertConclusions());
        const expertUiHtml = expertObj.uiHtml;
        const safeContractorNameForHtml = contractorName.replace(/'/g, "\\'").replace(/"/g, '&quot;');

        // --- РАСЧЕТ ДАННЫХ ПК СТРОЙКОНТРОЛЬ ДЛЯ ДАННОГО ПОДРЯДЧИКА ---
        let skTotal = 0, skOpen = 0, skOverdue = 0;
        let skHtmlBlock = '';
        const skDetailRecordsList = _getSkRecords();
        if (skDetailRecordsList.length > 0) {
            const cleanCName = contractorName.split(' [')[0];
            const skDetailContractorMap = _getSkContractorMap();
            const cRecords = skDetailRecordsList.filter(r =>
                r.contractor === cleanCName ||
                r.raw_contractor === cleanCName ||
                (skDetailContractorMap && skDetailContractorMap[r.raw_contractor] === cleanCName)
            );
            skTotal = cRecords.length;
            cRecords.forEach(r => {
                const isOpen = r.status && r.status.toLowerCase().includes('не устран');
                if (isOpen) skOpen++;
                if (r.deadline && new Date() > new Date(r.deadline) && isOpen) skOverdue++;
            });
            if (skTotal > 0) {
                const overdueColor = skOverdue > 3 ? 'text-danger' : (skOverdue > 0 ? 'text-orange-500' : 'text-green-600');
                skHtmlBlock = `
                    <div class="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-3 shadow-sm mb-4">
                        <div class="text-rbi-label font-black text-blue-700 dark:text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-2">📑 ${_t('quality.analytics.detail.sk_data', 'Данные ПК Стройконтроль')}</div>
                        <div class="flex justify-between items-center bg-surface rounded-lg p-2 border border-blue-100 dark:border-blue-800">
                            <div class="text-center flex-1 border-r border-slate-100">
                                <div class="text-rbi-caption font-bold text-muted uppercase mb-1">${_t('quality.analytics.detail.sk_total', 'Всего замеч.')}</div>
                                <div class="text-xl font-black text-ink">${skTotal}</div>
                            </div>
                            <div class="text-center flex-1 border-r border-slate-100">
                                <div class="text-rbi-caption font-bold text-muted uppercase mb-1">${_t('quality.analytics.detail.sk_open', 'Открыто')}</div>
                                <div class="text-xl font-black ${skOpen > 0 ? 'text-danger' : 'text-green-500'}">${skOpen}</div>
                            </div>
                            <div class="text-center flex-1">
                                <div class="text-rbi-caption font-bold text-muted uppercase mb-1">${_t('quality.analytics.detail.sk_overdue', 'Просрочено')}</div>
                                <div class="text-xl font-black ${overdueColor}">${skOverdue}</div>
                            </div>
                        </div>
                    </div>`;
            }
        }

        container.innerHTML = `
        ${skHtmlBlock}
            <!-- КНОПКА ПЕЧАТИ С ЗАЩИТОЙ -->
            <button onclick="exportPersonalContractorReport('${safeContractorNameForHtml}')" class="w-full mb-4 bg-brand text-white py-3.5 rounded-xl font-black text-rbi-label uppercase tracking-widest shadow-[0_4px_14px_rgba(79,70,229,0.3)] active:scale-95 transition-transform flex justify-center items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"></path></svg> Отчёт для планерки (A3)
            </button>

            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 shadow-sm mb-4">
                <div class="text-rbi-caption font-bold text-brand uppercase tracking-widest mb-2">${_t('quality.analytics.detail.ops_window', 'Оперативно · период + окно ≤15')}</div>
                <div class="flex justify-between items-start mb-3 border-b border-[var(--card-border)] pb-3">
                    <div class="bg-[var(--hover-bg)] p-2 rounded-xl border border-[var(--card-border)] shadow-sm flex flex-col justify-center min-h-[70px]">
                        <div class="text-rbi-caption font-bold text-muted uppercase tracking-widest mb-1 flex items-center gap-1">${_t('quality.analytics.detail.reliability_iurk', 'Надежность (ИУрК)')}</div>
                        ${m.count < 7
                ? `<div class="text-rbi-body font-black text-muted uppercase leading-tight">${_t('quality.analytics.detail.min_checks', 'Проведите минимум 7 проверок')}<br><span class="text-brand">${_t('quality.analytics.detail.collected', 'Собрано: {n} из 7', { n: m.count })}</span></div>`
                : `<div class="text-5xl font-black leading-none ${m.finalC < 70 ? 'text-danger' : (m.finalC < 85 ? 'text-orange-500' : 'text-green-600')}">${m.finalC}%</div>`
            }
                    </div>
                    <div class="text-right">
                        <span class="text-rbi-body font-black text-ink block">${_t('quality.analytics.detail.avg_urk_units', 'Ср. УрК Изд:')} ${m.baseUrkContrPerc}%</span>
                        ${(m.documentaryC !== null && m.documentaryC !== undefined) ? `<span class="text-rbi-body font-black text-brand block">${_t('quality.analytics.kpi.doc_urk', 'УрК Докум:')} ${m.documentaryC}%</span>` : ''}
                        <div class="text-rbi-caption font-bold text-muted mt-1">N в окне: ${m.count}</div>
                    </div>
                </div>
                ${(m.count >= 7 && m.documentaryC !== null && m.documentaryC !== undefined && Math.abs(m.finalC - m.documentaryC) > 30) ? `<div class="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 text-rbi-caption font-bold p-2 rounded-lg border border-orange-200 dark:border-orange-800 mb-3 flex items-center gap-1.5">⚠️ Разрыв между физикой (${m.finalC}%) и документацией (${m.documentaryC}%) — ${Math.abs(m.finalC - m.documentaryC)} п.п.</div>` : ''}
                
                <div class="grid grid-cols-4 gap-2 mb-3 text-center">
                    <div class="bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--card-border)]"><div class="text-rbi-caption text-muted uppercase font-bold" title="${_t('quality.analytics.kpi.window_hint', 'Последние до 15 в периоде')}">${_t('quality.analytics.kpi.window', 'Окно')}</div><div class="font-black text-sm">${m.count}</div></div>
                    <div class="bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--card-border)]"><div class="text-rbi-caption text-muted uppercase font-bold">${_t('quality.analytics.kpi.stab_short', 'Стаб-ть')}</div><div class="font-black text-sm ${m.stabColor}">${m.stabilityIndex}</div></div>
                    <div class="bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--card-border)]"><div class="text-rbi-caption text-muted uppercase font-bold">Ks</div><div class="font-black text-sm ${m.ks < 1 ? 'text-danger' : 'text-ink'}">${m.ks.toFixed(2)}</div></div>
                    <div class="bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--card-border)]"><div class="text-rbi-caption text-muted uppercase font-bold">Kcrit</div><div class="font-black text-sm ${m.kcritC < 1 ? 'text-danger' : 'text-ink'}">${m.kcritC.toFixed(2)}</div></div>
                </div>

                <div class="flex h-3 rounded-full overflow-hidden border border-[var(--card-border)]">
                    <div class="bg-blue-500" style="width: ${pB1}%"></div>
                    <div class="bg-orange-500" style="width: ${pB2}%"></div>
                    <div class="bg-danger" style="width: ${pB3}%"></div>
                </div>
                <div class="flex justify-between text-rbi-caption font-bold text-muted mt-1.5 px-1 uppercase tracking-wider">
                    <span class="bg-blue-50 text-blue-700 px-2 rounded border border-blue-100">B1: ${sumB1}</span>
                    <span class="bg-orange-50 text-orange-700 px-2 rounded border border-orange-100">B2: ${sumB2}</span>
                    <span class="bg-danger-soft text-danger px-2 rounded border border-danger-soft">B3: ${sumB3}</span>
                </div>
            </div>

            ${histAccordionHtml}
            
            <!-- НОВЫЙ БЛОК: ПРЕДИКТИВНЫЙ ИИ ПРОГНОЗ -->
            <details class="bg-[var(--card-bg)] border-2 border-brand-soft rounded-xl shadow-sm mb-4 group [&_summary::-webkit-details-marker]:hidden">
                <summary class="p-3 font-black text-rbi-label text-brand uppercase tracking-widest cursor-pointer flex justify-between items-center bg-brand-soft/20 rounded-xl hover:bg-brand-soft transition-colors">
                    <span class="flex items-center gap-2">${_t('quality.analytics.detail.forecast', '🔮 Предиктивный прогноз (AI)')}</span>
                    <span class="transition-transform group-open:rotate-180">▼</span>
                </summary>
                <div class="border-t border-brand-soft p-4 bg-surface">
                    <div id="ai-forecast-container">
                        <button onclick="window.RBI.services.ai.generateContractorForecastAi('${safeContractorNameForHtml}')" class="w-full bg-slate-100 text-ink py-3 rounded-xl font-black text-rbi-caption uppercase active:scale-95 shadow-sm border border-surface transition-transform">🤖 Рассчитать прогноз на 2 недели</button>
                    </div>
                </div>
            </details>

            <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm mb-4 group [&_summary::-webkit-details-marker]:hidden">
                <summary class="p-3 font-black text-rbi-label text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-xl">
                    <span class="flex items-center gap-2">${_t('quality.analytics.detail.pdca', '📝 Классическое заключение (PDCA)')}</span>
                    <span class="transition-transform group-open:rotate-180">▼</span>
                </summary>
                <div class="border-t border-[var(--card-border)] p-1">
                    ${expertUiHtml}
                </div>
            </details>
            
            <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm mb-4 group [&_summary::-webkit-details-marker]:hidden">
                <summary class="p-3 font-black text-rbi-label text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-xl">
                    <span class="flex items-center gap-2">${_t('quality.analytics.detail.culture', '🏅 Культура качества (AI)')}</span>
                    <span class="transition-transform group-open:rotate-180">▼</span>
                </summary>
                <div class="p-3 border-t border-[var(--card-border)] bg-surface/30">
                    <button onclick="window.RBI.services.ai.generateCultureAi('${safeContractorNameForHtml}')" class="w-full bg-white border border-brand-soft text-brand py-2.5 rounded-xl font-bold text-rbi-caption uppercase shadow-sm active:scale-95 mb-2">🤖 Оценить вовлеченность</button>
                    <div id="culture-ai-text" class="text-rbi-label leading-relaxed text-ink">
                        ${_reports().getExpertConclusion(`culture_${contractorName}`) || _t('quality.analytics.detail.culture_placeholder', 'Нажмите кнопку для генерации оценки вовлеченности подрядчика.')}
                    </div>
                </div>
            </details>

            <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm mb-4 group [&_summary::-webkit-details-marker]:hidden">
                <summary class="p-3 font-black text-rbi-label text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-xl">
                    <span class="flex items-center gap-2">${_t('quality.analytics.detail.system_breakdown', '⚙️ Разбор оценки от Системы')}</span>
                    <span class="transition-transform group-open:rotate-180">▼</span>
                </summary>
                <div class="p-3 border-t border-[var(--card-border)] bg-surface/30">
                    ${mathBreakdown}
                </div>
            </details>

            <div class="flex flex-col gap-4 mb-4">
                <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm group [&_summary::-webkit-details-marker]:hidden">
                    <summary class="p-3 font-black text-rbi-caption text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-xl">
                        <span>${_t('quality.analytics.detail.checks_dynamics', '📉 Динамика по проверкам')}</span><span>▼</span>
                    </summary>
                    <div class="p-3 border-t border-[var(--card-border)]">
                        <div style="height: 160px; position: relative;"><canvas id="chart_detail_line"></canvas></div>
                    </div>
                </details>
                
                <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm group [&_summary::-webkit-details-marker]:hidden">
                    <summary class="p-3 font-black text-rbi-caption text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-xl">
                        <span>${_t('quality.analytics.detail.stages_smr', '📑 Качество по этапам СМР')}</span><span>▼</span>
                    </summary>
                    <div class="overflow-x-auto border-t border-[var(--card-border)]">
                        <table class="w-full text-left whitespace-nowrap">
                            <thead class="bg-surface/50 text-rbi-caption text-[var(--text-muted)] border-b border-[var(--card-border)] uppercase tracking-wider">
                                <tr><th class="p-2 pl-3">${_t('quality.analytics.table.stage', 'Этап')}</th><th class="p-2 text-center">${_t('quality.analytics.table.checks', 'Пров.')}</th><th class="p-2 text-center">УрК</th><th class="p-2 text-center text-green-600">OK</th><th class="p-2 text-center text-orange-500">B2</th><th class="p-2 text-center text-danger">B3</th></tr>
                            </thead>
                            <tbody class="divide-y divide-[var(--card-border)]">${stagesUIHtml}</tbody>
                        </table>
                    </div>
                </details>
            </div>
            <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm mb-4 group [&_summary::-webkit-details-marker]:hidden">
                <summary class="p-3 font-black text-rbi-label text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-xl">
                    <span class="flex items-center gap-2">${_t('quality.analytics.detail.defect_registry', '📋 Реестр частых дефектов')}</span>
                    <span class="transition-transform group-open:rotate-180">▼</span>
                </summary>
                <div class="p-3 border-t border-[var(--card-border)] bg-surface/30">
                    ${defectsListHtml}
                </div>
            </details>
            <details id="contractor-detail-photos" class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm mb-4 group [&_summary::-webkit-details-marker]:hidden">
                <summary class="p-3 font-black text-rbi-label text-[var(--text-muted)] uppercase tracking-widest cursor-pointer flex justify-between items-center hover:bg-[var(--hover-bg)] transition-colors rounded-xl">
                    <span class="flex items-center gap-2">${_t('quality.analytics.detail.photo_galleries', '📸 Фотогалереи (Брак и Эталоны)')}</span>
                    <span class="transition-transform group-open:rotate-180">▼</span>
                </summary>
                <div class="p-3 border-t border-[var(--card-border)] bg-surface/30 space-y-4">
                    <div>
                        <h3 class="text-rbi-caption font-black text-danger uppercase mb-2">${_t('quality.analytics.gallery.b3_title', 'Критический брак (B3)')}</h3>
                        <div id="lazy-gallery-det_b3" class="text-xs text-muted">${_t('quality.analytics.gallery.open_to_load', 'Откройте блок, чтобы загрузить фото…')}</div>
                    </div>
                    <div class="pt-2 border-t border-surface">
                        <h3 class="text-rbi-caption font-black text-orange-600 uppercase mb-2">${_t('quality.analytics.gallery.b2_title', 'Значимые дефекты (B2)')}</h3>
                        <div id="lazy-gallery-det_b2" class="text-xs text-muted">${_t('quality.analytics.gallery.open_to_load', 'Откройте блок, чтобы загрузить фото…')}</div>
                    </div>
                    <div class="pt-2 border-t border-surface">
                        <h3 class="text-rbi-caption font-black text-green-600 uppercase mb-2">${_t('quality.analytics.gallery.ok_title', 'Эталонные работы (OK)')}</h3>
                        <div id="lazy-gallery-det_ok" class="text-xs text-muted">${_t('quality.analytics.gallery.open_to_load', 'Откройте блок, чтобы загрузить фото…')}</div>
                    </div>
                </div>
            </details>
            
        `;

        _lazyDetailGalleryFilled = false;
        _lazyDetailGalleryPayload = { allPhotosB3, allPhotosB2, allPhotosOK };
        const detPhotos = document.getElementById('contractor-detail-photos');
        if (detPhotos) {
            detPhotos.addEventListener('toggle', rbiEnsureDetailPhotoGalleries);
        }

        const detailChartGen = _analyticsRenderGen;
        setTimeout(() => {
            if (detailChartGen !== _analyticsRenderGen) return;
            const ctxL = document.getElementById('chart_detail_line')?.getContext('2d');
            if (ctxL) {
                const prev = _chartInstances()['chart_detail_line'];
                if (prev && typeof prev.destroy === 'function') {
                    try { prev.destroy(); } catch (e) { /* ignore */ }
                }
                _chartInstances()['chart_detail_line'] = new Chart(ctxL, {
                    type: 'line',
                    data: { labels: data.map((_, i) => `#${i + 1}`), datasets: [{ data: data.map(item => item.metrics.final), borderColor: '#4f46e5', backgroundColor: '#4f46e5', tension: 0.3, borderWidth: 2, pointRadius: 3 }] },
                    options: { animation: false, responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } },
                    plugins: [{
                        id: 'targetZone',
                        beforeDraw: (chart) => {
                            const { ctx, chartArea: { left, right }, scales: { y } } = chart;
                            ctx.save();
                            ctx.fillStyle = 'rgba(34, 197, 94, 0.08)'; ctx.fillRect(left, y.getPixelForValue(100), right - left, y.getPixelForValue(85) - y.getPixelForValue(100));
                            ctx.fillStyle = 'rgba(234, 179, 8, 0.08)'; ctx.fillRect(left, y.getPixelForValue(85), right - left, y.getPixelForValue(70) - y.getPixelForValue(85));
                            ctx.restore();
                        }
                    }]
                });
            }
        }, 50);
    },

    hideContractorDetailView() {
        const detailChart = _chartInstances()['chart_detail_line'];
        if (detailChart && typeof detailChart.destroy === 'function') {
            try { detailChart.destroy(); } catch (e) { /* ignore */ }
        }
        try { delete _chartInstances()['chart_detail_line']; } catch (e) { /* ignore */ }
        window.currentDetailedContractor = null;
        document.getElementById('contractors-main-view').classList.remove('hidden');
        document.getElementById('contractor-detail-view').classList.add('hidden');
        window.scrollTo(0, 0);
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: старый рейтинг (оставлен для
    // совместимости, если где-то вызывается).
    // =========================================================================
    renderRatingTab() {
        const listDiv = document.getElementById('rating-list');
        const emptyMsg = document.getElementById('rating-empty-msg');
        if (!listDiv) return;

        const data = getFilteredAnalyticsData();

        if (data.length === 0) { listDiv.innerHTML = ''; emptyMsg.style.display = 'block'; return; }
        emptyMsg.style.display = 'none';

        const grouped = {};
        data.forEach(item => { const cName = item.contractorName || _t('quality.analytics.fallback.unspecified', 'Не указан'); if (!grouped[cName]) grouped[cName] = []; grouped[cName].push(item); });

        const ratingData = [];
        for (let cName in grouped) {
            const metrics = getContractorMetrics(grouped[cName], _templates().getUserTemplates());
            if (metrics) ratingData.push({ name: cName, metrics: metrics });
        }

        if (ratingData.length === 0) {
            listDiv.innerHTML = '<p class="text-sm text-[var(--text-muted)] text-center bg-[var(--card-bg)] border border-[var(--card-border)] p-6 rounded-xl shadow-sm">' + _t('quality.analytics.empty.rating_min', 'Недостаточно данных. Для рейтинга нужно минимум 3 проверки по одному виду работ.') + '</p>';
            return;
        }

        ratingData.sort((a, b) => {
            if (b.metrics.finalC !== a.metrics.finalC) return b.metrics.finalC - a.metrics.finalC;
            if (b.metrics.stabilityIndex !== a.metrics.stabilityIndex) return b.metrics.stabilityIndex - a.metrics.stabilityIndex;
            return a.metrics.rateB3 - b.metrics.rateB3;
        });

        listDiv.innerHTML = ratingData.map((r, index) => {
            const isGold = index === 0; const isSilver = index === 1; const isBronze = index === 2;
            const rankClass = isGold ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-white border-yellow-500' : (isSilver ? 'bg-gradient-to-br from-slate-300 to-slate-500 text-white border-slate-400' : (isBronze ? 'bg-gradient-to-br from-orange-400 to-orange-700 text-white border-orange-600' : 'bg-slate-100 text-muted border-surface'));

            return `
            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 mb-4 shadow-sm relative overflow-hidden">
                ${isGold ? `<div class="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-rbi-caption font-black px-3 py-1 rounded-bl-lg uppercase shadow-sm z-10">🏆 ${_t('quality.analytics.rating.leader', 'Лидер')}</div>` : ''}
                <div class="flex items-start gap-3 border-b border-[var(--card-border)] pb-3 mb-3">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xl shadow-inner shrink-0 border ${rankClass}">${index + 1}</div>
                    <div class="flex-1 min-w-0">
                        <div class="text-rbi-title font-black leading-tight truncate text-ink dark:text-white">${r.name}</div>
                        <span class="mt-1 inline-block px-1.5 py-0.5 rounded border border-[var(--card-border)] text-rbi-caption uppercase tracking-wide text-muted font-bold">${_t('quality.analytics.rating.window_n', 'Окно N={n}', { n: r.metrics.count })}</span>
                    </div>
                    <div class="text-right shrink-0">
                        <div class="text-3xl font-black leading-none ${r.metrics.finalC < 70 ? 'text-danger' : (r.metrics.finalC < 85 ? 'text-orange-500' : 'text-green-600')}">${r.metrics.finalC}%</div>
                        ${(r.metrics.documentaryC !== null && r.metrics.documentaryC !== undefined) ? `<div class="text-rbi-caption font-black text-brand leading-none mt-0.5">Док: ${r.metrics.documentaryC}%</div>` : ''}
                        <span class="${r.metrics.riskCls} text-rbi-caption uppercase block mt-1 font-bold">${r.metrics.riskStatus}</span>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2 text-rbi-caption font-bold mb-3 pb-3 border-b border-[var(--card-border)]">
                    <div class="bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--card-border)] flex justify-between items-center"><span class="text-[var(--text-muted)]">${_t('quality.analytics.rating.share_b3', 'Доля B3:')}</span> <span class="${r.metrics.rateB3 > 0 ? 'text-danger' : 'text-green-600'}">${r.metrics.rateB3.toFixed(1)}%</span></div>
                    <div class="bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--card-border)] flex justify-between items-center"><span class="text-[var(--text-muted)]">${_t('quality.analytics.rating.repeat_b2', 'Повтор B2:')}</span> <span class="${r.metrics.maxFailRate >= 20 ? 'text-orange-600' : 'text-ink'}">${r.metrics.maxFailRate.toFixed(1)}%</span></div>
                    <div class="bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--card-border)] flex justify-between items-center cursor-help" title="${r.metrics.stabDesc}"><span class="text-[var(--text-muted)] border-b border-dashed border-slate-300">${_t('quality.analytics.rating.stab_index', 'Индекс стаб.:')}</span> <span class="font-black ${r.metrics.stabColor}">${r.metrics.stabilityIndex} <span class="text-rbi-caption uppercase font-bold">(${r.metrics.stabText})</span></span></div>
                    <div class="bg-[var(--hover-bg)] p-2 rounded-lg border border-[var(--card-border)] flex justify-between items-center"><span class="text-[var(--text-muted)]">${_t('quality.analytics.rating.volatility', 'Волатильность:')}</span> <span class="${r.metrics.volatility > 15 ? 'text-danger' : 'text-ink'}">${r.metrics.volatility.toFixed(1)}</span></div>
                </div>
                <div class="text-rbi-caption font-bold ${r.metrics.finalC < 70 || r.metrics.n_изделий_с_B3 > 0 ? 'bg-danger-soft text-danger border-danger-soft/20' : (r.metrics.finalC < 85 ? 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-900/20' : 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20')} p-2.5 rounded-lg border shadow-sm leading-snug">
                    <span class="uppercase text-rbi-caption block mb-0.5 opacity-70">${_t('quality.analytics.rating.basis', 'Основание:')}</span> ${r.metrics.reason}
                </div>
            </div>`;
        }).join('');
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: система фотогалерей
    // (горизонтальная лента с поддержкой ОК).
    // =========================================================================
    initPhotoGallery(galleryId, photosArray, isCrit, customBadgeClass = null, customBadgeText = null) {
        if (!photosArray || photosArray.length === 0) return '<div class="text-xs text-muted">' + _t('quality.analytics.gallery.none', 'Нет фото') + '</div>';

        const badgeColor = customBadgeClass ? customBadgeClass : (isCrit ? 'text-danger bg-danger-soft border-danger-soft' : 'text-orange-700 bg-orange-100 border-orange-200');
        const badgeText = customBadgeText ? customBadgeText : (isCrit ? 'B3' : 'B2');

        // Перезапись (не накопление) — новый вызов initPhotoGallery с тем же
        // galleryId (следующий рендер вкладки/фильтра) полностью заменяет
        // предыдущий полный набор.
        _galleryFullData.set(galleryId, { photosArray, badgeColor, badgeText, shown: Math.min(ANALYTICS_GALLERY_PAGE_SIZE, photosArray.length) });

        const page = photosArray.slice(0, ANALYTICS_GALLERY_PAGE_SIZE);
        const cardsHtml = page.map((d, i) => _renderPhotoCardHtml(d, i, galleryId, badgeColor, badgeText)).join('');
        const remaining = photosArray.length - page.length;

        const loadMoreBtnHtml = remaining > 0
            ? `<button type="button" data-analytics-action="loadMorePhotos" data-action-arg="${galleryId}" class="shrink-0 snap-start self-center w-24 h-24 sm:h-32 flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--card-border)] bg-[var(--hover-bg)] text-rbi-caption font-bold text-[var(--text-muted)] active:scale-95">
                <span class="text-lg">＋</span>
                <span>${_t('quality.analytics.gallery.more', 'Ещё ({n})', { n: remaining })}</span>
            </button>`
            : '';

        const renderGen = _analyticsRenderGen;
        setTimeout(() => {
            if (renderGen !== _analyticsRenderGen) return;
            _hydrateGalleryPhotos(galleryId, page.map((d, i) => ({ photoRef: d.photo, idx: i })), renderGen);
        }, 0);

        return `
            <div id="gallery-wrap-${galleryId}" class="w-full relative">
                <div class="flex gap-3 overflow-x-auto snap-x custom-scrollbar pb-4 pt-1">
                    ${cardsHtml}${loadMoreBtnHtml}
                </div>
            </div>
        `;
    },

    /**
     * Повторная гидрация уже смонтированной галереи (возврат на desk-подвкладку
     * после revoke blob: в PhotoManager LRU).
     */
    rehydratePhotoGallery(galleryId) {
        const wrap = document.getElementById('gallery-wrap-' + galleryId);
        if (!wrap) return;
        const entry = _galleryFullData.get(galleryId);
        const placeholder = window.rbiPhotoPlaceholder || '';
        const hydrateEntries = [];
        wrap.querySelectorAll('img[data-photo-idx]').forEach(function (img) {
            const idx = Number(img.getAttribute('data-photo-idx'));
            let photoRef = null;
            if (entry && entry.photosArray && entry.photosArray[idx]) {
                photoRef = entry.photosArray[idx].photo;
            }
            if (!photoRef) photoRef = img.getAttribute('data-local-src') || '';
            if (Array.isArray(photoRef)) photoRef = photoRef[0];
            if (!photoRef) {
                if (img.src && String(img.src).indexOf('blob:') === 0) img.src = placeholder;
                return;
            }
            if (_photoThumbCache.has(photoRef)) _photoThumbCache.delete(photoRef);
            const safe = (typeof window.rbiEscapeAttr === 'function')
                ? window.rbiEscapeAttr(photoRef)
                : String(photoRef).replace(/"/g, '&quot;');
            img.setAttribute('data-local-src', safe);
            img.src = placeholder;
            hydrateEntries.push({ photoRef: photoRef, idx: idx });
        });
        if (hydrateEntries.length) {
            _hydrateGalleryPhotos(galleryId, hydrateEntries, _analyticsRenderGen);
        }
    },

    // Обратная совместимость сигнатуры window-биндинга loadMorePhotos
    // (см. конец файла) — реальная реализация делегирует в module-scope
    // _loadMorePhotosImpl, работающую напрямую с _galleryFullData/DOM.
    loadMorePhotos(galleryId) {
        _loadMorePhotosImpl(galleryId);
    },

    // =========================================================================
    // Перенесено из analytics.legacy.js: список отчётов (архив, вкладка
    // История → Отчёты).
    // =========================================================================
    renderReportsList() {
        const listDiv = document.getElementById('reports-list');
        if (!listDiv) return;

        // Тумблер режима — всегда (и при пустом списке), scope = reports.
        const reportsToggleHostEarly = document.getElementById('reports-view-mode-toggle');
        const kbToggleHtmlEarly = window.kbViewModeToggleHtml;
        if (reportsToggleHostEarly && typeof kbToggleHtmlEarly === 'function') {
            reportsToggleHostEarly.innerHTML = kbToggleHtmlEarly('reports');
        }

        if (_reports().getAllSync().length === 0) {
            listDiv.innerHTML = `<div class="text-center py-10 text-muted font-bold text-rbi-label uppercase tracking-widest bg-[var(--card-bg)] rounded-xl border border-dashed border-[var(--card-border)] shadow-sm">${_t('quality.analytics.reports.empty', 'Сохраненных отчетов пока нет.')}</div>`;
            return;
        }

        const expandedProjects = _captureExpandedReports(listDiv);

        // Считываем текущие глобальные фильтры
        const fSearch = document.getElementById('hist-search-text')?.value.toLowerCase() || '';
        const fPeriod = document.getElementById('hist-filter-period')?.value || 'D30';

        // ИСПРАВЛЕНИЕ (см. current_plan.md, блок "UI вкладки «Отчёты»", баг
        // "глобальные фильтры не действуют на вкладке Отчёты"): _historyFilters()
        // приоритетно читает window.HistoryState.filters, в который мультифильтр
        // Объект/Подрядчик/Инспектор никогда не пишет (тот же split-brain, что уже
        // был обойдён для вкладки «Проверки» — см. history.render.js:186-198).
        // Источник правды — window.activeMultiFilters.history напрямую.
        const _histMultiFilters = (window.activeMultiFilters && window.activeMultiFilters.history) || {};
        const fProj = _histMultiFilters.project || [];
        const fContr = _histMultiFilters.contractor || [];
        const fInsp = _histMultiFilters.inspector || [];

        // Применяем фильтры
        let filteredArr = [..._reports().getAllSync()].filter(r => !r.is_deleted);
        const now = new Date();

        if (fSearch) {
            filteredArr = filteredArr.filter(r =>
                (r.title && r.title.toLowerCase().includes(fSearch)) ||
                (r.metadata?.project && r.metadata.project.toLowerCase().includes(fSearch))
            );
        }

        if (fProj.length > 0) {
            filteredArr = filteredArr.filter(r => {
                const p = r.metadata?.project || '';
                // Отчет может быть "Все объекты" или конкретный. Если "Все", показываем, иначе сверяем.
                return p.includes('Все объекты') || fProj.includes(p) || fProj.some(proj => p.includes(proj));
            });
        }

        if (fContr.length > 0) {
            // Подрядчик обычно пишется в названии отчета
            filteredArr = filteredArr.filter(r => {
                const t = r.title || '';
                return fContr.some(c => t.includes(c));
            });
        }

        if (fInsp.length > 0) {
            // Ищем по автору отчета
            filteredArr = filteredArr.filter(r => fInsp.includes(r.created_by));
        }

        if (fPeriod !== 'ALL') {
            const histDays = typeof getAnalyticsPeriodDays === 'function'
                ? getAnalyticsPeriodDays(fPeriod)
                : null;
            if (histDays) {
                const from = new Date(now);
                from.setDate(now.getDate() - histDays);
                filteredArr = filteredArr.filter(i => new Date(i.generated_at) >= from);
            }
        }

        if (filteredArr.length === 0) {
            listDiv.innerHTML = `<div class="text-center py-10 text-muted font-bold text-rbi-label uppercase tracking-widest bg-[var(--card-bg)] rounded-xl border border-dashed border-[var(--card-border)] shadow-sm">${_t('quality.analytics.reports.empty_filtered', 'По выбранным фильтрам отчетов не найдено.')}</div>`;
            return;
        }

        // Сортировка по дате (самые свежие сверху)
        const sorted = filteredArr.sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at));

        // Группировка Объект → Тип отчёта (P2-0039; как Объект → Подрядчик во вкладке «Проверки»).
        const grouped = {};
        sorted.forEach(r => {
            const pName = r.metadata?.project || _t('quality.analytics.reports.summary_default', 'Сводный Отчет');
            if (!grouped[pName]) grouped[pName] = [];
            grouped[pName].push(r);
        });
        const collator = new Intl.Collator('ru');
        const groupKeys = Object.keys(grouped).sort(collator.compare);

        const getViewMode = window.getKnowledgeViewMode;
        const isListView = (typeof getViewMode === 'function' ? getViewMode('reports') : 'cards') === 'list';
        const itemsWrapClass = isListView ? 'flex flex-col gap-1.5' : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3';
        const hiddenRevealClass = isListView ? 'flex' : 'grid';

        let groupIndex = 0;
        const kindGroupHtml = (pKey, kind, items, open) => {
            const safeGroupId = `reports-group-${groupIndex++}`;
            const visibleItems = items.slice(0, REPORTS_GROUP_PAGE_SIZE);
            const hiddenItems = items.slice(REPORTS_GROUP_PAGE_SIZE);
            const cardsHtml = visibleItems.map(r => AnalyticsRender._renderReportCard(r, isListView)).join('');
            let hiddenBlockHtml = '';
            if (hiddenItems.length > 0) {
                const hiddenId = `${safeGroupId}-hidden`;
                hiddenBlockHtml = `<div id="${hiddenId}" class="hidden ${itemsWrapClass} mt-3">${hiddenItems.map(r => AnalyticsRender._renderReportCard(r, isListView)).join('')}</div>
                <button onclick="document.getElementById('${hiddenId}').classList.remove('hidden'); document.getElementById('${hiddenId}').classList.add('${hiddenRevealClass}'); this.style.display='none'" class="w-full bg-[var(--hover-bg)] text-muted py-2 mt-3 rounded-lg text-rbi-caption font-bold uppercase active:scale-95 transition-colors border border-dashed border-[var(--card-border)]">${_t('quality.analytics.reports.show_more_n', 'Показать ещё отчёты ({n})', { n: hiddenItems.length })}</button>`;
            }
            return `
                <div class="border border-[var(--card-border)] rounded-[10px] bg-[var(--card-bg)] overflow-hidden">
                    <div class="flex justify-between items-center px-2.5 py-2 cursor-pointer active:bg-[var(--hover-bg)] transition-colors select-none" onclick="AnalyticsRender._toggleReportsGroup(this)">
                        <div class="reports-kind-title text-rbi-label font-bold text-ink dark:text-white truncate min-w-0 pr-2">${reportKindLabel(kind, _t)}</div>
                        <div class="flex items-center gap-1.5 shrink-0">
                            <span class="text-rbi-caption font-bold text-muted bg-[var(--hover-bg)] px-1.5 py-0.5 rounded-md border border-[var(--card-border)]">${items.length} ${_t('quality.analytics.chart.pcs', 'шт')}</span>
                            <svg class="w-4 h-4 text-muted transition-transform duration-300 transform chevron-icon" style="transform: rotate(${open ? 180 : 0}deg)" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                    <div id="${safeGroupId}" data-rep-grp-body="${_escAttr(pKey + '|k:' + kind)}" class="${open ? '' : 'hidden '}border-t border-[var(--card-border)] p-2">
                        <div class="${itemsWrapClass}">${cardsHtml}</div>
                        ${hiddenBlockHtml}
                    </div>
                </div>`;
        };

        const groupsHtml = groupKeys.map(pName => {
            const items = grouped[pName];
            const safeGroupId = `reports-group-${groupIndex++}`;
            const pKey = `p:${pName}`;
            const byKind = new Map();
            items.forEach(r => {
                const k = reportKindOf(r);
                if (!byKind.has(k)) byKind.set(k, []);
                byKind.get(k).push(r);
            });
            const kinds = orderKindGroups(new Map([...byKind].map(([k, list]) => [k, list.length])));
            const kindsHtml = kinds.map(k => kindGroupHtml(pKey, k, byKind.get(k), kinds.length === 1)).join('');

            return `
            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-[14px] shadow-sm mb-2 overflow-hidden">
                <div class="flex justify-between items-center p-2.5 cursor-pointer active:bg-[var(--hover-bg)] transition-colors select-none" onclick="AnalyticsRender._toggleReportsGroup(this)">
                    <div class="flex items-center gap-2.5 min-w-0 pr-2">
                        <div class="w-8 h-8 bg-brand-soft/30 text-brand rounded-[10px] flex items-center justify-center shrink-0 border border-brand-soft">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                        </div>
                        <div class="min-w-0">
                            <div class="reports-group-title text-rbi-body font-black text-ink dark:text-white truncate leading-tight">${pName}</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0 pl-1">
                        <span class="text-rbi-caption font-bold text-muted bg-[var(--hover-bg)] px-1.5 py-0.5 rounded-md border border-[var(--card-border)]">${items.length} ${_t('quality.analytics.chart.pcs', 'шт')}</span>
                        <svg class="w-4 h-4 text-muted transition-transform duration-300 transform rotate-0 chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
                <div id="${safeGroupId}" data-rep-grp-body="${_escAttr(pKey)}" class="hidden border-t border-[var(--card-border)] bg-surface/30 p-2.5 flex flex-col gap-2">${kindsHtml}</div>
            </div>`;
        }).join('');

        listDiv.innerHTML = groupsHtml;
        const reportsToggleHost = document.getElementById('reports-view-mode-toggle');
        const kbToggleHtml = window.kbViewModeToggleHtml;
        if (reportsToggleHost && typeof kbToggleHtml === 'function') {
            reportsToggleHost.innerHTML = kbToggleHtml('reports');
        }
        _restoreExpandedReports(listDiv, expandedProjects);
    },

    // P2-0039: раскрыть/свернуть группу отчётов (объект или тип внутри объекта).
    _toggleReportsGroup(head) {
        const body = head && head.nextElementSibling;
        if (body) _setReportsGroupOpen(body, body.classList.contains('hidden'));
    },

    _reportCardAuthor(r) {
        return String(r.created_by || r.engineer_name || r.metadata?.author || _t('quality.analytics.fallback.engineer', 'Инженер')).trim() || _t('quality.analytics.fallback.engineer', 'Инженер');
    },

    _reportCardPeriod(r) {
        const raw = r.metadata?.period || r.metadata?.periodLabel || '';
        return String(raw).trim() || _t('quality.analytics.reports.period_unknown', 'Период не указан');
    },

    _renderReportCard(r, isListView) {
        const syncBadge = getSyncBadgeHtml(r);
        const isOwner = !r.created_by || r.created_by === (_getSetting('engineerName') || _t('quality.analytics.fallback.engineer', 'Инженер'));
        const docKind = reportKindOf(r);
        const safeTitle = String(r.title || '').replace(/'/g, "\\'");
        const dateStr = new Date(r.generated_at).toLocaleDateString('ru-RU');
        const sizeStr = ((r.file_size || 0) / 1024 / 1024).toFixed(2) + ' MB';
        const author = AnalyticsRender._reportCardAuthor(r);
        const period = AnalyticsRender._reportCardPeriod(r);
        const isPptx = (r.mime_type && String(r.mime_type).includes('presentation'))
            || r.report_type === 'pptx'
            || /\.pptx$/i.test(String(r.title || ''));
        const fileTypeLabel = isPptx ? 'PPTX' : 'PDF';
        const fileTypeColor = isPptx ? 'text-orange-600' : 'text-brand';
        const fileTypeBar = isPptx ? 'bg-orange-500' : 'bg-brand';

        if (isListView) {
            return `
            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm flex items-center gap-2.5 p-2 active:scale-[0.99] transition-transform relative cursor-pointer" onclick="openReport('${r.id}')">
                <input type="checkbox" class="report-checkbox w-4 h-4 accent-indigo-600 rounded cursor-pointer shrink-0" value="${r.id}" onclick="event.stopPropagation()">
                <div class="w-9 h-9 rounded-lg shrink-0 bg-surface border border-[var(--card-border)] flex items-center justify-center"><span class="text-rbi-caption font-black ${fileTypeColor}">${fileTypeLabel}</span></div>
                <div class="min-w-0 flex-1">
                    <div class="text-rbi-body font-black text-ink dark:text-white truncate">${r.title}</div>
                    <div class="text-rbi-caption font-bold text-muted truncate mt-0.5">${docKind !== REPORT_KIND_OTHER ? reportKindLabel(docKind, _t) + ' · ' : ''}${_t('quality.analytics.reports.author', 'Автор:')} ${author} · ${dateStr}</div>
                    <div class="text-rbi-caption font-bold text-muted truncate">${_t('quality.analytics.reports.period', 'Период:')} ${period}</div>
                </div>
                <div class="shrink-0">${syncBadge}</div>
                <button onclick="event.stopPropagation(); openUniversalActionSheet('${r.id}', 'report', '${safeTitle}', ${isOwner})" class="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-muted hover:bg-[var(--hover-bg)] active:scale-90">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
                </button>
            </div>`;
        }

        const docKindTag = docKind !== REPORT_KIND_OTHER ? `<div class="text-rbi-caption font-bold text-muted truncate mb-0.5">${reportKindLabel(docKind, _t)}</div>` : '';
        return `
            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden flex flex-col active:scale-[0.98] transition-transform relative cursor-pointer" onclick="openReport('${r.id}')">
                <input type="checkbox" class="report-checkbox absolute top-2 left-2 w-5 h-5 accent-indigo-600 rounded cursor-pointer z-10" value="${r.id}" onclick="event.stopPropagation()">
                <div class="h-24 border-b border-[var(--card-border)] bg-surface flex items-center justify-center relative">
                    <div class="w-12 h-14 bg-surface rounded-lg shadow-sm border border-surface flex flex-col justify-between p-1.5 relative overflow-hidden">
                        <div class="absolute top-0 left-0 right-0 h-4 ${fileTypeBar} flex items-center justify-center"><span class="text-rbi-caption text-white font-black tracking-widest">${fileTypeLabel}</span></div>
                        <div class="space-y-1 mt-5">
                            <div class="h-0.5 bg-surface rounded w-full"></div>
                            <div class="h-0.5 bg-surface rounded w-5/6"></div>
                            <div class="h-0.5 bg-surface rounded w-4/6"></div>
                        </div>
                    </div>
                    <button onclick="event.stopPropagation(); openUniversalActionSheet('${r.id}', 'report', '${safeTitle}', ${isOwner})" class="absolute top-2 right-2 w-8 h-8 bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 rounded-full flex items-center justify-center text-muted active:scale-90 transition-transform">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
                    </button>
                </div>
                <div class="p-3 flex flex-col flex-1 min-w-0">
                    ${docKindTag}
                    <div class="text-rbi-body font-black text-ink dark:text-white leading-tight mb-2 line-clamp-2">${r.title}</div>
                    <div class="text-rbi-caption font-bold text-muted truncate mb-0.5">${_t('quality.analytics.reports.author', 'Автор:')} ${author}</div>
                    <div class="text-rbi-caption font-bold text-muted truncate mb-1">${_t('quality.analytics.reports.period', 'Период:')} ${period}</div>
                    <div class="mt-auto pt-2 flex justify-between items-center gap-2">
                        <div class="flex items-center gap-1 text-rbi-caption font-bold text-muted min-w-0">${sizeStr} ${syncBadge}</div>
                        <div class="text-rbi-caption font-black text-muted shrink-0">${dateStr}</div>
                    </div>
                </div>
            </div>`;
    },

    sortGalleryNewestFirst: _sortGalleryNewestFirst
};

if (typeof window !== 'undefined') {
    window.AnalyticsRender = AnalyticsRender;
    window.buildRiskZonesInsightFromChecks = buildRiskZonesInsightFromChecks;
    window.buildRiskZonesInsight = buildRiskZonesInsight;

    // =========================================================================
    // МОНТАЖ РАЗМЕТКИ ВКЛАДКИ «АНАЛИТИКА» (перенос из index.html:619-974,
    // Блок 2 инициативы «Перенос статичной разметки quality в JS-рендер»).
    // По прецеденту Блока 1/N (`audit`) — на верхнем уровне модуля, до
    // DOMContentLoaded. Grep подтвердил отсутствие top-level bootstrap:*-
    // подписок в файлах фичи — тайминг здесь не критичен, но паттерн
    // сохранён для консистентности.
    // =========================================================================
    (function mountAnalyticsMarkup() {
        ensureAnalyticsMarkup();
    }());

    // =========================================================================
    // WINDOW-ПРОКСИ (обратная совместимость: index.html inline-обработчики,
    // динамически генерируемый HTML — onclick в строках, генерируемых
    // renderContractorsSubTab/showContractorDetailView/renderReportsList).
    // =========================================================================
    window.renderCurrentAnalyticsTab = AnalyticsRender.renderCurrentAnalyticsTab.bind(AnalyticsRender);
    // Методы на уже существующем window.AnalyticsRender — без новых top-level window.*.
    AnalyticsRender.sectionLooksPainted = analyticsSectionLooksPainted;
    AnalyticsRender.sourceDataIsStale = analyticsSourceDataIsStale;
    AnalyticsRender.ensurePhotoGalleries = rbiEnsureAnalyticsPhotoGalleries;
    window.renderAnalyticsModeSwitcher = AnalyticsRender.renderAnalyticsModeSwitcher.bind(AnalyticsRender);
    window.renderOnePagerModeToggle = AnalyticsRender.renderOnePagerModeToggle.bind(AnalyticsRender);
    window.updateAnalyticsFilters = AnalyticsRender.updateAnalyticsFilters.bind(AnalyticsRender);
    window.renderContractorsSubTab = AnalyticsRender.renderContractorsSubTab.bind(AnalyticsRender);
    window.renderContractorsListOnly = AnalyticsRender.renderContractorsListOnly.bind(AnalyticsRender);
    window.renderOnePagerSubTab = AnalyticsRender.renderOnePagerSubTab.bind(AnalyticsRender);
    window.renderGlobalOnePager = AnalyticsRender.renderGlobalOnePager.bind(AnalyticsRender);
    window.showContractorDetailView = AnalyticsRender.showContractorDetailView.bind(AnalyticsRender);
    window.hideContractorDetailView = AnalyticsRender.hideContractorDetailView.bind(AnalyticsRender);
    window.renderRatingTab = AnalyticsRender.renderRatingTab.bind(AnalyticsRender);
    window.initPhotoGallery = AnalyticsRender.initPhotoGallery.bind(AnalyticsRender);
    window.loadMorePhotos = AnalyticsRender.loadMorePhotos.bind(AnalyticsRender);
    window.renderReportsList = AnalyticsRender.renderReportsList.bind(AnalyticsRender);
}


function refreshAnalyticsStaticChromeI18n() {
  function setOpt(sel, value, label) {
    if (!sel) return;
    var o = sel.querySelector('option[value="' + value + '"]');
    if (o) o.textContent = label;
  }
  function setBtnLabel(id, text) {
    var btn = document.getElementById(id);
    if (!btn) return;
    var span = btn.querySelector('.truncate') || btn.querySelector('span');
    if (span) span.textContent = text;
  }
  var period = document.getElementById('global-filter-period');
  setOpt(period, 'D7', _t('quality.analytics.period.d7', 'За 7 дней'));
  setOpt(period, 'D14', _t('quality.analytics.period.d14', 'За 14 дней'));
  setOpt(period, 'D30', _t('quality.analytics.period.d30', 'За 30 дней'));
  setOpt(period, 'D90', _t('quality.analytics.period.d90', 'За 90 дней'));
  setOpt(period, 'D180', _t('quality.analytics.period.d180', 'За 180 дней'));
  setOpt(period, 'ALL', _t('quality.analytics.period.all', 'Всё время'));
  setOpt(period, 'CUSTOM', _t('quality.analytics.period.custom', 'Свой период...'));
  var histPeriod = document.getElementById('hist-filter-period');
  setOpt(histPeriod, 'D7', _t('quality.analytics.period.d7', 'За 7 дней'));
  setOpt(histPeriod, 'D14', _t('quality.analytics.period.d14', 'За 14 дней'));
  setOpt(histPeriod, 'D30', _t('quality.analytics.period.d30', 'За 30 дней'));
  setOpt(histPeriod, 'D90', _t('quality.analytics.period.d90', 'За 90 дней'));
  setOpt(histPeriod, 'D180', _t('quality.analytics.period.d180', 'За 180 дней'));
  setOpt(histPeriod, 'ALL', _t('quality.analytics.period.all', 'Всё время'));
  if (period && period.selectedIndex >= 0) {
    setBtnLabel('btn-ana-period-label', period.options[period.selectedIndex].text);
  }
  if (histPeriod && histPeriod.selectedIndex >= 0) {
    setBtnLabel('btn-hist-period-label', histPeriod.options[histPeriod.selectedIndex].text);
  }
  setBtnLabel('btn-ana-project', _t('quality.analytics.filter.all_projects', 'Все объекты'));
  setBtnLabel('btn-ana-contractor', _t('quality.analytics.filter.all_contractors', 'Все подрядчики'));
  setBtnLabel('btn-ana-inspector', _t('quality.analytics.filter.all_inspectors', 'Все инспекторы'));
  setBtnLabel('btn-ana-template', _t('quality.analytics.filter.all_templates', 'Все виды работ'));
  setBtnLabel('btn-hist-project', _t('quality.analytics.filter.all_projects', 'Все объекты'));
  setBtnLabel('btn-hist-contractor', _t('quality.analytics.filter.all_contractors', 'Все подрядчики'));
  setBtnLabel('btn-hist-inspector', _t('quality.analytics.filter.all_inspectors', 'Все инспекторы'));
  setBtnLabel('btn-hist-template', _t('quality.analytics.filter.all_templates', 'Все виды работ'));
  var chips = document.getElementById('contractors-chips-container');
  if (chips) {
    var map = { ALL: _t('quality.analytics.chip.all', 'Все'), CRITICAL: '🔴 ' + _t('quality.analytics.chip.critical', 'Критичные'), WARNING: '🟡 ' + _t('quality.analytics.chip.warning', 'Внимания'), STABLE: '🟢 ' + _t('quality.analytics.chip.stable', 'Стабильные'), NEW: '⚪ ' + _t('quality.analytics.chip.new', 'Новые (Сбор)') };
    chips.querySelectorAll('.contr-chip[data-action-arg]').forEach(function (btn) {
      var k = btn.getAttribute('data-action-arg');
      if (map[k]) btn.textContent = map[k];
    });
  }
  var hc = document.getElementById('btn-hist-checks');
  var hr = document.getElementById('btn-hist-reports');
  var hp = document.getElementById('btn-hist-plans');
  if (hc) hc.textContent = _t('quality.analytics.hist.checks', 'Проверки');
  if (hr) hr.textContent = _t('quality.analytics.hist.reports', 'Отчеты');
  if (hp) hp.textContent = _t('quality.analytics.hist.plans', 'Планы');
}

(function bindAnalyticsI18n() {
  if (window.__rbiAnalyticsI18nBound) return;
  if (!(window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function')) return;
  window.__rbiAnalyticsI18nBound = true;
  window.RBI.events.on('i18n:localeChanged', function () {
    try {
      var tab = document.getElementById('tab-analytics');
      if (!tab) return;
      if (window.RBI.services && window.RBI.services.i18n && typeof window.RBI.services.i18n.applyDom === 'function') {
        window.RBI.services.i18n.applyDom(tab);
      }
      refreshAnalyticsStaticChromeI18n();
      if (!tab.classList.contains('hidden') && typeof window.renderCurrentAnalyticsTab === 'function') {
        window.renderCurrentAnalyticsTab();
      }
    } catch (_e) { /* ignore */ }
  });
})();

console.log('[AnalyticsRender] analytics.render.js loaded (owner-module: full render logic)');
