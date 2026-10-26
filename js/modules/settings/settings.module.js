/**
 * settings.module.js
 * Модуль настроек — контракт платформы (id / routes / dependencies / init / mount / unmount).
 *
 * Этот файл — оркестратор. Бизнес-логика остаётся в settings.legacy.js.
 * Загружается с type="module" (первый ES-модуль в проекте).
 *
 * Зависимости: window.RBI.services.settings, window.RBI.services.storage
 */

import { ChangelogModule, RBI_CHANGELOG, rbi_openChangelogModal, rbi_closeChangelogModal } from './features/changelog.js';
import {
    FeedbackModule,
    rbi_renderFeedbackTab,
    rbi_submitFeedback,
    rbi_sendIdeaFromPlaceholder,
    rbi_toggleFeedbackLike,
    rbi_deleteFeedback,
    rbi_editFeedback,
    rbi_saveEditedFeedback,
    rbi_renderDevFeedbackTab,
    rbi_updateFeedbackStatus,
    rbi_updateFeedbackNotes,
    rbi_exportFeedbackJson,
    rbi_addRoadmapItem,
    rbi_deleteRoadmapItem
} from './features/feedback.js';
import {
    AppUtilsModule,
    handleLogoUpload,
    removeBrandLogo,
    publishCorporateBranding,
    resetToCorporateBranding,
    applyContractorAliasToInspectionHistory,
    openNodeAttachmentPdf,
    AppModeManager,
    changeAppMode,
    revertToPreviousMode,
    togglePushSettings,
    initPushToggleState,
    purgeDataOutsideAssignedProjects,
    rbi_enrichDemoModeV2,
    startDemoMode,
    exitDemoMode
} from './features/app-mode-utils.js';
import { mountContractorDirectoryUI, ContractorDirectoryUI } from './features/contractor-directory-ui.js';
import { mountLocationDirectoryUI, LocationDirectoryUI } from './features/location-directory-ui.js';
import { mountContractorIdBackfillUI, ContractorIdBackfillUI } from './features/contractor-id-backfill-ui.js';
import { mountProjectIdBackfillUI, ProjectIdBackfillUI } from './features/project-id-backfill-ui.js';
import { mountCloudDeletedPurgeUI, CloudDeletedPurgeUI } from './features/cloud-deleted-purge-ui.js';
import { mountCloudOrphanUrlsUI, CloudOrphanUrlsUI } from './features/cloud-orphan-urls-ui.js';
import { mountRoleMatrixUI, RoleMatrixUI } from './features/role-matrix-ui.js';
import { mountOfficialTemplatesUI, OfficialTemplatesUI } from './features/official-templates-ui.js';
// Side-effect: window.* из feature/render (раньше — статичные <script> в index.html)
import './features/tutorial.js';
import './settings.render.js';
import './settings.desktop.render.js';

// Публикация имён 3 features-файлов на window.* — единственная точка модуля settings,
// имеющая право на это (см. _ai/ARCHITECTURE_BRIEF.md, «Публичная граница модуля»).
window.RBI_CHANGELOG = RBI_CHANGELOG;
window.rbi_openChangelogModal = rbi_openChangelogModal;
window.rbi_closeChangelogModal = rbi_closeChangelogModal;

window.rbi_renderFeedbackTab = rbi_renderFeedbackTab;
window.rbi_submitFeedback = rbi_submitFeedback;
window.rbi_sendIdeaFromPlaceholder = rbi_sendIdeaFromPlaceholder;
window.rbi_toggleFeedbackLike = rbi_toggleFeedbackLike;
window.rbi_deleteFeedback = rbi_deleteFeedback;
window.rbi_editFeedback = rbi_editFeedback;
window.rbi_saveEditedFeedback = rbi_saveEditedFeedback;
window.rbi_renderDevFeedbackTab = rbi_renderDevFeedbackTab;
window.rbi_updateFeedbackStatus = rbi_updateFeedbackStatus;
window.rbi_updateFeedbackNotes = rbi_updateFeedbackNotes;
window.rbi_exportFeedbackJson = rbi_exportFeedbackJson;
window.rbi_addRoadmapItem = rbi_addRoadmapItem;
window.rbi_deleteRoadmapItem = rbi_deleteRoadmapItem;

