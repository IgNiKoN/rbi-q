/**
 * app.entry.js
 * Единая точка инициализации модулей платформы RBI Quality Pro.
 *
 * Вызывается ПОСЛЕ initApp() из app.js — когда все сервисы уже загружены.
 * Не заменяет app.js. Работает параллельно с legacy-кодом.
 *
 * Паттерн:
 *   1. Получить ctx через RBI.createContext()
 *   2. Резолв allowlist (availableModules + бандлы + всегда settings)
 *   3. Вызвать loadModule/init только для разрешённых ключей (порядок MODULE_KEYS)
 *   4. Зарегистрировать себя как window.RBI.entry
 *
 * Platform runtime independence · столп A DoD (Фаза A + C): фильтр init;
 * static <script> business-модулей сняты; orphan feature-of / construction-v2 /
 * settings не входят в allowSet «голыми» из availableModules — только через
 * BUNDLES родителя или ALWAYS_INIT. knowledge — сквозной peer: бандл
 * quality и construction (+ можно knowledge-only в enabledModules).
 */
(function () {
    'use strict';

    var MODULE_KEYS = [
        'module.quality',
        'module.sk',
        'module.settings',
        'module.knowledge',
        'module.construction',
        'module.construction-v2',
        'module.game',
        'module.ai',
        'module.planfact',
        'module.company',
    ];

    /** Feature-of / сквозные бандлы: бизнес-id → дополнительные ключи init. */
    var BUNDLES = {
        quality: ['sk', 'knowledge', 'game', 'ai'],
        construction: ['construction-v2', 'knowledge']
    };

    /** Platform chrome — всегда в init, даже если нет в availableModules. */
    var ALWAYS_INIT = ['settings'];

    /**
     * Platform 2.0 модули (вне каталога компании Quality): init, если manifest.enabled !== false.
     * Выключатель — только флаг enabled в манифесте модуля.
     */
    var PLATFORM2_MODULES = ['planfact', 'company'];

    /**
     * Orphan feature-of / construction-v2 / settings — не peer business-id.
     * Голые id из availableModules игнорируются; попадание в allowSet только
     * через BUNDLES родителя или ALWAYS_INIT.
     * knowledge — peer (можно knowledge-only) и сквозной бандл Q/C.
     */
    var ORPHAN_DIRECT = {
        sk: true,
        game: true,
        ai: true,
        'construction-v2': true,
        settings: true
    };

    /** Извлекает id манифеста ('quality', 'sk', ...) из registry-ключа ('module.quality'). */
    function shortIdFromKey(key) {
        return key.replace(/^module\./, '');
    }

    /**
     * Бизнес-allowlist = enabledModules ∩ getAllowedModules(role).
     * Предпочтительно userContext; fallback — тот же расчёт через company + permissions.
     */
    function resolveAvailableModules(ctx) {
        try {
            if (ctx && ctx.userContext && typeof ctx.userContext.getUserContext === 'function') {
                var snap = ctx.userContext.getUserContext();
                if (snap && Array.isArray(snap.availableModules)) {
                    return snap.availableModules.slice();
                }
            }
        } catch (e) { /* fallback ниже */ }

        var services = window.RBI && window.RBI.services;
        var company = services && services.company;
        var permissions = services && services.permissions;
        var enabled = company && typeof company.getCompany === 'function'
            ? (company.getCompany().enabledModules || [])
            : [];
        var role = permissions && typeof permissions.getCurrentRole === 'function'
            ? permissions.getCurrentRole()
            : 'guest';
        var allowed = permissions && typeof permissions.getAllowedModules === 'function'
            ? permissions.getAllowedModules(role)
            : enabled.slice();
        return enabled.filter(function (m) {
            return allowed.indexOf(m) !== -1;
        });
    }

    /**
     * Expand availableModules + бандлы + ALWAYS_INIT → Set shortId.
     * Orphan/chrome id «голыми» не добавляются; порядок init — MODULE_KEYS.
     */
    function resolveInitShortIds(availableModules) {
        var allow = Object.create(null);
        var i, id, extras, j;

        for (i = 0; i < availableModules.length; i++) {
            id = availableModules[i];
            if (ORPHAN_DIRECT[id]) continue;
            allow[id] = true;
            extras = BUNDLES[id];
            if (extras) {
                for (j = 0; j < extras.length; j++) {
                    allow[extras[j]] = true;
                }
            }
        }
        for (i = 0; i < ALWAYS_INIT.length; i++) {
            allow[ALWAYS_INIT[i]] = true;
        }
        var loader = window.RBI && window.RBI.moduleLoader;
        for (i = 0; i < PLATFORM2_MODULES.length; i++) {
            var m = loader && typeof loader.getById === 'function' ? loader.getById(PLATFORM2_MODULES[i]) : null;
            if (m && m.enabled !== false) allow[PLATFORM2_MODULES[i]] = true;
        }
        return allow;
    }

    var initPromise = null;

    function initAllModules() {
        if (initPromise) {
            console.warn('[app.entry] init() уже выполнялся/выполняется — возвращаю существующий результат');
            return initPromise;
        }
        initPromise = runInit();
        return initPromise;
    }

    async function runInit() {
        if (!window.RBI) {
            console.error('[app.entry] RBI не инициализирован — app.entry.js загружен слишком рано');
            return;
        }

        // Фаза 54: гарантируем загрузку настроек до инициализации модулей
        if (window.RBI.services && window.RBI.services.settings &&
            typeof window.RBI.services.settings.load === 'function') {
            try { await window.RBI.services.settings.load(); } catch (e) { /* настройки загружаются и без этого через app.js */ }
        }

        var ctx = window.RBI.createContext();

        var availableModules = resolveAvailableModules(ctx);
        var allowSet = resolveInitShortIds(availableModules);
        var initedCount = 0;

        console.log('[app.entry] Инициализация модулей...', {
            availableModules: availableModules.slice(),
            allowSet: Object.keys(allowSet)
        });

        for (var i = 0; i < MODULE_KEYS.length; i++) {
            var key = MODULE_KEYS[i];
            var shortId = shortIdFromKey(key);

            if (!allowSet[shortId]) {
                console.warn('[app.entry] skip init ' + key + ' — вне allowlist (availableModules+бандлы+settings)');
                continue;
            }

            try {
                if (window.RBI.moduleLoader && typeof window.RBI.moduleLoader.loadModule === 'function') {
                    await window.RBI.moduleLoader.loadModule(shortId, ctx);
                } else {
                    // Деградация: module-loader.js ещё не готов — старый прямой путь через registry.
                    var mod = window.RBI.registry.get(key);
                    if (!mod) {
                        console.warn('[app.entry] Модуль не найден в реестре: ' + key);
                        continue;
                    }
                    if (typeof mod.init !== 'function') {
                        console.warn('[app.entry] У модуля нет метода init(): ' + key);
                        continue;
                    }
                    await mod.init(ctx);
                }
                initedCount++;
                console.log('[app.entry] \u2705 ' + key + ' \u2014 init() \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d');
            } catch (e) {
                console.error('[app.entry] \u274c \u041e\u0448\u0438\u0431\u043a\u0430 init() \u0434\u043b\u044f ' + key + ':', e);
            }
        }

        console.log('[app.entry] \u041c\u043e\u0434\u0443\u043b\u0438 \u0438\u043d\u0438\u0446\u0438\u0430\u043b\u0438\u0437\u0438\u0440\u043e\u0432\u0430\u043d\u044b: ' + initedCount + '/' + MODULE_KEYS.length);

        // SW Cache allowlist (столп A): shortIds → gate cache.put + purge чужих business-путей
        try {
            var allowMsg = { type: 'RBI_SW_ALLOWLIST', modules: Object.keys(allowSet) };
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage(allowMsg);
            } else if (navigator.serviceWorker) {
                navigator.serviceWorker.ready.then(function (reg) {
                    if (reg.active) reg.active.postMessage(allowMsg);
                });
            }
        } catch (eSw) {
            console.warn('[app.entry] SW allowlist post failed:', eSw);
        }

        // i18n: quality/settings markup mounts during module init (after bootstrap applyDom).
        // Re-apply + notify desk chrome so first paint is not stuck on RU fallbacks.
        try {
            var i18n = window.RBI.services && window.RBI.services.i18n;
            if (i18n && typeof i18n.applyDom === 'function') i18n.applyDom(document);
            if (window.RBI.events && typeof window.RBI.events.emit === 'function') {
                var loc = i18n && typeof i18n.getLocale === 'function' ? i18n.getLocale() : null;
                window.RBI.events.emit('i18n:localeChanged', { locale: loc });
            }
        } catch (eI18n) {
            console.warn('[app.entry] i18n post-modules apply failed:', eI18n);
        }

        try {
            if (window.RBI.services && window.RBI.services.shell &&
                typeof window.RBI.services.shell.renderUserBlock === 'function' &&
                ctx.userContext && typeof ctx.userContext.getUserContext === 'function') {
                window.RBI.services.shell.renderUserBlock(ctx.userContext.getUserContext());
            }
        } catch (e) {
            console.warn('[app.entry] \u043d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u0440\u0438\u0441\u043e\u0432\u0430\u0442\u044c renderUserBlock:', e);
        }

        if (window.RBI.events && typeof window.RBI.events.emit === 'function') {
            window.RBI.events.emit('platform:ready', { modules: initedCount });
        }
    }

    window.RBI = window.RBI || {};
    window.RBI.entry = {
        init: initAllModules
    };

    console.log('[app.entry] app.entry.js \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d. \u0412\u044b\u0437\u043e\u0432\u0438\u0442\u0435 window.RBI.entry.init() \u0434\u043b\u044f \u0441\u0442\u0430\u0440\u0442\u0430.');
}());
