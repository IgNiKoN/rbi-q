/**
 * sk.module.js
 * Модуль СК (Стройконтроль) — контракт платформы (id / routes / dependencies / init / mount / unmount).
 *
 * Оркестратор: загружает данные через SKActions.loadData(),
 * заполняет SKState и глобальные переменные для обратной совместимости,
 * эмитит sk:initialized, подписывается на sync:completed.
 *
 * Зависимости: window.RBI.services.sk, window.RBI.services.storage
 */

import { SKState } from './sk.state.js';
import {
    SKActions,
    sk_similarity,
    sk_cleanContractorName,
    sk_extractStandards,
    sk_normalizeCategoryKey,
    sk_sortHrTable,
    sk_loadData,
    sk_clearData,
    sk_switchView,
    sk_addVolume,
    sk_deleteVolume,
    sk_handleExcelImport,
    sk_executeImport,
    sk_resolvePair,
    sk_finalizeImport,
    sk_deleteRecord,
    sk_saveCategoryLink,
    sk_openContractorLinkModal,
    sk_saveContractorLink,
    sk_generateAnomalyTasks,
    sk_computeIsdSnapshot,
    sk_evaluateIsdXpRewards
} from './sk.actions.js';
import {
    SKRender,
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
} from './sk.render.js';
import { sk_renderLinks, sk_setPlaceFilter } from './sk.links.js';

// Публичная граница модуля sk — единственная точка, присваивающая на window
// (по образцу ai.module.js).
window.sk_extractStandards = sk_extractStandards;
// P2-0076: подбор похожих для «Разобрать» — тот же, что у импорта
window.sk_similarity = sk_similarity;
window.sk_cleanContractorName = sk_cleanContractorName;
window.sk_renderLinks = sk_renderLinks;
window.sk_setPlaceFilter = sk_setPlaceFilter;
window.sk_normalizeCategoryKey = sk_normalizeCategoryKey;
window.sk_sortHrTable = sk_sortHrTable;
window.sk_loadData = sk_loadData;
window.sk_clearData = sk_clearData;
window.sk_switchView = sk_switchView;
window.sk_addVolume = sk_addVolume;
window.sk_deleteVolume = sk_deleteVolume;
window.sk_handleExcelImport = sk_handleExcelImport;
window.sk_executeImport = sk_executeImport;
window.sk_resolvePair = sk_resolvePair;
window.sk_finalizeImport = sk_finalizeImport;
window.sk_deleteRecord = sk_deleteRecord;
window.sk_saveCategoryLink = sk_saveCategoryLink;
window.sk_openContractorLinkModal = sk_openContractorLinkModal;
window.sk_saveContractorLink = sk_saveContractorLink;
window.sk_generateAnomalyTasks = sk_generateAnomalyTasks;
window.sk_computeIsdSnapshot = sk_computeIsdSnapshot;
window.sk_evaluateIsdXpRewards = sk_evaluateIsdXpRewards;
window.sk_renderContractorQueueBanner = sk_renderContractorQueueBanner;
window.sk_renderMainTab = sk_renderMainTab;
window.sk_renderVolumes = sk_renderVolumes;
window.sk_showMappingModal = sk_showMappingModal;
window.sk_showNormalizationModal = sk_showNormalizationModal;
window.sk_renderDashboard = sk_renderDashboard;
window.sk_renderHrTab = sk_renderHrTab;
window.sk_showInfoModal = sk_showInfoModal;
window.sk_openCategoryLinkModal = sk_openCategoryLinkModal;
window.sk_closeContractorLinkModal = sk_closeContractorLinkModal;
window.sk_fillContractorSuggestion = sk_fillContractorSuggestion;
window.SKState = SKState;

// Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
// (см. _ai/INDEX_HTML_HANDLERS_MAP.md), namespace-per-module (data-sk-action).
function bindSkActionDelegation() {
    if (window.__skActionDelegationBound) return;
    window.__skActionDelegationBound = true;

    var dispatch = function (el, evt) {
        var action = el.dataset.skAction;
        var fn = window[action];
        if (typeof fn !== 'function') return;
        var valType = el.dataset.skActionValType;
        var arg = valType === 'event' ? evt : el.dataset.actionArg;
        if (arg === undefined) {
            fn();
        } else {
            fn(arg);
        }
    };

    var resolveActionElement = function (target, wantsChange) {
        var el = target;
        while (el && el.nodeType === 1) {
            if (el.dataset && el.dataset.skAction) {
                if (!!(el.dataset.actionEvent === 'change') === wantsChange) return el;
            }
            var inlineOnclick = el.getAttribute && el.getAttribute('onclick');
            if (!wantsChange && inlineOnclick && inlineOnclick.includes('stopPropagation')) return null;
            el = el.parentElement;
        }
        return null;
    };

    document.addEventListener('change', function (e) {
        var el = resolveActionElement(e.target, true);
        if (el) dispatch(el, e);
    }, true);
}

