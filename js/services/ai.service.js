/* Файл: js/services/ai.service.js */
/* AI Service v0.1 — единая точка доступа к AI для всех модулей платформы */
/* Обёртка над window.callAI из ai.js. Обращение к window.callAI — ленивое. */

(function () {
    'use strict';

    if (typeof window === 'undefined') return;

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    /* Ленивый passthrough-мост к именованной AI-функции window[name] (owner: ai.actions.js и др.) */
    function bridge(name) {
        return function () {
            if (typeof window[name] !== 'function') {
                console.warn('[RBI AI Service] window.' + name + ' недоступен');
                return;
            }
            return window[name].apply(window, arguments);
        };
    }

    var BRIDGED_NAMES = [
        'generatePulseAi',
        'generateHeatmapAi',
        'generateOnePagerForecastAi',
        'rbi_generateGlobalAi',
        'generateContractorForecastAi',
        'generateCultureAi',
        'generatePrescriptionAi',
        'rbi_generateMeetingMemo',
        'rbi_generateWorkshop',
        'rbi_fillFmeaWithAi',
        'gameGenerateContractorSynonymsAI',
        'gameAddContractorAliasInline',
        'generateAiTutorAdvice',
        'generateTaskRiskAi',
        'sk_aiMapColumns',
        'sk_generateContractorAiSummary',
        'sk_autoMapCategories',
        'rbi_normalizeFeedbackAi',
        'extractTextFromPdf'
    ];

    window.RBI.services.ai = {

        /* Основной вызов — делегирует в window.callAI (ленивая ссылка) */
        call: function (messages, options) {
            if (typeof window.callAI !== 'function') {
                console.warn('[RBI AI Service] window.callAI недоступен');
                return Promise.reject(new Error('callAI не найден'));
            }
            return window.callAI(messages, options);
        },

        /* Активен ли AI в настройках приложения (P2-0031: через settings.get — учитывает выключенный у компании модуль «ИИ-помощник») */
        isEnabled: function () {
            var svc = window.RBI && window.RBI.services && window.RBI.services.settings;
            if (svc && typeof svc.get === 'function') return !!svc.get('aiEnabled');
            return (window.appSettings && window.appSettings.aiEnabled) || false;
        },

        /* Режим аутентификации AI ('corporate' по умолчанию) */
        getAuthMode: function () {
            return (window.appSettings && window.appSettings.aiAuthMode) || 'corporate';
        },

        /* Доступен ли window.callAI в данный момент */
        isAvailable: function () {
            return typeof window.callAI === 'function';
        }
    };

    BRIDGED_NAMES.forEach(function (name) {
        window.RBI.services.ai[name] = bridge(name);
    });

    if (window.RBI.registry) {
        window.RBI.registry.register('service.ai', window.RBI.services.ai);
    }

    console.log('[RBI Service] ai loaded');
}());