window.handleLogoUpload = handleLogoUpload;
window.removeBrandLogo = removeBrandLogo;
window.publishCorporateBranding = publishCorporateBranding;
window.resetToCorporateBranding = resetToCorporateBranding;
window.applyContractorAliasToInspectionHistory = applyContractorAliasToInspectionHistory;
window.openNodeAttachmentPdf = openNodeAttachmentPdf;
window.AppModeManager = AppModeManager;
window.changeAppMode = changeAppMode;
window.revertToPreviousMode = revertToPreviousMode;
window.togglePushSettings = togglePushSettings;
window.initPushToggleState = initPushToggleState;
window.purgeDataOutsideAssignedProjects = purgeDataOutsideAssignedProjects;
window.rbi_enrichDemoModeV2 = rbi_enrichDemoModeV2;
window.startDemoMode = startDemoMode;
window.exitDemoMode = exitDemoMode;

// Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
// (см. _ai/INDEX_HTML_HANDLERS_MAP.md), расширенный относительно ai.module.js#bindAiActionDelegation:
// поддерживает передачу самого DOM-элемента (`data-settings-action-val-type="element"`), динамическое
// чтение value/checked/parseInt(value,10) в момент события (`"value"`/`"checked"`/`"int"`),
// передачу объекта Event (`"event"`), а также последовательность из N вызовов на одном узле
// с разными ключами через `data-settings-action-key="k1,k2"` (общий аргумент применяется к каждому ключу).
// Capture-фаза + ручной резолвер — тот же паттерн, что в ai.module.js (обязателен для консистентности,
// см. _ai/ROADMAP.md), хотя ни один из 56 узлов группы `settings` не находится внутри
// stopPropagation-контейнера.
//
// НАМЕРЕННО отдельный атрибут `data-settings-action` (не `data-action`, используемый ai.module.js):
// найдено при реализации — резолвер ai.module.js#bindAiActionDelegation матчит ЛЮБОЙ элемент с
// `data-action` (не проверяет владельца/модуль) и всегда вызывает `window[action]()`/`window[action](arg)`
// без поддержки val-type/key — общий атрибут вызвал бы двойной вызов каждой функции (второй раз без
// аргументов) и реальные page error на каждом toggleSetting/saveSettings узле. Правка ai.module.js
// запрещена планом этого блока — устранено использованием отдельного namespace здесь. Зафиксировано
// как открытый вопрос архитектору в отчёте.
function bindSettingsActionDelegation() {
    if (window.__settingsActionDelegationBound) return;
    window.__settingsActionDelegationBound = true;

    const readArg = (el, valType, evt) => {
        switch (valType) {
            case 'element': return el;
            case 'event': return evt;
            case 'checked': return el.checked;
            case 'int': return parseInt(el.value, 10);
            case 'value': return el.value;
            default: return undefined;
        }
    };

    const dispatch = (el, evt) => {
        const action = el.dataset.settingsAction;
        const fn = window[action];
        if (typeof fn !== 'function') return;
        const valType = el.dataset.settingsActionValType;
        const arg = valType ? readArg(el, valType, evt) : el.dataset.actionArg;
        const keys = el.dataset.settingsActionKey;
        if (keys) {
            keys.split(',').forEach((key) => fn(key, arg));
        } else if (arg === undefined) {
            fn();
        } else {
            fn(arg);
        }
    };

    const resolveActionElement = (target, wantsChange) => {
        let el = target;
        while (el && el.nodeType === 1) {
            if (el.dataset && el.dataset.settingsAction) {
                if (!!(el.dataset.actionEvent === 'change') === wantsChange) return el;
            }
            const inlineOnclick = el.getAttribute && el.getAttribute('onclick');
            if (!wantsChange && inlineOnclick && inlineOnclick.includes('stopPropagation')) return null;
            el = el.parentElement;
        }
        return null;
    };

    document.addEventListener('click', (e) => {
        const el = resolveActionElement(e.target, false);
        if (el) dispatch(el, e);
    }, true);

    document.addEventListener('change', (e) => {
        const el = resolveActionElement(e.target, true);
        if (el) dispatch(el, e);
    }, true);
}