export const SKModule = {
    id: 'sk',
    routes: ['/sk', '/sk/:subTab'],
    dependencies: ['storage', 'sk'],

    _syncUnsubscribe: null,
    _renderRequestedUnsubscribe: null,

    /**
     * Инициализация: загружает все данные, подписывается на sync:completed.
     * Вызывается один раз при старте.
     */
    async init(ctx) {
        ctx.math      = window.RBI && window.RBI.utils && window.RBI.utils.math;
        ctx.toast     = window.RBI && window.RBI.utils && window.RBI.utils.toast;
        ctx.templates = window.RBI && window.RBI.utils && window.RBI.utils.templates;

        SKActions.bindCtx(ctx);

        bindSkActionDelegation();

        await SKActions.loadData();

        // sync:completed — данные в память; full-render только если ПК СК
        // не на экране (единый хелпер §5).
        var events = (ctx && ctx.events) || (window.RBI && window.RBI.events);
        if (events && typeof events.on === 'function') {
            var handler = async function () {
                await SKActions.loadData();
                if (window.RBI && window.RBI.utils && window.RBI.utils.syncUi && window.RBI.utils.syncUi.markDirty) {
                    window.RBI.utils.syncUi.markDirty('sk');
                } else if (window.syncDirtyFlags) {
                    window.syncDirtyFlags.sk = true;
                }
                // Не full-render ПК СК, если открыта любая Аналитика (в т.ч. Подрядчики):
                // иначе silent sync переписывает скрытый DOM и даёт jank на активном экране.
                if (typeof window.shouldDeferFullRender === 'function'
                    && window.shouldDeferFullRender(['sk', 'analytics'])) {
                    return;
                }
                SKRender.render(SKState.currentSubTab);
                if (window.syncDirtyFlags) window.syncDirtyFlags.sk = false;
            };
            events.on('sync:completed', handler);
            SKModule._syncUnsubscribe = function () {
                if (events.off) events.off('sync:completed', handler);
            };
        }

        // Подписка на sk:renderRequested — перерисовать без перезагрузки данных
        if (events && typeof events.on === 'function') {
            var onRenderRequested = function (payload) {
                var v = payload && payload.view;
                if (v === 'dashboard') { SKRender.renderDashboard(); }
                else if (v === 'banner') { if (typeof window.sk_renderContractorQueueBanner === 'function') window.sk_renderContractorQueueBanner(); }
                else { SKRender.renderMainTab(); }
            };
            events.on('sk:renderRequested', onRenderRequested);
            SKModule._renderRequestedUnsubscribe = function () {
                if (events.off) events.off('sk:renderRequested', onRenderRequested);
            };
        }

        if (events && typeof events.emit === 'function') {
            events.emit('sk:initialized', { records: SKState.records });
        }

        console.log('[SKModule] init complete, records:', SKState.records.length);
    },

    /**
     * Рендер UI — вызывает SKRender.render с текущей вкладкой.
     */
    mount(container, ctx) {
        var tab = (ctx && ctx.tab) || SKState.currentSubTab || 'dashboard';
        SKRender.render(tab);
    },

    /**
     * Очистка при уходе с вкладки.
     */
    unmount() {
        if (typeof SKModule._syncUnsubscribe === 'function') {
            SKModule._syncUnsubscribe();
            SKModule._syncUnsubscribe = null;
        }
        if (typeof SKModule._renderRequestedUnsubscribe === 'function') {
            SKModule._renderRequestedUnsubscribe();
            SKModule._renderRequestedUnsubscribe = null;
        }
    }
};

// Регистрация в реестре платформы (перезаписывает legacy-заглушку)
if (typeof window !== 'undefined' && window.RBI && window.RBI.registry) {
    window.RBI.registry.register('module.sk', SKModule);
}

console.log('[SKModule] sk.module.js loaded (ES module)');
