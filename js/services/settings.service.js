/* Файл: js/services/settings.service.js */
/* Settings Service v1.0 — обёртка над window.appSettings + STORES.SETTINGS */

(function () {
    'use strict';

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    var SETTINGS_KEY = 'user_prefs';
    var ALLOWED_THEMES = [
        'auto', 'light', 'dark',
        'rbi-light', 'rbi-dark', 'rbi-auto',
        'rbi-light-v2', 'rbi-dark-v2', 'rbi-auto-v2',
        'rbi-light-v3', 'rbi-dark-v3', 'rbi-auto-v3'
    ];

    /* Владение appSettings (Реальная изоляция модулей, часть 3, Группа B):
       перенесено 1:1 из js/core/bootstrap.js — сервис теперь единственный
       владелец объявления, window.appSettings остаётся синхронизированной
       живой ссылкой (потребители мутируют её через appSettings.prop = x).
       DEFAULT_SETTINGS — единственный источник для reset / сверки UI-ключей. */
    var DEFAULT_SETTINGS = {
        userRole: 'engineer', // Локально по умолчанию работаем как инженер
        cloudStatus: 'offline', // offline / pending / approved / blocked
        assignedProjects: [], // Закрепленные объекты: canonical_key
        assignedContractor: '',
        brandColor: '#1c2b39', // Темно-синий RBI
        brandLogo: '', // Логотип (Base64)
        isBrandingCustomized: false,
        autoReportEnabled: false, // Фоновые отчеты
        autoReportDay: '1', // Число месяца
        autoReportType: 'global_onepager', // Тип отчета
        contractorName: '',
        theme: 'rbi-auto-v3',
        engineerName: '',
        defaultProject: '',
        fontSize: 'medium',
        /** Unix ms — когда локально меняли prefs (для push/pull профиля) */
        settingsUpdatedAt: 0,
        navPosition: 'auto',
        swipeEnabled: false,
        autoCollapseOk: false,
        /** Панели фильтров аналитики/истории: 'auto' (скролл) | 'manual' (только клик) */
        autoCollapseFilters: 'manual',
        /** Микровзаимодействия UI (hover/skeleton/toast spring); false = выкл */
        uiMotionEnabled: true,
        /** Жёсткая блокировка pull-to-refresh (Android): overscroll none + touch preventDefault */
        hardOverscrollLock: false,
        defaultGroupsCollapsed: false,
        fastMode: false,
        soundEnabled: true,
        autoSave: true,
        pushEnabled: false,
        aiEnabled: false,
        autoCacheCloudFiles: true, // автоматически сохранять облачные файлы в офлайн-кэш после синхронизации
        // RBI NEW: адаптивное управление файловым кэшем
        storageMode: 'adaptive',

        storageAutoCleanupEnabled: true,
        storageSilentCleanupEnabled: true,

        storageKeepAllIfFreeMB: 2048,
        storageSoftCleanupFreeMB: 1000,
        storageNormalCleanupFreeMB: 500,
        storageCriticalCleanupFreeMB: 250,

        storageSoftThresholdPercent: 60,
        storageCleanupThresholdPercent: 80,
        storageCriticalThresholdPercent: 90,

        storageInspectionPhotoTtlDays: 60,
        storageKnowledgeFileTtlDays: 45,
        storageReportTtlDays: 30,
        storageTwiTtlDays: 90,
        storageNodeTtlDays: 90,
        storagePracticeTtlDays: 60,
        storageDocTtlDays: 60,

        storageCleanupOnlyCloudBackedFiles: true,
        storageLastCleanupAt: null,
        storagePersistentRequestedAt: null,
        storagePersistentGranted: false,
        aiAuthMode: 'role', // 'role', 'corporate', 'personal'
        aiCorpPwd: '',
        aiAuto: false,
        apiKey: '',
        usePersonalKey: false,
        dashboardMode: 'compact',
        // Legacy (fallback) + раздельные режимы по вкладкам: 'cards' | 'list'
        knowledgeViewMode: 'cards',
        knowledgeViewModeTwi: 'cards',
        knowledgeViewModeDocs: 'cards',
        knowledgeViewModeNodes: 'cards',
        knowledgeViewModePractices: 'cards',
        knowledgeViewModeReports: 'cards',
        knowledgeViewModeMeetings: 'cards',
        knowledgeViewModeFmea: 'cards',
        anaEngPareto: true,
        anaOpTrend: true,
        anaOpLeader: true,
        anaEngAi: true,
        anaEngPhotos: true,
        anaOpTopDefects: true,
        autoBackupEnabled: false,
        autoBackupDay: '5', // 5 - Пятница
        autoBackupShare: false,
        autoManagerEnabled: false,
        autoManagerDay: '5', // 5 - Пятница
        taskMeetingDay: '1',      // Понедельник
        taskFmeaDay: '5',         // Пятница
        taskMonthReportDay: '1',  // 1-е число месяца
        /** §37.2 Block 3: null = нет оверрайда → company default ['quality','construction','knowledge'] */
        enabledModules: null
    };
    var _appSettings = Object.assign({}, DEFAULT_SETTINGS);
    window.appSettings = _appSettings;

    var _listeners = [];

    function _getSettings() {
        return window.appSettings || {};
    }

    function _notifyListeners(key, value) {
        var payload = { key: key, value: value, all: _getSettings() };

        // Уведомление через EventBus (если доступен)
        if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') {
            window.RBI.events.emit('settings:changed', payload);
        }

        // Уведомление прямых подписчиков (для случаев до инициализации EventBus)
        for (var i = 0; i < _listeners.length; i++) {
            try { _listeners[i](payload); } catch (e) { /* ignore */ }
        }
    }

    window.RBI.services.settings = {

        /**
         * Получить значение одной настройки.
         */
        get: function (key) {
            var v = _getSettings()[key];
            // P2-0031: «ИИ-помощник» выключен у компании (вход по почте, «Админ платформы») — ИИ ведёт себя как выключенный
            if (key === 'aiEnabled' && v) {
                var sh = window.RBI && window.RBI.services && window.RBI.services.shell;
                if (sh && typeof sh.legacyModuleAllowed === 'function' && !sh.legacyModuleAllowed('ai')) return false;
            }
            return v;
        },

        /**
         * Получить копию всех настроек.
         */
        getAll: function () {
            return Object.assign({}, _getSettings());
        },

        /**
         * Копия заводских UI/prefs (для reset). Не включает runtime-мутации.
         */
        getDefaults: function () {
            return Object.assign({}, DEFAULT_SETTINGS);
        },

        /**
         * Установить значение настройки и сохранить в IndexedDB.
         * Не блокирует: сохранение асинхронное.
         */
        set: async function (key, value) {
            if (!window.appSettings) {
                console.warn('[RBI.settings] appSettings не инициализирован');
                return false;
            }

            if (key === 'theme') {
                value = ALLOWED_THEMES.includes(value) ? value : 'rbi-auto-v3';
                try { localStorage.setItem('rbi_theme_preference', value); } catch (e) { /* ignore */ }
            }

            window.appSettings[key] = value;

            // Метка свежести UI-prefs для sync профиля (не рекурсивно)
            if (key !== 'settingsUpdatedAt') {
                window.appSettings.settingsUpdatedAt = Date.now();
            }

            try {
                var data = Object.assign({ key: SETTINGS_KEY }, window.appSettings);
                if (typeof dbPut === 'function') {
                    await dbPut(window.STORES ? window.STORES.SETTINGS : 'settings', data);
                }
            } catch (e) {
                console.error('[RBI.settings] Ошибка сохранения', e);
            }

            _notifyListeners(key, value);
            return true;
        },

        /**
         * Загрузить настройки из IndexedDB в window.appSettings.
         * Делегирует в window.loadSettings (из settings.legacy.js) если она доступна.
         */
        load: async function () {
            if (typeof window.loadSettings === 'function') {
                await window.loadSettings();
                return true;
            }

            // Fallback: загрузка напрямую
            try {
                var storeName = window.STORES ? window.STORES.SETTINGS : 'settings';
                var data = await dbGet(storeName, SETTINGS_KEY);
                if (data && window.appSettings) {
                    Object.assign(window.appSettings, data);
                }
            } catch (e) {
                console.error('[RBI.settings] Ошибка загрузки', e);
            }
            return true;
        },

        /**
         * Сбросить настройки к значениям по умолчанию.
         * Делегирует в window.resetSettingsToDefault (из settings.legacy.js).
         */
        reset: function () {
            if (typeof window.resetSettingsToDefault === 'function') {
                window.resetSettingsToDefault();
            } else {
                console.warn('[RBI.settings] resetSettingsToDefault недоступна');
            }
        },

        /**
         * Подписаться на изменение любой настройки.
         * callback(payload) где payload = { key, value, all }
         */
        onChange: function (callback) {
            if (typeof callback === 'function') {
                _listeners.push(callback);
            }
        },

        /**
         * Отписаться от изменений.
         */
        offChange: function (callback) {
            _listeners = _listeners.filter(function (fn) { return fn !== callback; });
        },

        /**
         * Проверить, включён ли режим синхронизации с облаком.
         */
        isSyncEnabled: function () {
            return !!(window.appSettings && window.appSettings.cloudStatus === 'online');
        },

        /**
         * Получить текущую тему (с учётом auto / rbi-auto / rbi-auto-v2 / rbi-auto-v3).
         */
        getResolvedTheme: function () {
            var theme = (window.appSettings && window.appSettings.theme) || 'rbi-auto-v3';
            var prefersDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
            if (theme === 'auto') return prefersDark ? 'dark' : 'light';
            if (theme === 'rbi-auto') return prefersDark ? 'rbi-dark' : 'rbi-light';
            if (theme === 'rbi-auto-v2') return prefersDark ? 'rbi-dark-v2' : 'rbi-light-v2';
            if (theme === 'rbi-auto-v3') return prefersDark ? 'rbi-dark-v3' : 'rbi-light-v3';
            return theme;
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.settings', window.RBI.services.settings);
    }

    console.log('[RBI Service] settings loaded');
}());
