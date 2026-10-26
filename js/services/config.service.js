/* Файл: js/services/config.service.js */
/* Config Service v0.1 — платформенный доступ к window.APP_CONFIG (перенесён из js/config.js) */

/* Конфигурация Platform 2.0. P2-0016 (ADR-068): переключатель сборки «разработка / выпуск» P2-0013 убран —
   старое приложение РБИ (вход по PIN, боевые таблицы) живёт отдельно; здесь облако старого Quality всегда выключено,
   Качество и Стройконтроль работают при входе почтой через хранилище компании (src/platform/auth/quality-bridge.ts).
   Файл читают и страница, и кэш приложения (sw.js, importScripts) — поэтому без import/export и без обращения к window вне проверки. */
(function (root) {
    root.APP_CONFIG = {
        /* Platform 2.0 (P2-0004): вход и данные. Публичный anon-ключ (виден в браузере по своей природе); права проверяет сервер (RLS). */
        P2_SUPABASE_URL: 'https://api.rbi-q.ru',
        P2_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc3NTA3MjAwLCJleHAiOjE5MzUyNzM2MDB9.f2s_pInfJu74ptaavpJx7J3I6Arwavcjnkzl1z39wPk',
        CLOUD_DISABLED_MESSAGE: 'Войдите почтой — Качество синхронизируется с хранилищем вашей компании',
        LOCAL_DB_NAME: 'PLATFORM2_DB',
        SW_CACHE_PREFIX: 'platform2-'
    };
    /* Облако старого Quality (вход по PIN) — нет: запись в боевые таблицы РБИ из Платформы 2.0 невозможна. */
    root.APP_CONFIG.SUPABASE_URL = '';
    root.APP_CONFIG.SUPABASE_KEY = '';
}(typeof window !== 'undefined' ? window : self));

(function () {
    'use strict';
    if (typeof window === 'undefined') return;   // кэш приложения читает только APP_CONFIG

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    window.RBI.services.config = {

        getSupabaseUrl: function () {
            return window.APP_CONFIG.SUPABASE_URL;
        },

        getSupabaseKey: function () {
            return window.APP_CONFIG.SUPABASE_KEY;
        },

        isCloudEnabled: function () {
            return !!(window.APP_CONFIG.SUPABASE_URL && window.APP_CONFIG.SUPABASE_KEY);
        },

        getCloudDisabledMessage: function () {
            return window.APP_CONFIG.CLOUD_DISABLED_MESSAGE;
        },

        getConfig: function () {
            return window.APP_CONFIG;
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.config', window.RBI.services.config);
    }

    console.log('[RBI Service] config loaded');
}());