export const SettingsModule = {
    id: 'settings',
    routes: ['/settings'],
    dependencies: ['storage', 'settings'],

    _renderRequestedUnsubscribe: null,
    _settingsChangedBound: false,
    _contractorsChangedBound: false,
    _locationsChangedBound: false,
    ContractorDirectoryUI,
    LocationDirectoryUI,
    ContractorIdBackfillUI,
    ProjectIdBackfillUI,
    CloudDeletedPurgeUI,
    CloudOrphanUrlsUI,
    RoleMatrixUI,
    OfficialTemplatesUI,

    /**
     * Инициализация: подписка на события платформы.
     * Вызывается один раз при старте приложения.
     */
    async init(ctx) {
        ctx.math      = window.RBI && window.RBI.utils && window.RBI.utils.math;
        ctx.toast     = window.RBI && window.RBI.utils && window.RBI.utils.toast;
        ctx.templates = window.RBI && window.RBI.utils && window.RBI.utils.templates;
        ctx.settings  = window.RBI && window.RBI.services && window.RBI.services.settings;

        if (window.SettingsActions) { window.SettingsActions.bindCtx(ctx); }
        if (window.FeedbackShared) window.FeedbackShared.bindCtx(ctx);
        if (window.TutorialShared) window.TutorialShared.bindCtx(ctx);
        if (window.AppModeUtilsShared) window.AppModeUtilsShared.bindCtx(ctx);

        bindSettingsActionDelegation();

        // Загрузить настройки при старте
        const settingsSvc = ctx.settings;
        if (settingsSvc && typeof settingsSvc.load === 'function') {
            await settingsSvc.load();
        }

        // Справочник подрядчиков: перерисовка при изменении через сервис
        if (ctx && ctx.events && typeof ctx.events.on === 'function' && !SettingsModule._contractorsChangedBound) {
            SettingsModule._contractorsChangedBound = true;
            ctx.events.on('contractors:changed', () => {
                mountContractorDirectoryUI().catch(() => {});
            });
        }

        if (ctx && ctx.events && typeof ctx.events.on === 'function' && !SettingsModule._locationsChangedBound) {
            SettingsModule._locationsChangedBound = true;
            ctx.events.on('locations:changed', () => {
                mountLocationDirectoryUI().catch(() => {});
            });
        }

        // settings:changed нужен на всё приложение (тема с любой вкладки) —
        // once-guard, без unsubscribe в unmount.
        if (ctx && ctx.events && typeof ctx.events.on === 'function' && !SettingsModule._settingsChangedBound) {
            SettingsModule._settingsChangedBound = true;
            ctx.events.on('settings:changed', (payload) => {
                if (payload && (payload.key === 'theme' || payload.key === 'fontSize' || payload.key === 'navPosition')) {
                    if (typeof window.applySettingsToUI === 'function') {
                        window.applySettingsToUI();
                    }
                }
            });
        }

        // Подписаться на settings:renderRequested → перерисовать вкладку настроек
        if (ctx && ctx.events && typeof ctx.events.on === 'function') {
            const onRenderRequested = () => {
                if (typeof window.renderSettingsTab === 'function') window.renderSettingsTab();
            };
            ctx.events.on('settings:renderRequested', onRenderRequested);
            SettingsModule._renderRequestedUnsubscribe = () => ctx.events.off && ctx.events.off('settings:renderRequested', onRenderRequested);
        }

        console.log('[SettingsModule] init complete');
    },

    /**
     * Рендер UI настроек в переданный контейнер.
     * Пока делегирует в settings.legacy.js через window.*
     */
    mount(container, ctx) {
        if (typeof window.renderSettingsTab === 'function') {
            window.renderSettingsTab();
        } else {
            console.warn('[SettingsModule] renderSettingsTab не найдена');
        }
    },

    /**
     * Очистка при уходе с вкладки настроек.
     */
    unmount() {
        if (typeof SettingsModule._renderRequestedUnsubscribe === 'function') {
            SettingsModule._renderRequestedUnsubscribe();
            SettingsModule._renderRequestedUnsubscribe = null;
        }
    }
};

// Регистрация в реестре платформы (если RBI уже инициализирован)
if (typeof window !== 'undefined' && window.RBI && window.RBI.registry) {
    window.RBI.registry.register('module.settings', SettingsModule);
}

console.log('[SettingsModule] settings.module.js loaded (ES module)');
